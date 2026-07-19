import { describe, expect, it } from 'vitest';

import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
} from '../spacetimedb/src/waterRevision';
import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { CANONICAL_WORLD_TILE_META } from '../spacetimedb/src/world';
import { projectRealmWaterRevisionTerrainMetadata } from '../src/components/realm/realmWaterTerrainProjection';

describe('Water revision terrain projection', () => {
  it('retains frozen v1 lake semantics unless the exact active catalog is present', () => {
    const lakeKey = GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1[0]!;
    const rawLake = CANONICAL_WORLD_TILE_META.find((row) => row.tileKey === lakeKey)!;

    for (const waterCells of [
      undefined,
      GENESIS_WATER_CELLS_V1,
      [...GENESIS_WATER_REVISION_ENABLED_CELLS_V1]
    ]) {
      const projected = projectRealmWaterRevisionTerrainMetadata(
        CANONICAL_WORLD_TILE_META,
        waterCells
      );
      expect(projected).toBe(CANONICAL_WORLD_TILE_META);
      expect(projected.find((row) => row.tileKey === lakeKey)).toEqual({
        ...rawLake,
        terrainKind: 'lake',
        passable: false,
        movementCost: 0,
        staticContentKind: 'scenic-blocker'
      });
    }
  });

  it('projects exactly 409 frozen lake keys as ordinary selectable lowland', () => {
    const projected = projectRealmWaterRevisionTerrainMetadata(
      CANONICAL_WORLD_TILE_META,
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
    );
    const reclaimedKeys = new Set(GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1);
    const reclaimedRows = projected.filter((row) => reclaimedKeys.has(row.tileKey));
    const rawLakeRows = CANONICAL_WORLD_TILE_META.filter((row) => (
      reclaimedKeys.has(row.tileKey)
    ));

    expect(projected).not.toBe(CANONICAL_WORLD_TILE_META);
    expect(reclaimedRows).toHaveLength(GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT);
    expect(reclaimedRows).toHaveLength(409);
    expect(reclaimedRows.every((row) => (
      row.terrainKind === 'lowland'
      && row.passable
      && row.movementCost === 1
      && row.staticContentKind === 'empty'
    ))).toBe(true);
    expect(projected.filter((row, index) => row !== CANONICAL_WORLD_TILE_META[index]))
      .toHaveLength(409);

    // Projection is non-mutating: the persistent snapshot retains v1 lakes.
    expect(rawLakeRows.every((row) => (
      row.terrainKind === 'lake'
      && !row.passable
      && row.movementCost === 0
      && row.staticContentKind === 'scenic-blocker'
    ))).toBe(true);
  });

  it('fails the complete projection closed when one legacy lake row drifts', () => {
    const driftKey = GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1[0]!;
    const drifted = CANONICAL_WORLD_TILE_META.map((row) => (
      row.tileKey === driftKey ? { ...row, movementCost: 1 } : row
    ));

    expect(projectRealmWaterRevisionTerrainMetadata(
      drifted,
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
    )).toBe(drifted);
  });
});
