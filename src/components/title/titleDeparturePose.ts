import * as THREE from 'three';

export type TitleDeparturePose = Readonly<{
  pointerX: number;
  pointerY: number;
  galaxyX: number;
  galaxyY: number;
  galaxyZ: number;
  galaxyScaleX: number;
  galaxyScaleY: number;
  galaxyScaleZ: number;
  galaxyGrowthScale: number;
  galaxyParallaxRotationX: number;
  galaxyParallaxRotationY: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraQuaternionX: number;
  cameraQuaternionY: number;
  cameraQuaternionZ: number;
  cameraQuaternionW: number;
}>;

type TitleDeparturePoseSource = Readonly<{
  pointerCurrent: Readonly<{ x: number; y: number }>;
  galaxyGroup: THREE.Object3D;
  galaxyGrowthGroup: THREE.Object3D;
  galaxyParallaxGroup: THREE.Object3D;
  camera: THREE.Camera;
}>;

type TitleDeparturePoseTarget = TitleDeparturePoseSource & Readonly<{
  pointerTarget: { x: number; y: number };
  pointerCurrent: { x: number; y: number };
}>;

function finitePoseValues(pose: TitleDeparturePose) {
  return Object.values(pose).every(Number.isFinite);
}

/**
 * Freezes the last fully rendered gateway pose at activation. The CSS veil
 * retains that rendered gateway center; holding the underlying scene prevents
 * camera and pointer-parallax drift from moving the violet gateway beneath it.
 */
export function captureTitleDeparturePose(
  source: TitleDeparturePoseSource
): TitleDeparturePose {
  const pose = {
    pointerX: source.pointerCurrent.x,
    pointerY: source.pointerCurrent.y,
    galaxyX: source.galaxyGroup.position.x,
    galaxyY: source.galaxyGroup.position.y,
    galaxyZ: source.galaxyGroup.position.z,
    galaxyScaleX: source.galaxyGroup.scale.x,
    galaxyScaleY: source.galaxyGroup.scale.y,
    galaxyScaleZ: source.galaxyGroup.scale.z,
    galaxyGrowthScale: source.galaxyGrowthGroup.scale.x,
    galaxyParallaxRotationX: source.galaxyParallaxGroup.rotation.x,
    galaxyParallaxRotationY: source.galaxyParallaxGroup.rotation.y,
    cameraX: source.camera.position.x,
    cameraY: source.camera.position.y,
    cameraZ: source.camera.position.z,
    cameraQuaternionX: source.camera.quaternion.x,
    cameraQuaternionY: source.camera.quaternion.y,
    cameraQuaternionZ: source.camera.quaternion.z,
    cameraQuaternionW: source.camera.quaternion.w
  } satisfies TitleDeparturePose;
  if (!finitePoseValues(pose)) {
    throw new Error('TITLE_DEPARTURE_POSE_INVALID');
  }
  return Object.freeze(pose);
}

export function applyTitleDeparturePose(
  pose: TitleDeparturePose,
  target: TitleDeparturePoseTarget
) {
  if (!finitePoseValues(pose)) {
    throw new Error('TITLE_DEPARTURE_POSE_INVALID');
  }
  target.pointerTarget.x = pose.pointerX;
  target.pointerTarget.y = pose.pointerY;
  target.pointerCurrent.x = pose.pointerX;
  target.pointerCurrent.y = pose.pointerY;
  target.galaxyGroup.position.set(pose.galaxyX, pose.galaxyY, pose.galaxyZ);
  target.galaxyGroup.scale.set(
    pose.galaxyScaleX,
    pose.galaxyScaleY,
    pose.galaxyScaleZ
  );
  target.galaxyGrowthGroup.scale.setScalar(pose.galaxyGrowthScale);
  target.galaxyParallaxGroup.rotation.x = pose.galaxyParallaxRotationX;
  target.galaxyParallaxGroup.rotation.y = pose.galaxyParallaxRotationY;
  target.camera.position.set(pose.cameraX, pose.cameraY, pose.cameraZ);
  target.camera.quaternion.set(
    pose.cameraQuaternionX,
    pose.cameraQuaternionY,
    pose.cameraQuaternionZ,
    pose.cameraQuaternionW
  );
}
