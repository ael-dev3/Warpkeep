import * as THREE from 'three';

export type RealmGrassGeometryProfile = 'high' | 'balanced' | 'reduced';

export const REALM_GRASS_RIBBONS: Readonly<Record<RealmGrassGeometryProfile, number>> =
  Object.freeze({ high: 5, balanced: 4, reduced: 3 });

export const REALM_GRASS_TRIANGLES_PER_RIBBON = 3;

/**
 * Programmatic crossed ribbons keep the silhouette broad at strategic camera
 * distances without texture cards. The unit geometry is scaled per instance.
 */
export function createLowPolyGrassGeometry(profile: RealmGrassGeometryProfile) {
  const ribbonCount = REALM_GRASS_RIBBONS[profile];
  const positions: number[] = [];
  const normals: number[] = [];
  const flex: number[] = [];
  const indices: number[] = [];

  for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
    const angle = (ribbon / ribbonCount) * Math.PI + (ribbon % 2) * 0.19;
    const acrossX = Math.cos(angle) * 0.5;
    const acrossZ = Math.sin(angle) * 0.5;
    const forwardX = -Math.sin(angle);
    const forwardZ = Math.cos(angle);
    const lean = 0.14 + (ribbon % 3) * 0.045;
    const rootWidth = 0.52;
    const middleWidth = 0.31;
    const base = positions.length / 3;
    // Two planted roots, two mid vertices, then one tapered tip.
    positions.push(
      -acrossX * rootWidth, 0, -acrossZ * rootWidth,
      acrossX * rootWidth, 0, acrossZ * rootWidth,
      -acrossX * middleWidth + forwardX * lean * 0.46, 0.56, -acrossZ * middleWidth + forwardZ * lean * 0.46,
      acrossX * middleWidth + forwardX * lean * 0.46, 0.56, acrossZ * middleWidth + forwardZ * lean * 0.46,
      forwardX * lean, 1, forwardZ * lean
    );
    flex.push(0, 0, 0.56, 0.56, 1);
    // Explicit upward-biased normals keep double-sided ribbons bright under
    // Lowlands lighting instead of relying on inconsistent thin-triangle math.
    for (let vertex = 0; vertex < 5; vertex += 1) {
      const normalX = forwardX * 0.24;
      const normalY = 0.92;
      const normalZ = forwardZ * 0.24;
      const length = Math.hypot(normalX, normalY, normalZ);
      normals.push(normalX / length, normalY / length, normalZ / length);
    }
    indices.push(
      base, base + 1, base + 2,
      base + 1, base + 3, base + 2,
      base + 2, base + 3, base + 4
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('grassFlex', new THREE.Float32BufferAttribute(flex, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.realmGrassGeometryProfile = profile;
  geometry.userData.realmGrassTriangleCount = ribbonCount * REALM_GRASS_TRIANGLES_PER_RIBBON;
  return geometry;
}
