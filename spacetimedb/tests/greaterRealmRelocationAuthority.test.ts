import assert from 'node:assert/strict';
import {
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Loader, type Plugin } from 'esbuild';

import type * as FoundingAuthority from '../src/foundingAuthority';
import type * as RelocationAuthority from '../src/greaterRealmRelocationAuthority';
import type * as CutoverStatus from '../src/greaterRealmCutoverStatus';
import type * as CutoverAudit from '../src/greaterRealmCutoverAudit';
import type * as CastleWorkerAuthority from '../src/castleWorkerAuthority';
import type * as ProductionPlayerCanaryApproval from '../src/productionPlayerCanaryApproval';
import type * as ProductionPlayerCanaryBaseline from '../src/productionPlayerCanaryBaseline';
import type * as ProductionPlayerCanaryRecovery from '../src/productionPlayerCanaryRecovery';
import type * as ProductionPlayerCanaryEvidence from '../src/productionPlayerCanaryEvidence';
import type * as ProductionPlayerCanaryRoutePolicy from '../src/productionPlayerCanaryRoutePolicy';

import {
  assertGreaterRealmCurrentFounderForFidV1,
  greaterRealmCurrentPassiveTerrainV1,
} from '../src/greaterRealmCurrentAuthority';
import {
  GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION,
} from '../src/greaterRealmFoundingPolicy';
import {
  greaterRealmLegacyFoundingIsOpenV1,
  greaterRealmLegacyJourneyDispatchIsOpenV1,
} from '../src/greaterRealmActivationState';
import {
  captureGreaterRealmFrozenTopologyV1,
  captureGreaterRealmJourneyRowsDigestV1,
  captureGreaterRealmPreparedSnapshotV1,
  greaterRealmJourneyCountsV1,
  requireGreaterRealmQuietWindowV1,
} from '../src/greaterRealmRelocationSnapshot';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../src/resourceAuthorityPolicy';
import {
  CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
  CASTLE_WORKER_POLICY_VERSION,
  PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
  planCastleWorkerTimeline,
  rosterDigestForCastleIds,
  runBoundedDueCastleWorkerScheduleDrainV1,
  workerResourcePolicy,
} from '../src/castleWorkerPolicy';
import { expectedWorkerRowsForCastle } from '../src/castleWorkerRoster';
import {
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
} from '../src/productionPlayerCanaryRecoveryPolicy';
import { WARPKEEP_ALPHA_TERMS_VERSION } from '../src/entryAgreementPolicy';
import { ADMITTED_DAILY_MARK_POLICY_VERSION } from '../src/marksAuthorityPolicy';
import { CANONICAL_INNER_KEEP_LAYOUT } from '../src/innerKeepLayoutPolicy';
import { INNER_KEEP_POLICY_VERSION } from '../src/innerKeepPolicy';
import {
  GREATER_REALM_JOURNEY_TABLES,
  GREATER_REALM_TIER_ONE_REGION_IDS,
  selectGreaterRealmCastleAllocationV1,
} from '../src/greaterRealmActivationPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RUNTIME_PARTITION_VERSION,
  GREATER_REALM_UNASSIGNED_RANK,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';
import { attestCurrentGreaterRealmGateModeForTest } from './greaterRealmGateModeTestPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILE_META,
  CANONICAL_WORLD_TILES,
  HEGEMONY_REALM_ID,
} from '../src/world';

const repositoryRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));

function exactLocalSourcePath(
  importPath: string,
  resolveDir: string,
): string | undefined {
  const unresolved = isAbsolute(importPath)
    ? resolve(importPath)
    : resolve(resolveDir, importPath);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.json`,
    resolve(unresolved, 'index.ts'),
  ];
  for (const candidate of candidates) {
    const fromRoot = relative(repositoryRoot, candidate);
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      continue;
    }
    try {
      if (!statSync(candidate).isFile() || realpathSync(candidate) !== candidate) continue;
      return candidate;
    } catch {
      // Try the next exact extension candidate.
    }
  }
  return undefined;
}

const sdkRuntimeStub: Plugin = {
  name: 'warpkeep-stateful-host-read-runtime',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^spacetimedb(?:\/server)?$/ }, args => ({
      path: args.path,
      namespace: 'warpkeep-stateful-sdk',
    }));
    buildContext.onResolve({ filter: /^node:/ }, args => ({
      path: args.path,
      external: true,
    }));
    buildContext.onResolve({ filter: /.*/ }, args => {
      const localPath = exactLocalSourcePath(args.path, args.resolveDir);
      if (localPath === undefined) {
        return {
          errors: [{ text: `stateful bundle import rejected: ${args.path}` }],
        };
      }
      return { path: localPath, namespace: 'warpkeep-stateful-local' };
    });
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-stateful-sdk' },
      args => ({
        loader: 'js',
        contents: args.path === 'spacetimedb'
          ? `export const ScheduleAt = Object.freeze({
              time: (microsSinceUnixEpoch) => Object.freeze({
                tag: 'Time',
                value: Object.freeze({ microsSinceUnixEpoch })
              })
            });`
          : `export class SenderError extends Error {
              constructor(message) {
                super(message);
                this.name = 'SenderError';
              }
            }`,
      }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-stateful-local' },
      args => {
        const extension = extname(args.path);
        const loader: Loader = extension === '.tsx'
          ? 'tsx'
          : extension === '.ts'
            ? 'ts'
            : extension === '.json'
              ? 'json'
              : 'js';
        return {
          contents: readFileSync(args.path),
          loader,
          resolveDir: dirname(args.path),
        };
      },
    );
  },
};

async function loadExactProductionModule<Module>(sourceUrl: URL): Promise<Module> {
  const sourcePath = fileURLToPath(sourceUrl);
  const label = relative(repositoryRoot, sourcePath).split(sep).join('/');
  const trace = process.env.WARPKEEP_STATEFUL_BUNDLE_TRACE === '1';
  if (trace) process.stderr.write(`bundle:start:${label}\n`);
  const result = await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: 'node',
    plugins: [sdkRuntimeStub],
    stdin: {
      contents: `export * from ${JSON.stringify(sourcePath)};`,
      loader: 'js',
      resolveDir: repositoryRoot,
      sourcefile: `stateful-entry-${label.replaceAll('/', '-')}.mjs`,
    },
    target: 'node22',
    treeShaking: true,
    write: false,
  });
  if (trace) process.stderr.write(`bundle:built:${label}\n`);
  assert.equal(result.outputFiles.length, 1);
  assert.ok(Object.keys(result.metafile.inputs).some(
    input => input.endsWith(label),
  ));
  const encoded = Buffer.from(result.outputFiles[0]!.contents).toString('base64');
  const loaded = import(`data:text/javascript;base64,${encoded}`) as Promise<Module>;
  const module = await loaded;
  if (trace) process.stderr.write(`bundle:imported:${label}\n`);
  return module;
}

const {
  ensureGenesisFounder,
  assertGenesisFounderForProfileRepair,
} = await loadExactProductionModule<typeof FoundingAuthority>(
  new URL('../src/foundingAuthority.ts', import.meta.url),
);
const {
  beginGreaterRealmDrainAuthorizedTransactionV1,
  commitGreaterRealmActiveAuthorizedTransactionV1,
  freezeGreaterRealmActivationAuthorizedTransactionV1,
  haltGreaterRealmActivationAuthorizedTransactionV1,
  planGreaterRealmRelocationAuthorizedTransactionV1,
  prepareGreaterRealmActivationAuthorizedTransactionV1,
  relocateGreaterRealmCanaryAuthorizedTransactionV1,
  resumeGreaterRealmActiveAuthorizedTransactionV1,
  rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1,
} = await loadExactProductionModule<typeof RelocationAuthority>(
  new URL('../src/greaterRealmRelocationAuthority.ts', import.meta.url),
);
const {
  projectGreaterRealmCutoverStatusV1,
  projectGreaterRealmReenableStatusV1,
} = await loadExactProductionModule<typeof CutoverStatus>(
  new URL('../src/greaterRealmCutoverStatus.ts', import.meta.url),
);
const {
  GREATER_REALM_CUTOVER_AUDIT_NOTE_V1,
  runGreaterRealmCutoverTransitionWithAuditV1,
} = await loadExactProductionModule<typeof CutoverAudit>(
  new URL('../src/greaterRealmCutoverAudit.ts', import.meta.url),
);
const {
  dispatchGreaterRealmCastleWorkerV2,
  inspectCastleWorkerGraph,
  inspectCastleWorkerGraphForCurrentGameplayV1,
  projectMyGreaterRealmWorkerStateV2,
  projectMyWorkerStateForCurrentGameplayV1,
  recallAllCastleWorkers,
  recallCastleWorker,
  recallCastleWorkerForExactCanaryAssignment,
  runCastleWorkerSchedule,
  settleAllWorkerAssignmentsForFid,
} = await loadExactProductionModule<typeof CastleWorkerAuthority>(
  new URL('../src/castleWorkerAuthority.ts', import.meta.url),
);
const {
  captureProductionPlayerCanaryBaseline,
  inspectProductionPlayerCanaryRoutePlan,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryBaseline>(
  new URL('../src/productionPlayerCanaryBaseline.ts', import.meta.url),
);
const {
  productionPlayerCanaryOwnerApprovalCommitmentV1,
  registerProductionPlayerCanaryApprovalV1,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryApproval>(
  new URL('../src/productionPlayerCanaryApproval.ts', import.meta.url),
);
const {
  productionPlayerCanaryCommandAuthorityV2,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryRoutePolicy>(
  new URL('../src/productionPlayerCanaryRoutePolicy.ts', import.meta.url),
);
const {
  assertProductionPlayerCanaryGenericWorkerWriteAvailableV2,
  dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1,
  inspectProductionPlayerCanaryRecoveryStatusV1,
  recallProductionPlayerCanaryWorkerV1,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryRecovery>(
  new URL('../src/productionPlayerCanaryRecovery.ts', import.meta.url),
);
const {
  inspectProductionPlayerCanaryAdminEvidence,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryEvidence>(
  new URL('../src/productionPlayerCanaryEvidence.ts', import.meta.url),
);

type Row = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryTable {
  rows: Row[];
  readonly primary: string;
  readonly indexFields: Readonly<Record<string, string | readonly string[]>>;
  readonly uniqueFields: ReadonlySet<string>;
  readonly autoInc: boolean;
  nextAutoInc = 1n;
  mutate: () => void;
  [key: string]: any;

  constructor(
    primary: string,
    indexFields: Readonly<Record<string, string | readonly string[]>> = {},
    rows: readonly Row[] = [],
    autoInc = false,
  ) {
    this.primary = primary;
    this.indexFields = { [primary]: primary, ...indexFields };
    this.uniqueFields = new Set([
      primary,
      ...Object.entries(indexFields)
        .filter(([accessor, field]) => (
          !accessor.startsWith('by') && typeof field === 'string'
        ))
        .map(([, field]) => field as string),
    ]);
    this.rows = clone(rows as Row[]);
    this.autoInc = autoInc;
    this.mutate = () => {};
    for (const [accessor, field] of Object.entries(this.indexFields)) {
      const matches = (row: Row, value: unknown) => Array.isArray(field)
        ? Array.isArray(value)
          && value.length === field.length
          && field.every((column, index) => row[column] === value[index])
        : row[field as string] === value;
      this[accessor] = {
        find: (value: unknown) => this.rows.find(row => matches(row, value)) ?? null,
        filter: (value: unknown) => this.rows.filter(row => matches(row, value)),
        update: (next: Row) => {
          this.mutate();
          const key = Array.isArray(field)
            ? field.map(column => next[column])
            : next[field as string];
          const index = this.rows.findIndex(row => matches(row, key));
          if (index < 0) throw new Error(`missing update ${accessor}`);
          this.rows[index] = clone(next);
          return this.rows[index];
        },
        delete: (value: unknown) => {
          this.mutate();
          const index = this.rows.findIndex(row => matches(row, value));
          if (index < 0) return false;
          this.rows.splice(index, 1);
          return true;
        },
      };
    }
  }

  count(): bigint {
    return BigInt(this.rows.length);
  }

  iter(): Iterable<Row> {
    return clone(this.rows);
  }

  insert(row: Row): Row {
    this.mutate();
    const inserted = clone(row);
    if (this.autoInc && inserted[this.primary] === 0n) {
      const currentMaximum = this.rows.reduce(
        (maximum, existing) => existing[this.primary] > maximum
          ? existing[this.primary] as bigint
          : maximum,
        0n,
      );
      if (this.nextAutoInc <= currentMaximum) {
        this.nextAutoInc = currentMaximum + 1n;
      }
      inserted[this.primary] = this.nextAutoInc;
      this.nextAutoInc += 1n;
    }
    if (this.rows.some(existing => existing[this.primary] === inserted[this.primary])) {
      throw new Error(`duplicate ${this.primary}`);
    }
    for (const field of this.uniqueFields) {
      if (
        field !== this.primary
        && this.rows.some(existing => existing[field] === inserted[field])
        && inserted[field] !== undefined
      ) throw new Error(`duplicate ${field}`);
    }
    this.rows.push(inserted);
    return inserted;
  }
}

function empty(
  primary = 'id',
  indexes: Readonly<Record<string, string | readonly string[]>> = {},
  autoInc = false,
): MemoryTable {
  return new MemoryTable(primary, indexes, [], autoInc);
}

function timestamp(microsSinceUnixEpoch: bigint) {
  return { microsSinceUnixEpoch };
}

const NOW = timestamp(10_000n);
const CREATED = timestamp(1n);
const ACTIVATED = timestamp(2n);
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function opaqueSuffix(value: number): string {
  let remaining = value;
  let encoded = '';
  do {
    encoded = BASE32[remaining % BASE32.length]! + encoded;
    remaining = Math.floor(remaining / BASE32.length);
  } while (remaining > 0);
  return encoded.padStart(26, 'A');
}

function makeRegions() {
  return GREATER_REALM_PUBLIC_REGIONS.map((region, index) => ({
    regionId: region.id,
    publicName: region.name,
    ordinal: region.ordinal,
    tier: 1,
    cellCount: index === 0 ? 101 : 100,
    passableCellCount: 100,
    chunkCount: 1,
    castleCapacity: 100,
    resourceLocationCount: 2_000,
    resourceNodeCount: 2_000,
    foodNodeCount: 500,
    woodNodeCount: 500,
    stoneNodeCount: 500,
    goldNodeCount: 500,
    active: false,
  }));
}

function tableSet(): Record<string, MemoryTable> {
  return {
    allowedFid: empty('fid'),
    worldTile: empty('key'),
    player: empty('fid'),
    castle: new MemoryTable(
      'castleId',
      { ownerFid: 'ownerFid', tileKey: 'tileKey' },
      [],
      true,
    ),
    adminAudit: empty('id', {}, true),
    playerV2: empty('fid'),
    playerOwnershipV2: empty('fid', { identity: 'identity' }),
    realmV1: empty('realmId'),
    worldTileMetaV1: empty('tileKey'),
    castleSlotV1: empty('slotId', { tileKey: 'tileKey' }),
    castleSlotClaimV1: empty('slotId', { ownerFid: 'ownerFid', castleId: 'castleId' }),
    realmProfileV1: empty('fid'),
    markAccountV1: empty('fid'),
    snapBurnCreditV1: empty('eventKey'),
    fidWalletAttributionV1: empty('snapshotAttributionKey'),
    walletAttributionSnapshotV1: empty('snapshotKey'),
    snapScanCursorV1: empty('cursorKey'),
    snapScanBatchV1: empty('batchId'),
    alphaTermsAcceptanceV1: empty('acceptanceKey'),
    resourceAccountV1: empty('fid', { castleId: 'castleId' }),
    goldSiteV1: empty('siteId'),
    goldNodeOccupationV1: empty('siteId', { byOriginCastle: 'originCastleId' }),
    goldExpeditionV1: empty('expeditionId', { fid: 'fid' }),
    goldExpeditionIdempotencyV1: empty('requestKey', { fid: 'fid' }),
    goldExpeditionScheduleV1: empty('scheduleId', { originCastleId: 'originCastleId' }),
    realmForestLayoutV1: empty('realmId'),
    realmForestInstanceV1: empty('tileKey'),
    foodSiteV1: empty('siteId'),
    foodNodeOccupationV1: empty('siteId', { byOriginCastle: 'originCastleId' }),
    foodExpeditionV1: empty('expeditionId', { fid: 'fid' }),
    foodExpeditionIdempotencyV1: empty('requestKey', { fid: 'fid' }),
    foodExpeditionScheduleV1: empty('scheduleId', { originCastleId: 'originCastleId' }),
    woodSiteV1: empty('siteId'),
    woodNodeOccupationV1: empty('siteId', { byOriginCastle: 'originCastleId' }),
    woodExpeditionV1: empty('expeditionId', { fid: 'fid' }),
    woodExpeditionIdempotencyV1: empty('requestKey', { fid: 'fid' }),
    woodExpeditionScheduleV1: empty('scheduleId', { originCastleId: 'originCastleId' }),
    realmWaterLayoutV1: empty('realmId'),
    realmWaterBodyV1: empty('bodyId'),
    realmWaterCellV1: empty('cellKey'),
    realmEnvironmentV1: empty('realmId'),
    stoneSiteV1: empty('siteId'),
    stoneNodeOccupationV1: empty('siteId', { byOriginCastle: 'originCastleId' }),
    stoneExpeditionV1: empty('expeditionId', { fid: 'fid' }),
    stoneExpeditionIdempotencyV1: empty('requestKey', { fid: 'fid' }),
    stoneExpeditionScheduleV1: empty('scheduleId', { originCastleId: 'originCastleId' }),
    realmWaterRevisionV1: empty('realmId'),
    realmWorkerSystemV1: empty('realmId'),
    castleWorkerV1: empty('workerId', { byOriginCastle: 'originCastleId' }),
    workerAssignmentV1: empty(
      'assignmentId',
      { workerId: 'workerId', byFid: 'fid' },
    ),
    workerNodeOccupationV1: empty(
      'nodeKey',
      { byWorker: 'workerId', byOriginCastle: 'originCastleId' },
    ),
    workerCommandIdempotencyV1: empty(
      'requestKey',
      { byFid: 'fid' },
    ),
    workerAssignmentScheduleV1: empty(
      'scheduleId',
      { byAssignment: 'assignmentId', byWorker: 'workerId' },
      true,
    ),
    accessRequestV1: empty('fid'),
    dailyMarkGrantV1: empty('grantKey'),
    dailyMarkScheduleV1: empty('scheduleId'),
    innerKeepLayoutV1: empty('layoutId'),
    innerKeepSlotV1: empty('slotId'),
    innerKeepBuildingCatalogV1: empty('buildingKind'),
    innerKeepBuildLevelV1: empty('levelKey'),
    castleInnerKeepBuildingV1: empty('buildingKey'),
    castleInnerBuilderV1: empty('castleId', { fid: 'fid' }),
    castleInnerBuildReceiptV1: empty('receiptKey'),
    castleInnerConstructionScheduleV1: empty('scheduleId'),
    realmChatStatusV1: empty('channelKey'),
    realmChatChannelV1: empty('channelKey'),
    realmChatMessageV1: empty('messageId'),
    realmChatRecentV1: empty('sequence'),
    realmChatRateEventV1: empty('eventId'),
    realmChatSendReceiptV1: empty('operationKey'),
    realmChatReportV1: empty('reportOrdinal'),
    realmChatReportRateEventV1: empty('eventId'),
    greaterRealmReleaseV1: empty('atlasId'),
    greaterRealmChunkV1: empty('chunkHandle', { importOrdinal: 'importOrdinal' }),
    greaterRealmNavigationComponentV1: empty('componentKey', { componentOrdinal: 'componentOrdinal' }),
    greaterRealmCellV1: empty(
      'cellKey',
      { releaseOrdinal: 'releaseOrdinal', atlasCoordKey: 'atlasCoordKey' },
    ),
    greaterRealmCastleSlotV1: empty('slotId', { releaseOrdinal: 'releaseOrdinal' }),
    greaterRealmCastleClaimV1: empty('slotId', { ownerFid: 'ownerFid', castleId: 'castleId' }),
    greaterRealmCellOccupancyV1: empty('cellKey', { castleId: 'castleId' }),
    greaterRealmResourceNodeV1: empty(
      'nodeId',
      {
        releaseOrdinal: 'releaseOrdinal',
        locationId: 'locationId',
        byComponentAndResourceKind: ['componentKey', 'resourceKind'],
      },
    ),
    greaterRealmActivationV1: empty('activationId'),
    realmAtlasV1: empty('atlasId'),
    realmAtlasVisibleRegionV1: empty('regionId'),
    realmWorkerSystemV2: empty('atlasId'),
    productionPlayerCanaryBaselineV1: empty('challengeDigest', {
      fid: 'fid',
      baselineCommitment: 'baselineCommitment',
      routeSetCommitment: 'routeSetCommitment',
    }),
    productionPlayerCanaryApprovalRegistrationV1: empty('challengeDigest', {
      fid: 'fid',
      serverBaselineCommitment: 'serverBaselineCommitment',
      routeSetCommitment: 'routeSetCommitment',
      commandSetCommitment: 'commandSetCommitment',
      ownerApprovalArtifactDigest: 'ownerApprovalArtifactDigest',
      ownerApprovalCommitment: 'ownerApprovalCommitment',
      approvalRegistrationCommitment: 'approvalRegistrationCommitment',
    }),
  };
}

class Fixture {
  readonly tables = tableSet();
  readonly ctx: any;
  mutationCount = 0;
  faultAt: number | undefined;
  uuidSequence = 0;

  constructor() {
    this.ctx = {
      db: this.tables,
      timestamp: NOW,
      newUuidV7: () => ({
        toString: () => `00000000-0000-7000-8000-${String(++this.uuidSequence).padStart(12, '0')}`,
      }),
    };
    for (const table of Object.values(this.tables)) {
      table.mutate = () => {
        this.mutationCount += 1;
        if (this.faultAt === this.mutationCount) throw new Error('INJECTED_TRANSACTION_FAULT');
      };
    }
    this.seed();
    this.mutationCount = 0;
  }

  private seed(): void {
    const db = this.tables;
    db.realmV1.rows = [{ ...CANONICAL_REALM, createdAt: CREATED }];
    db.worldTileMetaV1.rows = CANONICAL_WORLD_TILE_META.map(row => ({ ...row }));
    db.castleSlotV1.rows = CANONICAL_CASTLE_SLOTS.map(row => ({ ...row }));
    const occupants = new Map(
      CANONICAL_CASTLE_SLOTS.map((slot, index) => [slot.tileKey, BigInt(index + 1)]),
    );
    db.worldTile.rows = CANONICAL_WORLD_TILES.map(row => ({
      ...row,
      occupantCastleId: occupants.get(row.key),
    }));
    for (let index = 0; index < 100; index += 1) {
      const fid = BigInt(1_001 + index);
      const castleId = BigInt(index + 1);
      const slot = CANONICAL_CASTLE_SLOTS[index]!;
      const castle = {
        castleId,
        ownerFid: fid,
        tileKey: slot.tileKey,
        q: slot.q,
        r: slot.r,
        level: 1,
        name: `Hegemony Keep ${String(index + 1).padStart(3, '0')}`,
        createdAt: CREATED,
      };
      db.allowedFid.rows.push({
        fid, enabled: true, authEpoch: 1, invitedAt: CREATED,
        invitedBy: 'fixture', note: 'fixture',
      });
      db.castle.rows.push(castle);
      db.castleSlotClaimV1.rows.push({
        slotId: slot.slotId,
        ownerFid: fid,
        castleId,
        claimedAt: CREATED,
        generationVersion: slot.generationVersion,
      });
      db.realmProfileV1.rows.push({
        fid,
        canonicalUsername: `founder${index + 1}`,
        displayName: `Founder ${index + 1}`,
        pfpUrl: undefined,
        publicBio: undefined,
        admittedAt: CREATED,
        firstAuthenticatedAt: undefined,
        profileUpdatedAt: CREATED,
        publicStatus: 'founded',
        communityStatsVisible: false,
        totalSnapBurnedMicros: undefined,
        marksEarnedMicros: undefined,
        marksSpentMicros: undefined,
        marksBalanceMicros: undefined,
        marksPolicyVersion: undefined,
      });
      db.markAccountV1.rows.push({
        fid,
        totalSnapBurnedMicros: 0n,
        earnedMicros: 0n,
        spentMicros: 0n,
        balanceMicros: 0n,
        policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
        updatedAt: CREATED,
      });
      db.resourceAccountV1.rows.push({
        fid,
        castleId,
        realmId: HEGEMONY_REALM_ID,
        food: BigInt(index),
        wood: BigInt(index + 1),
        stone: BigInt(index + 2),
        gold: BigInt(index + 3),
        settledThroughMicros: 1n,
        revision: BigInt(index),
        policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
        createdAt: CREATED,
        updatedAt: ACTIVATED,
      });
      db.castleWorkerV1.rows.push(...expectedWorkerRowsForCastle(castle).map(row => ({ ...row })));
    }
    const rosterCastleIds = db.castle.rows.map(row => row.castleId as bigint);
    db.realmWorkerSystemV1.rows = [{
      realmId: HEGEMONY_REALM_ID,
      policyVersion: CASTLE_WORKER_POLICY_VERSION,
      workersPerCastle: 4,
      expectedCastleCount: 100,
      expectedWorkerCount: 400,
      rosterDigest: rosterDigestForCastleIds(rosterCastleIds),
      mode: 'active',
      legacyDrainRequired: false,
      createdAt: CREATED,
      activatedAt: ACTIVATED,
    }];

    db.accessRequestV1.rows = [{ fid: 1_001n, requestCycle: 2n, requestedAt: CREATED }];
    db.dailyMarkGrantV1.rows = [{
      grantKey: '1001:0', fid: 1_001n, utcDay: 0n, amountMicros: 1_000_000n,
      policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION, grantedAt: CREATED,
    }];
    db.dailyMarkScheduleV1.rows = [{
      scheduleId: 1n,
      scheduledAt: { tag: 'Time', value: ACTIVATED },
      policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    }];
    db.innerKeepLayoutV1.rows = [{
      layoutId: 'fixture-layout', layoutVersion: 1, policyVersion: 'fixture-v1',
      slotCount: 0, mediumSlotCount: 0, largeSlotCount: 0,
      assetCatalogDigest: SHA_A, layoutDigest: SHA_B, active: true,
      createdAt: CREATED, activatedAt: ACTIVATED,
    }];
    db.castleInnerBuilderV1.rows = [{
      castleId: 1n, fid: 1_001n, activeBuildingKey: undefined,
      busyUntilMicros: undefined, revision: 0n, policyVersion: 'fixture-v1',
      createdAt: CREATED, updatedAt: CREATED,
    }];
    db.realmChatStatusV1.rows = [{
      channelKey: 'realm', realmId: HEGEMONY_REALM_ID, policyVersion: 'fixture-v1',
      mode: 'active', recentLimit: 50, historyPageLimit: 50, updatedAt: CREATED,
    }];
    db.realmChatChannelV1.rows = [{
      channelKey: 'realm', realmId: HEGEMONY_REALM_ID, policyVersion: 'fixture-v1',
      mode: 'active', nextSequence: 1n, pendingReports: 0, updatedAt: CREATED,
    }];
    db.realmChatMessageV1.rows = [{
      messageId: 'message-1', sequence: 0n, channelKey: 'realm', senderFid: 1_001n,
      body: 'fixture', sentAt: CREATED, visibility: 'visible',
      moderatedAt: undefined, moderationCode: undefined,
    }];
    db.realmChatRecentV1.rows = [{
      sequence: 0n, messageId: 'message-1', channelKey: 'realm',
      senderFid: 1_001n, body: 'fixture', sentAt: CREATED, visibility: 'visible',
    }];
    // Sentinels in otherwise unrelated schema areas make the whole-state
    // mutation allowlist sensitive to accidental cross-domain writes.
    db.adminAudit.rows = [{ id: 1n, eventKind: 'relocation-test-sentinel' }];
    db.goldSiteV1.rows = [{ siteId: 'gold-site-sentinel', sentinel: true }];
    db.foodSiteV1.rows = [{ siteId: 'food-site-sentinel', sentinel: true }];
    db.stoneSiteV1.rows = [{ siteId: 'stone-site-sentinel', sentinel: true }];
    db.realmForestLayoutV1.rows = [{ realmId: HEGEMONY_REALM_ID, sentinel: true }];
    db.realmForestInstanceV1.rows = [{ tileKey: 'forest-sentinel', sentinel: true }];
    db.realmWaterLayoutV1.rows = [{ realmId: HEGEMONY_REALM_ID, sentinel: true }];
    db.realmWaterBodyV1.rows = [{ bodyId: 'water-body-sentinel', sentinel: true }];
    db.realmWaterCellV1.rows = [{ cellKey: 'water-cell-sentinel', sentinel: true }];
    db.realmEnvironmentV1.rows = [{ realmId: HEGEMONY_REALM_ID, sentinel: true }];
    db.realmWaterRevisionV1.rows = [{ realmId: HEGEMONY_REALM_ID, sentinel: true }];

    const atlasId = 'GRA-FIXTURE';
    const regions = makeRegions();
    db.greaterRealmReleaseV1.rows = [{
      atlasId,
      publicReleaseId: 'GRP-FIXTURE',
      publicApprovalReceiptId: 'APR-FIXTURE',
      sourceCommit: 'c'.repeat(40),
      generatorVersion: 'greater-realm-v1',
      sourceFormatVersion: 'runtime-v1',
      livingWorldVersion: 'living-v1',
      runtimePartitionVersion: GREATER_REALM_RUNTIME_PARTITION_VERSION,
      rendererContractVersion: 'renderer-v1',
      expectedRegionCount: 6,
      expectedComponentCount: 6,
      expectedChunkCount: 6,
      expectedCellCount: 601,
      expectedSlotCount: 600,
      expectedResourceNodeCount: 12_000,
      componentExpectedCellCount: 600,
      componentExpectedSlotCount: 600,
      componentExpectedResourceNodeCount: 12_000,
      importedPassableCellCount: 600,
      expectedReleaseSha256: SHA_A,
      releaseHeaderSha256: SHA_B,
      importEpoch: 1n,
      publicName: 'The Greater Realm',
      componentManifestJson: '[]\n',
      regionManifestJson: `${JSON.stringify(regions)}\n`,
      regionVerificationJson: '[]\n',
      legacyTransformRotation: 0,
      legacyTransformOffsetQ: 0,
      legacyTransformOffsetR: 0,
      verifiedLegacyCellCount: 10_000,
      verifiedLegacyWaterCellCount: 3_271,
      legacyWaterBodyVerificationJson: '{}\n',
      legacyResourceVerificationJson: '{}\n',
      nextChunkOrdinal: 6,
      verificationPhase: 'complete',
      verificationCursor: 0n,
      verificationDigest: SHA_B,
      verifiedComponentCount: 6,
      verifiedChunkCount: 6,
      verifiedCellCount: 601,
      verifiedSlotCount: 600,
      verifiedResourceNodeCount: 12_000,
      state: 'ready',
      approvedAt: CREATED,
      stagedAt: CREATED,
      readyAt: ACTIVATED,
    }];
    for (let regionIndex = 0; regionIndex < 6; regionIndex += 1) {
      const region = GREATER_REALM_PUBLIC_REGIONS[regionIndex]!;
      const componentKey = `GRC-${opaqueSuffix(regionIndex)}`;
      db.greaterRealmNavigationComponentV1.rows.push({
        componentKey, atlasId, componentOrdinal: regionIndex,
        regionId: region.id,
        tier: 1,
        rootCellKey: `${region.id}:0:0`,
        cellCount: 100,
        expectedFoodNodeCount: 500,
        expectedWoodNodeCount: 500,
        expectedStoneNodeCount: 500,
        expectedGoldNodeCount: 500,
        active: true,
      });
      db.greaterRealmChunkV1.rows.push({
        chunkHandle: `GRK-${opaqueSuffix(regionIndex)}`,
        atlasId,
        importOrdinal: regionIndex,
      });
      for (let rank = 0; rank < 100; rank += 1) {
        const releaseOrdinal = regionIndex * 100 + rank;
        const cellKey = `${region.id}:${rank}:0`;
        const slotId = `GRS-${opaqueSuffix(releaseOrdinal)}`;
        db.greaterRealmCellV1.rows.push({
          cellKey,
          atlasCoordKey: `A:${10_000 + releaseOrdinal}:${-5_000 - releaseOrdinal}`,
          releaseOrdinal,
          atlasId,
          chunkHandle: `GRK-${opaqueSuffix(regionIndex)}`,
          regionId: region.id,
          componentKey,
          localQ: rank,
          localR: 0,
          atlasQ: 10_000 + releaseOrdinal,
          atlasR: -5_000 - releaseOrdinal,
          tier: 1,
          passable: true,
          yieldClass: releaseOrdinal % 2 === 0 ? 2 : 1,
          routeDepth: rank,
          routeParentDirection: rank === 0 ? undefined : 4,
          sealedBoundaryMask: 0,
        });
        db.greaterRealmCastleSlotV1.rows.push({
          slotId,
          releaseOrdinal,
          atlasId,
          cellKey,
          regionId: region.id,
          componentKey,
          legacySlotId: regionIndex === 0 ? rank + 1 : undefined,
          tier: 1,
          regionOrderRank: rank,
          allocationRank: releaseOrdinal,
          active: false,
        });
      }
    }
    db.greaterRealmCellV1.rows.push({
      cellKey: 'T1_LOWLANDS:impassable:0',
      atlasCoordKey: 'A:99999:-99999',
      releaseOrdinal: 600,
      atlasId,
      chunkHandle: `GRK-${opaqueSuffix(0)}`,
      regionId: GREATER_REALM_PUBLIC_REGIONS[0]!.id,
      componentKey: `GRC-${opaqueSuffix(0)}`,
      localQ: 100,
      localR: 0,
      atlasQ: 99_999,
      atlasR: -99_999,
      tier: 1,
      passable: false,
      yieldClass: 0,
      routeDepth: 0,
      routeParentDirection: undefined,
      sealedBoundaryMask: 0,
    });
    let resourceOrdinal = 0;
    for (const region of GREATER_REALM_PUBLIC_REGIONS) {
      for (const kind of ['food', 'wood', 'stone', 'gold']) {
        for (let index = 0; index < 500; index += 1) {
          db.greaterRealmResourceNodeV1.rows.push({
            nodeId: `GRN-${String(resourceOrdinal).padStart(5, '0')}`,
            releaseOrdinal: resourceOrdinal,
            atlasId,
            locationId: `GRL-${opaqueSuffix(100_000 + resourceOrdinal)}`,
            cellKey: `${region.id}:${index % 100}:0`,
            regionId: region.id,
            componentKey: `GRC-${opaqueSuffix(region.ordinal)}`,
            resourceKind: kind,
            tier: 1,
            nodeOrdinal: 0,
            allocationRank: GREATER_REALM_UNASSIGNED_RANK,
            legacyCatalogId: region.ordinal === 0 ? `${kind}-${index}` : undefined,
            policyVersion: 'fixture-v1',
            active: false,
          });
          resourceOrdinal += 1;
        }
      }
    }
  }

  snapshot(): Record<string, Row[]> {
    return Object.fromEntries(Object.entries(this.tables).map(([name, table]) => (
      [name, clone(table.rows)]
    )));
  }

  restore(snapshot: Record<string, Row[]>): void {
    for (const [name, rows] of Object.entries(snapshot)) this.tables[name]!.rows = clone(rows);
  }

  transaction<T>(work: () => T, faultAt?: number): T {
    const before = this.snapshot();
    const uuidSequenceBefore = this.uuidSequence;
    const autoIncBefore = Object.fromEntries(Object.entries(this.tables).map(
      ([name, table]) => [name, table.nextAutoInc],
    ));
    this.mutationCount = 0;
    this.faultAt = faultAt;
    try {
      const result = work();
      this.faultAt = undefined;
      return result;
    } catch (error) {
      this.restore(before);
      this.uuidSequence = uuidSequenceBefore;
      for (const [name, next] of Object.entries(autoIncBefore)) {
        this.tables[name]!.nextAutoInc = next;
      }
      this.faultAt = undefined;
      throw error;
    }
  }
}

function stateText(fixture: Fixture): string {
  return JSON.stringify(fixture.snapshot(), (_key, value) => (
    typeof value === 'bigint' ? `${value.toString()}n` : value
  ));
}

/**
 * Normalize only the tables/fields the relocation transaction owns. Every
 * other seeded table and every unlisted field must remain byte-identical.
 */
function stateOutsideRelocationWrites(
  snapshot: Record<string, Row[]>,
  transition: 'canary' | 'rollback',
): Record<string, Row[]> {
  const result = clone(snapshot);
  for (const row of result.castle!) {
    delete row.tileKey;
    delete row.q;
    delete row.r;
  }
  for (const row of result.worldTile!) delete row.occupantCastleId;
  for (const row of result.realmV1!) delete row.active;
  for (const row of result.greaterRealmReleaseV1!) delete row.state;
  for (const tableName of [
    'greaterRealmCastleSlotV1',
    'greaterRealmResourceNodeV1',
  ]) {
    for (const row of result[tableName]!) delete row.active;
  }
  if (transition === 'canary') {
    for (const row of result.greaterRealmCastleClaimV1!) {
      delete row.state;
      delete row.activatedAt;
    }
  } else {
    delete result.greaterRealmCastleClaimV1;
  }
  for (const tableName of [
    'castleSlotClaimV1',
    'greaterRealmCellOccupancyV1',
    'greaterRealmActivationV1',
    'realmAtlasV1',
    'realmAtlasVisibleRegionV1',
    'realmWorkerSystemV2',
  ]) delete result[tableName];
  return result;
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function advanceToPlanned(fixture: Fixture): void {
  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'prepared');
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'planned');
}

function advanceToActive(fixture: Fixture): void {
  advanceToPlanned(fixture);
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
}

function enableCanonicalInnerKeep(fixture: Fixture): void {
  fixture.tables.innerKeepLayoutV1.rows = [{
    ...CANONICAL_INNER_KEEP_LAYOUT,
    active: true,
    createdAt: CREATED,
    activatedAt: ACTIVATED,
  }];
}

function insertIntendedAdmission(fixture: Fixture, fid: bigint): void {
  fixture.tables.allowedFid.insert({
    fid,
    enabled: true,
    authEpoch: 1,
    invitedAt: fixture.ctx.timestamp,
    invitedBy: 'admin:fixture',
    note: 'profiled admission fixture',
  });
}

function admissionProfileFor(fid: bigint) {
  return Object.freeze({
    canonicalUsername: `futurefounder${fid.toString()}`,
    displayName: `Future Founder ${fid.toString()}`,
    pfpUrl: `https://example.com/founder-${fid.toString()}.png`,
    publicBio: undefined,
  });
}

function prepareGreaterRealmWorkerLocation(
  fixture: Fixture,
  resourceKind: 'food' | 'wood' | 'stone' | 'gold',
  nodeCount = 2,
  fid = 1_001n,
  nodeOrdinalStart = 0,
): Readonly<{ locationId: string; destinationCellKey: string }> {
  assert.ok(nodeCount >= 1 && nodeCount <= 32);
  assert.ok(nodeOrdinalStart >= 0);
  const founder = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  assert.equal(founder.source, 'v17');
  const origin = fixture.tables.greaterRealmCellV1.cellKey.find(founder.castle.tileKey)!;
  const destination = fixture.tables.greaterRealmCellV1.rows.find(row => (
    row.componentKey === origin.componentKey && row.cellKey !== origin.cellKey
  ))!;
  const groupCandidates = fixture.tables.greaterRealmResourceNodeV1.rows
    .filter(row => (
      row.regionId === destination.regionId
      && row.componentKey === destination.componentKey
      && row.resourceKind === resourceKind
    ))
    .sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
  const candidates = groupCandidates.slice(nodeOrdinalStart, nodeOrdinalStart + nodeCount);
  assert.equal(candidates.length, nodeCount);
  let locationId = `GRL-${opaqueSuffix(50_000 + candidates[0]!.releaseOrdinal)}`;
  if (nodeOrdinalStart > 0) {
    const previous = groupCandidates[nodeOrdinalStart - 1]!;
    const previousCell = fixture.tables.greaterRealmCellV1.rows.find(row => (
      row.componentKey === origin.componentKey && row.cellKey !== destination.cellKey
    ))!;
    const precedingLocationId = `GRL-${'A'.repeat(25)}A`;
    locationId = `GRL-${'A'.repeat(25)}B`;
    assert.ok(precedingLocationId.localeCompare(locationId) < 0);
    Object.assign(previous, {
      locationId: precedingLocationId,
      cellKey: previousCell.cellKey,
      nodeOrdinal: nodeOrdinalStart - 1,
      allocationRank: GREATER_REALM_UNASSIGNED_RANK,
    });
  }
  for (let index = 0; index < candidates.length; index += 1) {
    Object.assign(candidates[index]!, {
      locationId,
      cellKey: destination.cellKey,
      nodeOrdinal: nodeOrdinalStart + index,
      allocationRank: GREATER_REALM_UNASSIGNED_RANK,
      legacyCatalogId: `${resourceKind}-shared-fixture`,
    });
  }
  return Object.freeze({ locationId, destinationCellKey: destination.cellKey });
}

function greaterRealmDispatchInput(
  fixture: Fixture,
  workerOrdinal: number,
  resourceKind: 'food' | 'wood' | 'stone' | 'gold',
  locationId: string,
  idempotencyKey: string,
  fid = 1_001n,
) {
  const castle = fixture.tables.castle.ownerFid.find(fid)!;
  const atlas = fixture.tables.realmAtlasV1.rows[0]!;
  return Object.freeze({
    fid,
    castle,
    workerId: `genesis-001-castle-${castle.castleId.toString()}-worker-0${workerOrdinal}`,
    resourceKind,
    locationId,
    expectedRevision: atlas.revision as bigint,
    idempotencyKey,
  });
}

function makeFirstWorkerOutbound(fixture: Fixture): Row {
  const worker = fixture.tables.castleWorkerV1.rows[0]!;
  const timeline = planCastleWorkerTimeline(1n, 1);
  Object.assign(worker, {
    status: 'outbound',
    resourceKind: 'gold',
    siteId: 'gold-site-1',
    startedAtMicros: timeline.startedAtMicros,
    arrivesAtMicros: timeline.arrivesAtMicros,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
    returnStartedAtMicros: undefined,
    returnsAtMicros: timeline.returnsAtMicros,
    routeSteps: 1,
    returnStartProgressBasisPoints: undefined,
    timelineRevision: 1,
    revision: 1n,
  });
  const assignment = {
    assignmentId: 'active-worker-assignment',
    workerId: worker.workerId,
    fid: 1_001n,
    originCastleId: 1n,
    resourceKind: 'gold',
    siteId: 'gold-site-1',
    phase: 'outbound',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps: 1,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    timelineRevision: 1,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
  const occupation = {
    nodeKey: 'gold:gold-site-1',
    resourceKind: 'gold',
    siteId: 'gold-site-1',
    workerId: worker.workerId,
    workerOrdinal: 1,
    originCastleId: 1n,
    phase: 'outbound',
    startedAtMicros: timeline.startedAtMicros,
    arrivesAtMicros: timeline.arrivesAtMicros,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
    timelineRevision: 1,
  };
  const schedule = {
    scheduleId: 1n,
    scheduledAt: { tag: 'Time', value: timestamp(timeline.arrivesAtMicros) },
    assignmentId: assignment.assignmentId,
    workerId: worker.workerId,
    timelineRevision: 1,
    stage: 'arrival',
  };
  fixture.tables.workerAssignmentV1.rows.push(assignment);
  fixture.tables.workerNodeOccupationV1.rows.push(occupation);
  fixture.tables.workerAssignmentScheduleV1.rows.push(schedule);
  return Object.freeze(clone({ worker, assignment, occupation, schedule }));
}

function clearFirstWorkerJourney(fixture: Fixture): void {
  Object.assign(
    fixture.tables.castleWorkerV1.rows[0]!,
    expectedWorkerRowsForCastle({ castleId: 1n })[0]!,
  );
  fixture.tables.workerAssignmentV1.rows = [];
  fixture.tables.workerNodeOccupationV1.rows = [];
  fixture.tables.workerAssignmentScheduleV1.rows = [];
}

function addOnePostCommitFounder(
  fixture: Fixture,
  fid = 5_001n,
): Readonly<{
  fid: bigint;
  castleId: bigint;
  claim: Row;
}> {
  const db = fixture.tables;
  const activation = db.greaterRealmActivationV1.rows[0]!;
  assert.equal(activation.mode, 'active');
  const topology = captureGreaterRealmFrozenTopologyV1(fixture.ctx);
  const castleId = BigInt(db.castle.rows.length + 1);
  const selected = selectGreaterRealmCastleAllocationV1(
    topology.slots,
    db.greaterRealmCastleClaimV1.rows.map(claim => ({
      castleId: claim.castleId,
      slotId: claim.slotId,
      allocationSequence: claim.allocationSequence,
      topologyDigest: topology.topologyDigest,
    })),
    castleId,
  );
  assert.equal(selected.result, 'allocated');
  const slot = db.greaterRealmCastleSlotV1.slotId.find(selected.allocation.slotId)!;
  const cell = db.greaterRealmCellV1.cellKey.find(slot.cellKey)!;
  const foundedAt = timestamp(20_000n + castleId);
  const castle = {
    castleId,
    ownerFid: fid,
    tileKey: cell.cellKey,
    q: cell.atlasQ,
    r: cell.atlasR,
    level: 1,
    name: `Greater Realm Keep ${castleId.toString().padStart(3, '0')}`,
    createdAt: foundedAt,
  };
  const claim = {
    slotId: slot.slotId,
    ownerFid: fid,
    castleId,
    atlasId: activation.atlasId,
    activationId: activation.activationId,
    state: 'active',
    claimKind: 'founded',
    allocationSequence: selected.allocation.allocationSequence,
    plannedAt: foundedAt,
    activatedAt: foundedAt,
    legacySlotId: undefined,
    legacyClaimedAt: undefined,
    legacyGenerationVersion: undefined,
    legacyTileKey: undefined,
    legacyQ: undefined,
    legacyR: undefined,
  };
  db.allowedFid.rows.push({ ...db.allowedFid.rows[0]!, fid, invitedAt: foundedAt });
  db.castle.rows.push(castle);
  db.realmProfileV1.rows.push({
    ...db.realmProfileV1.rows[0]!,
    fid,
    canonicalUsername: `postcommitfounder${fid.toString()}`,
    displayName: `Post-commit Founder ${fid.toString()}`,
    admittedAt: foundedAt,
    profileUpdatedAt: foundedAt,
  });
  db.markAccountV1.rows.push({
    ...db.markAccountV1.rows[0]!, fid, updatedAt: foundedAt,
  });
  db.resourceAccountV1.rows.push({
    ...db.resourceAccountV1.rows[0]!,
    fid,
    castleId,
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    revision: 0n,
    createdAt: foundedAt,
    updatedAt: foundedAt,
  });
  db.castleWorkerV1.rows.push(
    ...expectedWorkerRowsForCastle(castle).map(row => ({ ...row })),
  );
  db.greaterRealmCastleClaimV1.rows.push(claim);
  db.greaterRealmCellOccupancyV1.rows.push({
    cellKey: cell.cellKey,
    atlasId: activation.atlasId,
    regionId: cell.regionId,
    castleId,
    atlasRevision: 1n,
    occupiedAt: foundedAt,
  });
  Object.assign(activation, {
    nextAllocationSequence: selected.allocation.allocationSequence + 1n,
    postCanaryFoundingCount: activation.postCanaryFoundingCount + 1,
  });
  const castleIds = db.castle.rows.map(row => row.castleId as bigint);
  Object.assign(db.realmWorkerSystemV1.rows[0]!, {
    expectedCastleCount: castleIds.length,
    expectedWorkerCount: castleIds.length * 4,
    rosterDigest: rosterDigestForCastleIds(castleIds),
  });
  Object.assign(db.realmWorkerSystemV2.rows[0]!, {
    currentCastleCount: castleIds.length,
    currentWorkerCount: castleIds.length * 4,
    rosterDigest: rosterDigestForCastleIds(castleIds),
  });
  return Object.freeze({ fid, castleId, claim });
}

const CANARY_REVIEWED_PLAN_DIGEST = '1'.repeat(64);
const CANARY_EVIDENCE_NONCE = '2'.repeat(64);
const CANARY_OWNER_ARTIFACT_DIGEST = '3'.repeat(64);

function prepareProductionPlayerCanaryFixture(
  beforeRegistration?: (candidate: Readonly<{
    fixture: Fixture;
    fid: bigint;
    registrationInput: Parameters<
      typeof registerProductionPlayerCanaryApprovalV1
    >[1];
  }>) => void,
) {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const founded = addOnePostCommitFounder(fixture, 50_001n);
  const db = fixture.tables;
  const fid = founded.fid;
  const castle = db.castle.castleId.find(founded.castleId)!;
  const admittedAt = castle.createdAt;
  const admittedAtMicros = admittedAt.microsSinceUnixEpoch as bigint;
  const profile = db.realmProfileV1.fid.find(fid)!;
  Object.assign(profile, {
    firstAuthenticatedAt: admittedAt,
    profileUpdatedAt: admittedAt,
    publicStatus: 'active',
    communityStatsVisible: true,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: 0n,
    marksSpentMicros: 0n,
    marksBalanceMicros: 0n,
    marksPolicyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
  const resource = db.resourceAccountV1.fid.find(fid)!;
  Object.assign(resource, {
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: admittedAtMicros,
    revision: 0n,
    createdAt: admittedAt,
    updatedAt: admittedAt,
  });
  db.accessRequestV1.insert({
    fid,
    requestCycle: 0n,
    requestedAt: timestamp(admittedAtMicros - 1n),
  });
  db.playerV2.insert({
    fid,
    username: undefined,
    displayName: undefined,
    pfpUrl: undefined,
    joinedAt: admittedAt,
    status: 'active',
  });
  db.playerOwnershipV2.insert({ fid, identity: `fixture:${fid.toString()}` });
  db.alphaTermsAcceptanceV1.insert({
    acceptanceKey: `${fid.toString()}:${WARPKEEP_ALPHA_TERMS_VERSION}`,
    fid,
    termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    acceptedAt: admittedAt,
  });
  db.adminAudit.insert({
    id: 0n,
    action: 'admit_founder_for_access_request_v2',
    targetFid: fid,
    actorSubject: 'admin:canary-fixture',
    createdAt: admittedAt,
    note: 'exact production player canary fixture',
  });

  const authorityAtMicros = 1_000_000_000_000n;
  fixture.ctx.timestamp = timestamp(authorityAtMicros);
  const baselineInput = Object.freeze({
    fid,
    reviewedAdmissionPlanDigest: CANARY_REVIEWED_PLAN_DIGEST,
    evidenceNonce: CANARY_EVIDENCE_NONCE,
  });
  const baseline = fixture.transaction(() => (
    captureProductionPlayerCanaryBaseline(fixture.ctx, baselineInput)
  ));
  assert.equal(baseline.baselineCaptured, true);
  const routePlan = inspectProductionPlayerCanaryRoutePlan(
    fixture.ctx,
    baselineInput,
  );
  const commands = productionPlayerCanaryCommandAuthorityV2({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: baselineInput.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.serverBaselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
  });
  const ownerApprovalCommitment = productionPlayerCanaryOwnerApprovalCommitmentV1({
    evidenceNonce: baselineInput.evidenceNonce,
    ownerApprovalArtifactDigest: CANARY_OWNER_ARTIFACT_DIGEST,
    serverBaselineCommitment: baseline.serverBaselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
  });
  const notAfterMicros = authorityAtMicros + 20_000_000_000n;
  const registrationInput = Object.freeze({
    ...baselineInput,
    serverBaselineCommitment: baseline.serverBaselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
    commandKeyPolicyVersion: commands.commandKeyPolicyVersion,
    commandSetCommitment: commands.commandSetCommitment,
    ownerApprovalArtifactDigest: CANARY_OWNER_ARTIFACT_DIGEST,
    ownerApprovalCommitment,
    approvedAtMicros: authorityAtMicros,
    notAfterMicros,
  });
  beforeRegistration?.(Object.freeze({ fixture, fid, registrationInput }));
  const registration = fixture.transaction(() => (
    registerProductionPlayerCanaryApprovalV1(fixture.ctx, registrationInput)
  ));
  return Object.freeze({
    fixture,
    fid,
    castle,
    baselineInput,
    baseline,
    routePlan,
    commands,
    registrationInput,
    registration,
  });
}

type PreparedCanaryFixture = ReturnType<typeof prepareProductionPlayerCanaryFixture>;

function dispatchProductionCanaryOrdinal(
  prepared: PreparedCanaryFixture,
  ordinal: number,
) {
  const { fixture, fid, castle, routePlan, commands, registration } = prepared;
  const route = routePlan.routes[ordinal - 1]!;
  const command = commands.commands[ordinal - 1]!;
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + BigInt(ordinal));
  return fixture.transaction(() => (
    dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(fixture.ctx, {
      fid,
      castle,
      workerId: route.workerId,
      resourceKind: route.resourceKind,
      locationId: route.locationId,
      expectedRevision: route.atlasRevision,
      idempotencyKey: command.dispatchIdempotencyKey,
    })
  ));
}

function replayProductionCanaryOrdinalAtCurrentTime(
  prepared: PreparedCanaryFixture,
  ordinal: number,
) {
  const { fixture, fid, castle, routePlan, commands } = prepared;
  const route = routePlan.routes[ordinal - 1]!;
  const command = commands.commands[ordinal - 1]!;
  return fixture.transaction(() => (
    dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(fixture.ctx, {
      fid,
      castle,
      workerId: route.workerId,
      resourceKind: route.resourceKind,
      locationId: route.locationId,
      expectedRevision: route.atlasRevision,
      idempotencyKey: command.dispatchIdempotencyKey,
    })
  ));
}

function recoverProductionCanaryOrdinal(
  prepared: PreparedCanaryFixture,
  ordinal: number,
) {
  const { fixture, fid, castle, baselineInput } = prepared;
  return fixture.transaction(() => recallProductionPlayerCanaryWorkerV1(
    fixture.ctx,
    { fid, castle, ...baselineInput, ordinal },
  ));
}

function runNextWorkerSchedule(fixture: Fixture, workerId: string): Row {
  const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
  fixture.ctx.timestamp = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch
      >= schedule.scheduledAt.value.microsSinceUnixEpoch
      ? fixture.ctx.timestamp.microsSinceUnixEpoch
      : schedule.scheduledAt.value.microsSinceUnixEpoch,
  );
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, schedule));
  return schedule;
}

function dispatchGenericCanaryRoute(
  prepared: PreparedCanaryFixture,
  ordinal: number,
  idempotencyKey: string,
  observedAtMicros = prepared.registration.notAfterMicros,
) {
  const { fixture, fid, castle, routePlan } = prepared;
  const route = routePlan.routes[ordinal - 1]!;
  fixture.ctx.timestamp = timestamp(observedAtMicros);
  return fixture.transaction(() => dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(
    fixture.ctx,
    {
      fid,
      castle,
      workerId: route.workerId,
      resourceKind: route.resourceKind,
      locationId: route.locationId,
      expectedRevision: route.atlasRevision,
      idempotencyKey,
    },
  ));
}

function completeWorkerAssignmentNaturally(fixture: Fixture, workerId: string): void {
  for (let transition = 0; transition < 3; transition += 1) {
    if (fixture.tables.workerAssignmentV1.workerId.find(workerId) === null) return;
    runNextWorkerSchedule(fixture, workerId);
  }
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
}

function recallOrdinaryCanaryRoute(
  prepared: PreparedCanaryFixture,
  ordinal: number,
  idempotencyKey: string,
  observedAtMicros: bigint,
): void {
  const { fixture, fid, castle, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(observedAtMicros);
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid,
    castle,
    workerId: routePlan.routes[ordinal - 1]!.workerId,
    idempotencyKey,
  }));
}

function mutateDispatchV2ReceiptMetadata(
  receipt: Row,
  field: 'expectedRevision' | 'capacityDigest' | 'fingerprint',
  value: string,
): void {
  const fields = String(receipt.commandKind).split(':');
  assert.equal(fields.length, 5);
  assert.equal(fields[0], 'dispatch-v2');
  fields[field === 'expectedRevision' ? 1 : field === 'capacityDigest' ? 3 : 4] = value;
  receipt.commandKind = fields.join(':');
}

function runCurrentWorkerSchedule(
  fixture: Fixture,
  workerId: string,
): void {
  const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
  assert.ok(
    fixture.ctx.timestamp.microsSinceUnixEpoch
      >= schedule.scheduledAt.value.microsSinceUnixEpoch,
  );
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, schedule));
}

function fillProductionCanaryReceiptsWithPinnedRows(
  prepared: PreparedCanaryFixture,
): void {
  const { fixture, fid, routePlan } = prepared;
  const route = routePlan.routes[3]!;
  const worker = fixture.tables.castleWorkerV1.workerId.find(route.workerId)!;
  while (fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  ).length < 64) {
    const ordinal = fixture.tables.workerCommandIdempotencyV1.rows.filter(
      row => row.fid === fid,
    ).length;
    fixture.tables.workerCommandIdempotencyV1.insert({
      requestKey: `${fid.toString()}:pinned-correlation-${String(ordinal).padStart(4, '0')}`,
      fid,
      workerId: route.workerId,
      commandKind: 'recall',
      resourceKind: route.resourceKind,
      siteId: `${route.locationId}:1`,
      assignmentId: `pinned-assignment-${String(ordinal).padStart(4, '0')}`,
      resultRevision: worker.revision,
      createdAt: fixture.ctx.timestamp,
    });
  }
}

test('production canary fence-first serialization is atomic, terminal, and replay-only', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, baselineInput } = prepared;
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 1n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const rows = fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  );
  assert.equal(rows.length, 5);
  const marker = rows.at(-1)!;
  assert.equal(
    marker.requestKey,
    `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
  );
  assert.equal(marker.commandKind, 'recall-all');
  assert.equal(marker.workerId, undefined);
  for (let index = 0; index < 4; index += 1) {
    const position = rows[index]!;
    assert.equal(
      position.requestKey,
      `${fid.toString()}:${commands.commands[index]!.dispatchIdempotencyKey}`,
    );
    assert.equal(position.commandKind, 'recall');
    assert.equal(position.workerId, prepared.routePlan.routes[index]!.workerId);
    assert.deepEqual(position.createdAt, marker.createdAt);
  }
  const replayBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), replayBefore);
  assert.equal(
    inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      fid,
      ...baselineInput,
    }).disposition,
    'terminal-evidence-impossible',
  );
  const dispatchBefore = stateText(fixture);
  assert.match(
    errorCode(() => dispatchProductionCanaryOrdinal(prepared, 1)) ?? '',
    /FENCED/,
  );
  assert.equal(stateText(fixture), dispatchBefore);
});

test('production canary rejects future recovery rows and malformed f00 snapshots without writes', () => {
  const assertRejected = (
    prepared: PreparedCanaryFixture,
    label: string,
  ) => {
    const { fixture, fid, baselineInput } = prepared;
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { fid, ...baselineInput },
    )) ?? '', /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u, label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
  };

  for (const kind of ['marker', 'position'] as const) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const key = kind === 'marker'
      ? commands.recoveryFenceIdempotencyKey
      : commands.commands[0]!.dispatchIdempotencyKey;
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${key}`,
    )!.createdAt = timestamp(
      fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
    );
    assertRejected(prepared, `future ${kind}`);
  }

  {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, registration } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      'generic-future-receipt-0001',
      registration.notAfterMicros,
    );
    fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment!.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!.createdAt = timestamp(
      fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
    );
    assertRejected(prepared, 'future generic');
  }

  for (const kind of ['payload', 'vector', 'maximum'] as const) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration } = prepared;
    if (kind === 'vector') dispatchProductionCanaryOrdinal(prepared, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
    )!;
    if (kind === 'payload') marker.assignmentId = 'pc2-f00-s1|malformed';
    if (kind === 'maximum') marker.resultRevision += 1n;
    if (kind === 'vector') {
      const snapshot = [...parseProductionPlayerCanaryRecoverySnapshotV2(
        marker.assignmentId!,
      )];
      [snapshot[0], snapshot[1]] = [snapshot[1]!, snapshot[0]!];
      marker.assignmentId = encodeProductionPlayerCanaryRecoverySnapshotV2(snapshot);
    }
    assertRejected(prepared, `snapshot ${kind}`);
  }
});

test('production canary completed f00 never heals a missing position fence', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, baselineInput } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const missingKey = `${fid.toString()}:${commands.commands[2]!.dispatchIdempotencyKey}`;
  fixture.tables.workerCommandIdempotencyV1.requestKey.delete(missingKey);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(missingKey),
    null,
  );
  const before = stateText(fixture);
  const uuidBefore = fixture.uuidSequence;
  assert.match(
    errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
    /REPLAY_INVALID|RECEIPT_INVALID/u,
  );
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
    fixture.ctx,
    { fid, ...baselineInput },
  )) ?? '', /REPLAY_INVALID|RECEIPT_INVALID/u);
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(missingKey),
    null,
  );
});

test('production canary dispatch-first lost response is clamped then atomically recalled and fenced', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, routePlan } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.equal(dispatched.idempotent, false);
  assert.ok(dispatched.assignment);
  assert.equal(
    dispatched.assignment.gatheringEndsAtMicros
      - dispatched.assignment.arrivesAtMicros,
    119_999_999n,
  );
  const plannedReturn = dispatched.assignment.gatheringEndsAtMicros
    + (dispatched.assignment.arrivesAtMicros - dispatched.assignment.startedAtMicros);
  assert.ok(plannedReturn < registration.notAfterMicros);

  const lostResponseBefore = stateText(fixture);
  const replay = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.assignment?.assignmentId, dispatched.assignment.assignmentId);
  assert.equal(stateText(fixture), lostResponseBefore);

  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const receipts = fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  );
  assert.equal(receipts.length, 6);
  const marker = receipts.at(-1)!;
  assert.equal(
    marker.requestKey,
    `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
  );
  assert.equal(marker.commandKind, 'recall-all');
  assert.match(marker.assignmentId, /^pc2-f00-s1\|/u);
  const recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  );
  assert.equal(recall?.assignmentId, dispatched.assignment.assignmentId);
  assert.equal(
    fixture.tables.castleWorkerV1.workerId.find(routePlan.routes[0]!.workerId)?.status,
    'returning',
  );
  for (let index = 1; index < 4; index += 1) {
    const position = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[index]!.dispatchIdempotencyKey}`,
    );
    assert.equal(position?.workerId, routePlan.routes[index]!.workerId);
    assert.deepEqual(position?.createdAt, marker.createdAt);
  }
  const fencedBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'fenced');
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), fencedBefore);
});

test('production canary pc2 dispatch and ordinal-zero serialize safely at the same microsecond', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const dispatchAt = clone(prepared.fixture.ctx.timestamp);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const recall = prepared.fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${prepared.fid.toString()}:${prepared.commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  assert.deepEqual(recall.createdAt, dispatchAt);
  assert.equal(recall.resultRevision, 2n);
  const before = stateText(prepared.fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(prepared.fixture), before);
});

test('production canary f00 accepts same-micro generic-after serialization through terminal completion', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const markerAt = clone(fixture.ctx.timestamp);
  const generic = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-after-f00-worker-0001',
    registration.notAfterMicros,
  );
  assert.equal(generic.idempotent, false);
  assert.deepEqual(generic.assignment?.createdAt, markerAt);
  let status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    fid,
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, false);
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const activeBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), activeBefore);

  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
  status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    fid,
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, true);
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const terminalBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), terminalBefore);
});

test('production canary f00 tracks generic-before completion after direct and post-arrival recalls', () => {
  const exercise = (recallAfterArrival: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      recallAfterArrival
        ? 'generic-before-f00-arrival-recall-0001'
        : 'generic-before-f00-direct-recall-0001',
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${prepared.commands.recoveryFenceIdempotencyKey}`,
    )!;
    assert.deepEqual(marker.createdAt, generic.assignment.createdAt);

    if (recallAfterArrival) runNextWorkerSchedule(fixture, workerId);
    recallOrdinaryCanaryRoute(
      prepared,
      1,
      recallAfterArrival
        ? 'generic-after-arrival-recall-0001'
        : 'generic-direct-outbound-recall-0001',
      fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    const recall = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment?.assignmentId
      && row.commandKind === 'recall'
    ))!;
    assert.equal(
      recall.resultRevision,
      recallAfterArrival ? 3n : 2n,
    );
    runNextWorkerSchedule(fixture, workerId);
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      fid,
      ...baselineInput,
    });
    assert.equal(status.terminalSafe, true);
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const terminalBefore = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), terminalBefore);
  };
  exercise(false);
  exercise(true);
});

test('production canary terminal replay tracks a later journey after f00 captured original pc2 returning', () => {
  const exercise = (natural: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    dispatchProductionCanaryOrdinal(prepared, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const markerSnapshot = parseProductionPlayerCanaryRecoverySnapshotV2(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        `${fid.toString()}:${prepared.commands.recoveryFenceIdempotencyKey}`,
      )!.assignmentId!,
    )[0]!;
    assert.equal(markerSnapshot.status, 'r');
    assert.ok(markerSnapshot.assignmentId);
    runNextWorkerSchedule(fixture, workerId);
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);

    const later = dispatchGenericCanaryRoute(
      prepared,
      1,
      natural
        ? 'generic-after-original-snapshot-natural-0001'
        : 'generic-after-original-snapshot-direct-0001',
      fixture.ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros
        ? registration.notAfterMicros
        : fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    assert.ok(later.assignment);
    if (natural) {
      completeWorkerAssignmentNaturally(fixture, workerId);
    } else {
      recallOrdinaryCanaryRoute(
        prepared,
        1,
        'generic-after-original-snapshot-direct-recall-0001',
        fixture.ctx.timestamp.microsSinceUnixEpoch,
      );
      runNextWorkerSchedule(fixture, workerId);
    }
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      fid,
      ...baselineInput,
    });
    assert.equal(status.terminalSafe, true);
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const before = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});

test('production canary rejects coherent huge generic-before-f00 revision forgery active and terminal', () => {
  const exercise = (terminal: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      terminal
        ? 'generic-before-f00-huge-terminal-0001'
        : 'generic-before-f00-huge-active-0001',
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    if (terminal) completeWorkerAssignmentNaturally(fixture, workerId);

    const forgedDispatchRevision = 100n;
    const genericReceipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment?.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!;
    genericReceipt.resultRevision = forgedDispatchRevision;
    const position = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    position.resultRevision = forgedDispatchRevision;
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
    )!;
    const snapshot = [...parseProductionPlayerCanaryRecoverySnapshotV2(
      marker.assignmentId!,
    )];
    snapshot[0] = Object.freeze({
      ...snapshot[0]!,
      workerRevision: forgedDispatchRevision,
      timelineRevision: Number(forgedDispatchRevision),
    });
    marker.assignmentId = encodeProductionPlayerCanaryRecoverySnapshotV2(snapshot);
    marker.resultRevision = forgedDispatchRevision;
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    worker.revision = terminal
      ? forgedDispatchRevision + 3n
      : forgedDispatchRevision;
    worker.timelineRevision = Number(worker.revision);
    if (!terminal) {
      const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
      const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)!;
      const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
      assignment.timelineRevision = Number(forgedDispatchRevision);
      occupation.timelineRevision = Number(forgedDispatchRevision);
      schedule.timelineRevision = Number(forgedDispatchRevision);
    }

    const before = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.match(
      errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
        fixture.ctx,
        { fid, ...prepared.baselineInput },
      )) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});

test('production canary rejects coherent forged original pc2 revisions active and terminal', () => {
  const exercise = (terminal: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
    assert.ok(dispatched.assignment);
    if (terminal) completeWorkerAssignmentNaturally(fixture, workerId);
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    worker.revision = 100n;
    worker.timelineRevision = 100;
    if (!terminal) {
      const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
      const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)!;
      const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
      assignment.timelineRevision = 100;
      occupation.timelineRevision = 100;
      schedule.timelineRevision = 100;
    }
    const before = stateText(fixture);
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ROSTER_INVALID|ASSIGNMENT_INVALID|RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});

test('production canary rejects terminal pc2 receipts whose immutable planned return reaches cutoff', () => {
  for (const beyondCutoffMicros of [0n, 1n]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
    const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    const travelMicros = BigInt(routePlan.routes[0]!.routeSteps)
      * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
    dispatch.createdAt = timestamp(
      registration.notAfterMicros
        - PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS
        - 2n * travelMicros
        + beyondCutoffMicros,
    );
    const before = stateText(fixture);
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  }
});

test('production canary rebinds pc2 capacity digest on active and terminal replay paths', () => {
  for (const terminal of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    if (terminal) {
      completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
    }
    const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    const originalCapacity = String(dispatch.commandKind).split(':')[3]!;
    mutateDispatchV2ReceiptMetadata(
      dispatch,
      'capacityDigest',
      originalCapacity === 'b'.repeat(64) ? 'c'.repeat(64) : 'b'.repeat(64),
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }
});

test('production canary dispatch and replay reject malformed full stored approval authority without writes', () => {
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['artifact', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalArtifactDigest = '4'.repeat(64);
    }],
    ['owner', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalCommitment = '5'.repeat(64);
    }],
    ['registration', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.approvalRegistrationCommitment = '6'.repeat(64);
    }],
    ['cross-index', prepared => {
      const table = prepared.fixture.tables
        .productionPlayerCanaryApprovalRegistrationV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: '7'.repeat(64),
        fid: prepared.fid + 99_999n,
      });
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const fresh = prepareProductionPlayerCanaryFixture();
    corrupt(fresh);
    const freshBefore = stateText(fresh.fixture);
    assert.equal(
      errorCode(() => dispatchProductionCanaryOrdinal(fresh, 1)),
      'STATE_INTEGRITY',
      `${label} NEW dispatch`,
    );
    assert.equal(stateText(fresh.fixture), freshBefore);

    const replay = prepareProductionPlayerCanaryFixture();
    dispatchProductionCanaryOrdinal(replay, 1);
    corrupt(replay);
    const replayBefore = stateText(replay.fixture);
    assert.equal(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(replay, 1)),
      'STATE_INTEGRITY',
      `${label} replay`,
    );
    assert.equal(stateText(replay.fixture), replayBefore);
  }
});

test('production canary containment survives rollout off while wrong tuples and pre-cutoff ordinals stay gated', () => {
  const wrongTuple = prepareProductionPlayerCanaryFixture();
  const wrongRoute = wrongTuple.routePlan.routes[1]!;
  const firstCommand = wrongTuple.commands.commands[0]!;
  const wrongBefore = stateText(wrongTuple.fixture);
  const wrongUuid = wrongTuple.fixture.uuidSequence;
  assert.match(errorCode(() => wrongTuple.fixture.transaction(() => (
    dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(
      wrongTuple.fixture.ctx,
      {
        fid: wrongTuple.fid,
        castle: wrongTuple.castle,
        workerId: wrongRoute.workerId,
        resourceKind: wrongRoute.resourceKind,
        locationId: wrongRoute.locationId,
        expectedRevision: wrongRoute.atlasRevision,
        idempotencyKey: firstCommand.dispatchIdempotencyKey,
      },
    )
  ))) ?? '', /DISPATCH_TUPLE_INVALID/u);
  assert.equal(stateText(wrongTuple.fixture), wrongBefore);
  assert.equal(wrongTuple.fixture.uuidSequence, wrongUuid);

  const preCutoff = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(preCutoff, 1);
  preCutoff.fixture.tables.realmWorkerSystemV1.rows[0]!.mode = 'staged';
  const preCutoffBefore = stateText(preCutoff.fixture);
  const preCutoffUuid = preCutoff.fixture.uuidSequence;
  assert.equal(
    errorCode(() => recoverProductionCanaryOrdinal(preCutoff, 1)),
    'WORKER_SYSTEM_NOT_READY',
  );
  assert.equal(stateText(preCutoff.fixture), preCutoffBefore);
  assert.equal(preCutoff.fixture.uuidSequence, preCutoffUuid);

  for (const ordinal of [0, 1]) {
    const postCutoff = prepareProductionPlayerCanaryFixture();
    const { fixture, registration, routePlan } = postCutoff;
    dispatchProductionCanaryOrdinal(postCutoff, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    fixture.tables.realmWorkerSystemV1.rows[0]!.mode = 'staged';
    assert.equal(
      recoverProductionCanaryOrdinal(postCutoff, ordinal),
      ordinal === 0 ? 'fenced' : 'recalled',
    );
    assert.equal(
      fixture.tables.castleWorkerV1.workerId.find(
        routePlan.routes[0]!.workerId,
      )!.status,
      'returning',
    );
  }
});

test('production canary first pc2 and every later target reprove pristine mutable state', () => {
  const templatePrepared = prepareProductionPlayerCanaryFixture();
  const templateDispatch = dispatchProductionCanaryOrdinal(templatePrepared, 1);
  const assignmentTemplate = clone(templateDispatch.assignment!);
  const occupationTemplate = clone(
    templatePrepared.fixture.tables.workerNodeOccupationV1.byWorker.find(
      templatePrepared.routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    templatePrepared.fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      templatePrepared.routePlan.routes[0]!.workerId,
    )!,
  );
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['worker-revision', prepared => {
      const worker = prepared.fixture.tables.castleWorkerV1.workerId.find(
        prepared.routePlan.routes[0]!.workerId,
      )!;
      worker.revision = 100n;
      worker.timelineRevision = 100;
    }],
    ['assignment', prepared => {
      prepared.fixture.tables.workerAssignmentV1.insert(clone(assignmentTemplate));
    }],
    ['occupation', prepared => {
      prepared.fixture.tables.workerNodeOccupationV1.insert(clone(occupationTemplate));
    }],
    ['schedule', prepared => {
      prepared.fixture.tables.workerAssignmentScheduleV1.insert({
        ...clone(scheduleTemplate),
        scheduleId: 0n,
      });
    }],
    ['resource', prepared => {
      const resource = prepared.fixture.tables.resourceAccountV1.fid.find(
        prepared.fid,
      )!;
      resource.food += 1n;
      resource.revision += 1n;
      resource.updatedAt = prepared.fixture.ctx.timestamp;
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const prepared = prepareProductionPlayerCanaryFixture();
    corrupt(prepared);
    const before = stateText(prepared.fixture);
    const uuidBefore = prepared.fixture.uuidSequence;
    assert.match(
      errorCode(() => dispatchProductionCanaryOrdinal(prepared, 1)) ?? '',
      /BASELINE_PRISTINE_REQUIRED|DISPATCH_TARGET_NOT_PRISTINE/u,
      label,
    );
    assert.equal(stateText(prepared.fixture), before, label);
    assert.equal(prepared.fixture.uuidSequence, uuidBefore, label);
  }

  const later = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(later, 1);
  const target = later.fixture.tables.castleWorkerV1.workerId.find(
    later.routePlan.routes[1]!.workerId,
  )!;
  target.revision = 100n;
  target.timelineRevision = 100;
  const laterBefore = stateText(later.fixture);
  const laterUuid = later.fixture.uuidSequence;
  assert.equal(
    errorCode(() => dispatchProductionCanaryOrdinal(later, 2)),
    'PRODUCTION_PLAYER_CANARY_DISPATCH_TARGET_NOT_PRISTINE',
  );
  assert.equal(stateText(later.fixture), laterBefore);
  assert.equal(later.fixture.uuidSequence, laterUuid);

  const freshSweep = prepareProductionPlayerCanaryFixture();
  const sweepTarget = freshSweep.fixture.tables.castleWorkerV1.workerId.find(
    freshSweep.routePlan.routes[2]!.workerId,
  )!;
  sweepTarget.revision = 100n;
  sweepTarget.timelineRevision = 100;
  const sweepBefore = stateText(freshSweep.fixture);
  const sweepUuid = freshSweep.fixture.uuidSequence;
  assert.equal(
    errorCode(() => recoverProductionCanaryOrdinal(freshSweep, 0)),
    'PRODUCTION_PLAYER_CANARY_DISPATCH_TARGET_NOT_PRISTINE',
  );
  assert.equal(stateText(freshSweep.fixture), sweepBefore);
  assert.equal(freshSweep.fixture.uuidSequence, sweepUuid);
});

test('production canary NEW approval rejects receipt and graph races while exact replay ignores later mutable state', () => {
  const template = prepareProductionPlayerCanaryFixture();
  const dispatched = dispatchProductionCanaryOrdinal(template, 1);
  const assignmentTemplate = clone(dispatched.assignment!);
  const occupationTemplate = clone(
    template.fixture.tables.workerNodeOccupationV1.byWorker.find(
      template.routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    template.fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      template.routePlan.routes[0]!.workerId,
    )!,
  );
  const races: readonly [string, (fixture: Fixture, fid: bigint) => void][] = [
    ['pc1 receipt', (fixture, fid) => {
      const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
      const worker = fixture.tables.castleWorkerV1.byOriginCastle.filter(
        resource.castleId,
      )[0]!;
      fixture.tables.workerCommandIdempotencyV1.insert({
        requestKey: `${fid.toString()}:pc1-approval-race-0001`,
        fid,
        workerId: worker.workerId,
        commandKind: 'recall',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: undefined,
        resultRevision: worker.revision,
        createdAt: fixture.ctx.timestamp,
      });
    }],
    ['ordinary receipt', (fixture, fid) => {
      const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
      const worker = fixture.tables.castleWorkerV1.byOriginCastle.filter(
        resource.castleId,
      )[0]!;
      fixture.tables.workerCommandIdempotencyV1.insert({
        requestKey: `${fid.toString()}:ordinary-approval-race-0001`,
        fid,
        workerId: worker.workerId,
        commandKind: 'recall',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: undefined,
        resultRevision: worker.revision,
        createdAt: fixture.ctx.timestamp,
      });
    }],
    ['assignment', fixture => {
      fixture.tables.workerAssignmentV1.insert(clone(assignmentTemplate));
    }],
    ['occupation', fixture => {
      fixture.tables.workerNodeOccupationV1.insert(clone(occupationTemplate));
    }],
    ['schedule', fixture => {
      fixture.tables.workerAssignmentScheduleV1.insert({
        ...clone(scheduleTemplate),
        scheduleId: 0n,
      });
    }],
  ];
  for (const [label, race] of races) {
    let racedFixture: Fixture | undefined;
    let racedBefore = '';
    let racedUuid = -1;
    assert.equal(errorCode(() => prepareProductionPlayerCanaryFixture(candidate => {
      racedFixture = candidate.fixture;
      race(candidate.fixture, candidate.fid);
      racedBefore = stateText(candidate.fixture);
      racedUuid = candidate.fixture.uuidSequence;
    })), 'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED', label);
    assert.ok(racedFixture, label);
    assert.equal(stateText(racedFixture), racedBefore, label);
    assert.equal(racedFixture.uuidSequence, racedUuid, label);
    assert.equal(
      racedFixture.tables.productionPlayerCanaryApprovalRegistrationV1.count(),
      0n,
      label,
    );
  }

  const replay = prepareProductionPlayerCanaryFixture();
  replay.fixture.tables.castleWorkerV1.workerId.find(
    replay.routePlan.routes[0]!.workerId,
  )!.revision = 100n;
  const replayBefore = stateText(replay.fixture);
  const replayUuid = replay.fixture.uuidSequence;
  const replayStatus = replay.fixture.transaction(() => (
    registerProductionPlayerCanaryApprovalV1(
      replay.fixture.ctx,
      replay.registrationInput,
    )
  ));
  assert.equal(replayStatus.approvalRegistered, true);
  assert.equal(stateText(replay.fixture), replayBefore);
  assert.equal(replay.fixture.uuidSequence, replayUuid);
});

test('production canary all write recovery and status paths reject corrupt stored baseline or approval indexes', () => {
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['baseline-scalar', prepared => {
      prepared.fixture.tables.productionPlayerCanaryBaselineV1.fid
        .find(prepared.fid)!.resourceRevision = 1n;
    }],
    ['baseline-cross-index', prepared => {
      const table = prepared.fixture.tables.productionPlayerCanaryBaselineV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: '8'.repeat(64),
        fid: prepared.fid + 88_888n,
      });
    }],
    ['approval-artifact', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalArtifactDigest = '9'.repeat(64);
    }],
    ['approval-cross-index', prepared => {
      const table = prepared.fixture.tables
        .productionPlayerCanaryApprovalRegistrationV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: 'a'.repeat(64),
        fid: prepared.fid + 77_777n,
      });
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const fresh = prepareProductionPlayerCanaryFixture();
    corrupt(fresh);
    const freshBefore = stateText(fresh.fixture);
    const freshUuid = fresh.fixture.uuidSequence;
    assert.equal(
      errorCode(() => dispatchProductionCanaryOrdinal(fresh, 1)),
      'STATE_INTEGRITY',
      `${label} NEW pc2`,
    );
    assert.equal(stateText(fresh.fixture), freshBefore);
    assert.equal(fresh.fixture.uuidSequence, freshUuid);

    const active = prepareProductionPlayerCanaryFixture();
    dispatchProductionCanaryOrdinal(active, 1);
    dispatchGenericCanaryRoute(
      active,
      2,
      `generic-before-${label}-corruption-0002`,
      active.registration.notAfterMicros,
    );
    corrupt(active);
    const before = stateText(active.fixture);
    const uuidBefore = active.fixture.uuidSequence;
    const assertIntegrity = (action: () => unknown, operation: string) => {
      assert.equal(errorCode(action), 'STATE_INTEGRITY', `${label} ${operation}`);
      assert.equal(stateText(active.fixture), before);
      assert.equal(active.fixture.uuidSequence, uuidBefore);
    };
    assertIntegrity(
      () => replayProductionCanaryOrdinalAtCurrentTime(active, 1),
      'pc2 replay',
    );
    assertIntegrity(
      () => dispatchGenericCanaryRoute(
        active,
        3,
        `generic-after-${label}-corruption-0003`,
        active.registration.notAfterMicros + 1n,
      ),
      'generic dispatch',
    );
    assertIntegrity(() => active.fixture.transaction(() => {
      assertProductionPlayerCanaryGenericWorkerWriteAvailableV2(
        active.fixture.ctx,
        { fid: active.fid, idempotencyKey: `recall-after-${label}-corruption` },
      );
      recallCastleWorker(active.fixture.ctx, {
        fid: active.fid,
        castle: active.castle,
        workerId: active.routePlan.routes[1]!.workerId,
        idempotencyKey: `recall-after-${label}-corruption`,
      });
    }), 'per-worker recall');
    assertIntegrity(() => active.fixture.transaction(() => {
      assertProductionPlayerCanaryGenericWorkerWriteAvailableV2(
        active.fixture.ctx,
        { fid: active.fid, idempotencyKey: `settle-after-${label}-corruption` },
      );
      settleAllWorkerAssignmentsForFid(active.fixture.ctx, active.fid);
    }), 'resource settlement');
    assertIntegrity(
      () => recoverProductionCanaryOrdinal(active, 0),
      'ordinal-zero recovery',
    );
    assertIntegrity(
      () => inspectProductionPlayerCanaryRecoveryStatusV1(active.fixture.ctx, {
        fid: active.fid,
        ...active.baselineInput,
      }),
      'admin status',
    );
    assertIntegrity(
      () => inspectProductionPlayerCanaryAdminEvidence(active.fixture.ctx, {
        fid: active.fid,
        ...active.baselineInput,
      }),
      'admin evidence',
    );
  }
});

test('production canary accepts generic-after-f00 returning phase lineage for direct arrival and no-op recalls', () => {
  const exercise = (mode: 'direct' | 'arrival' | 'natural-noop') => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      `generic-after-f00-${mode}-0001`,
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    if (mode !== 'direct') runNextWorkerSchedule(fixture, workerId);
    if (mode === 'natural-noop') runNextWorkerSchedule(fixture, workerId);
    recallOrdinaryCanaryRoute(
      prepared,
      1,
      `generic-after-f00-${mode}-recall-0001`,
      fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    assert.equal(assignment.phase, 'returning');
    assert.equal(worker.revision, mode === 'direct' ? 2n : 3n);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      fid,
      ...baselineInput,
    });
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const before = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), before);
  };
  exercise('direct');
  exercise('arrival');
  exercise('natural-noop');
});

test('production canary ordinal-zero preserves two later generic journeys including one due accrual quantum', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, registration, routePlan } = prepared;
  const original = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(original.assignment);
  const laterTwo = dispatchGenericCanaryRoute(
    prepared,
    2,
    'generic-mixed-due-ordinal-0002',
    registration.notAfterMicros,
  );
  const laterThree = dispatchGenericCanaryRoute(
    prepared,
    3,
    'generic-mixed-outbound-ordinal-0003',
    registration.notAfterMicros,
  );
  assert.ok(laterTwo.assignment);
  assert.ok(laterThree.assignment);
  runNextWorkerSchedule(fixture, routePlan.routes[1]!.workerId);
  const gathering = fixture.tables.workerAssignmentV1.workerId.find(
    routePlan.routes[1]!.workerId,
  )!;
  assert.equal(gathering.phase, 'gathering');
  fixture.ctx.timestamp = timestamp(
    gathering.arrivesAtMicros
      + workerResourcePolicy(gathering.resourceKind).quantumMicros,
  );

  const laterState = [1, 2].map(index => {
    const workerId = routePlan.routes[index]!.workerId;
    return Object.freeze({
      assignment: clone(fixture.tables.workerAssignmentV1.workerId.find(workerId)),
      worker: clone(fixture.tables.castleWorkerV1.workerId.find(workerId)),
      occupation: clone(fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)),
      schedule: clone(fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)),
    });
  });
  const sharedEconomy = Object.freeze({
    resource: clone(fixture.tables.resourceAccountV1.fid.find(fid)),
    activation: clone(fixture.tables.greaterRealmActivationV1.rows[0]),
    claim: clone(fixture.tables.greaterRealmCastleClaimV1.castleId.find(
      prepared.castle.castleId,
    )),
    resourceNodes: clone(fixture.tables.greaterRealmResourceNodeV1.rows.filter(
      row => row.locationId === routePlan.routes[1]!.locationId
        || row.locationId === routePlan.routes[2]!.locationId,
    )),
  });
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  for (let offset = 0; offset < laterState.length; offset += 1) {
    const workerId = routePlan.routes[offset + 1]!.workerId;
    assert.deepEqual(
      {
        assignment: fixture.tables.workerAssignmentV1.workerId.find(workerId),
        worker: fixture.tables.castleWorkerV1.workerId.find(workerId),
        occupation: fixture.tables.workerNodeOccupationV1.byWorker.find(workerId),
        schedule: fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId),
      },
      laterState[offset],
    );
  }
  assert.deepEqual({
    resource: fixture.tables.resourceAccountV1.fid.find(fid),
    activation: fixture.tables.greaterRealmActivationV1.rows[0],
    claim: fixture.tables.greaterRealmCastleClaimV1.castleId.find(
      prepared.castle.castleId,
    ),
    resourceNodes: fixture.tables.greaterRealmResourceNodeV1.rows.filter(
      row => row.locationId === routePlan.routes[1]!.locationId
        || row.locationId === routePlan.routes[2]!.locationId,
    ),
  }, sharedEconomy);
  const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    fid,
    ...baselineInput,
  });
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const replayBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), replayBefore);
});

test('production canary delayed postcutoff ordinal recalls preserve a due unrelated generic journey', () => {
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, registration, routePlan } = prepared;
    const laterOrdinal = ordinal === 4 ? 1 : ordinal + 1;
    dispatchProductionCanaryOrdinal(prepared, ordinal);
    const later = dispatchGenericCanaryRoute(
      prepared,
      laterOrdinal,
      `generic-delayed-recall-${ordinal}-later-${laterOrdinal}`,
      registration.notAfterMicros,
    );
    assert.ok(later.assignment);
    const laterWorkerId = routePlan.routes[laterOrdinal - 1]!.workerId;
    runNextWorkerSchedule(fixture, laterWorkerId);
    const gathering = fixture.tables.workerAssignmentV1.workerId.find(
      laterWorkerId,
    )!;
    fixture.ctx.timestamp = timestamp(
      gathering.arrivesAtMicros
        + workerResourcePolicy(gathering.resourceKind).quantumMicros,
    );
    const unrelatedBefore = Object.freeze({
      assignment: clone(fixture.tables.workerAssignmentV1.workerId.find(laterWorkerId)),
      worker: clone(fixture.tables.castleWorkerV1.workerId.find(laterWorkerId)),
      occupation: clone(fixture.tables.workerNodeOccupationV1.byWorker.find(laterWorkerId)),
      schedule: clone(fixture.tables.workerAssignmentScheduleV1.byWorker.find(laterWorkerId)),
      resource: clone(fixture.tables.resourceAccountV1.fid.find(fid)),
      activation: clone(fixture.tables.greaterRealmActivationV1.rows[0]),
      claim: clone(fixture.tables.greaterRealmCastleClaimV1.castleId.find(
        prepared.castle.castleId,
      )),
    });
    assert.equal(recoverProductionCanaryOrdinal(prepared, ordinal), 'recalled');
    assert.deepEqual({
      assignment: fixture.tables.workerAssignmentV1.workerId.find(laterWorkerId),
      worker: fixture.tables.castleWorkerV1.workerId.find(laterWorkerId),
      occupation: fixture.tables.workerNodeOccupationV1.byWorker.find(laterWorkerId),
      schedule: fixture.tables.workerAssignmentScheduleV1.byWorker.find(laterWorkerId),
      resource: fixture.tables.resourceAccountV1.fid.find(fid),
      activation: fixture.tables.greaterRealmActivationV1.rows[0],
      claim: fixture.tables.greaterRealmCastleClaimV1.castleId.find(
        prepared.castle.castleId,
      ),
    }, unrelatedBefore);
    const replayBefore = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, ordinal), 'replayed');
    assert.equal(stateText(fixture), replayBefore);
  }
});

test('production canary rejects coherent generic metadata route and timeline tampering without writes', () => {
  const exercise = (
    label: string,
    corrupt: (prepared: PreparedCanaryFixture, assignment: Row, receipt: Row) => void,
  ) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const dispatched = dispatchGenericCanaryRoute(
      prepared,
      1,
      `generic-coherent-tamper-${label}-0001`,
      registration.notAfterMicros,
    );
    const assignment = dispatched.assignment!;
    const receipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === assignment.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!;
    corrupt(prepared, assignment, receipt);
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|ASSIGNMENT_INVALID|REPLAY_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { fid, ...baselineInput },
    )) ?? '', /RECEIPT_INVALID|ASSIGNMENT_INVALID|REPLAY_INVALID/u, label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.equal(
      fixture.tables.castleWorkerV1.workerId.find(
        routePlan.routes[0]!.workerId,
      )!.status,
      'outbound',
    );
  };

  exercise('fingerprint', (_prepared, _assignment, receipt) => {
    const original = String(receipt.commandKind).split(':')[4]!;
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'fingerprint',
      original === 'd'.repeat(64) ? 'e'.repeat(64) : 'd'.repeat(64),
    );
  });
  exercise('atlas', (_prepared, _assignment, receipt) => {
    const expected = BigInt(String(receipt.commandKind).split(':')[1]!);
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'expectedRevision',
      (expected + 1n).toString(),
    );
  });
  exercise('capacity', (_prepared, _assignment, receipt) => {
    const original = String(receipt.commandKind).split(':')[3]!;
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'capacityDigest',
      original === 'f'.repeat(64) ? '0'.repeat(64) : 'f'.repeat(64),
    );
  });
  exercise('route-timeline', ({ fixture }, assignment) => {
    const altered = planCastleWorkerTimeline(
      assignment.startedAtMicros,
      assignment.routeSteps + 1,
    );
    Object.assign(assignment, altered, {
      routeSteps: assignment.routeSteps + 1,
      settledThroughMicros: altered.arrivesAtMicros,
    });
    const worker = fixture.tables.castleWorkerV1.workerId.find(
      assignment.workerId,
    )!;
    Object.assign(worker, altered, { routeSteps: assignment.routeSteps });
    const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(
      assignment.workerId,
    )!;
    Object.assign(occupation, {
      startedAtMicros: altered.startedAtMicros,
      arrivesAtMicros: altered.arrivesAtMicros,
      gatheringEndsAtMicros: altered.gatheringEndsAtMicros,
    });
    const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      assignment.workerId,
    )!;
    schedule.scheduledAt = {
      tag: 'Time',
      value: timestamp(altered.arrivesAtMicros),
    };
  });
});

function completeNormalProductionCanaryEvidenceRun(
  prepared: PreparedCanaryFixture,
): void {
  const { fixture, registration, routePlan } = prepared;
  const dispatched = [1, 2, 3, 4].map(ordinal => (
    dispatchProductionCanaryOrdinal(prepared, ordinal).assignment!
  ));
  const events = dispatched.flatMap((assignment, index) => ([
    Object.freeze({
      kind: 'arrival' as const,
      ordinal: index + 1,
      atMicros: assignment.arrivesAtMicros,
    }),
    Object.freeze({
      kind: 'recall' as const,
      ordinal: index + 1,
      atMicros: assignment.arrivesAtMicros
        + workerResourcePolicy(assignment.resourceKind).quantumMicros,
    }),
  ])).sort((left, right) => (
    left.atMicros < right.atMicros ? -1
      : left.atMicros > right.atMicros ? 1
        : left.kind === right.kind ? left.ordinal - right.ordinal
          : left.kind === 'arrival' ? -1 : 1
  ));
  for (const event of events) {
    fixture.ctx.timestamp = timestamp(event.atMicros);
    if (event.kind === 'arrival') {
      runCurrentWorkerSchedule(
        fixture,
        routePlan.routes[event.ordinal - 1]!.workerId,
      );
    } else {
      assert.equal(recoverProductionCanaryOrdinal(prepared, event.ordinal), 'recalled');
    }
  }
  const returnSchedules = routePlan.routes.map(route => (
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(route.workerId)!
  )).sort((left, right) => {
    const leftAt = left.scheduledAt.value.microsSinceUnixEpoch as bigint;
    const rightAt = right.scheduledAt.value.microsSinceUnixEpoch as bigint;
    return leftAt < rightAt ? -1 : leftAt > rightAt ? 1 : 0;
  });
  for (const schedule of returnSchedules) {
    fixture.ctx.timestamp = timestamp(schedule.scheduledAt.value.microsSinceUnixEpoch);
    fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, schedule));
  }
  assert.ok(fixture.ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros);
}

test('production canary normal pre-cutoff all-four recall materializes one quantum and remains evidence-eligible', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput } = prepared;
  completeNormalProductionCanaryEvidenceRun(prepared);
  const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
  const storedBaseline = fixture.tables.productionPlayerCanaryBaselineV1.fid.find(fid)!;
  assert.ok(resource.revision > storedBaseline.resourceRevision);
  const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    fid,
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, true);
  assert.equal(status.structuralEvidenceCandidate, true);
  assert.equal(status.disposition, 'terminal-evidence-candidate');
  const evidence = inspectProductionPlayerCanaryAdminEvidence(fixture.ctx, {
    fid,
    ...baselineInput,
  });
  assert.equal(evidence.resourceQuantumCount, 4);
  assert.equal(evidence.dispatchReceiptCount, 4);
  assert.equal(evidence.recallReceiptCount, 4);
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    assert.equal(
      evidence[`${kind}Delta`],
      workerResourcePolicy(kind).ratePerQuantum,
    );
  }
});

test('production canary admin evidence rejects future dispatch and recall receipts read-only', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, commands } = prepared;
  completeNormalProductionCanaryEvidenceRun(prepared);
  const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
  )!;
  const recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  const originalDispatchAt = clone(dispatch.createdAt);
  const originalRecallAt = clone(recall.createdAt);
  const assertFutureRejected = (label: string) => {
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.equal(errorCode(() => inspectProductionPlayerCanaryAdminEvidence(
      fixture.ctx,
      { fid, ...baselineInput },
    )), 'PRODUCTION_PLAYER_CANARY_JOURNEY_INVALID', label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
  };
  dispatch.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assertFutureRejected('future dispatch');
  dispatch.createdAt = originalDispatchAt;
  recall.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assertFutureRejected('future recall');
  recall.createdAt = originalRecallAt;
  dispatch.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  recall.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 2n,
  );
  assertFutureRejected('coordinated future dispatch and recall');
});

test('production canary overdue schedule drains actual arrival expiry and return in exactly three transitions', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const dispatched = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-overdue-three-stage-drain-0001',
    registration.notAfterMicros,
  );
  assert.ok(dispatched.assignment);
  const workerId = routePlan.routes[0]!.workerId;
  const initial = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
  fixture.ctx.timestamp = timestamp(dispatched.assignment.returnsAtMicros);
  let transitions = 0;
  fixture.transaction(() => runBoundedDueCastleWorkerScheduleDrainV1(
    initial,
    fixture.ctx.timestamp.microsSinceUnixEpoch,
    schedule => {
      transitions += 1;
      runCastleWorkerSchedule(fixture.ctx, schedule);
    },
    assignmentId => fixture.tables.workerAssignmentScheduleV1.byAssignment
      .filter(assignmentId),
    schedule => schedule.scheduledAt.value.microsSinceUnixEpoch,
  ));
  assert.equal(transitions, 3);
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
  assert.equal(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId),
    null,
  );
  const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
  assert.equal(worker.status, 'idle');
  assert.equal(worker.revision, 4n);
  const before = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), before);
});

test('production canary f00 pins reserved and completed-generic receipts at the live 64-row prune boundary', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, commands, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const completed = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-completed-before-prune-0001',
    registration.notAfterMicros,
  );
  assert.ok(completed.assignment);
  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);

  const fillerWorker = fixture.tables.castleWorkerV1.workerId.find(
    routePlan.routes[3]!.workerId,
  )!;
  const lookalikeKey = `${fid.toString()}:xpc2-lookalike-0000`;
  fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: lookalikeKey,
    fid,
    workerId: fillerWorker.workerId,
    commandKind: 'recall',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: fillerWorker.revision,
    createdAt: timestamp(fixture.ctx.timestamp.microsSinceUnixEpoch - 1n),
  });
  while (fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  ).length < 64) {
    const ordinal = fixture.tables.workerCommandIdempotencyV1.rows.filter(
      row => row.fid === fid,
    ).length;
    fixture.tables.workerCommandIdempotencyV1.insert({
      requestKey: `${fid.toString()}:historical-noop-${String(ordinal).padStart(4, '0')}`,
      fid,
      workerId: fillerWorker.workerId,
      commandKind: 'recall',
      resourceKind: undefined,
      siteId: undefined,
      assignmentId: undefined,
      resultRevision: fillerWorker.revision,
      createdAt: fixture.ctx.timestamp,
    });
  }
  const completedAssignmentId = completed.assignment.assignmentId;
  const protectedBefore = fixture.tables.workerCommandIdempotencyV1.rows
    .filter(row => (
      row.requestKey.startsWith(`${fid.toString()}:pc2-`)
      || row.assignmentId === completedAssignmentId
    ))
    .map(row => clone(row));
  assert.equal(
    protectedBefore.filter(row => row.requestKey.includes(
      commands.recoveryFenceIdempotencyKey,
    )).length,
    1,
  );
  const oldestHistoricalKey = fixture.tables.workerCommandIdempotencyV1.rows
    .filter(row => row.requestKey.includes(':historical-noop-'))
    .sort((left, right) => left.requestKey.localeCompare(right.requestKey))[0]!
    .requestKey;

  const second = dispatchGenericCanaryRoute(
    prepared,
    2,
    'generic-live-prune-dispatch-0002',
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assert.equal(second.idempotent, false);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(lookalikeKey),
    null,
  );
  assert.notEqual(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(oldestHistoricalKey),
    null,
  );
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.rows.filter(row => row.fid === fid).length,
    64,
  );
  for (const protectedRow of protectedBefore) {
    assert.deepEqual(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        protectedRow.requestKey,
      ),
      protectedRow,
    );
  }

  fixture.ctx.timestamp = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid,
    castle,
    workerId: routePlan.routes[1]!.workerId,
    idempotencyKey: 'generic-live-prune-recall-0002',
  }));
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(oldestHistoricalKey),
    null,
  );
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.rows.filter(row => row.fid === fid).length,
    64,
  );
  for (const protectedRow of protectedBefore) {
    assert.deepEqual(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        protectedRow.requestKey,
      ),
      protectedRow,
    );
  }
  assert.ok(fixture.tables.workerCommandIdempotencyV1.rows.some(row => (
    row.assignmentId === second.assignment?.assignmentId
    && row.commandKind === 'recall'
  )));
});

test('production canary all-pinned 64-row cap rolls back real dispatch and recall transactions', () => {
  const dispatchPrepared = prepareProductionPlayerCanaryFixture();
  dispatchPrepared.fixture.ctx.timestamp = timestamp(
    dispatchPrepared.registration.notAfterMicros,
  );
  assert.equal(recoverProductionCanaryOrdinal(dispatchPrepared, 0), 'fenced');
  fillProductionCanaryReceiptsWithPinnedRows(dispatchPrepared);
  const dispatchBefore = stateText(dispatchPrepared.fixture);
  const dispatchUuidBefore = dispatchPrepared.fixture.uuidSequence;
  assert.equal(
    errorCode(() => dispatchGenericCanaryRoute(
      dispatchPrepared,
      1,
      'generic-all-pinned-dispatch-0001',
      dispatchPrepared.registration.notAfterMicros + 1n,
    )),
    'WORKER_IDEMPOTENCY_RESERVED_CAPACITY',
  );
  assert.equal(stateText(dispatchPrepared.fixture), dispatchBefore);
  assert.equal(dispatchPrepared.fixture.uuidSequence, dispatchUuidBefore);

  const recallPrepared = prepareProductionPlayerCanaryFixture();
  recallPrepared.fixture.ctx.timestamp = timestamp(
    recallPrepared.registration.notAfterMicros,
  );
  assert.equal(recoverProductionCanaryOrdinal(recallPrepared, 0), 'fenced');
  const active = dispatchGenericCanaryRoute(
    recallPrepared,
    1,
    'generic-all-pinned-live-0001',
    recallPrepared.registration.notAfterMicros + 1n,
  );
  assert.ok(active.assignment);
  fillProductionCanaryReceiptsWithPinnedRows(recallPrepared);
  recallPrepared.fixture.ctx.timestamp = timestamp(
    recallPrepared.fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  const recallBefore = stateText(recallPrepared.fixture);
  const recallUuidBefore = recallPrepared.fixture.uuidSequence;
  assert.equal(errorCode(() => recallPrepared.fixture.transaction(() => (
    recallCastleWorker(recallPrepared.fixture.ctx, {
      fid: recallPrepared.fid,
      castle: recallPrepared.castle,
      workerId: recallPrepared.routePlan.routes[0]!.workerId,
      idempotencyKey: 'generic-all-pinned-recall-0001',
    })
  ))), 'WORKER_IDEMPOTENCY_RESERVED_CAPACITY');
  assert.equal(stateText(recallPrepared.fixture), recallBefore);
  assert.equal(recallPrepared.fixture.uuidSequence, recallUuidBefore);
});

test('production canary ordinal-zero injected mid-sweep fault rolls back every row and retries deterministically', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, baselineInput, registration } = prepared;
  dispatchProductionCanaryOrdinal(prepared, 1);
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  const before = stateText(fixture);
  const uuidBefore = fixture.uuidSequence;
  assert.throws(() => fixture.transaction(() => (
    recallProductionPlayerCanaryWorkerV1(fixture.ctx, {
      fid,
      castle,
      ...baselineInput,
      ordinal: 0,
    })
  ), 5), /INJECTED_TRANSACTION_FAULT/u);
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
});

test('production canary completed f00 rejects historical assignment occupation and schedule orphans without writes', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, routePlan, registration } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const assignmentTemplate = clone(dispatched.assignment);
  const occupationTemplate = clone(
    fixture.tables.workerNodeOccupationV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);

  const assertRejectedWithoutWrite = (insert: () => void, remove: () => void) => {
    insert();
    const before = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    remove();
  };
  assertRejectedWithoutWrite(
    () => fixture.tables.workerAssignmentV1.insert({
      ...assignmentTemplate,
      fid: 99_999n,
      workerId: 'orphan-worker-assignment',
    }),
    () => {
      fixture.tables.workerAssignmentV1.assignmentId.delete(
        assignmentTemplate.assignmentId,
      );
    },
  );
  assertRejectedWithoutWrite(
    () => fixture.tables.workerNodeOccupationV1.insert({
      ...occupationTemplate,
      workerId: 'orphan-worker-occupation',
      originCastleId: 99_999n,
    }),
    () => {
      fixture.tables.workerNodeOccupationV1.nodeKey.delete(
        occupationTemplate.nodeKey,
      );
    },
  );
  let orphanScheduleId = 0n;
  assertRejectedWithoutWrite(
    () => {
      const inserted = fixture.tables.workerAssignmentScheduleV1.insert({
        ...scheduleTemplate,
        scheduleId: 0n,
        workerId: 'orphan-worker-schedule',
      });
      orphanScheduleId = inserted.scheduleId;
    },
    () => {
      fixture.tables.workerAssignmentScheduleV1.scheduleId.delete(orphanScheduleId);
    },
  );
});

test('production canary pc2 replay is read-only after recall returning and terminal orphan variants', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, routePlan } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const assignmentTemplate = clone(dispatched.assignment);
  const occupationTemplate = clone(
    fixture.tables.workerNodeOccupationV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );

  assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'recalled');
  const returningBefore = stateText(fixture);
  const returningReplay = replayProductionCanaryOrdinalAtCurrentTime(prepared, 1);
  assert.equal(returningReplay.idempotent, true);
  assert.equal(returningReplay.assignment?.phase, 'returning');
  assert.equal(stateText(fixture), returningBefore);

  runNextWorkerSchedule(fixture, routePlan.routes[0]!.workerId);
  const terminalBefore = stateText(fixture);
  const terminalReplay = replayProductionCanaryOrdinalAtCurrentTime(prepared, 1);
  assert.equal(terminalReplay.idempotent, true);
  assert.equal(terminalReplay.assignment, undefined);
  assert.equal(stateText(fixture), terminalBefore);

  const assertTerminalOrphanRejected = (
    label: string,
    insert: () => void,
    remove: () => void,
  ) => {
    insert();
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    remove();
  };
  assertTerminalOrphanRejected(
    'assignment',
    () => fixture.tables.workerAssignmentV1.insert({
      ...assignmentTemplate,
      fid: 99_999n,
      workerId: 'pc2-replay-orphan-assignment',
    }),
    () => fixture.tables.workerAssignmentV1.assignmentId.delete(
      assignmentTemplate.assignmentId,
    ),
  );
  assertTerminalOrphanRejected(
    'occupation',
    () => fixture.tables.workerNodeOccupationV1.insert({
      ...occupationTemplate,
      workerId: 'pc2-replay-orphan-occupation',
      originCastleId: 99_999n,
    }),
    () => fixture.tables.workerNodeOccupationV1.nodeKey.delete(
      occupationTemplate.nodeKey,
    ),
  );
  let orphanScheduleId = 0n;
  assertTerminalOrphanRejected(
    'schedule',
    () => {
      orphanScheduleId = fixture.tables.workerAssignmentScheduleV1.insert({
        ...scheduleTemplate,
        scheduleId: 0n,
        workerId: 'pc2-replay-orphan-schedule',
      }).scheduleId;
    },
    () => fixture.tables.workerAssignmentScheduleV1.scheduleId.delete(
      orphanScheduleId,
    ),
  );
});

test('production canary terminal pc2 and generic receipts must be chronologically complete when observed', () => {
  for (const recalled of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    const workerId = routePlan.routes[0]!.workerId;
    if (recalled) {
      runNextWorkerSchedule(fixture, workerId);
      assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'recalled');
      runNextWorkerSchedule(fixture, workerId);
    } else {
      completeWorkerAssignmentNaturally(fixture, workerId);
    }
    const receipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${recalled
        ? commands.commands[0]!.recallIdempotencyKey
        : commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    receipt.createdAt = timestamp(
      receipt.createdAt.microsSinceUnixEpoch + 1n,
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }

  for (const recalled of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      recalled
        ? 'generic-terminal-chronology-recall-0001'
        : 'generic-terminal-chronology-natural-0001',
      registration.notAfterMicros,
    );
    const workerId = routePlan.routes[0]!.workerId;
    if (recalled) {
      runNextWorkerSchedule(fixture, workerId);
      recallOrdinaryCanaryRoute(
        prepared,
        1,
        'generic-terminal-chronology-recall-command-0001',
        fixture.ctx.timestamp.microsSinceUnixEpoch,
      );
      runNextWorkerSchedule(fixture, workerId);
    } else {
      completeWorkerAssignmentNaturally(fixture, workerId);
    }
    const receipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment!.assignmentId
      && (
        recalled
          ? row.commandKind === 'recall'
          : row.commandKind.startsWith('dispatch-v2:')
      )
    ))!;
    receipt.createdAt = timestamp(
      receipt.createdAt.microsSinceUnixEpoch + 1n,
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { fid, ...baselineInput },
    )) ?? '', /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u);
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }
});

test('production canary approval permanently blocks ordinary recall-all while leaving other FIDs unchanged', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, registration } = prepared;
  const assertBlocked = (atMicros: bigint, key: string) => {
    fixture.ctx.timestamp = timestamp(atMicros);
    const before = stateText(fixture);
    assert.equal(errorCode(() => fixture.transaction(() => (
      recallAllCastleWorkers(fixture.ctx, {
        fid,
        castle,
        idempotencyKey: key,
      })
    ))), 'PRODUCTION_PLAYER_CANARY_RECALL_ALL_PERMANENTLY_BLOCKED');
    assert.equal(stateText(fixture), before);
  };
  assertBlocked(registration.approvedAtMicros, 'blocked-recall-all-window-0001');
  assertBlocked(registration.notAfterMicros, 'blocked-recall-all-cutoff-0002');
  assertBlocked(registration.notAfterMicros + 1n, 'blocked-recall-all-after-0003');
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assertBlocked(registration.notAfterMicros + 2n, 'blocked-recall-all-f00-0004');

  const registrationRow = fixture.tables
    .productionPlayerCanaryApprovalRegistrationV1.fid.find(fid)!;
  registrationRow.commandKeyPolicyVersion = 'malformed-v1';
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros + 3n);
  const malformedBefore = stateText(fixture);
  assert.equal(errorCode(() => fixture.transaction(() => (
    recallAllCastleWorkers(fixture.ctx, {
      fid,
      castle,
      idempotencyKey: 'blocked-recall-all-malformed-0005',
    })
  ))), 'STATE_INTEGRITY');
  assert.equal(stateText(fixture), malformedBefore);

  const otherFid = 1_001n;
  const otherCastle = fixture.tables.castle.ownerFid.find(otherFid)!;
  fixture.transaction(() => recallAllCastleWorkers(fixture.ctx, {
    fid: otherFid,
    castle: otherCastle,
    idempotencyKey: 'other-fid-recall-all-allowed-0001',
  }));
  assert.notEqual(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${otherFid.toString()}:other-fid-recall-all-allowed-0001`,
    ),
    null,
  );
});

test('production canary preserves historical recall-all rows but rejects replay and post-registration topology', () => {
  const historical = prepareProductionPlayerCanaryFixture();
  const historicalKey = `${historical.fid.toString()}:historical-recall-all-0001`;
  const registeredAtMicros = historical.registration.registeredAtMicros;
  historical.fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: historicalKey,
    fid: historical.fid,
    workerId: undefined,
    commandKind: 'recall-all',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: 0n,
    createdAt: timestamp(registeredAtMicros - 1n),
  });
  historical.fixture.ctx.timestamp = timestamp(historical.registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(historical, 0), 'fenced');
  assert.notEqual(
    historical.fixture.tables.workerCommandIdempotencyV1.requestKey.find(historicalKey),
    null,
  );
  const replayBefore = stateText(historical.fixture);
  assert.equal(errorCode(() => historical.fixture.transaction(() => (
    recallAllCastleWorkers(historical.fixture.ctx, {
      fid: historical.fid,
      castle: historical.castle,
      idempotencyKey: 'historical-recall-all-0001',
    })
  ))), 'PRODUCTION_PLAYER_CANARY_RECALL_ALL_PERMANENTLY_BLOCKED');
  assert.equal(stateText(historical.fixture), replayBefore);

  const forbidden = prepareProductionPlayerCanaryFixture();
  const forbiddenKey = `${forbidden.fid.toString()}:forbidden-recall-all-0001`;
  forbidden.fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: forbiddenKey,
    fid: forbidden.fid,
    workerId: undefined,
    commandKind: 'recall-all',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: 0n,
    createdAt: timestamp(forbidden.registration.registeredAtMicros),
  });
  forbidden.fixture.ctx.timestamp = timestamp(forbidden.registration.notAfterMicros);
  const forbiddenBefore = stateText(forbidden.fixture);
  assert.match(
    errorCode(() => recoverProductionCanaryOrdinal(forbidden, 0)) ?? '',
    /RECEIPT_INVALID/u,
  );
  assert.equal(stateText(forbidden.fixture), forbiddenBefore);
  assert.notEqual(
    forbidden.fixture.tables.workerCommandIdempotencyV1.requestKey.find(forbiddenKey),
    null,
  );
});

test('production canary accepts exact postcutoff ordinary per-worker recall before f00 active and completed', () => {
  const active = prepareProductionPlayerCanaryFixture();
  const activeDispatch = dispatchProductionCanaryOrdinal(active, 1);
  assert.ok(activeDispatch.assignment);
  recallOrdinaryCanaryRoute(
    active,
    1,
    'ordinary-original-recall-active-0001',
    active.registration.notAfterMicros,
  );
  const activeAssignmentBefore = clone(
    active.fixture.tables.workerAssignmentV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    )!,
  );
  const activeWorkerBefore = clone(
    active.fixture.tables.castleWorkerV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    )!,
  );
  assert.equal(activeAssignmentBefore.phase, 'returning');
  assert.equal(recoverProductionCanaryOrdinal(active, 0), 'fenced');
  assert.deepEqual(
    active.fixture.tables.workerAssignmentV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    ),
    activeAssignmentBefore,
  );
  assert.deepEqual(
    active.fixture.tables.castleWorkerV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    ),
    activeWorkerBefore,
  );

  const completed = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(completed, 1);
  recallOrdinaryCanaryRoute(
    completed,
    1,
    'ordinary-original-recall-complete-0001',
    completed.registration.notAfterMicros,
  );
  runCurrentWorkerSchedule(completed.fixture, completed.routePlan.routes[0]!.workerId);
  assert.equal(
    completed.fixture.tables.workerAssignmentV1.workerId.find(
      completed.routePlan.routes[0]!.workerId,
    ),
    null,
  );
  assert.equal(recoverProductionCanaryOrdinal(completed, 0), 'fenced');
  const completedBefore = stateText(completed.fixture);
  assert.equal(recoverProductionCanaryOrdinal(completed, 0), 'fenced');
  assert.equal(stateText(completed.fixture), completedBefore);
});

test('production canary accepts exact dual pc2 plus ordinary no-op recall and rejects forged dual revisions', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, routePlan } = prepared;
  dispatchProductionCanaryOrdinal(prepared, 1);
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const pc2Recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  recallOrdinaryCanaryRoute(
    prepared,
    1,
    'ordinary-original-noop-after-f00-0001',
    registration.notAfterMicros,
  );
  const ordinaryKey = `${fid.toString()}:ordinary-original-noop-after-f00-0001`;
  const ordinary = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    ordinaryKey,
  )!;
  assert.equal(ordinary.resultRevision, pc2Recall.resultRevision);
  const exactBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), exactBefore);

  runCurrentWorkerSchedule(fixture, routePlan.routes[0]!.workerId);
  const canonicalRevision = ordinary.resultRevision;
  for (const forgedRevision of [1n, canonicalRevision + 1n, canonicalRevision + 99n]) {
    ordinary.resultRevision = forgedRevision;
    const forgedBefore = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID/u,
    );
    assert.equal(stateText(fixture), forgedBefore);
  }
  ordinary.resultRevision = canonicalRevision;
});

test('the bounded cutover status tracks every production phase and admission boundary', () => {
  const fixture = new Fixture();
  let status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseState, 'ready');
  assert.equal(status.activationMode, 'absent');
  assert.equal(status.releaseImportsExact, true);
  assert.equal(status.releaseVerificationExact, true);
  assert.equal(status.expectedCellCount, 601);
  assert.equal(status.importedPassableCellCount, 600);
  assert.equal(status.componentExpectedCellCount, 600);
  assert.equal(
    status.activationMutationsCompiled,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  assert.equal(status.currentFounderCount, 100);
  assert.equal(status.founderCapacityRemaining, 500);
  assert.equal(status.legacyClaimRows, 100n);
  assert.equal(status.legacyOccupiedWorldTileRows, 100n);
  assert.equal(status.activeSlotRows, 0n);
  assert.equal(status.activeResourceNodeRows, 0n);
  assert.equal(status.auditRows, 1n);
  assert.equal(status.legacyFoundingOpen, true);
  assert.equal(status.currentWorldGraphApplicable, false);
  assert.equal(status.activeAdmissionEligible, false);

  assert.equal(
    prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
    'prepared',
  );
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'prepared');
  assert.equal(status.rollbackEligible, true);
  assert.equal(status.legacyFoundingOpen, true);

  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'draining');
  assert.equal(status.legacyFoundingOpen, false);
  assert.equal(status.legacyJourneyDispatchOpen, false);

  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'planned');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'planned');
  assert.equal(status.plannedClaimRows, 100n);
  assert.equal(status.activeClaimRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, false);

  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseState, 'canary');
  assert.equal(status.activationMode, 'canary');
  assert.equal(status.atlasMode, 'canary');
  assert.equal(status.workerSystemV2Mode, 'canary');
  assert.equal(status.legacyRealmActive, false);
  assert.equal(status.legacyClaimRows, 0n);
  assert.equal(status.legacyOccupiedWorldTileRows, 0n);
  assert.equal(status.greaterRealmClaimRows, 100n);
  assert.equal(status.greaterRealmOccupancyRows, 100n);
  assert.equal(status.activeSlotRows, 600n);
  assert.equal(status.activeResourceNodeRows, 12_000n);
  assert.equal(status.relocatedClaimRows, 100n);
  assert.equal(status.foundedClaimRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, true);
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.currentWorldIntegrityViolationCount, 0);
  assert.equal(status.rollbackEligible, true);
  assert.equal(status.activeAdmissionEligible, false);
  assert.equal(
    status.lowlandsFounderCount
      + status.frostmereFounderCount
      + status.sunscarFounderCount
      + status.mirefenFounderCount
      + status.stonewakeFounderCount
      + status.emberwoodFounderCount,
    100,
  );
  for (const journeyField of [
    'goldNodeOccupationRows',
    'goldExpeditionRows',
    'goldExpeditionScheduleRows',
    'foodNodeOccupationRows',
    'foodExpeditionRows',
    'foodExpeditionScheduleRows',
    'woodNodeOccupationRows',
    'woodExpeditionRows',
    'woodExpeditionScheduleRows',
    'stoneNodeOccupationRows',
    'stoneExpeditionRows',
    'stoneExpeditionScheduleRows',
    'workerAssignmentRows',
    'workerNodeOccupationRows',
    'workerAssignmentScheduleRows',
  ] as const) assert.equal(status[journeyField], 0n, journeyField);

  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'active');
  assert.equal(status.everActive, true);
  assert.equal(status.rollbackEligible, false);
  assert.equal(status.resumeEligible, false);
  assert.equal(status.activeAdmissionEligible, true);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'halted');
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.resumeEligible, true);
  assert.equal(status.activeAdmissionEligible, false);

  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'active');
  assert.equal(status.activeAdmissionEligible, true);

  fixture.tables.greaterRealmReleaseV1.rows[0]!.verifiedSlotCount = 599;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, true);
  assert.equal(status.releaseVerificationExact, false);
  assert.equal(status.currentWorldGraphExact, false);
  assert.equal(status.currentWorldIntegrityViolationCount, 1);
  assert.equal(status.activeAdmissionEligible, false);

  fixture.tables.greaterRealmReleaseV1.rows[0]!.verifiedSlotCount = 600;
  fixture.tables.greaterRealmReleaseV1.rows[0]!.componentExpectedCellCount = 601;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, false);
  assert.equal(status.releaseVerificationExact, false);
  fixture.tables.greaterRealmReleaseV1.rows[0]!.componentExpectedCellCount = 600;
  fixture.tables.greaterRealmReleaseV1.rows[0]!.importedPassableCellCount = 601;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, false);
  assert.equal(status.releaseVerificationExact, false);
});

test('each changed cutover transition adds one fixed audit row while exact retries add none', () => {
  const fixture = new Fixture();
  const actorSubject = 'admin:audit-fixture';
  const transitions = [
    ['prepare_greater_realm_activation_v1', 'prepared', () => (
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, actorSubject)
    )],
    ['begin_greater_realm_drain_v1', 'draining', () => (
      beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx)
    )],
    ['freeze_greater_realm_activation_v1', 'frozen', () => (
      freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['plan_greater_realm_relocation_v1', 'planned', () => (
      planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['relocate_greater_realm_canary_v1', 'canary', () => (
      relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)
    )],
    ['commit_greater_realm_active_v1', 'active', () => (
      commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)
    )],
    ['halt_greater_realm_activation_v1', 'halted', () => (
      haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['resume_greater_realm_active_v1', 'active', () => (
      resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)
    )],
  ] as const;

  for (const [action, changedResult, run] of transitions) {
    const before = fixture.tables.adminAudit.count();
    assert.equal(
      fixture.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
        fixture.ctx,
        actorSubject,
        action,
        run,
      )),
      changedResult,
      action,
    );
    assert.equal(fixture.tables.adminAudit.count(), before + 1n, action);
    assert.equal(projectGreaterRealmCutoverStatusV1(fixture.ctx).auditRows, before + 1n, action);
    const row = fixture.tables.adminAudit.rows.at(-1)!;
    assert.equal(row.action, action);
    assert.equal(row.targetFid, undefined);
    assert.equal(row.actorSubject, actorSubject);
    assert.deepEqual(row.createdAt, NOW);
    assert.equal(row.note, GREATER_REALM_CUTOVER_AUDIT_NOTE_V1);

    assert.equal(
      fixture.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
        fixture.ctx,
        actorSubject,
        action,
        run,
      )),
      'unchanged',
      `${action} retry`,
    );
    assert.equal(fixture.tables.adminAudit.count(), before + 1n, `${action} retry`);
  }

  const rollback = new Fixture();
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'prepare_greater_realm_activation_v1',
      () => prepareGreaterRealmActivationAuthorizedTransactionV1(rollback.ctx, actorSubject),
    )),
    'prepared',
  );
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'rollback_greater_realm_before_commit_v1',
      () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx),
    )),
    'rolled-back',
  );
  assert.equal(projectGreaterRealmCutoverStatusV1(rollback.ctx).auditRows, 3n);
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'rollback_greater_realm_before_commit_v1',
      () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx),
    )),
    'unchanged',
  );
  assert.equal(projectGreaterRealmCutoverStatusV1(rollback.ctx).auditRows, 3n);
});

test('audit insertion faults roll back both a small transition and the full canary transaction', () => {
  const actorSubject = 'admin:audit-fault';
  const prepare = new Fixture();
  const preparedBefore = stateText(prepare);
  assert.equal(
    errorCode(() => prepare.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      prepare.ctx,
      actorSubject,
      'prepare_greater_realm_activation_v1',
      () => prepareGreaterRealmActivationAuthorizedTransactionV1(prepare.ctx, actorSubject),
    ), 2)),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(prepare), preparedBefore);

  const canary = new Fixture();
  advanceToPlanned(canary);
  const plannedSnapshot = canary.snapshot();
  const plannedText = stateText(canary);
  assert.equal(
    canary.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      canary.ctx,
      actorSubject,
      'relocate_greater_realm_canary_v1',
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(canary.ctx),
    )),
    'canary',
  );
  const auditMutation = canary.mutationCount;
  assert.ok(auditMutation > 1_000);
  canary.restore(plannedSnapshot);
  assert.equal(
    errorCode(() => canary.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      canary.ctx,
      actorSubject,
      'relocate_greater_realm_canary_v1',
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(canary.ctx),
    ), auditMutation)),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(canary), plannedText);
});

test('cutover status proves rollback restoration and closes admission at exact capacity', () => {
  const rollback = new Fixture();
  advanceToPlanned(rollback);
  rollback.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(rollback.ctx));
  assert.equal(
    rollback.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx)),
    'rolled-back',
  );
  let status = projectGreaterRealmCutoverStatusV1(rollback.ctx);
  assert.equal(status.activationMode, 'rolled-back');
  assert.equal(status.releaseState, 'ready');
  assert.equal(status.rollbackEligible, false);
  assert.equal(status.legacyFoundingOpen, true);
  assert.equal(status.legacyClaimRows, 100n);
  assert.equal(status.legacyOccupiedWorldTileRows, 100n);
  assert.equal(status.greaterRealmClaimRows, 0n);
  assert.equal(status.greaterRealmOccupancyRows, 0n);
  assert.equal(status.activeSlotRows, 0n);
  assert.equal(status.activeResourceNodeRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, false);
  assert.equal(status.activeAdmissionEligible, false);

  const full = new Fixture();
  advanceToActive(full);
  for (let index = 0; index < 500; index += 1) {
    addOnePostCommitFounder(full, BigInt(50_000 + index));
  }
  status = projectGreaterRealmCutoverStatusV1(full.ctx);
  assert.equal(status.currentFounderCount, 600);
  assert.equal(status.founderCapacityRemaining, 0);
  assert.equal(status.greaterRealmClaimRows, 600n);
  assert.equal(status.greaterRealmOccupancyRows, 600n);
  assert.equal(status.relocatedClaimRows, 100n);
  assert.equal(status.foundedClaimRows, 500n);
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.activeAdmissionEligible, false);
  for (const count of [
    status.lowlandsFounderCount,
    status.frostmereFounderCount,
    status.sunscarFounderCount,
    status.mirefenFounderCount,
    status.stonewakeFounderCount,
    status.emberwoodFounderCount,
  ]) assert.equal(count, 100);
});

test('cutover status keeps a disabled founder globally exact and proves only an exact v17 re-enable target', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const allowed = fixture.tables.allowedFid.fid.find(1_001n)!;
  fixture.tables.allowedFid.fid.update({ ...allowed, enabled: false });

  let aggregate = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(aggregate.currentWorldGraphExact, true);
  assert.equal(aggregate.enabledAllowedFidRows, 99n);
  assert.equal(aggregate.activeAdmissionEligible, true);

  let target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.deepEqual(target, {
    currentWorldGraphApplicable: true,
    targetFounderGraphExact: true,
    targetAllowedEnabled: false,
    targetAuthEpoch: 1,
    targetRequestCycle: 2n,
    targetRequestedAtMicros: 1n,
    targetReenableEligible: true,
  });

  fixture.tables.accessRequestV1.fid.update({
    ...fixture.tables.accessRequestV1.fid.find(1_001n)!,
    requestCycle: 3n,
  });
  target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.equal(target.targetFounderGraphExact, true);
  assert.equal(target.targetReenableEligible, false);

  fixture.tables.accessRequestV1.fid.update({
    ...fixture.tables.accessRequestV1.fid.find(1_001n)!,
    requestCycle: 2n,
  });
  fixture.tables.allowedFid.fid.update({
    ...fixture.tables.allowedFid.fid.find(1_001n)!,
    enabled: true,
    authEpoch: 2,
  });
  target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.equal(target.targetFounderGraphExact, true);
  assert.equal(target.targetAllowedEnabled, true);
  assert.equal(target.targetAuthEpoch, 2);
  assert.equal(target.targetReenableEligible, false);

  aggregate = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(aggregate.currentWorldGraphExact, true);
  assert.equal(aggregate.enabledAllowedFidRows, 100n);
});

test('the registered production boundary stays gate-ordered and privacy-safe', () => {
  attestCurrentGreaterRealmGateModeForTest(
    GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  const schema = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const reducers = readFileSync(new URL('../src/reducers/greaterRealm.ts', import.meta.url), 'utf8');
  const cutoverReducers = readFileSync(
    new URL('../src/reducers/greaterRealmCutover.ts', import.meta.url),
    'utf8',
  );
  const authority = readFileSync(new URL('../src/greaterRealmRelocationDormant.ts', import.meta.url), 'utf8');
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const snapshotAuthority = readFileSync(
    new URL('../src/greaterRealmRelocationSnapshot.ts', import.meta.url),
    'utf8',
  );
  const relocationAuthority = readFileSync(
    new URL('../src/greaterRealmRelocationAuthority.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(schema, /greaterRealmRelocationAuthority/);
  assert.doesNotMatch(reducers, /relocate_greater_realm|rollback_greater_realm|commit_greater_realm/);
  assert.match(indexSource, /GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1/);
  for (const name of [
    'admin_prepare_greater_realm_activation_v1',
    'admin_begin_greater_realm_drain_v1',
    'admin_freeze_greater_realm_activation_v1',
    'admin_plan_greater_realm_relocation_v1',
    'admin_relocate_greater_realm_canary_v1',
    'admin_commit_greater_realm_active_v1',
    'admin_halt_greater_realm_activation_v1',
    'admin_resume_greater_realm_active_v1',
    'admin_rollback_greater_realm_before_commit_v1',
    'admin_get_greater_realm_cutover_status_v1',
  ]) {
    assert.match(cutoverReducers, new RegExp(`name: '${name}'`), name);
  }
  const registeredBoundary = cutoverReducers.slice(
    cutoverReducers.indexOf('function authorizedActivation'),
    cutoverReducers.indexOf('export const adminPrepareGreaterRealmActivationV1'),
  );
  assert.ok(
    registeredBoundary.indexOf('requireGreaterRealmV17ActivationGate();')
      < registeredBoundary.indexOf('const admin = requireAdmin(ctx);'),
  );
  assert.doesNotMatch(
    cutoverReducers.slice(0, cutoverReducers.indexOf('function senderActivationError')),
    /actorSubject: t\.|fid: t\.|castleId: t\.|cellKey: t\.|slotId: t\.|centerQ: t\.|centerR: t\.|t\.array\(/,
  );
  const dormantBodies = [...authority.matchAll(/export function dormant[\s\S]*?\n\}\n/gu)]
    .map(match => match[0]);
  assert.equal(dormantBodies.length, 9);
  for (const body of dormantBodies) {
    assert.ok(
      body.indexOf('requireGreaterRealmV17ActivationGate();')
        < body.indexOf('requireAdmin(ctx)'),
      body,
    );
  }
  assert.doesNotMatch(authority, /centerQ|centerR|allocationRank: t\.|regionOrderRank: t\./);
  const topologyCapture = snapshotAuthority.slice(
    snapshotAuthority.indexOf('export function captureGreaterRealmFrozenTopologyV1'),
    snapshotAuthority.indexOf('export function assertGreaterRealmCanonicalIdleWorkersV1'),
  );
  assert.doesNotMatch(
    topologyCapture,
    /greaterRealm(?:Chunk|Cell|ResourceNode)V1\.iter\(\)/,
  );
  assert.doesNotMatch(snapshotAuthority, /realmChatMessageV1/);
  assert.doesNotMatch(relocationAuthority, /captureGreaterRealmProtectedDigestsV1/);
  assert.equal(
    [...relocationAuthority.matchAll(/requireStaticActivationState\(ctx,/gu)].length,
    2,
    'full static scans must remain encapsulated by the actual activation flip',
  );
  for (const path of [
    '../src/goldExpeditionAuthority.ts',
    '../src/foodExpeditionAuthority.ts',
    '../src/woodExpeditionAuthority.ts',
    '../src/stoneExpeditionAuthority.ts',
    '../src/castleWorkerAuthority.ts',
  ]) {
    const legacyDispatch = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(legacyDispatch, /greaterRealmLegacyJourneyDispatchIsOpenV1\(ctx\)/, path);
    assert.match(legacyDispatch, /GREATER_REALM_LEGACY_DISPATCH_CLOSED/, path);
  }
  const founding = readFileSync(new URL('../src/foundingAuthority.ts', import.meta.url), 'utf8');
  const ensureFounder = founding.slice(founding.indexOf('export function ensureGenesisFounder'));
  assert.ok(
    ensureFounder.indexOf("return 'preserved';")
      < ensureFounder.lastIndexOf('greaterRealmLegacyFoundingIsOpenV1(ctx)'),
  );
  assert.ok(
    ensureFounder.lastIndexOf('greaterRealmLegacyFoundingIsOpenV1(ctx)')
      < ensureFounder.indexOf('assertGenesisFoundingGraph(ctx, fid)'),
  );
});

test('prepare is bounded and preliminary; begin-drain closes ingress and freeze rebinds quiet authority', () => {
  const fixture = new Fixture();
  makeFirstWorkerOutbound(fixture);
  const snapshot = captureGreaterRealmPreparedSnapshotV1(fixture.ctx);
  assert.equal(snapshot.castleCount, 100);
  assert.equal(snapshot.workerCount, 400);
  assert.equal(snapshot.resourceAccountCount, 100);
  assert.equal(snapshot.markAccountCount, 100);
  assert.equal(snapshot.claimCount, 0);
  assert.equal(snapshot.occupancyCount, 0);
  assert.equal(snapshot.journeyCounts.worker_assignment_v1, 1n);
  assert.equal(snapshot.journeyCounts.worker_node_occupation_v1, 1n);
  assert.equal(snapshot.journeyCounts.worker_assignment_schedule_v_1, 1n);
  assert.equal(new Set([
    snapshot.castleDigest,
    snapshot.workerDigest,
    snapshot.resourceDigest,
    snapshot.marksDigest,
    snapshot.innerKeepDigest,
    snapshot.scheduleDigest,
    snapshot.topologyDigest,
  ]).size, 7);
  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'prepared');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
  assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), true);
  fixture.tables.resourceAccountV1.rows[0]!.food += 1n;
  fixture.tables.resourceAccountV1.rows[0]!.revision += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate-pre-drain-chat';
  const beforeRetry = stateText(fixture);
  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'unchanged');
  assert.equal(stateText(fixture), beforeRetry);
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), false);
  assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), false);
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(
    errorCode(() => freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
  clearFirstWorkerJourney(fixture);
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  fixture.tables.workerCommandIdempotencyV1.rows.push({
    requestKey: '1001:recall-after-freeze',
    fid: 1_001n,
    commandKind: 'recall',
    workerId: 'castle-1:worker-1',
    resultRevision: 0n,
    createdAt: NOW,
  });
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'planned');

  const unusedStaticDrift = new Fixture();
  unusedStaticDrift.tables.worldTileMetaV1.rows.at(-1)!.terrainKind = 'drifted';
  assert.equal(
    errorCode(() => captureGreaterRealmPreparedSnapshotV1(unusedStaticDrift.ctx)),
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
});

test('founding and dispatch may land after prepare; freeze binds the post-drain founder graph', () => {
  const fixture = new Fixture();
  const fid = 1_100n;
  const castleId = 100n;
  const removed = new Map<string, Row[]>();
  for (const [tableName, field, value] of [
    ['allowedFid', 'fid', fid],
    ['castle', 'castleId', castleId],
    ['castleSlotClaimV1', 'castleId', castleId],
    ['realmProfileV1', 'fid', fid],
    ['markAccountV1', 'fid', fid],
    ['resourceAccountV1', 'fid', fid],
    ['castleWorkerV1', 'originCastleId', castleId],
  ] as const) {
    const table = fixture.tables[tableName]!;
    const rows = table.rows.filter(row => row[field] === value);
    removed.set(tableName, clone(rows));
    table.rows = table.rows.filter(row => row[field] !== value);
  }
  const oldTile = fixture.tables.worldTile.rows.find(row => row.occupantCastleId === castleId)!;
  oldTile.occupantCastleId = undefined;
  const system = fixture.tables.realmWorkerSystemV1.rows[0]!;
  system.expectedCastleCount = 99;
  system.expectedWorkerCount = 396;
  system.rosterDigest = rosterDigestForCastleIds(
    fixture.tables.castle.rows.map(row => row.castleId),
  );

  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'prepared');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotCastleCount, 99);

  for (const [tableName, rows] of removed) fixture.tables[tableName]!.rows.push(...clone(rows));
  oldTile.occupantCastleId = castleId;
  system.expectedCastleCount = 100;
  system.expectedWorkerCount = 400;
  system.rosterDigest = rosterDigestForCastleIds(
    fixture.tables.castle.rows.map(row => row.castleId),
  );
  makeFirstWorkerOutbound(fixture);

  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'unchanged');
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  assert.equal(
    errorCode(() => freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
  clearFirstWorkerJourney(fixture);
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotCastleCount, 100);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotWorkerCount, 400);
});

test('the server reads exactly the audited 15-table zero gate and rejects each nonzero table', () => {
  const fixture = new Fixture();
  assert.deepEqual(Object.keys(greaterRealmJourneyCountsV1(fixture.ctx)), GREATER_REALM_JOURNEY_TABLES);
  const physical: Record<string, string> = {
    gold_node_occupation_v1: 'goldNodeOccupationV1',
    gold_expedition_v1: 'goldExpeditionV1',
    gold_expedition_schedule_v_1: 'goldExpeditionScheduleV1',
    food_node_occupation_v1: 'foodNodeOccupationV1',
    food_expedition_v1: 'foodExpeditionV1',
    food_expedition_schedule_v_1: 'foodExpeditionScheduleV1',
    wood_node_occupation_v1: 'woodNodeOccupationV1',
    wood_expedition_v1: 'woodExpeditionV1',
    wood_expedition_schedule_v_1: 'woodExpeditionScheduleV1',
    stone_node_occupation_v1: 'stoneNodeOccupationV1',
    stone_expedition_v1: 'stoneExpeditionV1',
    stone_expedition_schedule_v_1: 'stoneExpeditionScheduleV1',
    worker_assignment_v1: 'workerAssignmentV1',
    worker_node_occupation_v1: 'workerNodeOccupationV1',
    worker_assignment_schedule_v_1: 'workerAssignmentScheduleV1',
  };
  for (const name of GREATER_REALM_JOURNEY_TABLES) {
    const table = fixture.tables[physical[name]!]!;
    table.rows.push({ [table.primary]: `busy-${name}` });
    assert.equal(errorCode(() => requireGreaterRealmQuietWindowV1(fixture.ctx)), 'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY', name);
    table.rows.length = 0;
  }
});

test('missing, extra, or malformed nonidle workers close the snapshot boundary', () => {
  for (const change of ['missing', 'extra', 'nonidle'] as const) {
    const fixture = new Fixture();
    if (change === 'missing') fixture.tables.castleWorkerV1.rows.pop();
    if (change === 'extra') fixture.tables.castleWorkerV1.rows.push({
      ...fixture.tables.castleWorkerV1.rows[0], workerId: 'castle-1:worker-5', ordinal: 5,
    });
    if (change === 'nonidle') fixture.tables.castleWorkerV1.rows[0]!.status = 'outbound';
    assert.match(
      errorCode(() => captureGreaterRealmPreparedSnapshotV1(fixture.ctx)) ?? '',
      /GREATER_REALM_WORKER_/,
      change,
    );
  }
});

test('prepared and draining rollback preserve live v16 journeys, accept nonidle workers, and reopen ingress', () => {
  for (const phase of ['prepared', 'draining'] as const) {
    const fixture = new Fixture();
    const active = makeFirstWorkerOutbound(fixture);
    if (phase === 'prepared') {
      const beforeRows = captureGreaterRealmJourneyRowsDigestV1(fixture.ctx);
      fixture.tables.workerAssignmentV1.rows[0]!.updatedAt = NOW;
      const afterRows = captureGreaterRealmJourneyRowsDigestV1(fixture.ctx);
      assert.notEqual(afterRows, beforeRows);
      fixture.tables.workerAssignmentV1.rows[0]!.updatedAt = CREATED;
    }
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    if (phase === 'draining') {
      assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
      assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), false);
    }
    assert.equal(
      fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)),
      'rolled-back',
    );
    assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
    assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), true);
    assert.deepEqual(fixture.tables.castleWorkerV1.rows[0], active.worker);
    assert.deepEqual(fixture.tables.workerAssignmentV1.rows, [active.assignment]);
    assert.deepEqual(fixture.tables.workerNodeOccupationV1.rows, [active.occupation]);
    assert.deepEqual(fixture.tables.workerAssignmentScheduleV1.rows, [active.schedule]);
    const beforeRetry = stateText(fixture);
    assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx), 'unchanged');
    assert.equal(stateText(fixture), beforeRetry);
  }
});

test('closed-phase founding replay is byte-identical while repair and fresh founding stay rejected', () => {
  const readyFixture = (): Fixture => {
    const fixture = new Fixture();
    fixture.tables.innerKeepLayoutV1.rows = [];
    fixture.tables.castleInnerBuilderV1.rows = [];
    fixture.tables.realmProfileV1.rows[0]!.pfpUrl = 'https://example.com/founder.png';
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
    return fixture;
  };
  const admission = {
    canonicalUsername: 'founder1',
    displayName: 'Founder 1',
    pfpUrl: 'https://example.com/founder.png',
    publicBio: undefined,
  };

  const replay = readyFixture();
  const replayBefore = stateText(replay);
  assert.equal(ensureGenesisFounder(replay.ctx, 1_001n, admission), 'preserved');
  assert.equal(stateText(replay), replayBefore);

  const repair = readyFixture();
  repair.tables.castleWorkerV1.rows.shift();
  const repairBefore = stateText(repair);
  assert.match(errorCode(() => ensureGenesisFounder(repair.ctx, 1_001n, admission)) ?? '', /WORKER_/);
  assert.equal(stateText(repair), repairBefore);

  const fresh = readyFixture();
  const freshBefore = stateText(fresh);
  assert.equal(
    errorCode(() => ensureGenesisFounder(fresh.ctx, 9_999n, {
      ...admission,
      canonicalUsername: 'new-founder',
    })),
    'GREATER_REALM_FOUNDING_REQUIRES_V17_AUTHORITY',
  );
  assert.equal(stateText(fresh), freshBefore);

  const postCanary = readyFixture();
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(postCanary.ctx), 'frozen');
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(postCanary.ctx), 'planned');
  assert.equal(
    postCanary.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(postCanary.ctx)),
    'canary',
  );
  const postCanaryBefore = stateText(postCanary);
  assert.equal(ensureGenesisFounder(postCanary.ctx, 1_001n, admission), 'preserved');
  assert.equal(stateText(postCanary), postCanaryBefore);
  assert.equal(errorCode(() => postCanary.transaction(() => {
    insertIntendedAdmission(postCanary, 9_998n);
    ensureGenesisFounder(postCanary.ctx, 9_998n, {
      ...admission,
      canonicalUsername: 'canary-founder',
    });
  })), 'GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
  assert.equal(stateText(postCanary), postCanaryBefore);

  const staleProfile = postCanary.tables.realmProfileV1.fid.find(1_001n)!;
  staleProfile.marksBalanceMicros = 5n;
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(postCanary.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  assert.doesNotThrow(() => assertGenesisFounderForProfileRepair(postCanary.ctx, 1_001n));
  staleProfile.marksBalanceMicros = undefined;
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(postCanary.ctx, 1_001n).source,
    'v17',
  );
});

test('100 existing castles receive a frozen balanced 17/16 Tier-I multiset with complete preimages', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  const claims = [...fixture.tables.greaterRealmCastleClaimV1.rows]
    .sort((a, b) => Number(a.allocationSequence - b.allocationSequence));
  assert.equal(claims.length, 100);
  assert.equal(activation.snapshotClaimCount, 100);
  assert.equal(activation.nextAllocationSequence, 100n);
  assert.match(activation.topologySnapshotDigest, /^[0-9a-f]{64}$/);
  assert.match(activation.relocationPlanDigest, /^[0-9a-f]{64}$/);
  const counts = Object.fromEntries(GREATER_REALM_TIER_ONE_REGION_IDS.map(id => [id, 0]));
  for (const claim of claims) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!;
    counts[slot.regionId] += 1;
    for (const field of [
      'legacySlotId', 'legacyClaimedAt', 'legacyGenerationVersion',
      'legacyTileKey', 'legacyQ', 'legacyR',
    ]) assert.notEqual(claim[field], undefined, `${claim.slotId}:${field}`);
  }
  assert.deepEqual(Object.values(counts).sort((a, b) => a - b), [16, 16, 17, 17, 17, 17]);
  const beforeRetry = stateText(fixture);
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), beforeRetry);
});

test('v17 topology and frozen founder/worker identity drift reject canary before writes', () => {
  const topology = new Fixture();
  advanceToPlanned(topology);
  topology.tables.greaterRealmCellV1.rows[0]!.atlasQ += 1;
  const topologyBefore = stateText(topology);
  assert.match(
    errorCode(() => topology.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(topology.ctx))) ?? '',
    /GREATER_REALM_(?:TOPOLOGY|ALLOCATION|SLOT)/,
  );
  assert.equal(stateText(topology), topologyBefore);

  const finalizedReceipt = new Fixture();
  advanceToPlanned(finalizedReceipt);
  finalizedReceipt.tables.greaterRealmReleaseV1.rows[0]!.verificationDigest = SHA_A;
  const finalizedReceiptBefore = stateText(finalizedReceipt);
  assert.equal(
    errorCode(() => finalizedReceipt.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(finalizedReceipt.ctx),
    )),
    'GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED',
  );
  assert.equal(stateText(finalizedReceipt), finalizedReceiptBefore);

  const unverifiedComponent = new Fixture();
  advanceToPlanned(unverifiedComponent);
  unverifiedComponent.tables.greaterRealmNavigationComponentV1.rows[0]!.active = false;
  const unverifiedComponentBefore = stateText(unverifiedComponent);
  assert.equal(
    errorCode(() => unverifiedComponent.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(unverifiedComponent.ctx),
    )),
    'GREATER_REALM_COMPONENT_ACTIVATION_INVALID',
  );
  assert.equal(stateText(unverifiedComponent), unverifiedComponentBefore);

  const planDrift = new Fixture();
  advanceToPlanned(planDrift);
  planDrift.tables.greaterRealmCastleClaimV1.rows[0]!.plannedAt = timestamp(10_001n);
  const planDriftBefore = stateText(planDrift);
  assert.equal(
    errorCode(() => planDrift.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(planDrift.ctx),
    )),
    'GREATER_REALM_ROLLBACK_PREIMAGE_INCOMPLETE',
  );
  assert.equal(stateText(planDrift), planDriftBefore);

  for (const [table, mutate] of [
    ['castleWorkerV1', (row: Row) => { row.revision += 1n; }],
    ['realmV1', (row: Row) => { row.publicName = 'Drifted'; }],
    ['worldTileMetaV1', (row: Row) => { row.terrainKind = 'drifted'; }],
  ] as const) {
    const fixture = new Fixture();
    advanceToPlanned(fixture);
    mutate(fixture.tables[table]!.rows[0]!);
    const before = stateText(fixture);
    assert.equal(
      errorCode(() => fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx))),
      'GREATER_REALM_CUTOVER_SNAPSHOT_STALE',
      table,
    );
    assert.equal(stateText(fixture), before);
  }
});

test('every pre-canary exact retry rejects hostile roots, release state, and active targets', () => {
  for (const phase of ['prepared', 'draining', 'frozen', 'planned'] as const) {
    const fixture = new Fixture();
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    if (phase !== 'prepared') beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx);
    if (phase === 'frozen' || phase === 'planned') {
      freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx);
    }
    if (phase === 'planned') planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx);
    const retry = () => phase === 'prepared'
      ? prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture')
      : phase === 'draining'
        ? beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx)
        : phase === 'frozen'
          ? freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
          : planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx);
    const valid = fixture.snapshot();
    for (const [name, mutate] of [
      ['unexpected root', () => fixture.tables.realmAtlasV1.rows.push({ atlasId: 'forged' })],
      ['release state', () => { fixture.tables.greaterRealmReleaseV1.rows[0]!.state = 'canary'; }],
      ['active target slot', () => { fixture.tables.greaterRealmCastleSlotV1.rows[0]!.active = true; }],
    ] as const) {
      fixture.restore(valid);
      mutate();
      assert.notEqual(errorCode(retry), undefined, `${phase}:${name}`);
    }
    fixture.restore(valid);
    if (phase === 'planned') {
      fixture.tables.greaterRealmCellOccupancyV1.rows.push({ cellKey: 'forged' });
      assert.equal(
        errorCode(retry),
        'GREATER_REALM_OCCUPANCY_TARGET_NOT_EMPTY',
      );
    }
  }
});

test('legitimate economy, Marks, profile, daily, Inner Keep, chat, access, and receipt activity may cross phases', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const resource = fixture.tables.resourceAccountV1.rows[0]!;
  resource.food += 1n;
  resource.revision += 1n;
  const marks = fixture.tables.markAccountV1.rows[0]!;
  marks.earnedMicros += 1n;
  marks.balanceMicros += 1n;
  marks.updatedAt = NOW;
  fixture.tables.realmProfileV1.rows[0]!.displayName = 'Legitimate Profile Update';
  fixture.tables.accessRequestV1.rows[0]!.requestCycle += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate chat during planning';
  fixture.tables.dailyMarkScheduleV1.rows[0]!.scheduledAt = {
    tag: 'Time', value: timestamp(3n),
  };
  fixture.tables.castleInnerBuilderV1.rows[0]!.revision += 1n;
  fixture.tables.workerCommandIdempotencyV1.rows.push({
    requestKey: '1001:harmless-recall',
    fid: 1_001n,
    commandKind: 'recall',
    workerId: fixture.tables.castleWorkerV1.rows[0]!.workerId,
    resultRevision: fixture.tables.castleWorkerV1.rows[0]!.revision,
    createdAt: NOW,
  });
  const before = fixture.snapshot();
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'canary'),
    stateOutsideRelocationWrites(before, 'canary'),
  );
});

test('append-only unrelated archives are never enumerated by canary or rollback', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const chat = fixture.tables.realmChatMessageV1;
  let archiveIterations = 0;
  chat.count = () => 65_537n;
  chat.iter = () => {
    archiveIterations += 1;
    throw new Error('UNBOUNDED_ARCHIVE_ENUMERATED');
  };
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.equal(
    fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)),
    'rolled-back',
  );
  assert.equal(archiveIterations, 0);
});

test('full static row scans occur only at actual activation flips, never phase retries', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  let componentIterations = 0;
  let resourceIterations = 0;
  const componentIter = fixture.tables.greaterRealmNavigationComponentV1.iter.bind(
    fixture.tables.greaterRealmNavigationComponentV1,
  );
  const resourceIter = fixture.tables.greaterRealmResourceNodeV1.iter.bind(
    fixture.tables.greaterRealmResourceNodeV1,
  );
  fixture.tables.greaterRealmNavigationComponentV1.iter = () => {
    componentIterations += 1;
    return componentIter();
  };
  fixture.tables.greaterRealmResourceNodeV1.iter = () => {
    resourceIterations += 1;
    return resourceIter();
  };
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.equal(componentIterations, 2);
  assert.equal(resourceIterations, 3);
  assert.equal(relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(componentIterations, 2);
  assert.equal(resourceIterations, 3);

  const rollback = new Fixture();
  advanceToPlanned(rollback);
  rollback.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(rollback.ctx));
  let rollbackComponentIterations = 0;
  let rollbackResourceIterations = 0;
  const rollbackComponentIter = rollback.tables.greaterRealmNavigationComponentV1.iter.bind(
    rollback.tables.greaterRealmNavigationComponentV1,
  );
  const rollbackResourceIter = rollback.tables.greaterRealmResourceNodeV1.iter.bind(
    rollback.tables.greaterRealmResourceNodeV1,
  );
  rollback.tables.greaterRealmNavigationComponentV1.iter = () => {
    rollbackComponentIterations += 1;
    return rollbackComponentIter();
  };
  rollback.tables.greaterRealmResourceNodeV1.iter = () => {
    rollbackResourceIterations += 1;
    return rollbackResourceIter();
  };
  assert.equal(
    rollback.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx)),
    'rolled-back',
  );
  assert.equal(rollbackComponentIterations, 2);
  assert.equal(rollbackResourceIterations, 3);
  assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx), 'unchanged');
  assert.equal(rollbackComponentIterations, 2);
  assert.equal(rollbackResourceIterations, 3);
});

test('canary relocates atomically, writes exactly eight public roots (1+6+1), and preserves unrelated bytes', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const beforeCastles = new Map(fixture.tables.castle.rows.map(row => [row.castleId, clone(row)]));
  const legacyRealmPreimage = clone(fixture.tables.realmV1.rows[0]!);
  const before = fixture.snapshot();
  assert.equal(fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)), 'canary');
  assert.equal(fixture.tables.realmAtlasV1.count(), 1n);
  assert.equal(fixture.tables.realmAtlasVisibleRegionV1.count(), 6n);
  assert.equal(fixture.tables.realmWorkerSystemV2.count(), 1n);
  assert.equal(fixture.tables.greaterRealmCellOccupancyV1.count(), 100n);
  assert.equal(fixture.tables.greaterRealmCastleClaimV1.count(), 100n);
  assert.equal(fixture.tables.castleSlotClaimV1.count(), 0n);
  assert.deepEqual(
    fixture.tables.realmV1.rows,
    [{ ...legacyRealmPreimage, active: false }],
  );
  for (const claim of fixture.tables.greaterRealmCastleClaimV1.rows) {
    assert.equal(claim.state, 'active');
    assert.notEqual(claim.activatedAt, undefined);
    const old = beforeCastles.get(claim.castleId)!;
    const current = fixture.tables.castle.castleId.find(claim.castleId)!;
    assert.deepEqual(
      Object.fromEntries(Object.entries(current).filter(([key]) => !['tileKey', 'q', 'r'].includes(key))),
      Object.fromEntries(Object.entries(old).filter(([key]) => !['tileKey', 'q', 'r'].includes(key))),
    );
    assert.equal(fixture.tables.worldTile.key.find(claim.legacyTileKey)!.occupantCastleId, undefined);
  }
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'canary'),
    stateOutsideRelocationWrites(before, 'canary'),
  );
  const retryBefore = stateText(fixture);
  assert.equal(relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), retryBefore);
});

test('current founder/resource authority changes only at canary and freezes migrated terrain to legacyTileKey', () => {
  const fixture = new Fixture();
  const fid = 1_001n;
  const legacyFounder = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  const legacyTerrain = greaterRealmCurrentPassiveTerrainV1(fixture.ctx, legacyFounder);
  assert.equal(legacyFounder.source, 'v16');
  advanceToPlanned(fixture);
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid).source, 'v16');
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const current = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  assert.equal(current.source, 'v17');
  assert.equal(current.castle.tileKey, current.greaterRealmOccupancy!.cellKey);
  assert.equal(greaterRealmCurrentPassiveTerrainV1(fixture.ctx, current), legacyTerrain);
  assert.equal(
    fixture.tables.worldTileMetaV1.tileKey.find(current.castle.tileKey),
    null,
    'the new cell is deliberately not a v16 passive-terrain key',
  );
});

test('steady-state v17 founder authority rejects claim, occupancy, atlas, worker, and region-root drift', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const cases: readonly [string, Row, () => void][] = [
    ['claim planned timestamp', fixture.tables.greaterRealmCastleClaimV1.rows[0]!, () => {
      fixture.tables.greaterRealmCastleClaimV1.rows[0]!.plannedAt = timestamp(9_999n);
    }],
    ['claim active timestamp', fixture.tables.greaterRealmCastleClaimV1.rows[0]!, () => {
      fixture.tables.greaterRealmCastleClaimV1.rows[0]!.activatedAt = timestamp(9_999n);
    }],
    ['occupancy timestamp', fixture.tables.greaterRealmCellOccupancyV1.rows[0]!, () => {
      fixture.tables.greaterRealmCellOccupancyV1.rows[0]!.occupiedAt = timestamp(9_999n);
    }],
    ['atlas protocol', fixture.tables.realmAtlasV1.rows[0]!, () => {
      fixture.tables.realmAtlasV1.rows[0]!.protocolVersion = 'drifted';
    }],
    ['worker policy', fixture.tables.realmWorkerSystemV2.rows[0]!, () => {
      fixture.tables.realmWorkerSystemV2.rows[0]!.policyVersion = 'drifted';
    }],
    ['region manifest', fixture.tables.realmAtlasVisibleRegionV1.rows[0]!, () => {
      fixture.tables.realmAtlasVisibleRegionV1.rows[0]!.cellCount += 1;
    }],
    ['legacy realm preimage', fixture.tables.realmV1.rows[0]!, () => {
      fixture.tables.realmV1.rows[0]!.publicName = 'drifted';
    }],
  ];
  for (const [name, row, mutate] of cases) {
    const original = clone(row);
    mutate();
    assert.equal(
      errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
      'STATE_INTEGRITY',
      name,
    );
    Object.assign(row, original);
  }
  fixture.tables.realmV1.rows.push({
    ...fixture.tables.realmV1.rows[0]!,
    realmId: 'EXTRA_REALM',
  });
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  fixture.tables.realmV1.rows.pop();
  fixture.tables.greaterRealmReleaseV1.rows.push({
    ...fixture.tables.greaterRealmReleaseV1.rows[0]!,
    atlasId: 'extra-release',
  });
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  fixture.tables.greaterRealmReleaseV1.rows.pop();
});

test('post-commit founded suffix stays balanced, exact, and live across retry and halt', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  const founded = addOnePostCommitFounder(fixture);
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, founded.fid).source,
    'v17',
  );
  const valid = fixture.snapshot();
  const hostile: readonly [string, () => void][] = [
    ['forged owner', () => {
      fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(founded.fid)!.ownerFid = 9_999n;
    }],
    ['skipped balanced rank', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.slotId = fixture.tables.greaterRealmCastleSlotV1.rows.find(slot => (
        !fixture.tables.greaterRealmCastleClaimV1.rows.some(row => row.slotId === slot.slotId)
      ))!.slotId;
    }],
    ['inactive founded slot', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!.active = false;
    }],
    ['duplicate occupancy owner', () => {
      fixture.tables.greaterRealmCellOccupancyV1.castleId.find(founded.castleId)!.castleId = 1n;
    }],
    ['precommit founded timestamp', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.plannedAt = timestamp(9_999n);
      claim.activatedAt = timestamp(9_999n);
    }],
    ['split founding transaction timestamp', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.plannedAt = timestamp(19_999n);
    }],
    ['missing fourth worker', () => {
      fixture.tables.castleWorkerV1.rows = fixture.tables.castleWorkerV1.rows.filter(row => (
        !(row.originCastleId === founded.castleId && row.ordinal === 4)
      ));
    }],
    ['foreign worker origin', () => {
      fixture.tables.castleWorkerV1.rows.find(row => (
        row.originCastleId === founded.castleId
      ))!.originCastleId = 1n;
    }],
    ['duplicate worker ordinal', () => {
      fixture.tables.castleWorkerV1.rows.find(row => (
        row.originCastleId === founded.castleId && row.ordinal === 2
      ))!.ordinal = 1;
    }],
  ];
  for (const [name, mutate] of hostile) {
    fixture.restore(valid);
    mutate();
    assert.equal(
      errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
      'STATE_INTEGRITY',
      name,
    );
  }
  fixture.restore(valid);
  fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount += 1;
  assert.match(
    errorCode(() => commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)) ?? '',
    /GREATER_REALM_(?:CLAIM|PUBLIC_ROOT)/,
  );
  fixture.restore(valid);
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, founded.fid).source,
    'v17',
  );
});

test('active v17 founding commits one graph and keeps the exact 101-castle Worker lifecycle live', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(30_000n);
  const fid = 8_001n;
  const admission = admissionProfileFor(fid);
  assert.equal(fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid);
    return ensureGenesisFounder(fixture.ctx, fid, admission);
  }), 'created');

  const founder = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  assert.equal(founder.source, 'v17');
  assert.equal(founder.greaterRealmClaim?.claimKind, 'founded');
  assert.equal(founder.greaterRealmClaim?.allocationSequence, 100n);
  const cell = fixture.tables.greaterRealmCellV1.cellKey.find(founder.castle.tileKey)!;
  assert.equal(
    greaterRealmCurrentPassiveTerrainV1(fixture.ctx, founder),
    cell.yieldClass === 2 ? 'meadow' : 'lowland',
  );
  assert.equal(GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION, 'greater-realm-founded-passive-yield-v1');
  assert.equal(fixture.tables.castleWorkerV1.byOriginCastle.filter(founder.castle.castleId).length, 4);
  assert.equal(
    fixture.tables.castleInnerBuilderV1.fid.find(fid)?.policyVersion,
    INNER_KEEP_POLICY_VERSION,
  );
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  assert.equal(activation.mode, 'active');
  assert.equal(activation.postCanaryFoundingCount, 1);
  assert.equal(activation.nextAllocationSequence, 101n);
  const workerV1 = fixture.tables.realmWorkerSystemV1.rows[0]!;
  const workerV2 = fixture.tables.realmWorkerSystemV2.rows[0]!;
  assert.equal(workerV1.expectedCastleCount, 101);
  assert.equal(workerV1.expectedWorkerCount, 404);
  assert.equal(workerV2.currentCastleCount, 101);
  assert.equal(workerV2.currentWorkerCount, 404);
  assert.equal(workerV2.rosterDigest, workerV1.rosterDigest);
  assert.equal(
    inspectCastleWorkerGraph(fixture.ctx).systemConfigValid,
    false,
    'the frozen rollout classifier remains capped at 100',
  );
  const currentWorkerHealth = inspectCastleWorkerGraphForCurrentGameplayV1(fixture.ctx);
  assert.equal(currentWorkerHealth.systemConfigValid, true);
  assert.equal(currentWorkerHealth.expectedCastleCount, 101n);
  assert.equal(currentWorkerHealth.expectedWorkerCount, 404n);
  assert.equal(currentWorkerHealth.rosterDigestMatches, true);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.food, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.wood, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.stone, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.gold, 0n);

  const workerControl = projectMyGreaterRealmWorkerStateV2(fixture.ctx, fid);
  assert.equal(workerControl.workers.length, 4);
  assert.ok(workerControl.workers.every(worker => worker.status === 'idle'));
  const sharedGameplayControl = projectMyWorkerStateForCurrentGameplayV1(
    fixture.ctx,
    fid,
  );
  assert.deepEqual(sharedGameplayControl.balances, workerControl.balances);
  assert.equal(sharedGameplayControl.workers.length, 4);
  const workerTarget = prepareGreaterRealmWorkerLocation(fixture, 'food', 1, fid);
  const naturalInput = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    workerTarget.locationId,
    'greater-worker-101-natural',
    fid,
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, naturalInput));
  const arrival = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(arrival.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, arrival));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'gathering');
  const expiry = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(expiry.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, expiry));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'returning');
  assert.equal(
    fixture.tables.workerAssignmentV1.workerId.find(naturalInput.workerId)!.materializedAmount,
    workerResourcePolicy('food').gatheringTotal,
  );
  const naturalReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(naturalReturn.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, naturalReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'idle');

  const recalledInput = greaterRealmDispatchInput(
    fixture,
    2,
    'food',
    workerTarget.locationId,
    'greater-worker-101-recalled',
    fid,
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, recalledInput));
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid,
    castle: recalledInput.castle,
    workerId: recalledInput.workerId,
    idempotencyKey: 'greater-worker-101-recall',
  }));
  const recalledReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    recalledInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(recalledReturn.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, recalledReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(recalledInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 2);

  const replayBefore = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid, admission), 'preserved');
  assert.equal(stateText(fixture), replayBefore);
  const staleProfile = fixture.tables.realmProfileV1.fid.find(fid)!;
  staleProfile.marksBalanceMicros = 1n;
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid)),
    'STATE_INTEGRITY',
  );
  assert.doesNotThrow(() => assertGenesisFounderForProfileRepair(fixture.ctx, fid));
});

test('serialized active founders consume distinct contiguous balanced allocations', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(31_000n);
  for (const fid of [8_101n, 8_102n]) {
    assert.equal(fixture.transaction(() => {
      insertIntendedAdmission(fixture, fid);
      return ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
    }), 'created');
  }
  const first = fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(8_101n)!;
  const second = fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(8_102n)!;
  assert.equal(first.allocationSequence, 100n);
  assert.equal(second.allocationSequence, 101n);
  assert.notEqual(first.slotId, second.slotId);
  const regionCounts = new Map<string, number>();
  for (const claim of fixture.tables.greaterRealmCastleClaimV1.rows) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!;
    regionCounts.set(slot.regionId, (regionCounts.get(slot.regionId) ?? 0) + 1);
  }
  const counts = [...regionCounts.values()];
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('fresh v17 founding rejects partial profile or Marks state and rolls it back exactly', () => {
  for (const preexisting of ['profile', 'marks'] as const) {
    const fixture = new Fixture();
    advanceToActive(fixture);
    enableCanonicalInnerKeep(fixture);
    fixture.ctx.timestamp = timestamp(32_000n);
    const fid = preexisting === 'profile' ? 8_201n : 8_202n;
    if (preexisting === 'profile') {
      fixture.tables.realmProfileV1.insert({
        ...fixture.tables.realmProfileV1.rows[0]!,
        fid,
        canonicalUsername: `partial${fid.toString()}`,
      });
    } else {
      fixture.tables.markAccountV1.insert({
        ...fixture.tables.markAccountV1.rows[0]!,
        fid,
      });
    }
    const before = stateText(fixture);
    assert.equal(errorCode(() => fixture.transaction(() => {
      insertIntendedAdmission(fixture, fid);
      ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
    })), 'GREATER_REALM_FOUNDER_NAMESPACE_CONFLICT', preexisting);
    assert.equal(stateText(fixture), before, preexisting);
  }
});

test('active v17 founding rolls every early, middle, and late write back atomically', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(33_000n);
  const fid = 8_301n;
  const before = stateText(fixture);
  for (const faultAt of [2, 5, 9, 13, 15]) {
    assert.equal(
      errorCode(() => fixture.transaction(() => {
        insertIntendedAdmission(fixture, fid);
        ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
      }, faultAt)),
      'INJECTED_TRANSACTION_FAULT',
      `fault ${faultAt}`,
    );
    assert.equal(stateText(fixture), before, `fault ${faultAt}`);
  }
});

test('the 600th v17 castle succeeds, the 601st fails, and capacity never blocks replay', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  for (let index = 0; index < 499; index += 1) {
    addOnePostCommitFounder(fixture, BigInt(20_000 + index));
  }
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(50_000n);
  const fid600 = 30_600n;
  const admission600 = admissionProfileFor(fid600);
  assert.equal(fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid600);
    return ensureGenesisFounder(fixture.ctx, fid600, admission600);
  }), 'created');
  assert.equal(fixture.tables.castle.count(), 600n);
  assert.equal(fixture.tables.castleWorkerV1.count(), 2_400n);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount, 500);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.nextAllocationSequence, 600n);
  assert.equal(fixture.tables.realmWorkerSystemV2.rows[0]!.currentCastleCount, 600);
  assert.equal(fixture.tables.realmWorkerSystemV2.rows[0]!.currentWorkerCount, 2_400);

  const control = projectMyGreaterRealmWorkerStateV2(fixture.ctx, fid600);
  assert.equal(control.resource.castleId, 600n);
  assert.equal(control.workers.length, 4);
  assert.ok(control.workers.every(worker => worker.status === 'idle'));
  const workerTarget = prepareGreaterRealmWorkerLocation(
    fixture,
    'wood',
    1,
    fid600,
  );
  const workerInput = greaterRealmDispatchInput(
    fixture,
    1,
    'wood',
    workerTarget.locationId,
    'greater-worker-capacity-0600',
    fid600,
  );
  const workerDispatch = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, workerInput)
  ));
  assert.equal(workerDispatch.leaseId, `${workerTarget.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 1);
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: fid600,
    castle: workerInput.castle,
    workerId: workerInput.workerId,
    idempotencyKey: 'greater-worker-capacity-recall-0600',
  }));
  const capacityReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    workerInput.workerId,
  )!;
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, capacityReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(workerInput.workerId)!.status, 'idle');

  const replayBefore = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid600, admission600), 'preserved');
  assert.equal(stateText(fixture), replayBefore);

  const fid601 = 30_601n;
  assert.equal(errorCode(() => fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid601);
    ensureGenesisFounder(fixture.ctx, fid601, admissionProfileFor(fid601));
  })), 'GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
  assert.equal(stateText(fixture), replayBefore);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  const haltedReplay = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid600, admission600), 'preserved');
  assert.equal(stateText(fixture), haltedReplay);
  assert.equal(errorCode(() => fixture.transaction(() => {
    insertIntendedAdmission(fixture, 30_602n);
    ensureGenesisFounder(fixture.ctx, 30_602n, admissionProfileFor(30_602n));
  })), 'GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
  assert.equal(stateText(fixture), haltedReplay);
});

test('fault injection demonstrates transaction rollback at early, middle, and late writes', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const planned = stateText(fixture);
  for (const faultAt of [1, 250, 7_000, 13_100]) {
    assert.equal(
      errorCode(() => fixture.transaction(
        () => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx),
        faultAt,
      )),
      'INJECTED_TRANSACTION_FAULT',
      `fault ${faultAt}`,
    );
    assert.equal(stateText(fixture), planned, `fault ${faultAt} escaped atomic rollback`);
  }
  assert.equal(fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)), 'canary');
});

test('zero-counter precommit rollback restores the byte-exact v16 topology and exact retry', () => {
  const fixture = new Fixture();
  const legacyRealmPreimage = clone(fixture.tables.realmV1.rows[0]!);
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const canaryState = stateText(fixture);
  for (const faultAt of [1, 250, 7_000, 13_100]) {
    assert.equal(
      errorCode(() => fixture.transaction(
        () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx),
        faultAt,
      )),
      'INJECTED_TRANSACTION_FAULT',
      `rollback fault ${faultAt}`,
    );
    assert.equal(
      stateText(fixture),
      canaryState,
      `rollback fault ${faultAt} escaped atomic rollback`,
    );
  }
  fixture.tables.resourceAccountV1.rows[0]!.food += 1n;
  fixture.tables.resourceAccountV1.rows[0]!.revision += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate post-canary activity';
  const beforeRollback = fixture.snapshot();
  assert.equal(fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)), 'rolled-back');
  assert.equal(fixture.tables.greaterRealmCastleClaimV1.count(), 0n);
  assert.equal(fixture.tables.greaterRealmCellOccupancyV1.count(), 0n);
  assert.equal(fixture.tables.castleSlotClaimV1.count(), 100n);
  assert.equal(fixture.tables.realmAtlasV1.count(), 0n);
  assert.equal(fixture.tables.realmAtlasVisibleRegionV1.count(), 0n);
  assert.equal(fixture.tables.realmWorkerSystemV2.count(), 0n);
  assert.deepEqual(fixture.tables.realmV1.rows, [legacyRealmPreimage]);
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'rollback'),
    stateOutsideRelocationWrites(beforeRollback, 'rollback'),
  );
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n).source, 'v16');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
  makeFirstWorkerOutbound(fixture);
  const retryBefore = stateText(fixture);
  assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), retryBefore);
});

test('post-canary counters and active commit irreversibly close rollback; halt preserves current v17 authority', () => {
  const counter = new Fixture();
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(counter.ctx), true);
  advanceToPlanned(counter);
  counter.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(counter.ctx));
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(counter.ctx), false);
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(counter.ctx), 'active');
  counter.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount = 1;
  const beforeCounterRollback = stateText(counter);
  assert.equal(
    errorCode(() => counter.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(counter.ctx))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(stateText(counter), beforeCounterRollback);

  const committed = new Fixture();
  advanceToPlanned(committed);
  committed.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(committed.ctx));
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'active');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(committed.ctx), 'halted');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(committed.ctx), 'unchanged');
  const activationHistory = clone(committed.tables.greaterRealmActivationV1.rows[0]!);
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'active');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'unchanged');
  assert.equal(committed.tables.greaterRealmActivationV1.rows[0]!.mode, 'active');
  assert.deepEqual(
    committed.tables.greaterRealmActivationV1.rows[0]!.activatedAt,
    activationHistory.activatedAt,
  );
  assert.deepEqual(
    committed.tables.greaterRealmActivationV1.rows[0]!.haltedAt,
    activationHistory.haltedAt,
  );
  assert.equal(committed.tables.greaterRealmReleaseV1.rows[0]!.state, 'active');
  assert.equal(committed.tables.realmAtlasV1.rows[0]!.mode, 'active');
  assert.equal(committed.tables.realmWorkerSystemV2.rows[0]!.mode, 'active');
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(committed.ctx, 1_001n).source, 'v17');
  assert.equal(
    errorCode(() => committed.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(committed.ctx))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(committed.tables.greaterRealmActivationV1.rows[0]!.mode, 'active');
  assert.notEqual(committed.tables.greaterRealmActivationV1.rows[0]!.activatedAt, undefined);

  const preactive = new Fixture();
  assert.equal(
    prepareGreaterRealmActivationAuthorizedTransactionV1(preactive.ctx, 'admin:fixture'),
    'prepared',
  );
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(preactive.ctx), 'halted');
  assert.equal(
    errorCode(() => resumeGreaterRealmActiveAuthorizedTransactionV1(preactive.ctx)),
    'GREATER_REALM_RESUME_PHASE_INVALID',
  );
});

test('active v17 Worker dispatch accepts an exporter-shaped second lexical location block', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'wood', 2, 1_001n, 1);
  const rows = fixture.tables.greaterRealmResourceNodeV1.locationId.filter(target.locationId)
    .sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
  assert.deepEqual(rows.map(row => row.nodeOrdinal), [1, 2]);
  assert.equal(rows[1]!.releaseOrdinal, rows[0]!.releaseOrdinal + 1);
  const preceding = fixture.tables.greaterRealmResourceNodeV1.releaseOrdinal.find(
    rows[0]!.releaseOrdinal - 1,
  )!;
  assert.equal(preceding.nodeOrdinal, 0);
  assert.ok(preceding.locationId.localeCompare(target.locationId) < 0);
  assert.notEqual(preceding.cellKey, rows[0]!.cellKey);

  const input = greaterRealmDispatchInput(
    fixture,
    1,
    'wood',
    target.locationId,
    'greater-worker-second-location-0001',
  );
  const result = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, input)
  ));
  assert.equal(result.idempotent, false);
  assert.equal(result.leaseId, `${target.locationId}:1`);
});

test('active v17 Worker dispatch allocates first-free public leases, replays exactly, and survives recall/return', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'food', 2);
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  const workerRootBefore = clone(fixture.tables.realmWorkerSystemV2.rows[0]!);
  const foundingCount = activation.postCanaryFoundingCount;
  const allocationSequence = activation.nextAllocationSequence;
  const firstInput = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    target.locationId,
    'greater-worker-dispatch-0001',
  );
  const first = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput)
  ));
  assert.equal(first.idempotent, false);
  assert.equal(first.leaseId, `${target.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 1);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount, foundingCount);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.nextAllocationSequence, allocationSequence);
  assert.deepEqual(fixture.tables.realmWorkerSystemV2.rows[0], workerRootBefore);
  assert.equal(fixture.tables.workerAssignmentV1.rows[0]!.siteId, first.leaseId);
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(firstInput.workerId)!.siteId, first.leaseId);
  assert.equal(fixture.tables.workerNodeOccupationV1.rows[0]!.siteId, first.leaseId);
  assert.match(fixture.tables.workerCommandIdempotencyV1.rows[0]!.commandKind, /^dispatch-v2:/);

  const beforeReplay = stateText(fixture);
  const replay = dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.leaseId, first.leaseId);
  assert.equal(stateText(fixture), beforeReplay);

  const secondInput = greaterRealmDispatchInput(
    fixture,
    2,
    'food',
    target.locationId,
    'greater-worker-dispatch-0002',
  );
  const second = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, secondInput)
  ));
  assert.equal(second.leaseId, `${target.locationId}:2`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 2);

  const fullBefore = stateText(fixture);
  const thirdInput = greaterRealmDispatchInput(
    fixture,
    3,
    'food',
    target.locationId,
    'greater-worker-dispatch-0003',
  );
  assert.match(
    errorCode(() => fixture.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(fixture.ctx, thirdInput)
    ))) ?? '',
    /CAPACITY|EXHAUSTED/,
  );
  assert.equal(stateText(fixture), fullBefore);

  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: firstInput.fid,
    castle: firstInput.castle,
    workerId: firstInput.workerId,
    idempotencyKey: 'greater-worker-recall-0001',
  }));
  assert.equal(
    fixture.tables.workerNodeOccupationV1.nodeKey.find(`food:${first.leaseId}`),
    null,
  );
  const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    firstInput.workerId,
  )!;
  assert.equal(returnSchedule.stage, 'return-complete');
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(firstInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(firstInput.workerId), null);

  const reused = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, thirdInput)
  ));
  assert.equal(reused.leaseId, `${target.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 3);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  const haltedBeforeReplay = stateText(fixture);
  const terminalReplay = dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput);
  assert.equal(terminalReplay.idempotent, true);
  assert.equal(terminalReplay.leaseId, `${target.locationId}:1`);
  assert.equal(stateText(fixture), haltedBeforeReplay);
  const haltedFresh = greaterRealmDispatchInput(
    fixture,
    4,
    'food',
    target.locationId,
    'greater-worker-dispatch-0004',
  );
  assert.match(
    errorCode(() => fixture.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(fixture.ctx, haltedFresh)
    ))) ?? '',
    /NOT_ACTIVE|MODE|PHASE|CURRENT_WORLD_UNAVAILABLE/,
  );
  assert.equal(stateText(fixture), haltedBeforeReplay);

  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: thirdInput.fid,
    castle: thirdInput.castle,
    workerId: thirdInput.workerId,
    idempotencyKey: 'greater-worker-recall-halted-0003',
  }));
  const haltedReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    thirdInput.workerId,
  )!;
  assert.equal(haltedReturn.stage, 'return-complete');
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, haltedReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(thirdInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(thirdInput.workerId), null);
});

test('conditional canary recall is exact-assignment atomic, replay-safe, and idle-no-op free', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'food', 2);
  const dispatch = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    target.locationId,
    'conditional-canary-dispatch-0001',
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, dispatch));
  const dispatchReceipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${dispatch.fid.toString()}:${dispatch.idempotencyKey}`,
  )!;
  const exact = {
    fid: dispatch.fid,
    castle: dispatch.castle,
    workerId: dispatch.workerId,
    recallIdempotencyKey: 'conditional-canary-recall-0001',
    expectedResourceKind: dispatchReceipt.resourceKind,
    expectedSiteId: dispatchReceipt.siteId,
    expectedAssignmentId: dispatchReceipt.assignmentId,
  };
  for (const hostile of [
    { ...exact, expectedAssignmentId: '00000000-0000-7000-8000-999999999999' },
    { ...exact, expectedResourceKind: 'wood' },
    { ...exact, expectedSiteId: `${target.locationId}:2` },
  ]) {
    const before = stateText(fixture);
    assert.equal(
      errorCode(() => fixture.transaction(() => (
        recallCastleWorkerForExactCanaryAssignment(fixture.ctx, hostile)
      ))),
      'WORKER_CANARY_ASSIGNMENT_MISMATCH',
    );
    assert.equal(stateText(fixture), before);
  }

  // Recovery is safety authority, not proof eligibility: an expired approval
  // timestamp cannot make the exact assignment unsafe to recall.
  fixture.ctx.timestamp = timestamp(9_999_999_999_999n);
  assert.equal(fixture.transaction(() => (
    recallCastleWorkerForExactCanaryAssignment(fixture.ctx, exact)
  )), 'recalled');
  const recallRequestKey = `${dispatch.fid.toString()}:${exact.recallIdempotencyKey}`;
  const recallReceipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    recallRequestKey,
  )!;
  assert.equal(recallReceipt.assignmentId, dispatchReceipt.assignmentId);
  assert.equal(recallReceipt.resourceKind, dispatchReceipt.resourceKind);
  assert.equal(recallReceipt.siteId, dispatchReceipt.siteId);
  const replayBefore = stateText(fixture);
  assert.equal(
    recallCastleWorkerForExactCanaryAssignment(fixture.ctx, exact),
    'replayed',
  );
  assert.equal(stateText(fixture), replayBefore);

  const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    dispatch.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(returnSchedule.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(dispatch.workerId), null);

  const idleFixture = new Fixture();
  advanceToActive(idleFixture);
  const idleTarget = prepareGreaterRealmWorkerLocation(idleFixture, 'food', 2);
  const completed = greaterRealmDispatchInput(
    idleFixture,
    1,
    'food',
    idleTarget.locationId,
    'conditional-canary-natural-0001',
  );
  idleFixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(
    idleFixture.ctx,
    completed,
  ));
  const completedReceipt = idleFixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${completed.fid.toString()}:${completed.idempotencyKey}`,
  )!;
  for (let transition = 0; transition < 3; transition += 1) {
    const schedule = idleFixture.tables.workerAssignmentScheduleV1.byWorker.find(
      completed.workerId,
    )!;
    idleFixture.ctx.timestamp = timestamp(schedule.scheduledAt.value.microsSinceUnixEpoch);
    idleFixture.transaction(() => runCastleWorkerSchedule(idleFixture.ctx, schedule));
  }
  const idleRecallKey = 'conditional-canary-idle-recall-0001';
  const idleBefore = stateText(idleFixture);
  assert.equal(recallCastleWorkerForExactCanaryAssignment(idleFixture.ctx, {
    fid: completed.fid,
    castle: completed.castle,
    workerId: completed.workerId,
    recallIdempotencyKey: idleRecallKey,
    expectedResourceKind: completedReceipt.resourceKind,
    expectedSiteId: completedReceipt.siteId,
    expectedAssignmentId: completedReceipt.assignmentId,
  }), 'idle');
  assert.equal(stateText(idleFixture), idleBefore);
  assert.equal(
    idleFixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${completed.fid.toString()}:${idleRecallKey}`,
    ),
    null,
  );

  // A later same-route assignment (including the read->write race case) must
  // never be recalled with the earlier canary's expected assignment identity.
  const unrelated = greaterRealmDispatchInput(
    idleFixture,
    1,
    'food',
    idleTarget.locationId,
    'ordinary-later-same-route-0001',
  );
  idleFixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(
    idleFixture.ctx,
    unrelated,
  ));
  const unrelatedBefore = stateText(idleFixture);
  assert.equal(
    errorCode(() => idleFixture.transaction(() => (
      recallCastleWorkerForExactCanaryAssignment(idleFixture.ctx, {
        fid: completed.fid,
        castle: completed.castle,
        workerId: completed.workerId,
        recallIdempotencyKey: 'conditional-canary-race-recall-0001',
        expectedResourceKind: completedReceipt.resourceKind,
        expectedSiteId: completedReceipt.siteId,
        expectedAssignmentId: completedReceipt.assignmentId,
      })
    ))),
    'WORKER_CANARY_ASSIGNMENT_MISMATCH',
  );
  assert.equal(stateText(idleFixture), unrelatedBefore);
});

test('active v17 Worker dispatch resolves every resource in all six immutable components', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const resourceKinds = ['food', 'wood', 'stone', 'gold'] as const;
  let dispatches = 0;
  for (const region of GREATER_REALM_PUBLIC_REGIONS) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.rows.find(row => (
      row.regionId === region.id && row.active
    ))!;
    const claim = fixture.tables.greaterRealmCastleClaimV1.rows.find(row => (
      row.slotId === slot.slotId
    ))!;
    const fid = claim.ownerFid as bigint;
    for (const resourceKind of resourceKinds) {
      const target = prepareGreaterRealmWorkerLocation(fixture, resourceKind, 1, fid);
      const input = greaterRealmDispatchInput(
        fixture,
        1,
        resourceKind,
        target.locationId,
        `greater-worker-${region.ordinal}-${resourceKind}-dispatch`,
        fid,
      );
      const result = fixture.transaction(() => (
        dispatchGreaterRealmCastleWorkerV2(fixture.ctx, input)
      ));
      assert.equal(result.leaseId, `${target.locationId}:1`);
      fixture.transaction(() => recallCastleWorker(fixture.ctx, {
        fid,
        castle: input.castle,
        workerId: input.workerId,
        idempotencyKey: `greater-worker-${region.ordinal}-${resourceKind}-recall`,
      }));
      const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
        input.workerId,
      )!;
      fixture.ctx.timestamp = timestamp(returnSchedule.scheduledAt.value.microsSinceUnixEpoch);
      fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
      assert.equal(fixture.tables.castleWorkerV1.workerId.find(input.workerId)!.status, 'idle');
      dispatches += 1;
    }
  }
  assert.equal(dispatches, 24);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 24);
});

test('fresh v17 Worker dispatch rejects wrong public authority and rolls back atomically at the counter write', () => {
  const probe = new Fixture();
  advanceToActive(probe);
  const probeTarget = prepareGreaterRealmWorkerLocation(probe, 'gold', 1);
  const probeInput = greaterRealmDispatchInput(
    probe,
    1,
    'gold',
    probeTarget.locationId,
    'greater-worker-fault-0001',
  );
  probe.transaction(() => dispatchGreaterRealmCastleWorkerV2(probe.ctx, probeInput));
  const finalWrite = probe.mutationCount;
  assert.ok(finalWrite >= 6);

  const rollback = new Fixture();
  advanceToActive(rollback);
  const rollbackTarget = prepareGreaterRealmWorkerLocation(rollback, 'gold', 1);
  const rollbackInput = greaterRealmDispatchInput(
    rollback,
    1,
    'gold',
    rollbackTarget.locationId,
    'greater-worker-fault-0001',
  );
  const beforeFault = stateText(rollback);
  assert.equal(
    errorCode(() => rollback.transaction(
      () => dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput),
      finalWrite,
    )),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(rollback), beforeFault);
  assert.equal(rollback.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 0);

  const invalidCases: readonly [string, (input: Row) => void][] = [
    ['revision', input => { input.expectedRevision += 1n; }],
    ['location', input => { input.locationId = `GRL-${opaqueSuffix(99_999)}`; }],
    ['resource', input => { input.resourceKind = 'stone'; }],
    ['castle', input => { input.castle = rollback.tables.castle.castleId.find(2n)!; }],
    ['fid', input => { input.fid = 1_002n; }],
  ];
  for (const [label, change] of invalidCases) {
    const input = clone(rollbackInput);
    input.idempotencyKey = `greater-worker-invalid-${label}-0001`;
    change(input);
    const before = stateText(rollback);
    assert.notEqual(
      errorCode(() => rollback.transaction(() => (
        dispatchGreaterRealmCastleWorkerV2(rollback.ctx, input as typeof rollbackInput)
      ))),
      undefined,
      label,
    );
    assert.equal(stateText(rollback), before, label);
  }

  const destination = rollback.tables.greaterRealmCellV1.cellKey.find(
    rollbackTarget.destinationCellKey,
  )!;
  const priorDepth = destination.routeDepth;
  destination.routeDepth = 4_097;
  assert.match(
    errorCode(() => rollback.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput)
    ))) ?? '',
    /ROUTE/,
  );
  destination.routeDepth = priorDepth;
  const node = rollback.tables.greaterRealmResourceNodeV1.locationId.filter(
    rollbackTarget.locationId,
  )[0]!;
  node.tier = 2;
  assert.match(
    errorCode(() => rollback.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput)
    ))) ?? '',
    /LOCATION|TIER/,
  );
});
