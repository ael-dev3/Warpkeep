import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  type MockSceneOptions = {
    keepCoord: { q: number; r: number };
    otherCastles: readonly { castleId: number; q: number; r: number }[];
    quality: { id: string };
    reducedMotion: boolean;
    onCastlesReady?: (castleCount: number) => void;
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
    expect(screen.getByText('Selected terrain · 1, 0')).not.toBeNull();

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
    expect(screen.getByText('Selected terrain · 1, 0')).not.toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /Realm Navigator\s+2/i }));
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
    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    act(() => {
      options.onTargetSelect?.({
        kind: 'castle',
        castleId: 2,
        coord: { q: 2, r: -1 }
      });
    });

    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).not.toBeNull();
    expect(screen.getByText('Peer Watch · 2, -1')).not.toBeNull();
    expect(scene.setSelectedCastleId).toHaveBeenLastCalledWith(2);
    expect(scene.focusCastle).toHaveBeenLastCalledWith(2);
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

    expect(screen.queryByText('Selected terrain · 0, 0')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledOnce();
  });

  it('keeps 500 pointer-move updates imperative without opening UI or changing selection', () => {
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

    act(() => {
      for (let index = 0; index < 500; index += 1) {
        options.onTargetHover?.({
          kind: 'terrain',
          coord: index % 2 === 0 ? { q: 1, r: 0 } : { q: 0, r: 1 }
        });
      }
    });

    expect(scene.setHovered).toHaveBeenCalledTimes(501);
    expect(screen.getByText('Selected terrain · 0, 0')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: /Realm Navigator\s+1/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'q coordinate' }), {
      target: { value: '1' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'r coordinate' }), {
      target: { value: '0' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));

    expect(scene.focusCell).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.queryByRole('dialog', { name: 'Realm Navigator' })).toBeNull();
    expect(screen.getByText('Selected terrain · 1, 0')).not.toBeNull();
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
    expect(screen.getByText('Selected terrain · 1, 0')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
  });
});
