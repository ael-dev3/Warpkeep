import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createInnerKeepEcology,
  INNER_KEEP_FIXED_ECOLOGY_EXCLUSIONS,
  INNER_KEEP_GRASS_BUDGET,
  INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS,
  INNER_KEEP_WATER_CENTERLINE,
  INNER_KEEP_WATER_POND,
} from '../src/components/inner-keep/createInnerKeepEcology';
import { INNER_KEEP_LAYOUT_V1_SLOTS } from '../src/components/inner-keep/innerKeepLayoutV1';
import { INNER_KEEP_PRESENTATION_CLEARANCES } from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';

function grassPositions(ecology: ReturnType<typeof createInnerKeepEcology>) {
  const grass = ecology.group.getObjectByName('inner-keep-dense-grass') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  return Array.from({ length: grass.count }, (_, index) => {
    grass.getMatrixAt(index, matrix);
    return position.setFromMatrixPosition(matrix).clone();
  });
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

describe('Inner Keep dense grass and flowing water presentation', () => {
  it.each(['high', 'balanced', 'reduced'] as const)(
    'stays within the exact %s grass budget and keeps every gameplay surface clear',
    (quality) => {
      const ecology = createInnerKeepEcology({
        quality,
        reducedMotion: quality === 'reduced',
        visualSeed: 0x1234_5678,
      });
      expect(ecology.grassBladeCount).toBe(INNER_KEEP_GRASS_BUDGET[quality]);
      let firstGrassClearanceFailure = '';
      for (const position of grassPositions(ecology)) {
        if (
          firstGrassClearanceFailure === ''
          && (Math.abs(position.x) < 1.8 || Math.abs(position.z - 0.2) < 1.45)
        ) firstGrassClearanceFailure = `road:${position.x}:${position.z}`;
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
        for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
          const slotX = Number(slot.localXMicrounits) / 1_000_000;
          const slotZ = Number(slot.localZMicrounits) / 1_000_000;
          const overlaps = Math.abs(position.x - slotX) <= 2
            && Math.abs(position.z - slotZ) <= 1.8;
          if (firstGrassClearanceFailure === '' && overlaps) {
            firstGrassClearanceFailure = [
              slot.slotId,
              position.x,
              position.z,
            ].join(':');
          }
        }
      }
      expect(firstGrassClearanceFailure).toBe('');
      expect(ecology.group.getObjectByName('inner-keep-flowing-cistern-rill')).toBeDefined();
      expect(ecology.group.getObjectByName('inner-keep-cistern-settling-pond')).toBeDefined();
      expect(ecology.waterSurfaceCount).toBe(2);
      ecology.dispose();
    },
  );

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

  it('keeps a connected downhill watercourse clear of every canonical slot and wall', () => {
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

    const ground = INNER_KEEP_PRESENTATION_CLEARANCES.ground;
    for (let index = 0; index < INNER_KEEP_WATER_CENTERLINE.length - 1; index += 1) {
      const from = INNER_KEEP_WATER_CENTERLINE[index]!;
      const to = INNER_KEEP_WATER_CENTERLINE[index + 1]!;
      for (let sample = 0; sample <= 40; sample += 1) {
        const progress = sample / 40;
        const x = from.x + (to.x - from.x) * progress;
        const z = from.z + (to.z - from.z) * progress;
        const width = from.width + (to.width - from.width) * progress;
        const clearance = width * 0.5 + INNER_KEEP_WATER_BANK_EXTRA_WIDTH_METERS;
        expect(x - clearance).toBeGreaterThan(
          -ground.halfExtentsMeters[0] + ground.minimumLandmarkEdgeBuffer,
        );
        expect(x + clearance).toBeLessThan(
          ground.halfExtentsMeters[0] - ground.minimumLandmarkEdgeBuffer,
        );
        expect(z - clearance).toBeGreaterThan(
          -ground.halfExtentsMeters[1] + ground.minimumLandmarkEdgeBuffer,
        );
        expect(z + clearance).toBeLessThan(
          ground.halfExtentsMeters[1] - ground.minimumLandmarkEdgeBuffer,
        );
        expect(pointClearsFixedPlacement(x, z, clearance)).toBe(true);
        for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
          expect(pointClearsSlot(x, z, clearance, slot)).toBe(true);
        }
      }
    }

    const pondClearance = Math.max(
      INNER_KEEP_WATER_POND.radii.x,
      INNER_KEEP_WATER_POND.radii.z,
    );
    expect(INNER_KEEP_WATER_POND.center.x + INNER_KEEP_WATER_POND.radii.x)
      .toBeLessThan(ground.halfExtentsMeters[0] - ground.minimumLandmarkEdgeBuffer);
    expect(pointClearsFixedPlacement(
      INNER_KEEP_WATER_POND.center.x,
      INNER_KEEP_WATER_POND.center.z,
      pondClearance,
    )).toBe(true);
    for (const slot of INNER_KEEP_LAYOUT_V1_SLOTS) {
      expect(pointClearsSlot(
        INNER_KEEP_WATER_POND.center.x,
        INNER_KEEP_WATER_POND.center.z,
        pondClearance,
        slot,
      )).toBe(true);
    }
  });

  it('repeats the same accepted placements for the same visual seed', () => {
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
    expect(grassPositions(first).map(({ x, z }) => [x, z])).toEqual(
      grassPositions(second).map(({ x, z }) => [x, z]),
    );
    first.dispose();
    second.dispose();
  });
});
