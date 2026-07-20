import { useEffect, useState } from 'react';

import { axialToWorld, type HexCoord } from '../../game/map/hexCoordinates';
import { terrainCellByCoord } from '../../game/map/generateTerrainMap';
import type { RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import type { TerrainCell } from '../../game/map/terrainTypes';
import {
  createTerrainOverviewHull,
  pointyHexCorners
} from './createTerrainGeometry';
import type { RealmQuality } from './realmQuality';
import type { VisibleCastleLabel } from './realmCastlePresentation';

export const REALM_HEX_SIZE = 1;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type RealmViewBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RealmFallbackSurfacePresentation = Readonly<{
  viewBox: RealmViewBox;
  renderHullPoints: string;
  playableHullPoints: string;
}>;

export type RealmFallbackSurfaceOptions = Readonly<{
  /** Keep unsupported-device mode readable around the player's region. */
  focusCoord?: HexCoord;
  radius?: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sameCoord(first: HexCoord | null, second: HexCoord | null) {
  if (first === null || second === null) return first === second;
  return first.q === second.q && first.r === second.r;
}

export function applyCastleLabelPlacement(
  button: HTMLButtonElement,
  placement: VisibleCastleLabel | undefined
) {
  if (!placement) {
    button.style.visibility = 'hidden';
    button.tabIndex = -1;
    button.dataset.displaced = 'false';
    return;
  }

  const labelX = `${placement.x.toFixed(2)}px`;
  const labelY = `${placement.y.toFixed(2)}px`;
  const anchorX = `${placement.projectedAnchor.x.toFixed(2)}px`;
  const anchorY = `${placement.projectedAnchor.y.toFixed(2)}px`;
  button.style.visibility = 'visible';
  button.dataset.displaced = 'false';
  button.style.setProperty('--realm-castle-label-x', labelX);
  button.style.setProperty('--realm-castle-label-y', labelY);
  button.style.setProperty('--realm-castle-anchor-x', anchorX);
  button.style.setProperty('--realm-castle-anchor-y', anchorY);
}

export function directionForKey(key: string): HexCoord | null {
  switch (key) {
    case 'ArrowRight': return { q: 1, r: 0 };
    case 'ArrowLeft': return { q: -1, r: 0 };
    case 'ArrowUp': return { q: 0, r: -1 };
    case 'ArrowDown': return { q: 0, r: 1 };
    default: return null;
  }
}

let cachedWebGlCapability: boolean | undefined;

/**
 * Probe once per document without deliberately destroying a context. The old
 * probe used WEBGL_lose_context as a feature test, which could leave the next
 * real canvas in the exact terminal state we are trying to recover from.
 */
export function canUseWebGL() {
  if (cachedWebGlCapability !== undefined) return cachedWebGlCapability;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cachedWebGlCapability = Boolean(context);
  } catch {
    cachedWebGlCapability = false;
  }
  return cachedWebGlCapability;
}

export function resetWebGLCapabilityForTests() {
  cachedWebGlCapability = undefined;
}

export function pointsForSvg(coord: HexCoord) {
  return pointyHexCorners(coord, REALM_HEX_SIZE)
    .map((point) => `${point.x.toFixed(4)},${(-point.z).toFixed(4)}`)
    .join(' ');
}

function svgHullPoints(points: readonly Readonly<{ x: number; z: number }>[]) {
  return points.map((point) => `${point.x.toFixed(4)},${(-point.z).toFixed(4)}`).join(' ');
}

export function fallbackSurfacePresentation(
  surface: RealmTerrainSurface,
  options: RealmFallbackSurfaceOptions = {}
): RealmFallbackSurfacePresentation {
  const renderHull = createTerrainOverviewHull(surface.renderMap, REALM_HEX_SIZE);
  const playableHull = createTerrainOverviewHull(surface.playableMap, REALM_HEX_SIZE);
  if (renderHull.length === 0) {
    return {
      viewBox: { x: -2, y: -2, width: 4, height: 4 },
      renderHullPoints: '',
      playableHullPoints: ''
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  renderHull.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  const padding = 0.88;
  const focus = options.focusCoord;
  const radius = Number.isFinite(options.radius) && (options.radius ?? 0) > 0
    ? options.radius!
    : undefined;
  if (focus && radius) {
    const center = axialToWorld(focus, REALM_HEX_SIZE);
    const span = Math.max(4, radius * 2.15);
    return {
      viewBox: {
        x: center.x - span * 0.5,
        y: -center.z - span * 0.5,
        width: span,
        height: span
      },
      renderHullPoints: svgHullPoints(renderHull),
      playableHullPoints: svgHullPoints(playableHull)
    };
  }
  return {
    viewBox: {
      x: minX - padding,
      y: -maxZ - padding,
      width: maxX - minX + padding * 2,
      height: maxZ - minZ + padding * 2
    },
    renderHullPoints: svgHullPoints(renderHull),
    playableHullPoints: svgHullPoints(playableHull)
  };
}

function linearChannelToSrgb(value: number) {
  const channel = clamp(value, 0, 1);
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function colorToCss(color: Readonly<{ r: number; g: number; b: number }>) {
  const channel = (value: number) => Math.round(linearChannelToSrgb(value) * 255);
  return `rgb(${channel(color.r)} ${channel(color.g)} ${channel(color.b)})`;
}

function readReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const preference = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();

    if (typeof preference.addEventListener === 'function') {
      preference.addEventListener('change', updatePreference);
      return () => preference.removeEventListener('change', updatePreference);
    }

    if (typeof preference.addListener === 'function') {
      preference.addListener(updatePreference);
      return () => preference.removeListener(updatePreference);
    }
    return undefined;
  }, []);

  return reducedMotion;
}

export function initialQuality(override?: RealmQuality) {
  return override ?? 'high';
}

export function selectedCellFor(
  surface: RealmTerrainSurface,
  coord: HexCoord,
  fallback: HexCoord
): TerrainCell {
  return terrainCellByCoord(surface.playableMap, coord)
    ?? terrainCellByCoord(surface.playableMap, fallback)
    ?? surface.playableMap.cells[0];
}
