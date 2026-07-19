import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import type warpkeep from './schema';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  matchesCanonicalGenesisWaterRevisionV1,
} from './waterRevision';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  classifyGenesisWaterEnvironmentV1,
} from './waterWorld';
import {
  planGenesisWaterLayoutSeed,
  waterLayoutErrorCode,
} from './waterAuthority';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type WaterRevisionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmWaterRevisionV1']['realmId']['find']>
>;

export class WaterRevisionAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WaterRevisionAuthorityError';
  }
}

function fail(code: string): never {
  throw new WaterRevisionAuthorityError(code);
}

/**
 * A revision is meaningful only over the complete, activated Water v1 base.
 * The exact environment row is part of that authority boundary as clients use
 * it for the shared water datum and clock.
 */
export function assertGenesisWaterRevisionBaseV1(
  ctx: WarpkeepReducerContext,
): void {
  let plan: ReturnType<typeof planGenesisWaterLayoutSeed>;
  try {
    plan = planGenesisWaterLayoutSeed(ctx);
  } catch (error) {
    if (waterLayoutErrorCode(error) !== undefined) {
      fail('WATER_REVISION_BASE_CONFLICT');
    }
    throw error;
  }

  const environmentState = classifyGenesisWaterEnvironmentV1(
    ctx.db.realmEnvironmentV1.iter(),
  );
  if (environmentState === 'conflict') fail('WATER_REVISION_BASE_CONFLICT');
  if (
    plan.layout === undefined
    || plan.missingBodies.length !== 0
    || plan.missingCells.length !== 0
    || !plan.layout.activated
    || environmentState !== 'exact'
  ) fail('WATER_REVISION_BASE_NOT_READY');

  if (
    ctx.db.realmWaterLayoutV1.count() !== 1n
    || ctx.db.realmWaterBodyV1.count() !== BigInt(GENESIS_WATER_BODIES_V1.length)
    || ctx.db.realmWaterCellV1.count() !== BigInt(GENESIS_WATER_CELLS_V1.length)
    || ctx.db.realmEnvironmentV1.count() !== 1n
  ) fail('WATER_REVISION_BASE_CONFLICT');
}

export function inspectGenesisWaterRevisionV1(
  ctx: WarpkeepReducerContext,
): WaterRevisionRow | undefined {
  let found: WaterRevisionRow | undefined;
  for (const row of ctx.db.realmWaterRevisionV1.iter()) {
    const activationTimestampIsConsistent = row.activated
      ? row.activatedAt !== undefined
        && row.activatedAt.microsSinceUnixEpoch >= row.seededAt.microsSinceUnixEpoch
      : row.activatedAt === undefined;
    if (
      found !== undefined
      || !matchesCanonicalGenesisWaterRevisionV1(row)
      || !activationTimestampIsConsistent
    ) fail('WATER_REVISION_METADATA_CONFLICT');
    found = row;
  }
  return found;
}

export function planGenesisWaterRevisionV1Seed(
  ctx: WarpkeepReducerContext,
): Readonly<{ revision: WaterRevisionRow | undefined }> {
  assertGenesisWaterRevisionBaseV1(ctx);
  return Object.freeze({ revision: inspectGenesisWaterRevisionV1(ctx) });
}

export function insertGenesisWaterRevisionV1(
  ctx: WarpkeepReducerContext,
): WaterRevisionRow {
  if (
    ctx.db.realmWaterRevisionV1.realmId.find(
      CANONICAL_GENESIS_WATER_REVISION_V1.realmId,
    ) !== null
  ) fail('WATER_REVISION_METADATA_CONFLICT');
  return ctx.db.realmWaterRevisionV1.insert({
    ...CANONICAL_GENESIS_WATER_REVISION_V1,
    activated: false,
    seededAt: ctx.timestamp,
    activatedAt: undefined,
  });
}

export function activateGenesisWaterRevisionV1(
  ctx: WarpkeepReducerContext,
): WaterRevisionRow {
  const plan = planGenesisWaterRevisionV1Seed(ctx);
  if (plan.revision === undefined) fail('WATER_REVISION_NOT_READY');
  if (plan.revision.activated) return plan.revision;
  return ctx.db.realmWaterRevisionV1.realmId.update({
    ...plan.revision,
    activated: true,
    activatedAt: ctx.timestamp,
  });
}

export function waterRevisionErrorCode(error: unknown): string | undefined {
  return error instanceof WaterRevisionAuthorityError ? error.code : undefined;
}
