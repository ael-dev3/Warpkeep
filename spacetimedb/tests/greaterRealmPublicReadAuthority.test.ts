import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertGreaterRealmIndexedPublicReadAuthorityV1,
} from '../src/greaterRealmPublicReadAuthority';
import { assertGreaterRealmWorkerReadRootsV2 } from '../src/greaterRealmWorkerReadAuthority';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
} from '../src/castleWorkerPolicy';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../src/resourceAuthorityPolicy';
import { ADMITTED_DAILY_MARK_POLICY_VERSION } from '../src/marksAuthorityPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_VISIBLE_TIER_MAX,
} from '../src/greaterRealmV17Policy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
} from '../src/world';

type ReadableMode = 'canary' | 'active' | 'halted';
type FounderKind = 'relocated' | 'founded';

const PREPARED = Object.freeze({ microsSinceUnixEpoch: 1n });
const DRAINING = Object.freeze({ microsSinceUnixEpoch: 2n });
const FROZEN = Object.freeze({ microsSinceUnixEpoch: 3n });
const PLANNED = Object.freeze({ microsSinceUnixEpoch: 4n });
const CANARY = Object.freeze({ microsSinceUnixEpoch: 5n });
const ACTIVATED = Object.freeze({ microsSinceUnixEpoch: 6n });
const HALTED = Object.freeze({ microsSinceUnixEpoch: 7n });
const FOUNDED = Object.freeze({ microsSinceUnixEpoch: 8n });

function indexedTable(
  rows: Array<Record<string, unknown>>,
  indexNames: readonly string[],
  count: bigint = BigInt(rows.length),
) {
  const table: Record<string, unknown> = {
    rows,
    count: () => count,
    iter: () => {
      throw new Error('UNBOUNDED_ITER_FORBIDDEN');
    },
  };
  for (const indexName of indexNames) {
    table[indexName] = {
      find: (key: unknown) => rows.find(row => row[indexName] === key) ?? null,
      filter: () => {
        throw new Error('UNBOUNDED_FILTER_FORBIDDEN');
      },
    };
  }
  return table;
}

type PublicReadFixture = ReturnType<typeof makePublicReadFixture>;

function makePublicReadFixture(
  mode: ReadableMode = 'active',
  founderKind: FounderKind = 'relocated',
) {
  const atlasId = 'atlas-v17';
  const publicReleaseId = 'release-v17';
  const activationId = 'activation-v17';
  const castleId = 1n;
  const fid = 77n;
  const cellKey = 'T1_LOWLANDS:0:0';
  const componentKey = 'component-v17';
  const chunkHandle = 'GRK-AAAAAAAAAAAAAAAAAAAAAAAAAA';
  const slotId = 'GRS-AAAAAAAAAAAAAAAAAAAAAAAAAA';
  const everActive = mode === 'active' || mode === 'halted';
  const snapshotCastleCount = founderKind === 'relocated' ? 1 : 0;
  const postCanaryFoundingCount = founderKind === 'founded' ? 1 : 0;
  const claimActivatedAt = founderKind === 'relocated' ? CANARY : FOUNDED;
  const legacySlot = CANONICAL_CASTLE_SLOTS[0]!;
  const canonicalTile = canonicalTileForKey(legacySlot.tileKey)!;
  const canonicalMeta = canonicalMetaForKey(legacySlot.tileKey)!;

  const activation: Record<string, unknown> = {
    activationId,
    atlasId,
    mode,
    preparedAt: PREPARED,
    drainingAt: DRAINING,
    frozenAt: FROZEN,
    plannedAt: PLANNED,
    canaryAt: CANARY,
    activatedAt: everActive ? ACTIVATED : undefined,
    haltedAt: mode === 'halted' ? HALTED : undefined,
    rolledBackAt: undefined,
    snapshotCastleCount,
    snapshotWorkerCount: snapshotCastleCount * 4,
    snapshotResourceAccountCount: snapshotCastleCount,
    snapshotMarkAccountCount: snapshotCastleCount,
    snapshotClaimCount: snapshotCastleCount,
    snapshotOccupancyCount: snapshotCastleCount,
    postCanaryFoundingCount,
    postCanaryDispatchCount: 0,
    nextAllocationSequence: 1n,
  };

  const manifest = GREATER_REALM_PUBLIC_REGIONS.map((region, index) => ({
    regionId: region.id,
    publicName: region.name,
    ordinal: region.ordinal,
    tier: GREATER_REALM_VISIBLE_TIER_MAX,
    cellCount: index === 0 ? 2 : 0,
    passableCellCount: index === 0 ? 1 : 0,
    chunkCount: index === 0 ? 1 : 0,
    castleCapacity: GREATER_REALM_CASTLES_PER_REGION,
    resourceLocationCount: 0,
    resourceNodeCount: 0,
    foodNodeCount: 0,
    woodNodeCount: 0,
    stoneNodeCount: 0,
    goldNodeCount: 0,
    active: false,
  }));
  const release: Record<string, unknown> = {
    atlasId,
    publicReleaseId,
    publicName: 'Greater Realm Fixture',
    state: mode,
    readyAt: FROZEN,
    expectedRegionCount: GREATER_REALM_PUBLIC_REGIONS.length,
    expectedComponentCount: 1,
    expectedChunkCount: 1,
    expectedCellCount: 2,
    expectedSlotCount: GREATER_REALM_CASTLE_CAPACITY,
    expectedResourceNodeCount: 0,
    verifiedComponentCount: 1,
    verifiedChunkCount: 1,
    verifiedCellCount: 2,
    verifiedSlotCount: GREATER_REALM_CASTLE_CAPACITY,
    verifiedResourceNodeCount: 0,
    importedPassableCellCount: 1,
    componentExpectedCellCount: 1,
    componentExpectedSlotCount: GREATER_REALM_CASTLE_CAPACITY,
    componentExpectedResourceNodeCount: 0,
    verificationPhase: 'complete',
    generatorVersion: 'generator-v17',
    runtimePartitionVersion: 'partition-v17',
    rendererContractVersion: 'renderer-v17',
    regionManifestJson: `${JSON.stringify(manifest)}\n`,
  };
  const atlas: Record<string, unknown> = {
    atlasId,
    publicReleaseId,
    name: release.publicName,
    protocolVersion: GREATER_REALM_PROTOCOL_VERSION,
    generatorVersion: release.generatorVersion,
    runtimePartitionVersion: release.runtimePartitionVersion,
    rendererContractVersion: release.rendererContractVersion,
    revision: 1n,
    visibleTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    navigationTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    foundingTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    visibleRegionCount: GREATER_REALM_PUBLIC_REGIONS.length,
    visibleCellCount: 2,
    visibleChunkCount: 1,
    castleCapacity: GREATER_REALM_CASTLE_CAPACITY,
    mode,
    createdAt: CANARY,
    activatedAt: everActive ? ACTIVATED : undefined,
  };
  const regions = manifest.map(row => ({ ...row, atlasId, active: true }));
  const castle: Record<string, unknown> = {
    castleId,
    ownerFid: fid,
    tileKey: cellKey,
    q: 30,
    r: 45,
    level: 1,
    name: 'Fixture Keep',
    createdAt: claimActivatedAt,
  };
  const claim: Record<string, unknown> = {
    slotId,
    ownerFid: fid,
    castleId,
    activationId,
    atlasId,
    state: 'active',
    claimKind: founderKind,
    allocationSequence: 0n,
    plannedAt: founderKind === 'relocated' ? PLANNED : claimActivatedAt,
    activatedAt: claimActivatedAt,
    legacySlotId: founderKind === 'relocated' ? legacySlot.slotId : undefined,
    legacyClaimedAt: founderKind === 'relocated' ? PREPARED : undefined,
    legacyGenerationVersion:
      founderKind === 'relocated' ? legacySlot.generationVersion : undefined,
    legacyTileKey: founderKind === 'relocated' ? legacySlot.tileKey : undefined,
    legacyQ: founderKind === 'relocated' ? legacySlot.q : undefined,
    legacyR: founderKind === 'relocated' ? legacySlot.r : undefined,
  };
  const slot: Record<string, unknown> = {
    slotId,
    atlasId,
    cellKey,
    regionId: GREATER_REALM_PUBLIC_REGIONS[0]!.id,
    componentKey,
    tier: GREATER_REALM_VISIBLE_TIER_MAX,
    regionOrderRank: 0,
    allocationRank: 0,
    active: true,
  };
  const cell: Record<string, unknown> = {
    cellKey,
    atlasId,
    regionId: GREATER_REALM_PUBLIC_REGIONS[0]!.id,
    componentKey,
    chunkHandle,
    atlasQ: 30,
    atlasR: 45,
    tier: GREATER_REALM_VISIBLE_TIER_MAX,
    passable: true,
    yieldClass: 1,
  };
  const occupancy: Record<string, unknown> = {
    castleId,
    cellKey,
    atlasId,
    regionId: GREATER_REALM_PUBLIC_REGIONS[0]!.id,
    atlasRevision: 1n,
    occupiedAt: claimActivatedAt,
  };
  const chunk: Record<string, unknown> = {
    atlasId,
    chunkHandle,
    binQ: 2,
    binR: 3,
    chunkCoordKey: 'B:2:3',
  };
  const component: Record<string, unknown> = {
    atlasId,
    componentKey,
    regionMask: 1,
    active: true,
  };
  const legacyTile: Record<string, unknown> = {
    ...canonicalTile,
    occupantCastleId: undefined,
  };
  const legacyMeta: Record<string, unknown> = { ...canonicalMeta };
  const profile: Record<string, unknown> = {
    fid,
    canonicalUsername: 'fixture',
    displayName: 'Fixture Founder',
    pfpUrl: undefined,
    publicBio: undefined,
    admittedAt: PREPARED,
    firstAuthenticatedAt: undefined,
    profileUpdatedAt: CANARY,
    publicStatus: 'founded',
    communityStatsVisible: false,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: undefined,
    marksSpentMicros: undefined,
    marksBalanceMicros: undefined,
    marksPolicyVersion: undefined,
  };
  const marks: Record<string, unknown> = {
    fid,
    totalSnapBurnedMicros: 0n,
    earnedMicros: 0n,
    spentMicros: 0n,
    balanceMicros: 0n,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    updatedAt: CANARY,
  };
  const resource: Record<string, unknown> = {
    fid,
    castleId,
    realmId: CANONICAL_REALM.realmId,
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: CANARY.microsSinceUnixEpoch,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: CANARY,
    updatedAt: CANARY,
  };

  const rows = {
    activation,
    release,
    atlas,
    regions,
    castle,
    claim,
    slot,
    cell,
    occupancy,
    chunk,
    component,
    legacySlot: { ...legacySlot } as Record<string, unknown>,
    legacyTile,
    legacyMeta,
    profile,
    marks,
    resource,
  };
  const db = {
    greaterRealmReleaseV1: indexedTable([release], ['atlasId']),
    realmAtlasV1: indexedTable([atlas], ['atlasId']),
    realmAtlasVisibleRegionV1: indexedTable(regions, ['regionId']),
    realmV1: indexedTable([{ ...CANONICAL_REALM, active: false }], ['realmId']),
    greaterRealmNavigationComponentV1: indexedTable([component], ['componentKey']),
    greaterRealmChunkV1: indexedTable([chunk], ['chunkHandle']),
    greaterRealmCellV1: indexedTable([cell], ['cellKey'], 2n),
    greaterRealmCastleSlotV1: indexedTable(
      [slot],
      ['slotId'],
      BigInt(GREATER_REALM_CASTLE_CAPACITY),
    ),
    greaterRealmResourceNodeV1: indexedTable([], ['nodeId'], 0n),
    castle: indexedTable([castle], ['castleId', 'ownerFid']),
    greaterRealmCastleClaimV1: indexedTable([claim], ['castleId', 'slotId', 'ownerFid']),
    greaterRealmCellOccupancyV1: indexedTable([occupancy], ['castleId', 'cellKey']),
    castleSlotClaimV1: indexedTable([], ['slotId', 'ownerFid'], 0n),
    allowedFid: indexedTable([{ fid }], ['fid']),
    realmProfileV1: indexedTable([profile], ['fid']),
    markAccountV1: indexedTable([marks], ['fid']),
    resourceAccountV1: indexedTable([resource], ['fid', 'castleId']),
    castleSlotV1: indexedTable([rows.legacySlot], ['slotId']),
    worldTile: indexedTable([legacyTile], ['key']),
    worldTileMetaV1: indexedTable([legacyMeta], ['tileKey']),
  };
  return {
    activation,
    caller: { fid, castle },
    ctx: { db, timestamp: Object.freeze({ microsSinceUnixEpoch: 10n }) },
    rows,
  };
}

function assertFixtureReadable(fixture: PublicReadFixture): void {
  assert.doesNotThrow(() => assertGreaterRealmIndexedPublicReadAuthorityV1(
    fixture.ctx as never,
    fixture.activation as never,
    fixture.caller as never,
  ));
}

function assertFixtureRejected(fixture: PublicReadFixture): void {
  assert.throws(() => assertGreaterRealmIndexedPublicReadAuthorityV1(
    fixture.ctx as never,
    fixture.activation as never,
    fixture.caller as never,
  ));
}

function makeWorkerReadFixture(mode: ReadableMode = 'active') {
  const fixture = makePublicReadFixture(mode);
  const activation = fixture.rows.activation;
  const rosterDigest = '0123456789abcdef';
  const workerV2: Record<string, unknown> = {
    atlasId: activation.atlasId,
    mode,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    castleCapacity: GREATER_REALM_CASTLE_CAPACITY,
    currentCastleCount: 1,
    currentWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    rosterDigest,
    createdAt: CANARY,
    activatedAt: activation.activatedAt,
  };
  const workerV1: Record<string, unknown> = {
    realmId: CANONICAL_REALM.realmId,
    mode: 'active',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    expectedCastleCount: 1,
    expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    rosterDigest,
    legacyDrainRequired: false,
    createdAt: PREPARED,
    activatedAt: CANARY,
  };
  const db = fixture.ctx.db as Record<string, unknown>;
  db.realmWorkerSystemV2 = indexedTable([workerV2], ['atlasId']);
  db.realmWorkerSystemV1 = indexedTable([workerV1], ['realmId']);
  db.castleWorkerV1 = indexedTable(
    [{ workerId: 'CW-1-1' }],
    ['workerId'],
    BigInt(CASTLE_WORKERS_PER_CASTLE),
  );
  const authority = assertGreaterRealmIndexedPublicReadAuthorityV1(
    fixture.ctx as never,
    fixture.activation as never,
    fixture.caller as never,
  );
  return { fixture, authority, workerV1, workerV2 };
}

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, start: string, end?: string): string {
  const startAt = text.indexOf(start);
  assert.notEqual(startAt, -1, `missing source marker: ${start}`);
  if (end === undefined) return text.slice(startAt);
  const endAt = text.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing source marker: ${end}`);
  return text.slice(startAt, endAt);
}

test('indexed public reads accept exact relocated callers in every readable mode', () => {
  for (const mode of ['canary', 'active', 'halted'] as const) {
    const fixture = makePublicReadFixture(mode, 'relocated');
    assert.ok(
      Number(fixture.rows.release.expectedCellCount)
        > Number(fixture.rows.release.importedPassableCellCount),
    );
    assert.equal(
      fixture.rows.release.componentExpectedCellCount,
      fixture.rows.release.importedPassableCellCount,
    );
    assert.equal('castleWorkerV1' in fixture.ctx.db, false);
    assert.equal('realmWorkerSystemV1' in fixture.ctx.db, false);
    assert.equal('realmWorkerSystemV2' in fixture.ctx.db, false);
    assert.equal('castleInnerBuilderV1' in fixture.ctx.db, false);
    assertFixtureReadable(fixture);
  }
});

test('indexed public reads accept exact post-canary founded callers', () => {
  for (const mode of ['active', 'halted'] as const) {
    assertFixtureReadable(makePublicReadFixture(mode, 'founded'));
  }
});

test('indexed public reads reject hostile root drift', () => {
  const cases: ReadonlyArray<Readonly<{
    name: string;
    mutate: (fixture: PublicReadFixture) => void;
  }>> = [
    {
      name: 'activation count',
      mutate: fixture => { fixture.rows.activation.snapshotClaimCount = 0; },
    },
    {
      name: 'activation mode',
      mutate: fixture => { fixture.rows.activation.mode = 'draining'; },
    },
    {
      name: 'release state',
      mutate: fixture => { fixture.rows.release.state = 'canary'; },
    },
    {
      name: 'release identity',
      mutate: fixture => { fixture.rows.release.publicReleaseId = 'hostile-release'; },
    },
    {
      name: 'component/passable census divergence',
      mutate: fixture => { fixture.rows.release.componentExpectedCellCount = 2; },
    },
    {
      name: 'imported passable census divergence',
      mutate: fixture => { fixture.rows.release.importedPassableCellCount = 2; },
    },
    {
      name: 'atlas mode',
      mutate: fixture => { fixture.rows.atlas.mode = 'canary'; },
    },
    {
      name: 'atlas revision',
      mutate: fixture => { fixture.rows.atlas.revision = 2n; },
    },
    {
      name: 'region activation',
      mutate: fixture => { fixture.rows.regions[0]!.active = false; },
    },
    {
      name: 'region manifest correlation',
      mutate: fixture => { fixture.rows.regions[0]!.cellCount = 3; },
    },
  ];
  for (const hostile of cases) {
    const fixture = makePublicReadFixture();
    hostile.mutate(fixture);
    assertFixtureRejected(fixture);
  }
});

test('indexed public reads reject hostile caller placement drift', () => {
  const cases: ReadonlyArray<Readonly<{
    name: string;
    mutate: (fixture: PublicReadFixture) => void;
  }>> = [
    {
      name: 'claim owner',
      mutate: fixture => { fixture.rows.claim.ownerFid = 88n; },
    },
    {
      name: 'slot rank bound',
      mutate: fixture => {
        fixture.rows.slot.regionOrderRank = GREATER_REALM_CASTLES_PER_REGION;
      },
    },
    {
      name: 'slot allocation bound',
      mutate: fixture => {
        fixture.rows.slot.allocationRank = GREATER_REALM_CASTLE_CAPACITY;
      },
    },
    {
      name: 'allocation round correlation',
      mutate: fixture => { fixture.rows.slot.regionOrderRank = 1; },
    },
    {
      name: 'cell passability',
      mutate: fixture => { fixture.rows.cell.passable = false; },
    },
    {
      name: 'component region mask',
      mutate: fixture => { fixture.rows.component.regionMask = 2; },
    },
    {
      name: 'cell castle coordinate',
      mutate: fixture => { fixture.rows.cell.atlasQ = 31; },
    },
    {
      name: 'occupancy revision',
      mutate: fixture => { fixture.rows.occupancy.atlasRevision = 2n; },
    },
    {
      name: 'occupancy timestamp',
      mutate: fixture => { fixture.rows.occupancy.occupiedAt = HALTED; },
    },
    {
      name: 'chunk bin',
      mutate: fixture => { fixture.rows.chunk.binQ = 3; },
    },
    {
      name: 'chunk coordinate key',
      mutate: fixture => { fixture.rows.chunk.chunkCoordKey = 'B:2:4'; },
    },
  ];
  for (const hostile of cases) {
    const fixture = makePublicReadFixture();
    hostile.mutate(fixture);
    assertFixtureRejected(fixture);
  }
});

test('indexed public reads reject hostile relocated preimages', () => {
  const cases: ReadonlyArray<(fixture: PublicReadFixture) => void> = [
    fixture => { fixture.rows.claim.legacyGenerationVersion = 99; },
    fixture => { fixture.rows.claim.legacyQ = 99; },
    fixture => { fixture.rows.legacySlot.tileKey = '1,1'; },
    fixture => { fixture.rows.legacyTile.occupantCastleId = 1n; },
    fixture => { fixture.rows.legacyTile.terrainSeed = 0; },
    fixture => { fixture.rows.legacyMeta.terrainKind = 'forest'; },
  ];
  for (const mutate of cases) {
    const fixture = makePublicReadFixture();
    mutate(fixture);
    assertFixtureRejected(fixture);
  }
});

test('indexed public reads reject pre-cutover and rolled-back activation phases', () => {
  const preCutover = makePublicReadFixture('canary');
  preCutover.activation.mode = 'planned';
  preCutover.activation.canaryAt = undefined;
  preCutover.activation.activatedAt = undefined;
  assertFixtureRejected(preCutover);

  const rolledBack = makePublicReadFixture('canary');
  rolledBack.activation.mode = 'rolled-back';
  rolledBack.activation.rolledBackAt = HALTED;
  assertFixtureRejected(rolledBack);
});

test('Worker-specific V1/V2 roots remain readable in canary, active, and halted', () => {
  for (const mode of ['canary', 'active', 'halted'] as const) {
    const { fixture, authority } = makeWorkerReadFixture(mode);
    assert.doesNotThrow(() => assertGreaterRealmWorkerReadRootsV2(
      fixture.ctx as never,
      authority,
    ));
  }
});

test('Worker-specific V1/V2 roots reject every caller-local root drift', () => {
  const cases: ReadonlyArray<(input: ReturnType<typeof makeWorkerReadFixture>) => void> = [
    input => { input.workerV2.atlasId = 'other-atlas'; },
    input => { input.workerV2.mode = 'canary'; },
    input => { input.workerV2.policyVersion = 'hostile-policy'; },
    input => { input.workerV2.workersPerCastle = 3; },
    input => { input.workerV2.castleCapacity = 599; },
    input => { input.workerV2.currentCastleCount = 0; },
    input => { input.workerV2.currentWorkerCount = 3; },
    input => { input.workerV2.createdAt = FROZEN; },
    input => { input.workerV2.activatedAt = CANARY; },
    input => { input.workerV2.rosterDigest = 'not-a-digest'; },
    input => { input.workerV1.policyVersion = 'hostile-policy'; },
    input => { input.workerV1.workersPerCastle = 3; },
    input => { input.workerV1.expectedCastleCount = 0; },
    input => { input.workerV1.expectedWorkerCount = 3; },
    input => { input.workerV1.mode = 'staged'; },
    input => { input.workerV1.legacyDrainRequired = true; },
    input => { input.workerV1.rosterDigest = 'fedcba9876543210'; },
    input => { input.workerV1.activatedAt = Object.freeze({ microsSinceUnixEpoch: 11n }); },
    input => {
      const db = input.fixture.ctx.db as Record<string, unknown>;
      db.castleWorkerV1 = indexedTable([], ['workerId'], 3n);
    },
  ];
  for (const mutate of cases) {
    const input = makeWorkerReadFixture();
    mutate(input);
    assert.throws(() => assertGreaterRealmWorkerReadRootsV2(
      input.fixture.ctx as never,
      input.authority,
    ));
  }
});

test('v17 public reads authenticate before touching activation roots', () => {
  const auth = source('../src/auth.ts');
  const gameplayRead = section(
    auth,
    'export function requireGameplayReadPlayerV1',
    '/** Exact caller-scoped v17 map authority',
  );
  const authenticationAt = gameplayRead.indexOf(
    'requireAuthenticatedCastleOwnerActionV1(ctx)',
  );
  const activationAt = gameplayRead.indexOf('currentGreaterRealmActivationRowV1(ctx)');
  assert.ok(authenticationAt >= 0 && authenticationAt < activationAt);
  assert.match(gameplayRead, /assertGreaterRealmIndexedPublicReadAuthorityV1/);
  assert.match(gameplayRead, /assertGreaterRealmResourceForIndexedReadV1/);
  assert.doesNotMatch(gameplayRead, /assertGenesisFounder|assertCurrentFounder/);

  const mapRead = section(
    auth,
    'export function requireGreaterRealmPublicReadAuthorityV1',
    '/** Admin inputs use',
  );
  assert.ok(
    mapRead.indexOf('requireAuthenticatedCastleOwnerActionV1(ctx)')
      < mapRead.indexOf('currentGreaterRealmActivationRowV1(ctx)'),
  );
});

test('indexed public authority retains roots and caller preimages without population scans', () => {
  const authority = source('../src/greaterRealmPublicReadAuthority.ts');
  const resource = source('../src/resourceAuthority.ts');
  for (const forbidden of [
    /assertGreaterRealmCurrentWorldV1/,
    /assertGenesisFounder/,
    /assertCurrentFounder/,
    /rosterDigestForCastleIds/,
    /assertCastleWorkerRoster/,
    /castleWorkerV1\.iter\(\)/,
    /greaterRealmCastleClaimV1\.iter\(\)/,
    /castle\.iter\(\)/,
    /realmWorkerSystemV[12]/,
    /castleWorkerV1/,
    /castleInnerBuilderV1/,
  ]) assert.doesNotMatch(authority, forbidden);
  assert.match(authority, /castleSlotClaimV1\.count\(\) !== 0n/);
  assert.match(
    authority,
    /release\.componentExpectedCellCount !== release\.importedPassableCellCount/,
  );
  assert.doesNotMatch(
    authority,
    /release\.componentExpectedCellCount !== release\.expectedCellCount/,
  );
  assert.match(authority, /matchesCanonicalRealm\(\{ \.\.\.legacyRealm, active: true \}\)/);
  assert.match(authority, /matchesGenerationV2Realm\(\{ \.\.\.legacyRealm, active: true \}\)/);
  assert.match(authority, /slot\.regionOrderRank >= GREATER_REALM_CASTLES_PER_REGION/);
  assert.match(authority, /slot\.allocationRank >= GREATER_REALM_CASTLE_CAPACITY/);
  assert.match(
    authority,
    /slot\.regionOrderRank !== Number\([\s\S]*claim\.allocationSequence \/ BigInt\(GREATER_REALM_PUBLIC_REGIONS\.length\)/,
  );
  assert.match(authority, /legacySlot\.generationVersion !== claim\.legacyGenerationVersion/);
  assert.match(authority, /legacyTile\.occupantCastleId !== undefined/);
  assert.match(authority, /matchesCanonicalTerrain\(legacyTile\)/);
  assert.match(authority, /matchesCanonicalWorldMeta\(legacyMeta\)/);

  const provided = section(
    resource,
    'export function assertGreaterRealmResourceForIndexedReadV1',
    '/** Insert the compiled starting state',
  );
  assert.doesNotMatch(provided, /assertGenesisFounder|assertCurrentFounder|accountMatchesFounder/);
  assert.match(provided, /greaterRealmClaim: claim/);
  assert.match(provided, /terrainKind: terrainForFounder\(ctx, founder\)/);
});

test('all public polls use read gates while all mutation reducers keep full gameplay gates', () => {
  const reducerPaths = [
    'castleWorkers', 'foodExpeditions', 'goldExpeditions', 'greaterRealm',
    'innerKeep', 'realmChat', 'resources', 'stoneExpeditions', 'woodExpeditions',
  ];
  const reducers = reducerPaths.map(name => source(`../src/reducers/${name}.ts`)).join('\n');
  assert.equal(reducers.match(/requireGameplayReadPlayerV1\(tx\)/g)?.length, 14);
  assert.equal(reducers.match(/requireGreaterRealmPublicReadAuthorityV1\(tx\)/g)?.length, 5);
  assert.equal(reducers.match(/requireGameplayPlayerV1\(ctx\)/g)?.length, 16);

  const greaterRealm = source('../src/reducers/greaterRealm.ts');
  assert.doesNotMatch(greaterRealm, /requireGameplayPlayerV1|requireReadableAtlas/);
  assert.equal(
    greaterRealm.match(/requireGreaterRealmPublicReadAuthorityV1\(tx\)/g)?.length,
    5,
  );
});

test('read projections consume provided caller resources without hidden global re-entry', () => {
  const workers = source('../src/castleWorkerAuthority.ts');
  const workerCore = section(
    workers,
    'function projectWorkerState(',
    '/** Frozen v1 projection',
  );
  assert.match(workerCore, /resource: GenesisResourceAuthority/);
  assert.doesNotMatch(workerCore, /assertGenesisResourceForFid/);

  const workerReducers = source('../src/reducers/castleWorkers.ts');
  for (const projection of [
    'projectMyWorkerStateForIndexedReadV1',
    'projectMyWorkerStateForCurrentGameplayIndexedReadV1',
    'projectMyGreaterRealmWorkerStateV2ForIndexedReadV1',
  ]) assert.match(workerReducers, new RegExp(`${projection}\\(`));

  const inner = source('../src/innerKeepAuthority.ts');
  const innerCore = section(
    inner,
    'function projectMyInnerKeepStateWithResource',
    'export function projectMyInnerKeepState(',
  );
  assert.match(innerCore, /resourceAuthority: GenesisResourceAuthority/);
  assert.match(innerCore, /projectMyWorkerStateForCurrentGameplayIndexedReadV1/);
  assert.doesNotMatch(innerCore, /assertGenesisResourceForFid/);

  const innerReducer = source('../src/reducers/innerKeep.ts');
  const state = section(
    innerReducer,
    'export const getMyInnerKeepStateV1',
    'export const getMyInnerKeepRequestStatusV1',
  );
  assert.match(state, /projectMyInnerKeepStateForIndexedReadV1\(tx, read\)/);
});

test('V2 Worker control adds its own exact O(1) roots after the generic gate', () => {
  const reducer = source('../src/greaterRealmWorkerReadAuthority.ts');
  const root = section(
    reducer,
    'export function assertGreaterRealmWorkerReadRootsV2(',
  );
  assert.match(root, /authority: GreaterRealmIndexedPublicReadAuthorityV1 \| undefined/);
  assert.match(root, /realmWorkerSystemV2\.atlasId\.find\(activation\.atlasId\)/);
  assert.match(root, /realmWorkerSystemV1\.realmId\.find\('GENESIS_001'\)/);
  assert.match(root, /worker\.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY/);
  assert.match(root, /worker\.currentCastleCount !== expectedCastleCount/);
  assert.match(root, /worker\.currentWorkerCount !== expectedWorkerCount/);
  assert.match(root, /workerV1\.rosterDigest !== worker\.rosterDigest/);
  assert.match(root, /!\/\^\[0-9a-f\]\{16\}\$\/u\.test\(worker\.rosterDigest\)/);
  assert.match(root, /activation\.mode !== 'canary'/);
  assert.match(root, /activation\.mode !== 'active'/);
  assert.match(root, /activation\.mode !== 'halted'/);
  assert.doesNotMatch(root, /\.iter\(\)|\.filter\(/);
});
