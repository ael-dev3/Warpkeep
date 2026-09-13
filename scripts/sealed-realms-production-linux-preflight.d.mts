/** Authenticates only the fixed G001 preflight; does not claim provider readiness. */
export function runSealedRealmsProductionLinuxPreflight(input: Readonly<{
  operation: 'preflight'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight'; status: 'preflight-inspected' }>>;

/** Fixed dispatch; unwired provider operations are refused before runtime work. */
export function runSealedRealmsProductionLinuxOperation(input: Readonly<{
  operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe'
    | 'ptr-state-inspect' | 'ptr-update-inspect' | 'ptr-update-apply' | 'g002-update-inspect' | 'g002-update-apply'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight' | 'activation-evidence-inspect' | 'activation-evidence-generate' | 'g001-policy-observe'
    | 'ptr-state-inspect' | 'ptr-update-inspect' | 'ptr-update-apply' | 'g002-update-inspect' | 'g002-update-apply';
  status: 'state-inspected' | 'preflight-inspected' | 'activation-evidence-inspected' | 'update-inspected' | 'completed' }>>;
