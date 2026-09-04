import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  RECOVERY_AUTHORIZATION_TYP,
  RECOVERY_CLAIM_PAYLOAD_KEYS,
  RECOVERY_CLAIM_TYP,
  RECOVERY_STATUS_PAYLOAD_KEYS,
  RECOVERY_STATUS_TYP,
  RECOVERY_TERMINAL_PAYLOAD_KEYS,
  RECOVERY_TERMINAL_TYP,
  RecoveryProtocolError,
  base64UrlEncode,
  canonicalMapJsonBytes,
  parseRecoveryCompactJws,
  parseRecoveryPayload,
  serializeExactObject,
  snapshotJsonValue,
  type ExactObjectFor,
  type RecoveryJsonObject,
} from './protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT, RECOVERY_PUBLIC_JWK } from './recoveryPublicKey.js'

export const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
export const P256_HALF_ORDER = P256_ORDER / 2n

export type RecoveryAuthorizationPayload = ExactObjectFor<typeof RECOVERY_AUTHORIZATION_PAYLOAD_KEYS>
export type RecoveryStatusPayload = ExactObjectFor<typeof RECOVERY_STATUS_PAYLOAD_KEYS>
export type RecoveryClaimPayload = ExactObjectFor<typeof RECOVERY_CLAIM_PAYLOAD_KEYS>
export type RecoveryTerminalPayload = ExactObjectFor<typeof RECOVERY_TERMINAL_PAYLOAD_KEYS>

type RecoveryPayloadByKind = {
  authorization: RecoveryAuthorizationPayload
  status: RecoveryStatusPayload
  claim: RecoveryClaimPayload
  terminal: RecoveryTerminalPayload
}

type RecoveryPublicJwk = Readonly<{ kty: 'EC'; crv: 'P-256'; x: string; y: string }>
type RecoveryPrivateJwk = RecoveryPublicJwk & Readonly<{ d: string }>

function fail(code: string): never {
  throw new RecoveryProtocolError(code)
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

function decodeCanonicalCoordinate(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) fail('RECOVERY_JWS_KEY_INVALID')
  try {
    const standard = value.replace(/-/g, '+').replace(/_/g, '/') + '='
    const binary = atob(standard)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (bytes.length !== 32 || base64UrlEncode(bytes) !== value) fail('RECOVERY_JWS_KEY_INVALID')
  } catch (error) {
    if (error instanceof RecoveryProtocolError) throw error
    fail('RECOVERY_JWS_KEY_INVALID')
  }
}

function snapshotExactJwk(value: unknown, privateKey: boolean): JsonWebKey {
  let snapshot: RecoveryJsonObject
  try {
    const candidate = snapshotJsonValue(value)
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) fail('RECOVERY_JWS_KEY_INVALID')
    snapshot = candidate as RecoveryJsonObject
  } catch {
    fail('RECOVERY_JWS_KEY_INVALID')
  }
  const keys = Object.keys(snapshot).sort()
  const expected = privateKey ? ['crv', 'd', 'kty', 'x', 'y'] : ['crv', 'kty', 'x', 'y']
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('RECOVERY_JWS_KEY_INVALID')
  if (snapshot.kty !== 'EC' || snapshot.crv !== 'P-256' || typeof snapshot.x !== 'string' || typeof snapshot.y !== 'string' || (privateKey && typeof snapshot.d !== 'string')) {
    fail('RECOVERY_JWS_KEY_INVALID')
  }
  for (const coordinate of privateKey ? [snapshot.x, snapshot.y, snapshot.d as string] : [snapshot.x, snapshot.y]) decodeCanonicalCoordinate(coordinate)
  return privateKey
    ? { kty: 'EC', crv: 'P-256', x: snapshot.x, y: snapshot.y, d: snapshot.d as string }
    : { kty: 'EC', crv: 'P-256', x: snapshot.x, y: snapshot.y }
}

async function importPrivateKey(value: JsonWebKey): Promise<CryptoKey> {
  const snapshot = snapshotExactJwk(value, true)
  try {
    return await crypto.subtle.importKey('jwk', snapshot as RecoveryPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  } catch {
    fail('RECOVERY_JWS_KEY_INVALID')
  }
}

async function importPublicKey(value: JsonWebKey): Promise<CryptoKey> {
  const snapshot = snapshotExactJwk(value, false)
  try {
    return await crypto.subtle.importKey('jwk', { kty: snapshot.kty, crv: snapshot.crv, x: snapshot.x, y: snapshot.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  } catch {
    fail('RECOVERY_JWS_KEY_INVALID')
  }
}

function bytesToInteger(value: Uint8Array): bigint {
  let result = 0n
  for (const byte of value) result = (result << 8n) | BigInt(byte)
  return result
}

function integerTo32Bytes(value: bigint): Uint8Array {
  if (value <= 0n || value >= P256_ORDER) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const result = new Uint8Array(32)
  let current = value
  for (let index = 31; index >= 0; index -= 1) {
    result[index] = Number(current & 0xffn)
    current >>= 8n
  }
  return result
}

function decodeDerLength(value: Uint8Array, offset: number): readonly [number, number] {
  const first = value[offset]
  if (first === undefined) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  if (first < 0x80) return [first, offset + 1]
  const count = first & 0x7f
  if (count === 0 || count > 2 || offset + 1 + count > value.length) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  let length = 0
  for (let index = 0; index < count; index += 1) length = (length << 8) | value[offset + 1 + index]
  if (length < 0x80) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  return [length, offset + 1 + count]
}

function decodeDerInteger(value: Uint8Array, offset: number): readonly [bigint, number] {
  if (value[offset] !== 0x02) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const [length, start] = decodeDerLength(value, offset + 1)
  const end = start + length
  if (length === 0 || end > value.length || value[start] === undefined || (value[start] & 0x80) !== 0) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  if (length > 1 && value[start] === 0 && (value[start + 1] & 0x80) === 0) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  return [bytesToInteger(value.slice(start, end)), end]
}

function asP1363(value: ArrayBuffer): Uint8Array {
  const signature = new Uint8Array(value)
  if (signature.length === 64) return signature
  if (signature[0] !== 0x30) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const [sequenceLength, sequenceStart] = decodeDerLength(signature, 1)
  const sequenceEnd = sequenceStart + sequenceLength
  if (sequenceEnd !== signature.length) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const [r, afterR] = decodeDerInteger(signature, sequenceStart)
  const [s, afterS] = decodeDerInteger(signature, afterR)
  if (afterS !== sequenceEnd) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const result = new Uint8Array(64)
  result.set(integerTo32Bytes(r), 0)
  result.set(integerTo32Bytes(s), 32)
  return result
}

function normalizeLowS(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const r = bytesToInteger(signature.slice(0, 32))
  const s = bytesToInteger(signature.slice(32))
  const result = new Uint8Array(64)
  result.set(integerTo32Bytes(r), 0)
  result.set(integerTo32Bytes(s > P256_HALF_ORDER ? P256_ORDER - s : s), 32)
  return result
}

function assertLowS(signature: Uint8Array): void {
  if (signature.length !== 64) fail('RECOVERY_JWS_SIGNATURE_INVALID')
  const r = bytesToInteger(signature.slice(0, 32))
  const s = bytesToInteger(signature.slice(32))
  if (r <= 0n || r >= P256_ORDER || s <= 0n || s > P256_HALF_ORDER) fail('RECOVERY_JWS_SIGNATURE_INVALID')
}

function payloadConfig(kind: keyof RecoveryPayloadByKind): readonly [readonly string[], string] {
  switch (kind) {
    case 'authorization': return [RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, RECOVERY_AUTHORIZATION_TYP]
    case 'status': return [RECOVERY_STATUS_PAYLOAD_KEYS, RECOVERY_STATUS_TYP]
    case 'claim': return [RECOVERY_CLAIM_PAYLOAD_KEYS, RECOVERY_CLAIM_TYP]
    case 'terminal': return [RECOVERY_TERMINAL_PAYLOAD_KEYS, RECOVERY_TERMINAL_TYP]
  }
}

async function sign<K extends keyof RecoveryPayloadByKind>(kind: K, payload: RecoveryPayloadByKind[K], privateJwk: JsonWebKey): Promise<string> {
  const [payloadKeys, typ] = payloadConfig(kind)
  const protectedBytes = serializeExactObject(['alg', 'typ', 'kid'] as const, {
    alg: 'ES256',
    typ,
    kid: RECOVERY_KEY_ID,
  })
  const payloadBytes = serializeExactObject(payloadKeys, payload)
  // Parsing the just-serialized bytes makes signing subject to the same strict payload gate as verification.
  parseRecoveryPayload(payloadBytes, kind)
  const protectedSegment = base64UrlEncode(protectedBytes)
  const payloadSegment = base64UrlEncode(payloadBytes)
  const signingInput = new TextEncoder().encode(`${protectedSegment}.${payloadSegment}`)
  const key = await importPrivateKey(privateJwk)
  let rawSignature: ArrayBuffer
  try {
    rawSignature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput)
  } catch {
    fail('RECOVERY_JWS_SIGNATURE_INVALID')
  }
  return `${protectedSegment}.${payloadSegment}.${base64UrlEncode(normalizeLowS(asP1363(rawSignature)))}`
}

function parseVerifiedInput<K extends keyof RecoveryPayloadByKind>(kind: K, compact: string): Readonly<{
  parsed: ReturnType<typeof parseRecoveryCompactJws>
  payload: RecoveryPayloadByKind[K]
}> {
  const parsed = parseRecoveryCompactJws(compact, kind)
  const payload = parseRecoveryPayload(parsed.payloadBytes, kind) as RecoveryPayloadByKind[K]
  return { parsed, payload }
}

async function verifyParsedSignature(
  publicJwk: JsonWebKey,
  compact: string,
  parsed: ReturnType<typeof parseRecoveryCompactJws>,
): Promise<void> {
  assertLowS(parsed.signature)
  const [header, body] = compact.split('.')
  const signingInput = new TextEncoder().encode(`${header}.${body}`)
  const key = await importPublicKey(publicJwk)
  let valid = false
  try {
    valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, arrayBuffer(parsed.signature), arrayBuffer(signingInput))
  } catch {
    fail('RECOVERY_JWS_SIGNATURE_INVALID')
  }
  if (!valid) fail('RECOVERY_JWS_SIGNATURE_INVALID')
}

async function verify<K extends keyof RecoveryPayloadByKind>(publicJwk: JsonWebKey, kind: K, compact: string, nowSeconds: number): Promise<RecoveryPayloadByKind[K]> {
  if (!Number.isSafeInteger(nowSeconds)) fail('RECOVERY_JWS_TIME_INVALID')
  const { parsed, payload } = parseVerifiedInput(kind, compact)
  const iat = payload.iat as number
  const exp = payload.exp as number
  if (nowSeconds < iat || nowSeconds >= exp) fail('RECOVERY_JWS_TIME_INVALID')
  await verifyParsedSignature(publicJwk, compact, parsed)
  return payload as RecoveryPayloadByKind[K]
}

/** Internal signer boundary: validates the pinned claim envelope without choosing a time policy. */
export async function verifyRecoveryClaimJwsEnvelopeInternal(compact: string): Promise<RecoveryClaimPayload> {
  const { parsed, payload } = parseVerifiedInput('claim', compact)
  await verifyParsedSignature(RECOVERY_PUBLIC_JWK, compact, parsed)
  return payload
}

export async function signRecoveryAuthorizationJws(payload: RecoveryAuthorizationPayload, privateJwk: JsonWebKey): Promise<string> {
  return sign('authorization', payload, privateJwk)
}

export async function signRecoveryStatusJws(payload: RecoveryStatusPayload, privateJwk: JsonWebKey): Promise<string> {
  return sign('status', payload, privateJwk)
}

export async function signRecoveryClaimJws(payload: RecoveryClaimPayload, privateJwk: JsonWebKey): Promise<string> {
  return sign('claim', payload, privateJwk)
}

export async function signRecoveryTerminalJws(payload: RecoveryTerminalPayload, privateJwk: JsonWebKey): Promise<string> {
  return sign('terminal', payload, privateJwk)
}

export const verifyRecoveryAuthorizationJws = (compact: string, nowSeconds: number) => verify(RECOVERY_PUBLIC_JWK, 'authorization', compact, nowSeconds)
export const verifyRecoveryStatusJws = (compact: string, nowSeconds: number) => verify(RECOVERY_PUBLIC_JWK, 'status', compact, nowSeconds)
export const verifyRecoveryClaimJws = (compact: string, nowSeconds: number) => verify(RECOVERY_PUBLIC_JWK, 'claim', compact, nowSeconds)
export const verifyRecoveryTerminalJws = (compact: string, nowSeconds: number) => verify(RECOVERY_PUBLIC_JWK, 'terminal', compact, nowSeconds)

export async function assertRecoveryPrivateKeyMatchesPinned(privateJwk: JsonWebKey): Promise<void> {
  const privateSnapshot = snapshotExactJwk(privateJwk, true) as RecoveryPrivateJwk
  const publicJwk: RecoveryPublicJwk = { kty: 'EC', crv: 'P-256', x: privateSnapshot.x, y: privateSnapshot.y }
  if (publicJwk.x !== RECOVERY_PUBLIC_JWK.x || publicJwk.y !== RECOVERY_PUBLIC_JWK.y) fail('RECOVERY_SIGNING_KEY_MISMATCH')
  const thumbprintBytes = canonicalMapJsonBytes({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y })
  const thumbprint = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer(thumbprintBytes))))
  if (thumbprint !== RECOVERY_KEY_THUMBPRINT) fail('RECOVERY_SIGNING_KEY_MISMATCH')

  const privateKey = await importPrivateKey(privateSnapshot)
  const publicKey = await importPublicKey(publicJwk)
  const challenge = new TextEncoder().encode('warpkeep-recovery-signing-key-self-check-v1')
  const signature = asP1363(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, challenge))
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, arrayBuffer(signature), arrayBuffer(challenge))) {
    fail('RECOVERY_SIGNING_KEY_MISMATCH')
  }
}
