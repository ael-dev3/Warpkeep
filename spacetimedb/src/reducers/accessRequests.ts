import { SenderError, t } from 'spacetimedb/server';

import {
  InvalidAdmissionEpochStateError,
  resolveAuthResolverAdmission,
  type AuthResolverAdmission,
} from '../admissionPolicy';
import {
  ACCESS_REQUEST_QUEUE_CAPACITY,
  accessRequestQueueAcceptsSubmission,
  takeBoundedAccessRequestRows,
} from '../accessRequestPolicy';
import {
  requireAccessRequestResolver,
  requireAdmin,
  requireSupportedFid,
} from '../auth';
import { MAX_AUTH_EPOCH, MAX_SUPPORTED_FID } from '../config';
import { assertGenesisFounderForFid } from '../foundingAuthority';
import { assertGenesisResourceForFid } from '../resourceAuthority';
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
  requestState: t.string(),
});

const adminAccessRequestPageV1 = t.object('AdminAccessRequestPageV1', {
  entries: t.array(adminAccessRequestEntryV1),
  nextRequestedAtMicros: t.option(t.u64()),
  nextFid: t.option(t.u64()),
  hasMore: t.bool(),
  totalRequests: t.u64(),
  pendingRequests: t.u64(),
});

const adminAccessRequestResetStatusV1 = t.object('AdminAccessRequestResetStatusV1', {
  admissionState: t.string(),
  authEpoch: t.u32(),
  requestState: t.string(),
  requestCycle: t.option(t.u64()),
  requestedAtMicros: t.option(t.u64()),
});

const adminAccessRequestAdmissionStatusV1 = t.object(
  'AdminAccessRequestAdmissionStatusV1',
  {
    admissionState: t.string(),
    authEpoch: t.u32(),
    requestState: t.string(),
    requestCycle: t.option(t.u64()),
    requestedAtMicros: t.option(t.u64()),
  },
);

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

type AllowedFidRow = Parameters<typeof resolveAuthResolverAdmission>[0];

/**
 * Missing identities use cycle zero. A disabled founder uses one beyond the
 * current auth epoch, so the request made before their original admission
 * cannot silently become the request for a later revocation. The u32 epoch
 * plus one is intentionally stored as u64 so its terminal value is valid.
 */
function requestCycleForAdmission(
  allowed: AllowedFidRow,
  state: AdmissionState,
): bigint | undefined {
  if (state === 'enabled') return undefined;
  if (state === 'missing') return 0n;
  if (allowed === null || allowed.enabled || allowed.authEpoch < 0) {
    throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
  }
  return BigInt(allowed.authEpoch) + 1n;
}

function statusForRow(
  row: Readonly<{
    requestCycle: bigint;
    requestedAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
  }> | null,
  requestCycle: bigint,
) {
  return row === null || row.requestCycle !== requestCycle
    ? {
      status: 'not_requested',
      requestedAtMicros: undefined,
    }
    : {
      status: 'requested',
      requestedAtMicros: requestedAtMicros(row),
    };
}

function cleanResetNote(note: string): string {
  const clean = note.trim();
  if (clean.length < 1 || clean.length > 512) {
    throw new SenderError('ACCESS_REQUEST_RESET_NOTE_INVALID');
  }
  return clean;
}

function requireFounderAuthEpoch(authEpoch: number): void {
  if (!Number.isInteger(authEpoch) || authEpoch < 1 || authEpoch >= MAX_AUTH_EPOCH) {
    throw new SenderError('ACCESS_REQUEST_RESET_AUTH_EPOCH_INVALID');
  }
}

function adminResetStatus(
  tx: Parameters<typeof requireAdmin>[0],
  fid: bigint,
) {
  const allowed = tx.db.allowedFid.fid.find(fid);
  if (allowed === null) throw new SenderError('FID_NOT_FOUND');
  requireFounderAuthEpoch(allowed.authEpoch);
  assertGenesisFounderForFid(tx, fid);
  assertGenesisResourceForFid(tx, fid);

  const admissionState = resolveAdmissionState(allowed);
  const request = tx.db.accessRequestV1.fid.find(fid);
  const requestCycle = requestCycleForAdmission(allowed, admissionState);
  const requestState = request === null
    ? 'not_requested'
    : requestCycle !== undefined && request.requestCycle === requestCycle
      ? 'pending'
      : 'resolved';
  return {
    admissionState,
    authEpoch: allowed.authEpoch,
    requestState,
    requestCycle: request?.requestCycle,
    requestedAtMicros: request === null ? undefined : requestedAtMicros(request),
  };
}

/**
 * Exact read-only admission/request view used by Hermes to prepare a request-
 * CAS transition. The module does not observe notification delivery. Missing
 * identities use epoch and cycle zero; existing identities retain their private
 * auth epoch. Impossible future request cycles fail closed.
 */
function adminAdmissionStatus(
  tx: Parameters<typeof requireAdmin>[0],
  fid: bigint,
) {
  const allowed = tx.db.allowedFid.fid.find(fid);
  const admissionState = resolveAdmissionState(allowed);
  let authEpoch = 0;
  if (allowed !== null) {
    if (
      !Number.isInteger(allowed.authEpoch)
      || allowed.authEpoch < 1
      || allowed.authEpoch > MAX_AUTH_EPOCH
    ) {
      throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
    }
    authEpoch = allowed.authEpoch;
    assertGenesisFounderForFid(tx, fid);
    assertGenesisResourceForFid(tx, fid);
  }

  const request = tx.db.accessRequestV1.fid.find(fid);
  const currentRequestCycle = requestCycleForAdmission(allowed, admissionState);
  const maximumStoredRequestCycle = admissionState === 'disabled'
    ? BigInt(authEpoch) + 1n
    : BigInt(authEpoch);
  if (
    request !== null
    && (
      (allowed === null && request.requestCycle !== 0n)
      || (
        allowed !== null
        && request.requestCycle > maximumStoredRequestCycle
      )
    )
  ) {
    throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
  }
  const requestState = request === null
    ? 'not_requested'
    : currentRequestCycle !== undefined
      && request.requestCycle === currentRequestCycle
      ? 'pending'
      : 'resolved';
  return {
    admissionState,
    authEpoch,
    requestState,
    requestCycle: request?.requestCycle,
    requestedAtMicros: request === null ? undefined : requestedAtMicros(request),
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
      const { requestFid } = requireAccessRequestResolver(tx, 'status');
      const allowed = tx.db.allowedFid.fid.find(requestFid);
      const admission = resolveAdmissionState(allowed);
      if (admission === 'enabled') {
        return {
          status: 'already_admitted',
          requestedAtMicros: undefined,
        };
      }
      const requestCycle = requestCycleForAdmission(allowed, admission);
      if (requestCycle === undefined) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }
      return statusForRow(tx.db.accessRequestV1.fid.find(requestFid), requestCycle);
    }),
);

/**
 * Atomic, cycle-idempotent request submission. Duplicate calls in one
 * admission era preserve the first database timestamp. A later revocation
 * rotates the server-derived cycle and receives a fresh database timestamp.
 */
export const accessRequestSubmitV1 = warpkeep.procedure(
  { name: 'access_request_submit_v1' },
  accessRequestStatusV1,
  ctx =>
    ctx.withTx(tx => {
      const { requestFid } = requireAccessRequestResolver(tx, 'submit');
      const allowed = tx.db.allowedFid.fid.find(requestFid);
      const admission = resolveAdmissionState(allowed);
      if (admission === 'enabled') {
        return {
          status: 'already_admitted',
          requestedAtMicros: undefined,
        };
      }

      const requestCycle = requestCycleForAdmission(allowed, admission);
      if (requestCycle === undefined) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }
      let request = tx.db.accessRequestV1.fid.find(requestFid);
      const requestCount = tx.db.accessRequestV1.count();
      if (!accessRequestQueueAcceptsSubmission(requestCount, request !== null)) {
        throw new SenderError('ACCESS_REQUEST_QUEUE_FULL');
      }
      if (request === null) {
        tx.db.accessRequestV1.insert({
          fid: requestFid,
          requestCycle,
          requestedAt: tx.timestamp,
        });
        request = tx.db.accessRequestV1.fid.find(requestFid);
      } else if (request.requestCycle !== requestCycle) {
        tx.db.accessRequestV1.fid.update({
          ...request,
          requestCycle,
          requestedAt: tx.timestamp,
        });
        request = tx.db.accessRequestV1.fid.find(requestFid);
      }
      if (request === null) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }
      return statusForRow(request, requestCycle);
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

      const totalRequests = tx.db.accessRequestV1.count();
      if (totalRequests > BigInt(ACCESS_REQUEST_QUEUE_CAPACITY)) {
        throw new SenderError('ACCESS_REQUEST_QUEUE_CAPACITY');
      }
      const boundedRows = takeBoundedAccessRequestRows(
        tx.db.accessRequestV1.iter(),
      );
      if (
        boundedRows.overflow
        || BigInt(boundedRows.rows.length) !== totalRequests
      ) {
        throw new SenderError('ACCESS_REQUEST_STATE_INTEGRITY');
      }
      const rows = boundedRows.rows;

      let pendingRequests = 0n;
      const visible = rows.flatMap(row => {
        requireStoredFid(row.fid);
        const micros = requestedAtMicros(row);
        const allowed = tx.db.allowedFid.fid.find(row.fid);
        const admissionState = resolveAdmissionState(allowed);
        const requestCycle = requestCycleForAdmission(allowed, admissionState);
        const requestState = requestCycle !== undefined && row.requestCycle === requestCycle
          ? 'pending'
          : 'resolved';
        if (requestState === 'pending') pendingRequests += 1n;
        if (!includeResolved && requestState !== 'pending') return [];
        return [{
          fid: row.fid,
          requestedAtMicros: micros,
          admissionState,
          requestState,
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
        totalRequests,
        pendingRequests,
      };
    }),
);

/**
 * Admin-only exact state for one request-CAS admission decision. The product
 * contains no profile, note, notification credential, or external identity.
 */
export const adminGetAccessRequestAdmissionStatusV1 = warpkeep.procedure(
  { name: 'admin_get_access_request_admission_status_v1' },
  { fid: t.u64() },
  adminAccessRequestAdmissionStatusV1,
  (ctx, { fid }) =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      requireSupportedFid(fid);
      return adminAdmissionStatus(tx, fid);
    }),
);

/**
 * Exact admin-private pre/post view for the bounded founder reset operator.
 * It returns only authority state and the request tuple needed for CAS; no
 * profile, external identity, token, note, or application payload is exposed.
 */
export const adminGetAccessRequestResetStatusV1 = warpkeep.procedure(
  { name: 'admin_get_access_request_reset_status_v1' },
  { fid: t.u64() },
  adminAccessRequestResetStatusV1,
  (ctx, { fid }) =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      requireSupportedFid(fid);
      return adminResetStatus(tx, fid);
    }),
);

/**
 * Owner-only reset for one already-founded player. The transaction revokes
 * admission and removes only that FID's current request row. The permanent
 * founder and resource graphs are verified before and after. Ownership, Terms,
 * economy, and worker tables are preserved by the reducer's strict mutation
 * allowlist and are covered by the connected private-row-digest rehearsal.
 *
 * The expected epoch and request tuple are compare-and-swap guards against
 * stale operator state. A committed application deletion is retry-safe because
 * this reducer is the sole delete site; an enabled/no-application revocation
 * remains fail-closed because its post-state is otherwise ambiguous.
 */
export const adminResetAccessRequestV1 = warpkeep.reducer(
  { name: 'admin_reset_access_request_v1' },
  {
    fid: t.u64(),
    expectedEnabled: t.bool(),
    expectedAuthEpoch: t.u32(),
    expectedRequestCycle: t.option(t.u64()),
    expectedRequestedAtMicros: t.option(t.u64()),
    note: t.string(),
  },
  (ctx, {
    fid,
    expectedEnabled,
    expectedAuthEpoch,
    expectedRequestCycle,
    expectedRequestedAtMicros,
    note,
  }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanResetNote(note);
    if (
      (expectedRequestCycle === undefined)
      !== (expectedRequestedAtMicros === undefined)
    ) {
      throw new SenderError('ACCESS_REQUEST_RESET_CAS_INVALID');
    }
    const existing = ctx.db.allowedFid.fid.find(fid);
    if (existing === null) throw new SenderError('FID_NOT_FOUND');
    requireFounderAuthEpoch(existing.authEpoch);
    if (existing.authEpoch !== expectedAuthEpoch) {
      throw new SenderError('AUTH_EPOCH_MISMATCH');
    }

    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    const request = ctx.db.accessRequestV1.fid.find(fid);
    const exactCommittedRequestDeletionRetry = !existing.enabled
      && request === null
      && expectedRequestCycle !== undefined;
    if (
      !exactCommittedRequestDeletionRetry
      && existing.enabled !== expectedEnabled
    ) {
      throw new SenderError('ACCESS_REQUEST_RESET_CAS_MISMATCH');
    }
    if (request === null) {
      if (expectedRequestCycle !== undefined && !exactCommittedRequestDeletionRetry) {
        throw new SenderError('ACCESS_REQUEST_RESET_CAS_MISMATCH');
      }
    } else if (
      expectedRequestCycle === undefined
      || expectedRequestedAtMicros === undefined
      || request.requestCycle !== expectedRequestCycle
      || requestedAtMicros(request) !== expectedRequestedAtMicros
    ) {
      throw new SenderError('ACCESS_REQUEST_RESET_CAS_MISMATCH');
    }
    if (exactCommittedRequestDeletionRetry || (!expectedEnabled && request === null)) return;

    if (existing.enabled) {
      ctx.db.allowedFid.fid.update({
        ...existing,
        enabled: false,
        note: cleanNote,
      });
    }
    if (request !== null) ctx.db.accessRequestV1.fid.delete(fid);

    const verified = ctx.db.allowedFid.fid.find(fid);
    if (
      verified === null
      || verified.enabled
      || verified.authEpoch !== expectedAuthEpoch
      || ctx.db.accessRequestV1.fid.find(fid) !== null
    ) {
      throw new SenderError('ACCESS_REQUEST_RESET_INTEGRITY');
    }
    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'reset_access_request_v1',
      targetFid: fid,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: cleanNote,
    });
  },
);
