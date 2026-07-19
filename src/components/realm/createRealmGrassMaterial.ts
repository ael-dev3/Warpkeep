import * as THREE from 'three';

export const REALM_GRASS_THREE_SHADER_CONTRACT = 'three-r185';
export const REALM_GRASS_SHADER_CACHE_KEY = `warpkeep-procedural-grass-v2-luminous-broad-v4-packed-blades-${REALM_GRASS_THREE_SHADER_CONTRACT}`;
export const REALM_GRASS_MAX_WIND_SWAY = 0.075;
export const REALM_GRASS_CROSS_WIND_RATIO = 0.16;
export const REALM_GRASS_MAX_PRIMARY_BEND = REALM_GRASS_MAX_WIND_SWAY / Math.hypot(1, REALM_GRASS_CROSS_WIND_RATIO);
export const REALM_GRASS_INTERACTION_TRANSITION_SECONDS = 0.14;

export type RealmGrassUniforms = Readonly<{
  uGrassTime: THREE.IUniform<number>;
  uGrassWindDirection: THREE.IUniform<THREE.Vector2>;
  uGrassWindStrength: THREE.IUniform<number>;
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
  dispose: () => void;
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
`;

const FRAGMENT_DECLARATIONS = `
varying float vGrassEdgeFade;
varying float vGrassBladeAcross;
varying float vGrassBladeVertical;
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
float grassPrimary = sin(dot(grassWorldPosition.xz, grassWorldDirection) * 1.18 + uGrassTime * 1.24 + grassPhase + grassBladePhase);
float grassSecondary = sin(dot(grassWorldPosition.xz, grassWorldCrossDirection) * 2.78 + uGrassTime * 2.07 + grassPhase * 0.63 + grassBladePhase * 0.47);
float grassGust = 0.79 + 0.21 * sin(uGrassTime * 0.31 + dot(grassWorldPosition.xz, grassWorldDirection) * 0.19);
float grassFlexAmount = pow(max(grassFlex, 0.0), 1.85);
float grassBend = clamp((grassPrimary + grassSecondary * 0.28) * grassGust
  * grassWindScale * grassStiffness * grassBladeStiffness * uGrassWindStrength * ${REALM_GRASS_MAX_WIND_SWAY.toFixed(3)},
  -${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)}, ${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)});
transformed.xz += grassLocalDirection * grassBend * grassFlexAmount;
transformed.xz += grassLocalCrossDirection * grassBend * grassFlexAmount * ${REALM_GRASS_CROSS_WIND_RATIO.toFixed(2)};
`;
  return `${VERTEX_DECLARATIONS}\n${vertexShader.replace(marker, wind)}`;
}

export function injectRealmGrassFragmentShader(fragmentShader: string) {
  const colorMarker = '#include <color_fragment>';
  const alphaMarker = fragmentShader.includes('#include <alphahash_fragment>')
    ? '#include <alphahash_fragment>'
    : fragmentShader.includes('#include <alphatest_fragment>')
      ? '#include <alphatest_fragment>'
      : '#include <opaque_fragment>';
  if (!fragmentShader.includes(colorMarker) || !fragmentShader.includes(alphaMarker)) {
    throw new Error('REALM_GRASS_SHADER_FRAGMENT_CONTRACT_CHANGED');
  }
  const colour = `
${colorMarker}
float grassVerticalLift = smoothstep(0.0, 1.0, vGrassBladeVertical);
diffuseColor.rgb *= mix(0.92, 1.06, grassVerticalLift);
diffuseColor.rgb += vec3(0.012, 0.030, 0.0) * grassVerticalLift;
diffuseColor.a *= realmGrassCoverage();
`;
  return `${FRAGMENT_DECLARATIONS}\n${fragmentShader.replace(colorMarker, colour)}`;
}

export function createRealmGrassMaterial(
  windStrength = 1,
  animateInteractions = true,
  alphaToCoverage = false
): RealmGrassMaterial {
  const uniforms: RealmGrassUniforms = Object.freeze({
    uGrassTime: { value: 0 },
    uGrassWindDirection: { value: new THREE.Vector2(0.78, 0.62).normalize() },
    uGrassWindStrength: {
      value: Math.max(0, Number.isFinite(windStrength) ? windStrength : 1)
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
  (material as THREE.MeshStandardMaterial & { alphaHash?: boolean }).alphaHash = true;
  (material as THREE.MeshStandardMaterial & { alphaToCoverage?: boolean }).alphaToCoverage = alphaToCoverage;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = injectRealmGrassVertexShader(shader.vertexShader);
    shader.fragmentShader = injectRealmGrassFragmentShader(shader.fragmentShader);
    Object.assign(shader.uniforms, uniforms);
  };
  material.customProgramCacheKey = () => REALM_GRASS_SHADER_CACHE_KEY;
  material.userData.realmGrassUniforms = uniforms;
  material.userData.realmGrassAlphaHash = true;
  material.userData.realmGrassAlphaToCoverage = alphaToCoverage;
  let disposed = false;
  let lastTime = 0;
  let interactionProgress = 1;

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
      if (disposed || !Number.isFinite(seconds)) return false;
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
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
    }
  });
}
