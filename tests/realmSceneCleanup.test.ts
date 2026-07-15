import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webglState = vi.hoisted(() => ({
  instances: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }>
}));

const keepLoadState = vi.hoisted(() => ({
  load: vi.fn(() => new Promise<unknown>(() => undefined))
}));

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

vi.mock('../src/components/realm/loadHegemonyKeep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/loadHegemonyKeep')>();
  return { ...actual, loadHegemonyKeep: keepLoadState.load };
});

import {
  createRealmScene,
  resolveRealmPinchGesture,
  type CreateRealmSceneOptions
} from '../src/components/realm/createRealmScene';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
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
  return {
    canvas,
    surface: createRealmTerrainSurface('realm-scene-cleanup', 0, 0),
    keepCoord: { q: 0, r: 0 },
    ownCastleId: 1,
    otherCastles: [],
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

describe('realm scene setup cleanup', () => {
  const resizeObservers: Array<{
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    webglState.instances.length = 0;
    keepLoadState.load.mockReset();
    keepLoadState.load.mockImplementation(() => new Promise<unknown>(() => undefined));
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
    const onCastlePresentationTelemetry = vi.fn();
    const sceneHandle = createRealmScene(createOptions(document.createElement('canvas'), {
      reducedMotion: true,
      onCastlePresentationTelemetry
    }));
    const renderCall = webglState.instances[0].render.mock.calls.at(-1);
    const renderedScene = renderCall?.[0] as THREE.Scene;
    const camera = renderCall?.[1] as THREE.PerspectiveCamera;
    const environment = renderedScene.getObjectByName('realm-environment-depth');

    expect(environment).toBeTruthy();
    expect(environment?.position.equals(camera.position)).toBe(true);
    expect(onCastlePresentationTelemetry).toHaveBeenCalledWith({
      presentedModelCount: 0,
      raycastTargetCount: 0
    });

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
    resolveLoad?.({
      root,
      visualHeight: 1,
      footprintDiameter: 1,
      assetUrl: '/castle-compact.glb'
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onCastlesReady).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(geometryDispose).toHaveBeenCalledTimes(1);
      expect(materialDispose).toHaveBeenCalledTimes(1);
    });
  });

  it('signals readiness only after a real prefab instance exists', async () => {
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
    const canvas = document.createElement('canvas');
    const onCastlesReady = vi.fn();
    const onKeepStatusChange = vi.fn();
    const scene = createRealmScene(createOptions(canvas, {
      onCastlesReady,
      onKeepStatusChange
    }));

    await vi.waitFor(() => {
      expect(onCastlesReady).toHaveBeenCalledWith(1);
    });
    expect(keepLoadState.load).toHaveBeenCalledTimes(1);
    expect(onKeepStatusChange.mock.calls.map(([status]) => status)).toEqual([
      'loading',
      'ready'
    ]);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    scene.dispose();
    scene.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('coalesces hidden-tab demand renders into one visibility recovery frame', async () => {
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    keepLoadState.load.mockResolvedValue({
      root,
      visualHeight: 1,
      footprintDiameter: 1,
      assetUrl: '/castle-compact.glb'
    });
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

  it('releases prefab leases even when layer-owned disposal throws', async () => {
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
