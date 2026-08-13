import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_MAX_WINDOW_RADIUS,
  resolveGreaterRealmWorldViewPolicy
} from '../src/components/realm/greaterRealmWorldViewPolicy';

describe('Greater Realm world-view policy', () => {
  it('derives signed atlas bins with mathematical floor division', () => {
    const policy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 29,
      atlasR: -1,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'balanced',
      reducedMotion: false
    });
    expect(policy.centerQ).toBe(1);
    expect(policy.centerR).toBe(-1);

    expect(resolveGreaterRealmWorldViewPolicy({
      atlasQ: -15,
      atlasR: -16,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'cinematic',
      reducedMotion: false
    })).toMatchObject({ centerQ: -1, centerR: -2 });
  });

  it('bounds desktop profile, LOD, radius, and pixel density', () => {
    const policy = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0,
      atlasR: 0,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'cinematic',
      reducedMotion: false
    });
    expect(policy).toMatchObject({
      deviceClass: 'desktop',
      graphicsProfile: 'high',
      lod: 0,
      radius: GREATER_REALM_MAX_WINDOW_RADIUS,
      pixelRatioCap: 1.8
    });
  });

  it('conservatively caps mobile and Farcaster presentation', () => {
    const mobile = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0,
      atlasR: 0,
      viewportWidth: 390,
      coarsePointer: true,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'cinematic',
      reducedMotion: true
    });
    expect(mobile).toMatchObject({
      deviceClass: 'mobile',
      graphicsProfile: 'balanced',
      lod: 1,
      radius: 2,
      reducedMotion: true
    });

    const farcaster = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0,
      atlasR: 0,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: true,
      resolvedGraphicsQuality: 'cinematic',
      reducedMotion: false
    });
    expect(farcaster).toMatchObject({
      deviceClass: 'mobile',
      graphicsProfile: 'balanced',
      lod: 1,
      radius: 2,
      pixelRatioCap: 1.25
    });

    const farcasterPerformance = resolveGreaterRealmWorldViewPolicy({
      atlasQ: 0,
      atlasR: 0,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: true,
      resolvedGraphicsQuality: 'performance',
      reducedMotion: false
    });
    expect(farcasterPerformance).toMatchObject({
      deviceClass: 'mobile',
      graphicsProfile: 'reduced',
      lod: 2,
      radius: 2,
      pixelRatioCap: 1.2
    });
  });

  it('rejects coordinates that cannot be represented safely', () => {
    expect(() => resolveGreaterRealmWorldViewPolicy({
      atlasQ: Number.MAX_SAFE_INTEGER + 1,
      atlasR: 0,
      viewportWidth: 1_440,
      coarsePointer: false,
      farcasterMiniApp: false,
      resolvedGraphicsQuality: 'balanced',
      reducedMotion: false
    })).toThrow('GREATER_REALM_OWN_CASTLE_COORDINATE_INVALID');
  });
});
