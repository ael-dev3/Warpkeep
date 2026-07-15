export type SpiralGalaxyLayout = {
  positions: Float32Array;
  phases: Float32Array;
  sizes: Float32Array;
  brightness: Float32Array;
  temperature: Float32Array;
};

export const titleSceneSpec = {
  title: {
    desktopViewportWidth: 0.82,
    mobileViewportWidth: 0.84,
    shinePeriodSeconds: 32
  },
  galaxy: {
    armCount: 5,
    radius: 7.8,
    verticalScale: 0.49,
    spiralTurns: 1.12,
    armScatter: 0.32,
    desktopViewportWidth: 0.9,
    desktopViewportHeight: 0.74,
    portraitViewportWidth: 1.08,
    portraitViewportHeight: 0.6,
    shortLandscapeBaseY: -0.08,
    purpleMix: 0.58,
    shinePeriodSeconds: 21,
    rotationPeriodSeconds: 300,
    growthPerMinute: 0.018,
    maxGrowth: 0.115,
    maxPointSize: 13,
    desktopParticleCount: 6_800,
    mobileParticleCount: 4_200,
    desktopBackgroundStars: 1_250,
    mobileBackgroundStars: 760,
    seed: 0x57415250
  },
  core: {
    shadowRadius: 0.055,
    accretionRadius: 0.17,
    lensRadius: 0.29
  },
  gateway: {
    interactionRadiusRatio: 0.31,
    minInteractionRadiusPx: 132,
    maxInteractionRadiusPx: 380,
    hitWidthMinPx: 112,
    hitWidthViewportRatio: 0.1,
    hitWidthMaxPx: 180,
    hitHeightMinPx: 80,
    hitHeightViewportRatio: 0.07,
    hitHeightMaxPx: 128,
    proximityRiseResponse: 5.4,
    proximitySettleResponse: 2.8,
    idlePulsePeriodSeconds: 7.4,
    activePulsePeriodSeconds: 3,
    idleFlowRate: 0.22,
    activeFlowRate: 0.72,
    surgeDurationSeconds: 1.6,
    noticeDurationMs: 5_200,
    noticeGapPx: 16,
    viewportMarginPx: 16
  },
  interaction: {
    damping: 6.8,
    cameraTravelX: 0.34,
    cameraTravelY: 0.18,
    cameraTargetX: 0.11,
    cameraTargetY: 0.065,
    titleRotationX: 0.021,
    titleRotationY: 0.039,
    galaxyTravelX: 0.18,
    galaxyTravelY: 0.09,
    galaxyRotationX: 0.005,
    galaxyRotationY: 0.008,
    lightTravelX: 2.4,
    lightTravelY: 1.2
  },
  palette: {
    void: '#010207',
    deepNavy: '#05091a',
    concrete: '#f3f0e8',
    concreteShadow: '#bab6ae',
    concreteEdge: '#cbc7be',
    violet: '#67448f',
    warp: '#9d72ca',
    coldStar: '#e7efff',
    oldGold: '#a99168'
  }
} as const;

export function calculateGalaxyGrowth(elapsedSeconds: number) {
  const safeElapsed = Math.max(0, elapsedSeconds);
  const initialGrowthPerSecond = titleSceneSpec.galaxy.growthPerMinute / 60;
  const timeConstant = titleSceneSpec.galaxy.maxGrowth / initialGrowthPerSecond;
  const boundedGrowth = titleSceneSpec.galaxy.maxGrowth * (1 - Math.exp(-safeElapsed / timeConstant));
  return 1 + boundedGrowth;
}

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
  const { armCount, radius: galaxyRadius, spiralTurns, armScatter } = titleSceneSpec.galaxy;

  for (let index = 0; index < safeCount; index += 1) {
    const isCoreStar = random() < 0.17;
    const isFieldStar = !isCoreStar && random() < 0.16;
    const armIndex = index % armCount;
    const radiusRatio = isCoreStar
      ? Math.pow(random(), 2.35) * 0.24
      : 0.065 + Math.pow(random(), 0.72) * 0.935;
    const armAngle = (armIndex / armCount) * Math.PI * 2;
    const spiralAngle = radiusRatio * spiralTurns * Math.PI * 2;
    const angularScatter = signedNoise(random) * (
      isCoreStar
        ? 1.25
        : isFieldStar
          ? 0
          : armScatter * (0.82 + radiusRatio * 0.58)
    );
    const radialScatter = signedNoise(random) * galaxyRadius * (
      isCoreStar ? 0.024 : isFieldStar ? 0.072 : 0.055
    );
    const pointRadius = Math.max(0.01, Math.min(galaxyRadius * 1.08, radiusRatio * galaxyRadius + radialScatter));
    const angle = isCoreStar || isFieldStar
      ? random() * Math.PI * 2
      : armAngle + spiralAngle + angularScatter;
    const i = index * 3;

    positions[i] = Math.cos(angle) * pointRadius;
    positions[i + 1] = Math.sin(angle) * pointRadius;
    positions[i + 2] = signedNoise(random) * (0.2 - radiusRatio * 0.12);
    phases[index] = random() * Math.PI * 2;
    sizes[index] = isFieldStar
      ? 0.42 + random() * 0.82
      : (isCoreStar ? 0.9 : 0.52) + random() * (isCoreStar ? 1.55 : 1.18);
    brightness[index] = isCoreStar
      ? 0.62 + random() * 0.38
      : isFieldStar
        ? 0.12 + random() * 0.38
        : 0.2 + random() * 0.72;
    temperature[index] = Math.min(1, Math.max(0, 0.12 + radiusRatio * 0.58 + signedNoise(random) * 0.18));
  }

  return { positions, phases, sizes, brightness, temperature };
}
