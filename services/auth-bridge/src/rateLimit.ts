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
  'session-refresh': 30,
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

async function persistActiveState(
  transaction: DurableObjectTransaction,
  storage: DurableObjectState['storage'],
  state: PersistedState,
  scheduleAlarm: boolean,
): Promise<void> {
  const alarmAt = earliestExpiry(state)
  if (alarmAt === undefined) throw new Error('Invalid empty rate-limit state.')
  await transaction.put(STATE_KEY, state)
  if (scheduleAlarm) {
    // For SQLite-backed objects, Cloudflare documents that top-level storage
    // operations made inside transaction() participate in that transaction;
    // the legacy txn facade does not document alarm methods. This keeps the
    // counter and its first/rescheduled cleanup alarm failure-atomic.
    await storage.setAlarm(alarmAt)
  }
}

async function cleanExpiredState(storage: DurableObjectState['storage'], now: number): Promise<void> {
  const empty = await storage.transaction(async (transaction) => {
    const state = readState(await transaction.get<unknown>(STATE_KEY))
    prune(state, now)
    if (earliestExpiry(state) === undefined) {
      await transaction.delete(STATE_KEY)
      return true
    }
    await persistActiveState(transaction, storage, state, true)
    return false
  })
  // deleteAll(), unlike deleting the visible key, also deallocates SQLite
  // metadata and the active alarm on the configured compatibility date.
  if (empty) await storage.deleteAll()
}

function mappedIpv4(normalizedIpv6: string): string | null {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalizedIpv6)
  if (!match) return null
  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join('.')
}

function ipv6Network64(normalizedIpv6: string): string {
  const halves = normalizedIpv6.split('::')
  if (halves.length > 2) throw new Error('Invalid IPv6 client identity.')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    throw new Error('Invalid IPv6 client identity.')
  }
  const words = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) {
    throw new Error('Invalid IPv6 client identity.')
  }
  return `${words.slice(0, 4).map((word) => Number.parseInt(word, 16).toString(16)).join(':')}::/64`
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
  // Treat a routed IPv6 /64 as one client envelope so host-bit rotation cannot
  // mint effectively unlimited independent buckets. IPv4 remains per-address.
  const bucketAddress = address.includes(':') ? ipv6Network64(address) : address
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`v2:${bucketAddress}`))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `warpkeep-rate:v2:${hash}`
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

    const evaluated = await this.state.storage.transaction(async (transaction) => {
      const state = readState(await transaction.get<unknown>(STATE_KEY))
      const scheduledAlarmAt = earliestExpiry(state)
      const pruned = prune(state, now)
      const timestamps = state.timestamps[action] ?? []
      if (timestamps.length >= POLICIES[action]) {
        if (pruned) {
          await persistActiveState(transaction, this.state.storage, state, true)
        }
        return {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(timestamps[0], now),
        } as const
      }

      state.timestamps[action] = [...timestamps, now]
      const nextAlarmAt = earliestExpiry(state)
      await persistActiveState(
        transaction,
        this.state.storage,
        state,
        nextAlarmAt !== scheduledAlarmAt,
      )
      return { allowed: true } as const
    })

    return evaluated.allowed
      ? new Response(null, { status: 204 })
      : new Response(null, {
          status: 429,
          headers: {
            'cache-control': 'no-store',
            'retry-after': String(evaluated.retryAfterSeconds),
          },
        })
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid rate-limit clock.')
    await cleanExpiredState(this.state.storage, now)
  }
}
