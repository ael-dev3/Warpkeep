import { GENESIS_LOWLANDS_SURFACE_SPEC } from '../../../spacetimedb/src/lowlandsSurface';

/**
 * The deterministic art-direction contract for the neutral first-realm biome.
 * Values were tuned from the supplied reference's muted lowland character but
 * are authored constants; no reference image is loaded by the runtime.
 */
export const hegemonyLowlandsSpec = {
  biome: 'temperate-lowland',
  palette: {
    // Scene-linear values: WebGL writes them directly to vertex colours and
    // the SVG fallback encodes them once for display-sRGB.
    grassBase: { r: 0.39, g: 0.56, b: 0.25 },
    grassCool: { r: 0.27, g: 0.45, b: 0.23 },
    soil: { r: 0.52, g: 0.42, b: 0.22 },
    dryGrass: { r: 0.62, g: 0.56, b: 0.27 },
    stone: { r: 0.45, g: 0.45, b: 0.38 }
  },
  surface: GENESIS_LOWLANDS_SURFACE_SPEC
} as const;
