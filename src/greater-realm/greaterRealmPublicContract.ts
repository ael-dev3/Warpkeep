export const GREATER_REALM_PROTOCOL_VERSION = 17 as const;
export const GREATER_REALM_RENDERER_CONTRACT_VERSION = 'greater-realm-renderer-v1' as const;

export const GREATER_REALM_PUBLIC_LIMITS = Object.freeze({
  maximumWindowRadius: 4,
  maximumChunksPerWindow: 81,
  maximumChunkSourceCells: 225,
  maximumChunkVisibleCells: 384,
  maximumResourceLocations: 128,
  maximumRoutePageCells: 128
});

export const GREATER_REALM_HYDRO_REGIME = Object.freeze({
  DRY: 0,
  OCEAN: 1,
  LAKE: 2,
  RIVER: 3,
  STREAM: 4,
  SEA: 5,
  MARSH: 6
} as const);

export const GREATER_REALM_TRAVEL_CLASS = Object.freeze({
  NONE: 0,
  TRACK: 1,
  ROAD: 2,
  CARRIAGEWAY: 3,
  FORD: 4
} as const);

export const GREATER_REALM_HABITAT_CLASS = Object.freeze({
  NONE: 0,
  PLAINS: 1,
  FOREST: 2,
  TAIGA: 3,
  JUNGLE: 4,
  SWAMP: 5,
  SAVANNA: 6,
  DESERT: 7,
  ALPINE: 8,
  SNOW: 9
} as const);

export const GREATER_REALM_FEATURE_CLASS = Object.freeze({
  NONE: 0,
  ABANDONED_RUIN: 1,
  RUINED_WALL: 2,
  WAYSTONE: 3,
  LAMP_POST: 4
} as const);

export const GREATER_REALM_AMBIENCE_CLASS = Object.freeze({
  NONE: 0,
  RABBIT_HABITAT: 1,
  CIVILIAN_FOOTFALL: 2,
  GUARD_POST: 3,
  COURIER_ROUTE: 4,
  EXOTIC_COURIER_ROUTE: 5
} as const);

export type GreaterRealmLod = 0 | 1 | 2 | 3;
export type GreaterRealmHydroRegime =
  typeof GREATER_REALM_HYDRO_REGIME[keyof typeof GREATER_REALM_HYDRO_REGIME];
export type GreaterRealmTravelClass =
  typeof GREATER_REALM_TRAVEL_CLASS[keyof typeof GREATER_REALM_TRAVEL_CLASS];
export type GreaterRealmResourceKind = 'food' | 'wood' | 'stone' | 'gold';

export type GreaterRealmAtlasCoordinate = Readonly<{
  atlasQ: number;
  atlasR: number;
}>;

export type GreaterRealmRegionDto = Readonly<{
  regionId: string;
  ordinal: number;
  publicName: string;
  tier: 1;
  cellCount: number;
  passableCellCount: number;
  chunkCount: number;
  castleCapacity: number;
  resourceLocationCount: number;
  resourceNodeCount: number;
  foodNodeCount: number;
  woodNodeCount: number;
  stoneNodeCount: number;
  goldNodeCount: number;
}>;

/** The exact, declassified v17 bootstrap projection. */
export type GreaterRealmBootstrapDto = Readonly<{
  atlasId: string;
  publicReleaseId: string;
  name: string;
  protocolVersion: typeof GREATER_REALM_PROTOCOL_VERSION;
  generatorVersion: string;
  runtimePartitionVersion: string;
  rendererContractVersion: string;
  revision: bigint;
  visibleTierMax: 1;
  navigationTierMax: 1;
  foundingTierMax: 1;
  visibleRegionCount: number;
  visibleCellCount: number;
  visibleChunkCount: number;
  castleCapacity: number;
  mode: string;
  regions: readonly GreaterRealmRegionDto[];
  myCastleId: bigint;
  myCellKey?: string;
}>;

export type GreaterRealmWindowChunkDto = Readonly<{
  chunkHandle: string;
  binQ: number;
  binR: number;
  coreCellCount: number;
  apronCellCount: number;
  lod0CellCount: number;
  lod1CellCount: number;
  lod2CellCount: number;
  lod3CellCount: number;
}>;

export type GreaterRealmWindowDto = Readonly<{
  atlasId: string;
  revision: bigint;
  centerQ: number;
  centerR: number;
  radius: number;
  chunks: readonly GreaterRealmWindowChunkDto[];
}>;

/**
 * Exact public player cell. Generator-only topology, local coordinates,
 * candidate material, and route-tree membership are deliberately absent.
 */
export type GreaterRealmPublicCellDto = Readonly<{
  cellKey: string;
  chunkHandle: string;
  regionId: string;
  atlasQ: number;
  atlasR: number;
  tier: 1;
  passable: boolean;
  elevation: number;
  slope: number;
  aspect: number;
  profileCurvature: number;
  planCurvature: number;
  geologicalBarrierBand: number;
  biomeClass: number;
  landformClass: number;
  yieldClass: number;
  movementCost: number;
  sealedBoundaryMask: number;
  hydroRegime: GreaterRealmHydroRegime;
  hydroBodyId?: string;
  hydroDepthClass: number;
  hydroSurfaceMilli: number;
  hydroFlowDirection?: number;
  flowAccumulation: bigint;
  bankVariant: number;
  hydrologyRevision: number;
  travelClass: GreaterRealmTravelClass;
  wetness: number;
  exposure: number;
  coastDistance: number;
  freshwaterDistance: number;
  temperature: number;
  moisture: number;
  habitatClass: number;
  canopyBasisPoints: number;
  groundcoverBasisPoints: number;
  wildflowerBasisPoints: number;
  featureClass: number;
  ambienceClass: number;
  presentationVariant: number;
}>;

export type GreaterRealmResourceLocationDto = Readonly<{
  locationId: string;
  cellKey: string;
  regionId: string;
  atlasQ: number;
  atlasR: number;
  resourceKind: GreaterRealmResourceKind;
  nodeCount: number;
  policyVersion: string;
}>;

export type GreaterRealmChunkDto = Readonly<{
  atlasId: string;
  revision: bigint;
  chunkHandle: string;
  lod: GreaterRealmLod;
  sourceCellCount: number;
  coreCells: readonly GreaterRealmPublicCellDto[];
  apronCells: readonly GreaterRealmPublicCellDto[];
  resourceLocations: readonly GreaterRealmResourceLocationDto[];
}>;

export type GreaterRealmRoutePageDto = Readonly<{
  atlasId: string;
  revision: bigint;
  cells: readonly GreaterRealmPublicCellDto[];
  totalLength: number;
  nextOffset?: number;
  complete: boolean;
}>;

export type GreaterRealmWindowRequest = Readonly<{
  centerQ: number;
  centerR: number;
  radius: number;
  expectedRevision: bigint;
}>;

export type GreaterRealmChunkRequest = Readonly<{
  chunkHandle: string;
  lod: GreaterRealmLod;
  expectedRevision: bigint;
}>;

export type GreaterRealmRoutePlanRequest = Readonly<{
  originCellKey: string;
  destinationCellKey: string;
  offset: number;
  limit: number;
  expectedRevision: bigint;
}>;

export class GreaterRealmPublicContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmPublicContractError';
  }
}

const CHUNK_HANDLE = /^GRK-[A-Z2-7]{26}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const HYDRO_BODY_ID = /^GRW-[A-Z2-7]{26}$/u;
const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const RESOURCE_KINDS = new Set<GreaterRealmResourceKind>(['food', 'wood', 'stone', 'gold']);
const TIER_ONE_REGIONS = Object.freeze([
  Object.freeze({ regionId: 'T1_LOWLANDS', publicName: 'The Hegemony Lowlands', ordinal: 0 }),
  Object.freeze({ regionId: 'T1_FROSTMERE', publicName: 'Frostmere Reach', ordinal: 1 }),
  Object.freeze({ regionId: 'T1_SUNSCAR', publicName: 'Sunscar Expanse', ordinal: 2 }),
  Object.freeze({ regionId: 'T1_MIREFEN', publicName: 'Mirefen Delta', ordinal: 3 }),
  Object.freeze({ regionId: 'T1_STONEWAKE', publicName: 'Stonewake Isles', ordinal: 4 }),
  Object.freeze({ regionId: 'T1_EMBERWOOD', publicName: 'Emberwood March', ordinal: 5 })
]);
const TIER_ONE_REGION_IDS: ReadonlySet<string> = new Set(
  TIER_ONE_REGIONS.map((region) => region.regionId),
);

function fail(code: string): never {
  throw new GreaterRealmPublicContractError(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  code: string
) {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !allowed.has(key))
  ) fail(code);
}

function integer(value: unknown, minimum: number, maximum: number, code: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(code);
  }
  return value as number;
}

function u32(value: unknown, code: string, maximum = 0xffff_ffff) {
  return integer(value, 0, maximum, code);
}

function i32(value: unknown, code: string) {
  return integer(value, -0x8000_0000, 0x7fff_ffff, code);
}

function u64(value: unknown, code: string) {
  if (typeof value !== 'bigint' || value < 0n || value > 0xffff_ffff_ffff_ffffn) fail(code);
  return value;
}

function bool(value: unknown, code: string) {
  if (typeof value !== 'boolean') fail(code);
  return value;
}

function safeString(value: unknown, maximum: number, code: string) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized !== value
    || normalized.length === 0
    || normalized.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) fail(code);
  return value;
}

function identifier(value: unknown, pattern: RegExp, code: string) {
  const result = safeString(value, 128, code);
  if (!pattern.test(result)) fail(code);
  return result;
}

function optionalIdentifier(value: unknown, pattern: RegExp, code: string) {
  return value === undefined ? undefined : identifier(value, pattern, code);
}

function tierOneRegionId(value: unknown, code: string) {
  const regionId = identifier(value, PUBLIC_ID, code);
  if (!TIER_ONE_REGION_IDS.has(regionId)) fail(code);
  return regionId;
}

function lod(value: unknown, code: string): GreaterRealmLod {
  return integer(value, 0, 3, code) as GreaterRealmLod;
}

export function greaterRealmCoordinateKey(value: GreaterRealmAtlasCoordinate) {
  return `${value.atlasQ},${value.atlasR}`;
}

function decodeRegion(value: unknown): GreaterRealmRegionDto {
  const code = 'GREATER_REALM_BOOTSTRAP_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'regionId', 'ordinal', 'publicName', 'tier', 'cellCount', 'passableCellCount',
    'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
    'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount'
  ], [], code);
  const cellCount = u32(row.cellCount, code, 1_000_000);
  const passableCellCount = u32(row.passableCellCount, code, cellCount);
  const resourceNodeCount = u32(row.resourceNodeCount, code, 1_000_000);
  const resourceCounts = [row.foodNodeCount, row.woodNodeCount, row.stoneNodeCount, row.goldNodeCount]
    .map((count) => u32(count, code, 1_000_000));
  if (
    resourceCounts.reduce((sum, count) => sum + count, 0) !== resourceNodeCount
    || resourceNodeCount !== 2_000
    || resourceCounts.some((count) => count !== 500)
  ) fail(code);
  return Object.freeze({
    regionId: tierOneRegionId(row.regionId, code),
    ordinal: u32(row.ordinal, code, 127),
    publicName: safeString(row.publicName, 128, code),
    tier: integer(row.tier, 1, 1, code) as 1,
    cellCount,
    passableCellCount,
    chunkCount: u32(row.chunkCount, code, 1_000_000),
    castleCapacity: u32(row.castleCapacity, code, 1_000_000),
    resourceLocationCount: u32(row.resourceLocationCount, code, 1_000_000),
    resourceNodeCount,
    foodNodeCount: resourceCounts[0]!,
    woodNodeCount: resourceCounts[1]!,
    stoneNodeCount: resourceCounts[2]!,
    goldNodeCount: resourceCounts[3]!
  });
}

export function decodeGreaterRealmBootstrapDto(value: unknown): GreaterRealmBootstrapDto {
  const code = 'GREATER_REALM_BOOTSTRAP_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'atlasId', 'publicReleaseId', 'name', 'protocolVersion', 'generatorVersion',
    'runtimePartitionVersion', 'rendererContractVersion', 'revision', 'visibleTierMax',
    'navigationTierMax', 'foundingTierMax', 'visibleRegionCount', 'visibleCellCount',
    'visibleChunkCount', 'castleCapacity', 'mode', 'regions', 'myCastleId'
  ], ['myCellKey'], code);
  if (!Array.isArray(row.regions)) fail(code);
  const regions = Object.freeze(row.regions.map(decodeRegion));
  const visibleRegionCount = u32(row.visibleRegionCount, code, 128);
  if (
    visibleRegionCount !== TIER_ONE_REGIONS.length
    || regions.length !== TIER_ONE_REGIONS.length
    || regions.some((region, index) => {
      const expected = TIER_ONE_REGIONS[index]!;
      return region.regionId !== expected.regionId
        || region.publicName !== expected.publicName
        || region.ordinal !== expected.ordinal
        || region.castleCapacity !== 100;
    })
  ) fail(code);
  const total = (field: keyof GreaterRealmRegionDto) => regions.reduce(
    (sum, region) => sum + (region[field] as number),
    0
  );
  const visibleCellCount = u32(row.visibleCellCount, code, 10_000_000);
  const visibleChunkCount = u32(row.visibleChunkCount, code, 1_000_000);
  const castleCapacity = u32(row.castleCapacity, code, 1_000_000);
  if (
    total('cellCount') !== visibleCellCount
    || total('chunkCount') < visibleChunkCount
    || total('castleCapacity') !== castleCapacity
    || castleCapacity !== 600
  ) fail(code);
  const mode = safeString(row.mode, 32, code);
  if (mode !== 'canary' && mode !== 'active') fail(code);
  const myCellKey = optionalIdentifier(row.myCellKey, PUBLIC_ID, code);
  return Object.freeze({
    atlasId: identifier(row.atlasId, PUBLIC_ID, code),
    publicReleaseId: identifier(row.publicReleaseId, PUBLIC_RELEASE_ID, code),
    name: safeString(row.name, 128, code),
    protocolVersion: integer(
      row.protocolVersion,
      GREATER_REALM_PROTOCOL_VERSION,
      GREATER_REALM_PROTOCOL_VERSION,
      code
    ) as typeof GREATER_REALM_PROTOCOL_VERSION,
    generatorVersion: identifier(row.generatorVersion, VERSION, code),
    runtimePartitionVersion: identifier(row.runtimePartitionVersion, VERSION, code),
    rendererContractVersion: (() => {
      const version = identifier(row.rendererContractVersion, VERSION, code);
      if (version !== GREATER_REALM_RENDERER_CONTRACT_VERSION) fail(code);
      return version;
    })(),
    revision: u64(row.revision, code),
    visibleTierMax: integer(row.visibleTierMax, 1, 1, code) as 1,
    navigationTierMax: integer(row.navigationTierMax, 1, 1, code) as 1,
    foundingTierMax: integer(row.foundingTierMax, 1, 1, code) as 1,
    visibleRegionCount,
    visibleCellCount,
    visibleChunkCount,
    castleCapacity,
    mode,
    regions,
    myCastleId: u64(row.myCastleId, code),
    ...(myCellKey === undefined ? {} : { myCellKey })
  });
}

function decodeWindowChunk(value: unknown): GreaterRealmWindowChunkDto {
  const code = 'GREATER_REALM_WINDOW_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'chunkHandle', 'binQ', 'binR', 'coreCellCount', 'apronCellCount',
    'lod0CellCount', 'lod1CellCount', 'lod2CellCount', 'lod3CellCount'
  ], [], code);
  const coreCellCount = u32(
    row.coreCellCount,
    code,
    GREATER_REALM_PUBLIC_LIMITS.maximumChunkSourceCells
  );
  const apronCellCount = u32(
    row.apronCellCount,
    code,
    GREATER_REALM_PUBLIC_LIMITS.maximumChunkVisibleCells
  );
  const counts = [row.lod0CellCount, row.lod1CellCount, row.lod2CellCount, row.lod3CellCount]
    .map((count) => u32(
      count,
      code,
      GREATER_REALM_PUBLIC_LIMITS.maximumChunkVisibleCells
    ));
  const expectedLod1 = Math.ceil((coreCellCount + apronCellCount) / 2);
  const expectedLod2 = Math.ceil(expectedLod1 / 2);
  const expectedLod3 = Math.ceil(expectedLod2 / 2);
  if (
    coreCellCount < 1
    || counts[0] !== coreCellCount
    || counts[1] !== expectedLod1
    || counts[2] !== expectedLod2
    || counts[3] !== expectedLod3
    || coreCellCount + apronCellCount > GREATER_REALM_PUBLIC_LIMITS.maximumChunkVisibleCells
  ) fail(code);
  return Object.freeze({
    chunkHandle: identifier(row.chunkHandle, CHUNK_HANDLE, code),
    binQ: i32(row.binQ, code),
    binR: i32(row.binR, code),
    coreCellCount,
    apronCellCount,
    lod0CellCount: counts[0]!,
    lod1CellCount: counts[1]!,
    lod2CellCount: counts[2]!,
    lod3CellCount: counts[3]!
  });
}

export function decodeGreaterRealmWindowDto(value: unknown): GreaterRealmWindowDto {
  const code = 'GREATER_REALM_WINDOW_INVALID';
  const row = record(value, code);
  exactKeys(row, ['atlasId', 'revision', 'centerQ', 'centerR', 'radius', 'chunks'], [], code);
  if (!Array.isArray(row.chunks) || row.chunks.length > GREATER_REALM_PUBLIC_LIMITS.maximumChunksPerWindow) {
    fail(code);
  }
  const radius = u32(row.radius, code, GREATER_REALM_PUBLIC_LIMITS.maximumWindowRadius);
  const centerQ = i32(row.centerQ, code);
  const centerR = i32(row.centerR, code);
  const chunks = Object.freeze(row.chunks.map(decodeWindowChunk));
  if (
    new Set(chunks.map((chunk) => chunk.chunkHandle)).size !== chunks.length
    || new Set(chunks.map((chunk) => `${chunk.binQ},${chunk.binR}`)).size !== chunks.length
    || chunks.some((chunk) => (
      Math.abs(chunk.binQ - centerQ) > radius || Math.abs(chunk.binR - centerR) > radius
    ))
  ) fail(code);
  return Object.freeze({
    atlasId: identifier(row.atlasId, PUBLIC_ID, code),
    revision: u64(row.revision, code),
    centerQ,
    centerR,
    radius,
    chunks
  });
}

export function decodeGreaterRealmPublicCellDto(value: unknown): GreaterRealmPublicCellDto {
  const code = 'GREATER_REALM_CHUNK_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'cellKey', 'chunkHandle', 'regionId', 'atlasQ', 'atlasR', 'tier', 'passable',
    'elevation', 'slope', 'aspect', 'profileCurvature', 'planCurvature',
    'geologicalBarrierBand', 'biomeClass', 'landformClass', 'yieldClass',
    'movementCost', 'sealedBoundaryMask', 'hydroRegime', 'hydroDepthClass',
    'hydroSurfaceMilli', 'flowAccumulation', 'bankVariant', 'hydrologyRevision',
    'travelClass', 'wetness', 'exposure', 'coastDistance', 'freshwaterDistance',
    'temperature', 'moisture', 'habitatClass', 'canopyBasisPoints',
    'groundcoverBasisPoints', 'wildflowerBasisPoints', 'featureClass',
    'ambienceClass', 'presentationVariant'
  ], ['hydroBodyId', 'hydroFlowDirection'], code);
  const passable = bool(row.passable, code);
  const movementCost = u32(row.movementCost, code);
  if (
    passable
      ? movementCost < 1 || movementCost >= 1_000_000
      : movementCost !== 1_000_000
  ) fail(code);
  const hydroRegime = u32(
    row.hydroRegime,
    code,
    GREATER_REALM_HYDRO_REGIME.MARSH
  ) as GreaterRealmHydroRegime;
  const hydroBodyId = optionalIdentifier(row.hydroBodyId, HYDRO_BODY_ID, code);
  const hydroDepthClass = u32(row.hydroDepthClass, code, 3);
  const hydroFlowDirection = row.hydroFlowDirection === undefined
    ? undefined
    : u32(row.hydroFlowDirection, code, 5);
  if (
    (hydroRegime === GREATER_REALM_HYDRO_REGIME.DRY
      ? hydroDepthClass !== 0 || hydroBodyId !== undefined
      : hydroDepthClass === 0 || hydroBodyId === undefined)
  ) fail(code);
  const travelClass = u32(
    row.travelClass,
    code,
    GREATER_REALM_TRAVEL_CLASS.FORD
  ) as GreaterRealmTravelClass;
  if (
    travelClass === GREATER_REALM_TRAVEL_CLASS.FORD
    && (!passable || (
      hydroRegime !== GREATER_REALM_HYDRO_REGIME.RIVER
      && hydroRegime !== GREATER_REALM_HYDRO_REGIME.STREAM
    ))
  ) fail(code);
  const groundcoverBasisPoints = u32(row.groundcoverBasisPoints, code, 10_000);
  const wildflowerBasisPoints = u32(row.wildflowerBasisPoints, code, 10_000);
  if (wildflowerBasisPoints > groundcoverBasisPoints) fail(code);
  return Object.freeze({
    cellKey: identifier(row.cellKey, PUBLIC_ID, code),
    chunkHandle: identifier(row.chunkHandle, CHUNK_HANDLE, code),
    regionId: tierOneRegionId(row.regionId, code),
    atlasQ: i32(row.atlasQ, code),
    atlasR: i32(row.atlasR, code),
    tier: integer(row.tier, 1, 1, code) as 1,
    passable,
    elevation: i32(row.elevation, code),
    slope: u32(row.slope, code, 0xffff),
    aspect: u32(row.aspect, code, 6),
    profileCurvature: i32(row.profileCurvature, code),
    planCurvature: i32(row.planCurvature, code),
    geologicalBarrierBand: u32(row.geologicalBarrierBand, code, 3),
    biomeClass: u32(row.biomeClass, code, 23),
    landformClass: u32(row.landformClass, code, 17),
    yieldClass: u32(row.yieldClass, code, 3),
    movementCost,
    sealedBoundaryMask: u32(row.sealedBoundaryMask, code, 0x3f),
    hydroRegime,
    ...(hydroBodyId === undefined ? {} : { hydroBodyId }),
    hydroDepthClass,
    hydroSurfaceMilli: i32(row.hydroSurfaceMilli, code),
    ...(hydroFlowDirection === undefined ? {} : { hydroFlowDirection }),
    flowAccumulation: u64(row.flowAccumulation, code),
    bankVariant: u32(row.bankVariant, code),
    hydrologyRevision: u32(row.hydrologyRevision, code, 0xffff),
    travelClass,
    wetness: u32(row.wetness, code, 0xffff),
    exposure: i32(row.exposure, code),
    coastDistance: u32(row.coastDistance, code, 0xffff),
    freshwaterDistance: u32(row.freshwaterDistance, code, 0xffff),
    temperature: i32(row.temperature, code),
    moisture: i32(row.moisture, code),
    habitatClass: u32(row.habitatClass, code, 9),
    canopyBasisPoints: u32(row.canopyBasisPoints, code, 10_000),
    groundcoverBasisPoints,
    wildflowerBasisPoints,
    featureClass: u32(row.featureClass, code, 4),
    ambienceClass: u32(row.ambienceClass, code, 5),
    presentationVariant: u32(row.presentationVariant, code)
  });
}

function decodeResourceLocation(value: unknown): GreaterRealmResourceLocationDto {
  const code = 'GREATER_REALM_CHUNK_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'locationId', 'cellKey', 'regionId', 'atlasQ', 'atlasR', 'resourceKind',
    'nodeCount', 'policyVersion'
  ], [], code);
  const resourceKind = safeString(row.resourceKind, 16, code) as GreaterRealmResourceKind;
  if (!RESOURCE_KINDS.has(resourceKind)) fail(code);
  return Object.freeze({
    locationId: identifier(row.locationId, PUBLIC_ID, code),
    cellKey: identifier(row.cellKey, PUBLIC_ID, code),
    regionId: tierOneRegionId(row.regionId, code),
    atlasQ: i32(row.atlasQ, code),
    atlasR: i32(row.atlasR, code),
    resourceKind,
    nodeCount: integer(row.nodeCount, 1, 0xffff_ffff, code),
    policyVersion: identifier(row.policyVersion, VERSION, code)
  });
}

export function decodeGreaterRealmChunkDto(value: unknown): GreaterRealmChunkDto {
  const code = 'GREATER_REALM_CHUNK_INVALID';
  const row = record(value, code);
  exactKeys(row, [
    'atlasId', 'revision', 'chunkHandle', 'lod', 'sourceCellCount', 'coreCells',
    'apronCells', 'resourceLocations'
  ], [], code);
  if (
    !Array.isArray(row.coreCells)
    || !Array.isArray(row.apronCells)
    || !Array.isArray(row.resourceLocations)
  ) fail(code);
  const selectedLod = lod(row.lod, code);
  const sourceCellCount = integer(
    row.sourceCellCount,
    1,
    GREATER_REALM_PUBLIC_LIMITS.maximumChunkSourceCells,
    code
  );
  const coreCells = Object.freeze(row.coreCells.map(decodeGreaterRealmPublicCellDto));
  const apronCells = Object.freeze(row.apronCells.map(decodeGreaterRealmPublicCellDto));
  if (
    coreCells.length < 1
    || coreCells.length > sourceCellCount
    || (selectedLod === 0 && coreCells.length !== sourceCellCount)
    || coreCells.length + apronCells.length > GREATER_REALM_PUBLIC_LIMITS.maximumChunkVisibleCells
    || row.resourceLocations.length > GREATER_REALM_PUBLIC_LIMITS.maximumResourceLocations
  ) fail(code);
  const chunkHandle = identifier(row.chunkHandle, CHUNK_HANDLE, code);
  if (
    coreCells.some((cell) => cell.chunkHandle !== chunkHandle)
    || apronCells.some((cell) => cell.chunkHandle === chunkHandle)
  ) fail(code);
  const coordinates = [...coreCells, ...apronCells].map(greaterRealmCoordinateKey);
  const cellKeys = [...coreCells, ...apronCells].map((cell) => cell.cellKey);
  if (
    new Set(coordinates).size !== coordinates.length
    || new Set(cellKeys).size !== cellKeys.length
  ) fail(code);
  const resourceLocations = Object.freeze(row.resourceLocations.map(decodeResourceLocation));
  const returnedCells = new Map(
    [...coreCells, ...apronCells].map((cell) => [cell.cellKey, cell] as const)
  );
  if (
    new Set(resourceLocations.map((resource) => resource.locationId)).size
      !== resourceLocations.length
    || new Set(resourceLocations.map((resource) => (
      `${resource.cellKey}:${resource.resourceKind}`
    ))).size !== resourceLocations.length
    || resourceLocations.some((resource) => {
      const cell = returnedCells.get(resource.cellKey);
      if (!cell) return selectedLod === 0;
      return resource.regionId !== cell.regionId
        || resource.atlasQ !== cell.atlasQ
        || resource.atlasR !== cell.atlasR;
    })
  ) {
    fail(code);
  }
  return Object.freeze({
    atlasId: identifier(row.atlasId, PUBLIC_ID, code),
    revision: u64(row.revision, code),
    chunkHandle,
    lod: selectedLod,
    sourceCellCount,
    coreCells,
    apronCells,
    resourceLocations
  });
}

export function decodeGreaterRealmRoutePageDto(value: unknown): GreaterRealmRoutePageDto {
  const code = 'GREATER_REALM_ROUTE_PLAN_INVALID';
  const row = record(value, code);
  exactKeys(row, ['atlasId', 'revision', 'cells', 'totalLength', 'complete'], ['nextOffset'], code);
  if (!Array.isArray(row.cells) || row.cells.length > GREATER_REALM_PUBLIC_LIMITS.maximumRoutePageCells) {
    fail(code);
  }
  const cells = Object.freeze(row.cells.map(decodeGreaterRealmPublicCellDto));
  if (cells.some((cell) => !cell.passable)) fail(code);
  const complete = bool(row.complete, code);
  const nextOffset = row.nextOffset === undefined ? undefined : u32(row.nextOffset, code);
  if (complete === (nextOffset !== undefined)) fail(code);
  const totalLength = u32(row.totalLength, code, 8_193);
  const coordinateKeys = cells.map(greaterRealmCoordinateKey);
  if (
    totalLength < cells.length
    || new Set(cells.map((cell) => cell.cellKey)).size !== cells.length
    || new Set(coordinateKeys).size !== cells.length
    || cells.some((cell, index) => {
      if (index === 0) return false;
      const previous = cells[index - 1]!;
      const dq = cell.atlasQ - previous.atlasQ;
      const dr = cell.atlasR - previous.atlasR;
      return !(
        (dq === 1 && dr === 0)
        || (dq === 1 && dr === -1)
        || (dq === 0 && dr === -1)
        || (dq === -1 && dr === 0)
        || (dq === -1 && dr === 1)
        || (dq === 0 && dr === 1)
      );
    })
  ) fail(code);
  return Object.freeze({
    atlasId: identifier(row.atlasId, PUBLIC_ID, code),
    revision: u64(row.revision, code),
    cells,
    totalLength,
    ...(nextOffset === undefined ? {} : { nextOffset }),
    complete
  });
}

export function createGreaterRealmWindowRequest(
  value: GreaterRealmWindowRequest
): GreaterRealmWindowRequest {
  const code = 'GREATER_REALM_WINDOW_REQUEST_INVALID';
  return Object.freeze({
    centerQ: i32(value.centerQ, code),
    centerR: i32(value.centerR, code),
    radius: u32(value.radius, code, GREATER_REALM_PUBLIC_LIMITS.maximumWindowRadius),
    expectedRevision: u64(value.expectedRevision, code)
  });
}

export function createGreaterRealmChunkRequest(
  value: GreaterRealmChunkRequest
): GreaterRealmChunkRequest {
  const code = 'GREATER_REALM_CHUNK_REQUEST_INVALID';
  return Object.freeze({
    chunkHandle: identifier(value.chunkHandle, CHUNK_HANDLE, code),
    lod: lod(value.lod, code),
    expectedRevision: u64(value.expectedRevision, code)
  });
}

export function createGreaterRealmRoutePlanRequest(
  value: GreaterRealmRoutePlanRequest
): GreaterRealmRoutePlanRequest {
  const code = 'GREATER_REALM_ROUTE_PLAN_REQUEST_INVALID';
  return Object.freeze({
    originCellKey: identifier(value.originCellKey, PUBLIC_ID, code),
    destinationCellKey: identifier(value.destinationCellKey, PUBLIC_ID, code),
    offset: u32(value.offset, code),
    limit: integer(value.limit, 1, GREATER_REALM_PUBLIC_LIMITS.maximumRoutePageCells, code),
    expectedRevision: u64(value.expectedRevision, code)
  });
}

/** Testable cross-response invariant for stable successively smaller LOD subsets. */
export function assertGreaterRealmMonotonicLodChunks(
  values: readonly GreaterRealmChunkDto[]
) {
  const ordered = [...values].sort((left, right) => left.lod - right.lod);
  if (ordered.length === 0) return;
  if (new Set(ordered.map((chunk) => chunk.lod)).size !== ordered.length) {
    fail('GREATER_REALM_CHUNK_LOD_INVALID');
  }
  const first = ordered[0]!;
  const sourceKeySet = new Set(
    [...first.coreCells, ...first.apronCells].map((cell) => cell.cellKey)
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const chunk = ordered[index]!;
    if (
      chunk.chunkHandle !== first.chunkHandle
      || chunk.atlasId !== first.atlasId
      || chunk.revision !== first.revision
      || chunk.sourceCellCount !== first.sourceCellCount
      || (index > 0 && (
        chunk.coreCells.length + chunk.apronCells.length
        > ordered[index - 1]!.coreCells.length + ordered[index - 1]!.apronCells.length
      ))
      || [...chunk.coreCells, ...chunk.apronCells]
        .some((cell) => !sourceKeySet.has(cell.cellKey))
    ) fail('GREATER_REALM_CHUNK_LOD_INVALID');
    if (index > 0) {
      const previous = new Set(
        [...ordered[index - 1]!.coreCells, ...ordered[index - 1]!.apronCells]
          .map((cell) => cell.cellKey)
      );
      if ([...chunk.coreCells, ...chunk.apronCells]
        .some((cell) => !previous.has(cell.cellKey))) {
        fail('GREATER_REALM_CHUNK_LOD_INVALID');
      }
    }
  }
}

export function assertGreaterRealmChunkMatchesDescriptor(
  chunk: GreaterRealmChunkDto,
  descriptor: GreaterRealmWindowChunkDto
) {
  const visibleCount = chunk.coreCells.length + chunk.apronCells.length;
  const expectedVisibleCount = chunk.lod === 0
    ? descriptor.coreCellCount + descriptor.apronCellCount
    : [
      descriptor.lod0CellCount,
      descriptor.lod1CellCount,
      descriptor.lod2CellCount,
      descriptor.lod3CellCount
    ][chunk.lod]!;
  if (
    chunk.chunkHandle !== descriptor.chunkHandle
    || chunk.sourceCellCount !== descriptor.coreCellCount
    || visibleCount !== expectedVisibleCount
    || (chunk.lod === 0 && chunk.apronCells.length !== descriptor.apronCellCount)
  ) fail('GREATER_REALM_CHUNK_DESCRIPTOR_MISMATCH');
}
