import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  AuthEpochResolverFailure,
  MAX_AUTH_EPOCH,
  MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES,
  SpacetimeHttpAuthEpochResolver,
  authEpochResolverFailureStage,
  type AuthEpochResolverFailureStage,
  type AuthEpochFetch,
} from '../src/spacetimeAuthEpochResolver'
import type { AdminTokenClaims } from '../src/types'

const FID = '12345'
const ISSUER = 'https://auth.warpkeep.example'
const AUDIENCE = 'warpkeep-spacetimedb'
const DATABASE = 'warpkeep-89e4u'
const URI = 'https://maincloud.spacetimedb.com'

function createResolver(
  fetcher: AuthEpochFetch,
  options: {
    signer?: (claims: AdminTokenClaims) => Promise<string>
    timeoutMs?: number
    clock?: () => number
  } = {},
): SpacetimeHttpAuthEpochResolver {
  return new SpacetimeHttpAuthEpochResolver({
    uri: URI,
    database: DATABASE,
    issuer: ISSUER,
    audience: AUDIENCE,
    timeoutMs: options.timeoutMs ?? AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  }, {
    fetcher,
    signer: options.signer ?? (async () => 'opaque-admin-token'),
    clock: options.clock ?? (() => 1_700_000_000_000),
  })
}

function jsonResponse(value: string, init: ResponseInit = {}): Response {
  return new Response(value, {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

async function expectFailureStage(
  operation: Promise<unknown>,
  expectedStage: AuthEpochResolverFailureStage,
): Promise<void> {
  try {
    await operation
    throw new Error('Expected the resolver to fail.')
  } catch (error) {
    expect(error).toBeInstanceOf(AuthEpochResolverFailure)
    expect(error).toMatchObject({
      message: 'Auth epoch resolver is unavailable.',
      stage: expectedStage,
    })
  }
}

describe('Spacetime HTTP auth-epoch resolver', () => {
  it('calls only the fixed HTTPS procedure with positional SATS-JSON and a fresh short-lived admin JWT', async () => {
    const signer = vi.fn(async (_claims: AdminTokenClaims) => 'opaque-admin-token')
    const fetcher = vi.fn(async () => jsonResponse('0'))
    const resolver = createResolver(fetcher as AuthEpochFetch, { signer })

    await expect(resolver.resolve(FID)).resolves.toBe(0)

    expect(signer).toHaveBeenCalledTimes(1)
    const [claims] = signer.mock.calls[0] as [AdminTokenClaims]
    expect(claims).toMatchObject({
      iss: ISSUER,
      sub: 'service:hermes',
      aud: [AUDIENCE],
      token_type: 'spacetime-access',
      roles: ['warpkeep-admin'],
      iat: 1_700_000_000,
      nbf: 1_700_000_000,
    })
    expect(claims.exp - claims.iat).toBe(60)

    const [input, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(input.toString()).toBe('https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/admin_get_fid_auth_epoch')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('[12345]')
    expect(init).not.toHaveProperty('cache')
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('accept')).toBe('application/json')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('authorization')).toMatch(/^Bearer\s+\S+$/)
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('opaque-admin-token')
  })

  it('accepts the exact raw u32 procedure result, including a missing-row zero', async () => {
    for (const [raw, expected] of [
      ['0', 0],
      ['17', 17],
      [String(MAX_AUTH_EPOCH), MAX_AUTH_EPOCH],
    ] as const) {
      const resolver = createResolver(async () => jsonResponse(raw))
      await expect(resolver.resolve(FID)).resolves.toBe(expected)
    }
  })

  it('does not send browser-only cache mode in the Worker subrequest init', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init && 'cache' in init) throw new TypeError('cache mode is not implemented')
      return jsonResponse('0')
    })
    const resolver = createResolver(fetcher)

    await expect(resolver.resolve(FID)).resolves.toBe(0)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('classifies redirects and every non-success response as upstream_status', async () => {
    const rejected = [
      new Response('', { status: 302, headers: { location: 'https://unexpected.example' } }),
      new Response('', { status: 503, headers: { 'content-type': 'application/json' } }),
    ]

    for (const response of rejected) {
      await expectFailureStage(
        createResolver(async () => response).resolve(FID),
        'upstream_status',
      )
    }
  })

  it('classifies malformed media, bodies, JSON, and epochs as response_validation', async () => {
    const invalid = [
      new Response(null, { status: 200, headers: { 'content-type': 'application/json' } }),
      jsonResponse('{}'),
      jsonResponse('[]'),
      jsonResponse('"0"'),
      jsonResponse('-1'),
      jsonResponse('0.5'),
      jsonResponse(String(MAX_AUTH_EPOCH + 1)),
      new Response('0', { headers: { 'content-type': 'text/plain' } }),
      new Response('0', { headers: { 'content-type': 'application/jsonp' } }),
      jsonResponse('x'.repeat(MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES + 1)),
    ]

    for (const response of invalid) {
      await expectFailureStage(
        createResolver(async () => response).resolve(FID),
        'response_validation',
      )
    }
  })

  it('classifies a fetch rejection without exposing the upstream error', async () => {
    const sensitive = 'https://secret.example/?token=do-not-log'
    const resolver = createResolver(async () => { throw new Error(sensitive) })

    try {
      await resolver.resolve(FID)
      throw new Error('Expected the resolver to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthEpochResolverFailure)
      expect(error).toMatchObject({
        message: 'Auth epoch resolver is unavailable.',
        stage: 'fetch',
      })
      expect(JSON.stringify(error)).not.toContain(sensitive)
    }
  })

  it('does not fabricate a closed stage for an unexpected resolver implementation bug', async () => {
    const sensitive = 'unexpected-sensitive-response-contract-detail'
    const malformedResponse = {
      get ok(): boolean {
        throw new Error(sensitive)
      },
    } as Response
    const resolver = createResolver(async () => malformedResponse)

    try {
      await resolver.resolve(FID)
      throw new Error('Expected the resolver to fail.')
    } catch (error) {
      expect(error).not.toBeInstanceOf(AuthEpochResolverFailure)
      expect(error).toMatchObject({ message: sensitive })
      expect(authEpochResolverFailureStage(error)).toBeNull()
    }
  })

  it('classifies a 2xx response stream failure as fetch', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('sensitive transport detail'))
      },
    })
    const resolver = createResolver(async () => new Response(stream, {
      headers: { 'content-type': 'application/json' },
    }))

    await expectFailureStage(resolver.resolve(FID), 'fetch')
  })

  it('rejects a malformed FID before minting a token or making an HTTP request', async () => {
    const signer = vi.fn(async () => 'opaque-admin-token')
    const fetcher = vi.fn(async () => jsonResponse('0'))
    const resolver = createResolver(fetcher as AuthEpochFetch, { signer })

    await expect(resolver.resolve('001')).rejects.toThrow('invalid FID')
    await expect(resolver.resolve('9007199254740992')).rejects.toThrow('invalid FID')
    expect(signer).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts an unresolved lookup at the configured deadline', async () => {
    let signal: AbortSignal | undefined
    const resolver = createResolver((_input, init) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }, { timeoutMs: 5 })

    await expectFailureStage(resolver.resolve(FID), 'timeout')
    expect(signal?.aborted).toBe(true)
  })

  it('classifies a deadline that aborts a stalled 2xx body as timeout', async () => {
    let signal: AbortSignal | undefined
    const resolver = createResolver((_input, init) => {
      signal = init?.signal ?? undefined
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener('abort', () => {
            controller.error(new DOMException('sensitive abort detail', 'AbortError'))
          }, { once: true })
        },
      })
      return Promise.resolve(new Response(stream, {
        headers: { 'content-type': 'application/json' },
      }))
    }, { timeoutMs: 5 })

    await expectFailureStage(resolver.resolve(FID), 'timeout')
    expect(signal?.aborted).toBe(true)
  })

  it('rejects untrusted endpoint configuration and signer failure without a request', async () => {
    expect(() => new SpacetimeHttpAuthEpochResolver({
      uri: 'https://maincloud.spacetimedb.com/untrusted-path',
      database: DATABASE,
      issuer: ISSUER,
      audience: AUDIENCE,
      timeoutMs: AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
    }, { signer: async () => 'opaque-admin-token' })).toThrow('configuration is invalid')

    const fetcher = vi.fn(async () => jsonResponse('0'))
    const resolver = createResolver(fetcher as AuthEpochFetch, {
      signer: async () => { throw new Error('signing failed') },
    })
    await expectFailureStage(resolver.resolve(FID), 'signing')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('classifies an empty signer result as signing without making a request', async () => {
    const fetcher = vi.fn(async () => jsonResponse('0'))
    const resolver = createResolver(fetcher as AuthEpochFetch, { signer: async () => '' })

    await expectFailureStage(resolver.resolve(FID), 'signing')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects spoofed or runtime-mutated failure stages', () => {
    expect(authEpochResolverFailureStage({ stage: 'fetch' })).toBeNull()
    const failure = new AuthEpochResolverFailure('fetch')
    Object.defineProperty(failure, 'stage', { value: 'sensitive-arbitrary-stage' })
    expect(authEpochResolverFailureStage(failure)).toBeNull()
  })

  it('bounds a stalled signer with the resolver deadline', async () => {
    const fetcher = vi.fn(async () => jsonResponse('0'))
    const resolver = createResolver(fetcher as AuthEpochFetch, {
      signer: () => new Promise<string>(() => {}),
      timeoutMs: 5,
    })

    await expectFailureStage(resolver.resolve(FID), 'timeout')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
