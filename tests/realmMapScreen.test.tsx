import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import { measuredRealmComposition } from '../src/components/realm/realmMeasuredComposition';
import type { RealmIdentity } from '../src/components/realm/realmTypes';
import { createRenderedWebglQaFixtureRealm } from '../src/dev/renderedWebglQaFixture';
import type { CanonicalWarpkeepRealmSnapshot } from '../src/spacetime/warpkeepBackendTypes';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

const VERIFIED_REALM_IDENTITY: RealmIdentity = Object.freeze({
  fid: CANONICAL_TEST_FID,
  username: 'warpkeeper',
  displayName: 'Warp Keeper'
});

function renderFallbackRealm(
  options: Readonly<{
    identity?: RealmIdentity;
    snapshot?: CanonicalWarpkeepRealmSnapshot;
    onRequestReturn?: () => void;
    resources?: ReturnType<typeof createReadyResourceState>;
  }> = {}
) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const identity = options.identity ?? VERIFIED_REALM_IDENTITY;
  return render(
    <RealmMapScreen
      identity={identity}
      snapshot={options.snapshot ?? createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
      onRequestReturn={options.onRequestReturn ?? vi.fn()}
      resources={options.resources ?? createReadyResourceState(identity.fid)}
    />
  );
}

function selectionAnnouncement() {
  const announcement = document.querySelector(
    '.realm-player-chrome__selection-announcement'
  );
  if (!(announcement instanceof HTMLParagraphElement)) {
    throw new Error('missing player selection announcement');
  }
  return announcement;
}

function playerMenuTrigger() {
  return screen.getByRole('button', { name: /Open Realm menu/i });
}

function openPlayerMenu() {
  const trigger = playerMenuTrigger();
  fireEvent.click(trigger);
  return {
    trigger,
    dialog: screen.getByRole('dialog', { name: 'REALM MENU' })
  };
}

function openPlayerExplore() {
  const { trigger, dialog } = openPlayerMenu();
  fireEvent.click(within(dialog).getByRole('button', { name: /EXPLORE/i }));
  return { trigger, explore: screen.getByRole('dialog', { name: 'Explore' }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('reserves a short-landscape Explore panel without turning corner chrome into a top inset', () => {
    const root = document.createElement('main');
    const profileTrigger = document.createElement('button');
    const resourceRail = document.createElement('section');
    const dialog = document.createElement('section');
    const probe = document.createElement('div');
    profileTrigger.className = 'realm-profile-trigger';
    resourceRail.className = 'realm-resource-rail';
    dialog.className = 'realm-cell-navigator__dialog';
    probe.className = 'realm-safe-area-probe';
    root.append(profileTrigger, resourceRail, dialog, probe);

    const rect = (left: number, top: number, right: number, bottom: number) => ({
      left,
      top,
      right,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({})
    }) as DOMRect;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 844, 390));
    vi.spyOn(profileTrigger, 'getBoundingClientRect').mockReturnValue(rect(10, 10, 62, 62));
    vi.spyOn(resourceRail, 'getBoundingClientRect').mockReturnValue(rect(500, 8, 834, 48));
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(rect(550, 10, 834, 380));

    expect(measuredRealmComposition(root)).toMatchObject({
      insets: { top: 0, right: 304, bottom: 0, left: 0 },
      focusPadding: 14
    });
  });

  it('keeps the exact 10,000-cell realm represented by a constant-size fallback surface', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const { container } = renderFallbackRealm({ snapshot });

    expect(snapshot.tiles).toHaveLength(10_000);
    expect(playerMenuTrigger()).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Your resources' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(within(fallback).getByText(
      'Detailed terrain is unavailable. Showing the canonical Genesis 001 realm map.'
    )).not.toBeNull();
    expect(fallback.textContent).not.toMatch(/\b(?:traversable cells|realm cells|rendered)\b/i);
    const polygons = container.querySelectorAll<SVGPolygonElement>(
      '.realm-map-screen__fallback-map polygon'
    );
    const apron = container.querySelector<SVGPolygonElement>(
      'polygon[data-surface-layer="render-apron"]'
    );
    const authoritative = container.querySelector<SVGPolygonElement>(
      'polygon[data-surface-layer="authoritative"]'
    );
    expect(polygons).toHaveLength(3);
    expect(apron?.getAttribute('points')?.split(' ').length).toBeLessThan(100);
    expect(authoritative?.dataset.authoritativeCellCount).toBe('10000');
    expect(authoritative?.getAttribute('points')?.split(' ').length).toBeLessThan(100);
    expect(container.querySelectorAll('polygon[data-realm-cell]')).toHaveLength(0);
    expect(container.querySelectorAll('.realm-map-screen__fallback-selection')).toHaveLength(1);
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    expect(screen.queryByRole('button', { name: /Explore realm/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recenter Keep' })).toBeNull();
  });

  it('keeps an unnamed castle marker visible with a neutral direct identity', async () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: 'Inspect Hegemony Keep castle, Peer Watch, cell 2,-1'
      })).not.toBeNull();
    });
    expect(document.querySelector('.realm-map-screen__fallback-peer-castle'))
      .not.toBeNull();

    const { trigger, explore } = openPlayerExplore();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const peer = within(explore).getByRole('button', {
      name: /Inspect Hegemony Keep, Peer Watch, q 2, r -1/i
    });

    peer.focus();
    expect(document.activeElement).toBe(peer);
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    fireEvent.click(peer);
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    const record = screen.getByRole('dialog', { name: 'Peer Watch' });
    expect(within(record).getByText('Peer Watch')).not.toBeNull();
    expect(within(record).getByText('q 2 · r -1')).not.toBeNull();
    expect(selectionAnnouncement().textContent)
      .toContain('Peer Watch. Selected castle at cell 2, -1');
    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).toBe(document.activeElement);
  });

  it('renders every 100-castle fallback marker with complete direct-label coverage', async () => {
    const realm = createRenderedWebglQaFixtureRealm();
    const { container } = renderFallbackRealm(realm);
    const markers = container.querySelectorAll<SVGGElement>(
      '.realm-map-screen__fallback-keep, .realm-map-screen__fallback-peer-castle'
    );
    const markerCastleIds = new Set(
      [...markers].map((marker) => marker.dataset.castleId)
    );

    expect(realm.snapshot.castles).toHaveLength(100);
    expect(markers).toHaveLength(realm.snapshot.castles.length);
    expect(markerCastleIds.size).toBe(realm.snapshot.castles.length);
    await waitFor(() => {
      const map = screen.getByRole('main', { name: 'Hegemony realm' });
      expect(map.getAttribute('data-label-placed-count')).toBe('100');
      expect(map.getAttribute('data-label-unplaced-count')).toBe('0');
      expect(map.getAttribute('data-label-clustered-count')).toBe('0');
    });
  });

  it('changes camera presets without opening a castle record', async () => {
    renderFallbackRealm();

    const { trigger, explore } = openPlayerExplore();
    const views = screen.getByRole('region', { name: 'Realm views' });
    fireEvent.click(within(views).getByRole('button', { name: 'My Keep' }));

    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    expect(explore.isConnected).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores focus safely after closing a castle record', async () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    const { explore } = openPlayerExplore();
    fireEvent.click(within(explore).getByRole(
      'button',
      { name: /Inspect Hegemony Keep, Peer Watch, q 2, r -1/i }
    ));
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE RECORD' }));

    await waitFor(() => {
      const label = screen.queryByRole('button', {
        name: /Inspect Hegemony Keep castle, Peer Watch, cell 2,-1/i
      });
      expect(document.activeElement).toBe(label ?? screen.getByRole('main', { name: 'Hegemony realm' }));
    });
  });

  it('keeps the authoritative keep fixed while keyboard selection moves over terrain', async () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    const marker = await waitFor(() => screen.getByTestId('realm-keep-marker'));
    const markerTransform = marker.getAttribute('transform');
    const currentSelection = selectionAnnouncement;

    expect(currentSelection().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    fireEvent.keyDown(realm, { key: 'ArrowRight' });

    expect(currentSelection().textContent).toContain('Lowland Forest. Selected cell 1, 0');
    expect(marker.getAttribute('transform')).toBe(markerTransform);
    expect(screen.queryByRole('dialog')).toBeNull();

    const { dialog } = openPlayerMenu();
    const home = within(dialog).getByRole('button', { name: /MY KEEP/i });
    fireEvent.click(home);
    expect(currentSelection().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    expect(marker.getAttribute('transform')).toBe(markerTransform);
  });

  it('closes a peer record when My Keep recenters through the PFP menu', async () => {
    renderFallbackRealm({
      snapshot: createCanonicalGenesisSnapshot({
        ownFid: CANONICAL_TEST_FID,
        peerFid: 77
      })
    });
    const peer = await waitFor(() => screen.getByRole('button', {
      name: 'Inspect Hegemony Keep castle, Peer Watch, cell 2,-1'
    }));
    fireEvent.click(peer);
    expect(screen.getByRole('dialog', { name: 'Peer Watch' })).not.toBeNull();

    const { trigger, dialog } = openPlayerMenu();
    fireEvent.click(within(dialog).getByRole('button', { name: /MY KEEP/i }));

    expect(screen.queryByRole('dialog', { name: 'Peer Watch' })).toBeNull();
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('focuses the realm once and does not reclaim focus on a normal rerender', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const { rerender } = renderFallbackRealm({ snapshot });
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(document.activeElement).toBe(realm);

    const trigger = playerMenuTrigger();
    trigger.focus();
    rerender(
      <RealmMapScreen
        identity={{ ...VERIFIED_REALM_IDENTITY }}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(trigger);
  });

  it('closes the top interaction surface before Escape requests realm exit', () => {
    const onRequestReturn = vi.fn();
    renderFallbackRealm({ onRequestReturn });

    const { explore } = openPlayerExplore();
    fireEvent.click(within(explore).getByRole('button', {
      name: /Inspect @warpkeeper, Warpkeeper Bastion, q 0, r 0, your castle/i
    }));
    expect(screen.getByRole('dialog', { name: 'Warpkeeper Bastion' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeeper Bastion' })).toBeNull();
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('treats a held Escape key as one hierarchy step', () => {
    const onRequestReturn = vi.fn();
    renderFallbackRealm({ onRequestReturn });

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    fireEvent.keyDown(realm, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Warpkeeper Bastion' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeeper Bastion' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape', repeat: true });
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('uses a neutral primary identity when no public name is available', () => {
    const fid = 98_765;
    const { container } = renderFallbackRealm({
      identity: { fid },
      snapshot: createCanonicalGenesisSnapshot(fid)
    });

    expect(screen.getByRole('button', {
      name: 'Open Realm menu for Hegemony Keeper'
    })).not.toBeNull();
    expect(container.querySelector('.realm-profile-trigger .realm-castle-avatar')?.textContent)
      .toBe('W');
    expect(container.querySelector('.realm-hud')).toBeNull();
    expect(screen.queryByText('FID 98765 Keep')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^FID\b/i })).toBeNull();
  });

  it('fails closed when a snapshot has the right shape but lacks the private canonical brand', () => {
    const canonical = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const forged = { ...canonical } as CanonicalWarpkeepRealmSnapshot;
    const onRequestReturn = vi.fn();

    renderFallbackRealm({ snapshot: forged, onRequestReturn });

    expect(screen.getByRole('alert').textContent).toMatch(/Genesis 001 is unavailable/i);
    expect(screen.getByText(/did not pass validation/i)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('rejects malformed runtime input before dereferencing or mounting any map surface', () => {
    const malformed = Object.freeze({}) as CanonicalWarpkeepRealmSnapshot;
    const { container } = renderFallbackRealm({ snapshot: malformed });

    expect(screen.getByRole('alert').textContent).toMatch(/Genesis 001 is unavailable/i);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('.realm-map-screen__fallback-map')).toBeNull();
    expect(container.textContent).not.toMatch(
      /(?:61\s+(?:realm|traversable)\s+cells|traversable\s+cells\s+61)/i
    );
  });
});
