import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webglState = vi.hoisted(() => ({
  failGrassShaderContractOnce: false,
  failAfterGrassShaderFallbackOnce: false,
  failGenericRenderOnce: false,
  instances: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
  }>
}));

const keepLoadState = vi.hoisted(() => ({
  load: vi.fn((_options?: unknown) => new Promise<unknown>(() => undefined))
}));

const environmentState = vi.hoisted(() => ({ failNext: false }));

const grassLayerState = vi.hoisted(() => ({ failNextCreation: false }));
const waterLayerState = vi.hoisted(() => ({ failNextCreation: false }));

const ambientSchedulerState = vi.hoisted(() => ({
  creations: [] as Array<{
    active: boolean | undefined;
    frameCap: number;
    isActive: () => boolean;
    step: (elapsedSeconds: number) => void;
  }>
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class WebGLRenderer {
    capabilities = { getMaxAnisotropy: () => 1 };
    dispose = vi.fn();
    outputColorSpace = '';
    render = vi.fn(() => {
      if (webglState.failGenericRenderOnce) {
        webglState.failGenericRenderOnce = false;
        throw new Error('synthetic renderer failure');
      }
      if (!webglState.failGrassShaderContractOnce) return;
      webglState.failGrassShaderContractOnce = false;
      if (webglState.failAfterGrassShaderFallbackOnce) {
        webglState.failAfterGrassShaderFallbackOnce = false;
        webglState.failGenericRenderOnce = true;
      }
      throw new Error('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
    });
    setClearColor = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;

    constructor() {
      webglState.instances.push(this);
    }
  }

  return { ...actual, WebGLRenderer };
});

vi.mock('../src/components/realm/loadHegemonyCastleAssembly', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/loadHegemonyCastleAssembly')
  >();
  return { ...actual, loadHegemonyCastleAssembly: keepLoadState.load };
});

vi.mock('../src/components/realm/createRealmEnvironment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/createRealmEnvironment')>();
  return {
    ...actual,
    createRealmEnvironmentDepth: (...args: Parameters<typeof actual.createRealmEnvironmentDepth>) => {
      if (environmentState.failNext) {
        environmentState.failNext = false;
        throw new Error('synthetic environment allocation failure');
      }
      return actual.createRealmEnvironmentDepth(...args);
    }
  };
});

vi.mock('../src/components/realm/createRealmGrassLayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/createRealmGrassLayer')>();
  return {
    ...actual,
    createRealmGrassLayer: (...args: Parameters<typeof actual.createRealmGrassLayer>) => {
      if (grassLayerState.failNextCreation) {
        grassLayerState.failNextCreation = false;
        throw new Error('synthetic grass allocation failure');
      }
      return actual.createRealmGrassLayer(...args);
    }
  };
});

vi.mock('../src/components/realm/realmWaterLayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/realmWaterLayer')>();
  return {
    ...actual,
    createRealmWaterLayer: (...args: Parameters<typeof actual.createRealmWaterLayer>) => {
      if (waterLayerState.failNextCreation) {
        waterLayerState.failNextCreation = false;
        throw new Error('synthetic water allocation failure');
      }
      return actual.createRealmWaterLayer(...args);
    }
  };
});

vi.mock('../src/components/realm/realmAmbientScheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/realmAmbientScheduler')>();
  return {
    ...actual,
    createRealmAmbientScheduler: (
      options: Parameters<typeof actual.createRealmAmbientScheduler>[0]
    ) => {
      const scheduler = actual.createRealmAmbientScheduler(options);
      const record = {
        active: options.active,
        frameCap: options.frameCap,
        isActive: scheduler.isActive,
        step: options.onStep
      };
      ambientSchedulerState.creations.push(record);
      return Object.freeze({
        ...scheduler,
        setActive: (active: boolean) => {
          record.active = active;
          scheduler.setActive(active);
        },
        setFrameCap: (frameCap: number) => {
          record.frameCap = frameCap;
          scheduler.setFrameCap(frameCap);
        }
      });
    }
  };
});

vi.mock('../src/components/realm/loadHegemonyExpeditionAssets', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/loadHegemonyExpeditionAssets')
  >();
  return {
    ...actual,
    acquireHegemonyExpeditionPrefab: vi.fn(() => new Promise<never>(() => undefined))
  };
});

import {
  createRealmScene as createInactiveRealmScene,
  REALM_CASTLE_READABILITY_LIGHTING,
  resolveRealmViewportSize,
  resolveRealmPinchGesture,
  type CreateRealmSceneOptions
} from '../src/components/realm/createRealmScene';
import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import {
  createAuthoritativeRealmTerrainSurface,
  createRealmTerrainSurface
} from '../src/game/map/realmTerrainSurface';
import { DEFAULT_REALM_CAMERA_SPEC } from '../src/components/realm/realmCameraController';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import type { RealmWorkerSceneRecord } from '../src/components/realm/realmWorkerLayer';
import {
  REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS
} from '../src/components/realm/realmWorkerLayer';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

type ListenerSpy = ReturnType<typeof vi.spyOn>;

/**
 * Most direct scene tests model the currently presented canvas. Production
 * activates presentation explicitly after construction; mirror that boundary
 * here while replacement-scene tests can mark their slot inactive first.
 */
function createRealmScene(options: CreateRealmSceneOptions) {
  const scene = createInactiveRealmScene(options);
  if (options.canvas.dataset.realmCanvasActive !== 'false') {
    scene.setPresentationActive(true);
  }
  return scene;
}

function listenerCalls(spy: ListenerSpy, eventName: string) {
  return spy.mock.calls.filter((call: unknown[]) => call[0] === eventName).length;
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  input: Readonly<{
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: string;
    button?: number;
    buttons?: number;
  }>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: input.pointerId },
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    pointerType: { value: input.pointerType ?? 'mouse' },
    button: { value: input.button ?? 0 },
    buttons: { value: input.buttons ?? (type === 'pointerup' ? 0 : 1) }
  });
  target.dispatchEvent(event);
  return event;
}

function createOptions(
  canvas: HTMLCanvasElement,
  overrides: Partial<CreateRealmSceneOptions> = {}
): CreateRealmSceneOptions {
  const surface = overrides.surface
    ?? createRealmTerrainSurface('realm-scene-cleanup', 0, 0);
  return {
    canvas,
    surface,
    keepCoord: { q: 0, r: 0 },
    ownCastleId: 1,
    otherCastles: [],
    // Direct scene tests opt into the retired preview explicitly. Production
    // player scenes never synthesize a forest while shared rows are absent.
    allowLegacyForestFallback: true,
    terrainMetadata: surface.playableMap.cells.map((cell) => ({
      tileKey: hexKey(cell.coord),
      terrainKind: 'lowland',
      staticContentKind: cell.coord.q === 0 && cell.coord.r === 0
        ? 'castle-slot'
        : 'empty'
    })),
    quality: REALM_QUALITY_SPECS.reduced,
    reducedMotion: false,
    baseUrl: '/',
    onCameraModeChange: vi.fn(),
    onHover: vi.fn(),
    onKeepStatusChange: vi.fn(),
    onCastleProjection: vi.fn(),
    onRendererUnavailable: vi.fn(),
    onSelect: vi.fn(),
    ...overrides
  };
}

function loadedCastleAssembly(root: THREE.Group, suffix = 'compact') {
  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.18, 1.7),
    new THREE.MeshBasicMaterial()
  );
  baseMesh.name = `landscape-base-${suffix}`;
  baseMesh.userData.warpkeepPrefabRole = 'landscape-base';
  root.add(baseMesh);
  return {
    root,
    visualHeight: 1,
    footprintDiameter: 1,
    assetUrl: `/castle-${suffix}.glb`,
    landscapeBaseAssetUrl: `/castle-landscape-base-${suffix}.glb`
  };
}

function movingResourceNode(siteId: string) {
  return Object.freeze({
    siteId,
    coord: Object.freeze({ q: 1, r: 0 }),
    tier: 1,
    availability: 'outbound' as const,
    occupation: Object.freeze({
      siteId,
      originCastleId: 1,
      phase: 'outbound' as const,
      startedAtMicros: 0n,
      arrivesAtMicros: 60_000_000n,
      gatheringEndsAtMicros: 120_000_000n,
      returnsAtMicros: 180_000_000n
    }),
    originCastle: Object.freeze({
      castleId: 1,
      name: 'Hegemony Keep 001',
      q: 0,
      r: 0
    }),
    occupiedByViewer: true
  });
}

function idleWorkerRecord(revision = 0n): RealmWorkerSceneRecord {
  return Object.freeze({
    workerId: 'genesis-001-castle-1-worker-01',
    ordinal: 1,
    originCastleId: 1,
    originCastleName: 'Hegemony Keep 001',
    status: 'idle',
    timelineRevision: Number(revision),
    revision,
    ownedByViewer: true,
    originCoord: Object.freeze({ q: 0, r: 0 })
  });
}

function outboundWorkerRecord(
  index = 0,
  overrides: Partial<RealmWorkerSceneRecord> = {}
): RealmWorkerSceneRecord {
  const originCastleId = Math.floor(index / 4) + 1;
  const ordinal = (index % 4) + 1 as 1 | 2 | 3 | 4;
  return Object.freeze({
    workerId: `genesis-001-castle-${originCastleId}-worker-${String(ordinal).padStart(2, '0')}`,
    ordinal,
    originCastleId,
    originCastleName: `Hegemony Keep ${String(originCastleId).padStart(3, '0')}`,
    status: 'outbound',
    resourceKind: 'wood',
    siteId: `genesis-001:wood:${String(index + 1).padStart(4, '0')}`,
    startedAtMicros: 100_000n,
    arrivesAtMicros: 300_000n,
    gatheringEndsAtMicros: 600_000n,
    returnsAtMicros: 800_000n,
    routeSteps: 2,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: originCastleId === 1,
    originCoord: Object.freeze({ q: 0, r: 0 }),
    destinationCoord: Object.freeze({ q: 2, r: -1 }),
    ...overrides
  });
}

function installManualWindowTimers() {
  let nextTimerId = 40;
  const timers = new Map<number, Readonly<{
    callback: () => void;
    delayMilliseconds: number;
  }>>();
  const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(((
    handler: TimerHandler,
    timeout?: number
  ) => {
    const timerId = nextTimerId;
    nextTimerId += 1;
    if (typeof handler !== 'function') throw new Error('Unexpected string timer.');
    timers.set(timerId, Object.freeze({
      callback: () => handler(),
      delayMilliseconds: Number(timeout ?? 0)
    }));
    return timerId;
  }) as typeof window.setTimeout);
  const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(((
    timerId?: number
  ) => {
    if (timerId !== undefined) timers.delete(Number(timerId));
  }) as typeof window.clearTimeout);
  return Object.freeze({
    timers,
    setTimeoutSpy,
    clearTimeoutSpy
  });
}

describe('realm scene setup cleanup', () => {
  const resizeObservers: Array<{
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    webglState.failGrassShaderContractOnce = false;
    webglState.failAfterGrassShaderFallbackOnce = false;
    webglState.failGenericRenderOnce = false;
    webglState.instances.length = 0;
    keepLoadState.load.mockReset();
    keepLoadState.load.mockImplementation(() => new Promise<unknown>(() => undefined));
    environmentState.failNext = false;
    grassLayerState.failNextCreation = false;
    waterLayerState.failNextCreation = false;
    ambientSchedulerState.creations.length = 0;
    resizeObservers.length = 0;
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();

      constructor() {
        resizeObservers.push(this);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves a stable two-pointer centroid and separation', () => {
    expect(resolveRealmPinchGesture(new Map([
      [1, { x: 40, y: 80 }],
      [2, { x: 100, y: 120 }]
    ]))).toEqual({
      centroid: { x: 70, y: 100 },
      distance: Math.hypot(60, 40)
    });
    expect(resolveRealmPinchGesture(new Map([[1, { x: 40, y: 80 }]]))).toBeNull();
  });

  it('uses Safari\'s smaller visible viewport when a fixed canvas still spans the layout viewport', () => {
    expect(resolveRealmViewportSize({
      canvasWidth: 1_024,
      canvasHeight: 900,
      visualViewportWidth: 390,
      visualViewportHeight: 500,
      innerWidth: 1_024,
      innerHeight: 900
    })).toEqual({ width: 390, height: 500 });
    expect(resolveRealmViewportSize({
      canvasWidth: 0,
      canvasHeight: 0,
      visualViewportWidth: 390,
      visualViewportHeight: 844,
      innerWidth: 1_024,
      innerHeight: 900
    })).toEqual({ width: 390, height: 844 });
  });

  it('does not retain the removed CPU-decoration timer in any grass quality mode', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const surface = createRealmTerrainSurface('realm-ambient-gating', 4, 5);

    const reduced = createRealmScene(createOptions(document.createElement('canvas'), {
      surface,
      quality: REALM_QUALITY_SPECS.reduced
    }));
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    reduced.dispose();

    const reducedMotion = createRealmScene(createOptions(document.createElement('canvas'), {
      surface,
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true
    }));
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    reducedMotion.dispose();

    const animated = createRealmScene(createOptions(document.createElement('canvas'), {
      surface,
      quality: REALM_QUALITY_SPECS.balanced,
      reducedMotion: false
    }));
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    animated.dispose();
  });

  it('rejects and disposes a scene whose required Water layer cannot construct', () => {
    waterLayerState.failNextCreation = true;
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();

    expect(() => createRealmScene(createOptions(canvas, {
      waterCells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      reducedMotion: true,
      onCastlesReady
    }))).toThrow('synthetic water allocation failure');
    const renderer = webglState.instances[0]!;
    expect(canvas.dataset.waterPresentation).toBe('unavailable');
    expect(onCastlesReady).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('renders the procedural environment centred on the active camera', () => {
    const canvas = document.createElement('canvas');
    const onCastlePresentationTelemetry = vi.fn();
    const onTerrainPresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onCastlePresentationTelemetry,
      onTerrainPresentationTelemetry
    }));
    const renderCall = webglState.instances[0].render.mock.calls.at(-1);
    const renderedScene = renderCall?.[0] as THREE.Scene;
    const camera = renderCall?.[1] as THREE.PerspectiveCamera;
    const environment = renderedScene.getObjectByName('realm-environment-depth');

    expect(environment).toBeTruthy();
    expect(environment?.position.equals(camera.position)).toBe(true);
    expect(renderedScene.environment).toBeInstanceOf(THREE.Texture);
    expect(renderedScene.environmentIntensity).toBeGreaterThanOrEqual(0.25);
    expect(renderedScene.environmentIntensity).toBeLessThanOrEqual(0.4);
    expect(canvas.dataset.environmentLighting).toBe('procedural');
    expect(onCastlePresentationTelemetry).toHaveBeenCalledWith({
      presentedModelCount: 0,
      presentedLandscapeBaseCount: 0,
      raycastTargetCount: 0
    });
    expect(onTerrainPresentationTelemetry).toHaveBeenCalledWith({
      terrainTriangleCount: 54,
      terrainTriangleBudget: 94_000,
      terrainDetailRadius: 0,
      highDetailTerrainCellCount: 1,
      coarseTerrainCellCount: 0,
      terrainTransitionEdgeCount: 0,
      terrainSlopeCueMin: expect.any(Number),
      terrainSlopeCueMax: expect.any(Number),
      terrainConcavityCueMin: expect.any(Number),
      terrainConcavityCueMax: expect.any(Number),
      terrainVegetationCueMin: expect.any(Number),
      terrainVegetationCueMax: expect.any(Number),
      terrainWetnessCueMin: expect.any(Number),
      terrainWetnessCueMax: expect.any(Number),
      terrainRiverBankVertexCount: expect.any(Number),
      terrainRiverBankInfluenceMax: expect.any(Number),
      terrainShaderEnhanced: false,
      terrainShaderFallbackActive: false,
      terrainShaderCompileAttemptCount: 0,
      snowFieldRevision: 'genesis-001-northern-snow-presentation-v1',
      snowPreRetentionCellCountAbove015: expect.any(Number),
      snowPreRetentionDeepCellCountAbove075: expect.any(Number),
      snowPreRetentionCoverageRatio: expect.any(Number),
      snowPreRetentionDeepCoverageRatio: expect.any(Number),
      snowInnerRadiusLeakCount: expect.any(Number),
      snowSouthernLeakCount: 0,
      snowVertexCoverageMin: expect.any(Number),
      snowVertexCoverageMax: expect.any(Number),
      snowVertexCoverageMean: expect.any(Number),
      snowAttributeBytes: 148,
      snowSampledPlayableLandCellCenterCount: 1,
      snowRetainedCellCenterCountAbove015: expect.any(Number),
      snowRetainedDeepCellCenterCountAbove075: expect.any(Number),
      snowRetainedCellCenterCoverageRatio: expect.any(Number),
      snowRetainedDeepCellCenterCoverageRatio: expect.any(Number),
      snowRetainedCellCenterCoverageMean: expect.any(Number),
      snowRetainedCellCenterInnerRadiusLeakCount: expect.any(Number),
      snowRetainedCellCenterSouthernLeakCount: 0,
      snowRetainedNorthernmostRowCoverageMean: expect.any(Number),
      snowFineReliefMode: 'none',
      snowShaderEnhanced: false,
      snowShaderFallbackActive: false,
      southernDesertFieldRevision: 'genesis-001-southern-desert-presentation-v1',
      desertClimateCellCountAbove015: expect.any(Number),
      desertDeepCellCountAbove075: expect.any(Number),
      desertPlayableCoverageRatio: expect.any(Number),
      desertDeepCoverageRatio: expect.any(Number),
      desertInnerRadiusLeakCount: expect.any(Number),
      desertNorthernLeakCount: expect.any(Number),
      desertSampledPlayableLandCellCenterCount: expect.any(Number),
      desertCellCenterCoverageMean: expect.any(Number),
      desertSouthernmostRowCoverageMean: expect.any(Number),
      sandVertexCoverageMin: expect.any(Number),
      sandVertexCoverageMax: expect.any(Number),
      sandVertexCoverageMean: expect.any(Number),
      sandAttributeBytes: 148,
      sandFineReliefMode: 'none',
      sandShaderEnhanced: false,
      sandShaderFallbackActive: false,
      sandSnowOverlapCellCount: 0,
      sandSnowOverlapVertexCount: 0,
      semanticCellCount: 1,
      semanticKindCount: 1,
      semanticFeatureCount: 0,
      semanticFeatureDrawCalls: 0,
      semanticFeatureCounts: {
        'forest-tree': 0,
        'heath-bloom': 0,
        'ridge-outcrop': 0,
        'lake-sheen': 0,
        'ancient-monolith': 0
      },
      totalDetailInstanceCount: expect.any(Number),
      totalDetailDrawCalls: expect.any(Number),
      forestPlacementSource: 'legacy-fallback',
      forestSharedTreeCount: 0,
      forestCanonicalTriangleCount: 0,
      forestVisibleTriangleCount: 0,
      forestFallbackType: 'none',
      forestContactShadowCount: 0,
      forestGroundingMode: 'none',
      forestCanopyMotionState: 'static',
      forestStructureCellCounts: {
        core: 0, body: 0, fringe: 0, clearing: 0
      },
      forestSilhouetteCoverageRatio: 0,
      forestSnowTintedTreeCount: 0,
      forestDryTintedTreeCount: 0,
      forestDecorativeRejectedBySand: 0,
      forestDrylandRetainedCount: 0,
      forestSandTintedTreeCount: 0,
      forestDecorativeTreeCount: 0,
      forestDecorativeTriangleCount: 0,
      forestDecorativeDrawCalls: 0,
      forestDecorativeCacheEntries: 0,
      forestDecorativeCacheLimit: 0,
      forestDecorativeCacheHighWaterMark: 0,
      forestDecorativeRepackCount: 0,
      forestDecorativeModelReady: false,
      forestDecorativeUsingFallback: false,
      forestDecorativeFallbackType: 'none',
      forestDecorativeContactShadowCount: 0,
      forestDecorativeGroundingMode: 'none',
      forestDecorativeCanopyMotionState: 'static',
      forestDecorativeStructureCellCounts: {
        core: 0, body: 0, fringe: 0, clearing: 0
      },
      forestDecorativeSilhouetteCoverageRatio: 0,
      forestDecorativeCanonicalTriangleCount: 0,
      forestDecorativeOverviewHidden: true,
      grassCandidateCellCount: 0,
      grassActiveCellCount: 0,
      grassInstanceCount: 0,
      grassTriangleCount: 0,
      grassDrawCalls: 0,
      grassCacheEntries: 0,
      grassCacheLimit: 512,
      grassCacheHighWaterMark: 0,
      grassRepackCount: 0,
      grassAnimated: false,
      grassTargetAnimationCadence: 0,
      grassCandidateCellsByTerrain: {
        meadow: 0, lowland: 0, forest: 0, heath: 0, ridge: 0, lake: 0,
        'ancient-stone': 0, apron: 0
      },
      grassActiveCellsByTerrain: {
        meadow: 0, lowland: 0, forest: 0, heath: 0, ridge: 0, lake: 0,
        'ancient-stone': 0, apron: 0
      },
      grassCountsByTerrain: {
        meadow: 0,
        lowland: 0,
        forest: 0,
        heath: 0,
        ridge: 0,
        lake: 0,
        'ancient-stone': 0,
        apron: 0
      },
      grassAverageRetainedPatchesByTerrain: {
        meadow: 0, lowland: 0, forest: 0, heath: 0, ridge: 0, lake: 0,
        'ancient-stone': 0, apron: 0
      },
      grassPaletteLuminanceMin: 0,
      grassPaletteLuminanceMax: 0,
      grassPaletteDisplaySrgbSaturationMin: 0,
      grassPaletteDisplaySrgbSaturationMax: 0,
      grassPaletteGreenMin: 0,
      grassPaletteGreenMax: 0,
      grassShaderFallbackActive: false,
      grassShaderFallbackCount: 0,
      grassShaderFallbackReason: null,
      grassCompletelyBareActiveCells: 0,
      grassRejectedByStructureClearance: 0,
      grassRejectedBySlope: 0,
      grassRejectedBySnow: 0,
      grassRetainedInSnowTransition: 0,
      grassAverageSnowCoverageOfActiveCells: 0,
      grassRejectedBySand: 0,
      grassRetainedInDryTransition: 0,
      grassActiveSandCellCount: 0,
      grassAverageSandCoverageOfActiveCells: 0,
      grassOverviewHidden: true
    });

    sceneHandle.dispose();
  });

  it('accounts clustered trees as one static semantic batch without adding pick or shadow work', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('forest-telemetry', 4, 4);
    const onTerrainPresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      reducedMotion: true,
      quality: REALM_QUALITY_SPECS.high,
      terrainMetadata: surface.playableMap.cells.map((cell) => ({
        tileKey: hexKey(cell.coord),
        terrainKind: 'forest',
        staticContentKind: cell.coord.q === 0 && cell.coord.r === 0
          ? 'castle-slot'
          : 'empty'
      })),
      onTerrainPresentationTelemetry
    }));
    const telemetry = onTerrainPresentationTelemetry.mock.calls.at(-1)?.[0];
    const renderedScene = webglState.instances.at(-1)?.render.mock.calls.at(-1)?.[0] as THREE.Scene;
    const fallback = renderedScene.getObjectByName(
      'realm-hegemony-tree-static-fallback'
    ) as THREE.InstancedMesh | undefined;

    expect(telemetry).toMatchObject({
      semanticFeatureCount: expect.any(Number),
      semanticFeatureDrawCalls: 1,
      totalDetailDrawCalls: expect.any(Number)
    });
    expect(telemetry.semanticFeatureCount).toBeGreaterThan(0);
    expect(telemetry.semanticFeatureCounts['heath-bloom']).toBe(0);
    expect(Object.values(telemetry.semanticFeatureCounts as Record<string, number>)
      .reduce((total, count) => total + count, 0))
      .toBe(telemetry.semanticFeatureCount);
    expect(fallback).toBeInstanceOf(THREE.InstancedMesh);
    expect(fallback?.castShadow).toBe(false);
    expect(fallback?.receiveShadow).toBe(false);
    // Interaction only calls castle, Gold, then terrain raycasts; the static
    // forest layer intentionally exposes no layer raycast target.
    expect(renderedScene.getObjectByName('realm-hegemony-forest-presentation')).toBeTruthy();

    sceneHandle.dispose();
  });

  it('keeps all canonical shared trees at every quality under the real static exclusion set', () => {
    const snapshot = createCanonicalGenesisSnapshot();
    const surface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    );
    for (const quality of [
      REALM_QUALITY_SPECS.high,
      REALM_QUALITY_SPECS.balanced,
      REALM_QUALITY_SPECS.reduced
    ]) {
      const canvas = document.createElement('canvas');
      const onTerrainPresentationTelemetry = vi.fn();
      const sceneHandle = createRealmScene(createOptions(canvas, {
        surface,
        terrainMetadata: snapshot.tileMetadata,
        quality,
        realmId: snapshot.realm.realmId,
        sharedForestLayout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
        sharedForestTrees: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
        allowLegacyForestFallback: false,
        onTerrainPresentationTelemetry
      }));
      const telemetry = onTerrainPresentationTelemetry.mock.calls.at(-1)?.[0];
      const renderedScene = webglState.instances.at(-1)?.render.mock.calls.at(-1)?.[0] as THREE.Scene;
      const fallback = renderedScene.getObjectByName(
        'realm-hegemony-tree-static-fallback'
      ) as THREE.InstancedMesh | undefined;

      expect(telemetry).toMatchObject({
        forestPlacementSource: 'shared',
        forestSharedTreeCount: 210
      });
      expect(fallback).toBeInstanceOf(THREE.InstancedMesh);
      expect(fallback?.count).toBe(210);
      expect(fallback?.castShadow).toBe(false);
      expect(fallback?.receiveShadow).toBe(false);

      sceneHandle.dispose();
    }
  }, 30_000);

  it.each([
    {
      projection: 'absent',
      sharedForestLayout: undefined,
      sharedForestTrees: undefined
    },
    {
      projection: 'malformed',
      sharedForestLayout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
      sharedForestTrees: CANONICAL_GENESIS_FOREST_INSTANCES_V1.slice(0, -1)
    }
  ])('fails closed without constructing forest presentation for an $projection shared projection', ({
    sharedForestLayout,
    sharedForestTrees
  }) => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('forest-fail-closed', 4, 4);
    const onTerrainPresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      realmId: 'GENESIS_001',
      reducedMotion: true,
      quality: REALM_QUALITY_SPECS.high,
      allowLegacyForestFallback: false,
      sharedForestLayout,
      sharedForestTrees,
      terrainMetadata: surface.playableMap.cells.map((cell) => ({
        tileKey: hexKey(cell.coord),
        terrainKind: 'forest',
        staticContentKind: cell.coord.q === 0 && cell.coord.r === 0
          ? 'castle-slot'
          : 'empty'
      })),
      onTerrainPresentationTelemetry
    }));
    const telemetry = onTerrainPresentationTelemetry.mock.calls.at(-1)?.[0];
    const renderedScene = webglState.instances.at(-1)?.render.mock.calls.at(-1)?.[0] as THREE.Scene;

    expect(telemetry).toMatchObject({
      forestPlacementSource: 'blocked',
      forestSharedTreeCount: 0,
      semanticFeatureCount: 0,
      semanticFeatureDrawCalls: 0
    });
    expect(renderedScene.getObjectByName('realm-hegemony-forest-presentation')).toBeUndefined();
    expect(renderedScene.getObjectByName('realm-forest-trees')).toBeUndefined();

    sceneHandle.dispose();
  });

  it('uses a sunlit key with restrained identity fills without adding PBR work', () => {
    const canvas = document.createElement('canvas');
    const sceneHandle = createRealmScene(createOptions(canvas, {
      reducedMotion: true
    }));
    const renderedScene = webglState.instances[0].render.mock.calls.at(-1)?.[0] as THREE.Scene;
    const directionalLights = renderedScene.children.filter(
      (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight
    );
    const hemisphereLights = renderedScene.children.filter(
      (child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight
    );
    const cameraFill = renderedScene.getObjectByName(
      'realm-camera-facing-fill'
    ) as THREE.DirectionalLight | undefined;
    const amethystSideFill = renderedScene.getObjectByName(
      'realm-amethyst-side-fill'
    ) as THREE.DirectionalLight | undefined;

    expect(directionalLights).toHaveLength(3);
    expect(hemisphereLights).toHaveLength(1);
    expect(directionalLights.map((light) => `#${light.color.getHexString()}`).sort()).toEqual([
      '#a991d0',
      '#dce8f5',
      '#fff2c9'
    ].sort());
    expect(cameraFill).toBeInstanceOf(THREE.DirectionalLight);
    expect(amethystSideFill).toBeInstanceOf(THREE.DirectionalLight);
    expect(amethystSideFill?.intensity).toBe(
      REALM_CASTLE_READABILITY_LIGHTING.amethystSideFillIntensity
    );
    expect(amethystSideFill!.intensity).toBeGreaterThanOrEqual(0.15);
    expect(amethystSideFill!.intensity).toBeLessThanOrEqual(0.18);
    expect(canvas.dataset.realmLighting).toBe(
      REALM_CASTLE_READABILITY_LIGHTING.revision
    );

    const normalizedPosition = cameraFill!.position.clone().normalize();
    const normalizedHorizontalPosition = new THREE.Vector2(
      cameraFill!.position.x,
      cameraFill!.position.z
    ).normalize();
    const cameraAzimuth = THREE.MathUtils.degToRad(DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees);
    const cameraHorizontalDirection = new THREE.Vector2(
      Math.sin(cameraAzimuth),
      Math.cos(cameraAzimuth)
    );
    const horizontalAlignment = normalizedHorizontalPosition.dot(cameraHorizontalDirection);
    const upwardIrradiance = cameraFill!.intensity * normalizedPosition.y;
    const cameraFacingIrradiance = cameraFill!.intensity
      * Math.hypot(normalizedPosition.x, normalizedPosition.z)
      * horizontalAlignment;

    expect(horizontalAlignment).toBeGreaterThan(0.995);
    expect(upwardIrradiance).toBeCloseTo(
      REALM_CASTLE_READABILITY_LIGHTING.cameraFillUpwardIrradiance,
      8
    );
    expect(upwardIrradiance).toBeLessThanOrEqual(
      REALM_CASTLE_READABILITY_LIGHTING.maximumCameraFillUpwardIrradiance
    );
    expect(cameraFacingIrradiance).toBeCloseTo(
      REALM_CASTLE_READABILITY_LIGHTING.cameraFacingIrradiance,
      8
    );
    expect(cameraFacingIrradiance).toBeGreaterThanOrEqual(0.4);
    expect(cameraFacingIrradiance).toBeLessThanOrEqual(0.44);

    const hemisphere = hemisphereLights[0]!;
    expect(`#${hemisphere.color.getHexString()}`).toBe('#dce8f5');
    expect(`#${hemisphere.groundColor.getHexString()}`).toBe('#6f6049');
    expect(hemisphere.intensity).toBe(REALM_CASTLE_READABILITY_LIGHTING.hemisphereIntensity);

    const terrain = renderedScene.getObjectByName('hegemony-lowlands-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(terrain.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(terrain.material.vertexColors).toBe(true);
    expect(terrain.material.roughness).toBe(0.94);
    expect(terrain.material.metalness).toBe(0);
    expect(terrain.geometry.getAttribute('terrainSurfaceCue')?.itemSize).toBe(4);

    sceneHandle.dispose();
  });

  it('retains direct-light playability when procedural environment allocation fails', () => {
    const canvas = document.createElement('canvas');
    environmentState.failNext = true;
    const sceneHandle = createRealmScene(createOptions(canvas, { reducedMotion: true }));
    const renderedScene = webglState.instances[0].render.mock.calls.at(-1)?.[0] as THREE.Scene;

    expect(canvas.dataset.environmentLighting).toBe('direct-light-fallback');
    expect(renderedScene.environment).toBeNull();
    expect(renderedScene.getObjectByName('realm-environment-depth')).toBeUndefined();
    expect(renderedScene.children.some((child) => child instanceof THREE.DirectionalLight))
      .toBe(true);

    sceneHandle.dispose();
  });

  it('fails closed to terrain-only presentation when the grass shader contract changes during render', () => {
    const canvas = document.createElement('canvas');
    webglState.failGrassShaderContractOnce = true;

    const sceneHandle = createRealmScene(createOptions(canvas, { reducedMotion: true }));

    expect(canvas.dataset.grassPresentation).toBe('unavailable');
    expect(webglState.instances[0].render).toHaveBeenCalledTimes(3);
    sceneHandle.dispose();
  });

  it('disposes the scene when the grass-free fallback render also fails', () => {
    const canvas = document.createElement('canvas');
    const onRendererFailure = vi.fn();
    webglState.failGrassShaderContractOnce = true;
    webglState.failAfterGrassShaderFallbackOnce = true;

    const sceneHandle = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onRendererFailure,
    }));

    expect(webglState.instances[0].render).toHaveBeenCalledTimes(2);
    expect(onRendererFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'scene-build-failed',
      retryable: true,
      phase: 'ready',
    }));
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(ambientSchedulerState.creations.at(-1)?.isActive()).toBe(false);

    sceneHandle.dispose();
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
  });

  it.each(['food', 'wood'] as const)(
    'keeps the ambient scheduler live for a moving %s wagon when grass creation fails',
    (resourceKind) => {
      const canvas = document.createElement('canvas');
      const surface = createRealmTerrainSurface(`moving-${resourceKind}-without-grass`, 1, 1);
      const node = movingResourceNode(`test-${resourceKind}-site`);
      grassLayerState.failNextCreation = true;

      const sceneHandle = createRealmScene(createOptions(canvas, {
        surface,
        quality: REALM_QUALITY_SPECS.balanced,
        ...(resourceKind === 'food' ? { foodNodes: [node] } : { woodNodes: [node] })
      }));
      const renderer = webglState.instances.at(-1)!;
      const ambient = ambientSchedulerState.creations.at(-1)!;

      expect(canvas.dataset.grassPresentation).toBe('unavailable');
      expect(ambient.active).toBe(true);
      expect(ambient.isActive()).toBe(true);
      renderer.render.mockClear();
      ambient.step(0.1);
      expect(renderer.render).toHaveBeenCalledOnce();

      sceneHandle.dispose();
    }
  );

  it('keeps moving Gold on the ambient clock after a grass shader fallback', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('moving-gold-after-grass-shader-fallback', 1, 1);
    webglState.failGrassShaderContractOnce = true;

    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      quality: REALM_QUALITY_SPECS.high,
      goldNodes: [movingResourceNode('test-gold-site')]
    }));
    const renderer = webglState.instances.at(-1)!;
    const ambient = ambientSchedulerState.creations.at(-1)!;

    expect(canvas.dataset.grassPresentation).toBe('unavailable');
    expect(ambient.active).toBe(true);
    expect(ambient.isActive()).toBe(true);
    renderer.render.mockClear();
    ambient.step(0.1);
    expect(renderer.render).toHaveBeenCalledOnce();

    sceneHandle.dispose();
  });

  it('does not rebuild unchanged terrain telemetry on ambient animation frames', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface(
      'terrain-telemetry-ambient-allocation',
      1,
      1
    );
    const onTerrainPresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      quality: REALM_QUALITY_SPECS.high,
      goldNodes: [movingResourceNode('terrain-telemetry-moving-site')],
      onTerrainPresentationTelemetry
    }));
    const renderer = webglState.instances.at(-1)!;
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const aggregationCount = canvas.dataset.realmTerrainTelemetryAggregationCount;
    const publicationCount = onTerrainPresentationTelemetry.mock.calls.length;

    expect(aggregationCount).toBeTruthy();
    expect(publicationCount).toBeGreaterThan(0);
    renderer.render.mockClear();
    ambient.step(0.1);

    expect(renderer.render).toHaveBeenCalledOnce();
    expect(canvas.dataset.realmTerrainTelemetryAggregationCount)
      .toBe(aggregationCount);
    expect(onTerrainPresentationTelemetry).toHaveBeenCalledTimes(publicationCount);
    sceneHandle.dispose();
  });

  it('reconciles a live occupation without rebuilding the scene or camera', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('live-occupation-reconciliation', 1, 1);
    const initialNode = movingResourceNode('live-gold-site');
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true,
      goldNodes: [initialNode]
    }));
    const renderer = webglState.instances.at(-1)!;
    const before = sceneHandle.getCameraAttestation();
    const buildSequence = sceneHandle.getSceneBuildSequence();
    renderer.render.mockClear();

    const gatheringNode = Object.freeze({
      ...initialNode,
      availability: 'gathering' as const,
      occupation: Object.freeze({
        ...initialNode.occupation,
        phase: 'gathering' as const
      })
    });
    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [gatheringNode],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      observedAtMicros: 60_000_000n
    });

    const after = sceneHandle.getCameraAttestation();
    expect(sceneHandle.getSceneBuildSequence()).toBe(buildSequence);
    expect(after.sceneId).toBe(before.sceneId);
    expect(after.canvasId).toBe(before.canvasId);
    expect(after.mode).toBe(before.mode);
    expect(after.position).toEqual(before.position);
    expect(after.target).toEqual(before.target);
    expect(after.zoom).toBe(before.zoom);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(canvas.dataset.realmDynamicReconciliationCount).toBe('1');
    expect(canvas.dataset.realmDynamicReconciliationRejected).toBe('0');

    sceneHandle.dispose();
  });

  it('projects and clears the identity-minimized generic occupant lane', () => {
    const canvas = document.createElement('canvas');
    const onResourceProjection = vi.fn();
    const occupant = Object.freeze({
      resource: 'wood' as const,
      siteId: 'genesis-001:wood:0001',
      coord: Object.freeze({ q: 0, r: 0 })
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      resourceOccupants: [occupant],
      onResourceProjection
    }));
    sceneHandle.focusCell(occupant.coord);

    expect(onResourceProjection).toHaveBeenCalled();
    expect(onResourceProjection.mock.calls
      .flatMap(([frame]) => frame.markers)
      .find((marker) => marker.siteId === occupant.siteId))
      .toMatchObject({ resource: 'wood', siteId: occupant.siteId, visible: true });

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      resourceOccupants: [],
      observedAtMicros: 1n
    });
    expect(onResourceProjection.mock.calls.at(-1)?.[0].markers).toEqual([]);

    sceneHandle.dispose();
  });

  it('replaces the worker layer across full, unavailable, and recovered catalogs', () => {
    const canvas = document.createElement('canvas');
    const worker = idleWorkerRecord();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      workers: [worker]
    }));
    const before = sceneHandle.getCameraAttestation();
    const buildSequence = sceneHandle.getSceneBuildSequence();
    expect(canvas.dataset.realmWorkerMarkerCount).toBe('1');

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [],
      observedAtMicros: 1n
    });
    expect(canvas.dataset.realmWorkerMarkerCount).toBe('0');
    expect(canvas.dataset.realmDynamicReconciliationCount).toBe('1');
    expect(canvas.dataset.realmWorkerLayerReconciliationCount).toBe('1');
    expect(canvas.dataset.realmRouteLayerReconciliationCount).toBe('1');

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [idleWorkerRecord(1n)],
      observedAtMicros: 2n
    });
    const after = sceneHandle.getCameraAttestation();
    expect(canvas.dataset.realmWorkerMarkerCount).toBe('1');
    expect(canvas.dataset.realmDynamicReconciliationCount).toBe('2');
    expect(canvas.dataset.realmDynamicReconciliationRejected).toBe('0');
    expect(canvas.dataset.realmWorkerLayerReconciliationCount).toBe('2');
    expect(canvas.dataset.realmRouteLayerReconciliationCount).toBe('2');
    expect(sceneHandle.getSceneBuildSequence()).toBe(buildSequence);
    expect(after.sceneId).toBe(before.sceneId);
    expect(after.canvasId).toBe(before.canvasId);
    expect(after.position).toEqual(before.position);
    expect(after.target).toEqual(before.target);
    expect(after.zoom).toBe(before.zoom);

    sceneHandle.dispose();
  });

  it('repacks vegetation only when validated live route geometry changes', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('live-route-vegetation', 4, 5);
    const initialWorker = outboundWorkerRecord();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      reducedMotion: true,
      workers: [initialWorker]
    }));
    const buildSequence = sceneHandle.getSceneBuildSequence();

    expect(canvas.dataset.realmVegetationRoutePathCount).toBe('1');
    expect(canvas.dataset.realmVegetationRouteSegmentCount).toBe('2');
    expect(canvas.dataset.realmVegetationRouteRepackCount).toBe('0');

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [outboundWorkerRecord(0, {
        startedAtMicros: 150_000n,
        arrivesAtMicros: 350_000n,
        revision: 2n
      })],
      observedAtMicros: 200_000n
    });
    expect(canvas.dataset.realmVegetationRouteRepackCount).toBe('0');

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [idleWorkerRecord(3n)],
      observedAtMicros: 400_000n
    });

    expect(canvas.dataset.realmVegetationRoutePathCount).toBe('0');
    expect(canvas.dataset.realmVegetationRouteSegmentCount).toBe('0');
    expect(canvas.dataset.realmVegetationRouteRepackCount).toBe('1');
    expect(sceneHandle.getSceneBuildSequence()).toBe(buildSequence);

    sceneHandle.dispose();
  });

  it('invalidates the camera-local forest mask in place when a live route changes', () => {
    const snapshot = createCanonicalGenesisSnapshot();
    const surface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    );
    const canvas = document.createElement('canvas');
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      terrainMetadata: snapshot.tileMetadata,
      realmId: snapshot.realm.realmId,
      sharedForestLayout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
      sharedForestTrees: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
      allowLegacyForestFallback: false,
      reducedMotion: true,
      workers: [outboundWorkerRecord()]
    }));
    const buildSequence = sceneHandle.getSceneBuildSequence();
    const initialForestRepackCount = Number(
      canvas.dataset.forestDecorativeRepackCount
    );

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [idleWorkerRecord(3n)],
      observedAtMicros: 400_000n
    });

    expect(Number(canvas.dataset.forestDecorativeRepackCount))
      .toBe(initialForestRepackCount + 1);
    expect(canvas.dataset.realmVegetationRouteRepackCount).toBe('1');
    expect(sceneHandle.getSceneBuildSequence()).toBe(buildSequence);

    sceneHandle.dispose();
  }, 15_000);

  it('projects a travelling worker from its current route position and locates it without changing zoom', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const worker = outboundWorkerRecord();
    const onWorkerProjection = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('worker-current-position', 4, 5),
      reducedMotion: true,
      workers: [worker],
      onWorkerProjection
    }));

    const projection = onWorkerProjection.mock.calls.at(-1)?.[0];
    expect(projection).toMatchObject({
      width: 800,
      height: 600,
      markers: [
        expect.objectContaining({
          workerId: worker.workerId,
          workerOrdinal: worker.ordinal,
          originCastleId: worker.originCastleId,
          visible: true,
          phase: 'outbound'
        })
      ]
    });
    expect(canvas.dataset.realmWorkerPresenceCount).toBe('1');
    expect(canvas.dataset.realmWorkerPresenceSuppressedCount).toBe('0');

    const currentCoord = sceneHandle.getWorkerCurrentCoord(worker.workerId);
    expect(currentCoord).not.toBeNull();
    expect(currentCoord).not.toEqual(worker.originCoord);
    expect(currentCoord).not.toEqual(worker.destinationCoord);
    const before = sceneHandle.getCameraAttestation();
    expect(sceneHandle.locateWorker(worker.workerId)).toEqual(currentCoord);
    const after = sceneHandle.getCameraAttestation();
    expect(after.zoom).toBe(before.zoom);
    expect(after.target).not.toEqual(before.target);
    expect(sceneHandle.locateWorker('unknown-worker')).toBeNull();
    expect(sceneHandle.getWorkerCurrentCoord('unknown-worker')).toBeNull();

    sceneHandle.dispose();
    expect(sceneHandle.locateWorker(worker.workerId)).toBeNull();
    expect(sceneHandle.getWorkerCurrentCoord(worker.workerId)).toBeNull();
  });

  it('keeps reduced-motion worker positional truth on a bounded ambient cadence', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(200);
    const onWorkerProjection = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('reduced-worker-position-clock', 4, 5),
      reducedMotion: true,
      workers: [outboundWorkerRecord()],
      onWorkerProjection
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const expectedFrameCap = Math.max(
      1,
      Math.floor(1_000 / REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS)
    );

    expect(canvas.dataset.realmAmbientFrameCap).toBe(String(expectedFrameCap));
    expect(ambient.frameCap).toBe(expectedFrameCap);
    expect(ambient.active).toBe(true);
    expect(ambient.isActive()).toBe(true);
    const before = onWorkerProjection.mock.calls.at(-1)?.[0].markers[0];
    expect(before).toBeTruthy();

    now.mockReturnValue(250);
    onWorkerProjection.mockClear();
    ambient.step(0.5);
    const after = onWorkerProjection.mock.calls.at(-1)?.[0].markers[0];
    expect(after).toBeTruthy();
    expect({ x: after.x, y: after.y }).not.toEqual({ x: before.x, y: before.y });

    sceneHandle.dispose();
  });

  it('publishes Worker telemetry only when its diagnostic value changes', async () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(200);
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('worker-telemetry-diff-cache', 4, 5),
      reducedMotion: true,
      workers: [outboundWorkerRecord()]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const workerAttributes = () => Object.fromEntries(
      [...canvas.attributes]
        .filter((attribute) => attribute.name.startsWith('data-realm-worker-'))
        .map((attribute) => [attribute.name, attribute.value])
    );
    const initialAttributes = workerAttributes();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      mutations.push(...records.filter(
        (record) => record.attributeName?.startsWith('data-realm-worker-')
      ));
    });
    observer.observe(canvas, { attributes: true, attributeOldValue: true });

    ambient.step(0);
    await Promise.resolve();
    expect(mutations).toEqual([]);
    expect(workerAttributes()).toEqual(initialAttributes);

    now.mockReturnValue(250);
    ambient.step(0.05);
    await Promise.resolve();
    const changedAttributeNames = new Set(
      mutations.flatMap((record) => (
        record.attributeName ? [record.attributeName] : []
      ))
    );
    expect(changedAttributeNames.size).toBeGreaterThan(0);
    expect(changedAttributeNames.size).toBeLessThan(
      Object.keys(initialAttributes).length
    );
    expect(Object.keys(workerAttributes())).toEqual(Object.keys(initialAttributes));

    observer.disconnect();
    sceneHandle.dispose();
  });

  it('repaints restored Worker continuity and makes the handoff inert after disposal', () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const worker = outboundWorkerRecord();
    const source = createRealmScene(createOptions(
      document.createElement('canvas'),
      {
        surface: createRealmTerrainSurface('worker-continuity-source', 4, 5),
        reducedMotion: true,
        workers: [worker]
      }
    ));
    const continuity = source.getWorkerPresentationContinuity();
    expect(continuity?.records).toHaveLength(1);

    const candidateCanvas = document.createElement('canvas');
    const candidate = createRealmScene(createOptions(candidateCanvas, {
      surface: createRealmTerrainSurface('worker-continuity-source', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const renderer = webglState.instances.at(-1)!;
    const rendersBeforeRestore = renderer.render.mock.calls.length;

    expect(candidate.restoreWorkerPresentationContinuity(continuity)).toBe(true);
    expect(renderer.render.mock.calls.length).toBeGreaterThan(rendersBeforeRestore);

    source.dispose();
    expect(source.getWorkerPresentationContinuity()).toBeNull();
    expect(source.restoreWorkerPresentationContinuity(continuity)).toBe(false);
    candidate.dispose();
  });

  it('wakes a far-future Worker at its exact journey start boundary', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const { timers, clearTimeoutSpy } = installManualWindowTimers();
    const worker = outboundWorkerRecord(0, {
      startedAtMicros: 60_000_000n,
      arrivesAtMicros: 70_000_000n,
      gatheringEndsAtMicros: 80_000_000n,
      returnsAtMicros: 90_000_000n
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('future-worker-wake', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const initialCoord = sceneHandle.getWorkerCurrentCoord(worker.workerId);

    expect(initialCoord?.q).toBe(worker.originCoord.q);
    expect(Math.abs(initialCoord?.r ?? Number.NaN)).toBe(worker.originCoord.r);
    expect(ambient.frameCap).toBe(0);
    expect(ambient.active).toBe(false);
    expect(ambient.isActive()).toBe(false);
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([60_000]);

    now.mockReturnValue(59_999);
    expect(sceneHandle.getWorkerCurrentCoord(worker.workerId)).toEqual(initialCoord);
    expect(ambient.isActive()).toBe(false);

    const [timerId, timer] = [...timers.entries()][0]!;
    timers.delete(timerId);
    now.mockReturnValue(60_000);
    timer.callback();

    const expectedFrameCap = Math.max(
      1,
      Math.floor(1_000 / REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS)
    );
    expect(timers.size).toBe(0);
    expect(ambient.frameCap).toBe(expectedFrameCap);
    expect(ambient.active).toBe(true);
    expect(ambient.isActive()).toBe(true);
    expect(sceneHandle.getWorkerCurrentCoord(worker.workerId)).toEqual(initialCoord);

    now.mockReturnValue(65_000);
    ambient.step(0.5);
    expect(sceneHandle.getWorkerCurrentCoord(worker.workerId)).not.toEqual(initialCoord);

    sceneHandle.dispose();
    expect(clearTimeoutSpy).not.toHaveBeenCalledWith(timerId);
  });

  it('re-arms one Worker wake and rejects stale callbacks after reconciliation', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const { timers, clearTimeoutSpy } = installManualWindowTimers();
    const worker = outboundWorkerRecord(0, {
      startedAtMicros: 60_000_000n,
      arrivesAtMicros: 70_000_000n,
      gatheringEndsAtMicros: 80_000_000n,
      returnsAtMicros: 90_000_000n
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('future-worker-rearm', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const renderer = webglState.instances.at(-1)!;
    const [firstTimerId, firstTimer] = [...timers.entries()][0]!;

    sceneHandle.reconcileLiveGatheringState({
      observedAtMicros: 0n,
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [Object.freeze({
        ...worker,
        startedAtMicros: 80_000_000n,
        arrivesAtMicros: 90_000_000n,
        gatheringEndsAtMicros: 100_000_000n,
        returnsAtMicros: 110_000_000n,
        timelineRevision: 2,
        revision: 2n
      })]
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimerId);
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([80_000]);
    const renderCountAfterReconcile = renderer.render.mock.calls.length;
    firstTimer.callback();
    expect(renderer.render).toHaveBeenCalledTimes(renderCountAfterReconcile);
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([80_000]);

    sceneHandle.setPresentationActive(false);
    expect(timers.size).toBe(0);
    sceneHandle.setPresentationActive(true);
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([80_000]);

    const staleAfterDispose = [...timers.values()][0]!.callback;
    const renderCountBeforeDispose = renderer.render.mock.calls.length;
    sceneHandle.dispose();
    expect(timers.size).toBe(0);
    staleAfterDispose();
    expect(renderer.render).toHaveBeenCalledTimes(renderCountBeforeDispose);
  });

  it('catches up a due Worker wake once after a hidden tab becomes visible', () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const { timers } = installManualWindowTimers();
    const worker = outboundWorkerRecord(0, {
      startedAtMicros: 60_000_000n,
      arrivesAtMicros: 70_000_000n,
      gatheringEndsAtMicros: 80_000_000n,
      returnsAtMicros: 90_000_000n
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('future-worker-hidden-wake', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const renderer = webglState.instances.at(-1)!;

    expect(timers.size).toBe(1);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(timers.size).toBe(0);
    expect(ambient.isActive()).toBe(false);

    now.mockReturnValue(61_000);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(timers.size).toBe(0);
    expect(ambient.isActive()).toBe(true);
    const renderCountAfterCatchUp = renderer.render.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(renderer.render).toHaveBeenCalledTimes(renderCountAfterCatchUp);

    sceneHandle.dispose();
  });

  it('re-arms a future returning Worker across context loss and catches up once due', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const { timers } = installManualWindowTimers();
    const worker = outboundWorkerRecord(0, {
      status: 'returning',
      returnStartedAtMicros: 60_000_000n,
      returnsAtMicros: 70_000_000n,
      returnStartProgressBasisPoints: 10_000,
      timelineRevision: 2,
      revision: 2n
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('future-return-context-wake', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const renderer = webglState.instances.at(-1)!;

    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([60_000]);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(timers.size).toBe(0);
    expect(ambient.isActive()).toBe(false);

    now.mockReturnValue(50_000);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([10_000]);
    expect(ambient.isActive()).toBe(false);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(timers.size).toBe(0);
    now.mockReturnValue(61_000);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(timers.size).toBe(0);
    expect(ambient.isActive()).toBe(true);
    const renderCountAfterRestore = renderer.render.mock.calls.length;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.render).toHaveBeenCalledTimes(renderCountAfterRestore);

    sceneHandle.dispose();
  });

  it('chunks a Worker wake beyond the browser timeout limit without rendering early', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const maximumTimeoutMilliseconds = 2_147_483_647;
    const demandAtMilliseconds = maximumTimeoutMilliseconds + 5_000;
    const movementStartsAtMicros = BigInt(demandAtMilliseconds) * 1_000n;
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const { timers } = installManualWindowTimers();
    const worker = outboundWorkerRecord(0, {
      startedAtMicros: movementStartsAtMicros,
      arrivesAtMicros: movementStartsAtMicros + 10_000_000n,
      gatheringEndsAtMicros: movementStartsAtMicros + 20_000_000n,
      returnsAtMicros: movementStartsAtMicros + 30_000_000n
    });
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('long-future-worker-wake', 4, 5),
      reducedMotion: true,
      workers: [worker]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const renderer = webglState.instances.at(-1)!;

    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([maximumTimeoutMilliseconds]);
    const [firstTimerId, firstTimer] = [...timers.entries()][0]!;
    timers.delete(firstTimerId);
    const renderCountBeforeChunk = renderer.render.mock.calls.length;
    now.mockReturnValue(maximumTimeoutMilliseconds);
    firstTimer.callback();
    expect(renderer.render).toHaveBeenCalledTimes(renderCountBeforeChunk);
    expect([...timers.values()].map((timer) => timer.delayMilliseconds))
      .toEqual([5_000]);
    expect(ambient.isActive()).toBe(false);

    const [finalTimerId, finalTimer] = [...timers.entries()][0]!;
    timers.delete(finalTimerId);
    now.mockReturnValue(demandAtMilliseconds);
    finalTimer.callback();
    expect(timers.size).toBe(0);
    expect(ambient.isActive()).toBe(true);

    sceneHandle.dispose();
  });

  it('bounds moving-worker projection membership and reports suppressed presences', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const workers = Object.freeze(Array.from(
      { length: 30 },
      (_, index) => outboundWorkerRecord(index)
    ));
    const onWorkerProjection = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('bounded-worker-presence', 4, 5),
      reducedMotion: true,
      workers,
      onWorkerProjection
    }));
    const projection = onWorkerProjection.mock.calls.at(-1)?.[0];

    expect(projection.markers).toHaveLength(24);
    expect(new Set(projection.markers.map(
      (marker: { workerId: string }) => marker.workerId
    )).size).toBe(24);
    expect(canvas.dataset.realmWorkerPresenceCount).toBe('24');
    expect(canvas.dataset.realmWorkerPresenceSuppressedCount).toBe('6');

    sceneHandle.dispose();
  });

  it('rejects a mixed invalid resource snapshot before any layer mutates', () => {
    const canvas = document.createElement('canvas');
    const goldNode = movingResourceNode('atomic-gold-site');
    const foodNode = movingResourceNode('atomic-food-site');
    const onGoldNodePresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(canvas, {
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true,
      goldNodes: [goldNode],
      foodNodes: [foodNode],
      onGoldNodePresentationTelemetry
    }));
    const availableGoldNode = Object.freeze({
      ...goldNode,
      availability: 'available' as const,
      occupation: undefined,
      originCastle: undefined,
      occupiedByViewer: false
    });
    const invalidFoodNode = Object.freeze({
      ...foodNode,
      coord: Object.freeze({ q: foodNode.coord.q + 1, r: foodNode.coord.r })
    });

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [availableGoldNode],
      foodNodes: [invalidFoodNode],
      woodNodes: [],
      stoneNodes: [],
      observedAtMicros: 60_000_000n
    });
    expect(canvas.dataset.realmDynamicReconciliationCount).toBe('0');
    expect(canvas.dataset.realmDynamicReconciliationRejected).toBe('1');

    // A later render must still observe the original occupied Gold record.
    sceneHandle.focusKeep();
    expect(onGoldNodePresentationTelemetry.mock.calls.at(-1)?.[0].occupiedSiteCount).toBe(1);

    sceneHandle.dispose();
  });

  it('rejects a partial site-world-state catalog before any layer mutates', () => {
    const canvas = document.createElement('canvas');
    const goldNode = movingResourceNode('partial-state-gold-site');
    const sceneHandle = createRealmScene(createOptions(canvas, {
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true,
      goldNodes: [goldNode]
    }));

    sceneHandle.reconcileLiveGatheringState({
      goldNodes: [goldNode],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      resourceSiteWorldStates: {
        gold: [{
          siteId: goldNode.siteId,
          state: 'gathering'
        }]
      } as never,
      observedAtMicros: 60_000_000n
    });

    expect(canvas.dataset.realmDynamicReconciliationCount).toBe('0');
    expect(canvas.dataset.realmDynamicReconciliationRejected).toBe('1');

    sceneHandle.dispose();
  });

  it('keeps the ambient loop stopped under reduced motion even with moving resource wagons', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('reduced-motion-moving-resources', 1, 1);
    const sceneHandle = createRealmScene(createOptions(canvas, {
      surface,
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true,
      goldNodes: [movingResourceNode('test-reduced-gold-site')],
      foodNodes: [movingResourceNode('test-reduced-food-site')],
      woodNodes: [movingResourceNode('test-reduced-wood-site')]
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;

    expect(ambient.active).toBe(false);
    expect(ambient.isActive()).toBe(false);

    sceneHandle.dispose();
  });

  it('releases partial GPU and browser resources when late setup throws', () => {
    const canvas = document.createElement('canvas');
    const canvasAdd = vi.spyOn(canvas, 'addEventListener');
    const canvasRemove = vi.spyOn(canvas, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    materialDispose.mockImplementationOnce(() => {
      throw new Error('synthetic cleanup failure');
    });
    const setupFailure = new Error('synthetic projection failure');

    expect(() => createRealmScene(createOptions(canvas, {
      onCastleProjection: () => { throw setupFailure; }
    }))).toThrow(setupFailure);

    expect(webglState.instances).toHaveLength(1);
    expect(webglState.instances[0].dispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(keepLoadState.load).not.toHaveBeenCalled();

    [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'pointerleave',
      'wheel',
      'webglcontextlost'
    ].forEach((eventName) => {
      expect(listenerCalls(canvasAdd, eventName)).toBe(1);
      expect(listenerCalls(canvasRemove, eventName)).toBe(1);
    });
    expect(listenerCalls(windowAdd, 'resize')).toBe(1);
    expect(listenerCalls(windowRemove, 'resize')).toBe(1);
    expect(listenerCalls(documentAdd, 'visibilitychange')).toBe(4);
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(4);
  });

  it('disposes the scene even when a renderer-failure observer throws', () => {
    webglState.failGenericRenderOnce = true;
    const observerFailure = new Error('synthetic renderer observer failure');

    expect(() => createRealmScene(createOptions(document.createElement('canvas'), {
      onRendererFailure: () => { throw observerFailure; }
    }))).toThrow(observerFailure);
    expect(webglState.instances).toHaveLength(1);
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(ambientSchedulerState.creations.at(-1)?.isActive()).toBe(false);
  });

  it('keeps normal scene disposal idempotent', async () => {
    const canvas = document.createElement('canvas');
    const canvasRemove = vi.spyOn(canvas, 'removeEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const scene = createRealmScene(createOptions(canvas));
    await Promise.resolve();

    scene.dispose();
    scene.dispose();

    expect(webglState.instances).toHaveLength(1);
    expect(webglState.instances[0].dispose).toHaveBeenCalledTimes(1);
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(keepLoadState.load).toHaveBeenCalledTimes(1);
    expect(listenerCalls(canvasRemove, 'pointerdown')).toBe(1);
    expect(listenerCalls(canvasRemove, 'wheel')).toBe(1);
    expect(listenerCalls(canvasRemove, 'webglcontextlost')).toBe(1);
    expect(listenerCalls(windowRemove, 'resize')).toBe(1);
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(4);
  });

  it('tracks Safari visual viewport changes and removes the listeners on disposal', () => {
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 844
    });
    vi.stubGlobal('visualViewport', visualViewport);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const viewportAdd = vi.spyOn(visualViewport, 'addEventListener');
    const viewportRemove = vi.spyOn(visualViewport, 'removeEventListener');
    const canvas = document.createElement('canvas');
    const scene = createRealmScene(createOptions(canvas));
    const renderer = webglState.instances[0];

    expect(renderer.setSize).toHaveBeenCalledWith(390, 844, false);
    expect(listenerCalls(viewportAdd, 'resize')).toBe(1);
    expect(listenerCalls(viewportAdd, 'scroll')).toBe(1);

    visualViewport.dispatchEvent(new Event('resize'));
    expect(renderer.setSize).toHaveBeenCalledWith(390, 844, false);

    scene.dispose();
    expect(listenerCalls(viewportRemove, 'resize')).toBe(1);
    expect(listenerCalls(viewportRemove, 'scroll')).toBe(1);
  });

  it('discards an active old-coordinate gesture before a live viewport rotation', () => {
    let nextFrameId = 1;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 844
    });
    vi.stubGlobal('visualViewport', visualViewport);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 844,
      left: 0,
      width: 390,
      height: 844,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 390 },
      clientHeight: { configurable: true, value: 844 },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-live-viewport-rotation', 4, 5)
    }));
    scheduled.clear();
    const before = scene.getCameraAttestation();

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 71,
      clientX: 150,
      clientY: 400,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 71,
      clientX: 205,
      clientY: 430,
      pointerType: 'touch'
    });
    expect(canvas.dataset.dragging).toBe('true');
    expect(scheduled.size).toBe(1);

    visualViewport.width = 667;
    visualViewport.height = 375;
    visualViewport.dispatchEvent(new Event('resize'));

    expect(canvas.dataset.dragging).toBeUndefined();
    expect(canvas.dataset.realmCameraInertiaActive).toBe('false');
    expect(scheduled.size).toBe(1);
    const resizeCallback = scheduled.values().next().value as FrameRequestCallback;
    scheduled.clear();
    resizeCallback(16);

    dispatchPointer(canvas, 'pointerup', {
      pointerId: 71,
      clientX: 205,
      clientY: 430,
      pointerType: 'touch'
    });
    const after = scene.getCameraAttestation();
    expect(after.controllerState.currentPan).toEqual(
      before.controllerState.currentPan
    );
    expect(after.controllerState.targetPan).toEqual(
      before.controllerState.targetPan
    );
    expect(canvas.dataset.realmCameraInertialReleaseCount).toBe('0');
    scene.dispose();
  });

  it('retires active and inactive-terminal pointers across presentation boundaries', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    const scene = createRealmScene(createOptions(canvas));

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 81,
      clientX: 100,
      clientY: 100,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 81,
      clientX: 140,
      clientY: 100,
      pointerType: 'touch'
    });
    expect(canvas.dataset.dragging).toBe('true');

    scene.setPresentationActive(false);
    expect(canvas.dataset.dragging).toBeUndefined();
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 81,
      clientX: 140,
      clientY: 100,
      pointerType: 'touch'
    });
    scene.setPresentationActive(true);

    const freshAfterPresentation = dispatchPointer(canvas, 'pointerdown', {
      pointerId: 81,
      clientX: 160,
      clientY: 120,
      pointerType: 'touch'
    });
    expect(freshAfterPresentation.defaultPrevented).toBe(true);
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 81,
      clientX: 160,
      clientY: 120,
      pointerType: 'touch'
    });

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 82,
      clientX: 180,
      clientY: 140,
      pointerType: 'touch'
    });
    canvas.dataset.realmCanvasActive = 'false';
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 82,
      clientX: 180,
      clientY: 140,
      pointerType: 'touch'
    });
    canvas.dataset.realmCanvasActive = 'true';
    const freshAfterInactiveTerminal = dispatchPointer(canvas, 'pointerdown', {
      pointerId: 82,
      clientX: 200,
      clientY: 160,
      pointerType: 'touch'
    });
    expect(freshAfterInactiveTerminal.defaultPrevented).toBe(true);
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 82,
      clientX: 200,
      clientY: 160,
      pointerType: 'touch'
    });

    scene.dispose();
  });

  it('clears stale castle hover before wheel-driven camera motion', () => {
    const canvas = document.createElement('canvas');
    const onHover = vi.fn();
    const onTargetHover = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onHover,
      onTargetHover
    }));
    onHover.mockClear();
    onTargetHover.mockClear();

    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
      deltaMode: 0
    }));

    expect(onTargetHover).toHaveBeenCalledOnce();
    expect(onTargetHover).toHaveBeenCalledWith(null);
    expect(onHover).toHaveBeenCalledOnce();
    expect(onHover).toHaveBeenCalledWith(null);
    scene.dispose();
  });

  it('keeps an inactive replacement scene inert until its canvas is activated', () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    canvas.dataset.realmCanvasActive = 'false';
    root.append(canvas);
    document.body.append(root);
    const onHover = vi.fn();
    const onTargetHover = vi.fn();
    const onSelect = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      surface: createRealmTerrainSurface('inactive-replacement-worker', 4, 5),
      workers: [outboundWorkerRecord()],
      onHover,
      onTargetHover,
      onSelect
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    onHover.mockClear();
    onTargetHover.mockClear();
    expect(ambient.isActive()).toBe(false);

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120
    });
    canvas.dispatchEvent(wheel);
    const pointer = dispatchPointer(canvas, 'pointerdown', {
      pointerId: 91,
      clientX: 20,
      clientY: 20
    });

    expect(wheel.defaultPrevented).toBe(false);
    expect(pointer.defaultPrevented).toBe(false);
    expect(onTargetHover).not.toHaveBeenCalled();
    expect(onHover).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    scene.setPresentationActive(true);
    expect(canvas.dataset.realmCanvasActive).toBe('false');
    expect(canvas.dataset.realmPresentationActive).toBe('true');
    expect(ambient.isActive()).toBe(false);
    canvas.dataset.realmCanvasActive = 'true';
    scene.setPresentationActive(true);
    expect(ambient.isActive()).toBe(true);
    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120
    }));
    expect(onTargetHover).toHaveBeenCalledWith(null);
    expect(onHover).toHaveBeenCalledWith(null);

    onTargetHover.mockClear();
    onHover.mockClear();
    root.remove();
    const detachedWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120
    });
    canvas.dispatchEvent(detachedWheel);
    expect(detachedWheel.defaultPrevented).toBe(false);
    expect(onTargetHover).not.toHaveBeenCalled();
    expect(onHover).not.toHaveBeenCalled();

    scene.dispose();
  });

  it('suspends input and ambience during context loss, then reports restoration', () => {
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    const castleLabel = document.createElement('button');
    castleLabel.className = 'realm-castle-label';
    const overlayRetry = document.createElement('button');
    overlayRetry.className = 'realm-map-screen__retry';
    root.append(canvas, castleLabel, overlayRetry);
    document.body.append(root);
    const castleLabelClick = vi.fn();
    const overlayClick = vi.fn();
    castleLabel.addEventListener('click', castleLabelClick);
    overlayRetry.addEventListener('click', overlayClick);
    const onRendererFailure = vi.fn();
    const onRendererContextRestored = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onRendererFailure,
      onRendererContextRestored,
      onRendererUnavailable
    }));
    const ambient = ambientSchedulerState.creations.at(-1)!;
    const renderer = webglState.instances.at(-1)!;

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(canvas.dataset.realmRendererContextLost).toBe('true');
    expect(canvas.dataset.realmRendererContextLossCount).toBe('1');
    expect(ambient.isActive()).toBe(false);
    expect(onRendererFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'context-lost',
      retryable: true,
      phase: 'loading'
    }));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(canvas.dataset.realmRendererContextLossCount).toBe('1');
    expect(onRendererFailure).toHaveBeenCalledOnce();
    expect(onRendererUnavailable).not.toHaveBeenCalled();

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120
    });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);

    const canvasPointer = dispatchPointer(canvas, 'pointerdown', {
      pointerId: 81,
      clientX: 30,
      clientY: 30
    });
    expect(canvasPointer.defaultPrevented).toBe(true);
    const labelClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    castleLabel.dispatchEvent(labelClick);
    expect(labelClick.defaultPrevented).toBe(true);
    expect(castleLabelClick).not.toHaveBeenCalled();
    const overlayPointer = new Event('pointerdown', { bubbles: true, cancelable: true });
    overlayRetry.dispatchEvent(overlayPointer);
    expect(overlayPointer.defaultPrevented).toBe(false);
    overlayRetry.click();
    expect(overlayClick).toHaveBeenCalledOnce();

    const renderCountBeforeRestore = renderer.render.mock.calls.length;
    webglState.failGenericRenderOnce = true;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(canvas.dataset.realmRendererContextLost).toBe('false');
    expect(canvas.dataset.realmRendererContextRestoreCount).toBe('1');
    expect(onRendererContextRestored).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledTimes(renderCountBeforeRestore);
    expect(onRendererFailure).toHaveBeenCalledOnce();
    webglState.failGenericRenderOnce = false;
    scene.dispose();
    root.remove();
  });

  it('aborts a pending castle-family load when the Realm unmounts', async () => {
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
      onRendererUnavailable
    }));

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledOnce());
    const loadOptions = keepLoadState.load.mock.calls[0]?.[0] as {
      signal?: AbortSignal;
    } | undefined;
    expect(loadOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(loadOptions?.signal?.aborted).toBe(false);

    scene.dispose();
    expect(loadOptions?.signal?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(onRendererUnavailable).not.toHaveBeenCalled();
  });

  it('releases a late prefab lease once without inserting after disposal', async () => {
    let resolveLoad: ((value: unknown) => void) | undefined;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(canvas, { onCastlesReady }));
    await Promise.resolve();

    scene.dispose();
    scene.dispose();
    resolveLoad?.(loadedCastleAssembly(root));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onCastlesReady).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(geometryDispose).toHaveBeenCalledTimes(1);
      expect(materialDispose).toHaveBeenCalledTimes(1);
    });
  });

  it('signals zero-castle readiness without requiring a prefab pairing', () => {
    const onCastlesReady = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
      ownCastleId: undefined,
      otherCastles: [],
      onCastlesReady,
      onRendererUnavailable
    }));

    expect(keepLoadState.load).not.toHaveBeenCalled();
    expect(onCastlesReady).toHaveBeenCalledOnce();
    expect(onCastlesReady).toHaveBeenCalledWith(0);
    expect(onRendererUnavailable).not.toHaveBeenCalled();

    scene.dispose();
  });

  it('signals readiness only after a real prefab instance exists', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const onKeepStatusChange = vi.fn();
    const onCastlePresentationTelemetry = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onKeepStatusChange,
      onCastlePresentationTelemetry
    }));

    await vi.waitFor(() => {
      expect(onCastlesReady).toHaveBeenCalledWith(1);
    });
    expect(keepLoadState.load).toHaveBeenCalledTimes(1);
    expect(onKeepStatusChange.mock.calls.map(([status]) => status)).toEqual([
      'loading',
      'ready'
    ]);
    expect(onCastlePresentationTelemetry).toHaveBeenLastCalledWith({
      presentedModelCount: 1,
      presentedLandscapeBaseCount: 1,
      raycastTargetCount: 1
    });
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    scene.dispose();
    scene.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('bounds a replacement Worker-model preflight before accepting fallback readiness', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const { timers } = installManualWindowTimers();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(
      document.createElement('canvas'),
      {
        surface: createRealmTerrainSurface('worker-model-preflight', 4, 5),
        workers: [outboundWorkerRecord()],
        waitForWorkerModelBeforeReady: true,
        onCastlesReady
      }
    ));

    await vi.waitFor(() => {
      expect([...timers.values()].some(
        (timer) => timer.delayMilliseconds === 1_500
      )).toBe(true);
    });
    expect(onCastlesReady).not.toHaveBeenCalled();
    const [timerId, timer] = [...timers.entries()].find(
      ([, candidate]) => candidate.delayMilliseconds === 1_500
    )!;
    timers.delete(timerId);
    timer.callback();
    expect(onCastlesReady).toHaveBeenCalledOnce();
    expect(onCastlesReady).toHaveBeenCalledWith(1);

    scene.dispose();
  });

  it('reopens Worker-model preflight when an idle replacement becomes active', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const { timers } = installManualWindowTimers();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    let resolveCastle!: (value: unknown) => void;
    keepLoadState.load.mockImplementation(() => new Promise((resolve) => {
      resolveCastle = resolve;
    }));
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(
      document.createElement('canvas'),
      {
        surface: createRealmTerrainSurface('worker-model-dynamic-preflight', 4, 5),
        workers: [idleWorkerRecord()],
        waitForWorkerModelBeforeReady: true,
        onCastlesReady
      }
    ));

    await vi.waitFor(() => expect(resolveCastle).toBeTypeOf('function'));
    scene.reconcileLiveGatheringState({
      goldNodes: [],
      foodNodes: [],
      woodNodes: [],
      stoneNodes: [],
      workers: [outboundWorkerRecord()],
      observedAtMicros: 200_000n
    });
    resolveCastle(loadedCastleAssembly(root));

    await vi.waitFor(() => {
      expect([...timers.values()].some(
        (timer) => timer.delayMilliseconds === 1_500
      )).toBe(true);
    });
    expect(onCastlesReady).not.toHaveBeenCalled();
    const [timerId, timer] = [...timers.entries()].find(
      ([, candidate]) => candidate.delayMilliseconds === 1_500
    )!;
    timers.delete(timerId);
    timer.callback();
    expect(onCastlesReady).toHaveBeenCalledOnce();
    expect(onCastlesReady).toHaveBeenCalledWith(1);

    scene.dispose();
  });

  it('starts optional castle LODs only after Compact reaches playable readiness', async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    keepLoadState.load.mockImplementation((input: unknown) => {
      const quality = (input as { quality: { id: string } }).quality.id;
      return new Promise((resolve) => {
        resolvers.set(quality, resolve);
      });
    });
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      quality: REALM_QUALITY_SPECS.high,
      onCastlesReady
    }));

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledOnce());
    expect((keepLoadState.load.mock.calls[0]?.[0] as { quality: { id: string } }).quality.id)
      .toBe('reduced');
    const compactRoot = new THREE.Group();
    compactRoot.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    resolvers.get('reduced')?.(loadedCastleAssembly(compactRoot, 'compact'));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledTimes(3));
    expect(new Set(keepLoadState.load.mock.calls.map(([input]) => (
      (input as { quality: { id: string } }).quality.id
    )))).toEqual(new Set(['reduced', 'balanced', 'high']));
    expect(canvas.dataset.realmCastleActiveLod).toBe('compact');
    scene.dispose();
  });

  it('keeps the Realm ready at Compact and releases High when Balanced fails', async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    const rejecters = new Map<string, (reason: unknown) => void>();
    keepLoadState.load.mockImplementation((input: unknown) => {
      const quality = (input as { quality: { id: string } }).quality.id;
      return new Promise((resolve, reject) => {
        resolvers.set(quality, resolve);
        rejecters.set(quality, reject);
      });
    });
    const highGeometry = new THREE.BoxGeometry(1, 1, 1);
    const highGeometryDispose = vi.spyOn(highGeometry, 'dispose');
    const highRoot = new THREE.Group();
    highRoot.add(new THREE.Mesh(highGeometry, new THREE.MeshBasicMaterial()));
    const compactRoot = new THREE.Group();
    compactRoot.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      quality: REALM_QUALITY_SPECS.high,
      onCastlesReady,
      onRendererUnavailable
    }));

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledOnce());
    resolvers.get('reduced')?.(loadedCastleAssembly(compactRoot, 'compact'));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledTimes(3));
    resolvers.get('high')?.(loadedCastleAssembly(highRoot, 'high'));
    await Promise.resolve();
    rejecters.get('balanced')?.(new Error('synthetic Balanced transport failure'));
    await vi.waitFor(() => expect(highGeometryDispose).toHaveBeenCalledOnce());
    expect(canvas.dataset.realmCastleActiveLod).toBe('compact');
    expect(canvas.dataset.realmCastlebalancedLod).toBe('unavailable');
    expect(canvas.dataset.realmCastlehighLod).toBe('unavailable');
    expect(onRendererUnavailable).not.toHaveBeenCalled();
    scene.dispose();
  });

  it('genuinely reloads Compact once after a cached retryable rejection', async () => {
    const compactRoot = new THREE.Group();
    compactRoot.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load
      .mockRejectedValueOnce(new Error('synthetic request timed out'))
      .mockResolvedValueOnce(loadedCastleAssembly(compactRoot, 'compact'));
    const onCastlesReady = vi.fn();
    const onRendererFailure = vi.fn();
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
      onCastlesReady,
      onRendererFailure
    }));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
    expect(keepLoadState.load).toHaveBeenCalledTimes(2);
    expect(onRendererFailure).not.toHaveBeenCalled();
    scene.dispose();
  });

  it('does not retry or blur a Compact integrity failure into a transport code', async () => {
    keepLoadState.load.mockRejectedValue(new Error('sha256 integrity mismatch'));
    const onRendererFailure = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
      onRendererFailure,
      onRendererUnavailable
    }));

    await vi.waitFor(() => expect(onRendererUnavailable).toHaveBeenCalledOnce());
    expect(keepLoadState.load).toHaveBeenCalledOnce();
    expect(onRendererFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'castle-integrity-failed',
      retryable: false
    }));
    scene.dispose();
  });

  it('marks a direct label visible only after the live instance frustum admits its model', async () => {
    let resolveLoad: ((value: unknown) => void) | undefined;
    keepLoadState.load.mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 1_024 },
      clientHeight: { configurable: true, value: 768 }
    });
    const onCastleProjection = vi.fn();
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onCastleProjection,
      onCastlesReady
    }));

    // Force a demand frame while the prefab is pending. The 2D envelope is
    // already projectable, but it cannot advertise a castle that has no live
    // instance-layer frustum membership yet.
    scene.setSelected(null);
    const pendingProjection = onCastleProjection.mock.calls.at(-1)?.[0];
    expect(pendingProjection?.castles[0]?.conservativeCastleBounds).toBeDefined();
    expect(pendingProjection?.castles[0]?.visible).toBe(false);

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledOnce());
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    resolveLoad?.(loadedCastleAssembly(root));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
    const liveProjection = onCastleProjection.mock.calls.at(-1)?.[0];
    expect(liveProjection?.castles[0]).toMatchObject({
      castleId: 1,
      visible: true,
      presented: true
    });

    scene.dispose();
  });

  it('coalesces hidden-tab demand renders into one visibility recovery frame', async () => {
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onCastlesReady
    }));

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledTimes(1));
    expect(onCastlesReady).not.toHaveBeenCalled();
    scene.setHovered({ q: 0, r: 0 });
    scene.setSelected({ q: 0, r: 0 });
    scene.setSelectedCastleId(1);
    expect(webglState.instances[0].render).not.toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(webglState.instances[0].render).toHaveBeenCalledTimes(1);
    expect(onCastlesReady).toHaveBeenCalledOnce();
    expect(onCastlesReady).toHaveBeenCalledWith(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(webglState.instances[0].render).toHaveBeenCalledTimes(1);

    scene.dispose();
  });

  it('keeps terrain overlays outside authored castle landscape bases', () => {
    const canvas = document.createElement('canvas');
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-overlay-castle-clearance', 1, 1),
      reducedMotion: true
    }));
    const renderedScene = webglState.instances[0].render.mock.calls.at(-1)?.[0] as THREE.Scene;
    const overlays = renderedScene.children.filter(
      (child): child is THREE.LineLoop => child instanceof THREE.LineLoop
    );
    const [hoverOverlay, selectedOverlay] = overlays;

    expect(overlays).toHaveLength(2);
    scene.setHovered({ q: 1, r: 0 });
    expect(hoverOverlay?.visible).toBe(true);
    scene.setHovered({ q: 0, r: 0 });
    expect(hoverOverlay?.visible).toBe(false);

    scene.setSelected({ q: 1, r: 0 });
    expect(selectedOverlay?.visible).toBe(true);
    scene.setSelected({ q: 0, r: 0 });
    expect(selectedOverlay?.visible).toBe(false);

    scene.setSelected({ q: 1, r: 0 });
    scene.setSelectedCastleId(1);
    expect(selectedOverlay?.visible).toBe(false);

    scene.dispose();
  });

  it('releases prefab leases even when layer-owned disposal throws', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const scene = createRealmScene(createOptions(canvas, { onCastlesReady }));
    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementationOnce(() => {
      throw new Error('synthetic layer disposal failure');
    });

    scene.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('focuses only playable, authoritatively passable terrain cells', () => {
    const canvas = document.createElement('canvas');
    const isCoordPassable = vi.fn((coord: Readonly<{ q: number; r: number }>) => {
      if (coord.q === 0 && coord.r === 1) throw new Error('metadata unavailable');
      return coord.q === 1 && coord.r === 0;
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-scene-focus-cell', 1, 1),
      reducedMotion: true,
      isCoordPassable
    }));
    const renderer = webglState.instances[0];
    const camera = renderer.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const initialPosition = camera.position.clone();
    renderer.render.mockClear();

    scene.focusCell({ q: 1, r: 0 });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(camera.position.equals(initialPosition)).toBe(false);

    scene.focusCell({ q: 0, r: 0 });
    scene.focusCell({ q: 0, r: 1 });
    const passabilityChecks = isCoordPassable.mock.calls.length;
    scene.focusCell({ q: 9, r: 9 });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(isCoordPassable).toHaveBeenCalledTimes(passabilityChecks);

    scene.dispose();
  });

  it('locates a playable cell without changing zoom and exposes aggregate camera bands', () => {
    const canvas = document.createElement('canvas');
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-scene-locate-cell', 2, 2),
      reducedMotion: true,
      isCoordPassable: () => true
    }));
    scene.frameFoundingDistrict();
    const before = scene.getCameraAttestation();

    scene.locateCell({ q: 1, r: 0 });
    const located = scene.getCameraAttestation();

    expect(located.zoom).toBe(before.zoom);
    expect(located.mode).toBe(before.mode);
    expect(located.target).not.toEqual(before.target);
    expect(located.controllerState.targetZoom).toBe(before.controllerState.targetZoom);
    expect(canvas.dataset.realmCameraMode).toBe(located.mode);
    expect(canvas.dataset.realmCameraPresentationBand).toMatch(
      /^(overview|strategy|close)$/
    );
    expect(canvas.dataset.realmCameraModeTransitionCount).toMatch(/^\d+$/);
    expect(canvas.dataset.realmCameraInertialReleaseCount).toMatch(/^\d+$/);
    expect(canvas.dataset.realmCameraInertiaCancellationCount).toMatch(/^\d+$/);
    expect(canvas.dataset.realmCameraInertiaActive).toMatch(/^(true|false)$/);
    expect(canvas.dataset.realmCameraZoom).toMatch(/^\d+\.\d{6}$/);

    scene.focusCell({ q: 0, r: 1 });
    expect(scene.getCameraAttestation()).toMatchObject({
      zoom: 1,
      mode: 'keep'
    });
    scene.dispose();
  });

  it('locates only exact clear or haze Water cells and keeps full fog out of camera authority', () => {
    const canvas = document.createElement('canvas');
    const scene = createRealmScene(createOptions(canvas, {
      waterCells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true
    }));
    const renderer = webglState.instances[0]!;
    const clearOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find((cell) => (
      cell.regime === 'ocean' && cell.fogBand === 'clear'
    ))!;
    const hazeOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find((cell) => (
      cell.regime === 'ocean' && cell.fogBand === 'haze'
    ))!;
    const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find((cell) => (
      cell.regime === 'river' && cell.fogBand !== 'full'
    ))!;
    const fullFogOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find((cell) => (
      cell.regime === 'ocean' && cell.fogBand === 'full'
    ))!;
    const initialZoom = scene.getCameraAttestation().zoom;

    for (const cell of [clearOcean, hazeOcean, river]) {
      renderer.render.mockClear();
      scene.locateCell({ q: cell.q, r: cell.r });
      const world = axialToWorld(cell, 1);
      const attestation = scene.getCameraAttestation();
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(attestation.target.x).toBeCloseTo(world.x, 6);
      expect(attestation.target.z).toBeCloseTo(world.z, 6);
      expect(attestation.zoom).toBe(initialZoom);
    }

    renderer.render.mockClear();
    scene.locateCell({ q: fullFogOcean.q, r: fullFogOcean.r });
    scene.locateCell({ q: 70, r: -70 });
    expect(renderer.render).not.toHaveBeenCalled();

    scene.dispose();
  });

  it('locates a castle without replacing the current zoom while normal focus still closes in', () => {
    const canvas = document.createElement('canvas');
    const surface = createRealmTerrainSurface('realm-scene-locate-castle', 4, 5);
    const options = {
      surface,
      otherCastles: [{ castleId: 2, q: 2, r: -1 }],
      reducedMotion: true
    } as const;
    const scene = createRealmScene(createOptions(canvas, options));
    scene.frameFoundingDistrict();
    const before = scene.getCameraAttestation();

    scene.locateCastle(2);
    const located = scene.getCameraAttestation();

    expect(located.zoom).toBe(before.zoom);
    expect(located.mode).toBe(before.mode);
    expect(located.target).not.toEqual(before.target);
    expect(located.controllerState.targetZoom).toBe(before.controllerState.targetZoom);

    const recovered = createRealmScene(createOptions(
      document.createElement('canvas'),
      options
    ));
    const recoveredRenderer = webglState.instances.at(-1)!;
    recoveredRenderer.render.mockClear();
    recovered.restoreCameraAttestation?.(located);
    const restored = recovered.getCameraAttestation();
    expect(restored.zoom).toBe(located.zoom);
    expect(restored.mode).toBe(located.mode);
    expect(restored.position).toEqual(located.position);
    expect(restored.target).toEqual(located.target);
    expect(restored.controllerState).toEqual(located.controllerState);
    expect(recoveredRenderer.render).toHaveBeenCalled();

    scene.focusCastle(2);
    const focused = scene.getCameraAttestation();
    expect(focused.zoom).toBe(1);
    expect(focused.mode).toBe('keep');

    recovered.dispose();
    scene.dispose();
  });

  it('suppresses click selection after drag and pinch gestures', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([{
      point: new THREE.Vector3(0, 0, 0),
      distance: 1
    }] as THREE.Intersection[]);
    const onTargetSelect = vi.fn();
    const scene = createRealmScene(createOptions(canvas, { onTargetSelect }));

    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onTargetSelect).toHaveBeenCalledTimes(1);
    onTargetSelect.mockClear();

    dispatchPointer(canvas, 'pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });
    dispatchPointer(canvas, 'pointermove', { pointerId: 2, clientX: 120, clientY: 100 });
    dispatchPointer(canvas, 'pointerup', { pointerId: 2, clientX: 120, clientY: 100 });
    expect(onTargetSelect).not.toHaveBeenCalled();

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 3,
      clientX: 180,
      clientY: 180,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 4,
      clientX: 220,
      clientY: 180,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 4,
      clientX: 240,
      clientY: 180,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 4,
      clientX: 240,
      clientY: 180,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 3,
      clientX: 180,
      clientY: 180,
      pointerType: 'touch'
    });
    expect(onTargetSelect).not.toHaveBeenCalled();

    scene.dispose();
  });

  it('adds bounded foreground hit tolerance only for touch taps', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const onCastlesReady = vi.fn();
    const onTargetSelect = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onTargetSelect
    }));
    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));

    const renderedScene = (
      webglState.instances.at(-1)?.render.mock.calls.at(-1)?.[0]
    ) as THREE.Scene;
    let castleMesh: THREE.InstancedMesh | undefined;
    renderedScene.traverse((candidate) => {
      if (
        candidate instanceof THREE.InstancedMesh
        && candidate.name.startsWith('hegemony-castles-')
      ) castleMesh = candidate;
    });
    expect(castleMesh).toBeInstanceOf(THREE.InstancedMesh);
    if (!castleMesh) throw new Error('Castle instance mesh was not presented.');

    let castleRaycastCount = 0;
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockImplementation(() => {
      castleRaycastCount += 1;
      return castleRaycastCount === 2 ? [{
        distance: 1,
        instanceId: 0,
        object: castleMesh!,
        point: new THREE.Vector3()
      } as THREE.Intersection] : [];
    });
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([]);

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 51,
      clientX: 400,
      clientY: 300,
      pointerType: 'mouse'
    });
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 51,
      clientX: 400,
      clientY: 300,
      pointerType: 'mouse'
    });
    expect(castleRaycastCount).toBe(1);
    expect(onTargetSelect).not.toHaveBeenCalled();

    castleRaycastCount = 0;
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 52,
      clientX: 400,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 52,
      clientX: 400,
      clientY: 300,
      pointerType: 'touch'
    });
    expect(castleRaycastCount).toBe(2);
    expect(onTargetSelect).toHaveBeenCalledWith({
      kind: 'castle',
      castleId: 1,
      coord: { q: 0, r: 0 }
    });

    scene.dispose();
  });

  it('selects the viewer keep from the canvas without changing camera state', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    const onCastlesReady = vi.fn();
    const onTargetSelect = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onTargetSelect
    }));
    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));

    const renderedScene = (
      webglState.instances.at(-1)?.render.mock.calls.at(-1)?.[0]
    ) as THREE.Scene;
    let castleMesh: THREE.InstancedMesh | undefined;
    renderedScene.traverse((candidate) => {
      if (
        candidate instanceof THREE.InstancedMesh
        && candidate.name.startsWith('hegemony-castles-')
      ) {
        castleMesh = candidate;
      }
    });
    expect(castleMesh).toBeInstanceOf(THREE.InstancedMesh);
    if (!castleMesh) throw new Error('Castle instance mesh was not presented.');
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([{
      distance: 1,
      instanceId: 0,
      object: castleMesh,
      point: new THREE.Vector3()
    }]);
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([]);

    const cameraBeforeSelection = scene.getCameraAttestation();
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: 400, clientY: 300 });
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: 400, clientY: 300 });

    expect(onTargetSelect).toHaveBeenCalledWith({
      kind: 'castle',
      castleId: 1,
      coord: { q: 0, r: 0 }
    });
    const cameraAfterSelection = scene.getCameraAttestation();
    expect(cameraAfterSelection.position).toEqual(cameraBeforeSelection.position);
    expect(cameraAfterSelection.target).toEqual(cameraBeforeSelection.target);
    expect(cameraAfterSelection.zoom).toBe(cameraBeforeSelection.zoom);
    expect(cameraAfterSelection.mode).toBe(cameraBeforeSelection.mode);
    expect(cameraAfterSelection.controllerState).toEqual(
      cameraBeforeSelection.controllerState
    );
    scene.dispose();
  });

  it('pans a Mini App pinch centroid without changing the final pinch scale', () => {
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    root.dataset.realmChromeMode = 'miniapp';
    const canvas = document.createElement('canvas');
    canvas.className = 'realm-map-screen__canvas';
    const label = document.createElement('button');
    label.className = 'realm-castle-label';
    label.type = 'button';
    root.append(canvas, label);
    document.body.append(root);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-pinch-centroid', 4, 5),
      reducedMotion: true
    }));
    scene.frameFoundingDistrict();
    const renderer = webglState.instances[0];
    const camera = renderer.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const initialPosition = camera.position.clone();

    dispatchPointer(label, 'pointerdown', {
      pointerId: 1,
      clientX: 300,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 2,
      clientX: 500,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 1,
      clientX: 320,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 2,
      clientX: 520,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 2,
      clientX: 520,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 1,
      clientX: 320,
      clientY: 300,
      pointerType: 'touch'
    });

    expect(camera.position.y).toBeCloseTo(initialPosition.y, 5);
    expect(Math.hypot(
      camera.position.x - initialPosition.x,
      camera.position.z - initialPosition.z
    )).toBeGreaterThan(0.001);

    scene.dispose();
    root.remove();
  });

  it('keeps Mini App pinch zoom cadence-independent and gentler than standard web', () => {
    let nextFrameId = 1;
    let frameTime = 0;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      scheduled.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      scheduled.delete(frameId);
    });
    const flushQueuedFrames = () => {
      const callbacks = [...scheduled.values()];
      scheduled.clear();
      frameTime += 16;
      callbacks.forEach((callback) => callback(frameTime));
    };
    const runPinch = (
      stepCount: number,
      chromeMode: 'miniapp' | 'desktop-web',
      flushBetweenMoves = false
    ) => {
      const root = document.createElement('main');
      root.className = 'realm-map-screen';
      root.dataset.realmChromeMode = chromeMode;
      const canvas = document.createElement('canvas');
      canvas.className = 'realm-map-screen__canvas';
      root.append(canvas);
      document.body.append(root);
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 600,
        left: 0,
        width: 800,
        height: 600,
        toJSON: () => ({})
      });
      Object.defineProperties(canvas, {
        clientWidth: { configurable: true, value: 800 },
        clientHeight: { configurable: true, value: 600 },
        setPointerCapture: { configurable: true, value: vi.fn() },
        releasePointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
      });
      const scene = createRealmScene(createOptions(canvas, {
        surface: createRealmTerrainSurface(
          `realm-pinch-cadence-${chromeMode}-${stepCount}`,
          4,
          5
        ),
        reducedMotion: true
      }));
      scene.frameFoundingDistrict();
      scheduled.clear();
      const initialZoom = scene.getCameraAttestation().zoom;

      dispatchPointer(canvas, 'pointerdown', {
        pointerId: 1,
        clientX: 300,
        clientY: 300,
        pointerType: 'touch'
      });
      dispatchPointer(canvas, 'pointerdown', {
        pointerId: 2,
        clientX: 500,
        clientY: 300,
        pointerType: 'touch'
      });
      for (let step = 1; step <= stepCount; step += 1) {
        dispatchPointer(canvas, 'pointermove', {
          pointerId: 2,
          clientX: 500 + (100 * step) / stepCount,
          clientY: 300,
          pointerType: 'touch'
        });
        if (flushBetweenMoves) flushQueuedFrames();
      }
      dispatchPointer(window, 'pointerup', {
        pointerId: 2,
        clientX: 600,
        clientY: 300,
        pointerType: 'touch'
      });
      dispatchPointer(window, 'pointerup', {
        pointerId: 1,
        clientX: 300,
        clientY: 300,
        pointerType: 'touch'
      });

      const zoomDelta = scene.getCameraAttestation().zoom - initialZoom;
      scene.dispose();
      root.remove();
      scheduled.clear();
      return zoomDelta;
    };

    const sparseMiniApp = runPinch(1, 'miniapp');
    const denseMiniApp = runPinch(10, 'miniapp', true);
    const standardWeb = runPinch(1, 'desktop-web');

    expect(sparseMiniApp).not.toBe(0);
    expect(denseMiniApp).toBeCloseTo(sparseMiniApp, 10);
    expect(Math.abs(sparseMiniApp)).toBeLessThan(Math.abs(standardWeb));
  });

  it('does not inherit pan-release inertia when a second finger only starts a pinch', () => {
    let nextFrameId = 1;
    let frameTime = 0;
    let gestureTime = 0;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => gestureTime);
    const flushNextFrame = () => {
      const next = scheduled.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!next) return false;
      scheduled.delete(next[0]);
      frameTime += 16;
      next[1](frameTime);
      return true;
    };

    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) }
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-pinch-reset-inertia', 4, 5)
    }));
    scene.focusCell({ q: 0, r: 0 });
    for (let frame = 0; frame < 240; frame += 1) {
      const attestation = scene.getCameraAttestation();
      if (
        Math.abs(attestation.controllerState.currentZoom
          - attestation.controllerState.targetZoom) < 0.000_001
      ) break;
      expect(flushNextFrame()).toBe(true);
    }
    scheduled.clear();

    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 31,
      clientX: 300,
      clientY: 300,
      pointerType: 'touch'
    });
    gestureTime = 16;
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 31,
      clientX: 330,
      clientY: 310,
      pointerType: 'touch'
    });
    gestureTime = 32;
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 31,
      clientX: 360,
      clientY: 320,
      pointerType: 'touch'
    });
    expect(flushNextFrame()).toBe(true);
    gestureTime = 48;
    dispatchPointer(canvas, 'pointermove', {
      pointerId: 31,
      clientX: 390,
      clientY: 330,
      pointerType: 'touch'
    });
    expect(flushNextFrame()).toBe(true);

    gestureTime = 49;
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 32,
      clientX: 500,
      clientY: 330,
      pointerType: 'touch'
    });
    gestureTime = 50;
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 32,
      clientX: 500,
      clientY: 330,
      pointerType: 'touch'
    });
    gestureTime = 51;
    dispatchPointer(canvas, 'pointerup', {
      pointerId: 31,
      clientX: 390,
      clientY: 330,
      pointerType: 'touch'
    });

    const released = scene.getCameraAttestation();
    expect(released.controllerState.targetPan).toEqual(
      released.controllerState.currentPan
    );
    expect(released.controllerState.targetFocus).toEqual(
      released.controllerState.currentFocus
    );
    expect(canvas.dataset.realmCameraInertialReleaseCount).toBe('0');
    expect(canvas.dataset.realmCameraInertiaActive).toBe('false');

    scene.dispose();
  });

  it('shares first-attempt drag and wheel control with permanent castle labels', () => {
    const { timers } = installManualWindowTimers();
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    canvas.className = 'realm-map-screen__canvas';
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'realm-castle-label';
    label.dataset.castleId = '1';
    label.textContent = '@fixture-keeper';
    root.append(canvas, label);
    document.body.append(root);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const onLabelClick = vi.fn();
    label.addEventListener('click', onLabelClick);
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-label-gesture', 4, 5),
      reducedMotion: true
    }));
    scene.frameFoundingDistrict();
    const renderer = webglState.instances[0];
    const camera = renderer.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const beforeDrag = camera.position.clone();

    dispatchPointer(label, 'pointerdown', {
      pointerId: 21,
      clientX: 380,
      clientY: 310
    });
    dispatchPointer(window, 'pointermove', {
      pointerId: 21,
      clientX: 383,
      clientY: 310
    });
    dispatchPointer(window, 'pointermove', {
      pointerId: 21,
      clientX: 410,
      clientY: 322
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 21,
      clientX: 410,
      clientY: 322
    });
    expect([...timers.values()].map(({ delayMilliseconds }) => (
      delayMilliseconds
    ))).toEqual([750]);
    label.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));

    expect(camera.position.distanceTo(beforeDrag)).toBeGreaterThan(0.001);
    expect(onLabelClick).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
    expect(canvas.dataset.dragging).toBeUndefined();
    expect(root.dataset.cameraInteracting).toBeUndefined();

    // A pointer-drag guard is scoped to the compatibility click only; keyboard
    // and assistive activation (`detail === 0`) remains available immediately.
    label.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 0
    }));
    expect(onLabelClick).toHaveBeenCalledOnce();

    dispatchPointer(label, 'pointerdown', {
      pointerId: 22,
      clientX: 400,
      clientY: 320
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 22,
      clientX: 400,
      clientY: 320
    });
    label.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
    expect(onLabelClick).toHaveBeenCalledTimes(2);

    dispatchPointer(label, 'pointerdown', {
      pointerId: 23,
      clientX: 400,
      clientY: 320
    });
    dispatchPointer(window, 'pointercancel', {
      pointerId: 23,
      clientX: 400,
      clientY: 320,
      buttons: 0
    });
    label.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 0
    }));
    expect(onLabelClick).toHaveBeenCalledTimes(3);

    const beforeWheel = camera.position.clone();
    label.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 420,
      clientY: 300,
      deltaY: -240,
      deltaMode: 0
    }));
    expect(camera.position.distanceTo(beforeWheel)).toBeGreaterThan(0.001);

    scene.dispose();
    root.remove();
  });

  it('shares touch tap, pan, and pinch ownership with every interactive map-world control', () => {
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    canvas.className = 'realm-map-screen__canvas';
    const controls = [
      'realm-castle-label',
      'realm-worker-presence-marker',
      'realm-resource-occupant-marker'
    ].map((className) => {
      const control = document.createElement('button');
      control.className = className;
      control.type = 'button';
      return control;
    });
    root.append(canvas, ...controls);
    document.body.append(root);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const clicks = controls.map(() => vi.fn());
    const captureSpies = controls.map(() => vi.fn());
    controls.forEach((control, index) => {
      control.addEventListener('click', clicks[index]);
      Object.defineProperties(control, {
        setPointerCapture: {
          configurable: true,
          value: captureSpies[index]
        },
        releasePointerCapture: {
          configurable: true,
          value: vi.fn()
        },
        hasPointerCapture: {
          configurable: true,
          value: vi.fn(() => true)
        }
      });
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-world-control-touch', 4, 5),
      reducedMotion: true
    }));
    scene.frameFoundingDistrict();

    controls.forEach((control, index) => {
      const pointerId = 100 + index;
      const x = 250 + index * 40;
      dispatchPointer(control, 'pointerdown', {
        pointerId,
        pointerType: 'touch',
        clientX: x,
        clientY: 280
      });
      const jitter = dispatchPointer(window, 'pointermove', {
        pointerId,
        pointerType: '',
        buttons: 0,
        clientX: x + 8,
        clientY: 280
      });
      dispatchPointer(window, 'pointerup', {
        pointerId,
        pointerType: 'touch',
        buttons: 0,
        clientX: x + 8,
        clientY: 280
      });
      control.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1
      }));

      expect(jitter.defaultPrevented).toBe(false);
      expect(clicks[index]).toHaveBeenCalledOnce();
      expect(captureSpies[index]).not.toHaveBeenCalled();

      dispatchPointer(control, 'pointerdown', {
        pointerId: pointerId + 10,
        pointerType: 'touch',
        clientX: x,
        clientY: 300
      });
      const drag = dispatchPointer(window, 'pointermove', {
        pointerId: pointerId + 10,
        pointerType: '',
        buttons: 0,
        clientX: x + 18,
        clientY: 306
      });
      dispatchPointer(window, 'pointerup', {
        pointerId: pointerId + 10,
        pointerType: 'touch',
        buttons: 0,
        clientX: x + 18,
        clientY: 306
      });
      control.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1
      }));

      expect(drag.defaultPrevented).toBe(true);
      expect(clicks[index]).toHaveBeenCalledOnce();
      expect(captureSpies[index]).toHaveBeenCalledWith(pointerId + 10);
    });

    const beforePinch = scene.getCameraAttestation();
    dispatchPointer(controls[1]!, 'pointerdown', {
      pointerId: 201,
      pointerType: 'touch',
      clientX: 280,
      clientY: 320
    });
    const secondDown = dispatchPointer(controls[2]!, 'pointerdown', {
      pointerId: 202,
      pointerType: 'touch',
      clientX: 520,
      clientY: 320
    });
    dispatchPointer(window, 'pointermove', {
      pointerId: 202,
      pointerType: '',
      buttons: 0,
      clientX: 570,
      clientY: 320
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 202,
      pointerType: 'touch',
      buttons: 0,
      clientX: 570,
      clientY: 320
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 201,
      pointerType: 'touch',
      buttons: 0,
      clientX: 280,
      clientY: 320
    });
    for (const index of [1, 2]) {
      controls[index]!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1
      }));
    }

    const afterPinch = scene.getCameraAttestation();
    expect(secondDown.defaultPrevented).toBe(true);
    expect(afterPinch.zoom).not.toBe(beforePinch.zoom);
    expect(clicks[1]).toHaveBeenCalledOnce();
    expect(clicks[2]).toHaveBeenCalledOnce();
    expect(canvas.dataset.dragging).toBeUndefined();
    expect(root.dataset.cameraInteracting).toBeUndefined();

    scene.dispose();
    root.remove();
  });

  it('keeps Inner Keep pan, pinch, wheel, and exact slot picks solely on the canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    canvas.className = 'realm-map-screen__canvas';
    root.append(canvas);
    document.body.append(root);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const onInnerKeepSceneStatusChange = vi.fn();
    const onInnerKeepSlotSelect = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      reducedMotion: true,
      onInnerKeepSceneStatusChange,
      onInnerKeepSlotSelect
    }));
    scene.reconcileInnerKeepPresentation?.(
      createInnerKeepPresentation(),
      { owningTerrainKind: 'meadow' }
    );
    scene.setSceneMode?.('INNER_KEEP');
    await vi.waitFor(() => {
      expect(onInnerKeepSceneStatusChange).toHaveBeenCalledWith('ready');
    });

    const renderer = webglState.instances[0]!;
    const innerRender = () => {
      const call = [...renderer.render.mock.calls].reverse().find(([candidate]) => (
        (candidate as THREE.Scene).getObjectByName(
          'inner-keep-slot-pad:inner-keep-slot-m01'
        ) !== undefined
      ));
      if (!call) throw new Error('Missing Inner Keep render.');
      return {
        scene: call[0] as THREE.Scene,
        camera: call[1] as THREE.OrthographicCamera
      };
    };
    const projectedSlotCenter = () => {
      const current = innerRender();
      const pad = current.scene.getObjectByName(
        'inner-keep-slot-pad:inner-keep-slot-m01'
      );
      if (!pad) throw new Error('Missing Inner Keep test pad.');
      current.scene.updateMatrixWorld(true);
      current.camera.updateMatrixWorld(true);
      const projected = pad.getWorldPosition(new THREE.Vector3()).project(current.camera);
      return {
        x: (projected.x + 1) * 400,
        y: (1 - projected.y) * 300
      };
    };

    const beforeDrag = projectedSlotCenter();
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 301,
      pointerType: 'touch',
      clientX: beforeDrag.x,
      clientY: beforeDrag.y
    });
    const drag = dispatchPointer(window, 'pointermove', {
      pointerId: 301,
      pointerType: '',
      buttons: 0,
      clientX: beforeDrag.x + 54,
      clientY: beforeDrag.y + 22
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 301,
      pointerType: 'touch',
      buttons: 0,
      clientX: beforeDrag.x + 54,
      clientY: beforeDrag.y + 22
    });
    const afterDrag = projectedSlotCenter();
    expect(drag.defaultPrevented).toBe(true);
    expect(afterDrag.x).not.toBeCloseTo(beforeDrag.x, 2);
    expect(afterDrag.y).not.toBeCloseTo(beforeDrag.y, 2);
    expect(onInnerKeepSlotSelect).not.toHaveBeenCalled();

    const camera = innerRender().camera;
    const beforeWheelSpan = camera.right - camera.left;
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: afterDrag.x,
      clientY: afterDrag.y,
      deltaY: -240,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL
    });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(camera.right - camera.left).toBeLessThan(beforeWheelSpan);

    const beforePinchSpan = camera.right - camera.left;
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 302,
      pointerType: 'touch',
      clientX: 260,
      clientY: 320
    });
    const secondDown = dispatchPointer(canvas, 'pointerdown', {
      pointerId: 303,
      pointerType: 'touch',
      clientX: 540,
      clientY: 320
    });
    dispatchPointer(window, 'pointermove', {
      pointerId: 303,
      pointerType: '',
      buttons: 0,
      clientX: 600,
      clientY: 320
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 303,
      pointerType: 'touch',
      buttons: 0,
      clientX: 600,
      clientY: 320
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 302,
      pointerType: 'touch',
      buttons: 0,
      clientX: 260,
      clientY: 320
    });
    expect(secondDown.defaultPrevented).toBe(true);
    expect(camera.right - camera.left).not.toBeCloseTo(beforePinchSpan, 4);

    const afterCameraMotion = projectedSlotCenter();
    dispatchPointer(canvas, 'pointerdown', {
      pointerId: 304,
      clientX: afterCameraMotion.x,
      clientY: afterCameraMotion.y
    });
    dispatchPointer(window, 'pointerup', {
      pointerId: 304,
      buttons: 0,
      clientX: afterCameraMotion.x,
      clientY: afterCameraMotion.y
    });
    expect(onInnerKeepSlotSelect).toHaveBeenCalledWith('inner-keep-slot-m01');
    expect(canvas.dataset.dragging).toBeUndefined();
    expect(root.dataset.cameraInteracting).toBeUndefined();

    scene.dispose();
    root.remove();
  });

  it('coalesces high-rate label dragging to one WebGL render per animation frame', () => {
    let nextFrameId = 1;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    const root = document.createElement('main');
    root.className = 'realm-map-screen';
    const canvas = document.createElement('canvas');
    canvas.className = 'realm-map-screen__canvas';
    const label = document.createElement('button');
    label.className = 'realm-castle-label';
    label.type = 'button';
    root.append(canvas, label);
    document.body.append(root);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    });
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    const scene = createRealmScene(createOptions(canvas, {
      surface: createRealmTerrainSurface('realm-coalesced-drag', 4, 5),
      reducedMotion: true
    }));
    scene.frameFoundingDistrict();
    const renderer = webglState.instances[0];
    renderer.render.mockClear();
    scheduled.clear();

    dispatchPointer(label, 'pointerdown', {
      pointerId: 31,
      clientX: 360,
      clientY: 300
    });
    [363, 370, 390, 430].forEach((clientX) => {
      dispatchPointer(window, 'pointermove', {
        pointerId: 31,
        clientX,
        clientY: 312
      });
    });

    expect(scheduled.size).toBe(1);
    expect(renderer.render).not.toHaveBeenCalled();
    const frame = scheduled.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    expect(frame).toBeDefined();
    if (frame) {
      scheduled.delete(frame[0]);
      frame[1](16);
    }
    expect(renderer.render).toHaveBeenCalledTimes(1);

    dispatchPointer(window, 'pointerup', {
      pointerId: 31,
      clientX: 430,
      clientY: 312,
      buttons: 0
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.dragging).toBeUndefined();
    expect(root.dataset.cameraInteracting).toBeUndefined();

    scene.dispose();
    root.remove();
  });

  it('fails readiness when a castle instance is present without its matching landscape base', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockResolvedValue({
      root,
      visualHeight: 1,
      footprintDiameter: 1,
      assetUrl: '/castle-compact.glb'
    });
    const onCastlesReady = vi.fn();
    const onCastlePresentationTelemetry = vi.fn();
    const onRendererUnavailable = vi.fn();
    const canvas = document.createElement('canvas');
    const canvasRemove = vi.spyOn(canvas, 'removeEventListener');
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onCastlePresentationTelemetry,
      onRendererUnavailable
    }));

    await vi.waitFor(() => {
      expect(onRendererUnavailable).toHaveBeenCalledOnce();
    });
    expect(onCastlesReady).not.toHaveBeenCalled();
    expect(onCastlePresentationTelemetry).toHaveBeenLastCalledWith({
      presentedModelCount: 1,
      presentedLandscapeBaseCount: 0,
      raycastTargetCount: 1
    });
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
    expect(ambientSchedulerState.creations.at(-1)?.isActive()).toBe(false);
    expect(listenerCalls(canvasRemove, 'pointerdown')).toBe(1);
    expect(listenerCalls(canvasRemove, 'wheel')).toBe(1);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();

    scene.dispose();
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
  });

  it('fails readiness when equal castle/base counts hide a mismatched base transform', async () => {
    const originalSetMatrixAt = THREE.InstancedMesh.prototype.setMatrixAt;
    vi.spyOn(THREE.InstancedMesh.prototype, 'setMatrixAt').mockImplementation(function (
      this: THREE.InstancedMesh,
      index,
      matrix
    ) {
      if (this.name.startsWith('hegemony-castle-landscape-bases-')) {
        const shifted = matrix.clone();
        shifted.elements[12] = (shifted.elements[12] ?? 0) + 0.75;
        return originalSetMatrixAt.call(this, index, shifted);
      }
      return originalSetMatrixAt.call(this, index, matrix);
    });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load.mockResolvedValue(loadedCastleAssembly(root));
    const onCastlesReady = vi.fn();
    const onCastlePresentationTelemetry = vi.fn();
    const onRendererUnavailable = vi.fn();
    const canvas = document.createElement('canvas');
    const canvasRemove = vi.spyOn(canvas, 'removeEventListener');
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onCastlePresentationTelemetry,
      onRendererUnavailable
    }));

    await vi.waitFor(() => expect(onRendererUnavailable).toHaveBeenCalledOnce());
    expect(onCastlesReady).not.toHaveBeenCalled();
    expect(onCastlePresentationTelemetry).toHaveBeenLastCalledWith({
      presentedModelCount: 1,
      presentedLandscapeBaseCount: 1,
      raycastTargetCount: 1
    });
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
    expect(ambientSchedulerState.creations.at(-1)?.isActive()).toBe(false);
    expect(listenerCalls(canvasRemove, 'pointerdown')).toBe(1);
    expect(listenerCalls(canvasRemove, 'wheel')).toBe(1);

    scene.dispose();
    expect(webglState.instances[0].dispose).toHaveBeenCalledOnce();
  });

  it('fails closed to the illustrated renderer when prefab initialization fails', async () => {
    keepLoadState.load.mockRejectedValue(new Error('synthetic prefab failure'));
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const onKeepStatusChange = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onKeepStatusChange,
      onRendererUnavailable
    }));

    await vi.waitFor(() => {
      expect(onRendererUnavailable).toHaveBeenCalledTimes(1);
    });
    expect(onCastlesReady).not.toHaveBeenCalled();
    expect(onKeepStatusChange.mock.calls.map(([status]) => status)).toEqual([
      'loading',
      'fallback'
    ]);
    expect(webglState.instances[0].dispose).toHaveBeenCalledTimes(1);

    scene.dispose();
    expect(webglState.instances[0].dispose).toHaveBeenCalledTimes(1);
  });
});
