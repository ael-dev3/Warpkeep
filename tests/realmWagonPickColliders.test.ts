import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const assetLoadControl = vi.hoisted(() => ({
  mode: 'resolved' as 'resolved' | 'pending' | 'rejected',
  pending: [] as Array<Readonly<{
    resolve: () => void;
    reject: () => void;
  }>>
}));

vi.mock('../src/components/realm/loadHegemonyExpeditionAssets', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/loadHegemonyExpeditionAssets')
  >();
  return {
    ...actual,
    acquireHegemonyExpeditionPrefab: vi.fn((
      options: Parameters<typeof actual.acquireHegemonyExpeditionPrefab>[0]
    ) => {
      const result = () => ({
        model: Object.freeze({
        root: new THREE.Group(),
        clips: Object.freeze([]),
        footprintDiameter: options.targetFootprintDiameter,
        visualHeight: 1,
        assetUrl: options.asset.path
        }),
        release: vi.fn()
      });
      if (assetLoadControl.mode === 'rejected') {
        return Promise.reject(new Error('TEST_ASSET_REJECTED'));
      }
      if (assetLoadControl.mode === 'pending') {
        return new Promise<ReturnType<typeof result>>((resolve, reject) => {
          assetLoadControl.pending.push(Object.freeze({
            resolve: () => resolve(result()),
            reject: () => reject(new Error('TEST_ASSET_REJECTED'))
          }));
        });
      }
      return Promise.resolve(result());
    })
  };
});

import { createRealmFoodNodeLayer } from '../src/components/realm/realmFoodNodeLayer';
import { createRealmGoldNodeLayer } from '../src/components/realm/realmGoldNodeLayer';
import { createRealmStoneNodeLayer } from '../src/components/realm/realmStoneNodeLayer';
import { createRealmWoodNodeLayer } from '../src/components/realm/realmWoodNodeLayer';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';

afterEach(() => {
  assetLoadControl.pending.splice(0).forEach((load) => load.reject());
  assetLoadControl.mode = 'resolved';
  vi.clearAllMocks();
});

const RESOURCES = ['gold', 'food', 'wood', 'stone'] as const;

function movingNode(siteId: string) {
  return Object.freeze({
    siteId,
    coord: Object.freeze({ q: 1, r: 0 }),
    tier: 1,
    availability: 'outbound' as const,
    occupation: Object.freeze({
      siteId,
      originCastleId: 1,
      phase: 'outbound' as const,
      startedAtMicros: 0n,
      arrivesAtMicros: 60_000_000n,
      gatheringEndsAtMicros: 120_000_000n,
      returnsAtMicros: 180_000_000n
    }),
    originCastle: Object.freeze({
      castleId: 1,
      name: 'Origin Keep',
      q: 0,
      r: 0
    }),
    occupiedByViewer: true
  });
}

function createLayer(
  resource: typeof RESOURCES[number],
  onModelReady: () => void,
  maximumRenderedWagons = 1
) {
  const node = movingNode(`test-${resource}-site`);
  const options = {
    sites: [node],
    surface: createRealmTerrainSurface(`wagon-pick-${resource}`, 1, 1),
    terrainPlacements: [],
    quality: REALM_QUALITY_SPECS.balanced,
    baseUrl: '/',
    maxAnisotropy: 1,
    reducedMotion: true,
    presentationBudget: {
      maximumRenderedNodes: 1,
      maximumRenderedWagons,
      wagonAnimationBudget: { highOrBalanced: 0, total: 0 }
    },
    onModelReady
  } as const;
  if (resource === 'gold') return createRealmGoldNodeLayer(options);
  if (resource === 'food') return createRealmFoodNodeLayer(options);
  if (resource === 'wood') return createRealmWoodNodeLayer(options);
  return createRealmStoneNodeLayer(options);
}

function movingWagonWorld() {
  const origin = axialToWorld({ q: 0, r: 0 }, 1);
  const site = axialToWorld({ q: 1, r: 0 }, 1);
  return Object.freeze({
    x: THREE.MathUtils.lerp(origin.x, site.x, 0.5),
    z: THREE.MathUtils.lerp(origin.z, site.z, 0.5)
  });
}

function wagonFallbackMarkers(
  layer: ReturnType<typeof createLayer>,
  resource: typeof RESOURCES[number]
) {
  const markers = layer.group.getObjectByName(
    `realm-${resource}-wagon-fallback-markers`
  );
  expect(markers).toBeInstanceOf(THREE.InstancedMesh);
  return markers as THREE.InstancedMesh;
}

function wagonPickVolumes(
  layer: ReturnType<typeof createLayer>,
  resource: typeof RESOURCES[number]
) {
  const volumes = layer.group.getObjectByName(`realm-${resource}-wagon-pick-volumes`);
  expect(volumes).toBeInstanceOf(THREE.InstancedMesh);
  return volumes as THREE.InstancedMesh;
}

function downwardRay(x: number, z: number) {
  return new THREE.Raycaster(
    new THREE.Vector3(x, 10, z),
    new THREE.Vector3(0, -1, 0)
  );
}

describe('moving resource wagon pick colliders', () => {
  it.each(RESOURCES)(
    'selects the moving %s wagon independently from its linked static site',
    async (resource) => {
      const onModelReady = vi.fn();
      const layer = createLayer(resource, onModelReady);
      await vi.waitFor(() => expect(onModelReady).toHaveBeenCalledTimes(4));

      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 8, 5);
      layer.update(camera, 30_000_000n, 0);
      layer.group.updateMatrixWorld(true);

      const site = axialToWorld({ q: 1, r: 0 }, 1);
      const wagon = movingWagonWorld();
      expect(wagonFallbackMarkers(layer, resource).count).toBe(0);
      expect(wagonPickVolumes(layer, resource).count).toBe(1);
      const wagonHit = layer.raycast(downwardRay(
        wagon.x,
        wagon.z
      ));
      expect(wagonHit).toMatchObject({
        siteId: `test-${resource}-site`,
        coord: { q: 1, r: 0 },
        source: 'wagon'
      });
      expect(wagonHit?.distance).toBeGreaterThan(0);

      expect(layer.raycast(downwardRay(site.x, site.z))).toMatchObject({
        siteId: `test-${resource}-site`,
        source: 'site'
      });

      const overlappingRay = {
        intersectObject: vi.fn()
          // Static site is geometrically nearer, but must remain below wagon.
          .mockReturnValueOnce([{ instanceId: 0, distance: 1 }])
          .mockReturnValueOnce([{ instanceId: 0, distance: 9 }])
      } as unknown as THREE.Raycaster;
      expect(layer.raycast(overlappingRay)).toMatchObject({
        siteId: `test-${resource}-site`,
        source: 'wagon',
        distance: 9
      });
      layer.dispose();
    }
  );

  it.each(RESOURCES)(
    'keeps a visible, selectable %s wagon fallback while models are pending',
    (resource) => {
      assetLoadControl.mode = 'pending';
      const layer = createLayer(resource, vi.fn());
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 8, 5);
      layer.update(camera, 30_000_000n, 0);
      layer.group.updateMatrixWorld(true);

      const fallback = wagonFallbackMarkers(layer, resource);
      const wagon = movingWagonWorld();
      const fallbackMatrix = new THREE.Matrix4();
      const fallbackPosition = new THREE.Vector3();
      fallback.getMatrixAt(0, fallbackMatrix);
      fallbackPosition.setFromMatrixPosition(fallbackMatrix);
      expect(fallback.count).toBe(1);
      expect(wagonPickVolumes(layer, resource).count).toBe(1);
      expect(fallbackPosition.x).toBeCloseTo(wagon.x, 6);
      expect(fallbackPosition.z).toBeCloseTo(wagon.z, 6);
      expect(layer.raycast(downwardRay(wagon.x, wagon.z))).toMatchObject({
        siteId: `test-${resource}-site`,
        source: 'wagon'
      });
      layer.dispose();
    }
  );

  it.each(RESOURCES)(
    'retains the visible, selectable %s wagon fallback after model rejection',
    async (resource) => {
      assetLoadControl.mode = 'rejected';
      const layer = createLayer(resource, vi.fn());
      await Promise.resolve();
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 8, 5);
      layer.update(camera, 30_000_000n, 0);
      layer.group.updateMatrixWorld(true);

      const wagon = movingWagonWorld();
      expect(wagonFallbackMarkers(layer, resource).count).toBe(1);
      expect(wagonPickVolumes(layer, resource).count).toBe(1);
      expect(layer.raycast(downwardRay(wagon.x, wagon.z))).toMatchObject({
        siteId: `test-${resource}-site`,
        source: 'wagon'
      });
      layer.dispose();
    }
  );

  it.each(RESOURCES)(
    'allocates no invisible %s wagon target when the presentation budget is zero',
    (resource) => {
      assetLoadControl.mode = 'pending';
      const layer = createLayer(resource, vi.fn(), 0);
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 8, 5);
      layer.update(camera, 30_000_000n, 0);

      expect(wagonFallbackMarkers(layer, resource).count).toBe(0);
      expect(wagonPickVolumes(layer, resource).count).toBe(0);
      layer.dispose();
    }
  );
});
