import * as THREE from 'three';

import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';
import { REALM_SUN_DIRECTION } from './createRealmEnvironment';

export const REALM_GRASS_THREE_SHADER_CONTRACT = 'three-r185';
export const REALM_GRASS_SHADER_CACHE_KEY = `warpkeep-procedural-grass-v3-natural-gust-v6-bounded-tips-thin-blade-lighting-v1-${REALM_GRASS_THREE_SHADER_CONTRACT}`;
export const REALM_GRASS_MAX_WIND_SWAY = 0.075;
export const REALM_GRASS_CROSS_WIND_RATIO = 0.16;
export const REALM_GRASS_MAX_PRIMARY_BEND = REALM_GRASS_MAX_WIND_SWAY / Math.hypot(1, REALM_GRASS_CROSS_WIND_RATIO);
/**
 * Conservative world-space culling allowance for wind-deformed blades.
 * The shader caps horizontal sway at 0.075, but slope-aligned instances can
 * add a vertical tangent component. The accepted grass slope ceiling is 0.78,
 * so 0.10 safely covers 0.075 * hypot(1, 0.78) (about 0.095).
 */
export const REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS = 0.1;
export const REALM_GRASS_INTERACTION_TRANSITION_SECONDS = 0.14;
export const REALM_GRASS_NORMAL_BEND_RESPONSE = 2.35;

export type RealmGrassUniforms = Readonly<{
  uGrassTime: THREE.IUniform<number>;
  uGrassWindDirection: THREE.IUniform<THREE.Vector2>;
  uGrassWindStrength: THREE.IUniform<number>;
  uGrassSunDirection: THREE.IUniform<THREE.Vector3>;
  uGrassGlobalVisibility: THREE.IUniform<number>;
  uGrassPreviousSelectedCell: THREE.IUniform<THREE.Vector2>;
  uGrassPreviousHoveredCell: THREE.IUniform<THREE.Vector2>;
  uGrassSelectedCell: THREE.IUniform<THREE.Vector2>;
  uGrassHoveredCell: THREE.IUniform<THREE.Vector2>;
  uGrassInteractionProgress: THREE.IUniform<number>;
  uGrassInteractionFlattening: THREE.IUniform<number>;
}>;

export type RealmGrassMaterial = Readonly<{
  material: THREE.MeshStandardMaterial;
  uniforms: RealmGrassUniforms;
  setInteraction: (
    selected: Readonly<{ q: number; r: number }> | null,
    hovered: Readonly<{ q: number; r: number }> | null
  ) => void;
  setTime: (seconds: number) => boolean;
  setVisible: (visible: boolean) => void;
  activateShaderFallback: (reason: string) => void;
  getShaderTelemetry: () => RealmGrassShaderTelemetry;
  dispose: () => void;
}>;

export type RealmGrassShaderTelemetry = Readonly<{
  fallbackActive: boolean;
  fallbackCount: number;
  fallbackReason: string | null;
}>;

const NO_SELECTED_CELL = 100_000;

const VERTEX_DECLARATIONS = `
attribute float grassPhase;
attribute float grassStiffness;
attribute float grassWindScale;
attribute vec2 grassCell;
attribute float grassEdgeFade;
attribute vec4 grassBladeData;
uniform float uGrassTime;
uniform vec2 uGrassWindDirection;
uniform float uGrassWindStrength;
uniform float uGrassGlobalVisibility;
uniform vec2 uGrassPreviousSelectedCell;
uniform vec2 uGrassPreviousHoveredCell;
uniform vec2 uGrassSelectedCell;
uniform vec2 uGrassHoveredCell;
uniform float uGrassInteractionProgress;
uniform float uGrassInteractionFlattening;
varying float vGrassEdgeFade;
varying float vGrassBladeAcross;
varying float vGrassBladeVertical;
varying vec3 vGrassBendWorld;
`;

const FRAGMENT_DECLARATIONS = `
uniform vec3 uGrassSunDirection;
varying float vGrassEdgeFade;
varying float vGrassBladeAcross;
varying float vGrassBladeVertical;
varying vec3 vGrassBendWorld;
float realmGrassCoverage() {
  float edgeCoverage = 1.0 - smoothstep(0.92, 1.0, abs(vGrassBladeAcross));
  float tipCoverage = mix(0.96, 0.48, smoothstep(0.68, 1.0, vGrassBladeVertical));
  return clamp(edgeCoverage * tipCoverage * clamp(vGrassEdgeFade, 0.0, 1.0), 0.0, 1.0);
}
`;

/**
 * Kept separately for direct shader-contract tests. Failing closed is safer
 * than silently shipping a material whose wind injection no longer matches
 * the pinned Three.js 0.185 shader chunks.
 */
export function injectRealmGrassVertexShader(vertexShader: string) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  }
  const wind = `
${marker}
float grassBladeAcross = grassBladeData.x;
float grassBladeVertical = grassBladeData.y;
float grassFlex = grassBladeData.y;
float grassBladePhase = grassBladeData.z;
float grassBladeStiffness = grassBladeData.w;
float grassPreviousSelected = 1.0 - step(0.01, distance(grassCell, uGrassPreviousSelectedCell));
float grassPreviousHovered = 1.0 - step(0.01, distance(grassCell, uGrassPreviousHoveredCell));
float grassTargetSelected = 1.0 - step(0.01, distance(grassCell, uGrassSelectedCell));
float grassTargetHovered = 1.0 - step(0.01, distance(grassCell, uGrassHoveredCell));
float grassSelected = mix(grassPreviousSelected, grassTargetSelected, uGrassInteractionProgress);
float grassHovered = mix(grassPreviousHovered, grassTargetHovered, uGrassInteractionProgress);
float grassSelectionScale = mix(1.0, 0.42, grassSelected * uGrassInteractionFlattening);
grassSelectionScale = min(grassSelectionScale, mix(1.0, 0.70, grassHovered * uGrassInteractionFlattening));
vGrassEdgeFade = clamp(grassEdgeFade, 0.0, 1.0);
vGrassBladeAcross = grassBladeAcross;
vGrassBladeVertical = grassBladeVertical;
transformed.y *= grassSelectionScale;
vec4 grassWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
vec2 grassWorldDirection = normalize(uGrassWindDirection + vec2(0.00001, 0.00001));
vec2 grassWorldCrossDirection = vec2(-grassWorldDirection.y, grassWorldDirection.x);
// begin_vertex is instance-local. Undo the horizontal instance/model basis so
// the later project_vertex transform restores one shared world wind direction.
mat3 grassInstanceBasis = mat3(modelMatrix * instanceMatrix);
mat2 grassLocalToWorldXZ = mat2(grassInstanceBasis[0].xz, grassInstanceBasis[2].xz);
float grassBasisDeterminant = determinant(grassLocalToWorldXZ);
mat2 grassWorldToLocalXZ = abs(grassBasisDeterminant) > 0.000001
  ? inverse(grassLocalToWorldXZ)
  : mat2(1.0);
vec2 grassLocalDirection = grassWorldToLocalXZ * grassWorldDirection;
vec2 grassLocalCrossDirection = grassWorldToLocalXZ * grassWorldCrossDirection;
float grassGustFront = sin(
  dot(grassWorldPosition.xz, grassWorldDirection) * 0.21
  - uGrassTime * 0.34
);
float grassGustBand = smoothstep(0.18, 0.92, 0.5 + grassGustFront * 0.5);
float grassPrimary = sin(
  dot(grassWorldPosition.xz, grassWorldDirection) * 1.18
  + uGrassTime * 1.24
  + grassPhase * 0.18
  + grassBladePhase * 0.11
);
float grassSecondary = sin(
  dot(grassWorldPosition.xz, grassWorldCrossDirection) * 2.78
  + uGrassTime * 2.07
  + grassPhase * 0.10
  + grassBladePhase * 0.31
);
float grassGust = mix(0.66, 1.0, grassGustBand);
float grassFlexAmount = pow(max(grassFlex, 0.0), 1.85);
float grassBend = clamp((grassPrimary + grassSecondary * 0.28) * grassGust
  * grassWindScale * grassStiffness * grassBladeStiffness * uGrassWindStrength * ${REALM_GRASS_MAX_WIND_SWAY.toFixed(3)},
  -${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)}, ${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)});
vec2 grassLocalBend = (
  grassLocalDirection
  + grassLocalCrossDirection * ${REALM_GRASS_CROSS_WIND_RATIO.toFixed(2)}
) * grassBend * grassFlexAmount;
transformed.xz += grassLocalBend;
vGrassBendWorld = mat3(modelMatrix * instanceMatrix) * vec3(grassLocalBend.x, 0.0, grassLocalBend.y);
`;
  return `${VERTEX_DECLARATIONS}\n${vertexShader.replace(marker, wind)}`;
}

export function injectRealmGrassFragmentShader(fragmentShader: string) {
  const colorMarker = '#include <color_fragment>';
  const normalMarker = '#include <normal_fragment_maps>';
  const lightingMarker = '#include <lights_fragment_end>';
  const alphaMarker = fragmentShader.includes('#include <alphahash_fragment>')
    ? '#include <alphahash_fragment>'
    : fragmentShader.includes('#include <alphatest_fragment>')
      ? '#include <alphatest_fragment>'
      : '#include <opaque_fragment>';
  if (
    !fragmentShader.includes(colorMarker) ||
    !fragmentShader.includes(normalMarker) ||
    !fragmentShader.includes(lightingMarker) ||
    !fragmentShader.includes(alphaMarker)
  ) {
    throw new Error('REALM_GRASS_SHADER_FRAGMENT_CONTRACT_CHANGED');
  }
  const colour = `
${colorMarker}
float grassVerticalGrade = smoothstep(0.04, 0.96, vGrassBladeVertical);
vec3 grassRootGrade = vec3(0.91, 0.955, 0.89);
vec3 grassTipGrade = vec3(1.025, 1.01, 0.94);
diffuseColor.rgb *= mix(grassRootGrade, grassTipGrade, grassVerticalGrade);
diffuseColor.a *= realmGrassCoverage();
`;
  const normal = `
${normalMarker}
float grassNormalBendWeight = smoothstep(0.08, 1.0, vGrassBladeVertical);
vec3 grassBendView = (viewMatrix * vec4(vGrassBendWorld, 0.0)).xyz;
normal = normalize(
  normal - grassBendView * faceDirection * grassNormalBendWeight * ${REALM_GRASS_NORMAL_BEND_RESPONSE.toFixed(2)}
);
nonPerturbedNormal = normal;
`;
  const lighting = `
${lightingMarker}
vec3 grassSunDirectionView = normalize((viewMatrix * vec4(uGrassSunDirection, 0.0)).xyz);
float grassSunBehindBlade = pow(saturate(dot(-geometryNormal, grassSunDirectionView)), 1.35);
float grassSunBehindView = pow(saturate(dot(-grassSunDirectionView, geometryViewDir)), 3.0);
float grassViewGrazing = pow(1.0 - saturate(abs(dot(geometryNormal, geometryViewDir))), 1.5);
float grassThinBladeTransmission = grassSunBehindBlade
  * mix(0.025, 0.105, max(grassViewGrazing, grassSunBehindView))
  * mix(0.68, 1.0, grassVerticalGrade)
  * clamp(vGrassEdgeFade, 0.0, 1.0);
vec3 grassTransmissionTint = diffuseColor.rgb * vec3(1.035, 1.09, 0.72);
reflectedLight.directDiffuse += grassTransmissionTint * grassThinBladeTransmission;
`;
  return `${FRAGMENT_DECLARATIONS}\n${fragmentShader
    .replace(colorMarker, colour)
    .replace(normalMarker, normal)
    .replace(lightingMarker, lighting)}`;
}

export function createRealmGrassMaterial(
  windStrength = 1,
  animateInteractions = true,
  alphaToCoverage = false
): RealmGrassMaterial {
  const useAlphaToCoverage = alphaToCoverage === true;
  const useAlphaHash = !useAlphaToCoverage;
  const uniforms: RealmGrassUniforms = Object.freeze({
    uGrassTime: { value: 0 },
    uGrassWindDirection: {
      value: new THREE.Vector2(
        REALM_PREVAILING_WIND.x,
        REALM_PREVAILING_WIND.z
      )
    },
    uGrassWindStrength: {
      value: Math.max(0, Number.isFinite(windStrength) ? windStrength : 1)
    },
    uGrassSunDirection: {
      value: new THREE.Vector3(
        REALM_SUN_DIRECTION.x,
        REALM_SUN_DIRECTION.y,
        REALM_SUN_DIRECTION.z
      )
    },
    uGrassGlobalVisibility: { value: 1 },
    uGrassPreviousSelectedCell: {
      value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL)
    },
    uGrassPreviousHoveredCell: {
      value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL)
    },
    uGrassSelectedCell: {
      value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL)
    },
    uGrassHoveredCell: {
      value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL)
    },
    uGrassInteractionProgress: { value: 1 },
    uGrassInteractionFlattening: { value: 1 }
  });
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    // InstancedMesh.instanceColor is enabled independently by Three.js. A
    // base colour attribute would consume a vertex slot without providing data.
    vertexColors: false,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
    dithering: true,
    transparent: false,
    depthWrite: true,
    depthTest: true
  });
  // These flags are available in Three r185. Keep the assignment explicit so
  // renderers that support MSAA can use alpha-to-coverage without blending.
  // Both mechanisms consume diffuse alpha. Enabling them together applies
  // stochastic coverage twice (approximately coverage squared), so MSAA uses
  // alpha-to-coverage while non-MSAA renderers retain alpha hashing.
  (material as THREE.MeshStandardMaterial & { alphaHash?: boolean }).alphaHash = useAlphaHash;
  (material as THREE.MeshStandardMaterial & { alphaToCoverage?: boolean }).alphaToCoverage =
    useAlphaToCoverage;
  material.userData.realmGrassUniforms = uniforms;
  material.userData.realmGrassAlphaHash = useAlphaHash;
  material.userData.realmGrassAlphaToCoverage = useAlphaToCoverage;
  let disposed = false;
  let shaderFallbackActive = false;
  let shaderFallbackCount = 0;
  let shaderFallbackReason: string | null = null;
  let lastTime = 0;
  let interactionProgress = 1;

  const activateShaderFallback = (error: unknown) => {
    if (shaderFallbackActive) return;
    shaderFallbackActive = true;
    shaderFallbackCount += 1;
    shaderFallbackReason = error instanceof Error
      ? error.message
      : typeof error === 'string' && error.length > 0
        ? error
        : 'REALM_GRASS_SHADER_INJECTION_FAILED';
    material.userData.realmGrassShaderFallbackActive = true;
    material.userData.realmGrassShaderFallbackCount = shaderFallbackCount;
    material.userData.realmGrassShaderFallbackReason = shaderFallbackReason;
    // A renderer-level link error arrives after program construction. Force a
    // new cache key so the next frame compiles the plain standard fallback.
    material.needsUpdate = true;
  };

  material.userData.realmGrassShaderFallbackActive = false;
  material.userData.realmGrassShaderFallbackCount = 0;
  material.userData.realmGrassShaderFallbackReason = null;
  material.onBeforeCompile = (shader) => {
    if (shaderFallbackActive) return;
    const originalVertexShader = shader.vertexShader;
    const originalFragmentShader = shader.fragmentShader;
    try {
      shader.vertexShader = injectRealmGrassVertexShader(originalVertexShader);
      shader.fragmentShader = injectRealmGrassFragmentShader(originalFragmentShader);
      Object.assign(shader.uniforms, uniforms);
    } catch (error) {
      // Keep the standard material and planted instance geometry intact. A
      // Three.js marker drift therefore becomes credible static grass rather
      // than a compile exception, invisible layer, or terrain-scene failure.
      shader.vertexShader = originalVertexShader;
      shader.fragmentShader = originalFragmentShader;
      activateShaderFallback(error);
    }
  };
  material.customProgramCacheKey = () => shaderFallbackActive
    ? `${REALM_GRASS_SHADER_CACHE_KEY}:static-fallback`
    : REALM_GRASS_SHADER_CACHE_KEY;

  const setCell = (uniform: THREE.IUniform<THREE.Vector2>, cell: Readonly<{ q: number; r: number }> | null) => {
    uniform.value.set(
      cell && Number.isFinite(cell.q) ? cell.q : NO_SELECTED_CELL,
      cell && Number.isFinite(cell.r) ? cell.r : NO_SELECTED_CELL
    );
  };

  const sameCell = (uniform: THREE.IUniform<THREE.Vector2>, cell: Readonly<{ q: number; r: number }> | null) =>
    uniform.value.x === (cell && Number.isFinite(cell.q) ? cell.q : NO_SELECTED_CELL) &&
    uniform.value.y === (cell && Number.isFinite(cell.r) ? cell.r : NO_SELECTED_CELL);

  return Object.freeze({
    material,
    uniforms,
    setInteraction: (selected, hovered) => {
      if (
        disposed ||
        (sameCell(uniforms.uGrassSelectedCell, selected) && sameCell(uniforms.uGrassHoveredCell, hovered))
      )
        return;
      if (!animateInteractions) {
        setCell(uniforms.uGrassPreviousSelectedCell, selected);
        setCell(uniforms.uGrassPreviousHoveredCell, hovered);
        setCell(uniforms.uGrassSelectedCell, selected);
        setCell(uniforms.uGrassHoveredCell, hovered);
        interactionProgress = 1;
        uniforms.uGrassInteractionProgress.value = 1;
        return;
      }
      uniforms.uGrassPreviousSelectedCell.value.copy(uniforms.uGrassSelectedCell.value);
      uniforms.uGrassPreviousHoveredCell.value.copy(uniforms.uGrassHoveredCell.value);
      setCell(uniforms.uGrassSelectedCell, selected);
      setCell(uniforms.uGrassHoveredCell, hovered);
      interactionProgress = 0;
      uniforms.uGrassInteractionProgress.value = 0;
    },
    setTime: (seconds) => {
      if (disposed || shaderFallbackActive || !Number.isFinite(seconds)) return false;
      const safeSeconds = Math.max(0, seconds);
      const delta = Math.max(0, safeSeconds - lastTime);
      const timeChanged = Math.abs(safeSeconds - lastTime) >= 0.000001;
      const priorInteractionProgress = interactionProgress;
      if (timeChanged) uniforms.uGrassTime.value = safeSeconds;
      if (animateInteractions && interactionProgress < 1 && delta > 0) {
        interactionProgress = Math.min(
          1,
          interactionProgress + Math.min(0.1, delta) / REALM_GRASS_INTERACTION_TRANSITION_SECONDS
        );
        uniforms.uGrassInteractionProgress.value = interactionProgress;
      }
      lastTime = safeSeconds;
      return timeChanged || interactionProgress !== priorInteractionProgress;
    },
    setVisible: (visible) => {
      if (disposed) return;
      uniforms.uGrassGlobalVisibility.value = visible ? 1 : 0;
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
