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

function rawCastle(overrides: Partial<Record<number, unknown>> = {}): unknown[] {
  const value: unknown[] = [
    1,
    '0,0',
    0,
    0,
    1,
    'Genesis Keep',
    { some: 'founder' },
    { none: [] },
    true,
    { some: 'Public bio' },
    'active',
  ]
  for (const [index, replacement] of Object.entries(overrides)) value[Number(index)] = replacement
  return value
}

function rawSnapshot(castles: unknown[] = [rawCastle()]): unknown[] {
  return [
    1,
    3,
    3_445_214_658,
    'HEGEMONY_GENESIS_001',
    1_261,
    1_261,
    ['GENESIS_001', 3_445_214_658, 2, 20, 22, 100],
    castles,
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
    database: 'warpkeep-89e4u',
    issuer: 'https://auth.warpkeep.example',
    audience: 'warpkeep-spacetimedb',
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
      version: 1,
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
      castles: [{
        castleId: 1,
        tileKey: '0,0',
        q: 0,
        r: 0,
        level: 1,
        name: 'Genesis Keep',
        canonicalUsername: 'founder',
        portraitAvailable: true,
        publicBio: 'Public bio',
        publicStatus: 'active',
      }],
    })
    expect(signer).toHaveBeenCalledOnce()
    const claims = signer.mock.calls[0]?.[0]
    expect(claims).toMatchObject({
      iss: 'https://auth.warpkeep.example',
      sub: 'service:qa-snapshot-resolver',
      aud: ['warpkeep-spacetimedb'],
      token_type: 'spacetime-access',
      roles: ['warpkeep-qa-snapshot-resolver'],
      device_thumbprint: DEVICE_THUMBPRINT,
      iat: NOW / 1_000,
      nbf: NOW / 1_000,
    })
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS)

    const [input, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(input.toString()).toBe(
      'https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/qa_observer_get_realm_snapshot_v1',
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

  it('accepts only canonical named SATS options and omits absent public fields', () => {
    const snapshot = parseQaObserverSnapshot(JSON.stringify(rawSnapshot([
      rawCastle({ 6: { none: [] }, 7: { some: 'Display' }, 9: { none: [] } }),
    ])), 'application/json')
    expect(snapshot.castles[0]).toEqual({
      castleId: 1,
      tileKey: '0,0',
      q: 0,
      r: 0,
      level: 1,
      name: 'Genesis Keep',
      displayName: 'Display',
      portraitAvailable: true,
      publicStatus: 'active',
    })
    expect(snapshot.castles[0]).not.toHaveProperty('canonicalUsername')
    expect(snapshot.castles[0]).not.toHaveProperty('publicBio')

    for (const invalid of [null, 'founder', { some: 'founder', none: [] }, { none: null }, { 0: 'founder' }]) {
      expect(() => parseQaObserverSnapshot(JSON.stringify(rawSnapshot([
        rawCastle({ 6: invalid }),
      ])), 'application/json')).toThrow(QaSnapshotResolverFailure)
    }
  })

  it('rejects static drift, privacy/shape expansion, unsafe identifiers, duplicates, and over-capacity results', () => {
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
    invalidSnapshots.push(rawSnapshot([rawCastle({ 0: Number.MAX_SAFE_INTEGER + 1 })]))
    invalidSnapshots.push(rawSnapshot([rawCastle(), rawCastle({ 0: 1, 1: '1,0', 2: 1 })]))
    invalidSnapshots.push(rawSnapshot(Array.from({ length: 101 }, (_, index) => rawCastle({
      0: index + 1,
      1: `${index},0`,
      2: index,
    }))))
    invalidSnapshots.push(rawSnapshot([rawCastle({ 1: '0,1', 2: 0, 3: 0 })]))
    invalidSnapshots.push(rawSnapshot([rawCastle({ 10: 'private' })]))

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
