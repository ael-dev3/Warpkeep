import * as THREE from 'three';

import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';
import {
  createLowPolyGrassGeometry,
  REALM_GRASS_BLADES_PER_PATCH,
  REALM_GRASS_VARIANT_COUNTS,
} from '../realm/createLowPolyGrassGeometry';
import { createInnerKeepTerrainDrapedEllipseGeometry } from './createInnerKeepTerrainDrapedGeometry';
import { INNER_KEEP_LAYOUT_V1_SLOTS } from './innerKeepLayoutV1';
import { INNER_KEEP_AMBIENT_ROUTES } from './innerKeepAmbientPolicy';
import {
  INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS,
  type InnerKeepFixedPlacementExclusion,
} from './innerKeepFixedPlacementExclusions';
import { INNER_KEEP_PRESENTATION_CLEARANCES } from './innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_OUTER_WORLD_BOAT_ROUTE,
  INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_LAKE,
  INNER_KEEP_OUTER_WORLD_MARSH,
  INNER_KEEP_OUTER_WORLD_MARSH_BUDGETS,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
  INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE,
  innerKeepCityEdgeApronDistance,
  innerKeepCityDistrictRoadEdgeDistance,
  innerKeepOuterWorldDistanceToResourceSite,
  innerKeepOuterWorldDistanceToRenderedRoadEdge,
  innerKeepOuterWorldDistanceToRoad,
  innerKeepOuterWorldDistanceToSegment,
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

export const INNER_KEEP_GRASS_TERRAIN_NORMAL_SAMPLE_STEP_METERS = 0.2;
export const INNER_KEEP_GRASS_MAXIMUM_TERRAIN_SLOPE = 0.32;
export const INNER_KEEP_GRASS_MAXIMUM_ROOT_TERRAIN_DELTA_METERS = 0.08;
/**
 * Conservative horizontal support after maximum width/height scale, the
 * bounded terrain-normal tilt above, and the two orthogonal wind components.
 */
export const INNER_KEEP_GRASS_PATCH_SUPPORT_RADIUS_METERS = 1.2;
export const INNER_KEEP_GRASS_PATCH_BUDGET = Object.freeze({
  high: Math.ceil(
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.grassBlades
      / REALM_GRASS_BLADES_PER_PATCH.high,
  ),
  balanced: Math.ceil(
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.grassBlades
      / REALM_GRASS_BLADES_PER_PATCH.balanced,
  ),
  reduced: Math.ceil(
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.grassBlades
      / REALM_GRASS_BLADES_PER_PATCH.reduced,
  ),
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_GRASS_SHADER_CACHE_KEY =
  'inner-keep-dense-grass-wind-v3-world-basis-terrain-fit-three-r185';

export function injectInnerKeepGrassVertexShader(vertexShader: string) {
  const commonMarker = '#include <common>';
  const beginVertexMarker = '#include <begin_vertex>';
  if (
    !vertexShader.includes(commonMarker)
    || !vertexShader.includes(beginVertexMarker)
  ) {
    throw new Error('INNER_KEEP_GRASS_SHADER_CONTRACT_CHANGED');
  }
  return vertexShader
    .replace(
      commonMarker,
      `${commonMarker}
attribute vec4 grassBladeData;
uniform float innerKeepWindTime;
uniform vec2 innerKeepWindDirection;`,
    )
    .replace(
      beginVertexMarker,
      `${beginVertexMarker}
        #ifdef USE_INSTANCING
          vec4 innerKeepGrassWorldOrigin = modelMatrix
            * instanceMatrix
            * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 innerKeepGrassWind = normalize(
            innerKeepWindDirection + vec2(0.00001, 0.00001)
          );
          vec2 innerKeepGrassCrossWind = vec2(
            -innerKeepGrassWind.y,
            innerKeepGrassWind.x
          );
          mat3 innerKeepGrassInstanceBasis = mat3(modelMatrix * instanceMatrix);
          mat2 innerKeepGrassLocalToWorldXZ = mat2(
            innerKeepGrassInstanceBasis[0].xz,
            innerKeepGrassInstanceBasis[2].xz
          );
          float innerKeepGrassBasisDeterminant = determinant(
            innerKeepGrassLocalToWorldXZ
          );
          mat2 innerKeepGrassWorldToLocalXZ = abs(innerKeepGrassBasisDeterminant)
            > 0.000001
            ? inverse(innerKeepGrassLocalToWorldXZ)
            : mat2(1.0);
          vec2 innerKeepGrassLocalWind = innerKeepGrassWorldToLocalXZ
            * innerKeepGrassWind;
          vec2 innerKeepGrassLocalCrossWind = innerKeepGrassWorldToLocalXZ
            * innerKeepGrassCrossWind;
          float innerKeepGrassTip = pow(
            clamp(grassBladeData.y, 0.0, 1.0),
            1.85
          );
          float innerKeepGrassBladePhase = grassBladeData.z;
          float innerKeepGrassWave = sin(
            innerKeepWindTime * 1.55
            + dot(innerKeepGrassWorldOrigin.xz, innerKeepGrassWind) * 0.89
            + innerKeepGrassBladePhase * 0.11
          );
          transformed.xz += innerKeepGrassLocalWind
            * innerKeepGrassWave * 0.085 * innerKeepGrassTip;
          transformed.xz += innerKeepGrassLocalCrossWind * cos(
            innerKeepWindTime * 1.08
            + dot(innerKeepGrassWorldOrigin.xz, innerKeepGrassCrossWind)
            + innerKeepGrassBladePhase * 0.31
          ) * 0.035 * innerKeepGrassTip;
        #endif`,
    );
}

/** Backward-compatible names now covering the connected outer watercourse. */
export const INNER_KEEP_WATER_CENTERLINE = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE;
export const INNER_KEEP_WATER_POND = INNER_KEEP_OUTER_WORLD_LAKE;

export const INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS = 0.1;
export const INNER_KEEP_WATER_LAKE_BANK_INLET_GAP_RADIANS = 0.95;

export type InnerKeepFixedEcologyExclusion = InnerKeepFixedPlacementExclusion;

/** Backward-compatible ecology name for the canonical shared fixed bounds. */
export const INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS =
  INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS;

export type InnerKeepEcology = Readonly<{
  group: THREE.Group;
  grassBladeCount: number;
  waterSurfaceCount: number;
  marshWetGroundPatchCount: number;
  marshReedCount: number;
  marshLilyPadCount: number;
  marshDeadSnagCount: number;
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

export type InnerKeepMarshScenicPlacement = Readonly<{
  positionMeters: readonly [number, number, number];
  rotationYRadians: number;
  scale: readonly [number, number, number];
}>;

export type InnerKeepMarshPresentationPlan = Readonly<{
  wetGroundPatches: readonly InnerKeepMarshScenicPlacement[];
  reeds: readonly InnerKeepMarshScenicPlacement[];
  lilyPads: readonly InnerKeepMarshScenicPlacement[];
  deadSnags: readonly InnerKeepMarshScenicPlacement[];
}>;

export const INNER_KEEP_MARSH_BOAT_OBSTACLE_CLEARANCE_METERS = 0.05;
export const INNER_KEEP_MARSH_LILY_PAD_BOAT_CLEARANCE_METERS =
  INNER_KEEP_MARSH_BOAT_OBSTACLE_CLEARANCE_METERS;

export function innerKeepMarshDistanceToBoatRoute(x: number, z: number) {
  let nearest = Number.POSITIVE_INFINITY;
  for (
    let index = 0;
    index < INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.points.length - 1;
    index += 1
  ) {
    const from = INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.points[index]!;
    const to = INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.points[index + 1]!;
    nearest = Math.min(
      nearest,
      innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z),
    );
  }
  return nearest;
}

function marshWaterSceneryIsClear(x: number, z: number, clearanceMeters: number) {
  const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  if (Math.abs(x) + clearanceMeters >= halfWidth - 0.2) return false;
  if (Math.abs(z) + clearanceMeters >= halfDepth - 0.2) return false;
  if (
    innerKeepOuterWorldDistanceToRoad(x, z)
    <= INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters + clearanceMeters
  ) return false;
  if (innerKeepOuterWorldDistanceToResourceSite(x, z) <= clearanceMeters) return false;
  return INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.every((exclusion) => (
    Math.abs(x - exclusion.center.x)
      > exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters + clearanceMeters
    || Math.abs(z - exclusion.center.z)
      > exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters + clearanceMeters
  ));
}

/** Pure deterministic lowland plan shared by the renderer and regression tests. */
export function planInnerKeepMarshPresentation(options: Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
  pointIsClear?: (x: number, z: number, clearanceMeters: number) => boolean;
}>): InnerKeepMarshPresentationPlan {
  const budget = INNER_KEEP_OUTER_WORLD_MARSH_BUDGETS[options.quality];
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const pointIsClear = options.pointIsClear ?? innerKeepOuterWorldPointIsClear;
  const wetGroundPatches: InnerKeepMarshScenicPlacement[] = [];
  const deadSnags: InnerKeepMarshScenicPlacement[] = [];
  const reeds: InnerKeepMarshScenicPlacement[] = [];
  const lilyPads: InnerKeepMarshScenicPlacement[] = [];
  const marsh = INNER_KEEP_OUTER_WORLD_MARSH;

  for (
    let attempt = 0;
    wetGroundPatches.length < budget.wetGroundPatches && attempt < 2_048;
    attempt += 1
  ) {
    const angle = deterministicUnit(attempt, options.visualSeed + 211) * Math.PI * 2;
    const radius = 0.44 + deterministicUnit(attempt, options.visualSeed + 223) * 0.52;
    const x = marsh.center.x + Math.cos(angle) * marsh.radii.x * radius;
    const z = marsh.center.z + Math.sin(angle) * marsh.radii.z * radius;
    if (!pointIsClear(x, z, 0.08)) continue;
    wetGroundPatches.push(Object.freeze({
      positionMeters: Object.freeze([x, terrainHeightAt(x, z) + 0.018, z] as const),
      rotationYRadians: deterministicUnit(attempt, options.visualSeed + 227) * Math.PI,
      scale: Object.freeze([
        1.15 + deterministicUnit(attempt, options.visualSeed + 229) * 1.15,
        1,
        0.62 + deterministicUnit(attempt, options.visualSeed + 233) * 0.8,
      ] as const),
    }));
  }

  for (
    let attempt = 0;
    deadSnags.length < budget.deadSnags && attempt < 2_048;
    attempt += 1
  ) {
    const angle = deterministicUnit(attempt, options.visualSeed + 239) * Math.PI * 2;
    const radius = 0.6 + deterministicUnit(attempt, options.visualSeed + 241) * 0.35;
    const x = marsh.center.x + Math.cos(angle) * marsh.radii.x * radius;
    const z = marsh.center.z + Math.sin(angle) * marsh.radii.z * radius;
    const scale = Object.freeze([
      0.82 + deterministicUnit(attempt, options.visualSeed + 257) * 0.34,
      0.78 + deterministicUnit(attempt, options.visualSeed + 263) * 0.48,
      0.82 + deterministicUnit(attempt, options.visualSeed + 269) * 0.34,
    ] as const);
    if (!pointIsClear(x, z, 0.3)) continue;
    if (
      innerKeepMarshDistanceToBoatRoute(x, z)
      < INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.vesselBeamMeters * 0.5
        + 0.105 * Math.max(scale[0], scale[2])
        + INNER_KEEP_MARSH_BOAT_OBSTACLE_CLEARANCE_METERS
    ) continue;
    deadSnags.push(Object.freeze({
      positionMeters: Object.freeze([x, terrainHeightAt(x, z), z] as const),
      rotationYRadians: deterministicUnit(attempt, options.visualSeed + 251) * Math.PI * 2,
      scale,
    }));
  }

  for (
    let attempt = 0;
    reeds.length < budget.reeds && attempt < budget.reeds * 64;
    attempt += 1
  ) {
    let x: number;
    let z: number;
    let y: number;
    if (attempt % 3 === 0) {
      const startIndex = 8 + Math.floor(
        deterministicUnit(attempt, options.visualSeed + 271) * 5,
      );
      const from = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[startIndex]!;
      const to = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[startIndex + 1]!;
      const progress = deterministicUnit(attempt, options.visualSeed + 277);
      const width = from.width + (to.width - from.width) * progress;
      const side = deterministicUnit(attempt, options.visualSeed + 281) < 0.5 ? -1 : 1;
      x = from.x + (to.x - from.x) * progress
        + side * width * (0.4 + deterministicUnit(attempt, options.visualSeed + 283) * 0.12);
      z = from.z + (to.z - from.z) * progress;
      y = from.y + (to.y - from.y) * progress - 0.12;
    } else {
      const angle = deterministicUnit(attempt, options.visualSeed + 293) * Math.PI * 2;
      const radius = 0.78 + deterministicUnit(attempt, options.visualSeed + 307) * 0.24;
      x = INNER_KEEP_OUTER_WORLD_LAKE.center.x
        + Math.cos(angle) * INNER_KEEP_OUTER_WORLD_LAKE.radii.x * radius;
      z = INNER_KEEP_OUTER_WORLD_LAKE.center.z
        + Math.sin(angle) * INNER_KEEP_OUTER_WORLD_LAKE.radii.z * radius;
      y = INNER_KEEP_OUTER_WORLD_LAKE.center.y - 0.12;
    }
    const scale = Object.freeze([
      0.78 + deterministicUnit(attempt, options.visualSeed + 313) * 0.38,
      0.72 + deterministicUnit(attempt, options.visualSeed + 317) * 0.68,
      0.78 + deterministicUnit(attempt, options.visualSeed + 331) * 0.38,
    ] as const);
    if (!marshWaterSceneryIsClear(x, z, 0.08)) continue;
    if (
      innerKeepMarshDistanceToBoatRoute(x, z)
      < INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.vesselBeamMeters * 0.5
        + 0.04 * Math.max(scale[0], scale[2])
        + INNER_KEEP_MARSH_BOAT_OBSTACLE_CLEARANCE_METERS
    ) continue;
    reeds.push(Object.freeze({
      positionMeters: Object.freeze([x, y, z] as const),
      rotationYRadians: deterministicUnit(attempt, options.visualSeed + 311) * Math.PI * 2,
      scale,
    }));
  }

  for (
    let attempt = 0;
    lilyPads.length < budget.lilyPads && attempt < budget.lilyPads * 64;
    attempt += 1
  ) {
    const angle = deterministicUnit(attempt, options.visualSeed + 337) * Math.PI * 2;
    const radius = Math.sqrt(
      0.08 + deterministicUnit(attempt, options.visualSeed + 347) * 0.55,
    );
    const x = INNER_KEEP_OUTER_WORLD_LAKE.center.x
      + Math.cos(angle) * INNER_KEEP_OUTER_WORLD_LAKE.radii.x * radius;
    const z = INNER_KEEP_OUTER_WORLD_LAKE.center.z
      + Math.sin(angle) * INNER_KEEP_OUTER_WORLD_LAKE.radii.z * radius;
    const scale = 0.18 + deterministicUnit(attempt, options.visualSeed + 349) * 0.17;
    if (!marshWaterSceneryIsClear(x, z, 0.1)) continue;
    if (
      innerKeepMarshDistanceToBoatRoute(x, z)
      < INNER_KEEP_OUTER_WORLD_BOAT_ROUTE.vesselBeamMeters * 0.5
        + scale
        + INNER_KEEP_MARSH_BOAT_OBSTACLE_CLEARANCE_METERS
    ) continue;
    lilyPads.push(Object.freeze({
      positionMeters: Object.freeze([
        x,
        INNER_KEEP_OUTER_WORLD_LAKE.center.y + 0.026,
        z,
      ] as const),
      rotationYRadians: angle,
      scale: Object.freeze([scale, 1, scale * 0.76] as const),
    }));
  }

  return Object.freeze({
    wetGroundPatches: Object.freeze(wetGroundPatches),
    reeds: Object.freeze(reeds),
    lilyPads: Object.freeze(lilyPads),
    deadSnags: Object.freeze(deadSnags),
  });
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

function overlapsAmbientRoute(x: number, z: number, extraClearance = 0) {
  return AMBIENT_ROUTE_SEGMENTS.some((segment) => (
    x >= segment.minimumX - extraClearance
    && x <= segment.maximumX + extraClearance
    && z >= segment.minimumZ - extraClearance
    && z <= segment.maximumZ + extraClearance
    && distanceToSegment(
      x,
      z,
      segment.from.x,
      segment.from.z,
      segment.to.x,
      segment.to.z,
    ) < segment.clearance + extraClearance
  ));
}

function grassCandidateIsClear(x: number, z: number) {
  const support = INNER_KEEP_GRASS_PATCH_SUPPORT_RADIUS_METERS;
  const [outerHalfWidth, outerHalfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  if (
    Math.abs(x) > outerHalfWidth - support
    || Math.abs(z) > outerHalfDepth - support
  ) {
    return false;
  }
  if (Math.hypot(
    (x - INNER_KEEP_OUTER_WORLD_MARSH.center.x)
      / (INNER_KEEP_OUTER_WORLD_MARSH.radii.x + support),
    (z - INNER_KEEP_OUTER_WORLD_MARSH.center.z)
      / (INNER_KEEP_OUTER_WORLD_MARSH.radii.z + support),
  ) <= 1) return false;
  const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
  const insideInnerKeepEcologyArea = x >= wall.westX - support
    && x <= wall.eastX + support
    && z >= wall.northZ - support
    && z <= wall.southZ + support;
  if (
    insideInnerKeepEcologyArea
    && (
      Math.abs(x - INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthCenterX)
        < INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthHalfWidth + 0.5 + support
      || Math.abs(z - INNER_KEEP_PRESENTATION_CLEARANCES.road.eastWestCenterZ)
        < INNER_KEEP_PRESENTATION_CLEARANCES.road.eastWestHalfWidth + 0.38 + support
    )
  ) return false;
  if (innerKeepCityDistrictRoadEdgeDistance(x, z) < 0.34 + support) return false;
  if (innerKeepCityEdgeApronDistance(x, z) < 0.14 + support) return false;
  if (innerKeepOuterWorldDistanceToRenderedRoadEdge(x, z) < 0.13 + support) return false;
  if (INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS.some((exclusion) => (
    !exclusion.isRoadSurface
    && insideRoundedBox(
      x,
      z,
      exclusion.center.x,
      exclusion.center.z,
      exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters + support,
      exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters + support,
    )
  ))) return false;
  if (INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.some((exclusion) => (
    insideRoundedBox(
      x,
      z,
      exclusion.center.x,
      exclusion.center.z,
      exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters + support,
      exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters + support,
    )
  ))) return false;
  if (overlapsAmbientRoute(x, z, support)) return false;
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
      halfExtents[0] + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer + support,
      halfExtents[1] + INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer + support,
    )) return false;
  }
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  const isInsideCompoundPlateau = x >= plateau.minimumX
    && x <= plateau.maximumX
    && z >= plateau.minimumZ
    && z <= plateau.maximumZ;
  return isInsideCompoundPlateau
    ? true
    : innerKeepOuterWorldPointIsClear(x, z, support);
}

function createPartialGrassPatchGeometry(
  quality: InnerKeepSceneQuality,
  bladeCount: number,
) {
  const geometry = createLowPolyGrassGeometry(quality, 0);
  const vertexCount = bladeCount * 5;
  for (const attributeName of ['position', 'normal', 'grassBladeData'] as const) {
    const attribute = geometry.getAttribute(attributeName);
    geometry.setAttribute(
      attributeName,
      new THREE.Float32BufferAttribute(
        Array.from(attribute.array).slice(0, vertexCount * attribute.itemSize),
        attribute.itemSize,
        attribute.normalized,
      ),
    );
  }
  geometry.setIndex(new THREE.Uint16BufferAttribute(
    Array.from(geometry.index!.array).slice(0, bladeCount * 9),
    1,
  ));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.realmGrassBladeCount = bladeCount;
  geometry.userData.realmGrassTriangleCount = bladeCount * 3;
  geometry.userData.realmGrassPartialPatch = true;
  return geometry;
}

function createGrass(
  quality: InnerKeepSceneQuality,
  seed: number,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
  terrainHeightAt: (x: number, z: number) => number,
) {
  const bladeBudget = INNER_KEEP_GRASS_BUDGET[quality];
  const bladesPerFullPatch = REALM_GRASS_BLADES_PER_PATCH[quality];
  const fullPatchCount = Math.floor(bladeBudget / bladesPerFullPatch);
  const partialBladeCount = bladeBudget % bladesPerFullPatch;
  const variantCount = REALM_GRASS_VARIANT_COUNTS[quality];
  const windTime = { value: 0 };
  const windDirection = {
    value: new THREE.Vector2(
      REALM_PREVAILING_WIND.x,
      REALM_PREVAILING_WIND.z,
    ),
  };
  const material = new THREE.MeshStandardMaterial({
    color: INNER_KEEP_TOWN_TONAL_PALETTE.foliage.grass,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
    toneMapped: true,
    vertexColors: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.innerKeepWindTime = windTime;
    shader.uniforms.innerKeepWindDirection = windDirection;
    shader.vertexShader = injectInnerKeepGrassVertexShader(shader.vertexShader);
  };
  material.customProgramCacheKey = () => INNER_KEEP_GRASS_SHADER_CACHE_KEY;
  material.userData.innerKeepWindDirection = windDirection.value;
  materials.add(material);
  const batches = Array.from({ length: variantCount }, (_, variant) => {
    const capacity = Math.floor(fullPatchCount / variantCount)
      + (variant < fullPatchCount % variantCount ? 1 : 0);
    const geometry = createLowPolyGrassGeometry(quality, variant);
    geometries.add(geometry);
    return {
      bladeCount: bladesPerFullPatch,
      capacity,
      count: 0,
      mesh: new THREE.InstancedMesh(geometry, material, capacity),
    };
  });
  if (partialBladeCount > 0) {
    const geometry = createPartialGrassPatchGeometry(quality, partialBladeCount);
    geometries.add(geometry);
    batches.push({
      bladeCount: partialBladeCount,
      capacity: 1,
      count: 0,
      mesh: new THREE.InstancedMesh(geometry, material, 1),
    });
  }
  batches.forEach((batch, index) => {
    batch.mesh.name = index === 0
      ? 'inner-keep-dense-grass'
      : `inner-keep-dense-grass-variant-${index}`;
    batch.mesh.castShadow = false;
    batch.mesh.receiveShadow = true;
    batch.mesh.frustumCulled = false;
  });
  const placementSchedule = batches.flatMap((batch, batchIndex) => (
    Array.from({ length: batch.capacity }, () => batchIndex)
  ));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const surfaceNormal = new THREE.Vector3();
  const surfaceRotation = new THREE.Quaternion();
  const yawRotation = new THREE.Quaternion();
  const plantedRoot = new THREE.Vector3();
  const patchFitsRenderedTerrain = (
    geometry: THREE.BufferGeometry,
    x: number,
    z: number,
    width: number,
    height: number,
    yaw: number,
  ) => {
    const step = INNER_KEEP_GRASS_TERRAIN_NORMAL_SAMPLE_STEP_METERS;
    const centerHeight = terrainHeightAt(x, z);
    const heightWest = terrainHeightAt(x - step, z);
    const heightEast = terrainHeightAt(x + step, z);
    const heightNorth = terrainHeightAt(x, z - step);
    const heightSouth = terrainHeightAt(x, z + step);
    if (![centerHeight, heightWest, heightEast, heightNorth, heightSouth].every(
      Number.isFinite,
    )) return false;
    const slopeX = (heightEast - heightWest) / (step * 2);
    const slopeZ = (heightSouth - heightNorth) / (step * 2);
    if (Math.hypot(slopeX, slopeZ) > INNER_KEEP_GRASS_MAXIMUM_TERRAIN_SLOPE) {
      return false;
    }
    surfaceNormal.set(-slopeX, 1, -slopeZ).normalize();
    surfaceRotation.setFromUnitVectors(up, surfaceNormal);
    yawRotation.setFromAxisAngle(surfaceNormal, yaw);
    quaternion.copy(yawRotation).multiply(surfaceRotation).normalize();
    position.set(x, centerHeight, z);
    scale.set(width, height, width);
    matrix.compose(position, quaternion, scale);

    const geometryPosition = geometry.getAttribute('position');
    for (let bladeOffset = 0; bladeOffset < geometryPosition.count; bladeOffset += 5) {
      for (let rootVertex = bladeOffset; rootVertex <= bladeOffset + 1; rootVertex += 1) {
        plantedRoot.fromBufferAttribute(geometryPosition, rootVertex).applyMatrix4(matrix);
        const expectedRootHeight = terrainHeightAt(plantedRoot.x, plantedRoot.z);
        if (
          !Number.isFinite(expectedRootHeight)
          || Math.abs(plantedRoot.y - expectedRootHeight)
            > INNER_KEEP_GRASS_MAXIMUM_ROOT_TERRAIN_DELTA_METERS
        ) return false;
      }
    }
    return true;
  };
  let accepted = 0;
  let attempt = 0;
  const [outerHalfWidth, outerHalfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  let acceptedBladeCount = 0;
  while (
    accepted < placementSchedule.length
    && attempt < placementSchedule.length * 64
  ) {
    const x = -outerHalfWidth + 0.45
      + deterministicUnit(attempt, seed + 1) * (outerHalfWidth * 2 - 0.9);
    const z = -outerHalfDepth + 0.45
      + deterministicUnit(attempt, seed + 2) * (outerHalfDepth * 2 - 0.9);
    attempt += 1;
    if (!grassCandidateIsClear(x, z)) continue;
    const height = 0.58 + deterministicUnit(attempt, seed + 3) * 0.5;
    const width = 0.78 + deterministicUnit(attempt, seed + 4) * 0.46;
    const batch = batches[placementSchedule[accepted]!]!;
    const yaw = deterministicUnit(attempt, seed + 5) * Math.PI;
    if (!patchFitsRenderedTerrain(
      batch.mesh.geometry,
      x,
      z,
      width,
      height,
      yaw,
    )) continue;
    batch.mesh.setMatrixAt(batch.count, matrix);
    batch.count += 1;
    acceptedBladeCount += batch.bladeCount;
    accepted += 1;
  }
  batches.forEach((batch) => {
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  });
  return Object.freeze({
    grassMeshes: Object.freeze(batches.map((batch) => batch.mesh)),
    windTime,
    bladeCount: acceptedBladeCount,
  });
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
  const fogUniforms = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms,
      innerKeepFlowTime: flowTime,
      deepColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.deep) },
      shallowColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.shallow) },
      foamColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.foam) },
      skyColor: { value: new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.water.sky) },
    },
    vertexShader: `
      #include <fog_pars_vertex>
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
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
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
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function setStaticMarshMatrices(
  mesh: THREE.InstancedMesh,
  placements: readonly InnerKeepMarshScenicPlacement[],
  verticalLift: (placement: InnerKeepMarshScenicPlacement) => number = () => 0,
) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  placements.forEach((placement, index) => {
    position.set(...placement.positionMeters);
    position.y += verticalLift(placement);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationYRadians);
    scale.set(...placement.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.count = placements.length;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function createMarshPresentation(
  plan: InnerKeepMarshPresentationPlan,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
  terrainHeightAt: (x: number, z: number) => number,
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-south-east-marsh';
  group.userData.presentationOnly = true;
  group.userData.gameplayAuthorityClaimed = false;
  group.userData.pickable = false;

  const patchGeometry = createInnerKeepTerrainDrapedEllipseGeometry({
    placements: plan.wetGroundPatches.map((placement) => Object.freeze({
      center: Object.freeze({
        x: placement.positionMeters[0],
        z: placement.positionMeters[2],
      }),
      radiiMeters: Object.freeze([placement.scale[0], placement.scale[2]] as const),
      rotationYRadians: placement.rotationYRadians,
      surfaceLiftMeters: 0.018,
    })),
    terrainHeightAt,
    angularSegments: 24,
    radialSegments: 4,
  });
  const reedGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.72, 4);
  const lilyGeometry = new THREE.CircleGeometry(1, 12, 0.22, Math.PI * 1.78);
  lilyGeometry.rotateX(-Math.PI / 2);
  const snagGeometry = new THREE.CylinderGeometry(0.045, 0.105, 1.18, 5);
  const branchGeometry = new THREE.CylinderGeometry(0.025, 0.045, 0.48, 5);
  branchGeometry.rotateZ(Math.PI * 0.34);
  [patchGeometry, reedGeometry, lilyGeometry, snagGeometry, branchGeometry]
    .forEach((geometry) => geometries.add(geometry));

  const patchMaterial = new THREE.MeshStandardMaterial({
    color: 0x596746,
    roughness: 0.98,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x718442, roughness: 0.94 });
  const lilyMaterial = new THREE.MeshStandardMaterial({
    color: 0x56844d,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const snagMaterial = new THREE.MeshStandardMaterial({ color: 0x554333, roughness: 1 });
  [patchMaterial, reedMaterial, lilyMaterial, snagMaterial]
    .forEach((material) => materials.add(material));

  const wetGround = new THREE.Mesh(patchGeometry, patchMaterial);
  wetGround.name = 'inner-keep-marsh-wet-ground';
  wetGround.userData.innerKeepDrapedEllipseCount = plan.wetGroundPatches.length;
  wetGround.receiveShadow = true;
  wetGround.renderOrder = 1;

  const reeds = new THREE.InstancedMesh(
    reedGeometry,
    reedMaterial,
    Math.max(1, plan.reeds.length),
  );
  reeds.name = 'inner-keep-marsh-reeds';
  setStaticMarshMatrices(reeds, plan.reeds, (placement) => 0.36 * placement.scale[1]);
  reeds.receiveShadow = true;

  const lilyPads = new THREE.InstancedMesh(
    lilyGeometry,
    lilyMaterial,
    Math.max(1, plan.lilyPads.length),
  );
  lilyPads.name = 'inner-keep-marsh-lily-pads';
  setStaticMarshMatrices(lilyPads, plan.lilyPads);
  lilyPads.renderOrder = 4;

  const deadSnags = new THREE.InstancedMesh(
    snagGeometry,
    snagMaterial,
    Math.max(1, plan.deadSnags.length),
  );
  deadSnags.name = 'inner-keep-marsh-dead-snags';
  setStaticMarshMatrices(deadSnags, plan.deadSnags, (placement) => 0.59 * placement.scale[1]);
  deadSnags.castShadow = true;
  deadSnags.receiveShadow = true;

  const snagBranches = new THREE.InstancedMesh(
    branchGeometry,
    snagMaterial,
    Math.max(1, plan.deadSnags.length),
  );
  snagBranches.name = 'inner-keep-marsh-dead-snag-branches';
  const branchPlacements = plan.deadSnags.map((placement) => Object.freeze({
    positionMeters: Object.freeze([
      placement.positionMeters[0] + Math.cos(placement.rotationYRadians) * 0.12,
      placement.positionMeters[1] + 0.78 * placement.scale[1],
      placement.positionMeters[2] + Math.sin(placement.rotationYRadians) * 0.12,
    ] as const),
    rotationYRadians: placement.rotationYRadians + Math.PI * 0.5,
    scale: Object.freeze([
      placement.scale[0],
      placement.scale[1] * 0.78,
      placement.scale[2],
    ] as const),
  }));
  setStaticMarshMatrices(snagBranches, branchPlacements);
  snagBranches.castShadow = true;
  snagBranches.receiveShadow = true;

  group.add(wetGround, reeds, lilyPads, deadSnags, snagBranches);
  group.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.pickable = false;
    if (object instanceof THREE.Mesh) object.raycast = () => undefined;
  });
  return group;
}

export function createInnerKeepEcology(options: Readonly<{
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
}>): InnerKeepEcology {
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const group = new THREE.Group();
  group.name = 'inner-keep-living-ecology';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const { grassMeshes, windTime, bladeCount } = createGrass(
    options.quality,
    options.visualSeed,
    geometries,
    materials,
    terrainHeightAt,
  );
  group.add(...grassMeshes);
  const marshPlan = planInnerKeepMarshPresentation({
    quality: options.quality,
    visualSeed: options.visualSeed,
    terrainHeightAt,
  });
  group.add(createMarshPresentation(
    marshPlan,
    geometries,
    materials,
    terrainHeightAt,
  ));

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
  const waterSourceGround = terrainHeightAt(
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

  const bankGeometry = new THREE.TorusGeometry(
    1,
    0.12,
    6,
    48,
    Math.PI * 2 - INNER_KEEP_WATER_LAKE_BANK_INLET_GAP_RADIANS,
  );
  bankGeometry.rotateZ(
    Math.PI * 1.5 + INNER_KEEP_WATER_LAKE_BANK_INLET_GAP_RADIANS * 0.5,
  );
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
    marshWetGroundPatchCount: marshPlan.wetGroundPatches.length,
    marshReedCount: marshPlan.reeds.length,
    marshLilyPadCount: marshPlan.lilyPads.length,
    marshDeadSnagCount: marshPlan.deadSnags.length,
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
