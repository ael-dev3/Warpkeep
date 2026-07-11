import { axialToWorld, type HexCoord, type HexWorldPosition } from './hexCoordinates';

export type TerrainStructurePlacement = Readonly<{
  id: string;
  coord: HexCoord;
  footprintRadius: number;
  blendRadius: number;
  targetHeightMode: 'cell-center' | 'average-footprint';
}>;

export const HEGEMONY_KEEP_PLACEMENT: TerrainStructurePlacement = {
  id: 'hegemony-frontier-keep',
  coord: { q: 0, r: 0 },
  footprintRadius: 0.43,
  blendRadius: 0.7,
  targetHeightMode: 'cell-center'
};

export const HEGEMONY_TERRAIN_PLACEMENTS = [HEGEMONY_KEEP_PLACEMENT] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function smootherstep(value: number) {
  const normalized = clamp(value, 0, 1);
  return normalized ** 3 * (normalized * (normalized * 6 - 15) + 10);
}

export function distanceToPlacement(
  placement: TerrainStructurePlacement,
  world: HexWorldPosition,
  hexSize: number
) {
  const center = axialToWorld(placement.coord, hexSize);
  return Math.hypot(world.x - center.x, world.z - center.z);
}

export function placementInfluenceAtWorld(
  placement: TerrainStructurePlacement,
  world: HexWorldPosition,
  hexSize: number
) {
  const distance = distanceToPlacement(placement, world, hexSize);
  if (distance <= placement.footprintRadius) return 1;
  if (distance >= placement.blendRadius) return 0;
  const blend = (distance - placement.footprintRadius)
    / Math.max(0.001, placement.blendRadius - placement.footprintRadius);
  return 1 - smootherstep(blend);
}

export function isPlacementClear(
  placements: readonly TerrainStructurePlacement[],
  world: HexWorldPosition,
  hexSize: number,
  clearance = 0.08
) {
  return placements.every((placement) => (
    distanceToPlacement(placement, world, hexSize) >= placement.blendRadius + clearance
  ));
}
