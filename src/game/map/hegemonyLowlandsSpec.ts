/**
 * The deterministic art-direction contract for the neutral first-realm biome.
 * Values were tuned from the supplied reference's muted lowland character but
 * are authored constants; no reference image is loaded by the runtime.
 */
export const hegemonyLowlandsSpec = {
  biome: 'temperate-lowland',
  palette: {
    grassBase: { r: 0.385, g: 0.47, b: 0.245 },
    grassCool: { r: 0.245, g: 0.345, b: 0.19 },
    soil: { r: 0.49, g: 0.372, b: 0.192 },
    dryGrass: { r: 0.625, g: 0.508, b: 0.255 },
    stone: { r: 0.43, g: 0.425, b: 0.365 }
  },
  surface: {
    hexSize: 1,
    soilCoverageTarget: 0.17,
    boundarySafeRatio: 0.16,
    centerClearRatio: 0.34,
    globalReliefAmplitude: 0.18,
    localReliefAmplitude: 0.07,
    globalWavelength: 5.6,
    secondaryWavelength: 2.9
  }
} as const;
