import { createHash } from 'node:crypto';

export const PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_PROFILE =
  'warpkeep-production-player-canary-baseline-reconciliation-v1';

const SERVER_BASELINE_PROFILE =
  'warpkeep-production-player-canary-server-baseline-v1';
const SHA256 = /^[0-9a-f]{64}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const STATUS_KEYS = Object.freeze([
  'profile', 'challengeDigest', 'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment', 'capturedAtMicros', 'baselineCaptured',
  'directTierOneFounder', 'normalRequestAdmission', 'pristineWorkerCount',
  'terminalGraphEmpty', 'pristineResourceAccount',
]);
const ARGUMENT_KEYS = Object.freeze([
  'fid', 'reviewedAdmissionPlanDigest', 'evidenceNonce',
]);
const INPUT_KEYS = Object.freeze([
  'adminSecret', 'arguments', 'assertCanStartWrite',
  'expectedServerBaselineCommitment',
]);
const reconciliationBrand = new WeakSet();

export class ProductionPlayerCanaryBaselineReconciliationError extends Error {
  constructor(code, disposition = 'halt', cause) {
    super(code);
    this.name = 'ProductionPlayerCanaryBaselineReconciliationError';
    this.code = code;
    this.disposition = disposition;
    if (cause !== undefined) Object.defineProperty(this, 'cause', {
      value: cause,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }
}

function fail(code, disposition = 'halt', cause) {
  throw new ProductionPlayerCanaryBaselineReconciliationError(
    code,
    disposition,
    cause,
  );
}

function exactRecord(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  ) fail(code);
  return value;
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${text.length}:${text}`;
  }).join('|');
}

export function productionPlayerCanaryBaselineChallengeDigest(evidenceNonce) {
  if (typeof evidenceNonce !== 'string' || !SHA256.test(evidenceNonce)) {
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_INPUT_INVALID');
  }
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    evidenceNonce,
  ])}\n`, 'utf8').digest('hex');
}

function validateInput(input) {
  const value = exactRecord(
    input,
    INPUT_KEYS.filter(key => key !== 'expectedServerBaselineCommitment'
      || Object.prototype.hasOwnProperty.call(input ?? {}, key)),
    'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_INPUT_INVALID',
  );
  const arguments_ = exactRecord(
    value.arguments,
    ARGUMENT_KEYS,
    'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_INPUT_INVALID',
  );
  const secretBytes = typeof value.adminSecret === 'string'
    ? new TextEncoder().encode(value.adminSecret).byteLength
    : 0;
  if (
    secretBytes < 32
    || secretBytes > 512
    || typeof arguments_.fid !== 'bigint'
    || arguments_.fid < 1n
    || arguments_.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || typeof arguments_.reviewedAdmissionPlanDigest !== 'string'
    || !SHA256.test(arguments_.reviewedAdmissionPlanDigest)
    || typeof arguments_.evidenceNonce !== 'string'
    || !SHA256.test(arguments_.evidenceNonce)
    || typeof value.assertCanStartWrite !== 'function'
    || (value.expectedServerBaselineCommitment !== undefined
      && (typeof value.expectedServerBaselineCommitment !== 'string'
        || !SHA256.test(value.expectedServerBaselineCommitment)))
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_INPUT_INVALID');
  return Object.freeze({
    adminSecret: value.adminSecret,
    arguments: Object.freeze({
      fid: arguments_.fid,
      reviewedAdmissionPlanDigest: arguments_.reviewedAdmissionPlanDigest,
      evidenceNonce: arguments_.evidenceNonce,
    }),
    assertCanStartWrite: value.assertCanStartWrite,
    expectedServerBaselineCommitment: value.expectedServerBaselineCommitment,
  });
}

// This file is executed directly by Node, while the canonical guard currently
// lives in a TypeScript module containing syntax Node's strip-only loader cannot
// execute. Keep this byte-for-byte equivalent structural branch at the MJS
// boundary so transport/journal errors retain their exact object identity.
function isGreaterRealmCutoverWriteNotStartedError(error) {
  return error !== null
    && typeof error === 'object'
    && error.name === 'GreaterRealmCutoverWriteNotStartedError'
    && error.writeStarted === false
    && typeof error.code === 'string';
}

function projectStatus(raw, input) {
  const status = exactRecord(
    raw,
    STATUS_KEYS,
    'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_STATUS_INVALID',
  );
  const expectedChallenge = productionPlayerCanaryBaselineChallengeDigest(
    input.arguments.evidenceNonce,
  );
  if (
    status.profile !== SERVER_BASELINE_PROFILE
    || status.challengeDigest !== expectedChallenge
    || status.reviewedAdmissionPlanDigest
      !== input.arguments.reviewedAdmissionPlanDigest
    || typeof status.capturedAtMicros !== 'bigint'
    || status.capturedAtMicros < 0n
    || status.capturedAtMicros > U64_MAX
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_STATUS_CONFLICT');

  if (status.baselineCaptured === false) {
    if (
      status.serverBaselineCommitment !== ''
      || status.capturedAtMicros !== 0n
      || status.directTierOneFounder !== false
      || status.normalRequestAdmission !== false
      || status.pristineWorkerCount !== 0
      || status.terminalGraphEmpty !== false
      || status.pristineResourceAccount !== false
    ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_STATUS_INVALID');
  } else if (
    status.baselineCaptured !== true
    || typeof status.serverBaselineCommitment !== 'string'
    || !SHA256.test(status.serverBaselineCommitment)
    || status.capturedAtMicros < 1n
    || status.directTierOneFounder !== true
    || status.normalRequestAdmission !== true
    || status.pristineWorkerCount !== 4
    || status.terminalGraphEmpty !== true
    || status.pristineResourceAccount !== true
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_STATUS_INVALID');

  if (
    status.baselineCaptured
    && input.expectedServerBaselineCommitment !== undefined
    && status.serverBaselineCommitment
      !== input.expectedServerBaselineCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_COMMITMENT_MISMATCH');
  return Object.freeze(Object.fromEntries(
    STATUS_KEYS.map(key => [key, status[key]]),
  ));
}

function brandCapturedStatus(status, submissionOutcome) {
  const result = Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_PROFILE,
    submissionOutcome,
    challengeDigest: status.challengeDigest,
    reviewedAdmissionPlanDigest: status.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: status.serverBaselineCommitment,
    capturedAtMicros: status.capturedAtMicros,
    status,
  });
  reconciliationBrand.add(result);
  return result;
}

async function closeSession(session) {
  if (session === null || typeof session !== 'object' || typeof session.close !== 'function') {
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_SESSION_INVALID');
  }
  await session.close();
}

async function reconcileWithDependencies(rawInput, dependencies) {
  const input = validateInput(rawInput);
  let session;
  try {
    session = await dependencies.openSession(input.adminSecret);
  } catch (error) {
    fail(
      'PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_SESSION_UNAVAILABLE',
      'safe-pre-mutation-failure',
      error,
    );
  }

  let submissionError;
  try {
    await dependencies.capture({
      session,
      arguments: input.arguments,
      assertCanStartWrite: input.assertCanStartWrite,
    });
  } catch (error) {
    submissionError = error;
  }

  let boundaryError;
  let readError;
  let closeError;
  let rawStatus;
  try {
    try {
      // The production session pre-mints one postflight credential before the
      // write. Invalidating here forces a freshly authenticated connection for
      // every readback while retaining that bounded contingency authority.
      await dependencies.refresh(session);
    } catch (error) {
      boundaryError = error;
    }
    if (boundaryError === undefined) {
      try {
        rawStatus = await dependencies.read({
          session,
          arguments: input.arguments,
        });
      } catch (error) {
        readError = error;
      }
    }
  } catch (error) {
    readError = error;
  } finally {
    try {
      await closeSession(session);
    } catch (error) {
      closeError = error;
    }
  }

  if (boundaryError !== undefined || readError !== undefined || closeError !== undefined) {
    fail(
      'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_UNAVAILABLE',
      'halt',
      boundaryError ?? readError ?? closeError,
    );
  }
  const status = projectStatus(rawStatus, input);
  if (!status.baselineCaptured) {
    if (
      submissionError !== undefined
      && isGreaterRealmCutoverWriteNotStartedError(submissionError)
    ) {
      throw submissionError;
    }
    if (submissionError !== undefined) {
      fail(
        'PRODUCTION_PLAYER_CANARY_BASELINE_EXPLICIT_OPERATOR_RETRY_REQUIRED',
        'explicit-operator-retry-required',
        submissionError,
      );
    }
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_ACKNOWLEDGED_BUT_ABSENT');
  }

  return brandCapturedStatus(
    status,
    submissionError === undefined
      ? 'capture-acknowledged'
      : isGreaterRealmCutoverWriteNotStartedError(submissionError)
        ? 'existing-row-after-write-not-started'
        : 'row-reconciled-after-submission-error',
  );
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  async openSession(adminSecret) {
    const module = await import('./greater-realm-production-transport.ts');
    return module.createGreaterRealmAdminTransportSession({ adminSecret });
  },
  async capture(input) {
    const module = await import('./production-player-canary-admin-transport.ts');
    return module.captureProductionPlayerCanaryBaselineV1(input);
  },
  refresh(session) {
    return session.invalidate();
  },
  async read(input) {
    const module = await import('./production-player-canary-admin-transport.ts');
    return module.getProductionPlayerCanaryBaselineV1(input);
  },
});

/**
 * Submits exactly once, forces a newly authenticated postflight connection,
 * and reconciles before returning any usable baseline authority.
 */
export function captureAndReconcileProductionPlayerCanaryBaselineV1(input) {
  return reconcileWithDependencies(input, DEFAULT_DEPENDENCIES);
}

export function requireProductionPlayerCanaryBaselineReconciliation(value) {
  if (
    value === null
    || typeof value !== 'object'
    || !reconciliationBrand.has(value)
    || value.profile !== PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_PROFILE
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_REQUIRED');
  return value;
}

export function requireProductionPlayerCanaryBaselineReconciliationForApproval(
  value,
  approval,
) {
  const reconciliation = requireProductionPlayerCanaryBaselineReconciliation(value);
  if (
    approval === null
    || typeof approval !== 'object'
    || typeof approval.evidenceNonce !== 'string'
    || !SHA256.test(approval.evidenceNonce)
    || reconciliation.challengeDigest
      !== productionPlayerCanaryBaselineChallengeDigest(approval.evidenceNonce)
    || reconciliation.reviewedAdmissionPlanDigest
      !== approval.reviewedAdmissionPlanDigest
    || reconciliation.serverBaselineCommitment
      !== approval.serverBaselineCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_COMMITMENT_MISMATCH');
  return reconciliation;
}

export const productionPlayerCanaryBaselineReconciliationTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      reconcileWithDependencies,
      brandCapturedStatusForTest(rawStatus, rawInput) {
        const input = validateInput(rawInput);
        const status = projectStatus(rawStatus, input);
        if (!status.baselineCaptured) {
          fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_REQUIRED');
        }
        return brandCapturedStatus(status, 'capture-acknowledged');
      },
    })
    : undefined;
