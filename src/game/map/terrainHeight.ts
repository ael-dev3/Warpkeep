import { hegemonyLowlandsSpec } from './hegemonyLowlandsSpec';
import {
  axialToWorld,
  worldToNearestAxial,
  type HexWorldPosition
} from './hexCoordinates';
import { terrainCellByCoord } from './generateTerrainMap';
import { deriveChannelSeed, seededSignedFloat, seededUnitFloat } from './realmSeed';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

const SQRT_3 = Math.sqrt(3);

/** Re-exported for terrain math consumers; the visual contract lives in one spec module. */
export const hegemonyLowlandsSurfaceSpec = hegemonyLowlandsSpec.surface;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function latticeValue(worldSeed: number, x: number, z: number, channel: string) {
  return seededSignedFloat(deriveChannelSeed(worldSeed, x, z, channel));
}

/** Smooth deterministic value noise. Coordinates are sampled in world space. */
function worldValueNoise(worldSeed: number, position: HexWorldPosition, wavelength: number, channel: string) {
  const scale = Math.max(0.001, finite(wavelength, 1));
  const scaledX = finite(position.x) / scale;
  const scaledZ = finite(position.z) / scale;
  const baseX = Math.floor(scaledX);
  const baseZ = Math.floor(scaledZ);
  const fractionX = scaledX - baseX;
  const fractionZ = scaledZ - baseZ;
  const blendX = smoothstep(0, 1, fractionX);
  const blendZ = smoothstep(0, 1, fractionZ);
  const lower = latticeValue(worldSeed, baseX, baseZ, channel) * (1 - blendX)
    + latticeValue(worldSeed, baseX + 1, baseZ, channel) * blendX;
  const upper = latticeValue(worldSeed, baseX, baseZ + 1, channel) * (1 - blendX)
    + latticeValue(worldSeed, baseX + 1, baseZ + 1, channel) * blendX;
  return lower * (1 - blendZ) + upper * blendZ;
}

/**
 * A continuous broad relief field with no knowledge of cell boundaries. Every
 * geometry or gameplay query at the same world point receives the same value.
 */
export function globalLowlandHeight(worldSeed: number, position: HexWorldPosition): number {
  const broad = worldValueNoise(
    worldSeed,
    position,
    hegemonyLowlandsSurfaceSpec.globalWavelength,
    'global-relief-broad'
  );
  const secondary = worldValueNoise(
    worldSeed,
    position,
    hegemonyLowlandsSurfaceSpec.secondaryWavelength,
    'global-relief-secondary'
  );
  return (broad * 0.78 + secondary * 0.22) * hegemonyLowlandsSurfaceSpec.globalReliefAmplitude;
}

/**
 * Pointy-top hex radial distance. A value of one lies exactly on any of the
 * six polygon edges. This form avoids converting to a cell-specific mesh.
 */
export function pointyHexBoundaryDistance(local: HexWorldPosition, hexSize: number): number {
  const size = Math.max(0.001, finite(hexSize, hegemonyLowlandsSurfaceSpec.hexSize));
  const x = finite(local.x);
  const z = finite(local.z);
  return Math.max(
    Math.abs(z),
    Math.abs((2 * x) / SQRT_3),
    Math.abs(x / SQRT_3 + z),
    Math.abs(x / SQRT_3 - z)
  ) / size;
}

/**
 * Cell-local detail is allowed only in the interior. It becomes mathematically
 * zero at cell borders, so neighboring cells cannot create a crack or height
 * seam even when their deterministic seeds differ.
 */
export function cellInteriorEdgeFalloff(
  local: HexWorldPosition,
  hexSize: number,
  boundarySafeRatio = hegemonyLowlandsSurfaceSpec.boundarySafeRatio
): number {
  const boundaryDistance = pointyHexBoundaryDistance(local, hexSize);
  const margin = clamp(finite(boundarySafeRatio, 0.16), 0.01, 0.49);
  if (boundaryDistance >= 1) return 0;
  return 1 - smoothstep(1 - margin, 1, boundaryDistance);
}

export function cellInteriorDetail(
  cell: TerrainCell,
  local: HexWorldPosition,
  hexSize: number
): number {
  const edgeFalloff = cellInteriorEdgeFalloff(local, hexSize);
  if (edgeFalloff === 0) return 0;

  const frequency = 2.7 + seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-frequency')) * 1.25;
  const phaseX = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-phase-x')) * Math.PI * 2;
  const phaseZ = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-phase-z')) * Math.PI * 2;
  const diagonal = (finite(local.x) + finite(local.z) * 0.58) * frequency * 1.22;
  const primary = Math.sin(finite(local.x) * frequency + phaseX);
  const secondary = Math.cos(finite(local.z) * frequency * 1.08 + phaseZ);
  const tertiary = Math.sin(diagonal + (phaseX - phaseZ) * 0.4);
  const microSignal = primary * 0.48 + secondary * 0.32 + tertiary * 0.2;
  const amplitude = hegemonyLowlandsSurfaceSpec.localReliefAmplitude * (0.78 + (cell.elevationBias + 1) * 0.18);
  return microSignal * amplitude * edgeFalloff;
}

export function terrainHeightForCell(
  worldSeed: number,
  cell: TerrainCell,
  world: HexWorldPosition,
  hexSize: number
): number {
  const center = axialToWorld(cell.coord, hexSize);
  const local = { x: finite(world.x) - center.x, z: finite(world.z) - center.z };
  return globalLowlandHeight(worldSeed, world) + cellInteriorDetail(cell, local, hexSize);
}

export function terrainHeightAtWorld(
  map: RealmTerrainMap,
  world: HexWorldPosition,
  hexSize = hegemonyLowlandsSurfaceSpec.hexSize
): number {
  const nearest = worldToNearestAxial(world, hexSize);
  const cell = terrainCellByCoord(map, nearest);
  return cell
    ? terrainHeightForCell(map.worldSeed, cell, world, hexSize)
    : globalLowlandHeight(map.worldSeed, world);
}
