import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  createGreaterRealmWorldCanvasHost,
  GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES
} from '../src/components/realm/createGreaterRealmWorldCanvasHost';
import { resolveGreaterRealmWorldViewPolicy } from '../src/components/realm/greaterRealmWorldViewPolicy';
import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type { GreaterRealmSceneTelemetry } from '../src/greater-realm/createGreaterRealmSceneRuntime';
import type { GreaterRealmClientSnapshot } from '../src/greater-realm/greaterRealmClientRuntime';
import { GREATER_REALM_GRAPHICS_BUDGETS } from '../src/greater-realm/greaterRealmRuntimePolicy';

const EMPTY_TELEMETRY: GreaterRealmSceneTelemetry = Object.freeze({
  disposed: false,
  deviceClass: 'desktop',
  graphicsProfile: 'balanced',
  reducedMotion: false,
  contextLost: false,
  selectedChunkCount: 0,
  uploadedChunkCount: 0,
  pendingUploadCount: 0,
  drawCallCount: 0,
  instanceCount: 0,
  accessCellCount: 0,
  blockedCellCount: 0,
  canopyCount: 0,
  grassPatchCount: 0,
  grassBladeCount: 0,
  grassTriangleCount: 0,
  flowerCount: 0,
  flowerGeometryBytes: 0,
  npcCount: 0,
  wildlifeCount: 0,
  boatCount: 0,
  resourceCount: 0,
  uploadedThisFrame: 0,
  uploadBytesThisFrame: 0,
  maximumUploadsPerFrame: 2,
  maximumUploadBytesPerFrame: 524_288,
  skippedByBudgetCount: 0
});

function readySnapshot() {
  return {
    phase: 'ready',
    sessionGeneration: 17,
    deviceClass: 'desktop',
    graphicsProfile: 'balanced',
    cellSize: 1,
    bootstrap: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap,
    window: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window,
    view: { centerQ: 0, centerR: 0, radius: 1, lod: 1 },
    chunks: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks.map((chunk, index) => ({
      chunk,
      distanceChunks: index
    })),
    selectedChunkCount: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks.length,
    stream: {}
  } as unknown as GreaterRealmClientSnapshot;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Greater Realm world canvas host', () => {
  it('does not construct Three when WebGL 2 preflight fails', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const rendererFactory = vi.fn();

    expect(createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: 0,
      atlasR: 0,
      ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: 0,
        atlasR: 0,
        viewportWidth: 1_440,
        coarsePointer: false,
        farcasterMiniApp: false,
        resolvedGraphicsQuality: 'balanced',
        reducedMotion: false
      }),
      rendererFactory
    })).toBeUndefined();
    expect(rendererFactory).not.toHaveBeenCalled();
  });

  it('fails construction without leaking a created renderer or thrown context probe', () => {
    const policy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0,
      atlasR: 0,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'balanced',
      reducedMotion: false
    });
    const thrownProbe = document.createElement('canvas');
    vi.spyOn(thrownProbe, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    const probeFailure = vi.fn();
    expect(createGreaterRealmWorldCanvasHost({
      canvas: thrownProbe,
      atlasQ: 0,
      atlasR: 0,
      ownCastleId: 1,
      policy,
      onFailure: probeFailure
    })).toBeUndefined();
    expect(probeFailure).toHaveBeenCalledOnce();

    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn()
    };
    const runtimeFailure = vi.fn();
    expect(createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: 0,
      atlasR: 0,
      ownCastleId: 1,
      policy,
      rendererFactory: () => renderer,
      sceneRuntimeFactory: () => { throw new Error('scene failed'); },
      onFailure: runtimeFailure
    })).toBeUndefined();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(runtimeFailure).toHaveBeenCalledOnce();
  });

  it.each(['observer', 'renderer-resize'] as const)(
    'fully tears down when initial %s setup throws',
    (failureKind) => {
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
      const disconnect = vi.fn();
      if (failureKind === 'observer') {
        vi.stubGlobal('ResizeObserver', class {
          observe() { throw new Error('observe failed'); }
          disconnect() { disconnect(); }
        });
      } else {
        vi.stubGlobal('ResizeObserver', undefined);
      }
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(),
        flushUploads: vi.fn(() => 0),
        update: vi.fn(() => false),
        startAnimation: vi.fn(),
        stopAnimation: vi.fn(),
        setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(),
        bindCanvas: vi.fn(),
        getCellAccess: vi.fn(),
        isCoordinatePassable: vi.fn(() => false),
        getTelemetry: vi.fn(() => EMPTY_TELEMETRY),
        dispose: vi.fn()
      };
      const renderer = {
        setPixelRatio: vi.fn(),
        setSize: vi.fn(() => {
          if (failureKind === 'renderer-resize') throw new Error('resize failed');
        }),
        render: vi.fn(),
        dispose: vi.fn()
      };
      const onFailure = vi.fn();
      const removeWindowListener = vi.spyOn(window, 'removeEventListener');
      const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
      const host = createGreaterRealmWorldCanvasHost({
        canvas,
        atlasQ: 0,
        atlasR: 0,
        ownCastleId: 1,
        policy: resolveGreaterRealmWorldViewPolicy({
          atlasQ: 0,
          atlasR: 0,
          viewportWidth: 1_440,
          coarsePointer: false,
          farcasterMiniApp: false,
          resolvedGraphicsQuality: 'balanced',
          reducedMotion: false
        }),
        rendererFactory: () => renderer,
        sceneRuntimeFactory: () => runtime,
        onFailure
      });

      expect(host).toBeUndefined();
      expect(onFailure).toHaveBeenCalledOnce();
      expect(runtime.stopAnimation).toHaveBeenCalledOnce();
      expect(runtime.dispose).toHaveBeenCalledOnce();
      expect(renderer.dispose).toHaveBeenCalledOnce();
      if (failureKind === 'observer') expect(disconnect).toHaveBeenCalledOnce();
      expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(removeDocumentListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    }
  );

  it('enters one terminal state when rendering fails', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(1, callback);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frames.delete(1);
    });
    let invalidate: () => void = () => undefined;
    const stopAnimation = vi.fn();
    const runtime = {
      group: new THREE.Group(),
      setView: vi.fn(),
      flushUploads: vi.fn(() => 0),
      update: vi.fn(() => false),
      startAnimation: vi.fn(),
      stopAnimation,
      setReducedMotion: vi.fn(),
      setDocumentVisible: vi.fn(),
      bindCanvas: vi.fn(),
      getCellAccess: vi.fn(),
      isCoordinatePassable: vi.fn(() => false),
      getTelemetry: vi.fn(() => EMPTY_TELEMETRY),
      dispose: vi.fn()
    };
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(() => { throw new Error('render failed'); }),
      dispose: vi.fn()
    };
    const onFailure = vi.fn();
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: 0,
      atlasR: 0,
      ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: 0,
        atlasR: 0,
        viewportWidth: 1_440,
        coarsePointer: false,
        farcasterMiniApp: false,
        resolvedGraphicsQuality: 'balanced',
        reducedMotion: false
      }),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: (options) => {
        invalidate = options.onInvalidate ?? (() => undefined);
        return runtime;
      },
      onFailure
    });
    expect(host).toBeDefined();
    const callback = frames.get(1)!;
    frames.delete(1);
    callback(16);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(stopAnimation).toHaveBeenCalledOnce();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
    invalidate();
    host!.schedule();
    expect(frames.size).toBe(0);
    host!.dispose();
    expect(stopAnimation).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('applies public snapshots and tears down every canvas-generation owner once', () => {
    const canvas = document.createElement('canvas');
    const context = {} as WebGL2RenderingContext;
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 900,
      height: 600
    } as DOMRect);
    let documentHidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => documentHidden);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const setView = vi.fn();
    const bindCanvas = vi.fn();
    const startAnimation = vi.fn();
    const stopAnimation = vi.fn();
    const disposeRuntime = vi.fn();
    let currentTelemetry = EMPTY_TELEMETRY;
    let invalidate: () => void = () => undefined;
    const runtime = {
      group: new THREE.Group(),
      setView,
      flushUploads: vi.fn(() => 0),
      update: vi.fn(() => false),
      startAnimation,
      stopAnimation,
      setReducedMotion: vi.fn(),
      setDocumentVisible: vi.fn(),
      bindCanvas,
      getCellAccess: vi.fn(),
      isCoordinatePassable: vi.fn(() => false),
      getTelemetry: vi.fn(() => currentTelemetry),
      dispose: disposeRuntime
    };
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn()
    };
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: -2,
      atlasR: 1,
      ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: -2,
        atlasR: 1,
        viewportWidth: 1_440,
        coarsePointer: false,
        farcasterMiniApp: false,
        resolvedGraphicsQuality: 'balanced',
        reducedMotion: false
      }),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: (options) => {
        invalidate = options.onInvalidate ?? (() => undefined);
        return runtime;
      }
    });
    expect(host).toBeDefined();
    expect(bindCanvas).toHaveBeenCalledWith(canvas);
    expect(startAnimation).toHaveBeenCalledOnce();

    host!.applySnapshot(readySnapshot());
    host!.applySnapshot(readySnapshot());
    expect(host!.getTelemetry().publicCastleCount).toBe(2);
    expect(setView).toHaveBeenCalledOnce();
    expect(setView).toHaveBeenCalledWith(expect.objectContaining({
      revision: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.revision,
      cellSize: 1
    }));
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(16);
    }
    expect(renderer.render).toHaveBeenCalledOnce();
    const renderedScene = renderer.render.mock.calls[0]![0] as THREE.Scene;
    const castleInstances = renderedScene.getObjectByName(
      'greater-realm-public-castle-instances'
    ) as THREE.InstancedMesh;
    expect(castleInstances.count).toBe(2);
    const ownMatrix = new THREE.Matrix4();
    const ownPosition = new THREE.Vector3();
    castleInstances.getMatrixAt(0, ownMatrix);
    ownPosition.setFromMatrixPosition(ownMatrix);
    const ownCell = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks
      .flatMap((chunk) => [...chunk.coreCells, ...chunk.apronCells])
      .find((cell) => cell.atlasQ === -2 && cell.atlasR === 1)!;
    expect(ownPosition.y).toBeCloseTo(
      ownCell.elevation / 1_000 + 0.21 * 1.04 + 0.03,
      6
    );
    const resourceOnlyPublish = structuredClone(readySnapshot()) as any;
    resourceOnlyPublish.chunks.forEach((row: any) => {
      row.chunk.resourceLocations = [];
    });
    host!.applySnapshot(resourceOnlyPublish);
    expect(setView).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);

    currentTelemetry = {
      ...EMPTY_TELEMETRY,
      contextLost: true,
      pendingUploadCount: 1
    };
    invalidate();
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(32);
    }
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);

    currentTelemetry = EMPTY_TELEMETRY;
    invalidate();
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(48);
    }
    expect(renderer.render).toHaveBeenCalledTimes(2);

    documentHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    invalidate();
    expect(frames.size).toBe(0);
    documentHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(64);
    }

    const persistedHide = new Event('pagehide');
    Object.defineProperty(persistedHide, 'persisted', { value: true });
    window.dispatchEvent(persistedHide);
    expect(disposeRuntime).not.toHaveBeenCalled();
    const persistedShow = new Event('pageshow');
    Object.defineProperty(persistedShow, 'persisted', { value: true });
    window.dispatchEvent(persistedShow);
    expect(frames.size).toBe(1);
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(80);
    }

    host!.dispose();
    host!.dispose();
    expect(stopAnimation).toHaveBeenCalledOnce();
    expect(disposeRuntime).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pageshow', expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
    expect(frames.size).toBe(0);
  });

  it('updates same-revision castle topology in place and ignores unselected chunks', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const setView = vi.fn();
    const runtime = {
      group: new THREE.Group(),
      setView,
      flushUploads: vi.fn(() => 0),
      update: vi.fn(() => false),
      startAnimation: vi.fn(),
      stopAnimation: vi.fn(),
      setReducedMotion: vi.fn(),
      setDocumentVisible: vi.fn(),
      bindCanvas: vi.fn(),
      getCellAccess: vi.fn(),
      isCoordinatePassable: vi.fn(() => false),
      getTelemetry: vi.fn(() => EMPTY_TELEMETRY),
      dispose: vi.fn()
    };
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn()
    };
    const rendererFactory = vi.fn(() => renderer);
    const runtimeFactory = vi.fn(() => runtime);
    const onTelemetry = vi.fn();
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: -2,
      atlasR: 1,
      ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: -2,
        atlasR: 1,
        viewportWidth: 1_440,
        coarsePointer: false,
        farcasterMiniApp: false,
        resolvedGraphicsQuality: 'balanced',
        reducedMotion: false
      }),
      rendererFactory,
      sceneRuntimeFactory: runtimeFactory,
      onTelemetry
    })!;
    const flushFrames = (time: number) => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(time);
      }
    };

    const initial = readySnapshot();
    host.applySnapshot(initial);
    flushFrames(16);
    const scene = renderer.render.mock.calls.at(-1)![0] as THREE.Scene;
    const firstMesh = scene.getObjectByName(
      'greater-realm-public-castle-instances'
    ) as THREE.InstancedMesh;
    const firstMeshDispose = vi.spyOn(firstMesh, 'dispose');
    expect(firstMesh.count).toBe(2);
    expect(setView).toHaveBeenCalledOnce();

    host.applySnapshot(structuredClone(initial));
    expect(firstMeshDispose).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);

    const changed = structuredClone(initial) as any;
    changed.window.castles[1].level += 1;
    changed.window.castles[1].elevation += 50;
    changed.window.castles.push({
      castleId: 3n,
      chunkHandle: changed.chunks[1].chunk.chunkHandle,
      atlasQ: 0,
      atlasR: 0,
      level: 1,
      elevation: 120
    });
    host.applySnapshot(changed);
    expect(firstMeshDispose).toHaveBeenCalledOnce();
    expect(setView).toHaveBeenCalledOnce();
    expect(rendererFactory).toHaveBeenCalledOnce();
    expect(runtimeFactory).toHaveBeenCalledOnce();
    expect(runtimeFactory).toHaveBeenCalledWith(expect.objectContaining({
      reservedDrawCalls: 1,
      reservedSceneInstances: 600,
      reservedUploadBytesPerFrame: GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES
    }));
    flushFrames(32);
    const secondMesh = scene.getObjectByName(
      'greater-realm-public-castle-instances'
    ) as THREE.InstancedMesh;
    expect(secondMesh).not.toBe(firstMesh);
    expect(secondMesh.count).toBe(3);

    const selectedOnly = structuredClone(changed) as any;
    selectedOnly.chunks = [selectedOnly.chunks[0]];
    selectedOnly.selectedChunkCount = 1;
    host.applySnapshot(selectedOnly);
    flushFrames(48);
    const selectedHandles = new Set(selectedOnly.chunks.map(
      (row: any) => row.chunk.chunkHandle
    ));
    const selectedMesh = scene.getObjectByName(
      'greater-realm-public-castle-instances'
    ) as THREE.InstancedMesh;
    expect(selectedMesh.count).toBe(selectedOnly.window.castles.filter(
      (castle: any) => selectedHandles.has(castle.chunkHandle)
    ).length);
    expect(setView).toHaveBeenCalledTimes(2);

    const capacity = structuredClone(selectedOnly) as any;
    const selectedHandle = capacity.chunks[0].chunk.chunkHandle;
    capacity.window.castles = Array.from({ length: 600 }, (_, index) => ({
      castleId: BigInt(index + 1),
      chunkHandle: selectedHandle,
      atlasQ: index,
      atlasR: 0,
      level: 1,
      elevation: index
    }));
    host.applySnapshot(capacity);
    flushFrames(64);
    const capacityTelemetry = onTelemetry.mock.calls.at(-1)![0];
    const budget = GREATER_REALM_GRAPHICS_BUDGETS.balanced;
    expect(capacityTelemetry.publicCastleCount).toBe(600);
    expect(capacityTelemetry.publicCastleUploadBytesThisFrame)
      .toBeLessThanOrEqual(GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES);
    expect(capacityTelemetry.scene.drawCallCount).toBeLessThanOrEqual(
      budget.maximumDrawCalls
    );
    expect(capacityTelemetry.scene.instanceCount).toBeLessThanOrEqual(
      budget.maximumSceneInstances
    );
    expect(capacityTelemetry.scene.uploadBytesThisFrame).toBeLessThanOrEqual(
      budget.maximumUploadBytesPerFrame
    );
    host.dispose();
  });
});
