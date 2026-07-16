import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webglState = vi.hoisted(() => ({
  instances: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }>
}));

const keepLoadState = vi.hoisted(() => ({
  load: vi.fn((_options?: unknown) => new Promise<unknown>(() => undefined))
}));

const environmentState = vi.hoisted(() => ({ failNext: false }));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class WebGLRenderer {
    capabilities = { getMaxAnisotropy: () => 1 };
    dispose = vi.fn();
    outputColorSpace = '';
    render = vi.fn();
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

import {
  createRealmScene,
  REALM_CASTLE_READABILITY_LIGHTING,
  resolveRealmPinchGesture,
  type CreateRealmSceneOptions
} from '../src/components/realm/createRealmScene';
import { hexKey } from '../src/game/map/hexCoordinates';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { DEFAULT_REALM_CAMERA_SPEC } from '../src/components/realm/realmCameraController';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

type ListenerSpy = ReturnType<typeof vi.spyOn>;

function listenerCalls(spy: ListenerSpy, eventName: string) {
  return spy.mock.calls.filter((call: unknown[]) => call[0] === eventName).length;
}

function dispatchPointer(
  canvas: HTMLCanvasElement,
  type: string,
  input: Readonly<{
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: string;
    button?: number;
  }>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: input.pointerId },
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    pointerType: { value: input.pointerType ?? 'mouse' },
    button: { value: input.button ?? 0 }
  });
  canvas.dispatchEvent(event);
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

describe('realm scene setup cleanup', () => {
  const resizeObservers: Array<{
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    webglState.instances.length = 0;
    keepLoadState.load.mockReset();
    keepLoadState.load.mockImplementation(() => new Promise<unknown>(() => undefined));
    environmentState.failNext = false;
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

  it('enables bounded ambience only for visible-motion high and balanced scenes', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
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
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 180);
    animated.dispose();
    expect(clearTimeoutSpy).toHaveBeenCalled();
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
      semanticCellCount: 1,
      semanticKindCount: 1,
      semanticFeatureCount: 0,
      semanticFeatureDrawCalls: 0,
      totalDetailInstanceCount: expect.any(Number),
      totalDetailDrawCalls: expect.any(Number)
    });

    sceneHandle.dispose();
  });

  it('uses the existing neutral fill to lift castle faces without adding terrain energy or PBR work', () => {
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
      '#d5d9e2',
      '#ffddb0'
    ].sort());
    expect(cameraFill).toBeInstanceOf(THREE.DirectionalLight);
    expect(amethystSideFill).toBeInstanceOf(THREE.DirectionalLight);
    expect(amethystSideFill?.intensity).toBe(
      REALM_CASTLE_READABILITY_LIGHTING.amethystSideFillIntensity
    );
    expect(amethystSideFill!.intensity).toBeGreaterThanOrEqual(0.3);
    expect(amethystSideFill!.intensity).toBeLessThanOrEqual(0.34);
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
    expect(cameraFacingIrradiance).toBeGreaterThanOrEqual(0.68);
    expect(cameraFacingIrradiance).toBeLessThanOrEqual(0.72);

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
    expect(listenerCalls(documentAdd, 'visibilitychange')).toBe(2);
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(2);
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
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(2);
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
      surface: createRealmTerrainSurface('realm-pinch-centroid', 4, 5),
      reducedMotion: true
    }));
    scene.frameFoundingDistrict();
    const renderer = webglState.instances[0];
    const camera = renderer.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const initialPosition = camera.position.clone();

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

    expect(camera.position.y).toBeCloseTo(initialPosition.y, 5);
    expect(Math.hypot(
      camera.position.x - initialPosition.x,
      camera.position.z - initialPosition.z
    )).toBeGreaterThan(0.001);

    scene.dispose();
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
