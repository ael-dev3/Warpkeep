import { hegemonyLowlandsSpec } from './hegemonyLowlandsSpec';
import {
  axialToWorld,
  worldToNearestAxial,
  type HexWorldPosition
} from './hexCoordinates';
import { createTerrainCellForCoord, terrainCellByCoord } from './generateTerrainMap';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  placementInfluenceAtWorld,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';
import {
  canonicalLowlandsCellInteriorDetail,
  canonicalLowlandsCellInteriorEdgeFalloff,
  canonicalLowlandsGlobalHeight,
  canonicalLowlandsPointyHexBoundaryDistance
} from '../../../spacetimedb/src/lowlandsSurface';

/** Re-exported for terrain math consumers; the visual contract lives in one spec module. */
export const hegemonyLowlandsSurfaceSpec = hegemonyLowlandsSpec.surface;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * A continuous broad relief field with no knowledge of cell boundaries. Every
 * geometry or gameplay query at the same world point receives the same value.
 */
export function globalLowlandHeight(worldSeed: number, position: HexWorldPosition): number {
  return canonicalLowlandsGlobalHeight(worldSeed, position);
}

/**
 * Pointy-top hex radial distance. A value of one lies exactly on any of the
 * six polygon edges. This form avoids converting to a cell-specific mesh.
 */
export function pointyHexBoundaryDistance(local: HexWorldPosition, hexSize: number): number {
  return canonicalLowlandsPointyHexBoundaryDistance(local, hexSize);
}

/**
 * Cell-local detail is allowed only in the interior. It becomes mathematically
 * zero at cell borders, so neighboring cells cannot create a crack or height
 * seam even when their deterministic seeds differ.
 */
export function cellInteriorEdgeFalloff(
  local: HexWorldPosition,
  hexSize: number,
  boundarySafeRatio: number = hegemonyLowlandsSurfaceSpec.boundarySafeRatio
): number {
  return canonicalLowlandsCellInteriorEdgeFalloff(local, hexSize, boundarySafeRatio);
}

export function cellInteriorDetail(
  cell: TerrainCell,
  local: HexWorldPosition,
  hexSize: number
): number {
  return canonicalLowlandsCellInteriorDetail(cell, local, hexSize);
}

export function terrainHeightForCell(
  worldSeed: number,
  cell: TerrainCell,
  world: HexWorldPosition,
  hexSize: number,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS
): number {
  const center = axialToWorld(cell.coord, hexSize);
  const local = { x: finite(world.x) - center.x, z: finite(world.z) - center.z };
  const naturalHeight = globalLowlandHeight(worldSeed, world) + cellInteriorDetail(cell, local, hexSize);
  let height = naturalHeight;

  const placementCoord = worldToNearestAxial(world, hexSize);
  terrainPlacementsForCell(placements, placementCoord, hexSize).forEach((placement) => {
    const influence = placementInfluenceAtWorld(placement, world, hexSize);
    if (influence <= 0) return;
    const placementCenter = axialToWorld(placement.coord, hexSize);
    const targetLocal = { x: 0, z: 0 };
    const placementCell = placement.coord.q === cell.coord.q && placement.coord.r === cell.coord.r
      ? cell
      : createTerrainCellForCoord(worldSeed, placement.coord);
    const targetHeight = globalLowlandHeight(worldSeed, placementCenter)
      + cellInteriorDetail(placementCell, targetLocal, hexSize);
    height += (targetHeight - height) * influence;
  });
  return height;
}

export function terrainHeightAtWorld(
  map: RealmTerrainMap,
  world: HexWorldPosition,
  hexSize: number = hegemonyLowlandsSurfaceSpec.hexSize,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS
): number {
  const nearest = worldToNearestAxial(world, hexSize);
  const cell = terrainCellByCoord(map, nearest);
  return cell
    ? terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements)
    : globalLowlandHeight(map.worldSeed, world);
}
