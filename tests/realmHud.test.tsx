import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmHud } from '../src/components/realm/RealmHud';
import type {
  ReadyWorkerProjection,
  ReadyWorkerResourceState,
  WorkerRosterPresentation
} from '../src/components/realm/realmWorkerPresentation';
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

function workerUiFixture() {
  const ownWorkers = [1, 2, 3, 4].map((ordinal) => ({
    workerId: `genesis-001-castle-7-worker-0${ordinal}`,
    ordinal: ordinal as 1 | 2 | 3 | 4,
    originCastleId: 7,
    originCastleName: 'Warpkeeper Bastion',
    status: 'idle' as const,
    timelineRevision: 0,
    revision: 0n,
    ownedByViewer: true
  }));
  const peerWorkers = [1, 2, 3, 4].map((ordinal) => ({
    workerId: `genesis-001-castle-8-worker-0${ordinal}`,
    ordinal: ordinal as 1 | 2 | 3 | 4,
    originCastleId: 8,
    originCastleName: 'Peer Keep',
    status: 'idle' as const,
    timelineRevision: 0,
    revision: 0n,
    ownedByViewer: false
  }));
  const workerProjection: ReadyWorkerProjection = {
    mode: 'active',
    system: {
      realmId: 'GENESIS_001',
      policyVersion: 'genesis-001-castle-workers-v1',
      workersPerCastle: 4,
      expectedCastleCount: 2,
      expectedWorkerCount: 8,
      rosterDigest: '0000000000000000',
      mode: 'active',
      legacyDrainRequired: false
    },
    workers: [...ownWorkers, ...peerWorkers],
    ownedWorkers: ownWorkers,
    occupations: []
  };
  const workerRoster: WorkerRosterPresentation = {
    castleId: 7,
    observedAtMicros: 10n,
    workers: ownWorkers.map((worker) => ({
      workerId: worker.workerId,
      ordinal: worker.ordinal,
      status: worker.status,
      accruedAmount: 0n,
      materializedAmount: 0n,
      availableAmount: 0n,
      observedAtMicros: 10n,
      revision: worker.revision
    }))
  };
  const workerResourceState: ReadyWorkerResourceState = {
    status: 'ready',
    fid: 12_345n,
    available: { food: 0n, wood: 0n, stone: 0n, gold: 0n },
    pending: { food: 0n, wood: 0n, stone: 0n, gold: 0n },
    observedAtMicros: 10n,
    settledThroughMicros: 10n,
    revision: 0n,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    workerPolicyVersion: 'genesis-001-castle-workers-v1',
    workerSystemMode: 'active'
  };
  return { workerProjection, workerRoster, workerResourceState };
}

function assignedWorkerUiFixture() {
  const base = workerUiFixture();
  const assigned = {
    ...base.workerProjection.ownedWorkers[0]!,
    status: 'gathering' as const,
    resourceKind: 'stone' as const,
    siteId: 'genesis-001:stone:0001',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 100n,
    returnsAtMicros: 120n,
    routeSteps: 1,
    timelineRevision: 1,
    revision: 2n
  };
  const ownedWorkers = [
    assigned,
    ...base.workerProjection.ownedWorkers.slice(1)
  ];
  const workerProjection: ReadyWorkerProjection = {
    ...base.workerProjection,
    workers: [
      assigned,
      ...base.workerProjection.workers.filter((worker) => worker.workerId !== assigned.workerId)
    ],
    ownedWorkers,
    occupations: [{
      nodeKey: 'stone:genesis-001:stone:0001',
      resourceKind: 'stone',
      siteId: 'genesis-001:stone:0001',
      workerId: assigned.workerId,
      workerOrdinal: 1,
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 100n,
      timelineRevision: 1
    }]
  };
  const workerRoster: WorkerRosterPresentation = {
    ...base.workerRoster,
    workers: base.workerRoster.workers.map((worker) => worker.workerId === assigned.workerId
      ? {
          ...worker,
          status: 'gathering',
          resourceKind: 'stone',
          siteId: 'genesis-001:stone:0001',
          accruedAmount: 3n,
          availableAmount: 3n,
          revision: 2n
        }
      : worker)
  };
  const workerResourceState: ReadyWorkerResourceState = {
    ...base.workerResourceState,
    pending: { ...base.workerResourceState.pending, stone: 3n }
  };
  return { workerProjection, workerRoster, workerResourceState };
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
    expect(trigger.getAttribute('aria-controls')).toBeNull();
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
    expect(opened.trigger.getAttribute('aria-controls')).toBe('realm-player-menu');
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
    const settingsTrigger = within(opened.dialog).getByRole('button', { name: /SETTINGS/i });
    expect(settingsTrigger.getAttribute('aria-controls')).toBe('realm-player-settings');
    expect(settingsTrigger.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(settingsTrigger);
    const settings = screen.getByRole('dialog', { name: 'SETTINGS' });
    expect(settings.id).toBe('realm-player-settings');
    expect(opened.trigger.getAttribute('aria-controls')).toBe('realm-player-settings');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'SETTINGS' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO REALM MENU' }));
    expect(screen.getByRole('dialog', { name: 'REALM MENU' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close Realm menu' }));
    await waitFor(() => expect(document.activeElement).toBe(opened.trigger));

    opened = openRealmMenu();
    fireEvent.click(within(opened.dialog).getByRole('button', { name: /MAIN MENU/i }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('offers up to four privacy-bounded active wagon shortcuts in the PFP menu', async () => {
    const onOpenActiveWagon = vi.fn();
    const activeWagons = [
      { resource: 'food', siteId: 'genesis-001:food:0001', phase: 'outbound' },
      { resource: 'wood', siteId: 'genesis-001:wood:0001', phase: 'gathering' },
      { resource: 'stone', siteId: 'genesis-001:stone:0001', phase: 'returning' },
      { resource: 'gold', siteId: 'genesis-001:gold:0001', phase: 'gathering' },
      { resource: 'food', siteId: 'genesis-001:food:0002', phase: 'outbound' }
    ] as const;
    render(
      <RealmHud
        {...commonProps()}
        activeWagons={activeWagons}
        onOpenActiveWagon={onOpenActiveWagon}
      />
    );

    const { trigger, dialog } = openRealmMenu();
    const group = within(dialog).getByRole('group', { name: 'Expeditions' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Food WAGONEn route to site',
      'Wood WAGONGathering at site',
      'Stone WAGONReturning to keep',
      'Gold WAGONGathering at site'
    ]);
    expect(group.textContent).not.toContain('0001');
    expect(group.textContent).not.toContain('expedition');
    expect(group.textContent).not.toContain('FID');

    fireEvent.click(within(group).getByRole('button', { name: /STONE WAGON/i }));
    expect(onOpenActiveWagon).toHaveBeenCalledOnce();
    expect(onOpenActiveWagon).toHaveBeenCalledWith(activeWagons[2]);
    expect(screen.queryByRole('dialog', { name: 'REALM MENU' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps the worker entry point visible when no expedition is active', () => {
    render(
      <RealmHud
        {...commonProps()}
        activeWagons={[]}
        onOpenActiveWagon={vi.fn()}
      />
    );

    const { dialog } = openRealmMenu();
    const group = within(dialog).getByRole('group', { name: 'Expeditions' });
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
    expect(group.textContent).toContain('No active wagons');
    expect(group.textContent).toContain('select a resource site to dispatch');
  });

  it('puts the exact owner roster inside the PFP menu and wires worker dispatch', async () => {
    const fixture = workerUiFixture();
    const onDispatchWorker = vi.fn().mockResolvedValue(undefined);
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onDispatchWorker={onDispatchWorker}
        workerDestinations={[{
          resourceKind: 'stone',
          siteId: 'genesis-001:stone:0001',
          label: 'Stone Quarry · Tier 1 · cell 4, -2'
        }]}
      />
    );

    const profileTrigger = screen.getByRole('button', { name: /Open Realm menu/i });
    expect(screen.getAllByRole('button')).toEqual([profileTrigger]);
    fireEvent.click(profileTrigger);
    const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
    expect(within(menu).getByRole('button', { name: /WORKERS.*4 of 4 available/i }))
      .not.toBeNull();
    expect(screen.queryByRole('button', { name: /Open workers/i })).toBeNull();

    fireEvent.click(within(menu).getByRole('button', { name: /WORKERS/i }));
    const commandCenter = screen.getByRole('dialog', { name: 'WORKERS' });
    expect(commandCenter.id).toBe('realm-worker-command-center');
    expect(profileTrigger.getAttribute('aria-controls')).toBe('realm-worker-command-center');
    const roster = within(commandCenter).getByRole('list', { name: 'Your four workers' });
    expect(within(roster).getAllByRole('listitem')).toHaveLength(4);
    expect(within(roster).getAllByText('0 resource units')).toHaveLength(4);
    expect(commandCenter.textContent).not.toContain('Peer Keep');

    fireEvent.click(within(roster).getByRole('button', { name: /Worker 1/i }));
    const inspector = screen.getByRole('dialog', { name: 'Worker 1' });
    expect(inspector.id).toBe('realm-worker-inspection');
    expect(profileTrigger.getAttribute('aria-controls')).toBe('realm-worker-inspection');
    fireEvent.change(within(inspector).getByRole('combobox', { name: 'ASSIGN TO RESOURCE SITE' }), {
      target: { value: 'stone|genesis-001:stone:0001' }
    });
    fireEvent.click(within(inspector).getByRole('button', { name: 'ASSIGN WORKER' }));
    await waitFor(() => expect(onDispatchWorker).toHaveBeenCalledWith(
      'genesis-001-castle-7-worker-01',
      {
        resourceKind: 'stone',
        siteId: 'genesis-001:stone:0001',
        label: 'Stone Quarry · Tier 1 · cell 4, -2'
      }
    ));
    await waitFor(() => expect(
      within(inspector).getByRole('button', { name: 'ASSIGN WORKER' })
        .hasAttribute('disabled')
    ).toBe(false));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'WORKERS' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'REALM MENU' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(profileTrigger));
  });

  it('fails closed when private Worker totals belong to another authenticated FID', () => {
    const fixture = workerUiFixture();
    const common = commonProps();
    render(
      <RealmHud
        {...common}
        {...fixture}
        workerResourceState={{
          ...fixture.workerResourceState,
          fid: BigInt(common.identity.fid + 1)
        }}
      />
    );

    const { dialog } = openRealmMenu();
    expect(within(dialog).queryByRole('button', { name: /WORKERS/i })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'WORKERS' })).toBeNull();
    expect(document.body.textContent).not.toContain('resource units');
  });

  it('guards duplicate recalls and keeps Escape inside a pending command', async () => {
    const fixture = assignedWorkerUiFixture();
    let resolveRecall!: () => void;
    const pendingRecall = new Promise<void>((resolve) => { resolveRecall = resolve; });
    const onRecallWorker = vi.fn(() => pendingRecall);
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallAllWorkers={vi.fn().mockResolvedValue(undefined)}
        onRecallWorker={onRecallWorker}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /WORKERS/i }));
    const commandCenter = screen.getByRole('dialog', { name: 'WORKERS' });
    expect(within(commandCenter).getByText('3 Stone')).not.toBeNull();
    const recall = within(commandCenter).getByRole('button', { name: 'RETURN' });
    fireEvent.click(recall);
    fireEvent.click(recall);
    expect(onRecallWorker).toHaveBeenCalledOnce();
    expect(within(commandCenter).getByRole('button', { name: 'RETURNING…' })
      .hasAttribute('disabled')).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'WORKERS' })).toBe(commandCenter);
    await act(async () => {
      resolveRecall();
      await pendingRecall;
    });
    await waitFor(() => expect(
      within(commandCenter).getByRole('button', { name: 'RETURN' })
        .hasAttribute('disabled')
    ).toBe(false));
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
    expect(tooltip.textContent).toContain(
      'private terrain yield and gathering at Wheat Farms'
    );
    expect(tooltip.textContent).toContain('No Food spending is live yet');
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
    expect(tooltip.textContent).toContain(
      'private terrain yield and gathering at Logging Camps'
    );
    expect(tooltip.textContent).toContain('No Wood spending is live yet');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(wood);

    act(() => stone.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('private terrain yield');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('gathering at Stone Quarries');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('No Stone spending is live yet');
    act(() => gold.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('gathering at Gold Mines');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('terrain produces no Gold');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('No Gold spending is live yet');
    act(() => marks.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('separate experimental accounting balance, not an economic resource');
    expect(rail.getAttribute('data-tooltip-open')).toBe('marks');

    const tooltipCopy = [...document.querySelectorAll('.realm-resource-tooltip__copy')]
      .map((element) => element.textContent ?? '')
      .join(' ');
    for (const stagedOrFutureClaim of [
      'armies',
      'construction',
      'fortification',
      'strongholds',
      'upgrades',
      'trade',
      'command',
      'worker',
      'future',
      'tier-i'
    ]) {
      expect(tooltipCopy.toLowerCase()).not.toContain(stagedOrFutureClaim);
    }

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
