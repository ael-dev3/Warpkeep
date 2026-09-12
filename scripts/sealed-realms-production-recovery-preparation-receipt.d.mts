export type RecoveryPreparationIntent = Readonly<{
  schemaVersion: 1; profile: 'warpkeep-recovery-preparation-intent-v1';
  requestId: string; authorizationEpoch: number;
  repository: 'ael-dev3/Warpkeep'; repositoryId: '1273513252'; repositoryOwnerId: '183124839';
  preparationCommit: string; preparationTree: string; policyDigest: string; configuredArmingDigest: string | null;
  runId: string; runAttempt: string; checkRunId: string; createdAt: number;
}>;
/** Pinned synchronous signature and complete preparation-purpose semantics. Not effect authorization. */
export function verifySealedRealmsProductionRecoveryPreparationReceipt(compact: string): RecoveryPreparationIntent;
