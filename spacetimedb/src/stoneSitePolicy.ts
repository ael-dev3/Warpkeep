import { CANONICAL_TIER_I_FOOD_SITES_V1 } from './foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from './goldSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from './woodSitePolicy';
import {
  RESOURCE_SITE_CASTLE_CLEARANCE_STEPS,
  RESOURCE_SITE_CORRIDOR_CLEARANCE_STEPS,
  hasCanonicalResourceSiteStaticConflict,
} from './resourceSitePlacementPolicy';
import {
  CANONICAL_WORLD_TILES,
  HEGEMONY_REALM_ID,
  canonicalMetaForKey,
  deriveChannelSeed,
  hexDistance,
} from './world';

/**
 * Immutable Tier-I Stone-site catalog for Genesis 001. The placement is a
 * reviewed server policy, not a browser decoration: every Stone node is
 * explicitly seeded into the public `stone_site_v1` table by an admin-only
 * transition.
 */
export const STONE_SITE_POLICY_VERSION = 'genesis-001-tier1-stone-sites-v2';
export const GENESIS_TIER_I_STONE_SITE_COUNT = 96;
export const GENESIS_TIER_I_STONE_SITE_TIER = 1;
export const STONE_SITE_SELECTION_CHANNEL = 'genesis-v3-tier1-stone-site';
export const STONE_SITE_CASTLE_CLEARANCE_STEPS = RESOURCE_SITE_CASTLE_CLEARANCE_STEPS;
export const STONE_SITE_CORRIDOR_CLEARANCE_STEPS = RESOURCE_SITE_CORRIDOR_CLEARANCE_STEPS;
export const GENESIS_TIER_I_STONE_SITE_DIGEST =
  '4d620da061b7a90d1e8e17e66dfabf8ef5d7907ee525caaa735dd766e1ab388e';
const GENESIS_TIER_I_STONE_EXPECTED_CANDIDATE_COUNT = 169;

export type CanonicalStoneSiteV1 = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

type StoneSiteCandidate = Readonly<{
  key: string;
  q: number;
  r: number;
  rank: number;
}>;

function compareCoordinates(
  left: Pick<StoneSiteCandidate, 'q' | 'r'>,
  right: Pick<StoneSiteCandidate, 'q' | 'r'>,
): number {
  return left.q - right.q || left.r - right.r;
}

function candidateRank(q: number, r: number): number {
  return deriveChannelSeed(0x510e_527f, q, r, STONE_SITE_SELECTION_CHANNEL);
}

const canonicalGoldSiteKeys = new Set(
  CANONICAL_TIER_I_GOLD_SITES_V1.map(site => `${site.q},${site.r}`),
);
const canonicalFoodSiteKeys = new Set(
  CANONICAL_TIER_I_FOOD_SITES_V1.map(site => `${site.q},${site.r}`),
);
const canonicalWoodSiteKeys = new Set(
  CANONICAL_TIER_I_WOOD_SITES_V1.map(site => `${site.q},${site.r}`),
);
/**
 * Tier-I Stone Quarries occupy traversable heath resource tiles. Their
 * exclusions keep camps distinct from Gold and Food sites, heath transforms,
 * permanent keeps, and protected route corridors while retaining a natural
 * stone-gathering identity.
 */
const tierOneCandidates = Object.freeze(
  CANONICAL_WORLD_TILES.flatMap(tile => {
    const meta = canonicalMetaForKey(tile.key);
    if (
      meta === undefined
      || meta.realmId !== HEGEMONY_REALM_ID
      || !meta.passable
      || meta.staticContentKind !== 'resource-capable'
      || meta.terrainKind !== 'heath'
      || canonicalGoldSiteKeys.has(tile.key)
      || canonicalFoodSiteKeys.has(tile.key)
      || canonicalWoodSiteKeys.has(tile.key)
      || hasCanonicalResourceSiteStaticConflict(tile)
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
export const GENESIS_TIER_I_STONE_SITE_CANDIDATE_COUNT = tierOneCandidates.length;

if (GENESIS_TIER_I_STONE_SITE_CANDIDATE_COUNT !== GENESIS_TIER_I_STONE_EXPECTED_CANDIDATE_COUNT) {
  throw new Error('GENESIS_TIER_I_STONE_SITE_CANDIDATE_DRIFT');
}

/**
 * Deterministic farthest-point selection distributes the 96 Tier-I Stone
 * nodes throughout the full 10,000-cell map while retaining a reproducible
 * tie order. Runtime callers can neither change the candidates nor reroll it.
 */
function selectTierOneStoneCandidates(): readonly StoneSiteCandidate[] {
  const selected: StoneSiteCandidate[] = [];
  const remaining = [...tierOneCandidates];

  while (selected.length < GENESIS_TIER_I_STONE_SITE_COUNT) {
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

    if (bestIndex < 0) throw new Error('GENESIS_TIER_I_STONE_SITE_SELECTION_DRIFT');
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return Object.freeze(selected);
}

const selectedTierOneStoneCandidates = selectTierOneStoneCandidates();

export const CANONICAL_TIER_I_STONE_SITES_V1 = Object.freeze(
  selectedTierOneStoneCandidates.map((candidate, index) => Object.freeze({
    siteId: `genesis-001-tier1-stone-${String(index + 1).padStart(3, '0')}`,
    q: candidate.q,
    r: candidate.r,
    tier: GENESIS_TIER_I_STONE_SITE_TIER,
    active: true,
  } satisfies CanonicalStoneSiteV1)),
);

const canonicalStoneSiteById = new Map(
  CANONICAL_TIER_I_STONE_SITES_V1.map(site => [site.siteId, site] as const),
);

export function canonicalStoneSiteV1ForId(siteId: string): CanonicalStoneSiteV1 | undefined {
  return canonicalStoneSiteById.get(siteId);
}

export function matchesCanonicalTierIStoneSiteV1(
  row: CanonicalStoneSiteV1,
): boolean {
  const expected = canonicalStoneSiteV1ForId(row.siteId);
  return expected !== undefined
    && expected.q === row.q
    && expected.r === row.r
    && expected.tier === row.tier
    && expected.active === row.active;
}

/** Stable line-oriented source used by audits to pin the reviewed 96-site digest. */
export function canonicalTierIStoneSiteDigestInput(): string {
  return CANONICAL_TIER_I_STONE_SITES_V1
    .map(site => [
      STONE_SITE_POLICY_VERSION,
      site.siteId,
      site.q,
      site.r,
      site.tier,
      site.active ? 'active' : 'inactive',
    ].join('|'))
    .join('\n');
}
