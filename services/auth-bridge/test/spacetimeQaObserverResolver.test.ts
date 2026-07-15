import { afterEach, describe, expect, it, vi } from 'vitest'
import { QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS } from '../src/config'
import {
  MAX_QA_SNAPSHOT_RESPONSE_BYTES,
  QA_SNAPSHOT_TIMEOUT_MILLISECONDS,
  QaSnapshotResolverFailure,
  SpacetimeHttpQaObserverResolver,
  parseQaObserverSnapshot,
  type QaSnapshotFailureStage,
  type QaSnapshotFetch,
} from '../src/spacetimeQaObserverResolver'
import type { QaSnapshotResolverTokenClaims } from '../src/types'

const DEVICE_THUMBPRINT = 'A'.repeat(43)
const NOW = 1_800_000_000_000

function rawSnapshot(aggregates: unknown[] = [1, 1, 0, 1]): unknown[] {
  return [
    2,
    3,
    3_445_214_658,
    'HEGEMONY_GENESIS_001',
    1_261,
    1_261,
    ['GENESIS_001', 3_445_214_658, 2, 20, 22, 100],
    aggregates,
  ]
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

function resolver(fetcher: QaSnapshotFetch, options: {
  signer?: (claims: QaSnapshotResolverTokenClaims) => Promise<string>
  timeoutMs?: number
  clock?: () => number
} = {}) {
  return new SpacetimeHttpQaObserverResolver({
    uri: 'https://maincloud.spacetimedb.com',
    database: 'warpkeep-qa-observer-test',
    issuer: 'https://auth.warpkeep.example',
    audience: 'warpkeep-qa-observer-spacetimedb',
    timeoutMs: options.timeoutMs ?? QA_SNAPSHOT_TIMEOUT_MILLISECONDS,
  }, {
    fetcher,
    signer: options.signer ?? (async () => 'private-qa-resolver-token'),
    clock: options.clock ?? (() => NOW),
  })
}

async function expectStage(operation: Promise<unknown>, stage: QaSnapshotFailureStage): Promise<void> {
  try {
    await operation
    throw new Error('Expected QA snapshot resolver failure.')
  } catch (error) {
    expect(error).toBeInstanceOf(QaSnapshotResolverFailure)
    expect(error).toMatchObject({
      stage,
      message: 'QA snapshot resolver is unavailable.',
    })
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Spacetime QA observer resolver', () => {
  it('uses only the fixed no-argument procedure and a fresh sole-role 15-second server token', async () => {
    const signer = vi.fn(async (_claims: QaSnapshotResolverTokenClaims) => 'private-qa-resolver-token')
    const fetcher = vi.fn(async () => jsonResponse(rawSnapshot()))
    const snapshot = await resolver(fetcher as QaSnapshotFetch, { signer }).resolve(DEVICE_THUMBPRINT)

    expect(snapshot).toEqual({
      version: 2,
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      worldTileCount: 1_261,
      worldTileMetaCount: 1_261,
      realm: {
        realmId: 'GENESIS_001',
        numericSeed: 3_445_214_658,
        generationVersion: 2,
        authoritativeRadius: 20,
        renderRadius: 22,
        playerCapacity: 100,
      },
      aggregates: {
        castleCount: 1,
        profileCount: 1,
        foundedCount: 0,
        activeCount: 1,
      },
    })
    expect(signer).toHaveBeenCalledOnce()
    const claims = signer.mock.calls[0]?.[0]
    expect(claims).toMatchObject({
      iss: 'https://auth.warpkeep.example',
      sub: 'service:qa-snapshot-resolver',
      aud: ['warpkeep-qa-observer-spacetimedb'],
      token_type: 'spacetime-access',
      roles: ['warpkeep-qa-snapshot-resolver'],
      device_thumbprint: DEVICE_THUMBPRINT,
      iat: NOW / 1_000,
      nbf: NOW / 1_000,
    })
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS)

    const [input, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(input.toString()).toBe(
      'https://maincloud.spacetimedb.com/v1/database/warpkeep-qa-observer-test/call/qa_observer_get_realm_attestation_v2',
    )
    expect(init.method).toBe('POST')
    expect(init.body).toBe('[]')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init).not.toHaveProperty('cache')
    expect(init).not.toHaveProperty('credentials')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer private-qa-resolver-token')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.stringify(snapshot)).not.toContain('private-qa-resolver-token')
  })

  it('accepts only the exact aggregate SATS product and contains no identity surface', () => {
    const snapshot = parseQaObserverSnapshot(JSON.stringify(rawSnapshot([2, 2, 1, 1])), 'application/json')
    expect(snapshot.aggregates).toEqual({
      castleCount: 2,
      profileCount: 2,
      foundedCount: 1,
      activeCount: 1,
    })
    const serialized = JSON.stringify(snapshot)
    for (const forbidden of [
      'castleId', 'tileKey', 'username', 'displayName', 'publicBio', 'portrait', 'fid',
    ]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())

    const legacyIdentityProjection = rawSnapshot([[
      1, '0,0', 0, 0, 1, 'Genesis Keep', { some: 'founder' }, { none: [] },
      true, { some: 'Public bio' }, 'active',
    ]])
    expect(() => parseQaObserverSnapshot(
      JSON.stringify(legacyIdentityProjection),
      'application/json',
    )).toThrow(QaSnapshotResolverFailure)
  })

  it('rejects static drift, privacy/shape expansion, and inconsistent aggregate results', () => {
    const invalidSnapshots: unknown[] = []
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const value = structuredClone(rawSnapshot())
      value[index] = index === 3 ? 'OTHER_WORLD' : 0
      invalidSnapshots.push(value)
    }
    const realmDrift = structuredClone(rawSnapshot())
    ;(realmDrift[6] as unknown[])[0] = 'OTHER_REALM'
    invalidSnapshots.push(realmDrift)
    invalidSnapshots.push([...rawSnapshot(), { fid: 1 }])
    invalidSnapshots.push(rawSnapshot([]))
    invalidSnapshots.push(rawSnapshot([0, 0, 0, 0]))
    invalidSnapshots.push(rawSnapshot([101, 101, 100, 1]))
    invalidSnapshots.push(rawSnapshot([2, 1, 1, 1]))
    invalidSnapshots.push(rawSnapshot([2, 2, 0, 1]))
    invalidSnapshots.push(rawSnapshot([1, 1, 0, 1, 7]))
    invalidSnapshots.push(rawSnapshot([1, 1, 0, { fid: 1 }]))

    for (const invalid of invalidSnapshots) {
      expect(() => parseQaObserverSnapshot(JSON.stringify(invalid), 'application/json')).toThrow(
        QaSnapshotResolverFailure,
      )
    }
  })

  it('bounds media and bodies, rejects redirects/status failures, and classifies transport stages', async () => {
    await expectStage(
      resolver(async () => new Response('', { status: 302, headers: { location: 'https://other.example' } }))
        .resolve(DEVICE_THUMBPRINT),
      'upstream_status',
    )
    await expectStage(
      resolver(async () => new Response('{}', { headers: { 'content-type': 'text/plain' } }))
        .resolve(DEVICE_THUMBPRINT),
      'response_validation',
    )
    await expectStage(
      resolver(async () => jsonResponse('x'.repeat(MAX_QA_SNAPSHOT_RESPONSE_BYTES + 1)))
        .resolve(DEVICE_THUMBPRINT),
      'response_validation',
    )
    await expectStage(
      resolver(async () => { throw new Error('private upstream URL') }).resolve(DEVICE_THUMBPRINT),
      'fetch_request',
    )
    const failedStream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error('private stream detail')) },
    })
    await expectStage(
      resolver(async () => new Response(failedStream, {
        headers: { 'content-type': 'application/json' },
      })).resolve(DEVICE_THUMBPRINT),
      'fetch_body',
    )
  })

  it('aborts and reports a fixed timeout without exposing a late upstream result', async () => {
    vi.useFakeTimers({ now: NOW })
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      init?.signal?.addEventListener('abort', () => resolve(jsonResponse(rawSnapshot())))
    }))
    const operation = resolver(fetcher, { timeoutMs: 25 }).resolve(DEVICE_THUMBPRINT)
    const expectedFailure = expectStage(operation, 'timeout')
    await vi.advanceTimersByTimeAsync(25)
    await expectedFailure
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
