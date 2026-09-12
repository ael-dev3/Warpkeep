import { createHash, randomBytes } from 'node:crypto';

import {
  assertSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  SEALED_REALMS_PRODUCTION_REPOSITORY,
  SEALED_REALMS_PRODUCTION_WORKFLOW_PATH,
  attestSealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';

export const SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS = Object.freeze([
  'g001-census-first-to-second',
  'g001-census-second-to-suspension',
  'g002-publication',
  'g002-import',
  'ptr-publication',
  'ptr-import',
  'ptr-owner-provision',
  'activation-evidence',
  'g002-update',
  'ptr-update',
]);

const CONTINUATION_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const SUBJECT = /^[a-z0-9][a-z0-9:._-]{0,127}$/u;
const SPECS = Object.freeze({
  'g001-census-first-to-second': Object.freeze({
    issueOperation: 'g001-census-first',
    claimOperation: 'g001-census-second-inspect',
    lane: 'g001',
  }),
  'g001-census-second-to-suspension': Object.freeze({
    issueOperation: 'g001-census-second-inspect',
    claimOperation: 'g001-census-second-suspend',
    lane: 'g001',
  }),
  'g002-publication': Object.freeze({
    issueOperation: 'g002-publish-inspect',
    claimOperation: 'g002-publish-apply',
    lane: 'g002',
  }),
  'g002-import': Object.freeze({
    issueOperation: 'g002-import-inspect',
    claimOperation: 'g002-import-apply',
    lane: 'g002',
  }),
  'ptr-publication': Object.freeze({
    issueOperation: 'ptr-publish-inspect',
    claimOperation: 'ptr-publish-apply',
    lane: 'ptr',
  }),
  'ptr-import': Object.freeze({
    issueOperation: 'ptr-import-inspect',
    claimOperation: 'ptr-import-apply',
    lane: 'ptr',
  }),
  'ptr-owner-provision': Object.freeze({
    issueOperation: 'ptr-owner-provision-inspect',
    claimOperation: 'ptr-owner-provision',
    lane: 'ptr',
  }),
  'g002-update': Object.freeze({ issueOperation: 'g002-update-inspect', claimOperation: 'g002-update-apply', lane: 'g002' }),
  'ptr-update': Object.freeze({ issueOperation: 'ptr-update-inspect', claimOperation: 'ptr-update-apply', lane: 'ptr' }),
  'activation-evidence': Object.freeze({
    issueOperation: 'activation-evidence-inspect',
    claimOperation: 'activation-evidence-generate',
    lane: 'activation',
  }),
});
const storeStates = new WeakMap();
const activeClaims = new WeakMap();
const activeClaimRecords = new Set();
const activeReconciliations = new WeakMap();
const reconciliationClassifications = new WeakMap();

export class SealedRealmsProductionContinuationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionContinuationError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionContinuationError(code);
}

function exactInput(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !keys.includes(key))
  ) fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  return value;
}

function optionalInput(value, required, allowed) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !allowed.includes(key))
  ) fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  return value;
}

function kindSpec(kind) {
  if (!SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS.includes(kind)) {
    fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  }
  return SPECS[kind];
}

function exactRun(runId, runAttempt) {
  const attempt = String(runAttempt ?? '');
  if (!RUN_ID.test(runId ?? '') || !RUN_ID.test(attempt) || Number(attempt) > 1_000) {
    fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  }
  return Object.freeze({ id: runId, attempt, attemptNumber: Number(attempt) });
}

function exactDigestArray(value) {
  if (
    !Array.isArray(value)
    || value.length > 16
    || value.some(member => typeof member !== 'string' || !SHA256.test(member))
    || new Set(value).size !== value.length
  ) fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  return Object.freeze([...value]);
}

function bindingFrom(input) {
  if (!SUBJECT.test(input.subject ?? '') || !SHA256.test(input.evidenceDigest ?? '')) {
    fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  }
  return Object.freeze({
    subject: input.subject,
    evidenceDigest: input.evidenceDigest,
    receiptDigests: exactDigestArray(input.receiptDigests),
    predecessorDigests: exactDigestArray(input.predecessorDigests),
  });
}

function authorityInfo(authority, expectedOperation) {
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  const preparationSourceCommit =
    preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
  if (
    authority.operation !== expectedOperation
    || !['S', 'A'].includes(authority.mode)
    || !SHA256.test(authority.authorityDigest ?? '')
    || !COMMIT.test(sourceCommit)
    || !COMMIT.test(preparationSourceCommit)
  ) fail('SEALED_REALMS_CONTINUATION_OPERATION_INVALID');
  return Object.freeze({
    authority,
    authorityDigest: authority.authorityDigest,
    mode: authority.mode,
    operation: authority.operation,
    sourceCommit,
    preparationSourceCommit,
  });
}

function digest(...values) {
  const hash = createHash('sha256');
  for (const value of values) hash.update(value).update('\n');
  return hash.digest('hex');
}

function scopeDigest(authorityDigest, kind, evidenceDigest) {
  // Updates are repeatable, but each exact inspection remains single-use.
  // The update adapter separately validates the complete predecessor chain.
  if (kind === 'g002-update' || kind === 'ptr-update') {
    if (!SHA256.test(evidenceDigest ?? '')) fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
    return digest('warpkeep.sealed-realms.update-continuation-scope.v1', authorityDigest, kind, evidenceDigest);
  }
  return digest('warpkeep.sealed-realms.continuation-scope.v1', authorityDigest, kind);
}

function workflowAuthorityDigest({
  sourceCommit,
  authorityDigest,
  operation,
  runId,
  runAttempt,
}) {
  return digest(
    'warpkeep.sealed-realms.workflow-authority.v1',
    SEALED_REALMS_PRODUCTION_REPOSITORY,
    SEALED_REALMS_PRODUCTION_WORKFLOW_PATH,
    sourceCommit,
    authorityDigest,
    operation,
    runId,
    String(runAttempt),
  );
}

function canonicalBytes(record) {
  return Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
}

function canonicalRecord(bytes, keys) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  }
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
    || `${JSON.stringify(value)}\n` !== source
  ) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  return value;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function validDigestList(value) {
  return Array.isArray(value)
    && value.length <= 16
    && value.every(member => typeof member === 'string' && SHA256.test(member))
    && new Set(value).size === value.length;
}

const ISSUED_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'kind', 'sourceAuthorityDigest', 'sourceMode',
  'sourceCommit', 'preparationSourceCommit', 'issueOperation', 'claimOperation',
  'lane', 'subject', 'evidenceDigest', 'receiptDigests', 'predecessorDigests',
  'issuanceWorkflowAuthorityDigest', 'issuanceRunId', 'issuanceRunAttempt',
  'nonce', 'issuedAt', 'expiresAt',
]);
const CLAIMED_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'recordDigest', 'kind', 'sourceAuthorityDigest',
  'claimOperation', 'lane', 'subject', 'claimWorkflowAuthorityDigest',
  'claimRunId', 'claimRunAttempt', 'claimedAt',
]);
const TERMINAL_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'recordDigest', 'kind', 'sourceAuthorityDigest',
  'outcome', 'terminalWorkflowAuthorityDigest', 'terminalRunId',
  'terminalRunAttempt', 'observationDigest', 'terminalAt',
]);

function validateIssued(record) {
  const spec = SPECS[record.kind];
  const issued = Date.parse(record.issuedAt);
  const expires = Date.parse(record.expiresAt);
  if (
    record.schemaVersion !== 1
    || record.profile !== 'warpkeep-sealed-realms-continuation-issued-v1'
    || spec === undefined
    || !SHA256.test(record.sourceAuthorityDigest ?? '')
    || !['S', 'A'].includes(record.sourceMode)
    || !COMMIT.test(record.sourceCommit ?? '')
    || !COMMIT.test(record.preparationSourceCommit ?? '')
    || record.issueOperation !== spec.issueOperation
    || record.claimOperation !== spec.claimOperation
    || record.lane !== spec.lane
    || !SUBJECT.test(record.subject ?? '')
    || !SHA256.test(record.evidenceDigest ?? '')
    || !validDigestList(record.receiptDigests)
    || !validDigestList(record.predecessorDigests)
    || !RUN_ID.test(record.issuanceRunId ?? '')
    || !Number.isSafeInteger(record.issuanceRunAttempt)
    || record.issuanceRunAttempt < 1
    || record.issuanceRunAttempt > 1_000
    || !SHA256.test(record.nonce ?? '')
    || !canonicalTimestamp(record.issuedAt)
    || !canonicalTimestamp(record.expiresAt)
    || expires - issued !== CONTINUATION_TTL_MILLISECONDS
    || record.issuanceWorkflowAuthorityDigest !== workflowAuthorityDigest({
      sourceCommit: record.sourceCommit,
      authorityDigest: record.sourceAuthorityDigest,
      operation: record.issueOperation,
      runId: record.issuanceRunId,
      runAttempt: record.issuanceRunAttempt,
    })
  ) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  return record;
}

function validateClaim(record, issued) {
  if (
    record.schemaVersion !== 1
    || record.profile !== 'warpkeep-sealed-realms-continuation-claimed-v1'
    || record.recordDigest !== issued.recordDigest
    || record.kind !== issued.record.kind
    || record.sourceAuthorityDigest !== issued.record.sourceAuthorityDigest
    || record.claimOperation !== issued.record.claimOperation
    || record.lane !== issued.record.lane
    || record.subject !== issued.record.subject
    || !RUN_ID.test(record.claimRunId ?? '')
    || !Number.isSafeInteger(record.claimRunAttempt)
    || record.claimRunAttempt < 1
    || record.claimRunAttempt > 1_000
    || record.claimRunId === issued.record.issuanceRunId
    || !canonicalTimestamp(record.claimedAt)
    || Date.parse(record.claimedAt) < Date.parse(issued.record.issuedAt)
    || record.claimWorkflowAuthorityDigest !== workflowAuthorityDigest({
      sourceCommit: issued.record.sourceCommit,
      authorityDigest: issued.record.sourceAuthorityDigest,
      operation: issued.record.claimOperation,
      runId: record.claimRunId,
      runAttempt: record.claimRunAttempt,
    })
  ) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  return record;
}

function validateTerminal(record, issued, claim) {
  const reconciled = record.outcome === 'reconciled-effect-applied'
    || record.outcome === 'reconciled-no-effect';
  if (
    record.schemaVersion !== 1
    || record.profile !== 'warpkeep-sealed-realms-continuation-terminal-v1'
    || record.recordDigest !== issued.recordDigest
    || record.kind !== issued.record.kind
    || record.sourceAuthorityDigest !== issued.record.sourceAuthorityDigest
    || !['completed', 'reconciled-effect-applied', 'reconciled-no-effect']
      .includes(record.outcome)
    || !RUN_ID.test(record.terminalRunId ?? '')
    || !Number.isSafeInteger(record.terminalRunAttempt)
    || record.terminalRunAttempt < 1
    || record.terminalRunAttempt > 1_000
    || (reconciled && record.terminalRunId === claim.record.claimRunId)
    || (!reconciled && (
      record.terminalRunId !== claim.record.claimRunId
      || record.terminalRunAttempt !== claim.record.claimRunAttempt
    ))
    || (reconciled
      ? !SHA256.test(record.observationDigest ?? '')
      : record.observationDigest !== null)
    || !canonicalTimestamp(record.terminalAt)
    || Date.parse(record.terminalAt) < Date.parse(claim.record.claimedAt)
    || record.terminalWorkflowAuthorityDigest !== workflowAuthorityDigest({
      sourceCommit: issued.record.sourceCommit,
      authorityDigest: issued.record.sourceAuthorityDigest,
      operation: issued.record.claimOperation,
      runId: record.terminalRunId,
      runAttempt: record.terminalRunAttempt,
    })
  ) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  return record;
}

function inventory(state, scope) {
  let records;
  try {
    records = state.privateState.readContinuationRecords({ scopeDigest: scope });
    const groups = new Map();
    for (const item of records) {
      const keys = item.state === 'issued'
        ? ISSUED_KEYS
        : item.state === 'claimed' ? CLAIMED_KEYS : TERMINAL_KEYS;
      const parsed = canonicalRecord(item.bytes, keys);
      const group = groups.get(item.recordDigest) ?? {};
      if (group[item.state] !== undefined) {
        fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
      }
      group[item.state] = Object.freeze({
        recordDigest: item.recordDigest,
        record: parsed,
        byteDigest: createHash('sha256').update(item.bytes).digest('hex'),
      });
      groups.set(item.recordDigest, group);
    }
    for (const group of groups.values()) {
      if (group.issued === undefined) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
      if (group.issued.byteDigest !== group.issued.recordDigest) {
        fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
      }
      validateIssued(group.issued.record);
      if (group.claimed !== undefined) validateClaim(group.claimed.record, group.issued);
      if (group.terminal !== undefined) {
        if (group.claimed === undefined) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
        validateTerminal(group.terminal.record, group.issued, group.claimed);
      }
    }
    const values = [...groups.values()];
    const unresolved = values.filter(group => group.terminal === undefined);
    if (unresolved.length > 1) fail('SEALED_REALMS_CONTINUATION_DUPLICATE');
    return Object.freeze({
      groups: Object.freeze(values),
      unresolved: unresolved[0],
      sealed: values.some(group => ['completed', 'reconciled-effect-applied']
        .includes(group.terminal?.record.outcome)),
    });
  } catch (error) {
    if (error instanceof SealedRealmsProductionContinuationError) throw error;
    fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  } finally {
    if (records !== undefined) {
      for (const record of records) record.bytes.fill(0);
    }
  }
}

function issuanceGeneration(current, scope) {
  const history = current.groups.map((group) => {
    if (group.terminal?.record.outcome !== 'reconciled-no-effect') {
      fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
    }
    return `${group.issued.recordDigest}:${group.terminal.byteDigest}`;
  }).sort();
  return digest(
    'warpkeep.sealed-realms.continuation-issuance-generation.v1',
    scope,
    ...history,
  );
}

function storeState(store) {
  const state = storeStates.get(store);
  if (state === undefined) fail('SEALED_REALMS_CONTINUATION_STORE_INVALID');
  return state;
}

function sampleClock(state) {
  let value;
  try { value = state.clock(); } catch {
    fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
  }
  return new Date(value.getTime());
}

function sampleNonce(state) {
  let value;
  try { value = state.randomBytes(32); } catch {
    fail('SEALED_REALMS_CONTINUATION_NONCE_INVALID');
  }
  if (!(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    fail('SEALED_REALMS_CONTINUATION_NONCE_INVALID');
  }
  const bytes = Buffer.from(value);
  try {
    if (bytes.byteLength !== 32) fail('SEALED_REALMS_CONTINUATION_NONCE_INVALID');
    return bytes.toString('hex');
  } finally {
    bytes.fill(0);
  }
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireBinding(issued, authority, binding) {
  if (
    issued.sourceAuthorityDigest !== authority.authorityDigest
    || issued.sourceMode !== authority.mode
    || issued.sourceCommit !== authority.sourceCommit
    || issued.preparationSourceCommit !== authority.preparationSourceCommit
    || issued.subject !== binding.subject
    || issued.evidenceDigest !== binding.evidenceDigest
    || !sameArray(issued.receiptDigests, binding.receiptDigests)
    || !sameArray(issued.predecessorDigests, binding.predecessorDigests)
  ) fail('SEALED_REALMS_CONTINUATION_BINDING_INVALID');
}

function writeRecord(state, scope, stateName, recordDigest, record) {
  const bytes = canonicalBytes(record);
  try {
    state.privateState.writeContinuationRecord({
      scopeDigest: scope,
      state: stateName,
      recordDigest,
      bytes,
    });
  } finally {
    bytes.fill(0);
  }
}

function reserveIssuance(state, scope, generationDigest) {
  try {
    state.privateState.reserveContinuationIssuance({
      scopeDigest: scope, generationDigest,
    });
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
      fail('SEALED_REALMS_CONTINUATION_DUPLICATE');
    }
    throw error;
  }
}

function resolution(state, scope, recordDigest) {
  try {
    return state.privateState.readContinuationResolution({
      scopeDigest: scope, recordDigest,
    });
  } catch {
    fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  }
}

function reserveResolution(state, scope, recordDigest, decision) {
  try {
    state.privateState.reserveContinuationResolution({
      scopeDigest: scope, recordDigest, decision,
    });
    return Object.freeze({ decision, created: true });
  } catch (error) {
    if (error?.code !== 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') throw error;
    const retained = resolution(state, scope, recordDigest);
    if (retained === undefined) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
    return Object.freeze({ decision: retained, created: false });
  }
}

export function createSealedRealmsProductionContinuationStore(input) {
  const options = optionalInput(input, ['privateState'], [
    'privateState', 'clock', 'randomBytes',
  ]);
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  if (
    (options.clock !== undefined && typeof options.clock !== 'function')
    || (options.randomBytes !== undefined && typeof options.randomBytes !== 'function')
  ) fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  const store = Object.freeze({});
  storeStates.set(store, Object.freeze({
    privateState,
    clock: options.clock ?? (() => new Date()),
    randomBytes: options.randomBytes ?? randomBytes,
  }));
  return store;
}

export function assertSealedRealmsProductionContinuationStore(store) {
  storeState(store);
  return store;
}

const COMMON_KEYS = Object.freeze([
  'store', 'permit', 'sourceAuthority', 'kind', 'runId', 'runAttempt',
  'subject', 'evidenceDigest', 'receiptDigests', 'predecessorDigests',
]);

export async function issueSealedRealmsProductionContinuation(input) {
  const options = exactInput(input, COMMON_KEYS);
  const state = storeState(options.store);
  const spec = kindSpec(options.kind);
  const authority = authorityInfo(options.sourceAuthority, spec.issueOperation);
  const run = exactRun(options.runId, options.runAttempt);
  const binding = bindingFrom(options);
  const scope = scopeDigest(authority.authorityDigest, options.kind, binding.evidenceDigest);
  const existing = inventory(state, scope);
  if (existing.sealed) fail('SEALED_REALMS_CONTINUATION_TERMINAL');
  if (existing.unresolved?.claimed !== undefined) {
    fail('SEALED_REALMS_CONTINUATION_AMBIGUOUS');
  }
  if (existing.unresolved !== undefined) fail('SEALED_REALMS_CONTINUATION_DUPLICATE');
  await attestSealedRealmsProductionWorkflowPermit({
    permit: options.permit,
    sourceAuthority: options.sourceAuthority,
    phase: 'continuation-issue',
    runId: run.id,
    runAttempt: run.attempt,
  });
  reserveIssuance(state, scope, issuanceGeneration(existing, scope));
  const now = sampleClock(state);
  const record = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-continuation-issued-v1',
    kind: options.kind,
    sourceAuthorityDigest: authority.authorityDigest,
    sourceMode: authority.mode,
    sourceCommit: authority.sourceCommit,
    preparationSourceCommit: authority.preparationSourceCommit,
    issueOperation: spec.issueOperation,
    claimOperation: spec.claimOperation,
    lane: spec.lane,
    subject: binding.subject,
    evidenceDigest: binding.evidenceDigest,
    receiptDigests: binding.receiptDigests,
    predecessorDigests: binding.predecessorDigests,
    issuanceWorkflowAuthorityDigest: workflowAuthorityDigest({
      sourceCommit: authority.sourceCommit,
      authorityDigest: authority.authorityDigest,
      operation: spec.issueOperation,
      runId: run.id,
      runAttempt: run.attemptNumber,
    }),
    issuanceRunId: run.id,
    issuanceRunAttempt: run.attemptNumber,
    nonce: sampleNonce(state),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONTINUATION_TTL_MILLISECONDS).toISOString(),
  });
  const bytes = canonicalBytes(record);
  const recordDigest = createHash('sha256').update(bytes).digest('hex');
  try {
    state.privateState.writeContinuationRecord({
      scopeDigest: scope, state: 'issued', recordDigest, bytes,
    });
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
      fail('SEALED_REALMS_CONTINUATION_DUPLICATE');
    }
    throw error;
  } finally {
    bytes.fill(0);
  }
  return Object.freeze({ status: 'issued' });
}

export async function claimSealedRealmsProductionContinuation(input) {
  const options = exactInput(input, [...COMMON_KEYS, 'effect']);
  if (typeof options.effect !== 'function') fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  const state = storeState(options.store);
  const spec = kindSpec(options.kind);
  const authority = authorityInfo(options.sourceAuthority, spec.claimOperation);
  const run = exactRun(options.runId, options.runAttempt);
  const binding = bindingFrom(options);
  const scope = scopeDigest(authority.authorityDigest, options.kind, binding.evidenceDigest);
  const current = inventory(state, scope);
  if (current.sealed) fail('SEALED_REALMS_CONTINUATION_TERMINAL');
  if (current.unresolved === undefined) fail('SEALED_REALMS_CONTINUATION_MISSING');
  if (current.unresolved.claimed !== undefined) {
    fail('SEALED_REALMS_CONTINUATION_AMBIGUOUS');
  }
  const issued = current.unresolved.issued;
  requireBinding(issued.record, authority, binding);
  if (run.id === issued.record.issuanceRunId) {
    fail('SEALED_REALMS_CONTINUATION_RUN_INVALID');
  }
  await attestSealedRealmsProductionWorkflowPermit({
    permit: options.permit,
    sourceAuthority: options.sourceAuthority,
    phase: 'continuation-claim',
    runId: run.id,
    runAttempt: run.attempt,
  });
  const claimedAt = sampleClock(state);
  if (
    claimedAt.getTime() < Date.parse(issued.record.issuedAt)
    || claimedAt.getTime() >= Date.parse(issued.record.expiresAt)
  ) fail('SEALED_REALMS_CONTINUATION_EXPIRED');
  const claimRecord = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-continuation-claimed-v1',
    recordDigest: issued.recordDigest,
    kind: options.kind,
    sourceAuthorityDigest: authority.authorityDigest,
    claimOperation: spec.claimOperation,
    lane: spec.lane,
    subject: binding.subject,
    claimWorkflowAuthorityDigest: workflowAuthorityDigest({
      sourceCommit: authority.sourceCommit,
      authorityDigest: authority.authorityDigest,
      operation: spec.claimOperation,
      runId: run.id,
      runAttempt: run.attemptNumber,
    }),
    claimRunId: run.id,
    claimRunAttempt: run.attemptNumber,
    claimedAt: claimedAt.toISOString(),
  });
  try {
    writeRecord(state, scope, 'claimed', issued.recordDigest, claimRecord);
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
      fail('SEALED_REALMS_CONTINUATION_CLAIM_CONFLICT');
    }
    throw error;
  }
  const claimedInventory = inventory(state, scope);
  if (
    claimedInventory.unresolved?.claimed === undefined
    || claimedInventory.unresolved.issued.recordDigest !== issued.recordDigest
    || JSON.stringify(claimedInventory.unresolved.claimed.record)
      !== JSON.stringify(claimRecord)
  ) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');

  await attestSealedRealmsProductionWorkflowPermit({
    permit: options.permit,
    sourceAuthority: options.sourceAuthority,
    phase: 'continuation-effect',
    runId: run.id,
    runAttempt: run.attempt,
  });
  const effectAt = sampleClock(state);
  if (effectAt.getTime() < Date.parse(claimRecord.claimedAt)) {
    fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
  }
  if (effectAt.getTime() >= Date.parse(issued.record.expiresAt)) {
    fail('SEALED_REALMS_CONTINUATION_EXPIRED');
  }
  const effectResolution = reserveResolution(
    state, scope, issued.recordDigest, 'effect',
  );
  if (!effectResolution.created || effectResolution.decision !== 'effect') {
    fail('SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS');
  }
  const claim = Object.freeze({});
  const recordKey = `${scope}:${issued.recordDigest}`;
  if (activeClaimRecords.has(recordKey)) {
    fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  }
  const claimMember = Object.freeze({
    store: options.store,
    scopeDigest: scope,
    recordDigest: issued.recordDigest,
    sourceAuthority: options.sourceAuthority,
    sourceAuthorityDigest: authority.authorityDigest,
    sourceMode: authority.mode,
    sourceCommit: authority.sourceCommit,
    preparationSourceCommit: authority.preparationSourceCommit,
    kind: options.kind,
    issueOperation: spec.issueOperation,
    claimOperation: spec.claimOperation,
    lane: spec.lane,
    subject: binding.subject,
    evidenceDigest: binding.evidenceDigest,
    receiptDigests: binding.receiptDigests,
    predecessorDigests: binding.predecessorDigests,
    runId: run.id,
    runAttempt: run.attemptNumber,
    issuedRecord: JSON.stringify(issued.record),
    claimRecord: JSON.stringify(claimRecord),
  });
  const authorizationAt = sampleClock(state);
  if (authorizationAt.getTime() < Date.parse(claimRecord.claimedAt)) {
    fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
  }
  if (authorizationAt.getTime() >= Date.parse(issued.record.expiresAt)) {
    fail('SEALED_REALMS_CONTINUATION_EXPIRED');
  }
  activeClaims.set(claim, claimMember);
  activeClaimRecords.add(recordKey);
  let effectResult;
  // The brand exists only for the callback's direct invocation. Returned work
  // is awaited after revocation so detached microtasks cannot retain authority.
  try {
    effectResult = options.effect(claim);
  } catch {
    fail('SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS');
  } finally {
    activeClaims.delete(claim);
    activeClaimRecords.delete(recordKey);
  }
  try {
    await effectResult;
  } catch {
    fail('SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS');
  }
  try {
    await attestSealedRealmsProductionWorkflowPermit({
      permit: options.permit,
      sourceAuthority: options.sourceAuthority,
      phase: 'continuation-terminal',
      runId: run.id,
      runAttempt: run.attempt,
    });
    const terminalAt = sampleClock(state);
    if (terminalAt.getTime() < Date.parse(claimRecord.claimedAt)) {
      fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
    }
    const terminalRecord = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-continuation-terminal-v1',
      recordDigest: issued.recordDigest,
      kind: options.kind,
      sourceAuthorityDigest: authority.authorityDigest,
      outcome: 'completed',
      terminalWorkflowAuthorityDigest: workflowAuthorityDigest({
        sourceCommit: authority.sourceCommit,
        authorityDigest: authority.authorityDigest,
        operation: spec.claimOperation,
        runId: run.id,
        runAttempt: run.attemptNumber,
      }),
      terminalRunId: run.id,
      terminalRunAttempt: run.attemptNumber,
      observationDigest: null,
      terminalAt: terminalAt.toISOString(),
    });
    writeRecord(state, scope, 'terminal', issued.recordDigest, terminalRecord);
    const terminal = inventory(state, scope);
    if (!terminal.sealed || terminal.unresolved !== undefined) {
      fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
    }
  } catch {
    fail('SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS');
  }
  return Object.freeze({ status: 'completed' });
}

export async function reconcileSealedRealmsProductionContinuation(input) {
  const options = exactInput(input, [...COMMON_KEYS, 'readOnlyReconcile']);
  if (typeof options.readOnlyReconcile !== 'function') {
    fail('SEALED_REALMS_CONTINUATION_INPUT_INVALID');
  }
  const state = storeState(options.store);
  const spec = kindSpec(options.kind);
  const authority = authorityInfo(options.sourceAuthority, spec.claimOperation);
  const run = exactRun(options.runId, options.runAttempt);
  const binding = bindingFrom(options);
  const scope = scopeDigest(authority.authorityDigest, options.kind, binding.evidenceDigest);
  const current = inventory(state, scope);
  if (current.sealed) fail('SEALED_REALMS_CONTINUATION_TERMINAL');
  if (current.unresolved === undefined) fail('SEALED_REALMS_CONTINUATION_MISSING');
  if (current.unresolved.claimed === undefined) {
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_NOT_REQUIRED');
  }
  const issued = current.unresolved.issued;
  const claimed = current.unresolved.claimed;
  requireBinding(issued.record, authority, binding);
  if (run.id === claimed.record.claimRunId) {
    fail('SEALED_REALMS_CONTINUATION_RUN_INVALID');
  }
  const recordKey = `${scope}:${issued.recordDigest}`;
  if (activeClaimRecords.has(recordKey)) {
    fail('SEALED_REALMS_CONTINUATION_CLAIM_LIVE');
  }
  try {
    await attestSealedRealmsProductionWorkflowPermit({
      permit: options.permit,
      sourceAuthority: options.sourceAuthority,
      phase: 'continuation-reconcile',
      runId: run.id,
      runAttempt: run.attempt,
      claimRunId: claimed.record.claimRunId,
      claimRunAttempt: claimed.record.claimRunAttempt,
    });
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_WORKFLOW_AUTHORITY_CLAIM_RUN_LIVE') {
      fail('SEALED_REALMS_CONTINUATION_CLAIM_LIVE');
    }
    throw error;
  }
  if (activeClaimRecords.has(recordKey)) {
    fail('SEALED_REALMS_CONTINUATION_CLAIM_LIVE');
  }
  const retainedResolution = resolution(state, scope, issued.recordDigest);
  const reconciliationResolution = retainedResolution === undefined
    ? reserveResolution(state, scope, issued.recordDigest, 'reconcile')
    : Object.freeze({ decision: retainedResolution, created: false });
  const reconciliation = Object.freeze({});
  const reconciliationMember = Object.freeze({
    store: options.store,
    recordKey,
    recordDigest: issued.recordDigest,
    sourceAuthority: options.sourceAuthority,
    kind: options.kind,
    subject: binding.subject,
    evidenceDigest: binding.evidenceDigest,
    receiptDigests: binding.receiptDigests,
    predecessorDigests: binding.predecessorDigests,
    claimRunId: claimed.record.claimRunId,
    claimRunAttempt: claimed.record.claimRunAttempt,
  });
  activeReconciliations.set(reconciliation, reconciliationMember);
  let classification;
  try {
    classification = await options.readOnlyReconcile(reconciliation);
  } catch {
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_AMBIGUOUS');
  } finally {
    activeReconciliations.delete(reconciliation);
  }
  const brandedNoEffect = reconciliationClassifications.get(classification)
    === reconciliationMember;
  reconciliationClassifications.delete(classification);
  if (
    classification === null
    || typeof classification !== 'object'
    || Array.isArray(classification)
    || Object.getPrototypeOf(classification) !== Object.prototype
    || JSON.stringify(Object.keys(classification))
      !== JSON.stringify(['outcome', 'observationDigest'])
    || !['effect-applied', 'no-effect'].includes(classification.outcome)
    || !SHA256.test(classification.observationDigest ?? '')
  ) fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID');
  if (classification.outcome === 'no-effect' && !brandedNoEffect) {
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID');
  }
  try {
    await attestSealedRealmsProductionWorkflowPermit({
      permit: options.permit,
      sourceAuthority: options.sourceAuthority,
      phase: 'continuation-reconcile-terminal',
      runId: run.id,
      runAttempt: run.attempt,
      claimRunId: claimed.record.claimRunId,
      claimRunAttempt: claimed.record.claimRunAttempt,
    });
    const terminalAt = sampleClock(state);
    if (terminalAt.getTime() < Date.parse(claimed.record.claimedAt)) {
      fail('SEALED_REALMS_CONTINUATION_CLOCK_INVALID');
    }
    const terminalRecord = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-continuation-terminal-v1',
      recordDigest: issued.recordDigest,
      kind: options.kind,
      sourceAuthorityDigest: authority.authorityDigest,
      outcome: classification.outcome === 'effect-applied'
        ? 'reconciled-effect-applied'
        : 'reconciled-no-effect',
      terminalWorkflowAuthorityDigest: workflowAuthorityDigest({
        sourceCommit: authority.sourceCommit,
        authorityDigest: authority.authorityDigest,
        operation: spec.claimOperation,
        runId: run.id,
        runAttempt: run.attemptNumber,
      }),
      terminalRunId: run.id,
      terminalRunAttempt: run.attemptNumber,
      observationDigest: classification.observationDigest,
      terminalAt: terminalAt.toISOString(),
    });
    writeRecord(state, scope, 'terminal', issued.recordDigest, terminalRecord);
    const terminal = inventory(state, scope);
    if (terminal.unresolved !== undefined) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  } catch (error) {
    if (error instanceof SealedRealmsProductionContinuationError) throw error;
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_AMBIGUOUS');
  }
  return Object.freeze({ status: 'reconciled', outcome: classification.outcome });
}

/**
 * Mints only a no-effect terminal classification tied to the live,
 * independently attested reconciliation callback. It carries no effect claim.
 */
export function classifySealedRealmsProductionContinuationNoEffect(input) {
  const options = exactInput(input, [
    'reconciliation', 'evidenceDigest', 'observationDigest',
  ]);
  const member = activeReconciliations.get(options.reconciliation);
  if (
    member === undefined
    || options.evidenceDigest !== member.evidenceDigest
    || !SHA256.test(options.evidenceDigest ?? '')
    || !SHA256.test(options.observationDigest ?? '')
  ) {
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID');
  }
  const classification = Object.freeze({
    outcome: 'no-effect',
    observationDigest: options.observationDigest,
  });
  reconciliationClassifications.set(classification, member);
  return classification;
}

function authenticatedClaimBinding(input) {
  const options = exactInput(input, [
    'claim', 'store', 'sourceAuthority', 'kind', 'runId', 'runAttempt',
    'subject', 'evidenceDigest', 'receiptDigests', 'predecessorDigests',
  ]);
  const member = activeClaims.get(options.claim);
  if (member === undefined) fail('SEALED_REALMS_CONTINUATION_CLAIM_INVALID');
  try {
    const state = storeState(options.store);
    const spec = kindSpec(options.kind);
    const authority = authorityInfo(options.sourceAuthority, spec.claimOperation);
    const run = exactRun(options.runId, options.runAttempt);
    const binding = bindingFrom(options);
    const scope = scopeDigest(authority.authorityDigest, options.kind, binding.evidenceDigest);
    const current = inventory(state, scope);
    const group = current.groups.find(
      value => value.issued.recordDigest === member.recordDigest,
    );
    if (
      member.store !== options.store
      || member.scopeDigest !== scope
      || member.sourceAuthority !== options.sourceAuthority
      || member.sourceAuthorityDigest !== authority.authorityDigest
      || member.sourceMode !== authority.mode
      || member.sourceCommit !== authority.sourceCommit
      || member.preparationSourceCommit !== authority.preparationSourceCommit
      || member.kind !== options.kind
      || member.issueOperation !== spec.issueOperation
      || member.claimOperation !== spec.claimOperation
      || member.lane !== spec.lane
      || member.subject !== binding.subject
      || member.evidenceDigest !== binding.evidenceDigest
      || !sameArray(member.receiptDigests, binding.receiptDigests)
      || !sameArray(member.predecessorDigests, binding.predecessorDigests)
      || member.runId !== run.id
      || member.runAttempt !== run.attemptNumber
      || group === undefined
      || group.issued.recordDigest !== member.recordDigest
      || JSON.stringify(group.issued.record) !== member.issuedRecord
      || group.claimed === undefined
      || JSON.stringify(group.claimed.record) !== member.claimRecord
      || group.terminal !== undefined
    ) fail('SEALED_REALMS_CONTINUATION_CLAIM_INVALID');
    return { member, group };
  } catch {
    fail('SEALED_REALMS_CONTINUATION_CLAIM_INVALID');
  }
}

export function assertSealedRealmsProductionContinuationClaim(input) {
  authenticatedClaimBinding(input);
  return true;
}

/** Synchronous owned-record data only; does not extend the claim's effect authority. */
export function readSealedRealmsProductionContinuationClaimBinding(input) {
  const { member, group } = authenticatedClaimBinding(input);
  return Object.freeze({
    scopeDigest: member.scopeDigest,
    issuedRecordDigest: group.issued.recordDigest,
    claimRecordDigest: group.claimed.byteDigest,
    sourceCommit: member.sourceCommit,
    sourceAuthorityDigest: member.sourceAuthorityDigest,
    kind: member.kind,
    subject: member.subject,
    evidenceDigest: member.evidenceDigest,
    receiptDigests: Object.freeze([...member.receiptDigests]),
    predecessorDigests: Object.freeze([...member.predecessorDigests]),
    claimRunId: group.claimed.record.claimRunId,
    claimRunAttempt: group.claimed.record.claimRunAttempt,
    claimedAt: group.claimed.record.claimedAt,
    expiresAt: group.issued.record.expiresAt,
  });
}

/** Checks a receipt's original run against a live read-only reconciliation scope. */
export function assertSealedRealmsProductionContinuationReconciliation(input) {
  const options = exactInput(input, [
    'reconciliation', 'store', 'sourceAuthority', 'kind', 'subject', 'evidenceDigest',
    'receiptDigests', 'predecessorDigests', 'claimRunId', 'claimRunAttempt',
  ]);
  const member = activeReconciliations.get(options.reconciliation);
  if (member === undefined || member.store !== options.store
    || member.sourceAuthority !== options.sourceAuthority || member.kind !== options.kind
    || member.subject !== options.subject || member.evidenceDigest !== options.evidenceDigest
    || !sameArray(member.receiptDigests, options.receiptDigests)
    || !sameArray(member.predecessorDigests, options.predecessorDigests)
    || member.claimRunId !== options.claimRunId || member.claimRunAttempt !== options.claimRunAttempt) {
    fail('SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID');
  }
  return true;
}

/** Historical validated data only. This projection is not an effect or writer capability. */
export function readSealedRealmsProductionContinuationCompletion(input) {
  const options = exactInput(input, [
    'store', 'privateState', 'sourceAuthority', 'kind', 'subject',
    'evidenceDigest', 'receiptDigests', 'predecessorDigests',
  ]);
  const state = storeState(options.store);
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  if (state.privateState !== privateState) {
    fail('SEALED_REALMS_CONTINUATION_STORE_INVALID');
  }
  const spec = kindSpec(options.kind);
  const authority = authorityInfo(options.sourceAuthority, spec.claimOperation);
  const binding = bindingFrom(options);
  const scope = scopeDigest(authority.authorityDigest, options.kind, binding.evidenceDigest);
  const current = inventory(state, scope);
  if (!current.sealed || current.unresolved !== undefined) {
    fail('SEALED_REALMS_CONTINUATION_MISSING');
  }
  for (const group of current.groups) {
    requireBinding(group.issued.record, authority, binding);
    if (group.issued.record.kind !== options.kind) {
      fail('SEALED_REALMS_CONTINUATION_BINDING_INVALID');
    }
  }
  const completed = current.groups.filter(group =>
    ['completed', 'reconciled-effect-applied'].includes(group.terminal?.record.outcome));
  if (completed.length !== 1) fail('SEALED_REALMS_CONTINUATION_STATE_INVALID');
  const group = completed[0];
  return Object.freeze({
    scopeDigest: scope,
    issuedRecordDigest: group.issued.recordDigest,
    claimRecordDigest: group.claimed.byteDigest,
    terminalRecordDigest: group.terminal.byteDigest,
    claimRunId: group.claimed.record.claimRunId,
    claimRunAttempt: group.claimed.record.claimRunAttempt,
    terminalRunId: group.terminal.record.terminalRunId,
    terminalRunAttempt: group.terminal.record.terminalRunAttempt,
    outcome: group.terminal.record.outcome,
    observationDigest: group.terminal.record.observationDigest,
    terminalAt: group.terminal.record.terminalAt,
  });
}
