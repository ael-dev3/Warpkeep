import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_WORLD_TILES,
  HEGEMONY_GENESIS_001,
  HEGEMONY_WORLD_SEED,
  LOWLANDS_RADIUS,
  canonicalTileForKey,
  matchesCanonicalTerrain,
} from '../src/world';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../src/config';

test('the authoritative Lowlands disc contains exactly 61 unique radius-four tiles', () => {
  assert.equal(CANONICAL_WORLD_TILES.length, 61);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => tile.key)).size, 61);

  for (const tile of CANONICAL_WORLD_TILES) {
    assert.ok(Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(-tile.q - tile.r)) <= LOWLANDS_RADIUS);
  }
});

test('the first seven deterministic spawns fill the center and adjacent ring', () => {
  assert.deepEqual(
    CANONICAL_WORLD_TILES.slice(0, 7).map(tile => tile.key),
    ['0,0', '-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0'],
  );
});

test('canonical terrain checks reject a coordinate or seed mismatch', () => {
  const center = canonicalTileForKey('0,0');
  assert.ok(center);
  assert.equal(matchesCanonicalTerrain(center), true);
  assert.equal(matchesCanonicalTerrain({ ...center, terrainSeed: center.terrainSeed ^ 1 }), false);
  assert.equal(matchesCanonicalTerrain({ ...center, key: '4,4' }), false);
});

test('backend compatibility metadata is stable and distinct from the player-facing release version', () => {
  assert.equal(WARPKEEP_BACKEND_PROTOCOL_VERSION, 2);
  assert.equal(HEGEMONY_GENESIS_001, 'HEGEMONY_GENESIS_001');
  assert.equal(HEGEMONY_WORLD_SEED, 3_445_214_658);
});
