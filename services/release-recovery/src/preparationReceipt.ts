import { assertRecoveryPrivateKeyMatchesPinned, P256_HALF_ORDER, P256_ORDER } from './crypto.js'
import { githubFail, snapshotExactDataObject } from './config.js'
import { parseGitHubJsonObject } from './http.js'
import { base64UrlEncode } from './protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK } from './recoveryPublicKey.js'
import { snapshotPreparationIntent, type PreparationIntent } from './preparationIntent.js'
import { PREPARATION_AUDIENCE } from './preparationPolicy.js'

export const PREPARATION_RECEIPT_TYP = 'warpkeep-recovery-preparation-receipt+jws'
const CODE = 'RECOVERY_PREPARATION_RECEIPT_INVALID'
const encoder = new TextEncoder()
const integer = (bytes: Uint8Array) => BigInt(`0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`)
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) githubFail(CODE)
  const bytes = Uint8Array.from(atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))
  if (base64UrlEncode(bytes) !== value) githubFail(CODE)
  return bytes
}
function payload(intent: PreparationIntent) {
  return { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-receipt-v1',
    iss: 'https://release-auth.warpkeep.com', aud: PREPARATION_AUDIENCE,
    purpose: 'activation-evidence-preparation', intent: snapshotPreparationIntent(intent) }
}

/** Durable evidence of a reservation, deliberately not an expiring deployment authorization. */
export async function signPreparationReceipt(intent: PreparationIntent, privateJwk: JsonWebKey): Promise<string> {
  const body = payload(intent)
  await assertRecoveryPrivateKeyMatchesPinned(privateJwk)
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'ES256', typ: PREPARATION_RECEIPT_TYP, kid: RECOVERY_KEY_ID })))}.${base64UrlEncode(encoder.encode(JSON.stringify(body)))}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)))
  // WebCrypto ECDSA emits P1363 on both supported Node22 and workerd runtimes.
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32))
  let s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) githubFail(CODE)
  if (s > P256_HALF_ORDER) {
    s = P256_ORDER - s
    for (let index = 63; index >= 32; index--) { signature[index] = Number(s & 255n); s >>= 8n }
  }
  return `${signingInput}.${base64UrlEncode(signature)}`
}

export async function verifyPreparationReceipt(compact: unknown, expected: PreparationIntent): Promise<PreparationIntent> {
  if (typeof compact !== 'string' || compact.length > 16384) githubFail(CODE)
  const parts = compact.split('.')
  if (parts.length !== 3) githubFail(CODE)
  const header = snapshotExactDataObject(parseGitHubJsonObject(decode(parts[0]!), CODE, []), ['alg', 'typ', 'kid'], CODE)
  if (header.alg !== 'ES256' || header.typ !== PREPARATION_RECEIPT_TYP || header.kid !== RECOVERY_KEY_ID) githubFail(CODE)
  const body = parseGitHubJsonObject(decode(parts[1]!), CODE, [])
  if (JSON.stringify(body) !== JSON.stringify(payload(expected))) githubFail(CODE)
  const signature = decode(parts[2]!)
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32)), s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s > P256_HALF_ORDER) githubFail(CODE)
  const key = await crypto.subtle.importKey('jwk', RECOVERY_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, encoder.encode(`${parts[0]}.${parts[1]}`))) githubFail(CODE)
  return snapshotPreparationIntent(expected)
}
