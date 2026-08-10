import {
  INNER_KEEP_LAYOUT_V1_DIGEST,
  INNER_KEEP_LAYOUT_V1_ID,
  INNER_KEEP_LAYOUT_V1_SLOT_BY_ID,
  INNER_KEEP_LAYOUT_V1_VERSION
} from './innerKeepLayoutV1';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
  INNER_KEEP_DISCOUNT_CAP_BPS,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_RESOURCE_BALANCE_CAP
} from '../../../spacetimedb/src/innerKeepPolicy';

export const INNER_KEEP_SLOT_COUNT = 12;
const U64_MAX = 18_446_744_073_709_551_615n;
export const INNER_KEEP_PROJECT_REVISION_MAX = BigInt(
  CANONICAL_INNER_KEEP_BUILDING_CATALOG.length + 2
) * U64_MAX;

export const INNER_KEEP_RESOURCE_ORDER = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold'
] as const);

export type InnerKeepResource = (typeof INNER_KEEP_RESOURCE_ORDER)[number];
export type InnerKeepFootprintClass = 'medium' | 'large';
export type InnerKeepBuildingKind =
  | 'city-mill'
  | 'lumber-camp'
  | 'city-stoneworks'
  | 'city-goldworks';

export type InnerKeepResourceAmounts = Readonly<Record<InnerKeepResource, bigint>>;

export type InnerKeepSlotPresentation = Readonly<{
  slotId: string;
  label: string;
  footprintClass: InnerKeepFootprintClass;
  sortOrder: number;
  active: boolean;
}>;

export type InnerKeepCatalogueEntry = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  label: string;
  footprintClass: InnerKeepFootprintClass;
  maximumLevel: number;
  matchingDiscountResource: InnerKeepResource;
  discountBasisPointsPerLevel: number;
  discountCapBasisPoints: number;
  effectCopy: string;
  previewUrl?: string;
}>;

export type InnerKeepProjectQuote = Readonly<{
  slotId: string;
  buildingKind: InnerKeepBuildingKind;
  targetLevel: number;
  cost: InnerKeepResourceAmounts;
  durationMicros: bigint;
  policyVersion: string;
  available: boolean;
  blockedReason?: string;
}>;

export type InnerKeepBuildingPresentation = Readonly<{
  slotId: string;
  buildingKind: InnerKeepBuildingKind;
  completedLevel: number;
  targetLevel: number;
  phase: 'constructing' | 'complete';
  startedAtMicros?: bigint;
  completesAtMicros?: bigint;
  revision: bigint;
}>;

export type InnerKeepBuilderPresentation =
  | Readonly<{ state: 'idle' }>
  | Readonly<{
      state: 'busy';
      slotId: string;
      buildingKind: InnerKeepBuildingKind;
      targetLevel: number;
      completesAtMicros: bigint;
    }>;

export type InnerKeepPresentationPhase =
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'synchronizing'
  | 'project-submitting'
  | 'constructing'
  | 'completion-observed'
  | 'failed'
  | 'read-only';

/**
 * Read-only, caller-bound projection consumed by the Inner Keep UI. Costs,
 * slots, timestamps, and availability must already come from the compatible
 * backend/controller. This type deliberately contains no FID, auth token,
 * receipt, request key, or arbitrary placement coordinates.
 */
export type InnerKeepPresentation = Readonly<{
  phase: InnerKeepPresentationPhase;
  /** Lossless u64. Never coerce this authority boundary to Number. */
  castleId: bigint;
  layoutId: string;
  layoutVersion: number;
  layoutDigest: string;
  projectRevision: bigint;
  commandsEnabled: boolean;
  statusMessage?: string;
  resources: Readonly<{
    available: InnerKeepResourceAmounts;
    /** Informational accrual only. It never enables a construction action. */
    pending?: InnerKeepResourceAmounts;
    observedAtMicros: bigint;
  }>;
  slots: readonly InnerKeepSlotPresentation[];
  catalogue: readonly InnerKeepCatalogueEntry[];
  buildings: readonly InnerKeepBuildingPresentation[];
  quotes: readonly InnerKeepProjectQuote[];
  builder: InnerKeepBuilderPresentation;
}>;

export type StartInnerKeepProject = (
  slotId: string,
  buildingKind: InnerKeepBuildingKind
) => Promise<void>;

/**
 * Marks a reviewed local preflight failure or exact server rollback. The
 * caller may offer another deliberate attempt because this outcome proves the
 * rejected call did not leave a commit-ambiguous construction transaction.
 */
export class InnerKeepProjectNoCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InnerKeepProjectNoCommitError';
  }
}

export function isInnerKeepProjectNoCommitError(
  error: unknown
): error is InnerKeepProjectNoCommitError {
  return error instanceof InnerKeepProjectNoCommitError;
}

const BUILDING_KINDS = new Set<InnerKeepBuildingKind>([
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks'
]);

export function isInnerKeepBuildingKind(value: string): value is InnerKeepBuildingKind {
  return BUILDING_KINDS.has(value as InnerKeepBuildingKind);
}

export function innerKeepPresentationIntegrity(
  presentation: InnerKeepPresentation
) {
  if (
    presentation.castleId < 1n
    || presentation.castleId > U64_MAX
    || presentation.layoutId !== INNER_KEEP_LAYOUT_V1_ID
    || presentation.layoutVersion !== INNER_KEEP_LAYOUT_V1_VERSION
    || presentation.layoutDigest !== INNER_KEEP_LAYOUT_V1_DIGEST
    || presentation.slots.length !== INNER_KEEP_SLOT_COUNT
  ) return false;

  const slotIds = new Set<string>();
  const sortOrders = new Set<number>();
  for (const slot of presentation.slots) {
    const expected = INNER_KEEP_LAYOUT_V1_SLOT_BY_ID.get(slot.slotId);
    if (
      !expected
      || slot.slotId.length === 0
      || slot.label.trim().length === 0
      || slot.footprintClass !== expected.footprintClass
      || slot.sortOrder !== expected.sortOrder
      || slot.active !== expected.active
      || slotIds.has(slot.slotId)
      || sortOrders.has(slot.sortOrder)
    ) return false;
    slotIds.add(slot.slotId);
    sortOrders.add(slot.sortOrder);
  }

  const buildingKinds = new Set<InnerKeepBuildingKind>();
  const buildingSlots = new Set<string>();
  for (const building of presentation.buildings) {
    const slotPolicy = INNER_KEEP_LAYOUT_V1_SLOT_BY_ID.get(building.slotId);
    if (
      !slotIds.has(building.slotId)
      || slotPolicy?.active !== true
      || !isInnerKeepBuildingKind(building.buildingKind)
      || buildingSlots.has(building.slotId)
      || buildingKinds.has(building.buildingKind)
      || building.completedLevel < 0
      || building.targetLevel < 1
      || building.targetLevel > 5
      || building.completedLevel > building.targetLevel
      || (building.phase === 'constructing' && building.completesAtMicros === undefined)
    ) return false;
    buildingSlots.add(building.slotId);
    buildingKinds.add(building.buildingKind);
  }

  const builder = presentation.builder;
  const constructingBuildings = presentation.buildings.filter((building) => (
    building.phase === 'constructing'
  ));
  if (
    (builder.state === 'idle' && constructingBuildings.length !== 0)
    || (
      builder.state === 'busy'
      && (
        constructingBuildings.length !== 1
        || !slotIds.has(builder.slotId)
        || !constructingBuildings.some((building) => (
        building.slotId === builder.slotId
        && building.buildingKind === builder.buildingKind
        && building.targetLevel === builder.targetLevel
      ))
    )
    )
  ) return false;

  if (
    presentation.projectRevision < 0n
    || presentation.projectRevision > INNER_KEEP_PROJECT_REVISION_MAX
    || presentation.resources.observedAtMicros < 0n
    || presentation.resources.observedAtMicros > U64_MAX
    || !INNER_KEEP_RESOURCE_ORDER.every((resource) => (
      presentation.resources.available[resource] >= 0n
      && presentation.resources.available[resource] <= INNER_KEEP_RESOURCE_BALANCE_CAP
      && (presentation.resources.pending?.[resource] ?? 0n) >= 0n
    ))
    || presentation.catalogue.length !== CANONICAL_INNER_KEEP_BUILDING_CATALOG.length
  ) return false;

  const catalogueKinds = new Set<InnerKeepBuildingKind>();
  for (const entry of presentation.catalogue) {
    const expected = CANONICAL_INNER_KEEP_BUILDING_CATALOG.find((candidate) => (
      candidate.buildingKind === entry.buildingKind
    ));
    if (
      expected === undefined
      || catalogueKinds.has(entry.buildingKind)
      || entry.label.trim().length === 0
      || entry.footprintClass !== expected.footprintClass
      || entry.maximumLevel !== expected.maximumLevel
      || entry.matchingDiscountResource !== expected.matchingDiscountResource
      || entry.discountBasisPointsPerLevel !== INNER_KEEP_DISCOUNT_BPS_PER_LEVEL
      || entry.discountCapBasisPoints !== INNER_KEEP_DISCOUNT_CAP_BPS
    ) return false;
    catalogueKinds.add(entry.buildingKind);
  }

  const quoteKeys = new Set<string>();
  for (const quote of presentation.quotes) {
    const quoteKey = `${quote.slotId}:${quote.buildingKind}:${quote.targetLevel}`;
    if (
      quoteKeys.has(quoteKey)
      || !slotIds.has(quote.slotId)
      || (
        INNER_KEEP_LAYOUT_V1_SLOT_BY_ID.get(quote.slotId)?.active !== true
        && quote.available !== false
      )
      || !isInnerKeepBuildingKind(quote.buildingKind)
      || !Number.isSafeInteger(quote.targetLevel)
      || quote.targetLevel < 1
      || quote.targetLevel > 5
      || quote.durationMicros <= 0n
      || quote.policyVersion !== INNER_KEEP_POLICY_VERSION
      || !INNER_KEEP_RESOURCE_ORDER.every((resource) => (
        quote.cost[resource] >= 0n
        && quote.cost[resource] <= INNER_KEEP_RESOURCE_BALANCE_CAP
      ))
    ) return false;
    quoteKeys.add(quoteKey);
  }
  return true;
}

export function innerKeepQuoteAffordable(
  quote: InnerKeepProjectQuote,
  available: InnerKeepResourceAmounts
) {
  return quote.available && INNER_KEEP_RESOURCE_ORDER.every((resource) => (
    available[resource] >= quote.cost[resource]
  ));
}

export function innerKeepQuoteBlockedReason(
  quote: InnerKeepProjectQuote,
  available: InnerKeepResourceAmounts
) {
  if (!quote.available) return quote.blockedReason ?? 'This project is unavailable.';
  const missing = INNER_KEEP_RESOURCE_ORDER.find((resource) => (
    available[resource] < quote.cost[resource]
  ));
  if (!missing) return undefined;
  return `Not enough ${missing[0]!.toUpperCase()}${missing.slice(1)}.`;
}
