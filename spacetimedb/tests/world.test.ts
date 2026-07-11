import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_WORLD_TILES,
  LOWLANDS_RADIUS,
  canonicalTileForKey,
  matchesCanonicalTerrain,
} from '../src/world';

test('the authoritative Lowlands disc contains exactly 61 unique radius-four tiles', () => {
  assert.equal(CANONICAL_WORLD_TILES.length, 61);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => tile.key)).size, 61);

  for (const tile of CANONICAL_WORLD_TILES) {
    assert.ok(Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(-tile.q - tile.r)) <= LOWLANDS_RADIUS);
  }
});

test('the first deterministic spawn is the central 0,0 tile', () => {
  assert.deepEqual(CANONICAL_WORLD_TILES[0].key, '0,0');
});

test('canonical terrain checks reject a coordinate or seed mismatch', () => {
  const center = canonicalTileForKey('0,0');
  assert.ok(center);
  assert.equal(matchesCanonicalTerrain(center), true);
  assert.equal(matchesCanonicalTerrain({ ...center, terrainSeed: center.terrainSeed ^ 1 }), false);
  assert.equal(matchesCanonicalTerrain({ ...center, key: '4,4' }), false);
});
