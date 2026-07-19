import type { HexCoord } from '../../game/map/hexCoordinates';
import { isCanonicalRealmGoldSiteCatalog } from './realmResourceSiteCatalogPolicy';

/**
 * The browser-facing shape of the two public v5 Gold tables. These values are
 * produced by the authenticated SpacetimeDB subscription boundary; this file
 * only derives presentation from them and never treats the browser as a
 * source of node, occupation, route, or economic authority.
 */
export type RealmGoldSitePublicRecord = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export const GOLD_NODE_OCCUPATION_PHASES = Object.freeze([
  'outbound',
  'gathering',
  'returning'
] as const);

export type GoldNodeOccupationPhase = typeof GOLD_NODE_OCCUPATION_PHASES[number];

export type RealmGoldNodeOccupationPublicRecord = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: GoldNodeOccupationPhase;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type RealmGoldNodeOriginCastle = Readonly<{
  castleId: number;
  name: string;
  q: number;
  r: number;
}>;

export type RealmGoldNodeAvailability =
  | 'available'
  | GoldNodeOccupationPhase
  | 'unavailable';

export type RealmGoldNodePresentation = Readonly<{
  siteId: string;
  coord: HexCoord;
  tier: number;
  availability: RealmGoldNodeAvailability;
  /** An occupation is shown only after its public origin castle is resolved. */
  occupation?: RealmGoldNodeOccupationPublicRecord;
  originCastle?: RealmGoldNodeOriginCastle;
  /** This is display context only; it does not authorize a player action. */
  occupiedByViewer: boolean;
}>;

export type RealmGoldWagonPose = Readonly<{
  siteId: string;
  phase: GoldNodeOccupationPhase;
  /** A local visual interpolation only; the public phase remains authoritative. */
  progress: number;
  from: HexCoord;
  to: HexCoord;
}>;

const MAX_GOLD_SITE_IDENTIFIER_LENGTH = 96;
const MAX_GOLD_SITE_TIER = 100;
const MAX_PUBLIC_GOLD_SITE_COUNT = 10_000;
const MINUTE_MICROS = 60_000_000n;

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isSafeGoldSiteId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_GOLD_SITE_IDENTIFIER_LENGTH
    && value.trim() === value
    && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
}

export function isGoldNodeOccupationPhase(value: unknown): value is GoldNodeOccupationPhase {
  return typeof value === 'string'
    && GOLD_NODE_OCCUPATION_PHASES.some((phase) => phase === value);
}

export function isRealmGoldSitePublicRecord(
  value: unknown
): value is RealmGoldSitePublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmGoldSitePublicRecord>;
  return isSafeGoldSiteId(row.siteId)
    && isSafeInteger(row.q)
    && isSafeInteger(row.r)
    && isPositiveSafeInteger(row.tier)
    && row.tier <= MAX_GOLD_SITE_TIER
    && typeof row.active === 'boolean';
}

export function isRealmGoldNodeOccupationPublicRecord(
  value: unknown
): value is RealmGoldNodeOccupationPublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmGoldNodeOccupationPublicRecord>;
  if (
    !isSafeGoldSiteId(row.siteId)
    || !isPositiveSafeInteger(row.originCastleId)
    || !isGoldNodeOccupationPhase(row.phase)
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

function isRealmGoldNodeOriginCastle(
  value: unknown
): value is RealmGoldNodeOriginCastle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const castle = value as Partial<RealmGoldNodeOriginCastle>;
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
 * Creates a bounded, immutable UI projection. Any duplicate or malformed
 * public row is treated as unavailable rather than as a free node. The server
 * snapshot validator remains the authority that decides whether a subscription
 * is accepted at all; this is a second, presentation-only containment layer.
 */
export function resolveRealmGoldNodePresentations(input: Readonly<{
  sites: readonly RealmGoldSitePublicRecord[] | undefined;
  occupations: readonly RealmGoldNodeOccupationPublicRecord[] | undefined;
  castles: readonly RealmGoldNodeOriginCastle[];
  ownCastleId?: number;
  isPlayableCoord?: (coord: HexCoord) => boolean;
}>): readonly RealmGoldNodePresentation[] {
  if (
    input.sites === undefined
    || input.occupations === undefined
    || input.sites.length > MAX_PUBLIC_GOLD_SITE_COUNT
    || !isCanonicalRealmGoldSiteCatalog(input.sites)
  ) return Object.freeze([]);

  const siteIds = new Set<string>();
  const sites: RealmGoldSitePublicRecord[] = [];
  for (const site of input.sites) {
    if (!isRealmGoldSitePublicRecord(site) || siteIds.has(site.siteId)) return Object.freeze([]);
    siteIds.add(site.siteId);
    if (!site.active) continue;
    const coord = frozenCoord(site.q, site.r);
    if (input.isPlayableCoord && !input.isPlayableCoord(coord)) continue;
    sites.push(site);
  }

  const occupationsBySite = new Map<string, RealmGoldNodeOccupationPublicRecord>();
  const malformedOccupationSiteIds = new Set<string>();
  for (const occupation of input.occupations) {
    if (!isRealmGoldNodeOccupationPublicRecord(occupation) || !siteIds.has(occupation.siteId)) {
      // A malformed/unknown row has no safe UI interpretation. It may not
      // turn a site into an apparently available one.
      if (isSafeGoldSiteId((occupation as Partial<RealmGoldNodeOccupationPublicRecord>)?.siteId)) {
        malformedOccupationSiteIds.add(occupation.siteId);
      }
      continue;
    }
    if (occupationsBySite.has(occupation.siteId)) {
      malformedOccupationSiteIds.add(occupation.siteId);
      occupationsBySite.delete(occupation.siteId);
      continue;
    }
    occupationsBySite.set(occupation.siteId, occupation);
  }

  const castlesById = new Map<number, RealmGoldNodeOriginCastle>();
  for (const castle of input.castles) {
    if (!isRealmGoldNodeOriginCastle(castle) || castlesById.has(castle.castleId)) continue;
    castlesById.set(castle.castleId, Object.freeze({ ...castle, name: castle.name }));
  }

  return Object.freeze(sites
    .map((site) => {
      const occupation = occupationsBySite.get(site.siteId);
      const originCastle = occupation
        ? castlesById.get(occupation.originCastleId)
        : undefined;
      const availability: RealmGoldNodeAvailability = malformedOccupationSiteIds.has(site.siteId)
        ? 'unavailable'
        : occupation === undefined
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
  const numerator = nowMicros - startsAtMicros;
  const denominator = endsAtMicros - startsAtMicros;
  // Keep the calculation bounded before crossing from bigint to number.
  return Number((numerator * 1_000_000n) / denominator) / 1_000_000;
}

/**
 * Derives a one-frame wagon pose from server timestamps. It never changes the
 * authoritative phase, settles Gold, or writes a position back to the world.
 */
export function resolveRealmGoldWagonPose(
  node: RealmGoldNodePresentation,
  nowMicros: bigint
): RealmGoldWagonPose | undefined {
  if (
    !node.occupation
    || !node.originCastle
    || !isGoldNodeOccupationPhase(node.availability)
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

export function goldNodeAvailabilityLabel(value: RealmGoldNodeAvailability) {
  switch (value) {
    case 'available': return 'AVAILABLE';
    case 'outbound': return 'WAGON EN ROUTE';
    case 'gathering': return 'OCCUPIED · GATHERING';
    case 'returning': return 'WAGON RETURNING';
    default: return 'SITE STATUS UNAVAILABLE';
  }
}

export function goldNodeNextAuthorityTimestamp(
  node: RealmGoldNodePresentation
): bigint | undefined {
  if (!node.occupation) return undefined;
  if (node.availability === 'outbound') return node.occupation.arrivesAtMicros;
  if (node.availability === 'gathering') return node.occupation.gatheringEndsAtMicros;
  if (node.availability === 'returning') return node.occupation.returnsAtMicros;
  return undefined;
}

/** One Gold per completed minute is display policy; settlement stays server-side. */
export function goldNodeCompletedMinutes(
  occupation: RealmGoldNodeOccupationPublicRecord,
  atMicros: bigint
) {
  if (typeof atMicros !== 'bigint' || atMicros <= occupation.arrivesAtMicros) return 0n;
  const capped = atMicros < occupation.gatheringEndsAtMicros
    ? atMicros
    : occupation.gatheringEndsAtMicros;
  return (capped - occupation.arrivesAtMicros) / MINUTE_MICROS;
}
