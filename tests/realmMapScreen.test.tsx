import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { RealmIdentity } from '../src/components/realm/realmTypes';
import { hexDisc } from '../src/game/map/hexCoordinates';

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

function openTraversableCellNavigator(expectedCount = 61) {
  const toggle = document.querySelector('details.realm-cell-navigator > summary');
  if (!(toggle instanceof HTMLElement)) throw new Error('missing compact Realm cell navigator');
  expect(toggle.textContent).toMatch(new RegExp(`Traversable Cells\\s+${expectedCount}`, 'i'));
  fireEvent.click(toggle);
  return screen.getByRole('group', { name: expectedCount > 72
    ? /Traversable realm cells, page/i
    : 'Traversable realm cells' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('renders 61 traversable cells inside a continuous 91-cell fallback surface', () => {
    const { container } = renderFallbackRealm();

    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(fallback.textContent).toMatch(/61 traversable cells · 61 realm cells/i);
    expect(fallback.textContent).toMatch(/91 rendered/i);
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon')).toHaveLength(91);
    expect(screen.getByTestId('realm-keep-marker')).not.toBeNull();

    const navigator = container.querySelector('details.realm-cell-navigator');
    expect(navigator).not.toBeNull();
    expect(navigator?.hasAttribute('open')).toBe(false);
    const selector = openTraversableCellNavigator();
    expect(within(selector).getAllByRole('button', { name: /Select cell/i })).toHaveLength(61);
    expect(within(selector).queryByRole('button', { name: 'Select cell 5,0' })).toBeNull();
  });

  it('excludes authoritative scenic blockers from selection and labels them honestly', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        sharedTileMetadata={[{
          tileKey: '1,0',
          realmId: 'GENESIS_001',
          s: -1,
          ring: 1,
          sector: 1,
          terrainKind: 'ridge',
          passable: false,
          movementCost: 0,
          staticContentKind: 'scenic-blocker',
          generationVersion: 2
        }]}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByTestId('realm-static-fallback').textContent)
      .toContain('60 traversable cells · 61 realm cells · 91 rendered');
    const blocker = container.querySelector('polygon[data-terrain-kind="ridge"]');
    expect(blocker?.getAttribute('data-playable')).toBe('false');
    expect(blocker?.getAttribute('data-realm-cell')).toBe('true');
    expect(blocker?.getAttribute('data-static-content')).toBe('scenic-blocker');

    const selector = openTraversableCellNavigator(60);
    expect(within(selector).queryByRole('button', { name: 'Select cell 1,0' })).toBeNull();
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByText('Selected cell 0, 0')).not.toBeNull();
  });

  it('focuses the realm once on entry without reclaiming focus after the player moves it', () => {
    const { rerender } = renderFallbackRealm();
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(document.activeElement).toBe(realm);

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    returnButton.focus();
    rerender(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        sharedPlayers={[{ fid: VERIFIED_REALM_IDENTITY.fid, status: 'active' }]}
        onRequestReturn={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(returnButton);
  });

  it('keeps the session-bound first keep fixed at the center while other cells are selected', () => {
    renderFallbackRealm();
    const selector = openTraversableCellNavigator();
    const marker = screen.getByTestId('realm-keep-marker');
    const centerTransform = marker.getAttribute('transform');

    expect(screen.queryByRole('button', { name: /Place Frontier Keep/i })).toBeNull();
    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 1,0' }));

    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(centerTransform);
    expect(screen.getByText('Olive grass · terrain record pending.')).not.toBeNull();
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
    const { container } = render(
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
        sharedProfiles={[
          {
            fid: VERIFIED_REALM_IDENTITY.fid,
            canonicalUsername: 'warpkeeper',
            displayName: 'Warp Keeper',
            admittedAt: Date.UTC(2026, 6, 13),
            firstAuthenticatedAt: Date.UTC(2026, 6, 14),
            publicStatus: 'founding-player',
            communityStatsVisible: true,
            totalSnapBurnedMicros: 25_000_000n,
            marksEarnedMicros: 25_000_000n,
            marksSpentMicros: 0n,
            marksBalanceMicros: 25_000_000n,
            marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1'
          },
          {
            fid: 77,
            canonicalUsername: 'peerkeeper',
            displayName: 'Peer Keeper',
            publicStatus: 'founding-player',
            communityStatsVisible: false
          }
        ]}
        sharedTileMetadata={[
          {
            tileKey: '1,-1', realmId: 'GENESIS_001', s: 0, ring: 1, sector: 6,
            terrainKind: 'lowland', passable: true, movementCost: 1,
            staticContentKind: 'castle-slot', generationVersion: 2
          },
          {
            tileKey: '-1,1', realmId: 'GENESIS_001', s: 0, ring: 1, sector: 3,
            terrainKind: 'meadow', passable: true, movementCost: 1,
            staticContentKind: 'castle-slot', generationVersion: 2
          }
        ]}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Server Bastion' })).not.toBeNull();
    expect(screen.getByText('LEVEL 3')).not.toBeNull();
    expect(screen.getByText('Selected cell 1, -1')).not.toBeNull();
    const selector = openTraversableCellNavigator();
    expect(within(selector).getByRole('button', {
      name: 'Select cell 1,-1, your Hegemony keep'
    })).not.toBeNull();
    expect(within(selector).getByRole('button', { name: 'Select cell 0,0' })).not.toBeNull();
    expect(screen.getByLabelText('Shared realm state').textContent)
      .toContain('61 TILES // 2 KEEPERS // 2 KEEPS');
    expect(screen.getByLabelText('Marks balance: 25 Marks')).not.toBeNull();
    expect(screen.getByRole('button', {
      name: /Inspect @warpkeeper castle, Server Bastion, cell 1,-1, your castle/i
    })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'WARP CASTLE · 100 MARKS' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', {
      name: /Inspect @peerkeeper castle, Peer Watch, cell -1,1/i
    }));
    expect(screen.getByRole('heading', { level: 2, name: '@peerkeeper' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /WARP CASTLE/i })).toBeNull();

    const foundations = Array.from(container.querySelectorAll(
      '.realm-map-screen__fallback-foundation'
    ));
    expect(foundations).toHaveLength(2);
    expect(foundations.map((foundation) => ({
      id: foundation.getAttribute('data-foundation-id'),
      q: foundation.getAttribute('data-q'),
      r: foundation.getAttribute('data-r'),
      radius: foundation.getAttribute('r')
    }))).toEqual([
      { id: 'peer-castle-10', q: '-1', r: '1', radius: '0.7' },
      { id: 'own-keep', q: '1', r: '-1', radius: '0.7' }
    ]);
  });

  it('returns focus to the realm after compact navigator selection so arrow navigation works', () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main');
    const selector = openTraversableCellNavigator();

    fireEvent.click(within(selector).getByRole('button', {
      name: 'Select cell 0,0, your Hegemony keep'
    }));
    expect(document.activeElement).toBe(realm);

    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
  });

  it.each(['Enter', ' '])(
    'leaves %j activation with a focused HUD control instead of invoking the map shortcut',
    (key) => {
      const onRequestReturn = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      render(
        <RealmMapScreen
          identity={VERIFIED_REALM_IDENTITY}
          onRequestReturn={onRequestReturn}
        />
      );

      const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
      returnButton.focus();

      expect(fireEvent.keyDown(returnButton, { key })).toBe(true);
      expect(document.activeElement).toBe(returnButton);
      expect(screen.getByText('Selected cell 0, 0')).not.toBeNull();

      fireEvent.click(returnButton);
      expect(onRequestReturn).toHaveBeenCalledTimes(1);
    }
  );

  it('does not consume arrow keys that originate from nested realm controls', () => {
    renderFallbackRealm();
    const recenterButton = screen.getByRole('button', { name: 'Recenter Keep' });
    recenterButton.focus();

    expect(fireEvent.keyDown(recenterButton, { key: 'ArrowRight' })).toBe(true);
    expect(document.activeElement).toBe(recenterButton);
    expect(screen.getByText('Selected cell 0, 0')).not.toBeNull();
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

    const selector = openTraversableCellNavigator();
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

  it('renders the complete 1,261-cell Genesis disc with a two-ring apron and paged navigation', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const coords = hexDisc({ q: 0, r: 0 }, 20);
    const ownCastle = {
      castleId: 1,
      ownerFid: VERIFIED_REALM_IDENTITY.fid,
      q: 0,
      r: 0,
      level: 1,
      name: 'Founding Keep'
    };
    const peers = coords
      .filter((coord) => coord.q !== 0 || coord.r !== 0)
      .slice(0, 99)
      .map((coord, index) => ({
        castleId: index + 2,
        ownerFid: 50_000 + index,
        q: coord.q,
        r: coord.r,
        level: 1,
        name: `Keep ${index + 2}`
      }));
    const { container } = render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        ownCastle={ownCastle}
        otherCastles={[ownCastle, ...peers]}
        sharedTiles={coords.map((coord, index) => ({
          key: `${coord.q},${coord.r}`,
          q: coord.q,
          r: coord.r,
          biome: 'temperate-lowland',
          terrainSeed: index
        }))}
        sharedPlayers={peers.map((castle) => ({ fid: castle.ownerFid, status: 'active' }))}
        sharedProfiles={[]}
        onRequestReturn={vi.fn()}
        qualityOverride="reduced"
      />
    );

    expect(screen.getByTestId('realm-static-fallback').textContent)
      .toContain('1261 traversable cells · 1261 realm cells · 1519 rendered');
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon'))
      .toHaveLength(1_519);
    const summary = container.querySelector('details.realm-cell-navigator > summary');
    expect(summary?.textContent).toMatch(/Traversable Cells\s+1261/i);
    fireEvent.click(summary as HTMLElement);
    const page = screen.getByRole('group', { name: /Traversable realm cells, page/i });
    expect(within(page).getAllByRole('button', { name: /Select cell/i }).length)
      .toBeLessThanOrEqual(72);
    expect(screen.getByText(/Page \d+ of 18/)).not.toBeNull();

    const visibleLabels = screen.getAllByRole('button', { name: /^Inspect /i });
    expect(visibleLabels.length).toBeLessThanOrEqual(14);
    expect(visibleLabels.some((label) => label.getAttribute('aria-label')?.includes('your castle')))
      .toBe(true);
  });

  it('fails back to the bounded legacy surface for an unsupported oversized disc', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const unsupported = hexDisc({ q: 0, r: 0 }, 21);
    const { container } = render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        sharedTiles={unsupported.map((coord, index) => ({
          key: `${coord.q},${coord.r}`,
          q: coord.q,
          r: coord.r,
          biome: 'temperate-lowland',
          terrainSeed: index
        }))}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByTestId('realm-static-fallback').textContent)
      .toContain('61 traversable cells · 61 realm cells · 91 rendered');
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon'))
      .toHaveLength(91);
  });

  it('rejects a forged authoritative tile key instead of inferring a large disc', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const sharedTiles = hexDisc({ q: 0, r: 0 }, 20).map((coord, index) => ({
      key: index === 0 ? 'forged' : `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      biome: 'temperate-lowland',
      terrainSeed: index
    }));
    const { container } = render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        sharedTiles={sharedTiles}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByTestId('realm-static-fallback').textContent)
      .toContain('61 traversable cells · 61 realm cells · 91 rendered');
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon'))
      .toHaveLength(91);
  });
});
