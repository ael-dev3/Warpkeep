import * as THREE from 'three';

import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import {
  planInnerKeepOuterWorldWildlife,
  type InnerKeepOuterWorldWildlifePlacement,
} from './createInnerKeepOuterWorldPresentation';
import {
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
} from './innerKeepOuterWorldPolicy';
import {
  acquireInnerKeepRabbitPrefab,
  type AcquireInnerKeepRabbitPrefabOptions,
  type InnerKeepRabbitPrefabLease,
} from './loadInnerKeepRabbitAssets';
import {
  innerKeepRabbitLodForQuality,
  type InnerKeepRabbitRuntimeLod,
} from './innerKeepRabbitRuntimeAssets';

export type InnerKeepRabbitPresentationStatus =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'failed'
  | 'aborted'
  | 'disposed';

export type InnerKeepRabbitPresentationTelemetry = Readonly<{
  status: InnerKeepRabbitPresentationStatus;
  lod: InnerKeepRabbitRuntimeLod;
  rabbitCount: number;
  animatedRabbitCount: number;
  groundedRabbitCount: number;
  animationMixerCount: number;
  runtimeAssetFailureCount: number;
  failureMessage: string | null;
  presentationOnly: true;
  gameplayAuthority: 'none';
}>;

export type InnerKeepRabbitPresentation = Readonly<{
  group: THREE.Group;
  ready: Promise<void>;
  update: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  getTelemetry: () => InnerKeepRabbitPresentationTelemetry;
  dispose: () => void;
}>;

export type AcquireInnerKeepRabbitPrefab = (
  options: AcquireInnerKeepRabbitPrefabOptions,
) => Promise<InnerKeepRabbitPrefabLease>;

export type CreateInnerKeepRabbitPresentationOptions = Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  reducedMotion: boolean;
  baseUrl: string;
  maxAnisotropy?: number;
  loadExactAsset?: boolean;
  signal?: AbortSignal;
  requestRender?: () => void;
  onTelemetryChange?: (telemetry: InnerKeepRabbitPresentationTelemetry) => void;
  acquirePrefab?: AcquireInnerKeepRabbitPrefab;
  terrainHeightAt?: (x: number, z: number) => number;
  pointIsClear?: (x: number, z: number, clearanceMeters: number) => boolean;
}>;

type RabbitActor = Readonly<{
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  placement: InnerKeepOuterWorldWildlifePlacement;
}>;

const RABBIT_SCENE_SCALE = 1.72;

function safeTerrainHeight(
  terrainHeightAt: (x: number, z: number) => number,
  x: number,
  z: number,
) {
  const height = terrainHeightAt(x, z);
  return Number.isFinite(height) ? height : 0;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

function disableAuthorityShadowsAndPicking(root: THREE.Object3D) {
  root.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.pickable = false;
    object.castShadow = false;
    object.receiveShadow = false;
    if (
      object instanceof THREE.Mesh
      || object instanceof THREE.Line
      || object instanceof THREE.Points
    ) object.raycast = () => undefined;
  });
}

function chooseRabbitClip(
  clips: readonly THREE.AnimationClip[],
  index: number,
) {
  const preferred = index % 3 === 0
    ? ['Nibble', 'Idle', 'Walk']
    : index % 3 === 1
      ? ['Idle', 'Nibble', 'Walk']
      : ['Walk', 'Idle', 'Nibble'];
  return preferred
    .map((name) => clips.find((clip) => clip.name === name))
    .find((clip): clip is THREE.AnimationClip => clip !== undefined)
    ?? clips[0];
}

function applyRabbitPose(
  actor: RabbitActor,
  elapsedSeconds: number,
  motionEnabled: boolean,
  terrainHeightAt: (x: number, z: number) => number,
  pointIsClear: (x: number, z: number, clearanceMeters: number) => boolean,
) {
  const { placement, root } = actor;
  const phase = placement.phaseRadians
    + (motionEnabled ? elapsedSeconds * placement.speedRadiansPerSecond : 0);
  const candidateX = placement.anchorMeters[0]
    + Math.cos(phase) * placement.roamingRadiusMeters;
  const candidateZ = placement.anchorMeters[2]
    + Math.sin(phase * 0.83) * placement.roamingRadiusMeters;
  const clear = pointIsClear(candidateX, candidateZ, 0.36);
  const x = clear ? candidateX : placement.anchorMeters[0];
  const z = clear ? candidateZ : placement.anchorMeters[2];
  root.position.set(x, safeTerrainHeight(terrainHeightAt, x, z) + 0.006, z);
  root.rotation.y = phase + Math.PI * 0.5;
  const scale = placement.scale * RABBIT_SCENE_SCALE;
  root.scale.setScalar(scale);
}

/**
 * Optional exact Lowlands Rabbit layer. The procedural countryside rabbits
 * remain available to the caller until this integrity-pinned asset is ready.
 */
export function createInnerKeepRabbitPresentation(
  options: CreateInnerKeepRabbitPresentationOptions,
): InnerKeepRabbitPresentation {
  const group = new THREE.Group();
  group.name = 'inner-keep-exact-lowlands-rabbits';
  group.userData.presentationOnly = true;
  group.userData.gameplayAuthorityClaimed = false;
  group.userData.pickable = false;

  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const pointIsClear = options.pointIsClear ?? innerKeepOuterWorldPointIsClear;
  const placements = planInnerKeepOuterWorldWildlife({
    quality: options.quality,
    visualSeed: options.visualSeed,
    terrainHeightAt,
    pointIsClear,
  });
  const lod = innerKeepRabbitLodForQuality(options.quality, options.reducedMotion);
  const internalAbortController = new AbortController();
  const actors: RabbitActor[] = [];
  let lease: InnerKeepRabbitPrefabLease | null = null;
  let disposed = false;
  let aborted = false;
  let telemetry: InnerKeepRabbitPresentationTelemetry;

  const publishTelemetry = (
    status: InnerKeepRabbitPresentationStatus,
    failureMessage: string | null = null,
  ) => {
    telemetry = Object.freeze({
      status,
      lod,
      rabbitCount: status === 'ready' ? actors.length : 0,
      animatedRabbitCount: status === 'ready'
        ? actors.filter(({ mixer }) => mixer !== null).length
        : 0,
      groundedRabbitCount: status === 'ready' ? actors.length : 0,
      animationMixerCount: status === 'ready'
        ? actors.filter(({ mixer }) => mixer !== null).length
        : 0,
      runtimeAssetFailureCount: status === 'failed' ? 1 : 0,
      failureMessage,
      presentationOnly: true,
      gameplayAuthority: 'none',
    });
    options.onTelemetryChange?.(telemetry);
  };

  const stopActorList = (target: RabbitActor[]) => {
    target.forEach(({ mixer, root }) => {
      mixer?.stopAllAction();
      mixer?.uncacheRoot(root);
      root.removeFromParent();
    });
    target.length = 0;
  };
  const stopActors = () => stopActorList(actors);

  const handleExternalAbort = () => {
    if (disposed || aborted) return;
    aborted = true;
    internalAbortController.abort();
    stopActors();
    lease?.release();
    lease = null;
    publishTelemetry('aborted');
  };
  const loadExactAsset = options.loadExactAsset !== false;
  publishTelemetry(loadExactAsset ? 'loading' : 'disabled');
  options.signal?.addEventListener('abort', handleExternalAbort, { once: true });
  if (options.signal?.aborted) handleExternalAbort();

  const ready = loadExactAsset && !aborted
    ? (options.acquirePrefab ?? acquireInnerKeepRabbitPrefab)({
        lod,
        baseUrl: options.baseUrl,
        maxAnisotropy: options.maxAnisotropy,
        signal: internalAbortController.signal,
      }).then((nextLease) => {
        if (disposed || aborted) {
          nextLease.release();
          return;
        }
        lease = nextLease;
        const nextActors: RabbitActor[] = [];
        try {
          placements.forEach((placement, index) => {
            const root = nextLease.prefab.clone();
            root.name = `inner-keep-lowlands-rabbit:${index}`;
            root.userData.innerKeepOuterWorldGroundContact = true;
            root.userData.innerKeepOuterWorldWildlifeIndex = index;
            disableAuthorityShadowsAndPicking(root);
            const mixer = nextLease.prefab.animated
              && nextLease.prefab.clips.length > 0
              ? new THREE.AnimationMixer(root)
              : null;
            const clip = mixer ? chooseRabbitClip(nextLease.prefab.clips, index) : undefined;
            if (mixer && clip) {
              const action = mixer.clipAction(clip);
              action.time = placement.phaseRadians % Math.max(clip.duration, 0.001);
              action.play();
            }
            const actor = Object.freeze({ root, mixer, placement });
            applyRabbitPose(
              actor,
              0,
              !options.reducedMotion,
              terrainHeightAt,
              pointIsClear,
            );
            nextActors.push(actor);
          });
          nextActors.forEach(({ root }) => group.add(root));
          actors.push(...nextActors);
        } catch (error) {
          stopActorList(nextActors);
          throw error;
        }
        publishTelemetry('ready');
        options.requestRender?.();
      }).catch((error: unknown) => {
        if (disposed) return;
        stopActors();
        lease?.release();
        lease = null;
        if (aborted || isAbortError(error)) {
          aborted = true;
          internalAbortController.abort();
          publishTelemetry('aborted');
          return;
        }
        publishTelemetry(
          'failed',
          error instanceof Error ? error.message.slice(0, 240) : 'Rabbit asset load failed.',
        );
        options.requestRender?.();
      })
    : Promise.resolve();

  return Object.freeze({
    group,
    ready,
    update: (elapsedSeconds) => {
      if (
        disposed
        || aborted
        || telemetry.status !== 'ready'
        || options.reducedMotion
        || !Number.isFinite(elapsedSeconds)
      ) return false;
      const boundedElapsedSeconds = Math.max(0, elapsedSeconds);
      actors.forEach((actor) => {
        applyRabbitPose(
          actor,
          boundedElapsedSeconds,
          true,
          terrainHeightAt,
          pointIsClear,
        );
        actor.mixer?.setTime(boundedElapsedSeconds + actor.placement.phaseRadians);
      });
      return actors.length > 0;
    },
    isAnimationActive: () => (
      !disposed
      && !aborted
      && !options.reducedMotion
      && telemetry.status === 'ready'
      && actors.length > 0
    ),
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      internalAbortController.abort();
      options.signal?.removeEventListener('abort', handleExternalAbort);
      stopActors();
      lease?.release();
      lease = null;
      group.removeFromParent();
      group.clear();
      publishTelemetry('disposed');
    },
  });
}
