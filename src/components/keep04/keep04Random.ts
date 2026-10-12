// Deterministic presentation randomness for the Verdant Citadel surroundings.
// Every quality tier and every visit draws the same authored population, so
// lower tiers only thin a stable list instead of reshuffling the landscape.

/** Mulberry32: small, fast and stable across engines. */
export function keep04Random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.freeze({
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    pick: <T>(values: readonly T[]) => values[Math.min(values.length - 1, Math.floor(next() * values.length))],
  });
}

function hash2(x: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1]. */
export function keep04Noise(x: number, z: number, seed = 0) {
  const x0 = Math.floor(x); const z0 = Math.floor(z);
  const tx = smooth(x - x0); const tz = smooth(z - z0);
  const a = hash2(x0, z0, seed); const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed); const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Fractal value noise in roughly [0, 1]. */
export function keep04Fbm(x: number, z: number, octaves = 4, seed = 0) {
  let amplitude = .5; let frequency = 1; let sum = 0; let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += keep04Noise(x * frequency, z * frequency, seed + octave * 101) * amplitude;
    total += amplitude; amplitude *= .5; frequency *= 2.03;
  }
  return sum / total;
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smoothstep = (edge0: number, edge1: number, value: number) => smooth(clamp01((value - edge0) / (edge1 - edge0)));
