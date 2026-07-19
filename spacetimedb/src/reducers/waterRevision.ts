import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin } from '../auth';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
} from '../waterRevision';
import {
  activateGenesisWaterRevisionV1,
  insertGenesisWaterRevisionV1,
  planGenesisWaterRevisionV1Seed,
  waterRevisionErrorCode,
} from '../waterRevisionAuthority';
import warpkeep from '../schema';

const adminWaterRevisionStatusV1 = t.object('AdminWaterRevisionStatusV1', {
  ready: t.bool(),
  activated: t.bool(),
  revisionVersion: t.u32(),
  policyVersion: t.string(),
  baseLayoutVersion: t.u32(),
  baseLayoutDigest: t.string(),
  oceanBodyCount: t.u32(),
  riverBodyCount: t.u32(),
  enabledBodyCount: t.u32(),
  oceanCellCount: t.u32(),
  riverCellCount: t.u32(),
  enabledCellCount: t.u32(),
  lakeBodyCount: t.u32(),
  lakeCellCount: t.u32(),
  riverWidthCells: t.u32(),
  navigationFogBoundaryDepthCells: t.u32(),
  hiddenBufferCells: t.u32(),
  revisionRows: t.u64(),
  revisionDigest: t.string(),
  sourceCommit: t.string(),
});

function senderPolicyError(error: unknown): never {
  const code = waterRevisionErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/** Hermes-only atomic seed; callers cannot provide regimes or topology. */
export const adminSeedGenesisWaterRevisionV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_water_revision_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisWaterRevisionV1Seed(ctx);
      if (plan.revision !== undefined) return;

      insertGenesisWaterRevisionV1(ctx);
      const after = planGenesisWaterRevisionV1Seed(ctx);
      if (after.revision === undefined || ctx.db.realmWaterRevisionV1.count() !== 1n) {
        throw new SenderError('WATER_REVISION_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_water_revision_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: [
          `revision=${after.revision.revisionVersion}`,
          `base=${after.revision.baseLayoutVersion}`,
          `bodies=${after.revision.enabledBodyCount}`,
          `cells=${after.revision.enabledCellCount}`,
          `lakes=${after.revision.lakeCellCount}`,
          `digest=${after.revision.revisionDigest}`,
        ].join(';'),
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Activation is separate so the immutable revision can be inspected first. */
export const adminActivateGenesisWaterRevisionV1 = warpkeep.reducer(
  { name: 'admin_activate_genesis_water_revision_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const before = planGenesisWaterRevisionV1Seed(ctx);
      if (before.revision === undefined) {
        throw new SenderError('WATER_REVISION_NOT_READY');
      }
      if (before.revision.activated) return;

      const row = activateGenesisWaterRevisionV1(ctx);
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'activate_genesis_water_revision_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: [
          `revision=${row.revisionVersion}`,
          `base=${row.baseLayoutVersion}`,
          `digest=${row.revisionDigest}`,
          `activated=${row.activated}`,
        ].join(';'),
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Aggregate-only review gate; it never returns Water v1 topology rows. */
export const adminInspectGenesisWaterRevisionV1 = warpkeep.procedure(
  { name: 'admin_inspect_genesis_water_revision_v1' },
  adminWaterRevisionStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      const plan = planGenesisWaterRevisionV1Seed(tx);
      const revision = plan.revision;
      const canonical = CANONICAL_GENESIS_WATER_REVISION_V1;
      return {
        ready: revision !== undefined,
        activated: revision?.activated ?? false,
        revisionVersion: revision?.revisionVersion ?? canonical.revisionVersion,
        policyVersion: revision?.policyVersion ?? canonical.policyVersion,
        baseLayoutVersion: revision?.baseLayoutVersion ?? canonical.baseLayoutVersion,
        baseLayoutDigest: revision?.baseLayoutDigest ?? canonical.baseLayoutDigest,
        oceanBodyCount: canonical.oceanBodyCount,
        riverBodyCount: canonical.riverBodyCount,
        enabledBodyCount: canonical.enabledBodyCount,
        oceanCellCount: canonical.oceanCellCount,
        riverCellCount: canonical.riverCellCount,
        enabledCellCount: canonical.enabledCellCount,
        lakeBodyCount: canonical.lakeBodyCount,
        lakeCellCount: canonical.lakeCellCount,
        riverWidthCells: canonical.riverWidthCells,
        navigationFogBoundaryDepthCells:
          canonical.navigationFogBoundaryDepthCells,
        hiddenBufferCells: canonical.hiddenBufferCells,
        revisionRows: tx.db.realmWaterRevisionV1.count(),
        revisionDigest: revision?.revisionDigest ?? canonical.revisionDigest,
        sourceCommit: revision?.sourceCommit ?? canonical.sourceCommit,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);
