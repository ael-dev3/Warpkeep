import type { WarpkeepSfxEvent } from '../audio/sfxEvents';
import type { RealmWorkerPublicPresentation } from './realmWorkerPresentation';

export type RealmWorkerSfxSnapshot = Readonly<{
  ownedByViewer: boolean;
  status: RealmWorkerPublicPresentation['status'];
  workerId: string;
}>;

export function realmWorkerSfxSnapshot(
  workers: readonly RealmWorkerPublicPresentation[]
): readonly RealmWorkerSfxSnapshot[] {
  return Object.freeze(workers.map((worker) => Object.freeze({
    ownedByViewer: worker.ownedByViewer,
    status: worker.status,
    workerId: worker.workerId
  })));
}

/**
 * Converts authoritative owner-roster transitions into aggregate presentation
 * events. Command submission is intentionally absent: a promise resolving is
 * not proof that the public Realm projection has reconciled.
 */
export function realmWorkerSfxEvents(
  previous: readonly RealmWorkerSfxSnapshot[],
  current: readonly RealmWorkerSfxSnapshot[]
): readonly WarpkeepSfxEvent[] {
  const previousById = new Map(
    previous
      .filter((worker) => worker.ownedByViewer)
      .map((worker) => [worker.workerId, worker] as const)
  );
  const counts = {
    dispatch: 0,
    recall: 0,
    arrived: 0,
    returned: 0
  };

  for (const worker of current) {
    if (!worker.ownedByViewer) continue;
    const before = previousById.get(worker.workerId);
    if (!before || before.status === worker.status) continue;

    if (
      before.status === 'idle'
      && (worker.status === 'outbound' || worker.status === 'gathering')
    ) {
      counts.dispatch += 1;
    } else if (
      worker.status === 'returning'
      && before.status !== 'idle'
      && before.status !== 'returning'
    ) {
      counts.recall += 1;
    } else if (
      before.status === 'outbound'
      && worker.status === 'gathering'
    ) {
      counts.arrived += 1;
    } else if (
      before.status !== 'idle'
      && worker.status === 'idle'
    ) {
      counts.returned += 1;
    }
  }

  return Object.freeze([
    ...(counts.dispatch > 0
      ? [{ kind: 'worker-dispatch-confirmed' as const, count: counts.dispatch }]
      : []),
    ...(counts.recall > 0
      ? [{ kind: 'worker-recall-confirmed' as const, count: counts.recall }]
      : []),
    ...(counts.arrived > 0
      ? [{ kind: 'worker-arrived' as const, count: counts.arrived }]
      : []),
    ...(counts.returned > 0
      ? [{ kind: 'worker-returned' as const, count: counts.returned }]
      : [])
  ]);
}
