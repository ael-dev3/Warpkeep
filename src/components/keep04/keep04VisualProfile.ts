import * as THREE from 'three';

export type Quality04 = 'high' | 'balanced' | 'reduced';
export const KEEP04_VISUAL_PROFILE = Object.freeze({
  masonry: '#d7d2ba', timber: '#514237', roofTeal: '#397d7d', warpViolet: '#8d6ac8',
  forestNear: '#52694b', distantHaze: '#a3b3a1', ground: '#7a8063',
  budgets: Object.freeze({
    high: { draws: 180, triangles: 300000, hardDraws: 650, hardTriangles: 900000, transferBytes: 12 * 1048576, trees: 18, cells: 8192, faces: 32768, quads: 2048, grid: 2 },
    balanced: { draws: 120, triangles: 180000, hardDraws: 550, hardTriangles: 520000, transferBytes: 8 * 1048576, trees: 12, cells: 4096, faces: 16384, quads: 1024, grid: 4 },
    reduced: { draws: 80, triangles: 90000, hardDraws: 400, hardTriangles: 250000, transferBytes: 5 * 1048576, trees: 6, cells: 2048, faces: 8192, quads: 512, grid: 4 },
  }),
});

/** Fit the support plus the intentionally visible scenic envelope in camera space. */
export function fitKeep04Camera(camera: THREE.OrthographicCamera, aspect: number) {
  camera.position.set(80, 95, 105); camera.up.set(0, 1, 0); camera.lookAt(0, 0, -4);
  camera.near = 0.1; camera.far = 500; camera.updateMatrixWorld(true);
  let halfX = 0; let halfY = 0;
  const corners = [[-56, -5, -64], [56, -5, -64], [-56, -5, 44], [56, -5, 44], [-56, 18, -64], [56, 18, -64]];
  for (const [x, y, z] of corners) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    halfX = Math.max(halfX, Math.abs(p.x)); halfY = Math.max(halfY, Math.abs(p.y));
  }
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const h = Math.max(halfY, halfX / safeAspect) * 1.1;
  camera.left = -h * safeAspect; camera.right = h * safeAspect; camera.top = h; camera.bottom = -h;
  camera.updateProjectionMatrix();
}

/** Camera-only fit; bounds include the settled model/scaffold and actual footprint. */
export function fitKeep04SiteCamera(camera: THREE.OrthographicCamera, aspect: number, bounds: THREE.Box3): boolean {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray(), aspect].every(Number.isFinite) || aspect <= 0) return false;
  camera.updateMatrixWorld(true);
  const projected = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const center = projected.getCenter(new THREE.Vector3());
  // Translate in the camera plane: orientation and depth range remain unchanged.
  camera.position.add(new THREE.Vector3(center.x, center.y, 0).applyQuaternion(camera.quaternion));
  const size = projected.getSize(new THREE.Vector3());
  const halfHeight = Math.max(12, 1.2 * Math.max(size.y / 2, size.x / (2 * aspect)));
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix(); return true;
}
