export type SpiralGalaxyLayout = {
  positions: Float32Array;
  phases: Float32Array;
  sizes: Float32Array;
  brightness: Float32Array;
  temperature: Float32Array;
};

export const titleSceneSpec = {
  title: {
    text: 'WARPKEEP',
    roughness: 0.78,
    metalness: 0.025,
    desktopViewportWidth: 0.95,
    mobileViewportWidth: 0.9,
    depth: 0.84,
    bevelSize: 0.027,
    bevelThickness: 0.05
  },
  galaxy: {
    armCount: 4,
    radius: 7.2,
    verticalScale: 0.72,
    spiralTurns: 0.84,
    armScatter: 0.16,
    desktopParticleCount: 4_200,
    mobileParticleCount: 2_600,
    desktopBackgroundStars: 1_050,
    mobileBackgroundStars: 620,
    seed: 0x57415250
  },
  rift: {
    radius: 0.42,
    haloRadius: 1.75,
    energyParticleCount: 180
  },
  palette: {
    void: '#010207',
    deepNavy: '#05091a',
    concrete: '#f1eee4',
    concreteShadow: '#9a9ca5',
    violet: '#7251b5',
    warp: '#9c73e5',
    coldStar: '#e7efff'
  }
} as const;

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function signedNoise(random: () => number) {
  return random() + random() + random() - 1.5;
}

export function createSpiralGalaxyLayout(count: number, seed: number = titleSceneSpec.galaxy.seed): SpiralGalaxyLayout {
  const safeCount = Math.max(0, Math.floor(count));
  const positions = new Float32Array(safeCount * 3);
  const phases = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const brightness = new Float32Array(safeCount);
  const temperature = new Float32Array(safeCount);
  const random = createSeededRandom(seed);
  const { armCount, radius: galaxyRadius, spiralTurns, verticalScale, armScatter } = titleSceneSpec.galaxy;

  for (let index = 0; index < safeCount; index += 1) {
    const isCoreStar = random() < 0.12;
    const armIndex = index % armCount;
    const radiusRatio = isCoreStar
      ? Math.pow(random(), 2.15) * 0.21
      : 0.08 + Math.pow(random(), 0.68) * 0.92;
    const armAngle = (armIndex / armCount) * Math.PI * 2;
    const spiralAngle = radiusRatio * spiralTurns * Math.PI * 2;
    const angularScatter = signedNoise(random) * (isCoreStar ? 1.1 : armScatter * (0.85 + radiusRatio * 0.45));
    const radialScatter = signedNoise(random) * galaxyRadius * (isCoreStar ? 0.022 : 0.035);
    const pointRadius = Math.max(0.01, Math.min(galaxyRadius * 1.08, radiusRatio * galaxyRadius + radialScatter));
    const angle = isCoreStar ? random() * Math.PI * 2 : armAngle + spiralAngle + angularScatter;
    const i = index * 3;

    positions[i] = Math.cos(angle) * pointRadius;
    positions[i + 1] = Math.sin(angle) * pointRadius * verticalScale;
    positions[i + 2] = signedNoise(random) * (0.42 - radiusRatio * 0.28);
    phases[index] = random() * Math.PI * 2;
    sizes[index] = (isCoreStar ? 1.05 : 0.62) + random() * (isCoreStar ? 1.45 : 1.05);
    brightness[index] = isCoreStar ? 0.66 + random() * 0.34 : 0.28 + random() * 0.62;
    temperature[index] = Math.min(1, Math.max(0, 0.12 + radiusRatio * 0.58 + signedNoise(random) * 0.18));
  }

  return { positions, phases, sizes, brightness, temperature };
}
