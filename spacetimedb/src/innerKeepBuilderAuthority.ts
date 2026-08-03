import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CANONICAL_INNER_KEEP_LAYOUT,
  INNER_KEEP_LAYOUT_ID,
  innerKeepActivationLifecycle,
  innerKeepLifecycleRequiresBuilders,
  matchesCanonicalInnerKeepLayout,
} from './innerKeepLayoutPolicy';
import { INNER_KEEP_POLICY_VERSION } from './innerKeepPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>
>;
type BuilderRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castleInnerBuilderV1']['castleId']['find']>
>;

export class InnerKeepBuilderAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InnerKeepBuilderAuthorityError';
  }
}

function fail(code: string): never {
  throw new InnerKeepBuilderAuthorityError(code);
}

function componentLifecycle(
  ctx: WarpkeepReducerContext,
): 'never-activated' | 'active' | 'inactive-after-activation' {
  if (ctx.db.innerKeepLayoutV1.count() === 0n) return 'never-activated';
  if (ctx.db.innerKeepLayoutV1.count() !== 1n) fail('INNER_KEEP_LAYOUT_INTEGRITY');
  const row = ctx.db.innerKeepLayoutV1.layoutId.find(INNER_KEEP_LAYOUT_ID);
  const lifecycle = row === null ? 'invalid' : innerKeepActivationLifecycle(row);
  if (
    row === null
    || !matchesCanonicalInnerKeepLayout(row)
    || lifecycle === 'invalid'
    || (
      row.activatedAt !== undefined
      && row.activatedAt.microsSinceUnixEpoch < row.createdAt.microsSinceUnixEpoch
    )
  ) fail('INNER_KEEP_LAYOUT_INTEGRITY');
  return lifecycle;
}

export function innerKeepBuilderRowIsIdleAndCanonical(
  row: BuilderRow,
  castle: CastleRow,
): boolean {
  return innerKeepBuilderRowMatchesCastle(row, castle)
    && row.activeBuildingKey === undefined
    && row.busyUntilMicros === undefined;
}

export function innerKeepBuilderRowMatchesCastle(
  row: BuilderRow,
  castle: CastleRow,
): boolean {
  return row.castleId === castle.castleId
    && row.fid === castle.ownerFid
    && (row.activeBuildingKey === undefined) === (row.busyUntilMicros === undefined)
    && row.revision >= 0n
    && row.policyVersion === INNER_KEEP_POLICY_VERSION
    && row.createdAt.microsSinceUnixEpoch >= 0n
    && row.updatedAt.microsSinceUnixEpoch >= row.createdAt.microsSinceUnixEpoch;
}

/**
 * Preserve a backfilled Builder for an existing founder and require it once
 * the component has ever activated. Existing founder calls never silently
 * repair rows, including while construction is temporarily deactivated.
 */
export function assertInnerKeepBuilderForExistingFounder(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
): void {
  const byCastle = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
  const byFid = ctx.db.castleInnerBuilderV1.fid.find(castle.ownerFid);
  if (byCastle === null && byFid === null) {
    if (innerKeepLifecycleRequiresBuilders(componentLifecycle(ctx))) {
      fail('INNER_KEEP_BUILDER_MISSING');
    }
    return;
  }
  if (
    byCastle === null
    || byFid === null
    || byCastle.castleId !== byFid.castleId
    || !innerKeepBuilderRowMatchesCastle(byCastle, castle)
  ) fail('INNER_KEEP_BUILDER_INTEGRITY');
}

/** New founders receive one idle Builder after the component has ever activated. */
export function insertInnerKeepBuilderForNewFounderIfEverActivated(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
): void {
  if (!innerKeepLifecycleRequiresBuilders(componentLifecycle(ctx))) return;
  if (
    ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId) !== null
    || ctx.db.castleInnerBuilderV1.fid.find(castle.ownerFid) !== null
  ) fail('INNER_KEEP_BUILDER_CONFLICT');
  ctx.db.castleInnerBuilderV1.insert({
    castleId: castle.castleId,
    fid: castle.ownerFid,
    activeBuildingKey: undefined,
    busyUntilMicros: undefined,
    revision: 0n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
}

// Keep the import live and fail visibly if the root policy is accidentally
// initialized with a different canonical ID.
if (CANONICAL_INNER_KEEP_LAYOUT.layoutId !== INNER_KEEP_LAYOUT_ID) {
  throw new Error('INNER_KEEP_LAYOUT_ID_DRIFT');
}
