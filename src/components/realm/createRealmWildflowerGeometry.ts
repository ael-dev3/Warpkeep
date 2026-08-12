import * as THREE from 'three';

/** One crossed flower card: two intersecting quads with opaque stochastic cutout. */
export const REALM_WILDFLOWER_TRIANGLES_PER_INSTANCE = 4;

/**
 * Tiny camera-independent cross billboard. The lower green stem occupies most
 * of the card and the petal mask is synthesized in the material, so no texture
 * allocation or network asset is required.
 */
export function createRealmWildflowerGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const cardData: number[] = [];
  const indices: number[] = [];
  const appendCard = (yaw: number) => {
    const acrossX = Math.cos(yaw);
    const acrossZ = Math.sin(yaw);
    const normalX = -acrossZ;
    const normalZ = acrossX;
    const base = positions.length / 3;
    positions.push(
      -acrossX * 0.5, 0, -acrossZ * 0.5,
      acrossX * 0.5, 0, acrossZ * 0.5,
      -acrossX * 0.5, 1, -acrossZ * 0.5,
      acrossX * 0.5, 1, acrossZ * 0.5
    );
    for (let vertex = 0; vertex < 4; vertex += 1) {
      normals.push(normalX, 0.18, normalZ);
    }
    // x = horizontal card coordinate, y = normalized stem/head height.
    cardData.push(-1, 0, 1, 0, -1, 1, 1, 1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  };
  appendCard(0);
  appendCard(Math.PI * 0.5);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('flowerCardData', new THREE.Float32BufferAttribute(cardData, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.realmWildflowerTriangles = REALM_WILDFLOWER_TRIANGLES_PER_INSTANCE;
  geometry.userData.realmWildflowerTopology = 'opaque-alpha-cutout-cross-billboard';
  return geometry;
}
