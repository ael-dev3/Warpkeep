import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createInnerKeepOuterWorldPresentation,
  INNER_KEEP_OUTER_WORLD_TREE_ROOT_CLEARANCE_METERS,
  innerKeepOuterWorldTreeTrunkRadiusMeters,
  innerKeepOuterWorldTreeRootSupportRadiusMeters,
  INNER_KEEP_OUTER_WORLD_TREE_ROOT_TERRAIN_RANGE_MAXIMUM_METERS,
  resolveInnerKeepOuterWorldTreeGrounding,
  innerKeepOuterWorldWildlifeFootprintRadiusMeters,
  innerKeepOuterWorldWildlifeClearsTrees,
  planInnerKeepOuterWorldResources,
  planInnerKeepOuterWorldTrees,
  planInnerKeepOuterWorldWildlife,
  INNER_KEEP_OUTER_WORLD_NORTHEAST_WILDLIFE_CLEARING,
  type AcquireOuterWorldExpeditionPrefab,
  type AcquireOuterWorldTreePrefab,
} from '../src/components/inner-keep/createInnerKeepOuterWorldPresentation';
import {
  innerKeepOuterWorldDistanceToAmbientLane,
  innerKeepOuterWorldDistanceToRenderedRoadEdge,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  INNER_KEEP_OUTER_WORLD_TREE_BUDGETS,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION,
  INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';

type FakeAssetAcquirers = Readonly<{
  acquireTreePrefab: AcquireOuterWorldTreePrefab;
  acquireExpeditionPrefab: AcquireOuterWorldExpeditionPrefab;
  treeReleases: ReturnType<typeof vi.fn>[];
  expeditionReleases: ReturnType<typeof vi.fn>[];
}>;

function fakeAssetAcquirers(options: Readonly<{
  failResourceKind?: string;
}> = {}): FakeAssetAcquirers {
  const treeReleases: ReturnType<typeof vi.fn>[] = [];
  const expeditionReleases: ReturnType<typeof vi.fn>[] = [];
  const acquireTreePrefab = vi.fn<AcquireOuterWorldTreePrefab>(async ({ asset, lod }) => {
    const release = vi.fn();
    treeReleases.push(release);
    return Object.freeze({
      prefab: Object.freeze({
        assetId: asset.id,
        lod,
        assetUrl: `/fake/${asset.id}/${lod}.glb`,
        visualHeight: 0.62,
        footprintDiameter: 0.3,
        primitives: Object.freeze([
          Object.freeze({
            geometry: new THREE.BoxGeometry(0.2, 0.62, 0.2),
            material: new THREE.MeshStandardMaterial({ color: 0x426f43 }),
            localMatrixElements: Object.freeze([...new THREE.Matrix4().elements]),
          }),
        ]),
      }),
      release,
    });
  });
  const acquireExpeditionPrefab = vi.fn<AcquireOuterWorldExpeditionPrefab>(async (request) => {
    if (
      request.materialRole === 'gathering-node'
      && options.failResourceKind
      && request.label.includes(options.failResourceKind)
    ) throw new Error(`${options.failResourceKind} test failure`);
    const release = vi.fn();
    expeditionReleases.push(release);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(
        request.targetFootprintDiameter,
        1,
        request.targetFootprintDiameter,
      ),
      new THREE.MeshStandardMaterial({ color: 0x8a795c }),
    ));
    return Object.freeze({
      model: Object.freeze({
        root,
        clips: Object.freeze([]),
        footprintDiameter: request.targetFootprintDiameter,
        visualHeight: request.targetFootprintDiameter * 0.7,
        assetUrl: `/fake/${request.label}.glb`,
      }),
      release,
    });
  });
  return {
    acquireTreePrefab,
    acquireExpeditionPrefab,
    treeReleases,
    expeditionReleases,
  };
}

function instancePositions(mesh: THREE.InstancedMesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return position.setFromMatrixPosition(matrix).toArray();
  });
}

describe('Inner Keep outer-world visual presentation', () => {
  it.each(['high', 'balanced', 'reduced'] as const)(
    'fills deterministic %s tree, wildlife, and scenic-resource budgets',
    (quality) => {
      const firstTrees = planInnerKeepOuterWorldTrees({ quality, visualSeed: 42 });
      const secondTrees = planInnerKeepOuterWorldTrees({ quality, visualSeed: 42 });
      const firstWildlife = planInnerKeepOuterWorldWildlife({ quality, visualSeed: 42 });
      const secondWildlife = planInnerKeepOuterWorldWildlife({ quality, visualSeed: 42 });
      const resources = planInnerKeepOuterWorldResources({ quality, visualSeed: 42 });
      expect(firstTrees).toEqual(secondTrees);
      expect(firstWildlife).toEqual(secondWildlife);
      expect(firstTrees).toHaveLength(INNER_KEEP_OUTER_WORLD_TREE_BUDGETS[quality]);
      expect(firstWildlife).toHaveLength(
        INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].wildlifeActors,
      );
      expect(firstWildlife.some(({ anchorMeters }) => (
        anchorMeters[0] > 20 && anchorMeters[2] > 20
      ))).toBe(true);
      const northeastWildlife = firstWildlife.find(({ anchorMeters }) => (
        anchorMeters[0] > 20 && anchorMeters[2] > 20
      ));
      expect(Math.hypot(
        northeastWildlife!.anchorMeters[0]
          - INNER_KEEP_OUTER_WORLD_NORTHEAST_WILDLIFE_CLEARING.center.x,
        northeastWildlife!.anchorMeters[2]
          - INNER_KEEP_OUTER_WORLD_NORTHEAST_WILDLIFE_CLEARING.center.z,
      )).toBeLessThan(INNER_KEEP_OUTER_WORLD_NORTHEAST_WILDLIFE_CLEARING.radiusMeters);
      expect(firstWildlife.some(({ anchorMeters }) => anchorMeters[2] > 19)).toBe(true);
      expect(resources).toHaveLength(
        INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce((count, site) => (
          count + site.instancesByQuality[quality]
        ), 0),
      );
      for (const site of INNER_KEEP_OUTER_WORLD_RESOURCE_SITES) {
        const sitePlacements = resources.filter(({ visualSiteKey }) => (
          visualSiteKey === site.siteId
        ));
        for (let leftIndex = 0; leftIndex < sitePlacements.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < sitePlacements.length; rightIndex += 1) {
            const left = sitePlacements[leftIndex]!;
            const right = sitePlacements[rightIndex]!;
            expect(Math.hypot(
              left.positionMeters[0] - right.positionMeters[0],
              left.positionMeters[2] - right.positionMeters[2],
            ), `${site.siteId}:${leftIndex}:${rightIndex}`).toBeGreaterThanOrEqual(
              (left.targetFootprintDiameter + right.targetFootprintDiameter) * 0.5 + 0.2,
            );
          }
        }
      }
      expect(new Set(firstTrees.map(({ speciesId }) => speciesId)).size).toBe(8);
      expect(firstTrees.filter(({ speciesId }) => speciesId.includes('.willow.')).length)
        .toBeGreaterThanOrEqual(2);
      expect(firstTrees.filter(({ positionMeters }) => positionMeters[0] < -24).length)
        .toBeGreaterThan(firstTrees.length * 0.4);
      for (let leftIndex = 0; leftIndex < firstTrees.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < firstTrees.length; rightIndex += 1) {
          const left = firstTrees[leftIndex]!;
          const right = firstTrees[rightIndex]!;
          expect(Math.hypot(
            left.positionMeters[0] - right.positionMeters[0],
            left.positionMeters[2] - right.positionMeters[2],
          ), `${quality}:tree-root:${left.instanceIndex}:${right.instanceIndex}`)
            .toBeGreaterThanOrEqual(
              innerKeepOuterWorldTreeRootSupportRadiusMeters(left)
                + innerKeepOuterWorldTreeRootSupportRadiusMeters(right)
                + INNER_KEEP_OUTER_WORLD_TREE_ROOT_CLEARANCE_METERS,
            );
        }
      }
      expect(firstWildlife.every((placement) => (
        innerKeepOuterWorldWildlifeClearsTrees(placement, firstTrees)
      ))).toBe(true);
      for (const tree of firstTrees) {
        expect(innerKeepOuterWorldDistanceToAmbientLane(
          tree.positionMeters[0],
          tree.positionMeters[2],
        )).toBeGreaterThanOrEqual(innerKeepOuterWorldTreeTrunkRadiusMeters(tree));
        expect(innerKeepOuterWorldDistanceToRenderedRoadEdge(
          tree.positionMeters[0],
          tree.positionMeters[2],
        )).toBeGreaterThan(
          innerKeepOuterWorldTreeTrunkRadiusMeters(tree) + 0.22,
        );
      }
      for (const rabbit of firstWildlife) {
        expect(innerKeepOuterWorldDistanceToRenderedRoadEdge(
          rabbit.anchorMeters[0],
          rabbit.anchorMeters[2],
        )).toBeGreaterThan(
          Math.SQRT2 * rabbit.roamingRadiusMeters
            + innerKeepOuterWorldWildlifeFootprintRadiusMeters(rabbit)
            + 0.22,
        );
      }
      for (const placement of [...firstTrees, ...firstWildlife.map(({ anchorMeters }) => ({
        positionMeters: anchorMeters,
      }))]) {
        const [x, , z] = placement.positionMeters;
        const cemetery = INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION;
        expect(
          Math.abs(x - cemetery.center.x)
            > cemetery.halfExtentsMeters[0] + cemetery.clearanceMarginMeters
          || Math.abs(z - cemetery.center.z)
            > cemetery.halfExtentsMeters[1] + cemetery.clearanceMarginMeters,
          `${quality}:graveyard-scenery-clearance:${x}:${z}`,
        ).toBe(true);
      }
    },
  );

  it('keeps seeded countryside trees and rabbits clear of every resource pad and village animal', () => {
    for (let visualSeed = 0; visualSeed < 128; visualSeed += 1) {
      const trees = planInnerKeepOuterWorldTrees({ quality: 'high', visualSeed });
      const wildlife = planInnerKeepOuterWorldWildlife({
        quality: 'high',
        visualSeed,
        treePlacements: trees,
      });
      const resources = planInnerKeepOuterWorldResources({ quality: 'high', visualSeed });
      for (const tree of trees) {
        const treeRadius = innerKeepOuterWorldTreeTrunkRadiusMeters(tree);
        for (const resource of resources) {
          expect(Math.hypot(
            tree.positionMeters[0] - resource.positionMeters[0],
            tree.positionMeters[2] - resource.positionMeters[2],
          ), `seed:${visualSeed}:tree:${tree.instanceIndex}:resource:${resource.instanceIndex}`)
            .toBeGreaterThan(
              treeRadius + resource.targetFootprintDiameter * 0.5 + 0.16,
            );
        }
        for (const animal of INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS) {
          expect(Math.hypot(
            tree.positionMeters[0] - animal.center.x,
            tree.positionMeters[2] - animal.center.z,
          ), `seed:${visualSeed}:tree:${tree.instanceIndex}:${animal.exclusionId}`)
            .toBeGreaterThan(treeRadius + animal.radiusMeters);
        }
      }
      for (const rabbit of wildlife) {
        const rabbitEnvelope = Math.SQRT2 * rabbit.roamingRadiusMeters
          + innerKeepOuterWorldWildlifeFootprintRadiusMeters(rabbit);
        for (const resource of resources) {
          expect(Math.hypot(
            rabbit.anchorMeters[0] - resource.positionMeters[0],
            rabbit.anchorMeters[2] - resource.positionMeters[2],
          ), `seed:${visualSeed}:rabbit:${rabbit.instanceIndex}:resource:${resource.instanceIndex}`)
            .toBeGreaterThan(
              rabbitEnvelope + resource.targetFootprintDiameter * 0.5 + 0.16,
            );
        }
        for (const animal of INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS) {
          expect(Math.hypot(
            rabbit.anchorMeters[0] - animal.center.x,
            rabbit.anchorMeters[2] - animal.center.z,
          ), `seed:${visualSeed}:rabbit:${rabbit.instanceIndex}:${animal.exclusionId}`)
            .toBeGreaterThan(rabbitEnvelope + animal.radiusMeters);
        }
      }
    }
  }, 45_000);

  it('keeps exact tree-root supports clear at prior high and balanced overlap seeds', () => {
    for (const [quality, visualSeed] of [
      ['high', 0],
      ['high', 234],
      ['balanced', 140],
      ['balanced', 397],
    ] as const) {
      const trees = planInnerKeepOuterWorldTrees({ quality, visualSeed });
      const wildlife = planInnerKeepOuterWorldWildlife({
        quality,
        visualSeed,
        treePlacements: trees,
      });
      for (let leftIndex = 0; leftIndex < trees.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < trees.length; rightIndex += 1) {
          const left = trees[leftIndex]!;
          const right = trees[rightIndex]!;
          expect(Math.hypot(
            left.positionMeters[0] - right.positionMeters[0],
            left.positionMeters[2] - right.positionMeters[2],
          ), `${quality}:${visualSeed}:tree-root:${left.instanceIndex}:${right.instanceIndex}`)
            .toBeGreaterThanOrEqual(
              innerKeepOuterWorldTreeRootSupportRadiusMeters(left)
                + innerKeepOuterWorldTreeRootSupportRadiusMeters(right)
                + INNER_KEEP_OUTER_WORLD_TREE_ROOT_CLEARANCE_METERS,
            );
        }
      }
      expect(wildlife.every((rabbit) => (
        innerKeepOuterWorldWildlifeClearsTrees(rabbit, trees)
      ))).toBe(true);
    }
  });

  it('keeps the complete rabbit roaming cycle clear of every selected tree trunk', () => {
    const cycleSamples = 4_096;
    for (const visualSeed of [0, 6]) {
      const trees = planInnerKeepOuterWorldTrees({ quality: 'high', visualSeed });
      const wildlife = planInnerKeepOuterWorldWildlife({
        quality: 'high',
        visualSeed,
        treePlacements: trees,
      });
      for (const rabbit of wildlife) {
        const rabbitRadius = innerKeepOuterWorldWildlifeFootprintRadiusMeters(rabbit);
        for (const tree of trees) {
          let minimumSeparation = Number.POSITIVE_INFINITY;
          for (let sample = 0; sample <= cycleSamples; sample += 1) {
            const phase = rabbit.phaseRadians + sample / cycleSamples * Math.PI * 200;
            const x = rabbit.anchorMeters[0]
              + Math.cos(phase) * rabbit.roamingRadiusMeters;
            const z = rabbit.anchorMeters[2]
              + Math.sin(phase * 0.83) * rabbit.roamingRadiusMeters;
            minimumSeparation = Math.min(minimumSeparation, Math.hypot(
              x - tree.positionMeters[0],
              z - tree.positionMeters[2],
            ));
          }
          expect(minimumSeparation,
            `seed:${visualSeed}:rabbit:${rabbit.instanceIndex}:tree:${tree.instanceIndex}`)
            .toBeGreaterThanOrEqual(
              rabbitRadius
                + innerKeepOuterWorldTreeRootSupportRadiusMeters(tree)
                + INNER_KEEP_OUTER_WORLD_TREE_ROOT_CLEARANCE_METERS,
            );
        }
      }
    }
  }, 15_000);

  it('starts complete visual fallbacks without depending on core assets or authority', async () => {
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'balanced',
      visualSeed: 7,
      reducedMotion: true,
      loadExactAssets: false,
    });
    await presentation.ready;
    const telemetry = presentation.getTelemetry();
    expect(telemetry).toMatchObject({
      status: 'fallback',
      treeCount: 44,
      fallbackTreeCount: 44,
      resourceCount: 6,
      fallbackResourceCount: 6,
      wildlifeCount: 7,
      supplyWagonCount: 1,
      fallbackSupplyWagonCount: 1,
      exactCoreBundleRequired: false,
      coreBundleDependency: 'none',
    });
    expect(telemetry.groundContactCount).toBe(44 + 6 + 7 + 1);
    presentation.group.traverse((object) => {
      expect(object.userData.presentationOnly).toBe(true);
      expect(object.userData.gameplayAuthorityClaimed).toBe(false);
      expect(object.userData.pickable).toBe(false);
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
      expect(Object.keys(object.userData).some((key) => /server|authoritative|state/i.test(key)))
        .toBe(false);
      if (object instanceof THREE.Mesh) {
        const hits: THREE.Intersection[] = [];
        object.raycast(new THREE.Raycaster(), hits);
        expect(hits).toEqual([]);
      }
    });
    presentation.dispose();
  });

  it('replaces fallback batches with exact trees, resources, and one moving wagon', async () => {
    const assets = fakeAssetAcquirers();
    const requestRender = vi.fn();
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 99,
      reducedMotion: false,
      baseUrl: '/',
      requestRender,
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab: assets.acquireExpeditionPrefab,
    });
    await presentation.ready;
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'ready',
      treeAssetState: 'exact',
      resourceAssetState: 'exact',
      supplyWagonAssetState: 'exact',
      treeCount: 22,
      exactTreeCount: 22,
      fallbackTreeCount: 0,
      exactTreeSpeciesCount: 8,
      resourceCount: 4,
      exactResourceCount: 4,
      fallbackResourceCount: 0,
      exactResourceFamilyCount: 4,
      exactSupplyWagonCount: 1,
      fallbackSupplyWagonCount: 0,
      failures: [],
    });
    expect(assets.acquireTreePrefab).toHaveBeenCalledTimes(8);
    expect(assets.acquireExpeditionPrefab).toHaveBeenCalledTimes(5);
    for (const call of vi.mocked(assets.acquireTreePrefab).mock.calls) {
      expect(call[0].lod).toBe('compact');
    }
    for (const call of vi.mocked(assets.acquireExpeditionPrefab).mock.calls) {
      expect(call[0].dynamicShadows).toBe(false);
      expect(call[0].asset.path).toContain('compact');
    }
    const wagon = presentation.group.getObjectByName('inner-keep-outer-supply-wagon')!;
    const before = wagon.position.clone();
    expect(presentation.update(12)).toBe(true);
    expect(wagon.position.equals(before)).toBe(false);
    expect(requestRender).toHaveBeenCalled();
    presentation.dispose();
    expect(assets.treeReleases.every((release) => release.mock.calls.length === 1)).toBe(true);
    expect(assets.expeditionReleases.every((release) => release.mock.calls.length === 1)).toBe(true);
  });

  it('uses balanced countryside LODs in the wide high-quality overview', async () => {
    const assets = fakeAssetAcquirers();
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'high',
      visualSeed: 81,
      reducedMotion: false,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab: assets.acquireExpeditionPrefab,
    });
    await presentation.ready;
    for (const call of vi.mocked(assets.acquireTreePrefab).mock.calls) {
      expect(call[0].lod).toBe('balanced');
    }
    for (const call of vi.mocked(assets.acquireExpeditionPrefab).mock.calls) {
      expect(call[0].asset.path).toContain('balanced');
    }
    presentation.dispose();
  });

  it('scales and spaces every exact high-tier secondary resource by its rendered bounds', async () => {
    const assets = fakeAssetAcquirers();
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'high',
      visualSeed: 42,
      reducedMotion: true,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab: assets.acquireExpeditionPrefab,
    });
    await presentation.ready;
    for (const kind of ['food', 'wood', 'stone', 'gold']) {
      const mesh = presentation.group.getObjectByName(
        `inner-keep-outer-exact-resource-mesh:${kind}:0`,
      ) as THREE.InstancedMesh;
      expect(mesh.count, kind).toBe(2);
      mesh.geometry.computeBoundingBox();
      const localBounds = mesh.geometry.boundingBox!;
      const instanceMatrix = new THREE.Matrix4();
      const renderedBounds = Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, instanceMatrix);
        return localBounds.clone().applyMatrix4(instanceMatrix);
      });
      expect(renderedBounds[0]!.intersectsBox(renderedBounds[1]!), kind).toBe(false);

      const primaryScale = new THREE.Vector3();
      const secondaryScale = new THREE.Vector3();
      mesh.getMatrixAt(0, instanceMatrix);
      instanceMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), primaryScale);
      mesh.getMatrixAt(1, instanceMatrix);
      instanceMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), secondaryScale);
      expect(secondaryScale.x / primaryScale.x, kind).toBeCloseTo(0.46, 6);
      expect(secondaryScale.z / primaryScale.z, kind).toBeCloseTo(0.46, 6);
    }
    presentation.dispose();
  });

  it('releases a wagon lease when exact clone setup fails and retains its fallback', async () => {
    const assets = fakeAssetAcquirers();
    const wagonRelease = vi.fn();
    const acquireExpeditionPrefab = vi.fn<AcquireOuterWorldExpeditionPrefab>(
      async (request) => {
        if (request.materialRole !== 'wagon') {
          return assets.acquireExpeditionPrefab(request);
        }
        const root = new THREE.Group();
        root.add(new THREE.SkinnedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial(),
        ));
        return Object.freeze({
          model: Object.freeze({
            root,
            clips: Object.freeze([]),
            footprintDiameter: request.targetFootprintDiameter,
            visualHeight: 1,
            assetUrl: '/fake/malformed-wagon.glb',
          }),
          release: wagonRelease,
        });
      },
    );
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 314,
      reducedMotion: false,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab,
    });

    await presentation.ready;

    expect(wagonRelease).toHaveBeenCalledTimes(1);
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'partial',
      supplyWagonAssetState: 'fallback',
      exactSupplyWagonCount: 0,
      fallbackSupplyWagonCount: 1,
    });
    expect(presentation.getTelemetry().failures).toContainEqual(
      expect.objectContaining({ scope: 'supply-wagon', assetId: 'supply-wagon' }),
    );
    expect(presentation.group.getObjectByName('inner-keep-outer-exact-supply-wagon-model'))
      .toBeUndefined();
    expect(presentation.group.getObjectByName('inner-keep-outer-fallback-supply-wagon'))
      .toBeDefined();

    presentation.dispose();
    expect(wagonRelease).toHaveBeenCalledTimes(1);
  });

  it('preserves the setup failure while skeleton cleanup throws', async () => {
    const assets = fakeAssetAcquirers();
    const wagonRelease = vi.fn();
    let clonedSkeletonDispose: ReturnType<typeof vi.spyOn> | null = null;
    const acquireExpeditionPrefab = vi.fn<AcquireOuterWorldExpeditionPrefab>(
      async (request) => {
        if (request.materialRole !== 'wagon') {
          return assets.acquireExpeditionPrefab(request);
        }
        const root = new THREE.Group();
        const bone = new THREE.Bone();
        const skeleton = new THREE.Skeleton([bone]);
        const mesh = new THREE.SkinnedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial(),
        );
        mesh.bind(skeleton);
        root.add(bone, mesh);
        const cloneSkeleton = skeleton.clone.bind(skeleton);
        vi.spyOn(skeleton, 'clone').mockImplementation(() => {
          const clonedSkeleton = cloneSkeleton();
          const disposeSkeleton = clonedSkeleton.dispose.bind(clonedSkeleton);
          clonedSkeletonDispose = vi.spyOn(clonedSkeleton, 'dispose').mockImplementation(() => {
            disposeSkeleton();
            throw new Error('synthetic wagon skeleton disposal failure');
          });
          return clonedSkeleton;
        });
        const brokenClip = {} as THREE.AnimationClip;
        Object.defineProperty(brokenClip, 'uuid', {
          get: () => {
            throw new Error('original wagon setup failure');
          },
        });
        return Object.freeze({
          model: Object.freeze({
            root,
            clips: Object.freeze([brokenClip]),
            footprintDiameter: request.targetFootprintDiameter,
            visualHeight: 1,
            assetUrl: '/fake/skinned-broken-wagon.glb',
          }),
          release: wagonRelease,
        });
      },
    );
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 314,
      reducedMotion: false,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab,
    });

    await presentation.ready;

    expect(clonedSkeletonDispose).not.toBeNull();
    expect(clonedSkeletonDispose!).toHaveBeenCalledOnce();
    expect(wagonRelease).toHaveBeenCalledOnce();
    expect(presentation.getTelemetry().failures).toContainEqual(
      expect.objectContaining({
        scope: 'supply-wagon',
        assetId: 'supply-wagon',
        message: 'original wagon setup failure',
      }),
    );
    expect(presentation.group.getObjectByName('inner-keep-outer-exact-supply-wagon-model'))
      .toBeUndefined();
    expect(presentation.group.getObjectByName('inner-keep-outer-fallback-supply-wagon'))
      .toBeDefined();
    presentation.dispose();
  });

  it('retires every outer-world lease when wagon skeleton disposal throws', async () => {
    const assets = fakeAssetAcquirers();
    const wagonRelease = vi.fn();
    const acquireExpeditionPrefab = vi.fn<AcquireOuterWorldExpeditionPrefab>(
      async (request) => {
        if (request.materialRole !== 'wagon') {
          return assets.acquireExpeditionPrefab(request);
        }
        const root = new THREE.Group();
        const bone = new THREE.Bone();
        const skeleton = new THREE.Skeleton([bone]);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial();
        root.add(bone);
        for (let index = 0; index < 2; index += 1) {
          const mesh = new THREE.SkinnedMesh(geometry, material);
          mesh.bind(skeleton);
          root.add(mesh);
        }
        return Object.freeze({
          model: Object.freeze({
            root,
            clips: Object.freeze([]),
            footprintDiameter: request.targetFootprintDiameter,
            visualHeight: 1,
            assetUrl: '/fake/skinned-wagon.glb',
          }),
          release: wagonRelease,
        });
      },
    );
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 314,
      reducedMotion: true,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab,
    });
    await presentation.ready;
    const wagon = presentation.group.getObjectByName(
      'inner-keep-outer-exact-supply-wagon-model',
    )!;
    const skeletons = new Set<THREE.Skeleton>();
    wagon.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
    expect(skeletons.size).toBeGreaterThan(0);
    const disposals = [...skeletons].map((skeleton, index) => {
      skeleton.computeBoneTexture();
      const disposeSkeleton = skeleton.dispose.bind(skeleton);
      const disposal = vi.spyOn(skeleton, 'dispose');
      if (index === 0) {
        disposal.mockImplementation(() => {
          disposeSkeleton();
          throw new Error('synthetic wagon skeleton disposal failure');
        });
      }
      return disposal;
    });

    expect(() => presentation.dispose()).not.toThrow();
    presentation.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    skeletons.forEach((skeleton) => expect(skeleton.boneTexture).toBeNull());
    expect(wagonRelease).toHaveBeenCalledOnce();
    assets.treeReleases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    assets.expeditionReleases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    expect(presentation.group.children).toHaveLength(0);
  });

  it('keeps one failed resource family on its own fallback without affecting peers', async () => {
    const assets = fakeAssetAcquirers({ failResourceKind: 'stone' });
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'balanced',
      visualSeed: 123,
      reducedMotion: true,
      baseUrl: '/',
      acquireTreePrefab: assets.acquireTreePrefab,
      acquireExpeditionPrefab: assets.acquireExpeditionPrefab,
    });
    await presentation.ready;
    const stoneCount = INNER_KEEP_OUTER_WORLD_RESOURCE_SITES
      .find(({ resourceKind }) => resourceKind === 'stone')!
      .instancesByQuality.balanced;
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'partial',
      treeAssetState: 'exact',
      resourceAssetState: 'partial',
      supplyWagonAssetState: 'exact',
      exactResourceCount: 6 - stoneCount,
      fallbackResourceCount: stoneCount,
      exactResourceFamilyCount: 3,
      failedResourceFamilyCount: 1,
      exactCoreBundleRequired: false,
    });
    expect(presentation.getTelemetry().failures).toEqual([
      expect.objectContaining({ scope: 'resource', assetId: 'stone' }),
    ]);
    expect(presentation.group.getObjectByName('inner-keep-outer-fallback-resource:stone')?.visible)
      .toBe(true);
    expect(presentation.group.getObjectByName('inner-keep-outer-fallback-resource:gold')?.visible)
      .toBe(false);
    presentation.dispose();
  });

  it('grounds every planned family with one shared finite height sampler', async () => {
    const terrainHeightAt = (x: number, z: number) => 1.25 + x * 0.02 - z * 0.015;
    const pointIsClear = () => true;
    const trees = planInnerKeepOuterWorldTrees({
      quality: 'reduced',
      visualSeed: 17,
      terrainHeightAt,
      pointIsClear,
    });
    const resources = planInnerKeepOuterWorldResources({
      quality: 'reduced',
      visualSeed: 17,
      terrainHeightAt,
    });
    const wildlife = planInnerKeepOuterWorldWildlife({
      quality: 'reduced',
      visualSeed: 17,
      terrainHeightAt,
      pointIsClear,
    });
    for (const placement of trees) {
      const grounding = resolveInnerKeepOuterWorldTreeGrounding({
        speciesId: placement.speciesId,
        scale: placement.scale,
        x: placement.positionMeters[0],
        z: placement.positionMeters[2],
      }, terrainHeightAt);
      expect(placement.positionMeters[1]).toBeCloseTo(
        grounding.groundMeters,
      );
      expect(grounding.rangeMeters)
        .toBeLessThanOrEqual(INNER_KEEP_OUTER_WORLD_TREE_ROOT_TERRAIN_RANGE_MAXIMUM_METERS);
    }
    for (const placement of resources) {
      expect(placement.positionMeters[1]).toBeCloseTo(
        terrainHeightAt(placement.positionMeters[0], placement.positionMeters[2]),
      );
    }
    for (const placement of wildlife) {
      expect(placement.anchorMeters[1]).toBeCloseTo(
        terrainHeightAt(placement.anchorMeters[0], placement.anchorMeters[2]),
      );
    }

    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 17,
      reducedMotion: false,
      loadExactAssets: false,
      terrainHeightAt,
      pointIsClear,
    });
    await presentation.ready;
    const contacts: THREE.Object3D[] = [];
    presentation.group.traverse((object) => {
      if (object.userData.innerKeepOuterWorldGroundContact === true) contacts.push(object);
    });
    expect(contacts).toHaveLength(trees.length + resources.length + 1);
    contacts.forEach((contact) => {
      if (contact.name.startsWith('inner-keep-outer-tree-contact:')) {
        const placementIndex = Number(contact.name.split(':').at(-1));
        expect(contact.position.y).toBeCloseTo(trees[placementIndex]!.positionMeters[1]);
      } else {
        expect(contact.position.y)
          .toBeCloseTo(terrainHeightAt(contact.position.x, contact.position.z));
      }
    });
    const fallbackTrunks = presentation.group.getObjectByName(
      'inner-keep-outer-fallback-tree-trunks',
    ) as THREE.InstancedMesh;
    expect(instancePositions(fallbackTrunks)).toHaveLength(trees.length);
    presentation.dispose();
  });

  it('aborts optional loads, releases late leases, and disposes idempotently', async () => {
    const pendingResolvers: Array<() => void> = [];
    const receivedSignals: AbortSignal[] = [];
    const releases: ReturnType<typeof vi.fn>[] = [];
    const deferredTree = vi.fn<AcquireOuterWorldTreePrefab>((request) => {
      receivedSignals.push(request.signal!);
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          const release = vi.fn();
          releases.push(release);
          resolve(Object.freeze({
            prefab: Object.freeze({
              assetId: request.asset.id,
              lod: request.lod,
              assetUrl: '/late-tree.glb',
              visualHeight: 0.62,
              footprintDiameter: 0.3,
              primitives: Object.freeze([]),
            }),
            release,
          }));
        });
      });
    });
    const deferredExpedition = vi.fn<AcquireOuterWorldExpeditionPrefab>((request) => {
      receivedSignals.push(request.signal!);
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          const release = vi.fn();
          releases.push(release);
          resolve(Object.freeze({
            model: Object.freeze({
              root: new THREE.Group(),
              clips: Object.freeze([]),
              footprintDiameter: request.targetFootprintDiameter,
              visualHeight: 1,
              assetUrl: '/late-expedition.glb',
            }),
            release,
          }));
        });
      });
    });
    const controller = new AbortController();
    const requestRender = vi.fn();
    const onTelemetryChange = vi.fn();
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 5,
      reducedMotion: false,
      baseUrl: '/',
      signal: controller.signal,
      requestRender,
      onTelemetryChange,
      acquireTreePrefab: deferredTree,
      acquireExpeditionPrefab: deferredExpedition,
    });
    controller.abort();
    expect(presentation.getTelemetry().status).toBe('aborted');
    expect(receivedSignals.every((signal) => signal.aborted)).toBe(true);
    presentation.dispose();
    presentation.dispose();
    const renderCountAfterDispose = requestRender.mock.calls.length;
    const telemetryCountAfterDispose = onTelemetryChange.mock.calls.length;
    pendingResolvers.forEach((resolve) => resolve());
    await presentation.ready;
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
    expect(requestRender).toHaveBeenCalledTimes(renderCountAfterDispose);
    expect(onTelemetryChange).toHaveBeenCalledTimes(telemetryCountAfterDispose);
    expect(presentation.getTelemetry().status).toBe('disposed');
    expect(presentation.group.parent).toBeNull();
    expect(presentation.group.children).toHaveLength(0);
  });

  it('releases every fallback instance buffer once during idempotent teardown', async () => {
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'reduced',
      visualSeed: 5,
      reducedMotion: true,
      loadExactAssets: false,
    });
    await presentation.ready;
    const instances: THREE.InstancedMesh[] = [];
    presentation.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    const disposals = instances.map((instance) => vi.spyOn(instance, 'dispose'));

    expect(instances.length).toBeGreaterThan(0);
    presentation.dispose();
    presentation.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('allows an exact wildlife layer to suppress the temporary rabbits', async () => {
    const presentation = createInnerKeepOuterWorldPresentation({
      quality: 'high',
      visualSeed: 88,
      reducedMotion: false,
      loadExactAssets: false,
    });
    await presentation.ready;
    expect(presentation.getTelemetry().wildlifeCount).toBe(10);
    expect(presentation.setProceduralWildlifeVisible(false)).toBe(true);
    expect(presentation.getTelemetry()).toMatchObject({
      wildlifeCount: 0,
      proceduralWildlifeCount: 0,
      groundedWildlifeCount: 0,
    });
    expect(presentation.setProceduralWildlifeVisible(false)).toBe(false);
    presentation.dispose();
  });
});
