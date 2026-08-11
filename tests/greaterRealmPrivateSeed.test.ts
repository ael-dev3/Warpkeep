// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
  GREATER_REALM_PRIVATE_SEED_MARKER,
  decodeGreaterRealmPrivateSeed,
  encodeGreaterRealmPrivateSeed,
} from '../scripts/atlas/greater-realm-private-seed';

describe('Greater Realm private seed envelope', () => {
  it('round-trips exactly while carrying a scan-visible kind tag', () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const envelope = encodeGreaterRealmPrivateSeed(seed, 'batch');
    let decoded: Buffer | undefined;
    try {
      expect(envelope).toHaveLength(GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES);
      expect(envelope.includes(Buffer.from(GREATER_REALM_PRIVATE_SEED_MARKER, 'ascii')))
        .toBe(true);
      decoded = decodeGreaterRealmPrivateSeed(envelope, 'batch');
      expect(decoded).toEqual(Buffer.from(seed));
      expect(() => decodeGreaterRealmPrivateSeed(envelope, 'candidate'))
        .toThrow('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
    } finally {
      decoded?.fill(0);
      envelope.fill(0);
      seed.fill(0);
    }
  });

  it('rejects changed markers and non-exact lengths', () => {
    const seed = new Uint8Array(32);
    const envelope = encodeGreaterRealmPrivateSeed(seed, 'candidate');
    const changed = Buffer.from(envelope);
    const extended = Buffer.concat([envelope, Buffer.from([0])]);
    changed[0] = changed[0]! ^ 0xff;
    try {
      expect(() => decodeGreaterRealmPrivateSeed(changed, 'candidate'))
        .toThrow('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
      expect(() => decodeGreaterRealmPrivateSeed(extended, 'candidate'))
        .toThrow('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
      expect(() => encodeGreaterRealmPrivateSeed(seed, '__proto__' as never))
        .toThrow('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
      expect(() => encodeGreaterRealmPrivateSeed(seed.subarray(0, 31), 'candidate'))
        .toThrow('GREATER_REALM_PRIVATE_SEED_ENVELOPE_INVALID');
    } finally {
      changed.fill(0);
      extended.fill(0);
      envelope.fill(0);
      seed.fill(0);
    }
  });
});
