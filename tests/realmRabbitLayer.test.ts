import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parserState = vi.hoisted(() => ({ calls: 0 }));

vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three');
  return {
    GLTFLoader: class {
      async parseAsync() {
        parserState.calls += 1;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(new Float32Array(384 * 3), 3)
        );
        geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(438), 1));
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
        return { scene };
      }
    }
  };
});

import { createRealmRabbitLayer } from '../src/components/realm/createRealmRabbitLayer';
import { REALM_RABBIT_RUNTIME_ASSET } from '../src/components/realm/realmRabbitRuntimeAsset';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = readFileSync(resolve(ROOT, 'public', REALM_RABBIT_RUNTIME_ASSET.path));
const SOURCE_BYTES = SOURCE.buffer.slice(
  SOURCE.byteOffset,
  SOURCE.byteOffset + SOURCE.byteLength
) as ArrayBuffer;

function exactResponse(bytes = SOURCE_BYTES) {
  return new Response(bytes.slice(0), {
    status: 200,
    headers: { 'content-length': String(bytes.byteLength) }
  });
}

beforeEach(() => {
  parserState.calls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Living Realm compact Rabbit layer', () => {
  it('loads the exact digest-pinned model into one bounded, non-pickable draw', async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => exactResponse());
    vi.stubGlobal('fetch', fetchMock);
    const layer = createRealmRabbitLayer({
      instanceCount: 10,
      baseUrl: '/',
      heightAtWorld: () => 0.18,
      isHabitat: () => true,
      frozenVisualTimeSeconds: 4.5
    });

    expect(layer.update(1, { x: 2, z: -3 }, 'approach')).toBe(true);
    await vi.waitFor(() => expect(layer.getTelemetry().assetReady).toBe(true));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/' + REALM_RABBIT_RUNTIME_ASSET.path);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error'
    });
    expect(parserState.calls).toBe(1);
    expect(layer.group.visible).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      enabled: true,
      assetReady: true,
      overviewHidden: false,
      instanceCapacity: 10,
      instanceCount: 10,
      drawCalls: 1,
      triangleCount: 1_460,
      loadFallbackCount: 0
    });
    const instances = layer.group.children[0];
    expect(instances?.name).toBe('realm-lowlands-rabbit-compact-instances');
    expect(instances?.raycast?.({} as never, [] as never)).toBeUndefined();
    const frozenMatrices = Array.from(
      (instances as unknown as { instanceMatrix: { array: ArrayLike<number> } })
        .instanceMatrix.array
    );
    expect(layer.update(99, { x: 2, z: -3 }, 'approach')).toBe(false);
    expect(Array.from(
      (instances as unknown as { instanceMatrix: { array: ArrayLike<number> } })
        .instanceMatrix.array
    )).toEqual(frozenMatrices);

    layer.update(2, { x: 2, z: -3 }, 'realm');
    expect(layer.group.visible).toBe(false);
    expect(layer.getTelemetry()).toMatchObject({
      overviewHidden: true,
      instanceCount: 0,
      drawCalls: 0,
      triangleCount: 0
    });
    layer.dispose();
    expect(layer.getTelemetry()).toMatchObject({ enabled: false, instanceCapacity: 0 });
  });

  it('allocates no model request or draw for Reduced and reduced motion', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const layer = createRealmRabbitLayer({
      instanceCount: 0,
      baseUrl: '/',
      heightAtWorld: () => 0
    });

    expect(layer.update(1, { x: 0, z: 0 }, 'approach')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(layer.group.children).toHaveLength(0);
    expect(layer.getTelemetry()).toMatchObject({
      enabled: false,
      assetReady: false,
      instanceCapacity: 0,
      instanceCount: 0,
      drawCalls: 0,
      triangleCount: 0
    });
    layer.dispose();
  });

  it('fails closed when the supplied model bytes do not match', async () => {
    const corrupt = SOURCE_BYTES.slice(0);
    new Uint8Array(corrupt)[corrupt.byteLength - 1] ^= 0xff;
    vi.stubGlobal('fetch', vi.fn(async () => exactResponse(corrupt)));
    const ready = vi.fn();
    const layer = createRealmRabbitLayer({
      instanceCount: 6,
      baseUrl: '/',
      heightAtWorld: () => 0,
      onModelReady: ready
    });

    layer.update(1, { x: 0, z: 0 }, 'keep');
    await vi.waitFor(() => expect(layer.getTelemetry().loadFallbackCount).toBe(1));
    expect(parserState.calls).toBe(0);
    expect(ready).toHaveBeenCalledOnce();
    expect(layer.group.visible).toBe(false);
    expect(layer.getTelemetry()).toMatchObject({
      assetReady: false,
      instanceCount: 0,
      drawCalls: 0,
      triangleCount: 0
    });
    layer.dispose();
  });
});
