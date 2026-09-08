import { assertRecoveryPrivateKeyMatchesPinned, P256_HALF_ORDER, P256_ORDER } from './crypto.js'
import { githubFail, snapshotExactDataObject } from './config.js'
import { parseGitHubJsonObject } from './http.js'
import { base64UrlEncode } from './protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK } from './recoveryPublicKey.js'
import { snapshotPreparationIntent, type PreparationIntent } from './preparationIntent.js'

export const PREPARATION_OBSERVATION_TYP = 'warpkeep-recovery-preparation-observation+jws'
const CODE = 'RECOVERY_PREPARATION_OBSERVATION_INVALID'
const encoder = new TextEncoder()
const integer = (bytes: Uint8Array) =>
  BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`)
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) githubFail(CODE)
  const bytes = Uint8Array.from(
    atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  )
  if (base64UrlEncode(bytes) !== value) githubFail(CODE)
  return bytes
}
export type PreparationWorkerCoordinates = Readonly<{
  observedFrom: number
  observedThrough: number
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigIdentity: string
  bridgeConfigEpoch: number
}>
export const PREPARATION_OBSERVATION_PROFILE = 'warpkeep-recovery-preparation-observation-v1'
export const PREPARATION_OBSERVATION_AUDIENCE = 'https://release-auth.warpkeep.com/preparation-observation'
export function snapshotPreparationWorkerCoordinates(value: unknown): PreparationWorkerCoordinates {
  const o = snapshotExactDataObject(
    value,
    [
      'observedFrom',
      'observedThrough',
      'bridgeWorkerVersionId',
      'bridgeSourceCommit',
      'bridgeConfigIdentity',
      'bridgeConfigEpoch',
    ],
    CODE,
  )
  if (
    !Number.isSafeInteger(o.observedFrom) ||
    (o.observedFrom as number) < 1 ||
    !Number.isSafeInteger(o.observedThrough) ||
    (o.observedThrough as number) < (o.observedFrom as number) ||
    (o.observedThrough as number) - (o.observedFrom as number) > 30 ||
    typeof o.bridgeWorkerVersionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      o.bridgeWorkerVersionId,
    ) ||
    typeof o.bridgeSourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(o.bridgeSourceCommit) ||
    typeof o.bridgeConfigIdentity !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(o.bridgeConfigIdentity) ||
    !Number.isSafeInteger(o.bridgeConfigEpoch) ||
    (o.bridgeConfigEpoch as number) < 1
  )
    githubFail(CODE)
  return Object.freeze({ ...o }) as PreparationWorkerCoordinates
}
function payload(intent: PreparationIntent, observation: unknown, issuedAt: number) {
  const coordinates = snapshotPreparationWorkerCoordinates(observation)
  const ownedIntent = snapshotPreparationIntent(intent)
  if (coordinates.observedFrom < ownedIntent.createdAt) githubFail(CODE)
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt < coordinates.observedThrough ||
    issuedAt - coordinates.observedThrough > 15 ||
    coordinates.observedThrough > Number.MAX_SAFE_INTEGER - 90
  )
    githubFail(CODE)
  return {
    schemaVersion: 1 as const,
    profile: PREPARATION_OBSERVATION_PROFILE,
    iss: 'https://release-auth.warpkeep.com' as const,
    aud: PREPARATION_OBSERVATION_AUDIENCE,
    purpose: 'activation-evidence-worker-configuration' as const,
    intent: ownedIntent,
    bridgeService: 'warpkeep-auth-bridge' as const,
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1' as const,
    ...coordinates,
    issuedAt,
    expiresAt: coordinates.observedThrough + 90,
  }
}

export type PreparationObservation = Readonly<ReturnType<typeof payload>>

/** Fresh configuration observation, distinct from durable reservation and deployment authority. */
export async function signPreparationObservation(
  intent: PreparationIntent,
  observation: unknown,
  issuedAt: number,
  privateJwk: JsonWebKey,
): Promise<string> {
  const body = payload(intent, observation, issuedAt)
  await assertRecoveryPrivateKeyMatchesPinned(privateJwk)
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'ES256', typ: PREPARATION_OBSERVATION_TYP, kid: RECOVERY_KEY_ID })))}.${base64UrlEncode(encoder.encode(JSON.stringify(body)))}`
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)),
  )
  // WebCrypto ECDSA emits P1363 on both supported Node22 and workerd runtimes.
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32))
  let s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) githubFail(CODE)
  if (s > P256_HALF_ORDER) {
    s = P256_ORDER - s
    for (let index = 63; index >= 32; index--) {
      signature[index] = Number(s & 255n)
      s >>= 8n
    }
  }
  return `${signingInput}.${base64UrlEncode(signature)}`
}

export async function verifyPreparationObservation(
  compact: unknown,
  expected: PreparationIntent,
  now: number,
) {
  if (typeof compact !== 'string' || compact.length > 16384) githubFail(CODE)
  const parts = compact.split('.')
  if (parts.length !== 3) githubFail(CODE)
  const header = snapshotExactDataObject(
    parseGitHubJsonObject(decode(parts[0]!), CODE, []),
    ['alg', 'typ', 'kid'],
    CODE,
  )
  if (header.alg !== 'ES256' || header.typ !== PREPARATION_OBSERVATION_TYP || header.kid !== RECOVERY_KEY_ID)
    githubFail(CODE)
  const body = parseGitHubJsonObject(decode(parts[1]!), CODE, [])
  const coordinates = snapshotPreparationWorkerCoordinates(
    Object.fromEntries(
      [
        'observedFrom',
        'observedThrough',
        'bridgeWorkerVersionId',
        'bridgeSourceCommit',
        'bridgeConfigIdentity',
        'bridgeConfigEpoch',
      ].map((key) => [key, body[key]]),
    ),
  )
  const expectedBody = payload(expected, coordinates, body.issuedAt as number)
  if (
    JSON.stringify(body) !== JSON.stringify(expectedBody) ||
    !Number.isSafeInteger(now) ||
    now < expectedBody.issuedAt ||
    now >= expectedBody.expiresAt
  )
    githubFail(CODE)
  const signature = decode(parts[2]!)
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32)),
    s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s > P256_HALF_ORDER) githubFail(CODE)
  const key = await crypto.subtle.importKey(
    'jwk',
    RECOVERY_PUBLIC_JWK,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  if (
    !(await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    ))
  )
    githubFail(CODE)
  return Object.freeze(expectedBody)
}
