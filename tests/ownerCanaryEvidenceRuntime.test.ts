import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOwnerCanaryEvidenceRuntime,
  isExactOwnerCanaryProductionConfig,
  OWNER_CANARY_ACTION_CEILING_MILLISECONDS,
  OWNER_CANARY_RECOVERY_READ_CEILING_MILLISECONDS,
  ownerCanaryEvidenceRuntimeFailureCode,
} from '../src/owner-canary/ownerCanaryEvidenceRuntime';
import { OWNER_CANARY_STAGES } from '../src/owner-canary/ownerCanaryController';
import {
  OWNER_CANARY_RESOURCE_KINDS,
  type OwnerCanaryJourneyEvidence,
} from '../src/owner-canary/ownerCanaryEvidence';
import {
  ownerCanaryRuntimePlanTestSeams,
} from '../src/owner-canary/ownerCanaryRuntimePlan';
import { loadOwnerCanaryProductionRuntime } from '../src/owner-canary/ownerCanaryProductionRuntime';
import {
  CANONICAL_WARPKEEP_AUTH_ORIGIN,
  DEFAULT_SPACETIMEDB_DATABASE,
  DEFAULT_SPACETIMEDB_URI,
  DEFAULT_WARPKEEP_OIDC_AUDIENCE,
  type WarpkeepRuntimeConfig,
  readWarpkeepRuntimeConfig,
} from '../src/spacetime/warpkeepConfig';
import type { WarpkeepConnection } from '../src/spacetime/warpkeepConnection';
import { DbConnection } from '../src/spacetime/playerModuleBindings';
import { WARPKEEP_ALPHA_TERMS_VERSION } from '../src/legal/alphaTermsPolicy';

const INPUT = Object.freeze({
  evidenceNonce: 'a'.repeat(64),
  reviewedAdmissionPlanDigest: 'b'.repeat(64),
  routeSetCommitment: 'd'.repeat(64),
});
const SERVER_BASELINE_COMMITMENT = 'c'.repeat(64);
const FID = 77;
const CASTLE_ID = 7;
const ATLAS_REVISION = 9n;
const EQUAL_ROUTE_STEPS = 2;
const ROUTE_TRAVEL_MICROS = 60_000_000n;
const GATHER_QUANTUM_MICROS = 60_000_000n;
const POLL_INTERVAL_MILLISECONDS = 10_000;
const AUTH_NOW = Date.parse('2026-08-13T12:00:00.000Z');

function authoritySession(fid = FID) {
  const issuedAt = Math.floor(AUTH_NOW / 1_000);
  const expiresAt = issuedAt + 600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64url');
  const jwt = [
    encode({ alg: 'ES256', typ: 'JWT' }),
    encode({
      iss: CANONICAL_WARPKEEP_AUTH_ORIGIN,
      aud: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
      sub: `farcaster:${fid}`,
      fid: String(fid),
      token_type: 'spacetime-access',
      auth_version: 2,
      auth_epoch: 1,
      roles: [],
      jti: `owner-canary-${fid}`,
      iat: issuedAt,
      nbf: issuedAt,
      exp: expiresAt,
      session_iat: issuedAt,
      session_exp: expiresAt,
    }),
    'signature',
  ].join('.');
  return Object.freeze({
    jwt,
    issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
    audience: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
    expiresAt: expiresAt * 1_000,
  });
}

const CANONICAL_CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: DEFAULT_SPACETIMEDB_URI,
  spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
  bridgeUrl: CANONICAL_WARPKEEP_AUTH_ORIGIN,
  issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
  audience: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
  publicConfigValid: true,
  sharedAlphaEnabled: true,
});

const ROUTES = Object.freeze(OWNER_CANARY_RESOURCE_KINDS.map((resourceKind, index) => Object.freeze({
  ordinal: index + 1,
  workerId: `genesis-001-castle-${CASTLE_ID}-worker-0${index + 1}`,
  resourceKind,
  locationId: `GRL-${String.fromCharCode(65 + index).repeat(26)}`,
  atlasRevision: ATLAS_REVISION,
  routeSteps: EQUAL_ROUTE_STEPS,
  nodeCount: index + 1,
})));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Assignment = {
  dispatchKey: string;
  dispatchAtMicros: bigint;
  recallKey?: string;
  recallAtMicros?: bigint;
};

async function runtimeFixture(options: Readonly<{
  mutatePlan?: (plan: Record<string, unknown>) => unknown;
  planForCall?: (plan: Record<string, unknown>, call: number) => unknown | Promise<unknown>;
  controlForCall?: (state: Record<string, unknown>, call: number) => unknown;
  advancePollClock?: boolean;
  recallCommandAdvanceMicros?: bigint;
  dispatchResponseLossAtOrdinal?: number;
  dispatchFailureBeforeCommitAtOrdinal?: number;
  recallResponseLossAfterCommitAtOrdinal?: number;
  notAfterMicros?: bigint;
  connectFailureAtCall?: number;
}> = {}) {
  const commandMaterial = await ownerCanaryRuntimePlanTestSeams!.deriveCommandMaterial({
    ...INPUT,
    serverBaselineCommitment: SERVER_BASELINE_COMMITMENT,
  });
  const plan = {
    profile: 'warpkeep-production-player-canary-runtime-route-plan-v1',
    reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: SERVER_BASELINE_COMMITMENT,
    routeSetCommitment: INPUT.routeSetCommitment,
    commandKeyPolicyVersion: 'warpkeep-production-player-canary-command-key-v2',
    commandSetCommitment: commandMaterial.commandSetCommitment,
    notAfterMicros: options.notAfterMicros ?? 1_000_000_000n,
    atlasRevision: ATLAS_REVISION,
    equalRouteSteps: EQUAL_ROUTE_STEPS,
    routes: ROUTES.map(route => ({ ...route })),
  } satisfies Record<string, unknown>;
  let serverMicros = 1_000_000n;
  let resourceRevision = 1n;
  const workerRevisions = [1n, 1n, 1n, 1n];
  const assignments = new Map<string, Assignment>();
  let recoveryFenced = false;
  const dispatchInputs: unknown[] = [];
  const recallInputs: unknown[] = [];
  const runtimePlanInputs: unknown[] = [];
  let planCallCount = 0;
  let controlCallCount = 0;

  const state = () => {
    const resources: Record<string, bigint> = {
      food: 10n,
      wood: 10n,
      stone: 10n,
      gold: 10n,
    };
    const workers = ROUTES.map(route => {
      const assignment = assignments.get(route.workerId);
      let status: 'idle' | 'outbound' | 'gathering' | 'returning' = 'idle';
      let accruedAmount = 0n;
      let materializedAmount = 0n;
      if (assignment) {
        if (assignment.recallAtMicros !== undefined) {
          if (serverMicros >= assignment.recallAtMicros + ROUTE_TRAVEL_MICROS) {
            resources[route.resourceKind] = 11n;
          } else {
            status = 'returning';
            accruedAmount = 1n;
            materializedAmount = 1n;
          }
        } else if (serverMicros >= assignment.dispatchAtMicros + ROUTE_TRAVEL_MICROS) {
          status = 'gathering';
          if (
            serverMicros >= assignment.dispatchAtMicros
              + ROUTE_TRAVEL_MICROS
              + GATHER_QUANTUM_MICROS
          ) accruedAmount = 1n;
        } else {
          status = 'outbound';
        }
      }
      return {
        workerId: route.workerId,
        ordinal: route.ordinal,
        status,
        ...(status === 'idle' ? {} : {
          resourceKind: route.resourceKind,
          siteId: `${route.locationId}:1`,
        }),
        accruedAmount,
        materializedAmount,
        availableAmount: accruedAmount - materializedAmount,
        observedAtMicros: serverMicros,
        revision: workerRevisions[route.ordinal - 1]!,
      };
    });
    return {
      atlasId: 'greater-realm-atlas-v17-test',
      atlasRevision: ATLAS_REVISION,
      fid: BigInt(FID),
      castleId: BigInt(CASTLE_ID),
      observedAtMicros: serverMicros,
      workers,
      ...resources,
      workerPendingFood: 0n,
      workerPendingWood: 0n,
      workerPendingStone: 0n,
      workerPendingGold: 0n,
      settledThroughMicros: serverMicros,
      revision: resourceRevision,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
      workerPolicyVersion: 'genesis-001-castle-workers-v1',
      workerSystemMode: 'active',
    };
  };

  const connection = {
    procedures: {
      getProductionPlayerCanaryRuntimeV1: vi.fn(async (input: unknown) => {
        runtimePlanInputs.push(input);
        planCallCount += 1;
        if (options.planForCall) return options.planForCall(plan, planCallCount);
        return options.mutatePlan ? options.mutatePlan(plan) : plan;
      }),
      getMyAdmissionStatusV2: vi.fn(async () => 'ready'),
      getMyEntryAgreementStatusV1: vi.fn(async () => ({
        requiredVersion: WARPKEEP_ALPHA_TERMS_VERSION,
        acceptedCurrent: true,
      })),
      getMyWorkerControlStateV2: vi.fn(async () => {
        controlCallCount += 1;
        const current = state();
        return options.controlForCall
          ? options.controlForCall(current, controlCallCount)
          : current;
      }),
    },
    reducers: {
      dispatchGreaterRealmWorkerV1: vi.fn(async (input: {
        workerId: string;
        resourceKind: string;
        locationId: string;
        expectedRevision: bigint;
        idempotencyKey: string;
      }) => {
        dispatchInputs.push({ ...input });
        const routeIndex = ROUTES.findIndex(route => route.workerId === input.workerId);
        const route = ROUTES[routeIndex];
        if (
          !route
          || route.resourceKind !== input.resourceKind
          || route.locationId !== input.locationId
          || route.atlasRevision !== input.expectedRevision
          || commandMaterial.dispatch[routeIndex] !== input.idempotencyKey
        ) throw new Error('fixture dispatch mismatch');
        if (recoveryFenced) throw new Error('fixture dispatch fenced');
        if (options.dispatchFailureBeforeCommitAtOrdinal === route.ordinal) {
          throw new Error('synthetic dispatch failure before commit');
        }
        const existing = assignments.get(route.workerId);
        if (existing) {
          if (existing.dispatchKey !== input.idempotencyKey) {
            throw new Error('fixture dispatch replay mismatch');
          }
          return;
        }
        serverMicros += 1_000_000n;
        resourceRevision += 1n;
        workerRevisions[routeIndex] = workerRevisions[routeIndex]! + 1n;
        assignments.set(route.workerId, {
          dispatchKey: input.idempotencyKey,
          dispatchAtMicros: serverMicros,
        });
        if (options.dispatchResponseLossAtOrdinal === route.ordinal) {
          throw new Error('synthetic lost dispatch response');
        }
      }),
      recallProductionPlayerCanaryWorkerV1: vi.fn(async (input: {
        reviewedAdmissionPlanDigest: string;
        evidenceNonce: string;
        ordinal: number;
      }) => {
        recallInputs.push({ ...input });
        if (input.ordinal === 0) {
          if (
            input.reviewedAdmissionPlanDigest !== INPUT.reviewedAdmissionPlanDigest
            || input.evidenceNonce !== INPUT.evidenceNonce
          ) throw new Error('fixture recall-or-fence mismatch');
          if (recoveryFenced) return;
          for (const [index, route] of ROUTES.entries()) {
            const assignment = assignments.get(route.workerId);
            if (
              assignment
              && assignment.dispatchKey !== commandMaterial.dispatch[index]
            ) throw new Error('fixture recall-or-fence dispatch mismatch');
          }
          for (const [index, route] of ROUTES.entries()) {
            const assignment = assignments.get(route.workerId);
            if (!assignment || assignment.recallKey !== undefined) continue;
            serverMicros += 1_000_000n;
            resourceRevision += 1n;
            workerRevisions[index] = workerRevisions[index]! + 1n;
            assignment.recallKey = commandMaterial.recall[index]!;
            assignment.recallAtMicros = serverMicros;
          }
          // The real atomic reducer publishes f00 last as proof that every
          // position fence and exact containment recall completed. A later
          // serialized dispatch with a reviewed key must observe it.
          recoveryFenced = true;
          return;
        }
        const routeIndex = input.ordinal - 1;
        const route = ROUTES[routeIndex];
        const assignment = route ? assignments.get(route.workerId) : undefined;
        if (
          !route
          || !assignment
          || input.reviewedAdmissionPlanDigest !== INPUT.reviewedAdmissionPlanDigest
          || input.evidenceNonce !== INPUT.evidenceNonce
        ) throw new Error('fixture recall mismatch');
        const recallKey = commandMaterial.recall[routeIndex]!;
        if (assignment.recallKey === recallKey) return;
        if (assignment.recallKey !== undefined) throw new Error('fixture recall replay mismatch');
        serverMicros += options.recallCommandAdvanceMicros ?? 1_000_000n;
        resourceRevision += 1n;
        workerRevisions[routeIndex] = workerRevisions[routeIndex]! + 1n;
        assignment.recallKey = recallKey;
        assignment.recallAtMicros = serverMicros;
        if (options.recallResponseLossAfterCommitAtOrdinal === routeIndex + 1) {
          throw new Error('synthetic lost recall response');
        }
      }),
    },
  } as unknown as WarpkeepConnection;

  const wait = vi.fn(async (milliseconds: number, signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason;
    if (options.advancePollClock !== false) {
      serverMicros += BigInt(milliseconds) * 1_000n;
    }
  });
  const acknowledgeSanitizedEvidence = vi.fn();
  const authorityClosureCallbacks: Array<Readonly<{
    onAuthorityClosureUnconfirmed?: () => void;
  }>> = [];
  let connectCallCount = 0;
  const connect = vi.fn(async (
    _config: unknown,
    _jwt: string,
    _signal: AbortSignal,
    callbacks: Readonly<{ onAuthorityClosureUnconfirmed?: () => void }>,
  ) => {
    connectCallCount += 1;
    if (options.connectFailureAtCall === connectCallCount) {
      throw new Error('synthetic connect failure');
    }
    authorityClosureCallbacks.push(callbacks);
    return connection;
  });
  const runtime = createOwnerCanaryEvidenceRuntime({
    config: CANONICAL_CONFIG,
    pollPolicy: {
      intervalMilliseconds: POLL_INTERVAL_MILLISECONDS,
      maximumAttempts: 40,
      wait,
    },
    verifyPrivateSubject: vi.fn(async () => true),
    acknowledgeSanitizedEvidence,
    now: () => AUTH_NOW,
    connect: connect as never,
  });

  return {
    runtime,
    connection,
    dispatchInputs,
    recallInputs,
    runtimePlanInputs,
    connect,
    wait,
    acknowledgeSanitizedEvidence,
    authoritySession: authoritySession(),
    poisonLatestAuthorityLifecycle() {
      authorityClosureCallbacks.at(-1)?.onAuthorityClosureUnconfirmed?.();
    },
    commitLateDispatch(ordinal: number) {
      const route = ROUTES[ordinal - 1];
      if (recoveryFenced) throw new Error('fixture late dispatch fenced');
      if (!route || assignments.has(route.workerId)) {
        throw new Error('fixture late dispatch mismatch');
      }
      serverMicros += 1_000_000n;
      resourceRevision += 1n;
      workerRevisions[ordinal - 1] = workerRevisions[ordinal - 1]! + 1n;
      assignments.set(route.workerId, {
        dispatchKey: commandMaterial.dispatch[ordinal - 1]!,
        dispatchAtMicros: serverMicros,
      });
    },
    assignmentRecallKey(ordinal: number) {
      const route = ROUTES[ordinal - 1];
      return route ? assignments.get(route.workerId)?.recallKey : undefined;
    },
    setServerMicros(value: bigint) { serverMicros = value; },
    advanceServerMicros(value: bigint) { serverMicros += value; },
  };
}

async function runEvidence(
  fixture: Awaited<ReturnType<typeof runtimeFixture>>,
  beforeStage?: (stage: string) => void,
) {
  const stages: string[] = [];
  const controller = new AbortController();
  const evidence = await fixture.runtime.evidenceApi.run({
    ...INPUT,
    signal: controller.signal,
    runStage: async (stage, operation) => {
      stages.push(stage);
      beforeStage?.(stage);
      const authority = await fixture.runtime.openAuthority(
        fixture.authoritySession,
        controller.signal,
      );
      return operation(authority, controller.signal);
    },
  }) as OwnerCanaryJourneyEvidence;
  return { evidence, stages };
}

async function openRecallRecoveryAuthority(
  fixture: Awaited<ReturnType<typeof runtimeFixture>>,
) {
  return fixture.runtime.openRecallRecoveryAuthority(
    fixture.authoritySession,
    new AbortController().signal,
  );
}

async function openFreshPageRecoveryAuthority(
  fixture: Awaited<ReturnType<typeof runtimeFixture>>,
) {
  return fixture.runtime.openFreshPageRecoveryAuthority(
    fixture.authoritySession,
    new AbortController().signal,
  );
}

describe('owner canary production evidence runtime', () => {
  it('gives a fresh page only the atomic ordinal-zero recall-or-fence capability', async () => {
    const fixture = await runtimeFixture();
    const authority = await openFreshPageRecoveryAuthority(fixture);
    const signal = new AbortController().signal;
    await expect(fixture.runtime.freshPageRecoveryApi.recover(
      authority,
      {
        evidenceNonce: INPUT.evidenceNonce,
        reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      },
      signal,
    )).resolves.toBeUndefined();
    expect(fixture.recallInputs).toEqual([{
      reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      evidenceNonce: INPUT.evidenceNonce,
      ordinal: 0,
    }]);
    expect(fixture.dispatchInputs).toEqual([]);
    expect(fixture.runtimePlanInputs).toEqual([]);
    expect(fixture.runtime.recoveryApi.state()).toBe('none');

    await expect(fixture.runtime.openAuthority(
      fixture.authoritySession,
      signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    await expect(fixture.runtime.evidenceApi.run({
      ...INPUT,
      signal,
      runStage: async <Result>(): Promise<Result> => {
        throw new Error('fresh recovery cannot run a main stage');
      },
    })).rejects.toThrow('The owner canary evidence runtime stopped.');

    const secondAuthority = await openFreshPageRecoveryAuthority(fixture);
    await expect(fixture.runtime.freshPageRecoveryApi.recover(
      secondAuthority,
      {
        evidenceNonce: INPUT.evidenceNonce,
        reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      },
      signal,
    )).resolves.toBeUndefined();
    expect(fixture.recallInputs.map(input => (
      input as { ordinal: number }
    ).ordinal)).toEqual([0, 0]);
  });

  it('latches the first fresh-page subject inside the runtime across authority reopen', async () => {
    const fixture = await runtimeFixture();
    const first = await fixture.runtime.openFreshPageRecoveryAuthority(
      fixture.authoritySession,
      new AbortController().signal,
    );
    expect(first.subjectFid).toBe(FID);
    await expect(fixture.runtime.openFreshPageRecoveryAuthority(
      authoritySession(FID + 1),
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    const sameSubject = await fixture.runtime.openFreshPageRecoveryAuthority(
      fixture.authoritySession,
      new AbortController().signal,
    );
    expect(sameSubject.subjectFid).toBe(FID);
    expect(fixture.recallInputs).toEqual([]);
  });

  it('latches the first fresh-page subject before a failed connection can subject-hop', async () => {
    const fixture = await runtimeFixture({ connectFailureAtCall: 1 });
    await expect(fixture.runtime.openFreshPageRecoveryAuthority(
      fixture.authoritySession,
      new AbortController().signal,
    )).rejects.toThrow('synthetic connect failure');
    await expect(fixture.runtime.openFreshPageRecoveryAuthority(
      authoritySession(FID + 1),
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.connect).toHaveBeenCalledTimes(1);
    expect(fixture.recallInputs).toEqual([]);
  });

  it('rejects malformed or substituted fresh-page recovery capabilities before mutation', async () => {
    const fixture = await runtimeFixture();
    const authority = await openFreshPageRecoveryAuthority(fixture);
    let nonceRead = false;
    const accessor = {
      get evidenceNonce() {
        nonceRead = true;
        return INPUT.evidenceNonce;
      },
      reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
    };
    await expect(fixture.runtime.freshPageRecoveryApi.recover(
      authority,
      accessor,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(nonceRead).toBe(false);
    expect(fixture.recallInputs).toEqual([]);

    const other = await runtimeFixture();
    const substituted = await openFreshPageRecoveryAuthority(other);
    await expect(fixture.runtime.freshPageRecoveryApi.recover(
      substituted as never,
      {
        evidenceNonce: INPUT.evidenceNonce,
        reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      },
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.recallInputs).toEqual([]);

    const mixed = await runtimeFixture();
    await mixed.runtime.openAuthority(
      mixed.authoritySession,
      new AbortController().signal,
    );
    await expect(openFreshPageRecoveryAuthority(mixed)).rejects.toThrow(
      'The owner canary evidence runtime stopped.',
    );
    expect(mixed.recallInputs).toEqual([]);
  });

  it('runs the exact ten memory-only stages with ordered equal routes and deterministic replay', async () => {
    const fixture = await runtimeFixture();
    const { evidence, stages } = await runEvidence(fixture);

    expect(stages).toEqual(OWNER_CANARY_STAGES);
    expect(fixture.dispatchInputs).toHaveLength(8);
    expect(fixture.dispatchInputs.slice(4)).toEqual(fixture.dispatchInputs.slice(0, 4));
    expect(fixture.recallInputs).toHaveLength(4);
    expect(evidence.routes).toEqual(OWNER_CANARY_RESOURCE_KINDS.map((resourceKind, index) => ({
      resourceKind,
      routeLength: EQUAL_ROUTE_STEPS + 1,
      nodeCount: index + 1,
    })));
    expect(evidence.replays).toEqual([true, true, true, true]);
    expect(evidence.gathering).toEqual(OWNER_CANARY_RESOURCE_KINDS.map((resourceKind, index) => ({
      ordinal: index + 1,
      resourceKind,
      gatheringElapsedMs: 63_000 - index * 1_000,
      completedQuantumCount: 1,
    })));
    expect(evidence.baseline.workers.every(worker => worker.status === 'idle')).toBe(true);
    expect(evidence.terminal.workers.every(worker => worker.status === 'idle')).toBe(true);
    expect(evidence.terminal.resources).toEqual({ food: '11', wood: '11', stone: '11', gold: '11' });
    expect(fixture.runtimePlanInputs.length).toBeGreaterThan(0);
    for (const request of fixture.runtimePlanInputs) {
      expect(Reflect.ownKeys(request as object)).toEqual([
        'evidenceNonce',
        'reviewedAdmissionPlanDigest',
        'routeSetCommitment',
      ]);
      expect(request).toEqual(INPUT);
      expect(Object.isFrozen(request)).toBe(true);
    }

    const serialized = JSON.stringify(evidence);
    for (const privateValue of [
      INPUT.evidenceNonce,
      INPUT.reviewedAdmissionPlanDigest,
      INPUT.routeSetCommitment,
      SERVER_BASELINE_COMMITMENT,
      ...ROUTES.flatMap(route => [route.workerId, route.locationId]),
      ...fixture.dispatchInputs.map(input => (input as { idempotencyKey: string }).idempotencyKey),
      ...fixture.recallInputs.map(input => (input as { idempotencyKey: string }).idempotencyKey),
    ]) expect(serialized).not.toContain(privateValue);
    expect(fixture.acknowledgeSanitizedEvidence).not.toHaveBeenCalled();
  });

  it('rejects a route-plan extension before any command can run', async () => {
    const fixture = await runtimeFixture({
      mutatePlan: plan => ({ ...plan, browserAuthority: true }),
    });
    const error = await runEvidence(fixture).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('runtime-plan');
    expect(fixture.dispatchInputs).toEqual([]);
    expect(fixture.recallInputs).toEqual([]);
  });

  it('revalidates the registered plan immediately before dispatch and fails without a mutation', async () => {
    const fixture = await runtimeFixture({
      planForCall: (plan, call) => {
        if (call === 4) throw new Error('fixture approval expired');
        return plan;
      },
    });
    await expect(runEvidence(fixture)).rejects.toThrow('fixture approval expired');
    expect(fixture.dispatchInputs).toEqual([]);
    expect(fixture.recallInputs).toEqual([]);
  });

  it('retains exact atlas and active policy context before dispatch', async () => {
    for (const controlForCall of [
      (state: Record<string, unknown>, call: number) => call === 3
        ? { ...state, atlasId: 'substituted-atlas-with-same-revision' }
        : state,
      (state: Record<string, unknown>, call: number) => call === 3
        ? { ...state, workerSystemMode: 'canary' }
        : state,
      (state: Record<string, unknown>, call: number) => call === 3
        ? { ...state, resourcePolicyVersion: 'substituted-policy' }
        : state,
    ]) {
      const fixture = await runtimeFixture({ controlForCall });
      const error = await runEvidence(fixture).catch((caught: unknown) => caught);
      expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('control-state');
      expect(fixture.dispatchInputs).toEqual([]);
    }
  });

  it('anchors every dispatch observation to the pre-dispatch state and revision', async () => {
    const staleClock = await runtimeFixture({
      controlForCall: (state, call) => call === 4
        ? {
            ...state,
            observedAtMicros: 500_000n,
            settledThroughMicros: 500_000n,
            workers: (state.workers as Array<Record<string, unknown>>).map(worker => ({
              ...worker,
              observedAtMicros: 500_000n,
            })),
          }
        : state,
    });
    const staleError = await runEvidence(staleClock).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(staleError)).toBe('control-state');
    expect(staleClock.dispatchInputs).toHaveLength(1);

    const staleRevision = await runtimeFixture({
      controlForCall: (state, call) => call === 4
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map((worker, index) => (
              index === 0 ? { ...worker, revision: 1n } : worker
            )),
          }
        : state,
    });
    const revisionError = await runEvidence(staleRevision).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(revisionError)).toBe('control-state');
    expect(staleRevision.dispatchInputs).toHaveLength(1);
  });

  it('retains only attempted ordinals after lost dispatch response and recalls them to exact post-read safety', async () => {
    const fixture = await runtimeFixture({ dispatchResponseLossAtOrdinal: 2 });
    await expect(runEvidence(fixture)).rejects.toThrow(
      'The owner canary runtime plan stopped.',
    );
    expect(fixture.runtime.recoveryApi.state()).toBe('required');
    expect(fixture.dispatchInputs).toHaveLength(2);
    expect(fixture.recallInputs).toEqual([]);

    const mainAuthority = await fixture.runtime.openAuthority(
      fixture.authoritySession,
      new AbortController().signal,
    );
    await expect(fixture.runtime.recoveryApi.recover(
      mainAuthority as never,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.runtime.recoveryApi.state()).toBe('required');
    expect(fixture.recallInputs).toEqual([]);
    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).resolves.toBeUndefined();
    expect(fixture.runtime.recoveryApi.state()).toBe('safe');
    expect(fixture.recallInputs).toHaveLength(2);
    expect(fixture.recallInputs.map(input => (
      input as { ordinal: number }
    ).ordinal)).toEqual([1, 2]);
    expect(fixture.recallInputs.every(input => (
      Reflect.ownKeys(input as object).sort().join('\0')
        === ['evidenceNonce', 'ordinal', 'reviewedAdmissionPlanDigest'].sort().join('\0')
    ))).toBe(true);

    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    await expect(runEvidence(fixture)).rejects.toThrow(
      'The owner canary evidence runtime stopped.',
    );
    expect(fixture.dispatchInputs).toHaveLength(2);
  });

  it('uses exact recovery post-state when a correlated recall response is lost', async () => {
    const fixture = await runtimeFixture({
      dispatchResponseLossAtOrdinal: 2,
      recallResponseLossAfterCommitAtOrdinal: 1,
    });
    await expect(runEvidence(fixture)).rejects.toThrow();
    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).resolves.toBeUndefined();
    expect(fixture.recallInputs).toHaveLength(2);
    expect(fixture.runtime.recoveryApi.state()).toBe('safe');
  });

  it('atomically fences every reviewed dispatch key after an unconfirmed main close', async () => {
    const fixture = await runtimeFixture({
      dispatchFailureBeforeCommitAtOrdinal: 1,
    });
    await expect(runEvidence(fixture)).rejects.toThrow(
      'The owner canary runtime plan stopped.',
    );
    expect(fixture.runtime.recoveryApi.state()).toBe('required');
    fixture.poisonLatestAuthorityLifecycle();

    const firstAuthority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      firstAuthority,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.recallInputs).toEqual([{
      reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      evidenceNonce: INPUT.evidenceNonce,
      ordinal: 0,
    }]);
    expect(fixture.runtime.recoveryApi.state()).toBe('unconfirmed');
    expect(() => fixture.commitLateDispatch(1)).toThrow('fixture late dispatch fenced');

    const secondAuthority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      secondAuthority,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.recallInputs.map(input => (
      input as { ordinal: number }
    ).ordinal)).toEqual([0, 0]);
    expect(fixture.runtime.recoveryApi.state()).toBe('unconfirmed');
  });

  it('recalls a late old dispatch that serializes before the poisoned recovery fence', async () => {
    const fixture = await runtimeFixture({
      dispatchFailureBeforeCommitAtOrdinal: 1,
    });
    await expect(runEvidence(fixture)).rejects.toThrow(
      'The owner canary runtime plan stopped.',
    );
    fixture.poisonLatestAuthorityLifecycle();
    fixture.commitLateDispatch(1);

    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.recallInputs).toEqual([{
      reviewedAdmissionPlanDigest: INPUT.reviewedAdmissionPlanDigest,
      evidenceNonce: INPUT.evidenceNonce,
      ordinal: 0,
    }]);
    expect(fixture.assignmentRecallKey(1)).toMatch(/^pc2-r01-[0-9a-f]{64}$/u);
    expect(fixture.runtime.recoveryApi.state()).toBe('unconfirmed');
  });

  it('rejects unattempted activity and route substitution before any recovery mutation', async () => {
    for (const controlForCall of [
      (state: Record<string, unknown>, call: number) => call === 5
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map((worker, index) => (
              index === 2 ? {
                ...worker,
                status: 'outbound',
                resourceKind: ROUTES[2]!.resourceKind,
                siteId: `${ROUTES[2]!.locationId}:1`,
              } : worker
            )),
          }
        : state,
      (state: Record<string, unknown>, call: number) => call === 5
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map((worker, index) => (
              index === 0 ? { ...worker, siteId: `${ROUTES[0]!.locationId}:2` } : worker
            )),
          }
        : state,
    ]) {
      const fixture = await runtimeFixture({
        dispatchResponseLossAtOrdinal: 2,
        controlForCall,
      });
      await expect(runEvidence(fixture)).rejects.toThrow();
      const authority = await openRecallRecoveryAuthority(fixture);
      await expect(fixture.runtime.recoveryApi.recover(
        authority,
        new AbortController().signal,
      )).rejects.toThrow('The owner canary evidence runtime stopped.');
      expect(fixture.runtime.recoveryApi.state()).toBe('unconfirmed');
      expect(fixture.recallInputs).toEqual([]);
    }
  });

  it('does not mutate attempted workers already returning or clean idle', async () => {
    const fixture = await runtimeFixture({
      dispatchResponseLossAtOrdinal: 2,
      controlForCall: (state, call) => call >= 5
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map((worker, index) => {
              if (index === 0) return {
                ...worker,
                status: 'idle',
                resourceKind: undefined,
                siteId: undefined,
                accruedAmount: 0n,
                materializedAmount: 0n,
                availableAmount: 0n,
                revision: 4n,
              };
              if (index === 1) return {
                ...worker,
                status: 'returning',
                revision: 3n,
              };
              return worker;
            }),
          }
        : state,
    });
    await expect(runEvidence(fixture)).rejects.toThrow();
    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).resolves.toBeUndefined();
    expect(fixture.recallInputs).toEqual([]);
    expect(fixture.runtime.recoveryApi.state()).toBe('safe');
  });

  it('rejects a later same-route assignment revision before conditional recall', async () => {
    const fixture = await runtimeFixture({
      dispatchResponseLossAtOrdinal: 2,
      controlForCall: (state, call) => call === 5
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map(
              (worker, index) => index === 0
                ? { ...worker, revision: 6n }
                : worker,
            ),
          }
        : state,
    });
    await expect(runEvidence(fixture)).rejects.toThrow();
    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).rejects.toThrow('The owner canary evidence runtime stopped.');
    expect(fixture.runtime.recoveryApi.state()).toBe('unconfirmed');
    expect(fixture.recallInputs).toEqual([]);
  });

  it('fails at the exact not-after bracket while retaining recall-only recovery', async () => {
    const fixture = await runtimeFixture({ notAfterMicros: 2_000_000n });
    const error = await runEvidence(fixture).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('control-state');
    expect(fixture.dispatchInputs).toHaveLength(1);
    expect(fixture.runtime.recoveryApi.state()).toBe('required');
    const authority = await openRecallRecoveryAuthority(fixture);
    await expect(fixture.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    )).resolves.toBeUndefined();
    expect(fixture.recallInputs).toHaveLength(1);
  });

  it('enforces the thirty-second stage ceiling and ten-second recovery read ceilings', async () => {
    vi.useFakeTimers();
    const hangingStage = await runtimeFixture({
      planForCall: (_plan, call) => call === 1
        ? new Promise<never>(() => undefined)
        : _plan,
    });
    const stageResult = runEvidence(hangingStage).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(OWNER_CANARY_ACTION_CEILING_MILLISECONDS);
    expect(ownerCanaryEvidenceRuntimeFailureCode(await stageResult)).toBe('action-timeout');
    vi.useRealTimers();

    const hangingRecovery = await runtimeFixture({
      dispatchResponseLossAtOrdinal: 1,
      controlForCall: (state, call) => call === 4
        ? new Promise<never>(() => undefined)
        : state,
    });
    await expect(runEvidence(hangingRecovery)).rejects.toThrow();
    vi.useFakeTimers();
    const authority = await openRecallRecoveryAuthority(hangingRecovery);
    const recoveryResult = hangingRecovery.runtime.recoveryApi.recover(
      authority,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(OWNER_CANARY_RECOVERY_READ_CEILING_MILLISECONDS);
    expect(ownerCanaryEvidenceRuntimeFailureCode(await recoveryResult)).toBe('action-timeout');
    expect(hangingRecovery.runtime.recoveryApi.state()).toBe('unconfirmed');
    expect(hangingRecovery.recallInputs).toEqual([]);
  });

  it('requires replay to preserve the exact capacity lease but permits scheduled arrival', async () => {
    const drifted = await runtimeFixture({
      controlForCall: (state, call) => call === 9
        ? {
            ...state,
            workers: (state.workers as Array<Record<string, unknown>>).map((worker, index) => (
              index === 0 ? { ...worker, siteId: `${ROUTES[0]!.locationId}:2` } : worker
            )),
          }
        : state,
    });
    const driftError = await runEvidence(drifted).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(driftError)).toBe('control-state');
    expect(drifted.recallInputs).toEqual([]);

    const arrived = await runtimeFixture({
      controlForCall: (state, call) => call === 9
        ? (() => {
            arrived.setServerMicros(65_000_000n);
            return {
              ...state,
              observedAtMicros: 65_000_000n,
              settledThroughMicros: 65_000_000n,
              workers: (state.workers as Array<Record<string, unknown>>).map(worker => ({
                ...worker,
                status: 'gathering',
                observedAtMicros: 65_000_000n,
                revision: (worker.revision as bigint) + 1n,
              })),
            };
          })()
        : state,
    });
    await expect(runEvidence(arrived)).resolves.toMatchObject({
      evidence: { replays: [true, true, true, true] },
    });
  });

  it('rejects a substituted capacity lease during gathering before recall', async () => {
    const fixture = await runtimeFixture({
      controlForCall: state => {
        const workers = state.workers as Array<Record<string, unknown>>;
        return workers.every(worker => (
          worker.status === 'gathering' && (worker.accruedAmount as bigint) > 0n
        ))
          ? {
              ...state,
              workers: workers.map((worker, index) => index === 0
                ? { ...worker, siteId: `${ROUTES[0]!.locationId}:2` }
                : worker),
            }
          : state;
      },
    });
    const error = await runEvidence(fixture).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('poll-exhausted');
    expect(fixture.recallInputs).toEqual([]);
  });

  it('fails closed when the injected reviewed poll budget is exhausted', async () => {
    const commandMaterial = await ownerCanaryRuntimePlanTestSeams!.deriveCommandMaterial({
      ...INPUT,
      serverBaselineCommitment: SERVER_BASELINE_COMMITMENT,
    });
    const fixture = await runtimeFixture({ advancePollClock: false });
    const runtime = createOwnerCanaryEvidenceRuntime({
      config: CANONICAL_CONFIG,
      pollPolicy: {
        intervalMilliseconds: POLL_INTERVAL_MILLISECONDS,
        maximumAttempts: 2,
        wait: fixture.wait,
      },
      verifyPrivateSubject: async () => true,
      now: () => AUTH_NOW,
      connect: async () => fixture.connection,
    });
    const abort = new AbortController();
    const authority = await runtime.openAuthority(authoritySession(), abort.signal);
    const error = await runtime.evidenceApi.run({
      ...INPUT,
      signal: abort.signal,
      runStage: (_stage, operation) => operation(authority, abort.signal),
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('poll-exhausted');
    expect(fixture.wait).toHaveBeenCalledOnce();
    expect(fixture.dispatchInputs).toHaveLength(commandMaterial.dispatch.length * 2);
    expect(fixture.recallInputs).toEqual([]);
  });

  it('recalls all four workers before rejecting an overlong gathering window', async () => {
    const fixture = await runtimeFixture();
    const error = await runEvidence(fixture, stage => {
      if (stage === 'recall') fixture.advanceServerMicros(60_000_000n);
    }).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('control-state');
    expect(fixture.recallInputs).toHaveLength(4);
  });

  it('rejects a recall burst whose server-observed duration exceeds thirty seconds', async () => {
    const fixture = await runtimeFixture({
      recallCommandAdvanceMicros: 8_000_000n,
    });
    const error = await runEvidence(fixture).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(error)).toBe('control-state');
    expect(fixture.recallInputs).toHaveLength(4);
  });

  it('rejects stale terminal chronology and a decreasing final resource view', async () => {
    const stale = await runtimeFixture({
      controlForCall: (state, call) => call === 26
        ? {
            ...state,
            observedAtMicros: 1_000_000n,
            settledThroughMicros: 1_000_000n,
            workers: (state.workers as Array<Record<string, unknown>>).map(worker => ({
              ...worker,
              status: 'idle',
              resourceKind: undefined,
              siteId: undefined,
              accruedAmount: 0n,
              materializedAmount: 0n,
              availableAmount: 0n,
              observedAtMicros: 1_000_000n,
            })),
          }
        : state,
    });
    const staleError = await runEvidence(stale).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(staleError)).toBe('control-state');

    const decreased = await runtimeFixture({
      controlForCall: (state, call) => call === 32
        ? { ...state, food: 9n }
        : state,
    });
    const decreaseError = await runEvidence(decreased).catch((caught: unknown) => caught);
    expect(ownerCanaryEvidenceRuntimeFailureCode(decreaseError)).toBe('control-state');
  });

  it('rechecks approval after urgent recall before returning browser evidence', async () => {
    const fixture = await runtimeFixture({
      planForCall: (plan, call) => {
        if (call === 5) throw new Error('fixture final approval expired');
        return plan;
      },
    });
    await expect(runEvidence(fixture)).rejects.toThrow('fixture final approval expired');
    expect(fixture.dispatchInputs).toHaveLength(8);
    expect(fixture.recallInputs).toHaveLength(4);
  });

  it('requires an injected finite poll policy and only the exact canonical production config', () => {
    expect(isExactOwnerCanaryProductionConfig(CANONICAL_CONFIG)).toBe(true);
    for (const changed of [
      { spacetimeUri: 'https://example.com' },
      { spacetimeDatabase: 'e'.repeat(64) },
      { bridgeUrl: 'https://auth.example.com' },
      { issuer: 'https://auth.example.com' },
      { audience: 'different-audience' },
      { publicConfigValid: false },
      { sharedAlphaEnabled: false },
      { allowLocalHttp: true },
    ]) expect(isExactOwnerCanaryProductionConfig({ ...CANONICAL_CONFIG, ...changed })).toBe(false);

    expect(() => createOwnerCanaryEvidenceRuntime({
      config: CANONICAL_CONFIG,
      pollPolicy: {
        intervalMilliseconds: 0,
        maximumAttempts: 0,
        wait: async () => undefined,
      },
      verifyPrivateSubject: async () => true,
    })).toThrow('The owner canary evidence runtime stopped.');
  });

  it('keeps the canonical production loader inert without reviewed composition dependencies', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SPACETIMEDB_URI', DEFAULT_SPACETIMEDB_URI);
    vi.stubEnv('VITE_SPACETIMEDB_DATABASE', DEFAULT_SPACETIMEDB_DATABASE);
    vi.stubEnv('VITE_WARPKEEP_AUTH_BRIDGE_URL', CANONICAL_WARPKEEP_AUTH_ORIGIN);
    vi.stubEnv('VITE_WARPKEEP_OIDC_ISSUER', CANONICAL_WARPKEEP_AUTH_ORIGIN);
    vi.stubEnv('VITE_WARPKEEP_OIDC_AUDIENCE', DEFAULT_WARPKEEP_OIDC_AUDIENCE);
    vi.stubEnv('VITE_WARPKEEP_SHARED_ALPHA_ENABLED', 'true');
    expect(isExactOwnerCanaryProductionConfig(readWarpkeepRuntimeConfig())).toBe(true);

    const builder = vi.spyOn(DbConnection, 'builder');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(loadOwnerCanaryProductionRuntime()).resolves.toBeNull();
    expect(builder).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps founding, admission, Terms acceptance, admin, persistence and transfer APIs out of the adapter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/owner-canary/ownerCanaryEvidenceRuntime.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/acceptWarpkeepAlphaTerms|bootstrapWarpkeepPlayer|admin[A-Z]|localStorage|sessionStorage|indexedDB|navigator\.clipboard|fetch\s*\(/u);
    expect(source).toContain('readWarpkeepAdmissionStatus');
    expect(source).toContain('readWarpkeepEntryAgreementStatus');
    expect(source).toContain('getProductionPlayerCanaryRuntimeV1');
    expect(source).toContain('acknowledgeSanitizedEvidence');
  });
});
