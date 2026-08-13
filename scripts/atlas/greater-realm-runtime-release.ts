import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  GREATER_REALM_BIOME_CLASS_COUNT,
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_CLASS_COUNT,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import {
  GREATER_REALM_GENERATOR_VERSION,
  GREATER_REALM_REGION_SPECS,
  type GreaterRealmPrivateCandidate,
} from './greater-realm-candidate-generator';
import {
  GREATER_REALM_ATLAS_ID,
  GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT,
} from './greater-realm-contracts';
import {
  GREATER_REALM_WATER_DEPTH_CLASS_ID,
  GREATER_REALM_WATER_REGIME_ID,
} from './greater-realm-hydrology-authority';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  inverseGlobalToLegacyLowlands,
  transformLegacyLowlandsToGlobal,
} from './greater-realm-legacy-lowlands';
import {
  GREATER_REALM_AMBIENT_LIFE_CLASS,
  GREATER_REALM_ECOLOGY_CLASS,
  GREATER_REALM_LANDMARK_CLASS,
  GREATER_REALM_LIVING_WORLD_VERSION,
  GREATER_REALM_ROUTE_CLASS,
} from './greater-realm-living-world';
import type { GreaterRealmPrivateWorkspace } from './greater-realm-private-workspace';
import { GREATER_REALM_AXIAL_DIRECTIONS } from './greater-realm-terrain';

export const GREATER_REALM_RUNTIME_RELEASE_SCHEMA =
  'warpkeep.greater-realm.runtime-import-manifest.v1' as const;
export const GREATER_REALM_RUNTIME_CHUNK_SCHEMA =
  'warpkeep.greater-realm.runtime-import-chunk.v1' as const;
export const GREATER_REALM_RUNTIME_STATUS_SCHEMA =
  'warpkeep.greater-realm.runtime-release-status.v1' as const;
export const GREATER_REALM_RUNTIME_RELEASE_DIRECTORY = 'runtime-release-v1' as const;
export const GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH =
  'controls/runtime-release-public-seed-v1.wkgr-control' as const;
export const GREATER_REALM_RUNTIME_PARTITION_VERSION =
  'axial-bin-15-tier-one-filter-v1' as const;
export const GREATER_REALM_RENDERER_CONTRACT_VERSION =
  'greater-realm-renderer-v1' as const;
export const GREATER_REALM_RESOURCE_POLICY_VERSION =
  'greater-realm-tier-i-resource-v2' as const;

const UINT32_MAX = 0xffff_ffff;
const INT32_MIN = -0x8000_0000;
const RELEASE_SEED_BYTES = 32;
const MAXIMUM_CHUNK_CORE_CELLS = 225;
const MAXIMUM_CHUNK_VISIBLE_CELLS = 384;
export const GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS = 128;
export const GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES = 256;
export const GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS = 128;
export const GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION = 32;
const MAXIMUM_RUNTIME_CHUNKS = 2_048;
const MAXIMUM_NAVIGATION_COMPONENTS = 4_096;
const MAXIMUM_ROUTE_DEPTH = 4_096;
const MAXIMUM_RUNTIME_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAXIMUM_RUNTIME_STATUS_BYTES = 64 * 1024;
const MAXIMUM_RUNTIME_CHUNK_BYTES = 4 * 1024 * 1024;
const MAXIMUM_RUNTIME_RELEASE_BYTES = 512 * 1024 * 1024;
const RESOURCE_MARGIN_PER_SLOT = 5;
const RESOURCE_KINDS = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);
const PUBLIC_REGION_SPECS = Object.freeze([
  Object.freeze({ id: 'T1_LOWLANDS', name: 'The Hegemony Lowlands', ordinal: 0 }),
  Object.freeze({ id: 'T1_FROSTMERE', name: 'Frostmere Reach', ordinal: 1 }),
  Object.freeze({ id: 'T1_SUNSCAR', name: 'Sunscar Expanse', ordinal: 2 }),
  Object.freeze({ id: 'T1_MIREFEN', name: 'Mirefen Delta', ordinal: 3 }),
  Object.freeze({ id: 'T1_STONEWAKE', name: 'Stonewake Isles', ordinal: 4 }),
  Object.freeze({ id: 'T1_EMBERWOOD', name: 'Emberwood March', ordinal: 5 }),
] as const);
const LEGACY_LOWLANDS_META_BY_KEY = new Map(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.metadata
    .map(row => [row.tileKey, row] as const),
);
const LEGACY_LOWLANDS_TILE_BY_KEY = new Map(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles
    .map(row => [row.key, row] as const),
);
const LEGACY_LOWLANDS_WATER_BY_KEY: ReadonlyMap<string, LegacyLowlandsWaterRow> = new Map(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells
    .map(row => [row.cellKey, row] as const),
);
const LEGACY_LOWLANDS_RIVER_MOUTH_KEYS: ReadonlySet<string> = new Set(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells
    .filter(row => row.regime === 'river' && row.downstreamWaterCellKey === undefined)
    .map(row => row.cellKey),
);
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SEED_CONTROL_MAGIC = Buffer.from('WKGR-PUBLIC-RELEASE-SEED-V1\0', 'ascii');
const RELEASE_SEED_CONTROL_BYTES = RELEASE_SEED_CONTROL_MAGIC.length + 32 + 32;

type ResourceKind = typeof RESOURCE_KINDS[number];

export type GreaterRealmRuntimeReleaseSource = Pick<
  GreaterRealmPrivateCandidate,
  | 'grid'
  | 'legacyLowlandsTransform'
  | 'legacyLowlandsCell'
  | 'legacyLowlandsCastleSlot'
  | 'elevation'
  | 'regionId'
  | 'tierId'
  | 'waterRegime'
  | 'waterBodyId'
  | 'waterDepthClass'
  | 'waterSurfaceLevel'
  | 'waterDownstream'
  | 'flowAccumulation'
  | 'waterBankSeed'
  | 'waterGenerationVersion'
  | 'biomeId'
  | 'landformId'
  | 'slope'
  | 'aspect'
  | 'profileCurvature'
  | 'planCurvature'
  | 'ridgeId'
  | 'geologicalBarrierBand'
  | 'wetnessIndex'
  | 'exposure'
  | 'distanceToCoast'
  | 'distanceToFreshwater'
  | 'temperature'
  | 'moisture'
  | 'barrier'
  | 'castleSlot'
  | 'resourcePotential'
  | 'corePotential'
  | 'ecologyClass'
  | 'vegetationDensity'
  | 'groundcoverDensity'
  | 'wildflowerDensity'
  | 'routeClass'
  | 'landmarkClass'
  | 'ambientLifeClass'
>;

export type GreaterRealmRuntimeCell = Readonly<{
  cellKey: string;
  atlasCoordKey: string;
  releaseOrdinal: number;
  atlasId: string;
  chunkHandle: string;
  regionId: string;
  componentKey?: string;
  localQ: number;
  localR: number;
  atlasQ: number;
  atlasR: number;
  tier: 1;
  passable: boolean;
  elevation: number;
  slope: number;
  aspect: number;
  profileCurvature: number;
  planCurvature: number;
  ridgeId?: string;
  geologicalBarrierBand: number;
  biomeClass: number;
  landformClass: number;
  yieldClass: number;
  movementCost: number;
  sealedBoundaryMask: number;
  hydroRegime: number;
  hydroBodyId?: string;
  hydroDepthClass: number;
  hydroSurfaceMilli: number;
  hydroFlowDirection?: number;
  flowAccumulation: string;
  bankVariant: number;
  hydrologyRevision: number;
  routeParentDirection?: number;
  routeDepth?: number;
  travelClass: number;
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

export type GreaterRealmRuntimeSlot = Readonly<{
  slotId: string;
  releaseOrdinal: number;
  atlasId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  tier: 1;
  regionOrderRank: number;
  allocationRank: number;
  active: false;
  legacySlotId?: number;
}>;

export type GreaterRealmRuntimeResourceNode = Readonly<{
  nodeId: string;
  releaseOrdinal: number;
  atlasId: string;
  locationId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  resourceKind: ResourceKind;
  tier: 1;
  nodeOrdinal: number;
  allocationRank: number;
  legacyCatalogId?: string;
  policyVersion: string;
  active: false;
}>;

export type GreaterRealmRuntimeChunkPayload = Readonly<{
  schema: typeof GREATER_REALM_RUNTIME_CHUNK_SCHEMA;
  publicReleaseId: string;
  chunkHandle: string;
  importOrdinal: number;
  cells: readonly GreaterRealmRuntimeCell[];
  apronCellKeys: readonly string[];
  lod1CellKeys: readonly string[];
  lod2CellKeys: readonly string[];
  lod3CellKeys: readonly string[];
  castleSlots: readonly GreaterRealmRuntimeSlot[];
  resourceNodes: readonly GreaterRealmRuntimeResourceNode[];
  importBatches: Readonly<{
    castleSlots: readonly Readonly<{
      batchOrdinal: number;
      firstRowOrdinal: number;
      rowCount: number;
      rowsSha256: string;
    }>[];
    resourceNodes: readonly Readonly<{
      batchOrdinal: number;
      firstRowOrdinal: number;
      rowCount: number;
      rowsSha256: string;
    }>[];
  }>;
  sectionDigests: Readonly<{
    cellsSha256: string;
    apronSha256: string;
    lodSha256: string;
    castleSlotsSha256: string;
    resourceNodesSha256: string;
  }>;
}>;

export type GreaterRealmRuntimeChunkArtifact = Readonly<{
  path: string;
  bytes: Buffer;
  payload: GreaterRealmRuntimeChunkPayload;
}>;

export type GreaterRealmRuntimeReleaseArtifacts = Readonly<{
  manifest: Readonly<Record<string, unknown>>;
  manifestBytes: Buffer;
  status: Readonly<Record<string, unknown>>;
  statusBytes: Buffer;
  chunks: readonly GreaterRealmRuntimeChunkArtifact[];
}>;

type NavigationComponent = {
  ordinal: number;
  key: string;
  members: number[];
  memberSet: Set<number>;
  root: number;
  parentDirection: Map<number, number>;
  depth: Map<number, number>;
  regionMask: number;
  slotCells: number[];
};

type PartitionChunk = {
  ordinal: number;
  handle: string;
  coordKey: string;
  binQ: number;
  binR: number;
  core: number[];
  apron: number[];
};

export type GreaterRealmRuntimeReleaseWriteResult = 'installed' | 'unchanged';

function fail(code: string): never {
  throw new Error(code);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function releaseSeedControlEnvelope(seed: Uint8Array): Buffer {
  if (!(seed instanceof Uint8Array) || seed.byteLength !== RELEASE_SEED_BYTES) {
    fail('GREATER_REALM_RUNTIME_RELEASE_SEED_INVALID');
  }
  const digest = createHash('sha256')
    .update('warpkeep.greater-realm.public-release-seed-control.v1\0', 'utf8')
    .update(seed)
    .digest();
  const envelope = Buffer.alloc(RELEASE_SEED_CONTROL_BYTES);
  try {
    RELEASE_SEED_CONTROL_MAGIC.copy(envelope, 0);
    envelope.set(seed, RELEASE_SEED_CONTROL_MAGIC.length);
    digest.copy(envelope, RELEASE_SEED_CONTROL_MAGIC.length + RELEASE_SEED_BYTES);
    return envelope;
  } finally {
    digest.fill(0);
  }
}

function parseReleaseSeedControlEnvelope(envelope: Buffer): Buffer {
  if (
    envelope.byteLength !== RELEASE_SEED_CONTROL_BYTES
    || !envelope.subarray(0, RELEASE_SEED_CONTROL_MAGIC.length)
      .equals(RELEASE_SEED_CONTROL_MAGIC)
  ) fail('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_INVALID');
  const seed = Buffer.from(envelope.subarray(
    RELEASE_SEED_CONTROL_MAGIC.length,
    RELEASE_SEED_CONTROL_MAGIC.length + RELEASE_SEED_BYTES,
  ));
  const expected = releaseSeedControlEnvelope(seed);
  try {
    if (!timingSafeEqual(expected, envelope)) {
      fail('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_INVALID');
    }
    return seed;
  } catch (error) {
    seed.fill(0);
    throw error;
  } finally {
    expected.fill(0);
  }
}

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>;

function canonicalJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): CanonicalJsonValue {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return value;
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value)
      || (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
    return value;
  }
  if (typeof value !== 'object') {
    fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
  }
  if (ancestors.has(value)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
      }
      const ownKeys = Reflect.ownKeys(value);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        ownKeys.some(key => typeof key !== 'string')
        || lengthDescriptor === undefined
        || !('value' in lengthDescriptor)
        || lengthDescriptor.enumerable
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || ownKeys.length !== lengthDescriptor.value + 1
      ) fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
      const normalized: CanonicalJsonValue[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined
          || !descriptor.enumerable
          || !('value' in descriptor)
        ) fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
        normalized.push(canonicalJsonValue(descriptor.value, ancestors));
      }
      // JSON.stringify consults inherited toJSON hooks before visiting array
      // elements. The validated clone must not inherit ambient serialization.
      Object.setPrototypeOf(normalized, null);
      return normalized;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== 'string')) {
      fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
    }
    const normalized = Object.create(null) as Record<string, CanonicalJsonValue>;
    for (const key of ownKeys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
      ) fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
      // JSON.stringify omits undefined record fields. Normalize that one
      // intentional optional-field case before recursively checking values.
      if (descriptor.value === undefined) continue;
      Object.defineProperty(normalized, key, {
        configurable: true,
        enumerable: true,
        value: canonicalJsonValue(descriptor.value, ancestors),
        writable: true,
      });
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalJsonValue(value))}\n`, 'utf8');
}

function framedSha256(domain: string, frames: Iterable<Uint8Array>): string {
  const hash = createHash('sha256').update(`${domain}\n`, 'utf8');
  const length = Buffer.alloc(8);
  try {
    for (const frame of frames) {
      length.writeBigUInt64BE(BigInt(frame.byteLength), 0);
      hash.update(length);
      hash.update(frame);
    }
    return hash.digest('hex');
  } finally {
    length.fill(0);
  }
}

/**
 * Cross-language framing authority. Canonical objects are constructed in the
 * listed insertion order, normalized to recursive plain JSON data (with
 * undefined record fields omitted), and encoded as UTF-8
 * `JSON.stringify(value) + "\n"` without a BOM. Keys are never sorted. Every
 * frame is prefixed by its unsigned 64-bit byte length in network (big-endian)
 * order.
 */
export const GREATER_REALM_RUNTIME_FRAMING_SPEC_V1 = Object.freeze({
  algorithm: 'sha256-domain-lf-u64be-frames-v1',
  canonicalJson: 'utf8-json-stringify-insertion-order-plus-lf-no-bom',
  lengthPrefix: 'unsigned-u64-big-endian-byte-length',
  release: Object.freeze({
    domain: 'warpkeep.greater-realm.release.v1',
    frames: Object.freeze([
      'canonical-release-header',
      'canonical-chunk-payload-bytes-in-importOrdinal-order',
      'canonical-component-manifest-array',
      'canonical-six-region-manifest-array',
    ]),
  }),
  component: Object.freeze({
    domain: 'warpkeep.greater-realm.component.v1',
    frames: Object.freeze([
      'canonical-component-key-object',
      'canonical-cells-section-count-object',
      'canonical-cell-rows-in-releaseOrdinal-order',
      'canonical-castle-slots-section-count-object',
      'canonical-castle-slot-rows-in-releaseOrdinal-order',
      'canonical-resource-nodes-section-count-object',
      'canonical-resource-node-rows-in-releaseOrdinal-order',
    ]),
  }),
  compatibilityVector: Object.freeze({
    domain: 'warpkeep.greater-realm.framing-compatibility.v1',
    domainUtf8Hex:
      '776172706b6565702e677265617465722d7265616c6d2e6672616d696e672d636f6d7061746962696c6974792e76310a',
    frames: Object.freeze([
      Object.freeze({
        canonicalJson: '{"schema":"wkgr-framing-vector-v1","label":"Lowlands Δ","ordinal":7,"active":false}\n',
        byteLength: 85,
        lengthPrefixHex: '0000000000000055',
        utf8Hex:
          '7b22736368656d61223a22776b67722d6672616d696e672d766563746f722d7631222c226c6162656c223a224c6f776c616e647320ce94222c226f7264696e616c223a372c22616374697665223a66616c73657d0a',
      }),
      Object.freeze({
        canonicalJson: '["T1_LOWLANDS",100,500]\n',
        byteLength: 24,
        lengthPrefixHex: '0000000000000018',
        utf8Hex: '5b2254315f4c4f574c414e4453222c3130302c3530305d0a',
      }),
    ]),
    digestSha256: '68512713b3db4d97f3702f8491d88c23b04f472f6a29f1fe100fe5ce3e58992e',
  }),
} as const);

function maximumInteger(values: Iterable<number>): number {
  let maximum = 0;
  for (const value of values) {
    if (value > maximum) maximum = value;
  }
  return maximum;
}

function publicHydrologyTransitionAllowed(source: number, target: number): boolean {
  if (source === GREATER_REALM_WATER_REGIME_ID.RIVER) {
    return target === GREATER_REALM_WATER_REGIME_ID.RIVER
      || target === GREATER_REALM_WATER_REGIME_ID.MARSH
      || target === GREATER_REALM_WATER_REGIME_ID.LAKE
      || target === GREATER_REALM_WATER_REGIME_ID.OCEAN
      || target === GREATER_REALM_WATER_REGIME_ID.SEA;
  }
  if (source === GREATER_REALM_WATER_REGIME_ID.STREAM) {
    return target === GREATER_REALM_WATER_REGIME_ID.STREAM
      || target === GREATER_REALM_WATER_REGIME_ID.RIVER
      || target === GREATER_REALM_WATER_REGIME_ID.MARSH
      || target === GREATER_REALM_WATER_REGIME_ID.LAKE
      || target === GREATER_REALM_WATER_REGIME_ID.OCEAN
      || target === GREATER_REALM_WATER_REGIME_ID.SEA;
  }
  return false;
}

type LegacyLowlandsGameplayProjection = Readonly<{
  passable: boolean;
  biomeClass: number;
  landformClass: number;
  yieldClass: number;
  movementCost: number;
  hydroRegime: number;
}>;

type LegacyLowlandsWaterRow =
  (typeof GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells)[number];

type LegacyLowlandsWaterProjection = Readonly<{
  row: LegacyLowlandsWaterRow;
  hydroRegime: number;
  biomeClass: number;
  landformClass: number;
}>;

function legacyLowlandsVisualClass(terrainKind: string): Readonly<{
  biomeClass: number;
  landformClass: number;
}> {
  switch (terrainKind) {
    case 'lowland':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
        landformClass: GREATER_REALM_LANDFORM_ID.LOWLAND,
      });
    case 'meadow':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.FLOWER_MEADOW,
        landformClass: GREATER_REALM_LANDFORM_ID.LOWLAND,
      });
    case 'forest':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
        landformClass: GREATER_REALM_LANDFORM_ID.LOWLAND,
      });
    case 'heath':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.SAVANNA,
        landformClass: GREATER_REALM_LANDFORM_ID.LOWLAND,
      });
    case 'ridge':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
        landformClass: GREATER_REALM_LANDFORM_ID.HIGHLAND,
      });
    case 'lake':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
        landformClass: GREATER_REALM_LANDFORM_ID.LOWLAND,
      });
    case 'ancient-stone':
      return Object.freeze({
        biomeClass: GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
        landformClass: GREATER_REALM_LANDFORM_ID.HILL,
      });
    default:
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');
  }
}

function legacyLowlandsWaterProjection(
  localQ: number,
  localR: number,
): LegacyLowlandsWaterProjection | undefined {
  const row = LEGACY_LOWLANDS_WATER_BY_KEY.get(`${localQ},${localR}`);
  if (row === undefined) return undefined;
  if (row.regime === 'ocean') {
    return Object.freeze({
      row,
      hydroRegime: GREATER_REALM_WATER_REGIME_ID.OCEAN,
      biomeClass: GREATER_REALM_BIOME_ID.SALTWATER,
      landformClass: GREATER_REALM_LANDFORM_ID.ISLAND_SHELF,
    });
  }
  if (row.regime === 'river') {
    return Object.freeze({
      row,
      hydroRegime: GREATER_REALM_WATER_REGIME_ID.RIVER,
      biomeClass: GREATER_REALM_BIOME_ID.RIVER_STREAM,
      landformClass: GREATER_REALM_LANDFORM_ID.WATERCOURSE,
    });
  }
  return Object.freeze({
    row,
    hydroRegime: GREATER_REALM_WATER_REGIME_ID.LAKE,
    biomeClass: GREATER_REALM_BIOME_ID.LAKE,
    landformClass: GREATER_REALM_LANDFORM_ID.LAKE_BASIN,
  });
}

function legacyLowlandsGameplayProjection(
  localQ: number,
  localR: number,
): LegacyLowlandsGameplayProjection {
  const key = `${localQ},${localR}`;
  const tile = LEGACY_LOWLANDS_TILE_BY_KEY.get(key);
  const metadata = LEGACY_LOWLANDS_META_BY_KEY.get(key);
  if (tile === undefined || metadata === undefined || metadata.tileKey !== tile.key) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
  }
  const water = legacyLowlandsWaterProjection(localQ, localR);
  const hydroRegime = water?.hydroRegime ?? GREATER_REALM_WATER_REGIME_ID.DRY;
  const visual = water === undefined
    ? legacyLowlandsVisualClass(metadata.terrainKind)
    : water;
  const passable = metadata.passable
    && hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY;
  const yieldClass = !passable
    ? 0
    : metadata.staticContentKind === 'resource-capable'
      || metadata.staticContentKind === 'core-capable'
      ? 2
      : 1;
  return Object.freeze({
    passable,
    biomeClass: visual.biomeClass,
    landformClass: visual.landformClass,
    yieldClass,
    movementCost: passable ? metadata.movementCost : 1_000_000,
    hydroRegime,
  });
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  return output;
}

function releaseDigest(seed: Uint8Array, domain: string, material: string): Buffer {
  return createHmac('sha256', seed)
    .update('warpkeep.greater-realm.public-release.v1\0', 'utf8')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(material, 'utf8')
    .digest();
}

function opaqueId(seed: Uint8Array, prefix: string, domain: string, material: string): string {
  const digest = releaseDigest(seed, domain, material);
  try {
    return `${prefix}-${base32(digest.subarray(0, 16))}`;
  } finally {
    digest.fill(0);
  }
}

function publicUint32(seed: Uint8Array, domain: string, material: string): number {
  const digest = releaseDigest(seed, domain, material);
  try {
    return digest.readUInt32LE(0);
  } finally {
    digest.fill(0);
  }
}

function scaledByte(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    fail('GREATER_REALM_RUNTIME_RELEASE_DENSITY_INVALID');
  }
  return Math.round(value * 10_000 / 255);
}

function assertIntegerRange(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function hasExactKeys(
  value: unknown,
  ordered: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const optionalKeys = new Set(optional);
  const actual = Object.keys(value);
  const expected = ordered.filter(key => (
    !optionalKeys.has(key) || Object.hasOwn(value, key)
  ));
  return ordered.every(key => optionalKeys.has(key) || Object.hasOwn(value, key))
    && actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function exactSourceShape(source: GreaterRealmRuntimeReleaseSource): void {
  const count = source.grid.cellCount;
  if (
    count < GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
    || source.grid.q.length !== count
    || source.grid.r.length !== count
    || source.grid.neighbors.length !== count * 6
  ) fail('GREATER_REALM_RUNTIME_RELEASE_SOURCE_INVALID');
  for (const field of [
    source.legacyLowlandsCell,
    source.legacyLowlandsCastleSlot,
    source.elevation,
    source.regionId,
    source.tierId,
    source.waterRegime,
    source.waterBodyId,
    source.waterDepthClass,
    source.waterSurfaceLevel,
    source.waterDownstream,
    source.flowAccumulation,
    source.waterBankSeed,
    source.waterGenerationVersion,
    source.biomeId,
    source.landformId,
    source.slope,
    source.aspect,
    source.profileCurvature,
    source.planCurvature,
    source.ridgeId,
    source.geologicalBarrierBand,
    source.wetnessIndex,
    source.exposure,
    source.distanceToCoast,
    source.distanceToFreshwater,
    source.temperature,
    source.moisture,
    source.barrier,
    source.castleSlot,
    source.resourcePotential,
    source.corePotential,
    source.ecologyClass,
    source.vegetationDensity,
    source.groundcoverDensity,
    source.wildflowerDensity,
    source.routeClass,
    source.landmarkClass,
    source.ambientLifeClass,
  ]) {
    if (field.length !== count) fail('GREATER_REALM_RUNTIME_RELEASE_SOURCE_INVALID');
  }
}

function assertExactPublicRegionPolicy(): void {
  const tierOne = GREATER_REALM_REGION_SPECS.filter(region => region.tier === 1);
  if (
    tierOne.length !== PUBLIC_REGION_SPECS.length
    || tierOne.some((region, ordinal) => (
      region.id !== PUBLIC_REGION_SPECS[ordinal]!.id
      || region.name !== PUBLIC_REGION_SPECS[ordinal]!.name
    ))
  ) fail('GREATER_REALM_RUNTIME_RELEASE_REGION_POLICY_INVALID');
}

function assertLegacyLowlandsBridge(source: GreaterRealmRuntimeReleaseSource): Map<number, number> {
  const canonicalByKey = new Map(
    GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles.map(tile => [tile.key, tile] as const),
  );
  const canonicalSlotByKey = new Map(
    GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.castleSlots.rows
      .map(slot => [slot.tileKey, slot.slotId] as const),
  );
  const missingWaterKeys = new Set(LEGACY_LOWLANDS_WATER_BY_KEY.keys());
  const legacySlotByCell = new Map<number, number>();
  let cellCount = 0;
  let slotCount = 0;
  for (let cell = 0; cell < source.grid.cellCount; cell += 1) {
    let lowlandsLocal: Readonly<{ q: number; r: number }> | undefined;
    if (source.tierId[cell] === 1 && source.regionId[cell] === 0) {
      lowlandsLocal = inverseGlobalToLegacyLowlands({
        q: source.grid.q[cell]!,
        r: source.grid.r[cell]!,
      }, source.legacyLowlandsTransform);
      const water = legacyLowlandsWaterProjection(lowlandsLocal.q, lowlandsLocal.r);
      if (water !== undefined) {
        missingWaterKeys.delete(water.row.cellKey);
        if (
          source.waterRegime[cell] !== water.hydroRegime
          || source.biomeId[cell] !== water.biomeClass
          || source.landformId[cell] !== water.landformClass
          || source.geologicalBarrierBand[cell] !== 0
        ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
      }
    }
    if (source.legacyLowlandsCell[cell] !== 1) continue;
    cellCount += 1;
    if (source.tierId[cell] !== 1 || source.regionId[cell] !== 0) {
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_TIER_INVALID');
    }
    const local = lowlandsLocal ?? inverseGlobalToLegacyLowlands({
      q: source.grid.q[cell]!,
      r: source.grid.r[cell]!,
    }, source.legacyLowlandsTransform);
    const key = `${local.q},${local.r}`;
    if (!canonicalByKey.delete(key)) {
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
    }
    const projection = legacyLowlandsGameplayProjection(
      local.q,
      local.r,
    );
    if (
      source.waterRegime[cell] !== projection.hydroRegime
      || source.biomeId[cell] !== projection.biomeClass
      || source.landformId[cell] !== projection.landformClass
      || source.geologicalBarrierBand[cell] !== 0
    ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');
    const legacySlotId = canonicalSlotByKey.get(key);
    if (source.legacyLowlandsCastleSlot[cell] === 1) {
      if (legacySlotId === undefined || source.castleSlot[cell] !== 1) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
      }
      legacySlotByCell.set(cell, legacySlotId);
      slotCount += 1;
    } else if (legacySlotId !== undefined) {
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
    }
  }
  if (
    cellCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
    || canonicalByKey.size !== 0
    || missingWaterKeys.size !== 0
    || slotCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount
  ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
  return legacySlotByCell;
}

function tierOneCells(source: GreaterRealmRuntimeReleaseSource): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < source.grid.cellCount; cell += 1) {
    if (source.tierId[cell] !== 1) continue;
    if (source.regionId[cell]! < 0 || source.regionId[cell]! >= PUBLIC_REGION_SPECS.length) {
      fail('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
    }
    cells.push(cell);
  }
  if (
    cells.length === 0
    || cells.length > GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT
  ) fail('GREATER_REALM_RUNTIME_RELEASE_TIER_ONE_COUNT_INVALID');
  return cells;
}

function discoverNavigationComponents(
  source: GreaterRealmRuntimeReleaseSource,
  releaseSeed: Uint8Array,
): Readonly<{
  components: NavigationComponent[];
  componentByCell: Map<number, NavigationComponent>;
}> {
  const navigable = new Uint8Array(source.grid.cellCount);
  for (let cell = 0; cell < source.grid.cellCount; cell += 1) {
    const ford = (
      (
        source.waterRegime[cell] === GREATER_REALM_WATER_REGIME_ID.RIVER
        || source.waterRegime[cell] === GREATER_REALM_WATER_REGIME_ID.STREAM
      )
      && source.routeClass[cell] === GREATER_REALM_ROUTE_CLASS.FORD
    );
    if (source.tierId[cell] !== 1) continue;
    if (source.regionId[cell] === 0) {
      const local = localCoordinate(source, cell);
      if (legacyLowlandsWaterProjection(local.q, local.r) !== undefined) continue;
    }
    if (source.legacyLowlandsCell[cell] === 1) {
      const local = localCoordinate(source, cell);
      if (legacyLowlandsGameplayProjection(
        local.q,
        local.r,
      ).passable) navigable[cell] = 1;
    } else if (
      (source.waterRegime[cell] === GREATER_REALM_WATER_REGIME_ID.DRY || ford)
      && source.barrier[cell] === 0
    ) navigable[cell] = 1;
  }
  const visited = new Uint8Array(source.grid.cellCount);
  const provisional: number[][] = [];
  for (let start = 0; start < source.grid.cellCount; start += 1) {
    if (navigable[start] !== 1 || visited[start] === 1) continue;
    const members: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor]!;
      members.push(cell);
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = source.grid.neighbors[cell * 6 + direction]!;
        if (neighbor >= 0 && navigable[neighbor] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    provisional.push(members);
  }
  navigable.fill(0);
  visited.fill(0);
  if (provisional.length < 1 || provisional.length > MAXIMUM_NAVIGATION_COMPONENTS) {
    fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_COUNT_INVALID');
  }
  provisional.sort((first, second) => first[0]! - second[0]!);
  const components: NavigationComponent[] = [];
  const componentByCell = new Map<number, NavigationComponent>();
  for (let ordinal = 0; ordinal < provisional.length; ordinal += 1) {
    const members = provisional[ordinal]!;
    const memberSet = new Set(members);
    const slotCells = members.filter(cell => source.castleSlot[cell] === 1);
    const root = slotCells[0] ?? members[0]!;
    const parentDirection = new Map<number, number>();
    const depth = new Map<number, number>([[root, 0]]);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor]!;
      const currentDepth = depth.get(cell)!;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = source.grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0 || !memberSet.has(neighbor) || depth.has(neighbor)) continue;
        if (currentDepth + 1 > MAXIMUM_ROUTE_DEPTH) {
          fail('GREATER_REALM_RUNTIME_RELEASE_ROUTE_DEPTH_INVALID');
        }
        depth.set(neighbor, currentDepth + 1);
        parentDirection.set(neighbor, (direction + 3) % 6);
        queue.push(neighbor);
      }
    }
    if (depth.size !== members.length) fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');
    let regionMask = 0;
    for (const cell of members) regionMask |= 1 << source.regionId[cell]!;
    const component: NavigationComponent = {
      ordinal,
      key: opaqueId(releaseSeed, 'GRC', 'component', `${ordinal}`),
      members,
      memberSet,
      root,
      parentDirection,
      depth,
      regionMask,
      slotCells,
    };
    components.push(component);
    for (const cell of members) componentByCell.set(cell, component);
  }
  return Object.freeze({ components, componentByCell });
}

function partitionTierOneCells(
  source: GreaterRealmRuntimeReleaseSource,
  cells: readonly number[],
  releaseSeed: Uint8Array,
): PartitionChunk[] {
  const included = new Uint8Array(source.grid.cellCount);
  for (const cell of cells) included[cell] = 1;
  const floorDiv = (value: number, divisor: number): number => Math.floor(value / divisor);
  const bins = new Map<string, { binQ: number; binR: number; cells: number[] }>();
  for (const cell of cells) {
    const binQ = floorDiv(source.grid.q[cell]!, 15);
    const binR = floorDiv(source.grid.r[cell]!, 15);
    const key = `${binQ}:${binR}`;
    const bin = bins.get(key) ?? { binQ, binR, cells: [] };
    bin.cells.push(cell);
    bins.set(key, bin);
  }
  const orderedBins = [...bins.values()].sort((first, second) => (
    first.binQ - second.binQ || first.binR - second.binR
  ));
  const chunks: PartitionChunk[] = [];
  for (const bin of orderedBins) {
    const ordinal = chunks.length;
    const core = [...bin.cells].sort((first, second) => (
      source.grid.q[first]! - source.grid.q[second]!
      || source.grid.r[first]! - source.grid.r[second]!
    ));
    if (core.length < 1 || core.length > 225) {
      fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_CORE_INVALID');
    }
    const coreSet = new Set(core);
    const apronSet = new Set<number>();
    for (const cell of core) {
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = source.grid.neighbors[cell * 6 + direction]!;
        if (neighbor >= 0 && included[neighbor] === 1 && !coreSet.has(neighbor)) {
          apronSet.add(neighbor);
        }
      }
    }
    const apron = [...apronSet].sort((first, second) => first - second);
    if (core.length + apron.length > MAXIMUM_CHUNK_VISIBLE_CELLS) {
      fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_APRON_INVALID');
    }
    chunks.push({
      ordinal,
      handle: opaqueId(releaseSeed, 'GRK', 'chunk', `${ordinal}`),
      coordKey: `B:${bin.binQ}:${bin.binR}`,
      binQ: bin.binQ,
      binR: bin.binR,
      core,
      apron,
    });
  }
  included.fill(0);
  if (chunks.length < 1 || chunks.length > MAXIMUM_RUNTIME_CHUNKS) {
    fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_COUNT_INVALID');
  }
  return chunks;
}

function localCoordinate(
  source: GreaterRealmRuntimeReleaseSource,
  cell: number,
): Readonly<{ q: number; r: number }> {
  if (source.regionId[cell] !== 0) {
    return Object.freeze({ q: source.grid.q[cell]!, r: source.grid.r[cell]! });
  }
  return inverseGlobalToLegacyLowlands({
    q: source.grid.q[cell]!,
    r: source.grid.r[cell]!,
  }, source.legacyLowlandsTransform);
}

function cellKey(
  source: GreaterRealmRuntimeReleaseSource,
  cell: number,
): string {
  const region = PUBLIC_REGION_SPECS[source.regionId[cell]!]!;
  const local = localCoordinate(source, cell);
  return `${region.id}:${local.q}:${local.r}`;
}

function atlasCoordKey(source: GreaterRealmRuntimeReleaseSource, cell: number): string {
  return `A:${source.grid.q[cell]!}:${source.grid.r[cell]!}`;
}

function sealedBoundaryMask(
  source: GreaterRealmRuntimeReleaseSource,
  cell: number,
): number {
  let mask = 0;
  for (let direction = 0; direction < 6; direction += 1) {
    const neighbor = source.grid.neighbors[cell * 6 + direction]!;
    const sealed = neighbor < 0 || source.tierId[neighbor] !== 1;
    if (sealed) mask |= 1 << direction;
  }
  return mask;
}

function movementCost(source: GreaterRealmRuntimeReleaseSource, cell: number): number {
  const slope = source.slope[cell]!;
  const wetness = source.wetnessIndex[cell]!;
  const route = source.routeClass[cell]!;
  const routeDiscount = route === GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY
    ? 60
    : route === GREATER_REALM_ROUTE_CLASS.ROAD
      ? 40
      : route === GREATER_REALM_ROUTE_CLASS.TRACK
        ? 20
        : 0;
  return Math.max(1, 100 + Math.floor(slope / 80) + Math.floor(wetness / 160) - routeDiscount);
}

/**
 * Public passive terrain yield. The Lowlands path exactly preserves the
 * deployed canonical terrain/content classification; new terrain uses only
 * already-declassified surface fields and never candidate suitability masks.
 */
function passiveYieldClass(
  source: GreaterRealmRuntimeReleaseSource,
  cell: number,
  passable: boolean,
): number {
  if (!passable) return 0;
  if (source.legacyLowlandsCell[cell] === 1) {
    const local = localCoordinate(source, cell);
    return legacyLowlandsGameplayProjection(
      local.q,
      local.r,
    ).yieldClass;
  }
  const fertile = source.moisture[cell]! >= 4_000
    && source.slope[cell]! <= 4_000
    && source.waterRegime[cell] === GREATER_REALM_WATER_REGIME_ID.DRY;
  return fertile ? 2 : 1;
}

function buildCell(
  source: GreaterRealmRuntimeReleaseSource,
  releaseSeed: Uint8Array,
  cell: number,
  releaseOrdinal: number,
  chunkHandle: string,
  component: NavigationComponent | undefined,
  publicWaterIdByPrivateId: Map<string, string>,
  publicRidgeIdByPrivateId: Map<number, string>,
): GreaterRealmRuntimeCell {
  const local = localCoordinate(source, cell);
  const lockedWater = source.regionId[cell] === 0
    ? legacyLowlandsWaterProjection(local.q, local.r)
    : undefined;
  const regime = assertIntegerRange(
    lockedWater?.hydroRegime ?? source.waterRegime[cell]!,
    GREATER_REALM_WATER_REGIME_ID.DRY,
    GREATER_REALM_WATER_REGIME_ID.MARSH,
    'GREATER_REALM_RUNTIME_RELEASE_WATER_REGIME_INVALID',
  );
  const depthClass = assertIntegerRange(
    lockedWater?.row.depthClass ?? source.waterDepthClass[cell]!,
    GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY,
    GREATER_REALM_WATER_DEPTH_CLASS_ID.DEEP,
    'GREATER_REALM_RUNTIME_RELEASE_WATER_DEPTH_INVALID',
  );
  const passable = component !== undefined;
  let hydroBodyId: string | undefined;
  if (regime !== GREATER_REALM_WATER_REGIME_ID.DRY) {
    const privateWaterId = source.waterBodyId[cell]!;
    if (lockedWater === undefined && privateWaterId === 0) {
      fail('GREATER_REALM_RUNTIME_RELEASE_WATER_ID_INVALID');
    }
    const lookup = lockedWater === undefined
      ? `generated:${privateWaterId}`
      : `legacy-lowlands:${lockedWater.row.bodyId}`;
    hydroBodyId = publicWaterIdByPrivateId.get(lookup);
    if (hydroBodyId === undefined) {
      hydroBodyId = opaqueId(releaseSeed, 'GRW', 'hydro-body', lookup);
      publicWaterIdByPrivateId.set(lookup, hydroBodyId);
    }
  } else if (source.waterBodyId[cell] !== 0 || depthClass !== 0) {
    fail('GREATER_REALM_RUNTIME_RELEASE_DRY_HYDROLOGY_INVALID');
  }
  const privateRidgeId = source.ridgeId[cell]!;
  let ridgeId: string | undefined;
  if (privateRidgeId >= 0) {
    ridgeId = publicRidgeIdByPrivateId.get(privateRidgeId);
    if (ridgeId === undefined) {
      ridgeId = opaqueId(releaseSeed, 'GRD', 'ridge', `${privateRidgeId}`);
      publicRidgeIdByPrivateId.set(privateRidgeId, ridgeId);
    }
  } else if (privateRidgeId !== -1) {
    fail('GREATER_REALM_RUNTIME_RELEASE_RIDGE_INVALID');
  }
  let hydroFlowDirection: number | undefined;
  let downstream = source.waterDownstream[cell]!;
  if (lockedWater?.row.downstreamWaterCellKey !== undefined) {
    const downstreamWater = LEGACY_LOWLANDS_WATER_BY_KEY.get(
      lockedWater.row.downstreamWaterCellKey,
    );
    if (downstreamWater === undefined) {
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
    }
    downstream = source.grid.indexOf(transformLegacyLowlandsToGlobal(
      downstreamWater,
      source.legacyLowlandsTransform,
    ));
    if (downstream < 0 || source.tierId[downstream] !== 1) {
      fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
    }
  } else if (lockedWater !== undefined) {
    downstream = -1;
  }
  if (downstream >= 0) {
    const direction = Array.from({ length: 6 }, (_, index) => index)
      .find(index => source.grid.neighbors[cell * 6 + index] === downstream);
    if (direction === undefined) fail('GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID');
    if (
      source.tierId[downstream] === 1
      && (regime === GREATER_REALM_WATER_REGIME_ID.RIVER
        || regime === GREATER_REALM_WATER_REGIME_ID.STREAM)
    ) hydroFlowDirection = direction;
  } else if (downstream !== -1) {
    fail('GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID');
  }
  const flowAccumulation = lockedWater === undefined
    ? source.flowAccumulation[cell]!
    : BigInt(lockedWater.row.flowAccumulation);
  if (flowAccumulation < 0n || flowAccumulation > 0xffff_ffff_ffff_ffffn) {
    fail('GREATER_REALM_RUNTIME_RELEASE_FLOW_ACCUMULATION_INVALID');
  }
  const route = assertIntegerRange(
    source.routeClass[cell]!,
    GREATER_REALM_ROUTE_CLASS.NONE,
    GREATER_REALM_ROUTE_CLASS.FORD,
    'GREATER_REALM_RUNTIME_RELEASE_ROUTE_INVALID',
  );
  const legacyProjection = source.legacyLowlandsCell[cell] === 1
    ? legacyLowlandsGameplayProjection(local.q, local.r)
    : undefined;
  const hydroSurfaceMilli = lockedWater?.row.surfaceLevelMilli
    ?? source.waterSurfaceLevel[cell]!;
  const hydrologyRevision = assertIntegerRange(
    lockedWater?.row.generationVersion ?? source.waterGenerationVersion[cell]!,
    0,
    0xffff,
    'GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_REVISION_INVALID',
  );
  if (
    legacyProjection !== undefined
    && (
      legacyProjection.passable !== passable
      || legacyProjection.hydroRegime !== regime
      || legacyProjection.biomeClass !== source.biomeId[cell]
      || legacyProjection.landformClass !== source.landformId[cell]
      || (legacyProjection.hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY && (
        depthClass !== GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY
        || hydroSurfaceMilli !== INT32_MIN
        || hydroBodyId !== undefined
        || hydroFlowDirection !== undefined
        || hydrologyRevision !== 0
      ))
    )
  ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');
  const routeDepth = component?.depth.get(cell);
  const routeParentDirection = component?.parentDirection.get(cell);
  if (component !== undefined && routeDepth === undefined) {
    fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');
  }
  return Object.freeze({
    cellKey: cellKey(source, cell),
    atlasCoordKey: atlasCoordKey(source, cell),
    releaseOrdinal,
    atlasId: GREATER_REALM_ATLAS_ID,
    chunkHandle,
    regionId: PUBLIC_REGION_SPECS[source.regionId[cell]!]!.id,
    ...(component === undefined ? {} : { componentKey: component.key }),
    localQ: local.q,
    localR: local.r,
    atlasQ: source.grid.q[cell]!,
    atlasR: source.grid.r[cell]!,
    tier: 1,
    passable,
    elevation: source.elevation[cell]!,
    slope: assertIntegerRange(source.slope[cell]!, 0, 0xffff, 'GREATER_REALM_RUNTIME_RELEASE_SLOPE_INVALID'),
    aspect: assertIntegerRange(source.aspect[cell]!, 0, 6, 'GREATER_REALM_RUNTIME_RELEASE_ASPECT_INVALID'),
    profileCurvature: source.profileCurvature[cell]!,
    planCurvature: source.planCurvature[cell]!,
    ...(ridgeId === undefined ? {} : { ridgeId }),
    geologicalBarrierBand: assertIntegerRange(
      source.geologicalBarrierBand[cell]!,
      0,
      3,
      'GREATER_REALM_RUNTIME_RELEASE_BARRIER_BAND_INVALID',
    ),
    biomeClass: assertIntegerRange(
      source.biomeId[cell]!,
      0,
      GREATER_REALM_BIOME_CLASS_COUNT - 1,
      'GREATER_REALM_RUNTIME_RELEASE_BIOME_INVALID',
    ),
    landformClass: assertIntegerRange(
      source.landformId[cell]!,
      0,
      GREATER_REALM_LANDFORM_CLASS_COUNT - 1,
      'GREATER_REALM_RUNTIME_RELEASE_LANDFORM_INVALID',
    ),
    yieldClass: passiveYieldClass(source, cell, passable),
    movementCost: legacyProjection?.movementCost
      ?? (component === undefined ? 1_000_000 : movementCost(source, cell)),
    sealedBoundaryMask: sealedBoundaryMask(source, cell),
    hydroRegime: regime,
    ...(hydroBodyId === undefined ? {} : { hydroBodyId }),
    hydroDepthClass: depthClass,
    hydroSurfaceMilli,
    ...(hydroFlowDirection === undefined ? {} : { hydroFlowDirection }),
    flowAccumulation: flowAccumulation.toString(10),
    bankVariant: publicUint32(releaseSeed, 'bank-variant', `${cell}`),
    hydrologyRevision,
    ...(routeParentDirection === undefined ? {} : { routeParentDirection }),
    ...(routeDepth === undefined ? {} : { routeDepth }),
    travelClass: route,
    wetness: source.wetnessIndex[cell]!,
    exposure: source.exposure[cell]!,
    coastDistance: source.distanceToCoast[cell]!,
    freshwaterDistance: source.distanceToFreshwater[cell]!,
    temperature: source.temperature[cell]!,
    moisture: source.moisture[cell]!,
    habitatClass: assertIntegerRange(
      source.ecologyClass[cell]!,
      GREATER_REALM_ECOLOGY_CLASS.NONE,
      GREATER_REALM_ECOLOGY_CLASS.SNOW,
      'GREATER_REALM_RUNTIME_RELEASE_ECOLOGY_INVALID',
    ),
    canopyBasisPoints: scaledByte(source.vegetationDensity[cell]!),
    groundcoverBasisPoints: scaledByte(source.groundcoverDensity[cell]!),
    wildflowerBasisPoints: scaledByte(source.wildflowerDensity[cell]!),
    featureClass: assertIntegerRange(
      source.landmarkClass[cell]!,
      GREATER_REALM_LANDMARK_CLASS.NONE,
      GREATER_REALM_LANDMARK_CLASS.LAMP_POST,
      'GREATER_REALM_RUNTIME_RELEASE_LANDMARK_INVALID',
    ),
    ambienceClass: assertIntegerRange(
      source.ambientLifeClass[cell]!,
      GREATER_REALM_AMBIENT_LIFE_CLASS.NONE,
      GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE,
      'GREATER_REALM_RUNTIME_RELEASE_AMBIENT_INVALID',
    ),
    presentationVariant: publicUint32(releaseSeed, 'presentation-variant', `${cell}`),
  });
}

function canonicalLegacyResourceRows(): Readonly<Record<ResourceKind, readonly Readonly<{
  siteId: string;
  q: number;
  r: number;
  policyVersion: string;
}>[]>> {
  const resources = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.resources;
  return Object.freeze(Object.fromEntries(RESOURCE_KINDS.map(kind => [
    kind,
    Object.freeze(resources[kind].sites.map(site => Object.freeze({
      siteId: site.siteId,
      q: site.q,
      r: site.r,
      policyVersion: resources[kind].policyVersion,
    }))),
  ]))) as Readonly<Record<ResourceKind, readonly Readonly<{
    siteId: string;
    q: number;
    r: number;
    policyVersion: string;
  }>[]>>;
}

function buildSlots(
  source: GreaterRealmRuntimeReleaseSource,
  releaseSeed: Uint8Array,
  cellsBySourceIndex: ReadonlyMap<number, GreaterRealmRuntimeCell>,
  componentByCell: ReadonlyMap<number, NavigationComponent>,
  legacySlotByCell: ReadonlyMap<number, number>,
): GreaterRealmRuntimeSlot[] {
  const slotCells: number[] = [];
  const regionCounts = Array<number>(PUBLIC_REGION_SPECS.length).fill(0);
  for (let cell = 0; cell < source.grid.cellCount; cell += 1) {
    if (source.castleSlot[cell] !== 1) continue;
    if (
      source.tierId[cell] !== 1
      || source.waterRegime[cell] !== GREATER_REALM_WATER_REGIME_ID.DRY
      || !cellsBySourceIndex.has(cell)
    ) {
      fail('GREATER_REALM_RUNTIME_RELEASE_SLOT_TIER_INVALID');
    }
    const component = componentByCell.get(cell);
    if (component === undefined) fail('GREATER_REALM_RUNTIME_RELEASE_SLOT_REACHABILITY_INVALID');
    slotCells.push(cell);
    regionCounts[source.regionId[cell]!] += 1;
  }
  slotCells.sort((first, second) => (
    cellsBySourceIndex.get(first)!.releaseOrdinal - cellsBySourceIndex.get(second)!.releaseOrdinal
  ));
  if (
    slotCells.length !== 600
    || regionCounts.some(count => count !== 100)
    || legacySlotByCell.size !== 100
  ) fail('GREATER_REALM_RUNTIME_RELEASE_SLOT_COUNT_INVALID');
  const legacyIds = new Set(legacySlotByCell.values());
  if (legacyIds.size !== 100 || [...legacyIds].some(id => id < 1 || id > 100)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
  }
  if (slotCells.some(cell => (
    (source.regionId[cell] === 0) !== legacySlotByCell.has(cell)
  ))) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
  return slotCells.map((cell, releaseOrdinal) => {
    const runtimeCell = cellsBySourceIndex.get(cell)!;
    const component = componentByCell.get(cell)!;
    const legacySlotId = legacySlotByCell.get(cell);
    return Object.freeze({
      slotId: opaqueId(releaseSeed, 'GRS', 'castle-slot', `${releaseOrdinal}`),
      releaseOrdinal,
      atlasId: GREATER_REALM_ATLAS_ID,
      cellKey: runtimeCell.cellKey,
      regionId: runtimeCell.regionId,
      componentKey: component.key,
      tier: 1,
      regionOrderRank: UINT32_MAX,
      allocationRank: UINT32_MAX,
      active: false,
      ...(legacySlotId === undefined ? {} : { legacySlotId }),
    });
  });
}

function buildResourceNodes(
  source: GreaterRealmRuntimeReleaseSource,
  releaseSeed: Uint8Array,
  cellsBySourceIndex: ReadonlyMap<number, GreaterRealmRuntimeCell>,
  componentByCell: ReadonlyMap<number, NavigationComponent>,
  components: readonly NavigationComponent[],
  slots: readonly GreaterRealmRuntimeSlot[],
): GreaterRealmRuntimeResourceNode[] {
  const sourceIndexByAtlasCoordinate = new Map<string, number>();
  for (const [sourceIndex, cell] of cellsBySourceIndex) {
    sourceIndexByAtlasCoordinate.set(`${cell.atlasQ},${cell.atlasR}`, sourceIndex);
  }
  const legacy = canonicalLegacyResourceRows();
  const legacyByComponentRegionAndKind = new Map<string, Array<Readonly<{
    sourceIndex: number;
    siteId: string;
    policyVersion: string;
  }>>>();
  for (const kind of RESOURCE_KINDS) {
    for (const site of legacy[kind]) {
      const global = transformLegacyLowlandsToGlobal(site, source.legacyLowlandsTransform);
      const sourceIndex = sourceIndexByAtlasCoordinate.get(`${global.q},${global.r}`);
      const component = sourceIndex === undefined ? undefined : componentByCell.get(sourceIndex);
      if (sourceIndex === undefined || component === undefined) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
      }
      const region = source.regionId[sourceIndex]!;
      if (region !== 0) fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
      const key = `${component.key}:${region}:${kind}`;
      const values = legacyByComponentRegionAndKind.get(key) ?? [];
      values.push(Object.freeze({ sourceIndex, siteId: site.siteId, policyVersion: site.policyVersion }));
      legacyByComponentRegionAndKind.set(key, values);
    }
  }
  const slotCountByComponentRegion = new Map<string, number>();
  for (const slot of slots) {
    const regionOrdinal = PUBLIC_REGION_SPECS.find(region => region.id === slot.regionId)?.ordinal;
    if (regionOrdinal === undefined) fail('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
    const key = `${slot.componentKey}:${regionOrdinal}`;
    slotCountByComponentRegion.set(
      key,
      (slotCountByComponentRegion.get(key) ?? 0) + 1,
    );
  }
  const nodes: GreaterRealmRuntimeResourceNode[] = [];
  for (const component of components) {
    for (const region of PUBLIC_REGION_SPECS) {
      const componentRegionKey = `${component.key}:${region.ordinal}`;
      const componentRegionSlotCount = slotCountByComponentRegion.get(componentRegionKey) ?? 0;
      const requiredPerKind = componentRegionSlotCount * RESOURCE_MARGIN_PER_SLOT;
      for (const kind of RESOURCE_KINDS) {
        const legacyRows = [...(
          legacyByComponentRegionAndKind.get(`${componentRegionKey}:${kind}`) ?? []
        )].sort((first, second) => first.siteId.localeCompare(second.siteId));
        if (requiredPerKind === 0) {
          if (legacyRows.length !== 0) {
            fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
          }
          continue;
        }
        if (region.ordinal === 0 && legacyRows.length === 0) {
          fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
        }
        const scoreByCell = new Map<number, number>();
        const candidates = component.members.filter(cell => (
          region.ordinal !== 0
          && source.regionId[cell] === region.ordinal
          && source.resourcePotential[cell] === 1
          && source.castleSlot[cell] === 0
          && source.waterRegime[cell] === GREATER_REALM_WATER_REGIME_ID.DRY
        ));
        for (const candidate of candidates) {
          scoreByCell.set(
            candidate,
            publicUint32(
              releaseSeed,
              `resource-location-${region.ordinal}-${kind}`,
              `${candidate}`,
            ),
          );
        }
        candidates.sort((first, second) => (
          scoreByCell.get(first)! - scoreByCell.get(second)! || first - second
        ));
        const requestedLocationCount = Math.max(1, Math.ceil(requiredPerKind / 6));
        const newLocations = candidates
          .slice(0, Math.min(candidates.length, requestedLocationCount))
          .map(sourceIndex => Object.freeze({
            sourceIndex,
            siteId: undefined,
            policyVersion: GREATER_REALM_RESOURCE_POLICY_VERSION,
          }));
        const locations = [...(region.ordinal === 0 ? legacyRows : newLocations)]
          .map(location => Object.freeze({
            ...location,
            locationId: opaqueId(
              releaseSeed,
              'GRL',
              'resource-location',
              `${component.ordinal}:${region.ordinal}:${kind}:${location.sourceIndex}`,
            ),
          }))
          .sort((first, second) => first.locationId.localeCompare(second.locationId));
        if (locations.length === 0 || locations.length > requiredPerKind) {
          fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_MARGIN_INVALID');
        }
        if (locations.some((location, index) => (
          index > 0 && location.locationId === locations[index - 1]!.locationId
        ))) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
        if (
          Math.ceil(requiredPerKind / locations.length)
            > GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION
        ) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_MARGIN_INVALID');
        for (let nodeOrdinal = 0; nodeOrdinal < requiredPerKind; nodeOrdinal += 1) {
          const selectedRow = locations[Math.floor(
            (nodeOrdinal * locations.length) / requiredPerKind,
          )]!;
          const runtimeCell = cellsBySourceIndex.get(selectedRow.sourceIndex)!;
          if (
            !runtimeCell.passable
            || runtimeCell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY
            || runtimeCell.regionId !== region.id
          ) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_REACHABILITY_INVALID');
          const releaseOrdinal = nodes.length;
          nodes.push(Object.freeze({
            nodeId: opaqueId(releaseSeed, 'GRN', 'resource-node', `${releaseOrdinal}`),
            releaseOrdinal,
            atlasId: GREATER_REALM_ATLAS_ID,
            locationId: selectedRow.locationId,
            cellKey: runtimeCell.cellKey,
            regionId: runtimeCell.regionId,
            componentKey: component.key,
            resourceKind: kind,
            tier: 1,
            nodeOrdinal,
            allocationRank: UINT32_MAX,
            ...(selectedRow.siteId === undefined ? {} : { legacyCatalogId: selectedRow.siteId }),
            policyVersion: selectedRow.policyVersion,
            active: false,
          }));
        }
      }
    }
  }
  if (nodes.length !== 12_000) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_COUNT_INVALID');
  return nodes;
}

function digestComponent(
  componentKey: string,
  componentCells: readonly GreaterRealmRuntimeCell[],
  componentSlots: readonly GreaterRealmRuntimeSlot[],
  componentNodes: readonly GreaterRealmRuntimeResourceNode[],
): string {
  function* frames(): Generator<Buffer> {
    yield canonicalBytes({ componentKey });
    yield canonicalBytes({ section: 'cells', count: componentCells.length });
    for (const cell of componentCells) yield canonicalBytes(cell);
    yield canonicalBytes({ section: 'castle-slots', count: componentSlots.length });
    for (const slot of componentSlots) yield canonicalBytes(slot);
    yield canonicalBytes({ section: 'resource-nodes', count: componentNodes.length });
    for (const node of componentNodes) yield canonicalBytes(node);
  }
  return framedSha256('warpkeep.greater-realm.component.v1', frames());
}

function releaseHeader(input: Readonly<{
  publicReleaseId: string;
  publicApprovalReceiptId: string;
  sourceCommit: string;
  totals: Readonly<Record<string, number>>;
  legacyLowlandsBridge: Readonly<Record<string, unknown>>;
}>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: GREATER_REALM_RUNTIME_RELEASE_SCHEMA,
    classification: 'declassified-tier-i-runtime-import',
    atlasId: GREATER_REALM_ATLAS_ID,
    publicReleaseId: input.publicReleaseId,
    publicApprovalReceiptId: input.publicApprovalReceiptId,
    sourceCommit: input.sourceCommit,
    generatorVersion: GREATER_REALM_GENERATOR_VERSION,
    sourceFormatVersion: 'wkgr-runtime-source-v1',
    livingWorldVersion: GREATER_REALM_LIVING_WORLD_VERSION,
    runtimePartitionVersion: GREATER_REALM_RUNTIME_PARTITION_VERSION,
    rendererContractVersion: GREATER_REALM_RENDERER_CONTRACT_VERSION,
    visibleTierMax: 1,
    totals: input.totals,
    legacyLowlandsBridge: input.legacyLowlandsBridge,
  });
}

function chooseLodKeys(
  releaseSeed: Uint8Array,
  domain: string,
  keys: readonly string[],
  count: number,
  requiredKey?: string,
): readonly string[] {
  const scores = new Map(keys.map(key => [
    key,
    publicUint32(releaseSeed, domain, key),
  ] as const));
  const compare = (first: string, second: string): number => (
    scores.get(first)! - scores.get(second)!
    || first.localeCompare(second)
  );
  const selected = [...keys].sort(compare).slice(0, Math.max(1, count));
  if (requiredKey !== undefined) {
    if (!keys.includes(requiredKey)) fail('GREATER_REALM_RUNTIME_RELEASE_LOD_INVALID');
    if (!selected.includes(requiredKey)) selected[selected.length - 1] = requiredKey;
    selected.sort(compare);
  }
  return Object.freeze(selected);
}

function importBatchDescriptors<T extends Readonly<{ releaseOrdinal: number }>>(
  rows: readonly T[],
  maximumRows: number,
): readonly Readonly<{
  batchOrdinal: number;
  firstRowOrdinal: number;
  rowCount: number;
  rowsSha256: string;
}>[] {
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += maximumRows) {
    const batchRows = rows.slice(offset, offset + maximumRows);
    batches.push(Object.freeze({
      batchOrdinal: batches.length,
      firstRowOrdinal: batchRows[0]!.releaseOrdinal,
      rowCount: batchRows.length,
      rowsSha256: sha256(canonicalBytes(batchRows)),
    }));
  }
  return Object.freeze(batches);
}

function importBatchesEqual<T extends Readonly<{ releaseOrdinal: number }>>(
  actual: unknown,
  rows: readonly T[],
  maximumRows: number,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(importBatchDescriptors(rows, maximumRows));
}

function assertNoPrivateReleaseMaterial(value: unknown): void {
  const text = JSON.stringify(value);
  if (
    /GR-[AB]-[A-Z2-7]{16}/u.test(text)
    || /OWNER-[A-Z0-9._-]{8,}/u.test(text)
    || /(?:private-(?:candidate|batch|atlas|owner|seed)|selection\.private|stageDigest|gateEndpoint|batchHandle|candidateHandle|approvalReference|legacyLowlandsTransform|waterBankSeed)/iu.test(text)
    || /"(?:resourcePotential|corePotential|throneAnchor|gateCell|gateApproachCell|barrier|barrierCrossSections|seedNamespace|terrainSeedNamespace|rootSeed|candidateSeed|presentationSeed)"\s*:/iu.test(text)
    || /(?:T2_CROWNWOOD|T2_IRONVEIL|T2_GLASSWATER|T3_THRONEHEART|Crownwood March|Ironveil March|Glasswater March|Throneheart)/u.test(text)
  ) fail('GREATER_REALM_RUNTIME_RELEASE_PRIVACY_BOUNDARY_INVALID');
}

export function createGreaterRealmRuntimeRelease(input: Readonly<{
  source: GreaterRealmRuntimeReleaseSource;
  sourceCommit: string;
  releaseSeed: Uint8Array;
}>): GreaterRealmRuntimeReleaseArtifacts {
  if (!SOURCE_COMMIT_PATTERN.test(input.sourceCommit)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_SOURCE_COMMIT_INVALID');
  }
  if (!(input.releaseSeed instanceof Uint8Array) || input.releaseSeed.length !== RELEASE_SEED_BYTES) {
    fail('GREATER_REALM_RUNTIME_RELEASE_SEED_INVALID');
  }
  assertExactPublicRegionPolicy();
  exactSourceShape(input.source);
  const legacySlotByCell = assertLegacyLowlandsBridge(input.source);
  const tierOne = tierOneCells(input.source);
  const { components, componentByCell } = discoverNavigationComponents(
    input.source,
    input.releaseSeed,
  );
  const partitions = partitionTierOneCells(input.source, tierOne, input.releaseSeed);
  const publicReleaseId = opaqueId(input.releaseSeed, 'GRR', 'release', 'v1');
  const publicApprovalReceiptId = opaqueId(input.releaseSeed, 'GRA', 'approval', 'v1');
  const sourceCellToChunk = new Map<number, PartitionChunk>();
  const releaseOrdinalBySourceCell = new Map<number, number>();
  let releaseOrdinal = 0;
  for (const partition of partitions) {
    for (const cell of partition.core) {
      sourceCellToChunk.set(cell, partition);
      releaseOrdinalBySourceCell.set(cell, releaseOrdinal);
      releaseOrdinal += 1;
    }
  }
  if (releaseOrdinal !== tierOne.length) fail('GREATER_REALM_RUNTIME_RELEASE_PARTITION_INVALID');
  const publicWaterIdByPrivateId = new Map<string, string>();
  const publicRidgeIdByPrivateId = new Map<number, string>();
  const cellsBySourceIndex = new Map<number, GreaterRealmRuntimeCell>();
  const cells: GreaterRealmRuntimeCell[] = [];
  for (const partition of partitions) {
    for (const sourceCell of partition.core) {
      const cell = buildCell(
        input.source,
        input.releaseSeed,
        sourceCell,
        releaseOrdinalBySourceCell.get(sourceCell)!,
        partition.handle,
        componentByCell.get(sourceCell),
        publicWaterIdByPrivateId,
        publicRidgeIdByPrivateId,
      );
      cellsBySourceIndex.set(sourceCell, cell);
      cells.push(cell);
    }
  }
  cells.sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  const slots = buildSlots(
    input.source,
    input.releaseSeed,
    cellsBySourceIndex,
    componentByCell,
    legacySlotByCell,
  );
  const nodes = buildResourceNodes(
    input.source,
    input.releaseSeed,
    cellsBySourceIndex,
    componentByCell,
    components,
    slots,
  );
  const cellsByComponentKey = new Map<string, GreaterRealmRuntimeCell[]>();
  for (const cell of cells) {
    if (cell.componentKey === undefined) continue;
    const values = cellsByComponentKey.get(cell.componentKey) ?? [];
    values.push(cell);
    cellsByComponentKey.set(cell.componentKey, values);
  }
  const slotsByComponentKey = new Map<string, GreaterRealmRuntimeSlot[]>();
  for (const slot of slots) {
    const values = slotsByComponentKey.get(slot.componentKey) ?? [];
    values.push(slot);
    slotsByComponentKey.set(slot.componentKey, values);
  }
  const nodesByComponentKey = new Map<string, GreaterRealmRuntimeResourceNode[]>();
  for (const node of nodes) {
    const values = nodesByComponentKey.get(node.componentKey) ?? [];
    values.push(node);
    nodesByComponentKey.set(node.componentKey, values);
  }
  const slotsByCellKey = new Map<string, GreaterRealmRuntimeSlot[]>();
  for (const slot of slots) slotsByCellKey.set(slot.cellKey, [slot]);
  const nodesByCellKey = new Map<string, GreaterRealmRuntimeResourceNode[]>();
  for (const node of nodes) {
    const values = nodesByCellKey.get(node.cellKey) ?? [];
    values.push(node);
    nodesByCellKey.set(node.cellKey, values);
  }
  const chunks: GreaterRealmRuntimeChunkArtifact[] = [];
  const chunkDescriptors: Array<Readonly<Record<string, unknown>>> = [];
  for (const partition of partitions) {
    const coreCells = partition.core.map(sourceCell => cellsBySourceIndex.get(sourceCell)!);
    const apronKeys = partition.apron.map(sourceCell => cellsBySourceIndex.get(sourceCell)!.cellKey);
    const visibleKeys = [...coreCells.map(cell => cell.cellKey), ...apronKeys];
    const pinnedCoreKey = coreCells[0]!.cellKey;
    const lod1 = chooseLodKeys(
      input.releaseSeed,
      `chunk-${partition.ordinal}-lod1`,
      visibleKeys,
      Math.ceil(visibleKeys.length / 2),
      pinnedCoreKey,
    );
    const lod2 = chooseLodKeys(
      input.releaseSeed,
      `chunk-${partition.ordinal}-lod2`,
      lod1,
      Math.ceil(lod1.length / 2),
      pinnedCoreKey,
    );
    const lod3 = chooseLodKeys(
      input.releaseSeed,
      `chunk-${partition.ordinal}-lod3`,
      lod2,
      Math.ceil(lod2.length / 2),
      pinnedCoreKey,
    );
    const chunkSlots = Object.freeze(
      coreCells.flatMap(cell => slotsByCellKey.get(cell.cellKey) ?? []),
    );
    const chunkNodes = Object.freeze(
      coreCells.flatMap(cell => nodesByCellKey.get(cell.cellKey) ?? []),
    );
    const chunkLocationCount = new Set(chunkNodes.map(node => node.locationId)).size;
    if (
      chunkSlots.length > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS
      || chunkNodes.length > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES
      || chunkLocationCount > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_CAPACITY_INVALID');
    const sectionDigests = Object.freeze({
      cellsSha256: sha256(canonicalBytes(coreCells)),
      apronSha256: sha256(canonicalBytes(apronKeys)),
      lodSha256: sha256(canonicalBytes({ lod1, lod2, lod3 })),
      castleSlotsSha256: sha256(canonicalBytes(chunkSlots)),
      resourceNodesSha256: sha256(canonicalBytes(chunkNodes)),
    });
    const importBatches = Object.freeze({
      castleSlots: importBatchDescriptors(chunkSlots, 128),
      resourceNodes: importBatchDescriptors(chunkNodes, 256),
    });
    const payload = Object.freeze({
      schema: GREATER_REALM_RUNTIME_CHUNK_SCHEMA,
      publicReleaseId,
      chunkHandle: partition.handle,
      importOrdinal: partition.ordinal,
      cells: Object.freeze(coreCells),
      apronCellKeys: Object.freeze(apronKeys),
      lod1CellKeys: lod1,
      lod2CellKeys: lod2,
      lod3CellKeys: lod3,
      castleSlots: chunkSlots,
      resourceNodes: chunkNodes,
      importBatches,
      sectionDigests,
    } satisfies GreaterRealmRuntimeChunkPayload);
    const bytes = canonicalBytes(payload);
    const payloadSha256 = sha256(bytes);
    const first = coreCells[0]!;
    const path = `chunks/${partition.handle}.json`;
    chunks.push(Object.freeze({ path, bytes, payload }));
    chunkDescriptors.push(Object.freeze({
      chunkHandle: partition.handle,
      chunkCoordKey: partition.coordKey,
      importOrdinal: partition.ordinal,
      binQ: partition.binQ,
      binR: partition.binR,
      firstCellOrdinal: first.releaseOrdinal,
      coreCellCount: coreCells.length,
      apronCellCount: apronKeys.length,
      lod0CellCount: coreCells.length,
      lod1CellCount: lod1.length,
      lod2CellCount: lod2.length,
      lod3CellCount: lod3.length,
      payloadSha256,
      sectionDigests,
      path,
    }));
  }
  const regionRows = PUBLIC_REGION_SPECS.map(region => {
    const regionCells = cells.filter(cell => cell.regionId === region.id);
    const regionSlots = slots.filter(slot => slot.regionId === region.id);
    const regionNodes = nodes.filter(node => node.regionId === region.id);
    return Object.freeze({
      regionId: region.id,
      publicName: region.name,
      ordinal: region.ordinal,
      tier: 1,
      cellCount: regionCells.length,
      passableCellCount: regionCells.filter(cell => cell.passable).length,
      chunkCount: new Set(regionCells.map(cell => cell.chunkHandle)).size,
      castleCapacity: regionSlots.length,
      resourceLocationCount: new Set(regionNodes.map(node => node.locationId)).size,
      resourceNodeCount: regionNodes.length,
      foodNodeCount: regionNodes.filter(node => node.resourceKind === 'food').length,
      woodNodeCount: regionNodes.filter(node => node.resourceKind === 'wood').length,
      stoneNodeCount: regionNodes.filter(node => node.resourceKind === 'stone').length,
      goldNodeCount: regionNodes.filter(node => node.resourceKind === 'gold').length,
      active: false,
    });
  });
  const componentRows = components.map(component => {
    const componentCells = cellsByComponentKey.get(component.key) ?? [];
    const componentSlots = slotsByComponentKey.get(component.key) ?? [];
    const componentNodes = nodesByComponentKey.get(component.key) ?? [];
    const countKind = (kind: ResourceKind) => (
      componentNodes.filter(node => node.resourceKind === kind).length
    );
    return Object.freeze({
      componentKey: component.key,
      componentOrdinal: component.ordinal,
      regionMask: component.regionMask,
      rootCellKey: cellsBySourceIndex.get(component.root)!.cellKey,
      expectedCellCount: component.members.length,
      maxRouteDepth: maximumInteger(component.depth.values()),
      expectedSlotCount: componentSlots.length,
      expectedFoodNodeCount: countKind('food'),
      expectedWoodNodeCount: countKind('wood'),
      expectedStoneNodeCount: countKind('stone'),
      expectedGoldNodeCount: countKind('gold'),
      componentSha256: digestComponent(
        component.key,
        componentCells,
        componentSlots,
        componentNodes,
      ),
    });
  });
  const legacyResourceCounts = Object.freeze(Object.fromEntries(RESOURCE_KINDS.map(kind => [
    kind,
    new Set(nodes
      .filter(node => node.resourceKind === kind && node.legacyCatalogId !== undefined)
      .map(node => node.legacyCatalogId)).size,
  ])));
  const totals = Object.freeze({
    regionCount: regionRows.length,
    componentCount: componentRows.length,
    chunkCount: chunkDescriptors.length,
    cellCount: cells.length,
    castleSlotCount: slots.length,
    resourceNodeCount: nodes.length,
  });
  const legacyLowlandsBridge = Object.freeze({
      mappedCellCount: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount,
      mappedCastleSlotCount: legacySlotByCell.size,
      mappedResourceCatalogCounts: legacyResourceCounts,
      worldGenerationDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldGenerationDigest,
      castleSlotDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotDigest,
      goldSiteDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.goldSiteDigest,
      foodSiteDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.foodSiteDigest,
      woodSiteDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.woodSiteDigest,
      stoneSiteDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.stoneSiteDigest,
  });
  const header = releaseHeader({
    publicReleaseId,
    publicApprovalReceiptId,
    sourceCommit: input.sourceCommit,
    totals,
    legacyLowlandsBridge,
  });
  const releaseSha256 = framedSha256('warpkeep.greater-realm.release.v1', [
    canonicalBytes(header),
    ...chunks.map(chunk => chunk.bytes),
    canonicalBytes(componentRows),
    canonicalBytes(regionRows),
  ]);
  const manifest = Object.freeze({
    ...header,
    regions: Object.freeze(regionRows),
    components: Object.freeze(componentRows),
    chunks: Object.freeze(chunkDescriptors),
    releaseSha256,
  });
  const status = Object.freeze({
    schema: GREATER_REALM_RUNTIME_STATUS_SCHEMA,
    publicReleaseId,
    verified: true,
    tierOneOnly: true,
    regionCount: regionRows.length,
    componentCount: componentRows.length,
    chunkCount: chunkDescriptors.length,
    cellCount: cells.length,
    castleSlotCount: slots.length,
    resourceNodeCount: nodes.length,
    releaseSha256,
    productionUntouched: true,
  });
  assertNoPrivateReleaseMaterial(manifest);
  assertNoPrivateReleaseMaterial(status);
  for (const chunk of chunks) assertNoPrivateReleaseMaterial(chunk.payload);
  const artifacts = Object.freeze({
    manifest,
    manifestBytes: canonicalBytes(manifest),
    status,
    statusBytes: canonicalBytes(status),
    chunks: Object.freeze(chunks),
  });
  verifyGreaterRealmRuntimeReleaseArtifacts(artifacts);
  return artifacts;
}

function runtimeReleasePath(path: string): string {
  if (!/^(?:import-manifest\.json|status\.json|chunks|chunks\/[A-Z]{3}-[A-Z2-7]{26}\.json)$/u.test(path)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_PATH_INVALID');
  }
  return `${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/${path}`;
}

/**
 * Install the independent public-release seed before any declassified output.
 * The binary control envelope remains owner-only and outside the import tree;
 * retries recover and reuse it rather than deriving a seed from private input.
 */
export function openOrCreateGreaterRealmRuntimeReleaseSeed(
  workspace: GreaterRealmPrivateWorkspace,
): Buffer {
  workspace.ensureDirectory('controls');
  const publication = workspace.recoverAtomicDirectoryPublish(
    GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  );
  const control = workspace.recoverAtomicFileWrite(
    GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
  );
  if (control === 'absent') {
    if (publication === 'published') {
      fail('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_MISSING');
    }
    const seed = randomBytes(RELEASE_SEED_BYTES);
    const envelope = releaseSeedControlEnvelope(seed);
    try {
      workspace.writeFileAtomic(
        GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
        envelope,
        RELEASE_SEED_CONTROL_BYTES,
      );
    } finally {
      seed.fill(0);
      envelope.fill(0);
    }
  }
  const envelope = workspace.readFile(
    GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
    RELEASE_SEED_CONTROL_BYTES,
  );
  try {
    return parseReleaseSeedControlEnvelope(envelope);
  } finally {
    envelope.fill(0);
  }
}

function releaseArtifactsEqual(
  first: GreaterRealmRuntimeReleaseArtifacts,
  second: GreaterRealmRuntimeReleaseArtifacts,
): boolean {
  return first.manifestBytes.equals(second.manifestBytes)
    && first.statusBytes.equals(second.statusBytes)
    && first.chunks.length === second.chunks.length
    && first.chunks.every((chunk, index) => (
      chunk.path === second.chunks[index]?.path
      && chunk.bytes.equals(second.chunks[index]!.bytes)
    ));
}

/**
 * Read-only exact replay assertion for an already-published runtime release.
 * The caller retains ownership of `expected` and must clear its byte buffers
 * when they are no longer needed. Installed bytes are cleared before return.
 */
export function assertGreaterRealmRuntimeReleaseMatches(
  workspace: GreaterRealmPrivateWorkspace,
  expected: GreaterRealmRuntimeReleaseArtifacts,
): void {
  verifyGreaterRealmRuntimeReleaseArtifacts(expected);
  const installed = readGreaterRealmRuntimeRelease(workspace);
  try {
    if (!releaseArtifactsEqual(installed, expected)) {
      fail('GREATER_REALM_RUNTIME_RELEASE_REPLAY_MISMATCH');
    }
  } finally {
    installed.manifestBytes.fill(0);
    installed.statusBytes.fill(0);
    for (const chunk of installed.chunks) chunk.bytes.fill(0);
  }
}

function assertReleaseSeedControlMatches(
  workspace: GreaterRealmPrivateWorkspace,
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
): void {
  workspace.ensureDirectory('controls');
  if (!workspace.hasFile(GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_MISSING');
  }
  const envelope = workspace.readFile(
    GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
    RELEASE_SEED_CONTROL_BYTES,
  );
  let seed: Buffer | undefined;
  try {
    seed = parseReleaseSeedControlEnvelope(envelope);
    if (
      artifacts.manifest.publicReleaseId !== opaqueId(seed, 'GRR', 'release', 'v1')
      || artifacts.manifest.publicApprovalReceiptId !== opaqueId(seed, 'GRA', 'approval', 'v1')
    ) fail('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_MISMATCH');
  } finally {
    seed?.fill(0);
    envelope.fill(0);
  }
}

export async function writeGreaterRealmRuntimeRelease(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
}>): Promise<GreaterRealmRuntimeReleaseWriteResult> {
  verifyGreaterRealmRuntimeReleaseArtifacts(input.artifacts);
  const publication = input.workspace.recoverAtomicDirectoryPublish(
    GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  );
  assertReleaseSeedControlMatches(input.workspace, input.artifacts);
  if (publication === 'published') {
    const installed = readGreaterRealmRuntimeRelease(input.workspace);
    if (!releaseArtifactsEqual(installed, input.artifacts)) {
      fail('GREATER_REALM_RUNTIME_RELEASE_REPLAY_MISMATCH');
    }
    return 'unchanged';
  }
  await input.workspace.withAtomicDirectoryPublish(
    GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
    async staged => {
      staged.ensureDirectory(runtimeReleasePath('chunks'));
      staged.writeFileAtomic(
        runtimeReleasePath('import-manifest.json'),
        input.artifacts.manifestBytes,
        MAXIMUM_RUNTIME_MANIFEST_BYTES,
      );
      for (const chunk of input.artifacts.chunks) {
        staged.writeFileAtomic(
          runtimeReleasePath(chunk.path),
          chunk.bytes,
          MAXIMUM_RUNTIME_CHUNK_BYTES,
        );
      }
      staged.writeFileAtomic(
        runtimeReleasePath('status.json'),
        input.artifacts.statusBytes,
        MAXIMUM_RUNTIME_STATUS_BYTES,
      );
    },
  );
  const installed = readGreaterRealmRuntimeRelease(input.workspace);
  if (!releaseArtifactsEqual(installed, input.artifacts)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_INSTALL_MISMATCH');
  }
  return 'installed';
}

function parsedJson(bytes: Buffer, code: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code);
  }
}

function assertRuntimeReleaseManifestBounds(manifest: Record<string, unknown>): void {
  const regions = manifest.regions;
  const components = manifest.components;
  const descriptors = manifest.chunks;
  const totals = manifest.totals;
  if (
    !Array.isArray(regions)
    || !Array.isArray(components)
    || !Array.isArray(descriptors)
    || regions.length !== PUBLIC_REGION_SPECS.length
    || components.length < 1
    || components.length > MAXIMUM_NAVIGATION_COMPONENTS
    || descriptors.length < 1
    || descriptors.length > MAXIMUM_RUNTIME_CHUNKS
    || totals === null
    || typeof totals !== 'object'
    || !hasExactKeys(totals, [
      'regionCount',
      'componentCount',
      'chunkCount',
      'cellCount',
      'castleSlotCount',
      'resourceNodeCount',
    ])
    || totals.regionCount !== PUBLIC_REGION_SPECS.length
    || totals.componentCount !== components.length
    || totals.chunkCount !== descriptors.length
    || !integerInRange(totals.cellCount, 1, GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT)
    || totals.castleSlotCount !== 600
    || totals.resourceNodeCount !== 12_000
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  let descriptorCellCount = 0;
  const descriptorPaths = new Set<string>();
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index] as Record<string, unknown>;
    if (
      descriptor === null
      || typeof descriptor !== 'object'
      || !hasExactKeys(descriptor, [
        'chunkHandle',
        'chunkCoordKey',
        'importOrdinal',
        'binQ',
        'binR',
        'firstCellOrdinal',
        'coreCellCount',
        'apronCellCount',
        'lod0CellCount',
        'lod1CellCount',
        'lod2CellCount',
        'lod3CellCount',
        'payloadSha256',
        'sectionDigests',
        'path',
      ])
      || descriptor.importOrdinal !== index
      || !integerInRange(descriptor.coreCellCount, 1, MAXIMUM_CHUNK_CORE_CELLS)
      || !integerInRange(
        descriptor.apronCellCount,
        0,
        MAXIMUM_CHUNK_VISIBLE_CELLS - Number(descriptor.coreCellCount),
      )
      || descriptor.lod0CellCount !== descriptor.coreCellCount
      || descriptor.lod1CellCount !== Math.ceil(
        (Number(descriptor.coreCellCount) + Number(descriptor.apronCellCount)) / 2,
      )
      || descriptor.lod2CellCount !== Math.ceil(Number(descriptor.lod1CellCount) / 2)
      || descriptor.lod3CellCount !== Math.ceil(Number(descriptor.lod2CellCount) / 2)
      || !/^GRK-[A-Z2-7]{26}$/u.test(String(descriptor.chunkHandle))
      || descriptor.path !== `chunks/${descriptor.chunkHandle}.json`
      || descriptorPaths.has(String(descriptor.path))
      || !SHA256_PATTERN.test(String(descriptor.payloadSha256))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    descriptorPaths.add(String(descriptor.path));
    descriptorCellCount += Number(descriptor.coreCellCount);
    if (descriptorCellCount > GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT) {
      fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    }
  }
  if (descriptorCellCount !== totals.cellCount) {
    fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  }
  let regionCellCount = 0;
  let regionResourceNodeCount = 0;
  for (const value of regions) {
    const region = value as Record<string, unknown>;
    if (
      region === null
      || typeof region !== 'object'
      || !integerInRange(region.cellCount, 100, GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT)
      || !integerInRange(region.passableCellCount, 100, Number(region.cellCount))
      || !integerInRange(region.chunkCount, 1, descriptors.length)
      || region.castleCapacity !== 100
      || region.resourceNodeCount !== 2_000
      || region.foodNodeCount !== 500
      || region.woodNodeCount !== 500
      || region.stoneNodeCount !== 500
      || region.goldNodeCount !== 500
    ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    regionCellCount += Number(region.cellCount);
    regionResourceNodeCount += Number(region.resourceNodeCount);
  }
  if (
    regionCellCount !== totals.cellCount
    || regionResourceNodeCount !== totals.resourceNodeCount
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  let componentCellCount = 0;
  let componentSlotCount = 0;
  const componentKindCounts = [0, 0, 0, 0];
  for (const value of components) {
    const component = value as Record<string, unknown>;
    if (
      component === null
      || typeof component !== 'object'
      || !integerInRange(component.expectedCellCount, 1, Number(totals.cellCount))
      || !integerInRange(component.expectedSlotCount, 0, 600)
      || !integerInRange(component.expectedFoodNodeCount, 0, 3_000)
      || !integerInRange(component.expectedWoodNodeCount, 0, 3_000)
      || !integerInRange(component.expectedStoneNodeCount, 0, 3_000)
      || !integerInRange(component.expectedGoldNodeCount, 0, 3_000)
    ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    componentCellCount += Number(component.expectedCellCount);
    componentSlotCount += Number(component.expectedSlotCount);
    componentKindCounts[0] += Number(component.expectedFoodNodeCount);
    componentKindCounts[1] += Number(component.expectedWoodNodeCount);
    componentKindCounts[2] += Number(component.expectedStoneNodeCount);
    componentKindCounts[3] += Number(component.expectedGoldNodeCount);
  }
  if (
    componentCellCount > totals.cellCount
    || componentSlotCount !== 600
    || componentKindCounts.some(count => count !== 3_000)
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
}

function assertReleasedLowlandsLock(cells: readonly GreaterRealmRuntimeCell[]): void {
  const lowlands = cells.filter(cell => cell.regionId === 'T1_LOWLANDS');
  if (lowlands.length < GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
  }
  const first = lowlands[0]!;
  const matchingTransforms = Array.from({ length: 6 }, (_, rotationSteps) => {
    const rotated = transformLegacyLowlandsToGlobal(
      { q: first.localQ, r: first.localR },
      {
        rotationSteps: rotationSteps as 0 | 1 | 2 | 3 | 4 | 5,
        globalOffsetQ: 0,
        globalOffsetR: 0,
      },
    );
    const transform = Object.freeze({
      rotationSteps: rotationSteps as 0 | 1 | 2 | 3 | 4 | 5,
      globalOffsetQ: first.atlasQ - rotated.q,
      globalOffsetR: first.atlasR - rotated.r,
    });
    return lowlands.every(cell => {
      const atlas = transformLegacyLowlandsToGlobal(
        { q: cell.localQ, r: cell.localR },
        transform,
      );
      return atlas.q === cell.atlasQ && atlas.r === cell.atlasR;
    }) ? transform : undefined;
  }).filter(transform => transform !== undefined);
  if (matchingTransforms.length !== 1) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
  }
  const lowlandsByLocalKey = new Map<string, GreaterRealmRuntimeCell>(
    lowlands.map(cell => [`${cell.localQ},${cell.localR}`, cell] as const),
  );
  const lowlandsByAtlasCoord = new Map<string, GreaterRealmRuntimeCell>(
    lowlands.map(cell => [`${cell.atlasQ},${cell.atlasR}`, cell] as const),
  );
  const missingCanonicalKeys = new Set(LEGACY_LOWLANDS_TILE_BY_KEY.keys());
  for (const cell of lowlands) {
    const localKey = `${cell.localQ},${cell.localR}`;
    if (!missingCanonicalKeys.delete(localKey)) continue;
    const projection = legacyLowlandsGameplayProjection(
      cell.localQ,
      cell.localR,
    );
    if (
      cell.passable !== projection.passable
      || cell.biomeClass !== projection.biomeClass
      || cell.landformClass !== projection.landformClass
      || cell.yieldClass !== projection.yieldClass
      || cell.movementCost !== projection.movementCost
      || cell.hydroRegime !== projection.hydroRegime
      || cell.geologicalBarrierBand !== 0
      || (projection.hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY && (
        cell.hydroDepthClass !== GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY
        || cell.hydroSurfaceMilli !== INT32_MIN
        || cell.hydroBodyId !== undefined
        || cell.hydroFlowDirection !== undefined
        || cell.hydrologyRevision !== 0
      ))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');
  }
  if (missingCanonicalKeys.size !== 0) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');
  }
  const publicBodyByLegacyBody = new Map<string, string>();
  const legacyBodyByPublicBody = new Map<string, string>();
  for (const water of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    const cell = lowlandsByLocalKey.get(water.cellKey);
    const projection = legacyLowlandsWaterProjection(water.q, water.r);
    if (
      cell === undefined
      || projection === undefined
      || cell.hydroRegime !== projection.hydroRegime
      || cell.hydroDepthClass !== water.depthClass
      || cell.hydroSurfaceMilli !== water.surfaceLevelMilli
      || cell.flowAccumulation !== BigInt(water.flowAccumulation).toString(10)
      || cell.hydrologyRevision !== water.generationVersion
      || cell.biomeClass !== projection.biomeClass
      || cell.landformClass !== projection.landformClass
      || cell.geologicalBarrierBand !== 0
      || cell.hydroBodyId === undefined
      || cell.passable
      || cell.yieldClass !== 0
      || cell.movementCost !== 1_000_000
    ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
    const existingPublicBody = publicBodyByLegacyBody.get(water.bodyId);
    const existingLegacyBody = legacyBodyByPublicBody.get(cell.hydroBodyId);
    if (
      (existingPublicBody !== undefined && existingPublicBody !== cell.hydroBodyId)
      || (existingLegacyBody !== undefined && existingLegacyBody !== water.bodyId)
    ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
    publicBodyByLegacyBody.set(water.bodyId, cell.hydroBodyId);
    legacyBodyByPublicBody.set(cell.hydroBodyId, water.bodyId);
    if (water.downstreamWaterCellKey !== undefined) {
      const downstream = lowlandsByLocalKey.get(water.downstreamWaterCellKey);
      if (downstream === undefined) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
      }
      const direction = GREATER_REALM_AXIAL_DIRECTIONS.findIndex(delta => (
        cell.atlasQ + delta.q === downstream.atlasQ
        && cell.atlasR + delta.r === downstream.atlasR
      ));
      if (direction < 0 || cell.hydroFlowDirection !== direction) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
      }
    } else {
      if (cell.hydroFlowDirection !== undefined) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
      }
      const hasVisibleStandingWaterOutlet = GREATER_REALM_AXIAL_DIRECTIONS.some(delta => {
        const neighbor = lowlandsByAtlasCoord.get(
          `${cell.atlasQ + delta.q},${cell.atlasR + delta.r}`,
        );
        return neighbor !== undefined
          && (neighbor.hydroRegime === GREATER_REALM_WATER_REGIME_ID.OCEAN
            || neighbor.hydroRegime === GREATER_REALM_WATER_REGIME_ID.LAKE)
          && neighbor.hydroSurfaceMilli <= cell.hydroSurfaceMilli;
      });
      if (water.regime === 'river' && !hasVisibleStandingWaterOutlet) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
      }
    }
  }
  if (
    publicBodyByLegacyBody.size
      !== GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledBodies.length
    || legacyBodyByPublicBody.size !== publicBodyByLegacyBody.size
  ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
}

/**
 * Re-hash a staged release and enforce its privacy, count, and parent closure.
 * The forthcoming importer can call this verifier before opening any mutation.
 */
export function verifyGreaterRealmRuntimeReleaseArtifacts(
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
): void {
  let artifactBytes = artifacts.manifestBytes.byteLength + artifacts.statusBytes.byteLength;
  if (
    artifacts.manifestBytes.byteLength < 1
    || artifacts.manifestBytes.byteLength > MAXIMUM_RUNTIME_MANIFEST_BYTES
    || artifacts.statusBytes.byteLength < 1
    || artifacts.statusBytes.byteLength > MAXIMUM_RUNTIME_STATUS_BYTES
    || artifacts.chunks.length < 1
    || artifacts.chunks.length > MAXIMUM_RUNTIME_CHUNKS
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  for (const chunk of artifacts.chunks) {
    if (chunk.bytes.byteLength < 1 || chunk.bytes.byteLength > MAXIMUM_RUNTIME_CHUNK_BYTES) {
      fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    }
    artifactBytes += chunk.bytes.byteLength;
    if (artifactBytes > MAXIMUM_RUNTIME_RELEASE_BYTES) {
      fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    }
  }
  const manifest = parsedJson(
    artifacts.manifestBytes,
    'GREATER_REALM_RUNTIME_RELEASE_MANIFEST_INVALID',
  ) as Record<string, unknown>;
  const status = parsedJson(
    artifacts.statusBytes,
    'GREATER_REALM_RUNTIME_RELEASE_STATUS_INVALID',
  ) as Record<string, unknown>;
  if (
    !artifacts.manifestBytes.equals(canonicalBytes(manifest))
    || !artifacts.statusBytes.equals(canonicalBytes(status))
  ) fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
  assertNoPrivateReleaseMaterial(manifest);
  assertNoPrivateReleaseMaterial(status);
  if (
    !hasExactKeys(manifest, [
      'schema',
      'classification',
      'atlasId',
      'publicReleaseId',
      'publicApprovalReceiptId',
      'sourceCommit',
      'generatorVersion',
      'sourceFormatVersion',
      'livingWorldVersion',
      'runtimePartitionVersion',
      'rendererContractVersion',
      'visibleTierMax',
      'totals',
      'legacyLowlandsBridge',
      'regions',
      'components',
      'chunks',
      'releaseSha256',
    ])
    || !hasExactKeys(status, [
      'schema',
      'publicReleaseId',
      'verified',
      'tierOneOnly',
      'regionCount',
      'componentCount',
      'chunkCount',
      'cellCount',
      'castleSlotCount',
      'resourceNodeCount',
      'releaseSha256',
      'productionUntouched',
    ])
    || manifest.schema !== GREATER_REALM_RUNTIME_RELEASE_SCHEMA
    || manifest.classification !== 'declassified-tier-i-runtime-import'
    || manifest.atlasId !== GREATER_REALM_ATLAS_ID
    || manifest.generatorVersion !== GREATER_REALM_GENERATOR_VERSION
    || manifest.sourceFormatVersion !== 'wkgr-runtime-source-v1'
    || manifest.livingWorldVersion !== GREATER_REALM_LIVING_WORLD_VERSION
    || manifest.runtimePartitionVersion !== GREATER_REALM_RUNTIME_PARTITION_VERSION
    || manifest.rendererContractVersion !== GREATER_REALM_RENDERER_CONTRACT_VERSION
    || status.schema !== GREATER_REALM_RUNTIME_STATUS_SCHEMA
    || manifest.publicReleaseId !== status.publicReleaseId
    || manifest.releaseSha256 !== status.releaseSha256
    || status.verified !== true
    || status.tierOneOnly !== true
    || status.productionUntouched !== true
    || !/^GRR-[A-Z2-7]{26}$/u.test(String(manifest.publicReleaseId))
    || !/^GRA-[A-Z2-7]{26}$/u.test(String(manifest.publicApprovalReceiptId))
    || !SOURCE_COMMIT_PATTERN.test(String(manifest.sourceCommit))
    || !SHA256_PATTERN.test(String(manifest.releaseSha256))
    || manifest.visibleTierMax !== 1
  ) fail('GREATER_REALM_RUNTIME_RELEASE_MANIFEST_INVALID');
  assertRuntimeReleaseManifestBounds(manifest);
  const regions = manifest.regions as Array<Record<string, unknown>>;
  const components = manifest.components as Array<Record<string, unknown>>;
  const descriptors = manifest.chunks as Array<Record<string, unknown>>;
  const totals = manifest.totals as Record<string, unknown>;
  const legacyLowlandsBridge = manifest.legacyLowlandsBridge as Record<string, unknown>;
  const mappedResourceCatalogCounts = legacyLowlandsBridge?.mappedResourceCatalogCounts;
  if (
    !Array.isArray(regions)
    || !Array.isArray(components)
    || !Array.isArray(descriptors)
    || totals === null
    || typeof totals !== 'object'
    || !hasExactKeys(totals, [
      'regionCount',
      'componentCount',
      'chunkCount',
      'cellCount',
      'castleSlotCount',
      'resourceNodeCount',
    ])
    || !hasExactKeys(legacyLowlandsBridge, [
      'mappedCellCount',
      'mappedCastleSlotCount',
      'mappedResourceCatalogCounts',
      'worldGenerationDigest',
      'castleSlotDigest',
      'goldSiteDigest',
      'foodSiteDigest',
      'woodSiteDigest',
      'stoneSiteDigest',
    ])
    || !hasExactKeys(mappedResourceCatalogCounts, RESOURCE_KINDS)
    || legacyLowlandsBridge.mappedCellCount
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
    || legacyLowlandsBridge.mappedCastleSlotCount
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount
    || legacyLowlandsBridge.worldGenerationDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldGenerationDigest
    || legacyLowlandsBridge.castleSlotDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotDigest
    || legacyLowlandsBridge.goldSiteDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.goldSiteDigest
    || legacyLowlandsBridge.foodSiteDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.foodSiteDigest
    || legacyLowlandsBridge.woodSiteDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.woodSiteDigest
    || legacyLowlandsBridge.stoneSiteDigest
      !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.stoneSiteDigest
    || RESOURCE_KINDS.some(kind => (
      (mappedResourceCatalogCounts as Record<string, unknown>)[kind]
        !== GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.resources[kind].sites.length
    ))
    || regions.length !== PUBLIC_REGION_SPECS.length
    || components.length < 1
    || components.length > MAXIMUM_NAVIGATION_COMPONENTS
    || regions.some((region, index) => (
      !hasExactKeys(region, [
        'regionId',
        'publicName',
        'ordinal',
        'tier',
        'cellCount',
        'passableCellCount',
        'chunkCount',
        'castleCapacity',
        'resourceLocationCount',
        'resourceNodeCount',
        'foodNodeCount',
        'woodNodeCount',
        'stoneNodeCount',
        'goldNodeCount',
        'active',
      ])
      || region.regionId !== PUBLIC_REGION_SPECS[index]!.id
      || region.publicName !== PUBLIC_REGION_SPECS[index]!.name
      || region.ordinal !== index
      || region.tier !== 1
      || region.active !== false
    ))
  ) fail('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
  if (artifacts.chunks.some((chunk, index) => chunk.payload.importOrdinal !== index)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
  }
  const chunksByPath = new Map(artifacts.chunks.map(chunk => [chunk.path, chunk] as const));
  const cells: GreaterRealmRuntimeCell[] = [];
  const slots: GreaterRealmRuntimeSlot[] = [];
  const nodes: GreaterRealmRuntimeResourceNode[] = [];
  let expectedRawCellOrdinal = 0;
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index]!;
    const path = String(descriptor.path);
    const chunk = chunksByPath.get(path);
    if (
      !hasExactKeys(descriptor, [
        'chunkHandle',
        'chunkCoordKey',
        'importOrdinal',
        'binQ',
        'binR',
        'firstCellOrdinal',
        'coreCellCount',
        'apronCellCount',
        'lod0CellCount',
        'lod1CellCount',
        'lod2CellCount',
        'lod3CellCount',
        'payloadSha256',
        'sectionDigests',
        'path',
      ])
      || chunk === undefined
      || !hasExactKeys(chunk.payload, [
        'schema',
        'publicReleaseId',
        'chunkHandle',
        'importOrdinal',
        'cells',
        'apronCellKeys',
        'lod1CellKeys',
        'lod2CellKeys',
        'lod3CellKeys',
        'castleSlots',
        'resourceNodes',
        'importBatches',
        'sectionDigests',
      ])
      || !hasExactKeys(chunk.payload.importBatches, ['castleSlots', 'resourceNodes'])
      || !hasExactKeys(chunk.payload.sectionDigests, [
        'cellsSha256',
        'apronSha256',
        'lodSha256',
        'castleSlotsSha256',
        'resourceNodesSha256',
      ])
      || !Array.isArray(chunk.payload.cells)
      || !Array.isArray(chunk.payload.apronCellKeys)
      || !Array.isArray(chunk.payload.lod1CellKeys)
      || !Array.isArray(chunk.payload.lod2CellKeys)
      || !Array.isArray(chunk.payload.lod3CellKeys)
      || !Array.isArray(chunk.payload.castleSlots)
      || !Array.isArray(chunk.payload.resourceNodes)
      || !Array.isArray(chunk.payload.importBatches.castleSlots)
      || !Array.isArray(chunk.payload.importBatches.resourceNodes)
      || chunk.payload.importBatches.castleSlots.some(batch => !hasExactKeys(batch, [
        'batchOrdinal',
        'firstRowOrdinal',
        'rowCount',
        'rowsSha256',
      ]))
      || chunk.payload.importBatches.resourceNodes.some(batch => !hasExactKeys(batch, [
        'batchOrdinal',
        'firstRowOrdinal',
        'rowCount',
        'rowsSha256',
      ]))
      || descriptor.importOrdinal !== index
      || descriptor.chunkHandle !== chunk.payload.chunkHandle
      || !/^GRK-[A-Z2-7]{26}$/u.test(chunk.payload.chunkHandle)
      || path !== `chunks/${chunk.payload.chunkHandle}.json`
      || descriptor.payloadSha256 !== sha256(chunk.bytes)
      || !chunk.bytes.equals(canonicalBytes(chunk.payload))
      || descriptor.coreCellCount !== chunk.payload.cells.length
      || descriptor.apronCellCount !== chunk.payload.apronCellKeys.length
      || descriptor.lod0CellCount !== chunk.payload.cells.length
      || descriptor.lod1CellCount !== chunk.payload.lod1CellKeys.length
      || descriptor.lod2CellCount !== chunk.payload.lod2CellKeys.length
      || descriptor.lod3CellCount !== chunk.payload.lod3CellKeys.length
      || chunk.payload.schema !== GREATER_REALM_RUNTIME_CHUNK_SCHEMA
      || chunk.payload.publicReleaseId !== manifest.publicReleaseId
      || chunk.payload.importOrdinal !== index
      || chunk.payload.cells.length < 1
      || chunk.payload.cells.length > MAXIMUM_CHUNK_CORE_CELLS
      || chunk.payload.cells.length + chunk.payload.apronCellKeys.length
        > MAXIMUM_CHUNK_VISIBLE_CELLS
      || chunk.payload.castleSlots.length
        > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS
      || chunk.payload.resourceNodes.length
        > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES
      || new Set(chunk.payload.resourceNodes.map(node => node.locationId)).size
        > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS
      || chunk.payload.lod1CellKeys.length < 1
      || chunk.payload.lod2CellKeys.length < 1
      || chunk.payload.lod3CellKeys.length < 1
      || chunk.payload.lod1CellKeys.length !== Math.ceil(
        (chunk.payload.cells.length + chunk.payload.apronCellKeys.length) / 2,
      )
      || chunk.payload.lod2CellKeys.length !== Math.ceil(chunk.payload.lod1CellKeys.length / 2)
      || chunk.payload.lod3CellKeys.length !== Math.ceil(chunk.payload.lod2CellKeys.length / 2)
      || descriptor.firstCellOrdinal !== chunk.payload.cells[0]?.releaseOrdinal
      || !integerInRange(descriptor.binQ, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(descriptor.binR, -0x8000_0000, 0x7fff_ffff)
      || descriptor.chunkCoordKey !== `B:${descriptor.binQ}:${descriptor.binR}`
      || chunk.payload.cells.some(cell => (
        !integerInRange(cell.atlasQ, -0x8000_0000, 0x7fff_ffff)
        || !integerInRange(cell.atlasR, -0x8000_0000, 0x7fff_ffff)
        || Math.floor(cell.atlasQ / 15) !== descriptor.binQ
        || Math.floor(cell.atlasR / 15) !== descriptor.binR
        || cell.chunkHandle !== chunk.payload.chunkHandle
      ))
      || new Set(chunk.payload.apronCellKeys).size !== chunk.payload.apronCellKeys.length
      || new Set(chunk.payload.lod1CellKeys).size !== chunk.payload.lod1CellKeys.length
      || new Set(chunk.payload.lod2CellKeys).size !== chunk.payload.lod2CellKeys.length
      || new Set(chunk.payload.lod3CellKeys).size !== chunk.payload.lod3CellKeys.length
      || !chunk.payload.lod1CellKeys.every(key => (
        chunk.payload.cells.some(cell => cell.cellKey === key)
        || chunk.payload.apronCellKeys.includes(key)
      ))
      || !chunk.payload.lod1CellKeys.some(key => (
        chunk.payload.cells.some(cell => cell.cellKey === key)
      ))
      || !chunk.payload.lod2CellKeys.some(key => (
        chunk.payload.cells.some(cell => cell.cellKey === key)
      ))
      || !chunk.payload.lod3CellKeys.some(key => (
        chunk.payload.cells.some(cell => cell.cellKey === key)
      ))
      || !chunk.payload.lod2CellKeys.every(key => chunk.payload.lod1CellKeys.includes(key))
      || !chunk.payload.lod3CellKeys.every(key => chunk.payload.lod2CellKeys.includes(key))
      || JSON.stringify(descriptor.sectionDigests) !== JSON.stringify(chunk.payload.sectionDigests)
      || chunk.payload.sectionDigests.cellsSha256 !== sha256(canonicalBytes(chunk.payload.cells))
      || chunk.payload.sectionDigests.apronSha256 !== sha256(canonicalBytes(chunk.payload.apronCellKeys))
      || chunk.payload.sectionDigests.lodSha256 !== sha256(canonicalBytes({
        lod1: chunk.payload.lod1CellKeys,
        lod2: chunk.payload.lod2CellKeys,
        lod3: chunk.payload.lod3CellKeys,
      }))
      || chunk.payload.sectionDigests.castleSlotsSha256
        !== sha256(canonicalBytes(chunk.payload.castleSlots))
      || chunk.payload.sectionDigests.resourceNodesSha256
        !== sha256(canonicalBytes(chunk.payload.resourceNodes))
      || !importBatchesEqual(
        chunk.payload.importBatches.castleSlots,
        chunk.payload.castleSlots,
        128,
      )
      || !importBatchesEqual(
        chunk.payload.importBatches.resourceNodes,
        chunk.payload.resourceNodes,
        256,
      )
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    const coreCellKeys = new Set(chunk.payload.cells.map(cell => cell?.cellKey));
    for (const cell of chunk.payload.cells) {
      if (cell?.releaseOrdinal !== expectedRawCellOrdinal) {
        fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
      }
      expectedRawCellOrdinal += 1;
    }
    if (
      chunk.payload.castleSlots.some(slot => !coreCellKeys.has(slot?.cellKey))
      || chunk.payload.resourceNodes.some(node => !coreCellKeys.has(node?.cellKey))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    const parsed = parsedJson(chunk.bytes, 'GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    assertNoPrivateReleaseMaterial(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(chunk.payload)) {
      fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    }
    cells.push(...chunk.payload.cells);
    slots.push(...chunk.payload.castleSlots);
    nodes.push(...chunk.payload.resourceNodes);
  }
  if (chunksByPath.size !== descriptors.length) fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
  cells.sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  slots.sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  nodes.sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  if (
    cells.some((cell, index) => cell.releaseOrdinal !== index)
    || slots.some((slot, index) => slot.releaseOrdinal !== index)
    || nodes.some((node, index) => node.releaseOrdinal !== index)
    || slots.length !== 600
    || nodes.length !== 12_000
    || totals.regionCount !== regions.length
    || totals.componentCount !== components.length
    || totals.chunkCount !== descriptors.length
    || totals.cellCount !== cells.length
    || totals.castleSlotCount !== slots.length
    || totals.resourceNodeCount !== nodes.length
    || status.regionCount !== regions.length
    || status.componentCount !== components.length
    || status.chunkCount !== descriptors.length
    || status.cellCount !== cells.length
    || status.castleSlotCount !== slots.length
    || status.resourceNodeCount !== nodes.length
  ) fail('GREATER_REALM_RUNTIME_RELEASE_COUNT_INVALID');
  const cellByKey = new Map<string, GreaterRealmRuntimeCell>();
  const cellByAtlasCoord = new Map<string, GreaterRealmRuntimeCell>();
  for (const cell of cells) {
    if (
      !hasExactKeys(cell, [
        'cellKey',
        'atlasCoordKey',
        'releaseOrdinal',
        'atlasId',
        'chunkHandle',
        'regionId',
        'componentKey',
        'localQ',
        'localR',
        'atlasQ',
        'atlasR',
        'tier',
        'passable',
        'elevation',
        'slope',
        'aspect',
        'profileCurvature',
        'planCurvature',
        'ridgeId',
        'geologicalBarrierBand',
        'biomeClass',
        'landformClass',
        'yieldClass',
        'movementCost',
        'sealedBoundaryMask',
        'hydroRegime',
        'hydroBodyId',
        'hydroDepthClass',
        'hydroSurfaceMilli',
        'hydroFlowDirection',
        'flowAccumulation',
        'bankVariant',
        'hydrologyRevision',
        'routeParentDirection',
        'routeDepth',
        'travelClass',
        'wetness',
        'exposure',
        'coastDistance',
        'freshwaterDistance',
        'temperature',
        'moisture',
        'habitatClass',
        'canopyBasisPoints',
        'groundcoverBasisPoints',
        'wildflowerBasisPoints',
        'featureClass',
        'ambienceClass',
        'presentationVariant',
      ], [
        'componentKey',
        'ridgeId',
        'hydroBodyId',
        'hydroFlowDirection',
        'routeParentDirection',
        'routeDepth',
      ])
      || cell.tier !== 1
      || cell.atlasId !== GREATER_REALM_ATLAS_ID
      || typeof cell.passable !== 'boolean'
      || typeof cell.cellKey !== 'string'
      || typeof cell.atlasCoordKey !== 'string'
      || typeof cell.chunkHandle !== 'string'
      || typeof cell.regionId !== 'string'
      || typeof cell.flowAccumulation !== 'string'
      || !/^GRK-[A-Z2-7]{26}$/u.test(cell.chunkHandle)
      || cell.cellKey.length > 128
      || !/^A:-?[0-9]+:-?[0-9]+$/u.test(cell.atlasCoordKey)
      || cell.atlasCoordKey !== `A:${cell.atlasQ}:${cell.atlasR}`
      || cell.cellKey !== `${cell.regionId}:${cell.localQ}:${cell.localR}`
      || cellByKey.has(cell.cellKey)
      || cellByAtlasCoord.has(cell.atlasCoordKey)
      || !integerInRange(cell.releaseOrdinal, 0, 0xffff_ffff)
      || !integerInRange(cell.localQ, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.localR, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.atlasQ, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.atlasR, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.elevation, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.slope, 0, 0xffff)
      || !integerInRange(cell.aspect, 0, 6)
      || !integerInRange(cell.profileCurvature, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.planCurvature, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.geologicalBarrierBand, 0, 3)
      || !integerInRange(cell.biomeClass, 0, GREATER_REALM_BIOME_CLASS_COUNT - 1)
      || !integerInRange(cell.landformClass, 0, GREATER_REALM_LANDFORM_CLASS_COUNT - 1)
      || !integerInRange(cell.yieldClass, 0, 3)
      || !integerInRange(cell.movementCost, 1, 1_000_000)
      || !integerInRange(cell.sealedBoundaryMask, 0, 63)
      || !integerInRange(
        cell.hydroRegime,
        GREATER_REALM_WATER_REGIME_ID.DRY,
        GREATER_REALM_WATER_REGIME_ID.MARSH,
      )
      || !integerInRange(
        cell.hydroDepthClass,
        GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY,
        GREATER_REALM_WATER_DEPTH_CLASS_ID.DEEP,
      )
      || !integerInRange(cell.hydroSurfaceMilli, -0x8000_0000, 0x7fff_ffff)
      || !/^(?:0|[1-9][0-9]*)$/u.test(cell.flowAccumulation)
      || BigInt(cell.flowAccumulation) > 0xffff_ffff_ffff_ffffn
      || !integerInRange(cell.bankVariant, 0, UINT32_MAX)
      || !integerInRange(cell.hydrologyRevision, 0, 0xffff)
      || !integerInRange(
        cell.travelClass,
        GREATER_REALM_ROUTE_CLASS.NONE,
        GREATER_REALM_ROUTE_CLASS.FORD,
      )
      || !integerInRange(cell.wetness, 0, 0xffff)
      || !integerInRange(cell.exposure, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.coastDistance, 0, 0xffff)
      || !integerInRange(cell.freshwaterDistance, 0, 0xffff)
      || !integerInRange(cell.temperature, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(cell.moisture, -0x8000_0000, 0x7fff_ffff)
      || !integerInRange(
        cell.habitatClass,
        GREATER_REALM_ECOLOGY_CLASS.NONE,
        GREATER_REALM_ECOLOGY_CLASS.SNOW,
      )
      || !integerInRange(cell.canopyBasisPoints, 0, 10_000)
      || !integerInRange(cell.groundcoverBasisPoints, 0, 10_000)
      || !integerInRange(cell.wildflowerBasisPoints, 0, 10_000)
      || !integerInRange(
        cell.featureClass,
        GREATER_REALM_LANDMARK_CLASS.NONE,
        GREATER_REALM_LANDMARK_CLASS.LAMP_POST,
      )
      || !integerInRange(
        cell.ambienceClass,
        GREATER_REALM_AMBIENT_LIFE_CLASS.NONE,
        GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE,
      )
      || !integerInRange(cell.presentationVariant, 0, UINT32_MAX)
      || (cell.ridgeId !== undefined && !/^GRD-[A-Z2-7]{26}$/u.test(cell.ridgeId))
      || (cell.componentKey !== undefined && !/^GRC-[A-Z2-7]{26}$/u.test(cell.componentKey))
      || !PUBLIC_REGION_SPECS.some(region => region.id === cell.regionId)
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CELL_INVALID');
    const wet = cell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY;
    if (
      (wet && !/^GRW-[A-Z2-7]{26}$/u.test(cell.hydroBodyId ?? ''))
      || (!wet && cell.hydroBodyId !== undefined)
      || (wet && cell.hydroDepthClass === GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY)
      || (!wet && cell.hydroDepthClass !== GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY)
      || (cell.hydroFlowDirection !== undefined
        && !integerInRange(cell.hydroFlowDirection, 0, 5))
      || (wet && cell.passable && !(
        (cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.RIVER
          || cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.STREAM)
        && cell.travelClass === GREATER_REALM_ROUTE_CLASS.FORD
      ))
      || (cell.passable
        ? cell.componentKey === undefined || cell.routeDepth === undefined
        : cell.componentKey !== undefined
          || cell.routeDepth !== undefined
          || cell.routeParentDirection !== undefined)
      || (cell.routeDepth === 0 && cell.routeParentDirection !== undefined)
      || ((cell.routeDepth ?? 0) > 0
        && (cell.routeParentDirection === undefined
          || !integerInRange(cell.routeParentDirection, 0, 5)))
      || (cell.routeDepth !== undefined
        && !integerInRange(cell.routeDepth, 0, MAXIMUM_ROUTE_DEPTH))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CELL_INVALID');
    cellByKey.set(cell.cellKey, cell);
    cellByAtlasCoord.set(cell.atlasCoordKey, cell);
  }
  assertReleasedLowlandsLock(cells);
  for (const cell of cells) {
    const flowing = cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.RIVER
      || cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.STREAM;
    if (cell.hydroFlowDirection === undefined) {
      const frozenMouth = cell.regionId === 'T1_LOWLANDS'
        && cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.RIVER
        && LEGACY_LOWLANDS_RIVER_MOUTH_KEYS.has(`${cell.localQ},${cell.localR}`);
      if (flowing && !frozenMouth) {
        fail('GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID');
      }
      continue;
    }
    const delta = GREATER_REALM_AXIAL_DIRECTIONS[cell.hydroFlowDirection]!;
    const target = cellByAtlasCoord.get(
      `A:${cell.atlasQ + delta.q}:${cell.atlasR + delta.r}`,
    );
    if (
      target === undefined
      || !publicHydrologyTransitionAllowed(cell.hydroRegime, target.hydroRegime)
      || target.hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY
      || target.hydroSurfaceMilli > cell.hydroSurfaceMilli
      || BigInt(target.flowAccumulation) <= BigInt(cell.flowAccumulation)
      || ((target.hydroRegime === cell.hydroRegime)
        !== (target.hydroBodyId === cell.hydroBodyId))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID');
  }
  for (const cell of cells) {
    let expectedSealedBoundaryMask = 0;
    for (let direction = 0; direction < GREATER_REALM_AXIAL_DIRECTIONS.length; direction += 1) {
      const delta = GREATER_REALM_AXIAL_DIRECTIONS[direction]!;
      if (!cellByAtlasCoord.has(`A:${cell.atlasQ + delta.q}:${cell.atlasR + delta.r}`)) {
        expectedSealedBoundaryMask |= 1 << direction;
      }
    }
    if (cell.sealedBoundaryMask !== expectedSealedBoundaryMask) {
      fail('GREATER_REALM_RUNTIME_RELEASE_SEALED_BOUNDARY_INVALID');
    }
  }
  for (const chunk of artifacts.chunks) {
    const coreKeys = new Set(chunk.payload.cells.map(cell => cell.cellKey));
    const expectedApronKeys = new Set<string>();
    for (const cell of chunk.payload.cells) {
      for (const delta of GREATER_REALM_AXIAL_DIRECTIONS) {
        const neighbor = cellByAtlasCoord.get(`A:${cell.atlasQ + delta.q}:${cell.atlasR + delta.r}`);
        if (neighbor !== undefined && !coreKeys.has(neighbor.cellKey)) {
          expectedApronKeys.add(neighbor.cellKey);
        }
      }
    }
    if (
      expectedApronKeys.size !== chunk.payload.apronCellKeys.length
      || chunk.payload.apronCellKeys.some(key => !expectedApronKeys.has(key))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_CHUNK_APRON_INVALID');
  }
  const componentByKey = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index]!;
    if (
      !hasExactKeys(component, [
        'componentKey',
        'componentOrdinal',
        'regionMask',
        'rootCellKey',
        'expectedCellCount',
        'maxRouteDepth',
        'expectedSlotCount',
        'expectedFoodNodeCount',
        'expectedWoodNodeCount',
        'expectedStoneNodeCount',
        'expectedGoldNodeCount',
        'componentSha256',
      ])
      || component.componentOrdinal !== index
      || !/^GRC-[A-Z2-7]{26}$/u.test(String(component.componentKey))
      || typeof component.rootCellKey !== 'string'
      || componentByKey.has(String(component.componentKey))
      || !SHA256_PATTERN.test(String(component.componentSha256))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_INVALID');
    componentByKey.set(String(component.componentKey), component);
  }
  for (const cell of cells) {
    if (cell.componentKey === undefined) continue;
    const component = componentByKey.get(cell.componentKey);
    if (component === undefined) fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_INVALID');
    if (cell.routeDepth === 0) {
      if (component.rootCellKey !== cell.cellKey) {
        fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');
      }
      continue;
    }
    const direction = GREATER_REALM_AXIAL_DIRECTIONS[cell.routeParentDirection!]!;
    const parent = cellByAtlasCoord.get(`A:${cell.atlasQ + direction.q}:${cell.atlasR + direction.r}`);
    if (
      parent === undefined
      || parent.componentKey !== cell.componentKey
      || parent.routeDepth !== cell.routeDepth! - 1
    ) fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');
  }
  const cellsByComponentKey = new Map<string, GreaterRealmRuntimeCell[]>();
  const slotsByComponentKey = new Map<string, GreaterRealmRuntimeSlot[]>();
  const nodesByComponentKey = new Map<string, GreaterRealmRuntimeResourceNode[]>();
  for (const cell of cells) {
    if (cell.componentKey === undefined) continue;
    const values = cellsByComponentKey.get(cell.componentKey) ?? [];
    values.push(cell);
    cellsByComponentKey.set(cell.componentKey, values);
  }
  for (const slot of slots) {
    const values = slotsByComponentKey.get(slot.componentKey) ?? [];
    values.push(slot);
    slotsByComponentKey.set(slot.componentKey, values);
  }
  for (const node of nodes) {
    const values = nodesByComponentKey.get(node.componentKey) ?? [];
    values.push(node);
    nodesByComponentKey.set(node.componentKey, values);
  }
  for (const component of components) {
    const key = String(component.componentKey);
    const componentCells = cellsByComponentKey.get(key) ?? [];
    const componentSlots = slotsByComponentKey.get(key) ?? [];
    const componentNodes = nodesByComponentKey.get(key) ?? [];
    const expectedPerKind = componentSlots.length * RESOURCE_MARGIN_PER_SLOT;
    const expectedRegionMask = componentCells.reduce((mask, cell) => {
      const ordinal = PUBLIC_REGION_SPECS.find(region => region.id === cell.regionId)?.ordinal;
      if (ordinal === undefined) fail('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
      return mask | (1 << ordinal);
    }, 0);
    if (
      componentCells.length < 1
      || component.expectedCellCount !== componentCells.length
      || component.regionMask !== expectedRegionMask
      || component.expectedSlotCount !== componentSlots.length
      || component.maxRouteDepth !== maximumInteger(componentCells.map(cell => cell.routeDepth!))
      || component.expectedFoodNodeCount !== componentNodes.filter(node => node.resourceKind === 'food').length
      || component.expectedWoodNodeCount !== componentNodes.filter(node => node.resourceKind === 'wood').length
      || component.expectedStoneNodeCount !== componentNodes.filter(node => node.resourceKind === 'stone').length
      || component.expectedGoldNodeCount !== componentNodes.filter(node => node.resourceKind === 'gold').length
      || RESOURCE_KINDS.some(kind => (
        componentNodes.filter(node => node.resourceKind === kind).length < expectedPerKind
      ))
      || component.componentSha256 !== digestComponent(
        key,
        componentCells,
        componentSlots,
        componentNodes,
      )
    ) fail('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_INVALID');
  }
  const legacySlotIds = new Set<number>();
  const publicSlotIds = new Set<string>();
  const slotCellKeys = new Set<string>();
  const slotCountsByRegion = new Map<string, number>(
    PUBLIC_REGION_SPECS.map(region => [region.id, 0] as const),
  );
  let previousSlotCellOrdinal = -1;
  for (const slot of slots) {
    const cell = cellByKey.get(slot.cellKey);
    if (
      !hasExactKeys(slot, [
        'slotId',
        'releaseOrdinal',
        'atlasId',
        'cellKey',
        'regionId',
        'componentKey',
        'tier',
        'regionOrderRank',
        'allocationRank',
        'active',
        'legacySlotId',
      ], ['legacySlotId'])
      || !/^GRS-[A-Z2-7]{26}$/u.test(slot.slotId)
      || publicSlotIds.has(slot.slotId)
      || slotCellKeys.has(slot.cellKey)
      || !integerInRange(slot.releaseOrdinal, 0, UINT32_MAX)
      || slot.atlasId !== GREATER_REALM_ATLAS_ID
      || slot.tier !== 1
      || slot.active !== false
      || slot.regionOrderRank !== UINT32_MAX
      || slot.allocationRank !== UINT32_MAX
      || cell === undefined
      || !cell.passable
      || cell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY
      || cell.componentKey !== slot.componentKey
      || cell.regionId !== slot.regionId
      || cell.releaseOrdinal <= previousSlotCellOrdinal
      || ((slot.regionId === 'T1_LOWLANDS') !== (slot.legacySlotId !== undefined))
    ) fail('GREATER_REALM_RUNTIME_RELEASE_SLOT_INVALID');
    previousSlotCellOrdinal = cell.releaseOrdinal;
    publicSlotIds.add(slot.slotId);
    slotCellKeys.add(slot.cellKey);
    slotCountsByRegion.set(slot.regionId, (slotCountsByRegion.get(slot.regionId) ?? 0) + 1);
    if (slot.legacySlotId !== undefined) {
      if (
        slot.regionId !== 'T1_LOWLANDS'
        || !integerInRange(slot.legacySlotId, 1, 100)
        || legacySlotIds.has(slot.legacySlotId)
      ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
      const canonical = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.castleSlots.rows
        .find(row => row.slotId === slot.legacySlotId);
      if (canonical === undefined || canonical.q !== cell.localQ || canonical.r !== cell.localR) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
      }
      legacySlotIds.add(slot.legacySlotId);
    }
  }
  if (
    legacySlotIds.size !== 100
    || Array.from({ length: 100 }, (_, index) => index + 1)
      .some(id => !legacySlotIds.has(id))
  ) fail('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_SLOT_INVALID');
  if (PUBLIC_REGION_SPECS.some(region => slotCountsByRegion.get(region.id) !== 100)) {
    fail('GREATER_REALM_RUNTIME_RELEASE_SLOT_COUNT_INVALID');
  }
  const legacyCatalogIds = new Set<string>();
  const locationByKindAndCell = new Map<string, string>();
  const locationOwner = new Map<string, string>();
  const locationProjection = new Map<string, string>();
  const publicNodeIds = new Set<string>();
  for (const node of nodes) {
    const cell = cellByKey.get(node.cellKey);
    if (
      !hasExactKeys(node, [
        'nodeId',
        'releaseOrdinal',
        'atlasId',
        'locationId',
        'cellKey',
        'regionId',
        'componentKey',
        'resourceKind',
        'tier',
        'nodeOrdinal',
        'allocationRank',
        'legacyCatalogId',
        'policyVersion',
        'active',
      ], ['legacyCatalogId'])
      || !/^GRN-[A-Z2-7]{26}$/u.test(node.nodeId)
      || !/^GRL-[A-Z2-7]{26}$/u.test(node.locationId)
      || publicNodeIds.has(node.nodeId)
      || !integerInRange(node.releaseOrdinal, 0, UINT32_MAX)
      || !integerInRange(node.nodeOrdinal, 0, UINT32_MAX)
      || typeof node.policyVersion !== 'string'
      || node.policyVersion.length < 1
      || node.policyVersion.length > 64
      || node.atlasId !== GREATER_REALM_ATLAS_ID
      || node.tier !== 1
      || node.active !== false
      || node.allocationRank !== UINT32_MAX
      || !RESOURCE_KINDS.includes(node.resourceKind)
      || cell === undefined
      || !cell.passable
      || cell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY
      || cell.componentKey !== node.componentKey
      || cell.regionId !== node.regionId
    ) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_INVALID');
    publicNodeIds.add(node.nodeId);
    const locationKey = `${node.resourceKind}:${node.cellKey}`;
    const existingLocation = locationByKindAndCell.get(locationKey);
    const existingOwner = locationOwner.get(node.locationId);
    if (
      (existingLocation !== undefined && existingLocation !== node.locationId)
      || (existingOwner !== undefined && existingOwner !== locationKey)
    ) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
    locationByKindAndCell.set(locationKey, node.locationId);
    locationOwner.set(node.locationId, locationKey);
    const projection = JSON.stringify({
      cellKey: node.cellKey,
      regionId: node.regionId,
      componentKey: node.componentKey,
      resourceKind: node.resourceKind,
      legacyCatalogId: node.legacyCatalogId,
      policyVersion: node.policyVersion,
    });
    const existingProjection = locationProjection.get(node.locationId);
    if (existingProjection !== undefined && existingProjection !== projection) {
      fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
    }
    locationProjection.set(node.locationId, projection);
    if (node.legacyCatalogId !== undefined) {
      const key = `${node.resourceKind}:${node.legacyCatalogId}`;
      if (node.regionId !== 'T1_LOWLANDS') {
        fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
      }
      const canonical = canonicalLegacyResourceRows()[node.resourceKind]
        .find(row => row.siteId === node.legacyCatalogId);
      if (
        canonical === undefined
        || canonical.q !== cell.localQ
        || canonical.r !== cell.localR
        || canonical.policyVersion !== node.policyVersion
      ) {
        fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
      }
      legacyCatalogIds.add(key);
    } else if (
      node.regionId === 'T1_LOWLANDS'
      || node.policyVersion !== GREATER_REALM_RESOURCE_POLICY_VERSION
    ) {
      fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_POLICY_INVALID');
    }
  }
  const expectedLegacyResourceCount = Object.values(GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.resources)
    .reduce((sum, resource) => sum + resource.sites.length, 0);
  if (legacyCatalogIds.size !== expectedLegacyResourceCount) {
    fail('GREATER_REALM_RUNTIME_RELEASE_LEGACY_RESOURCE_INVALID');
  }
  let previousNodeGroup = '';
  let previousNodeGroupRank = -1;
  let expectedNodeOrdinal = 0;
  let previousLocationId = '';
  let groupLocationCounts = new Map<string, number>();
  let groupSeenLocations = new Set<string>();
  const assertBalancedLocationBlocks = (): void => {
    if (groupLocationCounts.size === 0) return;
    const counts = [...groupLocationCounts.values()];
    if (
      Math.max(...counts) > GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION
      || Math.max(...counts) - Math.min(...counts) > 1
    ) {
      fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
    }
  };
  for (const node of nodes) {
    const componentOrdinal = Number(componentByKey.get(node.componentKey)?.componentOrdinal);
    const regionOrdinal = PUBLIC_REGION_SPECS.find(region => region.id === node.regionId)?.ordinal;
    const kindOrdinal = RESOURCE_KINDS.indexOf(node.resourceKind);
    if (
      !integerInRange(componentOrdinal, 0, components.length - 1)
      || regionOrdinal === undefined
      || kindOrdinal < 0
    ) fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_INVALID');
    const group = `${componentOrdinal}:${regionOrdinal}:${kindOrdinal}`;
    const groupRank = componentOrdinal * PUBLIC_REGION_SPECS.length * RESOURCE_KINDS.length
      + regionOrdinal * RESOURCE_KINDS.length
      + kindOrdinal;
    if (group === previousNodeGroup) {
      expectedNodeOrdinal += 1;
    } else {
      if (groupRank <= previousNodeGroupRank) {
        fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_ORDINAL_INVALID');
      }
      assertBalancedLocationBlocks();
      previousNodeGroup = group;
      previousNodeGroupRank = groupRank;
      expectedNodeOrdinal = 0;
      previousLocationId = '';
      groupLocationCounts = new Map<string, number>();
      groupSeenLocations = new Set<string>();
    }
    if (node.nodeOrdinal !== expectedNodeOrdinal) {
      fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_ORDINAL_INVALID');
    }
    if (node.locationId !== previousLocationId) {
      if (groupSeenLocations.has(node.locationId)) {
        fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
      }
      if (previousLocationId !== '' && node.locationId.localeCompare(previousLocationId) <= 0) {
        fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
      }
      groupSeenLocations.add(node.locationId);
      previousLocationId = node.locationId;
    }
    groupLocationCounts.set(
      node.locationId,
      (groupLocationCounts.get(node.locationId) ?? 0) + 1,
    );
  }
  assertBalancedLocationBlocks();
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index]!;
    const regionId = PUBLIC_REGION_SPECS[index]!.id;
    const regionCells = cells.filter(cell => cell.regionId === regionId);
    const regionSlots = slots.filter(slot => slot.regionId === regionId);
    const regionNodes = nodes.filter(node => node.regionId === regionId);
    const countKind = (kind: ResourceKind): number => (
      regionNodes.filter(node => node.resourceKind === kind).length
    );
    if (
      region.cellCount !== regionCells.length
      || region.passableCellCount !== regionCells.filter(cell => cell.passable).length
      || region.chunkCount !== new Set(regionCells.map(cell => cell.chunkHandle)).size
      || region.castleCapacity !== regionSlots.length
      || regionSlots.length !== 100
      || region.resourceLocationCount !== new Set(regionNodes.map(node => node.locationId)).size
      || region.resourceNodeCount !== regionNodes.length
      || regionNodes.length !== 2_000
      || region.foodNodeCount !== countKind('food')
      || region.woodNodeCount !== countKind('wood')
      || region.stoneNodeCount !== countKind('stone')
      || region.goldNodeCount !== countKind('gold')
      || RESOURCE_KINDS.some(kind => countKind(kind) !== 500)
      || RESOURCE_KINDS.some(kind => countKind(kind) < regionSlots.length * RESOURCE_MARGIN_PER_SLOT)
    ) fail('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
  }
  const slotCountByComponentRegion = new Map<string, number>();
  const nodeCountByComponentRegionKind = new Map<string, number>();
  for (const slot of slots) {
    const key = `${slot.componentKey}:${slot.regionId}`;
    slotCountByComponentRegion.set(key, (slotCountByComponentRegion.get(key) ?? 0) + 1);
  }
  for (const node of nodes) {
    const key = `${node.componentKey}:${node.regionId}:${node.resourceKind}`;
    nodeCountByComponentRegionKind.set(
      key,
      (nodeCountByComponentRegionKind.get(key) ?? 0) + 1,
    );
  }
  for (const component of components) {
    const componentKey = String(component.componentKey);
    for (const region of PUBLIC_REGION_SPECS) {
      const pair = `${componentKey}:${region.id}`;
      const requiredPerKind = (slotCountByComponentRegion.get(pair) ?? 0)
        * RESOURCE_MARGIN_PER_SLOT;
      for (const kind of RESOURCE_KINDS) {
        if ((nodeCountByComponentRegionKind.get(`${pair}:${kind}`) ?? 0) < requiredPerKind) {
          fail('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_MARGIN_INVALID');
        }
      }
    }
  }
  const expectedHeader = releaseHeader({
    publicReleaseId: String(manifest.publicReleaseId),
    publicApprovalReceiptId: String(manifest.publicApprovalReceiptId),
    sourceCommit: String(manifest.sourceCommit),
    totals: totals as Readonly<Record<string, number>>,
    legacyLowlandsBridge: manifest.legacyLowlandsBridge as Readonly<Record<string, unknown>>,
  });
  const expectedReleaseSha256 = framedSha256('warpkeep.greater-realm.release.v1', [
    canonicalBytes(expectedHeader),
    ...artifacts.chunks.map(chunk => chunk.bytes),
    canonicalBytes(components),
    canonicalBytes(regions),
  ]);
  if (manifest.releaseSha256 !== expectedReleaseSha256) {
    fail('GREATER_REALM_RUNTIME_RELEASE_DIGEST_INVALID');
  }
}

export function readGreaterRealmRuntimeRelease(
  workspace: GreaterRealmPrivateWorkspace,
): GreaterRealmRuntimeReleaseArtifacts {
  const manifestBytes = workspace.readFile(
    runtimeReleasePath('import-manifest.json'),
    MAXIMUM_RUNTIME_MANIFEST_BYTES,
  );
  if (
    manifestBytes.byteLength < 1
    || manifestBytes.byteLength > MAXIMUM_RUNTIME_MANIFEST_BYTES
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  const manifest = parsedJson(
    manifestBytes,
    'GREATER_REALM_RUNTIME_RELEASE_MANIFEST_INVALID',
  ) as Record<string, unknown>;
  if (!manifestBytes.equals(canonicalBytes(manifest))) {
    fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
  }
  assertNoPrivateReleaseMaterial(manifest);
  assertRuntimeReleaseManifestBounds(manifest);
  let cumulativeBytes = manifestBytes.byteLength;
  const statusBytes = workspace.readFile(
    runtimeReleasePath('status.json'),
    Math.min(
      MAXIMUM_RUNTIME_STATUS_BYTES,
      MAXIMUM_RUNTIME_RELEASE_BYTES - cumulativeBytes,
    ),
  );
  if (
    statusBytes.byteLength < 1
    || statusBytes.byteLength > MAXIMUM_RUNTIME_STATUS_BYTES
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  cumulativeBytes += statusBytes.byteLength;
  if (cumulativeBytes > MAXIMUM_RUNTIME_RELEASE_BYTES) {
    fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  }
  const status = parsedJson(
    statusBytes,
    'GREATER_REALM_RUNTIME_RELEASE_STATUS_INVALID',
  ) as Record<string, unknown>;
  if (!statusBytes.equals(canonicalBytes(status))) {
    fail('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
  }
  assertNoPrivateReleaseMaterial(status);
  const totals = manifest.totals as Record<string, number>;
  let cellCount = 0;
  let slotCount = 0;
  let resourceNodeCount = 0;
  const chunks = (manifest.chunks as Array<Record<string, unknown>>)
    .map((descriptor, index) => {
    const path = String(descriptor.path);
    const remainingBytes = MAXIMUM_RUNTIME_RELEASE_BYTES - cumulativeBytes;
    if (remainingBytes < 1) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    const bytes = workspace.readFile(
      runtimeReleasePath(path),
      Math.min(MAXIMUM_RUNTIME_CHUNK_BYTES, remainingBytes),
    );
    if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_RUNTIME_CHUNK_BYTES) {
      fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    }
    cumulativeBytes += bytes.byteLength;
    if (cumulativeBytes > MAXIMUM_RUNTIME_RELEASE_BYTES) {
      fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    }
    const payload = parsedJson(
      bytes,
      'GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID',
    ) as GreaterRealmRuntimeChunkPayload;
    const resourceCountByLocation = new Map<string, number>();
    if (Array.isArray(payload?.resourceNodes)) {
      for (const node of payload.resourceNodes) {
        const locationId = typeof node?.locationId === 'string' ? node.locationId : '';
        resourceCountByLocation.set(locationId, (resourceCountByLocation.get(locationId) ?? 0) + 1);
      }
    }
    if (
      payload === null
      || typeof payload !== 'object'
      || !bytes.equals(canonicalBytes(payload))
      || descriptor.payloadSha256 !== sha256(bytes)
      || payload.schema !== GREATER_REALM_RUNTIME_CHUNK_SCHEMA
      || payload.publicReleaseId !== manifest.publicReleaseId
      || payload.chunkHandle !== descriptor.chunkHandle
      || payload.importOrdinal !== index
      || !Array.isArray(payload.cells)
      || !Array.isArray(payload.apronCellKeys)
      || !Array.isArray(payload.lod1CellKeys)
      || !Array.isArray(payload.lod2CellKeys)
      || !Array.isArray(payload.lod3CellKeys)
      || !Array.isArray(payload.castleSlots)
      || !Array.isArray(payload.resourceNodes)
      || payload.cells.length !== descriptor.coreCellCount
      || payload.apronCellKeys.length !== descriptor.apronCellCount
      || payload.lod1CellKeys.length !== descriptor.lod1CellCount
      || payload.lod2CellKeys.length !== descriptor.lod2CellCount
      || payload.lod3CellKeys.length !== descriptor.lod3CellCount
      || payload.castleSlots.length > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS
      || payload.resourceNodes.length > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES
      || new Set(payload.resourceNodes.map(node => node.locationId)).size
        > GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS
      || [...resourceCountByLocation.values()].some(
        count => count > GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION,
      )
    ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    assertNoPrivateReleaseMaterial(payload);
    cellCount += payload.cells.length;
    slotCount += payload.castleSlots.length;
    resourceNodeCount += payload.resourceNodes.length;
    if (
      cellCount > totals.cellCount
      || slotCount > 600
      || resourceNodeCount > 12_000
    ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    return Object.freeze({ path, bytes, payload });
  });
  if (
    cellCount !== totals.cellCount
    || slotCount !== 600
    || resourceNodeCount !== 12_000
  ) fail('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  const artifacts = Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes,
    status: Object.freeze(status),
    statusBytes,
    chunks: Object.freeze(chunks),
  });
  verifyGreaterRealmRuntimeReleaseArtifacts(artifacts);
  return artifacts;
}

export const greaterRealmRuntimeReleaseTestSeams = Object.freeze({
  assertNoPrivateReleaseMaterial,
  canonicalBytes,
  digestComponent,
  framedSha256,
  importBatchDescriptors,
  maximumRuntimeChunkBytes: MAXIMUM_RUNTIME_CHUNK_BYTES,
  maximumRuntimeChunks: MAXIMUM_RUNTIME_CHUNKS,
  maximumRuntimeManifestBytes: MAXIMUM_RUNTIME_MANIFEST_BYTES,
  maximumRuntimeReleaseBytes: MAXIMUM_RUNTIME_RELEASE_BYTES,
  publicRegionSpecs: PUBLIC_REGION_SPECS,
  releaseHeader,
  resourceKinds: RESOURCE_KINDS,
  sha256,
});
