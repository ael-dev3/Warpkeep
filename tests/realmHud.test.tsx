import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmHud } from '../src/components/realm/RealmHud';
import {
  MiniAppHostProvider,
  type MiniAppBrowserRuntime,
  type MiniAppSdk
} from '../src/farcaster/miniapp';
import {
  useRealmSurfaceNavigation,
  type RealmSurfaceNavigation,
} from '../src/components/realm/useRealmSurfaceNavigation';
import type {
  ReadyWorkerProjection,
  ReadyWorkerResourceState,
  WorkerRosterPresentation
} from '../src/components/realm/realmWorkerPresentation';
import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createReadyResourceState } from './fixtures/resourceState';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

function ForwardNavigationHud() {
  const [stack, setStack] = useState<RealmSurfaceNavigation['stack']>([]);
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  const forwardRouteRef = useRef<RealmSurfaceNavigation['current']>(undefined);
  const surfaceNavigation: RealmSurfaceNavigation = {
    stack,
    current: stack.at(-1),
    depth: stack.length,
    push: (route) => {
      forwardRouteRef.current = undefined;
      setStack((current) => [...current, route]);
    },
    replace: (route) => {
      forwardRouteRef.current = undefined;
      setStack((current) => (
        current.length === 0 ? [route] : [...current.slice(0, -1), route]
      ));
    },
    back: () => {
      setStack((current) => {
        forwardRouteRef.current = current.at(-1);
        return current.slice(0, -1);
      });
    },
    closeToRealm: () => {
      setStack((current) => {
        forwardRouteRef.current = current.at(-1);
        return [];
      });
    }
  };
  return (
    <>
      <RealmHud
        {...commonProps()}
        onGraphicsPreferenceChange={settingsAvailable ? vi.fn() : undefined}
        surfaceNavigation={surfaceNavigation}
      />
      <button onClick={surfaceNavigation.back} type="button">
        SIMULATE BACK
      </button>
      <button
        disabled={forwardRouteRef.current === undefined}
        onClick={() => {
          const route = forwardRouteRef.current;
          if (!route) return;
          setStack((current) => [...current, route]);
        }}
        type="button"
      >
        SIMULATE FORWARD
      </button>
      <button onClick={() => setSettingsAvailable(false)} type="button">
        REMOVE SETTINGS
      </button>
    </>
  );
}

function miniAppRuntime(): MiniAppBrowserRuntime {
  return {
    search: () => '?miniApp=true',
    viewport: () => ({ width: 390, height: 844 }),
    document,
    getMountedShell: () => document.body,
    waitForAnimationFrame: async () => {}
  };
}

function miniAppSdk(close: () => Promise<void>): MiniAppSdk {
  return {
    isInMiniApp: async () => true,
    context: Promise.resolve({
      user: {
        fid: 12_345,
        username: 'warpkeeper',
        displayName: 'Warp Keeper',
        pfpUrl: 'https://images.example/warpkeeper.png'
      },
      client: {
        clientFid: 9_150,
        added: true,
        platformType: 'mobile',
        safeAreaInsets: { top: 12, right: 8, bottom: 14, left: 8 }
      },
      features: { haptics: false },
      location: { type: 'launcher' }
    }),
    getCapabilities: async () => ['actions.ready', 'actions.close'],
    actions: {
      ready: async () => {},
      close
    }
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
  return {
    publicWorkerProjection: workerProjection,
    workerProjection,
    workerRoster,
    workerResourceState,
    workerPrivateSync: {
      phase: 'ready' as const,
      commandsEnabled: true
    }
  };
}

function assignedWorkerUiFixture(timelineRevision = 1) {
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
    timelineRevision,
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
      timelineRevision
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
  return {
    publicWorkerProjection: workerProjection,
    workerProjection,
    workerRoster,
    workerResourceState,
    workerPrivateSync: {
      phase: 'ready' as const,
      commandsEnabled: true
    }
  };
}

function returningWorkerUiFixture(timelineRevision = 2) {
  const base = assignedWorkerUiFixture(timelineRevision - 1);
  const assigned = base.workerProjection.ownedWorkers[0]!;
  const returning = {
    ...assigned,
    status: 'returning' as const,
    returnStartedAtMicros: 110n,
    returnStartProgressBasisPoints: 8_000,
    timelineRevision,
    revision: assigned.revision + 1n
  };
  const ownedWorkers = [
    returning,
    ...base.workerProjection.ownedWorkers.slice(1)
  ];
  const workerProjection: ReadyWorkerProjection = {
    ...base.workerProjection,
    workers: [
      returning,
      ...base.workerProjection.workers.filter(
        (worker) => worker.workerId !== returning.workerId
      )
    ],
    ownedWorkers,
    occupations: []
  };
  const workerRoster: WorkerRosterPresentation = {
    ...base.workerRoster,
    workers: base.workerRoster.workers.map((worker) => (
      worker.workerId === returning.workerId
        ? {
            ...worker,
            status: 'returning',
            revision: returning.revision
          }
        : worker
    ))
  };
  return {
    ...base,
    publicWorkerProjection: workerProjection,
    workerProjection,
    workerRoster
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

    expect(initialAnnouncement).toContain('Your keep is selected.');
    expect(initialAnnouncement).not.toMatch(/\bcell\s+-?\d/i);
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
    expect(announcement.textContent).toContain('Amethyst Heath. Terrain selected.');

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
      .toBe('@peerkeeper, Peer Watch. Selected castle.');
    expect(document.body.textContent).not.toMatch(/Activate its record|Level 3 castle|movement cost|generation/i);

    rerender(
      <RealmHud
        {...common}
        selectedCell={terrainCell(2, -1)}
        selectedCastle={{ name: 'Peer Watch', level: 3, q: 2, r: -1 }}
        selectedCastleProfile={{
          canonicalUsername: 'peerkeeper',
          communityStatsVisible: false
        }}
        showDiagnostics
      />
    );
    expect(announcement.textContent)
      .toBe('@peerkeeper, Peer Watch. Selected castle at cell 2, -1.');
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
    expect(within(opened.dialog).getByLabelText('Verified keeper identity').textContent)
      .toContain('@warpkeeper');
    expect(within(opened.dialog).queryByText(/PATCH NOTES · ALPHA/i)).toBeNull();
    expect(opened.dialog.querySelector('details')).toBeNull();
    expect(opened.dialog.querySelector(
      'button[data-command-intent="navigation"]'
    )).not.toBeNull();
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
    opened.dialog.scrollTop = 91;
    fireEvent.click(settingsTrigger);
    const settings = screen.getByRole('dialog', { name: 'SETTINGS' });
    expect(settings.id).toBe('realm-player-settings');
    expect(opened.trigger.getAttribute('aria-controls')).toBe('realm-player-settings');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'SETTINGS' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO REALM MENU' }));
    const restoredMenu = screen.getByRole('dialog', { name: 'REALM MENU' });
    await waitFor(() => expect(document.activeElement).toBe(
      within(restoredMenu).getByRole('button', { name: /SETTINGS/i })
    ));
    expect(restoredMenu.scrollTop).toBe(91);

    fireEvent.click(screen.getByRole('button', { name: 'Close Realm menu' }));
    await waitFor(() => expect(document.activeElement).toBe(opened.trigger));

    opened = openRealmMenu();
    fireEvent.click(within(opened.dialog).getByRole('button', { name: /MAIN MENU/i }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('retains nested focus metadata across Back, Forward, and Back again', async () => {
    render(<ForwardNavigationHud />);

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^SETTINGS/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO REALM MENU' }));
    let restoredMenu = screen.getByRole('dialog', { name: 'REALM MENU' });
    await waitFor(() => expect(document.activeElement).toBe(
      within(restoredMenu).getByRole('button', { name: /SETTINGS/i })
    ));

    fireEvent.click(screen.getByRole('button', { name: 'SIMULATE FORWARD' }));
    expect(screen.getByRole('dialog', { name: 'SETTINGS' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO REALM MENU' }));
    restoredMenu = screen.getByRole('dialog', { name: 'REALM MENU' });
    await waitFor(() => expect(document.activeElement).toBe(
      within(restoredMenu).getByRole('button', { name: /SETTINGS/i })
    ));
  });

  it('retains the root invoker across Back, Forward, and Back again', async () => {
    render(<ForwardNavigationHud />);

    const profile = screen.getByRole('button', { name: /Open Realm menu/i });
    fireEvent.click(profile);
    fireEvent.click(screen.getByRole('button', { name: 'Close Realm menu' }));
    await waitFor(() => expect(document.activeElement).toBe(profile));

    fireEvent.click(screen.getByRole('button', { name: 'SIMULATE FORWARD' }));
    expect(screen.getByRole('dialog', { name: 'REALM MENU' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Realm menu' }));
    await waitFor(() => expect(document.activeElement).toBe(profile));
  });

  it('falls back to the parent heading when a dynamic invoker disappears', async () => {
    render(<ForwardNavigationHud />);

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^SETTINGS/i }));
    fireEvent.click(screen.getByRole('button', { name: 'REMOVE SETTINGS' }));
    fireEvent.click(screen.getByRole('button', { name: 'SIMULATE BACK' }));

    const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
    expect(within(menu).queryByRole('button', { name: /SETTINGS/i })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(
      within(menu).getByRole('heading', { name: 'REALM MENU' })
    ));
  });

  it('uses hosted navigation semantics and exposes Exit only in a verified Mini App', async () => {
    const closeMiniApp = vi.fn(async () => {});
    const fixture = workerUiFixture();
    const surfaceNavigation: RealmSurfaceNavigation = {
      stack: [{ kind: 'commands' }],
      current: { kind: 'commands' },
      depth: 1,
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      closeToRealm: vi.fn()
    };

    render(
      <MiniAppHostProvider
        runtime={miniAppRuntime()}
        sdkLoader={async () => miniAppSdk(closeMiniApp)}
      >
        <RealmHud
          {...commonProps()}
          {...fixture}
          chromeMode="miniapp"
          onGraphicsPreferenceChange={vi.fn()}
          surfaceNavigation={surfaceNavigation}
        />
      </MiniAppHostProvider>
    );

    const destination = screen.getByRole('region', { name: 'REALM MENU' });
    expect(destination.hasAttribute('aria-modal')).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'REALM MENU' })).toBeNull();
    expect(within(destination).getByLabelText('Verified keeper identity').textContent)
      .toContain('@warpkeeper');
    expect(within(destination).getByRole('button', { name: /SETTINGS/i })
      .hasAttribute('aria-haspopup')).toBe(false);
    expect(within(destination).getByRole('button', { name: /^WORKERS/i })
      .hasAttribute('aria-haspopup')).toBe(false);

    const exit = await within(destination).findByRole('button', {
      name: /EXIT MINI APP/i
    });
    fireEvent.click(exit);
    await waitFor(() => expect(closeMiniApp).toHaveBeenCalledOnce());
  });

  it('replaces the desktop command history entry when opening Explore', () => {
    const onRequestExplore = vi.fn();
    const surfaceNavigation: RealmSurfaceNavigation = {
      stack: [{ kind: 'commands' }],
      current: { kind: 'commands' },
      depth: 1,
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      closeToRealm: vi.fn(),
    };
    render(
      <RealmHud
        {...commonProps()}
        chromeMode="desktop-web"
        foundedCastleCount={2}
        onRequestExplore={onRequestExplore}
        surfaceNavigation={surfaceNavigation}
      />,
    );

    const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
    fireEvent.click(within(menu).getByRole('button', { name: /EXPLORE/i }));

    expect(surfaceNavigation.replace).toHaveBeenCalledExactlyOnceWith({
      kind: 'explore',
    });
    expect(surfaceNavigation.closeToRealm).not.toHaveBeenCalled();
    expect(surfaceNavigation.back).not.toHaveBeenCalled();
    expect(onRequestExplore).toHaveBeenCalledOnce();
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

  it('puts the exact owner roster inside the PFP menu without a global destination picker', async () => {
    const fixture = workerUiFixture();
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
      />
    );

    const profileTrigger = screen.getByRole('button', { name: /Open Realm menu/i });
    expect(screen.getAllByRole('button')).toEqual([profileTrigger]);
    fireEvent.click(profileTrigger);
    const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
    expect(within(menu).getByRole('button', { name: /WORKERS.*0\/4 deployed/i }))
      .not.toBeNull();
    expect(within(menu).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: /Open workers/i })).toBeNull();

    fireEvent.click(within(menu).getByRole('button', { name: /^WORKERS/i }));
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
    expect(within(inspector).queryByRole('combobox')).toBeNull();
    expect(within(inspector).queryByRole('button', { name: /assign worker/i })).toBeNull();
    expect(within(inspector).getByText(
      'Select an available resource node in the Realm to send this worker.'
    )).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    const restoredWorkers = screen.getByRole('dialog', { name: 'WORKERS' });
    await waitFor(() => expect(document.activeElement).toBe(
      within(restoredWorkers).getByRole('button', { name: /Worker 1/i })
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    const restoredMenu = screen.getByRole('dialog', { name: 'REALM MENU' });
    await waitFor(() => expect(document.activeElement).toBe(
      within(restoredMenu).getByRole('button', { name: /^WORKERS/i })
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(profileTrigger));
  });

  it('delegates compact Worker detail rendering to the Realm surface owner', () => {
    const fixture = workerUiFixture();
    const workerId = fixture.workerProjection.ownedWorkers[0]!.workerId;
    const surfaceNavigation: RealmSurfaceNavigation = {
      stack: [
        { kind: 'commands' },
        { kind: 'workers' },
        { kind: 'worker', workerId },
      ],
      current: { kind: 'worker', workerId },
      depth: 3,
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      closeToRealm: vi.fn(),
    };
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        chromeMode="compact-web"
        surfaceNavigation={surfaceNavigation}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Worker 1' })).toBeNull();
    expect(surfaceNavigation.back).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {
      name: /Open Realm menu/i,
      hidden: true,
    })
      .getAttribute('aria-controls')).toBe('realm-worker-inspection');
  });

  it('keeps the public Worker catalog visible but fails commands closed for a wrong private FID', () => {
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
    const workers = within(dialog).getByRole('button', { name: /WORKERS.*0\/4 deployed/i });
    expect(within(dialog).getByText(/Synchronizing Worker accrual/i)).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(true);
    fireEvent.click(workers);
    const commandCenter = screen.getByRole('dialog', { name: 'WORKERS' });
    expect(within(commandCenter).getAllByText('—')).toHaveLength(4);
    expect(document.body.textContent).not.toContain('resource units');
  });

  it('survives reload-shaped private sync delay and localized failure without legacy vocabulary', () => {
    const fixture = assignedWorkerUiFixture();
    const retryWorkerPrivateSync = vi.fn();
    const recallWorker = vi.fn(async () => undefined);
    const recallAllWorkers = vi.fn(async () => undefined);
    const publicProps = {
      ...commonProps(),
      activeWagons: [{
        resource: 'food' as const,
        siteId: 'genesis-001:food:legacy-stale',
        phase: 'gathering' as const
      }],
      onOpenActiveWagon: vi.fn(),
      onRecallWorker: recallWorker,
      onRecallAllWorkers: recallAllWorkers,
      publicWorkerProjection: fixture.publicWorkerProjection
    };
    const firstView = render(
      <RealmHud
        {...publicProps}
        workerPrivateSync={{ phase: 'synchronizing', commandsEnabled: false }}
      />
    );

    let { dialog } = openRealmMenu();
    expect(within(dialog).getByRole('button', { name: /WORKERS.*1\/4 deployed/i }))
      .not.toBeNull();
    expect(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(false);
    expect(dialog.textContent).not.toContain('EXPEDITIONS');
    expect(dialog.textContent).not.toContain('WAGON');
    fireEvent.click(within(dialog).getByRole('button', { name: /^WORKERS/i }));
    expect(within(screen.getByRole('dialog', { name: 'WORKERS' }))
      .getAllByRole('listitem')).toHaveLength(4);

    firstView.unmount();
    const secondView = render(
      <RealmHud
        {...publicProps}
        onRetryWorkerPrivateSync={retryWorkerPrivateSync}
        workerPrivateSync={{ phase: 'failed-localized', commandsEnabled: false }}
      />
    );
    ({ dialog } = openRealmMenu());
    expect(dialog.textContent).toContain('Worker accrual could not be refreshed');
    expect(within(dialog).getByRole('button', { name: 'RETRY WORKER CONTROLS' }))
      .not.toBeNull();
    expect(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(false);
    expect(dialog.textContent).not.toContain('EXPEDITIONS');
    fireEvent.click(within(dialog).getByRole('button', { name: 'RETRY WORKER CONTROLS' }));
    expect(retryWorkerPrivateSync).toHaveBeenCalledOnce();

    secondView.rerender(
      <RealmHud
        {...publicProps}
        {...fixture}
      />
    );
    expect(within(screen.getByRole('dialog', { name: 'REALM MENU' }))
      .queryByText(/could not be refreshed/i)).toBeNull();
  });

  it('keeps generic Worker vocabulary when an active public graph fails closed', () => {
    render(
      <RealmHud
        {...commonProps()}
        activeWagons={[{
          resource: 'gold',
          siteId: 'genesis-001:gold:legacy-stale',
          phase: 'outbound'
        }]}
        onOpenActiveWagon={vi.fn()}
        publicWorkerSystemActive
        workerPrivateSync={{ phase: 'not-required', commandsEnabled: false }}
      />
    );

    const { dialog } = openRealmMenu();
    const workers = within(dialog).getByRole('button', {
      name: /WORKERS.*Worker presentation unavailable/i
    }) as HTMLButtonElement;
    const recallAll = within(dialog).getByRole('button', {
      name: /RECALL ALL TO KEEP/i
    }) as HTMLButtonElement;
    expect(workers.disabled).toBe(true);
    expect(recallAll.disabled).toBe(true);
    expect(dialog.textContent).toContain('Public worker records are recovering');
    expect(dialog.textContent).not.toContain('EXPEDITIONS');
    expect(dialog.textContent).not.toContain('No active wagons');
  });

  it('ignores stale legacy yield and wagon projections once generic Workers are active', () => {
    const fixture = assignedWorkerUiFixture();
    const onOpenActiveWagon = vi.fn();
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        activeWagons={[{
          resource: 'food',
          siteId: 'genesis-001:food:legacy-stale',
          phase: 'gathering'
        }]}
        onOpenActiveWagon={onOpenActiveWagon}
        resources={{
          ...createReadyResourceState(),
          balances: { food: 91n, wood: 82n, stone: 73n, gold: 64n },
          pendingBalances: { food: 55n, wood: 46n, stone: 37n, gold: 28n }
        }}
        workerResourceState={{
          ...fixture.workerResourceState,
          available: { ...fixture.workerResourceState.available, stone: 3n }
        }}
      />
    );

    const resourceRail = screen.getByRole('region', { name: 'Your resources' });
    expect(within(resourceRail).getByRole('button', {
      name: 'Stone: 3 available. Show resource details.'
    })).not.toBeNull();
    expect(within(resourceRail).queryByRole('button', { name: /ready to collect/i })).toBeNull();

    const { dialog } = openRealmMenu();
    expect(within(dialog).getByRole('button', { name: /WORKERS.*1\/4 deployed/i }))
      .not.toBeNull();
    expect(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(true);
    expect(within(dialog).queryByRole('button', { name: /COLLECT YIELD/i })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /FOOD WAGON/i })).toBeNull();
    expect(dialog.textContent).not.toContain('Settle available resources');
    expect(dialog.textContent).not.toContain('legacy-stale');
    expect(onOpenActiveWagon).not.toHaveBeenCalled();
  });

  it('guards duplicate recalls and keeps Escape inside a pending command', async () => {
    const fixture = assignedWorkerUiFixture();
    let resolveRecall!: () => void;
    const pendingRecall = new Promise<void>((resolve) => { resolveRecall = resolve; });
    const onRecallWorker = vi.fn(() => pendingRecall);
    const view = render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallAllWorkers={vi.fn().mockResolvedValue(undefined)}
        onRecallWorker={onRecallWorker}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^WORKERS/i }));
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
      within(commandCenter).getByRole('button', { name: 'AWAITING REALM…' })
        .hasAttribute('disabled')
    ).toBe(true));
    fireEvent.click(within(commandCenter).getByRole('button', {
      name: 'Back to Realm menu'
    }));
    const menuDuringRecall = screen.getByRole('dialog', { name: 'REALM MENU' });
    expect(within(menuDuringRecall).getByRole('button', {
      name: /RECALL IN PROGRESS.*Awaiting the next Realm update/i
    }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^WORKERS/i }));
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' })
      .hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'RETURN ALL TO KEEP' })
      .hasAttribute('disabled')).toBe(true);
    expect(onRecallWorker).toHaveBeenCalledOnce();

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...assignedWorkerUiFixture(2)}
        onRecallAllWorkers={vi.fn().mockResolvedValue(undefined)}
        onRecallWorker={onRecallWorker}
      />
    );
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' })
      .hasAttribute('disabled')).toBe(true);

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...returningWorkerUiFixture(2)}
        onRecallAllWorkers={vi.fn().mockResolvedValue(undefined)}
        onRecallWorker={onRecallWorker}
      />
    );
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'AWAITING REALM…' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'RETURN' })).toBeNull();
    });
  });

  it('bounds a missing public recall reconciliation before allowing a manual retry', async () => {
    vi.useFakeTimers();
    const fixture = assignedWorkerUiFixture();
    const onRecallWorker = vi.fn(async () => undefined);
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallWorker={onRecallWorker}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^WORKERS/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'RETURN' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' })
      .hasAttribute('disabled')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(12_001);
    });
    const retry = screen.getByRole('button', { name: 'RETURN' });
    expect(retry.hasAttribute('disabled')).toBe(false);
    await act(async () => {
      fireEvent.click(retry);
      await Promise.resolve();
    });
    expect(onRecallWorker).toHaveBeenCalledTimes(2);
  });

  it('invokes the separate RETURN ALL control through one guarded user interaction', async () => {
    const fixture = assignedWorkerUiFixture();
    let resolveRecallAll!: () => void;
    const pendingRecallAll = new Promise<void>((resolve) => { resolveRecallAll = resolve; });
    const onRecallAllWorkers = vi.fn(() => pendingRecallAll);
    const onRecallWorker = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallAllWorkers={onRecallAllWorkers}
        onRecallWorker={onRecallWorker}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^WORKERS/i }));
    const commandCenter = screen.getByRole('dialog', { name: 'WORKERS' });
    const recallAll = within(commandCenter).getByRole('button', {
      name: 'RETURN ALL TO KEEP'
    });
    fireEvent.click(recallAll);
    fireEvent.click(recallAll);

    expect(onRecallAllWorkers).toHaveBeenCalledOnce();
    expect(onRecallWorker).not.toHaveBeenCalled();
    expect(within(commandCenter).getByRole('button', { name: 'RETURNING…' })
      .hasAttribute('disabled')).toBe(true);
    expect(within(commandCenter).getByRole('button', { name: 'RETURN' })
      .hasAttribute('disabled')).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'WORKERS' })).toBe(commandCenter);
    await act(async () => {
      resolveRecallAll();
      await pendingRecallAll;
    });
    await waitFor(() => expect(
      within(commandCenter).getByRole('button', { name: 'AWAITING REALM…' })
        .hasAttribute('disabled')
    ).toBe(true));
    fireEvent.click(within(commandCenter).getByRole('button', {
      name: 'Back to Realm menu'
    }));
    fireEvent.click(screen.getByRole('button', { name: /^WORKERS/i }));
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' })
      .hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'RETURN' })
      .hasAttribute('disabled')).toBe(true);
    expect(onRecallAllWorkers).toHaveBeenCalledOnce();

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...assignedWorkerUiFixture(2)}
        onRecallAllWorkers={onRecallAllWorkers}
        onRecallWorker={onRecallWorker}
      />
    );
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' })
      .hasAttribute('disabled')).toBe(true);

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...returningWorkerUiFixture(2)}
        onRecallAllWorkers={onRecallAllWorkers}
        onRecallWorker={onRecallWorker}
      />
    );
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'AWAITING REALM…' })).toBeNull();
      expect(screen.getByRole('button', { name: 'RETURN ALL TO KEEP' })
        .hasAttribute('disabled')).toBe(true);
    });
  });

  it('recalls every recallable Worker directly from the PFP menu without optimistic state', async () => {
    const fixture = assignedWorkerUiFixture();
    let resolveRecallAll!: () => void;
    const pendingRecallAll = new Promise<void>((resolve) => { resolveRecallAll = resolve; });
    const onRecallAllWorkers = vi.fn(() => pendingRecallAll);
    const view = render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallAllWorkers={onRecallAllWorkers}
      />
    );

    const { dialog } = openRealmMenu();
    const workerControls = within(dialog).getByRole('group', { name: 'Worker controls' });
    const recallAll = within(workerControls).getByRole('button', {
      name: /RECALL ALL TO KEEP.*1 worker can return/i
    });
    expect(within(workerControls).getByRole('button', { name: /WORKERS.*1\/4 deployed/i }))
      .not.toBeNull();

    fireEvent.click(recallAll);
    fireEvent.click(recallAll);

    expect(onRecallAllWorkers).toHaveBeenCalledOnce();
    expect(within(workerControls).getByRole('button', { name: /RECALLING/i })
      .hasAttribute('disabled')).toBe(true);
    expect(within(workerControls).getByRole('button', { name: /WORKERS.*1\/4 deployed/i })
      .hasAttribute('disabled')).toBe(true);

    await act(async () => {
      resolveRecallAll();
      await pendingRecallAll;
    });
    await waitFor(() => expect(
      within(workerControls).getByRole('button', {
        name: /RECALL SENT.*Awaiting the next Realm update/i
      })
        .hasAttribute('disabled')
    ).toBe(true));
    expect(within(workerControls).getByRole('button', { name: /WORKERS.*1\/4 deployed/i }))
      .not.toBeNull();

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...returningWorkerUiFixture(2)}
        onRecallAllWorkers={onRecallAllWorkers}
      />
    );
    await waitFor(() => {
      expect(within(workerControls).queryByRole('button', {
        name: /RECALL SENT.*Awaiting the next Realm update/i
      })).toBeNull();
      expect(within(workerControls).getByRole('button', { name: /RECALL ALL TO KEEP/i })
        .hasAttribute('disabled')).toBe(true);
    });
  });

  it('fails a PFP-menu recall closed and allows an explicit retry', async () => {
    const fixture = assignedWorkerUiFixture();
    const onRecallAllWorkers = vi.fn()
      .mockRejectedValueOnce(new Error('private command failure'))
      .mockResolvedValueOnce(undefined);
    render(
      <RealmHud
        {...commonProps()}
        {...fixture}
        onRecallAllWorkers={onRecallAllWorkers}
      />
    );

    const { dialog } = openRealmMenu();
    const recallAll = within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i });
    fireEvent.click(recallAll);

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'The recall could not be confirmed. Try the same action again.'
    );
    expect(dialog.textContent).not.toContain('private command failure');
    expect(within(dialog).getByRole('button', { name: /WORKERS.*1\/4 deployed/i }))
      .not.toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i }));
    await waitFor(() => expect(onRecallAllWorkers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
  });

  it('clears stale PFP-menu failure feedback when the authoritative assignment changes', async () => {
    const onRecallAllWorkers = vi.fn().mockRejectedValue(new Error('not confirmed'));
    const view = render(
      <RealmHud
        {...commonProps()}
        {...assignedWorkerUiFixture()}
        onRecallAllWorkers={onRecallAllWorkers}
      />
    );

    const { dialog } = openRealmMenu();
    fireEvent.click(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i }));
    expect(await within(dialog).findByRole('alert')).not.toBeNull();

    view.rerender(
      <RealmHud
        {...commonProps()}
        {...assignedWorkerUiFixture(2)}
        onRecallAllWorkers={onRecallAllWorkers}
      />
    );

    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    expect(within(dialog).getByRole('button', { name: /RECALL ALL TO KEEP/i })
      .hasAttribute('disabled')).toBe(false);
  });

  it('renders zero-valued caller-bound resources in the fixed top-rail order', () => {
    const resources = createReadyResourceState();
    const { container } = render(
      <RealmHud
        {...commonProps()}
        resources={resources}
      />
    );

    const rail = screen.getByRole('region', { name: 'Your resources' });
    expect(rail.hasAttribute('aria-live')).toBe(false);
    const entries = within(rail).getAllByRole('listitem');
    expect(entries.map((entry) => entry.querySelector('button')?.getAttribute('aria-label'))).toEqual([
      'Food: 0 stored; 0 gathering now; settlement is automatic. Show resource details.',
      'Wood: 0 stored; 0 gathering now; settlement is automatic. Show resource details.',
      'Stone: 0 stored; 0 gathering now; settlement is automatic. Show resource details.',
      'Gold: 0 stored; 0 gathering now; settlement is automatic. Show resource details.',
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

  it('shows bounded available and occupied resource-site shortcuts in hosted resource screens', async () => {
    const onOpenResourceSite = vi.fn();
    const surfaceNavigation: RealmSurfaceNavigation = {
      stack: [{ kind: 'resource-balance', resource: 'wood' }],
      current: { kind: 'resource-balance', resource: 'wood' },
      depth: 1,
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      closeToRealm: vi.fn()
    };
    render(
      <RealmHud
        {...commonProps()}
        chromeMode="miniapp"
        onOpenResourceSite={onOpenResourceSite}
        resourceSites={[
          {
            key: 'wood:wood-1',
            resource: 'wood',
            label: 'Logging Camp 1',
            tier: 1,
            availability: 'available'
          },
          {
            key: 'wood:wood-2',
            resource: 'wood',
            label: 'Logging Camp 2',
            tier: 2,
            availability: 'occupied'
          },
          {
            key: 'wood:wood-3',
            resource: 'wood',
            label: 'Logging Camp 3',
            tier: 3,
            availability: 'unavailable'
          },
          {
            key: 'food:food-1',
            resource: 'food',
            label: 'Wheat Farm 1',
            tier: 1,
            availability: 'available'
          }
        ]}
        resources={createReadyResourceState()}
        surfaceNavigation={surfaceNavigation}
      />
    );

    const destination = screen.getByRole('region', { name: 'Wood' });
    expect(destination.hasAttribute('aria-modal')).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Wood' }))
        .toBe(document.activeElement);
    });
    expect(within(destination).queryByText('Logging Camp 3')).toBeNull();
    expect(within(destination).queryByText('Wheat Farm 1')).toBeNull();
    const available = within(destination).getByRole('button', {
      name: /Logging Camp 1.*Tier 1.*available/i
    });
    const occupied = within(destination).getByRole('button', {
      name: /Logging Camp 2.*Tier 2.*occupied/i
    });
    expect(occupied).not.toBeNull();
    fireEvent.click(available);
    expect(onOpenResourceSite).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: 'wood:wood-1' })
    );
  });

  it('retains numeric same-caller core balances while Worker accrual synchronizes', () => {
    const base = createReadyResourceState();
    const props = {
      ...commonProps(),
      publicWorkerSystemActive: true,
      resources: {
        ...base,
        balances: { food: 321n, wood: 222n, stone: 111n, gold: 44n },
        pendingBalances: { food: 8n, wood: 7n, stone: 6n, gold: 5n }
      }
    };
    const view = render(
      <RealmHud
        {...props}
        workerPrivateSync={{ phase: 'synchronizing', commandsEnabled: false }}
      />
    );

    const rail = screen.getByRole('region', { name: 'Your resources' });
    expect(within(rail).getAllByRole('listitem').slice(0, 4).map(
      (entry) => entry.querySelector('strong')?.textContent
    )).toEqual(['321', '222', '111', '44']);
    expect(rail.textContent).not.toContain('—');
    const food = within(rail).getByRole('button', {
      name: /Food: 321 last confirmed stored balance; Worker accrual synchronizing/i
    });
    fireEvent.click(food);
    expect(screen.getByRole('tooltip').textContent)
      .toContain('Last confirmed balance · Worker accrual synchronizing');

    view.rerender(
      <RealmHud
        {...props}
        workerPrivateSync={{ phase: 'failed-localized', commandsEnabled: false }}
      />
    );
    expect(within(rail).getAllByRole('listitem').slice(0, 4).map(
      (entry) => entry.querySelector('strong')?.textContent
    )).toEqual(['321', '222', '111', '44']);
    expect(rail.textContent).not.toContain('—');
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
      name: 'Food: 200 stored; 8 gathering now; settlement is automatic. Show resource details.'
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
    expect(tooltip.textContent).toContain('200 stored · 8 gathering now');
    expect(tooltip.textContent).toContain(
      'private terrain yield and Wheat Farm gathering'
    );
    expect(tooltip.textContent).toContain('stores completed yield automatically');
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
      'private terrain yield and Logging Camp gathering'
    );
    expect(tooltip.textContent).toContain('stores completed yield automatically');
    expect(tooltip.textContent).toContain('No Wood spending is live yet');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(wood);

    act(() => stone.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('private terrain yield');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('Stone Quarry gathering');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('stores completed yield automatically');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('No Stone spending is live yet');
    act(() => gold.focus());
    expect(screen.getByRole('tooltip').textContent)
      .toContain('Gold Mine gathering');
    expect(screen.getByRole('tooltip').textContent)
      .toContain('stores completed yield automatically');
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

  it('restores hosted resource-screen focus to the exact resource trigger', async () => {
    function NavigatingHud() {
      const surfaceNavigation = useRealmSurfaceNavigation({
        historyEnabled: false,
        identityKey: '12345'
      });
      return (
        <RealmHud
          {...commonProps()}
          chromeMode="miniapp"
          resources={createReadyResourceState()}
          surfaceNavigation={surfaceNavigation}
        />
      );
    }

    render(<NavigatingHud />);
    const wood = screen.getByRole('button', {
      name: /Wood: 0 stored; 0 gathering now/i
    });
    wood.focus();
    fireEvent.click(wood);
    expect(screen.getByRole('region', { name: 'Wood' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Realm' }));
    await waitFor(() => expect(document.activeElement).toBe(wood));
  });

  it('keeps gathering yield informational and exposes no manual collection control', () => {
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

    expect(screen.getByRole('button', {
      name: 'Food: 200 stored; 8 gathering now; settlement is automatic. Show resource details.'
    })).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Community Marks: 123.45 Marks. Show Marks details.'
    })).not.toBeNull();
    const { dialog } = openRealmMenu();
    expect(within(dialog).queryByRole('button', { name: /COLLECT YIELD/i })).toBeNull();
    expect(dialog.textContent).not.toMatch(/ready to collect|collecting|settle available resources/i);
  });
});
