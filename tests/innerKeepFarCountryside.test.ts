import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  createInnerKeepFarCountryside,
  createInnerKeepFarCountrysideRenderedTerrainSampler,
  innerKeepFarCountrysideTerrainHeightIsBounded,
} from '../src/components/inner-keep/createInnerKeepFarCountryside';
import type { InnerKeepSceneQuality } from '../src/components/inner-keep/createInnerKeepSceneLayer';
import {
  INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY,
  INNER_KEEP_FAR_COUNTRYSIDE_CAMERA,
  INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION,
  INNER_KEEP_FAR_COUNTRYSIDE_POLICY_DIGEST,
  INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS,
  canonicalInnerKeepFarCountrysideDigestInput,
  innerKeepFarCountrysideMinimumZoomForAspect,
} from '../src/components/inner-keep/innerKeepFarCountrysidePolicy';
import {
  createInnerKeepOuterWorldRenderedTerrainSampler,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import { INNER_KEEP_TOWN_TONAL_PALETTE } from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';

afterEach(() => {
  vi.restoreAllMocks();
});

const EXPECTED_TERRAIN_TRIANGLES = Object.freeze({
  high: 9_760,
  balanced: 5_632,
  reduced: 2_120,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);
const EXPECTED_FIELD_PARCELS = Object.freeze({
  high: 820,
  balanced: 648,
  reduced: 360,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);
const EXPECTED_TOTAL_TRIANGLES = Object.freeze({
  high: 12_768,
  balanced: 7_464,
  reduced: 3_036,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);
const EXPECTED_VISIBLE_HEDGEROWS = Object.freeze({
  high: Object.freeze([7, 21, 16] as const),
  balanced: Object.freeze([4, 11, 10] as const),
  reduced: Object.freeze([0, 5, 4] as const),
} satisfies Readonly<Record<InnerKeepSceneQuality, readonly number[]>>);

function instancePosition(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, quaternion, scale);
  return Object.freeze({ position, scale });
}

function reviewedCamera(width: number, height: number) {
  const aspect = width / height;
  const portrait = aspect
    < INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.maximumAspectExclusive;
  const requestedZoom = portrait
    ? INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.initialZoom.portrait
    : INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.initialZoom.landscape;
  const zoom = Math.max(
    requestedZoom,
    innerKeepFarCountrysideMinimumZoomForAspect(aspect),
  );
  const halfHeight = Math.max(
    (portrait
      ? INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.baseHalfHeight
      : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight) / zoom,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / zoom / aspect,
  );
  const halfWidth = halfHeight * aspect;
  const camera = new THREE.OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.near,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.far,
  );
  camera.position.fromArray(portrait
    ? INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.portrait.positionMeters
    : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters);
  camera.lookAt(...(portrait
    ? INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.portrait.targetMeters
    : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.targetMeters));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return Object.freeze({ camera, halfWidth, halfHeight });
}

describe('Inner Keep far countryside presentation', () => {
  it('pins a non-authoritative overscan policy to the reviewed camera contract', () => {
    expect(INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION)
      .toBe('inner-keep-far-countryside-presentation-v2-expanded-town');
    expect(createHash('sha256')
      .update(canonicalInnerKeepFarCountrysideDigestInput())
      .digest('hex')).toBe(INNER_KEEP_FAR_COUNTRYSIDE_POLICY_DIGEST);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS)
      .toBe(INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS).toEqual([208, 272]);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS).toBe(20);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS).toBe(24);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS).toBe(32);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS).toBe(16);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY).toEqual({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      pickable: false,
      changesCanonicalLayoutDigest: false,
      sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
      authoritativeTerrain: false,
      authoritativeResourceNodes: 0,
    });
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.sourcePresentationLayoutDigest)
      .toBe(INNER_KEEP_PRESENTATION_LAYOUT_DIGEST);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters).toEqual({
      x: [-9, 9],
      z: [-9, 9],
    });
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panScreenTrackingRatio).toBe(0.2);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.x[0])
      .toBeGreaterThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.panBoundsMeters.x[0]);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.x[1])
      .toBeLessThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.panBoundsMeters.x[1]);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.z[0])
      .toBeGreaterThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.panBoundsMeters.z[0]);
    expect(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.z[1])
      .toBeLessThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.panBoundsMeters.z[1]);
  });

  it('uses viewport-aware framing without exceeding the canonical zoom range', () => {
    expect(innerKeepFarCountrysideMinimumZoomForAspect(1440 / 900)).toBeCloseTo(0.8, 8);
    expect(innerKeepFarCountrysideMinimumZoomForAspect(844 / 390))
      .toBeCloseTo(0.8656410256, 8);
    expect(innerKeepFarCountrysideMinimumZoomForAspect(390 / 844)).toBeCloseTo(0.8, 8);
    expect(innerKeepFarCountrysideMinimumZoomForAspect(320 / 800)).toBeCloseTo(0.9, 8);
    expect(innerKeepFarCountrysideMinimumZoomForAspect(0.2)).toBeCloseTo(1.8, 8);
    expect(innerKeepFarCountrysideMinimumZoomForAspect(6)).toBeCloseTo(2, 8);
    for (let index = 0; index <= 256; index += 1) {
      const aspect = 0.2 + index / 256 * 5.8;
      const zoom = innerKeepFarCountrysideMinimumZoomForAspect(aspect);
      expect(Number.isFinite(zoom)).toBe(true);
      expect(zoom).toBeGreaterThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum);
      expect(zoom).toBeLessThanOrEqual(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.maximum);
    }
  });

  for (const quality of ['high', 'balanced', 'reduced'] as const) {
    it(`renders a deterministic, grounded ${quality} countryside ring`, () => {
      const countryside = createInnerKeepFarCountryside(quality);
      expect(countryside.status).toBe('ready');
      expect(countryside.terrainTriangleCount).toBe(EXPECTED_TERRAIN_TRIANGLES[quality]);
      expect(countryside.triangleCount).toBe(EXPECTED_TOTAL_TRIANGLES[quality]);
      expect(countryside.drawCalls).toBe(4);
      expect(countryside.fieldParcelCount).toBe(EXPECTED_FIELD_PARCELS[quality]);
      expect(countryside.fieldTuftCount)
        .toBe(INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS[quality]);
      expect(countryside.hedgerowTreeCount)
        .toBe(INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS[quality]);

      const terrain = countryside.group.getObjectByName(
        'inner-keep-far-countryside-field-overscan',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(terrain).toBeInstanceOf(THREE.Mesh);
      terrain.geometry.computeBoundingBox();
      expect(terrain.geometry.boundingBox?.min.toArray()).toEqual([-208, expect.any(Number), -272]);
      expect(terrain.geometry.boundingBox?.max.toArray()).toEqual([208, expect.any(Number), 272]);
      expect(terrain.material.vertexColors).toBe(true);
      expect(terrain.userData).toMatchObject({
        presentationOnly: true,
        gameplayAuthorityClaimed: false,
        pickable: false,
      });
      const intersections: THREE.Intersection[] = [];
      terrain.raycast(new THREE.Raycaster(), intersections);
      expect(intersections).toEqual([]);

      const positions = terrain.geometry.getAttribute('position');
      const colors = terrain.geometry.getAttribute('color');
      const index = terrain.geometry.index!;
      const [innerX, innerZ] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
      const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
      const fog = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.skyFog);
      let outerColorCount = 0;
      for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
        const x = positions.getX(vertexIndex);
        const y = positions.getY(vertexIndex);
        const z = positions.getZ(vertexIndex);
        expect(innerKeepFarCountrysideTerrainHeightIsBounded(y)).toBe(true);
        if (Math.abs(x) === outerX || Math.abs(z) === outerZ) {
          outerColorCount += 1;
          expect(colors.getX(vertexIndex)).toBeCloseTo(fog.r, 6);
          expect(colors.getY(vertexIndex)).toBeCloseTo(fog.g, 6);
          expect(colors.getZ(vertexIndex)).toBeCloseTo(fog.b, 6);
        }
      }
      expect(outerColorCount).toBeGreaterThan(0);
      for (let triangle = 0; triangle < index.count; triangle += 3) {
        const a = index.getX(triangle);
        const b = index.getX(triangle + 1);
        const c = index.getX(triangle + 2);
        const centroidX = (
          positions.getX(a) + positions.getX(b) + positions.getX(c)
        ) / 3;
        const centroidZ = (
          positions.getZ(a) + positions.getZ(b) + positions.getZ(c)
        ) / 3;
        expect(
          Math.abs(centroidX) < innerX - 1e-6
          && Math.abs(centroidZ) < innerZ - 1e-6,
        ).toBe(false);
      }

      const fieldTufts = countryside.group.getObjectByName(
        'inner-keep-far-countryside-field-tufts',
      ) as THREE.InstancedMesh;
      expect(fieldTufts.count).toBe(countryside.fieldTuftCount);
      expect(fieldTufts.instanceColor).not.toBeNull();
      expect((fieldTufts.material as THREE.MeshStandardMaterial).vertexColors).toBe(false);
      for (let instanceIndex = 0; instanceIndex < fieldTufts.count; instanceIndex += 1) {
        const { position, scale } = instancePosition(fieldTufts, instanceIndex);
        expect(position.y - 0.17 * scale.y).toBeCloseTo(
          countryside.terrainHeightAt(position.x, position.z),
          5,
        );
      }
      const trunks = countryside.group.getObjectByName(
        'inner-keep-far-countryside-hedgerow-trunks',
      ) as THREE.InstancedMesh;
      expect(trunks.count).toBe(countryside.hedgerowTreeCount);
      for (let instanceIndex = 0; instanceIndex < trunks.count; instanceIndex += 1) {
        const { position, scale } = instancePosition(trunks, instanceIndex);
        expect(position.y - 0.275 * scale.y).toBeCloseTo(
          countryside.terrainHeightAt(position.x, position.z) - 0.08,
          5,
        );
      }
      const crowns = countryside.group.getObjectByName(
        'inner-keep-far-countryside-hedgerow-crowns',
      ) as THREE.InstancedMesh;
      expect(crowns.instanceColor).not.toBeNull();
      expect((crowns.material as THREE.MeshStandardMaterial).vertexColors).toBe(false);
      crowns.geometry.computeBoundingSphere();
      const crownSphere = crowns.geometry.boundingSphere!;
      const visibleByViewport = ([
        [1_440, 900],
        [844, 390],
        [390, 844],
      ] as const).map(([width, height]) => {
        const { camera, halfWidth, halfHeight } = reviewedCamera(width, height);
        let visible = 0;
        for (let instanceIndex = 0; instanceIndex < crowns.count; instanceIndex += 1) {
          const { position, scale } = instancePosition(crowns, instanceIndex);
          const radius = crownSphere.radius * Math.max(scale.x, scale.y, scale.z);
          const projected = position.project(camera);
          if (
            Math.abs(projected.x) <= 1 + radius / halfWidth
            && Math.abs(projected.y) <= 1 + radius / halfHeight
            && projected.z >= -1
            && projected.z <= 1
          ) visible += 1;
        }
        return visible;
      });
      expect(visibleByViewport).toEqual([...EXPECTED_VISIBLE_HEDGEROWS[quality]]);
      countryside.group.traverse((object) => {
        expect(object.userData).toMatchObject({
          presentationOnly: true,
          gameplayAuthorityClaimed: false,
          pickable: false,
        });
        if (!(object instanceof THREE.Mesh)) return;
        const intersections: THREE.Intersection[] = [];
        object.raycast(new THREE.Raycaster(), intersections);
        expect(intersections).toEqual([]);
      });

      const replay = createInnerKeepFarCountryside(quality);
      const replayTufts = replay.group.getObjectByName(
        'inner-keep-far-countryside-field-tufts',
      ) as THREE.InstancedMesh;
      const replayTrunks = replay.group.getObjectByName(
        'inner-keep-far-countryside-hedgerow-trunks',
      ) as THREE.InstancedMesh;
      expect([...replayTufts.instanceMatrix.array])
        .toEqual([...fieldTufts.instanceMatrix.array]);
      expect([...(replayTufts.instanceColor?.array ?? [])])
        .toEqual([...(fieldTufts.instanceColor?.array ?? [])]);
      expect([...replayTrunks.instanceMatrix.array])
        .toEqual([...trunks.instanceMatrix.array]);
      replay.dispose();
      countryside.dispose();
      expect(countryside.group.children).toHaveLength(0);
      countryside.dispose();
    });
  }

  it('aligns the far sampler to the detailed terrain along the complete seam', () => {
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const near = createInnerKeepOuterWorldRenderedTerrainSampler(quality);
      const far = createInnerKeepFarCountrysideRenderedTerrainSampler(quality);
      const [halfWidth, halfDepth] = INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS;
      for (let index = 0; index <= 256; index += 1) {
        const progress = index / 256;
        const z = THREE.MathUtils.lerp(-halfDepth, halfDepth, progress);
        const x = THREE.MathUtils.lerp(-halfWidth, halfWidth, progress);
        expect(far.heightAt(-halfWidth, z)).toBeCloseTo(near.heightAt(-halfWidth, z), 5);
        expect(far.heightAt(halfWidth, z)).toBeCloseTo(near.heightAt(halfWidth, z), 5);
        expect(far.heightAt(x, -halfDepth)).toBeCloseTo(near.heightAt(x, -halfDepth), 5);
        expect(far.heightAt(x, halfDepth)).toBeCloseTo(near.heightAt(x, halfDepth), 5);
      }
    }
  });

  it('matches the detailed terrain tint at the seam without tinting the fog rim', () => {
    const countryside = createInnerKeepFarCountryside('balanced');
    const terrain = countryside.group.getObjectByName(
      'inner-keep-far-countryside-field-overscan',
    ) as THREE.Mesh;
    const positions = terrain.geometry.getAttribute('position');
    const colors = terrain.geometry.getAttribute('color');
    const seamIndex = Array.from({ length: positions.count }, (_, index) => index)
      .find((index) => positions.getX(index) === -72 && positions.getZ(index) === 0)!;
    const rimIndex = Array.from({ length: positions.count }, (_, index) => index)
      .find((index) => positions.getX(index) === -208 && positions.getZ(index) === 0)!;
    const seamBase = new THREE.Color(
      colors.getX(seamIndex),
      colors.getY(seamIndex),
      colors.getZ(seamIndex),
    );
    const rimBase = new THREE.Color(
      colors.getX(rimIndex),
      colors.getY(rimIndex),
      colors.getZ(rimIndex),
    );
    const firstTint = new THREE.Color(0x759252);
    countryside.setDetailedTerrainTint(firstTint);
    expect(colors.getX(seamIndex)).toBeCloseTo(seamBase.r * firstTint.r, 6);
    expect(colors.getY(seamIndex)).toBeCloseTo(seamBase.g * firstTint.g, 6);
    expect(colors.getZ(seamIndex)).toBeCloseTo(seamBase.b * firstTint.b, 6);
    expect(colors.getX(rimIndex)).toBeCloseTo(rimBase.r, 6);
    expect(colors.getY(rimIndex)).toBeCloseTo(rimBase.g, 6);
    expect(colors.getZ(rimIndex)).toBeCloseTo(rimBase.b, 6);

    const secondTint = new THREE.Color(0x8a7a62);
    countryside.setDetailedTerrainTint(secondTint);
    expect(colors.getX(seamIndex)).toBeCloseTo(seamBase.r * secondTint.r, 6);
    expect(colors.getY(seamIndex)).toBeCloseTo(seamBase.g * secondTint.g, 6);
    expect(colors.getZ(seamIndex)).toBeCloseTo(seamBase.b * secondTint.b, 6);
    expect(colors.getX(rimIndex)).toBeCloseTo(rimBase.r, 6);
    expect(colors.getY(rimIndex)).toBeCloseTo(rimBase.g, 6);
    expect(colors.getZ(rimIndex)).toBeCloseTo(rimBase.b, 6);
    countryside.dispose();
  });

  it('stitches lighting normals across the detailed terrain and ring partitions', () => {
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const [widthSegments, depthSegments] =
        INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].terrainSegments;
      const detailed = new THREE.PlaneGeometry(144, 144, widthSegments, depthSegments);
      detailed.rotateX(-Math.PI / 2);
      const detailedSampler = createInnerKeepOuterWorldRenderedTerrainSampler(quality);
      const detailedPositions = detailed.getAttribute('position');
      for (let index = 0; index < detailedPositions.count; index += 1) {
        detailedPositions.setY(index, detailedSampler.heightAt(
          detailedPositions.getX(index),
          detailedPositions.getZ(index),
        ));
      }
      detailed.computeVertexNormals();
      const countryside = createInnerKeepFarCountryside(quality);
      countryside.stitchDetailedTerrainBoundaryNormals(detailed);
      const farTerrain = countryside.group.getObjectByName(
        'inner-keep-far-countryside-field-overscan',
      ) as THREE.Mesh;
      const detailedNormal = detailed.getAttribute('normal');
      const detailedByPosition = new Map<string, THREE.Vector3>();
      for (let index = 0; index < detailedPositions.count; index += 1) {
        const x = detailedPositions.getX(index);
        const z = detailedPositions.getZ(index);
        if (Math.abs(Math.abs(x) - 72) > 0.000_01
          && Math.abs(Math.abs(z) - 72) > 0.000_01) continue;
        detailedByPosition.set(`${x.toFixed(5)}:${z.toFixed(5)}`, new THREE.Vector3(
          detailedNormal.getX(index),
          detailedNormal.getY(index),
          detailedNormal.getZ(index),
        ));
      }
      const farPositions = farTerrain.geometry.getAttribute('position');
      const farNormals = farTerrain.geometry.getAttribute('normal');
      let compared = 0;
      for (let index = 0; index < farPositions.count; index += 1) {
        const expected = detailedByPosition.get(
          `${farPositions.getX(index).toFixed(5)}:${farPositions.getZ(index).toFixed(5)}`,
        );
        if (!expected) continue;
        compared += 1;
        expect(farNormals.getX(index)).toBeCloseTo(expected.x, 7);
        expect(farNormals.getY(index)).toBeCloseTo(expected.y, 7);
        expect(farNormals.getZ(index)).toBeCloseTo(expected.z, 7);
      }
      expect(compared).toBeGreaterThan(widthSegments * 2 + depthSegments * 2);
      countryside.dispose();
      detailed.dispose();
    }
  });

  it('disposes every owned GPU resource exactly once', () => {
    const countryside = createInnerKeepFarCountryside('balanced');
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    countryside.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      disposals.push(vi.spyOn(object.geometry, 'dispose'));
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) disposals.push(vi.spyOn(material, 'dispose'));
    });
    countryside.dispose();
    countryside.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes every staged resource when construction fails before commit', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    vi.spyOn(THREE.Group.prototype, 'add').mockImplementationOnce(() => {
      throw new Error('synthetic countryside commit failure');
    });

    expect(() => createInnerKeepFarCountryside('balanced'))
      .toThrow('synthetic countryside commit failure');
    expect(instanceDispose).toHaveBeenCalledTimes(3);
    expect(geometryDispose).toHaveBeenCalledTimes(4);
    expect(materialDispose).toHaveBeenCalledTimes(4);
  });
});
