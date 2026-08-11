import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, useState, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WARPKEEP_FARCASTER_CHANNEL_URL,
  WARPKEEP_GITHUB_ISSUE_INTAKE_URL
} from '../src/farcaster/farcasterProjectLinks';
import {
  RealmAccessibilityControls,
  type RealmNavigatorCameraPreset,
  type RealmNavigatorCloseReason,
  type RealmNavigatorCoordinateJump,
  type RealmNavigatorCastle,
  type RealmNavigatorResourceSite,
  type RealmNavigatorWaterBody,
  type RealmNavigatorWorker
} from '../src/components/realm/RealmAccessibilityControls';

const CASTLES = Object.freeze([
  { castleId: 1, label: '@warpkeeper', name: 'Genesis Bastion', q: 0, r: 0 },
  { castleId: 2, label: '@peer', name: 'Peer Watch', q: 1, r: -1 },
  { castleId: 3, label: 'Hegemony Keep', name: 'Lowland Hold', q: -2, r: 1 }
]);

function ControlledNavigator({
  onActivateCastle,
  onRequestClose,
  coordinateJump,
  cameraPresets,
  workers,
  onActivateWorker,
  resourceSites,
  selectedResourceKey,
  onActivateResourceSite,
  triggerRef,
  onOuterEscape,
  showDiagnostics
}: Readonly<{
  onActivateCastle: (castle: RealmNavigatorCastle) => void;
  onRequestClose: (reason: RealmNavigatorCloseReason) => void;
  coordinateJump?: RealmNavigatorCoordinateJump;
  cameraPresets?: readonly RealmNavigatorCameraPreset[];
  workers?: readonly RealmNavigatorWorker[];
  onActivateWorker?: (worker: RealmNavigatorWorker) => void;
  resourceSites?: readonly RealmNavigatorResourceSite[];
  selectedResourceKey?: string;
  onActivateResourceSite?: (site: RealmNavigatorResourceSite) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onOuterEscape?: () => void;
  showDiagnostics?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <div onKeyDown={(event) => event.key === 'Escape' && onOuterEscape?.()}>
      <RealmAccessibilityControls
        id="realm-navigator"
        open={open}
        castles={CASTLES}
        workers={workers}
        resourceSites={resourceSites}
        ownCastleId={1}
        selectedCastleId={2}
        selectedResourceKey={selectedResourceKey}
        onRequestOpen={() => setOpen(true)}
        onRequestClose={(reason) => {
          onRequestClose(reason);
          setOpen(false);
        }}
        onActivateCastle={onActivateCastle}
        onActivateWorker={onActivateWorker}
        onActivateResourceSite={onActivateResourceSite}
        coordinateJump={coordinateJump}
        showDiagnostics={showDiagnostics}
        cameraPresets={cameraPresets}
        triggerRef={triggerRef}
      />
    </div>
  );
}

function TriggerlessNavigator({
  onRequestClose,
  triggerRef
}: Readonly<{
  onRequestClose: (reason: RealmNavigatorCloseReason) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="Open Realm menu for @warpkeeper"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        PFP
      </button>
      <RealmAccessibilityControls
        id="triggerless-realm-navigator"
        open={open}
        castles={CASTLES}
        ownCastleId={1}
        selectedCastleId={2}
        onRequestOpen={() => setOpen(true)}
        onRequestClose={(reason) => {
          onRequestClose(reason);
          setOpen(false);
        }}
        onActivateCastle={vi.fn()}
        triggerRef={triggerRef}
        triggerVisible={false}
      />
    </>
  );
}

function HostedNestedNavigator() {
  const [route, setRoute] = useState<'realm' | 'explore' | 'castle'>('explore');
  const [resetGeneration, setResetGeneration] = useState(0);
  return (
    <>
      <RealmAccessibilityControls
        id="hosted-realm-navigator"
        open={route === 'explore'}
        castles={CASTLES}
        hostedDestination
        hostedNavigationResetKey={resetGeneration}
        ownCastleId={1}
        onActivateCastle={() => setRoute('castle')}
        onRequestClose={() => setRoute('castle')}
        onRequestOpen={() => setRoute('explore')}
        triggerVisible={false}
      />
      {route === 'castle' ? (
        <>
          <button onClick={() => setRoute('explore')} type="button">
            BACK TO EXPLORE
          </button>
          <button
            onClick={() => {
              setResetGeneration((generation) => generation + 1);
              setRoute('realm');
            }}
            type="button"
          >
            CLOSE TO REALM
          </button>
        </>
      ) : route === 'explore' ? (
        <button onClick={() => setRoute('castle')} type="button">
          FORWARD TO CASTLE
        </button>
      ) : (
        <button
          onClick={() => {
            setResetGeneration((generation) => generation + 1);
            setRoute('explore');
          }}
          type="button"
        >
          OPEN FRESH EXPLORE
        </button>
      )}
    </>
  );
}

afterEach(cleanup);

describe('RealmAccessibilityControls', () => {
  it('supports the player PFP as its external launcher without rendering an Explore button', async () => {
    const onRequestClose = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <TriggerlessNavigator
        onRequestClose={onRequestClose}
        triggerRef={triggerRef}
      />
    );

    const playerTrigger = screen.getByRole('button', {
      name: 'Open Realm menu for @warpkeeper'
    });
    expect(triggerRef.current).toBe(playerTrigger);
    expect(screen.queryByRole('button', { name: /Explore realm/i })).toBeNull();

    fireEvent.click(playerTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Explore' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(screen.queryByRole('button', { name: /Explore realm/i })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Search castles, workers, resources, and water' })
    ));

    fireEvent.click(within(dialog).getByRole('button', { name: 'CLOSE EXPLORE' }));
    expect(onRequestClose).toHaveBeenCalledWith('close-button');
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    expect(triggerRef.current).toBe(playerTrigger);
    await waitFor(() => expect(document.activeElement).toBe(playerTrigger));
  });

  it('opens a compact controlled Explore surface without selecting on focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Explore realm, 3 founded castles'
    });
    expect(trigger.textContent).toBe('Explore 3 CASTLES');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.focus(trigger);
    expect(onActivateCastle).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Explore' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const search = screen.getByRole('searchbox', { name: 'Search castles, workers, resources, and water' });
    await waitFor(() => expect(document.activeElement).toBe(search));

    const list = screen.getByRole('list', { name: 'Founded castles' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    const own = within(list).getByRole('button', {
      name: 'Inspect @warpkeeper, Genesis Bastion, your castle'
    });
    const selected = within(list).getByRole('button', {
      name: 'Inspect @peer, Peer Watch, selected'
    });
    expect(own.getAttribute('data-own')).toBe('true');
    expect(own.getAttribute('aria-pressed')).toBe('false');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    const community = screen.getByRole('region', { name: 'Warpkeep community' });
    expect(community.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    expect(community.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    const feedbackLink = within(community).getByRole('link', {
      name: 'Open the Warpkeep Farcaster channel to share feedback (opens in a new tab)'
    });
    expect(feedbackLink.getAttribute('href')).toBe(WARPKEEP_FARCASTER_CHANNEL_URL);
    expect(feedbackLink.getAttribute('target')).toBe('_blank');
    expect(feedbackLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(feedbackLink.getAttribute('referrerpolicy')).toBe('no-referrer');
    const intakeLink = within(community).getByRole('link', {
      name: 'Propose / report a Warpkeep bug or realm wish on GitHub (opens in a new tab)'
    });
    expect(intakeLink.getAttribute('href')).toBe(WARPKEEP_GITHUB_ISSUE_INTAKE_URL);
    expect(intakeLink.getAttribute('target')).toBe('_blank');
    expect(intakeLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(intakeLink.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(feedbackLink.compareDocumentPosition(intakeLink) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    expect(search.getAttribute('placeholder')).toBe(
      'Player, castle, worker, resource, or water'
    );
    expect(dialog.textContent).not.toMatch(/\bq\s+-?\d|coordinates/i);

    fireEvent.focus(selected);
    expect(onActivateCastle).not.toHaveBeenCalled();
    fireEvent.click(selected);
    expect(onActivateCastle).toHaveBeenCalledWith(CASTLES[1]);

    fireEvent.change(search, { target: { value: 'lowland' } });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /Lowland Hold/ })).not.toBeNull();
    expect(onActivateCastle).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE EXPLORE' }));
    expect(onRequestClose).toHaveBeenCalledWith('close-button');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('collapses every long hosted list independently with live result counts', () => {
    const workers = Object.freeze([
      {
        workerId: 'worker-01',
        ordinal: 1,
        originCastleId: 1,
        originCastleName: 'Genesis Bastion',
        status: 'idle' as const,
        coord: Object.freeze({ q: 0, r: 0 }),
        ownedByViewer: true
      },
      {
        workerId: 'worker-02',
        ordinal: 2,
        originCastleId: 2,
        originCastleName: 'Peer Watch',
        status: 'outbound' as const,
        ownedByViewer: false
      }
    ]) satisfies readonly RealmNavigatorWorker[];
    const resourceSites = Object.freeze([
      {
        key: 'gold:site-01',
        resource: 'gold' as const,
        label: 'Auric Reach',
        tier: 1,
        availability: 'available' as const
      }
    ]) satisfies readonly RealmNavigatorResourceSite[];
    const waterBodies = Object.freeze([
      {
        bodyId: 'river-01',
        label: 'Founder Run',
        sourceCellKey: 'source-01',
        mouthCellKey: 'mouth-01',
        sourceCoord: Object.freeze({ q: 1, r: -1 }),
        mouthCoord: Object.freeze({ q: 2, r: -2 })
      }
    ]) satisfies readonly RealmNavigatorWaterBody[];
    render(
      <RealmAccessibilityControls
        id="hosted-collapsible-navigator"
        open
        castles={CASTLES}
        hostedDestination
        onActivateCastle={vi.fn()}
        onActivateResourceSite={vi.fn()}
        onActivateWaterCell={vi.fn()}
        onActivateWorker={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestOpen={vi.fn()}
        resourceSites={resourceSites}
        waterBodies={waterBodies}
        workers={workers}
      />
    );

    const castles = screen.getByRole('button', { name: 'CASTLES, 3 items' });
    const workerSection = screen.getByRole('button', { name: 'WORKERS, 2 items' });
    const resources = screen.getByRole('button', { name: 'RESOURCE SITES, 1 item' });
    const water = screen.getByRole('button', { name: 'PUBLIC WATER, 1 item' });
    const searchStatus = screen.getByRole('status');
    expect(searchStatus.textContent).toBe('');
    expect(searchStatus.getAttribute('aria-atomic')).toBe('true');
    for (const toggle of [castles, workerSection, resources, water]) {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const controlled = toggle.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(document.getElementById(controlled!)?.hidden).toBe(false);
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(controlled!)?.hidden).toBe(true);
    }
    expect(screen.queryByRole('list', { name: 'Founded castles' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Public workers' })).toBeNull();

    fireEvent.click(castles);
    expect(castles.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list', { name: 'Founded castles' })).not.toBeNull();
    expect(workerSection.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(workerSection);
    fireEvent.click(resources);
    fireEvent.click(water);
    expect(screen.getByRole('list', { name: 'Public workers' })).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Public resource sites' })).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Public rivers' })).not.toBeNull();

    fireEvent.click(workerSection);
    expect(screen.queryByRole('list', { name: 'Public workers' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'outbound' } });
    expect(screen.getByRole('button', { name: 'WORKERS, 1 of 2 matches' })
      .getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toBe(searchStatus);
    expect(searchStatus.textContent).toContain(
      'Explore search results: 0 castles, 1 worker, 0 resource sites, and 0 water records.'
    );
    const filteredWorkers = screen.getByRole('list', { name: 'Public workers' });
    expect(within(filteredWorkers).getAllByRole('button')).toHaveLength(1);
    expect(within(filteredWorkers).getByText('Peer Watch')).not.toBeNull();
  });

  it('keeps Greater Realm inventories collapsed and progressively bounded', () => {
    const castles = Object.freeze(Array.from({ length: 600 }, (_, index) => ({
      castleId: index + 1,
      label: `@keeper${index + 1}`,
      name: `Keep ${index + 1}`,
      q: index,
      r: -index
    })));
    const workers = Object.freeze(Array.from({ length: 2_400 }, (_, index) => ({
      workerId: `worker-${index + 1}`,
      ordinal: index + 1,
      originCastleId: (index % 600) + 1,
      originCastleName: `Keep ${(index % 600) + 1}`,
      status: 'idle' as const,
      ownedByViewer: index < 4
    }))) satisfies readonly RealmNavigatorWorker[];
    const resourceSites = Object.freeze(Array.from({ length: 1_200 }, (_, index) => ({
      key: `gold:site-${index + 1}`,
      resource: 'gold' as const,
      label: `Auric Reach ${index + 1}`,
      tier: 1,
      availability: 'available' as const
    }))) satisfies readonly RealmNavigatorResourceSite[];
    render(
      <RealmAccessibilityControls
        id="large-realm-navigator"
        open
        castles={castles}
        hostedDestination
        onActivateCastle={vi.fn()}
        onActivateResourceSite={vi.fn()}
        onActivateWorker={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestOpen={vi.fn()}
        resourceSites={resourceSites}
        workers={workers}
      />
    );

    const castleToggle = screen.getByRole('button', { name: 'CASTLES, 600 items' });
    const workerToggle = screen.getByRole('button', { name: 'WORKERS, 2400 items' });
    const resourceToggle = screen.getByRole('button', {
      name: 'RESOURCE SITES, 1200 items'
    });
    for (const toggle of [castleToggle, workerToggle, resourceToggle]) {
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.queryByRole('list', { name: 'Founded castles' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Inspect @keeper600/ })).toBeNull();

    fireEvent.click(castleToggle);
    let castleList = screen.getByRole('list', { name: 'Founded castles' });
    expect(within(castleList).getAllByRole('button')).toHaveLength(96);
    fireEvent.click(screen.getByRole('button', { name: 'Show 96 more castles' }));
    castleList = screen.getByRole('list', { name: 'Founded castles' });
    expect(within(castleList).getAllByRole('button')).toHaveLength(192);
    fireEvent.click(castleToggle);
    expect(screen.queryByRole('list', { name: 'Founded castles' })).toBeNull();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'worker 2400 ' } });
    expect(workerToggle.getAttribute('aria-expanded')).toBe('true');
    const workerList = screen.getByRole('list', { name: 'Public workers' });
    expect(within(workerList).getAllByRole('button')).toHaveLength(1);
    expect(within(workerList).getByText('Keep 600')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('1 worker');
  });

  it('honors a hosted reset key while Explore remains open', async () => {
    const props = {
      id: 'resettable-hosted-navigator',
      open: true,
      castles: CASTLES,
      hostedDestination: true,
      onActivateCastle: vi.fn(),
      onRequestClose: vi.fn(),
      onRequestOpen: vi.fn(),
      triggerVisible: false
    } as const;
    const { rerender } = render(
      <RealmAccessibilityControls {...props} hostedNavigationResetKey={0} />
    );
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'peer' } });
    const castles = screen.getByRole('button', { name: 'CASTLES, 1 of 3 matches' });
    fireEvent.click(castles);
    expect(castles.getAttribute('aria-expanded')).toBe('false');

    rerender(<RealmAccessibilityControls {...props} hostedNavigationResetKey={1} />);
    await waitFor(() => {
      expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
      expect(screen.getByRole('button', { name: 'CASTLES, 3 items' })
        .getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    });
  });

  it('activates a camera preset, closes Explore, and restores trigger focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const showRealm = vi.fn();
    const focusKeep = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        cameraPresets={[
          { id: 'realm', label: 'Realm View', active: true, onActivate: showRealm },
          { id: 'keep', label: 'My Keep', onActivate: focusKeep }
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /Explore realm, 3 founded castles/i });
    fireEvent.click(trigger);
    const views = screen.getByRole('region', { name: 'Realm views' });
    expect(within(views).getByRole('button', { name: 'Realm View' }).getAttribute('aria-pressed'))
      .toBe('true');

    fireEvent.click(within(views).getByRole('button', { name: 'My Keep' }));
    expect(focusKeep).toHaveBeenCalledOnce();
    expect(showRealm).not.toHaveBeenCalled();
    expect(onActivateCastle).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledWith('camera-preset');
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores the exact hosted result, filter, and scroll position after Back', async () => {
    render(<HostedNestedNavigator />);

    const search = screen.getByRole('searchbox', {
      name: 'Search castles, workers, resources, and water'
    });
    fireEvent.change(search, { target: { value: 'peer' } });
    const explore = screen.getByRole('region', { name: 'Explore' });
    explore.scrollTop = 137;
    const peer = screen.getByRole('button', {
      name: 'Inspect @peer, Peer Watch'
    });

    fireEvent.click(peer);
    expect(screen.queryByRole('region', { name: 'Explore' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO EXPLORE' }));

    const restoredExplore = screen.getByRole('region', { name: 'Explore' });
    const restoredSearch = screen.getByRole('searchbox', {
      name: 'Search castles, workers, resources, and water'
    });
    const restoredPeer = screen.getByRole('button', {
      name: 'Inspect @peer, Peer Watch'
    });
    expect((restoredSearch as HTMLInputElement).value).toBe('peer');
    expect(screen.queryByRole('button', {
      name: /Inspect @warpkeeper, Genesis Bastion/
    })).toBeNull();
    await waitFor(() => {
      expect(restoredExplore.scrollTop).toBe(137);
      expect(document.activeElement).toBe(restoredPeer);
    });

    fireEvent.click(screen.getByRole('button', { name: 'FORWARD TO CASTLE' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO EXPLORE' }));
    await waitFor(() => {
      expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('peer');
      expect(screen.getByRole('region', { name: 'Explore' }).scrollTop).toBe(137);
      expect(document.activeElement).toBe(screen.getByRole('button', {
        name: 'Inspect @peer, Peer Watch'
      }));
    });
  });

  it('starts fresh after a nested hosted destination closes to the Realm', async () => {
    render(<HostedNestedNavigator />);

    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'peer' } });
    fireEvent.click(screen.getByRole('button', {
      name: 'Inspect @peer, Peer Watch'
    }));
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE TO REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'OPEN FRESH EXPLORE' }));

    const freshSearch = screen.getByRole('searchbox');
    await waitFor(() => {
      expect((freshSearch as HTMLInputElement).value).toBe('');
      expect(document.activeElement).toBe(freshSearch);
    });
    const castleDisclosure = screen.getByRole('button', {
      name: 'CASTLES, 3 items'
    });
    expect(castleDisclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', {
      name: /Inspect @warpkeeper, Genesis Bastion/
    })).not.toBeNull();
  });

  it('lists every public worker as a keyboard-operable identity target', () => {
    const onActivateWorker = vi.fn();
    const workers = Object.freeze([
      {
        workerId: 'genesis-001-castle-1-worker-01',
        ordinal: 1,
        originCastleId: 1,
        originCastleName: 'Genesis Bastion',
        status: 'idle' as const,
        coord: Object.freeze({ q: 0, r: 0 }),
        ownedByViewer: true
      },
      {
        workerId: 'genesis-001-castle-2-worker-02',
        ordinal: 2,
        originCastleId: 2,
        originCastleName: 'Peer Watch',
        status: 'outbound' as const,
        coord: Object.freeze({ q: 3, r: -1 }),
        ownedByViewer: false
      }
    ]) satisfies readonly RealmNavigatorWorker[];
    render(
      <ControlledNavigator
        onActivateCastle={vi.fn()}
        onRequestClose={vi.fn()}
        onActivateWorker={onActivateWorker}
        workers={workers}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Explore realm/i }));

    const list = screen.getByRole('list', { name: 'Public workers' });
    const ownWorker = within(list).getByRole('button', {
      name: 'Inspect worker 1, Genesis Bastion, idle, at origin keep, your worker'
    });
    const peerWorker = within(list).getByRole('button', {
      name: 'Inspect worker 2, Peer Watch, outbound, at origin keep'
    });
    fireEvent.focus(peerWorker);
    expect(onActivateWorker).not.toHaveBeenCalled();
    fireEvent.click(peerWorker);
    expect(onActivateWorker).toHaveBeenCalledWith(workers[1]);
    expect(ownWorker.getAttribute('data-own')).toBe('true');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'outbound' } });
    expect(within(list).queryByRole('button', { name: /Genesis Bastion/ })).toBeNull();
    expect(within(list).getAllByRole('button')).toHaveLength(1);
  });

  it('keeps semantic resource-site navigation after player coordinates are hidden', () => {
    const onActivateResourceSite = vi.fn();
    const resourceSites = Object.freeze([
      {
        key: 'gold:private-runtime-site-0001',
        resource: 'gold' as const,
        label: 'Auric Reach',
        tier: 1,
        availability: 'available' as const
      },
      {
        key: 'wood:private-runtime-site-0007',
        resource: 'wood' as const,
        label: 'Elderwood Camp',
        tier: 2,
        availability: 'occupied' as const
      }
    ]) satisfies readonly RealmNavigatorResourceSite[];
    render(
      <ControlledNavigator
        onActivateCastle={vi.fn()}
        onActivateResourceSite={onActivateResourceSite}
        onRequestClose={vi.fn()}
        resourceSites={resourceSites}
        selectedResourceKey={resourceSites[1].key}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Explore realm/i }));

    const list = screen.getByRole('list', { name: 'Public resource sites' });
    const gold = within(list).getByRole('button', {
      name: 'Inspect Auric Reach, tier 1, Available'
    });
    const wood = within(list).getByRole('button', {
      name: 'Inspect Elderwood Camp, tier 2, Occupied, selected'
    });
    expect(wood.getAttribute('aria-pressed')).toBe('true');
    expect(gold.classList.contains('realm-cell-navigator__resource-site')).toBe(true);
    expect(gold.getAttribute('data-resource-kind')).toBe('gold');
    expect(gold.getAttribute('data-resource-state')).toBe('available');
    expect(gold.hasAttribute('data-resource-key')).toBe(false);
    expect(gold.hasAttribute('data-site-id')).toBe(false);
    expect(list.textContent).not.toMatch(
      /private-runtime-site|FID|\bq\s+-?\d|\br\s+-?\d/i
    );

    fireEvent.focus(gold);
    expect(onActivateResourceSite).not.toHaveBeenCalled();
    fireEvent.click(gold);
    expect(onActivateResourceSite).toHaveBeenCalledWith(resourceSites[0]);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'occupied' } });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByText('Elderwood Camp')).not.toBeNull();
  });

  it('offers an optional strict q/r jump and activates only after validation', () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const validate = vi.fn(({ q, r }) => Math.abs(q) <= 4 && Math.abs(r) <= 4);
    const onActivate = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        coordinateJump={{ validate, onActivate }}
        showDiagnostics
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Explore realm, 3 founded castles/i }));

    const q = screen.getByRole('textbox', { name: 'q coordinate' });
    const r = screen.getByRole('textbox', { name: 'r coordinate' });
    fireEvent.focus(q);
    fireEvent.focus(r);
    expect(validate).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '1.5' } });
    fireEvent.change(r, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(screen.getByRole('alert').textContent).toMatch(/whole-number/i);
    expect(validate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(validate).toHaveBeenLastCalledWith({ q: 99, r: 0 });
    expect(screen.getByRole('alert').textContent).toMatch(/not available/i);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '1' } });
    fireEvent.change(r, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith({ q: 1, r: -1 });
    expect(onActivateCastle).not.toHaveBeenCalled();
  });

  it('keeps coordinate navigation and spatial labels available in diagnostics mode only', () => {
    const coordinateJump = {
      validate: vi.fn(() => true),
      onActivate: vi.fn()
    };
    render(
      <ControlledNavigator
        coordinateJump={coordinateJump}
        onActivateCastle={vi.fn()}
        onRequestClose={vi.fn()}
        showDiagnostics
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Explore realm/i }));

    expect(screen.getByRole('button', {
      name: 'Inspect @warpkeeper, Genesis Bastion, q 0, r 0, your castle'
    })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'q coordinate' })).not.toBeNull();
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toContain('coordinates');
  });

  it('routes Escape through the close callback and restores the exposed trigger focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const onOuterEscape = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        onOuterEscape={onOuterEscape}
        triggerRef={triggerRef}
      />
    );

    const trigger = screen.getByRole('button', { name: /Explore realm, 3 founded castles/i });
    expect(triggerRef.current).toBe(trigger);
    fireEvent.click(trigger);
    const search = screen.getByRole('searchbox', { name: 'Search castles, workers, resources, and water' });
    fireEvent.keyDown(search, { key: 'Escape' });

    expect(onRequestClose).toHaveBeenCalledWith('escape');
    expect(onOuterEscape).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(triggerRef.current));
  });
});
