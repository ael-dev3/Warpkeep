import * as THREE from 'three';

import { innerKeepOuterWorldTerrainHeightAt } from './innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSES,
  INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY,
  INNER_KEEP_TOWN_TONAL_PALETTE,
  INNER_KEEP_WET_RUT_BUDGETS,
  INNER_KEEP_WET_RUT_PLACEMENTS,
} from './innerKeepTownAtmospherePolicy';

export type InnerKeepTownAtmosphereQuality =
  keyof typeof INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS;

export type InnerKeepTownAtmosphere = Readonly<{
  group: THREE.Group;
  rowHouseCount: number;
  smokePuffCount: number;
  wetRutCount: number;
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

function presentationOnly(object: THREE.Object3D) {
  object.userData.presentationOnly = true;
  object.userData.gameplayAuthorityClaimed = false;
  object.userData.authoritativeBuilding = false;
  object.raycast = () => undefined;
  return object;
}

function finalizeStaticInstances(mesh: THREE.InstancedMesh) {
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

/**
 * Builds a cheap, deterministic ward that reads as housing without reusing any
 * build-catalogue silhouette or inventing a gameplay structure.
 */
export function createInnerKeepTownAtmosphere(options: Readonly<{
  quality: InnerKeepTownAtmosphereQuality;
  reducedMotion: boolean;
}>): InnerKeepTownAtmosphere {
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
  const rutGeometry = new THREE.CircleGeometry(
    1,
    options.quality === 'reduced' ? 12 : 20,
  );
  rutGeometry.rotateX(-Math.PI / 2);
  geometries.add(boxGeometry);
  geometries.add(roofGeometry);
  geometries.add(smokeGeometry);
  geometries.add(rutGeometry);

  const plasterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    vertexColors: true,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    vertexColors: true,
  });
  const timberMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.timber,
    roughness: 0.97,
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
  materials.add(plasterMaterial);
  materials.add(roofMaterial);
  materials.add(timberMaterial);
  materials.add(windowMaterial);
  materials.add(smokeMaterial);
  materials.add(wetRutMaterial);

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
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, houses.length);
  roofs.name = 'inner-keep-lower-ward-crooked-gables';
  const timberPieceCount = 7;
  const timbers = new THREE.InstancedMesh(
    boxGeometry,
    timberMaterial,
    houses.length * timberPieceCount,
  );
  timbers.name = 'inner-keep-lower-ward-dark-timbers';
  const windows = new THREE.InstancedMesh(
    boxGeometry,
    windowMaterial,
    houses.length * 2,
  );
  windows.name = 'inner-keep-lower-ward-warm-windows';
  bodies.castShadow = options.quality !== 'reduced';
  bodies.receiveShadow = true;
  roofs.castShadow = options.quality !== 'reduced';
  roofs.receiveShadow = true;
  timbers.castShadow = options.quality === 'high';
  timbers.receiveShadow = true;
  windows.castShadow = false;
  windows.receiveShadow = false;

  const smokeOrigins: THREE.Vector3[] = [];
  houses.forEach((house, houseIndex) => {
    const [x, z] = house.positionMeters;
    const ground = innerKeepOuterWorldTerrainHeightAt(x, z);
    const rotation = house.rotationMilliDegrees * Math.PI / 180_000;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation,
    );
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(x, ground + 0.02, z),
      quaternion,
      new THREE.Vector3(1, house.heightScale, 1),
    );
    const plaster = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.plaster[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.plaster.length
    ]!;
    const roof = INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.roof[
      house.styleIndex % INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.roof.length
    ]!;
    const bodyIndex = houseIndex * 2;
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

    const timberPieces: readonly Readonly<{
      position: readonly [number, number, number];
      scale: readonly [number, number, number];
    }>[] = [
      { position: [-1.06, 1.7, 0.875], scale: [0.1, 1.7, 0.09] },
      { position: [0, 1.7, 0.875], scale: [0.09, 1.7, 0.09] },
      { position: [1.06, 1.7, 0.875], scale: [0.1, 1.7, 0.09] },
      { position: [0, 1.28, 0.875], scale: [2.44, 0.09, 0.09] },
      { position: [0, 2.08, 0.875], scale: [2.58, 0.1, 0.09] },
      { position: [0.64, 0.58, 0.79], scale: [0.54, 1.08, 0.1] },
      { position: [-0.72, 2.68, -0.25], scale: [0.28, 0.68, 0.28] },
    ];
    timberPieces.forEach((piece, pieceIndex) => {
      timbers.setMatrixAt(
        houseIndex * timberPieceCount + pieceIndex,
        localTransform(base, piece.position, piece.scale),
      );
    });
    for (const [windowIndex, windowX] of [-0.67, 0.67].entries()) {
      windows.setMatrixAt(
        houseIndex * 2 + windowIndex,
        localTransform(base, [windowX, 1.7, 0.915], [0.36, 0.43, 0.045]),
      );
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
  finalizeStaticInstances(bodies);
  finalizeStaticInstances(roofs);
  finalizeStaticInstances(timbers);
  finalizeStaticInstances(windows);
  group.add(bodies, roofs, timbers, windows);

  const smokePuffsPerHouse = options.quality === 'reduced' ? 1 : 2;
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
  const rutMesh = new THREE.InstancedMesh(rutGeometry, wetRutMaterial, wetRuts.length);
  rutMesh.name = 'inner-keep-rain-darkened-wheel-ruts';
  rutMesh.castShadow = false;
  rutMesh.receiveShadow = true;
  rutMesh.renderOrder = 3;
  const rutQuaternion = new THREE.Quaternion();
  wetRuts.forEach((rut, index) => {
    const [x, z] = rut.positionMeters;
    rutQuaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rut.rotationMilliDegrees * Math.PI / 180_000,
    );
    rutMesh.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(
        x,
        innerKeepOuterWorldTerrainHeightAt(x, z) + rut.surfaceLiftMeters,
        z,
      ),
      rutQuaternion,
      new THREE.Vector3(rut.radiiMeters[0], 1, rut.radiiMeters[1]),
    ));
  });
  finalizeStaticInstances(rutMesh);
  group.add(rutMesh);

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
  updateSmoke(options.reducedMotion ? 0.35 : 0);

  let disposed = false;
  return Object.freeze({
    group,
    rowHouseCount: houses.length,
    smokePuffCount,
    wetRutCount: wetRuts.length,
    update: (elapsedSeconds) => {
      if (disposed || options.reducedMotion || !Number.isFinite(elapsedSeconds)) return false;
      updateSmoke(Math.max(0, elapsedSeconds));
      return true;
    },
    isAnimationActive: () => !disposed && !options.reducedMotion && smokePuffCount > 0,
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
