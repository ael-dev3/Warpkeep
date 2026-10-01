import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { WebGLShadowMap } from 'three/src/renderers/webgl/WebGLShadowMap.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepMenuWorld3D } from '../src/components/menu/WarpkeepMenuWorld3D';

type MockRenderer = {
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  domElement: HTMLCanvasElement;
};

const harness = vi.hoisted(() => ({
  renderers: [] as MockRenderer[],
  parseRequests: [] as Array<{ resolve: (model: GLTF) => void }>,
  resizeCallbacks: [] as Array<() => void>,
  exerciseShadowTargets: false,
}));

vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    shadowMap = { enabled: false, type: original.PCFShadowMap };
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    render = vi.fn((scene: THREE.Scene, camera: THREE.Camera) => {
      if (!harness.exerciseShadowTargets) return;
      const lights: THREE.DirectionalLight[] = [];
      scene.updateMatrixWorld(true);
      scene.traverse(node => {
        if (node instanceof original.DirectionalLight && node.castShadow) lights.push(node);
      });
      // Exercise Three's real allocation/viewport path with no GPU draw calls.
      // An empty draw scene keeps the test focused on the existing light target.
      this.nativeShadowMap.enabled = this.shadowMap.enabled;
      this.nativeShadowMap.type = this.shadowMap.type;
      this.nativeShadowMap.render(lights, new original.Scene(), camera);
    });
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    nativeShadowMap = new WebGLShadowMap({
      getRenderTarget: () => null,
      getActiveCubeFace: () => 0,
      getActiveMipmapLevel: () => 0,
      setRenderTarget: vi.fn(),
      clear: vi.fn(),
      state: {
        setBlending: vi.fn(),
        setScissorTest: vi.fn(),
        viewport: vi.fn(),
        buffers: {
          color: { setClear: vi.fn() },
          depth: { getReversed: () => false, setTest: vi.fn() },
        },
      },
    } as unknown as THREE.WebGLRenderer,
    {} as ConstructorParameters<typeof WebGLShadowMap>[1],
    { maxTextureSize: 16384 } as ConstructorParameters<typeof WebGLShadowMap>[2]);

    constructor() {
      harness.renderers.push(this);
    }
  }
  return { ...original, WebGLRenderer: MockWebGLRenderer };
});

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {}
    parseAsync(): Promise<GLTF> {
      return new Promise((resolve) => harness.parseRequests.push({ resolve }));
    }
  },
}));

vi.mock('../src/components/menu/createMenuLandscape3D', () => ({
  createMenuLandscape3D: () => ({ update: vi.fn() }),
}));

class SyntheticImageBitmap {
  close = vi.fn();
}

function parsedModel() {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const bitmap = new SyntheticImageBitmap();
  texture.source.data = bitmap;
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.Mesh(geometry, material));
  const disposeGeometry = vi.spyOn(geometry, 'dispose');
  const disposeMaterial = vi.spyOn(material, 'dispose');
  const disposeTexture = vi.spyOn(texture, 'dispose');
  const gltf = { scene, scenes: [scene], animations: [] } as unknown as GLTF;
  return { gltf, disposeGeometry, disposeMaterial, disposeTexture, bitmap };
}

function expectReleased(model: ReturnType<typeof parsedModel>) {
  expect(model.disposeGeometry).toHaveBeenCalledOnce();
  expect(model.disposeMaterial).toHaveBeenCalledOnce();
  expect(model.disposeTexture).toHaveBeenCalledOnce();
  expect(model.bitmap.close).toHaveBeenCalledOnce();
}

describe('menu 3D lifecycle', () => {
  beforeEach(() => {
    harness.renderers.length = 0;
    harness.parseRequests.length = 0;
    harness.resizeCallbacks.length = 0;
    harness.exerciseShadowTargets = false;
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { harness.resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    })));
    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++frame));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves the imported castle material side while configuring its shadows', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="performance" guardianUrl={null} />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    const meshes = castle.gltf.scene.children as THREE.Mesh[];
    const material = meshes[0].material as THREE.Material;
    material.side = THREE.DoubleSide;

    await act(async () => harness.parseRequests[0].resolve(castle.gltf));

    expect(material.side).toBe(THREE.DoubleSide);
    expect(meshes.every((mesh) => mesh.castShadow && mesh.receiveShadow)).toBe(true);
    view.unmount();
    expectReleased(castle);
  });

  it('releases a GLTF whose parse finishes after the menu has unmounted', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const renderer = harness.renderers[0];
    const model = parsedModel();

    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(renderer.domElement.isConnected).toBe(false);

    await act(async () => {
      harness.parseRequests[0].resolve(model.gltf);
    });
    expectReleased(model);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('releases already parsed detached additions and later parses during navigation', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion guardianUrl={null} />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    await act(async () => {
      harness.parseRequests[0].resolve(castle.gltf);
    });
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(7));
    const firstAddition = parsedModel();
    await act(async () => {
      harness.parseRequests[1].resolve(firstAddition.gltf);
    });

    view.unmount();
    expectReleased(castle);
    expectReleased(firstAddition);
    expect(harness.renderers[0].forceContextLoss).toHaveBeenCalledOnce();

    const lateAdditions = Array.from({ length: 5 }, parsedModel);
    await act(async () => {
      lateAdditions.forEach((model, index) => harness.parseRequests[index + 2].resolve(model.gltf));
    });
    lateAdditions.forEach(expectReleased);
  });

  it('keeps castle and guardian without fetching decorative models in Performance', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="performance" />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    await act(async () => harness.parseRequests[0].resolve(castle.gltf));
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(2));
    const guardian = parsedModel();
    await act(async () => harness.parseRequests[1].resolve(guardian.gltf));

    await vi.waitFor(() => expect(view.container.firstElementChild?.getAttribute('data-model-ready')).toBe('true'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('/models/menu/warplet-castle-'),
      expect.stringContaining('/models/menu/warplet-guardian-'),
    ]);
    expect(harness.renderers[0].render).toHaveBeenCalled();

    view.unmount();
    expectReleased(castle);
    expectReleased(guardian);
  });

  it('still fetches decorative models in Balanced with reduced motion', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="balanced" />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    await act(async () => harness.parseRequests[0].resolve(castle.gltf));
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(2));
    const guardian = parsedModel();
    await act(async () => harness.parseRequests[1].resolve(guardian.gltf));

    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(8));
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(vi.mocked(fetch).mock.calls.slice(2).map(([url]) => String(url))).toEqual([
      expect.stringContaining('/population/infantry/inner-keep-honor-guard-'),
      expect.stringContaining('/population/citizen/inner-keep-ember-lamplighter-'),
      expect.stringContaining('/wildlife/rabbit/inner-keep-lowlands-rabbit-'),
      expect.stringContaining('/town-items/inner-keep-stone-pedestal-brazier-'),
      expect.stringContaining('/environment/trees/hegemony-tree-regular-'),
      expect.stringContaining('/environment/trees/hegemony-tree-pine-alpine-'),
    ]);
    expect(view.container.firstElementChild?.getAttribute('data-model-ready')).toBe('true');
    view.unmount();
    expectReleased(castle);
    expectReleased(guardian);

    const additions = Array.from({ length: 6 }, parsedModel);
    await act(async () => {
      additions.forEach((model, index) => harness.parseRequests[index + 2].resolve(model.gltf));
    });
    additions.forEach(expectReleased);
  });

  it('stops drawing when hidden and resumes only when visible again', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const view = render(<WarpkeepMenuWorld3D active reducedMotion={false} />);
    const request = vi.mocked(requestAnimationFrame);
    const cancel = vi.mocked(cancelAnimationFrame);
    const renderer = harness.renderers[0];
    const initialRequests = request.mock.calls.length;
    expect(initialRequests).toBeGreaterThan(0);

    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(cancel).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(initialRequests);
    const rendersWhileHidden = renderer.render.mock.calls.length;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(renderer.render).toHaveBeenCalledTimes(rendersWhileHidden);

    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(initialRequests + 1);
    view.unmount();
    const afterUnmount = request.mock.calls.length;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(afterUnmount);
  });

  it.each([
    { quality: 'balanced' as const, narrow: 1024, wide: 1536 },
    { quality: 'cinematic' as const, narrow: 1536, wide: 2048 },
  ])('resizes and retires the real $quality shadow target across phone rotation', ({ quality, narrow, wide }) => {
    harness.exerciseShadowTargets = true;
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality={quality} guardianUrl={null} />);
    const renderer = harness.renderers[0];
    const scene = renderer.render.mock.calls[0][0] as THREE.Scene;
    const key = scene.children.find(node => node instanceof THREE.DirectionalLight && node.castShadow) as THREE.DirectionalLight;
    const target = key.shadow.map!;
    expect([target.width, target.height]).toEqual([narrow, narrow]);
    const dispose = vi.fn();
    target.addEventListener('dispose', dispose);

    width.mockReturnValue(844);
    height.mockReturnValue(390);
    act(() => harness.resizeCallbacks[0]());
    expect([key.shadow.map!.width, key.shadow.map!.height]).toEqual([wide, wide]);
    expect(dispose).toHaveBeenCalledOnce();
    act(() => harness.resizeCallbacks[0]());
    expect(dispose).toHaveBeenCalledOnce();

    width.mockReturnValue(390);
    height.mockReturnValue(844);
    act(() => harness.resizeCallbacks[0]());
    expect([key.shadow.map!.width, key.shadow.map!.height]).toEqual([narrow, narrow]);
    expect(dispose).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('keeps Performance free of shadow targets when the phone rotates', () => {
    harness.exerciseShadowTargets = true;
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="performance" guardianUrl={null} />);
    const scene = harness.renderers[0].render.mock.calls[0][0] as THREE.Scene;
    const lights = scene.children.filter(node => node instanceof THREE.DirectionalLight) as THREE.DirectionalLight[];
    expect(lights.every(light => light.shadow.map === null)).toBe(true);
    width.mockReturnValue(844);
    act(() => harness.resizeCallbacks[0]());
    expect(lights.every(light => light.shadow.map === null)).toBe(true);
    view.unmount();
  });

  it('clears a failed preview when a quality retry successfully loads the castle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="balanced" guardianUrl={null} />);
    const mount = view.container.firstElementChild as HTMLElement;
    await vi.waitFor(() => expect(mount.dataset.modelState).toBe('castle-unavailable'));

    view.rerender(<WarpkeepMenuWorld3D active reducedMotion quality="performance" guardianUrl={null} />);
    expect(view.container.firstElementChild).toBe(mount);
    expect(mount.dataset.modelState).toBeUndefined();
    expect(mount.dataset.modelReady).toBeUndefined();
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    await act(async () => harness.parseRequests[0].resolve(castle.gltf));
    expect(mount.dataset.modelReady).toBe('true');
    expect(mount.dataset.modelState).toBeUndefined();
    view.unmount();
    expectReleased(castle);
  });

  it('clears old readiness while rebuilding and releases a late castle after navigation', async () => {
    const view = render(<WarpkeepMenuWorld3D active reducedMotion quality="performance" guardianUrl={null} />);
    const mount = view.container.firstElementChild as HTMLElement;
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const castle = parsedModel();
    await act(async () => harness.parseRequests[0].resolve(castle.gltf));
    expect(mount.dataset.modelReady).toBe('true');
    view.rerender(<WarpkeepMenuWorld3D active reducedMotion quality="cinematic" guardianUrl={null} />);
    expect(mount.dataset.modelReady).toBeUndefined();
    expectReleased(castle);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(2));
    view.unmount();
    const lateCastle = parsedModel();
    await act(async () => harness.parseRequests[1].resolve(lateCastle.gltf));
    expectReleased(lateCastle);
    expect(mount.dataset.modelReady).toBeUndefined();
  });

  it('cancels animation behind a menu overlay, keeps its still and WebGL context, then resumes', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const view = render(<WarpkeepMenuWorld3D active reducedMotion={false} guardianUrl={null} />);
    const request = vi.mocked(requestAnimationFrame);
    const cancel = vi.mocked(cancelAnimationFrame);
    const renderer = harness.renderers[0];
    const canvas = renderer.domElement;
    const scheduled = request.mock.calls.length;
    expect(scheduled).toBeGreaterThan(0);
    const pendingFrame = request.mock.calls.at(-1)?.[0];
    expect(pendingFrame).toBeTypeOf('function');
    const rendersBeforePause = renderer.render.mock.calls.length;

    view.rerender(<WarpkeepMenuWorld3D active={false} reducedMotion={false} guardianUrl={null} />);
    expect(cancel).toHaveBeenCalledWith(scheduled);
    expect(request).toHaveBeenCalledTimes(scheduled);
    expect(renderer.render).toHaveBeenCalledTimes(rendersBeforePause + 1);
    act(() => pendingFrame!(1000));
    expect(request).toHaveBeenCalledTimes(scheduled);
    expect(renderer.render).toHaveBeenCalledTimes(rendersBeforePause + 1);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(renderer.forceContextLoss).not.toHaveBeenCalled();
    expect(renderer.domElement).toBe(canvas);
    expect(canvas.isConnected).toBe(true);
    expect(harness.renderers).toHaveLength(1);

    view.rerender(<WarpkeepMenuWorld3D active reducedMotion={false} guardianUrl={null} />);
    expect(request).toHaveBeenCalledTimes(scheduled + 1);
    const resumedFrame = request.mock.calls.at(-1)?.[0];
    expect(resumedFrame).toBeTypeOf('function');
    act(() => resumedFrame!(1200));
    expect(renderer.render).toHaveBeenCalledTimes(rendersBeforePause + 2);
    expect(request).toHaveBeenCalledTimes(scheduled + 2);
    expect(harness.renderers).toHaveLength(1);
    expect(canvas.isConnected).toBe(true);
    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
  });

  it('pauses on WebGL context loss and redraws only after restoration', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const view = render(<WarpkeepMenuWorld3D active reducedMotion={false} guardianUrl={null} />);
    await vi.waitFor(() => expect(harness.parseRequests).toHaveLength(1));
    const renderer = harness.renderers[0];
    const request = vi.mocked(requestAnimationFrame);
    const cancel = vi.mocked(cancelAnimationFrame);
    const initialRequests = request.mock.calls.length;
    const initialRenders = renderer.render.mock.calls.length;
    const lost = new Event('webglcontextlost', { cancelable: true });

    act(() => renderer.domElement.dispatchEvent(lost));
    expect(lost.defaultPrevented).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(initialRequests);

    const castle = parsedModel();
    await act(async () => harness.parseRequests[0].resolve(castle.gltf));
    expect(renderer.render).toHaveBeenCalledTimes(initialRenders);

    act(() => renderer.domElement.dispatchEvent(new Event('webglcontextrestored')));
    expect(renderer.render).toHaveBeenCalledTimes(initialRenders + 1);
    expect(request).toHaveBeenCalledTimes(initialRequests + 1);

    view.unmount();
    expectReleased(castle);
    const requestsAfterUnmount = request.mock.calls.length;
    act(() => renderer.domElement.dispatchEvent(new Event('webglcontextrestored')));
    expect(request).toHaveBeenCalledTimes(requestsAfterUnmount);
  });
});
