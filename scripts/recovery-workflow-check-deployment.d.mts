/** Immediate check only; result cannot be stored or reused as deployment authority. */
export function checkRecoveryWorkflowDeployment(): Promise<Readonly<{ boundaryChecked: true }>>;
