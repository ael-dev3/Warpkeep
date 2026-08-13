import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  greaterRealmRegionPresentation,
  type GreaterRealmBoatCellPresentation,
  type GreaterRealmBoatLanePresentation,
  type GreaterRealmCellAccessPresentation,
  type GreaterRealmChunkPresentationPlan,
  type GreaterRealmFeaturePresentation,
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
  ambientBoatCount: number;
  localVesselCount: number;
  boatCount: number;
  resourceCount: number;
  uploadedThisFrame: number;
  uploadBytesThisFrame: number;
  maximumUploadsPerFrame: number;
  maximumUploadBytesPerFrame: number;
  skippedByBudgetCount: number;
}>;

export type GreaterRealmLocalVesselState = Readonly<{
  status: 'unavailable' | 'available' | 'selected' | 'blocked';
  persisted: false;
  message: string;
  cellKey?: string;
  atlasQ?: number;
  atlasR?: number;
}>;

export type GreaterRealmLocalVesselMove = 'forward' | 'backward';

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
  selectLocalVessel: () => GreaterRealmLocalVesselState;
  moveLocalVessel: (move: GreaterRealmLocalVesselMove) => GreaterRealmLocalVesselState;
  releaseLocalVessel: () => GreaterRealmLocalVesselState;
  getLocalVesselState: () => GreaterRealmLocalVesselState;
  getTelemetry: () => GreaterRealmSceneTelemetry;
  dispose: () => void;
}>;

export type CreateGreaterRealmSceneRuntimeOptions = Readonly<{
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  reducedMotion?: boolean;
  localVesselOrigin?: GreaterRealmAtlasCoordinate;
  onInvalidate?: () => void;
  /** Host-owned layers reserve from the reviewed total scene ceilings. */
  reservedDrawCalls?: number;
  reservedSceneInstances?: number;
  reservedUploadBytesPerFrame?: number;
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

type LocalVesselResource = Readonly<{
  mesh: THREE.Mesh;
  geometry: THREE.BoxGeometry;
  material: THREE.MeshStandardMaterial;
}>;

type AmbientBoatRoute = Readonly<{
  id: string;
  from: GreaterRealmBoatCellPresentation;
  to: GreaterRealmBoatCellPresentation;
  headingRadians: number;
  selectionRank: number;
  phase: number;
  speed: number;
}>;

type AmbientBoatResource = Readonly<{
  signature: string;
  mesh: THREE.InstancedMesh;
  geometry: THREE.BoxGeometry;
  material: THREE.MeshStandardMaterial;
  routes: readonly AmbientBoatRoute[];
}>;

type SelectedChunk = Readonly<{
  signature: string;
  plan: GreaterRealmChunkPresentationPlan;
  priority: number;
}>;

function finiteDistance(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : Number.MAX_SAFE_INTEGER;
}

const GREATER_REALM_BOAT_GEOMETRY_UPLOAD_BYTES = 840;
const GREATER_REALM_INSTANCE_MATRIX_UPLOAD_BYTES = 64;
const GREATER_REALM_LOCAL_VESSEL_UPLOAD_BYTES = GREATER_REALM_BOAT_GEOMETRY_UPLOAD_BYTES;

function stableLaneUnit(domain: 'phase' | 'selection' | 'speed', value: string) {
  let hash = 0x811c9dc5;
  const input = `${domain}\0${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * Select a deterministic, profile-bounded set of scenic river crossings.
 * Both endpoints must be explicit returned deep-water cells. No missing cell,
 * inferred topology, or server-side movement authority is manufactured here.
 */
function ambientBoatRoutes(
  lanes: readonly GreaterRealmBoatLanePresentation[],
  cells: ReadonlyMap<string, GreaterRealmBoatCellPresentation>,
  maximumBoats: number
): readonly AmbientBoatRoute[] {
  const maximum = Number.isSafeInteger(maximumBoats)
    ? Math.max(0, maximumBoats)
    : 0;
  const seen = new Set<string>();
  const routes: AmbientBoatRoute[] = [];
  for (const lane of lanes) {
    const id = `${lane.fromCoordinateKey}>${lane.toCoordinateKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const from = cells.get(lane.fromCoordinateKey);
    const to = cells.get(lane.toCoordinateKey);
    if (
      from === undefined
      || to === undefined
      || from.coordinateKey === to.coordinateKey
      || from.hydroBodyId === undefined
      || to.hydroBodyId === undefined
      || from.hydroBodyId !== to.hydroBodyId
    ) continue;
    routes.push(Object.freeze({
      id,
      from,
      to,
      headingRadians: Math.atan2(
        to.position.x - from.position.x,
        to.position.z - from.position.z
      ),
      selectionRank: stableLaneUnit('selection', id),
      phase: stableLaneUnit('phase', id),
      speed: 0.018 + stableLaneUnit('speed', id) * 0.006
    }));
  }
  routes.sort((left, right) => (
    left.selectionRank - right.selectionRank || left.id.localeCompare(right.id)
  ));
  return Object.freeze(routes.slice(0, maximum));
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

function terrainColor(cell: GreaterRealmPublicCellDto) {
  const color = biomeColor(cell.biomeClass);
  color.lerp(new THREE.Color(greaterRealmRegionPresentation(cell.regionId).color), 0.34);
  if (cell.coastDistance === 0) color.lerp(new THREE.Color('#b8c6ad'), 0.42);
  else if (cell.coastDistance <= 2) color.lerp(new THREE.Color('#97ad91'), 0.22);
  if (cell.wetness >= 8_000) color.lerp(new THREE.Color('#517c70'), 0.18);
  return color;
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
    const color = terrainColor(cell);
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

function featureGeometry(kind: GreaterRealmFeaturePresentation['kind']) {
  if (kind === 'waystone') return new THREE.ConeGeometry(0.09, 0.34, 5);
  if (kind === 'lamp-post') {
    const post = new THREE.CylinderGeometry(0.025, 0.04, 0.42, 6).toNonIndexed();
    const lamp = new THREE.OctahedronGeometry(0.07, 0).translate(0, 0.22, 0);
    const merged = mergeGeometries([post, lamp], false);
    post.dispose();
    lamp.dispose();
    if (merged === null) throw new Error('GREATER_REALM_LAMP_GEOMETRY_INVALID');
    return merged;
  }
  if (kind === 'ruin') return new THREE.BoxGeometry(0.24, 0.2, 0.12);
  const post = new THREE.BoxGeometry(0.055, 0.38, 0.055).toNonIndexed();
  const board = new THREE.BoxGeometry(0.28, 0.12, 0.06)
    .translate(0, 0.11, 0)
    .toNonIndexed();
  const merged = mergeGeometries([post, board], false);
  post.dispose();
  board.dispose();
  if (merged === null) throw new Error('GREATER_REALM_SIGNPOST_GEOMETRY_INVALID');
  return merged;
}

function featureColor(kind: GreaterRealmFeaturePresentation['kind']) {
  if (kind === 'waystone') return '#91a5a3';
  if (kind === 'lamp-post') return '#d7b85e';
  if (kind === 'ruin') return '#746d64';
  return '#aa8253';
}

function featureMeshes(plan: GreaterRealmChunkPresentationPlan) {
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of ['signpost', 'waystone', 'lamp-post', 'ruin'] as const) {
    const features = plan.features.filter((feature) => feature.kind === kind);
    if (features.length === 0) continue;
    const geometry = featureGeometry(kind);
    const material = new THREE.MeshStandardMaterial({
      color: featureColor(kind),
      emissive: kind === 'lamp-post' ? '#5f4217' : '#000000',
      emissiveIntensity: kind === 'lamp-post' ? 0.9 : 0,
      roughness: kind === 'lamp-post' ? 0.55 : 0.9,
      fog: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, features.length);
    features.forEach((feature, index) => {
      position.set(feature.position.x, feature.position.y, feature.position.z);
      quaternion.setFromAxisAngle(up, feature.headingRadians);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = `greater-realm-feature-${kind}:${plan.chunkHandle}`;
    mesh.raycast = () => {};
    meshes.push(mesh);
  }
  return Object.freeze(meshes);
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
  const colors: number[] = [];
  const addFencePanel = (
    edge: GreaterRealmChunkPresentationPlan['sealedEdges'][number],
    start: number,
    end: number,
    bottom: number,
    top: number
  ) => {
    const fromX = edge.from.x + (edge.to.x - edge.from.x) * start;
    const fromZ = edge.from.z + (edge.to.z - edge.from.z) * start;
    const toX = edge.from.x + (edge.to.x - edge.from.x) * end;
    const toZ = edge.from.z + (edge.to.z - edge.from.z) * end;
    const baseY = (edge.from.y + edge.to.y) / 2;
    positions.push(
      fromX, baseY + bottom, fromZ,
      toX, baseY + bottom, toZ,
      toX, baseY + top, toZ,
      fromX, baseY + bottom, fromZ,
      toX, baseY + top, toZ,
      fromX, baseY + top, fromZ
    );
    const color = new THREE.Color(edge.kind === 'shoreline' ? '#6fb3bd' : '#b49357');
    for (let vertex = 0; vertex < 6; vertex += 1) {
      colors.push(color.r, color.g, color.b);
    }
  };
  for (const edge of plan.sealedEdges) {
    addFencePanel(edge, 0, 1, 0.12, 0.18);
    addFencePanel(edge, 0, 1, 0.36, 0.43);
    addFencePanel(edge, 0, 0.07, 0.02, 0.5);
    addFencePanel(edge, 0.93, 1, 0.02, 0.5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: '#18242c',
    emissiveIntensity: 0.32,
    roughness: 0.78,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `greater-realm-shoreline-fence:${plan.chunkHandle}`;
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
  featureMeshes(selected.plan).forEach((mesh) => group.add(mesh));
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
    plan.actors.map((actor) => actor.id).join(','),
    plan.features.map((feature) => feature.id).join(','),
    plan.boatLanes.map((lane) => `${lane.fromCoordinateKey}>${lane.toCoordinateKey}`).join(',')
  ].join('|');
}

export function createGreaterRealmSceneRuntime(
  options: CreateGreaterRealmSceneRuntimeOptions
): GreaterRealmSceneRuntime {
  const budget = GREATER_REALM_GRAPHICS_BUDGETS[options.graphicsProfile];
  const reservedDrawCalls = Number.isSafeInteger(options.reservedDrawCalls)
    ? Math.min(budget.maximumDrawCalls, Math.max(0, options.reservedDrawCalls!))
    : 0;
  const reservedSceneInstances = Number.isSafeInteger(options.reservedSceneInstances)
    ? Math.min(budget.maximumSceneInstances, Math.max(0, options.reservedSceneInstances!))
    : 0;
  const reservedUploadBytesPerFrame = Number.isSafeInteger(
    options.reservedUploadBytesPerFrame
  )
    ? Math.min(
        budget.maximumUploadBytesPerFrame,
        Math.max(0, options.reservedUploadBytesPerFrame!)
      )
    : 0;
  // One reviewed boat slot remains available for the explicit local helm.
  // Ambient traffic can never make the total exceed the profile boat ceiling.
  const ambientBoatCapacity = Math.max(0, budget.boatCount - 1);
  // Reserve one draw for the bounded ambient river fleet and one for the
  // opt-in local helm. The reservations remain fixed even when either layer
  // is absent, so a later view/selection cannot push the total over budget.
  const maximumRuntimeDrawCalls = Math.max(
    0,
    budget.maximumDrawCalls - reservedDrawCalls - 2
  );
  const maximumRuntimeSceneInstances = Math.max(
    0,
    budget.maximumSceneInstances - reservedSceneInstances - budget.boatCount
  );
  const maximumAmbientBoatUploadBytes = GREATER_REALM_BOAT_GEOMETRY_UPLOAD_BYTES
    + ambientBoatCapacity * GREATER_REALM_INSTANCE_MATRIX_UPLOAD_BYTES;
  const maximumRuntimeUploadBytesPerFrame = Math.max(
    0,
    budget.maximumUploadBytesPerFrame
      - reservedUploadBytesPerFrame
      - maximumAmbientBoatUploadBytes
      - GREATER_REALM_LOCAL_VESSEL_UPLOAD_BYTES
  );
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
  let boatCells = new Map<string, GreaterRealmBoatCellPresentation>();
  let boatLanes: readonly GreaterRealmBoatLanePresentation[] = Object.freeze([]);
  let localVesselCellKey: string | undefined;
  let localVesselBlocked = false;
  let localVesselMessage = 'No returned deep-water lane is available in this view.';
  let localVesselResource: LocalVesselResource | undefined;
  let ambientBoatResource: AmbientBoatResource | undefined;
  let pendingAmbientBoatUploadBytes = 0;
  let pendingLocalVesselUploadBytes = 0;
  let viewRevision: bigint | undefined;
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

  const localVesselStarts = () => boatLanes.filter((lane) => (
    boatCells.has(lane.fromCoordinateKey)
  ));
  const disposeAmbientBoatResource = () => {
    const resource = ambientBoatResource;
    if (resource === undefined) return;
    ambientBoatResource = undefined;
    pendingAmbientBoatUploadBytes = 0;
    group.remove(resource.mesh);
    resource.mesh.dispose();
    resource.geometry.dispose();
    resource.material.dispose();
  };
  const updateAmbientBoatMatrices = (elapsedSeconds: number, active: boolean) => {
    const resource = ambientBoatResource;
    if (resource === undefined) return false;
    const time = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    resource.routes.forEach((route, index) => {
      // A complete out-and-back takes 42–56 seconds. The cosine eases each
      // turn at a returned endpoint so the presentation never overshoots a
      // lane or snaps across an unreturned cell.
      const cycle = active
        ? (route.phase + time * route.speed) % 1
        : route.phase;
      const angle = cycle * Math.PI * 2;
      const progress = 0.5 - Math.cos(angle) * 0.5;
      position.set(
        THREE.MathUtils.lerp(route.from.position.x, route.to.position.x, progress),
        THREE.MathUtils.lerp(route.from.position.y, route.to.position.y, progress)
          + (active ? Math.sin(time * 0.55 + route.phase * 17) * 0.008 : 0),
        THREE.MathUtils.lerp(route.from.position.z, route.to.position.z, progress)
      );
      const movingForward = Math.sin(angle) >= 0;
      rotation.setFromAxisAngle(
        up,
        route.headingRadians + (movingForward ? 0 : Math.PI)
      );
      scale.set(1, 1, 1);
      matrix.compose(position, rotation, scale);
      resource.mesh.setMatrixAt(index, matrix);
    });
    resource.mesh.instanceMatrix.needsUpdate = true;
    return active && resource.routes.length > 0;
  };
  const syncAmbientBoats = () => {
    const routes = ambientBoatRoutes(boatLanes, boatCells, ambientBoatCapacity);
    const signature = [
      viewRevision,
      cellSize,
      ...routes.map((route) => route.id)
    ].join('|');
    if (
      routes.length === 0
      || contextLost
      || disposed
    ) {
      disposeAmbientBoatResource();
      return;
    }
    if (ambientBoatResource?.signature === signature) return;
    disposeAmbientBoatResource();
    // Heading yaw is measured from +Z throughout the realm presentation.
    // Keep the hull's long axis on Z so boats face along their river lane.
    const geometry = new THREE.BoxGeometry(0.11, 0.065, 0.24);
    const material = new THREE.MeshStandardMaterial({
      color: '#9b6a3e',
      emissive: '#352113',
      emissiveIntensity: 0.16,
      roughness: 0.76,
      fog: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, routes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'greater-realm-ambient-river-boats';
    mesh.userData.greaterRealmPresentationOnly = true;
    mesh.userData.greaterRealmReturnedLaneCount = routes.length;
    // At most 24 tiny instances are drawn, and their full returned paths are
    // more useful than a stale instance bound when a boat changes direction.
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    ambientBoatResource = Object.freeze({
      signature,
      mesh,
      geometry,
      material,
      routes
    });
    group.add(mesh);
    pendingAmbientBoatUploadBytes = GREATER_REALM_BOAT_GEOMETRY_UPLOAD_BYTES
      + routes.length * GREATER_REALM_INSTANCE_MATRIX_UPLOAD_BYTES;
    updateAmbientBoatMatrices(0, false);
  };
  const disposeLocalVesselResource = () => {
    const resource = localVesselResource;
    if (resource === undefined) return;
    localVesselResource = undefined;
    group.remove(resource.mesh);
    resource.geometry.dispose();
    resource.material.dispose();
  };
  const localVesselState = (): GreaterRealmLocalVesselState => {
    const cell = localVesselCellKey === undefined
      ? undefined
      : boatCells.get(localVesselCellKey);
    if (cell !== undefined) return Object.freeze({
      status: localVesselBlocked ? 'blocked' : 'selected',
      persisted: false,
      message: localVesselMessage,
      cellKey: cell.cellKey,
      atlasQ: cell.atlasQ,
      atlasR: cell.atlasR
    });
    if (localVesselStarts().length > 0) return Object.freeze({
      status: 'available',
      persisted: false,
      message: 'A local vessel is available. Take the helm to begin a presentation-only preview.'
    });
    return Object.freeze({
      status: 'unavailable',
      persisted: false,
      message: 'No returned deep-water lane is available in this view.'
    });
  };
  const syncLocalVesselMesh = () => {
    const cell = localVesselCellKey === undefined
      ? undefined
      : boatCells.get(localVesselCellKey);
    if (cell === undefined || contextLost || disposed) {
      disposeLocalVesselResource();
      return;
    }
    if (localVesselResource === undefined) {
      const geometry = new THREE.BoxGeometry(0.34, 0.09, 0.14);
      const material = new THREE.MeshStandardMaterial({
        color: '#c08a4e',
        emissive: '#422815',
        emissiveIntensity: 0.2,
        roughness: 0.72,
        fog: true
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'greater-realm-local-player-vessel';
      mesh.userData.greaterRealmPresentationOnly = true;
      mesh.raycast = () => {};
      localVesselResource = Object.freeze({ mesh, geometry, material });
      group.add(mesh);
      pendingLocalVesselUploadBytes = GREATER_REALM_LOCAL_VESSEL_UPLOAD_BYTES;
    }
    const lane = boatLanes.find((entry) => entry.fromCoordinateKey === cell.coordinateKey)
      ?? boatLanes.find((entry) => entry.toCoordinateKey === cell.coordinateKey);
    localVesselResource.mesh.position.set(
      cell.position.x,
      cell.position.y,
      cell.position.z
    );
    localVesselResource.mesh.rotation.set(0, lane?.headingRadians ?? 0, 0);
    localVesselResource.mesh.updateMatrix();
  };
  const releaseLocalVessel = () => {
    localVesselCellKey = undefined;
    localVesselBlocked = false;
    localVesselMessage = 'Local helm released. No movement was sent to the server.';
    pendingLocalVesselUploadBytes = 0;
    disposeLocalVesselResource();
    options.onInvalidate?.();
    return localVesselState();
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (disposed || contextLost) return;
    contextLost = true;
    for (const handle of [...uploaded.keys()]) removeUploaded(handle);
    disposeAmbientBoatResource();
    disposeLocalVesselResource();
    pendingAmbientBoatUploadBytes = 0;
    pendingLocalVesselUploadBytes = 0;
    queueAllSelected();
    syncScheduler();
    options.onInvalidate?.();
  };
  const handleContextRestored = () => {
    if (disposed || !contextLost) return;
    contextLost = false;
    queueAllSelected();
    syncAmbientBoats();
    syncLocalVesselMesh();
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
      syncAmbientBoats();
      syncLocalVesselMesh();
      syncScheduler();
      options.onInvalidate?.();
    }
  };

  const telemetry = (): GreaterRealmSceneTelemetry => {
    const plans = [...uploaded.values()].map((row) => row.plan);
    const actors = plans.flatMap((plan) => plan.actors);
    const ambientBoatCount = ambientBoatResource?.routes.length ?? 0;
    const localVesselCount = Number(localVesselResource !== undefined);
    return Object.freeze({
      disposed,
      deviceClass: options.deviceClass,
      graphicsProfile: options.graphicsProfile,
      reducedMotion,
      contextLost,
      selectedChunkCount: selected.size,
      uploadedChunkCount: uploaded.size,
      pendingUploadCount: pending.size,
      drawCallCount: plans.reduce((total, plan) => total + plan.drawCallCount, 0)
        + Number(ambientBoatCount > 0)
        + localVesselCount,
      instanceCount: plans.reduce((total, plan) => total + plan.instanceCount, 0)
        + ambientBoatCount
        + localVesselCount,
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
      ambientBoatCount,
      localVesselCount,
      boatCount: ambientBoatCount + localVesselCount,
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
    const ambientBoatsMoved = updateAmbientBoatMatrices(time, active);
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
    return active && (
      ambientBoatsMoved
      || touchedMeshes.size > 0
      || [...uploaded.values()].some((resource) => resource.waterMaterials.length > 0)
    );
  };

  return Object.freeze({
    group,
    setView: (input) => {
      if (disposed) return;
      if (typeof input.revision !== 'bigint' || input.revision <= 0n) {
        throw new Error('GREATER_REALM_SCENE_REVISION_INVALID');
      }
      const revisionChanged = viewRevision !== undefined
        && viewRevision !== input.revision;
      viewRevision = input.revision;
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
            drawCalls + plan.drawCallCount > maximumRuntimeDrawCalls
            || instances + plan.instanceCount > maximumRuntimeSceneInstances
            || plan.estimatedUploadBytes > maximumRuntimeUploadBytesPerFrame
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
      boatCells = new Map();
      boatLanes = Object.freeze([...selected.values()].flatMap((row) => {
        for (const cell of row.plan.boatCells) {
          if (!boatCells.has(cell.coordinateKey)) boatCells.set(cell.coordinateKey, cell);
        }
        return row.plan.boatLanes;
      }));
      syncAmbientBoats();
      if (
        revisionChanged
        || (localVesselCellKey !== undefined && !boatCells.has(localVesselCellKey))
      ) {
        localVesselCellKey = undefined;
        localVesselBlocked = false;
        localVesselMessage = revisionChanged
          ? 'The atlas revision changed; the local helm preview was cleared.'
          : 'The local vessel left the returned view; the helm preview was cleared.';
        pendingLocalVesselUploadBytes = 0;
        disposeLocalVesselResource();
      } else {
        syncLocalVesselMesh();
      }
      queueAllSelected();
      options.onInvalidate?.();
    },
    flushUploads: () => {
      uploadedThisFrame = 0;
      uploadBytesThisFrame = pendingAmbientBoatUploadBytes
        + pendingLocalVesselUploadBytes;
      pendingAmbientBoatUploadBytes = 0;
      pendingLocalVesselUploadBytes = 0;
      if (disposed || contextLost) return 0;
      let chunkUploadBytesThisFrame = 0;
      const rows = [...pending.values()].sort((left, right) => (
        left.priority - right.priority || left.plan.chunkHandle.localeCompare(right.plan.chunkHandle)
      ));
      for (const row of rows) {
        if (uploadedThisFrame >= budget.maximumUploadsPerFrame) break;
        if (
          chunkUploadBytesThisFrame + row.plan.estimatedUploadBytes
            > maximumRuntimeUploadBytesPerFrame
        ) {
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
        chunkUploadBytesThisFrame += row.plan.estimatedUploadBytes;
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
    selectLocalVessel: () => {
      if (disposed || localVesselCellKey !== undefined) return localVesselState();
      const origin = options.localVesselOrigin;
      const starts = localVesselStarts().sort((left, right) => {
        if (origin === undefined) {
          return left.fromCoordinateKey.localeCompare(right.fromCoordinateKey);
        }
        const leftCell = boatCells.get(left.fromCoordinateKey)!;
        const rightCell = boatCells.get(right.fromCoordinateKey)!;
        const leftDistance = Math.abs(leftCell.atlasQ - origin.atlasQ)
          + Math.abs(leftCell.atlasR - origin.atlasR);
        const rightDistance = Math.abs(rightCell.atlasQ - origin.atlasQ)
          + Math.abs(rightCell.atlasR - origin.atlasR);
        return leftDistance - rightDistance
          || left.fromCoordinateKey.localeCompare(right.fromCoordinateKey);
      });
      const start = starts[0];
      if (start === undefined) return localVesselState();
      localVesselCellKey = start.fromCoordinateKey;
      localVesselBlocked = false;
      localVesselMessage = 'Local helm engaged. This vessel preview is not saved to the server.';
      syncLocalVesselMesh();
      options.onInvalidate?.();
      return localVesselState();
    },
    moveLocalVessel: (move) => {
      if (disposed || localVesselCellKey === undefined) return localVesselState();
      const currentKey = localVesselCellKey;
      const candidates = boatLanes.filter((lane) => (
        move === 'forward'
          ? lane.fromCoordinateKey === currentKey
          : lane.toCoordinateKey === currentKey
      )).sort((left, right) => (
        left.fromCoordinateKey.localeCompare(right.fromCoordinateKey)
        || left.toCoordinateKey.localeCompare(right.toCoordinateKey)
      ));
      const lane = candidates.find((candidate) => {
        const from = boatCells.get(candidate.fromCoordinateKey);
        const to = boatCells.get(candidate.toCoordinateKey);
        return from !== undefined
          && to !== undefined
          && (
            from.hydroBodyId === undefined
            || to.hydroBodyId === undefined
            || from.hydroBodyId === to.hydroBodyId
          );
      });
      if (lane === undefined) {
        localVesselBlocked = true;
        localVesselMessage = move === 'forward'
          ? 'Blocked: the next public deep-water lane cell is not returned in this view.'
          : 'Blocked: no returned public deep-water lane leads back from this cell.';
        options.onInvalidate?.();
        return localVesselState();
      }
      localVesselCellKey = move === 'forward'
        ? lane.toCoordinateKey
        : lane.fromCoordinateKey;
      localVesselBlocked = false;
      localVesselMessage = 'Local vessel preview moved on returned public water data; no server state changed.';
      syncLocalVesselMesh();
      options.onInvalidate?.();
      return localVesselState();
    },
    releaseLocalVessel,
    getLocalVesselState: localVesselState,
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
      boatCells.clear();
      boatLanes = Object.freeze([]);
      pendingAmbientBoatUploadBytes = 0;
      pendingLocalVesselUploadBytes = 0;
      disposeAmbientBoatResource();
      disposeLocalVesselResource();
      group.clear();
    }
  });
}
