import {
  readReleaseRecoveryConfig,
  releaseRecoveryRpcCredentialMatches,
  type ReleaseRecoveryConfig,
} from './releaseRecoveryConfig'
import {
  SpacetimeReleaseRecoveryResolver,
  type SpacetimeReleaseRecoveryResolution,
} from './spacetimeReleaseRecoveryResolver'
import type { WorkerEnv } from './types'

export const RELEASE_RECOVERY_OBSERVATION_REQUEST_PROFILE =
  'warpkeep-release-recovery-realm-observation-request-v1' as const
export const RELEASE_RECOVERY_OBSERVATION_PROFILE =
  'warpkeep-release-recovery-realm-observation-v1' as const
export const RELEASE_RECOVERY_OBSERVATION_FAILURE =
  'RELEASE_RECOVERY_OBSERVATION_FAILED' as const
export const RELEASE_RECOVERY_OBSERVATION_REQUEST_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'rpcCredential',
  'requestId',
  'candidateCommit',
  'recoveryAuthorizationEpoch',
] as const)
export const RELEASE_RECOVERY_RESOLUTION_KEYS = Object.freeze([
  'observedFrom',
  'observedThrough',
  'g001',
  'g002',
  'ptr',
  'upstreamResponseDigests',
] as const)
export const RELEASE_RECOVERY_G001_KEYS = Object.freeze([
  'databaseIdentity',
  'programKeccak256',
  'realmId',
  'releaseVersion',
  'playerAccessEnabled',
  'admissionStateMutationsEnabled',
  'accessRequestSubmissionsEnabled',
  'sourceBaselineCommit',
  'freezeReleaseNonce',
  'admittedPlayerCount',
  'enabledPlayerCount',
  'censusStable',
  'admittedPlayerCensusHmacSha256',
  'alphaInvariantHmacSha256',
] as const)
export const RELEASE_RECOVERY_G002_KEYS = Object.freeze([
  'databaseIdentity',
  'programKeccak256',
  'realmId',
  'databaseName',
  'moduleIdentity',
  'releaseVersion',
  'launchState',
  'admissionsOpen',
  'accessRequestsOpen',
  'sealed',
  'atlasReady',
  'playerCount',
  'generalAdmissionCount',
  'populationGuardPassed',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'atlasSourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'sealedStateHmacSha256',
] as const)
export const RELEASE_RECOVERY_PTR_KEYS = Object.freeze([
  'databaseIdentity',
  'programKeccak256',
  'realmId',
  'releaseVersion',
  'moduleIdentity',
  'launchState',
  'admissionsOpen',
  'accessRequestsOpen',
  'sealed',
  'atlasReady',
  'populationGuardPassed',
  'singletonOwnerCount',
  'ownerEnabled',
  'generalAdmissionCount',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'atlasSourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'sealedStateHmacSha256',
  'ownerInvariantHmacSha256',
] as const)
export const RELEASE_RECOVERY_UPSTREAM_RESPONSE_DIGEST_KEYS = Object.freeze([
  'programIdentityBeforeTranscriptHmacSha256',
  'g001PolicyResponseHmacSha256',
  'g001AlphaBeforeResponseHmacSha256',
  'g001PlayerEnumerationBeforeResponseHmacSha256',
  'g001AdmissionStatusesResponseHmacSha256',
  'g001PlayerEnumerationAfterResponseHmacSha256',
  'g001AlphaAfterResponseHmacSha256',
  'g002StatusResponseHmacSha256',
  'ptrAdminStatusResponseHmacSha256',
  'ptrOwnerStatusResponseHmacSha256',
  'programIdentityAfterTranscriptHmacSha256',
] as const)

const REQUEST_MAXIMUM_BYTES = 512
const RESPONSE_MAXIMUM_BYTES = 64 * 1024
const OVERALL_TIMEOUT_MILLISECONDS = 75_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const BASE64URL_32_PATTERN = /^[A-Za-z0-9_-]{43}$/u
const PUBLIC_RELEASE_ID_PATTERN = /^GRR-[A-Z2-7]{26}$/u
const PUBLIC_APPROVAL_ID_PATTERN = /^GRA-[A-Z2-7]{26}$/u
const CANONICAL_FID_PATTERN = /^[1-9][0-9]{0,15}$/u
const GENESIS_001_DATABASE =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e' as const
const encoder = new TextEncoder()

export type ReleaseRecoveryObservationRequest = Readonly<{
  schemaVersion: 1
  profile: typeof RELEASE_RECOVERY_OBSERVATION_REQUEST_PROFILE
  rpcCredential: string
  requestId: string
  candidateCommit: string
  recoveryAuthorizationEpoch: number
}>

export type G001RecoveryObservation = SpacetimeReleaseRecoveryResolution['g001']
export type G002RecoveryObservation = SpacetimeReleaseRecoveryResolution['g002']
export type PtrRecoveryObservation = SpacetimeReleaseRecoveryResolution['ptr']
export type ReleaseRecoveryUpstreamResponseDigests =
  SpacetimeReleaseRecoveryResolution['upstreamResponseDigests']

export type ReleaseRecoveryRealmObservation = Readonly<{
  schemaVersion: 1
  profile: typeof RELEASE_RECOVERY_OBSERVATION_PROFILE
  requestId: string
  candidateCommit: string
  recoveryAuthorizationEpoch: number
  observedFrom: number
  observedThrough: number
  bridgeService: 'warpkeep-auth-bridge'
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1'
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigIdentity: string
  bridgeConfigEpoch: number
  publicAdmissionRequestsOpen: false
  g001: G001RecoveryObservation
  g002: G002RecoveryObservation
  ptr: PtrRecoveryObservation
  upstreamResponseDigests: ReleaseRecoveryUpstreamResponseDigests
}>

type Resolver = Readonly<{
  resolve(): Promise<SpacetimeReleaseRecoveryResolution>
}>

export type ReleaseRecoveryObservationTimer = Readonly<{
  signal: AbortSignal
  fired(): boolean
  cancel(): void
}>

export type ReleaseRecoveryRequestContext = Readonly<{
  signal: AbortSignal
  deadlineMilliseconds: number
  clockMilliseconds: () => number
  fired: () => boolean
}>

export type ReleaseRecoveryObservationDependencies = Readonly<{
  readConfig?: (env: WorkerEnv) => Promise<ReleaseRecoveryConfig>
  rpcCredentialMatches?: (provided: string, expected: string) => Promise<boolean>
  createResolver?: (
    config: ReleaseRecoveryConfig,
    requestContext: ReleaseRecoveryRequestContext,
  ) => Resolver
  clockMilliseconds?: () => number
  timerFactory?: (milliseconds: number) => ReleaseRecoveryObservationTimer
}>

export class ReleaseRecoveryObservationError extends Error {
  constructor() {
    super(RELEASE_RECOVERY_OBSERVATION_FAILURE)
    Object.defineProperty(this, 'name', {
      value: 'ReleaseRecoveryObservationError',
      configurable: true,
      enumerable: false,
      writable: true,
    })
    delete this.stack
  }
}

function fail(): never {
  throw new ReleaseRecoveryObservationError()
}

function defaultTimerFactory(milliseconds: number): ReleaseRecoveryObservationTimer {
  const controller = new AbortController()
  let timerFired = false
  const timeout = setTimeout(() => {
    timerFired = true
    controller.abort()
  }, milliseconds)
  return Object.freeze({
    signal: controller.signal,
    fired: () => timerFired,
    cancel: () => clearTimeout(timeout),
  })
}

function createRequestContext(
  clockMilliseconds: () => number,
  timerFactory: (milliseconds: number) => ReleaseRecoveryObservationTimer,
): Readonly<{
  context: ReleaseRecoveryRequestContext
  timer: ReleaseRecoveryObservationTimer
}> {
  const startedAt = clockMilliseconds()
  if (
    !Number.isSafeInteger(startedAt)
    || startedAt < 0
    || startedAt > Number.MAX_SAFE_INTEGER - OVERALL_TIMEOUT_MILLISECONDS
  ) fail()
  const timer = timerFactory(OVERALL_TIMEOUT_MILLISECONDS)
  if (
    timer === null
    || typeof timer !== 'object'
    || !(timer.signal instanceof AbortSignal)
    || typeof timer.fired !== 'function'
    || typeof timer.cancel !== 'function'
  ) fail()
  return Object.freeze({
    timer,
    context: Object.freeze({
      signal: timer.signal,
      deadlineMilliseconds: startedAt + OVERALL_TIMEOUT_MILLISECONDS,
      clockMilliseconds,
      fired: timer.fired,
    }),
  })
}

function requireLiveContext(context: ReleaseRecoveryRequestContext): void {
  const now = context.clockMilliseconds()
  if (
    context.signal.aborted
    || context.fired()
    || !Number.isSafeInteger(now)
    || now < 0
    || now >= context.deadlineMilliseconds
  ) fail()
}

async function beforeOverallDeadline<T>(
  operation: Promise<T>,
  context: ReleaseRecoveryRequestContext,
): Promise<T> {
  if (context.signal.aborted || context.fired()) fail()
  let removeAbortListener: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new ReleaseRecoveryObservationError())
    removeAbortListener = () => context.signal.removeEventListener('abort', onAbort)
    context.signal.addEventListener('abort', onAbort, { once: true })
    if (context.signal.aborted) onAbort()
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    removeAbortListener?.()
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=+$/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
}

function isCanonicalBase64Url32(value: unknown): value is string {
  if (typeof value !== 'string' || !BASE64URL_32_PATTERN.test(value)) return false
  let bytes: Uint8Array | undefined
  try {
    const binary = atob(`${value.replace(/-/gu, '+').replace(/_/gu, '/')}=`)
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return bytes.length === 32 && encodeBase64Url(bytes) === value
  } catch {
    return false
  } finally {
    bytes?.fill(0)
  }
}

function exactRequestObject(value: unknown): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail()
    if (Object.getPrototypeOf(value) !== Object.prototype) fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      ownKeys.length !== RELEASE_RECOVERY_OBSERVATION_REQUEST_KEYS.length
      || ownKeys.some(key => (
        typeof key !== 'string'
        || !RELEASE_RECOVERY_OBSERVATION_REQUEST_KEYS.includes(key as never)
      ))
    ) fail()
    const captured: Record<string, unknown> = Object.create(null)
    for (const key of RELEASE_RECOVERY_OBSERVATION_REQUEST_KEYS) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
      ) fail()
      captured[key] = descriptor.value
    }
    return captured
  } catch {
    fail()
  }
}

function captureRequest(value: unknown): ReleaseRecoveryObservationRequest {
  const request = exactRequestObject(value)
  if (
    request.schemaVersion !== 1
    || request.profile !== RELEASE_RECOVERY_OBSERVATION_REQUEST_PROFILE
    || !isCanonicalBase64Url32(request.rpcCredential)
    || typeof request.requestId !== 'string'
    || !UUID_PATTERN.test(request.requestId)
    || typeof request.candidateCommit !== 'string'
    || !COMMIT_PATTERN.test(request.candidateCommit)
    || typeof request.recoveryAuthorizationEpoch !== 'number'
    || !Number.isSafeInteger(request.recoveryAuthorizationEpoch)
    || request.recoveryAuthorizationEpoch < 1
  ) fail()
  const captured: ReleaseRecoveryObservationRequest = Object.freeze({
    schemaVersion: 1,
    profile: RELEASE_RECOVERY_OBSERVATION_REQUEST_PROFILE,
    rpcCredential: request.rpcCredential,
    requestId: request.requestId,
    candidateCommit: request.candidateCommit,
    recoveryAuthorizationEpoch: request.recoveryAuthorizationEpoch,
  })
  if (encoder.encode(JSON.stringify(captured)).byteLength > REQUEST_MAXIMUM_BYTES) fail()
  return captured
}

function exactResultObject(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      ownKeys.length !== keys.length
      || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))
    ) fail()
    const captured: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
      ) fail()
      captured[key] = descriptor.value
    }
    return captured
  } catch {
    fail()
  }
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateConfig(config: ReleaseRecoveryConfig): void {
  if (
    config.bridgeService !== 'warpkeep-auth-bridge'
    || config.bridgeWorkerVersion !== 'warpkeep-auth-bridge-release-recovery-v1'
    || !UUID_PATTERN.test(config.bridgeWorkerVersionId)
    || !COMMIT_PATTERN.test(config.bridgeSourceCommit)
    || !SHA256_PATTERN.test(config.bridgeConfigIdentity)
    || !Number.isSafeInteger(config.bridgeConfigEpoch)
    || config.bridgeConfigEpoch < 1
    || config.spacetimeOrigin !== 'https://maincloud.spacetimedb.com'
    || config.genesis001Database !== GENESIS_001_DATABASE
    || !SHA256_PATTERN.test(config.genesis002Database)
    || !SHA256_PATTERN.test(config.ptrDatabase)
    || config.genesis002Database === config.genesis001Database
    || config.ptrDatabase === config.genesis001Database
    || config.ptrDatabase === config.genesis002Database
    || config.genesis001Audience !== 'warpkeep-spacetimedb'
    || config.genesis002Audience !== 'warpkeep-genesis-002-spacetimedb'
    || config.ptrAudience !== 'warpkeep-ptr-spacetimedb'
    || !isCanonicalBase64Url32(config.rpcCredential)
    || !(config.censusPepperBytes instanceof Uint8Array)
    || config.censusPepperBytes.byteLength !== 32
    || !CANONICAL_FID_PATTERN.test(config.canaryFid)
    || BigInt(config.canaryFid) > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail()
}

function g001Observation(
  value: unknown,
  config: ReleaseRecoveryConfig,
): G001RecoveryObservation {
  const source = exactResultObject(value, RELEASE_RECOVERY_G001_KEYS)
  if (
    source.databaseIdentity !== config.genesis001Database
    || source.databaseIdentity !== GENESIS_001_DATABASE
    || typeof source.programKeccak256 !== 'string'
    || !SHA256_PATTERN.test(source.programKeccak256)
    || source.realmId !== 'GENESIS_001'
    || source.releaseVersion !== '0.3.43'
    || source.playerAccessEnabled !== true
    || source.admissionStateMutationsEnabled !== false
    || source.accessRequestSubmissionsEnabled !== false
    || source.sourceBaselineCommit !== '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
    || source.freezeReleaseNonce !== '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
    || !isNonnegativeSafeInteger(source.admittedPlayerCount)
    || source.admittedPlayerCount < 1
    || source.admittedPlayerCount > 100
    || source.enabledPlayerCount !== source.admittedPlayerCount
    || source.censusStable !== true
    || typeof source.admittedPlayerCensusHmacSha256 !== 'string'
    || !SHA256_PATTERN.test(source.admittedPlayerCensusHmacSha256)
    || typeof source.alphaInvariantHmacSha256 !== 'string'
    || !SHA256_PATTERN.test(source.alphaInvariantHmacSha256)
  ) fail()
  return Object.freeze({
    databaseIdentity: GENESIS_001_DATABASE,
    programKeccak256: source.programKeccak256,
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    admittedPlayerCount: source.admittedPlayerCount,
    enabledPlayerCount: source.admittedPlayerCount,
    censusStable: true,
    admittedPlayerCensusHmacSha256: source.admittedPlayerCensusHmacSha256,
    alphaInvariantHmacSha256: source.alphaInvariantHmacSha256,
  }) as G001RecoveryObservation
}

function g002Observation(
  value: unknown,
  config: ReleaseRecoveryConfig,
): G002RecoveryObservation {
  const source = exactResultObject(value, RELEASE_RECOVERY_G002_KEYS)
  if (
    source.databaseIdentity !== config.genesis002Database
    || typeof source.programKeccak256 !== 'string'
    || !SHA256_PATTERN.test(source.programKeccak256)
    || source.realmId !== 'GENESIS_002'
    || source.databaseName !== 'warpkeep-genesis-002'
    || source.moduleIdentity !== 'warpkeep-genesis-002-sealed-v1'
    || source.releaseVersion !== '0.4.0'
    || source.launchState !== 'sealed'
    || source.admissionsOpen !== false
    || source.accessRequestsOpen !== false
    || source.sealed !== true
    || source.atlasReady !== true
    || source.playerCount !== 0
    || source.generalAdmissionCount !== 0
    || source.populationGuardPassed !== true
    || source.atlasId !== 'GENESIS_002_GREATER_REALM'
    || typeof source.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID_PATTERN.test(source.publicReleaseId)
    || typeof source.publicApprovalReceiptId !== 'string'
    || !PUBLIC_APPROVAL_ID_PATTERN.test(source.publicApprovalReceiptId)
    || typeof source.atlasSourceCommit !== 'string'
    || !COMMIT_PATTERN.test(source.atlasSourceCommit)
    || typeof source.expectedReleaseSha256 !== 'string'
    || !SHA256_PATTERN.test(source.expectedReleaseSha256)
    || typeof source.releaseHeaderSha256 !== 'string'
    || !SHA256_PATTERN.test(source.releaseHeaderSha256)
    || typeof source.verificationDigest !== 'string'
    || !SHA256_PATTERN.test(source.verificationDigest)
    || typeof source.sealedStateHmacSha256 !== 'string'
    || !SHA256_PATTERN.test(source.sealedStateHmacSha256)
  ) fail()
  return Object.freeze({
    databaseIdentity: config.genesis002Database,
    programKeccak256: source.programKeccak256,
    realmId: 'GENESIS_002',
    databaseName: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    releaseVersion: '0.4.0',
    launchState: 'sealed',
    admissionsOpen: false,
    accessRequestsOpen: false,
    sealed: true,
    atlasReady: true,
    playerCount: 0,
    generalAdmissionCount: 0,
    populationGuardPassed: true,
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: source.publicReleaseId,
    publicApprovalReceiptId: source.publicApprovalReceiptId,
    atlasSourceCommit: source.atlasSourceCommit,
    expectedReleaseSha256: source.expectedReleaseSha256,
    releaseHeaderSha256: source.releaseHeaderSha256,
    verificationDigest: source.verificationDigest,
    sealedStateHmacSha256: source.sealedStateHmacSha256,
  }) as G002RecoveryObservation
}

function ptrObservation(
  value: unknown,
  config: ReleaseRecoveryConfig,
): PtrRecoveryObservation {
  const source = exactResultObject(value, RELEASE_RECOVERY_PTR_KEYS)
  if (
    source.databaseIdentity !== config.ptrDatabase
    || typeof source.programKeccak256 !== 'string'
    || !SHA256_PATTERN.test(source.programKeccak256)
    || source.realmId !== 'PTR'
    || source.releaseVersion !== '0.4.0-ptr.1'
    || source.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || source.launchState !== 'owner-only'
    || source.admissionsOpen !== false
    || source.accessRequestsOpen !== false
    || source.sealed !== true
    || source.atlasReady !== true
    || source.populationGuardPassed !== true
    || source.singletonOwnerCount !== 1
    || source.ownerEnabled !== true
    || source.generalAdmissionCount !== 0
    || source.atlasId !== 'PTR_GREATER_REALM'
    || typeof source.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID_PATTERN.test(source.publicReleaseId)
    || typeof source.publicApprovalReceiptId !== 'string'
    || !PUBLIC_APPROVAL_ID_PATTERN.test(source.publicApprovalReceiptId)
    || typeof source.atlasSourceCommit !== 'string'
    || !COMMIT_PATTERN.test(source.atlasSourceCommit)
    || typeof source.expectedReleaseSha256 !== 'string'
    || !SHA256_PATTERN.test(source.expectedReleaseSha256)
    || typeof source.releaseHeaderSha256 !== 'string'
    || !SHA256_PATTERN.test(source.releaseHeaderSha256)
    || typeof source.verificationDigest !== 'string'
    || !SHA256_PATTERN.test(source.verificationDigest)
    || typeof source.sealedStateHmacSha256 !== 'string'
    || !SHA256_PATTERN.test(source.sealedStateHmacSha256)
    || typeof source.ownerInvariantHmacSha256 !== 'string'
    || !SHA256_PATTERN.test(source.ownerInvariantHmacSha256)
  ) fail()
  return Object.freeze({
    databaseIdentity: config.ptrDatabase,
    programKeccak256: source.programKeccak256,
    realmId: 'PTR',
    releaseVersion: '0.4.0-ptr.1',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    launchState: 'owner-only',
    admissionsOpen: false,
    accessRequestsOpen: false,
    sealed: true,
    atlasReady: true,
    populationGuardPassed: true,
    singletonOwnerCount: 1,
    ownerEnabled: true,
    generalAdmissionCount: 0,
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: source.publicReleaseId,
    publicApprovalReceiptId: source.publicApprovalReceiptId,
    atlasSourceCommit: source.atlasSourceCommit,
    expectedReleaseSha256: source.expectedReleaseSha256,
    releaseHeaderSha256: source.releaseHeaderSha256,
    verificationDigest: source.verificationDigest,
    sealedStateHmacSha256: source.sealedStateHmacSha256,
    ownerInvariantHmacSha256: source.ownerInvariantHmacSha256,
  }) as PtrRecoveryObservation
}

function responseDigests(value: unknown): ReleaseRecoveryUpstreamResponseDigests {
  const source = exactResultObject(value, RELEASE_RECOVERY_UPSTREAM_RESPONSE_DIGEST_KEYS)
  for (const key of RELEASE_RECOVERY_UPSTREAM_RESPONSE_DIGEST_KEYS) {
    if (typeof source[key] !== 'string' || !SHA256_PATTERN.test(source[key])) fail()
  }
  return Object.freeze({
    programIdentityBeforeTranscriptHmacSha256: source.programIdentityBeforeTranscriptHmacSha256,
    g001PolicyResponseHmacSha256: source.g001PolicyResponseHmacSha256,
    g001AlphaBeforeResponseHmacSha256: source.g001AlphaBeforeResponseHmacSha256,
    g001PlayerEnumerationBeforeResponseHmacSha256:
      source.g001PlayerEnumerationBeforeResponseHmacSha256,
    g001AdmissionStatusesResponseHmacSha256: source.g001AdmissionStatusesResponseHmacSha256,
    g001PlayerEnumerationAfterResponseHmacSha256:
      source.g001PlayerEnumerationAfterResponseHmacSha256,
    g001AlphaAfterResponseHmacSha256: source.g001AlphaAfterResponseHmacSha256,
    g002StatusResponseHmacSha256: source.g002StatusResponseHmacSha256,
    ptrAdminStatusResponseHmacSha256: source.ptrAdminStatusResponseHmacSha256,
    ptrOwnerStatusResponseHmacSha256: source.ptrOwnerStatusResponseHmacSha256,
    programIdentityAfterTranscriptHmacSha256: source.programIdentityAfterTranscriptHmacSha256,
  }) as ReleaseRecoveryUpstreamResponseDigests
}

function exactResolution(
  value: unknown,
  config: ReleaseRecoveryConfig,
): SpacetimeReleaseRecoveryResolution {
  const source = exactResultObject(value, RELEASE_RECOVERY_RESOLUTION_KEYS)
  if (
    !isNonnegativeSafeInteger(source.observedFrom)
    || !isNonnegativeSafeInteger(source.observedThrough)
    || source.observedThrough < source.observedFrom
    || source.observedThrough - source.observedFrom > 75
  ) fail()
  return Object.freeze({
    observedFrom: source.observedFrom,
    observedThrough: source.observedThrough,
    g001: g001Observation(source.g001, config),
    g002: g002Observation(source.g002, config),
    ptr: ptrObservation(source.ptr, config),
    upstreamResponseDigests: responseDigests(source.upstreamResponseDigests),
  }) as SpacetimeReleaseRecoveryResolution
}

export async function observeReleaseRecoveryState(
  env: WorkerEnv,
  request: ReleaseRecoveryObservationRequest,
  dependencies: ReleaseRecoveryObservationDependencies = {},
): Promise<ReleaseRecoveryRealmObservation> {
  let recoveryConfig: ReleaseRecoveryConfig | undefined
  let recoveryConfigPromise: Promise<ReleaseRecoveryConfig> | undefined
  let overallTimer: ReleaseRecoveryObservationTimer | undefined
  try {
    const capturedRequest = captureRequest(request)
    const clockMilliseconds = dependencies.clockMilliseconds ?? Date.now
    const timerFactory = dependencies.timerFactory ?? defaultTimerFactory
    const requestScope = createRequestContext(clockMilliseconds, timerFactory)
    overallTimer = requestScope.timer
    const requestContext = requestScope.context
    const readConfig = dependencies.readConfig ?? readReleaseRecoveryConfig
    const credentialMatches = dependencies.rpcCredentialMatches
      ?? releaseRecoveryRpcCredentialMatches
    recoveryConfigPromise = Promise.resolve(readConfig(env))
    const config = await beforeOverallDeadline(recoveryConfigPromise, requestContext)
    recoveryConfig = config
    requireLiveContext(requestContext)
    validateConfig(config)
    const credentialAccepted = await beforeOverallDeadline(
      credentialMatches(capturedRequest.rpcCredential, config.rpcCredential),
      requestContext,
    )
    requireLiveContext(requestContext)
    if (!credentialAccepted) fail()
    const resolver = dependencies.createResolver === undefined
      ? new SpacetimeReleaseRecoveryResolver(config, { requestContext })
      : dependencies.createResolver(config, requestContext)
    const resolved = await beforeOverallDeadline(resolver.resolve(), requestContext)
    requireLiveContext(requestContext)
    const resolution = exactResolution(resolved, config)
    const response: ReleaseRecoveryRealmObservation = Object.freeze({
      schemaVersion: 1,
      profile: RELEASE_RECOVERY_OBSERVATION_PROFILE,
      requestId: capturedRequest.requestId,
      candidateCommit: capturedRequest.candidateCommit,
      recoveryAuthorizationEpoch: capturedRequest.recoveryAuthorizationEpoch,
      observedFrom: resolution.observedFrom,
      observedThrough: resolution.observedThrough,
      bridgeService: config.bridgeService,
      bridgeWorkerVersion: config.bridgeWorkerVersion,
      bridgeWorkerVersionId: config.bridgeWorkerVersionId,
      bridgeSourceCommit: config.bridgeSourceCommit,
      bridgeConfigIdentity: config.bridgeConfigIdentity,
      bridgeConfigEpoch: config.bridgeConfigEpoch,
      publicAdmissionRequestsOpen: false,
      g001: resolution.g001,
      g002: resolution.g002,
      ptr: resolution.ptr,
      upstreamResponseDigests: resolution.upstreamResponseDigests,
    })
    if (encoder.encode(JSON.stringify(response)).byteLength > RESPONSE_MAXIMUM_BYTES) fail()
    return response
  } catch {
    throw new ReleaseRecoveryObservationError()
  } finally {
    if (recoveryConfig === undefined && recoveryConfigPromise !== undefined) {
      void recoveryConfigPromise.then(
        lateConfig => {
          try {
            lateConfig.censusPepperBytes.fill(0)
          } catch {
            // Late cleanup cannot create an unhandled rejection.
          }
        },
        () => undefined,
      )
    }
    try {
      recoveryConfig?.censusPepperBytes.fill(0)
    } catch {
      // Cleanup cannot replace the selected success value or stable failure.
    }
    try {
      overallTimer?.cancel()
    } catch {
      // Cleanup cannot replace the selected success value or stable failure.
    }
  }
}
