export const BROWSER_BINDING_METHOD = 'S256' as const
export type BrowserBindingMethod = typeof BROWSER_BINDING_METHOD

const BINDING_BYTES = 32
const CANONICAL_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function decodeBase64Url32(value: string): Uint8Array | undefined {
  try {
    const binary = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`)
    if (binary.length !== BINDING_BYTES) return undefined
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}

export function isCanonicalBrowserBindingValue(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_BINDING_PATTERN.test(value)) return false
  const decoded = decodeBase64Url32(value)
  if (!decoded) return false
  try {
    return encodeBase64Url(decoded) === value
  } finally {
    decoded.fill(0)
  }
}

export async function matchesS256BrowserBinding(
  verifier: string,
  expectedChallenge: string,
): Promise<boolean> {
  if (
    !isCanonicalBrowserBindingValue(verifier)
    || !isCanonicalBrowserBindingValue(expectedChallenge)
  ) {
    return false
  }

  const verifierBytes = new TextEncoder().encode(verifier)
  try {
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', verifierBytes))
    const expected = decodeBase64Url32(expectedChallenge)
    if (!expected) return false
    try {
      let difference = actual.length ^ expected.length
      for (let index = 0; index < BINDING_BYTES; index += 1) {
        difference |= actual[index] ^ expected[index]
      }
      return difference === 0
    } finally {
      actual.fill(0)
      expected.fill(0)
    }
  } finally {
    verifierBytes.fill(0)
  }
}
