import type { PublicEcJwk } from './config'
import { randomId } from './jwt'
import type {
  DurableObjectNamespace,
  DurableObjectState,
  QaObserverChallengeRecord,
  QaObserverChallengeStore,
} from './types'

export const QA_OBSERVER_SCOPE = 'realm.snapshot' as const
export const QA_OBSERVER_CHALLENGE_PATH = '/v1/qa/challenge'
export const QA_OBSERVER_SNAPSHOT_PATH = '/v1/qa/realm-snapshot'

const INTERNAL_ORIGIN = 'https://qa-challenge-replay-guard.internal'
const RECORD_KEY = 'qa-observer-challenge'
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const THUMBPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/
const RECORD_KEYS = Object.freeze([
  'version',
  'requestId',
  'challenge',
  'createdAt',
  'expiresAt',
  'keyThumbprint',
  'scope',
  'signingInput',
])
const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL_PATTERN.test(value)) return null
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - normalized.length % 4) % 4
  try {
    const decoded = Uint8Array.from(
      atob(`${normalized}${'='.repeat(padding)}`),
      character => character.charCodeAt(0),
    )
    return base64Url(decoded) === value ? decoded : null
  } catch {
    return null
  }
}

/** RFC 7638 thumbprint for the one exact registered public P-256 key. */
export async function qaObserverKeyThumbprint(jwk: PublicEcJwk): Promise<string> {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical))))
}

/** Cryptographically validate that the registered coordinates are a usable P-256 point. */
export async function importQaObserverVerificationKey(jwk: PublicEcJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
}

/**
 * Canonical helper signing contract: UTF-8 ASCII, exact LF separators, no
 * trailing newline. Every interpolated value has a closed grammar.
 */
export function canonicalQaObserverSigningInput(input: Readonly<{
  issuer: string
  requestId: string
  challenge: string
  keyThumbprint: string
  expiresAt: number
}>): string {
  if (
    !/^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\:\d+)?$/.test(input.issuer)
    || !BASE64URL_PATTERN.test(input.requestId)
    || input.requestId.length < 24
    || input.requestId.length > 128
    || !BASE64URL_PATTERN.test(input.challenge)
    || input.challenge.length < 43
    || input.challenge.length > 128
    || !THUMBPRINT_PATTERN.test(input.keyThumbprint)
    || !Number.isSafeInteger(input.expiresAt)
    || input.expiresAt < 0
  ) {
    throw new Error('Invalid QA observer signing input.')
  }
  return [
    'warpkeep-qa-observer-v1',
    `issuer=${input.issuer}`,
    `endpoint=${QA_OBSERVER_SNAPSHOT_PATH}`,
    `scope=${QA_OBSERVER_SCOPE}`,
    `requestId=${input.requestId}`,
    `challenge=${input.challenge}`,
    `keyThumbprint=${input.keyThumbprint}`,
    `expiresAt=${input.expiresAt}`,
  ].join('\n')
}

export function createQaObserverChallenge(
  issuer: string,
  keyThumbprint: string,
  createdAt: number,
  expiresAt: number,
): QaObserverChallengeRecord {
  if (
    !Number.isSafeInteger(createdAt)
    || createdAt < 0
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= createdAt
  ) {
    throw new Error('Invalid QA observer challenge lifetime.')
  }
  const requestId = randomId(24)
  const challenge = randomId(32)
  return Object.freeze({
    version: 1,
    requestId,
    challenge,
    createdAt,
    expiresAt,
    keyThumbprint,
    scope: QA_OBSERVER_SCOPE,
    signingInput: canonicalQaObserverSigningInput({
      issuer,
      requestId,
      challenge,
      keyThumbprint,
      expiresAt,
    }),
  })
}

export function isQaObserverChallengeRecord(value: unknown): value is QaObserverChallengeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== RECORD_KEYS.length || keys.some(key => !RECORD_KEYS.includes(key))) return false
  const record = value as Partial<QaObserverChallengeRecord>
  return record.version === 1
    && typeof record.requestId === 'string'
    && BASE64URL_PATTERN.test(record.requestId)
    && record.requestId.length >= 24
    && record.requestId.length <= 128
    && typeof record.challenge === 'string'
    && BASE64URL_PATTERN.test(record.challenge)
    && record.challenge.length >= 43
    && record.challenge.length <= 128
    && typeof record.createdAt === 'number'
    && Number.isSafeInteger(record.createdAt)
    && record.createdAt >= 0
    && typeof record.expiresAt === 'number'
    && Number.isSafeInteger(record.expiresAt)
    && record.expiresAt > record.createdAt
    && typeof record.keyThumbprint === 'string'
    && THUMBPRINT_PATTERN.test(record.keyThumbprint)
    && record.scope === QA_OBSERVER_SCOPE
    && typeof record.signingInput === 'string'
    && encoder.encode(record.signingInput).byteLength <= 1_024
}

export function sameQaObserverChallengeRecord(
  left: QaObserverChallengeRecord,
  right: QaObserverChallengeRecord,
): boolean {
  return left.version === right.version
    && left.requestId === right.requestId
    && left.challenge === right.challenge
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.keyThumbprint === right.keyThumbprint
    && left.scope === right.scope
    && left.signingInput === right.signingInput
}

/** Verify exactly one raw IEEE-P1363 P-256 ECDSA signature (r || s). */
export async function verifyQaObserverSignature(
  publicJwk: PublicEcJwk,
  signingInput: string,
  encodedSignature: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{86}$/.test(encodedSignature)) return false
  const signature = decodeBase64Url(encodedSignature)
  if (!signature || signature.byteLength !== 64) return false
  const rawSignature = new Uint8Array(signature.byteLength)
  rawSignature.set(signature)
  const key = await importQaObserverVerificationKey(publicJwk)
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    rawSignature,
    encoder.encode(signingInput),
  )
}

function internalUrl(path: 'record' | 'consume'): string {
  return `${INTERNAL_ORIGIN}/${path}`
}

async function responseRecord(response: Response): Promise<QaObserverChallengeRecord | null> {
  if (!response.ok) return null
  const value: unknown = await response.json()
  return isQaObserverChallengeRecord(value) ? value : null
}

export class DurableObjectQaObserverChallengeStore implements QaObserverChallengeStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  private stub(requestId: string) {
    return this.namespace.get(this.namespace.idFromName(`warpkeep-qa-challenge:v1:${requestId}`))
  }

  async put(challenge: QaObserverChallengeRecord): Promise<void> {
    const response = await this.stub(challenge.requestId).fetch(internalUrl('record'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(challenge),
    })
    if (!response.ok) throw new Error('QA challenge store unavailable.')
  }

  async get(requestId: string): Promise<QaObserverChallengeRecord | null> {
    return responseRecord(await this.stub(requestId).fetch(internalUrl('record')))
  }

  async consume(requestId: string): Promise<QaObserverChallengeRecord | null> {
    return responseRecord(await this.stub(requestId).fetch(internalUrl('consume'), { method: 'POST' }))
  }
}

/** A distinct Durable Object class and namespace keep QA challenges isolated. */
export class QaChallengeReplayGuard {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.origin !== INTERNAL_ORIGIN) return new Response(null, { status: 404 })

    if (url.pathname === '/record' && request.method === 'PUT') {
      const candidate: unknown = await request.json()
      if (!isQaObserverChallengeRecord(candidate) || candidate.expiresAt <= Date.now()) {
        return new Response(null, { status: 400 })
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
      const challenge = await this.readUsableRecord()
      return challenge
        ? Response.json(challenge, { headers: { 'cache-control': 'no-store' } })
        : new Response(null, { status: 404 })
    }

    if (url.pathname === '/consume' && request.method === 'POST') {
      const challenge = await this.readUsableRecord()
      if (!challenge) return new Response(null, { status: 404 })
      await this.state.storage.deleteAll()
      return Response.json(challenge, { headers: { 'cache-control': 'no-store' } })
    }

    return new Response(null, { status: 404 })
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }

  private async readUsableRecord(): Promise<QaObserverChallengeRecord | null> {
    const candidate = await this.state.storage.get<unknown>(RECORD_KEY)
    if (candidate === undefined) return null
    if (!isQaObserverChallengeRecord(candidate) || candidate.expiresAt <= Date.now()) {
      await this.state.storage.deleteAll()
      return null
    }
    return candidate
  }
}

export class MemoryQaObserverChallengeStore implements QaObserverChallengeStore {
  private readonly records = new Map<string, QaObserverChallengeRecord>()

  async put(challenge: QaObserverChallengeRecord): Promise<void> {
    this.records.set(challenge.requestId, challenge)
  }

  async get(requestId: string): Promise<QaObserverChallengeRecord | null> {
    return this.records.get(requestId) ?? null
  }

  async consume(requestId: string): Promise<QaObserverChallengeRecord | null> {
    const challenge = this.records.get(requestId) ?? null
    this.records.delete(requestId)
    return challenge
  }
}
