import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  createInnerKeepSceneLayer,
  type CreateInnerKeepSceneLayerOptions
} from '../src/components/inner-keep/createInnerKeepSceneLayer';
import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
  INNER_KEEP_PRESENTATION_SLOTS,
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_WATER_CENTERLINE,
  INNER_KEEP_WATER_POND
} from '../src/components/inner-keep/createInnerKeepEcology';
import { allInnerKeepStaticRuntimeAssetIds } from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import { createInnerKeepOuterWorldRenderedTerrainSampler } from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
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
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

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
      ...(runtimeAssetLoader ? { runtimeAssetLoader } : {})
    }),
    requestRender
  };
}

function fakeRuntimePrefab(id: string): InnerKeepRuntimePrefab {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  ));
  return Object.freeze({
    id,
    root,
    clips: Object.freeze([]),
    boundsMeters: Object.freeze([1, 1, 1] as const),
    triangles: 12,
    drawCalls: 1,
    animated: false,
    mounted: false,
    clone: () => root.clone(true)
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

  it('pins all twelve pads to the canonical v15 layout without another canvas or RAF', () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });

    const pads: THREE.Object3D[] = [];
    layer.scene.traverse((object) => {
      if (object.name.startsWith('inner-keep-slot-pad:')) pads.push(object);
    });
    const first = pads.find((pad) => (
      pad.name === 'inner-keep-slot-pad:inner-keep-slot-m01'
    ));
    const firstReserved = pads.find((pad) => (
      pad.name === 'inner-keep-slot-pad:inner-keep-slot-l01'
    ));
    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      slotCount: 12,
      exteriorTreeCount: 44,
      scenicResourceNodeCount: 6,
      wildlifeCount: 7,
      proceduralWildlifeCount: 7,
      exactWildlifeCount: 0,
      tradeWagonCount: 1
    });
    expect(pads).toHaveLength(12);
    expect(first?.position.x).toBe(-9);
    expect(first?.position.z).toBe(-3.4);
    expect(first).toBeInstanceOf(THREE.Mesh);
    expect((first as THREE.Mesh).geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect((first as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters).toMatchObject({
      width: 3.35,
      height: 0.1,
      depth: 2.55,
    });
    expect(first?.userData.innerKeepSlotVisualRole).toBe('active-work-yard');
    expect(firstReserved?.userData.innerKeepSlotVisualRole)
      .toBe('reserved-grass-yard');
    expect(pads.every((pad) => (
      (pad as THREE.Mesh).geometry instanceof THREE.BoxGeometry
    ))).toBe(true);
    const activeColors = new Set<number>();
    const reservedColors = new Set<number>();
    for (const slot of INNER_KEEP_PRESENTATION_SLOTS) {
      const pad = pads.find(({ name }) => (
        name === `inner-keep-slot-pad:${slot.slotId}`
      )) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      expect(pad.position.x, slot.slotId).toBe(slot.positionMeters[0]);
      expect(pad.position.z, slot.slotId).toBe(slot.positionMeters[2]);
      expect(pad.rotation.y, slot.slotId).toBeCloseTo(
        slot.rotationYMilliDegrees * Math.PI / 180_000,
        10,
      );
      expect(pad.scale.x, slot.slotId)
        .toBe(slot.footprintClass === 'large' ? 1.14 : 1);
      expect(pad.scale.z, slot.slotId).toBe(pad.scale.x);
      expect(pad.userData.innerKeepSlotVisualRole, slot.slotId).toBe(
        slot.active ? 'active-work-yard' : 'reserved-grass-yard',
      );
      (slot.active ? activeColors : reservedColors).add(pad.material.color.getHex());
    }
    expect(activeColors.size).toBe(1);
    expect(reservedColors.size).toBe(1);
    expect([...activeColors]).not.toEqual([...reservedColors]);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
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
      ['inner-keep-procedural-cathedral-fallback', 'grand-covenant-cathedral-main-building'],
      ['inner-keep-procedural-barracks-fallback', 'shieldcourt-barracks-west-garrison'],
      ['inner-keep-procedural-south-gate-frame', 'south-gate-frame'],
      ['inner-keep-procedural-gate-standard-west', 'gate-standard-west'],
      ['inner-keep-procedural-gate-standard-east', 'gate-standard-east'],
      ['inner-keep-procedural-builder-noticeboard', 'builder-noticeboard'],
      ['inner-keep-procedural-civic-direction-sign', 'civic-direction-sign'],
      ['inner-keep-procedural-south-east-water-trough', 'south-east-water-trough'],
      ['inner-keep-procedural-hedge-west-north', 'hedge-west-north'],
      ['inner-keep-procedural-hedge-east-north', 'hedge-east-north'],
      ['inner-keep-procedural-hedge-west-south', 'hedge-west-south'],
      ['inner-keep-procedural-hedge-east-south', 'hedge-east-south'],
      ['inner-keep-procedural-north-collapsed-arch', 'north-collapsed-arch'],
    ] as const;
    for (const [fallbackName, placementId] of fallbackToAuthored) {
      const fallback = layer.scene.getObjectByName(fallbackName);
      const authored = authoredByPlacementId.get(placementId)!;
      expect(fallback, fallbackName).toBeDefined();
      expect(fallback?.position.x, fallbackName).toBe(authored.positionMeters[0]);
      expect(fallback?.position.z, fallbackName).toBe(authored.positionMeters[2]);
    }
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
      for (const presentationOnly of [estateRoads, apron, streets, coreStreets]) {
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

      const grass = layer.scene.getObjectByName(
        'inner-keep-dense-grass',
      ) as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      for (let index = 0; index < grass.count; index += 1) {
        grass.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.y, `grass:${index}`).toBeCloseTo(
          terrainHeightAt(position.x, position.z) + 0.115,
          5,
        );
      }

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

  it('keeps diagnostic slot projection and exact picking aligned after pan and zoom', () => {
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'meadow'
    });

    const initial = layer.getSlotProjectionFrame();
    const initialWest = initial.slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(initial.slots).toHaveLength(12);
    expect(initialWest).toMatchObject({ visible: true });
    expect(initialWest?.width).toBeGreaterThan(0);
    expect(initialWest?.height).toBeGreaterThan(0);
    expect(layer.pickSlot(initialWest!.x, initialWest!.y)).toBe(
      'inner-keep-slot-m01'
    );

    layer.panByPixels(140, -70);
    const pannedWest = layer.getSlotProjectionFrame().slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(pannedWest?.x).not.toBeCloseTo(initialWest!.x, 3);
    expect(pannedWest?.y).not.toBeCloseTo(initialWest!.y, 3);
    expect(layer.pickSlot(pannedWest!.x, pannedWest!.y)).toBe(
      'inner-keep-slot-m01'
    );

    layer.zoomByWheel(-240, WheelEvent.DOM_DELTA_PIXEL);
    const zoomedWest = layer.getSlotProjectionFrame().slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(zoomedWest?.width).toBeGreaterThan(pannedWest!.width);
    expect(zoomedWest?.height).toBeGreaterThan(pannedWest!.height);
    expect(layer.pickSlot(zoomedWest!.x, zoomedWest!.y)).toBe(
      'inner-keep-slot-m01'
    );
    layer.dispose();
  });

  it('fits every authored footprint in portrait without overwriting later user input', () => {
    const { layer } = createLayer(false, 390, 844);
    layer.setViewport(390, 844);
    const portraitAspect = 390 / 844;
    const portraitZoom = INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum;
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
    expect(layer.camera.position).toMatchObject({ x: 0, y: 31, z: 34 });

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
    layer.setViewport(1280, 720);

    expect(layer.camera.top).toBeGreaterThan(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight
    );
    expect(layer.camera.position.x).toBeCloseTo(manuallyAdjustedPosition.x, 6);
    expect(layer.camera.position.z).toBeCloseTo(manuallyAdjustedPosition.z, 6);
    layer.dispose();
  });

  it('raycasts exact pads through compact AABB overlaps and rejects blank AABB corners', () => {
    const { layer } = createLayer(false, 320, 800);
    layer.setViewport(320, 800);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'meadow'
    });
    const projections = layer.getSlotProjectionFrame().slots;
    const legacyTouchBoxes = projections.map((projection) => ({
      ...projection,
      left: projection.x - Math.max(44, projection.width) * 0.5,
      right: projection.x + Math.max(44, projection.width) * 0.5,
      top: projection.y - Math.max(44, projection.height) * 0.5,
      bottom: projection.y + Math.max(44, projection.height) * 0.5
    }));
    const overlap = legacyTouchBoxes.flatMap((left, leftIndex) => (
      legacyTouchBoxes.slice(leftIndex + 1).flatMap((right) => {
        const overlapLeft = Math.max(left.left, right.left);
        const overlapRight = Math.min(left.right, right.right);
        const overlapTop = Math.max(left.top, right.top);
        const overlapBottom = Math.min(left.bottom, right.bottom);
        return overlapRight > overlapLeft && overlapBottom > overlapTop
          ? [{
              x: (overlapLeft + overlapRight) * 0.5,
              y: (overlapTop + overlapBottom) * 0.5
            }]
          : [];
      })
    ))[0];
    expect(overlap).toBeDefined();
    const overlapCandidates = legacyTouchBoxes.filter((box) => (
      overlap!.x >= box.left
      && overlap!.x <= box.right
      && overlap!.y >= box.top
      && overlap!.y <= box.bottom
    ));
    expect(overlapCandidates.length).toBeGreaterThan(1);
    const exactOverlapHit = layer.pickSlot(overlap!.x, overlap!.y);
    expect(
      exactOverlapHit === null
      || overlapCandidates.some(({ slotId }) => slotId === exactOverlapHit)
    ).toBe(true);

    const blankGap = projections.flatMap((projection) => {
      const inset = 0.5;
      return [
        { x: projection.x - projection.width * 0.5 + inset,
          y: projection.y - projection.height * 0.5 + inset },
        { x: projection.x + projection.width * 0.5 - inset,
          y: projection.y - projection.height * 0.5 + inset },
        { x: projection.x - projection.width * 0.5 + inset,
          y: projection.y + projection.height * 0.5 - inset },
        { x: projection.x + projection.width * 0.5 - inset,
          y: projection.y + projection.height * 0.5 - inset }
      ];
    }).find((point) => layer.pickSlot(point.x, point.y) === null);
    expect(blankGap).toBeDefined();
    expect(layer.pickSlot(blankGap!.x, blankGap!.y)).toBeNull();
    layer.dispose();
  });

  it('shows only worksite geometry while constructing, then performs a bounded reveal', () => {
    const { layer } = createLayer();
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
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
        slotId: constructing.slotId,
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
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
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
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
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
        slotId: constructing.slotId,
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
    const completeBuilding: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
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
      authoredPlacementCount: 76
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
      authoredPlacementCount: 76,
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
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
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
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
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
