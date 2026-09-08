/** Authenticates only the fixed G001 preflight; does not claim provider readiness. */
export function runSealedRealmsProductionLinuxPreflight(input: Readonly<{
  operation: 'preflight'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight'; status: 'preflight-inspected' }>>;

/** Fixed dispatch; unwired provider operations are refused before runtime work. */
export function runSealedRealmsProductionLinuxOperation(input: Readonly<{
  operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe';
  status: 'preflight-inspected' | 'activation-evidence-inspected' | 'completed' }>>;
