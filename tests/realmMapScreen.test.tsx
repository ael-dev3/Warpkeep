import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
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
  it('renders the exact canonical 1,261-cell Genesis disc and two-ring apron', () => {
    const { container } = renderFallbackRealm();

    expect(screen.getByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(fallback.textContent)
      .toContain('1101 traversable cells · 1261 realm cells · 1519 rendered');
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon'))
      .toHaveLength(1_519);
    expect(container.querySelectorAll('polygon[data-realm-cell="true"]'))
      .toHaveLength(1_261);
    expect(container.querySelectorAll('polygon[data-playable="false"][data-realm-cell="true"]'))
      .toHaveLength(160);
    expect(screen.getByLabelText('Shared realm state').textContent)
      .toContain('GENESIS 001 · 1,261 CELLS');
    expect(screen.getByRole('button', { name: /Realm Navigator\s+1/i })).not.toBeNull();
  });

  it('opens a castle record only after explicit navigator activation', () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    const navigatorTrigger = screen.getByRole('button', { name: /Realm Navigator\s+2/i });
    fireEvent.click(navigatorTrigger);
    const navigator = screen.getByRole('dialog', { name: 'Realm Navigator' });
    const peer = within(navigator).getByRole('button', {
      name: /Inspect Hegemony Keep, Peer Watch, q 2, r -1/i
    });

    peer.focus();
    expect(document.activeElement).toBe(peer);
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    fireEvent.click(peer);
    expect(screen.queryByRole('dialog', { name: 'Realm Navigator' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Hegemony Keep' })).not.toBeNull();
    expect(screen.getByText('Peer Watch · 2, -1')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).toBe(document.activeElement);
  });

  it('restores focus safely after closing a castle record', async () => {
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    renderFallbackRealm({ snapshot });

    fireEvent.click(screen.getByRole('button', { name: /Realm Navigator\s+2/i }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Realm Navigator' })).getByRole(
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

  it('keeps the authoritative keep fixed while keyboard selection moves over terrain', () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    const marker = screen.getByTestId('realm-keep-marker');
    const markerTransform = marker.getAttribute('transform');

    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();
    fireEvent.keyDown(realm, { key: 'ArrowRight' });

    expect(screen.getByText('Selected terrain · 1, 0')).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(markerTransform);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recenter Keep' }));
    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(markerTransform);
  });

  it('focuses the realm once and does not reclaim focus on a normal rerender', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const { rerender } = renderFallbackRealm({ snapshot });
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(document.activeElement).toBe(realm);

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
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

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
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

    expect(container.querySelector('.realm-hud__keeper')?.textContent).toBe('Hegemony Keep');
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
