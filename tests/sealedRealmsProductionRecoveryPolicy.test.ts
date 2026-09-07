// @vitest-environment node

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  claimSealedRealmsProductionContinuation,
  classifySealedRealmsProductionContinuationNoEffect,
  createSealedRealmsProductionContinuationStore,
  issueSealedRealmsProductionContinuation,
  reconcileSealedRealmsProductionContinuation,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  createSealedRealmsProductionPublicationReconciler,
} from '../scripts/sealed-realms-production-reconciliation.mjs';
import {
  createSealedRealmsProductionG001DispatchContext,
  createSealedRealmsProductionG001CensusAuthority,
  createSealedRealmsProductionG001Dispatcher,
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001LaunchAuthority,
} from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import {
  collectGenesis001AdmittedPlayerCensus,
} from '../scripts/genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';
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

const S = '1'.repeat(40);

function privateFixture() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-task5-recovery-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const state = () => createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {},
    testOnlyAllowPlatformMode: true,
  });
  return Object.freeze({
    state,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  });
}

function authority(operation: string) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: S,
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: S,
    }),
    verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
  });
}

function githubResponse(url: string, value: unknown) {
  const body = JSON.stringify(value);
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function github(
  sourceCommit: string,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    const requestedRunId = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? runId;
    const completed = completedRunIds.has(requestedRunId);
    return githubResponse(url, {
      id: Number(requestedRunId), run_attempt: 1, event: 'workflow_dispatch',
      status: completed ? 'completed' : 'in_progress',
      conclusion: completed ? 'failure' : null, head_branch: 'main',
      head_sha: sourceCommit,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  });
}

async function protectedRun(
  operation: string,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  const sourceAuthority = authority(operation);
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl: github(S, runId, completedRunIds),
  });
  return Object.freeze({ sourceAuthority, permit, runId, runAttempt: '1' });
}

function publicationMarker(
  lane: 'g002' | 'ptr',
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const common = {
    lane,
    sourceCommit: S,
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
    ...overrides,
  };
  return lane === 'g002'
    ? createG002Marker(common as never)
    : createPtrMarker(common as never);
}

function postflight() {
  return Object.freeze({
    outcome: 'adopted' as const,
    databaseIdentity: 'f'.repeat(64),
    publicationReceiptDigest: '1'.repeat(64),
    observationDigest: '2'.repeat(64),
    observedAt: '2026-09-01T00:01:00.000Z',
  });
}

function noEffectPostflight() {
  return Object.freeze({
    outcome: 'no-effect' as const,
    databaseIdentity: null,
    publicationReceiptDigest: null,
    observationDigest: '3'.repeat(64),
    observedAt: '2026-09-01T00:02:00.000Z',
  });
}

function applicantProof(stamp: string, nonce: string) {
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: S,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: 'b'.repeat(64),
      size: 64,
    },
    privateBlindingNonceHex: nonce,
  };
  return Object.freeze({
    ...proof,
    opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof as never),
  });
}

async function admittedProof(observedAt: string, nonceByte: number) {
  return collectGenesis001AdmittedPlayerCensus({
    preparationSourceCommit: S,
    observedAt,
    readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
    queryPreferred: () => ({
      outcome: 'exact-query-supported' as const,
      output: Buffer.from('fid\tenabled\tauth_epoch\n1\ttrue\t1\n', 'utf8'),
    }),
    randomBytes: () => Buffer.alloc(32, nonceByte),
  });
}

async function censusSamples() {
  return Object.freeze([
    Object.freeze({
      applicant: applicantProof('20260901T000000Z', '1'.repeat(64)),
      admitted: await admittedProof('2026-09-01T00:00:00.000Z', 3),
    }),
    Object.freeze({
      applicant: applicantProof('20260901T000100Z', '2'.repeat(64)),
      admitted: await admittedProof('2026-09-01T00:01:00.000Z', 4),
    }),
  ]);
}

function g001Lane(
  privateState: ReturnType<ReturnType<typeof privateFixture>['state']>,
  collect: () => unknown,
  suspend: () => unknown,
  currentStateOperator: (context: Readonly<{ sourceCommit: string }>) => unknown =
    () => { throw new Error('unreachable'); },
) {
  const launchAuthority = createSealedRealmsProductionG001LaunchAuthority({
    readRawGit: () => `${S}\n`,
    resolveAdminSecretPath: () => ({ sourceCommit: S, path: '/private/task5-secret' }),
    persistPolicyObservation: () => undefined,
  });
  const censusAuthority = createSealedRealmsProductionG001CensusAuthority({
    privateState,
    collect: collect as never,
    suspend,
    now: () => new Date('2026-09-01T00:01:00.000Z'),
  });
  return createSealedRealmsProductionG001Lane({
    launchAuthority,
    attestDispatcherNode: () => {
      throw new Error('not reachable in census/current-state operations');
    },
    runEnvelopeChild: async () => ({ status: 1, stdout: '', stderr: '' }),
    censusAuthority,
    currentState: {
      runChild: async () => ({ status: 1, stdout: '', stderr: '' }),
      readFixedFile: () => { throw new Error('not reachable'); },
      resolveAccountUid: () => 501,
      resolveAccountHome: () => '/owner',
      testOnlyAdapter: undefined,
    },
    preflight: () => undefined,
    currentStateOperator,
  } as never);
}

async function dispatchG001(
  lane: ReturnType<typeof createSealedRealmsProductionG001Lane>,
  run: Awaited<ReturnType<typeof protectedRun>>,
  privateState: ReturnType<ReturnType<typeof privateFixture>['state']>,
) {
  const context = createSealedRealmsProductionG001DispatchContext({
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: S,
    }),
    verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
    permit: run.permit,
    continuationStore: createSealedRealmsProductionContinuationStore({ privateState }),
    runId: run.runId,
    runAttempt: run.runAttempt,
    sourceAuthority: run.sourceAuthority,
  } as never);
  const dispatcher = createSealedRealmsProductionG001Dispatcher({ context, lane });
  return dispatcher.dispatch({
    operation: run.sourceAuthority.operation,
    workflowInputSha: S,
  });
}

function currentStateReceipt(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis001-admission-monitor-current-state-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: S,
    observedAt: new Date().toISOString(),
    label: 'com.warpkeep.hermes-admission-monitor',
    disabled: true,
    loaded: false,
    monitorPlistSha256: 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256: '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    ...overrides,
  };
}

describe('sealed-realms production recovery policy', () => {
  it('reopens both G001 census transitions across independently attested processes exactly once', async () => {
    const fixture = privateFixture();
    const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true, value: function WebSocket() {},
    });
    try {
      const samples = await censusSamples();
      const firstCollect = vi.fn(async () => samples[0]);
      const secondCollect = vi.fn(async () => samples[1]);
      const suspend = vi.fn(async () => undefined);

      const firstRun = await protectedRun('g001-census-first', '9101');
      const first = await dispatchG001(
        g001Lane(fixture.state(), firstCollect, suspend), firstRun, fixture.state(),
      );
      expect(first).toEqual({ operation: 'g001-census-first', status: 'completed' });
      expect(JSON.stringify(first)).not.toMatch(/confirmation|continuation|digest|path|token/iu);

      const secondRun = await protectedRun('g001-census-second-inspect', '9201');
      const second = await dispatchG001(
        g001Lane(fixture.state(), secondCollect, suspend), secondRun, fixture.state(),
      );
      expect(second).toEqual({
        operation: 'g001-census-second-inspect', status: 'completed',
      });

      const suspensionRun = await protectedRun('g001-census-second-suspend', '9301');
      const suspended = await dispatchG001(
        g001Lane(fixture.state(), vi.fn(), suspend), suspensionRun, fixture.state(),
      );
      expect(suspended).toEqual({
        operation: 'g001-census-second-suspend', status: 'completed',
      });
      expect(firstCollect).toHaveBeenCalledTimes(1);
      expect(secondCollect).toHaveBeenCalledTimes(1);
      expect(suspend).toHaveBeenCalledTimes(1);

      const retryRun = await protectedRun('g001-census-second-suspend', '9401');
      await expect(dispatchG001(
        g001Lane(fixture.state(), vi.fn(), suspend), retryRun, fixture.state(),
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(suspend).toHaveBeenCalledTimes(1);
    } finally {
      if (originalWebSocket === undefined) delete (globalThis as { WebSocket?: unknown }).WebSocket;
      else Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
      fixture.cleanup();
    }
  });

  it('fails before recollecting when first-census evidence was orphaned before continuation issue', async () => {
    const fixture = privateFixture();
    const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true, value: function WebSocket() {},
    });
    try {
      const samples = await censusSamples();
      const firstCollect = vi.fn(async () => samples[0]);
      const orphanAuthority = authority('g001-census-first');
      let interrupted = false;
      const orphanPermit = await issueSealedRealmsProductionWorkflowPermit({
        sourceAuthority: orphanAuthority,
        githubToken: 'github-sealed-realms-owner-token',
        runId: '9501',
        runAttempt: '1',
        fetchImpl: github(S, '9501'),
        isInterrupted: () => interrupted,
      });
      interrupted = true;
      await expect(dispatchG001(
        g001Lane(fixture.state(), firstCollect, vi.fn()),
        Object.freeze({
          permit: orphanPermit,
          runId: '9501',
          runAttempt: '1' as const,
          sourceAuthority: orphanAuthority,
        }),
        fixture.state(),
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      const replay = vi.fn(async () => samples[1]);
      const retryRun = await protectedRun('g001-census-first', '9502');
      await expect(dispatchG001(
        g001Lane(fixture.state(), replay, vi.fn()), retryRun, fixture.state(),
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      expect(firstCollect).toHaveBeenCalledTimes(1);
      expect(replay).not.toHaveBeenCalled();
    } finally {
      if (originalWebSocket === undefined) delete (globalThis as { WebSocket?: unknown }).WebSocket;
      else Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
      fixture.cleanup();
    }
  });

  it('persists a canonical G001 current-state receipt before returning a redacted status', async () => {
    const fixture = privateFixture();
    try {
      const operator = vi.fn(() => currentStateReceipt());
      const run = await protectedRun('g001-current-state', '9601');
      const result = await dispatchG001(
        g001Lane(fixture.state(), vi.fn(), vi.fn(), operator), run, fixture.state(),
      );
      expect(result).toEqual({
        operation: 'g001-current-state', status: 'current-state-inspected',
      });
      expect(JSON.stringify(result)).not.toMatch(/confirmation|digest|path|token/iu);
      expect(operator).toHaveBeenCalledTimes(1);
      const names = fixture.state().list({
        root: 'runtime', relativeDirectory: 'g001/current-state',
      });
      expect(names).toHaveLength(1);
      const bytes = fixture.state().read({
        root: 'runtime', relativePath: `g001/current-state/${names[0]}`,
      });
      try {
        expect(JSON.parse(bytes.toString('utf8'))).toEqual(operator.mock.results[0]?.value);
      } finally { bytes.fill(0); }
      const captured = fixture.state().read({
        root: 'runtime',
        relativePath: 'activation-evidence/records/g001-admission-monitor-current-state-receipt.json',
      });
      try {
        const record = JSON.parse(captured.toString('utf8'));
        expect(record.member).toBe('g001AdmissionMonitorCurrentStateReceipt');
        expect(record.operation).toBe('g001-current-state');
        expect(record.sourceAuthorityDigest).toBe(run.sourceAuthority.authorityDigest);
        expect(record.receipt).toEqual(operator.mock.results[0]?.value);
      } finally { captured.fill(0); }
    } finally { fixture.cleanup(); }
  });

  it.each([
    ['stale', { observedAt: '2026-08-31T00:00:00.000Z' }],
    ['swapped', { sourceCommit: 'f'.repeat(40) }],
    ['extra', { privateAuthority: 'must-not-persist' }],
  ])('rejects a %s current-state receipt without persisting or retrying the monitor', async (_label, mutation) => {
    const fixture = privateFixture();
    try {
      const operator = vi.fn(() => currentStateReceipt(mutation));
      const run = await protectedRun('g001-current-state', `97${_label.length}1`);
      await expect(dispatchG001(
        g001Lane(fixture.state(), vi.fn(), vi.fn(), operator), run, fixture.state(),
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      expect(operator).toHaveBeenCalledTimes(1);
      expect(fixture.state().list({
        root: 'runtime', relativeDirectory: 'g001/current-state',
      })).toEqual([]);
      expect(fixture.state().exists({
        root: 'runtime', relativePath: 'activation-evidence/records/g001-admission-monitor-current-state-receipt.json',
      })).toBe(false);
    } finally { fixture.cleanup(); }
  });

  it('fails without replacing an existing current-state activation capture', async () => {
    const fixture = privateFixture();
    const relativePath = 'activation-evidence/records/g001-admission-monitor-current-state-receipt.json';
    try {
      fixture.state().write({ root: 'runtime', relativePath, bytes: Buffer.from('{}\n') });
      const operator = vi.fn(() => currentStateReceipt());
      const run = await protectedRun('g001-current-state', '9791');
      await expect(dispatchG001(
        g001Lane(fixture.state(), vi.fn(), vi.fn(), operator), run, fixture.state(),
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(operator).toHaveBeenCalledTimes(1);
      const bytes = fixture.state().read({ root: 'runtime', relativePath });
      try { expect(bytes.toString('utf8')).toBe('{}\n'); } finally { bytes.fill(0); }
    } finally { fixture.cleanup(); }
  });

  it.each([
    ['g002', 'g002-publication', 'g002-publish-inspect', 'g002-publish-apply'],
    ['ptr', 'ptr-publication', 'ptr-publish-inspect', 'ptr-publish-apply'],
  ] as const)(
    '%s publication reopens exact private evidence across a process boundary and claims once',
    async (lane, kind, issueOperation, claimOperation) => {
      const fixture = privateFixture();
      try {
        const issuedRun = await protectedRun(issueOperation, '8101');
        const issuedStore = createSealedRealmsProductionContinuationStore({
          privateState: fixture.state(),
        });
        const firstProcess = createSealedRealmsProductionPublicationReconciler({
          privateState: fixture.state(), lane, postflight,
        });
        const binding = await firstProcess.inspectForContinuation({
          marker: publicationMarker(lane),
        });
        const issued = await issueSealedRealmsProductionContinuation({
          store: issuedStore,
          permit: issuedRun.permit,
          sourceAuthority: issuedRun.sourceAuthority,
          kind,
          runId: issuedRun.runId,
          runAttempt: issuedRun.runAttempt,
          ...binding,
        });
        expect(issued).toEqual({ status: 'issued' });
        expect(JSON.stringify(issued)).not.toMatch(/confirmation|continuation|digest|path|token/iu);

        const secondProcess = createSealedRealmsProductionPublicationReconciler({
          privateState: fixture.state(), lane, postflight,
        });
        const reopened = secondProcess.reopenContinuation();
        expect(reopened).toEqual(binding);
        const claimedRun = await protectedRun(claimOperation, '8201');
        const claimedStore = createSealedRealmsProductionContinuationStore({
          privateState: fixture.state(),
        });
        const publisher = vi.fn(async () => Object.freeze({ private: 'redacted' }));
        const completed = await claimSealedRealmsProductionContinuation({
          store: claimedStore,
          permit: claimedRun.permit,
          sourceAuthority: claimedRun.sourceAuthority,
          kind,
          runId: claimedRun.runId,
          runAttempt: claimedRun.runAttempt,
          ...reopened,
          effect: claim => secondProcess.consumeContinuationEntry({
            claim,
            store: claimedStore,
            sourceAuthority: claimedRun.sourceAuthority,
            kind,
            runId: claimedRun.runId,
            runAttempt: claimedRun.runAttempt,
            ...reopened,
            publish: publisher,
          } as never),
        });
        expect(completed).toEqual({ status: 'completed' });
        expect(publisher).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(completed)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
        await expect(claimSealedRealmsProductionContinuation({
          store: claimedStore,
          permit: claimedRun.permit,
          sourceAuthority: claimedRun.sourceAuthority,
          kind,
          runId: claimedRun.runId,
          runAttempt: claimedRun.runAttempt,
          ...reopened,
          effect: publisher,
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_TERMINAL' });
        expect(publisher).toHaveBeenCalledTimes(1);
      } finally {
        fixture.cleanup();
      }
    },
  );

  it('reconciles a post-publish crash from the exact marker without replaying the publisher', async () => {
    const fixture = privateFixture();
    try {
      const marker = publicationMarker('g002');
      const issuedRun = await protectedRun('g002-publish-inspect', '8102');
      const firstProcess = createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.state(), lane: 'g002', postflight,
      });
      const binding = await firstProcess.inspectForContinuation({ marker });
      await issueSealedRealmsProductionContinuation({
        store: createSealedRealmsProductionContinuationStore({ privateState: fixture.state() }),
        permit: issuedRun.permit,
        sourceAuthority: issuedRun.sourceAuthority,
        kind: 'g002-publication',
        runId: issuedRun.runId,
        runAttempt: issuedRun.runAttempt,
        ...binding,
      });

      const publisher = vi.fn(async () => { throw new Error('crash after publisher submission'); });
      const claimedRun = await protectedRun('g002-publish-apply', '8202');
      const claimedStore = createSealedRealmsProductionContinuationStore({
        privateState: fixture.state(),
      });
      await expect(claimSealedRealmsProductionContinuation({
        store: claimedStore,
        permit: claimedRun.permit,
        sourceAuthority: claimedRun.sourceAuthority,
        kind: 'g002-publication',
        runId: claimedRun.runId,
        runAttempt: claimedRun.runAttempt,
        ...binding,
        effect: claim => firstProcess.consumeContinuationEntry({
          claim,
          store: claimedStore,
          sourceAuthority: claimedRun.sourceAuthority,
          kind: 'g002-publication',
          runId: claimedRun.runId,
          runAttempt: claimedRun.runAttempt,
          ...binding,
          publish: publisher,
        } as never),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });
      expect(publisher).toHaveBeenCalledTimes(1);

      const postflightInspector = vi.fn(postflight);
      const restarted = createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.state(), lane: 'g002', postflight: postflightInspector,
      });
      const reopened = restarted.reopenContinuation();
      expect(reopened).toEqual(binding);
      const reconcileRun = await protectedRun(
        'g002-publish-apply',
        '8302',
        new Set(['8202']),
      );
      await expect(reconcileSealedRealmsProductionContinuation({
        store: createSealedRealmsProductionContinuationStore({ privateState: fixture.state() }),
        permit: reconcileRun.permit,
        sourceAuthority: reconcileRun.sourceAuthority,
        kind: 'g002-publication',
        runId: reconcileRun.runId,
        runAttempt: reconcileRun.runAttempt,
        ...reopened,
        readOnlyReconcile: reconciliation =>
          restarted.reconcileContinuation({
            reconciliation,
            selection: reopened,
          } as never),
      })).resolves.toEqual({ status: 'reconciled', outcome: 'effect-applied' });
      // The restart verifies the already-persisted canonical reconciliation;
      // it never re-derives evidence by rerunning postflight.
      expect(postflightInspector).not.toHaveBeenCalled();
      expect(publisher).toHaveBeenCalledTimes(1);
    } finally {
      fixture.cleanup();
    }
  });

  it('terminalizes exact durable no-effect after an effect-reserved publication crash and only a fresh generation may issue', async () => {
    const fixture = privateFixture();
    try {
      const marker = publicationMarker('g002');
      const issuedRun = await protectedRun('g002-publish-inspect', '8501');
      const firstProcess = createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.state(), lane: 'g002', postflight: noEffectPostflight,
      });
      const binding = await firstProcess.inspectForContinuation({ marker });
      await issueSealedRealmsProductionContinuation({
        store: createSealedRealmsProductionContinuationStore({ privateState: fixture.state() }),
        permit: issuedRun.permit,
        sourceAuthority: issuedRun.sourceAuthority,
        kind: 'g002-publication',
        runId: issuedRun.runId,
        runAttempt: issuedRun.runAttempt,
        ...binding,
      });

      const publisher = vi.fn(async () => undefined);
      const claimedRun = await protectedRun('g002-publish-apply', '8502');
      const claimStore = createSealedRealmsProductionContinuationStore({
        privateState: fixture.state(),
      });
      await expect(claimSealedRealmsProductionContinuation({
        store: claimStore,
        permit: claimedRun.permit,
        sourceAuthority: claimedRun.sourceAuthority,
        kind: 'g002-publication',
        runId: claimedRun.runId,
        runAttempt: claimedRun.runAttempt,
        ...binding,
        effect: claim => firstProcess.consumeContinuationEntry({
          claim,
          store: claimStore,
          sourceAuthority: claimedRun.sourceAuthority,
          kind: 'g002-publication',
          runId: claimedRun.runId,
          runAttempt: claimedRun.runAttempt,
          ...binding,
          publish: publisher,
        } as never),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });
      expect(publisher).toHaveBeenCalledTimes(1);

      const latePostflight = vi.fn(() => Object.freeze({
        ...noEffectPostflight(), observationDigest: '7'.repeat(64),
      }));
      const restarted = createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.state(), lane: 'g002', postflight: latePostflight,
      });
      const selectedBinding = restarted.reopenContinuation();
      expect(selectedBinding).toEqual(binding);

      // A fresh pending marker arriving after old-generation selection must not
      // be globally reselected inside the old generation's reconcile callback.
      const freshMarker = publicationMarker('g002', {
        attemptNonce: '4'.repeat(64),
        markedAt: '2026-09-01T00:03:00.000Z',
      });
      const nextProcess = createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.state(), lane: 'g002', postflight: noEffectPostflight,
      });
      const nextBinding = await nextProcess.inspectForContinuation({ marker: freshMarker });
      const reconciliationRun = await protectedRun(
        'g002-publish-apply', '8503', new Set(['8502']),
      );
      let escapedReconciliation: unknown;
      await expect(reconcileSealedRealmsProductionContinuation({
        store: createSealedRealmsProductionContinuationStore({ privateState: fixture.state() }),
        permit: reconciliationRun.permit,
        sourceAuthority: reconciliationRun.sourceAuthority,
        kind: 'g002-publication',
        runId: reconciliationRun.runId,
        runAttempt: reconciliationRun.runAttempt,
        ...selectedBinding,
        readOnlyReconcile: reconciliation => {
          escapedReconciliation = reconciliation;
          return restarted.reconcileContinuation({
            reconciliation, selection: selectedBinding,
          } as never);
        },
      })).resolves.toEqual({ status: 'reconciled', outcome: 'no-effect' });
      expect(publisher).toHaveBeenCalledTimes(1);
      expect(latePostflight).not.toHaveBeenCalled();
      expect(() => classifySealedRealmsProductionContinuationNoEffect({
        reconciliation: escapedReconciliation as never,
        evidenceDigest: selectedBinding.evidenceDigest,
        observationDigest: 'f'.repeat(64),
      })).toThrow(expect.objectContaining({
        code: 'SEALED_REALMS_CONTINUATION_RECONCILIATION_INVALID',
      }));

      const nextRun = await protectedRun('g002-publish-inspect', '8504');
      await expect(issueSealedRealmsProductionContinuation({
        store: createSealedRealmsProductionContinuationStore({ privateState: fixture.state() }),
        permit: nextRun.permit,
        sourceAuthority: nextRun.sourceAuthority,
        kind: 'g002-publication',
        runId: nextRun.runId,
        runAttempt: nextRun.runAttempt,
        ...nextBinding,
      })).resolves.toEqual({ status: 'issued' });
      expect(nextBinding).not.toEqual(binding);
      expect(publisher).toHaveBeenCalledTimes(1);
    } finally {
      fixture.cleanup();
    }
  });
});
