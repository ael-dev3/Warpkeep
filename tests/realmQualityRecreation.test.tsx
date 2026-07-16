import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  type MockSceneOptions = {
    keepCoord: { q: number; r: number };
    otherCastles: readonly { castleId: number; q: number; r: number }[];
    quality: { id: string };
    reducedMotion: boolean;
    onCastlesReady?: (castleCount: number) => void;
    onCastlePresentationTelemetry?: (telemetry: {
      presentedModelCount: number;
      presentedLandscapeBaseCount: number;
      raycastTargetCount: number;
    }) => void;
    onCastleProjection?: (frame: {
      width: number;
      height: number;
      castles: readonly {
        castleId: number;
        q: number;
        r: number;
        x: number;
        y: number;
        distance: number;
        visible: boolean;
        presented: boolean;
        castleBounds?: Readonly<{
          left: number;
          top: number;
          right: number;
          bottom: number;
        }>;
      }[];
    }) => void;
    onTargetHover?: (target: {
      kind: 'castle' | 'terrain';
      castleId?: number;
      coord: { q: number; r: number };
    } | null) => void;
    onTargetSelect?: (target: {
      kind: 'castle' | 'terrain';
      castleId?: number;
      coord: { q: number; r: number };
    }) => void;
  };
  const handles: Array<{
    dispose: ReturnType<typeof vi.fn>;
    focusCastle: ReturnType<typeof vi.fn>;
    focusCell: ReturnType<typeof vi.fn>;
    frameFoundingDistrict: ReturnType<typeof vi.fn>;
    focusKeep: ReturnType<typeof vi.fn>;
    recenterKeep: ReturnType<typeof vi.fn>;
    setHovered: ReturnType<typeof vi.fn>;
    setPresentedCastleIds: ReturnType<typeof vi.fn>;
    setSelected: ReturnType<typeof vi.fn>;
    setSelectedCastleId: ReturnType<typeof vi.fn>;
    setComposition: ReturnType<typeof vi.fn>;
    showRealm: ReturnType<typeof vi.fn>;
  }> = [];
  const createRealmScene = vi.fn((_options: MockSceneOptions) => {
    const handle = {
      dispose: vi.fn(),
      focusCastle: vi.fn(),
      focusCell: vi.fn(),
      frameFoundingDistrict: vi.fn(),
      focusKeep: vi.fn(),
      recenterKeep: vi.fn(),
      setHovered: vi.fn(),
      setPresentedCastleIds: vi.fn(),
      setSelected: vi.fn(),
      setSelectedCastleId: vi.fn(),
      setComposition: vi.fn(),
      showRealm: vi.fn()
    };
    handles.push(handle);
    return handle;
  });
  return { createRealmScene, handles };
});

vi.mock('../src/components/realm/createRealmScene', () => ({
  createRealmScene: mocked.createRealmScene
}));

import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';
import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import { createRenderedWebglQaFixtureRealm } from '../src/dev/renderedWebglQaFixture';
import { validateCanonicalGenesisSnapshot } from '../src/spacetime/canonicalGenesisSnapshot';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepRealmSnapshotCandidate
} from '../src/spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisCandidate,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';

const IDENTITY = { fid: CANONICAL_TEST_FID, username: 'warpkeeper' } as const;

function installWebGlProbe() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    getExtension: () => ({ loseContext: vi.fn() })
  } as unknown as RenderingContext);
}

function validate(candidate: WarpkeepRealmSnapshotCandidate) {
  return validateCanonicalGenesisSnapshot(candidate, {
    ownFid: CANONICAL_TEST_FID,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  });
}

function presentationRefreshSnapshot(): CanonicalWarpkeepRealmSnapshot {
  const candidate = createCanonicalGenesisCandidate({
    ownFid: CANONICAL_TEST_FID,
    peerFid: 77
  });
  return validate({
    ...candidate,
    castles: candidate.castles.map((castle) => (
      castle.ownerFid === 77
        ? { ...castle, name: 'Peer Bastion', level: 3 }
        : { ...castle }
    )),
    profiles: [{
      fid: 77,
      canonicalUsername: 'peerkeeper',
      displayName: 'Peer Keeper',
      publicStatus: 'founding-player',
      communityStatsVisible: false
    }]
  });
}

function movedPeerSnapshot(): CanonicalWarpkeepRealmSnapshot {
  const candidate = createCanonicalGenesisCandidate({
    ownFid: CANONICAL_TEST_FID,
    peerFid: 77
  });
  const peer = candidate.castles.find((castle) => castle.ownerFid === 77);
  const destination = CANONICAL_CASTLE_SLOTS[2];
  if (!peer || !destination) throw new Error('missing canonical peer movement fixture');
  const movedPeer = {
    ...peer,
    tileKey: destination.tileKey,
    q: destination.q,
    r: destination.r
  };
  return validate({
    ...candidate,
    tiles: candidate.tiles.map((tile) => {
      if (tile.key === peer.tileKey) return { ...tile, occupantCastleId: undefined };
      if (tile.key === destination.tileKey) {
        return { ...tile, occupantCastleId: movedPeer.castleId };
      }
      return { ...tile };
    }),
    castles: candidate.castles.map((castle) => (
      castle.castleId === movedPeer.castleId ? movedPeer : { ...castle }
    ))
  });
}

function installMotionPreference(initialMatches = false) {
  const listeners = new Set<() => void>();
  const preference = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn((listener: () => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: () => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn()
  };
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  return {
    preference,
    set(matches: boolean) {
      preference.matches = matches;
      listeners.forEach((listener) => listener());
    }
  };
}

afterEach(() => {
  cleanup();
  mocked.createRealmScene.mockClear();
  mocked.handles.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('live realm quality recreation', () => {
  it('does not create a WebGL scene for an unbranded snapshot', () => {
    installWebGlProbe();
    const canonical = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const unbranded = { ...canonical } as CanonicalWarpkeepRealmSnapshot;

    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={unbranded}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    expect(screen.getByRole('alert').textContent).toMatch(/Genesis 001 is unavailable/i);
    expect(mocked.createRealmScene).not.toHaveBeenCalled();
  });

  it('disposes one scene, preserves selection, and mounts the requested model tier', () => {
    installWebGlProbe();
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const { rerender } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="high"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledOnce();
    expect(mocked.createRealmScene.mock.calls[0]![0].quality.id).toBe('high');
    act(() => mocked.createRealmScene.mock.calls[0]![0].onCastlesReady?.(1));

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Lowland Forest · q 1, r 0');

    rerender(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1]![0].quality.id).toBe('balanced');
    expect(mocked.handles[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocked.handles[1]!.setSelected).toHaveBeenCalledWith({ q: 1, r: 0 });
    act(() => mocked.createRealmScene.mock.calls[1]![0].onCastlesReady?.(1));
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Lowland Forest · q 1, r 0');
    expect(screen.getByRole('main', { name: 'Hegemony realm' }).getAttribute('data-quality'))
      .toBe('balanced');
  });

  it('does not rebuild the renderer for profile/name churn at unchanged castle coordinates', () => {
    installWebGlProbe();
    const initial = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    const refreshed = presentationRefreshSnapshot();
    const { rerender } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={initial}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledOnce();
    act(() => mocked.createRealmScene.mock.calls[0]![0].onCastlesReady?.(2));

    rerender(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={refreshed}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledOnce();
    expect(mocked.handles[0]!.dispose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 2 founded castles'
    }));
    expect(screen.getByRole('button', {
      name: /Inspect @peerkeeper, Peer Bastion, q 2, r -1/i
    })).not.toBeNull();
  });

  it('rebuilds the scene for a real authoritative castle movement', () => {
    installWebGlProbe();
    const initial = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    const moved = movedPeerSnapshot();
    const { rerender } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={initial}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene.mock.calls[0]![0].otherCastles)
      .toEqual([{ castleId: 2, q: 2, r: -1 }]);

    rerender(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={moved}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.handles[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocked.createRealmScene.mock.calls[1]![0].otherCastles)
      .toEqual([{ castleId: 2, q: -1, r: 2 }]);
  });

  it('rebuilds on reduced-motion preference changes without refocusing the realm', () => {
    const motion = installMotionPreference();
    installWebGlProbe();
    const { unmount } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene.mock.calls[0]![0].reducedMotion).toBe(false);

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    returnButton.focus();
    act(() => motion.set(true));

    expect(mocked.handles[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1]![0].reducedMotion).toBe(true);
    expect(document.activeElement).toBe(returnButton);

    unmount();
    expect(motion.preference.removeEventListener).toHaveBeenCalledOnce();
  });

  it('restores an explicitly focused castle instead of overwriting it with district framing', () => {
    installWebGlProbe();
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    const { rerender } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="high"
      />
    );
    const initialOptions = mocked.createRealmScene.mock.calls[0]![0];
    act(() => initialOptions.onCastlesReady?.(2));
    expect(mocked.handles[0]!.frameFoundingDistrict).toHaveBeenCalledOnce();

    act(() => initialOptions.onTargetSelect?.({
      kind: 'castle',
      castleId: 2,
      coord: { q: 2, r: -1 }
    }));
    expect(mocked.handles[0]!.focusCastle).toHaveBeenLastCalledWith(2);

    rerender(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.handles[1]!.focusCastle).toHaveBeenCalledWith(2);
    expect(mocked.handles[1]!.frameFoundingDistrict).not.toHaveBeenCalled();
  });

  it('keeps every direct label node stable across zoom and LOD projection frames', async () => {
    installWebGlProbe();
    const fixture = createRenderedWebglQaFixtureRealm();
    const renderRealm = (onRequestReturn: () => void) => (
      <RealmMapScreen
        identity={fixture.identity}
        snapshot={fixture.snapshot}
        onRequestReturn={onRequestReturn}
        presentationMode="observer"
        qualityOverride="high"
      />
    );
    const { rerender } = render(renderRealm(vi.fn()));
    const initialOptions = mocked.createRealmScene.mock.calls[0]![0];
    const projection = (distanceOffset: number, boundsOffset: number) => ({
      width: 120,
      height: 600,
      castles: fixture.snapshot.castles.map((castle, index) => ({
        castleId: castle.castleId,
        q: castle.q,
        r: castle.r,
        x: 60 + boundsOffset,
        y: 300 + boundsOffset,
        distance: distanceOffset + index,
        visible: true,
        presented: true,
        castleBounds: {
          left: 40 - boundsOffset,
          top: 250 - boundsOffset,
          right: 80 + boundsOffset,
          bottom: 294
        }
      }))
    });

    act(() => {
      initialOptions.onCastlesReady?.(fixture.snapshot.castles.length);
      initialOptions.onCastleProjection?.(projection(4, 0));
    });

    const initialButtons = await waitFor(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(
        'button.realm-castle-label[data-castle-id]'
      )];
      expect(buttons).toHaveLength(fixture.snapshot.castles.length);
      return new Map(buttons.map((button) => [Number(button.dataset.castleId), button]));
    });
    expect(document.querySelectorAll('[data-realm-castle-cluster]')).toHaveLength(0);

    act(() => initialOptions.onCastleProjection?.(projection(10_000, 8)));

    await waitFor(() => {
      const nextButtons = [...document.querySelectorAll<HTMLButtonElement>(
        'button.realm-castle-label[data-castle-id]'
      )];
      expect(nextButtons).toHaveLength(fixture.snapshot.castles.length);
      nextButtons.forEach((button) => {
        expect(button).toBe(initialButtons.get(Number(button.dataset.castleId)));
        expect(button.dataset.compact).toBe('true');
        expect(button.dataset.displaced).toBe('false');
      });
      expect(document.querySelectorAll('[data-realm-castle-cluster]')).toHaveLength(0);
      const realm = screen.getByRole('main', { name: 'Hegemony realm QA observer' });
      expect(realm.dataset.labelPlacedCount).toBe(String(fixture.snapshot.castles.length));
      expect(realm.dataset.labelUnplacedCount).toBe('0');
      expect(realm.dataset.labelClusteredCount).toBe('0');
      expect(realm.dataset.labelClusterOverflowCount).toBe('0');
      expect(realm.dataset.labelPersistence).toBe('foundation');
      const movedButton = initialButtons.get(fixture.snapshot.castles[0]!.castleId)!;
      expect(Number.parseFloat(
        movedButton.style.getPropertyValue('--realm-castle-label-x')
      )).toBe(68);
      expect(Number.parseFloat(
        movedButton.style.getPropertyValue('--realm-castle-label-y')
      )).toBe(308);
    });

    const movedButton = initialButtons.get(fixture.snapshot.castles[0]!.castleId)!;
    // Profile hydration and other unrelated parent updates can rerender the
    // Realm after camera motion has settled. React must consume the latest
    // projection instead of restoring the membership state's first position.
    rerender(renderRealm(vi.fn()));
    expect(Number.parseFloat(
      movedButton.style.getPropertyValue('--realm-castle-label-x')
    )).toBe(68);
    expect(Number.parseFloat(
      movedButton.style.getPropertyValue('--realm-castle-label-y')
    )).toBe(308);
  });

  it('keeps hover imperative and requires explicit castle activation for HUD/inspector state', () => {
    installWebGlProbe();
    const snapshot = createCanonicalGenesisSnapshot({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    const scene = mocked.handles[0]!;
    const options = mocked.createRealmScene.mock.calls[0]![0];
    expect(scene.setHovered).toHaveBeenCalledOnce();
    expect(scene.setHovered).toHaveBeenLastCalledWith(null);

    act(() => {
      options.onCastlesReady?.(2);
      options.onTargetHover?.({ kind: 'terrain', coord: { q: 1, r: 0 } });
      options.onTargetHover?.({ kind: 'terrain', coord: { q: 1, r: 0 } });
      options.onTargetHover?.({ kind: 'castle', castleId: 2, coord: { q: 2, r: -1 } });
    });

    expect(scene.setHovered).toHaveBeenCalledTimes(3);
    expect(scene.setHovered).toHaveBeenNthCalledWith(2, { q: 1, r: 0 });
    expect(scene.setHovered).toHaveBeenLastCalledWith({ q: 2, r: -1 });
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    act(() => {
      options.onTargetSelect?.({
        kind: 'castle',
        castleId: 2,
        coord: { q: 2, r: -1 }
      });
    });

    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).not.toBeNull();
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Peer Watch · q 2, r -1');
    expect(scene.setSelectedCastleId).toHaveBeenLastCalledWith(2);
    expect(scene.focusCastle).toHaveBeenLastCalledWith(2);
  });

  it('publishes only aggregate live instance and raycast telemetry on the realm root', () => {
    installWebGlProbe();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlePresentationTelemetry?.({
      presentedModelCount: 1,
      presentedLandscapeBaseCount: 1,
      raycastTargetCount: 1
    }));

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(realm.dataset.presentedModelCount).toBe('1');
    expect(realm.dataset.presentedLandscapeBaseCount).toBe('1');
    expect(realm.dataset.raycastTargetCount).toBe('1');
    expect(realm.outerHTML).not.toMatch(/(?:fid|token|proof|qr|identity)=/i);
  });

  it('keeps a neutral direct identity operable across full-realm camera changes', async () => {
    installWebGlProbe();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot({
          ownFid: CANONICAL_TEST_FID,
          peerFid: 77
        })}
        onRequestReturn={vi.fn()}
        presentationMode="observer"
        qualityOverride="balanced"
      />
    );
    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => {
      options.onCastlesReady?.(2);
      options.onTargetHover?.({
        kind: 'castle',
        castleId: 2,
        coord: { q: 2, r: -1 }
      });
      options.onCastleProjection?.({
        width: 1_440,
        height: 900,
        castles: [
          {
            castleId: 1,
            q: 0,
            r: 0,
            x: 460,
            y: 420,
            distance: 4,
            visible: true,
            presented: true
          },
          {
            castleId: 2,
            q: 2,
            r: -1,
            x: 980,
            y: 430,
            distance: 5,
            visible: true,
            presented: true
          }
        ]
      });
    });

    const pendingLabelName = /Inspect Hegemony Keep castle, Peer Watch, cell 2,-1/i;
    await waitFor(() => expect(screen.getByRole('button', {
      name: pendingLabelName
    }).dataset.focused).toBe('false'));

    const directLabel = screen.getByRole('button', { name: pendingLabelName });
    fireEvent.click(directLabel);
    expect(mocked.handles[0]!.focusCastle).toHaveBeenLastCalledWith(2);
    await waitFor(() => {
      const focusedLabels = document.querySelectorAll<HTMLButtonElement>(
        'button.realm-castle-label[data-focused="true"]'
      );
      expect(focusedLabels).toHaveLength(1);
      expect(focusedLabels[0]!.textContent?.trim().length).toBeGreaterThan(0);
      expect(focusedLabels[0]).toBe(directLabel);
    });

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE RECORD' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Full Realm' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: pendingLabelName })).toBe(directLabel);
      expect(document.querySelectorAll(
        'button.realm-castle-label[data-focused="true"]'
      )).toHaveLength(0);
      expect(document.querySelectorAll('button[data-realm-castle-cluster]')).toHaveLength(0);
    });
    expect(mocked.handles[0]!.showRealm).toHaveBeenCalled();
  });

  it('gates hidden map interaction while canonical castle presentation is loading', () => {
    installWebGlProbe();
    const onRequestReturn = vi.fn();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot({
          ownFid: CANONICAL_TEST_FID,
          peerFid: 77
        })}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    const options = mocked.createRealmScene.mock.calls[0]![0];
    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    act(() => {
      options.onTargetSelect?.({
        kind: 'castle',
        castleId: 2,
        coord: { q: 2, r: -1 }
      });
    });

    expect(screen.queryByLabelText('Current selection')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('coalesces 500 terrain, castle, and label pointer moves without UI churn', async () => {
    installWebGlProbe();
    const renderCommits = vi.fn();
    render(
      <Profiler id="realm-pointer-stress" onRender={renderCommits}>
        <RealmMapScreen
          identity={IDENTITY}
          snapshot={createCanonicalGenesisSnapshot({
            ownFid: CANONICAL_TEST_FID,
            peerFid: 77
          })}
          onRequestReturn={vi.fn()}
          qualityOverride="balanced"
        />
      </Profiler>
    );
    const scene = mocked.handles[0]!;
    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => {
      options.onCastlesReady?.(2);
      options.onCastleProjection?.({
        width: 1_440,
        height: 900,
        castles: [
          {
            castleId: 1,
            q: 0,
            r: 0,
            x: 480,
            y: 420,
            distance: 4,
            visible: true,
            presented: true
          },
          {
            castleId: 2,
            q: 2,
            r: -1,
            x: 960,
            y: 430,
            distance: 5,
            visible: true,
            presented: true
          }
        ]
      });
    });
    const label = await screen.findByRole('button', {
      name: /Inspect Hegemony Keep castle, Peer Watch, cell 2,-1/i
    });
    act(() => {
      options.onTargetHover?.({ kind: 'castle', castleId: 2, coord: { q: 2, r: -1 } });
    });
    expect(label.dataset.hovered).toBe('true');
    act(() => {
      options.onTargetHover?.({ kind: 'terrain', coord: { q: 1, r: 0 } });
    });
    expect(label.dataset.hovered).toBe('false');
    act(() => {
      options.onTargetHover?.({ kind: 'castle', castleId: 2, coord: { q: 2, r: -1 } });
    });
    expect(label.dataset.hovered).toBe('true');
    const commitsBeforeStress = renderCommits.mock.calls.length;
    const hoverCallsBeforeStress = scene.setHovered.mock.calls.length;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    act(() => {
      for (let index = 0; index < 500; index += 1) {
        if (index % 3 === 0) {
          options.onTargetHover?.({ kind: 'terrain', coord: { q: 1, r: 0 } });
        } else if (index % 3 === 1) {
          options.onTargetHover?.({
            kind: 'castle',
            castleId: 2,
            coord: { q: 2, r: -1 }
          });
        } else {
          label.dispatchEvent(new Event('pointermove', { bubbles: true }));
        }
      }
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(scene.setHovered).toHaveBeenCalledTimes(hoverCallsBeforeStress + 334);
    expect(mocked.createRealmScene).toHaveBeenCalledOnce();
    expect(renderCommits.mock.calls.length - commitsBeforeStress).toBeLessThanOrEqual(2);
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Warpkeeper Bastion · q 0, r 0');
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('focuses a validated navigator coordinate and returns keyboard focus to the map', () => {
    installWebGlProbe();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    const scene = mocked.handles[0]!;
    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlesReady?.(1));

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 1 founded castle'
    }));
    fireEvent.change(screen.getByRole('textbox', { name: 'q coordinate' }), {
      target: { value: '1' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'r coordinate' }), {
      target: { value: '0' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));

    expect(scene.focusCell).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Lowland Forest · q 1, r 0');
    expect(document.activeElement).toBe(screen.getByRole('main', { name: 'Hegemony realm' }));
  });

  it('activates a selected terrain cell from the keyboard without opening an inspector', () => {
    installWebGlProbe();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    const scene = mocked.handles[0]!;
    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlesReady?.(1));

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(fireEvent.keyDown(realm, { key: ' ' })).toBe(false);

    expect(scene.focusCell).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.getByLabelText('Current selection').textContent)
      .toContain('Lowland Forest · q 1, r 0');
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
  });
});
