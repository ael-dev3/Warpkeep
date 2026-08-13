const PRIVATE_SEED_MARKER = 'WKGR-PRIVATE-SEED-V1' as const;
const PRIVATE_SEED_MARKER_BYTES = Buffer.from(PRIVATE_SEED_MARKER, 'ascii');
const PRIVATE_SEED_PAYLOAD_BYTES = 32;
const PRIVATE_SEED_KIND = Object.freeze({ batch: 1, candidate: 2 } as const);
const PRIVATE_SEED_HEADER_BYTES = PRIVATE_SEED_MARKER_BYTES.length + 3;

export const GREATER_REALM_PRIVATE_SEED_MARKER = PRIVATE_SEED_MARKER;
export const GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES =
  PRIVATE_SEED_HEADER_BYTES + PRIVATE_SEED_PAYLOAD_BYTES;

export type GreaterRealmPrivateSeedKind = keyof typeof PRIVATE_SEED_KIND;

function fail(): never {
  throw new Error('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
}

/**
 * Mark a private 32-byte seed so renamed seed files remain detectable by the
 * repository privacy scanner. Cryptographic derivation never includes this
 * envelope; callers must continue hashing only the extracted payload.
 */
export function encodeGreaterRealmPrivateSeed(
  seed: Uint8Array,
  kind: GreaterRealmPrivateSeedKind,
): Buffer {
  if (!(seed instanceof Uint8Array) || seed.byteLength !== PRIVATE_SEED_PAYLOAD_BYTES) {
    fail();
  }
  const kindCode = kind === 'batch'
    ? PRIVATE_SEED_KIND.batch
    : kind === 'candidate'
      ? PRIVATE_SEED_KIND.candidate
      : undefined;
  if (kindCode === undefined) fail();
  const envelope = Buffer.alloc(GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES);
  PRIVATE_SEED_MARKER_BYTES.copy(envelope, 0);
  let offset = PRIVATE_SEED_MARKER_BYTES.length;
  envelope.writeUInt8(0, offset);
  offset += 1;
  envelope.writeUInt8(kindCode, offset);
  offset += 1;
  envelope.writeUInt8(PRIVATE_SEED_PAYLOAD_BYTES, offset);
  offset += 1;
  envelope.set(seed, offset);
  return envelope;
}

/** Parse a strict envelope and return a new owner-cleared 32-byte payload. */
export function decodeGreaterRealmPrivateSeed(
  envelope: Uint8Array,
  expectedKind: GreaterRealmPrivateSeedKind,
): Buffer {
  if (
    !(envelope instanceof Uint8Array)
    || envelope.byteLength !== GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES
  ) fail();
  const markerBytes = PRIVATE_SEED_MARKER_BYTES.length;
  if (
    PRIVATE_SEED_MARKER_BYTES.some((byte, index) => envelope[index] !== byte)
    || envelope[markerBytes] !== 0
    || envelope[markerBytes + 1] !== PRIVATE_SEED_KIND[expectedKind]
    || envelope[markerBytes + 2] !== PRIVATE_SEED_PAYLOAD_BYTES
  ) fail();
  return Buffer.from(envelope.subarray(PRIVATE_SEED_HEADER_BYTES));
}
