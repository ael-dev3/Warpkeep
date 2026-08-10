import {
  innerKeepCatalogueEffectCopy,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepPlacementTransform,
  type InnerKeepPresentation,
  type InnerKeepResourceAmounts
} from '../../src/components/inner-keep/innerKeepPresentation';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  INNER_KEEP_POLICY_VERSION,
  canonicalInnerKeepCost,
  type InnerKeepCompletedLevels
} from '../../spacetimedb/src/innerKeepPolicy';

const AVAILABLE: InnerKeepResourceAmounts = Object.freeze({
  food: 10_000n,
  wood: 10_000n,
  stone: 10_000n,
  gold: 10_000n
});

const ZERO: InnerKeepResourceAmounts = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n
});

export const INNER_KEEP_TEST_PLACEMENTS: Readonly<Record<
  InnerKeepBuildingKind,
  InnerKeepPlacementTransform
>> = Object.freeze({
  'city-mill': Object.freeze({
    localXMicrounits: 14_000_000n,
    localZMicrounits: -10_000_000n,
    rotationMilliDegrees: 0
  }),
  'lumber-camp': Object.freeze({
    localXMicrounits: 29_000_000n,
    localZMicrounits: -10_000_000n,
    rotationMilliDegrees: 0
  }),
  'city-stoneworks': Object.freeze({
    localXMicrounits: 14_000_000n,
    localZMicrounits: 10_000_000n,
    rotationMilliDegrees: 0
  }),
  'city-goldworks': Object.freeze({
    localXMicrounits: 29_000_000n,
    localZMicrounits: 10_000_000n,
    rotationMilliDegrees: 0
  }),
  'city-barracks': Object.freeze({
    localXMicrounits: 24_000_000n,
    localZMicrounits: -29_000_000n,
    rotationMilliDegrees: 0
  }),
  'grand-covenant-cathedral': Object.freeze({
    localXMicrounits: -24_000_000n,
    localZMicrounits: -22_000_000n,
    rotationMilliDegrees: 0
  })
});

export function createInnerKeepTestBuilding(options: Readonly<{
  buildingKind: InnerKeepBuildingKind;
  completedLevel?: number;
  targetLevel?: number;
  phase?: InnerKeepBuildingPresentation['phase'];
  startedAtMicros?: bigint;
  completesAtMicros?: bigint;
  revision?: bigint;
  placement?: InnerKeepPlacementTransform;
}>): InnerKeepBuildingPresentation {
  const phase = options.phase ?? 'complete';
  const completedLevel = options.completedLevel ?? (phase === 'complete' ? 1 : 0);
  const targetLevel = options.targetLevel
    ?? (phase === 'complete' ? completedLevel : completedLevel + 1);
  return Object.freeze({
    buildingKey: `7:${options.buildingKind}`,
    buildingKind: options.buildingKind,
    placement: options.placement ?? INNER_KEEP_TEST_PLACEMENTS[options.buildingKind],
    completedLevel,
    targetLevel,
    phase,
    ...(phase === 'constructing' ? {
      startedAtMicros: options.startedAtMicros ?? 1n,
      completesAtMicros: options.completesAtMicros ?? 86_400_000_001n
    } : {
      ...(options.startedAtMicros === undefined ? {} : {
        startedAtMicros: options.startedAtMicros
      }),
      ...(options.completesAtMicros === undefined ? {} : {
        completesAtMicros: options.completesAtMicros
      })
    }),
    revision: options.revision ?? 1n
  });
}

const CATALOGUE: InnerKeepPresentation['catalogue'] = Object.freeze(
  CANONICAL_INNER_KEEP_BUILDING_CATALOG.map((policy) => Object.freeze({
    buildingKind: policy.buildingKind,
    label: policy.publicLabel,
    category: policy.category,
    footprintClass: policy.footprintClass,
    maximumLevel: policy.maximumLevel,
    matchingDiscountResource: policy.matchingDiscountResource,
    discountBasisPointsPerLevel: policy.discountBasisPointsPerLevel,
    discountCapBasisPoints: policy.discountCapBasisPoints,
    effectCopy: innerKeepCatalogueEffectCopy(
      policy.matchingDiscountResource,
      policy.discountBasisPointsPerLevel,
      policy.discountCapBasisPoints
    )
  }))
);

export function createInnerKeepPresentation(options: Readonly<{
  available?: InnerKeepResourceAmounts;
  buildings?: readonly InnerKeepBuildingPresentation[];
  builder?: InnerKeepPresentation['builder'];
  commandsEnabled?: boolean;
  phase?: InnerKeepPresentation['phase'];
  projectRevision?: bigint;
  statusMessage?: string;
}> = {}): InnerKeepPresentation {
  const buildings = options.buildings ?? [];
  const builder = options.builder ?? Object.freeze({ state: 'idle' as const });
  const completed = Object.freeze(Object.fromEntries(buildings
    .filter((building) => building.completedLevel > 0)
    .map((building) => [building.buildingKind, building.completedLevel])
  )) as InnerKeepCompletedLevels;
  const quotes = CATALOGUE.flatMap((entry) => {
    const existing = buildings.find((building) => (
      building.buildingKind === entry.buildingKind
    ));
    const targetLevel = existing?.phase === 'complete'
      ? existing.completedLevel + 1
      : 1;
    if (targetLevel > entry.maximumLevel) return [];
    const cost = canonicalInnerKeepCost(entry.buildingKind, targetLevel, completed);
    return [Object.freeze({
      buildingKind: entry.buildingKind,
      targetLevel,
      cost: cost.effectiveCost,
      durationMicros: cost.durationMicros,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      available: builder.state === 'idle',
      ...(builder.state === 'idle' ? {} : {
        blockedReason: 'The Builder is already working on another project.'
      })
    })];
  });
  return Object.freeze({
    phase: options.phase ?? 'ready',
    castleId: 7n,
    layoutId: 'genesis-001-inner-keep-v1',
    layoutVersion: 1,
    layoutDigest: '1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7',
    projectRevision: options.projectRevision ?? 1n,
    commandsEnabled: options.commandsEnabled ?? true,
    ...(options.statusMessage === undefined ? {} : {
      statusMessage: options.statusMessage
    }),
    resources: Object.freeze({
      available: options.available ?? AVAILABLE,
      pending: ZERO,
      observedAtMicros: 1n
    }),
    catalogue: CATALOGUE,
    buildings,
    quotes: Object.freeze(quotes),
    builder
  });
}
