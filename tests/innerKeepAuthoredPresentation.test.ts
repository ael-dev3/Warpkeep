import { createHash } from 'node:crypto';

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  allInnerKeepStaticRuntimeAssetIds,
  createInnerKeepAuthoredBuilding,
  createInnerKeepAuthoredStaticPresentation,
  hasCompleteInnerKeepStaticRuntimeCoverage,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_GROUND_LIFT_METERS,
  innerKeepAuthoredPerimeterTreeTrunkRadiusMeters,
  planInnerKeepAuthoredPerimeterTrees,
} from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import {
  innerKeepOuterWorldTreeTrunkRadiusMeters,
  innerKeepOuterWorldWildlifeFootprintRadiusMeters,
  planInnerKeepOuterWorldTrees,
  planInnerKeepOuterWorldWildlife,
} from '../src/components/inner-keep/createInnerKeepOuterWorldPresentation';
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
import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CLEARANCES,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_CITY_DISTRICT_ROADS,
  INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS,
  INNER_KEEP_CITY_EDGE_APRON_POINTS,
  INNER_KEEP_OUTER_WORLD_AMBIENT_LANES,
  INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS,
  INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  innerKeepOuterWorldTerrainHeightAt,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import {
  canonicalInnerKeepPalisadeVisualCorrectionDigestInput,
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES,
  INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES,
  INNER_KEEP_PALISADE_VISUAL_CORRECTION_DIGEST,
  INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY,
  INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS,
  INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';
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

function orientedRectangleCorners(
  center: readonly [number, number],
  halfExtents: readonly [number, number],
  yawRadians: number,
) {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  return [
    [-halfExtents[0], -halfExtents[1]],
    [halfExtents[0], -halfExtents[1]],
    [halfExtents[0], halfExtents[1]],
    [-halfExtents[0], halfExtents[1]],
  ].map(([x, z]) => new THREE.Vector2(
    center[0] + cosine * x + sine * z,
    center[1] - sine * x + cosine * z,
  ));
}

function separatingAxisGapMeters(
  left: readonly THREE.Vector2[],
  right: readonly THREE.Vector2[],
) {
  const axes = [left, right].flatMap((corners) => [0, 1].map((index) => {
    const edge = corners[index + 1]!.clone().sub(corners[index]!);
    return new THREE.Vector2(-edge.y, edge.x).normalize();
  }));
  return Math.max(...axes.map((axis) => {
    const leftProjection = left.map((corner) => corner.dot(axis));
    const rightProjection = right.map((corner) => corner.dot(axis));
    return Math.max(
      Math.min(...rightProjection) - Math.max(...leftProjection),
      Math.min(...leftProjection) - Math.max(...rightProjection),
    );
  }));
}

function routeCategories(route: InnerKeepAmbientRoute): readonly InnerKeepAmbientActorCategory[] {
  if (
    route.kind === 'citizen-approach'
    || route.kind === 'citizen-work-shuttle'
  ) return ['citizen'];
  if (route.kind === 'civic-mounted-shuttle') return ['civic-mounted'];
  if (route.kind === 'mounted-duty-shuttle') return ['mounted-patrol'];
  return ['foot-patrol'];
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
    expect(cathedral?.position.toArray()).toEqual([0, 0, -15.4]);
    expect(cathedral?.scale.toArray()).toEqual([0.3, 0.3, 0.3]);
    expect(barracks?.position.toArray()).toEqual([-16, 0, 0]);
    expect(barracks?.scale.toArray()).toEqual([0.38, 0.38, 0.38]);
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
    expect(building?.scale.x).toBeCloseTo(0.374);
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
    const weatheredWallMarkers: THREE.Object3D[] = [];
    presentation.group.traverse((object) => {
      if (object.name.startsWith('inner-keep-authored-placement:')) {
        stablePlacementMarkers.push(object);
      }
      if (object.name.startsWith('inner-keep-authored-perimeter-tree:')) {
        stableTreeMarkers.push(object);
      }
      if (object.name.startsWith('inner-keep-weathered-wall-skirt:')) {
        weatheredWallMarkers.push(object);
      }
    });
    const wallInstances = presentation.group.getObjectByName(
      'inner-keep-authored-instanced-asset:palisade-wall-straight-8m',
    )?.children[0] as THREE.InstancedMesh;
    const complexity = renderComplexity(presentation.group);

    const expectedFixedPlacementCount = INNER_KEEP_PRESENTATION_PLACEMENTS
      .filter(({ anchor }) => anchor === 'fixed')
      .reduce((count, placement) => count + placement.instances.length, 0);
    const expectedLongWallCount = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-straight-8m',
    )!.instances.length;
    expect(presentation.placementInstanceCount).toBe(expectedFixedPlacementCount);
    expect(stablePlacementMarkers).toHaveLength(expectedFixedPlacementCount);
    expect(stableTreeMarkers).toHaveLength(presentation.authoredTreeCount);
    expect(weatheredWallMarkers).toHaveLength(
      INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.length,
    );
    const weatheredWallSkirt = presentation.group.getObjectByName(
      'inner-keep-weathered-masonry-skirt',
    );
    expect(weatheredWallSkirt).toMatchObject({
        userData: {
          presentationOnly: true,
          gameplayAuthorityClaimed: false,
          authoritativeBuilding: false,
        },
      });
    weatheredWallSkirt?.traverse((object) => {
      expect(object.userData).toMatchObject({
        presentationOnly: true,
        gameplayAuthorityClaimed: false,
        authoritativeBuilding: false,
      });
      expect(object.raycast([] as never, [] as never)).toBeUndefined();
    });
    expect(wallInstances).toBeInstanceOf(THREE.InstancedMesh);
    expect(wallInstances.count).toBe(expectedLongWallCount);
    // One fake primitive per fixed asset group plus one per perimeter species.
    expect(complexity.drawCalls).toBe(37);
    expect(complexity.triangles).toBe(
      (
        presentation.placementInstanceCount
        + presentation.authoredTreeCount
        + INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.length
      ) * 12,
    );
  });

  it('tucks every off-centre palisade elbow into its canonical corner envelope', () => {
    const presentation = createInnerKeepAuthoredStaticPresentation({
      bundle: fullStaticBundle(),
      quality: 'balanced',
      visualSeed: 42,
    });
    const canonicalCorners = INNER_KEEP_PRESENTATION_PLACEMENTS.find(
      ({ assetId }) => assetId === 'palisade-wall-corner-90',
    )!.instances;
    expect(INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES).toHaveLength(4);
    expect(new Set(INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES.map(
      ({ placementId }) => placementId,
    )).size).toBe(4);

    const localElbow = new THREE.Vector3(-1.66, 0, 1.66);
    for (const override of INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES) {
      const canonical = canonicalCorners.find(
        ({ placementId }) => placementId === override.placementId,
      )!;
      const marker = presentation.group.getObjectByName(
        `inner-keep-authored-placement:${override.placementId}`,
      )!;
      expect(marker.position.toArray()).toEqual(override.positionMeters);
      expect(marker.scale.toArray()).toEqual([0.6, 1, 0.6]);
      expect(marker.position.y).toBe(0);
      expect(marker.scale.y).toBe(1);

      const elbow = localElbow.clone()
        .multiply(marker.scale)
        .applyEuler(marker.rotation)
        .add(marker.position);
      expect(elbow.x).toBeCloseTo(canonical.positionMeters[0], 2);
      expect(elbow.z).toBeCloseTo(canonical.positionMeters[2], 2);

      const visualHalfExtentMeters = 2 * marker.scale.x;
      expect(Math.abs(marker.position.x - canonical.positionMeters[0])
        + visualHalfExtentMeters).toBeLessThanOrEqual(2.35);
      expect(Math.abs(marker.position.z - canonical.positionMeters[2])
        + visualHalfExtentMeters).toBeLessThanOrEqual(2.35);
    }
  });

  it('pins the presentation-only palisade correction to the reviewed layout', () => {
    expect(INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY).toMatchObject({
      policyVersion: 'inner-keep-palisade-visual-correction-v1',
      sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      changesCanonicalLayoutDigest: false,
    });
    expect(createHash('sha256')
      .update(canonicalInnerKeepPalisadeVisualCorrectionDigestInput())
      .digest('hex')).toBe(INNER_KEEP_PALISADE_VISUAL_CORRECTION_DIGEST);
  });

  it('folds the south gate leaves onto their hinges without blocking the wagon', () => {
    const presentation = createInnerKeepAuthoredStaticPresentation({
      bundle: fullStaticBundle(),
      quality: 'balanced',
      visualSeed: 42,
    });
    expect(INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES).toHaveLength(2);
    const renderedLeafRectangles: THREE.Vector2[][] = [];

    for (const [index, override] of
      INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES.entries()) {
      const marker = presentation.group.getObjectByName(
        `inner-keep-authored-placement:${override.placementId}`,
      )!;
      marker.updateWorldMatrix(true, true);
      expect(marker.position.toArray()).toEqual(override.positionMeters);
      expect(marker.scale.toArray()).toEqual([1, 1, 1]);
      const isLeft = override.assetId === 'palisade-gate-leaf-left';
      const centeredHinge = new THREE.Vector3(isLeft ? -1.05 : 1.05, 0, 0)
        .applyMatrix4(marker.matrixWorld);
      expect(centeredHinge.x).toBeCloseTo(isLeft ? -2.1 : 2.1, 10);
      expect(centeredHinge.z).toBeCloseTo(15.6, 10);

      const rectangle = orientedRectangleCorners(
        [marker.position.x, marker.position.z],
        [1.05, 0.14],
        marker.rotation.y,
      );
      renderedLeafRectangles.push(rectangle);
      const innerEdgeX = isLeft
        ? Math.max(...rectangle.map(({ x }) => x))
        : Math.min(...rectangle.map(({ x }) => x));
      const wagonHalfWidth =
        INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS * 0.5;
      const reviewedRoadHalfClearance =
        INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthHalfWidth
        + INNER_KEEP_PRESENTATION_CLEARANCES.road.requiredClearSideBuffer;
      expect(Math.abs(innerEdgeX)).toBeGreaterThanOrEqual(Math.max(
        wagonHalfWidth + 0.3,
        reviewedRoadHalfClearance,
      ));

      const standardCenter = [isLeft ? -2.55 : 2.55, 13.05] as const;
      const standardRectangle = orientedRectangleCorners(
        standardCenter,
        [1.6341 * 0.85 * 0.5, 1.0083 * 0.85 * 0.5],
        index === 0 ? 0 : Math.PI,
      );
      expect(separatingAxisGapMeters(rectangle, standardRectangle))
        .toBeGreaterThan(0.01);
    }

    const leftInnerEdge = Math.max(...renderedLeafRectangles[0]!.map(({ x }) => x));
    const rightInnerEdge = Math.min(...renderedLeafRectangles[1]!.map(({ x }) => x));
    expect(rightInnerEdge - leftInnerEdge).toBeGreaterThanOrEqual(
      2 * (
        INNER_KEEP_PRESENTATION_CLEARANCES.road.northSouthHalfWidth
        + INNER_KEEP_PRESENTATION_CLEARANCES.road.requiredClearSideBuffer
      ),
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
      23,
      25,
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
          const [groundHalfWidth, groundHalfDepth] =
            INNER_KEEP_PRESENTATION_CLEARANCES.ground.halfExtentsMeters;
          expect(Math.abs(center[0]) + tree.halfExtentsMeters[0])
            .toBeLessThanOrEqual(groundHalfWidth);
          expect(Math.abs(center[1]) + tree.halfExtentsMeters[1])
            .toBeLessThanOrEqual(groundHalfDepth);
          expect(tree.positionMeters[1]).toBeCloseTo(
            innerKeepOuterWorldTerrainHeightAt(center[0], center[1])
              + INNER_KEEP_AUTHORED_PERIMETER_TREE_GROUND_LIFT_METERS,
            10,
          );

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
          for (const exclusion of INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS) {
            expect(aabbsOverlap(
              center,
              tree.halfExtentsMeters,
              [exclusion.center.x, exclusion.center.z],
              exclusion.halfExtentsMeters,
              exclusion.clearanceMarginMeters,
            ), `${visualSeed}:${quality}:${tree.name}:${exclusion.exclusionId}`).toBe(false);
          }
          for (const exclusion of INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS) {
            expect(aabbsOverlap(
              center,
              tree.halfExtentsMeters,
              [exclusion.center.x, exclusion.center.z],
              [exclusion.radiusMeters, exclusion.radiusMeters],
              0,
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
          const tradePoints = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.map((point) => ({
            x: point[0],
            z: point[2],
          }));
          const trunkRadiusMeters = innerKeepAuthoredPerimeterTreeTrunkRadiusMeters(tree);
          const trunkHalfExtents = [trunkRadiusMeters, trunkRadiusMeters] as const;
          for (let segmentIndex = 0; segmentIndex < tradePoints.length - 1; segmentIndex += 1) {
            expect(segmentTouchesExpandedAabb(
              tradePoints[segmentIndex]!,
              tradePoints[segmentIndex + 1]!,
              center,
              trunkHalfExtents,
              INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS * 0.5
                + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
            ), `${visualSeed}:${quality}:${tree.name}:trade:${segmentIndex}`).toBe(false);
          }
          for (const lane of INNER_KEEP_OUTER_WORLD_AMBIENT_LANES) {
            for (let segmentIndex = 0; segmentIndex < lane.points.length - 1; segmentIndex += 1) {
              expect(segmentTouchesExpandedAabb(
                lane.points[segmentIndex]!,
                lane.points[segmentIndex + 1]!,
                center,
                trunkHalfExtents,
                lane.reservedHalfWidthMeters
                  + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
              ), `${visualSeed}:${quality}:${tree.name}:${lane.laneId}:${segmentIndex}`)
                .toBe(false);
            }
          }
          for (const road of INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS) {
            for (let segmentIndex = 0; segmentIndex < road.points.length - 1; segmentIndex += 1) {
              expect(segmentTouchesExpandedAabb(
                road.points[segmentIndex]!,
                road.points[segmentIndex + 1]!,
                center,
                trunkHalfExtents,
                road.halfWidthMeters + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
              ), `${visualSeed}:${quality}:${tree.name}:${road.roadId}:${segmentIndex}`)
                .toBe(false);
            }
          }
          for (
            let segmentIndex = 0;
            segmentIndex < INNER_KEEP_CITY_EDGE_APRON_POINTS.length;
            segmentIndex += 1
          ) {
            expect(segmentTouchesExpandedAabb(
              INNER_KEEP_CITY_EDGE_APRON_POINTS[segmentIndex]!,
              INNER_KEEP_CITY_EDGE_APRON_POINTS[
                (segmentIndex + 1) % INNER_KEEP_CITY_EDGE_APRON_POINTS.length
              ]!,
              center,
              trunkHalfExtents,
              INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS
                + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
            ), `${visualSeed}:${quality}:${tree.name}:city-apron:${segmentIndex}`)
              .toBe(false);
          }
          for (const road of INNER_KEEP_CITY_DISTRICT_ROADS) {
            const segmentCount = road.closed ? road.points.length : road.points.length - 1;
            for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
              expect(segmentTouchesExpandedAabb(
                road.points[segmentIndex]!,
                road.points[(segmentIndex + 1) % road.points.length]!,
                center,
                trunkHalfExtents,
                road.halfWidthMeters + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
              ), `${visualSeed}:${quality}:${tree.name}:district:${segmentIndex}`)
                .toBe(false);
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
  }, 30_000);

  it('keeps the lower ward outside every exact ambient actor sweep', () => {
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      for (const exclusion of INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS) {
        for (const route of INNER_KEEP_AMBIENT_ROUTES) {
          const expansion = exactRouteSweepRadius(route, quality)
            + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS
            + exclusion.clearanceMarginMeters;
          const points = route.path.points;
          const segmentCount = route.path.closed ? points.length : points.length - 1;
          for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
            expect(segmentTouchesExpandedAabb(
              points[segmentIndex]!,
              points[(segmentIndex + 1) % points.length]!,
              [exclusion.center.x, exclusion.center.z],
              exclusion.halfExtentsMeters,
              expansion,
            ), `${quality}:${exclusion.exclusionId}:${route.routeId}`).toBe(false);
          }
        }
      }
    }
  });

  it('grounds authored perimeter trees with the injected rendered-surface sampler', () => {
    const terrainHeightAt = (x: number, z: number) => 1.4 + x * 0.013 - z * 0.009;
    const plan = planInnerKeepAuthoredPerimeterTrees({
      bundle: fullStaticBundle(),
      quality: 'reduced',
      visualSeed: 91,
      terrainHeightAt,
    });
    expect(plan).toHaveLength(6);
    for (const tree of plan) {
      expect(tree.positionMeters[1]).toBeCloseTo(
        terrainHeightAt(tree.positionMeters[0], tree.positionMeters[2])
          + INNER_KEEP_AUTHORED_PERIMETER_TREE_GROUND_LIFT_METERS,
        10,
      );
    }
  });

  it('keeps the seeded countryside grove and roaming rabbits outside exact authored trees', () => {
    const bundle = fullStaticBundle();
    for (const visualSeed of [7, 444, 797, 2_434, 3_942]) {
      const authored = planInnerKeepAuthoredPerimeterTrees({
        bundle,
        quality: 'high',
        visualSeed,
      });
      const outer = planInnerKeepOuterWorldTrees({ quality: 'high', visualSeed });
      const wildlife = planInnerKeepOuterWorldWildlife({
        quality: 'high',
        visualSeed,
        treePlacements: outer,
      });
      for (const authoredTree of authored) {
        const centerX = authoredTree.positionMeters[0];
        const centerZ = authoredTree.positionMeters[2];
        const distanceToBounds = (x: number, z: number) => Math.hypot(
          Math.max(Math.abs(x - centerX) - authoredTree.halfExtentsMeters[0], 0),
          Math.max(Math.abs(z - centerZ) - authoredTree.halfExtentsMeters[1], 0),
        );
        for (const tree of outer) {
          expect(distanceToBounds(tree.positionMeters[0], tree.positionMeters[2]),
            `seed:${visualSeed}:${authoredTree.name}:tree:${tree.instanceIndex}`)
            .toBeGreaterThan(innerKeepOuterWorldTreeTrunkRadiusMeters(tree));
        }
        for (const rabbit of wildlife) {
          expect(distanceToBounds(rabbit.anchorMeters[0], rabbit.anchorMeters[2]),
            `seed:${visualSeed}:${authoredTree.name}:rabbit:${rabbit.instanceIndex}`)
            .toBeGreaterThan(
              Math.SQRT2 * rabbit.roamingRadiusMeters
                + innerKeepOuterWorldWildlifeFootprintRadiusMeters(rabbit),
            );
        }
      }
    }
  });

  it('stagger-plants the high-quality grove across every perimeter sector', () => {
    const plan = planInnerKeepAuthoredPerimeterTrees({
      bundle: fullStaticBundle(),
      quality: 'high',
      visualSeed: 42,
    });
    const bySector = new Map(
      (['west', 'east', 'north', 'south'] as const).map((sector) => [
        sector,
        plan.filter((tree) => tree.sector === sector),
      ] as const),
    );

    for (const [sector, trees] of bySector) {
      expect(trees.length, sector).toBeGreaterThanOrEqual(3);
      const crossCoordinates = trees.map((tree) => (
        sector === 'west' || sector === 'east'
          ? tree.positionMeters[0]
          : tree.positionMeters[2]
      ));
      const alongCoordinates = trees.map((tree) => (
        sector === 'west' || sector === 'east'
          ? tree.positionMeters[2]
          : tree.positionMeters[0]
      ));
      expect(
        Math.max(...crossCoordinates) - Math.min(...crossCoordinates),
        `${sector} planting depth`,
      ).toBeGreaterThan(0.3);
      expect(
        Math.max(...alongCoordinates) - Math.min(...alongCoordinates),
        `${sector} perimeter spread`,
      ).toBeGreaterThan(2.5);
    }
  });
});
