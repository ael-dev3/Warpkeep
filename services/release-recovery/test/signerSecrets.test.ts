import { afterEach, expect, it, vi } from 'vitest'
import { base64UrlEncode } from '../src/protocol.js'

afterEach(() => { vi.doUnmock('../src/recoveryPublicKey.js'); vi.resetModules() })

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const exported = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! }
  const privateJwk = { ...publicJwk, d: exported.d! }
  const thumbprint = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify({ crv: 'P-256', kty: 'EC', x: exported.x, y: exported.y })))))
  vi.resetModules()
  vi.doMock('../src/recoveryPublicKey.js', () => ({ RECOVERY_KEY_ID: 'test-only', RECOVERY_PUBLIC_JWK: publicJwk, RECOVERY_KEY_THUMBPRINT: thumbprint }))
  const { validateSignerSecrets } = await import('../src/signerSecrets.js')
  return { validateSignerSecrets, privateJwk, input: {
    RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
    RELEASE_RECOVERY_RPC_SECRET: base64UrlEncode(crypto.getRandomValues(new Uint8Array(32))),
  } }
}

it('validates the actual key self-check against test-only ephemeral pins and snapshots output', async () => {
  const { validateSignerSecrets, input, privateJwk } = await fixture()
  const result = await validateSignerSecrets(input)
  expect(result.privateJwk).toEqual(privateJwk)
  expect(result.rpcCredential).toBe(input.RELEASE_RECOVERY_RPC_SECRET)
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.privateJwk)).toBe(true)
})

it('rejects equal decoded secrets, malformed encoding, duplicate JSON, extra keys and mismatched key material', async () => {
  const { validateSignerSecrets, input, privateJwk } = await fixture()
  const cases: unknown[] = [
    { ...input, RELEASE_RECOVERY_RPC_SECRET: privateJwk.d },
    { ...input, RELEASE_RECOVERY_RPC_SECRET: input.RELEASE_RECOVERY_RPC_SECRET + '=' },
    { ...input, RELEASE_RECOVERY_RPC_SECRET: 'A'.repeat(42) + 'B' },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: input.RECOVERY_SIGNING_PRIVATE_JWK.replace('{', '{"d":"duplicate",') },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify({ ...privateJwk, d: input.RELEASE_RECOVERY_RPC_SECRET }) },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify({ ...privateJwk, x: input.RELEASE_RECOVERY_RPC_SECRET }) },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: ' '.repeat(4097) },
    { ...input, extra: true },
    Object.create(input),
    Object.defineProperty({ ...input }, 'RELEASE_RECOVERY_RPC_SECRET', { get() { throw new Error('secret must not escape') } }),
  ]
  for (const candidate of cases) await expect(validateSignerSecrets(candidate)).rejects.toThrow(/^RECOVERY_SIGNER_SECRETS_INVALID$/u)
})
