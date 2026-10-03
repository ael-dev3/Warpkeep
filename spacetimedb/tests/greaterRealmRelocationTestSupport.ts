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
import { types as utilTypes } from 'node:util';
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
import { assertGreaterRealmCurrentFounderForFidV1 } from '../src/greaterRealmCurrentAuthority';
import { captureGreaterRealmFrozenTopologyV1 } from '../src/greaterRealmRelocationSnapshot';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../src/resourceAuthorityPolicy';
import { CASTLE_WORKER_POLICY_VERSION, planCastleWorkerTimeline, rosterDigestForCastleIds, workerResourcePolicy } from '../src/castleWorkerPolicy';
import { expectedWorkerRowsForCastle } from '../src/castleWorkerRoster';
import { WARPKEEP_ALPHA_TERMS_VERSION } from '../src/entryAgreementPolicy';
import { ADMITTED_DAILY_MARK_POLICY_VERSION } from '../src/marksAuthorityPolicy';
import { CANONICAL_INNER_KEEP_LAYOUT } from '../src/innerKeepLayoutPolicy';
import { selectGreaterRealmCastleAllocationV1 } from '../src/greaterRealmActivationPolicy';
import { GREATER_REALM_PUBLIC_REGIONS, GREATER_REALM_RUNTIME_PARTITION_VERSION, GREATER_REALM_UNASSIGNED_RANK } from '../src/greaterRealmV17Policy';
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
  // Custom-namespace metafile keys retain native Windows separators. Match
  // the exact namespace and absolute source, not a platform-specific suffix.
  const expectedInput = `warpkeep-stateful-local:${sourcePath}`.replaceAll('\\', '/');
  assert.ok(Object.keys(result.metafile.inputs).some(
    input => input.replaceAll('\\', '/') === expectedInput,
  ), `Expected bundled production source ${label}`);
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
  relocateGreaterRealmCanaryAuthorizedTransactionV1: relocateGreaterRealmCanaryProductionV1,
  resumeGreaterRealmActiveAuthorizedTransactionV1,
  rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1: rollbackGreaterRealmBeforeCommitProductionV1,
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
  captureProductionPlayerCanaryBaseline: captureProductionPlayerCanaryBaselineUnindexed,
  inspectProductionPlayerCanaryRoutePlan: inspectProductionPlayerCanaryRoutePlanUnindexed,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryBaseline>(
  new URL('../src/productionPlayerCanaryBaseline.ts', import.meta.url),
);
const {
  productionPlayerCanaryOwnerApprovalCommitmentV1,
  registerProductionPlayerCanaryApprovalV1: registerProductionPlayerCanaryApprovalV1Unindexed,
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
  dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1: dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1Unindexed,
  inspectProductionPlayerCanaryRecoveryStatusV1: inspectProductionPlayerCanaryRecoveryStatusV1Unindexed,
  recallProductionPlayerCanaryWorkerV1: recallProductionPlayerCanaryWorkerV1Unindexed,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryRecovery>(
  new URL('../src/productionPlayerCanaryRecovery.ts', import.meta.url),
);
const {
  inspectProductionPlayerCanaryAdminEvidence: inspectProductionPlayerCanaryAdminEvidenceUnindexed,
} = await loadExactProductionModule<typeof ProductionPlayerCanaryEvidence>(
  new URL('../src/productionPlayerCanaryEvidence.ts', import.meta.url),
);

type Row = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

type ResourcePrimaryUpdateLease = Readonly<{
  rows: Row[];
  keys: readonly string[];
  firstIndex: ReadonlyMap<string, number>;
  mutate: () => void;
}>;

// A lease never survives one fixed synchronous canary/rollback call. Direct
// fixture edits remain observable because every call rebuilds from current rows.
const resourcePrimaryUpdateLeases = new WeakMap<MemoryTable, ResourcePrimaryUpdateLease>();
type ResourceReadIndexLease = Readonly<{
  rows: Row[];
  records: readonly Readonly<{
    row: Row;
    nodeId: string;
    locationId: string;
    componentKey: string;
    resourceKind: string;
  }>[];
  locations: ReadonlyMap<string, readonly Row[]>;
  components: ReadonlyMap<string, ReadonlyMap<string, readonly Row[]>>;
  mutate: () => void;
}>;
const resourceReadIndexLeases = new WeakMap<MemoryTable, ResourceReadIndexLease>();
const fixtureResourceMutationCallbacks = new WeakMap<MemoryTable, () => void>();
const fixturesByContext = new WeakMap<object, Readonly<{
  fixture: Fixture;
  newUuidV7: () => { toString(): string };
  mutations: ReadonlyMap<string, Readonly<{ table: MemoryTable; mutate: () => void }>>;
}>>();

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
        filter: (value: unknown) => {
          const lease = resourceReadIndexLeases.get(this);
          if (
            lease !== undefined
            && lease.rows === this.rows
            && lease.records.length === this.rows.length
            && lease.mutate === this.mutate
          ) {
            if (accessor === 'locationId' && field === 'locationId' && typeof value === 'string') {
              return [...(lease.locations.get(value) ?? [])];
            }
            if (
              accessor === 'byComponentAndResourceKind'
              && Array.isArray(field) && field.length === 2
              && field[0] === 'componentKey' && field[1] === 'resourceKind'
              && !utilTypes.isProxy(value)
              && Array.isArray(value) && value.length === 2
              && Object.getPrototypeOf(value) === Array.prototype
              && Reflect.ownKeys(value).length === 3
            ) {
              const component = Object.getOwnPropertyDescriptor(value, '0')?.value;
              const kind = Object.getOwnPropertyDescriptor(value, '1')?.value;
              if (typeof component === 'string' && typeof kind === 'string') {
                return [...(lease.components.get(component)?.get(kind) ?? [])];
              }
            }
          }
          return this.rows.filter(row => matches(row, value));
        },
        update: (next: Row) => {
          this.mutate();
          const key = Array.isArray(field)
            ? field.map(column => next[column])
            : next[field as string];
          const lease = resourcePrimaryUpdateLeases.get(this);
          const indexed = accessor === this.primary
            && field === this.primary
            && typeof key === 'string'
            && lease !== undefined
            && lease.rows === this.rows
            && lease.keys.length === this.rows.length
            && lease.mutate === this.mutate;
          const firstIndex = indexed ? lease.firstIndex.get(key) : undefined;
          const index = indexed
            ? firstIndex === undefined
              ? -1
              : this.rows[firstIndex]?.[this.primary] === key
                ? firstIndex
                : this.rows.findIndex(row => matches(row, key))
            : this.rows.findIndex(row => matches(row, key));
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
      newUuidV7: () => {
        const value = `00000000-0000-7000-8000-${String(++this.uuidSequence).padStart(12, '0')}`;
        return { toString: () => value };
      },
    };
    for (const table of Object.values(this.tables)) {
      table.mutate = () => {
        this.mutationCount += 1;
        if (this.faultAt === this.mutationCount) throw new Error('INJECTED_TRANSACTION_FAULT');
      };
    }
    fixtureResourceMutationCallbacks.set(
      this.tables.greaterRealmResourceNodeV1,
      this.tables.greaterRealmResourceNodeV1.mutate,
    );
    fixturesByContext.set(this.ctx, {
      fixture: this,
      newUuidV7: this.ctx.newUuidV7,
      mutations: new Map(Object.entries(this.tables).map(([name, table]) => (
        [name, { table, mutate: table.mutate }]
      ))),
    });
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

// The only producer callers below are the exact fixed synchronous canary and
// rollback functions. Their resource writes replace rows with the same nodeId
// and change active only (greaterRealmRelocationAuthority.ts:307-320). A custom
// mutator, accessor, proxy, non-string key or non-scalar row uses the original
// linear path. No index is cached between operations or across rollback.
function resourceIndexSnapshot(table: MemoryTable): Readonly<{
  rows: Row[];
  keys: readonly string[];
  mutate: () => void;
}> | undefined {
  const mutate = fixtureResourceMutationCallbacks.get(table);
  const rowsDescriptor = Object.getOwnPropertyDescriptor(table, 'rows');
  const rows = rowsDescriptor?.value;
  if (
    utilTypes.isProxy(table)
    || Object.getPrototypeOf(table) !== MemoryTable.prototype
    || table.primary !== 'nodeId'
    || mutate === undefined
    || table.mutate !== mutate
    || !Array.isArray(rows)
    || utilTypes.isProxy(rows)
    || Object.getPrototypeOf(rows) !== Array.prototype
    || Reflect.ownKeys(rows).length !== rows.length + 1
    || resourcePrimaryUpdateLeases.has(table)
    || resourceReadIndexLeases.has(table)
  ) return undefined;

  const keys: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const rowDescriptor = Object.getOwnPropertyDescriptor(rows, String(index));
    const row = rowDescriptor?.value;
    if (
      rowDescriptor === undefined
      || !('value' in rowDescriptor)
      || row === null
      || typeof row !== 'object'
      || utilTypes.isProxy(row)
      || Object.getPrototypeOf(row) !== Object.prototype
    ) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(row);
    if (Reflect.ownKeys(row).some(key => (
      typeof key !== 'string'
      || !('value' in descriptors[key]!)
      || !descriptors[key]!.enumerable
      || !descriptors[key]!.writable
      || !descriptors[key]!.configurable
      || typeof descriptors[key]!.value === 'object' && descriptors[key]!.value !== null
      || typeof descriptors[key]!.value === 'function'
      || typeof descriptors[key]!.value === 'symbol'
    ))) return undefined;
    const key = descriptors.nodeId?.value;
    if (typeof key !== 'string') return undefined;
    keys.push(key);
  }

  return { rows, keys, mutate };
}

function withResourcePrimaryUpdateIndex<T>(table: MemoryTable, work: () => T): T {
  const snapshot = resourceIndexSnapshot(table);
  if (snapshot === undefined) return work();
  const { rows, keys, mutate } = snapshot;
  const firstIndex = new Map<string, number>();
  for (let index = 0; index < keys.length; index += 1) {
    // Map.set on every row would incorrectly select the last duplicate.
    if (!firstIndex.has(keys[index]!)) firstIndex.set(keys[index]!, index);
  }

  resourcePrimaryUpdateLeases.set(table, { rows, keys, firstIndex, mutate });
  try {
    return work();
  } finally {
    // Release before the surrounding Fixture.transaction can restore rows.
    resourcePrimaryUpdateLeases.delete(table);
    assert.equal(table.rows, rows, 'fixed resource transition replaced the row array');
    assert.equal(table.rows.length, keys.length, 'fixed resource transition changed row count');
    for (let index = 0; index < keys.length; index += 1) {
      assert.equal(
        Object.getOwnPropertyDescriptor(table.rows[index]!, 'nodeId')?.value,
        keys[index],
        'fixed resource transition changed resource keys/order',
      );
    }
  }
}

function fixedResourceIndexTable(ctx: any): MemoryTable | undefined {
  const binding = typeof ctx === 'object' && ctx !== null
    ? fixturesByContext.get(ctx)
    : undefined;
  const fixture = binding?.fixture;
  const db = typeof ctx === 'object' && ctx !== null
    ? Object.getOwnPropertyDescriptor(ctx, 'db')?.value
    : undefined;
  const table = typeof db === 'object' && db !== null
    ? Object.getOwnPropertyDescriptor(db, 'greaterRealmResourceNodeV1')?.value
    : undefined;
  const mutationCount = fixture === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(fixture, 'mutationCount');
  const faultAt = fixture === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(fixture, 'faultAt');
  const uuidSequence = fixture === undefined
    ? undefined
    : Object.getOwnPropertyDescriptor(fixture, 'uuidSequence');
  if (
    fixture === undefined
    || db !== fixture.tables
    || table !== fixture.tables.greaterRealmResourceNodeV1
    || Object.getOwnPropertyDescriptor(ctx, 'newUuidV7')?.value !== binding!.newUuidV7
    || uuidSequence?.writable !== true
    || !Number.isSafeInteger(uuidSequence.value)
    || uuidSequence.value < 0
    || mutationCount?.writable !== true
    || !Number.isSafeInteger(mutationCount.value)
    || faultAt?.writable !== true
    || faultAt.value !== undefined && !Number.isSafeInteger(faultAt.value)
  ) return undefined;
  // Table mutators and the UUID callback also run in these exact operations.
  // Their original callbacks and ordinary backing state cannot edit resource
  // keys/order; a replacement or accessor falls back to the linear fixture.
  if (Reflect.ownKeys(db).length !== binding!.mutations.size) return undefined;
  for (const [name, registered] of binding!.mutations) {
    const member = Object.getOwnPropertyDescriptor(db, name);
    if (
      member?.value !== registered.table
      || Object.getOwnPropertyDescriptor(registered.table, 'mutate')?.value !== registered.mutate
    ) return undefined;
  }
  return table;
}

function withFixedResourceTransitionIndex<T>(ctx: any, work: () => T): T {
  const table = fixedResourceIndexTable(ctx);
  return table === undefined ? work() : withResourcePrimaryUpdateIndex(table, work);
}

// These seven exact synchronous production entry points only read resource
// catalog rows. Their other writes run original Fixture callbacks. Rebuild before
// each entry, never around an arbitrary transaction or beforeRegistration hook.
// Groups keep every duplicate in row order and return new arrays of live rows.
function withResourceReadIndex<T>(table: MemoryTable, work: () => T): T {
  const snapshot = resourceIndexSnapshot(table);
  if (snapshot === undefined) return work();
  const { rows, mutate } = snapshot;
  const records: ResourceReadIndexLease['records'][number][] = [];
  const locations = new Map<string, Row[]>();
  const components = new Map<string, Map<string, Row[]>>();
  for (const row of rows) {
    const { nodeId, locationId, componentKey, resourceKind } = row;
    if (
      typeof locationId !== 'string'
      || typeof componentKey !== 'string'
      || typeof resourceKind !== 'string'
    ) return work();
    records.push({ row, nodeId, locationId, componentKey, resourceKind });
    const locationRows = locations.get(locationId) ?? [];
    locationRows.push(row);
    locations.set(locationId, locationRows);
    const kinds = components.get(componentKey) ?? new Map<string, Row[]>();
    const kindRows = kinds.get(resourceKind) ?? [];
    kindRows.push(row);
    kinds.set(resourceKind, kindRows);
    components.set(componentKey, kinds);
  }
  resourceReadIndexLeases.set(table, { rows, records, locations, components, mutate });
  try {
    return work();
  } finally {
    resourceReadIndexLeases.delete(table);
    assert.equal(table.rows, rows, 'fixed resource read replaced the row array');
    assert.equal(table.rows.length, records.length, 'fixed resource read changed row count');
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]!;
      assert.equal(table.rows[index], record.row, 'fixed resource read changed resource row order');
      for (const column of ['nodeId', 'locationId', 'componentKey', 'resourceKind'] as const) {
        assert.equal(
          Object.getOwnPropertyDescriptor(record.row, column)?.value,
          record[column],
          'fixed resource read changed an indexed field',
        );
      }
    }
  }
}

function withFixedResourceReadIndex<T>(ctx: any, work: () => T): T {
  const table = fixedResourceIndexTable(ctx);
  return table === undefined ? work() : withResourceReadIndex(table, work);
}

function captureProductionPlayerCanaryBaseline(
  ...args: Parameters<typeof captureProductionPlayerCanaryBaselineUnindexed>
): ReturnType<typeof captureProductionPlayerCanaryBaselineUnindexed> {
  return withFixedResourceReadIndex(args[0], () => captureProductionPlayerCanaryBaselineUnindexed(...args));
}

function inspectProductionPlayerCanaryRoutePlan(
  ...args: Parameters<typeof inspectProductionPlayerCanaryRoutePlanUnindexed>
): ReturnType<typeof inspectProductionPlayerCanaryRoutePlanUnindexed> {
  return withFixedResourceReadIndex(args[0], () => inspectProductionPlayerCanaryRoutePlanUnindexed(...args));
}

function registerProductionPlayerCanaryApprovalV1(
  ...args: Parameters<typeof registerProductionPlayerCanaryApprovalV1Unindexed>
): ReturnType<typeof registerProductionPlayerCanaryApprovalV1Unindexed> {
  return withFixedResourceReadIndex(args[0], () => registerProductionPlayerCanaryApprovalV1Unindexed(...args));
}

function dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(
  ...args: Parameters<typeof dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1Unindexed>
): ReturnType<typeof dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1Unindexed> {
  return withFixedResourceReadIndex(args[0], () => dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1Unindexed(...args));
}

function inspectProductionPlayerCanaryRecoveryStatusV1(
  ...args: Parameters<typeof inspectProductionPlayerCanaryRecoveryStatusV1Unindexed>
): ReturnType<typeof inspectProductionPlayerCanaryRecoveryStatusV1Unindexed> {
  return withFixedResourceReadIndex(args[0], () => inspectProductionPlayerCanaryRecoveryStatusV1Unindexed(...args));
}

function recallProductionPlayerCanaryWorkerV1(
  ...args: Parameters<typeof recallProductionPlayerCanaryWorkerV1Unindexed>
): ReturnType<typeof recallProductionPlayerCanaryWorkerV1Unindexed> {
  return withFixedResourceReadIndex(args[0], () => recallProductionPlayerCanaryWorkerV1Unindexed(...args));
}

function inspectProductionPlayerCanaryAdminEvidence(
  ...args: Parameters<typeof inspectProductionPlayerCanaryAdminEvidenceUnindexed>
): ReturnType<typeof inspectProductionPlayerCanaryAdminEvidenceUnindexed> {
  return withFixedResourceReadIndex(args[0], () => inspectProductionPlayerCanaryAdminEvidenceUnindexed(...args));
}

function relocateGreaterRealmCanaryAuthorizedTransactionV1(
  ctx: Parameters<typeof relocateGreaterRealmCanaryProductionV1>[0],
): ReturnType<typeof relocateGreaterRealmCanaryProductionV1> {
  return withFixedResourceTransitionIndex(ctx, () => relocateGreaterRealmCanaryProductionV1(ctx));
}

function rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(
  ctx: Parameters<typeof rollbackGreaterRealmBeforeCommitProductionV1>[0],
): ReturnType<typeof rollbackGreaterRealmBeforeCommitProductionV1> {
  return withFixedResourceTransitionIndex(ctx, () => rollbackGreaterRealmBeforeCommitProductionV1(ctx));
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

export { CREATED, Fixture, GREATER_REALM_CUTOVER_AUDIT_NOTE_V1, MemoryTable, NOW, SHA_A, addOnePostCommitFounder, admissionProfileFor, advanceToActive, advanceToPlanned, assertGenesisFounderForProfileRepair, assertProductionPlayerCanaryGenericWorkerWriteAvailableV2, beginGreaterRealmDrainAuthorizedTransactionV1, clearFirstWorkerJourney, clone, commitGreaterRealmActiveAuthorizedTransactionV1, completeNormalProductionCanaryEvidenceRun, completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchGreaterRealmCastleWorkerV2, dispatchProductionCanaryOrdinal, dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1, enableCanonicalInnerKeep, ensureGenesisFounder, errorCode, fillProductionCanaryReceiptsWithPinnedRows, fixtureResourceMutationCallbacks, freezeGreaterRealmActivationAuthorizedTransactionV1, greaterRealmDispatchInput, haltGreaterRealmActivationAuthorizedTransactionV1, insertIntendedAdmission, inspectCastleWorkerGraph, inspectCastleWorkerGraphForCurrentGameplayV1, inspectProductionPlayerCanaryAdminEvidence, inspectProductionPlayerCanaryRecoveryStatusV1, makeFirstWorkerOutbound, mutateDispatchV2ReceiptMetadata, opaqueSuffix, planGreaterRealmRelocationAuthorizedTransactionV1, prepareGreaterRealmActivationAuthorizedTransactionV1, prepareGreaterRealmWorkerLocation, prepareProductionPlayerCanaryFixture, projectGreaterRealmCutoverStatusV1, projectGreaterRealmReenableStatusV1, projectMyGreaterRealmWorkerStateV2, projectMyWorkerStateForCurrentGameplayV1, recallAllCastleWorkers, recallCastleWorker, recallCastleWorkerForExactCanaryAssignment, recallOrdinaryCanaryRoute, recallProductionPlayerCanaryWorkerV1, recoverProductionCanaryOrdinal, registerProductionPlayerCanaryApprovalV1, relocateGreaterRealmCanaryAuthorizedTransactionV1, replayProductionCanaryOrdinalAtCurrentTime, resourcePrimaryUpdateLeases, resourceReadIndexLeases, resumeGreaterRealmActiveAuthorizedTransactionV1, rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1, runCastleWorkerSchedule, runCurrentWorkerSchedule, runGreaterRealmCutoverTransitionWithAuditV1, runNextWorkerSchedule, settleAllWorkerAssignmentsForFid, stateOutsideRelocationWrites, stateText, timestamp, withFixedResourceReadIndex, withFixedResourceTransitionIndex, withResourcePrimaryUpdateIndex, withResourceReadIndex };
export type { PreparedCanaryFixture, Row };
