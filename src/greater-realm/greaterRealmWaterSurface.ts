import * as THREE from 'three';

import type { GreaterRealmGraphicsProfile } from './greaterRealmRuntimePolicy';

export type GreaterRealmWaterSurface = Readonly<{
  material: THREE.MeshStandardMaterial;
  update: (elapsedSeconds: number) => void;
}>;

/** A single standard-material pass; geometry and water/navigation heights stay authoritative. */
export function createGreaterRealmWaterSurface(input: Readonly<{
  cellSize: number;
  graphicsProfile: GreaterRealmGraphicsProfile;
}>): GreaterRealmWaterSurface {
  const time = { value: 0 };
  const inverseCellSize = { value: 1 / (
    Number.isFinite(input.cellSize) && input.cellSize > 0 ? input.cellSize : 1
  ) };
  const reduced = input.graphicsProfile === 'reduced';
  const material = new THREE.MeshStandardMaterial({
    color: '#286f7c',
    roughness: 0.32,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    depthWrite: true,
    fog: true
  });
  material.name = 'greater-realm-water-surface';
  material.customProgramCacheKey = () => `greater-realm-water-surface-v1:${reduced ? 'reduced' : 'layered'}`;
  material.onBeforeCompile = (shader) => {
    const vertexAnchor = '#include <begin_vertex>';
    const normalAnchor = '#include <normal_fragment_maps>';
    // If Three changes this contract, keep the usable lit/fogged standard surface.
    // Check every insertion point before touching either shader or its uniforms.
    if (!shader.vertexShader.includes(vertexAnchor) || !shader.fragmentShader.includes(normalAnchor)) return;
    shader.uniforms.greaterRealmWaterTime = time;
    shader.uniforms.greaterRealmWaterInverseCellSize = inverseCellSize;
    shader.vertexShader = `varying vec2 vGreaterRealmWaterWorld;\n${shader.vertexShader}`
      .replace(vertexAnchor, `${vertexAnchor}
        vGreaterRealmWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xz;
      `);
    shader.fragmentShader = `
      varying vec2 vGreaterRealmWaterWorld;
      uniform float greaterRealmWaterTime;
      uniform float greaterRealmWaterInverseCellSize;
      ${shader.fragmentShader}
    `.replace(normalAnchor, `${normalAnchor}
      // World coordinates and one host clock keep neighboring chunks in phase.
      vec2 waterP = vGreaterRealmWaterWorld * greaterRealmWaterInverseCellSize;
      float waterT = greaterRealmWaterTime;
      float swellA = dot(waterP, vec2(0.92, 0.38)) - waterT * 0.34;
      float swellB = dot(waterP, vec2(-0.46, 1.24)) + waterT * 0.23;
      vec2 waterSlope = vec2(0.92, 0.38) * cos(swellA) * 0.055
        + vec2(-0.46, 1.24) * cos(swellB) * 0.035;
      ${reduced ? '' : `
        float ripple = dot(waterP, vec2(8.2, 3.6)) - waterT * 0.72 + sin(swellB) * 0.8;
        // Fade detail as it becomes smaller than a pixel, instead of glittering.
        float rippleVisibility = 1.0 - smoothstep(0.35, 1.2, fwidth(ripple));
        waterSlope += vec2(0.91, 0.4) * cos(ripple) * 0.035 * rippleVisibility;
      `}
      normal = normalize(mat3(viewMatrix) * normalize(vec3(-waterSlope.x, 1.0, -waterSlope.y)));
      float swellTone = sin(swellA) * 0.5 + sin(swellB) * 0.5;
      float crestWidth = max(fwidth(swellTone), 0.06);
      float crest = smoothstep(0.88 - crestWidth, 1.0 + crestWidth, swellTone);
      float waterFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float skyTint = pow(1.0 - waterFacing, 3.0) * 0.14;
      diffuseColor.rgb *= 0.95 + swellTone * 0.055;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.66, 0.68), skyTint + crest * 0.075);
      roughnessFactor = clamp(roughnessFactor + swellTone * 0.035, 0.26, 0.4);
    `);
  };
  return Object.freeze({
    material,
    // The owning scene already handles reduced motion, visibility and context loss.
    update: (elapsedSeconds: number) => {
      time.value = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    }
  });
}
