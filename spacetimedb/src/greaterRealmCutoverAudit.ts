import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

export type GreaterRealmCutoverTransitionActionV1 =
  | 'prepare_greater_realm_activation_v1'
  | 'begin_greater_realm_drain_v1'
  | 'freeze_greater_realm_activation_v1'
  | 'plan_greater_realm_relocation_v1'
  | 'relocate_greater_realm_canary_v1'
  | 'commit_greater_realm_active_v1'
  | 'halt_greater_realm_activation_v1'
  | 'resume_greater_realm_active_v1'
  | 'rollback_greater_realm_before_commit_v1';

export type GreaterRealmCutoverTransitionResultV1 =
  | 'prepared'
  | 'draining'
  | 'frozen'
  | 'planned'
  | 'canary'
  | 'active'
  | 'halted'
  | 'rolled-back'
  | 'unchanged';

export const GREATER_REALM_CUTOVER_AUDIT_NOTE_V1 =
  'protocol-v17;greater-realm-cutover-audit-v1';

/**
 * Bind one authenticated actor to one changed cutover transaction. The note
 * and action vocabulary are fixed and target-free; exact retries add no row.
 * A failure on the final insert aborts the caller's whole reducer transaction.
 */
export function runGreaterRealmCutoverTransitionWithAuditV1(
  ctx: WarpkeepReducerContext,
  actorSubject: string,
  action: GreaterRealmCutoverTransitionActionV1,
  run: () => GreaterRealmCutoverTransitionResultV1,
): GreaterRealmCutoverTransitionResultV1 {
  const result = run();
  if (result === 'unchanged') return result;
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid: undefined,
    actorSubject,
    createdAt: ctx.timestamp,
    note: GREATER_REALM_CUTOVER_AUDIT_NOTE_V1,
  });
  return result;
}
