/** Internal fixed transport. The owner reattests after OIDC acquisition and authenticates the response. */
export function requestSealedRealmsProductionRecoveryPreparation(preparationCommit: string, beforeSend?: () => void): Promise<string>;
/** Fresh configuration observation through its fixed endpoint; response still requires owner verification. */
export function requestSealedRealmsProductionRecoveryPreparationObservation(preparationCommit: string, beforeSend?: () => void): Promise<string>;
