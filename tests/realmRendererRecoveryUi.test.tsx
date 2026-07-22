import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sceneState = vi.hoisted(() => ({
  create: vi.fn(),
  webglAvailable: true
}));

vi.mock('../src/components/realm/createRealmScene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/createRealmScene')>();
  return { ...actual, createRealmScene: sceneState.create };
});

vi.mock('../src/components/realm/realmMapPresentationHelpers', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/realmMapPresentationHelpers')
  >();
  return { ...actual, canUseWebGL: () => sceneState.webglAvailable };
});

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { CreateRealmSceneOptions } from '../src/components/realm/createRealmScene';
import { createCanonicalGenesisSnapshot, CANONICAL_TEST_FID } from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

function sceneHandle() {
  const noOp = () => undefined;
  return {
    dispose: vi.fn(),
    reconcileLiveGatheringState: noOp,
    getCameraAttestation: () => null,
    getSceneBuildSequence: () => 1,
    focusCastle: noOp,
    focusCell: noOp,
    frameFoundingDistrict: noOp,
    focusKeep: noOp,
    recenterKeep: noOp,
    setHovered: noOp,
    setPresentedCastleIds: noOp,
    setSelected: noOp,
    setSelectedCastleId: noOp,
    setSelectedGoldSiteId: noOp,
    setSelectedFoodSiteId: noOp,
    setSelectedWoodSiteId: noOp,
    setSelectedStoneSiteId: noOp,
    setComposition: noOp,
    showRealm: noOp
  };
}

describe('Realm renderer recovery UI', () => {
  beforeEach(() => {
    sceneState.create.mockReset();
    sceneState.create.mockImplementation(() => sceneHandle());
    sceneState.webglAvailable = true;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers a functional manual retry after context restoration times out', () => {
    vi.useFakeTimers();
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const onRequestReturn = vi.fn();
    render(
      <RealmMapScreen
        identity={{ fid: CANONICAL_TEST_FID, username: 'warpkeeper' }}
        snapshot={snapshot}
        onRequestReturn={onRequestReturn}
        resources={createReadyResourceState(CANONICAL_TEST_FID)}
      />
    );
    expect(sceneState.create).toHaveBeenCalledOnce();
    const firstOptions = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;

    act(() => firstOptions.onCastlesReady?.(snapshot.castles.length));
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(realm.getAttribute('data-renderer-state')).toBe('ready');
    expect(realm.getAttribute('aria-busy')).toBe('false');

    act(() => firstOptions.onRendererFailure?.({
      code: 'context-lost',
      retryable: true,
      phase: 'ready'
    }));
    expect(screen.getByRole('status').textContent).toMatch(/RESTORING THE REALM/i);
    expect(realm.getAttribute('aria-busy')).toBe('true');
    act(() => firstOptions.onCastleLodChange?.('high'));
    expect(realm.getAttribute('data-renderer-state')).toBe('recovering');

    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole('alert').textContent).toMatch(/THE REALM COULD NOT BE RESTORED/i);
    expect(realm.getAttribute('aria-busy')).toBe('false');
    const retry = screen.getByRole('button', { name: 'Retry 3D Realm' });
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledOnce();

    fireEvent.click(retry);
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(realm.getAttribute('data-renderer-state')).toBe('loading');
    expect(realm.getAttribute('aria-busy')).toBe('true');
  });

  it('lets a transient negative WebGL probe recover through explicit retry', () => {
    sceneState.webglAvailable = false;
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    render(
      <RealmMapScreen
        identity={{ fid: CANONICAL_TEST_FID, username: 'warpkeeper' }}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        resources={createReadyResourceState(CANONICAL_TEST_FID)}
      />
    );

    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(realm.getAttribute('data-renderer-state')).toBe('static-unsupported');
    expect(realm.getAttribute('aria-busy')).toBe('false');
    expect(sceneState.create).not.toHaveBeenCalled();

    sceneState.webglAvailable = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry 3D Realm' }));
    expect(sceneState.create).toHaveBeenCalledOnce();
    expect(realm.getAttribute('data-renderer-state')).toBe('loading');
    expect(realm.getAttribute('aria-busy')).toBe('true');
  });
});
