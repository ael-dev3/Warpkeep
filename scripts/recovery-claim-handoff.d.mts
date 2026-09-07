/** Private Linux filesystem persistence; expectedSource must be derived from verified authorization. */
export function preflightRecoveryClaimHandoff(privateRoot: string): void;
export function writeRecoveryClaimHandoff(privateRoot: string, claimReceiptJws: string, expectedSource: string): Readonly<{ claimDeadline: number }>;
type PrivateClaim = Readonly<{ claimReceiptJws: string; expectedSource: string }>;
/** Private return values. Context must be independently verified for the current run and artifact. */
export function readRecoveryClaimHandoffForDeployment(privateRoot: string, contextSource: string): PrivateClaim;
/** Non-authorizing reconciliation only; strict signed ledger deadline still applies. */
export function readRecoveryClaimHandoffForReconciliation(privateRoot: string, contextSource: string): PrivateClaim;
