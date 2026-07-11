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

describe('RealmHud', () => {
  it('personalizes the fixed center keep without claiming persistent ownership', () => {
    const onFocusKeep = vi.fn();
    const onRecenterKeep = vi.fn();
    const onRequestReturn = vi.fn();
    render(
      <RealmHud
        identity={{ fid: 12_345, username: 'warpkeeper', displayName: 'Warp Keeper' }}
        selectedCell={centerCell()}
        selectedIsKeep
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
    expect(screen.getByText(/Session-bound prototype/i)).not.toBeNull();
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
        selectedIsKeep
        keepLoadStatus="fallback"
        cameraMode="keep"
        quality="compact"
        onFocusKeep={vi.fn()}
        onRecenterKeep={vi.fn()}
        onShowRealm={vi.fn()}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'FID 98765 Keep' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Realm View' })).not.toBeNull();
  });
});
