import {
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../../../spacetimedb/src/waterRevision';
import { axialToWorld, hexDistance, hexKey } from '../../game/map/hexCoordinates';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { TerrainBounds } from './createTerrainGeometry';

export type RealmWaterNavigationEnvelope = Readonly<{
  /** Outer rendered water/fog footprint, including the hidden safety buffer. */
  bounds: TerrainBounds;
  /** Last ring whose ocean depth has not crossed beyond full fog. */
  maximumCenterHexRadius: number;
  hexSize: number;
  blockedCenterCellKeys: ReadonlySet<string>;
}>;

export type RealmWaterBoundaryCoverageProof = Readonly<{
  maximumVisibleHexRadius: number;
  hiddenBufferCells: number;
  maximumWaveDisplacement: number;
  curtainBottom: number;
  curtainTop: number;
  covered: boolean;
}>;

/**
 * Pure camera-boundary proof used by rendered QA. It intentionally accepts
 * measured frustum extents instead of reading a camera or inventing topology.
 */
export function proveRealmWaterBoundaryCoverage(input: Readonly<{
  maximumVisibleHexRadius: number;
  hiddenBufferCells: number;
  maximumWaveDisplacement: number;
  curtainBottom: number;
  curtainTop: number;
  projectedMinimumY: number;
  projectedMaximumY: number;
}>): RealmWaterBoundaryCoverageProof {
  const maximumVisibleHexRadius = Number.isFinite(input.maximumVisibleHexRadius)
    ? Math.max(0, Math.trunc(input.maximumVisibleHexRadius)) : 0;
  const hiddenBufferCells = Number.isFinite(input.hiddenBufferCells)
    ? Math.max(0, Math.trunc(input.hiddenBufferCells)) : 0;
  const maximumWaveDisplacement = Number.isFinite(input.maximumWaveDisplacement)
    ? Math.max(0, input.maximumWaveDisplacement) : Number.POSITIVE_INFINITY;
  const curtainBottom = Number.isFinite(input.curtainBottom) ? input.curtainBottom : 0;
  const curtainTop = Number.isFinite(input.curtainTop) ? input.curtainTop : 0;
  const projectedMinimumY = Number.isFinite(input.projectedMinimumY)
    ? input.projectedMinimumY : Number.NEGATIVE_INFINITY;
  const projectedMaximumY = Number.isFinite(input.projectedMaximumY)
    ? input.projectedMaximumY : Number.POSITIVE_INFINITY;
  return Object.freeze({
    maximumVisibleHexRadius,
    hiddenBufferCells,
    maximumWaveDisplacement,
    curtainBottom,
    curtainTop,
    covered: hiddenBufferCells >= 2
      && maximumWaveDisplacement <= 0.35
      && curtainBottom <= projectedMinimumY
      && curtainTop >= projectedMaximumY
  });
}

/** The validated projection returns this exact frozen catalog after activation. */
export function realmNoLakeRevisionActive(
  cells: readonly GenesisWaterCellV1[] | undefined
) {
  return cells === GENESIS_WATER_REVISION_ENABLED_CELLS_V1;
}

/**
 * Derive camera authority from the already-validated persistent Water rows.
 * The rectangular bounds retain the two-cell hidden render buffer while the
 * radial center limit stops direct input at full fog. No browser-local coast
 * or river topology is generated here.
 */
export function realmWaterNavigationEnvelope(
  cells: readonly GenesisWaterCellV1[] | undefined,
  fallback: TerrainBounds,
  hexSizeInput = 1
): RealmWaterNavigationEnvelope | undefined {
  if (!cells) return undefined;
  const hexSize = Number.isFinite(hexSizeInput) && hexSizeInput > 0 ? hexSizeInput : 1;
  const ocean = cells.filter((cell) => (
    cell.regime === 'ocean'
    && Number.isSafeInteger(cell.q)
    && Number.isSafeInteger(cell.r)
    && Number.isSafeInteger(cell.oceanDepth)
    && cell.oceanDepth > 0
  ));
  if (ocean.length === 0) return undefined;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maximumCenterHexRadius = 0;
  for (const cell of ocean) {
    const center = axialToWorld(cell, hexSize);
    // A pointy hex extends one full size vertically and sqrt(3)/2 laterally.
    const halfWidth = Math.sqrt(3) * hexSize * 0.5;
    minX = Math.min(minX, center.x - halfWidth);
    maxX = Math.max(maxX, center.x + halfWidth);
    minZ = Math.min(minZ, center.z - hexSize);
    maxZ = Math.max(maxZ, center.z + hexSize);
    if (cell.fogBand !== 'full') {
      maximumCenterHexRadius = Math.max(
        maximumCenterHexRadius,
        hexDistance({ q: 0, r: 0 }, cell)
      );
    }
  }
  if (
    !Number.isFinite(minX)
    || !Number.isFinite(maxX)
    || !Number.isFinite(minZ)
    || !Number.isFinite(maxZ)
    || maximumCenterHexRadius <= 0
  ) return undefined;
  return Object.freeze({
    bounds: Object.freeze({
      minX: Math.min(fallback.minX, minX),
      maxX: Math.max(fallback.maxX, maxX),
      minY: fallback.minY,
      maxY: fallback.maxY,
      minZ: Math.min(fallback.minZ, minZ),
      maxZ: Math.max(fallback.maxZ, maxZ)
    }),
    maximumCenterHexRadius,
    hexSize,
    blockedCenterCellKeys: new Set(ocean
      .filter((cell) => cell.fogBand === 'full')
      .map((cell) => cell.cellKey))
  });
}

/**
 * Remove only exact validated ocean coordinates from the visual terrain mesh.
 * The persistent terrain map remains available to height and authority code;
 * rivers and legacy lake semantics deliberately retain their land geometry.
 */
export function realmLandPresentationMap(
  map: RealmTerrainMap,
  cells: readonly GenesisWaterCellV1[] | undefined
): RealmTerrainMap {
  if (!cells) return map;
  const oceanKeys = new Set(cells.flatMap((cell) => (
    cell.regime === 'ocean'
    && Number.isSafeInteger(cell.q)
    && Number.isSafeInteger(cell.r)
    && cell.cellKey === hexKey(cell)
      ? [cell.cellKey]
      : []
  )));
  if (oceanKeys.size === 0) return map;
  const landCells = map.cells.filter((cell) => !oceanKeys.has(hexKey(cell.coord)));
  if (landCells.length === map.cells.length) return map;
  return Object.freeze({
    ...map,
    cells: Object.freeze(landCells)
  });
}
