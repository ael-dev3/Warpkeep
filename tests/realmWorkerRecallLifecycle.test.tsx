import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmResourceOccupantDetails } from '../src/components/realm/RealmResourceOccupantDetails';
import type {
  RealmResourceOccupantMarker
} from '../src/components/realm/realmResourceOccupantPresentation';
import type {
  RealmWorkerPublicPresentation
} from '../src/components/realm/realmWorkerPresentation';
import { useRealmWorkerRecallLifecycle } from '../src/components/realm/useRealmWorkerRecallLifecycle';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function publicWorker(
  overrides: Partial<RealmWorkerPublicPresentation> = {}
): RealmWorkerPublicPresentation {
  return {
    workerId: 'genesis-001-castle-7-worker-02',
    ordinal: 2,
    originCastleId: 7,
    originCastleName: 'Sunlit Bastion',
    status: 'gathering',
    resourceKind: 'wood',
    siteId: 'genesis-001:wood:0001',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 100n,
    returnsAtMicros: 120n,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: true,
    ...overrides
  };
}

function occupant(
  phase: RealmResourceOccupantMarker['workerPhase'] = 'gathering'
): RealmResourceOccupantMarker {
  return {
    source: 'generic-worker',
    resource: 'wood',
    siteId: 'genesis-001:wood:0001',
    nodeCoord: { q: 4, r: -2 },
    tier: 1,
    workerId: 'genesis-001-castle-7-worker-02',
    workerOrdinal: 2,
    workerPhase: phase,
    timelineRevision: phase === 'returning' ? 2 : 1,
    occupiedByViewer: true,
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 100n,
    returnsAtMicros: 120n,
    castle: {
      castleId: 7,
      name: 'Sunlit Bastion',
      q: 0,
      r: 0
    },
    profile: {
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      communityStatsVisible: false
    }
  };
}

function RecallSurface({
  show,
  worker,
  onRecallWorker
}: Readonly<{
  show: boolean;
  worker: RealmWorkerPublicPresentation;
  onRecallWorker: (workerId: string) => Promise<void>;
}>) {
  const lifecycle = useRealmWorkerRecallLifecycle({
    identityFid: 42,
    workers: [worker],
    onRecallWorker
  });
  if (!show) return <output data-testid="pending-count">{lifecycle.awaitingWorkerIds.size}</output>;
  return (
    <RealmResourceOccupantDetails
      awaitingAuthoritativeRecall={
        lifecycle.awaitingWorkerIds.has(worker.workerId)
      }
      marker={occupant(worker.status === 'returning' ? 'returning' : 'gathering')}
      onRecallWorker={lifecycle.recallWorker}
    />
  );
}

describe('Realm-wide Worker recall lifecycle', () => {
  it('retains one accepted recall while the resource inspector closes and reopens', async () => {
    vi.useFakeTimers();
    const onRecallWorker = vi.fn(async () => undefined);
    const worker = publicWorker();
    const view = render(
      <RecallSurface onRecallWorker={onRecallWorker} show worker={worker} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Recall Worker to Keep/i }));
      await Promise.resolve();
    });
    expect(onRecallWorker).toHaveBeenCalledOnce();
    expect(screen.getByText('Worker returning…').closest('button')
      ?.hasAttribute('disabled')).toBe(true);

    view.rerender(
      <RecallSurface onRecallWorker={onRecallWorker} show={false} worker={worker} />
    );
    expect(screen.getByTestId('pending-count').textContent).toBe('1');
    view.rerender(
      <RecallSurface onRecallWorker={onRecallWorker} show worker={worker} />
    );
    const reopened = screen.getByText('Worker returning…').closest('button');
    expect(reopened?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(reopened!);
    expect(onRecallWorker).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(12_001);
    });
    expect(screen.getByRole('button', { name: /Recall Worker to Keep/i })
      .hasAttribute('disabled')).toBe(false);
  });

  it('clears the shared guard only after authoritative returning state', async () => {
    let resolveRecall!: () => void;
    const pendingRecall = new Promise<void>((resolve) => {
      resolveRecall = resolve;
    });
    const onRecallWorker = vi.fn(() => pendingRecall);
    const worker = publicWorker();
    const view = render(
      <RecallSurface onRecallWorker={onRecallWorker} show worker={worker} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Recall Worker to Keep/i }));
    view.rerender(
      <RecallSurface
        onRecallWorker={onRecallWorker}
        show={false}
        worker={worker}
      />
    );
    expect(screen.getByTestId('pending-count').textContent).toBe('1');

    view.rerender(
      <RecallSurface
        onRecallWorker={onRecallWorker}
        show={false}
        worker={publicWorker({
          status: 'returning',
          timelineRevision: 2,
          revision: 2n
        })}
      />
    );
    expect(screen.getByTestId('pending-count').textContent).toBe('0');

    await act(async () => {
      resolveRecall();
      await pendingRecall;
    });
    expect(screen.getByTestId('pending-count').textContent).toBe('0');
    expect(onRecallWorker).toHaveBeenCalledOnce();
  });
});
