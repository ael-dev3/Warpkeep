/** Private Linux filesystem persistence; expectedSource must be derived from verified authorization. */
export function preflightRecoveryClaimHandoff(privateRoot: string): void;
export function writeRecoveryClaimHandoff(privateRoot: string, claimReceiptJws: string, expectedSource: string): Readonly<{ claimDeadline: number }>;
type PrivateClaim = Readonly<{ claimReceiptJws: string; expectedSource: string }>;
/** Private return values. Context must be independently verified for the current run and artifact. */
export function readRecoveryClaimHandoffForDeployment(privateRoot: string, contextSource: string): PrivateClaim;
/** Non-authorizing reconciliation only; strict signed ledger deadline still applies. */
export function readRecoveryClaimHandoffForReconciliation(privateRoot: string, contextSource: string): PrivateClaim;
/** Signed historical data only, not current evidence or deployment authority. Keep private. */
export function readRecoveryClaimHandoffHistory(privateRoot: string): Readonly<{
  purpose: 'signed-history-only'; contextSource: string;
}>;
