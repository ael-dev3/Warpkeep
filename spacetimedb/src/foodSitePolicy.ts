import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
} from './forestLayoutPolicy';
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
 * Immutable Tier-I Food-site catalog for Genesis 001. The placement is a
 * reviewed server policy, not a browser decoration: every Food node is
 * explicitly seeded into the public `food_site_v1` table by an admin-only
 * transition.
 */
export const FOOD_SITE_POLICY_VERSION = 'genesis-001-tier1-food-sites-v1';
export const GENESIS_TIER_I_FOOD_SITE_COUNT = 96;
export const GENESIS_TIER_I_FOOD_SITE_TIER = 1;
export const FOOD_SITE_SELECTION_CHANNEL = 'genesis-v3-tier1-food-site';
export const FOOD_SITE_CASTLE_CLEARANCE_STEPS = 2;
export const FOOD_SITE_CORRIDOR_CLEARANCE_STEPS = 1;
export const GENESIS_TIER_I_FOOD_SITE_DIGEST =
  '25d451ea4c8d94e0ff439d3a79873df47b4fd1cbeba887358017cfa8fb304bb7';

export type CanonicalFoodSiteV1 = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

type FoodSiteCandidate = Readonly<{
  key: string;
  q: number;
  r: number;
  rank: number;
}>;

function compareCoordinates(
  left: Pick<FoodSiteCandidate, 'q' | 'r'>,
  right: Pick<FoodSiteCandidate, 'q' | 'r'>,
): number {
  return left.q - right.q || left.r - right.r;
}

function candidateRank(q: number, r: number): number {
  return deriveChannelSeed(0x6a09_e667, q, r, FOOD_SITE_SELECTION_CHANNEL);
}

const canonicalGoldSiteKeys = new Set(
  CANONICAL_TIER_I_GOLD_SITES_V1.map(site => `${site.q},${site.r}`),
);
const canonicalForestClearanceTileKeys = new Set(
  CANONICAL_GENESIS_FOREST_INSTANCES_V1.flatMap(instance => [
    instance.tileKey,
    ...neighboringHexes(instance).map(neighbor => hexKey(neighbor.q, neighbor.r)),
  ]),
);

function isCastleClearance(candidate: Readonly<{ q: number; r: number }>): boolean {
  return CANONICAL_CASTLE_SLOTS.some(slot => (
    hexDistance(candidate, slot) <= FOOD_SITE_CASTLE_CLEARANCE_STEPS
  ));
}

/**
 * Tier-I wheat farms only inhabit luminous, traversable lowland/meadow
 * resource tiles. The exclusions keep them distinct from the Gold pilot,
 * forest transforms, permanent keeps, and protected route corridors.
 */
const tierOneCandidates = Object.freeze(
  CANONICAL_WORLD_TILES.flatMap(tile => {
    const meta = canonicalMetaForKey(tile.key);
    if (
      meta === undefined
      || meta.realmId !== HEGEMONY_REALM_ID
      || !meta.passable
      || meta.staticContentKind !== 'resource-capable'
      || (meta.terrainKind !== 'lowland' && meta.terrainKind !== 'meadow')
      || canonicalGoldSiteKeys.has(tile.key)
      || canonicalForestClearanceTileKeys.has(tile.key)
      || isCastleClearance(tile)
      || hasCanonicalTravelCorridorClearance(tile, FOOD_SITE_CORRIDOR_CLEARANCE_STEPS)
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
export const GENESIS_TIER_I_FOOD_SITE_CANDIDATE_COUNT = tierOneCandidates.length;

if (GENESIS_TIER_I_FOOD_SITE_CANDIDATE_COUNT < GENESIS_TIER_I_FOOD_SITE_COUNT) {
  throw new Error('GENESIS_TIER_I_FOOD_SITE_CANDIDATE_CAPACITY');
}

/**
 * Deterministic farthest-point selection distributes the 96 Tier-I Food
 * nodes throughout the full 10,000-cell map while retaining a reproducible
 * tie order. Runtime callers can neither change the candidates nor reroll it.
 */
function selectTierOneFoodCandidates(): readonly FoodSiteCandidate[] {
  const selected: FoodSiteCandidate[] = [];
  const remaining = [...tierOneCandidates];

  while (selected.length < GENESIS_TIER_I_FOOD_SITE_COUNT) {
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

    if (bestIndex < 0) throw new Error('GENESIS_TIER_I_FOOD_SITE_SELECTION_DRIFT');
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return Object.freeze(selected);
}

const selectedTierOneFoodCandidates = selectTierOneFoodCandidates();

export const CANONICAL_TIER_I_FOOD_SITES_V1 = Object.freeze(
  selectedTierOneFoodCandidates.map((candidate, index) => Object.freeze({
    siteId: `genesis-001-tier1-food-${String(index + 1).padStart(3, '0')}`,
    q: candidate.q,
    r: candidate.r,
    tier: GENESIS_TIER_I_FOOD_SITE_TIER,
    active: true,
  } satisfies CanonicalFoodSiteV1)),
);

const canonicalFoodSiteById = new Map(
  CANONICAL_TIER_I_FOOD_SITES_V1.map(site => [site.siteId, site] as const),
);

export function canonicalFoodSiteV1ForId(siteId: string): CanonicalFoodSiteV1 | undefined {
  return canonicalFoodSiteById.get(siteId);
}

export function matchesCanonicalTierIFoodSiteV1(
  row: CanonicalFoodSiteV1,
): boolean {
  const expected = canonicalFoodSiteV1ForId(row.siteId);
  return expected !== undefined
    && expected.q === row.q
    && expected.r === row.r
    && expected.tier === row.tier
    && expected.active === row.active;
}

/** Stable line-oriented source used by audits to pin the reviewed 96-site digest. */
export function canonicalTierIFoodSiteDigestInput(): string {
  return CANONICAL_TIER_I_FOOD_SITES_V1
    .map(site => [
      FOOD_SITE_POLICY_VERSION,
      site.siteId,
      site.q,
      site.r,
      site.tier,
      site.active ? 'active' : 'inactive',
    ].join('|'))
    .join('\n');
}
