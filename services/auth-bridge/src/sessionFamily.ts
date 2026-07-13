import { SESSION_FAMILY_TTL_SECONDS } from './config'
import type {
  AdmissionResolution,
  DurableObjectNamespace,
  DurableObjectState,
  PublicIdentity,
  SessionFamilyRecord,
  SessionFamilyRefreshResult,
  SessionFamilyStore,
} from './types'

const INTERNAL_ORIGIN = 'https://session-family.internal'
const RECORD_KEY = 'session-family'
const ROTATION_RECOVERY_GRACE_MILLISECONDS = 30_000
const MAX_GENERATION = 0xffff_ffff
const MAX_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_SESSION_FAMILY_TTL_MILLISECONDS = SESSION_FAMILY_TTL_SECONDS * 1_000

type JsonRecord = Record<string, unknown>

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: JsonRecord, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key))
}

function isSafeFid(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return false
  try {
    return BigInt(value) <= MAX_SUPPORTED_FID
  } catch {
    return false
  }
}

function isPublicIdentity(value: unknown): value is PublicIdentity {
  return isObject(value) && hasExactKeys(value, ['fid']) && isSafeFid(value.fid)
}

function isOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password
      && url.origin === value
      && url.pathname === '/'
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

function isGeneration(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_GENERATION
}

export function isAdmissionResolution(value: unknown): value is AdmissionResolution {
  if (!isObject(value) || !hasExactKeys(value, ['state', 'authEpoch'])) return false
  if (value.state === 'enabled') {
    return typeof value.authEpoch === 'number'
      && Number.isSafeInteger(value.authEpoch)
      && value.authEpoch >= 1
      && value.authEpoch <= 0xffff_ffff
  }
  return (value.state === 'missing' || value.state === 'disabled') && value.authEpoch === 0
}

export function isSessionFamilyRecord(value: unknown): value is SessionFamilyRecord {
  if (
    !isObject(value)
    || !hasExactKeys(
      value,
      [
        'version', 'origin', 'identity', 'state', 'rememberDevice', 'currentGeneration',
        'createdAt', 'expiresAt',
      ],
      ['authEpoch', 'previousGeneration', 'previousGenerationGraceUntil'],
    )
    || value.version !== 1
    || !isOrigin(value.origin)
    || !isPublicIdentity(value.identity)
    || typeof value.rememberDevice !== 'boolean'
    || !isGeneration(value.currentGeneration)
    || typeof value.createdAt !== 'number'
    || !Number.isSafeInteger(value.createdAt)
    || value.createdAt < 0
    || typeof value.expiresAt !== 'number'
    || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= value.createdAt
    || value.expiresAt - value.createdAt > MAX_SESSION_FAMILY_TTL_MILLISECONDS
  ) return false

  if (value.state === 'pending') {
    if (value.authEpoch !== undefined) return false
  } else if (
    value.state !== 'bound'
    || typeof value.authEpoch !== 'number'
    || !Number.isSafeInteger(value.authEpoch)
    || value.authEpoch < 1
    || value.authEpoch > 0xffff_ffff
  ) return false

  const hasPrevious = value.previousGeneration !== undefined
  const hasGrace = value.previousGenerationGraceUntil !== undefined
  if (hasPrevious !== hasGrace) return false
  if (hasPrevious) {
    if (
      !isGeneration(value.previousGeneration)
      || value.previousGeneration !== value.currentGeneration - 1
      || typeof value.previousGenerationGraceUntil !== 'number'
      || !Number.isSafeInteger(value.previousGenerationGraceUntil)
      || value.previousGenerationGraceUntil < value.createdAt
      || value.previousGenerationGraceUntil > value.expiresAt
    ) return false
  }
  return true
}

function readRefreshRequest(value: unknown): {
  presentedGeneration: number
  origin: string
  admission: AdmissionResolution
  now: number
} | null {
  if (!isObject(value) || !hasExactKeys(value, ['presentedGeneration', 'origin', 'admission', 'now'])) return null
  if (
    !isGeneration(value.presentedGeneration)
    || !isOrigin(value.origin)
    || !isAdmissionResolution(value.admission)
    || typeof value.now !== 'number'
    || !Number.isSafeInteger(value.now)
    || value.now < 0
  ) return null
  return {
    presentedGeneration: value.presentedGeneration,
    origin: value.origin,
    admission: value.admission,
    now: value.now,
  }
}

type RefreshTransition =
  | Readonly<{ kind: 'ok'; record: SessionFamilyRecord }>
  | Readonly<{ kind: 'revoke' }>

export function transitionSessionFamily(
  record: SessionFamilyRecord,
  presentedGeneration: number,
  origin: string,
  admission: AdmissionResolution,
  now: number,
): RefreshTransition {
  if (
    !isSessionFamilyRecord(record)
    || !isGeneration(presentedGeneration)
    || !isOrigin(origin)
    || !isAdmissionResolution(admission)
    || !Number.isSafeInteger(now)
    || now < record.createdAt
    || now >= record.expiresAt
    || origin !== record.origin
  ) return { kind: 'revoke' }

  let state = record.state
  let authEpoch = record.authEpoch
  if (state === 'bound') {
    if (admission.state !== 'enabled' || admission.authEpoch !== authEpoch) return { kind: 'revoke' }
  } else if (admission.state === 'disabled') {
    return { kind: 'revoke' }
  } else if (admission.state === 'enabled') {
    state = 'bound'
    authEpoch = admission.authEpoch
  }

  if (
    presentedGeneration !== record.currentGeneration
    && !(
      presentedGeneration === record.previousGeneration
      && record.previousGenerationGraceUntil !== undefined
      && now <= record.previousGenerationGraceUntil
    )
  ) return { kind: 'revoke' }

  if (presentedGeneration === record.previousGeneration) {
    const recovered = {
      ...record,
      state,
      ...(state === 'bound' ? { authEpoch } : { authEpoch: undefined }),
    }
    return isSessionFamilyRecord(recovered)
      ? { kind: 'ok', record: recovered }
      : { kind: 'revoke' }
  }

  if (record.currentGeneration >= MAX_GENERATION) return { kind: 'revoke' }
  const rotated: SessionFamilyRecord = {
    ...record,
    state,
    ...(state === 'bound' ? { authEpoch } : {}),
    currentGeneration: record.currentGeneration + 1,
    previousGeneration: record.currentGeneration,
    previousGenerationGraceUntil: Math.min(
      record.expiresAt,
      now + ROTATION_RECOVERY_GRACE_MILLISECONDS,
    ),
  }
  return isSessionFamilyRecord(rotated)
    ? { kind: 'ok', record: rotated }
    : { kind: 'revoke' }
}

function internalUrl(path: 'record' | 'refresh' | 'revoke'): string {
  return `${INTERNAL_ORIGIN}/${path}`
}

async function readRecordResponse(response: Response): Promise<SessionFamilyRecord | null> {
  if (response.status === 401 || response.status === 404) return null
  if (!response.ok) throw new Error('Session family store unavailable.')
  const candidate: unknown = await response.json()
  if (!isSessionFamilyRecord(candidate)) throw new Error('Session family store returned invalid state.')
  return candidate
}

export class DurableObjectSessionFamilyStore implements SessionFamilyStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  private stub(familyId: string) {
    return this.namespace.get(this.namespace.idFromName(`warpkeep-session:v1:${familyId}`))
  }

  async create(familyId: string, record: SessionFamilyRecord): Promise<void> {
    const response = await this.stub(familyId).fetch(internalUrl('record'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    })
    if (!response.ok) throw new Error('Session family store unavailable.')
  }

  async get(familyId: string): Promise<SessionFamilyRecord | null> {
    return readRecordResponse(await this.stub(familyId).fetch(internalUrl('record')))
  }

  async refresh(
    familyId: string,
    presentedGeneration: number,
    origin: string,
    admission: AdmissionResolution,
    now: number,
  ): Promise<SessionFamilyRefreshResult | null> {
    const response = await this.stub(familyId).fetch(internalUrl('refresh'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presentedGeneration, origin, admission, now }),
    })
    const record = await readRecordResponse(response)
    return record ? Object.freeze({ familyId, record }) : null
  }

  async revoke(familyId: string): Promise<void> {
    const response = await this.stub(familyId).fetch(internalUrl('revoke'), { method: 'POST' })
    if (response.status !== 204 && response.status !== 404) {
      throw new Error('Session family store unavailable.')
    }
  }
}

export class SessionFamily {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.origin !== INTERNAL_ORIGIN) return new Response(null, { status: 404 })

    if (url.pathname === '/record' && request.method === 'PUT') {
      const candidate: unknown = await request.json()
      if (!isSessionFamilyRecord(candidate) || candidate.createdAt > Date.now() || candidate.expiresAt <= Date.now()) {
        return new Response(null, { status: 400 })
      }
      if ((await this.state.storage.get<unknown>(RECORD_KEY)) !== undefined) {
        return new Response(null, { status: 409 })
      }
      try {
        await this.state.storage.put(RECORD_KEY, candidate)
        await this.state.storage.setAlarm(candidate.expiresAt)
      } catch (error) {
        await this.state.storage.deleteAll()
        throw error
      }
      return new Response(null, { status: 204 })
    }

    if (url.pathname === '/record' && request.method === 'GET') {
      const candidate = await this.state.storage.get<unknown>(RECORD_KEY)
      if (!isSessionFamilyRecord(candidate) || candidate.expiresAt <= Date.now()) {
        if (candidate !== undefined) await this.state.storage.deleteAll()
        return new Response(null, { status: 404 })
      }
      return Response.json(candidate, { headers: { 'cache-control': 'no-store' } })
    }

    if (url.pathname === '/refresh' && request.method === 'POST') {
      const input = readRefreshRequest(await request.json())
      if (!input) return new Response(null, { status: 400 })
      const outcome = await this.state.storage.transaction(async (transaction) => {
        const candidate = await transaction.get<unknown>(RECORD_KEY)
        if (!isSessionFamilyRecord(candidate)) {
          await transaction.delete(RECORD_KEY)
          return null
        }
        const transition = transitionSessionFamily(
          candidate,
          input.presentedGeneration,
          input.origin,
          input.admission,
          input.now,
        )
        if (transition.kind === 'revoke') {
          await transaction.delete(RECORD_KEY)
          return null
        }
        await transaction.put(RECORD_KEY, transition.record)
        return transition.record
      })
      if (!outcome) {
        await this.state.storage.deleteAll()
        return new Response(null, { status: 401 })
      }
      return Response.json(outcome, { headers: { 'cache-control': 'no-store' } })
    }

    if (url.pathname === '/revoke' && request.method === 'POST') {
      await this.state.storage.deleteAll()
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }
}

/** Deterministic local adapter for app tests; production always uses a Durable Object. */
export class MemorySessionFamilyStore implements SessionFamilyStore {
  private readonly records = new Map<string, SessionFamilyRecord>()

  async create(familyId: string, record: SessionFamilyRecord): Promise<void> {
    if (this.records.has(familyId) || !isSessionFamilyRecord(record)) {
      throw new Error('Session family store unavailable.')
    }
    this.records.set(familyId, record)
  }

  async get(familyId: string): Promise<SessionFamilyRecord | null> {
    return this.records.get(familyId) ?? null
  }

  async refresh(
    familyId: string,
    presentedGeneration: number,
    origin: string,
    admission: AdmissionResolution,
    now: number,
  ): Promise<SessionFamilyRefreshResult | null> {
    const record = this.records.get(familyId)
    if (!record) return null
    const transition = transitionSessionFamily(record, presentedGeneration, origin, admission, now)
    if (transition.kind === 'revoke') {
      this.records.delete(familyId)
      return null
    }
    this.records.set(familyId, transition.record)
    return Object.freeze({ familyId, record: transition.record })
  }

  async revoke(familyId: string): Promise<void> {
    this.records.delete(familyId)
  }
}
