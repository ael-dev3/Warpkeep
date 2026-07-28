import * as THREE from 'three';

import type { HegemonyExpeditionModel } from './loadHegemonyExpeditionAssets';
import type { RealmWorkerAnimationClipName } from './realmWorkerRoutePresentation';

export const REALM_WORKER_WAGON_WHEEL_NAMES = Object.freeze([
  'W_Wheel_L',
  'W_Wheel_R'
] as const);

export const REALM_WORKER_WAGON_CLIP_NAMES = Object.freeze([
  'Idle',
  'Start',
  'Stop',
  'Turn_Left',
  'Turn_Right',
  'Walk'
] as const satisfies readonly RealmWorkerAnimationClipName[]);

const REALM_WORKER_WAGON_CLIP_DURATIONS = Object.freeze({
  Idle: 2,
  Start: 0.8,
  Stop: 0.8,
  Turn_Left: 1,
  Turn_Right: 1,
  Walk: 1
} as const satisfies Readonly<Record<RealmWorkerAnimationClipName, number>>);

/**
 * The reviewed source wheel radius transformed by the immutable 0.64 runtime
 * footprint normalization. A single canonical value keeps distance phase
 * continuous across the optimizer-level rim differences in all three LODs.
 */
export const REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS =
  0.116_776_917_992_489_42;

export type RealmWorkerWagonWheelBinding = Readonly<{
  nodes: readonly [THREE.Object3D, THREE.Object3D];
  restQuaternions: readonly [THREE.Quaternion, THREE.Quaternion];
  radius: number;
}>;

export type RealmWorkerWagonRuntimeBinding = Readonly<{
  clipsByName: ReadonlyMap<RealmWorkerAnimationClipName, THREE.AnimationClip>;
  wheelBinding?: RealmWorkerWagonWheelBinding;
  proceduralWheelDrive: boolean;
  routeSafe: boolean;
  issue:
    | 'none'
    | 'clip-contract'
    | 'route-root-track'
    | 'wheel-binding'
    | 'wheel-track';
}>;

function trackTarget(trackName: string) {
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(trackName);
    return Object.freeze({
      nodeName: parsed.nodeName ?? '',
      propertyName: parsed.propertyName ?? ''
    });
  } catch {
    return Object.freeze({ nodeName: '', propertyName: '' });
  }
}

function exactClipCatalog(clips: readonly THREE.AnimationClip[]) {
  if (clips.length !== REALM_WORKER_WAGON_CLIP_NAMES.length) return undefined;
  const clipsByName = new Map<RealmWorkerAnimationClipName, THREE.AnimationClip>();
  for (const name of REALM_WORKER_WAGON_CLIP_NAMES) {
    const matches = clips.filter((clip) => clip.name === name);
    if (
      matches.length !== 1
      || !Number.isFinite(matches[0]!.duration)
      || Math.abs(
        matches[0]!.duration - REALM_WORKER_WAGON_CLIP_DURATIONS[name]
      ) > 0.000_001
    ) {
      return undefined;
    }
    clipsByName.set(name, matches[0]!);
  }
  return clipsByName;
}

/**
 * Bind the exact reviewed wagon rig once per visual clone. No traversal occurs
 * on rendered frames. A future route-root or wheel track fails the procedural
 * lane closed instead of double-transforming the model.
 */
export function bindRealmWorkerWagonRuntime(
  root: THREE.Group,
  model: HegemonyExpeditionModel
): RealmWorkerWagonRuntimeBinding {
  const clipsByName = exactClipCatalog(model.clips);
  if (!clipsByName) {
    return Object.freeze({
      clipsByName: new Map(),
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'clip-contract'
    });
  }

  let routeRootConflict = false;
  let wheelTrack = false;
  for (const clip of clipsByName.values()) {
    for (const track of clip.tracks) {
      const target = trackTarget(track.name);
      if (
        (target.nodeName === 'WK_UnitRoot' || target.nodeName === 'W_Root')
        && (
          target.propertyName === 'position'
          || target.propertyName === 'quaternion'
          || target.propertyName === 'rotation'
        )
      ) routeRootConflict = true;
      if (
        REALM_WORKER_WAGON_WHEEL_NAMES.includes(
          target.nodeName as typeof REALM_WORKER_WAGON_WHEEL_NAMES[number]
        )
      ) wheelTrack = true;
    }
  }
  if (routeRootConflict) {
    return Object.freeze({
      clipsByName,
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'route-root-track'
    });
  }

  const left = root.getObjectByName(REALM_WORKER_WAGON_WHEEL_NAMES[0]);
  const right = root.getObjectByName(REALM_WORKER_WAGON_WHEEL_NAMES[1]);
  if (!left || !right || left === right) {
    return Object.freeze({
      clipsByName,
      proceduralWheelDrive: false,
      routeSafe: true,
      issue: 'wheel-binding'
    });
  }
  if (wheelTrack) {
    return Object.freeze({
      clipsByName,
      proceduralWheelDrive: false,
      routeSafe: true,
      issue: 'wheel-track'
    });
  }
  return Object.freeze({
    clipsByName,
    wheelBinding: Object.freeze({
      nodes: Object.freeze([
        left,
        right
      ] as [THREE.Object3D, THREE.Object3D]),
      restQuaternions: Object.freeze([
        left.quaternion.clone(),
        right.quaternion.clone()
      ] as [THREE.Quaternion, THREE.Quaternion]),
      radius: REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS
    }),
    proceduralWheelDrive: true,
    routeSafe: true,
    issue: 'none'
  });
}

const wheelAxis = new THREE.Vector3(0, 1, 0);
const wheelRotation = new THREE.Quaternion();
const expectedWheelQuaternion = new THREE.Quaternion();

/**
 * Set absolute local wheel phase from cumulative travelled distance. This is
 * deliberately non-incremental, so reconnects, dropped frames, and model
 * promotion cannot accumulate angular drift.
 */
export function applyRealmWorkerWagonWheelDistance(
  binding: RealmWorkerWagonRuntimeBinding,
  cumulativeDistance: number,
  worldScale: number
) {
  const wheel = binding.wheelBinding;
  if (
    !binding.proceduralWheelDrive
    || !wheel
    || !Number.isFinite(cumulativeDistance)
    || cumulativeDistance < 0
    || !Number.isFinite(worldScale)
    || worldScale <= 0
  ) return false;
  const radius = wheel.radius * worldScale;
  if (!Number.isFinite(radius) || radius <= 0.000_001) return false;
  const angle = (cumulativeDistance / radius) % (Math.PI * 2);
  wheelRotation.setFromAxisAngle(wheelAxis, angle);
  wheel.nodes.forEach((node, index) => {
    node.quaternion.copy(wheel.restQuaternions[index]!).multiply(wheelRotation);
  });
  return true;
}

/**
 * Compare the rendered wheel-node transforms with the reviewed absolute
 * distance phase. This observes the actual bound nodes rather than comparing
 * two copies of the same scalar formula.
 */
export function measureRealmWorkerWagonWheelDistanceMismatch(
  binding: RealmWorkerWagonRuntimeBinding,
  cumulativeDistance: number,
  worldScale: number
) {
  const wheel = binding.wheelBinding;
  if (
    !binding.proceduralWheelDrive
    || !wheel
    || !Number.isFinite(cumulativeDistance)
    || cumulativeDistance < 0
    || !Number.isFinite(worldScale)
    || worldScale <= 0
  ) return Number.POSITIVE_INFINITY;
  const radius = wheel.radius * worldScale;
  if (!Number.isFinite(radius) || radius <= 0.000_001) {
    return Number.POSITIVE_INFINITY;
  }
  wheelRotation.setFromAxisAngle(
    wheelAxis,
    (cumulativeDistance / radius) % (Math.PI * 2)
  );
  return Math.max(...wheel.nodes.map((node, index) => (
    node.quaternion.angleTo(
      expectedWheelQuaternion
        .copy(wheel.restQuaternions[index]!)
        .multiply(wheelRotation)
    )
  )));
}
