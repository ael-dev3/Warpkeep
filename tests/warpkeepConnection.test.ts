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
  CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS,
  classifyWarpkeepConnectionFailure,
  connectWarpkeep,
  bootstrapWarpkeepPlayer,
  collectWarpkeepGoldExpedition,
  collectWarpkeepStoneExpedition,
  collectWarpkeepWoodExpedition,
  collectWarpkeepResources,
  createWarpkeepConnectionBuilder,
  disconnectWarpkeep,
  dispatchWarpkeepGoldExpedition,
  dispatchWarpkeepStoneExpedition,
  dispatchWarpkeepWoodExpedition,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepGoldExpeditionState,
  readWarpkeepStoneExpeditionState,
  readWarpkeepWoodExpeditionState,
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
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_V1,
  GENESIS_WATER_LAYOUT_V1
} from '../spacetimedb/src/waterWorld';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../spacetimedb/src/waterRevision';
import { resolveCanonicalWaterProjection } from '../src/components/realm/realmWaterProjection';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_REALM_ID,
  workerRosterDigestForCastleIds
} from '../src/components/realm/realmWorkerPresentation';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisCandidate
} from './fixtures/canonicalGenesisSnapshot';

const config: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
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

/** Core + paired Stone public projection with every unrelated additive layer absent. */
function stoneSubscriptionConnection(
  candidate: WarpkeepRealmSnapshotCandidate,
  stone: Readonly<{
    siteRows?: readonly unknown[];
    occupationRows?: readonly unknown[];
  }> = {}
) {
  const rows = rawRowsForCandidate(candidate);
  const table = <T,>(values: readonly T[]) => ({
    iter: function* () { yield* values; }
  });
  const core = callbackSubscriptionDouble();
  const pairedStone = callbackSubscriptionDouble();
  const connection = {
    db: {
      worldTile: table(rows.worldTile),
      worldTileMetaV1: table(rows.worldTileMetaV1),
      playerV2: table(rows.playerV2),
      realmProfileV1: table(rows.realmProfileV1),
      realmV1: table(rows.realmV1),
      castle: table(rows.castle),
      stoneSiteV1: table(stone.siteRows ?? CANONICAL_TIER_I_STONE_SITES_V1),
      stoneNodeOccupationV1: table(stone.occupationRows ?? [])
    },
    subscriptionBuilder: vi.fn()
      .mockReturnValueOnce(core.builder)
      .mockReturnValueOnce(pairedStone.builder)
  } as unknown as WarpkeepConnection;
  return Object.freeze({ connection, core, pairedStone });
}

function workerSubscriptionConnection(
  candidate: WarpkeepRealmSnapshotCandidate,
  workerRows: readonly unknown[]
) {
  const rows = rawRowsForCandidate(candidate);
  const table = <T,>(values: readonly T[]) => ({
    iter: function* () { yield* values; }
  });
  const core = callbackSubscriptionDouble();
  const pairedWorkers = callbackSubscriptionDouble();
  const castleId = candidate.castles[0]!.castleId;
  const connection = {
    db: {
      worldTile: table(rows.worldTile),
      worldTileMetaV1: table(rows.worldTileMetaV1),
      playerV2: table(rows.playerV2),
      realmProfileV1: table(rows.realmProfileV1),
      realmV1: table(rows.realmV1),
      castle: table(rows.castle),
      realmWorkerSystemV1: table([{
        realmId: CASTLE_WORKER_REALM_ID,
        policyVersion: CASTLE_WORKER_POLICY_VERSION,
        workersPerCastle: 4,
        expectedCastleCount: 1,
        expectedWorkerCount: 4,
        rosterDigest: workerRosterDigestForCastleIds([castleId]),
        mode: 'active',
        legacyDrainRequired: false
      }]),
      castleWorkerV1: table(workerRows),
      workerNodeOccupationV1: table([{
        nodeKey: 'stone:genesis-001:stone:0001',
        resourceKind: 'stone',
        siteId: 'genesis-001:stone:0001',
        workerId: `genesis-001-castle-${castleId}-worker-01`,
        workerOrdinal: 1,
        originCastleId: BigInt(castleId),
        phase: 'gathering',
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 100n,
        timelineRevision: 1
      }])
    },
    subscriptionBuilder: vi.fn()
      .mockReturnValueOnce(core.builder)
      .mockReturnValueOnce(pairedWorkers.builder)
  } as unknown as WarpkeepConnection;
  return Object.freeze({ connection, core, pairedWorkers });
}

/** Core + Water projection using the generated SDK's exact Q15 wire spelling. */
function waterSubscriptionConnection(
  candidate: WarpkeepRealmSnapshotCandidate,
  revisionRows?: readonly unknown[]
) {
  const rows = rawRowsForCandidate(candidate);
  const table = <T,>(values: readonly T[]) => ({
    iter: function* () { yield* values; }
  });
  const generatedBodyRows = GENESIS_WATER_BODIES_V1.map((body) => {
    const {
      flowDirectionXQ15,
      flowDirectionZQ15,
      ...generatedFields
    } = body;
    return {
      ...generatedFields,
      flowDirectionXq15: flowDirectionXQ15,
      flowDirectionZq15: flowDirectionZQ15
    };
  });
  const core = callbackSubscriptionDouble();
  const pairedWater = callbackSubscriptionDouble();
  const connection = {
    db: {
      worldTile: table(rows.worldTile),
      worldTileMetaV1: table(rows.worldTileMetaV1),
      playerV2: table(rows.playerV2),
      realmProfileV1: table(rows.realmProfileV1),
      realmV1: table(rows.realmV1),
      castle: table(rows.castle),
      realmWaterLayoutV1: table([{
        ...GENESIS_WATER_LAYOUT_V1,
        activated: true,
        seededAt: timestamp(),
        activatedAt: timestamp()
      }]),
      realmWaterBodyV1: table(generatedBodyRows),
      realmWaterCellV1: table(GENESIS_WATER_CELLS_V1),
      realmEnvironmentV1: table([{
        ...GENESIS_WATER_ENVIRONMENT_V1,
        updatedAt: timestamp()
      }]),
      ...(revisionRows === undefined ? {} : {
        realmWaterRevisionV1: table(revisionRows)
      })
    },
    subscriptionBuilder: vi.fn()
      .mockReturnValueOnce(core.builder)
      .mockReturnValueOnce(pairedWater.builder)
  } as unknown as WarpkeepConnection;
  return Object.freeze({ connection, core, pairedWater });
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
  it('reduces raw SDK failures to bounded credential-free diagnostics', () => {
    const bearerLikeMaterial = 'header.payload.signature';
    expect(classifyWarpkeepConnectionFailure(
      new Error(`Failed to verify token: Unauthorized ${bearerLikeMaterial}`)
    )).toBe('token_exchange_unauthorized');
    expect(classifyWarpkeepConnectionFailure(
      new Error('Failed to verify token: Forbidden')
    )).toBe('token_exchange_forbidden');
    expect(classifyWarpkeepConnectionFailure(
      new Error('Failed to verify token: Service Unavailable')
    )).toBe('token_exchange_unavailable');
    expect(classifyWarpkeepConnectionFailure(
      new Error('Failed to verify token: Unexpected')
    )).toBe('token_exchange_failed');
    expect(classifyWarpkeepConnectionFailure(
      new Error(`WebSocket failed ${bearerLikeMaterial}`)
    )).toBe('transport_failed');
  });

  it('builds from the current bridge JWT and known Maincloud URI without any token storage', () => {
    const builder = builderDouble();
    vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);

    createWarpkeepConnectionBuilder(config, 'header.payload.signature');

    expect(builder.withUri).toHaveBeenCalledWith('https://maincloud.spacetimedb.com');
    expect(builder.withDatabaseName).toHaveBeenCalledWith(
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
    );
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

  it('reports only the bounded failure class when token exchange is rejected', async () => {
    const builder = builderDouble();
    const onConnectionFailure = vi.fn();
    let onConnectError: ((context: unknown, error: Error) => void) | undefined;
    builder.onConnectError.mockImplementation((callback) => {
      onConnectError = callback;
      return builder;
    });
    builder.build.mockImplementation(() => {
      onConnectError?.({}, new Error('Failed to verify token: Unauthorized header.payload.signature'));
      return { isDisconnectRequested: true };
    });
    vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);

    await expect(connectWarpkeep(config, 'header.payload.signature', {
      onConnectionFailure
    })).rejects.toThrow('Warpkeep records are unavailable.');
    expect(onConnectionFailure).toHaveBeenCalledWith('token_exchange_unauthorized');
    expect(JSON.stringify(onConnectionFailure.mock.calls)).not.toContain('header.payload.signature');
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
    const onConnectionFailure = vi.fn();
    const connection = connectWarpkeep(config, 'header.payload.signature', {
      onConnectionFailure
    });
    void connection.then(
      () => { outcome = 'resolved'; },
      () => { outcome = 'rejected'; }
    );

    await vi.advanceTimersByTimeAsync(CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS - 1);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(connection).rejects.toThrow('Warpkeep records are unavailable.');
    expect(outcome).toBe('rejected');
    expect(onConnectionFailure).toHaveBeenCalledWith('handshake_timeout');
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

  it('subscribes only to public Wood site and occupancy tables, never the scheduler', () => {
    const coreSubscription = { unsubscribe: vi.fn() };
    const woodSubscription = { unsubscribe: vi.fn() };
    const firstBuilder = {
      onApplied: vi.fn(),
      onError: vi.fn(),
      subscribe: vi.fn(() => coreSubscription)
    };
    const secondBuilder = {
      onApplied: vi.fn(),
      onError: vi.fn(),
      subscribe: vi.fn(() => woodSubscription)
    };
    firstBuilder.onApplied.mockReturnValue(firstBuilder);
    firstBuilder.onError.mockReturnValue(firstBuilder);
    secondBuilder.onApplied.mockReturnValue(secondBuilder);
    secondBuilder.onError.mockReturnValue(secondBuilder);
    const connection = {
      db: { woodSiteV1: {}, woodNodeOccupationV1: {} },
      subscriptionBuilder: vi.fn()
        .mockReturnValueOnce(firstBuilder)
        .mockReturnValueOnce(secondBuilder)
    } as unknown as WarpkeepConnection;

    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());

    expect(secondBuilder.subscribe).toHaveBeenCalledWith([
      tables.woodSiteV1,
      tables.woodNodeOccupationV1
    ]);
    composite.unsubscribe();
    expect(coreSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(woodSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reveals Stone only after its paired public subscription applies and releases both handles', () => {
    const candidate = createCanonicalGenesisCandidate();
    const occupation = {
      siteId: CANONICAL_TIER_I_STONE_SITES_V1[0]!.siteId,
      originCastleId: BigInt(candidate.castles[0]!.castleId),
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    } as const;
    const { connection, core, pairedStone } = stoneSubscriptionConnection(candidate, {
      occupationRows: [occupation]
    });
    const onApplied = vi.fn();
    const composite = subscribeToWarpkeepRealm(connection, onApplied, vi.fn());

    expect(pairedStone.builder.subscribe).toHaveBeenCalledWith([
      tables.stoneSiteV1,
      tables.stoneNodeOccupationV1
    ]);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('stoneSites');

    core.apply();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('stoneSites');

    pairedStone.apply();
    expect(onApplied).toHaveBeenCalledTimes(2);
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.stoneSites).toEqual(CANONICAL_TIER_I_STONE_SITES_V1);
    expect(snapshot.stoneNodeOccupations).toEqual([{
      ...occupation,
      originCastleId: candidate.castles[0]!.castleId
    }]);

    composite.unsubscribe();
    expect(core.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pairedStone.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('fails the paired Stone projection closed when its canonical catalog drifts', () => {
    const candidate = createCanonicalGenesisCandidate();
    const movedSites = [
      { ...CANONICAL_TIER_I_STONE_SITES_V1[0]!, q: CANONICAL_TIER_I_STONE_SITES_V1[0]!.q + 1 },
      ...CANONICAL_TIER_I_STONE_SITES_V1.slice(1)
    ];
    const { connection, core, pairedStone } = stoneSubscriptionConnection(candidate, {
      siteRows: movedSites
    });
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    core.apply();
    pairedStone.apply();

    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot).not.toHaveProperty('stoneSites');
    expect(snapshot).not.toHaveProperty('stoneNodeOccupations');

    composite.unsubscribe();
  });

  it('publishes the paired worker graph without exposing opaque assignment ids', () => {
    const candidate = createCanonicalGenesisCandidate();
    const castleId = candidate.castles[0]!.castleId;
    const workerRows = [1, 2, 3, 4].map((ordinal) => ({
      workerId: `genesis-001-castle-${castleId}-worker-0${ordinal}`,
      originCastleId: BigInt(castleId),
      ordinal,
      status: ordinal === 1 ? 'gathering' : 'idle',
      resourceKind: ordinal === 1 ? 'stone' : undefined,
      siteId: ordinal === 1 ? 'genesis-001:stone:0001' : undefined,
      startedAtMicros: ordinal === 1 ? 10n : undefined,
      arrivesAtMicros: ordinal === 1 ? 20n : undefined,
      gatheringEndsAtMicros: ordinal === 1 ? 100n : undefined,
      returnStartedAtMicros: undefined,
      returnsAtMicros: ordinal === 1 ? 120n : undefined,
      routeSteps: ordinal === 1 ? 1 : undefined,
      returnStartProgressBasisPoints: undefined,
      timelineRevision: ordinal === 1 ? 1 : 0,
      revision: ordinal === 1 ? 2n : 0n
    }));
    const { connection, core, pairedWorkers } = workerSubscriptionConnection(
      candidate,
      workerRows
    );
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());

    expect(pairedWorkers.builder.subscribe).toHaveBeenCalledWith([
      tables.realmWorkerSystemV1,
      tables.castleWorkerV1,
      tables.workerNodeOccupationV1
    ]);
    core.apply();
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('workerWorkers');
    pairedWorkers.apply();
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.workerWorkers).toHaveLength(4);
    expect(snapshot.workerWorkers?.every((worker) => worker.ownedByViewer)).toBe(true);
    expect(Object.keys(snapshot.workerWorkers?.[0] ?? {})).not.toContain('assignmentId');
    expect(Object.keys(snapshot.workerOccupations?.[0] ?? {})).not.toContain('assignmentId');
    expect(snapshot.workerOccupations?.[0]).toMatchObject({
      workerId: `genesis-001-castle-${castleId}-worker-01`,
      phase: 'gathering'
    });

    composite.unsubscribe();
    expect(core.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pairedWorkers.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps a v11 core Realm live when the additive worker subscription is rejected', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedWorkers } = workerSubscriptionConnection(candidate, []);
    const onApplied = vi.fn();
    const onError = vi.fn();
    const composite = subscribeToWarpkeepRealm(connection, onApplied, onError);

    core.apply();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('workerWorkers');

    pairedWorkers.fail();
    expect(onError).not.toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledTimes(2);
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot).not.toHaveProperty('workerSystem');
    expect(snapshot).not.toHaveProperty('workerWorkers');
    expect(snapshot).not.toHaveProperty('workerOccupations');

    composite.unsubscribe();
    expect(core.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pairedWorkers.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('resets worker availability before a same-connection resubscribe applies', () => {
    const candidate = createCanonicalGenesisCandidate();
    const castleId = candidate.castles[0]!.castleId;
    const workerRows = [1, 2, 3, 4].map((ordinal) => ({
      workerId: `genesis-001-castle-${castleId}-worker-0${ordinal}`,
      originCastleId: BigInt(castleId),
      ordinal,
      status: 'idle',
      resourceKind: undefined,
      siteId: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnStartedAtMicros: undefined,
      returnsAtMicros: undefined,
      routeSteps: undefined,
      returnStartProgressBasisPoints: undefined,
      timelineRevision: 0,
      revision: 0n
    }));
    const { connection, core, pairedWorkers } = workerSubscriptionConnection(
      candidate,
      workerRows
    );
    const first = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    core.apply();
    pairedWorkers.apply();
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID).workerWorkers)
      .toHaveLength(4);

    const secondCore = callbackSubscriptionDouble();
    const secondWorkers = callbackSubscriptionDouble();
    vi.mocked(connection.subscriptionBuilder)
      .mockReturnValueOnce(secondCore.builder as never)
      .mockReturnValueOnce(secondWorkers.builder as never);
    const second = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());

    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('workerWorkers');
    secondCore.apply();
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('workerWorkers');
    secondWorkers.apply();
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID).workerWorkers)
      .toHaveLength(4);

    second.unsubscribe();
    first.unsubscribe();
  });

  it('omits the complete worker graph when public ordinals disagree', () => {
    const candidate = createCanonicalGenesisCandidate();
    const castleId = candidate.castles[0]!.castleId;
    const malformedRows = [1, 2, 3, 4].map((ordinal) => ({
      workerId: `genesis-001-castle-${castleId}-worker-0${ordinal}`,
      originCastleId: BigInt(castleId),
      ordinal: ordinal === 2 ? 1 : ordinal,
      status: 'idle',
      resourceKind: undefined,
      siteId: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnStartedAtMicros: undefined,
      returnsAtMicros: undefined,
      routeSteps: undefined,
      returnStartProgressBasisPoints: undefined,
      timelineRevision: 0,
      revision: 0n
    }));
    const { connection, core, pairedWorkers } = workerSubscriptionConnection(
      candidate,
      malformedRows
    );
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    core.apply();
    pairedWorkers.apply();

    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot).not.toHaveProperty('workerSystem');
    expect(snapshot).not.toHaveProperty('workerWorkers');
    expect(snapshot).not.toHaveProperty('workerOccupations');
    composite.unsubscribe();
  });

  it('adapts generated Q15 Water fields before exact Realm attestation', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedWater } = waterSubscriptionConnection(candidate);
    const onApplied = vi.fn();
    const composite = subscribeToWarpkeepRealm(connection, onApplied, vi.fn());

    expect(pairedWater.builder.subscribe).toHaveBeenCalledWith([
      tables.realmWaterLayoutV1,
      tables.realmWaterBodyV1,
      tables.realmWaterCellV1,
      tables.realmEnvironmentV1
    ]);
    expect(readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID))
      .not.toHaveProperty('waterCells');

    core.apply();
    pairedWater.apply();
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.realmEnvironment).toMatchObject({
      updatedAtMicros: 1_752_408_000_000_000n
    });
    expect(snapshot.realmEnvironment).not.toHaveProperty('updatedAt');
    expect(resolveCanonicalWaterProjection(
      snapshot.waterLayout,
      snapshot.waterBodies,
      snapshot.waterCells,
      snapshot.realmEnvironment
    )).toBe(GENESIS_WATER_CELLS_V1);
    expect(onApplied).toHaveBeenCalledTimes(2);

    composite.unsubscribe();
    expect(core.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pairedWater.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('subscribes and applies the additive river-only Water revision atomically', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedWater } = waterSubscriptionConnection(candidate, [{
      ...CANONICAL_GENESIS_WATER_REVISION_V1,
      activated: true,
      seededAt: timestamp(),
      activatedAt: timestamp()
    }]);
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());

    expect(pairedWater.builder.subscribe).toHaveBeenCalledWith([
      tables.realmWaterLayoutV1,
      tables.realmWaterBodyV1,
      tables.realmWaterCellV1,
      tables.realmEnvironmentV1,
      tables.realmWaterRevisionV1
    ]);
    core.apply();
    pairedWater.apply();
    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.waterRevision).toEqual({
      ...CANONICAL_GENESIS_WATER_REVISION_V1,
      activated: true
    });
    expect(resolveCanonicalWaterProjection(
      snapshot.waterLayout,
      snapshot.waterBodies,
      snapshot.waterCells,
      snapshot.realmEnvironment,
      snapshot.waterRevision
    )).toBe(GENESIS_WATER_REVISION_ENABLED_CELLS_V1);

    composite.unsubscribe();
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

  it('bounds malformed forest iterators before allocating their full projection', () => {
    const candidate = createCanonicalGenesisCandidate();
    const { connection, core, pairedForest } = forestSubscriptionConnection(candidate);
    const db = connection.db as unknown as Record<string, unknown>;
    let layoutReads = 0;
    db.realmForestLayoutV1 = {
      iter: function* () {
        while (true) {
          layoutReads += 1;
          if (layoutReads > 2) throw new Error('layout iterator read past overflow sentinel');
          yield CANONICAL_GENESIS_FOREST_LAYOUT_V1;
        }
      }
    };
    const composite = subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn());
    core.apply();
    pairedForest.apply();

    const oversizedLayout = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(layoutReads).toBe(2);
    expect(oversizedLayout).not.toHaveProperty('forestLayout');
    expect(oversizedLayout.forestTrees).toEqual([]);

    let treeReads = 0;
    db.realmForestLayoutV1 = {
      iter: function* () { yield CANONICAL_GENESIS_FOREST_LAYOUT_V1; }
    };
    db.realmForestInstanceV1 = {
      iter: function* () {
        while (true) {
          treeReads += 1;
          if (treeReads > 211) throw new Error('tree iterator read past overflow sentinel');
          yield CANONICAL_GENESIS_FOREST_INSTANCES_V1[0];
        }
      }
    };

    const oversizedTrees = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(treeReads).toBe(211);
    expect(oversizedTrees).not.toHaveProperty('forestLayout');
    expect(oversizedTrees.forestTrees).toEqual([]);

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
      termsVersion: BROWSER_ALPHA_TERMS_VERSION,
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

  it('keeps Wood dispatch and settlement caller-bound, then reads exact private projections', async () => {
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
    const woodProjection = {
      active: false,
      expeditionId: undefined,
      siteId: undefined,
      originCastleId: undefined,
      phase: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnsAtMicros: undefined,
      accruedWood: 0n,
      pendingWood: 0n,
      creditedWood: 0n,
      rateWoodPerMinute: 1n,
      gatheringDurationMicros: 2_592_000_000_000n,
      expeditionPolicyVersion: undefined
    } as const;
    const connection = {
      procedures: {
        getMyResourceStateV1: vi.fn(async () => resourceProjection),
        getMyWoodExpeditionStateV1: vi.fn(async () => woodProjection)
      },
      reducers: {
        dispatchWoodExpeditionV1: vi.fn(async () => undefined),
        collectWoodExpeditionV1: vi.fn(async () => undefined)
      }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepWoodExpeditionState(connection)).resolves
      .toMatchObject({ active: false, pendingWood: 0n });
    await expect(dispatchWarpkeepWoodExpedition(
      connection,
      'wood:genesis:001',
      '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    )).resolves.toMatchObject({ active: false });
    await expect(collectWarpkeepWoodExpedition(connection, CANONICAL_TEST_FID)).resolves
      .toMatchObject({
        resources: { fid: BigInt(CANONICAL_TEST_FID) },
        woodExpedition: { active: false }
      });
    expect(connection.reducers.dispatchWoodExpeditionV1).toHaveBeenCalledWith({
      siteId: 'wood:genesis:001',
      idempotencyKey: '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    });
    expect(connection.reducers.collectWoodExpeditionV1).toHaveBeenCalledWith({});
    await expect(dispatchWarpkeepWoodExpedition(connection, 'bad site', 'not-valid'))
      .rejects.toThrow('Wood expedition is unavailable.');
    expect(connection.reducers.dispatchWoodExpeditionV1).toHaveBeenCalledTimes(1);
  });

  it('keeps Stone dispatch and settlement caller-bound, then reads exact private projections', async () => {
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
    const stoneProjection = {
      active: false,
      expeditionId: undefined,
      siteId: undefined,
      originCastleId: undefined,
      phase: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnsAtMicros: undefined,
      accruedStone: 0n,
      pendingStone: 0n,
      creditedStone: 0n,
      rateStonePerMinute: 1n,
      gatheringDurationMicros: 2_592_000_000_000n,
      expeditionPolicyVersion: undefined
    } as const;
    const connection = {
      procedures: {
        getMyResourceStateV1: vi.fn(async () => resourceProjection),
        getMyStoneExpeditionStateV1: vi.fn(async () => stoneProjection)
      },
      reducers: {
        dispatchStoneExpeditionV1: vi.fn(async () => undefined),
        collectStoneExpeditionV1: vi.fn(async () => undefined)
      }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepStoneExpeditionState(connection)).resolves
      .toMatchObject({ active: false, pendingStone: 0n });
    await expect(dispatchWarpkeepStoneExpedition(
      connection,
      'stone:genesis:001',
      '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    )).resolves.toMatchObject({ active: false });
    await expect(collectWarpkeepStoneExpedition(connection, CANONICAL_TEST_FID)).resolves
      .toMatchObject({
        resources: { fid: BigInt(CANONICAL_TEST_FID) },
        stoneExpedition: { active: false }
      });
    expect(connection.reducers.dispatchStoneExpeditionV1).toHaveBeenCalledWith({
      siteId: 'stone:genesis:001',
      idempotencyKey: '4a9977d2-c7c4-4d63-8e65-f28f966c0c33'
    });
    expect(connection.reducers.collectStoneExpeditionV1).toHaveBeenCalledWith({});
    await expect(dispatchWarpkeepStoneExpedition(connection, 'bad site', 'not-valid'))
      .rejects.toThrow('Stone expedition is unavailable.');
    expect(connection.reducers.dispatchStoneExpeditionV1).toHaveBeenCalledTimes(1);
  });

  it('pins the browser and authoritative module to the same Terms version', () => {
    expect(BROWSER_ALPHA_TERMS_VERSION).toBe(MODULE_ALPHA_TERMS_VERSION);
    expect(BROWSER_ALPHA_TERMS_VERSION).toBe(
      '2026-07-19-hegemony-entry-agreement-v3'
    );
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

  it('rolls back every earlier listener when observer registration throws', () => {
    const observed = observableConnectionForCandidate(createCanonicalGenesisCandidate());
    observed.worldTileMetaV1.table.onInsert.mockImplementationOnce((listener) => {
      observed.worldTileMetaV1.listeners.insert = listener;
      throw new Error('synthetic observer registration failure');
    });
    observed.worldTileMetaV1.table.removeOnInsert.mockImplementationOnce((listener) => {
      if (observed.worldTileMetaV1.listeners.insert === listener) {
        observed.worldTileMetaV1.listeners.insert = undefined;
      }
    });

    expect(() => observeWarpkeepRealm(
      observed.connection,
      CANONICAL_TEST_FID,
      vi.fn(),
      vi.fn()
    )).toThrow('synthetic observer registration failure');
    expect(observed.worldTile.table.removeOnInsert).toHaveBeenCalledOnce();
    expect(observed.worldTile.table.removeOnDelete).toHaveBeenCalledOnce();
    expect(observed.worldTile.table.removeOnUpdate).toHaveBeenCalledOnce();
    expect(observed.worldTileMetaV1.table.removeOnInsert).toHaveBeenCalledOnce();
    expect(observed.worldTileMetaV1.listeners.insert).toBeUndefined();
    expect(observed.playerV2.table.onInsert).not.toHaveBeenCalled();
  });

  it('continues removing every listener when one generated remover throws', () => {
    const observed = observableConnectionForCandidate(createCanonicalGenesisCandidate());
    observed.realmProfileV1.table.removeOnUpdate.mockImplementationOnce(() => {
      throw new Error('synthetic observer cleanup failure');
    });
    const cleanupObserver = observeWarpkeepRealm(
      observed.connection,
      CANONICAL_TEST_FID,
      vi.fn(),
      vi.fn()
    );

    expect(() => cleanupObserver()).not.toThrow();
    expect(observed.realmProfileV1.table.removeOnDelete).toHaveBeenCalledOnce();
    expect(observed.realmProfileV1.table.removeOnInsert).toHaveBeenCalledOnce();
    expect(observed.worldTile.table.removeOnInsert).toHaveBeenCalledOnce();
    expect(observed.worldTile.table.removeOnDelete).toHaveBeenCalledOnce();
    expect(observed.worldTile.table.removeOnUpdate).toHaveBeenCalledOnce();
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

  it('observes and releases both public Stone tables with the Realm lifecycle', () => {
    const observed = observableConnectionForCandidate(createCanonicalGenesisCandidate());
    const stoneSites = observableTableDouble(CANONICAL_TIER_I_STONE_SITES_V1);
    const stoneOccupations = observableTableDouble<unknown>([]);
    Object.assign(
      (observed.connection.db as unknown as Record<string, unknown>),
      {
        stoneSiteV1: stoneSites.table,
        stoneNodeOccupationV1: stoneOccupations.table
      }
    );
    const cleanup = observeWarpkeepRealm(
      observed.connection,
      CANONICAL_TEST_FID,
      vi.fn(),
      vi.fn()
    );

    cleanup();
    for (const source of [stoneSites.table, stoneOccupations.table]) {
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
