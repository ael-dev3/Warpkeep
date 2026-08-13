import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  assertCurrentFounderForFid,
  assertGenesisFounderForFid,
  assertGenesisFoundingGraph,
  type CurrentFounderAuthority,
} from './foundingAuthority';
import { greaterRealmCutoverIsCurrentV1 } from './greaterRealmActivationState';
import {
  greaterRealmCurrentAuthorityErrorCode,
  greaterRealmCurrentPassiveTerrainV1,
  profileMatchesMarks,
} from './greaterRealmCurrentAuthority';
import type {
  GreaterRealmIndexedPublicReadAuthorityV1,
} from './greaterRealmPublicReadAuthority';
import { markAccountIsConsistent } from './marksAuthorityPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  GENESIS_STARTING_RESOURCE_BALANCES,
  resourceAccountStateIsConsistent,
  type GenesisResourceTerrainKind,
} from './resourceAuthorityPolicy';
import type warpkeep from './schema';
import {
  HEGEMONY_REALM_ID,
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

function terrainForFounder(
  ctx: WarpkeepReducerContext,
  founder: CurrentFounderAuthority,
): GenesisResourceTerrainKind {
  try {
    return greaterRealmCurrentPassiveTerrainV1(ctx, founder);
  } catch (error) {
    const code = greaterRealmCurrentAuthorityErrorCode(error);
    if (code !== undefined) fail(code);
    throw error;
  }
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
  let founder: CurrentFounderAuthority;
  try {
    founder = assertCurrentFounderForFid(ctx, row.fid);
  } catch {
    return false;
  }
  const castleByFid = ctx.db.castle.ownerFid.find(row.fid);
  const castleById = ctx.db.castle.castleId.find(row.castleId);
  const legacyClaimMismatch = founder.source === 'v16'
    && ctx.db.castleSlotClaimV1.ownerFid.find(row.fid)?.castleId !== row.castleId;
  if (
    castleByFid === null
    || castleById === null
    || castleByFid.castleId !== founder.castle.castleId
    || castleByFid.castleId !== row.castleId
    || castleById.ownerFid !== row.fid
    || row.realmId !== HEGEMONY_REALM_ID
    || ctx.db.allowedFid.fid.find(row.fid) === null
    || ctx.db.realmProfileV1.fid.find(row.fid) === null
    || ctx.db.markAccountV1.fid.find(row.fid) === null
    || legacyClaimMismatch
    || !rowStateIsConsistent(row, observedAtMicros)
  ) return false;
  try {
    terrainForFounder(ctx, founder);
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
  founderSource: CurrentFounderAuthority['source'];
}>;

/** Require the complete private resource graph for exactly one founder. */
export function assertGenesisResourceForFid(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): GenesisResourceAuthority {
  assertGenesisFounderForFid(ctx, fid);
  const founder = assertCurrentFounderForFid(ctx, fid);
  const account = ctx.db.resourceAccountV1.fid.find(fid);
  const castle = ctx.db.castle.ownerFid.find(fid);
  if (
    account === null
    || castle === null
    || castle.castleId !== founder.castle.castleId
    || !accountMatchesFounder(ctx, account, ctx.timestamp.microsSinceUnixEpoch)
  ) fail('RESOURCE_ACCOUNT_MISSING_OR_INVALID');
  return Object.freeze({
    account,
    castle,
    terrainKind: terrainForFounder(ctx, founder),
    founderSource: founder.source,
  });
}

/**
 * Resource half of the read-only v17 fast path. The caller placement has
 * already been proven through indexed current authority, so this must never
 * recurse into founder or whole-world validation.
 */
export function assertGreaterRealmResourceForIndexedReadV1(
  ctx: WarpkeepReducerContext,
  authority: GreaterRealmIndexedPublicReadAuthorityV1,
): GenesisResourceAuthority {
  const { castle, claim, occupancy } = authority;
  const fid = castle.ownerFid;
  const account = ctx.db.resourceAccountV1.fid.find(fid);
  const accountByCastle = ctx.db.resourceAccountV1.castleId.find(castle.castleId);
  const profile = ctx.db.realmProfileV1.fid.find(fid);
  const marks = ctx.db.markAccountV1.fid.find(fid);
  if (
    account === null
    || accountByCastle === null
    || accountByCastle.fid !== fid
    || profile === null
    || marks === null
    || ctx.db.allowedFid.fid.find(fid) === null
    || account.fid !== fid
    || account.castleId !== castle.castleId
    || account.realmId !== HEGEMONY_REALM_ID
    || !rowStateIsConsistent(account, ctx.timestamp.microsSinceUnixEpoch)
    || !markAccountIsConsistent(marks)
    || !profileMatchesMarks(profile, marks)
  ) fail('RESOURCE_ACCOUNT_MISSING_OR_INVALID');
  const founder = Object.freeze({
    source: 'v17' as const,
    castle,
    profile,
    greaterRealmClaim: claim,
    greaterRealmOccupancy: occupancy,
  });
  return Object.freeze({
    account,
    castle,
    terrainKind: terrainForFounder(ctx, founder),
    founderSource: 'v17' as const,
  });
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
  const founder = assertCurrentFounderForFid(ctx, fid);
  if (founder.source !== 'v16' || founder.castle.castleId !== castle.castleId) {
    fail('RESOURCE_ACCOUNT_CONFLICT');
  }
  terrainForFounder(ctx, founder);
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
    greaterRealmCutoverIsCurrentV1(ctx)
    ||
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
