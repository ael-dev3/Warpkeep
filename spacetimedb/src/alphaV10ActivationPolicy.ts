import { STONE_EXPEDITION_POLICY_VERSION } from './stoneExpeditionPolicy';
import {
  GENESIS_TIER_I_STONE_SITE_COUNT,
  GENESIS_TIER_I_STONE_SITE_DIGEST,
  STONE_SITE_POLICY_VERSION,
} from './stoneSitePolicy';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_V1,
} from './waterWorld';

/** Append-only schema generation covered by the Water and Stone checkpoint. */
export const ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION = 10;

/** Public policy constants only; no live rows, identities, or balances. */
export const ALPHA_V10_ACTIVATION_COMPONENTS = Object.freeze({
  water: Object.freeze({
    layoutCount: 1,
    bodyCount: GENESIS_WATER_BODIES_V1.length,
    cellCount: GENESIS_WATER_CELLS_V1.length,
    environmentCount: 1,
    layoutVersion: GENESIS_WATER_LAYOUT_V1.layoutVersion,
    policyVersion: GENESIS_WATER_LAYOUT_V1.policyVersion,
    layoutDigest: GENESIS_WATER_LAYOUT_V1.layoutDigest,
  }),
  stone: Object.freeze({
    siteCount: GENESIS_TIER_I_STONE_SITE_COUNT,
    sitePolicyVersion: STONE_SITE_POLICY_VERSION,
    expeditionPolicyVersion: STONE_EXPEDITION_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_STONE_SITE_DIGEST,
  }),
});

export type AlphaV10ActivationComponent = keyof typeof ALPHA_V10_ACTIVATION_COMPONENTS;
