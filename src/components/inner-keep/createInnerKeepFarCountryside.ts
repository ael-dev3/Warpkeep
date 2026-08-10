import * as THREE from 'three';

import {
  INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY,
  INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE,
  INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION,
  INNER_KEEP_FAR_COUNTRYSIDE_RADIAL_SEGMENTS,
  INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS,
} from './innerKeepFarCountrysidePolicy';
import {
  INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  createInnerKeepOuterWorldRenderedTerrainSampler,
  innerKeepOuterWorldTerrainBaseHeightAt,
} from './innerKeepOuterWorldPolicy';
import { INNER_KEEP_TOWN_TONAL_PALETTE } from './innerKeepTownAtmospherePolicy';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';

type CountrysideGrid = Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  widthSegments: number;
  depthSegments: number;
}>;

export type InnerKeepFarCountrysideRenderedTerrainSampler = Readonly<{
  quality: InnerKeepSceneQuality;
  heightAt: (x: number, z: number) => number;
}>;

export type InnerKeepFarCountryside = Readonly<{
  status: 'ready' | 'degraded';
  group: THREE.Group;
  terrainTriangleCount: number;
  triangleCount: number;
  drawCalls: number;
  fieldParcelCount: number;
  fieldTuftCount: number;
  hedgerowTreeCount: number;
  terrainHeightAt: (x: number, z: number) => number;
  setDetailedTerrainTint: (tint: THREE.ColorRepresentation) => void;
  stitchDetailedTerrainBoundaryNormals: (
    detailedTerrainGeometry: THREE.BufferGeometry,
  ) => void;
  dispose: () => void;
}>;

type InnerKeepFarCountrysideOwnedResources = Readonly<{
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  instancedMeshes: Set<THREE.InstancedMesh>;
}>;

function createOwnedResources(): InnerKeepFarCountrysideOwnedResources {
  return {
    geometries: new Set<THREE.BufferGeometry>(),
    materials: new Set<THREE.Material>(),
    instancedMeshes: new Set<THREE.InstancedMesh>(),
  };
}

function ownGeometry<T extends THREE.BufferGeometry>(
  resources: InnerKeepFarCountrysideOwnedResources,
  geometry: T,
) {
  resources.geometries.add(geometry);
  return geometry;
}

function ownMaterial<T extends THREE.Material>(
  resources: InnerKeepFarCountrysideOwnedResources,
  material: T,
) {
  resources.materials.add(material);
  return material;
}

function ownInstancedMesh<T extends THREE.InstancedMesh>(
  resources: InnerKeepFarCountrysideOwnedResources,
  mesh: T,
) {
  resources.instancedMeshes.add(mesh);
  return mesh;
}

function disposeOwnedResources(
  resources: InnerKeepFarCountrysideOwnedResources,
) {
  const dispose = (resource: Readonly<{ dispose: () => void }>) => {
    try {
      resource.dispose();
    } catch {
      // Cleanup is best-effort so one broken optional resource cannot retain
      // the rest of the presentation bundle or mask its original failure.
    }
  };
  resources.instancedMeshes.forEach(dispose);
  resources.geometries.forEach(dispose);
  resources.materials.forEach(dispose);
  resources.instancedMeshes.clear();
  resources.geometries.clear();
  resources.materials.clear();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep01(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function deterministicUnit(index: number, salt: number) {
  let value = (index + 1) ^ Math.imul(salt + 31, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function geometryTriangleCount(geometry: THREE.BufferGeometry) {
  return Math.floor(
    (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) /
      3,
  );
}

function countrysideGrids(
  quality: InnerKeepSceneQuality,
): readonly CountrysideGrid[] {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
  const [innerWidthSegments, innerDepthSegments] =
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].terrainSegments;
  const radialSegments = INNER_KEEP_FAR_COUNTRYSIDE_RADIAL_SEGMENTS[quality];
  const grid = (
    minimumX: number,
    maximumX: number,
    minimumZ: number,
    maximumZ: number,
    widthSegments: number,
    depthSegments: number,
  ): CountrysideGrid =>
    Object.freeze({
      minimumX,
      maximumX,
      minimumZ,
      maximumZ,
      widthSegments,
      depthSegments,
    });
  return Object.freeze([
    grid(-outerX, -innerX, -innerZ, innerZ, radialSegments, innerDepthSegments),
    grid(innerX, outerX, -innerZ, innerZ, radialSegments, innerDepthSegments),
    grid(-innerX, innerX, -outerZ, -innerZ, innerWidthSegments, radialSegments),
    grid(-innerX, innerX, innerZ, outerZ, innerWidthSegments, radialSegments),
    grid(-outerX, -innerX, -outerZ, -innerZ, radialSegments, radialSegments),
    grid(innerX, outerX, -outerZ, -innerZ, radialSegments, radialSegments),
    grid(-outerX, -innerX, innerZ, outerZ, radialSegments, radialSegments),
    grid(innerX, outerX, innerZ, outerZ, radialSegments, radialSegments),
  ]);
}

function gridForPoint(quality: InnerKeepSceneQuality, x: number, z: number) {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const grids = countrysideGrids(quality);
  if (x <= -innerX)
    return z <= -innerZ ? grids[4]! : z >= innerZ ? grids[6]! : grids[0]!;
  if (x >= innerX)
    return z <= -innerZ ? grids[5]! : z >= innerZ ? grids[7]! : grids[1]!;
  if (z <= -innerZ) return grids[2]!;
  if (z >= innerZ) return grids[3]!;
  return null;
}

function sampleGridHeight(
  grid: CountrysideGrid,
  x: number,
  z: number,
  vertexHeightAt: (x: number, z: number) => number,
) {
  const widthStep = (grid.maximumX - grid.minimumX) / grid.widthSegments;
  const depthStep = (grid.maximumZ - grid.minimumZ) / grid.depthSegments;
  const gridX = clamp((x - grid.minimumX) / widthStep, 0, grid.widthSegments);
  const gridZ = clamp((z - grid.minimumZ) / depthStep, 0, grid.depthSegments);
  const cellX = Math.min(grid.widthSegments - 1, Math.floor(gridX));
  const cellZ = Math.min(grid.depthSegments - 1, Math.floor(gridZ));
  const localX = gridX - cellX;
  const localZ = gridZ - cellZ;
  const height = (widthIndex: number, depthIndex: number) =>
    Math.fround(
      vertexHeightAt(
        grid.minimumX + widthIndex * widthStep,
        grid.minimumZ + depthIndex * depthStep,
      ),
    );
  const height00 = height(cellX, cellZ);
  const height01 = height(cellX, cellZ + 1);
  const height10 = height(cellX + 1, cellZ);
  const height11 = height(cellX + 1, cellZ + 1);
  return localX + localZ <= 1
    ? height00 + localX * (height10 - height00) + localZ * (height01 - height00)
    : height11 +
        (1 - localX) * (height01 - height11) +
        (1 - localZ) * (height10 - height11);
}

export function createInnerKeepFarCountrysideRenderedTerrainSampler(
  quality: InnerKeepSceneQuality,
): InnerKeepFarCountrysideRenderedTerrainSampler {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
  const detailedTerrain =
    createInnerKeepOuterWorldRenderedTerrainSampler(quality);
  const vertexHeightAt = (x: number, z: number) => {
    const clampedX = clamp(x, -innerX, innerX);
    const clampedZ = clamp(z, -innerZ, innerZ);
    const outsideDistance = Math.hypot(x - clampedX, z - clampedZ);
    const baseHeight = innerKeepOuterWorldTerrainBaseHeightAt(x, z);
    if (
      outsideDistance >= INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS
    ) {
      return baseHeight;
    }
    const seamCorrection =
      detailedTerrain.heightAt(clampedX, clampedZ) -
      innerKeepOuterWorldTerrainBaseHeightAt(clampedX, clampedZ);
    const correctionStrength =
      1 -
      smoothstep01(
        outsideDistance / INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS,
      );
    return clamp(
      baseHeight + seamCorrection * correctionStrength,
      INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum,
      INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum,
    );
  };
  const heightAt = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const clampedX = clamp(x, -outerX, outerX);
    const clampedZ = clamp(z, -outerZ, outerZ);
    const grid = gridForPoint(quality, clampedX, clampedZ);
    return grid
      ? sampleGridHeight(grid, clampedX, clampedZ, vertexHeightAt)
      : innerKeepOuterWorldTerrainBaseHeightAt(clampedX, clampedZ);
  };
  return Object.freeze({ quality, heightAt });
}

function fieldColorAt(
  x: number,
  z: number,
  height: number,
  parcels: Set<string>,
) {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
  const lowland = new THREE.Color(
    INNER_KEEP_TOWN_TONAL_PALETTE.terrain.lowland,
  );
  const meadow = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.terrain.meadow);
  const ridge = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.terrain.ridge);
  const fog = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.skyFog);
  const meadowMix = clamp((height + 0.1) / 1.15, 0, 1);
  const ridgeMix = clamp((height - 1.15) / 2.15, 0, 1);
  const color = lowland.lerp(meadow, meadowMix).lerp(ridge, ridgeMix);
  const variation = Math.sin(x * 0.72 + z * 0.39) * 0.025;
  color.offsetHSL(variation, 0, variation * 0.45);

  const parcelX = Math.floor((x + outerX) / 14);
  const parcelZ = Math.floor((z + outerZ) / 16);
  const parcelKey = `${parcelX}:${parcelZ}`;
  parcels.add(parcelKey);
  const parcelHash =
    (Math.imul(parcelX + 101, 73_856_093) ^
      Math.imul(parcelZ + 211, 19_349_663)) >>>
    0;
  const fieldColor = new THREE.Color(
    INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE[
      parcelHash % INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE.length
    ]!,
  );
  const outsideDistance = Math.max(
    Math.abs(x) - innerX,
    Math.abs(z) - innerZ,
    0,
  );
  const fieldTransition = smoothstep01(outsideDistance / 10);
  color.lerp(fieldColor, fieldTransition * 0.58);
  const furrow =
    (parcelHash & 1) === 0
      ? Math.sin(x * 0.84 + parcelZ * 0.73)
      : Math.sin(z * 0.76 + parcelX * 0.67);
  color.offsetHSL(
    furrow * 0.006 * fieldTransition,
    0,
    furrow * 0.012 * fieldTransition,
  );

  const edgeDistance = Math.min(outerX - Math.abs(x), outerZ - Math.abs(z));
  const edgeFade = smoothstep01(
    1 - edgeDistance / INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS,
  );
  return color.lerp(fog, edgeFade);
}

function createFarTerrainGeometry(
  quality: InnerKeepSceneQuality,
  resources: InnerKeepFarCountrysideOwnedResources,
) {
  const sampler = createInnerKeepFarCountrysideRenderedTerrainSampler(quality);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const parcels = new Set<string>();
  for (const grid of countrysideGrids(quality)) {
    const firstVertex = positions.length / 3;
    for (
      let depthIndex = 0;
      depthIndex <= grid.depthSegments;
      depthIndex += 1
    ) {
      const z = THREE.MathUtils.lerp(
        grid.minimumZ,
        grid.maximumZ,
        depthIndex / grid.depthSegments,
      );
      for (
        let widthIndex = 0;
        widthIndex <= grid.widthSegments;
        widthIndex += 1
      ) {
        const x = THREE.MathUtils.lerp(
          grid.minimumX,
          grid.maximumX,
          widthIndex / grid.widthSegments,
        );
        const y = sampler.heightAt(x, z);
        positions.push(x, y, z);
        fieldColorAt(x, z, y, parcels).toArray(colors, colors.length);
      }
    }
    const rowLength = grid.widthSegments + 1;
    for (let depthIndex = 0; depthIndex < grid.depthSegments; depthIndex += 1) {
      for (
        let widthIndex = 0;
        widthIndex < grid.widthSegments;
        widthIndex += 1
      ) {
        const offset = firstVertex + depthIndex * rowLength + widthIndex;
        const nextRow = offset + rowLength;
        indices.push(offset, nextRow, offset + 1);
        indices.push(nextRow, nextRow + 1, offset + 1);
      }
    }
  }
  const geometry = ownGeometry(resources, new THREE.BufferGeometry());
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.innerKeepFarFieldParcelCount = parcels.size;
  return Object.freeze({ geometry, sampler, fieldParcelCount: parcels.size });
}

function terrainSlopeAt(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
) {
  const step = 0.5;
  return Math.hypot(
    (heightAt(x + step, z) - heightAt(x - step, z)) / (step * 2),
    (heightAt(x, z + step) - heightAt(x, z - step)) / (step * 2),
  );
}

function insideFarPlantingEnvelope(x: number, z: number, support: number) {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
  const beyondDetailedEstate =
    Math.abs(x) >= innerX + support || Math.abs(z) >= innerZ + support;
  return (
    beyondDetailedEstate &&
    Math.abs(x) <=
      outerX - INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS - support &&
    Math.abs(z) <=
      outerZ - INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS - support
  );
}

function createFieldTufts(
  quality: InnerKeepSceneQuality,
  terrainHeightAt: (x: number, z: number) => number,
  resources: InnerKeepFarCountrysideOwnedResources,
) {
  const targetCount = INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS[quality];
  const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
  const placements: Array<
    Readonly<{
      x: number;
      y: number;
      z: number;
      yaw: number;
      width: number;
      height: number;
      color: number;
    }>
  > = [];
  for (let attempt = 0; attempt < targetCount * 80; attempt += 1) {
    if (placements.length >= targetCount) break;
    const x = -outerX + deterministicUnit(attempt, 401) * outerX * 2;
    const z = -outerZ + deterministicUnit(attempt, 409) * outerZ * 2;
    if (!insideFarPlantingEnvelope(x, z, 0.4)) continue;
    if (terrainSlopeAt(terrainHeightAt, x, z) > 0.38) continue;
    const height = 0.72 + deterministicUnit(attempt, 419) * 0.54;
    placements.push(
      Object.freeze({
        x,
        y: terrainHeightAt(x, z),
        z,
        yaw: deterministicUnit(attempt, 421) * Math.PI,
        width: 0.82 + deterministicUnit(attempt, 431) * 0.58,
        height,
        color:
          INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE[
            Math.floor(
              deterministicUnit(attempt, 433) *
                INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE.length,
            )
          ]!,
      }),
    );
  }
  const geometry = ownGeometry(
    resources,
    new THREE.ConeGeometry(0.09, 0.34, 3),
  );
  const material = ownMaterial(
    resources,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
      vertexColors: false,
    }),
  );
  const mesh = ownInstancedMesh(
    resources,
    new THREE.InstancedMesh(geometry, material, placements.length),
  );
  mesh.name = 'inner-keep-far-countryside-field-tufts';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  placements.forEach((placement, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
    matrix.compose(
      new THREE.Vector3(
        placement.x,
        placement.y + 0.17 * placement.height,
        placement.z,
      ),
      quaternion,
      new THREE.Vector3(placement.width, placement.height, placement.width),
    );
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(placement.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return Object.freeze({ mesh, geometry, material, count: placements.length });
}

function createHedgerowTrees(
  quality: InnerKeepSceneQuality,
  terrainHeightAt: (x: number, z: number) => number,
  resources: InnerKeepFarCountrysideOwnedResources,
) {
  const targetCount = INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS[quality];
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const placements: Array<
    Readonly<{
      x: number;
      y: number;
      z: number;
      yaw: number;
      scale: number;
      crownColor: number;
    }>
  > = [];
  for (let attempt = 0; attempt < targetCount * 96; attempt += 1) {
    if (placements.length >= targetCount) break;
    const across = deterministicUnit(attempt, 503);
    const depth = deterministicUnit(attempt, 509);
    const band = attempt % 4;
    const lateralX = -innerX + 4 + across * (innerX * 2 - 8);
    const lateralZ = -innerZ + 4 + across * (innerZ * 2 - 8);
    const x =
      band === 0
        ? -innerX - 8 - depth * 30
        : band === 1
          ? innerX + 8 + depth * 30
          : lateralX;
    const z =
      band === 2
        ? -innerZ - 8 - depth * 30
        : band === 3
          ? innerZ + 8 + depth * 30
          : lateralZ;
    const scale = 2.35 + deterministicUnit(attempt, 521) * 1.25;
    if (!insideFarPlantingEnvelope(x, z, 0.7 * scale)) continue;
    if (terrainSlopeAt(terrainHeightAt, x, z) > 0.42) continue;
    if (
      placements.some(
        (placement) => Math.hypot(placement.x - x, placement.z - z) < 4.6,
      )
    )
      continue;
    placements.push(
      Object.freeze({
        x,
        y: terrainHeightAt(x, z),
        z,
        yaw: deterministicUnit(attempt, 523) * Math.PI * 2,
        scale,
        crownColor: [0x466d3f, 0x5c8049, 0x6d8d52][
          Math.floor(deterministicUnit(attempt, 541) * 3)
        ]!,
      }),
    );
  }
  const trunkGeometry = ownGeometry(
    resources,
    new THREE.CylinderGeometry(0.07, 0.11, 0.55, 5),
  );
  const crownGeometry = ownGeometry(
    resources,
    new THREE.ConeGeometry(0.34, 0.7, 7),
  );
  const trunkMaterial = ownMaterial(
    resources,
    new THREE.MeshStandardMaterial({
      color: 0x6a4b31,
      roughness: 0.96,
    }),
  );
  const crownMaterial = ownMaterial(
    resources,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      vertexColors: false,
    }),
  );
  const trunks = ownInstancedMesh(
    resources,
    new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length),
  );
  const crowns = ownInstancedMesh(
    resources,
    new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length),
  );
  trunks.name = 'inner-keep-far-countryside-hedgerow-trunks';
  crowns.name = 'inner-keep-far-countryside-hedgerow-crowns';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  placements.forEach((placement, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
    matrix.compose(
      new THREE.Vector3(
        placement.x,
        placement.y + 0.275 * placement.scale - 0.08,
        placement.z,
      ),
      quaternion,
      new THREE.Vector3(placement.scale, placement.scale, placement.scale),
    );
    trunks.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(
        placement.x,
        placement.y + 0.8 * placement.scale - 0.06,
        placement.z,
      ),
      quaternion,
      new THREE.Vector3(placement.scale, placement.scale, placement.scale),
    );
    crowns.setMatrixAt(index, matrix);
    crowns.setColorAt(index, color.setHex(placement.crownColor));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  return Object.freeze({
    trunks,
    crowns,
    trunkGeometry,
    crownGeometry,
    trunkMaterial,
    crownMaterial,
    count: placements.length,
  });
}

function disableAuthorityAndPicking(root: THREE.Object3D) {
  root.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.pickable = false;
    object.castShadow = false;
    object.receiveShadow = false;
    if (object instanceof THREE.Mesh) object.raycast = () => undefined;
  });
}

function stitchBoundaryNormals(
  detailedTerrainGeometry: THREE.BufferGeometry,
  farTerrainGeometry: THREE.BufferGeometry,
) {
  const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
  const seamEntries = new Map<
    string,
    Array<
      Readonly<{
        normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        index: number;
      }>
    >
  >();
  const collect = (geometry: THREE.BufferGeometry) => {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal) return;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      if (
        Math.abs(Math.abs(x) - innerX) > 0.000_01 &&
        Math.abs(Math.abs(z) - innerZ) > 0.000_01
      )
        continue;
      const key = `${x.toFixed(5)}:${z.toFixed(5)}`;
      const entries = seamEntries.get(key) ?? [];
      entries.push(Object.freeze({ normal, index }));
      seamEntries.set(key, entries);
    }
  };
  collect(detailedTerrainGeometry);
  collect(farTerrainGeometry);
  const average = new THREE.Vector3();
  for (const entries of seamEntries.values()) {
    if (entries.length < 2) continue;
    average.set(0, 0, 0);
    for (const { normal, index } of entries) {
      average.add(
        new THREE.Vector3(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index),
        ),
      );
    }
    average.normalize();
    for (const { normal, index } of entries) {
      normal.setXYZ(index, average.x, average.y, average.z);
      normal.needsUpdate = true;
    }
  }
}

export function createInnerKeepFarCountryside(
  quality: InnerKeepSceneQuality,
): InnerKeepFarCountryside {
  const group = new THREE.Group();
  const resources = createOwnedResources();
  group.name = 'inner-keep-far-countryside-root';
  group.userData.innerKeepFarCountrysidePolicyVersion =
    INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION;
  group.userData.innerKeepFarCountrysideAuthority =
    INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY;
  try {
    const terrain = createFarTerrainGeometry(quality, resources);
    const terrainMaterial = ownMaterial(
      resources,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.99,
        metalness: 0,
      }),
    );
    const terrainMesh = new THREE.Mesh(terrain.geometry, terrainMaterial);
    terrainMesh.name = 'inner-keep-far-countryside-field-overscan';
    terrainMesh.receiveShadow = true;
    const fieldTufts = createFieldTufts(
      quality,
      terrain.sampler.heightAt,
      resources,
    );
    const hedgerows = createHedgerowTrees(
      quality,
      terrain.sampler.heightAt,
      resources,
    );
    group.add(terrainMesh, fieldTufts.mesh, hedgerows.trunks, hedgerows.crowns);
    disableAuthorityAndPicking(group);
    const terrainTriangleCount = geometryTriangleCount(terrain.geometry);
    const terrainPositions = terrain.geometry.getAttribute('position');
    const terrainColors = terrain.geometry.getAttribute('color');
    const baseTerrainColors = new Float32Array(terrainColors.array);
    const tintColor = new THREE.Color();
    const white = new THREE.Color(0xffffff);
    const baseColor = new THREE.Color();
    const appliedColor = new THREE.Color();
    const triangleCount =
      terrainTriangleCount +
      geometryTriangleCount(fieldTufts.geometry) * fieldTufts.count +
      (geometryTriangleCount(hedgerows.trunkGeometry) +
        geometryTriangleCount(hedgerows.crownGeometry)) *
        hedgerows.count;
    let disposed = false;
    return Object.freeze({
      status:
        fieldTufts.count ===
          INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS[quality] &&
        hedgerows.count ===
          INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS[quality]
          ? 'ready'
          : 'degraded',
      group,
      terrainTriangleCount,
      triangleCount,
      drawCalls: 4,
      fieldParcelCount: terrain.fieldParcelCount,
      fieldTuftCount: fieldTufts.count,
      hedgerowTreeCount: hedgerows.count,
      terrainHeightAt: terrain.sampler.heightAt,
      setDetailedTerrainTint: (tint) => {
        tintColor.set(tint);
        for (let index = 0; index < terrainPositions.count; index += 1) {
          const x = terrainPositions.getX(index);
          const z = terrainPositions.getZ(index);
          const outsideDistance = Math.max(
            Math.abs(x) -
              INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS[0],
            Math.abs(z) -
              INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS[1],
            0,
          );
          const strength =
            1 -
            smoothstep01(
              outsideDistance / INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS,
            );
          baseColor.fromArray(baseTerrainColors, index * 3);
          appliedColor
            .copy(white)
            .lerp(tintColor, strength)
            .multiply(baseColor);
          terrainColors.setXYZ(
            index,
            appliedColor.r,
            appliedColor.g,
            appliedColor.b,
          );
        }
        terrainColors.needsUpdate = true;
      },
      stitchDetailedTerrainBoundaryNormals: (detailedTerrainGeometry) => {
        stitchBoundaryNormals(detailedTerrainGeometry, terrain.geometry);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeOwnedResources(resources);
        group.clear();
      },
    });
  } catch (error: unknown) {
    disposeOwnedResources(resources);
    group.clear();
    throw error;
  }
}

/** Fail-soft result used when optional horizon construction cannot complete. */
export function createEmptyInnerKeepFarCountryside(): InnerKeepFarCountryside {
  const group = new THREE.Group();
  group.name = 'inner-keep-far-countryside-unavailable';
  group.userData.innerKeepFarCountrysidePolicyVersion =
    INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION;
  group.userData.innerKeepFarCountrysideAuthority =
    INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY;
  disableAuthorityAndPicking(group);
  let disposed = false;
  return Object.freeze({
    status: 'degraded',
    group,
    terrainTriangleCount: 0,
    triangleCount: 0,
    drawCalls: 0,
    fieldParcelCount: 0,
    fieldTuftCount: 0,
    hedgerowTreeCount: 0,
    terrainHeightAt: innerKeepOuterWorldTerrainBaseHeightAt,
    setDetailedTerrainTint: () => undefined,
    stitchDetailedTerrainBoundaryNormals: () => undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.clear();
    },
  });
}

export function innerKeepFarCountrysideTerrainHeightIsBounded(height: number) {
  return (
    Number.isFinite(height) &&
    height >= INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum &&
    height <= INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum
  );
}
