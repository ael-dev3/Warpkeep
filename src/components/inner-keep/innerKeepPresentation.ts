import {
  INNER_KEEP_LAYOUT_V1_DIGEST,
  INNER_KEEP_LAYOUT_V1_ID,
  INNER_KEEP_LAYOUT_V1_VERSION
} from './innerKeepLayoutV1';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_RESOURCE_BALANCE_CAP
} from '../../../spacetimedb/src/innerKeepPolicy';
import {
  evaluateInnerKeepPlacement,
  type InnerKeepFreePlacementRotation,
  type InnerKeepOccupiedPlacement
} from './innerKeepFreePlacementPolicy';

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
export type InnerKeepBuildingCategory = 'economy' | 'military' | 'civic';
export type InnerKeepBuildingKind =
  | 'city-mill'
  | 'lumber-camp'
  | 'city-stoneworks'
  | 'city-goldworks'
  | 'city-barracks'
  | 'grand-covenant-cathedral';

export type InnerKeepPlacementTransform = Readonly<{
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
}>;

export type InnerKeepResourceAmounts = Readonly<Record<InnerKeepResource, bigint>>;

export function innerKeepBasisPointsPercentCopy(basisPoints: number) {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole}.${String(fraction).padStart(2, '0').replace(/0+$/, '')}%`;
}

export function innerKeepCatalogueEffectCopy(
  resource: InnerKeepResource | 'none',
  basisPointsPerLevel: number,
  capBasisPoints: number,
) {
  if (resource === 'none') {
    return 'A major town landmark. It does not apply a resource construction discount.';
  }
  const label = resource[0].toUpperCase() + resource.slice(1);
  return `Each completed level lowers future ${label} costs by ${
    innerKeepBasisPointsPercentCopy(basisPointsPerLevel)
  }, up to ${innerKeepBasisPointsPercentCopy(capBasisPoints)}.`;
}

export type InnerKeepCatalogueEntry = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  label: string;
  category: InnerKeepBuildingCategory;
  footprintClass: InnerKeepFootprintClass;
  maximumLevel: number;
  matchingDiscountResource: InnerKeepResource | 'none';
  discountBasisPointsPerLevel: number;
  discountCapBasisPoints: number;
  effectCopy: string;
  previewUrl?: string;
}>;

export type InnerKeepProjectQuote = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  targetLevel: number;
  cost: InnerKeepResourceAmounts;
  durationMicros: bigint;
  policyVersion: string;
  available: boolean;
  blockedReason?: string;
}>;

export type InnerKeepBuildingPresentation = Readonly<{
  buildingKey: string;
  buildingKind: InnerKeepBuildingKind;
  placement: InnerKeepPlacementTransform;
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
      buildingKey: string;
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
 * placements, timestamps, and availability must already come from the compatible
 * backend/controller. This type deliberately contains no FID, auth token,
 * receipt or request key. Placement coordinates are exact, quantized Realm
 * projection values and never browser-authored authority.
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
  catalogue: readonly InnerKeepCatalogueEntry[];
  buildings: readonly InnerKeepBuildingPresentation[];
  quotes: readonly InnerKeepProjectQuote[];
  builder: InnerKeepBuilderPresentation;
}>;

export type InnerKeepProjectIntent =
  | Readonly<{
      kind: 'construct';
      buildingKind: InnerKeepBuildingKind;
      placement: InnerKeepPlacementTransform;
    }>
  | Readonly<{
      kind: 'upgrade';
      buildingKind: InnerKeepBuildingKind;
    }>;

export type StartInnerKeepProject = (intent: InnerKeepProjectIntent) => Promise<void>;

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
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral'
]);

export function isInnerKeepBuildingKind(value: string): value is InnerKeepBuildingKind {
  return BUILDING_KINDS.has(value as InnerKeepBuildingKind);
}

export function innerKeepPlacementTransformIntegrity(
  placement: InnerKeepPlacementTransform
) {
  return placement.localXMicrounits >= -1_000_000_000n
    && placement.localXMicrounits <= 1_000_000_000n
    && placement.localZMicrounits >= -1_000_000_000n
    && placement.localZMicrounits <= 1_000_000_000n
    && placement.localXMicrounits % 500_000n === 0n
    && placement.localZMicrounits % 500_000n === 0n
    && Number.isSafeInteger(placement.rotationMilliDegrees)
    && [0, 90_000, 180_000, 270_000].includes(
      placement.rotationMilliDegrees
    );
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
  ) return false;

  const buildingKinds = new Set<InnerKeepBuildingKind>();
  const buildingKeys = new Set<string>();
  const occupiedPlacements: InnerKeepOccupiedPlacement[] = [];
  for (const building of presentation.buildings) {
    if (
      !isInnerKeepBuildingKind(building.buildingKind)
      || buildingKeys.has(building.buildingKey)
      || buildingKinds.has(building.buildingKind)
      || building.buildingKey !== `${presentation.castleId}:${building.buildingKind}`
      || !innerKeepPlacementTransformIntegrity(building.placement)
      || building.completedLevel < 0
      || building.targetLevel < 1
      || building.targetLevel > 5
      || building.completedLevel > building.targetLevel
      || (building.phase === 'constructing' && (
        building.targetLevel !== building.completedLevel + 1
        || building.startedAtMicros === undefined
        || building.completesAtMicros === undefined
      ))
      || (building.phase === 'complete' && building.targetLevel !== building.completedLevel)
      || (building.startedAtMicros !== undefined && (
        building.startedAtMicros < 0n || building.startedAtMicros > U64_MAX
      ))
      || (building.completesAtMicros !== undefined && (
        building.completesAtMicros < 0n || building.completesAtMicros > U64_MAX
      ))
      || (
        building.startedAtMicros !== undefined
        && building.completesAtMicros !== undefined
        && building.startedAtMicros > building.completesAtMicros
      )
      || building.revision < 0n
      || building.revision > U64_MAX
    ) return false;
    const placementEvaluation = evaluateInnerKeepPlacement(
      building.buildingKind,
      {
        ...building.placement,
        rotationMilliDegrees: building.placement.rotationMilliDegrees as
          InnerKeepFreePlacementRotation
      },
      occupiedPlacements
    );
    if (!placementEvaluation.valid) return false;
    buildingKeys.add(building.buildingKey);
    buildingKinds.add(building.buildingKind);
    occupiedPlacements.push(Object.freeze({
      buildingKey: building.buildingKey,
      buildingKind: building.buildingKind,
      localXMicrounits: building.placement.localXMicrounits,
      localZMicrounits: building.placement.localZMicrounits,
      rotationMilliDegrees: building.placement.rotationMilliDegrees as
        InnerKeepFreePlacementRotation
    }));
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
        || !constructingBuildings.some((building) => (
        building.buildingKey === builder.buildingKey
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
      && (presentation.resources.pending?.[resource] ?? 0n)
        <= INNER_KEEP_RESOURCE_BALANCE_CAP
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
      || entry.label !== expected.publicLabel
      || entry.category !== expected.category
      || entry.footprintClass !== expected.footprintClass
      || entry.maximumLevel !== expected.maximumLevel
      || entry.matchingDiscountResource !== expected.matchingDiscountResource
      || entry.discountBasisPointsPerLevel !== expected.discountBasisPointsPerLevel
      || entry.discountCapBasisPoints !== expected.discountCapBasisPoints
    ) return false;
    catalogueKinds.add(entry.buildingKind);
  }

  const quoteKeys = new Set<string>();
  for (const quote of presentation.quotes) {
    const quoteKey = `${quote.buildingKind}:${quote.targetLevel}`;
    if (
      quoteKeys.has(quoteKey)
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
  const expectedQuoteKeys = new Set(presentation.catalogue.flatMap((entry) => {
    const building = presentation.buildings.find((candidate) => (
      candidate.buildingKind === entry.buildingKind
    ));
    const targetLevel = building?.phase === 'complete'
      ? building.completedLevel + 1
      : 1;
    return targetLevel <= entry.maximumLevel
      ? [`${entry.buildingKind}:${targetLevel}`]
      : [];
  }));
  if (
    quoteKeys.size !== expectedQuoteKeys.size
    || [...quoteKeys].some((key) => !expectedQuoteKeys.has(key))
  ) return false;
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
