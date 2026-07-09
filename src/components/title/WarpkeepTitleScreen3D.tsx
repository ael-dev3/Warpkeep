import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WarpkeepTitleScreenFallback } from './WarpkeepTitleScreenFallback';
import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { layoutBrutalistGlyphs } from './brutalistGlyphs';
import { dampValue, isMousePointerType, normalizePointerPosition } from './titleInteraction';
import { createBrutalistGlyphGeometry } from './titleGeometry';
import { createConcreteTextures, type ConcreteTextureSet } from './titleTextures';
import { calculateTitleResponsiveLayout } from './titleLayout';
import { calculateGalaxyGrowth, createSpiralGalaxyLayout, titleSceneSpec } from './titleSceneSpec';
import './WarpkeepTitleScreen.css';

type PointLayer = {
  material: THREE.ShaderMaterial;
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
};

type GalaxyAssembly = {
  group: THREE.Group;
  parallaxGroup: THREE.Group;
  growthGroup: THREE.Group;
  spinGroup: THREE.Group;
  stars: PointLayer;
  dust: PointLayer;
  discMaterial: THREE.ShaderMaterial;
  coreMaterial: THREE.ShaderMaterial;
};

type TitleAssembly = {
  group: THREE.Group;
  safeWidth: number;
};

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = Math.imul(1_664_525, state) + 1_013_904_223;
    return (state >>> 0) / 4_294_967_296;
  };
}

function createPointMaterial(
  pixelRatio: number,
  pointScale: number,
  opacity: number,
  flickerSpeed: number,
  softness = 0,
  coreFade = 0
) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: pixelRatio },
      pointScale: { value: pointScale },
      maxPointSize: { value: titleSceneSpec.galaxy.maxPointSize },
      layerOpacity: { value: opacity },
      flickerSpeed: { value: flickerSpeed },
      softness: { value: softness },
      coreFade: { value: coreFade },
      galaxyRadius: { value: titleSceneSpec.galaxy.radius },
      shadowRadius: { value: titleSceneSpec.core.shadowRadius }
    },
    vertexShader: `
      attribute float phase;
      attribute float size;
      attribute float brightness;
      varying float vBrightness;
      varying float vPhase;
      varying float vCoreFade;
      varying vec3 vColor;
      uniform float time;
      uniform float pixelRatio;
      uniform float pointScale;
      uniform float maxPointSize;
      uniform float flickerSpeed;
      uniform float coreFade;
      uniform float galaxyRadius;
      uniform float shadowRadius;

      void main() {
        vBrightness = brightness;
        vPhase = phase;
        vColor = color;
        float normalizedRadius = length(position.xy) / galaxyRadius;
        float coreVisibility = smoothstep(
          shadowRadius * 0.72,
          shadowRadius * 2.2,
          normalizedRadius
        );
        vCoreFade = mix(1.0, coreVisibility, coreFade);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float flicker = 0.94 + 0.06 * sin(time * flickerSpeed + phase);
        float perspectiveSize = size * pixelRatio * pointScale * flicker / max(7.0, -viewPosition.z);
        gl_PointSize = clamp(perspectiveSize, 1.0, maxPointSize);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying float vPhase;
      varying float vCoreFade;
      varying vec3 vColor;
      uniform float time;
      uniform float layerOpacity;
      uniform float flickerSpeed;
      uniform float softness;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        float stellarCore = 1.0 - smoothstep(0.035, 0.5, radius);
        float horizontalFlare = exp(-abs(centered.y) * 40.0) *
          (1.0 - smoothstep(0.025, 0.48, abs(centered.x)));
        float verticalFlare = exp(-abs(centered.x) * 44.0) *
          (1.0 - smoothstep(0.025, 0.46, abs(centered.y)));
        float starShape = max(stellarCore, (horizontalFlare + verticalFlare) * 0.15);
        float dustShape = pow(max(0.0, 1.0 - radius * 2.0), 2.2);
        float pointShape = mix(starShape, dustShape, softness);
        float flicker = 0.95 + 0.05 * sin(time * flickerSpeed + vPhase);
        float alpha = pointShape * vBrightness * layerOpacity * flicker * vCoreFade;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createBackgroundStars(count: number, pixelRatio: number): PointLayer {
  const random = createRandom(0x4b454550);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const cold = new THREE.Color(titleSceneSpec.palette.coldStar);
  const violet = new THREE.Color('#a59bd2');
  const oldGold = new THREE.Color(titleSceneSpec.palette.oldGold);

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const brightSystem = random() > 0.966;
    const color = cold.clone().lerp(violet, random() * 0.3);
    if (random() > 0.94) {
      color.lerp(oldGold, 0.12 + random() * 0.12);
    }
    positions[i] = (random() - 0.5) * 48;
    positions[i + 1] = (random() - 0.5) * 30 + 1;
    positions[i + 2] = -8 - random() * 58;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = brightSystem ? 2.15 + random() * 1.5 : 0.5 + random() * 1.08;
    brightness[index] = brightSystem ? 0.7 + random() * 0.28 : 0.15 + random() * 0.56;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = createPointMaterial(pixelRatio, 86, 0.86, 0.38);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

function createGalaxyDiscMaterial(compactQuality: boolean) {
  const fbmOctaves = compactQuality ? 3 : 5;
  const dustLaneNoise = compactQuality
    ? 'broadNoise'
    : 'fbm(point * 10.5 + vec2(4.3, -2.1))';
  const clumpNoise = compactQuality
    ? 'mix(broadNoise, fineNoise, 0.45)'
    : 'fbm(point * 13.5 + vec2(-3.7, 8.2))';
  const coreNoise = compactQuality
    ? 'fineNoise'
    : 'fbm(point * 23.0 + vec2(7.0, 3.0))';
  const peripheralNoise = compactQuality
    ? 'broadNoise'
    : 'fbm(point * 7.4 + vec2(-8.0, 5.0))';

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      purpleMix: { value: titleSceneSpec.galaxy.purpleMix },
      armCount: { value: titleSceneSpec.galaxy.armCount },
      spiralTurns: { value: titleSceneSpec.galaxy.spiralTurns },
      shineSpeed: { value: (Math.PI * 2) / titleSceneSpec.galaxy.shinePeriodSeconds },
      shadowRadius: { value: titleSceneSpec.core.shadowRadius },
      accretionRadius: { value: titleSceneSpec.core.accretionRadius },
      lensRadius: { value: titleSceneSpec.core.lensRadius }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float purpleMix;
      uniform float armCount;
      uniform float spiralTurns;
      uniform float shineSpeed;
      uniform float shadowRadius;
      uniform float accretionRadius;
      uniform float lensRadius;

      const float TAU = 6.28318530718;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.52;
        mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
        for (int octave = 0; octave < ${fbmOctaves}; octave += 1) {
          value += valueNoise(point) * amplitude;
          point = turn * point * 2.03 + vec2(13.1, 7.7);
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float radius = length(point);
        if (radius > 1.045) discard;

        float broadNoise = fbm(point * 4.8 + vec2(time * 0.002, -time * 0.0015));
        float fineNoise = fbm(point * 17.0 - vec2(time * 0.003, time * 0.001));
        float warpedRadius = radius * (0.955 + broadNoise * 0.095);
        float angle = atan(point.y, point.x);
        float spiralPhase = angle * armCount -
          warpedRadius * spiralTurns * TAU * armCount +
          (broadNoise - 0.5) * 2.1;
        float armWave = 0.5 + 0.5 * cos(spiralPhase);
        float secondaryWave = 0.5 + 0.5 * cos(spiralPhase + 0.65 + fineNoise * 0.72);
        float arm = pow(smoothstep(0.31, 0.99, armWave), 2.05);
        float feathers = pow(smoothstep(0.58, 0.99, secondaryWave), 3.1);
        float edgeFade = 1.0 - smoothstep(0.74, 1.035, radius);
        float innerFade = smoothstep(0.035, 0.16, radius);
        float dustLane = smoothstep(0.48, 0.79, ${dustLaneNoise});
        float granularDust = pow(smoothstep(0.18, 0.94, fineNoise), 1.7);
        float clumpNoise = ${clumpNoise};
        float clumps = smoothstep(0.34, 0.76, clumpNoise);
        float armDensity = (arm * 0.72 + feathers * 0.28) *
          (0.5 + granularDust * 0.5) * (0.55 + clumps * 0.45);
        armDensity *= mix(1.0, 0.4, dustLane) * innerFade * edgeFade;

        float coreNoise = ${coreNoise};
        float coreDistance = radius * (0.93 + coreNoise * 0.12);
        float shadow = 1.0 - smoothstep(
          shadowRadius * 0.38,
          shadowRadius * (1.68 + coreNoise * 0.42),
          coreDistance
        );
        float accretionWidth = 0.038 + coreNoise * 0.014;
        float accretion = exp(-pow((coreDistance - accretionRadius) / accretionWidth, 2.0));
        float lensing = exp(-pow((coreDistance - lensRadius) / 0.065, 2.0));
        float coreBloom = exp(-coreDistance * 8.2) * (1.0 - shadow * 0.86);

        float shineWave = 0.5 + 0.5 * cos(
          angle * 2.0 - warpedRadius * 15.0 - time * shineSpeed
        );
        float shine = pow(shineWave, 13.0) * (0.25 + arm * 0.75) * edgeFade;
        float peripheralDust = ${peripheralNoise} * edgeFade;
        float density = armDensity * 0.36 + peripheralDust * 0.045 +
          coreBloom * 0.25 + accretion * 0.24 + lensing * 0.075 + shine * 0.06;
        density *= 1.0 - shadow * 0.9;

        vec3 coldIvory = vec3(0.91, 0.94, 1.0);
        vec3 deepViolet = vec3(0.45, 0.16, 0.75);
        vec3 lavender = vec3(0.78, 0.45, 1.0);
        vec3 oldGold = vec3(0.54, 0.45, 0.31);
        vec3 color = mix(coldIvory, deepViolet, purpleMix * (0.7 + radius * 0.42));
        color *= 0.72 + granularDust * 0.4;
        color += deepViolet * arm * (0.18 + purpleMix * 0.28);
        color += lavender * (accretion * 0.66 + shine * 0.36 + lensing * 0.24);
        color += oldGold * coreBloom * 0.16;
        color *= 1.0 - shadow * 0.94;

        float alpha = density * (0.9 + broadNoise * 0.2) * edgeFade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createCoreOcclusionMaterial() {
  const coreExtent = titleSceneSpec.core.shadowRadius * 2.1;

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      shadowRadius: { value: titleSceneSpec.core.shadowRadius },
      coreExtent: { value: coreExtent }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float shadowRadius;
      uniform float coreExtent;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0 * coreExtent;
        float irregularity = mix(0.86, 1.14, hash21(floor(point * 88.0)));
        float coreDistance = length(point) * irregularity;
        float absorption = 1.0 - smoothstep(
          shadowRadius * 0.46,
          shadowRadius * 1.82,
          coreDistance
        );
        if (absorption < 0.006) discard;
        gl_FragColor = vec4(vec3(0.0006, 0.0008, 0.0018), absorption * 0.985);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createGalaxyDust(layout: ReturnType<typeof createSpiralGalaxyLayout>, pixelRatio: number): PointLayer {
  const sourceCount = layout.phases.length;
  const count = Math.max(1, Math.floor(sourceCount * 0.48));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const violet = new THREE.Color('#7f3fb2');
  const ivory = new THREE.Color('#c6b5d8');
  const oldGold = new THREE.Color(titleSceneSpec.palette.oldGold);

  for (let index = 0; index < count; index += 1) {
    const source = (index * 11 + 3) % sourceCount;
    const sourceOffset = source * 3;
    const targetOffset = index * 3;
    const phase = layout.phases[source];
    const temperature = layout.temperature[source];
    const color = violet.clone().lerp(ivory, 0.08 + temperature * 0.12);
    if (source % 17 === 0) {
      color.lerp(oldGold, 0.12);
    }
    positions[targetOffset] = layout.positions[sourceOffset] + Math.cos(phase) * 0.035;
    positions[targetOffset + 1] = layout.positions[sourceOffset + 1] + Math.sin(phase) * 0.035;
    positions[targetOffset + 2] = layout.positions[sourceOffset + 2] - 0.035;
    colors[targetOffset] = color.r;
    colors[targetOffset + 1] = color.g;
    colors[targetOffset + 2] = color.b;
    phases[index] = phase;
    sizes[index] = 1.3 + layout.sizes[source] * 1.35;
    brightness[index] = 0.12 + layout.brightness[source] * 0.24;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = createPointMaterial(pixelRatio, 112, 0.62, 0.16, 0.92, 1);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, material };
}

function createGalaxy(count: number, pixelRatio: number, compactQuality: boolean): GalaxyAssembly {
  const layout = createSpiralGalaxyLayout(count);
  const colors = new Float32Array(count * 3);
  const ivory = new THREE.Color('#e9e1eb');
  const coldWhite = new THREE.Color('#d7ddff');
  const mutedViolet = new THREE.Color('#b068e8');

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const temperature = layout.temperature[index];
    const color = mutedViolet.clone().lerp(coldWhite, 0.18 + temperature * 0.28);
    color.lerp(ivory, 0.08);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(layout.positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('phase', new THREE.BufferAttribute(layout.phases, 1));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(layout.sizes, 1));
  starGeometry.setAttribute('brightness', new THREE.BufferAttribute(layout.brightness, 1));
  starGeometry.computeBoundingSphere();

  const starMaterial = createPointMaterial(pixelRatio, 96, 0.72, 0.3, 0, 1);
  const starPoints = new THREE.Points(starGeometry, starMaterial);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = 2;
  const stars = { points: starPoints, material: starMaterial };
  const dust = createGalaxyDust(layout, pixelRatio);

  const discMaterial = createGalaxyDiscMaterial(compactQuality);
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(titleSceneSpec.galaxy.radius * 2, titleSceneSpec.galaxy.radius * 2),
    discMaterial
  );
  disc.position.z = -0.075;
  disc.renderOrder = 0;

  const coreMaterial = createCoreOcclusionMaterial();
  const coreExtent = titleSceneSpec.core.shadowRadius * 2.1;
  const coreOccluder = new THREE.Mesh(
    new THREE.PlaneGeometry(
      titleSceneSpec.galaxy.radius * 2 * coreExtent,
      titleSceneSpec.galaxy.radius * 2 * coreExtent
    ),
    coreMaterial
  );
  coreOccluder.position.z = 0.24;
  coreOccluder.renderOrder = 4;

  const group = new THREE.Group();
  group.position.set(0, 1.55, -18);
  const parallaxGroup = new THREE.Group();
  const growthGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.rotation.x = Math.acos(titleSceneSpec.galaxy.verticalScale);
  spinGroup.add(disc, dust.points, stars.points, coreOccluder);
  tiltGroup.add(spinGroup);
  growthGroup.add(tiltGroup);
  parallaxGroup.add(growthGroup);
  group.add(parallaxGroup);

  return {
    group,
    parallaxGroup,
    growthGroup,
    spinGroup,
    stars,
    dust,
    discMaterial,
    coreMaterial
  };
}

function createTitleAssembly(textures: ConcreteTextureSet): TitleAssembly {
  const group = new THREE.Group();
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concrete,
    map: textures.color,
    bumpMap: textures.bump,
    bumpScale: titleSceneSpec.title.bumpScale,
    roughnessMap: textures.roughness,
    roughness: titleSceneSpec.title.roughness,
    metalness: titleSceneSpec.title.metalness,
    emissive: 0x0c0b10,
    emissiveIntensity: 0.012
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concreteShadow,
    map: textures.color,
    bumpMap: textures.bump,
    bumpScale: titleSceneSpec.title.bumpScale * 0.72,
    roughnessMap: textures.roughness,
    roughness: titleSceneSpec.title.sideRoughness,
    metalness: titleSceneSpec.title.metalness,
    emissive: 0x080810,
    emissiveIntensity: 0.01
  });
  const layout = layoutBrutalistGlyphs(
    titleSceneSpec.title.text,
    titleSceneSpec.title.height
  );
  const createdGeometries: THREE.BufferGeometry[] = [];

  try {
    layout.placements.forEach(({ character, glyph, x, index }) => {
      const geometry = createBrutalistGlyphGeometry(glyph, {
        height: titleSceneSpec.title.height,
        depth: titleSceneSpec.title.depth,
        bevelSize: titleSceneSpec.title.bevelSize,
        bevelThickness: titleSceneSpec.title.bevelThickness,
        uvOffset: [index * 0.173, index * 0.097]
      });
      createdGeometries.push(geometry);

      const mesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
      mesh.name = `warpkeep-title-${character}-${index}`;
      mesh.position.x = x - layout.width * 0.5;
      group.add(mesh);
    });
  } catch (error) {
    createdGeometries.forEach((geometry) => geometry.dispose());
    faceMaterial.dispose();
    sideMaterial.dispose();
    throw error;
  }

  group.position.set(0, -1.52, 0.28);
  const safeWidth = layout.width + titleSceneSpec.title.depth * 0.22;
  return { group, safeWidth };
}

function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, textures: THREE.Texture[]) {
  const geometries = new Set<string>();
  const materials = new Set<string>();

  scene.traverse((object) => {
    const drawable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (drawable.geometry && !geometries.has(drawable.geometry.uuid)) {
      geometries.add(drawable.geometry.uuid);
      drawable.geometry.dispose();
    }

    const objectMaterials = drawable.material
      ? Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material]
      : [];

    objectMaterials.forEach((material) => {
      if (!materials.has(material.uuid)) {
        materials.add(material.uuid);
        material.dispose();
      }
    });
  });

  textures.forEach((texture) => texture.dispose());
  renderer.renderLists.dispose();
  renderer.dispose();
}

export function WarpkeepTitleScreen3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return undefined;
    }

    if (!canUseWebGL()) {
      setFallback(true);
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
    let pointerResetHandler: (() => void) | null = null;
    let contextLostHandler: ((event: Event) => void) | null = null;
    let visibilityChangeHandler: (() => void) | null = null;
    let disposed = false;
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    const textures: THREE.Texture[] = [];

    const teardown = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      resizeObserver?.disconnect();
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (pointerMoveHandler) {
        container.removeEventListener('pointermove', pointerMoveHandler);
      }
      if (pointerResetHandler) {
        container.removeEventListener('pointerleave', pointerResetHandler);
        window.removeEventListener('blur', pointerResetHandler);
      }
      if (contextLostHandler && renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', contextLostHandler);
      }
      if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
      }
      if (scene && renderer) {
        disposeScene(scene, renderer, textures);
      }
      renderer?.domElement.remove();
    };

    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const initialWidth = Math.max(1, Math.round(container.clientWidth));
      const initialHeight = Math.max(1, Math.round(container.clientHeight));
      const initialPortrait = initialWidth / initialHeight < 0.78;
      const compactGalaxyQuality = Math.min(initialWidth, initialHeight) < 720;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(titleSceneSpec.palette.void);

      const camera = new THREE.PerspectiveCamera(39, initialWidth / initialHeight, 0.1, 100);
      camera.position.set(0, 0.18, 10.8);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(initialWidth, initialHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.className = 'warpkeep-title-canvas';
      container.appendChild(renderer.domElement);
      contextLostHandler = (event: Event) => {
        event.preventDefault();
        teardown();
        setFallback(true);
      };
      renderer.domElement.addEventListener('webglcontextlost', contextLostHandler);

      const pointerPerspectiveEnabled =
        !prefersReducedMotion && window.matchMedia('(pointer: fine)').matches;
      if (pointerPerspectiveEnabled) {
        pointerMoveHandler = (event: PointerEvent) => {
          if (!isMousePointerType(event.pointerType)) {
            return;
          }
          const normalized = normalizePointerPosition(
            event.clientX,
            event.clientY,
            container.getBoundingClientRect()
          );
          pointerTarget.x = normalized.x;
          pointerTarget.y = normalized.y;
        };
        pointerResetHandler = () => {
          pointerTarget.x = 0;
          pointerTarget.y = 0;
        };
        container.addEventListener('pointermove', pointerMoveHandler, { passive: true });
        container.addEventListener('pointerleave', pointerResetHandler);
        window.addEventListener('blur', pointerResetHandler);
      }

      const backgroundStars = createBackgroundStars(
        initialPortrait
          ? titleSceneSpec.galaxy.mobileBackgroundStars
          : titleSceneSpec.galaxy.desktopBackgroundStars,
        pixelRatio
      );
      scene.add(backgroundStars.points);

      const galaxy = createGalaxy(
        initialPortrait
          ? titleSceneSpec.galaxy.mobileParticleCount
          : titleSceneSpec.galaxy.desktopParticleCount,
        pixelRatio,
        compactGalaxyQuality
      );
      scene.add(galaxy.group);

      const concreteTextures = createConcreteTextures();
      const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      [concreteTextures.color, concreteTextures.bump, concreteTextures.roughness].forEach((texture) => {
        texture.anisotropy = maxAnisotropy;
        textures.push(texture);
      });
      const title = createTitleAssembly(concreteTextures);
      scene.add(title.group);

      scene.add(new THREE.AmbientLight(0x111522, 0.3));
      scene.add(new THREE.HemisphereLight(0xe6e2d6, 0x050711, 0.72));

      const keyLight = new THREE.DirectionalLight(0xfff7e8, 2.45);
      keyLight.position.set(-3.4, 5.8, 8.6);
      scene.add(keyLight);

      const sweepLight = new THREE.SpotLight(0xf7f2e8, 48, 36, 0.64, 0.92, 1.25);
      sweepLight.position.set(-5.8, 4.2, 8.5);
      sweepLight.target.position.set(0, -0.7, 0);
      scene.add(sweepLight, sweepLight.target);

      const violetRimLight = new THREE.PointLight(0x7651a3, 21, 28, 1.75);
      violetRimLight.position.set(0, 1.3, -4.8);
      scene.add(violetRimLight);

      const neutralFillLight = new THREE.PointLight(0xb8b0a5, 5.5, 22, 1.65);
      neutralFillLight.position.set(-6, -1.4, 4.5);
      scene.add(neutralFillLight);

      let titleBaseY = -1.52;
      let galaxyBaseY = 1.55;
      let galaxyLayoutScale = 1;
      let cameraTargetY = -0.42;
      let titleRestYaw = THREE.MathUtils.degToRad(-1.1);
      let cameraDriftX = 0.1;
      const resize = () => {
        if (!renderer || !scene || disposed) {
          return;
        }

        const width = Math.max(1, Math.round(container.clientWidth));
        const height = Math.max(1, Math.round(container.clientHeight));
        const aspect = width / height;
        const portrait = aspect < 0.78;
        const shortLandscape = !portrait && height < 460;
        const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
        renderer.setPixelRatio(nextPixelRatio);
        renderer.setSize(width, height, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        const titleDistance = camera.position.z - title.group.position.z;
        const titleVisibleHeight = 2 * titleDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const titleVisibleWidth = titleVisibleHeight * aspect;
        const titleLayout = calculateTitleResponsiveLayout(
          width,
          height,
          titleVisibleWidth,
          title.safeWidth
        );
        title.group.scale.setScalar(titleLayout.scale);
        titleBaseY = titleLayout.baseY;
        cameraTargetY = titleLayout.cameraTargetY;
        titleRestYaw = titleLayout.restYawRadians;
        cameraDriftX = titleLayout.cameraDriftX;

        const galaxyDistance = camera.position.z - galaxy.group.position.z;
        const galaxyVisibleHeight = 2 * galaxyDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const galaxyVisibleWidth = galaxyVisibleHeight * aspect;
        const desiredGalaxyWidth = galaxyVisibleWidth * (
          portrait
            ? titleSceneSpec.galaxy.portraitViewportWidth
            : titleSceneSpec.galaxy.desktopViewportWidth
        );
        const desiredGalaxyHeight = galaxyVisibleHeight * (
          portrait
            ? titleSceneSpec.galaxy.portraitViewportHeight
            : titleSceneSpec.galaxy.desktopViewportHeight
        );
        const galaxyDiameter = titleSceneSpec.galaxy.radius * 2;
        galaxyLayoutScale = THREE.MathUtils.clamp(
          Math.min(
            desiredGalaxyWidth / galaxyDiameter,
            desiredGalaxyHeight / (galaxyDiameter * titleSceneSpec.galaxy.verticalScale)
          ),
          0.42,
          2.25
        );
        galaxy.group.scale.setScalar(galaxyLayoutScale);
        galaxyBaseY = portrait
          ? 2.8
          : shortLandscape
            ? titleSceneSpec.galaxy.shortLandscapeBaseY
            : 1.55;
        galaxy.group.position.y = galaxyBaseY;

        [backgroundStars.material, galaxy.stars.material, galaxy.dust.material].forEach((material) => {
          material.uniforms.pixelRatio.value = nextPixelRatio;
        });
      };

      let previousFrameTime = performance.now();
      let visibleElapsed = 0;
      let pageVisible = !document.hidden;
      visibilityChangeHandler = () => {
        pageVisible = !document.hidden;
        previousFrameTime = performance.now();
      };
      document.addEventListener('visibilitychange', visibilityChangeHandler);
      const titleRestPitch = THREE.MathUtils.degToRad(-2.1);

      const render = () => {
        if (!renderer || !scene || disposed) {
          return;
        }

        const frameTime = performance.now();
        const rawDelta = Math.max(0, (frameTime - previousFrameTime) / 1000);
        previousFrameTime = frameTime;
        const visibleDelta = prefersReducedMotion || !pageVisible
          ? 0
          : rawDelta;
        const dampingDelta = Math.min(0.05, visibleDelta);
        visibleElapsed += visibleDelta;
        const shaderTime = prefersReducedMotion ? 7.5 : visibleElapsed;

        if (!prefersReducedMotion) {
          pointerCurrent.x = dampValue(
            pointerCurrent.x,
            pointerTarget.x,
            dampingDelta,
            titleSceneSpec.interaction.damping
          );
          pointerCurrent.y = dampValue(
            pointerCurrent.y,
            pointerTarget.y,
            dampingDelta,
            titleSceneSpec.interaction.damping
          );
        }

        backgroundStars.material.uniforms.time.value = shaderTime;
        galaxy.stars.material.uniforms.time.value = shaderTime;
        galaxy.dust.material.uniforms.time.value = shaderTime;
        galaxy.discMaterial.uniforms.time.value = shaderTime;

        backgroundStars.points.rotation.z = visibleElapsed * 0.00065;
        backgroundStars.points.rotation.x = pointerCurrent.y * 0.003;
        backgroundStars.points.rotation.y = pointerCurrent.x * -0.004;

        galaxy.spinGroup.rotation.z = -0.13 +
          visibleElapsed * (Math.PI * 2) / titleSceneSpec.galaxy.rotationPeriodSeconds;
        galaxy.growthGroup.scale.setScalar(calculateGalaxyGrowth(visibleElapsed));
        galaxy.parallaxGroup.rotation.x =
          pointerCurrent.y * titleSceneSpec.interaction.galaxyRotationX;
        galaxy.parallaxGroup.rotation.y =
          pointerCurrent.x * -titleSceneSpec.interaction.galaxyRotationY;
        galaxy.group.position.x =
          Math.sin(visibleElapsed * 0.05) * 0.065 -
          pointerCurrent.x * titleSceneSpec.interaction.galaxyTravelX;
        galaxy.group.position.y =
          galaxyBaseY + pointerCurrent.y * titleSceneSpec.interaction.galaxyTravelY;

        title.group.rotation.y =
          titleRestYaw + Math.sin(visibleElapsed * 0.1) * 0.008 +
          pointerCurrent.x * titleSceneSpec.interaction.titleRotationY;
        title.group.rotation.x =
          titleRestPitch + Math.sin(visibleElapsed * 0.075 + 0.7) * 0.0028 -
          pointerCurrent.y * titleSceneSpec.interaction.titleRotationX;
        title.group.position.y = titleBaseY + Math.sin(visibleElapsed * 0.13) * 0.018;

        const lightCycle = (shaderTime / titleSceneSpec.title.shinePeriodSeconds) * Math.PI * 2;
        sweepLight.position.x =
          Math.sin(lightCycle) * 6.8 +
          pointerCurrent.x * titleSceneSpec.interaction.lightTravelX;
        sweepLight.position.y =
          4.1 + Math.cos(lightCycle * 0.72) * 0.52 +
          pointerCurrent.y * titleSceneSpec.interaction.lightTravelY;
        sweepLight.target.position.set(
          pointerCurrent.x * 1.1,
          titleBaseY + pointerCurrent.y * 0.32,
          0
        );
        sweepLight.intensity = 46 + Math.sin(lightCycle + 0.4) * 5;
        keyLight.position.x = -3.4 + pointerCurrent.x * 2.1;
        keyLight.position.y = 5.8 + pointerCurrent.y * 1.15;
        violetRimLight.position.x = pointerCurrent.x * 2.6;
        violetRimLight.position.y = 1.3 + pointerCurrent.y * 1.2;
        violetRimLight.intensity = 24 + Math.sin(shaderTime * 0.36) * 3;
        neutralFillLight.position.x = -6 + pointerCurrent.x * 0.65;

        camera.position.x =
          Math.sin(visibleElapsed * 0.052) * cameraDriftX +
          pointerCurrent.x * titleSceneSpec.interaction.cameraTravelX;
        camera.position.y =
          0.18 + Math.cos(visibleElapsed * 0.046) * 0.04 +
          pointerCurrent.y * titleSceneSpec.interaction.cameraTravelY;
        camera.lookAt(
          pointerCurrent.x * titleSceneSpec.interaction.cameraTargetX,
          cameraTargetY + pointerCurrent.y * titleSceneSpec.interaction.cameraTargetY,
          -1.4
        );
        renderer.render(scene, camera);

        if (!prefersReducedMotion) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      const handleResize = () => {
        resize();
        if (prefersReducedMotion) {
          render();
        }
      };

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      resize();
      render();

      return teardown;
    } catch (error) {
      teardown();
      console.error('Warpkeep brutalist title screen setup failed:', error);
      setFallback(true);
      return undefined;
    }
  }, []);

  if (fallback) {
    return <WarpkeepTitleScreenFallback />;
  }

  return (
    <main className="warpkeep-title-screen" aria-label="Warpkeep title screen">
      <div ref={mountRef} className="warpkeep-title-canvas-shell" aria-hidden="true" />
      <h1 className="sr-only">{titleSceneSpec.title.text}</h1>
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}
