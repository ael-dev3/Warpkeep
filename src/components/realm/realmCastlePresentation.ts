import { axialToWorld, hexDistance, type HexCoord } from '../../game/map/hexCoordinates';
import { formatMarkMicros } from '../../marks/marksPolicy';
import { safeWarpkeepProfileImageUrl } from '../../security/publicImageUrl';
import type {
  WarpkeepPlayer,
  WarpkeepRealmProfile
} from '../../spacetime/warpkeepBackendTypes';
import type {
  RealmCastleProjectionFrame,
  RealmCastleScreenProjection,
  RealmIdentity
} from './realmTypes';

export const CASTLE_LABEL_LAYOUT_MAX_CASTLES = 100;
export const CASTLE_LABEL_GAP_PIXELS = 6;
export const CASTLE_LABEL_COMPACT_VIEWPORT_MAX_WIDTH = 680;

/**
 * The deliberately small profile projection available to Realm presentation
 * components. Keep subscription, admission, authentication, and policy data
 * behind `publicProfileForCastle`; a castle record already owns the FID used
 * to associate this display data with a place in the world.
 */
export type RealmCastlePublicPresentation = Readonly<{
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
  communityStatsVisible: boolean;
  totalSnapBurnedMicros?: bigint;
  marksBalanceMicros?: bigint;
}>;

export type VisibleCastleLabel = RealmCastleScreenProjection & Readonly<{
  compact: boolean;
  /** Exact projected foundation base; direct identity labels never move away from it. */
  projectedAnchor: Readonly<{ x: number; y: number }>;
}>;

function projectionNumberKey(value: number, scale = 1) {
  return Number.isFinite(value) ? Math.round(value * scale) : 'invalid';
}

/**
 * Coalesces sub-pixel camera motion while retaining every presentation input
 * that can move, reveal, or hide a persistent foundation label. Camera
 * distance is deliberately absent: zoom may move the projected foundation,
 * but it must never change label membership or presentation by itself.
 */
export function realmCastleProjectionFrameKey(frame: RealmCastleProjectionFrame) {
  return `${projectionNumberKey(frame.width)}:${projectionNumberKey(frame.height)}:${frame.castles.map((castle) => {
    const boundsKey = castle.castleBounds
      ? [
          castle.castleBounds.left,
          castle.castleBounds.top,
          castle.castleBounds.right,
          castle.castleBounds.bottom
        ]
          .map((value) => projectionNumberKey(value))
          .join(',')
      : '-';
    const conservativeBoundsKey = castle.conservativeCastleBounds
      ? [
          castle.conservativeCastleBounds.left,
          castle.conservativeCastleBounds.top,
          castle.conservativeCastleBounds.right,
          castle.conservativeCastleBounds.bottom
        ]
          .map((value) => projectionNumberKey(value))
          .join(',')
      : '-';
    return [
      castle.castleId,
      projectionNumberKey(castle.x),
      projectionNumberKey(castle.y),
      castle.visible ? 1 : 0,
      castle.presented ? 1 : 0,
      boundsKey,
      conservativeBoundsKey
    ].join(':');
  }).join('|')}`;
}

/**
 * Resolves the canonical Realm identity layer. Every projection-visible
 * founded castle owns one direct, text-bearing button at its foundation base.
 * Collisions, LOD selection, camera distance, and other identities never
 * change membership. Compact presentation is a viewport property only, so a
 * zoom or orbit cannot make a nameplate swap shape, aggregate, or disappear.
 *
 * A dense overview can overlap labels by design. Explore remains the complete
 * list and selection surface, while the world layer preserves spatial truth.
 */
export function resolvePersistentCastleLabels(
  frame: RealmCastleProjectionFrame
): readonly VisibleCastleLabel[] {
  if (frame.width <= 0 || frame.height <= 0) return [];
  const compact = frame.width <= CASTLE_LABEL_COMPACT_VIEWPORT_MAX_WIDTH;
  const seenCastleIds = new Set<number>();
  return frame.castles
    .slice(0, CASTLE_LABEL_LAYOUT_MAX_CASTLES)
    .filter((castle) => {
      if (
        !castle.visible
        || !Number.isSafeInteger(castle.castleId)
        || castle.castleId <= 0
        || !Number.isFinite(castle.x)
        || !Number.isFinite(castle.y)
        || seenCastleIds.has(castle.castleId)
      ) return false;
      seenCastleIds.add(castle.castleId);
      return true;
    })
    .map((castle) => ({
      ...castle,
      compact,
      projectedAnchor: { x: castle.x, y: castle.y }
    }));
}

function boundedDisplayText(value: string | undefined, maximumLength: number) {
  const normalized = value
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, maximumLength) : undefined;
}

export function normalizeRealmUsername(value: string | undefined) {
  return boundedDisplayText(value, 64)?.replace(/^@+/, '');
}

function publicPresentationFromProfile(
  profile: WarpkeepRealmProfile
): RealmCastlePublicPresentation {
  const communityStatsVisible = profile.communityStatsVisible === true;
  return {
    canonicalUsername: normalizeRealmUsername(profile.canonicalUsername),
    displayName: boundedDisplayText(profile.displayName, 80),
    pfpUrl: safeRealmProfileImageUrl(profile.pfpUrl),
    publicBio: boundedDisplayText(profile.publicBio, 320),
    communityStatsVisible,
    ...(communityStatsVisible ? {
      totalSnapBurnedMicros: profile.totalSnapBurnedMicros,
      marksBalanceMicros: profile.marksBalanceMicros
    } : {})
  };
}

export function publicProfileForCastle(
  fid: number,
  profiles: readonly WarpkeepRealmProfile[],
  players: readonly WarpkeepPlayer[],
  ownIdentity?: RealmIdentity
): RealmCastlePublicPresentation {
  const authoritative = profiles.find((profile) => profile.fid === fid);
  const player = players.find((candidate) => candidate.fid === fid);
  const identity = ownIdentity?.fid === fid ? ownIdentity : undefined;
  if (authoritative) {
    const profile = publicPresentationFromProfile(authoritative);
    return {
      ...profile,
      canonicalUsername: profile.canonicalUsername
        ?? normalizeRealmUsername(player?.username ?? identity?.username),
      displayName: profile.displayName
        ?? boundedDisplayText(player?.displayName ?? identity?.displayName, 80),
      pfpUrl: profile.pfpUrl
        ?? safeRealmProfileImageUrl(player?.pfpUrl ?? identity?.pfpUrl)
    };
  }

  return {
    canonicalUsername: normalizeRealmUsername(player?.username ?? identity?.username),
    displayName: boundedDisplayText(player?.displayName ?? identity?.displayName, 80),
    pfpUrl: safeRealmProfileImageUrl(player?.pfpUrl ?? identity?.pfpUrl),
    communityStatsVisible: false
  };
}

export function castleProfileUsername(profile: RealmCastlePublicPresentation) {
  const username = normalizeRealmUsername(profile.canonicalUsername);
  return username ? `@${username}` : undefined;
}

export function castleProfileIdentityReady(profile: RealmCastlePublicPresentation) {
  return castleProfileUsername(profile) !== undefined
    || boundedDisplayText(profile.displayName, 80) !== undefined;
}

export function castleProfileLabel(profile: RealmCastlePublicPresentation) {
  return castleProfileUsername(profile)
    ?? boundedDisplayText(profile.displayName, 80)
    ?? 'Hegemony Keep';
}

export function castleProfileMonogram(profile: RealmCastlePublicPresentation) {
  const source = normalizeRealmUsername(profile.canonicalUsername)
    ?? boundedDisplayText(profile.displayName, 80);
  return source?.[0]?.toLocaleUpperCase() ?? 'W';
}

export function safeRealmProfileImageUrl(value: string | undefined) {
  return safeWarpkeepProfileImageUrl(value);
}

export function farcasterProfileUrl(username: string | undefined) {
  const normalized = normalizeRealmUsername(username);
  return normalized && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(normalized)
    ? `https://farcaster.xyz/${encodeURIComponent(normalized)}`
    : undefined;
}

export function formatPublicRealmDate(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value! < 0) return undefined;
  try {
    return new Date(value!).toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}

export function formatPublicMarkMicros(value: bigint | undefined) {
  if (value === undefined) return undefined;
  try {
    const exact = formatMarkMicros(value);
    const [whole, fraction] = exact.split('.');
    const grouped = BigInt(whole).toLocaleString('en-US');
    return fraction ? `${grouped}.${fraction}` : grouped;
  } catch {
    return undefined;
  }
}

export function sectorForRealmCoord(coord: HexCoord) {
  if (coord.q === 0 && coord.r === 0) return 0;
  const s = -coord.q - coord.r;
  if (coord.q > 0 && coord.r >= 0) return 1;
  if (coord.r > 0 && coord.q <= 0 && s < 0) return 2;
  if (coord.q < 0 && coord.r > 0 && s >= 0) return 3;
  if (coord.q < 0 && coord.r <= 0) return 4;
  if (coord.r < 0 && coord.q >= 0 && s > 0) return 5;
  return 6;
}

export function fallbackCastleProjection(
  castle: Readonly<{ castleId: number; q: number; r: number }>,
  viewBox: Readonly<{ x: number; y: number; width: number; height: number }>,
  frame: Readonly<{ width: number; height: number }>,
  svgViewport: Readonly<{ left: number; top: number; width: number; height: number }> = {
    left: 0,
    top: 0,
    width: frame.width,
    height: frame.height
  }
): RealmCastleScreenProjection {
  const world = axialToWorld(castle, 1);
  const scale = Math.min(
    svgViewport.width / viewBox.width,
    svgViewport.height / viewBox.height
  );
  const contentLeft = svgViewport.left + (svgViewport.width - viewBox.width * scale) / 2;
  const contentTop = svgViewport.top + (svgViewport.height - viewBox.height * scale) / 2;
  const centerX = contentLeft + (world.x - viewBox.x) * scale;
  const centerY = contentTop + (-world.z - viewBox.y) * scale;
  const markerHalfSize = Math.max(10, Math.abs(scale) * 0.64);
  const castleBounds = {
    left: centerX - markerHalfSize,
    top: centerY - markerHalfSize,
    right: centerX + markerHalfSize,
    bottom: centerY + markerHalfSize
  };
  return {
    ...castle,
    x: centerX,
    y: centerY + markerHalfSize + CASTLE_LABEL_GAP_PIXELS,
    distance: hexDistance({ q: 0, r: 0 }, castle),
    visible: true,
    castleBounds,
    conservativeCastleBounds: castleBounds
  };
}
