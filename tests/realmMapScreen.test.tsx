import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import {
  measuredRealmComposition,
  measuredVisibleRealmUiRects
} from '../src/components/realm/realmMeasuredComposition';
import type { RealmIdentity } from '../src/components/realm/realmTypes';
import type { CanonicalWarpkeepRealmSnapshot } from '../src/spacetime/warpkeepBackendTypes';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';

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
  }> = {}
) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return render(
    <RealmMapScreen
      identity={options.identity ?? VERIFIED_REALM_IDENTITY}
      snapshot={options.snapshot ?? createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
      onRequestReturn={options.onRequestReturn ?? vi.fn()}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('does not reserve label space for hidden Realm chrome', () => {
    const root = document.createElement('main');
    const visible = document.createElement('section');
    const visibilityHidden = document.createElement('section');
    const displayNone = document.createElement('section');
    visible.className = 'realm-hud';
    visibilityHidden.className = 'realm-hud__actions';
    visibilityHidden.style.visibility = 'hidden';
    displayNone.className = 'castle-inspection';
    displayNone.style.display = 'none';
    root.append(visible, visibilityHidden, displayNone);

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
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 900, 650));
    vi.spyOn(visible, 'getBoundingClientRect').mockReturnValue(rect(120, 70, 320, 190));
    vi.spyOn(visibilityHidden, 'getBoundingClientRect').mockReturnValue(rect(120, 580, 320, 630));
    vi.spyOn(displayNone, 'getBoundingClientRect').mockReturnValue(rect(650, 70, 880, 630));

    expect(measuredVisibleRealmUiRects(root, [
      '.realm-hud',
      '.realm-hud__actions',
      '.castle-inspection'
    ])).toEqual([{
      left: 20,
      top: 20,
      right: 220,
      bottom: 140
    }]);
  });

  it('reserves a short-landscape Explore panel from the right camera edge', () => {
    const root = document.createElement('main');
    const hud = document.createElement('section');
    const actions = document.createElement('div');
    const dialog = document.createElement('section');
    const probe = document.createElement('div');
    hud.className = 'realm-hud';
    actions.className = 'realm-hud__actions';
    dialog.className = 'realm-cell-navigator__dialog';
    probe.className = 'realm-safe-area-probe';
    root.append(hud, actions, dialog, probe);

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
    vi.spyOn(hud, 'getBoundingClientRect').mockReturnValue(rect(10, 10, 225, 145));
    vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue(rect(10, 330, 160, 380));
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(rect(550, 10, 834, 380));

    expect(measuredRealmComposition(root)).toMatchObject({
      insets: { top: 0, right: 304, bottom: 70, left: 235 },
      focusPadding: 14
    });
  });

  it('renders the exact canonical 1,261-cell Genesis disc and two-ring apron', () => {
    const { container } = renderFallbackRealm();

    expect(screen.getByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(within(fallback).getByText(
      'Detailed terrain is unavailable. Showing the canonical Genesis 001 realm map.'
    )).not.toBeNull();
    expect(fallback.textContent).not.toMatch(/\b(?:traversable cells|realm cells|rendered)\b/i);
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon'))
      .toHaveLength(1_519);
    expect(container.querySelectorAll('polygon[data-realm-cell="true"]'))
      .toHaveLength(1_261);
    expect(container.querySelectorAll('polygon[data-playable="false"][data-realm-cell="true"]'))
      .toHaveLength(160);
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
    expect(screen.getByRole('button', {
      name: 'Explore realm, 1 founded castle'
    }).textContent).toContain('Explore');

    const actions = screen.getByLabelText('Realm actions');
    expect(within(actions).getByRole('button', { name: 'Return to Menu' }).textContent).toBe('Menu');
    expect(within(actions).getByRole('button', { name: 'Recenter Keep' }).textContent).toBe('Home');
  });

  it('accounts for a castle without a username in a cluster until Explore activation', async () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: 'Focus Keeper identity pending castle'
      })).not.toBeNull();
    });
    expect(document.querySelector('.realm-map-screen__fallback-peer-castle')).toBeNull();

    const exploreTrigger = screen.getByRole('button', {
      name: 'Explore realm, 2 founded castles'
    });
    expect(exploreTrigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(exploreTrigger);
    expect(exploreTrigger.getAttribute('aria-expanded')).toBe('true');
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    const peer = within(explore).getByRole('button', {
      name: /Inspect Keeper identity pending, Peer Watch, q 2, r -1/i
    });

    peer.focus();
    expect(document.activeElement).toBe(peer);
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    fireEvent.click(peer);
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    const record = screen.getByRole('dialog', { name: 'Keeper identity pending' });
    expect(within(record).getByText('Peer Watch')).not.toBeNull();
    expect(within(record).getByText('q 2 · r -1')).not.toBeNull();
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Peer Watch · q 2, r -1');
    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).toBe(document.activeElement);
  });

  it('changes camera presets without opening a castle record', () => {
    renderFallbackRealm();

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 1 founded castle'
    }));
    const views = screen.getByRole('region', { name: 'Realm views' });
    fireEvent.click(within(views).getByRole('button', { name: 'My Keep' }));

    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
  });

  it('restores focus safely after closing a castle record', async () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 2 founded castles'
    }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Explore' })).getByRole(
      'button',
      { name: /Inspect Keeper identity pending, Peer Watch, q 2, r -1/i }
    ));
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE RECORD' }));

    await waitFor(() => {
      const label = screen.queryByRole('button', {
        name: /Inspect Keeper identity pending castle, Peer Watch, cell 2,-1/i
      });
      expect(document.activeElement).toBe(label ?? screen.getByRole('main', { name: 'Hegemony realm' }));
    });
  });

  it('keeps the authoritative keep fixed while keyboard selection moves over terrain', async () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    const marker = await waitFor(() => screen.getByTestId('realm-keep-marker'));
    const markerTransform = marker.getAttribute('transform');
    const currentSelection = () => screen.getByLabelText('Current selection');

    expect(currentSelection().textContent).toContain('Warpkeeper Bastion · q 0, r 0');
    fireEvent.keyDown(realm, { key: 'ArrowRight' });

    expect(currentSelection().textContent).toContain('Temperate Lowlands · q 1, r 0');
    expect(marker.getAttribute('transform')).toBe(markerTransform);
    expect(screen.queryByRole('dialog')).toBeNull();

    const home = screen.getByRole('button', { name: 'Recenter Keep' });
    expect(home.textContent).toBe('Home');
    fireEvent.click(home);
    expect(currentSelection().textContent).toContain('Warpkeeper Bastion · q 0, r 0');
    expect(marker.getAttribute('transform')).toBe(markerTransform);
  });

  it('focuses the realm once and does not reclaim focus on a normal rerender', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const { rerender } = renderFallbackRealm({ snapshot });
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(document.activeElement).toBe(realm);

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    expect(returnButton.textContent).toBe('Menu');
    returnButton.focus();
    rerender(
      <RealmMapScreen
        identity={{ ...VERIFIED_REALM_IDENTITY }}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(returnButton);
  });

  it('closes the top interaction surface before Escape requests realm exit', () => {
    const onRequestReturn = vi.fn();
    renderFallbackRealm({ onRequestReturn });

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 1 founded castle'
    }));
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    fireEvent.click(within(explore).getByRole('button', {
      name: /Inspect @warpkeeper, Warpkeeper Bastion, q 0, r 0, your castle/i
    }));
    expect(screen.getByRole('dialog', { name: '@warpkeeper' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '@warpkeeper' })).toBeNull();
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('treats a held Escape key as one hierarchy step', () => {
    const onRequestReturn = vi.fn();
    renderFallbackRealm({ onRequestReturn });

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
    fireEvent.keyDown(realm, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: '@warpkeeper' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '@warpkeeper' })).toBeNull();
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

    expect(container.querySelector('.realm-hud__keeper')?.textContent)
      .toBe('Keeper identity pending');
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
