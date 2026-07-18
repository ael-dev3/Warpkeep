import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import { assertGenesisFounderForFid, assertGenesisFoundingGraph } from './foundingAuthority';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  GENESIS_STARTING_RESOURCE_BALANCES,
  resourceAccountStateIsConsistent,
  type GenesisResourceTerrainKind,
} from './resourceAuthorityPolicy';
import type warpkeep from './schema';
import {
  HEGEMONY_REALM_ID,
  canonicalMetaForKey,
  matchesCanonicalWorldMeta,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type ResourceAccountRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['resourceAccountV1']['fid']['find']>
>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['ownerFid']['find']>
>;

export class ResourceAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ResourceAuthorityError';
  }
}

function fail(code = 'RESOURCE_STATE_INTEGRITY'): never {
  throw new ResourceAuthorityError(code);
}

function timestampMicros(value: { microsSinceUnixEpoch: bigint }): bigint {
  return value.microsSinceUnixEpoch;
}

function terrainForCastle(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
): GenesisResourceTerrainKind {
  const storedMeta = ctx.db.worldTileMetaV1.tileKey.find(castle.tileKey);
  const canonicalMeta = canonicalMetaForKey(castle.tileKey);
  if (
    storedMeta === null
    || canonicalMeta === undefined
    || !matchesCanonicalWorldMeta(storedMeta)
    || storedMeta.realmId !== HEGEMONY_REALM_ID
    || storedMeta.staticContentKind !== 'castle-slot'
    || canonicalMeta.terrainKind !== storedMeta.terrainKind
  ) fail();
  return canonicalMeta.terrainKind;
}

function rowStateIsConsistent(
  row: ResourceAccountRow,
  observedAtMicros: bigint,
): boolean {
  const createdAtMicros = timestampMicros(row.createdAt);
  const updatedAtMicros = timestampMicros(row.updatedAt);
  return resourceAccountStateIsConsistent(row)
    && createdAtMicros >= 0n
    && createdAtMicros <= row.settledThroughMicros
    && row.settledThroughMicros <= updatedAtMicros
    && updatedAtMicros <= observedAtMicros;
}

function accountMatchesFounder(
  ctx: WarpkeepReducerContext,
  row: ResourceAccountRow,
  observedAtMicros: bigint,
): boolean {
  const castleByFid = ctx.db.castle.ownerFid.find(row.fid);
  const castleById = ctx.db.castle.castleId.find(row.castleId);
  if (
    castleByFid === null
    || castleById === null
    || castleByFid.castleId !== row.castleId
    || castleById.ownerFid !== row.fid
    || row.realmId !== HEGEMONY_REALM_ID
    || ctx.db.allowedFid.fid.find(row.fid) === null
    || ctx.db.realmProfileV1.fid.find(row.fid) === null
    || ctx.db.markAccountV1.fid.find(row.fid) === null
    || ctx.db.castleSlotClaimV1.ownerFid.find(row.fid)?.castleId !== row.castleId
    || !rowStateIsConsistent(row, observedAtMicros)
  ) return false;
  try {
    terrainForCastle(ctx, castleByFid);
    return true;
  } catch (error) {
    if (error instanceof ResourceAuthorityError) return false;
    throw error;
  }
}

export type GenesisResourceAuthority = Readonly<{
  account: ResourceAccountRow;
  castle: CastleRow;
  terrainKind: GenesisResourceTerrainKind;
}>;

/** Require the complete private resource graph for exactly one founder. */
export function assertGenesisResourceForFid(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): GenesisResourceAuthority {
  assertGenesisFounderForFid(ctx, fid);
  const account = ctx.db.resourceAccountV1.fid.find(fid);
  const castle = ctx.db.castle.ownerFid.find(fid);
  if (
    account === null
    || castle === null
    || !accountMatchesFounder(ctx, account, ctx.timestamp.microsSinceUnixEpoch)
  ) fail('RESOURCE_ACCOUNT_MISSING_OR_INVALID');
  return Object.freeze({ account, castle, terrainKind: terrainForCastle(ctx, castle) });
}

/** Insert the compiled starting state for a newly founded or backfilled castle. */
export function insertGenesisResourceAccount(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castle: CastleRow,
): ResourceAccountRow {
  if (
    ctx.db.resourceAccountV1.fid.find(fid) !== null
    || ctx.db.resourceAccountV1.castleId.find(castle.castleId) !== null
    || castle.ownerFid !== fid
  ) fail('RESOURCE_ACCOUNT_CONFLICT');
  terrainForCastle(ctx, castle);
  const settledThroughMicros = ctx.timestamp.microsSinceUnixEpoch;
  const inserted = ctx.db.resourceAccountV1.insert({
    fid,
    castleId: castle.castleId,
    realmId: HEGEMONY_REALM_ID,
    ...GENESIS_STARTING_RESOURCE_BALANCES,
    settledThroughMicros,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  if (!accountMatchesFounder(ctx, inserted, settledThroughMicros)) fail();
  return inserted;
}

export type ResourceBackfillPlan = Readonly<{
  expectedFounderCount: bigint;
  missing: readonly Readonly<{ fid: bigint; castle: CastleRow }>[];
}>;

/**
 * Validate every legacy founder and every pre-existing resource row before a
 * backfill performs its first write. Existing conflicting rows are never
 * repaired or overwritten.
 */
export function planGenesisResourceBackfill(
  ctx: WarpkeepReducerContext,
  expectedFounderCount: bigint,
  policyVersion: string,
): ResourceBackfillPlan {
  if (
    expectedFounderCount < 0n
    || policyVersion !== GENESIS_RESOURCE_POLICY_VERSION
    || ctx.db.allowedFid.count() !== expectedFounderCount
    || ctx.db.castle.count() !== expectedFounderCount
    || ctx.db.castleSlotClaimV1.count() !== expectedFounderCount
    || ctx.db.realmProfileV1.count() !== expectedFounderCount
    || ctx.db.markAccountV1.count() !== expectedFounderCount
  ) fail('RESOURCE_BACKFILL_PRECONDITION');
  assertGenesisFoundingGraph(ctx);

  for (const account of ctx.db.resourceAccountV1.iter()) {
    if (!accountMatchesFounder(ctx, account, ctx.timestamp.microsSinceUnixEpoch)) {
      fail('RESOURCE_ACCOUNT_CONFLICT');
    }
  }

  const missing: Array<Readonly<{ fid: bigint; castle: CastleRow }>> = [];
  for (const castle of ctx.db.castle.iter()) {
    const existing = ctx.db.resourceAccountV1.fid.find(castle.ownerFid);
    if (existing === null) {
      if (ctx.db.resourceAccountV1.castleId.find(castle.castleId) !== null) {
        fail('RESOURCE_ACCOUNT_CONFLICT');
      }
      missing.push(Object.freeze({ fid: castle.ownerFid, castle }));
    }
  }
  return Object.freeze({
    expectedFounderCount,
    missing: Object.freeze(missing.sort((left, right) => (
      left.fid < right.fid ? -1 : left.fid > right.fid ? 1 : 0
    ))),
  });
}

export type ResourceGraphAggregate = Readonly<{
  resourceAccounts: bigint;
  missingResourceAccounts: bigint;
  orphanedResourceAccounts: bigint;
  resourceInvariantViolations: bigint;
}>;

/** Counts-only inspection; callers decide which principal may receive it. */
export function inspectGenesisResourceGraph(
  ctx: WarpkeepReducerContext,
): ResourceGraphAggregate {
  let missingResourceAccounts = 0n;
  for (const castle of ctx.db.castle.iter()) {
    if (ctx.db.resourceAccountV1.fid.find(castle.ownerFid) === null) {
      missingResourceAccounts += 1n;
    }
  }

  let orphanedResourceAccounts = 0n;
  let resourceInvariantViolations = 0n;
  for (const account of ctx.db.resourceAccountV1.iter()) {
    const castle = ctx.db.castle.ownerFid.find(account.fid);
    if (
      castle === null
      || castle.castleId !== account.castleId
      || ctx.db.allowedFid.fid.find(account.fid) === null
    ) orphanedResourceAccounts += 1n;
    if (!accountMatchesFounder(ctx, account, ctx.timestamp.microsSinceUnixEpoch)) {
      resourceInvariantViolations += 1n;
    }
  }

  return Object.freeze({
    resourceAccounts: ctx.db.resourceAccountV1.count(),
    missingResourceAccounts,
    orphanedResourceAccounts,
    resourceInvariantViolations,
  });
}
