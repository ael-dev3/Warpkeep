import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WarpkeepTitleScreenFallback } from './WarpkeepTitleScreenFallback';
import { titleTheme } from './titleTheme';
import './WarpkeepTitleScreen.css';

interface WarpkeepTitleScreen3DProps {
  onEnterCastle: () => void;
}

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
  canvas.width = 2048;
  canvas.height = 560;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable for title texture.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  let fontSize = 260;
  do {
    context.font = `900 ${fontSize}px Georgia, 'Times New Roman', serif`;
    fontSize -= 4;
  } while (context.measureText(titleTheme.title).width > canvas.width * 0.9 && fontSize > 130);

  const x = canvas.width / 2;
  const y = canvas.height * 0.53;
  const gradient = context.createLinearGradient(0, canvas.height * 0.2, canvas.width, canvas.height * 0.8);
  gradient.addColorStop(0, '#6f4b1e');
  gradient.addColorStop(0.18, '#fff2ba');
  gradient.addColorStop(0.48, '#d7a44c');
  gradient.addColorStop(0.72, '#fff8d7');
  gradient.addColorStop(1, '#80541e');

  context.shadowColor = 'rgba(55, 25, 120, 0.72)';
  context.shadowBlur = 48;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 18;
  context.lineWidth = 30;
  context.strokeStyle = 'rgba(21, 12, 35, 0.95)';
  context.strokeText(titleTheme.title, x, y);

  context.shadowColor = 'rgba(255, 229, 142, 0.35)';
  context.shadowBlur = 20;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 12;
  context.strokeStyle = 'rgba(255, 237, 175, 0.65)';
  context.strokeText(titleTheme.title, x, y - 2);

  context.fillStyle = gradient;
  context.fillText(titleTheme.title, x, y);

  context.globalCompositeOperation = 'source-atop';
  const shine = context.createLinearGradient(0, y - 150, 0, y + 120);
  shine.addColorStop(0, 'rgba(255,255,255,0.55)');
  shine.addColorStop(0.28, 'rgba(255,246,204,0.18)');
  shine.addColorStop(0.7, 'rgba(59,28,96,0.18)');
  shine.addColorStop(1, 'rgba(0,0,0,0.22)');
  context.fillStyle = shine;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

  const gradient = context.createRadialGradient(384, 384, 30, 384, 384, 384);
  gradient.addColorStop(0, primary);
  gradient.addColorStop(0.35, secondary);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(991);
  for (let index = 0; index < 180; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 20 + random() * 80;
    const haze = context.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, `rgba(255,255,255,${0.025 + random() * 0.045})`);
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
        transformed.z += sin((position.x * 0.28) + time * 0.35) * 0.035;
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

        float sweep = fract(time * 0.055);
        float glint = exp(-pow((vUv.x - sweep) * 14.0, 2.0));
        glint *= smoothstep(0.08, 0.34, vUv.y) * smoothstep(0.92, 0.58, vUv.y);

        float secondSweep = fract(time * 0.034 + 0.55);
        float rim = exp(-pow((vUv.x - secondSweep) * 20.0, 2.0)) * 0.32;
        float shimmer = 0.045 * sin(time * 1.15 + vUv.x * 18.0) + 0.025 * sin(time * 0.73 + vUv.y * 24.0);

        vec3 gold = vec3(1.0, 0.75, 0.25);
        vec3 ivory = vec3(1.0, 0.95, 0.72);
        vec3 violet = vec3(0.45, 0.25, 0.95);
        vec3 color = texel.rgb * (1.02 + shimmer);
        color += ivory * glint * 0.72;
        color += gold * rim * 0.38;
        color += violet * (0.035 + 0.025 * sin(time + vUv.x * 6.283));

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
    positions[i + 1] = (random() - 0.5) * spread * 0.72 + 0.8;
    positions[i + 2] = -6 - random() * depth;
    phases[index] = random() * Math.PI * 2;
    alphas[index] = 0.28 + random() * 0.68;
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
        float twinkle = 0.78 + 0.22 * sin(time * 0.72 + phase);
        gl_PointSize = baseSize * pixelRatio * twinkle * (42.0 / max(8.0, -mvPosition.z));
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
        float star = smoothstep(0.5, 0.08, distanceToCenter);
        float pulse = 0.72 + 0.28 * sin(time * 0.58 + vPhase);
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
  mesh.rotation.z = x * 0.2;
  scene.add(mesh);
  return mesh;
}

function addStarSystems(scene: THREE.Scene) {
  const random = seededRandom(4040);
  const nodes: StarNode[] = [];
  const nodePositions: THREE.Vector3[] = [];
  const systemGroup = new THREE.Group();
  systemGroup.position.y = 0.15;
  scene.add(systemGroup);

  for (let index = 0; index < 13; index += 1) {
    const position = new THREE.Vector3((random() - 0.5) * 12, (random() - 0.48) * 5.4 + 0.65, -7 - random() * 18);
    nodePositions.push(position);

    const geometry = new THREE.SphereGeometry(0.032 + random() * 0.055, 16, 12);
    const material = new THREE.MeshBasicMaterial({
      color: index % 3 === 0 ? 0xf1c46d : index % 3 === 1 ? 0xc9d8ff : 0xd184ff,
      transparent: true,
      opacity: 0.48 + random() * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    systemGroup.add(mesh);
    nodes.push({ mesh, phase: random() * Math.PI * 2, baseScale: 1 + random() * 0.7 });

    const ringCount = index % 4 === 0 ? 2 : 1;
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const points: THREE.Vector3[] = [];
      const radiusX = 0.28 + random() * 0.28 + ringIndex * 0.13;
      const radiusY = radiusX * (0.32 + random() * 0.18);
      const segments = 72;
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, 0));
      }
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const ringMaterial = new THREE.LineBasicMaterial({
        color: ringIndex === 0 ? 0x8eb8ff : 0xd6a85f,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
      ring.position.copy(position);
      ring.rotation.x = 1.05 + random() * 0.55;
      ring.rotation.y = random() * 0.65;
      ring.rotation.z = random() * Math.PI;
      systemGroup.add(ring);
    }
  }

  const linePositions: number[] = [];
  for (let index = 0; index < nodePositions.length - 1; index += 1) {
    if (index % 2 === 0 || random() > 0.45) {
      linePositions.push(
        nodePositions[index].x,
        nodePositions[index].y,
        nodePositions[index].z,
        nodePositions[index + 1].x,
        nodePositions[index + 1].y,
        nodePositions[index + 1].z
      );
    }
  }
  const linesGeometry = new THREE.BufferGeometry();
  linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const linesMaterial = new THREE.LineBasicMaterial({
    color: 0x7087d8,
    transparent: true,
    opacity: 0.11,
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

export function WarpkeepTitleScreen3D({ onEnterCastle }: WarpkeepTitleScreen3DProps) {
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
      scene.fog = new THREE.FogExp2(0x03040c, 0.021);

      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
      camera.position.set(0, 0.78, 9.8);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x03040c, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = 'warpkeep-title-canvas';
      container.appendChild(renderer.domElement);

      const titleTexture = createTitleTexture();
      const nebulaA = createNebulaTexture('rgba(88,42,148,0.58)', 'rgba(18,60,128,0.16)');
      const nebulaB = createNebulaTexture('rgba(178,104,65,0.26)', 'rgba(94,42,124,0.13)');
      const textures = [titleTexture, nebulaA, nebulaB];

      const starLayerA = createStarLayer(760, 24, 58, 1201, titleTheme.colors.coldStar, 7.5, renderer.getPixelRatio());
      const starLayerB = createStarLayer(280, 18, 36, 1202, '#c79cff', 10.5, renderer.getPixelRatio());
      const starLayerC = createStarLayer(140, 14, 30, 1203, '#f0c76b', 12.5, renderer.getPixelRatio());
      const starLayers = [starLayerA, starLayerB, starLayerC];
      starLayers.forEach(({ points }) => scene.add(points));

      const nebulaMeshA = addNebula(scene, nebulaA, -3.8, 1.25, -28, 19, 0.38);
      const nebulaMeshB = addNebula(scene, nebulaB, 4.2, -0.55, -20, 15, 0.24);
      const { nodes, systemGroup } = addStarSystems(scene);

      const titleGeometry = new THREE.PlaneGeometry(9.9, 2.7, 32, 4);
      const titleMaterial = createTitleMaterial(titleTexture);
      const titleGroup = new THREE.Group();
      titleGroup.position.set(0, -1.05, 0);
      scene.add(titleGroup);

      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: titleTexture,
        color: 0x1d1748,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      for (let index = 7; index >= 1; index -= 1) {
        const shadow = new THREE.Mesh(titleGeometry, shadowMaterial);
        shadow.position.set(index * -0.026, index * -0.028, -index * 0.035);
        shadow.scale.set(1 + index * 0.003, 1 + index * 0.003, 1);
        titleGroup.add(shadow);
      }

      const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
      titleGroup.add(titleMesh);

      const rimLight = new THREE.PointLight(0xa690ff, 1.8, 28);
      rimLight.position.set(-4.5, 3.4, 5);
      scene.add(rimLight);
      const sweepLight = new THREE.PointLight(0xffdda3, 2.2, 22);
      sweepLight.position.set(4, 1.5, 4.5);
      scene.add(sweepLight);
      scene.add(new THREE.AmbientLight(0x4e5688, 0.42));

      const resize = () => {
        const width = Math.max(320, container.clientWidth);
        const height = Math.max(420, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        starLayers.forEach(({ material }) => {
          material.uniforms.pixelRatio.value = renderer.getPixelRatio();
        });
      };

      resize();
      window.addEventListener('resize', resize);
      const clock = new THREE.Clock();

      const render = () => {
        if (disposed) {
          return;
        }
        const elapsed = prefersReducedMotion ? 1.5 : clock.getElapsedTime();

        starLayers.forEach(({ material }, index) => {
          material.uniforms.time.value = elapsed * (0.72 + index * 0.11);
        });
        titleMaterial.uniforms.time.value = elapsed;

        titleGroup.rotation.y = Math.sin(elapsed * 0.22) * 0.045;
        titleGroup.rotation.x = Math.sin(elapsed * 0.17 + 1.2) * 0.018;
        titleGroup.position.y = -1.05 + Math.sin(elapsed * 0.28) * 0.045;

        starLayerA.points.rotation.z = elapsed * 0.0022;
        starLayerB.points.rotation.z = -elapsed * 0.0037;
        starLayerC.points.rotation.z = elapsed * 0.0052;
        systemGroup.rotation.z = Math.sin(elapsed * 0.09) * 0.025;
        systemGroup.rotation.y = Math.sin(elapsed * 0.07) * 0.018;
        nebulaMeshA.rotation.z = elapsed * 0.004;
        nebulaMeshB.rotation.z = -elapsed * 0.0055;

        sweepLight.position.set(Math.sin(elapsed * 0.42) * 5.6, 1.75 + Math.cos(elapsed * 0.21) * 0.45, 4.4 + Math.cos(elapsed * 0.36) * 1.1);
        rimLight.position.x = -4.5 + Math.sin(elapsed * 0.18) * 0.7;

        nodes.forEach(({ mesh, phase, baseScale }) => {
          const pulse = baseScale * (0.88 + 0.18 * Math.sin(elapsed * 0.72 + phase));
          mesh.scale.setScalar(pulse);
          mesh.material.opacity = 0.42 + 0.28 * Math.sin(elapsed * 0.64 + phase) ** 2;
        });

        camera.position.x = Math.sin(elapsed * 0.12) * 0.22;
        camera.position.y = 0.78 + Math.cos(elapsed * 0.11) * 0.1;
        camera.lookAt(0, -0.55, -1.2);

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
    return <WarpkeepTitleScreenFallback onEnterCastle={onEnterCastle} />;
  }

  return (
    <main className="warpkeep-title-screen" aria-label="Warpkeep title screen">
      <div ref={mountRef} className="warpkeep-title-canvas-shell" aria-hidden="true" />
      <h1 className="sr-only">{titleTheme.title}</h1>
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <div className="warpkeep-title-overlay">
        <button className="warpkeep-title-button" type="button" onClick={onEnterCastle}>
          Enter Warpkeep
        </button>
      </div>
    </main>
  );
}
