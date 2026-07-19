import * as THREE from 'three';

export type RealmGrassGeometryProfile = 'high' | 'balanced' | 'reduced';

/**
 * A patch is deliberately made from individual, planted blades instead of
 * crossed ribbons. That keeps the silhouette broad while leaving enough
 * variation for deterministic variants to read as a small meadow, not a spike.
 */
export const REALM_GRASS_BLADES_PER_PATCH: Readonly<Record<RealmGrassGeometryProfile, number>> = Object.freeze({
  high: 9,
  balanced: 7,
  reduced: 5
});
export const REALM_GRASS_VARIANT_COUNTS: Readonly<Record<RealmGrassGeometryProfile, number>> = Object.freeze({
  high: 3,
  balanced: 2,
  reduced: 1
});
export const REALM_GRASS_TRIANGLES_PER_BLADE = 3;
export const REALM_GRASS_TRIANGLES_PER_PATCH: Readonly<Record<RealmGrassGeometryProfile, number>> = Object.freeze({
  high: REALM_GRASS_BLADES_PER_PATCH.high * REALM_GRASS_TRIANGLES_PER_BLADE,
  balanced: REALM_GRASS_BLADES_PER_PATCH.balanced * REALM_GRASS_TRIANGLES_PER_BLADE,
  reduced: REALM_GRASS_BLADES_PER_PATCH.reduced * REALM_GRASS_TRIANGLES_PER_BLADE
});

// Kept as aliases for callers that used the original vocabulary. New code
// should use blades/patches above so geometry budgets are explicit.
export const REALM_GRASS_RIBBONS = REALM_GRASS_BLADES_PER_PATCH;
export const REALM_GRASS_TRIANGLES_PER_RIBBON = REALM_GRASS_TRIANGLES_PER_BLADE;

type Root = readonly [number, number];

const root = (x: number, z: number): Root => [x, z];

const ROOTS: Readonly<Record<RealmGrassGeometryProfile, readonly Root[]>> = Object.freeze({
  high: Object.freeze([
    root(-0.34, -0.05),
    root(0.11, -0.39),
    root(0.39, 0.08),
    root(-0.12, 0.22),
    root(0.27, 0.29),
    root(-0.42, 0.17),
    root(0.02, 0.44),
    root(-0.28, -0.31),
    root(0.41, -0.19)
  ]),
  balanced: Object.freeze([
    root(-0.34, -0.05),
    root(0.11, -0.39),
    root(0.39, 0.08),
    root(-0.12, 0.22),
    root(0.27, 0.29),
    root(-0.42, 0.17),
    root(0.02, 0.44)
  ]),
  reduced: Object.freeze([root(-0.34, -0.05), root(0.11, -0.39), root(0.39, 0.08), root(-0.12, 0.22), root(0.27, 0.29)])
});

function variantRoot(root: Root, variant: number, blade: number): Root {
  const angle = variant * 0.71 + (blade % 3) * 0.018;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = root[0] * cos - root[1] * sin;
  const z = root[0] * sin + root[1] * cos;
  return [x, z];
}

function seededUnit(value: number) {
  const hash = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return hash - Math.floor(hash);
}

/**
 * Build one deterministic low-poly patch variant. The root coordinates stay
 * in a broad 0.08–0.46 local disk and never collapse to the origin.
 */
export function createLowPolyGrassGeometry(profile: RealmGrassGeometryProfile, variant = 0) {
  const bladeCount = REALM_GRASS_BLADES_PER_PATCH[profile];
  const variantCount = REALM_GRASS_VARIANT_COUNTS[profile];
  const safeVariant = Math.max(0, Math.trunc(variant)) % variantCount;
  const positions: number[] = [];
  const normals: number[] = [];
  const flex: number[] = [];
  const across: number[] = [];
  const vertical: number[] = [];
  const bladePhase: number[] = [];
  const bladeStiffness: number[] = [];
  const indices: number[] = [];

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const [rootX, rootZ] = variantRoot(ROOTS[profile][blade]!, safeVariant, blade);
    const yaw = seededUnit(blade + safeVariant * 17.3) * Math.PI * 2;
    const acrossX = Math.cos(yaw);
    const acrossZ = Math.sin(yaw);
    const forwardX = -acrossZ;
    const forwardZ = acrossX;
    const lean = 0.08 + seededUnit(blade * 2.7 + safeVariant * 5.1) * 0.085;
    const rootHalfWidth = 0.055;
    const middleHalfWidth = 0.036;
    const base = positions.length / 3;
    const midX = rootX + forwardX * lean * 0.42;
    const midZ = rootZ + forwardZ * lean * 0.42;
    const tipX = rootX + forwardX * lean;
    const tipZ = rootZ + forwardZ * lean;
    positions.push(
      rootX - acrossX * rootHalfWidth,
      0,
      rootZ - acrossZ * rootHalfWidth,
      rootX + acrossX * rootHalfWidth,
      0,
      rootZ + acrossZ * rootHalfWidth,
      midX - acrossX * middleHalfWidth,
      0.56,
      midZ - acrossZ * middleHalfWidth,
      midX + acrossX * middleHalfWidth,
      0.56,
      midZ + acrossZ * middleHalfWidth,
      tipX,
      1,
      tipZ
    );
    flex.push(0, 0, 0.56, 0.56, 1);
    across.push(-1, 1, -1, 1, 0);
    vertical.push(0, 0, 0.56, 0.56, 1);
    const phase = seededUnit(blade * 9.17 + safeVariant * 3.31) * Math.PI * 2;
    const stiffness = 0.78 + seededUnit(blade * 4.91 + safeVariant * 1.73) * 0.34;
    bladePhase.push(phase, phase, phase, phase, phase);
    bladeStiffness.push(stiffness, stiffness, stiffness, stiffness, stiffness);
    const normalX = forwardX * 0.28;
    const normalY = 0.86;
    const normalZ = forwardZ * 0.28;
    const length = Math.hypot(normalX, normalY, normalZ);
    for (let vertex = 0; vertex < 5; vertex += 1) {
      normals.push(normalX / length, normalY / length, normalZ / length);
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('grassFlex', new THREE.Float32BufferAttribute(flex, 1));
  geometry.setAttribute('grassBladeAcross', new THREE.Float32BufferAttribute(across, 1));
  geometry.setAttribute('grassBladeVertical', new THREE.Float32BufferAttribute(vertical, 1));
  geometry.setAttribute('grassBladePhase', new THREE.Float32BufferAttribute(bladePhase, 1));
  geometry.setAttribute('grassBladeStiffness', new THREE.Float32BufferAttribute(bladeStiffness, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.realmGrassGeometryProfile = profile;
  geometry.userData.realmGrassVariant = safeVariant;
  geometry.userData.realmGrassBladeCount = bladeCount;
  geometry.userData.realmGrassTriangleCount = REALM_GRASS_TRIANGLES_PER_PATCH[profile];
  geometry.userData.realmGrassRootPositions = Object.freeze(
    ROOTS[profile].map((root) => Object.freeze(variantRoot(root, safeVariant, 0)))
  );
  return geometry;
}
