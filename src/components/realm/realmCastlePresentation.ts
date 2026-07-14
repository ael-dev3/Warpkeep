import { axialToWorld, hexDistance, type HexCoord } from '../../game/map/hexCoordinates';
import { formatMarkMicros } from '../../marks/marksPolicy';
import { safePublicHttpsImageUrl } from '../../security/publicImageUrl';
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

export type RealmCastlePublicPresentation = WarpkeepRealmProfile;

export type VisibleCastleLabel = RealmCastleScreenProjection & Readonly<{
  compact: boolean;
}>;

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

export function publicProfileForCastle(
  fid: number,
  profiles: readonly WarpkeepRealmProfile[],
  players: readonly WarpkeepPlayer[],
  ownIdentity?: RealmIdentity
): RealmCastlePublicPresentation {
  const authoritative = profiles.find((profile) => profile.fid === fid);
  if (authoritative) {
    return {
      ...authoritative,
      canonicalUsername: normalizeRealmUsername(authoritative.canonicalUsername),
      displayName: boundedDisplayText(authoritative.displayName, 80),
      publicBio: boundedDisplayText(authoritative.publicBio, 320)
    };
  }

  const player = players.find((candidate) => candidate.fid === fid);
  const identity = ownIdentity?.fid === fid ? ownIdentity : undefined;
  return {
    fid,
    canonicalUsername: normalizeRealmUsername(player?.username ?? identity?.username),
    displayName: boundedDisplayText(player?.displayName ?? identity?.displayName, 80),
    pfpUrl: player?.pfpUrl ?? identity?.pfpUrl,
    publicStatus: player?.status ?? 'profile-pending',
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
  return safePublicHttpsImageUrl(value);
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

function labelBounds(
  castle: RealmCastleScreenProjection,
  compact: boolean,
  yOffset: number
): Bounds {
  const width = compact ? 42 : 132;
  const height = compact ? 42 : 44;
  return {
    left: castle.x - width / 2,
    right: castle.x + width / 2,
    top: castle.y + yOffset - height,
    bottom: castle.y + yOffset
  };
}

function labelWidth(compact: boolean) {
  return compact ? 42 : 132;
}

/**
 * Bounded label placement for up to 100 castles. Own and selected labels are
 * retained first and can shift vertically; all other collisions are culled.
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
    const compact = !priority && castle.distance > 24;
    const width = labelWidth(compact);
    const projectedCastle = priority
      ? {
          ...castle,
          x: Math.min(
            frame.width - 4 - width / 2,
            Math.max(4 + width / 2, castle.x)
          )
        }
      : castle;
    const offsets = priority ? [0, -48, 48, -96, 96] : [0];
    const yOffset = offsets.find((offset) => {
      const bounds = labelBounds(projectedCastle, compact, offset);
      return bounds.left >= 4
        && bounds.right <= frame.width - 4
        && bounds.top >= 4
        && bounds.bottom <= frame.height - 4
        && accepted.every((entry) => !intersects(bounds, entry.bounds));
    });
    if (yOffset === undefined) continue;
    accepted.push({
      ...projectedCastle,
      y: projectedCastle.y + yOffset,
      compact,
      bounds: labelBounds(projectedCastle, compact, yOffset)
    });
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
  return {
    ...castle,
    x: contentLeft + (world.x - viewBox.x) * scale,
    y: contentTop + (-world.z - viewBox.y) * scale,
    distance: hexDistance({ q: 0, r: 0 }, castle),
    visible: true
  };
}
