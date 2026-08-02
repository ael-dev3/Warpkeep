import { accessRequestResolverClaims } from './jwt'
import type {
  AccessRequestOperation,
  AccessRequestResolution,
  AccessRequestResolver,
  AccessRequestResolverTokenClaims,
} from './types'

export const ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS = 5_000
export const MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES = 2 * 1_024
export const SPACETIMEDB_ACCESS_REQUEST_STATUS_PROCEDURE = 'access_request_get_status_v1'
export const SPACETIMEDB_ACCESS_REQUEST_SUBMIT_PROCEDURE = 'access_request_submit_v1'

export const ACCESS_REQUEST_RESOLVER_FAILURE_STAGES = Object.freeze([
  'signing',
  'fetch_request',
  'fetch_body',
  'timeout',
  'upstream_status',
  'response_validation',
] as const)

export type AccessRequestResolverFailureStage =
  typeof ACCESS_REQUEST_RESOLVER_FAILURE_STAGES[number]

const FAILURE_STAGE_SET = new Set<string>(ACCESS_REQUEST_RESOLVER_FAILURE_STAGES)
const DATABASE_NAME_PATTERN =
  /^(?:[a-f0-9]{64}|[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/
const MAX_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER)
const encoder = new TextEncoder()

/** Closed, non-sensitive failure stage. Raw upstream details are never retained. */
export class AccessRequestResolverFailure extends Error {
  constructor(readonly stage: AccessRequestResolverFailureStage) {
    if (!FAILURE_STAGE_SET.has(stage)) {
      throw new Error('Access request resolver failure stage is invalid.')
    }
    super('Access request resolver is unavailable.')
    this.name = 'AccessRequestResolverFailure'
  }
}

export function accessRequestResolverFailureStage(
  error: unknown,
): AccessRequestResolverFailureStage | null {
  return error instanceof AccessRequestResolverFailure
    && FAILURE_STAGE_SET.has(error.stage)
    ? error.stage
    : null
}

function fail(stage: AccessRequestResolverFailureStage): never {
  throw new AccessRequestResolverFailure(stage)
}

export type SpacetimeAccessRequestResolverConfig = Readonly<{
  uri: string
  database: string
  issuer: string
  audience: string
  timeoutMs: number
}>

export type AccessRequestJwtSigner =
  (claims: AccessRequestResolverTokenClaims) => Promise<string>
export type AccessRequestFetch =
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SpacetimeAccessRequestResolverDependencies = Readonly<{
  signer: AccessRequestJwtSigner
  fetcher?: AccessRequestFetch
  clock?: () => number
}>

function invalidConfig(): never {
  throw new Error('Access request resolver configuration is invalid.')
}

function parseOrigin(uri: string): string {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return invalidConfig()
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) return invalidConfig()
  return parsed.origin
}

function procedureEndpoint(
  config: SpacetimeAccessRequestResolverConfig,
  procedure: string,
): URL {
  if (!DATABASE_NAME_PATTERN.test(config.database)) invalidConfig()
  return new URL(
    `/v1/database/${encodeURIComponent(config.database)}/call/${procedure}`,
    parseOrigin(config.uri),
  )
}

function supportedFid(fid: unknown): string {
  if (typeof fid !== 'string' || !/^[1-9]\d{0,15}$/.test(fid)) {
    throw new Error('Access request resolver received an invalid FID.')
  }
  let parsed: bigint
  try {
    parsed = BigInt(fid)
  } catch {
    throw new Error('Access request resolver received an invalid FID.')
  }
  if (parsed > MAX_SUPPORTED_FID) {
    throw new Error('Access request resolver received an invalid FID.')
  }
  return parsed.toString(10)
}

function issuedAtSeconds(clock: () => number): number {
  const now = clock()
  if (!Number.isSafeInteger(now) || now < 0) invalidConfig()
  return Math.floor(now / 1_000)
}

async function readBoundedBody(response: Response): Promise<string> {
  const advertisedLength = response.headers.get('content-length')
  if (
    advertisedLength
    && (
      !/^\d+$/.test(advertisedLength)
      || Number(advertisedLength) > MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES
    )
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
      if (total > MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // The known response-validation failure remains authoritative.
        }
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

function exactOption(value: unknown): { kind: 'none' } | { kind: 'some'; value: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('response_validation')
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.length === 1
    && keys[0] === 'none'
    && Array.isArray(record.none)
    && record.none.length === 0
  ) {
    return { kind: 'none' }
  }
  if (
    keys.length === 1
    && keys[0] === 'some'
    && typeof record.some === 'number'
    && Number.isSafeInteger(record.some)
    && record.some > 0
  ) {
    return { kind: 'some', value: record.some }
  }
  return fail('response_validation')
}

export function parseAccessRequestResolution(
  raw: string,
  contentType: string | null,
): AccessRequestResolution {
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
    || encoder.encode(raw).byteLength > MAX_ACCESS_REQUEST_RESOLVER_RESPONSE_BYTES
  ) return fail('response_validation')

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return fail('response_validation')
  }
  if (!Array.isArray(value) || value.length !== 2) {
    return fail('response_validation')
  }
  const option = exactOption(value[1])
  if (value[0] === 'not_requested' && option.kind === 'none') {
    return Object.freeze({ status: 'not-requested' })
  }
  if (value[0] === 'already_admitted' && option.kind === 'none') {
    return Object.freeze({ status: 'already-admitted' })
  }
  if (value[0] === 'requested' && option.kind === 'some') {
    return Object.freeze({
      status: 'requested',
      requestedAtMicros: option.value,
    })
  }
  return fail('response_validation')
}

export class SpacetimeHttpAccessRequestResolver implements AccessRequestResolver {
  private readonly fetcher: AccessRequestFetch
  private readonly clock: () => number
  private readonly statusEndpoint: URL
  private readonly submitEndpoint: URL

  constructor(
    private readonly config: SpacetimeAccessRequestResolverConfig,
    private readonly dependencies: SpacetimeAccessRequestResolverDependencies,
  ) {
    if (
      !Number.isSafeInteger(config.timeoutMs)
      || config.timeoutMs < 1
      || config.timeoutMs > ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS
    ) invalidConfig()
    this.statusEndpoint = procedureEndpoint(
      config,
      SPACETIMEDB_ACCESS_REQUEST_STATUS_PROCEDURE,
    )
    this.submitEndpoint = procedureEndpoint(
      config,
      SPACETIMEDB_ACCESS_REQUEST_SUBMIT_PROCEDURE,
    )
    this.fetcher = dependencies.fetcher ?? fetch
    this.clock = dependencies.clock ?? Date.now
  }

  getStatus(fid: string): Promise<AccessRequestResolution> {
    return this.call(fid, this.statusEndpoint, 'status')
  }

  async submit(fid: string): Promise<AccessRequestResolution> {
    const result = await this.call(fid, this.submitEndpoint, 'submit')
    if (result.status === 'not-requested') return fail('response_validation')
    return result
  }

  private async call(
    fid: string,
    endpoint: URL,
    operation: AccessRequestOperation,
  ): Promise<AccessRequestResolution> {
    const requestFid = supportedFid(fid)
    const issuedAt = issuedAtSeconds(this.clock)
    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new AccessRequestResolverFailure('timeout'))
      }, this.config.timeoutMs)
    })

    let token = ''
    try {
      try {
        token = await Promise.race([
          this.dependencies.signer(accessRequestResolverClaims(
            this.config.issuer,
            this.config.audience,
            requestFid,
            operation,
            issuedAt,
          )),
          deadline,
        ])
      } catch (error) {
        if (error instanceof AccessRequestResolverFailure) throw error
        return fail(timedOut ? 'timeout' : 'signing')
      }
      if (typeof token !== 'string' || token.length === 0) {
        return fail('signing')
      }

      const fetcher = this.fetcher
      return await Promise.race([
        (async () => {
          let response: Response
          try {
            response = await fetcher(endpoint, {
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
            return parseAccessRequestResolution(
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
      token = ''
      if (timeout !== undefined) clearTimeout(timeout)
      controller.abort()
    }
  }
}
