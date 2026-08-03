import * as THREE from 'three';

import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import {
  innerKeepPresentationIntegrity,
  type InnerKeepBuildingPresentation,
  type InnerKeepBuildingKind,
  type InnerKeepPresentation
} from './innerKeepPresentation';
import {
  INNER_KEEP_LAYOUT_V1_SLOTS
} from './innerKeepLayoutV1';

export type InnerKeepSceneQuality = 'high' | 'balanced' | 'reduced';

export type InnerKeepSceneVisualContext = Readonly<{
  owningTerrainKind: RealmTerrainKind;
}>;

export type InnerKeepSceneTelemetry = Readonly<{
  status: 'empty' | 'ready' | 'unavailable';
  triangleCount: number;
  drawCalls: number;
  smokeSpriteCount: number;
  slotCount: number;
  completedBuildingCount: number;
  constructionSiteCount: number;
  completionRevealActive: boolean;
}>;

export type InnerKeepSlotProjection = Readonly<{
  slotId: string;
  /** Client-space center of the exact rendered pad bounds. */
  x: number;
  y: number;
  /** Client-space bounds of the exact rendered pad, before the CSS tap floor. */
  width: number;
  height: number;
  visible: boolean;
}>;

export type InnerKeepSlotProjectionFrame = Readonly<{
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  slots: readonly InnerKeepSlotProjection[];
}>;

export type InnerKeepSceneLayer = Readonly<{
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  dispose: () => void;
  getAnimationFrameCap: () => number;
  getSlotProjectionFrame: () => InnerKeepSlotProjectionFrame;
  getTelemetry: () => InnerKeepSceneTelemetry;
  isAnimationActive: () => boolean;
  panByPixels: (deltaX: number, deltaY: number) => void;
  pickSlot: (clientX: number, clientY: number) => string | null;
  reconcile: (
    presentation: InnerKeepPresentation | null,
    context?: InnerKeepSceneVisualContext
  ) => void;
  setSelectedSlot: (slotId: string | null) => void;
  setViewport: (width: number, height: number) => void;
  update: (elapsedSeconds: number) => boolean;
  zoomByWheel: (deltaY: number, deltaMode: number) => void;
}>;

export type CreateInnerKeepSceneLayerOptions = Readonly<{
  canvas: HTMLCanvasElement;
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  requestRender: () => void;
}>;

const SLOT_POSITIONS = new Map(INNER_KEEP_LAYOUT_V1_SLOTS.map((slot) => [
  slot.slotId,
  Object.freeze({
    x: Number(slot.localXMicrounits) / 1_000_000,
    z: Number(slot.localZMicrounits) / 1_000_000,
    rotation: slot.rotationMilliDegrees * Math.PI / 180_000,
    active: slot.active
  })
] as const));
type InnerKeepSlotPosition = NonNullable<ReturnType<typeof SLOT_POSITIONS.get>>;

const SMOKE_SPRITE_BUDGET: Readonly<Record<InnerKeepSceneQuality, number>> =
  Object.freeze({ high: 160, balanced: 96, reduced: 48 });
const SMOKE_FRAME_CAP: Readonly<Record<InnerKeepSceneQuality, number>> =
  Object.freeze({ high: 30, balanced: 24, reduced: 18 });

function deterministicUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function deterministicVisualSeed(
  presentation: InnerKeepPresentation,
  context: InnerKeepSceneVisualContext | undefined
) {
  const source = `${presentation.castleId}:${presentation.layoutVersion}:`
    + `${context?.owningTerrainKind ?? 'unknown'}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function setShadow(mesh: THREE.Mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function createSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const gradient = context.createRadialGradient(29, 27, 3, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(235, 226, 205, 0.92)');
  gradient.addColorStop(0.35, 'rgba(164, 154, 136, 0.72)');
  gradient.addColorStop(0.7, 'rgba(91, 83, 74, 0.36)');
  gradient.addColorStop(1, 'rgba(63, 55, 49, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildingPalette(kind: InnerKeepBuildingKind) {
  if (kind === 'city-mill') return { wall: 0xc7b58d, roof: 0x71513a, accent: 0xe4d5a4 };
  if (kind === 'lumber-camp') return { wall: 0x8a633d, roof: 0x4f382b, accent: 0xc5924e };
  if (kind === 'city-stoneworks') return { wall: 0xa7a39a, roof: 0x5c5a5d, accent: 0xd9d2bf };
  return { wall: 0x796a59, roof: 0x46382f, accent: 0xd39a3d };
}

function createBuilding(
  kind: InnerKeepBuildingKind,
  completedLevel: number,
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const palette = buildingPalette(kind);
  const group = new THREE.Group();
  group.name = `inner-keep-completed-building:${kind}`;
  const material = new THREE.MeshStandardMaterial({
    color: palette.wall,
    roughness: 0.82,
    metalness: kind === 'city-goldworks' ? 0.16 : 0.03
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.78
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: palette.accent,
    roughness: 0.68,
    metalness: kind === 'city-goldworks' ? 0.28 : 0.05
  });
  const dressingGreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f5d35,
    roughness: 0.94
  });
  disposableMaterials.add(material);
  disposableMaterials.add(roofMaterial);
  disposableMaterials.add(accentMaterial);
  disposableMaterials.add(dressingGreenMaterial);
  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    selectedMaterial: THREE.Material = material
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, selectedMaterial));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  addBox(2.55, 0.42, 2.1, 0, 0.28, 0, accentMaterial);

  if (kind === 'city-mill') {
    addBox(1.75, 1.75, 1.55, -0.18, 1.32, 0);
    const roofGeometry = new THREE.ConeGeometry(1.28, 0.92, 4);
    disposableGeometries.add(roofGeometry);
    const roof = setShadow(new THREE.Mesh(roofGeometry, roofMaterial));
    roof.position.set(-0.18, 2.55, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const hubGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.46, 10);
    disposableGeometries.add(hubGeometry);
    const hub = setShadow(new THREE.Mesh(hubGeometry, accentMaterial));
    hub.position.set(-0.18, 1.65, -1.02);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    for (let index = 0; index < 4; index += 1) {
      const blade = addBox(0.2, 1.25, 0.08, -0.18, 1.65, -1.28, accentMaterial);
      blade.rotation.z = index * Math.PI / 2;
    }
  } else if (kind === 'lumber-camp') {
    addBox(2.1, 1.35, 1.65, -0.1, 1.08, 0);
    const roofGeometry = new THREE.ConeGeometry(1.55, 0.82, 4);
    disposableGeometries.add(roofGeometry);
    const roof = setShadow(new THREE.Mesh(roofGeometry, roofMaterial));
    roof.position.set(-0.1, 2.08, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    for (let index = 0; index < 5; index += 1) {
      const logGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
      disposableGeometries.add(logGeometry);
      const log = setShadow(new THREE.Mesh(logGeometry, accentMaterial));
      log.rotation.z = Math.PI / 2;
      log.position.set(0.42, 0.58 + index * 0.16, 1.02);
      group.add(log);
    }
  } else if (kind === 'city-stoneworks') {
    addBox(1.9, 1.45, 1.7, -0.28, 1.12, 0);
    addBox(0.65, 2.2, 0.65, 0.72, 1.5, 0.35, roofMaterial);
    for (let index = 0; index < 5; index += 1) {
      addBox(
        0.58,
        0.42 + (index % 2) * 0.16,
        0.5,
        -1.05 + (index % 3) * 0.72,
        0.62,
        1.05 + Math.floor(index / 3) * 0.48,
        accentMaterial
      );
    }
  } else {
    addBox(2.0, 1.45, 1.7, -0.18, 1.1, 0);
    addBox(0.58, 2.45, 0.58, 0.72, 1.56, 0.3, roofMaterial);
    const capGeometry = new THREE.ConeGeometry(0.5, 0.72, 6);
    disposableGeometries.add(capGeometry);
    const cap = setShadow(new THREE.Mesh(capGeometry, accentMaterial));
    cap.position.set(0.72, 3.12, 0.3);
    group.add(cap);
  }

  if (completedLevel >= 2) {
    addBox(0.48, 0.46, 0.48, -0.88, 0.56, 1.05, accentMaterial);
    addBox(0.42, 0.34, 0.42, -0.38, 0.5, 1.16, roofMaterial);
    addBox(1.7, 0.12, 0.12, 0.52, 0.72, -1.0, roofMaterial);
  }
  if (completedLevel >= 3) {
    addBox(2.3, 0.12, 0.72, 0, 0.18, 1.42, accentMaterial);
    addBox(1.15, 0.14, 0.38, 0.78, 0.48, 1.12, roofMaterial);
  }
  if (completedLevel >= 4) {
    addBox(0.1, 1.55, 0.1, -1.02, 1.1, -0.72, roofMaterial);
    const dressingBannerGeometry = new THREE.PlaneGeometry(0.56, 0.78);
    disposableGeometries.add(dressingBannerGeometry);
    const dressingBanner = new THREE.Mesh(dressingBannerGeometry, accentMaterial);
    dressingBanner.position.set(-1.02, 1.52, -0.78);
    group.add(dressingBanner);
  }
  if (completedLevel >= 5) {
    for (const x of [-1.05, 1.05]) {
      const topiaryGeometry = new THREE.ConeGeometry(0.38, 1.25, 8);
      disposableGeometries.add(topiaryGeometry);
      const topiary = setShadow(new THREE.Mesh(
        topiaryGeometry,
        dressingGreenMaterial
      ));
      topiary.position.set(x, 0.86, 1.18);
      group.add(topiary);
    }
  }

  for (let level = 2; level <= Math.min(5, completedLevel); level += 1) {
    const marker = addBox(
      0.16,
      0.75 + level * 0.06,
      0.16,
      -1.12 + (level - 2) * 0.72,
      0.75,
      -0.95,
      accentMaterial
    );
    marker.rotation.z = level % 2 === 0 ? 0.08 : -0.08;
  }
  return group;
}

function createScaffold(
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-construction-scaffold';
  const timber = new THREE.MeshStandardMaterial({ color: 0x76502d, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x817c70, roughness: 0.96 });
  disposableMaterials.add(timber);
  disposableMaterials.add(stone);
  const foundationGeometry = new THREE.BoxGeometry(2.75, 0.34, 2.25);
  disposableGeometries.add(foundationGeometry);
  const foundation = setShadow(new THREE.Mesh(foundationGeometry, stone));
  foundation.position.y = 0.25;
  group.add(foundation);
  const postGeometry = new THREE.BoxGeometry(0.13, 2.25, 0.13);
  const beamGeometry = new THREE.BoxGeometry(2.35, 0.13, 0.13);
  disposableGeometries.add(postGeometry);
  disposableGeometries.add(beamGeometry);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-0.78, 0.78]) {
      const post = setShadow(new THREE.Mesh(postGeometry, timber));
      post.position.set(x, 1.45, z);
      group.add(post);
    }
  }
  for (const y of [0.85, 2.18]) {
    for (const z of [-0.78, 0.78]) {
      const beam = setShadow(new THREE.Mesh(beamGeometry, timber));
      beam.position.set(0, y, z);
      group.add(beam);
    }
    for (const x of [-1.05, 1.05]) {
      const beam = setShadow(new THREE.Mesh(beamGeometry, timber));
      beam.position.set(x, y, 0);
      beam.rotation.y = Math.PI / 2;
      group.add(beam);
    }
  }
  return group;
}

function setGroupOpacity(group: THREE.Object3D, opacity: number) {
  const bounded = Math.max(0, Math.min(1, opacity));
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.transparent = bounded < 1;
      material.opacity = bounded;
      material.depthWrite = bounded >= 0.98;
      material.needsUpdate = true;
    }
  });
}

function createDeterministicYardDressing(
  seed: number,
  terrainKind: RealmTerrainKind | undefined,
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const group = new THREE.Group();
  const terrainGreen = terrainKind === 'forest'
    ? 0x29472b
    : terrainKind === 'heath'
      ? 0x4c5130
      : terrainKind === 'ridge' || terrainKind === 'ancient-stone'
        ? 0x43523a
        : 0x3b5c32;
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: terrainGreen,
    roughness: 0.97
  });
  const rubbleMaterial = new THREE.MeshStandardMaterial({
    color: terrainKind === 'ancient-stone' ? 0x77736b : 0x69665e,
    roughness: 0.98
  });
  disposableMaterials.add(shrubMaterial);
  disposableMaterials.add(rubbleMaterial);
  const shrubGeometry = new THREE.ConeGeometry(0.46, 0.92, 7);
  const rubbleGeometry = new THREE.DodecahedronGeometry(0.32, 0);
  disposableGeometries.add(shrubGeometry);
  disposableGeometries.add(rubbleGeometry);
  const salt = seed % 104_729;
  const safeAnchors = [
    [-6.3, 8.55],
    [6.3, 8.55],
    [-11.05, -0.1],
    [11.05, -0.1],
    [-6.8, -8.55],
    [6.8, -8.55]
  ] as const;
  safeAnchors.forEach(([anchorX, anchorZ], index) => {
    const x = anchorX + (deterministicUnit(index, salt + 1) - 0.5) * 0.58;
    const z = anchorZ + (deterministicUnit(index, salt + 2) - 0.5) * 0.42;
    const shrub = setShadow(new THREE.Mesh(shrubGeometry, shrubMaterial));
    const shrubScale = 0.72 + deterministicUnit(index, salt + 3) * 0.62;
    shrub.position.set(x, 0.46 * shrubScale, z);
    shrub.scale.setScalar(shrubScale);
    shrub.rotation.y = deterministicUnit(index, salt + 4) * Math.PI;
    group.add(shrub);
    const rubble = setShadow(new THREE.Mesh(rubbleGeometry, rubbleMaterial));
    const rubbleScale = 0.58 + deterministicUnit(index, salt + 5) * 0.62;
    rubble.position.set(
      x + (deterministicUnit(index, salt + 6) - 0.5) * 0.92,
      0.16 * rubbleScale,
      z + (deterministicUnit(index, salt + 7) - 0.5) * 0.82
    );
    rubble.scale.set(rubbleScale, rubbleScale * 0.7, rubbleScale);
    rubble.rotation.set(
      deterministicUnit(index, salt + 8) * 0.35,
      deterministicUnit(index, salt + 9) * Math.PI,
      deterministicUnit(index, salt + 10) * 0.28
    );
    group.add(rubble);
  });
  return group;
}

function geometryTriangleCount(geometry: THREE.BufferGeometry) {
  const indexCount = geometry.index?.count;
  if (indexCount !== undefined) return Math.floor(indexCount / 3);
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}

export function createInnerKeepSceneLayer(
  options: CreateInnerKeepSceneLayerOptions
): InnerKeepSceneLayer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x667558);
  scene.fog = new THREE.Fog(0x667558, 25, 52);
  const camera = new THREE.OrthographicCamera(-13, 13, 13, -13, 0.1, 100);
  let focusX = 0;
  let focusZ = 0;
  let zoom = 1;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let disposed = false;
  let selectedSlotId: string | null = null;
  let constructionPosition: Readonly<{ x: number; y: number; z: number }> | null = null;
  let completionReveal: Readonly<{
    building: THREE.Group;
    scaffold: THREE.Group;
    startedAtSeconds: number;
    durationSeconds: number;
  }> | null = null;
  let previousBuildingPhases = new Map<string, InnerKeepBuildingPresentation['phase']>();
  let lastElapsedSeconds = 0;
  let telemetry: InnerKeepSceneTelemetry = Object.freeze({
    status: 'empty',
    triangleCount: 0,
    drawCalls: 0,
    smokeSpriteCount: 0,
    slotCount: 0,
    completedBuildingCount: 0,
    constructionSiteCount: 0,
    completionRevealActive: false
  });
  const disposableMaterials = new Set<THREE.Material>();
  const disposableGeometries = new Set<THREE.BufferGeometry>();
  const disposableTextures = new Set<THREE.Texture>();
  const dynamicMaterials = new Set<THREE.Material>();
  const dynamicGeometries = new Set<THREE.BufferGeometry>();
  const staticGroup = new THREE.Group();
  const dynamicGroup = new THREE.Group();
  scene.add(staticGroup, dynamicGroup);

  const groundGeometry = new THREE.PlaneGeometry(28, 22, 20, 16);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundPosition = groundGeometry.getAttribute('position');
  for (let index = 0; index < groundPosition.count; index += 1) {
    const x = groundPosition.getX(index);
    const z = groundPosition.getZ(index);
    const edge = Math.min(1, Math.max(0, (Math.hypot(x / 14, z / 11) - 0.42) / 0.58));
    const height = edge * (0.22 + Math.sin(x * 0.45) * 0.08 + Math.cos(z * 0.52) * 0.06);
    groundPosition.setY(index, height);
  }
  groundGeometry.computeVertexNormals();
  disposableGeometries.add(groundGeometry);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x71815c,
    roughness: 0.98,
    metalness: 0
  });
  disposableMaterials.add(groundMaterial);
  const ground = setShadow(new THREE.Mesh(groundGeometry, groundMaterial), false, true);
  staticGroup.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x8c7b5b, roughness: 0.96 });
  disposableMaterials.add(roadMaterial);
  const roadGeometryVertical = new THREE.BoxGeometry(2.6, 0.12, 18.5);
  const roadGeometryHorizontal = new THREE.BoxGeometry(21, 0.12, 2.15);
  disposableGeometries.add(roadGeometryVertical);
  disposableGeometries.add(roadGeometryHorizontal);
  const roadVertical = setShadow(new THREE.Mesh(roadGeometryVertical, roadMaterial), false, true);
  roadVertical.position.y = 0.08;
  const roadHorizontal = setShadow(new THREE.Mesh(roadGeometryHorizontal, roadMaterial), false, true);
  roadHorizontal.position.set(0, 0.085, 0.2);
  staticGroup.add(roadVertical, roadHorizontal);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x745536, roughness: 0.92 });
  disposableMaterials.add(wallMaterial);
  const addWall = (width: number, depth: number, x: number, z: number) => {
    const geometry = new THREE.BoxGeometry(width, 1.25, depth);
    disposableGeometries.add(geometry);
    const wall = setShadow(new THREE.Mesh(geometry, wallMaterial));
    wall.position.set(x, 0.72, z);
    staticGroup.add(wall);
  };
  addWall(24.2, 0.36, 0, -9.5);
  addWall(0.36, 19.3, -12, 0);
  addWall(0.36, 19.3, 12, 0);
  // The southern wall is deliberately split around the playable gate and
  // road approach; a decorative wall must never visually close the route.
  addWall(9.4, 0.42, -7.3, 9.5);
  addWall(9.4, 0.42, 7.3, 9.5);

  const plazaMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b8f78,
    roughness: 0.94
  });
  disposableMaterials.add(plazaMaterial);
  const plazaGeometry = new THREE.CylinderGeometry(3.15, 3.25, 0.14, 32);
  disposableGeometries.add(plazaGeometry);
  const plaza = setShadow(new THREE.Mesh(plazaGeometry, plazaMaterial), false, true);
  plaza.position.set(0, 0.12, 3.15);
  staticGroup.add(plaza);

  const keepMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8b72, roughness: 0.84 });
  const keepRoofMaterial = new THREE.MeshStandardMaterial({ color: 0x4d3e3b, roughness: 0.72 });
  const bannerMaterial = new THREE.MeshStandardMaterial({ color: 0x63347f, roughness: 0.7 });
  disposableMaterials.add(keepMaterial);
  disposableMaterials.add(keepRoofMaterial);
  disposableMaterials.add(bannerMaterial);
  const keepGeometry = new THREE.BoxGeometry(4.6, 3.5, 3.8);
  disposableGeometries.add(keepGeometry);
  const keep = setShadow(new THREE.Mesh(keepGeometry, keepMaterial));
  keep.position.set(0, 1.85, -0.15);
  staticGroup.add(keep);
  for (const [x, z] of [[-2.35, -1.8], [2.35, -1.8], [-2.35, 1.5], [2.35, 1.5]]) {
    const towerGeometry = new THREE.CylinderGeometry(0.9, 1.03, 3.45, 10);
    const roofGeometry = new THREE.ConeGeometry(1.12, 1.05, 10);
    disposableGeometries.add(towerGeometry);
    disposableGeometries.add(roofGeometry);
    const tower = setShadow(new THREE.Mesh(towerGeometry, keepMaterial));
    tower.position.set(x!, 1.8, z!);
    const roof = setShadow(new THREE.Mesh(roofGeometry, keepRoofMaterial));
    roof.position.set(x!, 4.02, z!);
    staticGroup.add(tower, roof);
  }
  const bannerGeometry = new THREE.PlaneGeometry(0.9, 1.45);
  disposableGeometries.add(bannerGeometry);
  const banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
  banner.position.set(0, 2.2, 1.78);
  staticGroup.add(banner);

  const civicTimber = new THREE.MeshStandardMaterial({ color: 0x62401f, roughness: 0.92 });
  const civicStone = new THREE.MeshStandardMaterial({ color: 0x807b70, roughness: 0.95 });
  const civicIron = new THREE.MeshStandardMaterial({ color: 0x25252a, roughness: 0.66, metalness: 0.56 });
  const civicGreen = new THREE.MeshStandardMaterial({ color: 0x36522d, roughness: 0.96 });
  const lampGlow = new THREE.MeshStandardMaterial({
    color: 0xe6ad55,
    emissive: 0xc56f21,
    emissiveIntensity: 1.15,
    roughness: 0.44
  });
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a8b91,
    roughness: 0.3,
    metalness: 0.08
  });
  disposableMaterials.add(civicTimber);
  disposableMaterials.add(civicStone);
  disposableMaterials.add(civicIron);
  disposableMaterials.add(civicGreen);
  disposableMaterials.add(lampGlow);
  disposableMaterials.add(waterMaterial);
  const addCivicBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotationY = 0
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, material));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    staticGroup.add(mesh);
    return mesh;
  };
  const addCivicCylinder = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    segments = 12
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments
    );
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, material));
    mesh.position.set(x, y, z);
    staticGroup.add(mesh);
    return mesh;
  };

  // Open gate, approach standards, and readable civic landmarks.
  addCivicBox(0.48, 3.5, 0.48, -2.7, 1.85, 9.25, civicTimber);
  addCivicBox(0.48, 3.5, 0.48, 2.7, 1.85, 9.25, civicTimber);
  addCivicBox(5.9, 0.42, 0.52, 0, 3.42, 9.25, civicTimber);
  for (const x of [-1.7, 1.7]) {
    const gateBannerGeometry = new THREE.PlaneGeometry(0.72, 1.28);
    disposableGeometries.add(gateBannerGeometry);
    const gateBanner = new THREE.Mesh(gateBannerGeometry, bannerMaterial);
    gateBanner.position.set(x, 2.38, 8.96);
    staticGroup.add(gateBanner);
  }

  // Builder noticeboard and directional sign beside the gate approach.
  addCivicBox(0.16, 1.7, 0.16, -3.0, 0.9, 7.72, civicTimber);
  addCivicBox(0.16, 1.7, 0.16, -1.72, 0.9, 7.72, civicTimber);
  addCivicBox(1.65, 0.92, 0.13, -2.36, 1.45, 7.72, civicTimber);
  addCivicBox(2.0, 0.18, 0.75, -2.36, 2.02, 7.72, keepRoofMaterial);
  addCivicBox(0.12, 1.42, 0.12, 3.2, 0.8, 7.75, civicTimber);
  addCivicBox(1.15, 0.18, 0.14, 3.55, 1.3, 7.75, civicTimber, -0.12);

  // Village well, benches, trough, and paired plaza braziers.
  addCivicCylinder(0.88, 0.98, 0.62, 2.25, 0.42, 3.4, civicStone, 18);
  addCivicCylinder(0.62, 0.62, 0.08, 2.25, 0.77, 3.4, waterMaterial, 18);
  addCivicBox(0.12, 1.7, 0.12, 1.48, 1.2, 3.4, civicTimber);
  addCivicBox(0.12, 1.7, 0.12, 3.02, 1.2, 3.4, civicTimber);
  addCivicBox(1.92, 0.18, 0.95, 2.25, 2.08, 3.4, keepRoofMaterial);
  for (const x of [-3.1, 3.1]) {
    addCivicBox(1.7, 0.18, 0.46, x, 0.58, 1.6, civicTimber);
    addCivicBox(1.7, 0.44, 0.12, x, 0.88, 1.85, civicTimber);
  }
  addCivicBox(1.55, 0.54, 0.62, 3.8, 0.42, 6.82, civicTimber);
  for (const x of [-1.7, 1.7]) {
    addCivicCylinder(0.08, 0.11, 1.15, x, 0.72, 4.95, civicIron, 8);
    addCivicCylinder(0.24, 0.14, 0.28, x, 1.4, 4.95, lampGlow, 10);
  }
  for (const x of [-1.45, 1.45]) {
    addCivicCylinder(0.18, 0.25, 0.72, x, 0.48, 2.05, civicStone, 10);
    addCivicCylinder(0.34, 0.2, 0.24, x, 0.94, 2.05, civicIron, 12);
    addCivicCylinder(0.18, 0.08, 0.3, x, 1.17, 2.05, lampGlow, 9);
  }

  // Clipped hedges and restrained ruined masonry frame the authored yard.
  for (const [x, z, rotation] of [
    [-10.8, -1.1, Math.PI / 2],
    [10.8, -1.1, Math.PI / 2],
    [-10.8, 3.6, Math.PI / 2],
    [10.8, 3.6, Math.PI / 2]
  ] as const) {
    addCivicBox(0.72, 0.72, 2.4, x, 0.48, z, civicGreen, rotation);
  }
  addCivicCylinder(0.48, 0.56, 2.5, -0.95, 1.35, -7.92, civicStone, 10);
  addCivicCylinder(0.42, 0.5, 1.55, 0.42, 0.88, -8.18, civicStone, 10);
  addCivicBox(1.65, 0.3, 0.54, 1.55, 0.28, -8.0, civicStone, 0.28);

  const treeTrunkGeometry = new THREE.CylinderGeometry(0.11, 0.16, 1.25, 6);
  const treeCanopyGeometry = new THREE.ConeGeometry(0.72, 2.25, 8);
  disposableGeometries.add(treeTrunkGeometry);
  disposableGeometries.add(treeCanopyGeometry);
  const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4029, roughness: 0.96 });
  const treeCanopyMaterial = new THREE.MeshStandardMaterial({ color: 0x25472f, roughness: 0.92 });
  disposableMaterials.add(treeTrunkMaterial);
  disposableMaterials.add(treeCanopyMaterial);
  const treeCount = options.quality === 'reduced' ? 24 : options.quality === 'balanced' ? 34 : 44;
  const trunks = new THREE.InstancedMesh(treeTrunkGeometry, treeTrunkMaterial, treeCount);
  const canopies = new THREE.InstancedMesh(treeCanopyGeometry, treeCanopyMaterial, treeCount);
  trunks.castShadow = options.quality !== 'reduced';
  trunks.receiveShadow = true;
  canopies.castShadow = options.quality === 'high';
  canopies.receiveShadow = true;
  const treeMatrix = new THREE.Matrix4();
  for (let index = 0; index < treeCount; index += 1) {
    const side = index % 4;
    const along = deterministicUnit(index, 1) * 17 - 8.5;
    const x = side < 2
      ? (side === 0 ? -13.1 : 13.1) + (deterministicUnit(index, 2) - 0.5) * 0.8
      : along;
    const z = side >= 2
      ? (side === 2 ? -10.6 : 10.6) + (deterministicUnit(index, 3) - 0.5) * 0.8
      : along;
    const scale = 0.82 + deterministicUnit(index, 4) * 0.52;
    treeMatrix.compose(
      new THREE.Vector3(x, 0.72 * scale, z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
    );
    trunks.setMatrixAt(index, treeMatrix);
    treeMatrix.compose(
      new THREE.Vector3(x, 2.2 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        deterministicUnit(index, 5) * Math.PI
      ),
      new THREE.Vector3(scale, scale, scale)
    );
    canopies.setMatrixAt(index, treeMatrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  staticGroup.add(trunks, canopies);
  const innerTreePositions = [
    [-10.65, -1.65, 0.76],
    [10.65, -1.65, 0.82],
    [-9.55, 4.5, 0.68],
    [9.55, 4.5, 0.72]
  ] as const;
  const innerTrunks = new THREE.InstancedMesh(
    treeTrunkGeometry,
    treeTrunkMaterial,
    innerTreePositions.length
  );
  const innerCanopies = new THREE.InstancedMesh(
    treeCanopyGeometry,
    treeCanopyMaterial,
    innerTreePositions.length
  );
  innerTreePositions.forEach(([x, z, scale], index) => {
    treeMatrix.compose(
      new THREE.Vector3(x, 0.72 * scale, z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
    );
    innerTrunks.setMatrixAt(index, treeMatrix);
    treeMatrix.compose(
      new THREE.Vector3(x, 2.2 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        index * 0.78
      ),
      new THREE.Vector3(scale, scale, scale)
    );
    innerCanopies.setMatrixAt(index, treeMatrix);
  });
  innerTrunks.instanceMatrix.needsUpdate = true;
  innerCanopies.instanceMatrix.needsUpdate = true;
  innerTrunks.castShadow = options.quality !== 'reduced';
  innerCanopies.castShadow = options.quality === 'high';
  staticGroup.add(innerTrunks, innerCanopies);

  const ambient = new THREE.HemisphereLight(0xfff1cf, 0x26351e, 1.75);
  const sun = new THREE.DirectionalLight(0xffe5b1, 2.65);
  sun.position.set(-9, 18, 10);
  sun.castShadow = options.quality !== 'reduced';
  sun.shadow.mapSize.set(
    options.quality === 'high' ? 2048 : 1024,
    options.quality === 'high' ? 2048 : 1024
  );
  scene.add(ambient, sun);

  const padGeometry = new THREE.CylinderGeometry(1.45, 1.58, 0.2, 18);
  disposableGeometries.add(padGeometry);
  const padMaterial = new THREE.MeshStandardMaterial({ color: 0x978867, roughness: 0.98 });
  const reservedPadMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f6258,
    roughness: 0.98
  });
  const selectedPadMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5aa67,
    emissive: 0x4b3512,
    emissiveIntensity: 0.42,
    roughness: 0.88
  });
  disposableMaterials.add(padMaterial);
  disposableMaterials.add(reservedPadMaterial);
  disposableMaterials.add(selectedPadMaterial);
  const padMeshes = new Map<string, THREE.Mesh>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projectionPoint = new THREE.Vector3();
  const smokeTexture = createSmokeTexture();
  if (smokeTexture) disposableTextures.add(smokeTexture);
  const smokeGeometry = new THREE.PlaneGeometry(0.9, 0.9);
  disposableGeometries.add(smokeGeometry);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xb4aa99,
    ...(smokeTexture === undefined ? {} : { map: smokeTexture }),
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  disposableMaterials.add(smokeMaterial);
  const smoke = new THREE.InstancedMesh(
    smokeGeometry,
    smokeMaterial,
    SMOKE_SPRITE_BUDGET[options.quality]
  );
  smoke.name = 'inner-keep-construction-smoke';
  smoke.count = 0;
  smoke.frustumCulled = false;
  smoke.renderOrder = 8;
  dynamicGroup.add(smoke);
  const smokeMatrix = new THREE.Matrix4();
  const smokePosition = new THREE.Vector3();
  const smokeScale = new THREE.Vector3();
  const smokeQuaternion = new THREE.Quaternion();

  const updateCamera = () => {
    const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
    const minimumHalfWidth = 12.8 / zoom;
    const baseHalfHeight = (aspect < 0.78 ? 16.5 : 11.8) / zoom;
    const halfHeight = Math.max(baseHalfHeight, minimumHalfWidth / aspect);
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(17 + focusX, 21, 19 + focusZ);
    camera.lookAt(focusX, 0.5, focusZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  updateCamera();

  const getSlotProjectionFrame = (): InnerKeepSlotProjectionFrame => {
    const rect = options.canvas.getBoundingClientRect();
    const viewportWidth = Math.max(0, rect.width);
    const viewportHeight = Math.max(0, rect.height);
    if (disposed || viewportWidth <= 0 || viewportHeight <= 0) {
      return Object.freeze({
        viewportLeft: rect.left,
        viewportTop: rect.top,
        viewportWidth,
        viewportHeight,
        slots: Object.freeze([])
      });
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const slots = [...padMeshes.entries()].map(([slotId, pad]) => {
      if (pad.geometry.boundingBox === null) pad.geometry.computeBoundingBox();
      const bounds = pad.geometry.boundingBox;
      if (!bounds) {
        return Object.freeze({
          slotId,
          x: rect.left,
          y: rect.top,
          width: 0,
          height: 0,
          visible: false
        });
      }
      let minimumX = Number.POSITIVE_INFINITY;
      let maximumX = Number.NEGATIVE_INFINITY;
      let minimumY = Number.POSITIVE_INFINITY;
      let maximumY = Number.NEGATIVE_INFINITY;
      let minimumDepth = Number.POSITIVE_INFINITY;
      let maximumDepth = Number.NEGATIVE_INFINITY;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            projectionPoint
              .set(x, y, z)
              .applyMatrix4(pad.matrixWorld)
              .project(camera);
            const clientX = rect.left + (projectionPoint.x + 1) * 0.5 * viewportWidth;
            const clientY = rect.top + (1 - projectionPoint.y) * 0.5 * viewportHeight;
            minimumX = Math.min(minimumX, clientX);
            maximumX = Math.max(maximumX, clientX);
            minimumY = Math.min(minimumY, clientY);
            maximumY = Math.max(maximumY, clientY);
            minimumDepth = Math.min(minimumDepth, projectionPoint.z);
            maximumDepth = Math.max(maximumDepth, projectionPoint.z);
          }
        }
      }
      const width = Math.max(0, maximumX - minimumX);
      const height = Math.max(0, maximumY - minimumY);
      const visible = Number.isFinite(minimumX)
        && Number.isFinite(maximumX)
        && Number.isFinite(minimumY)
        && Number.isFinite(maximumY)
        && minimumDepth <= 1
        && maximumDepth >= -1
        && maximumX >= rect.left
        && minimumX <= rect.right
        && maximumY >= rect.top
        && minimumY <= rect.bottom;
      return Object.freeze({
        slotId,
        x: (minimumX + maximumX) * 0.5,
        y: (minimumY + maximumY) * 0.5,
        width,
        height,
        visible
      });
    });
    return Object.freeze({
      viewportLeft: rect.left,
      viewportTop: rect.top,
      viewportWidth,
      viewportHeight,
      slots: Object.freeze(slots)
    });
  };

  const updateSmoke = (elapsedSeconds: number) => {
    if (!constructionPosition || smoke.count === 0) return false;
    const time = options.reducedMotion ? 0.42 : elapsedSeconds;
    smokeQuaternion.copy(camera.quaternion);
    for (let index = 0; index < smoke.count; index += 1) {
      const seed = deterministicUnit(index, 11);
      const phase = (seed + time * (0.028 + deterministicUnit(index, 12) * 0.022)) % 1;
      const angle = deterministicUnit(index, 13) * Math.PI * 2 + time * 0.12;
      const radius = 0.18 + deterministicUnit(index, 14) * 1.18;
      const height = options.reducedMotion
        ? 0.65 + deterministicUnit(index, 15) * 1.35
        : 0.45 + phase * 2.75;
      smokePosition.set(
        constructionPosition.x + Math.cos(angle) * radius,
        constructionPosition.y + height,
        constructionPosition.z + Math.sin(angle) * radius * 0.72
      );
      const scale = (0.42 + deterministicUnit(index, 16) * 0.78) * (0.82 + phase * 0.72);
      smokeScale.setScalar(scale);
      smokeMatrix.compose(smokePosition, smokeQuaternion, smokeScale);
      smoke.setMatrixAt(index, smokeMatrix);
    }
    smoke.instanceMatrix.needsUpdate = true;
    return !options.reducedMotion;
  };

  const updateCompletionReveal = (elapsedSeconds: number) => {
    const reveal = completionReveal;
    if (!reveal) return false;
    const progress = Math.max(0, Math.min(
      1,
      (elapsedSeconds - reveal.startedAtSeconds) / reveal.durationSeconds
    ));
    // Smoothstep keeps the authoritative swap calm without delaying the
    // completed building's existence or exposing an empty presentation frame.
    const eased = progress * progress * (3 - 2 * progress);
    setGroupOpacity(reveal.building, 0.12 + eased * 0.88);
    setGroupOpacity(reveal.scaffold, 1 - eased);
    smokeMaterial.opacity = 0.68 * (1 - eased);
    smokeMaterial.needsUpdate = true;
    if (progress < 1) return true;
    dynamicGroup.remove(reveal.scaffold);
    setGroupOpacity(reveal.building, 1);
    const previousSmokeCount = smoke.count;
    constructionPosition = null;
    smoke.count = 0;
    smokeMaterial.opacity = 0.68;
    smokeMaterial.needsUpdate = true;
    completionReveal = null;
    telemetry = Object.freeze({
      ...telemetry,
      triangleCount: Math.max(
        0,
        telemetry.triangleCount
          - geometryTriangleCount(smokeGeometry) * previousSmokeCount
      ),
      drawCalls: Math.max(0, telemetry.drawCalls - (previousSmokeCount > 0 ? 1 : 0)),
      smokeSpriteCount: 0,
      completionRevealActive: false
    });
    return true;
  };

  const clearDynamicPresentation = () => {
    for (const child of [...dynamicGroup.children]) {
      if (child !== smoke) dynamicGroup.remove(child);
    }
    dynamicGeometries.forEach((geometry) => geometry.dispose());
    dynamicMaterials.forEach((material) => material.dispose());
    dynamicGeometries.clear();
    dynamicMaterials.clear();
    for (const mesh of padMeshes.values()) staticGroup.remove(mesh);
    padMeshes.clear();
    constructionPosition = null;
    completionReveal = null;
    smoke.count = 0;
    smokeMaterial.opacity = 0.68;
  };

  const measureTelemetry = (
    status: InnerKeepSceneTelemetry['status'],
    slotCount: number,
    completedBuildingCount: number,
    constructionSiteCount: number
  ) => {
    let triangleCount = 0;
    let drawCalls = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const count = object instanceof THREE.InstancedMesh ? object.count : 1;
      triangleCount += geometryTriangleCount(object.geometry) * count;
      if (count > 0) drawCalls += Array.isArray(object.material)
        ? object.material.length
        : 1;
    });
    telemetry = Object.freeze({
      status,
      triangleCount,
      drawCalls,
      smokeSpriteCount: smoke.count,
      slotCount,
      completedBuildingCount,
      constructionSiteCount,
      completionRevealActive: completionReveal !== null
    });
  };

  const reconcile = (
    presentation: InnerKeepPresentation | null,
    context?: InnerKeepSceneVisualContext
  ) => {
    if (disposed) return;
    clearDynamicPresentation();
    if (!presentation) {
      previousBuildingPhases = new Map();
      measureTelemetry('empty', 0, 0, 0);
      options.requestRender();
      return;
    }
    if (!innerKeepPresentationIntegrity(presentation)) {
      previousBuildingPhases = new Map();
      measureTelemetry('unavailable', 0, 0, 0);
      options.requestRender();
      return;
    }
    const orderedSlots = [...presentation.slots].sort((left, right) => (
      left.sortOrder - right.sortOrder
    ));
    const visualSeed = deterministicVisualSeed(presentation, context);
    scene.userData.innerKeepVisualSeed = visualSeed;
    scene.userData.innerKeepOwningTerrain = context?.owningTerrainKind ?? 'unknown';
    const groundColor = context?.owningTerrainKind === 'forest'
      ? 0x596f4d
      : context?.owningTerrainKind === 'heath'
        ? 0x6f7350
        : context?.owningTerrainKind === 'ridge'
          || context?.owningTerrainKind === 'ancient-stone'
          ? 0x68705d
          : 0x71815c;
    groundMaterial.color.setHex(groundColor).offsetHSL(
      (deterministicUnit(0, visualSeed % 10_007) - 0.5) * 0.018,
      0,
      (deterministicUnit(1, visualSeed % 10_007) - 0.5) * 0.045
    );
    dynamicGroup.add(createDeterministicYardDressing(
      visualSeed,
      context?.owningTerrainKind,
      dynamicMaterials,
      dynamicGeometries
    ));
    const positionBySlotId = new Map<string, InnerKeepSlotPosition>();
    orderedSlots.forEach((slot) => {
      const position = SLOT_POSITIONS.get(slot.slotId)!;
      positionBySlotId.set(slot.slotId, position);
      const pad = setShadow(new THREE.Mesh(
        padGeometry,
        slot.slotId === selectedSlotId
          ? selectedPadMaterial
          : position.active
            ? padMaterial
            : reservedPadMaterial
      ), false, true);
      const footprintScale = slot.footprintClass === 'large' ? 1.14 : 1;
      pad.scale.set(footprintScale, 1, footprintScale);
      pad.position.set(position.x, 0.16, position.z);
      pad.rotation.y = position.rotation;
      pad.userData.innerKeepSlotId = slot.slotId;
      pad.name = `inner-keep-slot-pad:${slot.slotId}`;
      padMeshes.set(slot.slotId, pad);
      staticGroup.add(pad);
    });

    let completedBuildingCount = 0;
    let constructionSiteCount = 0;
    for (const building of presentation.buildings) {
      const position = positionBySlotId.get(building.slotId);
      if (!position) continue;
      if (building.phase === 'complete') {
        const model = createBuilding(
          building.buildingKind,
          building.completedLevel,
          dynamicMaterials,
          dynamicGeometries
        );
        model.position.set(position.x, 0.26, position.z);
        model.rotation.y = position.rotation;
        dynamicGroup.add(model);
        if (
          !options.reducedMotion
          && !completionReveal
          && previousBuildingPhases.get(building.slotId) === 'constructing'
        ) {
          const revealScaffold = createScaffold(
            dynamicMaterials,
            dynamicGeometries
          );
          revealScaffold.position.set(position.x, 0.25, position.z);
          revealScaffold.rotation.y = position.rotation;
          setGroupOpacity(model, 0.12);
          dynamicGroup.add(revealScaffold);
          completionReveal = Object.freeze({
            building: model,
            scaffold: revealScaffold,
            startedAtSeconds: lastElapsedSeconds,
            durationSeconds: 1.1
          });
          constructionPosition = Object.freeze({
            x: position.x,
            y: 0.32,
            z: position.z
          });
        }
        completedBuildingCount += 1;
        continue;
      }
      const scaffold = createScaffold(dynamicMaterials, dynamicGeometries);
      scaffold.position.set(position.x, 0.25, position.z);
      scaffold.rotation.y = position.rotation;
      dynamicGroup.add(scaffold);
      constructionPosition = Object.freeze({
        x: position.x,
        y: 0.32,
        z: position.z
      });
      constructionSiteCount += 1;
    }
    smoke.count = constructionPosition
      ? SMOKE_SPRITE_BUDGET[options.quality]
      : 0;
    updateSmoke(lastElapsedSeconds);
    updateCompletionReveal(lastElapsedSeconds);
    previousBuildingPhases = new Map(presentation.buildings.map((building) => [
      building.slotId,
      building.phase
    ] as const));
    measureTelemetry(
      'ready',
      orderedSlots.length,
      completedBuildingCount,
      constructionSiteCount
    );
    options.requestRender();
  };

  return Object.freeze({
    scene,
    camera,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearDynamicPresentation();
      scene.clear();
      disposableGeometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      disposableTextures.forEach((texture) => texture.dispose());
      disposableGeometries.clear();
      disposableMaterials.clear();
      disposableTextures.clear();
      padMeshes.clear();
    },
    getAnimationFrameCap: () => options.reducedMotion
      ? 0
      : SMOKE_FRAME_CAP[options.quality],
    getSlotProjectionFrame,
    getTelemetry: () => telemetry,
    isAnimationActive: () => (
      !disposed
      && !options.reducedMotion
      && (
        (constructionPosition !== null && smoke.count > 0)
        || completionReveal !== null
      )
    ),
    panByPixels: (deltaX, deltaY) => {
      if (disposed || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
      const scale = 0.012 / zoom;
      focusX = Math.max(-3.4, Math.min(3.4, focusX - deltaX * scale));
      focusZ = Math.max(-2.8, Math.min(2.8, focusZ - deltaY * scale));
      updateCamera();
      options.requestRender();
    },
    pickSlot: (clientX, clientY) => {
      if (disposed) return null;
      const rect = options.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...padMeshes.values()], false)[0];
      const slotId = hit?.object.userData.innerKeepSlotId;
      return typeof slotId === 'string' ? slotId : null;
    },
    reconcile,
    setSelectedSlot: (slotId) => {
      if (disposed || selectedSlotId === slotId) return;
      selectedSlotId = slotId;
      for (const [id, pad] of padMeshes) {
        pad.material = id === slotId
          ? selectedPadMaterial
          : SLOT_POSITIONS.get(id)?.active === true
            ? padMaterial
            : reservedPadMaterial;
      }
      options.requestRender();
    },
    setViewport: (width, height) => {
      if (disposed) return;
      viewportWidth = Math.max(1, width);
      viewportHeight = Math.max(1, height);
      updateCamera();
    },
    update: (elapsedSeconds) => {
      if (disposed || !Number.isFinite(elapsedSeconds)) return false;
      lastElapsedSeconds = Math.max(0, elapsedSeconds);
      const smokeChanged = updateSmoke(lastElapsedSeconds);
      const revealChanged = updateCompletionReveal(lastElapsedSeconds);
      return smokeChanged || revealChanged;
    },
    zoomByWheel: (deltaY, deltaMode) => {
      if (disposed || !Number.isFinite(deltaY)) return;
      const unit = deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewportHeight
          : 1;
      zoom = Math.max(0.72, Math.min(1.5, zoom * Math.exp(-deltaY * unit * 0.0012)));
      updateCamera();
      options.requestRender();
    }
  });
}
