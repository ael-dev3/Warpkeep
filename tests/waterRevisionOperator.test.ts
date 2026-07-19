import { describe, expect, it } from 'vitest';

import { CANONICAL_GENESIS_WATER_REVISION_V1 } from '../spacetimedb/src/waterRevision';
import {
  projectWaterRevisionStatus,
  verifyWaterRevisionTransition,
  type WaterRevisionStatus,
} from '../scripts/water-revision-operator';

function status(overrides: Partial<WaterRevisionStatus> = {}) {
  const { realmId: _realmId, ...canonical } = CANONICAL_GENESIS_WATER_REVISION_V1;
  return {
    ...canonical,
    ready: false,
    activated: false,
    revisionRows: 0n,
    ...overrides,
  };
}

describe('Water revision operator boundary', () => {
  it('accepts only the exact aggregate projection', () => {
    expect(projectWaterRevisionStatus(status())).toEqual(status());
    expect(() => projectWaterRevisionStatus({
      ...status(),
      revisionDigest: '0'.repeat(64),
    })).toThrow(/reviewed policy/);
    expect(() => projectWaterRevisionStatus({
      ...status(),
      ready: true,
      revisionRows: 0n,
    })).toThrow(/invalid aggregate/);
  });

  it('proves seed and activation postconditions without exposing topology', () => {
    const before = projectWaterRevisionStatus(status());
    const seeded = projectWaterRevisionStatus(status({ ready: true, revisionRows: 1n }));
    const active = projectWaterRevisionStatus(status({
      ready: true,
      activated: true,
      revisionRows: 1n,
    }));
    expect(verifyWaterRevisionTransition('seed', before, seeded)).toBe(seeded);
    expect(verifyWaterRevisionTransition('activate', seeded, active)).toBe(active);
    expect(() => verifyWaterRevisionTransition('activate', before, active))
      .toThrow(/activation postcondition/);
  });
});
