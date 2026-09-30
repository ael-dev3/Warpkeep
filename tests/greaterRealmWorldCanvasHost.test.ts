import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { axialToWorld } from '../src/game/map/hexCoordinates';

import {
  createGreaterRealmWorldCanvasHost,
  GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES,
  GREATER_REALM_HOST_DRAW_CALL_RESERVE,
  GREATER_REALM_HOST_INSTANCE_RESERVE,
  GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES
} from '../src/components/realm/createGreaterRealmWorldCanvasHost';
import { resolveGreaterRealmWorldViewPolicy } from '../src/components/realm/greaterRealmWorldViewPolicy';
import * as voxelPresentation from '../src/components/realm/greaterRealmVoxelPresentation';
import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE, greaterRealmSyntheticCellKey } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import {
  createGreaterRealmSceneRuntime,
  type GreaterRealmSceneTelemetry
} from '../src/greater-realm/createGreaterRealmSceneRuntime';
import type { GreaterRealmClientSnapshot } from '../src/greater-realm/greaterRealmClientRuntime';
import { assertGreaterRealmChunkMatchesDescriptor, decodeGreaterRealmChunkDto, decodeGreaterRealmWindowDto } from '../src/greater-realm/greaterRealmPublicContract';
import { isCurrentGreaterRealmSceneSnapshot } from '../src/components/realm/greaterRealmWorldSnapshotAuthority';
import { GREATER_REALM_GRAPHICS_BUDGETS } from '../src/greater-realm/greaterRealmRuntimePolicy';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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
  ambientBoatCount: 0,
  localVesselCount: 0,
  boatCount: 0,
  resourceCount: 0,
  uploadedThisFrame: 0,
  uploadBytesThisFrame: 0,
  maximumUploadsPerFrame: 2,
  maximumUploadBytesPerFrame: 524_288,
  skippedByBudgetCount: 0,
  voxelMode: 'none',
  residentVoxelTriangleCount: 0,
  residentVoxelQuadCount: 0,
  voxelUploadBytesThisFrame: 0,
  voxelPreparationMilliseconds: 0,
  voxelEmissionMillisecondsThisFrame: 0,
  voxelFallbackCount: 0,
  voxelFallbackReasons: Object.freeze([])
});

const UNAVAILABLE_VESSEL = Object.freeze({
  status: 'unavailable' as const,
  persisted: false as const,
  message: 'No returned deep-water lane is available in this view.'
});

function vesselRuntimeMethods() {
  return {
    selectLocalVessel: vi.fn(() => UNAVAILABLE_VESSEL),
    moveLocalVessel: vi.fn(() => UNAVAILABLE_VESSEL),
    releaseLocalVessel: vi.fn(() => UNAVAILABLE_VESSEL),
    getLocalVesselState: vi.fn(() => UNAVAILABLE_VESSEL)
  };
}

function instancePosition(mesh: THREE.InstancedMesh, index = 0) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

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
    resourceLocationPhase: 'ready',
    resourceLocations: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations,
    resourceLocationsTruncated: false,
    stream: {}
  } as unknown as GreaterRealmClientSnapshot;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pointerInteractionHost() {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    x: 0, y: 0, toJSON: () => ({})
  } as DOMRect);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
  const renderer = {
    setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
  };
  const runtime = {
    group: new THREE.Group(), setView: vi.fn(), flushUploads: vi.fn(() => 0),
    update: vi.fn(() => false), startAnimation: vi.fn(), stopAnimation: vi.fn(),
    setReducedMotion: vi.fn(), setDocumentVisible: vi.fn(), bindCanvas: vi.fn(),
    getCellAccess: vi.fn(), isCoordinatePassable: vi.fn(() => false),
    ...vesselRuntimeMethods(), getTelemetry: vi.fn(() => EMPTY_TELEMETRY), dispose: vi.fn()
  };
  const onSelectionChange = vi.fn();
  const host = createGreaterRealmWorldCanvasHost({
    canvas, atlasQ: -2, atlasR: 1, ownCastleId: 1,
    policy: resolveGreaterRealmWorldViewPolicy({
      atlasQ: -2, atlasR: 1, viewportWidth: 800, coarsePointer: true,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: true
    }),
    rendererFactory: () => renderer, sceneRuntimeFactory: () => runtime,
    onSelectionChange
  })!;
  host.applySnapshot(readySnapshot());
  // Center a returned target so these tests exercise a real hit, not empty space.
  host.control({ kind: 'select-next' });
  host.control({ kind: 'clear-selection' });
  onSelectionChange.mockClear();
  for (const [id, callback] of [...frames]) {
    frames.delete(id);
    callback(1);
  }
  const camera = renderer.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera;
  const pointer = (
    type: string, pointerId = 1,
    init: PointerEventInit = {}
  ) => {
    const event = new PointerEvent(type, {
      pointerId, pointerType: 'touch', button: 0, clientX: 400, clientY: 300,
      bubbles: true, cancelable: true, ...init
    });
    (type === 'pointerdown' || type === 'lostpointercapture' ? canvas : window)
      .dispatchEvent(event);
  };
  return { host, pointer, camera, onSelectionChange };
}

describe('Greater Realm world canvas host', () => {
  it.each(['balanced', 'performance'] as const)(
    'frames a reachable radius-two window on a narrow portrait %s canvas',
    (quality) => {
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, right: 320, bottom: 844, width: 320, height: 844,
        x: 0, y: 0, toJSON: () => ({})
      } as DOMRect);
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 1;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = nextFrame++;
        frames.set(id, callback);
        return id;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
      const renderer = {
        setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
      };
      const ownCastle = { castleId: 1, q: -2, r: 1 };
      const policy = resolveGreaterRealmWorldViewPolicy({
        atlasQ: ownCastle.q, atlasR: ownCastle.r, viewportWidth: 320,
        coarsePointer: true, farcasterMiniApp: false,
        resolvedGraphicsQuality: quality, reducedMotion: true
      });
      const base = readySnapshot();
      const sourceCell = base.chunks[0]!.chunk.coreCells.find((cell) => (
        cell.atlasQ === ownCastle.q && cell.atlasR === ownCastle.r
      ))!;
      const ownCell = { ...sourceCell, canopyBasisPoints: 0, groundcoverBasisPoints: 0,
        wildflowerBasisPoints: 0, featureClass: 0 };
      // Bin (1,2) lies within the caller's radius-two window centered at (-1,0).
      // Sparse returned windows are legal; this far core cell is not an invented
      // out-of-window landmark or an enlarged render-only coordinate.
      const farCell = { ...ownCell, cellKey: greaterRealmSyntheticCellKey(29, 44),
        chunkHandle: base.chunks[1]!.chunk.chunkHandle, atlasQ: 29, atlasR: 44 };
      const cells = [ownCell, farCell];
      const chunks = cells.map((cell, index) => ({
        chunk: decodeGreaterRealmChunkDto({
          atlasId: base.bootstrap!.atlasId, revision: base.bootstrap!.revision,
          chunkHandle: cell.chunkHandle, lod: policy.lod, sourceCellCount: 1,
          coreCells: [cell], apronCells: [], resourceLocations: []
        }),
        distanceChunks: index === 0 ? 0 : 4
      }));
      const windowDto = decodeGreaterRealmWindowDto({
        ...base.window, centerQ: policy.centerQ, centerR: policy.centerR,
        radius: policy.radius,
        chunks: cells.map((cell) => ({
          chunkHandle: cell.chunkHandle, binQ: Math.floor(cell.atlasQ / 15),
          binR: Math.floor(cell.atlasR / 15), coreCellCount: 1, apronCellCount: 0,
          lod0CellCount: 1, lod1CellCount: 1, lod2CellCount: 1, lod3CellCount: 1
        })),
        castles: base.window!.castles.filter((castle) => castle.castleId === 1n)
      });
      chunks.forEach(({ chunk }, index) => (
        assertGreaterRealmChunkMatchesDescriptor(chunk, windowDto.chunks[index]!)
      ));
      const snapshot: GreaterRealmClientSnapshot = {
        ...base, deviceClass: policy.deviceClass, graphicsProfile: policy.graphicsProfile,
        view: { centerQ: policy.centerQ, centerR: policy.centerR, radius: policy.radius, lod: policy.lod },
        window: windowDto, chunks, selectedChunkCount: chunks.length, resourceLocations: []
      };
      expect(isCurrentGreaterRealmSceneSnapshot({ snapshot, sessionGeneration: 17,
        ownCastle, view: policy })).toBe(true);
      const host = createGreaterRealmWorldCanvasHost({
        canvas, atlasQ: ownCastle.q, atlasR: ownCastle.r, ownCastleId: ownCastle.castleId,
        policy, rendererFactory: () => renderer,
        sceneRuntimeFactory: (options) => createGreaterRealmSceneRuntime(options)
      })!;
      try {
        for (const [id, callback] of [...frames]) {
          frames.delete(id);
          callback(1);
        }
        const [normalScene, normalCamera] = renderer.render.mock.calls.at(-1)! as [THREE.Scene, THREE.PerspectiveCamera];
        const normalFogDensity = (normalScene.fog as THREE.FogExp2).density;
        const ownWorld = axialToWorld(ownCastle, 1);
        const target = new THREE.Vector3(ownWorld.x, 0, ownWorld.z);
        const normalTargetTransmission = Math.exp(-Math.pow(normalCamera.position.distanceTo(target) * normalFogDensity, 2));
        expect(normalFogDensity).toBe(0.0075);
        host.applySnapshot(snapshot);
        for (let time = 16; frames.size > 0 && time <= 320; time += 16) {
          for (const [id, callback] of [...frames]) {
            frames.delete(id);
            callback(time);
          }
        }
        expect(host.getTelemetry().scene.uploadedChunkCount).toBe(2);
        const [scene, camera] = renderer.render.mock.calls.at(-1)! as [THREE.Scene, THREE.PerspectiveCamera];
        expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
        expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
        camera.updateMatrixWorld(true);
        // Check emitted geometry, rather than hypothetical corners formed by
        // combining opposite edges of this deliberately sparse public window.
        let vertexCount = 0; let maxX = 0; let maxY = 0; let minZ = Infinity; let maxZ = -Infinity;
        scene.getObjectByName('greater-realm-world')!.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const positions = object.geometry.getAttribute('position');
          const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
          for (let instance = 0; instance < instances; instance++) {
            const matrix = new THREE.Matrix4();
            if (object instanceof THREE.InstancedMesh) object.getMatrixAt(instance, matrix);
            for (let vertex = 0; vertex < positions.count; vertex++) {
              const projected = new THREE.Vector3().fromBufferAttribute(positions, vertex)
                .applyMatrix4(matrix).applyMatrix4(object.matrixWorld).project(camera);
              vertexCount++;
              maxX = Math.max(maxX, Math.abs(projected.x)); maxY = Math.max(maxY, Math.abs(projected.y));
              minZ = Math.min(minZ, projected.z); maxZ = Math.max(maxZ, projected.z);
            }
          }
        });
        expect(vertexCount).toBeGreaterThan(0);
        expect(maxX).toBeLessThanOrEqual(1);
        expect(maxY).toBeLessThanOrEqual(1);
        expect(minZ).toBeGreaterThanOrEqual(-1);
        expect(maxZ).toBeLessThanOrEqual(1);
        const fog = scene.fog as THREE.FogExp2;
        const fittedTargetTransmission = Math.exp(-Math.pow(camera.position.distanceTo(target) * fog.density, 2));
        expect(fittedTargetTransmission).toBeGreaterThanOrEqual(normalTargetTransmission - Number.EPSILON);
        host.control({ kind: 'zoom', direction: 'in' });
        expect(Number.isFinite(fog.density)).toBe(true);
        expect(fog.density).toBeLessThanOrEqual(normalFogDensity);
        host.control({ kind: 'reset' });
        expect(fog.density).toBe(normalFogDensity);
      } finally {
        host.dispose();
      }
    }
  );

  it('selects a returned target with a single primary tap', () => {
    const { host, pointer, onSelectionChange } = pointerInteractionHost();
    try {
      pointer('pointerdown');
      pointer('pointerup');
      expect(onSelectionChange).toHaveBeenCalledOnce();
      expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
        kind: 'region', label: 'The Hegemony Lowlands'
      }));
    } finally { host.dispose(); }
  });

  it.each([
    'two-finger tap', 'drag then second finger', 'secondary button',
    'shift orbit', 'release-only drag', 'cancelled touch', 'lost capture'
  ])('does not select or recenter after %s', (gesture) => {
    const { host, pointer, camera, onSelectionChange } = pointerInteractionHost();
    try {
      const init = gesture === 'secondary button' ? { button: 2, pointerType: 'mouse' }
        : gesture === 'shift orbit' ? { shiftKey: true, pointerType: 'mouse' } : {};
      pointer('pointerdown', 1, init);
      if (gesture === 'drag then second finger') pointer('pointermove', 1, { clientX: 410 });
      if (gesture === 'two-finger tap' || gesture === 'drag then second finger') {
        pointer('pointerdown', 2);
        pointer('pointerup', 2);
      }
      if (gesture === 'cancelled touch') pointer('pointercancel');
      if (gesture === 'lost capture') pointer('lostpointercapture');
      const beforeRelease = camera.position.clone();
      pointer('pointerup', 1, {
        ...init, clientX: gesture === 'release-only drag' || gesture === 'drag then second finger'
          ? 410 : 400
      });
      expect(onSelectionChange).not.toHaveBeenCalled();
      expect(camera.position.equals(beforeRelease)).toBe(true);
      // A completed or cancelled gesture must not poison the next genuine tap.
      pointer('pointerdown');
      pointer('pointerup');
      expect(onSelectionChange).toHaveBeenCalledOnce();
      expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
        kind: expect.stringMatching(/^(region|castle|resource)$/)
      }));
    } finally { host.dispose(); }
  });

  it('retains pinch/orbit and remaining-finger pan without selecting', () => {
    const { host, pointer, camera, onSelectionChange } = pointerInteractionHost();
    try {
      pointer('pointerdown', 1, { clientX: 350 });
      pointer('pointerdown', 2, { clientX: 450 });
      pointer('pointermove', 2, { clientX: 475 });
      const beforePinch = camera.position.clone();
      pointer('pointermove', 2, { clientX: 500, clientY: 320 });
      expect(camera.position.equals(beforePinch)).toBe(false);
      pointer('pointerup', 2, { clientX: 500, clientY: 320 });
      pointer('lostpointercapture', 2);
      const beforePan = camera.position.clone();
      pointer('pointermove', 1, { clientX: 370 });
      expect(camera.position.equals(beforePan)).toBe(false);
      pointer('pointerup', 1, { clientX: 370 });
      expect(onSelectionChange).not.toHaveBeenCalled();
    } finally { host.dispose(); }
  });

  it('updates responsive rendering policy in one host and retains a returned selection', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const runtimes: any[] = [];
    function makeRuntime(
      options: { deviceClass: 'desktop' | 'mobile'; graphicsProfile: string }
    ): any {
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(), flushUploads: vi.fn(() => 0), update: vi.fn(() => false),
        startAnimation: vi.fn(), stopAnimation: vi.fn(), setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(), bindCanvas: vi.fn(), getCellAccess: vi.fn(),
        isCoordinatePassable: vi.fn(() => false), ...vesselRuntimeMethods(),
        getTelemetry: vi.fn(() => ({
          ...EMPTY_TELEMETRY,
          deviceClass: options.deviceClass,
          graphicsProfile: options.graphicsProfile
        })),
        dispose: vi.fn()
      };
      runtimes.push(runtime);
      return runtime;
    }
    const renderer = {
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
    };
    const rendererFactory = vi.fn(() => renderer);
    const runtimeFactory = vi.fn((options: any) => makeRuntime(options));
    const onSelectionChange = vi.fn();
    const desktopPolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: -2, atlasR: 1, viewportWidth: 1_440, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'cinematic', reducedMotion: false
    });
    const mobilePolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: -2, atlasR: 1, viewportWidth: 390, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'cinematic', reducedMotion: false
    });
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: -2,
      atlasR: 1,
      ownCastleId: 1,
      policy: desktopPolicy,
      rendererFactory,
      sceneRuntimeFactory: runtimeFactory,
      onSelectionChange
    })!;

    host.applySnapshot(readySnapshot());
    host.control({ kind: 'select-next' });
    const selected = onSelectionChange.mock.calls.at(-1)![0];
    expect(selected).toBeDefined();
    let resourceSelection: typeof selected;
    let publicCastleSelection: typeof selected;
    for (let index = 0; index < 32; index += 1) {
      host.control({ kind: 'select-next' });
      const latest = onSelectionChange.mock.calls.at(-1)![0];
      if (latest?.kind === 'resource') resourceSelection = latest;
      if (latest?.kind === 'castle' && latest.label !== 'Your castle') {
        publicCastleSelection = latest;
      }
      if (
        resourceSelection !== undefined
        && latest?.kind === selected.kind
        && latest.atlasQ === selected.atlasQ
        && latest.atlasR === selected.atlasR
      ) break;
    }
    expect(resourceSelection).toEqual(expect.objectContaining({ kind: 'resource' }));
    expect(resourceSelection!.label).toContain('site at');
    expect(resourceSelection!.label).not.toContain('nodes');
    expect(publicCastleSelection).toEqual(expect.objectContaining({ kind: 'castle' }));
    expect(publicCastleSelection!.castleId).toBe(2n);
    expect(publicCastleSelection!.label).toContain('castle at');
    expect(publicCastleSelection!.label).not.toMatch(/castle \d+$/);

    host.updatePolicy(mobilePolicy);

    expect(rendererFactory).toHaveBeenCalledOnce();
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(runtimeFactory).toHaveBeenLastCalledWith(expect.objectContaining({
      deviceClass: 'mobile',
      graphicsProfile: 'balanced'
    }));
    expect(runtimes[0]!.dispose).toHaveBeenCalledOnce();
    expect(runtimes[1]!.setView).toHaveBeenCalledOnce();
    expect(onSelectionChange).not.toHaveBeenLastCalledWith(undefined);
    expect(onSelectionChange.mock.calls.at(-1)![0]).toEqual(selected);

    // A new keeper at the same coordinate must not inherit the previous
    // castle selection or its profile actions.
    for (let index = 0; index < 32; index += 1) {
      host.control({ kind: 'select-next' });
      if (onSelectionChange.mock.calls.at(-1)![0]?.castleId === 2n) break;
    }
    expect(onSelectionChange.mock.calls.at(-1)![0]?.castleId).toBe(2n);
    const replacedCastle = readySnapshot();
    host.applySnapshot({
      ...replacedCastle,
      window: {
        ...replacedCastle.window!,
        castles: replacedCastle.window!.castles.map((castle) => (
          castle.castleId === 2n ? { ...castle, castleId: 3n } : castle
        ))
      }
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(undefined);
    host.control({ kind: 'select-next' });
    expect(onSelectionChange).not.toHaveBeenLastCalledWith(undefined);
    host.control({ kind: 'clear-selection' });
    expect(onSelectionChange).toHaveBeenLastCalledWith(undefined);

    const outsideReturnedView = {
      ...readySnapshot(),
      window: { ...readySnapshot().window!, castles: [] },
      chunks: [],
      selectedChunkCount: 0,
      resourceLocations: []
    } as GreaterRealmClientSnapshot;
    host.applySnapshot(outsideReturnedView);
    expect(onSelectionChange).toHaveBeenLastCalledWith(undefined);
    host.dispose();
  });

  it('defers an adaptive runtime swap through context loss and applies it on restoration', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    let contextLost = true;
    const runtimes: any[] = [];
    const runtimeFactory = vi.fn(() => {
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(), flushUploads: vi.fn(() => 0), update: vi.fn(() => false),
        startAnimation: vi.fn(), stopAnimation: vi.fn(), setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(), bindCanvas: vi.fn(), getCellAccess: vi.fn(),
        isCoordinatePassable: vi.fn(() => false), ...vesselRuntimeMethods(),
        getTelemetry: vi.fn(() => ({ ...EMPTY_TELEMETRY, contextLost })),
        dispose: vi.fn()
      };
      runtimes.push(runtime);
      return runtime;
    });
    const desktopPolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0, atlasR: 0, viewportWidth: 1_440, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
    });
    const mobilePolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0, atlasR: 0, viewportWidth: 390, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
    });
    const host = createGreaterRealmWorldCanvasHost({
      canvas, atlasQ: 0, atlasR: 0, ownCastleId: 1, policy: desktopPolicy,
      rendererFactory: () => ({
        setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
      }),
      sceneRuntimeFactory: runtimeFactory
    })!;

    host.applySnapshot(readySnapshot());
    host.updatePolicy(mobilePolicy);
    expect(runtimeFactory).toHaveBeenCalledOnce();
    expect(runtimes[0]!.dispose).not.toHaveBeenCalled();

    contextLost = false;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(runtimes[0]!.dispose).toHaveBeenCalledOnce();
    expect(runtimes[1]!.setView).toHaveBeenCalledOnce();
    host.dispose();
  });

  it('retries a deferred policy after restore when an earlier swap changed listener order', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const runtimes: any[] = [];
    const runtimeFactory = vi.fn(() => {
      let contextLost = false;
      let boundCanvas: HTMLCanvasElement | null = null;
      const handleLoss = () => { contextLost = true; };
      const handleRestore = () => { contextLost = false; };
      const bindCanvas = vi.fn((next: HTMLCanvasElement | null) => {
        boundCanvas?.removeEventListener('webglcontextlost', handleLoss);
        boundCanvas?.removeEventListener('webglcontextrestored', handleRestore);
        boundCanvas = next;
        boundCanvas?.addEventListener('webglcontextlost', handleLoss);
        boundCanvas?.addEventListener('webglcontextrestored', handleRestore);
      });
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(), flushUploads: vi.fn(() => 0), update: vi.fn(() => false),
        startAnimation: vi.fn(), stopAnimation: vi.fn(), setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(), bindCanvas, getCellAccess: vi.fn(),
        isCoordinatePassable: vi.fn(() => false), ...vesselRuntimeMethods(),
        getTelemetry: vi.fn(() => ({ ...EMPTY_TELEMETRY, contextLost })),
        dispose: vi.fn(() => bindCanvas(null))
      };
      runtimes.push(runtime);
      return runtime;
    });
    const desktopPolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0, atlasR: 0, viewportWidth: 1_440, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
    });
    const mobilePolicy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0, atlasR: 0, viewportWidth: 390, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
    });
    const host = createGreaterRealmWorldCanvasHost({
      canvas, atlasQ: 0, atlasR: 0, ownCastleId: 1, policy: desktopPolicy,
      rendererFactory: () => ({
        setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
      }),
      sceneRuntimeFactory: runtimeFactory
    })!;

    host.updatePolicy(mobilePolicy);
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    host.updatePolicy(desktopPolicy);
    expect(runtimeFactory).toHaveBeenCalledTimes(2);

    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(runtimeFactory).toHaveBeenCalledTimes(3);
    expect(runtimes[1]!.dispose).toHaveBeenCalledOnce();
    host.dispose();
    expect(runtimes[2]!.dispose).toHaveBeenCalledOnce();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(runtimeFactory).toHaveBeenCalledTimes(3);
  });

  it('requeues real scene uploads after a swapped runtime loses context during a policy change', () => {
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
    const renderer = {
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
    };
    const policy = (viewportWidth: number) => resolveGreaterRealmWorldViewPolicy({
      atlasQ: -2, atlasR: 1, viewportWidth, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: true
    });
    const host = createGreaterRealmWorldCanvasHost({
      canvas, atlasQ: -2, atlasR: 1, ownCastleId: 1, policy: policy(1_440),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: (options) => createGreaterRealmSceneRuntime(options)
    })!;
    const flushFrames = () => {
      for (let time = 16; frames.size > 0 && time <= 320; time += 16) {
        for (const [id, callback] of [...frames]) {
          frames.delete(id);
          callback(time);
        }
      }
    };

    host.applySnapshot(readySnapshot());
    flushFrames();
    expect(host.getTelemetry().scene.uploadedChunkCount).toBeGreaterThan(0);
    host.updatePolicy(policy(390));
    flushFrames();
    expect(host.getTelemetry().scene.selectedChunkCount).toBeGreaterThan(0);
    expect(host.getTelemetry().scene.uploadedChunkCount).toBeGreaterThan(0);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    host.updatePolicy(policy(1_440));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    flushFrames();

    expect(host.getTelemetry().scene.selectedChunkCount).toBeGreaterThan(0);
    expect(host.getTelemetry().scene.uploadedChunkCount).toBeGreaterThan(0);
    host.dispose();
  });

  it('fails closed and cleans both runtimes when an adaptive swap cannot start', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const runtimes: any[] = [];
    const runtimeFactory = vi.fn(() => {
      const failing = runtimes.length > 0;
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(), flushUploads: vi.fn(() => 0), update: vi.fn(() => false),
        startAnimation: failing
          ? vi.fn(() => { throw new Error('INJECTED_ADAPTIVE_RUNTIME_FAILURE'); })
          : vi.fn(),
        stopAnimation: vi.fn(), setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(), bindCanvas: vi.fn(), getCellAccess: vi.fn(),
        isCoordinatePassable: vi.fn(() => false), ...vesselRuntimeMethods(),
        getTelemetry: vi.fn(() => EMPTY_TELEMETRY),
        dispose: vi.fn()
      };
      runtimes.push(runtime);
      return runtime;
    });
    const renderer = {
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
    };
    const onFailure = vi.fn();
    const host = createGreaterRealmWorldCanvasHost({
      canvas, atlasQ: 0, atlasR: 0, ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: 0, atlasR: 0, viewportWidth: 1_440, coarsePointer: false,
        farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
      }),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: runtimeFactory,
      onFailure
    })!;

    host.updatePolicy(resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0, atlasR: 0, viewportWidth: 390, coarsePointer: false,
      farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
    }));

    expect(onFailure).toHaveBeenCalledOnce();
    expect(runtimes[0]!.dispose).toHaveBeenCalledOnce();
    expect(runtimes[1]!.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

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

  it('falls back to one instanced castle layer when voxel prefab preparation fails', () => {
    vi.spyOn(voxelPresentation, 'createGreaterRealmVoxelPrefabPlan')
      .mockImplementation(() => { throw new Error('INJECTED_CASTLE_PREPARATION_FAILURE'); });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const runtime = {
      group: new THREE.Group(),
      setView: vi.fn(), flushUploads: vi.fn(() => 0), update: vi.fn(() => false),
      startAnimation: vi.fn(), stopAnimation: vi.fn(), setReducedMotion: vi.fn(),
      setDocumentVisible: vi.fn(), bindCanvas: vi.fn(), getCellAccess: vi.fn(),
      isCoordinatePassable: vi.fn(() => false), ...vesselRuntimeMethods(),
      getTelemetry: vi.fn(() => EMPTY_TELEMETRY), dispose: vi.fn()
    };
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: -2,
      atlasR: 1,
      ownCastleId: 1,
      policy: resolveGreaterRealmWorldViewPolicy({
        atlasQ: -2, atlasR: 1, viewportWidth: 1_440, coarsePointer: false,
        farcasterMiniApp: false, resolvedGraphicsQuality: 'balanced', reducedMotion: false
      }),
      rendererFactory: () => ({
        setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
      }),
      sceneRuntimeFactory: () => runtime
    })!;

    expect(() => host.applySnapshot(readySnapshot())).not.toThrow();
    expect(host.getTelemetry().publicCastleCount).toBe(2);
    expect(host.getTelemetry().scene.voxelFallbackReasons.join('|'))
      .toContain('INJECTED_CASTLE_PREPARATION_FAILURE');
    host.dispose();
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
        ...vesselRuntimeMethods(),
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
      ...vesselRuntimeMethods(),
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
      ...vesselRuntimeMethods(),
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
    expect(host!.getTelemetry()).toMatchObject({
      publicResourceCount: 4,
      visibleRegionCount: 1
    });
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
    expect(castleInstances.geometry.index).not.toBeNull();
    expect(castleInstances.geometry.getAttribute('normal').normalized).toBe(true);
    expect(castleInstances.geometry.getAttribute('color').normalized).toBe(true);
    expect(castleInstances.geometry.userData.greaterRealmVoxelSignature)
      .toContain('greater-realm-voxel-prefab-v1');
    expect(renderedScene.getObjectByName(
      'greater-realm-visible-region-landmark-instances'
    )).toBeDefined();
    expect(renderedScene.getObjectByName('greater-realm-public-resource-gold'))
      .toBeDefined();
    const ownMatrix = new THREE.Matrix4();
    const ownPosition = new THREE.Vector3();
    castleInstances.getMatrixAt(0, ownMatrix);
    ownPosition.setFromMatrixPosition(ownMatrix);
    const ownCell = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks
      .flatMap((chunk) => [...chunk.coreCells, ...chunk.apronCells])
      .find((cell) => cell.atlasQ === -2 && cell.atlasR === 1)!;
    expect(ownPosition.y).toBeCloseTo(
      ownCell.elevation / 1_000 + 0.03,
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

  it.each([
    ['high', 62, 'voxel', 0],
    ['high', 63, 'voxel', 0.125],
    ['balanced', 124, 'voxel', 0],
    ['balanced', 126, 'voxel', 0.25],
    ['reduced', 249, 'voxel', 0],
    ['reduced', 251, 'voxel', 0.5],
    ['high', 62, 'fallback', 0.062],
    ['high', 63, 'fallback', 0.063],
    ['balanced', 124, 'fallback', 0.124],
    ['balanced', 126, 'fallback', 0.126],
    ['reduced', 249, 'fallback', 0.249],
    ['reduced', 251, 'fallback', 0.251]
  ] as const)(
    'grounds %s castles at elevation %i on the selected %s surface',
    (graphicsProfile, elevation, terrainMode, expectedSurfaceY) => {
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
      const runtime = {
        group: new THREE.Group(),
        setView: vi.fn(),
        flushUploads: vi.fn(() => 1),
        update: vi.fn(() => false),
        startAnimation: vi.fn(),
        stopAnimation: vi.fn(),
        setReducedMotion: vi.fn(),
        setDocumentVisible: vi.fn(),
        bindCanvas: vi.fn(),
        getCellAccess: vi.fn(),
        getTerrainSurfaceY: vi.fn((_chunkHandle: string, cell: any) => (
          terrainMode === 'voxel' ? expectedSurfaceY : undefined
        )),
        isCoordinatePassable: vi.fn(() => false),
        ...vesselRuntimeMethods(),
        getTelemetry: vi.fn(() => ({ ...EMPTY_TELEMETRY, voxelMode: terrainMode })),
        dispose: vi.fn()
      };
      const renderer = {
        setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
      };
      const snapshot = structuredClone(readySnapshot()) as any;
      const ownCastle = snapshot.window.castles.find((castle: any) => castle.castleId === 1n);
      ownCastle.elevation = elevation;
      const ownCell = snapshot.chunks.flatMap((row: any) => (
        [...row.chunk.coreCells, ...row.chunk.apronCells]
      )).find((cell: any) => (
        cell.atlasQ === ownCastle.atlasQ && cell.atlasR === ownCastle.atlasR
      ));
      ownCell.elevation = elevation;
      const host = createGreaterRealmWorldCanvasHost({
        canvas,
        atlasQ: ownCastle.atlasQ,
        atlasR: ownCastle.atlasR,
        ownCastleId: 1,
        policy: {
          ...resolveGreaterRealmWorldViewPolicy({
            atlasQ: ownCastle.atlasQ,
            atlasR: ownCastle.atlasR,
            viewportWidth: 1_440,
            coarsePointer: false,
            farcasterMiniApp: false,
            resolvedGraphicsQuality: graphicsProfile === 'high'
              ? 'cinematic'
              : graphicsProfile === 'reduced' ? 'performance' : 'balanced',
            reducedMotion: false
          }),
          graphicsProfile
        },
        rendererFactory: () => renderer,
        sceneRuntimeFactory: () => runtime
      })!;

      host.applySnapshot(snapshot);
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(16);
      }
      const scene = renderer.render.mock.calls[0]![0] as THREE.Scene;
      const castles = scene.getObjectByName(
        'greater-realm-public-castle-instances'
      ) as THREE.InstancedMesh;
      expect(instancePosition(castles).y).toBeCloseTo(expectedSurfaceY + 0.03, 6);
      expect(runtime.getTerrainSurfaceY).toHaveBeenCalled();
      host.dispose();
    }
  );

  it('grounds a castle from the real neighboring resource that emits its apron cell', () => {
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
    const renderer = {
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn()
    };
    const snapshot = structuredClone(readySnapshot()) as any;
    const ownerRaw = structuredClone(snapshot.chunks[0].chunk) as any;
    ownerRaw.lod = 1;
    ownerRaw.coreCells = ownerRaw.coreCells.filter((cell: any) => (
      cell.atlasQ !== -1 || cell.atlasR !== 1
    ));
    snapshot.chunks[0].chunk = decodeGreaterRealmChunkDto(ownerRaw);
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
        resolvedGraphicsQuality: 'performance',
        reducedMotion: true
      }),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: (options) => createGreaterRealmSceneRuntime(options)
    })!;

    host.applySnapshot(snapshot);
    let frameTime = 16;
    while (frames.size > 0 && frameTime <= 64) {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(frameTime);
      }
      frameTime += 16;
    }
    const scene = renderer.render.mock.calls.at(-1)![0] as THREE.Scene;
    const castles = scene.getObjectByName(
      'greater-realm-public-castle-instances'
    ) as THREE.InstancedMesh;
    expect(instancePosition(castles, 1).y).toBeCloseTo(0.03, 6);
    host.dispose();
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
      ...vesselRuntimeMethods(),
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
      reservedDrawCalls: GREATER_REALM_HOST_DRAW_CALL_RESERVE,
      reservedSceneInstances: GREATER_REALM_HOST_INSTANCE_RESERVE,
      reservedUploadBytesPerFrame: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES,
      localVesselOrigin: { atlasQ: -2, atlasR: 1 }
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
    capacity.resourceLocationPhase = 'ready';
    capacity.resourceLocations = Array.from({ length: 128 }, (_, index) => ({
      chunkHandle: selectedHandle,
      locationId: `GRL-${BASE32[index % BASE32.length]!.repeat(25)}${
        BASE32[Math.trunc(index / BASE32.length)]!
      }`,
      atlasQ: index,
      atlasR: 1,
      resourceKind: (['food', 'wood', 'stone', 'gold'] as const)[index % 4],
      nodeCount: index % 7 + 1
    }));
    host.applySnapshot(capacity);
    flushFrames(64);
    const capacityTelemetry = onTelemetry.mock.calls.at(-1)![0];
    const budget = GREATER_REALM_GRAPHICS_BUDGETS.balanced;
    expect(capacityTelemetry.publicCastleCount).toBe(600);
    expect(capacityTelemetry.publicResourceCount).toBe(128);
    expect(capacityTelemetry.publicCastleUploadBytesThisFrame)
      .toBeLessThanOrEqual(GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES);
    expect(capacityTelemetry.hostUploadBytesThisFrame)
      .toBeLessThanOrEqual(GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES);
    expect(capacityTelemetry.scene.drawCallCount).toBeLessThanOrEqual(
      budget.maximumDrawCalls
    );
    expect(capacityTelemetry.scene.instanceCount).toBeLessThanOrEqual(
      budget.maximumSceneInstances
    );
    expect(capacityTelemetry.scene.uploadBytesThisFrame).toBeLessThanOrEqual(
      budget.maximumUploadBytesPerFrame
    );
    expect(capacityTelemetry.scene.residentVoxelTriangleCount).toBeGreaterThan(0);
    expect(capacityTelemetry.scene.residentVoxelQuadCount).toBeGreaterThan(0);
    expect(capacityTelemetry.scene.voxelMode).toBe('voxel');
    host.dispose();
  });

  it('provides keyboard/button controls, selection, local helm feedback, and listener cleanup', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect);
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const selectedVessel = Object.freeze({
      status: 'selected' as const,
      persisted: false as const,
      message: 'Local helm engaged. This vessel preview is not saved to the server.',
      cellKey: 'public-water-cell',
      atlasQ: 0,
      atlasR: 0
    });
    const blockedVessel = Object.freeze({
      ...selectedVessel,
      status: 'blocked' as const,
      message: 'Blocked: the next public deep-water lane cell is not returned in this view.'
    });
    const selectLocalVessel = vi.fn(() => selectedVessel);
    const moveLocalVessel = vi.fn(() => blockedVessel);
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
      selectLocalVessel,
      moveLocalVessel,
      releaseLocalVessel: vi.fn(() => UNAVAILABLE_VESSEL),
      getLocalVesselState: vi.fn(() => UNAVAILABLE_VESSEL),
      getTelemetry: vi.fn(() => EMPTY_TELEMETRY),
      dispose: vi.fn()
    };
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn()
    };
    const onSelectionChange = vi.fn();
    const onLocalVesselStateChange = vi.fn();
    const removeCanvasListener = vi.spyOn(canvas, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
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
        reducedMotion: true
      }),
      rendererFactory: () => renderer,
      sceneRuntimeFactory: () => runtime,
      onSelectionChange,
      onLocalVesselStateChange
    })!;
    const flush = (time: number) => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(time);
      }
    };
    flush(1);
    host.applySnapshot(readySnapshot());
    flush(2);
    const scene = renderer.render.mock.calls.at(-1)![0] as THREE.Scene;
    const camera = renderer.render.mock.calls.at(-1)![1] as THREE.PerspectiveCamera;
    expect(camera.userData.greaterRealmReducedMotion).toBe(true);
    const before = camera.position.clone();

    const keyEvent = new KeyboardEvent('keydown', {
      key: 'ArrowUp', bubbles: true, cancelable: true
    });
    canvas.dispatchEvent(keyEvent);
    expect(keyEvent.defaultPrevented).toBe(true);
    flush(3);
    expect(camera.position.equals(before)).toBe(false);
    host.control({ kind: 'select-next' });
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'region',
      label: 'The Hegemony Lowlands'
    }));
    host.control({ kind: 'take-helm' });
    expect(selectLocalVessel).toHaveBeenCalledOnce();
    expect(onLocalVesselStateChange).toHaveBeenLastCalledWith(selectedVessel);
    host.control({ kind: 'move-vessel', direction: 'forward' });
    expect(moveLocalVessel).toHaveBeenCalledWith('forward');
    expect(onLocalVesselStateChange).toHaveBeenLastCalledWith(blockedVessel);
    expect(scene.getObjectByName('greater-realm-public-resource-wood')).toBeDefined();

    host.dispose();
    expect(removeCanvasListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeCanvasListener).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(removeCanvasListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    expect(frames.size).toBe(0);
  });
});
