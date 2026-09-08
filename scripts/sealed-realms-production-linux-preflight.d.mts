/** Authenticates only the fixed G001 preflight; does not claim provider readiness. */
export function runSealedRealmsProductionLinuxPreflight(input: Readonly<{
  operation: 'preflight'; workflowInputSha: string;
}>): Promise<Readonly<{ operation: 'preflight'; status: 'preflight-inspected' }>>;
