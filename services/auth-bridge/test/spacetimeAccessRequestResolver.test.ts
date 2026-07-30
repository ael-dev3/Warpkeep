import { describe, expect, it, vi } from 'vitest'
import {
  INTERNAL_ACCESS_REQUEST_RESOLVER_TOKEN_TTL_SECONDS,
} from '../src/config'
import {
  ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS,
  AccessRequestResolverFailure,
  MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES,
  SPACETIMEDB_ACCESS_REQUEST_STATUS_PROCEDURE,
  SPACETIMEDB_ACCESS_REQUEST_SUBMIT_PROCEDURE,
  SpacetimeHttpAccessRequestResolver,
  accessRequestResolverFailureStage,
  parseAccessRequestResolution,
  type AccessRequestFetch,
  type AccessRequestResolverFailureStage,
} from '../src/spacetimeAccessRequestResolver'
import type { AccessRequestResolverTokenClaims } from '../src/types'

const FID = '12345'
const ISSUER = 'https://auth.warpkeep.example'
const AUDIENCE = 'warpkeep-spacetimedb'
const DATABASE = 'warpkeep-89e4u'
const URI = 'https://maincloud.spacetimedb.com'
const REQUESTED_AT_MICROS = 1_785_414_896_000_000

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  })
}

function createResolver(
  fetcher: AccessRequestFetch,
  options: Readonly<{
    signer?: (claims: AccessRequestResolverTokenClaims) => Promise<string>
    timeoutMs?: number
    clock?: () => number
  }> = {},
): SpacetimeHttpAccessRequestResolver {
  return new SpacetimeHttpAccessRequestResolver({
    uri: URI,
    database: DATABASE,
    issuer: ISSUER,
    audience: AUDIENCE,
    timeoutMs: options.timeoutMs ?? ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS,
  }, {
    fetcher,
    signer: options.signer ?? (async () => 'opaque-access-token'),
    clock: options.clock ?? (() => 1_700_000_000_000),
  })
}

async function expectFailure(
  promise: Promise<unknown>,
  stage: AccessRequestResolverFailureStage,
): Promise<void> {
  try {
    await promise
    throw new Error('Expected access resolver failure.')
  } catch (error) {
    expect(error).toBeInstanceOf(AccessRequestResolverFailure)
    expect(error).toMatchObject({
      message: 'Access request resolver is unavailable.',
      stage,
    })
  }
}

describe('Spacetime HTTP access-request resolver', () => {
  it('uses exact input-free procedures and one fresh FID-bound 15-second principal per call', async () => {
    const signer = vi.fn(async () => 'opaque-access-token')
    const fetcher = vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith(SPACETIMEDB_ACCESS_REQUEST_STATUS_PROCEDURE)
        ? response('["not_requested",{"none":[]}]')
        : response(`["requested",{"some":${REQUESTED_AT_MICROS}}]`)
    ))
    const resolver = createResolver(fetcher, { signer })

    await expect(resolver.getStatus(FID)).resolves.toEqual({ status: 'not-requested' })
    await expect(resolver.submit(FID)).resolves.toEqual({
      status: 'requested',
      requestedAtMicros: REQUESTED_AT_MICROS,
    })

    expect(signer).toHaveBeenCalledTimes(2)
    for (const [claims] of signer.mock.calls as unknown as [AccessRequestResolverTokenClaims][]) {
      expect(claims).toMatchObject({
        iss: ISSUER,
        sub: 'service:access-request-resolver',
        aud: [AUDIENCE],
        token_type: 'spacetime-access',
        roles: ['warpkeep-access-request-resolver'],
        request_fid: FID,
        iat: 1_700_000_000,
        nbf: 1_700_000_000,
      })
      expect(claims.exp - claims.iat)
        .toBe(INTERNAL_ACCESS_REQUEST_RESOLVER_TOKEN_TTL_SECONDS)
      expect(claims.exp - claims.iat).toBe(15)
    }

    expect(fetcher).toHaveBeenCalledTimes(2)
    const expectedProcedures = [
      SPACETIMEDB_ACCESS_REQUEST_STATUS_PROCEDURE,
      SPACETIMEDB_ACCESS_REQUEST_SUBMIT_PROCEDURE,
    ]
    fetcher.mock.calls.forEach((call, index) => {
      const [input, init] = call as unknown as [RequestInfo | URL, RequestInit]
      expect(String(input)).toBe(
        `${URI}/v1/database/${DATABASE}/call/${expectedProcedures[index]}`,
      )
      expect(init.method).toBe('POST')
      expect(init.body).toBe('[]')
      expect(init.redirect).toBe('manual')
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(init).not.toHaveProperty('credentials')
      expect(init).not.toHaveProperty('cache')
      const headers = new Headers(init.headers)
      expect(headers.get('authorization')).toBe('Bearer opaque-access-token')
      expect(headers.get('content-type')).toBe('application/json')
      expect(headers.get('accept')).toBe('application/json')
      expect(headers.get('cache-control')).toBe('no-store')
    })
  })

  it('accepts only the exact SATS product and option encoding', () => {
    expect(parseAccessRequestResolution(
      '["not_requested",{"none":[]}]',
      'application/json',
    )).toEqual({ status: 'not-requested' })
    expect(parseAccessRequestResolution(
      '["already_admitted",{"none":[]}]',
      'application/json; charset=utf-8',
    )).toEqual({ status: 'already-admitted' })
    expect(parseAccessRequestResolution(
      `["requested",{"some":${REQUESTED_AT_MICROS}}]`,
      'application/json',
    )).toEqual({
      status: 'requested',
      requestedAtMicros: REQUESTED_AT_MICROS,
    })

    for (const invalid of [
      '["not_requested",null]',
      '["not-requested",{"none":[]}]',
      '["not_requested",{"none":[0]}]',
      '["already_admitted",{"some":1}]',
      '["requested",{"none":[]}]',
      '["requested",{"some":"1785414896000000"}]',
      '["requested",{"some":0}]',
      '["requested",{"some":-1}]',
      '["requested",{"some":1.5}]',
      `["requested",{"some":${Number.MAX_SAFE_INTEGER + 1}}]`,
      '["requested",{"some":1,"none":[]}]',
      '["requested",{"some":1},true]',
      '{"status":"requested"}',
    ]) {
      expect(() => parseAccessRequestResolution(invalid, 'application/json'))
        .toThrow('Access request resolver is unavailable.')
    }
    expect(() => parseAccessRequestResolution(
      '["not_requested",{"none":[]}]',
      'text/plain',
    )).toThrow('Access request resolver is unavailable.')
  })

  it('never accepts a not-requested result from the mutating procedure', async () => {
    const fetcher = vi.fn(async () => response('["not_requested",{"none":[]}]'))
    const resolver = createResolver(fetcher)

    await expectFailure(resolver.submit(FID), 'response_validation')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('does not retry a rejected or outcome-ambiguous submit', async () => {
    const rejectedFetch = vi.fn(async () => {
      throw new Error('private network detail')
    })
    await expectFailure(
      createResolver(rejectedFetch).submit(FID),
      'fetch_request',
    )
    expect(rejectedFetch).toHaveBeenCalledOnce()

    const unavailableFetch = vi.fn(async () => response('', { status: 503 }))
    await expectFailure(
      createResolver(unavailableFetch).submit(FID),
      'upstream_status',
    )
    expect(unavailableFetch).toHaveBeenCalledOnce()
  })

  it('bounds redirects, bodies, streams, signing, and stalled requests with closed stages', async () => {
    await expectFailure(
      createResolver(async () => new Response('', {
        status: 302,
        headers: { location: 'https://private.example' },
      })).getStatus(FID),
      'upstream_status',
    )
    await expectFailure(
      createResolver(async () => response(
        'x'.repeat(MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES + 1),
      )).getStatus(FID),
      'response_validation',
    )
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('private stream detail'))
      },
    })
    await expectFailure(
      createResolver(async () => new Response(broken, {
        headers: { 'content-type': 'application/json' },
      })).getStatus(FID),
      'fetch_body',
    )
    const noFetch = vi.fn(async () => response('["not_requested",{"none":[]}]'))
    await expectFailure(
      createResolver(noFetch, {
        signer: async () => { throw new Error('private signing detail') },
      }).getStatus(FID),
      'signing',
    )
    expect(noFetch).not.toHaveBeenCalled()

    let signal: AbortSignal | undefined
    await expectFailure(
      createResolver((_input, init) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      }, { timeoutMs: 5 }).getStatus(FID),
      'timeout',
    )
    expect(signal?.aborted).toBe(true)
  })

  it('rejects invalid configuration and FIDs before signing or fetch', async () => {
    expect(() => new SpacetimeHttpAccessRequestResolver({
      uri: `${URI}/untrusted`,
      database: DATABASE,
      issuer: ISSUER,
      audience: AUDIENCE,
      timeoutMs: ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS,
    }, { signer: async () => 'opaque-access-token' }))
      .toThrow('configuration is invalid')

    const signer = vi.fn(async () => 'opaque-access-token')
    const fetcher = vi.fn(async () => response('["not_requested",{"none":[]}]'))
    const resolver = createResolver(fetcher, { signer })
    for (const invalid of [
      '0',
      '001',
      '9007199254740992',
      'fid-123',
      '',
    ]) {
      await expect(resolver.getStatus(invalid)).rejects.toThrow('invalid FID')
    }
    expect(signer).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not trust caller-shaped or runtime-mutated failure stages', () => {
    expect(accessRequestResolverFailureStage({ stage: 'timeout' })).toBeNull()
    const failure = new AccessRequestResolverFailure('timeout')
    Object.defineProperty(failure, 'stage', { value: 'private-detail' })
    expect(accessRequestResolverFailureStage(failure)).toBeNull()
  })
})
