import {
  CANONICAL_WORLD_TILES,
  GENESIS_RESOURCE_SITE_COUNT,
  HEGEMONY_REALM_ID,
  HEGEMONY_WORLD_GENERATION_VERSION,
  canonicalMetaForKey,
  deriveChannelSeed,
  hexDistance,
  hexKey,
  neighboringHexes,
} from './world';

/**
 * Immutable Tier-I Gold-site catalog for the Genesis 001 pilot. This is not a
 * procedural browser decoration: the same exact records are seeded into the
 * public `gold_site_v1` table by an explicit admin-only transition.
 */
export const GOLD_SITE_POLICY_VERSION = 'genesis-001-tier1-gold-sites-v1';
export const GENESIS_TIER_I_GOLD_SITE_COUNT = 24;
export const GENESIS_TIER_I_GOLD_SITE_TIER = 1;
export const GOLD_SITE_SELECTION_CHANNEL = 'genesis-v3-tier1-gold-site';
export const GENESIS_TIER_I_GOLD_SITE_DIGEST =
  '3765ebbacc5cd648fb80ed5182dab319b130e126e52c464d95b5714c13ea7d47';

export type CanonicalGoldSiteV1 = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

type GoldSiteCandidate = Readonly<{
  key: string;
  q: number;
  r: number;
  rank: number;
}>;

function compareCoordinates(
  left: Pick<GoldSiteCandidate, 'q' | 'r'>,
  right: Pick<GoldSiteCandidate, 'q' | 'r'>,
): number {
  return left.q - right.q || left.r - right.r;
}

function candidateRank(q: number, r: number): number {
  return deriveChannelSeed(0x9e37_79b9, q, r, GOLD_SITE_SELECTION_CHANNEL);
}

/**
 * The source candidate pool is deliberately bounded to the already canonical
 * resource-capable layer. No new world coordinates, expansion tiles, or
 * browser-owned placement rules can enter through this selection.
 */
const tierOneCandidates = Object.freeze(
  CANONICAL_WORLD_TILES.flatMap(tile => {
    const meta = canonicalMetaForKey(tile.key);
    if (
      meta === undefined
      || meta.realmId !== HEGEMONY_REALM_ID
      || meta.generationVersion !== HEGEMONY_WORLD_GENERATION_VERSION
      || !meta.passable
      || meta.staticContentKind !== 'resource-capable'
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

if (tierOneCandidates.length !== GENESIS_RESOURCE_SITE_COUNT) {
  throw new Error('GENESIS_TIER_I_GOLD_SITE_CANDIDATE_DRIFT');
}

/**
 * Farthest-point selection avoids a pilot concentrated in one district while
 * preserving a total order for every tie. It performs no random or runtime
 * selection, making the placement independently reviewable and reproducible.
 */
function selectTierOneGoldCandidates(): readonly GoldSiteCandidate[] {
  const selected: GoldSiteCandidate[] = [];
  const remaining = [...tierOneCandidates];

  while (selected.length < GENESIS_TIER_I_GOLD_SITE_COUNT) {
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

    if (bestIndex < 0) throw new Error('GENESIS_TIER_I_GOLD_SITE_SELECTION_DRIFT');
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return Object.freeze(selected);
}

const selectedTierOneGoldCandidates = selectTierOneGoldCandidates();

export const CANONICAL_TIER_I_GOLD_SITES_V1 = Object.freeze(
  selectedTierOneGoldCandidates.map((candidate, index) => Object.freeze({
    siteId: `genesis-001-tier1-gold-${String(index + 1).padStart(2, '0')}`,
    q: candidate.q,
    r: candidate.r,
    tier: GENESIS_TIER_I_GOLD_SITE_TIER,
    active: true,
  } satisfies CanonicalGoldSiteV1)),
);

const canonicalGoldSiteById = new Map(
  CANONICAL_TIER_I_GOLD_SITES_V1.map(site => [site.siteId, site] as const),
);

export function canonicalGoldSiteV1ForId(siteId: string): CanonicalGoldSiteV1 | undefined {
  return canonicalGoldSiteById.get(siteId);
}

export function matchesCanonicalTierIGoldSiteV1(
  row: CanonicalGoldSiteV1,
): boolean {
  const expected = canonicalGoldSiteV1ForId(row.siteId);
  return expected !== undefined
    && expected.q === row.q
    && expected.r === row.r
    && expected.tier === row.tier
    && expected.active === row.active;
}

/** Stable line-oriented source used by audits to pin the reviewed 24-site digest. */
export function canonicalTierIGoldSiteDigestInput(): string {
  return CANONICAL_TIER_I_GOLD_SITES_V1
    .map(site => [
      GOLD_SITE_POLICY_VERSION,
      site.siteId,
      site.q,
      site.r,
      site.tier,
      site.active ? 'active' : 'inactive',
    ].join('|'))
    .join('\n');
}

/**
 * Exact shortest path length through the already-canonical passable graph.
 * The visual client may interpolate a wagon independently, but it must use
 * the server-owned timestamps produced from this route length.
 */
export function canonicalPassableRouteSteps(
  origin: Readonly<{ q: number; r: number }>,
  destination: Readonly<{ q: number; r: number }>,
): number | undefined {
  const originKey = hexKey(origin.q, origin.r);
  const destinationKey = hexKey(destination.q, destination.r);
  const originMeta = canonicalMetaForKey(originKey);
  const destinationMeta = canonicalMetaForKey(destinationKey);
  if (!originMeta?.passable || !destinationMeta?.passable) return undefined;
  if (originKey === destinationKey) return 0;

  const visited = new Set<string>([originKey]);
  const queue: Array<Readonly<{ q: number; r: number; steps: number }>> = [
    Object.freeze({ q: origin.q, r: origin.r, steps: 0 }),
  ];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of neighboringHexes(current)) {
      const key = hexKey(neighbor.q, neighbor.r);
      if (visited.has(key) || !canonicalMetaForKey(key)?.passable) continue;
      const steps = current.steps + 1;
      if (key === destinationKey) return steps;
      visited.add(key);
      queue.push(Object.freeze({ q: neighbor.q, r: neighbor.r, steps }));
    }
  }
  return undefined;
}
