import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createInnerKeepEcology,
  INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS,
  INNER_KEEP_GRASS_BUDGET,
  INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS,
  INNER_KEEP_WATER_CENTERLINE,
  INNER_KEEP_WATER_POND,
} from '../src/components/inner-keep/createInnerKeepEcology';
import { INNER_KEEP_LAYOUT_V1_SLOTS } from '../src/components/inner-keep/innerKeepLayoutV1';
import {
  INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  innerKeepCityDistrictRoadEdgeDistance,
  innerKeepOuterWorldDistanceToRoad,
  innerKeepOuterWorldDistanceToWater,
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
  innerKeepOuterWorldTerrainSlopeAt,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import { INNER_KEEP_PRESENTATION_CLEARANCES } from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import { INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS } from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';

function grassPositions(ecology: ReturnType<typeof createInnerKeepEcology>) {
  const grass = ecology.group.getObjectByName('inner-keep-dense-grass') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  return Array.from({ length: grass.count }, (_, index) => {
    grass.getMatrixAt(index, matrix);
    return position.setFromMatrixPosition(matrix).clone();
  });
}

function insideCompoundPlateau(x: number, z: number) {
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  return x >= plateau.minimumX
    && x <= plateau.maximumX
    && z >= plateau.minimumZ
    && z <= plateau.maximumZ;
}

function pointClearsSlot(
  x: number,
  z: number,
  clearance: number,
  slot: (typeof INNER_KEEP_LAYOUT_V1_SLOTS)[number],
) {
  const angle = -slot.rotationMilliDegrees * Math.PI / 180_000;
  const deltaX = x - Number(slot.localXMicrounits) / 1_000_000;
  const deltaZ = z - Number(slot.localZMicrounits) / 1_000_000;
  const localX = deltaX * Math.cos(angle) - deltaZ * Math.sin(angle);
  const localZ = deltaX * Math.sin(angle) + deltaZ * Math.cos(angle);
  const halfExtents = slot.footprintClass === 'large'
    ? INNER_KEEP_PRESENTATION_CLEARANCES.slot.largeReservedHalfExtents
    : INNER_KEEP_PRESENTATION_CLEARANCES.slot.mediumHalfExtents;
  return Math.abs(localX) > halfExtents[0] + clearance
    || Math.abs(localZ) > halfExtents[1] + clearance;
}

function pointClearsFixedPlacement(x: number, z: number, clearance: number) {
  return INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS.every((exclusion) => (
    Math.abs(x - exclusion.center.x) > exclusion.halfExtentsMeters[0]
      + exclusion.clearanceMarginMeters + clearance
    || Math.abs(z - exclusion.center.z) > exclusion.halfExtentsMeters[1]
      + exclusion.clearanceMarginMeters + clearance
  ));
}

describe('Inner Keep living estate grass and connected water presentation', () => {
  it.each(['high', 'balanced', 'reduced'] as const)(
    'fills the exact %s grass budget on shared terrain while keeping every surface clear',
    (quality) => {
      const ecology = createInnerKeepEcology({
        quality,
        reducedMotion: quality === 'reduced',
        visualSeed: 0x1234_5678,
      });
      const positions = grassPositions(ecology);
      const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
      expect(ecology.grassBladeCount).toBe(INNER_KEEP_GRASS_BUDGET[quality]);
      expect(positions).toHaveLength(INNER_KEEP_GRASS_BUDGET[quality]);
      let outsideCompoundCount = 0;
      let firstGrassClearanceFailure = '';
      for (const position of positions) {
        if (!insideCompoundPlateau(position.x, position.z)) outsideCompoundCount += 1;
        const expectedGroundY = innerKeepOuterWorldTerrainHeightAt(
          position.x,
          position.z,
        ) + 0.115;
        if (
          firstGrassClearanceFailure === ''
          && Math.abs(position.y - expectedGroundY) > 0.000_01
        ) firstGrassClearanceFailure = `ground:${position.x}:${position.z}`;
        if (
          firstGrassClearanceFailure === ''
          && (Math.abs(position.x) > halfWidth || Math.abs(position.z) > halfDepth)
        ) firstGrassClearanceFailure = `edge:${position.x}:${position.z}`;

        const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
        const road = INNER_KEEP_PRESENTATION_CLEARANCES.road;
        const insideInnerKeepEcologyArea = position.x >= wall.westX
          && position.x <= wall.eastX
          && position.z >= wall.northZ
          && position.z <= wall.southZ;
        if (
          firstGrassClearanceFailure === ''
          && insideInnerKeepEcologyArea
          && (
            Math.abs(position.x - road.northSouthCenterX)
              < road.northSouthHalfWidth + 0.5
            || Math.abs(position.z - road.eastWestCenterZ)
              < road.eastWestHalfWidth + 0.38
          )
        ) firstGrassClearanceFailure = `inner-road:${position.x}:${position.z}`;
        if (
          firstGrassClearanceFailure === ''
          && innerKeepCityDistrictRoadEdgeDistance(position.x, position.z) < 0.34
        ) firstGrassClearanceFailure = `district-road:${position.x}:${position.z}`;

        for (const exclusion of INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS) {
          if (exclusion.isRoadSurface) continue;
          const overlaps = (
            Math.abs(position.x - exclusion.center.x)
              <= exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters
            && Math.abs(position.z - exclusion.center.z)
              <= exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters
          );
          if (firstGrassClearanceFailure === '' && overlaps) {
            firstGrassClearanceFailure = [
              exclusion.placementId,
              position.x,
              position.z,
            ].join(':');
          }
        }
        for (const exclusion of INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS) {
          const overlaps = (
            Math.abs(position.x - exclusion.center.x)
              <= exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters
            && Math.abs(position.z - exclusion.center.z)
              <= exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters
          );
          if (firstGrassClearanceFailure === '' && overlaps) {
            firstGrassClearanceFailure = [
              exclusion.exclusionId,
              position.x,
              position.z,
            ].join(':');
          }
        }
        for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
          if (
            firstGrassClearanceFailure === ''
            && !pointClearsSlot(
              position.x,
              position.z,
              INNER_KEEP_PRESENTATION_CLEARANCES.slot.decorativeBuffer,
              slot,
            )
          ) {
            firstGrassClearanceFailure = [
              slot.slotId,
              position.x,
              position.z,
            ].join(':');
          }
        }
        if (!insideCompoundPlateau(position.x, position.z)) {
          if (
            firstGrassClearanceFailure === ''
            && !innerKeepOuterWorldPointIsClear(position.x, position.z, 0.08)
          ) firstGrassClearanceFailure = `outer-clearance:${position.x}:${position.z}`;
          if (
            firstGrassClearanceFailure === ''
            && innerKeepOuterWorldTerrainSlopeAt(position.x, position.z) > 0.62
          ) firstGrassClearanceFailure = `slope:${position.x}:${position.z}`;
        }
      }
      expect(firstGrassClearanceFailure).toBe('');
      expect(outsideCompoundCount).toBeGreaterThan(positions.length * 0.25);
      expect(ecology.group.getObjectByName('inner-keep-flowing-cistern-rill')).toBeDefined();
      expect(ecology.group.getObjectByName('inner-keep-cistern-settling-pond')).toBeDefined();
      expect(ecology.waterSurfaceCount).toBe(2);
      ecology.dispose();
    },
  );

  it('keeps grass away from every scenic site, water bank, and estate road', () => {
    const ecology = createInnerKeepEcology({
      quality: 'high',
      reducedMotion: false,
      visualSeed: 0x55aa_1122,
    });
    for (const position of grassPositions(ecology)) {
      expect(innerKeepCityDistrictRoadEdgeDistance(position.x, position.z))
        .toBeGreaterThanOrEqual(0.34);
      for (const site of INNER_KEEP_OUTER_WORLD_RESOURCE_SITES) {
        expect(Math.hypot(
          position.x - site.positionMeters[0],
          position.z - site.positionMeters[2],
        )).toBeGreaterThan(site.padRadiusMeters + 0.45);
      }
      if (!insideCompoundPlateau(position.x, position.z)) {
        expect(innerKeepOuterWorldDistanceToWater(position.x, position.z))
          .toBeGreaterThan(0.46);
        expect(innerKeepOuterWorldDistanceToRoad(position.x, position.z))
          .toBeGreaterThan(1.37);
      }
    }
    ecology.dispose();
  }, 10_000);

  it('animates wind and downstream flow only when motion is allowed', () => {
    const moving = createInnerKeepEcology({
      quality: 'balanced',
      reducedMotion: false,
      visualSeed: 7,
    });
    expect(moving.isAnimationActive()).toBe(true);
    expect(moving.update(12.5)).toBe(true);
    moving.dispose();
    expect(moving.isAnimationActive()).toBe(false);

    const still = createInnerKeepEcology({
      quality: 'balanced',
      reducedMotion: true,
      visualSeed: 7,
    });
    expect(still.isAnimationActive()).toBe(false);
    expect(still.update(12.5)).toBe(false);
    still.dispose();
  });

  it('releases instance buffers once during idempotent teardown', () => {
    const ecology = createInnerKeepEcology({
      quality: 'reduced',
      reducedMotion: true,
      visualSeed: 7,
    });
    const instances: THREE.InstancedMesh[] = [];
    ecology.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    const disposals = instances.map((instance) => vi.spyOn(instance, 'dispose'));

    expect(instances.length).toBeGreaterThan(0);
    ecology.dispose();
    ecology.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('keeps one connected downhill watercourse above shared terrain and inside the estate', () => {
    for (let index = 1; index < INNER_KEEP_WATER_CENTERLINE.length; index += 1) {
      expect(INNER_KEEP_WATER_CENTERLINE[index]!.y)
        .toBeLessThan(INNER_KEEP_WATER_CENTERLINE[index - 1]!.y);
    }
    const downstream = INNER_KEEP_WATER_CENTERLINE.at(-1)!;
    expect(downstream.x).toBe(INNER_KEEP_WATER_POND.center.x);
    expect(downstream.z).toBeCloseTo(
      INNER_KEEP_WATER_POND.center.z - INNER_KEEP_WATER_POND.radii.z,
      8,
    );

    const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
    for (let index = 0; index < INNER_KEEP_WATER_CENTERLINE.length - 1; index += 1) {
      const from = INNER_KEEP_WATER_CENTERLINE[index]!;
      const to = INNER_KEEP_WATER_CENTERLINE[index + 1]!;
      for (let sample = 0; sample <= 40; sample += 1) {
        const progress = sample / 40;
        const x = from.x + (to.x - from.x) * progress;
        const z = from.z + (to.z - from.z) * progress;
        const width = from.width + (to.width - from.width) * progress;
        const y = from.y + (to.y - from.y) * progress;
        const clearance = width * 0.5 + INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS;
        expect(Math.abs(x) + clearance).toBeLessThan(halfWidth);
        expect(Math.abs(z) + clearance).toBeLessThan(halfDepth);
        expect(y).toBeGreaterThan(innerKeepOuterWorldTerrainHeightAt(x, z));
        expect(pointClearsFixedPlacement(x, z, clearance)).toBe(true);
        for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
          expect(pointClearsSlot(x, z, clearance, slot)).toBe(true);
        }
      }
    }
  });

  it('repeats the same accepted grounded placements for the same visual seed', () => {
    const first = createInnerKeepEcology({
      quality: 'reduced',
      reducedMotion: true,
      visualSeed: 99,
    });
    const second = createInnerKeepEcology({
      quality: 'reduced',
      reducedMotion: true,
      visualSeed: 99,
    });
    expect(grassPositions(first).map(({ x, y, z }) => [x, y, z])).toEqual(
      grassPositions(second).map(({ x, y, z }) => [x, y, z]),
    );
    first.dispose();
    second.dispose();
  });
});
