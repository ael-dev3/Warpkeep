import * as THREE from 'three';

import { createInnerKeepTerrainDrapedEllipseGeometry } from './createInnerKeepTerrainDrapedGeometry';
import {
  INNER_KEEP_OUTER_WORLD_BOAT_ROUTE,
  innerKeepOuterWorldTerrainHeightAt,
} from './innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_CANAL_BOAT_BUDGETS,
  INNER_KEEP_CANAL_DOCK_BUDGETS,
  INNER_KEEP_CANAL_DOCK_PLACEMENTS,
  INNER_KEEP_GRAVE_MARKER_BUDGETS,
  INNER_KEEP_GRAVE_MARKER_PLACEMENTS,
  INNER_KEEP_GRAVEYARD_FENCE_BUDGETS,
  INNER_KEEP_GRAVEYARD_FOOTPATH,
  INNER_KEEP_GRAVEYARD_PLOT,
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSES,
  INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY,
  INNER_KEEP_TOWN_TONAL_PALETTE,
  INNER_KEEP_VILLAGE_ANIMAL_BUDGETS,
  INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS,
  INNER_KEEP_WET_RUT_BUDGETS,
  INNER_KEEP_WET_RUT_PLACEMENTS,
  sampleInnerKeepVillageAnimalPosition,
  type InnerKeepLowerWardRowHouse,
} from './innerKeepTownAtmospherePolicy';

export type InnerKeepTownAtmosphereQuality =
  keyof typeof INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS;

export type InnerKeepTownAtmosphere = Readonly<{
  group: THREE.Group;
  rowHouseCount: number;
  villageDetailCount: number;
  smokePuffCount: number;
  wetRutCount: number;
  graveMarkerCount: number;
  graveyardFenceSegmentCount: number;
  canalBoatCount: number;
  canalDockCount: number;
  villageAnimalCount: number;
  villageBirdCount: number;
  livestockCount: number;
  update: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  dispose: () => void;
}>;

function createGabledRoofGeometry() {
  const positions = [
    -0.5, 0, -0.5,
    0.5, 0, -0.5,
    0, 1, -0.5,
    -0.5, 0, 0.5,
    0.5, 0, 0.5,
    0, 1, 0.5,
  ];
  const indices = [
    0, 2, 1,
    5, 3, 4,
    0, 3, 2,
    3, 5, 2,
    1, 2, 4,
    2, 5, 4,
    0, 1, 3,
    1, 4, 3,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createBillboardGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    -0.5, 0.5, 0,
    0.5, 0.5, 0,
    0, -0.5, -0.5,
    0, -0.5, 0.5,
    0, 0.5, -0.5,
    0, 0.5, 0.5,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 1, 3, 2,
    4, 6, 5, 5, 6, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function presentationOnly(object: THREE.Object3D) {
  object.userData.presentationOnly = true;
  object.userData.gameplayAuthorityClaimed = false;
  object.userData.authoritativeBuilding = false;
  object.raycast = () => undefined;
  return object;
}

export function assertInnerKeepInstanceColorContract(mesh: THREE.InstancedMesh) {
  if (
    mesh.instanceColor === null
    || mesh.geometry.getAttribute('color') !== undefined
  ) return;
  const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (meshMaterials.some((material) => (
    (material as THREE.Material & { vertexColors?: boolean }).vertexColors === true
  ))) {
    throw new Error('INNER_KEEP_INSTANCE_COLOR_REQUIRES_GEOMETRY_COLOR');
  }
}

function finalizeStaticInstances(mesh: THREE.InstancedMesh) {
  assertInnerKeepInstanceColorContract(mesh);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  presentationOnly(mesh);
}

function localTransform(
  base: THREE.Matrix4,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
) {
  return base.clone().multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion(),
    new THREE.Vector3(...scale),
  ));
}

const ROW_HOUSE_TIMBER_PIECES: readonly Readonly<{
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
}>[] = Object.freeze([
  { position: [-1.06, 1.7, 0.875], scale: [0.1, 1.7, 0.09] },
  { position: [0, 1.7, 0.875], scale: [0.09, 1.7, 0.09] },
  { position: [1.06, 1.7, 0.875], scale: [0.1, 1.7, 0.09] },
  { position: [0, 1.28, 0.875], scale: [2.44, 0.09, 0.09] },
  { position: [0, 2.08, 0.875], scale: [2.58, 0.1, 0.09] },
  { position: [0.64, 0.58, 0.79], scale: [0.54, 1.08, 0.1] },
  { position: [-0.72, 2.68, -0.25], scale: [0.28, 0.68, 0.28] },
  { position: [0, 2.3, 0.93], scale: [1.9, 0.1, 0.04] },
  { position: [0, 2.3, -0.93], scale: [1.9, 0.1, 0.04] },
  { position: [-1.25, 1.02, 0], scale: [0.1, 0.1, 1.68] },
  { position: [1.25, 1.02, 0], scale: [0.1, 0.1, 1.68] },
  { position: [-0.67, 1.45, 0.93], scale: [0.48, 0.08, 0.04] },
  { position: [0.67, 1.45, 0.93], scale: [0.48, 0.08, 0.04] },
  { position: [0.64, 1.2, 0.93], scale: [0.62, 0.1, 0.04] },
  { position: [0, 2.94, 0], scale: [0.1, 0.08, 1.82] },
]);

export const INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT =
  ROW_HOUSE_TIMBER_PIECES.length;

function staticMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  presentationOnly(mesh);
  return mesh;
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function sampleCanalRoute(progress: number) {
  const route = INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.points;
  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index]!;
    const to = route[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    lengths.push(length);
    totalLength += length;
  }
  let remaining = Math.max(0, Math.min(1, progress)) * totalLength;
  for (let index = 0; index < lengths.length; index += 1) {
    const from = route[index]!;
    const to = route[index + 1]!;
    const length = lengths[index]!;
    if (remaining > length && index < lengths.length - 1) {
      remaining -= length;
      continue;
    }
    const local = length <= 0.000_001 ? 0 : remaining / length;
    return Object.freeze({
      x: THREE.MathUtils.lerp(from.x, to.x, local),
      y: THREE.MathUtils.lerp(from.y, to.y, local),
      z: THREE.MathUtils.lerp(from.z, to.z, local),
      heading: Math.atan2(to.x - from.x, to.z - from.z),
    });
  }
  const final = route.at(-1)!;
  return Object.freeze({ x: final.x, y: final.y, z: final.z, heading: 0 });
}

export function resolveInnerKeepRowHouseGrounding(
  house: InnerKeepLowerWardRowHouse,
  terrainHeightAt: (x: number, z: number) => number =
    innerKeepOuterWorldTerrainHeightAt,
) {
  const rotation = house.rotationMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  let minimumTerrainHeight = Number.POSITIVE_INFINITY;
  let maximumTerrainHeight = Number.NEGATIVE_INFINITY;
  for (const localX of [-1.25, -0.625, 0, 0.625, 1.25]) {
    for (const localZ of [-0.8, -0.4, 0, 0.4, 0.8]) {
      const x = house.positionMeters[0] + localX * cosine + localZ * sine;
      const z = house.positionMeters[1] - localX * sine + localZ * cosine;
      const height = terrainHeightAt(x, z);
      minimumTerrainHeight = Math.min(minimumTerrainHeight, height);
      maximumTerrainHeight = Math.max(maximumTerrainHeight, height);
    }
  }
  const foundationBottomMeters = minimumTerrainHeight - 0.08;
  const foundationTopMeters = maximumTerrainHeight + 0.025;
  return Object.freeze({
    minimumTerrainHeight,
    maximumTerrainHeight,
    foundationBottomMeters,
    foundationTopMeters,
    foundationHeightMeters: foundationTopMeters - foundationBottomMeters,
  });
}

/**
 * Builds a cheap, deterministic ward that reads as housing without reusing any
 * build-catalogue silhouette or inventing a gameplay structure.
 */
export function createInnerKeepTownAtmosphere(options: Readonly<{
  quality: InnerKeepTownAtmosphereQuality;
  reducedMotion: boolean;
  terrainHeightAt?: (x: number, z: number) => number;
}>): InnerKeepTownAtmosphere {
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const group = new THREE.Group();
  group.name = 'inner-keep-weathered-town-atmosphere';
  Object.assign(group.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roofGeometry = createGabledRoofGeometry();
  const smokeGeometry = new THREE.SphereGeometry(
    1,
    options.quality === 'reduced' ? 6 : 8,
    options.quality === 'reduced' ? 4 : 6,
  );
  const detailSphereGeometry = options.quality === 'reduced'
    ? createBillboardGeometry()
    : new THREE.SphereGeometry(1, 8, 6);
  const animalFeatureGeometry = new THREE.ConeGeometry(
    1,
    1,
    options.quality === 'reduced' ? 5 : 7,
  );
  animalFeatureGeometry.rotateX(Math.PI / 2);
  geometries.add(boxGeometry);
  geometries.add(roofGeometry);
  geometries.add(smokeGeometry);
  geometries.add(detailSphereGeometry);
  geometries.add(animalFeatureGeometry);

  // These geometries have no per-vertex `color` attribute. Their deterministic
  // palette comes from InstancedMesh.instanceColor, so material.vertexColors
  // must stay disabled or WebGL multiplies every painted surface by black.
  const plasterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
  });
  const timberMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.window,
    emissive: INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.window,
    emissiveIntensity: 0.42,
    roughness: 0.5,
  });
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.smoke,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const wetRutMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.roads.wetRut,
    metalness: 0.04,
    roughness: 0.24,
    transparent: true,
    opacity: 0.66,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  });
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
  });
  const shutterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
  });
  const gardenMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
  });
  const linenMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const graveStoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
  });
  const graveTimberMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.graveyard.timber,
    roughness: 1,
  });
  const gravePathMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.graveyard.path,
    roughness: 1,
    transparent: true,
    opacity: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const dockTimberMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.dock.timber,
    roughness: 0.96,
  });
  const dockWeatheredMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.dock.weathered,
    roughness: 0.96,
  });
  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.dock.rope,
    roughness: 1,
  });
  const cargoMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.dock.cargo,
    roughness: 0.95,
  });
  const animalBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const animalDarkMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.animals.dark,
    roughness: 0.95,
  });
  const animalFeatureMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
  });
  materials.add(plasterMaterial);
  materials.add(roofMaterial);
  materials.add(timberMaterial);
  materials.add(windowMaterial);
  materials.add(smokeMaterial);
  materials.add(wetRutMaterial);
  materials.add(doorMaterial);
  materials.add(shutterMaterial);
  materials.add(gardenMaterial);
  materials.add(linenMaterial);
  materials.add(graveStoneMaterial);
  materials.add(graveTimberMaterial);
  materials.add(gravePathMaterial);
  materials.add(dockTimberMaterial);
  materials.add(dockWeatheredMaterial);
  materials.add(ropeMaterial);
  materials.add(cargoMaterial);
  materials.add(animalBodyMaterial);
  materials.add(animalDarkMaterial);
  materials.add(animalFeatureMaterial);

  const houses = INNER_KEEP_LOWER_WARD_ROW_HOUSES.slice(
    0,
    INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS[options.quality],
  );
  const bodies = new THREE.InstancedMesh(
    boxGeometry,
    plasterMaterial,
    houses.length * 2,
  );
  bodies.name = 'inner-keep-lower-ward-wattle-bodies';
  const foundations = new THREE.InstancedMesh(
    boxGeometry,
    graveStoneMaterial,
    houses.length,
  );
  foundations.name = 'inner-keep-lower-ward-stone-foundations';
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, houses.length);
  roofs.name = 'inner-keep-lower-ward-crooked-gables';
  const timbers = new THREE.InstancedMesh(
    boxGeometry,
    timberMaterial,
    houses.length * INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT,
  );
  timbers.name = 'inner-keep-lower-ward-painted-timbers';
  const windows = new THREE.InstancedMesh(
    boxGeometry,
    windowMaterial,
    houses.length * 3,
  );
  windows.name = 'inner-keep-lower-ward-warm-windows';
  const doorCount = options.quality === 'reduced' ? 0 : houses.length;
  const shutterCount = options.quality === 'reduced' ? 0 : houses.length * 4;
  const gardenCount = options.quality === 'reduced' ? 0 : houses.length;
  const linenCount = options.quality === 'reduced' ? 0 : Math.ceil(houses.length / 2) * 2;
  const doors = new THREE.InstancedMesh(boxGeometry, doorMaterial, doorCount);
  doors.name = 'inner-keep-lower-ward-cottage-doors';
  const shutters = new THREE.InstancedMesh(
    boxGeometry,
    shutterMaterial,
    shutterCount,
  );
  shutters.name = 'inner-keep-lower-ward-window-shutters';
  const gardens = new THREE.InstancedMesh(boxGeometry, gardenMaterial, gardenCount);
  gardens.name = 'inner-keep-lower-ward-kitchen-gardens';
  const linens = new THREE.InstancedMesh(boxGeometry, linenMaterial, linenCount);
  linens.name = 'inner-keep-lower-ward-laundry-lines';
  bodies.castShadow = options.quality !== 'reduced';
  bodies.receiveShadow = true;
  foundations.castShadow = options.quality !== 'reduced';
  foundations.receiveShadow = true;
  roofs.castShadow = options.quality !== 'reduced';
  roofs.receiveShadow = true;
  timbers.castShadow = options.quality === 'high';
  timbers.receiveShadow = true;
  windows.castShadow = false;
  windows.receiveShadow = false;
  doors.castShadow = options.quality !== 'reduced';
  doors.receiveShadow = true;
  shutters.castShadow = false;
  shutters.receiveShadow = true;
  gardens.castShadow = false;
  gardens.receiveShadow = true;
  linens.castShadow = false;
  linens.receiveShadow = true;

  const smokeOrigins: THREE.Vector3[] = [];
  houses.forEach((house, houseIndex) => {
    const [x, z] = house.positionMeters;
    const grounding = resolveInnerKeepRowHouseGrounding(house, terrainHeightAt);
    const ground = grounding.foundationTopMeters;
    const rotation = house.rotationMilliDegrees * Math.PI / 180_000;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation,
    );
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(x, ground, z),
      quaternion,
      new THREE.Vector3(1, house.heightScale, 1),
    );
    const plaster = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.plaster[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.plaster.length
    ]!;
    const roof = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.roof[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.roof.length
    ]!;
    const foundation = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.foundation[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.foundation.length
    ]!;
    const timber = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.timber[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.timber.length
    ]!;
    const door = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.door[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.door.length
    ]!;
    const shutter = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.shutter[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.shutter.length
    ]!;
    const bodyIndex = houseIndex * 2;
    foundations.setMatrixAt(houseIndex, new THREE.Matrix4().compose(
      new THREE.Vector3(
        x,
        (grounding.foundationBottomMeters + grounding.foundationTopMeters) * 0.5,
        z,
      ),
      quaternion,
      new THREE.Vector3(2.5, grounding.foundationHeightMeters, 1.6),
    ));
    foundations.setColorAt(
      houseIndex,
      new THREE.Color(foundation),
    );
    bodies.setMatrixAt(bodyIndex, localTransform(base, [0, 0.66, 0], [2.45, 1.3, 1.55]));
    bodies.setColorAt(bodyIndex, new THREE.Color(plaster).multiplyScalar(0.9));
    bodies.setMatrixAt(
      bodyIndex + 1,
      localTransform(base, [houseIndex % 2 === 0 ? -0.08 : 0.08, 1.7, 0], [2.64, 0.86, 1.72]),
    );
    bodies.setColorAt(bodyIndex + 1, new THREE.Color(plaster));
    roofs.setMatrixAt(
      houseIndex,
      localTransform(base, [0, 2.1, 0], [2.78, 0.82, 1.86]),
    );
    roofs.setColorAt(houseIndex, new THREE.Color(roof));

    ROW_HOUSE_TIMBER_PIECES.forEach((piece, pieceIndex) => {
      const timberColor = new THREE.Color(timber).offsetHSL(
        0,
        0,
        pieceIndex % 4 === 0 ? 0.035 : 0,
      );
      timbers.setMatrixAt(
        houseIndex * INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT + pieceIndex,
        localTransform(base, piece.position, piece.scale),
      );
      timbers.setColorAt(
        houseIndex * INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT + pieceIndex,
        timberColor,
      );
    });
    for (const [windowIndex, windowX] of [-0.67, 0.67].entries()) {
      windows.setMatrixAt(
        houseIndex * 3 + windowIndex,
        localTransform(base, [windowX, 1.7, 0.915], [0.36, 0.43, 0.045]),
      );
      if (shutterCount > 0) {
        const shutterColor = new THREE.Color(shutter).offsetHSL(
          windowIndex === 0 ? -0.012 : 0.012,
          0,
          windowIndex === 0 ? 0.02 : 0,
        );
        shutters.setMatrixAt(
          houseIndex * 4 + windowIndex * 2,
          localTransform(base, [windowX - 0.27, 1.7, 0.94], [0.12, 0.48, 0.04]),
        );
        shutters.setColorAt(
          houseIndex * 4 + windowIndex * 2,
          shutterColor,
        );
        shutters.setMatrixAt(
          houseIndex * 4 + windowIndex * 2 + 1,
          localTransform(base, [windowX + 0.27, 1.7, 0.94], [0.12, 0.48, 0.04]),
        );
        shutters.setColorAt(
          houseIndex * 4 + windowIndex * 2 + 1,
          shutterColor,
        );
      }
    }
    windows.setMatrixAt(
      houseIndex * 3 + 2,
      localTransform(
        base,
        [houseIndex % 2 === 0 ? -1.335 : 1.335, 1.65, 0],
        [0.045, 0.36, 0.32],
      ),
    );
    if (doorCount > 0) {
      doors.setMatrixAt(
        houseIndex,
        localTransform(base, [0.64, 0.61, 0.945], [0.5, 1.12, 0.07]),
      );
      doors.setColorAt(houseIndex, new THREE.Color(door));
    }
    if (gardenCount > 0) {
      gardens.setMatrixAt(
        houseIndex,
        localTransform(
          base,
          [houseIndex % 2 === 0 ? -1.58 : 1.58, 0.07, -0.18],
          [0.72, 0.1, 1.05],
        ),
      );
      gardens.setColorAt(
        houseIndex,
        new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.garden[
          houseIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.garden.length
        ]!),
      );
    }
    if (linenCount > 0 && houseIndex % 2 === 0) {
      const linenBaseIndex = Math.floor(houseIndex / 2) * 2;
      for (let clothIndex = 0; clothIndex < 2; clothIndex += 1) {
        linens.setMatrixAt(
          linenBaseIndex + clothIndex,
          localTransform(
            base,
            [-0.34 + clothIndex * 0.68, 1.08 - clothIndex * 0.06, -0.91],
            [0.5, 0.42, 0.035],
          ),
        );
        linens.setColorAt(
          linenBaseIndex + clothIndex,
          new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.linen[
            (houseIndex + clothIndex) % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.linen.length
          ]!),
        );
      }
    }

    const chimneyLocal = new THREE.Vector3(-0.72, 3.06 * house.heightScale, -0.25)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    smokeOrigins.push(new THREE.Vector3(x, ground, z).add(chimneyLocal));

    const marker = new THREE.Group();
    marker.name = `inner-keep-lower-ward-row-house:${house.houseId}`;
    marker.position.set(x, ground, z);
    marker.rotation.y = rotation;
    Object.assign(marker.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);
    group.add(marker);
  });
  finalizeStaticInstances(foundations);
  finalizeStaticInstances(bodies);
  finalizeStaticInstances(roofs);
  finalizeStaticInstances(timbers);
  finalizeStaticInstances(windows);
  const houseDetails = [doors, shutters, gardens, linens].filter(({ count }) => count > 0);
  houseDetails.forEach(finalizeStaticInstances);
  group.add(foundations, bodies, roofs, timbers, windows, ...houseDetails);
  const villageDetailCount = doorCount + shutterCount + gardenCount + linenCount;

  const smokePuffsPerHouse = options.quality === 'reduced' ? 0 : 2;
  const smokePuffCount = smokeOrigins.length * smokePuffsPerHouse;
  const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, smokePuffCount);
  smoke.name = 'inner-keep-lower-ward-chimney-smoke';
  smoke.castShadow = false;
  smoke.receiveShadow = false;
  smoke.renderOrder = 7;
  smoke.frustumCulled = false;
  smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  presentationOnly(smoke);
  group.add(smoke);

  const wetRuts = INNER_KEEP_WET_RUT_PLACEMENTS.slice(
    0,
    INNER_KEEP_WET_RUT_BUDGETS[options.quality],
  );
  const rutGeometry = createInnerKeepTerrainDrapedEllipseGeometry({
    placements: wetRuts.map((rut) => Object.freeze({
      center: Object.freeze({ x: rut.positionMeters[0], z: rut.positionMeters[1] }),
      radiiMeters: rut.radiiMeters,
      rotationYRadians: rut.rotationMilliDegrees * Math.PI / 180_000,
      surfaceLiftMeters: rut.surfaceLiftMeters,
    })),
    terrainHeightAt,
    angularSegments: options.quality === 'reduced'
      ? 12
      : options.quality === 'balanced' ? 20 : 24,
    radialSegments: options.quality === 'reduced'
      ? 1
      : options.quality === 'balanced' ? 3 : 4,
  });
  geometries.add(rutGeometry);
  const rutMesh = new THREE.Mesh(rutGeometry, wetRutMaterial);
  rutMesh.name = 'inner-keep-rain-darkened-wheel-ruts';
  rutMesh.userData.innerKeepWetRutCount = wetRuts.length;
  rutMesh.castShadow = false;
  rutMesh.receiveShadow = true;
  rutMesh.renderOrder = 3;
  presentationOnly(rutMesh);
  group.add(rutMesh);

  const graveMarkers = INNER_KEEP_GRAVE_MARKER_PLACEMENTS.slice(
    0,
    INNER_KEEP_GRAVE_MARKER_BUDGETS[options.quality],
  );
  const headstones = graveMarkers.filter(({ kind }) => kind === 'headstone');
  const crosses = graveMarkers.filter(({ kind }) => kind === 'cross');
  const graveSlabs = new THREE.InstancedMesh(
    boxGeometry,
    graveStoneMaterial,
    headstones.length,
  );
  graveSlabs.name = 'inner-keep-old-road-grave-headstones';
  const graveCapCount = options.quality === 'reduced' ? 0 : headstones.length;
  const graveCaps = new THREE.InstancedMesh(
    detailSphereGeometry,
    graveStoneMaterial,
    graveCapCount,
  );
  graveCaps.name = 'inner-keep-old-road-grave-rounded-caps';
  const graveCrossStems = new THREE.InstancedMesh(
    boxGeometry,
    graveTimberMaterial,
    crosses.length,
  );
  graveCrossStems.name = 'inner-keep-old-road-grave-cross-stems';
  const graveCrossBars = new THREE.InstancedMesh(
    boxGeometry,
    graveTimberMaterial,
    crosses.length,
  );
  graveCrossBars.name = 'inner-keep-old-road-grave-cross-bars';
  headstones.forEach((marker, index) => {
    const [x, z] = marker.positionMeters;
    const ground = terrainHeightAt(x, z);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      marker.rotationMilliDegrees * Math.PI / 180_000,
    );
    const stoneColor = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.graveyard.stone[
      index % INNER_KEEP_TOWN_TONAL_PALETTE.graveyard.stone.length
    ]!);
    graveSlabs.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, ground + 0.31 * marker.scale, z),
      quaternion,
      new THREE.Vector3(0.4 * marker.scale, 0.62 * marker.scale, 0.17 * marker.scale),
    ));
    graveSlabs.setColorAt(index, stoneColor);
    if (graveCapCount > 0) {
      graveCaps.setMatrixAt(index, new THREE.Matrix4().compose(
        new THREE.Vector3(x, ground + 0.64 * marker.scale, z),
        quaternion,
        new THREE.Vector3(0.21 * marker.scale, 0.15 * marker.scale, 0.13 * marker.scale),
      ));
      graveCaps.setColorAt(index, stoneColor);
    }
  });
  crosses.forEach((marker, index) => {
    const [x, z] = marker.positionMeters;
    const ground = terrainHeightAt(x, z);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      marker.rotationMilliDegrees * Math.PI / 180_000,
    );
    graveCrossStems.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, ground + 0.39 * marker.scale, z),
      quaternion,
      new THREE.Vector3(0.11 * marker.scale, 0.78 * marker.scale, 0.11 * marker.scale),
    ));
    graveCrossBars.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, ground + 0.52 * marker.scale, z),
      quaternion,
      new THREE.Vector3(0.48 * marker.scale, 0.1 * marker.scale, 0.1 * marker.scale),
    ));
  });
  for (const mesh of [graveSlabs, graveCaps, graveCrossStems, graveCrossBars]) {
    if (mesh.count <= 0) continue;
    mesh.castShadow = options.quality !== 'reduced';
    mesh.receiveShadow = true;
    finalizeStaticInstances(mesh);
    group.add(mesh);
  }
  for (const marker of graveMarkers) {
    const graveMarker = new THREE.Group();
    graveMarker.name = `inner-keep-old-road-grave:${marker.markerId}`;
    graveMarker.position.set(
      marker.positionMeters[0],
      terrainHeightAt(...marker.positionMeters),
      marker.positionMeters[1],
    );
    Object.assign(graveMarker.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);
    presentationOnly(graveMarker);
    group.add(graveMarker);
  }

  const [graveyardX, graveyardZ] = INNER_KEEP_GRAVEYARD_PLOT.centerMeters;
  const graveyardPathGeometry = createInnerKeepTerrainDrapedEllipseGeometry({
    placements: [Object.freeze({
      center: Object.freeze({
        x: INNER_KEEP_GRAVEYARD_FOOTPATH.centerMeters[0],
        z: INNER_KEEP_GRAVEYARD_FOOTPATH.centerMeters[1],
      }),
      radiiMeters: INNER_KEEP_GRAVEYARD_FOOTPATH.radiiMeters,
      rotationYRadians: 0,
      surfaceLiftMeters: 0.035,
    })],
    terrainHeightAt,
    angularSegments: 28,
    radialSegments: 5,
  });
  geometries.add(graveyardPathGeometry);
  const graveyardPath = new THREE.Mesh(graveyardPathGeometry, gravePathMaterial);
  graveyardPath.name = 'inner-keep-old-road-graveyard-footpath';
  graveyardPath.castShadow = false;
  graveyardPath.receiveShadow = true;
  graveyardPath.renderOrder = 2;
  presentationOnly(graveyardPath);
  group.add(graveyardPath);

  const [graveyardHalfX, graveyardHalfZ] = INNER_KEEP_GRAVEYARD_PLOT.halfExtentsMeters;
  const fenceSegments = [
    ...[-2.45, 0, 2.45].flatMap((offsetZ) => [
      { x: -graveyardHalfX, z: offsetZ, scale: [0.1, 0.42, 2.25] as const },
      { x: graveyardHalfX, z: offsetZ, scale: [0.1, 0.42, 2.25] as const },
    ]),
    { x: -1.18, z: -graveyardHalfZ, scale: [2.2, 0.42, 0.1] as const },
    { x: 1.18, z: -graveyardHalfZ, scale: [2.2, 0.42, 0.1] as const },
    { x: -1.48, z: graveyardHalfZ, scale: [1.7, 0.42, 0.1] as const },
    { x: 1.48, z: graveyardHalfZ, scale: [1.7, 0.42, 0.1] as const },
  ] as const;
  const renderedFenceSegments = fenceSegments.slice(
    0,
    INNER_KEEP_GRAVEYARD_FENCE_BUDGETS[options.quality],
  );
  const groundedFencePieces = renderedFenceSegments.flatMap((segment) => {
    const alongX = segment.scale[0] > segment.scale[2];
    const totalLength = Math.max(segment.scale[0], segment.scale[2]);
    const pieceCount = Math.max(1, Math.ceil(totalLength / 0.75));
    return Array.from({ length: pieceCount }, (_, pieceIndex) => {
      const startOffset = -totalLength * 0.5 + totalLength * pieceIndex / pieceCount;
      const endOffset = -totalLength * 0.5 + totalLength * (pieceIndex + 1) / pieceCount;
      const startX = graveyardX + segment.x + (alongX ? startOffset : 0);
      const startZ = graveyardZ + segment.z + (alongX ? 0 : startOffset);
      const endX = graveyardX + segment.x + (alongX ? endOffset : 0);
      const endZ = graveyardZ + segment.z + (alongX ? 0 : endOffset);
      const startY = terrainHeightAt(startX, startZ) + 0.34;
      const endY = terrainHeightAt(endX, endZ) + 0.34;
      const horizontalLength = totalLength / pieceCount;
      const slopeRadians = Math.atan2(endY - startY, horizontalLength);
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        alongX ? 0 : -slopeRadians,
        0,
        alongX ? slopeRadians : 0,
      ));
      return Object.freeze({
        position: Object.freeze([
          (startX + endX) * 0.5,
          (startY + endY) * 0.5,
          (startZ + endZ) * 0.5,
        ] as const),
        quaternion,
        scale: Object.freeze(alongX
          ? [Math.hypot(horizontalLength, endY - startY), 0.18, 0.1] as const
          : [0.1, 0.18, Math.hypot(horizontalLength, endY - startY)] as const),
      });
    });
  });
  const graveFenceRails = new THREE.InstancedMesh(
    boxGeometry,
    graveTimberMaterial,
    groundedFencePieces.length,
  );
  graveFenceRails.name = 'inner-keep-old-road-graveyard-fence-rails';
  graveFenceRails.userData.innerKeepLogicalFenceSegmentCount =
    renderedFenceSegments.length;
  groundedFencePieces.forEach((piece, index) => {
    graveFenceRails.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(...piece.position),
      piece.quaternion,
      new THREE.Vector3(...piece.scale),
    ));
  });
  finalizeStaticInstances(graveFenceRails);
  group.add(graveFenceRails);
  const fencePostOffsets = [
    ...[-graveyardHalfZ, -1.23, 1.23, graveyardHalfZ].flatMap((z) => [
      [-graveyardHalfX, z] as const,
      [graveyardHalfX, z] as const,
    ]),
    [-0.58, graveyardHalfZ] as const,
    [0.58, graveyardHalfZ] as const,
  ];
  const renderedFencePostOffsets = options.quality === 'reduced'
    ? fencePostOffsets.slice(0, 4)
    : fencePostOffsets;
  const graveFencePosts = new THREE.InstancedMesh(
    boxGeometry,
    graveTimberMaterial,
    renderedFencePostOffsets.length,
  );
  graveFencePosts.name = 'inner-keep-old-road-graveyard-fence-posts';
  renderedFencePostOffsets.forEach(([offsetX, offsetZ], index) => {
    const x = graveyardX + offsetX;
    const z = graveyardZ + offsetZ;
    graveFencePosts.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, terrainHeightAt(x, z) + 0.43, z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.13, 0.86, 0.13),
    ));
  });
  finalizeStaticInstances(graveFencePosts);
  group.add(graveFencePosts);

  const docks = INNER_KEEP_CANAL_DOCK_PLACEMENTS.slice(
    0,
    INNER_KEEP_CANAL_DOCK_BUDGETS[options.quality],
  );
  for (const dock of docks) {
    const dockGroup = new THREE.Group();
    dockGroup.name = `inner-keep-canal-dock:${dock.dockId}`;
    dockGroup.position.set(
      dock.positionMeters[0],
      dock.positionMeters[1],
      dock.positionMeters[2],
    );
    dockGroup.rotation.y = dock.rotationMilliDegrees * Math.PI / 180_000;
    Object.assign(dockGroup.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);
    presentationOnly(dockGroup);
    const dockPlankCount = options.quality === 'reduced' ? 3 : 6;
    for (let plankIndex = 0; plankIndex < dockPlankCount; plankIndex += 1) {
      const plank = staticMesh(
        boxGeometry,
        plankIndex % 2 === 0 ? dockTimberMaterial : dockWeatheredMaterial,
        `inner-keep-canal-dock-plank:${dock.dockId}:${plankIndex}`,
      );
      const plankSpacing = options.quality === 'reduced' ? 0.42 : 0.21;
      plank.position.set(0, 0, -0.42 + plankIndex * plankSpacing);
      plank.scale.set(2.8, 0.11, options.quality === 'reduced' ? 0.34 : 0.18);
      dockGroup.add(plank);
    }
    const dockPostPositions = [
      [-1.25, -0.48], [1.25, -0.48], [-1.25, 0.48], [1.25, 0.48],
    ] as const;
    const renderedDockPostPositions = options.quality === 'reduced'
      ? dockPostPositions.slice(0, 2)
      : dockPostPositions;
    for (const [postIndex, [x, z]] of renderedDockPostPositions.entries()) {
      const post = staticMesh(
        boxGeometry,
        dockTimberMaterial,
        `inner-keep-canal-dock-post:${dock.dockId}:${postIndex}`,
      );
      post.position.set(x!, -0.12, z!);
      post.scale.set(0.14, 0.8, 0.14);
      dockGroup.add(post);
    }
    group.add(dockGroup);
  }

  const canalBoatCount = INNER_KEEP_CANAL_BOAT_BUDGETS[options.quality];
  const canalBoats: THREE.Group[] = [];
  for (let boatIndex = 0; boatIndex < canalBoatCount; boatIndex += 1) {
    const boat = new THREE.Group();
    boat.name = `inner-keep-canal-skiff:${boatIndex + 1}`;
    Object.assign(boat.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);
    presentationOnly(boat);
    const hull = staticMesh(
      boxGeometry,
      boatIndex % 2 === 0 ? dockTimberMaterial : dockWeatheredMaterial,
      `inner-keep-canal-skiff-hull:${boatIndex + 1}`,
    );
    hull.position.y = 0.04;
    hull.scale.set(0.68, 0.2, 1.45);
    boat.add(hull);
    for (const side of [-1, 1]) {
      const rail = staticMesh(
        boxGeometry,
        dockWeatheredMaterial,
        `inner-keep-canal-skiff-rail:${boatIndex + 1}:${side}`,
      );
      rail.position.set(
        side * INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.vesselBeamMeters * 0.42,
        0.25,
        0,
      );
      rail.scale.set(
        INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.vesselBeamMeters * 0.065,
        0.24,
        1.55,
      );
      boat.add(rail);
    }
    if (options.quality !== 'reduced') {
      const cargo = staticMesh(
        detailSphereGeometry,
        cargoMaterial,
        `inner-keep-canal-skiff-cargo:${boatIndex + 1}`,
      );
      cargo.position.set(0, 0.31, -0.28);
      cargo.scale.set(0.28, 0.22, 0.35);
      boat.add(cargo);
      const pole = staticMesh(
        boxGeometry,
        ropeMaterial,
        `inner-keep-canal-skiff-pole:${boatIndex + 1}`,
      );
      pole.position.set(0.28, 0.69, 0.3);
      pole.rotation.z = -0.12;
      pole.scale.set(0.045, 1.2, 0.045);
      boat.add(pole);
    }
    canalBoats.push(boat);
    group.add(boat);
  }

  const animals = INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS.slice(
    0,
    INNER_KEEP_VILLAGE_ANIMAL_BUDGETS[options.quality],
  );
  const animalBodies = new THREE.InstancedMesh(
    detailSphereGeometry,
    animalBodyMaterial,
    animals.length,
  );
  animalBodies.name = 'inner-keep-village-animal-bodies';
  const animalHeads = new THREE.InstancedMesh(
    detailSphereGeometry,
    animalBodyMaterial,
    animals.length,
  );
  animalHeads.name = 'inner-keep-village-animal-heads';
  const animalLegCount = options.quality === 'reduced'
    ? 0
    : animals.reduce((count, animal) => (
        count + (animal.species === 'goat' ? 4 : 2)
      ), 0);
  const animalLegs = new THREE.InstancedMesh(
    boxGeometry,
    animalDarkMaterial,
    animalLegCount,
  );
  animalLegs.name = 'inner-keep-village-animal-legs';
  const animalFeatures = new THREE.InstancedMesh(
    animalFeatureGeometry,
    animalFeatureMaterial,
    animals.length,
  );
  animalFeatures.name = 'inner-keep-village-animal-beaks-and-muzzles';
  for (const mesh of [animalBodies, animalHeads, animalLegs, animalFeatures]) {
    mesh.castShadow = options.quality !== 'reduced';
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    presentationOnly(mesh);
    group.add(mesh);
  }
  const animalMarkers: THREE.Group[] = [];
  animals.forEach((animal) => {
    const marker = new THREE.Group();
    marker.name = `inner-keep-village-animal:${animal.animalId}`;
    Object.assign(marker.userData, INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY);
    presentationOnly(marker);
    animalMarkers.push(marker);
    group.add(marker);
  });

  const smokeMatrix = new THREE.Matrix4();
  const smokeQuaternion = new THREE.Quaternion();
  const smokeScale = new THREE.Vector3();
  const smokePosition = new THREE.Vector3();
  const updateSmoke = (elapsedSeconds: number) => {
    smokeOrigins.forEach((origin, houseIndex) => {
      for (let puffIndex = 0; puffIndex < smokePuffsPerHouse; puffIndex += 1) {
        const index = houseIndex * smokePuffsPerHouse + puffIndex;
        const phase = (houseIndex * 0.173 + puffIndex * 0.48) % 1;
        const progress = (elapsedSeconds * 0.075 + phase) % 1;
        smokePosition.set(
          origin.x + Math.sin(elapsedSeconds * 0.24 + houseIndex) * 0.08 + progress * 0.22,
          origin.y + 0.16 + progress * 1.6,
          origin.z + Math.cos(elapsedSeconds * 0.19 + houseIndex * 0.7) * 0.06,
        );
        const scale = 0.2 + progress * 0.34;
        smokeScale.set(scale * 1.12, scale, scale * 0.92);
        smokeMatrix.compose(smokePosition, smokeQuaternion, smokeScale);
        smoke.setMatrixAt(index, smokeMatrix);
      }
    });
    smoke.instanceMatrix.needsUpdate = true;
  };

  const updateCanalBoats = (elapsedSeconds: number) => {
    canalBoats.forEach((boat, index) => {
      const phase = index * 0.83 + 0.18;
      const cycle = positiveModulo(elapsedSeconds * 0.018 + phase, 2);
      const progress = cycle <= 1 ? cycle : 2 - cycle;
      const sample = sampleCanalRoute(progress);
      boat.position.set(
        sample.x,
        sample.y + 0.12 + Math.sin(elapsedSeconds * 0.85 + index) * 0.018,
        sample.z,
      );
      boat.rotation.y = sample.heading + (cycle <= 1 ? 0 : Math.PI);
      boat.rotation.z = Math.sin(elapsedSeconds * 0.62 + index * 1.7) * 0.025;
    });
  };

  const animalBase = new THREE.Matrix4();
  const animalQuaternion = new THREE.Quaternion();
  const updateVillageAnimals = (elapsedSeconds: number) => {
    let legIndex = 0;
    animals.forEach((animal, animalIndex) => {
      const animalPose = sampleInnerKeepVillageAnimalPosition(animal, elapsedSeconds);
      const { x, z } = animalPose;
      const ground = terrainHeightAt(x, z);
      const heading = animalPose.headingRadians;
      animalQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      animalBase.compose(
        new THREE.Vector3(x, ground, z),
        animalQuaternion,
        new THREE.Vector3(1, 1, 1),
      );
      const goat = animal.species === 'goat';
      const bodyScale = goat
        ? [0.42, 0.3, 0.64] as const
        : animal.species === 'goose'
          ? [0.23, 0.24, 0.36] as const
          : [0.22, 0.2, 0.3] as const;
      const bodyY = goat ? 0.47 : 0.27;
      animalBodies.setMatrixAt(
        animalIndex,
        localTransform(animalBase, [0, bodyY, 0], bodyScale),
      );
      const bodyColor = new THREE.Color(
        INNER_KEEP_TOWN_TONAL_PALETTE.animals[animal.species],
      );
      animalBodies.setColorAt(animalIndex, bodyColor);
      animalHeads.setMatrixAt(
        animalIndex,
        localTransform(
          animalBase,
          [0, goat ? 0.65 : 0.43, goat ? 0.47 : 0.28],
          goat ? [0.27, 0.25, 0.3] : [0.16, 0.17, 0.18],
        ),
      );
      animalHeads.setColorAt(animalIndex, bodyColor.clone().offsetHSL(0, 0, 0.04));
      const legOffsets = goat
        ? [[-0.23, 0.21, -0.35], [0.23, 0.21, -0.35], [-0.23, 0.21, 0.35], [0.23, 0.21, 0.35]] as const
        : [[-0.08, 0.12, -0.02], [0.08, 0.12, -0.02]] as const;
      if (animalLegCount > 0) {
        for (const legOffset of legOffsets) {
          animalLegs.setMatrixAt(
            legIndex,
            localTransform(
              animalBase,
              legOffset,
              goat ? [0.07, 0.34, 0.07] : [0.035, 0.22, 0.035],
            ),
          );
          legIndex += 1;
        }
      }
      animalFeatures.setMatrixAt(
        animalIndex,
        localTransform(
          animalBase,
          [0, goat ? 0.62 : 0.4, goat ? 0.71 : 0.48],
          goat ? [0.13, 0.13, 0.2] : [0.09, 0.09, 0.18],
        ),
      );
      animalFeatures.setColorAt(
        animalIndex,
        new THREE.Color(goat
          ? INNER_KEEP_TOWN_TONAL_PALETTE.animals.dark
          : INNER_KEEP_TOWN_TONAL_PALETTE.animals.beak),
      );
      animalMarkers[animalIndex]!.position.set(x, ground, z);
      animalMarkers[animalIndex]!.rotation.y = heading;
    });
    for (const mesh of [animalBodies, animalHeads, animalLegs, animalFeatures]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const initialElapsed = options.reducedMotion ? 4.25 : 0;
  updateSmoke(initialElapsed);
  updateCanalBoats(initialElapsed);
  updateVillageAnimals(initialElapsed);
  for (const mesh of [animalBodies, animalHeads, animalFeatures]) {
    assertInnerKeepInstanceColorContract(mesh);
  }

  let disposed = false;
  return Object.freeze({
    group,
    rowHouseCount: houses.length,
    villageDetailCount,
    smokePuffCount,
    wetRutCount: wetRuts.length,
    graveMarkerCount: graveMarkers.length,
    graveyardFenceSegmentCount: renderedFenceSegments.length,
    canalBoatCount,
    canalDockCount: docks.length,
    villageAnimalCount: animals.length,
    villageBirdCount: animals.filter(({ species }) => species !== 'goat').length,
    livestockCount: animals.filter(({ species }) => species === 'goat').length,
    update: (elapsedSeconds) => {
      if (disposed || options.reducedMotion || !Number.isFinite(elapsedSeconds)) return false;
      const elapsed = Math.max(0, elapsedSeconds);
      updateSmoke(elapsed);
      updateCanalBoats(elapsed);
      updateVillageAnimals(elapsed);
      return true;
    },
    isAnimationActive: () => !disposed
      && !options.reducedMotion
      && (smokePuffCount + canalBoatCount + animals.length > 0),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      geometries.clear();
      materials.clear();
    },
  });
}
