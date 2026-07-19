import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  type MockSceneOptions = {
    keepCoord: { q: number; r: number };
    otherCastles: readonly { castleId: number; q: number; r: number }[];
    terrainMetadata: readonly {
      tileKey: string;
      terrainKind: string;
      passable: boolean;
      movementCost: number;
      staticContentKind: string;
    }[];
    isCoordPassable?: (coord: { q: number; r: number }) => boolean;
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
      kind: 'castle' | 'terrain' | 'gold-site' | 'food-site' | 'wood-site' | 'stone-site';
      castleId?: number;
      siteId?: string;
      source?: 'site' | 'wagon';
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

import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
} from '../spacetimedb/src/waterRevision';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_V1,
  GENESIS_WATER_LAYOUT_V1
} from '../spacetimedb/src/waterWorld';
import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';
import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { ReadyFoodExpeditionPresentation } from '../src/components/realm/realmFoodExpeditionPresentation';
import { createRenderedWebglQaFixtureRealm } from '../src/dev/renderedWebglQaFixture';
import { validateCanonicalGenesisSnapshot } from '../src/spacetime/canonicalGenesisSnapshot';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepRealmSnapshotCandidate
} from '../src/spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';
import {
  CANONICAL_TEST_CASTLE_ID,
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

function openPlayerExplore() {
  const trigger = playerMenuTrigger();
  fireEvent.click(trigger);
  const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
  fireEvent.click(screen.getByRole('button', { name: /EXPLORE/i }));
  return { trigger, explore: screen.getByRole('dialog', { name: 'Explore' }), menu };
}

function validate(candidate: WarpkeepRealmSnapshotCandidate) {
  return validateCanonicalGenesisSnapshot(candidate, {
    ownFid: CANONICAL_TEST_FID,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  });
}

function waterRevisionRealm(activated: boolean) {
  return validate({
    ...createCanonicalGenesisCandidate(CANONICAL_TEST_FID),
    waterLayout: { ...GENESIS_WATER_LAYOUT_V1, activated: true },
    waterBodies: GENESIS_WATER_BODIES_V1.map((row) => ({ ...row })),
    waterCells: GENESIS_WATER_CELLS_V1.map((row) => ({ ...row })),
    realmEnvironment: { ...GENESIS_WATER_ENVIRONMENT_V1 },
    waterRevision: { ...CANONICAL_GENESIS_WATER_REVISION_V1, activated }
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
    profiles: candidate.profiles.map((profile) => (
      profile.fid === 77 ? {
        ...profile,
        canonicalUsername: 'peerkeeper',
        displayName: 'Peer Keeper',
        publicStatus: 'founding-player'
      } : profile
    ))
  });
}

function activeFoodWagonRealm() {
  const candidate = createCanonicalGenesisCandidate(CANONICAL_TEST_FID);
  const site = CANONICAL_TIER_I_FOOD_SITES_V1[0]!;
  const occupation = Object.freeze({
    siteId: site.siteId,
    originCastleId: CANONICAL_TEST_CASTLE_ID,
    phase: 'outbound' as const,
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 30n,
    returnsAtMicros: 40n
  });
  const snapshot = validate({
    ...candidate,
    foodSites: CANONICAL_TIER_I_FOOD_SITES_V1.map((row) => ({ ...row })),
    foodNodeOccupations: [occupation]
  });
  const expedition: ReadyFoodExpeditionPresentation = Object.freeze({
    status: 'ready',
    active: true,
    accruedFood: 0n,
    pendingFood: 0n,
    creditedFood: 0n,
    rateFoodPerMinute: 1n,
    gatheringDurationMicros: 2_592_000_000_000n,
    expedition: Object.freeze({
      expeditionId: '00000000-0000-4000-8000-000000000002',
      ...occupation,
      policyVersion: 'genesis-food-wheat-farm-expedition-v1'
    })
  });
  return { expedition, occupation, site, snapshot };
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
  it('defaults an unoverridden Realm view to high quality', () => {
    installWebGlProbe();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={createCanonicalGenesisSnapshot(CANONICAL_TEST_FID)}
        onRequestReturn={vi.fn()}
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledOnce();
    expect(mocked.createRealmScene.mock.calls[0]![0].quality.id).toBe('high');
  });

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

  it('keeps inactive Water v1 lakes blocked in scene and selection semantics', () => {
    installWebGlProbe();
    const snapshot = waterRevisionRealm(false);
    const lakeCell = GENESIS_WATER_CELLS_V1.find((cell) => (
      cell.cellKey === GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1[0]
    ))!;
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlesReady?.(1));
    expect(options.terrainMetadata.find((row) => row.tileKey === lakeCell.cellKey))
      .toMatchObject({
        terrainKind: 'lake',
        passable: false,
        movementCost: 0,
        staticContentKind: 'scenic-blocker'
      });
    expect(options.isCoordPassable?.(lakeCell)).toBe(false);

    const before = selectionAnnouncement().textContent;
    act(() => options.onTargetSelect?.({ kind: 'terrain', coord: lakeCell }));
    expect(selectionAnnouncement().textContent).toBe(before);
  });

  it('presents every active revision lake as selectable lowland to scene, HUD, and navigator', () => {
    installWebGlProbe();
    const snapshot = waterRevisionRealm(true);
    const reclaimedKeys = new Set(GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1);
    const lakeCell = GENESIS_WATER_CELLS_V1.find((cell) => (
      cell.cellKey === GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1[0]
    ))!;
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
    act(() => options.onCastlesReady?.(1));
    const reclaimedRows = options.terrainMetadata.filter((row) => (
      reclaimedKeys.has(row.tileKey)
    ));
    expect(reclaimedRows).toHaveLength(409);
    expect(reclaimedRows.every((row) => (
      row.terrainKind === 'lowland'
      && row.passable
      && row.movementCost === 1
      && row.staticContentKind === 'empty'
    ))).toBe(true);
    expect(options.isCoordPassable?.(lakeCell)).toBe(true);
    expect(snapshot.tileMetadata.find((row) => row.tileKey === lakeCell.cellKey))
      .toMatchObject({ terrainKind: 'lake', passable: false });

    act(() => options.onTargetSelect?.({ kind: 'terrain', coord: lakeCell }));
    expect(selectionAnnouncement().textContent).toContain(
      `Temperate Lowlands. Selected cell ${lakeCell.q}, ${lakeCell.r}`
    );

    openPlayerExplore();
    fireEvent.change(screen.getByRole('textbox', { name: 'q coordinate' }), {
      target: { value: String(lakeCell.q) }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'r coordinate' }), {
      target: { value: String(lakeCell.r) }
    });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(scene.focusCell).toHaveBeenLastCalledWith({ q: lakeCell.q, r: lakeCell.r });
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
    expect(selectionAnnouncement().textContent)
      .toContain('Lowland Forest. Selected cell 1, 0');

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
    expect(selectionAnnouncement().textContent)
      .toContain('Lowland Forest. Selected cell 1, 0');
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
    openPlayerExplore();
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

    const loadingReturn = screen.getByRole('button', { name: 'Return to Menu' });
    loadingReturn.focus();
    act(() => motion.set(true));

    expect(mocked.handles[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1]![0].reducedMotion).toBe(true);
    expect(document.activeElement).toBe(loadingReturn);

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
      width: 240,
      height: 600,
      castles: fixture.snapshot.castles.map((castle, index) => ({
        castleId: castle.castleId,
        q: castle.q,
        r: castle.r,
        x: 120 + boundsOffset,
        y: 300 + boundsOffset,
        distance: distanceOffset + index,
        visible: true,
        presented: true,
        castleBounds: {
          left: 100 - boundsOffset,
          top: 250 - boundsOffset,
          right: 140 + boundsOffset,
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
      )).toBe(128);
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
    )).toBe(128);
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
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();

    act(() => {
      options.onTargetSelect?.({
        kind: 'castle',
        castleId: 2,
        coord: { q: 2, r: -1 }
      });
    });

    expect(screen.getByRole('button', { name: 'CLOSE RECORD' })).not.toBeNull();
    expect(selectionAnnouncement().textContent)
      .toContain('Peer Watch. Selected castle at cell 2, -1');
    expect(scene.setSelectedCastleId).toHaveBeenLastCalledWith(2);
    expect(scene.focusCastle).toHaveBeenLastCalledWith(2);
  });

  it('links the private active-wagon shortcut and opens a clicked wagon without a camera jump', () => {
    installWebGlProbe();
    const fixture = activeFoodWagonRealm();
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={fixture.snapshot}
        foodExpedition={fixture.expedition}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    const scene = mocked.handles[0]!;
    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlesReady?.(1));

    fireEvent.click(playerMenuTrigger());
    const wagonGroup = screen.getByRole('group', { name: 'Expeditions' });
    const wagonButton = within(wagonGroup).getByRole('button', { name: /Food WAGON/i });
    expect(wagonButton.textContent).toContain('En route to site');
    fireEvent.click(wagonButton);
    expect(scene.focusCell).toHaveBeenLastCalledWith({ q: fixture.site.q, r: fixture.site.r });
    expect(screen.getByRole('dialog', { name: 'Wheat Farm' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE FOOD FARM RECORD' }));
    scene.focusCell.mockClear();
    act(() => options.onTargetSelect?.({
      kind: 'food-site',
      siteId: fixture.site.siteId,
      source: 'wagon',
      coord: { q: fixture.site.q, r: fixture.site.r }
    }));
    expect(screen.getByRole('dialog', { name: 'Wheat Farm' })).not.toBeNull();
    expect(scene.focusCell).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE FOOD FARM RECORD' }));
    act(() => options.onTargetSelect?.({
      kind: 'food-site',
      siteId: fixture.site.siteId,
      source: 'site',
      coord: { q: fixture.site.q, r: fixture.site.r }
    }));
    expect(scene.focusCell).toHaveBeenLastCalledWith({ q: fixture.site.q, r: fixture.site.r });
  });

  it('does not replay a static-site camera target after wagon selection and scene recreation', () => {
    installWebGlProbe();
    const fixture = activeFoodWagonRealm();
    const { rerender } = render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={fixture.snapshot}
        foodExpedition={fixture.expedition}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    const initialOptions = mocked.createRealmScene.mock.calls[0]![0];
    const initialScene = mocked.handles[0]!;
    act(() => {
      initialOptions.onCastlesReady?.(1);
      initialOptions.onTargetSelect?.({
        kind: 'food-site',
        siteId: fixture.site.siteId,
        source: 'wagon',
        coord: { q: fixture.site.q, r: fixture.site.r }
      });
    });
    expect(screen.getByRole('dialog', { name: 'Wheat Farm' })).not.toBeNull();
    expect(initialScene.focusCell).not.toHaveBeenCalled();

    rerender(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={fixture.snapshot}
        foodExpedition={fixture.expedition}
        onRequestReturn={vi.fn()}
        qualityOverride="high"
      />
    );

    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    act(() => mocked.createRealmScene.mock.calls[1]![0].onCastlesReady?.(1));
    expect(initialScene.dispose).toHaveBeenCalledOnce();
    expect(mocked.handles[1]!.focusCell).not.toHaveBeenCalled();
    expect(mocked.handles[1]!.showRealm).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Wheat Farm' })).not.toBeNull();
  });

  it('omits active-wagon shortcuts when the private projection does not exactly join public occupancy', () => {
    installWebGlProbe();
    const fixture = activeFoodWagonRealm();
    const mismatchedExpedition: ReadyFoodExpeditionPresentation = Object.freeze({
      ...fixture.expedition,
      expedition: Object.freeze({
        ...fixture.expedition.expedition!,
        phase: 'gathering'
      })
    });
    render(
      <RealmMapScreen
        identity={IDENTITY}
        snapshot={fixture.snapshot}
        foodExpedition={mismatchedExpedition}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );

    const options = mocked.createRealmScene.mock.calls[0]![0];
    act(() => options.onCastlesReady?.(1));
    fireEvent.click(playerMenuTrigger());
    expect(screen.queryByRole('group', { name: 'Active wagons' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Food WAGON/i })).toBeNull();
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

    expect(document.querySelector('.realm-player-chrome__selection-announcement')).toBeNull();
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
    expect(selectionAnnouncement().textContent)
      .toContain('Warpkeeper Bastion. Your keep is selected at cell 0, 0');
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

    openPlayerExplore();
    fireEvent.change(screen.getByRole('textbox', { name: 'q coordinate' }), {
      target: { value: '1' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'r coordinate' }), {
      target: { value: '0' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));

    expect(scene.focusCell).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    expect(selectionAnnouncement().textContent)
      .toContain('Lowland Forest. Selected cell 1, 0');
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
    expect(selectionAnnouncement().textContent)
      .toContain('Lowland Forest. Selected cell 1, 0');
    expect(screen.queryByRole('button', { name: 'CLOSE RECORD' })).toBeNull();
  });
});
