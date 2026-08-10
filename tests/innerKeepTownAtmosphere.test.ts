import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createInnerKeepTownAtmosphere } from '../src/components/inner-keep/createInnerKeepTownAtmosphere';
import {
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
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
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS,
  INNER_KEEP_LOWER_WARD_ROW_HOUSES,
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY,
  INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS,
  INNER_KEEP_WET_RUT_BUDGETS,
  INNER_KEEP_WET_RUT_PLACEMENTS,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';

function instancedMesh(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  expect(object, name).toBeInstanceOf(THREE.InstancedMesh);
  return object as THREE.InstancedMesh;
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

describe('Inner Keep weathered town atmosphere', () => {
  it('stays presentation-only and outside canonical building authority', () => {
    expect(INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY).toEqual({
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      authoritativeBuildingCount: 0,
      authoritativeResourceNodeCount: 0,
      changesCanonicalLayoutDigest: false,
    });
    expect(INNER_KEEP_LOWER_WARD_ROW_HOUSES).toHaveLength(8);
    expect(new Set(INNER_KEEP_LOWER_WARD_ROW_HOUSES.map(({ houseId }) => houseId)).size)
      .toBe(INNER_KEEP_LOWER_WARD_ROW_HOUSES.length);
    expect(INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS).toHaveLength(24);
    expect(INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.filter((placement) => (
      placement.placementId.startsWith('south-')
    )).every((placement) => Math.abs(placement.positionMeters[0]) >= 8)).toBe(true);
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
        houseBudget * (quality === 'reduced' ? 1 : 2),
      );
      expect(atmosphere.wetRutCount).toBe(INNER_KEEP_WET_RUT_BUDGETS[quality]);
      expect(atmosphere.group.children.filter(({ name }) => (
        name.startsWith('inner-keep-lower-ward-row-house:')
      ))).toHaveLength(houseBudget);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-wattle-bodies',
      ).count).toBe(houseBudget * 2);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-crooked-gables',
      ).count).toBe(houseBudget);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-lower-ward-dark-timbers',
      ).count).toBe(houseBudget * 7);
      expect(instancedMesh(
        atmosphere.group,
        'inner-keep-rain-darkened-wheel-ruts',
      ).count).toBe(INNER_KEEP_WET_RUT_BUDGETS[quality]);
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

    const ruts = instancedMesh(
      atmosphere.group,
      'inner-keep-rain-darkened-wheel-ruts',
    );
    const matrix = new THREE.Matrix4();
    INNER_KEEP_WET_RUT_PLACEMENTS.forEach((rut, index) => {
      ruts.getMatrixAt(index, matrix);
      expect(matrix.elements[13], rut.rutId).toBeCloseTo(
        innerKeepOuterWorldTerrainHeightAt(...rut.positionMeters)
          + rut.surfaceLiftMeters,
        6,
      );
    });
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
      const marker = atmosphere.group.getObjectByName(
        `inner-keep-lower-ward-row-house:${house.houseId}`,
      );
      expect(marker?.position.y).toBeCloseTo(innerKeepOuterWorldTerrainHeightAt(
        house.positionMeters[0],
        house.positionMeters[1],
      ), 10);
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
