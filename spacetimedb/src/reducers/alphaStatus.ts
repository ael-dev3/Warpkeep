import { t } from 'spacetimedb/server';

import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../alphaActivationPolicy';
import { requireAdmin } from '../auth';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import {
  matchesCanonicalGenesisForestInstanceV1,
  matchesCanonicalGenesisForestLayoutV1,
} from '../forestLayoutPolicy';
import { matchesCanonicalTierIFoodSiteV1 } from '../foodSitePolicy';
import { matchesCanonicalTierIGoldSiteV1 } from '../goldSitePolicy';
import warpkeep from '../schema';
import { matchesCanonicalTierIWoodSiteV1 } from '../woodSitePolicy';

const adminAlphaStatusV8 = t.object('AdminAlphaStatusV8', {
  schemaProtocolVersion: t.u32(),
  backendProtocolVersion: t.u32(),

  goldSitePolicyVersion: t.string(),
  goldExpeditionPolicyVersion: t.string(),
  canonicalGoldSiteCatalogDigest: t.string(),
  goldSites: t.u64(),
  canonicalGoldSites: t.u64(),
  goldOccupations: t.u64(),
  goldExpeditions: t.u64(),
  goldIdempotencyReceipts: t.u64(),
  goldSchedules: t.u64(),

  forestLayoutVersion: t.u32(),
  forestPolicyVersion: t.string(),
  canonicalForestLayoutDigest: t.string(),
  canonicalForestAssetCatalogDigest: t.string(),
  forestLayouts: t.u64(),
  canonicalForestLayouts: t.u64(),
  forestInstances: t.u64(),
  canonicalForestInstances: t.u64(),

  foodSitePolicyVersion: t.string(),
  foodExpeditionPolicyVersion: t.string(),
  canonicalFoodSiteCatalogDigest: t.string(),
  foodSites: t.u64(),
  canonicalFoodSites: t.u64(),
  foodOccupations: t.u64(),
  foodExpeditions: t.u64(),
  foodIdempotencyReceipts: t.u64(),
  foodSchedules: t.u64(),

  woodSitePolicyVersion: t.string(),
  woodExpeditionPolicyVersion: t.string(),
  canonicalWoodSiteCatalogDigest: t.string(),
  woodSites: t.u64(),
  canonicalWoodSites: t.u64(),
  woodOccupations: t.u64(),
  woodExpeditions: t.u64(),
  woodIdempotencyReceipts: t.u64(),
  woodSchedules: t.u64(),
});

/**
 * Hermes-only, read-only activation checkpoint for the additive v5-v8 suffix.
 * It returns fixed public policy identifiers and table cardinalities only.
 */
export const adminGetAlphaStatusV8 = warpkeep.procedure(
  { name: 'admin_get_alpha_status_v8' },
  adminAlphaStatusV8,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
    let canonicalGoldSites = 0n;
    let canonicalForestLayouts = 0n;
    let canonicalForestInstances = 0n;
    let canonicalFoodSites = 0n;
    let canonicalWoodSites = 0n;
    for (const row of tx.db.goldSiteV1.iter()) {
      if (matchesCanonicalTierIGoldSiteV1(row)) canonicalGoldSites += 1n;
    }
    for (const row of tx.db.realmForestLayoutV1.iter()) {
      if (matchesCanonicalGenesisForestLayoutV1(row)) canonicalForestLayouts += 1n;
    }
    for (const row of tx.db.realmForestInstanceV1.iter()) {
      if (matchesCanonicalGenesisForestInstanceV1(row)) canonicalForestInstances += 1n;
    }
    for (const row of tx.db.foodSiteV1.iter()) {
      if (matchesCanonicalTierIFoodSiteV1(row)) canonicalFoodSites += 1n;
    }
    for (const row of tx.db.woodSiteV1.iter()) {
      if (matchesCanonicalTierIWoodSiteV1(row)) canonicalWoodSites += 1n;
    }
    return {
      schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
      backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,

      goldSitePolicyVersion: gold.sitePolicyVersion,
      goldExpeditionPolicyVersion: gold.expeditionPolicyVersion,
      canonicalGoldSiteCatalogDigest: gold.siteCatalogDigest,
      goldSites: tx.db.goldSiteV1.count(),
      canonicalGoldSites,
      goldOccupations: tx.db.goldNodeOccupationV1.count(),
      goldExpeditions: tx.db.goldExpeditionV1.count(),
      goldIdempotencyReceipts: tx.db.goldExpeditionIdempotencyV1.count(),
      goldSchedules: tx.db.goldExpeditionScheduleV1.count(),

      forestLayoutVersion: forest.layoutVersion,
      forestPolicyVersion: forest.policyVersion,
      canonicalForestLayoutDigest: forest.layoutDigest,
      canonicalForestAssetCatalogDigest: forest.assetCatalogDigest,
      forestLayouts: tx.db.realmForestLayoutV1.count(),
      canonicalForestLayouts,
      forestInstances: tx.db.realmForestInstanceV1.count(),
      canonicalForestInstances,

      foodSitePolicyVersion: food.sitePolicyVersion,
      foodExpeditionPolicyVersion: food.expeditionPolicyVersion,
      canonicalFoodSiteCatalogDigest: food.siteCatalogDigest,
      foodSites: tx.db.foodSiteV1.count(),
      canonicalFoodSites,
      foodOccupations: tx.db.foodNodeOccupationV1.count(),
      foodExpeditions: tx.db.foodExpeditionV1.count(),
      foodIdempotencyReceipts: tx.db.foodExpeditionIdempotencyV1.count(),
      foodSchedules: tx.db.foodExpeditionScheduleV1.count(),

      woodSitePolicyVersion: wood.sitePolicyVersion,
      woodExpeditionPolicyVersion: wood.expeditionPolicyVersion,
      canonicalWoodSiteCatalogDigest: wood.siteCatalogDigest,
      woodSites: tx.db.woodSiteV1.count(),
      canonicalWoodSites,
      woodOccupations: tx.db.woodNodeOccupationV1.count(),
      woodExpeditions: tx.db.woodExpeditionV1.count(),
      woodIdempotencyReceipts: tx.db.woodExpeditionIdempotencyV1.count(),
      woodSchedules: tx.db.woodExpeditionScheduleV1.count(),
    };
  }),
);
