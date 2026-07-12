import type {
  DurableObjectNamespace,
  DurableObjectState,
  DurableObjectTransaction,
  RateLimitAction,
  RateLimiter,
  RateLimitResult,
} from './types'

const WINDOW_MILLISECONDS = 5 * 60 * 1_000
const STATE_KEY = 'rate-limit-state'
const INTERNAL_ORIGIN = 'https://auth-rate-limiter.internal'

const POLICIES: Readonly<Record<RateLimitAction, number>> = Object.freeze({
  challenge: 12,
  exchange: 20,
  'admin-token': 6,
})

interface PersistedState {
  version: 1
  timestamps: Partial<Record<RateLimitAction, number[]>>
}

function emptyState(): PersistedState {
  return { version: 1, timestamps: {} }
}

function readState(value: unknown): PersistedState {
  if (value === undefined) return emptyState()
  if (!value || typeof value !== 'object') throw new Error('Invalid rate-limit state.')
  const candidate = value as Partial<PersistedState>
  if (candidate.version !== 1 || !candidate.timestamps || typeof candidate.timestamps !== 'object') {
    throw new Error('Invalid rate-limit state.')
  }

  const allowedActions = new Set(Object.keys(POLICIES))
  if (Object.keys(candidate.timestamps).some((action) => !allowedActions.has(action))) {
    throw new Error('Invalid rate-limit state.')
  }

  const timestamps: PersistedState['timestamps'] = {}
  for (const action of Object.keys(POLICIES) as RateLimitAction[]) {
    const values = candidate.timestamps[action]
    if (values === undefined) continue
    if (!Array.isArray(values) || values.length > POLICIES[action]) {
      throw new Error('Invalid rate-limit state.')
    }
    if (values.some((timestamp, index) => (
      !Number.isSafeInteger(timestamp)
      || timestamp < 0
      || (index > 0 && timestamp < values[index - 1])
    ))) {
      throw new Error('Invalid rate-limit state.')
    }
    timestamps[action] = [...values]
  }
  return { version: 1, timestamps }
}

function actionFromRequest(request: Request): RateLimitAction | null {
  if (request.method !== 'POST') return null
  const url = new URL(request.url)
  if (url.origin !== INTERNAL_ORIGIN) return null
  for (const action of Object.keys(POLICIES) as RateLimitAction[]) {
    if (url.pathname === `/check/${action}`) return action
  }
  return null
}

function prune(state: PersistedState, now: number): boolean {
  const cutoff = now - WINDOW_MILLISECONDS
  let changed = false
  for (const action of Object.keys(state.timestamps) as RateLimitAction[]) {
    const previous = state.timestamps[action] ?? []
    const live = previous.filter((timestamp) => timestamp > cutoff)
    if (live.length !== previous.length) changed = true
    if (live.length === 0) delete state.timestamps[action]
    else state.timestamps[action] = live
  }
  return changed
}

function retryAfterSeconds(oldestAccepted: number, now: number): number {
  return Math.max(1, Math.min(300, Math.ceil((oldestAccepted + WINDOW_MILLISECONDS - now) / 1_000)))
}

function earliestExpiry(state: PersistedState): number | undefined {
  const oldest = Object.values(state.timestamps)
    .map((values) => values?.[0])
    .filter((value): value is number => value !== undefined)
  if (oldest.length === 0) return undefined
  return Math.min(...oldest) + WINDOW_MILLISECONDS
}

async function persistState(transaction: DurableObjectTransaction, state: PersistedState): Promise<void> {
  const alarmAt = earliestExpiry(state)
  if (alarmAt === undefined) {
    await transaction.delete(STATE_KEY)
    return
  }
  await transaction.put(STATE_KEY, state)
  await transaction.setAlarm(alarmAt)
}

function mappedIpv4(normalizedIpv6: string): string | null {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalizedIpv6)
  if (!match) return null
  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join('.')
}

export function normalizeClientAddress(value: string | undefined): string | null {
  if (!value || value !== value.trim() || value.length > 64) return null
  if (/[\s,%\[\]]/.test(value)) return null

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    const octets = value.split('.').map(Number)
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
    return octets.join('.')
  }

  if (!value.includes(':')) return null
  try {
    const hostname = new URL(`http://[${value}]/`).hostname
    const normalized = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1).toLowerCase()
      : hostname.toLowerCase()
    if (!normalized.includes(':')) return null
    return mappedIpv4(normalized) ?? normalized
  } catch {
    return null
  }
}

async function clientBucketName(request: Request): Promise<string> {
  // Cloudflare guarantees CF-Connecting-IP at the edge. Never trust forwarded
  // headers or request data as a replacement, and never retain the raw address.
  const address = normalizeClientAddress(request.headers.get('cf-connecting-ip') ?? undefined)
  if (!address) throw new Error('Cloudflare client identity unavailable.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`v1:${address}`))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `warpkeep-rate:${hash}`
}

export class DurableObjectRateLimiter implements RateLimiter {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  async check(request: Request, action: RateLimitAction): Promise<RateLimitResult> {
    const id = this.namespace.idFromName(await clientBucketName(request))
    const response = await this.namespace.get(id).fetch(`${INTERNAL_ORIGIN}/check/${action}`, { method: 'POST' })
    if (response.status === 204) return { allowed: true }
    if (response.status !== 429) throw new Error('Rate limiter unavailable.')
    const retryAfter = Number(response.headers.get('retry-after'))
    if (!Number.isSafeInteger(retryAfter) || retryAfter < 1 || retryAfter > 300) {
      throw new Error('Rate limiter returned an invalid response.')
    }
    return { allowed: false, retryAfterSeconds: retryAfter }
  }
}

export class AuthRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const action = actionFromRequest(request)
    if (!action) return new Response(null, { status: 404 })
    const now = Date.now()
    if (!Number.isSafeInteger(now) || now < 0) return new Response(null, { status: 503 })

    const result = await this.state.storage.transaction(async (transaction) => {
      const state = readState(await transaction.get<unknown>(STATE_KEY))
      const pruned = prune(state, now)
      const timestamps = state.timestamps[action] ?? []
      if (timestamps.length >= POLICIES[action]) {
        if (pruned) await persistState(transaction, state)
        return {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(timestamps[0], now),
        } as const
      }

      state.timestamps[action] = [...timestamps, now]
      await persistState(transaction, state)
      return { allowed: true } as const
    })

    return result.allowed
      ? new Response(null, { status: 204 })
      : new Response(null, {
          status: 429,
          headers: {
            'cache-control': 'no-store',
            'retry-after': String(result.retryAfterSeconds),
          },
        })
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    await this.state.storage.transaction(async (transaction) => {
      const state = readState(await transaction.get<unknown>(STATE_KEY))
      prune(state, now)
      await persistState(transaction, state)
    })
  }
}
