import { FOOD_EXPEDITION_POLICY_VERSION } from './foodExpeditionPolicy';
import {
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_DIGEST,
} from './foodSitePolicy';
import {
  GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_POLICY_VERSION,
  GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
  GENESIS_FOREST_LAYOUT_V1_VERSION,
} from './forestLayoutContract';
import { GOLD_EXPEDITION_POLICY_VERSION } from './goldExpeditionPolicy';
import {
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GENESIS_TIER_I_GOLD_SITE_DIGEST,
  GOLD_SITE_POLICY_VERSION,
} from './goldSitePolicy';
import { WOOD_EXPEDITION_POLICY_VERSION } from './woodExpeditionPolicy';
import {
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_DIGEST,
  WOOD_SITE_POLICY_VERSION,
} from './woodSitePolicy';

/** Append-only schema generation covered by the aggregate activation check. */
export const ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION = 8;

/**
 * Canonical, non-secret activation expectations shared by the module and the
 * local Hermes operator. They describe reviewed policy; no live row data is
 * represented here.
 */
export const ALPHA_ACTIVATION_COMPONENTS = Object.freeze({
  gold: Object.freeze({
    siteCount: GENESIS_TIER_I_GOLD_SITE_COUNT,
    sitePolicyVersion: GOLD_SITE_POLICY_VERSION,
    expeditionPolicyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_GOLD_SITE_DIGEST,
  }),
  forest: Object.freeze({
    layoutCount: 1,
    instanceCount: GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
    layoutVersion: GENESIS_FOREST_LAYOUT_V1_VERSION,
    policyVersion: GENESIS_FOREST_LAYOUT_V1_POLICY_VERSION,
    layoutDigest: GENESIS_FOREST_LAYOUT_V1_DIGEST,
    assetCatalogDigest: GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  }),
  food: Object.freeze({
    siteCount: GENESIS_TIER_I_FOOD_SITE_COUNT,
    sitePolicyVersion: FOOD_SITE_POLICY_VERSION,
    expeditionPolicyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_FOOD_SITE_DIGEST,
  }),
  wood: Object.freeze({
    siteCount: GENESIS_TIER_I_WOOD_SITE_COUNT,
    sitePolicyVersion: WOOD_SITE_POLICY_VERSION,
    expeditionPolicyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_WOOD_SITE_DIGEST,
  }),
});

export type AlphaActivationComponent = keyof typeof ALPHA_ACTIVATION_COMPONENTS;
