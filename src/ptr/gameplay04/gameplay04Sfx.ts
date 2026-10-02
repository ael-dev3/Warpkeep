import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { WarpkeepKeepSfxBuilding, WarpkeepSfxEvent, WarpkeepSfxResource } from '../../components/audio/sfxEvents';
import type { View04 } from './gameplay04Presentation';

export const GAMEPLAY04_SFX_BUILDING: Readonly<Record<Building04, WarpkeepKeepSfxBuilding>> = Object.freeze({
  'city-mill': 'mill', 'lumber-camp': 'lumber', 'city-stoneworks': 'stone',
  'city-goldworks': 'gold', 'city-barracks': 'barracks', 'grand-covenant-cathedral': 'cathedral',
});

const RESOURCES: readonly string[] = ['food', 'wood', 'stone', 'gold'];

/**
 * Sound cues for what changed between two validated keep views of one session.
 * It reads only revisions, phases, levels and the confirmed return outcome the
 * Realm has already published, so a cue can never announce an unconfirmed
 * command, and the first view after entry (no previous view) is silent.
 */
export function gameplay04SfxEvents(previous: View04 | null, next: View04 | null): WarpkeepSfxEvent[] {
  if (!previous || !next || next === previous) return [];
  // An older or equal-revision read carries nothing new to announce.
  if (next.state.revision <= previous.state.revision) return [];
  const events: WarpkeepSfxEvent[] = [];
  let dispatched = 0; let recalled = 0; let arrived = 0; let returned = 0;
  const credited = new Map<WarpkeepSfxResource, number>();
  for (const worker of next.state.workers) {
    const before = previous.state.workers.find(candidate => candidate.ordinal === worker.ordinal);
    if (!before) continue;
    const assignment = worker.assignment; const earlier = before.assignment;
    if (assignment && worker.assignmentRevision !== before.assignmentRevision && assignment.recalledAt === undefined) dispatched++;
    else if (assignment && earlier && worker.assignmentRevision === before.assignmentRevision) {
      if (earlier.recalledAt === undefined && assignment.recalledAt !== undefined) recalled++;
      else if (earlier.phase === 'outbound' && assignment.phase === 'gathering') arrived++;
    }
    const outcome = worker.lastReturn;
    if (outcome && outcome.assignmentRevision !== before.lastReturn?.assignmentRevision) {
      returned++;
      if (outcome.credited > 0n && RESOURCES.includes(outcome.resource)) {
        const resource = outcome.resource as WarpkeepSfxResource;
        credited.set(resource, (credited.get(resource) ?? 0) + 1);
      }
    }
  }
  if (dispatched) events.push({ kind: 'worker-dispatch-confirmed', count: dispatched });
  if (recalled) events.push({ kind: 'worker-recall-confirmed', count: recalled });
  if (arrived) events.push({ kind: 'worker-arrived', count: arrived });
  if (returned) events.push({ kind: 'worker-returned', count: returned });
  for (const [resource, count] of credited) events.push({ kind: 'keep-resources-credited', resource, count });
  const project = next.state.project;
  if (project && project.projectRevision !== previous.state.project?.projectRevision) events.push({ kind: 'keep-construction-started' });
  const improved = next.state.buildings.some(building => {
    const earlier = previous.state.buildings.find(candidate => candidate.kind === building.kind);
    return building.completedLevel > (earlier?.completedLevel ?? 0);
  });
  if (improved) events.push({ kind: 'keep-construction-completed' });
  return events;
}
