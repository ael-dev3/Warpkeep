import * as THREE from 'three';

import {
  sampleInnerKeepAmbientFrame,
  type InnerKeepAmbientActorPose,
  type InnerKeepAmbientFrame,
  type InnerKeepAmbientSimulationPlan,
} from './innerKeepAmbientTimeline';
import { innerKeepAmbientTargetHeightMeters } from './innerKeepAmbientPolicy';
import type { InnerKeepRuntimeAssetBundle } from './loadInnerKeepRuntimeAssets';

export type InnerKeepPopulationTelemetry = Readonly<{
  actorCount: number;
  authoredActorCount: number;
  fallbackActorCount: number;
  mountedActorCount: number;
  patrolUnitCount: number;
  animationMixerCount: number;
  activeConversationCount: number;
}>;

export type InnerKeepPopulationPresentation = Readonly<{
  group: THREE.Group;
  update: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  getFrame: () => InnerKeepAmbientFrame;
  getTelemetry: () => InnerKeepPopulationTelemetry;
  dispose: () => void;
}>;

type ActorRenderState = {
  actorId: string;
  wrapper: THREE.Group;
  model: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
  bubble: THREE.Sprite | null;
  targetHeight: number;
  authored: boolean;
};

export type InnerKeepPopulationClipWeight = Readonly<{
  clipName: string;
  clipPhase: number;
  weight: number;
}>;

/** Pure clip resolution used by both the renderer and deterministic tests. */
export function resolveInnerKeepPopulationClipWeights(
  pose: Pick<InnerKeepAmbientActorPose,
    'clipName' | 'clipPhase' | 'clipBlend'
  >,
  availableClipNames: readonly string[],
): readonly InnerKeepPopulationClipWeight[] {
  const available = new Set(availableClipNames);
  const targetClipName = available.has(pose.clipName)
    ? pose.clipName
    : available.has('Idle')
      ? 'Idle'
      : availableClipNames[0];
  if (!targetClipName) return Object.freeze([]);
  const blend = pose.clipBlend;
  const targetPhase = targetClipName === pose.clipName ? pose.clipPhase : 0;
  if (
    !blend
    || !available.has(blend.fromClipName)
    || blend.fromClipName === targetClipName
  ) {
    return Object.freeze([Object.freeze({
      clipName: targetClipName,
      clipPhase: targetPhase,
      weight: 1,
    })]);
  }
  const targetWeight = Math.max(0, Math.min(1, blend.progress));
  return Object.freeze([
    Object.freeze({
      clipName: blend.fromClipName,
      clipPhase: blend.fromClipPhase,
      weight: 1 - targetWeight,
    }),
    Object.freeze({
      clipName: targetClipName,
      clipPhase: targetPhase,
      weight: targetWeight,
    }),
  ]);
}

function createConversationTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(24, 22, 29, 0.9)';
  context.beginPath();
  context.roundRect(6, 6, 84, 50, 18);
  context.fill();
  context.beginPath();
  context.moveTo(43, 54);
  context.lineTo(53, 68);
  context.lineTo(58, 52);
  context.fill();
  context.fillStyle = '#ead9a6';
  context.font = 'bold 34px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('···', 48, 29);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackActor(
  pose: InnerKeepAmbientActorPose,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const group = new THREE.Group();
  const palette = pose.presentationRole === 'ceremonial-patrol'
    ? pose.mounted ? 0x5b385f : 0x4b5367
    : pose.mounted ? 0x77513b : 0x755f4c;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: palette,
    roughness: 0.82,
    metalness: pose.presentationRole === 'ceremonial-patrol' ? 0.16 : 0.02,
  });
  materials.add(bodyMaterial);
  const bodyGeometry = new THREE.CapsuleGeometry(0.22, 0.62, 4, 8);
  const headGeometry = new THREE.SphereGeometry(0.19, 10, 8);
  geometries.add(bodyGeometry);
  geometries.add(headGeometry);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.65;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  head.position.y = 1.28;
  head.castShadow = true;
  group.add(body, head);
  if (pose.mounted) {
    const mountGeometry = new THREE.CapsuleGeometry(0.34, 0.82, 4, 8);
    geometries.add(mountGeometry);
    const mount = new THREE.Mesh(mountGeometry, bodyMaterial);
    mount.rotation.z = Math.PI / 2;
    mount.position.set(0, 0.48, 0.12);
    mount.scale.set(1, 1, 0.78);
    mount.castShadow = true;
    mount.receiveShadow = true;
    body.position.y += 0.42;
    head.position.y += 0.42;
    group.add(mount);
  }
  return group;
}

function actionForPose(state: ActorRenderState, pose: InnerKeepAmbientActorPose) {
  if (!state.mixer || state.actions.size === 0) return;
  const resolved = resolveInnerKeepPopulationClipWeights(
    pose,
    [...state.actions.keys()],
  );
  for (const candidate of state.actions.values()) {
    candidate.enabled = false;
    candidate.setEffectiveWeight(0);
  }
  for (const clip of resolved) {
    const action = state.actions.get(clip.clipName);
    if (!action) continue;
    action.enabled = true;
    action.paused = true;
    action.setEffectiveWeight(clip.weight);
    action.time = Math.max(0, Math.min(0.999_999, clip.clipPhase))
      * Math.max(0.001, action.getClip().duration);
  }
  state.mixer.update(0);
}

function applyPose(state: ActorRenderState, pose: InnerKeepAmbientActorPose) {
  state.wrapper.position.set(pose.position.x, 0.13, pose.position.z);
  // Authored unit exports face local -Z; deterministic routes use local +Z.
  state.wrapper.rotation.y = pose.yawRadians + Math.PI;
  state.bubble && (state.bubble.visible = pose.conversation !== null);
  actionForPose(state, pose);
  state.wrapper.userData.innerKeepAmbientBehavior = pose.behavior;
  state.wrapper.userData.innerKeepConversationId = pose.conversation?.conversationId ?? null;
  state.wrapper.userData.innerKeepClipBlendProgress = pose.clipBlend?.progress ?? null;
}

export function createInnerKeepPopulationPresentation(options: Readonly<{
  bundle: InnerKeepRuntimeAssetBundle;
  plan: InnerKeepAmbientSimulationPlan;
}>): InnerKeepPopulationPresentation {
  const group = new THREE.Group();
  group.name = 'inner-keep-ambient-population';
  group.userData.presentationOnly = true;
  group.userData.gameplayAuthorityClaimed = false;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const conversationTexture = createConversationTexture();
  const conversationMaterial = new THREE.SpriteMaterial({
    ...(conversationTexture ? { map: conversationTexture } : {}),
    color: conversationTexture ? 0xffffff : 0xead9a6,
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  });
  materials.add(conversationMaterial);
  let frame = sampleInnerKeepAmbientFrame(options.plan, 0);
  const poseByActorId = new Map(frame.actors.map((pose) => [pose.actorId, pose]));
  const states = new Map<string, ActorRenderState>();
  let authoredActorCount = 0;
  let animationMixerCount = 0;
  for (const routine of options.plan.routines) {
    const pose = poseByActorId.get(routine.actor.actorId)!;
    const prefab = options.bundle.populationPrefabs.get(pose.actorId);
    const authored = prefab !== undefined;
    const model = prefab?.clone() ?? createFallbackActor(pose, geometries, materials);
    model.name = authored
      ? `inner-keep-authored-actor-model:${pose.actorId}`
      : `inner-keep-fallback-actor-model:${pose.actorId}`;
    const targetHeight = innerKeepAmbientTargetHeightMeters(pose.category);
    const sourceHeight = prefab?.boundsMeters[1] ?? targetHeight;
    model.scale.setScalar(targetHeight / Math.max(0.001, sourceHeight));
    const wrapper = new THREE.Group();
    wrapper.name = `inner-keep-ambient-actor:${pose.actorId}`;
    wrapper.userData.innerKeepActorId = pose.actorId;
    wrapper.userData.innerKeepActorCategory = pose.category;
    wrapper.userData.innerKeepPresentationRole = pose.presentationRole;
    wrapper.userData.innerKeepMounted = pose.mounted;
    wrapper.add(model);
    const bubble = pose.presentationRole === 'civic-routine'
      ? new THREE.Sprite(conversationMaterial)
      : null;
    if (bubble) {
      bubble.name = `inner-keep-conversation-indicator:${pose.actorId}`;
      bubble.position.set(0, targetHeight + 0.42, 0);
      bubble.scale.set(0.64, 0.48, 1);
      bubble.visible = false;
      wrapper.add(bubble);
    }
    const mixer = prefab?.animated && options.plan.motionEnabled
      ? new THREE.AnimationMixer(model)
      : null;
    const actions = new Map<string, THREE.AnimationAction>();
    if (mixer && prefab) {
      prefab.clips.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.setEffectiveWeight(0);
        action.play();
        action.paused = true;
        actions.set(clip.name, action);
      });
      animationMixerCount += 1;
    }
    const state: ActorRenderState = {
      actorId: pose.actorId,
      wrapper,
      model,
      mixer,
      actions,
      bubble,
      targetHeight,
      authored,
    };
    applyPose(state, pose);
    states.set(pose.actorId, state);
    group.add(wrapper);
    if (authored) authoredActorCount += 1;
  }
  let disposed = false;
  let telemetry: InnerKeepPopulationTelemetry = Object.freeze({
    actorCount: frame.actors.length,
    authoredActorCount,
    fallbackActorCount: frame.actors.length - authoredActorCount,
    mountedActorCount: frame.mountedActorCount,
    patrolUnitCount: frame.patrolUnitCount,
    animationMixerCount,
    activeConversationCount: frame.activeConversationCount,
  });
  return Object.freeze({
    group,
    update: (elapsedSeconds) => {
      if (disposed) return false;
      frame = sampleInnerKeepAmbientFrame(options.plan, elapsedSeconds);
      frame.actors.forEach((pose) => {
        const state = states.get(pose.actorId);
        if (state) applyPose(state, pose);
      });
      telemetry = Object.freeze({
        ...telemetry,
        activeConversationCount: frame.activeConversationCount,
      });
      return frame.animationActive;
    },
    isAnimationActive: () => !disposed && options.plan.motionEnabled && states.size > 0,
    getFrame: () => frame,
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      states.forEach((state) => {
        state.mixer?.stopAllAction();
        if (state.mixer) state.mixer.uncacheRoot(state.model);
      });
      states.clear();
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      conversationTexture?.dispose();
      geometries.clear();
      materials.clear();
    },
  });
}
