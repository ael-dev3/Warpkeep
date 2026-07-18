import { SenderError } from 'spacetimedb/server';

import { requireAdmin } from '../auth';
import {
  forestLayoutErrorCode,
  insertGenesisForestInstance,
  insertGenesisForestLayoutMetadata,
  planGenesisForestLayoutSeed,
} from '../forestLayoutAuthority';
import {
  CANONICAL_GENESIS_FOREST_LAYOUT_V1,
} from '../forestLayoutPolicy';
import warpkeep from '../schema';

function senderPolicyError(error: unknown): never {
  const code = forestLayoutErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/**
 * Hermes-only, all-or-nothing initialization of the shared public forest.
 * No caller can choose a seed, transform, species, digest, count, or version:
 * all values are compiled canonical policy. Exact reruns are no-ops.
 */
export const adminSeedGenesisForestLayoutV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_forest_layout_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisForestLayoutSeed(ctx);
      if (!plan.metadataMissing && plan.missingInstances.length === 0) return;

      for (const instance of plan.missingInstances) {
        insertGenesisForestInstance(ctx, instance);
      }
      if (plan.metadataMissing) insertGenesisForestLayoutMetadata(ctx);

      const after = planGenesisForestLayoutSeed(ctx);
      if (
        after.metadataMissing
        || after.missingInstances.length !== 0
        || ctx.db.realmForestLayoutV1.count() !== 1n
        || ctx.db.realmForestInstanceV1.count()
          !== BigInt(CANONICAL_GENESIS_FOREST_LAYOUT_V1.instanceCount)
      ) {
        throw new SenderError('FOREST_LAYOUT_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_forest_layout_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: [
          `count=${CANONICAL_GENESIS_FOREST_LAYOUT_V1.instanceCount}`,
          `version=${CANONICAL_GENESIS_FOREST_LAYOUT_V1.layoutVersion}`,
          `policy=${CANONICAL_GENESIS_FOREST_LAYOUT_V1.policyVersion}`,
          `layout=${CANONICAL_GENESIS_FOREST_LAYOUT_V1.layoutDigest}`,
          `assets=${CANONICAL_GENESIS_FOREST_LAYOUT_V1.assetCatalogDigest}`,
        ].join(';'),
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
