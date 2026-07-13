import { MAX_AUTH_EPOCH } from './config';

export interface AllowedFidPolicyState {
  enabled: boolean;
  authEpoch: number;
}

export type AllowFidPlan =
  | { kind: 'insert'; enabled: true; authEpoch: 1 }
  | { kind: 'enabled'; enabled: true; authEpoch: number }
  | { kind: 'reenabled'; enabled: true; authEpoch: number };

export interface AllowFidTransitionHandlers {
  insert(plan: Extract<AllowFidPlan, { kind: 'insert' }>): void;
  enabled(plan: Extract<AllowFidPlan, { kind: 'enabled' }>): void;
  reenabled(plan: Extract<AllowFidPlan, { kind: 'reenabled' }>): void;
  audit(): void;
}

export class AuthEpochExhaustedError extends Error {
  constructor() {
    super('AUTH_EPOCH_EXHAUSTED');
    this.name = 'AuthEpochExhaustedError';
  }
}

/**
 * Plans whitelist admission before any table or audit mutation. New identities
 * start at epoch 1; epoch 0 remains reserved for non-enabled resolver results.
 * Re-enabling a disabled identity rotates exactly once so every retained token
 * from the earlier admission is rejected by the existing module epoch guard.
 */
export function planAllowFid(existing: AllowedFidPolicyState | null): AllowFidPlan {
  if (!existing) return { kind: 'insert', enabled: true, authEpoch: 1 };
  if (existing.enabled) {
    return { kind: 'enabled', enabled: true, authEpoch: existing.authEpoch };
  }
  if (existing.authEpoch >= MAX_AUTH_EPOCH) throw new AuthEpochExhaustedError();
  return { kind: 'reenabled', enabled: true, authEpoch: existing.authEpoch + 1 };
}

export function executeAllowFidTransition(
  existing: AllowedFidPolicyState | null,
  handlers: AllowFidTransitionHandlers,
): AllowFidPlan {
  const plan = planAllowFid(existing);
  if (plan.kind === 'insert') handlers.insert(plan);
  else if (plan.kind === 'enabled') handlers.enabled(plan);
  else handlers.reenabled(plan);
  handlers.audit();
  return plan;
}
