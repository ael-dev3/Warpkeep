import * as THREE from 'three';

import {
  REALM_LIVING_ENVIRONMENT_REVISION,
  REALM_LIVING_GUST_GLSL,
  REALM_LIVING_WIND_GLSL
} from './realmLivingEnvironment';

export const REALM_FOREST_WIND_SHADER_CONTRACT = `realm-forest-wind-v1-${REALM_LIVING_ENVIRONMENT_REVISION}-three-r185`;
export const REALM_FOREST_LIVING_CANOPY_MOTION_STATE = 'shared-gust' as const;

export type RealmForestWindMaterialController = Readonly<{
  setTime: (seconds: number) => boolean;
  isActive: () => boolean;
  getTelemetry: () => Readonly<{
    enabled: boolean;
    fallbackActive: boolean;
    fallbackCount: number;
    fallbackReason: string | null;
  }>;
}>;

export function injectRealmForestWindVertexShader(vertexShader: string) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_FOREST_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  }
  return `
attribute float realmForestWindWeight;
attribute float realmForestWindPhase;
uniform float uRealmForestTime;
${REALM_LIVING_GUST_GLSL}
${vertexShader.replace(marker, `${marker}
  mat4 realmForestWorldMatrix = modelMatrix;
  #ifdef USE_INSTANCING
    realmForestWorldMatrix = modelMatrix * instanceMatrix;
  #endif
  vec4 realmForestWorldPosition = realmForestWorldMatrix * vec4(position, 1.0);
  vec2 realmForestWindDirection = ${REALM_LIVING_WIND_GLSL};
  mat3 realmForestBasis = mat3(realmForestWorldMatrix);
  mat2 realmForestLocalToWorldXZ = mat2(realmForestBasis[0].xz, realmForestBasis[2].xz);
  float realmForestBasisDeterminant = determinant(realmForestLocalToWorldXZ);
  mat2 realmForestWorldToLocalXZ = abs(realmForestBasisDeterminant) > 0.000001
    ? inverse(realmForestLocalToWorldXZ)
    : mat2(1.0);
  float realmForestGust = realmLivingGust(realmForestWorldPosition.xz, uRealmForestTime);
  float realmForestSway = sin(
    uRealmForestTime * 0.72
      + realmForestWindPhase * 6.283185
      + dot(realmForestWorldPosition.xz, realmForestWindDirection) * 0.11
  ) * mix(0.28, 1.0, realmForestGust);
  float realmForestRootedWeight = realmForestWindWeight * realmForestWindWeight;
  transformed.xz += (realmForestWorldToLocalXZ * realmForestWindDirection)
    * realmForestSway * realmForestRootedWeight * 0.028;
`)}`;
}

export function applyRealmForestWindMaterial(
  material: THREE.MeshStandardMaterial,
  enabled: boolean
): RealmForestWindMaterialController {
  const uniforms = { uRealmForestTime: { value: 0 } };
  let fallbackActive = false;
  let fallbackCount = 0;
  let fallbackReason: string | null = null;
  let disposed = false;
  let lastTime = 0;
  material.userData.realmForestWindEnabled = enabled;
  material.userData.realmForestWindUniforms = uniforms;
  material.userData.realmForestWindFallbackActive = false;
  material.userData.realmForestWindFallbackCount = 0;
  material.userData.realmForestWindFallbackReason = null;
  if (enabled) {
    material.onBeforeCompile = (shader) => {
      if (fallbackActive) return;
      const originalVertexShader = shader.vertexShader;
      try {
        shader.vertexShader = injectRealmForestWindVertexShader(originalVertexShader);
        shader.uniforms.uRealmForestTime = uniforms.uRealmForestTime;
      } catch (error) {
        shader.vertexShader = originalVertexShader;
        fallbackActive = true;
        fallbackCount += 1;
        fallbackReason = error instanceof Error
          ? error.message
          : 'REALM_FOREST_SHADER_INJECTION_FAILED';
        material.userData.realmForestWindFallbackActive = true;
        material.userData.realmForestWindFallbackCount = fallbackCount;
        material.userData.realmForestWindFallbackReason = fallbackReason;
      }
    };
    material.customProgramCacheKey = () => fallbackActive
      ? `${REALM_FOREST_WIND_SHADER_CONTRACT}:static-fallback`
      : REALM_FOREST_WIND_SHADER_CONTRACT;
  }
  return Object.freeze({
    setTime: (seconds) => {
      if (
        disposed
        || !enabled
        || fallbackActive
        || !Number.isFinite(seconds)
      ) return false;
      const safeSeconds = Math.max(0, seconds);
      if (Math.abs(safeSeconds - lastTime) < 0.000001) return false;
      lastTime = safeSeconds;
      uniforms.uRealmForestTime.value = safeSeconds;
      return true;
    },
    isActive: () => !disposed && enabled && !fallbackActive,
    getTelemetry: () => Object.freeze({
      enabled,
      fallbackActive,
      fallbackCount,
      fallbackReason
    })
  });
}
