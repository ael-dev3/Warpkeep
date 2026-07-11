import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { RealmIdentity } from '../src/components/realm/realmTypes';

const VERIFIED_REALM_IDENTITY: RealmIdentity = Object.freeze({
  fid: 12_345,
  username: 'warpkeeper',
  displayName: 'Warp Keeper'
});

function renderFallbackRealm(identity: RealmIdentity = VERIFIED_REALM_IDENTITY) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return render(
    <RealmMapScreen
      identity={identity}
      onRequestReturn={vi.fn()}
    />
  );
}

function openPlayableCellNavigator() {
  const toggle = document.querySelector('details.realm-cell-navigator > summary');
  if (!(toggle instanceof HTMLElement)) throw new Error('missing compact Realm cell navigator');
  expect(toggle.textContent).toMatch(/Realm Cells\s+61/i);
  fireEvent.click(toggle);
  return screen.getByRole('group', { name: 'Playable realm cells' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('renders 61 playable cells inside a continuous 91-cell fallback surface', () => {
    const { container } = renderFallbackRealm();

    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(fallback.textContent).toMatch(/61 playable cells/i);
    expect(fallback.textContent).toMatch(/91 rendered/i);
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon')).toHaveLength(91);
    expect(screen.getByTestId('realm-keep-marker')).not.toBeNull();

    const navigator = container.querySelector('details.realm-cell-navigator');
    expect(navigator).not.toBeNull();
    expect(navigator?.hasAttribute('open')).toBe(false);
    const selector = openPlayableCellNavigator();
    expect(within(selector).getAllByRole('button', { name: /Select cell/i })).toHaveLength(61);
    expect(within(selector).queryByRole('button', { name: 'Select cell 5,0' })).toBeNull();
  });

  it('keeps the session-bound first keep fixed at the center while other cells are selected', () => {
    renderFallbackRealm();
    const selector = openPlayableCellNavigator();
    const marker = screen.getByTestId('realm-keep-marker');
    const centerTransform = marker.getAttribute('transform');

    expect(screen.queryByRole('button', { name: /Place Frontier Keep/i })).toBeNull();
    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 1,0' }));

    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(centerTransform);
    expect(screen.getByText('Olive grass · open ground · calm terrain.')).not.toBeNull();
    expect(screen.queryByText(/elevation|soil/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
    expect(screen.getByText('Selected cell 0, 0')).not.toBeNull();
    expect(screen.getByText(/frontier marker is holding/i)).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(centerTransform);
  });

  it('uses a proof-free verified identity and falls back to an FID keep name', () => {
    renderFallbackRealm(Object.freeze({ fid: 98_765 }));

    expect(screen.getByRole('heading', { level: 1, name: 'FID 98765 Keep' })).not.toBeNull();
    expect(screen.getByText('FID 98765')).not.toBeNull();
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
  });

  it('uses the authoritative own-castle projection and exposes the narrow shared snapshot', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        ownCastle={{
          castleId: 9,
          ownerFid: VERIFIED_REALM_IDENTITY.fid,
          q: 1,
          r: -1,
          level: 3,
          name: 'Server Bastion'
        }}
        otherCastles={[{
          castleId: 10,
          ownerFid: 77,
          q: -1,
          r: 1,
          level: 1,
          name: 'Peer Watch'
        }]}
        sharedTiles={Array.from({ length: 61 }, (_, index) => ({
          key: `${index},0`,
          q: index,
          r: 0,
          biome: 'temperate-lowland',
          terrainSeed: index
        }))}
        sharedPlayers={[
          { fid: VERIFIED_REALM_IDENTITY.fid, status: 'active' },
          { fid: 77, status: 'active' }
        ]}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Server Bastion' })).not.toBeNull();
    expect(screen.getByText('LEVEL 3')).not.toBeNull();
    expect(screen.getByText('Selected cell 1, -1')).not.toBeNull();
    expect(screen.getByLabelText('Shared realm state').textContent)
      .toContain('61 TILES // 2 KEEPERS // 2 KEEPS');
  });

  it('returns focus to the realm after compact navigator selection so arrow navigation works', () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main');
    const selector = openPlayableCellNavigator();

    fireEvent.click(within(selector).getByRole('button', {
      name: 'Select cell 0,0, your Hegemony keep'
    }));
    expect(document.activeElement).toBe(realm);

    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
  });

  it('does not rerender the realm for repeated hover updates on the same cell', () => {
    const onRender = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <Profiler id="realm-hover" onRender={onRender}>
        <RealmMapScreen
          identity={VERIFIED_REALM_IDENTITY}
          onRequestReturn={vi.fn()}
        />
      </Profiler>
    );

    const selector = openPlayableCellNavigator();
    const cell = within(selector).getByRole('button', { name: 'Select cell 1,0' });
    const rendersBeforeFirstHover = onRender.mock.calls.length;
    fireEvent.focus(cell);
    const rendersAfterFirstHover = onRender.mock.calls.length;
    expect(rendersAfterFirstHover).toBeGreaterThan(rendersBeforeFirstHover);

    fireEvent.focus(cell);
    expect(onRender).toHaveBeenCalledTimes(rendersAfterFirstHover);
  });

  it('provides visible Return and Recenter actions and returns on Escape', () => {
    const onRequestReturn = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        onRequestReturn={onRequestReturn}
      />
    );

    expect(screen.getByRole('button', { name: 'Recenter Keep' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledTimes(2);
  });
});
