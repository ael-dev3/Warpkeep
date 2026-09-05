import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import { decodeGreaterRealmPublicCellDto } from '../src/greater-realm/greaterRealmPublicContract';
import {
  GREATER_REALM_VOXEL_PROFILES,
  createGreaterRealmVoxelGeometry,
  createGreaterRealmVoxelPrefabPlan,
  createGreaterRealmVoxelTerrainPlan,
  type GreaterRealmVoxelPrefabKind
} from '../src/components/realm/greaterRealmVoxelPresentation';

const fixtureChunk = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]!;

describe('Greater Realm voxel presentation adapter', () => {
  it('pins the three sampling and meshing profiles', () => {
    expect(GREATER_REALM_VOXEL_PROFILES).toEqual({
      high: {
        horizontalDivisor: 4, verticalDivisor: 8,
        maximumVoxels: 32_768, maximumFaces: 32_768, maximumTerrainQuads: 4_096
      },
      balanced: {
        horizontalDivisor: 2, verticalDivisor: 4,
        maximumVoxels: 16_384, maximumFaces: 16_384, maximumTerrainQuads: 2_048
      },
      reduced: {
        horizontalDivisor: 1, verticalDivisor: 2,
        maximumVoxels: 8_192, maximumFaces: 8_192, maximumTerrainQuads: 512
      }
    });
  });

  it.each(['high', 'balanced', 'reduced'] as const)(
    'creates bounded indexed voxel terrain for the public fixture at %s quality',
    (graphicsProfile) => {
      const terrain = createGreaterRealmVoxelTerrainPlan({
        cells: [...fixtureChunk.coreCells, ...fixtureChunk.apronCells],
        occluderCells: [...fixtureChunk.coreCells, ...fixtureChunk.apronCells],
        graphicsProfile,
        cellSize: 1
      });
      const geometry = createGreaterRealmVoxelGeometry(terrain);
      const profile = GREATER_REALM_VOXEL_PROFILES[graphicsProfile];

      expect(terrain.surfacePlan.occupiedVoxelCount).toBeGreaterThan(0);
      expect(terrain.surfacePlan.mergedQuadCount).toBeGreaterThan(0);
      expect(terrain.surfacePlan.mergedQuadCount).toBeLessThanOrEqual(
        profile.maximumTerrainQuads
      );
      expect(terrain.uploadBytes).toBe(terrain.surfacePlan.mergedQuadCount * 96);
      expect(geometry.index).not.toBeNull();
      expect(geometry.getAttribute('position').count).toBe(
        terrain.surfacePlan.mergedQuadCount * 4
      );
      expect(geometry.getAttribute('normal').normalized).toBe(true);
      expect(geometry.getAttribute('color').normalized).toBe(true);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      geometry.dispose();
    }
  );

  it('keeps context non-emitting while including the full halo in identity', () => {
    const emitted = fixtureChunk.coreCells.slice(0, 1);
    const halo = fixtureChunk.apronCells.slice(0, 1);
    const baseline = createGreaterRealmVoxelTerrainPlan({
      cells: emitted,
      occluderCells: halo,
      graphicsProfile: 'high',
      cellSize: 1
    });
    const contextChanged = structuredClone(halo) as any[];
    contextChanged[0].presentationVariant += 1;
    const changed = createGreaterRealmVoxelTerrainPlan({
      cells: emitted,
      occluderCells: contextChanged,
      graphicsProfile: 'high',
      cellSize: 1
    });
    const emittedOnly = createGreaterRealmVoxelTerrainPlan({
      cells: emitted,
      graphicsProfile: 'high',
      cellSize: 1
    });

    expect(baseline.emittingCellCount).toBe(1);
    expect(baseline.surfacePlan.occupiedVoxelCount).toBe(
      emittedOnly.surfacePlan.occupiedVoxelCount
    );
    expect(baseline.signature).not.toBe(changed.signature);
    expect(baseline.surfacePlan.signature).not.toBe(changed.surfacePlan.signature);
  });

  it('quantizes elevated wet cells coherently and anchors signed-i32 atlas coordinates', () => {
    const raw = structuredClone(fixtureChunk.coreCells[0]) as any;
    Object.assign(raw, {
      atlasQ: -2_147_483_648,
      atlasR: 2_147_483_647,
      elevation: 2_375,
      hydroRegime: 3,
      hydroBodyId: 'GRW-AAAAAAAAAAAAAAAAAAAAAAAAAA',
      hydroDepthClass: 1,
      hydroSurfaceMilli: 2_500,
      wetness: 9_000,
      hydrologyRevision: 1
    });
    const cell = decodeGreaterRealmPublicCellDto(raw);
    const terrain = createGreaterRealmVoxelTerrainPlan({
      cells: [cell], graphicsProfile: 'high', cellSize: 1
    });
    const geometry = createGreaterRealmVoxelGeometry(terrain);
    const box = geometry.boundingBox!;

    expect(Object.values(terrain.origin).every(Number.isFinite)).toBe(true);
    expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x))).toBeLessThan(4);
    expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(4);
    expect(terrain.quantizedSurfaceMaximumY).toBeCloseTo(2.375, 8);
    expect(terrain.quantizedSurfaceMaximumY).toBeLessThanOrEqual(cell.hydroSurfaceMilli / 1_000);
    geometry.dispose();
  });

  it('never rounds an elevated wet terrain surface through its water plane', () => {
    const raw = structuredClone(fixtureChunk.coreCells[0]) as any;
    Object.assign(raw, {
      elevation: 124,
      hydroRegime: 3,
      hydroBodyId: 'GRW-AAAAAAAAAAAAAAAAAAAAAAAAAA',
      hydroDepthClass: 1,
      hydroSurfaceMilli: 124,
      wetness: 9_000,
      hydrologyRevision: 1
    });
    const cell = decodeGreaterRealmPublicCellDto(raw);
    const terrain = createGreaterRealmVoxelTerrainPlan({
      cells: [cell], graphicsProfile: 'high', cellSize: 1
    });

    expect(terrain.quantizedSurfaceMaximumY)
      .toBeLessThanOrEqual(cell.hydroSurfaceMilli / 1_000);
  });

  it('builds distinct voxel silhouettes and keeps the 600-castle layer under 65536 bytes', () => {
    const kinds: GreaterRealmVoxelPrefabKind[] = [
      'castle', 'ruin', 'signpost', 'waystone', 'lamp-post'
    ];
    const rows = kinds.map((kind) => createGreaterRealmVoxelPrefabPlan({
      kind, graphicsProfile: 'balanced', cellSize: 1
    }));

    expect(new Set(rows.map((row) => row.signature)).size).toBe(kinds.length);
    expect(rows.every((row) => row.surfacePlan.occupiedVoxelCount > 0)).toBe(true);
    expect(rows.every((row) => row.surfacePlan.mergedQuadCount > 6)).toBe(true);
    const castle = rows[0]!;
    expect(castle.description).toBe('keep-four-towers-battlements');
    expect(castle.uploadBytes + 600 * (16 * 4 + 3 * 4)).toBeLessThanOrEqual(65_536);

    const boxes = rows.map((row) => {
      const geometry = createGreaterRealmVoxelGeometry(row);
      const box = geometry.boundingBox!.clone();
      geometry.dispose();
      return box;
    });
    expect(boxes[0]!.getSize(new THREE.Vector3()).x).toBeGreaterThan(
      boxes[1]!.getSize(new THREE.Vector3()).x
    );
    expect(boxes[2]!.getSize(new THREE.Vector3()).x).toBeGreaterThan(
      boxes[3]!.getSize(new THREE.Vector3()).x
    );
    expect(boxes[4]!.getSize(new THREE.Vector3()).y).toBeGreaterThan(
      boxes[1]!.getSize(new THREE.Vector3()).y
    );
  });
});
