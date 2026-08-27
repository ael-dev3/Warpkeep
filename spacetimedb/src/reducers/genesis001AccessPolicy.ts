import { t } from 'spacetimedb/server';

import { requireWarpkeepMetadataConnection } from '../auth';
import { GENESIS_001_ACCESS_POLICY } from '../genesis001AccessPolicy';
import warpkeep from '../schema';

const genesis001AccessPolicyReceiptV1 = t.object('Genesis001AccessPolicyV1', {
  realmId: t.string(),
  releaseVersion: t.string(),
  playerAccessEnabled: t.bool(),
  admissionStateMutationsEnabled: t.bool(),
  accessRequestSubmissionsEnabled: t.bool(),
  sourceBaselineCommit: t.string(),
  freezeReleaseNonce: t.string(),
});

/**
 * Static, read-only deployment receipt for the permanently sealed Genesis 001
 * population. It deliberately shares the existing metadata authority surface
 * and reads no database state or player information.
 */
export const genesis001AccessPolicyV1 = warpkeep.procedure(
  { name: 'genesis_001_access_policy_v1' },
  genesis001AccessPolicyReceiptV1,
  ctx =>
    ctx.withTx(tx => {
      requireWarpkeepMetadataConnection(tx);
      return GENESIS_001_ACCESS_POLICY;
    }),
);
