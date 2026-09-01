// @vitest-environment node

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  claimSealedRealmsProductionContinuation,
  createSealedRealmsProductionContinuationStore,
  issueSealedRealmsProductionContinuation,
  reconcileSealedRealmsProductionContinuation,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionDispatcher,
} from '../scripts/sealed-realms-production-dispatch.mjs';
import {
  createSealedRealmsProductionPublicationReconciler,
} from '../scripts/sealed-realms-production-reconciliation.mjs';
import {
  createSealedRealmsProductionG002Lane,
} from '../scripts/sealed-realms-production-g002-lane-entry.mjs';
import {
  createSealedRealmsProductionPtrLane,
} from '../scripts/sealed-realms-production-ptr-lane-entry.mjs';
import {
  createSealedRealmsProductionActivationLane,
} from '../scripts/sealed-realms-production-activation-lane-entry.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
} from '../scripts/sealed-realms-production-workflow-authority.mjs';
import {
  createSealedRealmsPublicationPossiblySubmittedMarker as createG002Marker,
} from '../scripts/genesis002-production-publisher.mjs';
import {
  createSealedRealmsPublicationPossiblySubmittedMarker as createPtrMarker,
} from '../scripts/ptr-production-publisher.mjs';

import {
  SealedRealmsProductionAuthBridgeStateError,
  consumeSealedRealmsProductionActivationEvidenceConfirmation,
  consumeSealedRealmsProductionActivationEvidenceForGenerator,
  createSealedRealmsProductionActivationEvidenceGenerator,
  createSealedRealmsProductionAuthBridgeStateTestCapability,
  createSealedRealmsProductionAuthBridgeState,
  inspectSealedRealmsAdmissionSuspension,
} from '../scripts/sealed-realms-production-auth-bridge-state.mjs';

const URL = 'https://auth.warpkeep.com/v2/access/request';
const BODY = JSON.stringify({
  error: {
    code: 'admission_requests_suspended',
    message: 'New admission requests are temporarily suspended.',
  },
});
const SOURCE = 'a'.repeat(40);
const SWAPPED_SOURCE = 'c'.repeat(40);
const NOW = new Date('2026-08-30T00:00:00.000Z');
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT_ID = '223e4567-e89b-42d3-a456-426614174000';

function operationAuthority(operation: string, sourceCommit = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: sourceCommit,
    readGit: args => args[0] === 'rev-parse'
      ? `${sourceCommit}\n`
      : (() => { throw new Error('unexpected git call'); })(),
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: sourceCommit,
    }),
    verifyEvidence: (verifiedSha: string) => ({ verifiedSha }),
  });
}

function workflowResponse(url: string, body: unknown) {
  const encoded = JSON.stringify(body);
  const response = new Response(encoded, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(encoded)),
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function workflowGithub(
  sourceCommit: string,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return workflowResponse(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    const requestedRunId = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? runId;
    const completed = completedRunIds.has(requestedRunId);
    return workflowResponse(url, {
      id: Number(requestedRunId), run_attempt: 1, event: 'workflow_dispatch',
      status: completed ? 'completed' : 'in_progress',
      conclusion: completed ? 'failure' : null,
      head_branch: 'main',
      head_sha: sourceCommit,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  });
}

async function protectedContext(
  local: ReturnType<typeof fixture>,
  operation: string,
  runId: string,
  sourceCommit = SOURCE,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  const sourceAuthority = operationAuthority(operation, sourceCommit);
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl: workflowGithub(sourceCommit, runId, completedRunIds),
  });
  return Object.freeze({
    authority: sourceAuthority,
    continuation: Object.freeze({
      permit,
      store: createSealedRealmsProductionContinuationStore({ privateState: local.state }),
      runId,
      runAttempt: '1',
      sourceAuthority,
    }),
  });
}

let protectedRunSequence = 80_000;
const protectedSetupRuns = new Map<string, Promise<Readonly<{
  authority: ReturnType<typeof operationAuthority>;
  permit: Awaited<ReturnType<typeof issueSealedRealmsProductionWorkflowPermit>>;
  runId: string;
  runAttempt: '1';
}>>>();

function nextProtectedRunId() {
  protectedRunSequence += 1;
  return String(protectedRunSequence);
}

async function protectedSetupContext(
  local: ReturnType<typeof fixture>,
  operation: string,
) {
  let pending = protectedSetupRuns.get(operation);
  if (pending === undefined) {
    const runId = nextProtectedRunId();
    const authority = operationAuthority(operation);
    pending = issueSealedRealmsProductionWorkflowPermit({
      sourceAuthority: authority,
      githubToken: 'github-sealed-realms-owner-token',
      runId,
      runAttempt: '1',
      fetchImpl: workflowGithub(SOURCE, runId),
    }).then(permit => Object.freeze({
      authority, permit, runId, runAttempt: '1' as const,
    }));
    protectedSetupRuns.set(operation, pending);
  }
  const run = await pending;
  return Object.freeze({
    authority: run.authority,
    continuation: Object.freeze({
      permit: run.permit,
      store: createSealedRealmsProductionContinuationStore({ privateState: local.state }),
      runId: run.runId,
      runAttempt: run.runAttempt,
      sourceAuthority: run.authority,
    }),
  });
}

async function applyGateThroughContinuation(
  local: ReturnType<typeof fixture>,
  bridge: ReturnType<typeof createSealedRealmsProductionAuthBridgeState>,
  lane: 'g002' | 'ptr',
  apply: () => unknown | Promise<unknown>,
) {
  const kind = `${lane}-import` as const;
  const inspectOperation = `${lane}-import-inspect`;
  const applyOperation = `${lane}-import-apply`;
  const binding = await bridge.inspectGateForContinuation({ lane });
  const issued = await protectedSetupContext(local, inspectOperation);
  await issueSealedRealmsProductionContinuation({
    store: issued.continuation.store,
    permit: issued.continuation.permit,
    sourceAuthority: issued.authority,
    kind,
    runId: issued.continuation.runId,
    runAttempt: issued.continuation.runAttempt,
    ...binding,
  });
  const claimed = await protectedSetupContext(local, applyOperation);
  return claimSealedRealmsProductionContinuation({
    store: claimed.continuation.store,
    permit: claimed.continuation.permit,
    sourceAuthority: claimed.authority,
    kind,
    runId: claimed.continuation.runId,
    runAttempt: claimed.continuation.runAttempt,
    ...binding,
    effect: claim => bridge.applyGateForContinuation({
      claim,
      store: claimed.continuation.store,
      sourceAuthority: claimed.authority,
      kind,
      runId: claimed.continuation.runId,
      runAttempt: claimed.continuation.runAttempt,
      ...binding,
      lane,
      apply,
    }),
  });
}

async function applyOwnerThroughContinuation(
  local: ReturnType<typeof fixture>,
  bridge: ReturnType<typeof createSealedRealmsProductionAuthBridgeState>,
  inspect: () => Readonly<{ receiptDigest: string; inspectionDigest: string }>
    | Promise<Readonly<{ receiptDigest: string; inspectionDigest: string }>>,
  provision: () => Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>
    | Promise<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>,
) {
  const binding = await bridge.inspectOwnerProvisionEvidenceForContinuation({ inspect });
  return applyOwnerBindingThroughContinuation(local, bridge, binding, provision);
}

async function applyOwnerBindingThroughContinuation(
  local: ReturnType<typeof fixture>,
  bridge: ReturnType<typeof createSealedRealmsProductionAuthBridgeState>,
  binding: Awaited<ReturnType<
    ReturnType<typeof createSealedRealmsProductionAuthBridgeState>['reopenOwnerProvisionContinuation']
  >>,
  provision: () => Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>
    | Promise<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>,
) {
  const issued = await protectedSetupContext(local, 'ptr-owner-provision-inspect');
  await issueSealedRealmsProductionContinuation({
    store: issued.continuation.store,
    permit: issued.continuation.permit,
    sourceAuthority: issued.authority,
    kind: 'ptr-owner-provision',
    runId: issued.continuation.runId,
    runAttempt: issued.continuation.runAttempt,
    ...binding,
  });
  const claimed = await protectedSetupContext(local, 'ptr-owner-provision');
  return claimSealedRealmsProductionContinuation({
    store: claimed.continuation.store,
    permit: claimed.continuation.permit,
    sourceAuthority: claimed.authority,
    kind: 'ptr-owner-provision',
    runId: claimed.continuation.runId,
    runAttempt: claimed.continuation.runAttempt,
    ...binding,
    effect: claim => bridge.applyOwnerProvisionForContinuation({
      claim,
      store: claimed.continuation.store,
      sourceAuthority: claimed.authority,
      kind: 'ptr-owner-provision',
      runId: claimed.continuation.runId,
      runAttempt: claimed.continuation.runAttempt,
      ...binding,
      provision,
    }),
  });
}

async function protectedDispatcher(
  local: ReturnType<typeof fixture>,
  operation: string,
  runId: string,
  lanes: Readonly<Record<string, unknown>>,
  sourceCommit = SOURCE,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  const context = await protectedContext(
    local, operation, runId, sourceCommit, completedRunIds,
  );
  return createSealedRealmsProductionDispatcher({
    readGit: () => `${sourceCommit}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: sourceCommit,
    }),
    verifyEvidence: (verifiedSha: string) => ({ verifiedSha }),
    ...lanes,
    permit: context.continuation.permit,
    continuationStore: context.continuation.store,
    runId,
    runAttempt: '1',
    sourceAuthority: context.authority,
  } as never);
}

function publicationMarker(lane: 'g002' | 'ptr') {
  const input = {
    lane,
    sourceCommit: SOURCE,
    databaseUri: 'https://maincloud.spacetimedb.com' as const,
    alias: lane === 'g002' ? 'warpkeep-genesis-002' : 'warpkeep-ptr',
    moduleIdentity: lane === 'g002'
      ? 'warpkeep-genesis-002-sealed-v1'
      : 'warpkeep-ptr-owner-view-v1',
    release: lane === 'g002' ? '0.4.0' : '0.4.0-ptr.1',
    artifactDigest: 'a'.repeat(64),
    toolchainDigest: 'b'.repeat(64),
    publishPlanDigest: 'c'.repeat(64),
    confirmationDigest: 'd'.repeat(64),
    attemptNonce: 'e'.repeat(64),
    markedAt: '2026-09-01T00:00:00.000Z',
  };
  return lane === 'g002' ? createG002Marker(input as never) : createPtrMarker(input as never);
}

function suspendedResponse(headers: Record<string, string> = {}) {
  return new Response(BODY, {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': 'https://warpkeep.com',
      ...headers,
    },
  });
}

function probeResponse(input: Readonly<{
  status?: number;
  redirected?: boolean;
  headers?: Record<string, string>;
  body?: string;
}> = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'https://warpkeep.com',
    ...input.headers,
  });
  const body = Buffer.from(input.body ?? BODY, 'utf8');
  return {
    status: input.status ?? 503,
    redirected: input.redirected ?? false,
    headers,
    arrayBuffer: async () => body,
  };
}

const SUSPENSION_OPTIONS_MISMATCHES: ReadonlyArray<readonly [
  string,
  () => Response | ReturnType<typeof probeResponse>,
]> = [
  ['location', () => suspendedResponse({ location: 'https://private.example.test/location' })],
  ['status', () => probeResponse({ status: 502 })],
  ['redirected', () => probeResponse({ redirected: true })],
  ['content type', () => probeResponse({ headers: { 'content-type': 'application/json' } })],
  ['CORS origin', () => probeResponse({ headers: { 'access-control-allow-origin': 'https://other.example' } })],
  ['malformed JSON', () => probeResponse({ body: '{private-body-sentinel' })],
  ['extra outer key', () => probeResponse({ body: JSON.stringify({ error: JSON.parse(BODY).error, private: 'private-body-sentinel' }) })],
  ['missing error key', () => probeResponse({ body: JSON.stringify({ error: { code: 'admission_requests_suspended' } }) })],
  ['wrong error code', () => probeResponse({ body: JSON.stringify({ error: { code: 'open', message: JSON.parse(BODY).error.message } }) })],
  ['wrong error message', () => probeResponse({ body: JSON.stringify({ error: { code: JSON.parse(BODY).error.code, message: 'open' } }) })],
];

const ACTIVATION_RECEIPT_PROBE_MISMATCHES: ReadonlyArray<readonly [
  string,
  () => Response | ReturnType<typeof probeResponse>,
]> = [
  ['location', () => suspendedResponse({ location: 'https://private.example.test/location' })],
  ['status', () => probeResponse({ status: 502 })],
  ['redirected', () => probeResponse({ redirected: true })],
  ['content type', () => probeResponse({ headers: { 'content-type': 'application/json' } })],
  ['CORS origin', () => probeResponse({ headers: { 'access-control-allow-origin': 'https://other.example' } })],
  ['malformed JSON', () => probeResponse({ body: '{private-body-sentinel' })],
  ['extra outer key', () => probeResponse({ body: JSON.stringify({ error: JSON.parse(BODY).error, private: 'private-body-sentinel' }) })],
  ['missing error key', () => probeResponse({ body: JSON.stringify({ error: { code: 'admission_requests_suspended' } }) })],
  ['wrong error code', () => probeResponse({ body: JSON.stringify({ error: { code: 'open', message: JSON.parse(BODY).error.message } }) })],
  ['wrong error message', () => probeResponse({ body: JSON.stringify({ error: { code: JSON.parse(BODY).error.code, message: 'open' } }) })],
];

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-auth-bridge-chain-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const receipt = {
    schemaVersion: 1,
    kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com',
    bridgeSourceCommit: SOURCE,
    notificationDeliveryContractDigest: '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9',
    notificationClientCount: 1,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true,
    publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false,
    accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest: 'b'.repeat(64),
    preparedAt: '2026-08-29T23:00:00.000Z',
    expiresAt: '2026-08-30T12:00:00.000Z',
  } as const;
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: 'g002-import-inspect',
    workflowInputSha: SOURCE,
    readGit: (args) => {
      if (args[0] === 'rev-parse') return `${SOURCE}\n`;
      throw new Error('unexpected git call');
    },
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: SOURCE,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
  let byte = 0;
  return {
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
    }),
    authority,
    receipt,
    publication,
    home,
    randomBytesImpl: () => Buffer.alloc(32, ++byte),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

function importProof(lane: 'g002' | 'ptr', disposition: 'adopted' | 'no-effect') {
  return disposition === 'adopted'
    ? {
      disposition,
      sourceCommit: SOURCE,
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      receiptDigest: lane === 'g002' ? '4'.repeat(64) : '5'.repeat(64),
    }
    : {
      disposition,
      sourceCommit: SOURCE,
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      noEffectDigest: lane === 'g002' ? '6'.repeat(64) : '7'.repeat(64),
    };
}

function ownerProvisionProof() {
  return {
    sourceCommit: SOURCE,
    deploymentId: DEPLOYMENT_ID,
    workerVersionId: VERSION_ID,
    ptrDatabaseIdentity: 'f'.repeat(64),
    ptrBindingDigest: '1'.repeat(64),
    receiptDigest: '5'.repeat(64),
    provisionReceiptDigest: '9'.repeat(64),
  };
}

function bridgeOptions(
  local: ReturnType<typeof fixture>,
  overrides: Record<string, unknown> = {},
) {
  return {
    authority: local.authority,
    privateState: local.state,
    repositoryRoot: process.cwd(),
    reportedHome: local.home,
    deploymentAttester: () => ({
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE,
      controlPlaneAttestationDigest: 'c'.repeat(64),
      publicAttestationDigest: 'd'.repeat(64),
      privateAttestationDigest: 'e'.repeat(64),
      observedAt: NOW.toISOString(),
    }),
    bindingAttester: () => ({
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      ptrBindingAttestationDigest: '2'.repeat(64),
      observedAt: NOW.toISOString(),
    }),
    fetchImpl: async () => suspendedResponse(),
    now: () => new Date(NOW),
    randomBytesImpl: local.randomBytesImpl,
    inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'no-effect'),
    authenticateImportResult: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'adopted'),
    resolveOwnerProvisionReceipt: () => ownerProvisionProof(),
    testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => ({
      receipt: local.receipt,
      receiptDigest: local.publication.receiptDigest,
    }),
    testOnlyResolveCompletedJournal: () => ({
      journalHeadDigest: '3'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      outcome: 'verified',
      predecessorDigest: null,
      runId: '42',
      runAttempt: 1,
      completedAt: NOW.toISOString(),
      sourceCommit: SOURCE,
      workerVersionId: VERSION_ID,
    }),
    ...overrides,
  };
}

async function completeBridge(
  local: ReturnType<typeof fixture>,
  fetchImpl = async () => suspendedResponse(),
  overrides: Record<string, unknown> = {},
) {
  const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
    fetchImpl,
    inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'no-effect'),
    ...overrides,
  }) as never);
  await applyGateThroughContinuation(local, bridge, 'g002', () => undefined);
  await applyGateThroughContinuation(local, bridge, 'ptr', () => undefined);
  return bridge;
}

/**
 * Builds an on-disk recovery authority exactly as the durable recovery writer
 * must have written it.  Tests mutate the returned record only when they are
 * explicitly checking a malformed-tuple rejection; recovery coexistence tests
 * use the untouched bytes and independently derived filename.
 */
function canonicalRecoveryAuthority(input: Readonly<{
  receipt: Record<string, unknown>;
  completedJournalHeadDigest: string;
  completedJournalPredecessorDigest: string | null;
  completedAt: string;
  sourceCommit?: string;
  deploymentId?: string;
  workerVersionId?: string;
  ptrDatabaseIdentity?: string;
  ptrBindingDigest?: string;
}>) {
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(input.receipt as never);
  const sourceCommit = input.sourceCommit ?? SOURCE;
  if (input.receipt.bridgeSourceCommit !== sourceCommit) {
    throw new Error('canonical recovery authority receipt/source mismatch');
  }
  const deploymentId = input.deploymentId ?? DEPLOYMENT_ID;
  const workerVersionId = input.workerVersionId ?? VERSION_ID;
  const ptrDatabaseIdentity = input.ptrDatabaseIdentity ?? 'f'.repeat(64);
  const ptrBindingDigest = input.ptrBindingDigest ?? '1'.repeat(64);
  const record = {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-auth-bridge-import-authority-v1',
    recordType: 'deploymentAuthority',
    sourceCommit,
    previousRecordDigest: null,
    preparedReceiptBodyBase64: publication.receiptBytesBase64,
    preparedReceiptDigest: publication.receiptDigest,
    preparedAt: input.receipt.preparedAt,
    expiresAt: input.receipt.expiresAt,
    completedJournalHeadDigest: input.completedJournalHeadDigest,
    completedJournalProfile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
    completedJournalOutcome: 'verified-read-only-recovery',
    completedJournalPredecessorDigest: input.completedJournalPredecessorDigest,
    runId: '42',
    runAttempt: 1,
    completedAt: input.completedAt,
    deploymentId,
    workerVersionId,
    bridgeSourceCommit: sourceCommit,
    ptrDatabaseIdentity,
    ptrBindingDigest,
    controlPlaneAttestationDigest: 'c'.repeat(64),
    publicAttestationDigest: 'd'.repeat(64),
    privateAttestationDigest: 'e'.repeat(64),
    ptrBindingAttestationDigest: '2'.repeat(64),
    recordedAt: input.completedAt,
  };
  const digest = createHash('sha256').update(JSON.stringify([
    'warpkeep-sealed-realms-auth-bridge-import-authority-v1',
    sourceCommit,
    publication.receiptDigest,
    input.completedJournalHeadDigest,
    deploymentId,
    workerVersionId,
    ptrBindingDigest,
  ])).digest('hex');
  const relativePath = `bridge/auth-bridge-import-authority-${digest}.jsonl`;
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  return { publication, record, digest, relativePath, bytes };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(value => { resolve = value; });
  return { promise, resolve };
}

type MutableBridgeFacts = {
  receipt: Record<string, unknown>;
  publication: { receiptDigest: string };
  journal: Record<string, unknown>;
};

const AUTHORITY_DRIFT_CASES: Array<[string, (state: MutableBridgeFacts) => void]> = [
  ['prepared receipt digest', state => {
    const receipt = {
      ...state.receipt,
      liveAttestationDigest: 'f'.repeat(64),
    };
    state.receipt = receipt;
    state.publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt as never);
  }],
  ['journal head', state => { state.journal = { ...state.journal, journalHeadDigest: '4'.repeat(64) }; }],
  ['journal profile', state => { state.journal = { ...state.journal, profile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1' }; }],
  ['journal outcome', state => { state.journal = { ...state.journal, outcome: 'already-verified' }; }],
  ['journal predecessor', state => { state.journal = { ...state.journal, predecessorDigest: '4'.repeat(64) }; }],
  ['journal run', state => { state.journal = { ...state.journal, runId: '43' }; }],
  ['journal attempt', state => { state.journal = { ...state.journal, runAttempt: 2 }; }],
  ['journal completion', state => { state.journal = { ...state.journal, completedAt: '2026-08-30T00:00:01.000Z' }; }],
];

describe('sealed-realms auth bridge state', () => {
  it('requires an unforgeable test capability before accepting test-only home, clock, or randomness seams', () => {
    const local = fixture();
    try {
      const options = bridgeOptions(local, {
        testOnlyCapability: undefined,
        testOnlyResolvePreparedReceipt: undefined,
        testOnlyResolveCompletedJournal: undefined,
      });
      expect(() => createSealedRealmsProductionAuthBridgeState(options as never))
        .toThrow('SEALED_REALMS_AUTH_BRIDGE_TEST_ONLY_CAPABILITY_INVALID');
    } finally {
      local.cleanup();
    }
  });

  it('makes the exact no-redirect POST and OPTIONS suspension probes without exposing bodies', async () => {
    const fetchImpl = vi.fn(async () => suspendedResponse());

    const observation = await inspectSealedRealmsAdmissionSuspension({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: 'https://warpkeep.com',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, URL, {
      method: 'OPTIONS',
      redirect: 'manual',
      headers: {
        origin: 'https://warpkeep.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, x-warpkeep-expected-fid',
      },
    });
    expect(observation).toMatchObject({
      postNoRedirect: true,
      postContentType: 'application/json; charset=utf-8',
      postAccessControlAllowOrigin: 'https://warpkeep.com',
      postProbeStatus: 503,
      optionsNoRedirect: true,
      optionsContentType: 'application/json; charset=utf-8',
      optionsAccessControlAllowOrigin: 'https://warpkeep.com',
      optionsProbeStatus: 503,
    });
    expect(JSON.stringify(observation)).not.toContain('admission_requests_suspended');
    expect(JSON.stringify(observation)).not.toContain('New admission requests');
  });

  it('rejects a redirect location before yielding any observation', async () => {
    await expect(inspectSealedRealmsAdmissionSuspension({
      fetchImpl: async () => suspendedResponse({ location: 'https://private.example.test' }),
    })).rejects.toMatchObject({
      code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
    } satisfies Partial<SealedRealmsProductionAuthBridgeStateError>);
  });

  it.each([
    ['wrong status', probeResponse({ status: 200 })],
    ['redirected response', probeResponse({ redirected: true })],
    ['wrong content type', probeResponse({ headers: { 'content-type': 'application/json' } })],
    ['wrong CORS origin', probeResponse({ headers: { 'access-control-allow-origin': 'https://other.example' } })],
    ['unexpected body key', probeResponse({ body: JSON.stringify({ error: { code: 'admission_requests_suspended', message: 'New admission requests are temporarily suspended.', detail: 'private-body-sentinel' } }) })],
    ['wrong error code', probeResponse({ body: JSON.stringify({ error: { code: 'open', message: 'New admission requests are temporarily suspended.' } }) })],
    ['wrong error message', probeResponse({ body: JSON.stringify({ error: { code: 'admission_requests_suspended', message: 'open' } }) })],
  ])('rejects exact suspension probe mismatch: %s', async (_label, response) => {
    await expect(inspectSealedRealmsAdmissionSuspension({
      fetchImpl: async () => response as unknown as Response,
    })).rejects.toMatchObject({
      code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
    });
  });

  it.each([
    ['location', () => suspendedResponse({ location: 'https://private.example.test/location' })],
    ['status', () => probeResponse({ status: 502 })],
    ['redirected', () => probeResponse({ redirected: true })],
    ['content type', () => probeResponse({ headers: { 'content-type': 'application/json' } })],
    ['CORS origin', () => probeResponse({ headers: { 'access-control-allow-origin': 'https://other.example' } })],
    ['malformed JSON', () => probeResponse({ body: '{private-body-sentinel' })],
    ['extra outer key', () => probeResponse({ body: JSON.stringify({ error: JSON.parse(BODY).error, private: 'private-body-sentinel' }) })],
    ['missing error key', () => probeResponse({ body: JSON.stringify({ error: { code: 'admission_requests_suspended' } }) })],
    ['wrong error code', () => probeResponse({ body: JSON.stringify({ error: { code: 'open', message: JSON.parse(BODY).error.message } }) })],
    ['wrong error message', () => probeResponse({ body: JSON.stringify({ error: { code: JSON.parse(BODY).error.code, message: 'open' } }) })],
  ])('rejects %s before a gate or activation receipt is written', async (_label, response) => {
    const local = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        fetchImpl: async () => response() as Response,
      }) as never);
      await expect(bridge.inspectGate({ lane: 'g002' })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
      });
      expect(await bridge.inspect()).toEqual({
        g002Sealed: false,
        ptrSealed: false,
        complete: false,
      });
      expect(local.state.list({
        root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
      })).toEqual([]);
      await expect(bridge.inspectActivationEvidence()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CHAIN_INCOMPLETE',
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('private-body-sentinel');
      throw error;
    } finally {
      local.cleanup();
    }
  });

  it('records exact POST and OPTIONS headers before either gate can be appended', async () => {
    const local = fixture();
    const calls: Array<{ method: string; headers: Record<string, string>; body?: string }> = [];
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        fetchImpl: async (_url: string, request: RequestInit) => {
          calls.push({
            method: request.method ?? '',
            headers: request.headers as Record<string, string>,
            body: request.body as string | undefined,
          });
          return suspendedResponse();
        },
      }) as never);
      await bridge.inspectGate({ lane: 'g002' });
      expect(calls).toEqual([
        {
          method: 'POST',
          headers: { origin: 'https://warpkeep.com', 'content-type': 'application/json' },
          body: '{}',
        },
        {
          method: 'OPTIONS',
          headers: {
            origin: 'https://warpkeep.com',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization, content-type, x-warpkeep-expected-fid',
          },
          body: undefined,
        },
      ]);
    } finally {
      local.cleanup();
    }
  });

  const rejectValidPostInvalidOptions = async (
    _label: string,
    invalidOptions: () => Response | ReturnType<typeof probeResponse>,
  ) => {
    const gateLocal = fixture();
    const activationLocal = fixture();
    let activationPhase = false;
    let activationCalls = 0;
    try {
      let gateCalls = 0;
      const gateBridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(gateLocal, {
        fetchImpl: async () => {
          gateCalls += 1;
          return gateCalls === 1 ? suspendedResponse() : invalidOptions() as Response;
        },
      }) as never);
      await expect(gateBridge.inspectGate({ lane: 'g002' })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
      });
      expect(gateCalls).toBe(2);
      await expect(gateBridge.inspect()).resolves.toEqual({
        g002Sealed: false, ptrSealed: false, complete: false,
      });

      const activationBridge = await completeBridge(activationLocal, async () => {
        if (!activationPhase) return suspendedResponse();
        activationCalls += 1;
        return activationCalls === 1 ? suspendedResponse() : invalidOptions() as Response;
      });
      activationPhase = true;
      await expect(activationBridge.inspectActivationEvidence()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
      });
      expect(activationCalls).toBe(2);
      expect(activationLocal.state.list({
        root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
      })).toEqual([]);
    } finally {
      gateLocal.cleanup();
      activationLocal.cleanup();
    }
  };

  it.each(SUSPENSION_OPTIONS_MISMATCHES.slice(0, 3))(
    'rejects valid POST plus invalid OPTIONS %s before gate or activation evidence writes',
    rejectValidPostInvalidOptions,
    30_000,
  );

  it.each(SUSPENSION_OPTIONS_MISMATCHES.slice(3, 4))(
    'rejects valid POST plus invalid OPTIONS %s before gate or activation evidence writes',
    rejectValidPostInvalidOptions,
  );

  it.each(SUSPENSION_OPTIONS_MISMATCHES.slice(4, 5))(
    'rejects valid POST plus invalid OPTIONS %s before gate or activation evidence writes',
    rejectValidPostInvalidOptions,
    30_000,
  );

  it.each(SUSPENSION_OPTIONS_MISMATCHES.slice(5))(
    'rejects valid POST plus invalid OPTIONS %s before gate or activation evidence writes',
    rejectValidPostInvalidOptions,
  );

  const rejectInvalidActivationReceiptProbe = async (
    _label: string,
    response: () => Response | ReturnType<typeof probeResponse>,
  ) => {
    const local = fixture();
    let useBadResponse = false;
    try {
      const bridge = await completeBridge(local, async () => (
        useBadResponse ? response() as Response : suspendedResponse()
      ));
      useBadResponse = true;
      await expect(bridge.inspectActivationEvidence()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
      });
      expect(local.state.list({
        root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
      })).toEqual([]);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('private-body-sentinel');
      throw error;
    } finally {
      local.cleanup();
    }
  };

  it.each(ACTIVATION_RECEIPT_PROBE_MISMATCHES.slice(0, 4))(
    'does not create an activation receipt for an invalid %s probe',
    rejectInvalidActivationReceiptProbe,
  );

  it.each(ACTIVATION_RECEIPT_PROBE_MISMATCHES.slice(4, 5))(
    'does not create an activation receipt for an invalid %s probe',
    rejectInvalidActivationReceiptProbe,
    30_000,
  );

  it.each(ACTIVATION_RECEIPT_PROBE_MISMATCHES.slice(5))(
    'does not create an activation receipt for an invalid %s probe',
    rejectInvalidActivationReceiptProbe,
  );

  it('writes a private receipt-derived authority chain and consumes each gate before its core', async () => {
    const local = fixture();
    const calls: string[] = [];
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect',
      ptr: 'adopted',
    };
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState({
        authority: local.authority,
        privateState: local.state,
        repositoryRoot: process.cwd(),
        reportedHome: local.home,
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID,
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64),
          publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64),
          observedAt: NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64),
          ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64),
          observedAt: NOW.toISOString(),
        }),
        fetchImpl: async () => suspendedResponse(),
        now: () => new Date(NOW),
        randomBytesImpl: local.randomBytesImpl,
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, dispositions[lane]),
        authenticateImportResult: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, 'adopted') as never,
        resolveOwnerProvisionReceipt: () => ownerProvisionProof(),
        testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
        testOnlyResolvePreparedReceipt: () => ({
          receipt: local.receipt,
          receiptDigest: local.publication.receiptDigest,
        }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: '3'.repeat(64),
          profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
          outcome: 'verified',
          predecessorDigest: null,
          runId: '42',
          runAttempt: 1,
          completedAt: NOW.toISOString(),
          sourceCommit: SOURCE,
          workerVersionId: VERSION_ID,
        }),
      });
      await expect(bridge.establish()).resolves.toEqual({ ready: true });
      await applyGateThroughContinuation(
        local, bridge, 'g002', () => { calls.push('g002'); },
      );
      dispositions.g002 = 'adopted';
      await applyGateThroughContinuation(
        local,
        bridge,
        'ptr',
        () => { throw new Error('adopted import must not invoke core'); },
      );
      await applyOwnerThroughContinuation(
        local,
        bridge,
        () => ({
          receiptDigest: '5'.repeat(64),
          inspectionDigest: '8'.repeat(64),
        }),
        () => ({
          receiptDigest: '5'.repeat(64),
          provisionReceiptDigest: '9'.repeat(64),
        }),
      );
      await bridge.inspectLiveEvidence({
        lane: 'g002',
        inspect: () => ({
          receiptDigest: '4'.repeat(64),
          evidenceDigest: 'a'.repeat(64),
        }),
      });
      await bridge.inspectLiveEvidence({
        lane: 'ptr',
        inspect: () => ({
          receiptDigest: '5'.repeat(64),
          provisionReceiptDigest: '9'.repeat(64),
          evidenceDigest: 'b'.repeat(64),
        }),
      });
      const activation = await bridge.inspectActivationEvidence();

      expect(calls).toEqual(['g002']);
      expect(activation.confirmation).toBeDefined();
      await expect(consumeSealedRealmsProductionActivationEvidenceConfirmation(
        activation.confirmation,
      )).resolves.toEqual({});
      await expect(consumeSealedRealmsProductionActivationEvidenceConfirmation(
        activation.confirmation,
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
      });
      await expect(consumeSealedRealmsProductionActivationEvidenceConfirmation(
        {} as never,
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
      });
      await expect(bridge.inspectActivationEvidence()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_REPLAY',
      });
      await expect(bridge.inspect()).resolves.toEqual({
        g002Sealed: true,
        ptrSealed: true,
        complete: true,
      });
      expect(JSON.stringify(activation)).not.toContain('admission_requests_suspended');
    } finally {
      local.cleanup();
    }
  }, 30_000);

  it('keeps every legacy activation generator route unavailable before claim or effect', async () => {
    const local = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(
        bridgeOptions(local) as never,
      );
      const generate = vi.fn();
      expect(() => createSealedRealmsProductionActivationEvidenceGenerator({ generate }))
        .toThrow(expect.objectContaining({
          code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        }));
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: Object.freeze({}) as never,
        generator: Object.freeze({}) as never,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
      await expect(bridge.consumeActivationEvidenceForContinuation({} as never))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE' });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      local.cleanup();
    }
  });

  it('does not expose confirmation-based import or owner mutation entry points', () => {
    const local = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(
        bridgeOptions(local) as never,
      );
      expect(Object.keys(bridge)).not.toContain('applyGate');
      expect(Object.keys(bridge)).not.toContain('applyOwnerProvision');
      expect((bridge as Record<string, unknown>).applyGate).toBeUndefined();
      expect((bridge as Record<string, unknown>).applyOwnerProvision).toBeUndefined();
    } finally {
      local.cleanup();
    }
  });

  it('keeps activation generation unavailable before reopen, claim, or generator effect', async () => {
    const local = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(
        bridgeOptions(local) as never,
      );
      const generate = vi.fn();
      expect(() => createSealedRealmsProductionActivationEvidenceGenerator({ generate }))
        .toThrow(expect.objectContaining({
          code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        }));
      expect(() => createSealedRealmsProductionActivationLane({
        bridgeState: bridge, task6EGenerator: Object.freeze({}),
      } as never)).toThrow(expect.objectContaining({
        code: 'SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID',
      }));
      const lane = createSealedRealmsProductionActivationLane({ bridgeState: bridge });
      const dispatcher = await protectedDispatcher(
        local,
        'activation-evidence-generate',
        '7001',
        { activationLane: lane },
      );
      await expect(dispatcher.dispatch({
        operation: 'activation-evidence-generate', workflowInputSha: SOURCE,
      })).resolves.toEqual({
        operation: 'activation-evidence-generate',
        status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
      const direct = await protectedContext(
        local, 'activation-evidence-generate', '7002',
      );
      await expect(lane.execute({
        operation: 'activation-evidence-generate',
        authority: direct.authority,
        continuation: direct.continuation,
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE' });
      // The transition fails before reopen/claim, so the same protected run is
      // not stranded behind a reserved effect and still fails at the fixed gate.
      await expect(lane.execute({
        operation: 'activation-evidence-generate',
        authority: direct.authority,
        continuation: direct.continuation,
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE' });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      local.cleanup();
    }
  });

  it('rejects a byte-swapped activation receipt on reopen while generation remains unavailable', async () => {
    const local = fixture();
    const generate = vi.fn();
    try {
      const bridge = await completeBridge(local, undefined, { now: () => new Date(NOW) });
      await bridge.inspectActivationEvidenceForContinuation();
      const receiptName = local.state.list({
        root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
      }).at(-1)!;
      const relativePath = `bridge/activation-evidence/${receiptName}`;
      const bytes = local.state.read({ root: 'runtime', relativePath });
      bytes[0] ^= 1;
      local.state.remove({ root: 'runtime', relativePath });
      local.state.write({ root: 'runtime', relativePath, bytes });
      bytes.fill(0);
      const restarted = createSealedRealmsProductionAuthBridgeState(
        bridgeOptions(local) as never,
      );
      await expect(restarted.reopenActivationEvidenceContinuation())
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
        });
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: Object.freeze({}) as never,
        generator: Object.freeze({}) as never,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      local.cleanup();
    }
  }, 30_000);

  it('allows one durable continuation claim to release each concurrent gate or owner effect', async () => {
    const local = fixture();
    const ownerLocal = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local) as never);
      const gateBinding = await bridge.inspectGateForContinuation({ lane: 'g002' });
      const gateIssued = await protectedSetupContext(local, 'g002-import-inspect');
      await issueSealedRealmsProductionContinuation({
        store: gateIssued.continuation.store,
        permit: gateIssued.continuation.permit,
        sourceAuthority: gateIssued.authority,
        kind: 'g002-import',
        runId: gateIssued.continuation.runId,
        runAttempt: gateIssued.continuation.runAttempt,
        ...gateBinding,
      });
      const gateClaimed = await protectedSetupContext(local, 'g002-import-apply');
      const releaseGate = deferred<void>();
      const gateStarted = deferred<void>();
      const importCore = vi.fn(async () => {
        gateStarted.resolve();
        await releaseGate.promise;
      });
      const claimGate = () => claimSealedRealmsProductionContinuation({
        store: gateClaimed.continuation.store,
        permit: gateClaimed.continuation.permit,
        sourceAuthority: gateClaimed.authority,
        kind: 'g002-import',
        runId: gateClaimed.continuation.runId,
        runAttempt: gateClaimed.continuation.runAttempt,
        ...gateBinding,
        effect: claim => bridge.applyGateForContinuation({
          claim,
          store: gateClaimed.continuation.store,
          sourceAuthority: gateClaimed.authority,
          kind: 'g002-import',
          runId: gateClaimed.continuation.runId,
          runAttempt: gateClaimed.continuation.runAttempt,
          ...gateBinding,
          lane: 'g002',
          apply: importCore,
        }),
      });
      const firstGate = claimGate();
      const secondGate = claimGate();
      const gates = Promise.allSettled([firstGate, secondGate]);
      await gateStarted.promise;
      expect(importCore).toHaveBeenCalledTimes(1);
      releaseGate.resolve();
      const settledGates = await gates;
      expect(settledGates.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(settledGates.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(importCore).toHaveBeenCalledTimes(1);

      const ownerDispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
        g002: 'no-effect', ptr: 'no-effect',
      };
      const complete = createSealedRealmsProductionAuthBridgeState(bridgeOptions(ownerLocal, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, ownerDispositions[lane]),
      }) as never);
      await applyGateThroughContinuation(ownerLocal, complete, 'g002', () => undefined);
      ownerDispositions.g002 = 'adopted';
      await applyGateThroughContinuation(ownerLocal, complete, 'ptr', () => undefined);
      ownerDispositions.ptr = 'adopted';
      const ownerBinding = await complete.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      });
      const ownerIssued = await protectedSetupContext(
        ownerLocal, 'ptr-owner-provision-inspect',
      );
      await issueSealedRealmsProductionContinuation({
        store: ownerIssued.continuation.store,
        permit: ownerIssued.continuation.permit,
        sourceAuthority: ownerIssued.authority,
        kind: 'ptr-owner-provision',
        runId: ownerIssued.continuation.runId,
        runAttempt: ownerIssued.continuation.runAttempt,
        ...ownerBinding,
      });
      const ownerClaimed = await protectedSetupContext(ownerLocal, 'ptr-owner-provision');
      const releaseOwner = deferred<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>();
      const ownerStarted = deferred<void>();
      const provision = vi.fn(async () => {
        ownerStarted.resolve();
        return releaseOwner.promise;
      });
      const claimOwner = () => claimSealedRealmsProductionContinuation({
        store: ownerClaimed.continuation.store,
        permit: ownerClaimed.continuation.permit,
        sourceAuthority: ownerClaimed.authority,
        kind: 'ptr-owner-provision',
        runId: ownerClaimed.continuation.runId,
        runAttempt: ownerClaimed.continuation.runAttempt,
        ...ownerBinding,
        effect: claim => complete.applyOwnerProvisionForContinuation({
          claim,
          store: ownerClaimed.continuation.store,
          sourceAuthority: ownerClaimed.authority,
          kind: 'ptr-owner-provision',
          runId: ownerClaimed.continuation.runId,
          runAttempt: ownerClaimed.continuation.runAttempt,
          ...ownerBinding,
          provision,
        }),
      });
      const firstOwner = claimOwner();
      const secondOwner = claimOwner();
      const owners = Promise.allSettled([firstOwner, secondOwner]);
      await ownerStarted.promise;
      expect(provision).toHaveBeenCalledTimes(1);
      releaseOwner.resolve({ receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64) });
      const settledOwners = await owners;
      expect(settledOwners.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(settledOwners.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(provision).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
      ownerLocal.cleanup();
    }
  }, 30_000);

  it('permits only one durable owner-provision inspection for an unchanged completed chain', async () => {
    const local = fixture();
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect', ptr: 'no-effect',
    };
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, dispositions[lane]),
      }) as never);
      await applyGateThroughContinuation(local, bridge, 'g002', () => undefined);
      dispositions.g002 = 'adopted';
      await applyGateThroughContinuation(local, bridge, 'ptr', () => undefined);
      dispositions.ptr = 'adopted';

      const first = await bridge.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      });
      await expect(bridge.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONTINUATION_ORPHANED',
      });
      const provision = vi.fn(() => ({
        receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64),
      }));
      await expect(applyOwnerBindingThroughContinuation(local, bridge, first, provision))
        .resolves.toEqual({ status: 'completed' });
      expect(provision).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
    }
  }, 30_000);

  it('rejects a gate or owner mutation when its authenticated observation ages during the callback', async () => {
    const gateLocal = fixture();
    const ownerLocal = fixture();
    let clock = new Date(NOW);
    const dynamicAttesters = {
      now: () => new Date(clock),
      deploymentAttester: () => ({
        deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
        controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
        privateAttestationDigest: 'e'.repeat(64), observedAt: clock.toISOString(),
      }),
      bindingAttester: () => ({
        ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
        ptrBindingAttestationDigest: '2'.repeat(64), observedAt: clock.toISOString(),
      }),
    };
    try {
      const gateBridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(gateLocal, dynamicAttesters) as never);
      await expect(applyGateThroughContinuation(
        gateLocal,
        gateBridge,
        'g002',
        () => {
          clock = new Date(NOW.getTime() + 5 * 60 * 1_000 + 1);
          return undefined;
        },
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });

      clock = new Date(NOW);
      const ownerDispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
        g002: 'no-effect', ptr: 'no-effect',
      };
      const ownerBridge = await completeBridge(ownerLocal, undefined, {
        ...dynamicAttesters,
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, ownerDispositions[lane]),
      });
      ownerDispositions.g002 = 'adopted';
      ownerDispositions.ptr = 'adopted';
      const provision = vi.fn(() => {
        clock = new Date(NOW.getTime() + 5 * 60 * 1_000 + 1);
        return ownerProvisionProof();
      });
      await expect(applyOwnerThroughContinuation(
        ownerLocal,
        ownerBridge,
        () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
        provision,
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });
      expect(provision).toHaveBeenCalledTimes(1);
    } finally {
      gateLocal.cleanup();
      ownerLocal.cleanup();
    }
  }, 30_000);

  it('samples completion after the second journal resolver and rejects expiry before mutation', async () => {
    const local = fixture();
    let clock = new Date(NOW);
    let journalCalls = 0;
    const receipt = {
      ...local.receipt,
      expiresAt: new Date(NOW.getTime() + 1_000).toISOString(),
    };
    const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt as never);
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        now: () => new Date(clock),
        testOnlyResolvePreparedReceipt: () => ({ receipt, receiptDigest: publication.receiptDigest }),
        testOnlyResolveCompletedJournal: () => {
          journalCalls += 1;
          if (journalCalls === 2) clock = new Date(NOW.getTime() + 2_000);
          return {
            journalHeadDigest: '3'.repeat(64),
            profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
            outcome: 'verified', predecessorDigest: null, runId: '42', runAttempt: 1,
            completedAt: NOW.toISOString(), sourceCommit: SOURCE, workerVersionId: VERSION_ID,
          };
        },
      }) as never);
      await expect(bridge.establish()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT',
      });
      expect(journalCalls).toBe(2);
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
    } finally {
      local.cleanup();
    }
  });

  it('rejects a source-swapped dispatcher authority before G002, PTR, or activation dependencies', async () => {
    const local = fixture();
    const calls: string[] = [];
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState({
        authority: local.authority,
        privateState: local.state,
        repositoryRoot: process.cwd(),
        reportedHome: local.home,
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID,
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64),
          publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64),
          observedAt: NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64),
          ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64),
          observedAt: NOW.toISOString(),
        }),
        fetchImpl: async () => suspendedResponse(),
        now: () => new Date(NOW),
        randomBytesImpl: local.randomBytesImpl,
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'no-effect'),
        authenticateImportResult: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'adopted') as never,
        resolveOwnerProvisionReceipt: () => ownerProvisionProof(),
        testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
        testOnlyResolvePreparedReceipt: () => ({ receipt: local.receipt, receiptDigest: local.publication.receiptDigest }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: '3'.repeat(64),
          profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
          outcome: 'verified', predecessorDigest: null, runId: '42', runAttempt: 1,
          completedAt: NOW.toISOString(), sourceCommit: SOURCE, workerVersionId: VERSION_ID,
        }),
      });
      const postflight = () => ({
        outcome: 'no-effect' as const, databaseIdentity: null, publicationReceiptDigest: null,
        observationDigest: '8'.repeat(64), observedAt: NOW.toISOString(),
      });
      const g002 = createSealedRealmsProductionG002Lane({
        reconciler: createSealedRealmsProductionPublicationReconciler({ privateState: local.state, lane: 'g002', postflight }),
        bridgeState: bridge,
        createPublishMarker: async () => { calls.push('g002-marker'); },
        publish: async () => { calls.push('g002-publish'); },
        importCore: async () => { calls.push('g002-core'); },
        liveInspect: async () => { calls.push('g002-live'); return { receiptDigest: '4'.repeat(64), evidenceDigest: '9'.repeat(64) }; },
      });
      const ptr = createSealedRealmsProductionPtrLane({
        reconciler: createSealedRealmsProductionPublicationReconciler({ privateState: local.state, lane: 'ptr', postflight }),
        bridgeState: bridge,
        createPublishMarker: async () => { calls.push('ptr-marker'); },
        publish: async () => { calls.push('ptr-publish'); },
        importCore: async () => { calls.push('ptr-core'); },
        inspectOwnerProvision: async () => { calls.push('ptr-inspect'); return { receiptDigest: '5'.repeat(64), inspectionDigest: '9'.repeat(64) }; },
        provisionOwner: async () => { calls.push('ptr-owner'); return { receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64) }; },
        liveInspect: async () => { calls.push('ptr-live'); return { receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64), evidenceDigest: 'a'.repeat(64) }; },
      });
      const activation = createSealedRealmsProductionActivationLane({ bridgeState: bridge });
      vi.stubGlobal('WebSocket', class WebSocket {});
      const g002Dispatcher = await protectedDispatcher(
        local, 'g002-import-inspect', '7101', { g002Lane: g002 }, SWAPPED_SOURCE,
      );
      const ptrDispatcher = await protectedDispatcher(
        local, 'ptr-import-inspect', '7102', { ptrLane: ptr }, SWAPPED_SOURCE,
      );
      const activationDispatcher = await protectedDispatcher(
        local,
        'activation-evidence-inspect',
        '7103',
        { activationLane: activation },
        SWAPPED_SOURCE,
      );
      await expect(g002Dispatcher.dispatch({
        operation: 'g002-import-inspect', workflowInputSha: SWAPPED_SOURCE,
      }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      await expect(ptrDispatcher.dispatch({
        operation: 'ptr-import-inspect', workflowInputSha: SWAPPED_SOURCE,
      }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      await expect(activationDispatcher.dispatch({
        operation: 'activation-evidence-inspect', workflowInputSha: SWAPPED_SOURCE,
      }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      local.cleanup();
    }
  });

  it.each(AUTHORITY_DRIFT_CASES)('rejects a swapped %s before it can append a gate', async (_label, mutate) => {
    const local = fixture();
    const state: MutableBridgeFacts = {
      receipt: local.receipt as unknown as Record<string, unknown>,
      publication: local.publication,
      journal: {
        journalHeadDigest: '3'.repeat(64),
        profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
        outcome: 'verified',
        predecessorDigest: null,
        runId: '42',
        runAttempt: 1,
        completedAt: NOW.toISOString(),
        sourceCommit: SOURCE,
        workerVersionId: VERSION_ID,
      },
    };
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        testOnlyResolvePreparedReceipt: () => ({
          receipt: state.receipt,
          receiptDigest: state.publication.receiptDigest,
        }),
        testOnlyResolveCompletedJournal: () => state.journal,
      }) as never);
      await bridge.establish();
      const before = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' });
      mutate(state);
      await expect(bridge.inspectGate({ lane: 'g002' })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT',
      });
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual(before);
      await expect(bridge.inspect()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT',
      });
    } finally {
      local.cleanup();
    }
  });

  it('terminalizes an ambiguous gate from immutable adoption without replay or local reconciliation mutation', async () => {
    const local = fixture();
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect', ptr: 'no-effect',
    };
    let coreCalls = 0;
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState({
        authority: local.authority,
        privateState: local.state,
        repositoryRoot: process.cwd(),
        reportedHome: local.home,
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64), observedAt: NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64), observedAt: NOW.toISOString(),
        }),
        fetchImpl: async () => suspendedResponse(), now: () => new Date(NOW),
        randomBytesImpl: local.randomBytesImpl,
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, dispositions[lane]),
        authenticateImportResult: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(lane, 'adopted') as never,
        resolveOwnerProvisionReceipt: () => ownerProvisionProof(),
        testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
        testOnlyResolvePreparedReceipt: () => ({ receipt: local.receipt, receiptDigest: local.publication.receiptDigest }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: '3'.repeat(64), profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
          outcome: 'verified', predecessorDigest: null, runId: '42', runAttempt: 1,
          completedAt: NOW.toISOString(), sourceCommit: SOURCE, workerVersionId: VERSION_ID,
        }),
      });
      await expect(applyGateThroughContinuation(
        local,
        bridge,
        'g002',
        () => { coreCalls += 1; throw new Error('simulated transport ambiguity'); },
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });
      dispositions.g002 = 'adopted';
      const selected = await bridge.reopenGateContinuation({ lane: 'g002' });
      const ambiguousRun = await protectedSetupContext(local, 'g002-import-apply');
      const recovery = await protectedContext(
        local,
        'g002-import-apply',
        nextProtectedRunId(),
        SOURCE,
        new Set([ambiguousRun.continuation.runId]),
      );
      await reconcileSealedRealmsProductionContinuation({
        store: recovery.continuation.store,
        permit: recovery.continuation.permit,
        sourceAuthority: recovery.authority,
        kind: 'g002-import',
        runId: recovery.continuation.runId,
        runAttempt: recovery.continuation.runAttempt,
        ...selected,
        readOnlyReconcile: () => bridge.reconcileGateContinuation({
          selection: selected,
        }),
      });
      expect(coreCalls).toBe(1);
      await expect(bridge.inspect()).resolves.toEqual({
        g002Sealed: false, ptrSealed: false, complete: false,
      });
    } finally {
      local.cleanup();
    }
  }, 30_000);

  it.each(['complete', 'ptr'] as const)(
    'adopts exactly one immutable expired %s predecessor beside an already-written recovery chain',
    async (predecessorPhase) => {
    const local = fixture();
    const OLD_NOW = new Date('2026-08-30T00:30:00.000Z');
    const RECOVERY_NOW = new Date('2026-08-30T02:00:00.000Z');
    const oldReceipt = {
      ...local.receipt,
      preparedAt: '2026-08-30T00:00:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    };
    const oldPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(oldReceipt as never);
    const recoveryReceipt = {
      ...local.receipt,
      liveAttestationDigest: '9'.repeat(64),
      preparedAt: '2026-08-30T01:30:00.000Z',
      expiresAt: '2026-08-30T05:00:00.000Z',
    };
    const recoveryPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(recoveryReceipt as never);
    try {
      const oldOptions = {
        now: () => new Date(OLD_NOW),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64), observedAt: OLD_NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64), observedAt: OLD_NOW.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({ receipt: oldReceipt, receiptDigest: oldPublication.receiptDigest }),
      };
      const old = predecessorPhase === 'complete'
        ? await completeBridge(local, undefined, oldOptions)
        : createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, oldOptions) as never);
      if (predecessorPhase === 'ptr') {
        await applyGateThroughContinuation(local, old, 'g002', () => undefined);
      }
      await expect(old.inspect()).resolves.toEqual(predecessorPhase === 'complete'
        ? { g002Sealed: true, ptrSealed: true, complete: true }
        : { g002Sealed: true, ptrSealed: false, complete: false });
      const oldName = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
        .find(name => name.startsWith('auth-bridge-import-authority-'))!;
      const oldBytes = local.state.read({ root: 'runtime', relativePath: `bridge/${oldName}` });
      const recoveryRecord = {
        schemaVersion: 1,
        profile: 'warpkeep-sealed-realms-auth-bridge-import-authority-v1',
        recordType: 'deploymentAuthority',
        sourceCommit: SOURCE,
        previousRecordDigest: null,
        preparedReceiptBodyBase64: recoveryPublication.receiptBytesBase64,
        preparedReceiptDigest: recoveryPublication.receiptDigest,
        preparedAt: recoveryReceipt.preparedAt,
        expiresAt: recoveryReceipt.expiresAt,
        completedJournalHeadDigest: '8'.repeat(64),
        completedJournalProfile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
        completedJournalOutcome: 'verified-read-only-recovery',
        completedJournalPredecessorDigest: '3'.repeat(64),
        runId: '42', runAttempt: 1, completedAt: RECOVERY_NOW.toISOString(),
        deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
        ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
        controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
        privateAttestationDigest: 'e'.repeat(64), ptrBindingAttestationDigest: '2'.repeat(64),
        recordedAt: RECOVERY_NOW.toISOString(),
      };
      const recoveryChainDigest = createHash('sha256').update(JSON.stringify([
        'warpkeep-sealed-realms-auth-bridge-import-authority-v1', SOURCE,
        recoveryPublication.receiptDigest, '8'.repeat(64), DEPLOYMENT_ID, VERSION_ID,
        '1'.repeat(64),
      ])).digest('hex');
      const recoveryRelativePath = `bridge/auth-bridge-import-authority-${recoveryChainDigest}.jsonl`;
      const recoveryBytes = Buffer.from(`${JSON.stringify(recoveryRecord)}\n`, 'utf8');
      local.state.write({ root: 'runtime', relativePath: recoveryRelativePath, bytes: recoveryBytes });
      const recoveryOptions = bridgeOptions(local, {
        now: () => new Date(RECOVERY_NOW),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64), observedAt: RECOVERY_NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64), observedAt: RECOVERY_NOW.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({
          receipt: recoveryReceipt,
          receiptDigest: recoveryPublication.receiptDigest,
        }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: '8'.repeat(64),
          profile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
          outcome: 'verified-read-only-recovery',
          predecessorDigest: '3'.repeat(64),
          runId: '42', runAttempt: 1, completedAt: RECOVERY_NOW.toISOString(),
          sourceCommit: SOURCE, workerVersionId: VERSION_ID,
        }),
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) => importProof(
          lane,
          predecessorPhase === 'complete' || lane === 'g002' ? 'adopted' : 'no-effect',
        ),
      });
      const recovery = createSealedRealmsProductionAuthBridgeState(recoveryOptions as never);
      await expect(recovery.establish()).resolves.toEqual({ ready: true });
      const ptrCore = vi.fn(async () => undefined);
      // The first read persists an owner-private ambiguity fence. A recreated
      // read then adopts the exact immutable receipt without invoking an
      // importer or carrying the discarded process-local confirmation.
      await recovery.inspectGate({ lane: 'g002' });
      const afterG002 = createSealedRealmsProductionAuthBridgeState(recoveryOptions as never);
      await afterG002.inspectGate({ lane: 'g002' });
      if (predecessorPhase === 'complete') {
        await afterG002.inspectGate({ lane: 'ptr' });
        const afterPtr = createSealedRealmsProductionAuthBridgeState(recoveryOptions as never);
        await afterPtr.inspectGate({ lane: 'ptr' });
      } else {
        await applyGateThroughContinuation(local, afterG002, 'ptr', ptrCore);
      }
      expect(ptrCore).toHaveBeenCalledTimes(predecessorPhase === 'complete' ? 0 : 1);
      await expect(afterG002.inspect()).resolves.toEqual({
        g002Sealed: true, ptrSealed: true, complete: true,
      });
      const names = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
        .filter(name => name.startsWith('auth-bridge-import-authority-'));
      expect(names).toHaveLength(2);
      expect(local.state.read({ root: 'runtime', relativePath: `bridge/${oldName}` })).toEqual(oldBytes);
      const completedRecoveryBytes = local.state.read({ root: 'runtime', relativePath: recoveryRelativePath });
      expect(completedRecoveryBytes.subarray(0, recoveryBytes.byteLength)).toEqual(recoveryBytes);
      expect(completedRecoveryBytes.toString('utf8').trimEnd().split('\n')).toHaveLength(5);
      const replayNames = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' });
      const replayBytes = new Map(replayNames.filter(name => name.endsWith('.jsonl')).map(name => {
        const bytes = local.state.read({ root: 'runtime', relativePath: `bridge/${name}` });
        return [name, bytes] as const;
      }));
      const replay = createSealedRealmsProductionAuthBridgeState(recoveryOptions as never);
      await expect(replay.establish()).resolves.toEqual({ ready: true });
      await expect(replay.inspect()).resolves.toEqual({ g002Sealed: true, ptrSealed: true, complete: true });
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual(replayNames);
      for (const [name, bytes] of replayBytes) {
        expect(local.state.read({ root: 'runtime', relativePath: `bridge/${name}` })).toEqual(bytes);
        bytes.fill(0);
      }
      expect(ptrCore).toHaveBeenCalledTimes(predecessorPhase === 'complete' ? 0 : 1);
      oldBytes.fill(0);
      recoveryBytes.fill(0);
      completedRecoveryBytes.fill(0);
    } finally {
      local.cleanup();
    }
    },
    30_000,
  );

  const recoveryRejections = [
    ['direct expired receipt reuse', 'complete', (context: any) => {
      const authority = canonicalRecoveryAuthority({
        receipt: context.oldReceipt,
        completedJournalHeadDigest: '8'.repeat(64),
        completedJournalPredecessorDigest: '3'.repeat(64),
        completedAt: context.recoveryNow.toISOString(),
      });
      context.record = authority.record;
      context.filenameDigest = authority.digest;
      context.resolvedReceipt = context.oldReceipt;
      context.resolvedPublication = authority.publication;
    }],
    ['wrong recovery journal predecessor', 'complete', (context: any) => {
      const authority = canonicalRecoveryAuthority({
        receipt: context.recoveryReceipt,
        completedJournalHeadDigest: '8'.repeat(64),
        completedJournalPredecessorDigest: '4'.repeat(64),
        completedAt: context.recoveryNow.toISOString(),
      });
      context.record = authority.record;
      context.filenameDigest = authority.digest;
      context.resolvedJournalPredecessorDigest = '4'.repeat(64);
    }],
    ['receipt tuple rebinding', 'complete', (context: any) => {
      context.record.preparedReceiptDigest = '5'.repeat(64);
    }],
    ['head tuple rebinding', 'complete', (context: any) => {
      context.record.completedJournalHeadDigest = '6'.repeat(64);
    }],
    ['filename tuple rebinding', 'complete', (context: any) => {
      context.filenameDigest = '7'.repeat(64);
    }],
    ['deployment id drift', 'complete', (context: any) => {
      context.deploymentId = '323e4567-e89b-42d3-a456-426614174000';
    }],
    ['worker version drift', 'complete', (context: any) => {
      context.deploymentWorkerVersionId = '423e4567-e89b-42d3-a456-426614174000';
    }],
    ['record source commit drift', 'complete', (context: any) => {
      const authority = canonicalRecoveryAuthority({
        receipt: {
          ...context.recoveryReceipt,
          bridgeSourceCommit: SWAPPED_SOURCE,
        },
        completedJournalHeadDigest: '8'.repeat(64),
        completedJournalPredecessorDigest: '3'.repeat(64),
        completedAt: context.recoveryNow.toISOString(),
        sourceCommit: SWAPPED_SOURCE,
      });
      context.record = authority.record;
      context.filenameDigest = authority.digest;
    }],
    ['deployment bridge source drift', 'complete', (context: any) => {
      context.deploymentBridgeSourceCommit = SWAPPED_SOURCE;
    }],
    ['PTR identity drift', 'complete', (context: any) => {
      context.bindingPtrDatabaseIdentity = '0'.repeat(64);
    }],
    ['PTR binding drift', 'complete', (context: any) => {
      context.bindingPtrBindingDigest = '0'.repeat(64);
    }],
    ['orphan recovery authority', 'complete', (context: any) => {
      context.removeOld = true;
    }],
    ['duplicate eligible recovery authority', 'complete', (context: any) => {
      const receipt = { ...context.recoveryReceipt, liveAttestationDigest: '8'.repeat(64), preparedAt: '2026-08-30T01:31:00.000Z' };
      const authority = canonicalRecoveryAuthority({
        receipt,
        completedJournalHeadDigest: '7'.repeat(64),
        completedJournalPredecessorDigest: '3'.repeat(64),
        completedAt: context.recoveryNow.toISOString(),
      });
      context.extra = [authority];
    }],
    ['old file modification', 'ptr', (context: any) => { context.oldOverwrite = true; }],
    ['pending PTR predecessor extension', 'ptr', async (context: any) => {
      await context.old.inspectGate({ lane: 'ptr' });
    }],
  ] as const;

  it.each(recoveryRejections)(
    'fails closed before callbacks for recovery attack: %s',
    async (_label, predecessorPhase, mutate) => {
      const local = fixture();
      const oldNow = new Date('2026-08-30T00:30:00.000Z');
      const recoveryNow = new Date('2026-08-30T02:00:00.000Z');
      const oldReceipt = { ...local.receipt, preparedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T01:00:00.000Z' };
      const oldPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(oldReceipt as never);
      const recoveryReceipt = { ...local.receipt, liveAttestationDigest: '9'.repeat(64), preparedAt: '2026-08-30T01:30:00.000Z', expiresAt: '2026-08-30T05:00:00.000Z' };
      const recoveryPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(recoveryReceipt as never);
      const core = vi.fn();
      const writer = vi.fn();
      try {
        const oldOptions = {
          now: () => new Date(oldNow),
          deploymentAttester: () => ({ deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE, controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64), privateAttestationDigest: 'e'.repeat(64), observedAt: oldNow.toISOString() }),
          bindingAttester: () => ({ ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64), ptrBindingAttestationDigest: '2'.repeat(64), observedAt: oldNow.toISOString() }),
          testOnlyResolvePreparedReceipt: () => ({ receipt: oldReceipt, receiptDigest: oldPublication.receiptDigest }),
        };
        const old = predecessorPhase === 'complete' ? await completeBridge(local, undefined, oldOptions)
          : createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, oldOptions) as never);
        if (predecessorPhase === 'ptr') {
          await applyGateThroughContinuation(local, old, 'g002', () => undefined);
        }
        const oldName = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
          .find(name => name.startsWith('auth-bridge-import-authority-'))!;
        const oldRelativePath = `bridge/${oldName}`;
        const recoveryAuthority = canonicalRecoveryAuthority({
          receipt: recoveryReceipt,
          completedJournalHeadDigest: '8'.repeat(64),
          completedJournalPredecessorDigest: '3'.repeat(64),
          completedAt: recoveryNow.toISOString(),
        });
        const context: any = {
          record: recoveryAuthority.record,
          old,
          oldReceipt,
          oldPublication,
          recoveryReceipt,
          recoveryPublication,
          recoveryNow,
          filenameDigest: recoveryAuthority.digest,
        };
        context.bytes = Buffer.from(recoveryAuthority.bytes);
        await mutate(context);
        context.bytes = Buffer.from(`${JSON.stringify(context.record)}\n`);
        if (context.oldAppend) local.state.append({ root: 'runtime', relativePath: oldRelativePath, bytes: context.oldAppend });
        if (context.oldOverwrite) local.state.append({
          root: 'runtime', relativePath: oldRelativePath, bytes: Buffer.from(' '),
        });
        if (context.removeOld) local.state.remove({ root: 'runtime', relativePath: oldRelativePath });
        local.state.write({ root: 'runtime', relativePath: `bridge/auth-bridge-import-authority-${context.filenameDigest}.jsonl`, bytes: context.bytes });
        for (const extra of context.extra ?? []) {
          local.state.write({ root: 'runtime', relativePath: extra.relativePath, bytes: extra.bytes });
        }
        const before = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' });
        const bridgeBytesBefore = new Map(before.filter(name => name.endsWith('.jsonl')).map(name => [
          name,
          local.state.read({ root: 'runtime', relativePath: `bridge/${name}` }),
        ] as const));
        const activationBefore = local.state.list({ root: 'runtime', relativeDirectory: 'bridge/activation-evidence' });
        const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
          now: () => new Date(recoveryNow),
          deploymentAttester: () => ({
            deploymentId: context.deploymentId ?? DEPLOYMENT_ID,
            workerVersionId: context.deploymentWorkerVersionId ?? VERSION_ID,
            bridgeSourceCommit: context.deploymentBridgeSourceCommit ?? SOURCE,
            controlPlaneAttestationDigest: 'c'.repeat(64),
            publicAttestationDigest: 'd'.repeat(64),
            privateAttestationDigest: 'e'.repeat(64),
            observedAt: recoveryNow.toISOString(),
          }),
          bindingAttester: () => ({
            ptrDatabaseIdentity: context.bindingPtrDatabaseIdentity ?? 'f'.repeat(64),
            ptrBindingDigest: context.bindingPtrBindingDigest ?? '1'.repeat(64),
            ptrBindingAttestationDigest: '2'.repeat(64),
            observedAt: recoveryNow.toISOString(),
          }),
          testOnlyResolvePreparedReceipt: () => ({
            receipt: context.resolvedReceipt ?? recoveryReceipt,
            receiptDigest: (context.resolvedPublication ?? recoveryPublication).receiptDigest,
          }),
          testOnlyResolveCompletedJournal: () => ({
            journalHeadDigest: '8'.repeat(64),
            profile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
            outcome: 'verified-read-only-recovery',
            predecessorDigest: context.resolvedJournalPredecessorDigest ?? '3'.repeat(64),
            runId: '42',
            runAttempt: 1,
            completedAt: recoveryNow.toISOString(),
            sourceCommit: SOURCE,
            workerVersionId: VERSION_ID,
          }),
          inspectImportReceipt: core, authenticateImportResult: writer,
        }) as never);
        if (_label === 'duplicate eligible recovery authority') {
          const noEffectPostflight = () => ({
            outcome: 'no-effect' as const,
            databaseIdentity: null,
            publicationReceiptDigest: null,
            observationDigest: '8'.repeat(64),
            observedAt: recoveryNow.toISOString(),
          });
          const g002CreatePublishMarker = vi.fn(async () => undefined);
          const g002Publisher = vi.fn(async () => undefined);
          const g002ImportCoreReducer = vi.fn(async () => undefined);
          const g002LiveInspector = vi.fn(async () => ({
            receiptDigest: '4'.repeat(64),
            evidenceDigest: '9'.repeat(64),
          }));
          const ptrCreatePublishMarker = vi.fn(async () => undefined);
          const ptrPublisher = vi.fn(async () => undefined);
          const ptrImportCoreReducer = vi.fn(async () => undefined);
          const ptrOwnerProvisionInspector = vi.fn(async () => ({
            receiptDigest: '5'.repeat(64),
            inspectionDigest: '9'.repeat(64),
          }));
          const ptrOwnerProvisioner = vi.fn(async () => ({
            receiptDigest: '5'.repeat(64),
            provisionReceiptDigest: '9'.repeat(64),
          }));
          const ptrLiveInspector = vi.fn(async () => ({
            receiptDigest: '5'.repeat(64),
            provisionReceiptDigest: '9'.repeat(64),
            evidenceDigest: 'a'.repeat(64),
          }));
          const g002 = createSealedRealmsProductionG002Lane({
            reconciler: createSealedRealmsProductionPublicationReconciler({
              privateState: local.state, lane: 'g002', postflight: noEffectPostflight,
            }),
            bridgeState: bridge,
            createPublishMarker: g002CreatePublishMarker,
            publish: g002Publisher,
            importCore: g002ImportCoreReducer,
            liveInspect: g002LiveInspector,
          });
          const ptr = createSealedRealmsProductionPtrLane({
            reconciler: createSealedRealmsProductionPublicationReconciler({
              privateState: local.state, lane: 'ptr', postflight: noEffectPostflight,
            }),
            bridgeState: bridge,
            createPublishMarker: ptrCreatePublishMarker,
            publish: ptrPublisher,
            importCore: ptrImportCoreReducer,
            inspectOwnerProvision: ptrOwnerProvisionInspector,
            provisionOwner: ptrOwnerProvisioner,
            liveInspect: ptrLiveInspector,
          });
          const activation = createSealedRealmsProductionActivationLane({ bridgeState: bridge });
          vi.stubGlobal('WebSocket', class WebSocket {});
          const g002Dispatcher = await protectedDispatcher(
            local, 'g002-import-inspect', '7201', { g002Lane: g002 },
          );
          const ptrDispatcher = await protectedDispatcher(
            local, 'ptr-import-inspect', '7202', { ptrLane: ptr },
          );
          const activationDispatcher = await protectedDispatcher(
            local,
            'activation-evidence-inspect',
            '7203',
            { activationLane: activation },
          );
          await expect(g002Dispatcher.dispatch({
            operation: 'g002-import-inspect', workflowInputSha: SOURCE,
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
          await expect(ptrDispatcher.dispatch({
            operation: 'ptr-import-inspect', workflowInputSha: SOURCE,
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
          await expect(activationDispatcher.dispatch({
            operation: 'activation-evidence-inspect', workflowInputSha: SOURCE,
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
          for (const callback of [
            g002CreatePublishMarker,
            g002Publisher,
            g002ImportCoreReducer,
            g002LiveInspector,
            ptrCreatePublishMarker,
            ptrPublisher,
            ptrImportCoreReducer,
            ptrOwnerProvisionInspector,
            ptrOwnerProvisioner,
            ptrLiveInspector,
          ]) expect(callback).not.toHaveBeenCalled();
        }
        await expect(bridge.establish()).rejects.toMatchObject({
          code: expect.stringMatching(_label === 'duplicate eligible recovery authority'
            || _label === 'orphan recovery authority'
            ? /RECOVERY.*(?:CONFLICT|INVALID)|CHAIN_(?:CONFLICT|INVALID)/u
            : /RECEIPT|RECOVERY|CHAIN|AUTHORITY|DEPLOYMENT|BINDING/u),
        });
        expect(core).not.toHaveBeenCalled(); expect(writer).not.toHaveBeenCalled();
        expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual(before);
        expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge/activation-evidence' })).toEqual(activationBefore);
        for (const [name, bytes] of bridgeBytesBefore) {
          expect(local.state.read({ root: 'runtime', relativePath: `bridge/${name}` })).toEqual(bytes);
          bytes.fill(0);
        }
      } finally {
        vi.unstubAllGlobals();
        local.cleanup();
      }
    },
  );

  it('cannot revive or extend an already-complete expired predecessor through the real gate ABI', async () => {
    const local = fixture();
    try {
      const oldNow = new Date('2026-08-30T00:30:00.000Z');
      const recoveryNow = new Date('2026-08-30T02:00:00.000Z');
      let clock = oldNow;
      const oldReceipt = {
        ...local.receipt,
        preparedAt: '2026-08-30T00:00:00.000Z',
        expiresAt: '2026-08-30T01:00:00.000Z',
      };
      const oldPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(oldReceipt as never);
      const bridge = await completeBridge(local, undefined, {
        now: () => new Date(clock),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID,
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64),
          publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64),
          observedAt: clock.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64),
          ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64),
          observedAt: clock.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({
          receipt: oldReceipt,
          receiptDigest: oldPublication.receiptDigest,
        }),
      });
      clock = recoveryNow;
      const names = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' });
      const bytes = new Map(names.filter(name => name.endsWith('.jsonl')).map(name => [name,
        local.state.read({ root: 'runtime', relativePath: `bridge/${name}` })] as const));
      await expect(bridge.inspectGate({ lane: 'g002' })).rejects.toMatchObject({
        code: expect.stringMatching(/RECEIPT|CHAIN_COMPLETE|LANE_SEALED|GATE_STATE_INVALID/u),
      });
      await expect(bridge.inspectGate({ lane: 'ptr' })).rejects.toMatchObject({
        code: expect.stringMatching(/RECEIPT|CHAIN_COMPLETE|LANE_SEALED|GATE_STATE_INVALID/u),
      });
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual(names);
      for (const [name, original] of bytes) {
        expect(local.state.read({ root: 'runtime', relativePath: `bridge/${name}` })).toEqual(original);
        original.fill(0);
      }
    } finally { local.cleanup(); }
  }, 30_000);

  it.each(['deploy', 'upload', 'release', 'publisher', 'reducer', 'importCore',
    'activationWriter', 'activationGenerator', 'recoveryReceiptWriter', 'recoveryJournalWriter'])(
    'rejects forbidden recovery callback seam %s without calling it or writing state', callbackName => {
      const local = fixture();
      const callback = vi.fn();
      try {
        expect(() => createSealedRealmsProductionAuthBridgeState({
          ...bridgeOptions(local), [callbackName]: callback,
        } as never)).toThrow('SEALED_REALMS_AUTH_BRIDGE_STATE_INPUT_INVALID');
        expect(callback).not.toHaveBeenCalled();
        expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
      } finally { local.cleanup(); }
    },
  );

  it('never creates or repairs a missing recovery authority chain', async () => {
    const local = fixture();
    const oldNow = new Date('2026-08-30T00:30:00.000Z');
    const oldReceipt = {
      ...local.receipt,
      preparedAt: '2026-08-30T00:00:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    };
    const oldPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(oldReceipt as never);
    const recoveryReceipt = {
      ...local.receipt,
      liveAttestationDigest: '9'.repeat(64),
      preparedAt: '2026-08-30T01:30:00.000Z',
      expiresAt: '2026-08-30T05:00:00.000Z',
    };
    const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(recoveryReceipt as never);
    const recoveryNow = new Date('2026-08-30T02:00:00.000Z');
    try {
      await completeBridge(local, undefined, {
        now: () => new Date(oldNow),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64), observedAt: oldNow.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64), observedAt: oldNow.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({ receipt: oldReceipt, receiptDigest: oldPublication.receiptDigest }),
      });
      const oldName = local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
        .find(name => name.startsWith('auth-bridge-import-authority-'))!;
      const oldBytes = local.state.read({ root: 'runtime', relativePath: `bridge/${oldName}` });
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        now: () => new Date(recoveryNow),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID, workerVersionId: VERSION_ID, bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
          privateAttestationDigest: 'e'.repeat(64), observedAt: recoveryNow.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: 'f'.repeat(64), ptrBindingDigest: '1'.repeat(64),
          ptrBindingAttestationDigest: '2'.repeat(64), observedAt: recoveryNow.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({ receipt: recoveryReceipt, receiptDigest: publication.receiptDigest }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: '8'.repeat(64),
          profile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
          outcome: 'verified-read-only-recovery', predecessorDigest: '3'.repeat(64),
          runId: '42', runAttempt: 1, completedAt: recoveryNow.toISOString(),
          sourceCommit: SOURCE, workerVersionId: VERSION_ID,
        }),
      }) as never);
      await expect(bridge.establish()).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_MISSING',
      });
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
        .filter(name => name.startsWith('auth-bridge-import-authority-'))).toEqual([oldName]);
      expect(local.state.read({ root: 'runtime', relativePath: `bridge/${oldName}` })).toEqual(oldBytes);
      oldBytes.fill(0);
    } finally {
      local.cleanup();
    }
  });

  it.each([
    ['partial JSONL authority', `bridge/auth-bridge-import-authority-${'a'.repeat(64)}.jsonl`, '{"partial":'],
    ['stale durable lock', `bridge/locks/auth-bridge-import-authority-${'b'.repeat(64)}.lock`, `${'c'.repeat(64)}\n`],
  ])('fails closed on %s without appending a successor', async (_label, relativePath, bytes) => {
    const local = fixture();
    try {
      local.state.write({ root: 'runtime', relativePath, bytes: Buffer.from(bytes) });
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local) as never);
      await expect(bridge.establish()).rejects.toMatchObject({
        code: expect.stringMatching(/CHAIN_(?:INVALID|BUSY)/u),
      });
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })
        .filter(name => name.endsWith('.jsonl'))).toHaveLength(relativePath.endsWith('.jsonl') ? 1 : 0);
    } finally { local.cleanup(); }
  });

  it.each(['g002', 'ptr'] as const)(
    'rejects direct %s gate mutation without a live continuation claim',
    async lane => {
    const local = fixture();
    const options = () => bridgeOptions(local);
    try {
      if (lane === 'ptr') {
        const prerequisite = createSealedRealmsProductionAuthBridgeState(options() as never);
        await applyGateThroughContinuation(local, prerequisite, 'g002', () => undefined);
      }
      const inspector = createSealedRealmsProductionAuthBridgeState(options() as never);
      const binding = await inspector.inspectGateForContinuation({ lane });
      expect(JSON.stringify(binding)).not.toMatch(/confirmation|token|path/iu);
      const apply = vi.fn();
      await expect(createSealedRealmsProductionAuthBridgeState(options() as never)
        .applyGateForContinuation({ lane, apply } as never))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_INVALID',
        });
      expect(apply).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  });

  it('does not replay a suspension probe when gate evidence was orphaned before continuation issue', async () => {
    const local = fixture();
    const fetchImpl = vi.fn(async () => suspendedResponse());
    const options = () => bridgeOptions(local, { fetchImpl });
    try {
      const inspector = createSealedRealmsProductionAuthBridgeState(options() as never);
      await inspector.inspectGateForContinuation({ lane: 'g002' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      const retry = createSealedRealmsProductionAuthBridgeState(options() as never);
      await expect(retry.inspectGateForContinuation({ lane: 'g002' }))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_GATE_CONTINUATION_ORPHANED',
        });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally { local.cleanup(); }
  });

  it('persists and reopens exact owner-provision inspection evidence without confirmation authority', async () => {
    const local = fixture();
    try {
      await completeBridge(local);
      const options = () => bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, 'adopted'),
      });
      const inspector = createSealedRealmsProductionAuthBridgeState(options() as never);
      const binding = await inspector.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => ({
          receiptDigest: '5'.repeat(64),
          inspectionDigest: '8'.repeat(64),
        }),
      });
      expect(JSON.stringify(binding)).not.toMatch(/confirmation|token|path/iu);

      const applier = createSealedRealmsProductionAuthBridgeState(options() as never);
      await expect(applier.reopenOwnerProvisionContinuation()).resolves.toEqual(binding);
      const provision = vi.fn(() => ({
        receiptDigest: '5'.repeat(64),
        provisionReceiptDigest: '9'.repeat(64),
      }));
      await expect(applier.applyOwnerProvisionForContinuation({ provision } as never))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID',
        });
      expect(provision).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  });

  it('does not replay owner inspection when its durable evidence predates continuation issue', async () => {
    const local = fixture();
    try {
      await completeBridge(local);
      const options = () => bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, 'adopted'),
      });
      const inspect = vi.fn(() => ({
        receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64),
      }));
      await createSealedRealmsProductionAuthBridgeState(options() as never)
        .inspectOwnerProvisionEvidenceForContinuation({ inspect });
      expect(inspect).toHaveBeenCalledTimes(1);
      await expect(createSealedRealmsProductionAuthBridgeState(options() as never)
        .inspectOwnerProvisionEvidenceForContinuation({ inspect }))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONTINUATION_ORPHANED',
        });
      expect(inspect).toHaveBeenCalledTimes(1);
    } finally { local.cleanup(); }
  });

  it('cannot manufacture owner-provision ambiguity without a live continuation claim', async () => {
    const local = fixture();
    try {
      await completeBridge(local);
      const options = () => bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, 'adopted'),
      });
      const inspector = createSealedRealmsProductionAuthBridgeState(options() as never);
      await inspector.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => ({
          receiptDigest: '5'.repeat(64),
          inspectionDigest: '8'.repeat(64),
        }),
      });
      const provision = vi.fn(async () => {
        throw new Error('process crash after owner provision');
      });
      const applier = createSealedRealmsProductionAuthBridgeState(options() as never);
      await expect(applier.applyOwnerProvisionForContinuation({ provision } as never))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID',
        });
      expect(provision).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  });

  it('reopens exact activation evidence while every generator route remains unavailable', async () => {
    const local = fixture();
    try {
      const inspector = await completeBridge(local);
      const binding = await inspector.inspectActivationEvidenceForContinuation();
      expect(JSON.stringify(binding)).not.toMatch(/confirmation|token|path/iu);

      const restarted = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local) as never);
      await expect(restarted.reopenActivationEvidenceContinuation()).resolves.toEqual(binding);
      const generate = vi.fn();
      expect(() => createSealedRealmsProductionActivationEvidenceGenerator({ generate }))
        .toThrow(expect.objectContaining({
          code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        }));
      await expect(restarted.consumeActivationEvidenceForContinuation({} as never))
        .rejects.toMatchObject({
          code: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        });
      expect(generate).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  }, 30_000);

  it.each([
    ['g002', 'g002-publish-inspect', 'g002-publish-apply'],
    ['ptr', 'ptr-publish-inspect', 'ptr-publish-apply'],
  ] as const)(
    'runs %s publication inspect/apply through dispatcher, lane, and one core claim',
    async (laneName, inspectOperation, applyOperation) => {
      const local = fixture();
      const publisher = vi.fn();
      const postflight = () => ({
        outcome: 'adopted' as const,
        databaseIdentity: 'f'.repeat(64),
        publicationReceiptDigest: '1'.repeat(64),
        observationDigest: '2'.repeat(64),
        observedAt: '2026-09-01T00:01:00.000Z',
      });
      const makeLane = () => {
        const common = {
          reconciler: createSealedRealmsProductionPublicationReconciler({
            privateState: local.state, lane: laneName, postflight,
          }),
          bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local) as never),
          createPublishMarker: () => publicationMarker(laneName),
          publish: publisher,
          importCore: () => { throw new Error('unreachable'); },
          liveInspect: () => { throw new Error('unreachable'); },
        };
        return laneName === 'g002'
          ? createSealedRealmsProductionG002Lane(common)
          : createSealedRealmsProductionPtrLane({
            ...common,
            inspectOwnerProvision: () => { throw new Error('unreachable'); },
            provisionOwner: () => { throw new Error('unreachable'); },
          });
      };
      const configured = () => laneName === 'g002'
        ? { g002Lane: makeLane() }
        : { ptrLane: makeLane() };
      vi.stubGlobal('WebSocket', class WebSocket {});
      try {
        const inspected = await protectedDispatcher(
          local, inspectOperation, laneName === 'g002' ? '7401' : '7411', configured(),
        );
        await expect(inspected.dispatch({
          operation: inspectOperation, workflowInputSha: SOURCE,
        })).resolves.toEqual({ operation: inspectOperation, status: 'publish-inspected' });
        expect(publisher).not.toHaveBeenCalled();

        const applied = await protectedDispatcher(
          local, applyOperation, laneName === 'g002' ? '7402' : '7412', configured(),
        );
        const result = await applied.dispatch({ operation: applyOperation, workflowInputSha: SOURCE });
        expect(result).toEqual({ operation: applyOperation, status: 'completed' });
        expect(JSON.stringify(result)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
        expect(publisher).toHaveBeenCalledTimes(1);

        const retried = await protectedDispatcher(
          local, applyOperation, laneName === 'g002' ? '7403' : '7413', configured(),
        );
        await expect(retried.dispatch({
          operation: applyOperation, workflowInputSha: SOURCE,
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(publisher).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
        local.cleanup();
      }
    },
    30_000,
  );

  it.each(['no-effect', 'adopted'] as const)(
    'terminalizes a G002 import crash as exact durable %s evidence without replay',
    async terminalOutcome => {
      const local = fixture();
      let disposition: 'no-effect' | 'adopted' = 'no-effect';
      const importer = vi.fn(async () => {
        if (terminalOutcome === 'adopted') disposition = 'adopted';
        throw new Error('simulated process loss after claim');
      });
      const lane = () => createSealedRealmsProductionG002Lane({
        reconciler: createSealedRealmsProductionPublicationReconciler({
          privateState: local.state,
          lane: 'g002',
          postflight: () => ({
            outcome: 'no-effect' as const,
            databaseIdentity: null,
            publicationReceiptDigest: null,
            observationDigest: '8'.repeat(64),
            observedAt: NOW.toISOString(),
          }),
        }),
        bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
          inspectImportReceipt: () => importProof('g002', disposition),
        }) as never),
        createPublishMarker: async () => publicationMarker('g002'),
        publish: async () => undefined,
        importCore: importer,
        liveInspect: async () => ({
          receiptDigest: '4'.repeat(64), evidenceDigest: '9'.repeat(64),
        }),
      });
      vi.stubGlobal('WebSocket', class WebSocket {});
      try {
        const inspected = await protectedDispatcher(
          local, 'g002-import-inspect', '7501', { g002Lane: lane() },
        );
        await expect(inspected.dispatch({
          operation: 'g002-import-inspect', workflowInputSha: SOURCE,
        })).resolves.toEqual({
          operation: 'g002-import-inspect', status: 'import-inspected',
        });

        const crashed = await protectedDispatcher(
          local, 'g002-import-apply', '7502', { g002Lane: lane() },
        );
        await expect(crashed.dispatch({
          operation: 'g002-import-apply', workflowInputSha: SOURCE,
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(importer).toHaveBeenCalledTimes(1);

        const restarted = await protectedDispatcher(
          local,
          'g002-import-apply',
          '7503',
          { g002Lane: lane() },
          SOURCE,
          new Set(['7502']),
        );
        const terminal = await restarted.dispatch({
          operation: 'g002-import-apply', workflowInputSha: SOURCE,
        });
        expect(terminal).toEqual({
          operation: 'g002-import-apply', status: 'completed',
        });
        expect(JSON.stringify(terminal))
          .not.toMatch(/confirmation|continuation|digest|path|token/iu);
        expect(importer).toHaveBeenCalledTimes(1);

        const retried = await protectedDispatcher(
          local, 'g002-import-apply', '7504', { g002Lane: lane() },
        );
        await expect(retried.dispatch({
          operation: 'g002-import-apply', workflowInputSha: SOURCE,
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(importer).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
        local.cleanup();
      }
    },
    30_000,
  );

  it('runs G002/PTR import, PTR owner, and activation issuance only through dispatcher continuation claims', async () => {
    const local = fixture();
    const imports = { g002: vi.fn(), ptr: vi.fn() };
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect', ptr: 'no-effect',
    };
    const ownerInspect = vi.fn(() => ({
      receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64),
    }));
    const ownerProvision = vi.fn(() => ({
      receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64),
    }));
    const postflight = () => ({
      outcome: 'no-effect' as const,
      databaseIdentity: null,
      publicationReceiptDigest: null,
      observationDigest: '8'.repeat(64),
      observedAt: NOW.toISOString(),
    });
    const g002Lane = () => createSealedRealmsProductionG002Lane({
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'g002', postflight,
      }),
      bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, dispositions[lane]),
      }) as never),
      createPublishMarker: () => { throw new Error('unreachable'); },
      publish: () => { throw new Error('unreachable'); },
      importCore: () => {
        imports.g002();
        dispositions.g002 = 'adopted';
      },
      liveInspect: () => { throw new Error('unreachable'); },
    });
    const ptrLane = () => createSealedRealmsProductionPtrLane({
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState: local.state, lane: 'ptr', postflight,
      }),
      bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, dispositions[lane]),
      }) as never),
      createPublishMarker: () => { throw new Error('unreachable'); },
      publish: () => { throw new Error('unreachable'); },
      importCore: () => {
        imports.ptr();
        dispositions.ptr = 'adopted';
      },
      inspectOwnerProvision: ownerInspect,
      provisionOwner: ownerProvision,
      liveInspect: () => { throw new Error('unreachable'); },
    });
    const run = async (
      operation: string,
      runId: string,
      laneInput: Readonly<Record<string, unknown>>,
    ) => {
      const dispatcher = await protectedDispatcher(local, operation, runId, laneInput);
      const result = await dispatcher.dispatch({ operation: operation as never, workflowInputSha: SOURCE });
      expect(JSON.stringify(result)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
      return result;
    };
    vi.stubGlobal('WebSocket', class WebSocket {});
    try {
      await expect(g002Lane().execute({
        operation: 'g002-import-apply',
        authority: operationAuthority('g002-import-apply'),
        input: { confirmation: Object.freeze({}) },
      } as never)).rejects.toMatchObject({
        code: 'SEALED_REALMS_G002_LANE_REQUEST_INVALID',
      });
      expect(imports.g002).not.toHaveBeenCalled();

      await expect(run('g002-import-inspect', '7301', { g002Lane: g002Lane() }))
        .resolves.toEqual({ operation: 'g002-import-inspect', status: 'import-inspected' });
      await expect(run('g002-import-apply', '7302', { g002Lane: g002Lane() }))
        .resolves.toEqual({ operation: 'g002-import-apply', status: 'completed' });
      expect(imports.g002).toHaveBeenCalledTimes(1);
      await expect(run('g002-import-apply', '7303', { g002Lane: g002Lane() }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(imports.g002).toHaveBeenCalledTimes(1);

      await expect(run('ptr-import-inspect', '7311', { ptrLane: ptrLane() }))
        .resolves.toEqual({ operation: 'ptr-import-inspect', status: 'import-inspected' });
      await expect(run('ptr-import-apply', '7312', { ptrLane: ptrLane() }))
        .resolves.toEqual({ operation: 'ptr-import-apply', status: 'completed' });
      expect(imports.ptr).toHaveBeenCalledTimes(1);

      await expect(run('ptr-owner-provision-inspect', '7321', { ptrLane: ptrLane() }))
        .resolves.toEqual({
          operation: 'ptr-owner-provision-inspect', status: 'owner-provision-inspected',
        });
      await expect(run('ptr-owner-provision', '7322', { ptrLane: ptrLane() }))
        .resolves.toEqual({ operation: 'ptr-owner-provision', status: 'completed' });
      expect(ownerInspect).toHaveBeenCalledTimes(1);
      expect(ownerProvision).toHaveBeenCalledTimes(1);

      const activationInspect = createSealedRealmsProductionActivationLane({
        bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
          inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
            importProof(lane, dispositions[lane]),
        }) as never),
      });
      await expect(run(
        'activation-evidence-inspect',
        '7331',
        { activationLane: activationInspect },
      )).resolves.toEqual({
        operation: 'activation-evidence-inspect', status: 'activation-evidence-inspected',
      });
      const activationGenerate = createSealedRealmsProductionActivationLane({
        bridgeState: createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
          inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
            importProof(lane, dispositions[lane]),
        }) as never),
      });
      await expect(run(
        'activation-evidence-generate',
        '7332',
        { activationLane: activationGenerate },
      )).resolves.toEqual({
        operation: 'activation-evidence-generate',
        status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
      expect(ownerProvision).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      local.cleanup();
    }
  }, 30_000);
});
