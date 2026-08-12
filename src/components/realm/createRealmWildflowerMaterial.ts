import * as THREE from 'three';

import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';

export const REALM_WILDFLOWER_SHADER_CACHE_KEY =
  'warpkeep-wildflower-v2-alpha-cutout-analytic-bend-normal-three-r185';
export const REALM_WILDFLOWER_MAX_WIND_SWAY = 0.035;
/** Conservative 3D radius after slope-aligned local wind is restored to world space. */
export const REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS = 0.05;

export type RealmWildflowerMaterial = Readonly<{
  material: THREE.MeshStandardMaterial;
  setTime: (seconds: number) => boolean;
  setVisible: (visible: boolean) => void;
  activateShaderFallback: (reason: string) => void;
  getShaderTelemetry: () => RealmWildflowerShaderTelemetry;
  dispose: () => void;
}>;

export type RealmWildflowerShaderTelemetry = Readonly<{
  fallbackActive: boolean;
  fallbackCount: number;
  fallbackReason: string | null;
}>;

const VERTEX_DECLARATIONS = `
attribute vec2 flowerCardData;
attribute float flowerPhase;
attribute float flowerWindScale;
attribute float flowerCoverage;
varying vec2 vFlowerCardData;
varying float vFlowerCoverage;
varying vec3 vFlowerBendSlopeWorld;
uniform float uFlowerTime;
uniform vec2 uFlowerWindDirection;
uniform float uFlowerWindStrength;
uniform float uFlowerGlobalVisibility;
`;

const FRAGMENT_DECLARATIONS = `
varying vec2 vFlowerCardData;
varying float vFlowerCoverage;
varying vec3 vFlowerBendSlopeWorld;
float realmWildflowerCoverage() {
  float vertical = clamp(vFlowerCardData.y, 0.0, 1.0);
  float stem = (1.0 - smoothstep(0.15, 0.28, abs(vFlowerCardData.x)))
    * (1.0 - smoothstep(0.66, 0.82, vertical));
  vec2 headUv = vec2(vFlowerCardData.x, (vertical - 0.83) * 5.3);
  float petals = 1.0 - smoothstep(0.48, 0.94, length(headUv));
  return clamp(max(stem, petals) * vFlowerCoverage, 0.0, 1.0);
}
`;

export function injectRealmWildflowerVertexShader(vertexShader: string) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_WILDFLOWER_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  }
  const transform = `
${marker}
vFlowerCardData = flowerCardData;
vFlowerCoverage = clamp(flowerCoverage * uFlowerGlobalVisibility, 0.0, 1.0);
vec4 flowerWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
vec2 flowerWorldDirection = normalize(uFlowerWindDirection + vec2(0.00001));
mat3 flowerInstanceBasis = mat3(modelMatrix * instanceMatrix);
mat2 flowerLocalToWorldXZ = mat2(flowerInstanceBasis[0].xz, flowerInstanceBasis[2].xz);
float flowerBasisDeterminant = determinant(flowerLocalToWorldXZ);
mat2 flowerWorldToLocalXZ = abs(flowerBasisDeterminant) > 0.000001
  ? inverse(flowerLocalToWorldXZ)
  : mat2(1.0);
vec2 flowerLocalDirection = flowerWorldToLocalXZ * flowerWorldDirection;
float flowerBend = sin(
  dot(flowerWorldPosition.xz, flowerWorldDirection) * 1.18
  + uFlowerTime * 1.24
  + flowerPhase * 0.18
) * flowerWindScale * uFlowerWindStrength * ${REALM_WILDFLOWER_MAX_WIND_SWAY.toFixed(3)};
transformed.xz += flowerLocalDirection * flowerBend * pow(max(flowerCardData.y, 0.0), 1.85);
float flowerBendDerivative = 1.85 * pow(max(flowerCardData.y, 0.0), 0.85);
vec3 flowerLocalBendSlope = vec3(
  flowerLocalDirection.x,
  0.0,
  flowerLocalDirection.y
) * flowerBend * flowerBendDerivative;
vec3 flowerWorldBendSlope = mat3(modelMatrix * instanceMatrix)
  * flowerLocalBendSlope;
float flowerWorldHeightScale = max(
  length(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 1.0, 0.0)),
  0.0001
);
vFlowerBendSlopeWorld = flowerWorldBendSlope / flowerWorldHeightScale;
`;
  return `${VERTEX_DECLARATIONS}\n${vertexShader.replace(marker, transform)}`;
}

export function injectRealmWildflowerFragmentShader(fragmentShader: string) {
  const colourMarker = '#include <color_fragment>';
  const normalMarker = '#include <normal_fragment_maps>';
  const alphaMarker = fragmentShader.includes('#include <alphahash_fragment>')
    ? '#include <alphahash_fragment>'
    : fragmentShader.includes('#include <alphatest_fragment>')
      ? '#include <alphatest_fragment>'
      : '#include <opaque_fragment>';
  if (
    !fragmentShader.includes(colourMarker)
    || !fragmentShader.includes(normalMarker)
    || !fragmentShader.includes(alphaMarker)
  ) {
    throw new Error('REALM_WILDFLOWER_SHADER_FRAGMENT_CONTRACT_CHANGED');
  }
  const colour = `
${colourMarker}
float flowerVertical = clamp(vFlowerCardData.y, 0.0, 1.0);
vec3 flowerStem = vec3(0.19, 0.34, 0.105);
diffuseColor.rgb *= mix(flowerStem, vec3(1.0), smoothstep(0.70, 0.88, flowerVertical));
diffuseColor.a *= realmWildflowerCoverage();
`;
  const normal = `
${normalMarker}
float flowerNormalBendWeight = smoothstep(0.08, 1.0, vFlowerCardData.y);
vec3 flowerBendSlopeView = (
  viewMatrix * vec4(vFlowerBendSlopeWorld, 0.0)
).xyz;
normal = normalize(
  normal - flowerBendSlopeView * faceDirection * flowerNormalBendWeight
);
nonPerturbedNormal = normal;
`;
  return `${FRAGMENT_DECLARATIONS}\n${fragmentShader
    .replace(colourMarker, colour)
    .replace(normalMarker, normal)}`;
}

export function createRealmWildflowerMaterial(
  windStrength: number,
  alphaToCoverage = false
): RealmWildflowerMaterial {
  const useAlphaToCoverage = alphaToCoverage === true;
  const useAlphaHash = !useAlphaToCoverage;
  const uniforms = Object.freeze({
    uFlowerTime: { value: 0 },
    uFlowerWindDirection: {
      value: new THREE.Vector2(REALM_PREVAILING_WIND.x, REALM_PREVAILING_WIND.z)
    },
    uFlowerWindStrength: {
      value: Math.max(0, Number.isFinite(windStrength) ? windStrength : 0)
    },
    uFlowerGlobalVisibility: { value: 1 }
  });
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: false,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    dithering: true,
    transparent: false,
    depthWrite: true,
    depthTest: true
  });
  // Coverage must be consumed once: combining alpha hash with MSAA
  // alpha-to-coverage would square sparse flower/LOD coverage.
  (material as THREE.MeshStandardMaterial & { alphaHash?: boolean }).alphaHash = useAlphaHash;
  (material as THREE.MeshStandardMaterial & { alphaToCoverage?: boolean }).alphaToCoverage =
    useAlphaToCoverage;
  material.userData.realmWildflowerUniforms = uniforms;
  material.userData.realmWildflowerAlphaHash = useAlphaHash;
  material.userData.realmWildflowerAlphaToCoverage = useAlphaToCoverage;
  let shaderFallbackActive = false;
  let shaderFallbackCount = 0;
  let shaderFallbackReason: string | null = null;
  const activateShaderFallback = (error: unknown) => {
    if (shaderFallbackActive) return;
    shaderFallbackActive = true;
    shaderFallbackCount += 1;
    shaderFallbackReason = error instanceof Error
      ? error.message
      : typeof error === 'string' && error.length > 0
        ? error
        : 'REALM_WILDFLOWER_SHADER_INJECTION_FAILED';
    material.userData.realmWildflowerShaderFallbackActive = true;
    material.userData.realmWildflowerShaderFallbackCount = shaderFallbackCount;
    material.userData.realmWildflowerShaderFallbackReason = shaderFallbackReason;
    // The unmodified standard shader cannot synthesize the procedural stem
    // and petal cutout. Hide this optional accent layer fail-closed rather
    // than rendering opaque crossed rectangles for even a later repack.
    material.visible = false;
    material.needsUpdate = true;
  };
  material.userData.realmWildflowerShaderFallbackActive = false;
  material.userData.realmWildflowerShaderFallbackCount = 0;
  material.userData.realmWildflowerShaderFallbackReason = null;
  material.customProgramCacheKey = () => shaderFallbackActive
    ? `${REALM_WILDFLOWER_SHADER_CACHE_KEY}:static-fallback`
    : REALM_WILDFLOWER_SHADER_CACHE_KEY;
  material.onBeforeCompile = (shader) => {
    if (shaderFallbackActive) return;
    const originalVertexShader = shader.vertexShader;
    const originalFragmentShader = shader.fragmentShader;
    try {
      shader.vertexShader = injectRealmWildflowerVertexShader(originalVertexShader);
      shader.fragmentShader = injectRealmWildflowerFragmentShader(originalFragmentShader);
      Object.assign(shader.uniforms, uniforms);
    } catch (error) {
      shader.vertexShader = originalVertexShader;
      // onBeforeCompile runs after the current render list has been built, so
      // material.visible=false alone would allow one opaque crossed-card
      // frame. A minimal discard shader makes the triggering frame fail closed.
      shader.fragmentShader = 'void main() { discard; }';
      activateShaderFallback(error);
    }
  };
  let disposed = false;
  let lastTime = 0;
  return Object.freeze({
    material,
    setTime: (seconds) => {
      if (
        disposed
        || shaderFallbackActive
        || uniforms.uFlowerWindStrength.value <= 0
        || !Number.isFinite(seconds)
      ) {
        return false;
      }
      const next = Math.max(0, seconds);
      if (next === lastTime) return false;
      lastTime = next;
      uniforms.uFlowerTime.value = next;
      return true;
    },
    setVisible: (visible) => {
      if (disposed) return;
      uniforms.uFlowerGlobalVisibility.value = visible ? 1 : 0;
      material.visible = visible && !shaderFallbackActive;
    },
    activateShaderFallback: (reason) => {
      if (disposed) return;
      activateShaderFallback(reason);
    },
    getShaderTelemetry: () => Object.freeze({
      fallbackActive: shaderFallbackActive,
      fallbackCount: shaderFallbackCount,
      fallbackReason: shaderFallbackReason
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
    }
  });
}
