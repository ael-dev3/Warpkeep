import * as THREE from 'three';
import {
  createGatewayParticleAttributes,
  gatewayVfxQualitySpecs,
  type GatewayActivationEnvelope,
  type GatewayVfxQuality,
  type GatewayVfxResponse
} from './gatewayVfxSpec';
import {
  gatewayEyeFragmentShader,
  gatewayParticleFragmentShader,
  gatewayParticleVertexShader,
  gatewayRibbonFragmentShader,
  gatewayRibbonVertexShader,
  gatewayVfxVertexPassthrough
} from './gatewayVfxShaders';

export type GatewayVfxFrameState = {
  time: number;
  delta: number;
  proximity: number;
  pulsePhase: number;
  flowPhase: number;
  response: GatewayVfxResponse;
  activation: GatewayActivationEnvelope;
  pointerLocal: THREE.Vector2;
  pointerDirection: THREE.Vector2;
  pointerValid: boolean;
  reducedMotion: boolean;
};

export type GatewayVfxStats = {
  quality: GatewayVfxQuality;
  particleCount: number;
  ribbonCount: number;
  filamentCount: number;
  drawCalls: number;
  incrementalDrawCalls: number;
  materialCount: number;
  geometryCount: number;
  renderTargetCount: 0;
};

export type GatewayVfxAssembly = {
  group: THREE.Group;
  materials: readonly THREE.ShaderMaterial[];
  stats: GatewayVfxStats;
  update: (state: GatewayVfxFrameState) => void;
  setPixelRatio: (pixelRatio: number) => void;
  dispose: () => void;
};

type GatewayVfxAssemblyOptions = {
  quality: GatewayVfxQuality;
  pixelRatio: number;
  galaxyRadius: number;
  shadowRadius: number;
  accretionRadius: number;
  lensRadius: number;
};

type RibbonGeometryOptions = {
  layerCount: number;
  segments: number;
  filament: boolean;
};

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number) {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
}

function createRibbonGeometry({
  layerCount,
  segments,
  filament
}: RibbonGeometryOptions) {
  const safeLayers = Math.max(0, Math.floor(layerCount));
  const safeSegments = Math.max(3, Math.floor(segments));
  const verticesPerLayer = (safeSegments + 1) * 2;
  const vertexCount = safeLayers * verticesPerLayer;
  const positions = new Float32Array(vertexCount * 3);
  const angles = new Float32Array(vertexCount);
  const sides = new Float32Array(vertexCount);
  const layers = new Float32Array(vertexCount);
  const phases = new Float32Array(vertexCount);
  const radii = new Float32Array(vertexCount);
  const widths = new Float32Array(vertexCount);
  const directions = new Float32Array(vertexCount);
  const kinds = new Float32Array(vertexCount);
  const indices = vertexCount > 65_535
    ? new Uint32Array(safeLayers * safeSegments * 6)
    : new Uint16Array(safeLayers * safeSegments * 6);
  const tau = Math.PI * 2;

  for (let layer = 0; layer < safeLayers; layer += 1) {
    const phase = (layer * 2.3999632297 + (filament ? 0.73 : 0.18)) % tau;
    const direction = layer % 3 === 1 ? -1 : 1;
    const layerRadius = filament
      ? 0.105 + (layer % 7) * 0.031 + Math.floor(layer / 7) * 0.009
      : [0.128, 0.205, 0.282, 0.345, 0.39][layer] ?? 0.39;
    const layerWidth = filament
      ? 0.00125 + (layer % 4) * 0.00022
      : [0.012, 0.0072, 0.0046, 0.0038, 0.0032][layer] ?? 0.0032;
    const layerStart = layer * verticesPerLayer;

    for (let segment = 0; segment <= safeSegments; segment += 1) {
      const progress = segment / safeSegments;
      const angle = progress * tau * (filament ? 1.12 + (layer % 3) * 0.09 : 1);
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const vertex = layerStart + segment * 2 + sideIndex;
        angles[vertex] = angle;
        sides[vertex] = sideIndex === 0 ? -1 : 1;
        layers[vertex] = layer;
        phases[vertex] = phase;
        radii[vertex] = layerRadius;
        widths[vertex] = layerWidth;
        directions[vertex] = direction;
        kinds[vertex] = filament ? 1 : 0;
      }
    }

    for (let segment = 0; segment < safeSegments; segment += 1) {
      const vertex = layerStart + segment * 2;
      const index = (layer * safeSegments + segment) * 6;
      indices[index] = vertex;
      indices[index + 1] = vertex + 1;
      indices[index + 2] = vertex + 2;
      indices[index + 3] = vertex + 2;
      indices[index + 4] = vertex + 1;
      indices[index + 5] = vertex + 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('ribbonAngle', new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute('ribbonSide', new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute('ribbonLayer', new THREE.BufferAttribute(layers, 1));
  geometry.setAttribute('ribbonPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('ribbonRadius', new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute('ribbonWidth', new THREE.BufferAttribute(widths, 1));
  geometry.setAttribute('ribbonDirection', new THREE.BufferAttribute(directions, 1));
  geometry.setAttribute('ribbonKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function createParticleGeometry(count: number) {
  const attributes = createGatewayParticleAttributes(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(attributes.radii.length * 3), 3)
  );
  geometry.setAttribute('particleAngle', new THREE.BufferAttribute(attributes.initialAngles, 1));
  geometry.setAttribute('particleRadius', new THREE.BufferAttribute(attributes.radii, 1));
  geometry.setAttribute('particleOrbitSpeed', new THREE.BufferAttribute(attributes.orbitalSpeeds, 1));
  geometry.setAttribute('particleRadialDrift', new THREE.BufferAttribute(attributes.radialDrifts, 1));
  geometry.setAttribute('particlePhase', new THREE.BufferAttribute(attributes.phases, 1));
  geometry.setAttribute('particleVerticalOffset', new THREE.BufferAttribute(attributes.verticalOffsets, 1));
  geometry.setAttribute('particleSize', new THREE.BufferAttribute(attributes.sizes, 1));
  geometry.setAttribute('particleBrightness', new THREE.BufferAttribute(attributes.brightness, 1));
  geometry.setAttribute('particleBehavior', new THREE.Uint8BufferAttribute(attributes.behaviorTypes, 1));
  return geometry;
}

function createSharedUniforms(options: GatewayVfxAssemblyOptions) {
  return {
    time: { value: 0 },
    pixelRatio: { value: positiveOr(options.pixelRatio, 1) },
    galaxyRadius: { value: positiveOr(options.galaxyRadius, 1) },
    coreExtent: { value: 0.46 },
    shadowRadius: { value: positiveOr(options.shadowRadius, 0.055) },
    accretionRadius: { value: positiveOr(options.accretionRadius, 0.17) },
    lensRadius: { value: positiveOr(options.lensRadius, 0.29) },
    gatewayProximity: { value: 0 },
    gatewayBrightness: { value: 0.5 },
    gatewayRayThickness: { value: 1 },
    gatewayOrbitSpeed: { value: 0.18 },
    gatewayTurbulence: { value: 0.025 },
    gatewayPointerBend: { value: 0 },
    gatewayParticleSpeed: { value: 0.22 },
    gatewayHighlightSpeed: { value: 0.12 },
    gatewayEyeFocus: { value: 0 },
    gatewayPulsePhase: { value: 0 },
    gatewayFlowPhase: { value: 0 },
    gatewayPointerLocal: { value: new THREE.Vector2() },
    gatewayPointerDirection: { value: new THREE.Vector2(1, 0) },
    gatewayPointerValid: { value: 0 },
    activationProgress: { value: 1 },
    activationCompression: { value: 0 },
    activationFocus: { value: 0 },
    activationRupture: { value: 0 },
    activationShockwave: { value: 0 },
    activationParticlePeel: { value: 0 },
    reducedMotion: { value: 0 }
  };
}

export function createGatewayVfxAssembly(
  options: GatewayVfxAssemblyOptions
): GatewayVfxAssembly {
  const quality = options.quality;
  const spec = gatewayVfxQualitySpecs[quality];
  const sharedUniforms = createSharedUniforms(options);
  const group = new THREE.Group();
  group.name = `warpkeep-gateway-vfx-${quality}`;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  const ribbonGeometry = createRibbonGeometry({
    layerCount: spec.ribbonCount,
    segments: spec.ribbonSegments,
    filament: false
  });
  const ribbonMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: sharedUniforms,
    vertexShader: gatewayRibbonVertexShader,
    fragmentShader: gatewayRibbonFragmentShader
  });
  const ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
  ribbonMesh.name = 'warpkeep-gateway-ribbons';
  ribbonMesh.position.z = 0.11;
  ribbonMesh.renderOrder = 3;
  ribbonMesh.frustumCulled = false;
  group.add(ribbonMesh);
  geometries.push(ribbonGeometry);
  materials.push(ribbonMaterial);

  const coreExtent = sharedUniforms.coreExtent.value;
  const coreGeometry = new THREE.PlaneGeometry(
    options.galaxyRadius * coreExtent * 2,
    options.galaxyRadius * coreExtent * 2
  );
  const coreMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: sharedUniforms,
    vertexShader: gatewayVfxVertexPassthrough,
    fragmentShader: gatewayEyeFragmentShader
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.name = 'warpkeep-gateway-eye-lens';
  coreMesh.position.z = 0.24;
  coreMesh.renderOrder = 4;
  group.add(coreMesh);
  geometries.push(coreGeometry);
  materials.push(coreMaterial);

  if (spec.filamentCount > 0) {
    const filamentGeometry = createRibbonGeometry({
      layerCount: spec.filamentCount,
      segments: spec.filamentSegments,
      filament: true
    });
    const filamentMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      uniforms: sharedUniforms,
      vertexShader: gatewayRibbonVertexShader,
      fragmentShader: gatewayRibbonFragmentShader
    });
    const filamentMesh = new THREE.Mesh(filamentGeometry, filamentMaterial);
    filamentMesh.name = 'warpkeep-gateway-filaments';
    filamentMesh.position.z = 0.28;
    filamentMesh.renderOrder = 5;
    filamentMesh.frustumCulled = false;
    group.add(filamentMesh);
    geometries.push(filamentGeometry);
    materials.push(filamentMaterial);
  }

  const particleGeometry = createParticleGeometry(spec.particleCount);
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: sharedUniforms,
    vertexShader: gatewayParticleVertexShader,
    fragmentShader: gatewayParticleFragmentShader
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = 'warpkeep-gateway-residue';
  particles.position.z = 0.31;
  particles.renderOrder = 6;
  particles.frustumCulled = false;
  group.add(particles);
  geometries.push(particleGeometry);
  materials.push(particleMaterial);

  let disposed = false;

  const update = (state: GatewayVfxFrameState) => {
    const response = state.response;
    const activation = state.activation;
    sharedUniforms.time.value = finiteOr(state.time, 0);
    sharedUniforms.gatewayProximity.value = finiteOr(response.proximity, 0);
    sharedUniforms.gatewayBrightness.value = finiteOr(response.brightness, 0.5) *
      finiteOr(activation.outerLuminanceScale, 1);
    sharedUniforms.gatewayRayThickness.value = finiteOr(response.rayThickness, 1);
    sharedUniforms.gatewayOrbitSpeed.value = finiteOr(response.orbitSpeed, 0.18);
    sharedUniforms.gatewayTurbulence.value = finiteOr(response.turbulence, 0.025);
    sharedUniforms.gatewayPointerBend.value = finiteOr(response.pointerBend, 0);
    sharedUniforms.gatewayParticleSpeed.value = finiteOr(response.particleSpeed, 0.22);
    sharedUniforms.gatewayHighlightSpeed.value = finiteOr(response.highlightSpeed, 0.12);
    sharedUniforms.gatewayEyeFocus.value = Math.min(
      1,
      Math.max(0, finiteOr(response.eyeFocus, 0) + finiteOr(activation.eyeFocus, 0) * 0.55)
    );
    sharedUniforms.gatewayPulsePhase.value = finiteOr(state.pulsePhase, 0);
    sharedUniforms.gatewayFlowPhase.value = finiteOr(state.flowPhase, 0);
    sharedUniforms.gatewayPointerLocal.value.copy(state.pointerLocal);
    sharedUniforms.gatewayPointerDirection.value.copy(state.pointerDirection);
    sharedUniforms.gatewayPointerValid.value = state.pointerValid ? 1 : 0;
    sharedUniforms.activationProgress.value = finiteOr(activation.progress, 1);
    sharedUniforms.activationCompression.value = finiteOr(activation.compression, 0);
    sharedUniforms.activationFocus.value = finiteOr(activation.focus, 0);
    sharedUniforms.activationRupture.value = finiteOr(activation.rupture, 0);
    sharedUniforms.activationShockwave.value = spec.shockwaveEnabled
      ? finiteOr(activation.shockwave, 0)
      : 0;
    sharedUniforms.activationParticlePeel.value = quality === 'reduced'
      ? 0
      : finiteOr(activation.particlePeel, 0);
    sharedUniforms.reducedMotion.value = state.reducedMotion ? 1 : 0;
  };

  const setPixelRatio = (pixelRatio: number) => {
    sharedUniforms.pixelRatio.value = Math.min(2, positiveOr(pixelRatio, 1));
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    group.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  return {
    group,
    materials,
    stats: {
      quality,
      particleCount: spec.particleCount,
      ribbonCount: spec.ribbonCount,
      filamentCount: spec.filamentCount,
      drawCalls: materials.length,
      incrementalDrawCalls: Math.max(0, materials.length - 1),
      materialCount: materials.length,
      geometryCount: geometries.length,
      renderTargetCount: 0
    },
    update,
    setPixelRatio,
    dispose
  };
}
