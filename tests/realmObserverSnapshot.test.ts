import { describe, expect, it } from 'vitest';

import { safeRealmProfileImageUrl } from '../src/components/realm/realmCastlePresentation';
import { isCanonicalGenesisSnapshot } from '../src/spacetime/canonicalGenesisSnapshot';
import {
  REALM_OBSERVER_FIXTURE_OWNER_SEED,
  REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH,
  RealmObserverSnapshotError,
  createRealmObserverFixtureRealm,
  createRealmObserverHarnessRealm,
  parseRealmObserverSnapshot,
  realmObserverFixtureSnapshot
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
    name: index === 0 ? 'Observer Bastion' : 'Observer Watch',
    canonicalUsername: index === 0 ? 'observer-one' : 'observer-two',
    displayName: index === 0 ? 'Observer One' : 'Observer Two',
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

describe('local Realm observer fixture boundary', () => {
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

  it('uses one deterministic, FID-free browser fixture and derives only internal renderer keys', () => {
    const fixture = realmObserverFixtureSnapshot();
    const firstRealm = createRealmObserverFixtureRealm();
    const secondRealm = createRealmObserverFixtureRealm();

    expect(realmObserverFixtureSnapshot()).toBe(fixture);
    expect(fixture.castles).toHaveLength(4);
    expect(fixture.castles[0]?.portraitAvailable).toBe(true);
    expect(fixture.castles.slice(1).every((castle) => !castle.portraitAvailable)).toBe(true);
    expect(JSON.stringify(fixture)).not.toMatch(
      /(?:"fid"|ownerFid|identity|token|session|admission|wallet|marks|terms|pfpUrl)/i
    );
    expect(firstRealm.identity.fid).toBe(secondRealm.identity.fid);
    expect(firstRealm.snapshot.castles.map((castle) => castle.ownerFid))
      .toEqual(secondRealm.snapshot.castles.map((castle) => castle.ownerFid));
    expect(firstRealm.identity.fid).toBe(
      createRealmObserverHarnessRealm(fixture, REALM_OBSERVER_FIXTURE_OWNER_SEED).identity.fid
    );
  });

  it('resolves the observer portrait marker only to the exact current-origin asset', () => {
    const placeholder = safeRealmProfileImageUrl(REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH);
    expect(placeholder).toBe(new URL(
      REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH,
      window.location.origin
    ).toString());
    expect(safeRealmProfileImageUrl('/images/unreviewed.png')).toBeUndefined();
  });

});
