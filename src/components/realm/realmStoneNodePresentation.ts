import type { HexCoord } from '../../game/map/hexCoordinates';
import { isCanonicalRealmStoneSiteCatalog } from './realmResourceSiteCatalogPolicy';

/**
 * Browser-safe projection of the additive public Stone catalog. As with Gold
 * and Food, availability is derived only after both public tables arrive and
 * pass this bounded presentation policy; it cannot grant a gather action.
 */
export type RealmStoneSitePublicRecord = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export const STONE_NODE_OCCUPATION_PHASES = Object.freeze([
  'outbound',
  'gathering',
  'returning'
] as const);

export type StoneNodeOccupationPhase = typeof STONE_NODE_OCCUPATION_PHASES[number];

export type RealmStoneNodeOccupationPublicRecord = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: StoneNodeOccupationPhase;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type RealmStoneNodeOriginCastle = Readonly<{
  castleId: number;
  name: string;
  q: number;
  r: number;
}>;

export type RealmStoneNodeAvailability =
  | 'available'
  | StoneNodeOccupationPhase
  | 'unavailable';

export type RealmStoneNodePresentation = Readonly<{
  siteId: string;
  coord: HexCoord;
  tier: number;
  availability: RealmStoneNodeAvailability;
  occupation?: RealmStoneNodeOccupationPublicRecord;
  originCastle?: RealmStoneNodeOriginCastle;
  /** Display-only identity join; it never authorizes a reducer. */
  occupiedByViewer: boolean;
}>;

export type RealmStoneWagonPose = Readonly<{
  siteId: string;
  phase: StoneNodeOccupationPhase;
  progress: number;
  from: HexCoord;
  to: HexCoord;
}>;

const MAX_STONE_SITE_IDENTIFIER_LENGTH = 96;
/** Alpha 0.3.11 introduces only canonical Tier-I Stone Quarries. */
const STONE_NODE_TIER = 1;
const MAX_PUBLIC_STONE_SITE_COUNT = 10_000;
const MINUTE_MICROS = 60_000_000n;

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isSafeStoneSiteId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_STONE_SITE_IDENTIFIER_LENGTH
    && value.trim() === value
    && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
}

export function isStoneNodeOccupationPhase(value: unknown): value is StoneNodeOccupationPhase {
  return typeof value === 'string'
    && STONE_NODE_OCCUPATION_PHASES.some((phase) => phase === value);
}

export function isRealmStoneSitePublicRecord(
  value: unknown
): value is RealmStoneSitePublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmStoneSitePublicRecord>;
  return isSafeStoneSiteId(row.siteId)
    && isSafeInteger(row.q)
    && isSafeInteger(row.r)
    && isPositiveSafeInteger(row.tier)
    && row.tier === STONE_NODE_TIER
    && typeof row.active === 'boolean';
}

export function isRealmStoneNodeOccupationPublicRecord(
  value: unknown
): value is RealmStoneNodeOccupationPublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmStoneNodeOccupationPublicRecord>;
  if (
    !isSafeStoneSiteId(row.siteId)
    || !isPositiveSafeInteger(row.originCastleId)
    || !isStoneNodeOccupationPhase(row.phase)
    || typeof row.startedAtMicros !== 'bigint'
    || typeof row.arrivesAtMicros !== 'bigint'
    || typeof row.gatheringEndsAtMicros !== 'bigint'
    || typeof row.returnsAtMicros !== 'bigint'
  ) return false;
  return row.startedAtMicros >= 0n
    && row.arrivesAtMicros > row.startedAtMicros
    && row.gatheringEndsAtMicros > row.arrivesAtMicros
    && row.returnsAtMicros > row.gatheringEndsAtMicros;
}

function isRealmStoneNodeOriginCastle(
  value: unknown
): value is RealmStoneNodeOriginCastle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const castle = value as Partial<RealmStoneNodeOriginCastle>;
  return isPositiveSafeInteger(castle.castleId)
    && typeof castle.name === 'string'
    && castle.name.length > 0
    && isSafeInteger(castle.q)
    && isSafeInteger(castle.r);
}

function frozenCoord(q: number, r: number): HexCoord {
  return Object.freeze({ q, r });
}

/**
 * Stone is fully additive. Any malformed, duplicate, or missing Stone table
 * resolves to zero Stone presentation. An occupation whose public origin has
 * not arrived stays unavailable rather than looking free. Neither outcome
 * changes Gold, Food, or the canonical Realm snapshot.
 */
export function resolveRealmStoneNodePresentations(input: Readonly<{
  sites: readonly RealmStoneSitePublicRecord[] | undefined;
  occupations: readonly RealmStoneNodeOccupationPublicRecord[] | undefined;
  castles: readonly RealmStoneNodeOriginCastle[];
  ownCastleId?: number;
  isPlayableCoord?: (coord: HexCoord) => boolean;
}>): readonly RealmStoneNodePresentation[] {
  if (
    input.sites === undefined
    || input.occupations === undefined
    || input.sites.length > MAX_PUBLIC_STONE_SITE_COUNT
    || !isCanonicalRealmStoneSiteCatalog(input.sites)
  ) return Object.freeze([]);

  const siteIds = new Set<string>();
  const sites: RealmStoneSitePublicRecord[] = [];
  for (const site of input.sites) {
    if (!isRealmStoneSitePublicRecord(site) || siteIds.has(site.siteId)) return Object.freeze([]);
    siteIds.add(site.siteId);
    if (!site.active) continue;
    const coord = frozenCoord(site.q, site.r);
    if (input.isPlayableCoord && !input.isPlayableCoord(coord)) continue;
    sites.push(site);
  }

  const occupationsBySite = new Map<string, RealmStoneNodeOccupationPublicRecord>();
  for (const occupation of input.occupations) {
    if (!isRealmStoneNodeOccupationPublicRecord(occupation) || !siteIds.has(occupation.siteId)) {
      return Object.freeze([]);
    }
    if (occupationsBySite.has(occupation.siteId)) return Object.freeze([]);
    occupationsBySite.set(occupation.siteId, occupation);
  }

  const castlesById = new Map<number, RealmStoneNodeOriginCastle>();
  for (const castle of input.castles) {
    if (!isRealmStoneNodeOriginCastle(castle) || castlesById.has(castle.castleId)) continue;
    castlesById.set(castle.castleId, Object.freeze({ ...castle, name: castle.name }));
  }

  return Object.freeze(sites
    .map((site) => {
      const occupation = occupationsBySite.get(site.siteId);
      const originCastle = occupation
        ? castlesById.get(occupation.originCastleId)
        : undefined;
      const availability: RealmStoneNodeAvailability = occupation === undefined
        ? 'available'
        : originCastle === undefined
          ? 'unavailable'
          : occupation.phase;
      return Object.freeze({
        siteId: site.siteId,
        coord: frozenCoord(site.q, site.r),
        tier: site.tier,
        availability,
        ...(availability === 'outbound' || availability === 'gathering' || availability === 'returning'
          ? { occupation, originCastle }
          : {}),
        occupiedByViewer: occupation !== undefined
          && originCastle !== undefined
          && input.ownCastleId === occupation.originCastleId
      });
    })
    .sort((left, right) => left.siteId.localeCompare(right.siteId)));
}

function clampedProgress(
  nowMicros: bigint,
  startsAtMicros: bigint,
  endsAtMicros: bigint
) {
  if (endsAtMicros <= startsAtMicros) return nowMicros >= endsAtMicros ? 1 : 0;
  if (nowMicros <= startsAtMicros) return 0;
  if (nowMicros >= endsAtMicros) return 1;
  return Number(((nowMicros - startsAtMicros) * 1_000_000n) / (endsAtMicros - startsAtMicros)) / 1_000_000;
}

/** Server phase/timestamps define the wagon; interpolation never writes back. */
export function resolveRealmStoneWagonPose(
  node: RealmStoneNodePresentation,
  nowMicros: bigint
): RealmStoneWagonPose | undefined {
  if (
    !node.occupation
    || !node.originCastle
    || !isStoneNodeOccupationPhase(node.availability)
    || typeof nowMicros !== 'bigint'
    || nowMicros < 0n
  ) return undefined;

  const origin = frozenCoord(node.originCastle.q, node.originCastle.r);
  if (node.availability === 'outbound') {
    return Object.freeze({
      siteId: node.siteId,
      phase: 'outbound',
      progress: clampedProgress(nowMicros, node.occupation.startedAtMicros, node.occupation.arrivesAtMicros),
      from: origin,
      to: node.coord
    });
  }
  if (node.availability === 'gathering') {
    return Object.freeze({
      siteId: node.siteId,
      phase: 'gathering',
      progress: 1,
      from: node.coord,
      to: node.coord
    });
  }
  return Object.freeze({
    siteId: node.siteId,
    phase: 'returning',
    progress: clampedProgress(
      nowMicros,
      node.occupation.gatheringEndsAtMicros,
      node.occupation.returnsAtMicros
    ),
    from: node.coord,
    to: origin
  });
}

export function stoneNodeAvailabilityLabel(value: RealmStoneNodeAvailability) {
  switch (value) {
    case 'available': return 'AVAILABLE';
    case 'outbound': return 'WAGON EN ROUTE';
    case 'gathering': return 'OCCUPIED · GATHERING';
    case 'returning': return 'WAGON RETURNING';
    default: return 'SITE STATUS UNAVAILABLE';
  }
}

export function stoneNodeNextAuthorityTimestamp(
  node: RealmStoneNodePresentation
): bigint | undefined {
  if (!node.occupation) return undefined;
  if (node.availability === 'outbound') return node.occupation.arrivesAtMicros;
  if (node.availability === 'gathering') return node.occupation.gatheringEndsAtMicros;
  if (node.availability === 'returning') return node.occupation.returnsAtMicros;
  return undefined;
}

/** One Stone per completed minute is display policy; server settlement wins. */
export function stoneNodeCompletedMinutes(
  occupation: RealmStoneNodeOccupationPublicRecord,
  atMicros: bigint
) {
  if (typeof atMicros !== 'bigint' || atMicros <= occupation.arrivesAtMicros) return 0n;
  const capped = atMicros < occupation.gatheringEndsAtMicros
    ? atMicros
    : occupation.gatheringEndsAtMicros;
  return (capped - occupation.arrivesAtMicros) / MINUTE_MICROS;
}
