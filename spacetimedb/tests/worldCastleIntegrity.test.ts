import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CANONICAL_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILES,
} from '../src/world';
import { worldCastleGraphIsConsistent } from '../src/worldCastleIntegrity';

function emptyWorld() {
  return CANONICAL_WORLD_TILES.map(tile => ({
    ...tile,
    occupantCastleId: undefined,
  }));
}

test('the exact unoccupied canonical 10,000-tile world is consistent', () => {
  assert.equal(worldCastleGraphIsConsistent(emptyWorld(), []), true);
});

test('the exact generation-v2 predecessor remains consistent during rollout', () => {
  const generationV2 = GENESIS_GENERATION_V2_WORLD_TILES.map(tile => ({
    ...tile,
    occupantCastleId: undefined,
  }));
  assert.equal(worldCastleGraphIsConsistent(generationV2, []), true);
  assert.equal(worldCastleGraphIsConsistent([
    ...generationV2.slice(0, -1),
    { ...CANONICAL_WORLD_TILES[GENESIS_GENERATION_V2_WORLD_TILES.length]!, occupantCastleId: undefined },
  ], []), false);
});

test('a castle and occupied tile must link bidirectionally with matching coordinates', () => {
  const tiles = emptyWorld();
  const centerIndex = tiles.findIndex(tile => tile.key === '0,0');
  const castle = { castleId: 1n, tileKey: '0,0', q: 0, r: 0 };
  tiles[centerIndex] = { ...tiles[centerIndex]!, occupantCastleId: castle.castleId };
  assert.equal(worldCastleGraphIsConsistent(tiles, [castle]), true);

  assert.equal(worldCastleGraphIsConsistent(tiles, [{ ...castle, q: 1 }]), false);
  assert.equal(worldCastleGraphIsConsistent(
    tiles.map(tile => tile.key === '0,0' ? { ...tile, occupantCastleId: 2n } : tile),
    [castle],
  ), false);
  assert.equal(worldCastleGraphIsConsistent(tiles, []), false);
});

test('missing, duplicated, or noncanonical world tiles fail closed', () => {
  const tiles = emptyWorld();
  assert.equal(worldCastleGraphIsConsistent(tiles.slice(1), []), false);
  assert.equal(worldCastleGraphIsConsistent([...tiles, tiles[0]!], []), false);
  assert.equal(worldCastleGraphIsConsistent([
    { ...tiles[0]!, terrainSeed: tiles[0]!.terrainSeed ^ 1 },
    ...tiles.slice(1),
  ], []), false);
});

test('admin recovery seeding verifies the completed castle graph before audit', () => {
  const center = CANONICAL_WORLD_TILES.find(tile => tile.key === '0,0');
  assert.ok(center);
  const partiallySeeded = emptyWorld().filter(tile => tile.key !== center.key);
  const recoveredButUnlinked = [
    ...partiallySeeded,
    { ...center, occupantCastleId: undefined },
  ];
  const preexistingCastle = { castleId: 1n, tileKey: center.key, q: center.q, r: center.r };
  assert.equal(
    worldCastleGraphIsConsistent(recoveredButUnlinked, [preexistingCastle]),
    false,
  );

  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const adminSeedWorld');
  const end = source.indexOf('export const adminExpandGenesisWorldV3', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const reducer = source.slice(start, end);

  const seed = reducer.indexOf('seedCanonicalWorld(ctx)');
  const integrity = reducer.indexOf('worldCastleGraphIsConsistent(');
  const failure = reducer.indexOf("throw new SenderError('STATE_INTEGRITY')");
  const audit = reducer.indexOf("audit(ctx, 'seed_world'");
  assert.ok(seed >= 0 && integrity > seed && failure > integrity && audit > failure);
});
