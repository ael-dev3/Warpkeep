import { qaSnapshotResolverClaims } from './jwt'
import type { QaSnapshotResolverTokenClaims } from './types'

export const QA_SNAPSHOT_TIMEOUT_MILLISECONDS = 5_000
export const MAX_QA_SNAPSHOT_RESPONSE_BYTES = 256 * 1_024
export const SPACETIMEDB_QA_SNAPSHOT_PROCEDURE = 'qa_observer_get_realm_snapshot_v1'
export const QA_OBSERVER_SNAPSHOT_VERSION = 1
export const QA_OBSERVER_MAX_CASTLES = 100

const EXPECTED_PROTOCOL_VERSION = 3
const EXPECTED_WORLD_SEED = 3_445_214_658
const EXPECTED_WORLD_SEED_NAME = 'HEGEMONY_GENESIS_001'
const EXPECTED_WORLD_TILE_COUNT = 1_261
const EXPECTED_WORLD_TILE_META_COUNT = 1_261
const EXPECTED_REALM_ID = 'GENESIS_001'
const EXPECTED_GENERATION_VERSION = 2
const EXPECTED_AUTHORITATIVE_RADIUS = 20
const EXPECTED_RENDER_RADIUS = 22
const EXPECTED_PLAYER_CAPACITY = 100
const DATABASE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/
const SAFE_PUBLIC_STATUS = new Set(['founded', 'active'])
const encoder = new TextEncoder()

export const QA_SNAPSHOT_FAILURE_STAGES = Object.freeze([
  'signing',
  'fetch_request',
  'fetch_body',
  'timeout',
  'upstream_status',
  'response_validation',
] as const)

export type QaSnapshotFailureStage = typeof QA_SNAPSHOT_FAILURE_STAGES[number]
const FAILURE_STAGE_SET = new Set<string>(QA_SNAPSHOT_FAILURE_STAGES)

export class QaSnapshotResolverFailure extends Error {
  constructor(readonly stage: QaSnapshotFailureStage) {
    if (!FAILURE_STAGE_SET.has(stage)) throw new Error('Invalid QA snapshot failure stage.')
    super('QA snapshot resolver is unavailable.')
    this.name = 'QaSnapshotResolverFailure'
  }
}

export function qaSnapshotResolverFailureStage(error: unknown): QaSnapshotFailureStage | null {
  return error instanceof QaSnapshotResolverFailure && FAILURE_STAGE_SET.has(error.stage)
    ? error.stage
    : null
}

function fail(stage: QaSnapshotFailureStage): never {
  throw new QaSnapshotResolverFailure(stage)
}

export type QaObserverCastleSnapshot = Readonly<{
  castleId: number
  tileKey: string
  q: number
  r: number
  level: number
  name: string
  canonicalUsername?: string
  displayName?: string
  portraitAvailable: boolean
  publicBio?: string
  publicStatus: string
}>

export type QaObserverRealmSnapshot = Readonly<{
  version: 1
  protocolVersion: number
  worldSeed: number
  worldSeedName: string
  worldTileCount: number
  worldTileMetaCount: number
  realm: Readonly<{
    realmId: string
    numericSeed: number
    generationVersion: number
    authoritativeRadius: number
    renderRadius: number
    playerCapacity: number
  }>
  castles: readonly QaObserverCastleSnapshot[]
}>

export interface QaObserverSnapshotResolver {
  resolve(deviceThumbprint: string): Promise<QaObserverRealmSnapshot>
}

export type QaSnapshotJwtSigner = (claims: QaSnapshotResolverTokenClaims) => Promise<string>
export type QaSnapshotFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SpacetimeQaObserverResolverConfig = Readonly<{
  uri: string
  database: string
  issuer: string
  audience: string
  timeoutMs: number
}>

export type SpacetimeQaObserverResolverDependencies = Readonly<{
  signer: QaSnapshotJwtSigner
  fetcher?: QaSnapshotFetch
  clock?: () => number
}>

function parseOrigin(uri: string): string {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    throw new Error('QA snapshot resolver configuration is invalid.')
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:')
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) throw new Error('QA snapshot resolver configuration is invalid.')
  return url.origin
}

function endpoint(config: SpacetimeQaObserverResolverConfig): URL {
  if (!DATABASE_NAME_PATTERN.test(config.database)) {
    throw new Error('QA snapshot resolver configuration is invalid.')
  }
  return new URL(
    `/v1/database/${encodeURIComponent(config.database)}/call/${SPACETIMEDB_QA_SNAPSHOT_PROCEDURE}`,
    parseOrigin(config.uri),
  )
}

function u32(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) {
    return fail('response_validation')
  }
  return value as number
}

function i32(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < -0x8000_0000 || (value as number) > 0x7fff_ffff) {
    return fail('response_validation')
  }
  return value as number
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail('response_validation')
  return value as number
}

function exactString(value: unknown, maximumCharacters: number): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumCharacters * 4
    || [...value].length > maximumCharacters
    || value.trim() !== value
    || /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff<>]/u.test(value)
    || /\s{2,}/u.test(value)
  ) return fail('response_validation')
  return value
}

/** Accept only canonical named SATS option variants, never null/string shortcuts. */
function optionString(value: unknown, maximumCharacters: number): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('response_validation')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1) return fail('response_validation')
  if (keys[0] === 'none') {
    if (!Array.isArray(record.none) || record.none.length !== 0) return fail('response_validation')
    return undefined
  }
  if (keys[0] !== 'some') return fail('response_validation')
  return exactString(record.some, maximumCharacters)
}

function parseCastle(value: unknown): QaObserverCastleSnapshot {
  if (!Array.isArray(value) || value.length !== 11) return fail('response_validation')
  const castleId = positiveSafeInteger(value[0])
  const q = i32(value[2])
  const r = i32(value[3])
  const tileKey = exactString(value[1], 32)
  if (tileKey !== `${q},${r}` || Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) > EXPECTED_AUTHORITATIVE_RADIUS) {
    return fail('response_validation')
  }
  const level = i32(value[4])
  if (level < 1 || level > 1_000) return fail('response_validation')
  const canonicalUsername = optionString(value[6], 64)
  if (canonicalUsername !== undefined && !USERNAME_PATTERN.test(canonicalUsername)) {
    return fail('response_validation')
  }
  const displayName = optionString(value[7], 80)
  if (typeof value[8] !== 'boolean') return fail('response_validation')
  const publicBio = optionString(value[9], 320)
  const publicStatus = exactString(value[10], 16)
  if (!SAFE_PUBLIC_STATUS.has(publicStatus)) return fail('response_validation')
  return Object.freeze({
    castleId,
    tileKey,
    q,
    r,
    level,
    name: exactString(value[5], 80),
    ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
    ...(displayName === undefined ? {} : { displayName }),
    portraitAvailable: value[8],
    ...(publicBio === undefined ? {} : { publicBio }),
    publicStatus,
  })
}

export function parseQaObserverSnapshot(raw: string, contentType: string | null): QaObserverRealmSnapshot {
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return fail('response_validation')
  }
  if (encoder.encode(raw).byteLength > MAX_QA_SNAPSHOT_RESPONSE_BYTES) return fail('response_validation')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return fail('response_validation')
  }
  if (!Array.isArray(value) || value.length !== 8) return fail('response_validation')

  const version = u32(value[0])
  const protocolVersion = u32(value[1])
  const worldSeed = u32(value[2])
  const worldSeedName = exactString(value[3], 64)
  const worldTileCount = u32(value[4])
  const worldTileMetaCount = u32(value[5])
  const realmValue = value[6]
  const castlesValue = value[7]
  if (!Array.isArray(realmValue) || realmValue.length !== 6 || !Array.isArray(castlesValue)) {
    return fail('response_validation')
  }
  if (castlesValue.length < 1 || castlesValue.length > QA_OBSERVER_MAX_CASTLES) {
    return fail('response_validation')
  }

  const realm = Object.freeze({
    realmId: exactString(realmValue[0], 64),
    numericSeed: u32(realmValue[1]),
    generationVersion: u32(realmValue[2]),
    authoritativeRadius: u32(realmValue[3]),
    renderRadius: u32(realmValue[4]),
    playerCapacity: u32(realmValue[5]),
  })
  if (
    version !== QA_OBSERVER_SNAPSHOT_VERSION
    || protocolVersion !== EXPECTED_PROTOCOL_VERSION
    || worldSeed !== EXPECTED_WORLD_SEED
    || worldSeedName !== EXPECTED_WORLD_SEED_NAME
    || worldTileCount !== EXPECTED_WORLD_TILE_COUNT
    || worldTileMetaCount !== EXPECTED_WORLD_TILE_META_COUNT
    || realm.realmId !== EXPECTED_REALM_ID
    || realm.numericSeed !== worldSeed
    || realm.generationVersion !== EXPECTED_GENERATION_VERSION
    || realm.authoritativeRadius !== EXPECTED_AUTHORITATIVE_RADIUS
    || realm.renderRadius !== EXPECTED_RENDER_RADIUS
    || realm.playerCapacity !== EXPECTED_PLAYER_CAPACITY
  ) return fail('response_validation')

  const castles = castlesValue.map(parseCastle)
  const castleIds = new Set<number>()
  const tileKeys = new Set<string>()
  let previousCastleId = 0
  for (const castle of castles) {
    if (
      castleIds.has(castle.castleId)
      || tileKeys.has(castle.tileKey)
      || castle.castleId <= previousCastleId
    ) return fail('response_validation')
    castleIds.add(castle.castleId)
    tileKeys.add(castle.tileKey)
    previousCastleId = castle.castleId
  }

  return Object.freeze({
    version: 1,
    protocolVersion,
    worldSeed,
    worldSeedName,
    worldTileCount,
    worldTileMetaCount,
    realm,
    castles: Object.freeze(castles),
  })
}

async function readBoundedBody(response: Response): Promise<string> {
  const advertisedLength = response.headers.get('content-length')
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_QA_SNAPSHOT_RESPONSE_BYTES)
  ) return fail('response_validation')
  if (!response.body) return fail('response_validation')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch {
        return fail('fetch_body')
      }
      if (result.done) break
      if (!result.value) continue
      total += result.value.byteLength
      if (total > MAX_QA_SNAPSHOT_RESPONSE_BYTES) {
        try { await reader.cancel() } catch { /* static failure remains authoritative */ }
        return fail('response_validation')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail('response_validation')
  }
}

export class SpacetimeHttpQaObserverResolver implements QaObserverSnapshotResolver {
  private readonly fetcher: QaSnapshotFetch
  private readonly clock: () => number
  private readonly procedureEndpoint: URL

  constructor(
    private readonly config: SpacetimeQaObserverResolverConfig,
    private readonly dependencies: SpacetimeQaObserverResolverDependencies,
  ) {
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > QA_SNAPSHOT_TIMEOUT_MILLISECONDS) {
      throw new Error('QA snapshot resolver configuration is invalid.')
    }
    this.procedureEndpoint = endpoint(config)
    this.fetcher = dependencies.fetcher ?? fetch
    this.clock = dependencies.clock ?? Date.now
  }

  async resolve(deviceThumbprint: string): Promise<QaObserverRealmSnapshot> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(deviceThumbprint)) {
      throw new Error('QA snapshot resolver received an invalid device thumbprint.')
    }
    const now = this.clock()
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('QA snapshot resolver clock is invalid.')
    const issuedAt = Math.floor(now / 1_000)
    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new QaSnapshotResolverFailure('timeout'))
      }, this.config.timeoutMs)
    })

    try {
      let token: string
      try {
        token = await Promise.race([
          this.dependencies.signer(qaSnapshotResolverClaims(
            this.config.issuer,
            this.config.audience,
            deviceThumbprint,
            issuedAt,
          )),
          deadline,
        ])
      } catch (error) {
        if (error instanceof QaSnapshotResolverFailure) throw error
        return fail(timedOut ? 'timeout' : 'signing')
      }
      if (typeof token !== 'string' || token.length === 0) return fail('signing')

      const fetcher = this.fetcher
      return await Promise.race([
        (async () => {
          let response: Response
          try {
            response = await fetcher(this.procedureEndpoint, {
              method: 'POST',
              headers: new Headers({
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
                accept: 'application/json',
                'cache-control': 'no-store',
              }),
              body: '[]',
              redirect: 'manual',
              signal: controller.signal,
            })
          } catch {
            return fail(timedOut ? 'timeout' : 'fetch_request')
          }
          if (!response.ok) return fail('upstream_status')
          try {
            return parseQaObserverSnapshot(
              await readBoundedBody(response),
              response.headers.get('content-type'),
            )
          } catch (error) {
            if (timedOut) return fail('timeout')
            throw error
          }
        })(),
        deadline,
      ])
    } catch (error) {
      if (timedOut) return fail('timeout')
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      controller.abort()
    }
  }
}
