import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmWorkerPresenceMarkers } from '../src/components/realm/RealmWorkerPresenceMarkers';
import type { RealmWorkerSceneRecord } from '../src/components/realm/realmWorkerLayer';

afterEach(cleanup);

function worker(
  ordinal: 1 | 2 | 3 | 4,
  overrides: Partial<RealmWorkerSceneRecord> = {}
): RealmWorkerSceneRecord {
  return Object.freeze({
    workerId: `genesis-001-castle-7-worker-${String(ordinal).padStart(2, '0')}`,
    ordinal,
    originCastleId: 7,
    originCastleName: 'Hegemony Keep 007',
    status: 'outbound',
    resourceKind: 'wood',
    siteId: `genesis-001:wood:${String(ordinal).padStart(4, '0')}`,
    startedAtMicros: 100n,
    arrivesAtMicros: 300n,
    gatheringEndsAtMicros: 600n,
    returnsAtMicros: 800n,
    routeSteps: 2,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: ordinal === 1,
    originCoord: Object.freeze({ q: 0, r: 0 }),
    destinationCoord: Object.freeze({ q: 2, r: -1 }),
    profile: Object.freeze({
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      communityStatsVisible: false
    }),
    ...overrides
  }) as RealmWorkerSceneRecord;
}

describe('travelling worker presence markers', () => {
  it('renders outbound and returning keepers with phase-specific accessible labels', () => {
    const outbound = worker(1);
    const returning = worker(2, {
      status: 'returning',
      returnStartedAtMicros: 250n,
      returnsAtMicros: 325n,
      returnStartProgressBasisPoints: 7_500,
      timelineRevision: 2,
      revision: 2n,
      ownedByViewer: false,
      profile: Object.freeze({
        canonicalUsername: 'wayfarer',
        displayName: 'Wayfarer',
        communityStatsVisible: false
      })
    });
    const { container } = render(
      <RealmWorkerPresenceMarkers
        workers={[outbound, returning]}
        visibleWorkerIds={[outbound.workerId, returning.workerId]}
        onHover={() => undefined}
        onLayout={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByRole('group', {
      name: 'Workers travelling through the Realm'
    })).toBeTruthy();
    const outboundControl = screen.getByRole('button', {
      name: '@keeper, Worker 1, travelling to a resource node'
    });
    const returningControl = screen.getByRole('button', {
      name: '@wayfarer, Worker 2, returning to keep'
    });
    expect(outboundControl.dataset.phase).toBe('outbound');
    expect(returningControl.dataset.phase).toBe('returning');
    expect(outboundControl.dataset.ownedByViewer).toBe('true');
    expect(returningControl.dataset.ownedByViewer).toBe('false');
    expect(outboundControl.dataset.warpkeepSfx).toBe('none');
    expect(returningControl.dataset.warpkeepSfx).toBe('none');
    expect(container.querySelectorAll('.realm-castle-avatar')).toHaveLength(2);
    expect(container.querySelector('.realm-worker-presence-marker__route-ring')).toBeNull();
  });

  it('omits idle and gathering workers so node presentation cannot duplicate their PFP', () => {
    const idle = worker(1, {
      status: 'idle',
      resourceKind: undefined,
      siteId: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnsAtMicros: undefined,
      routeSteps: undefined,
      destinationCoord: undefined
    });
    const gathering = worker(2, { status: 'gathering' });
    render(
      <RealmWorkerPresenceMarkers
        workers={[idle, gathering]}
        visibleWorkerIds={[idle.workerId, gathering.workerId]}
        onHover={() => undefined}
        onLayout={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('.realm-castle-avatar')).toBeNull();
  });

  it('honours the bounded renderer membership without admitting duplicates or unknown IDs', () => {
    const first = worker(1);
    const second = worker(2);
    const third = worker(3);
    const { container } = render(
      <RealmWorkerPresenceMarkers
        workers={[first, second, third]}
        visibleWorkerIds={[
          second.workerId,
          second.workerId,
          'genesis-001-castle-999-worker-01'
        ]}
        onHover={() => undefined}
        onLayout={() => undefined}
        onSelect={() => undefined}
      />
    );

    const controls = screen.getAllByRole('button');
    expect(controls).toHaveLength(1);
    expect(controls[0]?.dataset.workerPresenceId).toBe(second.workerId);
    expect(container.querySelector(`[data-worker-presence-id="${first.workerId}"]`)).toBeNull();
    expect(container.querySelector(`[data-worker-presence-id="${third.workerId}"]`)).toBeNull();
  });

  it('delegates pointer, focus and selection interactions to the shared worker state', () => {
    const outbound = worker(1);
    const onHover = vi.fn();
    const onSelect = vi.fn();
    render(
      <RealmWorkerPresenceMarkers
        workers={[outbound]}
        visibleWorkerIds={[outbound.workerId]}
        onHover={onHover}
        onLayout={() => undefined}
        onSelect={onSelect}
      />
    );
    const control = screen.getByRole('button');

    fireEvent.pointerEnter(control);
    expect(onHover).toHaveBeenLastCalledWith(outbound.workerId);
    fireEvent.pointerLeave(control);
    expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(control);
    expect(onHover).toHaveBeenLastCalledWith(outbound.workerId);
    fireEvent.blur(control);
    expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.click(control);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(outbound);
  });

  it('reapplies projection coordinates only when travelling membership changes', () => {
    const first = worker(1);
    const second = worker(2);
    const onLayout = vi.fn();
    const view = render(
      <RealmWorkerPresenceMarkers
        workers={[first, second]}
        visibleWorkerIds={[first.workerId]}
        onHover={() => undefined}
        onLayout={onLayout}
        onSelect={() => undefined}
      />
    );
    expect(onLayout).toHaveBeenCalledOnce();

    act(() => {
      view.rerender(
        <RealmWorkerPresenceMarkers
          workers={[first, second]}
          visibleWorkerIds={[first.workerId, second.workerId]}
          onHover={() => undefined}
          onLayout={onLayout}
          onSelect={() => undefined}
        />
      );
    });
    expect(onLayout).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('recovers only genuinely orphaned focus when a travelling portrait disappears', () => {
    const outbound = worker(1);
    const gathering = worker(1, { status: 'gathering' });
    const fallbackRef = createRef<HTMLButtonElement>();
    const onHover = vi.fn();
    const renderView = (currentWorker: RealmWorkerSceneRecord) => (
      <>
        <button ref={fallbackRef} type="button">Realm map focus fallback</button>
        <button type="button">Stable external control</button>
        <RealmWorkerPresenceMarkers
          focusFallbackRef={fallbackRef}
          workers={[currentWorker]}
          visibleWorkerIds={[currentWorker.workerId]}
          onHover={onHover}
          onLayout={() => undefined}
          onSelect={() => undefined}
        />
      </>
    );
    const view = render(renderView(outbound));
    const portrait = screen.getByRole('button', {
      name: '@keeper, Worker 1, travelling to a resource node'
    });

    portrait.focus();
    expect(document.activeElement).toBe(portrait);
    view.rerender(renderView(gathering));
    expect(document.activeElement).toBe(fallbackRef.current);
    expect(onHover).toHaveBeenLastCalledWith(null);

    view.rerender(renderView(outbound));
    const restoredPortrait = screen.getByRole('button', {
      name: '@keeper, Worker 1, travelling to a resource node'
    });
    restoredPortrait.focus();
    const stableControl = screen.getByRole('button', { name: 'Stable external control' });
    stableControl.focus();
    view.rerender(renderView(gathering));
    expect(document.activeElement).toBe(stableControl);
  });
});
