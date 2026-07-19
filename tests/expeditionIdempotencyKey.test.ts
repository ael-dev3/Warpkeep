import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExpeditionIdempotencyKey } from '../src/spacetime/expeditionIdempotencyKey';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('expedition idempotency key generation', () => {
  it('accepts only a v4 Web Crypto UUID and normalizes its casing', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '4A9977D2-C7C4-4D63-8E65-F28F966C0C33'
    });

    expect(createExpeditionIdempotencyKey())
      .toBe('4a9977d2-c7c4-4d63-8e65-f28f966c0c33');
  });

  it('fails closed when randomUUID is malformed or throws', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'predictable' });
    expect(createExpeditionIdempotencyKey()).toBeUndefined();

    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('entropy unavailable');
      }
    });
    expect(createExpeditionIdempotencyKey()).toBeUndefined();
  });

  it('uses the supplied getRandomValues buffer and sets UUID v4 variant bits', () => {
    const suppliedBuffers: Uint8Array[] = [];
    vi.stubGlobal('crypto', {
      getRandomValues: (buffer: Uint8Array) => {
        suppliedBuffers.push(buffer);
        buffer.set([
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xff, 0x77,
          0xff, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff
        ]);
        return buffer;
      }
    });

    expect(createExpeditionIdempotencyKey())
      .toBe('00112233-4455-4f77-bf99-aabbccddeeff');
    expect(suppliedBuffers).toHaveLength(1);
  });

  it('rejects a substituted or unfilled getRandomValues view', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (_buffer: Uint8Array) => new Uint8Array(16).fill(0xff)
    });
    expect(createExpeditionIdempotencyKey()).toBeUndefined();

    vi.stubGlobal('crypto', {
      getRandomValues: (buffer: Uint8Array) => buffer
    });
    expect(createExpeditionIdempotencyKey()).toBeUndefined();
  });

  it('does not fall back to weak randomness when Web Crypto is absent', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createExpeditionIdempotencyKey()).toBeUndefined();
  });
});
