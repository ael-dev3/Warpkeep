declare const workflowEvidence: unique symbol;
export type SealedRealmsProductionWorkflowEvidence = Readonly<{ [workflowEvidence]: true }>;
export function createSealedRealmsProductionWorkflowEvidence(input: Readonly<{
  workflowInputSha: string;
}>): Promise<SealedRealmsProductionWorkflowEvidence>;
export function refreshSealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence): Promise<void>;
export function verifySealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence, commit: string): Readonly<{ verifiedSha: string }>;
export function revokeSealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence): void;

declare const retainedEvidence: unique symbol;
/** Fixed public readback, deliberately separate from a live workflow scope. */
export type SealedRealmsProductionRetainedEvidence = Readonly<{ [retainedEvidence]: true }>;
export function createSealedRealmsProductionRetainedEvidence(input: Readonly<{
  operatingCommit: string; sourceCommits: readonly string[];
}> & ({ nativeRuntime?: never; githubToken?: never } | Readonly<{
  nativeRuntime: import('./sealed-realms-production-linux-preflight.mjs').SealedRealmsProductionRetainedFixtureRuntime;
  githubToken: Buffer | null;
}>)): Promise<SealedRealmsProductionRetainedEvidence>;
export function refreshSealedRealmsProductionRetainedEvidence(scope: SealedRealmsProductionRetainedEvidence): Promise<void>;
export function verifySealedRealmsProductionRetainedEvidence(scope: SealedRealmsProductionRetainedEvidence, commit: string): Readonly<{ verifiedSha: string }>;
export function revokeSealedRealmsProductionRetainedEvidence(scope: SealedRealmsProductionRetainedEvidence): void;
