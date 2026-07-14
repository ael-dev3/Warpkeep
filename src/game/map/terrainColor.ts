import { hegemonyLowlandsSpec } from './hegemonyLowlandsSpec';
import {
  axialToWorld,
  worldToFractionalAxial,
  worldToNearestAxial,
  type HexWorldPosition
} from './hexCoordinates';
import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import { cellInteriorEdgeFalloff } from './terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  placementInfluenceAtWorld,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { TerrainCell } from './terrainTypes';

export type TerrainRgb = Readonly<{ r: number; g: number; b: number }>;

export type TerrainColorContext = Readonly<{
  cell?: TerrainCell;
  hexSize?: number;
  playableRadius?: number;
  renderRadius?: number;
  placements?: readonly TerrainStructurePlacement[];
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function mixColor(first: TerrainRgb, second: TerrainRgb, amount: number): TerrainRgb {
  const blend = clamp(amount, 0, 1);
  return {
    r: first.r + (second.r - first.r) * blend,
    g: first.g + (second.g - first.g) * blend,
    b: first.b + (second.b - first.b) * blend
  };
}

function worldSurfaceSignal(worldSeed: number, world: HexWorldPosition, channel: string, scale: number) {
  const phase = seededUnitFloat(deriveChannelSeed(worldSeed, 0, 0, `${channel}-phase`)) * Math.PI * 2;
  const skew = seededUnitFloat(deriveChannelSeed(worldSeed, 0, 0, `${channel}-skew`)) * 0.6 + 0.35;
  return Math.sin(world.x * scale + world.z * skew * scale + phase) * 0.5
    + Math.cos(world.z * scale * 0.71 - world.x * scale * 0.23 + phase * 0.73) * 0.5;
}

function continuousApronBlend(
  world: HexWorldPosition,
  hexSize: number,
  playableRadius: number,
  renderRadius: number
) {
  const fractional = worldToFractionalAxial(world, hexSize);
  const radial = Math.max(Math.abs(fractional.q), Math.abs(fractional.r), Math.abs(fractional.s));
  return smoothstep(playableRadius + 0.15, renderRadius + 0.85, radial);
}

/** Edge-safe procedural lowlands color. Cell biases fade to zero before shared borders. */
export function sampleLowlandsColor(
  worldSeed: number,
  world: HexWorldPosition,
  context: TerrainColorContext = {}
): TerrainRgb {
  const hexSize = context.hexSize ?? hegemonyLowlandsSpec.surface.hexSize;
  const broad = worldSurfaceSignal(worldSeed, world, 'grass-broad', 0.68) * 0.5 + 0.5;
  const fine = worldSurfaceSignal(worldSeed, world, 'grass-fine', 2.5) * 0.5 + 0.5;
  const soilSignal = worldSurfaceSignal(worldSeed, world, 'soil', 0.9) * 0.5 + 0.5;
  const center = context.cell ? axialToWorld(context.cell.coord, hexSize) : world;
  const local = { x: world.x - center.x, z: world.z - center.z };
  const cellInfluence = context.cell ? cellInteriorEdgeFalloff(local, hexSize, 0.22) : 0;
  const soilBias = (context.cell?.soilBias ?? 0) * cellInfluence;
  const moisture = (context.cell?.moisture ?? 0) * cellInfluence;
  const dryBias = (context.cell?.dryGrassBias ?? 0) * cellInfluence;
  const soilAmount = smoothstep(
    0.61 - soilBias * 0.09,
    0.86 - soilBias * 0.06,
    soilSignal * 0.68 + fine * 0.32
  );
  const dryAmount = smoothstep(
    0.79 - dryBias * 0.08,
    0.96 - dryBias * 0.05,
    broad * 0.72 + fine * 0.28
  ) * (1 - soilAmount) * (0.22 - moisture * 0.05);
  const grassMix = clamp(broad * 0.58 + 0.28 + moisture * 0.08, 0, 1);
  const grass = mixColor(
    hegemonyLowlandsSpec.palette.grassCool,
    hegemonyLowlandsSpec.palette.grassBase,
    grassMix
  );
  let color = mixColor(
    mixColor(grass, hegemonyLowlandsSpec.palette.soil, soilAmount * (0.52 + soilBias * 0.12)),
    hegemonyLowlandsSpec.palette.dryGrass,
    dryAmount
  );

  const placements = context.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const placementCoord = worldToNearestAxial(world, hexSize);
  let placementInfluence = 0;
  terrainPlacementsForCell(placements, placementCoord, hexSize).forEach((placement) => {
    placementInfluence = Math.max(
      placementInfluence,
      placementInfluenceAtWorld(placement, world, hexSize)
    );
  });
  if (placementInfluence > 0) {
    const packedEarth = mixColor(
      hegemonyLowlandsSpec.palette.soil,
      hegemonyLowlandsSpec.palette.stone,
      0.34
    );
    color = mixColor(color, packedEarth, placementInfluence * 0.72);
  }

  const apronBlend = continuousApronBlend(
    world,
    hexSize,
    context.playableRadius ?? 4,
    context.renderRadius ?? 5
  );
  return mixColor(color, { r: 0.47, g: 0.51, b: 0.38 }, apronBlend * 0.32);
}
