import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../src/config';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  FOUNDING_DISTRICT_SLOTS,
  GENESIS_BLOCKER_COUNT,
  GENESIS_CASTLE_SLOT_COUNT,
  GENESIS_CORE_SITE_COUNT,
  GENESIS_EMPTY_SITE_COUNT,
  GENESIS_RESOURCE_SITE_COUNT,
  HEGEMONY_GENESIS_001,
  HEGEMONY_WORLD_GENERATION_VERSION,
  HEGEMONY_WORLD_SEED,
  LEGACY_CANONICAL_WORLD_TILES,
  LEGACY_LOWLANDS_RADIUS,
  LOWLANDS_RADIUS,
  canonicalMetaForKey,
  canonicalTileForKey,
  hexDistance,
  hexKey,
  matchesCanonicalCastleSlot,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  neighboringHexes,
} from '../src/world';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function legacyTileDigest(): string {
  return digest(LEGACY_CANONICAL_WORLD_TILES.map(({ key, q, r, biome, terrainSeed }) => (
    [key, q, r, biome, terrainSeed].join('|')
  )).join('\n'));
}

function canonicalGenerationDigest(): string {
  return digest(JSON.stringify({
    realm: CANONICAL_REALM,
    tiles: CANONICAL_WORLD_TILES,
    meta: CANONICAL_WORLD_TILE_META,
    slots: CANONICAL_CASTLE_SLOTS,
  }));
}

function passableAdjacency(): Map<string, readonly string[]> {
  const passable = new Set(
    CANONICAL_WORLD_TILE_META.filter(meta => meta.passable).map(meta => meta.tileKey),
  );
  return new Map([...passable].map(key => {
    const tile = canonicalTileForKey(key)!;
    const neighbors = neighboringHexes(tile)
      .map(coord => hexKey(coord.q, coord.r))
      .filter(candidate => passable.has(candidate));
    return [key, neighbors] as const;
  }));
}

function articulationPoints(graph: ReadonlyMap<string, readonly string[]>): Set<string> {
  let time = 0;
  const discovered = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  const articulation = new Set<string>();

  const visit = (key: string) => {
    discovered.set(key, ++time);
    low.set(key, time);
    let children = 0;
    for (const neighbor of graph.get(key) ?? []) {
      if (!discovered.has(neighbor)) {
        children += 1;
        parent.set(neighbor, key);
        visit(neighbor);
        low.set(key, Math.min(low.get(key)!, low.get(neighbor)!));
        if (!parent.has(key) && children > 1) articulation.add(key);
        if (parent.has(key) && low.get(neighbor)! >= discovered.get(key)!) {
          articulation.add(key);
        }
      } else if (parent.get(key) !== neighbor) {
        low.set(key, Math.min(low.get(key)!, discovered.get(neighbor)!));
      }
    }
  };

  const first = graph.keys().next().value;
  if (first !== undefined) visit(first);
  return articulation;
}

test('Genesis 001 contains exactly 1,261 unique authoritative radius-20 cells', () => {
  assert.equal(CANONICAL_WORLD_TILES.length, 1 + 3 * LOWLANDS_RADIUS * (LOWLANDS_RADIUS + 1));
  assert.equal(CANONICAL_WORLD_TILES.length, 1_261);
  assert.equal(CANONICAL_WORLD_TILES.length - LEGACY_CANONICAL_WORLD_TILES.length, 1_200);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => tile.key)).size, 1_261);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => `${tile.q},${tile.r}`)).size, 1_261);

  for (const tile of CANONICAL_WORLD_TILES) {
    assert.ok(hexDistance(tile) <= LOWLANDS_RADIUS);
    assert.equal(tile.key, hexKey(tile.q, tile.r));
  }
});

test('the original 61 world rows preserve their exact field identity and spawn order', () => {
  assert.equal(LEGACY_CANONICAL_WORLD_TILES.length, 61);
  assert.ok(LEGACY_CANONICAL_WORLD_TILES.every(tile => (
    hexDistance(tile) <= LEGACY_LOWLANDS_RADIUS
  )));
  assert.equal(
    legacyTileDigest(),
    'bf2626063eb79649b493053baf708ddbdbf025df6d4a2338c32a9dedcfeed47c',
  );
  assert.deepEqual(
    CANONICAL_WORLD_TILES.slice(0, 7).map(tile => tile.key),
    ['0,0', '-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0'],
  );
});

test('generation-v2 metadata has exact separate terrain and static-content budgets', () => {
  assert.equal(CANONICAL_WORLD_TILE_META.length, CANONICAL_WORLD_TILES.length);
  const byContent = new Map<string, number>();
  for (const meta of CANONICAL_WORLD_TILE_META) {
    const tile = canonicalTileForKey(meta.tileKey);
    assert.ok(tile);
    assert.equal(meta.s, -tile.q - tile.r);
    assert.equal(meta.ring, hexDistance(tile));
    assert.ok(meta.sector >= 0 && meta.sector <= 6);
    assert.equal(meta.generationVersion, HEGEMONY_WORLD_GENERATION_VERSION);
    assert.equal(meta.passable, meta.movementCost > 0);
    assert.equal(matchesCanonicalWorldMeta(meta), true);
    byContent.set(meta.staticContentKind, (byContent.get(meta.staticContentKind) ?? 0) + 1);
  }

  assert.equal(byContent.get('castle-slot'), GENESIS_CASTLE_SLOT_COUNT);
  assert.equal(byContent.get('resource-capable'), GENESIS_RESOURCE_SITE_COUNT);
  assert.equal(byContent.get('core-capable'), GENESIS_CORE_SITE_COUNT);
  assert.equal(byContent.get('empty'), GENESIS_EMPTY_SITE_COUNT);
  assert.equal(byContent.get('scenic-blocker'), GENESIS_BLOCKER_COUNT);
  assert.equal(byContent.get('reserve'), 176);
  assert.equal(CANONICAL_WORLD_TILE_META.filter(meta => meta.passable).length, 1_101);
  assert.ok(CANONICAL_WORLD_TILE_META
    .filter(meta => ['castle-slot', 'resource-capable', 'core-capable', 'empty'].includes(meta.staticContentKind))
    .every(meta => meta.passable));
});

test('persisted sectors use exact integer axial wedges', () => {
  assert.deepEqual([
    canonicalMetaForKey('1,0')?.sector,
    canonicalMetaForKey('0,1')?.sector,
    canonicalMetaForKey('-1,1')?.sector,
    canonicalMetaForKey('-1,0')?.sector,
    canonicalMetaForKey('0,-1')?.sector,
    canonicalMetaForKey('1,-1')?.sector,
  ], [1, 2, 3, 4, 5, 6]);
});

test('exactly 100 valid castle slots span the realm and retain three nearby founding slots', () => {
  assert.equal(CANONICAL_CASTLE_SLOTS.length, GENESIS_CASTLE_SLOT_COUNT);
  assert.equal(new Set(CANONICAL_CASTLE_SLOTS.map(slot => slot.slotId)).size, 100);
  assert.equal(new Set(CANONICAL_CASTLE_SLOTS.map(slot => slot.tileKey)).size, 100);
  assert.deepEqual(
    FOUNDING_DISTRICT_SLOTS.map(slot => [slot.q, slot.r]),
    [[0, 0], [2, -1], [-1, 2]],
  );
  assert.deepEqual([
    hexDistance(FOUNDING_DISTRICT_SLOTS[0]!, FOUNDING_DISTRICT_SLOTS[1]!),
    hexDistance(FOUNDING_DISTRICT_SLOTS[0]!, FOUNDING_DISTRICT_SLOTS[2]!),
    hexDistance(FOUNDING_DISTRICT_SLOTS[1]!, FOUNDING_DISTRICT_SLOTS[2]!),
  ], [2, 2, 3]);

  const sectors = new Set<number>();
  for (const slot of CANONICAL_CASTLE_SLOTS) {
    const tile = canonicalTileForKey(slot.tileKey);
    const meta = canonicalMetaForKey(slot.tileKey);
    assert.ok(tile && meta);
    assert.equal(slot.q, tile.q);
    assert.equal(slot.r, tile.r);
    assert.equal(meta.staticContentKind, 'castle-slot');
    assert.equal(meta.passable, true);
    assert.ok(meta.ring <= LOWLANDS_RADIUS - 2);
    assert.equal(matchesCanonicalCastleSlot(slot), true);
    if (meta.sector > 0) sectors.add(meta.sector);

    const emptyNeighbors = neighboringHexes(slot).filter(coord => (
      canonicalMetaForKey(hexKey(coord.q, coord.r))?.staticContentKind === 'empty'
    ));
    assert.ok(emptyNeighbors.length >= 3);
  }
  assert.deepEqual([...sectors].sort(), [1, 2, 3, 4, 5, 6]);

  for (let index = 3; index < CANONICAL_CASTLE_SLOTS.length; index += 1) {
    const slot = CANONICAL_CASTLE_SLOTS[index]!;
    const previous = CANONICAL_CASTLE_SLOTS.slice(0, index);
    assert.ok(
      Math.min(...previous.map(candidate => hexDistance(slot, candidate))) <= 4,
      `slot ${slot.slotId} must remain close to the established district`,
    );
    assert.ok(hexDistance(slot) >= hexDistance(CANONICAL_CASTLE_SLOTS[index - 1]!));
  }

  for (let first = 0; first < CANONICAL_CASTLE_SLOTS.length; first += 1) {
    for (let second = first + 1; second < CANONICAL_CASTLE_SLOTS.length; second += 1) {
      assert.ok(hexDistance(CANONICAL_CASTLE_SLOTS[first]!, CANONICAL_CASTLE_SLOTS[second]!) >= 2);
    }
  }
});

test('all passable cells and castle slots share one robust component without articulation points', () => {
  const graph = passableAdjacency();
  const first = graph.keys().next().value!;
  const seen = new Set<string>();
  const pending = [first];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...(graph.get(key) ?? []));
  }

  assert.equal(seen.size, graph.size);
  assert.ok(CANONICAL_CASTLE_SLOTS.every(slot => seen.has(slot.tileKey)));
  assert.deepEqual([...articulationPoints(graph)], []);
});

test('canonical matchers fail closed and the full generation is drift-pinned', () => {
  const center = canonicalTileForKey('0,0');
  const centerMeta = canonicalMetaForKey('0,0');
  assert.ok(center && centerMeta);
  assert.equal(matchesCanonicalTerrain(center), true);
  assert.equal(matchesCanonicalTerrain({ ...center, terrainSeed: center.terrainSeed ^ 1 }), false);
  assert.equal(matchesCanonicalTerrain({ ...center, key: '20,20' }), false);
  assert.equal(matchesCanonicalWorldMeta({ ...centerMeta, movementCost: 99 }), false);
  assert.equal(matchesCanonicalCastleSlot({ ...CANONICAL_CASTLE_SLOTS[0]!, tileKey: '1,0' }), false);
  assert.equal(
    canonicalGenerationDigest(),
    '79ff57deceab26e0d8ae29019786f7cb8a3976a9f81e259d3e4c2b9be3315d11',
  );
});

test('backend, auth, and world generation versions remain independent', () => {
  assert.equal(WARPKEEP_BACKEND_PROTOCOL_VERSION, 3);
  assert.equal(HEGEMONY_WORLD_GENERATION_VERSION, 2);
  assert.equal(HEGEMONY_GENESIS_001, 'HEGEMONY_GENESIS_001');
  assert.equal(HEGEMONY_WORLD_SEED, 3_445_214_658);
});
