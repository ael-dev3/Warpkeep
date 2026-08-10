import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  createInnerKeepSceneLayer,
  type CreateInnerKeepSceneLayerOptions
} from '../src/components/inner-keep/createInnerKeepSceneLayer';
import {
  createInnerKeepFarCountryside,
  type InnerKeepFarCountryside
} from '../src/components/inner-keep/createInnerKeepFarCountryside';
import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_GRASS_PATCH_SUPPORT_RADIUS_METERS,
  INNER_KEEP_WATER_CENTERLINE,
  INNER_KEEP_WATER_POND
} from '../src/components/inner-keep/createInnerKeepEcology';
import {
  INNER_KEEP_FREE_PLACEMENT_ENVELOPES
} from '../src/components/inner-keep/innerKeepFreePlacementPolicy';
import { allInnerKeepStaticRuntimeAssetIds } from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import {
  createInnerKeepOuterWorldRenderedTerrainSampler,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_FAR_COUNTRYSIDE_CAMERA,
  INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS,
  INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS,
  INNER_KEEP_FAR_COUNTRYSIDE_POLICY_DIGEST,
  INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION,
  innerKeepFarCountrysideMinimumZoomForAspect,
} from '../src/components/inner-keep/innerKeepFarCountrysidePolicy';
import type {
  InnerKeepRuntimeAssetBundle,
  InnerKeepRuntimePrefab
} from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import type { InnerKeepBuildingPresentation } from '../src/components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS,
  INNER_KEEP_TOWN_ATMOSPHERE_POLICY_VERSION,
  INNER_KEEP_TOWN_TONAL_PALETTE,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';
import {
  createInnerKeepPresentation,
  createInnerKeepTestBuilding,
} from './fixtures/innerKeepPresentation';
import { evaluateInnerKeepPlacementDraft } from '../src/components/inner-keep/innerKeepPlacement';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createLayer(
  reducedMotion = false,
  width = 1280,
  height = 720,
  assetLoading: 'auto' | 'disabled' = 'disabled',
  runtimeAssetLoader?: CreateInnerKeepSceneLayerOptions['runtimeAssetLoader'],
  quality: CreateInnerKeepSceneLayerOptions['quality'] = 'balanced',
  farCountrysideFactory?: CreateInnerKeepSceneLayerOptions['farCountrysideFactory'],
) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height }
  });
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  });
  document.body.append(canvas);
  const requestRender = vi.fn();
  return {
    canvas,
    layer: createInnerKeepSceneLayer({
      canvas,
      quality,
      reducedMotion,
      requestRender,
      assetLoading,
      outerWorldAssetLoading: 'disabled',
      ...(runtimeAssetLoader ? { runtimeAssetLoader } : {}),
      ...(farCountrysideFactory ? { farCountrysideFactory } : {}),
    }),
    requestRender
  };
}

function sceneGrassPositions(scene: THREE.Scene) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const positions: THREE.Vector3[] = [];
  scene.traverse((object) => {
    if (
      !(object instanceof THREE.InstancedMesh)
      || !object.name.startsWith('inner-keep-dense-grass')
    ) return;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      positions.push(position.setFromMatrixPosition(matrix).clone());
    }
  });
  return positions;
}

function fakeRuntimePrefab(
  id: string,
  boundsMeters: readonly [number, number, number] = [1, 1, 1],
): InnerKeepRuntimePrefab {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  ));
  return Object.freeze({
    id,
    root,
    clips: Object.freeze([]),
    boundsMeters: Object.freeze([...boundsMeters] as [number, number, number]),
    triangles: 12,
    drawCalls: 1,
    animated: false,
    mounted: false,
    clone: () => root.clone(true)
  });
}

function fakeRuntimeBundleWithCanonicalStaticBounds(): InnerKeepRuntimeAssetBundle {
  const boundsById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
    [asset.assetId, asset.boundsMeters] as const
  )));
  return Object.freeze({
    staticPrefabs: new Map(allInnerKeepStaticRuntimeAssetIds().map((id) => [
      id,
      fakeRuntimePrefab(id, boundsById.get(id) ?? [1, 1, 1]),
    ])),
    populationPrefabs: new Map(),
    failures: Object.freeze([]),
    dispose: vi.fn(),
  });
}

function fakeRuntimeBundle(
  completeStaticCoverage: boolean,
  failures: InnerKeepRuntimeAssetBundle['failures'] = Object.freeze([])
): InnerKeepRuntimeAssetBundle {
  const ids = allInnerKeepStaticRuntimeAssetIds();
  const selectedIds = completeStaticCoverage ? ids : ids.slice(0, -1);
  return fakeRuntimeBundleWithIds(selectedIds, [], failures);
}

function fakeRuntimeBundleWithIds(
  staticIds: readonly string[],
  populationIds: readonly string[],
  failures: InnerKeepRuntimeAssetBundle['failures'] = Object.freeze([])
): InnerKeepRuntimeAssetBundle {
  return Object.freeze({
    staticPrefabs: new Map(staticIds.map((id) => [id, fakeRuntimePrefab(id)])),
    populationPrefabs: new Map(populationIds.map((id) => [id, fakeRuntimePrefab(id)])),
    failures,
    dispose: vi.fn()
  });
}

describe('procedural Inner Keep scene layer', () => {
  it('pins the persistent weathered-lowlands palette and lower ward', () => {
    const { layer } = createLayer();
    expect((layer.scene.background as THREE.Color).getHex())
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.skyFog);
    expect(layer.scene.fog).toBeInstanceOf(THREE.Fog);
    expect((layer.scene.fog as THREE.Fog).color.getHex())
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.skyFog);
    expect((layer.scene.fog as THREE.Fog).near)
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.fogNearMeters);
    expect((layer.scene.fog as THREE.Fog).far)
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.fogFarMeters);
    expect(layer.scene.userData.innerKeepTownAtmospherePolicyVersion)
      .toBe(INNER_KEEP_TOWN_ATMOSPHERE_POLICY_VERSION);
    expect(layer.scene.userData.innerKeepFarCountrysidePolicyVersion)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION);
    expect(layer.scene.userData.innerKeepFarCountrysidePolicyDigest)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_POLICY_DIGEST);
    expect(layer.scene.userData.innerKeepFarCountrysideHalfExtentsMeters)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS);
    expect(layer.scene.userData.innerKeepFarCountrysidePanBoundsMeters)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters);
    expect(layer.scene.userData.innerKeepFarCountrysideStatus).toBe('ready');
    expect(layer.scene.userData.innerKeepFarCountrysideFieldTuftCount)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS.balanced);
    expect(layer.scene.userData.innerKeepFarCountrysideHedgerowTreeCount)
      .toBe(INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS.balanced);

    const hemisphere = layer.scene.children.find(
      (object): object is THREE.HemisphereLight => object instanceof THREE.HemisphereLight,
    );
    const sun = layer.scene.children.find(
      (object): object is THREE.DirectionalLight => object instanceof THREE.DirectionalLight,
    );
    expect(hemisphere?.color.getHex())
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.hemisphereSky);
    expect(hemisphere?.groundColor.getHex())
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.hemisphereGround);
    expect(hemisphere?.intensity)
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.hemisphereIntensity);
    expect(sun?.color.getHex()).toBe(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.sun);
    expect(sun?.intensity).toBe(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.sunIntensity);
    expect(sun?.position.toArray())
      .toEqual([...INNER_KEEP_TOWN_TONAL_PALETTE.lighting.sunPositionMeters]);

    const atmosphere = layer.scene.getObjectByName(
      'inner-keep-weathered-town-atmosphere',
    );
    expect(atmosphere).toBeDefined();
    expect(atmosphere?.children.filter(({ name }) => (
      name.startsWith('inner-keep-lower-ward-row-house:')
    ))).toHaveLength(INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS.balanced);
    layer.dispose();
  });

  it('opens as a sparse free-placement yard without legacy pads or prebuilt landmarks', () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });

    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      slotCount: 0,
      buildingPickTargetCount: 0,
      completedBuildingCount: 0,
      constructionSiteCount: 0,
      exteriorTreeCount: 56,
      scenicResourceNodeCount: 6,
      wildlifeCount: 7,
      proceduralWildlifeCount: 7,
      exactWildlifeCount: 0,
      tradeWagonCount: 1
    });
    expect(layer.scene.getObjectByName('inner-keep-slot-pad:inner-keep-slot-m01'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-procedural-cathedral-fallback'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-procedural-barracks-fallback'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-barracks'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName(
      'inner-keep-completed-building:grand-covenant-cathedral',
    )).toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-procedural-builder-noticeboard'))
      .toBeDefined();
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('culls soft yard dressing beneath every authoritative building envelope', () => {
    const { layer } = createLayer();
    const placement = Object.freeze({
      localXMicrounits: -10_500_000n,
      localZMicrounits: 9_000_000n,
      rotationMilliDegrees: 0
    });
    expect(evaluateInnerKeepPlacementDraft(
      'lumber-camp',
      placement,
      []
    ).evaluation.valid).toBe(true);

    layer.reconcile(createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'lumber-camp',
        placement
      })]
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-soft-yard-dressing:0'))
      .toBeUndefined();
    const retainedDressing: THREE.Object3D[] = [];
    layer.scene.traverse((object) => {
      if (object.name.startsWith('inner-keep-soft-yard-dressing:')) {
        retainedDressing.push(object);
      }
    });
    expect(retainedDressing).toHaveLength(5);
    layer.dispose();
  });

  it('makes fixed fallback civic dressing yield to a legal building footprint', () => {
    const { layer } = createLayer();
    const placement = Object.freeze({
      localXMicrounits: -11_000_000n,
      localZMicrounits: 22_000_000n,
      rotationMilliDegrees: 0
    });
    expect(evaluateInnerKeepPlacementDraft(
      'city-mill',
      placement,
      []
    ).evaluation.valid).toBe(true);

    layer.reconcile(createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'city-mill',
        placement
      })]
    }), { owningTerrainKind: 'meadow' });

    const noticeboard = layer.scene.getObjectByName(
      'inner-keep-procedural-yielding-placement:builder-noticeboard'
    );
    const sign = layer.scene.getObjectByName(
      'inner-keep-procedural-yielding-placement:civic-direction-sign'
    );
    expect(noticeboard?.children).toHaveLength(4);
    expect(noticeboard?.visible).toBe(false);
    expect(sign?.visible).toBe(true);

    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'meadow'
    });
    expect(noticeboard?.visible).toBe(true);
    expect(sign?.visible).toBe(true);
    layer.dispose();
  });

  it('keeps the tinted detailed terrain and countryside visually seamless', () => {
    const { layer } = createLayer();
    layer.setViewport(1_280, 720);
    const presentation = createInnerKeepPresentation();
    for (const owningTerrainKind of ['forest', 'heath', 'meadow'] as const) {
      layer.reconcile(presentation, { owningTerrainKind });
      const detailed = layer.scene.getObjectByName(
        'inner-keep-outer-topographic-terrain',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const far = layer.scene.getObjectByName(
        'inner-keep-far-countryside-field-overscan',
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const detailedPositions = detailed.geometry.getAttribute('position');
      const detailedColors = detailed.geometry.getAttribute('color');
      const detailedOutputByPosition = new Map<string, THREE.Color>();
      for (let index = 0; index < detailedPositions.count; index += 1) {
        const x = detailedPositions.getX(index);
        const z = detailedPositions.getZ(index);
        if (Math.abs(Math.abs(x) - INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS[0])
            > 0.000_01
          && Math.abs(Math.abs(z) - INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS[1])
            > 0.000_01) continue;
        detailedOutputByPosition.set(`${x.toFixed(5)}:${z.toFixed(5)}`, new THREE.Color(
          detailedColors.getX(index),
          detailedColors.getY(index),
          detailedColors.getZ(index),
        ).multiply(detailed.material.color));
      }
      const farPositions = far.geometry.getAttribute('position');
      const farColors = far.geometry.getAttribute('color');
      let compared = 0;
      for (let index = 0; index < farPositions.count; index += 1) {
        const expected = detailedOutputByPosition.get(
          `${farPositions.getX(index).toFixed(5)}:${farPositions.getZ(index).toFixed(5)}`,
        );
        if (!expected) continue;
        compared += 1;
        expect(farColors.getX(index), owningTerrainKind).toBeCloseTo(expected.r, 6);
        expect(farColors.getY(index), owningTerrainKind).toBeCloseTo(expected.g, 6);
        expect(farColors.getZ(index), owningTerrainKind).toBeCloseTo(expected.b, 6);
      }
      expect(compared).toBeGreaterThan(200);
    }
    layer.dispose();
  });

  it('releases every instance buffer once during complete layer teardown', () => {
    const { layer } = createLayer();
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });
    const instances: THREE.InstancedMesh[] = [];
    layer.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    const disposals = instances.map((instance) => vi.spyOn(instance, 'dispose'));

    expect(instances.length).toBeGreaterThan(0);
    layer.dispose();
    layer.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('aligns the procedural fallback to the expanded canonical authored anchors', () => {
    const { layer } = createLayer();
    const authoredByPlacementId = new Map(INNER_KEEP_PRESENTATION_PLACEMENTS.flatMap(
      (placement) => placement.instances.map((instance) => (
        [instance.placementId, instance] as const
      )),
    ));
    const fallbackToAuthored = [
      ['inner-keep-procedural-south-gate-frame', 'south-gate-frame'],
      ['inner-keep-procedural-gate-standard-west', 'gate-standard-west'],
      ['inner-keep-procedural-gate-standard-east', 'gate-standard-east'],
      ['inner-keep-procedural-builder-noticeboard', 'builder-noticeboard'],
      ['inner-keep-procedural-civic-direction-sign', 'civic-direction-sign'],
      ['inner-keep-procedural-south-east-water-trough', 'south-east-water-trough'],
    ] as const;
    for (const [fallbackName, placementId] of fallbackToAuthored) {
      const fallback = layer.scene.getObjectByName(fallbackName);
      const authored = authoredByPlacementId.get(placementId)!;
      expect(fallback, fallbackName).toBeDefined();
      expect(fallback?.position.x, fallbackName).toBe(authored.positionMeters[0]);
      expect(fallback?.position.z, fallbackName).toBe(authored.positionMeters[2]);
    }
    for (const removedName of [
      'inner-keep-procedural-cathedral-fallback',
      'inner-keep-procedural-barracks-fallback',
      'inner-keep-procedural-hedge-west-north',
      'inner-keep-procedural-hedge-east-north',
      'inner-keep-procedural-hedge-west-south',
      'inner-keep-procedural-hedge-east-south',
      'inner-keep-procedural-north-collapsed-arch',
    ]) expect(layer.scene.getObjectByName(removedName), removedName).toBeUndefined();
    layer.dispose();
  });

  it('grounds every fallback wall run and leaves the south gate visibly open', () => {
    const { layer } = createLayer();
    const terrain = createInnerKeepOuterWorldRenderedTerrainSampler('balanced');
    const wallNames = [
      'north',
      'west',
      'east',
      'south-west',
      'south-east',
    ] as const;
    const wallBounds = new Map<string, THREE.Box3>();
    for (const wallName of wallNames) {
      const wall = layer.scene.getObjectByName(
        `inner-keep-procedural-wall:${wallName}`,
      );
      expect(wall, wallName).toBeInstanceOf(THREE.Mesh);
      const bounds = new THREE.Box3().setFromObject(wall!);
      wallBounds.set(wallName, bounds);
      expect(bounds.min.y, wallName).toBeCloseTo(
        terrain.heightAt(wall!.position.x, wall!.position.z),
        10,
      );
      expect(wall!.userData).toMatchObject({
        presentationOnly: true,
        gameplayAuthorityClaimed: false,
      });
    }

    expect(wallBounds.get('north')!.intersectsBox(wallBounds.get('west')!)).toBe(true);
    expect(wallBounds.get('north')!.intersectsBox(wallBounds.get('east')!)).toBe(true);
    expect(wallBounds.get('south-west')!.intersectsBox(wallBounds.get('west')!))
      .toBe(true);
    expect(wallBounds.get('south-east')!.intersectsBox(wallBounds.get('east')!))
      .toBe(true);

    const southWestBounds = new THREE.Box3().setFromObject(
      layer.scene.getObjectByName('inner-keep-procedural-wall:south-west')!,
    );
    const southEastBounds = new THREE.Box3().setFromObject(
      layer.scene.getObjectByName('inner-keep-procedural-wall:south-east')!,
    );
    expect(southWestBounds.max.x).toBeCloseTo(-3, 6);
    expect(southEastBounds.min.x).toBeCloseTo(3, 6);

    for (const postName of [
      'inner-keep-procedural-south-gate-west-post',
      'inner-keep-procedural-south-gate-east-post',
    ]) {
      const post = layer.scene.getObjectByName(postName);
      expect(post, postName).toBeInstanceOf(THREE.Mesh);
      expect(new THREE.Box3().setFromObject(post!).min.y, postName)
        .toBeCloseTo(terrain.heightAt(post!.position.x, post!.position.z), 10);
      expect(post!.userData).toMatchObject({
        presentationOnly: true,
        gameplayAuthorityClaimed: false,
      });
    }
    layer.dispose();
  });

  it.each(['high', 'balanced', 'reduced'] as const)(
    'grounds the %s earth apron and streets on the rendered terrain triangles',
    (quality) => {
      const { layer } = createLayer(false, 1280, 720, 'disabled', undefined, quality);
      const terrainHeightAt =
        createInnerKeepOuterWorldRenderedTerrainSampler(quality).heightAt;
      const estateRoads = layer.scene.getObjectByName(
        'inner-keep-outer-estate-road-network'
      );
      const apron = layer.scene.getObjectByName('inner-keep-city-edge-earth-apron');
      const streets = layer.scene.getObjectByName(
        'inner-keep-city-district-road-network'
      );
      const coreStreets = layer.scene.getObjectByName(
        'inner-keep-city-core-road-network'
      );
      expect((streets as THREE.Mesh).geometry.getAttribute('position').count).toBe(0);
      for (const presentationOnly of [estateRoads, apron, coreStreets]) {
        expect(presentationOnly).toBeInstanceOf(THREE.Mesh);
        expect(presentationOnly?.userData).toMatchObject({
          presentationOnly: true,
          gameplayAuthorityClaimed: false
        });
        const geometry = (presentationOnly as THREE.Mesh).geometry;
        expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
        expect(geometry.index?.count).toBeGreaterThan(0);
        const index = geometry.index!;
        const position = geometry.getAttribute('position');
        const first = new THREE.Vector3().fromBufferAttribute(position, index.getX(0));
        const second = new THREE.Vector3().fromBufferAttribute(position, index.getX(1));
        const third = new THREE.Vector3().fromBufferAttribute(position, index.getX(2));
        const faceNormal = new THREE.Vector3()
          .subVectors(second, first)
          .cross(new THREE.Vector3().subVectors(third, first))
          .normalize();
        expect(faceNormal.y, presentationOnly?.name).toBeGreaterThan(0.9);
        const barycentricSamples = [
          [1 / 3, 1 / 3, 1 / 3],
          [0.6, 0.2, 0.2],
          [0.2, 0.6, 0.2],
          [0.2, 0.2, 0.6],
        ] as const;
        let minimumTerrainDelta = Number.POSITIVE_INFINITY;
        let maximumTerrainDelta = Number.NEGATIVE_INFINITY;
        for (let triangle = 0; triangle < index.count; triangle += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(
            position,
            index.getX(triangle),
          );
          const b = new THREE.Vector3().fromBufferAttribute(
            position,
            index.getX(triangle + 1),
          );
          const c = new THREE.Vector3().fromBufferAttribute(
            position,
            index.getX(triangle + 2),
          );
          for (const [weightA, weightB, weightC] of barycentricSamples) {
            const sample = new THREE.Vector3()
              .addScaledVector(a, weightA)
              .addScaledVector(b, weightB)
              .addScaledVector(c, weightC);
            const terrainDelta = sample.y - terrainHeightAt(
              sample.x,
              sample.z,
            );
            minimumTerrainDelta = Math.min(minimumTerrainDelta, terrainDelta);
            maximumTerrainDelta = Math.max(maximumTerrainDelta, terrainDelta);
          }
        }
        expect(minimumTerrainDelta, presentationOnly?.name).toBeGreaterThanOrEqual(-0.003);
        expect(maximumTerrainDelta, presentationOnly?.name).toBeLessThanOrEqual(0.08);
      }
      layer.dispose();
    },
  );

  it.each(['high', 'balanced', 'reduced'] as const)(
    'threads the %s rendered surface through ecology, trees, resources, and rabbits',
    (quality) => {
      const { layer } = createLayer(true, 1280, 720, 'disabled', undefined, quality);
      layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });
      const terrainHeightAt =
        createInnerKeepOuterWorldRenderedTerrainSampler(quality).heightAt;

      const contacts: THREE.Object3D[] = [];
      layer.scene.traverse((object) => {
        if (
          object.name.startsWith('inner-keep-outer-tree-contact:')
          || object.name.startsWith('inner-keep-outer-resource-contact:')
          || object.name.startsWith('inner-keep-old-road-grave:')
        ) contacts.push(object);
      });
      expect(contacts.length).toBeGreaterThan(0);
      for (const contact of contacts) {
        const centerHeight = terrainHeightAt(contact.position.x, contact.position.z);
        if (contact.name.startsWith('inner-keep-outer-tree-contact:')) {
          expect(contact.position.y, contact.name).toBeGreaterThanOrEqual(centerHeight - 0.000_01);
          expect(contact.position.y - centerHeight, contact.name)
            .toBeLessThanOrEqual(0.075_01);
        } else {
          expect(contact.position.y, contact.name).toBeCloseTo(centerHeight, 6);
        }
      }

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      layer.scene.traverse((object) => {
        if (
          !(object instanceof THREE.InstancedMesh)
          || !object.name.startsWith('inner-keep-dense-grass')
        ) return;
        for (let index = 0; index < object.count; index += 1) {
          object.getMatrixAt(index, matrix);
          position.setFromMatrixPosition(matrix);
          expect(position.y, `${object.name}:${index}`).toBeCloseTo(
            terrainHeightAt(position.x, position.z),
            5,
          );
        }
      });

      const rabbitBodies = layer.scene.getObjectByName(
        'inner-keep-outer-rabbit-bodies',
      ) as THREE.InstancedMesh;
      const scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      expect(rabbitBodies.count).toBeGreaterThan(0);
      for (let index = 0; index < rabbitBodies.count; index += 1) {
        rabbitBodies.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        expect(position.y - 0.22 * scale.z, `rabbit:${index}`).toBeCloseTo(
          terrainHeightAt(position.x, position.z),
          5,
        );
      }

      for (const [name, lift] of [
        ['inner-keep-marsh-wet-ground', 0.018],
        ['inner-keep-old-road-graveyard-footpath', 0.035],
      ] as const) {
        const drape = layer.scene.getObjectByName(name) as THREE.Mesh;
        const drapePositions = drape.geometry.getAttribute('position');
        for (let index = 0; index < drapePositions.count; index += 1) {
          const x = drapePositions.getX(index);
          const y = drapePositions.getY(index);
          const z = drapePositions.getZ(index);
          expect(y - terrainHeightAt(x, z), `${name}:${index}`).toBeCloseTo(lift, 5);
        }
      }

      const ruts = layer.scene.getObjectByName(
        'inner-keep-rain-darkened-wheel-ruts',
      ) as THREE.Mesh;
      const rutPositions = ruts.geometry.getAttribute('position');
      for (let index = 0; index < rutPositions.count; index += 1) {
        const delta = rutPositions.getY(index) - terrainHeightAt(
          rutPositions.getX(index),
          rutPositions.getZ(index),
        );
        expect(delta, `rut:${index}`).toBeGreaterThanOrEqual(0.054);
        expect(delta, `rut:${index}`).toBeLessThanOrEqual(0.199);
      }
      layer.dispose();
    },
  );

  it('keeps authoritative building projection and exact picking aligned after pan and zoom', () => {
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    const mill = createInnerKeepTestBuilding({ buildingKind: 'city-mill' });
    layer.reconcile(createInnerKeepPresentation({ buildings: [mill] }), {
      owningTerrainKind: 'meadow'
    });

    const initial = layer.getBuildingProjectionFrame();
    const initialMill = initial.buildings.find(({ buildingKey }) => (
      buildingKey === mill.buildingKey
    ));
    expect(initial.buildings).toHaveLength(1);
    expect(initialMill).toMatchObject({ visible: true });
    expect(initialMill?.width).toBeGreaterThan(0);
    expect(initialMill?.height).toBeGreaterThan(0);
    expect(layer.pickBuilding(initialMill!.x, initialMill!.y)).toBe(mill.buildingKey);
    layer.setSelectedBuilding(mill.buildingKey);
    let selectedRoot: THREE.Object3D | undefined;
    layer.scene.traverse((object) => {
      if (object.userData.innerKeepBuildingKey === mill.buildingKey) selectedRoot ??= object;
    });
    expect(selectedRoot?.userData.innerKeepSelected).toBe(true);
    const selectedMaterials: THREE.MeshStandardMaterial[] = [];
    selectedRoot?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) selectedMaterials.push(material);
      }
    });
    expect(selectedMaterials.some(({ emissiveIntensity }) => emissiveIntensity >= 0.2))
      .toBe(true);
    layer.setSelectedBuilding(null);
    expect(selectedRoot?.userData.innerKeepSelected).toBe(false);

    layer.panByPixels(140, -70);
    const pannedMill = layer.getBuildingProjectionFrame().buildings.find(({ buildingKey }) => (
      buildingKey === mill.buildingKey
    ));
    expect(pannedMill?.x).not.toBeCloseTo(initialMill!.x, 3);
    expect(pannedMill?.y).not.toBeCloseTo(initialMill!.y, 3);
    expect(layer.pickBuilding(pannedMill!.x, pannedMill!.y)).toBe(mill.buildingKey);

    layer.zoomByWheel(-240, WheelEvent.DOM_DELTA_PIXEL);
    const zoomedMill = layer.getBuildingProjectionFrame().buildings.find(({ buildingKey }) => (
      buildingKey === mill.buildingKey
    ));
    expect(zoomedMill?.width).toBeGreaterThan(pannedMill!.width);
    expect(zoomedMill?.height).toBeGreaterThan(pannedMill!.height);
    expect(layer.pickBuilding(zoomedMill!.x, zoomedMill!.y)).toBe(mill.buildingKey);
    layer.dispose();
  });

  it('fits every authored footprint in portrait and preserves focus across rig changes', () => {
    const { layer } = createLayer(false, 390, 844);
    layer.setViewport(390, 844);
    const portraitAspect = 390 / 844;
    const portraitZoom = INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.initialZoom.portrait;
    expect(layer.camera.right).toBeCloseTo(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / portraitZoom,
      6
    );
    expect(layer.camera.top).toBeCloseTo(
      (
        INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / portraitZoom
      ) / portraitAspect,
      6
    );
    expect(layer.camera.position).toMatchObject({ x: 0, y: 112, z: 72 });

    const assetById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
      [asset.assetId, asset] as const
    )));
    for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
      if (placement.anchor !== 'fixed') continue;
      const asset = assetById.get(placement.assetId)!;
      for (const instance of placement.instances) {
        const radians = instance.rotationMilliDegrees[1] / 1_000 * Math.PI / 180;
        const cosine = Math.abs(Math.cos(radians));
        const sine = Math.abs(Math.sin(radians));
        const unrotatedHalfX = asset.boundsMeters[0]
          * instance.scalePermille[0] / 2_000;
        const unrotatedHalfZ = asset.boundsMeters[2]
          * instance.scalePermille[2] / 2_000;
        const halfX = cosine * unrotatedHalfX + sine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;
        const halfZ = sine * unrotatedHalfX + cosine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;
        const height = asset.boundsMeters[1] * instance.scalePermille[1] / 1_000;
        for (const x of [
          instance.positionMeters[0] - halfX,
          instance.positionMeters[0] + halfX
        ]) for (const z of [
          instance.positionMeters[2] - halfZ,
          instance.positionMeters[2] + halfZ
        ]) for (const y of [0, height]) {
          const projected = new THREE.Vector3(x, y, z).project(layer.camera);
          expect(Math.abs(projected.x), instance.placementId).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y), instance.placementId).toBeLessThanOrEqual(1);
        }
      }
    }
    for (const waterPoint of [
      ...INNER_KEEP_WATER_CENTERLINE,
      INNER_KEEP_WATER_POND.center
    ]) {
      const projected = new THREE.Vector3(
        waterPoint.x,
        waterPoint.y,
        waterPoint.z
      ).project(layer.camera);
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
    }

    layer.zoomByWheel(600, WheelEvent.DOM_DELTA_PIXEL);
    layer.panByPixels(90, -45);
    const manuallyAdjustedPosition = layer.camera.position.clone();
    const focusX = manuallyAdjustedPosition.x
      - INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.portrait.positionMeters[0];
    const focusZ = manuallyAdjustedPosition.z
      - INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.portrait.positionMeters[2];
    layer.setViewport(1280, 720);

    expect(layer.camera.top).toBeGreaterThan(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight
    );
    expect(layer.camera.position.x).toBeCloseTo(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[0] + focusX,
      6,
    );
    expect(layer.camera.position.z).toBeCloseTo(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[2] + focusZ,
      6,
    );
    layer.setViewport(390, 844);
    expect(layer.camera.position.x).toBeCloseTo(manuallyAdjustedPosition.x, 6);
    expect(layer.camera.position.z).toBeCloseTo(manuallyAdjustedPosition.z, 6);
    layer.dispose();
  });

  it('keeps pan responsive but tightly clamped and does not make zoom sticky', () => {
    const { layer } = createLayer(false, 844, 390);
    layer.setViewport(844, 390);
    const initialTop = layer.camera.top;
    const initialPosition = layer.camera.position.clone();
    const projectedBefore = new THREE.Vector3(0, 0, 0).project(layer.camera);

    layer.panByPixels(100, 0);
    expect(layer.camera.position.x).toBeLessThan(initialPosition.x - 1);
    const projectedAfterHorizontal = new THREE.Vector3(0, 0, 0).project(layer.camera);
    expect(Math.abs(projectedAfterHorizontal.x - projectedBefore.x)).toBeGreaterThan(0.02);
    expect(projectedAfterHorizontal.y).toBeCloseTo(projectedBefore.y, 6);
    layer.panByPixels(-100, 0);
    expect(layer.camera.position.x).toBeCloseTo(initialPosition.x, 6);
    expect(layer.camera.position.z).toBeCloseTo(initialPosition.z, 6);

    layer.panByPixels(0, 100);
    const projectedAfterVertical = new THREE.Vector3(0, 0, 0).project(layer.camera);
    expect(projectedAfterVertical.x).toBeCloseTo(projectedBefore.x, 6);
    expect(Math.abs(projectedAfterVertical.y - projectedBefore.y)).toBeGreaterThan(0.02);
    layer.panByPixels(0, -100);
    expect(layer.camera.position.x).toBeCloseTo(initialPosition.x, 6);
    expect(layer.camera.position.z).toBeCloseTo(initialPosition.z, 6);

    layer.panByPixels(1_000_000, 1_000_000);
    const clampedFocusX = layer.camera.position.x
      - INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[0];
    const clampedFocusZ = layer.camera.position.z
      - INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[2];
    const [minimumPanX, maximumPanX] = INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.x;
    const [minimumPanZ, maximumPanZ] = INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.z;
    expect(clampedFocusX).toBeGreaterThanOrEqual(minimumPanX);
    expect(clampedFocusX).toBeLessThanOrEqual(maximumPanX);
    expect(clampedFocusZ).toBeGreaterThanOrEqual(minimumPanZ);
    expect(clampedFocusZ).toBeLessThanOrEqual(maximumPanZ);
    expect(Math.max(Math.abs(clampedFocusX), Math.abs(clampedFocusZ)))
      .toBeCloseTo(maximumPanX, 6);
    layer.panByPixels(-1_000_000, -1_000_000);
    expect(Math.abs(
      layer.camera.position.x - INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[0],
    )).toBeLessThanOrEqual(maximumPanX);
    expect(Math.abs(
      layer.camera.position.z - INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters[2],
    )).toBeLessThanOrEqual(maximumPanZ);

    layer.setViewport(390, 844);
    expect(layer.camera.top).toBeCloseTo(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth
        / INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.initialZoom.portrait
        / (390 / 844),
      6,
    );
    layer.setViewport(844, 390);
    expect(layer.camera.top).toBeCloseTo(initialTop, 6);

    layer.zoomByWheel(1_000_000, WheelEvent.DOM_DELTA_PIXEL);
    const requestedMinimumTop = layer.camera.top;
    layer.setViewport(1_200, 200);
    expect(layer.camera.top).toBeLessThan(requestedMinimumTop);
    layer.setViewport(844, 390);
    expect(layer.camera.top).toBeCloseTo(requestedMinimumTop, 6);
    layer.dispose();
  });

  it('keeps every supported camera ray inside the fog-softened countryside', () => {
    const viewports = [
      [1_440, 900],
      [844, 390],
      [390, 844],
      [320, 800],
      [1_200, 200],
      [200, 1_000],
    ] as const;
    const [outerX, outerZ] = INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS;
    const maximumX = outerX - INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS;
    const maximumZ = outerZ - INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS;
    for (const [width, height] of viewports) {
      const { layer } = createLayer(false, width, height);
      layer.setViewport(width, height);
      layer.zoomByWheel(1_000_000, WheelEvent.DOM_DELTA_PIXEL);
      const [minimumPanX, maximumPanX] = INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.x;
      const [minimumPanZ, maximumPanZ] = INNER_KEEP_FAR_COUNTRYSIDE_CAMERA.panBoundsMeters.z;
      for (const [focusX, focusZ] of [
        [minimumPanX, minimumPanZ],
        [maximumPanX, minimumPanZ],
        [minimumPanX, maximumPanZ],
        [maximumPanX, maximumPanZ],
      ] as const) {
        const camera = layer.camera.clone();
        camera.position.x += focusX;
        camera.position.z += focusZ;
        camera.updateMatrixWorld();
        for (const terrainHeight of [
          INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum,
          INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum,
        ]) for (const ndcX of [-1, 1]) for (const ndcY of [-1, 1]) {
          const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
          const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
          const direction = far.clone().sub(near);
          const progress = (terrainHeight - near.y) / direction.y;
          expect(progress, `${width}x${height}:near/far`).toBeGreaterThanOrEqual(0);
          expect(progress, `${width}x${height}:near/far`).toBeLessThanOrEqual(1);
          const point = near.addScaledVector(direction, progress);
          expect(Math.abs(point.x), `${width}x${height}:x`).toBeLessThanOrEqual(maximumX);
          expect(Math.abs(point.z), `${width}x${height}:z`).toBeLessThanOrEqual(maximumZ);
        }
      }
      layer.dispose();
    }
  });

  it('keeps the canonical scene usable if the optional horizon fails', () => {
    const { layer } = createLayer(
      false,
      1_280,
      720,
      'disabled',
      undefined,
      'balanced',
      () => {
        throw new Error('synthetic far countryside failure');
      },
    );
    layer.setViewport(1_280, 720);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });
    expect(layer.scene.getObjectByName('inner-keep-outer-topographic-terrain'))
      .toBeInstanceOf(THREE.Mesh);
    expect(layer.scene.getObjectByName('inner-keep-far-countryside-unavailable'))
      .toBeInstanceOf(THREE.Group);
    expect(layer.scene.userData.innerKeepFarCountrysideError)
      .toBe('synthetic far countryside failure');
    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      slotCount: 0,
      farCountrysideStatus: 'degraded',
      farCountrysideTerrainTriangleCount: 0,
      farCountrysideFieldParcelCount: 0,
      farCountrysideFieldTuftCount: 0,
      farCountrysideHedgerowTreeCount: 0,
    });
    layer.dispose();
  });

  it('retires a horizon whose seam stitch fails and mounts the empty presenter', () => {
    const candidate = createInnerKeepFarCountryside('balanced');
    const dispose = vi.fn(() => candidate.dispose());
    const failingCandidate: InnerKeepFarCountryside = Object.freeze({
      ...candidate,
      stitchDetailedTerrainBoundaryNormals: () => {
        throw new Error('synthetic countryside stitch failure');
      },
      dispose
    });
    const { layer } = createLayer(
      false, 1_280, 720, 'disabled', undefined, 'balanced',
      () => failingCandidate
    );

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(layer.scene.getObjectByName('inner-keep-far-countryside-unavailable'))
      .toBeInstanceOf(THREE.Group);
    expect(layer.scene.userData.innerKeepFarCountrysideError)
      .toBe('synthetic countryside stitch failure');
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });
    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      farCountrysideStatus: 'degraded',
      farCountrysideTerrainTriangleCount: 0
    });
    layer.dispose();
  });

  it('retires a horizon whose scene installation fails', () => {
    const candidate = createInnerKeepFarCountryside('balanced');
    const blockingParent = new THREE.Group();
    blockingParent.add(candidate.group);
    vi.spyOn(blockingParent, 'remove').mockImplementation(() => {
      throw new Error('synthetic countryside install failure');
    });
    const dispose = vi.fn(() => candidate.dispose());
    const failingCandidate: InnerKeepFarCountryside = Object.freeze({
      ...candidate,
      dispose
    });
    const { layer } = createLayer(
      false, 1_280, 720, 'disabled', undefined, 'balanced',
      () => failingCandidate
    );

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(layer.scene.userData.innerKeepFarCountrysideError)
      .toBe('synthetic countryside install failure');
    expect(layer.scene.getObjectByName('inner-keep-far-countryside-unavailable'))
      .toBeInstanceOf(THREE.Group);
    layer.dispose();
  });

  it('retires a mounted horizon whose terrain tint fails during reconcile', () => {
    const candidate = createInnerKeepFarCountryside('balanced');
    const dispose = vi.fn(() => candidate.dispose());
    const failingCandidate: InnerKeepFarCountryside = Object.freeze({
      ...candidate,
      setDetailedTerrainTint: () => {
        throw new Error('synthetic countryside tint failure');
      },
      dispose
    });
    const { layer } = createLayer(
      false, 1_280, 720, 'disabled', undefined, 'balanced',
      () => failingCandidate
    );

    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'forest' });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(layer.scene.userData.innerKeepFarCountrysideError)
      .toBe('synthetic countryside tint failure');
    expect(layer.scene.getObjectByName('inner-keep-far-countryside-unavailable'))
      .toBeInstanceOf(THREE.Group);
    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      farCountrysideStatus: 'degraded',
      farCountrysideFieldTuftCount: 0,
      farCountrysideHedgerowTreeCount: 0
    });
    layer.dispose();
  });

  it('projects snapped ground placements and previews valid and blocked footprints', () => {
    const { layer } = createLayer(false, 320, 800);
    layer.setViewport(320, 800);
    const presentation = createInnerKeepPresentation();
    layer.reconcile(presentation, {
      owningTerrainKind: 'meadow'
    });

    const projected = layer.projectGroundPlacement(160, 520, 'city-mill');
    expect(projected).not.toBeNull();
    expect(projected!.transform.localXMicrounits % 500_000n).toBe(0n);
    expect(projected!.transform.localZMicrounits % 500_000n).toBe(0n);

    const validDraft = evaluateInnerKeepPlacementDraft('city-mill', {
      localXMicrounits: 14_000_000n,
      localZMicrounits: -10_000_000n,
      rotationMilliDegrees: 90_000,
    }, presentation.buildings);
    expect(validDraft.evaluation.valid).toBe(true);
    layer.setPlacementDraft(validDraft);
    expect(layer.scene.getObjectByName('inner-keep-placement-preview-footprint'))
      .toBeInstanceOf(THREE.Mesh);
    expect(layer.getTelemetry()).toMatchObject({
      placementPreviewActive: true,
      placementPreviewValid: true,
    });

    const blockedDraft = evaluateInnerKeepPlacementDraft('city-mill', {
      localXMicrounits: 0n,
      localZMicrounits: 2_000_000n,
      rotationMilliDegrees: 0,
    }, presentation.buildings);
    expect(blockedDraft.evaluation).toMatchObject({
      valid: false,
      reason: 'permanent-exclusion',
    });
    layer.setPlacementDraft(blockedDraft);
    expect(layer.getTelemetry()).toMatchObject({
      placementPreviewActive: true,
      placementPreviewValid: false,
    });
    layer.setPlacementDraft(null);
    expect(layer.scene.getObjectByName('inner-keep-placement-preview-footprint'))
      .toBeUndefined();
    layer.dispose();
  });

  it('culls grass for valid previews and authoritative building envelopes', () => {
    const { layer } = createLayer(
      true, 1280, 720, 'disabled', undefined, 'reduced'
    );
    const emptyPresentation = createInnerKeepPresentation();
    layer.reconcile(emptyPresentation, { owningTerrainKind: 'meadow' });
    const originalPositions = sceneGrassPositions(layer.scene);
    const nominalGrassBladeCount = layer.getTelemetry().grassBladeCount;
    const validDraft = originalPositions.map((position) => (
      evaluateInnerKeepPlacementDraft('city-mill', Object.freeze({
        localXMicrounits: BigInt(Math.round(position.x * 2)) * 500_000n,
        localZMicrounits: BigInt(Math.round(position.z * 2)) * 500_000n,
        rotationMilliDegrees: 0
      }), emptyPresentation.buildings)
    )).find((draft) => draft.evaluation.valid);
    expect(validDraft).toBeDefined();
    const centerX = Number(validDraft!.transform.localXMicrounits) / 1_000_000;
    const centerZ = Number(validDraft!.transform.localZMicrounits) / 1_000_000;
    const halfExtents = INNER_KEEP_FREE_PLACEMENT_ENVELOPES['city-mill']
      .halfExtentsMeters;
    const clearsEnvelope = (position: THREE.Vector3) => (
      Math.abs(position.x - centerX)
        > halfExtents[0] + INNER_KEEP_GRASS_PATCH_SUPPORT_RADIUS_METERS
      || Math.abs(position.z - centerZ)
        > halfExtents[1] + INNER_KEEP_GRASS_PATCH_SUPPORT_RADIUS_METERS
    );

    layer.setPlacementDraft(validDraft!);
    const previewPositions = sceneGrassPositions(layer.scene);
    expect(previewPositions.length).toBeLessThan(originalPositions.length);
    expect(previewPositions.every(clearsEnvelope)).toBe(true);
    expect(layer.getTelemetry().grassBladeCount).toBe(nominalGrassBladeCount);

    layer.setPlacementDraft(null);
    expect(sceneGrassPositions(layer.scene).map(({ x, y, z }) => [x, y, z]))
      .toEqual(originalPositions.map(({ x, y, z }) => [x, y, z]));

    const building = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      placement: validDraft!.transform
    });
    layer.reconcile(createInnerKeepPresentation({
      projectRevision: 2n,
      buildings: [building]
    }), { owningTerrainKind: 'meadow' });
    const authoritativePositions = sceneGrassPositions(layer.scene);
    expect(authoritativePositions.length).toBeLessThan(originalPositions.length);
    expect(authoritativePositions.every(clearsEnvelope)).toBe(true);
    expect(layer.getTelemetry().grassBladeCount).toBe(nominalGrassBladeCount);
    layer.dispose();
  });

  it('culls and restores the exact seeded perimeter tree across preview and authority changes', async () => {
    const bundle = fakeRuntimeBundleWithCanonicalStaticBounds();
    let settleBundle: ((value: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const { layer } = createLayer(
      true,
      1_280,
      720,
      'auto',
      vi.fn(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
        settleBundle = resolve;
      })),
      'reduced',
    );
    const emptyPresentation = Object.freeze({
      ...createInnerKeepPresentation(),
      castleId: 700_000_000_000_000_007n,
    });
    layer.reconcile(emptyPresentation, { owningTerrainKind: 'forest' });
    expect(layer.scene.userData.innerKeepVisualSeed).toBe(975_150_069);
    const validDraft = evaluateInnerKeepPlacementDraft('city-mill', {
      localXMicrounits: -38_000_000n,
      localZMicrounits: -19_000_000n,
      rotationMilliDegrees: 0,
    }, emptyPresentation.buildings);
    expect(validDraft.evaluation.valid).toBe(true);
    layer.setPlacementDraft(validDraft);
    settleBundle!(bundle);
    const treeName =
      'inner-keep-authored-perimeter-tree:courtyard-linden-teardrop:0';
    await vi.waitFor(() => {
      expect(layer.getTelemetry()).toMatchObject({
        assetStatus: 'ready',
        authoredTreeCount: 6,
      });
      expect(layer.scene.getObjectByName(treeName)).toBeDefined();
    });
    const tree = layer.scene.getObjectByName(treeName)!;
    expect(tree.visible).toBe(false);
    expect(layer.getTelemetry().authoredTreeCount).toBe(6);

    const invalidDraft = evaluateInnerKeepPlacementDraft('city-mill', {
      localXMicrounits: 0n,
      localZMicrounits: 2_000_000n,
      rotationMilliDegrees: 0,
    }, emptyPresentation.buildings);
    expect(invalidDraft.evaluation.valid).toBe(false);
    layer.setPlacementDraft(invalidDraft);
    expect(tree.visible).toBe(true);

    layer.setPlacementDraft(validDraft);
    expect(tree.visible).toBe(false);
    layer.setPlacementDraft(null);
    expect(tree.visible).toBe(true);

    const building = Object.freeze({
      ...createInnerKeepTestBuilding({
        buildingKind: 'city-mill',
        placement: validDraft.transform,
      }),
      buildingKey: `${emptyPresentation.castleId}:city-mill`,
    });
    layer.reconcile(Object.freeze({
      ...createInnerKeepPresentation({
        projectRevision: 2n,
        buildings: [building],
      }),
      castleId: emptyPresentation.castleId,
    }), { owningTerrainKind: 'forest' });
    expect(tree.visible).toBe(false);
    expect(layer.getTelemetry().authoredTreeCount).toBe(6);

    layer.reconcile(Object.freeze({
      ...createInnerKeepPresentation({ projectRevision: 3n }),
      castleId: emptyPresentation.castleId,
    }), { owningTerrainKind: 'forest' });
    expect(tree.visible).toBe(true);
    expect(layer.getTelemetry().authoredTreeCount).toBe(6);
    layer.dispose();
  });

  it('shows only worksite geometry while constructing, then performs a bounded reveal', () => {
    const { layer } = createLayer();
    const constructing: InnerKeepBuildingPresentation = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: 1n,
      completesAtMicros: 10n,
      revision: 1n
    });
    layer.update(0);
    layer.reconcile(createInnerKeepPresentation({
      buildings: [constructing],
      builder: {
        state: 'busy',
        buildingKey: constructing.buildingKey,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!
      }
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();

    layer.reconcile(createInnerKeepPresentation({
      projectRevision: 2n,
      buildings: [{
        ...constructing,
        completedLevel: 1,
        phase: 'complete',
        revision: 2n
      }]
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.getTelemetry()).toMatchObject({
      completionRevealActive: true,
      constructionSiteCount: 0
    });
    expect(layer.getTelemetry().smokeSpriteCount).toBeGreaterThan(0);
    const smoke = layer.scene.getObjectByName(
      'inner-keep-construction-smoke'
    ) as THREE.InstancedMesh;
    const initialSmokeOpacity = (smoke.material as THREE.Material).opacity;
    expect(layer.isAnimationActive()).toBe(true);
    layer.update(0.55);
    expect((smoke.material as THREE.Material).opacity).toBeLessThan(
      initialSmokeOpacity
    );
    layer.update(1.2);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeDefined();
    expect(layer.getTelemetry()).toMatchObject({
      completionRevealActive: false,
      smokeSpriteCount: 0
    });
    layer.dispose();
  });

  it('uses a scaffold fallback while an initially complete prefab is still loading', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const { layer } = createLayer(false, 1280, 720, 'auto');
    layer.reconcile(createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      })]
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'loading',
      completedBuildingCount: 0,
      constructionSiteCount: 1
    });
    layer.dispose();
  });

  it('preserves a real completion reveal while its exact prefab finishes loading', async () => {
    let settleBundle: ((bundle: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const runtimeAssetLoader = vi.fn(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
      settleBundle = resolve;
    }));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader,
    );
    const constructing: InnerKeepBuildingPresentation = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: 1n,
      completesAtMicros: 10n,
      revision: 1n,
    });
    layer.reconcile(createInnerKeepPresentation({
      buildings: [constructing],
      builder: {
        state: 'busy',
        buildingKey: constructing.buildingKey,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!,
      },
    }), { owningTerrainKind: 'meadow' });
    layer.reconcile(createInnerKeepPresentation({
      projectRevision: 2n,
      buildings: [{
        ...constructing,
        completedLevel: 1,
        phase: 'complete',
        revision: 2n,
      }],
    }), { owningTerrainKind: 'meadow' });
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'loading',
      completionRevealActive: false,
      constructionSiteCount: 1,
    });

    settleBundle!(fakeRuntimeBundle(true));
    await vi.waitFor(() => {
      expect(layer.getTelemetry()).toMatchObject({
        assetStatus: 'ready',
        completedBuildingCount: 1,
        completionRevealActive: true,
        constructionSiteCount: 0,
      });
    });
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold'))
      .toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeDefined();
    layer.dispose();
  });

  it('reveals the exact completed building when the atomic static bundle arrives', async () => {
    let settleBundle: ((bundle: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const runtimeAssetLoader = vi.fn(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
      settleBundle = resolve;
    }));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    const completeBuilding: InnerKeepBuildingPresentation = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      completedLevel: 1,
      targetLevel: 1,
      phase: 'complete',
      startedAtMicros: 1n,
      completesAtMicros: 10n,
      revision: 1n
    });
    layer.reconcile(createInnerKeepPresentation({
      buildings: [completeBuilding]
    }), { owningTerrainKind: 'meadow' });
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();

    settleBundle!(fakeRuntimeBundle(true));
    await vi.waitFor(() => {
      expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
        .toBeDefined();
    });
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed?.userData.innerKeepAuthoredAsset).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'ready',
      authoredAssetCount: 38,
      completedBuildingCount: 1,
      completionRevealActive: false,
      smokeSpriteCount: 0
    });
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);
    expect(layer.scene.getObjectByName('inner-keep-city-core-road-network'))
      .toMatchObject({ visible: true });
    expect(layer.scene.getObjectByName('inner-keep-weathered-town-atmosphere'))
      .toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-weathered-masonry-skirt'))
      .toBeDefined();
    layer.dispose();
  });

  it('retries one degraded same-key bundle, then stays on procedural fallback', async () => {
    const failure = Object.freeze({
      kind: 'static' as const,
      id: 'breached-keep-wall',
      reason: 'transient fixture failure'
    });
    const first = fakeRuntimeBundle(false, Object.freeze([failure]));
    const second = fakeRuntimeBundle(false, Object.freeze([failure]));
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    await Promise.resolve();
    expect(runtimeAssetLoader).toHaveBeenCalledTimes(2);
    expect(layer.getTelemetry()).toMatchObject({
      authoredAssetCount: 0,
      authoredPlacementCount: 0,
      runtimeAssetFailureCount: 1
    });
    expect(layer.scene.userData.innerKeepAssetLoadAttemptCount).toBe(2);
    expect(layer.scene.getObjectByName('inner-keep-authored-static-root')?.children)
      .toHaveLength(0);
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(true);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    layer.dispose();
  });

  it('keeps a settled atomic static scene visible during its bounded retry', async () => {
    const first = fakeRuntimeBundle(true, Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'basilica-warden',
      reason: 'transient fixture failure'
    })]));
    let settleRetry: ((bundle: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
        settleRetry = resolve;
      }));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'loading',
      authoredAssetCount: 38,
      authoredPlacementCount: 101
    });
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);

    const retiredInstances: THREE.InstancedMesh[] = [];
    layer.scene.getObjectByName('inner-keep-authored-static-presentation')
      ?.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) retiredInstances.push(object);
      });
    const retiredInstanceDisposals = retiredInstances.map((instance) => (
      vi.spyOn(instance, 'dispose')
    ));
    expect(retiredInstances.length).toBeGreaterThan(0);

    settleRetry!(fakeRuntimeBundle(true));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('ready'));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    retiredInstanceDisposals.forEach((dispose) => (
      expect(dispose).toHaveBeenCalledTimes(1)
    ));
    layer.dispose();
  });

  it('disposes a worse retry without replacing stronger settled coverage', async () => {
    const first = fakeRuntimeBundle(true, Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'basilica-warden',
      reason: 'transient fixture failure'
    })]));
    const second = fakeRuntimeBundle(false);
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(layer.getTelemetry()).toMatchObject({
      authoredAssetCount: 38,
      authoredPlacementCount: 101,
      runtimeAssetFailureCount: 1
    });
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains equal-cardinality coverage when a retry swaps an exact static ID', async () => {
    const failure = Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'transient-actor',
      reason: 'transient fixture failure'
    })]);
    const first = fakeRuntimeBundleWithIds(
      ['city-mill', 'shared-static'],
      ['shared-population'],
      failure
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-goldworks', 'shared-static'],
      ['shared-population'],
      failure
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(second.dispose).toHaveBeenCalledTimes(1));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'degraded',
      runtimeAssetFailureCount: 1
    });
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains settled coverage when a larger retry loses a population ID', async () => {
    const first = fakeRuntimeBundleWithIds(
      ['city-mill'],
      ['basilica-warden'],
      Object.freeze([Object.freeze({
        kind: 'population' as const,
        id: 'transient-actor',
        reason: 'transient fixture failure'
      })])
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-mill', 'city-goldworks'],
      ['astral-lancer', 'dusk-outrider']
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(second.dispose).toHaveBeenCalledTimes(1));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'degraded',
      runtimeAssetFailureCount: 1
    });
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('replaces settled coverage when both prefab ID sets are supersets', async () => {
    const first = fakeRuntimeBundleWithIds(
      ['city-mill'],
      ['basilica-warden'],
      Object.freeze([Object.freeze({
        kind: 'population' as const,
        id: 'transient-actor',
        reason: 'transient fixture failure'
      })])
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-mill', 'city-goldworks'],
      ['basilica-warden', 'astral-lancer']
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('ready'));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    layer.dispose();
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses an available exact completed prefab after terminal decorative degradation', async () => {
    const failure = Object.freeze({
      kind: 'static' as const,
      id: 'breached-keep-wall',
      reason: 'terminal fixture failure'
    });
    const first = fakeRuntimeBundle(false, Object.freeze([failure]));
    const second = fakeRuntimeBundle(false, Object.freeze([failure]));
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      true,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      })]
    }), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed?.userData.innerKeepAuthoredAsset).toBe(true);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      completedBuildingCount: 1,
      constructionSiteCount: 0
    });
    layer.dispose();
  });

  it('uses a bounded procedural completed fallback after terminal model degradation', async () => {
    const missingBuildingBundle = () => {
      const bundle = fakeRuntimeBundle(false, Object.freeze([Object.freeze({
        kind: 'static' as const,
        id: 'city-mill',
        reason: 'terminal fixture failure'
      })]));
      return Object.freeze({
        ...bundle,
        staticPrefabs: new Map([...bundle.staticPrefabs].filter(([id]) => id !== 'city-mill'))
      }) satisfies InnerKeepRuntimeAssetBundle;
    };
    const first = missingBuildingBundle();
    const second = missingBuildingBundle();
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      true,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation({
      buildings: [createInnerKeepTestBuilding({
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      })]
    }), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed).toBeDefined();
    expect(completed?.userData.innerKeepAuthoredAsset).not.toBe(true);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      completedBuildingCount: 1,
      constructionSiteCount: 0
    });
    layer.dispose();
  });

  it('caps rejected full-bundle attempts across later same-key reconciles', async () => {
    const runtimeAssetLoader = vi.fn().mockRejectedValue(new Error('fixture loader outage'));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    const presentation = createInnerKeepPresentation();
    layer.reconcile(presentation, { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    layer.reconcile(presentation, { owningTerrainKind: 'meadow' });
    await Promise.resolve();
    expect(runtimeAssetLoader).toHaveBeenCalledTimes(2);
    expect(layer.scene.userData.innerKeepAssetLoadAttemptCount).toBe(2);
    layer.dispose();
  });

  it('derives stable visible variation from castle, terrain, and layout version', () => {
    const first = createLayer();
    first.layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });
    const firstSeed = first.layer.scene.userData.innerKeepVisualSeed;
    first.layer.dispose();
    first.canvas.remove();

    const second = createLayer();
    second.layer.reconcile({
      ...createInnerKeepPresentation(),
      castleId: 8n
    }, { owningTerrainKind: 'ridge' });
    expect(second.layer.scene.userData.innerKeepVisualSeed).not.toBe(firstSeed);
    second.layer.dispose();
  });
});
