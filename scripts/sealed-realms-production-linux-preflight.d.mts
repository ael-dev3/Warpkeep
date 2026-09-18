declare const retainedFixtureRuntime: unique symbol;
export type SealedRealmsProductionRetainedFixtureRuntime = Readonly<{ [retainedFixtureRuntime]: true }>;
export function createSealedRealmsProductionRetainedFixtureRuntime(input: Readonly<{
  operatingCommit: string;
}>): SealedRealmsProductionRetainedFixtureRuntime;
export function attestSealedRealmsProductionRetainedFixtureRuntime(
  runtime: SealedRealmsProductionRetainedFixtureRuntime,
): Readonly<{ operatingCommit: string; operatingTree: string }>;
/** Fixed owner/native desktop read; no workflow context or dispatch is accepted. */
export function readSealedRealmsProductionNativeFixtureSources(input: Readonly<{
  operatingCommit: string; githubToken: Buffer | null;
}>): Promise<Readonly<Record<string, unknown>>>;

export function runSealedRealmsProductionLinuxPreflight(input: Readonly<{
  operation: 'preflight'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight'; status: 'preflight-inspected' }>>;

export function runSealedRealmsProductionLinuxOperation(input: Readonly<{
  operation: 'g001-freeze-census'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'g001-freeze-census'; status: 'completed';
  censusAttempt: import('./genesis001-linux-census-attempt.mjs').Genesis001LinuxCensusSelector }>>;

/** Fixed dispatch; unwired provider operations are refused before runtime work. */
export function runSealedRealmsProductionLinuxOperation(input: Readonly<{
  operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe'
    | 'ptr-state-inspect' | 'ptr-update-inspect' | 'ptr-update-apply' | 'g002-update-inspect' | 'g002-update-apply'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe'
    | 'ptr-state-inspect' | 'ptr-update-inspect' | 'ptr-update-apply' | 'g002-update-inspect' | 'g002-update-apply';
  status: 'state-inspected' | 'preflight-inspected' | 'activation-evidence-inspected' | 'update-inspected' | 'completed' }>>;
