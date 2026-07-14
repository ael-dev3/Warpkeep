import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QA_OBSERVER_MAX_CASTLES,
  QaObserverSnapshotError,
  buildQaObserverRealmSnapshot,
  type QaObserverSnapshotSource,
} from '../src/qaObserverPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
} from '../src/world';

function fixture(castleCount = 2): QaObserverSnapshotSource {
  const castles = CANONICAL_CASTLE_SLOTS.slice(0, castleCount).map((slot, index) => ({
    castleId: BigInt(index + 1),
    ownerFid: BigInt(10_000 + index),
    tileKey: slot.tileKey,
    q: slot.q,
    r: slot.r,
    level: 1,
    name: `Keep ${index + 1}`,
  }));
  const occupantByTile = new Map(castles.map(castle => [castle.tileKey, castle.castleId]));
  return {
    worldTiles: CANONICAL_WORLD_TILES.map(tile => ({
      ...tile,
      occupantCastleId: occupantByTile.get(tile.key),
    })),
    worldMeta: CANONICAL_WORLD_TILE_META,
    realms: [CANONICAL_REALM],
    castleSlots: CANONICAL_CASTLE_SLOTS,
    castles,
    profiles: castles.map((castle, index) => ({
      fid: castle.ownerFid,
      ...(index === 0 ? {
        canonicalUsername: 'founder.one',
        displayName: 'Founder One',
        pfpUrl: 'https://cdn.example.test/founder-one.png',
        publicBio: 'Building in Genesis 001.',
      } : {}),
      publicStatus: index === 0 ? 'active' : 'founded',
    })),
  };
}

function arrays(source: QaObserverSnapshotSource) {
  return {
    worldTiles: [...source.worldTiles],
    worldMeta: [...source.worldMeta],
    realms: [...source.realms],
    castleSlots: [...source.castleSlots],
    castles: [...source.castles],
    profiles: [...source.profiles],
  };
}

function assertInvalid(source: QaObserverSnapshotSource): void {
  assert.throws(
    () => buildQaObserverRealmSnapshot(source, 3),
    (error: unknown) => error instanceof QaObserverSnapshotError
      && error.message === 'QA_OBSERVER_SNAPSHOT_INVALID',
  );
}

function collectObjectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, into);
    return into;
  }
  for (const [key, nested] of Object.entries(value)) {
    into.add(key);
    collectObjectKeys(nested, into);
  }
  return into;
}

test('builds the exact bounded v1 projection while withholding private join keys and PFP URLs', () => {
  const snapshot = buildQaObserverRealmSnapshot(fixture(), 3);
  assert.deepEqual(Object.keys(snapshot), [
    'version',
    'protocolVersion',
    'worldSeed',
    'worldSeedName',
    'worldTileCount',
    'worldTileMetaCount',
    'realm',
    'castles',
  ]);
  assert.deepEqual(Object.keys(snapshot.realm), [
    'realmId',
    'numericSeed',
    'generationVersion',
    'authoritativeRadius',
    'renderRadius',
    'playerCapacity',
  ]);
  assert.deepEqual(Object.keys(snapshot.castles[0]!), [
    'castleId',
    'tileKey',
    'q',
    'r',
    'level',
    'name',
    'canonicalUsername',
    'displayName',
    'portraitAvailable',
    'publicBio',
    'publicStatus',
  ]);
  assert.deepEqual(Object.keys(snapshot.castles[1]!), [
    'castleId',
    'tileKey',
    'q',
    'r',
    'level',
    'name',
    'portraitAvailable',
    'publicStatus',
  ]);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.realm.realmId, CANONICAL_REALM.realmId);
  assert.equal(snapshot.castles[0]!.portraitAvailable, true);
  assert.equal(snapshot.castles[1]!.portraitAvailable, false);

  const keys = collectObjectKeys(snapshot);
  for (const forbidden of [
    'fid',
    'identity',
    'admission',
    'ownership',
    'terms',
    'wallet',
    'audit',
    'mark',
    'timestamp',
    'pfp',
    'url',
    'burn',
  ]) {
    assert.equal(
      [...keys].some(key => key.toLowerCase().includes(forbidden)),
      false,
      `forbidden output key fragment: ${forbidden}`,
    );
  }
});

test('sorts by castle ID deterministically and permits no more than 100 projections', () => {
  const source = arrays(fixture(QA_OBSERVER_MAX_CASTLES));
  source.castles.reverse();
  source.profiles.reverse();
  const snapshot = buildQaObserverRealmSnapshot(source, 3);
  assert.equal(snapshot.castles.length, 100);
  assert.deepEqual(
    snapshot.castles.map(castle => castle.castleId),
    Array.from({ length: 100 }, (_, index) => BigInt(index + 1)),
  );
});

test('fails closed when the realm contains no castle projection', () => {
  assertInvalid(fixture(0));
});

test('fails closed on canonical static-state or castle-link drift', () => {
  const missingMeta = arrays(fixture());
  missingMeta.worldMeta.pop();
  assertInvalid(missingMeta);

  const changedTerrain = arrays(fixture());
  changedTerrain.worldTiles[0] = { ...changedTerrain.worldTiles[0]!, terrainSeed: 0 };
  assertInvalid(changedTerrain);

  const changedRealm = arrays(fixture());
  changedRealm.realms[0] = { ...CANONICAL_REALM, realmId: 'OTHER_REALM' };
  assertInvalid(changedRealm);

  const missingSlot = arrays(fixture());
  missingSlot.castleSlots.pop();
  assertInvalid(missingSlot);

  const brokenOccupancy = arrays(fixture());
  const occupiedIndex = brokenOccupancy.worldTiles.findIndex(
    tile => tile.occupantCastleId !== undefined,
  );
  brokenOccupancy.worldTiles[occupiedIndex] = {
    ...brokenOccupancy.worldTiles[occupiedIndex]!,
    occupantCastleId: undefined,
  };
  assertInvalid(brokenOccupancy);

  const brokenCastleCoordinates = arrays(fixture());
  brokenCastleCoordinates.castles[0] = { ...brokenCastleCoordinates.castles[0]!, q: 999 };
  assertInvalid(brokenCastleCoordinates);
});

test('fails closed on missing, extra, duplicated, or mismatched profile joins', () => {
  const missing = arrays(fixture());
  missing.profiles.pop();
  assertInvalid(missing);

  const extra = arrays(fixture());
  extra.profiles.push({ fid: 999_999n, publicStatus: 'active' });
  assertInvalid(extra);

  const duplicateProfile = arrays(fixture());
  duplicateProfile.profiles.push(duplicateProfile.profiles[0]!);
  assertInvalid(duplicateProfile);

  const mismatched = arrays(fixture());
  mismatched.profiles[0] = { ...mismatched.profiles[0]!, fid: 777n };
  assertInvalid(mismatched);

  const duplicateOwner = arrays(fixture());
  duplicateOwner.castles[1] = {
    ...duplicateOwner.castles[1]!,
    ownerFid: duplicateOwner.castles[0]!.ownerFid,
  };
  assertInvalid(duplicateOwner);
});

test('fails closed on unsanitized public profile data, PFP authority drift, status drift, or castle labels', () => {
  const unsanitizedDisplay = arrays(fixture());
  unsanitizedDisplay.profiles[0] = {
    ...unsanitizedDisplay.profiles[0]!,
    displayName: '  Founder One  ',
  };
  assertInvalid(unsanitizedDisplay);

  const invalidPfp = arrays(fixture());
  invalidPfp.profiles[0] = {
    ...invalidPfp.profiles[0]!,
    pfpUrl: 'http://cdn.example.test/founder-one.png',
  };
  assertInvalid(invalidPfp);

  const invalidStatus = arrays(fixture());
  invalidStatus.profiles[0] = {
    ...invalidStatus.profiles[0]!,
    publicStatus: 'admin',
  };
  assertInvalid(invalidStatus);

  const unsafeName = arrays(fixture());
  unsafeName.castles[0] = {
    ...unsafeName.castles[0]!,
    name: '<script>unsafe</script> Keep',
  };
  assertInvalid(unsafeName);

  const overLimit = arrays(fixture(0));
  overLimit.castles = CANONICAL_WORLD_TILES.slice(0, 101).map((tile, index) => ({
    castleId: BigInt(index + 1),
    ownerFid: BigInt(20_000 + index),
    tileKey: tile.key,
    q: tile.q,
    r: tile.r,
    level: 1,
    name: `Keep ${index + 1}`,
  }));
  const overLimitOccupants = new Map(
    overLimit.castles.map(castle => [castle.tileKey, castle.castleId]),
  );
  overLimit.worldTiles = CANONICAL_WORLD_TILES.map(tile => ({
    ...tile,
    occupantCastleId: overLimitOccupants.get(tile.key),
  }));
  overLimit.profiles = overLimit.castles.map(castle => ({
    fid: castle.ownerFid,
    publicStatus: 'founded',
  }));
  assertInvalid(overLimit);
});

test('rejects an invalid protocol version without inspecting a snapshot', () => {
  for (const protocolVersion of [
    -1,
    0.5,
    0x1_0000_0000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(
      () => buildQaObserverRealmSnapshot(fixture(), protocolVersion),
      QaObserverSnapshotError,
    );
  }
});
