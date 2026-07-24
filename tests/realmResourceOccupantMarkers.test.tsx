import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmResourceOccupantMarkers } from '../src/components/realm/RealmResourceOccupantMarkers';
import type {
  RealmResourceOccupantMarker
} from '../src/components/realm/realmResourceOccupantPresentation';

afterEach(cleanup);

function marker(
  siteId: string,
  overrides: Partial<RealmResourceOccupantMarker> = {}
): RealmResourceOccupantMarker {
  return {
    source: 'generic-worker',
    resource: 'wood',
    siteId,
    nodeCoord: { q: 3, r: -2 },
    tier: 1,
    workerId: 'genesis-001-castle-22-worker-02',
    workerOrdinal: 2,
    workerPhase: 'gathering',
    timelineRevision: 1,
    occupiedByViewer: false,
    startedAtMicros: 1n,
    arrivesAtMicros: 2n,
    gatheringEndsAtMicros: 3n,
    castle: {
      castleId: 22,
      name: 'Sunlit Bastion',
      q: 1,
      r: -1
    },
    profile: {
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      communityStatsVisible: false
    },
    ...overrides
  };
}

const first = marker('genesis-001:wood:0001');
const second = marker('genesis-001:wood:0002', {
  nodeCoord: { q: 4, r: -2 },
  workerId: 'genesis-001-castle-22-worker-03',
  workerOrdinal: 3
});
const visibleKeys = [
  'wood:genesis-001:wood:0001',
  'wood:genesis-001:wood:0002'
] as const;

describe('resource occupant marker surface', () => {
  it('keeps every public presence pointer-accessible beside the bounded control lane', () => {
    const markers = Array.from({ length: 40 }, (_, index) => marker(
      `genesis-001:wood:${String(index + 1).padStart(4, '0')}`,
      { nodeCoord: { q: index, r: -index } }
    ));
    const presenceMarkerKeys = markers.map((entry) => `wood:${entry.siteId}`).reverse();
    const controlKeys = presenceMarkerKeys.slice(0, 24);
    const select = vi.fn();
    const { container } = render(
      <RealmResourceOccupantMarkers
        markers={markers}
        presenceMarkerKeys={presenceMarkerKeys}
        visibleMarkerKeys={controlKeys}
        onMarkerLayout={() => undefined}
        onSelect={select}
      />
    );

    expect(container.querySelectorAll('.realm-resource-occupant-presence')).toHaveLength(40);
    expect(screen.getAllByRole('button')).toHaveLength(24);
    const passivePresence = [...container.querySelectorAll<HTMLElement>(
      '.realm-resource-occupant-presence'
    )].find((entry) => (
      entry.dataset.resourceOccupantKey === 'wood:genesis-001:wood:0001'
    ));
    expect(passivePresence).toBeTruthy();
    fireEvent.click(passivePresence!);
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(markers[0]);
  });

  it('mounts only projected-visible controls', () => {
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={[]}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={[visibleKeys[1]]}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );
    const control = screen.getByRole('button');
    expect(control.getAttribute('aria-label')).toContain('cell 4,-2');
    expect(control.dataset.resourceOccupantLane).toBe('control');
  });

  it('uses one roving tab stop with arrow-key navigation', () => {
    render(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={visibleKeys}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );
    const controls = screen.getAllByRole('button');
    expect(controls.map((button) => button.tabIndex)).toEqual([0, -1]);

    controls[0]!.focus();
    fireEvent.keyDown(controls[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(controls[1]);
    expect(controls.map((button) => button.tabIndex)).toEqual([-1, 0]);
  });

  it('delegates selection without mounting a second dialog', () => {
    const select = vi.fn();
    render(
      <RealmResourceOccupantMarkers
        markers={[first]}
        visibleMarkerKeys={[visibleKeys[0]]}
        onMarkerLayout={() => undefined}
        onSelect={select}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Inspect @keeper gathering/i }));
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(first);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-resource-occupant-details="true"]')).toBeNull();
  });

  it('labels the viewer’s canonical worker without exposing a standalone action surface', () => {
    const own = marker('genesis-001:wood:0003', { occupiedByViewer: true });
    render(
      <RealmResourceOccupantMarkers
        markers={[own]}
        visibleMarkerKeys={['wood:genesis-001:wood:0003']}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );

    const control = screen.getByRole('button', { name: /Inspect YOUR WORKER/i });
    expect(control.textContent).toContain('YOUR WORKER');
    expect(screen.queryByRole('button', { name: /recall|focus castle/i })).toBeNull();
  });

  it('moves focus to the next visible control when the focused marker is culled', () => {
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={visibleKeys}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );
    const controls = screen.getAllByRole('button');
    controls[0]!.focus();

    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={[visibleKeys[1]]}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
      />
    );
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });

  it('reapplies the latest projection after membership changes', () => {
    const onMarkerLayout = vi.fn();
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[first]}
        visibleMarkerKeys={[visibleKeys[0]]}
        onMarkerLayout={onMarkerLayout}
        onSelect={() => undefined}
      />
    );
    expect(onMarkerLayout).toHaveBeenCalledOnce();

    act(() => {
      view.rerender(
        <RealmResourceOccupantMarkers
          markers={[first, second]}
          visibleMarkerKeys={visibleKeys}
          onMarkerLayout={onMarkerLayout}
          onSelect={() => undefined}
        />
      );
    });
    expect(onMarkerLayout).toHaveBeenCalledTimes(2);
  });
});
