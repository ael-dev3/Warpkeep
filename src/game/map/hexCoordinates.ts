/**
 * Pure pointy-top axial-coordinate helpers.
 *
 * The world convention is deliberately independent of Three.js:
 * x = size * sqrt(3) * (q + r / 2)
 * z = size * 1.5 * r
 */
export type HexCoord = Readonly<{
  q: number;
  r: number;
}>;

export type CubeCoord = Readonly<{
  q: number;
  r: number;
  s: number;
}>;

export type HexWorldPosition = Readonly<{
  x: number;
  z: number;
}>;

const SQRT_3 = Math.sqrt(3);

export const POINTY_TOP_AXIAL_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
] as const;

function integerOr(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function positiveSize(size: number) {
  return Number.isFinite(size) && size > 0 ? size : 1;
}

export function axialToCube({ q, r }: HexCoord): CubeCoord {
  const safeQ = integerOr(q);
  const safeR = integerOr(r);
  return { q: safeQ, r: safeR, s: -safeQ - safeR };
}

export function cubeToAxial({ q, r }: CubeCoord): HexCoord {
  return { q: integerOr(q), r: integerOr(r) };
}

export function cubeRound({ q, r, s }: CubeCoord): CubeCoord {
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  let roundedS = Math.round(s);
  const qDifference = Math.abs(roundedQ - q);
  const rDifference = Math.abs(roundedR - r);
  const sDifference = Math.abs(roundedS - s);

  if (qDifference > rDifference && qDifference > sDifference) {
    roundedQ = -roundedR - roundedS;
  } else if (rDifference > sDifference) {
    roundedR = -roundedQ - roundedS;
  } else {
    roundedS = -roundedQ - roundedR;
  }

  return { q: roundedQ, r: roundedR, s: roundedS };
}

export function axialToWorld({ q, r }: HexCoord, size: number): HexWorldPosition {
  const safeSize = positiveSize(size);
  return {
    x: safeSize * SQRT_3 * (q + r * 0.5),
    z: safeSize * 1.5 * r
  };
}

export function worldToFractionalAxial({ x, z }: HexWorldPosition, size: number): CubeCoord {
  const safeSize = positiveSize(size);
  const safeX = Number.isFinite(x) ? x : 0;
  const safeZ = Number.isFinite(z) ? z : 0;
  const r = (safeZ * 2) / (safeSize * 3);
  const q = safeX / (safeSize * SQRT_3) - r * 0.5;
  return { q, r, s: -q - r };
}

export function worldToNearestAxial(position: HexWorldPosition, size: number): HexCoord {
  return cubeToAxial(cubeRound(worldToFractionalAxial(position, size)));
}

export function hexKey({ q, r }: HexCoord): string {
  return `${integerOr(q)},${integerOr(r)}`;
}

export function parseHexKey(value: string): HexCoord | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(value.trim());
  if (!match) return null;
  return { q: Number(match[1]), r: Number(match[2]) };
}

export function hexAdd(first: HexCoord, second: HexCoord): HexCoord {
  return { q: integerOr(first.q) + integerOr(second.q), r: integerOr(first.r) + integerOr(second.r) };
}

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return POINTY_TOP_AXIAL_DIRECTIONS.map((direction) => hexAdd(coord, direction));
}

export function hexDistance(first: HexCoord, second: HexCoord): number {
  const a = axialToCube(first);
  const b = axialToCube(second);
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

export function hexDisc(center: HexCoord, radius: number): HexCoord[] {
  const safeRadius = Math.max(0, integerOr(radius));
  const cells: HexCoord[] = [];

  for (let q = -safeRadius; q <= safeRadius; q += 1) {
    const minimumR = Math.max(-safeRadius, -q - safeRadius);
    const maximumR = Math.min(safeRadius, -q + safeRadius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      cells.push({ q: center.q + q, r: center.r + r });
    }
  }

  return cells;
}
