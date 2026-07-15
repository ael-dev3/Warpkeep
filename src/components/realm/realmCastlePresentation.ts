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

export const CASTLE_LABEL_MAX_DESKTOP = 28;
export const CASTLE_LABEL_MAX_MOBILE = 10;
export const CASTLE_LABEL_FAR_DISTANCE = 24;
export const CASTLE_LABEL_GAP_PIXELS = 6;

const CASTLE_PROJECTION_DISTANCE_STEPS_PER_UNIT = 4;
const CASTLE_LABEL_EDGE_MARGIN = 4;
const CASTLE_LABEL_FULL_WIDTH = 132;
const CASTLE_LABEL_FULL_HEIGHT = 44;
/** Conservative initial fallback until the DOM reports exact compact label dimensions. */
export const CASTLE_LABEL_COMPACT_WIDTH = 108;
export const CASTLE_LABEL_COMPACT_HEIGHT = 30;
const CASTLE_LABEL_PRIORITY_NUDGE_PIXELS = 40;
const CASTLE_LABEL_STANDARD_NUDGE_PIXELS = 32;

type LabelAttachmentOffset = Readonly<{ x: number; y: number }>;

// Fallback rendering mirrors the measured solver: dense labels stay above the
// same roof in a short vertical stack rather than drifting across the map.
const COMPACT_LABEL_ATTACHMENT_OFFSETS: readonly LabelAttachmentOffset[] = Object.freeze([
  { x: 0, y: 0 },
  { x: 0, y: -50 },
  { x: 58, y: 0 },
  { x: -58, y: 0 },
  { x: 58, y: -50 },
  { x: -58, y: -50 },
  { x: 0, y: -96 }
]);

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
}>;

function projectionNumberKey(value: number, scale = 1) {
  return Number.isFinite(value) ? Math.round(value * scale) : 'invalid';
}

/**
 * Coalesces sub-pixel camera motion while retaining every presentation input:
 * screen position, visibility, model silhouette, and distance/near-far band.
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
    const distanceBand = castle.distance > CASTLE_LABEL_FAR_DISTANCE ? 'far' : 'near';
    return [
      castle.castleId,
      projectionNumberKey(castle.x),
      projectionNumberKey(castle.y),
      projectionNumberKey(castle.distance, CASTLE_PROJECTION_DISTANCE_STEPS_PER_UNIT),
      distanceBand,
      castle.visible ? 1 : 0,
      boundsKey,
      conservativeBoundsKey
    ].join(':');
  }).join('|')}`;
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
  if (authoritative) {
    return publicPresentationFromProfile(authoritative);
  }

  const player = players.find((candidate) => candidate.fid === fid);
  const identity = ownIdentity?.fid === fid ? ownIdentity : undefined;
  return {
    canonicalUsername: normalizeRealmUsername(player?.username ?? identity?.username),
    displayName: boundedDisplayText(player?.displayName ?? identity?.displayName, 80),
    pfpUrl: safeRealmProfileImageUrl(player?.pfpUrl ?? identity?.pfpUrl),
    communityStatsVisible: false
  };
}

export function castleProfileLabel(profile: RealmCastlePublicPresentation) {
  const username = normalizeRealmUsername(profile.canonicalUsername);
  return username ? `@${username}` : profile.displayName ?? 'Hegemony Keep';
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

type Bounds = Readonly<{ left: number; right: number; top: number; bottom: number }>;

function intersects(first: Bounds, second: Bounds) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function labelBounds(
  castle: RealmCastleScreenProjection,
  compact: boolean,
  yOffset: number
): Bounds {
  const width = compact ? CASTLE_LABEL_COMPACT_WIDTH : CASTLE_LABEL_FULL_WIDTH;
  const height = compact ? CASTLE_LABEL_COMPACT_HEIGHT : CASTLE_LABEL_FULL_HEIGHT;
  return {
    left: castle.x - width / 2,
    right: castle.x + width / 2,
    top: castle.y + yOffset - height,
    bottom: castle.y + yOffset
  };
}

/**
 * Bounded label placement for up to 100 castles. Every accepted marker keeps
 * its public identity text and remains attached to its projected castle.
 */
export function resolveVisibleCastleLabels(
  frame: RealmCastleProjectionFrame,
  ownCastleId: number | undefined,
  selectedCastleId: number | undefined,
  maximumLabels = frame.width <= 680
    ? CASTLE_LABEL_MAX_MOBILE
    : CASTLE_LABEL_MAX_DESKTOP
): readonly VisibleCastleLabel[] {
  if (frame.width <= 0 || frame.height <= 0 || maximumLabels <= 0) return [];
  const candidates = frame.castles
    .filter((castle) => castle.visible)
    .sort((left, right) => {
      const priority = (castle: RealmCastleScreenProjection) => (
        castle.castleId === selectedCastleId ? 0
          : castle.castleId === ownCastleId ? 1
            : 2
      );
      return priority(left) - priority(right)
        || left.distance - right.distance
        || left.castleId - right.castleId;
    });

  const accepted: Array<VisibleCastleLabel & { bounds: Bounds }> = [];
  for (const castle of candidates) {
    if (accepted.length >= maximumLabels) break;
    const priority = castle.castleId === selectedCastleId || castle.castleId === ownCastleId;
    const fullAttempt = { compact: false, offsets: [{ x: 0, y: 0 }] } as const;
    const compactAttempt = { compact: true, offsets: COMPACT_LABEL_ATTACHMENT_OFFSETS } as const;
    const preferCompact = frame.width <= 680 && !priority;
    const presentationAttempts: readonly Readonly<{
      compact: boolean;
      offsets: readonly LabelAttachmentOffset[];
    }>[] = preferCompact
      ? [compactAttempt, fullAttempt]
      : [fullAttempt, compactAttempt];

    let nextLabel: (VisibleCastleLabel & { bounds: Bounds }) | undefined;
    for (const attempt of presentationAttempts) {
      const width = attempt.compact ? CASTLE_LABEL_COMPACT_WIDTH : CASTLE_LABEL_FULL_WIDTH;
      const height = attempt.compact ? CASTLE_LABEL_COMPACT_HEIGHT : CASTLE_LABEL_FULL_HEIGHT;
      const minimumX = CASTLE_LABEL_EDGE_MARGIN + width / 2;
      const maximumX = frame.width - CASTLE_LABEL_EDGE_MARGIN - width / 2;
      const minimumY = CASTLE_LABEL_EDGE_MARGIN + height;
      const maximumY = frame.height - CASTLE_LABEL_EDGE_MARGIN;
      if (maximumX < minimumX || maximumY < minimumY) continue;

      for (const offset of attempt.offsets) {
        const attachedX = castle.x + offset.x;
        const attachedY = castle.y + offset.y;
        const x = clamp(attachedX, minimumX, maximumX);
        const y = clamp(attachedY, minimumY, maximumY);
        const safeAreaNudge = Math.hypot(x - attachedX, y - attachedY);
        if (safeAreaNudge > (
          priority ? CASTLE_LABEL_PRIORITY_NUDGE_PIXELS : CASTLE_LABEL_STANDARD_NUDGE_PIXELS
        )) continue;
        const projectedCastle = { ...castle, x, y };
        const bounds = labelBounds(projectedCastle, attempt.compact, 0);
        if (
          (castle.castleBounds && intersects(bounds, castle.castleBounds))
          || accepted.some((entry) => intersects(bounds, entry.bounds))
        ) continue;
        nextLabel = {
          ...projectedCastle,
          compact: attempt.compact,
          bounds
        };
        break;
      }
      if (nextLabel) break;
    }
    if (nextLabel) {
      accepted.push(nextLabel);
    }
  }

  return accepted.map(({ bounds: _bounds, ...label }) => label);
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
    y: centerY - markerHalfSize - CASTLE_LABEL_GAP_PIXELS,
    distance: hexDistance({ q: 0, r: 0 }, castle),
    visible: true,
    castleBounds,
    conservativeCastleBounds: castleBounds
  };
}
