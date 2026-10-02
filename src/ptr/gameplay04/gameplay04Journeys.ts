import type { GreaterRealmJourney } from '../../greater-realm/greaterRealmJourneyLayer';
import type { View04 } from './gameplay04Presentation';

const milliseconds = (micros: bigint) => Number(micros / 1_000n);

/**
 * The owner's confirmed Worker journeys for the world map: phase, resource,
 * the server-captured route and its captured times. No yields, balances or
 * targets beyond what the validated keep state already reports.
 */
export function gameplay04Journeys(view: View04 | null): readonly GreaterRealmJourney[] {
  if (view === null) return Object.freeze([]);
  return Object.freeze(view.state.workers.flatMap(worker => {
    const assignment = worker.assignment;
    if (assignment === undefined) return [];
    const phase = assignment.phase;
    if (phase !== 'outbound' && phase !== 'gathering' && phase !== 'returning') return [];
    return [Object.freeze({
      ordinal: worker.ordinal, phase,
      // Empty recalls keep the captured route/times but never acquire cargo.
      resource: phase === 'returning' && assignment.earned === 0n ? null : assignment.resource as GreaterRealmJourney['resource'],
      route: assignment.route,
      dispatchedAtMs: milliseconds(assignment.dispatchedAt), arrivesAtMs: milliseconds(assignment.arrivesAt),
      gatheringStopsAtMs: milliseconds(assignment.gatheringStopsAt), returnsAtMs: milliseconds(assignment.returnsAt),
      recalledAtMs: assignment.recalledAt === undefined ? null : milliseconds(assignment.recalledAt),
    })];
  }));
}
