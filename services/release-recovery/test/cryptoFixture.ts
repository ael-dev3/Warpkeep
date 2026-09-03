import { vi } from 'vitest'

const RECOVERY_KEY_ID = 'warpkeep-0.4.0-recovery-2026-09-03-1' as const

/** Test-only module injection. Production imports only src/crypto.ts. */
export async function loadTestOnlyCrypto(input: Readonly<{
  publicJwk: JsonWebKey
  thumbprint: string
}>): Promise<typeof import('../src/crypto.js')> {
  vi.resetModules()
  vi.doMock('../src/recoveryPublicKey.js', () => ({
    RECOVERY_KEY_ID,
    RECOVERY_PUBLIC_JWK: input.publicJwk,
    RECOVERY_KEY_THUMBPRINT: input.thumbprint,
  }))
  return import('../src/crypto.js')
}
