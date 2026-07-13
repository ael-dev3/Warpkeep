import { authEpochResolverClaims } from './jwt'
import type {
  AdmissionResolution,
  AuthEpochResolver,
  AuthEpochResolverTokenClaims,
} from './types'

export const AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS = 5_000
export const MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES = 1_024
export const MAX_AUTH_EPOCH = 0xffff_ffff
export const SPACETIMEDB_AUTH_EPOCH_PROCEDURE = 'auth_resolver_get_fid_admission_v2'

export const AUTH_EPOCH_RESOLVER_FAILURE_STAGES = Object.freeze([
  'signing',
  'fetch_request',
  'fetch_body',
  'timeout',
  'upstream_status',
  'response_validation',
] as const)

export type AuthEpochResolverFailureStage = typeof AUTH_EPOCH_RESOLVER_FAILURE_STAGES[number]

const AUTH_EPOCH_RESOLVER_FAILURE_STAGE_SET = new Set<string>(AUTH_EPOCH_RESOLVER_FAILURE_STAGES)

/** A closed, non-sensitive operational stage. Never attach an upstream error. */
export class AuthEpochResolverFailure extends Error {
  constructor(readonly stage: AuthEpochResolverFailureStage) {
    if (!AUTH_EPOCH_RESOLVER_FAILURE_STAGE_SET.has(stage)) {
      throw new Error('Auth epoch resolver failure stage is invalid.')
    }
    super('Auth epoch resolver is unavailable.')
    this.name = 'AuthEpochResolverFailure'
  }
}

export function authEpochResolverFailureStage(error: unknown): AuthEpochResolverFailureStage | null {
  return error instanceof AuthEpochResolverFailure
    && AUTH_EPOCH_RESOLVER_FAILURE_STAGE_SET.has(error.stage)
    ? error.stage
    : null
}

function resolverFailure(stage: AuthEpochResolverFailureStage): never {
  throw new AuthEpochResolverFailure(stage)
}

const MAX_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER)
const DATABASE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const encoder = new TextEncoder()

export type SpacetimeAuthEpochResolverConfig = Readonly<{
  uri: string
  database: string
  issuer: string
  audience: string
  timeoutMs: number
}>

export type AuthEpochJwtSigner = (claims: AuthEpochResolverTokenClaims) => Promise<string>
export type AuthEpochFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type AuthEpochClock = () => number

export type SpacetimeAuthEpochResolverDependencies = Readonly<{
  signer: AuthEpochJwtSigner
  fetcher?: AuthEpochFetch
  clock?: AuthEpochClock
}>

function invalidResolverConfig(): never {
  throw new Error('Auth epoch resolver configuration is invalid.')
}

function parseOrigin(uri: string): string {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return invalidResolverConfig()
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    return invalidResolverConfig()
  }
  return parsed.origin
}

function endpoint(config: SpacetimeAuthEpochResolverConfig): URL {
  const origin = parseOrigin(config.uri)
  if (!DATABASE_NAME_PATTERN.test(config.database)) invalidResolverConfig()
  return new URL(
    `/v1/database/${encodeURIComponent(config.database)}/call/${SPACETIMEDB_AUTH_EPOCH_PROCEDURE}`,
    origin,
  )
}

function supportedFidArgument(fid: unknown): Readonly<{
  canonicalFid: string
  fidArgument: number
}> {
  if (typeof fid !== 'string' || !/^[1-9]\d{0,15}$/.test(fid)) {
    throw new Error('Auth epoch resolver received an invalid FID.')
  }
  let parsed: bigint
  try {
    parsed = BigInt(fid)
  } catch {
    throw new Error('Auth epoch resolver received an invalid FID.')
  }
  if (parsed > MAX_SUPPORTED_FID) {
    throw new Error('Auth epoch resolver received an invalid FID.')
  }
  return Object.freeze({ canonicalFid: fid, fidArgument: Number(parsed) })
}

function issuedAtSeconds(clock: AuthEpochClock): number {
  const now = clock()
  if (!Number.isSafeInteger(now) || now < 0) invalidResolverConfig()
  return Math.floor(now / 1_000)
}

async function readBoundedBody(response: Response): Promise<string> {
  const advertisedLength = response.headers.get('content-length')
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES)) {
    return resolverFailure('response_validation')
  }
  if (!response.body) return resolverFailure('response_validation')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch {
        return resolverFailure('fetch_body')
      }
      const { done, value } = result
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // The known validation failure remains authoritative.
        }
        return resolverFailure('response_validation')
      }
      chunks.push(value)
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
  return new TextDecoder().decode(bytes)
}

function parseAdmission(raw: string, contentType: string | null): AdmissionResolution {
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return resolverFailure('response_validation')
  }
  if (encoder.encode(raw).byteLength > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES) {
    return resolverFailure('response_validation')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return resolverFailure('response_validation')
  }
  if (!Array.isArray(value) || value.length !== 2) {
    return resolverFailure('response_validation')
  }
  const [state, authEpoch] = value as unknown[]
  if (
    (state !== 'missing' && state !== 'disabled' && state !== 'enabled')
    || typeof authEpoch !== 'number'
    || !Number.isSafeInteger(authEpoch)
    || authEpoch < 0
    || authEpoch > MAX_AUTH_EPOCH
    || (state === 'enabled' ? authEpoch < 1 : authEpoch !== 0)
  ) {
    return resolverFailure('response_validation')
  }
  if (state === 'enabled') {
    return Object.freeze({ state: 'enabled', authEpoch })
  }
  return Object.freeze({ state, authEpoch: 0 })
}

/**
 * Resolves a verified Farcaster FID's admission state directly through the
 * documented low-frequency SpacetimeDB HTTP procedure API. It mints a fresh,
 * non-persisted resolver-only JWT for every request and never exposes it.
 */
export class SpacetimeHttpAuthEpochResolver implements AuthEpochResolver {
  private readonly fetcher: AuthEpochFetch
  private readonly clock: AuthEpochClock
  private readonly procedureEndpoint: URL

  constructor(
    private readonly config: SpacetimeAuthEpochResolverConfig,
    private readonly dependencies: SpacetimeAuthEpochResolverDependencies,
  ) {
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS) {
      invalidResolverConfig()
    }
    this.procedureEndpoint = endpoint(config)
    this.fetcher = dependencies.fetcher ?? fetch
    this.clock = dependencies.clock ?? Date.now
  }

  async resolve(fid: string): Promise<AdmissionResolution> {
    const { canonicalFid, fidArgument } = supportedFidArgument(fid)
    const issuedAt = issuedAtSeconds(this.clock)
    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new AuthEpochResolverFailure('timeout'))
      }, this.config.timeoutMs)
    })

    try {
      let token: string
      try {
        token = await Promise.race([
          this.dependencies.signer(authEpochResolverClaims(
            this.config.issuer,
            this.config.audience,
            canonicalFid,
            issuedAt,
          )),
          deadline,
        ])
      } catch (error) {
        if (error instanceof AuthEpochResolverFailure) throw error
        return resolverFailure(timedOut ? 'timeout' : 'signing')
      }
      if (typeof token !== 'string' || token.length === 0) {
        return resolverFailure('signing')
      }

      // Runtime-provided functions must not inherit the resolver instance as
      // their receiver. Calling through a local binding preserves fetch().
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
              body: JSON.stringify([fidArgument]),
              // The explicit Cache-Control header preserves no-store. Worker
              // subrequests do not need browser cache or credential modes.
              // Workerd rejects `error`; `manual` surfaces 3xx to the non-2xx guard below.
              redirect: 'manual',
              signal: controller.signal,
            })
          } catch {
            return resolverFailure(timedOut ? 'timeout' : 'fetch_request')
          }
          if (!response.ok) return resolverFailure('upstream_status')
          try {
            return parseAdmission(
              await readBoundedBody(response),
              response.headers.get('content-type'),
            )
          } catch (error) {
            if (timedOut) return resolverFailure('timeout')
            throw error
          }
        })(),
        deadline,
      ])
    } catch (error) {
      if (timedOut) return resolverFailure('timeout')
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      controller.abort()
    }
  }
}
