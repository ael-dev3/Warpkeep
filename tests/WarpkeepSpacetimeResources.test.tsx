import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedFarcaster = vi.hoisted(() => ({ current: undefined as unknown }));
const deferredBackendStateUpdate = vi.hoisted(() => ({
  armed: false,
  queued: undefined as (() => void) | undefined
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <State,>(initialState: State | (() => State)) => {
      const [value, setValue] = actual.useState(initialState);
      const isBackendState = typeof initialState === 'object'
        && initialState !== null
        && 'phase' in initialState
        && initialState.phase === 'idle';
      if (!isBackendState) return [value, setValue] as const;

      const deferableSetValue: typeof setValue = (update) => {
        if (deferredBackendStateUpdate.armed && typeof update === 'function') {
          deferredBackendStateUpdate.armed = false;
          deferredBackendStateUpdate.queued = () => setValue(update);
          return;
        }
        setValue(update);
      };
      return [value, deferableSetValue] as const;
    }
  };
});

vi.mock('../src/farcaster/FarcasterAuthProvider', () => ({
  useFarcasterAuth: () => mockedFarcaster.current
}));

import type { ReadyRealmResourcePresentation } from '../src/components/realm/realmResourcePresentation';
import type { ReadyGoldExpeditionPresentation } from '../src/components/realm/realmGoldExpeditionPresentation';
import type { ReadyFoodExpeditionPresentation } from '../src/components/realm/realmFoodExpeditionPresentation';
import type { ReadyWoodExpeditionPresentation } from '../src/components/realm/realmWoodExpeditionPresentation';
import type { ReadyStoneExpeditionPresentation } from '../src/components/realm/realmStoneExpeditionPresentation';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_REALM_ID,
  workerRosterDigestForCastleIds,
  type ReadyWorkerResourceState,
  type WorkerRosterPresentation
} from '../src/components/realm/realmWorkerPresentation';
import {
  RESOURCE_OPERATION_TIMEOUT_MILLISECONDS,
  RESOURCE_REFRESH_INTERVAL_MILLISECONDS,
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendControllerValue,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import {
  DEFAULT_SPACETIMEDB_DATABASE,
  type WarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';
import type { WarpkeepRealmSnapshot } from '../src/spacetime/warpkeepBackendTypes';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

const CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
  bridgeUrl: 'https://auth.warpkeep.com',
  issuer: 'https://auth.warpkeep.com',
  audience: 'warpkeep-spacetimedb',
  publicConfigValid: true,
  sharedAlphaEnabled: true
});

function jwtSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function authenticatedFarcaster(fid = 12_345, sequence = 1) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + 300;
  return {
    state: {
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha',
      identity: {
        fid,
        username: `keeper${fid}`,
        verifications: [],
        authMethod: 'authAddress',
        verifiedAt: Date.now()
      }
    },
    oidcSession: {
      jwt: [
        jwtSegment({ alg: 'ES256', typ: 'JWT' }),
        jwtSegment({
          iss: CONFIG.issuer,
          aud: CONFIG.audience,
          sub: `farcaster:${fid}`,
          fid: String(fid),
          token_type: 'spacetime-access',
          auth_version: 2,
          auth_epoch: 1,
          roles: [],
          jti: `resource-lifecycle-${sequence}`,
          iat: issuedAt,
          nbf: issuedAt,
          exp: expiresAt,
          session_iat: issuedAt,
          session_exp: expiresAt
        }),
        `signature-${sequence}`
      ].join('.'),
      issuer: CONFIG.issuer,
      audience: CONFIG.audience,
      expiresAt: expiresAt * 1_000
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resourceState(
  fid: number,
  revision: bigint,
  food: bigint
): ReadyRealmResourcePresentation {
  const base = createReadyResourceState(fid, revision);
  return Object.freeze({
    ...base,
    balances: Object.freeze({ ...base.balances, food })
  });
}

function goldExpeditionState(
  active = false,
  pendingGold = 0n
): ReadyGoldExpeditionPresentation {
  return Object.freeze({
    status: 'ready' as const,
    active,
    accruedGold: pendingGold,
    pendingGold,
    creditedGold: 0n,
    rateGoldPerMinute: 1n,
    gatheringDurationMicros: 2_592_000_000_000n,
    ...(active ? {
      expedition: Object.freeze({
        expeditionId: '00000000-0000-4000-8000-000000000001',
        siteId: 'genesis-001:gold:0001',
        originCastleId: 1,
        phase: 'gathering' as const,
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 30n,
        returnsAtMicros: 40n,
        policyVersion: 'genesis-gold-wagon-expedition-v1' as const
      })
    } : {})
  });
}

function foodExpeditionState(
  active = false,
  pendingFood = 0n
): ReadyFoodExpeditionPresentation {
  return Object.freeze({
    status: 'ready' as const,
    active,
    accruedFood: pendingFood,
    pendingFood,
    creditedFood: 0n,
    rateFoodPerMinute: 1n,
    gatheringDurationMicros: 2_592_000_000_000n,
    ...(active ? {
      expedition: Object.freeze({
        expeditionId: '00000000-0000-4000-8000-000000000002',
        siteId: 'genesis-001:food:0001',
        originCastleId: 1,
        phase: 'gathering' as const,
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 30n,
        returnsAtMicros: 40n,
        policyVersion: 'genesis-food-wheat-farm-expedition-v1' as const
      })
    } : {})
  });
}

function woodExpeditionState(
  active = false,
  pendingWood = 0n
): ReadyWoodExpeditionPresentation {
  return Object.freeze({
    status: 'ready' as const,
    active,
    accruedWood: pendingWood,
    pendingWood,
    creditedWood: 0n,
    rateWoodPerMinute: 1n,
    gatheringDurationMicros: 2_592_000_000_000n,
    ...(active ? {
      expedition: Object.freeze({
        expeditionId: '00000000-0000-4000-8000-000000000003',
        siteId: 'genesis-001:wood:0001',
        originCastleId: 1,
        phase: 'gathering' as const,
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 30n,
        returnsAtMicros: 40n,
        policyVersion: 'genesis-wood-logging-camp-expedition-v1' as const
      })
    } : {})
  });
}

function stoneExpeditionState(
  active = false,
  pendingStone = 0n
): ReadyStoneExpeditionPresentation {
  return Object.freeze({
    status: 'ready' as const,
    active,
    accruedStone: pendingStone,
    pendingStone,
    creditedStone: 0n,
    rateStonePerMinute: 1n,
    gatheringDurationMicros: 2_592_000_000_000n,
    ...(active ? {
      expedition: Object.freeze({
        expeditionId: '00000000-0000-4000-8000-000000000004',
        siteId: 'genesis-001:stone:0001',
        originCastleId: 1,
        phase: 'gathering' as const,
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 30n,
        returnsAtMicros: 40n,
        policyVersion: 'genesis-stone-quarry-expedition-v1' as const
      })
    } : {})
  });
}

function resourceStateWithWood(
  fid: number,
  revision: bigint,
  wood: bigint
): ReadyRealmResourcePresentation {
  const base = createReadyResourceState(fid, revision);
  return Object.freeze({
    ...base,
    balances: Object.freeze({ ...base.balances, wood })
  });
}

function resourceStateWithStone(
  fid: number,
  revision: bigint,
  stone: bigint
): ReadyRealmResourcePresentation {
  const base = createReadyResourceState(fid, revision);
  return Object.freeze({
    ...base,
    balances: Object.freeze({ ...base.balances, stone })
  });
}

function resourceStateWithGold(
  fid: number,
  revision: bigint,
  gold: bigint
): ReadyRealmResourcePresentation {
  const base = createReadyResourceState(fid, revision);
  return Object.freeze({
    ...base,
    balances: Object.freeze({ ...base.balances, gold })
  });
}

function idleWorkerRows(castleId = 1) {
  return [1, 2, 3, 4].map((ordinal) => Object.freeze({
    workerId: `genesis-001-castle-${castleId}-worker-0${ordinal}`,
    ordinal: ordinal as 1 | 2 | 3 | 4,
    originCastleId: castleId,
    originCastleName: 'Warpkeeper Bastion',
    status: 'idle' as const,
    timelineRevision: 0,
    revision: 0n,
    ownedByViewer: true
  }));
}

function workerRealmSnapshot(fid = 12_345): WarpkeepRealmSnapshot {
  const base = createCanonicalGenesisSnapshot(fid);
  const castleId = base.ownCastle.castleId;
  return Object.freeze({
    ...base,
    workerSystem: Object.freeze({
      realmId: CASTLE_WORKER_REALM_ID,
      policyVersion: CASTLE_WORKER_POLICY_VERSION,
      workersPerCastle: 4 as const,
      expectedCastleCount: 1,
      expectedWorkerCount: 4,
      rosterDigest: workerRosterDigestForCastleIds([castleId]),
      mode: 'active' as const,
      legacyDrainRequired: false
    }),
    workerWorkers: Object.freeze(idleWorkerRows(castleId)),
    workerOccupations: Object.freeze([])
  });
}

function workerRoster(castleId = 1): WorkerRosterPresentation {
  return Object.freeze({
    castleId,
    observedAtMicros: 100n,
    workers: Object.freeze(idleWorkerRows(castleId).map((worker) => Object.freeze({
      workerId: worker.workerId,
      ordinal: worker.ordinal,
      status: worker.status,
      accruedAmount: 0n,
      materializedAmount: 0n,
      availableAmount: 0n,
      observedAtMicros: 100n,
      revision: worker.revision
    })))
  });
}

function workerResourceState(fid = 12_345): ReadyWorkerResourceState {
  return Object.freeze({
    status: 'ready' as const,
    fid: BigInt(fid),
    available: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
    pending: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
    observedAtMicros: 100n,
    settledThroughMicros: 100n,
    revision: 0n,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    workerPolicyVersion: CASTLE_WORKER_POLICY_VERSION,
    workerSystemMode: 'active' as const
  });
}

function outboundWorkerRealmSnapshot(fid = 12_345): WarpkeepRealmSnapshot {
  const base = workerRealmSnapshot(fid);
  const [first, ...rest] = base.workerWorkers!;
  const activeWorker = Object.freeze({
    ...first!,
    status: 'outbound' as const,
    resourceKind: 'stone' as const,
    siteId: 'genesis-001:stone:0001',
    startedAtMicros: 100n,
    arrivesAtMicros: 200n,
    gatheringEndsAtMicros: 300n,
    returnsAtMicros: 400n,
    routeSteps: 10,
    timelineRevision: 1,
    revision: 1n
  });
  return Object.freeze({
    ...base,
    workerWorkers: Object.freeze([activeWorker, ...rest]),
    workerOccupations: Object.freeze([Object.freeze({
      nodeKey: 'stone:genesis-001:stone:0001',
      resourceKind: 'stone' as const,
      siteId: 'genesis-001:stone:0001',
      workerId: activeWorker.workerId,
      workerOrdinal: activeWorker.ordinal,
      originCastleId: activeWorker.originCastleId,
      phase: 'outbound' as const,
      startedAtMicros: activeWorker.startedAtMicros,
      arrivesAtMicros: activeWorker.arrivesAtMicros,
      gatheringEndsAtMicros: activeWorker.gatheringEndsAtMicros,
      timelineRevision: activeWorker.timelineRevision
    })])
  });
}

function outboundWorkerRoster(castleId = 1): WorkerRosterPresentation {
  const base = workerRoster(castleId);
  return Object.freeze({
    ...base,
    observedAtMicros: 200n,
    workers: Object.freeze(base.workers.map((worker, index) => index === 0
      ? Object.freeze({
        ...worker,
        status: 'outbound' as const,
        resourceKind: 'stone' as const,
        siteId: 'genesis-001:stone:0001',
        observedAtMicros: 200n,
        revision: 1n
      })
      : Object.freeze({ ...worker, observedAtMicros: 200n })))
  });
}

function newerWorkerResourceState(fid = 12_345): ReadyWorkerResourceState {
  return Object.freeze({
    ...workerResourceState(fid),
    observedAtMicros: 200n,
    settledThroughMicros: 200n,
    revision: 1n
  });
}

function createRuntimeHarness() {
  const disconnect = vi.fn((connection: { disconnect?: () => void } | undefined) => {
    connection?.disconnect?.();
  });
  const runtime = {
    connect: vi.fn(async () => ({ isDisconnectRequested: false, disconnect: vi.fn() })),
    disconnect,
    readBackendInfo: vi.fn(async () => ({
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    })),
    readAdmission: vi.fn(async () => 'ready'),
    bootstrapPlayer: vi.fn(async () => undefined),
    acceptAlphaTerms: vi.fn(async () => undefined),
    readResourceState: vi.fn(async (_connection, fid: number) => createReadyResourceState(fid)),
    collectResources: vi.fn(async (_connection, fid: number) => createReadyResourceState(fid)),
    observeRealm: vi.fn(() => vi.fn()),
    readRealmSnapshot: vi.fn((_connection, fid: number) => createCanonicalGenesisSnapshot(fid)),
    subscribeRealm: vi.fn((_connection, onApplied: () => void) => {
      onApplied();
      return { unsubscribe: vi.fn() };
    })
  } as unknown as WarpkeepBackendRuntime;
  return { runtime, disconnect };
}

let capturedBackend: WarpkeepBackendControllerValue | undefined;

function Probe() {
  const backend = useWarpkeepBackend();
  capturedBackend = backend;
  return (
    <>
      <output data-testid="phase">{backend.state.phase}</output>
      <output data-testid="resource-fid">{backend.state.resources?.fid.toString() ?? ''}</output>
      <output data-testid="resource-revision">
        {backend.state.resources?.revision.toString() ?? ''}
      </output>
      <output data-testid="resource-food">
        {backend.state.resources?.balances.food.toString() ?? ''}
      </output>
      <output data-testid="resource-wood">
        {backend.state.resources?.balances.wood.toString() ?? ''}
      </output>
      <output data-testid="resource-stone">
        {backend.state.resources?.balances.stone.toString() ?? ''}
      </output>
      <output data-testid="resource-gold">
        {backend.state.resources?.balances.gold.toString() ?? ''}
      </output>
      <output data-testid="gold-active">
        {backend.state.goldExpedition?.active === undefined
          ? ''
          : String(backend.state.goldExpedition.active)}
      </output>
      <output data-testid="food-expedition-active">
        {backend.state.foodExpedition?.active === undefined
          ? ''
          : String(backend.state.foodExpedition.active)}
      </output>
      <output data-testid="wood-expedition-active">
        {backend.state.woodExpedition?.active === undefined
          ? ''
          : String(backend.state.woodExpedition.active)}
      </output>
      <output data-testid="stone-expedition-active">
        {backend.state.stoneExpedition?.active === undefined
          ? ''
          : String(backend.state.stoneExpedition.active)}
      </output>
      <output data-testid="worker-active">
        {backend.state.workerProjection?.mode ?? ''}
      </output>
      <output data-testid="worker-first-status">
        {backend.state.workerRoster?.workers[0]?.status ?? ''}
      </output>
      <output data-testid="worker-first-revision">
        {backend.state.workerRoster?.workers[0]?.revision.toString() ?? ''}
      </output>
      <output data-testid="worker-resource-revision">
        {backend.state.workerResourceState?.revision.toString() ?? ''}
      </output>
      <button type="button" onClick={backend.beginAlphaTermsAcceptance}>ACCEPT TERMS</button>
      <button type="button" onClick={() => void backend.collectResources()}>COLLECT</button>
      <button
        type="button"
        onClick={() => void backend.dispatchGoldExpedition('genesis-001:gold:0001')
          .catch(() => undefined)}
      >
        DISPATCH GOLD
      </button>
      <button type="button" onClick={() => void backend.claimGoldExpedition()}>
        CLAIM GOLD
      </button>
      <button
        type="button"
        onClick={() => void backend.dispatchFoodExpedition('genesis-001:food:0001')
          .catch(() => undefined)}
      >
        DISPATCH FOOD
      </button>
      <button type="button" onClick={() => void backend.claimFoodExpedition()}>
        CLAIM FOOD
      </button>
      <button
        type="button"
        onClick={() => void backend.dispatchWoodExpedition('genesis-001:wood:0001')
          .catch(() => undefined)}
      >
        DISPATCH WOOD
      </button>
      <button type="button" onClick={() => void backend.claimWoodExpedition()}>
        CLAIM WOOD
      </button>
      <button
        type="button"
        onClick={() => void backend.dispatchStoneExpedition('genesis-001:stone:0001')
          .catch(() => undefined)}
      >
        DISPATCH STONE
      </button>
      <button type="button" onClick={() => void backend.claimStoneExpedition()}>
        CLAIM STONE
      </button>
      <button
        type="button"
        onClick={() => void backend.dispatchWorker(
          'genesis-001-castle-1-worker-01',
          'stone',
          'genesis-001:stone:0001'
        ).catch(() => undefined)}
      >
        DISPATCH WORKER
      </button>
      <button type="button" onClick={backend.disconnect}>DISCONNECT</button>
    </>
  );
}

function renderProvider(runtime: WarpkeepBackendRuntime) {
  return render(
    <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
      <Probe />
    </WarpkeepSpacetimeProvider>
  );
}

async function enterRealm() {
  await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
  fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
  await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
}

async function flushProviderWork(rounds = 20) {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  capturedBackend = undefined;
  deferredBackendStateUpdate.armed = false;
  deferredBackendStateUpdate.queued = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Warpkeep private resource lifecycle', () => {
  it('starts every private projection and the public Realm subscription concurrently', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const resources = deferred<ReadyRealmResourcePresentation>();
    const gold = deferred<ReadyGoldExpeditionPresentation>();
    const food = deferred<ReadyFoodExpeditionPresentation>();
    const wood = deferred<ReadyWoodExpeditionPresentation>();
    const stone = deferred<ReadyStoneExpeditionPresentation>();
    const starts: string[] = [];
    vi.mocked(runtime.readResourceState).mockImplementationOnce((_connection, fid) => {
      starts.push('resources');
      expect(fid).toBe(12_345);
      return resources.promise;
    });
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(() => {
        starts.push('gold');
        return gold.promise;
      }),
      readFoodExpeditionState: vi.fn(() => {
        starts.push('food');
        return food.promise;
      }),
      readWoodExpeditionState: vi.fn(() => {
        starts.push('wood');
        return wood.promise;
      }),
      readStoneExpeditionState: vi.fn(() => {
        starts.push('stone');
        return stone.promise;
      }),
      observeRealm: vi.fn(() => {
        starts.push('observe');
        return vi.fn();
      }),
      subscribeRealm: vi.fn((_connection, onApplied: () => void) => {
        starts.push('subscribe');
        onApplied();
        return { unsubscribe: vi.fn() };
      }),
    });
    renderProvider(runtime);

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await waitFor(() => expect(starts).toEqual([
      'resources', 'gold', 'food', 'wood', 'stone', 'observe', 'subscribe',
    ]));
    expect(screen.getByTestId('phase').textContent).toBe('opening-realm');

    await act(async () => {
      resources.resolve(createReadyResourceState(12_345));
      gold.resolve(goldExpeditionState());
      food.resolve(foodExpeditionState());
      wood.resolve(woodExpeditionState());
      stone.resolve(stoneExpeditionState());
      await Promise.all([
        resources.promise,
        gold.promise,
        food.promise,
        wood.promise,
        stone.promise
      ]);
    });
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
  });

  it('does not call generated v12 worker procedures or delay a v11 Realm', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const readWorkerRoster = vi.fn(() => new Promise<WorkerRosterPresentation>(() => undefined));
    const readResourceStateV2 = vi.fn(() => new Promise<ReadyWorkerResourceState>(() => undefined));
    Object.assign(runtime, { readWorkerRoster, readResourceStateV2 });

    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('worker-active').textContent).toBe('');
    expect(readWorkerRoster).not.toHaveBeenCalled();
    expect(readResourceStateV2).not.toHaveBeenCalled();
  });

  it('activates only the exact worker projections and keys retries by command fingerprint', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const dispatchWorker = vi.fn().mockRejectedValue(new Error('response unavailable'));
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn(() => workerRealmSnapshot()),
      readWorkerRoster: vi.fn(async () => workerRoster()),
      readResourceStateV2: vi.fn(async () => workerResourceState()),
      dispatchWorker,
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    renderProvider(runtime);
    await enterRealm();
    expect(screen.getByTestId('worker-active').textContent).toBe('active');

    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0001'
    )).rejects.toThrow('Worker command is unavailable.');
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0001'
    )).rejects.toThrow('Worker command is unavailable.');
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0002'
    )).rejects.toThrow('Worker command is unavailable.');
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0001'
    )).rejects.toThrow('Worker command is unavailable.');

    expect(dispatchWorker).toHaveBeenCalledTimes(4);
    const firstKey = dispatchWorker.mock.calls[0]?.[4];
    expect(firstKey).toEqual(expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    ));
    expect(dispatchWorker.mock.calls[1]?.[4]).toBe(firstKey);
    expect(dispatchWorker.mock.calls[2]?.[4]).not.toBe(firstKey);
    expect(dispatchWorker.mock.calls[3]?.[4]).toBe(firstKey);
    expect(screen.getByTestId('worker-active').textContent).toBe('active');
  });

  it('clears retained worker authority and retry keys across an identity generation change', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const dispatchWorker = vi.fn().mockRejectedValue(new Error('response unavailable'));
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn((_connection, fid: number) => workerRealmSnapshot(fid)),
      readWorkerRoster: vi.fn(async () => workerRoster()),
      readResourceStateV2: vi.fn(async (_connection, fid: number) => workerResourceState(fid)),
      dispatchWorker,
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    const view = renderProvider(runtime);
    await enterRealm();

    for (let index = 0; index < 64; index += 1) {
      await expect(capturedBackend!.dispatchWorker(
        'genesis-001-castle-1-worker-01',
        'stone',
        `genesis-001:stone:retained-${index}`
      )).rejects.toThrow('Worker command is unavailable.');
    }
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:blocked-before-rollover'
    )).rejects.toThrow('Worker command is unavailable.');
    expect(dispatchWorker).toHaveBeenCalledTimes(64);

    mockedFarcaster.current = authenticatedFarcaster(54_321, 2);
    view.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await enterRealm();
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:first-after-rollover'
    )).rejects.toThrow('Worker command is unavailable.');
    expect(dispatchWorker).toHaveBeenCalledTimes(65);
  });

  it('keeps worker controls inactive when the private v2 projection disagrees', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn(() => workerRealmSnapshot()),
      readWorkerRoster: vi.fn(async () => workerRoster()),
      readResourceStateV2: vi.fn(async () => Object.freeze({
        ...workerResourceState(),
        pending: Object.freeze({ food: 0n, wood: 0n, stone: 1n, gold: 0n })
      })),
      dispatchWorker: vi.fn(async () => undefined),
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('worker-active').textContent).toBe('');
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0001'
    )).rejects.toThrow('Worker command is unavailable.');
    expect(runtime.dispatchWorker).not.toHaveBeenCalled();
  });

  it('rejects an older periodic worker pair that resolves after a command refresh', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const staleRoster = deferred<WorkerRosterPresentation | undefined>();
    const staleWorkerResources = deferred<ReadyWorkerResourceState | undefined>();
    let publishObservedRealm: ((snapshot: WarpkeepRealmSnapshot) => void) | undefined;
    let currentRealm: WarpkeepRealmSnapshot = workerRealmSnapshot();
    const dispatchWorker = vi.fn(async () => {
      currentRealm = outboundWorkerRealmSnapshot();
      publishObservedRealm?.(currentRealm);
    });
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn(() => currentRealm),
      observeRealm: vi.fn((_connection, _fid, onUpdate) => {
        publishObservedRealm = onUpdate;
        return vi.fn();
      }),
      readWorkerRoster: vi.fn()
        .mockResolvedValueOnce(workerRoster())
        .mockImplementationOnce(() => staleRoster.promise)
        .mockResolvedValueOnce(outboundWorkerRoster()),
      readResourceStateV2: vi.fn()
        .mockResolvedValueOnce(workerResourceState())
        .mockImplementationOnce(() => staleWorkerResources.promise)
        .mockResolvedValueOnce(newerWorkerResourceState()),
      dispatchWorker,
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    renderProvider(runtime);

    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms');
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('worker-first-status').textContent).toBe('idle');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    expect(runtime.readWorkerRoster).toHaveBeenCalledTimes(2);
    expect(runtime.readResourceStateV2).toHaveBeenCalledTimes(2);

    await act(async () => {
      await capturedBackend!.dispatchWorker(
        'genesis-001-castle-1-worker-01',
        'stone',
        'genesis-001:stone:0001'
      );
    });
    expect(screen.getByTestId('worker-first-status').textContent).toBe('outbound');
    expect(screen.getByTestId('worker-first-revision').textContent).toBe('1');

    await act(async () => {
      staleRoster.resolve(workerRoster());
      staleWorkerResources.resolve(workerResourceState());
      await Promise.all([staleRoster.promise, staleWorkerResources.promise]);
    });
    await flushProviderWork();
    expect(screen.getByTestId('worker-first-status').textContent).toBe('outbound');
    expect(screen.getByTestId('worker-first-revision').textContent).toBe('1');
    await expect(capturedBackend!.dispatchWorker(
      'genesis-001-castle-1-worker-01',
      'stone',
      'genesis-001:stone:0001'
    )).rejects.toThrow('Worker command is unavailable.');
    expect(dispatchWorker).toHaveBeenCalledTimes(1);
  });

  it('coalesces a newer public worker lifecycle while an older private pair is pending', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const staleRoster = deferred<WorkerRosterPresentation | undefined>();
    const staleWorkerResources = deferred<ReadyWorkerResourceState | undefined>();
    let publishObservedRealm: ((snapshot: WarpkeepRealmSnapshot) => void) | undefined;
    let currentRealm: WarpkeepRealmSnapshot = workerRealmSnapshot();
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn(() => currentRealm),
      observeRealm: vi.fn((_connection, _fid, onUpdate) => {
        publishObservedRealm = onUpdate;
        return vi.fn();
      }),
      readWorkerRoster: vi.fn()
        .mockResolvedValueOnce(workerRoster())
        .mockImplementationOnce(() => staleRoster.promise)
        .mockResolvedValueOnce(outboundWorkerRoster()),
      readResourceStateV2: vi.fn()
        .mockResolvedValueOnce(workerResourceState())
        .mockImplementationOnce(() => staleWorkerResources.promise)
        .mockResolvedValueOnce(newerWorkerResourceState()),
      dispatchWorker: vi.fn(async () => undefined),
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    renderProvider(runtime);

    await flushProviderWork();
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('worker-first-status').textContent).toBe('idle');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    expect(runtime.readWorkerRoster).toHaveBeenCalledTimes(2);
    expect(runtime.readResourceStateV2).toHaveBeenCalledTimes(2);

    currentRealm = outboundWorkerRealmSnapshot();
    act(() => publishObservedRealm?.(currentRealm));
    await act(async () => {
      staleRoster.resolve(workerRoster());
      staleWorkerResources.resolve(workerResourceState());
      await Promise.all([staleRoster.promise, staleWorkerResources.promise]);
    });
    await flushProviderWork();

    expect(runtime.readWorkerRoster).toHaveBeenCalledTimes(3);
    expect(runtime.readResourceStateV2).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('worker-first-status').textContent).toBe('outbound');
    expect(screen.getByTestId('worker-first-revision').textContent).toBe('1');
  });

  it('fails closed and tears down the concurrent public subscription when the private read fails', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime, disconnect } = createRuntimeHarness();
    vi.mocked(runtime.readResourceState).mockRejectedValueOnce(new Error('private projection unavailable'));
    renderProvider(runtime);

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(runtime.readResourceState).toHaveBeenCalledTimes(1);
    expect(runtime.observeRealm).toHaveBeenCalledTimes(1);
    expect(runtime.subscribeRealm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.subscribeRealm).mock.results[0]?.value.unsubscribe)
      .toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resource-revision').textContent).toBe('');
  });

  it('settles resources automatically on each active-session refresh cadence', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValueOnce(resourceState(12_345, 0n, 0n));
    vi.mocked(runtime.collectResources)
      .mockResolvedValueOnce(resourceState(12_345, 1n, 8n))
      .mockResolvedValueOnce(resourceState(12_345, 2n, 16n));
    renderProvider(runtime);

    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms');
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(runtime.collectResources).not.toHaveBeenCalled();
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    expect(runtime.collectResources).toHaveBeenLastCalledWith(expect.anything(), 12_345);
    expect(screen.getByTestId('resource-revision').textContent).toBe('1');
    expect(screen.getByTestId('resource-food').textContent).toBe('8');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.collectResources).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-food').textContent).toBe('16');
  });

  it('settles an active Gold expedition through one global reducer and reads every expedition afterward', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const activeGold = goldExpeditionState(true, 3n);
    const refreshedGold = goldExpeditionState(true, 0n);
    const inactiveFood = foodExpeditionState();
    const inactiveWood = woodExpeditionState();
    const inactiveStone = stoneExpeditionState();
    const readGoldExpeditionState = vi.fn()
      .mockResolvedValueOnce(activeGold)
      .mockResolvedValueOnce(refreshedGold);
    const readFoodExpeditionState = vi.fn(async () => inactiveFood);
    const readWoodExpeditionState = vi.fn(async () => inactiveWood);
    const readStoneExpeditionState = vi.fn(async () => inactiveStone);
    const collectGoldExpedition = vi.fn();
    const collectFoodExpedition = vi.fn();
    const collectWoodExpedition = vi.fn();
    const collectStoneExpedition = vi.fn();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValueOnce(resourceStateWithGold(12_345, 0n, 0n));
    vi.mocked(runtime.collectResources)
      .mockResolvedValueOnce(resourceStateWithGold(12_345, 2n, 9n));
    Object.assign(runtime, {
      readGoldExpeditionState,
      readFoodExpeditionState,
      readWoodExpeditionState,
      readStoneExpeditionState,
      collectGoldExpedition,
      collectFoodExpedition,
      collectWoodExpedition,
      collectStoneExpedition
    });
    renderProvider(runtime);

    await flushProviderWork();
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('gold-active').textContent).toBe('true');
    expect(collectGoldExpedition).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();

    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    expect(runtime.collectResources).toHaveBeenCalledWith(expect.anything(), 12_345);
    expect(runtime.readResourceState).toHaveBeenCalledTimes(1);
    expect(readGoldExpeditionState).toHaveBeenCalledTimes(2);
    expect(readFoodExpeditionState).toHaveBeenCalledTimes(2);
    expect(readWoodExpeditionState).toHaveBeenCalledTimes(2);
    expect(readStoneExpeditionState).toHaveBeenCalledTimes(2);
    expect(collectGoldExpedition).not.toHaveBeenCalled();
    expect(collectFoodExpedition).not.toHaveBeenCalled();
    expect(collectWoodExpedition).not.toHaveBeenCalled();
    expect(collectStoneExpedition).not.toHaveBeenCalled();
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-gold').textContent).toBe('9');
    expect(screen.getByTestId('gold-active').textContent).toBe('true');
  });

  it('gates optional and worker-v2 refresh reads behind the global settlement result', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const pendingSettlement = deferred<ReadyRealmResourcePresentation>();
    const readGoldExpeditionState = vi.fn(async () => goldExpeditionState(true, 3n));
    const readFoodExpeditionState = vi.fn(async () => foodExpeditionState());
    const readWoodExpeditionState = vi.fn(async () => woodExpeditionState());
    const readStoneExpeditionState = vi.fn(async () => stoneExpeditionState());
    const readWorkerRoster = vi.fn()
      .mockResolvedValueOnce(workerRoster())
      .mockResolvedValueOnce(workerRoster());
    const postSettlementWorkerResources = Object.freeze({
      ...workerResourceState(),
      observedAtMicros: 300n,
      settledThroughMicros: 300n,
      revision: 2n
    });
    const readResourceStateV2 = vi.fn()
      .mockResolvedValueOnce(workerResourceState())
      .mockResolvedValueOnce(postSettlementWorkerResources);
    vi.mocked(runtime.collectResources)
      .mockImplementationOnce(() => pendingSettlement.promise);
    Object.assign(runtime, {
      readRealmSnapshot: vi.fn(() => workerRealmSnapshot()),
      readGoldExpeditionState,
      readFoodExpeditionState,
      readWoodExpeditionState,
      readStoneExpeditionState,
      readWorkerRoster,
      readResourceStateV2,
      dispatchWorker: vi.fn(async () => undefined),
      recallWorker: vi.fn(async () => undefined),
      recallAllWorkers: vi.fn(async () => undefined)
    });
    renderProvider(runtime);

    await flushProviderWork();
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('worker-resource-revision').textContent).toBe('0');
    for (const optionalRead of [
      readGoldExpeditionState,
      readFoodExpeditionState,
      readWoodExpeditionState,
      readStoneExpeditionState,
      readWorkerRoster,
      readResourceStateV2
    ]) {
      expect(optionalRead).toHaveBeenCalledTimes(1);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    for (const gatedRead of [
      readGoldExpeditionState,
      readFoodExpeditionState,
      readWoodExpeditionState,
      readStoneExpeditionState,
      readWorkerRoster,
      readResourceStateV2
    ]) {
      expect(gatedRead).toHaveBeenCalledTimes(1);
    }

    await act(async () => {
      pendingSettlement.resolve(resourceState(12_345, 2n, 8n));
      await pendingSettlement.promise;
    });
    await flushProviderWork();

    for (const postSettlementRead of [
      readGoldExpeditionState,
      readFoodExpeditionState,
      readWoodExpeditionState,
      readStoneExpeditionState,
      readWorkerRoster,
      readResourceStateV2
    ]) {
      expect(postSettlementRead).toHaveBeenCalledTimes(2);
    }
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('worker-resource-revision').textContent).toBe('2');
  });

  it('retries automatic settlement on the next cadence after a transient failure', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime, disconnect } = createRuntimeHarness();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValue(resourceState(12_345, 0n, 0n));
    vi.mocked(runtime.collectResources)
      .mockRejectedValueOnce(new Error('temporary settlement failure'))
      .mockResolvedValueOnce(resourceState(12_345, 1n, 8n));
    renderProvider(runtime);

    await flushProviderWork();
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    expect(runtime.readResourceState).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');
    expect(screen.getByTestId('resource-food').textContent).toBe('0');
    expect(disconnect).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.collectResources).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('1');
    expect(screen.getByTestId('resource-food').textContent).toBe('8');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does not update optimistically and publishes only the newer authoritative collect result', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const pendingCollect = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.collectResources).mockImplementationOnce(() => pendingCollect.promise);
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('resource-revision').textContent).toBe('0');
    expect(screen.getByTestId('resource-food').textContent).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    await waitFor(() => expect(runtime.collectResources).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('resource-revision').textContent).toBe('0');
    expect(screen.getByTestId('resource-food').textContent).toBe('0');

    await act(async () => {
      pendingCollect.resolve(resourceState(12_345, 1n, 8n));
      await pendingCollect.promise;
    });
    await waitFor(() => expect(screen.getByTestId('resource-revision').textContent).toBe('1'));
    expect(screen.getByTestId('resource-food').textContent).toBe('8');
  });

  it('exposes Gold dispatch and claim only through refreshed private server projections', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const inactive = goldExpeditionState();
    const active = goldExpeditionState(true, 3n);
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => inactive),
      dispatchGoldExpedition: vi.fn(async () => active),
      collectGoldExpedition: vi.fn(async (_connection, fid: number) => Object.freeze({
        resources: resourceState(fid, 1n, 9n),
        goldExpedition: inactive
      }))
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('gold-active').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH GOLD' }));
    await waitFor(() => expect(runtime.dispatchGoldExpedition).toHaveBeenCalledWith(
      expect.anything(),
      'genesis-001:gold:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    await waitFor(() => expect(screen.getByTestId('gold-active').textContent).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH GOLD' }));
    await flushProviderWork();
    expect(runtime.dispatchGoldExpedition).toHaveBeenCalledTimes(1);
    // The dispatch callback changed only its server-confirmed private
    // expedition projection; inventory stays untouched until a Gold claim.
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'CLAIM GOLD' }));
    await waitFor(() => expect(runtime.collectGoldExpedition).toHaveBeenCalledWith(
      expect.anything(),
      12_345
    ));
    await waitFor(() => expect(screen.getByTestId('resource-revision').textContent).toBe('1'));
    expect(screen.getByTestId('resource-food').textContent).toBe('9');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
  });

  it('keeps a failed Food capability isolated from Gold and the core Realm', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const gold = goldExpeditionState();
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => gold),
      readFoodExpeditionState: vi.fn(async () => {
        throw new Error('Food procedure unavailable');
      })
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
    expect(screen.getByTestId('food-expedition-active').textContent).toBe('');
  });

  it('keeps a failed Wood capability isolated from Gold, Food, and the core Realm', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      readFoodExpeditionState: vi.fn(async () => foodExpeditionState()),
      readWoodExpeditionState: vi.fn(async () => {
        throw new Error('Wood procedure unavailable');
      })
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
    expect(screen.getByTestId('food-expedition-active').textContent).toBe('false');
    expect(screen.getByTestId('wood-expedition-active').textContent).toBe('');
  });

  it('keeps a failed Stone capability isolated from the other resources and the core Realm', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      readFoodExpeditionState: vi.fn(async () => foodExpeditionState()),
      readWoodExpeditionState: vi.fn(async () => woodExpeditionState()),
      readStoneExpeditionState: vi.fn(async () => {
        throw new Error('Stone procedure unavailable');
      })
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
    expect(screen.getByTestId('food-expedition-active').textContent).toBe('false');
    expect(screen.getByTestId('wood-expedition-active').textContent).toBe('false');
    expect(screen.getByTestId('stone-expedition-active').textContent).toBe('');
  });

  it('exposes Food dispatch and claim only through refreshed private server projections', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const gold = goldExpeditionState();
    const inactiveFood = foodExpeditionState();
    const activeFood = foodExpeditionState(true, 5n);
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => gold),
      readFoodExpeditionState: vi.fn(async () => inactiveFood),
      dispatchFoodExpedition: vi.fn(async () => activeFood),
      collectFoodExpedition: vi.fn(async (_connection, fid: number) => Object.freeze({
        resources: resourceState(fid, 1n, 11n),
        foodExpedition: inactiveFood
      }))
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('gold-active').textContent).toBe('false');
    expect(screen.getByTestId('food-expedition-active').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH FOOD' }));
    await waitFor(() => expect(runtime.dispatchFoodExpedition).toHaveBeenCalledWith(
      expect.anything(),
      'genesis-001:food:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    await waitFor(() => expect(screen.getByTestId('food-expedition-active').textContent).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH FOOD' }));
    await flushProviderWork();
    expect(runtime.dispatchFoodExpedition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('gold-active').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'CLAIM FOOD' }));
    await waitFor(() => expect(runtime.collectFoodExpedition).toHaveBeenCalledWith(
      expect.anything(),
      12_345
    ));
    await waitFor(() => expect(screen.getByTestId('resource-food').textContent).toBe('11'));
    expect(screen.getByTestId('food-expedition-active').textContent).toBe('false');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
  });

  it('exposes Wood dispatch and claim only through refreshed private server projections', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const inactiveWood = woodExpeditionState();
    const activeWood = woodExpeditionState(true, 5n);
    Object.assign(runtime, {
      readWoodExpeditionState: vi.fn(async () => inactiveWood),
      dispatchWoodExpedition: vi.fn(async () => activeWood),
      collectWoodExpedition: vi.fn(async (_connection, fid: number) => Object.freeze({
        resources: resourceStateWithWood(fid, 1n, 17n),
        woodExpedition: inactiveWood
      }))
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('wood-expedition-active').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH WOOD' }));
    await waitFor(() => expect(runtime.dispatchWoodExpedition).toHaveBeenCalledWith(
      expect.anything(),
      'genesis-001:wood:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    await waitFor(() => expect(screen.getByTestId('wood-expedition-active').textContent).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH WOOD' }));
    await flushProviderWork();
    expect(runtime.dispatchWoodExpedition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'CLAIM WOOD' }));
    await waitFor(() => expect(runtime.collectWoodExpedition).toHaveBeenCalledWith(
      expect.anything(),
      12_345
    ));
    await waitFor(() => expect(screen.getByTestId('resource-wood').textContent).toBe('17'));
    expect(screen.getByTestId('wood-expedition-active').textContent).toBe('false');
  });

  it('exposes Stone dispatch and claim only through refreshed private server projections', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const inactiveStone = stoneExpeditionState();
    const activeStone = stoneExpeditionState(true, 5n);
    Object.assign(runtime, {
      readStoneExpeditionState: vi.fn(async () => inactiveStone),
      dispatchStoneExpedition: vi.fn(async () => activeStone),
      collectStoneExpedition: vi.fn(async (_connection, fid: number) => Object.freeze({
        resources: resourceStateWithStone(fid, 1n, 19n),
        stoneExpedition: inactiveStone
      }))
    });
    renderProvider(runtime);
    await enterRealm();

    expect(screen.getByTestId('stone-expedition-active').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH STONE' }));
    await waitFor(() => expect(runtime.dispatchStoneExpedition).toHaveBeenCalledWith(
      expect.anything(),
      'genesis-001:stone:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    await waitFor(() => expect(screen.getByTestId('stone-expedition-active').textContent).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH STONE' }));
    await flushProviderWork();
    expect(runtime.dispatchStoneExpedition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'CLAIM STONE' }));
    await waitFor(() => expect(runtime.collectStoneExpedition).toHaveBeenCalledWith(
      expect.anything(),
      12_345
    ));
    await waitFor(() => expect(screen.getByTestId('resource-stone').textContent).toBe('19'));
    expect(screen.getByTestId('stone-expedition-active').textContent).toBe('false');
  });

  it('retains one dispatch key per resource and site until private authority proves the outcome', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const dispatchGold = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(goldExpeditionState(true));
    const dispatchFood = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(foodExpeditionState(true));
    const dispatchWood = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(woodExpeditionState(true));
    const dispatchStone = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(stoneExpeditionState(true));
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      readFoodExpeditionState: vi.fn(async () => foodExpeditionState()),
      readWoodExpeditionState: vi.fn(async () => woodExpeditionState()),
      readStoneExpeditionState: vi.fn(async () => stoneExpeditionState()),
      dispatchGoldExpedition: dispatchGold,
      dispatchFoodExpedition: dispatchFood,
      dispatchWoodExpedition: dispatchWood,
      dispatchStoneExpedition: dispatchStone
    });
    renderProvider(runtime);
    await enterRealm();

    for (const label of ['DISPATCH GOLD', 'DISPATCH FOOD', 'DISPATCH WOOD', 'DISPATCH STONE']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    await waitFor(() => {
      expect(dispatchGold).toHaveBeenCalledTimes(1);
      expect(dispatchFood).toHaveBeenCalledTimes(1);
      expect(dispatchWood).toHaveBeenCalledTimes(1);
      expect(dispatchStone).toHaveBeenCalledTimes(1);
    });
    await flushProviderWork();
    for (const label of ['DISPATCH GOLD', 'DISPATCH FOOD', 'DISPATCH WOOD', 'DISPATCH STONE']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    await waitFor(() => {
      expect(dispatchGold).toHaveBeenCalledTimes(2);
      expect(dispatchFood).toHaveBeenCalledTimes(2);
      expect(dispatchWood).toHaveBeenCalledTimes(2);
      expect(dispatchStone).toHaveBeenCalledTimes(2);
    });

    for (const dispatch of [dispatchGold, dispatchFood, dispatchWood, dispatchStone]) {
      const firstKey = dispatch.mock.calls[0]?.[2];
      expect(firstKey).toEqual(expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ));
      expect(dispatch.mock.calls[1]?.[2]).toBe(firstKey);
    }
    expect(screen.getByTestId('phase').textContent).toBe('ready');
  });

  it('rejects a mismatched private dispatch result and reuses its key for reconciliation', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const active = goldExpeditionState(true);
    const mismatched = Object.freeze({
      ...active,
      expedition: Object.freeze({
        ...active.expedition!,
        originCastleId: 999
      })
    });
    const dispatchGold = vi.fn()
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(active);
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      dispatchGoldExpedition: dispatchGold
    });
    renderProvider(runtime);
    await enterRealm();

    await expect(capturedBackend!.dispatchGoldExpedition('genesis-001:gold:0001'))
      .rejects.toThrow('Gold expedition is unavailable.');
    expect(screen.getByTestId('gold-active').textContent).toBe('false');

    await act(async () => {
      await capturedBackend!.dispatchGoldExpedition('genesis-001:gold:0001');
    });
    expect(screen.getByTestId('gold-active').textContent).toBe('true');
    expect(dispatchGold).toHaveBeenCalledTimes(2);
    expect(dispatchGold.mock.calls[1]?.[2]).toBe(dispatchGold.mock.calls[0]?.[2]);
  });

  it('rejects an old-generation dispatch result instead of reporting stale success', async () => {
    mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
    const { runtime } = createRuntimeHarness();
    const pendingDispatch = deferred<ReadyGoldExpeditionPresentation>();
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      dispatchGoldExpedition: vi.fn(() => pendingDispatch.promise)
    });
    const rendered = renderProvider(runtime);
    await enterRealm();

    const oldDispatch = capturedBackend!.dispatchGoldExpedition('genesis-001:gold:0001');
    const oldDispatchRejection = expect(oldDispatch)
      .rejects.toThrow('Gold expedition is unavailable.');
    await waitFor(() => expect(runtime.dispatchGoldExpedition).toHaveBeenCalledTimes(1));

    mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
    rendered.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));

    pendingDispatch.resolve(goldExpeditionState(true));
    await oldDispatchRejection;
    expect(screen.getByTestId('gold-active').textContent).toBe('false');
  });

  it('tears down a commit-ambiguous expedition timeout and ignores its late private result', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime, disconnect } = createRuntimeHarness();
    const pendingDispatch = deferred<ReadyGoldExpeditionPresentation>();
    Object.assign(runtime, {
      readGoldExpeditionState: vi.fn(async () => goldExpeditionState()),
      dispatchGoldExpedition: vi.fn(() => pendingDispatch.promise)
    });
    renderProvider(runtime);
    await enterRealm();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH GOLD' }));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('gold-active').textContent).toBe('');

    await act(async () => {
      pendingDispatch.resolve(goldExpeditionState(true));
      await pendingDispatch.promise;
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(screen.getByTestId('gold-active').textContent).toBe('');
  });

  it('leaves a late authoritative result inert after an explicit disconnect', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime } = createRuntimeHarness();
    const pendingCollect = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.collectResources).mockImplementationOnce(() => pendingCollect.promise);
    renderProvider(runtime);
    await enterRealm();

    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    await waitFor(() => expect(runtime.collectResources).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'DISCONNECT' }));
    expect(screen.getByTestId('phase').textContent).toBe('idle');

    await act(async () => {
      pendingCollect.resolve(resourceState(12_345, 99n, 999n));
      await pendingCollect.promise;
    });
    expect(screen.getByTestId('phase').textContent).toBe('idle');
    expect(screen.getByTestId('resource-fid').textContent).toBe('');
    expect(screen.getByTestId('resource-revision').textContent).toBe('');
  });

  it('cannot publish a late result across an authenticated identity generation change', async () => {
    mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
    const { runtime } = createRuntimeHarness();
    const pendingCollect = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.collectResources).mockImplementationOnce(() => pendingCollect.promise);
    const rendered = renderProvider(runtime);
    await enterRealm();

    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    await waitFor(() => expect(runtime.collectResources).toHaveBeenCalledTimes(1));

    mockedFarcaster.current = authenticatedFarcaster(54_321, 2);
    rendered.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await enterRealm();
    expect(screen.getByTestId('resource-fid').textContent).toBe('54321');
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');

    await act(async () => {
      pendingCollect.resolve(resourceState(12_345, 99n, 999n));
      await pendingCollect.promise;
    });
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-fid').textContent).toBe('54321');
    expect(screen.getByTestId('resource-revision').textContent).toBe('0');
    expect(screen.getByTestId('resource-food').textContent).toBe('0');
  });

  it('cannot publish a queued old collect after a same-FID token generation reconnects', async () => {
    mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
    const { runtime } = createRuntimeHarness();
    const pendingOldCollect = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValueOnce(resourceState(12_345, 0n, 200n))
      .mockResolvedValueOnce(resourceState(12_345, 2n, 216n));
    vi.mocked(runtime.collectResources).mockImplementationOnce(() => pendingOldCollect.promise);
    const rendered = renderProvider(runtime);
    await enterRealm();

    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    await waitFor(() => expect(runtime.collectResources).toHaveBeenCalledTimes(1));

    deferredBackendStateUpdate.armed = true;
    pendingOldCollect.resolve(resourceState(12_345, 99n, 999n));
    await flushProviderWork();
    expect(deferredBackendStateUpdate.queued).toBeTypeOf('function');

    mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
    rendered.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
    expect(runtime.readResourceState).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-food').textContent).toBe('216');

    await act(async () => {
      deferredBackendStateUpdate.queued?.();
    });
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-food').textContent).toBe('216');
  });

  it('terminates a half-open collect at the hard deadline and leaves its late result inert', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime, disconnect } = createRuntimeHarness();
    const pendingCollect = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.collectResources).mockImplementationOnce(() => pendingCollect.promise);
    renderProvider(runtime);
    await enterRealm();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'COLLECT' }));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resource-revision').textContent).toBe('');

    await act(async () => {
      pendingCollect.resolve(resourceState(12_345, 99n, 999n));
      await pendingCollect.promise;
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(screen.getByTestId('resource-revision').textContent).toBe('');
  });

  it('reconciles a timed-out automatic settlement and leaves its late result inert', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const { runtime, disconnect } = createRuntimeHarness();
    const pendingSettlement = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValueOnce(resourceState(12_345, 0n, 0n))
      .mockResolvedValueOnce(resourceState(12_345, 1n, 8n));
    vi.mocked(runtime.collectResources)
      .mockImplementationOnce(() => pendingSettlement.promise);
    renderProvider(runtime);

    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms');
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    expect(runtime.readResourceState).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    await flushProviderWork();
    expect(runtime.readResourceState).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(disconnect).not.toHaveBeenCalled();
    expect(screen.getByTestId('resource-revision').textContent).toBe('1');
    expect(screen.getByTestId('resource-food').textContent).toBe('8');

    await act(async () => {
      pendingSettlement.resolve(resourceState(12_345, 99n, 999n));
      await pendingSettlement.promise;
    });
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('1');
    expect(screen.getByTestId('resource-food').textContent).toBe('8');
  });

  it('cannot publish a queued old refresh after a same-FID token generation reconnects', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
    const { runtime } = createRuntimeHarness();
    const pendingOldRefresh = deferred<ReadyRealmResourcePresentation>();
    vi.mocked(runtime.readResourceState)
      .mockResolvedValueOnce(resourceState(12_345, 0n, 200n))
      .mockResolvedValueOnce(resourceState(12_345, 2n, 216n));
    vi.mocked(runtime.collectResources)
      .mockImplementationOnce(() => pendingOldRefresh.promise);
    const rendered = renderProvider(runtime);

    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms');
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await flushProviderWork();
    expect(screen.getByTestId('phase').textContent).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
    });
    expect(runtime.collectResources).toHaveBeenCalledTimes(1);
    expect(runtime.readResourceState).toHaveBeenCalledTimes(1);

    deferredBackendStateUpdate.armed = true;
    pendingOldRefresh.resolve(resourceState(12_345, 99n, 999n));
    await flushProviderWork();
    expect(deferredBackendStateUpdate.queued).toBeTypeOf('function');

    mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
    rendered.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await flushProviderWork();
    expect(runtime.readResourceState).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-food').textContent).toBe('216');

    await act(async () => {
      deferredBackendStateUpdate.queued?.();
    });
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(screen.getByTestId('resource-revision').textContent).toBe('2');
    expect(screen.getByTestId('resource-food').textContent).toBe('216');
  });
});
