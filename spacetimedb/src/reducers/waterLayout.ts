import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin } from '../auth';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_V1,
  GENESIS_WATER_LAYOUT_V1,
  classifyGenesisWaterEnvironmentV1,
} from '../waterWorld';
import {
  activateGenesisWaterLayout,
  insertGenesisWaterBody,
  insertGenesisWaterCell,
  insertGenesisWaterLayoutMetadata,
  planGenesisWaterLayoutSeed,
  waterLayoutErrorCode,
} from '../waterAuthority';
import warpkeep from '../schema';

const adminWaterLayoutStatusV1 = t.object('AdminWaterLayoutStatusV1', {
  ready: t.bool(),
  activated: t.bool(),
  layoutVersion: t.u32(),
  layoutDigest: t.string(),
  canonicalLandCellCount: t.u32(),
  oceanCellCount: t.u32(),
  lakeCellCount: t.u32(),
  lakeBodyCount: t.u32(),
  riverCount: t.u32(),
  riverCellCount: t.u32(),
  waterBodies: t.u64(),
  canonicalWaterBodies: t.u64(),
  waterCells: t.u64(),
  canonicalWaterCells: t.u64(),
  environmentRows: t.u64(),
  sourceCommit: t.string(),
});

function senderPolicyError(error: unknown): never {
  const code = waterLayoutErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

function assertEnvironment(
  ctx: Parameters<typeof requireAdmin>[0],
  insertIfMissing: boolean,
): boolean {
  const environmentState = classifyGenesisWaterEnvironmentV1(ctx.db.realmEnvironmentV1.iter());
  if (environmentState === 'conflict') throw new SenderError('WATER_ENVIRONMENT_CONFLICT');
  if (environmentState === 'missing' && !insertIfMissing) {
    throw new SenderError('WATER_ENVIRONMENT_MISSING');
  }
  if (environmentState === 'missing') {
    ctx.db.realmEnvironmentV1.insert({
      ...GENESIS_WATER_ENVIRONMENT_V1,
      updatedAt: ctx.timestamp,
    });
    return true;
  }
  return false;
}

function environmentIsExact(ctx: Parameters<typeof requireAdmin>[0]): boolean {
  return classifyGenesisWaterEnvironmentV1(ctx.db.realmEnvironmentV1.iter()) === 'exact';
}

/** Hermes-only atomic seed. The reducer has no caller-controlled topology inputs. */
export const adminSeedGenesisWaterLayoutV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_water_layout_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisWaterLayoutSeed(ctx);
      if (plan.layout !== undefined && plan.missingBodies.length === 0 && plan.missingCells.length === 0) {
        const insertedEnvironment = assertEnvironment(ctx, true);
        if (insertedEnvironment) {
          ctx.db.adminAudit.insert({
            id: 0n,
            action: 'repair_genesis_water_environment_v1',
            targetFid: undefined,
            actorSubject: admin.subject,
            createdAt: ctx.timestamp,
            note: `version=${GENESIS_WATER_LAYOUT_V1.layoutVersion};digest=${GENESIS_WATER_LAYOUT_V1.layoutDigest}`,
          });
        }
        return;
      }
      for (const body of plan.missingBodies) insertGenesisWaterBody(ctx, body);
      for (const cell of plan.missingCells) insertGenesisWaterCell(ctx, cell);
      if (plan.layout === undefined) insertGenesisWaterLayoutMetadata(ctx);
      assertEnvironment(ctx, true);
      const after = planGenesisWaterLayoutSeed(ctx);
      if (
        after.layout === undefined
        || after.missingBodies.length !== 0
        || after.missingCells.length !== 0
        || ctx.db.realmWaterBodyV1.count() !== BigInt(GENESIS_WATER_BODIES_V1.length)
        || ctx.db.realmWaterCellV1.count() !== BigInt(GENESIS_WATER_CELLS_V1.length)
        || ctx.db.realmEnvironmentV1.count() !== 1n
      ) throw new SenderError('WATER_LAYOUT_SEED_INTEGRITY');
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_water_layout_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: [
          `version=${GENESIS_WATER_LAYOUT_V1.layoutVersion}`,
          `ocean=${GENESIS_WATER_LAYOUT_V1.oceanCellCount}`,
          `lakes=${GENESIS_WATER_LAYOUT_V1.lakeBodyCount}`,
          `rivers=${GENESIS_WATER_LAYOUT_V1.riverCount}`,
          `cells=${GENESIS_WATER_CELLS_V1.length}`,
          `digest=${GENESIS_WATER_LAYOUT_V1.layoutDigest}`,
        ].join(';'),
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Separate activation gate keeps a fully seeded artifact inert until reviewed. */
export const adminActivateGenesisWaterLayoutV1 = warpkeep.reducer(
  { name: 'admin_activate_genesis_water_layout_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      assertEnvironment(ctx, false);
      const row = activateGenesisWaterLayout(ctx);
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'activate_genesis_water_layout_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `version=${row.layoutVersion};digest=${row.layoutDigest};activated=${row.activated}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Aggregate-only inspection; no topology row is returned through this admin procedure. */
export const adminInspectGenesisWaterLayoutV1 = warpkeep.procedure(
  { name: 'admin_inspect_genesis_water_layout_v1' },
  adminWaterLayoutStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      const plan = planGenesisWaterLayoutSeed(tx);
      const layout = plan.layout;
      const environmentReady = environmentIsExact(tx);
      return {
        ready: layout !== undefined
          && plan.missingBodies.length === 0
          && plan.missingCells.length === 0
          && environmentReady,
        activated: layout?.activated ?? false,
        layoutVersion: layout?.layoutVersion ?? GENESIS_WATER_LAYOUT_V1.layoutVersion,
        layoutDigest: layout?.layoutDigest ?? GENESIS_WATER_LAYOUT_V1.layoutDigest,
        canonicalLandCellCount: GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount,
        oceanCellCount: GENESIS_WATER_LAYOUT_V1.oceanCellCount,
        lakeCellCount: GENESIS_WATER_LAYOUT_V1.lakeCellCount,
        lakeBodyCount: GENESIS_WATER_LAYOUT_V1.lakeBodyCount,
        riverCount: GENESIS_WATER_LAYOUT_V1.riverCount,
        riverCellCount: GENESIS_WATER_LAYOUT_V1.riverCellCount,
        waterBodies: tx.db.realmWaterBodyV1.count(),
        canonicalWaterBodies: BigInt(GENESIS_WATER_BODIES_V1.length),
        waterCells: tx.db.realmWaterCellV1.count(),
        canonicalWaterCells: BigInt(GENESIS_WATER_CELLS_V1.length),
        environmentRows: tx.db.realmEnvironmentV1.count(),
        sourceCommit: GENESIS_WATER_LAYOUT_V1.sourceCommit,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);
