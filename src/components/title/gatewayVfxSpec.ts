export type GatewayVfxQuality = 'high' | 'compact' | 'reduced';

export type GatewayVfxQualitySpec = {
  particleCount: number;
  ribbonCount: number;
  ribbonSegments: number;
  filamentCount: number;
  filamentSegments: number;
  noiseOctaves: number;
  maxNewDrawCalls: number;
  pointerDistortionEnabled: boolean;
  starDistortionEnabled: boolean;
  shockwaveEnabled: boolean;
};

export const gatewayVfxQualitySpecs = {
  high: {
    particleCount: 420,
    ribbonCount: 3,
    ribbonSegments: 128,
    filamentCount: 18,
    filamentSegments: 48,
    noiseOctaves: 5,
    maxNewDrawCalls: 6,
    pointerDistortionEnabled: true,
    starDistortionEnabled: true,
    shockwaveEnabled: true
  },
  compact: {
    particleCount: 144,
    ribbonCount: 2,
    ribbonSegments: 72,
    filamentCount: 8,
    filamentSegments: 28,
    noiseOctaves: 3,
    maxNewDrawCalls: 4,
    pointerDistortionEnabled: true,
    starDistortionEnabled: true,
    shockwaveEnabled: false
  },
  reduced: {
    particleCount: 36,
    ribbonCount: 1,
    ribbonSegments: 40,
    filamentCount: 0,
    filamentSegments: 0,
    noiseOctaves: 1,
    maxNewDrawCalls: 2,
    pointerDistortionEnabled: false,
    starDistortionEnabled: false,
    shockwaveEnabled: false
  }
} as const satisfies Record<GatewayVfxQuality, GatewayVfxQualitySpec>;

export type GatewayVfxQualitySelectionInput = {
  viewportWidth: number;
  viewportHeight: number;
  reducedMotion?: boolean;
  rendererMaxTextureSize?: number;
  supportsHighpFragment?: boolean;
};

const compactViewportWidth = 900;
const compactViewportHeight = 540;
const highQualityTextureSize = 4_096;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function unit(value: number) {
  return clamp(finiteOr(value, 0), 0, 1);
}

function smoothstep(value: number) {
  const t = unit(value);
  return t * t * (3 - 2 * t);
}

function thresholdCurve(value: number, threshold: number) {
  if (value <= threshold) {
    return 0;
  }

  return smoothstep((value - threshold) / (1 - threshold));
}

export function selectGatewayVfxQuality({
  viewportWidth,
  viewportHeight,
  reducedMotion = false,
  rendererMaxTextureSize = highQualityTextureSize,
  supportsHighpFragment = true
}: GatewayVfxQualitySelectionInput): GatewayVfxQuality {
  if (reducedMotion) {
    return 'reduced';
  }

  const width = finiteOr(viewportWidth, 0);
  const height = finiteOr(viewportHeight, 0);
  const textureSize = finiteOr(rendererMaxTextureSize, 0);
  const compactViewport = width < compactViewportWidth || height < compactViewportHeight;
  const limitedRenderer = !supportsHighpFragment || textureSize < highQualityTextureSize;

  return width <= 0 || height <= 0 || compactViewport || limitedRenderer
    ? 'compact'
    : 'high';
}

export type GatewayVfxResponse = {
  proximity: number;
  proximitySquared: number;
  proximityCubed: number;
  brightness: number;
  rayThickness: number;
  orbitSpeed: number;
  turbulence: number;
  pointerBend: number;
  localDistortion: number;
  particleSpeed: number;
  highlightSpeed: number;
  eyeFocus: number;
};

export const gatewayVfxResponseSpec = {
  pointerBendThreshold: 0.34,
  localDistortionThreshold: 0.38,
  eyeFocusThreshold: 0.26,
  maximumBrightness: 0.68,
  maximumRayThickness: 1.11,
  maximumPointerBend: 0.32,
  maximumLocalDistortion: 0.24,
  maximumEyeFocus: 0.18
} as const;

const responseScaleByQuality = {
  high: {
    brightness: 1,
    thickness: 1,
    motion: 1,
    turbulence: 1,
    pointer: 1,
    distortion: 1,
    focus: 1
  },
  compact: {
    brightness: 0.9,
    thickness: 0.82,
    motion: 0.76,
    turbulence: 0.68,
    pointer: 0.72,
    distortion: 0.62,
    focus: 0.82
  },
  reduced: {
    brightness: 0.42,
    thickness: 0.28,
    motion: 0.025,
    turbulence: 0.012,
    pointer: 0,
    distortion: 0,
    focus: 0.24
  }
} as const satisfies Record<GatewayVfxQuality, Record<string, number>>;

export function calculateGatewayVfxResponse(
  proximity: number,
  quality: GatewayVfxQuality = 'high',
  output?: GatewayVfxResponse
): GatewayVfxResponse {
  const p = unit(proximity);
  const p2 = p * p;
  const p3 = p2 * p;
  const scale = responseScaleByQuality[quality];
  const pointerCurve = thresholdCurve(p, gatewayVfxResponseSpec.pointerBendThreshold);
  const distortionCurve = thresholdCurve(p, gatewayVfxResponseSpec.localDistortionThreshold);
  const focusCurve = thresholdCurve(p, gatewayVfxResponseSpec.eyeFocusThreshold);

  const response = output ?? {
    proximity: 0,
    proximitySquared: 0,
    proximityCubed: 0,
    brightness: 0.5,
    rayThickness: 1,
    orbitSpeed: 0.18,
    turbulence: 0.025,
    pointerBend: 0,
    localDistortion: 0,
    particleSpeed: 0.22,
    highlightSpeed: 0.12,
    eyeFocus: 0
  };
  response.proximity = p;
  response.proximitySquared = p2;
  response.proximityCubed = p3;
  response.brightness = Math.min(
    gatewayVfxResponseSpec.maximumBrightness,
    0.5 + 0.18 * p * scale.brightness
  );
  response.rayThickness = Math.min(
    gatewayVfxResponseSpec.maximumRayThickness,
    1 + 0.11 * p * scale.thickness
  );
  response.orbitSpeed = 0.18 + 3 * p2 * scale.motion;
  response.turbulence = 0.025 + 1.675 * p3 * scale.turbulence;
  response.pointerBend = Math.min(
    gatewayVfxResponseSpec.maximumPointerBend,
    gatewayVfxResponseSpec.maximumPointerBend * pointerCurve * scale.pointer
  );
  response.localDistortion = Math.min(
    gatewayVfxResponseSpec.maximumLocalDistortion,
    gatewayVfxResponseSpec.maximumLocalDistortion * distortionCurve * scale.distortion
  );
  response.particleSpeed = 0.22 + 2.55 * p2 * scale.motion;
  response.highlightSpeed = 0.12 + 3.4 * p3 * scale.motion;
  response.eyeFocus = Math.min(
    gatewayVfxResponseSpec.maximumEyeFocus,
    gatewayVfxResponseSpec.maximumEyeFocus * focusCurve * scale.focus
  );
  return response;
}

export type GatewayActivationPhase = 'idle' | 'intake' | 'focus' | 'rupture' | 'settle';

export type GatewayActivationStageSpec = {
  startSeconds: number;
  endSeconds: number;
};

export const gatewayActivationSpec = {
  durationSeconds: 1.6,
  stages: {
    intake: { startSeconds: 0, endSeconds: 0.12 },
    focus: { startSeconds: 0.12, endSeconds: 0.3 },
    rupture: { startSeconds: 0.25, endSeconds: 0.9 },
    settle: { startSeconds: 0.9, endSeconds: 1.6 }
  }
} as const satisfies {
  durationSeconds: number;
  stages: Record<Exclude<GatewayActivationPhase, 'idle'>, GatewayActivationStageSpec>;
};

export type GatewayActivationEnvelope = {
  phase: GatewayActivationPhase;
  progress: number;
  intake: number;
  focus: number;
  rupture: number;
  settle: number;
  compression: number;
  eyeFocus: number;
  shockwave: number;
  distortion: number;
  particlePeel: number;
  outerLuminanceScale: number;
};

function stagePulse(elapsedSeconds: number, stage: GatewayActivationStageSpec, peakRatio = 0.42) {
  if (elapsedSeconds < stage.startSeconds || elapsedSeconds >= stage.endSeconds) {
    return 0;
  }

  const duration = stage.endSeconds - stage.startSeconds;
  const progress = (elapsedSeconds - stage.startSeconds) / duration;
  const safePeak = clamp(peakRatio, 0.05, 0.95);

  return progress <= safePeak
    ? smoothstep(progress / safePeak)
    : 1 - smoothstep((progress - safePeak) / (1 - safePeak));
}

function activationPhaseAt(elapsedSeconds: number): GatewayActivationPhase {
  if (elapsedSeconds < 0 || elapsedSeconds >= gatewayActivationSpec.durationSeconds) {
    return 'idle';
  }

  if (elapsedSeconds < gatewayActivationSpec.stages.intake.endSeconds) {
    return 'intake';
  }
  if (elapsedSeconds < gatewayActivationSpec.stages.rupture.startSeconds) {
    return 'focus';
  }
  if (elapsedSeconds < gatewayActivationSpec.stages.rupture.endSeconds) {
    return 'rupture';
  }
  return 'settle';
}

export function calculateGatewayActivationEnvelope(
  elapsedSeconds: number,
  output?: GatewayActivationEnvelope
): GatewayActivationEnvelope {
  const finiteElapsed = finiteOr(elapsedSeconds, -1);
  const active = finiteElapsed >= 0 && finiteElapsed < gatewayActivationSpec.durationSeconds;
  const elapsed = clamp(finiteElapsed, 0, gatewayActivationSpec.durationSeconds);
  const intake = active ? stagePulse(elapsed, gatewayActivationSpec.stages.intake, 0.45) : 0;
  const focus = active ? stagePulse(elapsed, gatewayActivationSpec.stages.focus, 0.55) : 0;
  const rupture = active ? stagePulse(elapsed, gatewayActivationSpec.stages.rupture, 0.38) : 0;
  const settleLeadSeconds = 0.12;
  const settleLeadStart = gatewayActivationSpec.stages.settle.startSeconds - settleLeadSeconds;
  const settle = !active || elapsed < settleLeadStart
    ? 0
    : elapsed < gatewayActivationSpec.stages.settle.startSeconds
      ? smoothstep((elapsed - settleLeadStart) / settleLeadSeconds)
      : 1 - smoothstep(
        (elapsed - gatewayActivationSpec.stages.settle.startSeconds) /
        (gatewayActivationSpec.stages.settle.endSeconds - gatewayActivationSpec.stages.settle.startSeconds)
      );
  const compression = unit(intake + focus * 0.55);
  const focusedEye = unit(focus * 0.88 + rupture * 0.28 + settle * 0.12);
  const shockwave = unit(rupture * smoothstep((elapsed - 0.25) / 0.17));
  const distortion = unit(focus * 0.28 + rupture * 0.82 + settle * 0.08);
  const particlePeel = unit(
    rupture * smoothstep((elapsed - 0.3) / 0.18) + settle * 0.16
  );

  const envelope = output ?? {
    phase: 'idle',
    progress: 0,
    intake: 0,
    focus: 0,
    rupture: 0,
    settle: 0,
    compression: 0,
    eyeFocus: 0,
    shockwave: 0,
    distortion: 0,
    particlePeel: 0,
    outerLuminanceScale: 1
  };
  envelope.phase = active ? activationPhaseAt(elapsed) : 'idle';
  envelope.progress = finiteElapsed < 0 ? 0 : unit(elapsed / gatewayActivationSpec.durationSeconds);
  envelope.intake = intake;
  envelope.focus = focus;
  envelope.rupture = rupture;
  envelope.settle = settle;
  envelope.compression = compression;
  envelope.eyeFocus = focusedEye;
  envelope.shockwave = shockwave;
  envelope.distortion = distortion;
  envelope.particlePeel = particlePeel;
  envelope.outerLuminanceScale = clamp(
    1 - intake * 0.12 + focus * 0.08 + rupture * 0.1 + settle * 0.025,
    0.88,
    1.12
  );
  return envelope;
}

export const gatewayParticleBehavior = {
  infall: 0,
  orbit: 1,
  escape: 2
} as const;

export type GatewayParticleBehavior =
  typeof gatewayParticleBehavior[keyof typeof gatewayParticleBehavior];

export type GatewayParticleAttributes = {
  initialAngles: Float32Array;
  radii: Float32Array;
  orbitalSpeeds: Float32Array;
  radialDrifts: Float32Array;
  phases: Float32Array;
  verticalOffsets: Float32Array;
  sizes: Float32Array;
  brightness: Float32Array;
  behaviorTypes: Uint8Array;
};

export const gatewayParticleSpec = {
  seed: 0x574b5658,
  maximumCount: 4_096,
  behaviorRatios: {
    infall: 0.72,
    orbit: 0.2,
    escape: 0.08
  },
  bounds: {
    radius: { minimum: 0.24, maximum: 1 },
    orbitalSpeedMagnitude: { minimum: 0.42, maximum: 1.36 },
    infallDrift: { minimum: -0.18, maximum: -0.04 },
    orbitDrift: { minimum: -0.012, maximum: 0.012 },
    escapeDrift: { minimum: 0.045, maximum: 0.14 },
    verticalOffset: { minimum: -0.16, maximum: 0.16 },
    size: { minimum: 0.32, maximum: 1.08 },
    brightness: { minimum: 0.26, maximum: 0.84 }
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

function randomBetween(random: () => number, minimum: number, maximum: number) {
  return minimum + (maximum - minimum) * random();
}

function safeParticleCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.min(gatewayParticleSpec.maximumCount, Math.floor(count));
}

export function createGatewayParticleAttributes(
  count: number,
  seed: number = gatewayParticleSpec.seed
): GatewayParticleAttributes {
  const safeCount = safeParticleCount(count);
  const safeSeed = Number.isFinite(seed) ? Math.floor(seed) : gatewayParticleSpec.seed;
  const random = createSeededRandom(safeSeed);
  const initialAngles = new Float32Array(safeCount);
  const radii = new Float32Array(safeCount);
  const orbitalSpeeds = new Float32Array(safeCount);
  const radialDrifts = new Float32Array(safeCount);
  const phases = new Float32Array(safeCount);
  const verticalOffsets = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const brightness = new Float32Array(safeCount);
  const behaviorTypes = new Uint8Array(safeCount);
  const orbitCount = Math.floor(safeCount * gatewayParticleSpec.behaviorRatios.orbit);
  const escapeCount = Math.floor(safeCount * gatewayParticleSpec.behaviorRatios.escape);
  const infallCount = safeCount - orbitCount - escapeCount;

  behaviorTypes.fill(gatewayParticleBehavior.infall, 0, infallCount);
  behaviorTypes.fill(gatewayParticleBehavior.orbit, infallCount, infallCount + orbitCount);
  behaviorTypes.fill(gatewayParticleBehavior.escape, infallCount + orbitCount);

  for (let index = safeCount - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const value = behaviorTypes[index];
    behaviorTypes[index] = behaviorTypes[other];
    behaviorTypes[other] = value;
  }

  const bounds = gatewayParticleSpec.bounds;
  const tau = Math.PI * 2;

  for (let index = 0; index < safeCount; index += 1) {
    const behavior = behaviorTypes[index] as GatewayParticleBehavior;
    const counterRotating = random() < 0.18 ? -1 : 1;

    initialAngles[index] = random() * tau;
    radii[index] = randomBetween(random, bounds.radius.minimum, bounds.radius.maximum);
    orbitalSpeeds[index] = counterRotating * randomBetween(
      random,
      bounds.orbitalSpeedMagnitude.minimum,
      bounds.orbitalSpeedMagnitude.maximum
    );
    radialDrifts[index] = behavior === gatewayParticleBehavior.infall
      ? randomBetween(random, bounds.infallDrift.minimum, bounds.infallDrift.maximum)
      : behavior === gatewayParticleBehavior.orbit
        ? randomBetween(random, bounds.orbitDrift.minimum, bounds.orbitDrift.maximum)
        : randomBetween(random, bounds.escapeDrift.minimum, bounds.escapeDrift.maximum);
    phases[index] = random() * tau;
    verticalOffsets[index] = randomBetween(
      random,
      bounds.verticalOffset.minimum,
      bounds.verticalOffset.maximum
    );
    sizes[index] = randomBetween(random, bounds.size.minimum, bounds.size.maximum);
    brightness[index] = randomBetween(
      random,
      bounds.brightness.minimum,
      bounds.brightness.maximum
    );
  }

  return {
    initialAngles,
    radii,
    orbitalSpeeds,
    radialDrifts,
    phases,
    verticalOffsets,
    sizes,
    brightness,
    behaviorTypes
  };
}
