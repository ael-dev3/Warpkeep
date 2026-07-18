import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DbConnection,
  tables,
  type EventContext
} from '../src/spacetime/playerModuleBindings';
import {
  acceptWarpkeepAlphaTerms,
  connectWarpkeep,
  bootstrapWarpkeepPlayer,
  collectWarpkeepGoldExpedition,
  collectWarpkeepResources,
  createWarpkeepConnectionBuilder,
  disconnectWarpkeep,
  dispatchWarpkeepGoldExpedition,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepGoldExpeditionState,
  readWarpkeepResourceState,
  readWarpkeepRealmSnapshot,
  subscribeToWarpkeepRealm,
  WARPKEEP_ALPHA_TERMS_VERSION as BROWSER_ALPHA_TERMS_VERSION,
  type WarpkeepConnection
} from '../src/spacetime/warpkeepConnection';
import {
  WARPKEEP_ALPHA_TERMS_VERSION as MODULE_ALPHA_TERMS_VERSION
} from '../spacetimedb/src/marksAuthorityPolicy';
import type { WarpkeepRuntimeConfig } from '../src/spacetime/warpkeepConfig';
import type { WarpkeepRealmSnapshotCandidate } from '../src/spacetime/warpkeepBackendTypes';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisCandidate
} from './fixtures/canonicalGenesisSnapshot';

const config: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'warpkeep-89e4u',
  bridgeUrl: 'https://auth.warpkeep.example',
  issuer: 'https://auth.warpkeep.example',
  audience: 'warpkeep-spacetimedb',
  publicConfigValid: true,
  sharedAlphaEnabled: true
});

function timestamp(milliseconds = 1_752_408_000_000) {
  return { toMillis: () => BigInt(milliseconds) };
}

function rawRowsForCandidate(candidate: WarpkeepRealmSnapshotCandidate) {
  return {
    worldTile: candidate.tiles.map((tile) => ({
      ...tile,
      occupantCastleId: tile.occupantCastleId === undefined
        ? undefined
        : BigInt(tile.occupantCastleId)
    })),
    worldTileMetaV1: candidate.tileMetadata.map((metadata) => ({ ...metadata })),
    playerV2: candidate.players.map((player) => ({
      ...player,
      fid: BigInt(player.fid),
      joinedAt: timestamp()
    })),
    realmProfileV1: candidate.profiles.map((profile) => ({
      ...profile,
      fid: BigInt(profile.fid),
      admittedAt: timestamp(profile.admittedAt),
      firstAuthenticatedAt: profile.firstAuthenticatedAt === undefined
        ? undefined
        : timestamp(profile.firstAuthenticatedAt),
      profileUpdatedAt: timestamp()
    })),
    realmV1: candidate.activeRealms.map((realm) => ({
      ...realm,
      createdAt: timestamp()
    })),
    castle: candidate.castles.map((castle) => ({
      ...castle,
      castleId: BigInt(castle.castleId),
      ownerFid: BigInt(castle.ownerFid),
      createdAt: timestamp(castle.foundedAt)
    }))
  };
}

function connectionForCandidate(candidate: WarpkeepRealmSnapshotCandidate): WarpkeepConnection {
  const rows = rawRowsForCandidate(candidate);
  const table = <T,>(values: readonly T[]) => ({
    iter: function* () { yield* values; }
  });
  return {
    db: {
      worldTile: table(rows.worldTile),
      worldTileMetaV1: table(rows.worldTileMetaV1),
      playerV2: table(rows.playerV2),
      realmProfileV1: table(rows.realmProfileV1),
      realmV1: table(rows.realmV1),
      castle: table(rows.castle)
    }
  } as unknown as WarpkeepConnection;
}

function callbackSubscriptionDouble() {
  let onApplied: (() => void) | undefined;
  let onError: (() => void) | undefined;
  const subscription = { unsubscribe: vi.fn() };
  const builder = {
    onApplied: vi.fn((callback: () => void) => {
      onApplied = callback;
      return builder;
    }),
    onError: vi.fn((callback: () => void) => {
      onError = callback;
      return builder;
    }),
    subscribe: vi.fn(() => subscription)
  };
  return Object.freeze({
    builder,
    subscription,
    apply: () => onApplied?.(),
    fail: () => onError?.()
  });
}

/**
 * A core + paired-forest browser double. Gold is intentionally absent so the
 * test isolates the forest subscription's atomic visibility boundary.
 */
function forestSubscriptionConnection(
  candidate: WarpkeepRealmSnapshotCandidate,
  forest: Readonly<{
    layoutRows?: readonly unknown[];
    treeRows?: readonly unknown[];
  }> = {}
) {
  const rows = rawRowsForCandidate(candidate);
  const table = <T,>(values: readonly T[]) => ({
    iter: function* () { yield* values; }
  });
  const core = callbackSubscriptionDouble();
  const pairedForest = callbackSubscriptionDouble();
  const connection = {
    db: {
      worldTile: table(rows.worldTile),
      worldTileMetaV1: table(rows.worldTileMetaV1),
      playerV2: table(rows.playerV2),
      realmProfileV1: table(rows.realmProfileV1),
      realmV1: table(rows.realmV1),
      castle: table(rows.castle),
      realmForestLayoutV1: table(forest.layoutRows ?? [
        { ...CANONICAL_GENESIS_FOREST_LAYOUT_V1, seededAt: timestamp() }
      ]),
      realmForestInstanceV1: table(forest.treeRows ?? CANONICAL_GENESIS_FOREST_INSTANCES_V1)
    },
    subscriptionBuilder: vi.fn()
      .mockReturnValueOnce(core.builder)
      .mockReturnValueOnce(pairedForest.builder)
  } as unknown as WarpkeepConnection;
  return Object.freeze({ connection, core, pairedForest });
}

type RealmTableListener = (context: EventContext, ...rows: unknown[]) => void;

function observableTableDouble<T>(initialValues: readonly T[]) {
  const values = [...initialValues];
  const listeners: {
    insert?: RealmTableListener;
    delete?: RealmTableListener;
    update?: RealmTableListener;
  } = {};
  return {
    listeners,
    values,
    table: {
      iter: function* () { yield* values; },
      onInsert: vi.fn((listener: RealmTableListener) => { listeners.insert = listener; }),
      onDelete: vi.fn((listener: RealmTableListener) => { listeners.delete = listener; }),
      onUpdate: vi.fn((listener: RealmTableListener) => { listeners.update = listener; }),
      removeOnInsert: vi.fn(),
      removeOnDelete: vi.fn(),
      removeOnUpdate: vi.fn()
    }
  };
}

function observableConnectionForCandidate(candidate: WarpkeepRealmSnapshotCandidate) {
  const rows = rawRowsForCandidate(candidate);
  const worldTile = observableTableDouble(rows.worldTile);
  const worldTileMetaV1 = observableTableDouble(rows.worldTileMetaV1);
  const playerV2 = observableTableDouble(rows.playerV2);
  const castle = observableTableDouble(rows.castle);
  const realmV1 = observableTableDouble(rows.realmV1);
  const realmProfileV1 = observableTableDouble(rows.realmProfileV1);
  const connection = {
    db: {
      worldTile: worldTile.table,
      worldTileMetaV1: worldTileMetaV1.table,
      playerV2: playerV2.table,
      castle: castle.table,
      realmV1: realmV1.table,
      realmProfileV1: realmProfileV1.table
    }
  } as unknown as WarpkeepConnection;
  return {
    connection,
    worldTile,
    worldTileMetaV1,
    playerV2,
    castle,
    realmV1,
    realmProfileV1
  };
}

function builderDouble() {
  const builder = {
    withUri: vi.fn(),
    withDatabaseName: vi.fn(),
    withToken: vi.fn(),
    onDisconnect: vi.fn(),
    onConnect: vi.fn(),
    onConnectError: vi.fn(),
    build: vi.fn()
  };
  for (const method of [
    builder.withUri,
    builder.withDatabaseName,
    builder.withToken,
    builder.onDisconnect,
    builder.onConnect,
    builder.onConnectError
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Warpkeep authenticated connection boundary', () => {
  it('builds from the current bridge JWT and known Maincloud URI without any token storage', () => {
    const builder = builderDouble();
    vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);

    createWarpkeepConnectionBuilder(config, 'header.payload.signature');

    expect(builder.withUri).toHaveBeenCalledWith('https://maincloud.spacetimedb.com');
    expect(builder.withDatabaseName).toHaveBeenCalledWith('warpkeep-89e4u');
    expect(builder.withToken).toHaveBeenCalledWith('header.payload.signature');
    expect(window.localStorage.length).toBe(0);
  });

  it('refuses an absent/malformed bridge token before a builder exists', () => {
    const spy = vi.spyOn(DbConnection, 'builder');
    expect(() => createWarpkeepConnectionBuilder(config, '')).toThrow(/bridge session/i);
    expect(() => createWarpkeepConnectionBuilder(config, 'not-a-jwt')).toThrow(/bridge session/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses parser-invalid public coordinates at the transport boundary', () => {
    const spy = vi.spyOn(DbConnection, 'builder');
    const invalidConfig = Object.freeze({ ...config, publicConfigValid: false });

    expect(() => createWarpkeepConnectionBuilder(
      invalidConfig,
      'header.payload.signature'
    )).toThrow('Warpkeep records are unavailable.');
    expect(spy).not.toHaveBeenCalled();
  });

  it('never persists or replaces the bridge JWT with SpacetimeDB onConnect material', async () => {
    const builder = builderDouble();
    const connection = { isDisconnectRequested: false } as WarpkeepConnection;
    let onConnect: ((connection: WarpkeepConnection, identity: unknown, token: string) => void) | undefined;
    builder.onConnect.mockImplementation((callback) => {
      onConnect = callback;
      return builder;
    });
    builder.build.mockImplementation(() => {
      onConnect?.(connection, {}, 'SERVER_ISSUED_TOKEN_MUST_NOT_BE_STORED');
    });
    vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);

    await expect(connectWarpkeep(config, 'header.payload.signature')).resolves.toBe(connection);
    expect(window.localStorage.length).toBe(0);
  });

  it('bounds a silent connection handshake and disconnects a late connection', async () => {
    vi.useFakeTimers();
    const builder = builderDouble();
    const disconnect = vi.fn();
    const lateConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect
    } as unknown as WarpkeepConnection;
    let onConnect: ((connection: WarpkeepConnection, identity: unknown, token: string) => void) | undefined;
    builder.onConnect.mockImplementation((callback) => {
      onConnect = callback;
      return builder;
    });
    builder.build.mockReturnValue(lateConnection);
    vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);

    let outcome = 'pending';
    const connection = connectWarpkeep(config, 'header.payload.signature');
    void connection.then(
      () => { outcome = 'resolved'; },
      () => { outcome = 'rejected'; }
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(connection).rejects.toThrow('Warpkeep records are unavailable.');
    expect(outcome).toBe('rejected');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    onConnect?.(lateConnection, {}, 'SERVER_ISSUED_TOKEN_MUST_NOT_BE_STORED');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps the core subscription live when additive Gold tables are absent', () => {
    const subscription = { unsubscribe: vi.fn() };
    const subscriptionBuilder = {
      onApplied: vi.fn(),
      onError: vi.fn(),
      subscribe: vi.fn(() => subscription)
    };
    subscriptionBuilder.onApplied.mockReturnValue(subscriptionBuilder);
    subscriptionBuilder.onError.mockReturnValue(subscriptionBuilder);
    const connection = {
      subscriptionBuilder: () => subscriptionBuilder
    } as unknown as WarpkeepConnection;

    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    expect(subscriptionBuilder.subscribe).toHaveBeenCalledWith([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);
    composite.unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribes only to public Gold site and occupancy tables, never the scheduler', () => {
    const coreSubscription = { unsubscribe: vi.fn() };
    const goldSubscription = { unsubscribe: vi.fn() };
    const firstBuilder = {
      onApplied: vi.fn(),
      onError: vi.fn(),
      subscribe: vi.fn(() => coreSubscription)
    };
    const secondBuilder = {
      onApplied: vi.fn(),
      onError: vi.fn(),
      subscribe: vi.fn(() => goldSubscription)
    };
    firstBuilder.onApplied.mockReturnValue(firstBuilder);
    firstBuilder.onError.mockReturnValue(firstBuilder);
    secondBuilder.onApplied.mockReturnValue(secondBuilder);
    secondBuilder.onError.mockReturnValue(secondBuilder);
    const connection = {
      db: { goldSiteV1: {}, goldNodeOccupationV1: {} },
      subscriptionBuilder: vi.fn()
        .mockReturnValueOnce(firstBuilder)
        .mockReturnValueOnce(secondBuilder)
    } as unknown as WarpkeepConnection;

    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());

    expect(firstBuilder.subscribe).toHaveBeenCalledWith([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);
    expect(secondBuilder.subscribe).toHaveBeenCalledWith([
      tables.goldSiteV1,
      tables.goldNodeOccupationV1
    ]);
    composite.unsubscribe();
    expect(coreSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(goldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('makes the paired shared forest visible only after its subscription applies', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedForest } = forestSubscriptionConnection(candidate);
    const onApplied = vi.fn();
    const composite = subscribeToWarpkeepRealm(connection, onApplied, vi.fn());

    expect(core.builder.subscribe).toHaveBeenCalledWith([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);
    expect(pairedForest.builder.subscribe).toHaveBeenCalledWith([
      tables.realmForestLayoutV1,
      tables.realmForestInstanceV1
    ]);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('forestTrees');

    core.apply();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('forestTrees');

    pairedForest.apply();
    expect(onApplied).toHaveBeenCalledTimes(2);
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.forestLayout).toEqual(CANONICAL_GENESIS_FOREST_LAYOUT_V1);
    expect(snapshot.forestTrees).toEqual(CANONICAL_GENESIS_FOREST_INSTANCES_V1);
    expect(Object.isFrozen(snapshot.forestTrees)).toBe(true);

    composite.unsubscribe();
    expect(core.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pairedForest.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('preserves an applied but unseeded forest pair as present-invalid', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedForest } = forestSubscriptionConnection(candidate, {
      layoutRows: [],
      treeRows: []
    });
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    core.apply();
    pairedForest.apply();

    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.forestLayout).toEqual([]);
    expect(snapshot.forestTrees).toEqual([]);
    expect(snapshot).toHaveProperty('forestTrees');

    composite.unsubscribe();
  });

  it('omits forest fields for a pre-v6 connection without the public pair', () => {
    const snapshot = readWarpkeepRealmSnapshot(
      connectionForCandidate(createCanonicalGenesisCandidate()),
      CANONICAL_TEST_FID
    );
    expect(snapshot).not.toHaveProperty('forestLayout');
    expect(snapshot).not.toHaveProperty('forestTrees');
  });

  it('uses only the versioned admission procedure and bootstrap reducer', async () => {
    const connection = {
      procedures: {
        getMyAdmissionStatusV2: vi.fn(async () => 'admitted_needs_bootstrap')
      },
      reducers: {
        bootstrapPlayerV2: vi.fn(async () => undefined),
        acceptAlphaTermsV1: vi.fn(async () => undefined)
      }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepAdmissionStatus(connection)).resolves.toBe('admitted_needs_bootstrap');
    await bootstrapWarpkeepPlayer(connection);
    await acceptWarpkeepAlphaTerms(connection);
    expect(connection.procedures.getMyAdmissionStatusV2).toHaveBeenCalledWith({});
    expect(connection.reducers.bootstrapPlayerV2).toHaveBeenCalledWith({});
    expect(connection.reducers.acceptAlphaTermsV1).toHaveBeenCalledWith({
      termsVersion: '2026-07-14',
      accepted: true
    });
  });

  it('reads and collects only the caller-bound private resource projection', async () => {
    const projection = {
      fid: BigInt(CANONICAL_TEST_FID),
      food: 200n,
      wood: 150n,
      stone: 100n,
      gold: 25n,
      pendingFood: 8n,
      pendingWood: 5n,
      pendingStone: 3n,
      pendingGold: 1n,
      marksBalanceMicros: 12_500_000n,
      observedAtMicros: 1_800_000_600_000_000n,
      settledThroughMicros: 1_800_000_000_000_000n,
      nextCollectAtMicros: 1_800_001_200_000_000n,
      revision: 4n,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
      marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
      terrainKind: 'lowland'
    } as const;
    const connection = {
      procedures: { getMyResourceStateV1: vi.fn(async () => projection) },
      reducers: { collectResourcesV1: vi.fn(async () => undefined) }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepResourceState(connection, CANONICAL_TEST_FID)).resolves
      .toMatchObject({
        fid: BigInt(CANONICAL_TEST_FID),
        balances: { food: 200n, wood: 150n, stone: 100n, gold: 25n },
        pendingBalances: { food: 8n, wood: 5n, stone: 3n, gold: 1n }
      });
    await expect(collectWarpkeepResources(connection, CANONICAL_TEST_FID)).resolves
      .toMatchObject({ revision: 4n });
    expect(connection.reducers.collectResourcesV1).toHaveBeenCalledWith({});
    expect(connection.procedures.getMyResourceStateV1).toHaveBeenCalledTimes(2);

    connection.procedures.getMyResourceStateV1 = vi.fn(async () => ({
      ...projection,
      fid: BigInt(CANONICAL_TEST_FID + 1)
    }));
    await expect(readWarpkeepResourceState(connection, CANONICAL_TEST_FID))
      .rejects.toThrow('Warpkeep resources are unavailable.');
    await expect(readWarpkeepResourceState(connection, 0))
      .rejects.toThrow('Warpkeep resources are unavailable.');
  });

  it('keeps Gold dispatch and settlement caller-bound, then reads exact private projections', async () => {
    const resourceProjection = {
      fid: BigInt(CANONICAL_TEST_FID),
      food: 200n,
      wood: 150n,
      stone: 100n,
      gold: 25n,
      pendingFood: 8n,
      pendingWood: 5n,
      pendingStone: 3n,
      pendingGold: 1n,
      marksBalanceMicros: 12_500_000n,
      observedAtMicros: 1_800_000_600_000_000n,
      settledThroughMicros: 1_800_000_000_000_000n,
      nextCollectAtMicros: 1_800_001_200_000_000n,
      revision: 4n,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
      marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
      terrainKind: 'lowland'
    } as const;
    const goldProjection = {
      active: false,
      expeditionId: undefined,
      siteId: undefined,
      originCastleId: undefined,
      phase: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnsAtMicros: undefined,
      accruedGold: 0n,
      pendingGold: 0n,
      creditedGold: 0n,
      rateGoldPerMinute: 1n,
      gatheringDurationMicros: 2_592_000_000_000n,
      expeditionPolicyVersion: undefined
    } as const;
    const connection = {
      procedures: {
        getMyResourceStateV1: vi.fn(async () => resourceProjection),
        getMyGoldExpeditionStateV1: vi.fn(async () => goldProjection)
      },
      reducers: {
        dispatchGoldExpeditionV1: vi.fn(async () => undefined),
        collectGoldExpeditionV1: vi.fn(async () => undefined)
      }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepGoldExpeditionState(connection)).resolves
      .toMatchObject({ active: false, pendingGold: 0n });
    await expect(dispatchWarpkeepGoldExpedition(
      connection,
      'gold:genesis:001',
      '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    )).resolves.toMatchObject({ active: false });
    await expect(collectWarpkeepGoldExpedition(connection, CANONICAL_TEST_FID)).resolves
      .toMatchObject({
        resources: { fid: BigInt(CANONICAL_TEST_FID) },
        goldExpedition: { active: false }
      });
    expect(connection.reducers.dispatchGoldExpeditionV1).toHaveBeenCalledWith({
      siteId: 'gold:genesis:001',
      idempotencyKey: '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    });
    expect(connection.reducers.collectGoldExpeditionV1).toHaveBeenCalledWith({});
    await expect(dispatchWarpkeepGoldExpedition(connection, 'bad site', 'not-valid'))
      .rejects.toThrow('Gold expedition is unavailable.');
    expect(connection.reducers.dispatchGoldExpeditionV1).toHaveBeenCalledTimes(1);
  });

  it('pins the browser and authoritative module to the same Terms version', () => {
    expect(BROWSER_ALPHA_TERMS_VERSION).toBe(MODULE_ALPHA_TERMS_VERSION);
  });

  it('contains no legacy player subscription, cache read, or observer path', () => {
    const runtime = readFileSync(
      resolve(process.cwd(), 'src/spacetime/warpkeepConnection.ts'),
      'utf8'
    );
    expect(runtime).not.toMatch(/tables\.player(?:\W|$)/);
    expect(runtime).not.toMatch(/connection\.db\.player(?:\W|$)/);
    expect(runtime).toMatch(/tables\.playerV2/);
    expect(runtime).toMatch(/connection\.db\.playerV2/);
  });

  it('rejects an incompatible backend before gameplay admission or subscriptions', async () => {
    const compatible = {
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    };
    const connection = {
      procedures: { getAlphaBackendInfo: vi.fn(async () => compatible) }
    } as unknown as WarpkeepConnection;
    await expect(readWarpkeepBackendInfo(connection)).resolves.toEqual(compatible);

    connection.procedures.getAlphaBackendInfo = vi.fn(async () => ({
      ...compatible,
      protocolVersion: 1
    }));
    await expect(readWarpkeepBackendInfo(connection)).rejects.toThrow(/protocol is incompatible/i);
  });

  it.each([
    [2, 1_261],
    [3, 10_000]
  ] as const)(
    'derives the own castle from the bridge-token FID for generation %i',
    (generationVersion, cellCount) => {
      const candidate = createCanonicalGenesisCandidate({
        ownFid: CANONICAL_TEST_FID,
        peerFid: 77,
        generationVersion
      });
      const connection = connectionForCandidate(candidate);

      const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
      expect(snapshot.ownCastle.name).toBe('Warpkeeper Bastion');
      expect(snapshot.castles).toHaveLength(2);
      expect(snapshot.tiles).toHaveLength(cellCount);
      expect(snapshot.tileMetadata).toHaveLength(cellCount);
    }
  );

  it('maps only the public realm metadata, profile, Marks, and founding presentation', () => {
    const base = createCanonicalGenesisCandidate();
    const candidate: WarpkeepRealmSnapshotCandidate = {
      ...base,
      profiles: [{
        fid: 12_345,
        canonicalUsername: 'warpkeeper',
        displayName: 'Warp Keeper',
        pfpUrl: 'https://cdn.example/keeper.png',
        publicBio: 'Founding the frontier.',
        admittedAt: 1_752_408_000_000,
        firstAuthenticatedAt: 1_752_494_400_000,
        publicStatus: 'founding-player',
        communityStatsVisible: true,
        totalSnapBurnedMicros: 25_000_000n,
        marksEarnedMicros: 25_000_000n,
        marksSpentMicros: 1_000_000n,
        marksBalanceMicros: 24_000_000n,
        marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1'
      }]
    };
    const snapshot = readWarpkeepRealmSnapshot(
      connectionForCandidate(candidate),
      CANONICAL_TEST_FID
    );

    expect(snapshot.realm).toEqual(base.activeRealms[0]);
    expect(snapshot.profiles).toEqual(candidate.profiles);
    expect(snapshot.tiles).toHaveLength(10_000);
    expect(snapshot.tileMetadata).toHaveLength(10_000);
    expect(snapshot.ownCastle.ownerFid).toBe(CANONICAL_TEST_FID);
    expect(snapshot).not.toHaveProperty('identity');
    expect(snapshot).not.toHaveProperty('wallet');
  });

  it('sanitizes optional presentation metadata without revoking the Realm snapshot', () => {
    const base = createCanonicalGenesisCandidate();
    const snapshot = readWarpkeepRealmSnapshot(connectionForCandidate({
      ...base,
      players: [{
        ...base.players[0]!,
        username: 'keeper\u00ad',
        displayName: 'Keeper\u206aImpostor',
        pfpUrl: 'https://profiles.example:443/keeper.png'
      }],
      profiles: [{
        ...base.profiles[0]!,
        canonicalUsername: 'keeper\u00ad',
        publicBio: 'x'.repeat(321),
        pfpUrl: 'https://profiles.example:8443/keeper.png'
      }]
    }), CANONICAL_TEST_FID);

    expect(snapshot.players[0]).toMatchObject({
      displayName: 'KeeperImpostor',
      pfpUrl: 'https://profiles.example/keeper.png'
    });
    expect(snapshot.players[0]).not.toHaveProperty('username');
    expect(snapshot.profiles[0]).not.toHaveProperty('canonicalUsername');
    expect(snapshot.profiles[0]).not.toHaveProperty('publicBio');
    expect(snapshot.profiles[0]).not.toHaveProperty('pfpUrl');
  });

  it('accepts producer-bounded astral presentation text by Unicode code point', () => {
    const base = createCanonicalGenesisCandidate();
    const displayName = '𐐀'.repeat(80);
    const snapshot = readWarpkeepRealmSnapshot(connectionForCandidate({
      ...base,
      players: [{ ...base.players[0]!, displayName }]
    }), CANONICAL_TEST_FID);

    expect(snapshot.players[0]?.displayName).toBe(displayName);
  });

  it('fails closed on malformed required authority fields at connection ingress', () => {
    const base = createCanonicalGenesisCandidate();
    const malformed: readonly WarpkeepRealmSnapshotCandidate[] = [
      { ...base, players: [{ ...base.players[0]!, status: 'active\u206a' }] },
      {
        ...base,
        profiles: [{ ...base.profiles[0]!, publicStatus: 'founded\u206a' }]
      },
      { ...base, castles: [{ ...base.castles[0]!, name: 'x'.repeat(81) }] }
    ];

    for (const candidate of malformed) {
      expect(() => readWarpkeepRealmSnapshot(
        connectionForCandidate(candidate),
        CANONICAL_TEST_FID
      )).toThrow('Warpkeep records are unavailable.');
    }
  });

  it('rejects active-realm ambiguity instead of selecting the first row', () => {
    const candidate = createCanonicalGenesisCandidate();
    const ambiguous: WarpkeepRealmSnapshotCandidate = {
      ...candidate,
      activeRealms: [
        candidate.activeRealms[0]!,
        { ...candidate.activeRealms[0]!, realmId: 'GENESIS_002' }
      ]
    };

    expect(() => readWarpkeepRealmSnapshot(
      connectionForCandidate(ambiguous),
      CANONICAL_TEST_FID
    )).toThrow(/incomplete or incompatible/i);
  });

  it('publishes one realm snapshot per transaction and removes every table listener', () => {
    const candidate = createCanonicalGenesisCandidate();
    const {
      connection,
      worldTile,
      worldTileMetaV1,
      playerV2,
      castle,
      realmV1,
      realmProfileV1
    } = observableConnectionForCandidate(candidate);
    const onChange = vi.fn();
    const onError = vi.fn();
    const cleanup = observeWarpkeepRealm(
      connection,
      CANONICAL_TEST_FID,
      onChange,
      onError
    );
    const context = (id: string) => ({
      event: { id, tag: 'Transaction' }
    }) as unknown as EventContext;

    worldTile.listeners.insert?.({
      event: { id: 'subscribe-applied', tag: 'SubscribeApplied' }
    } as unknown as EventContext);
    expect(onChange).not.toHaveBeenCalled();

    worldTile.listeners.insert?.(context('transaction-1'));
    playerV2.listeners.update?.(context('transaction-1'));
    castle.listeners.delete?.(context('transaction-1'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      protocolVersion: 3,
      canonicalFingerprint: expect.stringContaining('genesis-001')
    });
    expect(onChange.mock.calls[0]?.[0].tiles).toHaveLength(10_000);

    castle.listeners.insert?.(context('transaction-2'));
    expect(onChange).toHaveBeenCalledTimes(2);

    worldTileMetaV1.values.pop();
    castle.listeners.insert?.(context('transaction-invalid'));
    expect(onError).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledTimes(2);
    worldTile.listeners.insert?.(context('transaction-after-error'));
    expect(onChange).toHaveBeenCalledTimes(2);

    cleanup();
    worldTile.listeners.insert?.(context('transaction-3'));
    expect(onChange).toHaveBeenCalledTimes(2);
    for (const source of [
      worldTile.table,
      worldTileMetaV1.table,
      playerV2.table,
      castle.table,
      realmV1.table,
      realmProfileV1.table
    ]) {
      expect(source.removeOnInsert).toHaveBeenCalledOnce();
      expect(source.removeOnDelete).toHaveBeenCalledOnce();
      expect(source.removeOnUpdate).toHaveBeenCalledOnce();
    }
  });

  it('observes and releases both public forest tables with the Realm lifecycle', () => {
    const candidate = createCanonicalGenesisCandidate();
    const observed = observableConnectionForCandidate(candidate);
    const forestLayout = observableTableDouble([
      { ...CANONICAL_GENESIS_FOREST_LAYOUT_V1, seededAt: timestamp() }
    ]);
    const forestInstances = observableTableDouble(CANONICAL_GENESIS_FOREST_INSTANCES_V1);
    Object.assign(
      (observed.connection.db as unknown as Record<string, unknown>),
      {
        realmForestLayoutV1: forestLayout.table,
        realmForestInstanceV1: forestInstances.table
      }
    );
    const onChange = vi.fn();
    const cleanup = observeWarpkeepRealm(
      observed.connection,
      CANONICAL_TEST_FID,
      onChange,
      vi.fn()
    );
    const context = {
      event: { id: 'forest-layout-update', tag: 'Transaction' }
    } as unknown as EventContext;

    forestLayout.listeners.update?.(context);
    expect(onChange).toHaveBeenCalledOnce();

    cleanup();
    for (const source of [forestLayout.table, forestInstances.table]) {
      expect(source.removeOnInsert).toHaveBeenCalledOnce();
      expect(source.removeOnDelete).toHaveBeenCalledOnce();
      expect(source.removeOnUpdate).toHaveBeenCalledOnce();
    }
  });

  it('publishes trusted presentation fields after a blank founder profile update event', () => {
    const candidate = createCanonicalGenesisCandidate();
    const founderProfile = {
      fid: CANONICAL_TEST_FID,
      publicStatus: 'founded',
      communityStatsVisible: false
    } as const;
    const { connection, realmProfileV1 } = observableConnectionForCandidate({
      ...candidate,
      profiles: [founderProfile]
    });
    const initial = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID).profiles[0];
    expect(initial).toEqual(expect.objectContaining(founderProfile));
    expect(initial).not.toHaveProperty('canonicalUsername');
    expect(initial).not.toHaveProperty('pfpUrl');

    const onChange = vi.fn();
    const onError = vi.fn();
    const cleanupObserver = observeWarpkeepRealm(
      connection,
      CANONICAL_TEST_FID,
      onChange,
      onError
    );
    realmProfileV1.values[0] = {
      ...realmProfileV1.values[0]!,
      canonicalUsername: 'fixturekeeper',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://profiles.example/fixturekeeper.png',
      publicBio: 'A fixture-only public profile.'
    };
    realmProfileV1.listeners.update?.({
      event: { id: 'trusted-profile-update', tag: 'Transaction' }
    } as unknown as EventContext);

    expect(onError).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].profiles).toEqual([
      expect.objectContaining({
        ...founderProfile,
        canonicalUsername: 'fixturekeeper',
        displayName: 'Fixture Keeper',
        pfpUrl: 'https://profiles.example/fixturekeeper.png',
        publicBio: 'A fixture-only public profile.'
      })
    ]);
    cleanupObserver();
  });

  it('disconnects a current connection without throwing on a stale socket', () => {
    const disconnect = vi.fn();
    disconnectWarpkeep({ isDisconnectRequested: false, disconnect } as unknown as WarpkeepConnection);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(() => disconnectWarpkeep({
      isDisconnectRequested: true,
      disconnect: vi.fn(() => { throw new Error('stale'); })
    } as unknown as WarpkeepConnection)).not.toThrow();
  });
});
