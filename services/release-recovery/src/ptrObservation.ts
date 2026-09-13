import { types } from 'node:util'
import { assertRecoveryPrivateKeyMatchesPinned, P256_HALF_ORDER, P256_ORDER } from './crypto.js'
import { githubFail, snapshotExactDataObject } from './config.js'
import { parseGitHubJsonObject } from './http.js'
import { base64UrlEncode } from './protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK } from './recoveryPublicKey.js'

export const PTR_OBSERVATION_AUDIENCE = 'https://release-auth.warpkeep.com/ptr-observation'
export const PTR_OBSERVATION_PATH = '/v1/recovery/ptr-observation'
export const PTR_OBSERVATION_OPERATION = 'ptr-state-inspect'
export const PTR_OBSERVATION_JOB = 'observe_ptr'
export const PTR_OBSERVATION_PURPOSE = 'existing-ptr-state-observation'
export const PTR_OBSERVATION_PROFILE = 'warpkeep-recovery-ptr-observation-v1'
export const PTR_OBSERVATION_TYP = 'warpkeep-recovery-ptr-observation+jws'
const CODE = 'RECOVERY_PTR_OBSERVATION_INVALID'
const PTR = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e'
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT = /^[0-9a-f]{40}$/u
const HASH = /^[0-9a-f]{64}$/u
const ID = /^[1-9][0-9]{0,19}$/u
const encoder = new TextEncoder()
const captured = new WeakSet<object>()
const exact = (value: unknown, keys: readonly string[]) => snapshotExactDataObject(value, keys, CODE)
const matches = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value)
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const zero = (value: unknown) => value === 0 && !Object.is(value, -0)
const IDENTITY_KEYS = ['sourceCommit', 'sourceTree', 'runId', 'runAttempt', 'checkRunId', 'requestId'] as const
const REQUEST_KEYS = ['requestId', 'candidateCommit', 'recoveryAuthorizationEpoch'] as const
const COORDINATE_KEYS = ['observedFrom', 'observedThrough', 'bridgeService', 'bridgeWorkerVersion',
  'bridgeWorkerVersionId', 'bridgeSourceCommit', 'bridgeConfigIdentity', 'bridgeConfigEpoch',
  'publicAdmissionRequestsOpen'] as const
const PTR_KEYS = ['databaseIdentity', 'programKeccak256', 'realmId', 'releaseVersion', 'moduleIdentity',
  'launchState', 'admissionsOpen', 'accessRequestsOpen', 'sealed', 'atlasReady', 'populationGuardPassed',
  'singletonOwnerCount', 'ownerEnabled', 'generalAdmissionCount', 'atlasId', 'publicReleaseId',
  'publicApprovalReceiptId', 'atlasSourceCommit', 'expectedReleaseSha256', 'releaseHeaderSha256',
  'verificationDigest', 'sealedStateHmacSha256', 'ownerInvariantHmacSha256'] as const
const G001_KEYS = ['databaseIdentity', 'programKeccak256', 'realmId', 'releaseVersion', 'playerAccessEnabled',
  'admissionStateMutationsEnabled', 'accessRequestSubmissionsEnabled', 'sourceBaselineCommit', 'freezeReleaseNonce',
  'admittedPlayerCount', 'enabledPlayerCount', 'censusStable', 'admittedPlayerCensusHmacSha256', 'alphaInvariantHmacSha256'] as const
const G002_KEYS = ['databaseIdentity', 'programKeccak256', 'realmId', 'databaseName', 'moduleIdentity', 'releaseVersion',
  'launchState', 'admissionsOpen', 'accessRequestsOpen', 'sealed', 'atlasReady', 'playerCount', 'generalAdmissionCount',
  'populationGuardPassed', 'atlasId', 'publicReleaseId', 'publicApprovalReceiptId', 'atlasSourceCommit',
  'expectedReleaseSha256', 'releaseHeaderSha256', 'verificationDigest', 'sealedStateHmacSha256'] as const
const PTR_DIGEST_KEYS = ['programIdentityBeforeTranscriptHmacSha256', 'ptrAdminStatusResponseHmacSha256',
  'ptrOwnerStatusResponseHmacSha256', 'programIdentityAfterTranscriptHmacSha256'] as const
const UPSTREAM_KEYS = [PTR_DIGEST_KEYS[0], 'g001PolicyResponseHmacSha256', 'g001AlphaBeforeResponseHmacSha256',
  'g001PlayerEnumerationBeforeResponseHmacSha256', 'g001AdmissionStatusesResponseHmacSha256',
  'g001PlayerEnumerationAfterResponseHmacSha256', 'g001AlphaAfterResponseHmacSha256', 'g002StatusResponseHmacSha256',
  ...PTR_DIGEST_KEYS.slice(1)] as const

export type PtrObservationRequest = Readonly<{ oidcToken: string; sourceCommit: string; requestId: string }>
export type PtrObservationIdentity = Readonly<Record<typeof IDENTITY_KEYS[number], string>>
export type PtrBridgeObservationRequest = Readonly<{ requestId: string; candidateCommit: string; recoveryAuthorizationEpoch: number }>
export type PtrObservationState = Readonly<{
  databaseIdentity: typeof PTR; programKeccak256: string; realmId: 'PTR'; releaseVersion: '0.4.0-ptr.1'
  moduleIdentity: 'warpkeep-ptr-owner-view-v1'; launchState: 'owner-only'; admissionsOpen: false
  accessRequestsOpen: false; sealed: true; atlasReady: true; populationGuardPassed: true
  singletonOwnerCount: 1; ownerEnabled: true; generalAdmissionCount: 0; atlasId: 'PTR_GREATER_REALM'
  publicReleaseId: string; publicApprovalReceiptId: string; atlasSourceCommit: string
  expectedReleaseSha256: string; releaseHeaderSha256: string; verificationDigest: string
  sealedStateHmacSha256: string; ownerInvariantHmacSha256: string
}>
export type CapturedPtrBridgeObservation = Readonly<PtrBridgeObservationRequest & {
  observedFrom: number; observedThrough: number; bridgeService: 'warpkeep-auth-bridge'
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1'; bridgeWorkerVersionId: string
  bridgeSourceCommit: string; bridgeConfigIdentity: string; bridgeConfigEpoch: number
  publicAdmissionRequestsOpen: false; ptr: PtrObservationState
  upstreamResponseDigests: Readonly<Record<typeof PTR_DIGEST_KEYS[number], string>>
}>

export function snapshotPtrObservationRequest(value: unknown): PtrObservationRequest {
  const o = exact(value, ['oidcToken', 'sourceCommit', 'requestId'])
  if (!matches(o.sourceCommit, COMMIT) || !matches(o.requestId, UUID)
    || typeof o.oidcToken !== 'string' || o.oidcToken.length > 32768
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(o.oidcToken)) githubFail(CODE)
  return Object.freeze({ ...o }) as PtrObservationRequest
}
export function snapshotPtrObservationIdentity(value: unknown): PtrObservationIdentity {
  const o = exact(value, IDENTITY_KEYS)
  if (!matches(o.sourceCommit, COMMIT) || !matches(o.sourceTree, COMMIT) || !matches(o.requestId, UUID)
    || !matches(o.runId, ID) || !matches(o.runAttempt, ID) || !matches(o.checkRunId, ID)) githubFail(CODE)
  return Object.freeze({ ...o }) as PtrObservationIdentity
}
function request(value: unknown): PtrBridgeObservationRequest {
  const o = exact(value, REQUEST_KEYS)
  if (!matches(o.requestId, UUID) || !matches(o.candidateCommit, COMMIT) || !positive(o.recoveryAuthorizationEpoch)) githubFail(CODE)
  return Object.freeze({ ...o }) as PtrBridgeObservationRequest
}
function atlas(o: Readonly<Record<string, unknown>>) {
  if (o.admissionsOpen !== false || o.accessRequestsOpen !== false || o.sealed !== true || o.atlasReady !== true
    || o.populationGuardPassed !== true || !zero(o.generalAdmissionCount)
    || !matches(o.publicReleaseId, /^GRR-[A-Z2-7]{26}$/u) || !matches(o.publicApprovalReceiptId, /^GRA-[A-Z2-7]{26}$/u)
    || !matches(o.atlasSourceCommit, COMMIT)) githubFail(CODE)
  for (const key of ['programKeccak256', 'expectedReleaseSha256', 'releaseHeaderSha256', 'verificationDigest', 'sealedStateHmacSha256']) {
    if (!matches(o[key], HASH)) githubFail(CODE)
  }
}
function ptr(value: unknown): PtrObservationState {
  const o = exact(value, PTR_KEYS)
  atlas(o)
  if (o.databaseIdentity !== PTR || o.realmId !== 'PTR' || o.releaseVersion !== '0.4.0-ptr.1'
    || o.moduleIdentity !== 'warpkeep-ptr-owner-view-v1' || o.launchState !== 'owner-only'
    || o.singletonOwnerCount !== 1 || o.ownerEnabled !== true || o.atlasId !== 'PTR_GREATER_REALM'
    || !matches(o.ownerInvariantHmacSha256, HASH)) githubFail(CODE)
  return Object.freeze({ ...o }) as PtrObservationState
}
function otherRealms(g001: unknown, g002: unknown) {
  const a = exact(g001, G001_KEYS)
  if (a.databaseIdentity !== G001 || !matches(a.programKeccak256, HASH) || a.realmId !== 'GENESIS_001'
    || a.releaseVersion !== '0.3.43' || a.playerAccessEnabled !== true || a.admissionStateMutationsEnabled !== false
    || a.accessRequestSubmissionsEnabled !== false || a.sourceBaselineCommit !== '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
    || a.freezeReleaseNonce !== '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
    || !positive(a.admittedPlayerCount) || a.admittedPlayerCount > 100 || a.enabledPlayerCount !== a.admittedPlayerCount
    || a.censusStable !== true || !matches(a.admittedPlayerCensusHmacSha256, HASH) || !matches(a.alphaInvariantHmacSha256, HASH)) githubFail(CODE)
  g002State(g002)
}
function g002State(value: unknown, fixedTarget = false): G002ObservationState {
  const b = exact(value, G002_KEYS)
  atlas(b)
  if (!matches(b.databaseIdentity, HASH) || b.databaseIdentity === PTR || b.databaseIdentity === G001
    || b.realmId !== 'GENESIS_002' || b.databaseName !== 'warpkeep-genesis-002'
    || b.moduleIdentity !== 'warpkeep-genesis-002-sealed-v1' || b.releaseVersion !== '0.4.0'
    || b.launchState !== 'sealed' || !zero(b.playerCount) || b.atlasId !== 'GENESIS_002_GREATER_REALM'
    || (fixedTarget && b.databaseIdentity !== G002_UPDATE_OBSERVATION_DATABASE_IDENTITY)) githubFail(CODE)
  return Object.freeze({ ...b }) as G002ObservationState
}
function digestProjection(value: unknown, keys: readonly string[], selectedKeys: readonly string[] = PTR_DIGEST_KEYS) {
  const o = exact(value, keys)
  for (const key of keys) if (!matches(o[key], HASH)) githubFail(CODE)
  return Object.freeze(Object.fromEntries(selectedKeys.map(key => [key, o[key]]))) as Readonly<Record<string, string>>
}
function coordinates(o: Readonly<Record<string, unknown>>) {
  if (!positive(o.observedFrom) || !positive(o.observedThrough) || o.observedThrough < o.observedFrom
    || o.observedThrough - o.observedFrom > 75 || o.bridgeService !== 'warpkeep-auth-bridge'
    || o.bridgeWorkerVersion !== 'warpkeep-auth-bridge-release-recovery-v1' || !matches(o.bridgeWorkerVersionId, UUID)
    || !matches(o.bridgeSourceCommit, COMMIT) || !matches(o.bridgeConfigIdentity, HASH)
    || !positive(o.bridgeConfigEpoch) || o.publicAdmissionRequestsOpen !== false) githubFail(CODE)
  return Object.fromEntries(COORDINATE_KEYS.map(key => [key, o[key]]))
}
function snapshotObservation(value: unknown): CapturedPtrBridgeObservation {
  const o = exact(value, [...REQUEST_KEYS, ...COORDINATE_KEYS, 'ptr', 'upstreamResponseDigests'])
  return Object.freeze({ ...request(Object.fromEntries(REQUEST_KEYS.map(key => [key, o[key]]))),
    ...coordinates(o), ptr: ptr(o.ptr), upstreamResponseDigests: digestProjection(o.upstreamResponseDigests, PTR_DIGEST_KEYS),
  }) as CapturedPtrBridgeObservation
}

function captureBridgeObservation(value: unknown, expected: PtrBridgeObservationRequest, from: number, through: number) {
  const selected = request(expected)
  const o = exact(value, ['schemaVersion', 'profile', ...REQUEST_KEYS, ...COORDINATE_KEYS,
    'g001', 'g002', 'ptr', 'upstreamResponseDigests'])
  if (o.schemaVersion !== 1 || o.profile !== 'warpkeep-release-recovery-realm-observation-v1'
    || REQUEST_KEYS.some(key => o[key] !== selected[key]) || !positive(from) || !positive(through)
    || through < from || through - from > 75) githubFail(CODE)
  const observed = coordinates(o)
  if ((o.observedFrom as number) < from || (o.observedThrough as number) > through) githubFail(CODE)
  otherRealms(o.g001, o.g002)
  return { selected, observed, ptr: ptr(o.ptr), g002: o.g002,
    upstreamResponseDigests: digestProjection(o.upstreamResponseDigests, UPSTREAM_KEYS, UPSTREAM_KEYS) }
}
/** The caller must obtain value through its authenticated AUTH_BRIDGE_OBSERVER service binding. */
export function capturePtrBridgeObservation(value: unknown, expected: PtrBridgeObservationRequest,
  from: number, through: number): CapturedPtrBridgeObservation {
  const source = captureBridgeObservation(value, expected, from, through)
  const result = snapshotObservation({ ...source.selected, ...source.observed, ptr: source.ptr,
    upstreamResponseDigests: digestProjection(source.upstreamResponseDigests, UPSTREAM_KEYS) })
  captured.add(result)
  return result
}
function payload(identity: PtrObservationIdentity, observation: unknown, issuedAt: number) {
  const ownedIdentity = snapshotPtrObservationIdentity(identity), ownedObservation = snapshotObservation(observation)
  if (ownedObservation.requestId !== ownedIdentity.requestId || ownedObservation.candidateCommit !== ownedIdentity.sourceCommit
    || !positive(issuedAt) || issuedAt < ownedObservation.observedThrough || issuedAt - ownedObservation.observedThrough > 15
    || ownedObservation.observedThrough > Number.MAX_SAFE_INTEGER - 90) githubFail(CODE)
  return Object.freeze({ schemaVersion: 1 as const, profile: PTR_OBSERVATION_PROFILE,
    iss: 'https://release-auth.warpkeep.com' as const, aud: PTR_OBSERVATION_AUDIENCE, purpose: PTR_OBSERVATION_PURPOSE,
    identity: ownedIdentity, observation: ownedObservation, issuedAt, expiresAt: ownedObservation.observedThrough + 90 })
}
export type PtrObservation = Readonly<ReturnType<typeof payload>>
const integer = (bytes: Uint8Array) => BigInt(`0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`)
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) githubFail(CODE)
  const bytes = Uint8Array.from(atob(value.replace(/-/gu, '+').replace(/_/gu, '/')
    + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))
  if (base64UrlEncode(bytes) !== value) githubFail(CODE)
  return bytes
}
const header = () => ({ alg: 'ES256', typ: PTR_OBSERVATION_TYP, kid: RECOVERY_KEY_ID })

/** A fresh state statement only; never an import/provision receipt or adoption authorization. */
export async function signPtrObservation(identity: PtrObservationIdentity, observation: CapturedPtrBridgeObservation,
  issuedAt: number, privateJwk: JsonWebKey): Promise<string> {
  if (!captured.has(observation)) githubFail(CODE)
  const body = payload(identity, observation, issuedAt)
  await assertRecoveryPrivateKeyMatchesPinned(privateJwk)
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const input = `${base64UrlEncode(encoder.encode(JSON.stringify(header())))}.${base64UrlEncode(encoder.encode(JSON.stringify(body)))}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input)))
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32)); let s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) githubFail(CODE)
  if (s > P256_HALF_ORDER) {
    s = P256_ORDER - s
    for (let index = 63; index >= 32; index--) { signature[index] = Number(s & 255n); s >>= 8n }
  }
  return `${input}.${base64UrlEncode(signature)}`
}
export async function verifyPtrObservation(compact: unknown, expectedIdentity: PtrObservationIdentity,
  now: number): Promise<PtrObservation> {
  if (typeof compact !== 'string' || compact.length > 16384) githubFail(CODE)
  const parts = compact.split('.')
  if (parts.length !== 3) githubFail(CODE)
  const parsedHeader = exact(parseGitHubJsonObject(decode(parts[0]!), CODE, []), ['alg', 'typ', 'kid'])
  if (JSON.stringify(parsedHeader) !== JSON.stringify(header())
    || parts[0] !== base64UrlEncode(encoder.encode(JSON.stringify(header())))) githubFail(CODE)
  const body = parseGitHubJsonObject(decode(parts[1]!), CODE, [])
  const expected = payload(expectedIdentity, body.observation, body.issuedAt as number)
  // Byte equality excludes reordered keys, whitespace, alternate escapes and number spellings.
  if (parts[1] !== base64UrlEncode(encoder.encode(JSON.stringify(expected))) || !positive(now)
    || now < expected.issuedAt || now >= expected.expiresAt) githubFail(CODE)
  const signature = decode(parts[2]!)
  if (signature.length !== 64) githubFail(CODE)
  const r = integer(signature.subarray(0, 32)), s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s > P256_HALF_ORDER) githubFail(CODE)
  const key = await crypto.subtle.importKey('jwk', RECOVERY_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, encoder.encode(`${parts[0]}.${parts[1]}`))) githubFail(CODE)
  return expected
}

// The update statement is a different protocol. Neither it nor historical
// signature verification is a continuation claim or an adoption capability.
export const PTR_UPDATE_OBSERVATION_AUDIENCE = 'https://release-auth.warpkeep.com/ptr-update-observation'
export const PTR_UPDATE_OBSERVATION_PATH = '/v1/recovery/ptr-update-observation'
export const PTR_UPDATE_OBSERVATION_JOB = 'operate_ptr'
export const PTR_UPDATE_OBSERVATION_PROFILE = 'warpkeep-recovery-ptr-update-observation-v1'
export const PTR_UPDATE_OBSERVATION_TYP = 'warpkeep-recovery-ptr-update-observation+jws'
export const PTR_UPDATE_OBSERVATION_PURPOSE = 'existing-ptr-update-observation'
const UPDATE_CODE = 'RECOVERY_PTR_UPDATE_OBSERVATION_INVALID'
const UPDATE_COMMON_KEYS = ['bindingDigest', 'inspectionDigest', 'inspectionRecordDigest', 'predecessorDigest',
  'predecessorReceiptDigest', 'beforeProgram', 'candidateProgram', 'scopeDigest', 'issuedRecordDigest',
  'claimRecordDigest', 'claimRunId', 'claimRunAttempt'] as const
const UPDATE_POST_KEYS = ['preObservationJwsSha256', 'completionReceiptDigest', 'completionRecordDigest',
  'terminalRecordDigest', 'terminalRunId', 'terminalRunAttempt', 'terminalOutcome', 'terminalAt'] as const
export type PtrUpdateObservationCommonContext = Readonly<{
  bindingDigest: string; inspectionDigest: string; inspectionRecordDigest: string
  predecessorDigest: string | null; predecessorReceiptDigest: string | null
  beforeProgram: string; candidateProgram: string; scopeDigest: string; issuedRecordDigest: string
  claimRecordDigest: string; claimRunId: string; claimRunAttempt: string
}>
export type PtrUpdateObservationContext = PtrUpdateObservationCommonContext & (Readonly<{ phase: 'pre' }> | Readonly<{
  phase: 'post'; preObservationJwsSha256: string; completionReceiptDigest: string; completionRecordDigest: string
  terminalRecordDigest: string; terminalRunId: string; terminalRunAttempt: string
  terminalOutcome: 'completed' | 'reconciled-effect-applied'; terminalAt: string
}>)
export type PtrUpdateObservationRequest = Readonly<{ oidcToken: string; sourceCommit: string; requestId: string }> & (
  Readonly<{ context: Extract<PtrUpdateObservationContext, { phase: 'pre' }> }> |
  Readonly<{ context: Extract<PtrUpdateObservationContext, { phase: 'post' }>; preObservationJws: string }>)

function updateExact(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) githubFail(UPDATE_CODE)
  return snapshotExactDataObject(value, keys, UPDATE_CODE)
}
function updateVariant(value: unknown, common: readonly string[], additional: readonly string[]) {
  try { return updateExact(value, common) } catch { return updateExact(value, [...common, ...additional]) }
}
function canonicalTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && new Date(parsed).toISOString() === value
}
export function snapshotPtrUpdateObservationContext(value: unknown): PtrUpdateObservationContext {
  const o = updateVariant(value, [...UPDATE_COMMON_KEYS, 'phase'], UPDATE_POST_KEYS)
  for (const key of UPDATE_COMMON_KEYS) {
    if (key === 'predecessorDigest' || key === 'predecessorReceiptDigest') {
      if (o[key] !== null && !matches(o[key], HASH)) githubFail(UPDATE_CODE)
    } else if (!matches(o[key], key === 'claimRunId' || key === 'claimRunAttempt' ? ID : HASH)) githubFail(UPDATE_CODE)
  }
  if ((o.predecessorDigest === null) !== (o.predecessorReceiptDigest === null)) githubFail(UPDATE_CODE)
  if (o.phase === 'pre') updateExact(o, [...UPDATE_COMMON_KEYS, 'phase'])
  else if (o.phase === 'post') {
    updateExact(o, [...UPDATE_COMMON_KEYS, 'phase', ...UPDATE_POST_KEYS])
    for (const key of UPDATE_POST_KEYS.slice(0, 4)) if (!matches(o[key], HASH)) githubFail(UPDATE_CODE)
    if (!matches(o.terminalRunId, ID) || !matches(o.terminalRunAttempt, ID) || !canonicalTime(o.terminalAt)
      || !['completed', 'reconciled-effect-applied'].includes(o.terminalOutcome as string)
      || (o.terminalOutcome === 'completed'
        && (o.terminalRunId !== o.claimRunId || o.terminalRunAttempt !== o.claimRunAttempt))) githubFail(UPDATE_CODE)
  } else githubFail(UPDATE_CODE)
  return Object.freeze({ ...o }) as PtrUpdateObservationContext
}
export function snapshotPtrUpdateObservationRequest(value: unknown): PtrUpdateObservationRequest {
  const o = updateVariant(value, ['oidcToken', 'sourceCommit', 'requestId', 'context'], ['preObservationJws'])
  const identity = snapshotPtrObservationRequest({ oidcToken: o.oidcToken, sourceCommit: o.sourceCommit, requestId: o.requestId })
  const context = snapshotPtrUpdateObservationContext(o.context)
  if (context.phase === 'pre') {
    updateExact(o, ['oidcToken', 'sourceCommit', 'requestId', 'context'])
    return Object.freeze({ ...identity, context })
  }
  updateExact(o, ['oidcToken', 'sourceCommit', 'requestId', 'context', 'preObservationJws'])
  if (typeof o.preObservationJws !== 'string' || o.preObservationJws.length < 1 || o.preObservationJws.length > 16384
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(o.preObservationJws)) githubFail(UPDATE_CODE)
  return Object.freeze({ ...identity, context, preObservationJws: o.preObservationJws })
}
function updatePayload(identity: PtrObservationIdentity, context: PtrUpdateObservationContext, observation: unknown, issuedAt: number) {
  const ownedIdentity = snapshotPtrObservationIdentity(updateExact(identity, IDENTITY_KEYS))
  const selected = payload(ownedIdentity, observation, issuedAt), ownedContext = snapshotPtrUpdateObservationContext(context)
  if (ownedContext.phase === 'pre'
    ? ownedContext.claimRunId !== selected.identity.runId || ownedContext.claimRunAttempt !== selected.identity.runAttempt
      || selected.observation.ptr.programKeccak256 !== ownedContext.beforeProgram
    : selected.observation.ptr.programKeccak256 !== ownedContext.candidateProgram
      || Date.parse(ownedContext.terminalAt) > selected.observation.observedFrom * 1000) githubFail(UPDATE_CODE)
  return Object.freeze({ schemaVersion: 1 as const, profile: PTR_UPDATE_OBSERVATION_PROFILE,
    iss: selected.iss, aud: PTR_UPDATE_OBSERVATION_AUDIENCE, purpose: PTR_UPDATE_OBSERVATION_PURPOSE,
    identity: selected.identity, context: ownedContext, observation: selected.observation,
    issuedAt: selected.issuedAt, expiresAt: selected.expiresAt })
}
export type PtrUpdateObservation = Readonly<ReturnType<typeof updatePayload>>
const updateHeader = () => ({ alg: 'ES256', typ: PTR_UPDATE_OBSERVATION_TYP, kid: RECOVERY_KEY_ID })
async function compactSha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}
type UpdateLink = Pick<PtrUpdateObservation, 'identity' | 'context' | 'issuedAt'> & Readonly<{
  observation: Omit<CapturedPtrBridgeObservation, 'ptr' | 'upstreamResponseDigests'>
}>
async function validateUpdateLink(preCompact: string, pre: UpdateLink, post: UpdateLink) {
  if (pre.context.phase !== 'pre' || post.context.phase !== 'post'
    || pre.identity.sourceCommit !== post.identity.sourceCommit || pre.identity.sourceTree !== post.identity.sourceTree
    || UPDATE_COMMON_KEYS.some(key => pre.context[key] !== post.context[key])
    || post.context.preObservationJwsSha256 !== await compactSha256(preCompact)
    || pre.issuedAt * 1000 > Date.parse(post.context.terminalAt)
    || pre.observation.recoveryAuthorizationEpoch !== post.observation.recoveryAuthorizationEpoch
    || COORDINATE_KEYS.filter(key => key !== 'observedFrom' && key !== 'observedThrough')
      .some(key => pre.observation[key] !== post.observation[key])) githubFail(UPDATE_CODE)
}
async function validateUpdatePair(preCompact: string, pre: PtrUpdateObservation, post: PtrUpdateObservation) {
  await validateUpdateLink(preCompact, pre, post)
  if (PTR_KEYS.filter(key => key !== 'programKeccak256')
    .some(key => pre.observation.ptr[key] !== post.observation.ptr[key])) githubFail(UPDATE_CODE)
}

async function verifyUpdateSignature(parts: string[], code: string) {
  const signature = decode(parts[2]!)
  if (signature.length !== 64) githubFail(code)
  const r = integer(signature.subarray(0, 32)), s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s > P256_HALF_ORDER) githubFail(code)
  const key = await crypto.subtle.importKey('jwk', RECOVERY_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature,
    encoder.encode(`${parts[0]}.${parts[1]}`))) githubFail(code)
}

/** Pins canonical bytes and signature, including internally valid intervals, but
 * grants no present-time freshness or private receipt/claim authority. */
export async function verifyHistoricalPtrUpdateObservation(compact: unknown): Promise<PtrUpdateObservation> {
  if (typeof compact !== 'string' || compact.length > 16384) githubFail(UPDATE_CODE)
  const parts = compact.split('.')
  if (parts.length !== 3 || parts[0] !== base64UrlEncode(encoder.encode(JSON.stringify(updateHeader())))) githubFail(UPDATE_CODE)
  const raw = updateExact(parseGitHubJsonObject(decode(parts[1]!), UPDATE_CODE, []),
    ['schemaVersion', 'profile', 'iss', 'aud', 'purpose', 'identity', 'context', 'observation', 'issuedAt', 'expiresAt'])
  const expected = updatePayload(raw.identity as PtrObservationIdentity, raw.context as PtrUpdateObservationContext,
    raw.observation, raw.issuedAt as number)
  if (parts[1] !== base64UrlEncode(encoder.encode(JSON.stringify(expected)))) githubFail(UPDATE_CODE)
  await verifyUpdateSignature(parts, UPDATE_CODE)
  return expected
}
export async function verifyPtrUpdateObservation(compact: unknown, expectedIdentity: PtrObservationIdentity,
  expectedContext: PtrUpdateObservationContext, nowSeconds: number): Promise<PtrUpdateObservation> {
  const identity = snapshotPtrObservationIdentity(updateExact(expectedIdentity, IDENTITY_KEYS)), context = snapshotPtrUpdateObservationContext(expectedContext)
  const result = await verifyHistoricalPtrUpdateObservation(compact)
  if (JSON.stringify(result.identity) !== JSON.stringify(identity) || JSON.stringify(result.context) !== JSON.stringify(context)
    || !positive(nowSeconds) || nowSeconds < result.issuedAt || nowSeconds >= result.expiresAt) githubFail(UPDATE_CODE)
  return result
}
export async function verifyPtrUpdateObservationPair(preCompact: unknown, postCompact: unknown): Promise<Readonly<{
  pre: PtrUpdateObservation; post: PtrUpdateObservation
}>> {
  const pre = await verifyHistoricalPtrUpdateObservation(preCompact), post = await verifyHistoricalPtrUpdateObservation(postCompact)
  await validateUpdatePair(preCompact as string, pre, post)
  return Object.freeze({ pre, post })
}
export async function signPtrUpdateObservation(identity: PtrObservationIdentity, context: PtrUpdateObservationContext,
  observation: CapturedPtrBridgeObservation, issuedAt: number, privateJwk: JsonWebKey, preObservationJws?: string): Promise<string> {
  if (!captured.has(observation)) githubFail(UPDATE_CODE)
  const body = updatePayload(identity, context, observation, issuedAt)
  if (body.context.phase === 'post') {
    const pre = await verifyHistoricalPtrUpdateObservation(preObservationJws)
    await validateUpdatePair(preObservationJws!, pre, body)
  } else if (preObservationJws !== undefined) githubFail(UPDATE_CODE)
  return signUpdatePayload(body, PTR_UPDATE_OBSERVATION_TYP, privateJwk, UPDATE_CODE)
}
async function signUpdatePayload(body: unknown, typ: string, privateJwk: JsonWebKey, code: string) {
  await assertRecoveryPrivateKeyMatchesPinned(privateJwk)
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const input = `${base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'ES256', typ, kid: RECOVERY_KEY_ID })))}.${base64UrlEncode(encoder.encode(JSON.stringify(body)))}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input)))
  if (signature.length !== 64) githubFail(code)
  const r = integer(signature.subarray(0, 32)); let s = integer(signature.subarray(32))
  if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) githubFail(code)
  if (s > P256_HALF_ORDER) {
    s = P256_ORDER - s
    for (let index = 63; index >= 32; index--) { signature[index] = Number(s & 255n); s >>= 8n }
  }
  const compact = `${input}.${base64UrlEncode(signature)}`
  if (compact.length > 16384) githubFail(code)
  return compact
}

// The fixed G002 protocol uses the same observation and update-link machinery,
// with its own audience/type and immutable realm. It grants no update authority.
export const G002_UPDATE_OBSERVATION_AUDIENCE = 'https://release-auth.warpkeep.com/g002-update-observation'
export const G002_UPDATE_OBSERVATION_PATH = '/v1/recovery/g002-update-observation'
export const G002_UPDATE_OBSERVATION_JOB = 'operate_g002'
export const G002_UPDATE_OBSERVATION_PROFILE = 'warpkeep-recovery-g002-update-observation-v1'
export const G002_UPDATE_OBSERVATION_TYP = 'warpkeep-recovery-g002-update-observation+jws'
export const G002_UPDATE_OBSERVATION_PURPOSE = 'existing-g002-update-observation'
export const G002_UPDATE_OBSERVATION_DATABASE_IDENTITY = 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194'
const G002_UPDATE_CODE = 'RECOVERY_G002_UPDATE_OBSERVATION_INVALID'
const G002_DIGEST_KEYS = [PTR_DIGEST_KEYS[0], 'g002StatusResponseHmacSha256', PTR_DIGEST_KEYS[3]] as const
const capturedG002 = new WeakSet<object>()
export type G002ObservationState = Readonly<{
  databaseIdentity: typeof G002_UPDATE_OBSERVATION_DATABASE_IDENTITY; programKeccak256: string
  realmId: 'GENESIS_002'; databaseName: 'warpkeep-genesis-002'; moduleIdentity: 'warpkeep-genesis-002-sealed-v1'
  releaseVersion: '0.4.0'; launchState: 'sealed'; admissionsOpen: false; accessRequestsOpen: false; sealed: true
  atlasReady: true; playerCount: 0; generalAdmissionCount: 0; populationGuardPassed: true
  atlasId: 'GENESIS_002_GREATER_REALM'; publicReleaseId: string; publicApprovalReceiptId: string
  atlasSourceCommit: string; expectedReleaseSha256: string; releaseHeaderSha256: string
  verificationDigest: string; sealedStateHmacSha256: string
}>
export type G002UpdateObservationContext = PtrUpdateObservationContext
export type G002UpdateObservationRequest = PtrUpdateObservationRequest
export type CapturedG002BridgeObservation = Omit<CapturedPtrBridgeObservation, 'ptr' | 'upstreamResponseDigests'> & Readonly<{
  g002: G002ObservationState; upstreamResponseDigests: Readonly<Record<typeof G002_DIGEST_KEYS[number], string>>
}>
function g002Exact(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) githubFail(G002_UPDATE_CODE)
  return snapshotExactDataObject(value, keys, G002_UPDATE_CODE)
}
export function snapshotG002UpdateObservationContext(value: unknown): G002UpdateObservationContext {
  try { return snapshotPtrUpdateObservationContext(value) } catch { return githubFail(G002_UPDATE_CODE) }
}
export function snapshotG002UpdateObservationRequest(value: unknown): G002UpdateObservationRequest {
  try { return snapshotPtrUpdateObservationRequest(value) } catch { return githubFail(G002_UPDATE_CODE) }
}
function snapshotG002Observation(value: unknown): CapturedG002BridgeObservation {
  const o = g002Exact(value, [...REQUEST_KEYS, ...COORDINATE_KEYS, 'g002', 'upstreamResponseDigests'])
  const selectedState = g002Exact(o.g002, G002_KEYS), digests = g002Exact(o.upstreamResponseDigests, G002_DIGEST_KEYS)
  return Object.freeze({ ...request(Object.fromEntries(REQUEST_KEYS.map(key => [key, o[key]]))),
    ...coordinates(o), g002: g002State(selectedState, true),
    upstreamResponseDigests: digestProjection(digests, G002_DIGEST_KEYS, G002_DIGEST_KEYS),
  }) as CapturedG002BridgeObservation
}
/** Requires the authenticated private bridge response; also validates preserved
 * G001 and PTR evidence before projecting the fixed sealed G002 state. */
export function captureG002BridgeObservation(value: unknown, expected: PtrBridgeObservationRequest,
  from: number, through: number): CapturedG002BridgeObservation {
  try {
    const raw = g002Exact(value, ['schemaVersion', 'profile', ...REQUEST_KEYS, ...COORDINATE_KEYS,
      'g001', 'g002', 'ptr', 'upstreamResponseDigests'])
    for (const key of ['g001', 'g002', 'ptr', 'upstreamResponseDigests'])
      if (types.isProxy(raw[key])) githubFail(G002_UPDATE_CODE)
    const source = captureBridgeObservation(raw, g002Exact(expected, REQUEST_KEYS) as PtrBridgeObservationRequest, from, through)
    const result = snapshotG002Observation({ ...source.selected, ...source.observed, g002: source.g002,
      upstreamResponseDigests: digestProjection(source.upstreamResponseDigests, UPSTREAM_KEYS, G002_DIGEST_KEYS) })
    capturedG002.add(result)
    return result
  } catch { return githubFail(G002_UPDATE_CODE) }
}
function g002UpdatePayload(identity: PtrObservationIdentity, context: G002UpdateObservationContext,
  observation: unknown, issuedAt: number) {
  const ownedIdentity = snapshotPtrObservationIdentity(g002Exact(identity, IDENTITY_KEYS))
  const ownedContext = snapshotG002UpdateObservationContext(context), ownedObservation = snapshotG002Observation(observation)
  if (ownedObservation.requestId !== ownedIdentity.requestId || ownedObservation.candidateCommit !== ownedIdentity.sourceCommit
    || !positive(issuedAt) || issuedAt < ownedObservation.observedThrough || issuedAt - ownedObservation.observedThrough > 15
    || ownedObservation.observedThrough > Number.MAX_SAFE_INTEGER - 90) githubFail(G002_UPDATE_CODE)
  if (ownedContext.phase === 'pre'
    ? ownedContext.claimRunId !== ownedIdentity.runId || ownedContext.claimRunAttempt !== ownedIdentity.runAttempt
      || ownedObservation.g002.programKeccak256 !== ownedContext.beforeProgram
    : ownedObservation.g002.programKeccak256 !== ownedContext.candidateProgram
      || Date.parse(ownedContext.terminalAt) > ownedObservation.observedFrom * 1000) githubFail(G002_UPDATE_CODE)
  return Object.freeze({ schemaVersion: 1 as const, profile: G002_UPDATE_OBSERVATION_PROFILE,
    iss: 'https://release-auth.warpkeep.com' as const, aud: G002_UPDATE_OBSERVATION_AUDIENCE, purpose: G002_UPDATE_OBSERVATION_PURPOSE,
    identity: ownedIdentity, context: ownedContext, observation: ownedObservation,
    issuedAt, expiresAt: ownedObservation.observedThrough + 90 })
}
export type G002UpdateObservation = Readonly<ReturnType<typeof g002UpdatePayload>>
async function validateG002UpdatePair(preCompact: string, pre: G002UpdateObservation, post: G002UpdateObservation) {
  await validateUpdateLink(preCompact, pre, post)
  if (G002_KEYS.filter(key => key !== 'programKeccak256')
    .some(key => pre.observation.g002[key] !== post.observation.g002[key])) githubFail(G002_UPDATE_CODE)
}
/** Historical verification does not confer freshness or private claim authority. */
export async function verifyHistoricalG002UpdateObservation(compact: unknown): Promise<G002UpdateObservation> {
  try {
    if (typeof compact !== 'string' || compact.length > 16384) githubFail(G002_UPDATE_CODE)
    const parts = compact.split('.')
    const header = { alg: 'ES256', typ: G002_UPDATE_OBSERVATION_TYP, kid: RECOVERY_KEY_ID }
    if (parts.length !== 3 || parts[0] !== base64UrlEncode(encoder.encode(JSON.stringify(header)))) githubFail(G002_UPDATE_CODE)
    const raw = g002Exact(parseGitHubJsonObject(decode(parts[1]!), G002_UPDATE_CODE, []),
      ['schemaVersion', 'profile', 'iss', 'aud', 'purpose', 'identity', 'context', 'observation', 'issuedAt', 'expiresAt'])
    const expected = g002UpdatePayload(raw.identity as PtrObservationIdentity, raw.context as G002UpdateObservationContext,
      raw.observation, raw.issuedAt as number)
    if (parts[1] !== base64UrlEncode(encoder.encode(JSON.stringify(expected)))) githubFail(G002_UPDATE_CODE)
    await verifyUpdateSignature(parts, G002_UPDATE_CODE)
    return expected
  } catch { return githubFail(G002_UPDATE_CODE) }
}
export async function verifyG002UpdateObservation(compact: unknown, expectedIdentity: PtrObservationIdentity,
  expectedContext: G002UpdateObservationContext, nowSeconds: number): Promise<G002UpdateObservation> {
  try {
    const identity = snapshotPtrObservationIdentity(g002Exact(expectedIdentity, IDENTITY_KEYS))
    const context = snapshotG002UpdateObservationContext(expectedContext)
    const result = await verifyHistoricalG002UpdateObservation(compact)
    if (JSON.stringify(result.identity) !== JSON.stringify(identity) || JSON.stringify(result.context) !== JSON.stringify(context)
      || !positive(nowSeconds) || nowSeconds < result.issuedAt || nowSeconds >= result.expiresAt) githubFail(G002_UPDATE_CODE)
    return result
  } catch { return githubFail(G002_UPDATE_CODE) }
}
export async function verifyG002UpdateObservationPair(preCompact: unknown, postCompact: unknown): Promise<Readonly<{
  pre: G002UpdateObservation; post: G002UpdateObservation
}>> {
  try {
    const pre = await verifyHistoricalG002UpdateObservation(preCompact), post = await verifyHistoricalG002UpdateObservation(postCompact)
    await validateG002UpdatePair(preCompact as string, pre, post)
    return Object.freeze({ pre, post })
  } catch { return githubFail(G002_UPDATE_CODE) }
}
export async function signG002UpdateObservation(identity: PtrObservationIdentity, context: G002UpdateObservationContext,
  observation: CapturedG002BridgeObservation, issuedAt: number, privateJwk: JsonWebKey, preObservationJws?: string): Promise<string> {
  try {
    if (!capturedG002.has(observation)) githubFail(G002_UPDATE_CODE)
    const body = g002UpdatePayload(identity, context, observation, issuedAt)
    const signingKey = g002Exact(privateJwk, ['kty', 'crv', 'x', 'y', 'd']) as JsonWebKey
    if (body.context.phase === 'post') {
      const pre = await verifyHistoricalG002UpdateObservation(preObservationJws)
      await validateG002UpdatePair(preObservationJws!, pre, body)
    } else if (preObservationJws !== undefined) githubFail(G002_UPDATE_CODE)
    return await signUpdatePayload(body, G002_UPDATE_OBSERVATION_TYP, signingKey, G002_UPDATE_CODE)
  } catch { return githubFail(G002_UPDATE_CODE) }
}
