import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const handles: Array<{
    dispose: ReturnType<typeof vi.fn>;
    frameFoundingDistrict: ReturnType<typeof vi.fn>;
    focusKeep: ReturnType<typeof vi.fn>;
    recenterKeep: ReturnType<typeof vi.fn>;
    setHovered: ReturnType<typeof vi.fn>;
    setSelected: ReturnType<typeof vi.fn>;
    showRealm: ReturnType<typeof vi.fn>;
  }> = [];
  const createRealmScene = vi.fn((_options: {
    keepCoord: { q: number; r: number };
    otherCastles: readonly { castleId: number; q: number; r: number }[];
    quality: { id: string };
    reducedMotion: boolean;
    onHover: (coord: { q: number; r: number } | null) => void;
  }) => {
    const handle = {
      dispose: vi.fn(),
      frameFoundingDistrict: vi.fn(),
      focusKeep: vi.fn(),
      recenterKeep: vi.fn(),
      setHovered: vi.fn(),
      setSelected: vi.fn(),
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

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';

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
  it('disposes one scene, keeps selection, and mounts the requested model tier', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    const identity = { fid: 12_345, username: 'warpkeeper' } as const;
    const { rerender } = render(
      <RealmMapScreen
        identity={identity}
        onRequestReturn={vi.fn()}
        qualityOverride="high"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[0][0].quality.id).toBe('high');

    const toggle = document.querySelector('details.realm-cell-navigator > summary');
    if (!(toggle instanceof HTMLElement)) throw new Error('missing Realm cell navigator');
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole('group', { name: 'Traversable realm cells' }))
      .getByRole('button', { name: 'Select cell 1,0' }));
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();

    rerender(
      <RealmMapScreen
        identity={identity}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1][0].quality.id).toBe('balanced');
    expect(mocked.handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.handles[1].setSelected).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
    expect(screen.getByText('QUALITY BALANCED')).not.toBeNull();
  });

  it('ignores snapshot identity churn but recreates for semantic castle movement', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    const identity = { fid: 12_345, username: 'warpkeeper' } as const;
    const onRequestReturn = vi.fn();
    const { rerender } = render(
      <RealmMapScreen
        identity={identity}
        ownCastle={{
          castleId: 1,
          ownerFid: identity.fid,
          q: 0,
          r: 0,
          level: 1,
          name: 'First Keep'
        }}
        otherCastles={[{
          castleId: 2,
          ownerFid: 77,
          q: -1,
          r: 1,
          level: 1,
          name: 'Peer Keep'
        }]}
        sharedPlayers={[{ fid: identity.fid, status: 'active' }]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[0][0]).toMatchObject({
      keepCoord: { q: 0, r: 0 },
      otherCastles: [{ castleId: 2, q: -1, r: 1 }]
    });
    expect(mocked.handles[0].frameFoundingDistrict).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Frame the nearby founding keeps' }));
    expect(mocked.handles[0].frameFoundingDistrict).toHaveBeenCalledTimes(2);

    rerender(
      <RealmMapScreen
        identity={identity}
        ownCastle={{
          castleId: 1,
          ownerFid: identity.fid,
          q: 0,
          r: 0,
          level: 2,
          name: 'Renamed Keep'
        }}
        otherCastles={[{
          castleId: 2,
          ownerFid: 77,
          q: -1,
          r: 1,
          level: 3,
          name: 'Renamed Peer'
        }]}
        sharedPlayers={[
          { fid: identity.fid, status: 'active' },
          { fid: 77, status: 'active' }
        ]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.handles[0].dispose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Renamed Keep' })).not.toBeNull();
    expect(screen.getByText('LEVEL 2')).not.toBeNull();

    rerender(
      <RealmMapScreen
        identity={identity}
        ownCastle={{
          castleId: 1,
          ownerFid: identity.fid,
          q: 0,
          r: 0,
          level: 2,
          name: 'Renamed Keep'
        }}
        otherCastles={[{
          castleId: 2,
          ownerFid: 77,
          q: -2,
          r: 1,
          level: 3,
          name: 'Renamed Peer'
        }]}
        sharedPlayers={[
          { fid: identity.fid, status: 'active' },
          { fid: 77, status: 'active' }
        ]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[1][0].otherCastles).toEqual([
      { castleId: 2, q: -2, r: 1 }
    ]);

    rerender(
      <RealmMapScreen
        identity={identity}
        ownCastle={{
          castleId: 1,
          ownerFid: identity.fid,
          q: 1,
          r: -1,
          level: 2,
          name: 'Renamed Keep'
        }}
        otherCastles={[{
          castleId: 2,
          ownerFid: 77,
          q: -2,
          r: 1,
          level: 3,
          name: 'Renamed Peer'
        }]}
        sharedPlayers={[
          { fid: identity.fid, status: 'active' },
          { fid: 77, status: 'active' }
        ]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(3);
    expect(mocked.handles[1].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[2][0].keepCoord).toEqual({ q: 1, r: -1 });
  });

  it('keeps renderer markers stable when subscription rows arrive in a different order', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    const identity = { fid: 12_345, username: 'warpkeeper' } as const;
    const onRequestReturn = vi.fn();
    const firstPeer = {
      castleId: 7,
      ownerFid: 77,
      q: 1,
      r: -1,
      level: 1,
      name: 'East Watch'
    } as const;
    const secondPeer = {
      castleId: 2,
      ownerFid: 88,
      q: -1,
      r: 1,
      level: 1,
      name: 'West Watch'
    } as const;
    const { rerender } = render(
      <RealmMapScreen
        identity={identity}
        otherCastles={[firstPeer, secondPeer]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[0][0].otherCastles).toEqual([
      { castleId: 2, q: -1, r: 1 },
      { castleId: 7, q: 1, r: -1 }
    ]);

    rerender(
      <RealmMapScreen
        identity={identity}
        otherCastles={[
          { ...secondPeer, level: 2, name: 'West Bastion' },
          { ...firstPeer, level: 2, name: 'East Bastion' }
        ]}
        onRequestReturn={onRequestReturn}
        qualityOverride="balanced"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.handles[0].dispose).not.toHaveBeenCalled();
  });

  it('rebuilds the scene when reduced-motion preference changes without refocusing the realm', () => {
    const motion = installMotionPreference();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    const { unmount } = render(
      <RealmMapScreen
        identity={{ fid: 12_345, username: 'warpkeeper' }}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[0][0].reducedMotion).toBe(false);

    const returnButton = screen.getByRole('button', { name: 'Return to Menu' });
    returnButton.focus();
    act(() => motion.set(true));

    expect(mocked.handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1][0].reducedMotion).toBe(true);
    expect(document.activeElement).toBe(returnButton);

    unmount();
    expect(motion.preference.removeEventListener).toHaveBeenCalledOnce();
  });

  it('does not re-upload the hover overlay while the pointer remains on one cell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    render(
      <RealmMapScreen
        identity={{ fid: 12_345, username: 'warpkeeper' }}
        onRequestReturn={vi.fn()}
      />
    );

    const scene = mocked.handles[0];
    const onHover = mocked.createRealmScene.mock.calls[0][0].onHover;
    expect(scene.setHovered).toHaveBeenCalledOnce();
    expect(scene.setHovered).toHaveBeenLastCalledWith(null);

    act(() => {
      onHover({ q: 1, r: 0 });
      onHover({ q: 1, r: 0 });
    });

    expect(scene.setHovered).toHaveBeenCalledTimes(2);
    expect(scene.setHovered).toHaveBeenLastCalledWith({ q: 1, r: 0 });
  });
});
