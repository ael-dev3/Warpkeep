import * as THREE from 'three';

export const REALM_GRASS_THREE_SHADER_CONTRACT = 'three-r185';
export const REALM_GRASS_SHADER_CACHE_KEY = `warpkeep-procedural-grass-v1-${REALM_GRASS_THREE_SHADER_CONTRACT}`;
export const REALM_GRASS_MAX_WIND_SWAY = 0.075;
export const REALM_GRASS_CROSS_WIND_RATIO = 0.16;
export const REALM_GRASS_MAX_PRIMARY_BEND = REALM_GRASS_MAX_WIND_SWAY / Math.hypot(
  1,
  REALM_GRASS_CROSS_WIND_RATIO
);
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
  setInteraction: (selected: Readonly<{ q: number; r: number }> | null, hovered: Readonly<{ q: number; r: number }> | null) => void;
  setTime: (seconds: number) => boolean;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}>;

const NO_SELECTED_CELL = 100_000;

const VERTEX_DECLARATIONS = `
attribute float grassFlex;
attribute float grassPhase;
attribute float grassStiffness;
attribute float grassWindScale;
attribute vec2 grassCell;
attribute float grassEdgeFade;
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
`;

/**
 * Kept separately for direct shader-contract tests. Failing closed is safer
 * than silently shipping a material whose wind injection no longer matches the
 * pinned Three.js 0.185 shader chunks.
 */
export function injectRealmGrassVertexShader(vertexShader: string) {
  const marker = '#include <begin_vertex>';
  if (!vertexShader.includes(marker)) {
    throw new Error('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  }
  const wind = `
${marker}
float grassPreviousSelected = 1.0 - step(0.01, distance(grassCell, uGrassPreviousSelectedCell));
float grassPreviousHovered = 1.0 - step(0.01, distance(grassCell, uGrassPreviousHoveredCell));
float grassTargetSelected = 1.0 - step(0.01, distance(grassCell, uGrassSelectedCell));
float grassTargetHovered = 1.0 - step(0.01, distance(grassCell, uGrassHoveredCell));
float grassSelected = mix(grassPreviousSelected, grassTargetSelected, uGrassInteractionProgress);
float grassHovered = mix(grassPreviousHovered, grassTargetHovered, uGrassInteractionProgress);
float grassSelectionScale = mix(1.0, 0.42, grassSelected * uGrassInteractionFlattening);
grassSelectionScale = min(grassSelectionScale, mix(1.0, 0.70, grassHovered * uGrassInteractionFlattening));
float grassVisibleScale = clamp(uGrassGlobalVisibility * grassEdgeFade, 0.0, 1.0);
transformed *= grassVisibleScale;
transformed.y *= grassSelectionScale;
vec4 grassWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
vec2 grassDirection = normalize(uGrassWindDirection + vec2(0.00001, 0.00001));
vec2 grassCrossDirection = vec2(-grassDirection.y, grassDirection.x);
float grassPrimary = sin(dot(grassWorldPosition.xz, grassDirection) * 1.18 + uGrassTime * 1.24 + grassPhase);
float grassSecondary = sin(dot(grassWorldPosition.xz, grassCrossDirection) * 2.78 + uGrassTime * 2.07 + grassPhase * 0.63);
float grassGust = 0.79 + 0.21 * sin(uGrassTime * 0.31 + dot(grassWorldPosition.xz, grassDirection) * 0.19);
float grassFlexAmount = pow(max(grassFlex, 0.0), 1.85);
float grassBend = clamp((grassPrimary + grassSecondary * 0.28) * grassGust
  * grassWindScale * grassStiffness * uGrassWindStrength * ${REALM_GRASS_MAX_WIND_SWAY.toFixed(3)},
  -${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)}, ${REALM_GRASS_MAX_PRIMARY_BEND.toFixed(6)});
transformed.xz += grassDirection * grassBend * grassFlexAmount;
transformed.xz += grassCrossDirection * grassBend * grassFlexAmount * ${REALM_GRASS_CROSS_WIND_RATIO.toFixed(2)};
`;
  return `${VERTEX_DECLARATIONS}\n${vertexShader.replace(marker, wind)}`;
}

export function createRealmGrassMaterial(
  windStrength = 1,
  animateInteractions = true
): RealmGrassMaterial {
  const uniforms: RealmGrassUniforms = Object.freeze({
    uGrassTime: { value: 0 },
    uGrassWindDirection: { value: new THREE.Vector2(0.78, 0.62).normalize() },
    uGrassWindStrength: { value: Math.max(0, Number.isFinite(windStrength) ? windStrength : 1) },
    uGrassGlobalVisibility: { value: 1 },
    uGrassPreviousSelectedCell: { value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL) },
    uGrassPreviousHoveredCell: { value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL) },
    uGrassSelectedCell: { value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL) },
    uGrassHoveredCell: { value: new THREE.Vector2(NO_SELECTED_CELL, NO_SELECTED_CELL) },
    uGrassInteractionProgress: { value: 1 },
    uGrassInteractionFlattening: { value: 1 }
  });
  const material = new THREE.MeshStandardMaterial({
    color: '#748f47',
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
    dithering: true
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = injectRealmGrassVertexShader(shader.vertexShader);
    Object.assign(shader.uniforms, uniforms);
  };
  material.customProgramCacheKey = () => REALM_GRASS_SHADER_CACHE_KEY;
  material.userData.realmGrassUniforms = uniforms;
  let disposed = false;
  let lastTime = 0;
  let interactionProgress = 1;

  const setCell = (
    uniform: THREE.IUniform<THREE.Vector2>,
    cell: Readonly<{ q: number; r: number }> | null
  ) => {
    uniform.value.set(
      cell && Number.isFinite(cell.q) ? cell.q : NO_SELECTED_CELL,
      cell && Number.isFinite(cell.r) ? cell.r : NO_SELECTED_CELL
    );
  };

  const sameCell = (uniform: THREE.IUniform<THREE.Vector2>, cell: Readonly<{ q: number; r: number }> | null) => (
    uniform.value.x === (cell && Number.isFinite(cell.q) ? cell.q : NO_SELECTED_CELL)
    && uniform.value.y === (cell && Number.isFinite(cell.r) ? cell.r : NO_SELECTED_CELL)
  );

  return Object.freeze({
    material,
    uniforms,
    setInteraction: (selected, hovered) => {
      if (disposed || (sameCell(uniforms.uGrassSelectedCell, selected)
        && sameCell(uniforms.uGrassHoveredCell, hovered))) return;
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
