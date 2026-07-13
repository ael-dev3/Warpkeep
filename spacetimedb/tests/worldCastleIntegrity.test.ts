import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_WORLD_TILES } from '../src/world';
import { worldCastleGraphIsConsistent } from '../src/worldCastleIntegrity';

function emptyWorld() {
  return CANONICAL_WORLD_TILES.map(tile => ({
    ...tile,
    occupantCastleId: undefined,
  }));
}

test('the exact unoccupied canonical 61-tile world is consistent', () => {
  assert.equal(worldCastleGraphIsConsistent(emptyWorld(), []), true);
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
