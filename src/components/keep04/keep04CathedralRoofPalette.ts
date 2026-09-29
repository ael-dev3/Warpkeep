import * as THREE from 'three';
import { KEEP04_VISUAL_PROFILE as P } from './keep04VisualProfile';

const CACHE_KEY = 'keep04-cathedral-roof-teal-v1';
const LUMINANCE = 'vec3(0.2126, 0.7152, 0.0722)';

/** Recolor only upward-facing violet facets on the authored Cathedral.
 * The GLB stays immutable and the transformation adds no vertex-buffer copy.
 */
export function applyKeep04CathedralRoofPalette(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshStandardMaterial) || !material.vertexColors) return false;

  const palette = new THREE.Color(P.roofTeal);
  const paletteLuminance = palette.r * 0.2126 + palette.g * 0.7152 + palette.b * 0.0722;
  const paletteRgb = `vec3(${palette.r.toFixed(8)}, ${palette.g.toFixed(8)}, ${palette.b.toFixed(8)})`;
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer);
    if (!shader.vertexShader.includes('#include <common>')
      || !shader.vertexShader.includes('#include <beginnormal_vertex>')
      || !shader.fragmentShader.includes('#include <common>')
      || !shader.fragmentShader.includes('#include <color_fragment>')) return;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep04RoofFacing;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvKeep04RoofFacing = objectNormal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep04RoofFacing;')
      .replace('#include <color_fragment>', `#include <color_fragment>
float keep04RoofFacing = smoothstep(0.02, 0.20, vKeep04RoofFacing);
float keep04Violet = smoothstep(0.01, 0.06, diffuseColor.b - diffuseColor.r)
  * (1.0 - smoothstep(0.15, 0.25, diffuseColor.g));
float keep04SourceLuminance = max(dot(diffuseColor.rgb, ${LUMINANCE}), 0.0001);
vec3 keep04Teal = ${paletteRgb} * (keep04SourceLuminance / ${paletteLuminance.toFixed(8)});
diffuseColor.rgb = mix(diffuseColor.rgb, keep04Teal, keep04RoofFacing * keep04Violet);`);
  };
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousCacheKey()}|${CACHE_KEY}`;
  return true;
}
