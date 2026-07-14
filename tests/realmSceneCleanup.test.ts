import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webglState = vi.hoisted(() => ({
  instances: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }>
}));

const keepLoadState = vi.hoisted(() => ({
  load: vi.fn(() => new Promise<never>(() => undefined))
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
  type CreateRealmSceneOptions
} from '../src/components/realm/createRealmScene';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

type ListenerSpy = ReturnType<typeof vi.spyOn>;

function listenerCalls(spy: ListenerSpy, eventName: string) {
  return spy.mock.calls.filter((call: unknown[]) => call[0] === eventName).length;
}

function createOptions(
  canvas: HTMLCanvasElement,
  overrides: Partial<CreateRealmSceneOptions> = {}
): CreateRealmSceneOptions {
  return {
    canvas,
    surface: createRealmTerrainSurface('realm-scene-cleanup', 0, 0),
    keepCoord: { q: 0, r: 0 },
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
    keepLoadState.load.mockImplementation(() => new Promise<never>(() => undefined));
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
    expect(listenerCalls(documentAdd, 'visibilitychange')).toBe(1);
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(1);
  });

  it('keeps normal scene disposal idempotent', () => {
    const canvas = document.createElement('canvas');
    const canvasRemove = vi.spyOn(canvas, 'removeEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const scene = createRealmScene(createOptions(canvas));

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
    expect(listenerCalls(documentRemove, 'visibilitychange')).toBe(1);
  });
});
