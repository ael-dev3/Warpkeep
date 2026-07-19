import { t } from 'spacetimedb/server';

import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../alphaV10ActivationPolicy';
import { requireAdmin } from '../auth';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import { planGenesisTierIStoneSiteSeed } from '../stoneExpeditionAuthority';
import { planGenesisWaterLayoutSeed } from '../waterAuthority';
import {
  GENESIS_WATER_ENVIRONMENT_EPOCH,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_WATER_SUN_DIRECTION_MICRO,
} from '../waterWorld';
import warpkeep from '../schema';

const adminAlphaStatusV10 = t.object('AdminAlphaStatusV10', {
  schemaProtocolVersion: t.u32(),
  backendProtocolVersion: t.u32(),

  waterPolicyVersion: t.string(),
  waterLayoutVersion: t.u32(),
  canonicalWaterLayoutDigest: t.string(),
  waterActivated: t.bool(),
  waterLayouts: t.u64(),
  canonicalWaterLayouts: t.u64(),
  waterBodies: t.u64(),
  canonicalWaterBodies: t.u64(),
  waterCells: t.u64(),
  canonicalWaterCells: t.u64(),
  realmEnvironments: t.u64(),
  canonicalRealmEnvironments: t.u64(),

  stoneSitePolicyVersion: t.string(),
  stoneExpeditionPolicyVersion: t.string(),
  canonicalStoneSiteCatalogDigest: t.string(),
  stoneSites: t.u64(),
  canonicalStoneSites: t.u64(),
  stoneOccupations: t.u64(),
  stoneExpeditions: t.u64(),
  stoneIdempotencyReceipts: t.u64(),
  stoneSchedules: t.u64(),
});

/** Hermes-only, aggregate checkpoint for the additive v9-v10 suffix. */
export const adminGetAlphaStatusV10 = warpkeep.procedure(
  { name: 'admin_get_alpha_status_v10' },
  adminAlphaStatusV10,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    const { water, stone } = ALPHA_V10_ACTIVATION_COMPONENTS;
    const waterPlan = planGenesisWaterLayoutSeed(tx);
    const stonePlan = planGenesisTierIStoneSiteSeed(
      tx,
      BigInt(stone.siteCount),
      stone.sitePolicyVersion,
    );
    const layout = waterPlan.layout;
    let canonicalRealmEnvironments = 0n;
    for (const environment of tx.db.realmEnvironmentV1.iter()) {
      if (
        environment.realmId === GENESIS_WATER_LAYOUT_V1.realmId
        && environment.environmentEpoch === GENESIS_WATER_ENVIRONMENT_EPOCH
        && environment.waterLayoutVersion === GENESIS_WATER_LAYOUT_V1.layoutVersion
        && environment.seaLevelMilli === GENESIS_WATER_LAYOUT_V1.seaLevelMilli
        && environment.sunDirectionXMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.x
        && environment.sunDirectionYMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.y
        && environment.sunDirectionZMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.z
      ) canonicalRealmEnvironments += 1n;
    }
    return {
      schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
      backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,

      waterPolicyVersion: water.policyVersion,
      waterLayoutVersion: water.layoutVersion,
      canonicalWaterLayoutDigest: water.layoutDigest,
      waterActivated: layout?.activated ?? false,
      waterLayouts: tx.db.realmWaterLayoutV1.count(),
      canonicalWaterLayouts: layout === undefined ? 0n : 1n,
      waterBodies: tx.db.realmWaterBodyV1.count(),
      canonicalWaterBodies: BigInt(water.bodyCount - waterPlan.missingBodies.length),
      waterCells: tx.db.realmWaterCellV1.count(),
      canonicalWaterCells: BigInt(water.cellCount - waterPlan.missingCells.length),
      realmEnvironments: tx.db.realmEnvironmentV1.count(),
      canonicalRealmEnvironments,

      stoneSitePolicyVersion: stone.sitePolicyVersion,
      stoneExpeditionPolicyVersion: stone.expeditionPolicyVersion,
      canonicalStoneSiteCatalogDigest: stone.siteCatalogDigest,
      stoneSites: tx.db.stoneSiteV1.count(),
      canonicalStoneSites: BigInt(stone.siteCount - stonePlan.missing.length),
      stoneOccupations: tx.db.stoneNodeOccupationV1.count(),
      stoneExpeditions: tx.db.stoneExpeditionV1.count(),
      stoneIdempotencyReceipts: tx.db.stoneExpeditionIdempotencyV1.count(),
      stoneSchedules: tx.db.stoneExpeditionScheduleV1.count(),
    };
  }),
);
