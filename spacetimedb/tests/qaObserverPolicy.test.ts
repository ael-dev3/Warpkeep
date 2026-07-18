import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QA_OBSERVER_MAX_CASTLES,
  QaObserverSnapshotError,
  buildQaObserverRealmAttestationV2,
  type QaObserverSnapshotSource,
} from '../src/qaObserverPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
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

function generationV2Fixture(castleCount = 2): QaObserverSnapshotSource {
  const current = arrays(fixture(castleCount));
  const occupantByTile = new Map(
    current.castles.map(castle => [castle.tileKey, castle.castleId]),
  );
  return {
    ...current,
    worldTiles: GENESIS_GENERATION_V2_WORLD_TILES.map(tile => ({
      ...tile,
      occupantCastleId: occupantByTile.get(tile.key),
    })),
    worldMeta: GENESIS_GENERATION_V2_WORLD_TILE_META,
    realms: [GENESIS_GENERATION_V2_REALM],
  };
}

function assertInvalid(source: QaObserverSnapshotSource): void {
  assert.throws(
    () => buildQaObserverRealmAttestationV2(source, 3),
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

test('builds an exact bounded v2 aggregate attestation with no player or castle projection', () => {
  const attestation = buildQaObserverRealmAttestationV2(fixture(), 3);
  assert.deepEqual(Object.keys(attestation), [
    'version',
    'protocolVersion',
    'worldSeed',
    'worldSeedName',
    'worldTileCount',
    'worldTileMetaCount',
    'realm',
    'aggregates',
  ]);
  assert.deepEqual(Object.keys(attestation.realm), [
    'realmId',
    'numericSeed',
    'generationVersion',
    'authoritativeRadius',
    'renderRadius',
    'playerCapacity',
  ]);
  assert.deepEqual(Object.keys(attestation.aggregates), [
    'castleCount',
    'profileCount',
    'foundedCount',
    'activeCount',
  ]);
  assert.equal(attestation.version, 2);
  assert.equal(attestation.realm.realmId, CANONICAL_REALM.realmId);
  assert.deepEqual(attestation.aggregates, {
    castleCount: 2,
    profileCount: 2,
    foundedCount: 1,
    activeCount: 1,
  });

  const keys = collectObjectKeys(attestation);
  for (const forbidden of [
    'castles', 'profiles', 'castleId', 'ownerFid', 'tileKey', 'q', 'r',
    'level', 'name', 'canonicalUsername', 'displayName', 'portraitAvailable',
    'publicBio', 'publicStatus', 'pfpUrl', 'identity', 'admission', 'ownership',
    'terms', 'wallet', 'audit',
  ]) {
    assert.equal(
      keys.has(forbidden),
      false,
      `forbidden output key: ${forbidden}`,
    );
  }
  const serialized = JSON.stringify(attestation);
  for (const forbiddenValue of [
    'founder.one', 'Founder One', 'Building in Genesis 001.',
    'https://cdn.example.test/founder-one.png', 'Keep 1', '10001',
  ]) assert.equal(serialized.includes(forbiddenValue), false);
});

test('emits the exact generation-v2 state during the bounded v3 rollout window', () => {
  const attestation = buildQaObserverRealmAttestationV2(generationV2Fixture(), 3);
  assert.equal(attestation.worldTileCount, 1_261);
  assert.equal(attestation.worldTileMetaCount, 1_261);
  assert.deepEqual(attestation.realm, {
    realmId: 'GENESIS_001',
    numericSeed: 3_445_214_658,
    generationVersion: 2,
    authoritativeRadius: 20,
    renderRadius: 22,
    playerCapacity: 100,
  });
});

test('returns only stable aggregate counts and permits no more than 100 founders', () => {
  const source = arrays(fixture(QA_OBSERVER_MAX_CASTLES));
  source.castles.reverse();
  source.profiles.reverse();
  const attestation = buildQaObserverRealmAttestationV2(source, 3);
  assert.deepEqual(attestation.aggregates, {
    castleCount: 100,
    profileCount: 100,
    foundedCount: 99,
    activeCount: 1,
  });
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

  const mixedV3TilesV2Realm = arrays(fixture());
  mixedV3TilesV2Realm.realms[0] = GENESIS_GENERATION_V2_REALM;
  assertInvalid(mixedV3TilesV2Realm);

  const mixedV2TilesV3Realm = arrays(generationV2Fixture());
  mixedV2TilesV3Realm.realms[0] = CANONICAL_REALM;
  assertInvalid(mixedV2TilesV3Realm);

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
      () => buildQaObserverRealmAttestationV2(fixture(), protocolVersion),
      QaObserverSnapshotError,
    );
  }
});
