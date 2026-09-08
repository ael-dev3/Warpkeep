/** Internal fixed transport. The owner reattests after OIDC acquisition and authenticates the response. */
export function requestSealedRealmsProductionRecoveryPreparation(preparationCommit: string, beforeSend?: () => void): Promise<string>;
