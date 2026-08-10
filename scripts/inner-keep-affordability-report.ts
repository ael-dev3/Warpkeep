import { pathToFileURL } from 'node:url';

import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  INNER_KEEP_MAXIMUM_LEVEL,
  INNER_KEEP_RESOURCE_BALANCE_CAP,
  canonicalInnerKeepCost,
  type InnerKeepResourceKind,
} from '../spacetimedb/src/innerKeepPolicy';
import {
  CASTLE_WORKERS_PER_CASTLE,
  workerResourcePolicy,
} from '../spacetimedb/src/castleWorkerPolicy';
import {
  REALM_RESOURCE_QUANTUM_MICROS,
  REALM_RESOURCE_TERRAIN_RATES,
} from '../spacetimedb/src/resourceAuthorityPolicy';

const DAY_MICROS = 24n * 60n * 60n * 1_000_000n;
const REVIEWED_GATHERING_WINDOW_MINUTES = 3n * 24n * 60n;
const MAXIMUM_COST_ACCOUNT_CAP_DIVISOR = 20n;
const RESOURCE_ORDER = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold',
] as const satisfies readonly InnerKeepResourceKind[]);

type TerrainKind = keyof typeof REALM_RESOURCE_TERRAIN_RATES;

export type InnerKeepAffordabilityRow = Readonly<{
  terrain: TerrainKind;
  buildingKind: string;
  buildingLabel: string;
  passiveDay: Readonly<Record<InnerKeepResourceKind, bigint>>;
  deficits: Readonly<Record<InnerKeepResourceKind, bigint>>;
  assignedResourceCount: number;
  longestGatheringMinutes: bigint;
  totalGatheringMinutes: bigint;
  reachableWithFourWorkersInReviewedWindow: boolean;
  requiresGoldGathering: boolean;
}>;

export type InnerKeepAffordabilityReport = Readonly<{
  rows: readonly InnerKeepAffordabilityRow[];
  maximumLevelCost: bigint;
  allLevelOneProjectsReachable: boolean;
  allTerrainsProgressionCapable: boolean;
  noMandatoryFirstChoice: boolean;
  goldworksRequiresGathering: boolean;
  noCostApproachesAccountCap: boolean;
  activeReservationSafety: 'enforced-by-authoritative-settlement';
}>;

function ceilDiv(value: bigint, divisor: bigint) {
  return value === 0n ? 0n : (value + divisor - 1n) / divisor;
}

function passiveDayFor(terrain: TerrainKind) {
  const quanta = DAY_MICROS / REALM_RESOURCE_QUANTUM_MICROS;
  const rates = REALM_RESOURCE_TERRAIN_RATES[terrain];
  return Object.freeze(Object.fromEntries(RESOURCE_ORDER.map(resource => [
    resource,
    rates[resource] * quanta,
  ])) as Record<InnerKeepResourceKind, bigint>);
}

function gatheringMinutesFor(resource: InnerKeepResourceKind, deficit: bigint) {
  const policy = workerResourcePolicy(resource);
  const quanta = ceilDiv(deficit, policy.ratePerQuantum);
  return ceilDiv(quanta * policy.quantumMicros, 60_000_000n);
}

export function buildInnerKeepAffordabilityReport(): InnerKeepAffordabilityReport {
  const rows: InnerKeepAffordabilityRow[] = [];
  let maximumLevelCost = 0n;

  for (const building of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    const levelFive = canonicalInnerKeepCost(
      building.buildingKind,
      INNER_KEEP_MAXIMUM_LEVEL,
    );
    for (const resource of RESOURCE_ORDER) {
      if (levelFive.rawCost[resource] > maximumLevelCost) {
        maximumLevelCost = levelFive.rawCost[resource];
      }
    }

    const levelOne = canonicalInnerKeepCost(building.buildingKind, 1);
    for (const terrain of Object.keys(REALM_RESOURCE_TERRAIN_RATES) as TerrainKind[]) {
      const passiveDay = passiveDayFor(terrain);
      const deficits = Object.freeze(Object.fromEntries(RESOURCE_ORDER.map(resource => [
        resource,
        levelOne.effectiveCost[resource] > passiveDay[resource]
          ? levelOne.effectiveCost[resource] - passiveDay[resource]
          : 0n,
      ])) as Record<InnerKeepResourceKind, bigint>);
      const gatheringMinutes = RESOURCE_ORDER.map(resource => (
        gatheringMinutesFor(resource, deficits[resource])
      ));
      const assignedResourceCount = gatheringMinutes.filter(minutes => minutes > 0n).length;
      const longestGatheringMinutes = gatheringMinutes.reduce(
        (maximum, minutes) => minutes > maximum ? minutes : maximum,
        0n,
      );
      const totalGatheringMinutes = gatheringMinutes.reduce(
        (total, minutes) => total + minutes,
        0n,
      );
      rows.push(Object.freeze({
        terrain,
        buildingKind: building.buildingKind,
        buildingLabel: building.publicLabel,
        passiveDay,
        deficits,
        assignedResourceCount,
        longestGatheringMinutes,
        totalGatheringMinutes,
        // One worker can cover each nonzero resource bucket in parallel. This
        // deliberately leaves travel out of the exact number; UI estimates
        // must label return travel separately and stored authority still wins.
        reachableWithFourWorkersInReviewedWindow:
          assignedResourceCount <= CASTLE_WORKERS_PER_CASTLE
          && longestGatheringMinutes <= REVIEWED_GATHERING_WINDOW_MINUTES,
        requiresGoldGathering: deficits.gold > 0n,
      }));
    }
  }

  const allLevelOneProjectsReachable = rows.every(row => (
    row.reachableWithFourWorkersInReviewedWindow
  ));
  const allTerrainsProgressionCapable = (
    Object.keys(REALM_RESOURCE_TERRAIN_RATES) as TerrainKind[]
  ).every(terrain => rows
    .filter(row => row.terrain === terrain)
    .every(row => row.reachableWithFourWorkersInReviewedWindow));
  // Every terrain can reach every Level-1 recipe from the same zero-balance
  // starting assumption. No completed Inner Keep discount is required, so the
  // simulation does not make one building a mathematical prerequisite.
  const noMandatoryFirstChoice = CANONICAL_INNER_KEEP_BUILDING_CATALOG.every(
    building => rows
      .filter(row => row.buildingKind === building.buildingKind)
      .every(row => row.reachableWithFourWorkersInReviewedWindow),
  );
  const goldworksRows = rows.filter(row => row.buildingKind === 'city-goldworks');
  const goldworksRequiresGathering = goldworksRows.length > 0
    && goldworksRows.every(row => row.requiresGoldGathering);
  // A single resource component must stay below five percent of the account
  // cap. This accommodates the deliberately larger civic landmark while still
  // leaving a twenty-times safety margin against the authoritative ceiling.
  const noCostApproachesAccountCap = maximumLevelCost
    < INNER_KEEP_RESOURCE_BALANCE_CAP / MAXIMUM_COST_ACCOUNT_CAP_DIVISOR;

  if (
    !allLevelOneProjectsReachable
    || !allTerrainsProgressionCapable
    || !noMandatoryFirstChoice
    || !goldworksRequiresGathering
    || !noCostApproachesAccountCap
  ) {
    throw new Error('INNER_KEEP_AFFORDABILITY_CONTRACT_FAILED');
  }

  return Object.freeze({
    rows: Object.freeze(rows),
    maximumLevelCost,
    allLevelOneProjectsReachable,
    allTerrainsProgressionCapable,
    noMandatoryFirstChoice,
    goldworksRequiresGathering,
    noCostApproachesAccountCap,
    activeReservationSafety: 'enforced-by-authoritative-settlement',
  });
}

function formatCost(cost: Readonly<Record<InnerKeepResourceKind, bigint>>) {
  return RESOURCE_ORDER.map(resource => `${resource}=${cost[resource]}`).join(', ');
}

export function formatInnerKeepAffordabilityReport(
  report: InnerKeepAffordabilityReport,
) {
  const lines = [
    '# Inner Keep V1 affordability report',
    '',
    'Assumption: zero stored resources, one exact day of passive terrain output,',
    'with one external Worker assigned to each remaining resource bucket at the',
    'current rate. Every project fits the reviewed three-day gathering window;',
    'the civic landmark is intentionally a longer first project than a workshop.',
    'Travel is deliberately excluded from the minute number and must remain a',
    'presentation caveat. Only stored server-authoritative balances are spendable.',
    '',
    '| Terrain | Building | Remaining after passive day | Longest Worker assignment | Reachable |',
    '| --- | --- | --- | ---: | --- |',
    ...report.rows.map(row => (
      `| ${row.terrain} | ${row.buildingLabel} | ${formatCost(row.deficits)} | `
      + `${row.longestGatheringMinutes} min | `
      + `${row.reachableWithFourWorkersInReviewedWindow ? 'yes' : 'no'} |`
    )),
    '',
    `Maximum raw Level-5 resource component: ${report.maximumLevelCost.toString()}.`,
    `All Level-1 terrain/building pairs reachable: ${report.allLevelOneProjectsReachable}.`,
    `No Level-1 building is a mandatory first choice: ${report.noMandatoryFirstChoice}.`,
    `Goldworks always requires Gold gathering: ${report.goldworksRequiresGathering}.`,
    `Maximum cost remains below 5% of account cap: ${report.noCostApproachesAccountCap}.`,
    'Active expedition reservations are protected by the existing authoritative settlement path.',
  ];
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(formatInnerKeepAffordabilityReport(
    buildInnerKeepAffordabilityReport(),
  ));
}
