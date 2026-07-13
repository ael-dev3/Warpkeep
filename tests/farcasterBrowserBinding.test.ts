import { describe, expect, it, vi } from 'vitest';

import {
  FARCASTER_BROWSER_BINDING_METHOD,
  createFarcasterBrowserBinding,
  deriveFarcasterBrowserBindingChallenge,
  isCanonicalFarcasterBrowserBindingValue
} from '../src/farcaster/farcasterBrowserBinding';

const RFC_7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('Farcaster browser binding', () => {
  it('matches the RFC 7636 S256 vector', async () => {
    await expect(deriveFarcasterBrowserBindingChallenge(RFC_7636_VERIFIER))
      .resolves.toBe(RFC_7636_CHALLENGE);
  });

  it('creates a fresh canonical 256-bit verifier and S256 challenge', async () => {
    const first = await createFarcasterBrowserBinding();
    const second = await createFarcasterBrowserBinding();

    expect(first.method).toBe(FARCASTER_BROWSER_BINDING_METHOD);
    expect(isCanonicalFarcasterBrowserBindingValue(first.verifier)).toBe(true);
    expect(isCanonicalFarcasterBrowserBindingValue(first.challenge)).toBe(true);
    await expect(deriveFarcasterBrowserBindingChallenge(first.verifier))
      .resolves.toBe(first.challenge);
    expect(second.verifier).not.toBe(first.verifier);
    expect(second.challenge).not.toBe(first.challenge);
  });

  it('zero-fills the temporary decoded verifier bytes after canonical validation', () => {
    const fill = vi.spyOn(Uint8Array.prototype, 'fill');
    try {
      expect(isCanonicalFarcasterBrowserBindingValue(RFC_7636_VERIFIER)).toBe(true);
      expect(fill.mock.calls.some((call, index) => (
        call[0] === 0
        && (fill.mock.contexts[index] as Uint8Array | undefined)?.byteLength === 32
      ))).toBe(true);
    } finally {
      fill.mockRestore();
    }
  });

  it.each([
    '',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}=`,
    `${'A'.repeat(42)}+`,
    `${'A'.repeat(42)}/`,
    `${'A'.repeat(42)}.`,
    `${'A'.repeat(42)}B`
  ])('rejects non-canonical binding value %j', async (value) => {
    expect(isCanonicalFarcasterBrowserBindingValue(value)).toBe(false);
    await expect(deriveFarcasterBrowserBindingChallenge(value)).rejects.toThrow(
      'Farcaster browser binding is unavailable.'
    );
  });
});
