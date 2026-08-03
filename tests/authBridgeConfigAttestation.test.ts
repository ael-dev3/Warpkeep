import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
  verifyAuthBridgeRpcRoleAttestation,
} from '../scripts/auth-bridge-config-attestation.mjs'

const ADMIN_TOKEN = 'test-admin-token-that-is-long-enough-for-production'
const PRIMARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
)
const SECONDARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
)

function response(overrides: Record<string, unknown> = {}, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({
    profile: 'warpkeep-auth-v2',
    digest: 'd'.repeat(64),
    farcasterRpcEndpointFingerprints: [
      PRIMARY_FINGERPRINT,
      SECONDARY_FINGERPRINT,
    ].sort(),
    farcasterRpcEndpointRoleFingerprints: {
      primary: PRIMARY_FINGERPRINT,
      secondary: SECONDARY_FINGERPRINT,
    },
    ...overrides,
  }), {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      ...headers,
    },
  })
}

describe('private auth bridge RPC role attestation', () => {
  it('verifies the exact primary/fallback assignment without a browser payload', async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => response())
    const fetchImpl = fetchMock as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).resolves.toEqual({
      profile: 'warpkeep-auth-v2',
      digest: 'd'.repeat(64),
      farcasterRpcEndpointRoleFingerprints: {
        primary: PRIMARY_FINGERPRINT,
        secondary: SECONDARY_FINGERPRINT,
      },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://auth.warpkeep.com/v1/admin/config-attestation')
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
    })
    const requestHeaders = new Headers(init?.headers)
    expect(requestHeaders.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
    expect(requestHeaders.has('origin')).toBe(false)
    expect(init).not.toHaveProperty('body')
  })

  it('rejects swapped roles even when the unordered endpoint set is unchanged', async () => {
    const fetchImpl = vi.fn(async () => response({
      farcasterRpcEndpointRoleFingerprints: {
        primary: SECONDARY_FINGERPRINT,
        secondary: PRIMARY_FINGERPRINT,
      },
    })) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toThrow('primary/secondary assignment did not match')
  })

  it('rejects a noncanonical bridge before the credential reaches fetch', async () => {
    const fetchImpl = vi.fn(async () => response()) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      bridgeUrl: 'https://evil.example',
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toThrow('pinned to the canonical Warpkeep bridge')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a browser-readable private attestation response', async () => {
    const fetchImpl = vi.fn(async () => response({}, {
      'access-control-allow-origin': 'https://warpkeep.com',
    })) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toThrow('exposed browser CORS headers')
  })

  it('keeps credentials out of transport failure messages', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(ADMIN_TOKEN)
    }) as typeof fetch

    let message = ''
    try {
      await verifyAuthBridgeRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('attestation endpoint was unreachable')
    expect(message).not.toContain(ADMIN_TOKEN)
  })
})
