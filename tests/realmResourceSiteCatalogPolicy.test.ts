import { describe, expect, it } from 'vitest';

import {
  REALM_FOOD_SITE_CATALOG_DIGEST,
  REALM_FOOD_SITE_COUNT,
  REALM_FOOD_SITE_POLICY_VERSION,
  REALM_GOLD_SITE_CATALOG_DIGEST,
  REALM_GOLD_SITE_COUNT,
  REALM_GOLD_SITE_POLICY_VERSION,
  REALM_STONE_SITE_CATALOG_DIGEST,
  REALM_STONE_SITE_COUNT,
  REALM_STONE_SITE_POLICY_VERSION,
  REALM_WOOD_SITE_CATALOG_DIGEST,
  REALM_WOOD_SITE_COUNT,
  REALM_WOOD_SITE_POLICY_VERSION,
  isCanonicalRealmFoodSiteCatalog,
  isCanonicalRealmGoldSiteCatalog,
  isCanonicalRealmStoneSiteCatalog,
  isCanonicalRealmWoodSiteCatalog
} from '../src/components/realm/realmResourceSiteCatalogPolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_DIGEST
} from '../spacetimedb/src/foodSitePolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  GENESIS_TIER_I_GOLD_SITE_DIGEST,
  GOLD_SITE_POLICY_VERSION
} from '../spacetimedb/src/goldSitePolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
  GENESIS_TIER_I_STONE_SITE_DIGEST,
  STONE_SITE_POLICY_VERSION
} from '../spacetimedb/src/stoneSitePolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
  GENESIS_TIER_I_WOOD_SITE_DIGEST,
  WOOD_SITE_POLICY_VERSION
} from '../spacetimedb/src/woodSitePolicy';

describe('browser resource-site catalog attestation', () => {
  it('matches the exact reviewed backend policies, digests, counts, and rows', () => {
    expect(REALM_GOLD_SITE_POLICY_VERSION).toBe(GOLD_SITE_POLICY_VERSION);
    expect(REALM_GOLD_SITE_CATALOG_DIGEST).toBe(GENESIS_TIER_I_GOLD_SITE_DIGEST);
    expect(REALM_GOLD_SITE_COUNT).toBe(CANONICAL_TIER_I_GOLD_SITES_V1.length);
    expect(isCanonicalRealmGoldSiteCatalog(CANONICAL_TIER_I_GOLD_SITES_V1)).toBe(true);

    expect(REALM_FOOD_SITE_POLICY_VERSION).toBe(FOOD_SITE_POLICY_VERSION);
    expect(REALM_FOOD_SITE_CATALOG_DIGEST).toBe(GENESIS_TIER_I_FOOD_SITE_DIGEST);
    expect(REALM_FOOD_SITE_COUNT).toBe(CANONICAL_TIER_I_FOOD_SITES_V1.length);
    expect(isCanonicalRealmFoodSiteCatalog(CANONICAL_TIER_I_FOOD_SITES_V1)).toBe(true);

    expect(REALM_WOOD_SITE_POLICY_VERSION).toBe(WOOD_SITE_POLICY_VERSION);
    expect(REALM_WOOD_SITE_CATALOG_DIGEST).toBe(GENESIS_TIER_I_WOOD_SITE_DIGEST);
    expect(REALM_WOOD_SITE_COUNT).toBe(CANONICAL_TIER_I_WOOD_SITES_V1.length);
    expect(isCanonicalRealmWoodSiteCatalog(CANONICAL_TIER_I_WOOD_SITES_V1)).toBe(true);

    expect(REALM_STONE_SITE_POLICY_VERSION).toBe(STONE_SITE_POLICY_VERSION);
    expect(REALM_STONE_SITE_CATALOG_DIGEST).toBe(GENESIS_TIER_I_STONE_SITE_DIGEST);
    expect(REALM_STONE_SITE_COUNT).toBe(CANONICAL_TIER_I_STONE_SITES_V1.length);
    expect(isCanonicalRealmStoneSiteCatalog(CANONICAL_TIER_I_STONE_SITES_V1)).toBe(true);
  });

  it('accepts table order changes but rejects missing, duplicate, moved, renamed, inactive, or wrong-tier rows', () => {
    const canonical = CANONICAL_TIER_I_FOOD_SITES_V1;
    expect(isCanonicalRealmFoodSiteCatalog([...canonical].reverse())).toBe(true);
    expect(isCanonicalRealmFoodSiteCatalog(canonical.slice(1))).toBe(false);
    expect(isCanonicalRealmFoodSiteCatalog([...canonical.slice(0, -1), canonical[0]!])).toBe(false);
    for (const change of [
      { q: canonical[0]!.q + 1 },
      { siteId: 'genesis-001-tier1-food-999' },
      { active: false },
      { tier: 2 }
    ]) {
      expect(isCanonicalRealmFoodSiteCatalog([
        { ...canonical[0]!, ...change },
        ...canonical.slice(1)
      ])).toBe(false);
    }
  });

  it('attests Stone rows independent of order and rejects every catalog mutation', () => {
    const canonical = CANONICAL_TIER_I_STONE_SITES_V1;
    expect(isCanonicalRealmStoneSiteCatalog([...canonical].reverse())).toBe(true);
    expect(isCanonicalRealmStoneSiteCatalog(canonical.slice(1))).toBe(false);
    expect(isCanonicalRealmStoneSiteCatalog([...canonical.slice(0, -1), canonical[0]!])).toBe(false);
    for (const change of [
      { q: canonical[0]!.q + 1 },
      { siteId: 'genesis-001-tier1-stone-999' },
      { active: false },
      { tier: 2 }
    ]) {
      expect(isCanonicalRealmStoneSiteCatalog([
        { ...canonical[0]!, ...change },
        ...canonical.slice(1)
      ])).toBe(false);
    }
  });
});
