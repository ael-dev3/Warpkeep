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
  it('keeps resource chrome presentation-only until a public Marks balance is ready', () => {
    const common = commonProps();
    const { container, rerender } = render(
      <RealmHud {...common} marksStatus="loading" />
    );
    const resourceStrip = screen.getByLabelText('Resources');
    expect(resourceStrip.getAttribute('class')).toBe('realm-resource-strip');
    expect(screen.getByLabelText('Gold: presentation only, not tracked in this build')).not.toBeNull();
    expect(screen.getByLabelText('Food: presentation only, not tracked in this build')).not.toBeNull();
    expect(screen.getByLabelText('Stone: presentation only, not tracked in this build')).not.toBeNull();
    expect(screen.getByLabelText('Wood: presentation only, not tracked in this build')).not.toBeNull();
    expect(screen.getByLabelText('Marks balance unavailable')).not.toBeNull();
    expect(resourceStrip.textContent).not.toMatch(/Loading Marks|0 Marks|not tracked in this build/i);
    expect(container.querySelector('[data-resource="gold"] img')?.getAttribute('src'))
      .toContain('images/resources/hegemony-gold.png');
    expect(container.querySelector('[data-resource="food"] img')?.getAttribute('src'))
      .toContain('images/resources/hegemony-food.png');
    expect(container.querySelector('[data-resource="stone"] img')?.getAttribute('src'))
      .toContain('images/resources/hegemony-stone.png');
    expect(container.querySelector('[data-resource="wood"] img')?.getAttribute('src'))
      .toContain('images/resources/hegemony-wood.png');

    rerender(<RealmHud {...common} marksStatus="unavailable" />);
    expect(screen.getByLabelText('Marks balance unavailable')).not.toBeNull();

    rerender(
      <RealmHud
        {...common}
        marksStatus="ready"
        ownProfile={{
          communityStatsVisible: true,
          marksBalanceMicros: 123_450_000n
        }}
      />
    );
    expect(screen.getByLabelText('Marks balance: 123.45 Marks')).not.toBeNull();
    expect(container.querySelector('[data-resource="marks"] source')?.getAttribute('srcset'))
      .toContain('hegemony-mark-64.webp');
    expect(container.querySelector('[data-resource="marks"] img')?.getAttribute('src'))
      .toContain('hegemony-mark-64.png');
  });

  it('presents a compact player profile without FID, shared telemetry, or permanent help copy', () => {
    const { container } = render(
      <RealmHud
        {...commonProps()}
        identity={{ fid: 98_765 }}
        ownCastle={undefined}
      />
    );

    expect(screen.getByText('GENESIS 001 · 1,261 CELLS')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Keep' })).not.toBeNull();
    expect(screen.getByText('Hegemony Keeper')).not.toBeNull();
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
    expect(screen.getByLabelText('Your Farcaster profile: Hegemony Keeper')).not.toBeNull();
    expect(container.querySelector('.realm-hud .realm-castle-avatar')).not.toBeNull();
    expect(screen.queryByText(/FID 98765/i)).toBeNull();
    expect(screen.queryByLabelText('Shared realm state')).toBeNull();
    expect(document.body.textContent).not.toMatch(/movement cost|generation|Drag to survey/i);
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
          canonicalUsername: 'peerkeeper',
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
          canonicalUsername: 'warpkeeper',
          communityStatsVisible: false
        }}
      />
    );
    expect(liveRegion?.textContent).toBe(initialAnnouncement);

    rerender(
      <RealmHud
        {...common}
        selectedCell={terrainCell(1, 0)}
        selectedTerrainKind="heath"
      />
    );
    expect(liveRegion?.textContent).toContain('Amethyst Heath. Selected cell 1, 0');
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Amethyst Heath · q 1, r 0');
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
