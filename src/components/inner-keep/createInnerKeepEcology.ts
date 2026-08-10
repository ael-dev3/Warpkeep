import * as THREE from 'three';

import { INNER_KEEP_LAYOUT_V1_SLOTS } from './innerKeepLayoutV1';
import { INNER_KEEP_AMBIENT_ROUTES } from './innerKeepAmbientPolicy';
import {
  INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS,
  type InnerKeepFixedPlacementExclusion,
} from './innerKeepFixedPlacementExclusions';
import { INNER_KEEP_PRESENTATION_CLEARANCES } from './innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_LAKE,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE,
  innerKeepCityDistrictRoadEdgeDistance,
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
} from './innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_TOWN_TONAL_PALETTE,
} from './innerKeepTownAtmospherePolicy';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';

export const INNER_KEEP_GRASS_BUDGET = Object.freeze({
  high: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.grassBlades,
  balanced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.grassBlades,
  reduced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.grassBlades,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

/** Backward-compatible names now covering the connected outer watercourse. */
export const INNER_KEEP_WATER_CENTERLINE = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE;
export const INNER_KEEP_WATER_POND = INNER_KEEP_OUTER_WORLD_LAKE;

export const INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS = 0.1;

export type InnerKeepFixedEcologyExclusion = InnerKeepFixedPlacementExclusion;

/** Backward-compatible ecology name for the canonical shared fixed bounds. */
export const INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS =
  INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS;

export type InnerKeepEcology = Readonly<{
  group: THREE.Group;
  grassBladeCount: number;
  waterSurfaceCount: number;
  update: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  dispose: () => void;
}>;

function disposeInstancedMeshBuffers(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
}

function deterministicUnit(index: number, salt: number) {
  let value = (index + 1) ^ Math.imul(salt + 31, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function insideRoundedBox(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  return Math.abs(x - centerX) <= halfWidth && Math.abs(z - centerZ) <= halfDepth;
}

function distanceToSegment(
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
) {
  const deltaX = toX - fromX;
  const deltaZ = toZ - fromZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress = lengthSquared <= 0.000_001
    ? 0
    : Math.max(0, Math.min(1, (
        (x - fromX) * deltaX + (z - fromZ) * deltaZ
      ) / lengthSquared));
  return Math.hypot(
    x - (fromX + deltaX * progress),
    z - (fromZ + deltaZ * progress),
  );
}

const AMBIENT_ROUTE_SEGMENTS = Object.freeze(INNER_KEEP_AMBIENT_ROUTES.flatMap((route) => {
  const points = route.path.points;
  const segmentCount = route.path.closed ? points.length : points.length - 1;
  const clearance = route.actorRadiusMeters + 0.34;
  return Array.from({ length: segmentCount }, (_, index) => {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    return Object.freeze({
      from,
      to,
      clearance,
      minimumX: Math.min(from.x, to.x) - clearance,
      maximumX: Math.max(from.x, to.x) + clearance,
      minimumZ: Math.min(from.z, to.z) - clearance,
      maximumZ: Math.max(from.z, to.z) + clearance,
    });
  });
}));

function overlapsAmbientRoute(x: number, z: number) {
  return AMBIENT_ROUTE_SEGMENTS.some((segment) => (
    x >= segment.minimumX
    && x <= segment.maximumX
    && z >= segment.minimumZ
    && z <= segment.maximumZ
    && distanceToSegment(
      x,
      z,
      segment.from.x,
      segment.from.z,
      segment.to.x,
      segment.to.z,
    ) < segment.clearance
  ));
}

function grassCandidateIsClear(x: number, z: number) {
  const [outerHalfWidth, outerHalfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  if (Math.abs(x) > outerHalfWidth - 0.4 || Math.abs(z) > outerHalfDepth - 0.4) {
    return false;
  }
  const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
  const insideInnerKeepEcologyArea = x >= wall.westX
    && x <= wall.eastX
    && z >= wall.northZ
    && z <= wall.southZ;
  if (
    insideInnerKeepEcologyArea
    && (
      Math.abs(x - INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthCenterX)
        < INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthHalfWidth + 0.5
      || Math.abs(z - INNER_KEEP_PRESENTATION_CLEARANCES.road.eastWestCenterZ)
        < INNER_KEEP_PRESENTATION_CLEARANCES.road.eastWestHalfWidth + 0.38
    )
  ) return false;
  if (innerKeepCityDistrictRoadEdgeDistance(x, z) < 0.34) return false;
  if (INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS.some((exclusion) => (
    !exclusion.isRoadSurface
    && insideRoundedBox(
      x,
      z,
      exclusion.center.x,
      exclusion.center.z,
      exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters,
      exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters,
    )
  ))) return false;
  if (INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.some((exclusion) => (
    insideRoundedBox(
      x,
      z,
      exclusion.center.x,
      exclusion.center.z,
      exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters,
      exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters,
    )
  ))) return false;
  if (overlapsAmbientRoute(x, z)) return false;
  for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
    const slotX = Number(slot.localXMicrounits) / 1_000_000;
    const slotZ = Number(slot.localZMicrounits) / 1_000_000;
    const angle = -slot.rotationMilliDegrees * Math.PI / 180_000;
    const deltaX = x - slotX;
    const deltaZ = z - slotZ;
    const localX = deltaX * Math.cos(angle) - deltaZ * Math.sin(angle);
    const localZ = deltaX * Math.sin(angle) + deltaZ * Math.cos(angle);
    const halfExtents = slot.footprintClass === 'large'
      ? INNER_KEEP_PRESENTATION_CLEARANCES.slot.largeReservedHalfExtents
      : INNER_KEEP_PRESENTATION_CLEARANCES.slot.mediumHalfExtents;
    if (insideRoundedBox(
      localX,
      localZ,
      0,
      0,
      halfExtents[0] + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer,
      halfExtents[1] + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer,
    )) return false;
  }
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  const isInsideCompoundPlateau = x >= plateau.minimumX
    && x <= plateau.maximumX
    && z >= plateau.minimumZ
    && z <= plateau.maximumZ;
  return isInsideCompoundPlateau
    ? true
    : innerKeepOuterWorldPointIsClear(x, z, 0.08);
}

function createCrossedGrassBladeGeometry() {
  const halfBase = 0.105;
  const halfMiddle = 0.062;
  const halfTip = 0.012;
  const middleY = 0.36;
  const tipY = 0.72;
  const positions = [
    -halfBase, 0, 0,
    halfBase, 0, 0,
    -halfMiddle, middleY, 0,
    halfMiddle, middleY, 0,
    -halfTip, tipY, 0,
    halfTip, tipY, 0,
    0, 0, -halfBase,
    0, 0, halfBase,
    0, middleY, -halfMiddle,
    0, middleY, halfMiddle,
    0, tipY, -halfTip,
    0, tipY, halfTip,
  ];
  const indices = [
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
    3, 5, 4,
    6, 8, 7,
    7, 8, 9,
    8, 10, 9,
    9, 10, 11,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGrass(
  quality: InnerKeepSceneQuality,
  seed: number,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const bladeCount = INNER_KEEP_GRASS_BUDGET[quality];
  const geometry = createCrossedGrassBladeGeometry();
  geometries.add(geometry);
  const windTime = { value: 0 };
  const material = new THREE.MeshBasicMaterial({
    // Unlit foliage keeps each tiny crossed blade readable at the overview camera.
    color: INNER_KEEP_TOWN_TONAL_PALETTE.foliage.grass,
    side: THREE.DoubleSide,
    toneMapped: true,
    vertexColors: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.innerKeepWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float innerKeepWindTime;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 innerKeepGrassOrigin = vec3(instanceMatrix[3]);
          float innerKeepGrassTip = smoothstep(0.04, 0.72, position.y);
          float innerKeepGrassWave = sin(
            innerKeepWindTime * 1.55
            + innerKeepGrassOrigin.x * 0.73
            + innerKeepGrassOrigin.z * 0.51
          );
          transformed.x += innerKeepGrassWave * 0.085 * innerKeepGrassTip;
          transformed.z += cos(innerKeepWindTime * 1.08 + innerKeepGrassOrigin.z) * 0.035 * innerKeepGrassTip;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'inner-keep-dense-grass-wind-v1';
  materials.add(material);
  const grass = new THREE.InstancedMesh(geometry, material, bladeCount);
  grass.name = 'inner-keep-dense-grass';
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let accepted = 0;
  let attempt = 0;
  const [outerHalfWidth, outerHalfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  while (accepted < bladeCount && attempt < bladeCount * 24) {
    const x = -outerHalfWidth + 0.45
      + deterministicUnit(attempt, seed + 1) * (outerHalfWidth * 2 - 0.9);
    const z = -outerHalfDepth + 0.45
      + deterministicUnit(attempt, seed + 2) * (outerHalfDepth * 2 - 0.9);
    attempt += 1;
    if (!grassCandidateIsClear(x, z)) continue;
    const height = 0.58 + deterministicUnit(attempt, seed + 3) * 0.5;
    const width = 0.78 + deterministicUnit(attempt, seed + 4) * 0.46;
    position.set(x, innerKeepOuterWorldTerrainHeightAt(x, z) + 0.115, z);
    quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      deterministicUnit(attempt, seed + 5) * Math.PI,
    );
    scale.set(width, height, width);
    matrix.compose(position, quaternion, scale);
    grass.setMatrixAt(accepted, matrix);
    accepted += 1;
  }
  grass.count = accepted;
  grass.instanceMatrix.needsUpdate = true;
  return Object.freeze({ grass, windTime, bladeCount: accepted });
}

function createFlowRibbonGeometry(extraWidth = 0, surfaceOffsetY = 0) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  INNER_KEEP_WATER_CENTERLINE.forEach(({ x, z, width, y }, index) => {
    const before = INNER_KEEP_WATER_CENTERLINE[Math.max(0, index - 1)]!;
    const after = INNER_KEEP_WATER_CENTERLINE[
      Math.min(INNER_KEEP_WATER_CENTERLINE.length - 1, index + 1)
    ]!;
    const tangentX = after.x - before.x;
    const tangentZ = after.z - before.z;
    const length = Math.max(0.001, Math.hypot(tangentX, tangentZ));
    const normalX = -tangentZ / length;
    const normalZ = tangentX / length;
    const halfWidth = width * 0.5 + extraWidth;
    positions.push(
      x + normalX * halfWidth, y + surfaceOffsetY, z + normalZ * halfWidth,
      x - normalX * halfWidth, y + surfaceOffsetY, z - normalZ * halfWidth,
    );
    const v = index / (INNER_KEEP_WATER_CENTERLINE.length - 1);
    uvs.push(0, v, 1, v);
    if (index < INNER_KEEP_WATER_CENTERLINE.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWaterMaterial(flowTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      innerKeepFlowTime: flowTime,
      deepColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.deep) },
      shallowColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.shallow) },
      foamColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.foam) },
      skyColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.sky) },
    },
    vertexShader: `
      uniform float innerKeepFlowTime;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        float broadWave = sin(uv.y * 34.0 - innerKeepFlowTime * 3.2 + uv.x * 5.0);
        float fineWave = sin(uv.y * 67.0 + innerKeepFlowTime * 2.1 - uv.x * 11.0);
        vWave = broadWave * 0.72 + fineWave * 0.28;
        transformed.y += vWave * 0.022;
        vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewPosition = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float innerKeepFlowTime;
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      uniform vec3 foamColor;
      uniform vec3 skyColor;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        float downstreamRipple = 0.5 + 0.5 * sin(
          vUv.y * 52.0 - innerKeepFlowTime * 4.4 + sin(vUv.x * 13.0) * 1.5
        );
        float crossRipple = 0.5 + 0.5 * sin(
          vUv.y * 29.0 + innerKeepFlowTime * 2.6 - vUv.x * 19.0
        );
        float edgeFoam = smoothstep(0.34, 0.5, abs(vUv.x - 0.5));
        float movingFoam = smoothstep(0.88, 1.0, downstreamRipple)
          * (0.16 + edgeFoam * 0.84);
        float fresnel = pow(
          1.0 - abs(dot(normalize(vViewNormal), normalize(vViewPosition))),
          2.4
        );
        vec3 water = mix(
          deepColor,
          shallowColor,
          0.38 + vWave * 0.1 + downstreamRipple * 0.16 + crossRipple * 0.08
        );
        water = mix(water, skyColor, fresnel * 0.46);
        water = mix(
          water,
          foamColor,
          clamp(edgeFoam * 0.24 + movingFoam * 0.34, 0.0, 0.5)
        );
        gl_FragColor = vec4(water, 0.82);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createInnerKeepEcology(options: Readonly<{
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  visualSeed: number;
}>): InnerKeepEcology {
  const group = new THREE.Group();
  group.name = 'inner-keep-living-ecology';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const { grass, windTime, bladeCount } = createGrass(
    options.quality,
    options.visualSeed,
    geometries,
    materials,
  );
  group.add(grass);

  const flowTime = { value: options.reducedMotion ? 0.35 : 0 };
  const waterMaterial = createWaterMaterial(flowTime);
  materials.add(waterMaterial);
  const bankMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.water.bank,
    roughness: 0.98,
  });
  materials.add(bankMaterial);
  const bedMaterial = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.water.bed,
    roughness: 0.88,
  });
  materials.add(bedMaterial);
  const rillBankGeometry = createFlowRibbonGeometry(
    INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS,
    -0.055,
  );
  geometries.add(rillBankGeometry);
  const rillBank = new THREE.Mesh(rillBankGeometry, bankMaterial);
  rillBank.name = 'inner-keep-cistern-rill-bank';
  rillBank.receiveShadow = true;
  rillBank.renderOrder = 2;
  group.add(rillBank);
  const rillBedGeometry = createFlowRibbonGeometry(0, -0.03);
  geometries.add(rillBedGeometry);
  const rillBed = new THREE.Mesh(rillBedGeometry, bedMaterial);
  rillBed.name = 'inner-keep-cistern-rill-bed';
  rillBed.receiveShadow = true;
  rillBed.renderOrder = 2;
  group.add(rillBed);
  const ribbonGeometry = createFlowRibbonGeometry();
  geometries.add(ribbonGeometry);
  const ribbon = new THREE.Mesh(ribbonGeometry, waterMaterial);
  ribbon.name = 'inner-keep-flowing-cistern-rill';
  ribbon.renderOrder = 3;
  group.add(ribbon);

  const sourcePierGeometry = new THREE.BoxGeometry(0.34, 0.56, 0.7);
  const sourceLintelGeometry = new THREE.BoxGeometry(1.64, 0.22, 0.54);
  geometries.add(sourcePierGeometry);
  geometries.add(sourceLintelGeometry);
  const waterSource = INNER_KEEP_WATER_CENTERLINE[0]!;
  const waterSourceGround = innerKeepOuterWorldTerrainHeightAt(
    waterSource.x,
    waterSource.z,
  );
  const sourceLeft = new THREE.Mesh(sourcePierGeometry, bankMaterial);
  sourceLeft.position.set(waterSource.x - 0.5, waterSourceGround + 0.28, waterSource.z);
  sourceLeft.castShadow = true;
  sourceLeft.receiveShadow = true;
  const sourceRight = sourceLeft.clone();
  sourceRight.position.x = waterSource.x + 0.5;
  const sourceLintel = new THREE.Mesh(sourceLintelGeometry, bankMaterial);
  sourceLintel.position.set(waterSource.x, waterSourceGround + 0.62, waterSource.z);
  sourceLintel.castShadow = true;
  sourceLintel.receiveShadow = true;
  sourceLintel.name = 'inner-keep-headwater-stonework';
  group.add(sourceLeft, sourceRight, sourceLintel);

  const pondGeometry = new THREE.CircleGeometry(1, 40);
  pondGeometry.rotateX(-Math.PI / 2);
  geometries.add(pondGeometry);
  const pondBed = new THREE.Mesh(pondGeometry, bedMaterial);
  pondBed.name = 'inner-keep-cistern-pond-bed';
  pondBed.position.set(
    INNER_KEEP_WATER_POND.center.x,
    INNER_KEEP_WATER_POND.center.y - 0.025,
    INNER_KEEP_WATER_POND.center.z,
  );
  pondBed.scale.set(
    INNER_KEEP_WATER_POND.radii.x,
    1,
    INNER_KEEP_WATER_POND.radii.z,
  );
  pondBed.receiveShadow = true;
  pondBed.renderOrder = 2;
  group.add(pondBed);
  const pond = new THREE.Mesh(pondGeometry, waterMaterial);
  pond.name = 'inner-keep-cistern-settling-pond';
  pond.position.set(
    INNER_KEEP_WATER_POND.center.x,
    INNER_KEEP_WATER_POND.center.y,
    INNER_KEEP_WATER_POND.center.z,
  );
  pond.scale.set(
    INNER_KEEP_WATER_POND.radii.x,
    1,
    INNER_KEEP_WATER_POND.radii.z,
  );
  pond.renderOrder = 3;
  group.add(pond);

  const bankGeometry = new THREE.TorusGeometry(1, 0.12, 6, 48);
  bankGeometry.rotateX(Math.PI / 2);
  geometries.add(bankGeometry);
  const pondBank = new THREE.Mesh(bankGeometry, bankMaterial);
  pondBank.name = 'inner-keep-cistern-pond-bank';
  pondBank.position.set(
    INNER_KEEP_WATER_POND.center.x,
    INNER_KEEP_WATER_POND.center.y - 0.045,
    INNER_KEEP_WATER_POND.center.z,
  );
  pondBank.scale.set(
    INNER_KEEP_WATER_POND.radii.x,
    1,
    INNER_KEEP_WATER_POND.radii.z,
  );
  pondBank.receiveShadow = true;
  group.add(pondBank);

  let disposed = false;
  return Object.freeze({
    group,
    grassBladeCount: bladeCount,
    waterSurfaceCount: 2,
    update: (elapsedSeconds) => {
      if (disposed || options.reducedMotion || !Number.isFinite(elapsedSeconds)) return false;
      const time = Math.max(0, elapsedSeconds);
      windTime.value = time;
      flowTime.value = time;
      return true;
    },
    isAnimationActive: () => !disposed && !options.reducedMotion,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeInstancedMeshBuffers(group);
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      geometries.clear();
      materials.clear();
    },
  });
}
