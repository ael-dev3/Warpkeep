import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webglState = vi.hoisted(() => ({
  failGrassShaderContractOnce: false,
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
      if (!webglState.failGrassShaderContractOnce) return;
      webglState.failGrassShaderContractOnce = false;
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
      ambientSchedulerState.creations.push({
        active: options.active,
        isActive: scheduler.isActive,
        step: options.onStep
      });
      return scheduler;
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
  createRealmScene,
  REALM_CASTLE_READABILITY_LIGHTING,
  resolveRealmViewportSize,
  resolveRealmPinchGesture,
  type CreateRealmSceneOptions
} from '../src/components/realm/createRealmScene';
import { hexKey } from '../src/game/map/hexCoordinates';
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

type ListenerSpy = ReturnType<typeof vi.spyOn>;

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

describe('realm scene setup cleanup', () => {
  const resizeObservers: Array<{
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    webglState.failGrassShaderContractOnce = false;
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

  it('keeps land-only navigation and rejects Water focus when its layer fails to construct', () => {
    waterLayerState.failNextCreation = true;
    const canvas = document.createElement('canvas');
    const scene = createRealmScene(createOptions(canvas, {
      waterCells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      reducedMotion: true
    }));
    const renderer = webglState.instances[0]!;

    expect(canvas.dataset.waterPresentation).toBe('unavailable');
    expect(canvas.dataset.waterNavigation).toBe('land-only');
    renderer.render.mockClear();
    scene.focusWaterCell(GENESIS_WATER_REVISION_ENABLED_CELLS_V1[0]!.cellKey);
    expect(renderer.render).not.toHaveBeenCalled();

    scene.dispose();
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
      semanticCellCount: 1,
      semanticKindCount: 1,
      semanticFeatureCount: 0,
      semanticFeatureDrawCalls: 0,
      totalDetailInstanceCount: expect.any(Number),
      totalDetailDrawCalls: expect.any(Number),
      forestPlacementSource: 'legacy-fallback',
      forestSharedTreeCount: 0,
      grassCandidateCellCount: 0,
      grassActiveCellCount: 0,
      grassInstanceCount: 0,
      grassTriangleCount: 0,
      grassDrawCalls: 0,
      grassCacheEntries: 0,
      grassAnimated: false,
      grassTargetAnimationCadence: 0,
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
      grassCompletelyBareActiveCells: 0,
      grassRejectedByStructureClearance: 0,
      grassRejectedBySlope: 0,
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
  }, 15_000);

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
    expect(terrain.material.roughness).toBe(0.96);
    expect(terrain.material.metalness).toBe(0);

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
    expect(webglState.instances[0].render).toHaveBeenCalledTimes(2);
    sceneHandle.dispose();
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

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(canvas.dataset.realmRendererContextLost).toBe('true');
    expect(canvas.dataset.realmRendererContextLossCount).toBe('1');
    expect(ambient.isActive()).toBe(false);
    expect(onRendererFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'context-lost',
      retryable: true
    }));
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

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(canvas.dataset.realmRendererContextLost).toBe('false');
    expect(canvas.dataset.realmRendererContextRestoreCount).toBe('1');
    expect(onRendererContextRestored).toHaveBeenCalledOnce();
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

  it('starts optional castle LODs concurrently without gating Compact readiness', async () => {
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

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledTimes(3));
    expect(new Set(keepLoadState.load.mock.calls.map(([input]) => (
      (input as { quality: { id: string } }).quality.id
    )))).toEqual(new Set(['reduced', 'balanced', 'high']));
    const compactRoot = new THREE.Group();
    compactRoot.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    resolvers.get('reduced')?.(loadedCastleAssembly(compactRoot, 'compact'));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
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

    await vi.waitFor(() => expect(keepLoadState.load).toHaveBeenCalledTimes(3));
    resolvers.get('high')?.(loadedCastleAssembly(highRoot, 'high'));
    await Promise.resolve();
    rejecters.get('balanced')?.(new Error('synthetic Balanced transport failure'));
    resolvers.get('reduced')?.(loadedCastleAssembly(compactRoot, 'compact'));

    await vi.waitFor(() => expect(onCastlesReady).toHaveBeenCalledWith(1));
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
      point: new THREE.Vector3(0, 0, 0)
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

  it('pans by the moving pinch centroid without changing the final pinch scale', () => {
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
    dispatchPointer(window, 'pointermove', {
      pointerId: 1,
      clientX: 320,
      clientY: 300,
      pointerType: 'touch'
    });
    dispatchPointer(window, 'pointermove', {
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

  it('shares first-attempt drag and wheel control with permanent castle labels', () => {
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
    label.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));

    expect(camera.position.distanceTo(beforeDrag)).toBeGreaterThan(0.001);
    expect(onLabelClick).not.toHaveBeenCalled();
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
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    keepLoadState.load.mockResolvedValue({
      root,
      visualHeight: 1,
      footprintDiameter: 1,
      assetUrl: '/castle-compact.glb'
    });
    const onCastlesReady = vi.fn();
    const onCastlePresentationTelemetry = vi.fn();
    const onRendererUnavailable = vi.fn();
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
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

    scene.dispose();
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
    const scene = createRealmScene(createOptions(document.createElement('canvas'), {
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

    scene.dispose();
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
