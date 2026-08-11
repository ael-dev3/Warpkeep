import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_FREE_PLACEMENT_ENVELOPES,
  INNER_KEEP_FREE_PLACEMENT_POLICY,
  INNER_KEEP_FREE_PLACEMENT_ROTATIONS,
  INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
} from '../src/components/inner-keep/innerKeepFreePlacementPolicy';
import {
  evaluateInnerKeepPlacementDraft,
  initialInnerKeepPlacementDraft,
  nudgeInnerKeepPlacementDraft,
  rotateInnerKeepPlacementDraft
} from '../src/components/inner-keep/innerKeepPlacement';
import {
  createInnerKeepTestBuilding,
  INNER_KEEP_TEST_PLACEMENTS
} from './fixtures/innerKeepPresentation';
import {
  CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS,
  CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS,
  INNER_KEEP_BUILDABLE_SUPPORT,
  INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES
} from '../spacetimedb/src/innerKeepLayoutPolicy';

describe('Inner Keep client placement evaluator', () => {
  it('mirrors the exact server grid, support, envelopes, and permanent exclusions', () => {
    expect(INNER_KEEP_PLACEMENT_SNAP_MICROUNITS).toBe(500_000n);
    expect(INNER_KEEP_FREE_PLACEMENT_ROTATIONS)
      .toEqual(INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES);
    expect(INNER_KEEP_FREE_PLACEMENT_POLICY.supportBoundsMicrounits).toEqual({
      minimumX: INNER_KEEP_BUILDABLE_SUPPORT.minimumXMicrounits,
      maximumX: INNER_KEEP_BUILDABLE_SUPPORT.maximumXMicrounits,
      minimumZ: INNER_KEEP_BUILDABLE_SUPPORT.minimumZMicrounits,
      maximumZ: INNER_KEEP_BUILDABLE_SUPPORT.maximumZMicrounits
    });
    for (const [kind, envelope] of Object.entries(INNER_KEEP_FREE_PLACEMENT_ENVELOPES)) {
      const server = CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS[
        kind as keyof typeof CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS
      ];
      expect(envelope.halfExtentsMicrounits).toEqual([
        server.halfXMicrounits,
        server.halfZMicrounits
      ]);
    }
    expect(INNER_KEEP_FREE_PLACEMENT_POLICY.permanentExclusions.map((exclusion) => ({
      exclusionId: exclusion.exclusionId,
      centerXMicrounits: exclusion.centerMicrounits[0],
      centerZMicrounits: exclusion.centerMicrounits[1],
      halfXMicrounits: exclusion.halfExtentsMicrounits[0],
      halfZMicrounits: exclusion.halfExtentsMicrounits[1]
    }))).toEqual(CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS);
  });

  it('chooses a deterministic valid initial transform on the half-metre grid', () => {
    const draft = initialInnerKeepPlacementDraft('city-mill', []);
    expect(draft).toMatchObject({
      buildingKind: 'city-mill',
      transform: INNER_KEEP_TEST_PLACEMENTS['city-mill'],
      evaluation: { valid: true, reason: null }
    });
  });

  it('nudges exactly 0.5m and rotates through quarter turns', () => {
    const initial = initialInnerKeepPlacementDraft('city-mill', [])!;
    expect(Array.isArray(initial.evaluation.halfExtentsMicrounits)).toBe(false);
    expect(initial.evaluation.halfExtentsMicrounits).toEqual({
      0: 5_650_000n,
      1: 4_750_000n
    });
    const moved = nudgeInnerKeepPlacementDraft(initial, -1, 1, []);
    expect(moved.transform).toEqual({
      localXMicrounits: 13_500_000n,
      localZMicrounits: -9_500_000n,
      rotationMilliDegrees: 0
    });
    expect(rotateInnerKeepPlacementDraft(moved, 1, []).transform.rotationMilliDegrees)
      .toBe(90_000);
    expect(rotateInnerKeepPlacementDraft(initial, -1, []).transform.rotationMilliDegrees)
      .toBe(270_000);
  });

  it('returns stable invalid reason codes for grid, wall, civic, and occupancy failures', () => {
    const occupied = createInnerKeepTestBuilding({ buildingKind: 'city-mill' });
    expect(evaluateInnerKeepPlacementDraft('lumber-camp', {
      localXMicrounits: 1n,
      localZMicrounits: -10_000_000n,
      rotationMilliDegrees: 0
    }, []).evaluation.reason).toBe('off-grid');
    expect(evaluateInnerKeepPlacementDraft('lumber-camp', {
      localXMicrounits: 44_000_000n,
      localZMicrounits: -10_000_000n,
      rotationMilliDegrees: 0
    }, []).evaluation.reason).toBe('outside-buildable-area');
    expect(evaluateInnerKeepPlacementDraft('lumber-camp', {
      localXMicrounits: 0n,
      localZMicrounits: 0n,
      rotationMilliDegrees: 0
    }, []).evaluation.reason).toBe('permanent-exclusion');
    expect(evaluateInnerKeepPlacementDraft(
      'lumber-camp',
      INNER_KEEP_TEST_PLACEMENTS['city-mill'],
      [occupied]
    ).evaluation).toMatchObject({
      valid: false,
      reason: 'building-overlap',
      conflictingId: occupied.buildingKey
    });
  });

  it('fails a browser-authored unsupported rotation without normalizing it', () => {
    expect(evaluateInnerKeepPlacementDraft('city-mill', {
      ...INNER_KEEP_TEST_PLACEMENTS['city-mill'],
      rotationMilliDegrees: 45_000
    }, []).evaluation.reason).toBe('rotation-unsupported');
  });
});
