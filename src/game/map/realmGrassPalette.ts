import type { TerrainRgb } from './terrainColor';
import { Color } from 'three';

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

export function realmGrassPalette(hexes: readonly string[]) {
  return Object.freeze(hexes.map(realmGrassHexToLinearRgb));
}
