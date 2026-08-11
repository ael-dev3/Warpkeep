import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  type GreaterRealmActivationCheckpointV1,
  type GreaterRealmActivationPhase,
  validateGreaterRealmActivationCheckpointV1,
} from './greaterRealmActivationPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
export type GreaterRealmActivationRowV1 = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmActivationV1']['activationId']['find']>
>;

export class GreaterRealmActivationStateError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmActivationStateError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmActivationStateError(code);
}

function micros(value: { microsSinceUnixEpoch: bigint } | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  const result = value.microsSinceUnixEpoch;
  if (typeof result !== 'bigint' || result < 0n || result > 0xffff_ffff_ffff_ffffn) {
    fail('GREATER_REALM_ACTIVATION_TIME_INVALID');
  }
  return result;
}

/**
 * Validate the timestamp-backed phase representation stored in the additive
 * v17 activation row. `activatedAt` is the irreversible commit bit; canary is
 * a cutover, but remains rollback-safe while both post-canary counters are 0.
 */
export function greaterRealmActivationCheckpointFromRowV1(
  row: GreaterRealmActivationRowV1,
): GreaterRealmActivationCheckpointV1 {
  const phase = row.mode as GreaterRealmActivationPhase;
  const preparedAt = micros(row.preparedAt);
  const drainingAt = micros(row.drainingAt);
  const frozenAt = micros(row.frozenAt);
  const plannedAt = micros(row.plannedAt);
  const canaryAt = micros(row.canaryAt);
  const activatedAt = micros(row.activatedAt);
  const haltedAt = micros(row.haltedAt);
  const rolledBackAt = micros(row.rolledBackAt);
  if (preparedAt === undefined) fail('GREATER_REALM_ACTIVATION_TIME_INVALID');

  const progress = [preparedAt, drainingAt, frozenAt, plannedAt, canaryAt, activatedAt];
  let missingSeen = false;
  let prior = preparedAt;
  for (const value of progress.slice(1)) {
    if (value === undefined) {
      missingSeen = true;
      continue;
    }
    if (missingSeen || value < prior) fail('GREATER_REALM_ACTIVATION_TIME_INVALID');
    prior = value;
  }
  if (haltedAt !== undefined && haltedAt < prior) {
    fail('GREATER_REALM_ACTIVATION_TIME_INVALID');
  }
  if (rolledBackAt !== undefined && rolledBackAt < (haltedAt ?? prior)) {
    fail('GREATER_REALM_ACTIVATION_TIME_INVALID');
  }

  const lastProgress = activatedAt !== undefined ? 'active'
    : canaryAt !== undefined ? 'canary'
      : plannedAt !== undefined ? 'planned'
        : frozenAt !== undefined ? 'frozen'
          : drainingAt !== undefined ? 'draining'
            : 'prepared';
  if (
    (phase === 'halted' && haltedAt === undefined)
    || (phase !== 'active' && phase !== 'halted' && phase !== 'rolled-back' && haltedAt !== undefined)
    || (phase === 'rolled-back' && rolledBackAt === undefined)
    || (phase !== 'rolled-back' && rolledBackAt !== undefined)
    || (phase !== 'active' && phase !== 'halted' && phase !== 'rolled-back' && phase !== lastProgress)
    || (phase === 'active' && activatedAt === undefined)
    || (phase === 'rolled-back' && activatedAt !== undefined)
  ) fail('GREATER_REALM_ACTIVATION_TIME_INVALID');

  const checkpoint: GreaterRealmActivationCheckpointV1 = Object.freeze({
    phase,
    everActive: activatedAt !== undefined,
    postCanaryFoundingCount: row.postCanaryFoundingCount,
    postCanaryDispatchCount: row.postCanaryDispatchCount,
  });
  validateGreaterRealmActivationCheckpointV1(checkpoint);
  return checkpoint;
}

/** Return the only activation row, rejecting a corrupt multi-row authority. */
export function currentGreaterRealmActivationRowV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): GreaterRealmActivationRowV1 | undefined {
  // Older pure reducer harnesses intentionally model only the frozen v16
  // prefix. Production v17 always has the table; absence in a v16 harness is
  // exactly equivalent to an empty additive activation suffix.
  const table = (ctx.db as WarpkeepReducerContext['db'] & {
    greaterRealmActivationV1?: WarpkeepReducerContext['db']['greaterRealmActivationV1'];
  }).greaterRealmActivationV1;
  if (table === undefined) return undefined;
  if (table.count() > 1n) {
    fail('GREATER_REALM_ACTIVATION_CARDINALITY_INVALID');
  }
  let selected: GreaterRealmActivationRowV1 | undefined;
  for (const row of table.iter()) {
    if (selected !== undefined) fail('GREATER_REALM_ACTIVATION_CARDINALITY_INVALID');
    selected = row;
  }
  if (selected !== undefined) greaterRealmActivationCheckpointFromRowV1(selected);
  return selected;
}

/**
 * Founder/economy authority changes only when the one-transaction canary
 * relocation has committed. A pre-canary halt stays v16; a post-canary halt
 * stays v17; an exact rollback returns to v16.
 */
export function greaterRealmCutoverIsCurrentV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): boolean {
  const row = currentGreaterRealmActivationRowV1(ctx);
  return row !== undefined
    && row.canaryAt !== undefined
    && row.rolledBackAt === undefined;
}

/** Legacy v16 journeys can retry receipts, but cannot start after cutover. */
export function greaterRealmLegacyJourneyDispatchIsOpenV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): boolean {
  const row = currentGreaterRealmActivationRowV1(ctx);
  return row === undefined || row.mode === 'prepared' || row.mode === 'rolled-back';
}

/** New v16 founder mutations share the same begin-drain ingress boundary. */
export function greaterRealmLegacyFoundingIsOpenV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): boolean {
  return greaterRealmLegacyJourneyDispatchIsOpenV1(ctx);
}

export function greaterRealmActivationStateErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmActivationStateError ? error.code : undefined;
}
