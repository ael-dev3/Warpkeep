import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RealmResourceOccupantMarkers } from '../src/components/realm/RealmResourceOccupantMarkers';
import type { RealmResourceOccupantMarker } from '../src/components/realm/realmResourceOccupantPresentation';

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

function legacyMarker(
  overrides: Partial<RealmResourceOccupantMarker> = {}
): RealmResourceOccupantMarker {
  return {
    source: 'legacy-expedition',
    resource: 'stone',
    siteId: 'genesis-001:stone:0001',
    nodeCoord: { q: 7, r: -4 },
    tier: 1,
    workerPhase: 'returning',
    occupiedByViewer: false,
    startedAtMicros: 1n,
    arrivesAtMicros: 2n,
    gatheringEndsAtMicros: 3n,
    returnsAtMicros: 4n,
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

function Harness() {
  const [selected, setSelected] = useState<RealmResourceOccupantMarker | null>(null);
  return (
    <RealmResourceOccupantMarkers
      markers={[first, second]}
      visibleMarkerKeys={['wood:genesis-001:wood:0001', 'wood:genesis-001:wood:0002']}
      selectedMarker={selected}
      onMarkerLayout={() => undefined}
      onSelect={setSelected}
      onRequestClose={() => setSelected(null)}
      onFocusCastle={() => undefined}
    />
  );
}

describe('resource occupant marker surface', () => {
  it('keeps every presence pointer-accessible beside the bounded keyboard-control lane', () => {
    const markers = Array.from({ length: 40 }, (_, index) => marker(
      `genesis-001:wood:${String(index + 1).padStart(4, '0')}`,
      { nodeCoord: { q: index, r: -index } }
    ));
    const presenceMarkerKeys = markers.map((entry) => (
      `wood:${entry.siteId}`
    )).reverse();
    const visibleMarkerKeys = presenceMarkerKeys.slice(0, 24);
    const select = vi.fn();
    const { container } = render(
      <RealmResourceOccupantMarkers
        markers={markers}
        presenceMarkerKeys={presenceMarkerKeys}
        visibleMarkerKeys={visibleMarkerKeys}
        selectedMarker={null}
        onMarkerLayout={() => undefined}
        onSelect={select}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );

    expect(container.querySelectorAll('.realm-resource-occupant-presence')).toHaveLength(40);
    expect(screen.getAllByRole('button')).toHaveLength(24);
    expect(container.querySelector('.realm-resource-occupant-presences')
      ?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll(
      '.realm-resource-occupant-presence[data-resource-occupant-lane="presence"]'
    )).toHaveLength(40);
    expect([...container.querySelectorAll<HTMLElement>(
      '.realm-resource-occupant-presence'
    )].map((entry) => entry.dataset.resourceOccupantKey)).toEqual(presenceMarkerKeys);

    const passiveOnlyPresence = [...container.querySelectorAll<HTMLElement>(
      '.realm-resource-occupant-presence'
    )].find((entry) => (
      entry.dataset.resourceOccupantKey === 'wood:genesis-001:wood:0001'
    ));
    expect(passiveOnlyPresence).toBeTruthy();
    fireEvent.click(passiveOnlyPresence!);
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(markers[0]);
  });

  it('mounts only bounded projected-visible marker members', () => {
    const { rerender } = render(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={[]}
        selectedMarker={null}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    rerender(
      <RealmResourceOccupantMarkers
        markers={[first, second]}
        visibleMarkerKeys={['wood:genesis-001:wood:0002']}
        selectedMarker={null}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('cell 4,-2');
  });

  it('uses one roving tab stop and arrow-key navigation', () => {
    render(<Harness />);
    const markers = screen.getAllByRole('button');
    expect(markers.map((button) => button.tabIndex)).toEqual([0, -1]);

    markers[0]!.focus();
    fireEvent.keyDown(markers[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(markers[1]);
    expect(markers.map((button) => button.tabIndex)).toEqual([-1, 0]);
  });

  it('opens a read-only current worker record and restores focus on close', () => {
    render(<Harness />);
    const trigger = screen.getAllByRole('button')[0]!;
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog').classList.contains('realm-camera-neutral-inspector'))
      .toBe(true);
    expect(screen.getByText('PUBLIC WORKER RECORD')).toBeTruthy();
    expect(screen.getByText('WORKER 02')).toBeTruthy();
    expect(screen.queryByText(/Recall worker home/i)).toBeNull();
    expect(screen.queryByText(/View castle location/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('shows another keeper’s authoritative gathering time left and refreshes it in place', () => {
    vi.useFakeTimers();
    try {
      const nowMillis = 2_000_000_000_000;
      vi.setSystemTime(nowMillis);
      const nowMicros = BigInt(nowMillis) * 1_000n;
      const gathering = marker('genesis-001:wood:0007', {
        gatheringEndsAtMicros: nowMicros + 90_000_000n
      });
      render(
        <RealmResourceOccupantMarkers
          markers={[gathering]}
          visibleMarkerKeys={['wood:genesis-001:wood:0007']}
          selectedMarker={gathering}
          onMarkerLayout={() => undefined}
          onSelect={() => undefined}
          onRequestClose={() => undefined}
          onFocusCastle={() => undefined}
        />
      );

      expect(screen.getByText('Gathering time left')).toBeTruthy();
      const timer = screen.getByRole('timer');
      expect(timer.textContent).toBe('2m remaining');
      expect(screen.queryByText('Deployment limit')).toBeNull();
      expect(screen.queryByText(/30-day deployment|30 days/i)).toBeNull();

      act(() => vi.advanceTimersByTime(30_000));
      expect(timer.textContent).toBe('1m remaining');
      act(() => vi.advanceTimersByTime(60_000));
      expect(timer.textContent).toBe('Awaiting Realm update');
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels each public phase deadline without inventing a missing schedule', () => {
    const outbound = marker('genesis-001:wood:0008', {
      workerPhase: 'outbound',
      arrivesAtMicros: undefined
    });
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[outbound]}
        visibleMarkerKeys={['wood:genesis-001:wood:0008']}
        selectedMarker={outbound}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );

    expect(screen.getByText('Arrival time left')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Schedule unavailable');

    const returning = legacyMarker({ returnsAtMicros: undefined });
    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[returning]}
        visibleMarkerKeys={['stone:genesis-001:stone:0001']}
        selectedMarker={returning}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    expect(screen.getByText('Return time left')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Schedule unavailable');
  });

  it('identifies the viewer’s generic assignment as their worker', () => {
    const own = marker('genesis-001:wood:0003', { occupiedByViewer: true });
    render(
      <RealmResourceOccupantMarkers
        markers={[own]}
        visibleMarkerKeys={['wood:genesis-001:wood:0003']}
        selectedMarker={own}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );

    expect(screen.getByRole('button', {
      name: /Inspect YOUR WORKER at Logging Camp/i
    })).toBeTruthy();
    expect(screen.getAllByText('YOUR WORKER')).toHaveLength(3);
    expect(screen.getByText('YOUR KEEP')).toBeTruthy();
    expect(screen.getByText('WORKER 02')).toBeTruthy();
  });

  it('uses the player portrait as the camera-neutral castle focus control', () => {
    const focusCastle = vi.fn();
    render(
      <RealmResourceOccupantMarkers
        markers={[first]}
        visibleMarkerKeys={['wood:genesis-001:wood:0001']}
        selectedMarker={first}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={focusCastle}
      />
    );

    fireEvent.click(screen.getByRole('button', {
      name: /Focus @keeper's castle on the map/i
    }));
    expect(focusCastle).toHaveBeenCalledOnce();
    expect(focusCastle).toHaveBeenCalledWith(first);
    expect(screen.queryByRole('button', { name: /View castle/i })).toBeNull();
  });

  it('does not restore delayed marker focus after portrait navigation culls its source', () => {
    let revealMarker: () => void = () => undefined;
    function CastleNavigationHarness() {
      const [selected, setSelected] = useState<RealmResourceOccupantMarker | null>(null);
      const [visible, setVisible] = useState<readonly string[]>([
        'wood:genesis-001:wood:0001'
      ]);
      revealMarker = () => setVisible(['wood:genesis-001:wood:0001']);
      return (
        <RealmResourceOccupantMarkers
          markers={[first]}
          visibleMarkerKeys={visible}
          selectedMarker={selected}
          onMarkerLayout={() => undefined}
          onSelect={setSelected}
          onRequestClose={() => setSelected(null)}
          onFocusCastle={() => setVisible([])}
        />
      );
    }

    render(<CastleNavigationHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect @keeper gathering/i }));
    fireEvent.click(screen.getByRole('button', {
      name: /Focus @keeper's castle on the map/i
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));

    const markerGroup = screen.getByRole('group');
    expect(document.activeElement).toBe(markerGroup);
    act(() => revealMarker());
    expect(document.activeElement).toBe(markerGroup);
  });

  it('recalls only the viewer’s exact generic worker and reports command state', async () => {
    let resolveRecall: () => void = () => undefined;
    const pendingRecall = new Promise<void>((resolve) => {
      resolveRecall = resolve;
    });
    const recallWorker = vi.fn(() => pendingRecall);
    const own = marker('genesis-001:wood:0003', { occupiedByViewer: true });
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[own]}
        visibleMarkerKeys={['wood:genesis-001:wood:0003']}
        selectedMarker={own}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );

    const recall = screen.getByRole('button', { name: /Recall Worker to Keep/i });
    fireEvent.click(recall);
    fireEvent.click(recall);
    expect(recallWorker).toHaveBeenCalledOnce();
    expect(recallWorker).toHaveBeenCalledWith('genesis-001-castle-22-worker-02');
    expect((recall as HTMLButtonElement).disabled).toBe(true);
    expect(recall.textContent).toContain('Recalling worker…');

    await act(async () => resolveRecall());
    expect((recall as HTMLButtonElement).disabled).toBe(true);
    expect(recall.textContent).toContain('Worker returning…');

    const failedRecall = vi.fn().mockRejectedValue(new Error('not confirmed'));
    const failedOwn = marker('genesis-001:wood:0005', { occupiedByViewer: true });
    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[failedOwn]}
        visibleMarkerKeys={['wood:genesis-001:wood:0005']}
        selectedMarker={failedOwn}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={failedRecall}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Recall Worker to Keep/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be confirmed/i);
  });

  it('does not carry recall state into a replacement lease at the same site', async () => {
    const recallWorker = vi.fn().mockResolvedValue(undefined);
    const own = marker('genesis-001:wood:0003', { occupiedByViewer: true });
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[own]}
        visibleMarkerKeys={['wood:genesis-001:wood:0003']}
        selectedMarker={own}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Recall Worker to Keep/i }));
    expect(await screen.findByRole('button', { name: /Worker returning/i })).toBeTruthy();

    const replacement = marker(own.siteId, {
      occupiedByViewer: true,
      workerId: 'genesis-001-castle-22-worker-03',
      workerOrdinal: 3,
      timelineRevision: 2
    });
    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[replacement]}
        visibleMarkerKeys={['wood:genesis-001:wood:0003']}
        selectedMarker={replacement}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );

    const replacementRecall = screen.getByRole('button', { name: /Recall Worker to Keep/i });
    expect((replacementRecall as HTMLButtonElement).disabled).toBe(false);
  });

  it('never exposes recall authority for another keeper, legacy data, or a malformed worker ID', () => {
    const recallWorker = vi.fn().mockResolvedValue(undefined);
    const remote = first;
    const ownLegacy = legacyMarker({ occupiedByViewer: true });
    const malformedOwn = marker('genesis-001:wood:0004', {
      occupiedByViewer: true,
      workerId: 'not-a-canonical-worker'
    });
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[remote]}
        visibleMarkerKeys={['wood:genesis-001:wood:0001']}
        selectedMarker={remote}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();

    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[ownLegacy]}
        visibleMarkerKeys={['stone:genesis-001:stone:0001']}
        selectedMarker={ownLegacy}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();

    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[malformedOwn]}
        visibleMarkerKeys={['wood:genesis-001:wood:0004']}
        selectedMarker={malformedOwn}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
        onRecallWorker={recallWorker}
      />
    );
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();
    expect(recallWorker).not.toHaveBeenCalled();
  });

  it('keeps a legacy returning expedition visible as a read-only public record', () => {
    const legacy = legacyMarker();
    render(
      <RealmResourceOccupantMarkers
        markers={[legacy]}
        visibleMarkerKeys={['stone:genesis-001:stone:0001']}
        selectedMarker={legacy}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );

    expect(screen.getByText('PUBLIC EXPEDITION RECORD')).toBeTruthy();
    expect(screen.getByText('EXPEDITION WAGON')).toBeTruthy();
    expect(screen.getByText('RETURNING TO KEEP')).toBeTruthy();
    expect(screen.queryByText(/command authority|owning keeper/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /recall|collect|claim/i })).toBeNull();
  });

  it('gives an open worker record first Escape priority from outside the panel', () => {
    render(<Harness />);
    const trigger = screen.getAllByRole('button')[0]!;
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('updates a worker phase without remounting the open record or stealing focus', () => {
    const view = render(
      <RealmResourceOccupantMarkers
        markers={[first]}
        visibleMarkerKeys={['wood:genesis-001:wood:0001']}
        selectedMarker={first}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    const castleFocus = screen.getByRole('button', { name: /Focus @keeper's castle/i });
    castleFocus.focus();

    const updated = marker(first.siteId, {
      workerPhase: 'outbound'
    });
    view.rerender(
      <RealmResourceOccupantMarkers
        markers={[updated]}
        visibleMarkerKeys={['wood:genesis-001:wood:0001']}
        selectedMarker={updated}
        onMarkerLayout={() => undefined}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );

    expect(screen.getByText('EN ROUTE TO SITE')).toBeTruthy();
    expect(document.activeElement).toBe(castleFocus);
  });

  it('restores focus after its selected trigger is temporarily culled by the panel', () => {
    let revealMarker: () => void = () => undefined;
    function CulledTriggerHarness() {
      const [selected, setSelected] = useState<RealmResourceOccupantMarker | null>(null);
      const [visible, setVisible] = useState<readonly string[]>([
        'wood:genesis-001:wood:0001'
      ]);
      revealMarker = () => setVisible(['wood:genesis-001:wood:0001']);
      return (
        <RealmResourceOccupantMarkers
          markers={[first]}
          visibleMarkerKeys={visible}
          selectedMarker={selected}
          onMarkerLayout={() => undefined}
          onSelect={(next) => {
            setSelected(next);
            setVisible([]);
          }}
          onRequestClose={() => setSelected(null)}
          onFocusCastle={() => undefined}
        />
      );
    }
    render(<CulledTriggerHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect @keeper gathering/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));
    expect(document.activeElement).toBe(screen.getByRole('group'));

    act(() => revealMarker());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Inspect @keeper gathering/i })
    );
  });

  it('does not restore focus to a later worker after the selected lease disappears', () => {
    let restoreLease: () => void = () => undefined;
    function RemovedLeaseHarness() {
      const [selected, setSelected] = useState<RealmResourceOccupantMarker | null>(first);
      const [markers, setMarkers] = useState<readonly RealmResourceOccupantMarker[]>([first]);
      const [visible, setVisible] = useState<readonly string[]>([]);
      restoreLease = () => {
        setMarkers([first]);
        setVisible(['wood:genesis-001:wood:0001']);
      };
      return (
        <>
          <button type="button">Outside control</button>
          <RealmResourceOccupantMarkers
            markers={markers}
            visibleMarkerKeys={visible}
            selectedMarker={selected}
            onMarkerLayout={() => undefined}
            onSelect={setSelected}
            onRequestClose={() => {
              setSelected(null);
              setMarkers([]);
            }}
            onFocusCastle={() => undefined}
          />
        </>
      );
    }
    render(<RemovedLeaseHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));
    const outside = screen.getByRole('button', { name: 'Outside control' });
    outside.focus();

    act(() => restoreLease());
    expect(document.activeElement).toBe(outside);
  });

  it('does not arm a delayed focus jump when a passive presence opens the record', () => {
    let revealControl: () => void = () => undefined;
    function PassivePresenceHarness() {
      const [selected, setSelected] = useState<RealmResourceOccupantMarker | null>(null);
      const [visible, setVisible] = useState<readonly string[]>([]);
      revealControl = () => setVisible(['wood:genesis-001:wood:0001']);
      return (
        <>
          <button type="button">Outside control</button>
          <RealmResourceOccupantMarkers
            markers={[first]}
            presenceMarkerKeys={['wood:genesis-001:wood:0001']}
            visibleMarkerKeys={visible}
            selectedMarker={selected}
            onMarkerLayout={() => undefined}
            onSelect={setSelected}
            onRequestClose={() => setSelected(null)}
            onFocusCastle={() => undefined}
          />
        </>
      );
    }
    const { container } = render(<PassivePresenceHarness />);
    const presence = container.querySelector<HTMLElement>(
      '.realm-resource-occupant-presence'
    );
    expect(presence).toBeTruthy();
    fireEvent.click(presence!);
    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));

    const outside = screen.getByRole('button', { name: 'Outside control' });
    outside.focus();
    act(() => revealControl());
    expect(document.activeElement).toBe(outside);
  });

  it('reapplies the latest projection only when membership changes', () => {
    const onMarkerLayout = vi.fn();
    const markers = [first] as const;
    const visibleMarkerKeys = ['wood:genesis-001:wood:0001'] as const;
    const view = render(
      <RealmResourceOccupantMarkers
        markers={markers}
        visibleMarkerKeys={visibleMarkerKeys}
        selectedMarker={null}
        onMarkerLayout={onMarkerLayout}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    expect(onMarkerLayout).toHaveBeenCalledTimes(1);
    view.rerender(
      <RealmResourceOccupantMarkers
        markers={markers}
        visibleMarkerKeys={visibleMarkerKeys}
        selectedMarker={null}
        onMarkerLayout={onMarkerLayout}
        onSelect={() => undefined}
        onRequestClose={() => undefined}
        onFocusCastle={() => undefined}
      />
    );
    expect(onMarkerLayout).toHaveBeenCalledTimes(1);
  });
});
