import { describe, expect, it } from 'vitest'
import {
  MemorySessionFamilyStore,
  isSessionFamilyRecord,
  transitionSessionFamily,
} from '../src/sessionFamily'
import {
  SESSION_COOKIE_NAME,
  createSessionCookieValue,
  expiredSessionSetCookie,
  readVerifiedSessionCookie,
  sessionSetCookie,
} from '../src/sessionCookie'
import type { SessionFamilyRecord } from '../src/types'

const ORIGIN = 'https://warpkeep.com'
const FAMILY_ID = 'A'.repeat(32)
const COOKIE_KEY = 'test-only-cookie-hmac-key-'.repeat(2)
const NOW = 1_800_000_000_000

function record(overrides: Partial<SessionFamilyRecord> = {}): SessionFamilyRecord {
  return {
    version: 1,
    origin: ORIGIN,
    identity: { fid: '12345' },
    state: 'bound',
    authEpoch: 7,
    rememberDevice: true,
    currentGeneration: 1,
    createdAt: NOW,
    expiresAt: NOW + 30 * 24 * 60 * 60 * 1_000,
    ...overrides,
  }
}

describe('rotating browser session families', () => {
  it('accepts only the verified FID in durable identity state', () => {
    expect(isSessionFamilyRecord(record())).toBe(true)
    expect(isSessionFamilyRecord({
      ...record(),
      identity: { fid: '12345', username: 'must-not-persist' },
    })).toBe(false)
    expect(isSessionFamilyRecord({
      ...record(),
      identity: { fid: '12345', displayName: 'Must Not Persist' },
    })).toBe(false)
    expect(isSessionFamilyRecord({
      ...record(),
      identity: { fid: '12345', pfpUrl: 'https://tracking.example/pfp.png' },
    })).toBe(false)
  })

  it('rotates once and makes the immediately previous generation idempotent during recovery grace', () => {
    const first = transitionSessionFamily(
      record(),
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 7 },
      NOW + 1_000,
    )
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error('expected rotation')
    expect(first.record).toMatchObject({
      currentGeneration: 2,
      previousGeneration: 1,
      previousGenerationGraceUntil: NOW + 31_000,
    })

    const retry = transitionSessionFamily(
      first.record,
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 7 },
      NOW + 2_000,
    )
    expect(retry).toEqual({ kind: 'ok', record: first.record })

    expect(transitionSessionFamily(
      first.record,
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 7 },
      NOW + 31_001,
    )).toEqual({ kind: 'revoke' })
  })

  it('binds a genuinely pending family once but never lets a bound family adopt another epoch', () => {
    const pending = record({ state: 'pending', authEpoch: undefined })
    expect(isSessionFamilyRecord(pending)).toBe(true)
    const bound = transitionSessionFamily(
      pending,
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 11 },
      NOW + 1,
    )
    expect(bound.kind).toBe('ok')
    if (bound.kind !== 'ok') throw new Error('expected binding')
    expect(bound.record).toMatchObject({ state: 'bound', authEpoch: 11 })

    expect(transitionSessionFamily(
      bound.record,
      bound.record.currentGeneration,
      ORIGIN,
      { state: 'enabled', authEpoch: 12 },
      NOW + 2,
    )).toEqual({ kind: 'revoke' })
    expect(transitionSessionFamily(
      bound.record,
      bound.record.currentGeneration,
      ORIGIN,
      { state: 'missing', authEpoch: 0 },
      NOW + 2,
    )).toEqual({ kind: 'revoke' })
  })

  it('revokes disabled, cross-origin, expired, and unknown-generation attempts', () => {
    for (const [candidate, generation, origin, admission, now] of [
      [record(), 1, ORIGIN, { state: 'disabled', authEpoch: 0 }, NOW + 1],
      [record(), 1, 'https://hostile.example', { state: 'enabled', authEpoch: 7 }, NOW + 1],
      [record(), 9, ORIGIN, { state: 'enabled', authEpoch: 7 }, NOW + 1],
      [record(), 1, ORIGIN, { state: 'enabled', authEpoch: 7 }, record().expiresAt],
    ] as const) {
      expect(transitionSessionFamily(candidate, generation, origin, admission, now)).toEqual({ kind: 'revoke' })
    }
  })

  it('rejects corrupted rotation state unless the previous generation is exactly adjacent', () => {
    const corrupted = record({
      currentGeneration: 3,
      previousGeneration: 1,
      previousGenerationGraceUntil: NOW + 30_000,
    })
    expect(isSessionFamilyRecord(corrupted)).toBe(false)
    expect(transitionSessionFamily(
      corrupted,
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 7 },
      NOW + 1,
    )).toEqual({ kind: 'revoke' })
  })

  it('deletes the whole local family after stale reuse or an epoch mismatch', async () => {
    const store = new MemorySessionFamilyStore()
    await store.create(FAMILY_ID, record())
    const first = await store.refresh(
      FAMILY_ID,
      1,
      ORIGIN,
      { state: 'enabled', authEpoch: 7 },
      NOW + 1,
    )
    expect(first?.record.currentGeneration).toBe(2)
    await expect(store.refresh(
      FAMILY_ID,
      2,
      ORIGIN,
      { state: 'enabled', authEpoch: 8 },
      NOW + 2,
    )).resolves.toBeNull()
    await expect(store.get(FAMILY_ID)).resolves.toBeNull()
  })
})

describe('opaque host-only session cookie', () => {
  it('authenticates only an untampered HMAC reference and rejects duplicates', async () => {
    const value = await createSessionCookieValue(COOKIE_KEY, FAMILY_ID, 9)
    const request = new Request('https://auth.warpkeep.com/v2/session/refresh', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${value}` },
    })
    await expect(readVerifiedSessionCookie(request, COOKIE_KEY)).resolves.toEqual({
      familyId: FAMILY_ID,
      generation: 9,
    })
    await expect(readVerifiedSessionCookie(request, `${COOKIE_KEY}wrong`)).resolves.toBeNull()

    const tampered = new Request(request.url, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${value.slice(0, -1)}A` },
    })
    await expect(readVerifiedSessionCookie(tampered, COOKIE_KEY)).resolves.toBeNull()
    const duplicate = new Request(request.url, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${value}; ${SESSION_COOKIE_NAME}=${value}` },
    })
    await expect(readVerifiedSessionCookie(duplicate, COOKIE_KEY)).resolves.toBeNull()
  })

  it('uses the exact Secure HttpOnly host-only attributes and never sets Domain', async () => {
    const value = await createSessionCookieValue(COOKIE_KEY, FAMILY_ID, 1)
    const persistent = sessionSetCookie(value, true, 2_592_000)
    expect(persistent).toBe(
      `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`,
    )
    expect(sessionSetCookie(value, false, 2_592_000)).toBe(
      `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict`,
    )
    expect(expiredSessionSetCookie()).toBe(
      `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
    )
    expect(persistent).not.toContain('Domain=')
  })
})
