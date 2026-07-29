import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WATER_INSPECTION_FOLLOW_INTERVAL_MS,
  WaterInspectionPanel
} from '../src/components/realm/WaterInspectionPanel';
import type {
  RealmWaterInspectionNavigation,
  RealmWaterInspectionRecord
} from '../src/components/realm/realmWaterInspectionPresentation';

const RECORD: RealmWaterInspectionRecord = Object.freeze({
  cellKey: '12,-7',
  coord: Object.freeze({ q: 12, r: -7 }),
  bodyId: 'genesis-river-01',
  regime: 'river',
  displayType: 'river',
  displayName: 'Genesis River 01',
  description: 'A persistent river record.',
  riverOrdinal: 1,
  riverPosition: 'middle reach',
  riverOrder: 4,
  riverCellCount: 12,
  sourceCellKey: '10,-5',
  mouthCellKey: '20,-10',
  sourceCoord: Object.freeze({ q: 10, r: -5 }),
  mouthCoord: Object.freeze({ q: 20, r: -10 }),
  downstreamWaterCellKey: '13,-8',
  flowClass: 'main reach',
  depthCells: 1,
  fogBand: 'clear',
  underlyingTileKey: '12,-7',
  underlyingTerrainKind: 'forest',
  underlyingTerrainLabel: 'Lowland Forest',
  underlyingPassable: true,
  gameplayBoundary: 'Read-only water presentation.'
});

const NAVIGATION: RealmWaterInspectionNavigation = Object.freeze({
  cellKey: RECORD.cellKey,
  bodyId: RECORD.bodyId,
  previousCellKeys: Object.freeze(['11,-6']),
  previousCellKey: '11,-6',
  nextCellKey: '13,-8',
  sourceCellKey: RECORD.sourceCellKey!,
  mouthCellKey: RECORD.mouthCellKey!,
  sourceDistance: 4,
  mouthDistance: 7
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WaterInspectionPanel', () => {
  it('focuses its close control and handles one Escape without leaking it outward', async () => {
    const onRequestClose = vi.fn();
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && outerEscape()}>
        <WaterInspectionPanel
          id="water-record"
          record={RECORD}
          onRequestClose={onRequestClose}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: RECORD.displayName });
    const close = screen.getByRole('button', { name: 'CLOSE WATER RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(dialog.hasAttribute('data-water-cell-key')).toBe(false);
    expect(screen.queryByText('Coordinates')).toBeNull();
    expect(screen.queryByText('Body')).toBeNull();
    expect(screen.queryByText('Source → mouth')).toBeNull();
    expect(document.body.textContent).not.toContain(RECORD.bodyId);
    fireEvent.keyDown(close, { key: 'Escape' });

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it('closes the water inspector before viewing the underlying land cell', () => {
    const onRequestClose = vi.fn();
    const onViewUnderlyingCell = vi.fn();
    render(
      <WaterInspectionPanel
        id="water-record"
        record={RECORD}
        showDiagnostics
        onRequestClose={onRequestClose}
        onViewUnderlyingCell={onViewUnderlyingCell}
      />
    );

    expect(screen.getByText('Lowland Forest')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'VIEW UNDERLYING CELL' }));

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(onViewUnderlyingCell).toHaveBeenCalledOnce();
    expect(onRequestClose.mock.invocationCallOrder[0])
      .toBeLessThan(onViewUnderlyingCell.mock.invocationCallOrder[0]!);
  });

  it('routes source and mouth controls to their exact persisted endpoint keys', () => {
    const onSelectCell = vi.fn();
    render(
      <WaterInspectionPanel
        id="water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={onSelectCell}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open river source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open river mouth' }));

    expect(onSelectCell.mock.calls).toEqual([
      [RECORD.sourceCellKey],
      [RECORD.mouthCellKey]
    ]);
  });

  it('preserves q/r and opaque persistence identifiers for diagnostics mode', () => {
    render(
      <WaterInspectionPanel
        id="diagnostic-water-record"
        record={RECORD}
        showDiagnostics
        onRequestClose={vi.fn()}
      />
    );

    expect(screen.getByText('Coordinates').nextElementSibling?.textContent)
      .toBe('q 12 · r -7');
    expect(screen.getByText('Body').nextElementSibling?.textContent)
      .toBe('genesis-river-01');
    expect(screen.getByText('Source → mouth').nextElementSibling?.textContent)
      .toBe('10,-5 → 20,-10');
    expect(screen.getByRole('dialog').getAttribute('data-water-cell-key'))
      .toBe(RECORD.cellKey);
  });

  it('keeps underlying land identity out of the ordinary player record', () => {
    render(
      <WaterInspectionPanel
        id="player-water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={vi.fn()}
        onViewUnderlyingCell={vi.fn()}
      />
    );

    expect(screen.queryByText('Underlying terrain')).toBeNull();
    expect(screen.queryByText('Underlying land')).toBeNull();
    expect(screen.queryByText(RECORD.underlyingTerrainLabel!)).toBeNull();
    expect(screen.queryByRole('button', { name: 'VIEW UNDERLYING CELL' })).toBeNull();
  });

  it('steps through records without invoking the explicit camera focus action', () => {
    const onSelectCell = vi.fn();
    const onFocusCell = vi.fn();
    render(
      <WaterInspectionPanel
        id="navigable-water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={onSelectCell}
        onFocusCell={onFocusCell}
      />
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Previous upstream river cell'
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Next downstream river cell'
    }));

    expect(onSelectCell.mock.calls).toEqual([
      [NAVIGATION.previousCellKey],
      [NAVIGATION.nextCellKey]
    ]);
    expect(onFocusCell).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Focus river cell on map'
    }));
    expect(onFocusCell).toHaveBeenCalledExactlyOnceWith(RECORD.cellKey);
    expect(onSelectCell).toHaveBeenCalledTimes(2);
  });

  it('supports arrow, Home, and End record navigation without leaking keys outward', () => {
    const onSelectCell = vi.fn();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <WaterInspectionPanel
          id="keyboard-water-record"
          record={RECORD}
          navigation={NAVIGATION}
          onRequestClose={vi.fn()}
          onSelectCell={onSelectCell}
        />
      </div>
    );
    const dialog = screen.getByRole('dialog', { name: RECORD.displayName });

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Home' });
    fireEvent.keyDown(dialog, { key: 'End' });

    expect(onSelectCell.mock.calls).toEqual([
      [NAVIGATION.previousCellKey],
      [NAVIGATION.nextCellKey],
      [NAVIGATION.sourceCellKey],
      [NAVIGATION.mouthCellKey]
    ]);
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it('does not claim navigation keys from editable or nested-dialog targets', () => {
    const onSelectCell = vi.fn();
    render(
      <WaterInspectionPanel
        id="guarded-keyboard-water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={onSelectCell}
      />
    );
    const dialog = screen.getByRole('dialog', { name: RECORD.displayName });
    const input = document.createElement('input');
    dialog.append(input);
    const nestedDialog = document.createElement('section');
    nestedDialog.setAttribute('role', 'dialog');
    const nestedButton = document.createElement('button');
    nestedDialog.append(nestedButton);
    dialog.append(nestedDialog);

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(nestedButton, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'ArrowRight', repeat: true });
    fireEvent.keyDown(dialog, { key: 'ArrowRight', metaKey: true });

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it('follows one canonical record per bounded cadence and can stop explicitly', () => {
    vi.useFakeTimers();
    const onSelectCell = vi.fn();
    const { rerender } = render(
      <WaterInspectionPanel
        id="following-water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={onSelectCell}
      />
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Follow river downstream'
    }));
    expect(screen.getByRole('button', {
      name: 'Follow river downstream'
    }).getAttribute('aria-pressed')).toBe('true');
    expect(onSelectCell).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WATER_INSPECTION_FOLLOW_INTERVAL_MS - 1);
    expect(onSelectCell).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSelectCell).toHaveBeenCalledExactlyOnceWith(NAVIGATION.nextCellKey);

    const nextRecord = Object.freeze({
      ...RECORD,
      cellKey: NAVIGATION.nextCellKey!,
      coord: Object.freeze({ q: 13, r: -8 }),
      riverOrder: 5,
      downstreamWaterCellKey: '14,-9'
    });
    const nextNavigation = Object.freeze({
      ...NAVIGATION,
      cellKey: nextRecord.cellKey,
      previousCellKeys: Object.freeze([RECORD.cellKey]),
      previousCellKey: RECORD.cellKey,
      nextCellKey: '14,-9',
      sourceDistance: 5,
      mouthDistance: 6
    });
    rerender(
      <WaterInspectionPanel
        id="following-water-record-next"
        record={nextRecord}
        navigation={nextNavigation}
        onRequestClose={vi.fn()}
        onSelectCell={onSelectCell}
      />
    );
    vi.advanceTimersByTime(WATER_INSPECTION_FOLLOW_INTERVAL_MS);
    expect(onSelectCell.mock.calls).toEqual([
      [NAVIGATION.nextCellKey],
      [nextNavigation.nextCellKey]
    ]);

    fireEvent.click(screen.getByRole('button', {
      name: 'Stop following river'
    }));
    vi.advanceTimersByTime(WATER_INSPECTION_FOLLOW_INTERVAL_MS);
    expect(onSelectCell).toHaveBeenCalledTimes(2);
  });

  it('preserves action focus while the camera-neutral record changes', async () => {
    const { rerender } = render(
      <WaterInspectionPanel
        id="stable-focus-water-record"
        record={RECORD}
        navigation={NAVIGATION}
        onRequestClose={vi.fn()}
        onSelectCell={vi.fn()}
      />
    );
    const next = screen.getByRole('button', {
      name: 'Next downstream river cell'
    });
    next.focus();
    expect(document.activeElement).toBe(next);

    const nextRecord = Object.freeze({
      ...RECORD,
      cellKey: NAVIGATION.nextCellKey!,
      coord: Object.freeze({ q: 13, r: -8 }),
      riverOrder: 5,
      downstreamWaterCellKey: '14,-9'
    });
    const nextNavigation = Object.freeze({
      ...NAVIGATION,
      cellKey: nextRecord.cellKey,
      previousCellKeys: Object.freeze([RECORD.cellKey]),
      previousCellKey: RECORD.cellKey,
      nextCellKey: '14,-9',
      sourceDistance: 5,
      mouthDistance: 6
    });
    rerender(
      <WaterInspectionPanel
        id="stable-focus-water-record-next"
        record={nextRecord}
        navigation={nextNavigation}
        onRequestClose={vi.fn()}
        onSelectCell={vi.fn()}
      />
    );

    await waitFor(() => expect(document.activeElement).toBe(next));
  });

  it('disables topology actions locally when no validated graph join exists', () => {
    render(
      <WaterInspectionPanel
        id="unavailable-navigation-water-record"
        record={RECORD}
        onRequestClose={vi.fn()}
        onSelectCell={vi.fn()}
      />
    );

    expect(screen.getByRole('status').textContent)
      .toBe('River navigation is temporarily unavailable for this record.');
    expect(screen.queryByRole('button', {
      name: 'Previous upstream river cell'
    })).toBeNull();
  });
});
