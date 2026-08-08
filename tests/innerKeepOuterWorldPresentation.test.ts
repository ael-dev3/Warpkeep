import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createInnerKeepOuterWorldPresentation,
  planInnerKeepOuterWorldResources,
  planInnerKeepOuterWorldTrees,
  planInnerKeepOuterWorldWildlife,
  type AcquireOuterWorldExpeditionPrefab,
  type AcquireOuterWorldTreePrefab,
} from '../src/components/inner-keep/createInnerKeepOuterWorldPresentation';
import {
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  INNER_KEEP_OUTER_WORLD_TREE_BUDGETS,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';

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
      new THREE.BoxGeometry(1, 1, 1),
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
      expect(resources).toHaveLength(
        INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce((count, site) => (
          count + site.instancesByQuality[quality]
        ), 0),
      );
      expect(new Set(firstTrees.map(({ speciesId }) => speciesId)).size).toBe(6);
    },
  );

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
      exactTreeSpeciesCount: 6,
      resourceCount: 4,
      exactResourceCount: 4,
      fallbackResourceCount: 0,
      exactResourceFamilyCount: 4,
      exactSupplyWagonCount: 1,
      fallbackSupplyWagonCount: 0,
      failures: [],
    });
    expect(assets.acquireTreePrefab).toHaveBeenCalledTimes(6);
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
      expect(placement.positionMeters[1]).toBeCloseTo(
        terrainHeightAt(placement.positionMeters[0], placement.positionMeters[2]),
      );
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
      expect(contact.position.y).toBeCloseTo(terrainHeightAt(contact.position.x, contact.position.z));
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
