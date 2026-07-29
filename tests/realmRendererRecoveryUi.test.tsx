import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { validateCanonicalGenesisSnapshot } from '../src/spacetime/canonicalGenesisSnapshot';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';
import {
  createRenderedWebglQaActiveWorkerRealm,
  createRenderedWebglQaFixtureRealm
} from '../src/dev/renderedWebglQaFixture';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import {
  createCanonicalGenesisCandidate,
  createCanonicalGenesisSnapshot,
  CANONICAL_TEST_FID
} from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

function sceneHandle() {
  const noOp = () => undefined;
  return {
    dispose: vi.fn(),
    setPresentationActive: vi.fn(),
    reconcileLiveGatheringState: noOp,
    getCameraAttestation: () => null,
    getSceneBuildSequence: () => 1,
    focusCastle: noOp,
    locateCastle: noOp,
    locateCell: vi.fn(),
    focusCell: vi.fn(),
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
    setSelectedWorkerId: noOp,
    setSelectedWaterCellKey: vi.fn(),
    setHoveredWaterCellKey: noOp,
    setHoveredWorkerId: noOp,
    setComposition: vi.fn(),
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

  it('never installs a handle disposed by synchronous scene construction failure', () => {
    const failedHandle = sceneHandle();
    sceneState.create.mockImplementationOnce((options: CreateRealmSceneOptions) => {
      options.onRendererFailure?.({
        code: 'scene-build-failed',
        retryable: true,
        phase: 'loading',
        message: 'Synthetic synchronous construction failure.'
      });
      // createRealmScene owns this disposal in its failure callback contract.
      failedHandle.dispose();
      return failedHandle;
    });
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
    expect(failedHandle.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(realm.getAttribute('data-renderer-state')).toBe('loading');
    expect(realm.getAttribute('data-realm-scene-disposal-count')).toBe('1');

    const failedOptions = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;
    act(() => failedOptions.onCastlesReady?.(snapshot.castles.length));
    expect(realm.getAttribute('data-renderer-state')).toBe('loading');
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
    const firstHandle = sceneState.create.mock.results[0]!.value as ReturnType<
      typeof sceneHandle
    >;

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
    expect(firstHandle.dispose).toHaveBeenCalledOnce();
    expect(realm.getAttribute('data-renderer-state')).toBe('loading');
    expect(realm.getAttribute('aria-busy')).toBe('true');

    const retryOptions = sceneState.create.mock.calls[1]![0] as CreateRealmSceneOptions;
    act(() => retryOptions.onRendererFailure?.({
      code: 'context-lost',
      retryable: true,
      phase: 'loading'
    }));
    expect(realm.getAttribute('data-renderer-state')).toBe('recovering');
    expect(realm.getAttribute('data-renderer-state')).not.toBe('ready');
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

  it('opens river and ocean records without invoking a camera focus', () => {
    const fixture = createRenderedWebglQaFixtureRealm();
    render(
      <RealmMapScreen
        identity={fixture.identity}
        snapshot={fixture.snapshot}
        onRequestReturn={vi.fn()}
        resources={createReadyResourceState(fixture.identity.fid)}
      />
    );
    const options = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;
    const handle = sceneState.create.mock.results[0]!.value as ReturnType<typeof sceneHandle>;
    act(() => options.onCastlesReady?.(fixture.snapshot.castles.length));
    const realm = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(realm.getAttribute('data-water-navigation-status')).toBe('exact');
    expect(realm.getAttribute('data-water-navigation-node-count')).toBe('1852');
    expect(realm.getAttribute('data-water-navigation-river-node-count')).toBe('400');
    expect(realm.getAttribute('data-water-navigation-ocean-node-count')).toBe('1452');
    expect(realm.getAttribute('data-water-navigation-issue-count')).toBe('0');

    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river'
    )!;
    const ocean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'ocean' && cell.fogBand !== 'full'
    )!;
    for (const [cell, regime] of [[river, 'river'], [ocean, 'ocean']] as const) {
      act(() => options.onTargetSelect?.({
        kind: 'water-cell',
        cellKey: cell.cellKey,
        bodyId: cell.bodyId,
        regime,
        coord: { q: cell.q, r: cell.r }
      }));
      const record = document.querySelector<HTMLElement>(
        '.water-inspection.realm-camera-neutral-inspector'
      );
      expect(record).not.toBeNull();
      expect(record?.dataset.waterRegime).toBe(regime);
      expect(record?.hasAttribute('data-water-cell-key')).toBe(false);
    }

    expect(handle.focusCell).not.toHaveBeenCalled();
    expect(handle.locateCell).not.toHaveBeenCalled();
    expect(handle.setSelectedWaterCellKey).toHaveBeenLastCalledWith(ocean.cellKey);
  });

  it('moves between river records camera-neutrally and locates only on explicit Focus Cell', () => {
    const fixture = createRenderedWebglQaFixtureRealm();
    render(
      <RealmMapScreen
        identity={fixture.identity}
        snapshot={fixture.snapshot}
        onRequestReturn={vi.fn()}
        resources={createReadyResourceState(fixture.identity.fid)}
      />
    );
    const options = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;
    const handle = sceneState.create.mock.results[0]!.value as ReturnType<typeof sceneHandle>;
    act(() => options.onCastlesReady?.(fixture.snapshot.castles.length));
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river' && cell.downstreamWaterCellKey
    )!;

    act(() => options.onTargetSelect?.({
      kind: 'water-cell',
      cellKey: river.cellKey,
      bodyId: river.bodyId,
      regime: 'river',
      coord: { q: river.q, r: river.r }
    }));
    const cameraTargetBeforeRecordNavigation = screen
      .getByRole('main', { name: 'Hegemony realm' })
      .getAttribute('data-realm-camera-target-kind');
    fireEvent.click(screen.getByRole('button', {
      name: 'Next downstream river cell'
    }));

    expect(handle.locateCell).not.toHaveBeenCalled();
    expect(handle.focusCell).not.toHaveBeenCalled();
    expect(handle.setSelectedWaterCellKey)
      .toHaveBeenLastCalledWith(river.downstreamWaterCellKey);
    expect(screen.getByRole('main', { name: 'Hegemony realm' })
      .getAttribute('data-realm-camera-target-kind'))
      .toBe(cameraTargetBeforeRecordNavigation);

    fireEvent.click(screen.getByRole('button', {
      name: 'Focus river cell on map'
    }));
    const downstream = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.cellKey === river.downstreamWaterCellKey
    )!;
    expect(handle.locateCell).toHaveBeenCalledExactlyOnceWith({
      q: downstream.q,
      r: downstream.r
    });
    expect(screen.getByRole('main', { name: 'Hegemony realm' })
      .getAttribute('data-realm-camera-target-kind')).toBe('cell-location');
  });

  it('opens every static resource record without invoking a camera focus', async () => {
    const base = validateCanonicalGenesisSnapshot({
      ...createCanonicalGenesisCandidate(CANONICAL_TEST_FID),
      goldSites: CANONICAL_TIER_I_GOLD_SITES_V1,
      goldNodeOccupations: [],
      foodSites: CANONICAL_TIER_I_FOOD_SITES_V1,
      foodNodeOccupations: [],
      woodSites: CANONICAL_TIER_I_WOOD_SITES_V1,
      woodNodeOccupations: [],
      stoneSites: CANONICAL_TIER_I_STONE_SITES_V1,
      stoneNodeOccupations: []
    }, {
      ownFid: CANONICAL_TEST_FID,
      protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    });
    render(
      <RealmMapScreen
        identity={{ fid: CANONICAL_TEST_FID, username: 'warpkeeper' }}
        snapshot={base}
        onRequestReturn={vi.fn()}
        resources={createReadyResourceState(CANONICAL_TEST_FID)}
      />
    );
    await waitFor(() => expect(sceneState.create).toHaveBeenCalledOnce());
    const options = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;
    const handle = sceneState.create.mock.results[0]!.value as ReturnType<typeof sceneHandle>;
    act(() => options.onCastlesReady?.(base.castles.length));
    await waitFor(() => expect(handle.setComposition).toHaveBeenCalled());
    const stableComposition = handle.setComposition.mock.calls.at(-1)?.[0];
    const stableCompositionCallCount = handle.setComposition.mock.calls.length;

    const goldNode = options.goldNodes?.[0];
    const foodNode = options.foodNodes?.[0];
    const woodNode = options.woodNodes?.[0];
    const stoneNode = options.stoneNodes?.[0];
    if (!goldNode || !foodNode || !woodNode || !stoneNode) {
      throw new Error('missing camera-neutral resource fixture');
    }
    const records = [
      { kind: 'gold-site' as const, node: goldNode, selector: '.gold-mine-inspection' },
      { kind: 'food-site' as const, node: foodNode, selector: '.food-farm-inspection' },
      { kind: 'wood-site' as const, node: woodNode, selector: '.logging-camp-inspection' },
      { kind: 'stone-site' as const, node: stoneNode, selector: '.stone-quarry-inspection' }
    ];
    for (const [index, record] of records.entries()) {
      act(() => options.onTargetSelect?.({
        kind: record.kind,
        siteId: record.node.siteId,
        source: 'site',
        coord: record.node.coord
      }));
      expect(document.querySelector(record.selector)).not.toBeNull();
      expect(document.querySelector(`${record.selector}.realm-camera-neutral-inspector`))
        .not.toBeNull();
      if (index === 0) {
        await waitFor(() => {
          expect(handle.setComposition.mock.calls.length)
            .toBeGreaterThan(stableCompositionCallCount);
        });
        expect(handle.setComposition.mock.calls.at(-1)?.[0]).toBe(stableComposition);
      }
    }

    expect(handle.focusCell).not.toHaveBeenCalled();
  });

  it('opens a worker record through the same camera-neutral entity contract', () => {
    const fixture = createRenderedWebglQaActiveWorkerRealm();
    const { snapshot } = fixture;
    const worker = fixture.workerProjection.ownedWorkers.find(
      (candidate) => candidate.status === 'idle'
    );
    if (!worker) throw new Error('missing idle public worker fixture');
    render(
      <RealmMapScreen
        identity={fixture.identity}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        resources={createReadyResourceState(fixture.identity.fid)}
      />
    );
    const options = sceneState.create.mock.calls[0]![0] as CreateRealmSceneOptions;
    const handle = sceneState.create.mock.results[0]!.value as ReturnType<typeof sceneHandle>;
    const workerCoord = options.workers?.[0]?.originCoord;
    if (!workerCoord) throw new Error('missing camera-neutral worker fixture');
    act(() => {
      options.onCastlesReady?.(snapshot.castles.length);
      options.onTargetSelect?.({
        kind: 'worker',
        workerId: worker.workerId,
        workerOrdinal: worker.ordinal,
        originCastleId: worker.originCastleId,
        coord: workerCoord
      });
    });

    expect(document.querySelector('.worker-inspection.realm-camera-neutral-inspector'))
      .not.toBeNull();
    expect(handle.focusCell).not.toHaveBeenCalled();
  });
});
