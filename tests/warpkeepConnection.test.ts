import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DbConnection,
  tables,
  type EventContext
} from '../src/spacetime/module_bindings';
import {
  acceptWarpkeepAlphaTerms,
  connectWarpkeep,
  bootstrapWarpkeepPlayer,
  createWarpkeepConnectionBuilder,
  disconnectWarpkeep,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
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

  it('subscribes only to the six admission-gated public realm projections', () => {
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

    expect(subscribeToWarpkeepRealm(connection, vi.fn(), vi.fn())).toBe(subscription);
    expect(subscriptionBuilder.subscribe).toHaveBeenCalledWith([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);
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

  it('derives the own castle from the bridge-token FID passed by the provider', () => {
    const candidate = createCanonicalGenesisCandidate({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    const connection = connectionForCandidate(candidate);

    const snapshot = readWarpkeepRealmSnapshot(connection, CANONICAL_TEST_FID);
    expect(snapshot.ownCastle.name).toBe('Warpkeeper Bastion');
    expect(snapshot.castles).toHaveLength(2);
    expect(snapshot.tiles).toHaveLength(1_261);
    expect(snapshot.tileMetadata).toHaveLength(1_261);
  });

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
    expect(snapshot.tiles).toHaveLength(1_261);
    expect(snapshot.tileMetadata).toHaveLength(1_261);
    expect(snapshot.ownCastle.ownerFid).toBe(CANONICAL_TEST_FID);
    expect(snapshot).not.toHaveProperty('identity');
    expect(snapshot).not.toHaveProperty('wallet');
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
    type Listener = (context: EventContext, ...rows: unknown[]) => void;
    const candidate = createCanonicalGenesisCandidate();
    const rows = rawRowsForCandidate(candidate);
    const tableDouble = <T,>(initialValues: readonly T[]) => {
      const values = [...initialValues];
      const listeners: {
        insert?: Listener;
        delete?: Listener;
        update?: Listener;
      } = {};
      return {
        listeners,
        values,
        table: {
          iter: function* () { yield* values; },
          onInsert: vi.fn((listener: Listener) => { listeners.insert = listener; }),
          onDelete: vi.fn((listener: Listener) => { listeners.delete = listener; }),
          onUpdate: vi.fn((listener: Listener) => { listeners.update = listener; }),
          removeOnInsert: vi.fn(),
          removeOnDelete: vi.fn(),
          removeOnUpdate: vi.fn()
        }
      };
    };
    const worldTile = tableDouble(rows.worldTile);
    const worldTileMetaV1 = tableDouble(rows.worldTileMetaV1);
    const playerV2 = tableDouble(rows.playerV2);
    const castle = tableDouble(rows.castle);
    const realmV1 = tableDouble(rows.realmV1);
    const realmProfileV1 = tableDouble(rows.realmProfileV1);
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
    expect(onChange.mock.calls[0]?.[0].tiles).toHaveLength(1_261);

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
