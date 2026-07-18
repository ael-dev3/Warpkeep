import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  GENESIS_GENERATION_V2_WORLD_TILES,
  LEGACY_CANONICAL_WORLD_TILES,
} from '../src/world';
import {
  classifyGenesisStaticSnapshot,
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
} from '../src/worldSeedPolicy';

const EMPTY_FOUNDATION = Object.freeze({
  worldTiles: Object.freeze([]),
  realms: Object.freeze([]),
  worldMeta: Object.freeze([]),
  castleSlots: Object.freeze([]),
});

test('the rollout snapshot classifier accepts only exact complete v2 or v3 state', () => {
  const generationV2 = {
    worldTiles: GENESIS_GENERATION_V2_WORLD_TILES,
    realms: [GENESIS_GENERATION_V2_REALM],
    worldMeta: GENESIS_GENERATION_V2_WORLD_TILE_META,
    castleSlots: CANONICAL_CASTLE_SLOTS,
  };
  const generationV3 = {
    worldTiles: CANONICAL_WORLD_TILES,
    realms: [CANONICAL_REALM],
    worldMeta: CANONICAL_WORLD_TILE_META,
    castleSlots: CANONICAL_CASTLE_SLOTS,
  };
  assert.equal(classifyGenesisStaticSnapshot(generationV2), 'generation-v2');
  assert.equal(classifyGenesisStaticSnapshot(generationV3), 'generation-v3');

  const sameCountMixedWorld = [
    ...GENESIS_GENERATION_V2_WORLD_TILES.slice(0, -1),
    CANONICAL_WORLD_TILES[GENESIS_GENERATION_V2_WORLD_TILES.length]!,
  ];
  assert.equal(classifyGenesisStaticSnapshot({
    ...generationV2,
    worldTiles: sameCountMixedWorld,
  }), 'invalid');
  assert.equal(classifyGenesisStaticSnapshot({
    ...generationV2,
    worldMeta: GENESIS_GENERATION_V2_WORLD_TILE_META.slice(0, -1),
  }), 'invalid');
  assert.equal(classifyGenesisStaticSnapshot({
    ...generationV2,
    realms: [CANONICAL_REALM],
  }), 'invalid');
});

test('an original 61-row prefix plans the complete generation-v3 foundation', () => {
  const plan = planCanonicalWorldSeed({
    ...EMPTY_FOUNDATION,
    worldTiles: LEGACY_CANONICAL_WORLD_TILES,
  });

  assert.equal(plan.worldTiles.length, 9_939);
  assert.ok(plan.worldTiles.every(tile => !LEGACY_CANONICAL_WORLD_TILES.includes(tile)));
  assert.deepEqual(plan.realmTransition, { kind: 'insert', realm: CANONICAL_REALM });
  assert.equal(plan.worldMeta.length, 10_000);
  assert.equal(plan.castleSlots.length, 100);
});

test('the exact deployed v2 state plans only an additive v3 expansion and realm CAS', () => {
  const plan = planCanonicalWorldSeed({
    worldTiles: GENESIS_GENERATION_V2_WORLD_TILES,
    realms: [GENESIS_GENERATION_V2_REALM],
    worldMeta: GENESIS_GENERATION_V2_WORLD_TILE_META,
    castleSlots: CANONICAL_CASTLE_SLOTS,
  });

  assert.equal(plan.worldTiles.length, 8_739);
  assert.ok(plan.worldTiles.every(tile => !GENESIS_GENERATION_V2_WORLD_TILES.includes(tile)));
  assert.deepEqual(plan.realmTransition, {
    kind: 'update',
    previous: GENESIS_GENERATION_V2_REALM,
    realm: CANONICAL_REALM,
  });
  assert.equal(plan.worldMeta.length, 8_739);
  assert.ok(plan.worldMeta.every(meta => meta.generationVersion === 3));
  assert.deepEqual(plan.castleSlots, []);
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
    realmTransition: { kind: 'none' },
    worldMeta: [],
    castleSlots: [],
  });
  assert.ok(Object.isFrozen(plan.worldTiles));
  assert.ok(Object.isFrozen(plan.realmTransition));
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
  assert.deepEqual(plan.realmTransition, { kind: 'none' });
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
