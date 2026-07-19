import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmHud } from '../src/components/realm/RealmHud';
import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createReadyResourceState } from './fixtures/resourceState';

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

function selectionAnnouncement(container: HTMLElement) {
  const announcement = container.querySelector(
    '.realm-player-chrome__selection-announcement'
  );
  if (!(announcement instanceof HTMLParagraphElement)) {
    throw new Error('missing player selection announcement');
  }
  return announcement;
}

function openRealmMenu() {
  const trigger = screen.getByRole('button', { name: /Open Realm menu/i });
  fireEvent.click(trigger);
  return {
    trigger,
    dialog: screen.getByRole('dialog', { name: 'REALM MENU' })
  };
}

describe('RealmHud', () => {
  it('keeps the top-left player chrome to one PFP trigger without the former HUD block', () => {
    const { container } = render(
      <RealmHud
        {...commonProps()}
        identity={{ fid: 98_765 }}
        ownCastle={undefined}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Open Realm menu for Hegemony Keeper'
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('.realm-castle-avatar')?.textContent).toBe('W');
    expect(container.querySelector('.realm-hud')).toBeNull();
    expect(container.querySelector('.realm-hud__actions')).toBeNull();
    expect(screen.queryByText('GENESIS 001 · 1,261 CELLS')).toBeNull();
    expect(screen.queryByText(/LEVEL 1/i)).toBeNull();
    expect(screen.queryByText(/FID 98765/i)).toBeNull();
    expect(screen.queryByLabelText('Shared realm state')).toBeNull();
    expect(document.body.textContent).not.toMatch(/movement cost|generation|Drag to survey/i);
  });

  it('keeps selection detail in one private-layout live announcement', () => {
    const common = commonProps();
    const { container, rerender } = render(<RealmHud {...common} />);
    const announcement = selectionAnnouncement(container);
    const initialAnnouncement = announcement.textContent;

    expect(initialAnnouncement).toContain('Your keep is selected at cell 0, 0');
    expect(screen.queryByLabelText('Current selection')).toBeNull();

    rerender(
      <RealmHud
        {...common}
        ownProfile={{
          canonicalUsername: 'warpkeeper',
          communityStatsVisible: false
        }}
      />
    );
    expect(announcement.textContent).toBe(initialAnnouncement);

    rerender(
      <RealmHud
        {...common}
        selectedCell={terrainCell(1, 0)}
        selectedTerrainKind="heath"
      />
    );
    expect(announcement.textContent).toContain('Amethyst Heath. Selected cell 1, 0');

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
    expect(announcement.textContent)
      .toBe('@peerkeeper, Peer Watch. Selected castle at cell 2, -1.');
    expect(document.body.textContent).not.toMatch(/Activate its record|Level 3 castle|movement cost|generation/i);
  });

  it('moves keep, Explore, settings, and return commands behind the PFP menu', async () => {
    const onRecenterKeep = vi.fn();
    const onRequestExplore = vi.fn();
    const onRequestReturn = vi.fn();
    const onGraphicsPreferenceChange = vi.fn();
    render(
      <RealmHud
        {...commonProps()}
        foundedCastleCount={2}
        onGraphicsPreferenceChange={onGraphicsPreferenceChange}
        onRecenterKeep={onRecenterKeep}
        onRequestExplore={onRequestExplore}
        onRequestReturn={onRequestReturn}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Recenter Keep' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Explore realm/i })).toBeNull();

    let opened = openRealmMenu();
    expect(opened.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(opened.dialog).getByRole('button', { name: /MY KEEP/i })).not.toBeNull();
    expect(within(opened.dialog).getByRole('button', { name: /EXPLORE.*2 founded castles/i }))
      .not.toBeNull();
    expect(within(opened.dialog).getByRole('button', { name: /SETTINGS/i })).not.toBeNull();
    expect(within(opened.dialog).getByRole('button', { name: /MAIN MENU/i })).not.toBeNull();

    fireEvent.click(within(opened.dialog).getByRole('button', { name: /MY KEEP/i }));
    expect(onRecenterKeep).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(opened.trigger));

    opened = openRealmMenu();
    fireEvent.click(within(opened.dialog).getByRole('button', { name: /EXPLORE/i }));
    expect(onRequestExplore).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(opened.trigger));

    opened = openRealmMenu();
    fireEvent.click(within(opened.dialog).getByRole('button', { name: /SETTINGS/i }));
    expect(screen.getByRole('dialog', { name: 'SETTINGS' })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'SETTINGS' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO REALM MENU' }));
    expect(screen.getByRole('dialog', { name: 'REALM MENU' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close Realm menu' }));
    await waitFor(() => expect(document.activeElement).toBe(opened.trigger));

    opened = openRealmMenu();
    fireEvent.click(within(opened.dialog).getByRole('button', { name: /MAIN MENU/i }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('renders zero-valued caller-bound resources in the fixed top-rail order', () => {
    const resources = createReadyResourceState();
    const { container } = render(
      <RealmHud
        {...commonProps()}
        onCollectResources={vi.fn().mockResolvedValue(undefined)}
        resources={resources}
      />
    );

    const rail = screen.getByRole('region', { name: 'Your resources' });
    const entries = within(rail).getAllByRole('listitem');
    expect(entries.map((entry) => entry.querySelector('button')?.getAttribute('aria-label'))).toEqual([
      'Food: 0 stored; 0 ready to collect. Show resource details.',
      'Wood: 0 stored; 0 ready to collect. Show resource details.',
      'Stone: 0 stored; 0 ready to collect. Show resource details.',
      'Gold: 0 stored; 0 ready to collect. Show resource details.',
      'Community Marks: 0 Marks. Show Marks details.'
    ]);
    expect(entries.map((entry) => entry.querySelector('strong')?.textContent))
      .toEqual(['0', '0', '0', '0', '0']);
    expect(container.querySelectorAll('.realm-resource-rail picture')).toHaveLength(5);
    expect(container.querySelector('.realm-resource-rail__marks source')?.getAttribute('srcset'))
      .toContain('hegemony-mark-64.webp');
    expect(container.querySelector('.realm-resource-rail__marks img')?.getAttribute('src'))
      .toContain('hegemony-mark-64.png');
    const { dialog } = openRealmMenu();
    expect(within(dialog).queryByRole('button', { name: /COLLECT YIELD/i })).toBeNull();
  });

  it('explains current resource behavior on pointer, keyboard, and touch', () => {
    const base = createReadyResourceState();
    render(
      <RealmHud
        {...commonProps()}
        resources={{
          ...base,
          balances: { food: 200n, wood: 150n, stone: 100n, gold: 25n },
          pendingBalances: { food: 8n, wood: 5n, stone: 3n, gold: 1n },
          marksBalanceMicros: 123_450_000n
        }}
      />
    );

    const rail = screen.getByRole('region', { name: 'Your resources' });
    const food = within(rail).getByRole('button', {
      name: 'Food: 200 stored; 8 ready to collect. Show resource details.'
    });
    const wood = within(rail).getByRole('button', { name: /Wood: 150 stored/i });
    const stone = within(rail).getByRole('button', { name: /Stone: 100 stored/i });
    const gold = within(rail).getByRole('button', { name: /Gold: 25 stored/i });
    const marks = within(rail).getByRole('button', {
      name: 'Community Marks: 123.45 Marks. Show Marks details.'
    });
    const stableFoodDescriptionId = food.getAttribute('aria-describedby');

    expect(stableFoodDescriptionId).toBeTruthy();
    expect(document.getElementById(stableFoodDescriptionId!)?.hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerEnter(food, { pointerType: 'mouse' });
    let tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('200 stored · 8 ready to collect');
    expect(tooltip.textContent).toContain('farm expeditions can gather more');
    expect(tooltip.textContent).toContain('Spending is not live yet');
    expect(tooltip.getAttribute('aria-live')).toBe('off');
    expect(food.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(rail.getAttribute('data-tooltip-open')).toBe('food');
    fireEvent.pointerLeave(food, { pointerType: 'mouse', relatedTarget: rail });
    expect(screen.getByRole('tooltip')).toBe(tooltip);
    fireEvent.pointerEnter(tooltip, { pointerType: 'mouse', relatedTarget: food });
    expect(screen.getByRole('tooltip')).toBe(tooltip);
    fireEvent.pointerLeave(tooltip, { pointerType: 'mouse', relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => wood.focus());
    tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('logging expeditions can gather more');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(wood);

    act(() => stone.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('quarry sites and Stone spending are not live yet');
    act(() => gold.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('comes only from mine expeditions');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('terrain Gold and spending are not live');
    act(() => marks.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('Separate community-attribution balance');
    expect(rail.getAttribute('data-tooltip-open')).toBe('marks');

    act(() => marks.blur());
    fireEvent.pointerDown(gold, { pointerType: 'touch' });
    fireEvent.click(gold);
    expect(screen.getByRole('tooltip').getAttribute('data-resource')).toBe('gold');
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('collects an available yield only through the command callback', async () => {
    const onCollectResources = vi.fn().mockResolvedValue(undefined);
    const base = createReadyResourceState();
    render(
      <RealmHud
        {...commonProps()}
        onCollectResources={onCollectResources}
        resources={{
          ...base,
          balances: { food: 200n, wood: 150n, stone: 100n, gold: 25n },
          pendingBalances: { food: 8n, wood: 5n, stone: 3n, gold: 1n },
          marksBalanceMicros: 123_450_000n
        }}
      />
    );

    expect(screen.getByRole('button', {
      name: 'Food: 200 stored; 8 ready to collect. Show resource details.'
    })).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Community Marks: 123.45 Marks. Show Marks details.'
    })).not.toBeNull();
    const { dialog } = openRealmMenu();
    fireEvent.click(within(dialog).getByRole('button', { name: /COLLECT YIELD/i }));
    await waitFor(() => expect(onCollectResources).toHaveBeenCalledOnce());
  });
});
