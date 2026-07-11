import { internalAdminClaims } from './jwt'
import type { AdminTokenClaims, AuthEpochResolver } from './types'

export const AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS = 5_000
export const MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES = 1_024
export const MAX_AUTH_EPOCH = 0xffff_ffff
export const SPACETIMEDB_AUTH_EPOCH_PROCEDURE = 'admin_get_fid_auth_epoch'

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

export type AuthEpochJwtSigner = (claims: AdminTokenClaims) => Promise<string>
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

function supportedFidArgument(fid: string): number {
  if (!/^[1-9]\d{0,15}$/.test(fid)) {
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
  return Number(parsed)
}

function issuedAtSeconds(clock: AuthEpochClock): number {
  const now = clock()
  if (!Number.isSafeInteger(now) || now < 0) invalidResolverConfig()
  return Math.floor(now / 1_000)
}

async function readBoundedBody(response: Response): Promise<string> {
  const advertisedLength = response.headers.get('content-length')
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES)) {
    throw new Error('Auth epoch resolver returned invalid data.')
  }
  if (!response.body) throw new Error('Auth epoch resolver returned invalid data.')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('Auth epoch resolver returned invalid data.')
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

function parseEpoch(raw: string, contentType: string | null): number {
  if (!contentType?.toLowerCase().startsWith('application/json')) {
    throw new Error('Auth epoch resolver returned invalid data.')
  }
  if (encoder.encode(raw).byteLength > MAX_AUTH_EPOCH_RESOLVER_RESPONSE_BYTES) {
    throw new Error('Auth epoch resolver returned invalid data.')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Auth epoch resolver returned invalid data.')
  }
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_AUTH_EPOCH
  ) {
    throw new Error('Auth epoch resolver returned invalid data.')
  }
  return value
}

/**
 * Resolves a verified Farcaster FID's revocation epoch directly through the
 * documented low-frequency SpacetimeDB HTTP procedure API. It mints a fresh,
 * non-persisted Hermes admin JWT for every request and never exposes it.
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

  async resolve(fid: string): Promise<number> {
    const fidArgument = supportedFidArgument(fid)
    const issuedAt = issuedAtSeconds(this.clock)
    let token: string
    try {
      token = await this.dependencies.signer(internalAdminClaims(this.config.issuer, this.config.audience, issuedAt))
    } catch {
      throw new Error('Auth epoch resolver is unavailable.')
    }
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('Auth epoch resolver is unavailable.')
    }

    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new Error('Auth epoch resolver timed out.'))
      }, this.config.timeoutMs)
    })

    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(this.procedureEndpoint, {
            method: 'POST',
            headers: new Headers({
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              accept: 'application/json',
              'cache-control': 'no-store',
            }),
            body: JSON.stringify([fidArgument]),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('Auth epoch resolver is unavailable.')
          return parseEpoch(
            await readBoundedBody(response),
            response.headers.get('content-type'),
          )
        })(),
        deadline,
      ])
    } catch {
      if (timedOut) throw new Error('Auth epoch resolver timed out.')
      throw new Error('Auth epoch resolver is unavailable.')
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      controller.abort()
    }
  }
}
