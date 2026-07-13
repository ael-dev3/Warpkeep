import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DbConnection, tables } from '../src/spacetime/module_bindings';
import {
  connectWarpkeep,
  bootstrapWarpkeepPlayer,
  createWarpkeepConnectionBuilder,
  disconnectWarpkeep,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepRealmSnapshot,
  subscribeToWarpkeepRealm,
  type WarpkeepConnection
} from '../src/spacetime/warpkeepConnection';
import type { WarpkeepRuntimeConfig } from '../src/spacetime/warpkeepConfig';

const config: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'warpkeep-89e4u',
  bridgeUrl: 'https://auth.warpkeep.example',
  issuer: 'https://auth.warpkeep.example',
  audience: 'warpkeep-spacetimedb',
  sharedAlphaEnabled: true
});

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

  it('subscribes only to the three admission-gated public tables', () => {
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
      tables.playerV2,
      tables.castle
    ]);
  });

  it('uses only the versioned admission procedure and bootstrap reducer', async () => {
    const connection = {
      procedures: {
        getMyAdmissionStatusV2: vi.fn(async () => 'admitted_needs_bootstrap')
      },
      reducers: {
        bootstrapPlayerV2: vi.fn(async () => undefined)
      }
    } as unknown as WarpkeepConnection;

    await expect(readWarpkeepAdmissionStatus(connection)).resolves.toBe('admitted_needs_bootstrap');
    await bootstrapWarpkeepPlayer(connection);
    expect(connection.procedures.getMyAdmissionStatusV2).toHaveBeenCalledWith({});
    expect(connection.reducers.bootstrapPlayerV2).toHaveBeenCalledWith({});
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
      protocolVersion: 2,
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
    const connection = {
      db: {
        worldTile: { iter: function* () { yield {
          key: '0,0', q: 0, r: 0, biome: 'temperate-lowland', terrainSeed: 1, occupantCastleId: 1n
        }; } },
        playerV2: { iter: function* () { yield { fid: 12_345n, username: 'keeper', displayName: undefined, pfpUrl: undefined, status: 'active' }; } },
        castle: { iter: function* () {
          yield { castleId: 1n, ownerFid: 12_345n, tileKey: '0,0', q: 0, r: 0, level: 1, name: 'Token Keep' };
          yield { castleId: 2n, ownerFid: 77n, tileKey: '1,0', q: 1, r: 0, level: 1, name: 'Peer Keep' };
        } }
      }
    } as unknown as WarpkeepConnection;

    const snapshot = readWarpkeepRealmSnapshot(connection, 12_345);
    expect(snapshot.ownCastle?.name).toBe('Token Keep');
    expect(snapshot.castles).toHaveLength(2);
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
