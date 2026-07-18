import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
} from './forestLayoutPolicy';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from './foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from './goldSitePolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_WORLD_TILES,
  HEGEMONY_REALM_ID,
  canonicalMetaForKey,
  deriveChannelSeed,
  hasCanonicalTravelCorridorClearance,
  hexDistance,
  hexKey,
  neighboringHexes,
} from './world';

/**
 * Immutable Tier-I Wood-site catalog for Genesis 001. The placement is a
 * reviewed server policy, not a browser decoration: every Wood node is
 * explicitly seeded into the public `wood_site_v1` table by an admin-only
 * transition.
 */
export const WOOD_SITE_POLICY_VERSION = 'genesis-001-tier1-wood-sites-v1';
export const GENESIS_TIER_I_WOOD_SITE_COUNT = 96;
export const GENESIS_TIER_I_WOOD_SITE_TIER = 1;
export const WOOD_SITE_SELECTION_CHANNEL = 'genesis-v3-tier1-wood-site';
export const WOOD_SITE_CASTLE_CLEARANCE_STEPS = 2;
export const WOOD_SITE_CORRIDOR_CLEARANCE_STEPS = 1;
export const GENESIS_TIER_I_WOOD_SITE_DIGEST =
  'c1b069db716a32363dc7528d544bf7e5a0c97afa0c8e3df5c712607d18da02c5';
const GENESIS_TIER_I_WOOD_EXPECTED_CANDIDATE_COUNT = 144;

export type CanonicalWoodSiteV1 = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

type WoodSiteCandidate = Readonly<{
  key: string;
  q: number;
  r: number;
  rank: number;
}>;

function compareCoordinates(
  left: Pick<WoodSiteCandidate, 'q' | 'r'>,
  right: Pick<WoodSiteCandidate, 'q' | 'r'>,
): number {
  return left.q - right.q || left.r - right.r;
}

function candidateRank(q: number, r: number): number {
  return deriveChannelSeed(0x510e_527f, q, r, WOOD_SITE_SELECTION_CHANNEL);
}

const canonicalGoldSiteKeys = new Set(
  CANONICAL_TIER_I_GOLD_SITES_V1.map(site => `${site.q},${site.r}`),
);
const canonicalFoodSiteKeys = new Set(
  CANONICAL_TIER_I_FOOD_SITES_V1.map(site => `${site.q},${site.r}`),
);
const canonicalForestClearanceTileKeys = new Set(
  CANONICAL_GENESIS_FOREST_INSTANCES_V1.flatMap(instance => [
    instance.tileKey,
    ...neighboringHexes(instance).map(neighbor => hexKey(neighbor.q, neighbor.r)),
  ]),
);

function isCastleClearance(candidate: Readonly<{ q: number; r: number }>): boolean {
  return CANONICAL_CASTLE_SLOTS.some(slot => (
    hexDistance(candidate, slot) <= WOOD_SITE_CASTLE_CLEARANCE_STEPS
  ));
}

/**
 * Tier-I Logging Camps occupy traversable forest resource tiles. Their
 * exclusions keep camps distinct from Gold and Food sites, forest transforms,
 * permanent keeps, and protected route corridors while retaining a natural
 * wood-gathering identity.
 */
const tierOneCandidates = Object.freeze(
  CANONICAL_WORLD_TILES.flatMap(tile => {
    const meta = canonicalMetaForKey(tile.key);
    if (
      meta === undefined
      || meta.realmId !== HEGEMONY_REALM_ID
      || !meta.passable
      || meta.staticContentKind !== 'resource-capable'
      || meta.terrainKind !== 'forest'
      || canonicalGoldSiteKeys.has(tile.key)
      || canonicalFoodSiteKeys.has(tile.key)
      || canonicalForestClearanceTileKeys.has(tile.key)
      || isCastleClearance(tile)
      || hasCanonicalTravelCorridorClearance(tile, WOOD_SITE_CORRIDOR_CLEARANCE_STEPS)
    ) return [];
    return [Object.freeze({
      key: tile.key,
      q: tile.q,
      r: tile.r,
      rank: candidateRank(tile.q, tile.r),
    })];
  }).sort((left, right) => (
    left.rank - right.rank || compareCoordinates(left, right)
  )),
);

/** Auditable count after every immutable terrain/clearance exclusion. */
export const GENESIS_TIER_I_WOOD_SITE_CANDIDATE_COUNT = tierOneCandidates.length;

if (GENESIS_TIER_I_WOOD_SITE_CANDIDATE_COUNT !== GENESIS_TIER_I_WOOD_EXPECTED_CANDIDATE_COUNT) {
  throw new Error('GENESIS_TIER_I_WOOD_SITE_CANDIDATE_DRIFT');
}

/**
 * Deterministic farthest-point selection distributes the 96 Tier-I Wood
 * nodes throughout the full 10,000-cell map while retaining a reproducible
 * tie order. Runtime callers can neither change the candidates nor reroll it.
 */
function selectTierOneWoodCandidates(): readonly WoodSiteCandidate[] {
  const selected: WoodSiteCandidate[] = [];
  const remaining = [...tierOneCandidates];

  while (selected.length < GENESIS_TIER_I_WOOD_SITE_COUNT) {
    let bestIndex = -1;
    let bestMinimumDistance = -1;
    let bestRank = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const minimumDistance = selected.length === 0
        ? 0
        : Math.min(...selected.map(existing => hexDistance(candidate, existing)));
      if (
        minimumDistance > bestMinimumDistance
        || (minimumDistance === bestMinimumDistance && candidate.rank < bestRank)
        || (
          minimumDistance === bestMinimumDistance
          && candidate.rank === bestRank
          && bestIndex >= 0
          && compareCoordinates(candidate, remaining[bestIndex]!) < 0
        )
      ) {
        bestIndex = index;
        bestMinimumDistance = minimumDistance;
        bestRank = candidate.rank;
      }
    }

    if (bestIndex < 0) throw new Error('GENESIS_TIER_I_WOOD_SITE_SELECTION_DRIFT');
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return Object.freeze(selected);
}

const selectedTierOneWoodCandidates = selectTierOneWoodCandidates();

export const CANONICAL_TIER_I_WOOD_SITES_V1 = Object.freeze(
  selectedTierOneWoodCandidates.map((candidate, index) => Object.freeze({
    siteId: `genesis-001-tier1-wood-${String(index + 1).padStart(3, '0')}`,
    q: candidate.q,
    r: candidate.r,
    tier: GENESIS_TIER_I_WOOD_SITE_TIER,
    active: true,
  } satisfies CanonicalWoodSiteV1)),
);

const canonicalWoodSiteById = new Map(
  CANONICAL_TIER_I_WOOD_SITES_V1.map(site => [site.siteId, site] as const),
);

export function canonicalWoodSiteV1ForId(siteId: string): CanonicalWoodSiteV1 | undefined {
  return canonicalWoodSiteById.get(siteId);
}

export function matchesCanonicalTierIWoodSiteV1(
  row: CanonicalWoodSiteV1,
): boolean {
  const expected = canonicalWoodSiteV1ForId(row.siteId);
  return expected !== undefined
    && expected.q === row.q
    && expected.r === row.r
    && expected.tier === row.tier
    && expected.active === row.active;
}

/** Stable line-oriented source used by audits to pin the reviewed 96-site digest. */
export function canonicalTierIWoodSiteDigestInput(): string {
  return CANONICAL_TIER_I_WOOD_SITES_V1
    .map(site => [
      WOOD_SITE_POLICY_VERSION,
      site.siteId,
      site.q,
      site.r,
      site.tier,
      site.active ? 'active' : 'inactive',
    ].join('|'))
    .join('\n');
}
