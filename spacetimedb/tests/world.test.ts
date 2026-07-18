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
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  GENESIS_CASTLE_SLOT_COUNT,
  GENESIS_CORE_SITE_COUNT,
  GENESIS_EMPTY_SITE_COUNT,
  GENESIS_FULL_DISC_RADIUS,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_RADIUS,
  GENESIS_GENERATION_V2_VERSION,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  GENESIS_GENERATION_V2_WORLD_TILES,
  GENESIS_PARTIAL_OUTER_RING_SECTOR_COUNTS,
  GENESIS_PARTIAL_OUTER_RING_TILES,
  GENESIS_RESOURCE_SITE_COUNT,
  GENESIS_RESERVE_SITE_COUNT,
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
  matchesGenerationV2Realm,
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

function generationV2Digest(value: unknown): string {
  return digest(JSON.stringify(value));
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
  type Frame = { key: string; neighbors: readonly string[]; next: number; children: number };

  for (const root of graph.keys()) {
    if (discovered.has(root)) continue;
    discovered.set(root, ++time);
    low.set(root, time);
    const stack: Frame[] = [{
      key: root,
      neighbors: graph.get(root) ?? [],
      next: 0,
      children: 0,
    }];

    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      const neighbor = frame.neighbors[frame.next];
      if (neighbor !== undefined) {
        frame.next += 1;
        if (!discovered.has(neighbor)) {
          frame.children += 1;
          parent.set(neighbor, frame.key);
          discovered.set(neighbor, ++time);
          low.set(neighbor, time);
          stack.push({
            key: neighbor,
            neighbors: graph.get(neighbor) ?? [],
            next: 0,
            children: 0,
          });
        } else if (parent.get(frame.key) !== neighbor) {
          low.set(frame.key, Math.min(low.get(frame.key)!, discovered.get(neighbor)!));
        }
        continue;
      }

      stack.pop();
      const parentKey = parent.get(frame.key);
      if (parentKey === undefined) {
        if (frame.children > 1) articulation.add(frame.key);
        continue;
      }
      low.set(parentKey, Math.min(low.get(parentKey)!, low.get(frame.key)!));
      if (parent.has(parentKey) && low.get(frame.key)! >= discovered.get(parentKey)!) {
        articulation.add(parentKey);
      }
    }
  }
  return articulation;
}

test('Genesis 001 contains exactly 10,000 unique authoritative cells', () => {
  const completeDiscCount = 1 + 3 * GENESIS_FULL_DISC_RADIUS * (GENESIS_FULL_DISC_RADIUS + 1);
  assert.equal(completeDiscCount, 9_919);
  assert.equal(CANONICAL_WORLD_TILES.length, GENESIS_AUTHORITATIVE_CELL_COUNT);
  assert.equal(CANONICAL_WORLD_TILES.length, 10_000);
  assert.equal(CANONICAL_WORLD_TILES.length - GENESIS_GENERATION_V2_WORLD_TILES.length, 8_739);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => tile.key)).size, 10_000);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => `${tile.q},${tile.r}`)).size, 10_000);

  for (const tile of CANONICAL_WORLD_TILES) {
    assert.ok(hexDistance(tile) <= LOWLANDS_RADIUS);
    assert.equal(tile.key, hexKey(tile.q, tile.r));
  }
  assert.equal(
    CANONICAL_WORLD_TILES.filter(tile => hexDistance(tile) <= GENESIS_FULL_DISC_RADIUS).length,
    completeDiscCount,
  );
});

test('the partial ring-58 boundary is six balanced contiguous side-centered arcs', () => {
  assert.equal(GENESIS_PARTIAL_OUTER_RING_TILES.length, 81);
  assert.ok(GENESIS_PARTIAL_OUTER_RING_TILES.every(tile => hexDistance(tile) === LOWLANDS_RADIUS));

  const endpoints: string[][] = [];
  for (let sector = 1; sector <= 6; sector += 1) {
    const arc = GENESIS_PARTIAL_OUTER_RING_TILES
      .filter(tile => canonicalMetaForKey(tile.key)?.sector === sector)
      .sort((left, right) => left.q - right.q || left.r - right.r);
    assert.equal(arc.length, GENESIS_PARTIAL_OUTER_RING_SECTOR_COUNTS[sector]);
    for (let index = 1; index < arc.length; index += 1) {
      assert.equal(hexDistance(arc[index - 1]!, arc[index]!), 1);
    }
    endpoints.push([arc[0]!.key, arc.at(-1)!.key]);
  }

  assert.deepEqual(endpoints, [
    ['23,35', '36,22'],
    ['-35,58', '-23,58'],
    ['-58,23', '-58,36'],
    ['-36,-22', '-24,-34'],
    ['22,-58', '35,-58'],
    ['58,-36', '58,-24'],
  ]);
});

test('all generation-v2 rows, metadata, slots, and spawn order stay byte-for-byte stable', () => {
  assert.equal(GENESIS_GENERATION_V2_WORLD_TILES.length, 1_261);
  assert.equal(GENESIS_GENERATION_V2_WORLD_TILE_META.length, 1_261);
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
  assert.equal(
    generationV2Digest(GENESIS_GENERATION_V2_WORLD_TILES),
    '4872e085c983ba77d083b5e4d554d227dd894471df3f74dd5543f1fb37c575e9',
  );
  assert.equal(
    generationV2Digest(GENESIS_GENERATION_V2_WORLD_TILE_META),
    'cb35b0a7bf25c2370ebd3b069d39c746dc8f170e9e5de1ef8f56e2f51d2e9e9c',
  );
  assert.equal(
    generationV2Digest(CANONICAL_CASTLE_SLOTS),
    'd770a084b7c8f59abbc505239a026a98e17bd55d3507c204cd1517858db017ed',
  );
  assert.equal(
    generationV2Digest(GENESIS_GENERATION_V2_REALM),
    'e0d49a4fde06913b6f550b7fb54d34edc5e0cc76973ba7a222a5776106f63ba0',
  );
  assert.equal(matchesGenerationV2Realm(GENESIS_GENERATION_V2_REALM), true);
  assert.equal(GENESIS_GENERATION_V2_REALM.authoritativeRadius, 20);
  assert.equal(GENESIS_GENERATION_V2_REALM.generationVersion, 2);
});

test('generation-v3 metadata preserves v2 and has exact separate content budgets', () => {
  assert.equal(CANONICAL_WORLD_TILE_META.length, CANONICAL_WORLD_TILES.length);
  const byContent = new Map<string, number>();
  for (const meta of CANONICAL_WORLD_TILE_META) {
    const tile = canonicalTileForKey(meta.tileKey);
    assert.ok(tile);
    assert.equal(meta.s, -tile.q - tile.r);
    assert.equal(meta.ring, hexDistance(tile));
    assert.ok(meta.sector >= 0 && meta.sector <= 6);
    assert.equal(
      meta.generationVersion,
      meta.ring <= GENESIS_GENERATION_V2_RADIUS
        ? GENESIS_GENERATION_V2_VERSION
        : HEGEMONY_WORLD_GENERATION_VERSION,
    );
    assert.equal(meta.passable, meta.movementCost > 0);
    assert.equal(matchesCanonicalWorldMeta(meta), true);
    byContent.set(meta.staticContentKind, (byContent.get(meta.staticContentKind) ?? 0) + 1);
  }

  assert.equal(byContent.get('castle-slot'), GENESIS_CASTLE_SLOT_COUNT);
  assert.equal(byContent.get('resource-capable'), GENESIS_RESOURCE_SITE_COUNT);
  assert.equal(byContent.get('core-capable'), GENESIS_CORE_SITE_COUNT);
  assert.equal(byContent.get('empty'), GENESIS_EMPTY_SITE_COUNT);
  assert.equal(byContent.get('scenic-blocker'), GENESIS_BLOCKER_COUNT);
  assert.equal(byContent.get('reserve'), GENESIS_RESERVE_SITE_COUNT);
  assert.equal(CANONICAL_WORLD_TILE_META.filter(meta => meta.passable).length, 8_750);
  assert.ok(CANONICAL_WORLD_TILE_META
    .filter(meta => ['castle-slot', 'resource-capable', 'core-capable', 'empty'].includes(meta.staticContentKind))
    .every(meta => meta.passable));

  const generationV3Meta = CANONICAL_WORLD_TILE_META.filter(
    meta => meta.generationVersion === HEGEMONY_WORLD_GENERATION_VERSION,
  );
  for (const contentKind of [
    'scenic-blocker',
    'empty',
    'resource-capable',
    'core-capable',
    'reserve',
  ]) {
    assert.deepEqual(
      [...new Set(generationV3Meta
        .filter(meta => meta.staticContentKind === contentKind)
        .map(meta => meta.sector))].sort(),
      [1, 2, 3, 4, 5, 6],
    );
  }
  for (const meta of generationV3Meta) {
    const tile = canonicalTileForKey(meta.tileKey)!;
    if (
      meta.ring % 5 === 0
      || tile.q % 4 === 0
      || tile.r % 4 === 0
      || meta.s % 4 === 0
      || meta.ring === LOWLANDS_RADIUS
    ) assert.equal(meta.passable, true);
  }
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
    assert.ok(meta.ring <= GENESIS_GENERATION_V2_RADIUS - 2);
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
    '4c111ec1f5e127c7cfd8f42f87c4085f94a4bc46bdacbdc9779866dfdb3edab6',
  );
});

test('backend, auth, and world generation versions remain independent', () => {
  assert.equal(WARPKEEP_BACKEND_PROTOCOL_VERSION, 3);
  assert.equal(HEGEMONY_WORLD_GENERATION_VERSION, 3);
  assert.equal(HEGEMONY_GENESIS_001, 'HEGEMONY_GENESIS_001');
  assert.equal(HEGEMONY_WORLD_SEED, 3_445_214_658);
});
