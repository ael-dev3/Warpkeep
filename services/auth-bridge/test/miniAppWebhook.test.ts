import { generateKeyPairSync, sign } from 'node:crypto'
import { encodeAbiParameters, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import type { BridgeConfig } from '../src/config'
import {
  createMiniAppWebhookVerifier,
  MiniAppWebhookInvalidError,
  MiniAppWebhookVerifierUnavailableError,
  miniAppWebhookVerifierFailureStage,
} from '../src/miniAppWebhook'

const USER_FID = 12_345
const APP_FID = 9_152
const DELIVERY_URL = 'https://api.farcaster.xyz/v1/frame-notifications'
const TOKEN = 'signed-webhook-notification-token'
const KEY_PAIR = generateKeyPairSync('ed25519')
const PUBLIC_KEY = KEY_PAIR.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
const REQUEST_ACCOUNT = privateKeyToAccount(`0x${'11'.repeat(32)}`)
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
  requestSigner: Address = '0x1111111111111111111111111111111111111111',
  signature: Hex = `0x${'ab'.repeat(65)}`,
  deadline = 9_999_999_999n,
) {
  const encodedMetadata = encodeAbiParameters(SIGNED_KEY_REQUEST_ABI, [[
    BigInt(appFid),
    requestSigner,
    signature,
    deadline,
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

async function signedHubSignerEvent() {
  const deadline = 9_999_999_999n
  const key = `0x${PUBLIC_KEY.toString('hex')}` as const
  const signature = await REQUEST_ACCOUNT.signTypedData({
    domain: {
      name: 'Farcaster SignedKeyRequestValidator',
      version: '1',
      chainId: 10,
      verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553',
    },
    types: {
      SignedKeyRequest: [
        { name: 'requestFid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'SignedKeyRequest',
    message: {
      requestFid: BigInt(APP_FID),
      key,
      deadline,
    },
  })
  return hubSignerEvent(APP_FID, REQUEST_ACCOUNT.address, signature, deadline)
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
    const failure = await webhookVerifier.verify(signed({
      event: 'miniapp_removed',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('unexpected')
  })

  it('accepts one current Hub attestation when the other healthy Hub is stale', async () => {
    const requestInits: (RequestInit | undefined)[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestInits.push(init)
      if (init?.redirect !== 'manual') {
        throw new Error('Cloudflare rejects redirect:error before issuing the subrequest')
      }
      return new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? hubJson([hubSignerEvent()])
        : hubJson([])
    }) as typeof fetch
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
    for (const init of requestInits) {
      expect(init).toMatchObject({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
      })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(activeOnChainAppKeyVerifier).toHaveBeenCalledOnce()
  })

  it('returns Hub redirects for fail-closed validation instead of following them', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual')
      return new URL(String(input)).hostname === 'rho.farcaster.xyz'
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://hostile.example/collect' },
          })
        : hubJson([hubSignerEvent()])
    }) as typeof fetch
    const activeOnChainAppKeyVerifier = vi.fn(async () => true)
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier,
    })

    const failure = await webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('hub_primary_response')
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
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

    const failure = await webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('hub_attestation_conflict')
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

    const failure = await webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('hub_secondary_attestation')
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

    const failure = await webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('hub_secondary_response')
    expect(activeOnChainAppKeyVerifier).not.toHaveBeenCalled()
  })

  it('identifies the exact Hub transport without recording an upstream error', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).hostname === 'rho.farcaster.xyz') {
        throw new Error('private transport details must not escape')
      }
      return hubJson([hubSignerEvent()])
    }) as typeof fetch
    const webhookVerifier = createMiniAppWebhookVerifier(config(), {
      fetchImpl,
      activeOnChainAppKeyVerifier: vi.fn(async () => true),
    })

    const failure = await webhookVerifier.verify(signed({
      event: 'notifications_disabled',
    })).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
    expect(miniAppWebhookVerifierFailureStage(failure)).toBe('hub_primary_fetch')
    expect(failure).toMatchObject({
      name: 'MiniAppWebhookVerifierUnavailableError',
      message: 'Mini App webhook verification is unavailable.',
      stage: 'hub_primary_fetch',
    })
    expect(Object.keys(failure as object)).toEqual(['stage', 'name'])
    expect(Object.prototype.hasOwnProperty.call(failure, 'cause')).toBe(false)
  })

  it('reports the remaining configuration and symmetric Hub stages exactly', async () => {
    const missingNotifications = { ...config(), miniAppNotifications: undefined }
    let configurationFailure: unknown
    try {
      createMiniAppWebhookVerifier(missingNotifications)
    } catch (error) {
      configurationFailure = error
    }
    expect(miniAppWebhookVerifierFailureStage(configurationFailure)).toBe('configuration')

    const malformed = hubSignerEvent()
    for (const [expected, fetchImpl] of [
      [
        'hub_primary_response',
        vi.fn(async (input: RequestInfo | URL) => (
          new URL(String(input)).hostname === 'rho.farcaster.xyz'
            ? hubJson([], 503)
            : hubJson([hubSignerEvent()])
        )) as typeof fetch,
      ],
      [
        'hub_primary_attestation',
        vi.fn(async (input: RequestInfo | URL) => (
          new URL(String(input)).hostname === 'rho.farcaster.xyz'
            ? hubJson([{
                ...malformed,
                signerEventBody: {
                  ...malformed.signerEventBody,
                  metadata: 'not-canonical-base64',
                },
              }])
            : hubJson([hubSignerEvent()])
        )) as typeof fetch,
      ],
      [
        'hub_secondary_fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          if (new URL(String(input)).hostname === 'hub.pinata.cloud') {
            throw new Error('private secondary transport details')
          }
          return hubJson([hubSignerEvent()])
        }) as typeof fetch,
      ],
    ] as const) {
      const webhookVerifier = createMiniAppWebhookVerifier(config(), {
        fetchImpl,
        activeOnChainAppKeyVerifier: vi.fn(async () => true),
      })
      const failure = await webhookVerifier.verify(signed({
        event: 'notifications_disabled',
      })).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
      expect(miniAppWebhookVerifierFailureStage(failure)).toBe(expected)
    }
  })

  it('requires both production RPC authorities to agree and identifies transport failures', async () => {
    const signerEvent = await signedHubSignerEvent()
    const fetchImpl = vi.fn(async () => hubJson([signerEvent])) as typeof fetch

    for (const [outcomes, expected] of [
      [[true, true], 'valid'],
      [['reject', true], 'rpc_primary_transport'],
      [[true, 'reject'], 'rpc_secondary_transport'],
      [[true, false], 'rpc_disagreement'],
      [[false, false], 'invalid'],
    ] as const) {
      const activeOnChainRpcVerifier = vi.fn(async (rpcUrl: string) => {
        const index = rpcUrl.includes('rpc-one') ? 0 : 1
        const outcome = outcomes[index]
        if (outcome === 'reject') throw new Error('private provider failure')
        return outcome
      })
      const webhookVerifier = createMiniAppWebhookVerifier(config(), {
        fetchImpl,
        activeOnChainRpcVerifier,
      })
      const result = await webhookVerifier.verify(signed({
        event: 'notifications_disabled',
      })).catch((error: unknown) => error)

      if (expected === 'valid') {
        expect(result).toMatchObject({ event: { type: 'disabled' } })
      } else if (expected === 'invalid') {
        expect(result).toBeInstanceOf(MiniAppWebhookInvalidError)
      } else {
        expect(result).toBeInstanceOf(MiniAppWebhookVerifierUnavailableError)
        expect(miniAppWebhookVerifierFailureStage(result)).toBe(expected)
        expect(result).toMatchObject({
          name: 'MiniAppWebhookVerifierUnavailableError',
          message: 'Mini App webhook verification is unavailable.',
          stage: expected,
        })
        expect(Object.keys(result as object)).toEqual(['stage', 'name'])
        expect(Object.prototype.hasOwnProperty.call(result, 'cause')).toBe(false)
      }
      expect(activeOnChainRpcVerifier).toHaveBeenCalledTimes(2)
    }
  })
})
