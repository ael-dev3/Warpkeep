import * as THREE from 'three';

import {
  HEGEMONY_KEEP_RUNTIME_ASSETS,
  prepareHegemonyKeepScene,
  readExactKeepResponseBody
} from '../components/realm/loadHegemonyKeep';
import { assertLocalQaRuntime } from './localQaRuntime';

const SOURCE_ASSET = Object.freeze({
  bytes: 2_233_564,
  path: '/_warpkeep-local-qa/hegemony-main-castle-source.glb',
  sha256: 'b33755f14bbed0855cf738ba8fb2dbdde9cf56e976b7f108a2259dd478a9b580'
});
const RENDER_TARGET_PIXELS = 384;
const SILHOUETTE_THRESHOLD = 127;

type LodId = 'high' | 'balanced' | 'compact';
type RenderPixels = Readonly<{
  shaded: Uint8Array;
  silhouette: Uint8Array;
}>;
type LodEvidence = Readonly<{
  coverageDeltaBasisPoints: number;
  meanColorDelta: number;
  silhouetteIouBasisPoints: number;
}>;

const LOD_IDS: readonly LodId[] = ['high', 'balanced', 'compact'];

function exactHexDigest(value: string) {
  return /^[a-f0-9]{64}$/u.test(value) ? value : '';
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function parseExactScene(asset: Readonly<{
  bytes: number;
  path: string;
  sha256: string;
}>) {
  const url = new URL(asset.path, window.location.origin).toString();
  const response = await fetch(url, {
    credentials: 'same-origin',
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Local castle visual asset request failed.');
  const bytes = await readExactKeepResponseBody(response, asset.bytes);
  if (await sha256Hex(bytes) !== exactHexDigest(asset.sha256)) {
    throw new Error('Local castle visual asset failed integrity verification.');
  }
  if (
    new Uint8Array(bytes, 0, 4).every((value, index) => value === [0x67, 0x6c, 0x54, 0x46][index]) === false
    || new DataView(bytes).getUint32(4, true) !== 2
    || new DataView(bytes).getUint32(8, true) !== bytes.byteLength
  ) throw new Error('Local castle visual asset is not an intact GLB.');

  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const parsed = await loader.parseAsync(bytes, url);
  return parsed.scene;
}

function assertFiniteBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (
    !Number.isFinite(center.x)
    || !Number.isFinite(center.y)
    || !Number.isFinite(center.z)
    || !Number.isFinite(size.x)
    || !Number.isFinite(size.y)
    || !Number.isFinite(size.z)
    || size.x <= 0
    || size.y <= 0
    || size.z <= 0
  ) throw new Error('Local castle visual source has invalid bounds.');
  return Object.freeze({ center, size });
}

function readTargetPixels(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  target: THREE.WebGLRenderTarget,
  model: THREE.Object3D,
  silhouetteMaterial?: THREE.MeshBasicMaterial
) {
  const previousOverride = scene.overrideMaterial;
  scene.add(model);
  scene.overrideMaterial = silhouetteMaterial ?? null;
  model.updateMatrixWorld(true);
  renderer.setRenderTarget(target);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(RENDER_TARGET_PIXELS * RENDER_TARGET_PIXELS * 4);
  renderer.readRenderTargetPixels(target, 0, 0, RENDER_TARGET_PIXELS, RENDER_TARGET_PIXELS, pixels);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = previousOverride;
  scene.remove(model);
  return pixels;
}

function renderModel(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  target: THREE.WebGLRenderTarget,
  model: THREE.Object3D,
  silhouetteMaterial: THREE.MeshBasicMaterial
): RenderPixels {
  return Object.freeze({
    shaded: readTargetPixels(renderer, scene, camera, target, model),
    silhouette: readTargetPixels(
      renderer,
      scene,
      camera,
      target,
      model,
      silhouetteMaterial
    )
  });
}

function isSilhouettePixel(pixels: Uint8Array, offset: number) {
  return pixels[offset] >= SILHOUETTE_THRESHOLD
    && pixels[offset + 1] >= SILHOUETTE_THRESHOLD
    && pixels[offset + 2] >= SILHOUETTE_THRESHOLD;
}

function compareRenderedPixels(source: RenderPixels, candidate: RenderPixels): LodEvidence {
  let candidateCoverage = 0;
  let intersection = 0;
  let sourceCoverage = 0;
  let union = 0;
  let sharedColorDelta = 0;
  for (let offset = 0; offset < source.silhouette.byteLength; offset += 4) {
    const sourceOn = isSilhouettePixel(source.silhouette, offset);
    const candidateOn = isSilhouettePixel(candidate.silhouette, offset);
    if (sourceOn) sourceCoverage += 1;
    if (candidateOn) candidateCoverage += 1;
    if (sourceOn || candidateOn) union += 1;
    if (sourceOn && candidateOn) {
      intersection += 1;
      sharedColorDelta += Math.abs(source.shaded[offset] - candidate.shaded[offset]);
      sharedColorDelta += Math.abs(source.shaded[offset + 1] - candidate.shaded[offset + 1]);
      sharedColorDelta += Math.abs(source.shaded[offset + 2] - candidate.shaded[offset + 2]);
    }
  }
  if (sourceCoverage < 1 || union < 1 || intersection < 1) {
    throw new Error('Local castle visual render has no comparable silhouette.');
  }
  return Object.freeze({
    coverageDeltaBasisPoints: Math.round(
      Math.abs(candidateCoverage - sourceCoverage) * 10_000 / sourceCoverage
    ),
    meanColorDelta: Math.round(sharedColorDelta / (intersection * 3)),
    silhouetteIouBasisPoints: Math.round(intersection * 10_000 / union)
  });
}

function disposeObject(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const imageBitmaps = new Set<ImageBitmap>();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
      material.dispose();
    });
  });
  textures.forEach((texture) => {
    const source = texture.source.data;
    if (typeof ImageBitmap === 'function' && source instanceof ImageBitmap) {
      imageBitmaps.add(source);
    }
    texture.dispose();
  });
  imageBitmaps.forEach((source) => source.close());
}

function integerAttribute(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error('Local castle visual evidence metric is invalid.');
  }
  return String(value);
}

function writeReadyEvidence(root: HTMLElement, evidence: Readonly<Record<LodId, LodEvidence>>) {
  root.dataset.castleLodVisualRenderer = 'webgl';
  root.dataset.castleLodVisualProfiles = LOD_IDS.join(',');
  root.dataset.castleLodVisualTargetPixels = String(RENDER_TARGET_PIXELS);
  LOD_IDS.forEach((lod) => {
    const prefix = `castleLodVisual${lod[0].toUpperCase()}${lod.slice(1)}` as const;
    root.dataset[`${prefix}SilhouetteIouBasisPoints`] = integerAttribute(
      evidence[lod].silhouetteIouBasisPoints
    );
    root.dataset[`${prefix}CoverageDeltaBasisPoints`] = integerAttribute(
      evidence[lod].coverageDeltaBasisPoints
    );
    root.dataset[`${prefix}MeanColorDelta`] = integerAttribute(evidence[lod].meanColorDelta);
  });
  root.dataset.castleLodVisualStatus = 'ready';
}

async function start() {
  const root = document.querySelector<HTMLElement>('main[data-castle-lod-visual-status]');
  if (!root) return;
  try {
    assertLocalQaRuntime();
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(RENDER_TARGET_PIXELS, RENDER_TARGET_PIXELS, false);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;
    const [source, high, balanced, compact] = await Promise.all([
      parseExactScene(SOURCE_ASSET),
      parseExactScene({
        ...HEGEMONY_KEEP_RUNTIME_ASSETS.high,
        path: `/${HEGEMONY_KEEP_RUNTIME_ASSETS.high.path}`
      }),
      parseExactScene({
        ...HEGEMONY_KEEP_RUNTIME_ASSETS.balanced,
        path: `/${HEGEMONY_KEEP_RUNTIME_ASSETS.balanced.path}`
      }),
      parseExactScene({
        ...HEGEMONY_KEEP_RUNTIME_ASSETS.reduced,
        path: `/${HEGEMONY_KEEP_RUNTIME_ASSETS.reduced.path}`
      })
    ]);
    const preparation = Object.freeze({
      dynamicShadows: false,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
    });
    const preparedSource = prepareHegemonyKeepScene(source, preparation);
    const models: Readonly<Record<LodId, THREE.Object3D>> = Object.freeze({
      high: prepareHegemonyKeepScene(high, preparation).root,
      balanced: prepareHegemonyKeepScene(balanced, preparation).root,
      compact: prepareHegemonyKeepScene(compact, preparation).root
    });
    const sourceBounds = assertFiniteBounds(preparedSource.root);
    const radius = Math.max(0.001, sourceBounds.size.length() / 2);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(13)) * 1.08;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0x9badff, 0x22150c, 1.2));
    const key = new THREE.DirectionalLight(0xffe6c0, 2.1);
    key.position.set(distance * 0.7, distance * 0.92, distance * 0.8);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.01, distance * 3);
    camera.position.set(distance * 0.72, distance * 0.55, distance * 0.9);
    camera.lookAt(0, sourceBounds.size.y * 0.34, 0);
    camera.updateProjectionMatrix();
    const target = new THREE.WebGLRenderTarget(RENDER_TARGET_PIXELS, RENDER_TARGET_PIXELS, {
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType
    });
    const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    try {
      const sourcePixels = renderModel(
        renderer,
        scene,
        camera,
        target,
        preparedSource.root,
        silhouetteMaterial
      );
      try {
        const evidenceEntries = LOD_IDS.map((lod) => {
          const candidatePixels = renderModel(
            renderer,
            scene,
            camera,
            target,
            models[lod],
            silhouetteMaterial
          );
          try {
            return [lod, compareRenderedPixels(sourcePixels, candidatePixels)] as const;
          } finally {
            candidatePixels.shaded.fill(0);
            candidatePixels.silhouette.fill(0);
          }
        });
        const evidence = Object.freeze(Object.fromEntries(evidenceEntries) as Record<LodId, LodEvidence>);
        writeReadyEvidence(root, evidence);
      } finally {
        sourcePixels.shaded.fill(0);
        sourcePixels.silhouette.fill(0);
      }
    } finally {
      target.dispose();
      silhouetteMaterial.dispose();
      renderer.dispose();
      disposeObject(preparedSource.root);
      Object.values(models).forEach(disposeObject);
    }
  } catch {
    // The browser probe records only a fixed failure category; model bytes,
    // visual pixels, and error details never leave this loopback page.
    root.dataset.castleLodVisualStatus = 'error';
  }
}

void start();
