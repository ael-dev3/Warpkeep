import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { HegemonyExpeditionModel } from '../src/components/realm/loadHegemonyExpeditionAssets';
import {
  applyRealmWorkerWagonWheelDistance,
  bindRealmWorkerWagonRuntime,
  measureRealmWorkerWagonWheelDistanceMismatch,
  REALM_WORKER_WAGON_CLIP_NAMES,
  REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS
} from '../src/components/realm/realmWorkerWagonRuntime';

function clip(name: string, tracks: THREE.KeyframeTrack[] = []) {
  const duration = name === 'Idle'
    ? 2
    : name === 'Start' || name === 'Stop'
      ? 0.8
      : 1;
  return new THREE.AnimationClip(name, duration, tracks);
}

function model(
  clips = REALM_WORKER_WAGON_CLIP_NAMES.map((name) => clip(name))
): HegemonyExpeditionModel {
  return Object.freeze({
    root: new THREE.Group(),
    clips: Object.freeze(clips),
    footprintDiameter: 0.64,
    visualHeight: 1,
    assetUrl: '/synthetic-wagon.glb'
  });
}

function rig() {
  const root = new THREE.Group();
  const left = new THREE.Bone();
  left.name = 'W_Wheel_L';
  const right = new THREE.Bone();
  right.name = 'W_Wheel_R';
  root.add(left, right);
  return { root, left, right };
}

describe('Realm Worker wagon runtime binding', () => {
  it('binds stable named wheels and derives absolute phase from distance', () => {
    const { root, left, right } = rig();
    const rest = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      0.2
    );
    left.quaternion.copy(rest);
    right.quaternion.copy(rest);
    const binding = bindRealmWorkerWagonRuntime(root, model());

    expect(binding).toMatchObject({
      proceduralWheelDrive: true,
      routeSafe: true,
      issue: 'none'
    });
    const distance = REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS * Math.PI;
    expect(applyRealmWorkerWagonWheelDistance(binding, distance, 1)).toBe(true);
    const expected = rest.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    );
    expect(left.quaternion.angleTo(expected)).toBeLessThan(0.000_001);
    expect(right.quaternion.angleTo(expected)).toBeLessThan(0.000_001);
    expect(measureRealmWorkerWagonWheelDistanceMismatch(
      binding,
      distance,
      1
    )).toBeLessThan(0.000_001);

    expect(applyRealmWorkerWagonWheelDistance(binding, distance * 3, 1)).toBe(true);
    expect(left.quaternion.angleTo(expected)).toBeLessThan(0.000_001);
    left.rotateY(0.1);
    expect(measureRealmWorkerWagonWheelDistanceMismatch(
      binding,
      distance * 3,
      1
    )).toBeGreaterThan(0.09);
  });

  it('fails route-root motion closed and never layers over authored wheels', () => {
    const routeTrack = new THREE.VectorKeyframeTrack(
      'WK_UnitRoot.position',
      [0, 1],
      [0, 0, 0, 1, 0, 0]
    );
    const routeClips = REALM_WORKER_WAGON_CLIP_NAMES.map((name) => (
      clip(name, name === 'Walk' ? [routeTrack] : [])
    ));
    const routeBinding = bindRealmWorkerWagonRuntime(rig().root, model(routeClips));
    expect(routeBinding).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'route-root-track'
    });

    const wheelTrack = new THREE.QuaternionKeyframeTrack(
      'W_Wheel_L.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1]
    );
    const wheelClips = REALM_WORKER_WAGON_CLIP_NAMES.map((name) => (
      clip(name, name === 'Walk' ? [wheelTrack] : [])
    ));
    const wheelBinding = bindRealmWorkerWagonRuntime(rig().root, model(wheelClips));
    expect(wheelBinding).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: true,
      issue: 'wheel-track'
    });
    expect(applyRealmWorkerWagonWheelDistance(wheelBinding, 1, 1)).toBe(false);
  });

  it('rejects incomplete clip and wheel contracts without hiding route safety', () => {
    const incomplete = bindRealmWorkerWagonRuntime(
      rig().root,
      model([clip('Walk')])
    );
    expect(incomplete).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'clip-contract'
    });
    const extraClip = bindRealmWorkerWagonRuntime(
      rig().root,
      model([
        ...REALM_WORKER_WAGON_CLIP_NAMES.map((name) => clip(name)),
        clip('Unreviewed')
      ])
    );
    expect(extraClip).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'clip-contract'
    });
    const wrongDuration = bindRealmWorkerWagonRuntime(
      rig().root,
      model(REALM_WORKER_WAGON_CLIP_NAMES.map((name) => (
        name === 'Start'
          ? new THREE.AnimationClip(name, 1)
          : clip(name)
      )))
    );
    expect(wrongDuration).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: false,
      issue: 'clip-contract'
    });

    const missingWheels = bindRealmWorkerWagonRuntime(
      new THREE.Group(),
      model()
    );
    expect(missingWheels).toMatchObject({
      proceduralWheelDrive: false,
      routeSafe: true,
      issue: 'wheel-binding'
    });
  });
});
