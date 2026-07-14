import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmHud } from '../src/components/realm/RealmHud';
import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

afterEach(cleanup);

function centerCell() {
  const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
  const cell = terrainCellByCoord(map, { q: 0, r: 0 });
  if (!cell) throw new Error('missing center terrain cell');
  return cell;
}

function lowlandsCell() {
  const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
  const cell = terrainCellByCoord(map, { q: 1, r: 0 });
  if (!cell) throw new Error('missing lowlands terrain cell');
  return cell;
}

describe('RealmHud', () => {
  it('renders loading, unavailable, and exact ready Marks states with a PNG fallback', () => {
    const common = {
      identity: { fid: 12_345, username: 'warpkeeper' },
      ownCastle: { name: 'Warpkeeper Bastion', level: 2 },
      selectedCell: centerCell(),
      hoveredCell: null,
      keepLoadStatus: 'ready' as const,
      cameraMode: 'realm' as const,
      quality: 'high' as const,
      onFocusKeep: vi.fn(),
      onRecenterKeep: vi.fn(),
      onShowRealm: vi.fn(),
      onRequestReturn: vi.fn()
    };
    const { container, rerender } = render(
      <RealmHud {...common} marksStatus="loading" />
    );
    expect(screen.getByLabelText('Loading Marks…')).not.toBeNull();

    rerender(<RealmHud {...common} marksStatus="unavailable" />);
    expect(screen.getByLabelText('Marks not available')).not.toBeNull();

    rerender(
      <RealmHud
        {...common}
        marksStatus="ready"
        ownProfile={{
          fid: 12_345,
          publicStatus: 'active',
          communityStatsVisible: true,
          marksBalanceMicros: 123_450_000n
        }}
      />
    );
    expect(screen.getByLabelText('Marks balance: 123.45 Marks')).not.toBeNull();
    expect(container.querySelector('source')?.getAttribute('srcset'))
      .toContain('hegemony-mark-64.webp');
    expect(container.querySelector('.realm-hud__marks img')?.getAttribute('src'))
      .toContain('hegemony-mark-64.png');
  });

  it('personalizes the fixed center keep without claiming persistent ownership', () => {
    const onFocusKeep = vi.fn();
    const onRecenterKeep = vi.fn();
    const onRequestReturn = vi.fn();
    render(
      <RealmHud
        identity={{ fid: 12_345, username: 'warpkeeper', displayName: 'Warp Keeper' }}
        selectedCell={centerCell()}
        hoveredCell={null}
        keepLoadStatus="ready"
        cameraMode="realm"
        quality="high"
        onFocusKeep={onFocusKeep}
        onRecenterKeep={onRecenterKeep}
        onShowRealm={vi.fn()}
        onRequestReturn={onRequestReturn}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
    expect(screen.getByText('Hegemony Frontier Keep')).not.toBeNull();
    expect(screen.getByText(/frontier keep stands ready for this expedition/i)).not.toBeNull();
    expect(screen.getByText('Selected cell 0, 0')).not.toBeNull();
    expect(screen.getByText('QUALITY HIGH')).not.toBeNull();
    expect(screen.queryByText(/elevation|soil/i)).toBeNull();
    expect(screen.queryByText(/owned permanently/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recenter Keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onFocusKeep).toHaveBeenCalledTimes(1);
    expect(onRecenterKeep).toHaveBeenCalledTimes(1);
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
  });

  it('offers the founding-district framing only when nearby keeps can be framed', () => {
    const onFrameFoundingDistrict = vi.fn();
    const common = {
      identity: { fid: 12_345, username: 'warpkeeper' },
      selectedCell: centerCell(),
      hoveredCell: null,
      keepLoadStatus: 'ready' as const,
      cameraMode: 'realm' as const,
      quality: 'high' as const,
      onFocusKeep: vi.fn(),
      onRecenterKeep: vi.fn(),
      onShowRealm: vi.fn(),
      onRequestReturn: vi.fn()
    };
    const { rerender } = render(<RealmHud {...common} />);
    expect(screen.queryByRole('button', { name: 'Frame the nearby founding keeps' })).toBeNull();

    rerender(
      <RealmHud
        {...common}
        onFrameFoundingDistrict={onFrameFoundingDistrict}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Frame the nearby founding keeps' }));
    expect(onFrameFoundingDistrict).toHaveBeenCalledTimes(1);
  });

  it('uses an FID keep title when no username is available', () => {
    render(
      <RealmHud
        identity={{ fid: 98_765 }}
        selectedCell={centerCell()}
        hoveredCell={null}
        keepLoadStatus="fallback"
        cameraMode="keep"
        quality="reduced"
        onFocusKeep={vi.fn()}
        onRecenterKeep={vi.fn()}
        onShowRealm={vi.fn()}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'FID 98765 Keep' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Realm View' })).not.toBeNull();
  });

  it('names the territory currently being surveyed without exposing terrain internals', () => {
    render(
      <RealmHud
        identity={{ fid: 98_765 }}
        selectedCell={centerCell()}
        hoveredCell={lowlandsCell()}
        keepLoadStatus="ready"
        cameraMode="realm"
        quality="balanced"
        onFocusKeep={vi.fn()}
        onRecenterKeep={vi.fn()}
        onShowRealm={vi.fn()}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByText('Temperate Lowlands')).not.toBeNull();
    expect(screen.getByText('Surveying cell 1, 0')).not.toBeNull();
    expect(screen.getByText('Olive grass · terrain record pending.')).not.toBeNull();
    expect(screen.queryByText(/elevation|soil/i)).toBeNull();
  });
});
