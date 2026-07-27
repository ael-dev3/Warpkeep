import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkerInspectionPanel } from '../src/components/realm/WorkerInspectionPanel';
import type {
  RealmWorkerPublicPresentation
} from '../src/components/realm/realmWorkerPresentation';

const NOW_MILLIS = 2_000_000_000_000;
const NOW_MICROS = BigInt(NOW_MILLIS) * 1_000n;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function worker(
  overrides: Partial<RealmWorkerPublicPresentation> = {}
): RealmWorkerPublicPresentation {
  return {
    workerId: 'genesis-001-castle-7-worker-02',
    ordinal: 2,
    originCastleId: 7,
    originCastleName: 'Sunlit Bastion',
    status: 'outbound',
    resourceKind: 'food',
    siteId: 'private-opaque-site-id',
    startedAtMicros: NOW_MICROS - 60_000_000n,
    arrivesAtMicros: NOW_MICROS + 90_000_000n,
    gatheringEndsAtMicros: NOW_MICROS + 3_600_000_000n,
    returnsAtMicros: NOW_MICROS + 4_500_000_000n,
    routeSteps: 4,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: true,
    ...overrides
  };
}

describe('WorkerInspectionPanel public record', () => {
  it('presents a sanitized owner record with an authoritative timer and bounded commands', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MILLIS);
    const locate = vi.fn();
    const locateKeeper = vi.fn();
    const recall = vi.fn(async () => undefined);
    render(
      <WorkerInspectionPanel
        id="worker-record"
        keeperProfile={{
          canonicalUsername: '@river\u202ekeeper',
          displayName: '  River\u202e Keeper  ',
          pfpUrl: 'http://127.0.0.1/private.png',
          publicBio: '  Building\u200b beside the bright river.  ',
          communityStatsVisible: true,
          marksBalanceMicros: 99n
        }}
        onLocateKeeper={locateKeeper}
        onLocateWorker={locate}
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        resourceTargetLabel={'  Wheat\u202e Farm · Tier 1  '}
        worker={worker()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 2' });
    expect(within(dialog).getByText('River Keeper')).not.toBeNull();
    expect(within(dialog).getByText('@riverkeeper')).not.toBeNull();
    expect(within(dialog).getByText('Building beside the bright river.')).not.toBeNull();
    expect(within(dialog).getByText('Sunlit Bastion')).not.toBeNull();
    expect(within(dialog).getByText('02 of 04')).not.toBeNull();
    expect(within(dialog).getByText('Wheat Farm · Tier 1')).not.toBeNull();
    expect(within(dialog).getByText('Arrival time left')).not.toBeNull();
    expect(within(dialog).getByRole('timer').textContent).toBe('2m remaining');
    expect(dialog.textContent).not.toContain('private-opaque-site-id');
    expect(dialog.textContent).not.toContain('\u202e');
    expect(dialog.textContent).not.toContain('99');
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(dialog.textContent).not.toMatch(/\bcell\s+-?\d/i);
    expect(dialog.textContent).not.toMatch(/\bq\s+-?\d+\s*[·,]\s*r\s+-?\d+/i);
    expect(dialog.querySelector('canvas')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', {
      name: "Locate River Keeper's keep"
    }));
    expect(locateKeeper).toHaveBeenCalledWith(worker().originCastleId);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Locate Worker' }));
    expect(locate).toHaveBeenCalledWith(worker().workerId);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Recall Worker' }));
    });
    expect(recall).toHaveBeenCalledWith(worker().workerId);
  });

  it('shows each assigned phase against only its authoritative deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MILLIS);
    const { rerender } = render(
      <WorkerInspectionPanel
        id="worker-record"
        onRequestClose={() => undefined}
        worker={worker()}
      />
    );

    expect(screen.getByText('Arrival time left')).not.toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('2m remaining');

    rerender(
      <WorkerInspectionPanel
        id="worker-record"
        onRequestClose={() => undefined}
        worker={worker({
          status: 'gathering',
          gatheringEndsAtMicros: NOW_MICROS + 150_000_000n
        })}
      />
    );
    expect(screen.getByText('Gathering time left')).not.toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('3m remaining');

    rerender(
      <WorkerInspectionPanel
        id="worker-record"
        onRequestClose={() => undefined}
        worker={worker({
          status: 'returning',
          returnStartedAtMicros: NOW_MICROS - 30_000_000n,
          returnStartProgressBasisPoints: 5_000,
          returnsAtMicros: NOW_MICROS + 210_000_000n
        })}
      />
    );
    expect(screen.getByText('Return time left')).not.toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('4m remaining');
  });

  it('keeps an owner recall visible but disabled while private controls synchronize', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MILLIS);
    render(
      <WorkerInspectionPanel
        controlsStatus="Synchronizing worker controls… Public worker positions remain available."
        id="worker-record"
        onRequestClose={() => undefined}
        worker={worker()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 2' });
    const status = within(dialog).getByRole('status');
    const recall = within(dialog).getByRole('button', {
      name: 'Recall Worker'
    }) as HTMLButtonElement;
    expect(recall.disabled).toBe(true);
    expect(recall.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.textContent).toContain('Synchronizing worker controls');
  });

  it('waits for the authoritative Worker lifecycle after reducer acceptance', async () => {
    const recall = vi.fn(async () => undefined);
    const view = render(
      <WorkerInspectionPanel
        id="worker-record"
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Recall Worker' }));
    });
    expect(recall).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', {
      name: 'Awaiting Realm Worker update'
    }).hasAttribute('disabled')).toBe(true);

    view.rerender(
      <WorkerInspectionPanel
        id="worker-record"
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker({
          status: 'gathering',
          timelineRevision: 2,
          revision: 2n
        })}
      />
    );
    const awaiting = screen.getByRole('button', {
      name: 'Awaiting Realm Worker update'
    }) as HTMLButtonElement;
    expect(awaiting.disabled).toBe(true);
    fireEvent.click(awaiting);
    expect(recall).toHaveBeenCalledOnce();

    view.rerender(
      <WorkerInspectionPanel
        id="worker-record"
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker({
          status: 'returning',
          timelineRevision: 2,
          revision: 2n
        })}
      />
    );
    expect(screen.queryByRole('button', { name: 'Recall Worker' })).toBeNull();
  });

  it('does not re-enter pending when authority returns before the reducer promise', async () => {
    let resolveRecall!: () => void;
    const pendingRecall = new Promise<void>((resolve) => {
      resolveRecall = resolve;
    });
    const recall = vi.fn(() => pendingRecall);
    const view = render(
      <WorkerInspectionPanel
        id="worker-record"
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recall Worker' }));
    expect(screen.getByRole('button', { name: 'Recalling Worker' })
      .hasAttribute('disabled')).toBe(true);

    view.rerender(
      <WorkerInspectionPanel
        id="worker-record"
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker({
          status: 'returning',
          timelineRevision: 2,
          revision: 2n
        })}
      />
    );
    expect(screen.getByRole('button', { name: 'Back to workers' })
      .hasAttribute('disabled')).toBe(false);

    await act(async () => {
      resolveRecall();
      await pendingRecall;
    });
    expect(screen.queryByRole('button', {
      name: 'Awaiting Realm Worker update'
    })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to workers' })
      .hasAttribute('disabled')).toBe(false);
  });

  it('keeps another keeper read-only while retaining the public locate action', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MILLIS);
    const locate = vi.fn();
    const locateKeeper = vi.fn();
    const recall = vi.fn(async () => undefined);
    render(
      <WorkerInspectionPanel
        id="worker-record"
        keeperProfile={{
          canonicalUsername: 'peer',
          displayName: 'Peer Keeper',
          communityStatsVisible: false
        }}
        onLocateKeeper={locateKeeper}
        onLocateWorker={locate}
        onRecallWorker={recall}
        onRequestClose={() => undefined}
        worker={worker({
          ownedByViewer: false,
          status: 'gathering',
          resourceKind: 'stone'
        })}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 2' });
    expect(within(dialog).getByText('Read-only public identity. Commands belong to the owning keeper.'))
      .not.toBeNull();
    expect(within(dialog).getByText('Stone Quarry')).not.toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Recall Worker' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', {
      name: "Locate Peer Keeper's keep"
    }));
    expect(locateKeeper).toHaveBeenCalledWith(worker().originCastleId);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Locate Worker' }));
    expect(locate).toHaveBeenCalledWith(worker().workerId);
    expect(recall).not.toHaveBeenCalled();
  });

  it('keeps an idle record map-first without a target, schedule, coordinates, or destination picker', () => {
    const locate = vi.fn();
    render(
      <WorkerInspectionPanel
        id="worker-record"
        onLocateWorker={locate}
        onRequestClose={() => undefined}
        resourceTargetLabel="This must stay hidden"
        worker={worker({
          status: 'idle',
          resourceKind: undefined,
          siteId: undefined,
          startedAtMicros: undefined,
          arrivesAtMicros: undefined,
          gatheringEndsAtMicros: undefined,
          returnsAtMicros: undefined,
          routeSteps: undefined
        })}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Worker 2' });
    expect(within(dialog).getByText('READY AT KEEP')).not.toBeNull();
    expect(within(dialog).queryByText('Resource target')).toBeNull();
    expect(within(dialog).queryByRole('timer')).toBeNull();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(dialog.textContent).not.toContain('This must stay hidden');
    expect(dialog.textContent).not.toContain('private-opaque-site-id');
    expect(dialog.textContent).not.toMatch(/\bcell\s+-?\d/i);
    expect(dialog.textContent).not.toMatch(/\bq\s+-?\d+\s*[·,]\s*r\s+-?\d+/i);
    expect(within(dialog).queryByRole('button', { name: 'Recall Worker' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Locate at Keep' }));
    expect(locate).toHaveBeenCalledWith(worker().workerId);
  });
});
