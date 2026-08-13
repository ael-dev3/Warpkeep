import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import {
  GREATER_REALM_CHUNK_BIN_SIZE,
  type GreaterRealmLod
} from '../../greater-realm/greaterRealmPublicContract';
import {
  resolveGreaterRealmDeviceClass,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from '../../greater-realm/greaterRealmRuntimePolicy';

export { GREATER_REALM_CHUNK_BIN_SIZE } from '../../greater-realm/greaterRealmPublicContract';
export const GREATER_REALM_MAX_WINDOW_RADIUS = 4 as const;
const I32_MINIMUM = -2_147_483_648;
const I32_MAXIMUM = 2_147_483_647;

export type GreaterRealmWorldViewPolicy = Readonly<{
  centerQ: number;
  centerR: number;
  radius: number;
  lod: GreaterRealmLod;
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  reducedMotion: boolean;
  pixelRatioCap: number;
}>;

function safeAtlasCoordinate(value: number) {
  if (
    !Number.isSafeInteger(value)
    || value < I32_MINIMUM
    || value > I32_MAXIMUM
  ) {
    throw new Error('GREATER_REALM_OWN_CASTLE_COORDINATE_INVALID');
  }
  return value;
}

function requestedProfile(
  quality: GraphicsQualityTier | undefined
): GreaterRealmGraphicsProfile {
  if (quality === 'cinematic') return 'high';
  if (quality === 'performance') return 'reduced';
  return 'balanced';
}

/**
 * Derive the bounded public atlas window from the caller's public castle row.
 * Atlas cells are grouped into immutable 15-by-15 bins; no private slot,
 * region rank, or candidate metadata crosses this presentation boundary.
 */
export function resolveGreaterRealmWorldViewPolicy(input: Readonly<{
  atlasQ: number;
  atlasR: number;
  viewportWidth: number;
  coarsePointer: boolean;
  farcasterMiniApp: boolean;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  reducedMotion: boolean;
}>): GreaterRealmWorldViewPolicy {
  const atlasQ = safeAtlasCoordinate(input.atlasQ);
  const atlasR = safeAtlasCoordinate(input.atlasR);
  const embeddedMobile = input.farcasterMiniApp;
  const deviceClass = resolveGreaterRealmDeviceClass({
    coarsePointer: input.coarsePointer || embeddedMobile,
    viewportWidth: input.viewportWidth
  });
  const requested = requestedProfile(input.resolvedGraphicsQuality);
  const graphicsProfile = requested === 'high'
    && (deviceClass === 'mobile' || embeddedMobile)
      ? 'balanced'
      : requested;
  const radius = graphicsProfile === 'high'
    ? GREATER_REALM_MAX_WINDOW_RADIUS
    : graphicsProfile === 'balanced'
      ? deviceClass === 'mobile' || embeddedMobile ? 2 : 3
      : 2;
  const lod: GreaterRealmLod = graphicsProfile === 'high'
    ? 0
    : graphicsProfile === 'balanced'
      ? 1
      : 2;
  const profilePixelRatioCap = graphicsProfile === 'high'
    ? 1.8
    : graphicsProfile === 'balanced'
      ? 1.5
      : 1.2;
  const pixelRatioCap = embeddedMobile
    ? Math.min(profilePixelRatioCap, 1.25)
    : profilePixelRatioCap;
  return Object.freeze({
    centerQ: Math.floor(atlasQ / GREATER_REALM_CHUNK_BIN_SIZE),
    centerR: Math.floor(atlasR / GREATER_REALM_CHUNK_BIN_SIZE),
    radius: Math.min(radius, GREATER_REALM_MAX_WINDOW_RADIUS),
    lod,
    deviceClass,
    graphicsProfile,
    reducedMotion: Boolean(input.reducedMotion),
    pixelRatioCap
  });
}
