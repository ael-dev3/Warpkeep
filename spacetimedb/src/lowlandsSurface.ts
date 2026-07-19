const UINT32_RANGE = 4_294_967_296;
const SQRT_3 = Math.sqrt(3);

function hashSeedString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function signedIntegerBits(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
}

/** Standalone copy of the stable seed contract, kept free of world generation side effects. */
function deriveChannelSeed(
  worldSeed: number,
  q: number,
  r: number,
  channel: string,
  index = 0,
): number {
  let seed = mixUint32(worldSeed);
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(q), 0x9e3779b1));
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(r), 0x85ebca77));
  seed = mixUint32(seed ^ hashSeedString(channel));
  return mixUint32(seed ^ Math.imul(signedIntegerBits(index), 0xc2b2ae3d));
}

/**
 * Server/browser-neutral geometry constants for the canonical Lowlands ground.
 * Water policy and the Three.js terrain must consume this exact object so both
 * systems use one vertical coordinate system.
 */
export const GENESIS_LOWLANDS_SURFACE_SPEC = Object.freeze({
  hexSize: 1,
  soilCoverageTarget: 0.17,
  boundarySafeRatio: 0.16,
  centerClearRatio: 0.34,
  globalReliefAmplitude: 0.13,
  localReliefAmplitude: 0.045,
  globalWavelength: 5.6,
  secondaryWavelength: 2.9,
} as const);

export type LowlandsWorldPosition = Readonly<{ x: number; z: number }>;
export type LowlandsTerrainCell = Readonly<{ seed: number; elevationBias: number }>;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function seededUnitFloat(seed: number): number {
  return (mixUint32(seed) >>> 0) / UINT32_RANGE;
}

function seededSignedFloat(seed: number): number {
  return seededUnitFloat(seed) * 2 - 1;
}

function latticeValue(worldSeed: number, x: number, z: number, channel: string): number {
  return seededSignedFloat(deriveChannelSeed(worldSeed, x, z, channel));
}

function worldValueNoise(
  worldSeed: number,
  position: LowlandsWorldPosition,
  wavelength: number,
  channel: string,
): number {
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

export function canonicalLowlandsGlobalHeight(
  worldSeed: number,
  position: LowlandsWorldPosition,
): number {
  const broad = worldValueNoise(
    worldSeed,
    position,
    GENESIS_LOWLANDS_SURFACE_SPEC.globalWavelength,
    'global-relief-broad',
  );
  const secondary = worldValueNoise(
    worldSeed,
    position,
    GENESIS_LOWLANDS_SURFACE_SPEC.secondaryWavelength,
    'global-relief-secondary',
  );
  return (broad * 0.78 + secondary * 0.22)
    * GENESIS_LOWLANDS_SURFACE_SPEC.globalReliefAmplitude;
}

export function canonicalLowlandsPointyHexBoundaryDistance(
  local: LowlandsWorldPosition,
  hexSize: number,
): number {
  const size = Number.isFinite(hexSize) && hexSize > 0
    ? hexSize
    : GENESIS_LOWLANDS_SURFACE_SPEC.hexSize;
  const x = finite(local.x);
  const z = finite(local.z);
  return Math.max(
    Math.abs(z),
    Math.abs((2 * x) / SQRT_3),
    Math.abs(x / SQRT_3 + z),
    Math.abs(x / SQRT_3 - z),
  ) / size;
}

export function canonicalLowlandsCellInteriorEdgeFalloff(
  local: LowlandsWorldPosition,
  hexSize: number,
  boundarySafeRatio: number = GENESIS_LOWLANDS_SURFACE_SPEC.boundarySafeRatio,
): number {
  const boundaryDistance = canonicalLowlandsPointyHexBoundaryDistance(local, hexSize);
  const margin = clamp(finite(boundarySafeRatio, 0.16), 0.01, 0.49);
  if (boundaryDistance >= 1) return 0;
  return 1 - smoothstep(1 - margin, 1, boundaryDistance);
}

export function canonicalLowlandsCellInteriorDetail(
  cell: LowlandsTerrainCell,
  local: LowlandsWorldPosition,
  hexSize: number,
): number {
  const edgeFalloff = canonicalLowlandsCellInteriorEdgeFalloff(local, hexSize);
  if (edgeFalloff === 0) return 0;
  const frequency = 2.7
    + seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-frequency')) * 1.25;
  const phaseX = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-phase-x')) * Math.PI * 2;
  const phaseZ = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'micro-phase-z')) * Math.PI * 2;
  const diagonal = (finite(local.x) + finite(local.z) * 0.58) * frequency * 1.22;
  const primary = Math.sin(finite(local.x) * frequency + phaseX);
  const secondary = Math.cos(finite(local.z) * frequency * 1.08 + phaseZ);
  const tertiary = Math.sin(diagonal + (phaseX - phaseZ) * 0.4);
  const microSignal = primary * 0.48 + secondary * 0.32 + tertiary * 0.2;
  const amplitude = GENESIS_LOWLANDS_SURFACE_SPEC.localReliefAmplitude
    * (0.78 + (cell.elevationBias + 1) * 0.18);
  return microSignal * amplitude * edgeFalloff;
}

export function canonicalLowlandsAxialCenter(
  q: number,
  r: number,
): LowlandsWorldPosition {
  const size = GENESIS_LOWLANDS_SURFACE_SPEC.hexSize;
  return Object.freeze({
    x: size * SQRT_3 * (q + r * 0.5),
    z: size * 1.5 * r,
  });
}

/** Exact height used by the renderer at one canonical cell center. */
export function canonicalLowlandsTerrainCenterHeight(
  worldSeed: number,
  q: number,
  r: number,
): number {
  const cellSeed = deriveChannelSeed(worldSeed, q, r, 'cell');
  const elevationBias = seededSignedFloat(deriveChannelSeed(worldSeed, q, r, 'elevation'));
  return canonicalLowlandsGlobalHeight(worldSeed, canonicalLowlandsAxialCenter(q, r))
    + canonicalLowlandsCellInteriorDetail(
      { seed: cellSeed, elevationBias },
      { x: 0, z: 0 },
      GENESIS_LOWLANDS_SURFACE_SPEC.hexSize,
    );
}
