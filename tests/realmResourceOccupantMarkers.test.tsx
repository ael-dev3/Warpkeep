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
    resource: 'wood',
    siteId,
    nodeCoord: { q: 3, r: -2 },
    tier: 1,
    workerOrdinal: 2,
    workerPhase: 'gathering',
    timelineRevision: 1,
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
  workerOrdinal: 3
});

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

    fireEvent.click(screen.getByRole('button', { name: 'Close player record' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
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
    const castleAction = screen.getByRole('button', { name: /View castle location/i });
    castleAction.focus();

    const updated = marker(first.siteId, {
      timelineRevision: 2,
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
    expect(document.activeElement).toBe(castleAction);
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
