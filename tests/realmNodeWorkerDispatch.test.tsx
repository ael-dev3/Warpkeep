import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmNodeWorkerDispatch } from '../src/components/realm/RealmNodeWorkerDispatch';
import type {
  RealmWorkerPublicPresentation
} from '../src/components/realm/realmWorkerPresentation';

afterEach(cleanup);

function worker(
  ordinal: 1 | 2 | 3 | 4,
  status: RealmWorkerPublicPresentation['status'],
  resourceKind?: RealmWorkerPublicPresentation['resourceKind']
): RealmWorkerPublicPresentation {
  return {
    workerId: `genesis-001-castle-7-worker-0${ordinal}`,
    ordinal,
    originCastleId: 7,
    originCastleName: 'Sunlit Bastion',
    status,
    ...(resourceKind ? { resourceKind, siteId: `canonical-${resourceKind}-site` } : {}),
    timelineRevision: 0,
    revision: 0n,
    ownedByViewer: true
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('RealmNodeWorkerDispatch', () => {
  it('shows all four workers, disables busy workers, and submits only canonical node inputs', async () => {
    const onDispatchWorker = vi.fn(async () => undefined);
    render(
      <RealmNodeWorkerDispatch
        id="food-site"
        onDispatchWorker={onDispatchWorker}
        resourceKind="food"
        siteId="genesis-001:food:0001"
        workers={[
          worker(1, 'idle'),
          worker(2, 'outbound', 'food'),
          worker(3, 'gathering', 'stone'),
          worker(4, 'returning', 'wood')
        ]}
      />
    );

    expect(screen.getByRole('list', { name: 'Your workers for this Food site' })
      .querySelectorAll('li')).toHaveLength(4);
    const ready = screen.getByRole('button', { name: 'Worker 1 — READY AT KEEP' });
    expect(ready.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', {
      name: 'Worker 2 — TRAVELLING TO FOOD SITE'
    }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', {
      name: 'Worker 3 — GATHERING STONE'
    }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', {
      name: 'Worker 4 — RETURNING TO KEEP'
    }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.body.textContent).not.toContain('cell ');

    fireEvent.click(ready);
    await waitFor(() => expect(onDispatchWorker).toHaveBeenCalledWith(
      'genesis-001-castle-7-worker-01',
      'food',
      'genesis-001:food:0001'
    ));
    expect(onDispatchWorker).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Awaiting the authoritative Realm assignment/i)).not.toBeNull();
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled')))
      .toBe(true);
  });

  it('keeps one command locked across unrelated roster churn and reconciles its exact worker', async () => {
    const pending = deferred();
    const onDispatchWorker = vi.fn(() => pending.promise);
    const initialWorkers = [
      worker(1, 'idle'),
      worker(2, 'idle'),
      worker(3, 'idle'),
      worker(4, 'idle')
    ] as const;
    const view = render(
      <RealmNodeWorkerDispatch
        id="food-site"
        onDispatchWorker={onDispatchWorker}
        resourceKind="food"
        siteId="genesis-001:food:0001"
        workers={initialWorkers}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Worker 1 — READY AT KEEP' }));
    expect(onDispatchWorker).toHaveBeenCalledTimes(1);

    const unrelatedWorkerUpdate = [
      initialWorkers[0],
      {
        ...worker(2, 'outbound', 'wood'),
        revision: 1n,
        timelineRevision: 1
      },
      initialWorkers[2],
      initialWorkers[3]
    ] as const;
    view.rerender(
      <RealmNodeWorkerDispatch
        id="food-site"
        onDispatchWorker={onDispatchWorker}
        resourceKind="food"
        siteId="genesis-001:food:0001"
        workers={unrelatedWorkerUpdate}
      />
    );

    expect(screen.getByText('DISPATCHING…')).not.toBeNull();
    const otherReadyWorker = screen.getByRole('button', {
      name: 'Worker 3 — READY AT KEEP'
    });
    expect(otherReadyWorker.hasAttribute('disabled')).toBe(true);
    fireEvent.click(otherReadyWorker);
    expect(onDispatchWorker).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => {
      expect(screen.getByText(/Awaiting the authoritative Realm assignment/i)).not.toBeNull();
    });

    const laterUnrelatedUpdate = [
      unrelatedWorkerUpdate[0],
      {
        ...worker(2, 'gathering', 'wood'),
        revision: 2n,
        timelineRevision: 2
      },
      unrelatedWorkerUpdate[2],
      unrelatedWorkerUpdate[3]
    ] as const;
    view.rerender(
      <RealmNodeWorkerDispatch
        id="food-site"
        onDispatchWorker={onDispatchWorker}
        resourceKind="food"
        siteId="genesis-001:food:0001"
        workers={laterUnrelatedUpdate}
      />
    );
    expect(screen.getByText(/Awaiting the authoritative Realm assignment/i)).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Worker 3 — READY AT KEEP'
    }).hasAttribute('disabled')).toBe(true);

    view.rerender(
      <RealmNodeWorkerDispatch
        id="food-site"
        onDispatchWorker={onDispatchWorker}
        resourceKind="food"
        siteId="genesis-001:food:0001"
        workers={[
          {
            ...worker(1, 'outbound', 'food'),
            siteId: 'genesis-001:food:0001',
            revision: 1n,
            timelineRevision: 1
          },
          laterUnrelatedUpdate[1],
          laterUnrelatedUpdate[2],
          laterUnrelatedUpdate[3]
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Assignment begins only after the Realm confirms/i)).not.toBeNull();
    });
    expect(screen.getByRole('button', {
      name: 'Worker 3 — READY AT KEEP'
    }).hasAttribute('disabled')).toBe(false);
  });

  it('fails closed for anything other than the exact four-worker owner roster', () => {
    render(
      <RealmNodeWorkerDispatch
        id="stone-site"
        onDispatchWorker={vi.fn(async () => undefined)}
        resourceKind="stone"
        siteId="genesis-001:stone:0001"
        workers={[worker(1, 'idle'), worker(2, 'idle'), worker(3, 'idle')]}
      />
    );

    expect(screen.getByRole('status').textContent).toMatch(/four-worker roster is unavailable/i);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
