import { describe, expect, it } from 'vitest';

import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../spacetimedb/src/alphaV10ActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';
import {
  AlphaV10ActivationControlError,
  alphaV10ComponentIsReady,
  alphaV10ComponentSeedReceipt,
  parseAlphaV10ActivationComponent,
  projectAlphaStatusV10,
  verifyAlphaStatusV10,
  verifyAlphaV10SeedPostcondition,
  verifyWaterActivationPostcondition,
  waterActivationReceipt,
  type AlphaStatusV10,
} from '../scripts/alpha-v10-activation-controls';

function status(overrides: Partial<AlphaStatusV10> = {}): AlphaStatusV10 {
  const { water, stone } = ALPHA_V10_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    waterPolicyVersion: water.policyVersion,
    waterLayoutVersion: water.layoutVersion,
    canonicalWaterLayoutDigest: water.layoutDigest,
    waterActivated: false,
    waterLayouts: 0n,
    canonicalWaterLayouts: 0n,
    waterBodies: 0n,
    canonicalWaterBodies: 0n,
    waterCells: 0n,
    canonicalWaterCells: 0n,
    realmEnvironments: 0n,
    canonicalRealmEnvironments: 0n,
    stoneSitePolicyVersion: stone.sitePolicyVersion,
    stoneExpeditionPolicyVersion: stone.expeditionPolicyVersion,
    canonicalStoneSiteCatalogDigest: stone.siteCatalogDigest,
    stoneSites: 0n,
    canonicalStoneSites: 0n,
    stoneOccupations: 0n,
    stoneExpeditions: 0n,
    stoneIdempotencyReceipts: 0n,
    stoneSchedules: 0n,
    ...overrides,
  };
}

function waterReady(activated = false): Partial<AlphaStatusV10> {
  const water = ALPHA_V10_ACTIVATION_COMPONENTS.water;
  return {
    waterActivated: activated,
    waterLayouts: BigInt(water.layoutCount),
    canonicalWaterLayouts: BigInt(water.layoutCount),
    waterBodies: BigInt(water.bodyCount),
    canonicalWaterBodies: BigInt(water.bodyCount),
    waterCells: BigInt(water.cellCount),
    canonicalWaterCells: BigInt(water.cellCount),
    realmEnvironments: BigInt(water.environmentCount),
    canonicalRealmEnvironments: BigInt(water.environmentCount),
  };
}

function stoneReady(): Partial<AlphaStatusV10> {
  const count = BigInt(ALPHA_V10_ACTIVATION_COMPONENTS.stone.siteCount);
  return { stoneSites: count, canonicalStoneSites: count };
}

describe('Alpha v10 activation controls', () => {
  it('accepts only the Water and Stone suffix component names', () => {
    expect(parseAlphaV10ActivationComponent('water')).toBe('water');
    expect(parseAlphaV10ActivationComponent('stone')).toBe('stone');
    expect(() => parseAlphaV10ActivationComponent('wood'))
      .toThrow(AlphaV10ActivationControlError);
  });

  it('accepts exact empty or canonical aggregates and rejects partial state', () => {
    expect(verifyAlphaStatusV10(status())).toEqual(status());
    expect(verifyAlphaStatusV10(status({ ...waterReady(), ...stoneReady() })))
      .toEqual(status({ ...waterReady(), ...stoneReady() }));
    expect(() => verifyAlphaStatusV10(status({ waterCells: 1n })))
      .toThrow(/neither empty nor canonical/i);
    expect(() => verifyAlphaStatusV10(status({ stoneExpeditions: 1n })))
      .toThrow(/Stone aggregate|activity exists/i);
    expect(() => verifyAlphaStatusV10(status({ schemaProtocolVersion: 9 })))
      .toThrow(/policy identity/i);
  });

  it('projects only aggregate policy fields and counts', () => {
    const projected = projectAlphaStatusV10({
      ...status(),
      fid: 123n,
      identity: 'must-not-escape',
      siteId: 'must-not-escape',
      balance: 99n,
    } as AlphaStatusV10);
    expect(projected).toEqual(status());
    expect(projected).not.toHaveProperty('fid');
    expect(projected).not.toHaveProperty('identity');
    expect(projected).not.toHaveProperty('siteId');
    expect(projected).not.toHaveProperty('balance');
  });

  it('verifies isolated Water and Stone seed transitions', () => {
    const empty = status();
    const water = status(waterReady());
    const stone = status(stoneReady());
    expect(alphaV10ComponentIsReady(water, 'water')).toBe(true);
    expect(alphaV10ComponentIsReady(stone, 'stone')).toBe(true);
    expect(verifyAlphaV10SeedPostcondition(water, empty, 'water')).toEqual(water);
    expect(verifyAlphaV10SeedPostcondition(stone, empty, 'stone')).toEqual(stone);
    expect(alphaV10ComponentSeedReceipt('stone', empty, stone)).toMatchObject({
      component: 'stone',
      outcome: 'seeded',
      schemaProtocolVersion: 10,
    });
    expect(() => verifyAlphaV10SeedPostcondition(
      status({ ...waterReady(), ...stoneReady() }),
      empty,
      'water',
    )).toThrow(/unrelated aggregate/i);
  });

  it('requires exact seeded Water and preserves every aggregate on activation', () => {
    const before = status({ ...waterReady(), ...stoneReady() });
    const after = status({ ...waterReady(true), ...stoneReady() });
    expect(verifyWaterActivationPostcondition(after, before)).toEqual(after);
    expect(waterActivationReceipt(before, after)).toMatchObject({
      operation: 'activate-alpha-water',
      outcome: 'activated',
      activated: true,
    });
    expect(() => verifyWaterActivationPostcondition(status({ waterActivated: true }), status()))
      .toThrow(/neither empty nor canonical|exact active projection/i);
  });
});
