import {
  INNER_KEEP_RESOURCE_ORDER,
  innerKeepCatalogueEffectCopy,
  innerKeepPresentationIntegrity,
  isInnerKeepBuildingKind,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepCatalogueEntry,
  type InnerKeepPresentation,
  type InnerKeepProjectQuote,
  type InnerKeepResource,
  type InnerKeepResourceAmounts,
  type InnerKeepSlotPresentation
} from '../components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_STATIC_RUNTIME_ASSETS
} from '../components/inner-keep/innerKeepRuntimeAssetCatalog.generated';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_MAXIMUM_LEVEL,
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION,
  canonicalInnerKeepCost,
  matchesCanonicalInnerKeepBuildingPolicy,
  matchesCanonicalInnerKeepLevelPolicy,
  type InnerKeepCompletedLevels
} from '../../spacetimedb/src/innerKeepPolicy';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
  matchesCanonicalInnerKeepLayout,
  matchesCanonicalInnerKeepSlot
} from '../../spacetimedb/src/innerKeepLayoutPolicy';
import type {
  InnerKeepCommandAttempt,
  InnerKeepCommandScope,
  InnerKeepReconciliationBuilding,
  InnerKeepRequestReceipt
} from './innerKeepCommandIdempotency';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from './warpkeepProtocol';

const U64_MAX = (1n << 64n) - 1n;
const RESOURCE_BALANCE_CAP = 1_000_000n;
const INNER_KEEP_BUILDING_KINDS = Object.freeze(
  CANONICAL_INNER_KEEP_BUILDING_CATALOG.map((row) => row.buildingKind)
);
const INNER_KEEP_BUILDING_PREVIEW_PATHS = new Map(
  INNER_KEEP_STATIC_RUNTIME_ASSETS
    .filter((asset) => asset.family === 'buildings' && asset.preview !== undefined)
    .map((asset) => [asset.id, asset.preview!.path] as const)
);

const PRIVATE_STATE_KEYS = Object.freeze([
  'castleId',
  'componentActive',
  'componentReady',
  'builderPresent',
  'builderBusy',
  'activeBuildingKey',
  'busyUntilMicros',
  'builderRevision',
  'storedFood',
  'storedWood',
  'storedStone',
  'storedGold',
  'projectedFood',
  'projectedWood',
  'projectedStone',
  'projectedGold',
  'resourceRevision',
  'observedAtMicros',
  'policyVersion',
  'layoutDigest',
  'assetCatalogDigest'
] as const);

const REQUEST_STATUS_KEYS = Object.freeze([
  'found',
  'castleId',
  'buildingKey',
  'slotId',
  'buildingKind',
  'targetLevel',
  'deductedFood',
  'deductedWood',
  'deductedStone',
  'deductedGold',
  'startedAtMicros',
  'policyVersion'
] as const);

export type InnerKeepReadScope = Readonly<{
  generation: number;
  fid: number;
  castleId: bigint;
  backendProtocolVersion: number;
}>;

export type InnerKeepPrivateState = Readonly<{
  castleId: bigint;
  componentActive: true;
  componentReady: true;
  builderPresent: true;
  builderBusy: boolean;
  activeBuildingKey?: string;
  busyUntilMicros?: bigint;
  builderRevision: bigint;
  available: InnerKeepResourceAmounts;
  projected: InnerKeepResourceAmounts;
  resourceRevision: bigint;
  observedAtMicros: bigint;
  policyVersion: typeof INNER_KEEP_POLICY_VERSION;
  layoutDigest: typeof INNER_KEEP_LAYOUT_DIGEST;
  assetCatalogDigest: typeof INNER_KEEP_ASSET_CATALOG_DIGEST;
}>;

export type InnerKeepLayoutRow = Readonly<{
  layoutId: string;
  layoutVersion: number;
  policyVersion: string;
  slotCount: number;
  mediumSlotCount: number;
  largeSlotCount: number;
  assetCatalogDigest: string;
  layoutDigest: string;
  active: boolean;
  activatedAt?: unknown;
}>;

export type InnerKeepSlotRow = Readonly<{
  slotId: string;
  layoutId: string;
  footprintClass: string;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  sortOrder: number;
  active: boolean;
}>;

export type InnerKeepBuildingCatalogRow = Readonly<{
  buildingKind: string;
  publicLabel: string;
  category: string;
  footprintClass: string;
  maximumLevel: number;
  uniquePerCastle: boolean;
  matchingDiscountResource: string;
  discountBasisPointsPerLevel: number;
  discountCapBasisPoints: number;
  runtimeAssetId: string;
  previewAssetId: string;
  active: boolean;
  policyVersion: string;
}>;

export type InnerKeepBuildLevelRow = Readonly<{
  levelKey: string;
  buildingKind: string;
  targetLevel: number;
  baseFoodCost: bigint;
  baseWoodCost: bigint;
  baseStoneCost: bigint;
  baseGoldCost: bigint;
  levelMultiplierBasisPoints: number;
  durationMicros: bigint;
  policyVersion: string;
}>;

export type InnerKeepBuildingRow = InnerKeepReconciliationBuilding & Readonly<{
  slotKey: string;
  completesAtMicros: bigint;
  revision: bigint;
}>;

export type InnerKeepPublicRows = Readonly<{
  layouts: readonly InnerKeepLayoutRow[];
  slots: readonly InnerKeepSlotRow[];
  catalogue: readonly InnerKeepBuildingCatalogRow[];
  levels: readonly InnerKeepBuildLevelRow[];
  buildings: readonly InnerKeepBuildingRow[];
}>;

export type ReadyInnerKeepProjection = Readonly<{
  scope: InnerKeepCommandScope;
  presentation: InnerKeepPresentation;
  buildings: readonly InnerKeepBuildingRow[];
}>;

type ExactRecord = Readonly<Record<string, unknown>>;

function exactPlainDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): ExactRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) return undefined;
    const result: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function u64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= U64_MAX;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalU64(value: unknown): value is bigint | undefined {
  return value === undefined || u64(value);
}

function resourceAmounts(
  food: bigint,
  wood: bigint,
  stone: bigint,
  gold: bigint
): InnerKeepResourceAmounts {
  return Object.freeze({ food, wood, stone, gold });
}

/**
 * Decode the exact caller-only procedure result and bind it to the verified
 * connection generation/castle. Inactive or not-yet-ready components are a
 * normal additive absence; malformed active state is a hard invalid result.
 */
export function decodeInnerKeepPrivateState(
  value: unknown,
  scope: InnerKeepReadScope
): InnerKeepPrivateState | 'unavailable' | undefined {
  if (
    !positiveSafeInteger(scope.generation)
    || !positiveSafeInteger(scope.fid)
    || !u64(scope.castleId)
    || scope.castleId === 0n
    || scope.backendProtocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  ) return undefined;
  const raw = exactPlainDataRecord(value, PRIVATE_STATE_KEYS);
  if (raw === undefined) return undefined;
  if (
    !u64(raw.castleId)
    || raw.castleId !== scope.castleId
    || typeof raw.componentActive !== 'boolean'
    || typeof raw.componentReady !== 'boolean'
    || typeof raw.builderPresent !== 'boolean'
    || typeof raw.builderBusy !== 'boolean'
    || !optionalString(raw.activeBuildingKey)
    || !optionalU64(raw.busyUntilMicros)
    || !u64(raw.builderRevision)
    || !u64(raw.storedFood)
    || !u64(raw.storedWood)
    || !u64(raw.storedStone)
    || !u64(raw.storedGold)
    || !u64(raw.projectedFood)
    || !u64(raw.projectedWood)
    || !u64(raw.projectedStone)
    || !u64(raw.projectedGold)
    || !u64(raw.resourceRevision)
    || !u64(raw.observedAtMicros)
    || raw.policyVersion !== INNER_KEEP_POLICY_VERSION
    || raw.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || raw.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
  ) return undefined;
  if (!raw.componentActive || !raw.componentReady) return 'unavailable';
  if (!raw.builderPresent) return undefined;
  const busyPairPresent = raw.activeBuildingKey !== undefined
    && raw.busyUntilMicros !== undefined;
  if (raw.builderBusy !== busyPairPresent) return undefined;
  const available = resourceAmounts(
    raw.storedFood,
    raw.storedWood,
    raw.storedStone,
    raw.storedGold
  );
  const projected = resourceAmounts(
    raw.projectedFood,
    raw.projectedWood,
    raw.projectedStone,
    raw.projectedGold
  );
  if (INNER_KEEP_RESOURCE_ORDER.some((resource) => (
    available[resource] > RESOURCE_BALANCE_CAP
    || projected[resource] > RESOURCE_BALANCE_CAP
    || projected[resource] < available[resource]
  ))) return undefined;
  return Object.freeze({
    castleId: scope.castleId,
    componentActive: true as const,
    componentReady: true as const,
    builderPresent: true as const,
    builderBusy: raw.builderBusy,
    ...(raw.activeBuildingKey === undefined ? {} : {
      activeBuildingKey: raw.activeBuildingKey
    }),
    ...(raw.busyUntilMicros === undefined ? {} : {
      busyUntilMicros: raw.busyUntilMicros
    }),
    builderRevision: raw.builderRevision,
    available,
    projected,
    resourceRevision: raw.resourceRevision,
    observedAtMicros: raw.observedAtMicros,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST
  });
}

export function decodeInnerKeepRequestStatus(
  value: unknown,
  scope: InnerKeepReadScope
): InnerKeepRequestReceipt | undefined {
  if (
    !positiveSafeInteger(scope.fid)
    || !u64(scope.castleId)
    || scope.castleId === 0n
    || scope.backendProtocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  ) {
    return undefined;
  }
  const raw = exactPlainDataRecord(value, REQUEST_STATUS_KEYS);
  if (raw === undefined || typeof raw.found !== 'boolean') return undefined;
  if (!raw.found) {
    return REQUEST_STATUS_KEYS.slice(1).every((key) => raw[key] === undefined)
      ? Object.freeze({ found: false as const })
      : undefined;
  }
  if (
    !u64(raw.castleId)
    || raw.castleId !== scope.castleId
    || typeof raw.buildingKey !== 'string'
    || typeof raw.slotId !== 'string'
    || typeof raw.buildingKind !== 'string'
    || !isInnerKeepBuildingKind(raw.buildingKind)
    || !positiveSafeInteger(raw.targetLevel)
    || raw.targetLevel > INNER_KEEP_MAXIMUM_LEVEL
    || !u64(raw.deductedFood)
    || !u64(raw.deductedWood)
    || !u64(raw.deductedStone)
    || !u64(raw.deductedGold)
    || !u64(raw.startedAtMicros)
    || raw.policyVersion !== INNER_KEEP_POLICY_VERSION
  ) return undefined;
  return Object.freeze({
    found: true as const,
    castleId: scope.castleId,
    buildingKey: raw.buildingKey,
    slotId: raw.slotId,
    buildingKind: raw.buildingKind,
    targetLevel: raw.targetLevel,
    deducted: resourceAmounts(
      raw.deductedFood,
      raw.deductedWood,
      raw.deductedStone,
      raw.deductedGold
    ),
    startedAtMicros: raw.startedAtMicros,
    policyVersion: INNER_KEEP_POLICY_VERSION
  });
}

function slotLabel(slot: InnerKeepSlotRow) {
  return slot.active
    ? `Build site ${slot.sortOrder}`
    : `Reserved large site ${slot.sortOrder - 8}`;
}

function completedLevels(
  buildings: readonly InnerKeepBuildingRow[]
): InnerKeepCompletedLevels {
  const result: Partial<Record<InnerKeepBuildingKind, number>> = {};
  for (const building of buildings) {
    result[building.buildingKind] = building.completedLevel;
  }
  return Object.freeze(result);
}

function publicRowsAreCanonical(rows: InnerKeepPublicRows) {
  if (
    rows.layouts.length !== 1
    || rows.slots.length !== CANONICAL_INNER_KEEP_SLOTS.length
    || rows.catalogue.length !== CANONICAL_INNER_KEEP_BUILDING_CATALOG.length
    || rows.levels.length !== CANONICAL_INNER_KEEP_LEVEL_POLICIES.length
  ) return false;
  const layout = rows.layouts[0]!;
  if (
    !matchesCanonicalInnerKeepLayout(layout)
    || !layout.active
    || layout.activatedAt === undefined
  ) return false;
  const slotIds = new Set<string>();
  for (const slot of rows.slots) {
    if (slotIds.has(slot.slotId) || !matchesCanonicalInnerKeepSlot(slot)) return false;
    slotIds.add(slot.slotId);
  }
  const catalogueKinds = new Set<string>();
  for (const entry of rows.catalogue) {
    if (
      catalogueKinds.has(entry.buildingKind)
      || !matchesCanonicalInnerKeepBuildingPolicy(entry)
    ) return false;
    catalogueKinds.add(entry.buildingKind);
  }
  const levelKeys = new Set<string>();
  for (const level of rows.levels) {
    if (levelKeys.has(level.levelKey) || !matchesCanonicalInnerKeepLevelPolicy(level)) {
      return false;
    }
    levelKeys.add(level.levelKey);
  }
  return true;
}

function canonicalOwnBuildings(
  rows: readonly InnerKeepBuildingRow[],
  privateState: InnerKeepPrivateState,
  scope: InnerKeepReadScope
): readonly InnerKeepBuildingRow[] | undefined {
  const own = rows.filter((row) => row.castleId === scope.castleId);
  if (own.length > INNER_KEEP_BUILDING_KINDS.length) return undefined;
  const kinds = new Set<string>();
  const slots = new Set<string>();
  let constructing: InnerKeepBuildingRow | undefined;
  for (const row of own) {
    const slot = CANONICAL_INNER_KEEP_SLOTS.find((candidate) => candidate.slotId === row.slotId);
    if (
      !isInnerKeepBuildingKind(row.buildingKind)
      || kinds.has(row.buildingKind)
      || slots.has(row.slotId)
      || slot === undefined
      || !slot.active
      || row.buildingKey !== `${scope.castleId.toString()}:${row.buildingKind}`
      || row.slotKey !== `${scope.castleId.toString()}:${row.slotId}`
      || row.policyVersion !== INNER_KEEP_POLICY_VERSION
      || !Number.isSafeInteger(row.completedLevel)
      || row.completedLevel < 0
      || !Number.isSafeInteger(row.targetLevel)
      || row.targetLevel < 1
      || row.targetLevel > INNER_KEEP_MAXIMUM_LEVEL
      || !u64(row.startedAtMicros)
      || !u64(row.completesAtMicros)
      || row.startedAtMicros > row.completesAtMicros
      || !u64(row.revision)
      || (row.phase !== 'constructing' && row.phase !== 'complete')
      || (row.phase === 'constructing' && row.targetLevel !== row.completedLevel + 1)
      || (row.phase === 'complete' && row.targetLevel !== row.completedLevel)
    ) return undefined;
    if (row.phase === 'constructing') {
      if (constructing !== undefined) return undefined;
      constructing = row;
    }
    kinds.add(row.buildingKind);
    slots.add(row.slotId);
  }
  if (privateState.builderBusy) {
    if (
      constructing === undefined
      || constructing.buildingKey !== privateState.activeBuildingKey
      || constructing.completesAtMicros !== privateState.busyUntilMicros
    ) return undefined;
  } else if (constructing !== undefined) {
    return undefined;
  }
  return Object.freeze([...own].sort((left, right) => left.slotId.localeCompare(right.slotId)));
}

function quoteBlockedReason(
  slot: InnerKeepSlotRow,
  buildingKind: InnerKeepBuildingKind,
  buildings: readonly InnerKeepBuildingRow[],
  builderBusy: boolean
) {
  const building = buildings.find((row) => row.buildingKind === buildingKind);
  if (!slot.active) return 'This large site is reserved for a future release.';
  if (slot.footprintClass !== 'medium') return 'This project needs a medium build site.';
  if (builderBusy) return 'The Builder is already working on another project.';
  if (building !== undefined && building.slotId !== slot.slotId) {
    return 'This unique building already occupies another site.';
  }
  if (building?.phase === 'constructing') return 'This project is already under construction.';
  if (building?.completedLevel === INNER_KEEP_MAXIMUM_LEVEL) {
    return 'This building has reached Level 5.';
  }
  if (buildings.some((row) => row.slotId === slot.slotId && row.buildingKind !== buildingKind)) {
    return 'This site is already occupied.';
  }
  return undefined;
}

export function resolveReadyInnerKeepProjection(input: Readonly<{
  scope: InnerKeepReadScope;
  privateState: InnerKeepPrivateState;
  rows: InnerKeepPublicRows;
  commandsAvailable: boolean;
  pendingAttempt?: InnerKeepCommandAttempt;
  statusMessage?: string;
}>): ReadyInnerKeepProjection | undefined {
  const { scope, privateState, rows, pendingAttempt } = input;
  if (
    !positiveSafeInteger(scope.generation)
    || !positiveSafeInteger(scope.fid)
    || !u64(scope.castleId)
    || scope.castleId === 0n
    || scope.backendProtocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    || privateState.castleId !== scope.castleId
    || privateState.policyVersion !== INNER_KEEP_POLICY_VERSION
    || privateState.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || privateState.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
    || !publicRowsAreCanonical(rows)
  ) return undefined;
  const ownBuildings = canonicalOwnBuildings(rows.buildings, privateState, scope);
  if (ownBuildings === undefined) return undefined;
  if (
    pendingAttempt !== undefined
    && (
      pendingAttempt.scope.generation !== scope.generation
      || pendingAttempt.scope.fid !== scope.fid
      || pendingAttempt.scope.castleId !== scope.castleId
      || pendingAttempt.scope.backendProtocolVersion !== scope.backendProtocolVersion
      || pendingAttempt.scope.policyDigest !== INNER_KEEP_POLICY_DIGEST
      || pendingAttempt.scope.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
      || pendingAttempt.scope.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
    )
  ) return undefined;

  const sortedSlots = Object.freeze([...rows.slots].sort((left, right) => (
    left.sortOrder - right.sortOrder
  )));
  const slots: readonly InnerKeepSlotPresentation[] = Object.freeze(sortedSlots.map((slot) => (
    Object.freeze({
      slotId: slot.slotId,
      label: slotLabel(slot),
      footprintClass: slot.footprintClass as 'medium' | 'large',
      sortOrder: slot.sortOrder,
      active: slot.active
    })
  )));
  const catalogue: readonly InnerKeepCatalogueEntry[] = Object.freeze(
    CANONICAL_INNER_KEEP_BUILDING_CATALOG.map((canonical) => {
      const row = rows.catalogue.find((candidate) => (
        candidate.buildingKind === canonical.buildingKind
      ))!;
      return Object.freeze({
        buildingKind: canonical.buildingKind,
        label: row.publicLabel,
        footprintClass: 'medium' as const,
        maximumLevel: row.maximumLevel,
        matchingDiscountResource: row.matchingDiscountResource as InnerKeepResource,
        discountBasisPointsPerLevel: row.discountBasisPointsPerLevel,
        discountCapBasisPoints: row.discountCapBasisPoints,
        effectCopy: innerKeepCatalogueEffectCopy(
          row.matchingDiscountResource as InnerKeepResource,
          row.discountBasisPointsPerLevel,
          row.discountCapBasisPoints,
        ),
        // Ignore server-provided paths. This path comes only from the exact,
        // owner-authorized, generated browser asset catalog.
        previewUrl: INNER_KEEP_BUILDING_PREVIEW_PATHS.get(canonical.buildingKind)
      });
    })
  );
  const buildings: readonly InnerKeepBuildingPresentation[] = Object.freeze(
    ownBuildings.map((row) => Object.freeze({
      slotId: row.slotId,
      buildingKind: row.buildingKind,
      completedLevel: row.completedLevel,
      targetLevel: row.targetLevel,
      phase: row.phase,
      startedAtMicros: row.startedAtMicros,
      completesAtMicros: row.completesAtMicros,
      revision: row.revision
    }))
  );
  const completed = completedLevels(ownBuildings);
  const quotes: InnerKeepProjectQuote[] = [];
  for (const slot of sortedSlots) {
    for (const buildingKind of INNER_KEEP_BUILDING_KINDS) {
      const current = ownBuildings.find((row) => row.buildingKind === buildingKind);
      const targetLevel = current?.phase === 'complete'
        ? current.completedLevel + 1
        : 1;
      if (targetLevel > INNER_KEEP_MAXIMUM_LEVEL) continue;
      const cost = canonicalInnerKeepCost(buildingKind, targetLevel, completed);
      const blockedReason = quoteBlockedReason(
        slot,
        buildingKind,
        ownBuildings,
        privateState.builderBusy
      );
      quotes.push(Object.freeze({
        slotId: slot.slotId,
        buildingKind,
        targetLevel,
        cost: cost.effectiveCost,
        durationMicros: cost.durationMicros,
        policyVersion: cost.policyVersion,
        available: blockedReason === undefined,
        ...(blockedReason === undefined ? {} : { blockedReason })
      }));
    }
  }
  const constructing = ownBuildings.find((building) => building.phase === 'constructing');
  const builder = constructing === undefined
    ? Object.freeze({ state: 'idle' as const })
    : Object.freeze({
        state: 'busy' as const,
        slotId: constructing.slotId,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros
      });
  const pending = resourceAmounts(
    privateState.projected.food - privateState.available.food,
    privateState.projected.wood - privateState.available.wood,
    privateState.projected.stone - privateState.available.stone,
    privateState.projected.gold - privateState.available.gold
  );
  const projectRevision = privateState.builderRevision
    + privateState.resourceRevision
    + ownBuildings.reduce((sum, building) => sum + building.revision, 0n);
  const commandsEnabled = input.commandsAvailable
    && pendingAttempt === undefined
    && builder.state === 'idle';
  const phase: InnerKeepPresentation['phase'] = pendingAttempt?.phase === 'sending'
    ? 'project-submitting'
    : pendingAttempt !== undefined
      ? 'synchronizing'
      : !input.commandsAvailable
        ? 'read-only'
        : builder.state === 'busy'
          ? 'constructing'
          : 'ready';
  const statusMessage = input.statusMessage
    ?? (pendingAttempt === undefined
      ? !input.commandsAvailable
        ? 'Construction controls are read-only until current Realm authority is restored.'
        : undefined
      : pendingAttempt.phase === 'ambiguous'
        ? 'The result is uncertain. Waiting for the private receipt and public project to agree.'
        : 'Waiting for the Realm to confirm the construction receipt and public project.');
  const presentation: InnerKeepPresentation = Object.freeze({
    phase,
    castleId: scope.castleId,
    layoutId: CANONICAL_INNER_KEEP_LAYOUT.layoutId,
    layoutVersion: CANONICAL_INNER_KEEP_LAYOUT.layoutVersion,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    projectRevision,
    commandsEnabled,
    ...(statusMessage === undefined ? {} : { statusMessage }),
    resources: Object.freeze({
      available: privateState.available,
      pending,
      observedAtMicros: privateState.observedAtMicros
    }),
    slots,
    catalogue,
    buildings,
    quotes: Object.freeze(quotes),
    builder
  });
  if (!innerKeepPresentationIntegrity(presentation)) return undefined;
  const commandScope: InnerKeepCommandScope = Object.freeze({
    generation: scope.generation,
    fid: scope.fid,
    castleId: scope.castleId,
    backendProtocolVersion: scope.backendProtocolVersion,
    layoutId: CANONICAL_INNER_KEEP_LAYOUT.layoutId,
    layoutVersion: CANONICAL_INNER_KEEP_LAYOUT.layoutVersion,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    policyDigest: INNER_KEEP_POLICY_DIGEST,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
    projectRevision
  });
  return Object.freeze({
    scope: commandScope,
    presentation,
    buildings: ownBuildings
  });
}
