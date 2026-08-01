import { beforeEach, describe, expect, it } from 'vitest';

import {
  REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY,
  nextLowerRealmRendererQuality,
  readRealmRendererEmergencyQuality,
  resolveRealmRendererEmergencyQuality,
  retainRealmRendererEmergencyQuality
} from '../src/components/realm/realmRendererEmergencyQuality';
import { WARPKEEP_GRAPHICS_PREFERENCE_KEY } from '../src/settings/graphicsPreference';

describe('Realm renderer emergency quality', () => {
  beforeEach(() => {
    window.sessionStorage.removeItem(REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY);
    window.localStorage.removeItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY);
  });

  it('degrades exactly one tier and terminates at the safest tier', () => {
    expect(nextLowerRealmRendererQuality('high')).toBe('balanced');
    expect(nextLowerRealmRendererQuality('balanced')).toBe('reduced');
    expect(nextLowerRealmRendererQuality('reduced')).toBeUndefined();
  });

  it('treats the session value as a ceiling without raising a safer request', () => {
    expect(resolveRealmRendererEmergencyQuality('high', 'balanced')).toBe('balanced');
    expect(resolveRealmRendererEmergencyQuality('balanced', 'reduced')).toBe('reduced');
    expect(resolveRealmRendererEmergencyQuality('reduced', 'balanced')).toBe('reduced');
    expect(resolveRealmRendererEmergencyQuality('high', undefined)).toBe('high');
  });

  it('retains the safest tab-scoped ceiling without changing the saved preference', () => {
    window.localStorage.setItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY, 'cinematic');

    expect(retainRealmRendererEmergencyQuality('balanced')).toBe('balanced');
    expect(retainRealmRendererEmergencyQuality('reduced')).toBe('reduced');
    expect(retainRealmRendererEmergencyQuality('balanced')).toBe('reduced');
    expect(readRealmRendererEmergencyQuality()).toBe('reduced');
    expect(window.localStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBe('cinematic');
  });
});
