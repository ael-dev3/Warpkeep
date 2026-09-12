import { GAMEPLAY04_POLICY_VERSION, buildingDuration04, gatheringYield04, travelPerEdge04, type CompletedLevels04 } from '../../spacetimedb/gameplay04/policy';
import { GAMEPLAY04_LAYOUT_VERSION, evaluatePlacement04, type Placement04 } from '../../spacetimedb/gameplay04/placement';
import { GAMEPLAY04_LAYOUT_DIGEST } from '../../spacetimedb/gameplay04/construction';
import type { ReadWire04 } from '../ptr/gameplay04/ptrGameplay04Types';
import { decodeState04 } from '../ptr/gameplay04/gameplay04State';
import { presentState04 } from '../ptr/gameplay04/gameplay04Presentation';
import type { Snapshot04 } from '../ptr/gameplay04/createGameplay04Controller';
import type { Keep04UiSelection } from '../components/keep04/Keep04Screen';

export const KEEP04_QA_SCENARIOS = ['empty', 'mill-placement', 'blocked-placement', 'mill-constructing', 'mill-complete', 'all-six-level-five', 'fallback', 'reduced-motion', 'context-cycle'] as const;
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

export function createKeep04QaScenario(id: Keep04QaScenarioId, nowMs = Date.now()) {
  if (!KEEP04_QA_SCENARIOS.includes(id)) throw new TypeError('Unknown local keep QA scenario.');
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
