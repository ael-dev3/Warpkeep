import type { HexCoord } from '../../game/map/hexCoordinates';
import { isCanonicalRealmFoodSiteCatalog } from './realmResourceSiteCatalogPolicy';

/**
 * Browser-safe projection of the additive public Food catalog. Like Gold,
 * Food availability is derived only after both public tables have arrived and
 * passed this bounded presentation policy; it never grants a gather action.
 */
export type RealmFoodSitePublicRecord = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export const FOOD_NODE_OCCUPATION_PHASES = Object.freeze([
  'outbound',
  'gathering',
  'returning'
] as const);

export type FoodNodeOccupationPhase = typeof FOOD_NODE_OCCUPATION_PHASES[number];

export type RealmFoodNodeOccupationPublicRecord = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: FoodNodeOccupationPhase;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type RealmFoodNodeOriginCastle = Readonly<{
  castleId: number;
  name: string;
  q: number;
  r: number;
}>;

export type RealmFoodNodeAvailability =
  | 'available'
  | FoodNodeOccupationPhase
  | 'unavailable';

export type RealmFoodNodePresentation = Readonly<{
  siteId: string;
  coord: HexCoord;
  tier: number;
  availability: RealmFoodNodeAvailability;
  occupation?: RealmFoodNodeOccupationPublicRecord;
  originCastle?: RealmFoodNodeOriginCastle;
  /** Display-only identity join; it never authorizes a reducer. */
  occupiedByViewer: boolean;
}>;

export type RealmFoodWagonPose = Readonly<{
  siteId: string;
  phase: FoodNodeOccupationPhase;
  progress: number;
  from: HexCoord;
  to: HexCoord;
}>;

const MAX_FOOD_SITE_IDENTIFIER_LENGTH = 96;
/** Alpha 0.3.11 introduces only canonical Tier I Wheat Farms. */
const FOOD_NODE_TIER = 1;
const MAX_PUBLIC_FOOD_SITE_COUNT = 10_000;
const MINUTE_MICROS = 60_000_000n;

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isSafeFoodSiteId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_FOOD_SITE_IDENTIFIER_LENGTH
    && value.trim() === value
    && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
}

export function isFoodNodeOccupationPhase(value: unknown): value is FoodNodeOccupationPhase {
  return typeof value === 'string'
    && FOOD_NODE_OCCUPATION_PHASES.some((phase) => phase === value);
}

export function isRealmFoodSitePublicRecord(
  value: unknown
): value is RealmFoodSitePublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmFoodSitePublicRecord>;
  return isSafeFoodSiteId(row.siteId)
    && isSafeInteger(row.q)
    && isSafeInteger(row.r)
    && isPositiveSafeInteger(row.tier)
    && row.tier === FOOD_NODE_TIER
    && typeof row.active === 'boolean';
}

export function isRealmFoodNodeOccupationPublicRecord(
  value: unknown
): value is RealmFoodNodeOccupationPublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmFoodNodeOccupationPublicRecord>;
  if (
    !isSafeFoodSiteId(row.siteId)
    || !isPositiveSafeInteger(row.originCastleId)
    || !isFoodNodeOccupationPhase(row.phase)
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

function isRealmFoodNodeOriginCastle(
  value: unknown
): value is RealmFoodNodeOriginCastle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const castle = value as Partial<RealmFoodNodeOriginCastle>;
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
 * Food is entirely additive. Any malformed/duplicate/absent Food table
 * produces zero Food presentation. A valid occupation whose public origin
 * castle has not arrived yet stays unavailable rather than looking free.
 * Neither case changes Gold or the core Realm snapshot.
 */
export function resolveRealmFoodNodePresentations(input: Readonly<{
  sites: readonly RealmFoodSitePublicRecord[] | undefined;
  occupations: readonly RealmFoodNodeOccupationPublicRecord[] | undefined;
  castles: readonly RealmFoodNodeOriginCastle[];
  ownCastleId?: number;
  isPlayableCoord?: (coord: HexCoord) => boolean;
}>): readonly RealmFoodNodePresentation[] {
  if (
    input.sites === undefined
    || input.occupations === undefined
    || input.sites.length > MAX_PUBLIC_FOOD_SITE_COUNT
    || !isCanonicalRealmFoodSiteCatalog(input.sites)
  ) return Object.freeze([]);

  const siteIds = new Set<string>();
  const sites: RealmFoodSitePublicRecord[] = [];
  for (const site of input.sites) {
    if (!isRealmFoodSitePublicRecord(site) || siteIds.has(site.siteId)) return Object.freeze([]);
    siteIds.add(site.siteId);
    if (!site.active) continue;
    const coord = frozenCoord(site.q, site.r);
    if (input.isPlayableCoord && !input.isPlayableCoord(coord)) continue;
    sites.push(site);
  }

  const occupationsBySite = new Map<string, RealmFoodNodeOccupationPublicRecord>();
  for (const occupation of input.occupations) {
    if (!isRealmFoodNodeOccupationPublicRecord(occupation) || !siteIds.has(occupation.siteId)) {
      return Object.freeze([]);
    }
    if (occupationsBySite.has(occupation.siteId)) {
      return Object.freeze([]);
    }
    occupationsBySite.set(occupation.siteId, occupation);
  }

  const castlesById = new Map<number, RealmFoodNodeOriginCastle>();
  for (const castle of input.castles) {
    if (!isRealmFoodNodeOriginCastle(castle) || castlesById.has(castle.castleId)) continue;
    castlesById.set(castle.castleId, Object.freeze({ ...castle, name: castle.name }));
  }

  return Object.freeze(sites
    .map((site) => {
      const occupation = occupationsBySite.get(site.siteId);
      const originCastle = occupation
        ? castlesById.get(occupation.originCastleId)
        : undefined;
      const availability: RealmFoodNodeAvailability = occupation === undefined
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
export function resolveRealmFoodWagonPose(
  node: RealmFoodNodePresentation,
  nowMicros: bigint
): RealmFoodWagonPose | undefined {
  if (
    !node.occupation
    || !node.originCastle
    || !isFoodNodeOccupationPhase(node.availability)
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

export function foodNodeAvailabilityLabel(value: RealmFoodNodeAvailability) {
  switch (value) {
    case 'available': return 'AVAILABLE';
    case 'outbound': return 'WAGON EN ROUTE';
    case 'gathering': return 'OCCUPIED · GATHERING';
    case 'returning': return 'WAGON RETURNING';
    default: return 'SITE STATUS UNAVAILABLE';
  }
}

export function foodNodeNextAuthorityTimestamp(
  node: RealmFoodNodePresentation
): bigint | undefined {
  if (!node.occupation) return undefined;
  if (node.availability === 'outbound') return node.occupation.arrivesAtMicros;
  if (node.availability === 'gathering') return node.occupation.gatheringEndsAtMicros;
  if (node.availability === 'returning') return node.occupation.returnsAtMicros;
  return undefined;
}

/** One Food per completed minute is display policy; server settlement wins. */
export function foodNodeCompletedMinutes(
  occupation: RealmFoodNodeOccupationPublicRecord,
  atMicros: bigint
) {
  if (typeof atMicros !== 'bigint' || atMicros <= occupation.arrivesAtMicros) return 0n;
  const capped = atMicros < occupation.gatheringEndsAtMicros
    ? atMicros
    : occupation.gatheringEndsAtMicros;
  return (capped - occupation.arrivesAtMicros) / MINUTE_MICROS;
}
