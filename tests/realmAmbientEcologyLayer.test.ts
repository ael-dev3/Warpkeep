import { describe, expect, it } from 'vitest';

import { createRealmAmbientEcologyLayer } from '../src/components/realm/createRealmAmbientEcologyLayer';
import { REALM_LIVING_REALM_BUDGETS } from '../src/components/realm/realmQuality';

describe('Living Realm ambient ecology layer', () => {
  it('uses exactly two non-pickable bounded draws near the camera', () => {
    const layer = createRealmAmbientEcologyLayer({
      budget: REALM_LIVING_REALM_BUDGETS.high
    });
    const centers = new Float32Array([1, 2, 0, 0, 0, 0, 0, 0]);
    const params = new Float32Array([0.8, 0.7, 0.3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(layer.update(1, { x: 3, y: 0.2, z: -2 }, 'approach', {
      count: 1,
      centers,
      params
    })).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      enabled: true,
      animated: true,
      birdCount: 12,
      moteCount: 36,
      transientParticleCount: 12,
      transientParticleCapacity: 96,
      drawCalls: 2,
      triangleCount: 24,
      plannerHz: 10,
      plannerTickCount: 1
    });
    expect(layer.getTelemetry().drawCalls)
      .toBeLessThanOrEqual(REALM_LIVING_REALM_BUDGETS.high.addedDrawCalls);
    expect(layer.getTelemetry().triangleCount)
      .toBeLessThanOrEqual(REALM_LIVING_REALM_BUDGETS.high.addedTriangles);
    expect(layer.group.children.every((child) => child.raycast !== undefined)).toBe(true);
    layer.dispose();
  });

  it('uses a frozen visual clock for deterministic rendered QA', () => {
    const first = createRealmAmbientEcologyLayer({
      budget: REALM_LIVING_REALM_BUDGETS.balanced,
      frozenVisualTimeSeconds: 8.25
    });
    const second = createRealmAmbientEcologyLayer({
      budget: REALM_LIVING_REALM_BUDGETS.balanced,
      frozenVisualTimeSeconds: 8.25
    });
    first.update(1, { x: 0, y: 0, z: 0 }, 'keep');
    second.update(99, { x: 0, y: 0, z: 0 }, 'keep');
    const firstBirds = first.group.getObjectByName('realm-living-birds');
    const secondBirds = second.group.getObjectByName('realm-living-birds');
    expect((firstBirds as unknown as { instanceMatrix: { array: ArrayLike<number> } }).instanceMatrix.array)
      .toEqual((secondBirds as unknown as { instanceMatrix: { array: ArrayLike<number> } }).instanceMatrix.array);
    first.dispose();
    second.dispose();
  });

  it('hides in overview and allocates no draws for Reduced', () => {
    const balanced = createRealmAmbientEcologyLayer({
      budget: REALM_LIVING_REALM_BUDGETS.balanced
    });
    balanced.update(1, { x: 0, z: 0 }, 'realm');
    expect(balanced.group.visible).toBe(false);
    expect(balanced.getTelemetry()).toMatchObject({
      animated: false,
      overviewHidden: true,
      drawCalls: 0
    });
    balanced.dispose();

    const reduced = createRealmAmbientEcologyLayer({
      budget: REALM_LIVING_REALM_BUDGETS.reduced
    });
    expect(reduced.group.children).toHaveLength(0);
    expect(reduced.update(1, { x: 0, z: 0 }, 'approach')).toBe(false);
    expect(reduced.getTelemetry()).toMatchObject({ enabled: false, drawCalls: 0 });
    reduced.dispose();
  });
});
