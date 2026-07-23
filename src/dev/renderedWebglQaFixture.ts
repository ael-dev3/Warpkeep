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
import type { WarpkeepRealmSnapshotCandidate } from '../spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../spacetime/warpkeepProtocol';
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
 * Dense source-only rendered-QA fixture. Every canonical resource node is
 * occupied by one of the 100 synthetic public keeps, with at most one legacy
 * occupation of each resource kind per keep. It is never selected by the
 * standalone browser route and cannot reach a production build.
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

export { RENDERED_WEBGL_QA_FIXTURE_ID };
