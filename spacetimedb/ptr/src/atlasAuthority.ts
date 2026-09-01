import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_EMPTY_VERIFY_DIGEST,
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_LEGACY_LOWLANDS_BRIDGE_V1,
  GREATER_REALM_MAX_CELL_IMPORT_ROWS,
  GREATER_REALM_MAX_CHUNK_APRON_CELLS,
  GREATER_REALM_MAX_CHUNK_CORE_CELLS,
  GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS,
  GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS,
  GREATER_REALM_MAX_RESOURCE_IMPORT_ROWS,
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_MAX_SLOT_IMPORT_ROWS,
  GREATER_REALM_MAX_VERIFY_ROWS,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_RESOURCE_MARGIN_PER_SLOT,
  GREATER_REALM_UNASSIGNED_RANK,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
  GREATER_REALM_VISIBLE_REGION_COUNT,
  GREATER_REALM_VISIBLE_TIER_MAX,
  GreaterRealmV17PolicyError,
  type GreaterRealmCellInputV1,
  type GreaterRealmChunkInputV1,
  type GreaterRealmComponentInputV1,
  type GreaterRealmReleaseInputV1,
  type GreaterRealmResourceInputV1,
  type GreaterRealmSlotInputV1,
  greaterRealmV17ErrorCode,
  requireBoundedGreaterRealmBatch,
  requireGreaterRealmChunkHandle,
  requireGreaterRealmChunkPayloadBytesV1,
  requireGreaterRealmOpaqueId,
  requireGreaterRealmPresentationString,
  requireGreaterRealmPublicRegion,
  requireGreaterRealmResourceKind,
  requireGreaterRealmSafeInteger,
  requireGreaterRealmSha256,
  validateGreaterRealmCellInputV1,
  validateGreaterRealmChunkInputV1,
  validateGreaterRealmComponentInputV1,
  validateGreaterRealmReleaseInputV1,
  validateGreaterRealmResourceInputV1,
  validateGreaterRealmSlotInputV1,
} from './atlasPolicy';
import type { PtrContext } from './context';
import { Sha256, sha256Hex, updateLengthFramedSha256 } from './sha256';

/**
 * PTR-local authority for the declassified v17 atlas package. It preserves
 * canonical package hashing, bounded import, topology/resource verification,
 * and finalization closure without importing the legacy realm policy graph.
 * Exact PTR target binding and the dedicated fresh administrator remain the
 * trust boundary for accepting the reviewed release digest.
 */
type GreaterRealmContext = PtrContext;

export interface GreaterRealmCellImportV1 extends GreaterRealmCellInputV1 {
  localQ: number;
  localR: number;
  atlasQ: number;
  atlasR: number;
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
  hydroDepthClass: number;
  hydroSurfaceMilli: number;
  flowAccumulation: bigint;
  bankVariant: number;
  hydrologyRevision: number;
  travelClass: number;
  wetness: number;
  exposure: number;
  coastDistance: number;
  freshwaterDistance: number;
  temperature: number;
  moisture: number;
  habitatClass: number;
  featureClass: number;
  ambienceClass: number;
  presentationVariant: number;
}

export interface GreaterRealmRegionImportV1 {
  regionId: string;
  publicName: string;
  ordinal: number;
  tier: number;
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
  active: boolean;
}

function runtimeRegionImportRecord(row: GreaterRealmRegionImportV1): Readonly<Record<string, unknown>> {
  return {
    regionId: row.regionId,
    publicName: row.publicName,
    ordinal: row.ordinal,
    tier: row.tier,
    cellCount: row.cellCount,
    passableCellCount: row.passableCellCount,
    chunkCount: row.chunkCount,
    castleCapacity: row.castleCapacity,
    resourceLocationCount: row.resourceLocationCount,
    resourceNodeCount: row.resourceNodeCount,
    foodNodeCount: row.foodNodeCount,
    woodNodeCount: row.woodNodeCount,
    stoneNodeCount: row.stoneNodeCount,
    goldNodeCount: row.goldNodeCount,
    active: row.active,
  };
}

function fail(code: string): never {
  throw new GreaterRealmV17PolicyError(code);
}

export function requireGreaterRealmV17ImportGate(): void {
  if (!GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED) {
    fail('GREATER_REALM_IMPORT_NOT_COMPILED');
  }
}

export function requireGreaterRealmV17ActivationGate(): void {
  if (!GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED) {
    fail('GREATER_REALM_ACTIVATION_NOT_COMPILED');
  }
}

function scalarEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
    && 'microsSinceUnixEpoch' in left
    && 'microsSinceUnixEpoch' in right
  ) {
    return (left as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch
      === (right as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch;
  }
  return false;
}

function rowMatches(
  existing: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return keys.every(key => scalarEqual(existing[key], incoming[key]));
}

function requireRelease(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  states: readonly string[],
) {
  requireGreaterRealmOpaqueId(atlasId, 'GREATER_REALM_ATLAS_ID_INVALID');
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(atlasId);
  if (release === null) fail('GREATER_REALM_RELEASE_MISSING');
  if (release.importEpoch !== importEpoch) fail('GREATER_REALM_IMPORT_EPOCH_CHANGED');
  if (!states.includes(release.state)) fail('GREATER_REALM_RELEASE_STATE_INVALID');
  return release;
}

function canonicalValue(value: unknown): string {
  if (value === undefined) return '-';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value !== null && typeof value === 'object' && 'microsSinceUnixEpoch' in value) {
    return `${(value as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch}t`;
  }
  fail('GREATER_REALM_CANONICAL_VALUE_INVALID');
}

function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function initializeComponentDigest(componentKey: string, expectedCellCount: number): string {
  const hash = new Sha256().update('warpkeep.greater-realm.component.v1\n');
  updateLengthFramedSha256(hash, canonicalJsonBytes({ componentKey }));
  updateLengthFramedSha256(
    hash,
    canonicalJsonBytes({ section: 'cells', count: expectedCellCount }),
  );
  return hash.serialize();
}

function initializeReleaseDigest(headerJson: string): string {
  const hash = new Sha256().update('warpkeep.greater-realm.release.v1\n');
  updateLengthFramedSha256(hash, new TextEncoder().encode(headerJson));
  return hash.serialize();
}

function initializeVerificationDigest(): string {
  return new Sha256().update('warpkeep.greater-realm.verification.v1\n').serialize();
}

function emptyComponentRegionVerification(): string {
  return `${JSON.stringify(GREATER_REALM_PUBLIC_REGIONS.map(region => ({
    regionId: region.id,
    slotCount: 0,
    foodNodeCount: 0,
    woodNodeCount: 0,
    stoneNodeCount: 0,
    goldNodeCount: 0,
  })))}\n`;
}

function exactObjectKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail(code);
}

function parseCanonicalJsonObject(value: string, code: string): Record<string, unknown> {
  if (!value.endsWith('\n')) fail(code);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail(code);
  }
  if (
    parsed === null
    || Array.isArray(parsed)
    || typeof parsed !== 'object'
    || `${JSON.stringify(parsed)}\n` !== value
  ) fail(code);
  return parsed as Record<string, unknown>;
}

function parseCanonicalJsonArray(value: string, code: string): unknown[] {
  if (!value.endsWith('\n')) fail(code);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail(code);
  }
  if (!Array.isArray(parsed) || `${JSON.stringify(parsed)}\n` !== value) fail(code);
  return parsed;
}

function requireCanonicalReleaseHeader(
  headerJson: string,
  input: GreaterRealmReleaseInputV1,
): void {
  const header = parseCanonicalJsonObject(headerJson, 'GREATER_REALM_RELEASE_HEADER_INVALID');
  exactObjectKeys(header, [
    'schema', 'classification', 'atlasId', 'publicReleaseId',
    'publicApprovalReceiptId', 'sourceCommit', 'generatorVersion',
    'sourceFormatVersion', 'livingWorldVersion', 'runtimePartitionVersion',
    'rendererContractVersion', 'visibleTierMax', 'totals', 'legacyLowlandsBridge',
  ], 'GREATER_REALM_RELEASE_HEADER_INVALID');
  if (
    header.schema !== 'warpkeep.greater-realm.runtime-import-manifest.v1'
    || header.classification !== 'declassified-tier-i-runtime-import'
    || header.atlasId !== input.atlasId
    || header.publicReleaseId !== input.publicReleaseId
    || header.publicApprovalReceiptId !== input.publicApprovalReceiptId
    || header.sourceCommit !== input.sourceCommit
    || header.generatorVersion !== input.generatorVersion
    || header.sourceFormatVersion !== input.sourceFormatVersion
    || header.livingWorldVersion !== input.livingWorldVersion
    || header.runtimePartitionVersion !== input.runtimePartitionVersion
    || header.rendererContractVersion !== input.rendererContractVersion
    || header.visibleTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
  ) fail('GREATER_REALM_RELEASE_HEADER_MISMATCH');
  const totals = header.totals;
  if (totals === null || Array.isArray(totals) || typeof totals !== 'object') {
    fail('GREATER_REALM_RELEASE_TOTALS_INVALID');
  }
  const totalRows = totals as Record<string, unknown>;
  exactObjectKeys(totalRows, [
    'regionCount', 'componentCount', 'chunkCount', 'cellCount',
    'castleSlotCount', 'resourceNodeCount',
  ], 'GREATER_REALM_RELEASE_TOTALS_INVALID');
  if (
    totalRows.regionCount !== input.expectedRegionCount
    || totalRows.componentCount !== input.expectedComponentCount
    || totalRows.chunkCount !== input.expectedChunkCount
    || totalRows.cellCount !== input.expectedCellCount
    || totalRows.castleSlotCount !== input.expectedSlotCount
    || totalRows.resourceNodeCount !== input.expectedResourceNodeCount
  ) fail('GREATER_REALM_RELEASE_TOTALS_MISMATCH');
  const legacyBridge = header.legacyLowlandsBridge;
  if (legacyBridge === null || Array.isArray(legacyBridge) || typeof legacyBridge !== 'object') {
    fail('GREATER_REALM_LEGACY_BRIDGE_INVALID');
  }
  const legacy = legacyBridge as Record<string, unknown>;
  exactObjectKeys(legacy, [
    'mappedCellCount', 'mappedCastleSlotCount', 'mappedResourceCatalogCounts',
    'worldGenerationDigest', 'castleSlotDigest', 'goldSiteDigest', 'foodSiteDigest',
    'woodSiteDigest', 'stoneSiteDigest',
  ], 'GREATER_REALM_LEGACY_BRIDGE_INVALID');
  const resourceCounts = legacy.mappedResourceCatalogCounts;
  if (resourceCounts === null || Array.isArray(resourceCounts) || typeof resourceCounts !== 'object') {
    fail('GREATER_REALM_LEGACY_BRIDGE_INVALID');
  }
  exactObjectKeys(
    resourceCounts as Record<string, unknown>,
    ['food', 'wood', 'stone', 'gold'],
    'GREATER_REALM_LEGACY_BRIDGE_INVALID',
  );
  const expectedLegacy = GREATER_REALM_LEGACY_LOWLANDS_BRIDGE_V1;
  if (
    legacy.mappedCellCount !== expectedLegacy.mappedCellCount
    || legacy.mappedCastleSlotCount !== expectedLegacy.mappedCastleSlotCount
    || JSON.stringify(resourceCounts) !== JSON.stringify(expectedLegacy.mappedResourceCatalogCounts)
    || legacy.worldGenerationDigest !== expectedLegacy.worldGenerationDigest
    || legacy.castleSlotDigest !== expectedLegacy.castleSlotDigest
    || legacy.goldSiteDigest !== expectedLegacy.goldSiteDigest
    || legacy.foodSiteDigest !== expectedLegacy.foodSiteDigest
    || legacy.woodSiteDigest !== expectedLegacy.woodSiteDigest
    || legacy.stoneSiteDigest !== expectedLegacy.stoneSiteDigest
  ) fail('GREATER_REALM_LEGACY_BRIDGE_MISMATCH');
  const encoded = headerJson.toLowerCase();
  if (
    encoded.includes('t2_crownwood')
    || encoded.includes('t2_ironveil')
    || encoded.includes('t2_glasswater')
    || encoded.includes('t3_throneheart')
    || encoded.includes('candidatehandle')
    || encoded.includes('batchhandle')
    || encoded.includes('gateendpoint')
  ) fail('GREATER_REALM_RELEASE_HEADER_PRIVACY_INVALID');
}

export function canonicalGreaterRealmVerificationLine(
  kind: string,
  row: Readonly<Record<string, unknown>>,
): string {
  return `${kind}|${Object.keys(row).sort().map(key => (
    `${key}=${canonicalValue(row[key])}`
  )).join('|')}`;
}

export function validateGreaterRealmCellImportV1(input: GreaterRealmCellImportV1): void {
  validateGreaterRealmCellInputV1(input);
  if (input.atlasCoordKey !== `A:${input.atlasQ}:${input.atlasR}`) {
    fail('GREATER_REALM_ATLAS_COORD_KEY_INVALID');
  }
  const expectedCellKey = `${input.regionId}:${input.localQ}:${input.localR}`;
  if (input.cellKey !== expectedCellKey) {
    fail('GREATER_REALM_REGION_CELL_KEY_INVALID');
  }
  for (const coordinate of [input.localQ, input.localR, input.atlasQ, input.atlasR]) {
    requireGreaterRealmSafeInteger(
      coordinate,
      -0x8000_0000,
      0x7fff_ffff,
      'GREATER_REALM_CELL_COORDINATE_INVALID',
    );
  }
  for (const signed of [
    input.elevation,
    input.profileCurvature,
    input.planCurvature,
    input.hydroSurfaceMilli,
    input.exposure,
    input.temperature,
    input.moisture,
  ]) requireGreaterRealmSafeInteger(signed, -0x8000_0000, 0x7fff_ffff, 'GREATER_REALM_CELL_SIGNED_FIELD_INVALID');
  for (const [value, maximum] of [
    [input.slope, 0xffff],
    [input.aspect, 6],
    [input.geologicalBarrierBand, 3],
    [input.biomeClass, 23],
    [input.landformClass, 17],
    [input.yieldClass, 3],
    [input.hydroDepthClass, 3],
    [input.bankVariant, 0xffff_ffff],
    [input.hydrologyRevision, 0xffff],
    [input.travelClass, 4],
    [input.wetness, 0xffff],
    [input.coastDistance, 0xffff],
    [input.freshwaterDistance, 0xffff],
    [input.habitatClass, 9],
    [input.featureClass, 4],
    [input.ambienceClass, 5],
    [input.presentationVariant, 0xffff_ffff],
  ] as const) requireGreaterRealmSafeInteger(value, 0, maximum, 'GREATER_REALM_CELL_UNSIGNED_FIELD_INVALID');
  if (input.ridgeId !== undefined) {
    if (!/^GRD-[A-Z2-7]{26}$/.test(input.ridgeId)) fail('GREATER_REALM_RIDGE_ID_INVALID');
  }
  if (input.hydroBodyId !== undefined && !/^GRW-[A-Z2-7]{26}$/.test(input.hydroBodyId)) {
    fail('GREATER_REALM_PUBLIC_WATER_ID_INVALID');
  }
  if (input.componentKey !== undefined && !/^GRC-[A-Z2-7]{26}$/.test(input.componentKey)) {
    fail('GREATER_REALM_COMPONENT_KEY_INVALID');
  }
  if (input.hydroRegime === 0 ? input.hydroDepthClass !== 0 : input.hydroDepthClass === 0) {
    fail('GREATER_REALM_HYDROLOGY_DEPTH_INVALID');
  }
  if (!input.passable && input.movementCost !== 1_000_000) {
    fail('GREATER_REALM_IMPASSABLE_MOVEMENT_COST_INVALID');
  }
  if (input.flowAccumulation < 0n || input.flowAccumulation > 0xffff_ffff_ffff_ffffn) {
    fail('GREATER_REALM_FLOW_ACCUMULATION_INVALID');
  }
}

export function stageGreaterRealmReleaseV1(
  ctx: GreaterRealmContext,
  input: GreaterRealmReleaseInputV1,
  releaseHeaderJson: string,
): 'inserted' | 'unchanged' {
  validateGreaterRealmReleaseInputV1(input);
  requireCanonicalReleaseHeader(releaseHeaderJson, input);
  const releaseHeaderSha256 = sha256Hex(new TextEncoder().encode(releaseHeaderJson));
  if (ctx.db.greaterRealmReleaseV1.count() > 1n) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
  const existing = ctx.db.greaterRealmReleaseV1.atlasId.find(input.atlasId);
  if (existing !== null) {
    const keys = Object.keys(input);
    if (!rowMatches(existing as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>, keys)) {
      fail('GREATER_REALM_RELEASE_RETRY_MISMATCH');
    }
    if (existing.state !== 'importing' || !existing.verificationDigest.startsWith('sha256-v1:')) {
      fail('GREATER_REALM_RELEASE_RETRY_STATE_INVALID');
    }
    if (existing.releaseHeaderSha256 !== releaseHeaderSha256) {
      fail('GREATER_REALM_RELEASE_HEADER_RETRY_MISMATCH');
    }
    return 'unchanged';
  }
  if (ctx.db.greaterRealmReleaseV1.count() !== 0n) fail('GREATER_REALM_RELEASE_ALREADY_STAGED');
  ctx.db.greaterRealmReleaseV1.insert({
    ...input,
    componentExpectedCellCount: 0,
    componentExpectedSlotCount: 0,
    componentExpectedResourceNodeCount: 0,
    importedPassableCellCount: 0,
    releaseHeaderSha256,
    publicName: undefined,
    componentManifestJson: '[]\n',
    regionManifestJson: undefined,
    regionVerificationJson: '[]\n',
    legacyTransformRotation: undefined,
    legacyTransformOffsetQ: undefined,
    legacyTransformOffsetR: undefined,
    verifiedLegacyCellCount: 0,
    verifiedLegacyWaterCellCount: 0,
    // PTR verifies the declassified atlas itself. It deliberately does not
    // embed the Genesis 001 world/resource catalog needed for legacy proofs.
    legacyWaterBodyVerificationJson: '[]\n',
    legacyResourceVerificationJson: '{}\n',
    nextChunkOrdinal: 0,
    verificationPhase: 'components',
    verificationCursor: 0n,
    verificationDigest: initializeReleaseDigest(releaseHeaderJson),
    verifiedComponentCount: 0,
    verifiedChunkCount: 0,
    verifiedCellCount: 0,
    verifiedSlotCount: 0,
    verifiedResourceNodeCount: 0,
    state: 'importing',
    approvedAt: ctx.timestamp,
    stagedAt: ctx.timestamp,
    readyAt: undefined,
  });
  return 'inserted';
}

const COMPONENT_IMPORT_KEYS = Object.freeze([
  'componentKey', 'atlasId', 'componentOrdinal', 'regionMask', 'rootCellKey',
  'expectedCellCount', 'maxRouteDepth', 'expectedSlotCount',
  'expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount',
  'expectedGoldNodeCount', 'componentSha256',
] as const);

function runtimeComponentImportRecord(
  row: GreaterRealmComponentInputV1,
): Readonly<Record<string, unknown>> {
  return {
    componentKey: row.componentKey,
    componentOrdinal: row.componentOrdinal,
    regionMask: row.regionMask,
    rootCellKey: row.rootCellKey,
    expectedCellCount: row.expectedCellCount,
    maxRouteDepth: row.maxRouteDepth,
    expectedSlotCount: row.expectedSlotCount,
    expectedFoodNodeCount: row.expectedFoodNodeCount,
    expectedWoodNodeCount: row.expectedWoodNodeCount,
    expectedStoneNodeCount: row.expectedStoneNodeCount,
    expectedGoldNodeCount: row.expectedGoldNodeCount,
    componentSha256: row.componentSha256,
  };
}

function appendCanonicalManifestRows(
  manifestJson: string,
  rows: readonly Readonly<Record<string, unknown>>[],
): string {
  if (rows.length === 0) return manifestJson;
  if (!manifestJson.startsWith('[') || !manifestJson.endsWith(']\n')) {
    fail('GREATER_REALM_COMPONENT_MANIFEST_INVALID');
  }
  const prefix = manifestJson.slice(0, -2);
  return `${prefix}${prefix === '[' ? '' : ','}${rows.map(row => JSON.stringify(row)).join(',')}]\n`;
}

export function importGreaterRealmComponentsV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  rows: readonly GreaterRealmComponentInputV1[],
): number {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  requireBoundedGreaterRealmBatch(
    rows.length,
    GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS,
    'GREATER_REALM_COMPONENT_BATCH_INVALID',
  );
  let inserted = 0;
  const insertedRows: GreaterRealmComponentInputV1[] = [];
  const manifestRows: Readonly<Record<string, unknown>>[] = [];
  for (const row of [...rows].sort((left, right) => left.componentOrdinal - right.componentOrdinal)) {
    validateGreaterRealmComponentInputV1(row);
    if (row.atlasId !== atlasId || row.componentOrdinal >= release.expectedComponentCount) {
      fail('GREATER_REALM_COMPONENT_RELEASE_MISMATCH');
    }
    const existing = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
    if (existing !== null) {
      if (!rowMatches(
        existing as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        COMPONENT_IMPORT_KEYS,
      )) fail('GREATER_REALM_COMPONENT_RETRY_MISMATCH');
      continue;
    }
    if (ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(row.componentOrdinal) !== null) {
      fail('GREATER_REALM_COMPONENT_ORDINAL_CONFLICT');
    }
    if (BigInt(row.componentOrdinal) !== ctx.db.greaterRealmNavigationComponentV1.count()) {
      fail('GREATER_REALM_COMPONENT_IMPORT_OUT_OF_ORDER');
    }
    ctx.db.greaterRealmNavigationComponentV1.insert({
      ...row,
      importedCellCount: 0,
      verifiedCellCount: 0,
      verifiedRegionMask: 0,
      verifiedMaxRouteDepth: 0,
      importedSlotCount: 0,
      importedFoodNodeCount: 0,
      importedWoodNodeCount: 0,
      importedStoneNodeCount: 0,
      importedGoldNodeCount: 0,
      verifiedSlotCount: 0,
      verifiedFoodNodeCount: 0,
      verifiedWoodNodeCount: 0,
      verifiedStoneNodeCount: 0,
      verifiedGoldNodeCount: 0,
      verificationPhase: 'cells',
      verificationDigest: initializeComponentDigest(row.componentKey, row.expectedCellCount),
      regionVerificationJson: emptyComponentRegionVerification(),
      active: false,
    });
    insertedRows.push(row);
    manifestRows.push(runtimeComponentImportRecord(row));
    inserted += 1;
  }
  if (manifestRows.length > 0) {
    const componentExpectedCellCount = release.componentExpectedCellCount
      + insertedRows.reduce((total, row) => total + row.expectedCellCount, 0);
    const componentExpectedSlotCount = release.componentExpectedSlotCount
      + insertedRows.reduce((total, row) => total + row.expectedSlotCount, 0);
    const componentExpectedResourceNodeCount = release.componentExpectedResourceNodeCount
      + insertedRows.reduce((total, row) => total
        + row.expectedFoodNodeCount
        + row.expectedWoodNodeCount
        + row.expectedStoneNodeCount
        + row.expectedGoldNodeCount, 0);
    requireGreaterRealmSafeInteger(
      componentExpectedCellCount,
      0,
      release.expectedCellCount,
      'GREATER_REALM_COMPONENT_CELL_COUNT_INVALID',
    );
    requireGreaterRealmSafeInteger(
      componentExpectedSlotCount,
      0,
      release.expectedSlotCount,
      'GREATER_REALM_COMPONENT_SLOT_COUNT_INVALID',
    );
    requireGreaterRealmSafeInteger(
      componentExpectedResourceNodeCount,
      0,
      release.expectedResourceNodeCount,
      'GREATER_REALM_COMPONENT_RESOURCE_COUNT_INVALID',
    );
    ctx.db.greaterRealmReleaseV1.atlasId.update({
      ...release,
      componentExpectedCellCount,
      componentExpectedSlotCount,
      componentExpectedResourceNodeCount,
      componentManifestJson: appendCanonicalManifestRows(
        release.componentManifestJson,
        manifestRows,
      ),
    });
  }
  return inserted;
}

export function importGreaterRealmRegionsV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  rows: readonly GreaterRealmRegionImportV1[],
): number {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  if (rows.length !== GREATER_REALM_VISIBLE_REGION_COUNT) {
    fail('GREATER_REALM_REGION_MANIFEST_COUNT_INVALID');
  }
  const orderedRows = [...rows].sort((left, right) => left.ordinal - right.ordinal);
  for (let index = 0; index < orderedRows.length; index += 1) {
    const row = orderedRows[index]!;
    const expected = requireGreaterRealmPublicRegion(row.regionId);
    requireGreaterRealmPresentationString(row.publicName, 'GREATER_REALM_REGION_NAME_INVALID');
    for (const [value, maximum, code] of [
      [row.ordinal, GREATER_REALM_VISIBLE_REGION_COUNT - 1, 'GREATER_REALM_REGION_ORDINAL_INVALID'],
      [row.cellCount, 1_000_000, 'GREATER_REALM_REGION_CELL_COUNT_INVALID'],
      [row.passableCellCount, 1_000_000, 'GREATER_REALM_REGION_PASSABLE_COUNT_INVALID'],
      [row.chunkCount, 1_000_000, 'GREATER_REALM_REGION_CHUNK_COUNT_INVALID'],
      [row.castleCapacity, GREATER_REALM_CASTLE_CAPACITY, 'GREATER_REALM_REGION_CAPACITY_INVALID'],
      [row.resourceLocationCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
      [row.resourceNodeCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
      [row.foodNodeCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
      [row.woodNodeCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
      [row.stoneNodeCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
      [row.goldNodeCount, 1_000_000, 'GREATER_REALM_REGION_RESOURCE_COUNT_INVALID'],
    ] as const) requireGreaterRealmSafeInteger(value, 0, maximum, code);
    if (
      row.publicName !== expected.name
      || row.ordinal !== expected.ordinal
      || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || row.castleCapacity !== GREATER_REALM_CASTLES_PER_REGION
      || row.passableCellCount > row.cellCount
      || row.resourceLocationCount > row.resourceNodeCount
      || row.foodNodeCount + row.woodNodeCount + row.stoneNodeCount + row.goldNodeCount
        !== row.resourceNodeCount
      || row.foodNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * row.castleCapacity
      || row.woodNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * row.castleCapacity
      || row.stoneNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * row.castleCapacity
      || row.goldNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * row.castleCapacity
      || row.active
    ) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
    if (expected.ordinal !== index) fail('GREATER_REALM_REGION_MANIFEST_ORDER_INVALID');
  }
  const manifestJson = `${JSON.stringify(orderedRows.map(runtimeRegionImportRecord))}\n`;
  const verificationJson = `${JSON.stringify(orderedRows.map(row => ({
    regionId: row.regionId,
    verifiedCellCount: 0,
    verifiedPassableCellCount: 0,
    verifiedChunkCount: 0,
    verifiedCastleCapacity: 0,
    verifiedResourceLocationCount: 0,
    verifiedResourceNodeCount: 0,
    verifiedFoodNodeCount: 0,
    verifiedWoodNodeCount: 0,
    verifiedStoneNodeCount: 0,
    verifiedGoldNodeCount: 0,
  })))}\n`;
  if (release.regionManifestJson !== undefined) {
    if (
      release.regionManifestJson !== manifestJson
      || release.regionVerificationJson !== verificationJson
    ) fail('GREATER_REALM_REGION_RETRY_MISMATCH');
    return 0;
  }
  ctx.db.greaterRealmReleaseV1.atlasId.update({
    ...release,
    regionManifestJson: manifestJson,
    regionVerificationJson: verificationJson,
  });
  return orderedRows.length;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') fail(code);
  return value as Record<string, unknown>;
}

function exactOptionalKeys(
  value: Record<string, unknown>,
  orderedKeys: readonly string[],
  code: string,
): void {
  const expected = orderedKeys.filter(key => Object.prototype.hasOwnProperty.call(value, key));
  exactObjectKeys(value, expected, code);
  if (Object.keys(value).some(key => !orderedKeys.includes(key))) fail(code);
}

function numberField(value: Record<string, unknown>, key: string, code: string): number {
  const result = value[key];
  if (typeof result !== 'number' || !Number.isSafeInteger(result)) fail(code);
  return result;
}

function stringField(value: Record<string, unknown>, key: string, code: string): string {
  const result = value[key];
  if (typeof result !== 'string') fail(code);
  return result;
}

function booleanField(value: Record<string, unknown>, key: string, code: string): boolean {
  const result = value[key];
  if (typeof result !== 'boolean') fail(code);
  return result;
}

const RUNTIME_CELL_KEYS = Object.freeze([
  'cellKey', 'atlasCoordKey', 'releaseOrdinal', 'atlasId', 'chunkHandle',
  'regionId', 'componentKey', 'localQ', 'localR', 'atlasQ', 'atlasR', 'tier',
  'passable', 'elevation', 'slope', 'aspect', 'profileCurvature', 'planCurvature',
  'ridgeId', 'geologicalBarrierBand', 'biomeClass', 'landformClass', 'yieldClass',
  'movementCost', 'sealedBoundaryMask', 'hydroRegime', 'hydroBodyId',
  'hydroDepthClass', 'hydroSurfaceMilli', 'hydroFlowDirection', 'flowAccumulation',
  'bankVariant', 'hydrologyRevision', 'routeParentDirection', 'routeDepth',
  'travelClass', 'wetness', 'exposure', 'coastDistance', 'freshwaterDistance',
  'temperature', 'moisture', 'habitatClass', 'canopyBasisPoints',
  'groundcoverBasisPoints', 'wildflowerBasisPoints', 'featureClass',
  'ambienceClass', 'presentationVariant',
] as const);

function parseRuntimeCell(value: unknown): GreaterRealmCellImportV1 {
  const row = record(value, 'GREATER_REALM_CHUNK_CELL_INVALID');
  exactOptionalKeys(row, RUNTIME_CELL_KEYS, 'GREATER_REALM_CHUNK_CELL_INVALID');
  const flow = stringField(row, 'flowAccumulation', 'GREATER_REALM_FLOW_ACCUMULATION_INVALID');
  if (!/^(?:0|[1-9][0-9]{0,19})$/.test(flow)) fail('GREATER_REALM_FLOW_ACCUMULATION_INVALID');
  const parsed: GreaterRealmCellImportV1 = {
    cellKey: stringField(row, 'cellKey', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    atlasCoordKey: stringField(row, 'atlasCoordKey', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    releaseOrdinal: numberField(row, 'releaseOrdinal', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    atlasId: stringField(row, 'atlasId', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    chunkHandle: stringField(row, 'chunkHandle', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    regionId: stringField(row, 'regionId', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    componentKey: Object.prototype.hasOwnProperty.call(row, 'componentKey')
      ? stringField(row, 'componentKey', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    localQ: numberField(row, 'localQ', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    localR: numberField(row, 'localR', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    atlasQ: numberField(row, 'atlasQ', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    atlasR: numberField(row, 'atlasR', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    tier: numberField(row, 'tier', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    passable: booleanField(row, 'passable', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    elevation: numberField(row, 'elevation', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    slope: numberField(row, 'slope', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    aspect: numberField(row, 'aspect', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    profileCurvature: numberField(row, 'profileCurvature', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    planCurvature: numberField(row, 'planCurvature', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    ridgeId: Object.prototype.hasOwnProperty.call(row, 'ridgeId')
      ? stringField(row, 'ridgeId', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    geologicalBarrierBand: numberField(row, 'geologicalBarrierBand', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    biomeClass: numberField(row, 'biomeClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    landformClass: numberField(row, 'landformClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    yieldClass: numberField(row, 'yieldClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    movementCost: numberField(row, 'movementCost', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    sealedBoundaryMask: numberField(row, 'sealedBoundaryMask', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    hydroRegime: numberField(row, 'hydroRegime', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    hydroBodyId: Object.prototype.hasOwnProperty.call(row, 'hydroBodyId')
      ? stringField(row, 'hydroBodyId', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    hydroDepthClass: numberField(row, 'hydroDepthClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    hydroSurfaceMilli: numberField(row, 'hydroSurfaceMilli', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    hydroFlowDirection: Object.prototype.hasOwnProperty.call(row, 'hydroFlowDirection')
      ? numberField(row, 'hydroFlowDirection', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    flowAccumulation: BigInt(flow),
    bankVariant: numberField(row, 'bankVariant', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    hydrologyRevision: numberField(row, 'hydrologyRevision', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    routeParentDirection: Object.prototype.hasOwnProperty.call(row, 'routeParentDirection')
      ? numberField(row, 'routeParentDirection', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    routeDepth: Object.prototype.hasOwnProperty.call(row, 'routeDepth')
      ? numberField(row, 'routeDepth', 'GREATER_REALM_CHUNK_CELL_INVALID')
      : undefined,
    travelClass: numberField(row, 'travelClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    wetness: numberField(row, 'wetness', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    exposure: numberField(row, 'exposure', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    coastDistance: numberField(row, 'coastDistance', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    freshwaterDistance: numberField(row, 'freshwaterDistance', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    temperature: numberField(row, 'temperature', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    moisture: numberField(row, 'moisture', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    habitatClass: numberField(row, 'habitatClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    canopyBasisPoints: numberField(row, 'canopyBasisPoints', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    groundcoverBasisPoints: numberField(row, 'groundcoverBasisPoints', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    wildflowerBasisPoints: numberField(row, 'wildflowerBasisPoints', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    featureClass: numberField(row, 'featureClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    ambienceClass: numberField(row, 'ambienceClass', 'GREATER_REALM_CHUNK_CELL_INVALID'),
    presentationVariant: numberField(row, 'presentationVariant', 'GREATER_REALM_CHUNK_CELL_INVALID'),
  };
  validateGreaterRealmCellImportV1(parsed);
  return parsed;
}

const RUNTIME_SLOT_KEYS = Object.freeze([
  'slotId', 'releaseOrdinal', 'atlasId', 'cellKey', 'regionId', 'componentKey',
  'tier', 'regionOrderRank', 'allocationRank', 'active', 'legacySlotId',
] as const);

function parseRuntimeSlot(value: unknown): GreaterRealmSlotInputV1 {
  const row = record(value, 'GREATER_REALM_CHUNK_SLOT_INVALID');
  exactOptionalKeys(row, RUNTIME_SLOT_KEYS, 'GREATER_REALM_CHUNK_SLOT_INVALID');
  const parsed: GreaterRealmSlotInputV1 = {
    slotId: stringField(row, 'slotId', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    releaseOrdinal: numberField(row, 'releaseOrdinal', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    atlasId: stringField(row, 'atlasId', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    cellKey: stringField(row, 'cellKey', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    regionId: stringField(row, 'regionId', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    componentKey: stringField(row, 'componentKey', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    tier: numberField(row, 'tier', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    regionOrderRank: numberField(row, 'regionOrderRank', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    allocationRank: numberField(row, 'allocationRank', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    active: booleanField(row, 'active', 'GREATER_REALM_CHUNK_SLOT_INVALID'),
    legacySlotId: Object.prototype.hasOwnProperty.call(row, 'legacySlotId')
      ? numberField(row, 'legacySlotId', 'GREATER_REALM_CHUNK_SLOT_INVALID')
      : undefined,
  };
  validateGreaterRealmSlotInputV1(parsed);
  return parsed;
}

const RUNTIME_RESOURCE_KEYS = Object.freeze([
  'nodeId', 'releaseOrdinal', 'atlasId', 'locationId', 'cellKey', 'regionId',
  'componentKey', 'resourceKind', 'tier', 'nodeOrdinal', 'allocationRank',
  'legacyCatalogId', 'policyVersion', 'active',
] as const);

function parseRuntimeResource(value: unknown): GreaterRealmResourceInputV1 {
  const row = record(value, 'GREATER_REALM_CHUNK_RESOURCE_INVALID');
  exactOptionalKeys(row, RUNTIME_RESOURCE_KEYS, 'GREATER_REALM_CHUNK_RESOURCE_INVALID');
  const parsed: GreaterRealmResourceInputV1 = {
    nodeId: stringField(row, 'nodeId', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    releaseOrdinal: numberField(row, 'releaseOrdinal', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    atlasId: stringField(row, 'atlasId', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    locationId: stringField(row, 'locationId', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    cellKey: stringField(row, 'cellKey', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    regionId: stringField(row, 'regionId', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    componentKey: stringField(row, 'componentKey', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    resourceKind: stringField(row, 'resourceKind', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    tier: numberField(row, 'tier', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    nodeOrdinal: numberField(row, 'nodeOrdinal', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    allocationRank: numberField(row, 'allocationRank', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    legacyCatalogId: Object.prototype.hasOwnProperty.call(row, 'legacyCatalogId')
      ? stringField(row, 'legacyCatalogId', 'GREATER_REALM_CHUNK_RESOURCE_INVALID')
      : undefined,
    policyVersion: stringField(row, 'policyVersion', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
    active: booleanField(row, 'active', 'GREATER_REALM_CHUNK_RESOURCE_INVALID'),
  };
  validateGreaterRealmResourceInputV1(parsed);
  return parsed;
}

function runtimeCellRecord(row: GreaterRealmCellImportV1): Readonly<Record<string, unknown>> {
  return {
    cellKey: row.cellKey,
    atlasCoordKey: row.atlasCoordKey,
    releaseOrdinal: row.releaseOrdinal,
    atlasId: row.atlasId,
    chunkHandle: row.chunkHandle,
    regionId: row.regionId,
    ...(row.componentKey === undefined ? {} : { componentKey: row.componentKey }),
    localQ: row.localQ,
    localR: row.localR,
    atlasQ: row.atlasQ,
    atlasR: row.atlasR,
    tier: row.tier,
    passable: row.passable,
    elevation: row.elevation,
    slope: row.slope,
    aspect: row.aspect,
    profileCurvature: row.profileCurvature,
    planCurvature: row.planCurvature,
    ...(row.ridgeId === undefined ? {} : { ridgeId: row.ridgeId }),
    geologicalBarrierBand: row.geologicalBarrierBand,
    biomeClass: row.biomeClass,
    landformClass: row.landformClass,
    yieldClass: row.yieldClass,
    movementCost: row.movementCost,
    sealedBoundaryMask: row.sealedBoundaryMask,
    hydroRegime: row.hydroRegime,
    ...(row.hydroBodyId === undefined ? {} : { hydroBodyId: row.hydroBodyId }),
    hydroDepthClass: row.hydroDepthClass,
    hydroSurfaceMilli: row.hydroSurfaceMilli,
    ...(row.hydroFlowDirection === undefined ? {} : { hydroFlowDirection: row.hydroFlowDirection }),
    flowAccumulation: row.flowAccumulation.toString(10),
    bankVariant: row.bankVariant,
    hydrologyRevision: row.hydrologyRevision,
    ...(row.routeParentDirection === undefined ? {} : { routeParentDirection: row.routeParentDirection }),
    ...(row.routeDepth === undefined ? {} : { routeDepth: row.routeDepth }),
    travelClass: row.travelClass,
    wetness: row.wetness,
    exposure: row.exposure,
    coastDistance: row.coastDistance,
    freshwaterDistance: row.freshwaterDistance,
    temperature: row.temperature,
    moisture: row.moisture,
    habitatClass: row.habitatClass,
    canopyBasisPoints: row.canopyBasisPoints,
    groundcoverBasisPoints: row.groundcoverBasisPoints,
    wildflowerBasisPoints: row.wildflowerBasisPoints,
    featureClass: row.featureClass,
    ambienceClass: row.ambienceClass,
    presentationVariant: row.presentationVariant,
  };
}

function runtimeSlotRecord(row: GreaterRealmSlotInputV1): Readonly<Record<string, unknown>> {
  return {
    slotId: row.slotId,
    releaseOrdinal: row.releaseOrdinal,
    atlasId: row.atlasId,
    cellKey: row.cellKey,
    regionId: row.regionId,
    componentKey: row.componentKey,
    tier: row.tier,
    regionOrderRank: row.regionOrderRank,
    allocationRank: row.allocationRank,
    active: row.active,
    ...(row.legacySlotId === undefined ? {} : { legacySlotId: row.legacySlotId }),
  };
}

function runtimeResourceRecord(row: GreaterRealmResourceInputV1): Readonly<Record<string, unknown>> {
  return {
    nodeId: row.nodeId,
    releaseOrdinal: row.releaseOrdinal,
    atlasId: row.atlasId,
    locationId: row.locationId,
    cellKey: row.cellKey,
    regionId: row.regionId,
    componentKey: row.componentKey,
    resourceKind: row.resourceKind,
    tier: row.tier,
    nodeOrdinal: row.nodeOrdinal,
    allocationRank: row.allocationRank,
    ...(row.legacyCatalogId === undefined ? {} : { legacyCatalogId: row.legacyCatalogId }),
    policyVersion: row.policyVersion,
    active: row.active,
  };
}

function stringArray(value: unknown, maximum: number, code: string, minimum = 1): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(code);
  const result = value.map(entry => {
    if (typeof entry !== 'string') return fail(code);
    requireGreaterRealmOpaqueId(entry, code);
    return entry;
  });
  if (new Set(result).size !== result.length) fail(code);
  return result;
}

function subsetOf(values: readonly string[], allowed: ReadonlySet<string>, code: string): void {
  if (values.some(value => !allowed.has(value))) fail(code);
}

function expectedImportBatchDescriptors(
  rows: readonly Readonly<{ releaseOrdinal: number }>[],
  maximumRows: number,
): Readonly<Record<string, unknown>>[] {
  const batches: Readonly<Record<string, unknown>>[] = [];
  for (let offset = 0; offset < rows.length; offset += maximumRows) {
    const batchRows = rows.slice(offset, offset + maximumRows);
    batches.push({
      batchOrdinal: batches.length,
      firstRowOrdinal: batchRows[0]!.releaseOrdinal,
      rowCount: batchRows.length,
      rowsSha256: sha256Hex(canonicalJsonBytes(batchRows)),
    });
  }
  return batches;
}

function validateImportBatches(
  value: unknown,
  slots: readonly GreaterRealmSlotInputV1[],
  resources: readonly GreaterRealmResourceInputV1[],
): void {
  const batches = record(value, 'GREATER_REALM_CHUNK_IMPORT_BATCHES_INVALID');
  exactObjectKeys(
    batches,
    ['castleSlots', 'resourceNodes'],
    'GREATER_REALM_CHUNK_IMPORT_BATCHES_INVALID',
  );
  const expected = {
    castleSlots: expectedImportBatchDescriptors(slots, GREATER_REALM_MAX_SLOT_IMPORT_ROWS),
    resourceNodes: expectedImportBatchDescriptors(resources, GREATER_REALM_MAX_RESOURCE_IMPORT_ROWS),
  };
  if (JSON.stringify(batches) !== JSON.stringify(expected)) {
    fail('GREATER_REALM_CHUNK_IMPORT_BATCHES_MISMATCH');
  }
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

export function importGreaterRealmChunkPayloadV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  payloadSha256: string,
  payloadJson: string,
): 'inserted' | 'unchanged' {
  let release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  requireGreaterRealmSha256(payloadSha256, 'GREATER_REALM_CHUNK_SHA_INVALID');
  const payloadBytes = requireGreaterRealmChunkPayloadBytesV1(payloadJson);
  if (sha256Hex(payloadBytes) !== payloadSha256) {
    fail('GREATER_REALM_CHUNK_PAYLOAD_SHA_MISMATCH');
  }
  const payload = parseCanonicalJsonObject(payloadJson, 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  exactObjectKeys(payload, [
    'schema', 'publicReleaseId', 'chunkHandle', 'importOrdinal', 'cells',
    'apronCellKeys', 'lod1CellKeys', 'lod2CellKeys', 'lod3CellKeys',
    'castleSlots', 'resourceNodes', 'importBatches', 'sectionDigests',
  ], 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  const chunkHandle = stringField(payload, 'chunkHandle', 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  const importOrdinal = numberField(payload, 'importOrdinal', 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  requireGreaterRealmChunkHandle(chunkHandle);
  if (
    payload.schema !== 'warpkeep.greater-realm.runtime-import-chunk.v1'
    || payload.publicReleaseId !== release.publicReleaseId
    || importOrdinal >= release.expectedChunkCount
  ) fail('GREATER_REALM_CHUNK_RELEASE_MISMATCH');
  const existing = ctx.db.greaterRealmChunkV1.chunkHandle.find(chunkHandle);
  if (existing !== null) {
    if (existing.payloadSha256 !== payloadSha256 || existing.payloadJson !== payloadJson) {
      fail('GREATER_REALM_CHUNK_RETRY_MISMATCH');
    }
    return 'unchanged';
  }
  if (importOrdinal !== release.nextChunkOrdinal) fail('GREATER_REALM_CHUNK_IMPORT_OUT_OF_ORDER');
  if (
    !Array.isArray(payload.cells)
    || payload.cells.length < 1
    || payload.cells.length > GREATER_REALM_MAX_CHUNK_CORE_CELLS
  ) {
    fail('GREATER_REALM_CHUNK_CELL_COUNT_INVALID');
  }
  const cells = payload.cells.map(parseRuntimeCell);
  if (cells.some(row => row.atlasId !== atlasId || row.chunkHandle !== chunkHandle)) {
    fail('GREATER_REALM_CHUNK_CELL_BINDING_INVALID');
  }
  for (let index = 1; index < cells.length; index += 1) {
    if (cells[index]!.releaseOrdinal !== cells[index - 1]!.releaseOrdinal + 1) {
      fail('GREATER_REALM_CHUNK_CELL_ORDER_INVALID');
    }
  }
  const apron = stringArray(
    payload.apronCellKeys,
    GREATER_REALM_MAX_CHUNK_APRON_CELLS,
    'GREATER_REALM_CHUNK_APRON_INVALID',
    0,
  );
  const lod1 = stringArray(payload.lod1CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const lod2 = stringArray(payload.lod2CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const lod3 = stringArray(payload.lod3CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const coreKeys = new Set(cells.map(row => row.cellKey));
  const visible = new Set([...coreKeys, ...apron]);
  subsetOf(lod1, visible, 'GREATER_REALM_CHUNK_LOD_INVALID');
  subsetOf(lod2, new Set(lod1), 'GREATER_REALM_CHUNK_LOD_INVALID');
  subsetOf(lod3, new Set(lod2), 'GREATER_REALM_CHUNK_LOD_INVALID');
  if (
    visible.size !== cells.length + apron.length
    || visible.size > GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS
    || !lod1.some(key => coreKeys.has(key))
    || !lod2.some(key => coreKeys.has(key))
    || !lod3.some(key => coreKeys.has(key))
    || lod2.length > lod1.length
    || lod3.length > lod2.length
  ) {
    fail('GREATER_REALM_CHUNK_LOD_INVALID');
  }
  if (!Array.isArray(payload.castleSlots) || payload.castleSlots.length > 128) {
    fail('GREATER_REALM_CHUNK_SLOT_COUNT_INVALID');
  }
  if (!Array.isArray(payload.resourceNodes) || payload.resourceNodes.length > 256) {
    fail('GREATER_REALM_CHUNK_RESOURCE_COUNT_INVALID');
  }
  const slots = payload.castleSlots.map(parseRuntimeSlot);
  const resources = payload.resourceNodes.map(parseRuntimeResource);
  if (
    new Set(slots.map(row => row.slotId)).size !== slots.length
    || new Set(resources.map(row => row.nodeId)).size !== resources.length
  ) fail('GREATER_REALM_CHUNK_CHILD_DUPLICATE');
  validateImportBatches(payload.importBatches, slots, resources);
  if (
    slots.some(row => !coreKeys.has(row.cellKey) || row.atlasId !== atlasId)
    || resources.some(row => !coreKeys.has(row.cellKey) || row.atlasId !== atlasId)
  ) fail('GREATER_REALM_CHUNK_CHILD_BINDING_INVALID');
  const resourceLocationCounts = new Map<string, number>();
  for (const resource of resources) {
    const nextCount = (resourceLocationCounts.get(resource.locationId) ?? 0) + 1;
    if (nextCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION) {
      fail('GREATER_REALM_CHUNK_RESOURCE_LOCATION_CAPACITY_INVALID');
    }
    resourceLocationCounts.set(resource.locationId, nextCount);
  }
  if (resourceLocationCounts.size > 128) {
    fail('GREATER_REALM_CHUNK_RESOURCE_LOCATION_COUNT_INVALID');
  }
  const digests = record(payload.sectionDigests, 'GREATER_REALM_CHUNK_SECTION_DIGEST_INVALID');
  exactObjectKeys(digests, [
    'cellsSha256', 'apronSha256', 'lodSha256', 'castleSlotsSha256', 'resourceNodesSha256',
  ], 'GREATER_REALM_CHUNK_SECTION_DIGEST_INVALID');
  const expectedDigests = {
    cellsSha256: sha256Hex(canonicalJsonBytes(payload.cells)),
    apronSha256: sha256Hex(canonicalJsonBytes(payload.apronCellKeys)),
    lodSha256: sha256Hex(canonicalJsonBytes({ lod1, lod2, lod3 })),
    castleSlotsSha256: sha256Hex(canonicalJsonBytes(payload.castleSlots)),
    resourceNodesSha256: sha256Hex(canonicalJsonBytes(payload.resourceNodes)),
  };
  for (const [key, expected] of Object.entries(expectedDigests)) {
    if (digests[key] !== expected) fail('GREATER_REALM_CHUNK_SECTION_DIGEST_MISMATCH');
  }
  const first = cells[0]!;
  const binQ = floorDiv(first.atlasQ, 15);
  const binR = floorDiv(first.atlasR, 15);
  if (cells.some(cell => floorDiv(cell.atlasQ, 15) !== binQ || floorDiv(cell.atlasR, 15) !== binR)) {
    fail('GREATER_REALM_CHUNK_BIN_CLOSURE_INVALID');
  }
  const chunk: GreaterRealmChunkInputV1 = {
    chunkHandle,
    atlasId,
    chunkCoordKey: `B:${binQ}:${binR}`,
    importOrdinal,
    binQ,
    binR,
    firstCellOrdinal: first.releaseOrdinal,
    coreCellCount: cells.length,
    apronCellCount: apron.length,
    lod0CellCount: cells.length,
    lod1CellCount: lod1.length,
    lod2CellCount: lod2.length,
    lod3CellCount: lod3.length,
    payloadSha256,
  };
  validateGreaterRealmChunkInputV1(chunk);
  ctx.db.greaterRealmChunkV1.insert({ ...chunk, payloadJson, importedAt: ctx.timestamp });
  importGreaterRealmCellsV1(ctx, atlasId, importEpoch, cells);
  if (slots.length > 0) importGreaterRealmSlotsV1(ctx, atlasId, importEpoch, slots);
  if (resources.length > 0) importGreaterRealmResourcesV1(ctx, atlasId, importEpoch, resources);
  const releaseHash = Sha256.deserialize(release.verificationDigest);
  updateLengthFramedSha256(releaseHash, new TextEncoder().encode(payloadJson));
  release = {
    ...release,
    nextChunkOrdinal: release.nextChunkOrdinal + 1,
    importedPassableCellCount: release.importedPassableCellCount
      + cells.filter(cell => cell.passable).length,
    verificationDigest: releaseHash.serialize(),
  };
  ctx.db.greaterRealmReleaseV1.atlasId.update(release);
  return 'inserted';
}

const CELL_IMPORT_KEYS = Object.freeze([
  'cellKey', 'atlasCoordKey', 'releaseOrdinal', 'atlasId', 'chunkHandle',
  'regionId', 'componentKey', 'localQ', 'localR', 'atlasQ', 'atlasR', 'tier',
  'passable', 'elevation', 'slope', 'aspect', 'profileCurvature', 'planCurvature',
  'ridgeId', 'geologicalBarrierBand', 'biomeClass', 'landformClass', 'yieldClass',
  'movementCost', 'sealedBoundaryMask', 'hydroRegime', 'hydroBodyId',
  'hydroDepthClass', 'hydroSurfaceMilli', 'hydroFlowDirection', 'flowAccumulation',
  'bankVariant', 'hydrologyRevision', 'routeParentDirection', 'routeDepth',
  'travelClass', 'wetness', 'exposure', 'coastDistance', 'freshwaterDistance',
  'temperature', 'moisture', 'habitatClass', 'canopyBasisPoints',
  'groundcoverBasisPoints', 'wildflowerBasisPoints', 'featureClass',
  'ambienceClass', 'presentationVariant',
] as const);

export function importGreaterRealmCellsV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  rows: readonly GreaterRealmCellImportV1[],
): number {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  requireBoundedGreaterRealmBatch(
    rows.length,
    GREATER_REALM_MAX_CELL_IMPORT_ROWS,
    'GREATER_REALM_CELL_BATCH_INVALID',
  );
  let inserted = 0;
  for (const row of [...rows].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal)) {
    validateGreaterRealmCellImportV1(row);
    if (row.atlasId !== atlasId || row.releaseOrdinal >= release.expectedCellCount) {
      fail('GREATER_REALM_CELL_RELEASE_MISMATCH');
    }
    const existing = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
    if (existing !== null) {
      if (!rowMatches(
        existing as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        CELL_IMPORT_KEYS,
      )) fail('GREATER_REALM_CELL_RETRY_MISMATCH');
      continue;
    }
    if (BigInt(row.releaseOrdinal) !== ctx.db.greaterRealmCellV1.count()) {
      fail('GREATER_REALM_CELL_IMPORT_OUT_OF_ORDER');
    }
    const chunk = ctx.db.greaterRealmChunkV1.chunkHandle.find(row.chunkHandle);
    if (chunk === null || chunk.atlasId !== atlasId) fail('GREATER_REALM_CELL_CHUNK_INVALID');
    if (row.componentKey !== undefined) {
      const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
      if (component === null || component.atlasId !== atlasId) {
        fail('GREATER_REALM_CELL_COMPONENT_INVALID');
      }
      if (component.importedCellCount >= component.expectedCellCount) {
        fail('GREATER_REALM_COMPONENT_CELL_OVERFLOW');
      }
      ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
        ...component,
        importedCellCount: component.importedCellCount + 1,
      });
    }
    ctx.db.greaterRealmCellV1.insert({
      ...row,
      componentKey: row.componentKey,
      ridgeId: row.ridgeId,
      hydroBodyId: row.hydroBodyId,
      hydroFlowDirection: row.hydroFlowDirection,
      routeParentDirection: row.routeParentDirection,
      routeDepth: row.routeDepth,
    });
    inserted += 1;
  }
  return inserted;
}

const SLOT_IMPORT_KEYS = Object.freeze([
  'slotId', 'releaseOrdinal', 'atlasId', 'cellKey', 'regionId', 'componentKey',
  'legacySlotId', 'tier', 'regionOrderRank', 'allocationRank', 'active',
] as const);

function assertLegacySlotMapping(ctx: GreaterRealmContext, row: GreaterRealmSlotInputV1): void {
  if (row.legacySlotId === undefined) {
    if (row.regionId === 'T1_LOWLANDS') fail('GREATER_REALM_LOWLANDS_LEGACY_SLOT_MISSING');
    return;
  }
  if (row.regionId !== 'T1_LOWLANDS') fail('GREATER_REALM_LEGACY_SLOT_REGION_INVALID');
  const cell = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
  if (
    !Number.isSafeInteger(row.legacySlotId)
    || row.legacySlotId < 1
    || row.legacySlotId > GREATER_REALM_CASTLES_PER_REGION
    || cell === null
    || cell.regionId !== 'T1_LOWLANDS'
  ) fail('GREATER_REALM_LEGACY_SLOT_MAPPING_INVALID');
}

export function importGreaterRealmSlotsV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  rows: readonly GreaterRealmSlotInputV1[],
): number {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  requireBoundedGreaterRealmBatch(
    rows.length,
    GREATER_REALM_MAX_SLOT_IMPORT_ROWS,
    'GREATER_REALM_SLOT_BATCH_INVALID',
  );
  let inserted = 0;
  for (const row of [...rows].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal)) {
    validateGreaterRealmSlotInputV1(row);
    if (row.atlasId !== atlasId || row.releaseOrdinal >= release.expectedSlotCount) {
      fail('GREATER_REALM_SLOT_RELEASE_MISMATCH');
    }
    const existing = ctx.db.greaterRealmCastleSlotV1.slotId.find(row.slotId);
    if (existing !== null) {
      if (!rowMatches(
        existing as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        SLOT_IMPORT_KEYS,
      )) fail('GREATER_REALM_SLOT_RETRY_MISMATCH');
      continue;
    }
    if (ctx.db.greaterRealmCastleSlotV1.releaseOrdinal.find(row.releaseOrdinal) !== null) {
      fail('GREATER_REALM_SLOT_ORDINAL_CONFLICT');
    }
    const cell = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
    const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
    if (
      cell === null
      || component === null
      || cell.atlasId !== atlasId
      || !cell.passable
      || cell.componentKey !== row.componentKey
      || cell.regionId !== row.regionId
      || component.atlasId !== atlasId
    ) fail('GREATER_REALM_SLOT_REACHABILITY_INVALID');
    assertLegacySlotMapping(ctx, row);
    if (component.importedSlotCount >= component.expectedSlotCount) {
      fail('GREATER_REALM_COMPONENT_SLOT_OVERFLOW');
    }
    ctx.db.greaterRealmCastleSlotV1.insert({ ...row, legacySlotId: row.legacySlotId });
    ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
      ...component,
      importedSlotCount: component.importedSlotCount + 1,
    });
    inserted += 1;
  }
  return inserted;
}

const RESOURCE_IMPORT_KEYS = Object.freeze([
  'nodeId', 'releaseOrdinal', 'atlasId', 'locationId', 'cellKey', 'regionId',
  'componentKey', 'resourceKind', 'tier', 'nodeOrdinal', 'allocationRank',
  'legacyCatalogId', 'policyVersion', 'active',
] as const);

function requireLegacyResourceMapping(
  _ctx: GreaterRealmContext,
  row: GreaterRealmResourceInputV1,
): true | undefined {
  if (row.regionId !== 'T1_LOWLANDS') {
    if (row.legacyCatalogId !== undefined) fail('GREATER_REALM_LEGACY_RESOURCE_REGION_INVALID');
    return undefined;
  }
  if (row.legacyCatalogId === undefined) fail('GREATER_REALM_LOWLANDS_LEGACY_RESOURCE_MISSING');
  requireGreaterRealmOpaqueId(
    row.legacyCatalogId,
    'GREATER_REALM_LEGACY_RESOURCE_CATALOG_INVALID',
  );
  requireGreaterRealmOpaqueId(
    row.policyVersion,
    'GREATER_REALM_RESOURCE_POLICY_INVALID',
  );
  return true;
}

export function importGreaterRealmResourcesV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  rows: readonly GreaterRealmResourceInputV1[],
): number {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  requireBoundedGreaterRealmBatch(
    rows.length,
    GREATER_REALM_MAX_RESOURCE_IMPORT_ROWS,
    'GREATER_REALM_RESOURCE_BATCH_INVALID',
  );
  let inserted = 0;
  for (const row of [...rows].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal)) {
    validateGreaterRealmResourceInputV1(row);
    if (row.atlasId !== atlasId || row.releaseOrdinal >= release.expectedResourceNodeCount) {
      fail('GREATER_REALM_RESOURCE_RELEASE_MISMATCH');
    }
    const existing = ctx.db.greaterRealmResourceNodeV1.nodeId.find(row.nodeId);
    if (existing !== null) {
      if (!rowMatches(
        existing as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        RESOURCE_IMPORT_KEYS,
      )) fail('GREATER_REALM_RESOURCE_RETRY_MISMATCH');
      continue;
    }
    if (ctx.db.greaterRealmResourceNodeV1.releaseOrdinal.find(row.releaseOrdinal) !== null) {
      fail('GREATER_REALM_RESOURCE_ORDINAL_CONFLICT');
    }
    const cell = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
    const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
    if (
      cell === null
      || component === null
      || cell.atlasId !== atlasId
      || !cell.passable
      || cell.componentKey !== row.componentKey
      || cell.regionId !== row.regionId
      || component.atlasId !== atlasId
    ) fail('GREATER_REALM_RESOURCE_REACHABILITY_INVALID');
    requireLegacyResourceMapping(ctx, row);
    const field = row.resourceKind === 'food' ? 'importedFoodNodeCount'
      : row.resourceKind === 'wood' ? 'importedWoodNodeCount'
        : row.resourceKind === 'stone' ? 'importedStoneNodeCount'
          : 'importedGoldNodeCount';
    const expectedField = row.resourceKind === 'food' ? 'expectedFoodNodeCount'
      : row.resourceKind === 'wood' ? 'expectedWoodNodeCount'
        : row.resourceKind === 'stone' ? 'expectedStoneNodeCount'
          : 'expectedGoldNodeCount';
    if (component[field] >= component[expectedField]) fail('GREATER_REALM_COMPONENT_RESOURCE_OVERFLOW');
    ctx.db.greaterRealmResourceNodeV1.insert({ ...row, legacyCatalogId: row.legacyCatalogId });
    ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
      ...component,
      [field]: component[field] + 1,
    });
    inserted += 1;
  }
  return inserted;
}

function aggregateImportsExact(ctx: GreaterRealmContext, release: ReturnType<typeof requireRelease>): boolean {
  if (
    release.regionManifestJson === undefined
    || ctx.db.greaterRealmNavigationComponentV1.count() !== BigInt(release.expectedComponentCount)
    || ctx.db.greaterRealmChunkV1.count() !== BigInt(release.expectedChunkCount)
    || ctx.db.greaterRealmCellV1.count() !== BigInt(release.expectedCellCount)
    || ctx.db.greaterRealmCastleSlotV1.count() !== BigInt(release.expectedSlotCount)
    || ctx.db.greaterRealmResourceNodeV1.count() !== BigInt(release.expectedResourceNodeCount)
    || release.nextChunkOrdinal !== release.expectedChunkCount
    || release.componentExpectedCellCount !== release.importedPassableCellCount
    || release.componentExpectedSlotCount !== release.expectedSlotCount
    || release.componentExpectedResourceNodeCount !== release.expectedResourceNodeCount
  ) return false;
  return true;
}

function runtimeComponentManifest(
  release: ReturnType<typeof requireRelease>,
): Readonly<Record<string, unknown>>[] {
  const rows = parseCanonicalJsonArray(
    release.componentManifestJson,
    'GREATER_REALM_COMPONENT_MANIFEST_INVALID',
  );
  if (rows.length !== release.expectedComponentCount) {
    fail('GREATER_REALM_COMPONENT_MANIFEST_INVALID');
  }
  return rows.map((value, ordinal) => {
    const row = record(value, 'GREATER_REALM_COMPONENT_MANIFEST_INVALID');
    exactObjectKeys(row, [
      'componentKey', 'componentOrdinal', 'regionMask', 'rootCellKey',
      'expectedCellCount', 'maxRouteDepth', 'expectedSlotCount',
      'expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount',
      'expectedGoldNodeCount', 'componentSha256',
    ], 'GREATER_REALM_COMPONENT_MANIFEST_INVALID');
    if (numberField(
      row,
      'componentOrdinal',
      'GREATER_REALM_COMPONENT_MANIFEST_INVALID',
    ) !== ordinal) fail('GREATER_REALM_COMPONENT_MANIFEST_INVALID');
    return row;
  });
}

function runtimeRegionManifest(release: ReturnType<typeof requireRelease>): GreaterRealmRegionImportV1[] {
  if (release.regionManifestJson === undefined) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
  const parsed = parseCanonicalJsonArray(
    release.regionManifestJson,
    'GREATER_REALM_REGION_MANIFEST_INVALID',
  );
  if (parsed.length !== GREATER_REALM_VISIBLE_REGION_COUNT) {
    fail('GREATER_REALM_REGION_MANIFEST_COUNT_INVALID');
  }
  return parsed.map((value, index) => {
    const row = record(value, 'GREATER_REALM_REGION_MANIFEST_INVALID');
    exactObjectKeys(row, [
      'regionId', 'publicName', 'ordinal', 'tier', 'cellCount', 'passableCellCount',
      'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
      'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount', 'active',
    ], 'GREATER_REALM_REGION_MANIFEST_INVALID');
    const result: GreaterRealmRegionImportV1 = {
      regionId: stringField(row, 'regionId', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      publicName: stringField(row, 'publicName', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      ordinal: numberField(row, 'ordinal', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      tier: numberField(row, 'tier', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      cellCount: numberField(row, 'cellCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      passableCellCount: numberField(row, 'passableCellCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      chunkCount: numberField(row, 'chunkCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      castleCapacity: numberField(row, 'castleCapacity', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      resourceLocationCount: numberField(row, 'resourceLocationCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      resourceNodeCount: numberField(row, 'resourceNodeCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      foodNodeCount: numberField(row, 'foodNodeCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      woodNodeCount: numberField(row, 'woodNodeCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      stoneNodeCount: numberField(row, 'stoneNodeCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      goldNodeCount: numberField(row, 'goldNodeCount', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
      active: booleanField(row, 'active', 'GREATER_REALM_REGION_MANIFEST_INVALID'),
    };
    const expected = GREATER_REALM_PUBLIC_REGIONS[index];
    if (
      expected === undefined
      || result.regionId !== expected.id
      || result.publicName !== expected.name
      || result.ordinal !== expected.ordinal
      || result.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || result.active
    ) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
    return result;
  });
}

const REGION_VERIFICATION_FIELDS = Object.freeze([
  'verifiedCellCount',
  'verifiedPassableCellCount',
  'verifiedChunkCount',
  'verifiedCastleCapacity',
  'verifiedResourceLocationCount',
  'verifiedResourceNodeCount',
  'verifiedFoodNodeCount',
  'verifiedWoodNodeCount',
  'verifiedStoneNodeCount',
  'verifiedGoldNodeCount',
] as const);

type RegionVerificationField = typeof REGION_VERIFICATION_FIELDS[number];
type RegionVerificationRow = Readonly<{ regionId: string } & Record<RegionVerificationField, number>>;

function runtimeRegionVerification(release: ReturnType<typeof requireRelease>): RegionVerificationRow[] {
  const parsed = parseCanonicalJsonArray(
    release.regionVerificationJson,
    'GREATER_REALM_REGION_VERIFICATION_INVALID',
  );
  if (parsed.length !== GREATER_REALM_VISIBLE_REGION_COUNT) {
    fail('GREATER_REALM_REGION_VERIFICATION_INVALID');
  }
  return parsed.map((value, index) => {
    const row = record(value, 'GREATER_REALM_REGION_VERIFICATION_INVALID');
    exactObjectKeys(
      row,
      ['regionId', ...REGION_VERIFICATION_FIELDS],
      'GREATER_REALM_REGION_VERIFICATION_INVALID',
    );
    const expected = GREATER_REALM_PUBLIC_REGIONS[index];
    const regionId = stringField(row, 'regionId', 'GREATER_REALM_REGION_VERIFICATION_INVALID');
    if (expected === undefined || regionId !== expected.id) {
      fail('GREATER_REALM_REGION_VERIFICATION_INVALID');
    }
    return {
      regionId,
      verifiedCellCount: numberField(row, 'verifiedCellCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedPassableCellCount: numberField(row, 'verifiedPassableCellCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedChunkCount: numberField(row, 'verifiedChunkCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedCastleCapacity: numberField(row, 'verifiedCastleCapacity', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedResourceLocationCount: numberField(row, 'verifiedResourceLocationCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedResourceNodeCount: numberField(row, 'verifiedResourceNodeCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedFoodNodeCount: numberField(row, 'verifiedFoodNodeCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedWoodNodeCount: numberField(row, 'verifiedWoodNodeCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedStoneNodeCount: numberField(row, 'verifiedStoneNodeCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
      verifiedGoldNodeCount: numberField(row, 'verifiedGoldNodeCount', 'GREATER_REALM_REGION_VERIFICATION_INVALID'),
    };
  });
}

const REGION_EXPECTED_FIELD = Object.freeze({
  verifiedCellCount: 'cellCount',
  verifiedPassableCellCount: 'passableCellCount',
  verifiedChunkCount: 'chunkCount',
  verifiedCastleCapacity: 'castleCapacity',
  verifiedResourceLocationCount: 'resourceLocationCount',
  verifiedResourceNodeCount: 'resourceNodeCount',
  verifiedFoodNodeCount: 'foodNodeCount',
  verifiedWoodNodeCount: 'woodNodeCount',
  verifiedStoneNodeCount: 'stoneNodeCount',
  verifiedGoldNodeCount: 'goldNodeCount',
} as const);

function incrementRegionVerification(
  ctx: GreaterRealmContext,
  atlasId: string,
  regionId: string,
  deltas: Readonly<Partial<Record<RegionVerificationField, number>>>,
): void {
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(atlasId);
  if (release === null || release.state !== 'verifying') fail('GREATER_REALM_RELEASE_STATE_INVALID');
  const manifest = runtimeRegionManifest(release);
  const rows = runtimeRegionVerification(release);
  const index = GREATER_REALM_PUBLIC_REGIONS.findIndex(region => region.id === regionId);
  const current = rows[index];
  const expected = manifest[index];
  if (current === undefined || expected === undefined) fail('GREATER_REALM_VERIFY_REGION_MISSING');
  const next = { ...current };
  for (const field of REGION_VERIFICATION_FIELDS) {
    const delta = deltas[field] ?? 0;
    requireGreaterRealmSafeInteger(delta, 0, 1, 'GREATER_REALM_REGION_VERIFICATION_DELTA_INVALID');
    const value = current[field] + delta;
    const expectedValue = expected[REGION_EXPECTED_FIELD[field]];
    requireGreaterRealmSafeInteger(value, 0, expectedValue, 'GREATER_REALM_REGION_VERIFICATION_OVERFLOW');
    next[field] = value;
  }
  rows[index] = next;
  ctx.db.greaterRealmReleaseV1.atlasId.update({
    ...release,
    regionVerificationJson: `${JSON.stringify(rows)}\n`,
  });
}

function assertRegionManifestTotals(ctx: GreaterRealmContext, release: ReturnType<typeof requireRelease>): void {
  const manifest = runtimeRegionManifest(release);
  let cells = 0;
  let passable = 0;
  let slots = 0;
  let resources = 0;
  for (const row of manifest) {
    cells += row.cellCount;
    passable += row.passableCellCount;
    slots += row.castleCapacity;
    resources += row.resourceNodeCount;
  }
  if (
    cells !== release.expectedCellCount
    || passable !== release.componentExpectedCellCount
    || slots !== release.expectedSlotCount
    || resources !== release.expectedResourceNodeCount
  ) fail('GREATER_REALM_REGION_TOTALS_INVALID');
}

export function beginGreaterRealmVerificationV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
): void {
  const release = requireRelease(ctx, atlasId, importEpoch, ['importing']);
  if (!aggregateImportsExact(ctx, release)) fail('GREATER_REALM_IMPORT_INCOMPLETE');
  assertRegionManifestTotals(ctx, release);
  if (
    ctx.db.realmAtlasV1.count() !== 0n
    || ctx.db.realmAtlasVisibleRegionV1.count() !== 0n
    || ctx.db.realmWorkerSystemV2.count() !== 0n
    || ctx.db.greaterRealmActivationV1.count() !== 0n
    || ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
  ) fail('GREATER_REALM_ACTIVATION_STATE_NOT_EMPTY');
  const legacyOrigin = ctx.db.greaterRealmCellV1.cellKey.find('T1_LOWLANDS:0:0');
  if (
    legacyOrigin === null
    || legacyOrigin.regionId !== 'T1_LOWLANDS'
    || legacyOrigin.localQ !== 0
    || legacyOrigin.localR !== 0
  ) fail('GREATER_REALM_LEGACY_ORIGIN_MISSING');
  const releaseHash = Sha256.deserialize(release.verificationDigest);
  updateLengthFramedSha256(releaseHash, canonicalJsonBytes(runtimeComponentManifest(release)));
  updateLengthFramedSha256(releaseHash, canonicalJsonBytes(runtimeRegionManifest(release)));
  const computedReleaseSha256 = releaseHash.digestHex();
  if (computedReleaseSha256 !== release.expectedReleaseSha256) {
    fail('GREATER_REALM_RELEASE_SHA_MISMATCH');
  }
  ctx.db.greaterRealmReleaseV1.atlasId.update({
    ...release,
    state: 'verifying',
    verificationPhase: 'components',
    verificationCursor: 0n,
    verificationDigest: initializeVerificationDigest(),
    legacyTransformOffsetQ: legacyOrigin.atlasQ,
    legacyTransformOffsetR: legacyOrigin.atlasR,
  });
}

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, 1]),
] as const);

function verifyComponent(ctx: GreaterRealmContext, ordinal: number) {
  const row = ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(ordinal);
  if (row === null) fail('GREATER_REALM_VERIFY_COMPONENT_MISSING');
  validateGreaterRealmComponentInputV1(row);
  if (
    row.importedCellCount !== row.expectedCellCount
    || row.importedSlotCount !== row.expectedSlotCount
    || row.importedFoodNodeCount !== row.expectedFoodNodeCount
    || row.importedWoodNodeCount !== row.expectedWoodNodeCount
    || row.importedStoneNodeCount !== row.expectedStoneNodeCount
    || row.importedGoldNodeCount !== row.expectedGoldNodeCount
    || row.verificationPhase !== 'cells'
    || row.active
  ) fail('GREATER_REALM_VERIFY_COMPONENT_COUNTS_INVALID');
  const root = ctx.db.greaterRealmCellV1.cellKey.find(row.rootCellKey);
  if (
    root === null
    || root.componentKey !== row.componentKey
    || !root.passable
    || root.routeDepth !== 0
    || root.routeParentDirection !== undefined
  ) fail('GREATER_REALM_COMPONENT_ROOT_INVALID');
  return row;
}

function updateComponentDigest(
  component: ReturnType<typeof verifyComponent>,
  value: Readonly<Record<string, unknown>>,
): string {
  const hash = Sha256.deserialize(component.verificationDigest);
  updateLengthFramedSha256(hash, canonicalJsonBytes(value));
  return hash.serialize();
}

type ComponentRegionCountField =
  | 'slotCount'
  | 'foodNodeCount'
  | 'woodNodeCount'
  | 'stoneNodeCount'
  | 'goldNodeCount';

function componentRegionVerificationRows(component: {
  regionVerificationJson: string;
}): Array<Record<'regionId' | ComponentRegionCountField, string | number>> {
  const values = parseCanonicalJsonArray(
    component.regionVerificationJson,
    'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID',
  );
  if (values.length !== GREATER_REALM_VISIBLE_REGION_COUNT) {
    fail('GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID');
  }
  return values.map((value, ordinal) => {
    const row = record(value, 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID');
    exactObjectKeys(row, [
      'regionId', 'slotCount', 'foodNodeCount', 'woodNodeCount',
      'stoneNodeCount', 'goldNodeCount',
    ], 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID');
    const expected = GREATER_REALM_PUBLIC_REGIONS[ordinal];
    const regionId = stringField(
      row,
      'regionId',
      'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID',
    );
    if (expected === undefined || regionId !== expected.id) {
      fail('GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID');
    }
    return {
      regionId,
      slotCount: numberField(row, 'slotCount', 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID'),
      foodNodeCount: numberField(row, 'foodNodeCount', 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID'),
      woodNodeCount: numberField(row, 'woodNodeCount', 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID'),
      stoneNodeCount: numberField(row, 'stoneNodeCount', 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID'),
      goldNodeCount: numberField(row, 'goldNodeCount', 'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID'),
    };
  });
}

function incrementComponentRegionVerification(
  component: { regionVerificationJson: string },
  regionId: string,
  field: ComponentRegionCountField,
): string {
  const rows = componentRegionVerificationRows(component);
  const ordinal = requireGreaterRealmPublicRegion(regionId).ordinal;
  const row = rows[ordinal]!;
  const current = row[field];
  if (typeof current !== 'number') fail('GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID');
  requireGreaterRealmSafeInteger(
    current,
    0,
    1_000_000 - 1,
    'GREATER_REALM_COMPONENT_REGION_VERIFICATION_INVALID',
  );
  row[field] = current + 1;
  return `${JSON.stringify(rows)}\n`;
}

function advanceComponentToSlots(ctx: GreaterRealmContext, ordinal: number) {
  const component = ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(ordinal);
  if (
    component === null
    || component.verificationPhase !== 'cells'
    || component.verifiedCellCount !== component.expectedCellCount
  ) fail('GREATER_REALM_COMPONENT_VERIFIED_CELL_COUNT_INVALID');
  const updated = {
    ...component,
    verificationPhase: 'castle-slots',
    verificationDigest: updateComponentDigest(component, {
      section: 'castle-slots',
      count: component.expectedSlotCount,
    }),
  };
  ctx.db.greaterRealmNavigationComponentV1.componentKey.update(updated);
  return updated;
}

function advanceComponentToResources(ctx: GreaterRealmContext, ordinal: number) {
  const component = ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(ordinal);
  if (
    component === null
    || component.verificationPhase !== 'castle-slots'
    || component.verifiedSlotCount !== component.expectedSlotCount
  ) fail('GREATER_REALM_COMPONENT_VERIFIED_SLOT_COUNT_INVALID');
  const expectedResourceCount = component.expectedFoodNodeCount
    + component.expectedWoodNodeCount
    + component.expectedStoneNodeCount
    + component.expectedGoldNodeCount;
  const updated = {
    ...component,
    verificationPhase: 'resource-nodes',
    verificationDigest: updateComponentDigest(component, {
      section: 'resource-nodes',
      count: expectedResourceCount,
    }),
  };
  ctx.db.greaterRealmNavigationComponentV1.componentKey.update(updated);
  return updated;
}

function finalizeComponentDigest(ctx: GreaterRealmContext, ordinal: number) {
  const component = ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(ordinal);
  if (
    component === null
    || component.verificationPhase !== 'resource-nodes'
    || component.verifiedFoodNodeCount !== component.expectedFoodNodeCount
    || component.verifiedWoodNodeCount !== component.expectedWoodNodeCount
    || component.verifiedStoneNodeCount !== component.expectedStoneNodeCount
    || component.verifiedGoldNodeCount !== component.expectedGoldNodeCount
    || component.verifiedRegionMask !== component.regionMask
    || component.verifiedMaxRouteDepth !== component.maxRouteDepth
  ) fail('GREATER_REALM_COMPONENT_VERIFIED_RESOURCE_COUNT_INVALID');
  for (const region of componentRegionVerificationRows(component)) {
    const minimum = Number(region.slotCount) * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT;
    if (
      Number(region.foodNodeCount) < minimum
      || Number(region.woodNodeCount) < minimum
      || Number(region.stoneNodeCount) < minimum
      || Number(region.goldNodeCount) < minimum
    ) fail('GREATER_REALM_COMPONENT_REGION_RESOURCE_MARGIN_INVALID');
  }
  const digest = Sha256.deserialize(component.verificationDigest).digestHex();
  if (digest !== component.componentSha256) fail('GREATER_REALM_COMPONENT_SHA_MISMATCH');
  const updated = {
    ...component,
    verificationPhase: 'complete',
    verificationDigest: digest,
    active: true,
  };
  ctx.db.greaterRealmNavigationComponentV1.componentKey.update(updated);
  return updated;
}

function verifyChunk(ctx: GreaterRealmContext, ordinal: number) {
  const row = ctx.db.greaterRealmChunkV1.importOrdinal.find(ordinal);
  if (row === null) fail('GREATER_REALM_VERIFY_CHUNK_MISSING');
  validateGreaterRealmChunkInputV1(row);
  if (sha256Hex(new TextEncoder().encode(row.payloadJson)) !== row.payloadSha256) {
    fail('GREATER_REALM_CHUNK_PAYLOAD_SHA_MISMATCH');
  }
  const payload = parseCanonicalJsonObject(row.payloadJson, 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  exactObjectKeys(payload, [
    'schema', 'publicReleaseId', 'chunkHandle', 'importOrdinal', 'cells',
    'apronCellKeys', 'lod1CellKeys', 'lod2CellKeys', 'lod3CellKeys',
    'castleSlots', 'resourceNodes', 'importBatches', 'sectionDigests',
  ], 'GREATER_REALM_CHUNK_PAYLOAD_INVALID');
  if (
    payload.schema !== 'warpkeep.greater-realm.runtime-import-chunk.v1'
    || payload.chunkHandle !== row.chunkHandle
    || payload.importOrdinal !== row.importOrdinal
    || !Array.isArray(payload.cells)
    || !Array.isArray(payload.castleSlots)
    || !Array.isArray(payload.resourceNodes)
  ) fail('GREATER_REALM_CHUNK_PAYLOAD_BINDING_INVALID');
  const cells = payload.cells.map(parseRuntimeCell);
  const slots = payload.castleSlots.map(parseRuntimeSlot);
  const resources = payload.resourceNodes.map(parseRuntimeResource);
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(row.atlasId);
  if (
    release === null
    || payload.publicReleaseId !== release.publicReleaseId
    || new Set(slots.map(slot => slot.slotId)).size !== slots.length
    || new Set(resources.map(node => node.nodeId)).size !== resources.length
  ) fail('GREATER_REALM_CHUNK_PAYLOAD_BINDING_INVALID');
  validateImportBatches(payload.importBatches, slots, resources);
  const apron = stringArray(
    payload.apronCellKeys,
    GREATER_REALM_MAX_CHUNK_APRON_CELLS,
    'GREATER_REALM_CHUNK_APRON_INVALID',
    0,
  );
  const lod1 = stringArray(payload.lod1CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const lod2 = stringArray(payload.lod2CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const lod3 = stringArray(payload.lod3CellKeys, GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS, 'GREATER_REALM_CHUNK_LOD_INVALID');
  const coreKeys = new Set(cells.map(cell => cell.cellKey));
  const visible = new Set([...coreKeys, ...apron]);
  subsetOf(lod1, visible, 'GREATER_REALM_CHUNK_LOD_INVALID');
  subsetOf(lod2, new Set(lod1), 'GREATER_REALM_CHUNK_LOD_INVALID');
  subsetOf(lod3, new Set(lod2), 'GREATER_REALM_CHUNK_LOD_INVALID');
  const digests = record(payload.sectionDigests, 'GREATER_REALM_CHUNK_SECTION_DIGEST_INVALID');
  const expectedDigests = {
    cellsSha256: sha256Hex(canonicalJsonBytes(payload.cells)),
    apronSha256: sha256Hex(canonicalJsonBytes(payload.apronCellKeys)),
    lodSha256: sha256Hex(canonicalJsonBytes({ lod1, lod2, lod3 })),
    castleSlotsSha256: sha256Hex(canonicalJsonBytes(payload.castleSlots)),
    resourceNodesSha256: sha256Hex(canonicalJsonBytes(payload.resourceNodes)),
  };
  exactObjectKeys(
    digests,
    ['cellsSha256', 'apronSha256', 'lodSha256', 'castleSlotsSha256', 'resourceNodesSha256'],
    'GREATER_REALM_CHUNK_SECTION_DIGEST_INVALID',
  );
  if (Object.entries(expectedDigests).some(([key, value]) => digests[key] !== value)) {
    fail('GREATER_REALM_CHUNK_SECTION_DIGEST_MISMATCH');
  }
  if (
    cells.length !== row.coreCellCount
    || apron.length !== row.apronCellCount
    || cells.length + apron.length > GREATER_REALM_MAX_CHUNK_VISIBLE_CELLS
    || lod1.length !== row.lod1CellCount
    || lod2.length !== row.lod2CellCount
    || lod3.length !== row.lod3CellCount
    || !lod1.some(key => coreKeys.has(key))
    || !lod2.some(key => coreKeys.has(key))
    || !lod3.some(key => coreKeys.has(key))
  ) fail('GREATER_REALM_CHUNK_PAYLOAD_COUNT_MISMATCH');
  const first = cells[0];
  if (first === undefined) fail('GREATER_REALM_CHUNK_CELL_COUNT_INVALID');
  const expectedBinQ = floorDiv(first.atlasQ, 15);
  const expectedBinR = floorDiv(first.atlasR, 15);
  if (
    row.binQ !== expectedBinQ
    || row.binR !== expectedBinR
    || row.chunkCoordKey !== `B:${expectedBinQ}:${expectedBinR}`
    || cells.some(cell => (
      cell.chunkHandle !== row.chunkHandle
      || floorDiv(cell.atlasQ, 15) !== expectedBinQ
      || floorDiv(cell.atlasR, 15) !== expectedBinR
    ))
  ) fail('GREATER_REALM_CHUNK_BIN_CLOSURE_INVALID');
  const payloadSlotIds = new Set(slots.map(slot => slot.slotId));
  const payloadNodeIds = new Set(resources.map(node => node.nodeId));
  const expectedApron = new Set<string>();
  let storedSlotCount = 0;
  let storedResourceCount = 0;
  for (let index = 0; index < cells.length; index += 1) {
    const expectedCell = cells[index]!;
    const storedCell = ctx.db.greaterRealmCellV1.cellKey.find(expectedCell.cellKey);
    if (
      storedCell === null
      || JSON.stringify(runtimeCellRecord(storedCell)) !== JSON.stringify(payload.cells[index])
    ) fail('GREATER_REALM_CHUNK_STORED_CELL_MISMATCH');
    for (const [dq, dr] of AXIAL_DIRECTIONS) {
      const neighbor = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
        `A:${storedCell.atlasQ + dq}:${storedCell.atlasR + dr}`,
      );
      if (
        neighbor !== null
        && neighbor.tier === GREATER_REALM_VISIBLE_TIER_MAX
        && neighbor.chunkHandle !== row.chunkHandle
      ) expectedApron.add(neighbor.cellKey);
    }
    const storedSlot = ctx.db.greaterRealmCastleSlotV1.cellKey.find(storedCell.cellKey);
    if (storedSlot !== null) {
      storedSlotCount += 1;
      if (!payloadSlotIds.has(storedSlot.slotId)) fail('GREATER_REALM_CHUNK_STORED_SLOT_MISMATCH');
    }
    for (const storedNode of ctx.db.greaterRealmResourceNodeV1.cellKey.filter(storedCell.cellKey)) {
      storedResourceCount += 1;
      if (storedResourceCount > resources.length || !payloadNodeIds.has(storedNode.nodeId)) {
        fail('GREATER_REALM_CHUNK_STORED_RESOURCE_MISMATCH');
      }
    }
  }
  if (storedSlotCount !== slots.length || storedResourceCount !== resources.length) {
    fail('GREATER_REALM_CHUNK_STORED_CHILD_COUNT_MISMATCH');
  }
  if (
    expectedApron.size !== apron.length
    || apron.some(cellKey => !expectedApron.has(cellKey))
  ) fail('GREATER_REALM_CHUNK_APRON_CLOSURE_INVALID');
  for (let index = 0; index < slots.length; index += 1) {
    const stored = ctx.db.greaterRealmCastleSlotV1.slotId.find(slots[index]!.slotId);
    if (stored === null || JSON.stringify(runtimeSlotRecord(stored)) !== JSON.stringify(payload.castleSlots[index])) {
      fail('GREATER_REALM_CHUNK_STORED_SLOT_MISMATCH');
    }
  }
  for (let index = 0; index < resources.length; index += 1) {
    const stored = ctx.db.greaterRealmResourceNodeV1.nodeId.find(resources[index]!.nodeId);
    if (stored === null || JSON.stringify(runtimeResourceRecord(stored)) !== JSON.stringify(payload.resourceNodes[index])) {
      fail('GREATER_REALM_CHUNK_STORED_RESOURCE_MISMATCH');
    }
  }
  for (const cellKey of apron) {
    const apronCell = ctx.db.greaterRealmCellV1.cellKey.find(cellKey);
    if (apronCell === null || apronCell.tier !== GREATER_REALM_VISIBLE_TIER_MAX) {
      fail('GREATER_REALM_CHUNK_APRON_CLOSURE_INVALID');
    }
  }
  let count = 0;
  let minimum = Number.MAX_SAFE_INTEGER;
  let maximum = -1;
  for (const cell of ctx.db.greaterRealmCellV1.chunkHandle.filter(row.chunkHandle)) {
    count += 1;
    if (count > row.coreCellCount) fail('GREATER_REALM_CHUNK_CELL_COUNT_INVALID');
    minimum = Math.min(minimum, cell.releaseOrdinal);
    maximum = Math.max(maximum, cell.releaseOrdinal);
  }
  if (
    count !== row.coreCellCount
    || minimum !== row.firstCellOrdinal
    || maximum - minimum + 1 !== row.coreCellCount
  ) fail('GREATER_REALM_CHUNK_CELL_RANGE_INVALID');
  return row;
}

function isFirstRegionCellInChunk(ctx: GreaterRealmContext, row: {
  chunkHandle: string;
  regionId: string;
  releaseOrdinal: number;
}): boolean {
  for (const candidate of ctx.db.greaterRealmCellV1.chunkHandle.filter(row.chunkHandle)) {
    if (candidate.regionId === row.regionId && candidate.releaseOrdinal < row.releaseOrdinal) return false;
  }
  return true;
}

function verifyLegacyLowlandsCell(
  _ctx: GreaterRealmContext,
  _row: GreaterRealmCellImportV1,
): boolean {
  return false;
}

function greaterRealmHydrologyRequiresDownstream(regime: number): boolean {
  return regime === GREATER_REALM_HYDRO_REGIME.RIVER
    || regime === GREATER_REALM_HYDRO_REGIME.STREAM;
}

const HYDROLOGY_TRANSITIONS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  [GREATER_REALM_HYDRO_REGIME.OCEAN]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.OCEAN,
  ]),
  [GREATER_REALM_HYDRO_REGIME.LAKE]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.DRY,
    GREATER_REALM_HYDRO_REGIME.LAKE,
    GREATER_REALM_HYDRO_REGIME.RIVER,
    GREATER_REALM_HYDRO_REGIME.STREAM,
    GREATER_REALM_HYDRO_REGIME.OCEAN,
    GREATER_REALM_HYDRO_REGIME.SEA,
  ]),
  [GREATER_REALM_HYDRO_REGIME.RIVER]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.RIVER,
    GREATER_REALM_HYDRO_REGIME.MARSH,
    GREATER_REALM_HYDRO_REGIME.LAKE,
    GREATER_REALM_HYDRO_REGIME.OCEAN,
    GREATER_REALM_HYDRO_REGIME.SEA,
  ]),
  [GREATER_REALM_HYDRO_REGIME.STREAM]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.STREAM,
    GREATER_REALM_HYDRO_REGIME.RIVER,
    GREATER_REALM_HYDRO_REGIME.MARSH,
    GREATER_REALM_HYDRO_REGIME.LAKE,
    GREATER_REALM_HYDRO_REGIME.OCEAN,
    GREATER_REALM_HYDRO_REGIME.SEA,
  ]),
  [GREATER_REALM_HYDRO_REGIME.SEA]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.SEA,
    GREATER_REALM_HYDRO_REGIME.OCEAN,
  ]),
  [GREATER_REALM_HYDRO_REGIME.MARSH]: Object.freeze([
    GREATER_REALM_HYDRO_REGIME.DRY,
    GREATER_REALM_HYDRO_REGIME.MARSH,
    GREATER_REALM_HYDRO_REGIME.RIVER,
    GREATER_REALM_HYDRO_REGIME.LAKE,
    GREATER_REALM_HYDRO_REGIME.OCEAN,
    GREATER_REALM_HYDRO_REGIME.SEA,
  ]),
});

function requireGreaterRealmHydrologyLinkV1(
  source: GreaterRealmCellImportV1,
  downstream: GreaterRealmCellImportV1,
): void {
  const downstreamIsDry = downstream.hydroRegime === GREATER_REALM_HYDRO_REGIME.DRY;
  if (
    downstreamIsDry
    && source.hydroRegime !== GREATER_REALM_HYDRO_REGIME.LAKE
    && source.hydroRegime !== GREATER_REALM_HYDRO_REGIME.MARSH
  ) fail('GREATER_REALM_HYDROLOGY_DRY_TARGET_INVALID');
  if (downstream.hydroSurfaceMilli > source.hydroSurfaceMilli) {
    fail('GREATER_REALM_HYDROLOGY_UPHILL_INVALID');
  }
  if (downstream.flowAccumulation <= source.flowAccumulation) {
    fail('GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
  }
  if (!(HYDROLOGY_TRANSITIONS[source.hydroRegime] ?? []).includes(downstream.hydroRegime)) {
    fail('GREATER_REALM_HYDROLOGY_TRANSITION_INVALID');
  }
  if (downstreamIsDry) {
    if (source.hydroBodyId === undefined || downstream.hydroBodyId !== undefined) {
      fail('GREATER_REALM_HYDROLOGY_BODY_TRANSITION_INVALID');
    }
  } else if (
    source.hydroBodyId === undefined
    || downstream.hydroBodyId === undefined
    || ((source.hydroRegime === downstream.hydroRegime)
      !== (source.hydroBodyId === downstream.hydroBodyId))
  ) fail('GREATER_REALM_HYDROLOGY_BODY_TRANSITION_INVALID');
}

function requireGreaterRealmHydrologyOutlet(
  ctx: GreaterRealmContext,
  row: GreaterRealmCellImportV1,
  _lockAuthorizedTerminal: boolean,
): void {
  const neighbors = [];
  for (const delta of AXIAL_DIRECTIONS) {
    const neighbor = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
      `A:${row.atlasQ + delta[0]}:${row.atlasR + delta[1]}`,
    );
    if (
      neighbor !== null
      && neighbor.tier === GREATER_REALM_VISIBLE_TIER_MAX
      && neighbor.regionId === row.regionId
    ) {
      neighbors.push(neighbor);
    }
  }
  if (!neighbors.some(neighbor => (
    (
      neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.OCEAN
      || neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.LAKE
      || neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.SEA
    )
    && neighbor.hydroSurfaceMilli <= row.hydroSurfaceMilli
  ))) fail('GREATER_REALM_HYDROLOGY_TERMINAL_OUTLET_INVALID');
}

function verifyCell(ctx: GreaterRealmContext, ordinal: number) {
  const row = ctx.db.greaterRealmCellV1.releaseOrdinal.find(ordinal);
  if (row === null) fail('GREATER_REALM_VERIFY_CELL_MISSING');
  validateGreaterRealmCellImportV1(row);
  if (ctx.db.greaterRealmChunkV1.chunkHandle.find(row.chunkHandle) === null) {
    fail('GREATER_REALM_VERIFY_CELL_CHUNK_MISSING');
  }
  let expectedSealedBoundaryMask = 0;
  for (let direction = 0; direction < AXIAL_DIRECTIONS.length; direction += 1) {
    const delta = AXIAL_DIRECTIONS[direction]!;
    const neighbor = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
      `A:${row.atlasQ + delta[0]}:${row.atlasR + delta[1]}`,
    );
    if (neighbor === null || neighbor.tier !== GREATER_REALM_VISIBLE_TIER_MAX) {
      expectedSealedBoundaryMask |= 1 << direction;
    }
  }
  if (row.sealedBoundaryMask !== expectedSealedBoundaryMask) {
    fail('GREATER_REALM_SEALED_BOUNDARY_CLOSURE_INVALID');
  }
  const legacyFlowTerminal = verifyLegacyLowlandsCell(ctx, row);
  if (row.componentKey !== undefined) {
    const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
    if (component === null) fail('GREATER_REALM_VERIFY_CELL_COMPONENT_MISSING');
    const region = requireGreaterRealmPublicRegion(row.regionId);
    if ((component.regionMask & (1 << region.ordinal)) === 0) {
      fail('GREATER_REALM_COMPONENT_REGION_MASK_MISMATCH');
    }
    if (component.verificationPhase !== 'cells' || row.routeDepth! > component.maxRouteDepth) {
      fail('GREATER_REALM_COMPONENT_VERIFY_PHASE_INVALID');
    }
    if (row.routeDepth === 0) {
      if (component.rootCellKey !== row.cellKey) fail('GREATER_REALM_COMPONENT_EXTRA_ROOT');
    } else {
      const direction = AXIAL_DIRECTIONS[row.routeParentDirection!];
      const parent = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
        `A:${row.atlasQ + direction![0]}:${row.atlasR + direction![1]}`,
      );
      if (
        parent === null
        || parent.componentKey !== row.componentKey
        || parent.routeDepth !== row.routeDepth! - 1
        || (row.sealedBoundaryMask & (1 << row.routeParentDirection!)) !== 0
      ) fail('GREATER_REALM_ROUTE_PARENT_CLOSURE_INVALID');
    }
    if (component.verifiedCellCount >= component.expectedCellCount) {
      fail('GREATER_REALM_COMPONENT_VERIFIED_CELL_OVERFLOW');
    }
    ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
      ...component,
      verifiedCellCount: component.verifiedCellCount + 1,
      verifiedRegionMask: component.verifiedRegionMask | (1 << region.ordinal),
      verifiedMaxRouteDepth: Math.max(component.verifiedMaxRouteDepth, row.routeDepth!),
      verificationDigest: updateComponentDigest(component, runtimeCellRecord(row)),
    });
  }
  if (row.hydroFlowDirection !== undefined) {
    const direction = AXIAL_DIRECTIONS[row.hydroFlowDirection];
    const downstream = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
      `A:${row.atlasQ + direction![0]}:${row.atlasR + direction![1]}`,
    );
    if (downstream === null || downstream.tier !== GREATER_REALM_VISIBLE_TIER_MAX) {
      fail('GREATER_REALM_HYDROLOGY_PUBLIC_CLOSURE_INVALID');
    }
    requireGreaterRealmHydrologyLinkV1(row, downstream);
  } else if (
    greaterRealmHydrologyRequiresDownstream(row.hydroRegime)
  ) {
    requireGreaterRealmHydrologyOutlet(ctx, row, legacyFlowTerminal);
  }
  incrementRegionVerification(ctx, row.atlasId, row.regionId, {
    verifiedCellCount: 1,
    verifiedPassableCellCount: row.passable ? 1 : 0,
    verifiedChunkCount: isFirstRegionCellInChunk(ctx, row) ? 1 : 0,
  });
  return row;
}

function verifySlot(ctx: GreaterRealmContext, ordinal: number) {
  const row = ctx.db.greaterRealmCastleSlotV1.releaseOrdinal.find(ordinal);
  if (row === null) fail('GREATER_REALM_VERIFY_SLOT_MISSING');
  validateGreaterRealmSlotInputV1(row);
  assertLegacySlotMapping(ctx, row);
  const cell = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
  if (
    cell === null
    || cell.componentKey !== row.componentKey
    || !cell.passable
    || cell.regionId !== row.regionId
  ) fail('GREATER_REALM_VERIFY_SLOT_REACHABILITY_INVALID');
  const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
  if (component === null || component.verificationPhase !== 'castle-slots') {
    fail('GREATER_REALM_COMPONENT_VERIFY_PHASE_INVALID');
  }
  if (component.verifiedSlotCount >= component.expectedSlotCount) {
    fail('GREATER_REALM_COMPONENT_VERIFIED_SLOT_OVERFLOW');
  }
  ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
    ...component,
    verifiedSlotCount: component.verifiedSlotCount + 1,
    verificationDigest: updateComponentDigest(component, runtimeSlotRecord(row)),
    regionVerificationJson: incrementComponentRegionVerification(
      component,
      row.regionId,
      'slotCount',
    ),
  });
  incrementRegionVerification(ctx, row.atlasId, row.regionId, { verifiedCastleCapacity: 1 });
  return row;
}

function requireGreaterRealmResourceLocationBlock(
  ctx: GreaterRealmContext,
  row: GreaterRealmResourceInputV1,
): void {
  let locationCount = 0;
  let firstOrdinal = 0xffff_ffff;
  let lastOrdinal = 0;
  for (const candidate of ctx.db.greaterRealmResourceNodeV1.locationId.filter(row.locationId)) {
    locationCount += 1;
    if (locationCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION) {
      fail('GREATER_REALM_RESOURCE_LOCATION_CAPACITY_INVALID');
    }
    if (
      candidate.atlasId !== row.atlasId
      || candidate.componentKey !== row.componentKey
      || candidate.regionId !== row.regionId
      || candidate.resourceKind !== row.resourceKind
      || candidate.cellKey !== row.cellKey
      || candidate.legacyCatalogId !== row.legacyCatalogId
      || candidate.policyVersion !== row.policyVersion
    ) fail('GREATER_REALM_RESOURCE_LOCATION_IDENTITY_INVALID');
    firstOrdinal = Math.min(firstOrdinal, candidate.releaseOrdinal);
    lastOrdinal = Math.max(lastOrdinal, candidate.releaseOrdinal);
  }
  if (
    locationCount < 1
    || firstOrdinal !== row.releaseOrdinal
    || lastOrdinal - firstOrdinal + 1 !== locationCount
  ) fail('GREATER_REALM_RESOURCE_LOCATION_BLOCK_INVALID');

  let cellNodeCount = 0;
  for (const candidate of ctx.db.greaterRealmResourceNodeV1.cellKey.filter(row.cellKey)) {
    cellNodeCount += 1;
    if (
      cellNodeCount
        > GREATER_REALM_RESOURCE_KINDS.length * GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION
    ) fail('GREATER_REALM_RESOURCE_CELL_CAPACITY_INVALID');
    if (
      candidate.resourceKind === row.resourceKind
      && candidate.locationId !== row.locationId
    ) fail('GREATER_REALM_RESOURCE_CELL_LOCATION_INVALID');
  }
}

function verifyResource(ctx: GreaterRealmContext, ordinal: number) {
  const row = ctx.db.greaterRealmResourceNodeV1.releaseOrdinal.find(ordinal);
  if (row === null) fail('GREATER_REALM_VERIFY_RESOURCE_MISSING');
  validateGreaterRealmResourceInputV1(row);
  const legacySite = requireLegacyResourceMapping(ctx, row);
  const cell = ctx.db.greaterRealmCellV1.cellKey.find(row.cellKey);
  if (
    cell === null
    || cell.componentKey !== row.componentKey
    || !cell.passable
    || cell.regionId !== row.regionId
  ) fail('GREATER_REALM_VERIFY_RESOURCE_REACHABILITY_INVALID');
  const componentForOrder = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
  const regionForOrder = requireGreaterRealmPublicRegion(row.regionId);
  const kindForOrder = GREATER_REALM_RESOURCE_KINDS.indexOf(
    row.resourceKind as typeof GREATER_REALM_RESOURCE_KINDS[number],
  );
  if (componentForOrder === null || kindForOrder < 0) fail('GREATER_REALM_RESOURCE_ORDER_INVALID');
  let firstResourceLocation = true;
  if (ordinal === 0) {
    if (row.nodeOrdinal !== 0) fail('GREATER_REALM_RESOURCE_NODE_ORDINAL_INVALID');
  } else {
    const previous = ctx.db.greaterRealmResourceNodeV1.releaseOrdinal.find(ordinal - 1);
    if (previous === null) fail('GREATER_REALM_RESOURCE_ORDER_INVALID');
    const previousComponent = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(previous.componentKey);
    const previousRegion = requireGreaterRealmPublicRegion(previous.regionId);
    const previousKind = GREATER_REALM_RESOURCE_KINDS.indexOf(
      previous.resourceKind as typeof GREATER_REALM_RESOURCE_KINDS[number],
    );
    if (previousComponent === null || previousKind < 0) fail('GREATER_REALM_RESOURCE_ORDER_INVALID');
    const sameGroup = previous.componentKey === row.componentKey
      && previous.regionId === row.regionId
      && previous.resourceKind === row.resourceKind;
    const orderDelta = componentForOrder.componentOrdinal - previousComponent.componentOrdinal
      || regionForOrder.ordinal - previousRegion.ordinal
      || kindForOrder - previousKind;
    if (
      (sameGroup && row.nodeOrdinal !== previous.nodeOrdinal + 1)
      || (!sameGroup && (row.nodeOrdinal !== 0 || orderDelta <= 0))
    ) fail('GREATER_REALM_RESOURCE_NODE_ORDINAL_INVALID');
    if (sameGroup && previous.locationId === row.locationId) {
      if (
        previous.cellKey !== row.cellKey
        || previous.legacyCatalogId !== row.legacyCatalogId
        || previous.policyVersion !== row.policyVersion
      ) fail('GREATER_REALM_RESOURCE_LOCATION_BLOCK_INVALID');
      firstResourceLocation = false;
    } else if (sameGroup) {
      if (
        previous.locationId.localeCompare(row.locationId) >= 0
        || previous.cellKey === row.cellKey
      ) fail('GREATER_REALM_RESOURCE_LOCATION_BLOCK_INVALID');
    }
  }
  if (firstResourceLocation) requireGreaterRealmResourceLocationBlock(ctx, row);
  const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(row.componentKey);
  if (component === null || component.verificationPhase !== 'resource-nodes') {
    fail('GREATER_REALM_COMPONENT_VERIFY_PHASE_INVALID');
  }
  const verifiedField = row.resourceKind === 'food' ? 'verifiedFoodNodeCount'
    : row.resourceKind === 'wood' ? 'verifiedWoodNodeCount'
      : row.resourceKind === 'stone' ? 'verifiedStoneNodeCount'
        : 'verifiedGoldNodeCount';
  const expectedField = row.resourceKind === 'food' ? 'expectedFoodNodeCount'
    : row.resourceKind === 'wood' ? 'expectedWoodNodeCount'
      : row.resourceKind === 'stone' ? 'expectedStoneNodeCount'
        : 'expectedGoldNodeCount';
  if (component[verifiedField] >= component[expectedField]) {
    fail('GREATER_REALM_COMPONENT_VERIFIED_RESOURCE_OVERFLOW');
  }
  ctx.db.greaterRealmNavigationComponentV1.componentKey.update({
    ...component,
    [verifiedField]: component[verifiedField] + 1,
    verificationDigest: updateComponentDigest(component, runtimeResourceRecord(row)),
    regionVerificationJson: incrementComponentRegionVerification(
      component,
      row.regionId,
      row.resourceKind === 'food' ? 'foodNodeCount'
        : row.resourceKind === 'wood' ? 'woodNodeCount'
          : row.resourceKind === 'stone' ? 'stoneNodeCount'
            : 'goldNodeCount',
    ),
  });
  if (legacySite !== undefined) {
    if (row.legacyCatalogId === undefined) fail('GREATER_REALM_LOWLANDS_LEGACY_RESOURCE_MISSING');
  }
  const regionKindField = row.resourceKind === 'food' ? 'verifiedFoodNodeCount'
    : row.resourceKind === 'wood' ? 'verifiedWoodNodeCount'
      : row.resourceKind === 'stone' ? 'verifiedStoneNodeCount'
        : 'verifiedGoldNodeCount';
  incrementRegionVerification(ctx, row.atlasId, row.regionId, {
    verifiedResourceLocationCount: firstResourceLocation ? 1 : 0,
    verifiedResourceNodeCount: 1,
    [regionKindField]: 1,
  });
  return row;
}

const VERIFY_PHASE_ORDER = Object.freeze([
  'components', 'chunks', 'cells', 'component-slots', 'slots',
  'component-resources', 'resources', 'component-finalize', 'complete',
] as const);

function phaseCount(release: ReturnType<typeof requireRelease>, phase: string): number {
  if (phase === 'components') return release.expectedComponentCount;
  if (phase === 'chunks') return release.expectedChunkCount;
  if (phase === 'cells') return release.expectedCellCount;
  if (phase === 'component-slots') return release.expectedComponentCount;
  if (phase === 'slots') return release.expectedSlotCount;
  if (phase === 'component-resources') return release.expectedComponentCount;
  if (phase === 'resources') return release.expectedResourceNodeCount;
  if (phase === 'component-finalize') return release.expectedComponentCount;
  if (phase === 'complete') return 0;
  fail('GREATER_REALM_VERIFY_PHASE_INVALID');
}

export function verifyGreaterRealmBatchV1(
  ctx: GreaterRealmContext,
  atlasId: string,
  importEpoch: bigint,
  requestedRows: number,
): { phase: string; processed: number; remaining: number; complete: boolean } {
  let release = requireRelease(ctx, atlasId, importEpoch, ['verifying']);
  requireBoundedGreaterRealmBatch(
    requestedRows,
    GREATER_REALM_MAX_VERIFY_ROWS,
    'GREATER_REALM_VERIFY_BATCH_INVALID',
  );
  if (release.verificationPhase === 'complete') {
    return { phase: 'complete', processed: 0, remaining: 0, complete: true };
  }
  const phase = release.verificationPhase;
  const total = phaseCount(release, phase);
  const start = Number(release.verificationCursor);
  if (!Number.isSafeInteger(start) || start < 0 || start > total) {
    fail('GREATER_REALM_VERIFY_CURSOR_INVALID');
  }
  const end = Math.min(total, start + requestedRows);
  const verificationHash = Sha256.deserialize(release.verificationDigest);
  for (let ordinal = start; ordinal < end; ordinal += 1) {
    const row = phase === 'components' ? verifyComponent(ctx, ordinal)
      : phase === 'chunks' ? verifyChunk(ctx, ordinal)
        : phase === 'cells' ? verifyCell(ctx, ordinal)
          : phase === 'component-slots' ? advanceComponentToSlots(ctx, ordinal)
            : phase === 'slots' ? verifySlot(ctx, ordinal)
              : phase === 'component-resources' ? advanceComponentToResources(ctx, ordinal)
                : phase === 'resources' ? verifyResource(ctx, ordinal)
                  : finalizeComponentDigest(ctx, ordinal);
    updateLengthFramedSha256(
      verificationHash,
      new TextEncoder().encode(canonicalGreaterRealmVerificationLine(
        phase,
        row as unknown as Record<string, unknown>,
      )),
    );
  }
  const verifiedField = phase === 'components' ? 'verifiedComponentCount'
    : phase === 'chunks' ? 'verifiedChunkCount'
      : phase === 'cells' ? 'verifiedCellCount'
        : phase === 'slots' ? 'verifiedSlotCount'
          : phase === 'resources' ? 'verifiedResourceNodeCount'
            : undefined;
  const reachedEnd = end === total;
  const phaseIndex = VERIFY_PHASE_ORDER.indexOf(phase as typeof VERIFY_PHASE_ORDER[number]);
  const nextPhase = reachedEnd ? VERIFY_PHASE_ORDER[phaseIndex + 1]! : phase;
  const currentRelease = requireRelease(ctx, atlasId, importEpoch, ['verifying']);
  const updatedRelease = {
    ...currentRelease,
    verificationDigest: nextPhase === 'complete'
      ? verificationHash.digestHex()
      : verificationHash.serialize(),
    verificationCursor: BigInt(reachedEnd ? 0 : end),
    verificationPhase: nextPhase,
  };
  release = verifiedField === undefined
    ? updatedRelease
    : { ...updatedRelease, [verifiedField]: end };
  ctx.db.greaterRealmReleaseV1.atlasId.update(release);
  return {
    phase,
    processed: end - start,
    remaining: total - end,
    complete: release.verificationPhase === 'complete',
  };
}

function assertLegacySlotSetExact(ctx: GreaterRealmContext): void {
  const seen = new Set<number>();
  for (const slot of ctx.db.greaterRealmCastleSlotV1.iter()) {
    assertLegacySlotMapping(ctx, slot);
    if (slot.legacySlotId !== undefined) {
      if (seen.has(slot.legacySlotId)) fail('GREATER_REALM_LEGACY_SLOT_DUPLICATE');
      seen.add(slot.legacySlotId);
    }
  }
  if (seen.size !== GREATER_REALM_CASTLES_PER_REGION) fail('GREATER_REALM_LEGACY_SLOT_SET_INVALID');
  for (let slotId = 1; slotId <= GREATER_REALM_CASTLES_PER_REGION; slotId += 1) {
    if (!seen.has(slotId)) fail('GREATER_REALM_LEGACY_SLOT_SET_INVALID');
  }
}

function requireFinalizeClosure(ctx: GreaterRealmContext, release: ReturnType<typeof requireRelease>): void {
  validateGreaterRealmReleaseInputV1(release);
  if (
    release.verificationPhase !== 'complete'
    || release.verifiedComponentCount !== release.expectedComponentCount
    || release.verifiedChunkCount !== release.expectedChunkCount
    || release.verifiedCellCount !== release.expectedCellCount
    || release.verifiedSlotCount !== release.expectedSlotCount
    || release.verifiedResourceNodeCount !== release.expectedResourceNodeCount
  ) fail('GREATER_REALM_VERIFICATION_INCOMPLETE');
  let regionCells = 0;
  let regionChunks = 0;
  let regionSlots = 0;
  let regionResources = 0;
  const manifest = runtimeRegionManifest(release);
  const verification = runtimeRegionVerification(release);
  for (let index = 0; index < manifest.length; index += 1) {
    const region = manifest[index]!;
    const verified = verification[index]!;
    const expected = GREATER_REALM_PUBLIC_REGIONS[index]!;
    if (
      region.regionId !== expected.id
      || region.ordinal !== expected.ordinal
      || region.publicName !== expected.name
      || region.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || region.castleCapacity !== GREATER_REALM_CASTLES_PER_REGION
      || verified.regionId !== region.regionId
      || verified.verifiedCellCount !== region.cellCount
      || verified.verifiedPassableCellCount !== region.passableCellCount
      || verified.verifiedChunkCount !== region.chunkCount
      || verified.verifiedCastleCapacity !== region.castleCapacity
      || verified.verifiedResourceLocationCount !== region.resourceLocationCount
      || verified.verifiedResourceNodeCount !== region.resourceNodeCount
      || verified.verifiedFoodNodeCount !== region.foodNodeCount
      || verified.verifiedWoodNodeCount !== region.woodNodeCount
      || verified.verifiedStoneNodeCount !== region.stoneNodeCount
      || verified.verifiedGoldNodeCount !== region.goldNodeCount
      || region.foodNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * region.castleCapacity
      || region.woodNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * region.castleCapacity
      || region.stoneNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * region.castleCapacity
      || region.goldNodeCount !== GREATER_REALM_RESOURCE_MARGIN_PER_SLOT * region.castleCapacity
      || region.active
    ) fail('GREATER_REALM_REGION_AGGREGATE_INVALID');
    regionCells += region.cellCount;
    regionChunks += region.chunkCount;
    regionSlots += region.castleCapacity;
    regionResources += region.resourceNodeCount;
  }
  if (
    regionCells !== release.expectedCellCount
    || regionChunks < release.expectedChunkCount
    || regionSlots !== release.expectedSlotCount
    || regionResources !== release.expectedResourceNodeCount
  ) fail('GREATER_REALM_REGION_TOTALS_INVALID');
  if (
    release.legacyTransformOffsetQ === undefined
    || release.legacyTransformOffsetR === undefined
  ) fail('GREATER_REALM_LEGACY_CELL_SET_INVALID');
  assertLegacySlotSetExact(ctx);
}

export function finalizeGreaterRealmReleaseV1(
  ctx: GreaterRealmContext,
  input: Readonly<{
    atlasId: string;
    importEpoch: bigint;
    publicApprovalReceiptId: string;
    expectedReleaseSha256: string;
    expectedVerificationDigest: string;
    publicName: string;
  }>,
): void {
  const release = requireRelease(ctx, input.atlasId, input.importEpoch, ['verifying']);
  requireGreaterRealmOpaqueId(
    input.publicApprovalReceiptId,
    'GREATER_REALM_PUBLIC_APPROVAL_RECEIPT_INVALID',
  );
  requireGreaterRealmSha256(input.expectedReleaseSha256, 'GREATER_REALM_RELEASE_SHA_INVALID');
  requireGreaterRealmPresentationString(input.publicName, 'GREATER_REALM_PUBLIC_NAME_INVALID');
  requireGreaterRealmSha256(input.expectedVerificationDigest, 'GREATER_REALM_VERIFY_DIGEST_INVALID');
  if (
    input.publicApprovalReceiptId !== release.publicApprovalReceiptId
    || input.expectedReleaseSha256 !== release.expectedReleaseSha256
    || input.expectedVerificationDigest !== release.verificationDigest
  ) fail('GREATER_REALM_FINALIZE_ATTESTATION_CHANGED');
  requireFinalizeClosure(ctx, release);
  if (
    ctx.db.realmAtlasV1.count() !== 0n
    || ctx.db.realmAtlasVisibleRegionV1.count() !== 0n
    || ctx.db.realmWorkerSystemV2.count() !== 0n
  ) {
    fail('GREATER_REALM_PUBLIC_HEADER_NOT_EMPTY');
  }
  ctx.db.greaterRealmReleaseV1.atlasId.update({
    ...release,
    publicName: input.publicName,
    state: 'ready',
    readyAt: ctx.timestamp,
  });
}

export function inspectGreaterRealmV17(ctx: GreaterRealmContext) {
  const releases = [...ctx.db.greaterRealmReleaseV1.iter()];
  if (releases.length > 1) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
  const release = releases[0];
  return {
    present: release !== undefined,
    atlasId: release?.atlasId,
    publicReleaseId: release?.publicReleaseId,
    state: release?.state ?? 'absent',
    importEpoch: release?.importEpoch,
    verificationPhase: release?.verificationPhase ?? 'components',
    verificationCursor: release?.verificationCursor ?? 0n,
    verificationDigest: release?.verificationDigest ?? GREATER_REALM_EMPTY_VERIFY_DIGEST,
    expectedComponentCount: release?.expectedComponentCount ?? 0,
    expectedChunkCount: release?.expectedChunkCount ?? 0,
    expectedCellCount: release?.expectedCellCount ?? 0,
    expectedSlotCount: release?.expectedSlotCount ?? 0,
    expectedResourceNodeCount: release?.expectedResourceNodeCount ?? 0,
    regionManifestRows: release?.regionManifestJson === undefined
      ? 0
      : GREATER_REALM_VISIBLE_REGION_COUNT,
    componentRows: ctx.db.greaterRealmNavigationComponentV1.count(),
    chunkRows: ctx.db.greaterRealmChunkV1.count(),
    cellRows: ctx.db.greaterRealmCellV1.count(),
    slotRows: ctx.db.greaterRealmCastleSlotV1.count(),
    resourceRows: ctx.db.greaterRealmResourceNodeV1.count(),
    claimRows: ctx.db.greaterRealmCastleClaimV1.count(),
    occupancyRows: ctx.db.greaterRealmCellOccupancyV1.count(),
    activationRows: ctx.db.greaterRealmActivationV1.count(),
    publicAtlasRows: ctx.db.realmAtlasV1.count(),
    publicRegionRows: ctx.db.realmAtlasVisibleRegionV1.count(),
    workerSystemRows: ctx.db.realmWorkerSystemV2.count(),
    importsExact: release !== undefined && aggregateImportsExact(ctx, release),
    ready: release?.state === 'ready',
    importMutationsCompiled: GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    activationMutationsCompiled: GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  };
}

export function greaterRealmAuthorityErrorCode(error: unknown): string | undefined {
  return greaterRealmV17ErrorCode(error);
}
