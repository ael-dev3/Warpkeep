import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
} from '../src/world';
import {
  assertGenesisWaterWorldPrecondition,
  WaterLayoutAuthorityError,
} from '../src/waterAuthority';
import {
  GENESIS_OCEAN_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_V1,
  classifyGenesisWaterEnvironmentV1,
} from '../src/waterWorld';

const CANONICAL_SNAPSHOT = Object.freeze({
  worldTiles: CANONICAL_WORLD_TILES,
  realms: Object.freeze([CANONICAL_REALM]),
  worldMeta: CANONICAL_WORLD_TILE_META,
  castleSlots: CANONICAL_CASTLE_SLOTS,
});

function assertWorldDrift(operation: () => void): void {
  assert.throws(operation, error => (
    error instanceof WaterLayoutAuthorityError
    && error.code === 'WATER_LAYOUT_WORLD_DRIFT'
  ));
}

test('Water seed, inspect, and activation precondition accepts only exact generation-v3 state', () => {
  assert.doesNotThrow(() => assertGenesisWaterWorldPrecondition(CANONICAL_SNAPSHOT));

  const ocean = GENESIS_OCEAN_CELLS_V1[0]!;
  const removedTile = CANONICAL_WORLD_TILES.at(-1)!;
  assertWorldDrift(() => assertGenesisWaterWorldPrecondition({
    ...CANONICAL_SNAPSHOT,
    worldTiles: [
      ...CANONICAL_WORLD_TILES.slice(0, -1),
      { ...removedTile, key: ocean.cellKey, q: ocean.q, r: ocean.r },
    ],
  }));

  const firstSlot = CANONICAL_CASTLE_SLOTS[0]!;
  assertWorldDrift(() => assertGenesisWaterWorldPrecondition({
    ...CANONICAL_SNAPSHOT,
    castleSlots: [
      { ...firstSlot, tileKey: ocean.cellKey, q: ocean.q, r: ocean.r },
      ...CANONICAL_CASTLE_SLOTS.slice(1),
    ],
  }));

  assertWorldDrift(() => assertGenesisWaterWorldPrecondition({
    ...CANONICAL_SNAPSHOT,
    realms: [{ ...CANONICAL_REALM, active: false }],
  }));
});

test('Water environment readiness requires exactly one canonical row', () => {
  assert.equal(classifyGenesisWaterEnvironmentV1([]), 'missing');
  assert.equal(classifyGenesisWaterEnvironmentV1([GENESIS_WATER_ENVIRONMENT_V1]), 'exact');
  assert.equal(classifyGenesisWaterEnvironmentV1([
    GENESIS_WATER_ENVIRONMENT_V1,
    GENESIS_WATER_ENVIRONMENT_V1,
  ]), 'conflict');
  assert.equal(classifyGenesisWaterEnvironmentV1([{
    ...GENESIS_WATER_ENVIRONMENT_V1,
    seaLevelMilli: GENESIS_WATER_ENVIRONMENT_V1.seaLevelMilli + 1,
  }]), 'conflict');
});

test('environment-only seed recovery leaves a private audit record and inspect gates readiness', () => {
  const reducerSource = readFileSync(
    new URL('../src/reducers/waterLayout.ts', import.meta.url),
    'utf8',
  );
  assert.match(reducerSource, /action: 'repair_genesis_water_environment_v1'/);
  assert.match(reducerSource, /&& environmentReady/);
  assert.match(reducerSource, /assertEnvironment\(ctx, false\)/);
});
