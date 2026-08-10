import { describe, expect, it, vi } from 'vitest';

import {
  readWarpkeepInnerKeepProjection,
  readWarpkeepInnerKeepRequestStatus,
  startWarpkeepInnerKeepProject,
  subscribeToWarpkeepRealm,
  type WarpkeepConnection
} from '../src/spacetime/warpkeepConnection';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION
} from '../spacetimedb/src/innerKeepPolicy';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';

const INNER_KEEP_SCOPE = Object.freeze({
  generation: 3,
  fid: 12_345,
  castleId: 7n,
  backendProtocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
});

function subscriptionDouble() {
  let apply: (() => void) | undefined;
  let fail: (() => void) | undefined;
  const handle = { unsubscribe: vi.fn() };
  const builder = {
    onApplied: vi.fn((callback: () => void) => {
      apply = callback;
      return builder;
    }),
    onError: vi.fn((callback: () => void) => {
      fail = callback;
      return builder;
    }),
    subscribe: vi.fn((_queries?: readonly unknown[]) => handle)
  };
  return Object.freeze({
    builder,
    handle,
    apply: () => apply?.(),
    fail: () => fail?.()
  });
}

function table<Row>(rows: readonly Row[]) {
  return Object.freeze({
    iter: function* () { yield* rows; }
  });
}

function castleTable<Row extends Readonly<{ castleId: bigint }>>(rows: readonly Row[]) {
  const iter = vi.fn(function* () { yield* rows; });
  const filter = vi.fn(function* (castleId: bigint) {
    for (const row of rows) {
      if (row.castleId === castleId) yield row;
    }
  });
  return Object.freeze({
    iter,
    byCastle: Object.freeze({ filter })
  });
}

function castleOwnerTable(ownerFid: bigint, castleId: bigint) {
  return Object.freeze({
    ...table([{ ownerFid, castleId }]),
    ownerFid: Object.freeze({
      find: vi.fn((candidate: bigint) => (
        candidate === ownerFid ? { ownerFid, castleId } : null
      ))
    })
  });
}

function privateState() {
  return {
    castleId: 7n,
    componentActive: true,
    componentReady: true,
    builderPresent: true,
    builderBusy: false,
    activeBuildingKey: undefined,
    busyUntilMicros: undefined,
    builderRevision: 0n,
    storedFood: 10_000n,
    storedWood: 10_000n,
    storedStone: 10_000n,
    storedGold: 10_000n,
    projectedFood: 10_000n,
    projectedWood: 10_000n,
    projectedStone: 10_000n,
    projectedGold: 10_000n,
    resourceRevision: 0n,
    observedAtMicros: 100n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST
  };
}

function connectionHarness(
  buildingRows: readonly Readonly<{ castleId: bigint }>[] = []
) {
  const core = subscriptionDouble();
  const innerKeep = subscriptionDouble();
  const getMyInnerKeepStateV1 = vi.fn(async () => privateState());
  const getMyInnerKeepRequestStatusV1 = vi.fn(async () => ({
    found: false,
    castleId: undefined,
    buildingKey: undefined,
    slotId: undefined,
    buildingKind: undefined,
    targetLevel: undefined,
    deductedFood: undefined,
    deductedWood: undefined,
    deductedStone: undefined,
    deductedGold: undefined,
    startedAtMicros: undefined,
    policyVersion: undefined
  }));
  const innerKeepStartProjectV1 = vi.fn(async () => undefined);
  const empty = table([]);
  const buildings = castleTable(buildingRows);
  const connection = {
    db: {
      worldTile: empty,
      worldTileMetaV1: empty,
      playerV2: empty,
      castle: castleOwnerTable(BigInt(INNER_KEEP_SCOPE.fid), INNER_KEEP_SCOPE.castleId),
      realmV1: empty,
      realmProfileV1: empty,
      innerKeepLayoutV1: table([{
        ...CANONICAL_INNER_KEEP_LAYOUT,
        active: true,
        createdAt: {},
        activatedAt: {}
      }]),
      innerKeepSlotV1: table(CANONICAL_INNER_KEEP_SLOTS),
      innerKeepBuildingCatalogV1: table(CANONICAL_INNER_KEEP_BUILDING_CATALOG),
      innerKeepBuildLevelV1: table(CANONICAL_INNER_KEEP_LEVEL_POLICIES),
      castleInnerKeepBuildingV1: buildings
    },
    procedures: {
      getMyInnerKeepStateV1,
      getMyInnerKeepRequestStatusV1
    },
    reducers: { innerKeepStartProjectV1 },
    subscriptionBuilder: vi.fn()
      .mockReturnValueOnce(core.builder)
      .mockReturnValueOnce(innerKeep.builder)
  } as unknown as WarpkeepConnection;
  return Object.freeze({
    connection,
    core,
    innerKeep,
    getMyInnerKeepStateV1,
    getMyInnerKeepRequestStatusV1,
    innerKeepStartProjectV1,
    buildings
  });
}

describe('Inner Keep browser connection boundary', () => {
  it('publishes only after all five public tables apply, then reads caller-private state', async () => {
    const harness = connectionHarness();
    const onApplied = vi.fn();
    const subscription = subscribeToWarpkeepRealm(
      harness.connection,
      onApplied,
      vi.fn(),
      INNER_KEEP_SCOPE.fid
    );
    harness.core.apply();
    const subscribedQueries = harness.innerKeep.builder.subscribe.mock.calls[0]?.[0];
    expect(subscribedQueries).toHaveLength(5);
    const buildingQuery = subscribedQueries?.at(-1) as { toSql: () => string };
    expect(buildingQuery.toSql()).toMatch(
      /^SELECT \* FROM "castle_inner_keep_building_v1" WHERE .*"castle_id" = 7$/u
    );
    expect(await readWarpkeepInnerKeepProjection(harness.connection, {
      scope: INNER_KEEP_SCOPE,
      commandsAvailable: true
    })).toBeUndefined();
    harness.innerKeep.apply();
    const projection = await readWarpkeepInnerKeepProjection(harness.connection, {
      scope: INNER_KEEP_SCOPE,
      commandsAvailable: true
    });
    expect(projection?.presentation.castleId).toBe(7n);
    expect(projection?.presentation.commandsEnabled).toBe(true);
    expect(harness.getMyInnerKeepStateV1).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
    expect(harness.core.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.innerKeep.handle.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('uses the castle index instead of scanning foreign Inner Keep projects', async () => {
    const foreignRows = Array.from({ length: 1_000 }, (_, index) => ({
      castleId: BigInt(index + 100)
    }));
    const harness = connectionHarness(foreignRows);
    const subscription = subscribeToWarpkeepRealm(
      harness.connection,
      vi.fn(),
      vi.fn(),
      INNER_KEEP_SCOPE.fid
    );
    harness.core.apply();
    harness.innerKeep.apply();

    expect(await readWarpkeepInnerKeepProjection(harness.connection, {
      scope: INNER_KEEP_SCOPE,
      commandsAvailable: true
    })).toBeDefined();
    expect(harness.buildings.byCastle.filter).toHaveBeenCalledWith(INNER_KEEP_SCOPE.castleId);
    expect(harness.buildings.iter).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });

  it('does not fall back to a realm-wide building subscription without an owned castle', async () => {
    const harness = connectionHarness();
    const onApplied = vi.fn();
    const subscription = subscribeToWarpkeepRealm(
      harness.connection,
      onApplied,
      vi.fn(),
      INNER_KEEP_SCOPE.fid + 1
    );

    harness.core.apply();
    expect(onApplied).toHaveBeenCalledOnce();
    expect(harness.innerKeep.builder.subscribe).not.toHaveBeenCalled();
    expect(await readWarpkeepInnerKeepProjection(harness.connection, {
      scope: INNER_KEEP_SCOPE,
      commandsAvailable: true
    })).toBeUndefined();

    subscription.unsubscribe();
    expect(harness.core.handle.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.innerKeep.handle.unsubscribe).not.toHaveBeenCalled();
  });

  it('keeps the core Realm usable and hides Inner Keep when the additive subscription fails', async () => {
    const harness = connectionHarness();
    const onApplied = vi.fn();
    const onError = vi.fn();
    const subscription = subscribeToWarpkeepRealm(
      harness.connection,
      onApplied,
      onError,
      INNER_KEEP_SCOPE.fid
    );

    harness.core.apply();
    expect(onApplied).toHaveBeenCalledTimes(1);
    harness.innerKeep.fail();

    expect(onError).not.toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledTimes(2);
    expect(await readWarpkeepInnerKeepProjection(harness.connection, {
      scope: INNER_KEEP_SCOPE,
      commandsAvailable: true
    })).toBeUndefined();
    expect(harness.getMyInnerKeepStateV1).not.toHaveBeenCalled();

    subscription.unsubscribe();
    expect(harness.core.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.innerKeep.handle.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('uses procedures for private status and exposes only the bounded start reducer input', async () => {
    const harness = connectionHarness();
    const subscription = subscribeToWarpkeepRealm(
      harness.connection,
      vi.fn(),
      vi.fn(),
      INNER_KEEP_SCOPE.fid
    );
    harness.core.apply();
    harness.innerKeep.apply();
    const requestKey = '00000000-0000-4000-8000-000000000001';
    expect(await readWarpkeepInnerKeepRequestStatus(
      harness.connection,
      INNER_KEEP_SCOPE,
      requestKey
    )).toEqual({ found: false });
    await startWarpkeepInnerKeepProject(
      harness.connection,
      'inner-keep-slot-m01',
      'city-mill',
      requestKey,
      2,
      '18446744073709551616',
      INNER_KEEP_POLICY_DIGEST
    );
    expect(harness.getMyInnerKeepRequestStatusV1).toHaveBeenCalledWith({ requestKey });
    expect(harness.innerKeepStartProjectV1).toHaveBeenCalledWith({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      requestKey,
      expectedTargetLevel: 2,
      expectedProjectRevision: '18446744073709551616',
      expectedPolicyDigest: INNER_KEEP_POLICY_DIGEST
    });
    await expect(startWarpkeepInnerKeepProject(
      harness.connection,
      'inner-keep-slot-m01',
      'city-mill',
      requestKey,
      2,
      '018446744073709551616',
      INNER_KEEP_POLICY_DIGEST
    )).rejects.toThrow('Inner Keep construction is unavailable.');
    for (const [target, revision] of [
      [0, '0'],
      [6, '0'],
      [2, '+0'],
      [2, '110680464442257309691'],
    ] as const) {
      await expect(startWarpkeepInnerKeepProject(
        harness.connection,
        'inner-keep-slot-m01',
        'city-mill',
        requestKey,
        target,
        revision,
        INNER_KEEP_POLICY_DIGEST
      )).rejects.toThrow('Inner Keep construction is unavailable.');
    }
    await expect(startWarpkeepInnerKeepProject(
      harness.connection,
      'inner-keep-slot-m01',
      'city-mill',
      requestKey,
      2,
      '18446744073709551616',
      '0'.repeat(64)
    )).rejects.toThrow('Inner Keep construction is unavailable.');
    expect(harness.innerKeepStartProjectV1).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });
});
