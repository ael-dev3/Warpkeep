import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILE_META,
  CANONICAL_WORLD_TILES
} from '../../spacetimedb/src/world';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../../spacetimedb/src/stoneSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../../spacetimedb/src/woodSitePolicy';
import { validateCanonicalGenesisSnapshot } from '../spacetime/canonicalGenesisSnapshot';
import type {
  WarpkeepRealmSnapshotCandidate
} from '../spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../spacetime/warpkeepProtocol';
import {
  CASTLE_WORKER_POLICY_VERSION,
  canonicalWorkerId,
  resolveReadyWorkerProjection,
  workerRosterDigestForCastleIds,
  type ReadyWorkerProjection,
  type ReadyWorkerResourceState,
  type RealmWorkerNodeOccupation,
  type RealmWorkerPublicPresentation,
  type WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import {
  REALM_RESOURCE_POLICY_VERSION,
  type RealmEconomicResourceKey
} from '../components/realm/realmResourcePresentation';
import { canonicalPassableRoute } from '../game/map/canonicalPassableRoute';
import {
  createRealmObserverHarnessRealm,
  parseRealmObserverSnapshot,
  type RealmObserverHarnessRealm,
  type RealmObserverSnapshot
} from './realmObserverSnapshot';
import {
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_FIXTURE_ID
} from './renderedWebglQa';

export const RENDERED_WEBGL_QA_OWNER_SEED = 917;
export const RENDERED_WEBGL_QA_LONG_DISPLAY_NAME =
  'QA Keeper With An Intentionally Long Display Name For Responsive Realm QA';
export const RENDERED_WEBGL_QA_LONG_PUBLIC_BIO =
  'A deliberately long synthetic public biography used only to verify that the responsive castle inspector truncates, wraps, and remains usable without leaking real profile data.';
export const RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID =
  'genesis-001-tier1-gold-03';
export const RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID = 900_001;
export const RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID =
  'genesis-001-tier1-gold-11';
export const RENDERED_WEBGL_QA_OVERVIEW_OCCUPANT_CASTLE_ID = 900_002;
export const RENDERED_WEBGL_QA_ACTIVE_WORKER_SITE_ID =
  RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID;
export const RENDERED_WEBGL_QA_FOREIGN_WORKER_SITE_ID =
  RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID;
export const RENDERED_WEBGL_QA_LOCOMOTION_OUTBOUND_SITE_ID =
  'genesis-001-tier1-wood-043';
export const RENDERED_WEBGL_QA_LOCOMOTION_RETURNING_SITE_ID =
  'genesis-001-tier1-food-013';
export const RENDERED_WEBGL_QA_LOCOMOTION_GATHERING_SITE_ID =
  'genesis-001-tier1-gold-15';
export const RENDERED_WEBGL_QA_NORTHERN_LOCOMOTION_SITE_ID =
  'genesis-001-tier1-food-044';
export const RENDERED_WEBGL_QA_SOUTHERN_LOCOMOTION_SITE_ID =
  'genesis-001-tier1-food-023';
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT =
  CANONICAL_TIER_I_GOLD_SITES_V1.length
  + CANONICAL_TIER_I_FOOD_SITES_V1.length
  + CANONICAL_TIER_I_WOOD_SITES_V1.length
  + CANONICAL_TIER_I_STONE_SITES_V1.length;

const RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS = 1_800_000_000_000_000n;
const RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS =
  RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS + 60_000_000n;
const RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS =
  RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS + 2_592_000_000_000n;
const RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS =
  RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS + 60_000_000n;
const RENDERED_WEBGL_QA_WORKER_OBSERVED_AT_MICROS =
  RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS + 300_000_000n;
const RENDERED_WEBGL_QA_WORKER_PENDING_GOLD = 5n;

export type RenderedWebglQaActiveWorkerRealm = RealmObserverHarnessRealm & Readonly<{
  workerProjection: ReadyWorkerProjection;
  workerResourceState: ReadyWorkerResourceState;
  workerRoster: WorkerRosterPresentation;
}>;

function sequence(value: number) {
  return value.toString().padStart(3, '0');
}

function createRenderedWebglQaFixtureSnapshot(): RealmObserverSnapshot {
  if (CANONICAL_CASTLE_SLOTS.length !== RENDERED_WEBGL_QA_CASTLE_COUNT) {
    throw new Error('Rendered WebGL QA fixture requires every canonical castle slot.');
  }

  return parseRealmObserverSnapshot({
    version: 1,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: {
      realmId: CANONICAL_REALM.realmId,
      numericSeed: CANONICAL_REALM.numericSeed,
      generationVersion: CANONICAL_REALM.generationVersion,
      authoritativeRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius,
      playerCapacity: CANONICAL_REALM.playerCapacity
    },
    castles: CANONICAL_CASTLE_SLOTS.map((slot, index) => {
      const ordinal = sequence(index + 1);
      return {
        castleId: 900_000 + index,
        tileKey: slot.tileKey,
        q: slot.q,
        r: slot.r,
        level: 1 + (index % 4),
        name: `Synthetic Keep ${ordinal}`,
        canonicalUsername: `qa-keep-${ordinal}`,
        displayName: RENDERED_WEBGL_QA_LONG_DISPLAY_NAME,
        publicBio: RENDERED_WEBGL_QA_LONG_PUBLIC_BIO,
        // This boolean never carries a profile URL. The observer adapter maps it
        // only to Warpkeep's fixed same-origin Marks placeholder so rendered QA
        // can exercise the native bounded portrait pipeline without real identity
        // data or an external request.
        portraitAvailable: true,
        publicStatus: index % 2 === 0 ? 'founded' : 'active'
      };
    })
  });
}

const RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT = createRenderedWebglQaFixtureSnapshot();

/**
 * A deterministic, 100-castle local-only fixture. It deliberately contains no
 * real FID, external PFP URL, profile URL, wallet, Terms record, auth material,
 * or production snapshot. Portrait availability selects only the fixed local
 * observer placeholder owned by this repository.
 */
export function renderedWebglQaFixtureSnapshot() {
  return RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT;
}

export function createRenderedWebglQaFixtureRealm(): RealmObserverHarnessRealm {
  const baseRealm = createRealmObserverHarnessRealm(
    RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT,
    RENDERED_WEBGL_QA_OWNER_SEED
  );
  const occupiedSite = CANONICAL_TIER_I_GOLD_SITES_V1.find(
    (site) => site.siteId === RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID
  );
  const occupantCastle = baseRealm.snapshot.castles.find(
    (castle) => castle.castleId === RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID
  );
  const overviewSite = CANONICAL_TIER_I_GOLD_SITES_V1.find(
    (site) => site.siteId === RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID
  );
  const overviewOccupantCastle = baseRealm.snapshot.castles.find(
    (castle) => castle.castleId === RENDERED_WEBGL_QA_OVERVIEW_OCCUPANT_CASTLE_ID
  );
  if (!occupiedSite || !occupantCastle || !overviewSite || !overviewOccupantCastle) {
    throw new Error('Rendered WebGL QA occupied resource fixture is incomplete.');
  }

  // The fixture intentionally enriches the already-sanitized local observer
  // realm only after its 100-castle graph has passed validation. The origin is
  // a remote synthetic keep in player mode and remains a public keep in
  // observer mode. No private expedition row, FID, image URL, or command
  // authority is introduced.
  const candidate: WarpkeepRealmSnapshotCandidate = {
    ...baseRealm.snapshot,
    goldSites: CANONICAL_TIER_I_GOLD_SITES_V1.map((site) => ({ ...site })),
    goldNodeOccupations: [
      Object.freeze({
        siteId: occupiedSite.siteId,
        originCastleId: occupantCastle.castleId,
        phase: 'gathering' as const,
        startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
        arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
        gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
        returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS
      }),
      Object.freeze({
        siteId: overviewSite.siteId,
        originCastleId: overviewOccupantCastle.castleId,
        phase: 'gathering' as const,
        startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
        arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
        gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
        returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS
      })
    ],
    foodSites: CANONICAL_TIER_I_FOOD_SITES_V1.map((site) => ({ ...site })),
    foodNodeOccupations: [Object.freeze({
      siteId: 'genesis-001-tier1-food-004',
      originCastleId: 900_003,
      phase: 'gathering' as const,
      startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
      arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
      gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
      returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS
    })],
    woodSites: CANONICAL_TIER_I_WOOD_SITES_V1.map((site) => ({ ...site })),
    woodNodeOccupations: [Object.freeze({
      siteId: 'genesis-001-tier1-wood-033',
      originCastleId: 900_004,
      phase: 'gathering' as const,
      startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
      arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
      gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
      returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS
    })],
    stoneSites: CANONICAL_TIER_I_STONE_SITES_V1.map((site) => ({ ...site })),
    stoneNodeOccupations: [Object.freeze({
      siteId: 'genesis-001-tier1-stone-059',
      originCastleId: 900_002,
      phase: 'gathering' as const,
      startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
      arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
      gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
      returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS
    })]
  };
  const snapshot = validateCanonicalGenesisSnapshot(candidate, {
    ownFid: baseRealm.identity.fid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    allowLocalProfilePlaceholder: true
  });
  return Object.freeze({
    identity: baseRealm.identity,
    snapshot
  });
}

function stressOccupations<T extends Readonly<{ siteId: string }>>(
  sites: readonly T[],
  castles: RealmObserverHarnessRealm['snapshot']['castles'],
  phaseOffset: number
) {
  const phases = ['outbound', 'gathering', 'returning'] as const;
  return Object.freeze(sites.map((site, index) => Object.freeze({
    siteId: site.siteId,
    originCastleId: castles[index % castles.length]!.castleId,
    phase: phases[(index + phaseOffset) % phases.length]!,
    startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS + BigInt(index),
    arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS + BigInt(index),
    gatheringEndsAtMicros:
      RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS + BigInt(index),
    returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS + BigInt(index)
  })));
}

/**
 * Dense local-only rendered-QA fixture. Every canonical resource node is
 * occupied by one of the 100 synthetic public keeps, with at most one legacy
 * occupation of each resource kind per keep. The standalone browser route can
 * select it only through its fixed reviewed loopback query, and it cannot
 * reach a production build.
 */
export function createRenderedWebglQaOccupancyStressRealm(): RealmObserverHarnessRealm {
  const baseRealm = createRealmObserverHarnessRealm(
    RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT,
    RENDERED_WEBGL_QA_OWNER_SEED
  );
  const candidate: WarpkeepRealmSnapshotCandidate = {
    ...baseRealm.snapshot,
    goldSites: CANONICAL_TIER_I_GOLD_SITES_V1.map((site) => ({ ...site })),
    goldNodeOccupations: stressOccupations(
      CANONICAL_TIER_I_GOLD_SITES_V1,
      baseRealm.snapshot.castles,
      0
    ),
    foodSites: CANONICAL_TIER_I_FOOD_SITES_V1.map((site) => ({ ...site })),
    foodNodeOccupations: stressOccupations(
      CANONICAL_TIER_I_FOOD_SITES_V1,
      baseRealm.snapshot.castles,
      1
    ),
    woodSites: CANONICAL_TIER_I_WOOD_SITES_V1.map((site) => ({ ...site })),
    woodNodeOccupations: stressOccupations(
      CANONICAL_TIER_I_WOOD_SITES_V1,
      baseRealm.snapshot.castles,
      2
    ),
    stoneSites: CANONICAL_TIER_I_STONE_SITES_V1.map((site) => ({ ...site })),
    stoneNodeOccupations: stressOccupations(
      CANONICAL_TIER_I_STONE_SITES_V1,
      baseRealm.snapshot.castles,
      0
    )
  };
  const snapshot = validateCanonicalGenesisSnapshot(candidate, {
    ownFid: baseRealm.identity.fid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    allowLocalProfilePlaceholder: true
  });
  return Object.freeze({ identity: baseRealm.identity, snapshot });
}

type ActiveWorkerAssignment = Readonly<{
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  status: Exclude<RealmWorkerPublicPresentation['status'], 'idle'>;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnStartedAtMicros?: bigint;
  returnsAtMicros: bigint;
  returnStartProgressBasisPoints?: number;
  timelineRevision: number;
}>;

const RENDERED_WEBGL_QA_RESOURCE_SITE_BY_KEY = new Map([
  ...CANONICAL_TIER_I_GOLD_SITES_V1.map((site) => [
    `gold:${site.siteId}`,
    site
  ] as const),
  ...CANONICAL_TIER_I_FOOD_SITES_V1.map((site) => [
    `food:${site.siteId}`,
    site
  ] as const),
  ...CANONICAL_TIER_I_WOOD_SITES_V1.map((site) => [
    `wood:${site.siteId}`,
    site
  ] as const),
  ...CANONICAL_TIER_I_STONE_SITES_V1.map((site) => [
    `stone:${site.siteId}`,
    site
  ] as const)
]);

function canonicalRouteStepsForAssignment(
  origin: Readonly<{ q: number; r: number }>,
  assignment: ActiveWorkerAssignment
) {
  const destination = RENDERED_WEBGL_QA_RESOURCE_SITE_BY_KEY.get(
    `${assignment.resourceKind}:${assignment.siteId}`
  );
  const route = destination === undefined
    ? undefined
    : canonicalPassableRoute(origin, destination);
  const routeSteps = route === undefined ? 0 : route.length - 1;
  if (!Number.isSafeInteger(routeSteps) || routeSteps < 1) {
    throw new Error('Rendered WebGL QA Worker route is inconsistent.');
  }
  return routeSteps;
}

function createRenderedWebglQaWorkerRealm(
  assignmentByWorkerId: ReadonlyMap<string, ActiveWorkerAssignment>,
  observedAtMicros: bigint,
  pendingByWorkerId: ReadonlyMap<string, bigint>
): RenderedWebglQaActiveWorkerRealm {
  const baseRealm = createRealmObserverHarnessRealm(
    RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT,
    RENDERED_WEBGL_QA_OWNER_SEED
  );
  const ownCastleId = baseRealm.snapshot.ownCastle.castleId;
  const workers: RealmWorkerPublicPresentation[] = [];
  const occupations: RealmWorkerNodeOccupation[] = [];
  for (const castle of baseRealm.snapshot.castles) {
    for (const ordinal of [1, 2, 3, 4] as const) {
      const workerId = canonicalWorkerId(castle.castleId, ordinal);
      const assignment = assignmentByWorkerId.get(workerId);
      const worker: RealmWorkerPublicPresentation = Object.freeze({
        workerId,
        ordinal,
        originCastleId: castle.castleId,
        originCastleName: castle.name,
        status: assignment?.status ?? 'idle',
        ...(assignment ? {
          resourceKind: assignment.resourceKind,
          siteId: assignment.siteId,
          startedAtMicros: assignment.startedAtMicros,
          arrivesAtMicros: assignment.arrivesAtMicros,
          gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
          ...(assignment.returnStartedAtMicros === undefined
            ? {}
            : { returnStartedAtMicros: assignment.returnStartedAtMicros }),
          returnsAtMicros: assignment.returnsAtMicros,
          routeSteps: canonicalRouteStepsForAssignment(castle, assignment),
          ...(assignment.returnStartProgressBasisPoints === undefined
            ? {}
            : {
                returnStartProgressBasisPoints:
                  assignment.returnStartProgressBasisPoints
              })
        } : {}),
        timelineRevision: assignment?.timelineRevision ?? 0,
        revision: 1n,
        ownedByViewer: castle.castleId === ownCastleId
      });
      workers.push(worker);
      if (assignment?.status === 'outbound' || assignment?.status === 'gathering') {
        occupations.push(Object.freeze({
          nodeKey: `${assignment.resourceKind}:${assignment.siteId}`,
          resourceKind: assignment.resourceKind,
          siteId: assignment.siteId,
          workerId,
          workerOrdinal: ordinal,
          originCastleId: castle.castleId,
          phase: assignment.status,
          startedAtMicros: assignment.startedAtMicros,
          arrivesAtMicros: assignment.arrivesAtMicros,
          gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
          timelineRevision: assignment.timelineRevision
        }));
      }
    }
  }
  const castleIds = baseRealm.snapshot.castles.map((castle) => castle.castleId);
  const workerSystem = Object.freeze({
    realmId: baseRealm.snapshot.realm.realmId,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: 4 as const,
    expectedCastleCount: castleIds.length,
    expectedWorkerCount: workers.length,
    rosterDigest: workerRosterDigestForCastleIds(castleIds),
    mode: 'active' as const,
    legacyDrainRequired: false
  });
  const candidate: WarpkeepRealmSnapshotCandidate = {
    ...baseRealm.snapshot,
    goldSites: CANONICAL_TIER_I_GOLD_SITES_V1.map((site) => ({ ...site })),
    goldNodeOccupations: [],
    foodSites: CANONICAL_TIER_I_FOOD_SITES_V1.map((site) => ({ ...site })),
    foodNodeOccupations: [],
    woodSites: CANONICAL_TIER_I_WOOD_SITES_V1.map((site) => ({ ...site })),
    woodNodeOccupations: [],
    stoneSites: CANONICAL_TIER_I_STONE_SITES_V1.map((site) => ({ ...site })),
    stoneNodeOccupations: [],
    workerSystem,
    workerWorkers: Object.freeze(workers),
    workerOccupations: Object.freeze(occupations)
  };
  const snapshot = validateCanonicalGenesisSnapshot(candidate, {
    ownFid: baseRealm.identity.fid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    allowLocalProfilePlaceholder: true
  });
  const ownedWorkers = workers.filter((worker) => worker.originCastleId === ownCastleId);
  const pending = {
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n
  };
  const workerRoster: WorkerRosterPresentation = Object.freeze({
    castleId: ownCastleId,
    observedAtMicros,
    workers: Object.freeze(ownedWorkers.map((worker) => Object.freeze({
      workerId: worker.workerId,
      ordinal: worker.ordinal,
      status: worker.status,
      ...(worker.resourceKind === undefined ? {} : { resourceKind: worker.resourceKind }),
      ...(worker.siteId === undefined ? {} : { siteId: worker.siteId }),
      accruedAmount: pendingByWorkerId.get(worker.workerId) ?? 0n,
      materializedAmount: 0n,
      availableAmount: pendingByWorkerId.get(worker.workerId) ?? 0n,
      observedAtMicros,
      revision: worker.revision
    })))
  });
  for (const worker of ownedWorkers) {
    if (worker.resourceKind !== undefined) {
      pending[worker.resourceKind] += pendingByWorkerId.get(worker.workerId) ?? 0n;
    }
  }
  const workerResourceState: ReadyWorkerResourceState = Object.freeze({
    status: 'ready',
    fid: BigInt(baseRealm.identity.fid),
    available: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
    pending: Object.freeze(pending),
    observedAtMicros,
    settledThroughMicros: observedAtMicros,
    revision: 1n,
    resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
    workerPolicyVersion: CASTLE_WORKER_POLICY_VERSION,
    workerSystemMode: 'active'
  });
  const workerProjection = resolveReadyWorkerProjection({
    realmId: snapshot.realm.realmId,
    castleIds,
    ownCastleId,
    expectedFid: BigInt(baseRealm.identity.fid),
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    resourceSites: Object.freeze([
      ...CANONICAL_TIER_I_FOOD_SITES_V1.filter((site) => site.active).map((site) => ({
        resourceKind: 'food' as const,
        siteId: site.siteId,
        q: site.q,
        r: site.r
      })),
      ...CANONICAL_TIER_I_WOOD_SITES_V1.filter((site) => site.active).map((site) => ({
        resourceKind: 'wood' as const,
        siteId: site.siteId,
        q: site.q,
        r: site.r
      })),
      ...CANONICAL_TIER_I_STONE_SITES_V1.filter((site) => site.active).map((site) => ({
        resourceKind: 'stone' as const,
        siteId: site.siteId,
        q: site.q,
        r: site.r
      })),
      ...CANONICAL_TIER_I_GOLD_SITES_V1.filter((site) => site.active).map((site) => ({
        resourceKind: 'gold' as const,
        siteId: site.siteId,
        q: site.q,
        r: site.r
      }))
    ]),
    roster: workerRoster,
    resourceState: workerResourceState
  });
  if (!workerProjection) {
    throw new Error('Rendered WebGL QA active Worker fixture is inconsistent.');
  }
  return Object.freeze({
    identity: baseRealm.identity,
    snapshot,
    workerProjection,
    workerResourceState,
    workerRoster
  });
}

/**
 * Complete local-only generic-worker graph used by the rendered browser lane.
 * It contains the four canonical workers for every synthetic keep so the same
 * fail-closed public/private join used by the live UI is exercised. Only the
 * synthetic owner and one synthetic peer are gathering; no reducer, token,
 * subscription, external image, or production identity is introduced.
 */
export function createRenderedWebglQaActiveWorkerRealm(): RenderedWebglQaActiveWorkerRealm {
  const ownCastleId = RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID - 1;
  const foreignCastleId = RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID;
  const assignment = (siteId: string): ActiveWorkerAssignment => Object.freeze({
    resourceKind: 'gold',
    siteId,
    status: 'gathering',
    startedAtMicros: RENDERED_WEBGL_QA_OCCUPATION_STARTED_AT_MICROS,
    arrivesAtMicros: RENDERED_WEBGL_QA_OCCUPATION_ARRIVES_AT_MICROS,
    gatheringEndsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_GATHERING_ENDS_AT_MICROS,
    returnsAtMicros: RENDERED_WEBGL_QA_OCCUPATION_RETURNS_AT_MICROS,
    timelineRevision: 1
  });
  const ownWorkerId = canonicalWorkerId(ownCastleId, 1);
  return createRenderedWebglQaWorkerRealm(
    new Map<string, ActiveWorkerAssignment>([
      [ownWorkerId, assignment(RENDERED_WEBGL_QA_ACTIVE_WORKER_SITE_ID)],
      [
        canonicalWorkerId(foreignCastleId, 1),
        assignment(RENDERED_WEBGL_QA_FOREIGN_WORKER_SITE_ID)
      ]
    ]),
    RENDERED_WEBGL_QA_WORKER_OBSERVED_AT_MICROS,
    new Map([[ownWorkerId, RENDERED_WEBGL_QA_WORKER_PENDING_GOLD]])
  );
}

/**
 * Moving local-only fixture for real-GLB browser evidence. Its schedule is
 * anchored to the page's synthetic creation time, so an owned outbound wagon,
 * owned returning wagon, and owned site-idle wagon remain observable during a
 * bounded local probe. The spatial destinations are the nearest reviewed
 * canonical resource sites around the synthetic owner keep.
 */
export function createRenderedWebglQaWorkerLocomotionRealm(
  nowMicros = BigInt(Date.now()) * 1_000n
): RenderedWebglQaActiveWorkerRealm {
  if (typeof nowMicros !== 'bigint' || nowMicros < 315_000_000n) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion clock.');
  }
  const ownCastleId = RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID - 1;
  const phaseDuration = 120_000_000n;
  const outboundStart = nowMicros - 30_000_000n;
  const returningStart = nowMicros - 75_000_000n;
  const returningAssignmentStart = returningStart - phaseDuration * 2n;
  const gatheringAssignmentStart = nowMicros - phaseDuration - 30_000_000n;
  const assignments = new Map<string, ActiveWorkerAssignment>([
    [
      canonicalWorkerId(ownCastleId, 1),
      Object.freeze({
        resourceKind: 'wood',
        siteId: RENDERED_WEBGL_QA_LOCOMOTION_OUTBOUND_SITE_ID,
        status: 'outbound',
        startedAtMicros: outboundStart,
        arrivesAtMicros: outboundStart + phaseDuration,
        gatheringEndsAtMicros: outboundStart + phaseDuration * 2n,
        returnsAtMicros: outboundStart + phaseDuration * 3n,
        timelineRevision: 1
      })
    ],
    [
      canonicalWorkerId(ownCastleId, 2),
      Object.freeze({
        resourceKind: 'food',
        siteId: RENDERED_WEBGL_QA_LOCOMOTION_RETURNING_SITE_ID,
        status: 'returning',
        startedAtMicros: returningAssignmentStart,
        arrivesAtMicros: returningAssignmentStart + phaseDuration,
        gatheringEndsAtMicros: returningStart,
        returnStartedAtMicros: returningStart,
        returnsAtMicros: returningStart + phaseDuration,
        returnStartProgressBasisPoints: 10_000,
        timelineRevision: 2
      })
    ],
    [
      canonicalWorkerId(ownCastleId, 3),
      Object.freeze({
        resourceKind: 'gold',
        siteId: RENDERED_WEBGL_QA_LOCOMOTION_GATHERING_SITE_ID,
        status: 'gathering',
        startedAtMicros: gatheringAssignmentStart,
        arrivesAtMicros: gatheringAssignmentStart + phaseDuration,
        gatheringEndsAtMicros: gatheringAssignmentStart + phaseDuration * 2n,
        returnsAtMicros: gatheringAssignmentStart + phaseDuration * 3n,
        timelineRevision: 1
      })
    ]
  ]);
  return createRenderedWebglQaWorkerRealm(
    assignments,
    nowMicros,
    new Map()
  );
}

/**
 * Local-only regional route evidence. Two moving owned wagons share one
 * reviewed dry route: the outbound wagon is held in the climate transition
 * while the returning wagon has just left the deep regional field. Timings
 * remain synthetic and never invoke a reducer or production authority.
 */
function createRenderedWebglQaRegionalWorkerLocomotionRealm(
  region: 'Northern' | 'Southern',
  siteId: string,
  expectedRouteSteps: number,
  expectedPeerRouteSteps: number,
  nowMicros: bigint
): RenderedWebglQaActiveWorkerRealm {
  const routeSteps = canonicalRouteStepsForAssignment(
    CANONICAL_CASTLE_SLOTS[0]!,
    {
      resourceKind: 'food',
      siteId,
      status: 'outbound',
      startedAtMicros: 0n,
      arrivesAtMicros: 1n,
      gatheringEndsAtMicros: 2n,
      returnsAtMicros: 3n,
      timelineRevision: 1
    }
  );
  const travelDuration = BigInt(routeSteps) * 60_000_000n;
  if (
    typeof nowMicros !== 'bigint'
    || nowMicros < travelDuration * 3n
    || routeSteps !== expectedRouteSteps
  ) {
    throw new TypeError(
      `Invalid ${region} Worker locomotion clock or route.`
    );
  }

  const ownCastleId = RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID - 1;
  const foreignCastleId = RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID;
  const outboundStart = nowMicros - travelDuration * 6_500n / 10_000n;
  const returningStart = nowMicros - travelDuration * 500n / 10_000n;
  const returningAssignmentStart = returningStart - travelDuration * 2n;
  const foreignRouteSteps = canonicalRouteStepsForAssignment(
    CANONICAL_CASTLE_SLOTS[1]!,
    {
      resourceKind: 'food',
      siteId,
      status: 'returning',
      startedAtMicros: 0n,
      arrivesAtMicros: 1n,
      gatheringEndsAtMicros: 2n,
      returnsAtMicros: 3n,
      timelineRevision: 1
    }
  );
  if (foreignRouteSteps !== expectedPeerRouteSteps) {
    throw new TypeError(`Invalid ${region} peer Worker route.`);
  }
  const foreignTravelDuration = BigInt(foreignRouteSteps) * 60_000_000n;
  const foreignReturningStart =
    nowMicros - foreignTravelDuration * 1_200n / 10_000n;
  const foreignAssignmentStart =
    foreignReturningStart - foreignTravelDuration * 2n;
  const gatheringDuration = 120_000_000n;
  const gatheringAssignmentStart =
    nowMicros - gatheringDuration - 30_000_000n;
  const assignments = new Map<string, ActiveWorkerAssignment>([
    [
      canonicalWorkerId(ownCastleId, 1),
      Object.freeze({
        resourceKind: 'food',
        siteId,
        status: 'outbound',
        startedAtMicros: outboundStart,
        arrivesAtMicros: outboundStart + travelDuration,
        gatheringEndsAtMicros: outboundStart + travelDuration * 2n,
        returnsAtMicros: outboundStart + travelDuration * 3n,
        timelineRevision: 1
      })
    ],
    [
      canonicalWorkerId(ownCastleId, 2),
      Object.freeze({
        resourceKind: 'food',
        siteId,
        status: 'returning',
        startedAtMicros: returningAssignmentStart,
        arrivesAtMicros: returningAssignmentStart + travelDuration,
        gatheringEndsAtMicros: returningStart,
        returnStartedAtMicros: returningStart,
        returnsAtMicros: returningStart + travelDuration,
        returnStartProgressBasisPoints: 10_000,
        timelineRevision: 2
      })
    ],
    [
      canonicalWorkerId(ownCastleId, 3),
      Object.freeze({
        resourceKind: 'gold',
        siteId: RENDERED_WEBGL_QA_LOCOMOTION_GATHERING_SITE_ID,
        status: 'gathering',
        startedAtMicros: gatheringAssignmentStart,
        arrivesAtMicros: gatheringAssignmentStart + gatheringDuration,
        gatheringEndsAtMicros: gatheringAssignmentStart + gatheringDuration * 2n,
        returnsAtMicros: gatheringAssignmentStart + gatheringDuration * 3n,
        timelineRevision: 1
      })
    ],
    [
      canonicalWorkerId(foreignCastleId, 1),
      Object.freeze({
        resourceKind: 'food',
        siteId,
        status: 'returning',
        startedAtMicros: foreignAssignmentStart,
        arrivesAtMicros: foreignAssignmentStart + foreignTravelDuration,
        gatheringEndsAtMicros: foreignReturningStart,
        returnStartedAtMicros: foreignReturningStart,
        returnsAtMicros: foreignReturningStart + foreignTravelDuration,
        returnStartProgressBasisPoints: 10_000,
        timelineRevision: 2
      })
    ]
  ]);
  return createRenderedWebglQaWorkerRealm(assignments, nowMicros, new Map());
}

export function createRenderedWebglQaNorthernWorkerLocomotionRealm(
  nowMicros = BigInt(Date.now()) * 1_000n
): RenderedWebglQaActiveWorkerRealm {
  return createRenderedWebglQaRegionalWorkerLocomotionRealm(
    'Northern',
    RENDERED_WEBGL_QA_NORTHERN_LOCOMOTION_SITE_ID,
    42,
    43,
    nowMicros
  );
}

/**
 * Local-only route evidence for the Sunscoured South. The same real Supply
 * Wagon lifecycle crosses a reviewed 57-step dry route to food-023, holding
 * one owned wagon in the transition and another near the deep southern rim.
 */
export function createRenderedWebglQaSouthernWorkerLocomotionRealm(
  nowMicros = BigInt(Date.now()) * 1_000n
): RenderedWebglQaActiveWorkerRealm {
  return createRenderedWebglQaRegionalWorkerLocomotionRealm(
    'Southern',
    RENDERED_WEBGL_QA_SOUTHERN_LOCOMOTION_SITE_ID,
    57,
    58,
    nowMicros
  );
}

export { RENDERED_WEBGL_QA_FIXTURE_ID };
