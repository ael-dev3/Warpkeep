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
  SealedRealmsProductionAuthBridgeStateError,
  consumeSealedRealmsProductionActivationEvidenceConfirmation,
  consumeSealedRealmsProductionActivationEvidenceForGenerator,
  createSealedRealmsProductionActivationEvidenceGenerator,
  createSealedRealmsProductionAuthBridgeStateTestCapability,
  createSealedRealmsProductionAuthBridgeState,
  inspectSealedRealmsAdmissionSuspension,
  readSealedRealmsProductionActivationEvidenceMember,
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
  const g002 = await bridge.inspectGate({ lane: 'g002' });
  await bridge.applyGate({
    confirmation: g002.confirmation,
    apply: () => undefined,
  });
  const ptr = await bridge.inspectGate({ lane: 'ptr' });
  await bridge.applyGate({
    confirmation: ptr.confirmation,
    apply: () => undefined,
  });
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

  it.each(SUSPENSION_OPTIONS_MISMATCHES)(
    'rejects valid POST plus invalid OPTIONS %s before gate or activation evidence writes',
    async (_label, invalidOptions) => {
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
    },
  );

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
  ])('does not create an activation receipt for an invalid %s probe', async (_label, response) => {
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
  });

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
      const g002 = await bridge.inspectGate({ lane: 'g002' });
      await bridge.applyGate({
        confirmation: g002.confirmation,
        apply: () => { calls.push('g002'); },
      });
      dispositions.g002 = 'adopted';
      const ptr = await bridge.inspectGate({ lane: 'ptr' });
      await bridge.applyGate({
        confirmation: ptr.confirmation,
        apply: () => { throw new Error('adopted import must not invoke core'); },
      });
      const ownerInspection = await bridge.inspectOwnerProvisionEvidence({
        inspect: () => ({
          receiptDigest: '5'.repeat(64),
          inspectionDigest: '8'.repeat(64),
        }),
      });
      await bridge.applyOwnerProvision({
        confirmation: ownerInspection.confirmation,
        provision: () => ({
          receiptDigest: '5'.repeat(64),
          provisionReceiptDigest: '9'.repeat(64),
        }),
      });
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
  });

  it('consumes activation evidence once through a fixed opaque Task 6E generator', async () => {
    const local = fixture();
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect', ptr: 'no-effect',
    };
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, dispositions[lane]),
      }) as never);
      const g002 = await bridge.inspectGate({ lane: 'g002' });
      await bridge.applyGate({ confirmation: g002.confirmation, apply: () => undefined });
      dispositions.g002 = 'adopted';
      const ptr = await bridge.inspectGate({ lane: 'ptr' });
      await bridge.applyGate({ confirmation: ptr.confirmation, apply: () => undefined });
      dispositions.ptr = 'adopted';
      const activation = await bridge.inspectActivationEvidence();
      let capturedMember: object | undefined;
      const generate = vi.fn(async ({ member }: { member: object }) => {
        capturedMember = member;
        expect(member).toEqual({});
        const projection = readSealedRealmsProductionActivationEvidenceMember(member);
        expect(Object.keys(projection)).toEqual(['authBridgeSuspensionPrivateReceipt']);
        expect(projection.authBridgeSuspensionPrivateReceipt.profile)
          .toBe('warpkeep-sealed-realms-auth-bridge-suspension-private-v1');
        expect(Object.isFrozen(projection)).toBe(true);
        expect(Object.isFrozen(projection.authBridgeSuspensionPrivateReceipt)).toBe(true);
        expect(Object.isFrozen(projection.authBridgeSuspensionPrivateReceipt.activationGate)).toBe(true);
        expect(JSON.stringify(member)).not.toContain('admission_requests_suspended');
      });
      const generator = createSealedRealmsProductionActivationEvidenceGenerator({ generate });
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: activation.confirmation,
        generator,
      })).resolves.toEqual({});
      expect(generate).toHaveBeenCalledTimes(1);
      expect(() => readSealedRealmsProductionActivationEvidenceMember(capturedMember))
        .toThrow('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_MEMBER_INVALID');
      expect(() => readSealedRealmsProductionActivationEvidenceMember({}))
        .toThrow('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_MEMBER_INVALID');
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: activation.confirmation,
        generator,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
      });
    } finally {
      local.cleanup();
    }
  });

  it('routes Task 6E generation only through a captured branded activation lane generator', async () => {
    const local = fixture();
    try {
      const bridge = await completeBridge(local);
      const activation = await bridge.inspectActivationEvidence();
      const generate = vi.fn(async ({ member }: { member: object }) => {
        expect(member).toEqual({});
      });
      const lane = createSealedRealmsProductionActivationLane({
        bridgeState: bridge,
        task6EGenerator: createSealedRealmsProductionActivationEvidenceGenerator({ generate }),
      });
      const authority = authenticateSealedRealmsProductionSourceAuthority({
        operation: 'activation-evidence-generate',
        workflowInputSha: SOURCE,
        readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
        readBinding: () => ({
          schemaVersion: 1,
          profile: 'warpkeep-0.4.0-sealed-launch-v1',
          pagesDeploymentApproved: false,
          preparationSourceCommit: SOURCE,
        }),
        verifyEvidence: verifiedSha => ({ verifiedSha }),
      });
      await expect(lane.execute({
        operation: 'activation-evidence-generate',
        authority,
        input: { confirmation: activation.confirmation },
      })).resolves.toEqual({ status: 'completed' });
      expect(generate).toHaveBeenCalledTimes(1);
      await expect(lane.execute({
        operation: 'activation-evidence-generate',
        authority,
        input: { confirmation: activation.confirmation },
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
      });
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
    }
  });

  it('permanently rejects expired or byte-swapped private activation confirmations before a generator runs', async () => {
    const local = fixture();
    const swappedLocal = fixture();
    let clock = new Date(NOW);
    const generate = vi.fn();
    const generator = createSealedRealmsProductionActivationEvidenceGenerator({ generate });
    try {
      const bridge = await completeBridge(local, undefined, { now: () => new Date(clock) });
      const expired = await bridge.inspectActivationEvidence();
      clock = new Date(NOW.getTime() + 5 * 60 * 1_000);
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: expired.confirmation,
        generator,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_EXPIRED',
      });
      expect(generate).not.toHaveBeenCalled();

      // A new bridge state gives a separate confirmation; replace only its
      // owner-private receipt bytes and prove consume fails before callback.
      const fresh = await completeBridge(swappedLocal, undefined, { now: () => new Date(NOW) });
      const swapped = await fresh.inspectActivationEvidence();
      const receiptName = swappedLocal.state.list({
        root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
      }).at(-1)!;
      const relativePath = `bridge/activation-evidence/${receiptName}`;
      const bytes = swappedLocal.state.read({ root: 'runtime', relativePath });
      bytes[0] ^= 1;
      swappedLocal.state.remove({ root: 'runtime', relativePath });
      swappedLocal.state.write({ root: 'runtime', relativePath, bytes });
      bytes.fill(0);
      await expect(consumeSealedRealmsProductionActivationEvidenceForGenerator({
        confirmation: swapped.confirmation,
        generator,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID',
      });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      local.cleanup();
      swappedLocal.cleanup();
    }
  });

  it('claims gate and owner confirmations synchronously so concurrent applies release one callback', async () => {
    const local = fixture();
    const ownerLocal = fixture();
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local) as never);
      const gate = await bridge.inspectGate({ lane: 'g002' });
      const releaseGate = deferred<void>();
      const gateStarted = deferred<void>();
      const importCore = vi.fn(async () => {
        gateStarted.resolve();
        await releaseGate.promise;
      });
      const firstGate = bridge.applyGate({ confirmation: gate.confirmation, apply: importCore });
      const secondGate = bridge.applyGate({ confirmation: gate.confirmation, apply: importCore });
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
      const ownerG002 = await complete.inspectGate({ lane: 'g002' });
      await complete.applyGate({ confirmation: ownerG002.confirmation, apply: () => undefined });
      ownerDispositions.g002 = 'adopted';
      const ownerPtr = await complete.inspectGate({ lane: 'ptr' });
      await complete.applyGate({ confirmation: ownerPtr.confirmation, apply: () => undefined });
      ownerDispositions.ptr = 'adopted';
      const owner = await complete.inspectOwnerProvisionEvidence({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      });
      const releaseOwner = deferred<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>();
      const ownerStarted = deferred<void>();
      const provision = vi.fn(async () => {
        ownerStarted.resolve();
        return releaseOwner.promise;
      });
      const firstOwner = complete.applyOwnerProvision({
        confirmation: owner.confirmation,
        provision,
      });
      const secondOwner = complete.applyOwnerProvision({
        confirmation: owner.confirmation,
        provision,
      });
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
  });

  it('permits only one outstanding owner-provision confirmation for an unchanged completed chain', async () => {
    const local = fixture();
    const dispositions: Record<'g002' | 'ptr', 'adopted' | 'no-effect'> = {
      g002: 'no-effect', ptr: 'no-effect',
    };
    try {
      const bridge = createSealedRealmsProductionAuthBridgeState(bridgeOptions(local, {
        inspectImportReceipt: ({ lane }: { lane: 'g002' | 'ptr' }) =>
          importProof(lane, dispositions[lane]),
      }) as never);
      const g002 = await bridge.inspectGate({ lane: 'g002' });
      await bridge.applyGate({ confirmation: g002.confirmation, apply: () => undefined });
      dispositions.g002 = 'adopted';
      const ptr = await bridge.inspectGate({ lane: 'ptr' });
      await bridge.applyGate({ confirmation: ptr.confirmation, apply: () => undefined });
      dispositions.ptr = 'adopted';

      const first = await bridge.inspectOwnerProvisionEvidence({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      });
      await expect(bridge.inspectOwnerProvisionEvidence({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_BUSY',
      });
      const provision = vi.fn(() => ({
        receiptDigest: '5'.repeat(64), provisionReceiptDigest: '9'.repeat(64),
      }));
      await expect(bridge.applyOwnerProvision({ confirmation: first.confirmation, provision }))
        .resolves.toEqual({});
      expect(provision).toHaveBeenCalledTimes(1);
    } finally {
      local.cleanup();
    }
  });

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
      const gate = await gateBridge.inspectGate({ lane: 'g002' });
      await expect(gateBridge.applyGate({
        confirmation: gate.confirmation,
        apply: () => {
          clock = new Date(NOW.getTime() + 5 * 60 * 1_000 + 1);
          return undefined;
        },
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_EXPIRED',
      });

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
      const owner = await ownerBridge.inspectOwnerProvisionEvidence({
        inspect: () => ({ receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) }),
      });
      const provision = vi.fn(() => {
        clock = new Date(NOW.getTime() + 5 * 60 * 1_000 + 1);
        return ownerProvisionProof();
      });
      await expect(ownerBridge.applyOwnerProvision({
        confirmation: owner.confirmation,
        provision,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_EXPIRED',
      });
      expect(provision).toHaveBeenCalledTimes(1);
    } finally {
      gateLocal.cleanup();
      ownerLocal.cleanup();
    }
  });

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
      const swappedAuthority = (operation: 'g002-import-inspect' | 'ptr-import-inspect' | 'activation-evidence-inspect') =>
        authenticateSealedRealmsProductionSourceAuthority({
        operation, workflowInputSha: SWAPPED_SOURCE,
        readGit: args => args[0] === 'rev-parse' ? `${SWAPPED_SOURCE}\n` : (() => { throw new Error('git'); })(),
        readBinding: () => ({
          schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
          pagesDeploymentApproved: false, preparationSourceCommit: SWAPPED_SOURCE,
        }),
        verifyEvidence: verifiedSha => ({ verifiedSha }),
      });
      await expect(g002.execute({ operation: 'g002-import-inspect', authority: swappedAuthority('g002-import-inspect') }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_SOURCE_MISMATCH' });
      await expect(ptr.execute({ operation: 'ptr-import-inspect', authority: swappedAuthority('ptr-import-inspect') }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_SOURCE_MISMATCH' });
      await expect(activation.execute({ operation: 'activation-evidence-inspect', authority: swappedAuthority('activation-evidence-inspect') }))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_SOURCE_MISMATCH' });
      expect(calls).toEqual([]);
    } finally {
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

  it('supersedes an ambiguous pending gate only after immutable adoption and never replays its core', async () => {
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
      const first = await bridge.inspectGate({ lane: 'g002' });
      await expect(bridge.applyGate({
        confirmation: first.confirmation,
        apply: () => { coreCalls += 1; throw new Error('simulated transport ambiguity'); },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_GATE_APPLY_AMBIGUOUS' });
      dispositions.g002 = 'adopted';
      const recovery = await bridge.inspectGate({ lane: 'g002' });
      await bridge.applyGate({
        confirmation: recovery.confirmation,
        apply: () => { coreCalls += 1; throw new Error('adoption must not call core'); },
      });
      expect(coreCalls).toBe(1);
      await expect(bridge.inspect()).resolves.toEqual({
        g002Sealed: true, ptrSealed: false, complete: false,
      });
    } finally {
      local.cleanup();
    }
  });

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
        const g002 = await old.inspectGate({ lane: 'g002' });
        await old.applyGate({ confirmation: g002.confirmation, apply: () => undefined });
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
      const g002Core = vi.fn(async () => undefined);
      const ptrCore = vi.fn(async () => undefined);
      const g002Gate = await recovery.inspectGate({ lane: 'g002' });
      await recovery.applyGate({ confirmation: g002Gate.confirmation, apply: g002Core });
      const ptrGate = await recovery.inspectGate({ lane: 'ptr' });
      await recovery.applyGate({ confirmation: ptrGate.confirmation, apply: ptrCore });
      expect(g002Core).not.toHaveBeenCalled();
      expect(ptrCore).toHaveBeenCalledTimes(predecessorPhase === 'complete' ? 0 : 1);
      await expect(recovery.inspect()).resolves.toEqual({
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
      expect(g002Core).not.toHaveBeenCalled();
      expect(ptrCore).toHaveBeenCalledTimes(predecessorPhase === 'complete' ? 0 : 1);
      oldBytes.fill(0);
      recoveryBytes.fill(0);
      completedRecoveryBytes.fill(0);
    } finally {
      local.cleanup();
    }
    },
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
          const gate = await old.inspectGate({ lane: 'g002' });
          await old.applyGate({ confirmation: gate.confirmation, apply: () => undefined });
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
          const activationGenerator = vi.fn(async () => undefined);
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
          const activation = createSealedRealmsProductionActivationLane({
            bridgeState: bridge,
            task6EGenerator: createSealedRealmsProductionActivationEvidenceGenerator({
              generate: activationGenerator,
            }),
          });
          const sourceAuthority = (operation: 'g002-import-inspect' | 'ptr-import-inspect' | 'activation-evidence-inspect') =>
            authenticateSealedRealmsProductionSourceAuthority({
              operation,
              workflowInputSha: SOURCE,
              readGit: args => args[0] === 'rev-parse'
                ? `${SOURCE}\n`
                : (() => { throw new Error('unexpected git call'); })(),
              readBinding: () => ({
                schemaVersion: 1,
                profile: 'warpkeep-0.4.0-sealed-launch-v1',
                pagesDeploymentApproved: false,
                preparationSourceCommit: SOURCE,
              }),
              verifyEvidence: verifiedSha => ({ verifiedSha }),
            });
          await expect(g002.execute({
            operation: 'g002-import-inspect',
            authority: sourceAuthority('g002-import-inspect'),
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT' });
          await expect(ptr.execute({
            operation: 'ptr-import-inspect',
            authority: sourceAuthority('ptr-import-inspect'),
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT' });
          await expect(activation.execute({
            operation: 'activation-evidence-inspect',
            authority: sourceAuthority('activation-evidence-inspect'),
          })).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT' });
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
            activationGenerator,
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
      } finally { local.cleanup(); }
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
  });

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
});
