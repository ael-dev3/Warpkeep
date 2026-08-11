import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1, requireGameplayReadPlayerV1 } from '../auth';
import {
  activateInnerKeep,
  backfillInnerKeepBuilders,
  deactivateInnerKeep,
  getMyInnerKeepRequestStatus,
  innerKeepEntryErrorCode,
  innerKeepErrorCode,
  inspectInnerKeep,
  planInnerKeepBuilderBackfill,
  planInnerKeepCatalogSeed,
  projectMyInnerKeepStateForIndexedReadV1,
  seedInnerKeepCatalog,
  startInnerKeepProject,
  synchronizeMyInnerKeepEntry,
  type InnerKeepActivationAttestation,
} from '../innerKeepAuthority';
import {
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
} from '../innerKeepLayoutPolicy';
import {
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_PROTOCOL_CAPABILITY,
} from '../innerKeepPolicy';
import warpkeep from '../schema';

const myInnerKeepStateV1 = t.object('MyInnerKeepStateV1', {
  castleId: t.u64(),
  componentActive: t.bool(),
  componentReady: t.bool(),
  builderPresent: t.bool(),
  builderBusy: t.bool(),
  activeBuildingKey: t.option(t.string()),
  busyUntilMicros: t.option(t.u64()),
  builderRevision: t.u64(),
  storedFood: t.u64(),
  storedWood: t.u64(),
  storedStone: t.u64(),
  storedGold: t.u64(),
  projectedFood: t.u64(),
  projectedWood: t.u64(),
  projectedStone: t.u64(),
  projectedGold: t.u64(),
  resourceRevision: t.u64(),
  observedAtMicros: t.u64(),
  policyVersion: t.string(),
  layoutDigest: t.string(),
  assetCatalogDigest: t.string(),
});

const myInnerKeepRequestStatusV1 = t.object('MyInnerKeepRequestStatusV1', {
  found: t.bool(),
  castleId: t.option(t.u64()),
  buildingKey: t.option(t.string()),
  buildingKind: t.option(t.string()),
  localXMicrounits: t.option(t.i64()),
  localZMicrounits: t.option(t.i64()),
  rotationMilliDegrees: t.option(t.u32()),
  targetLevel: t.option(t.u32()),
  deductedFood: t.option(t.u64()),
  deductedWood: t.option(t.u64()),
  deductedStone: t.option(t.u64()),
  deductedGold: t.option(t.u64()),
  startedAtMicros: t.option(t.u64()),
  policyVersion: t.option(t.string()),
});

const adminInnerKeepStatusV1 = t.object('AdminInnerKeepStatusV1', {
  layoutRows: t.u64(),
  slotRows: t.u64(),
  buildingCatalogRows: t.u64(),
  levelPolicyRows: t.u64(),
  castleRows: t.u64(),
  builderRows: t.u64(),
  buildingRows: t.u64(),
  activeProjects: t.u64(),
  receiptRows: t.u64(),
  scheduleRows: t.u64(),
  missingBuilders: t.u64(),
  orphanBuilders: t.u64(),
  invalidBuilders: t.u64(),
  invalidBuildings: t.u64(),
  invalidSchedules: t.u64(),
  builderProjectMismatches: t.u64(),
  staticCatalogExact: t.bool(),
  workerSystemReady: t.bool(),
  readyForCatalogSeed: t.bool(),
  readyForBuilderBackfill: t.bool(),
  readyForActivation: t.bool(),
  active: t.bool(),
  policyVersion: t.string(),
  policyDigest: t.string(),
  layoutPolicyVersion: t.string(),
  layoutDigest: t.string(),
  assetCatalogDigest: t.string(),
});

const adminInnerKeepCatalogPlanV1 = t.object('AdminInnerKeepCatalogPlanV1', {
  missingLayout: t.u32(),
  missingSlots: t.u32(),
  missingBuildings: t.u32(),
  missingLevels: t.u32(),
  ready: t.bool(),
});

const adminInnerKeepBuilderPlanV1 = t.object('AdminInnerKeepBuilderPlanV1', {
  expectedCastles: t.u32(),
  existingBuilders: t.u32(),
  missingBuilders: t.u32(),
  ready: t.bool(),
});

function senderInnerKeepError(error: unknown): never {
  const code = innerKeepErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('INNER_KEEP_REQUEST_FAILED');
}

function senderInnerKeepEntryError(error: unknown): never {
  const code = innerKeepEntryErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('INNER_KEEP_REQUEST_FAILED');
}

function audit(
  ctx: Parameters<typeof requireAdmin>[0],
  actorSubject: string,
  action: string,
  note: string,
): void {
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid: undefined,
    actorSubject,
    createdAt: ctx.timestamp,
    note,
  });
}

function requireStaticAttestation(input: Readonly<{
  capability: string;
  policyDigest: string;
  layoutDigest: string;
  assetCatalogDigest: string;
}>): void {
  if (
    input.capability !== INNER_KEEP_PROTOCOL_CAPABILITY
    || input.policyDigest !== INNER_KEEP_POLICY_DIGEST
    || input.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || input.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
  ) throw new SenderError('INNER_KEEP_ADMIN_ATTESTATION_INVALID');
}

type InnerKeepReadAuthority = ReturnType<typeof requireGameplayReadPlayerV1>;
type InnerKeepMutationAuthority = ReturnType<typeof requireGameplayPlayerV1>;

function sameTimestamp(
  left: Readonly<{ microsSinceUnixEpoch: bigint }>,
  right: Readonly<{ microsSinceUnixEpoch: bigint }>,
): boolean {
  return left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

/**
 * The overdue poll is the sole read procedure allowed to upgrade into a
 * mutation. Rebind every caller/castle/resource field so the complete gameplay
 * checkpoint cannot authorize a graph different from the indexed read that
 * selected the project.
 */
function requireSameInnerKeepMutationAuthority(
  read: InnerKeepReadAuthority,
  mutation: InnerKeepMutationAuthority,
): void {
  const readCastle = read.castle;
  const mutationCastle = mutation.castle;
  const readAccount = read.account;
  const mutationAccount = mutation.account;
  if (
    mutation.claims.fid !== read.claims.fid
    || mutationCastle.castleId !== readCastle.castleId
    || mutationCastle.ownerFid !== readCastle.ownerFid
    || mutationCastle.tileKey !== readCastle.tileKey
    || mutationCastle.q !== readCastle.q
    || mutationCastle.r !== readCastle.r
    || mutationCastle.level !== readCastle.level
    || mutationCastle.name !== readCastle.name
    || !sameTimestamp(mutationCastle.createdAt, readCastle.createdAt)
    || mutationAccount.fid !== readAccount.fid
    || mutationAccount.castleId !== readAccount.castleId
    || mutationAccount.realmId !== readAccount.realmId
    || mutationAccount.food !== readAccount.food
    || mutationAccount.wood !== readAccount.wood
    || mutationAccount.stone !== readAccount.stone
    || mutationAccount.gold !== readAccount.gold
    || mutationAccount.settledThroughMicros !== readAccount.settledThroughMicros
    || mutationAccount.revision !== readAccount.revision
    || mutationAccount.policyVersion !== readAccount.policyVersion
    || !sameTimestamp(mutationAccount.createdAt, readAccount.createdAt)
    || !sameTimestamp(mutationAccount.updatedAt, readAccount.updatedAt)
    || mutation.terrainKind !== read.terrainKind
    || mutation.founderSource !== read.founderSource
  ) throw new SenderError('STATE_INTEGRITY');
}

export const getMyInnerKeepStateV1 = warpkeep.procedure(
  { name: 'get_my_inner_keep_state_v1' },
  myInnerKeepStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const read = requireGameplayReadPlayerV1(tx);
      const { castle } = read;
      synchronizeMyInnerKeepEntry(tx, castle, () => {
        requireSameInnerKeepMutationAuthority(read, requireGameplayPlayerV1(tx));
      });
      return { ...projectMyInnerKeepStateForIndexedReadV1(tx, read) };
    } catch (error) {
      return senderInnerKeepEntryError(error);
    }
  }),
);

export const getMyInnerKeepRequestStatusV1 = warpkeep.procedure(
  { name: 'get_my_inner_keep_request_status_v1' },
  { requestKey: t.string() },
  myInnerKeepRequestStatusV1,
  (ctx, { requestKey }) => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayReadPlayerV1(tx);
      const receipt = getMyInnerKeepRequestStatus(tx, claims.fid, requestKey);
      if (receipt === undefined) {
        return {
          found: false,
          castleId: undefined,
          buildingKey: undefined,
          buildingKind: undefined,
          localXMicrounits: undefined,
          localZMicrounits: undefined,
          rotationMilliDegrees: undefined,
          targetLevel: undefined,
          deductedFood: undefined,
          deductedWood: undefined,
          deductedStone: undefined,
          deductedGold: undefined,
          startedAtMicros: undefined,
          policyVersion: undefined,
        };
      }
      return {
        found: true,
        castleId: receipt.castleId,
        buildingKey: receipt.buildingKey,
        buildingKind: receipt.buildingKind,
        localXMicrounits: receipt.localXMicrounits,
        localZMicrounits: receipt.localZMicrounits,
        rotationMilliDegrees: receipt.rotationMilliDegrees,
        targetLevel: receipt.targetLevel,
        deductedFood: receipt.deductedFood,
        deductedWood: receipt.deductedWood,
        deductedStone: receipt.deductedStone,
        deductedGold: receipt.deductedGold,
        startedAtMicros: receipt.startedAt.microsSinceUnixEpoch,
        policyVersion: receipt.policyVersion,
      };
    } catch (error) {
      return senderInnerKeepError(error);
    }
  }),
);

export const innerKeepStartProjectV1 = warpkeep.reducer(
  { name: 'inner_keep_start_project_v1' },
  {
    buildingKind: t.string(),
    localXMicrounits: t.i64(),
    localZMicrounits: t.i64(),
    rotationMilliDegrees: t.u32(),
    requestKey: t.string(),
    expectedTargetLevel: t.u32(),
    expectedProjectRevision: t.string(),
    expectedPolicyDigest: t.string(),
    expectedLayoutDigest: t.string(),
  },
  (ctx, {
    buildingKind,
    localXMicrounits,
    localZMicrounits,
    rotationMilliDegrees,
    requestKey,
    expectedTargetLevel,
    expectedProjectRevision,
    expectedPolicyDigest,
    expectedLayoutDigest,
  }) => {
    try {
      const { claims, castle } = requireGameplayPlayerV1(ctx);
      startInnerKeepProject(ctx, {
        fid: claims.fid,
        castle,
        buildingKind,
        localXMicrounits,
        localZMicrounits,
        rotationMilliDegrees,
        requestKey,
        expectedTargetLevel,
        expectedProjectRevision,
        expectedPolicyDigest,
        expectedLayoutDigest,
      });
    } catch (error) {
      return senderInnerKeepError(error);
    }
  },
);

export const adminGetInnerKeepStatusV1 = warpkeep.procedure(
  { name: 'admin_get_inner_keep_status_v1' },
  adminInnerKeepStatusV1,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    return { ...inspectInnerKeep(tx) };
  }),
);

export const adminPlanInnerKeepCatalogV1 = warpkeep.procedure(
  { name: 'admin_plan_inner_keep_catalog_v1' },
  adminInnerKeepCatalogPlanV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      return { ...planInnerKeepCatalogSeed(tx) };
    } catch (error) {
      return senderInnerKeepError(error);
    }
  }),
);

export const adminSeedInnerKeepCatalogV1 = warpkeep.reducer(
  { name: 'admin_seed_inner_keep_catalog_v1' },
  {
    capability: t.string(),
    policyDigest: t.string(),
    layoutDigest: t.string(),
    assetCatalogDigest: t.string(),
    expectedMissingLayout: t.u32(),
    expectedMissingSlots: t.u32(),
    expectedMissingBuildings: t.u32(),
    expectedMissingLevels: t.u32(),
  },
  (ctx, input) => {
    try {
      const admin = requireAdmin(ctx);
      requireStaticAttestation(input);
      const plan = planInnerKeepCatalogSeed(ctx);
      if (
        input.expectedMissingLayout !== plan.missingLayout
        || input.expectedMissingSlots !== plan.missingSlots
        || input.expectedMissingBuildings !== plan.missingBuildings
        || input.expectedMissingLevels !== plan.missingLevels
      ) throw new SenderError('INNER_KEEP_ADMIN_COUNTS_CHANGED');
      seedInnerKeepCatalog(ctx);
      audit(ctx, admin.subject, 'seed_inner_keep_catalog_v1', [
        `layout=${plan.missingLayout}`,
        `slots=${plan.missingSlots}`,
        `buildings=${plan.missingBuildings}`,
        `levels=${plan.missingLevels}`,
        `policy=${input.policyDigest}`,
        `layout_digest=${input.layoutDigest}`,
        `assets=${input.assetCatalogDigest}`,
        'active=false',
        'data_deletion=false',
      ].join(';'));
    } catch (error) {
      return senderInnerKeepError(error);
    }
  },
);

export const adminPlanInnerKeepBuildersV1 = warpkeep.procedure(
  { name: 'admin_plan_inner_keep_builders_v1' },
  adminInnerKeepBuilderPlanV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      return { ...planInnerKeepBuilderBackfill(tx) };
    } catch (error) {
      return senderInnerKeepError(error);
    }
  }),
);

export const adminBackfillInnerKeepBuildersV1 = warpkeep.reducer(
  { name: 'admin_backfill_inner_keep_builders_v1' },
  {
    capability: t.string(),
    policyDigest: t.string(),
    layoutDigest: t.string(),
    assetCatalogDigest: t.string(),
    expectedCastles: t.u32(),
    expectedExistingBuilders: t.u32(),
    expectedMissingBuilders: t.u32(),
  },
  (ctx, input) => {
    try {
      const admin = requireAdmin(ctx);
      requireStaticAttestation(input);
      const plan = planInnerKeepBuilderBackfill(ctx);
      if (
        input.expectedCastles !== plan.expectedCastles
        || input.expectedExistingBuilders !== plan.existingBuilders
        || input.expectedMissingBuilders !== plan.missingBuilders
      ) throw new SenderError('INNER_KEEP_ADMIN_COUNTS_CHANGED');
      backfillInnerKeepBuilders(ctx);
      audit(ctx, admin.subject, 'backfill_inner_keep_builders_v1', [
        `castles=${plan.expectedCastles}`,
        `existing=${plan.existingBuilders}`,
        `inserted=${plan.missingBuilders}`,
        'projects=0',
        'resources_unchanged=true',
        'workers_unchanged=true',
        'marks_unchanged=true',
      ].join(';'));
    } catch (error) {
      return senderInnerKeepError(error);
    }
  },
);

export const adminActivateInnerKeepV1 = warpkeep.reducer(
  { name: 'admin_activate_inner_keep_v1' },
  {
    capability: t.string(),
    policyDigest: t.string(),
    layoutDigest: t.string(),
    assetCatalogDigest: t.string(),
    clientRelease: t.string(),
    clientArtifactDigest: t.string(),
    moduleArtifactDigest: t.string(),
    sourceCommit: t.string(),
    expectedCastleCount: t.u32(),
  },
  (ctx, input) => {
    try {
      const admin = requireAdmin(ctx);
      const attestation: InnerKeepActivationAttestation = Object.freeze({ ...input });
      activateInnerKeep(ctx, attestation);
      audit(ctx, admin.subject, 'activate_inner_keep_v1', [
        `release=${input.clientRelease}`,
        `source=${input.sourceCommit}`,
        `client=${input.clientArtifactDigest}`,
        `module=${input.moduleArtifactDigest}`,
        `policy=${input.policyDigest}`,
        `layout=${input.layoutDigest}`,
        `assets=${input.assetCatalogDigest}`,
        `castles=${input.expectedCastleCount}`,
        'data_deletion=false',
      ].join(';'));
    } catch (error) {
      return senderInnerKeepError(error);
    }
  },
);

export const adminDeactivateInnerKeepV1 = warpkeep.reducer(
  { name: 'admin_deactivate_inner_keep_v1' },
  {
    capability: t.string(),
    expectedCastleCount: t.u32(),
    expectedActiveProjects: t.u32(),
  },
  (ctx, input) => {
    try {
      const admin = requireAdmin(ctx);
      // This is the authoritative compare-and-set boundary. A project start or
      // castle change committed after the operator's inspection is visible in
      // this transaction and makes the reducer fail before any row is updated.
      const aggregate = inspectInnerKeep(ctx);
      if (
        !aggregate.active
        || aggregate.castleRows !== BigInt(input.expectedCastleCount)
        || aggregate.activeProjects !== BigInt(input.expectedActiveProjects)
      ) throw new SenderError('INNER_KEEP_ADMIN_COUNTS_CHANGED');
      deactivateInnerKeep(ctx, input.capability);
      audit(ctx, admin.subject, 'deactivate_inner_keep_v1', [
        `capability=${input.capability}`,
        `castles=${input.expectedCastleCount}`,
        `active_projects=${input.expectedActiveProjects}`,
        'rows_preserved=true',
        'refunds=false',
        'data_deletion=false',
      ].join(';'));
    } catch (error) {
      return senderInnerKeepError(error);
    }
  },
);
