import { GAMEPLAY04_POLICY_VERSION, buildingCost04, buildingDuration04, gatheringYield04, travelPerEdge04, type CompletedLevels04, type Resource04 } from '../../spacetimedb/gameplay04/policy';
import { dispatchJourney04, observeJourney04 } from '../../spacetimedb/gameplay04/workerJourney';
import { GAMEPLAY04_LAYOUT_VERSION, evaluatePlacement04, type Placement04 } from '../../spacetimedb/gameplay04/placement';
import { GAMEPLAY04_LAYOUT_DIGEST } from '../../spacetimedb/gameplay04/construction';
import type { ReadWire04 } from '../ptr/gameplay04/ptrGameplay04Types';
import { decodeState04 } from '../ptr/gameplay04/gameplay04State';
import { presentState04 } from '../ptr/gameplay04/gameplay04Presentation';
import type { Snapshot04 } from '../ptr/gameplay04/createGameplay04Controller';
import type { Keep04UiSelection } from '../components/keep04/Keep04Screen';

export const KEEP04_QA_SCENARIOS = ['empty', 'mill-placement', 'blocked-placement', 'mill-constructing', 'mill-complete', 'all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle', 'living-keep'] as const;
export type Keep04QaScenarioId = typeof KEEP04_QA_SCENARIOS[number];
export const KEEP04_QA_LAYOUT: readonly Placement04[] = [
  { kind: 'city-mill', x: -15000000n, z: 15000000n, rotation: 0 },
  { kind: 'lumber-camp', x: -15000000n, z: 26000000n, rotation: 0 },
  { kind: 'city-stoneworks', x: 15000000n, z: 10000000n, rotation: 0 },
  { kind: 'city-goldworks', x: 15000000n, z: 22000000n, rotation: 0 },
  { kind: 'city-barracks', x: 20000000n, z: -30000000n, rotation: 0 },
  { kind: 'grand-covenant-cathedral', x: -25500000n, z: -23500000n, rotation: 0 },
];

// The accepted Task 2 freshWire04/constructingWire04/wireWithBuilding04 shapes,
// without importing their Vitest transport or synthetic capability into a browser.
export const EMPTY_WIRE04: ReadWire04 = {
  policyVersion: GAMEPLAY04_POLICY_VERSION, layoutVersion: GAMEPLAY04_LAYOUT_VERSION, layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
  revision: 1n, lastAcceptedSequence: 1n, food: 0n, wood: 0n, stone: 0n, gold: 0n,
  workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n, assignment: undefined, lastReturn: undefined })),
  buildings: [], project: undefined,
  completedLevels: { mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0 },
  completedEffects: { foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n, stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n, travelPerEdgeMicros: 2000000n, levelOneBuildDurationMicros: 120000000n },
};

/**
 * A decoder-valid synthetic journey derived through the real journey core, so
 * the fixture can never claim a phase, time or yield the server would reject.
 */
function qaAssignment04(resource: Resource04, levels: CompletedLevels04, dispatchedAtMicros: bigint, routeEdges: number, gatheringDurationMicros: bigint, nowMicros: bigint) {
  const journey = dispatchJourney04({ resource, dispatchedAt: dispatchedAtMicros, routeEdges, gatheringDurationMicros, completed: levels });
  const observed = observeJourney04(journey, nowMicros);
  if (observed.phase === 'complete') throw new Error('QA journey already returned.');
  return {
    locationId: `synthetic-local-qa-${resource}`, destinationCellKey: `synthetic-local-qa-cell-${routeEdges}`, resource,
    route: Array.from({ length: routeEdges + 1 }, (_, index) => ({ q: index, r: 0 })),
    dispatchedAt: journey.dispatchedAt, routeEdges, travelPerEdgeMicros: journey.travelPerEdgeMicros,
    gatheringDurationMicros, yieldPerQuantum: journey.yieldPerQuantum, recalledAt: undefined,
    phase: observed.phase, arrivesAt: observed.arrivesAt, gatheringStopsAt: observed.gatheringStopsAt, returnsAt: observed.returnsAt, earned: observed.earned,
  };
}

export function createKeep04QaScenario(id: Keep04QaScenarioId, nowMs = Date.now()) {
  if (!KEEP04_QA_SCENARIOS.includes(id)) throw new TypeError('Unknown local keep QA scenario.');
  if (id === 'living-keep') return createKeep04LivingQaScenario(nowMs);
  const all = ['all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle'].includes(id);
  const constructing = id === 'mill-constructing';
  const level = all ? 5 : id === 'mill-complete' ? 1 : 0;
  const layout = all ? KEEP04_QA_LAYOUT : constructing || level ? KEEP04_QA_LAYOUT.slice(0, 1) : [];
  for (const placement of layout) {
    if (!evaluatePlacement04(placement, layout.filter(other => other !== placement)).valid) throw new Error('Invalid QA layout.');
  }
  const levels: CompletedLevels04 = { 'city-mill': level, 'lumber-camp': all ? 5 : 0, 'city-stoneworks': all ? 5 : 0, 'city-goldworks': all ? 5 : 0, 'city-barracks': all ? 5 : 0, 'grand-covenant-cathedral': all ? 5 : 0 };
  const startedAtMicros = BigInt(nowMs - 15000) * 1000n;
  const wire: ReadWire04 = { ...EMPTY_WIRE04,
    ...(id === 'empty' ? {} : { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n }),
    buildings: layout.map(placement => ({ ...placement, completedLevel: level, revision: BigInt(Math.max(1, level)) })),
    completedLevels: { mill: level, lumberCamp: levels['lumber-camp'], stoneworks: levels['city-stoneworks'], goldworks: levels['city-goldworks'], barracks: levels['city-barracks'], cathedral: levels['grand-covenant-cathedral'] },
    completedEffects: { foodYieldPerQuantum: gatheringYield04('food', levels), woodYieldPerQuantum: gatheringYield04('wood', levels), stoneYieldPerQuantum: gatheringYield04('stone', levels), goldYieldPerQuantum: gatheringYield04('gold', levels), travelPerEdgeMicros: travelPerEdge04(levels), levelOneBuildDurationMicros: buildingDuration04(1, levels) },
    project: constructing ? { kind: 'city-mill', projectRevision: 1n, targetLevel: 1, startedAtMicros, completesAtMicros: startedAtMicros + 120000000n, durationMicros: 120000000n, cost: { food: 20n, wood: 40n, stone: 20n, gold: 0n } } : undefined,
  };
  const state = decodeState04(wire, { generation: 0, databaseIdentity: 'synthetic-local-qa-not-an-identity', anchorQ: 0, anchorR: 0 });
  const placing = id === 'mill-placement' || id === 'blocked-placement';
  // Local quote metadata only (Task 2 ATLAS04 shape), never a resource response or dispatch target.
  const snapshot: Snapshot04 = { phase: 'ready', problem: 'none', view: presentState04(state, placing ? { atlasId: 'synthetic-local-qa', revision: 1n } : null, nowMs) };
  const selection: Keep04UiSelection = { selectedKind: placing || constructing || level === 1 ? 'city-mill' : null,
    panel: placing ? 'buildings' : null, draft: placing ? { ...KEEP04_QA_LAYOUT[0], ...(id === 'blocked-placement' ? { x: 0n, z: 0n } : {}) } : null };
  return { id, synthetic: true as const, snapshot, selection, reducedMotion: id === 'reduced-motion' };
}

/**
 * A busy mid-game keep: all six buildings at level three, a Mill upgrade under
 * construction, and Workers outbound, gathering and returning. Every journey
 * and project is derived from the real policy and journey core.
 */
function createKeep04LivingQaScenario(nowMs: number) {
  const level = 3;
  const levels: CompletedLevels04 = { 'city-mill': level, 'lumber-camp': level, 'city-stoneworks': level, 'city-goldworks': level, 'city-barracks': level, 'grand-covenant-cathedral': level };
  const now = BigInt(nowMs) * 1000n; const second = 1_000_000n;
  const assignments = [
    qaAssignment04('wood', levels, now - 5n * second, 24, 600n * second, now),
    qaAssignment04('food', levels, now - 100n * second, 20, 600n * second, now),
    qaAssignment04('stone', levels, now - 115n * second, 20, 60n * second, now),
  ];
  const durationMicros = buildingDuration04(level + 1, levels); const startedAtMicros = now - 30n * second;
  const wire: ReadWire04 = { ...EMPTY_WIRE04, food: 640n, wood: 520n, stone: 480n, gold: 210n,
    workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: ordinal < 3 ? 1n : 0n, assignment: assignments[ordinal], lastReturn: undefined })),
    buildings: KEEP04_QA_LAYOUT.map(placement => ({ ...placement, completedLevel: level, revision: BigInt(level + (placement.kind === 'city-mill' ? 1 : 0)) })),
    completedLevels: { mill: level, lumberCamp: level, stoneworks: level, goldworks: level, barracks: level, cathedral: level },
    completedEffects: { foodYieldPerQuantum: gatheringYield04('food', levels), woodYieldPerQuantum: gatheringYield04('wood', levels), stoneYieldPerQuantum: gatheringYield04('stone', levels), goldYieldPerQuantum: gatheringYield04('gold', levels), travelPerEdgeMicros: travelPerEdge04(levels), levelOneBuildDurationMicros: buildingDuration04(1, levels) },
    project: { kind: 'city-mill', projectRevision: BigInt(level + 1), targetLevel: level + 1, startedAtMicros, completesAtMicros: startedAtMicros + durationMicros, durationMicros, cost: buildingCost04('city-mill', level + 1) },
  };
  const state = decodeState04(wire, { generation: 0, databaseIdentity: 'synthetic-local-qa-not-an-identity', anchorQ: 0, anchorR: 0 });
  const snapshot: Snapshot04 = { phase: 'ready', problem: 'none', view: presentState04(state, null, nowMs) };
  const selection: Keep04UiSelection = { selectedKind: null, panel: null, draft: null };
  return { id: 'living-keep' as const, synthetic: true as const, snapshot, selection, reducedMotion: false };
}
