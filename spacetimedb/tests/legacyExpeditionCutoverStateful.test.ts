import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as CastleWorkerRolloutAuthority from '../src/castleWorkerRolloutAuthority';
import type * as FoodExpeditionAuthority from '../src/foodExpeditionAuthority';
import type * as GoldExpeditionAuthority from '../src/goldExpeditionAuthority';
import type * as LegacyExpeditionReturnAuthority from '../src/legacyExpeditionReturnAuthority';
import type * as StoneExpeditionAuthority from '../src/stoneExpeditionAuthority';
import type * as WoodExpeditionAuthority from '../src/woodExpeditionAuthority';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
} from '../src/castleWorkerPolicy';
import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_RESOURCE_STATE_VERSION,
  resourceRosterDigest,
} from '../src/castleWorkerRolloutPolicy';
import {
  expectedWorkerRowsForCastle,
} from '../src/castleWorkerRoster';
import {
  FOOD_EXPEDITION_POLICY_VERSION,
  FOOD_GATHERING_TOTAL_FOOD,
  FOOD_GATHER_QUANTUM_MICROS,
} from '../src/foodExpeditionPolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
} from '../src/foodSitePolicy';
import {
  GOLD_EXPEDITION_POLICY_VERSION,
  GOLD_GATHERING_TOTAL_GOLD,
  GOLD_GATHER_QUANTUM_MICROS,
} from '../src/goldExpeditionPolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
} from '../src/goldSitePolicy';
import {
  SNAP_MARK_POLICY_VERSION,
} from '../src/marksAuthorityPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
} from '../src/resourceAuthorityPolicy';
import {
  STONE_EXPEDITION_POLICY_VERSION,
  STONE_GATHERING_TOTAL_STONE,
  STONE_GATHER_QUANTUM_MICROS,
} from '../src/stoneExpeditionPolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
} from '../src/stoneSitePolicy';
import {
  WOOD_EXPEDITION_POLICY_VERSION,
  WOOD_GATHERING_TOTAL_WOOD,
  WOOD_GATHER_QUANTUM_MICROS,
} from '../src/woodExpeditionPolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
} from '../src/woodSitePolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
} from '../src/world';

const sdkRuntimeStub: Plugin = {
  name: 'warpkeep-spacetimedb-test-runtime',
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^spacetimedb(?:\/server)?$/ },
      args => ({
        path: args.path,
        namespace: 'warpkeep-spacetimedb-test-runtime',
      }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-spacetimedb-test-runtime' },
      args => ({
        loader: 'js',
        contents: args.path === 'spacetimedb'
          ? `
              export const ScheduleAt = Object.freeze({
                time(microsSinceUnixEpoch) {
                  return Object.freeze({
                    tag: 'Time',
                    value: Object.freeze({ microsSinceUnixEpoch }),
                  });
                },
              });
            `
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

async function loadExactProductionModule<Module>(
  sourceUrl: URL,
): Promise<Module> {
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
  const exactInput = relative(repositoryRoot, sourcePath)
    .split(sep)
    .join('/');
  assert.ok(
    Object.hasOwn(result.metafile.inputs, exactInput),
    `bundle did not include exact production source ${sourcePath}`,
  );
  const encoded = Buffer.from(result.outputFiles[0]!.contents).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<Module>;
}

const goldAuthority = await loadExactProductionModule<typeof GoldExpeditionAuthority>(
  new URL('../src/goldExpeditionAuthority.ts', import.meta.url),
);
const foodAuthority = await loadExactProductionModule<typeof FoodExpeditionAuthority>(
  new URL('../src/foodExpeditionAuthority.ts', import.meta.url),
);
const woodAuthority = await loadExactProductionModule<typeof WoodExpeditionAuthority>(
  new URL('../src/woodExpeditionAuthority.ts', import.meta.url),
);
const stoneAuthority = await loadExactProductionModule<typeof StoneExpeditionAuthority>(
  new URL('../src/stoneExpeditionAuthority.ts', import.meta.url),
);
const legacyReturnAuthority =
  await loadExactProductionModule<typeof LegacyExpeditionReturnAuthority>(
    new URL('../src/legacyExpeditionReturnAuthority.ts', import.meta.url),
  );
const rolloutAuthority =
  await loadExactProductionModule<typeof CastleWorkerRolloutAuthority>(
    new URL('../src/castleWorkerRolloutAuthority.ts', import.meta.url),
  );

type AnyRow = Record<string, any>;
type ResourceKind = 'gold' | 'food' | 'wood' | 'stone';

type ResourceConfig = Readonly<{
  kind: ResourceKind;
  prefix: 'GOLD' | 'FOOD' | 'WOOD' | 'STONE';
  balanceField: ResourceKind;
  accruedField: string;
  creditedField: string;
  resultCreditField: string;
  policyVersion: string;
  quantumMicros: bigint;
  gatheringTotal: bigint;
  returnExpedition: (
    ctx: any,
    fid: bigint,
    expectedExpeditionId: string,
  ) => AnyRow;
  runSchedule: (ctx: any, schedule: AnyRow) => void;
}>;

const RESOURCE_CONFIGS: readonly ResourceConfig[] = Object.freeze([
  Object.freeze({
    kind: 'gold',
    prefix: 'GOLD',
    balanceField: 'gold',
    accruedField: 'accruedGold',
    creditedField: 'creditedGold',
    resultCreditField: 'creditedGold',
    policyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    quantumMicros: GOLD_GATHER_QUANTUM_MICROS,
    gatheringTotal: GOLD_GATHERING_TOTAL_GOLD,
    returnExpedition: goldAuthority.returnActiveGoldExpedition,
    runSchedule: goldAuthority.runGoldExpeditionSchedule,
  }),
  Object.freeze({
    kind: 'food',
    prefix: 'FOOD',
    balanceField: 'food',
    accruedField: 'accruedFood',
    creditedField: 'creditedFood',
    resultCreditField: 'creditedFood',
    policyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    quantumMicros: FOOD_GATHER_QUANTUM_MICROS,
    gatheringTotal: FOOD_GATHERING_TOTAL_FOOD,
    returnExpedition: foodAuthority.returnActiveFoodExpedition,
    runSchedule: foodAuthority.runFoodExpeditionSchedule,
  }),
  Object.freeze({
    kind: 'wood',
    prefix: 'WOOD',
    balanceField: 'wood',
    accruedField: 'accruedWood',
    creditedField: 'creditedWood',
    resultCreditField: 'creditedWood',
    policyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    quantumMicros: WOOD_GATHER_QUANTUM_MICROS,
    gatheringTotal: WOOD_GATHERING_TOTAL_WOOD,
    returnExpedition: woodAuthority.returnActiveWoodExpedition,
    runSchedule: woodAuthority.runWoodExpeditionSchedule,
  }),
  Object.freeze({
    kind: 'stone',
    prefix: 'STONE',
    balanceField: 'stone',
    accruedField: 'accruedStone',
    creditedField: 'creditedStone',
    resultCreditField: 'creditedStone',
    policyVersion: STONE_EXPEDITION_POLICY_VERSION,
    quantumMicros: STONE_GATHER_QUANTUM_MICROS,
    gatheringTotal: STONE_GATHERING_TOTAL_STONE,
    returnExpedition: stoneAuthority.returnActiveStoneExpedition,
    runSchedule: stoneAuthority.runStoneExpeditionSchedule,
  }),
]);

function configFor(kind: ResourceKind): ResourceConfig {
  const config = RESOURCE_CONFIGS.find(candidate => candidate.kind === kind);
  assert.ok(config);
  return config;
}

const STARTED_AT_MICROS = 1_900_000_000_000_000n;
const ARRIVES_AT_MICROS = STARTED_AT_MICROS + 30_000_000n;
const TRAVEL_MICROS = ARRIVES_AT_MICROS - STARTED_AT_MICROS;

function timestamp(microsSinceUnixEpoch: bigint) {
  return { microsSinceUnixEpoch };
}

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function sourceSection(
  text: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = text.indexOf(startNeedle);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing source section ${startNeedle}`);
  return text.slice(start, end);
}

function timelineFor(config: ResourceConfig) {
  const gatheringEndsAtMicros =
    ARRIVES_AT_MICROS + config.gatheringTotal * config.quantumMicros;
  return Object.freeze({
    startedAtMicros: STARTED_AT_MICROS,
    arrivesAtMicros: ARRIVES_AT_MICROS,
    gatheringEndsAtMicros,
    returnsAtMicros: gatheringEndsAtMicros + TRAVEL_MICROS,
  });
}

type LegacyMaps = Readonly<{
  expeditions: Map<string, AnyRow>;
  occupations: Map<string, AnyRow>;
  schedules: Map<bigint, AnyRow>;
}>;

function expeditionTable(rows: Map<string, AnyRow>) {
  return {
    count: () => BigInt(rows.size),
    iter: () => rows.values(),
    expeditionId: {
      find: (expeditionId: string) => rows.get(expeditionId) ?? null,
      update: (row: AnyRow) => {
        if (!rows.has(row.expeditionId)) throw new Error('missing expedition');
        rows.set(row.expeditionId, row);
        return row;
      },
      delete: (expeditionId: string) => rows.delete(expeditionId),
    },
    fid: {
      find: (fid: bigint) => (
        [...rows.values()].find(row => row.fid === fid) ?? null
      ),
    },
    originCastleId: {
      find: (originCastleId: bigint) => (
        [...rows.values()].find(
          row => row.originCastleId === originCastleId,
        ) ?? null
      ),
    },
    siteId: {
      filter: (siteId: string) => [...rows.values()]
        .filter(row => row.siteId === siteId),
    },
  };
}

function occupationTable(rows: Map<string, AnyRow>) {
  return {
    count: () => BigInt(rows.size),
    iter: () => rows.values(),
    siteId: {
      find: (siteId: string) => rows.get(siteId) ?? null,
      update: (row: AnyRow) => {
        if (!rows.has(row.siteId)) throw new Error('missing occupation');
        rows.set(row.siteId, row);
        return row;
      },
      delete: (siteId: string) => rows.delete(siteId),
    },
    byOriginCastle: {
      filter: (originCastleId: bigint) => [...rows.values()]
        .filter(row => row.originCastleId === originCastleId),
    },
  };
}

function scheduleTable(rows: Map<bigint, AnyRow>) {
  return {
    count: () => BigInt(rows.size),
    iter: () => rows.values(),
    scheduleId: {
      find: (scheduleId: bigint) => rows.get(scheduleId) ?? null,
      delete: (scheduleId: bigint) => rows.delete(scheduleId),
    },
    originCastleId: {
      filter: (originCastleId: bigint) => [...rows.values()]
        .filter(row => row.originCastleId === originCastleId),
    },
  };
}

function emptyGenericAssignmentTable() {
  return {
    count: () => 0n,
    iter: () => [][Symbol.iterator](),
    assignmentId: { find: () => null },
    workerId: { find: () => null },
    byFid: { filter: () => [] },
  };
}

function makeLegacyCutoverFixture(nowMicros: bigint) {
  const fid = 77_001n;
  const castleId = 1n;
  const slot = CANONICAL_CASTLE_SLOTS[0]!;
  const castle: AnyRow = {
    castleId,
    ownerFid: fid,
    tileKey: slot.tileKey,
    q: slot.q,
    r: slot.r,
    level: 1,
    name: 'Legacy Cutover Keep',
    createdAt: timestamp(STARTED_AT_MICROS),
  };
  const claim: AnyRow = {
    slotId: slot.slotId,
    ownerFid: fid,
    castleId,
    generationVersion: slot.generationVersion,
  };
  const profile: AnyRow = {
    fid,
    communityStatsVisible: false,
    firstAuthenticatedAt: undefined,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: undefined,
    marksSpentMicros: undefined,
    marksBalanceMicros: undefined,
    marksPolicyVersion: undefined,
  };
  const markAccount: AnyRow = {
    fid,
    totalSnapBurnedMicros: 0n,
    earnedMicros: 0n,
    spentMicros: 0n,
    balanceMicros: 0n,
    policyVersion: SNAP_MARK_POLICY_VERSION,
  };
  let account: AnyRow = {
    fid,
    castleId,
    realmId: CANONICAL_REALM.realmId,
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: nowMicros,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: timestamp(STARTED_AT_MICROS),
    updatedAt: timestamp(nowMicros),
  };
  const workers = new Map<string, AnyRow>(
    expectedWorkerRowsForCastle(castle)
      .map(row => [row.workerId, { ...row }] as const),
  );
  let workerSystem: AnyRow = {
    realmId: CANONICAL_REALM.realmId,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    expectedCastleCount: 1,
    expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    rosterDigest: rosterDigestForCastleIds([castleId]),
    mode: 'staged',
    legacyDrainRequired: true,
    createdAt: timestamp(STARTED_AT_MICROS),
    activatedAt: undefined,
  };
  const legacy = Object.fromEntries(
    RESOURCE_CONFIGS.map(config => [
      config.kind,
      {
        expeditions: new Map<string, AnyRow>(),
        occupations: new Map<string, AnyRow>(),
        schedules: new Map<bigint, AnyRow>(),
      } satisfies LegacyMaps,
    ]),
  ) as Record<ResourceKind, LegacyMaps>;

  const canonicalCastleTile = canonicalTileForKey(slot.tileKey)!;
  const castleTile = {
    ...canonicalCastleTile,
    occupantCastleId: castleId,
  };
  const castleMeta = canonicalMetaForKey(slot.tileKey)!;
  const emptyAssignments = emptyGenericAssignmentTable();
  const emptyGenericOccupations = {
    count: () => 0n,
    iter: () => [][Symbol.iterator](),
    nodeKey: { find: () => null },
  };
  const emptyGenericSchedules = {
    count: () => 0n,
    iter: () => [][Symbol.iterator](),
    scheduleId: { find: () => null },
    byAssignment: { filter: () => [] },
  };
  const emptyGenericReceipts = {
    count: () => 0n,
    iter: () => [][Symbol.iterator](),
    requestKey: { find: () => null },
  };

  const ctx: AnyRow = {
    timestamp: timestamp(nowMicros),
    db: {
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: (realmId: string) => (
            realmId === CANONICAL_REALM.realmId ? workerSystem : null
          ),
          update: (row: AnyRow) => {
            workerSystem = row;
            return row;
          },
        },
      },
      castle: {
        count: () => 1n,
        iter: () => [castle].values(),
        castleId: {
          find: (value: bigint) => value === castleId ? castle : null,
        },
        ownerFid: {
          find: (value: bigint) => value === fid ? castle : null,
        },
      },
      castleWorkerV1: {
        count: () => BigInt(workers.size),
        iter: () => workers.values(),
        workerId: {
          find: (workerId: string) => workers.get(workerId) ?? null,
        },
        byOriginCastle: {
          filter: (value: bigint) => [...workers.values()]
            .filter(row => row.originCastleId === value),
        },
      },
      workerAssignmentV1: emptyAssignments,
      workerNodeOccupationV1: emptyGenericOccupations,
      workerAssignmentScheduleV1: emptyGenericSchedules,
      workerCommandIdempotencyV1: emptyGenericReceipts,
      resourceAccountV1: {
        count: () => 1n,
        iter: () => [account].values(),
        fid: {
          find: (value: bigint) => value === fid ? account : null,
          update: (row: AnyRow) => {
            account = row;
            return row;
          },
        },
        castleId: {
          find: (value: bigint) => value === castleId ? account : null,
        },
      },
      allowedFid: {
        fid: {
          find: (value: bigint) => value === fid
            ? { fid, enabled: true, authEpoch: 1 }
            : null,
        },
      },
      realmProfileV1: {
        fid: {
          find: (value: bigint) => value === fid ? profile : null,
        },
      },
      markAccountV1: {
        fid: {
          find: (value: bigint) => value === fid ? markAccount : null,
        },
      },
      castleSlotClaimV1: {
        ownerFid: {
          find: (value: bigint) => value === fid ? claim : null,
        },
      },
      castleSlotV1: {
        slotId: {
          find: (slotId: number) => slotId === slot.slotId ? slot : null,
        },
      },
      realmV1: {
        realmId: {
          find: (realmId: string) => (
            realmId === CANONICAL_REALM.realmId ? CANONICAL_REALM : null
          ),
        },
      },
      worldTile: {
        key: {
          find: (key: string) => key === slot.tileKey ? castleTile : null,
        },
      },
      worldTileMetaV1: {
        tileKey: {
          find: (key: string) => key === slot.tileKey ? castleMeta : null,
        },
      },
      goldSiteV1: {
        iter: () => CANONICAL_TIER_I_GOLD_SITES_V1.values(),
      },
      foodSiteV1: {
        iter: () => CANONICAL_TIER_I_FOOD_SITES_V1.values(),
      },
      woodSiteV1: {
        iter: () => CANONICAL_TIER_I_WOOD_SITES_V1.values(),
      },
      stoneSiteV1: {
        iter: () => CANONICAL_TIER_I_STONE_SITES_V1.values(),
      },
      goldExpeditionV1: expeditionTable(legacy.gold.expeditions),
      foodExpeditionV1: expeditionTable(legacy.food.expeditions),
      woodExpeditionV1: expeditionTable(legacy.wood.expeditions),
      stoneExpeditionV1: expeditionTable(legacy.stone.expeditions),
      goldNodeOccupationV1: occupationTable(legacy.gold.occupations),
      foodNodeOccupationV1: occupationTable(legacy.food.occupations),
      woodNodeOccupationV1: occupationTable(legacy.wood.occupations),
      stoneNodeOccupationV1: occupationTable(legacy.stone.occupations),
      goldExpeditionScheduleV1: scheduleTable(legacy.gold.schedules),
      foodExpeditionScheduleV1: scheduleTable(legacy.food.schedules),
      woodExpeditionScheduleV1: scheduleTable(legacy.wood.schedules),
      stoneExpeditionScheduleV1: scheduleTable(legacy.stone.schedules),
    },
  };

  function seedExpedition(
    kind: ResourceKind,
    options: Readonly<{
      phase?: 'outbound' | 'gathering' | 'returning';
      creditedAmount?: bigint;
      originCastleId?: bigint;
      includeSchedules?: boolean;
    }> = {},
  ) {
    const config = configFor(kind);
    const timeline = timelineFor(config);
    const phase = options.phase ?? 'outbound';
    const creditedAmount = options.creditedAmount ?? (
      phase === 'returning' ? config.gatheringTotal : 0n
    );
    const originCastleId = options.originCastleId ?? castleId;
    const expeditionId = `${kind}-legacy-expedition-01`;
    const siteId = `${kind}-legacy-site-01`;
    const settledThroughMicros = phase === 'returning'
      ? timeline.gatheringEndsAtMicros
      : timeline.arrivesAtMicros + creditedAmount * config.quantumMicros;
    const expedition = {
      expeditionId,
      fid,
      originCastleId,
      siteId,
      phase,
      ...timeline,
      settledThroughMicros,
      [config.accruedField]: creditedAmount,
      [config.creditedField]: creditedAmount,
      policyVersion: config.policyVersion,
      createdAt: timestamp(STARTED_AT_MICROS),
      updatedAt: timestamp(nowMicros),
    };
    legacy[kind].expeditions.set(expeditionId, expedition);
    legacy[kind].occupations.set(siteId, {
      siteId,
      originCastleId,
      phase,
      ...timeline,
    });
    if (options.includeSchedules !== false) {
      const stages = [
        ['arrival', timeline.arrivesAtMicros],
        ['gathering-expiry', timeline.gatheringEndsAtMicros],
        ['return-complete', timeline.returnsAtMicros],
      ] as const;
      stages.forEach(([stage, atMicros], index) => {
        legacy[kind].schedules.set(BigInt(index + 1), {
          scheduleId: BigInt(index + 1),
          scheduledAt: {
            tag: 'Time',
            value: timestamp(atMicros),
          },
          originCastleId,
          siteId,
          stage,
        });
      });
    }
    if (creditedAmount > 0n) {
      account = {
        ...account,
        [config.balanceField]: creditedAmount,
        revision: account.revision + 1n,
      };
    }
    return expedition;
  }

  function counts() {
    return Object.freeze({
      goldExpeditions: legacy.gold.expeditions.size,
      foodExpeditions: legacy.food.expeditions.size,
      woodExpeditions: legacy.wood.expeditions.size,
      stoneExpeditions: legacy.stone.expeditions.size,
      goldOccupations: legacy.gold.occupations.size,
      foodOccupations: legacy.food.occupations.size,
      woodOccupations: legacy.wood.occupations.size,
      stoneOccupations: legacy.stone.occupations.size,
      goldSchedules: legacy.gold.schedules.size,
      foodSchedules: legacy.food.schedules.size,
      woodSchedules: legacy.wood.schedules.size,
      stoneSchedules: legacy.stone.schedules.size,
    });
  }

  function releaseAttestation() {
    return Object.freeze({
      capability: legacyReturnAuthority.WORKER_LEGACY_DRAIN_CAPABILITY,
      sourceCommit: 'b'.repeat(40),
      moduleArtifactDigest: 'a'.repeat(64),
      expectedCastleCount: 1,
      expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
      rosterDigest: rosterDigestForCastleIds([castleId]),
      resourceRosterDigest: resourceRosterDigest([account]),
      resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
      ...counts(),
    });
  }

  function activationAttestation() {
    return Object.freeze({
      capability: CASTLE_WORKER_PROTOCOL_CAPABILITY,
      clientRelease: 'alpha-0.3.18',
      clientArtifactDigest: 'c'.repeat(64),
      sourceCommit: 'b'.repeat(40),
      resourceStateVersion: CASTLE_WORKER_RESOURCE_STATE_VERSION,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
      resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
      expectedCastleCount: 1,
      expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
      rosterDigest: rosterDigestForCastleIds([castleId]),
      resourceRosterDigest: resourceRosterDigest([account]),
    });
  }

  return {
    fid,
    ctx,
    legacy,
    seedExpedition,
    counts,
    account: () => account,
    workerSystem: () => workerSystem,
    releaseAttestation,
    activationAttestation,
  };
}

for (const config of RESOURCE_CONFIGS) {
  test(`${config.kind} early return removes outbound graph with zero credit`, () => {
    const nowMicros = STARTED_AT_MICROS + 10_000_000n;
    const fixture = makeLegacyCutoverFixture(nowMicros);
    const expedition = fixture.seedExpedition(config.kind);

    const result = config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );

    assert.equal(result.returned, true);
    assert.equal(result[config.resultCreditField], 0n);
    assert.equal(result.schedulesRemoved, 3);
    assert.equal(fixture.account()[config.balanceField], 0n);
    assert.equal(fixture.legacy[config.kind].expeditions.size, 0);
    assert.equal(fixture.legacy[config.kind].occupations.size, 0);
    assert.equal(fixture.legacy[config.kind].schedules.size, 0);
  });

  test(`${config.kind} early return credits only completed whole gathering minutes`, () => {
    const timeline = timelineFor(config);
    const nowMicros =
      timeline.arrivesAtMicros + 5n * config.quantumMicros
        + config.quantumMicros - 1n;
    const fixture = makeLegacyCutoverFixture(nowMicros);
    const expedition = fixture.seedExpedition(config.kind, {
      phase: 'gathering',
    });

    const result = config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );

    assert.equal(result[config.resultCreditField], 5n);
    assert.equal(fixture.account()[config.balanceField], 5n);
    assert.equal(fixture.legacy[config.kind].expeditions.size, 0);
  });

  test(`${config.kind} early return credits only the delta after a prior collection`, () => {
    const timeline = timelineFor(config);
    const nowMicros =
      timeline.arrivesAtMicros + 5n * config.quantumMicros
        + config.quantumMicros / 2n;
    const fixture = makeLegacyCutoverFixture(nowMicros);
    const expedition = fixture.seedExpedition(config.kind, {
      phase: 'gathering',
      creditedAmount: 2n,
    });

    const result = config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );

    assert.equal(result[config.resultCreditField], 3n);
    assert.equal(fixture.account()[config.balanceField], 5n);
  });

  test(`${config.kind} returning row is removed without double credit`, () => {
    const timeline = timelineFor(config);
    const fixture = makeLegacyCutoverFixture(
      timeline.gatheringEndsAtMicros + 1n,
    );
    const expedition = fixture.seedExpedition(config.kind, {
      phase: 'returning',
    });

    const result = config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );

    assert.equal(result[config.resultCreditField], 0n);
    assert.equal(
      fixture.account()[config.balanceField],
      config.gatheringTotal,
    );
    assert.equal(fixture.legacy[config.kind].expeditions.size, 0);
  });

  test(`${config.kind} stale id fails and completed-id retry is a no-op`, () => {
    const fixture = makeLegacyCutoverFixture(
      STARTED_AT_MICROS + 10_000_000n,
    );
    const expedition = fixture.seedExpedition(config.kind);
    assert.throws(
      () => config.returnExpedition(
        fixture.ctx,
        fixture.fid,
        `${config.kind}-legacy-expedition-stale`,
      ),
      new RegExp(`${config.prefix}_EXPEDITION_RETURN_STALE`),
    );
    assert.equal(fixture.legacy[config.kind].expeditions.size, 1);

    const capturedSchedule = [...fixture.legacy[config.kind].schedules.values()][0]!;
    config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );
    const replay = config.returnExpedition(
      fixture.ctx,
      fixture.fid,
      expedition.expeditionId,
    );
    assert.deepEqual(replay, {
      returned: false,
      [config.resultCreditField]: 0n,
      schedulesRemoved: 0,
    });
    assert.doesNotThrow(() => config.runSchedule(
      fixture.ctx,
      capturedSchedule,
    ));
    assert.equal(fixture.legacy[config.kind].expeditions.size, 0);
  });

  test(`${config.kind} schedule mismatch fails closed before graph deletion`, () => {
    const fixture = makeLegacyCutoverFixture(
      STARTED_AT_MICROS + 10_000_000n,
    );
    const expedition = fixture.seedExpedition(config.kind);
    const firstSchedule =
      [...fixture.legacy[config.kind].schedules.values()][0]!;
    fixture.legacy[config.kind].schedules.set(firstSchedule.scheduleId, {
      ...firstSchedule,
      scheduledAt: {
        tag: 'Time',
        value: timestamp(ARRIVES_AT_MICROS + 1n),
      },
    });

    assert.throws(
      () => config.returnExpedition(
        fixture.ctx,
        fixture.fid,
        expedition.expeditionId,
      ),
      new RegExp(`${config.prefix}_EXPEDITION_SCHEDULE_INTEGRITY`),
    );
    assert.equal(fixture.legacy[config.kind].expeditions.size, 1);
    assert.equal(fixture.legacy[config.kind].occupations.size, 1);
    assert.equal(fixture.legacy[config.kind].schedules.size, 3);
    assert.equal(fixture.account()[config.balanceField], 0n);
  });

  test(`${config.kind} owner binding rejects a different origin castle`, () => {
    const fixture = makeLegacyCutoverFixture(
      STARTED_AT_MICROS + 10_000_000n,
    );
    const expedition = fixture.seedExpedition(config.kind, {
      originCastleId: 2n,
    });

    assert.throws(
      () => config.returnExpedition(
        fixture.ctx,
        fixture.fid,
        expedition.expeditionId,
      ),
      new RegExp(`${config.prefix}_EXPEDITION_OWNER_INTEGRITY`),
    );
    assert.equal(fixture.legacy[config.kind].expeditions.size, 1);
    assert.equal(fixture.legacy[config.kind].occupations.size, 1);
    assert.equal(fixture.legacy[config.kind].schedules.size, 3);
  });
}

test('authenticated return reducer exposes only kind and private expedition correlation id', () => {
  const reducers = source('../src/reducers/castleWorkers.ts');
  const boundary = sourceSection(
    reducers,
    'export const returnLegacyExpeditionV1',
    'export const adminGetWorkerSystemStatusV1',
  );
  assert.match(boundary, /name: 'return_legacy_expedition_v1'/);
  assert.match(
    boundary,
    /\{ resourceKind: t\.string\(\), expeditionId: t\.string\(\) \}/,
  );
  assert.match(boundary, /const \{ claims \} = requireGameplayPlayerV1\(ctx\)/);
  assert.match(boundary, /fid: claims\.fid/);
  assert.match(boundary, /resourceKind: legacyResourceKind\(resourceKind\)/);
  assert.match(boundary, /expeditionId,/);
  assert.doesNotMatch(
    boundary,
    /(?:fid|castleId|siteId|amount|reward|credit|timestamp|phase)\s*:\s*t\./i,
  );
});

test('common owner boundary routes exact ids across all four legacy authorities', () => {
  for (const config of RESOURCE_CONFIGS) {
    const fixture = makeLegacyCutoverFixture(
      STARTED_AT_MICROS + 10_000_000n,
    );
    const expedition = fixture.seedExpedition(config.kind);
    const result = legacyReturnAuthority.returnActiveLegacyExpedition(
      fixture.ctx,
      {
        fid: fixture.fid,
        resourceKind: config.kind,
        expeditionId: expedition.expeditionId,
      },
    );
    assert.deepEqual(result, {
      resourceKind: config.kind,
      returned: true,
      creditedAmount: 0n,
      schedulesRemoved: 3,
    });
  }
});

test('operator cutover binds exact per-table counts and leaves mismatches untouched', () => {
  const config = configFor('gold');
  const timeline = timelineFor(config);
  const fixture = makeLegacyCutoverFixture(
    timeline.arrivesAtMicros + 2n * config.quantumMicros,
  );
  for (const resource of RESOURCE_CONFIGS) {
    fixture.seedExpedition(resource.kind, { phase: 'gathering' });
  }
  const exact = fixture.releaseAttestation();
  const swappedCounts = Object.freeze({
    ...exact,
    goldExpeditions: exact.goldExpeditions + 1,
    foodExpeditions: exact.foodExpeditions - 1,
  });
  const before = fixture.counts();

  assert.throws(
    () => rolloutAuthority.completeWorkerLegacyDrain(
      fixture.ctx,
      swappedCounts,
    ),
    /WORKER_LEGACY_DRAIN_COUNT_MISMATCH/,
  );
  assert.deepEqual(fixture.counts(), before);
  assert.deepEqual(
    RESOURCE_CONFIGS.map(resource => fixture.account()[resource.balanceField]),
    [0n, 0n, 0n, 0n],
  );
});

test('operator cutover settles all four kinds, zero retry is inert, and activation stays separate', () => {
  const config = configFor('gold');
  const timeline = timelineFor(config);
  const fixture = makeLegacyCutoverFixture(
    timeline.arrivesAtMicros + 2n * config.quantumMicros
      + config.quantumMicros / 2n,
  );
  for (const resource of RESOURCE_CONFIGS) {
    fixture.seedExpedition(resource.kind, { phase: 'gathering' });
  }
  const releaseAttestation = fixture.releaseAttestation();
  const activationAttestation = fixture.activationAttestation();

  assert.throws(
    () => rolloutAuthority.activateWorkerSystem(
      fixture.ctx,
      activationAttestation,
    ),
    /WORKER_LEGACY_DRAIN_REQUIRED/,
  );
  const result = rolloutAuthority.completeWorkerLegacyDrain(
    fixture.ctx,
    releaseAttestation,
  );
  assert.equal(result.completed, true);
  assert.equal(result.returnedExpeditions, 4);
  assert.equal(result.removedSchedules, 12);
  assert.equal(result.creditedGold, 2n);
  assert.equal(result.creditedFood, 2n);
  assert.equal(result.creditedWood, 2n);
  assert.equal(result.creditedStone, 2n);
  assert.ok(Object.values(result.after).every(value => value === 0));
  assert.equal(fixture.workerSystem().mode, 'staged');
  assert.equal(fixture.workerSystem().legacyDrainRequired, true);

  const retry = rolloutAuthority.completeWorkerLegacyDrain(
    fixture.ctx,
    releaseAttestation,
  );
  assert.equal(retry.completed, false);
  assert.equal(retry.returnedExpeditions, 0);
  assert.equal(retry.removedSchedules, 0);
  assert.deepEqual(retry.before, retry.after);
  assert.ok(Object.values(retry.after).every(value => value === 0));
  assert.deepEqual(
    RESOURCE_CONFIGS.map(resource => fixture.account()[resource.balanceField]),
    [2n, 2n, 2n, 2n],
  );

  const active = rolloutAuthority.activateWorkerSystem(
    fixture.ctx,
    fixture.activationAttestation(),
  );
  assert.equal(active.mode, 'active');
  assert.equal(active.legacyDrainRequired, false);
});
