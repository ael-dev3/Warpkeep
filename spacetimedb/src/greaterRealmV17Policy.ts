export const GREATER_REALM_PROTOCOL_VERSION = 17;
export const GREATER_REALM_VISIBLE_TIER_MAX = 1;
export const GREATER_REALM_VISIBLE_REGION_COUNT = 6;
export const GREATER_REALM_CASTLE_CAPACITY = 600;
export const GREATER_REALM_CASTLES_PER_REGION = 100;
export const GREATER_REALM_WORKERS_PER_CASTLE = 4;
export const GREATER_REALM_RESOURCE_MARGIN_PER_SLOT = 5;
export const GREATER_REALM_RUNTIME_PARTITION_VERSION =
  'axial-bin-15-tier-one-filter-v1';
export const GREATER_REALM_LEGACY_LOWLANDS_BRIDGE_V1 = Object.freeze({
  mappedCellCount: 10_000,
  mappedCastleSlotCount: 100,
  mappedResourceCatalogCounts: Object.freeze({ food: 96, wood: 96, stone: 96, gold: 24 }),
  worldGenerationDigest: '4c111ec1f5e127c7cfd8f42f87c4085f94a4bc46bdacbdc9779866dfdb3edab6',
  castleSlotDigest: 'd770a084b7c8f59abbc505239a026a98e17bd55d3507c204cd1517858db017ed',
  goldSiteDigest: '84ea3eed9ff5cd3eb7e4704aee6fb562ef3f969c490e95d3bf88645abded7d7d',
  foodSiteDigest: '10756337e27138b536a250ad6bf704c603a8c3946c72a1f0d3a041630610ce72',
  woodSiteDigest: '3f0ae99d2052c32b7fec9aec6126e86f53031c13d619fcef12dd42a02b4063d6',
  stoneSiteDigest: '22c902d5bfb033e7faf3eaa303e89228d9aad0cff712853618dc34b994d28467',
} as const);
export const GREATER_REALM_MAX_COMPONENTS = 4096;
export const GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS = 128;
export const GREATER_REALM_MAX_CHUNK_IMPORT_ROWS = 256;
export const GREATER_REALM_MAX_CELL_IMPORT_ROWS = 256;
export const GREATER_REALM_MAX_SLOT_IMPORT_ROWS = 128;
export const GREATER_REALM_MAX_RESOURCE_IMPORT_ROWS = 256;
export const GREATER_REALM_MAX_VERIFY_ROWS = 256;
export const GREATER_REALM_MAX_CHUNK_CORE_CELLS = 225;
export const GREATER_REALM_MAX_CHUNK_APRON_CELLS = 384;
export const GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS = 384;
export const GREATER_REALM_MAX_ROUTE_DEPTH = 4096;
export const GREATER_REALM_MAX_ROUTE_PAGE = 128;
export const GREATER_REALM_MAX_WINDOW_RADIUS = 4;
export const GREATER_REALM_UNASSIGNED_RANK = 0xffff_ffff;
export const GREATER_REALM_HYDRO_REGIME = Object.freeze({
  DRY: 0,
  OCEAN: 1,
  LAKE: 2,
  RIVER: 3,
  STREAM: 4,
  SEA: 5,
  MARSH: 6,
} as const);
export const GREATER_REALM_TRAVEL_CLASS = Object.freeze({
  NONE: 0,
  TRACK: 1,
  ROAD: 2,
  CARRIAGEWAY: 3,
  FORD: 4,
} as const);
export const GREATER_REALM_EMPTY_VERIFY_DIGEST =
  'sha256-v1:6a09e667bb67ae853c6ef372a54ff53a510e527f9b05688c1f83d9ab5be0cd19:0:';

/**
 * Production builds intentionally compile every protocol-v17 mutation closed.
 * A later, separately reviewed release must replace this literal and prove the
 * exact publisher, predecessor schema, short-lived principal, and postflight.
 */
export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;
export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;

export const GREATER_REALM_PUBLIC_REGIONS = Object.freeze([
  Object.freeze({ id: 'T1_LOWLANDS', name: 'The Hegemony Lowlands', ordinal: 0 }),
  Object.freeze({ id: 'T1_FROSTMERE', name: 'Frostmere Reach', ordinal: 1 }),
  Object.freeze({ id: 'T1_SUNSCAR', name: 'Sunscar Expanse', ordinal: 2 }),
  Object.freeze({ id: 'T1_MIREFEN', name: 'Mirefen Delta', ordinal: 3 }),
  Object.freeze({ id: 'T1_STONEWAKE', name: 'Stonewake Isles', ordinal: 4 }),
  Object.freeze({ id: 'T1_EMBERWOOD', name: 'Emberwood March', ordinal: 5 }),
] as const);

export const GREATER_REALM_RESOURCE_KINDS = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold',
] as const);

export const GREATER_REALM_RELEASE_STATES = Object.freeze([
  'importing',
  'verifying',
  'ready',
  'canary',
  'active',
  'halted',
  'rolled-back',
] as const);

export const GREATER_REALM_VERIFY_PHASES = Object.freeze([
  'components',
  'chunks',
  'cells',
  'component-slots',
  'slots',
  'component-resources',
  'resources',
  'component-finalize',
  'complete',
] as const);

export type GreaterRealmResourceKind = typeof GREATER_REALM_RESOURCE_KINDS[number];
export type GreaterRealmVerifyPhase = typeof GREATER_REALM_VERIFY_PHASES[number];

export class GreaterRealmV17PolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmV17PolicyError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmV17PolicyError(code);
}

function requireSafeString(value: string, maximum: number, code: string): string {
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized !== value
    || normalized.length === 0
    || normalized.length > maximum
    || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(normalized)
  ) fail(code);
  return normalized;
}

export function requireGreaterRealmSafeInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

export function requireGreaterRealmOpaqueId(value: string, code: string): string {
  const normalized = requireSafeString(value, 128, code);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)) fail(code);
  return normalized;
}

export function requireGreaterRealmSha256(value: string, code: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) fail(code);
  return value;
}

export function requireGreaterRealmSourceCommit(value: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) fail('GREATER_REALM_SOURCE_COMMIT_INVALID');
  return value;
}

export function requireGreaterRealmVersion(value: string, code: string): string {
  const normalized = requireSafeString(value, 64, code);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(normalized)) fail(code);
  return normalized;
}

export function requireGreaterRealmPresentationString(value: string, code: string): string {
  return requireSafeString(value, 128, code);
}

export function requireGreaterRealmPublicRegion(regionId: string): typeof GREATER_REALM_PUBLIC_REGIONS[number] {
  const region = GREATER_REALM_PUBLIC_REGIONS.find(row => row.id === regionId);
  if (region === undefined) fail('GREATER_REALM_REGION_INVALID');
  return region;
}

export function requireGreaterRealmResourceKind(value: string): GreaterRealmResourceKind {
  if (!GREATER_REALM_RESOURCE_KINDS.includes(value as GreaterRealmResourceKind)) {
    fail('GREATER_REALM_RESOURCE_KIND_INVALID');
  }
  return value as GreaterRealmResourceKind;
}

export interface GreaterRealmReleaseInputV1 {
  atlasId: string;
  publicReleaseId: string;
  publicApprovalReceiptId: string;
  sourceCommit: string;
  generatorVersion: string;
  sourceFormatVersion: string;
  livingWorldVersion: string;
  runtimePartitionVersion: string;
  rendererContractVersion: string;
  expectedRegionCount: number;
  expectedComponentCount: number;
  expectedChunkCount: number;
  expectedCellCount: number;
  expectedSlotCount: number;
  expectedResourceNodeCount: number;
  expectedReleaseSha256: string;
  importEpoch: bigint;
}

export function validateGreaterRealmReleaseInputV1(input: GreaterRealmReleaseInputV1): void {
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.publicReleaseId, 'GREATER_REALM_PUBLIC_RELEASE_ID_INVALID');
  requireGreaterRealmOpaqueId(
    input.publicApprovalReceiptId,
    'GREATER_REALM_PUBLIC_APPROVAL_RECEIPT_INVALID',
  );
  requireGreaterRealmSourceCommit(input.sourceCommit);
  requireGreaterRealmVersion(input.generatorVersion, 'GREATER_REALM_GENERATOR_VERSION_INVALID');
  requireGreaterRealmVersion(input.sourceFormatVersion, 'GREATER_REALM_SOURCE_FORMAT_INVALID');
  requireGreaterRealmVersion(input.livingWorldVersion, 'GREATER_REALM_LIVING_WORLD_VERSION_INVALID');
  requireGreaterRealmVersion(input.runtimePartitionVersion, 'GREATER_REALM_PARTITION_VERSION_INVALID');
  if (input.runtimePartitionVersion !== GREATER_REALM_RUNTIME_PARTITION_VERSION) {
    fail('GREATER_REALM_PARTITION_VERSION_INVALID');
  }
  requireGreaterRealmVersion(input.rendererContractVersion, 'GREATER_REALM_RENDERER_VERSION_INVALID');
  requireGreaterRealmSha256(input.expectedReleaseSha256, 'GREATER_REALM_RELEASE_SHA_INVALID');
  for (const [value, maximum, code] of [
    [input.expectedRegionCount, GREATER_REALM_VISIBLE_REGION_COUNT, 'GREATER_REALM_REGION_COUNT_INVALID'],
    [input.expectedComponentCount, GREATER_REALM_MAX_COMPONENTS, 'GREATER_REALM_COMPONENT_COUNT_INVALID'],
    [input.expectedChunkCount, 1_000_000, 'GREATER_REALM_CHUNK_COUNT_INVALID'],
    [input.expectedCellCount, 1_000_000, 'GREATER_REALM_CELL_COUNT_INVALID'],
    [input.expectedSlotCount, GREATER_REALM_CASTLE_CAPACITY, 'GREATER_REALM_SLOT_COUNT_INVALID'],
    [input.expectedResourceNodeCount, 1_000_000, 'GREATER_REALM_RESOURCE_COUNT_INVALID'],
  ] as const) requireGreaterRealmSafeInteger(value, 1, maximum, code);
  if (input.expectedRegionCount !== GREATER_REALM_VISIBLE_REGION_COUNT) {
    fail('GREATER_REALM_REGION_COUNT_INVALID');
  }
  if (input.expectedComponentCount < 1 || input.expectedComponentCount > GREATER_REALM_MAX_COMPONENTS) {
    fail('GREATER_REALM_COMPONENT_COUNT_INVALID');
  }
  if (input.expectedChunkCount < 1 || input.expectedCellCount < input.expectedChunkCount) {
    fail('GREATER_REALM_WORLD_COUNTS_INVALID');
  }
  if (input.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_SLOT_COUNT_INVALID');
  }
  const minimumResourceNodes = input.expectedSlotCount
    * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT
    * GREATER_REALM_RESOURCE_KINDS.length;
  if (input.expectedResourceNodeCount !== minimumResourceNodes) {
    fail('GREATER_REALM_RESOURCE_MARGIN_INVALID');
  }
  if (input.importEpoch <= 0n) fail('GREATER_REALM_IMPORT_EPOCH_INVALID');
}

export interface GreaterRealmComponentInputV1 {
  componentKey: string;
  atlasId: string;
  componentOrdinal: number;
  regionMask: number;
  rootCellKey: string;
  expectedCellCount: number;
  maxRouteDepth: number;
  expectedSlotCount: number;
  expectedFoodNodeCount: number;
  expectedWoodNodeCount: number;
  expectedStoneNodeCount: number;
  expectedGoldNodeCount: number;
  componentSha256: string;
}

export function validateGreaterRealmComponentInputV1(input: GreaterRealmComponentInputV1): void {
  requireGreaterRealmOpaqueId(input.componentKey, 'GREATER_REALM_COMPONENT_KEY_INVALID');
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.rootCellKey, 'GREATER_REALM_ROOT_CELL_KEY_INVALID');
  requireGreaterRealmSha256(input.componentSha256, 'GREATER_REALM_COMPONENT_SHA_INVALID');
  requireGreaterRealmSafeInteger(
    input.componentOrdinal,
    0,
    GREATER_REALM_MAX_COMPONENTS - 1,
    'GREATER_REALM_COMPONENT_ORDINAL_INVALID',
  );
  requireGreaterRealmSafeInteger(input.regionMask, 1, 0xffff_ffff, 'GREATER_REALM_COMPONENT_REGION_MASK_INVALID');
  if (input.regionMask <= 0 || input.regionMask >= (1 << GREATER_REALM_VISIBLE_REGION_COUNT)) {
    fail('GREATER_REALM_COMPONENT_REGION_MASK_INVALID');
  }
  requireGreaterRealmSafeInteger(input.expectedCellCount, 1, 1_000_000, 'GREATER_REALM_COMPONENT_ROUTE_INVALID');
  requireGreaterRealmSafeInteger(input.maxRouteDepth, 0, GREATER_REALM_MAX_ROUTE_DEPTH, 'GREATER_REALM_COMPONENT_ROUTE_INVALID');
  requireGreaterRealmSafeInteger(input.expectedSlotCount, 0, GREATER_REALM_CASTLE_CAPACITY, 'GREATER_REALM_COMPONENT_SLOT_COUNT_INVALID');
  for (const count of [
    input.expectedFoodNodeCount,
    input.expectedWoodNodeCount,
    input.expectedStoneNodeCount,
    input.expectedGoldNodeCount,
  ]) requireGreaterRealmSafeInteger(count, 0, 1_000_000, 'GREATER_REALM_COMPONENT_RESOURCE_COUNT_INVALID');
  const minimum = input.expectedSlotCount * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT;
  if (
    input.expectedFoodNodeCount < minimum
    || input.expectedWoodNodeCount < minimum
    || input.expectedStoneNodeCount < minimum
    || input.expectedGoldNodeCount < minimum
  ) fail('GREATER_REALM_COMPONENT_RESOURCE_MARGIN_INVALID');
}

export interface GreaterRealmChunkInputV1 {
  chunkHandle: string;
  atlasId: string;
  chunkCoordKey: string;
  importOrdinal: number;
  binQ: number;
  binR: number;
  firstCellOrdinal: number;
  coreCellCount: number;
  apronCellCount: number;
  lod0CellCount: number;
  lod1CellCount: number;
  lod2CellCount: number;
  lod3CellCount: number;
  payloadSha256: string;
}

export function validateGreaterRealmChunkInputV1(input: GreaterRealmChunkInputV1): void {
  requireGreaterRealmOpaqueId(input.chunkHandle, 'GREATER_REALM_CHUNK_HANDLE_INVALID');
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.chunkCoordKey, 'GREATER_REALM_CHUNK_COORD_KEY_INVALID');
  requireGreaterRealmSha256(input.payloadSha256, 'GREATER_REALM_CHUNK_SHA_INVALID');
  requireGreaterRealmSafeInteger(input.importOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_CHUNK_ORDINAL_INVALID');
  requireGreaterRealmSafeInteger(input.binQ, -0x8000_0000, 0x7fff_ffff, 'GREATER_REALM_CHUNK_COORDINATE_INVALID');
  requireGreaterRealmSafeInteger(input.binR, -0x8000_0000, 0x7fff_ffff, 'GREATER_REALM_CHUNK_COORDINATE_INVALID');
  requireGreaterRealmSafeInteger(input.firstCellOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_CELL_ORDINAL_INVALID');
  requireGreaterRealmSafeInteger(input.coreCellCount, 1, GREATER_REALM_MAX_CHUNK_CORE_CELLS, 'GREATER_REALM_CHUNK_CORE_COUNT_INVALID');
  requireGreaterRealmSafeInteger(input.apronCellCount, 0, GREATER_REALM_MAX_CHUNK_APRON_CELLS, 'GREATER_REALM_CHUNK_APRON_COUNT_INVALID');
  for (const count of [input.lod0CellCount, input.lod1CellCount, input.lod2CellCount, input.lod3CellCount]) {
    requireGreaterRealmSafeInteger(count, 1, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_COUNTS_INVALID');
  }
  const visible = input.coreCellCount + input.apronCellCount;
  if (
    visible > GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS
    || input.lod0CellCount !== input.coreCellCount
    || input.lod1CellCount !== Math.ceil(visible / 2)
    || input.lod2CellCount !== Math.ceil(input.lod1CellCount / 2)
    || input.lod3CellCount !== Math.ceil(input.lod2CellCount / 2)
  ) fail('GREATER_REALM_CHUNK_LOD_COUNTS_INVALID');
}

export interface GreaterRealmCellInputV1 {
  cellKey: string;
  atlasCoordKey: string;
  releaseOrdinal: number;
  atlasId: string;
  chunkHandle: string;
  regionId: string;
  componentKey?: string;
  tier: number;
  passable: boolean;
  movementCost: number;
  sealedBoundaryMask: number;
  hydroRegime: number;
  hydroBodyId?: string;
  hydroFlowDirection?: number;
  travelClass: number;
  routeParentDirection?: number;
  routeDepth?: number;
  canopyBasisPoints: number;
  groundcoverBasisPoints: number;
  wildflowerBasisPoints: number;
}

export function validateGreaterRealmCellInputV1(input: GreaterRealmCellInputV1): void {
  requireGreaterRealmOpaqueId(input.cellKey, 'GREATER_REALM_CELL_KEY_INVALID');
  requireGreaterRealmOpaqueId(input.atlasCoordKey, 'GREATER_REALM_CELL_COORD_KEY_INVALID');
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.chunkHandle, 'GREATER_REALM_CHUNK_HANDLE_INVALID');
  requireGreaterRealmPublicRegion(input.regionId);
  requireGreaterRealmSafeInteger(input.releaseOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_CELL_ORDINAL_INVALID');
  if (input.tier !== GREATER_REALM_VISIBLE_TIER_MAX) fail('GREATER_REALM_CELL_TIER_INVALID');
  requireGreaterRealmSafeInteger(input.movementCost, 1, 1_000_000, 'GREATER_REALM_MOVEMENT_COST_INVALID');
  requireGreaterRealmSafeInteger(input.sealedBoundaryMask, 0, 0b11_1111, 'GREATER_REALM_SEALED_BOUNDARY_MASK_INVALID');
  requireGreaterRealmSafeInteger(
    input.travelClass,
    GREATER_REALM_TRAVEL_CLASS.NONE,
    GREATER_REALM_TRAVEL_CLASS.FORD,
    'GREATER_REALM_TRAVEL_CLASS_INVALID',
  );
  requireGreaterRealmSafeInteger(
    input.hydroRegime,
    GREATER_REALM_HYDRO_REGIME.DRY,
    GREATER_REALM_HYDRO_REGIME.MARSH,
    'GREATER_REALM_WATER_REGIME_INVALID',
  );
  if (input.hydroFlowDirection !== undefined) {
    requireGreaterRealmSafeInteger(input.hydroFlowDirection, 0, 5, 'GREATER_REALM_WATER_DIRECTION_INVALID');
  }
  if (input.passable) {
    const navigableWater = (
      (input.hydroRegime === GREATER_REALM_HYDRO_REGIME.RIVER
        || input.hydroRegime === GREATER_REALM_HYDRO_REGIME.STREAM)
      && input.travelClass === GREATER_REALM_TRAVEL_CLASS.FORD
    );
    if (input.hydroRegime !== GREATER_REALM_HYDRO_REGIME.DRY && !navigableWater) {
      fail('GREATER_REALM_WET_NAVIGATION_INVALID');
    }
    requireGreaterRealmOpaqueId(
      input.componentKey ?? '',
      'GREATER_REALM_COMPONENT_KEY_INVALID',
    );
    requireGreaterRealmSafeInteger(input.routeDepth ?? -1, 0, GREATER_REALM_MAX_ROUTE_DEPTH, 'GREATER_REALM_ROUTE_DEPTH_INVALID');
    if (input.routeDepth === 0) {
      if (input.routeParentDirection !== undefined) fail('GREATER_REALM_ROUTE_ROOT_INVALID');
    } else {
      requireGreaterRealmSafeInteger(
        input.routeParentDirection ?? -1,
        0,
        5,
        'GREATER_REALM_ROUTE_PARENT_INVALID',
      );
    }
  } else if (
    input.componentKey !== undefined
    || input.routeDepth !== undefined
    || input.routeParentDirection !== undefined
  ) fail('GREATER_REALM_NON_NAVIGABLE_ROUTE_INVALID');
  if (input.hydroRegime === GREATER_REALM_HYDRO_REGIME.DRY) {
    if (input.hydroBodyId !== undefined || input.hydroFlowDirection !== undefined) {
      fail('GREATER_REALM_DRY_WATER_STATE_INVALID');
    }
  } else {
    requireGreaterRealmOpaqueId(
      input.hydroBodyId ?? '',
      'GREATER_REALM_PUBLIC_WATER_ID_INVALID',
    );
  }
  for (const density of [
    input.canopyBasisPoints,
    input.groundcoverBasisPoints,
    input.wildflowerBasisPoints,
  ]) {
    requireGreaterRealmSafeInteger(density, 0, 10_000, 'GREATER_REALM_DENSITY_INVALID');
  }
}

export interface GreaterRealmSlotInputV1 {
  slotId: string;
  releaseOrdinal: number;
  atlasId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  legacySlotId?: number;
  tier: number;
  regionOrderRank: number;
  allocationRank: number;
  active: boolean;
}

export function validateGreaterRealmSlotInputV1(input: GreaterRealmSlotInputV1): void {
  requireGreaterRealmOpaqueId(input.slotId, 'GREATER_REALM_SLOT_ID_INVALID');
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.cellKey, 'GREATER_REALM_CELL_KEY_INVALID');
  requireGreaterRealmPublicRegion(input.regionId);
  requireGreaterRealmOpaqueId(input.componentKey, 'GREATER_REALM_COMPONENT_KEY_INVALID');
  requireGreaterRealmSafeInteger(input.releaseOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_SLOT_ORDINAL_INVALID');
  if (input.legacySlotId !== undefined) {
    requireGreaterRealmSafeInteger(
      input.legacySlotId,
      1,
      GREATER_REALM_CASTLES_PER_REGION,
      'GREATER_REALM_LEGACY_SLOT_ID_INVALID',
    );
  }
  if (input.tier !== GREATER_REALM_VISIBLE_TIER_MAX) fail('GREATER_REALM_SLOT_TIER_INVALID');
  requireGreaterRealmSafeInteger(input.regionOrderRank, 0, 0xffff_ffff, 'GREATER_REALM_SLOT_RANK_INVALID');
  requireGreaterRealmSafeInteger(input.allocationRank, 0, 0xffff_ffff, 'GREATER_REALM_SLOT_RANK_INVALID');
  if (
    input.regionOrderRank !== GREATER_REALM_UNASSIGNED_RANK
    || input.allocationRank !== GREATER_REALM_UNASSIGNED_RANK
    || input.active
  ) fail('GREATER_REALM_SLOT_PREMATURE_ACTIVATION');
}

export interface GreaterRealmResourceInputV1 {
  nodeId: string;
  releaseOrdinal: number;
  atlasId: string;
  locationId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  resourceKind: string;
  tier: number;
  nodeOrdinal: number;
  allocationRank: number;
  legacyCatalogId?: string;
  policyVersion: string;
  active: boolean;
}

export function validateGreaterRealmResourceInputV1(input: GreaterRealmResourceInputV1): void {
  requireGreaterRealmOpaqueId(input.nodeId, 'GREATER_REALM_RESOURCE_NODE_ID_INVALID');
  requireGreaterRealmOpaqueId(input.atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  requireGreaterRealmOpaqueId(input.locationId, 'GREATER_REALM_RESOURCE_LOCATION_INVALID');
  requireGreaterRealmOpaqueId(input.cellKey, 'GREATER_REALM_CELL_KEY_INVALID');
  requireGreaterRealmPublicRegion(input.regionId);
  requireGreaterRealmOpaqueId(input.componentKey, 'GREATER_REALM_COMPONENT_KEY_INVALID');
  requireGreaterRealmResourceKind(input.resourceKind);
  requireGreaterRealmVersion(input.policyVersion, 'GREATER_REALM_RESOURCE_POLICY_INVALID');
  if (input.legacyCatalogId !== undefined) {
    requireGreaterRealmOpaqueId(input.legacyCatalogId, 'GREATER_REALM_LEGACY_CATALOG_ID_INVALID');
  }
  if (input.tier !== GREATER_REALM_VISIBLE_TIER_MAX) fail('GREATER_REALM_RESOURCE_TIER_INVALID');
  requireGreaterRealmSafeInteger(input.releaseOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_RESOURCE_ORDINAL_INVALID');
  requireGreaterRealmSafeInteger(input.nodeOrdinal, 0, 0xffff_ffff, 'GREATER_REALM_RESOURCE_NODE_ORDINAL_INVALID');
  requireGreaterRealmSafeInteger(input.allocationRank, 0, 0xffff_ffff, 'GREATER_REALM_RESOURCE_RANK_INVALID');
  if (input.allocationRank !== GREATER_REALM_UNASSIGNED_RANK || input.active) {
    fail('GREATER_REALM_RESOURCE_PREMATURE_ACTIVATION');
  }
}

export function requireBoundedGreaterRealmBatch(
  rowCount: number,
  maximum: number,
  code: string,
): void {
  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > maximum) fail(code);
}

export function fisherYatesGreaterRealmRanks<T>(
  values: readonly T[],
  integerInRange: (minimum: number, maximum: number) => number,
): T[] {
  const result = [...values];
  for (let cursor = result.length - 1; cursor > 0; cursor -= 1) {
    const selected = integerInRange(0, cursor);
    if (!Number.isSafeInteger(selected) || selected < 0 || selected > cursor) {
      fail('GREATER_REALM_RANDOM_SOURCE_INVALID');
    }
    [result[cursor], result[selected]] = [result[selected]!, result[cursor]!];
  }
  return result;
}

export function greaterRealmV17ErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmV17PolicyError ? error.code : undefined;
}
