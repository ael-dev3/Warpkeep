import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import { requireAdmin } from './auth';
import {
  beginGreaterRealmDrainAuthorizedTransactionV1,
  commitGreaterRealmActiveAuthorizedTransactionV1,
  freezeGreaterRealmActivationAuthorizedTransactionV1,
  haltGreaterRealmActivationAuthorizedTransactionV1,
  planGreaterRealmRelocationAuthorizedTransactionV1,
  prepareGreaterRealmActivationAuthorizedTransactionV1,
  relocateGreaterRealmCanaryAuthorizedTransactionV1,
  resumeGreaterRealmActiveAuthorizedTransactionV1,
  rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1,
} from './greaterRealmRelocationAuthority';
import { requireGreaterRealmV17ActivationGate } from './greaterRealmV17Authority';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * Dormant production entry points. There are deliberately no reducer
 * registrations or generated bindings; every path checks the compiled-false
 * mutation gate before even authenticating the administrator.
 */
export function dormantPrepareGreaterRealmActivationV1(
  ctx: WarpkeepReducerContext,
): 'prepared' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  const admin = requireAdmin(ctx);
  return prepareGreaterRealmActivationAuthorizedTransactionV1(ctx, admin.subject);
}

export function dormantBeginGreaterRealmDrainV1(
  ctx: WarpkeepReducerContext,
): 'draining' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return beginGreaterRealmDrainAuthorizedTransactionV1(ctx);
}

export function dormantFreezeGreaterRealmActivationV1(
  ctx: WarpkeepReducerContext,
): 'frozen' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return freezeGreaterRealmActivationAuthorizedTransactionV1(ctx);
}

export function dormantPlanGreaterRealmRelocationV1(
  ctx: WarpkeepReducerContext,
): 'planned' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return planGreaterRealmRelocationAuthorizedTransactionV1(ctx);
}

export function dormantRelocateGreaterRealmCanaryV1(
  ctx: WarpkeepReducerContext,
): 'canary' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return relocateGreaterRealmCanaryAuthorizedTransactionV1(ctx);
}

export function dormantCommitGreaterRealmActiveV1(
  ctx: WarpkeepReducerContext,
): 'active' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return commitGreaterRealmActiveAuthorizedTransactionV1(ctx);
}

export function dormantHaltGreaterRealmActivationV1(
  ctx: WarpkeepReducerContext,
): 'halted' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return haltGreaterRealmActivationAuthorizedTransactionV1(ctx);
}

export function dormantResumeGreaterRealmActiveV1(
  ctx: WarpkeepReducerContext,
): 'active' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return resumeGreaterRealmActiveAuthorizedTransactionV1(ctx);
}

export function dormantRollbackGreaterRealmBeforeCommitV1(
  ctx: WarpkeepReducerContext,
): 'rolled-back' | 'unchanged' {
  requireGreaterRealmV17ActivationGate();
  requireAdmin(ctx);
  return rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(ctx);
}

/**
 * Production-bundler reachability anchor only. These are ordinary functions,
 * not registered reducers, and every invocation remains gate-false first.
 */
export const GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1 = Object.freeze([
  dormantPrepareGreaterRealmActivationV1,
  dormantBeginGreaterRealmDrainV1,
  dormantFreezeGreaterRealmActivationV1,
  dormantPlanGreaterRealmRelocationV1,
  dormantRelocateGreaterRealmCanaryV1,
  dormantCommitGreaterRealmActiveV1,
  dormantHaltGreaterRealmActivationV1,
  dormantResumeGreaterRealmActiveV1,
  dormantRollbackGreaterRealmBeforeCommitV1,
] as const);
