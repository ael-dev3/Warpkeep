import { describe, expect, it } from 'vitest';

import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
  type AlphaActivationComponent,
} from '../spacetimedb/src/alphaActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';
import {
  AlphaActivationControlError,
  alphaComponentIsReady,
  alphaComponentSeedReceipt,
  parseAlphaActivationComponent,
  projectAlphaStatusV8,
  type AlphaStatusV8,
  verifyAlphaComponentSeedPostcondition,
  verifyAlphaStatusV8,
} from '../scripts/alpha-activation-controls';

function status(overrides: Partial<AlphaStatusV8> = {}): AlphaStatusV8 {
  const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    goldSitePolicyVersion: gold.sitePolicyVersion,
    goldExpeditionPolicyVersion: gold.expeditionPolicyVersion,
    canonicalGoldSiteCatalogDigest: gold.siteCatalogDigest,
    goldSites: 0n,
    canonicalGoldSites: 0n,
    goldOccupations: 0n,
    goldExpeditions: 0n,
    goldIdempotencyReceipts: 0n,
    goldSchedules: 0n,
    forestLayoutVersion: forest.layoutVersion,
    forestPolicyVersion: forest.policyVersion,
    canonicalForestLayoutDigest: forest.layoutDigest,
    canonicalForestAssetCatalogDigest: forest.assetCatalogDigest,
    forestLayouts: 0n,
    canonicalForestLayouts: 0n,
    forestInstances: 0n,
    canonicalForestInstances: 0n,
    foodSitePolicyVersion: food.sitePolicyVersion,
    foodExpeditionPolicyVersion: food.expeditionPolicyVersion,
    canonicalFoodSiteCatalogDigest: food.siteCatalogDigest,
    foodSites: 0n,
    canonicalFoodSites: 0n,
    foodOccupations: 0n,
    foodExpeditions: 0n,
    foodIdempotencyReceipts: 0n,
    foodSchedules: 0n,
    woodSitePolicyVersion: wood.sitePolicyVersion,
    woodExpeditionPolicyVersion: wood.expeditionPolicyVersion,
    canonicalWoodSiteCatalogDigest: wood.siteCatalogDigest,
    woodSites: 0n,
    canonicalWoodSites: 0n,
    woodOccupations: 0n,
    woodExpeditions: 0n,
    woodIdempotencyReceipts: 0n,
    woodSchedules: 0n,
    ...overrides,
  };
}

describe('Alpha component activation controls', () => {
  it('accepts only the four reviewed component names', () => {
    for (const component of ['gold', 'forest', 'food', 'wood'] as const) {
      expect(parseAlphaActivationComponent(component)).toBe(component);
    }
    expect(() => parseAlphaActivationComponent('stone')).toThrow(AlphaActivationControlError);
  });

  it('fails closed on policy drift, partial catalogs, and activity without a catalog', () => {
    expect(() => verifyAlphaStatusV8(status({ schemaProtocolVersion: 7 })))
      .toThrow(/policy identity/i);
    expect(() => verifyAlphaStatusV8(status({ goldSites: 1n })))
      .toThrow(/neither empty nor canonical/i);
    expect(() => verifyAlphaStatusV8(status({ foodExpeditions: 1n })))
      .toThrow(/activity exists without/i);
    expect(() => verifyAlphaStatusV8(status({ goldSites: 24n, canonicalGoldSites: 23n })))
      .toThrow(/noncanonical rows/i);
  });

  it('projects a closed aggregate allowlist before machine output', () => {
    const projected = projectAlphaStatusV8({
      ...status(),
      fid: 424_242_424_242n,
      identity: 'must-not-escape',
      siteId: 'must-not-escape',
      balance: 9_999n,
    } as AlphaStatusV8);
    expect(projected).toEqual(status());
    expect(projected).not.toHaveProperty('fid');
    expect(projected).not.toHaveProperty('identity');
    expect(projected).not.toHaveProperty('siteId');
    expect(projected).not.toHaveProperty('balance');
  });

  it.each([
    ['gold', { goldSites: 24n, canonicalGoldSites: 24n }],
    ['forest', {
      forestLayouts: 1n,
      canonicalForestLayouts: 1n,
      forestInstances: 210n,
      canonicalForestInstances: 210n,
    }],
    ['food', { foodSites: 96n, canonicalFoodSites: 96n }],
    ['wood', { woodSites: 96n, canonicalWoodSites: 96n }],
  ] as const)('verifies an exact %s seed and emits an aggregate-only receipt', (component, change) => {
    const before = status();
    const after = status(change);
    const verified = verifyAlphaComponentSeedPostcondition(after, before, component);
    expect(alphaComponentIsReady(verified, component)).toBe(true);
    const receipt = alphaComponentSeedReceipt(component, before, verified);
    expect(receipt).toMatchObject({
      operation: 'seed-alpha-component',
      component,
      outcome: 'seeded',
      schemaProtocolVersion: 8,
    });
    expect(JSON.stringify(receipt, (_key, value) => (
      typeof value === 'bigint' ? value.toString() : value
    ))).not.toMatch(/fid|castleId|siteId|identity|username|balance/i);
  });

  it('rejects unrelated count changes and treats exact reruns as already ready', () => {
    const before = status({ goldSites: 24n, canonicalGoldSites: 24n });
    expect(alphaComponentSeedReceipt('gold', before, before)).toMatchObject({
      outcome: 'already-ready',
    });
    const after = status({
      goldSites: 24n,
      canonicalGoldSites: 24n,
      foodSites: 96n,
      canonicalFoodSites: 96n,
    });
    expect(() => verifyAlphaComponentSeedPostcondition(after, before, 'gold'))
      .toThrow(/unrelated aggregate/i);
  });

  it('keeps completed or active counts intact when an already seeded catalog is inspected', () => {
    const live = status({
      goldSites: 24n,
      canonicalGoldSites: 24n,
      goldOccupations: 1n,
      goldExpeditions: 1n,
      goldIdempotencyReceipts: 3n,
      goldSchedules: 3n,
    });
    expect(verifyAlphaStatusV8(live)).toEqual(live);
  });
});
