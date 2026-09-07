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

it('composes signed status with real control transitions and rejects invalid secrets before ledger access', async () => {
  const { input } = await fixture()
  const { RecoverySigner } = await import('../src/signer.js')
  const { verifyRecoveryStatusJws } = await import('../src/crypto.js')
  const { createLedgerV2Control, reconcileLedgerV2Control } = await import('../src/ledgerV2.js')
  const { arming } = await import('./signerControlFixture.js')
  let state = createLedgerV2Control({ authorizationEpoch: 3 })
  const ledger = { reconcileControl: vi.fn(async (value: Parameters<typeof reconcileLedgerV2Control>[1]) => {
    state = reconcileLedgerV2Control(state, value)
    return state
  }) }
  const control = { RECOVERY_ENABLED: 'true', RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_ARMING_MANIFEST: JSON.stringify(arming()) }
  const signer = new RecoverySigner(control, input, ledger, () => 1000)
  const response = await signer.status()
  expect(Object.keys(response)).toEqual(['statusJws'])
  expect(await verifyRecoveryStatusJws(response.statusJws, 1000)).toMatchObject({ enabled: true, authorizationEpoch: 3, iat: 1000, exp: 1060 })
  await expect(verifyRecoveryStatusJws(response.statusJws, 1060)).rejects.toThrow('RECOVERY_JWS_TIME_INVALID')
  const disabled = new RecoverySigner({ ...control, RECOVERY_ENABLED: 'false' }, input, ledger, () => 1001)
  expect(await verifyRecoveryStatusJws((await disabled.status()).statusJws, 1001)).toMatchObject({ enabled: false })
  await expect(signer.status()).rejects.toThrow('RECOVERY_LEDGER_ARMING_ALREADY_USED')
  ledger.reconcileControl.mockClear()
  await expect(new RecoverySigner(control, {}, ledger, () => 1000).status()).rejects.toThrow('RECOVERY_SIGNER_SECRETS_INVALID')
  await expect(new RecoverySigner(control, input, ledger, () => NaN).status()).rejects.toThrow('RECOVERY_SIGNER_TIME_INVALID')
  await expect((signer.status as (...args: unknown[]) => Promise<unknown>)({ enabled: true })).rejects.toThrow('RECOVERY_SIGNER_REQUEST_INVALID')
  expect(ledger.reconcileControl).not.toHaveBeenCalled()
})

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
