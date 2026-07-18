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
    expect(screen.getByLabelText('Your Farcaster profile: Hegemony Keeper')).not.toBeNull();
    expect(container.querySelector('.realm-castle-avatar')?.textContent).toBe('W');
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
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

  it('renders caller-bound resources in the fixed order and collects only through its callback', async () => {
    const onCollectResources = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RealmHud
        {...commonProps()}
        onCollectResources={onCollectResources}
        resources={{
          status: 'ready',
          fid: 12_345n,
          balances: { food: 200n, wood: 150n, stone: 100n, gold: 25n },
          pendingBalances: { food: 8n, wood: 5n, stone: 3n, gold: 1n },
          marksBalanceMicros: 123_450_000n,
          observedAtMicros: 1_800_000_600_000_000n,
          settledThroughMicros: 1_800_000_000_000_000n,
          nextCollectAtMicros: 1_800_001_200_000_000n,
          revision: 7n,
          resourcePolicyVersion: 'genesis-resource-yield-v1',
          marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
          terrainKind: 'lowland'
        }}
      />
    );

    expect(screen.getByLabelText('Food balance: 200; pending yield: 8')).not.toBeNull();
    expect(screen.getByLabelText('Wood balance: 150; pending yield: 5')).not.toBeNull();
    expect(screen.getByLabelText('Stone balance: 100; pending yield: 3')).not.toBeNull();
    expect(screen.getByLabelText('Gold balance: 25; pending yield: 1')).not.toBeNull();
    expect(screen.getByLabelText('Marks balance: 123.45 Marks')).not.toBeNull();
    expect([...container.querySelectorAll('.realm-hud__resources li small')]
      .map((node) => node.textContent)).toEqual(['Food', 'Wood', 'Stone', 'Gold', 'Marks']);

    fireEvent.click(screen.getByRole('button', { name: 'Collect pending resource yield' }));
    expect(onCollectResources).toHaveBeenCalledOnce();
  });
});
