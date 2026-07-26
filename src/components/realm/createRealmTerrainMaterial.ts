import * as THREE from 'three';

export const REALM_TERRAIN_THREE_SHADER_CONTRACT = 'three-r185';
export const REALM_TERRAIN_SHADER_CACHE_KEY =
  `warpkeep-crafted-lowlands-terrain-v1-${REALM_TERRAIN_THREE_SHADER_CONTRACT}`;

export type RealmTerrainMaterialTelemetry = Readonly<{
  shaderContract: string;
  shaderEnhanced: boolean;
  shaderFallbackActive: boolean;
  compileAttemptCount: number;
}>;

export type RealmTerrainMaterial = Readonly<{
  material: THREE.MeshStandardMaterial;
  getTelemetry: () => RealmTerrainMaterialTelemetry;
  getTelemetryRevision: () => number;
  dispose: () => void;
}>;

const VERTEX_DECLARATIONS = `
attribute vec4 terrainSurfaceCue;
varying vec4 vTerrainSurfaceCue;
`;

const FRAGMENT_DECLARATIONS = `
varying vec4 vTerrainSurfaceCue;
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
    `${marker}\nvTerrainSurfaceCue = terrainSurfaceCue;`
  )}`;
}

export function injectRealmTerrainFragmentShader(fragmentShader: string) {
  const colorMarker = '#include <color_fragment>';
  const roughnessMarker = '#include <roughnessmap_fragment>';
  if (
    !fragmentShader.includes(colorMarker)
    || !fragmentShader.includes(roughnessMarker)
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
diffuseColor.rgb *= 1.0 - terrainHollow * 0.085;
diffuseColor.rgb *= 1.0 + terrainCrest * 0.032;
diffuseColor.rgb *= 1.0 - terrainVegetation * 0.025;
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
`;
  return `${FRAGMENT_DECLARATIONS}\n${fragmentShader
    .replace(colorMarker, color)
    .replace(roughnessMarker, roughness)}`;
}

/**
 * One draw, one material, no per-frame mutation. If the pinned Three.js chunk
 * markers drift, the callback retains the untouched MeshStandardMaterial
 * shaders instead of throwing and blanking the Realm.
 */
export function createRealmTerrainMaterial(): RealmTerrainMaterial {
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
      shader.fragmentShader = injectRealmTerrainFragmentShader(originalFragmentShader);
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
  material.customProgramCacheKey = () => REALM_TERRAIN_SHADER_CACHE_KEY;
  material.userData.realmTerrainShaderContract = REALM_TERRAIN_THREE_SHADER_CONTRACT;

  return Object.freeze({
    material,
    getTelemetry: () => Object.freeze({
      shaderContract: REALM_TERRAIN_THREE_SHADER_CONTRACT,
      shaderEnhanced,
      shaderFallbackActive,
      compileAttemptCount
    }),
    getTelemetryRevision: () => telemetryRevision,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
    }
  });
}
