/** Canonical public seed for the first deterministic Hegemony Lowlands prototype. */
export const HEGEMONY_GENESIS_001 = 'HEGEMONY_GENESIS_001';

const UINT32_RANGE = 4_294_967_296;

/**
 * FNV-1a over UTF-16 code units. It is compact, documented, and stable across
 * browsers and server runtimes; this is identity hashing, not cryptography.
 */
export function hashSeedString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Murmur-inspired integer avalanche for deterministic generation channels. */
export function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function signedIntegerBits(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
}

/**
 * Derive independent, order-independent random channels from serializable map
 * coordinates. Generation code calls this instead of retaining mutable PRNG
 * state, so adding one decoration cannot perturb unrelated cells.
 */
export function deriveChannelSeed(
  worldSeed: number,
  q: number,
  r: number,
  channel: string,
  index = 0
): number {
  let seed = mixUint32(worldSeed);
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(q), 0x9e3779b1));
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(r), 0x85ebca77));
  seed = mixUint32(seed ^ hashSeedString(channel));
  return mixUint32(seed ^ Math.imul(signedIntegerBits(index), 0xc2b2ae3d));
}

export function seededUnitFloat(seed: number): number {
  return (mixUint32(seed) >>> 0) / UINT32_RANGE;
}

export function seededSignedFloat(seed: number): number {
  return seededUnitFloat(seed) * 2 - 1;
}
