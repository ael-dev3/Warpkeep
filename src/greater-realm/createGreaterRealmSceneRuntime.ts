import * as THREE from 'three';

import { axialToWorld } from '../game/map/hexCoordinates';
import { createRealmAmbientScheduler, type RealmAmbientScheduler } from '../components/realm/realmAmbientScheduler';
import { sampleRealmLivingEnvironment } from '../components/realm/realmLivingEnvironment';
import {
  greaterRealmCoordinateKey,
  type GreaterRealmAtlasCoordinate,
  type GreaterRealmChunkDto,
  type GreaterRealmPublicCellDto
} from './greaterRealmPublicContract';
import {
  createGreaterRealmChunkPresentationPlan,
  type GreaterRealmCellAccessPresentation,
  type GreaterRealmChunkPresentationPlan,
  type GreaterRealmPresentationActor
} from './greaterRealmPresentationPlan';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  greaterRealmAnimationEnabled,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from './greaterRealmRuntimePolicy';

export type GreaterRealmSceneViewChunk = Readonly<{
  chunk: GreaterRealmChunkDto;
  distanceChunks: number;
}>;

export type GreaterRealmSceneTelemetry = Readonly<{
  disposed: boolean;
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  reducedMotion: boolean;
  contextLost: boolean;
  selectedChunkCount: number;
  uploadedChunkCount: number;
  pendingUploadCount: number;
  drawCallCount: number;
  instanceCount: number;
  accessCellCount: number;
  blockedCellCount: number;
  canopyCount: number;
  grassPatchCount: number;
  grassBladeCount: number;
  grassTriangleCount: number;
  flowerCount: number;
  flowerGeometryBytes: number;
  npcCount: number;
  wildlifeCount: number;
  boatCount: number;
  resourceCount: number;
  uploadedThisFrame: number;
  uploadBytesThisFrame: number;
  maximumUploadsPerFrame: number;
  maximumUploadBytesPerFrame: number;
  skippedByBudgetCount: number;
}>;

export type GreaterRealmSceneRuntime = Readonly<{
  group: THREE.Group;
  setView: (input: Readonly<{
    revision: bigint;
    cellSize: number;
    chunks: readonly GreaterRealmSceneViewChunk[];
  }>) => void;
  flushUploads: () => number;
  update: (elapsedSeconds: number) => boolean;
  startAnimation: () => void;
  stopAnimation: () => void;
  setReducedMotion: (reduced: boolean) => void;
  setDocumentVisible: (visible: boolean) => void;
  bindCanvas: (canvas: HTMLCanvasElement | null) => void;
  getCellAccess: (
    coordinate: GreaterRealmAtlasCoordinate
  ) => GreaterRealmCellAccessPresentation | undefined;
  isCoordinatePassable: (coordinate: GreaterRealmAtlasCoordinate) => boolean;
  getTelemetry: () => GreaterRealmSceneTelemetry;
  dispose: () => void;
}>;

export type CreateGreaterRealmSceneRuntimeOptions = Readonly<{
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  reducedMotion?: boolean;
  onInvalidate?: () => void;
}>;

type ActorRenderRef = Readonly<{
  actor: GreaterRealmPresentationActor;
  mesh: THREE.InstancedMesh;
  index: number;
}>;

type ChunkRenderResource = Readonly<{
  signature: string;
  group: THREE.Group;
  plan: GreaterRealmChunkPresentationPlan;
  waterMaterials: readonly THREE.MeshStandardMaterial[];
  actors: readonly ActorRenderRef[];
  dispose: () => void;
}>;

type SelectedChunk = Readonly<{
  signature: string;
  plan: GreaterRealmChunkPresentationPlan;
  priority: number;
}>;

function finiteDistance(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : Number.MAX_SAFE_INTEGER;
}

function biomeColor(biomeClass: number) {
  if ([6, 7].includes(biomeClass)) return new THREE.Color('#c7d1cf');
  if ([11, 12].includes(biomeClass)) return new THREE.Color('#b49a67');
  if (biomeClass === 13) return new THREE.Color('#a4694d');
  if (biomeClass === 14) return new THREE.Color('#5d5751');
  if ([3, 4, 5].includes(biomeClass)) return new THREE.Color('#405d43');
  if ([16, 17, 18].includes(biomeClass)) return new THREE.Color('#667c61');
  if ([20, 21, 22].includes(biomeClass)) return new THREE.Color('#567d88');
  if (biomeClass === 8) return new THREE.Color('#776c55');
  return new THREE.Color('#647e49');
}

function hexTriangles(
  positions: number[],
  colors: number[] | undefined,
  center: Readonly<{ x: number; y: number; z: number }>,
  size: number,
  color?: THREE.Color
) {
  for (let corner = 0; corner < 6; corner += 1) {
    const angleA = Math.PI / 180 * (60 * corner - 30);
    const angleB = Math.PI / 180 * (60 * (corner + 1) - 30);
    positions.push(
      center.x, center.y, center.z,
      center.x + Math.cos(angleB) * size, center.y, center.z + Math.sin(angleB) * size,
      center.x + Math.cos(angleA) * size, center.y, center.z + Math.sin(angleA) * size
    );
    if (colors && color) {
      for (let vertex = 0; vertex < 3; vertex += 1) colors.push(color.r, color.g, color.b);
    }
  }
}

function cellWorld(cell: GreaterRealmPublicCellDto, cellSize: number, lift = 0) {
  const world = axialToWorld({ q: cell.atlasQ, r: cell.atlasR }, cellSize);
  return Object.freeze({ x: world.x, y: cell.elevation / 1_000 + lift, z: world.z });
}

function terrainMesh(plan: GreaterRealmChunkPresentationPlan, cellSize: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const cell of plan.terrainCells) {
    const color = biomeColor(cell.biomeClass);
    if (plan.apronCoordinateKeys.includes(greaterRealmCoordinateKey(cell))) {
      color.multiplyScalar(0.76);
    }
    hexTriangles(positions, colors, cellWorld(cell, cellSize), cellSize * 0.98, color);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    fog: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `greater-realm-terrain:${plan.chunkHandle}`;
  mesh.raycast = () => {};
  return mesh;
}

function waterMesh(plan: GreaterRealmChunkPresentationPlan, cellSize: number) {
  if (plan.waterCells.length === 0) return undefined;
  const positions: number[] = [];
  for (const cell of plan.waterCells) {
    const world = axialToWorld({ q: cell.atlasQ, r: cell.atlasR }, cellSize);
    const y = (cell.hydroSurfaceMilli ?? cell.elevation) / 1_000 + 0.035;
    hexTriangles(positions, undefined, { x: world.x, y, z: world.z }, cellSize * 0.93);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const first = plan.waterCells[0]!;
  const material = new THREE.MeshStandardMaterial({
    color: '#3e8797',
    roughness: 0.3,
    metalness: 0.02,
    transparent: true,
    opacity: 0.72,
    depthWrite: true,
    fog: true
  });
  material.userData.greaterRealmPhase = (
    (first.bankVariant ^ first.presentationVariant) >>> 0
  ) / 0x1_0000_0000;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `greater-realm-water:${plan.chunkHandle}`;
  mesh.raycast = () => {};
  return Object.freeze({ mesh, material });
}

function routeLines(plan: GreaterRealmChunkPresentationPlan) {
  if (plan.routeSegments.length === 0) return undefined;
  const positions: number[] = [];
  const colors: number[] = [];
  for (const segment of plan.routeSegments) {
    positions.push(
      segment.from.x, segment.from.y, segment.from.z,
      segment.to.x, segment.to.y, segment.to.z
    );
    const color = segment.kind === 'river' || segment.kind === 'stream'
      || segment.kind === 'boat-lane'
      ? new THREE.Color('#69a7b2')
      : segment.kind === 'track'
        ? new THREE.Color('#786b52')
        : new THREE.Color('#9a8059');
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    fog: true
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = `greater-realm-routes:${plan.chunkHandle}`;
  lines.raycast = () => {};
  return lines;
}

function crossingMesh(plan: GreaterRealmChunkPresentationPlan, cellSize: number) {
  if (plan.crossings.length === 0) return undefined;
  const geometry = new THREE.BoxGeometry(cellSize * 0.58, 0.06, cellSize * 0.2);
  const material = new THREE.MeshStandardMaterial({
    color: '#8a7658', roughness: 0.9, vertexColors: true, fog: true
  });
  const mesh = new THREE.InstancedMesh(geometry, material, plan.crossings.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  plan.crossings.forEach((crossing, index) => {
    position.set(crossing.position.x, crossing.position.y, crossing.position.z);
    quaternion.setFromAxisAngle(up, crossing.headingRadians);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(
      crossing.kind === 'bridge' ? '#8a7658' : '#8e9a7b'
    ));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = `greater-realm-crossings:${plan.chunkHandle}`;
  mesh.raycast = () => {};
  return mesh;
}

function resourceColor(kind: GreaterRealmChunkPresentationPlan['resources'][number]['kind']) {
  if (kind === 'food') return '#d6b85c';
  if (kind === 'wood') return '#6d8a50';
  if (kind === 'stone') return '#89939a';
  return '#d7a94a';
}

function resourceMeshes(plan: GreaterRealmChunkPresentationPlan) {
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    const rows = plan.resources.filter((resource) => resource.kind === kind);
    if (rows.length === 0) continue;
    const geometry = new THREE.OctahedronGeometry(0.075, 0);
    const material = new THREE.MeshStandardMaterial({
      color: resourceColor(kind), roughness: 0.72, metalness: kind === 'gold' ? 0.18 : 0
    });
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    rows.forEach((resource, index) => {
      const size = Math.min(1.4, 0.82 + Math.log2(resource.nodeCount + 1) * 0.08);
      matrix.makeScale(size, size, size);
      matrix.setPosition(resource.position.x, resource.position.y, resource.position.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = `greater-realm-resource-${kind}:${plan.chunkHandle}`;
    mesh.raycast = () => {};
    meshes.push(mesh);
  }
  return Object.freeze(meshes);
}

function actorGeometry(kind: GreaterRealmPresentationActor['kind']) {
  if (kind === 'canopy') return new THREE.ConeGeometry(0.075, 0.38, 5);
  if (kind === 'grass') return new THREE.ConeGeometry(0.035, 0.16, 3);
  if (kind === 'flower') return new THREE.ConeGeometry(0.025, 0.12, 4);
  if (kind === 'npc') return new THREE.CylinderGeometry(0.055, 0.075, 0.28, 5);
  if (kind === 'wildlife') return new THREE.BoxGeometry(0.16, 0.09, 0.08);
  return new THREE.BoxGeometry(0.24, 0.07, 0.1);
}

function actorColor(kind: GreaterRealmPresentationActor['kind']) {
  if (kind === 'canopy') return '#496c46';
  if (kind === 'grass') return '#6d8b50';
  if (kind === 'flower') return '#d7bd72';
  if (kind === 'npc') return '#8a654f';
  if (kind === 'wildlife') return '#826e54';
  return '#835f45';
}

function actorMeshes(plan: GreaterRealmChunkPresentationPlan) {
  const refs: ActorRenderRef[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of ['canopy', 'grass', 'flower', 'npc', 'wildlife', 'boat'] as const) {
    const actors = plan.actors.filter((actor) => actor.kind === kind);
    if (actors.length === 0) continue;
    const geometry = actorGeometry(kind);
    const material = new THREE.MeshStandardMaterial({
      color: actorColor(kind), roughness: 0.88, fog: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, actors.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = `greater-realm-${kind}:${plan.chunkHandle}`;
    mesh.raycast = () => {};
    actors.forEach((actor, index) => {
      position.set(actor.position.x, actor.position.y, actor.position.z);
      quaternion.setFromAxisAngle(up, actor.headingRadians);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      refs.push(Object.freeze({ actor, mesh, index }));
    });
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }
  return Object.freeze({ meshes: Object.freeze(meshes), refs: Object.freeze(refs) });
}

function boundaryMesh(plan: GreaterRealmChunkPresentationPlan) {
  if (plan.sealedEdges.length === 0) return undefined;
  const positions: number[] = [];
  for (const edge of plan.sealedEdges) {
    positions.push(
      edge.from.x, edge.from.y - 0.7, edge.from.z,
      edge.to.x, edge.to.y - 0.7, edge.to.z,
      edge.to.x, edge.to.y + 0.48, edge.to.z,
      edge.from.x, edge.from.y - 0.7, edge.from.z,
      edge.to.x, edge.to.y + 0.48, edge.to.z,
      edge.from.x, edge.from.y + 0.48, edge.from.z
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    color: '#28343c',
    emissive: '#18242c',
    emissiveIntensity: 0.18,
    roughness: 1,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `greater-realm-fog-skirt:${plan.chunkHandle}`;
  mesh.raycast = () => {};
  return mesh;
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
    const material = renderable.material;
    if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
    else if (material instanceof THREE.Material) materials.add(material);
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  root.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function buildChunkResource(selected: SelectedChunk, cellSize: number): ChunkRenderResource {
  const group = new THREE.Group();
  group.name = `greater-realm-chunk:${selected.plan.chunkHandle}:lod${selected.plan.lod}`;
  group.add(terrainMesh(selected.plan, cellSize));
  const water = waterMesh(selected.plan, cellSize);
  if (water) group.add(water.mesh);
  const routes = routeLines(selected.plan);
  if (routes) group.add(routes);
  const crossings = crossingMesh(selected.plan, cellSize);
  if (crossings) group.add(crossings);
  const actors = actorMeshes(selected.plan);
  actors.meshes.forEach((mesh) => group.add(mesh));
  resourceMeshes(selected.plan).forEach((mesh) => group.add(mesh));
  const boundary = boundaryMesh(selected.plan);
  if (boundary) group.add(boundary);
  let disposed = false;
  return Object.freeze({
    signature: selected.signature,
    group,
    plan: selected.plan,
    waterMaterials: Object.freeze(water ? [water.material] : []),
    actors: actors.refs,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeObject(group);
    }
  });
}

function planSignature(plan: GreaterRealmChunkPresentationPlan) {
  return [
    plan.revision, plan.lod, plan.cellSize, plan.drawCallCount, plan.instanceCount,
    plan.terrainCells.length, plan.sealedEdges.length,
    plan.actors.map((actor) => actor.id).join(',')
  ].join('|');
}

export function createGreaterRealmSceneRuntime(
  options: CreateGreaterRealmSceneRuntimeOptions
): GreaterRealmSceneRuntime {
  const budget = GREATER_REALM_GRAPHICS_BUDGETS[options.graphicsProfile];
  const group = new THREE.Group();
  group.name = 'greater-realm-runtime';
  let disposed = false;
  let reducedMotion = Boolean(options.reducedMotion);
  let contextLost = false;
  let documentVisible = true;
  let cellSize = 1;
  let selected = new Map<string, SelectedChunk>();
  let pending = new Map<string, SelectedChunk>();
  const uploaded = new Map<string, ChunkRenderResource>();
  const access = new Map<string, GreaterRealmCellAccessPresentation>();
  let scheduler: RealmAmbientScheduler | undefined;
  let uploadedThisFrame = 0;
  let uploadBytesThisFrame = 0;
  let skippedByBudgetCount = 0;
  let boundCanvas: HTMLCanvasElement | null = null;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const tiltAxis = new THREE.Vector3(0, 0, 1);
  const tilt = new THREE.Quaternion();
  const livingSample = { timeSeconds: 0, windX: 0, windZ: 0, gust: 0 };

  const removeUploaded = (handle: string) => {
    const resource = uploaded.get(handle);
    if (!resource) return;
    uploaded.delete(handle);
    group.remove(resource.group);
    resource.dispose();
  };

  const animationActive = () => greaterRealmAnimationEnabled(
    reducedMotion, contextLost, documentVisible
  );
  const syncScheduler = () => scheduler?.setActive(animationActive());
  const queueAllSelected = () => {
    pending = new Map([...selected.entries()].filter(([handle, row]) => (
      uploaded.get(handle)?.signature !== row.signature
    )));
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (disposed || contextLost) return;
    contextLost = true;
    for (const handle of [...uploaded.keys()]) removeUploaded(handle);
    queueAllSelected();
    syncScheduler();
    options.onInvalidate?.();
  };
  const handleContextRestored = () => {
    if (disposed || !contextLost) return;
    contextLost = false;
    queueAllSelected();
    syncScheduler();
    options.onInvalidate?.();
  };
  const bindCanvas = (canvas: HTMLCanvasElement | null) => {
    if (boundCanvas === canvas) return;
    boundCanvas?.removeEventListener('webglcontextlost', handleContextLost);
    boundCanvas?.removeEventListener('webglcontextrestored', handleContextRestored);
    boundCanvas = canvas;
    boundCanvas?.addEventListener('webglcontextlost', handleContextLost);
    boundCanvas?.addEventListener('webglcontextrestored', handleContextRestored);
    // A replacement canvas owns a fresh WebGL context. It will never emit the
    // restoration event belonging to the detached canvas, so resolve the old
    // loss explicitly and rebuild selected per-chunk resources on the new one.
    if (!disposed && contextLost && boundCanvas !== null) {
      contextLost = false;
      queueAllSelected();
      syncScheduler();
      options.onInvalidate?.();
    }
  };

  const telemetry = (): GreaterRealmSceneTelemetry => {
    const plans = [...uploaded.values()].map((row) => row.plan);
    const actors = plans.flatMap((plan) => plan.actors);
    return Object.freeze({
      disposed,
      deviceClass: options.deviceClass,
      graphicsProfile: options.graphicsProfile,
      reducedMotion,
      contextLost,
      selectedChunkCount: selected.size,
      uploadedChunkCount: uploaded.size,
      pendingUploadCount: pending.size,
      drawCallCount: plans.reduce((total, plan) => total + plan.drawCallCount, 0),
      instanceCount: plans.reduce((total, plan) => total + plan.instanceCount, 0),
      accessCellCount: access.size,
      blockedCellCount: plans.reduce((total, plan) => total + plan.blockedCoordinateKeys.length, 0),
      canopyCount: actors.filter((actor) => actor.kind === 'canopy').length,
      grassPatchCount: plans.reduce((total, plan) => total + plan.grassPatchCount, 0),
      grassBladeCount: plans.reduce((total, plan) => total + plan.grassBladeCount, 0),
      grassTriangleCount: plans.reduce((total, plan) => total + plan.grassTriangleCount, 0),
      flowerCount: plans.reduce((total, plan) => total + plan.flowerCount, 0),
      flowerGeometryBytes: plans.reduce((total, plan) => total + plan.flowerGeometryBytes, 0),
      npcCount: actors.filter((actor) => actor.kind === 'npc').length,
      wildlifeCount: actors.filter((actor) => actor.kind === 'wildlife').length,
      boatCount: actors.filter((actor) => actor.kind === 'boat').length,
      resourceCount: plans.reduce((total, plan) => total + plan.resources.length, 0),
      uploadedThisFrame,
      uploadBytesThisFrame,
      maximumUploadsPerFrame: budget.maximumUploadsPerFrame,
      maximumUploadBytesPerFrame: budget.maximumUploadBytesPerFrame,
      skippedByBudgetCount
    });
  };

  const updateVisuals = (elapsedSeconds: number) => {
    if (disposed || contextLost || uploaded.size === 0) return false;
    const active = animationActive();
    const time = active && Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    const touchedMeshes = new Set<THREE.InstancedMesh>();
    for (const resource of uploaded.values()) {
      for (const material of resource.waterMaterials) {
        const phase = Number(material.userData.greaterRealmPhase ?? 0);
        const wave = Math.sin(time * 0.72 + phase * Math.PI * 2);
        material.opacity = 0.7 + wave * 0.035;
        material.color.setHSL(0.535 + wave * 0.008, 0.48, 0.42 + wave * 0.018);
      }
      for (const ref of resource.actors) {
        const actor = ref.actor;
        sampleRealmLivingEnvironment(time, actor.position.x, actor.position.z, livingSample);
        let x = actor.position.x;
        let y = actor.position.y;
        let z = actor.position.z;
        let yaw = actor.headingRadians;
        let sway = 0;
        if (active) {
          const localTime = time + actor.phase * 13.7;
          if (actor.kind === 'canopy' || actor.kind === 'grass' || actor.kind === 'flower') {
            sway = Math.sin(localTime * 1.4) * (0.02 + livingSample.gust * 0.05);
          } else if (actor.kind === 'npc') {
            const step = Math.sin(localTime * 1.15) * 0.045;
            x += Math.sin(yaw) * step;
            z += Math.cos(yaw) * step;
            y += Math.abs(Math.sin(localTime * 2.3)) * 0.012;
          } else if (actor.kind === 'wildlife') {
            yaw += localTime * 0.18;
            x += Math.sin(yaw) * 0.075;
            z += Math.cos(yaw) * 0.075;
          } else {
            const glide = Math.sin(localTime * 0.35) * 0.12;
            x += Math.sin(yaw) * glide;
            z += Math.cos(yaw) * glide;
            y += Math.sin(localTime * 1.1) * 0.012;
          }
        }
        position.set(x, y, z);
        rotation.setFromAxisAngle(up, yaw);
        if (sway !== 0) {
          tilt.setFromAxisAngle(tiltAxis, sway);
          rotation.multiply(tilt);
        }
        scale.set(1, 1, 1);
        matrix.compose(position, rotation, scale);
        ref.mesh.setMatrixAt(ref.index, matrix);
        touchedMeshes.add(ref.mesh);
      }
    }
    touchedMeshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
    });
    return active && (touchedMeshes.size > 0 || [...uploaded.values()].some(
      (resource) => resource.waterMaterials.length > 0
    ));
  };

  return Object.freeze({
    group,
    setView: (input) => {
      if (disposed) return;
      if (typeof input.revision !== 'bigint' || input.revision <= 0n) {
        throw new Error('GREATER_REALM_SCENE_REVISION_INVALID');
      }
      cellSize = Number.isFinite(input.cellSize) && input.cellSize > 0 ? input.cellSize : 1;
      const ordered = [...input.chunks].sort((left, right) => (
        finiteDistance(left.distanceChunks) - finiteDistance(right.distanceChunks)
        || left.chunk.chunkHandle.localeCompare(right.chunk.chunkHandle)
      ));
      if (new Set(ordered.map((row) => row.chunk.chunkHandle)).size !== ordered.length) {
        throw new Error('GREATER_REALM_SCENE_CHUNK_DUPLICATE');
      }
      for (const value of ordered) {
        if (value.chunk.revision !== input.revision) {
          throw new Error('GREATER_REALM_SCENE_CHUNK_REVISION_MISMATCH');
        }
      }

      const buildPlans = (
        values: readonly GreaterRealmSceneViewChunk[],
        filterAprons: boolean
      ) => {
        const selectedCoreKeys = new Set(values.flatMap((value) => (
          value.chunk.coreCells.map(greaterRealmCoordinateKey)
        )));
        if (selectedCoreKeys.size !== values.reduce(
          (total, value) => total + value.chunk.coreCells.length,
          0
        )) throw new Error('GREATER_REALM_SCENE_CORE_CELL_DUPLICATE');
        const claimedAprons = new Set<string>();
        const next = new Map<string, SelectedChunk>();
        let drawCalls = 0;
        let instances = 0;
        let canopy = 0;
        let grassPatches = 0;
        let grassBlades = 0;
        let grassTriangles = 0;
        let flowers = 0;
        let flowerBytes = 0;
        let npc = 0;
        let wildlife = 0;
        let boat = 0;
        let grassLayers = 0;
        let flowerLayers = 0;
        for (const value of values) {
          if (next.size >= budget.maximumVisibleChunks) break;
          const visibleApron = filterAprons
            ? value.chunk.apronCells.filter((cell) => {
              const key = greaterRealmCoordinateKey(cell);
              if (selectedCoreKeys.has(key) || claimedAprons.has(key)) return false;
              return true;
            })
            : value.chunk.apronCells;
          const chunk = visibleApron === value.chunk.apronCells
            ? value.chunk
            : Object.freeze({ ...value.chunk, apronCells: Object.freeze(visibleApron) });
          const plan = createGreaterRealmChunkPresentationPlan({
            chunk,
            graphicsProfile: options.graphicsProfile,
            cellSize,
            actorAllowance: {
              canopy: budget.canopyCount - canopy,
              grassPatches: budget.grassPatchCount - grassPatches,
              grassBlades: budget.grassBladeCount - grassBlades,
              grassTriangles: budget.grassTriangleCount - grassTriangles,
              flowers: budget.flowerCount - flowers,
              flowerGeometryBytes: budget.flowerGeometryBytes - flowerBytes,
              npc: budget.npcCount - npc,
              wildlife: budget.wildlifeCount - wildlife,
              boat: budget.boatCount - boat,
              grassLayer: grassLayers < budget.grassDrawCalls,
              flowerLayer: flowerLayers < budget.flowerDrawCalls
            }
          });
          if (
            drawCalls + plan.drawCallCount > budget.maximumDrawCalls
            || instances + plan.instanceCount > budget.maximumSceneInstances
            || plan.estimatedUploadBytes > budget.maximumUploadBytesPerFrame
          ) continue;
          visibleApron.forEach((cell) => claimedAprons.add(greaterRealmCoordinateKey(cell)));
          const actorCounts = {
            canopy: plan.actors.filter((actor) => actor.kind === 'canopy').length,
            npc: plan.actors.filter((actor) => actor.kind === 'npc').length,
            wildlife: plan.actors.filter((actor) => actor.kind === 'wildlife').length,
            boat: plan.actors.filter((actor) => actor.kind === 'boat').length
          };
          canopy += actorCounts.canopy;
          npc += actorCounts.npc;
          wildlife += actorCounts.wildlife;
          boat += actorCounts.boat;
          grassPatches += plan.grassPatchCount;
          grassBlades += plan.grassBladeCount;
          grassTriangles += plan.grassTriangleCount;
          flowers += plan.flowerCount;
          flowerBytes += plan.flowerGeometryBytes;
          if (plan.grassPatchCount > 0) grassLayers += 1;
          if (plan.flowerCount > 0) flowerLayers += 1;
          drawCalls += plan.drawCallCount;
          instances += plan.instanceCount;
          const signature = planSignature(plan);
          next.set(plan.chunkHandle, Object.freeze({
            signature,
            plan,
            priority: finiteDistance(value.distanceChunks)
          }));
        }
        return next;
      };

      const preliminary = buildPlans(ordered, false);
      const acceptedHandles = new Set(preliminary.keys());
      const accepted = ordered.filter((row) => acceptedHandles.has(row.chunk.chunkHandle));
      const next = buildPlans(accepted, true);
      skippedByBudgetCount = ordered.length - next.size;
      for (const [handle, resource] of uploaded) {
        if (next.get(handle)?.signature !== resource.signature) removeUploaded(handle);
      }
      selected = next;
      access.clear();
      for (const row of selected.values()) {
        for (const cell of row.plan.cellAccess) access.set(cell.coordinateKey, cell);
      }
      queueAllSelected();
      options.onInvalidate?.();
    },
    flushUploads: () => {
      uploadedThisFrame = 0;
      uploadBytesThisFrame = 0;
      if (disposed || contextLost) return 0;
      const rows = [...pending.values()].sort((left, right) => (
        left.priority - right.priority || left.plan.chunkHandle.localeCompare(right.plan.chunkHandle)
      ));
      for (const row of rows) {
        if (uploadedThisFrame >= budget.maximumUploadsPerFrame) break;
        if (uploadBytesThisFrame + row.plan.estimatedUploadBytes > budget.maximumUploadBytesPerFrame) {
          break;
        }
        const current = selected.get(row.plan.chunkHandle);
        if (!current || current.signature !== row.signature) {
          pending.delete(row.plan.chunkHandle);
          continue;
        }
        const resource = buildChunkResource(row, cellSize);
        uploaded.set(row.plan.chunkHandle, resource);
        group.add(resource.group);
        pending.delete(row.plan.chunkHandle);
        uploadedThisFrame += 1;
        uploadBytesThisFrame += row.plan.estimatedUploadBytes;
      }
      if (pending.size > 0) options.onInvalidate?.();
      return uploadedThisFrame;
    },
    update: updateVisuals,
    startAnimation: () => {
      if (disposed) return;
      if (!scheduler) {
        scheduler = createRealmAmbientScheduler({
          frameCap: budget.animationFrameCap,
          active: animationActive(),
          onStep: (elapsedSeconds) => {
            if (updateVisuals(elapsedSeconds)) options.onInvalidate?.();
          }
        });
      }
      syncScheduler();
    },
    stopAnimation: () => {
      scheduler?.dispose();
      scheduler = undefined;
    },
    setReducedMotion: (reduced) => {
      if (disposed || reducedMotion === Boolean(reduced)) return;
      reducedMotion = Boolean(reduced);
      syncScheduler();
      updateVisuals(0);
      options.onInvalidate?.();
    },
    setDocumentVisible: (visible) => {
      if (disposed || documentVisible === Boolean(visible)) return;
      documentVisible = Boolean(visible);
      scheduler?.setVisible(documentVisible);
      syncScheduler();
    },
    bindCanvas,
    getCellAccess: (coordinate) => access.get(greaterRealmCoordinateKey(coordinate)),
    isCoordinatePassable: (coordinate) => (
      access.get(greaterRealmCoordinateKey(coordinate))?.passable === true
    ),
    getTelemetry: telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      scheduler?.dispose();
      scheduler = undefined;
      bindCanvas(null);
      for (const handle of [...uploaded.keys()]) removeUploaded(handle);
      selected.clear();
      pending.clear();
      access.clear();
      group.clear();
    }
  });
}
