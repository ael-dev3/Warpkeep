import { describe, expect, it } from 'vitest';

import { createRealmSurfaceDisturbanceField } from '../src/components/realm/realmSurfaceDisturbanceField';

describe('Living Realm surface disturbance field', () => {
  it('keeps fixed storage, newest-first slots, decay, and aggregate-only telemetry', () => {
    const field = createRealmSurfaceDisturbanceField(3);
    field.push({ kind: 'grass', x: 1, z: 2, radius: 0.7, strength: 1, createdAtSeconds: 1, lifetimeSeconds: 2 });
    field.push({ kind: 'water', x: 5, z: 6, radius: 1.1, strength: 0.8, createdAtSeconds: 1.2, lifetimeSeconds: 3 });
    field.push({ kind: 'grass', x: 3, z: 4, radius: 0.5, strength: 0.6, createdAtSeconds: 1.4, lifetimeSeconds: 2 });

    const first = field.snapshot('grass', 1.5, 8);
    expect(first.count).toBe(2);
    expect(Array.from(first.centers.slice(0, 4))).toEqual([3, 4, 1, 2]);
    expect(first.params[1]).toBeLessThan(0.6);
    expect(first.params[1]).toBeGreaterThan(0);
    expect(field.snapshot('grass', 1.6, 8).centers).toBe(first.centers);
    expect(field.getTelemetry(1.6)).toEqual({
      capacity: 3,
      activeGrassCount: 2,
      activeWaterCount: 1,
      insertedCount: 3,
      droppedCount: 0
    });
    expect(Object.keys(field.getTelemetry(1.6))).not.toContain('positions');
  });

  it('evicts deterministically and expires without growing the pool', () => {
    const field = createRealmSurfaceDisturbanceField(2);
    for (let index = 0; index < 3; index += 1) {
      field.push({
        kind: 'grass',
        x: index,
        z: 0,
        radius: 1,
        strength: 1,
        createdAtSeconds: index,
        lifetimeSeconds: 4
      });
    }
    expect(field.getTelemetry(2)).toMatchObject({
      capacity: 2,
      activeGrassCount: 2,
      insertedCount: 3,
      droppedCount: 1
    });
    expect(Array.from(field.snapshot('grass', 2, 8).centers.slice(0, 4)))
      .toEqual([2, 0, 1, 0]);
    expect(field.snapshot('grass', 8, 8).count).toBe(0);
  });

  it('allocates no active storage for a zero budget and clears on disposal', () => {
    const field = createRealmSurfaceDisturbanceField(0);
    expect(field.push({ kind: 'water', x: 1, z: 2, radius: 1, strength: 1, createdAtSeconds: 0, lifetimeSeconds: 1 })).toBe(false);
    expect(field.snapshot('water', 0, 4).count).toBe(0);
    field.dispose();
    expect(field.getTelemetry(0).capacity).toBe(0);
  });
});
