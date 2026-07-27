import type { TerrainRgb } from './terrainColor';
import { Color } from 'three';

export const REALM_GRASS_COLOR_BOUNDS = Object.freeze({
  displaySrgbSaturationMin: 0.08,
  displaySrgbSaturationMax: 0.58,
  linearLuminanceMin: 0.045,
  linearLuminanceMax: 0.42
});

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function linearChannelToDisplaySrgb(channel: number) {
  const normalized = clamp(Number.isFinite(channel) ? channel : 0);
  return normalized <= 0.0031308
    ? normalized * 12.92
    : 1.055 * normalized ** (1 / 2.4) - 0.055;
}

/** Convert authored sRGB hex art direction into renderer-linear values once. */
export function realmGrassHexToLinearRgb(hex: string): TerrainRgb {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error('REALM_GRASS_HEX_INVALID');
  // Keep authoring in sRGB hex while storing the values in renderer-linear
  // space. THREE.Color owns the colour-space conversion used by the material.
  // Color#setStyle parses the authored hex into Three's linear storage. Do
  // not call convertSRGBToLinear again or the palette would be double-gamma'd.
  const colour = new Color(`#${normalized}`);
  return Object.freeze({ r: colour.r, g: colour.g, b: colour.b });
}

export function realmGrassColorMetrics(colour: TerrainRgb) {
  const display = Object.freeze({
    r: linearChannelToDisplaySrgb(colour.r),
    g: linearChannelToDisplaySrgb(colour.g),
    b: linearChannelToDisplaySrgb(colour.b)
  });
  const maximum = Math.max(display.r, display.g, display.b);
  const minimum = Math.min(display.r, display.g, display.b);
  return Object.freeze({
    display,
    // HSV saturation is measured after the renderer-linear colour has been
    // converted back to display sRGB. This catches bright/neon authored hexes
    // without accidentally measuring saturation in linear-light space.
    displaySrgbSaturation: maximum <= 0 ? 0 : (maximum - minimum) / maximum,
    linearLuminance:
      colour.r * 0.2126
      + colour.g * 0.7152
      + colour.b * 0.0722
  });
}

export function realmGrassColorIsWithinBounds(colour: TerrainRgb) {
  const metrics = realmGrassColorMetrics(colour);
  return metrics.displaySrgbSaturation >= REALM_GRASS_COLOR_BOUNDS.displaySrgbSaturationMin
    && metrics.displaySrgbSaturation <= REALM_GRASS_COLOR_BOUNDS.displaySrgbSaturationMax
    && metrics.linearLuminance >= REALM_GRASS_COLOR_BOUNDS.linearLuminanceMin
    && metrics.linearLuminance <= REALM_GRASS_COLOR_BOUNDS.linearLuminanceMax;
}

export function realmGrassPalette(hexes: readonly string[]) {
  const colours = hexes.map(realmGrassHexToLinearRgb);
  if (!colours.every(realmGrassColorIsWithinBounds)) {
    throw new Error('REALM_GRASS_PALETTE_OUT_OF_ART_DIRECTION_BOUNDS');
  }
  return Object.freeze(colours);
}
