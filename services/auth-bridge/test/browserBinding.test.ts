import { describe, expect, it } from 'vitest'
import {
  BROWSER_BINDING_METHOD,
  isCanonicalBrowserBindingValue,
  matchesS256BrowserBinding,
} from '../src/browserBinding'

const RFC_7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC_7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('browser binding verification', () => {
  it('accepts only the RFC 7636 S256 proof', async () => {
    expect(BROWSER_BINDING_METHOD).toBe('S256')
    expect(isCanonicalBrowserBindingValue(RFC_7636_VERIFIER)).toBe(true)
    expect(isCanonicalBrowserBindingValue(RFC_7636_CHALLENGE)).toBe(true)
    await expect(matchesS256BrowserBinding(RFC_7636_VERIFIER, RFC_7636_CHALLENGE))
      .resolves.toBe(true)
    await expect(matchesS256BrowserBinding('A'.repeat(43), RFC_7636_CHALLENGE))
      .resolves.toBe(false)
  })

  it.each([
    '',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}=`,
    `${'A'.repeat(42)}+`,
    `${'A'.repeat(42)}/`,
    `${'A'.repeat(42)}.`,
    `${'A'.repeat(42)}B`,
  ])('rejects non-canonical binding value %j before matching', async (value) => {
    expect(isCanonicalBrowserBindingValue(value)).toBe(false)
    await expect(matchesS256BrowserBinding(value, RFC_7636_CHALLENGE))
      .resolves.toBe(false)
  })
})
