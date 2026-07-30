import { SenderError, t } from 'spacetimedb/server';

import {
  InvalidAdmissionEpochStateError,
  resolveAuthResolverAdmission,
  type AuthResolverAdmission,
} from '../admissionPolicy';
import { requireAccessRequestResolver, requireAdmin } from '../auth';
import { MAX_SUPPORTED_FID } from '../config';
import warpkeep from '../schema';

const MAX_ACCESS_REQUEST_PAGE_SIZE = 100;
const U64_MAXIMUM = (1n << 64n) - 1n;

const accessRequestStatusV1 = t.object('AccessRequestStatusV1', {
  status: t.string(),
  requestedAtMicros: t.option(t.u64()),
});

const adminAccessRequestEntryV1 = t.object('AdminAccessRequestEntryV1', {
  fid: t.u64(),
  requestedAtMicros: t.u64(),
  admissionState: t.string(),
});

const adminAccessRequestPageV1 = t.object('AdminAccessRequestPageV1', {
  entries: t.array(adminAccessRequestEntryV1),
  nextRequestedAtMicros: t.option(t.u64()),
  nextFid: t.option(t.u64()),
  hasMore: t.bool(),
  totalRequests: t.u64(),
  pendingRequests: t.u64(),
});

type AdmissionState = AuthResolverAdmission['state'];

function resolveAdmissionState(
  allowed: Parameters<typeof resolveAuthResolverAdmission>[0],
): AdmissionState {
  try {
    return resolveAuthResolverAdmission(allowed).state;
  } catch (error) {
    if (error instanceof InvalidAdmissionEpochStateError) {
      throw new SenderError(error.message);
    }
    throw error;
  }
}

function requireStoredFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
  }
}

function requestedAtMicros(
  row: Readonly<{ requestedAt: Readonly<{ microsSinceUnixEpoch: bigint }> }>,
): bigint {
  const micros = row.requestedAt.microsSinceUnixEpoch;
  if (micros <= 0n || micros > U64_MAXIMUM) {
    throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
  }
  return micros;
}

function requireEligibleAdmission(state: AdmissionState): void {
  if (state === 'disabled') {
    throw new SenderError('ACCESS_REQUEST_NOT_ELIGIBLE');
  }
}

function statusForRow(
  row: Readonly<{ requestedAt: Readonly<{ microsSinceUnixEpoch: bigint }> }> | null,
) {
  return row === null
    ? {
      status: 'not_requested',
      requestedAtMicros: undefined,
    }
    : {
      status: 'requested',
      requestedAtMicros: requestedAtMicros(row),
    };
}

/**
 * Caller-private status. The sole FID comes from the bridge-issued resolver
 * token; there is deliberately no browser-controlled FID argument.
 */
export const accessRequestGetStatusV1 = warpkeep.procedure(
  { name: 'access_request_get_status_v1' },
  accessRequestStatusV1,
  ctx =>
    ctx.withTx(tx => {
      const { requestFid } = requireAccessRequestResolver(tx);
      const admission = resolveAdmissionState(tx.db.allowedFid.fid.find(requestFid));
      requireEligibleAdmission(admission);
      if (admission === 'enabled') {
        return {
          status: 'already_admitted',
          requestedAtMicros: undefined,
        };
      }
      return statusForRow(tx.db.accessRequestV1.fid.find(requestFid));
    }),
);

/**
 * Atomic, idempotent request submission. The FID primary key is the natural
 * idempotency key and duplicate calls preserve the first database timestamp.
 */
export const accessRequestSubmitV1 = warpkeep.procedure(
  { name: 'access_request_submit_v1' },
  accessRequestStatusV1,
  ctx =>
    ctx.withTx(tx => {
      const { requestFid } = requireAccessRequestResolver(tx);
      const admission = resolveAdmissionState(tx.db.allowedFid.fid.find(requestFid));
      requireEligibleAdmission(admission);
      if (admission === 'enabled') {
        return {
          status: 'already_admitted',
          requestedAtMicros: undefined,
        };
      }

      let request = tx.db.accessRequestV1.fid.find(requestFid);
      if (request === null) {
        tx.db.accessRequestV1.insert({
          fid: requestFid,
          requestedAt: tx.timestamp,
        });
        request = tx.db.accessRequestV1.fid.find(requestFid);
      }
      if (request === null) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }
      return statusForRow(request);
    }),
);

/**
 * Bounded, deterministic Hermes-only inspection. Admission is derived from
 * `allowed_fid`; listing never edits either the request or admission record.
 */
export const adminListAccessRequestsV1 = warpkeep.procedure(
  { name: 'admin_list_access_requests_v1' },
  {
    afterRequestedAtMicros: t.u64(),
    afterFid: t.u64(),
    limit: t.u32(),
    includeResolved: t.bool(),
  },
  adminAccessRequestPageV1,
  (ctx, {
    afterRequestedAtMicros,
    afterFid,
    limit,
    includeResolved,
  }) =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      if (
        !Number.isInteger(limit)
        || limit < 1
        || limit > MAX_ACCESS_REQUEST_PAGE_SIZE
      ) {
        throw new SenderError('ACCESS_REQUEST_PAGE_LIMIT');
      }
      const firstPage = afterRequestedAtMicros === 0n && afterFid === 0n;
      if (
        !firstPage
        && (
          afterRequestedAtMicros === 0n
          || afterFid <= 0n
          || afterFid > MAX_SUPPORTED_FID
        )
      ) {
        throw new SenderError('ACCESS_REQUEST_CURSOR_INVALID');
      }

      const rows = [...tx.db.accessRequestV1.iter()];
      if (BigInt(rows.length) !== tx.db.accessRequestV1.count()) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }

      let pendingRequests = 0n;
      const visible = rows.flatMap(row => {
        requireStoredFid(row.fid);
        const micros = requestedAtMicros(row);
        const admissionState = resolveAdmissionState(tx.db.allowedFid.fid.find(row.fid));
        if (admissionState === 'missing') pendingRequests += 1n;
        if (!includeResolved && admissionState !== 'missing') return [];
        return [{
          fid: row.fid,
          requestedAtMicros: micros,
          admissionState,
        }];
      });

      visible.sort((left, right) => (
        left.requestedAtMicros < right.requestedAtMicros
          ? -1
          : left.requestedAtMicros > right.requestedAtMicros
            ? 1
            : left.fid < right.fid
              ? -1
              : left.fid > right.fid
                ? 1
                : 0
      ));

      const remaining = visible.filter(entry => (
        firstPage
        || entry.requestedAtMicros > afterRequestedAtMicros
        || (
          entry.requestedAtMicros === afterRequestedAtMicros
          && entry.fid > afterFid
        )
      ));
      const entries = remaining.slice(0, limit);
      const hasMore = remaining.length > entries.length;
      const next = hasMore ? entries[entries.length - 1] : undefined;

      return {
        entries,
        nextRequestedAtMicros: next?.requestedAtMicros,
        nextFid: next?.fid,
        hasMore,
        totalRequests: BigInt(rows.length),
        pendingRequests,
      };
    }),
);
