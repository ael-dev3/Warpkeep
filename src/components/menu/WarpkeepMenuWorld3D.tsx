import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import { createMenuLandscape3D } from './createMenuLandscape3D';
import './WarpkeepMenuWorld3D.css';

/** The castle-only GLB leaves the central turret clear for this separate guardian. */
const DEFAULT_CASTLE_URL = 'models/menu/warplet-castle-hegemony-v2-c55f2c6c610e4aac.glb';
const DEFAULT_GUARDIAN_URL = 'models/menu/warplet-guardian-v2-e934a81ae2a210e4.glb';
const GUARDIAN_ROOFTOP_Y = 12;

const ASSET_URLS = {
  honorGuard: 'models/hegemony/inner-keep/population/infantry/inner-keep-honor-guard-balanced-66f157c4dc9bcd4f.glb',
  lamplighter: 'models/hegemony/inner-keep/population/citizen/inner-keep-ember-lamplighter-balanced-599200017f3e3a3d.glb',
  rabbit: 'models/hegemony/inner-keep/wildlife/rabbit/inner-keep-lowlands-rabbit-balanced-daeb493a827ecbd6.glb',
  brazier: 'models/hegemony/inner-keep/town-items/inner-keep-stone-pedestal-brazier-balanced-6e9b6f425e081277.glb',
  tree: 'models/hegemony/environment/trees/hegemony-tree-regular-balanced-c77293af2d83c210.glb',
  pine: 'models/hegemony/environment/trees/hegemony-tree-pine-alpine-compact-a2b5cab2cdd5d669.glb',
} as const;

type MenuWorldProps = Readonly<{
  active: boolean;
  reducedMotion: boolean;
  quality?: GraphicsQualityTier;
  /** Optional, same-origin castle-only model. Useful while asset filenames are versioned. */
  castleUrl?: string;
  /** Optional, same-origin standalone Warplet for the selected player's FID. */
  /** `null` gives an unassigned FID a neutral three-dimensional rooftop figure. */
  guardianUrl?: string | null;
}>;

type WorldControl = Readonly<{
  setActivity: (active: boolean, reducedMotion: boolean) => void;
  dispose: () => void;
}>;

type AnimatedActor = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  position: THREE.Vector3;
  kind: 'guard' | 'worker' | 'rabbit';
  phase: number;
};

type Fire = {
  flames: THREE.Group[];
  light: THREE.PointLight;
  phase: number;
};

type Bird = {
  body: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  phase: number;
  radius: number;
  center: THREE.Vector3;
};

function modelUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const absolute = new URL(path.startsWith('/') ? path : `${base}${path}`, window.location.origin);
  if (absolute.origin !== window.location.origin) {
    throw new Error('Menu 3D models must be served from the game origin.');
  }
  return absolute.href;
}

async function fetchModel(
  loader: import('three/addons/loaders/GLTFLoader.js').GLTFLoader,
  url: string,
  signal: AbortSignal,
): Promise<GLTF> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Menu model ${url} returned ${response.status}.`);
  const bytes = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
}

function configureModel(root: THREE.Object3D, castShadow: boolean): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = castShadow;
    node.receiveShadow = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if ('side' in material) material.side = THREE.FrontSide;
    }
  });
}

function playClip(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[], name: string, speed = 1): THREE.AnimationAction | null {
  const clip = clips.find((item) => item.name === name);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.timeScale = speed;
  action.play();
  return action;
}

function makeBird(material: THREE.Material, phase: number): Bird {
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), material);
  torso.scale.set(1.5, 0.52, 0.7);
  body.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), material);
  head.position.set(0, 0.09, 0.2);
  body.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.19, 3), new THREE.MeshStandardMaterial({ color: 0xd7a957, roughness: 1 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.08, 0.36);
  body.add(beak);
  const wingGeometry = new THREE.ConeGeometry(0.15, 0.66, 3);
  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  const left = new THREE.Mesh(wingGeometry, material);
  left.rotation.z = -Math.PI / 2;
  left.position.x = -0.29;
  const right = new THREE.Mesh(wingGeometry, material);
  right.rotation.z = Math.PI / 2;
  right.position.x = 0.29;
  leftWing.add(left);
  rightWing.add(right);
  body.add(leftWing, rightWing);
  return { body, leftWing, rightWing, phase, radius: 3.5 + phase * 0.8, center: new THREE.Vector3(-10 + phase * 3, 19 + phase * 1.2, -17) };
}

function makeFire(x: number, z: number, phase: number): { group: THREE.Group; fire: Fire } {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const outer = new THREE.MeshStandardMaterial({ color: 0xd65b27, emissive: 0xff5b16, emissiveIntensity: 1.4, roughness: 1, flatShading: true });
  const inner = new THREE.MeshStandardMaterial({ color: 0xffc05a, emissive: 0xffb34c, emissiveIntensity: 2.2, roughness: 1, flatShading: true });
  const heart = new THREE.MeshStandardMaterial({ color: 0xffe8ab, emissive: 0xffdd8a, emissiveIntensity: 2.4, roughness: 1, flatShading: true });
  const flames: THREE.Group[] = [];
  [outer, inner, heart].forEach((material, index) => {
    const flame = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.31 - index * 0.065, 0.85 - index * 0.12, 5), material);
    mesh.position.y = (0.85 - index * 0.12) / 2;
    flame.add(mesh);
    flame.position.set((index - 1) * 0.12, 2.08, index === 1 ? 0.07 : -0.04);
    flames.push(flame);
    group.add(flame);
  });
  const light = new THREE.PointLight(0xff9a4f, 3.2, 7.5, 2);
  light.position.set(0, 2.55, 0);
  group.add(light);
  return { group, fire: { flames, light, phase } };
}

function makeUnassignedWarplet(): THREE.Group {
  const root = new THREE.Group();
  root.position.y = GUARDIAN_ROOFTOP_Y;
  const robe = new THREE.MeshStandardMaterial({ color: 0xb5acae, roughness: 0.91, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0x91869d, roughness: 0.88, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: 0xe1dcd1, roughness: 0.48 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x27322f, roughness: 0.56 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x756b86, roughness: 0.95, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 2.15, 3.25, 12, 1), robe);
  body.position.y = 1.8;
  root.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(2.18, 2), skin);
  head.scale.set(1.04, 0.97, 0.9);
  head.position.y = 4.42;
  root.add(head);
  for (const side of [-1, 1]) {
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), eye);
    eyeball.position.set(side * 0.88, 4.85, 1.68);
    root.add(eyeball);
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), pupil);
    center.position.set(side * 0.87, 4.84, 2.21);
    root.add(center);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.15, 4, 8), skin);
    arm.position.set(side * 1.77, 2.35, 0);
    arm.rotation.z = side * 0.36;
    root.add(arm);
    const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 1), skin);
    foot.scale.set(1.2, 0.44, 0.78);
    foot.position.set(side * 0.89, 0.2, 0.65);
    root.add(foot);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.28, 5), stone);
    crest.rotation.z = side * 0.35;
    crest.position.set(side * 1.45, 6.1, 0);
    root.add(crest);
  }
  configureModel(root, true);
  return root;
}

function setCameraFrame(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  const aspect = width / Math.max(1, height);
  camera.aspect = aspect;
  if (aspect < 0.82) {
    // Portrait is deliberately a closer upper-castle crop; the menu panel occupies the lower screen.
    camera.position.set(24, 27, 47);
    camera.lookAt(0, 12.2, 0);
    camera.fov = 36;
  } else if (aspect < 1.32) {
    camera.position.set(30, 27, 48);
    camera.lookAt(3, 9.6, 0);
    camera.fov = 35;
  } else {
    camera.position.set(31.5, 25.2, 42);
    camera.lookAt(8, 9, 0);
    camera.fov = 35;
  }
  camera.updateProjectionMatrix();
}

export function WarpkeepMenuWorld3D({ active, reducedMotion, quality = 'balanced', castleUrl, guardianUrl }: MenuWorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<WorldControl | null>(null);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const abortController = new AbortController();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3e5751);
    scene.fog = new THREE.FogExp2(0x3e5751, 0.0058);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality !== 'performance',
        powerPreference: quality === 'performance' ? 'low-power' : 'high-performance',
      });
    } catch {
      // Canvas/WebGL is unavailable in tests and on some embedded browsers.
      // The CSS background remains visible and the menu itself remains usable.
      mount.dataset.modelState = 'webgl-unavailable';
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.21;
    renderer.shadowMap.enabled = quality !== 'performance';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.append(renderer.domElement);
    const landscape = createMenuLandscape3D(scene, quality);

    scene.add(new THREE.HemisphereLight(0xebf5ed, 0x34513c, 2.35));
    scene.add(new THREE.AmbientLight(0xfff4e7, 0.48));
    const key = new THREE.DirectionalLight(0xffe5b7, 2.85);
    key.position.set(-22, 36, 29);
    key.castShadow = quality !== 'performance';
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -31;
    key.shadow.camera.right = 31;
    key.shadow.camera.top = 32;
    key.shadow.camera.bottom = -32;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 100;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 2;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9e0db, 1.12);
    fill.position.set(25, 20, 7);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xdec29a, 0.75);
    rim.position.set(3, 27, -25);
    scene.add(rim);

    const mixers: THREE.AnimationMixer[] = [];
    const actors: AnimatedActor[] = [];
    const fires: Fire[] = [];
    const birds: Bird[] = [];
    const material = new THREE.MeshStandardMaterial({ color: 0x728b87, roughness: 1, flatShading: true });
    for (let index = 0; index < 3; index += 1) {
      const bird = makeBird(material, index);
      birds.push(bird);
      scene.add(bird.body);
    }

    let disposed = false;
    let frame = 0;
    let elapsed = 0;
    let lastFrameTime = 0;
    let isActive = active;
    let motionReduced = reducedMotion;
    let guardianIdle: THREE.AnimationAction | null = null;
    let guardianSalute: THREE.AnimationAction | null = null;
    let nextSalute = 17;
    let saluteEnds = Number.POSITIVE_INFINITY;

    const render = () => renderer.render(scene, camera);
    const animate = (time: number) => {
      frame = 0;
      if (disposed || !isActive || motionReduced) return;
      const dt = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.05) : 0;
      lastFrameTime = time;
      elapsed += dt;
      for (const mixer of mixers) mixer.update(dt);
      landscape.update(elapsed);

      if (guardianIdle && guardianSalute && elapsed >= nextSalute) {
        guardianSalute.reset().crossFadeFrom(guardianIdle, 0.45, false).play();
        saluteEnds = elapsed + guardianSalute.getClip().duration - 0.5;
        nextSalute = elapsed + 26 + (Math.sin(elapsed) + 1) * 5;
      }
      if (guardianIdle && guardianSalute && elapsed >= saluteEnds) {
        guardianIdle.reset().crossFadeFrom(guardianSalute, 0.5, false).play();
        saluteEnds = Number.POSITIVE_INFINITY;
      }

      for (const actor of actors) {
        if (actor.kind === 'guard') {
          const travel = Math.sin(elapsed * 0.32 + actor.phase);
          actor.root.position.set(actor.position.x + travel * 1.55, actor.position.y, actor.position.z + Math.cos(elapsed * 0.32 + actor.phase) * 0.23);
          actor.root.rotation.y = Math.cos(elapsed * 0.32 + actor.phase) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        } else if (actor.kind === 'worker') {
          actor.root.rotation.y = 2.9 + Math.sin(elapsed * 0.4 + actor.phase) * 0.11;
        } else {
          const hop = Math.max(0, Math.sin(elapsed * 2.6 + actor.phase));
          actor.root.position.set(actor.position.x + Math.sin(elapsed * 0.7) * 1.4, actor.position.y + hop * hop * 0.27, actor.position.z + Math.cos(elapsed * 0.7) * 0.45);
          actor.root.rotation.y = Math.cos(elapsed * 0.7) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      for (const fire of fires) {
        const shimmer = Math.sin(elapsed * 7.1 + fire.phase);
        fire.flames.forEach((flame, index) => {
          flame.scale.y = 0.88 + Math.sin(elapsed * (6.4 + index) + fire.phase + index * 1.8) * 0.18;
          flame.rotation.z = Math.sin(elapsed * (3.3 + index * 0.55) + fire.phase) * 0.12;
        });
        fire.light.intensity = 3.1 + shimmer * 0.65;
      }
      for (const bird of birds) {
        const angle = elapsed * 0.15 + bird.phase * 2.7;
        bird.body.position.set(
          bird.center.x + Math.cos(angle) * bird.radius,
          bird.center.y + Math.sin(angle * 2) * 0.52,
          bird.center.z + Math.sin(angle) * bird.radius,
        );
        bird.body.rotation.y = -angle + Math.PI / 2;
        bird.leftWing.rotation.z = Math.sin(elapsed * 8.2 + bird.phase) * 0.55;
        bird.rightWing.rotation.z = -bird.leftWing.rotation.z;
      }
      render();
      frame = requestAnimationFrame(animate);
    };
    const start = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = 0;
      if (isActive && !motionReduced) frame = requestAnimationFrame(animate);
      else render();
    };

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const ratioCap = quality === 'performance'
        ? 1
        : quality === 'cinematic'
          ? (width < 600 ? 1.6 : 2)
          : (width < 600 ? 1.35 : 1.65);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));
      const shadowSize = quality === 'cinematic' ? (width < 700 ? 1536 : 2048)
        : quality === 'balanced' ? (width < 700 ? 1024 : 1536) : 512;
      key.shadow.mapSize.set(shadowSize, shadowSize);
      renderer.setSize(width, height, false);
      setCameraFrame(camera, width, height);
      if (motionReduced || !isActive) render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    controlRef.current = {
      setActivity(nextActive, nextReducedMotion) {
        isActive = nextActive;
        motionReduced = nextReducedMotion;
        start();
      },
      dispose() {
        disposed = true;
        abortController.abort();
        cancelAnimationFrame(frame);
        observer.disconnect();
        for (const mixer of mixers) mixer.stopAllAction();
        scene.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.geometry.dispose();
          for (const source of Array.isArray(node.material) ? node.material : [node.material]) source.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    void (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }, SkeletonUtils] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
        import('three/addons/utils/SkeletonUtils.js'),
      ]);
      if (disposed) return;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const signal = abortController.signal;

      try {
        const castle = await fetchModel(loader, modelUrl(castleUrl || DEFAULT_CASTLE_URL), signal);
        if (disposed) return;
        configureModel(castle.scene, true);
        scene.add(castle.scene);
        render();
      } catch (error) {
        if (signal.aborted || disposed) return;
        mount.dataset.modelState = 'castle-unavailable';
        console.warn('Warpkeep menu castle model unavailable; reload to retry the preview.', error);
        render();
        return;
      }

      // The guardian model's rig root is y=.2; +12 seats it on the castle's y=12.2 roof.
      if (guardianUrl === null) {
        scene.add(makeUnassignedWarplet());
      } else {
        try {
          const guardian = await fetchModel(loader, modelUrl(guardianUrl || DEFAULT_GUARDIAN_URL), signal);
          if (disposed) return;
          guardian.scene.position.y = GUARDIAN_ROOFTOP_Y;
          configureModel(guardian.scene, true);
          scene.add(guardian.scene);
          const guardianMixer = new THREE.AnimationMixer(guardian.scene);
          mixers.push(guardianMixer);
          guardianIdle = playClip(guardianMixer, guardian.animations, 'Warplet_Idle');
          const saluteClip = guardian.animations.find((clip) => clip.name === 'Warplet_Torch_Salute');
          guardianSalute = saluteClip ? guardianMixer.clipAction(saluteClip) : null;
          guardianSalute?.setLoop(THREE.LoopOnce, 1);
          if (guardianSalute) guardianSalute.clampWhenFinished = true;
        } catch (error) {
          if (signal.aborted || disposed) return;
          console.warn('Warpkeep menu guardian model unavailable; displaying the neutral rooftop Warplet.', error);
          scene.add(makeUnassignedWarplet());
        }
      }
      mount.dataset.modelReady = 'true';
      render();

      const additions = await Promise.allSettled([
        fetchModel(loader, modelUrl(ASSET_URLS.honorGuard), signal),
        fetchModel(loader, modelUrl(ASSET_URLS.lamplighter), signal),
        fetchModel(loader, modelUrl(ASSET_URLS.rabbit), signal),
        fetchModel(loader, modelUrl(ASSET_URLS.brazier), signal),
        fetchModel(loader, modelUrl(ASSET_URLS.tree), signal),
        fetchModel(loader, modelUrl(ASSET_URLS.pine), signal),
      ]);
      if (disposed) return;
      const loaded = additions.map((result) => result.status === 'fulfilled' ? result.value : null);
      const [guards, worker, rabbit, brazier, tree, pine] = loaded;

      if (guards) {
        [[-5.7, 12.5, 0.2], [5.5, 12.9, 2.9]].forEach(([x, z, phase]) => {
          const root = SkeletonUtils.clone(guards.scene) as THREE.Group;
          configureModel(root, true);
          root.scale.setScalar(1.18);
          root.position.set(x, 0, z);
          scene.add(root);
          const mixer = new THREE.AnimationMixer(root);
          playClip(mixer, guards.animations, 'Walk', 0.55);
          mixers.push(mixer);
          actors.push({ root, mixer, position: root.position.clone(), kind: 'guard', phase });
        });
      }
      if (worker) {
        const root = SkeletonUtils.clone(worker.scene) as THREE.Group;
        configureModel(root, true);
        root.scale.setScalar(1.2);
        root.position.set(8.1, 0, 14.2);
        root.rotation.y = 2.9;
        scene.add(root);
        const mixer = new THREE.AnimationMixer(root);
        playClip(mixer, worker.animations, 'Work', 0.8);
        mixers.push(mixer);
        actors.push({ root, mixer, position: root.position.clone(), kind: 'worker', phase: 0.6 });
      }
      if (rabbit) {
        const root = SkeletonUtils.clone(rabbit.scene) as THREE.Group;
        configureModel(root, true);
        root.scale.setScalar(2.5);
        root.position.set(-10.8, 0, 16.3);
        scene.add(root);
        const mixer = new THREE.AnimationMixer(root);
        playClip(mixer, rabbit.animations, 'Walk', 0.75);
        mixers.push(mixer);
        actors.push({ root, mixer, position: root.position.clone(), kind: 'rabbit', phase: 0.4 });
      }
      if (brazier) {
        [[-8.9, 12.8, 0], [8.9, 12.8, 2.1]].forEach(([x, z, phase]) => {
          const pedestal = brazier.scene.clone(true);
          configureModel(pedestal, true);
          pedestal.position.set(x, 0, z);
          scene.add(pedestal);
          const effect = makeFire(x, z, phase);
          fires.push(effect.fire);
          scene.add(effect.group);
        });
      }
      const treeSites = [
        [-17, -8, 0.9, 0], [-19, 5, 1.05, 0.8], [-15.5, 13, 0.75, 1.5],
        [16, -11, 1.1, 2], [18, 5, 0.86, 2.9], [15.5, 14.5, 0.72, 3.5],
        [-7, -20, 1.15, 4.1], [7, -21, 0.95, 4.8],
      ] as const;
      treeSites.forEach(([x, z, scale, turn], index) => {
        const source = index % 2 ? pine : tree;
        if (!source) return;
        const root = source.scene.clone(true);
        configureModel(root, true);
        root.position.set(x, 0, z);
        root.rotation.y = turn;
        root.scale.setScalar(scale);
        scene.add(root);
      });
      render();
      start();
    })().catch((error: unknown) => {
      if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) {
        mount.dataset.modelState = 'castle-unavailable';
        console.error('Warpkeep menu 3D scene could not load:', error);
      }
    });

    start();
    return () => {
      controlRef.current?.dispose();
      controlRef.current = null;
    };
  }, [castleUrl, guardianUrl, quality]);

  useEffect(() => {
    controlRef.current?.setActivity(active, reducedMotion);
  }, [active, reducedMotion]);

  return <div ref={mountRef} className="warpkeep-menu-world-3d" aria-hidden="true" />;
}
