import * as THREE from 'three';
import { GREATER_REALM_BIOME_TREE_V3 } from './biomeTreeV3Catalog';

/**
 * Local procedural fallback geometry used while a verified v3 tree is loading
 * or when its same-origin asset cannot load. It is not the selected 0.4 art
 * family. Water and unclassified cells deliberately have no tree.
 */
export type BiomeTreeDetail = 'high' | 'balanced' | 'reduced';
type Point = readonly [number, number, number];
type Tint = readonly [number, number, number];
type TreePalette = Readonly<{ bark: string; foliage: string; highlight: string }>;

export const BIOME_TREE_NAMES = Object.freeze({
  1: 'Lowland orchard',
  2: 'Meadow blossom',
  3: 'Broad oak',
  4: 'Old-growth giant',
  5: 'Whorled pine',
  6: 'Snow fir',
  7: 'Tundra krummholz',
  8: 'Heath juniper',
  9: 'Savanna acacia',
  10: 'Scrub olive',
  11: 'Dune date palm',
  12: 'Rocky Joshua tree',
  13: 'Badlands mesquite',
  14: 'Volcanic emberwood',
  15: 'Ashland regrowth',
  16: 'Marsh willow',
  17: 'Salt-marsh mangrove',
  18: 'Delta cypress',
  19: 'Highland stone pine',
  23: 'Coastal wind pine'
} as const);

const PALETTES: Readonly<Record<keyof typeof BIOME_TREE_NAMES, TreePalette>> = Object.freeze({
  1: { bark: '#745943', foliage: '#729b55', highlight: '#a9c977' },
  2: { bark: '#796655', foliage: '#9cb56a', highlight: '#efbdc5' },
  3: { bark: '#624b39', foliage: '#456e43', highlight: '#79a567' },
  4: { bark: '#594a3a', foliage: '#315b45', highlight: '#6e9361' },
  5: { bark: '#645846', foliage: '#2d6657', highlight: '#58927a' },
  6: { bark: '#686e6b', foliage: '#416978', highlight: '#dce7e7' },
  7: { bark: '#77736a', foliage: '#8d9980', highlight: '#c6d1be' },
  8: { bark: '#746b57', foliage: '#627657', highlight: '#a2a573' },
  9: { bark: '#806444', foliage: '#7f9850', highlight: '#b4b465' },
  10: { bark: '#77654b', foliage: '#707b4d', highlight: '#a9ae71' },
  11: { bark: '#956e48', foliage: '#6e9361', highlight: '#bac67e' },
  12: { bark: '#8b7455', foliage: '#748064', highlight: '#b2a97c' },
  13: { bark: '#914f3c', foliage: '#a36e4a', highlight: '#d5a663' },
  14: { bark: '#38383a', foliage: '#534a45', highlight: '#d67c43' },
  15: { bark: '#9b9b91', foliage: '#91a16e', highlight: '#c5cf94' },
  16: { bark: '#6d6751', foliage: '#659169', highlight: '#9dc697' },
  17: { bark: '#675e50', foliage: '#587e65', highlight: '#94a97c' },
  18: { bark: '#696852', foliage: '#537a64', highlight: '#92a788' },
  19: { bark: '#777364', foliage: '#52705c', highlight: '#869d78' },
  23: { bark: '#817567', foliage: '#467978', highlight: '#87aaa0' }
});

const TREE_BIOMES = Object.freeze(Object.keys(BIOME_TREE_NAMES).map(Number));

export function isTreeBiome(biomeClass: number): boolean {
  return Number.isInteger(biomeClass) && TREE_BIOMES.includes(biomeClass);
}

function color(hex: string): Tint {
  const value = new THREE.Color(hex);
  return [value.r, value.g, value.b];
}

function tinted(tint: Tint, factor: number): Tint {
  return [
    Math.min(1, tint[0] * factor),
    Math.min(1, tint[1] * factor),
    Math.min(1, tint[2] * factor)
  ];
}

function add(a: Point, b: Point): Point { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: Point, b: Point): Point { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul(a: Point, n: number): Point { return [a[0] * n, a[1] * n, a[2] * n]; }
function cross(a: Point, b: Point): Point {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(a: Point): Point {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

class TreeMesh {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  triangle(a: Point, b: Point, c: Point, tint: Tint, shade = 1): void {
    this.positions.push(...a, ...b, ...c);
    const face = tinted(tint, shade);
    this.colors.push(...face, ...face, ...face);
  }

  quad(a: Point, b: Point, c: Point, d: Point, tint: Tint, shade = 1): void {
    this.triangle(a, b, c, tint, shade);
    this.triangle(a, c, d, tint, shade);
  }

  /** Four-sided tapered wood, with a real forkable axis rather than a flat sprite. */
  limb(from: Point, to: Point, base: number, tip: number, tint: Tint, sides = 4): void {
    const axis = unit(sub(to, from));
    const reference: Point = Math.abs(axis[1]) > 0.86 ? [1, 0, 0] : [0, 1, 0];
    const u = unit(cross(axis, reference));
    const v = unit(cross(axis, u));
    const ring = (center: Point, radius: number, index: number): Point => {
      const angle = index * 2 * Math.PI / sides + Math.PI / 4;
      const point = add(center, add(mul(u, Math.cos(angle) * radius), mul(v, Math.sin(angle) * radius)));
      return [point[0], Math.max(0, point[1]), point[2]];
    };
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      this.quad(ring(from, base, side), ring(to, tip, side),
        ring(to, tip, next), ring(from, base, next), tint, side % 2 ? 0.88 : 1.07);
    }
    for (let side = 1; side < sides - 1; side += 1) {
      this.triangle(ring(to, tip, 0), ring(to, tip, side + 1), ring(to, tip, side), tint, 1.1);
    }
  }

  /** Two irregular low-poly rings make a rounded, full crown rather than a flat diamond. */
  crown(center: Point, radii: Point, foliage: Tint, highlight: Tint): void {
    const [x, y, z] = center;
    const [rx, ry, rz] = radii;
    const top: Point = [x, y + ry, z];
    const bottom: Point = [x, y - ry, z];
    const count = 6;
    const upper: Point[] = [];
    const lower: Point[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2 * Math.PI / count;
      const uneven = index % 2 ? 0.91 : 1.05;
      upper.push([x + Math.cos(angle) * rx * uneven,
        y + ry * 0.16 + Math.sin(angle * 2) * ry * 0.08,
        z + Math.sin(angle) * rz * uneven]);
      lower.push([x + Math.cos(angle) * rx * uneven * 0.72,
        y - ry * 0.62,
        z + Math.sin(angle) * rz * uneven * 0.72]);
    }
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      this.triangle(top, upper[next]!, upper[index]!,
        index % 2 ? foliage : highlight, index % 2 ? 0.94 : 1.04);
      this.quad(lower[index]!, upper[index]!, upper[next]!, lower[next]!,
        foliage, index % 2 ? 0.87 : 1.02);
      this.triangle(bottom, lower[index]!, lower[next]!, foliage, 0.73);
    }
  }

  /** A broad, shallow crown, used only where the ecology calls for an umbrella. */
  umbrella(center: Point, radiusX: number, radiusZ: number, foliage: Tint, highlight: Tint): void {
    const count = 7;
    const top: Point = [center[0], center[1] + 0.025, center[2]];
    const underside: Point = [center[0], center[1] - 0.028, center[2]];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2 * Math.PI / count;
      const nextAngle = (index + 1) * 2 * Math.PI / count;
      const rim: Point = [center[0] + Math.cos(angle) * radiusX,
        center[1] + Math.sin(angle * 3) * 0.007, center[2] + Math.sin(angle) * radiusZ];
      const next: Point = [center[0] + Math.cos(nextAngle) * radiusX,
        center[1] + Math.sin(nextAngle * 3) * 0.007, center[2] + Math.sin(nextAngle) * radiusZ];
      this.triangle(top, next, rim, index % 2 ? foliage : highlight);
      this.triangle(underside, rim, next, foliage, 0.79);
    }
  }

  /** Faceted whorl, with an irregular edge so stacked conifers do not read as cones. */
  whorl(centerY: number, baseRadius: number, height: number, lean: number,
    foliage: Tint, highlight: Tint, snow = false): void {
    const count = 6;
    const tip: Point = [lean * 0.6, centerY + height, 0];
    const baseCenter: Point = [lean, centerY, 0];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2 * Math.PI / count;
      const nextAngle = (index + 1) * 2 * Math.PI / count;
      const radius = baseRadius * (index % 2 ? 0.94 : 1.08);
      const nextRadius = baseRadius * ((index + 1) % 2 ? 0.94 : 1.08);
      const a: Point = [lean + Math.cos(angle) * radius, centerY, Math.sin(angle) * radius];
      const b: Point = [lean + Math.cos(nextAngle) * nextRadius, centerY, Math.sin(nextAngle) * nextRadius];
      this.triangle(tip, b, a, snow && index % 2 === 0 ? highlight : foliage,
        index % 2 ? 0.8 : 1.04);
      this.triangle(baseCenter, a, b, foliage, 0.72);
    }
  }

  /** Swept tapering strap, double-sided by material rather than duplicate faces. */
  frond(from: Point, middle: Point, tip: Point, width: number,
    foliage: Tint, highlight: Tint): void {
    const side = unit(cross(unit(sub(tip, from)), [0, 1, 0]));
    const left = add(middle, mul(side, width));
    const right = add(middle, mul(side, -width));
    this.triangle(from, left, middle, highlight);
    this.triangle(from, middle, right, foliage, 0.85);
    this.triangle(left, tip, middle, highlight, 0.93);
    this.triangle(middle, tip, right, foliage);
  }

  finish(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function sculptTree(biomeClass: keyof typeof BIOME_TREE_NAMES, detail: BiomeTreeDetail): THREE.BufferGeometry {
  const mesh = new TreeMesh();
  const palette = PALETTES[biomeClass];
  const bark = color(palette.bark);
  const leaf = color(palette.foliage);
  const light = color(palette.highlight);
  const full = detail === 'high';
  const medium = detail !== 'reduced';
  const wood = (a: Point, b: Point, r: number, end = r * 0.56) => mesh.limb(a, b, r, end, bark);
  const crown = (at: Point, size: Point) => mesh.crown(at, size, leaf, light);
  const root: Point = [0, 0, 0];

  switch (biomeClass) {
    case 1: { // Orchard: forked trunk, compact independent round lobes.
      const fork: Point = [0, 0.25, 0];
      wood(root, fork, 0.028, 0.018);
      const limbs: Point[] = [[-0.085, 0.35, 0.01], [0.09, 0.36, -0.005], [0.005, 0.40, 0.04]];
      limbs.slice(0, medium ? 3 : 2).forEach((end, index) => {
        wood(fork, end, 0.012, 0.007);
        crown(end, index === 2 ? [0.072, 0.066, 0.069] : [0.078, 0.07, 0.071]);
      });
      break;
    }
    case 2: { // Light meadow blossom, high-pitched spray.
      wood(root, [0.005, 0.34, 0], 0.017, 0.008);
      const tips: Point[] = [[-0.08, 0.37, 0], [0.08, 0.39, 0.015], [0, 0.46, 0],
        [-0.035, 0.41, -0.065], [0.04, 0.42, 0.055]];
      tips.slice(0, full ? 5 : medium ? 4 : 3).forEach((tip, index) => {
        wood([0, 0.25 + index * 0.01, 0], tip, 0.008, 0.003);
        mesh.crown(tip, [0.033, 0.035, 0.032], index % 2 ? leaf : light, light);
      });
      break;
    }
    case 3: { // Heavy oak with visible laterals and asymmetrical crown masses.
      wood(root, [0, 0.29, 0], 0.044, 0.026);
      const tips: Point[] = [[-0.115, 0.37, 0.015], [0.11, 0.37, -0.015],
        [-0.035, 0.46, -0.055], [0.055, 0.46, 0.05]];
      tips.slice(0, full ? 4 : medium ? 3 : 2).forEach((tip, index) => {
        wood([0, 0.25, 0], tip, 0.018, 0.009);
        crown(tip, index < 2 ? [0.113, 0.082, 0.089] : [0.097, 0.076, 0.085]);
      });
      break;
    }
    case 4: { // Old growth, buttress flares and two rising leaders.
      wood(root, [0.005, 0.35, 0], 0.059, 0.025);
      const roots: Point[] = [[-0.095, 0.005, 0], [0.08, 0.004, -0.055], [0.01, 0.005, 0.09]];
      roots.slice(0, full ? 3 : 2).forEach((at) => wood([0, 0.13, 0], at, 0.021, 0.009));
      const tips: Point[] = [[-0.1, 0.43, 0], [0.12, 0.44, 0.015],
        [-0.055, 0.51, -0.04], [0.055, 0.52, -0.025], [0, 0.48, 0.085]];
      tips.slice(0, full ? 5 : medium ? 4 : 3).forEach((tip, index) => {
        wood([0, 0.32, 0], tip, 0.019, 0.008);
        crown(tip, index < 2 ? [0.095, 0.077, 0.088] : [0.086, 0.073, 0.081]);
      });
      break;
    }
    case 5: { // Whorled pine: stacked wide-to-narrow, separated foliage shelves.
      wood(root, [0, 0.47, 0], 0.029, 0.004);
      const tiers = full ? 4 : medium ? 3 : 2;
      for (let i = 0; i < tiers; i += 1) {
        mesh.whorl(0.12 + i * 0.09, 0.115 - i * 0.021, 0.14, 0, leaf, light);
      }
      break;
    }
    case 6: { // Alpine fir has a narrow blue body and bright snowward facets.
      wood(root, [0, 0.49, 0], 0.024, 0.003);
      const tiers = full ? 5 : medium ? 4 : 3;
      for (let i = 0; i < tiers; i += 1) {
        mesh.whorl(0.075 + i * 0.087, 0.085 - i * 0.011, 0.115, 0, leaf, light, true);
      }
      break;
    }
    case 7: { // Stunted tundra tree forced leeward by persistent cold wind.
      wood(root, [0.025, 0.12, 0], 0.024, 0.018);
      wood([0.025, 0.12, 0], [0.10, 0.20, 0], 0.017, 0.011);
      wood([0.10, 0.20, 0], [0.17, 0.25, 0.01], 0.011, 0.005);
      crown([0.115, 0.25, 0], [0.095, 0.045, 0.075]);
      if (medium) crown([0.055, 0.20, -0.035], [0.06, 0.04, 0.048]);
      break;
    }
    case 8: { // Juniper grows as a low, many-stemmed heath dome.
      const tips: Point[] = [[-0.09, 0.19, 0], [0.09, 0.2, 0.02], [0, 0.25, -0.07],
        [-0.035, 0.22, 0.075], [0.07, 0.18, -0.065]];
      tips.slice(0, full ? 5 : medium ? 4 : 3).forEach((tip, index) => {
        wood(root, tip, 0.015, 0.006);
        crown(tip, [0.054 + (index % 2) * 0.009, 0.053, 0.05]);
      });
      break;
    }
    case 9: { // Tall acacia with a genuinely flat, broad umbrella silhouette.
      wood(root, [0.006, 0.34, 0], 0.025, 0.012);
      wood([0.006, 0.32, 0], [-0.09, 0.39, 0], 0.011, 0.005);
      wood([0.006, 0.32, 0], [0.10, 0.39, 0], 0.011, 0.005);
      mesh.umbrella([0, 0.405, 0], 0.185, 0.14, leaf, light);
      if (full) mesh.umbrella([0.045, 0.39, 0.035], 0.1, 0.08, leaf, light);
      break;
    }
    case 10: { // Knotty olive; dense small ovals on a twisted, offset fork.
      wood(root, [0.02, 0.2, 0], 0.03, 0.02);
      wood([0.02, 0.2, 0], [-0.035, 0.31, 0.015], 0.017, 0.008);
      wood([0.02, 0.2, 0], [0.095, 0.28, -0.02], 0.017, 0.008);
      crown([-0.045, 0.33, 0], [0.07, 0.055, 0.06]);
      crown([0.1, 0.3, -0.025], [0.07, 0.052, 0.054]);
      if (medium) crown([0, 0.38, 0.02], [0.055, 0.05, 0.055]);
      break;
    }
    case 11: { // Date palm; bare bent shaft and radial sword-like fronds.
      wood(root, [0.026, 0.18, 0], 0.027, 0.017);
      wood([0.026, 0.18, 0], [0.035, 0.43, 0], 0.017, 0.008);
      const count = full ? 8 : medium ? 6 : 4;
      for (let i = 0; i < count; i += 1) {
        const angle = i * 2 * Math.PI / count;
        const sx = Math.cos(angle);
        const sz = Math.sin(angle);
        const start: Point = [0.035, 0.43, 0];
        mesh.frond(start, [0.035 + sx * 0.09, 0.46, sz * 0.09],
          [0.035 + sx * 0.165, 0.34, sz * 0.165], 0.028, leaf, light);
      }
      break;
    }
    case 12: { // Joshua: two candelabra arms tipped by stiff, spiky leaf stars.
      wood(root, [0.015, 0.27, 0], 0.033, 0.023);
      const ends: Point[] = [[-0.09, 0.36, 0], [0.105, 0.39, 0.025], [0.015, 0.45, -0.02]];
      ends.slice(0, full ? 3 : 2).forEach((end, index) => {
        const elbow: Point = [end[0] * 0.75, 0.29 + index * 0.01, end[2]];
        wood([0.015, 0.25, 0], elbow, 0.016, 0.012);
        wood(elbow, end, 0.012, 0.006);
        for (let j = 0; j < (medium ? 5 : 3); j += 1) {
          const angle = j * 2 * Math.PI / (medium ? 5 : 3);
          mesh.frond(end,
            [end[0] + Math.cos(angle) * 0.018, end[1] + 0.018, end[2] + Math.sin(angle) * 0.018],
            [end[0] + Math.cos(angle) * 0.045, end[1] + 0.04, end[2] + Math.sin(angle) * 0.045],
            0.011, leaf, light);
        }
      });
      break;
    }
    case 13: { // Red badlands mesquite, mostly exposed zig-zag wood.
      wood(root, [0.025, 0.22, 0], 0.027, 0.018);
      wood([0.025, 0.22, 0], [-0.11, 0.31, 0], 0.015, 0.005);
      wood([0.025, 0.22, 0], [0.12, 0.32, 0.02], 0.015, 0.005);
      wood([-0.11, 0.31, 0], [-0.16, 0.36, 0.025], 0.007, 0.002);
      wood([0.12, 0.32, 0.02], [0.155, 0.39, 0.03], 0.007, 0.002);
      crown([-0.115, 0.33, 0], [0.035, 0.028, 0.032]);
      if (medium) crown([0.125, 0.34, 0.02], [0.036, 0.027, 0.03]);
      break;
    }
    case 14: { // Burnt volcanic fork, sparse ember-tipped shoots.
      wood(root, [0.014, 0.3, 0], 0.031, 0.019);
      const spires: Point[] = [[-0.09, 0.45, 0], [0.08, 0.46, -0.01], [0.02, 0.5, 0.035]];
      spires.slice(0, full ? 3 : 2).forEach((end) => {
        wood([0.014, 0.28, 0], end, 0.012, 0.002);
        mesh.crown(end, [0.016, 0.022, 0.016], light, light);
      });
      if (medium) mesh.crown([-0.04, 0.33, 0.025], [0.032, 0.025, 0.03], leaf, light);
      break;
    }
    case 15: { // Pale, slim pioneer tree after ash fall.
      wood(root, [0.005, 0.43, 0], 0.018, 0.004);
      const tips: Point[] = [[-0.07, 0.37, 0], [0.075, 0.4, 0],
        [-0.035, 0.46, 0.05], [0.03, 0.48, -0.035]];
      tips.slice(0, full ? 4 : medium ? 3 : 2).forEach((tip) => {
        wood([0, 0.25, 0], tip, 0.006, 0.002);
        crown(tip, [0.04, 0.044, 0.037]);
      });
      break;
    }
    case 16: { // Wetland willow: high cap with pendant leafy strands.
      wood(root, [0, 0.37, 0], 0.03, 0.012);
      mesh.umbrella([0, 0.4, 0], 0.15, 0.13, leaf, light);
      const count = full ? 9 : medium ? 6 : 4;
      for (let index = 0; index < count; index += 1) {
        const a = index * 2 * Math.PI / count;
        const x = Math.cos(a) * 0.13;
        const z = Math.sin(a) * 0.11;
        const tip: Point = [x * 1.06, 0.17 + (index % 3) * 0.02, z * 1.06];
        mesh.frond([x * 0.75, 0.4, z * 0.75], [x, 0.29, z], tip,
          0.013, leaf, light);
        if (index % 2 === 0 || full) {
          crown(add(tip, [0, 0.035, 0]), [0.023, 0.045, 0.023]);
        }
      }
      break;
    }
    case 17: { // Stilt-root mangrove with an elevated compact crown.
      const knee: Point = [0, 0.2, 0];
      wood(knee, [0, 0.38, 0], 0.03, 0.013);
      const count = full ? 5 : medium ? 4 : 3;
      for (let index = 0; index < count; index += 1) {
        const a = index * 2 * Math.PI / count;
        wood(knee, [Math.cos(a) * 0.105, 0, Math.sin(a) * 0.105], 0.015, 0.007);
      }
      crown([0, 0.415, 0], [0.11, 0.074, 0.105]);
      if (medium) crown([0.07, 0.38, 0.04], [0.055, 0.049, 0.052]);
      break;
    }
    case 18: { // River delta cypress: flared knees and long narrow taper.
      wood(root, [0, 0.5, 0], 0.043, 0.004);
      const knees: Point[] = [[-0.07, 0, 0], [0.06, 0, 0.05], [0.03, 0, -0.065]];
      knees.slice(0, full ? 3 : 2).forEach((at) => wood([0, 0.12, 0], at, 0.02, 0.006));
      const tiers = full ? 4 : medium ? 3 : 2;
      for (let i = 0; i < tiers; i += 1) {
        mesh.whorl(0.14 + i * 0.09, 0.083 - i * 0.013, 0.13, 0, leaf, light);
      }
      break;
    }
    case 19: { // Cliff pine: exposed roots, windswept trunk, offset foliage pads.
      wood(root, [-0.025, 0.17, 0], 0.025, 0.017);
      wood([-0.025, 0.17, 0], [0.04, 0.36, 0], 0.017, 0.008);
      wood([0, 0.08, 0], [-0.075, 0, 0.01], 0.011, 0.004);
      mesh.whorl(0.3, 0.108, 0.13, 0.055, leaf, light);
      if (medium) mesh.whorl(0.38, 0.085, 0.11, 0.09, leaf, light);
      if (full) mesh.whorl(0.22, 0.084, 0.12, 0.015, leaf, light);
      break;
    }
    case 23: { // Salt-wind pine, one-sided canopy facing inland.
      wood(root, [0.025, 0.19, 0], 0.028, 0.018);
      wood([0.025, 0.19, 0], [0.105, 0.34, 0], 0.018, 0.008);
      wood([0.02, 0.12, 0], [-0.055, 0.005, -0.02], 0.01, 0.004);
      const tips: Point[] = [[0.14, 0.36, -0.04], [0.2, 0.42, 0.03], [0.13, 0.46, 0.06]];
      tips.slice(0, full ? 3 : medium ? 2 : 1).forEach((tip) => {
        wood([0.095, 0.33, 0], tip, 0.009, 0.004);
        crown(tip, [0.07, 0.038, 0.055]);
      });
      break;
    }
  }
  return mesh.finish();
}

/** Temporary same-size local geometry used only while the v3 GLB is loading. */
export function createBiomeTreeGeometry(biomeClass: number, detail: BiomeTreeDetail): THREE.BufferGeometry {
  if (!isTreeBiome(biomeClass)) {
    throw new Error(`No tree is defined for biome ${biomeClass}`);
  }
  return sculptTree(biomeClass as keyof typeof BIOME_TREE_NAMES, detail);
}

function runtimeModel(biomeClass: number, detail: BiomeTreeDetail) {
  const biome = GREATER_REALM_BIOME_TREE_V3[
    biomeClass as keyof typeof GREATER_REALM_BIOME_TREE_V3
  ];
  if (!biome) throw new Error(`No tree is defined for biome ${biomeClass}`);
  return detail === 'high' ? biome.high : biome.mobile;
}

export function biomeTreeTriangleCount(biomeClass: number, detail: BiomeTreeDetail): number {
  return runtimeModel(biomeClass, detail).triangles;
}

export function biomeTreeGeometryBytes(biomeClass: number, detail: BiomeTreeDetail): number {
  return runtimeModel(biomeClass, detail).geometryBytes;
}
