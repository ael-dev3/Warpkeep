import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from './BlackHoleGateway';
import { WarpkeepTitleScreenFallback } from './WarpkeepTitleScreenFallback';
import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { layoutBrutalistGlyphs } from './brutalistGlyphs';
import {
  calculateGatewayInteractionRadius,
  calculateGatewayProximity
} from './gatewayInteraction';
import {
  createGatewayPointerProjectionScratch,
  projectGatewayPointerToDisc,
  type GatewayPointerProjection
} from './gatewayPointerProjection';
import {
  createGatewayVfxAssembly,
  type GatewayVfxAssembly,
  type GatewayVfxFrameState
} from './gatewayVfx';
import {
  calculateGatewayActivationEnvelope,
  calculateGatewayVfxResponse,
  gatewayActivationSpec,
  gatewayVfxQualitySpecs,
  gatewayVfxResponseSpec,
  selectGatewayVfxQuality,
  type GatewayActivationEnvelope,
  type GatewayVfxQuality,
  type GatewayVfxResponse
} from './gatewayVfxSpec';
import { dampValue, isMousePointerType, normalizePointerPosition } from './titleInteraction';
import { createBrutalistGlyphGeometry } from './titleGeometry';
import { createConcreteTextures, type ConcreteTextureSet } from './titleTextures';
import { calculateTitleResponsiveLayout } from './titleLayout';
import { calculateGalaxyGrowth, createSpiralGalaxyLayout, titleSceneSpec } from './titleSceneSpec';
import './WarpkeepTitleScreen.css';

type PointLayer = {
  material: THREE.ShaderMaterial;
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
};

type GalaxyAssembly = {
  group: THREE.Group;
  parallaxGroup: THREE.Group;
  growthGroup: THREE.Group;
  spinGroup: THREE.Group;
  gatewayAnchor: THREE.Object3D;
  stars: PointLayer;
  dust: PointLayer;
  disc: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  discMaterial: THREE.ShaderMaterial;
};

type TitleAssembly = {
  group: THREE.Group;
  safeWidth: number;
};

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = Math.imul(1_664_525, state) + 1_013_904_223;
    return (state >>> 0) / 4_294_967_296;
  };
}

function createPointMaterial(
  pixelRatio: number,
  pointScale: number,
  opacity: number,
  flickerSpeed: number,
  softness = 0,
  coreFade = 0,
  warpStrength = 0
) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: pixelRatio },
      pointScale: { value: pointScale },
      maxPointSize: { value: titleSceneSpec.galaxy.maxPointSize },
      layerOpacity: { value: opacity },
      flickerSpeed: { value: flickerSpeed },
      softness: { value: softness },
      coreFade: { value: coreFade },
      warpStrength: { value: warpStrength },
      galaxyRadius: { value: titleSceneSpec.galaxy.radius },
      shadowRadius: { value: titleSceneSpec.core.shadowRadius },
      gatewayPointerLocal: { value: new THREE.Vector2() },
      gatewayPointerValid: { value: 0 },
      gatewayLocalDistortion: { value: 0 }
    },
    vertexShader: `
      attribute float phase;
      attribute float size;
      attribute float brightness;
      varying float vBrightness;
      varying float vPhase;
      varying float vCoreFade;
      varying vec3 vColor;
      uniform float time;
      uniform float pixelRatio;
      uniform float pointScale;
      uniform float maxPointSize;
      uniform float flickerSpeed;
      uniform float coreFade;
      uniform float warpStrength;
      uniform float galaxyRadius;
      uniform float shadowRadius;
      uniform vec2 gatewayPointerLocal;
      uniform float gatewayPointerValid;
      uniform float gatewayLocalDistortion;

      void main() {
        vBrightness = brightness;
        vPhase = phase;
        vColor = color;
        vec3 localPosition = position;
        vec2 normalizedPosition = localPosition.xy / galaxyRadius;
        float pointerLengthSquared = dot(gatewayPointerLocal, gatewayPointerLocal);
        if (
          warpStrength > 0.0 &&
          gatewayPointerValid > 0.5 &&
          gatewayLocalDistortion > 0.0
        ) {
          float along = clamp(
            dot(normalizedPosition, gatewayPointerLocal) / max(0.0004, pointerLengthSquared),
            0.0,
            1.0
          );
          vec2 nearest = gatewayPointerLocal * along;
          float fieldDistance = length(normalizedPosition - nearest);
          float lineField = 1.0 - smoothstep(0.035, 0.18, fieldDistance);
          lineField *= smoothstep(0.02, 0.22, along) *
            (1.0 - smoothstep(0.78, 1.0, along));
          float normalizedRadius = length(normalizedPosition);
          float coreField = smoothstep(
            shadowRadius * 0.72,
            shadowRadius * 1.45,
            normalizedRadius
          ) * (1.0 - smoothstep(0.07, 0.24, normalizedRadius));
          float centeredPointer = 1.0 - smoothstep(
            0.018,
            0.075,
            sqrt(pointerLengthSquared)
          );
          float field = max(lineField, coreField * centeredPointer);
          vec2 inward = -normalize(normalizedPosition + vec2(0.00001));
          vec2 tangent = vec2(-inward.y, inward.x);
          vec2 warp = (inward * 0.014 + tangent * 0.008) *
            field * gatewayLocalDistortion * warpStrength;
          localPosition.xy += warp * galaxyRadius;
          normalizedPosition = localPosition.xy / galaxyRadius;
        }
        float normalizedRadius = length(normalizedPosition);
        float coreVisibility = smoothstep(
          shadowRadius * 0.72,
          shadowRadius * 2.2,
          normalizedRadius
        );
        vCoreFade = mix(1.0, coreVisibility, coreFade);
        vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
        float flicker = 0.94 + 0.06 * sin(time * flickerSpeed + phase);
        float perspectiveSize = size * pixelRatio * pointScale * flicker / max(7.0, -viewPosition.z);
        gl_PointSize = clamp(perspectiveSize, 1.0, maxPointSize);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying float vPhase;
      varying float vCoreFade;
      varying vec3 vColor;
      uniform float time;
      uniform float layerOpacity;
      uniform float flickerSpeed;
      uniform float softness;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        float stellarCore = 1.0 - smoothstep(0.035, 0.5, radius);
        float horizontalFlare = exp(-abs(centered.y) * 40.0) *
          (1.0 - smoothstep(0.025, 0.48, abs(centered.x)));
        float verticalFlare = exp(-abs(centered.x) * 44.0) *
          (1.0 - smoothstep(0.025, 0.46, abs(centered.y)));
        float starShape = max(stellarCore, (horizontalFlare + verticalFlare) * 0.15);
        float dustShape = pow(max(0.0, 1.0 - radius * 2.0), 2.2);
        float pointShape = mix(starShape, dustShape, softness);
        float flicker = 0.95 + 0.05 * sin(time * flickerSpeed + vPhase);
        float alpha = pointShape * vBrightness * layerOpacity * flicker * vCoreFade;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createBackgroundStars(count: number, pixelRatio: number): PointLayer {
  const random = createRandom(0x4b454550);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const cold = new THREE.Color(titleSceneSpec.palette.coldStar);
  const violet = new THREE.Color('#a59bd2');
  const oldGold = new THREE.Color(titleSceneSpec.palette.oldGold);

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const brightSystem = random() > 0.966;
    const color = cold.clone().lerp(violet, random() * 0.3);
    if (random() > 0.94) {
      color.lerp(oldGold, 0.12 + random() * 0.12);
    }
    positions[i] = (random() - 0.5) * 48;
    positions[i + 1] = (random() - 0.5) * 30 + 1;
    positions[i + 2] = -8 - random() * 58;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = brightSystem ? 2.15 + random() * 1.5 : 0.5 + random() * 1.08;
    brightness[index] = brightSystem ? 0.7 + random() * 0.28 : 0.15 + random() * 0.56;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = createPointMaterial(pixelRatio, 86, 0.86, 0.38);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

function createGalaxyDiscMaterial(quality: GatewayVfxQuality) {
  const compactQuality = quality !== 'high';
  const fbmOctaves = gatewayVfxQualitySpecs[quality].noiseOctaves;
  const dustLaneNoise = compactQuality
    ? 'broadNoise'
    : 'fbm(point * 10.5 + vec2(4.3, -2.1))';
  const clumpNoise = compactQuality
    ? 'mix(broadNoise, fineNoise, 0.45)'
    : 'fbm(point * 13.5 + vec2(-3.7, 8.2))';
  const coreNoise = compactQuality
    ? 'fineNoise'
    : 'fbm(point * 23.0 + vec2(7.0, 3.0))';
  const peripheralNoise = compactQuality
    ? 'broadNoise'
    : 'fbm(point * 7.4 + vec2(-8.0, 5.0))';

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      purpleMix: { value: titleSceneSpec.galaxy.purpleMix },
      armCount: { value: titleSceneSpec.galaxy.armCount },
      spiralTurns: { value: titleSceneSpec.galaxy.spiralTurns },
      shineSpeed: { value: (Math.PI * 2) / titleSceneSpec.galaxy.shinePeriodSeconds },
      shadowRadius: { value: titleSceneSpec.core.shadowRadius },
      accretionRadius: { value: titleSceneSpec.core.accretionRadius },
      lensRadius: { value: titleSceneSpec.core.lensRadius },
      gatewayProximity: { value: 0 },
      gatewayPulsePhase: { value: 0 },
      gatewayFlowPhase: { value: 0 },
      gatewaySurge: { value: 0 },
      gatewaySurgeProgress: { value: 1 },
      reducedMotion: { value: 0 },
      gatewayPointerLocal: { value: new THREE.Vector2() },
      gatewayPointerValid: { value: 0 },
      gatewayLocalDistortion: { value: 0 },
      gatewayEyeFocus: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float purpleMix;
      uniform float armCount;
      uniform float spiralTurns;
      uniform float shineSpeed;
      uniform float shadowRadius;
      uniform float accretionRadius;
      uniform float lensRadius;
      uniform float gatewayProximity;
      uniform float gatewayPulsePhase;
      uniform float gatewayFlowPhase;
      uniform float gatewaySurge;
      uniform float gatewaySurgeProgress;
      uniform float reducedMotion;
      uniform vec2 gatewayPointerLocal;
      uniform float gatewayPointerValid;
      uniform float gatewayLocalDistortion;
      uniform float gatewayEyeFocus;

      const float TAU = 6.28318530718;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.52;
        mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
        for (int octave = 0; octave < ${fbmOctaves}; octave += 1) {
          value += valueNoise(point) * amplitude;
          point = turn * point * 2.03 + vec2(13.1, 7.7);
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 rawPoint = (vUv - vec2(0.5)) * 2.0;
        vec2 point = rawPoint;
        float pointerLengthSquared = dot(gatewayPointerLocal, gatewayPointerLocal);
        if (
          gatewayPointerValid > 0.5 &&
          gatewayLocalDistortion > 0.0
        ) {
          float along = clamp(
            dot(point, gatewayPointerLocal) / max(0.0004, pointerLengthSquared),
            0.0,
            1.0
          );
          vec2 nearest = gatewayPointerLocal * along;
          float fieldDistance = length(point - nearest);
          float lineField = 1.0 - smoothstep(0.035, 0.19, fieldDistance);
          lineField *= smoothstep(0.02, 0.2, along) *
            (1.0 - smoothstep(0.8, 1.0, along));
          float pointRadius = length(point);
          float coreField = smoothstep(
            shadowRadius * 0.72,
            shadowRadius * 1.45,
            pointRadius
          ) * (1.0 - smoothstep(0.07, 0.24, pointRadius));
          float centeredPointer = 1.0 - smoothstep(
            0.018,
            0.075,
            sqrt(pointerLengthSquared)
          );
          float field = max(lineField, coreField * centeredPointer);
          vec2 inward = -normalize(point + vec2(0.00001));
          vec2 tangent = vec2(-inward.y, inward.x);
          point += (inward * 0.026 + tangent * 0.016) * field * gatewayLocalDistortion;
        }
        float radius = length(point);
        float rawRadius = length(rawPoint);
        if (rawRadius > 1.045) discard;

        float broadNoise = fbm(point * 4.8 + vec2(time * 0.002, -time * 0.0015));
        float fineNoise = fbm(point * 17.0 - vec2(time * 0.003, time * 0.001));
        float warpedRadius = radius * (0.955 + broadNoise * 0.095);
        float angle = atan(point.y, point.x);
        float spiralPhase = angle * armCount -
          warpedRadius * spiralTurns * TAU * armCount +
          (broadNoise - 0.5) * 2.1;
        float armWave = 0.5 + 0.5 * cos(spiralPhase);
        float secondaryWave = 0.5 + 0.5 * cos(spiralPhase + 0.65 + fineNoise * 0.72);
        float arm = pow(smoothstep(0.31, 0.99, armWave), 2.05);
        float feathers = pow(smoothstep(0.58, 0.99, secondaryWave), 3.1);
        float edgeFade = 1.0 - smoothstep(0.74, 1.035, radius);
        float innerFade = smoothstep(0.035, 0.16, radius);
        float dustLane = smoothstep(0.48, 0.79, ${dustLaneNoise});
        float granularDust = pow(smoothstep(0.18, 0.94, fineNoise), 1.7);
        float clumpNoise = ${clumpNoise};
        float clumps = smoothstep(0.34, 0.76, clumpNoise);
        float armDensity = (arm * 0.72 + feathers * 0.28) *
          (0.5 + granularDust * 0.5) * (0.55 + clumps * 0.45);
        armDensity *= mix(1.0, 0.4, dustLane) * innerFade * edgeFade;

        float coreNoise = ${coreNoise};
        float coreDistance = rawRadius * (0.985 + (coreNoise - 0.5) * 0.04);
        float gatewayActivity = clamp(gatewayProximity, 0.0, 1.0);
        float gatewayActivity2 = gatewayActivity * gatewayActivity;
        float gatewayPulse = mix(
          0.72,
          0.5 + 0.5 * sin(gatewayPulsePhase),
          1.0 - reducedMotion
        );
        float shadow = 1.0 - smoothstep(
          shadowRadius * (0.84 - gatewayEyeFocus * 0.025),
          shadowRadius * (1.16 - gatewayEyeFocus * 0.035),
          rawRadius
        );
        float accretionWidth = 0.038 + coreNoise * 0.014;
        float accretion = exp(-pow((coreDistance - accretionRadius) / accretionWidth, 2.0));
        float lensing = exp(-pow((coreDistance - lensRadius) / 0.065, 2.0));
        float coreBloom = exp(-coreDistance * 8.2) * (1.0 - shadow * 0.86);
        float accretionFlux = 0.86 + 0.14 * sin(
          angle * 3.0 - gatewayFlowPhase + coreNoise * 2.4
        );
        float accretionGain = 1.0 + gatewayPulse * 0.08 +
          gatewayActivity * 0.12 + gatewayActivity2 * 0.08 + gatewaySurge * 0.14;
        accretion *= accretionFlux * accretionGain;
        lensing *= 1.0 + gatewayActivity * 0.04 +
          gatewayActivity2 * 0.1 + gatewaySurge * 0.1;
        coreBloom *= 1.0 + gatewayPulse * 0.04 +
          gatewayActivity * 0.13 + gatewaySurge * 0.08;

        float residueEnvelope =
          smoothstep(lensRadius * 0.82, lensRadius * 1.02, coreDistance) *
          (1.0 - smoothstep(lensRadius * 1.52, lensRadius * 1.88, coreDistance));
        float residueWave = 0.5 + 0.5 * sin(
          coreDistance * 34.0 - angle * 4.0 - gatewayFlowPhase +
          (fineNoise - 0.5) * 3.2
        );
        float residue = pow(smoothstep(0.62, 0.98, residueWave), 3.0) *
          (0.35 + clumps * 0.65) * residueEnvelope;
        float residueGain = 0.05 + gatewayPulse * 0.022 +
          gatewayActivity * 0.05 + gatewayActivity2 * 0.07 + gatewaySurge * 0.075;
        float surgeRadius = mix(
          accretionRadius * 0.9,
          lensRadius * 1.55,
          clamp(gatewaySurgeProgress, 0.0, 1.0)
        );
        float surgeWidth = mix(0.022, 0.047, clamp(gatewaySurgeProgress, 0.0, 1.0));
        float surgeRing = exp(-pow((coreDistance - surgeRadius) / surgeWidth, 2.0)) *
          gatewaySurge * (0.58 + fineNoise * 0.42);

        float shineWave = 0.5 + 0.5 * cos(
          angle * 2.0 - warpedRadius * 15.0 - time * shineSpeed
        );
        float shine = pow(shineWave, 13.0) * (0.25 + arm * 0.75) * edgeFade;
        float peripheralDust = ${peripheralNoise} * edgeFade;
        float density = armDensity * 0.36 + peripheralDust * 0.045 +
          coreBloom * 0.25 + accretion * 0.24 + lensing * 0.075 + shine * 0.06 +
          residue * residueGain + surgeRing * 0.11;
        density *= 1.0 - shadow * 0.9;

        vec3 coldIvory = vec3(0.91, 0.94, 1.0);
        vec3 deepViolet = vec3(0.45, 0.16, 0.75);
        vec3 lavender = vec3(0.78, 0.45, 1.0);
        vec3 oldGold = vec3(0.54, 0.45, 0.31);
        vec3 color = mix(coldIvory, deepViolet, purpleMix * (0.7 + radius * 0.42));
        color *= 0.72 + granularDust * 0.4;
        color += deepViolet * arm * (0.18 + purpleMix * 0.28);
        color += lavender * (accretion * 0.5 + shine * 0.36 + lensing * 0.24);
        color += deepViolet * accretion * (
          0.28 + gatewayPulse * 0.15 + gatewayActivity * 0.28
        );
        color += deepViolet * residue * (0.55 + gatewayActivity * 0.45);
        color += lavender * surgeRing * 0.46;
        color += oldGold * coreBloom * 0.16;
        color *= 1.0 - shadow * 0.94;

        float alpha = density * (0.9 + broadNoise * 0.2) * edgeFade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createGalaxyDust(layout: ReturnType<typeof createSpiralGalaxyLayout>, pixelRatio: number): PointLayer {
  const sourceCount = layout.phases.length;
  const count = Math.max(1, Math.floor(sourceCount * 0.48));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const violet = new THREE.Color('#7f3fb2');
  const ivory = new THREE.Color('#c6b5d8');
  const oldGold = new THREE.Color(titleSceneSpec.palette.oldGold);

  for (let index = 0; index < count; index += 1) {
    const source = (index * 11 + 3) % sourceCount;
    const sourceOffset = source * 3;
    const targetOffset = index * 3;
    const phase = layout.phases[source];
    const temperature = layout.temperature[source];
    const color = violet.clone().lerp(ivory, 0.08 + temperature * 0.12);
    if (source % 17 === 0) {
      color.lerp(oldGold, 0.12);
    }
    positions[targetOffset] = layout.positions[sourceOffset] + Math.cos(phase) * 0.035;
    positions[targetOffset + 1] = layout.positions[sourceOffset + 1] + Math.sin(phase) * 0.035;
    positions[targetOffset + 2] = layout.positions[sourceOffset + 2] - 0.035;
    colors[targetOffset] = color.r;
    colors[targetOffset + 1] = color.g;
    colors[targetOffset + 2] = color.b;
    phases[index] = phase;
    sizes[index] = 1.3 + layout.sizes[source] * 1.35;
    brightness[index] = 0.12 + layout.brightness[source] * 0.24;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = createPointMaterial(pixelRatio, 112, 0.62, 0.16, 0.92, 1, 0.76);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, material };
}

function createGalaxy(
  count: number,
  pixelRatio: number,
  initialQuality: GatewayVfxQuality
): GalaxyAssembly {
  const layout = createSpiralGalaxyLayout(count);
  const colors = new Float32Array(count * 3);
  const ivory = new THREE.Color('#e9e1eb');
  const coldWhite = new THREE.Color('#d7ddff');
  const mutedViolet = new THREE.Color('#b068e8');

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const temperature = layout.temperature[index];
    const color = mutedViolet.clone().lerp(coldWhite, 0.18 + temperature * 0.28);
    color.lerp(ivory, 0.08);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(layout.positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('phase', new THREE.BufferAttribute(layout.phases, 1));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(layout.sizes, 1));
  starGeometry.setAttribute('brightness', new THREE.BufferAttribute(layout.brightness, 1));
  starGeometry.computeBoundingSphere();

  const starMaterial = createPointMaterial(pixelRatio, 96, 0.72, 0.3, 0, 1, 0.46);
  const starPoints = new THREE.Points(starGeometry, starMaterial);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = 2;
  const stars = { points: starPoints, material: starMaterial };
  const dust = createGalaxyDust(layout, pixelRatio);

  const discMaterial = createGalaxyDiscMaterial(initialQuality);
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(titleSceneSpec.galaxy.radius * 2, titleSceneSpec.galaxy.radius * 2),
    discMaterial
  );
  disc.position.z = -0.075;
  disc.renderOrder = 0;

  const gatewayAnchor = new THREE.Object3D();
  gatewayAnchor.name = 'warpkeep-gateway-anchor';
  gatewayAnchor.position.z = 0.24;

  const group = new THREE.Group();
  group.position.set(0, 1.55, -18);
  const parallaxGroup = new THREE.Group();
  const growthGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.rotation.x = Math.acos(titleSceneSpec.galaxy.verticalScale);
  spinGroup.add(disc, dust.points, stars.points, gatewayAnchor);
  tiltGroup.add(spinGroup);
  growthGroup.add(tiltGroup);
  parallaxGroup.add(growthGroup);
  group.add(parallaxGroup);

  return {
    group,
    parallaxGroup,
    growthGroup,
    spinGroup,
    gatewayAnchor,
    stars,
    dust,
    disc,
    discMaterial
  };
}

function createTitleAssembly(textures: ConcreteTextureSet): TitleAssembly {
  const group = new THREE.Group();
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concrete,
    map: textures.color,
    bumpMap: textures.bump,
    bumpScale: titleSceneSpec.title.bumpScale,
    roughnessMap: textures.roughness,
    roughness: titleSceneSpec.title.roughness,
    metalness: titleSceneSpec.title.metalness,
    emissive: 0x0c0b10,
    emissiveIntensity: 0.012
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concreteShadow,
    map: textures.color,
    bumpMap: textures.bump,
    bumpScale: titleSceneSpec.title.bumpScale * 0.72,
    roughnessMap: textures.roughness,
    roughness: titleSceneSpec.title.sideRoughness,
    metalness: titleSceneSpec.title.metalness,
    emissive: 0x080810,
    emissiveIntensity: 0.01
  });
  const layout = layoutBrutalistGlyphs(
    titleSceneSpec.title.text,
    titleSceneSpec.title.height
  );
  const createdGeometries: THREE.BufferGeometry[] = [];

  try {
    layout.placements.forEach(({ character, glyph, x, index }) => {
      const geometry = createBrutalistGlyphGeometry(glyph, {
        height: titleSceneSpec.title.height,
        depth: titleSceneSpec.title.depth,
        bevelSize: titleSceneSpec.title.bevelSize,
        bevelThickness: titleSceneSpec.title.bevelThickness,
        uvOffset: [index * 0.173, index * 0.097]
      });
      createdGeometries.push(geometry);

      const mesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
      mesh.name = `warpkeep-title-${character}-${index}`;
      mesh.position.x = x - layout.width * 0.5;
      group.add(mesh);
    });
  } catch (error) {
    createdGeometries.forEach((geometry) => geometry.dispose());
    faceMaterial.dispose();
    sideMaterial.dispose();
    throw error;
  }

  group.position.set(0, -1.52, 0.28);
  const safeWidth = layout.width + titleSceneSpec.title.depth * 0.22;
  return { group, safeWidth };
}

function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, textures: THREE.Texture[]) {
  const geometries = new Set<string>();
  const materials = new Set<string>();

  scene.traverse((object) => {
    const drawable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (drawable.geometry && !geometries.has(drawable.geometry.uuid)) {
      geometries.add(drawable.geometry.uuid);
      drawable.geometry.dispose();
    }

    const objectMaterials = drawable.material
      ? Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material]
      : [];

    objectMaterials.forEach((material) => {
      if (!materials.has(material.uuid)) {
        materials.add(material.uuid);
        material.dispose();
      }
    });
  });

  textures.forEach((texture) => texture.dispose());
  renderer.renderLists.dispose();
  renderer.dispose();
}

export function WarpkeepTitleScreen3D() {
  const screenRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const gatewayRef = useRef<BlackHoleGatewayHandle>(null);
  const gatewayActivationSequenceRef = useRef(0);
  const gatewayFocusedRef = useRef(false);
  const reducedActivationRenderRef = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);

  const handleGatewayActivate = useCallback(() => {
    // Future: navigate to the Warpkeep game menu once that destination exists.
    gatewayActivationSequenceRef.current += 1;
    reducedActivationRenderRef.current?.();
  }, []);

  const handleGatewayFocusChange = useCallback((focused: boolean) => {
    gatewayFocusedRef.current = focused;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    const interactionSurface = screenRef.current;
    if (!container || !interactionSurface) {
      return undefined;
    }

    if (!canUseWebGL()) {
      setFallback(true);
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let gatewayVfx: GatewayVfxAssembly | null = null;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
    let pointerResetHandler: (() => void) | null = null;
    let contextLostHandler: ((event: Event) => void) | null = null;
    let visibilityChangeHandler: (() => void) | null = null;
    let reducedMotionQuery: MediaQueryList | null = null;
    let reducedMotionChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
    let reducedActivationTimer = 0;
    let disposed = false;
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    const pointerScreen = { x: 0, y: 0, active: false };
    const textures: THREE.Texture[] = [];

    const teardown = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      window.clearTimeout(reducedActivationTimer);
      reducedActivationRenderRef.current = null;
      resizeObserver?.disconnect();
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (pointerMoveHandler) {
        interactionSurface.removeEventListener('pointermove', pointerMoveHandler);
      }
      if (pointerResetHandler) {
        interactionSurface.removeEventListener('pointerleave', pointerResetHandler);
        window.removeEventListener('blur', pointerResetHandler);
      }
      if (contextLostHandler && renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', contextLostHandler);
      }
      if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
      }
      if (reducedMotionQuery && reducedMotionChangeHandler) {
        reducedMotionQuery.removeEventListener('change', reducedMotionChangeHandler);
      }
      gatewayVfx?.dispose();
      gatewayVfx = null;
      if (scene && renderer) {
        disposeScene(scene, renderer, textures);
      }
      gatewayRef.current?.setProjectedPosition(0, 0, 0, 0, false);
      renderer?.domElement.remove();
    };

    try {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      let prefersReducedMotion = reducedMotionQuery.matches;
      const initialWidth = Math.max(1, Math.round(container.clientWidth));
      const initialHeight = Math.max(1, Math.round(container.clientHeight));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(titleSceneSpec.palette.void);

      const camera = new THREE.PerspectiveCamera(39, initialWidth / initialHeight, 0.1, 100);
      camera.position.set(0, 0.18, 10.8);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(initialWidth, initialHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.className = 'warpkeep-title-canvas';
      const initialGatewayVfxQuality = selectGatewayVfxQuality({
        viewportWidth: initialWidth,
        viewportHeight: initialHeight,
        reducedMotion: prefersReducedMotion,
        rendererMaxTextureSize: renderer.capabilities.maxTextureSize,
        supportsHighpFragment: renderer.capabilities.getMaxPrecision('highp') === 'highp'
      });
      let activeGatewayVfxQuality = initialGatewayVfxQuality;
      const compactGalaxyQuality = initialGatewayVfxQuality !== 'high';
      const initialSurfaceBounds = interactionSurface.getBoundingClientRect();
      const pointerSurfaceBounds = {
        left: initialSurfaceBounds.left,
        top: initialSurfaceBounds.top,
        width: Math.max(1, initialSurfaceBounds.width),
        height: Math.max(1, initialSurfaceBounds.height)
      };
      renderer.domElement.dataset.gatewayVfxQuality = activeGatewayVfxQuality;
      container.appendChild(renderer.domElement);
      contextLostHandler = (event: Event) => {
        event.preventDefault();
        teardown();
        setFallback(true);
      };
      renderer.domElement.addEventListener('webglcontextlost', contextLostHandler);

      const finePointerEnabled = window.matchMedia('(pointer: fine)').matches;
      const attachPointerInteraction = () => {
        if (prefersReducedMotion || !finePointerEnabled || pointerMoveHandler) {
          return;
        }

        pointerMoveHandler = (event: PointerEvent) => {
          if (!isMousePointerType(event.pointerType)) {
            return;
          }
          const normalized = normalizePointerPosition(
            event.clientX,
            event.clientY,
            pointerSurfaceBounds
          );
          pointerTarget.x = normalized.x;
          pointerTarget.y = normalized.y;
          pointerScreen.x = event.clientX - pointerSurfaceBounds.left;
          pointerScreen.y = event.clientY - pointerSurfaceBounds.top;
          pointerScreen.active = true;
        };
        pointerResetHandler = () => {
          pointerTarget.x = 0;
          pointerTarget.y = 0;
          pointerScreen.active = false;
        };
        interactionSurface.addEventListener('pointermove', pointerMoveHandler, { passive: true });
        interactionSurface.addEventListener('pointerleave', pointerResetHandler);
        window.addEventListener('blur', pointerResetHandler);
      };
      const detachPointerInteraction = () => {
        if (pointerMoveHandler) {
          interactionSurface.removeEventListener('pointermove', pointerMoveHandler);
          pointerMoveHandler = null;
        }
        if (pointerResetHandler) {
          interactionSurface.removeEventListener('pointerleave', pointerResetHandler);
          window.removeEventListener('blur', pointerResetHandler);
          pointerResetHandler = null;
        }
        pointerTarget.x = 0;
        pointerTarget.y = 0;
        pointerCurrent.x = 0;
        pointerCurrent.y = 0;
        pointerScreen.active = false;
      };
      attachPointerInteraction();

      const backgroundStars = createBackgroundStars(
        compactGalaxyQuality
          ? titleSceneSpec.galaxy.mobileBackgroundStars
          : titleSceneSpec.galaxy.desktopBackgroundStars,
        pixelRatio
      );
      scene.add(backgroundStars.points);

      const galaxy = createGalaxy(
        compactGalaxyQuality
          ? titleSceneSpec.galaxy.mobileParticleCount
          : titleSceneSpec.galaxy.desktopParticleCount,
        pixelRatio,
        activeGatewayVfxQuality
      );
      const webglRenderer = renderer;
      const updateGatewayVfxDataset = (assembly: GatewayVfxAssembly) => {
        webglRenderer.domElement.dataset.gatewayVfxQuality = assembly.stats.quality;
        webglRenderer.domElement.dataset.gatewayVfxDrawCalls = String(assembly.stats.drawCalls);
        webglRenderer.domElement.dataset.gatewayVfxIncrementalDrawCalls = String(
          assembly.stats.incrementalDrawCalls
        );
        webglRenderer.domElement.dataset.gatewayVfxParticles = String(assembly.stats.particleCount);
      };
      const createGatewayAssembly = (
        quality: GatewayVfxQuality,
        nextPixelRatio: number
      ) => {
        const assembly = createGatewayVfxAssembly({
          quality,
          pixelRatio: nextPixelRatio,
          galaxyRadius: titleSceneSpec.galaxy.radius,
          shadowRadius: titleSceneSpec.core.shadowRadius,
          accretionRadius: titleSceneSpec.core.accretionRadius,
          lensRadius: titleSceneSpec.core.lensRadius
        });
        galaxy.spinGroup.add(assembly.group);
        updateGatewayVfxDataset(assembly);
        return assembly;
      };
      const syncGatewayQuality = (
        quality: GatewayVfxQuality,
        nextPixelRatio: number
      ) => {
        if (gatewayVfx && quality === activeGatewayVfxQuality) {
          gatewayVfx.setPixelRatio(nextPixelRatio);
          return;
        }

        gatewayVfx?.dispose();
        if (quality !== activeGatewayVfxQuality) {
          const previousDiscMaterial = galaxy.discMaterial;
          galaxy.discMaterial = createGalaxyDiscMaterial(quality);
          galaxy.disc.material = galaxy.discMaterial;
          previousDiscMaterial.dispose();
        }
        activeGatewayVfxQuality = quality;
        gatewayVfx = createGatewayAssembly(quality, nextPixelRatio);
      };
      gatewayVfx = createGatewayAssembly(activeGatewayVfxQuality, pixelRatio);
      scene.add(galaxy.group);

      const concreteTextures = createConcreteTextures();
      const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      [concreteTextures.color, concreteTextures.bump, concreteTextures.roughness].forEach((texture) => {
        texture.anisotropy = maxAnisotropy;
        textures.push(texture);
      });
      const title = createTitleAssembly(concreteTextures);
      scene.add(title.group);

      scene.add(new THREE.AmbientLight(0x111522, 0.3));
      scene.add(new THREE.HemisphereLight(0xe6e2d6, 0x050711, 0.72));

      const keyLight = new THREE.DirectionalLight(0xfff7e8, 2.45);
      keyLight.position.set(-3.4, 5.8, 8.6);
      scene.add(keyLight);

      const sweepLight = new THREE.SpotLight(0xf7f2e8, 48, 36, 0.64, 0.92, 1.25);
      sweepLight.position.set(-5.8, 4.2, 8.5);
      sweepLight.target.position.set(0, -0.7, 0);
      scene.add(sweepLight, sweepLight.target);

      const violetRimLight = new THREE.PointLight(0x7651a3, 21, 28, 1.75);
      violetRimLight.position.set(0, 1.3, -4.8);
      scene.add(violetRimLight);

      const neutralFillLight = new THREE.PointLight(0xb8b0a5, 5.5, 22, 1.65);
      neutralFillLight.position.set(-6, -1.4, 4.5);
      scene.add(neutralFillLight);

      let titleBaseY = -1.52;
      let galaxyBaseY = 1.55;
      let galaxyLayoutScale = 1;
      let cameraTargetY = -0.42;
      let titleRestYaw = THREE.MathUtils.degToRad(-1.1);
      let cameraDriftX = 0.1;
      let viewportWidth = initialWidth;
      let viewportHeight = initialHeight;
      let gatewayInteractionRadius = THREE.MathUtils.clamp(
        calculateGatewayInteractionRadius(
          initialWidth,
          initialHeight,
          titleSceneSpec.gateway.interactionRadiusRatio
        ),
        titleSceneSpec.gateway.minInteractionRadiusPx,
        titleSceneSpec.gateway.maxInteractionRadiusPx
      );
      const resize = () => {
        if (!renderer || !scene || disposed) {
          return;
        }

        const width = Math.max(1, Math.round(container.clientWidth));
        const height = Math.max(1, Math.round(container.clientHeight));
        const surfaceBounds = interactionSurface.getBoundingClientRect();
        const aspect = width / height;
        const portrait = aspect < 0.78;
        const shortLandscape = !portrait && height < 460;
        const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
        viewportWidth = width;
        viewportHeight = height;
        pointerSurfaceBounds.left = surfaceBounds.left;
        pointerSurfaceBounds.top = surfaceBounds.top;
        pointerSurfaceBounds.width = Math.max(1, surfaceBounds.width);
        pointerSurfaceBounds.height = Math.max(1, surfaceBounds.height);
        gatewayInteractionRadius = THREE.MathUtils.clamp(
          calculateGatewayInteractionRadius(
            width,
            height,
            titleSceneSpec.gateway.interactionRadiusRatio
          ),
          titleSceneSpec.gateway.minInteractionRadiusPx,
          titleSceneSpec.gateway.maxInteractionRadiusPx
        );
        renderer.setPixelRatio(nextPixelRatio);
        renderer.setSize(width, height, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        const titleDistance = camera.position.z - title.group.position.z;
        const titleVisibleHeight = 2 * titleDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const titleVisibleWidth = titleVisibleHeight * aspect;
        const titleLayout = calculateTitleResponsiveLayout(
          width,
          height,
          titleVisibleWidth,
          title.safeWidth
        );
        title.group.scale.setScalar(titleLayout.scale);
        titleBaseY = titleLayout.baseY;
        cameraTargetY = titleLayout.cameraTargetY;
        titleRestYaw = titleLayout.restYawRadians;
        cameraDriftX = titleLayout.cameraDriftX;

        const galaxyDistance = camera.position.z - galaxy.group.position.z;
        const galaxyVisibleHeight = 2 * galaxyDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const galaxyVisibleWidth = galaxyVisibleHeight * aspect;
        const desiredGalaxyWidth = galaxyVisibleWidth * (
          portrait
            ? titleSceneSpec.galaxy.portraitViewportWidth
            : titleSceneSpec.galaxy.desktopViewportWidth
        );
        const desiredGalaxyHeight = galaxyVisibleHeight * (
          portrait
            ? titleSceneSpec.galaxy.portraitViewportHeight
            : titleSceneSpec.galaxy.desktopViewportHeight
        );
        const galaxyDiameter = titleSceneSpec.galaxy.radius * 2;
        galaxyLayoutScale = THREE.MathUtils.clamp(
          Math.min(
            desiredGalaxyWidth / galaxyDiameter,
            desiredGalaxyHeight / (galaxyDiameter * titleSceneSpec.galaxy.verticalScale)
          ),
          0.42,
          2.25
        );
        galaxy.group.scale.setScalar(galaxyLayoutScale);
        galaxyBaseY = portrait
          ? 2.8
          : shortLandscape
            ? titleSceneSpec.galaxy.shortLandscapeBaseY
            : 1.55;
        galaxy.group.position.y = galaxyBaseY;

        [backgroundStars.material, galaxy.stars.material, galaxy.dust.material].forEach((material) => {
          material.uniforms.pixelRatio.value = nextPixelRatio;
        });
        const nextGatewayVfxQuality = selectGatewayVfxQuality({
          viewportWidth: width,
          viewportHeight: height,
          reducedMotion: prefersReducedMotion,
          rendererMaxTextureSize: renderer.capabilities.maxTextureSize,
          supportsHighpFragment: renderer.capabilities.getMaxPrecision('highp') === 'highp'
        });
        syncGatewayQuality(nextGatewayVfxQuality, nextPixelRatio);
      };

      let previousFrameTime = performance.now();
      let visibleElapsed = 0;
      let pageVisible = !document.hidden;
      const titleRestPitch = THREE.MathUtils.degToRad(-2.1);
      const gatewayWorldPosition = new THREE.Vector3();
      const gatewayProjectedPosition = new THREE.Vector3();
      const pointerProjectionScratch = createGatewayPointerProjectionScratch();
      const pointerProjection: GatewayPointerProjection = { x: 0, y: 0, valid: false };
      const pointerLocal = new THREE.Vector2();
      const pointerDirection = new THREE.Vector2(1, 0);
      let pointerProjectionInfluence = 0;
      let gatewayProximity = 0;
      let gatewayPulsePhase = 0.42;
      let gatewayFlowPhase = 0;
      let handledActivationSequence = gatewayActivationSequenceRef.current;
      let surgeElapsed: number = gatewayActivationSpec.durationSeconds;
      const gatewayResponse: GatewayVfxResponse = {
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
      const pointerGatewayResponse: GatewayVfxResponse = {
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
      const activationEnvelope: GatewayActivationEnvelope = {
        phase: 'idle',
        progress: 1,
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
      const gatewayFrameState: GatewayVfxFrameState = {
        time: 0,
        delta: 0,
        proximity: 0,
        pulsePhase: gatewayPulsePhase,
        flowPhase: gatewayFlowPhase,
        response: gatewayResponse,
        activation: activationEnvelope,
        pointerLocal,
        pointerDirection,
        pointerValid: false,
        reducedMotion: prefersReducedMotion
      };
      const render = () => {
        animationFrame = 0;
        if (!renderer || !scene || disposed) {
          return;
        }

        const frameTime = performance.now();
        const rawDelta = Math.max(0, (frameTime - previousFrameTime) / 1000);
        previousFrameTime = frameTime;
        const visibleDelta = prefersReducedMotion || !pageVisible
          ? 0
          : rawDelta;
        const dampingDelta = Math.min(0.05, visibleDelta);
        visibleElapsed += visibleDelta;
        const shaderTime = prefersReducedMotion ? 7.5 : visibleElapsed;

        if (!prefersReducedMotion) {
          pointerCurrent.x = dampValue(
            pointerCurrent.x,
            pointerTarget.x,
            dampingDelta,
            titleSceneSpec.interaction.damping
          );
          pointerCurrent.y = dampValue(
            pointerCurrent.y,
            pointerTarget.y,
            dampingDelta,
            titleSceneSpec.interaction.damping
          );
        }

        backgroundStars.material.uniforms.time.value = shaderTime;
        galaxy.stars.material.uniforms.time.value = shaderTime;
        galaxy.dust.material.uniforms.time.value = shaderTime;
        galaxy.discMaterial.uniforms.time.value = shaderTime;

        backgroundStars.points.rotation.z = visibleElapsed * 0.00065;
        backgroundStars.points.rotation.x = pointerCurrent.y * 0.003;
        backgroundStars.points.rotation.y = pointerCurrent.x * -0.004;

        galaxy.spinGroup.rotation.z = -0.13 +
          visibleElapsed * (Math.PI * 2) / titleSceneSpec.galaxy.rotationPeriodSeconds;
        galaxy.growthGroup.scale.setScalar(calculateGalaxyGrowth(visibleElapsed));
        galaxy.parallaxGroup.rotation.x =
          pointerCurrent.y * titleSceneSpec.interaction.galaxyRotationX;
        galaxy.parallaxGroup.rotation.y =
          pointerCurrent.x * -titleSceneSpec.interaction.galaxyRotationY;
        galaxy.group.position.x =
          Math.sin(visibleElapsed * 0.05) * 0.065 -
          pointerCurrent.x * titleSceneSpec.interaction.galaxyTravelX;
        galaxy.group.position.y =
          galaxyBaseY + pointerCurrent.y * titleSceneSpec.interaction.galaxyTravelY;

        title.group.rotation.y =
          titleRestYaw + Math.sin(visibleElapsed * 0.1) * 0.008 +
          pointerCurrent.x * titleSceneSpec.interaction.titleRotationY;
        title.group.rotation.x =
          titleRestPitch + Math.sin(visibleElapsed * 0.075 + 0.7) * 0.0028 -
          pointerCurrent.y * titleSceneSpec.interaction.titleRotationX;
        title.group.position.y = titleBaseY + Math.sin(visibleElapsed * 0.13) * 0.018;

        const lightCycle = (shaderTime / titleSceneSpec.title.shinePeriodSeconds) * Math.PI * 2;
        sweepLight.position.x =
          Math.sin(lightCycle) * 6.8 +
          pointerCurrent.x * titleSceneSpec.interaction.lightTravelX;
        sweepLight.position.y =
          4.1 + Math.cos(lightCycle * 0.72) * 0.52 +
          pointerCurrent.y * titleSceneSpec.interaction.lightTravelY;
        sweepLight.target.position.set(
          pointerCurrent.x * 1.1,
          titleBaseY + pointerCurrent.y * 0.32,
          0
        );
        sweepLight.intensity = 46 + Math.sin(lightCycle + 0.4) * 5;
        keyLight.position.x = -3.4 + pointerCurrent.x * 2.1;
        keyLight.position.y = 5.8 + pointerCurrent.y * 1.15;
        violetRimLight.position.x = pointerCurrent.x * 2.6;
        violetRimLight.position.y = 1.3 + pointerCurrent.y * 1.2;
        neutralFillLight.position.x = -6 + pointerCurrent.x * 0.65;

        camera.position.x =
          Math.sin(visibleElapsed * 0.052) * cameraDriftX +
          pointerCurrent.x * titleSceneSpec.interaction.cameraTravelX;
        camera.position.y =
          0.18 + Math.cos(visibleElapsed * 0.046) * 0.04 +
          pointerCurrent.y * titleSceneSpec.interaction.cameraTravelY;
        camera.lookAt(
          pointerCurrent.x * titleSceneSpec.interaction.cameraTargetX,
          cameraTargetY + pointerCurrent.y * titleSceneSpec.interaction.cameraTargetY,
          -1.4
        );

        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        galaxy.gatewayAnchor.getWorldPosition(gatewayWorldPosition);
        gatewayProjectedPosition.copy(gatewayWorldPosition).project(camera);
        const gatewayX = (gatewayProjectedPosition.x * 0.5 + 0.5) * viewportWidth;
        const gatewayY = (-gatewayProjectedPosition.y * 0.5 + 0.5) * viewportHeight;
        const gatewayVisible =
          gatewayProjectedPosition.z >= -1 &&
          gatewayProjectedPosition.z <= 1;
        gatewayRef.current?.setProjectedPosition(
          gatewayX,
          gatewayY,
          viewportWidth,
          viewportHeight,
          gatewayVisible
        );

        const pointerProximity = !prefersReducedMotion && pointerScreen.active
          ? calculateGatewayProximity(
            pointerScreen.x,
            pointerScreen.y,
            gatewayX,
            gatewayY,
            gatewayInteractionRadius
          )
          : 0;
        const gatewayTarget = !prefersReducedMotion && gatewayFocusedRef.current
          ? Math.max(pointerProximity, 0.72)
          : pointerProximity;
        const gatewayDampingResponse = gatewayTarget > gatewayProximity
          ? titleSceneSpec.gateway.proximityRiseResponse
          : titleSceneSpec.gateway.proximitySettleResponse;
        gatewayProximity = prefersReducedMotion
          ? 0
          : dampValue(gatewayProximity, gatewayTarget, dampingDelta, gatewayDampingResponse);

        if (!prefersReducedMotion && pointerScreen.active) {
          projectGatewayPointerToDisc(
            pointerCurrent.x,
            pointerCurrent.y,
            camera,
            galaxy.disc,
            galaxy.spinGroup,
            titleSceneSpec.galaxy.radius,
            pointerProjection,
            pointerProjectionScratch
          );
        } else {
          pointerProjection.x = 0;
          pointerProjection.y = 0;
          pointerProjection.valid = false;
        }
        const projectedX = pointerProjection.valid
          ? THREE.MathUtils.clamp(pointerProjection.x, -1.25, 1.25)
          : 0;
        const projectedY = pointerProjection.valid
          ? THREE.MathUtils.clamp(pointerProjection.y, -1.25, 1.25)
          : 0;
        pointerLocal.x = dampValue(pointerLocal.x, projectedX, dampingDelta, 9.2);
        pointerLocal.y = dampValue(pointerLocal.y, projectedY, dampingDelta, 9.2);
        pointerProjectionInfluence = dampValue(
          pointerProjectionInfluence,
          pointerProjection.valid ? 1 : 0,
          dampingDelta,
          pointerProjection.valid ? 8.4 : 4.2
        );
        const pointerLocalLength = pointerLocal.length();
        if (pointerLocalLength > 0.0001) {
          pointerDirection.set(
            pointerLocal.x / pointerLocalLength,
            pointerLocal.y / pointerLocalLength
          );
        }

        calculateGatewayVfxResponse(
          gatewayProximity,
          activeGatewayVfxQuality,
          gatewayResponse
        );
        calculateGatewayVfxResponse(
          pointerProximity,
          activeGatewayVfxQuality,
          pointerGatewayResponse
        );
        gatewayResponse.pointerBend = pointerGatewayResponse.pointerBend;
        gatewayResponse.localDistortion = pointerGatewayResponse.localDistortion;

        const gatewayActivity = gatewayResponse.proximitySquared;
        gatewayPulsePhase += visibleDelta * THREE.MathUtils.lerp(
          (Math.PI * 2) / titleSceneSpec.gateway.idlePulsePeriodSeconds,
          (Math.PI * 2) / titleSceneSpec.gateway.activePulsePeriodSeconds,
          gatewayActivity
        );
        gatewayFlowPhase += visibleDelta * THREE.MathUtils.lerp(
          titleSceneSpec.gateway.idleFlowRate,
          titleSceneSpec.gateway.activeFlowRate,
          gatewayProximity * (0.65 + gatewayProximity * 0.35)
        );

        if (handledActivationSequence !== gatewayActivationSequenceRef.current) {
          handledActivationSequence = gatewayActivationSequenceRef.current;
          surgeElapsed = prefersReducedMotion ? 0.16 : 0;
        } else if (!prefersReducedMotion) {
          surgeElapsed = Math.min(
            gatewayActivationSpec.durationSeconds,
            surgeElapsed + visibleDelta
          );
        }
        calculateGatewayActivationEnvelope(surgeElapsed, activationEnvelope);
        const pointerValid = pointerProjectionInfluence > 0.015 &&
          pointerProximity > gatewayVfxResponseSpec.pointerBendThreshold;
        const localDistortion = Math.max(
          gatewayResponse.localDistortion,
          activationEnvelope.distortion * (activeGatewayVfxQuality === 'high' ? 0.16 : 0.09)
        );
        const activeQualitySpec = gatewayVfxQualitySpecs[activeGatewayVfxQuality];
        const discPointerValid = pointerValid && activeQualitySpec.pointerDistortionEnabled;
        const starPointerValid = pointerValid && activeQualitySpec.starDistortionEnabled;
        const discMaterial = galaxy.discMaterial;
        discMaterial.uniforms.gatewayProximity.value = gatewayProximity;
        discMaterial.uniforms.gatewayPulsePhase.value = gatewayPulsePhase;
        discMaterial.uniforms.gatewayFlowPhase.value = gatewayFlowPhase;
        discMaterial.uniforms.gatewaySurge.value = activationEnvelope.rupture;
        discMaterial.uniforms.gatewaySurgeProgress.value = activationEnvelope.progress;
        discMaterial.uniforms.reducedMotion.value = prefersReducedMotion ? 1 : 0;
        discMaterial.uniforms.gatewayPointerLocal.value.copy(pointerLocal);
        discMaterial.uniforms.gatewayPointerValid.value = discPointerValid ? 1 : 0;
        discMaterial.uniforms.gatewayLocalDistortion.value = discPointerValid
          ? localDistortion
          : 0;
        galaxy.dust.material.uniforms.gatewayPointerLocal.value.copy(pointerLocal);
        galaxy.dust.material.uniforms.gatewayPointerValid.value = discPointerValid ? 1 : 0;
        galaxy.dust.material.uniforms.gatewayLocalDistortion.value = discPointerValid
          ? localDistortion
          : 0;
        galaxy.stars.material.uniforms.gatewayPointerLocal.value.copy(pointerLocal);
        galaxy.stars.material.uniforms.gatewayPointerValid.value = starPointerValid ? 1 : 0;
        galaxy.stars.material.uniforms.gatewayLocalDistortion.value = starPointerValid
          ? localDistortion
          : 0;
        galaxy.discMaterial.uniforms.gatewayEyeFocus.value = Math.min(
          1,
          gatewayResponse.eyeFocus + activationEnvelope.eyeFocus * 0.55
        );

        gatewayFrameState.time = shaderTime;
        gatewayFrameState.delta = visibleDelta;
        gatewayFrameState.proximity = gatewayProximity;
        gatewayFrameState.pulsePhase = gatewayPulsePhase;
        gatewayFrameState.flowPhase = gatewayFlowPhase;
        gatewayFrameState.pointerValid = pointerValid;
        gatewayFrameState.reducedMotion = prefersReducedMotion;
        gatewayVfx?.update(gatewayFrameState);

        violetRimLight.intensity = 19.5 + Math.sin(shaderTime * 0.36) * 2 +
          gatewayResponse.brightness * 5 + activationEnvelope.rupture * 3.2;
        renderer.render(scene, camera);

        if (!prefersReducedMotion && pageVisible) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      reducedActivationRenderRef.current = () => {
        if (!prefersReducedMotion || disposed) {
          return;
        }
        window.clearTimeout(reducedActivationTimer);
        render();
        reducedActivationTimer = window.setTimeout(() => {
          if (disposed || !prefersReducedMotion) {
            return;
          }
          surgeElapsed = gatewayActivationSpec.durationSeconds;
          render();
        }, 180);
      };

      visibilityChangeHandler = () => {
        pageVisible = !document.hidden;
        previousFrameTime = performance.now();
        if (pageVisible && !prefersReducedMotion && !animationFrame) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };
      document.addEventListener('visibilitychange', visibilityChangeHandler);

      const handleResize = () => {
        resize();
        if (prefersReducedMotion) {
          render();
        }
      };

      reducedMotionChangeHandler = (event: MediaQueryListEvent) => {
        if (disposed || prefersReducedMotion === event.matches) {
          return;
        }

        prefersReducedMotion = event.matches;
        window.clearTimeout(reducedActivationTimer);
        reducedActivationTimer = 0;
        handledActivationSequence = gatewayActivationSequenceRef.current;
        surgeElapsed = gatewayActivationSpec.durationSeconds;
        previousFrameTime = performance.now();
        if (prefersReducedMotion) {
          detachPointerInteraction();
          if (animationFrame) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
          }
          resize();
          render();
        } else {
          resize();
          attachPointerInteraction();
          if (!animationFrame) {
            animationFrame = window.requestAnimationFrame(render);
          }
        }
      };
      reducedMotionQuery.addEventListener('change', reducedMotionChangeHandler);

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      resize();
      render();

      return teardown;
    } catch (error) {
      teardown();
      console.error('Warpkeep brutalist title screen setup failed:', error);
      setFallback(true);
      return undefined;
    }
  }, []);

  if (fallback) {
    return <WarpkeepTitleScreenFallback />;
  }

  return (
    <main ref={screenRef} className="warpkeep-title-screen" aria-label="Warpkeep title screen">
      <div ref={mountRef} className="warpkeep-title-canvas-shell" aria-hidden="true" />
      <h1 className="sr-only">{titleSceneSpec.title.text}</h1>
      <BlackHoleGateway
        ref={gatewayRef}
        onActivate={handleGatewayActivate}
        onFocusChange={handleGatewayFocusChange}
        autoDismissMs={titleSceneSpec.gateway.noticeDurationMs}
      />
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}
