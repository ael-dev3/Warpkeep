import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthRateLimiter,
  DurableObjectRateLimiter,
  normalizeClientAddress,
} from '../src/rateLimit'
import type {
  DurableObjectNamespace,
  DurableObjectState,
  DurableObjectStorage,
  DurableObjectTransaction,
  RateLimitAction,
} from '../src/types'

const NOW = 1_800_000_000_000
const LIMITS: Readonly<Record<RateLimitAction, number>> = {
  challenge: 12,
  exchange: 20,
  'admin-token': 6,
}

class FakeStorage implements DurableObjectStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | Date | undefined
  putCalls = 0
  deleteAllCalls = 0
  failAlarmWrites = false
  alarmWriteCalls = 0
  private queue: Promise<void> = Promise.resolve()

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.putCalls += 1
    this.values.set(key, structuredClone(value))
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key)
  }

  async deleteAll(): Promise<void> {
    this.deleteAllCalls += 1
    this.values.clear()
    this.alarm = undefined
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarmWriteCalls += 1
    if (this.failAlarmWrites) throw new Error('test-only alarm write failure')
    this.alarm = scheduledTime
  }

  async transaction<T>(closure: (txn: DurableObjectTransaction) => Promise<T>): Promise<T> {
    const previous = this.queue
    let release!: () => void
    this.queue = new Promise<void>((resolve) => { release = resolve })
    await previous
    const previousValues = new Map(
      [...this.values].map(([key, value]) => [key, structuredClone(value)]),
    )
    const previousAlarm = this.alarm
    const previousPutCalls = this.putCalls
    try {
      // The reviewed limiter intentionally uses only key operations inside its
      // transaction and keeps alarms/deleteAll on top-level storage.
      return await closure({
        get: key => this.get(key),
        put: (key, value) => this.put(key, value),
        delete: key => this.delete(key),
      })
    } catch (error) {
      this.values.clear()
      for (const [key, value] of previousValues) this.values.set(key, value)
      this.alarm = previousAlarm
      this.putCalls = previousPutCalls
      throw error
    } finally {
      release()
    }
  }
}

function internalRequest(action: RateLimitAction): Request {
  return new Request(`https://auth-rate-limiter.internal/check/${action}`, { method: 'POST' })
}

async function use(guard: AuthRateLimiter, action: RateLimitAction, count: number): Promise<Response[]> {
  return Promise.all(Array.from({ length: count }, () => guard.fetch(internalRequest(action))))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AuthRateLimiter', () => {
  it('enforces the exact independent 12/20/6 endpoint envelopes', async () => {
    vi.useFakeTimers({ now: NOW })
    for (const [action, limit] of Object.entries(LIMITS) as [RateLimitAction, number][]) {
      const storage = new FakeStorage()
      const guard = new AuthRateLimiter({ storage } as DurableObjectState)
      const admitted = await use(guard, action, limit)
      expect(admitted.every((response) => response.status === 204)).toBe(true)
      const writesBeforeDenial = storage.putCalls
      const alarmWritesBeforeDenial = storage.alarmWriteCalls
      const blocked = await guard.fetch(internalRequest(action))
      expect(blocked.status).toBe(429)
      expect(blocked.headers.get('retry-after')).toBe('300')
      expect(storage.putCalls).toBe(writesBeforeDenial)
      expect(storage.alarmWriteCalls).toBe(alarmWritesBeforeDenial)
    }
  })

  it('atomically admits exactly the configured count under concurrency', async () => {
    vi.useFakeTimers({ now: NOW })
    const guard = new AuthRateLimiter({ storage: new FakeStorage() } as DurableObjectState)
    const responses = await use(guard, 'challenge', 20)
    expect(responses.filter((response) => response.status === 204)).toHaveLength(12)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(8)
  })

  it('uses an exact rolling window and prunes at the expiry boundary', async () => {
    vi.useFakeTimers({ now: NOW })
    const guard = new AuthRateLimiter({ storage: new FakeStorage() } as DurableObjectState)
    expect((await use(guard, 'challenge', 6)).every((response) => response.status === 204)).toBe(true)
    vi.setSystemTime(NOW + 1_000)
    expect((await use(guard, 'challenge', 6)).every((response) => response.status === 204)).toBe(true)

    vi.setSystemTime(NOW + 299_999)
    const blocked = await guard.fetch(internalRequest('challenge'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('1')

    vi.setSystemTime(NOW + 300_000)
    expect((await use(guard, 'challenge', 6)).every((response) => response.status === 204)).toBe(true)
    const rollingBlock = await guard.fetch(internalRequest('challenge'))
    expect(rollingBlock.status).toBe(429)
    expect(rollingBlock.headers.get('retry-after')).toBe('1')
  })

  it('persists limits across object instances and cleans expired state by alarm', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    const first = new AuthRateLimiter({ storage } as DurableObjectState)
    await use(first, 'admin-token', 6)
    const restored = new AuthRateLimiter({ storage } as DurableObjectState)
    expect((await restored.fetch(internalRequest('admin-token'))).status).toBe(429)
    expect(storage.values.size).toBe(1)

    vi.setSystemTime(NOW + 300_000)
    await restored.alarm()
    expect(storage.values.size).toBe(0)
    expect(storage.deleteAllCalls).toBe(1)
    expect(storage.alarm).toBeUndefined()
  })

  it('fails rather than resetting malformed persisted state', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    storage.values.set('rate-limit-state', { version: 1, timestamps: { challenge: ['bad'] } })
    const guard = new AuthRateLimiter({ storage } as DurableObjectState)
    await expect(guard.fetch(internalRequest('challenge'))).rejects.toThrow('Invalid rate-limit state')
  })

  it('rolls back state when initial alarm scheduling fails', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    storage.failAlarmWrites = true
    const guard = new AuthRateLimiter({ storage } as DurableObjectState)

    await expect(guard.fetch(internalRequest('challenge'))).rejects.toThrow('test-only alarm write failure')
    expect(storage.values.size).toBe(0)
    expect(storage.deleteAllCalls).toBe(0)
    expect(storage.alarm).toBeUndefined()
  })
})

describe('client address normalization', () => {
  it('canonicalizes IPv4, IPv6, and IPv4-mapped IPv6', () => {
    expect(normalizeClientAddress('203.000.113.007')).toBe('203.0.113.7')
    expect(normalizeClientAddress('2001:0DB8:0:0:0:0:0:1')).toBe('2001:db8::1')
    expect(normalizeClientAddress('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizeClientAddress('::ffff:192.0.2.1')).toBe('192.0.2.1')
  })

  it.each([
    undefined,
    '',
    ' 203.0.113.7',
    '203.0.113.7 ',
    '203.0.113.7, 198.51.100.2',
    '203.0.113.7:443',
    '[2001:db8::1]',
    'fe80::1%en0',
    '999.0.0.1',
    'not-an-ip',
  ])('rejects malformed client identity %s', (value) => {
    expect(normalizeClientAddress(value)).toBeNull()
  })
})

describe('DurableObjectRateLimiter routing', () => {
  it('routes canonical-equivalent addresses to a SHA-256 name without leaking raw IP', async () => {
    const names: string[] = []
    const requests: Request[] = []
    const namespace: DurableObjectNamespace = {
      idFromName(name) {
        names.push(name)
        return { name } as never
      },
      get() {
        return {
          fetch: async (input, init) => {
            requests.push(new Request(input, init))
            return new Response(null, { status: 204 })
          },
        }
      },
    }
    const limiter = new DurableObjectRateLimiter(namespace)
    for (const address of ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1']) {
      const request = new Request('https://auth.warpkeep.com/v1/farcaster/challenge', {
        headers: { 'cf-connecting-ip': address },
      })
      await expect(limiter.check(request, 'challenge')).resolves.toEqual({ allowed: true })
    }

    expect(names).toHaveLength(2)
    expect(names[0]).toBe(names[1])
    expect(names[0]).toMatch(/^warpkeep-rate:v2:[0-9a-f]{64}$/)
    expect(names.join(' ')).not.toContain('2001:db8')
    expect(await Promise.all(requests.map((request) => request.text()))).toEqual(['', ''])
    expect(requests.every((request) => !request.url.includes('2001'))).toBe(true)
  })

  it('shares one bucket across an IPv6 /64 and separates distinct prefixes', async () => {
    const names: string[] = []
    const namespace: DurableObjectNamespace = {
      idFromName(name) {
        names.push(name)
        return { name } as never
      },
      get() {
        return { fetch: async () => new Response(null, { status: 204 }) }
      },
    }
    const limiter = new DurableObjectRateLimiter(namespace)
    for (const address of ['2001:db8:abcd:12::1', '2001:db8:abcd:12:ffff::99', '2001:db8:abcd:13::1']) {
      await limiter.check(new Request('https://auth.warpkeep.com/v1/farcaster/challenge', {
        headers: { 'cf-connecting-ip': address },
      }), 'challenge')
    }
    expect(names[0]).toBe(names[1])
    expect(names[2]).not.toBe(names[0])
  })

  it('fails closed for missing or malformed Cloudflare identity and ignores X-Forwarded-For', async () => {
    const idFromName = vi.fn()
    const namespace: DurableObjectNamespace = {
      idFromName,
      get: vi.fn() as never,
    }
    const limiter = new DurableObjectRateLimiter(namespace)
    const headerCases: HeadersInit[] = [
      {},
      { 'x-forwarded-for': '203.0.113.7' },
      { 'cf-connecting-ip': 'bad', 'x-forwarded-for': '203.0.113.7' },
    ]
    for (const headers of headerCases) {
      await expect(limiter.check(new Request('https://auth.warpkeep.com', { headers }), 'challenge'))
        .rejects.toThrow('client identity unavailable')
    }
    expect(idFromName).not.toHaveBeenCalled()
  })
})
