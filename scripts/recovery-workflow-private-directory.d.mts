export function createRecoveryWorkflowPrivateDirectory(pagesRunId: string, pagesRunAttempt: string): string;
/** Validates fixed parent writability and absent exact target without allocation. */
export function preflightRecoveryWorkflowPrivateDirectory(pagesRunId: string, pagesRunAttempt: string): string;
export function resolveRecoveryWorkflowPrivateDirectory(pagesRunId: string, pagesRunAttempt: string): string;
/** Earlier retained attempt of the same run only; ambiguous/malformed state fails. */
export function findRecoveryWorkflowPriorDirectory(pagesRunId: string, pagesRunAttempt: string): string | null;
