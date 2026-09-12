import type { RecoveryPreparationIntent } from './sealed-realms-production-recovery-preparation-receipt.mjs';
export type RecoveryPreparationObservation = Readonly<{
  schemaVersion: 1; profile: 'warpkeep-recovery-preparation-observation-v1';
  iss: 'https://release-auth.warpkeep.com'; aud: 'https://release-auth.warpkeep.com/preparation-observation';
  purpose: 'activation-evidence-worker-configuration'; intent: RecoveryPreparationIntent;
  bridgeService: 'warpkeep-auth-bridge'; bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1';
  observedFrom: number; observedThrough: number; bridgeWorkerVersionId: string;
  bridgeSourceCommit: string; bridgeConfigIdentity: string; bridgeConfigEpoch: number;
  issuedAt: number; expiresAt: number;
}>;
/** Exact signed reservation and fresh observation data; no effect authorization. */
export function verifySealedRealmsProductionRecoveryPreparationObservation(
  compact: string, reservationCompact: string, now: number,
): RecoveryPreparationObservation;
