import * as THREE from 'three';

import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';
import { REALM_SUN_DIRECTION } from './createRealmEnvironment';
import {
  REALM_LIVING_ENVIRONMENT_REVISION,
  REALM_LIVING_GUST_GLSL
} from './realmLivingEnvironment';
import type { RealmSurfaceDisturbanceSnapshot } from './realmSurfaceDisturbanceField';

export const REALM_GRASS_THREE_SHADER_CONTRACT = 'three-r185';
export const REALM_GRASS_SHADER_CACHE_KEY = `warpkeep-procedural-grass-v3-living-gust-v6-bounded-tips-disturbance-analytic-bend-normal-v2-${REALM_LIVING_ENVIRONMENT_REVISION}-${REALM_GRASS_THREE_SHADER_CONTRACT}`;
export const REALM_GRASS_MAX_WIND_SWAY = 0.075;
export const REALM_GRASS_MAX_DISTURBANCE_SWAY = 0.055;
export const REALM_GRASS_CROSS_WIND_RATIO = 0.16;
export const REALM_GRASS_MAX_PRIMARY_BEND = REALM_GRASS_MAX_WIND_SWAY / Math.hypot(1, REALM_GRASS_CROSS_WIND_RATIO);
/**
 * Conservative world-space culling allowance for wind- and
 * disturbance-deformed blades. The accepted grass slope ceiling is 0.78, so
 * the 0.075 wind cap plus the 0.055 disturbance cap can reach about 0.165 in
 * world space after slope alignment. Keep a small deterministic margin.
 */
export const REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS = 0.17;
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
  uGrassDisturbanceCount: THREE.IUniform<number>;
  uGrassDisturbanceCenters: THREE.IUniform<THREE.Vector2[]>;
  uGrassDisturbanceParams: THREE.IUniform<THREE.Vector4[]>;
}>;

export type RealmGrassMaterial = Readonly<{
  material: THREE.MeshStandardMaterial;
  uniforms: RealmGrassUniforms;
  setInteraction: (
    selected: Readonly<{ q: number; r: number }> | null,
    hovered: Readonly<{ q: number; r: number }> | null
  ) => void;
  setTime: (seconds: number) => boolean;
  setDisturbances: (snapshot: RealmSurfaceDisturbanceSnapshot | null) => boolean;
  setVisible: (visible: boolean) => void;
  activateShaderFallback: (reason: string) => void;
  getShaderTelemetry: () => RealmGrassShaderTelemetry;
  dispose: () => void;
}>;

export type RealmGrassShaderTelemetry = Readonly<{
  fallbackActive: boolean;
  fallbackCount: number;
  fallbackReason: string | null;
  disturbanceSlotCount: number;
  activeDisturbanceCount: number;
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
varying vec3 vGrassBendSlopeWorld;
`;

const FRAGMENT_DECLARATIONS = `
uniform vec3 uGrassSunDirection;
varying float vGrassEdgeFade;
varying float vGrassBladeAcross;
varying float vGrassBladeVertical;
varying vec3 vGrassBendSlopeWorld;
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
function grassDisturbanceDeclarations(slotCount: number) {
  return slotCount > 0 ? `
uniform int uGrassDisturbanceCount;
uniform vec2 uGrassDisturbanceCenters[${slotCount}];
uniform vec4 uGrassDisturbanceParams[${slotCount}];
` : '';
}

function grassDisturbanceBend(slotCount: number) {
  if (slotCount <= 0) return '';
  return Array.from({ length: slotCount }, (_, slot) => `
if (uGrassDisturbanceCount > ${slot}) {
  vec2 grassDisturbanceDelta${slot} = grassWorldPosition.xz - uGrassDisturbanceCenters[${slot}];
  float grassDisturbanceDistance${slot} = length(grassDisturbanceDelta${slot});
  float grassDisturbanceRadius${slot} = max(0.05, uGrassDisturbanceParams[${slot}].x);
  float grassDisturbanceFalloff${slot} = 1.0 - smoothstep(
    grassDisturbanceRadius${slot} * 0.22,
    grassDisturbanceRadius${slot},
    grassDisturbanceDistance${slot}
  );
  vec2 grassDisturbanceWorldDirection${slot} = grassDisturbanceDistance${slot} > 0.0001
    ? grassDisturbanceDelta${slot} / grassDisturbanceDistance${slot}
    : grassWorldDirection;
  vec2 grassDisturbanceLocalDirection${slot} = grassWorldToLocalXZ * grassDisturbanceWorldDirection${slot};
  float grassDisturbancePulse${slot} = sin(clamp(uGrassDisturbanceParams[${slot}].z, 0.0, 1.0) * 3.14159265);
  float grassDisturbanceBend${slot} = grassDisturbanceFalloff${slot}
    * uGrassDisturbanceParams[${slot}].y
    * mix(0.55, 1.0, grassDisturbancePulse${slot})
    * grassFlexAmount * ${REALM_GRASS_MAX_DISTURBANCE_SWAY.toFixed(3)};
  vec2 grassDisturbanceOffset${slot} = grassDisturbanceLocalDirection${slot}
    * grassDisturbanceBend${slot};
  transformed.xz += grassDisturbanceOffset${slot};
  grassLocalBend += grassDisturbanceOffset${slot};
}
`).join('');
}

export function injectRealmGrassVertexShader(vertexShader: string, disturbanceSlotCount = 0) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  }
  const safeSlotCount = Math.max(0, Math.min(8, Math.trunc(disturbanceSlotCount)));
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
vGrassEdgeFade = clamp(grassEdgeFade * uGrassGlobalVisibility, 0.0, 1.0);
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
float grassGust = mix(0.66, 1.0, realmLivingGust(grassWorldPosition.xz, uGrassTime));
float grassFlexAmount = pow(max(grassFlex, 0.0), 1.85);
float grassBend = clamp((grassPrimary + grassSecondary * 0.28) * grassGust
  * grassWindScale * grassStiffness * grassBladeStiffness * uGrassWindStrength * ${REALM_GRASS_MAX_WIND_SWAY.toFixed(3)},
  -${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)}, ${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)});
vec2 grassLocalBend = (
  grassLocalDirection
  + grassLocalCrossDirection * ${REALM_GRASS_CROSS_WIND_RATIO.toFixed(2)}
) * grassBend * grassFlexAmount;
transformed.xz += grassLocalBend;
${grassDisturbanceBend(safeSlotCount)}
float grassFlexDerivative = 1.85 * pow(max(grassFlex, 0.0), 0.85);
float grassBendDerivativeScale = grassFlexAmount > 0.0001
  ? grassFlexDerivative / grassFlexAmount
  : 0.0;
vec2 grassLocalBendSlope = grassLocalBend * grassBendDerivativeScale;
vec3 grassWorldBendSlope = mat3(modelMatrix * instanceMatrix)
  * vec3(grassLocalBendSlope.x, 0.0, grassLocalBendSlope.y);
float grassWorldHeightScale = max(
  length(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 1.0, 0.0)),
  0.0001
);
vGrassBendSlopeWorld = grassWorldBendSlope / grassWorldHeightScale;
`;
  return `${VERTEX_DECLARATIONS}\n${REALM_LIVING_GUST_GLSL}\n${grassDisturbanceDeclarations(safeSlotCount)}\n${vertexShader
    .replace(marker, wind)}`;
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
vec3 grassBendView = (viewMatrix * vec4(vGrassBendSlopeWorld, 0.0)).xyz;
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
  alphaToCoverage = false,
  disturbanceSlotCount = 0
): RealmGrassMaterial {
  const safeDisturbanceSlotCount = Math.max(
    0,
    Math.min(8, Math.trunc(Number.isFinite(disturbanceSlotCount) ? disturbanceSlotCount : 0))
  );
  const disturbanceCenters = Array.from(
    { length: safeDisturbanceSlotCount },
    () => new THREE.Vector2()
  );
  const disturbanceParams = Array.from(
    { length: safeDisturbanceSlotCount },
    () => new THREE.Vector4()
  );
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
    uGrassInteractionFlattening: { value: 1 },
    uGrassDisturbanceCount: { value: 0 },
    uGrassDisturbanceCenters: { value: disturbanceCenters },
    uGrassDisturbanceParams: { value: disturbanceParams }
  });
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    // A faint chlorophyll fill keeps thin distant blades green under the
    // strategic camera without flattening their sun-facing PBR response.
    emissive: '#315820',
    emissiveIntensity: 0.14,
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
      shader.vertexShader = injectRealmGrassVertexShader(
        originalVertexShader,
        safeDisturbanceSlotCount
      );
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
    : safeDisturbanceSlotCount > 0
      ? `${REALM_GRASS_SHADER_CACHE_KEY}:disturbances-${safeDisturbanceSlotCount}`
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
    setDisturbances: (snapshot) => {
      if (disposed || shaderFallbackActive || safeDisturbanceSlotCount === 0) return false;
      const nextCount = Math.min(
        safeDisturbanceSlotCount,
        Math.max(0, Math.trunc(snapshot?.count ?? 0))
      );
      let changed = uniforms.uGrassDisturbanceCount.value !== nextCount;
      uniforms.uGrassDisturbanceCount.value = nextCount;
      for (let slot = 0; slot < safeDisturbanceSlotCount; slot += 1) {
        const centerOffset = slot * 2;
        const paramOffset = slot * 4;
        const nextCenterX = slot < nextCount ? snapshot?.centers[centerOffset] ?? 0 : 0;
        const nextCenterZ = slot < nextCount ? snapshot?.centers[centerOffset + 1] ?? 0 : 0;
        const nextRadius = slot < nextCount ? snapshot?.params[paramOffset] ?? 0 : 0;
        const nextStrength = slot < nextCount ? snapshot?.params[paramOffset + 1] ?? 0 : 0;
        const nextAge = slot < nextCount ? snapshot?.params[paramOffset + 2] ?? 0 : 0;
        const nextLifetime = slot < nextCount ? snapshot?.params[paramOffset + 3] ?? 0 : 0;
        const center = disturbanceCenters[slot]!;
        const params = disturbanceParams[slot]!;
        changed = changed
          || center.x !== nextCenterX
          || center.y !== nextCenterZ
          || params.x !== nextRadius
          || params.y !== nextStrength
          || params.z !== nextAge
          || params.w !== nextLifetime;
        center.set(nextCenterX, nextCenterZ);
        params.set(nextRadius, nextStrength, nextAge, nextLifetime);
      }
      return changed;
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
      fallbackReason: shaderFallbackReason,
      disturbanceSlotCount: safeDisturbanceSlotCount,
      activeDisturbanceCount: uniforms.uGrassDisturbanceCount.value
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
    }
  });
}
