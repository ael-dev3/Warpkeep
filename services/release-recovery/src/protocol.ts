import { RECOVERY_KEY_ID } from './recoveryPublicKey.js'

export const RECOVERY_ISSUER = 'https://release-auth.warpkeep.com' as const
export const RECOVERY_AUDIENCE = 'warpkeep-0.4.0-sealed-launch' as const

export const RECOVERY_AUTHORIZATION_TYP = 'warpkeep-0.4.0-recovery-authorization+jwt' as const
export const RECOVERY_STATUS_TYP = 'warpkeep-0.4.0-recovery-status+jwt' as const
export const RECOVERY_CLAIM_TYP = 'warpkeep-0.4.0-recovery-claim+jwt' as const
export const RECOVERY_TERMINAL_TYP = 'warpkeep-0.4.0-recovery-terminal+jwt' as const

export type RecoverySignedKind = 'authorization' | 'status' | 'claim' | 'terminal'
export type JsonPrimitive = null | boolean | string | number
export type JsonValue = JsonPrimitive | JsonArray | JsonObject
export interface JsonArray extends ReadonlyArray<JsonValue> {}
export interface JsonObject { readonly [key: string]: JsonValue }
export type ExactObjectFor<K extends readonly string[]> = Readonly<{ [P in K[number]]: JsonValue }>
export type RecoveryJsonObject = Readonly<Record<string, JsonValue>>

export class RecoveryProtocolError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'RecoveryProtocolError'
    this.code = code
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export const RECOVERY_PROTECTED_HEADER_KEYS = ['alg', 'typ', 'kid'] as const

export const RECOVERY_AUTHORIZATION_PAYLOAD_KEYS = [
  'schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'requestId', 'jti',
  'authorizationEpoch', 'repository', 'repositoryId', 'repositoryOwnerId', 'ref',
  'workflowRef', 'workflowSha', 'environment', 'eventName', 'pagesRunId',
  'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
  'predecessorCommit', 'candidateCommit', 'candidateTree', 'sourceClosureProfile',
  'sourceClosureSha256', 'recoveryAuthorizationCoreSha256', 'artifactId',
  'artifactName', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
  'contentManifestSha256', 'deploymentAttestationSha256', 'releaseVersion',
  'operation', 'canonicalOrigin', 'authWorker', 'genesis001Database',
  'genesis002Database', 'ptrDatabase', 'historicalGenesis001ReceiptStatus',
  'historicalGenesis001ReceiptExpectedSha256', 'g001ReleaseVersion',
  'g001PlayerAccessEnabled', 'g001AdmissionStateMutationsEnabled',
  'g001AccessRequestSubmissionsEnabled', 'g001BaselineAbiSha256', 'g002Sealed',
  'g002PlayerCount', 'g002GeneralAdmissionCount', 'ptrSingletonOwnerCount',
  'ptrGeneralAdmissionCount', 'observedFrom', 'observedThrough',
  'issuanceEvidenceSnapshotDigest', 'liveInvariantDigest', 'iat', 'nbf', 'exp',
] as const

export const RECOVERY_STATUS_PAYLOAD_KEYS = [
  'schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'enabled',
  'authorizationEpoch', 'iat', 'nbf', 'exp',
] as const

export const RECOVERY_CLAIM_PAYLOAD_KEYS = [
  'schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'requestId',
  'authorizationJti', 'authorizationJwsSha256', 'pagesRunId', 'pagesRunAttempt',
  'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree',
  'artifactId', 'artifactName', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
  'contentManifestSha256', 'deploymentAttestationSha256', 'operation',
  'canonicalOrigin', 'authorizationEpoch', 'claimSequence', 'claimedAt',
  'claimDeadline', 'iat', 'nbf', 'exp',
] as const

export const RECOVERY_TERMINAL_PAYLOAD_KEYS = [
  'schemaVersion', 'profile', 'iss', 'aud', 'sub', 'kid', 'requestId',
  'authorizationJti', 'authorizationJwsSha256', 'candidateCommit', 'candidateTree',
  'artifactId', 'artifactName', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
  'contentManifestSha256', 'deploymentAttestationSha256', 'operation',
  'canonicalOrigin', 'pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId',
  'sourceVerifyRunAttempt', 'authorizationEpoch', 'completedAt', 'outcome',
  'iat', 'nbf', 'exp',
] as const

const KIND_TYP: Readonly<Record<RecoverySignedKind, string>> = {
  authorization: RECOVERY_AUTHORIZATION_TYP,
  status: RECOVERY_STATUS_TYP,
  claim: RECOVERY_CLAIM_TYP,
  terminal: RECOVERY_TERMINAL_TYP,
}

const KIND_PAYLOAD_KEYS: Readonly<Record<RecoverySignedKind, readonly string[]>> = {
  authorization: RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  status: RECOVERY_STATUS_PAYLOAD_KEYS,
  claim: RECOVERY_CLAIM_PAYLOAD_KEYS,
  terminal: RECOVERY_TERMINAL_PAYLOAD_KEYS,
}

const KIND_PROFILE: Readonly<Record<RecoverySignedKind, readonly [string, string]>> = {
  authorization: ['warpkeep-0.4.0-recovery-authorization-v1', 'warpkeep-0.4.0-recovery-deployment'],
  status: ['warpkeep-0.4.0-recovery-status-v1', 'warpkeep-0.4.0-recovery-control-status'],
  claim: ['warpkeep-0.4.0-recovery-claim-v1', 'warpkeep-0.4.0-recovery-deployment-claim'],
  terminal: ['warpkeep-0.4.0-recovery-terminal-v1', 'warpkeep-0.4.0-recovery-terminal-attestation'],
}

function fail(code: string): never {
  throw new RecoveryProtocolError(code)
}

function isSafeJsonNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value)
}

function hasOnlyDataProperties(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    if (Object.getOwnPropertySymbols(value).length !== 0) return false

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return false
    }
    return true
  } catch {
    return false
  }
}

function assertJsonValue(value: unknown, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && hasUnpairedSurrogate(value)) fail('RECOVERY_JSON_INVALID')
    return
  }
  if (typeof value === 'number') {
    if (!isSafeJsonNumber(value)) fail('RECOVERY_JSON_INVALID')
    return
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail('RECOVERY_JSON_INVALID')
    seen.add(value)
    for (const item of value) assertJsonValue(item, seen)
    seen.delete(value)
    return
  }
  if (typeof value !== 'object' || value === null || !hasOnlyDataProperties(value)) {
    fail('RECOVERY_JSON_INVALID')
  }
  if (seen.has(value)) fail('RECOVERY_JSON_INVALID')
  seen.add(value)
  for (const key of Object.keys(value)) assertJsonValue((value as Record<string, unknown>)[key], seen)
  seen.delete(value)
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function encodeJson(value: JsonValue, sortObjectKeys: boolean): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => encodeJson(item, sortObjectKeys)).join(',')}]`

  const object = value as Readonly<Record<string, JsonValue>>
  const keys = Object.keys(object)
  if (sortObjectKeys) keys.sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${encodeJson(object[key], sortObjectKeys)}`).join(',')}}`
}

export function canonicalMapJsonBytes(value: JsonValue): Uint8Array {
  assertJsonValue(value)
  return encoder.encode(encodeJson(value, true))
}

export function serializeExactObject<K extends readonly string[]>(keys: K, value: ExactObjectFor<K>): Uint8Array {
  try {
    if (!hasOnlyDataProperties(value as object)) fail('RECOVERY_JSON_INVALID')
    if (new Set(keys).size !== keys.length || keys.some((key) => typeof key !== 'string')) fail('RECOVERY_JSON_INVALID')
    const record = value as Readonly<Record<string, JsonValue>>
    const actualKeys = Object.keys(record)
    if (actualKeys.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail('RECOVERY_JSON_INVALID')
    for (const key of actualKeys) {
      if (!keys.includes(key)) fail('RECOVERY_JSON_INVALID')
      assertJsonValue(record[key])
    }
    const exact = `{${keys.map((key) => `${JSON.stringify(key)}:${encodeJson(record[key], true)}`).join(',')}}`
    return encoder.encode(exact)
  } catch (error) {
    if (error instanceof RecoveryProtocolError) throw error
    fail('RECOVERY_JSON_INVALID')
  }
}

class StrictJsonParser {
  #index = 0

  constructor(private readonly source: string) {}

  parse(): JsonValue {
    const value = this.parseValue()
    if (this.#index !== this.source.length) fail('RECOVERY_JSON_INVALID')
    return value
  }

  private parseValue(): JsonValue {
    const character = this.source[this.#index]
    if (character === '{') return this.parseObject()
    if (character === '[') return this.parseArray()
    if (character === '"') return this.parseString()
    if (character === 't' && this.consume('true')) return true
    if (character === 'f' && this.consume('false')) return false
    if (character === 'n' && this.consume('null')) return null
    if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) return this.parseNumber()
    fail('RECOVERY_JSON_INVALID')
  }

  private parseObject(): RecoveryJsonObject {
    this.#index += 1
    const result: Record<string, JsonValue> = Object.create(null)
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return result
    }
    while (true) {
      if (this.source[this.#index] !== '"') fail('RECOVERY_JSON_INVALID')
      const key = this.parseString()
      if (Object.hasOwn(result, key) || this.source[this.#index] !== ':') fail('RECOVERY_JSON_INVALID')
      this.#index += 1
      result[key] = this.parseValue()
      const separator = this.source[this.#index]
      if (separator === '}') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail('RECOVERY_JSON_INVALID')
      this.#index += 1
    }
  }

  private parseArray(): readonly JsonValue[] {
    this.#index += 1
    const result: JsonValue[] = []
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return result
    }
    while (true) {
      result.push(this.parseValue())
      const separator = this.source[this.#index]
      if (separator === ']') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail('RECOVERY_JSON_INVALID')
      this.#index += 1
    }
  }

  private parseString(): string {
    this.#index += 1
    let result = ''
    while (this.#index < this.source.length) {
      const character = this.source[this.#index++]
      if (character === '"') {
        if (hasUnpairedSurrogate(result)) fail('RECOVERY_JSON_INVALID')
        return result
      }
      if (character === '\\') {
        const escaped = this.source[this.#index++]
        const simple = escaped === '"' || escaped === '\\' || escaped === '/' ? escaped : undefined
        if (simple !== undefined) {
          result += simple
          continue
        }
        const controls: Readonly<Record<string, string>> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
        if (escaped !== undefined && Object.hasOwn(controls, escaped)) {
          result += controls[escaped]
          continue
        }
        if (escaped === 'u') {
          const hex = this.source.slice(this.#index, this.#index + 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('RECOVERY_JSON_INVALID')
          result += String.fromCharCode(Number.parseInt(hex, 16))
          this.#index += 4
          continue
        }
        fail('RECOVERY_JSON_INVALID')
      }
      if (character === undefined || character < ' ' || character === '\\') fail('RECOVERY_JSON_INVALID')
      result += character
    }
    fail('RECOVERY_JSON_INVALID')
  }

  private parseNumber(): number {
    const rest = this.source.slice(this.#index)
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest)
    if (match === null) fail('RECOVERY_JSON_INVALID')
    this.#index += match[0].length
    const number = Number(match[0])
    if (!isSafeJsonNumber(number)) fail('RECOVERY_JSON_INVALID')
    return number
  }

  private consume(value: string): boolean {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) return false
    this.#index += value.length
    return true
  }
}

export function parseRecoveryJson(value: unknown): JsonValue {
  if (typeof value !== 'string') fail('RECOVERY_JSON_INVALID')
  try {
    const parsed = new StrictJsonParser(value).parse()
    const canonical = decoder.decode(canonicalMapJsonBytes(parsed))
    if (canonical !== value) fail('RECOVERY_JSON_INVALID')
    return parsed
  } catch (error) {
    if (error instanceof RecoveryProtocolError) throw error
    fail('RECOVERY_JSON_INVALID')
  }
}

function parseExactJsonObject(bytes: Uint8Array, keys: readonly string[], code: string): RecoveryJsonObject {
  let raw: string
  try {
    raw = decoder.decode(bytes)
  } catch {
    fail(code)
  }
  try {
    const parsed = new StrictJsonParser(raw).parse()
    if (!isJsonObject(parsed) || Object.keys(parsed).length !== keys.length || keys.some((key) => !Object.hasOwn(parsed, key))) fail(code)
    const canonical = decoder.decode(serializeExactObject(keys, parsed as ExactObjectFor<readonly string[]>))
    if (raw !== canonical) fail(code)
    return parsed
  } catch (error) {
    if (error instanceof RecoveryProtocolError) {
      if (error.code === code) throw error
      fail(code)
    }
    fail(code)
  }
}

function isJsonObject(value: JsonValue): value is RecoveryJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseRecoveryHeader(value: unknown): Readonly<{ alg: 'ES256'; typ: string; kid: typeof RECOVERY_KEY_ID }> {
  if (typeof value !== 'string') fail('RECOVERY_JWS_HEADER_INVALID')
  const header = parseExactJsonObject(encoder.encode(value), RECOVERY_PROTECTED_HEADER_KEYS, 'RECOVERY_JWS_HEADER_INVALID')
  if (header.alg !== 'ES256' || typeof header.typ !== 'string' || header.kid !== RECOVERY_KEY_ID) fail('RECOVERY_JWS_HEADER_INVALID')
  if (!Object.values(KIND_TYP).includes(header.typ)) fail('RECOVERY_JWS_HEADER_INVALID')
  return { alg: 'ES256', typ: header.typ, kid: RECOVERY_KEY_ID }
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) fail('RECOVERY_JWS_COMPACT_INVALID')
  try {
    const standard = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(standard)
    const result = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (base64UrlEncode(result) !== value) fail('RECOVERY_JWS_COMPACT_INVALID')
    return result
  } catch (error) {
    if (error instanceof RecoveryProtocolError) throw error
    fail('RECOVERY_JWS_COMPACT_INVALID')
  }
}

export function base64UrlEncode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function assertPayloadConstraints(kind: RecoverySignedKind, payload: RecoveryJsonObject): void {
  const [profile, subject] = KIND_PROFILE[kind]
  if (payload.schemaVersion !== 1 || payload.profile !== profile || payload.iss !== RECOVERY_ISSUER || payload.aud !== RECOVERY_AUDIENCE || payload.sub !== subject || payload.kid !== RECOVERY_KEY_ID) {
    fail('RECOVERY_JWS_PAYLOAD_INVALID')
  }
  const iat = payload.iat
  const exp = payload.exp
  const claimDeadline = payload.claimDeadline
  if (!isPositiveSafeInteger(payload.authorizationEpoch) || !isSafeJsonNumber(iat) || payload.nbf !== iat || !isSafeJsonNumber(exp) || exp < iat) {
    fail('RECOVERY_JWS_PAYLOAD_INVALID')
  }
  const lifetime = exp - iat
  if ((kind === 'authorization' && lifetime > 900) || (kind === 'status' && lifetime > 60) || (kind === 'claim' && (lifetime > 120 || !isSafeJsonNumber(claimDeadline) || exp > claimDeadline)) || (kind === 'terminal' && lifetime > 900)) {
    fail('RECOVERY_JWS_PAYLOAD_INVALID')
  }
  if (kind === 'status' && typeof payload.enabled !== 'boolean') fail('RECOVERY_JWS_PAYLOAD_INVALID')
  if (kind === 'terminal' && payload.outcome !== 'completed' && payload.outcome !== 'not-deployed') fail('RECOVERY_JWS_PAYLOAD_INVALID')
}

function isPositiveSafeInteger(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseRecoveryPayload(bytes: Uint8Array, kind: RecoverySignedKind): RecoveryJsonObject {
  const payload = parseExactJsonObject(bytes, KIND_PAYLOAD_KEYS[kind], 'RECOVERY_JWS_PAYLOAD_INVALID')
  assertPayloadConstraints(kind, payload)
  return payload
}

export function parseRecoveryCompactJws(value: unknown, kind: RecoverySignedKind): Readonly<{ protectedBytes: Uint8Array; payloadBytes: Uint8Array; signature: Uint8Array }> {
  if (typeof value !== 'string') fail('RECOVERY_JWS_COMPACT_INVALID')
  const segments = value.split('.')
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) fail('RECOVERY_JWS_COMPACT_INVALID')
  const [protectedSegment, payloadSegment, signatureSegment] = segments
  const protectedBytes = base64UrlDecode(protectedSegment)
  const payloadBytes = base64UrlDecode(payloadSegment)
  const signature = base64UrlDecode(signatureSegment)
  let protectedText: string
  try {
    protectedText = decoder.decode(protectedBytes)
  } catch {
    fail('RECOVERY_JWS_HEADER_INVALID')
  }
  const header = parseRecoveryHeader(protectedText)
  if (header.typ !== KIND_TYP[kind]) fail('RECOVERY_JWS_HEADER_INVALID')
  parseRecoveryPayload(payloadBytes, kind)
  if (signature.length !== 64) fail('RECOVERY_JWS_COMPACT_INVALID')
  return { protectedBytes, payloadBytes, signature }
}

export async function sha256Hex(domain: string, value: Uint8Array): Promise<string> {
  if (typeof domain !== 'string' || domain.length === 0 || hasUnpairedSurrogate(domain)) fail('RECOVERY_HASH_INPUT_INVALID')
  const domainBytes = encoder.encode(`warpkeep-recovery-v1:${domain}:`)
  const input = new Uint8Array(domainBytes.length + value.length)
  input.set(domainBytes)
  input.set(value, domainBytes.length)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
