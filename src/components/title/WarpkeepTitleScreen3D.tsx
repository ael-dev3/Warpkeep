import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import helvetikerBold from '../../assets/fonts/helvetiker_bold.typeface.json';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { WarpkeepTitleScreenFallback } from './WarpkeepTitleScreenFallback';
import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { createSpiralGalaxyLayout, titleSceneSpec } from './titleSceneSpec';
import './WarpkeepTitleScreen.css';

type PointLayer = {
  material: THREE.ShaderMaterial;
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
};

type GalaxyAssembly = PointLayer & {
  group: THREE.Group;
  discMaterial: THREE.ShaderMaterial;
};

type RiftAssembly = {
  group: THREE.Group;
  ringMaterial: THREE.ShaderMaterial;
  energyMaterial: THREE.ShaderMaterial;
  energyPoints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  innerRing: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
};

type TitleAssembly = {
  group: THREE.Group;
  width: number;
};

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
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

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable for procedural glow texture.');
  }

  const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  glow.addColorStop(0, 'rgba(255,255,255,0.96)');
  glow.addColorStop(0.12, 'rgba(255,255,255,0.56)');
  glow.addColorStop(0.42, 'rgba(255,255,255,0.16)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createPointMaterial(pixelRatio: number, pointScale: number, opacity: number, flickerSpeed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: pixelRatio },
      pointScale: { value: pointScale },
      layerOpacity: { value: opacity },
      flickerSpeed: { value: flickerSpeed }
    },
    vertexShader: `
      attribute float phase;
      attribute float size;
      attribute float brightness;
      varying float vBrightness;
      varying float vPhase;
      varying vec3 vColor;
      uniform float time;
      uniform float pixelRatio;
      uniform float pointScale;
      uniform float flickerSpeed;

      void main() {
        vBrightness = brightness;
        vPhase = phase;
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float flicker = 0.93 + 0.07 * sin(time * flickerSpeed + phase);
        gl_PointSize = clamp(size * pixelRatio * pointScale * flicker / max(8.0, -viewPosition.z), 1.0, 12.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying float vPhase;
      varying vec3 vColor;
      uniform float time;
      uniform float layerOpacity;
      uniform float flickerSpeed;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        float core = 1.0 - smoothstep(0.045, 0.5, radius);
        float horizontalFlare = exp(-abs(centered.y) * 38.0) * (1.0 - smoothstep(0.02, 0.48, abs(centered.x)));
        float verticalFlare = exp(-abs(centered.x) * 42.0) * (1.0 - smoothstep(0.02, 0.46, abs(centered.y)));
        float starShape = max(core, (horizontalFlare + verticalFlare) * 0.16);
        float flicker = 0.94 + 0.06 * sin(time * flickerSpeed + vPhase);
        float alpha = starShape * vBrightness * layerOpacity * flicker;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(vColor, alpha);
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

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const brightSystem = random() > 0.965;
    const color = cold.clone().lerp(violet, random() * 0.34);
    positions[i] = (random() - 0.5) * 46;
    positions[i + 1] = (random() - 0.5) * 28 + 1.2;
    positions[i + 2] = -8 - random() * 56;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = brightSystem ? 2.2 + random() * 1.4 : 0.58 + random() * 1.05;
    brightness[index] = brightSystem ? 0.72 + random() * 0.26 : 0.18 + random() * 0.58;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = createPointMaterial(pixelRatio, 84, 0.86, 0.42);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

function createGalaxyDiscMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 }
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

      void main() {
        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float radius = length(p);
        if (radius > 1.0) discard;

        float angle = atan(p.y, p.x);
        float wave = 0.5 + 0.5 * cos(angle * 4.0 - radius * 20.5 + time * 0.015);
        float arm = pow(smoothstep(0.56, 0.98, wave), 1.7);
        float innerFade = smoothstep(0.08, 0.22, radius);
        float edgeFade = 1.0 - smoothstep(0.7, 1.0, radius);
        float dustVariation = 0.88 + 0.12 * sin(angle * 11.0 + radius * 37.0);
        float core = 1.0 - smoothstep(0.02, 0.24, radius);
        float alpha = (arm * 0.105 * innerFade * edgeFade + core * 0.075) * dustVariation;

        vec3 ivory = vec3(0.9, 0.92, 0.98);
        vec3 violet = vec3(0.38, 0.27, 0.6);
        vec3 color = mix(ivory, violet, 0.32 + radius * 0.42);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function createGalaxy(count: number, pixelRatio: number, glowTexture: THREE.Texture): GalaxyAssembly {
  const layout = createSpiralGalaxyLayout(count);
  const colors = new Float32Array(count * 3);
  const ivory = new THREE.Color('#f6f3ea');
  const coldWhite = new THREE.Color('#d9e5ff');
  const mutedViolet = new THREE.Color('#8d78c4');

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const base = ivory.clone().lerp(coldWhite, layout.temperature[index] * 0.48);
    base.lerp(mutedViolet, Math.max(0, layout.temperature[index] - 0.42) * 0.72);
    colors[i] = base.r;
    colors[i + 1] = base.g;
    colors[i + 2] = base.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(layout.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(layout.phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(layout.sizes, 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(layout.brightness, 1));
  geometry.computeBoundingSphere();

  const material = createPointMaterial(pixelRatio, 92, 0.88, 0.28);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const group = new THREE.Group();
  group.position.set(0, 1.28, -18);
  group.rotation.z = -0.13;

  const discMaterial = createGalaxyDiscMaterial();
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(
      titleSceneSpec.galaxy.radius * 2,
      titleSceneSpec.galaxy.radius * 2 * titleSceneSpec.galaxy.verticalScale
    ),
    discMaterial
  );
  disc.position.z = -0.22;
  group.add(disc);
  group.add(points);

  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xb49be8,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  coreGlow.position.z = -0.24;
  coreGlow.scale.set(4.8, 3.35, 1);
  group.add(coreGlow);

  return { group, points, material, discMaterial };
}

function createRift(pixelRatio: number, glowTexture: THREE.Texture): RiftAssembly {
  const group = new THREE.Group();
  group.position.z = 0.55;

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: titleSceneSpec.palette.warp,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  halo.scale.setScalar(titleSceneSpec.rift.haloRadius * 2);
  halo.position.z = -0.08;
  group.add(halo);

  const ringMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      pulse: { value: 1 }
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vLocalPosition;
      uniform float time;
      uniform float pulse;

      void main() {
        float angle = atan(vLocalPosition.y, vLocalPosition.x);
        float sweep = 0.55 + 0.45 * sin(angle * 3.0 - time * 0.46);
        float quietVariation = 0.88 + 0.12 * sin(angle * 7.0 + time * 0.19);
        vec3 violet = vec3(0.43, 0.28, 0.72);
        vec3 pale = vec3(0.78, 0.69, 1.0);
        vec3 color = mix(violet, pale, sweep * 0.32);
        gl_FragColor = vec4(color, (0.18 + sweep * 0.24) * quietVariation * pulse);
      }
    `
  });

  const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.78, 128, 1), ringMaterial);
  innerRing.scale.y = 0.46;
  innerRing.position.z = 0.08;
  group.add(innerRing);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 0.86, 128, 1),
    new THREE.MeshBasicMaterial({
      color: 0x6e4fa7,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  outerRing.scale.y = 0.5;
  outerRing.rotation.z = -0.32;
  outerRing.position.z = 0.04;
  group.add(outerRing);

  const eventHorizon = new THREE.Mesh(
    new THREE.CircleGeometry(titleSceneSpec.rift.radius, 96),
    new THREE.MeshBasicMaterial({ color: 0x000105, transparent: true, opacity: 0.99, depthWrite: false })
  );
  eventHorizon.scale.set(1, 0.72, 1);
  eventHorizon.rotation.z = 0.12;
  eventHorizon.position.z = 0.16;
  group.add(eventHorizon);

  const count = titleSceneSpec.rift.energyParticleCount;
  const random = createRandom(0x52494654);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const violet = new THREE.Color('#8f68d3');
  const pale = new THREE.Color('#d8c9ff');

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    const radiusRatio = Math.pow(random(), 0.74);
    const radius = 0.58 + radiusRatio * 1.6;
    const angle = random() * Math.PI * 2 + radiusRatio * 5.4;
    const color = violet.clone().lerp(pale, random() * 0.38);
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius * 0.58;
    positions[i + 2] = (random() - 0.5) * 0.24;
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 0.45 + random() * 0.78;
    brightness[index] = (1 - radiusRatio) * 0.42 + 0.16 + random() * 0.2;
  }

  const energyGeometry = new THREE.BufferGeometry();
  energyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  energyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  energyGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  energyGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  energyGeometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const energyMaterial = createPointMaterial(pixelRatio, 92, 0.54, 0.35);
  const energyPoints = new THREE.Points(energyGeometry, energyMaterial);
  energyPoints.frustumCulled = false;
  group.add(energyPoints);

  return { group, ringMaterial, energyMaterial, energyPoints, innerRing };
}

function createTitleAssembly(): TitleAssembly {
  const font = new FontLoader().parse(helvetikerBold);
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concrete,
    roughness: titleSceneSpec.title.roughness,
    metalness: titleSceneSpec.title.metalness,
    emissive: 0x171327,
    emissiveIntensity: 0.03
  });
  const shadowedConcrete = new THREE.MeshStandardMaterial({
    color: titleSceneSpec.palette.concreteShadow,
    roughness: 0.88,
    metalness: 0.01,
    emissive: 0x0b0912,
    emissiveIntensity: 0.02
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xc6b8e8,
    transparent: true,
    opacity: 0.09,
    depthWrite: false
  });
  const letterGap = 0.13;
  const letters: Array<{ group: THREE.Group; width: number }> = [];

  for (const character of titleSceneSpec.title.text) {
    const geometry = new TextGeometry(character, {
      font,
      size: 2.12,
      depth: titleSceneSpec.title.depth,
      curveSegments: 4,
      bevelEnabled: true,
      bevelThickness: titleSceneSpec.title.bevelThickness,
      bevelSize: titleSceneSpec.title.bevelSize,
      bevelOffset: 0,
      bevelSegments: 2
    });
    geometry.scale(0.96, 1.08, 1);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) {
      geometry.dispose();
      throw new Error(`Unable to measure title character: ${character}`);
    }

    const width = bounds.max.x - bounds.min.x;
    const centerY = (bounds.min.y + bounds.max.y) * 0.5;
    geometry.translate(-bounds.min.x, -centerY, -titleSceneSpec.title.depth * 0.5);
    geometry.computeVertexNormals();

    const letter = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, [concrete, shadowedConcrete]);
    letter.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 34), edgeMaterial);
    edges.renderOrder = 2;
    letter.add(edges);
    letters.push({ group: letter, width });
  }

  const totalWidth = letters.reduce((sum, letter) => sum + letter.width, 0) + letterGap * (letters.length - 1);
  let cursor = -totalWidth * 0.5;
  letters.forEach((letter) => {
    letter.group.position.x = cursor;
    group.add(letter.group);
    cursor += letter.width + letterGap;
  });

  group.position.set(0, -1.58, 0.25);
  return { group, width: totalWidth };
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
    let disposed = false;
    const textures: THREE.Texture[] = [];

    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const initialWidth = Math.max(320, container.clientWidth);
      const initialHeight = Math.max(420, container.clientHeight);
      const initialPortrait = initialWidth / initialHeight < 0.78;
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

      const glowTexture = createGlowTexture();
      textures.push(glowTexture);
      const backgroundStars = createBackgroundStars(
        initialPortrait ? titleSceneSpec.galaxy.mobileBackgroundStars : titleSceneSpec.galaxy.desktopBackgroundStars,
        pixelRatio
      );
      scene.add(backgroundStars.points);

      const galaxy = createGalaxy(
        initialPortrait ? titleSceneSpec.galaxy.mobileParticleCount : titleSceneSpec.galaxy.desktopParticleCount,
        pixelRatio,
        glowTexture
      );
      scene.add(galaxy.group);

      const rift = createRift(pixelRatio, glowTexture);
      galaxy.group.add(rift.group);

      const title = createTitleAssembly();
      scene.add(title.group);

      scene.add(new THREE.AmbientLight(0x1a1d2b, 0.58));
      scene.add(new THREE.HemisphereLight(0xf4f2ea, 0x090b18, 1.2));

      const keyLight = new THREE.DirectionalLight(0xfffdf5, 2.5);
      keyLight.position.set(-2.8, 5.4, 8.5);
      scene.add(keyLight);

      const sweepLight = new THREE.SpotLight(0xffffff, 58, 32, 0.42, 0.72, 1.4);
      sweepLight.position.set(-5.5, 3.8, 8.4);
      sweepLight.target.position.set(0, -0.7, 0);
      scene.add(sweepLight, sweepLight.target);

      const warpRimLight = new THREE.PointLight(0x855ac8, 26, 28, 1.7);
      warpRimLight.position.set(0, 1.4, -5.2);
      scene.add(warpRimLight);

      let titleBaseY = -1.58;
      let cameraTargetY = -0.55;
      const resize = () => {
        if (!renderer || !scene || disposed) {
          return;
        }

        const width = Math.max(1, Math.round(container.clientWidth));
        const height = Math.max(1, Math.round(container.clientHeight));
        const aspect = width / height;
        const portrait = aspect < 0.78;
        const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
        renderer.setPixelRatio(nextPixelRatio);
        renderer.setSize(width, height, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        const titleDistance = camera.position.z - title.group.position.z;
        const titleVisibleHeight = 2 * titleDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const titleVisibleWidth = titleVisibleHeight * aspect;
        const titleWidthRatio = portrait
          ? titleSceneSpec.title.mobileViewportWidth
          : titleSceneSpec.title.desktopViewportWidth;
        const titleScale = Math.min(1.16, (titleVisibleWidth * titleWidthRatio) / title.width);
        title.group.scale.setScalar(titleScale);
        titleBaseY = portrait ? -0.46 : -1.58;
        cameraTargetY = portrait ? 0.08 : -0.42;

        const galaxyDistance = camera.position.z - galaxy.group.position.z;
        const galaxyVisibleHeight = 2 * galaxyDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const galaxyVisibleWidth = galaxyVisibleHeight * aspect;
        const desiredGalaxyWidth = galaxyVisibleWidth * (portrait ? 0.84 : 0.48);
        const desiredGalaxyHeight = galaxyVisibleHeight * (portrait ? 0.42 : 0.5);
        const galaxyDiameter = titleSceneSpec.galaxy.radius * 2;
        const galaxyScale = THREE.MathUtils.clamp(
          Math.min(
            desiredGalaxyWidth / galaxyDiameter,
            desiredGalaxyHeight / (galaxyDiameter * titleSceneSpec.galaxy.verticalScale)
          ),
          0.42,
          1.42
        );
        galaxy.group.scale.setScalar(galaxyScale);
        galaxy.group.position.y = portrait ? 2.8 : 3.35;

        [backgroundStars.material, galaxy.material, rift.energyMaterial].forEach((material) => {
          material.uniforms.pixelRatio.value = nextPixelRatio;
        });
      };

      const startTime = performance.now();

      const render = () => {
        if (!renderer || !scene || disposed) {
          return;
        }

        const elapsed = prefersReducedMotion ? 7.5 : (performance.now() - startTime) / 1000;
        backgroundStars.material.uniforms.time.value = elapsed;
        galaxy.material.uniforms.time.value = elapsed;
        galaxy.discMaterial.uniforms.time.value = elapsed;
        rift.ringMaterial.uniforms.time.value = elapsed;
        rift.energyMaterial.uniforms.time.value = elapsed;

        backgroundStars.points.rotation.z = elapsed * 0.0007;
        galaxy.group.rotation.z = -0.13 + elapsed * 0.0024;
        galaxy.group.position.x = Math.sin(elapsed * 0.055) * 0.1;
        rift.energyPoints.rotation.z = -elapsed * 0.045;
        rift.innerRing.rotation.z = elapsed * 0.055;
        rift.ringMaterial.uniforms.pulse.value = 0.91 + Math.sin(elapsed * 0.52) * 0.09;

        title.group.rotation.y = Math.sin(elapsed * 0.12) * 0.012;
        title.group.rotation.x = Math.sin(elapsed * 0.09 + 0.7) * 0.004;
        title.group.position.y = titleBaseY + Math.sin(elapsed * 0.16) * 0.025;

        sweepLight.position.x = Math.sin(elapsed * 0.2) * 6.2;
        sweepLight.position.y = 3.6 + Math.cos(elapsed * 0.14) * 0.42;
        sweepLight.intensity = 53 + Math.sin(elapsed * 0.24) * 6;
        warpRimLight.intensity = 24 + Math.sin(elapsed * 0.48) * 3;

        camera.position.x = Math.sin(elapsed * 0.065) * 0.17;
        camera.position.y = 0.18 + Math.cos(elapsed * 0.057) * 0.07;
        camera.lookAt(0, cameraTargetY, -1.4);
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

      return () => {
        disposed = true;
        resizeObserver?.disconnect();
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        if (scene && renderer) {
          disposeScene(scene, renderer, textures);
        }
        renderer?.domElement.remove();
      };
    } catch (error) {
      disposed = true;
      resizeObserver?.disconnect();
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (scene && renderer) {
        disposeScene(scene, renderer, textures);
      }
      renderer?.domElement.remove();
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
