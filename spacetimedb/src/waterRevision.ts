import {
  GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS,
  GENESIS_OCEAN_HIDDEN_BUFFER_CELLS,
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_V1,
} from './waterWorld';

/**
 * Additive policy over the frozen Water v1 rows. The revision changes which
 * regimes a client presents; it never rewrites or duplicates v1 topology.
 */
export const GENESIS_WATER_REVISION_VERSION = 2;
export const GENESIS_WATER_REVISION_POLICY_VERSION =
  'genesis-001-ocean-river-only-v1';
export const GENESIS_WATER_REVISION_OCEAN_BODY_COUNT = 1;
export const GENESIS_WATER_REVISION_RIVER_BODY_COUNT = 12;
export const GENESIS_WATER_REVISION_ENABLED_BODY_COUNT = 13;
export const GENESIS_WATER_REVISION_OCEAN_CELL_COUNT = 2_871;
export const GENESIS_WATER_REVISION_RIVER_CELL_COUNT = 400;
export const GENESIS_WATER_REVISION_ENABLED_CELL_COUNT = 3_271;
export const GENESIS_WATER_REVISION_LAKE_BODY_COUNT = 0;
export const GENESIS_WATER_REVISION_LAKE_CELL_COUNT = 0;
export const GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS = 1;
/** Frozen Water v1 lake cells reclaimed by the active revision. */
export const GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT = 409;
export const GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND = 'lowland';
export const GENESIS_WATER_REVISION_RECLAIMED_PASSABLE = true;
export const GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST = 1;
/** `empty` is the canonical metadata encoding for no static content. */
export const GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND = 'empty';
export const GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1 = Object.freeze(
  GENESIS_WATER_CELLS_V1
    .filter(cell => cell.regime === 'lake')
    .map(cell => cell.cellKey)
    .sort(),
);
/** First ocean depth where full fog begins and camera travel must stop. */
export const GENESIS_WATER_NAVIGATION_FOG_BOUNDARY_DEPTH_CELLS =
  GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS;
/** Protected main snapshot from which this additive policy was reviewed. */
export const GENESIS_WATER_REVISION_SOURCE_COMMIT =
  '331de3638901501635f5974dfa52adfbd33ecb85';

export type GenesisWaterRevisionV1 = Readonly<{
  realmId: string;
  revisionVersion: number;
  policyVersion: string;
  baseLayoutVersion: number;
  baseLayoutDigest: string;
  oceanBodyCount: number;
  riverBodyCount: number;
  enabledBodyCount: number;
  oceanCellCount: number;
  riverCellCount: number;
  enabledCellCount: number;
  lakeBodyCount: number;
  lakeCellCount: number;
  riverWidthCells: number;
  navigationFogBoundaryDepthCells: number;
  hiddenBufferCells: number;
  revisionDigest: string;
  sourceCommit: string;
}>;

/** Stable source for the SHA-256 digest pinned by the reviewed revision. */
export function canonicalGenesisWaterRevisionV1DigestInput(): string {
  return [
    GENESIS_WATER_REVISION_POLICY_VERSION,
    GENESIS_WATER_REVISION_VERSION,
    GENESIS_WATER_LAYOUT_V1.realmId,
    GENESIS_WATER_LAYOUT_V1.layoutVersion,
    GENESIS_WATER_LAYOUT_V1.layoutDigest,
    GENESIS_WATER_REVISION_OCEAN_BODY_COUNT,
    GENESIS_WATER_REVISION_RIVER_BODY_COUNT,
    GENESIS_WATER_REVISION_ENABLED_BODY_COUNT,
    GENESIS_WATER_REVISION_OCEAN_CELL_COUNT,
    GENESIS_WATER_REVISION_RIVER_CELL_COUNT,
    GENESIS_WATER_REVISION_ENABLED_CELL_COUNT,
    GENESIS_WATER_REVISION_LAKE_BODY_COUNT,
    GENESIS_WATER_REVISION_LAKE_CELL_COUNT,
    GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS,
    GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
    GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND,
    GENESIS_WATER_REVISION_RECLAIMED_PASSABLE,
    GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST,
    GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND,
    ...GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
    GENESIS_WATER_NAVIGATION_FOG_BOUNDARY_DEPTH_CELLS,
    GENESIS_OCEAN_HIDDEN_BUFFER_CELLS,
    GENESIS_WATER_REVISION_SOURCE_COMMIT,
  ].join('|');
}

// SHA-256 of canonicalGenesisWaterRevisionV1DigestInput(). It is a literal so
// the SpacetimeDB module remains independent of Node's crypto implementation.
export const GENESIS_WATER_REVISION_DIGEST =
  '82c18efe71afff1e1dcd4db17b2f6bd1815042d88c7471793bf6cd6d03780aec';

export const CANONICAL_GENESIS_WATER_REVISION_V1: GenesisWaterRevisionV1 =
  Object.freeze({
    realmId: GENESIS_WATER_LAYOUT_V1.realmId,
    revisionVersion: GENESIS_WATER_REVISION_VERSION,
    policyVersion: GENESIS_WATER_REVISION_POLICY_VERSION,
    baseLayoutVersion: GENESIS_WATER_LAYOUT_V1.layoutVersion,
    baseLayoutDigest: GENESIS_WATER_LAYOUT_V1.layoutDigest,
    oceanBodyCount: GENESIS_WATER_REVISION_OCEAN_BODY_COUNT,
    riverBodyCount: GENESIS_WATER_REVISION_RIVER_BODY_COUNT,
    enabledBodyCount: GENESIS_WATER_REVISION_ENABLED_BODY_COUNT,
    oceanCellCount: GENESIS_WATER_REVISION_OCEAN_CELL_COUNT,
    riverCellCount: GENESIS_WATER_REVISION_RIVER_CELL_COUNT,
    enabledCellCount: GENESIS_WATER_REVISION_ENABLED_CELL_COUNT,
    lakeBodyCount: GENESIS_WATER_REVISION_LAKE_BODY_COUNT,
    lakeCellCount: GENESIS_WATER_REVISION_LAKE_CELL_COUNT,
    riverWidthCells: GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS,
    navigationFogBoundaryDepthCells:
      GENESIS_WATER_NAVIGATION_FOG_BOUNDARY_DEPTH_CELLS,
    hiddenBufferCells: GENESIS_OCEAN_HIDDEN_BUFFER_CELLS,
    revisionDigest: GENESIS_WATER_REVISION_DIGEST,
    sourceCommit: GENESIS_WATER_REVISION_SOURCE_COMMIT,
  });

export function matchesCanonicalGenesisWaterRevisionV1(
  row: GenesisWaterRevisionV1,
): boolean {
  const expected = CANONICAL_GENESIS_WATER_REVISION_V1;
  return row.realmId === expected.realmId
    && row.revisionVersion === expected.revisionVersion
    && row.policyVersion === expected.policyVersion
    && row.baseLayoutVersion === expected.baseLayoutVersion
    && row.baseLayoutDigest === expected.baseLayoutDigest
    && row.oceanBodyCount === expected.oceanBodyCount
    && row.riverBodyCount === expected.riverBodyCount
    && row.enabledBodyCount === expected.enabledBodyCount
    && row.oceanCellCount === expected.oceanCellCount
    && row.riverCellCount === expected.riverCellCount
    && row.enabledCellCount === expected.enabledCellCount
    && row.lakeBodyCount === expected.lakeBodyCount
    && row.lakeCellCount === expected.lakeCellCount
    && row.riverWidthCells === expected.riverWidthCells
    && row.navigationFogBoundaryDepthCells
      === expected.navigationFogBoundaryDepthCells
    && row.hiddenBufferCells === expected.hiddenBufferCells
    && row.revisionDigest === expected.revisionDigest
    && row.sourceCommit === expected.sourceCommit;
}

/** Immutable views over v1 rows; objects are referenced, never regenerated. */
export const GENESIS_WATER_REVISION_ENABLED_BODIES_V1 = Object.freeze(
  GENESIS_WATER_BODIES_V1.filter(
    body => body.regime === 'ocean' || body.regime === 'river',
  ),
);
export const GENESIS_WATER_REVISION_ENABLED_CELLS_V1 = Object.freeze(
  GENESIS_WATER_CELLS_V1.filter(
    cell => cell.regime === 'ocean' || cell.regime === 'river',
  ),
);

// Fail closed if the frozen v1 topology ever drifts from the reviewed subset.
if (
  GENESIS_WATER_REVISION_ENABLED_BODIES_V1.filter(body => body.regime === 'ocean').length
    !== GENESIS_WATER_REVISION_OCEAN_BODY_COUNT
  || GENESIS_WATER_REVISION_ENABLED_BODIES_V1.filter(body => body.regime === 'river').length
    !== GENESIS_WATER_REVISION_RIVER_BODY_COUNT
  || GENESIS_WATER_REVISION_ENABLED_BODIES_V1.length
    !== GENESIS_WATER_REVISION_ENABLED_BODY_COUNT
  || GENESIS_WATER_REVISION_ENABLED_CELLS_V1.filter(cell => cell.regime === 'ocean').length
    !== GENESIS_WATER_REVISION_OCEAN_CELL_COUNT
  || GENESIS_WATER_REVISION_ENABLED_CELLS_V1.filter(cell => cell.regime === 'river').length
    !== GENESIS_WATER_REVISION_RIVER_CELL_COUNT
  || GENESIS_WATER_REVISION_ENABLED_CELLS_V1.length
    !== GENESIS_WATER_REVISION_ENABLED_CELL_COUNT
  || GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1.length
    !== GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT
  || new Set(GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1).size
    !== GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT
  || GENESIS_WATER_LAYOUT_V1.lakeBodyCount <= 0
  || GENESIS_WATER_LAYOUT_V1.lakeCellCount
    !== GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT
) {
  throw new Error('GENESIS_WATER_REVISION_POLICY_DRIFT');
}
