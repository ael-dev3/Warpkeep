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
    expect(screen.queryByText('HIGH')).toBeNull();
    expect(screen.queryByText(/elevation|soil/i)).toBeNull();
    expect(screen.queryByText(/owned permanently/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recenter Keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onFocusKeep).toHaveBeenCalledTimes(1);
    expect(onRecenterKeep).toHaveBeenCalledTimes(1);
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
  });

  it('uses an FID keep title when no username is available', () => {
    render(
      <RealmHud
        identity={{ fid: 98_765 }}
        selectedCell={centerCell()}
        hoveredCell={null}
        keepLoadStatus="fallback"
        cameraMode="keep"
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
        onFocusKeep={vi.fn()}
        onRecenterKeep={vi.fn()}
        onShowRealm={vi.fn()}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByText('Temperate Lowlands')).not.toBeNull();
    expect(screen.getByText('Surveying cell 1, 0')).not.toBeNull();
    expect(screen.getByText('Olive grass · open ground · calm terrain.')).not.toBeNull();
    expect(screen.queryByText(/elevation|soil/i)).toBeNull();
  });
});
