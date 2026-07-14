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
    onRecenterKeep: vi.fn(),
    onRequestReturn: vi.fn()
  };
}

describe('RealmHud', () => {
  it('omits non-ready Marks states and renders an exact ready balance with its fallback asset', () => {
    const common = commonProps();
    const { container, rerender } = render(
      <RealmHud {...common} marksStatus="loading" />
    );
    expect(container.querySelector('.realm-hud__marks')).toBeNull();
    expect(screen.queryByText(/Loading Marks/i)).toBeNull();

    rerender(<RealmHud {...common} marksStatus="unavailable" />);
    expect(container.querySelector('.realm-hud__marks')).toBeNull();
    expect(screen.queryByText(/Marks not available/i)).toBeNull();

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

  it('presents a compact identity without FID, shared telemetry, or permanent help copy', () => {
    render(
      <RealmHud
        {...commonProps()}
        identity={{ fid: 98_765 }}
        ownCastle={undefined}
      />
    );

    expect(screen.getByText('GENESIS 001')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Keep' })).not.toBeNull();
    expect(screen.getByText('Hegemony Keeper')).not.toBeNull();
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
    expect(screen.queryByText(/FID 98765/i)).toBeNull();
    expect(screen.queryByLabelText('Shared realm state')).toBeNull();
    expect(document.body.textContent).not.toMatch(/1,261 CELLS|movement cost|generation|Drag to survey/i);
  });

  it('shows only a concise explicit selection record', () => {
    const common = commonProps();
    const { rerender } = render(<RealmHud {...common} />);

    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
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

    expect(screen.getByLabelText('Current selection').textContent)
      .toBe('@peerkeeperPeer Watch · q 2, r -1');
    expect(document.body.textContent).not.toMatch(/Activate its record|Level 3 castle|movement cost|generation/i);
  });

  it('announces explicit selection changes without reannouncing presentation-only updates', () => {
    const common = commonProps();
    const { container, rerender } = render(<RealmHud {...common} />);
    const liveRegion = container.querySelector('.realm-hud__selection-announcement');
    const initialAnnouncement = liveRegion?.textContent;
    expect(initialAnnouncement).toContain('Your keep is selected at cell 0, 0');

    rerender(
      <RealmHud
        {...common}
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

  it('offers stable Menu and Home actions without camera-mode label churn', () => {
    const onRecenterKeep = vi.fn();
    const onRequestReturn = vi.fn();
    const { container } = render(
      <RealmHud
        {...commonProps()}
        onRecenterKeep={onRecenterKeep}
        onRequestReturn={onRequestReturn}
      />
    );

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    const homeButton = screen.getByRole('button', { name: 'Recenter Keep' });
    const hud = container.querySelector('.realm-hud');
    const actions = container.querySelector('.realm-hud__actions');
    expect(returnButton.textContent).toBe('Menu');
    expect(homeButton.textContent).toBe('Home');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // The fixed toolbar must remain a sibling. Nesting it under the blurred
    // HUD creates a fixed-position containing block and can collapse the
    // camera's measured safe viewport to a thin strip.
    expect(hud?.contains(actions)).toBe(false);

    returnButton.focus();
    expect(fireEvent.keyDown(returnButton, { key: 'ArrowRight' })).toBe(true);
    expect(document.activeElement).toBe(returnButton);

    fireEvent.click(homeButton);
    fireEvent.click(returnButton);
    expect(onRecenterKeep).toHaveBeenCalledOnce();
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });
});
