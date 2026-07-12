import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChallengeReplayGuard } from '../src/challengeStore'
import type { ChallengeRecord, DurableObjectState, DurableObjectStorage } from '../src/types'

const NOW = 1_800_000_000_000
const RECORD_KEY = 'challenge'

function challenge(overrides: Partial<ChallengeRecord> = {}): ChallengeRecord {
  return {
    version: 1,
    requestId: 'request-id-for-storage-test',
    nonce: 'nonce-for-storage-test',
    origin: 'https://warpkeep.com',
    domain: 'warpkeep.com',
    siweUri: 'https://warpkeep.com/',
    createdAt: NOW,
    expiresAt: NOW + 5 * 60 * 1_000,
    ...overrides,
  }
}

class FakeStorage implements DurableObjectStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | Date | undefined
  deleteAllCalls = 0

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key)
  }

  async deleteAll(): Promise<void> {
    this.deleteAllCalls += 1
    this.values.clear()
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarm = scheduledTime
  }
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://challenge-replay-guard.internal${path}`, init)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ChallengeReplayGuard storage lifecycle', () => {
  it('schedules expiry and fully deallocates a consumed challenge', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    const guard = new ChallengeReplayGuard({ storage } as DurableObjectState)
    const record = challenge()

    const stored = await guard.fetch(request('/record', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    }))
    expect(stored.status).toBe(204)
    expect(storage.values.get(RECORD_KEY)).toEqual(record)
    expect(storage.alarm).toBe(record.expiresAt)

    const consumed = await guard.fetch(request('/consume', { method: 'POST' }))
    expect(consumed.status).toBe(200)
    await expect(consumed.json()).resolves.toEqual(record)
    expect(storage.deleteAllCalls).toBe(1)
    expect(storage.values.size).toBe(0)
  })

  it('can restore a still-live challenge after atomic consume deallocates storage', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    const guard = new ChallengeReplayGuard({ storage } as DurableObjectState)
    const record = challenge()
    const put = () => guard.fetch(request('/record', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    }))

    expect((await put()).status).toBe(204)
    expect((await guard.fetch(request('/consume', { method: 'POST' }))).status).toBe(200)
    expect(storage.deleteAllCalls).toBe(1)

    expect((await put()).status).toBe(204)
    const restored = await guard.fetch(request('/record'))
    expect(restored.status).toBe(200)
    await expect(restored.json()).resolves.toEqual(record)
    expect(storage.alarm).toBe(record.expiresAt)
  })

  it('fully deallocates an abandoned object when its alarm fires', async () => {
    const storage = new FakeStorage()
    storage.values.set(RECORD_KEY, challenge())
    const guard = new ChallengeReplayGuard({ storage } as DurableObjectState)

    await guard.alarm()
    expect(storage.deleteAllCalls).toBe(1)
    expect(storage.values.size).toBe(0)
  })

  it('deallocates expired or malformed persisted records', async () => {
    vi.useFakeTimers({ now: NOW })
    for (const candidate of [
      challenge({ expiresAt: NOW }),
      { version: 999, requestId: 'malformed' },
    ]) {
      const storage = new FakeStorage()
      storage.values.set(RECORD_KEY, candidate)
      const guard = new ChallengeReplayGuard({ storage } as DurableObjectState)

      const response = await guard.fetch(request('/record'))
      expect(response.status).toBe(404)
      expect(storage.deleteAllCalls).toBe(1)
      expect(storage.values.size).toBe(0)
    }
  })

  it('rejects already-expired records without retaining them', async () => {
    vi.useFakeTimers({ now: NOW })
    const storage = new FakeStorage()
    const guard = new ChallengeReplayGuard({ storage } as DurableObjectState)
    const response = await guard.fetch(request('/record', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(challenge({ createdAt: NOW - 10, expiresAt: NOW })),
    }))

    expect(response.status).toBe(400)
    expect(storage.values.size).toBe(0)
  })
})
