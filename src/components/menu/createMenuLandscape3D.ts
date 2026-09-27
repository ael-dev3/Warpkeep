import * as THREE from 'three';
import type { GraphicsQualityTier } from '../../settings/graphicsPreference';

/** A small, deterministic landscape around the imported castle (whose footprint is roughly ±11). */
export type MenuLandscape3D = Readonly<{
  update: (elapsedSeconds: number) => void;
}>;

const WORLD_SIZE = 210;
const riverHalfWidth = 3.35;

type LandscapeDensity = Readonly<{
  terrainSteps: number;
  riverSections: number;
  riverGlints: number;
  forestAttempts: number;
  rocks: number;
  pathRows: number;
  flowers: number;
}>;

const LANDSCAPE_DENSITY: Readonly<Record<GraphicsQualityTier, LandscapeDensity>> = {
  cinematic: { terrainSteps: 104, riverSections: 140, riverGlints: 84, forestAttempts: 680, rocks: 112, pathRows: 18, flowers: 240 },
  balanced: { terrainSteps: 72, riverSections: 100, riverGlints: 56, forestAttempts: 430, rocks: 76, pathRows: 18, flowers: 150 },
  performance: { terrainSteps: 48, riverSections: 68, riverGlints: 28, forestAttempts: 230, rocks: 44, pathRows: 15, flowers: 80 },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = THREE.MathUtils.lerp(hash(xi, zi), hash(xi + 1, zi), u);
  const b = THREE.MathUtils.lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u);
  return THREE.MathUtils.lerp(a, b, v) * 2 - 1;
}

function riverX(z: number): number {
  return -23 + 6 * Math.sin(z * 0.048 + 0.8) + 2 * Math.sin(z * 0.11 - 0.2);
}

function riverDistance(x: number, z: number): number {
  return Math.abs(x - riverX(z));
}

function terrainHeight(x: number, z: number): number {
  const mountainBand = 1 - smoothstep(-70, -26, z);
  const shoulder = Math.exp(-(((x + 50) / 38) ** 2)) * 13.8;
  const northPeak = Math.exp(-(((x + 7) / 25) ** 2)) * 17.4;
  const easternPeak = Math.exp(-(((x - 48) / 32) ** 2)) * 10.4;
  const ridgeNoise = Math.abs(noise(x * 0.044 + 19, z * 0.054 - 9));
  const crags = (shoulder + northPeak + easternPeak) * mountainBand * (0.72 + ridgeNoise * 0.56);
  const rolling = 0.45 + 0.85 * noise(x * 0.04, z * 0.04) + 0.35 * noise(x * 0.13, z * 0.13);
  const lowerSlope = smoothstep(13, 27, Math.hypot(x * 0.9, z)) * rolling;
  const castleBlend = smoothstep(11.5, 18, Math.max(Math.abs(x), Math.abs(z)));
  const base = Math.max(-0.06, crags + lowerSlope) * castleBlend - 0.06;
  const d = riverDistance(x, z);
  const channel = 1 - smoothstep(riverHalfWidth, riverHalfWidth + 5.8, d);
  return THREE.MathUtils.lerp(base, -0.63, channel);
}

function makeSky(scene: THREE.Scene): void {
  // The camera sits inside this low-poly dome, so there can be no visible backdrop edge.
  const geometry = new THREE.SphereGeometry(195, 40, 16);
  const positions = geometry.getAttribute('position');
  const colors: number[] = [];
  const horizon = new THREE.Color(0x718e9e);
  const middle = new THREE.Color(0x516f89);
  const upper = new THREE.Color(0x294666);
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const t = clamp01((y + 28) / 95);
    const color = t < 0.43
      ? horizon.clone().lerp(middle, t / 0.43)
      : middle.clone().lerp(upper, (t - 0.43) / 0.57);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.BackSide }));
  sky.frustumCulled = false;
  scene.add(sky);
}

function makeGround(scene: THREE.Scene, density: LandscapeDensity): void {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const steps = density.terrainSteps;
  const step = WORLD_SIZE / steps;
  const lowMeadow = new THREE.Color(0x7e986a);
  const deepMeadow = new THREE.Color(0x526c50);
  const highMoss = new THREE.Color(0x758073);
  const rock = new THREE.Color(0x96968d);
  const peak = new THREE.Color(0xb0b1ab);
  const bank = new THREE.Color(0x9aa686);
  for (let zi = 0; zi <= steps; zi += 1) {
    const z = -WORLD_SIZE / 2 + zi * step;
    for (let xi = 0; xi <= steps; xi += 1) {
      const x = -WORLD_SIZE / 2 + xi * step;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      const moisture = (noise(x * 0.13, z * 0.13) + 1) / 2;
      const color = lowMeadow.clone().lerp(deepMeadow, moisture * 0.58);
      color.lerp(highMoss, smoothstep(3.5, 8, y));
      color.lerp(rock, smoothstep(7, 17, y) * 0.79);
      color.lerp(peak, smoothstep(18, 25, y) * 0.75);
      if (riverDistance(x, z) < 7) color.lerp(bank, (1 - smoothstep(4, 7, riverDistance(x, z))) * 0.47);
      color.multiplyScalar(0.91 + hash(xi * 3, zi * 5) * 0.16);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let zi = 0; zi < steps; zi += 1) {
    for (let xi = 0; xi < steps; xi += 1) {
      const a = zi * (steps + 1) + xi;
      const b = a + 1;
      const c = a + steps + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Nonindexed faces give the mountains a deliberate faceted silhouette and distinct planes.
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  const ground = new THREE.Mesh(faceted, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  ground.receiveShadow = true;
  scene.add(ground);
}

function makeRiver(scene: THREE.Scene, density: LandscapeDensity): MenuLandscape3D {
  const sections = density.riverSections;
  const fromZ = -103;
  const toZ = 53;
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const shallows = new THREE.Color(0x82c6c6);
  const deep = new THREE.Color(0x397eaa);
  for (let i = 0; i <= sections; i += 1) {
    const z = THREE.MathUtils.lerp(fromZ, toZ, i / sections);
    for (let across = 0; across <= 4; across += 1) {
      const fraction = across / 4;
      const x = riverX(z) + (fraction - 0.5) * riverHalfWidth * 1.87;
      positions.push(x, -0.43, z);
      const color = deep.clone().lerp(shallows, Math.abs(fraction - 0.5) * 1.0 + hash(i, across) * 0.12);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < sections; i += 1) {
    for (let across = 0; across < 4; across += 1) {
      const a = i * 5 + across;
      indices.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, metalness: 0.18, roughness: 0.24, emissive: 0x12304c, emissiveIntensity: 0.18, side: THREE.DoubleSide }));
  water.renderOrder = 1;
  scene.add(water);

  // Pale, broken lines suggest current without translucent texture cards.
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xd6eff0, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide });
  const glintGeometry = new THREE.PlaneGeometry(1, 1);
  const glints = new THREE.InstancedMesh(glintGeometry, glintMaterial, density.riverGlints);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < glints.count; i += 1) {
    const z = -96 + (i / glints.count) * 145 + hash(i, 7) * 1.7;
    const x = riverX(z) + (hash(i, 12) - 0.5) * riverHalfWidth * 1.43;
    matrix.compose(
      new THREE.Vector3(x, -0.395, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, (hash(i, 4) - 0.5) * 0.28)),
      new THREE.Vector3(0.24 + hash(i, 2) * 0.68, 0.016, 1),
    );
    glints.setMatrixAt(i, matrix);
  }
  glints.instanceMatrix.needsUpdate = true;
  glints.renderOrder = 2;
  scene.add(glints);

  const base = new Float32Array(positions);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  return {
    update(elapsedSeconds) {
      for (let i = 0; i < position.count; i += 1) {
        const offset = i * 3;
        position.setY(i, base[offset + 1] + 0.028 * Math.sin(base[offset + 2] * 0.42 + base[offset] * 0.37 + elapsedSeconds * 1.5));
      }
      position.needsUpdate = true;
    },
  };
}

type TreeSite = { x: number; y: number; z: number; scale: number; color: THREE.Color };

function makeForests(scene: THREE.Scene, density: LandscapeDensity): void {
  const pines: TreeSite[] = [];
  const broadleaf: TreeSite[] = [];
  for (let i = 0; i < density.forestAttempts; i += 1) {
    const x = -69 + hash(i, 17) * 134;
    const z = -83 + hash(i, 32) * 112;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d < 16 || (Math.abs(x) < 13 && z > 4) || riverDistance(x, z) < 7.7) continue;
    if (x > 8 && z > 3) continue; // preserve the foreground approach and menu rail
    if (x > 15 && z > -24 && hash(i, 77) > 0.16) continue;
    const y = terrainHeight(x, z);
    if (y > 17 || y < -0.2) continue;
    const chance = z < -24 ? 0.38 : x < -13 ? 0.36 : 0.17;
    if (hash(i, 48) > chance) continue;
    const scale = (0.75 + hash(i, 55) * 1.35) * (z < -44 ? 0.87 : z > 0 ? 0.78 : 1);
    const color = new THREE.Color().setHSL(0.27 + hash(i, 64) * 0.06, 0.28 + hash(i, 76) * 0.14, 0.26 + hash(i, 87) * 0.14);
    const site = { x, y, z, scale, color };
    (hash(i, 96) < 0.61 ? pines : broadleaf).push(site);
  }

  const dummy = new THREE.Object3D();
  const pineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x665943, roughness: 1, flatShading: true });
  const pineShape = new THREE.ConeGeometry(1, 2.6, 5, 1);
  const pineTrunkShape = new THREE.CylinderGeometry(0.11, 0.19, 1.35, 5);
  const pineCrown = new THREE.InstancedMesh(pineShape, pineMaterial, pines.length);
  const pineLower = new THREE.InstancedMesh(pineShape, pineMaterial, pines.length);
  const pineTrunk = new THREE.InstancedMesh(pineTrunkShape, trunkMaterial, pines.length);
  for (let i = 0; i < pines.length; i += 1) {
    const site = pines[i];
    const turn = hash(i, 131) * Math.PI * 2;
    dummy.rotation.set(0, turn, 0);
    dummy.position.set(site.x, site.y + site.scale * 1.86, site.z);
    dummy.scale.set(site.scale * 0.82, site.scale * 1.07, site.scale * 0.82);
    dummy.updateMatrix();
    pineCrown.setMatrixAt(i, dummy.matrix);
    pineCrown.setColorAt(i, site.color);
    dummy.position.y = site.y + site.scale * 1.02;
    dummy.scale.set(site.scale, site.scale * 0.9, site.scale);
    dummy.updateMatrix();
    pineLower.setMatrixAt(i, dummy.matrix);
    pineLower.setColorAt(i, site.color.clone().multiplyScalar(0.86));
    dummy.position.y = site.y + site.scale * 0.59;
    dummy.scale.setScalar(site.scale);
    dummy.updateMatrix();
    pineTrunk.setMatrixAt(i, dummy.matrix);
  }
  for (const mesh of [pineCrown, pineLower, pineTrunk]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const crownShape = new THREE.DodecahedronGeometry(1, 0);
  const leafCrown = new THREE.InstancedMesh(crownShape, leafMaterial, broadleaf.length);
  const leafCrownTop = new THREE.InstancedMesh(crownShape, leafMaterial, broadleaf.length);
  const leafTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.25, 1.9, 5), trunkMaterial, broadleaf.length);
  for (let i = 0; i < broadleaf.length; i += 1) {
    const site = broadleaf[i];
    dummy.rotation.set(0, hash(i, 143) * Math.PI * 2, 0);
    dummy.position.set(site.x, site.y + site.scale * 1.65, site.z);
    dummy.scale.set(site.scale * 0.95, site.scale * 0.82, site.scale * 0.9);
    dummy.updateMatrix();
    leafCrown.setMatrixAt(i, dummy.matrix);
    leafCrown.setColorAt(i, site.color.clone().offsetHSL(-0.025, 0.04, 0.035));
    dummy.position.set(site.x + site.scale * 0.2, site.y + site.scale * 2.18, site.z - site.scale * 0.05);
    dummy.scale.set(site.scale * 0.7, site.scale * 0.62, site.scale * 0.7);
    dummy.updateMatrix();
    leafCrownTop.setMatrixAt(i, dummy.matrix);
    leafCrownTop.setColorAt(i, site.color.clone().offsetHSL(0.018, -0.025, 0.08));
    dummy.position.set(site.x, site.y + site.scale * 0.9, site.z);
    dummy.scale.setScalar(site.scale);
    dummy.updateMatrix();
    leafTrunk.setMatrixAt(i, dummy.matrix);
  }
  for (const mesh of [leafCrown, leafCrownTop, leafTrunk]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}

function makeDetails(scene: THREE.Scene, density: LandscapeDensity): void {
  const dummy = new THREE.Object3D();
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    density.rocks,
  );
  for (let i = 0; i < rocks.count; i += 1) {
    const z = -72 + hash(i, 211) * 102;
    const riverside = i < 55;
    const x = riverside
      ? riverX(z) + (hash(i, 222) < 0.5 ? -1 : 1) * (5.1 + hash(i, 233) * 4.6)
      : -52 + hash(i, 244) * 105;
    const size = 0.34 + hash(i, 255) * (riverside ? 1.05 : 1.6);
    dummy.position.set(x, terrainHeight(x, z) + size * 0.18, z);
    dummy.rotation.set(0, hash(i, 266) * Math.PI * 2, 0);
    dummy.scale.set(size * 1.4, size * 0.4, size);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, new THREE.Color().setHSL(0.13 + hash(i, 277) * 0.1, 0.08, 0.43 + hash(i, 288) * 0.15));
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.frustumCulled = false;
  scene.add(rocks);

  const path = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    density.pathRows * 6,
  );
  for (let row = 0; row < density.pathRows; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const i = row * 6 + col;
      const z = 10.7 + row * 1.22;
      const x = (col - 2.5) * 1.15 + (row % 2) * 0.46 + Math.sin(z * 0.18) * 0.17;
      dummy.position.set(x, terrainHeight(x, z) + 0.038, z);
      dummy.rotation.set(0, (hash(i, 300) - 0.5) * 0.13, 0);
      dummy.scale.set(0.98 + hash(i, 311) * 0.14, 0.085, 0.87 + hash(i, 322) * 0.12);
      dummy.updateMatrix();
      path.setMatrixAt(i, dummy.matrix);
      path.setColorAt(i, new THREE.Color().setHSL(0.1, 0.1, 0.57 + hash(i, 333) * 0.16));
    }
  }
  path.instanceMatrix.needsUpdate = true;
  path.receiveShadow = true;
  scene.add(path);

  // Low wildflowers bring colour close to the castle without hiding the emblem or menu copy.
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x241323, emissiveIntensity: 0.09, flatShading: true }),
    density.flowers,
  );
  for (let i = 0; i < flowers.count; i += 1) {
    const bank = i < 130;
    const z = bank ? -24 + hash(i, 366) * 46 : 10 + hash(i, 377) * 22;
    const x = bank
      ? riverX(z) + (hash(i, 388) < 0.5 ? -1 : 1) * (6.5 + hash(i, 399) * 10)
      : (hash(i, 400) < 0.5 ? -1 : 1) * (5 + hash(i, 411) * 12);
    dummy.position.set(x, terrainHeight(x, z) + 0.15, z);
    dummy.rotation.set(0, hash(i, 422) * Math.PI * 2, 0);
    dummy.scale.setScalar(0.72 + hash(i, 433) * 1.6);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(i % 5 < 2 ? 0xdec587 : i % 5 < 4 ? 0xbda8d3 : 0xe3dddd));
  }
  flowers.instanceMatrix.needsUpdate = true;
  flowers.frustumCulled = false;
  scene.add(flowers);
}

/** Builds faceted mountains, a winding animated river, riverbanks, woodland and a stone approach. */
export function createMenuLandscape3D(scene: THREE.Scene, quality: GraphicsQualityTier = 'balanced'): MenuLandscape3D {
  const density = LANDSCAPE_DENSITY[quality];
  makeSky(scene);
  makeGround(scene, density);
  const river = makeRiver(scene, density);
  makeForests(scene, density);
  makeDetails(scene, density);
  return river;
}
