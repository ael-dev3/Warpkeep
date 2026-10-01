import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import { KEEP04_FOOTPRINTS } from './createKeep04Buildings';

// Presentation-only walkways between the civic commons and each settled
// building's front door. They are derived from authoritative placements, never
// stored, never pickable and never consulted by placement legality.

export type Keep04Point = readonly [number, number];
export type Keep04Rect = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
export type Keep04Walkway = Readonly<{ kind: Building04; door: Keep04Point; points: readonly Keep04Point[] }>;

/** Reserved civic spaces from the placement policy (gate spine and commons). */
export const KEEP04_CIVIC_SPINE: Keep04Rect = Object.freeze({ minX: -3, maxX: 3, minZ: -3, maxZ: 32 });
export const KEEP04_CIVIC_COMMONS: Keep04Rect = Object.freeze({ minX: -5, maxX: 5, minZ: -3, maxZ: 7 });
export const KEEP04_DECK: Keep04Rect = Object.freeze({ minX: -44, maxX: 44, minZ: -40, maxZ: 32 });

const micro = (value: bigint) => Number(value) / 1e6;

export function keep04FootprintRect(placement: Placement04, margin = 0): Keep04Rect {
  const [width, depth] = KEEP04_FOOTPRINTS[placement.kind];
  const swap = placement.rotation === 90_000 || placement.rotation === 270_000;
  const halfX = (swap ? depth : width) / 2 + margin; const halfZ = (swap ? width : depth) / 2 + margin;
  const x = micro(placement.x); const z = micro(placement.z);
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

/** Unit vector of the model's front (local +z after the scene's rotation convention). */
export function keep04FrontDirection(rotation: number): Keep04Point {
  const angle = -rotation * Math.PI / 180000;
  return [Math.round(Math.sin(angle) * 1e6) / 1e6, Math.round(Math.cos(angle) * 1e6) / 1e6];
}

export function keep04DoorPoint(placement: Placement04, clearance = 1.2): Keep04Point {
  const [, depth] = KEEP04_FOOTPRINTS[placement.kind]; const [fx, fz] = keep04FrontDirection(placement.rotation);
  return [micro(placement.x) + fx * (depth / 2 + clearance), micro(placement.z) + fz * (depth / 2 + clearance)];
}

function segmentHitsRect(a: Keep04Point, b: Keep04Point, rect: Keep04Rect) {
  // Liang–Barsky clip against an axis-aligned rectangle.
  let t0 = 0; let t1 = 1; const dx = b[0] - a[0]; const dz = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - rect.minX], [dx, rect.maxX - a[0]], [-dz, a[1] - rect.minZ], [dz, rect.maxZ - a[1]]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}

const insideDeck = (point: Keep04Point) => point[0] >= KEEP04_DECK.minX && point[0] <= KEEP04_DECK.maxX && point[1] >= KEEP04_DECK.minZ && point[1] <= KEEP04_DECK.maxZ;

/** Nearest point on the open civic network (spine and commons edges). */
function civicJoin(point: Keep04Point): Keep04Point {
  const candidates: Keep04Point[] = [];
  for (const rect of [KEEP04_CIVIC_SPINE, KEEP04_CIVIC_COMMONS]) {
    candidates.push([Math.max(rect.minX, Math.min(rect.maxX, point[0])), Math.max(rect.minZ, Math.min(rect.maxZ, point[1]))]);
  }
  return candidates.reduce((best, candidate) => Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < Math.hypot(best[0] - point[0], best[1] - point[1]) ? candidate : best);
}

function clear(points: readonly Keep04Point[], obstacles: readonly Keep04Rect[]) {
  for (let i = 0; i < points.length - 1; i++) {
    if (!insideDeck(points[i]) || !insideDeck(points[i + 1])) return false;
    if (obstacles.some(rect => segmentHitsRect(points[i], points[i + 1], rect))) return false;
  }
  return true;
}

/** One walkway per placed building, avoiding every other footprint where possible. */
export function planKeep04Walkways(placements: readonly Placement04[]): readonly Keep04Walkway[] {
  const walkways: Keep04Walkway[] = [];
  for (const placement of placements) {
    const door = keep04DoorPoint(placement); if (!insideDeck(door)) continue;
    const [fx, fz] = keep04FrontDirection(placement.rotation);
    const stoop: Keep04Point = [door[0] + fx * 1.5, door[1] + fz * 1.5];
    const join = civicJoin(stoop);
    // The door sits outside its own footprint, so the walkway may never re-enter it.
    const own = keep04FootprintRect(placement, -.2);
    const others = placements.filter(other => other !== placement).map(other => keep04FootprintRect(other, .6));
    const options: Keep04Point[][] = [
      [door, stoop, [join[0], stoop[1]], join],
      [door, stoop, [stoop[0], join[1]], join],
      [door, stoop, join],
    ];
    const chosen = options.find(option => clear(option, [own, ...others])) ?? options.find(option => clear(option, [own])) ?? null;
    if (!chosen) continue;
    // Drop zero-length legs so ribbons and walkers never meet degenerate segments.
    const points = chosen.filter((point, index) => index === 0 || Math.hypot(point[0] - chosen[index - 1][0], point[1] - chosen[index - 1][1]) > .05);
    if (points.length >= 2) walkways.push(Object.freeze({ kind: placement.kind, door, points: Object.freeze(points.map(point => Object.freeze([point[0], point[1]] as const))) }));
  }
  return Object.freeze(walkways);
}
