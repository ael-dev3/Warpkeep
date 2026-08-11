import * as THREE from 'three';

import { axialToWorld } from '../game/map/hexCoordinates';
import { createGreaterRealmChunkStream } from '../greater-realm/greaterRealmChunkStream';
import { createGreaterRealmSceneRuntime } from '../greater-realm/createGreaterRealmSceneRuntime';
import {
  assertGreaterRealmChunkMatchesDescriptor,
  type GreaterRealmChunkDto,
  type GreaterRealmLod
} from '../greater-realm/greaterRealmPublicContract';
import {
  resolveGreaterRealmDeviceClass,
  resolveGreaterRealmGraphicsProfile
} from '../greater-realm/greaterRealmRuntimePolicy';
import {
  GREATER_REALM_SYNTHETIC_CELL_SIZE,
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport
} from './greaterRealmSyntheticTierOneFixture';
import { assertLocalQaRuntime } from './localQaRuntime';
import './greaterRealmQa.css';

const root = document.querySelector<HTMLElement>('#greater-realm-qa')!;
const canvas = root.querySelector<HTMLCanvasElement>('[data-greater-realm-qa-canvas]')!;
const copy = root.querySelector<HTMLElement>('[data-greater-realm-qa-copy]')!;

async function start() {
  assertLocalQaRuntime();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor('#18242a', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#18242a');
  scene.fog = new THREE.Fog('#25353d', 11, 30);
  scene.add(new THREE.HemisphereLight('#d9e6df', '#334338', 2.1));
  const sun = new THREE.DirectionalLight('#f4deb0', 2.4);
  sun.position.set(-6, 10, 7);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 80);
  const center = axialToWorld({ q: 0, r: 0.5 }, GREATER_REALM_SYNTHETIC_CELL_SIZE);
  camera.position.set(center.x + 7.2, 7.1, center.z + 10.2);
  camera.lookAt(center.x, 0, center.z);

  const deviceClass = resolveGreaterRealmDeviceClass({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    viewportWidth: window.innerWidth
  });
  const graphicsProfile = resolveGreaterRealmGraphicsProfile({
    deviceClass,
    deviceMemoryGiB: Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4),
    hardwareConcurrency: navigator.hardwareConcurrency
  });
  const lod: GreaterRealmLod = deviceClass === 'mobile' ? 1 : 0;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let disposed = false;
  const runtime = createGreaterRealmSceneRuntime({
    deviceClass,
    graphicsProfile,
    reducedMotion: motionPreference.matches,
    onInvalidate: schedule
  });
  runtime.bindCanvas(canvas);
  runtime.startAnimation();
  scene.add(runtime.group);
  const transport = createGreaterRealmSyntheticTransport();
  const controller = new AbortController();
  const bootstrap = await transport.getBootstrap(controller.signal);
  const windowDto = await transport.getWindow({
    centerQ: 0,
    centerR: 0,
    radius: 1,
    expectedRevision: bootstrap.revision
  }, controller.signal);
  const routeKeys = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.routeCellKeys;
  const firstRoutePage = await transport.planRoute({
    originCellKey: routeKeys[0]!,
    destinationCellKey: routeKeys.at(-1)!,
    offset: 0,
    limit: 3,
    expectedRevision: bootstrap.revision
  }, controller.signal);
  const finalRoutePage = await transport.planRoute({
    originCellKey: routeKeys[0]!,
    destinationCellKey: routeKeys.at(-1)!,
    offset: firstRoutePage.nextOffset!,
    limit: 3,
    expectedRevision: bootstrap.revision
  }, controller.signal);
  const routeCellCount = firstRoutePage.cells.length + finalRoutePage.cells.length;
  const loaded = new Map<string, GreaterRealmChunkDto>();
  const applyLoadedView = () => {
    runtime.setView({
      revision: bootstrap.revision,
      cellSize: GREATER_REALM_SYNTHETIC_CELL_SIZE,
      chunks: windowDto.chunks.flatMap((descriptor) => {
        const chunk = loaded.get(descriptor.chunkHandle);
        if (!chunk) return [];
        return [{
          chunk,
          distanceChunks: Math.max(
            Math.abs(descriptor.binQ - windowDto.centerQ),
            Math.abs(descriptor.binR - windowDto.centerR)
          )
        }];
      })
    });
  };
  const stream = createGreaterRealmChunkStream({
    deviceClass,
    graphicsProfile,
    fetchChunk: (request, signal) => transport.getChunk(request, signal),
    onChunkReady: (chunk) => {
      const descriptor = windowDto.chunks.find((row) => row.chunkHandle === chunk.chunkHandle)!;
      assertGreaterRealmChunkMatchesDescriptor(chunk, descriptor);
      loaded.set(chunk.chunkHandle, chunk);
      applyLoadedView();
      schedule();
    }
  });

  function updateEvidence() {
    const telemetry = runtime.getTelemetry();
    root.dataset.greaterRealmQaStatus = telemetry.uploadedChunkCount === windowDto.chunks.length
      ? 'ready'
      : 'loading';
    root.dataset.greaterRealmQaAccessibleTier = String(bootstrap.visibleTierMax);
    root.dataset.greaterRealmQaDeviceClass = deviceClass;
    root.dataset.greaterRealmQaGraphicsProfile = graphicsProfile;
    root.dataset.greaterRealmQaLod = String(lod);
    root.dataset.greaterRealmQaChunkCount = String(telemetry.uploadedChunkCount);
    root.dataset.greaterRealmQaDrawCalls = String(telemetry.drawCallCount);
    root.dataset.greaterRealmQaInstances = String(telemetry.instanceCount);
    root.dataset.greaterRealmQaBoats = String(telemetry.boatCount);
    root.dataset.greaterRealmQaResources = String(telemetry.resourceCount);
    root.dataset.greaterRealmQaBlockedCells = String(telemetry.blockedCellCount);
    root.dataset.greaterRealmQaFordPassable = String(
      runtime.isCoordinatePassable({ atlasQ: 0, atlasR: 0 })
    );
    root.dataset.greaterRealmQaRouteCells = String(routeCellCount);
    root.dataset.greaterRealmQaReducedMotion = String(telemetry.reducedMotion);
    root.dataset.greaterRealmQaContextLost = String(telemetry.contextLost);
    root.dataset.greaterRealmQaUploadCount = String(telemetry.uploadedThisFrame);
    root.dataset.greaterRealmQaUploadBytes = String(telemetry.uploadBytesThisFrame);
    copy.textContent = telemetry.uploadedChunkCount === windowDto.chunks.length
      ? `${telemetry.uploadedChunkCount} chunks · ${telemetry.drawCallCount} draws · ${telemetry.instanceCount} instances`
      : 'Loading bounded public presentation rows…';
  }

  function render(timestamp: number) {
    frame = 0;
    if (disposed) return;
    runtime.flushUploads();
    runtime.update(timestamp / 1_000);
    updateEvidence();
    if (!runtime.getTelemetry().contextLost) renderer.render(scene, camera);
    if (runtime.getTelemetry().pendingUploadCount > 0) schedule();
  }

  function schedule() {
    if (disposed || frame !== 0) return;
    frame = requestAnimationFrame(render);
  }

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(
      window.devicePixelRatio || 1,
      deviceClass === 'mobile' ? 1.35 : 1.8
    ));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  };
  const motionChange = () => {
    runtime.setReducedMotion(motionPreference.matches);
    schedule();
  };
  const visibilityChange = () => {
    runtime.setDocumentVisible(!document.hidden);
    if (!document.hidden) schedule();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort(new Error('GREATER_REALM_QA_DISPOSED'));
    if (frame !== 0) cancelAnimationFrame(frame);
    stream.dispose();
    runtime.dispose();
    renderer.dispose();
    motionPreference.removeEventListener('change', motionChange);
    document.removeEventListener('visibilitychange', visibilityChange);
    window.removeEventListener('resize', resize);
  };
  motionPreference.addEventListener('change', motionChange);
  document.addEventListener('visibilitychange', visibilityChange);
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', dispose, { once: true });
  resize();
  stream.setDesired(bootstrap.revision, windowDto.chunks.map((chunk) => ({
    chunkHandle: chunk.chunkHandle,
    distanceChunks: Math.max(
      Math.abs(chunk.binQ - windowDto.centerQ),
      Math.abs(chunk.binR - windowDto.centerR)
    ),
    lod
  })));
  await stream.awaitIdle();
  if (stream.getSnapshot().residentChunkCount !== windowDto.chunks.length) {
    throw new Error('GREATER_REALM_QA_CHUNKS_INCOMPLETE');
  }
  schedule();
}

void start().catch(() => {
  root.dataset.greaterRealmQaStatus = 'error';
  copy.textContent = 'Greater Realm local QA unavailable.';
});

export const greaterRealmQaFixtureRevision =
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.revision;
