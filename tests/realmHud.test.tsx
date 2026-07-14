import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmHud } from '../src/components/realm/RealmHud';
import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

afterEach(cleanup);

function terrainCell(q = 0, r = 0) {
  const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 20);
  const cell = terrainCellByCoord(map, { q, r });
  if (!cell) throw new Error(`missing terrain cell ${q},${r}`);
  return cell;
}

function commonProps() {
  return {
    identity: { fid: 12_345, username: 'warpkeeper' },
    ownCastle: { name: 'Warpkeeper Bastion', level: 2 },
    selectedCell: terrainCell(),
    keepLoadStatus: 'ready' as const,
    cameraMode: 'realm' as const,
    quality: 'high' as const,
    onFocusKeep: vi.fn(),
    onRecenterKeep: vi.fn(),
    onShowRealm: vi.fn(),
    onRequestReturn: vi.fn()
  };
}

describe('RealmHud', () => {
  it('renders loading, unavailable, and exact ready Marks states with a PNG fallback', () => {
    const common = commonProps();
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

  it('presents the canonical 1,261-cell realm and keeps FID out of the primary identity', () => {
    render(
      <RealmHud
        {...commonProps()}
        identity={{ fid: 98_765 }}
        ownCastle={undefined}
        sharedTileCount={1_261}
        sharedPlayerCount={1}
        sharedCastleCount={1}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Keep' })).not.toBeNull();
    expect(screen.getByText('Hegemony Keeper')).not.toBeNull();
    expect(screen.getByLabelText('Shared realm state').textContent)
      .toBe('GENESIS 001 · 1,261 CELLS · 1 KEEPER · 1 KEEP');
    expect(screen.queryByText('FID 98765')).toBeNull();
    expect(screen.queryByRole('heading', { name: /FID/i })).toBeNull();
  });

  it('changes the selection record only from explicit selected props', () => {
    const common = commonProps();
    const { rerender } = render(<RealmHud {...common} />);

    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <RealmHud
        {...common}
        selectedCell={terrainCell(2, -1)}
        selectedCastle={{ name: 'Peer Watch', level: 3, q: 2, r: -1 }}
        selectedCastleProfile={{
          fid: 77,
          canonicalUsername: 'peerkeeper',
          publicStatus: 'founding-player',
          communityStatsVisible: false
        }}
      />
    );

    expect(screen.getByText('Peer Watch · 2, -1')).not.toBeNull();
    expect(screen.getByText('@peerkeeper')).not.toBeNull();
    expect(screen.getByText(/Selected castle at cell 2, -1/)).not.toBeNull();
  });

  it('announces explicit selection changes without reannouncing async presentation updates', () => {
    const common = commonProps();
    const { container, rerender } = render(
      <RealmHud {...common} keepLoadStatus="loading" />
    );
    const liveRegion = container.querySelector('.realm-hud__selection-announcement');
    const initialAnnouncement = liveRegion?.textContent;
    expect(initialAnnouncement).toContain('Your keep is selected at cell 0, 0');

    rerender(
      <RealmHud
        {...common}
        keepLoadStatus="ready"
        ownProfile={{
          fid: 12_345,
          canonicalUsername: 'warpkeeper',
          publicStatus: 'active',
          communityStatsVisible: false
        }}
      />
    );
    expect(liveRegion?.textContent).toBe(initialAnnouncement);

    rerender(<RealmHud {...common} selectedCell={terrainCell(1, 0)} />);
    expect(liveRegion?.textContent).toContain('Selected cell 1, 0');
  });

  it('offers camera actions without allowing nested keys to masquerade as map selection', () => {
    const onFocusKeep = vi.fn();
    const onRecenterKeep = vi.fn();
    const onFrameFoundingDistrict = vi.fn();
    const onRequestReturn = vi.fn();
    render(
      <RealmHud
        {...commonProps()}
        onFocusKeep={onFocusKeep}
        onRecenterKeep={onRecenterKeep}
        onFrameFoundingDistrict={onFrameFoundingDistrict}
        onRequestReturn={onRequestReturn}
      />
    );

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    returnButton.focus();
    expect(fireEvent.keyDown(returnButton, { key: 'ArrowRight' })).toBe(true);
    expect(document.activeElement).toBe(returnButton);
    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recenter Keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Frame the nearby founding keeps' }));
    fireEvent.click(returnButton);
    expect(onFocusKeep).toHaveBeenCalledOnce();
    expect(onRecenterKeep).toHaveBeenCalledOnce();
    expect(onFrameFoundingDistrict).toHaveBeenCalledOnce();
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });
});
