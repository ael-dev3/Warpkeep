import { generateKeyPairSync, sign } from 'node:crypto'
import { encodeAbiParameters } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { BridgeConfig } from '../src/config'
import {
  createMiniAppWebhookVerifier,
  MiniAppWebhookInvalidError,
  MiniAppWebhookVerifierUnavailableError,
} from '../src/miniAppWebhook'

const USER_FID = 12_345
const APP_FID = 9_152
const DELIVERY_URL = 'https://api.farcaster.xyz/v1/frame-notifications'
const TOKEN = 'signed-webhook-notification-token'
const KEY_PAIR = generateKeyPairSync('ed25519')
const PUBLIC_KEY = KEY_PAIR.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
const SIGNED_KEY_REQUEST_ABI = [{
  type: 'tuple',
  components: [
    { type: 'uint256' },
    { type: 'address' },
    { type: 'bytes' },
    { type: 'uint256' },
  ],
}] as const

function config(): BridgeConfig {
  return {
    issuer: 'https://auth.warpkeep.com',
    issuerUrl: new URL('https://auth.warpkeep.com'),
    allowedOrigins: new Set(['https://warpkeep.com']),
    domain: 'warpkeep.com',
    siweUri: 'https://warpkeep.com/',
    farcasterRpcUrls: Object.freeze([
      'https://optimism-rpc-one.example.com/',
      'https://optimism-rpc-two.example.net/',
    ]),
    audience: 'warpkeep-spacetimedb',
    keyId: 'test-key',
    privateJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'A'.repeat(43),
      y: 'B'.repeat(43),
      d: 'C'.repeat(43),
    },
    adminTokenSecret: 'test-admin-secret-at-least-thirty-two-bytes',
    sessionCookieKey: 'test-session-secret-at-least-thirty-two-bytes',
    spacetimeDbUri: 'https://maincloud.spacetimedb.com',
    spacetimeDbDatabase: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    publicAuthEnabled: true,
    accessExpectedFidRequired: true,
    qaObserverEnabled: false,
    approvalNotificationsEnabled: true,
    miniAppNotifications: {
      hubUrls: Object.freeze([
        'https://rho.farcaster.xyz:3381/',
        'https://hub.pinata.cloud/',
      ]),
      clients: Object.freeze([{ appFid: APP_FID, deliveryUrl: DELIVERY_URL }]),
      operatorSecret: 'test-notification-operator-secret-at-least-thirty-two-bytes',
    },
    environment: 'production',
  }
}

function signed(event: unknown) {
  const key = `0x${PUBLIC_KEY.toString('hex')}`
  const header = Buffer.from(JSON.stringify({
    fid: USER_FID,
    type: 'app_key',
    key,
  })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(event)).toString('base64url')
  const signedInput = new TextEncoder().encode(`${header}.${payload}`)
  const signature = sign(null, signedInput, KEY_PAIR.privateKey).toString('base64url')
  signedInput.fill(0)
  return { header, payload, signature }
}

function hubSignerEvent(
  appFid = APP_FID,
  requestSigner = '0x1111111111111111111111111111111111111111' as const,
) {
  const encodedMetadata = encodeAbiParameters(SIGNED_KEY_REQUEST_ABI, [[
    BigInt(appFid),
    requestSigner,
    `0x${'ab'.repeat(65)}`,
    9_999_999_999n,
  ]])
  return {
    type: 'EVENT_TYPE_SIGNER',
    signerEventBody: {
      eventType: 'SIGNER_EVENT_TYPE_ADD',
      keyType: 1,
      metadataType: 1,
      key: `0x${PUBLIC_KEY.toString('hex')}`,
      metadata: Buffer.from(encodedMetadata.slice(2), 'hex').toString('base64'),
    },
  }
}

function hubJson(events: readonly unknown[], status = 200) {
  return new Response(JSON.stringify({ events }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function verifier(appFid = APP_FID) {
  const appKeyVerifier = vi.fn(async () => ({ valid: true as const, appFid }))
  return {
    appKeyVerifier,
    verifier: createMiniAppWebhookVerifier(config(), { appKeyVerifier }),
  }
}

describe('signed Farcaster Mini App webhook verification', () => {
  it('verifies the official JFS envelope and projects only the notification consent fields', async () => {
    const h = verifier()
    const result = await h.verifier.verify(signed({
      event: 'notifications_enabled',
      notificationDetails: { token: TOKEN, url: DELIVERY_URL },
    }))

    expect(result).toEqual({
      eventId: expect.stringMatching(/^[0-9a-f]{64}$/),
      fid: String(USER_FID),
      appFid: APP_FID,
      event: {
        type: 'enabled',
        details: { token: TOKEN, url: DELIVERY_URL },
      },
    })
    expect(h.appKeyVerifier).toHaveBeenCalledWith(
      USER_FID,
      expect.stringMatching(/^0x[0-9a-f]{64}$/),
    )
  })

  it('rejects a tampered envelope and an unallowlisted enable URL', async () => {
    const h = verifier()
    const envelope = signed({
      event: 'notifications_enabled',
      notificationDetails: { token: TOKEN, url: DELIVERY_URL },
    })
    const tampered = {
      ...envelope,
      payload: `${envelope.payload.slice(0, -1)}${envelope.payload.endsWith('A') ? 'B' : 'A'}`,
    }
    await expect(h.verifier.verify(tampered)).rejects.toBeInstanceOf(MiniAppWebhookInvalidError)

    await expect(h.verifier.verify(signed({
      event: 'notifications_enabled',
      notificationDetails: {
        token: TOKEN,
        url: 'https://hostile.example/collect',
      },
    }))).rejects.toBeInstanceOf(MiniAppWebhookInvalidError)
  })

  it('allows a retired app FID only to remove its own old subscription', async () => {
    const retired = verifier(42_424)
    await expect(retired.verifier.verify(signed({
      event: 'notifications_disabled',
    }))).resolves.toMatchObject({
      fid: String(USER_FID),
      appFid: 42_424,
      event: { type: 'disabled' },
    })

    await expect(retired.verifier.verify(signed({
      event: 'notifications_enabled',
      notificationDetails: { token: TOKEN, url: DELIVERY_URL },
    }))).rejects.toBeInstanceOf(MiniAppWebhookInvalidError)
  })

  it('treats app-key authority outages as retryable instead of invalid consent', async () => {
    const appKeyVerifier = vi.fn(async () => { throw new Error('private Hub outage') })
    const webhookVerifier = createMiniAppWebhookVerifier(config(), { appKeyVerifier })
    await expect(webhookVerifier.verify(signed({
      event: 'miniapp_removed',
    }))).rejects.toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
  })

  it('accepts one current Hub attestation when the other healthy Hub is stale', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? hubJson([hubSignerEvent()])
        : hubJson([])
    )) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    await expect(webhookVerifier.verify(signed({
      event: 'notifications_enabled',
      notificationDetails: { token: TOKEN, url: DELIVERY_URL },
    }))).resolves.toMatchObject({
      fid: String(USER_FID),
      appFid: APP_FID,
      event: { type: 'enabled' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(activeOnChainAppKeyVerifier).toHaveBeenCalledOnce()
  })

  it('rejects conflicting matching Hub attestations as retryable unavailability', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? hubJson([hubSignerEvent()])
        : hubJson([hubSignerEvent(42_424)])
    )) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    await expect(webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    }))).rejects.toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
  })

  it('rejects malformed exact-key Hub metadata instead of treating it as lag', async () => {
    const malformed = hubSignerEvent()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? hubJson([hubSignerEvent()])
        : hubJson([{
            ...malformed,
            signerEventBody: {
              ...malformed.signerEventBody,
              metadata: 'not-canonical-base64',
            },
          }])
    )) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    await expect(webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    }))).rejects.toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
  })

  it('rejects an app key absent from both healthy Hubs', async () => {
    const fetchImpl = vi.fn(async () => hubJson([])) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    await expect(webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    }))).rejects.toBeInstanceOf(MiniAppWebhookInvalidError)
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
  })

  it('still fails closed when either configured Hub is unavailable', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? hubJson([hubSignerEvent()])
        : hubJson([], 503)
    )) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    await expect(webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    }))).rejects.toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
  })
})
