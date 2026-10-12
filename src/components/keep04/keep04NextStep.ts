import { buildingCost04, type Building04, type Resource04 } from '../../../spacetimedb/gameplay04/policy';
import { buildingDeficits04, type View04 } from '../../ptr/gameplay04/gameplay04Presentation';
import { formatKeep04Duration } from './formatKeep04Duration';

// The steward's one clear next step for a returning Keeper. It reads only the
// validated view: spendable balances, pending returns, Workers, the Builder
// and completed levels. It never decides a price, a target or an outcome; its
// actions open the existing catalog or resource search.

export type Keep04NextStep04 = Readonly<
  | { kind: 'build'; title: string; detail: string; building: Building04 }
  | { kind: 'gather'; title: string; detail: string; resource: Resource04; workerOrdinal: number }
  | { kind: 'wait'; title: string; detail: string }
>;

const NAMES: Readonly<Record<Building04, string>> = {
  'city-mill': 'City Mill', 'lumber-camp': 'Lumber Camp', 'city-stoneworks': 'City Stoneworks',
  'city-goldworks': 'City Goldworks', 'city-barracks': 'City Barracks', 'grand-covenant-cathedral': 'Grand Covenant Cathedral',
};
const RESOURCES = ['food', 'wood', 'stone', 'gold'] as const;
// Economy first (they improve every later journey), then the civic multipliers.
const PRIORITY: readonly Building04[] = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'];

function levelOf(view: View04, kind: Building04) {
  const c = view.state.completedLevels;
  return { 'city-mill': c.mill, 'lumber-camp': c.lumberCamp, 'city-stoneworks': c.stoneworks, 'city-goldworks': c.goldworks,
    'city-barracks': c.barracks, 'grand-covenant-cathedral': c.cathedral }[kind];
}

function totalCost(kind: Building04, level: number) {
  const cost = buildingCost04(kind, level);
  return RESOURCES.reduce((sum, resource) => sum + cost[resource], 0n);
}

/**
 * The lowest-level, cheapest open improvement, favouring economy buildings on
 * ties. A building already under construction is skipped: plan the next one.
 */
function nextImprovement(view: View04): Building04 | null {
  const open = PRIORITY.filter(kind => levelOf(view, kind) < 5 && view.state.project?.kind !== kind);
  if (!open.length) return null;
  return [...open].sort((left, right) => {
    const levels = levelOf(view, left) - levelOf(view, right); if (levels !== 0) return levels;
    const costs = totalCost(left, levelOf(view, left) + 1) - totalCost(right, levelOf(view, right) + 1);
    return costs < 0n ? -1 : costs > 0n ? 1 : PRIORITY.indexOf(left) - PRIORITY.indexOf(right);
  })[0];
}

function remaining(deadlineMicros: bigint, nowMs: number) {
  const now = BigInt(Math.max(0, Math.trunc(nowMs))) * 1_000n;
  if (deadlineMicros <= now) return null;
  return formatKeep04Duration(((deadlineMicros - now + 999_999n) / 1_000_000n) * 1_000_000n);
}

export function keep04NextStep04(view: View04, nowMs: number): Keep04NextStep04 | null {
  const project = view.state.project;
  const idle = view.workers.find(worker => worker.phase === 'idle');
  // 1. The Builder is free and an improvement is already paid for in spendable stock.
  if (project === undefined) {
    const affordable = PRIORITY.filter(kind => levelOf(view, kind) < 5)
      .filter(kind => RESOURCES.every(resource => buildingDeficits04(view, kind)[resource] === 0n));
    if (affordable.length) {
      const kind = affordable.sort((left, right) => levelOf(view, left) - levelOf(view, right))[0];
      const level = levelOf(view, kind) + 1;
      return { kind: 'build', building: kind, title: `${NAMES[kind]} level ${level} is ready to build`,
        detail: level === 1 ? 'Your stores cover the cost. Choose a site, then confirm to start construction.' : 'Your stores cover the upgrade. Review it and confirm to start construction.' };
    }
  }
  // 2. An idle Worker can close the gap toward the next improvement.
  const target = nextImprovement(view);
  if (idle && target) {
    const deficits = buildingDeficits04(view, target); const level = levelOf(view, target) + 1;
    const uncovered = RESOURCES.find(resource => deficits[resource] > view.pending[resource]);
    if (uncovered) {
      const missing = deficits[uncovered] - view.pending[uncovered];
      return { kind: 'gather', resource: uncovered, workerOrdinal: idle.ordinal,
        title: `Gather ${uncovered} for ${NAMES[target]} level ${level}`,
        detail: `${missing} more ${uncovered} is needed beyond what is already on its way home. Worker ${idle.ordinal + 1} is ready to go.` };
    }
    if (project === undefined && RESOURCES.some(resource => deficits[resource] > 0n)) {
      return { kind: 'wait', title: `${NAMES[target]} level ${level} is covered by returning Workers`,
        detail: 'Its cost becomes spendable when those Workers are confirmed home.' };
    }
    if (project !== undefined) {
      const stock = RESOURCES.reduce((lowest, resource) => view.balances[resource] + view.pending[resource] < view.balances[lowest] + view.pending[lowest] ? resource : lowest);
      return { kind: 'gather', resource: stock, workerOrdinal: idle.ordinal, title: `Stock up on ${stock} while the Builder works`,
        detail: `Your next project will need it, and Worker ${idle.ordinal + 1} is idle.` };
    }
  }
  // 3. Everyone is busy: say what happens next and when.
  if (project !== undefined) {
    const time = remaining(project.completesAtMicros, nowMs);
    const kind = PRIORITY.find(entry => entry === project.kind);
    return { kind: 'wait', title: `${kind ? NAMES[kind] : 'Construction'} level ${project.targetLevel} is underway`,
      detail: time ? `Estimated completion in ${time}. Its benefit starts once the Realm confirms it.` : 'Awaiting the Realm to confirm completion.' };
  }
  const nextReturn = view.workers.filter(worker => worker.returnsAtMicros !== null)
    .sort((left, right) => (left.returnsAtMicros! < right.returnsAtMicros! ? -1 : 1))[0];
  if (nextReturn) {
    const time = remaining(nextReturn.returnsAtMicros!, nowMs);
    return { kind: 'wait', title: `Worker ${nextReturn.ordinal + 1} is bringing ${nextReturn.resource ?? 'resources'} home`,
      detail: time ? `Estimated return in ${time}. Resources become spendable when the Realm confirms it.` : 'Awaiting the Realm to confirm the return.' };
  }
  return null;
}
