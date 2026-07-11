/**
 * The deterministic art-direction contract for the neutral first-realm biome.
 * Values were tuned from the supplied reference's muted lowland character but
 * are authored constants; no reference image is loaded by the runtime.
 */
export const hegemonyLowlandsSpec = {
  biome: 'temperate-lowland',
  palette: {
    grassBase: { r: 0.424, g: 0.49, b: 0.271 },
    grassCool: { r: 0.31, g: 0.404, b: 0.224 },
    soil: { r: 0.545, g: 0.412, b: 0.227 },
    dryGrass: { r: 0.667, g: 0.553, b: 0.271 },
    stone: { r: 0.439, g: 0.439, b: 0.404 }
  },
  surface: {
    hexSize: 1,
    soilCoverageTarget: 0.17,
    boundarySafeRatio: 0.16,
    centerClearRatio: 0.34,
    globalReliefAmplitude: 0.13,
    localReliefAmplitude: 0.045,
    globalWavelength: 5.6,
    secondaryWavelength: 2.9
  }
} as const;
