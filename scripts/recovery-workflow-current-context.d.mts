/** Private current evidence joined to signed history. Not deployment authority. */
export function readRecoveryWorkflowCurrentContext(): Promise<Readonly<{
  privateRoot: string; bindingSource: string; contextSource: string;
}>>;
