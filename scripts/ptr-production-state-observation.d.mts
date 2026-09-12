import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
export function observePtrProductionState(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  reattest: () => Promise<void>;
  sourceCommit: string; sourceTree: string; runId: string; runAttempt: string;
}>): Promise<Readonly<{ operation: 'ptr-state-inspect'; status: 'state-inspected' }>>;
