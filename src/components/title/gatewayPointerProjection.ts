import * as THREE from 'three';

export type GatewayPointerProjection = {
  x: number;
  y: number;
  valid: boolean;
};

export type GatewayPointerProjectionScratch = {
  raycaster: THREE.Raycaster;
  discPlane: THREE.Plane;
  ndc: THREE.Vector2;
  planeOrigin: THREE.Vector3;
  planeTangentX: THREE.Vector3;
  planeTangentY: THREE.Vector3;
  planeNormal: THREE.Vector3;
  worldIntersection: THREE.Vector3;
  spinLocalIntersection: THREE.Vector3;
  inverseSpinWorld: THREE.Matrix4;
};

const MINIMUM_PLANE_NORMAL_LENGTH_SQUARED = 1e-16;
const MINIMUM_MATRIX_DETERMINANT = 1e-12;

/**
 * Allocates the mutable Three.js objects used by pointer projection once.
 * Reuse one scratch object for every frame rather than constructing temporary
 * vectors, planes, or matrices in the render loop.
 */
export function createGatewayPointerProjectionScratch(): GatewayPointerProjectionScratch {
  return {
    raycaster: new THREE.Raycaster(),
    discPlane: new THREE.Plane(),
    ndc: new THREE.Vector2(),
    planeOrigin: new THREE.Vector3(),
    planeTangentX: new THREE.Vector3(),
    planeTangentY: new THREE.Vector3(),
    planeNormal: new THREE.Vector3(),
    worldIntersection: new THREE.Vector3(),
    spinLocalIntersection: new THREE.Vector3(),
    inverseSpinWorld: new THREE.Matrix4()
  };
}

function invalidate(output: GatewayPointerProjection) {
  output.x = 0;
  output.y = 0;
  output.valid = false;
  return output;
}

function matrixIsFinite(matrix: THREE.Matrix4) {
  for (let index = 0; index < matrix.elements.length; index += 1) {
    if (!Number.isFinite(matrix.elements[index])) {
      return false;
    }
  }

  return true;
}

/**
 * Casts an NDC pointer ray onto the rendered galaxy disc and expresses the hit
 * in spin-group local coordinates, normalized by the galaxy radius. The
 * caller owns both `output` and `scratch`, so successful and failed calls are
 * allocation-free after setup.
 */
export function projectGatewayPointerToDisc(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
  disc: THREE.Object3D,
  spinGroup: THREE.Object3D,
  normalizationRadius: number,
  output: GatewayPointerProjection,
  scratch: GatewayPointerProjectionScratch
) {
  if (
    !Number.isFinite(ndcX) ||
    !Number.isFinite(ndcY) ||
    !Number.isFinite(normalizationRadius) ||
    normalizationRadius <= 0
  ) {
    return invalidate(output);
  }

  camera.updateWorldMatrix(true, false);
  disc.updateWorldMatrix(true, false);
  spinGroup.updateWorldMatrix(true, false);

  if (
    !matrixIsFinite(camera.matrixWorld) ||
    !matrixIsFinite(camera.projectionMatrix) ||
    !matrixIsFinite(disc.matrixWorld) ||
    !matrixIsFinite(spinGroup.matrixWorld)
  ) {
    return invalidate(output);
  }

  const spinDeterminant = spinGroup.matrixWorld.determinant();
  if (
    !Number.isFinite(spinDeterminant) ||
    Math.abs(spinDeterminant) <= MINIMUM_MATRIX_DETERMINANT
  ) {
    return invalidate(output);
  }

  scratch.planeOrigin.set(0, 0, 0).applyMatrix4(disc.matrixWorld);
  scratch.planeTangentX
    .set(1, 0, 0)
    .applyMatrix4(disc.matrixWorld)
    .sub(scratch.planeOrigin);
  scratch.planeTangentY
    .set(0, 1, 0)
    .applyMatrix4(disc.matrixWorld)
    .sub(scratch.planeOrigin);
  scratch.planeNormal.crossVectors(scratch.planeTangentX, scratch.planeTangentY);

  const normalLengthSquared = scratch.planeNormal.lengthSq();
  if (
    !Number.isFinite(normalLengthSquared) ||
    normalLengthSquared <= MINIMUM_PLANE_NORMAL_LENGTH_SQUARED
  ) {
    return invalidate(output);
  }

  scratch.planeNormal.multiplyScalar(1 / Math.sqrt(normalLengthSquared));
  scratch.discPlane.setFromNormalAndCoplanarPoint(
    scratch.planeNormal,
    scratch.planeOrigin
  );
  scratch.ndc.set(ndcX, ndcY);
  scratch.raycaster.setFromCamera(scratch.ndc, camera);

  const intersection = scratch.raycaster.ray.intersectPlane(
    scratch.discPlane,
    scratch.worldIntersection
  );
  if (!intersection) {
    return invalidate(output);
  }

  scratch.inverseSpinWorld.copy(spinGroup.matrixWorld).invert();
  scratch.spinLocalIntersection
    .copy(scratch.worldIntersection)
    .applyMatrix4(scratch.inverseSpinWorld);

  const x = scratch.spinLocalIntersection.x / normalizationRadius;
  const y = scratch.spinLocalIntersection.y / normalizationRadius;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return invalidate(output);
  }

  output.x = x;
  output.y = y;
  output.valid = true;
  return output;
}
