import type { HexCoord } from '../../game/map/hexCoordinates';
import { isCanonicalRealmWoodSiteCatalog } from './realmResourceSiteCatalogPolicy';

/**
 * Browser-safe projection of the additive public Wood catalog. As with Gold
 * and Food, availability is derived only after both public tables arrive and
 * pass this bounded presentation policy; it cannot grant a gather action.
 */
export type RealmWoodSitePublicRecord = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export const WOOD_NODE_OCCUPATION_PHASES = Object.freeze([
  'outbound',
  'gathering',
  'returning'
] as const);

export type WoodNodeOccupationPhase = typeof WOOD_NODE_OCCUPATION_PHASES[number];

export type RealmWoodNodeOccupationPublicRecord = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: WoodNodeOccupationPhase;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type RealmWoodNodeOriginCastle = Readonly<{
  castleId: number;
  name: string;
  q: number;
  r: number;
}>;

export type RealmWoodNodeAvailability =
  | 'available'
  | WoodNodeOccupationPhase
  | 'unavailable';

export type RealmWoodNodePresentation = Readonly<{
  siteId: string;
  coord: HexCoord;
  tier: number;
  availability: RealmWoodNodeAvailability;
  occupation?: RealmWoodNodeOccupationPublicRecord;
  originCastle?: RealmWoodNodeOriginCastle;
  /** Display-only identity join; it never authorizes a reducer. */
  occupiedByViewer: boolean;
}>;

export type RealmWoodWagonPose = Readonly<{
  siteId: string;
  phase: WoodNodeOccupationPhase;
  progress: number;
  from: HexCoord;
  to: HexCoord;
}>;

const MAX_WOOD_SITE_IDENTIFIER_LENGTH = 96;
/** Alpha 0.3.11 introduces only canonical Tier-I Logging Camps. */
const WOOD_NODE_TIER = 1;
const MAX_PUBLIC_WOOD_SITE_COUNT = 10_000;
const MINUTE_MICROS = 60_000_000n;

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isSafeWoodSiteId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_WOOD_SITE_IDENTIFIER_LENGTH
    && value.trim() === value
    && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
}

export function isWoodNodeOccupationPhase(value: unknown): value is WoodNodeOccupationPhase {
  return typeof value === 'string'
    && WOOD_NODE_OCCUPATION_PHASES.some((phase) => phase === value);
}

export function isRealmWoodSitePublicRecord(
  value: unknown
): value is RealmWoodSitePublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmWoodSitePublicRecord>;
  return isSafeWoodSiteId(row.siteId)
    && isSafeInteger(row.q)
    && isSafeInteger(row.r)
    && isPositiveSafeInteger(row.tier)
    && row.tier === WOOD_NODE_TIER
    && typeof row.active === 'boolean';
}

export function isRealmWoodNodeOccupationPublicRecord(
  value: unknown
): value is RealmWoodNodeOccupationPublicRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<RealmWoodNodeOccupationPublicRecord>;
  if (
    !isSafeWoodSiteId(row.siteId)
    || !isPositiveSafeInteger(row.originCastleId)
    || !isWoodNodeOccupationPhase(row.phase)
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

function isRealmWoodNodeOriginCastle(
  value: unknown
): value is RealmWoodNodeOriginCastle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const castle = value as Partial<RealmWoodNodeOriginCastle>;
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
 * Wood is fully additive. Any malformed, duplicate, or missing Wood table
 * resolves to zero Wood presentation. An occupation whose public origin has
 * not arrived stays unavailable rather than looking free. Neither outcome
 * changes Gold, Food, or the canonical Realm snapshot.
 */
export function resolveRealmWoodNodePresentations(input: Readonly<{
  sites: readonly RealmWoodSitePublicRecord[] | undefined;
  occupations: readonly RealmWoodNodeOccupationPublicRecord[] | undefined;
  castles: readonly RealmWoodNodeOriginCastle[];
  ownCastleId?: number;
  isPlayableCoord?: (coord: HexCoord) => boolean;
}>): readonly RealmWoodNodePresentation[] {
  if (
    input.sites === undefined
    || input.occupations === undefined
    || input.sites.length > MAX_PUBLIC_WOOD_SITE_COUNT
    || !isCanonicalRealmWoodSiteCatalog(input.sites)
  ) return Object.freeze([]);

  const siteIds = new Set<string>();
  const sites: RealmWoodSitePublicRecord[] = [];
  for (const site of input.sites) {
    if (!isRealmWoodSitePublicRecord(site) || siteIds.has(site.siteId)) return Object.freeze([]);
    siteIds.add(site.siteId);
    if (!site.active) continue;
    const coord = frozenCoord(site.q, site.r);
    if (input.isPlayableCoord && !input.isPlayableCoord(coord)) continue;
    sites.push(site);
  }

  const occupationsBySite = new Map<string, RealmWoodNodeOccupationPublicRecord>();
  for (const occupation of input.occupations) {
    if (!isRealmWoodNodeOccupationPublicRecord(occupation) || !siteIds.has(occupation.siteId)) {
      return Object.freeze([]);
    }
    if (occupationsBySite.has(occupation.siteId)) return Object.freeze([]);
    occupationsBySite.set(occupation.siteId, occupation);
  }

  const castlesById = new Map<number, RealmWoodNodeOriginCastle>();
  for (const castle of input.castles) {
    if (!isRealmWoodNodeOriginCastle(castle) || castlesById.has(castle.castleId)) continue;
    castlesById.set(castle.castleId, Object.freeze({ ...castle, name: castle.name }));
  }

  return Object.freeze(sites
    .map((site) => {
      const occupation = occupationsBySite.get(site.siteId);
      const originCastle = occupation
        ? castlesById.get(occupation.originCastleId)
        : undefined;
      const availability: RealmWoodNodeAvailability = occupation === undefined
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
export function resolveRealmWoodWagonPose(
  node: RealmWoodNodePresentation,
  nowMicros: bigint
): RealmWoodWagonPose | undefined {
  if (
    !node.occupation
    || !node.originCastle
    || !isWoodNodeOccupationPhase(node.availability)
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

export function woodNodeAvailabilityLabel(value: RealmWoodNodeAvailability) {
  switch (value) {
    case 'available': return 'AVAILABLE';
    case 'outbound': return 'OCCUPIED · WAGON EN ROUTE';
    case 'gathering': return 'OCCUPIED · GATHERING';
    case 'returning': return 'OCCUPIED · WAGON RETURNING';
    default: return 'SITE STATUS UNAVAILABLE';
  }
}

export function woodNodeNextAuthorityTimestamp(
  node: RealmWoodNodePresentation
): bigint | undefined {
  if (!node.occupation) return undefined;
  if (node.availability === 'outbound') return node.occupation.arrivesAtMicros;
  if (node.availability === 'gathering') return node.occupation.gatheringEndsAtMicros;
  if (node.availability === 'returning') return node.occupation.returnsAtMicros;
  return undefined;
}

/** One Wood per completed minute is display policy; server settlement wins. */
export function woodNodeCompletedMinutes(
  occupation: RealmWoodNodeOccupationPublicRecord,
  atMicros: bigint
) {
  if (typeof atMicros !== 'bigint' || atMicros <= occupation.arrivesAtMicros) return 0n;
  const capped = atMicros < occupation.gatheringEndsAtMicros
    ? atMicros
    : occupation.gatheringEndsAtMicros;
  return (capped - occupation.arrivesAtMicros) / MINUTE_MICROS;
}
