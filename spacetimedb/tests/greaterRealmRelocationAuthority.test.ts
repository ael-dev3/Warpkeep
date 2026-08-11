import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as FoundingAuthority from '../src/foundingAuthority';
import type * as RelocationAuthority from '../src/greaterRealmRelocationAuthority';

import {
  assertGreaterRealmCurrentFounderForFidV1,
  greaterRealmCurrentPassiveTerrainV1,
} from '../src/greaterRealmCurrentAuthority';
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
  CASTLE_WORKER_POLICY_VERSION,
  planCastleWorkerTimeline,
  rosterDigestForCastleIds,
} from '../src/castleWorkerPolicy';
import { expectedWorkerRowsForCastle } from '../src/castleWorkerRoster';
import { ADMITTED_DAILY_MARK_POLICY_VERSION } from '../src/marksAuthorityPolicy';
import {
  GREATER_REALM_JOURNEY_TABLES,
  GREATER_REALM_TIER_ONE_REGION_IDS,
  selectGreaterRealmCastleAllocationV1,
} from '../src/greaterRealmActivationPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RUNTIME_PARTITION_VERSION,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILE_META,
  CANONICAL_WORLD_TILES,
  HEGEMONY_REALM_ID,
} from '../src/world';

const sdkRuntimeStub: Plugin = {
  name: 'warpkeep-greater-realm-founding-test-runtime',
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^spacetimedb(?:\/server)?$/ },
      args => ({ path: args.path, namespace: 'warpkeep-greater-realm-sdk' }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-greater-realm-sdk' },
      args => ({
        loader: 'js',
        contents: args.path === 'spacetimedb'
          ? 'export const ScheduleAt = Object.freeze({});'
          : `
              export class SenderError extends Error {
                constructor(message) {
                  super(message);
                  this.name = 'SenderError';
                }
              }
            `,
      }),
    );
  },
};

async function loadExactProductionModule<Module>(sourceUrl: URL): Promise<Module> {
  const sourcePath = fileURLToPath(sourceUrl);
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    entryPoints: [sourcePath],
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: 'node',
    plugins: [sdkRuntimeStub],
    target: 'node22',
    treeShaking: true,
    write: false,
  });
  assert.equal(result.outputFiles.length, 1);
  const exactInput = relative(repositoryRoot, sourcePath).split(sep).join('/');
  assert.ok(Object.hasOwn(result.metafile.inputs, exactInput));
  const encoded = Buffer.from(result.outputFiles[0]!.contents).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<Module>;
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

type Row = Record<string, any>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryTable {
  rows: Row[];
  readonly primary: string;
  readonly indexFields: Readonly<Record<string, string>>;
  mutate: () => void;
  [key: string]: any;

  constructor(
    primary: string,
    indexFields: Readonly<Record<string, string>> = {},
    rows: readonly Row[] = [],
  ) {
    this.primary = primary;
    this.indexFields = { [primary]: primary, ...indexFields };
    this.rows = clone(rows as Row[]);
    this.mutate = () => {};
    for (const [accessor, field] of Object.entries(this.indexFields)) {
      this[accessor] = {
        find: (value: unknown) => this.rows.find(row => row[field] === value) ?? null,
        filter: (value: unknown) => this.rows.filter(row => row[field] === value),
        update: (next: Row) => {
          this.mutate();
          const index = this.rows.findIndex(row => row[field] === next[field]);
          if (index < 0) throw new Error(`missing update ${accessor}`);
          this.rows[index] = clone(next);
          return this.rows[index];
        },
        delete: (value: unknown) => {
          this.mutate();
          const index = this.rows.findIndex(row => row[field] === value);
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
    if (this.rows.some(existing => existing[this.primary] === row[this.primary])) {
      throw new Error(`duplicate ${this.primary}`);
    }
    for (const field of new Set(Object.values(this.indexFields))) {
      if (
        field !== this.primary
        && this.rows.some(existing => existing[field] === row[field])
        && row[field] !== undefined
      ) throw new Error(`duplicate ${field}`);
    }
    const inserted = clone(row);
    this.rows.push(inserted);
    return inserted;
  }
}

function empty(primary = 'id', indexes: Readonly<Record<string, string>> = {}): MemoryTable {
  return new MemoryTable(primary, indexes);
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
  return GREATER_REALM_PUBLIC_REGIONS.map(region => ({
    regionId: region.id,
    publicName: region.name,
    ordinal: region.ordinal,
    tier: 1,
    cellCount: 100,
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
    castle: empty('castleId', { ownerFid: 'ownerFid', tileKey: 'tileKey' }),
    adminAudit: empty('id'),
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
    goldNodeOccupationV1: empty('siteId'),
    goldExpeditionV1: empty('expeditionId'),
    goldExpeditionIdempotencyV1: empty('requestKey'),
    goldExpeditionScheduleV1: empty('scheduleId'),
    realmForestLayoutV1: empty('realmId'),
    realmForestInstanceV1: empty('tileKey'),
    foodSiteV1: empty('siteId'),
    foodNodeOccupationV1: empty('siteId'),
    foodExpeditionV1: empty('expeditionId'),
    foodExpeditionIdempotencyV1: empty('requestKey'),
    foodExpeditionScheduleV1: empty('scheduleId'),
    woodSiteV1: empty('siteId'),
    woodNodeOccupationV1: empty('siteId'),
    woodExpeditionV1: empty('expeditionId'),
    woodExpeditionIdempotencyV1: empty('requestKey'),
    woodExpeditionScheduleV1: empty('scheduleId'),
    realmWaterLayoutV1: empty('realmId'),
    realmWaterBodyV1: empty('bodyId'),
    realmWaterCellV1: empty('cellKey'),
    realmEnvironmentV1: empty('realmId'),
    stoneSiteV1: empty('siteId'),
    stoneNodeOccupationV1: empty('siteId'),
    stoneExpeditionV1: empty('expeditionId'),
    stoneExpeditionIdempotencyV1: empty('requestKey'),
    stoneExpeditionScheduleV1: empty('scheduleId'),
    realmWaterRevisionV1: empty('realmId'),
    realmWorkerSystemV1: empty('realmId'),
    castleWorkerV1: empty('workerId', { byOriginCastle: 'originCastleId' }),
    workerAssignmentV1: empty('assignmentId', { workerId: 'workerId' }),
    workerNodeOccupationV1: empty('nodeKey', { byWorker: 'workerId' }),
    workerCommandIdempotencyV1: empty('requestKey'),
    workerAssignmentScheduleV1: empty('scheduleId', { byAssignment: 'assignmentId' }),
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
    greaterRealmCellV1: empty('cellKey', { releaseOrdinal: 'releaseOrdinal' }),
    greaterRealmCastleSlotV1: empty('slotId', { releaseOrdinal: 'releaseOrdinal' }),
    greaterRealmCastleClaimV1: empty('slotId', { ownerFid: 'ownerFid', castleId: 'castleId' }),
    greaterRealmCellOccupancyV1: empty('cellKey', { castleId: 'castleId' }),
    greaterRealmResourceNodeV1: empty('nodeId', { releaseOrdinal: 'releaseOrdinal' }),
    greaterRealmActivationV1: empty('activationId'),
    realmAtlasV1: empty('atlasId'),
    realmAtlasVisibleRegionV1: empty('regionId'),
    realmWorkerSystemV2: empty('atlasId'),
  };
}

class Fixture {
  readonly tables = tableSet();
  readonly ctx: any;
  mutationCount = 0;
  faultAt: number | undefined;

  constructor() {
    this.ctx = { db: this.tables, timestamp: NOW };
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
      expectedCellCount: 600,
      expectedSlotCount: 600,
      expectedResourceNodeCount: 12_000,
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
      verifiedCellCount: 600,
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
        active: false,
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
    let resourceOrdinal = 0;
    for (const region of GREATER_REALM_PUBLIC_REGIONS) {
      for (const kind of ['food', 'wood', 'stone', 'gold']) {
        for (let index = 0; index < 500; index += 1) {
          db.greaterRealmResourceNodeV1.rows.push({
            nodeId: `GRN-${String(resourceOrdinal).padStart(5, '0')}`,
            releaseOrdinal: resourceOrdinal,
            atlasId,
            locationId: `GRL-${String(resourceOrdinal).padStart(5, '0')}`,
            cellKey: `${region.id}:${index % 100}:0`,
            regionId: region.id,
            componentKey: `GRC-${opaqueSuffix(region.ordinal)}`,
            resourceKind: kind,
            tier: 1,
            nodeOrdinal: 0,
            allocationRank: resourceOrdinal,
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
    this.mutationCount = 0;
    this.faultAt = faultAt;
    try {
      const result = work();
      this.faultAt = undefined;
      return result;
    } catch (error) {
      this.restore(before);
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
    'greaterRealmNavigationComponentV1',
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

function addOnePostCommitFounder(fixture: Fixture): Readonly<{
  fid: bigint;
  castleId: bigint;
  claim: Row;
}> {
  const db = fixture.tables;
  const activation = db.greaterRealmActivationV1.rows[0]!;
  assert.equal(activation.mode, 'active');
  const topology = captureGreaterRealmFrozenTopologyV1(fixture.ctx);
  const castleId = 101n;
  const fid = 5_001n;
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
  const foundedAt = timestamp(20_000n);
  const castle = {
    castleId,
    ownerFid: fid,
    tileKey: cell.cellKey,
    q: cell.atlasQ,
    r: cell.atlasR,
    level: 1,
    name: 'Greater Realm Keep 101',
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
    canonicalUsername: 'postcommitfounder',
    displayName: 'Post-commit Founder',
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

test('the dormant production boundary stays compiled closed and unregistered', () => {
  assert.equal(GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED, false);
  const schema = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const reducers = readFileSync(new URL('../src/reducers/greaterRealm.ts', import.meta.url), 'utf8');
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
  assert.equal(componentIterations, 3);
  assert.equal(resourceIterations, 3);
  assert.equal(relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(componentIterations, 3);
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
  assert.equal(rollbackComponentIterations, 3);
  assert.equal(rollbackResourceIterations, 3);
  assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx), 'unchanged');
  assert.equal(rollbackComponentIterations, 3);
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
