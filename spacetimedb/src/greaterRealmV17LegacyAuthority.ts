import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
  FOOD_SITE_POLICY_VERSION,
} from './foodSitePolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  GOLD_SITE_POLICY_VERSION,
} from './goldSitePolicy';
import {
  GREATER_REALM_HYDRO_REGIME,
  GreaterRealmV17PolicyError,
  type GreaterRealmResourceKind,
} from './greaterRealmV17Policy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
  STONE_SITE_POLICY_VERSION,
} from './stoneSitePolicy';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from './waterRevision';
import {
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  canonicalMetaForKey,
  canonicalTileForKey,
  type GenesisTerrainKind,
} from './world';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
  WOOD_SITE_POLICY_VERSION,
} from './woodSitePolicy';

const INT32_MIN = -0x8000_0000;
const LOWLANDS_REGION_ID = 'T1_LOWLANDS';

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, 1]),
] as const);

function fail(code: string): never {
  throw new GreaterRealmV17PolicyError(code);
}

function localKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function isGreaterRealmLegacyCoordinateV1(q: number, r: number): boolean {
  return canonicalTileForKey(localKey(q, r)) !== undefined;
}

export function isGreaterRealmLegacyAuthorityCoordinateV1(q: number, r: number): boolean {
  const key = localKey(q, r);
  return canonicalTileForKey(key) !== undefined || LEGACY_WATER_BY_KEY.has(key);
}

export function rotateGreaterRealmLegacyCoordinate(
  q: number,
  r: number,
  rotation: number,
): Readonly<{ q: number; r: number }> {
  if (!Number.isSafeInteger(rotation) || rotation < 0 || rotation > 5) {
    fail('GREATER_REALM_LEGACY_TRANSFORM_INVALID');
  }
  let nextQ = q;
  let nextR = r;
  for (let step = 0; step < rotation; step += 1) {
    const rotatedQ = -nextR;
    const rotatedR = nextQ + nextR;
    nextQ = rotatedQ;
    nextR = rotatedR;
  }
  return Object.freeze({ q: nextQ, r: nextR });
}

export function deriveGreaterRealmLegacyRotation(
  localQ: number,
  localR: number,
  atlasQ: number,
  atlasR: number,
  offsetQ: number,
  offsetR: number,
): number | undefined {
  const matches: number[] = [];
  for (let rotation = 0; rotation < 6; rotation += 1) {
    const rotated = rotateGreaterRealmLegacyCoordinate(localQ, localR, rotation);
    if (rotated.q + offsetQ === atlasQ && rotated.r + offsetR === atlasR) {
      matches.push(rotation);
    }
  }
  if (matches.length === 0) fail('GREATER_REALM_LEGACY_TRANSFORM_MISMATCH');
  return matches.length === 1 ? matches[0] : undefined;
}

const LEGACY_VISUAL_CLASS: Readonly<Record<GenesisTerrainKind, readonly [number, number]>> =
  Object.freeze({
    lowland: Object.freeze([1, 3] as const),
    meadow: Object.freeze([2, 3] as const),
    forest: Object.freeze([4, 3] as const),
    heath: Object.freeze([9, 3] as const),
    ridge: Object.freeze([19, 6] as const),
    lake: Object.freeze([1, 3] as const),
    'ancient-stone': Object.freeze([19, 5] as const),
  });

const LEGACY_WATER_BY_KEY = new Map(
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row => [row.cellKey, row] as const),
);
const LEGACY_WATER_BODY_IDS = Object.freeze([
  ...new Set(
    GENESIS_WATER_REVISION_ENABLED_CELLS_V1
      .map(row => row.bodyId),
  ),
].sort());
const LEGACY_WATER_BODY_ORDINAL = new Map(
  LEGACY_WATER_BODY_IDS.map((bodyId, ordinal) => [bodyId, ordinal] as const),
);

export const GREATER_REALM_LEGACY_WATER_BODY_COUNT = LEGACY_WATER_BODY_IDS.length;
export const GREATER_REALM_LEGACY_WATER_CELL_COUNT =
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1.length;

if (
  GREATER_REALM_LEGACY_WATER_BODY_COUNT !== 13
  || GENESIS_AUTHORITATIVE_CELL_COUNT !== 10_000
) throw new Error('GREATER_REALM_LEGACY_AUTHORITY_DRIFT');

export type GreaterRealmLegacyCellProjectionV1 = Readonly<{
  regionId: string;
  localQ: number;
  localR: number;
  atlasQ: number;
  atlasR: number;
  passable: boolean;
  movementCost: number;
  geologicalBarrierBand: number;
  biomeClass: number;
  landformClass: number;
  yieldClass: number;
  hydroRegime: number;
  hydroBodyId?: string;
  hydroDepthClass: number;
  hydroSurfaceMilli: number;
  hydroFlowDirection?: number;
  flowAccumulation: bigint;
  hydrologyRevision: number;
  travelClass: number;
}>;

export type GreaterRealmLegacyCellAuthorityResultV1 = Readonly<{
  canonicalWorld: boolean;
  legacyWater: boolean;
  terminalFlow: boolean;
  waterBodyOrdinal?: number;
}>;

function directionForDelta(deltaQ: number, deltaR: number): number {
  const direction = AXIAL_DIRECTIONS.findIndex(
    candidate => candidate[0] === deltaQ && candidate[1] === deltaR,
  );
  if (direction < 0) fail('GREATER_REALM_LEGACY_HYDROLOGY_DIRECTION_INVALID');
  return direction;
}

/**
 * Binds one imported Lowlands row to the frozen v16 world and active Water
 * revision. Non-canonical expansion cells remain valid but return false.
 */
export function requireGreaterRealmLegacyCellAuthorityV1(
  row: GreaterRealmLegacyCellProjectionV1,
  rotation: number,
  offsetQ: number,
  offsetR: number,
): GreaterRealmLegacyCellAuthorityResultV1 {
  if (row.regionId !== LOWLANDS_REGION_ID) {
    return Object.freeze({ canonicalWorld: false, legacyWater: false, terminalFlow: false });
  }
  const key = localKey(row.localQ, row.localR);
  const tile = canonicalTileForKey(key);
  const water = LEGACY_WATER_BY_KEY.get(key);
  if (tile === undefined && water === undefined) {
    return Object.freeze({ canonicalWorld: false, legacyWater: false, terminalFlow: false });
  }
  const metadata = tile === undefined ? undefined : canonicalMetaForKey(key);
  if (tile !== undefined && metadata === undefined) fail('GREATER_REALM_LEGACY_WORLD_META_MISSING');
  const rotated = rotateGreaterRealmLegacyCoordinate(row.localQ, row.localR, rotation);
  if (row.atlasQ !== rotated.q + offsetQ || row.atlasR !== rotated.r + offsetR) {
    fail('GREATER_REALM_LEGACY_TRANSFORM_MISMATCH');
  }
  let biomeClass = metadata === undefined ? 0 : LEGACY_VISUAL_CLASS[metadata.terrainKind][0];
  let landformClass = metadata === undefined ? 0 : LEGACY_VISUAL_CLASS[metadata.terrainKind][1];
  let hydroRegime: number = GREATER_REALM_HYDRO_REGIME.DRY;
  let hydroDepthClass = 0;
  let hydroSurfaceMilli = INT32_MIN;
  let hydrologyRevision = 0;
  let waterBodyOrdinal: number | undefined;
  if (water !== undefined) {
    hydroRegime = water.regime === 'ocean'
      ? GREATER_REALM_HYDRO_REGIME.OCEAN
      : water.regime === 'lake'
        ? GREATER_REALM_HYDRO_REGIME.LAKE
        : GREATER_REALM_HYDRO_REGIME.RIVER;
    biomeClass = water.regime === 'ocean' ? 20 : water.regime === 'lake' ? 21 : 22;
    landformClass = water.regime === 'ocean' ? 16 : water.regime === 'lake' ? 10 : 2;
    hydroDepthClass = water.depthClass;
    hydroSurfaceMilli = water.surfaceLevelMilli;
    hydrologyRevision = water.generationVersion;
    waterBodyOrdinal = LEGACY_WATER_BODY_ORDINAL.get(water.bodyId);
    if (waterBodyOrdinal === undefined) fail('GREATER_REALM_LEGACY_WATER_BODY_INVALID');
  }
  // v16 canonical navigation rejects every active Water-revision cell before
  // consulting route metadata. A declassified FORD marker must therefore not
  // turn a frozen Lowlands water cell into a newly passable legacy cell.
  const expectedPassable = metadata?.passable === true && water === undefined;
  const expectedYield = !expectedPassable || metadata === undefined
    ? 0
    : metadata.staticContentKind === 'resource-capable'
      || metadata.staticContentKind === 'core-capable'
      ? 2
      : 1;
  if (
    row.passable !== expectedPassable
    || row.movementCost !== (expectedPassable ? metadata!.movementCost : 1_000_000)
    || row.geologicalBarrierBand !== 0
    || row.biomeClass !== biomeClass
    || row.landformClass !== landformClass
    || row.yieldClass !== expectedYield
    || row.hydroRegime !== hydroRegime
    || row.hydroDepthClass !== hydroDepthClass
    || row.hydroSurfaceMilli !== hydroSurfaceMilli
    || row.hydrologyRevision !== hydrologyRevision
    || (water !== undefined && row.flowAccumulation !== BigInt(water.flowAccumulation))
    || (water === undefined) !== (row.hydroBodyId === undefined)
  ) fail('GREATER_REALM_LEGACY_CELL_CLASSIFICATION_MISMATCH');
  if (water?.downstreamWaterCellKey !== undefined) {
    const downstream = LEGACY_WATER_BY_KEY.get(water.downstreamWaterCellKey);
    if (downstream === undefined) fail('GREATER_REALM_LEGACY_HYDROLOGY_MISSING');
    const downstreamRotated = rotateGreaterRealmLegacyCoordinate(
      downstream.q,
      downstream.r,
      rotation,
    );
    const expectedDirection = directionForDelta(
      downstreamRotated.q - rotated.q,
      downstreamRotated.r - rotated.r,
    );
    if (row.hydroFlowDirection !== expectedDirection) {
      fail('GREATER_REALM_LEGACY_HYDROLOGY_DIRECTION_INVALID');
    }
  } else if (water !== undefined && row.hydroFlowDirection !== undefined) {
    fail('GREATER_REALM_LEGACY_HYDROLOGY_DIRECTION_INVALID');
  }
  return Object.freeze({
    canonicalWorld: tile !== undefined,
    legacyWater: water !== undefined,
    terminalFlow: water?.regime === 'river' && water.downstreamWaterCellKey === undefined,
    waterBodyOrdinal,
  });
}

type LegacySite = Readonly<{
  siteId: string;
  q: number;
  r: number;
}>;

const LEGACY_RESOURCE_CATALOGS: Readonly<Record<GreaterRealmResourceKind, Readonly<{
  policyVersion: string;
  sites: readonly LegacySite[];
  ordinalById: ReadonlyMap<string, number>;
}>>> = Object.freeze({
  food: Object.freeze({
    policyVersion: FOOD_SITE_POLICY_VERSION,
    sites: CANONICAL_TIER_I_FOOD_SITES_V1,
    ordinalById: new Map(CANONICAL_TIER_I_FOOD_SITES_V1.map((site, index) => [site.siteId, index])),
  }),
  wood: Object.freeze({
    policyVersion: WOOD_SITE_POLICY_VERSION,
    sites: CANONICAL_TIER_I_WOOD_SITES_V1,
    ordinalById: new Map(CANONICAL_TIER_I_WOOD_SITES_V1.map((site, index) => [site.siteId, index])),
  }),
  stone: Object.freeze({
    policyVersion: STONE_SITE_POLICY_VERSION,
    sites: CANONICAL_TIER_I_STONE_SITES_V1,
    ordinalById: new Map(CANONICAL_TIER_I_STONE_SITES_V1.map((site, index) => [site.siteId, index])),
  }),
  gold: Object.freeze({
    policyVersion: GOLD_SITE_POLICY_VERSION,
    sites: CANONICAL_TIER_I_GOLD_SITES_V1,
    ordinalById: new Map(CANONICAL_TIER_I_GOLD_SITES_V1.map((site, index) => [site.siteId, index])),
  }),
});

export function requireGreaterRealmLegacyResourceCatalogV1(
  kind: GreaterRealmResourceKind,
  legacyCatalogId: string,
): Readonly<{ ordinal: number; q: number; r: number; policyVersion: string }> {
  const catalog = LEGACY_RESOURCE_CATALOGS[kind];
  const ordinal = catalog.ordinalById.get(legacyCatalogId);
  const site = ordinal === undefined ? undefined : catalog.sites[ordinal];
  if (ordinal === undefined || site === undefined) {
    fail('GREATER_REALM_LEGACY_RESOURCE_CATALOG_INVALID');
  }
  return Object.freeze({ ordinal, q: site.q, r: site.r, policyVersion: catalog.policyVersion });
}

type LegacyBindingState = Record<GreaterRealmResourceKind, Array<string | null>>;

function emptyLegacyBindingState(): LegacyBindingState {
  return {
    food: Array.from({ length: LEGACY_RESOURCE_CATALOGS.food.sites.length }, () => null),
    wood: Array.from({ length: LEGACY_RESOURCE_CATALOGS.wood.sites.length }, () => null),
    stone: Array.from({ length: LEGACY_RESOURCE_CATALOGS.stone.sites.length }, () => null),
    gold: Array.from({ length: LEGACY_RESOURCE_CATALOGS.gold.sites.length }, () => null),
  };
}

export function emptyGreaterRealmLegacyResourceVerificationV1(): string {
  return `${JSON.stringify(emptyLegacyBindingState())}\n`;
}

function parseLegacyBindingState(value: string): LegacyBindingState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail('GREATER_REALM_LEGACY_RESOURCE_VERIFICATION_INVALID');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    fail('GREATER_REALM_LEGACY_RESOURCE_VERIFICATION_INVALID');
  }
  const state = parsed as Partial<LegacyBindingState>;
  if (Object.keys(state).join(',') !== 'food,wood,stone,gold') {
    fail('GREATER_REALM_LEGACY_RESOURCE_VERIFICATION_INVALID');
  }
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    const values = state[kind];
    if (
      !Array.isArray(values)
      || values.length !== LEGACY_RESOURCE_CATALOGS[kind].sites.length
      || values.some(item => item !== null && typeof item !== 'string')
    ) fail('GREATER_REALM_LEGACY_RESOURCE_VERIFICATION_INVALID');
  }
  return state as LegacyBindingState;
}

export function recordGreaterRealmLegacyResourceVerificationV1(
  value: string,
  kind: GreaterRealmResourceKind,
  legacyCatalogId: string,
  locationId: string,
): string {
  const state = parseLegacyBindingState(value);
  const { ordinal } = requireGreaterRealmLegacyResourceCatalogV1(kind, legacyCatalogId);
  const current = state[kind][ordinal];
  if (current !== null && current !== locationId) {
    fail('GREATER_REALM_LEGACY_RESOURCE_LOCATION_REPEATED');
  }
  if (current === null) {
    for (const candidateKind of ['food', 'wood', 'stone', 'gold'] as const) {
      if (state[candidateKind].includes(locationId)) {
        fail('GREATER_REALM_LEGACY_RESOURCE_LOCATION_REPEATED');
      }
    }
    state[kind][ordinal] = locationId;
  }
  return `${JSON.stringify(state)}\n`;
}

export function requireGreaterRealmLegacyResourceVerificationCompleteV1(value: string): void {
  const state = parseLegacyBindingState(value);
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    if (state[kind].some(locationId => locationId === null)) {
      fail('GREATER_REALM_LEGACY_RESOURCE_SET_INCOMPLETE');
    }
  }
}

export function emptyGreaterRealmLegacyWaterBodyVerificationV1(): string {
  return `${JSON.stringify(Array.from(
    { length: GREATER_REALM_LEGACY_WATER_BODY_COUNT },
    () => null,
  ))}\n`;
}

function parseLegacyWaterBodyState(value: string): Array<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail('GREATER_REALM_LEGACY_WATER_VERIFICATION_INVALID');
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== GREATER_REALM_LEGACY_WATER_BODY_COUNT
    || parsed.some(item => item !== null && typeof item !== 'string')
  ) fail('GREATER_REALM_LEGACY_WATER_VERIFICATION_INVALID');
  return parsed as Array<string | null>;
}

export function recordGreaterRealmLegacyWaterBodyVerificationV1(
  value: string,
  ordinal: number,
  publicBodyId: string,
): string {
  const state = parseLegacyWaterBodyState(value);
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= state.length) {
    fail('GREATER_REALM_LEGACY_WATER_VERIFICATION_INVALID');
  }
  const current = state[ordinal];
  if (current !== null && current !== publicBodyId) {
    fail('GREATER_REALM_LEGACY_WATER_BODY_REMAP_INVALID');
  }
  if (current === null) {
    if (state.includes(publicBodyId)) fail('GREATER_REALM_LEGACY_WATER_BODY_REMAP_INVALID');
    state[ordinal] = publicBodyId;
  }
  return `${JSON.stringify(state)}\n`;
}

export function requireGreaterRealmLegacyWaterVerificationCompleteV1(value: string): void {
  if (parseLegacyWaterBodyState(value).some(bodyId => bodyId === null)) {
    fail('GREATER_REALM_LEGACY_WATER_SET_INCOMPLETE');
  }
}

export function requireGreaterRealmLegacyCoverageCompleteV1(
  worldCellCount: number,
  waterCellCount: number,
  rotation: number | undefined,
): void {
  if (
    worldCellCount !== GENESIS_AUTHORITATIVE_CELL_COUNT
    || waterCellCount !== GREATER_REALM_LEGACY_WATER_CELL_COUNT
    || rotation === undefined
    || !Number.isSafeInteger(rotation)
    || rotation < 0
    || rotation > 5
  ) fail('GREATER_REALM_LEGACY_CELL_SET_INVALID');
}

export type GreaterRealmHydrologyLinkCellV1 = Readonly<{
  hydroRegime: number;
  hydroBodyId?: string;
  hydroSurfaceMilli: number;
  flowAccumulation: bigint;
}>;

export function greaterRealmHydrologyRequiresDownstream(regime: number): boolean {
  return regime === GREATER_REALM_HYDRO_REGIME.RIVER
    || regime === GREATER_REALM_HYDRO_REGIME.STREAM;
}

export function isGreaterRealmLegacyTerminalOutletNeighborV1(
  sourceQ: number,
  sourceR: number,
  neighborQ: number,
  neighborR: number,
): boolean {
  const source = LEGACY_WATER_BY_KEY.get(localKey(sourceQ, sourceR));
  const neighbor = LEGACY_WATER_BY_KEY.get(localKey(neighborQ, neighborR));
  return source?.regime === 'river'
    && source.downstreamWaterCellKey === undefined
    && neighbor !== undefined
    && (neighbor.regime === 'ocean' || neighbor.regime === 'lake')
    && neighbor.surfaceLevelMilli <= source.surfaceLevelMilli
    && AXIAL_DIRECTIONS.some(
      ([q, r]) => sourceQ + q === neighborQ && sourceR + r === neighborR,
    );
}

export function hasGreaterRealmHydrologyTerminalOutletV1(
  source: GreaterRealmHydrologyLinkCellV1,
  neighbors: readonly GreaterRealmHydrologyLinkCellV1[],
): boolean {
  return neighbors.some(neighbor => (
    (
      neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.OCEAN
      || neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.LAKE
      || neighbor.hydroRegime === GREATER_REALM_HYDRO_REGIME.SEA
    )
    && neighbor.hydroSurfaceMilli <= source.hydroSurfaceMilli
  ));
}

export function requireGreaterRealmHydrologyTerminalOutletV1(
  lockAuthorizedTerminal: boolean,
  source: GreaterRealmHydrologyLinkCellV1,
  neighbors: readonly GreaterRealmHydrologyLinkCellV1[],
): void {
  if (
    !lockAuthorizedTerminal
    || !hasGreaterRealmHydrologyTerminalOutletV1(source, neighbors)
  ) fail('GREATER_REALM_HYDROLOGY_TERMINAL_OUTLET_INVALID');
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

export function requireGreaterRealmHydrologyLinkV1(
  source: GreaterRealmHydrologyLinkCellV1,
  downstream: GreaterRealmHydrologyLinkCellV1,
): void {
  const downstreamIsDry = downstream.hydroRegime === GREATER_REALM_HYDRO_REGIME.DRY;
  if (
    downstreamIsDry
    && source.hydroRegime !== GREATER_REALM_HYDRO_REGIME.LAKE
    && source.hydroRegime !== GREATER_REALM_HYDRO_REGIME.MARSH
  ) {
    fail('GREATER_REALM_HYDROLOGY_DRY_TARGET_INVALID');
  }
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
