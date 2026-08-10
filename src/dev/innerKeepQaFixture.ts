import {
  INNER_KEEP_LAYOUT_V1_DIGEST,
  INNER_KEEP_LAYOUT_V1_ID,
  INNER_KEEP_LAYOUT_V1_SLOTS,
  INNER_KEEP_LAYOUT_V1_VERSION
} from '../components/inner-keep/innerKeepLayoutV1';
import {
  innerKeepCatalogueEffectCopy,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepCatalogueEntry,
  type InnerKeepPresentation,
  type InnerKeepResourceAmounts,
  type InnerKeepSlotPresentation
} from '../components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_STATIC_RUNTIME_ASSETS
} from '../components/inner-keep/innerKeepRuntimeAssetCatalog.generated';
import type { InnerKeepQaScenario } from './innerKeepQaScenarioManifest.mjs';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  INNER_KEEP_POLICY_VERSION
} from '../../spacetimedb/src/innerKeepPolicy';

const SYNTHETIC_CASTLE_ID = 700_000_000_000_000_007n;
const DAY_MICROS = 86_400_000_000n;

const STORED_RESOURCES: InnerKeepResourceAmounts = Object.freeze({
  food: 20_000n,
  wood: 20_000n,
  stone: 20_000n,
  gold: 20_000n
});
const NO_RESOURCES: InnerKeepResourceAmounts = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n
});

const SLOT_LABELS = Object.freeze([
  'West Courtyard',
  'Northwest Terrace',
  'North Market Site',
  'East Courtyard',
  'West Road Site',
  'East Road Site',
  'Southwest Green',
  'Southeast Green',
  'Northwest Reserve',
  'Northeast Reserve',
  'Southwest Reserve',
  'Southeast Reserve'
]);

const QA_SLOTS: readonly InnerKeepSlotPresentation[] = Object.freeze(
  INNER_KEEP_LAYOUT_V1_SLOTS.map((slot, index) => Object.freeze({
    slotId: slot.slotId,
    label: SLOT_LABELS[index]!,
    footprintClass: slot.footprintClass,
    sortOrder: slot.sortOrder,
    active: slot.active
  }))
);

const QA_BUILDING_PREVIEW_PATHS = new Map(
  INNER_KEEP_STATIC_RUNTIME_ASSETS
    .filter((asset) => asset.family === 'buildings' && asset.preview !== undefined)
    .map((asset) => [asset.id, asset.preview!.path] as const)
);

function exactQaBuildingPreviewPath(buildingKind: InnerKeepBuildingKind) {
  const path = QA_BUILDING_PREVIEW_PATHS.get(buildingKind);
  if (!path) throw new TypeError(`Missing reviewed QA preview for ${buildingKind}.`);
  return path;
}

const QA_CATALOGUE: readonly InnerKeepCatalogueEntry[] = Object.freeze(
  CANONICAL_INNER_KEEP_BUILDING_CATALOG.map((policy) => Object.freeze({
    buildingKind: policy.buildingKind,
    label: policy.publicLabel.toUpperCase(),
    footprintClass: policy.footprintClass,
    maximumLevel: policy.maximumLevel,
    matchingDiscountResource: policy.matchingDiscountResource,
    discountBasisPointsPerLevel: policy.discountBasisPointsPerLevel,
    discountCapBasisPoints: policy.discountCapBasisPoints,
    effectCopy: innerKeepCatalogueEffectCopy(
      policy.matchingDiscountResource,
      policy.discountBasisPointsPerLevel,
      policy.discountCapBasisPoints,
    ),
    previewUrl: exactQaBuildingPreviewPath(policy.buildingKind)
  }))
);

const QA_MISSING_ASSET_CATALOGUE: readonly InnerKeepCatalogueEntry[] =
  Object.freeze(QA_CATALOGUE.map((entry) => {
    if (entry.buildingKind !== 'city-mill') return entry;
    return Object.freeze({
      buildingKind: entry.buildingKind,
      label: entry.label,
      footprintClass: entry.footprintClass,
      maximumLevel: entry.maximumLevel,
      matchingDiscountResource: entry.matchingDiscountResource,
      discountBasisPointsPerLevel: entry.discountBasisPointsPerLevel,
      discountCapBasisPoints: entry.discountCapBasisPoints,
      effectCopy: entry.effectCopy
    });
  }));

const LEVEL_ONE_COSTS: Readonly<Record<
  InnerKeepBuildingKind,
  InnerKeepResourceAmounts
>> = Object.freeze({
  'city-mill': Object.freeze({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
  'lumber-camp': Object.freeze({ food: 500n, wood: 700n, stone: 650n, gold: 0n }),
  'city-stoneworks': Object.freeze({ food: 500n, wood: 900n, stone: 450n, gold: 0n }),
  'city-goldworks': Object.freeze({ food: 700n, wood: 1_200n, stone: 1_000n, gold: 500n })
});

function constructionBuilding(
  progressBasisPoints: number,
  observedAtMicros: bigint
): InnerKeepBuildingPresentation {
  const elapsed = DAY_MICROS * BigInt(progressBasisPoints) / 10_000n;
  const startedAtMicros = observedAtMicros - elapsed;
  return Object.freeze({
    slotId: 'inner-keep-slot-m01',
    buildingKind: 'city-mill',
    completedLevel: 0,
    targetLevel: 1,
    phase: 'constructing',
    startedAtMicros,
    completesAtMicros: startedAtMicros + DAY_MICROS,
    revision: 1n
  });
}

function completedBuilding(level: number, revision = 1n): InnerKeepBuildingPresentation {
  return Object.freeze({
    slotId: 'inner-keep-slot-m01',
    buildingKind: 'city-mill',
    completedLevel: level,
    targetLevel: level,
    phase: 'complete',
    revision
  });
}

function buildingsForScenario(
  scenario: InnerKeepQaScenario,
  observedAtMicros: bigint
) {
  if (
    scenario.state === 'constructing'
    || scenario.state === 'completion-reveal'
    || scenario.state === 'builder-busy'
  ) {
    return Object.freeze([
      constructionBuilding(scenario.progressBasisPoints ?? 5_000, observedAtMicros)
    ]);
  }
  if (
    scenario.state === 'complete'
    || scenario.state === 'missing-asset'
  ) {
    return Object.freeze([completedBuilding(scenario.level ?? 1)]);
  }
  return Object.freeze([]);
}

function quotesForBuildings(buildings: readonly InnerKeepBuildingPresentation[]) {
  const existing = buildings[0];
  return Object.freeze(QA_SLOTS.flatMap((slot) => {
    if (!slot.active) return [];
    return QA_CATALOGUE.flatMap((entry) => {
      if (existing?.buildingKind === entry.buildingKind) {
        if (
          existing.phase !== 'complete'
          || existing.completedLevel >= entry.maximumLevel
          || slot.slotId !== existing.slotId
        ) return [];
        return [Object.freeze({
          slotId: slot.slotId,
          buildingKind: entry.buildingKind,
          targetLevel: existing.completedLevel + 1,
          cost: LEVEL_ONE_COSTS[entry.buildingKind],
          durationMicros: DAY_MICROS,
          policyVersion: INNER_KEEP_POLICY_VERSION,
          available: true
        })];
      }
      if (existing?.slotId === slot.slotId) return [];
      return [Object.freeze({
        slotId: slot.slotId,
        buildingKind: entry.buildingKind,
        targetLevel: 1,
        cost: LEVEL_ONE_COSTS[entry.buildingKind],
        durationMicros: DAY_MICROS,
        policyVersion: INNER_KEEP_POLICY_VERSION,
        available: true
      })];
    });
  }));
}

export function createSyntheticInnerKeepQaPresentation(
  scenario: InnerKeepQaScenario,
  observedAtMicros = BigInt(Date.now()) * 1_000n
): InnerKeepPresentation {
  const buildings = buildingsForScenario(scenario, observedAtMicros);
  const constructing = buildings.find((building) => building.phase === 'constructing');
  return Object.freeze({
    phase: constructing ? 'constructing' : 'ready',
    castleId: SYNTHETIC_CASTLE_ID,
    layoutId: INNER_KEEP_LAYOUT_V1_ID,
    layoutVersion: INNER_KEEP_LAYOUT_V1_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_V1_DIGEST,
    projectRevision: 1n,
    commandsEnabled: true,
    resources: Object.freeze({
      available: scenario.state === 'insufficient' ? NO_RESOURCES : STORED_RESOURCES,
      pending: NO_RESOURCES,
      observedAtMicros
    }),
    slots: QA_SLOTS,
    catalogue: scenario.state === 'missing-asset'
      ? QA_MISSING_ASSET_CATALOGUE
      : QA_CATALOGUE,
    buildings,
    quotes: quotesForBuildings(buildings),
    builder: constructing ? Object.freeze({
      state: 'busy' as const,
      slotId: constructing.slotId,
      buildingKind: constructing.buildingKind,
      targetLevel: constructing.targetLevel,
      completesAtMicros: constructing.completesAtMicros!
    }) : Object.freeze({ state: 'idle' as const })
  });
}

export function completeSyntheticInnerKeepQaPresentation(
  presentation: InnerKeepPresentation
): InnerKeepPresentation {
  const building = presentation.buildings.find((entry) => entry.phase === 'constructing');
  if (!building) return presentation;
  return Object.freeze({
    ...presentation,
    phase: 'completion-observed',
    projectRevision: presentation.projectRevision + 1n,
    buildings: Object.freeze([Object.freeze({
      slotId: building.slotId,
      buildingKind: building.buildingKind,
      completedLevel: building.targetLevel,
      targetLevel: building.targetLevel,
      phase: 'complete' as const,
      revision: building.revision + 1n
    })]),
    builder: Object.freeze({ state: 'idle' as const })
  });
}

export const INNER_KEEP_QA_SYNTHETIC_CASTLE_ID = SYNTHETIC_CASTLE_ID;
export const INNER_KEEP_QA_CONSTRUCTION_DURATION_MICROS = DAY_MICROS;
