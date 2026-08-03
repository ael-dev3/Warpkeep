import * as THREE from 'three';

import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';
import type { RealmQuality } from './realmQuality';

export const REALM_TERRAIN_THREE_SHADER_CONTRACT = 'three-r185';
export type RealmTerrainFineReliefMode = 'two-band' | 'one-band' | 'none';

function finiteGlslFloatLiteral(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error('REALM_TERRAIN_GLSL_FLOAT_MUST_BE_FINITE');
  }
  const literal = String(value);
  return Number.isInteger(value) ? `${literal}.0` : literal;
}

/**
 * ECMAScript number stringification is locale independent and round-trips to
 * the exact source number. The shader therefore cannot drift from the shared
 * renderer-neutral wind contract through a separately rounded literal.
 */
export const REALM_TERRAIN_PREVAILING_WIND_GLSL = `vec2(${
  finiteGlslFloatLiteral(REALM_PREVAILING_WIND.x)
}, ${finiteGlslFloatLiteral(REALM_PREVAILING_WIND.z)})`;

export function realmTerrainFineReliefMode(
  quality: RealmQuality
): RealmTerrainFineReliefMode {
  if (quality === 'high') return 'two-band';
  if (quality === 'balanced') return 'one-band';
  return 'none';
}

export function realmTerrainShaderCacheKey(quality: RealmQuality) {
  return [
    'warpkeep-living-realm-terrain-v3',
    REALM_TERRAIN_THREE_SHADER_CONTRACT,
    realmTerrainFineReliefMode(quality)
  ].join('-');
}

export const REALM_TERRAIN_SHADER_CACHE_KEY =
  realmTerrainShaderCacheKey('balanced');

export type RealmTerrainMaterialTelemetry = Readonly<{
  shaderContract: string;
  shaderEnhanced: boolean;
  shaderFallbackActive: boolean;
  compileAttemptCount: number;
  fineReliefMode: RealmTerrainFineReliefMode;
}>;

export type RealmTerrainMaterial = Readonly<{
  material: THREE.MeshStandardMaterial;
  getTelemetry: () => RealmTerrainMaterialTelemetry;
  getTelemetryRevision: () => number;
  dispose: () => void;
}>;

const VERTEX_DECLARATIONS = `
attribute vec4 terrainSurfaceCue;
attribute float terrainSnowCoverage;
attribute float terrainSandCoverage;
varying vec4 vTerrainSurfaceCue;
varying float vTerrainSnowCoverage;
varying float vTerrainSandCoverage;
varying vec2 vTerrainWorldXZ;
`;

const FRAGMENT_DECLARATIONS = `
varying vec4 vTerrainSurfaceCue;
varying float vTerrainSnowCoverage;
varying float vTerrainSandCoverage;
varying vec2 vTerrainWorldXZ;
`;

/**
 * Inject stable per-vertex Lowlands cues into the pinned standard material.
 * Exported separately so the exact Three.js chunk contract stays testable.
 */
export function injectRealmTerrainVertexShader(vertexShader: string) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_TERRAIN_SHADER_VERTEX_CONTRACT_CHANGED');
  }
  return `${VERTEX_DECLARATIONS}\n${vertexShader.replace(
    marker,
    `${marker}
vTerrainSurfaceCue = terrainSurfaceCue;
vTerrainSnowCoverage = terrainSnowCoverage;
vTerrainSandCoverage = terrainSandCoverage;
vTerrainWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`
  )}`;
}

function climateReliefShader(mode: RealmTerrainFineReliefMode) {
  if (mode === 'none') return '#include <normal_fragment_maps>';
  const secondBand = mode === 'two-band'
    ? `
float warpkeepSnowCrossPhase =
  dot(vTerrainWorldXZ, warpkeepSnowCrossWind) * 4.35 + 1.17;
float warpkeepSnowCrossFootprint = fwidth(warpkeepSnowCrossPhase);
float warpkeepSnowCrossFilter =
  1.0 - smoothstep(0.24, 1.05, warpkeepSnowCrossFootprint);
warpkeepSnowGradient += warpkeepSnowCrossWind
  * cos(warpkeepSnowCrossPhase)
  * 0.016
  * warpkeepSnowCrossFilter;
`
    : '';
  return `
#include <normal_fragment_maps>
vec2 warpkeepSnowWind = ${REALM_TERRAIN_PREVAILING_WIND_GLSL};
vec2 warpkeepSnowCrossWind = vec2(-warpkeepSnowWind.y, warpkeepSnowWind.x);
float warpkeepSnowPhase = dot(vTerrainWorldXZ, warpkeepSnowWind) * 7.15;
float warpkeepSnowFootprint = fwidth(warpkeepSnowPhase);
float warpkeepSnowFilter = 1.0 - smoothstep(0.22, 1.0, warpkeepSnowFootprint);
vec2 warpkeepSnowGradient = warpkeepSnowWind
  * cos(warpkeepSnowPhase)
  * ${mode === 'two-band' ? '0.026' : '0.017'}
  * warpkeepSnowFilter;
${secondBand}
float warpkeepSnowReliefCoverage =
  smoothstep(0.18, 0.82, clamp(vTerrainSnowCoverage, 0.0, 1.0));
mat3 warpkeepViewRotation = mat3(viewMatrix);
vec3 warpkeepMacroNormalWorld = normalize(vec3(
  dot(warpkeepViewRotation[0], normal),
  dot(warpkeepViewRotation[1], normal),
  dot(warpkeepViewRotation[2], normal)
));
float warpkeepMacroNormalY = max(warpkeepMacroNormalWorld.y, 0.08);
vec2 warpkeepMacroSlope = vec2(
  -warpkeepMacroNormalWorld.x / warpkeepMacroNormalY,
  -warpkeepMacroNormalWorld.z / warpkeepMacroNormalY
);
vec2 warpkeepSandWind = ${REALM_TERRAIN_PREVAILING_WIND_GLSL};
vec2 warpkeepSandCrossWind = vec2(-warpkeepSandWind.y, warpkeepSandWind.x);
float warpkeepSandPhase =
  dot(vTerrainWorldXZ, warpkeepSandWind) * ${mode === 'two-band' ? '3.25' : '5.15'} + 0.63;
float warpkeepSandFootprint = fwidth(warpkeepSandPhase);
float warpkeepSandFilter = 1.0 - smoothstep(0.20, 0.96, warpkeepSandFootprint);
vec2 warpkeepSandGradient = warpkeepSandWind
  * cos(warpkeepSandPhase)
  * ${mode === 'two-band' ? '0.023' : '0.015'}
  * warpkeepSandFilter;
${mode === 'two-band' ? `
float warpkeepSandFinePhase =
  dot(vTerrainWorldXZ, warpkeepSandWind) * 8.65
  + dot(vTerrainWorldXZ, warpkeepSandCrossWind) * 0.55;
float warpkeepSandFineFootprint = fwidth(warpkeepSandFinePhase);
float warpkeepSandFineFilter =
  1.0 - smoothstep(0.18, 0.88, warpkeepSandFineFootprint);
warpkeepSandGradient += warpkeepSandWind
  * cos(warpkeepSandFinePhase)
  * 0.011
  * warpkeepSandFineFilter;
` : ''}
float warpkeepSandReliefCoverage =
  smoothstep(0.16, 0.80, clamp(vTerrainSandCoverage, 0.0, 1.0));
vec2 warpkeepCombinedSlope =
  warpkeepMacroSlope
  + warpkeepSnowGradient * warpkeepSnowReliefCoverage
  + warpkeepSandGradient * warpkeepSandReliefCoverage;
normal = normalize(
  warpkeepViewRotation
    * normalize(vec3(-warpkeepCombinedSlope.x, 1.0, -warpkeepCombinedSlope.y))
);
`;
}

export function injectRealmTerrainFragmentShader(
  fragmentShader: string,
  fineReliefMode: RealmTerrainFineReliefMode = 'one-band'
) {
  const colorMarker = '#include <color_fragment>';
  const roughnessMarker = '#include <roughnessmap_fragment>';
  const normalMarker = '#include <normal_fragment_maps>';
  if (
    !fragmentShader.includes(colorMarker)
    || !fragmentShader.includes(roughnessMarker)
    || !fragmentShader.includes(normalMarker)
  ) {
    throw new Error('REALM_TERRAIN_SHADER_FRAGMENT_CONTRACT_CHANGED');
  }
  const color = `
${colorMarker}
float terrainSlope = clamp(vTerrainSurfaceCue.x, 0.0, 1.0);
float terrainHollow = clamp(vTerrainSurfaceCue.y, 0.0, 1.0);
float terrainCrest = clamp(-vTerrainSurfaceCue.y, 0.0, 1.0);
float terrainVegetation = clamp(vTerrainSurfaceCue.z, 0.0, 1.0);
float terrainWetness = clamp(vTerrainSurfaceCue.w, 0.0, 1.0);
float terrainSnow = clamp(vTerrainSnowCoverage, 0.0, 1.0);
float terrainSand = clamp(vTerrainSandCoverage, 0.0, 1.0);
diffuseColor.rgb *= 1.0 - terrainHollow * 0.085;
diffuseColor.rgb *= 1.0 + terrainCrest * 0.032;
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.99, 1.035, 0.97),
  terrainVegetation * 0.16
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.86, 0.91, 0.96),
  terrainWetness * 0.075
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.98, 0.965, 0.925),
  terrainSlope * 0.055
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.965, 0.99, 1.025),
  terrainSnow * (0.035 + terrainHollow * 0.025)
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  diffuseColor.rgb * vec3(1.025, 0.99, 0.945),
  terrainSand * (0.04 + terrainCrest * 0.02)
);
`;
  const roughness = `
${roughnessMarker}
roughnessFactor = clamp(
  roughnessFactor
    - clamp(vTerrainSurfaceCue.w, 0.0, 1.0) * 0.12
    + clamp(vTerrainSurfaceCue.x, 0.0, 1.0) * 0.025,
  0.72,
  1.0
);
roughnessFactor = clamp(
  mix(roughnessFactor, 0.91 + terrainHollow * 0.035, terrainSnow * 0.72),
  0.78,
  0.98
);
roughnessFactor = clamp(
  mix(
    roughnessFactor,
    0.955 - terrainHollow * 0.045 - terrainWetness * 0.025,
    terrainSand * 0.76
  ),
  0.78,
  0.985
);
`;
  return `${FRAGMENT_DECLARATIONS}\n${fragmentShader
    .replace(colorMarker, color)
    .replace(roughnessMarker, roughness)
    .replace(normalMarker, climateReliefShader(fineReliefMode))}`;
}

/**
 * One draw, one material, no per-frame mutation. If the pinned Three.js chunk
 * markers drift, the callback retains the untouched MeshStandardMaterial
 * shaders instead of throwing and blanking the Realm.
 */
export function createRealmTerrainMaterial(
  quality: RealmQuality = 'balanced'
): RealmTerrainMaterial {
  const fineReliefMode = realmTerrainFineReliefMode(quality);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    dithering: true
  });
  let compileAttemptCount = 0;
  let telemetryRevision = 0;
  let shaderEnhanced = false;
  let shaderFallbackActive = false;
  let disposed = false;

  material.onBeforeCompile = (shader) => {
    compileAttemptCount += 1;
    const originalVertexShader = shader.vertexShader;
    const originalFragmentShader = shader.fragmentShader;
    try {
      shader.vertexShader = injectRealmTerrainVertexShader(originalVertexShader);
      shader.fragmentShader = injectRealmTerrainFragmentShader(
        originalFragmentShader,
        fineReliefMode
      );
      shaderEnhanced = true;
      shaderFallbackActive = false;
    } catch {
      // The standard material remains a complete, playable fallback.
      shader.vertexShader = originalVertexShader;
      shader.fragmentShader = originalFragmentShader;
      shaderEnhanced = false;
      shaderFallbackActive = true;
    }
    telemetryRevision += 1;
  };
  material.customProgramCacheKey = () => realmTerrainShaderCacheKey(quality);
  material.userData.realmTerrainShaderContract = REALM_TERRAIN_THREE_SHADER_CONTRACT;
  material.userData.realmTerrainFineReliefMode = fineReliefMode;

  return Object.freeze({
    material,
    getTelemetry: () => Object.freeze({
      shaderContract: REALM_TERRAIN_THREE_SHADER_CONTRACT,
      shaderEnhanced,
      shaderFallbackActive,
      compileAttemptCount,
      fineReliefMode
    }),
    getTelemetryRevision: () => telemetryRevision,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
    }
  });
}
