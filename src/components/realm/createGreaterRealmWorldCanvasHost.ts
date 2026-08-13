import * as THREE from 'three';

import { axialToWorld } from '../../game/map/hexCoordinates';
import {
  createGreaterRealmSceneRuntime,
  type CreateGreaterRealmSceneRuntimeOptions,
  type GreaterRealmLocalVesselMove,
  type GreaterRealmLocalVesselState,
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
import {
  greaterRealmRegionPresentation
} from '../../greater-realm/greaterRealmPresentationPlan';
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
export const GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES = 98_304 as const;
export const GREATER_REALM_HOST_DRAW_CALL_RESERVE = 6 as const;
export const GREATER_REALM_HOST_INSTANCE_RESERVE = (
  GREATER_REALM_PUBLIC_LIMITS.maximumCastlesPerWindow
  + GREATER_REALM_PUBLIC_LIMITS.maximumResourceLocations
  + 6
);

export type GreaterRealmWorldSelection = Readonly<{
  kind: 'region' | 'castle' | 'resource';
  label: string;
  atlasQ: number;
  atlasR: number;
}>;

export type GreaterRealmWorldCanvasControl =
  | Readonly<{ kind: 'pan'; direction: 'north' | 'south' | 'east' | 'west' }>
  | Readonly<{ kind: 'zoom'; direction: 'in' | 'out' }>
  | Readonly<{ kind: 'orbit'; direction: 'clockwise' | 'counterclockwise' }>
  | Readonly<{ kind: 'reset' | 'select-next' | 'take-helm' | 'release-helm' }>
  | Readonly<{ kind: 'move-vessel'; direction: GreaterRealmLocalVesselMove }>;

export type GreaterRealmWorldCanvasTelemetry = Readonly<{
  renderer: 'webgl';
  publicCastleCount: number;
  publicCastleUploadBytesThisFrame: number;
  publicResourceCount: number;
  visibleRegionCount: number;
  hostUploadBytesThisFrame: number;
  scene: GreaterRealmSceneTelemetry;
}>;

export type GreaterRealmWorldCanvasHost = Readonly<{
  applySnapshot: (snapshot: GreaterRealmClientSnapshot) => void;
  control: (control: GreaterRealmWorldCanvasControl) => void;
  getLocalVesselState: () => GreaterRealmLocalVesselState;
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
  onSelectionChange?: (selection: GreaterRealmWorldSelection | undefined) => void;
  onLocalVesselStateChange?: (state: GreaterRealmLocalVesselState) => void;
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

type GreaterRealmSelectionTarget = Readonly<{
  selection: GreaterRealmWorldSelection;
  world: THREE.Vector3;
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
  let targets: readonly GreaterRealmSelectionTarget[] = Object.freeze([]);
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
    targets = Object.freeze([]);
  };
  return Object.freeze({
    group,
    get count() { return count; },
    get pendingUploadBytes() { return pendingUploadBytes; },
    get targets() { return targets; },
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
      const cells = [...snapshot.chunks.flatMap(({ chunk }) => (
        [...chunk.coreCells, ...chunk.apronCells]
      ))];
      const cellsByCoordinate = new Map(cells.map((cell) => (
        [`${cell.atlasQ},${cell.atlasR}`, cell] as const
      )));
      const signature = [
        snapshot.bootstrap?.revision.toString(),
        greaterRealmWindowCastleTopologySignature(castles),
        ...castles.map((castle) => (
          cellsByCoordinate.get(`${castle.atlasQ},${castle.atlasR}`)?.regionId ?? 'unknown'
        ))
      ].join('|');
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
      const nextTargets: GreaterRealmSelectionTarget[] = [];
      const publicNames = new Map(snapshot.bootstrap?.regions.map((region) => (
        [region.regionId, region.publicName] as const
      )) ?? []);
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
        const cell = cellsByCoordinate.get(`${castle.atlasQ},${castle.atlasR}`);
        const regionColor = greaterRealmRegionPresentation(cell?.regionId ?? '').accent;
        nextMesh.setColorAt(index, new THREE.Color(
          castle.castleId === ownCastleId ? '#f0d58c' : regionColor
        ));
        nextTargets.push(Object.freeze({
          selection: Object.freeze({
            kind: 'castle',
            label: castle.castleId === ownCastleId
              ? 'Your castle'
              : `${publicNames.get(cell?.regionId ?? '') ?? 'Public'} castle ${castle.castleId}`,
            atlasQ: castle.atlasQ,
            atlasR: castle.atlasR
          }),
          world: position.clone()
        }));
      });
      nextMesh.instanceMatrix.needsUpdate = true;
      if (nextMesh.instanceColor) nextMesh.instanceColor.needsUpdate = true;
      nextMesh.name = 'greater-realm-public-castle-instances';
      nextMesh.raycast = () => {};
      group.add(nextMesh);
      count = castles.length;
      targets = Object.freeze(nextTargets);
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

function geometryUploadBytes(geometry: THREE.BufferGeometry) {
  return Object.values(geometry.attributes).reduce(
    (total, attribute) => total + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0
  );
}

function createPublicResourceLayer() {
  const group = new THREE.Group();
  group.name = 'greater-realm-public-resource-markers';
  let appliedSignature: string | undefined;
  let count = 0;
  let drawCallCount = 0;
  let pendingUploadBytes = 0;
  let targets: readonly GreaterRealmSelectionTarget[] = Object.freeze([]);
  const clear = () => {
    group.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      object.dispose();
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
    group.clear();
    count = 0;
    drawCallCount = 0;
    pendingUploadBytes = 0;
    targets = Object.freeze([]);
  };
  return Object.freeze({
    group,
    get count() { return count; },
    get drawCallCount() { return drawCallCount; },
    get targets() { return targets; },
    consumePendingUploadBytes: () => {
      const value = pendingUploadBytes;
      pendingUploadBytes = 0;
      return value;
    },
    applySnapshot: (snapshot: GreaterRealmClientSnapshot) => {
      const selectedHandles = new Set(snapshot.chunks.map(({ chunk }) => chunk.chunkHandle));
      const resources = snapshot.resourceLocationPhase === 'ready'
        ? snapshot.resourceLocations.filter((resource) => (
            selectedHandles.has(resource.chunkHandle)
          )).slice(0, GREATER_REALM_PUBLIC_LIMITS.maximumResourceLocations)
        : Object.freeze([]);
      const signature = [
        snapshot.bootstrap?.revision.toString(),
        ...resources.map((resource) => [
          resource.locationId,
          resource.atlasQ,
          resource.atlasR,
          resource.resourceKind,
          resource.nodeCount
        ].join(':'))
      ].join('|');
      if (signature === appliedSignature) return false;
      appliedSignature = signature;
      clear();
      if (resources.length === 0) return true;
      const cellsByCoordinate = new Map(snapshot.chunks.flatMap(({ chunk }) => (
        [...chunk.coreCells, ...chunk.apronCells]
      )).map((cell) => [`${cell.atlasQ},${cell.atlasR}`, cell] as const));
      const nextTargets: GreaterRealmSelectionTarget[] = [];
      const matrix = new THREE.Matrix4();
      for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
        const rows = resources.filter((resource) => resource.resourceKind === kind);
        if (rows.length === 0) continue;
        const geometry = kind === 'wood'
          ? new THREE.ConeGeometry(0.13, 0.36, 5)
          : new THREE.OctahedronGeometry(kind === 'food' ? 0.13 : 0.16, 0);
        const material = new THREE.MeshStandardMaterial({
          color: kind === 'food' ? '#ddbf5f'
            : kind === 'wood' ? '#658d4e'
              : kind === 'stone' ? '#a5afb4' : '#e1ad3f',
          emissive: kind === 'gold' ? '#654811' : '#000000',
          emissiveIntensity: kind === 'gold' ? 0.45 : 0,
          metalness: kind === 'gold' ? 0.25 : 0.02,
          roughness: 0.7,
          fog: true
        });
        const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
        rows.forEach((resource, index) => {
          const world = axialToWorld({ q: resource.atlasQ, r: resource.atlasR }, 1);
          const cell = cellsByCoordinate.get(`${resource.atlasQ},${resource.atlasR}`);
          const y = (cell?.elevation ?? 240) / 1_000 + 0.24;
          const size = Math.min(1.75, 1 + Math.log2(resource.nodeCount + 1) * 0.12);
          matrix.makeScale(size, size, size);
          matrix.setPosition(world.x, y, world.z);
          mesh.setMatrixAt(index, matrix);
          nextTargets.push(Object.freeze({
            selection: Object.freeze({
              kind: 'resource',
              label: `${resource.resourceKind} resource · ${resource.nodeCount} nodes`,
              atlasQ: resource.atlasQ,
              atlasR: resource.atlasR
            }),
            world: new THREE.Vector3(world.x, y, world.z)
          }));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.name = `greater-realm-public-resource-${kind}`;
        mesh.raycast = () => {};
        group.add(mesh);
        drawCallCount += 1;
        pendingUploadBytes += geometryUploadBytes(geometry)
          + rows.length * 16 * Float32Array.BYTES_PER_ELEMENT;
      }
      count = resources.length;
      targets = Object.freeze(nextTargets);
      return true;
    },
    dispose: () => {
      clear();
      appliedSignature = undefined;
    }
  });
}

function createVisibleRegionLayer() {
  const group = new THREE.Group();
  group.name = 'greater-realm-visible-region-landmarks';
  let appliedSignature: string | undefined;
  let count = 0;
  let pendingUploadBytes = 0;
  let targets: readonly GreaterRealmSelectionTarget[] = Object.freeze([]);
  let geometry: THREE.ConeGeometry | undefined;
  let material: THREE.MeshStandardMaterial | undefined;
  let mesh: THREE.InstancedMesh | undefined;
  const clear = () => {
    group.clear();
    mesh?.dispose();
    geometry?.dispose();
    material?.dispose();
    geometry = undefined;
    material = undefined;
    mesh = undefined;
    count = 0;
    pendingUploadBytes = 0;
    targets = Object.freeze([]);
  };
  return Object.freeze({
    group,
    get count() { return count; },
    get targets() { return targets; },
    consumePendingUploadBytes: () => {
      const value = pendingUploadBytes;
      pendingUploadBytes = 0;
      return value;
    },
    applySnapshot: (snapshot: GreaterRealmClientSnapshot) => {
      if (snapshot.bootstrap === undefined) return false;
      const byCellKey = new Map(snapshot.chunks.flatMap(({ chunk }) => (
        [...chunk.coreCells, ...chunk.apronCells]
      )).map((cell) => [cell.cellKey, cell] as const));
      const regions = snapshot.bootstrap.regions.flatMap((region) => {
        const cells = [...byCellKey.values()].filter((cell) => cell.regionId === region.regionId);
        if (cells.length === 0) return [];
        const total = cells.reduce((sum, cell) => Object.freeze({
          q: sum.q + cell.atlasQ,
          r: sum.r + cell.atlasR,
          elevation: sum.elevation + cell.elevation
        }), { q: 0, r: 0, elevation: 0 });
        return [Object.freeze({
          region,
          atlasQ: Math.round(total.q / cells.length),
          atlasR: Math.round(total.r / cells.length),
          elevation: total.elevation / cells.length,
          cellCount: cells.length
        })];
      });
      const signature = [
        snapshot.bootstrap.revision.toString(),
        ...regions.map((row) => (
          `${row.region.regionId}:${row.atlasQ}:${row.atlasR}:${row.elevation}:${row.cellCount}`
        ))
      ].join('|');
      if (signature === appliedSignature) return false;
      appliedSignature = signature;
      clear();
      if (regions.length === 0) return true;
      geometry = new THREE.ConeGeometry(0.26, 0.72, 6);
      material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.66,
        metalness: 0.08,
        fog: true
      });
      mesh = new THREE.InstancedMesh(geometry, material, regions.length);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const nextTargets: GreaterRealmSelectionTarget[] = [];
      regions.forEach((row, index) => {
        const world = axialToWorld({ q: row.atlasQ, r: row.atlasR }, 1);
        const size = 1 + row.region.ordinal * 0.065;
        position.set(world.x, row.elevation / 1_000 + 0.38 * size, world.z);
        scale.set(size, size, size);
        matrix.compose(position, rotation, scale);
        mesh!.setMatrixAt(index, matrix);
        mesh!.setColorAt(index, new THREE.Color(
          greaterRealmRegionPresentation(row.region.regionId).accent
        ));
        nextTargets.push(Object.freeze({
          selection: Object.freeze({
            kind: 'region',
            label: row.region.publicName,
            atlasQ: row.atlasQ,
            atlasR: row.atlasR
          }),
          world: position.clone()
        }));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = 'greater-realm-visible-region-landmark-instances';
      mesh.userData.labels = regions.map((row) => row.region.publicName);
      mesh.raycast = () => {};
      group.add(mesh);
      count = regions.length;
      targets = Object.freeze(nextTargets);
      pendingUploadBytes = geometryUploadBytes(geometry)
        + regions.length * (16 + 3) * Float32Array.BYTES_PER_ELEMENT;
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
  const cameraTarget = new THREE.Vector3(center.x, 0, center.z);
  let cameraYaw = 0;
  let cameraPitch = Math.PI * 0.22;
  let cameraDistance = span;
  const minimumCameraDistance = 4;
  const maximumCameraDistance = Math.max(96, span * 4);
  const applyCamera = () => {
    const horizontal = Math.cos(cameraPitch) * cameraDistance;
    camera.position.set(
      cameraTarget.x + Math.sin(cameraYaw) * horizontal,
      cameraTarget.y + Math.sin(cameraPitch) * cameraDistance,
      cameraTarget.z + Math.cos(cameraYaw) * horizontal
    );
    camera.lookAt(cameraTarget);
  };
  const frameCamera = (viewSpan: number) => {
    cameraTarget.set(center.x, 0, center.z);
    const offsetX = viewSpan * 0.48;
    const offsetY = viewSpan * 0.72;
    const offsetZ = viewSpan * 0.74;
    cameraDistance = Math.min(
      maximumCameraDistance,
      Math.max(minimumCameraDistance, Math.hypot(offsetX, offsetY, offsetZ))
    );
    cameraYaw = Math.atan2(offsetX, offsetZ);
    cameraPitch = Math.asin(offsetY / cameraDistance);
    applyCamera();
  };
  frameCamera(span);

  scene.add(new THREE.HemisphereLight('#dcecff', '#38402d', 1.55));
  const sunlight = new THREE.DirectionalLight('#ffe4b0', 2.2);
  sunlight.position.set(center.x - 25, 48, center.z + 18);
  scene.add(sunlight, worldGroup);
  const castleLayer = createPublicCastleLayer(options);
  const resourceLayer = createPublicResourceLayer();
  const regionLayer = createVisibleRegionLayer();
  worldGroup.add(castleLayer.group, resourceLayer.group, regionLayer.group);
  let selectionTargets: readonly GreaterRealmSelectionTarget[] = Object.freeze([]);
  let selectedTargetIndex = -1;
  const publishSelection = (target: GreaterRealmSelectionTarget | undefined) => {
    try {
      options.onSelectionChange?.(target?.selection);
    } catch {
      // Selection observers cannot invalidate the scene.
    }
  };
  const publishLocalVesselState = (state: GreaterRealmLocalVesselState) => {
    try {
      options.onLocalVesselStateChange?.(state);
    } catch {
      // Local presentation observers cannot invalidate the scene.
    }
  };

  const publishTelemetry = (
    sceneTelemetry = runtime!.getTelemetry(),
    hostUploadBytesThisFrame = 0,
    castleUploadBytesThisFrame = 0
  ) => {
    const castleDrawCalls = castleLayer.count > 0 ? 1 : 0;
    const regionDrawCalls = regionLayer.count > 0 ? 1 : 0;
    const hostDrawCalls = castleDrawCalls + regionDrawCalls + resourceLayer.drawCallCount;
    const hostInstances = castleLayer.count + regionLayer.count + resourceLayer.count;
    const combinedSceneTelemetry = Object.freeze({
      ...sceneTelemetry,
      drawCallCount: sceneTelemetry.drawCallCount + hostDrawCalls,
      instanceCount: sceneTelemetry.instanceCount + hostInstances,
      uploadBytesThisFrame: sceneTelemetry.uploadBytesThisFrame
        + hostUploadBytesThisFrame
    });
    const telemetry = Object.freeze({
      renderer: 'webgl' as const,
      publicCastleCount: castleLayer.count,
      publicCastleUploadBytesThisFrame: castleUploadBytesThisFrame,
      publicResourceCount: resourceLayer.count,
      visibleRegionCount: regionLayer.count,
      hostUploadBytesThisFrame,
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
      telemetry.hostUploadBytesThisFrame,
      telemetry.publicCastleUploadBytesThisFrame,
      telemetry.scene.grassPatchCount,
      telemetry.scene.npcCount,
      telemetry.scene.wildlifeCount,
      telemetry.scene.ambientBoatCount,
      telemetry.scene.localVesselCount,
      telemetry.scene.boatCount,
      telemetry.publicCastleCount,
      telemetry.publicResourceCount,
      telemetry.visibleRegionCount
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
      let hostUploadBytesThisFrame = 0;
      if (!telemetry.contextLost) {
        activeRenderer.render(scene, camera);
        castleUploadBytesThisFrame = castleLayer.consumePendingUploadBytes();
        hostUploadBytesThisFrame = castleUploadBytesThisFrame
          + resourceLayer.consumePendingUploadBytes()
          + regionLayer.consumePendingUploadBytes();
        if (hostUploadBytesThisFrame > GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES) {
          throw new Error('GREATER_REALM_HOST_UPLOAD_BUDGET_EXCEEDED');
        }
      }
      publishTelemetry(telemetry, hostUploadBytesThisFrame, castleUploadBytesThisFrame);
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
      localVesselOrigin: { atlasQ: options.atlasQ, atlasR: options.atlasR },
      onInvalidate: schedule,
      reservedDrawCalls: GREATER_REALM_HOST_DRAW_CALL_RESERVE,
      reservedSceneInstances: GREATER_REALM_HOST_INSTANCE_RESERVE,
      reservedUploadBytesPerFrame: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES
    });
  } catch {
    try { runtime?.dispose(); } catch { /* Continue teardown. */ }
    try { renderer?.dispose(); } catch { /* Continue teardown. */ }
    try { castleLayer.dispose(); } catch { /* Continue teardown. */ }
    try { resourceLayer.dispose(); } catch { /* Continue teardown. */ }
    try { regionLayer.dispose(); } catch { /* Continue teardown. */ }
    try { scene.clear(); } catch { /* Teardown is complete. */ }
    notifyFailure();
    return undefined;
  }

  const activeRuntime = runtime;
  const activeRenderer = renderer;
  camera.userData.greaterRealmReducedMotion = options.policy.reducedMotion;
  const focusSelection = (target: GreaterRealmSelectionTarget) => {
    cameraTarget.set(target.world.x, target.world.y, target.world.z);
    applyCamera();
    publishSelection(target);
    schedule();
  };
  const selectNext = () => {
    if (selectionTargets.length === 0) {
      selectedTargetIndex = -1;
      publishSelection(undefined);
      return;
    }
    selectedTargetIndex = (selectedTargetIndex + 1) % selectionTargets.length;
    focusSelection(selectionTargets[selectedTargetIndex]!);
  };
  const control = (input: GreaterRealmWorldCanvasControl) => {
    if (disposed || terminalFailure) return;
    fitRequested = false;
    if (input.kind === 'pan') {
      const step = Math.max(0.5, cameraDistance * 0.075);
      if (input.direction === 'north') cameraTarget.z -= step;
      else if (input.direction === 'south') cameraTarget.z += step;
      else if (input.direction === 'east') cameraTarget.x += step;
      else cameraTarget.x -= step;
      applyCamera();
      schedule();
      return;
    }
    if (input.kind === 'zoom') {
      cameraDistance = Math.min(
        maximumCameraDistance,
        Math.max(
          minimumCameraDistance,
          cameraDistance * (input.direction === 'in' ? 0.82 : 1.22)
        )
      );
      applyCamera();
      schedule();
      return;
    }
    if (input.kind === 'orbit') {
      cameraYaw += input.direction === 'clockwise' ? Math.PI / 12 : -Math.PI / 12;
      applyCamera();
      schedule();
      return;
    }
    if (input.kind === 'reset') {
      frameCamera(span);
      schedule();
      return;
    }
    if (input.kind === 'select-next') {
      selectNext();
      return;
    }
    if (input.kind === 'take-helm') {
      publishLocalVesselState(activeRuntime.selectLocalVessel());
      schedule();
      return;
    }
    if (input.kind === 'release-helm') {
      publishLocalVesselState(activeRuntime.releaseLocalVessel());
      schedule();
      return;
    }
    if (input.kind === 'move-vessel') {
      publishLocalVesselState(activeRuntime.moveLocalVessel(input.direction));
      schedule();
    }
  };

  type PointerSample = Readonly<{
    x: number;
    y: number;
    pointerType: string;
    button: number;
    shiftKey: boolean;
  }>;
  const pointers = new Map<number, PointerSample>();
  let pointerTravel = 0;
  let pinchDistance: number | undefined;
  let pinchAngle: number | undefined;
  const pointerDown = (event: PointerEvent) => {
    if (disposed || terminalFailure) return;
    fitRequested = false;
    pointerTravel = 0;
    pointers.set(event.pointerId, Object.freeze({
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: event.button,
      shiftKey: event.shiftKey
    }));
    try { options.canvas.setPointerCapture?.(event.pointerId); } catch { /* Optional. */ }
    try { options.canvas.focus({ preventScroll: true }); } catch { options.canvas.focus(); }
    event.preventDefault();
  };
  const pointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined || disposed || terminalFailure) return;
    const next = Object.freeze({
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: previous.button,
      shiftKey: event.shiftKey
    });
    pointers.set(event.pointerId, next);
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    pointerTravel += Math.hypot(dx, dy);
    const samples = [...pointers.values()];
    if (samples.length >= 2) {
      const first = samples[0]!;
      const second = samples[1]!;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const angle = Math.atan2(second.y - first.y, second.x - first.x);
      if (pinchDistance !== undefined && pinchDistance > 0 && distance > 0) {
        cameraDistance = Math.min(
          maximumCameraDistance,
          Math.max(minimumCameraDistance, cameraDistance * pinchDistance / distance)
        );
      }
      if (pinchAngle !== undefined) cameraYaw += angle - pinchAngle;
      pinchDistance = distance;
      pinchAngle = angle;
    } else if (previous.button === 2 || previous.shiftKey || event.shiftKey) {
      cameraYaw -= dx * 0.008;
      cameraPitch = Math.min(
        Math.PI * 0.45,
        Math.max(Math.PI * 0.08, cameraPitch + dy * 0.005)
      );
    } else {
      const scale = cameraDistance * 0.0018;
      const rightX = Math.cos(cameraYaw);
      const rightZ = -Math.sin(cameraYaw);
      const forwardX = -Math.sin(cameraYaw);
      const forwardZ = -Math.cos(cameraYaw);
      cameraTarget.x -= rightX * dx * scale + forwardX * dy * scale;
      cameraTarget.z -= rightZ * dx * scale + forwardZ * dy * scale;
    }
    applyCamera();
    schedule();
    event.preventDefault();
  };
  const pickAt = (clientX: number, clientY: number) => {
    const bounds = options.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    camera.updateMatrixWorld(true);
    let nearest: Readonly<{ target: GreaterRealmSelectionTarget; distance: number }> | undefined;
    for (const target of selectionTargets) {
      const projected = target.world.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = bounds.left + (projected.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - projected.y) * bounds.height / 2;
      const distance = Math.hypot(clientX - x, clientY - y);
      if (distance <= 34 && (nearest === undefined || distance < nearest.distance)) {
        nearest = Object.freeze({ target, distance });
      }
    }
    if (nearest !== undefined) {
      selectedTargetIndex = selectionTargets.indexOf(nearest.target);
      focusSelection(nearest.target);
    }
  };
  const pointerUp = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    try { options.canvas.releasePointerCapture?.(event.pointerId); } catch { /* Optional. */ }
    if (pointers.size < 2) {
      pinchDistance = undefined;
      pinchAngle = undefined;
    }
    if (pointers.size === 0 && pointerTravel < 5) pickAt(event.clientX, event.clientY);
  };
  const pointerCancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    try { options.canvas.releasePointerCapture?.(event.pointerId); } catch { /* Optional. */ }
    if (pointers.size < 2) {
      pinchDistance = undefined;
      pinchAngle = undefined;
    }
  };
  const wheel = (event: WheelEvent) => {
    if (disposed || terminalFailure) return;
    control({ kind: 'zoom', direction: event.deltaY < 0 ? 'in' : 'out' });
    event.preventDefault();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const command: GreaterRealmWorldCanvasControl | undefined =
      key === 'arrowup' || key === 'w' ? { kind: 'pan', direction: 'north' }
        : key === 'arrowdown' || key === 's' ? { kind: 'pan', direction: 'south' }
          : key === 'arrowleft' || key === 'a' ? { kind: 'pan', direction: 'west' }
            : key === 'arrowright' || key === 'd' ? { kind: 'pan', direction: 'east' }
              : key === '+' || key === '=' ? { kind: 'zoom', direction: 'in' }
                : key === '-' || key === '_' ? { kind: 'zoom', direction: 'out' }
                  : key === 'q' ? { kind: 'orbit', direction: 'counterclockwise' }
                    : key === 'e' ? { kind: 'orbit', direction: 'clockwise' }
                      : key === 'home' ? { kind: 'reset' }
                        : key === 'enter' || key === ' ' ? { kind: 'select-next' }
                          : undefined;
    if (command === undefined) return;
    control(command);
    event.preventDefault();
  };
  const contextMenu = (event: MouseEvent) => event.preventDefault();
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
      if (!documentVisible) {
        if (frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        pointers.clear();
        pinchDistance = undefined;
        pinchAngle = undefined;
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
    options.canvas.removeEventListener('pointerdown', pointerDown);
    options.canvas.removeEventListener('wheel', wheel);
    options.canvas.removeEventListener('keydown', keyDown);
    options.canvas.removeEventListener('contextmenu', contextMenu);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerCancel);
    document.removeEventListener('visibilitychange', visibilityChange);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    stopRuntimeAnimation();
    pointers.clear();
    try { activeRuntime.dispose(); } catch { /* Continue teardown. */ }
    try { castleLayer.dispose(); } catch { /* Continue teardown. */ }
    try { resourceLayer.dispose(); } catch { /* Continue teardown. */ }
    try { regionLayer.dispose(); } catch { /* Continue teardown. */ }
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
    options.canvas.addEventListener('pointerdown', pointerDown);
    options.canvas.addEventListener('wheel', wheel, { passive: false });
    options.canvas.addEventListener('keydown', keyDown);
    options.canvas.addEventListener('contextmenu', contextMenu);
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    publishLocalVesselState(activeRuntime.getLocalVesselState());
    resize();
    if (disposed || terminalFailure) return undefined;
  } catch {
    failHost();
    return undefined;
  }

  return Object.freeze({
    applySnapshot: (snapshot) => {
      if (
        disposed
        || terminalFailure
        || snapshot.phase !== 'ready'
        || snapshot.bootstrap === undefined
      ) return;
      const signature = snapshotSignature(snapshot);
      if (signature === undefined) return;
      const surfaceChanged = signature !== appliedSignature;
      try {
        const castlesChanged = castleLayer.applySnapshot(snapshot);
        const resourcesChanged = resourceLayer.applySnapshot(snapshot);
        const regionsChanged = regionLayer.applySnapshot(snapshot);
        if (!surfaceChanged && !castlesChanged && !resourcesChanged && !regionsChanged) return;
        if (surfaceChanged) {
          fitRequested = snapshot.phase === 'ready';
          runtime.setView({
            revision: snapshot.bootstrap.revision,
            cellSize: snapshot.cellSize,
            chunks: snapshot.chunks
          });
          appliedSignature = signature;
          publishLocalVesselState(runtime.getLocalVesselState());
        }
        selectionTargets = Object.freeze([
          ...regionLayer.targets,
          ...castleLayer.targets,
          ...resourceLayer.targets
        ]);
        selectedTargetIndex = -1;
        publishSelection(undefined);
        schedule();
      } catch {
        failHost();
      }
    },
    control,
    getLocalVesselState: () => activeRuntime.getLocalVesselState(),
    schedule,
    getTelemetry: publishTelemetry,
    dispose
  });
}
