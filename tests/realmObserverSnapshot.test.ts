import { describe, expect, it, vi } from 'vitest';

import { safeRealmProfileImageUrl } from '../src/components/realm/realmCastlePresentation';
import { isCanonicalGenesisSnapshot } from '../src/spacetime/canonicalGenesisSnapshot';
import {
  REALM_OBSERVER_BROKER_ORIGIN,
  REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH,
  REALM_OBSERVER_SNAPSHOT_URL,
  RealmObserverSnapshotError,
  createRealmObserverHarnessRealm,
  fetchRealmObserverSnapshot,
  parseRealmObserverSnapshot
} from '../src/dev/realmObserverSnapshot';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
} from '../spacetimedb/src/world';

function externalSnapshot() {
  const castles = CANONICAL_CASTLE_SLOTS.slice(0, 2).map((slot, index) => ({
    castleId: index + 11,
    tileKey: slot.tileKey,
    q: slot.q,
    r: slot.r,
    level: index + 1,
    name: index === 0 ? 'Amethyst Bastion' : 'Violet Watch',
    canonicalUsername: index === 0 ? 'ael' : 'violetwarden',
    displayName: index === 0 ? 'Ael' : 'Violet Warden',
    publicBio: 'Public observer presentation.',
    portraitAvailable: index === 0,
    publicStatus: index === 0 ? 'founded' : 'active'
  }));
  return {
    version: 1,
    protocolVersion: 3,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: {
      realmId: CANONICAL_REALM.realmId,
      numericSeed: CANONICAL_REALM.numericSeed,
      generationVersion: CANONICAL_REALM.generationVersion,
      authoritativeRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius,
      playerCapacity: CANONICAL_REALM.playerCapacity
    },
    castles
  };
}

describe('local Realm observer snapshot boundary', () => {
  it('accepts only the exact privacy-bounded contract and freezes every row', () => {
    const parsed = parseRealmObserverSnapshot(externalSnapshot());

    expect(parsed.castles).toHaveLength(2);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.realm)).toBe(true);
    expect(Object.isFrozen(parsed.castles)).toBe(true);
    expect(Object.isFrozen(parsed.castles[0])).toBe(true);
    expect(JSON.stringify(parsed)).not.toMatch(
      /(?:"fid"|ownerFid|identity|token|session|admission|wallet|marks|terms|pfpUrl)/i
    );
  });

  it('rejects extra identity fields, malformed rows, and incompatible attestations', () => {
    const extraTop = { ...externalSnapshot(), fid: 12345 };
    const extraCastle = externalSnapshot();
    extraCastle.castles[0] = { ...extraCastle.castles[0]!, ownerFid: 12345 } as never;
    const movedCastle = externalSnapshot();
    movedCastle.castles[0] = { ...movedCastle.castles[0]!, q: movedCastle.castles[0]!.q + 1 };
    const duplicateCastle = externalSnapshot();
    duplicateCastle.castles[1] = {
      ...duplicateCastle.castles[1]!,
      castleId: duplicateCastle.castles[0]!.castleId
    };

    for (const candidate of [
      extraTop,
      extraCastle,
      movedCastle,
      duplicateCastle,
      { ...externalSnapshot(), worldTileCount: CANONICAL_WORLD_TILES.length - 1 },
      { ...externalSnapshot(), worldSeedName: 'LOOKALIKE' },
      { ...externalSnapshot(), realm: { ...externalSnapshot().realm, renderRadius: 999 } }
    ]) {
      expect(() => parseRealmObserverSnapshot(candidate)).toThrow(RealmObserverSnapshotError);
    }
  });

  it('rejects unsafe display text and arbitrary portrait URLs by construction', () => {
    const unsafeText = externalSnapshot();
    unsafeText.castles[0] = {
      ...unsafeText.castles[0]!,
      displayName: 'Trusted\u202eexe'
    };
    const remotePortrait = externalSnapshot();
    remotePortrait.castles[0] = {
      ...remotePortrait.castles[0]!,
      pfpUrl: 'https://third-party.example/avatar.gif'
    } as never;

    expect(() => parseRealmObserverSnapshot(unsafeText)).toThrow(RealmObserverSnapshotError);
    expect(() => parseRealmObserverSnapshot(remotePortrait)).toThrow(RealmObserverSnapshotError);
  });

  it('creates fresh internal owner keys without changing the player snapshot validator', () => {
    const parsed = parseRealmObserverSnapshot(externalSnapshot());
    const firstRun = createRealmObserverHarnessRealm(parsed, 17);
    const secondRun = createRealmObserverHarnessRealm(parsed, 18);

    expect(firstRun.identity.fid).not.toBe(secondRun.identity.fid);
    expect(firstRun.snapshot.castles.map((castle) => castle.ownerFid))
      .not.toEqual(secondRun.snapshot.castles.map((castle) => castle.ownerFid));
    expect(isCanonicalGenesisSnapshot(firstRun.snapshot, firstRun.identity.fid)).toBe(true);
    expect(firstRun.snapshot.profiles[0]?.pfpUrl).toBe(REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH);
    expect(firstRun.snapshot.profiles[1]?.pfpUrl).toBeUndefined();
    expect(firstRun.snapshot.profiles.every((profile) => !profile.communityStatsVisible)).toBe(true);
  });

  it('resolves the observer portrait marker only to the exact current-origin asset', () => {
    const placeholder = safeRealmProfileImageUrl(REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH);
    expect(placeholder).toBe(new URL(
      REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH,
      window.location.origin
    ).toString());
    expect(safeRealmProfileImageUrl('/images/unreviewed.png')).toBeUndefined();
  });

  it('fetches only the fixed loopback URL without cookies, storage, referrer, or redirects', async () => {
    const response = new Response(JSON.stringify(externalSnapshot()), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
    Object.defineProperty(response, 'url', { value: REALM_OBSERVER_SNAPSHOT_URL });
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(fetchRealmObserverSnapshot(fetchImpl)).resolves.toMatchObject({
      version: 1,
      protocolVersion: 3
    });
    expect(REALM_OBSERVER_SNAPSHOT_URL).toBe(
      `${REALM_OBSERVER_BROKER_ORIGIN}/snapshot`
    );
    expect(fetchImpl).toHaveBeenCalledWith(REALM_OBSERVER_SNAPSHOT_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' }
    });
  });

  it('rejects snapshots that exceed the bounded response size', async () => {
    const advertisedOversize = new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(256 * 1024 + 1)
      }
    });
    Object.defineProperty(advertisedOversize, 'url', { value: REALM_OBSERVER_SNAPSHOT_URL });

    const streamedOversize = new Response('x'.repeat(256 * 1024 + 1), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    Object.defineProperty(streamedOversize, 'url', { value: REALM_OBSERVER_SNAPSHOT_URL });

    for (const response of [advertisedOversize, streamedOversize]) {
      const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;
      await expect(fetchRealmObserverSnapshot(fetchImpl)).rejects.toBeInstanceOf(
        RealmObserverSnapshotError
      );
    }
  });
});
