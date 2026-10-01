import * as THREE from 'three';
import { clamp01, keep04Fbm, smoothstep } from './keep04Random';
import type { Quality04 } from './keep04VisualProfile';

// The Verdant Vale: a decorative valley around the raised citadel plinth.
// Everything here is presentation. It never participates in placement,
// picking or gameplay authority, and it is generated from fixed authored
// paths so every visit (and every quality tier) shows the same place.

export type Point2 = readonly [number, number];

/** Raised plinth (deck, voxel terraces and forest bank) the valley must leave free. */
export const KEEP04_PLINTH = Object.freeze({ minX: -58, maxX: 58, minZ: -62, maxZ: 46 });
export const KEEP04_VALLEY_FLOOR_Y = -5.2;
export const KEEP04_RIVER_SURFACE_Y = -5.85;
export const KEEP04_TERRAIN_EXTENT = 265;

function catmullRom(points: readonly Point2[], samplesPerSegment: number): Point2[] {
  const result: Point2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]; const p1 = points[i]; const p2 = points[i + 1]; const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment; const t2 = t * t; const t3 = t2 * t;
      const coordinate = (a: number, b: number, c: number, d: number) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push([coordinate(p0[0], p1[0], p2[0], p3[0]), coordinate(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// Authored geography. The upper part of the keep view looks toward -x/-z,
// so the river and the valley's character are placed where both the desktop
// diagonal and the façade-biased phone camera actually see them.
export const KEEP04_RIVER: readonly Point2[] = Object.freeze(catmullRom([
  [-275, -55], [-205, -80], [-150, -96], [-95, -116], [-40, -122], [15, -128], [70, -112], [118, -78], [158, -30], [205, 18], [275, 52],
], 6));
export const KEEP04_RIVER_HALF_WIDTH = 5.5;

export const KEEP04_ROADS: readonly (readonly Point2[])[] = Object.freeze([
  // Main approach: causeway foot → down-valley toward the front.
  catmullRom([[0, 56], [-4, 84], [-22, 118], [-52, 156], [-80, 205], [-96, 275]], 6),
  // Eastern lane: around the plinth to the river bridge and the far bank.
  catmullRom([[0, 66], [36, 68], [74, 56], [100, 26], [112, -18], [117, -58], [118, -82], [110, -118], [88, -168], [62, -230], [50, -275]], 6),
  // Western lane: past the fields and windmill knoll toward the watermill.
  catmullRom([[-6, 72], [-48, 66], [-86, 44], [-112, 8], [-128, -36], [-146, -78], [-170, -118], [-215, -160], [-275, -190]], 6),
].map(points => Object.freeze(points)));
export const KEEP04_ROAD_HALF_WIDTH = 2.2;

export type Keep04Field = Readonly<{ x: number; z: number; w: number; d: number; yaw: number; crop: 'wheat' | 'sprout' | 'soil' | 'lavender' }>;
export const KEEP04_FIELDS: readonly Keep04Field[] = Object.freeze([
  { x: -96, z: 66, w: 30, d: 20, yaw: .32, crop: 'wheat' },
  { x: -126, z: 30, w: 26, d: 24, yaw: .5, crop: 'lavender' },
  { x: -88, z: -32, w: 28, d: 20, yaw: .62, crop: 'sprout' },
  { x: -62, z: 96, w: 22, d: 18, yaw: .1, crop: 'soil' },
  { x: -170, z: 0, w: 30, d: 22, yaw: .7, crop: 'wheat' },
  { x: 150, z: 40, w: 32, d: 22, yaw: -.4, crop: 'wheat' },
  { x: 140, z: 84, w: 24, d: 20, yaw: -.2, crop: 'sprout' },
  { x: 168, z: -6, w: 22, d: 18, yaw: -.6, crop: 'lavender' },
  { x: -60, z: -170, w: 34, d: 22, yaw: .15, crop: 'wheat' },
  { x: -10, z: -176, w: 26, d: 20, yaw: -.05, crop: 'soil' },
].map(field => Object.freeze(field as Keep04Field)));

export type Keep04Lot = Readonly<{ x: number; z: number; yaw: number; kind: 'cottage' | 'barn' | 'windmill' | 'watermill' | 'pasture' | 'pond' | 'grove' }>;
export const KEEP04_LOTS: readonly Keep04Lot[] = Object.freeze([
  // Gate hamlet along the approach.
  { x: -18, z: 82, yaw: 1.4, kind: 'cottage' }, { x: 14, z: 86, yaw: -1.6, kind: 'cottage' }, { x: -30, z: 102, yaw: 1.1, kind: 'cottage' },
  { x: 2, z: 108, yaw: -1.9, kind: 'cottage' }, { x: -44, z: 128, yaw: 1, kind: 'cottage' }, { x: -16, z: 136, yaw: -2.2, kind: 'cottage' },
  { x: 26, z: 82, yaw: 3.1, kind: 'cottage' }, { x: -36, z: 80, yaw: .2, kind: 'cottage' },
  // Eastern farmstead and lane cottages.
  { x: 92, z: 66, yaw: -.6, kind: 'barn' }, { x: 108, z: 50, yaw: -1.2, kind: 'cottage' }, { x: 124, z: 18, yaw: -1.4, kind: 'cottage' },
  { x: 96, z: 2, yaw: 1.7, kind: 'cottage' }, { x: 130, z: -24, yaw: -1.5, kind: 'cottage' }, { x: 64, z: 92, yaw: 0, kind: 'pasture' },
  { x: 62, z: 116, yaw: 0, kind: 'pond' },
  // Western knoll and fields.
  { x: -110, z: -2, yaw: .6, kind: 'windmill' }, { x: -102, z: 34, yaw: .9, kind: 'cottage' }, { x: -134, z: -50, yaw: 1.9, kind: 'cottage' },
  { x: -82, z: 92, yaw: 0, kind: 'pasture' }, { x: -118, z: 74, yaw: .4, kind: 'barn' },
  // River mills and the far bank village.
  { x: -146, z: -79, yaw: .35, kind: 'watermill' }, { x: 96, z: -136, yaw: .4, kind: 'cottage' }, { x: 128, z: -116, yaw: -.8, kind: 'cottage' },
  { x: 76, z: -152, yaw: .9, kind: 'cottage' }, { x: 112, z: -160, yaw: -.3, kind: 'cottage' }, { x: 150, z: -150, yaw: 0, kind: 'windmill' },
  { x: -22, z: -150, yaw: .1, kind: 'cottage' }, { x: -96, z: -140, yaw: .5, kind: 'cottage' },
].map(lot => Object.freeze(lot as Keep04Lot)));

export function distanceToPolyline(x: number, z: number, points: readonly Point2[]) {
  let best = Infinity; let along = 0; let total = 0; let bestAlong = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]; const [bx, bz] = points[i + 1];
    const dx = bx - ax; const dz = bz - az; const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : clamp01(((x - ax) * dx + (z - az) * dz) / lengthSquared);
    const px = ax + dx * t; const pz = az + dz * t; const distance = Math.hypot(x - px, z - pz);
    const length = Math.sqrt(lengthSquared);
    if (distance < best) { best = distance; bestAlong = along + length * t; }
    along += length; total = along;
  }
  return { distance: best, along: bestAlong, total };
}

export function polylineLength(points: readonly Point2[]) {
  let length = 0; for (let i = 0; i < points.length - 1; i++) length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  return length;
}

/** Position and heading at a distance along a polyline. */
export function samplePolyline(points: readonly Point2[], distance: number): Readonly<{ x: number; z: number; yaw: number }> {
  let remaining = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]; const [bx, bz] = points[i + 1]; const length = Math.hypot(bx - ax, bz - az);
    if (remaining <= length || i === points.length - 2) {
      const t = length === 0 ? 0 : clamp01(remaining / length);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) };
    }
    remaining -= length;
  }
  const [x, z] = points[points.length - 1];
  return { x, z, yaw: 0 };
}

export function distanceToPlinth(x: number, z: number) {
  const dx = Math.max(KEEP04_PLINTH.minX - x, 0, x - KEEP04_PLINTH.maxX);
  const dz = Math.max(KEEP04_PLINTH.minZ - z, 0, z - KEEP04_PLINTH.maxZ);
  return Math.hypot(dx, dz);
}

function fieldLocal(field: Keep04Field, x: number, z: number) {
  const cos = Math.cos(field.yaw); const sin = Math.sin(field.yaw); const dx = x - field.x; const dz = z - field.z;
  return [dx * cos - dz * sin, dx * sin + dz * cos] as const;
}

export function insideField(x: number, z: number, margin = 0) {
  return KEEP04_FIELDS.find(field => {
    const [u, v] = fieldLocal(field, x, z);
    return Math.abs(u) <= field.w / 2 + margin && Math.abs(v) <= field.d / 2 + margin;
  }) ?? null;
}

function lotRadius(kind: Keep04Lot['kind']) {
  return { cottage: 6, barn: 8, windmill: 7, watermill: 8, pasture: 14, pond: 11, grove: 6 }[kind];
}

export function nearLot(x: number, z: number, margin = 0) {
  return KEEP04_LOTS.some(lot => Math.hypot(x - lot.x, z - lot.z) < lotRadius(lot.kind) + margin);
}

/** Every place a road crosses the river; each receives a stone bridge. */
export const KEEP04_BRIDGES: readonly Readonly<{ x: number; z: number; yaw: number }>[] = Object.freeze(KEEP04_ROADS.flatMap(road => {
  let best = { index: -1, distance: Infinity };
  road.forEach(([x, z], index) => { const distance = distanceToPolyline(x, z, KEEP04_RIVER).distance; if (distance < best.distance) best = { index, distance }; });
  if (best.index < 0 || best.distance > KEEP04_RIVER_HALF_WIDTH + 3) return [];
  const [x, z] = road[best.index]; const [nx, nz] = road[Math.min(road.length - 1, best.index + 1)]; const [px, pz] = road[Math.max(0, best.index - 1)];
  return [Object.freeze({ x, z, yaw: Math.atan2(nx - px, nz - pz) })];
}));
export const KEEP04_BRIDGE_DECK_Y = KEEP04_RIVER_SURFACE_Y + 1.3;

const riverDistance = (x: number, z: number) => distanceToPolyline(x, z, KEEP04_RIVER).distance;
const roadDistance = (x: number, z: number) => Math.min(...KEEP04_ROADS.map(road => distanceToPolyline(x, z, road).distance));

/** Natural height of the vale before roads and river shape it. */
function naturalHeight(x: number, z: number) {
  const d = distanceToPlinth(x, z);
  const rolling = (keep04Fbm(x / 55, z / 55, 3, 17) - .5) * 3.2 * smoothstep(6, 40, d);
  const rise = smoothstep(55, 190, d) * (5 + 20 * keep04Fbm(x / 80 + 3.1, z / 80 - 7.4, 4, 29));
  // A higher wooded ridge behind the far bank gives the top of the view a backdrop.
  const ridge = smoothstep(-135, -205, z) * 9 * keep04Fbm(x / 45, z / 45, 3, 41);
  const knoll = 6 * Math.exp(-((x + 110) ** 2 + (z + 2) ** 2) / 900) + 5 * Math.exp(-((x - 150) ** 2 + (z + 150) ** 2) / 700);
  return KEEP04_VALLEY_FLOOR_Y + rolling + rise + ridge + knoll;
}

export function keep04TerrainHeight(x: number, z: number) {
  let height = naturalHeight(x, z);
  // Fields and building lots sit on gently levelled ground.
  const field = insideField(x, z, 4);
  if (field) height = height * .35 + naturalHeight(field.x, field.z) * .65;
  const river = riverDistance(x, z);
  if (river < KEEP04_RIVER_HALF_WIDTH + 9) {
    const bed = KEEP04_RIVER_SURFACE_Y - 1.4;
    height = bed + (height - bed) * smoothstep(KEEP04_RIVER_HALF_WIDTH - 1.5, KEEP04_RIVER_HALF_WIDTH + 9, river);
  }
  const pond = Math.hypot(x - 62, z - 116);
  if (pond < 14) height = Math.min(height, KEEP04_RIVER_SURFACE_Y - 1.2 + smoothstep(6, 14, pond) * 1.7);
  // The plinth skirt stays at the valley floor so terraces meet the vale cleanly.
  const skirt = smoothstep(2, 10, distanceToPlinth(x, z));
  return KEEP04_VALLEY_FLOOR_Y + (height - KEEP04_VALLEY_FLOOR_Y) * skirt;
}

/** Road surface height: follows the vale, rising onto bridge decks over water. */
export function keep04RoadHeight(x: number, z: number) {
  const terrain = keep04TerrainHeight(x, z);
  const bridge = KEEP04_BRIDGES.find(entry => Math.hypot(x - entry.x, z - entry.z) < KEEP04_RIVER_HALF_WIDTH + 11);
  if (!bridge) return terrain;
  const distance = Math.hypot(x - bridge.x, z - bridge.z);
  const deck = KEEP04_BRIDGE_DECK_Y - .05;
  return Math.max(terrain, terrain + (deck - terrain) * (1 - smoothstep(KEEP04_RIVER_HALF_WIDTH + 4.5, KEEP04_RIVER_HALF_WIDTH + 11, distance)));
}

/** Forest likelihood: wooded hills, clear of fields, lots, roads and water. */
export function keep04ForestDensity(x: number, z: number) {
  const d = distanceToPlinth(x, z);
  if (d < 14 || insideField(x, z, 3) || nearLot(x, z, 4)) return 0;
  if (riverDistance(x, z) < KEEP04_RIVER_HALF_WIDTH + 4 || roadDistance(x, z) < KEEP04_ROAD_HALF_WIDTH + 3) return 0;
  const clusters = smoothstep(.42, .64, keep04Fbm(x / 62 + 9, z / 62 - 3, 3, 53));
  const hills = smoothstep(70, 170, d);
  return clamp01(clusters * .85 + hills * .55 - (1 - smoothstep(14, 40, d)) * .5);
}

const color = (hex: string) => new THREE.Color(hex);
const MEADOW_LIGHT = color('#93ad5f'); const MEADOW_DARK = color('#6f8b4a'); const MEADOW_GOLD = color('#b4b16a');
const FOREST_FLOOR = color('#4f6a3d'); const BANK = color('#a89d78'); const RIVER_BED = color('#4b6f68');
const ROCK = color('#8b897c'); const HIGH_MEADOW = color('#7e9a5c'); const SOIL = color('#7a6447');

export function keep04TerrainColor(x: number, z: number, height: number, slope: number, target: THREE.Color) {
  const variation = keep04Fbm(x / 26, z / 26, 3, 61);
  target.copy(MEADOW_DARK).lerp(MEADOW_LIGHT, variation);
  target.lerp(MEADOW_GOLD, smoothstep(.55, .8, keep04Fbm(x / 70 - 4, z / 70 + 8, 2, 67)) * .55);
  target.lerp(HIGH_MEADOW, smoothstep(2, 16, height) * .5);
  target.lerp(FOREST_FLOOR, smoothstep(.25, .7, keep04ForestDensity(x, z)) * .75);
  target.lerp(ROCK, smoothstep(.55, .9, slope));
  if (insideField(x, z, .5)) target.lerp(SOIL, .8);
  const river = riverDistance(x, z);
  if (river < KEEP04_RIVER_HALF_WIDTH + 6) target.lerp(height < KEEP04_RIVER_SURFACE_Y ? RIVER_BED : BANK, 1 - smoothstep(KEEP04_RIVER_HALF_WIDTH, KEEP04_RIVER_HALF_WIDTH + 6, river));
  return target;
}

/** Axis samples, dense near the citadel and coarse toward the haze. */
function axisSamples(quality: Quality04) {
  const half = { high: 46, balanced: 34, reduced: 22 }[quality];
  const values: number[] = [];
  for (let i = -half; i <= half; i++) {
    const u = i / half;
    values.push(KEEP04_TERRAIN_EXTENT * Math.sign(u) * (.42 * Math.abs(u) + .58 * Math.abs(u) ** 2.2));
  }
  return values;
}

/** One vertex-coloured valley mesh with the plinth footprint left open. */
export function createKeep04TerrainGeometry(quality: Quality04) {
  const xs = axisSamples(quality); const zs = axisSamples(quality); const columns = xs.length;
  const heights = new Float32Array(xs.length * zs.length);
  for (let row = 0; row < zs.length; row++) for (let column = 0; column < columns; column++) heights[row * columns + column] = keep04TerrainHeight(xs[column], zs[row]);
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const vertexIndex = new Int32Array(xs.length * zs.length).fill(-1); const tint = new THREE.Color();
  const inner = (x: number, z: number) => x > KEEP04_PLINTH.minX + 3 && x < KEEP04_PLINTH.maxX - 3 && z > KEEP04_PLINTH.minZ + 3 && z < KEEP04_PLINTH.maxZ - 3;
  const vertex = (row: number, column: number) => {
    const key = row * columns + column; if (vertexIndex[key] >= 0) return vertexIndex[key];
    const x = xs[column]; const z = zs[row]; const y = heights[key];
    const left = heights[row * columns + Math.max(0, column - 1)]; const right = heights[row * columns + Math.min(columns - 1, column + 1)];
    const down = heights[Math.max(0, row - 1) * columns + column]; const up = heights[Math.min(zs.length - 1, row + 1) * columns + column];
    const spanX = xs[Math.min(columns - 1, column + 1)] - xs[Math.max(0, column - 1)]; const spanZ = zs[Math.min(zs.length - 1, row + 1)] - zs[Math.max(0, row - 1)];
    const slope = clamp01(Math.hypot((right - left) / spanX, (up - down) / spanZ) * 1.6);
    keep04TerrainColor(x, z, y, slope, tint);
    vertexIndex[key] = positions.length / 3; positions.push(x, y, z); colors.push(tint.r, tint.g, tint.b);
    return vertexIndex[key];
  };
  for (let row = 0; row < zs.length - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const x0 = xs[column]; const x1 = xs[column + 1]; const z0 = zs[row]; const z1 = zs[row + 1];
    if (inner(x0, z0) && inner(x1, z0) && inner(x0, z1) && inner(x1, z1)) continue;
    const a = vertex(row, column); const b = vertex(row, column + 1); const c = vertex(row + 1, column); const d = vertex(row + 1, column + 1);
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Thin ribbon draped over the terrain, used for roads and the river surface. */
export function createKeep04RibbonGeometry(points: readonly Point2[], halfWidth: number, options: Readonly<{
  y?: (x: number, z: number) => number; lift?: number; colorAt: (t: number, side: number, target: THREE.Color) => THREE.Color;
}>) {
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const tint = new THREE.Color(); const total = polylineLength(points); let along = 0;
  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)]; const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0]; const dz = next[1] - previous[1]; const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length; const nz = dx / length;
    if (i > 0) along += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    for (const side of [-1, 0, 1]) {
      const x = points[i][0] + nx * halfWidth * side; const z = points[i][1] + nz * halfWidth * side;
      const y = (options.y ? options.y(x, z) : keep04TerrainHeight(x, z)) + (options.lift ?? .08);
      positions.push(x, y, z); options.colorAt(along / Math.max(1, total), side, tint); colors.push(tint.r, tint.g, tint.b);
    }
    if (i > 0) {
      const base = (i - 1) * 3;
      // Counter-clockwise from above so the ribbon faces the sky.
      for (const offset of [0, 1]) { const a = base + offset; const b = a + 1; const c = a + 3; const d = a + 4; indices.push(a, b, c, b, d, c); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
