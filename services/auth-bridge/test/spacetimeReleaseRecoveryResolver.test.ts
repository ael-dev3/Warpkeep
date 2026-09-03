// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { BridgeConfig } from '../src/config'
import type { ReleaseRecoveryConfig } from '../src/releaseRecoveryConfig'
import {
  G001_ALPHA_STATUS_FIELDS,
  G001_MEMBER_STATUS_FIELDS,
  G001_POLICY_FIELDS,
  G002_ADMIN_STATUS_FIELDS,
  PTR_ADMIN_STATUS_FIELDS,
  PTR_OWNER_STATUS_FIELDS,
  RELEASE_RECOVERY_AGGREGATE_RESPONSE_BYTES,
  RELEASE_RECOVERY_MAXIMUM_REQUESTS,
  RELEASE_RECOVERY_OVERALL_TIMEOUT_MS,
  SpacetimeReleaseRecoveryResolver,
  SpacetimeReleaseRecoveryResolverFailure,
  parseSpacetimeFidResponse,
  parseSpacetimeProgramHashResponse,
  type ReleaseRecoveryRequestContext,
  type ReleaseRecoveryTimer,
} from '../src/spacetimeReleaseRecoveryResolver'

const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002 = '2'.repeat(64)
const PTR = '3'.repeat(64)
const CANARY_FID = '42'
const ATLAS_COMMIT = '4'.repeat(40)
const RELEASE_SHA = '5'.repeat(64)
const HEADER_SHA = '6'.repeat(64)
const VERIFY_SHA = '7'.repeat(64)
const PUBLIC_RELEASE = `GRR-${'A'.repeat(26)}`
const PUBLIC_APPROVAL = `GRA-${'B'.repeat(26)}`

const encoder = new TextEncoder()
const bytes = (value: string): Uint8Array => encoder.encode(value)

function referenceU32(value: number): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setUint32(0, value, false)
  return result
}

function referenceU64(value: number): Uint8Array {
  const result = new Uint8Array(8)
  new DataView(result.buffer).setBigUint64(0, BigInt(value), false)
  return result
}

function referenceConcat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function referenceFrame(value: Uint8Array): Uint8Array {
  return referenceConcat([referenceU64(value.byteLength), value])
}

function referenceBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

async function referenceHmac(
  domain: string,
  payload: Uint8Array,
): Promise<Readonly<{ bytes: Uint8Array; hex: string }>> {
  const pepper = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  const key = await crypto.subtle.importKey(
    'raw',
    pepper,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const domainBytes = bytes(`warpkeep-recovery-v1:${domain}:`)
  const input = referenceConcat([
    referenceU32(domainBytes.byteLength),
    domainBytes,
    referenceU64(payload.byteLength),
    payload,
  ])
  const output = new Uint8Array(await crypto.subtle.sign('HMAC', key, referenceBuffer(input)))
  return Object.freeze({
    bytes: output,
    hex: Array.from(output, byte => byte.toString(16).padStart(2, '0')).join(''),
  })
}

function referenceAtlasProduct(
  fields: readonly string[],
  fixture: readonly unknown[],
  g002: boolean,
): Readonly<Record<string, string | boolean | null>> {
  const stringIndexes = new Set(g002 ? [0, 1, 2, 3, 4, 27, 39, 41, 43] : [7, 9, 11])
  const booleanIndexes = new Set(g002
    ? [5, 6, 23, 24, 25, 26, 28, 32, 69, 70, 71, 72]
    : [0, 39, 40, 41, 42, 43, 44])
  const optionalIndexes = new Set(g002 ? [33, 34, 35, 36, 37, 38, 40] : [1, 2, 3, 4, 5, 6, 8])
  const result: Record<string, string | boolean | null> = {}
  fields.forEach((field, index) => {
    const value = fixture[index]
    if (stringIndexes.has(index)) result[field] = value as string
    else if (booleanIndexes.has(index)) result[field] = value as boolean
    else if (optionalIndexes.has(index)) {
      const option = value as readonly [number, unknown]
      result[field] = option[0] === 0 ? String(option[1]) : null
    } else result[field] = String(value)
  })
  return Object.freeze(result)
}

function sqlStatement(name: string, type: 'U64' | 'U256', rows: unknown[][]): string {
  return JSON.stringify([{
    schema: {
      elements: [{
        name: { some: name },
        algebraic_type: { [type]: [] },
      }],
    },
    rows,
    total_duration_micros: 17,
    stats: { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 },
  }])
}

function programSql(quantity = '0x102'): string {
  return sqlStatement('program_hash', 'U256', [[quantity]])
}

function fidSql(fids: readonly number[] = [42]): string {
  return sqlStatement('fid', 'U64', fids.map(fid => [fid]))
}

function alphaStatus(count = 1): unknown[] {
  return [
    10_000, count, 10_000, 1, 100, count, 0, count, count, count,
    count, count, 2, 3, 4, 5, 6, 7, count, count, 8,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    3, 3_445_214_658, 'HEGEMONY_GENESIS_001',
  ]
}

function g002Status(): unknown[] {
  return [
    'GENESIS_002', 'warpkeep-genesis-002', 'warpkeep-genesis-002-sealed-v1',
    '0.4.0', 'sealed', false, false,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    true, false, false, true, 'ready', true, 10, 600, 5,
    true, [0, 'GENESIS_002_GREATER_REALM'], [0, PUBLIC_RELEASE],
    [0, PUBLIC_APPROVAL], [0, ATLAS_COMMIT], [0, RELEASE_SHA], [0, HEADER_SHA],
    'ready', [0, 1], 'complete', 0, VERIFY_SHA,
    6, 2, 3, 10, 600, 5, 2, 3, 10, 600, 5, 8, 600, 5, 8, 6,
    2, 3, 10, 600, 5, 0, 0, 0, 0, true, true, true, false,
  ]
}

function ptrAdminStatus(): unknown[] {
  return [
    true, [0, 'PTR_GREATER_REALM'], [0, PUBLIC_RELEASE], [0, PUBLIC_APPROVAL],
    [0, ATLAS_COMMIT], [0, RELEASE_SHA], [0, HEADER_SHA], 'ready', [0, 1],
    'complete', 0, VERIFY_SHA,
    6, 2, 3, 10, 600, 5, 2, 3, 10, 600, 5, 8, 600, 5, 8, 6,
    2, 3, 10, 600, 5, 0, 0, 0, 0, 0, 0, true, true, true, false, true, true,
  ]
}

function ptrOwnerStatus(epoch = 7): unknown[] {
  return ['PTR', '0.4.0-ptr.1', 'warpkeep-ptr-owner-view-v1', 42, epoch, true, true, 9_999_999_999]
}

function policyStatus(): unknown[] {
  return [
    'GENESIS_001', '0.3.43', true, false, false,
    '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
  ]
}

function memberStatus(epoch = 7): unknown[] {
  return ['enabled', epoch, 'not_requested', [1, []], [1, []]]
}

function response(url: string, raw: string, init: ResponseInit = {}): Response {
  const result = new Response(raw, {
    status: 200,
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  })
  Object.defineProperty(result, 'url', { value: url })
  return result
}

function config(): ReleaseRecoveryConfig {
  const bridgeConfig = {
    issuer: 'https://auth.warpkeep.com',
    audience: 'warpkeep-spacetimedb',
    ptrEnabled: true,
    playerCanaryOwnerFid: CANARY_FID,
    ptrSpacetimeDb: { database: PTR, audience: 'warpkeep-ptr-spacetimedb' },
  } as BridgeConfig
  return Object.freeze({
    bridgeConfig,
    bridgeService: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '11111111-1111-4111-8111-111111111111',
    bridgeSourceCommit: '8'.repeat(40),
    bridgeConfigEpoch: 1,
    bridgeConfigIdentity: '9'.repeat(64),
    spacetimeOrigin: 'https://maincloud.spacetimedb.com',
    genesis001Database: G001,
    genesis002Database: G002,
    ptrDatabase: PTR,
    genesis001Audience: 'warpkeep-spacetimedb',
    genesis002Audience: 'warpkeep-genesis-002-spacetimedb',
    ptrAudience: 'warpkeep-ptr-spacetimedb',
    rpcCredential: 'A'.repeat(43),
    censusPepperBytes: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    canaryFid: CANARY_FID,
  }) as ReleaseRecoveryConfig
}

type SeenRequest = Readonly<{ url: string; init: RequestInit }>

function successfulFetcher(fids: readonly number[] = [42], delay = false) {
  const seen: SeenRequest[] = []
  let active = 0
  let maximumActive = 0
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input.toString()
    seen.push({ url, init })
    active += 1
    maximumActive = Math.max(maximumActive, active)
    if (delay) await Promise.resolve()
    try {
      const body = String(init.body)
      if (body === 'SELECT program_hash FROM st_module') return response(url, programSql())
      if (body === 'SELECT fid FROM player_v2') return response(url, fidSql(fids))
      if (url.endsWith('/call/genesis_001_access_policy_v1')) {
        return response(url, JSON.stringify(policyStatus()))
      }
      if (url.endsWith('/call/admin_get_alpha_status_v3')) {
        return response(url, JSON.stringify(alphaStatus(fids.length)))
      }
      if (url.includes('/call/admin_get_access_request_admission_status_v1')) {
        return response(url, JSON.stringify(memberStatus()))
      }
      if (url.includes(`/${G002}/call/admin_get_greater_realm_status_v1`)) {
        return response(url, JSON.stringify(g002Status()))
      }
      if (url.includes(`/${PTR}/call/admin_get_greater_realm_status_v1`)) {
        return response(url, JSON.stringify(ptrAdminStatus()))
      }
      if (url.endsWith('/call/get_ptr_owner_status_v1')) {
        return response(url, JSON.stringify(ptrOwnerStatus()))
      }
      throw new Error('unexpected fixture request')
    } finally {
      active -= 1
    }
  })
  return { fetcher, seen, maximumActive: () => maximumActive, active: () => active }
}

function resolver(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  let milliseconds = 1_900_000_000_000
  return new SpacetimeReleaseRecoveryResolver(config(), {
    fetcher,
    signer: async () => 'opaque-private-token',
    clockMilliseconds: () => milliseconds++,
    clockSeconds: () => 1_900_000_000,
  })
}

describe('strict Spacetime recovery parsers', () => {
  it('pins every positional product field order', () => {
    expect(G001_POLICY_FIELDS).toEqual([
      'realmId', 'releaseVersion', 'playerAccessEnabled',
      'admissionStateMutationsEnabled', 'accessRequestSubmissionsEnabled',
      'sourceBaselineCommit', 'freezeReleaseNonce',
    ])
    expect(G001_ALPHA_STATUS_FIELDS).toEqual([
      'worldTiles', 'occupiedWorldTiles', 'worldTileMeta', 'realms', 'castleSlots',
      'castleSlotClaims', 'legacyPlayers', 'playersV2', 'playerOwnershipsV2',
      'castles', 'realmProfiles', 'markAccounts', 'snapBurnCredits',
      'walletAttributions', 'walletAttributionSnapshots', 'scanCursors',
      'scanBatches', 'alphaTermsAcceptances', 'allowedFids', 'enabledAllowedFids',
      'auditEntries', 'orphanedPlayerRowsV2', 'orphanedOwnershipRowsV2',
      'orphanedCastleClaims', 'orphanedCastles', 'orphanedRealmProfiles',
      'orphanedMarkAccounts', 'orphanedBurnCredits', 'orphanedTermsAcceptances',
      'founderStateGaps', 'markAccountInvariantViolations',
      'publicMarkProjectionViolations', 'duplicateBurnReferences',
      'burnAccountReconciliationViolations', 'ambiguousActiveWalletAddresses',
      'staticWorldDriftViolations', 'termsAcceptanceInvariantViolations',
      'protocolVersion', 'worldSeed', 'worldSeedName',
    ])
    expect(G001_MEMBER_STATUS_FIELDS).toEqual([
      'admissionState', 'authEpoch', 'requestState', 'requestCycle', 'requestedAtMicros',
    ])
    expect(G002_ADMIN_STATUS_FIELDS).toEqual([
      'realmId', 'databaseName', 'moduleIdentity', 'releaseVersion', 'launchState',
      'admissionsOpen', 'accessRequestsOpen', 'admittedPlayers', 'founders',
      'allowedFids', 'accessRequests', 'playersV1', 'playersV2', 'ownershipBindings',
      'castles', 'realmProfiles', 'termsAcceptances', 'markAccounts',
      'resourceAccounts', 'castleClaims', 'cellOccupancies', 'activationRows',
      'workerSystemRows', 'atlasImportMutationsEnabled',
      'atlasActivationMutationsEnabled', 'playerPresentationEnabled', 'atlasPresent',
      'atlasState', 'atlasReady', 'atlasCellRows', 'atlasSlotRows',
      'atlasResourceRows', 'present', 'atlasId', 'publicReleaseId',
      'publicApprovalReceiptId', 'sourceCommit', 'expectedReleaseSha256',
      'releaseHeaderSha256', 'state', 'importEpoch', 'verificationPhase',
      'verificationCursor', 'verificationDigest', 'expectedRegionCount',
      'expectedComponentCount', 'expectedChunkCount', 'expectedCellCount',
      'expectedSlotCount', 'expectedResourceNodeCount', 'verifiedComponentCount',
      'verifiedChunkCount', 'verifiedCellCount', 'verifiedSlotCount',
      'verifiedResourceNodeCount', 'componentExpectedCellCount',
      'componentExpectedSlotCount', 'componentExpectedResourceNodeCount',
      'importedPassableCellCount', 'regionManifestRows', 'componentRows', 'chunkRows',
      'cellRows', 'slotRows', 'resourceRows', 'claimRows', 'occupancyRows',
      'publicAtlasRows', 'publicRegionRows', 'importsExact', 'ready',
      'importMutationsCompiled', 'activationMutationsCompiled',
    ])
    expect(PTR_ADMIN_STATUS_FIELDS).toEqual([
      'present', 'atlasId', 'publicReleaseId', 'publicApprovalReceiptId',
      'sourceCommit', 'expectedReleaseSha256', 'releaseHeaderSha256', 'state',
      'importEpoch', 'verificationPhase', 'verificationCursor', 'verificationDigest',
      'expectedRegionCount', 'expectedComponentCount', 'expectedChunkCount',
      'expectedCellCount', 'expectedSlotCount', 'expectedResourceNodeCount',
      'verifiedComponentCount', 'verifiedChunkCount', 'verifiedCellCount',
      'verifiedSlotCount', 'verifiedResourceNodeCount', 'componentExpectedCellCount',
      'componentExpectedSlotCount', 'componentExpectedResourceNodeCount',
      'importedPassableCellCount', 'regionManifestRows', 'componentRows', 'chunkRows',
      'cellRows', 'slotRows', 'resourceRows', 'claimRows', 'occupancyRows',
      'activationRows', 'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
      'importsExact', 'ready', 'importMutationsCompiled', 'activationMutationsCompiled',
      'ownerProvisioned', 'ownerEnabled',
    ])
    expect(PTR_OWNER_STATUS_FIELDS).toEqual([
      'realmId', 'releaseVersion', 'moduleIdentity', 'ownerFid', 'authEpoch',
      'accessGranted', 'atlasReady', 'sessionExpiresAt',
    ])
  })

  it('parses canonical U256 losslessly and reverses its padded 32-byte little-endian wire magnitude', () => {
    expect(parseSpacetimeProgramHashResponse(bytes(programSql('0x102')))).toBe(
      `0201${'00'.repeat(30)}`,
    )
    expect(parseSpacetimeProgramHashResponse(bytes(programSql('0x0')))).toBe('00'.repeat(32))
  })

  it.each([
    '0x00', '0X1', '0x01', '0xg', `0x${'1'.repeat(65)}`, '1',
  ])('rejects noncanonical U256 quantity %s', (quantity) => {
    expect(() => parseSpacetimeProgramHashResponse(bytes(programSql(quantity)))).toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )
  })

  it('rejects duplicate JSON keys, extra statement fields, nonzero SQL mutation stats, and trailing values', () => {
    const duplicate = programSql().replace('"rows":', '"schema":{},"rows":')
    expect(() => parseSpacetimeProgramHashResponse(bytes(duplicate))).toThrow()
    const extra = programSql().replace('"rows":', '"extra":0,"rows":')
    expect(() => parseSpacetimeProgramHashResponse(bytes(extra))).toThrow()
    const mutation = programSql().replace('"rows_inserted":0', '"rows_inserted":1')
    expect(() => parseSpacetimeProgramHashResponse(bytes(mutation))).toThrow()
    expect(() => parseSpacetimeProgramHashResponse(bytes(`${programSql()}null`))).toThrow()
  })

  it('retains U64 row lexemes beyond IEEE-754 and numerically sorts canonical FIDs', () => {
    const raw = sqlStatement('fid', 'U64', [[42], [9_007_199_254_740_991], [7]])
    expect(parseSpacetimeFidResponse(bytes(raw))).toEqual(['7', '42', '9007199254740991'])
  })

  it.each(['0', '01', '-1', '9007199254740992'])('rejects invalid FID lexeme %s', (fid) => {
    const raw = sqlStatement('fid', 'U64', [[1]]).replace('[[1]]', `[[${fid}]]`)
    expect(() => parseSpacetimeFidResponse(bytes(raw))).toThrow()
  })

  it('rejects unsigned integer lexemes above 20 digits before constructing a BigInt', () => {
    const nativeBigInt = globalThis.BigInt
    let attemptedOversizedBigInt = false
    vi.stubGlobal('BigInt', (value: string | number | bigint | boolean) => {
      if (typeof value === 'string' && value.length > 20) attemptedOversizedBigInt = true
      return nativeBigInt(value)
    })
    try {
      const huge = '9'.repeat(1_000)
      const raw = sqlStatement('fid', 'U64', [[1]])
        .replace('"total_duration_micros":17', `"total_duration_micros":${huge}`)
      expect(() => parseSpacetimeFidResponse(bytes(raw))).toThrow(
        'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
      )
      expect(attemptedOversizedBigInt).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Spacetime release-recovery resolution', () => {
  it('executes the fixed N+14 transcript with exact authenticated requests and returns no raw identity', async () => {
    const transport = successfulFetcher()
    const result = await resolver(transport.fetcher).resolve()

    expect(transport.seen).toHaveLength(15)
    expect(transport.maximumActive()).toBeLessThanOrEqual(3)
    expect(transport.active()).toBe(0)
    expect(result.g001).toMatchObject({
      databaseIdentity: G001,
      programKeccak256: `0201${'00'.repeat(30)}`,
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      playerAccessEnabled: true,
      admissionStateMutationsEnabled: false,
      accessRequestSubmissionsEnabled: false,
      admittedPlayerCount: 1,
      enabledPlayerCount: 1,
      censusStable: true,
    })
    expect(result.g002).toMatchObject({
      databaseIdentity: G002,
      realmId: 'GENESIS_002',
      sealed: true,
      playerCount: 0,
      generalAdmissionCount: 0,
      populationGuardPassed: true,
    })
    expect(result.ptr).toMatchObject({
      databaseIdentity: PTR,
      realmId: 'PTR',
      singletonOwnerCount: 1,
      ownerEnabled: true,
      generalAdmissionCount: 0,
    })
    expect(Object.keys(result.upstreamResponseDigests)).toHaveLength(11)
    expect(Object.values(result.upstreamResponseDigests)).toSatisfy(
      (values: string[]) => values.every(value => /^[0-9a-f]{64}$/.test(value)),
    )
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/"(?:fid|ownerFid|authEpoch)"/u)
    expect(serialized).not.toContain(`"${CANARY_FID}"`)
    expect(serialized).not.toContain('opaque-private-token')
    expect(serialized).not.toContain(programSql())

    for (const { url, init } of transport.seen) {
      expect(init.method).toBe('POST')
      expect(init.redirect).toBe('manual')
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(new URL(url).origin).toBe('https://maincloud.spacetimedb.com')
      const headers = new Headers(init.headers)
      expect([...headers.keys()].sort()).toEqual([
        'accept', 'authorization', 'cache-control', 'content-type',
      ])
      expect(headers.get('authorization')).toBe('Bearer opaque-private-token')
      expect(headers.get('accept')).toBe('application/json')
      expect(headers.get('cache-control')).toBe('no-store')
      expect(headers.get('content-type')).toBe(
        url.includes('/sql?') ? 'text/plain; charset=utf-8' : 'application/json',
      )
    }
    expect(transport.seen.slice(0, 3).map(entry => entry.url)).toEqual([
      `https://maincloud.spacetimedb.com/v1/database/${G001}/sql?confirmed=true`,
      `https://maincloud.spacetimedb.com/v1/database/${G002}/sql?confirmed=true`,
      `https://maincloud.spacetimedb.com/v1/database/${PTR}/sql?confirmed=true`,
    ])
    expect(transport.seen.slice(-3).map(entry => entry.url)).toEqual(
      transport.seen.slice(0, 3).map(entry => entry.url),
    )
    expect(transport.seen.map(entry => [new URL(entry.url).pathname.split('/').at(-1), entry.init.body])).toEqual([
      ['sql', 'SELECT program_hash FROM st_module'],
      ['sql', 'SELECT program_hash FROM st_module'],
      ['sql', 'SELECT program_hash FROM st_module'],
      ['genesis_001_access_policy_v1', '[]'],
      ['admin_get_alpha_status_v3', '[]'],
      ['sql', 'SELECT fid FROM player_v2'],
      ['admin_get_access_request_admission_status_v1', '[42]'],
      ['sql', 'SELECT fid FROM player_v2'],
      ['admin_get_alpha_status_v3', '[]'],
      ['admin_get_greater_realm_status_v1', '[]'],
      ['admin_get_greater_realm_status_v1', '[]'],
      ['get_ptr_owner_status_v1', '[]'],
      ['sql', 'SELECT program_hash FROM st_module'],
      ['sql', 'SELECT program_hash FROM st_module'],
      ['sql', 'SELECT program_hash FROM st_module'],
    ])
    expect(transport.seen.filter(entry => entry.init.body === 'SELECT fid FROM player_v2')).toHaveLength(2)
    expect(transport.seen.find(entry => entry.url.endsWith('/call/admin_get_access_request_admission_status_v1'))?.init.body).toBe('[42]')
  })

  it('binds every one of the 11 upstream digest inputs to its specified raw or canonical transcript', async () => {
    const baseline = await resolver(successfulFetcher().fetcher).resolve()
    const rawCases = [
      ['programIdentityBeforeTranscriptHmacSha256', 'program-before'],
      ['g001PolicyResponseHmacSha256', 'policy'],
      ['g001AlphaBeforeResponseHmacSha256', 'alpha-before'],
      ['g001PlayerEnumerationBeforeResponseHmacSha256', 'fid-before'],
      ['g001PlayerEnumerationAfterResponseHmacSha256', 'fid-after'],
      ['g001AlphaAfterResponseHmacSha256', 'alpha-after'],
      ['g002StatusResponseHmacSha256', 'g002'],
      ['ptrAdminStatusResponseHmacSha256', 'ptr-admin'],
      ['ptrOwnerStatusResponseHmacSha256', 'ptr-owner'],
      ['programIdentityAfterTranscriptHmacSha256', 'program-after'],
    ] as const
    for (const [field, target] of rawCases) {
      const base = successfulFetcher()
      let programReads = 0
      let alphaReads = 0
      let fidReads = 0
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        const body = String(init?.body)
        if (body === 'SELECT program_hash FROM st_module') programReads += 1
        if (url.endsWith('/call/admin_get_alpha_status_v3')) alphaReads += 1
        if (body === 'SELECT fid FROM player_v2') fidReads += 1
        const programOrdinal = programReads
        const alphaOrdinal = alphaReads
        const fidOrdinal = fidReads
        const original = await base.fetcher(input, init)
        const shouldMutate = (target === 'program-before' && programOrdinal === 1)
          || (target === 'policy' && url.endsWith('/call/genesis_001_access_policy_v1'))
          || (target === 'alpha-before' && alphaOrdinal === 1)
          || (target === 'fid-before' && fidOrdinal === 1)
          || (target === 'fid-after' && fidOrdinal === 2)
          || (target === 'alpha-after' && alphaOrdinal === 2)
          || (target === 'g002' && url.includes(`/${G002}/call/admin_get_greater_realm_status_v1`))
          || (target === 'ptr-admin' && url.includes(`/${PTR}/call/admin_get_greater_realm_status_v1`))
          || (target === 'ptr-owner' && url.endsWith('/call/get_ptr_owner_status_v1'))
          || (target === 'program-after' && programOrdinal === 4)
        return response(url, `${await original.text()}${shouldMutate ? ' ' : ''}`)
      }
      const mutated = await resolver(fetcher).resolve()
      expect(mutated.upstreamResponseDigests[field], field).not.toBe(
        baseline.upstreamResponseDigests[field],
      )
    }

    const whitespaceBase = successfulFetcher()
    const memberWhitespace = async (input: RequestInfo | URL, init?: RequestInit) => {
      const original = await whitespaceBase.fetcher(input, init)
      const suffix = input.toString().endsWith('/call/admin_get_access_request_admission_status_v1') ? ' ' : ''
      return response(input.toString(), `${await original.text()}${suffix}`)
    }
    const whitespaceResult = await resolver(memberWhitespace).resolve()
    expect(whitespaceResult.upstreamResponseDigests.g001AdmissionStatusesResponseHmacSha256).toBe(
      baseline.upstreamResponseDigests.g001AdmissionStatusesResponseHmacSha256,
    )

    const semanticBase = successfulFetcher()
    const changedMember = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/call/admin_get_access_request_admission_status_v1')) {
        return response(url, JSON.stringify(memberStatus(8)))
      }
      if (url.endsWith('/call/get_ptr_owner_status_v1')) {
        return response(url, JSON.stringify(ptrOwnerStatus(8)))
      }
      return semanticBase.fetcher(input, init)
    }
    const changedMemberResult = await resolver(changedMember).resolve()
    expect(changedMemberResult.upstreamResponseDigests.g001AdmissionStatusesResponseHmacSha256).not.toBe(
      baseline.upstreamResponseDigests.g001AdmissionStatusesResponseHmacSha256,
    )
  })

  it('matches an independent exact HMAC encoder for all five stable and 11 upstream commitments', async () => {
    const result = await resolver(successfulFetcher().fetcher).resolve()
    const rawProgram = programSql()
    const rawPolicy = JSON.stringify(policyStatus())
    const rawAlpha = JSON.stringify(alphaStatus())
    const rawFids = fidSql()
    const rawMember = JSON.stringify(memberStatus())
    const rawG002 = JSON.stringify(g002Status())
    const rawPtrAdmin = JSON.stringify(ptrAdminStatus())
    const rawPtrOwner = JSON.stringify(ptrOwnerStatus())
    const programTranscript = referenceConcat([
      referenceFrame(bytes('GENESIS_001')), referenceFrame(bytes(G001)), referenceFrame(bytes(rawProgram)),
      referenceFrame(bytes('GENESIS_002')), referenceFrame(bytes(G002)), referenceFrame(bytes(rawProgram)),
      referenceFrame(bytes('PTR')), referenceFrame(bytes(PTR)), referenceFrame(bytes(rawProgram)),
    ])
    const memberProjection = {
      admissionState: 'enabled',
      authEpoch: '7',
      requestState: 'not_requested',
      requestCycle: null,
      requestedAtMicros: null,
    }
    const rawMemberHmac = await referenceHmac(
      'warpkeep.release-recovery.realm-observation.response.g001-admission-status-member.v1\n',
      referenceConcat([
        referenceFrame(bytes(CANARY_FID)),
        referenceFrame(bytes(JSON.stringify(memberProjection))),
      ]),
    )
    const memberAggregate = referenceConcat([
      referenceU32(1),
      referenceFrame(bytes(CANARY_FID)),
      referenceFrame(rawMemberHmac.bytes),
    ])
    const alphaInvariant = {
      worldTiles: '10000',
      occupiedWorldTiles: '1',
      worldTileMeta: '10000',
      realms: '1',
      castleSlots: '100',
      castleSlotClaims: '1',
      legacyPlayers: '0',
      playersV2: '1',
      playerOwnershipsV2: '1',
      castles: '1',
      realmProfiles: '1',
      markAccounts: '1',
      allowedFids: '1',
      enabledAllowedFids: '1',
      orphanedPlayerRowsV2: '0',
      orphanedOwnershipRowsV2: '0',
      orphanedCastleClaims: '0',
      orphanedCastles: '0',
      orphanedRealmProfiles: '0',
      orphanedMarkAccounts: '0',
      orphanedBurnCredits: '0',
      orphanedTermsAcceptances: '0',
      founderStateGaps: '0',
      markAccountInvariantViolations: '0',
      publicMarkProjectionViolations: '0',
      duplicateBurnReferences: '0',
      burnAccountReconciliationViolations: '0',
      ambiguousActiveWalletAddresses: '0',
      staticWorldDriftViolations: '0',
      termsAcceptanceInvariantViolations: '0',
      protocolVersion: '3',
      worldSeed: '3445214658',
      worldSeedName: 'HEGEMONY_GENESIS_001',
    }
    const g002Projection = referenceAtlasProduct(G002_ADMIN_STATUS_FIELDS, g002Status(), true)
    const ptrProjection = referenceAtlasProduct(PTR_ADMIN_STATUS_FIELDS, ptrAdminStatus(), false)
    const ptrOwnerProjection = {
      realmId: 'PTR',
      releaseVersion: '0.4.0-ptr.1',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      ownerFid: CANARY_FID,
      authEpoch: '7',
      accessGranted: true,
      atlasReady: true,
    }
    const stableExpected = {
      census: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.g001-census.v1\n',
        bytes(JSON.stringify([{ fid: CANARY_FID, authEpoch: '7' }])),
      )).hex,
      alpha: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.g001-alpha-invariant.v1\n',
        bytes(JSON.stringify(alphaInvariant)),
      )).hex,
      g002: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.g002-sealed-state.v1\n',
        bytes(JSON.stringify(g002Projection)),
      )).hex,
      ptr: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.ptr-sealed-state.v1\n',
        bytes(JSON.stringify(ptrProjection)),
      )).hex,
      ptrOwner: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.ptr-owner-invariant.v1\n',
        bytes(JSON.stringify(ptrOwnerProjection)),
      )).hex,
    }
    expect({
      census: result.g001.admittedPlayerCensusHmacSha256,
      alpha: result.g001.alphaInvariantHmacSha256,
      g002: result.g002.sealedStateHmacSha256,
      ptr: result.ptr.sealedStateHmacSha256,
      ptrOwner: result.ptr.ownerInvariantHmacSha256,
    }).toEqual(stableExpected)

    const upstreamExpected = {
      programIdentityBeforeTranscriptHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.program-identity-before.v1\n',
        programTranscript,
      )).hex,
      g001PolicyResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-policy.v1\n', bytes(rawPolicy),
      )).hex,
      g001AlphaBeforeResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-alpha-before.v1\n', bytes(rawAlpha),
      )).hex,
      g001PlayerEnumerationBeforeResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-enumeration-before.v1\n', bytes(rawFids),
      )).hex,
      g001AdmissionStatusesResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-admission-statuses.v1\n', memberAggregate,
      )).hex,
      g001PlayerEnumerationAfterResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-enumeration-after.v1\n', bytes(rawFids),
      )).hex,
      g001AlphaAfterResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g001-alpha-after.v1\n', bytes(rawAlpha),
      )).hex,
      g002StatusResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.g002-status.v1\n', bytes(rawG002),
      )).hex,
      ptrAdminStatusResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.ptr-admin-status.v1\n', bytes(rawPtrAdmin),
      )).hex,
      ptrOwnerStatusResponseHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.ptr-owner-status.v1\n', bytes(rawPtrOwner),
      )).hex,
      programIdentityAfterTranscriptHmacSha256: (await referenceHmac(
        'warpkeep.release-recovery.realm-observation.response.program-identity-after.v1\n',
        programTranscript,
      )).hex,
    }
    expect(result.upstreamResponseDigests).toEqual(upstreamExpected)
  })

  it('mints one fresh realm-scoped token per request and binds only the PTR owner token to the canary epoch', async () => {
    const claims: Array<Record<string, unknown>> = []
    const transport = successfulFetcher()
    const result = await new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: transport.fetcher,
      signer: async (_bridgeConfig, value) => {
        claims.push(value as unknown as Record<string, unknown>)
        return `private-token-${claims.length}`
      },
      clockMilliseconds: () => 100,
      clockSeconds: () => 1_900_000_000,
    }).resolve()
    expect(claims).toHaveLength(15)
    expect(claims.map(value => value.aud)).toEqual([
      ['warpkeep-spacetimedb'],
      ['warpkeep-genesis-002-spacetimedb'],
      ['warpkeep-ptr-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-genesis-002-spacetimedb'],
      ['warpkeep-ptr-spacetimedb'],
      ['warpkeep-ptr-spacetimedb'],
      ['warpkeep-spacetimedb'],
      ['warpkeep-genesis-002-spacetimedb'],
      ['warpkeep-ptr-spacetimedb'],
    ])
    expect(claims.slice(0, 11).every(value => !Object.hasOwn(value, 'fid'))).toBe(true)
    expect(claims[11]).toMatchObject({
      fid: CANARY_FID,
      auth_epoch: 7,
      realm_id: 'PTR',
      ptr_database_identity: PTR,
      roles: ['warpkeep-ptr-owner'],
    })
    expect(claims.slice(12).every(value => !Object.hasOwn(value, 'fid'))).toBe(true)
    expect(transport.seen.map(entry => new Headers(entry.init.headers).get('authorization'))).toEqual(
      Array.from({ length: 15 }, (_, index) => `Bearer private-token-${index + 1}`),
    )
    expect(JSON.stringify(result)).not.toContain('private-token-')
  })

  it('caps the 100-member pool at six and the whole transcript at 114 requests', async () => {
    const fids = Array.from({ length: 100 }, (_, index) => index + 1)
    fids[41] = 42
    const transport = successfulFetcher(fids, true)
    const result = await resolver(transport.fetcher).resolve()
    expect(transport.seen).toHaveLength(RELEASE_RECOVERY_MAXIMUM_REQUESTS)
    expect(transport.maximumActive()).toBe(6)
    expect(result.g001.admittedPlayerCount).toBe(100)
  })

  it.each<readonly [string, (_url: string) => {
    status?: number
    headers?: HeadersInit
    finalUrl?: string
  }]>([
    ['redirect', (_url: string) => ({ status: 302 })],
    ['wrong media', (_url: string) => ({ headers: { 'content-type': 'text/plain' } })],
    ['wrong final URL', (_url: string) => ({ finalUrl: 'https://other.example/' })],
  ])('fails closed on %s without leaking upstream detail', async (_name, mutation) => {
    const base = successfulFetcher()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const original = await base.fetcher(input, init)
      const changed = mutation(input.toString())
      const result = new Response(await original.text(), {
        status: changed.status ?? original.status,
        headers: changed.headers ?? original.headers,
      })
      Object.defineProperty(result, 'url', { value: changed.finalUrl ?? input.toString() })
      return result
    }
    const error = await resolver(fetcher).resolve().catch(value => value)
    expect(error).toBeInstanceOf(SpacetimeReleaseRecoveryResolverFailure)
    expect(error).toMatchObject({
      name: 'SpacetimeReleaseRecoveryResolverFailure',
      message: 'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    })
    expect(JSON.stringify(error)).not.toContain('other.example')
  })

  it('does not await a never-settling invalid-response body cancellation and still cleans timers', async () => {
    let finishCancellation!: () => void
    const cancellationFinished = new Promise<void>(resolve => { finishCancellation = resolve })
    let notifyCancellationStarted!: () => void
    const cancellationStarted = new Promise<void>(resolve => { notifyCancellationStarted = resolve })
    const cancelledTimers: boolean[] = []
    const timerFactory = (): ReleaseRecoveryTimer => {
      const controller = new AbortController()
      let cancelled = false
      cancelledTimers.push(cancelled)
      const index = cancelledTimers.length - 1
      return Object.freeze({
        signal: controller.signal,
        fired: () => false,
        cancel: () => { cancelled = true; cancelledTimers[index] = cancelled },
      })
    }
    const fetcher = async (input: RequestInfo | URL) => {
      const result = new Response(new ReadableStream<Uint8Array>({
        cancel() {
          notifyCancellationStarted()
          return cancellationFinished
        },
      }), { status: 503, headers: { 'content-type': 'application/json' } })
      Object.defineProperty(result, 'url', { value: input.toString() })
      return result
    }
    const operation = new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher,
      signer: async () => 'token',
      clockMilliseconds: () => 100,
      clockSeconds: () => 10,
      timerFactory,
    }).resolve()
    await cancellationStarted
    const outcome = await Promise.race([
      operation.then(() => 'resolved', () => 'rejected'),
      new Promise<'stalled'>(resolve => setTimeout(() => resolve('stalled'), 25)),
    ])
    finishCancellation()
    await operation.catch(() => undefined)
    expect(outcome).toBe('rejected')
    expect(cancelledTimers.every(Boolean)).toBe(true)
  })

  it('rejects changed census membership and changed stable alpha invariants', async () => {
    let fidReads = 0
    const base = successfulFetcher()
    const changedCensus = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body === 'SELECT fid FROM player_v2' && ++fidReads === 2) {
        return response(input.toString(), fidSql([43]))
      }
      return base.fetcher(input, init)
    }
    await expect(resolver(changedCensus).resolve()).rejects.toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )

    let alphaReads = 0
    const changedAlpha = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith('/call/admin_get_alpha_status_v3') && ++alphaReads === 2) {
        const changed = alphaStatus()
        changed[0] = 9_999
        return response(input.toString(), JSON.stringify(changed))
      }
      return successfulFetcher().fetcher(input, init)
    }
    await expect(resolver(changedAlpha).resolve()).rejects.toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )
  })

  it('rejects a changed after-program identity and a census missing the fixed canary', async () => {
    let programReads = 0
    const base = successfulFetcher()
    const changedProgram = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body === 'SELECT program_hash FROM st_module' && ++programReads === 4) {
        return response(input.toString(), programSql('0x103'))
      }
      return base.fetcher(input, init)
    }
    await expect(resolver(changedProgram).resolve()).rejects.toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )

    const missingCanary = successfulFetcher([7])
    await expect(resolver(missingCanary.fetcher).resolve()).rejects.toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )
  })

  it('rejects a malformed value independently at every position of all six fixed products', async () => {
    const cases: readonly Readonly<{
      fields: readonly string[]
      fixture(): unknown[]
      matches(url: string): boolean
    }>[] = [
      {
        fields: G001_POLICY_FIELDS,
        fixture: policyStatus,
        matches: url => url.endsWith('/call/genesis_001_access_policy_v1'),
      },
      {
        fields: G001_ALPHA_STATUS_FIELDS,
        fixture: alphaStatus,
        matches: url => url.endsWith('/call/admin_get_alpha_status_v3'),
      },
      {
        fields: G001_MEMBER_STATUS_FIELDS,
        fixture: memberStatus,
        matches: url => url.endsWith('/call/admin_get_access_request_admission_status_v1'),
      },
      {
        fields: G002_ADMIN_STATUS_FIELDS,
        fixture: g002Status,
        matches: url => url.includes(`/${G002}/call/admin_get_greater_realm_status_v1`),
      },
      {
        fields: PTR_ADMIN_STATUS_FIELDS,
        fixture: ptrAdminStatus,
        matches: url => url.includes(`/${PTR}/call/admin_get_greater_realm_status_v1`),
      },
      {
        fields: PTR_OWNER_STATUS_FIELDS,
        fixture: ptrOwnerStatus,
        matches: url => url.endsWith('/call/get_ptr_owner_status_v1'),
      },
    ]
    for (const productCase of cases) {
      for (let index = 0; index < productCase.fields.length; index += 1) {
        const base = successfulFetcher()
        const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input.toString()
          if (productCase.matches(url)) {
            const mutated = productCase.fixture()
            mutated[index] = null
            return response(url, JSON.stringify(mutated))
          }
          return base.fetcher(input, init)
        }
        await expect(resolver(fetcher).resolve(), `${productCase.fields[index]} at ${index}`).rejects.toThrow(
          'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
        )
      }
    }
  })

  it('rejects a disabled census member, a zero requested-at timestamp, nonempty G002, and a non-singleton PTR owner', async () => {
    const cases = [
      (url: string) => url.endsWith('/call/admin_get_access_request_admission_status_v1')
        ? JSON.stringify(['disabled', 7, 'not_requested', [1, []], [1, []]])
        : undefined,
      (url: string) => url.endsWith('/call/admin_get_access_request_admission_status_v1')
        ? JSON.stringify(['enabled', 7, 'resolved', [0, 7], [0, 0]])
        : undefined,
      (url: string) => url.includes(`/${G002}/call/admin_get_greater_realm_status_v1`)
        ? JSON.stringify(Object.assign(g002Status(), { 12: 1 }))
        : undefined,
      (url: string) => url.includes(`/${PTR}/call/admin_get_greater_realm_status_v1`)
        ? JSON.stringify(Object.assign(ptrAdminStatus(), { 44: false }))
        : undefined,
    ]
    for (const mutate of cases) {
      const base = successfulFetcher()
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = mutate(input.toString())
        return raw === undefined ? base.fetcher(input, init) : response(input.toString(), raw)
      }
      await expect(resolver(fetcher).resolve()).rejects.toThrow(
        'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
      )
    }
  })

  it('enforces per-body and aggregate response caps with fatal UTF-8', async () => {
    const base = successfulFetcher()
    const oversized = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith('/call/genesis_001_access_policy_v1')) {
        return response(input.toString(), 'x'.repeat(4_097))
      }
      return base.fetcher(input, init)
    }
    await expect(resolver(oversized).resolve()).rejects.toThrow()

    const invalidUtf8 = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith('/call/genesis_001_access_policy_v1')) {
        const result = new Response(Uint8Array.of(0xc3, 0x28), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
        Object.defineProperty(result, 'url', { value: input.toString() })
        return result
      }
      return base.fetcher(input, init)
    }
    await expect(resolver(invalidUtf8).resolve()).rejects.toThrow()
    expect(RELEASE_RECOVERY_AGGREGATE_RESPONSE_BYTES).toBe(12 * 1024 * 1024)
  })

  it('rejects incomplete and contradictory content-length bodies', async () => {
    for (const declaredLength of ['1', '4096']) {
      const base = successfulFetcher()
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString().endsWith('/call/genesis_001_access_policy_v1')) {
          const raw = JSON.stringify(policyStatus())
          return response(input.toString(), raw, {
            headers: {
              'content-type': 'application/json',
              'content-length': declaredLength,
            },
          })
        }
        return base.fetcher(input, init)
      }
      await expect(resolver(fetcher).resolve()).rejects.toThrow(
        'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
      )
    }
  })

  it('uses one 75-second context timer, min(4s, remaining) request timers, and cancels every timer', async () => {
    const created: Array<ReleaseRecoveryTimer & {
      milliseconds: number
      cancelled: boolean
      fire(): void
    }> = []
    const timerFactory = (milliseconds: number) => {
      const controller = new AbortController()
      let didFire = false
      let cancelled = false
      const timer = {
        milliseconds,
        signal: controller.signal,
        fired: () => didFire,
        cancel: () => { cancelled = true },
        fire: () => { didFire = true; controller.abort() },
        get cancelled() { return cancelled },
      }
      created.push(timer)
      return timer
    }
    const transport = successfulFetcher()
    await new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: transport.fetcher,
      signer: async () => 'token',
      clockMilliseconds: () => 100,
      clockSeconds: () => 10,
      timerFactory,
    }).resolve()
    expect(created[0]?.milliseconds).toBe(RELEASE_RECOVERY_OVERALL_TIMEOUT_MS)
    expect(created.slice(1).every(timer => timer.milliseconds === 4_000)).toBe(true)
    expect(created.every(timer => timer.cancelled)).toBe(true)
  })

  it('uses an externally owned absolute request context without creating or cancelling a second overall timer', async () => {
    const created: Array<ReleaseRecoveryTimer & { milliseconds: number; cancelled: boolean }> = []
    const timerFactory = (milliseconds: number): ReleaseRecoveryTimer => {
      const controller = new AbortController()
      let cancelled = false
      const timer = {
        milliseconds,
        signal: controller.signal,
        fired: () => false,
        cancel: () => { cancelled = true },
        get cancelled() { return cancelled },
      }
      created.push(timer)
      return timer
    }
    const externalController = new AbortController()
    const requestContext: ReleaseRecoveryRequestContext = Object.freeze({
      signal: externalController.signal,
      deadlineMilliseconds: 75_100,
      clockMilliseconds: () => 100,
      fired: () => false,
    })
    const transport = successfulFetcher()
    await new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: transport.fetcher,
      signer: async () => 'token',
      clockSeconds: () => 10,
      timerFactory,
      requestContext,
    }).resolve()
    expect(created).toHaveLength(15)
    expect(created.every(timer => timer.milliseconds === 4_000)).toBe(true)
    expect(created.every(timer => timer.cancelled)).toBe(true)
    expect(externalController.signal.aborted).toBe(false)
  })

  it('uses the external remaining duration and rejects timer-fired or I/O-updated late success', async () => {
    const createdDurations: number[] = []
    const timerFactory = (milliseconds: number): ReleaseRecoveryTimer => {
      createdDurations.push(milliseconds)
      const controller = new AbortController()
      return Object.freeze({ signal: controller.signal, fired: () => false, cancel: () => undefined })
    }
    const externalController = new AbortController()
    const nearDeadline = Object.freeze({
      signal: externalController.signal,
      deadlineMilliseconds: 3_600,
      clockMilliseconds: () => 100,
      fired: () => false,
    })
    await new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: successfulFetcher().fetcher,
      signer: async () => 'token',
      clockSeconds: () => 10,
      timerFactory,
      requestContext: nearDeadline,
    }).resolve()
    expect(createdDurations).toHaveLength(15)
    expect(createdDurations.every(milliseconds => milliseconds === 3_500)).toBe(true)

    let lateClock = 100
    const lateTransport = successfulFetcher()
    const lateFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const result = await lateTransport.fetcher(input, init)
      lateClock = 75_100
      return result
    }
    await expect(new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: lateFetcher,
      signer: async () => 'token',
      clockSeconds: () => 10,
      requestContext: Object.freeze({
        signal: new AbortController().signal,
        deadlineMilliseconds: 75_100,
        clockMilliseconds: () => lateClock,
        fired: () => false,
      }),
    }).resolve()).rejects.toThrow('SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED')
    expect(lateTransport.seen).toHaveLength(3)

    let didFire = false
    const firedController = new AbortController()
    const firedTransport = successfulFetcher()
    const firedFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const result = await firedTransport.fetcher(input, init)
      didFire = true
      firedController.abort()
      return result
    }
    await expect(new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: firedFetcher,
      signer: async () => 'token',
      clockSeconds: () => 10,
      requestContext: Object.freeze({
        signal: firedController.signal,
        deadlineMilliseconds: 75_100,
        clockMilliseconds: () => 100,
        fired: () => didFire,
      }),
    }).resolve()).rejects.toThrow('SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED')
    expect(firedTransport.seen).toHaveLength(3)
  })

  it('rejects an internally owned overall timer firing while final stable HMACs are in flight', async () => {
    const timers: Array<ReleaseRecoveryTimer & {
      fire(): void
      cancelled: boolean
    }> = []
    const timerFactory = (): ReleaseRecoveryTimer => {
      const controller = new AbortController()
      let didFire = false
      let cancelled = false
      const timer = {
        signal: controller.signal,
        fired: () => didFire,
        cancel: () => { cancelled = true },
        fire: () => { didFire = true; controller.abort() },
        get cancelled() { return cancelled },
      }
      timers.push(timer)
      return timer
    }
    let notifyStableHmacStarted!: () => void
    const stableHmacStarted = new Promise<void>(resolve => { notifyStableHmacStarted = resolve })
    let releaseStableHmac!: () => void
    const stableHmacRelease = new Promise<void>(resolve => { releaseStableHmac = resolve })
    const originalSign = crypto.subtle.sign.bind(crypto.subtle)
    const signSpy = vi.spyOn(crypto.subtle, 'sign').mockImplementation(async (algorithm, key, data) => {
      if (new TextDecoder().decode(data).includes('g001-census.v1')) {
        notifyStableHmacStarted()
        await stableHmacRelease
      }
      return originalSign(algorithm, key, data)
    })
    const operation = new SpacetimeReleaseRecoveryResolver(config(), {
      fetcher: successfulFetcher().fetcher,
      signer: async () => 'token',
      clockMilliseconds: () => 100,
      clockSeconds: () => 10,
      timerFactory,
    }).resolve()
    try {
      await stableHmacStarted
      timers[0]!.fire()
      releaseStableHmac()
      await expect(operation).rejects.toThrow('SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED')
      expect(timers.every(timer => timer.cancelled)).toBe(true)
    } finally {
      releaseStableHmac()
      signSpy.mockRestore()
    }
  })

  it('erases transient streamed-body chunks and HMAC result buffers after success', async () => {
    const streamedChunks: Uint8Array[] = []
    const base = successfulFetcher()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (!url.endsWith('/call/genesis_001_access_policy_v1')) return base.fetcher(input, init)
      const chunk = bytes(JSON.stringify(policyStatus()))
      streamedChunks.push(chunk)
      const result = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk)
          controller.close()
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      Object.defineProperty(result, 'url', { value: url })
      return result
    }
    const signedBuffers: ArrayBuffer[] = []
    const originalSign = crypto.subtle.sign.bind(crypto.subtle)
    const signSpy = vi.spyOn(crypto.subtle, 'sign').mockImplementation(async (algorithm, key, data) => {
      const result = await originalSign(algorithm, key, data)
      signedBuffers.push(result)
      return result
    })
    try {
      await resolver(fetcher).resolve()
    } finally {
      signSpy.mockRestore()
    }
    expect(streamedChunks).not.toHaveLength(0)
    expect(streamedChunks.every(chunk => chunk.every(byte => byte === 0))).toBe(true)
    expect(signedBuffers.length).toBeGreaterThan(10)
    expect(signedBuffers.every(buffer => new Uint8Array(buffer).every(byte => byte === 0))).toBe(true)
  })

  it('erases both streamed chunks and the assembled raw response when parsing fails', async () => {
    const marker = 'PRIVATE_RAW_BODY_MARKER'
    const chunk = bytes(JSON.stringify([marker]))
    let markedFillCalls = 0
    const originalFill = Uint8Array.prototype.fill
    const fillSpy = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
      this: Uint8Array,
      value: number,
      start?: number,
      end?: number,
    ) {
      if (new TextDecoder().decode(this).includes(marker)) markedFillCalls += 1
      return originalFill.call(this, value, start, end)
    })
    const base = successfulFetcher()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (!url.endsWith('/call/genesis_001_access_policy_v1')) return base.fetcher(input, init)
      const result = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk)
          controller.close()
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      Object.defineProperty(result, 'url', { value: url })
      return result
    }
    try {
      await expect(resolver(fetcher).resolve()).rejects.toThrow(
        'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
      )
    } finally {
      fillSpy.mockRestore()
    }
    expect(chunk.every(byte => byte === 0)).toBe(true)
    expect(markedFillCalls).toBeGreaterThanOrEqual(2)
  })

  it('erases the current unaccumulated stream chunk when a per-body limit fails', async () => {
    const oversizedChunk = new Uint8Array(4_097).fill(0x5a)
    let notifyCancelStarted!: () => void
    const cancelStarted = new Promise<void>(resolve => { notifyCancelStarted = resolve })
    let finishCancel!: () => void
    const cancelFinished = new Promise<void>(resolve => { finishCancel = resolve })
    const base = successfulFetcher()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (!url.endsWith('/call/genesis_001_access_policy_v1')) return base.fetcher(input, init)
      const result = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(oversizedChunk)
        },
        cancel() {
          notifyCancelStarted()
          return cancelFinished
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      Object.defineProperty(result, 'url', { value: url })
      return result
    }
    const operation = resolver(fetcher).resolve()
    await cancelStarted
    const erasedBeforeCancelSettled = oversizedChunk.every(byte => byte === 0)
    const outcome = await Promise.race([
      operation.then(() => 'resolved', () => 'rejected'),
      new Promise<'stalled'>(resolve => setTimeout(() => resolve('stalled'), 25)),
    ])
    finishCancel()
    await expect(operation).rejects.toThrow(
      'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    )
    expect(erasedBeforeCancelSettled).toBe(true)
    expect(outcome).toBe('rejected')
  })

  it('erases every framed raw-program copy after authenticating both program transcripts', async () => {
    const rawProgram = programSql()
    const rawProgramBytes = bytes(rawProgram)
    let erasedRawFrames = 0
    const originalFill = Uint8Array.prototype.fill
    const fillSpy = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
      this: Uint8Array,
      value: number,
      start?: number,
      end?: number,
    ) {
      if (
        value === 0
        && this.byteLength === rawProgramBytes.byteLength + 8
        && new TextDecoder().decode(this.subarray(8)) === rawProgram
      ) erasedRawFrames += 1
      return originalFill.call(this, value, start, end)
    })
    try {
      await resolver(successfulFetcher().fetcher).resolve()
    } finally {
      fillSpy.mockRestore()
    }
    expect(erasedRawFrames).toBe(6)
  })

  it('erases already-produced member HMAC bytes when a later pooled member fails', async () => {
    const fids = [1, 2, 3, 4, 5, 42, 7, 8]
    const base = successfulFetcher(fids)
    let releaseFailure!: () => void
    const memberDigestProduced = new Promise<void>(resolve => { releaseFailure = resolve })
    const memberHmacBuffers: ArrayBuffer[] = []
    const originalSign = crypto.subtle.sign.bind(crypto.subtle)
    const signSpy = vi.spyOn(crypto.subtle, 'sign').mockImplementation(async (algorithm, key, data) => {
      const isMemberHmac = new TextDecoder().decode(data)
        .includes('g001-admission-status-member.v1')
      const result = await originalSign(algorithm, key, data)
      if (isMemberHmac) {
        memberHmacBuffers.push(result)
        releaseFailure()
      }
      return result
    })
    const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = input.toString()
      if (!url.endsWith('/call/admin_get_access_request_admission_status_v1')) {
        return base.fetcher(input, init)
      }
      const body = String(init.body)
      if (body === '[1]') return response(url, JSON.stringify(memberStatus()))
      if (body === '[3]') {
        await memberDigestProduced
        throw new Error('private later-member failure')
      }
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new Error('private member abort'))
        if (init.signal?.aborted) abort()
        else init.signal?.addEventListener('abort', abort, { once: true })
      })
    }
    try {
      await expect(resolver(fetcher).resolve()).rejects.toThrow(
        'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
      )
    } finally {
      signSpy.mockRestore()
    }
    expect(memberHmacBuffers).not.toHaveLength(0)
    expect(memberHmacBuffers.every(buffer => new Uint8Array(buffer).every(byte => byte === 0))).toBe(true)
  })

  it('returns a fresh fixed failure with no upstream cause, stack, URL, FID, body, or token detail', async () => {
    const upstream = Object.assign(new Error('opaque-private-token [42] private-body'), {
      cause: new Error('private cause'),
      url: 'https://private.example/',
    })
    const error = await resolver(async () => { throw upstream }).resolve().catch(value => value)
    expect(error).toBeInstanceOf(SpacetimeReleaseRecoveryResolverFailure)
    expect(error).not.toBe(upstream)
    expect(error).toMatchObject({
      name: 'SpacetimeReleaseRecoveryResolverFailure',
      message: 'SPACETIME_RELEASE_RECOVERY_RESOLUTION_FAILED',
    })
    expect(error.stack).toBeUndefined()
    expect(Object.hasOwn(error, 'cause')).toBe(false)
    expect(JSON.stringify(error)).not.toMatch(/opaque-private-token|42|private-body|private\.example|private cause/u)
  })

  it('aborts and drains all active member requests on the first pool failure', async () => {
    const fids = [1, 2, 3, 4, 5, 42, 7, 8]
    const base = successfulFetcher(fids)
    let active = 0
    let aborted = 0
    const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (!input.toString().endsWith('/call/admin_get_access_request_admission_status_v1')) {
        return base.fetcher(input, init)
      }
      active += 1
      const body = String(init.body)
      if (body === '[3]') {
        active -= 1
        throw new Error('private member transport detail')
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted += 1
          active -= 1
          reject(new Error('private abort detail'))
        }, { once: true })
      })
    }
    const error = await resolver(fetcher).resolve().catch(value => value)
    expect(error).toBeInstanceOf(SpacetimeReleaseRecoveryResolverFailure)
    expect(active).toBe(0)
    expect(aborted).toBeGreaterThan(0)
  })
})
