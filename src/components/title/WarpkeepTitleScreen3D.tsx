import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WarpkeepTitleScreenFallback } from './WarpkeepTitleScreenFallback';
import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { titleTheme } from './titleTheme';
import './WarpkeepTitleScreen.css';

type StarLayer = {
  material: THREE.ShaderMaterial;
  points: THREE.Points;
};

type StarNode = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  phase: number;
  baseScale: number;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function createTitleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 3072;
  canvas.height = 760;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable for title texture.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'miter';
  context.miterLimit = 2.8;

  let fontSize = 360;
  do {
    context.font = `900 ${fontSize}px Georgia, 'Times New Roman', serif`;
    fontSize -= 4;
  } while (context.measureText(titleTheme.title).width > canvas.width * 0.91 && fontSize > 170);

  const x = canvas.width / 2;
  const y = canvas.height * 0.55;
  const text = titleTheme.title;

  const titleGradient = context.createLinearGradient(0, y - 180, canvas.width, y + 210);
  titleGradient.addColorStop(0, '#553513');
  titleGradient.addColorStop(0.2, '#f4c86f');
  titleGradient.addColorStop(0.48, '#fff1bd');
  titleGradient.addColorStop(0.72, '#bc7929');
  titleGradient.addColorStop(1, '#3f260e');

  context.shadowColor = 'rgba(9, 8, 18, 0.9)';
  context.shadowBlur = 14;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 24;
  context.lineWidth = 64;
  context.strokeStyle = '#05040a';
  context.strokeText(text, x, y + 3);

  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 38;
  context.strokeStyle = '#161023';
  context.strokeText(text, x, y + 2);

  context.lineWidth = 14;
  context.strokeStyle = '#ffe49b';
  context.strokeText(text, x, y - 3);

  context.fillStyle = titleGradient;
  context.fillText(text, x, y);

  context.globalCompositeOperation = 'source-atop';
  const hardFacet = context.createLinearGradient(0, y - 230, 0, y + 230);
  hardFacet.addColorStop(0, 'rgba(255, 255, 255, 0.48)');
  hardFacet.addColorStop(0.27, 'rgba(255, 242, 190, 0.14)');
  hardFacet.addColorStop(0.5, 'rgba(50, 25, 68, 0.06)');
  hardFacet.addColorStop(0.72, 'rgba(0, 0, 0, 0.26)');
  hardFacet.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
  context.fillStyle = hardFacet;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const bevelBand = context.createLinearGradient(0, y - 55, canvas.width, y + 10);
  bevelBand.addColorStop(0, 'rgba(255, 255, 255, 0)');
  bevelBand.addColorStop(0.5, 'rgba(255, 255, 255, 0.26)');
  bevelBand.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = bevelBand;
  context.fillRect(0, y - 125, canvas.width, 92);
  context.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createNebulaTexture(primary: string, secondary: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable for nebula texture.');
  }

  const gradient = context.createRadialGradient(384, 384, 24, 384, 384, 384);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(0.44, secondary);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(991);
  for (let index = 0; index < 70; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 26 + random() * 72;
    const haze = context.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, `rgba(255,255,255,${0.012 + random() * 0.026})`);
    haze.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = haze;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createTitleMaterial(titleTexture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      titleMap: { value: titleTexture },
      time: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float time;

      void main() {
        vUv = uv;
        vec3 transformed = position;
        transformed.z += sin((position.x * 0.32) + time * 0.28) * 0.025;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D titleMap;
      uniform float time;
      varying vec2 vUv;

      void main() {
        vec4 texel = texture2D(titleMap, vUv);
        if (texel.a < 0.015) {
          discard;
        }

        float sweep = fract(time * 0.044);
        float glint = exp(-pow((vUv.x - sweep) * 18.0, 2.0));
        glint *= smoothstep(0.1, 0.34, vUv.y) * smoothstep(0.9, 0.56, vUv.y);

        float rimSweep = fract(time * 0.028 + 0.58);
        float rim = exp(-pow((vUv.x - rimSweep) * 26.0, 2.0)) * 0.2;
        float shimmer = 0.022 * sin(time * 0.9 + vUv.x * 16.0) + 0.014 * sin(time * 0.52 + vUv.y * 20.0);

        vec3 ivory = vec3(1.0, 0.95, 0.72);
        vec3 antiqueGold = vec3(0.96, 0.62, 0.2);
        vec3 coldEdge = vec3(0.22, 0.28, 0.48);
        vec3 color = texel.rgb * (1.0 + shimmer);
        color += ivory * glint * 0.58;
        color += antiqueGold * rim * 0.24;
        color += coldEdge * 0.024;

        gl_FragColor = vec4(color, texel.a);
      }
    `
  });
}

function createStarLayer(count: number, spread: number, depth: number, seed: number, color: string, size: number, pixelRatio: number) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;
    positions[i] = (random() - 0.5) * spread;
    positions[i + 1] = (random() - 0.5) * spread * 0.64 + 0.65;
    positions[i + 2] = -7 - random() * depth;
    phases[index] = random() * Math.PI * 2;
    alphas[index] = 0.2 + random() * 0.58;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(color) },
      baseSize: { value: size },
      pixelRatio: { value: pixelRatio }
    },
    vertexShader: `
      attribute float phase;
      attribute float alpha;
      varying float vPhase;
      varying float vAlpha;
      uniform float time;
      uniform float baseSize;
      uniform float pixelRatio;

      void main() {
        vPhase = phase;
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.86 + 0.14 * sin(time * 0.54 + phase);
        gl_PointSize = baseSize * pixelRatio * twinkle * (38.0 / max(8.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vPhase;
      varying float vAlpha;
      uniform float time;
      uniform vec3 color;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(centered);
        float star = smoothstep(0.48, 0.08, distanceToCenter);
        float pulse = 0.82 + 0.18 * sin(time * 0.44 + vPhase);
        gl_FragColor = vec4(color, star * vAlpha * pulse);
      }
    `
  });

  const points = new THREE.Points(geometry, material);
  return { points, material } satisfies StarLayer;
}

function addNebula(scene: THREE.Scene, texture: THREE.Texture, x: number, y: number, z: number, scale: number, opacity: number) {
  const geometry = new THREE.PlaneGeometry(scale, scale);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.z = x * 0.12;
  scene.add(mesh);
  return mesh;
}

function addStarSystems(scene: THREE.Scene) {
  const nodes: StarNode[] = [];
  const systemGroup = new THREE.Group();
  systemGroup.position.y = 0.12;
  scene.add(systemGroup);

  const systems = [
    { position: new THREE.Vector3(-4.9, 1.85, -17.5), radius: 0.066, color: 0xf2c978, phase: 0.2 },
    { position: new THREE.Vector3(3.9, 1.2, -21), radius: 0.054, color: 0xcfdcff, phase: 1.4 },
    { position: new THREE.Vector3(-1.2, 2.85, -28), radius: 0.044, color: 0xd2a0ff, phase: 2.8 },
    { position: new THREE.Vector3(5.4, -0.55, -27), radius: 0.038, color: 0xe1b064, phase: 4.1 },
    { position: new THREE.Vector3(-5.9, -0.25, -25), radius: 0.034, color: 0x9fb8ff, phase: 5.2 }
  ];

  systems.forEach((system, index) => {
    const geometry = new THREE.SphereGeometry(system.radius, 18, 12);
    const material = new THREE.MeshBasicMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(system.position);
    systemGroup.add(mesh);
    nodes.push({ mesh, phase: system.phase, baseScale: 1 + index * 0.07 });

    if (index < 3) {
      const points: THREE.Vector3[] = [];
      const radiusX = 0.42 - index * 0.06;
      const radiusY = radiusX * 0.34;
      const segments = 72;
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, 0));
      }
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const ringMaterial = new THREE.LineBasicMaterial({
        color: index === 0 ? 0xcfa35d : 0x758abf,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
      ring.position.copy(system.position);
      ring.rotation.x = 1.05 + index * 0.18;
      ring.rotation.y = -0.25 + index * 0.16;
      ring.rotation.z = index * 0.7;
      systemGroup.add(ring);
    }
  });

  const linePositions: number[] = [];
  [[0, 2], [1, 3]].forEach(([start, end]) => {
    const from = systems[start].position;
    const to = systems[end].position;
    linePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
  });
  const linesGeometry = new THREE.BufferGeometry();
  linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const linesMaterial = new THREE.LineBasicMaterial({
    color: 0x53679a,
    transparent: true,
    opacity: 0.075,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  systemGroup.add(new THREE.LineSegments(linesGeometry, linesMaterial));

  return { nodes, systemGroup };
}

function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, textures: THREE.Texture[]) {
  const geometries = new Set<string>();
  const materials = new Set<string>();

  scene.traverse((object) => {
    const maybeMesh = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (maybeMesh.geometry && !geometries.has(maybeMesh.geometry.uuid)) {
      geometries.add(maybeMesh.geometry.uuid);
      maybeMesh.geometry.dispose();
    }

    const objectMaterials = maybeMesh.material ? (Array.isArray(maybeMesh.material) ? maybeMesh.material : [maybeMesh.material]) : [];
    objectMaterials.forEach((material) => {
      if (!materials.has(material.uuid)) {
        materials.add(material.uuid);
        material.dispose();
      }
    });
  });

  textures.forEach((texture) => texture.dispose());
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

    let animationFrame = 0;
    let disposed = false;

    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x02030a, 0.022);

      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
      camera.position.set(0, 0.72, 10.1);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x02030a, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = 'warpkeep-title-canvas';
      container.appendChild(renderer.domElement);

      const titleTexture = createTitleTexture();
      const nebulaA = createNebulaTexture('rgba(53,38,102,0.32)', 'rgba(14,42,88,0.11)');
      const nebulaB = createNebulaTexture('rgba(132,86,49,0.14)', 'rgba(62,38,82,0.08)');
      const textures = [titleTexture, nebulaA, nebulaB];

      const starLayerA = createStarLayer(330, 24, 58, 1201, '#dbe7ff', 6.4, renderer.getPixelRatio());
      const starLayerB = createStarLayer(70, 17, 34, 1202, '#9faee6', 8.2, renderer.getPixelRatio());
      const starLayerC = createStarLayer(26, 13, 28, 1203, '#e4bd74', 9.8, renderer.getPixelRatio());
      const starLayers = [starLayerA, starLayerB, starLayerC];
      starLayers.forEach(({ points }) => scene.add(points));

      const nebulaMeshA = addNebula(scene, nebulaA, -3.6, 1.1, -29, 18, 0.26);
      const nebulaMeshB = addNebula(scene, nebulaB, 4.4, -0.75, -22, 14, 0.16);
      const { nodes, systemGroup } = addStarSystems(scene);

      const titleGeometry = new THREE.PlaneGeometry(9.7, 2.4, 32, 4);
      const titleMaterial = createTitleMaterial(titleTexture);
      const titleGroup = new THREE.Group();
      titleGroup.position.set(0, -1.03, 0);
      scene.add(titleGroup);

      const sideMaterial = new THREE.MeshBasicMaterial({
        map: titleTexture,
        color: 0x5a3615,
        transparent: true,
        opacity: 0.26,
        blending: THREE.NormalBlending,
        depthWrite: false
      });
      const depthMaterial = new THREE.MeshBasicMaterial({
        map: titleTexture,
        color: 0x130d22,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      for (let index = 11; index >= 1; index -= 1) {
        const layer = new THREE.Mesh(titleGeometry, index > 5 ? depthMaterial : sideMaterial);
        layer.position.set(index * -0.018, index * -0.024, -index * 0.045);
        layer.scale.set(1 + index * 0.0018, 1 + index * 0.0018, 1);
        titleGroup.add(layer);
      }

      const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
      titleGroup.add(titleMesh);

      const rimLight = new THREE.PointLight(0x6574b8, 1.25, 28);
      rimLight.position.set(-4.2, 3.1, 5);
      scene.add(rimLight);
      const sweepLight = new THREE.PointLight(0xf0c76b, 1.55, 22);
      sweepLight.position.set(4, 1.5, 4.5);
      scene.add(sweepLight);
      scene.add(new THREE.AmbientLight(0x3b426f, 0.34));

      let titleBaseY = -1.03;
      let cameraTargetY = -0.5;
      const resize = () => {
        const width = Math.max(320, container.clientWidth);
        const height = Math.max(420, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const visibleWidth = visibleHeight * camera.aspect;
        const isPortrait = camera.aspect < 0.72;
        const fitScale = Math.min(1, Math.max(isPortrait ? 0.4 : 0.34, (visibleWidth * (isPortrait ? 1.06 : 0.92)) / 9.7));
        titleGroup.scale.setScalar(fitScale);
        titleBaseY = isPortrait ? -0.38 : -1.03;
        cameraTargetY = isPortrait ? -0.12 : -0.5;

        starLayers.forEach(({ material }) => {
          material.uniforms.pixelRatio.value = renderer.getPixelRatio();
        });
      };

      resize();
      window.addEventListener('resize', resize);
      const startTime = performance.now();

      const render = () => {
        if (disposed) {
          return;
        }
        const elapsed = prefersReducedMotion ? 1.5 : (performance.now() - startTime) / 1000;

        starLayers.forEach(({ material }, index) => {
          material.uniforms.time.value = elapsed * (0.62 + index * 0.09);
        });
        titleMaterial.uniforms.time.value = elapsed;

        titleGroup.rotation.y = Math.sin(elapsed * 0.18) * 0.034;
        titleGroup.rotation.x = Math.sin(elapsed * 0.15 + 1.2) * 0.012;
        titleGroup.position.y = titleBaseY + Math.sin(elapsed * 0.22) * 0.032;

        starLayerA.points.rotation.z = elapsed * 0.0017;
        starLayerB.points.rotation.z = -elapsed * 0.0028;
        starLayerC.points.rotation.z = elapsed * 0.0035;
        systemGroup.rotation.z = Math.sin(elapsed * 0.06) * 0.014;
        systemGroup.rotation.y = Math.sin(elapsed * 0.05) * 0.012;
        nebulaMeshA.rotation.z = elapsed * 0.0028;
        nebulaMeshB.rotation.z = -elapsed * 0.0036;

        sweepLight.position.set(Math.sin(elapsed * 0.34) * 5.2, 1.6 + Math.cos(elapsed * 0.18) * 0.34, 4.5 + Math.cos(elapsed * 0.26) * 0.9);
        rimLight.position.x = -4.2 + Math.sin(elapsed * 0.16) * 0.42;

        nodes.forEach(({ mesh, phase, baseScale }) => {
          const pulse = baseScale * (0.92 + 0.1 * Math.sin(elapsed * 0.5 + phase));
          mesh.scale.setScalar(pulse);
          mesh.material.opacity = 0.46 + 0.16 * Math.sin(elapsed * 0.46 + phase) ** 2;
        });

        camera.position.x = Math.sin(elapsed * 0.1) * 0.16;
        camera.position.y = 0.72 + Math.cos(elapsed * 0.09) * 0.075;
        camera.lookAt(0, cameraTargetY, -1.2);

        renderer.render(scene, camera);
        if (!prefersReducedMotion) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      render();

      return () => {
        disposed = true;
        window.removeEventListener('resize', resize);
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        disposeScene(scene, renderer, textures);
        renderer.domElement.remove();
      };
    } catch (error) {
      console.error('Warpkeep title screen WebGL setup failed:', error);
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
      <h1 className="sr-only">{titleTheme.title}</h1>
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}
