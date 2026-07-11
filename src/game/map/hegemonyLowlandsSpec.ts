/**
 * The deterministic art-direction contract for the neutral first-realm biome.
 * Values were tuned from the supplied reference's muted lowland character but
 * are authored constants; no reference image is loaded by the runtime.
 */
export const hegemonyLowlandsSpec = {
  biome: 'temperate-lowland',
  palette: {
    grassBase: { r: 0.292, g: 0.365, b: 0.176 },
    grassCool: { r: 0.192, g: 0.268, b: 0.146 },
    soil: { r: 0.46, g: 0.359, b: 0.188 },
    dryGrass: { r: 0.575, g: 0.47, b: 0.225 },
    stone: { r: 0.39, g: 0.39, b: 0.34 }
  },
  surface: {
    hexSize: 1,
    soilCoverageTarget: 0.17,
    boundarySafeRatio: 0.16,
    centerClearRatio: 0.34,
    globalReliefAmplitude: 0.052,
    localReliefAmplitude: 0.022,
    globalWavelength: 5.6,
    secondaryWavelength: 2.9
  }
} as const;
