import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  LEGACY_CANONICAL_WORLD_TILES,
} from '../src/world';
import {
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
} from '../src/worldSeedPolicy';

const EMPTY_FOUNDATION = Object.freeze({
  worldTiles: Object.freeze([]),
  realms: Object.freeze([]),
  worldMeta: Object.freeze([]),
  castleSlots: Object.freeze([]),
});

test('a deployed 61-row prefix plans exactly 1,200 outer rows and all v2 sidecars', () => {
  const plan = planCanonicalWorldSeed({
    ...EMPTY_FOUNDATION,
    worldTiles: LEGACY_CANONICAL_WORLD_TILES,
  });

  assert.equal(plan.worldTiles.length, 1_200);
  assert.ok(plan.worldTiles.every(tile => !LEGACY_CANONICAL_WORLD_TILES.includes(tile)));
  assert.equal(plan.realm, CANONICAL_REALM);
  assert.equal(plan.worldMeta.length, 1_261);
  assert.equal(plan.castleSlots.length, 100);
});

test('a complete canonical seed is idempotent and produces no writes', () => {
  const plan = planCanonicalWorldSeed({
    worldTiles: CANONICAL_WORLD_TILES,
    realms: [CANONICAL_REALM],
    worldMeta: CANONICAL_WORLD_TILE_META,
    castleSlots: CANONICAL_CASTLE_SLOTS,
  });

  assert.deepEqual(plan, {
    worldTiles: [],
    realm: undefined,
    worldMeta: [],
    castleSlots: [],
  });
  assert.ok(Object.isFrozen(plan.worldTiles));
  assert.ok(Object.isFrozen(plan.worldMeta));
  assert.ok(Object.isFrozen(plan.castleSlots));
});

test('a partial canonical seed plans only its exact missing rows', () => {
  const plan = planCanonicalWorldSeed({
    worldTiles: CANONICAL_WORLD_TILES.slice(0, -1),
    realms: [CANONICAL_REALM],
    worldMeta: CANONICAL_WORLD_TILE_META.slice(0, -1),
    castleSlots: CANONICAL_CASTLE_SLOTS.slice(0, -1),
  });

  assert.deepEqual(plan.worldTiles, [CANONICAL_WORLD_TILES.at(-1)]);
  assert.equal(plan.realm, undefined);
  assert.deepEqual(plan.worldMeta, [CANONICAL_WORLD_TILE_META.at(-1)]);
  assert.deepEqual(plan.castleSlots, [CANONICAL_CASTLE_SLOTS.at(-1)]);
});

test('terrain, metadata, slot, realm, unknown-row, and duplicate drift all fail closed', () => {
  const center = CANONICAL_WORLD_TILES[0]!;
  const centerMeta = CANONICAL_WORLD_TILE_META[0]!;
  const firstSlot = CANONICAL_CASTLE_SLOTS[0]!;
  const cases = [
    { ...EMPTY_FOUNDATION, worldTiles: [{ ...center, terrainSeed: center.terrainSeed ^ 1 }] },
    { ...EMPTY_FOUNDATION, worldTiles: [center, center] },
    { ...EMPTY_FOUNDATION, worldMeta: [{ ...centerMeta, generationVersion: 99 }] },
    { ...EMPTY_FOUNDATION, worldMeta: [centerMeta, centerMeta] },
    { ...EMPTY_FOUNDATION, castleSlots: [{ ...firstSlot, tileKey: '1,0' }] },
    { ...EMPTY_FOUNDATION, castleSlots: [firstSlot, firstSlot] },
    { ...EMPTY_FOUNDATION, realms: [{ ...CANONICAL_REALM, authoritativeRadius: 4 }] },
    { ...EMPTY_FOUNDATION, realms: [CANONICAL_REALM, CANONICAL_REALM] },
  ];

  for (const snapshot of cases) {
    assert.throws(() => planCanonicalWorldSeed(snapshot), GenesisWorldDriftError);
  }
});
