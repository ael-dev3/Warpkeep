import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  allInnerKeepStaticRuntimeAssetIds,
  createInnerKeepAuthoredBuilding,
  createInnerKeepAuthoredStaticPresentation,
  hasCompleteInnerKeepStaticRuntimeCoverage,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
  planInnerKeepAuthoredPerimeterTrees,
} from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import {
  INNER_KEEP_AMBIENT_ACTOR_CATALOG,
  INNER_KEEP_AMBIENT_EXCLUSIONS,
  INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
  INNER_KEEP_AMBIENT_ROUTES,
  innerKeepAmbientActorFootprintHalfExtents,
  type InnerKeepAmbientActorCategory,
  type InnerKeepAmbientRoute,
} from '../src/components/inner-keep/innerKeepAmbientPolicy';
import { INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS } from '../src/components/inner-keep/innerKeepFixedPlacementExclusions';
import { INNER_KEEP_PRESENTATION_ASSETS } from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import type {
  InnerKeepRuntimeAssetBundle,
  InnerKeepRuntimePrefab,
} from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

function prefab(
  id: string,
  boundsMeters: readonly [number, number, number] = [1, 1, 1],
): InnerKeepRuntimePrefab {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));
  return Object.freeze({
    id,
    root,
    clips: Object.freeze([]),
    boundsMeters: Object.freeze([...boundsMeters] as [number, number, number]),
    triangles: 12,
    drawCalls: 1,
    animated: false,
    mounted: false,
    clone: () => root.clone(true),
  });
}

function fullStaticBundle(): InnerKeepRuntimeAssetBundle {
  const boundsById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
    [asset.assetId, asset.boundsMeters] as const
  )));
  const staticPrefabs = new Map(
    allInnerKeepStaticRuntimeAssetIds().map((id) => [
      id,
      prefab(id, boundsById.get(id) ?? [1, 1, 1]),
    ] as const),
  );
  return Object.freeze({
    staticPrefabs,
    populationPrefabs: new Map(),
    failures: Object.freeze([]),
    dispose: () => {},
  });
}

function segmentTouchesExpandedAabb(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  center: readonly [number, number],
  halfExtents: readonly [number, number],
  expansionMeters: number,
) {
  const minimum = [
    center[0] - halfExtents[0] - expansionMeters,
    center[1] - halfExtents[1] - expansionMeters,
  ] as const;
  const maximum = [
    center[0] + halfExtents[0] + expansionMeters,
    center[1] + halfExtents[1] + expansionMeters,
  ] as const;
  const origin = [from.x, from.z] as const;
  const delta = [to.x - from.x, to.z - from.z] as const;
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 2; axis += 1) {
    if (Math.abs(delta[axis]!) <= 0.000_001) {
      if (origin[axis]! < minimum[axis]! || origin[axis]! > maximum[axis]!) {
        return false;
      }
      continue;
    }
    const inverse = 1 / delta[axis]!;
    let near = (minimum[axis]! - origin[axis]!) * inverse;
    let far = (maximum[axis]! - origin[axis]!) * inverse;
    if (near > far) [near, far] = [far, near];
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return false;
  }
  return true;
}

function routeCategories(route: InnerKeepAmbientRoute): readonly InnerKeepAmbientActorCategory[] {
  if (route.kind === 'citizen-approach') return ['citizen'];
  if (route.kind === 'civic-mounted-loop') return ['civic-mounted'];
  if (route.kind === 'mounted-patrol-loop') return ['mounted-patrol'];
  return ['citizen', 'foot-patrol'];
}

function exactRouteSweepRadius(
  route: InnerKeepAmbientRoute,
  quality: 'high' | 'balanced' | 'reduced',
) {
  const categories = new Set(routeCategories(route));
  return Math.max(
    route.actorRadiusMeters,
    ...INNER_KEEP_AMBIENT_ACTOR_CATALOG
      .filter(({ category }) => categories.has(category))
      .map((actor) => Math.hypot(
        ...innerKeepAmbientActorFootprintHalfExtents(actor, quality),
      )),
  );
}

function aabbsOverlap(
  leftCenter: readonly [number, number],
  leftHalfExtents: readonly [number, number],
  rightCenter: readonly [number, number],
  rightHalfExtents: readonly [number, number],
  clearanceMeters: number,
) {
  return Math.abs(leftCenter[0] - rightCenter[0])
      <= leftHalfExtents[0] + rightHalfExtents[0] + clearanceMeters
    && Math.abs(leftCenter[1] - rightCenter[1])
      <= leftHalfExtents[1] + rightHalfExtents[1] + clearanceMeters;
}

function renderComplexity(root: THREE.Object3D) {
  let drawCalls = 0;
  let triangles = 0;
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;
    const primitiveTriangles = object.geometry.index
      ? Math.floor(object.geometry.index.count / 3)
      : Math.floor((object.geometry.getAttribute('position')?.count ?? 0) / 3);
    drawCalls += Array.isArray(object.material)
      ? object.geometry.groups.length || object.material.length
      : 1;
    triangles += primitiveTriangles * instanceCount;
  });
  return { drawCalls, triangles };
}

describe('authored Inner Keep presentation composition', () => {
  it('makes the Cathedral the northern anchor and Barracks the western garrison', () => {
    const presentation = createInnerKeepAuthoredStaticPresentation({
      bundle: fullStaticBundle(),
      quality: 'balanced',
      visualSeed: 42,
    });
    const cathedral = presentation.group.getObjectByName(
      'inner-keep-authored-placement:grand-covenant-cathedral-main-building',
    );
    const barracks = presentation.group.getObjectByName(
      'inner-keep-authored-placement:shieldcourt-barracks-west-garrison',
    );
    expect(cathedral?.position.toArray()).toEqual([0, 0, -11.8]);
    expect(cathedral?.scale.toArray()).toEqual([0.3, 0.3, 0.3]);
    expect(barracks?.position.toArray()).toEqual([-12.7, 0, -0.4]);
    expect(barracks?.scale.toArray()).toEqual([0.36, 0.36, 0.36]);
    expect(presentation).toMatchObject({
      loadedAssetCount: 38,
      cathedralReady: true,
      barracksReady: true,
    });
    expect(presentation.authoredTreeCount).toBeGreaterThan(0);
  });

  it('clones an exact economy prefab while keeping reveal opacity local', () => {
    const source = prefab('city-mill');
    const bundle: InnerKeepRuntimeAssetBundle = Object.freeze({
      staticPrefabs: new Map([['city-mill', source]]),
      populationPrefabs: new Map(),
      failures: Object.freeze([]),
      dispose: () => {},
    });
    const disposableMaterials = new Set<THREE.Material>();
    const building = createInnerKeepAuthoredBuilding({
      bundle,
      buildingKind: 'city-mill',
      completedLevel: 5,
      disposableMaterials,
    });
    expect(building?.name).toBe('inner-keep-completed-building:city-mill');
    expect(building?.scale.x).toBeCloseTo(0.33);
    const sourceMaterial = (source.root.children[0] as THREE.Mesh).material;
    let clonedMaterial: THREE.Material | THREE.Material[] | undefined;
    building?.traverse((object) => {
      if (!clonedMaterial && object instanceof THREE.Mesh) clonedMaterial = object.material;
    });
    expect(clonedMaterial).not.toBe(sourceMaterial);
    expect(disposableMaterials.has(clonedMaterial as THREE.Material)).toBe(true);
    disposableMaterials.forEach((material) => material.dispose());
  });

  it('instances repeated fixed assets and trees without dropping stable placements', () => {
    const presentation = createInnerKeepAuthoredStaticPresentation({
      bundle: fullStaticBundle(),
      quality: 'balanced',
      visualSeed: 42,
    });
    const stablePlacementMarkers: THREE.Object3D[] = [];
    const stableTreeMarkers: THREE.Object3D[] = [];
    presentation.group.traverse((object) => {
      if (object.name.startsWith('inner-keep-authored-placement:')) {
        stablePlacementMarkers.push(object);
      }
      if (object.name.startsWith('inner-keep-authored-perimeter-tree:')) {
        stableTreeMarkers.push(object);
      }
    });
    const wallInstances = presentation.group.getObjectByName(
      'inner-keep-authored-instanced-asset:palisade-wall-straight-8m',
    )?.children[0] as THREE.InstancedMesh;
    const complexity = renderComplexity(presentation.group);

    expect(presentation.placementInstanceCount).toBe(67);
    expect(stablePlacementMarkers).toHaveLength(67);
    expect(stableTreeMarkers).toHaveLength(presentation.authoredTreeCount);
    expect(wallInstances).toBeInstanceOf(THREE.InstancedMesh);
    expect(wallInstances.count).toBe(12);
    // One fake primitive per fixed asset group plus one per perimeter species.
    expect(complexity.drawCalls).toBe(36);
    expect(complexity.triangles).toBe(
      (presentation.placementInstanceCount + presentation.authoredTreeCount) * 12,
    );
  });

  it('prioritizes landmark downloads before the rest of the static catalog', () => {
    expect(allInnerKeepStaticRuntimeAssetIds().slice(0, 2)).toEqual([
      'grand-covenant-cathedral',
      'city-barracks',
    ]);
  });

  it('requires all 38 exact static prefabs before an authored/fallback swap', () => {
    const complete = fullStaticBundle();
    const partial = Object.freeze({
      ...complete,
      staticPrefabs: new Map([...complete.staticPrefabs].slice(0, -1)),
    });
    expect(hasCompleteInnerKeepStaticRuntimeCoverage(complete)).toBe(true);
    expect(hasCompleteInnerKeepStaticRuntimeCoverage(partial)).toBe(false);
  });

  it('fills every quality budget from a bounded deterministic collision-free tree pool', () => {
    const bundle = fullStaticBundle();
    const stableVisualSeeds = [
      0,
      1,
      7,
      42,
      99,
      0x1234_5678,
      975_150_069,
      0x7fff_ffff,
      0xffff_ffff,
    ] as const;
    const qualities = [
      { quality: 'high', count: 18 },
      { quality: 'balanced', count: 12 },
      { quality: 'reduced', count: 6 },
    ] as const;
    const assetById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
      [asset.assetId, asset] as const
    )));

    for (const visualSeed of stableVisualSeeds) {
      for (const { quality, count } of qualities) {
        const plan = planInnerKeepAuthoredPerimeterTrees({
          bundle,
          quality,
          visualSeed,
        });
        expect(plan).toHaveLength(count);
        expect(planInnerKeepAuthoredPerimeterTrees({
          bundle,
          quality,
          visualSeed,
        })).toEqual(plan);

        plan.forEach((tree, treeIndex) => {
          expect(tree.candidateIndex).toBeGreaterThanOrEqual(0);
          expect(tree.candidateIndex).toBeLessThan(
            INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT,
          );
          const asset = assetById.get(tree.speciesId)!;
          const scale = tree.scalePermille[0] / 1_000;
          const radians = tree.rotationMilliDegrees[1] / 1_000 * Math.PI / 180;
          const cosine = Math.abs(Math.cos(radians));
          const sine = Math.abs(Math.sin(radians));
          const halfX = asset.boundsMeters[0] * scale * 0.5;
          const halfZ = asset.boundsMeters[2] * scale * 0.5;
          expect(tree.halfExtentsMeters[0]).toBeCloseTo(
            cosine * halfX + sine * halfZ,
            10,
          );
          expect(tree.halfExtentsMeters[1]).toBeCloseTo(
            sine * halfX + cosine * halfZ,
            10,
          );
          const center = [tree.positionMeters[0], tree.positionMeters[2]] as const;

          for (const fixed of INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS) {
            expect(aabbsOverlap(
              center,
              tree.halfExtentsMeters,
              [fixed.center.x, fixed.center.z],
              fixed.halfExtentsMeters,
              fixed.clearanceMarginMeters,
            ), `${visualSeed}:${quality}:${tree.name}:${fixed.placementId}`).toBe(false);
          }
          for (const exclusion of INNER_KEEP_AMBIENT_EXCLUSIONS) {
            expect(aabbsOverlap(
              center,
              tree.halfExtentsMeters,
              [exclusion.center.x, exclusion.center.z],
              exclusion.halfExtentsMeters,
              exclusion.additionalClearanceMeters,
            ), `${visualSeed}:${quality}:${tree.name}:${exclusion.exclusionId}`).toBe(false);
          }
          for (const route of INNER_KEEP_AMBIENT_ROUTES) {
            const expansion = exactRouteSweepRadius(route, quality)
              + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS;
            const points = route.path.points;
            const segmentCount = route.path.closed ? points.length : points.length - 1;
            for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
              expect(segmentTouchesExpandedAabb(
                points[segmentIndex]!,
                points[(segmentIndex + 1) % points.length]!,
                center,
                tree.halfExtentsMeters,
                expansion,
              ), `${visualSeed}:${quality}:${tree.name}:${route.routeId}`).toBe(false);
            }
          }
          for (const previous of plan.slice(0, treeIndex)) {
            expect(aabbsOverlap(
              center,
              tree.halfExtentsMeters,
              [previous.positionMeters[0], previous.positionMeters[2]],
              previous.halfExtentsMeters,
              INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
            ), `${visualSeed}:${quality}:${tree.name}:${previous.name}`).toBe(false);
          }
        });
      }
    }
  });
});
