import type {
  InnerKeepBuildingPresentation,
  InnerKeepPresentation,
  InnerKeepResourceAmounts
} from '../../src/components/inner-keep/innerKeepPresentation';
import { INNER_KEEP_POLICY_VERSION } from '../../spacetimedb/src/innerKeepPolicy';

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

const SLOTS = Object.freeze([
  ...Array.from({ length: 8 }, (_, index) => Object.freeze({
    slotId: `inner-keep-slot-m${String(index + 1).padStart(2, '0')}`,
    label: [
      'West Courtyard',
      'Northwest Terrace',
      'North Market Site',
      'East Courtyard',
      'West Road Site',
      'East Road Site',
      'Southwest Green',
      'Southeast Green'
    ][index]!,
    footprintClass: 'medium' as const,
    sortOrder: index + 1,
    active: true
  })),
  ...Array.from({ length: 4 }, (_, index) => Object.freeze({
    slotId: `inner-keep-slot-l${String(index + 1).padStart(2, '0')}`,
    label: [
      'Northwest Reserve',
      'Northeast Reserve',
      'Southwest Reserve',
      'Southeast Reserve'
    ][index]!,
    footprintClass: 'large' as const,
    sortOrder: index + 9,
    active: false
  }))
]);

const CATALOGUE = Object.freeze([
  Object.freeze({
    buildingKind: 'city-mill' as const,
    label: 'CITY MILL',
    footprintClass: 'medium' as const,
    maximumLevel: 5,
    matchingDiscountResource: 'food' as const,
    discountBasisPointsPerLevel: 500,
    discountCapBasisPoints: 2_500,
    effectCopy: 'Food construction costs fall by 5% after each completed level.'
  }),
  Object.freeze({
    buildingKind: 'lumber-camp' as const,
    label: 'LUMBER CAMP',
    footprintClass: 'medium' as const,
    maximumLevel: 5,
    matchingDiscountResource: 'wood' as const,
    discountBasisPointsPerLevel: 500,
    discountCapBasisPoints: 2_500,
    effectCopy: 'Wood construction costs fall by 5% after each completed level.'
  }),
  Object.freeze({
    buildingKind: 'city-stoneworks' as const,
    label: 'CITY STONEWORKS',
    footprintClass: 'medium' as const,
    maximumLevel: 5,
    matchingDiscountResource: 'stone' as const,
    discountBasisPointsPerLevel: 500,
    discountCapBasisPoints: 2_500,
    effectCopy: 'Stone construction costs fall by 5% after each completed level.'
  }),
  Object.freeze({
    buildingKind: 'city-goldworks' as const,
    label: 'CITY GOLDWORKS',
    footprintClass: 'medium' as const,
    maximumLevel: 5,
    matchingDiscountResource: 'gold' as const,
    discountBasisPointsPerLevel: 500,
    discountCapBasisPoints: 2_500,
    effectCopy: 'Gold construction costs fall by 5% after each completed level.'
  })
]);

const COSTS = Object.freeze({
  'city-mill': Object.freeze({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
  'lumber-camp': Object.freeze({ food: 500n, wood: 700n, stone: 650n, gold: 0n }),
  'city-stoneworks': Object.freeze({ food: 500n, wood: 900n, stone: 450n, gold: 0n }),
  'city-goldworks': Object.freeze({ food: 700n, wood: 1_200n, stone: 1_000n, gold: 500n })
});

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
  return Object.freeze({
    phase: options.phase ?? 'ready',
    castleId: 7n,
    layoutId: 'genesis-001-inner-keep-v1',
    layoutVersion: 1,
    layoutDigest: 'c5bbb38f49b853e10ce61fe463cdf2428df2bad50f96e68826c26fe5fc65a534',
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
    slots: SLOTS,
    catalogue: CATALOGUE,
    buildings,
    quotes: Object.freeze(SLOTS.flatMap((slot) => (
      slot.footprintClass === 'medium'
        ? CATALOGUE.map((entry) => {
            const existing = buildings.find((building) => (
              building.slotId === slot.slotId
              && building.buildingKind === entry.buildingKind
            ));
            return Object.freeze({
              slotId: slot.slotId,
              buildingKind: entry.buildingKind,
              targetLevel: existing?.phase === 'complete'
                ? existing.completedLevel + 1
                : 1,
              cost: COSTS[entry.buildingKind],
              durationMicros: 86_400_000_000n,
              policyVersion: INNER_KEEP_POLICY_VERSION,
              available: true
            });
          })
        : []
    ))),
    builder: options.builder ?? Object.freeze({ state: 'idle' })
  });
}
