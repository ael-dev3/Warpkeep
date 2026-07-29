import { describe, expect, it } from 'vitest';

import {
  realmWorkerSfxEvents,
  type RealmWorkerSfxSnapshot
} from '../src/components/realm/realmWorkerSfxPresentation';

function worker(
  workerId: string,
  status: RealmWorkerSfxSnapshot['status'],
  ownedByViewer = true
): RealmWorkerSfxSnapshot {
  return { ownedByViewer, status, workerId };
}

describe('authoritative Worker SFX projection', () => {
  it('aggregates dispatch and Recall All reconciliation without identities', () => {
    const previous = [
      worker('worker-1', 'idle'),
      worker('worker-2', 'idle'),
      worker('worker-3', 'gathering'),
      worker('worker-4', 'outbound')
    ];
    const current = [
      worker('worker-1', 'outbound'),
      worker('worker-2', 'gathering'),
      worker('worker-3', 'returning'),
      worker('worker-4', 'returning')
    ];

    expect(realmWorkerSfxEvents(previous, current)).toEqual([
      { kind: 'worker-dispatch-confirmed', count: 2 },
      { kind: 'worker-recall-confirmed', count: 2 }
    ]);
  });

  it('clusters arrivals and returns while excluding passive peer Workers', () => {
    const previous = [
      worker('owner-arrival', 'outbound'),
      worker('owner-return', 'returning'),
      worker('peer-arrival', 'outbound', false),
      worker('peer-return', 'returning', false)
    ];
    const current = [
      worker('owner-arrival', 'gathering'),
      worker('owner-return', 'idle'),
      worker('peer-arrival', 'gathering', false),
      worker('peer-return', 'idle', false)
    ];

    expect(realmWorkerSfxEvents(previous, current)).toEqual([
      { kind: 'worker-arrived', count: 1 },
      { kind: 'worker-returned', count: 1 }
    ]);
  });

  it('emits nothing for initial, unchanged, removed, or newly observed rows', () => {
    const stable = [
      worker('worker-1', 'idle'),
      worker('worker-2', 'gathering')
    ];
    expect(realmWorkerSfxEvents([], stable)).toEqual([]);
    expect(realmWorkerSfxEvents(stable, stable)).toEqual([]);
    expect(realmWorkerSfxEvents(stable, [worker('worker-3', 'outbound')])).toEqual([]);
    expect(realmWorkerSfxEvents(stable, [])).toEqual([]);
  });
});
