/** Private current evidence joined to signed history. Not deployment authority. */
export function readRecoveryWorkflowCurrentContext(): Promise<Readonly<{
  privateRoot: string; bindingSource: string; contextSource: string;
}>>;
/** Original signed claim from an earlier attempt of this exact verified run. */
export function readRecoveryWorkflowPriorContext(): Promise<Readonly<{ privateRoot: string; contextSource: string }> | null>;
