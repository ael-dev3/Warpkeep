import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  assertInnerKeepInstanceColorContract,
  createInnerKeepTownAtmosphere,
  INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT,
  resolveInnerKeepRowHouseGrounding,
} from '../src/components/inner-keep/createInnerKeepTownAtmosphere';
import {
  createInnerKeepSceneLayer,
  INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS,
} from '../src/components/inner-keep/createInnerKeepSceneLayer';
import {
  INNER_KEEP_CITY_DISTRICT_ROADS,
  INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS,
  INNER_KEEP_CITY_EDGE_APRON_POINTS,
  INNER_KEEP_OUTER_WORLD_AMBIENT_LANES,
  INNER_KEEP_OUTER_WORLD_BOAT_ROUTE,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
  INNER_KEEP_OUTER_WORLD_RESOURCE_PADS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS,
  INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  innerKeepOuterWorldDistanceToResourceSite,
  innerKeepOuterWorldDistanceToRoad,
  innerKeepOuterWorldDistanceToWater,
  innerKeepOuterWorldTerrainHeightAt,
  innerKeepOuterWorldTerrainSlopeAt,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_CANAL_BOAT_BUDGETS,
  INNER_KEEP_CANAL_DOCK_BUDGETS,
  INNER_KEEP_CANAL_DOCK_HALF_EXTENTS_METERS,
  INNER_KEEP_CANAL_DOCK_PLACEMENTS,
  INNER_KEEP_GRAVE_MARKER_BUDGETS,
  INNER_KEEP_GRAVE_MARKER_PLACEMENTS,
  INNER_KEEP_GRAVEYARD_FENCE_BUDGETS,
  INNER_KEEP_GRAVEYARD_FOOTPATH,
  INNER_KEEP_GRAVEYARD_PLOT,
  INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION,
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSES,
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY,
  INNER_KEEP_TOWN_SCENERY_SOLID_EXCLUSIONS,
  INNER_KEEP_TOWN_TONAL_PALETTE,
  INNER_KEEP_VILLAGE_ANIMAL_BUDGETS,
  INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS,
  INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS,
  INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS,
  INNER_KEEP_WET_RUT_BUDGETS,
  INNER_KEEP_WET_RUT_PLACEMENTS,
  sampleInnerKeepVillageAnimalPosition,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';
import { REALM_SUN_DIRECTION } from '../src/components/realm/createRealmEnvironment';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

function instancedMesh(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  expect(object, name).toBeInstanceOf(THREE.InstancedMesh);
  return object as THREE.InstancedMesh;
}

function srgbLuminance(color: THREE.Color) {
  const srgb = color.clone().convertLinearToSRGB();
  return srgb.r * 0.2126 + srgb.g * 0.7152 + srgb.b * 0.0722;
}

function minimumEffectiveInstanceLuminance(mesh: THREE.InstancedMesh) {
  const color = new THREE.Color();
  const material = mesh.material as THREE.MeshStandardMaterial;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getColorAt(index, color);
    minimum = Math.min(
      minimum,
      srgbLuminance(color.clone().multiply(material.color)),
    );
  }
  return minimum;
}

function segmentTouchesExpandedAabb(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  center: Readonly<{ x: number; z: number }>,
  halfExtents: readonly [number, number],
  expansionMeters: number,
) {
  const minimum = [
    center.x - halfExtents[0] - expansionMeters,
    center.z - halfExtents[1] - expansionMeters,
  ] as const;
  const maximum = [
    center.x + halfExtents[0] + expansionMeters,
    center.z + halfExtents[1] + expansionMeters,
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

function pointDistanceToAabb(
  x: number,
  z: number,
  center: Readonly<{ x: number; z: number }>,
  halfExtents: readonly [number, number],
) {
  return Math.hypot(
    Math.max(0, Math.abs(x - center.x) - halfExtents[0]),
    Math.max(0, Math.abs(z - center.z) - halfExtents[1]),
  );
}

function terrainDeltaRange(geometry: THREE.BufferGeometry) {
  const index = geometry.index!;
  const position = geometry.getAttribute('position');
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(triangle));
    const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(triangle + 1));
    const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(triangle + 2));
    for (const [wa, wb, wc] of [
      [1 / 3, 1 / 3, 1 / 3],
      [0.6, 0.2, 0.2],
      [0.2, 0.6, 0.2],
      [0.2, 0.2, 0.6],
    ] as const) {
      const sample = new THREE.Vector3()
        .addScaledVector(a, wa)
        .addScaledVector(b, wb)
        .addScaledVector(c, wc);
      const delta = sample.y - innerKeepOuterWorldTerrainHeightAt(sample.x, sample.z);
      minimum = Math.min(minimum, delta);
      maximum = Math.max(maximum, delta);
    }
  }
  return { minimum, maximum };
}

describe('Inner Keep sunlit living-town atmosphere', () => {
  it('stays presentation-only and outside canonical building authority', () => {
    expect(INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY).toEqual({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      authoritativeBuildingCount: 0,
      authoritativeResourceNodeCount: 0,
      changesCanonicalLayoutDigest: false,
    });
    expect(INNER_KEEP_LOWER_WARD_ROW_HOUSES).toHaveLength(12);
    expect(new Set(INNER_KEEP_LOWER_WARD_ROW_HOUSES.map(({ houseId }) => houseId)).size)
      .toBe(INNER_KEEP_LOWER_WARD_ROW_HOUSES.length);
    expect(INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS).toHaveLength(24);
    expect(INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.filter((placement) => (
      placement.placementId.startsWith('south-')
    )).every((placement) => Math.abs(placement.positionMeters[0]) >= 8)).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_BOAT_ROUTE).toMatchObject({
      closed: false,
      presentationOnly: true,
      authoritativeTraversal: false,
      gameplayAuthority: 'none',
    });
  });

  it('uses a bright daylight palette without losing earthy lowland contrast', () => {
    const sky = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.skyFog);
    const ground = new THREE.Color(INNER_KEEP_TOWN_TONAL_PALETTE.terrain.lowland);
    expect(sky.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.65);
    expect(ground.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.2);
    expect(INNER_KEEP_TOWN_TONAL_PALETTE.fogNearMeters).toBeGreaterThanOrEqual(48);
    expect(INNER_KEEP_TOWN_TONAL_PALETTE.fogFarMeters).toBeGreaterThanOrEqual(100);
    expect(INNER_KEEP_TOWN_TONAL_PALETTE.lighting.sunIntensity).toBeGreaterThan(3);
    const townSun = new THREE.Vector3(
      ...INNER_KEEP_TOWN_TONAL_PALETTE.lighting.sunPositionMeters,
    ).normalize();
    expect(townSun.x).toBeCloseTo(REALM_SUN_DIRECTION.x, 12);
    expect(townSun.y).toBeCloseTo(REALM_SUN_DIRECTION.y, 12);
    expect(townSun.z).toBeCloseTo(REALM_SUN_DIRECTION.z, 12);
  });

  it('renders bright painted cottages without multiplying missing vertex colors', () => {
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    const bodies = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-wattle-bodies',
    );
    const roofs = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-crooked-gables',
    );
    const foundations = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-stone-foundations',
    );
    const timbers = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-painted-timbers',
    );
    const doors = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-cottage-doors',
    );
    const shutters = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-window-shutters',
    );
    const windows = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-warm-windows',
    );

    for (const mesh of [bodies, roofs, foundations, timbers, doors, shutters]) {
      expect(mesh.geometry.getAttribute('color'), mesh.name).toBeUndefined();
      expect((mesh.material as THREE.MeshStandardMaterial).vertexColors, mesh.name)
        .toBe(false);
      expect(mesh.instanceColor, mesh.name).not.toBeNull();
    }
    atmosphere.group.traverse((object) => {
      if (
        !(object instanceof THREE.InstancedMesh)
        || object.instanceColor === null
        || object.geometry.getAttribute('color') !== undefined
      ) return;
      expect((object.material as THREE.Material & { vertexColors?: boolean }).vertexColors,
        object.name).not.toBe(true);
    });
    expect(minimumEffectiveInstanceLuminance(bodies)).toBeGreaterThan(0.68);
    expect(minimumEffectiveInstanceLuminance(roofs)).toBeGreaterThan(0.38);
    expect(minimumEffectiveInstanceLuminance(foundations)).toBeGreaterThan(0.62);
    expect(minimumEffectiveInstanceLuminance(timbers)).toBeGreaterThan(0.32);
    expect(minimumEffectiveInstanceLuminance(doors)).toBeGreaterThan(0.34);
    expect(minimumEffectiveInstanceLuminance(shutters)).toBeGreaterThan(0.36);
    expect((bodies.material as THREE.MeshStandardMaterial).roughness).toBe(0.92);
    expect((roofs.material as THREE.MeshStandardMaterial).roughness).toBe(0.82);
    expect((timbers.material as THREE.MeshStandardMaterial).roughness).toBe(0.86);
    expect((doors.material as THREE.MeshStandardMaterial).roughness).toBe(0.84);
    expect((shutters.material as THREE.MeshStandardMaterial).roughness).toBe(0.82);
    expect(windows.count).toBe(INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS.high * 3);
    const windowMaterial = windows.material as THREE.MeshStandardMaterial;
    expect(windowMaterial.color.getHex(THREE.SRGBColorSpace))
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.window);
    expect(windowMaterial.emissive.getHex(THREE.SRGBColorSpace))
      .toBe(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.window);
    expect(windowMaterial.emissiveIntensity).toBe(0.42);
    expect(new Set(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.plaster)).toHaveLength(4);
    expect(new Set(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.roof)).toHaveLength(4);
    expect(new Set(INNER_KEEP_TOWN_TONAL_PALETTE.rowHouse.shutter)).toHaveLength(4);

    atmosphere.group.updateMatrixWorld(true);
    const instanceMatrix = new THREE.Matrix4();
    const worldToHouse = new THREE.Matrix4();
    const vertex = new THREE.Vector3();
    const maximumX = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.width * 0.5;
    const maximumZ = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5;
    const matrixPrecisionMeters = 0.000_002;
    INNER_KEEP_LOWER_WARD_ROW_HOUSES.forEach((house, houseIndex) => {
      const marker = atmosphere.group.getObjectByName(
        `inner-keep-lower-ward-row-house:${house.houseId}`,
      )!;
      worldToHouse.copy(marker.matrixWorld).invert();
      for (
        let pieceIndex = 0;
        pieceIndex < INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT;
        pieceIndex += 1
      ) {
        timbers.getMatrixAt(
          houseIndex * INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT + pieceIndex,
          instanceMatrix,
        );
        const position = timbers.geometry.getAttribute('position');
        for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
          vertex.fromBufferAttribute(position, vertexIndex)
            .applyMatrix4(instanceMatrix)
            .applyMatrix4(worldToHouse);
          expect(Math.abs(vertex.x)).toBeLessThanOrEqual(
            maximumX + matrixPrecisionMeters,
          );
          expect(Math.abs(vertex.z)).toBeLessThanOrEqual(
            maximumZ + matrixPrecisionMeters,
          );
          expect(vertex.y).toBeGreaterThanOrEqual(-0.000_001);
          expect(vertex.y).toBeLessThanOrEqual(
            INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.maximumHeight
              + 0.000_001,
          );
        }
      }
    });
    atmosphere.dispose();
  });

  it('fails closed if an instance tint would be multiplied by a missing color', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    expect(() => assertInnerKeepInstanceColorContract(mesh))
      .toThrowError('INNER_KEEP_INSTANCE_COLOR_REQUIRES_GEOMETRY_COLOR');
    geometry.dispose();
    material.dispose();
  });

  it('surface-mounts the painted trim along the cottage gables and ridge', () => {
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    const timbers = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-painted-timbers',
    );
    const house = INNER_KEEP_LOWER_WARD_ROW_HOUSES[0]!;
    const grounding = resolveInnerKeepRowHouseGrounding(
      house,
      innerKeepOuterWorldTerrainHeightAt,
    );
    const rotation = house.rotationMilliDegrees * Math.PI / 180_000;
    const houseBase = new THREE.Matrix4().compose(
      new THREE.Vector3(
        house.positionMeters[0],
        grounding.foundationTopMeters,
        house.positionMeters[1],
      ),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(1, house.heightScale, 1),
    );
    const inverseHouseBase = houseBase.clone().invert();
    const instanceMatrix = new THREE.Matrix4();
    const localMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const readPiece = (pieceIndex: number) => {
      timbers.getMatrixAt(pieceIndex, instanceMatrix);
      localMatrix.multiplyMatrices(inverseHouseBase, instanceMatrix)
        .decompose(position, quaternion, scale);
      return Object.freeze({ position: position.clone(), scale: scale.clone() });
    };

    const frontGable = readPiece(7);
    const backGable = readPiece(8);
    const ridge = readPiece(14);
    const expectVectorClose = (
      actual: THREE.Vector3,
      expected: readonly [number, number, number],
    ) => {
      expect(actual.x).toBeCloseTo(expected[0], 5);
      expect(actual.y).toBeCloseTo(expected[1], 5);
      expect(actual.z).toBeCloseTo(expected[2], 5);
    };
    expectVectorClose(frontGable.position, [0, 2.3, 0.93]);
    expectVectorClose(backGable.position, [0, 2.3, -0.93]);
    expectVectorClose(frontGable.scale, [1.9, 0.1, 0.04]);
    expectVectorClose(backGable.scale, [1.9, 0.1, 0.04]);
    expectVectorClose(ridge.position, [0, 2.94, 0]);
    expectVectorClose(ridge.scale, [0.1, 0.08, 1.82]);

    const roofHalfWidthAtGableRailTop = 2.78 * 0.5
      * (1 - ((2.3 + 0.05) - 2.1) / 0.82);
    expect(frontGable.scale.x * 0.5)
      .toBeLessThanOrEqual(roofHalfWidthAtGableRailTop);
    expect(frontGable.position.z - frontGable.scale.z * 0.5).toBeLessThan(0.93);
    expect(frontGable.position.z + frontGable.scale.z * 0.5).toBeGreaterThan(0.93);
    expect(Math.abs(backGable.position.z) - backGable.scale.z * 0.5).toBeLessThan(0.93);
    expect(Math.abs(backGable.position.z) + backGable.scale.z * 0.5).toBeGreaterThan(0.93);
    expect(frontGable.position.z + frontGable.scale.z * 0.5)
      .toBeLessThanOrEqual(
        INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5 + 0.000_001,
      );
    expect(Math.abs(backGable.position.z) + backGable.scale.z * 0.5)
      .toBeLessThanOrEqual(
        INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5 + 0.000_001,
      );
    expect(ridge.scale.z * 0.5).toBeLessThanOrEqual(0.93);
    expect(ridge.position.y - ridge.scale.y * 0.5).toBeLessThan(2.92);
    expect(ridge.position.y + ridge.scale.y * 0.5).toBeGreaterThan(2.92);
    atmosphere.dispose();
  });

  for (const quality of ['high', 'balanced', 'reduced'] as const) {
    it(`builds the exact ${quality} ward and wet-street budgets`, () => {
      const atmosphere = createInnerKeepTownAtmosphere({
        quality,
        reducedMotion: quality === 'reduced',
      });
      const houseBudget = INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS[quality];
      expect(atmosphere.group.userData).toMatchObject(
        INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY,
      );
      expect(atmosphere.rowHouseCount).toBe(houseBudget);
      expect(atmosphere.smokePuffCount).toBe(
        houseBudget * (quality === 'reduced' ? 0 : 2),
      );
      expect(atmosphere.wetRutCount).toBe(INNER_KEEP_WET_RUT_BUDGETS[quality]);
      expect(atmosphere.graveMarkerCount).toBe(INNER_KEEP_GRAVE_MARKER_BUDGETS[quality]);
      expect(atmosphere.graveyardFenceSegmentCount)
        .toBe(INNER_KEEP_GRAVEYARD_FENCE_BUDGETS[quality]);
      expect(atmosphere.canalBoatCount).toBe(INNER_KEEP_CANAL_BOAT_BUDGETS[quality]);
      expect(atmosphere.canalDockCount).toBe(INNER_KEEP_CANAL_DOCK_BUDGETS[quality]);
      expect(atmosphere.villageAnimalCount).toBe(INNER_KEEP_VILLAGE_ANIMAL_BUDGETS[quality]);
      const selectedAnimals = INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS.slice(
        0,
        INNER_KEEP_VILLAGE_ANIMAL_BUDGETS[quality],
      );
      expect(atmosphere.villageBirdCount).toBe(
        selectedAnimals.filter(({ species }) => species !== 'goat').length,
      );
      expect(atmosphere.livestockCount).toBe(
        selectedAnimals.filter(({ species }) => species === 'goat').length,
      );
      expect(atmosphere.villageDetailCount).toBe(quality === 'reduced'
        ? 0
        : houseBudget * 6 + Math.ceil(houseBudget / 2) * 2);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-lower-ward-row-house:')
      ))).toHaveLength(houseBudget);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-wattle-bodies',
      ).count).toBe(houseBudget * 2);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-stone-foundations',
      ).count).toBe(houseBudget);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-crooked-gables',
      ).count).toBe(houseBudget);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-warm-windows',
      ).count).toBe(houseBudget * 3);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-painted-timbers',
      ).count).toBe(houseBudget * INNER_KEEP_ROW_HOUSE_TIMBER_PIECE_COUNT);
      expect(atmosphere.group.getObjectByName(
        'inner-keep-rain-darkened-wheel-ruts',
      )?.userData.innerKeepWetRutCount).toBe(INNER_KEEP_WET_RUT_BUDGETS[quality]);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-old-road-grave:')
      ))).toHaveLength(INNER_KEEP_GRAVE_MARKER_BUDGETS[quality]);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-canal-skiff:')
      ))).toHaveLength(INNER_KEEP_CANAL_BOAT_BUDGETS[quality]);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-canal-dock:')
      ))).toHaveLength(INNER_KEEP_CANAL_DOCK_BUDGETS[quality]);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-village-animal:')
      ))).toHaveLength(INNER_KEEP_VILLAGE_ANIMAL_BUDGETS[quality]);
      atmosphere.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        expect(object.userData).toMatchObject({
          presentationOnly: true,
          gameplayAuthorityClaimed: false,
          authoritativeBuilding: false,
        });
        expect(object.raycast([] as never, [] as never)).toBeUndefined();
      });
      atmosphere.dispose();
    });
  }

  it('faces every roof surface outward and keeps wet ruts above their target surfaces', () => {
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    const roof = instancedMesh(
      atmosphere.group,
      'inner-keep-lower-ward-crooked-gables',
    );
    const positions = roof.geometry.getAttribute('position');
    const indices = roof.geometry.index!;
    const faceNormal = (faceIndex: number) => {
      const first = new THREE.Vector3().fromBufferAttribute(
        positions,
        indices.getX(faceIndex * 3),
      );
      const second = new THREE.Vector3().fromBufferAttribute(
        positions,
        indices.getX(faceIndex * 3 + 1),
      );
      const third = new THREE.Vector3().fromBufferAttribute(
        positions,
        indices.getX(faceIndex * 3 + 2),
      );
      return second.sub(first).cross(third.sub(first)).normalize();
    };
    expect(faceNormal(0).z).toBeLessThan(-0.99);
    expect(faceNormal(1).z).toBeGreaterThan(0.99);
    for (const faceIndex of [2, 3, 4, 5]) {
      expect(faceNormal(faceIndex).y).toBeGreaterThan(0);
    }
    expect(faceNormal(6).y).toBeLessThan(-0.99);
    expect(faceNormal(7).y).toBeLessThan(-0.99);

    const ruts = atmosphere.group.getObjectByName(
      'inner-keep-rain-darkened-wheel-ruts',
    ) as THREE.Mesh;
    const rutTerrainDelta = terrainDeltaRange(ruts.geometry);
    expect(rutTerrainDelta.minimum).toBeGreaterThanOrEqual(0.04);
    expect(rutTerrainDelta.maximum).toBeLessThanOrEqual(0.215);
    expect(INNER_KEEP_WET_RUT_PLACEMENTS[0]!.surfaceLiftMeters).toBeGreaterThan(0.14);
    expect(INNER_KEEP_WET_RUT_PLACEMENTS[1]!.surfaceLiftMeters).toBeGreaterThan(0.14);
    expect(INNER_KEEP_WET_RUT_PLACEMENTS[2]!.surfaceLiftMeters).toBeGreaterThan(0.19);
    expect(INNER_KEEP_WET_RUT_PLACEMENTS[3]!.surfaceLiftMeters).toBeGreaterThan(0.145);
    atmosphere.dispose();
  });

  it('derives conservative rotated exclusions and grounds every row house', () => {
    const halfWidth = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.width * 0.5;
    const halfDepth = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5;
    expect(INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS).toHaveLength(
      INNER_KEEP_LOWER_WARD_ROW_HOUSES.length,
    );
    INNER_KEEP_LOWER_WARD_ROW_HOUSES.forEach((house, index) => {
      const exclusion = INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS[index]!;
      const radians = house.rotationMilliDegrees * Math.PI / 180_000;
      expect(exclusion.center).toEqual({
        x: house.positionMeters[0],
        z: house.positionMeters[1],
      });
      expect(exclusion.halfExtentsMeters[0]).toBeCloseTo(
        Math.abs(Math.cos(radians)) * halfWidth
          + Math.abs(Math.sin(radians)) * halfDepth,
        10,
      );
      expect(exclusion.halfExtentsMeters[1]).toBeCloseTo(
        Math.abs(Math.sin(radians)) * halfWidth
          + Math.abs(Math.cos(radians)) * halfDepth,
        10,
      );
    });
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    for (const house of INNER_KEEP_LOWER_WARD_ROW_HOUSES) {
      const grounding = resolveInnerKeepRowHouseGrounding(house);
      const marker = atmosphere.group.getObjectByName(
        `inner-keep-lower-ward-row-house:${house.houseId}`,
      );
      expect(marker?.position.y).toBeCloseTo(grounding.foundationTopMeters, 10);
      expect(grounding.foundationTopMeters)
        .toBeGreaterThan(grounding.maximumTerrainHeight);
      expect(grounding.foundationBottomMeters)
        .toBeLessThan(grounding.minimumTerrainHeight);
      expect(grounding.foundationHeightMeters).toBeLessThan(0.75);
    }
    atmosphere.dispose();
  });

  it('keeps every lower-ward solid clear of its neighbours and outer-world traffic', () => {
    const footprintRadius = Math.hypot(
      INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.width * 0.5,
      INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5,
    );
    const clearance = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.clearanceMargin;
    const wagonExpansion = INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS * 0.5
      + clearance;
    INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.forEach((exclusion, index) => {
      const { x, z } = exclusion.center;
      expect(Math.abs(x) + footprintRadius + 0.35, exclusion.exclusionId)
        .toBeLessThan(INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS[0]);
      expect(Math.abs(z) + footprintRadius + 0.35, exclusion.exclusionId)
        .toBeLessThan(INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS[1]);
      expect(innerKeepOuterWorldDistanceToWater(x, z), exclusion.exclusionId)
        .toBeGreaterThan(footprintRadius + clearance + 0.38);
      expect(innerKeepOuterWorldDistanceToResourceSite(x, z), exclusion.exclusionId)
        .toBeGreaterThan(footprintRadius + clearance + 0.45);
      expect(innerKeepOuterWorldDistanceToRoad(x, z), exclusion.exclusionId)
        .toBeGreaterThan(
          footprintRadius
          + clearance
          + INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters,
        );
      expect(innerKeepOuterWorldTerrainSlopeAt(x, z), exclusion.exclusionId)
        .toBeLessThanOrEqual(0.62);
      for (
        let routeIndex = 0;
        routeIndex < INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.length - 1;
        routeIndex += 1
      ) {
        expect(segmentTouchesExpandedAabb(
          {
            x: INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[routeIndex]![0],
            z: INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[routeIndex]![2],
          },
          {
            x: INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[routeIndex + 1]![0],
            z: INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[routeIndex + 1]![2],
          },
          exclusion.center,
          exclusion.halfExtentsMeters,
          wagonExpansion,
        ), `${exclusion.exclusionId}:supply-segment-${routeIndex}`).toBe(false);
      }
      for (const road of INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS) {
        for (let segmentIndex = 0; segmentIndex < road.points.length - 1; segmentIndex += 1) {
          expect(segmentTouchesExpandedAabb(
            road.points[segmentIndex]!,
            road.points[segmentIndex + 1]!,
            exclusion.center,
            exclusion.halfExtentsMeters,
            road.halfWidthMeters + clearance,
          ), `${exclusion.exclusionId}:${road.roadId}:${segmentIndex}`).toBe(false);
        }
      }
      for (const lane of INNER_KEEP_OUTER_WORLD_AMBIENT_LANES) {
        if (
          lane.servesHouseId !== undefined
          && exclusion.exclusionId === `lower-ward-row-house:${lane.servesHouseId}`
        ) continue;
        for (let segmentIndex = 0; segmentIndex < lane.points.length - 1; segmentIndex += 1) {
          expect(segmentTouchesExpandedAabb(
            lane.points[segmentIndex]!,
            lane.points[segmentIndex + 1]!,
            exclusion.center,
            exclusion.halfExtentsMeters,
            lane.reservedHalfWidthMeters + clearance,
          ), `${exclusion.exclusionId}:${lane.laneId}:${segmentIndex}`).toBe(false);
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
          exclusion.center,
          exclusion.halfExtentsMeters,
          INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS + clearance,
        ), `${exclusion.exclusionId}:city-apron:${segmentIndex}`).toBe(false);
      }
      for (const road of INNER_KEEP_CITY_DISTRICT_ROADS) {
        const segmentCount = road.closed ? road.points.length : road.points.length - 1;
        for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
          expect(segmentTouchesExpandedAabb(
            road.points[segmentIndex]!,
            road.points[(segmentIndex + 1) % road.points.length]!,
            exclusion.center,
            exclusion.halfExtentsMeters,
            road.halfWidthMeters + clearance,
          ), `${exclusion.exclusionId}:district:${segmentIndex}`).toBe(false);
        }
      }
      for (const neighbour of INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.slice(index + 1)) {
        expect(
          Math.abs(x - neighbour.center.x)
            > exclusion.halfExtentsMeters[0]
              + neighbour.halfExtentsMeters[0]
              + clearance * 2
          || Math.abs(z - neighbour.center.z)
            > exclusion.halfExtentsMeters[1]
              + neighbour.halfExtentsMeters[1]
              + clearance * 2,
          `${exclusion.exclusionId}:${neighbour.exclusionId}`,
        ).toBe(true);
      }
    });
  });

  it('grounds a bounded, visibly fenced graveyard with mixed old markers', () => {
    expect(INNER_KEEP_GRAVE_MARKER_PLACEMENTS).toHaveLength(18);
    expect(new Set(INNER_KEEP_GRAVE_MARKER_PLACEMENTS.map(({ markerId }) => markerId)).size)
      .toBe(INNER_KEEP_GRAVE_MARKER_PLACEMENTS.length);
    expect(INNER_KEEP_GRAVE_MARKER_PLACEMENTS.some(({ kind }) => kind === 'cross')).toBe(true);
    expect(INNER_KEEP_GRAVE_MARKER_PLACEMENTS.some(({ kind }) => kind === 'headstone')).toBe(true);
    expect(INNER_KEEP_TOWN_SCENERY_SOLID_EXCLUSIONS).toEqual([
      INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION,
    ]);
    expect(INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION).toMatchObject({
      center: {
        x: INNER_KEEP_GRAVEYARD_PLOT.centerMeters[0],
        z: INNER_KEEP_GRAVEYARD_PLOT.centerMeters[1],
      },
      halfExtentsMeters: INNER_KEEP_GRAVEYARD_PLOT.halfExtentsMeters,
      clearanceMarginMeters: 0.3,
    });
    for (const marker of INNER_KEEP_GRAVE_MARKER_PLACEMENTS) {
      expect(Math.abs(marker.positionMeters[0] - INNER_KEEP_GRAVEYARD_PLOT.centerMeters[0]))
        .toBeLessThanOrEqual(INNER_KEEP_GRAVEYARD_PLOT.halfExtentsMeters[0]);
      expect(Math.abs(marker.positionMeters[1] - INNER_KEEP_GRAVEYARD_PLOT.centerMeters[1]))
        .toBeLessThanOrEqual(INNER_KEEP_GRAVEYARD_PLOT.halfExtentsMeters[1]);
      expect(Math.abs(
        marker.positionMeters[0] - INNER_KEEP_GRAVEYARD_FOOTPATH.centerMeters[0],
      )).toBeGreaterThan(
        INNER_KEEP_GRAVEYARD_FOOTPATH.radiiMeters[0] + 0.28,
      );
    }
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    for (const marker of INNER_KEEP_GRAVE_MARKER_PLACEMENTS) {
      const object = atmosphere.group.getObjectByName(
        `inner-keep-old-road-grave:${marker.markerId}`,
      );
      expect(object?.position.y).toBeCloseTo(
        innerKeepOuterWorldTerrainHeightAt(...marker.positionMeters),
        10,
      );
    }
    const fenceRails = instancedMesh(
      atmosphere.group,
      'inner-keep-old-road-graveyard-fence-rails',
    );
    expect(fenceRails.userData.innerKeepLogicalFenceSegmentCount)
      .toBe(INNER_KEEP_GRAVEYARD_FENCE_BUDGETS.high);
    expect(fenceRails.count).toBeGreaterThanOrEqual(
      INNER_KEEP_GRAVEYARD_FENCE_BUDGETS.high,
    );
    const fenceMatrix = new THREE.Matrix4();
    const fenceEndpoint = new THREE.Vector3();
    const fenceXAxis = new THREE.Vector3();
    const fenceZAxis = new THREE.Vector3();
    for (let index = 0; index < fenceRails.count; index += 1) {
      fenceRails.getMatrixAt(index, fenceMatrix);
      fenceXAxis.setFromMatrixColumn(fenceMatrix, 0);
      fenceZAxis.setFromMatrixColumn(fenceMatrix, 2);
      const alongX = fenceXAxis.lengthSq() > fenceZAxis.lengthSq();
      for (const side of [-0.5, 0.5]) {
        fenceEndpoint.set(alongX ? side : 0, 0, alongX ? 0 : side)
          .applyMatrix4(fenceMatrix);
        expect(
          fenceEndpoint.y - innerKeepOuterWorldTerrainHeightAt(
            fenceEndpoint.x,
            fenceEndpoint.z,
          ),
          `fence-piece:${index}:${side}`,
        ).toBeCloseTo(0.34, 5);
      }
    }
    const footpath = atmosphere.group.getObjectByName(
      'inner-keep-old-road-graveyard-footpath',
    ) as THREE.Mesh;
    const footpathTerrainDelta = terrainDeltaRange(footpath.geometry);
    expect(footpathTerrainDelta.minimum).toBeGreaterThanOrEqual(-0.01);
    expect(footpathTerrainDelta.maximum).toBeLessThanOrEqual(0.07);
    atmosphere.dispose();
  });

  it('keeps skiffs inside the shared scenic canal and animates boats and animals', () => {
    const route = INNER_KEEP_OUTER_WORLD_BOAT_ROUTE;
    expect(route.points.length).toBeGreaterThanOrEqual(5);
    for (const point of route.points) {
      expect(point.channelWidthMeters).toBeGreaterThanOrEqual(
        route.vesselBeamMeters + route.bankClearanceMeters * 2,
      );
    }
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    const boat = atmosphere.group.getObjectByName('inner-keep-canal-skiff:1')!;
    boat.position.set(0, 0, 0);
    boat.rotation.set(0, 0, 0);
    boat.updateWorldMatrix(true, true);
    const renderedBoatBounds = new THREE.Box3().setFromObject(boat);
    expect(renderedBoatBounds.max.x - renderedBoatBounds.min.x)
      .toBeLessThanOrEqual(route.vesselBeamMeters);
    const animal = instancedMesh(
      atmosphere.group,
      'inner-keep-village-animal-bodies',
    );
    const boatBefore = boat.position.clone();
    const animalsBefore = Array.from(animal.instanceMatrix.array);
    expect(atmosphere.update(18)).toBe(true);
    expect(boat.position.distanceTo(boatBefore)).toBeGreaterThan(0.1);
    expect(Array.from(animal.instanceMatrix.array)).not.toEqual(animalsBefore);
    atmosphere.dispose();
  });

  it('keeps every complete roaming envelope clear of cottages and docks', () => {
    for (const animal of INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS) {
      const footprint = INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS[
        animal.species
      ];
      for (const house of INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS) {
        expect(pointDistanceToAabb(
          animal.anchorMeters[0],
          animal.anchorMeters[1],
          house.center,
          [
            house.halfExtentsMeters[0]
              + house.clearanceMarginMeters
              + animal.roamRadiusMeters,
            house.halfExtentsMeters[1]
              + house.clearanceMarginMeters
              + animal.roamRadiusMeters,
          ],
        ), `${animal.animalId}:${house.exclusionId}`).toBeGreaterThan(footprint);
      }
      for (const dock of INNER_KEEP_CANAL_DOCK_PLACEMENTS) {
        expect(pointDistanceToAabb(
          animal.anchorMeters[0],
          animal.anchorMeters[1],
          { x: dock.positionMeters[0], z: dock.positionMeters[2] },
          [
            INNER_KEEP_CANAL_DOCK_HALF_EXTENTS_METERS[0] + animal.roamRadiusMeters,
            INNER_KEEP_CANAL_DOCK_HALF_EXTENTS_METERS[1] + animal.roamRadiusMeters,
          ],
        ), `${animal.animalId}:${dock.dockId}`).toBeGreaterThan(footprint);
      }
      for (const resource of INNER_KEEP_OUTER_WORLD_RESOURCE_PADS) {
        expect(Math.hypot(
          animal.anchorMeters[0] - resource.positionMeters[0],
          animal.anchorMeters[1] - resource.positionMeters[2],
        ), `${animal.animalId}:${resource.visualSiteKey}:${resource.instanceIndex}`)
          .toBeGreaterThan(
            footprint + Math.SQRT2 * animal.roamRadiusMeters
              + resource.targetFootprintDiameter * 0.5,
          );
      }
      if (animal.species !== 'goose') {
        expect(innerKeepOuterWorldDistanceToWater(...animal.anchorMeters), animal.animalId)
          .toBeGreaterThan(footprint + Math.SQRT2 * animal.roamRadiusMeters);
      }
      for (const elapsedSeconds of [0, 240, 1_047, 2_094]) {
        const pose = sampleInnerKeepVillageAnimalPosition(animal, elapsedSeconds);
        expect(Number.isFinite(pose.x) && Number.isFinite(pose.z)).toBe(true);
      }
    }
    for (
      let leftIndex = 0;
      leftIndex < INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS.length;
      leftIndex += 1
    ) {
      const left = INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS[leftIndex]!;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS.length;
        rightIndex += 1
      ) {
        const right = INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS[rightIndex]!;
        const requiredEnvelopeSeparation =
          INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS[left.species]
          + INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS[right.species]
          + Math.SQRT2 * (left.roamRadiusMeters + right.roamRadiusMeters);
        expect(Math.hypot(
          left.anchorMeters[0] - right.anchorMeters[0],
          left.anchorMeters[1] - right.anchorMeters[1],
        ), `${left.animalId}:${right.animalId}`).toBeGreaterThan(
          requiredEnvelopeSeparation,
        );
      }
    }
  });

  it('keeps reduced animal silhouettes visible from the portrait camera at every heading', () => {
    const atmosphere = createInnerKeepTownAtmosphere({
      quality: 'reduced',
      reducedMotion: true,
    });
    const bodies = instancedMesh(atmosphere.group, 'inner-keep-village-animal-bodies');
    const position = bodies.geometry.getAttribute('position');
    expect(position.count).toBe(8);
    const localVertices = Array.from({ length: position.count }, (_, index) => (
      new THREE.Vector3().fromBufferAttribute(position, index)
    ));
    for (let headingIndex = 0; headingIndex < 360; headingIndex += 1) {
      const yaw = headingIndex * Math.PI / 180;
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw,
      );
      const projectedX = localVertices.map((vertex) => (
        vertex.clone().applyQuaternion(quaternion).x
      ));
      expect(Math.max(...projectedX) - Math.min(...projectedX))
        .toBeGreaterThanOrEqual(Math.SQRT1_2 - 0.000_001);
    }
    atmosphere.dispose();
  });

  it('keeps the complete reduced scene graph below its reviewed hard ceiling', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 960 },
      clientHeight: { configurable: true, value: 540 },
    });
    document.body.append(canvas);
    const layer = createInnerKeepSceneLayer({
      canvas,
      quality: 'reduced',
      reducedMotion: true,
      requestRender: vi.fn(),
      assetLoading: 'disabled',
      outerWorldAssetLoading: 'disabled',
    });
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });
    const telemetry = layer.getTelemetry();
    expect(telemetry.triangleCount)
      .toBeLessThanOrEqual(INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS.reduced.triangles);
    expect(telemetry.drawCalls)
      .toBeLessThanOrEqual(INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS.reduced.drawCalls);
    expect(layer.scene.userData.innerKeepSceneGraphRenderBudgetExceeded).toBe(false);
    layer.dispose();
    canvas.remove();
    context.mockRestore();
  });

  it('animates smoke only when motion is allowed and disposes GPU buffers once', () => {
    const moving = createInnerKeepTownAtmosphere({
      quality: 'high',
      reducedMotion: false,
    });
    const smoke = instancedMesh(
      moving.group,
      'inner-keep-lower-ward-chimney-smoke',
    );
    const before = Array.from(smoke.instanceMatrix.array);
    expect(moving.isAnimationActive()).toBe(true);
    expect(moving.update(9.5)).toBe(true);
    expect(Array.from(smoke.instanceMatrix.array)).not.toEqual(before);
    const disposeSpies: ReturnType<typeof vi.spyOn>[] = [];
    moving.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        disposeSpies.push(vi.spyOn(object, 'dispose'));
      }
    });
    moving.dispose();
    moving.dispose();
    expect(moving.isAnimationActive()).toBe(false);
    expect(moving.update(10)).toBe(false);
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));

    const still = createInnerKeepTownAtmosphere({
      quality: 'balanced',
      reducedMotion: true,
    });
    expect(still.isAnimationActive()).toBe(false);
    expect(still.update(12)).toBe(false);
    still.dispose();
  });
});
