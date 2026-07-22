import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WaterInspectionPanel } from '../src/components/realm/WaterInspectionPanel';
import type { RealmWaterInspectionRecord } from '../src/components/realm/realmWaterInspectionPresentation';

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

afterEach(cleanup);

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

    const close = screen.getByRole('button', { name: 'CLOSE WATER RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
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
    const onFocusCell = vi.fn();
    render(
      <WaterInspectionPanel
        id="water-record"
        record={RECORD}
        onRequestClose={vi.fn()}
        onFocusCell={onFocusCell}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'FOLLOW TO SOURCE' }));
    fireEvent.click(screen.getByRole('button', { name: 'FOLLOW TO MOUTH' }));

    expect(onFocusCell.mock.calls).toEqual([
      [RECORD.sourceCellKey],
      [RECORD.mouthCellKey]
    ]);
  });
});
