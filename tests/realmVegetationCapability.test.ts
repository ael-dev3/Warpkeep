import { describe, expect, it } from 'vitest';

import type { RealmGrassRenderPlan } from '../src/components/realm/realmGrassActiveWindow';
import { REALM_GRASS_RENDER_PLANS, type RealmQuality } from '../src/components/realm/realmQuality';
import {
  REALM_TERRAIN_ONLY_GRASS_PLAN,
  REALM_VEGETATION_COMPILED_ATTRIBUTE_SLOTS,
  REALM_VEGETATION_REPACK_FLOATS_PER_INSTANCE,
  REALM_VEGETATION_REPACK_UPLOAD_CEILINGS,
  REALM_VEGETATION_WILDFLOWER_INSTANCE_BUDGETS,
  resolveRealmVegetationCapability,
  validateRealmVegetationProfile
} from '../src/components/realm/realmVegetationCapability';

function alteredPlan(
  profile: RealmQuality,
  overrides: Partial<RealmGrassRenderPlan>
): RealmGrassRenderPlan {
  return { ...REALM_GRASS_RENDER_PLANS[profile], ...overrides };
}

describe('realm vegetation capability preflight', () => {
  it('counts the exact worst-case compiled attribute locations before lazy colors exist', () => {
    expect(REALM_VEGETATION_COMPILED_ATTRIBUTE_SLOTS).toEqual({
      grass: {
        baseGeometry: 3,
        instanceMatrix: 4,
        instanceColor: 1,
        customInstance: 5,
        total: 13
      },
      wildflower: {
        baseGeometry: 3,
        instanceMatrix: 4,
        instanceColor: 1,
        customInstance: 3,
        total: 11
      }
    });
    expect(REALM_VEGETATION_REPACK_FLOATS_PER_INSTANCE).toEqual({
      grass: 25,
      wildflower: 22
    });
  });

  it.each([
    ['high', 745_056, 1_048_576],
    ['balanced', 422_528, 524_288],
    ['reduced', 120_000, 196_608]
  ] as const)(
    'proves the %s profile aggregate and individual repack buffers before allocation',
    (profile, expectedBytes, expectedCeiling) => {
      const validation = validateRealmVegetationProfile({
        profile,
        maxAttributes: 16,
        plan: REALM_GRASS_RENDER_PLANS[profile]
      });

      expect(validation).toMatchObject({
        compatible: true,
        reason: null,
        requiredAttributeSlots: 13,
        repackUploadBytes: expectedBytes,
        repackUploadCeiling: expectedCeiling
      });
      expect(validation.buffers).toHaveLength(12);
      expect(validation.buffers.every(({ byteLength }) => (
        Number.isSafeInteger(byteLength)
        && byteLength >= 0
        && byteLength <= expectedCeiling
      ))).toBe(true);
      expect(REALM_VEGETATION_REPACK_UPLOAD_CEILINGS[profile])
        .toBe(expectedCeiling);
      expect(validation.repackUploadBytes).toBeLessThanOrEqual(expectedCeiling);
    }
  );

  it('accepts exactly thirteen locations and floors the renderer value', () => {
    expect(resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 13
    })).toMatchObject({
      mode: 'preferred',
      reason: null,
      selectedProfile: 'high',
      maxAttributes: 13
    });
    expect(resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 13.9
    })).toMatchObject({
      mode: 'preferred',
      selectedProfile: 'high',
      maxAttributes: 13
    });
  });

  it('tries only the preferred profile and lower profiles without upshifting', () => {
    const balanced = resolveRealmVegetationCapability({
      preferredProfile: 'balanced',
      maxAttributes: 16
    });
    const reduced = resolveRealmVegetationCapability({
      preferredProfile: 'reduced',
      maxAttributes: 16
    });

    expect(balanced.selectedProfile).toBe('balanced');
    expect(balanced.attempts.map(({ profile }) => profile)).toEqual(['balanced']);
    expect(reduced.selectedProfile).toBe('reduced');
    expect(reduced.attempts.map(({ profile }) => profile)).toEqual(['reduced']);
  });

  it('downshifts the entire vegetation plan after a preferred profile fails', () => {
    const oversizedHigh = alteredPlan('high', {
      maximumNearInstances: 10_500,
      maximumMidInstances: 0,
      maximumActiveInstances: 10_500
    });
    const resolution = resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 16,
      plans: {
        high: oversizedHigh,
        balanced: REALM_GRASS_RENDER_PLANS.balanced
      }
    });

    expect(resolution).toMatchObject({
      mode: 'downshifted',
      reason: 'repack-upload-ceiling-exceeded',
      selectedProfile: 'balanced',
      grassPlan: REALM_GRASS_RENDER_PLANS.balanced
    });
    expect(resolution.attempts.map(({ profile, reason }) => ({ profile, reason })))
      .toEqual([
        { profile: 'high', reason: 'repack-upload-ceiling-exceeded' },
        { profile: 'balanced', reason: null }
      ]);
  });

  it('never invents a fallback plan when the caller supplies one bound plan', () => {
    const resolution = resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 16,
      plans: {
        high: alteredPlan('high', {
          maximumNearInstances: 10_500,
          maximumMidInstances: 0,
          maximumActiveInstances: 10_500
        })
      }
    });

    expect(resolution).toMatchObject({
      mode: 'terrain-only',
      reason: 'repack-upload-ceiling-exceeded',
      selectedProfile: null
    });
    expect(resolution.attempts.map(({ profile, reason }) => ({ profile, reason })))
      .toEqual([
        { profile: 'high', reason: 'repack-upload-ceiling-exceeded' },
        { profile: 'balanced', reason: 'profile-unavailable' },
        { profile: 'reduced', reason: 'profile-unavailable' }
      ]);
  });

  it('uses a frozen zero plan when no grass program can fit', () => {
    const resolution = resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 12
    });

    expect(resolution).toMatchObject({
      mode: 'terrain-only',
      reason: 'insufficient-attribute-slots',
      selectedProfile: null,
      maxAttributes: 12,
      repackUploadBytes: 0,
      repackUploadCeiling: 0,
      grassPlan: REALM_TERRAIN_ONLY_GRASS_PLAN
    });
    expect(resolution.attempts.map(({ profile }) => profile))
      .toEqual(['high', 'balanced', 'reduced']);
    expect(Object.isFrozen(REALM_TERRAIN_ONLY_GRASS_PLAN)).toBe(true);
    expect(REALM_TERRAIN_ONLY_GRASS_PLAN).toMatchObject({
      enabled: false,
      geometryProfile: 'reduced',
      maximumNearInstances: 0,
      maximumMidInstances: 0,
      maximumActiveInstances: 0,
      maximumNearTriangles: 0,
      maximumMidTriangles: 0,
      maximumActiveTriangles: 0,
      maximumNearDrawCalls: 0,
      maximumMidDrawCalls: 0,
      maximumActiveDrawCalls: 0,
      cacheLimit: 0,
      animationFrameCap: 0,
      densityMultiplier: 0,
      windStrengthMultiplier: 0
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'fails closed for an invalid maxAttributes value (%s)',
    (maxAttributes) => {
      expect(resolveRealmVegetationCapability({
        preferredProfile: 'balanced',
        maxAttributes
      })).toMatchObject({
        mode: 'terrain-only',
        reason: 'invalid-max-attributes',
        selectedProfile: null,
        maxAttributes: 0
      });
    }
  );

  it('rejects unsafe count multiplication before creating a typed array', () => {
    const unsafe = alteredPlan('high', {
      maximumNearInstances: Number.MAX_SAFE_INTEGER,
      maximumMidInstances: 0,
      maximumActiveInstances: Number.MAX_SAFE_INTEGER
    });

    expect(validateRealmVegetationProfile({
      profile: 'high',
      maxAttributes: 16,
      plan: unsafe
    })).toMatchObject({
      compatible: false,
      reason: 'unsafe-count-arithmetic'
    });
  });

  it('checks each buffer against the profile ceiling before the aggregate', () => {
    const oversizedMatrix = alteredPlan('high', {
      maximumNearInstances: 20_000,
      maximumMidInstances: 0,
      maximumActiveInstances: 20_000
    });
    const validation = validateRealmVegetationProfile({
      profile: 'high',
      maxAttributes: 16,
      plan: oversizedMatrix
    });

    expect(validation).toMatchObject({
      compatible: false,
      reason: 'per-buffer-upload-ceiling-exceeded'
    });
    expect(validation.buffers.at(-1)).toEqual({
      name: 'grass-instance-matrix',
      byteLength: 1_280_000
    });
  });

  it('rejects mismatched geometry profiles and incoherent count shapes', () => {
    expect(validateRealmVegetationProfile({
      profile: 'high',
      maxAttributes: 16,
      plan: alteredPlan('high', { geometryProfile: 'balanced' })
    }).reason).toBe('profile-shape-invalid');
    expect(validateRealmVegetationProfile({
      profile: 'high',
      maxAttributes: 16,
      plan: alteredPlan('high', { maximumActiveInstances: 6_999 })
    }).reason).toBe('count-shape-invalid');
    expect(validateRealmVegetationProfile({
      profile: 'high',
      maxAttributes: 16,
      plan: alteredPlan('high', { maximumNearInstances: 4_799.5 })
    }).reason).toBe('count-shape-invalid');
  });

  it('keeps production plans and returned validation records immutable', () => {
    const before = { ...REALM_GRASS_RENDER_PLANS.high };
    const resolution = resolveRealmVegetationCapability({
      preferredProfile: 'high',
      maxAttributes: 16
    });

    expect(REALM_GRASS_RENDER_PLANS.high).toEqual(before);
    expect(resolution.grassPlan).toBe(REALM_GRASS_RENDER_PLANS.high);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.attempts)).toBe(true);
    expect(Object.isFrozen(resolution.attempts[0]?.buffers)).toBe(true);
    expect(REALM_VEGETATION_WILDFLOWER_INSTANCE_BUDGETS)
      .toEqual({ high: 512, balanced: 256, reduced: 0 });
  });
});
