import { describe, expect, it } from 'vitest';

import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_EPOCH,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_WATER_SUN_DIRECTION_MICRO
} from '../spacetimedb/src/waterWorld';
import { resolveCanonicalWaterProjection } from '../src/components/realm/realmWaterProjection';

function environmentRow() {
  return {
    realmId: GENESIS_WATER_LAYOUT_V1.realmId,
    environmentEpoch: GENESIS_WATER_ENVIRONMENT_EPOCH,
    waterLayoutVersion: GENESIS_WATER_LAYOUT_V1.layoutVersion,
    seaLevelMilli: GENESIS_WATER_LAYOUT_V1.seaLevelMilli,
    sunDirectionXMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.x,
    sunDirectionYMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.y,
    sunDirectionZMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.z
  };
}

describe('canonical water projection boundary', () => {
  it('accepts only the activated layout with the shared environment row', () => {
    expect(resolveCanonicalWaterProjection(
      { ...GENESIS_WATER_LAYOUT_V1, activated: true },
      GENESIS_WATER_BODIES_V1,
      GENESIS_WATER_CELLS_V1,
      environmentRow()
    )).toBe(GENESIS_WATER_CELLS_V1);
  });

  it('fails closed when environment or topology rows drift', () => {
    expect(resolveCanonicalWaterProjection(
      { ...GENESIS_WATER_LAYOUT_V1, activated: true },
      GENESIS_WATER_BODIES_V1,
      GENESIS_WATER_CELLS_V1,
      { ...environmentRow(), environmentEpoch: 2n }
    )).toBeUndefined();

    const duplicate = [GENESIS_WATER_CELLS_V1[0], ...GENESIS_WATER_CELLS_V1.slice(0, -1)];
    expect(resolveCanonicalWaterProjection(
      { ...GENESIS_WATER_LAYOUT_V1, activated: true },
      GENESIS_WATER_BODIES_V1,
      duplicate,
      environmentRow()
    )).toBeUndefined();

    const driftedBodies = [
      {
        ...GENESIS_WATER_BODIES_V1[0]!,
        flowDirectionXQ15: GENESIS_WATER_BODIES_V1[0]!.flowDirectionXQ15 + 1
      },
      ...GENESIS_WATER_BODIES_V1.slice(1)
    ];
    expect(resolveCanonicalWaterProjection(
      { ...GENESIS_WATER_LAYOUT_V1, activated: true },
      driftedBodies,
      GENESIS_WATER_CELLS_V1,
      environmentRow()
    )).toBeUndefined();
  });
});
