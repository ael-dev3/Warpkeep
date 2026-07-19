import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST,
  GENESIS_WATER_REVISION_RECLAIMED_PASSABLE,
  GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND,
  GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND
} from '../../../spacetimedb/src/waterRevision';
import type { GenesisWaterCellV1 } from '../../../spacetimedb/src/waterWorld';
import type { WarpkeepWorldTileMetadata } from '../../spacetime/warpkeepBackendTypes';

const RECLAIMED_LAKE_KEYS = new Set(
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
);

function isExactLegacyLakeRow(row: WarpkeepWorldTileMetadata) {
  return row.terrainKind === 'lake'
    && row.passable === false
    && row.movementCost === 0
    && row.staticContentKind === 'scenic-blocker';
}

/**
 * Apply the semantic half of the no-lake Water revision without rewriting the
 * canonical snapshot. The exact validated revision catalog is an identity
 * capability: copied, incomplete, or otherwise non-canonical arrays retain
 * legacy blocked-lake metadata.
 *
 * The raw 409 rows are also checked before projection. Any missing, duplicate,
 * or drifted legacy lake makes the whole projection fail closed.
 */
export function projectRealmWaterRevisionTerrainMetadata(
  rows: readonly WarpkeepWorldTileMetadata[],
  waterCells: readonly GenesisWaterCellV1[] | undefined
): readonly WarpkeepWorldTileMetadata[] {
  if (waterCells !== GENESIS_WATER_REVISION_ENABLED_CELLS_V1) return rows;

  const seen = new Set<string>();
  for (const row of rows) {
    const reclaimed = RECLAIMED_LAKE_KEYS.has(row.tileKey);
    if (row.terrainKind === 'lake' && !reclaimed) return rows;
    if (!reclaimed) continue;
    if (seen.has(row.tileKey) || !isExactLegacyLakeRow(row)) return rows;
    seen.add(row.tileKey);
  }
  if (seen.size !== GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT) return rows;

  return Object.freeze(rows.map((row) => (
    RECLAIMED_LAKE_KEYS.has(row.tileKey)
      ? Object.freeze({
          ...row,
          terrainKind: GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND,
          passable: GENESIS_WATER_REVISION_RECLAIMED_PASSABLE,
          movementCost: GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST,
          // `empty` is this schema's closed-vocabulary representation of none.
          staticContentKind:
            GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND
        })
      : row
  )));
}
