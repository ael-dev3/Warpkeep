import { describe, expect, it } from 'vitest'

import {
  P256_ORDER,
  assertRecoveryPrivateKeyMatchesPinned,
  createRecoveryJwsVerifier,
  signRecoveryStatusJws,
  verifyRecoveryStatusJws,
} from '../src/crypto.js'

const TEST_ONLY_PRIVATE_JWK: JsonWebKey = {
  // Fixture only. This key is never a production recovery signing key.
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o',
}

const TEST_ONLY_PUBLIC_JWK: JsonWebKey = {
  // Fixture only. This public key pairs only with TEST_ONLY_PRIVATE_JWK.
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
}

const OTHER_TEST_ONLY_PUBLIC_JWK: JsonWebKey = {
  // Fixture only. This deliberately has unrelated P-256 coordinates.
  kty: 'EC',
  crv: 'P-256',
  x: '8UvvEI1cJ_k90byhgLiQfOJwRFPu7vRT94D2JPtnms4',
  y: 'GdfYHHW0cc9gAaCDgHMhareQPEyJEY29yF3BFmFX0RE',
}

const statusPayload = {
  schemaVersion: 1,
  profile: 'warpkeep-0.4.0-recovery-status-v1',
  iss: 'https://release-auth.warpkeep.com',
  aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-control-status',
  kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  enabled: true,
  authorizationEpoch: 7,
  iat: 1_000,
  nbf: 1_000,
  exp: 1_060,
} as const

const HAND_DERIVED_TEST_ONLY_STATUS_JWS = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IndhcnBrZWVwLTAuNC4wLXJlY292ZXJ5LXN0YXR1cytqd3QiLCJraWQiOiJ3YXJwa2VlcC0wLjQuMC1yZWNvdmVyeS0yMDI2LTA5LTAzLTEifQ.eyJzY2hlbWFWZXJzaW9uIjoxLCJwcm9maWxlIjoid2FycGtlZXAtMC40LjAtcmVjb3Zlcnktc3RhdHVzLXYxIiwiaXNzIjoiaHR0cHM6Ly9yZWxlYXNlLWF1dGgud2FycGtlZXAuY29tIiwiYXVkIjoid2FycGtlZXAtMC40LjAtc2VhbGVkLWxhdW5jaCIsInN1YiI6IndhcnBrZWVwLTAuNC4wLXJlY292ZXJ5LWNvbnRyb2wtc3RhdHVzIiwia2lkIjoid2FycGtlZXAtMC40LjAtcmVjb3ZlcnktMjAyNi0wOS0wMy0xIiwiZW5hYmxlZCI6dHJ1ZSwiYXV0aG9yaXphdGlvbkVwb2NoIjo3LCJpYXQiOjEwMDAsIm5iZiI6MTAwMCwiZXhwIjoxMDYwfQ.-KXyra7BGffHXoMvcsPr7lArwRAMOsgJ2YHidcQeEsRGnaXM2BFD9G9O-ri-OtNMVfxk20hcHfVTC1YfpaVLgg'

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64url'))
}

function bytesToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function readP256S(signature: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(signature.slice(32)).toString('hex')}`)
}

describe('recovery ES256 signatures', () => {
  it('normalizes signatures to low-S so equivalent ES256 signatures do not create another authority', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const signature = base64UrlToBytes(compact.split('.')[2])

    expect(signature).toHaveLength(64)
    expect(readP256S(signature) <= P256_ORDER / 2n).toBe(true)
  })

  it('rejects a high-S variant so signature malleability cannot bypass a single-use record', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const [header, payload, encodedSignature] = compact.split('.')
    const signature = base64UrlToBytes(encodedSignature)
    const highS = P256_ORDER - readP256S(signature)
    const highSBytes = new Uint8Array(signature)
    highSBytes.set(Buffer.from(highS.toString(16).padStart(64, '0'), 'hex'), 32)
    const verifier = createRecoveryJwsVerifier(TEST_ONLY_PUBLIC_JWK)

    await expect(verifier.verifyRecoveryStatusJws(`${header}.${payload}.${bytesToBase64Url(highSBytes)}`, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('rejects a signature under another public key so a foreign recovery signer is not trusted', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const verifier = createRecoveryJwsVerifier(OTHER_TEST_ONLY_PUBLIC_JWK)

    await expect(verifier.verifyRecoveryStatusJws(compact, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('verifies a hand-derived compact JWS byte-for-byte with a test-injected key', async () => {
    const verifier = createRecoveryJwsVerifier(TEST_ONLY_PUBLIC_JWK)

    await expect(verifier.verifyRecoveryStatusJws(HAND_DERIVED_TEST_ONLY_STATUS_JWS, 1_030))
      .resolves.toEqual(statusPayload)
  })

  it('rejects a protected header algorithm substitution before signature verification', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const [, payload, signature] = compact.split('.')
    const header = bytesToBase64Url(new TextEncoder().encode('{"alg":"none","typ":"warpkeep-0.4.0-recovery-status+jwt","kid":"warpkeep-0.4.0-recovery-2026-09-03-1"}'))
    const verifier = createRecoveryJwsVerifier(TEST_ONLY_PUBLIC_JWK)

    await expect(verifier.verifyRecoveryStatusJws(`${header}.${payload}.${signature}`, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_HEADER_INVALID')
  })

  it('uses only the pinned production key in the public verifier entrypoint', async () => {
    await expect(verifyRecoveryStatusJws(HAND_DERIVED_TEST_ONLY_STATUS_JWS, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('fails a signer startup key check when a test fixture does not match the pinned production public key', async () => {
    await expect(assertRecoveryPrivateKeyMatchesPinned(TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_SIGNING_KEY_MISMATCH')
  })
})
