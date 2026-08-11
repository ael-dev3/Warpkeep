import * as THREE from 'three';

import { axialToWorld } from '../../game/map/hexCoordinates';
import {
  createGreaterRealmSceneRuntime,
  type CreateGreaterRealmSceneRuntimeOptions,
  type GreaterRealmSceneRuntime,
  type GreaterRealmSceneTelemetry
} from '../../greater-realm/createGreaterRealmSceneRuntime';
import type {
  GreaterRealmClientSnapshot
} from '../../greater-realm/greaterRealmClientRuntime';
import {
  GREATER_REALM_PUBLIC_LIMITS,
  type GreaterRealmWindowCastleDto
} from '../../greater-realm/greaterRealmPublicContract';
import { GREATER_REALM_GRAPHICS_BUDGETS } from '../../greater-realm/greaterRealmRuntimePolicy';
import {
  greaterRealmWindowCastleTopologySignature
} from './greaterRealmWorldSnapshotAuthority';
import type { GreaterRealmWorldViewPolicy } from './greaterRealmWorldViewPolicy';

type GreaterRealmRenderer = Readonly<{
  setPixelRatio: (ratio: number) => void;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}>;

/** Cylinder buffers plus 600 matrix/color instance attributes, conservatively aligned. */
export const GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES = 65_536 as const;

export type GreaterRealmWorldCanvasTelemetry = Readonly<{
  renderer: 'webgl';
  publicCastleCount: number;
  publicCastleUploadBytesThisFrame: number;
  scene: GreaterRealmSceneTelemetry;
}>;

export type GreaterRealmWorldCanvasHost = Readonly<{
  applySnapshot: (snapshot: GreaterRealmClientSnapshot) => void;
  schedule: () => void;
  getTelemetry: () => GreaterRealmWorldCanvasTelemetry;
  dispose: () => void;
}>;

export type CreateGreaterRealmWorldCanvasHostOptions = Readonly<{
  canvas: HTMLCanvasElement;
  atlasQ: number;
  atlasR: number;
  ownCastleId: number;
  policy: GreaterRealmWorldViewPolicy;
  onTelemetry?: (telemetry: GreaterRealmWorldCanvasTelemetry) => void;
  onFailure?: () => void;
  /** Deterministic renderer seam. Production always uses THREE.WebGLRenderer. */
  rendererFactory?: (
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext
  ) => GreaterRealmRenderer;
  /** Deterministic lifecycle seam. Production always uses the reviewed scene runtime. */
  sceneRuntimeFactory?: (
    options: CreateGreaterRealmSceneRuntimeOptions
  ) => GreaterRealmSceneRuntime;
}>;

function createPublicCastleLayer(options: CreateGreaterRealmWorldCanvasHostOptions) {
  const group = new THREE.Group();
  group.name = 'greater-realm-public-castles';
  let count = 0;
  let appliedSignature: string | undefined;
  let geometry: THREE.CylinderGeometry | undefined;
  let material: THREE.MeshStandardMaterial | undefined;
  let mesh: THREE.InstancedMesh | undefined;
  let pendingUploadBytes = 0;
  const clear = () => {
    group.clear();
    mesh?.dispose();
    geometry?.dispose();
    material?.dispose();
    mesh = undefined;
    geometry = undefined;
    material = undefined;
    count = 0;
    pendingUploadBytes = 0;
  };
  return Object.freeze({
    group,
    get count() { return count; },
    get pendingUploadBytes() { return pendingUploadBytes; },
    consumePendingUploadBytes: () => {
      const value = pendingUploadBytes;
      pendingUploadBytes = 0;
      return value;
    },
    applySnapshot: (snapshot: GreaterRealmClientSnapshot) => {
      if (snapshot.phase !== 'ready' || snapshot.window === undefined) return false;
      const selectedHandles = new Set(
        snapshot.chunks.map(({ chunk }) => chunk.chunkHandle)
      );
      const selectedCastles = snapshot.window.castles.filter(
        (castle) => selectedHandles.has(castle.chunkHandle)
      );
      const maximum = Math.min(
        GREATER_REALM_PUBLIC_LIMITS.maximumCastlesPerWindow,
        GREATER_REALM_GRAPHICS_BUDGETS[options.policy.graphicsProfile]
          .maximumSceneInstances
      );
      const ownCastleId = BigInt(options.ownCastleId);
      const castles: readonly GreaterRealmWindowCastleDto[] = selectedCastles.length <= maximum
        ? selectedCastles
        : Object.freeze([
            ...selectedCastles.filter((castle) => castle.castleId === ownCastleId),
            ...selectedCastles.filter((castle) => castle.castleId !== ownCastleId)
          ].slice(0, maximum));
      const signature = greaterRealmWindowCastleTopologySignature(castles);
      if (signature === appliedSignature) return false;
      appliedSignature = signature;
      clear();
      if (castles.length === 0) return true;
      geometry = new THREE.CylinderGeometry(0.18, 0.25, 0.42, 6);
      material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.68,
        metalness: 0.08,
        fog: true
      });
      const nextMesh = new THREE.InstancedMesh(geometry, material, castles.length);
      mesh = nextMesh;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      castles.forEach((castle, index) => {
        const world = axialToWorld({ q: castle.atlasQ, r: castle.atlasR }, 1);
        const size = Math.min(1.65, 0.92 + (castle.level - 1) * 0.12);
        position.set(
          world.x,
          castle.elevation / 1_000 + 0.21 * size + 0.03,
          world.z
        );
        scale.set(size, size, size);
        matrix.compose(position, rotation, scale);
        nextMesh.setMatrixAt(index, matrix);
        nextMesh.setColorAt(index, new THREE.Color(
          castle.castleId === ownCastleId ? '#f0d58c' : '#a98bc4'
        ));
      });
      nextMesh.instanceMatrix.needsUpdate = true;
      if (nextMesh.instanceColor) nextMesh.instanceColor.needsUpdate = true;
      nextMesh.name = 'greater-realm-public-castle-instances';
      nextMesh.raycast = () => {};
      group.add(nextMesh);
      count = castles.length;
      const geometryBytes = Object.values(geometry.attributes).reduce(
        (total, attribute) => total + attribute.array.byteLength,
        geometry.index?.array.byteLength ?? 0
      );
      pendingUploadBytes = geometryBytes
        + castles.length * (16 + 3) * Float32Array.BYTES_PER_ELEMENT;
      if (pendingUploadBytes > GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES) {
        throw new Error('GREATER_REALM_CASTLE_UPLOAD_BUDGET_EXCEEDED');
      }
      return true;
    },
    dispose: () => {
      clear();
      appliedSignature = undefined;
    }
  });
}

function defaultRendererFactory(
  canvas: HTMLCanvasElement,
  context: WebGL2RenderingContext
): GreaterRealmRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  return renderer;
}

function snapshotSignature(
  snapshot: GreaterRealmClientSnapshot
) {
  if (snapshot.bootstrap === undefined) return undefined;
  return [
    snapshot.bootstrap.atlasId,
    snapshot.bootstrap.revision.toString(),
    snapshot.cellSize,
    snapshot.selectedChunkCount,
    ...snapshot.chunks.map((row) => (
      `${row.chunk.chunkHandle}:${row.chunk.lod}`
    ))
  ].join('|');
}

/**
 * Owns only one canvas generation. React identity/reconnect changes replace
 * this host wholesale, so renderer resources and atlas rows never cross lives.
 */
export function createGreaterRealmWorldCanvasHost(
  options: CreateGreaterRealmWorldCanvasHostOptions
): GreaterRealmWorldCanvasHost | undefined {
  const notifyFailure = () => {
    try {
      options.onFailure?.();
    } catch {
      // Presentation observers never own the renderer lifecycle.
    }
  };
  let context: WebGL2RenderingContext | null;
  try {
    context = options.canvas.getContext('webgl2', {
      alpha: false,
      antialias: options.policy.graphicsProfile !== 'reduced',
      depth: true,
      powerPreference: 'high-performance'
    });
  } catch {
    notifyFailure();
    return undefined;
  }
  if (context === null) return undefined;

  let disposed = false;
  let terminalFailure = false;
  let documentVisible = !document.hidden;
  let frame = 0;
  let appliedSignature: string | undefined;
  let fitRequested = false;
  let telemetrySignature: string | undefined;
  let renderer: GreaterRealmRenderer | undefined;
  let runtime: GreaterRealmSceneRuntime | undefined;
  let failHost = notifyFailure;
  const scene = new THREE.Scene();
  const worldGroup = new THREE.Group();
  worldGroup.name = 'greater-realm-world';
  scene.background = new THREE.Color('#11171b');
  scene.fog = new THREE.FogExp2('#172126', 0.0075);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2_000);
  const center = axialToWorld({ q: options.atlasQ, r: options.atlasR }, 1);
  const span = Math.max(32, (options.policy.radius * 2 + 1) * 15 * 1.08);
  const frameCamera = (viewSpan: number) => {
    camera.position.set(
      center.x + viewSpan * 0.48,
      viewSpan * 0.72,
      center.z + viewSpan * 0.74
    );
    camera.lookAt(center.x, 0, center.z);
  };
  frameCamera(span);

  scene.add(new THREE.HemisphereLight('#dcecff', '#38402d', 1.55));
  const sunlight = new THREE.DirectionalLight('#ffe4b0', 2.2);
  sunlight.position.set(center.x - 25, 48, center.z + 18);
  scene.add(sunlight, worldGroup);
  const castleLayer = createPublicCastleLayer(options);
  worldGroup.add(castleLayer.group);

  const publishTelemetry = (
    sceneTelemetry = runtime!.getTelemetry(),
    castleUploadBytesThisFrame = 0
  ) => {
    const castleDrawCalls = castleLayer.count > 0 ? 1 : 0;
    const combinedSceneTelemetry = Object.freeze({
      ...sceneTelemetry,
      drawCallCount: sceneTelemetry.drawCallCount + castleDrawCalls,
      instanceCount: sceneTelemetry.instanceCount + castleLayer.count,
      uploadBytesThisFrame: sceneTelemetry.uploadBytesThisFrame
        + castleUploadBytesThisFrame
    });
    const telemetry = Object.freeze({
      renderer: 'webgl' as const,
      publicCastleCount: castleLayer.count,
      publicCastleUploadBytesThisFrame: castleUploadBytesThisFrame,
      scene: combinedSceneTelemetry
    });
    const signature = [
      telemetry.scene.disposed,
      telemetry.scene.contextLost,
      telemetry.scene.selectedChunkCount,
      telemetry.scene.uploadedChunkCount,
      telemetry.scene.pendingUploadCount,
      telemetry.scene.drawCallCount,
      telemetry.scene.instanceCount,
      telemetry.scene.uploadBytesThisFrame,
      telemetry.publicCastleUploadBytesThisFrame,
      telemetry.scene.grassPatchCount,
      telemetry.scene.npcCount,
      telemetry.scene.wildlifeCount,
      telemetry.scene.boatCount,
      telemetry.publicCastleCount
    ].join(':');
    if (signature !== telemetrySignature) {
      telemetrySignature = signature;
      try {
        options.onTelemetry?.(telemetry);
      } catch {
        // Telemetry cannot invalidate a healthy scene.
      }
    }
    return telemetry;
  };
  const render = () => {
    frame = 0;
    const activeRuntime = runtime;
    const activeRenderer = renderer;
    if (
      disposed
      || terminalFailure
      || !documentVisible
      || activeRuntime === undefined
      || activeRenderer === undefined
    ) {
      return;
    }
    try {
      activeRuntime.flushUploads();
      const telemetry = activeRuntime.getTelemetry();
      if (
        fitRequested
        && !telemetry.contextLost
        && telemetry.uploadedChunkCount > 0
        && telemetry.pendingUploadCount === 0
      ) {
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(worldGroup);
        if (!bounds.isEmpty()) {
          const halfExtent = Math.max(
            Math.abs(bounds.min.x - center.x),
            Math.abs(bounds.max.x - center.x),
            Math.abs(bounds.min.z - center.z),
            Math.abs(bounds.max.z - center.z)
          );
          frameCamera(
            Math.max(10, halfExtent * 2.3)
            * Math.max(1, 0.9 / Math.max(0.1, camera.aspect))
          );
        }
        fitRequested = false;
      }
      let castleUploadBytesThisFrame = 0;
      if (!telemetry.contextLost) {
        activeRenderer.render(scene, camera);
        castleUploadBytesThisFrame = castleLayer.consumePendingUploadBytes();
      }
      publishTelemetry(telemetry, castleUploadBytesThisFrame);
      if (!telemetry.contextLost && telemetry.pendingUploadCount > 0) schedule();
    } catch {
      failHost();
    }
  };
  function schedule() {
    if (disposed || terminalFailure || !documentVisible || frame !== 0) return;
    frame = window.requestAnimationFrame(render);
  }

  try {
    renderer = (options.rendererFactory ?? defaultRendererFactory)(
      options.canvas,
      context
    );
    runtime = (options.sceneRuntimeFactory ?? createGreaterRealmSceneRuntime)({
      deviceClass: options.policy.deviceClass,
      graphicsProfile: options.policy.graphicsProfile,
      reducedMotion: options.policy.reducedMotion,
      onInvalidate: schedule,
      reservedDrawCalls: 1,
      reservedSceneInstances: GREATER_REALM_PUBLIC_LIMITS.maximumCastlesPerWindow,
      reservedUploadBytesPerFrame: GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES
    });
  } catch {
    try { runtime?.dispose(); } catch { /* Continue teardown. */ }
    try { renderer?.dispose(); } catch { /* Continue teardown. */ }
    try { castleLayer.dispose(); } catch { /* Continue teardown. */ }
    try { scene.clear(); } catch { /* Teardown is complete. */ }
    notifyFailure();
    return undefined;
  }

  const activeRuntime = runtime;
  const activeRenderer = renderer;
  let animationStopped = false;
  let resizeObserver: ResizeObserver | undefined;
  const stopRuntimeAnimation = () => {
    if (animationStopped) return;
    animationStopped = true;
    try {
      activeRuntime.stopAnimation();
    } catch {
      // Teardown continues through every independently owned resource.
    }
  };
  const resize = () => {
    if (disposed || terminalFailure) return;
    try {
      const bounds = options.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(options.canvas.clientWidth || bounds.width || 1));
      const height = Math.max(1, Math.round(options.canvas.clientHeight || bounds.height || 1));
      activeRenderer.setPixelRatio(Math.min(
        Math.max(1, window.devicePixelRatio || 1),
        options.policy.pixelRatioCap
      ));
      activeRenderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (appliedSignature !== undefined) fitRequested = true;
      schedule();
    } catch {
      failHost();
    }
  };
  const visibilityChange = () => {
    if (disposed || terminalFailure) return;
    try {
      documentVisible = !document.hidden;
      activeRuntime.setDocumentVisible(documentVisible);
      if (!documentVisible && frame !== 0) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (documentVisible) schedule();
    } catch {
      failHost();
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame !== 0) {
      try {
        window.cancelAnimationFrame(frame);
      } catch {
        // Continue teardown.
      }
    }
    frame = 0;
    try {
      resizeObserver?.disconnect();
    } catch {
      // Continue teardown.
    }
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibilityChange);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    stopRuntimeAnimation();
    try { activeRuntime.dispose(); } catch { /* Continue teardown. */ }
    try { castleLayer.dispose(); } catch { /* Continue teardown. */ }
    try { scene.clear(); } catch { /* Continue teardown. */ }
    try { activeRenderer.dispose(); } catch { /* Teardown is complete. */ }
  };
  const pageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  const pageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || disposed || terminalFailure) return;
    try {
      documentVisible = !document.hidden;
      activeRuntime.setDocumentVisible(documentVisible);
      resize();
    } catch {
      failHost();
    }
  };
  failHost = () => {
    if (disposed || terminalFailure) return;
    terminalFailure = true;
    dispose();
    notifyFailure();
  };
  try {
    worldGroup.add(activeRuntime.group);
    activeRuntime.bindCanvas(options.canvas);
    activeRuntime.setDocumentVisible(documentVisible);
    activeRuntime.startAnimation();
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(options.canvas);
    }
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    resize();
    if (disposed || terminalFailure) return undefined;
  } catch {
    failHost();
    return undefined;
  }

  return Object.freeze({
    applySnapshot: (snapshot) => {
      if (disposed || terminalFailure || snapshot.bootstrap === undefined) return;
      const signature = snapshotSignature(snapshot);
      if (signature === undefined) return;
      const surfaceChanged = signature !== appliedSignature;
      try {
        const castlesChanged = castleLayer.applySnapshot(snapshot);
        if (!surfaceChanged && !castlesChanged) return;
        if (surfaceChanged) {
          fitRequested = snapshot.phase === 'ready';
          runtime.setView({
            revision: snapshot.bootstrap.revision,
            cellSize: snapshot.cellSize,
            chunks: snapshot.chunks
          });
          appliedSignature = signature;
        }
        schedule();
      } catch {
        failHost();
      }
    },
    schedule,
    getTelemetry: publishTelemetry,
    dispose
  });
}
