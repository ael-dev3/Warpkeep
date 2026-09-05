import * as THREE from 'three';

import { axialToWorld, worldToNearestAxial } from '../../game/map/hexCoordinates';
import {
  GREATER_REALM_HYDRO_REGIME,
  type GreaterRealmPublicCellDto
} from '../../greater-realm/greaterRealmPublicContract';
import type { GreaterRealmGraphicsProfile } from '../../greater-realm/greaterRealmRuntimePolicy';
import {
  createVoxelSurfaceMeshData,
  planVoxelSurface,
  type VoxelCell,
  type VoxelSurfacePlan
} from './voxelSurfaceMesh';

export const GREATER_REALM_VOXEL_PROFILES = Object.freeze({
  high: Object.freeze({
    horizontalDivisor: 4, verticalDivisor: 8,
    maximumVoxels: 32_768, maximumFaces: 32_768, maximumTerrainQuads: 4_096
  }),
  balanced: Object.freeze({
    horizontalDivisor: 2, verticalDivisor: 4,
    maximumVoxels: 16_384, maximumFaces: 16_384, maximumTerrainQuads: 2_048
  }),
  reduced: Object.freeze({
    horizontalDivisor: 1, verticalDivisor: 2,
    maximumVoxels: 8_192, maximumFaces: 8_192, maximumTerrainQuads: 512
  })
} satisfies Readonly<Record<GreaterRealmGraphicsProfile, Readonly<{
  horizontalDivisor: number;
  verticalDivisor: number;
  maximumVoxels: number;
  maximumFaces: number;
  maximumTerrainQuads: number;
}>>>);

export type GreaterRealmVoxelPrefabKind =
  | 'castle'
  | 'ruin'
  | 'signpost'
  | 'waystone'
  | 'lamp-post';

type GreaterRealmVoxelGeometryPlan = Readonly<{
  surfacePlan: VoxelSurfacePlan;
  origin: Readonly<{ x: number; y: number; z: number }>;
  scale: Readonly<{ x: number; y: number; z: number }>;
  uploadBytes: number;
  signature: string;
}>;

export type GreaterRealmVoxelTerrainPlan = GreaterRealmVoxelGeometryPlan & Readonly<{
  kind: 'terrain';
  graphicsProfile: GreaterRealmGraphicsProfile;
  emittingCellCount: number;
  contextCellCount: number;
  quantizedSurfaceMinimumY: number;
  quantizedSurfaceMaximumY: number;
}>;

export type GreaterRealmVoxelPrefabPlan = GreaterRealmVoxelGeometryPlan & Readonly<{
  kind: GreaterRealmVoxelPrefabKind;
  graphicsProfile: GreaterRealmGraphicsProfile;
  description: string;
}>;

function materialForCell(cell: GreaterRealmPublicCellDto) {
  const shade = cell.presentationVariant & 1;
  if (cell.hydroRegime !== GREATER_REALM_HYDRO_REGIME.DRY) return 4 + shade;
  if (cell.geologicalBarrierBand > 0) return 2 + shade;
  if ([6, 7].includes(cell.biomeClass)) return 12 + shade;
  if ([11, 12, 13].includes(cell.biomeClass)) return 6 + shade;
  if ([20, 21, 22].includes(cell.biomeClass)) return 4 + shade;
  return shade;
}

function quantizedSurfaceIndex(cell: GreaterRealmPublicCellDto, verticalStep: number) {
  const elevation = Math.round((cell.elevation / 1_000) / verticalStep);
  return cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.DRY
    ? elevation
    : Math.min(elevation, Math.floor((cell.hydroSurfaceMilli / 1_000) / verticalStep));
}

function horizontalColumns(
  cells: readonly GreaterRealmPublicCellDto[],
  cellSize: number,
  horizontalStep: number
) {
  const columns = new Map<string, Readonly<{
    x: number;
    z: number;
    cell: GreaterRealmPublicCellDto;
  }>>();
  const ordered = [...cells].sort((left, right) => (
    left.atlasQ - right.atlasQ
    || left.atlasR - right.atlasR
    || left.cellKey.localeCompare(right.cellKey)
  ));
  for (const cell of ordered) {
    const center = axialToWorld({ q: cell.atlasQ, r: cell.atlasR }, cellSize);
    const minimumX = Math.floor((center.x - cellSize) / horizontalStep) - 1;
    const maximumX = Math.ceil((center.x + cellSize) / horizontalStep) + 1;
    const minimumZ = Math.floor((center.z - cellSize) / horizontalStep) - 1;
    const maximumZ = Math.ceil((center.z + cellSize) / horizontalStep) + 1;
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) {
          throw new RangeError('Greater Realm voxel grid exceeds safe integer coordinates.');
        }
        const sample = { x: (x + 0.5) * horizontalStep, z: (z + 0.5) * horizontalStep };
        const owner = worldToNearestAxial(sample, cellSize);
        if (owner.q !== cell.atlasQ || owner.r !== cell.atlasR) continue;
        const key = `${x},${z}`;
        if (!columns.has(key)) columns.set(key, Object.freeze({ x, z, cell }));
      }
    }
  }
  return columns;
}

function sourceVoxels(
  cells: readonly GreaterRealmPublicCellDto[],
  cellSize: number,
  horizontalStep: number,
  verticalStep: number,
  anchor: Readonly<{ x: number; y: number; z: number }>,
  depth: number
) {
  const voxels = new Map<string, VoxelCell>();
  for (const column of horizontalColumns(cells, cellSize, horizontalStep).values()) {
    const surface = quantizedSurfaceIndex(column.cell, verticalStep);
    if (!Number.isSafeInteger(surface)) {
      throw new RangeError('Greater Realm voxel elevation exceeds safe integer coordinates.');
    }
    const material = materialForCell(column.cell);
    for (let offset = 1; offset <= depth; offset += 1) {
      const voxel = Object.freeze({
        x: column.x - anchor.x,
        y: surface - offset - anchor.y,
        z: column.z - anchor.z,
        material
      });
      voxels.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel);
    }
  }
  return [...voxels.values()];
}

function cellListSignature(cells: readonly GreaterRealmPublicCellDto[]) {
  return [...cells].sort((left, right) => (
    left.atlasQ - right.atlasQ || left.atlasR - right.atlasR
    || left.cellKey.localeCompare(right.cellKey)
  )).map((cell) => [
    cell.cellKey, cell.atlasQ, cell.atlasR, cell.elevation, cell.biomeClass,
    cell.geologicalBarrierBand, cell.hydroRegime, cell.hydroSurfaceMilli,
    cell.coastDistance, cell.wetness, cell.featureClass, cell.presentationVariant
  ].join(',')).join(';');
}

export function createGreaterRealmVoxelTerrainPlan(input: Readonly<{
  cells: readonly GreaterRealmPublicCellDto[];
  occluderCells?: readonly GreaterRealmPublicCellDto[];
  graphicsProfile: GreaterRealmGraphicsProfile;
  cellSize: number;
}>): GreaterRealmVoxelTerrainPlan {
  if (!Number.isFinite(input.cellSize) || input.cellSize <= 0) {
    throw new RangeError('Greater Realm voxel cellSize must be positive and finite.');
  }
  const profile = GREATER_REALM_VOXEL_PROFILES[input.graphicsProfile];
  const horizontalStep = input.cellSize / profile.horizontalDivisor;
  const verticalStep = input.cellSize / profile.verticalDivisor;
  const contextCells = input.occluderCells ?? [];
  const emittingColumns = horizontalColumns(input.cells, input.cellSize, horizontalStep);
  const contextColumns = horizontalColumns(contextCells, input.cellSize, horizontalStep);
  const anchorColumns = emittingColumns.size > 0 ? emittingColumns : contextColumns;
  const surfaces = [...anchorColumns.values()].map((column) => (
    quantizedSurfaceIndex(column.cell, verticalStep)
  ));
  const depth = input.graphicsProfile === 'high' ? 4 : input.graphicsProfile === 'balanced' ? 3 : 2;
  const anchor = Object.freeze({
    x: anchorColumns.size === 0 ? 0 : Math.min(...[...anchorColumns.values()].map((row) => row.x)),
    y: surfaces.length === 0 ? 0 : Math.min(...surfaces) - depth,
    z: anchorColumns.size === 0 ? 0 : Math.min(...[...anchorColumns.values()].map((row) => row.z))
  });
  const voxels = sourceVoxels(
    input.cells, input.cellSize, horizontalStep, verticalStep, anchor, depth
  );
  const occluders = sourceVoxels(
    contextCells, input.cellSize, horizontalStep, verticalStep, anchor, depth
  );
  const surfacePlan = planVoxelSurface({
    voxels,
    occluders,
    maximumVoxels: profile.maximumVoxels,
    maximumFaces: profile.maximumFaces
  });
  if (surfacePlan.mergedQuadCount > profile.maximumTerrainQuads) {
    throw new RangeError(
      `Greater Realm terrain exceeds maximumTerrainQuads (${profile.maximumTerrainQuads}).`
    );
  }
  const origin = Object.freeze({
    x: anchor.x * horizontalStep,
    y: anchor.y * verticalStep,
    z: anchor.z * horizontalStep
  });
  const signature = [
    'greater-realm-voxel-terrain-v1', input.graphicsProfile,
    surfacePlan.signature, cellListSignature(input.cells), cellListSignature(contextCells)
  ].join('|');
  return Object.freeze({
    kind: 'terrain',
    graphicsProfile: input.graphicsProfile,
    surfacePlan,
    origin,
    scale: Object.freeze({ x: horizontalStep, y: verticalStep, z: horizontalStep }),
    uploadBytes: surfacePlan.uploadBytes,
    signature,
    emittingCellCount: input.cells.length,
    contextCellCount: contextCells.length,
    quantizedSurfaceMinimumY: surfaces.length === 0 ? 0 : Math.min(...surfaces) * verticalStep,
    quantizedSurfaceMaximumY: surfaces.length === 0 ? 0 : Math.max(...surfaces) * verticalStep
  });
}

export function createGreaterRealmVoxelTerrainFallbackPlan(input: Readonly<{
  cells: readonly GreaterRealmPublicCellDto[];
  occluderCells: readonly GreaterRealmPublicCellDto[];
  graphicsProfile: GreaterRealmGraphicsProfile;
  cellSize: number;
  reason: string;
}>): GreaterRealmVoxelTerrainPlan {
  const surfacePlan = planVoxelSurface({
    voxels: [], maximumVoxels: 0, maximumFaces: 0
  });
  const signature = [
    'greater-realm-voxel-terrain-fallback-v1', input.graphicsProfile,
    input.cellSize, input.reason, cellListSignature(input.cells),
    cellListSignature(input.occluderCells)
  ].join('|');
  return Object.freeze({
    kind: 'terrain',
    graphicsProfile: input.graphicsProfile,
    surfacePlan,
    origin: Object.freeze({ x: 0, y: 0, z: 0 }),
    scale: Object.freeze({ x: 1, y: 1, z: 1 }),
    uploadBytes: 0,
    signature,
    emittingCellCount: input.cells.length,
    contextCellCount: input.occluderCells.length,
    quantizedSurfaceMinimumY: 0,
    quantizedSurfaceMaximumY: 0
  });
}

function prefabVoxels(kind: GreaterRealmVoxelPrefabKind) {
  const voxels = new Map<string, VoxelCell>();
  const put = (x: number, y: number, z: number, material: number) => {
    voxels.set(`${x},${y},${z}`, Object.freeze({ x, y, z, material }));
  };
  const box = (
    minimumX: number, maximumX: number, minimumY: number, maximumY: number,
    minimumZ: number, maximumZ: number, material: number
  ) => {
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        for (let z = minimumZ; z <= maximumZ; z += 1) put(x, y, z, material);
      }
    }
  };
  if (kind === 'castle') {
    box(-2, 2, 0, 5, -2, 2, 8);
    for (const [x, z] of [[-3, -3], [-3, 2], [2, -3], [2, 2]] as const) {
      box(x, x + 1, 0, 6, z, z + 1, 9);
    }
    for (let value = -2; value <= 2; value += 2) {
      put(value, 6, -2, 9); put(value, 6, 2, 9);
      put(-2, 6, value, 9); put(2, 6, value, 9);
    }
  } else if (kind === 'ruin') {
    box(-3, 2, 0, 1, -1, -1, 8);
    box(-3, -2, 0, 3, -1, 2, 8);
    box(1, 2, 0, 2, -1, 0, 9);
    put(-1, 2, -1, 9); put(-3, 4, 1, 9);
  } else if (kind === 'signpost') {
    box(0, 0, 0, 5, 0, 0, 10);
    box(-2, 2, 4, 4, 0, 0, 10);
    put(2, 3, 0, 7);
  } else if (kind === 'waystone') {
    box(-1, 1, 0, 1, -1, 1, 3);
    box(-1, 1, 2, 3, 0, 0, 13);
    box(0, 0, 2, 5, -1, 1, 13);
    put(0, 6, 0, 15);
  } else {
    box(0, 0, 0, 6, 0, 0, 10);
    box(-1, 1, 5, 7, -1, 1, 11);
    put(0, 8, 0, 7);
  }
  return [...voxels.values()];
}

const PREFAB_DESCRIPTIONS: Readonly<Record<GreaterRealmVoxelPrefabKind, string>> = Object.freeze({
  castle: 'keep-four-towers-battlements',
  ruin: 'broken-ruin-walls',
  signpost: 'post-crossbar',
  waystone: 'upright-tapered-waystone',
  'lamp-post': 'post-lantern'
});

export function createGreaterRealmVoxelPrefabPlan(input: Readonly<{
  kind: GreaterRealmVoxelPrefabKind;
  graphicsProfile: GreaterRealmGraphicsProfile;
  cellSize: number;
}>): GreaterRealmVoxelPrefabPlan {
  if (!Number.isFinite(input.cellSize) || input.cellSize <= 0) {
    throw new RangeError('Greater Realm voxel prefab cellSize must be positive and finite.');
  }
  const voxels = prefabVoxels(input.kind);
  const surfacePlan = planVoxelSurface({
    voxels, maximumVoxels: 1_024, maximumFaces: 4_096
  });
  const voxelScale = input.cellSize / (input.kind === 'castle' ? 12 : 16);
  const signature = `greater-realm-voxel-prefab-v1|${input.graphicsProfile}|${input.kind}|${surfacePlan.signature}`;
  return Object.freeze({
    kind: input.kind,
    graphicsProfile: input.graphicsProfile,
    description: PREFAB_DESCRIPTIONS[input.kind],
    surfacePlan,
    origin: Object.freeze({ x: 0, y: 0, z: 0 }),
    scale: Object.freeze({ x: voxelScale, y: voxelScale, z: voxelScale }),
    uploadBytes: surfacePlan.uploadBytes,
    signature
  });
}

export function createGreaterRealmVoxelGeometry(plan: GreaterRealmVoxelGeometryPlan) {
  const data = createVoxelSurfaceMeshData(plan.surfacePlan);
  const positions = new Float32Array(data.positions.length);
  for (let index = 0; index < data.positions.length; index += 3) {
    positions[index] = data.positions[index]! * plan.scale.x;
    positions[index + 1] = data.positions[index + 1]! * plan.scale.y;
    positions[index + 2] = data.positions[index + 2]! * plan.scale.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3, true));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.greaterRealmVoxelSignature = plan.signature;
  geometry.userData.greaterRealmVoxelUploadBytes = data.uploadBytes;
  return geometry;
}
