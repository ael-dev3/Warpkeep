import {
  RECOVERY_BINDING_PATH,
  recoveryRealmBindingProjectionKeys,
  RECOVERY_WORKFLOW_PATH,
  recoveryRealmBindingProjectionFromArmed,
  snapshotRecoveryArmingTuple,
  snapshotRecoveryRealmBindingProjection,
  type RecoveryArmingTuple,
  type RecoveryRealmBindingProjection,
} from './config.js'
import { serializeExactObject, sha256Hex, type JsonValue } from './protocol.js'
import {
  RAW_MODULE_DEF_V10_MAX_BYTES,
  parseAndNormalizeRawModuleDefV10,
} from './rawModuleDefV10.js'
import {
  validateSpacetimeProgramPins,
  type SpacetimeProgramPins,
} from './spacetimeProgramPins.js'

export const RECOVERY_REALM_EVIDENCE_FAILED = 'RECOVERY_REALM_EVIDENCE_FAILED' as const
export const RECOVERY_REALM_EVIDENCE_PROFILE =
  'warpkeep-release-recovery-realm-evidence-v1' as const

const BRIDGE_REQUEST_PROFILE =
  'warpkeep-release-recovery-realm-observation-request-v1' as const
const BRIDGE_RESPONSE_PROFILE =
  'warpkeep-release-recovery-realm-observation-v1' as const
const LIVE_INVARIANT_PROFILE =
  'warpkeep-release-recovery-realm-live-invariant-v1' as const
const EVIDENCE_SNAPSHOT_PROFILE =
  'warpkeep-release-recovery-realm-evidence-snapshot-v1' as const
const MAINCLOUD_ORIGIN = 'https://maincloud.spacetimedb.com' as const
const OVERALL_TIMEOUT_MILLISECONDS = 90_000
const REQUEST_TIMEOUT_MILLISECONDS = 4_000
const MAXIMUM_BRIDGE_RESPONSE_BYTES = 64 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/u
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u
const PUBLIC_APPROVAL_ID = /^GRA-[A-Z2-7]{26}$/u
const encoder = new TextEncoder()

const BRIDGE_REQUEST_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'rpcCredential', 'requestId', 'candidateCommit',
  'recoveryAuthorizationEpoch',
] as const)

const BRIDGE_RESPONSE_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'requestId', 'candidateCommit',
  'recoveryAuthorizationEpoch', 'observedFrom', 'observedThrough',
  'bridgeService', 'bridgeWorkerVersion', 'bridgeWorkerVersionId',
  'bridgeSourceCommit', 'bridgeConfigIdentity', 'bridgeConfigEpoch',
  'publicAdmissionRequestsOpen', 'g001', 'g002', 'ptr',
  'upstreamResponseDigests',
] as const)

const G001_KEYS = Object.freeze([
  'databaseIdentity', 'programKeccak256', 'realmId', 'releaseVersion',
  'playerAccessEnabled', 'admissionStateMutationsEnabled',
  'accessRequestSubmissionsEnabled', 'sourceBaselineCommit',
  'freezeReleaseNonce', 'admittedPlayerCount', 'enabledPlayerCount',
  'censusStable', 'admittedPlayerCensusHmacSha256', 'alphaInvariantHmacSha256',
] as const)

const G002_KEYS = Object.freeze([
  'databaseIdentity', 'programKeccak256', 'realmId', 'databaseName',
  'moduleIdentity', 'releaseVersion', 'launchState', 'admissionsOpen',
  'accessRequestsOpen', 'sealed', 'atlasReady', 'playerCount',
  'generalAdmissionCount', 'populationGuardPassed', 'atlasId',
  'publicReleaseId', 'publicApprovalReceiptId', 'atlasSourceCommit',
  'expectedReleaseSha256', 'releaseHeaderSha256', 'verificationDigest',
  'sealedStateHmacSha256',
] as const)

const PTR_KEYS = Object.freeze([
  'databaseIdentity', 'programKeccak256', 'realmId', 'releaseVersion',
  'moduleIdentity', 'launchState', 'admissionsOpen', 'accessRequestsOpen',
  'sealed', 'atlasReady', 'populationGuardPassed', 'singletonOwnerCount',
  'ownerEnabled', 'generalAdmissionCount', 'atlasId', 'publicReleaseId',
  'publicApprovalReceiptId', 'atlasSourceCommit', 'expectedReleaseSha256',
  'releaseHeaderSha256', 'verificationDigest', 'sealedStateHmacSha256',
  'ownerInvariantHmacSha256',
] as const)

const UPSTREAM_DIGEST_KEYS = Object.freeze([
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

export const LIVE_INVARIANT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'requestId', 'candidateCommit',
  'recoveryAuthorizationEpoch', 'recoveryAuthorizationCoreSha256',
  'protectedRealmBindingSha256', 'armedRealmBindingSha256', 'bindingPath',
  'workflowPath', 'bridgeService', 'bridgeWorkerVersion',
  'bridgeWorkerVersionId', 'bridgeSourceCommit', 'bridgeConfigIdentity',
  'bridgeConfigEpoch', 'publicAdmissionRequestsOpen', 'genesis001Database',
  'genesis002Database', 'ptrDatabase', 'g001ExpectedProgramKeccak256',
  'g002ExpectedProgramKeccak256', 'ptrExpectedProgramKeccak256',
  'g001ProgramKeccak256', 'g002ProgramKeccak256', 'ptrProgramKeccak256',
  'g001ProgramArtifactSha256', 'g002ProgramArtifactSha256',
  'ptrProgramArtifactSha256', 'g001ReleaseVersion',
  'g001PlayerAccessEnabled', 'g001AdmissionStateMutationsEnabled',
  'g001AccessRequestSubmissionsEnabled', 'g001AdmittedPlayerCount',
  'g001EnabledPlayerCount', 'g001CensusStable',
  'g001AdmittedPlayerCensusHmacSha256', 'g001AlphaInvariantHmacSha256',
  'g001BaselineAbiSha256', 'g001DeployedAbiV10Sha256', 'g002Sealed',
  'g002AtlasReady', 'g002PlayerCount', 'g002GeneralAdmissionCount',
  'g002PopulationGuardPassed', 'g002ExpectedAtlasId', 'g002AtlasId',
  'g002ExpectedPublicReleaseId', 'g002PublicReleaseId',
  'g002ExpectedPublicApprovalReceiptId', 'g002PublicApprovalReceiptId',
  'g002ExpectedAtlasSourceCommit', 'g002AtlasSourceCommit',
  'g002PinnedExpectedReleaseSha256', 'g002ExpectedReleaseSha256',
  'g002ExpectedReleaseHeaderSha256', 'g002ReleaseHeaderSha256',
  'g002ExpectedVerificationDigest', 'g002VerificationDigest',
  'g002SealedStateHmacSha256', 'g002DeployedAbiV10Sha256', 'ptrSealed',
  'ptrSingletonOwnerCount', 'ptrOwnerEnabled', 'ptrAtlasReady',
  'ptrGeneralAdmissionCount', 'ptrPopulationGuardPassed',
  'ptrExpectedAtlasId', 'ptrAtlasId', 'ptrExpectedPublicReleaseId',
  'ptrPublicReleaseId', 'ptrExpectedPublicApprovalReceiptId',
  'ptrPublicApprovalReceiptId', 'ptrExpectedAtlasSourceCommit',
  'ptrAtlasSourceCommit', 'ptrPinnedExpectedReleaseSha256',
  'ptrExpectedReleaseSha256', 'ptrExpectedReleaseHeaderSha256',
  'ptrReleaseHeaderSha256', 'ptrExpectedVerificationDigest',
  'ptrVerificationDigest', 'ptrSealedStateHmacSha256',
  'ptrOwnerInvariantHmacSha256', 'ptrDeployedAbiV10Sha256',
] as const)

export const EVIDENCE_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'phase', 'observationSequence',
  'liveInvariantDigest', 'observedFrom', 'observedThrough',
  'bridgeObservedFrom', 'bridgeObservedThrough',
  'programIdentityBeforeTranscriptHmacSha256',
  'g001PolicyResponseHmacSha256', 'g001AlphaBeforeResponseHmacSha256',
  'g001PlayerEnumerationBeforeResponseHmacSha256',
  'g001AdmissionStatusesResponseHmacSha256',
  'g001PlayerEnumerationAfterResponseHmacSha256',
  'g001AlphaAfterResponseHmacSha256', 'g002StatusResponseHmacSha256',
  'ptrAdminStatusResponseHmacSha256', 'ptrOwnerStatusResponseHmacSha256',
  'programIdentityAfterTranscriptHmacSha256',
  'g001SchemaResponseSha256', 'g002SchemaResponseSha256',
  'ptrSchemaResponseSha256',
] as const)

export class RecoveryRealmEvidenceError extends Error {
  readonly code = RECOVERY_REALM_EVIDENCE_FAILED

  constructor() {
    super(RECOVERY_REALM_EVIDENCE_FAILED)
    Object.defineProperty(this, 'name', {
      value: 'RecoveryRealmEvidenceError',
      configurable: true,
      enumerable: false,
      writable: true,
    })
    delete this.stack
  }
}

function fail(): never {
  throw new RecoveryRealmEvidenceError()
}

export type RecoveryObservationPhase =
  | Readonly<{ phase: 'issue'; sequence: 1 }>
  | Readonly<{ phase: 'claim'; sequence: 2 }>

export type ReleaseRecoveryObservationRequest = Readonly<{
  schemaVersion: 1
  profile: typeof BRIDGE_REQUEST_PROFILE
  rpcCredential: string
  requestId: string
  candidateCommit: string
  recoveryAuthorizationEpoch: number
}>

export type ReleaseRecoveryObservationService = Readonly<{
  observeReleaseRecoveryState(request: ReleaseRecoveryObservationRequest): Promise<unknown>
}>

export type ExpectedRawModuleDefV10Fixtures = Readonly<{
  g001: Uint8Array
  g002: Uint8Array
  ptr: Uint8Array
}>

export type RecoveryRealmEvidenceBase = Readonly<{
  schemaVersion: 1
  profile: typeof RECOVERY_REALM_EVIDENCE_PROFILE
  requestId: string
  candidateCommit: string
  recoveryAuthorizationEpoch: number
  recoveryAuthorizationCoreSha256: string
  protectedRealmBindingSha256: string
  armedRealmBindingSha256: string
  bindingPath: typeof RECOVERY_BINDING_PATH
  workflowPath: typeof RECOVERY_WORKFLOW_PATH
  observedFrom: number
  observedThrough: number
  bridgeObservedFrom: number
  bridgeObservedThrough: number
  bridgeService: 'warpkeep-auth-bridge'
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1'
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigIdentity: string
  bridgeConfigEpoch: number
  publicAdmissionRequestsOpen: false
  genesis001Database: string
  genesis002Database: string
  ptrDatabase: string
  g001ExpectedProgramKeccak256: string
  g002ExpectedProgramKeccak256: string
  ptrExpectedProgramKeccak256: string
  g001ProgramKeccak256: string
  g002ProgramKeccak256: string
  ptrProgramKeccak256: string
  g001ProgramArtifactSha256: string
  g002ProgramArtifactSha256: string
  ptrProgramArtifactSha256: string
  g001ReleaseVersion: '0.3.43'
  g001PlayerAccessEnabled: true
  g001AdmissionStateMutationsEnabled: false
  g001AccessRequestSubmissionsEnabled: false
  g001AdmittedPlayerCount: number
  g001EnabledPlayerCount: number
  g001CensusStable: true
  g001AdmittedPlayerCensusHmacSha256: string
  g001AlphaInvariantHmacSha256: string
  g001BaselineAbiSha256: string
  g001DeployedAbiV10Sha256: string
  g002Sealed: true
  g002AtlasReady: true
  g002PlayerCount: 0
  g002GeneralAdmissionCount: 0
  g002PopulationGuardPassed: true
  g002ExpectedAtlasId: string
  g002AtlasId: string
  g002ExpectedPublicReleaseId: string
  g002PublicReleaseId: string
  g002ExpectedPublicApprovalReceiptId: string
  g002PublicApprovalReceiptId: string
  g002ExpectedAtlasSourceCommit: string
  g002AtlasSourceCommit: string
  g002PinnedExpectedReleaseSha256: string
  g002ExpectedReleaseSha256: string
  g002ExpectedReleaseHeaderSha256: string
  g002ReleaseHeaderSha256: string
  g002ExpectedVerificationDigest: string
  g002VerificationDigest: string
  g002SealedStateHmacSha256: string
  g002DeployedAbiV10Sha256: string
  ptrSealed: true
  ptrSingletonOwnerCount: 1
  ptrOwnerEnabled: true
  ptrAtlasReady: true
  ptrGeneralAdmissionCount: 0
  ptrPopulationGuardPassed: true
  ptrExpectedAtlasId: string
  ptrAtlasId: string
  ptrExpectedPublicReleaseId: string
  ptrPublicReleaseId: string
  ptrExpectedPublicApprovalReceiptId: string
  ptrPublicApprovalReceiptId: string
  ptrExpectedAtlasSourceCommit: string
  ptrAtlasSourceCommit: string
  ptrPinnedExpectedReleaseSha256: string
  ptrExpectedReleaseSha256: string
  ptrExpectedReleaseHeaderSha256: string
  ptrReleaseHeaderSha256: string
  ptrExpectedVerificationDigest: string
  ptrVerificationDigest: string
  ptrSealedStateHmacSha256: string
  ptrOwnerInvariantHmacSha256: string
  ptrDeployedAbiV10Sha256: string
  programIdentityBeforeTranscriptHmacSha256: string
  g001PolicyResponseHmacSha256: string
  g001AlphaBeforeResponseHmacSha256: string
  g001PlayerEnumerationBeforeResponseHmacSha256: string
  g001AdmissionStatusesResponseHmacSha256: string
  g001PlayerEnumerationAfterResponseHmacSha256: string
  g001AlphaAfterResponseHmacSha256: string
  g002StatusResponseHmacSha256: string
  ptrAdminStatusResponseHmacSha256: string
  ptrOwnerStatusResponseHmacSha256: string
  programIdentityAfterTranscriptHmacSha256: string
  g001SchemaResponseSha256: string
  g002SchemaResponseSha256: string
  ptrSchemaResponseSha256: string
  liveInvariantDigest: string
  evidenceSnapshotDigest: string
}>

type RecoveryEvidencePhase =
  | Readonly<{ phase: 'issue'; observationSequence: 1 }>
  | Readonly<{ phase: 'claim'; observationSequence: 2 }>

export type RecoveryRealmEvidence = Readonly<RecoveryRealmEvidenceBase & RecoveryEvidencePhase>

export type ObserveRecoveryRealmEvidenceInput = Readonly<{
  bridge: ReleaseRecoveryObservationService
  rpcCredential: string
  binding: RecoveryRealmBindingProjection
  armed: RecoveryArmingTuple
  candidateCommit: string
  pins: SpacetimeProgramPins
  expectedRawModuleDefV10Fixtures: ExpectedRawModuleDefV10Fixtures
  fetch: typeof fetch
}> & RecoveryObservationPhase

type RealmName = 'g001' | 'g002' | 'ptr'

type CapturedBridgeObservation = Readonly<{
  observedFrom: number
  observedThrough: number
  bridgeService: 'warpkeep-auth-bridge'
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1'
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigIdentity: string
  bridgeConfigEpoch: number
  publicAdmissionRequestsOpen: false
  g001: Readonly<Record<string, JsonValue>>
  g002: Readonly<Record<string, JsonValue>>
  ptr: Readonly<Record<string, JsonValue>>
  upstreamResponseDigests: Readonly<Record<string, string>>
}>

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
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
    || new Set(keys).size !== keys.length
    || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))
  ) fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value')
    ) fail()
    result[key] = descriptor.value
  }
  return Object.freeze(result)
}

function exactFixtures(value: unknown): ExpectedRawModuleDefV10Fixtures {
  const source = exactRecord(value, ['g001', 'g002', 'ptr'])
  const result: Partial<Record<RealmName, Uint8Array>> = {}
  for (const realm of ['g001', 'g002', 'ptr'] as const) {
    const bytes = source[realm]
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) fail()
    result[realm] = bytes.slice()
  }
  return Object.freeze(result) as ExpectedRawModuleDefV10Fixtures
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!
  }
  return difference === 0
}

function safeNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function positiveSafe(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value)
}

function canonicalBase64Url32(value: unknown): value is string {
  if (typeof value !== 'string' || !BASE64URL_32.test(value)) return false
  try {
    const standard = `${value.replace(/-/gu, '+').replace(/_/gu, '/')}=`
    const binary = atob(standard)
    if (binary.length !== 32) return false
    const encoded = btoa(binary).replace(/=+$/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    return encoded === value
  } catch {
    return false
  }
}

function validatePhase(input: ObserveRecoveryRealmEvidenceInput): void {
  if (
    (input.phase !== 'issue' || input.sequence !== 1)
    && (input.phase !== 'claim' || input.sequence !== 2)
  ) fail()
}

function captureBridgeRequest(
  rpcCredential: unknown,
  binding: RecoveryRealmBindingProjection,
  candidateCommit: unknown,
): ReleaseRecoveryObservationRequest {
  if (!canonicalBase64Url32(rpcCredential) || typeof candidateCommit !== 'string' || !COMMIT.test(candidateCommit)) fail()
  const request = Object.freeze({
    schemaVersion: 1 as const,
    profile: BRIDGE_REQUEST_PROFILE,
    rpcCredential,
    requestId: binding.requestId,
    candidateCommit,
    recoveryAuthorizationEpoch: binding.authorizationEpoch,
  })
  const captured = exactRecord(request, BRIDGE_REQUEST_KEYS)
  if (
    captured.schemaVersion !== 1
    || captured.profile !== BRIDGE_REQUEST_PROFILE
    || captured.rpcCredential !== rpcCredential
    || captured.requestId !== binding.requestId
    || captured.candidateCommit !== candidateCommit
    || captured.recoveryAuthorizationEpoch !== binding.authorizationEpoch
    || encoder.encode(JSON.stringify(request)).byteLength > 512
  ) fail()
  return request
}

function validateStaticInputs(input: ObserveRecoveryRealmEvidenceInput): Readonly<{
  binding: RecoveryRealmBindingProjection
  armed: RecoveryArmingTuple
  pins: SpacetimeProgramPins
  fixtures: ExpectedRawModuleDefV10Fixtures
  protectedBindingBytes: Uint8Array
  armedBindingBytes: Uint8Array
  request: ReleaseRecoveryObservationRequest
  observeReleaseRecoveryState: ReleaseRecoveryObservationService['observeReleaseRecoveryState']
}> {
  validatePhase(input)
  const bridgeCapability = exactRecord(input.bridge, ['observeReleaseRecoveryState'])
  const observeReleaseRecoveryState = bridgeCapability.observeReleaseRecoveryState
  if (typeof observeReleaseRecoveryState !== 'function') fail()
  const capturedObserver = observeReleaseRecoveryState as (
    request: ReleaseRecoveryObservationRequest,
  ) => Promise<unknown>
  const binding = snapshotRecoveryRealmBindingProjection(input.binding, RECOVERY_REALM_EVIDENCE_FAILED)
  const armed = snapshotRecoveryArmingTuple(input.armed, RECOVERY_REALM_EVIDENCE_FAILED)
  const armedProjection = recoveryRealmBindingProjectionFromArmed(armed, RECOVERY_REALM_EVIDENCE_FAILED)
  const protectedBindingBytes = serializeExactObject(
    recoveryRealmBindingProjectionKeys(binding),
    binding as never,
  )
  const armedBindingBytes = serializeExactObject(
    recoveryRealmBindingProjectionKeys(armedProjection),
    armedProjection as never,
  )
  if (!equalBytes(protectedBindingBytes, armedBindingBytes)) fail()
  const pins = validateSpacetimeProgramPins(input.pins)
  if (
    pins.realms.g001.databaseIdentity !== binding.genesis001Database
    || pins.realms.g002.databaseIdentity !== binding.genesis002Database
    || pins.realms.ptr.databaseIdentity !== binding.ptrDatabase
    || pins.realms.g001.programKeccak256 !== binding.g001ExpectedProgramKeccak256
    || pins.realms.g002.programKeccak256 !== binding.g002ExpectedProgramKeccak256
    || pins.realms.ptr.programKeccak256 !== binding.ptrExpectedProgramKeccak256
  ) fail()
  const fixtures = exactFixtures(input.expectedRawModuleDefV10Fixtures)
  for (const realm of ['g001', 'g002', 'ptr'] as const) {
    const normalized = parseAndNormalizeRawModuleDefV10(fixtures[realm])
    if (!equalBytes(fixtures[realm], normalized.canonicalBytes())) fail()
  }
  if (typeof input.fetch !== 'function') fail()
  const request = captureBridgeRequest(input.rpcCredential, binding, input.candidateCommit)
  return Object.freeze({
    binding,
    armed,
    pins,
    fixtures,
    protectedBindingBytes,
    armedBindingBytes,
    request,
    observeReleaseRecoveryState: capturedObserver,
  })
}

function requireRuntimeNow(): number {
  const value = Date.now()
  if (!safeNonnegative(value)) fail()
  return value
}

function requireUnixNow(): number {
  const value = Math.floor(Date.now() / 1_000)
  if (!safeNonnegative(value)) fail()
  return value
}

function requireBeforeDeadline(
  deadline: number,
  signals: readonly AbortSignal[],
): number {
  if (signals.some(signal => signal.aborted)) fail()
  const now = requireRuntimeNow()
  if (now >= deadline) fail()
  return now
}

type OwnedTimeout = Readonly<{
  signal: AbortSignal
  cancel(): void
}>

function createOwnedTimeout(milliseconds: number): OwnedTimeout {
  if (!positiveSafe(milliseconds)) fail()
  const controller = new AbortController()
  const handle = setTimeout(() => {
    controller.abort()
  }, milliseconds)
  return Object.freeze({
    signal: controller.signal,
    cancel: () => clearTimeout(handle),
  })
}

async function raceSignals<T>(operation: Promise<T>, signals: readonly AbortSignal[]): Promise<T> {
  if (signals.some(signal => signal.aborted)) fail()
  const removers: (() => void)[] = []
  const aborted = new Promise<never>((_resolve, reject) => {
    for (const signal of signals) {
      const listener = () => reject(new RecoveryRealmEvidenceError())
      signal.addEventListener('abort', listener, { once: true })
      removers.push(() => signal.removeEventListener('abort', listener))
      if (signal.aborted) listener()
    }
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    for (const remove of removers) remove()
  }
}

function combinedSignal(signals: readonly AbortSignal[]): Readonly<{
  signal: AbortSignal
  cleanup(): void
}> {
  const controller = new AbortController()
  const removers: (() => void)[] = []
  for (const signal of signals) {
    const listener = () => controller.abort()
    signal.addEventListener('abort', listener, { once: true })
    removers.push(() => signal.removeEventListener('abort', listener))
    if (signal.aborted) controller.abort()
  }
  return Object.freeze({
    signal: controller.signal,
    cleanup: () => { for (const remove of removers) remove() },
  })
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array> | undefined): void {
  if (reader === undefined) return
  try {
    void reader.cancel().catch(() => undefined)
  } catch {
    // Cleanup must not replace the fixed failure.
  }
  try {
    reader.releaseLock()
  } catch {
    // Cleanup must not replace the fixed failure.
  }
}

async function readBoundedBody(response: Response, signals: readonly AbortSignal[]): Promise<Uint8Array> {
  const lengthHeader = response.headers.get('content-length')
  if (
    lengthHeader !== null
    && (!/^(?:0|[1-9][0-9]*)$/u.test(lengthHeader) || Number(lengthHeader) > RAW_MODULE_DEF_V10_MAX_BYTES)
  ) fail()
  if (response.body === null) fail()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    reader = response.body.getReader()
    while (true) {
      const result = await raceSignals(reader.read(), signals)
      if (result.done) break
      if (!(result.value instanceof Uint8Array)) fail()
      total += result.value.byteLength
      if (total > RAW_MODULE_DEF_V10_MAX_BYTES) fail()
      chunks.push(result.value.slice())
    }
    if (lengthHeader !== null && Number(lengthHeader) !== total) fail()
    const output = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    reader.releaseLock()
    reader = undefined
    return output
  } catch {
    cancelReader(reader)
    fail()
  }
}

const ABI_DOMAINS: Readonly<Record<RealmName, string>> = Object.freeze({
  g001: 'warpkeep.release-recovery.spacetimedb-abi.g001.raw-module-def-v10.v1\n',
  g002: 'warpkeep.release-recovery.spacetimedb-abi.g002.raw-module-def-v10.v1\n',
  ptr: 'warpkeep.release-recovery.spacetimedb-abi.ptr.raw-module-def-v10.v1\n',
})
const RESPONSE_DOMAINS: Readonly<Record<RealmName, string>> = Object.freeze({
  g001: 'warpkeep.release-recovery.spacetimedb-schema-response.g001.raw-module-def-v10.v1\n',
  g002: 'warpkeep.release-recovery.spacetimedb-schema-response.g002.raw-module-def-v10.v1\n',
  ptr: 'warpkeep.release-recovery.spacetimedb-schema-response.ptr.raw-module-def-v10.v1\n',
})

async function fetchSchema(
  realm: RealmName,
  database: string,
  fixture: Uint8Array,
  pins: SpacetimeProgramPins,
  fetchImplementation: typeof fetch,
  overallTimeout: OwnedTimeout,
  deadline: number,
): Promise<Readonly<{ abiSha256: string; responseSha256: string }>> {
  const remaining = deadline - requireBeforeDeadline(deadline, [overallTimeout.signal])
  if (remaining <= 0) fail()
  const requestTimeout = createOwnedTimeout(
    Math.min(REQUEST_TIMEOUT_MILLISECONDS, remaining),
  )
  const signals = [overallTimeout.signal, requestTimeout.signal] as const
  const combined = combinedSignal(signals)
  const url = `${MAINCLOUD_ORIGIN}/v1/database/${database}/schema?version=10`
  let response: Response
  try {
    response = await raceSignals(Promise.resolve(fetchImplementation(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
      signal: combined.signal,
    })), signals)
    requireBeforeDeadline(deadline, signals)
    if (
      response.url !== url
      || response.status !== 200
      || !/^application\/json(?:; charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
    ) fail()
    const raw = await readBoundedBody(response, signals)
    requireBeforeDeadline(deadline, signals)
    const normalized = parseAndNormalizeRawModuleDefV10(raw)
    const canonical = normalized.canonicalBytes()
    if (!equalBytes(canonical, fixture)) fail()
    const abiSha256 = await raceSignals(sha256Hex(ABI_DOMAINS[realm], canonical), signals)
    const responseSha256 = await raceSignals(sha256Hex(RESPONSE_DOMAINS[realm], raw), signals)
    requireBeforeDeadline(deadline, signals)
    if (
      abiSha256 !== pins.realms[realm].deployedAbiV10Sha256
      || responseSha256 !== pins.realms[realm].rawModuleDefV10ResponseSha256
    ) fail()
    return Object.freeze({ abiSha256, responseSha256 })
  } finally {
    combined.cleanup()
    requestTimeout.cancel()
  }
}

function captureDigests(value: unknown): Readonly<Record<string, string>> {
  const source = exactRecord(value, UPSTREAM_DIGEST_KEYS)
  const result: Record<string, string> = Object.create(null)
  for (const key of UPSTREAM_DIGEST_KEYS) {
    const digest = source[key]
    if (!sha(digest)) fail()
    result[key] = digest
  }
  return Object.freeze(result)
}

function captureG001(
  value: unknown,
  binding: RecoveryRealmBindingProjection,
): Readonly<Record<string, JsonValue>> {
  const source = exactRecord(value, G001_KEYS)
  if (
    source.databaseIdentity !== binding.genesis001Database
    || source.programKeccak256 !== binding.g001ExpectedProgramKeccak256
    || source.realmId !== 'GENESIS_001'
    || source.releaseVersion !== '0.3.43'
    || source.playerAccessEnabled !== true
    || source.admissionStateMutationsEnabled !== false
    || source.accessRequestSubmissionsEnabled !== false
    || source.sourceBaselineCommit !== '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
    || source.freezeReleaseNonce !== '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
    || !positiveSafe(source.admittedPlayerCount)
    || source.admittedPlayerCount > 100
    || source.enabledPlayerCount !== source.admittedPlayerCount
    || source.censusStable !== true
    || !sha(source.admittedPlayerCensusHmacSha256)
    || !sha(source.alphaInvariantHmacSha256)
  ) fail()
  return Object.freeze({
    databaseIdentity: source.databaseIdentity,
    programKeccak256: source.programKeccak256,
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: source.sourceBaselineCommit,
    freezeReleaseNonce: source.freezeReleaseNonce,
    admittedPlayerCount: source.admittedPlayerCount,
    enabledPlayerCount: source.enabledPlayerCount,
    censusStable: true,
    admittedPlayerCensusHmacSha256: source.admittedPlayerCensusHmacSha256,
    alphaInvariantHmacSha256: source.alphaInvariantHmacSha256,
  }) as Readonly<Record<string, JsonValue>>
}

function captureG002(
  value: unknown,
  binding: RecoveryRealmBindingProjection,
): Readonly<Record<string, JsonValue>> {
  const source = exactRecord(value, G002_KEYS)
  if (
    source.databaseIdentity !== binding.genesis002Database
    || source.programKeccak256 !== binding.g002ExpectedProgramKeccak256
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
    || source.atlasId !== binding.g002AtlasId
    || source.publicReleaseId !== binding.g002PublicReleaseId
    || source.publicApprovalReceiptId !== binding.g002PublicApprovalReceiptId
    || source.atlasSourceCommit !== binding.g002AtlasSourceCommit
    || source.expectedReleaseSha256 !== binding.g002ReleaseSha256
    || source.releaseHeaderSha256 !== binding.g002ReleaseHeaderSha256
    || source.verificationDigest !== binding.g002VerificationDigest
    || typeof source.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID.test(source.publicReleaseId)
    || typeof source.publicApprovalReceiptId !== 'string'
    || !PUBLIC_APPROVAL_ID.test(source.publicApprovalReceiptId)
    || !sha(source.sealedStateHmacSha256)
  ) fail()
  return Object.freeze({ ...source }) as Readonly<Record<string, JsonValue>>
}

function capturePtr(
  value: unknown,
  binding: RecoveryRealmBindingProjection,
): Readonly<Record<string, JsonValue>> {
  const source = exactRecord(value, PTR_KEYS)
  if (
    source.databaseIdentity !== binding.ptrDatabase
    || source.programKeccak256 !== binding.ptrExpectedProgramKeccak256
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
    || source.atlasId !== binding.ptrAtlasId
    || source.publicReleaseId !== binding.ptrPublicReleaseId
    || source.publicApprovalReceiptId !== binding.ptrPublicApprovalReceiptId
    || source.atlasSourceCommit !== binding.ptrAtlasSourceCommit
    || source.expectedReleaseSha256 !== binding.ptrExpectedReleaseSha256
    || source.releaseHeaderSha256 !== binding.ptrReleaseHeaderSha256
    || source.verificationDigest !== binding.ptrVerificationDigest
    || typeof source.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID.test(source.publicReleaseId)
    || typeof source.publicApprovalReceiptId !== 'string'
    || !PUBLIC_APPROVAL_ID.test(source.publicApprovalReceiptId)
    || !sha(source.sealedStateHmacSha256)
    || !sha(source.ownerInvariantHmacSha256)
    || ('ptrStateEvidenceProfile' in binding && binding.ptrStateEvidenceProfile === 'warpkeep-ptr-existing-state-adoption-v1' && (
      source.sealedStateHmacSha256 !== binding.ptrExpectedSealedStateHmacSha256
      || source.ownerInvariantHmacSha256 !== binding.ptrExpectedOwnerInvariantHmacSha256
    ))
  ) fail()
  return Object.freeze({ ...source }) as Readonly<Record<string, JsonValue>>
}

function captureBridgeResponse(
  value: unknown,
  binding: RecoveryRealmBindingProjection,
  request: ReleaseRecoveryObservationRequest,
): CapturedBridgeObservation {
  const source = exactRecord(value, BRIDGE_RESPONSE_KEYS)
  if (
    source.schemaVersion !== 1
    || source.profile !== BRIDGE_RESPONSE_PROFILE
    || source.requestId !== request.requestId
    || source.candidateCommit !== request.candidateCommit
    || source.recoveryAuthorizationEpoch !== request.recoveryAuthorizationEpoch
    || !safeNonnegative(source.observedFrom)
    || !safeNonnegative(source.observedThrough)
    || source.observedThrough < source.observedFrom
    || source.observedThrough - source.observedFrom > 75
    || source.bridgeService !== binding.authWorker
    || source.bridgeWorkerVersion !== binding.bridgeWorkerVersion
    || source.bridgeWorkerVersionId !== binding.bridgeWorkerVersionId
    || source.bridgeSourceCommit !== binding.bridgeSourceCommit
    || source.bridgeConfigIdentity !== binding.bridgeConfigIdentity
    || source.bridgeConfigEpoch !== binding.bridgeConfigEpoch
    || source.publicAdmissionRequestsOpen !== false
  ) fail()
  const result = Object.freeze({
    observedFrom: source.observedFrom,
    observedThrough: source.observedThrough,
    bridgeService: 'warpkeep-auth-bridge' as const,
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1' as const,
    bridgeWorkerVersionId: binding.bridgeWorkerVersionId,
    bridgeSourceCommit: binding.bridgeSourceCommit,
    bridgeConfigIdentity: binding.bridgeConfigIdentity,
    bridgeConfigEpoch: binding.bridgeConfigEpoch,
    publicAdmissionRequestsOpen: false as const,
    g001: captureG001(source.g001, binding),
    g002: captureG002(source.g002, binding),
    ptr: capturePtr(source.ptr, binding),
    upstreamResponseDigests: captureDigests(source.upstreamResponseDigests),
  })
  if (encoder.encode(JSON.stringify(result)).byteLength > MAXIMUM_BRIDGE_RESPONSE_BYTES) fail()
  return result
}

function jsonProjection(
  keys: readonly string[],
  values: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const projection: Record<string, JsonValue> = Object.create(null)
  for (const key of keys) {
    const value = values[key]
    if (value === undefined || (typeof value === 'object' && value !== null)) fail()
    projection[key] = value
  }
  return Object.freeze(projection)
}

export async function observeRecoveryRealmEvidence(
  input: ObserveRecoveryRealmEvidenceInput,
): Promise<RecoveryRealmEvidence> {
  let overallTimeout: OwnedTimeout | undefined
  try {
    const captured = validateStaticInputs(input)
    const runtimeStart = requireRuntimeNow()
    if (runtimeStart > Number.MAX_SAFE_INTEGER - OVERALL_TIMEOUT_MILLISECONDS) fail()
    const deadline = runtimeStart + OVERALL_TIMEOUT_MILLISECONDS
    overallTimeout = createOwnedTimeout(OVERALL_TIMEOUT_MILLISECONDS)
    requireBeforeDeadline(deadline, [overallTimeout.signal])
    const observedFrom = requireUnixNow()

    const schemas: Partial<Record<RealmName, Readonly<{
      abiSha256: string
      responseSha256: string
    }>>> = {}
    for (const realm of ['g001', 'g002', 'ptr'] as const) {
      schemas[realm] = await fetchSchema(
        realm,
        captured.pins.realms[realm].databaseIdentity,
        captured.fixtures[realm],
        captured.pins,
        input.fetch,
        overallTimeout,
        deadline,
      )
    }

    requireBeforeDeadline(deadline, [overallTimeout.signal])
    let rawBridgeResponse: unknown
    try {
      rawBridgeResponse = await raceSignals(
        Promise.resolve(captured.request).then(request => (
          captured.observeReleaseRecoveryState(request)
        )),
        [overallTimeout.signal],
      )
    } catch {
      fail()
    }
    requireBeforeDeadline(deadline, [overallTimeout.signal])
    const bridge = captureBridgeResponse(rawBridgeResponse, captured.binding, captured.request)
    const observedThrough = requireUnixNow()
    if (
      observedThrough < observedFrom
      || observedThrough - observedFrom > 90
      || bridge.observedFrom < observedFrom
      || bridge.observedThrough > observedThrough
    ) fail()

    const protectedRealmBindingSha256 = await sha256Hex(
      'warpkeep.release-recovery.realm-binding-projection.v1\n',
      captured.protectedBindingBytes,
    )
    const armedRealmBindingSha256 = await sha256Hex(
      'warpkeep.release-recovery.realm-binding-projection.v1\n',
      captured.armedBindingBytes,
    )
    if (protectedRealmBindingSha256 !== armedRealmBindingSha256) fail()

    const g001 = bridge.g001
    const g002 = bridge.g002
    const ptr = bridge.ptr
    const upstream = bridge.upstreamResponseDigests
    const g001Schema = schemas.g001 ?? fail()
    const g002Schema = schemas.g002 ?? fail()
    const ptrSchema = schemas.ptr ?? fail()

    const liveValues: Readonly<Record<string, JsonValue>> = {
      schemaVersion: 1,
      profile: LIVE_INVARIANT_PROFILE,
      requestId: captured.binding.requestId,
      candidateCommit: captured.request.candidateCommit,
      recoveryAuthorizationEpoch: captured.binding.authorizationEpoch,
      recoveryAuthorizationCoreSha256: captured.binding.recoveryAuthorizationCoreSha256,
      protectedRealmBindingSha256,
      armedRealmBindingSha256,
      bindingPath: captured.armed.bindingPath,
      workflowPath: captured.armed.workflowPath,
      bridgeService: bridge.bridgeService,
      bridgeWorkerVersion: bridge.bridgeWorkerVersion,
      bridgeWorkerVersionId: bridge.bridgeWorkerVersionId,
      bridgeSourceCommit: bridge.bridgeSourceCommit,
      bridgeConfigIdentity: bridge.bridgeConfigIdentity,
      bridgeConfigEpoch: bridge.bridgeConfigEpoch,
      publicAdmissionRequestsOpen: bridge.publicAdmissionRequestsOpen,
      genesis001Database: captured.binding.genesis001Database,
      genesis002Database: captured.binding.genesis002Database,
      ptrDatabase: captured.binding.ptrDatabase,
      g001ExpectedProgramKeccak256: captured.binding.g001ExpectedProgramKeccak256,
      g002ExpectedProgramKeccak256: captured.binding.g002ExpectedProgramKeccak256,
      ptrExpectedProgramKeccak256: captured.binding.ptrExpectedProgramKeccak256,
      g001ProgramKeccak256: g001.programKeccak256!,
      g002ProgramKeccak256: g002.programKeccak256!,
      ptrProgramKeccak256: ptr.programKeccak256!,
      g001ProgramArtifactSha256: captured.pins.realms.g001.programArtifactSha256,
      g002ProgramArtifactSha256: captured.pins.realms.g002.programArtifactSha256,
      ptrProgramArtifactSha256: captured.pins.realms.ptr.programArtifactSha256,
      g001ReleaseVersion: g001.releaseVersion!,
      g001PlayerAccessEnabled: g001.playerAccessEnabled!,
      g001AdmissionStateMutationsEnabled: g001.admissionStateMutationsEnabled!,
      g001AccessRequestSubmissionsEnabled: g001.accessRequestSubmissionsEnabled!,
      g001AdmittedPlayerCount: g001.admittedPlayerCount!,
      g001EnabledPlayerCount: g001.enabledPlayerCount!,
      g001CensusStable: g001.censusStable!,
      g001AdmittedPlayerCensusHmacSha256: g001.admittedPlayerCensusHmacSha256!,
      g001AlphaInvariantHmacSha256: g001.alphaInvariantHmacSha256!,
      g001BaselineAbiSha256: captured.pins.realms.g001.g001BaselineAbiSha256,
      g001DeployedAbiV10Sha256: g001Schema.abiSha256,
      g002Sealed: g002.sealed!,
      g002AtlasReady: g002.atlasReady!,
      g002PlayerCount: g002.playerCount!,
      g002GeneralAdmissionCount: g002.generalAdmissionCount!,
      g002PopulationGuardPassed: g002.populationGuardPassed!,
      g002ExpectedAtlasId: captured.binding.g002AtlasId,
      g002AtlasId: g002.atlasId!,
      g002ExpectedPublicReleaseId: captured.binding.g002PublicReleaseId,
      g002PublicReleaseId: g002.publicReleaseId!,
      g002ExpectedPublicApprovalReceiptId: captured.binding.g002PublicApprovalReceiptId,
      g002PublicApprovalReceiptId: g002.publicApprovalReceiptId!,
      g002ExpectedAtlasSourceCommit: captured.binding.g002AtlasSourceCommit,
      g002AtlasSourceCommit: g002.atlasSourceCommit!,
      g002PinnedExpectedReleaseSha256: captured.binding.g002ReleaseSha256,
      g002ExpectedReleaseSha256: g002.expectedReleaseSha256!,
      g002ExpectedReleaseHeaderSha256: captured.binding.g002ReleaseHeaderSha256,
      g002ReleaseHeaderSha256: g002.releaseHeaderSha256!,
      g002ExpectedVerificationDigest: captured.binding.g002VerificationDigest,
      g002VerificationDigest: g002.verificationDigest!,
      g002SealedStateHmacSha256: g002.sealedStateHmacSha256!,
      g002DeployedAbiV10Sha256: g002Schema.abiSha256,
      ptrSealed: ptr.sealed!,
      ptrSingletonOwnerCount: ptr.singletonOwnerCount!,
      ptrOwnerEnabled: ptr.ownerEnabled!,
      ptrAtlasReady: ptr.atlasReady!,
      ptrGeneralAdmissionCount: ptr.generalAdmissionCount!,
      ptrPopulationGuardPassed: ptr.populationGuardPassed!,
      ptrExpectedAtlasId: captured.binding.ptrAtlasId,
      ptrAtlasId: ptr.atlasId!,
      ptrExpectedPublicReleaseId: captured.binding.ptrPublicReleaseId,
      ptrPublicReleaseId: ptr.publicReleaseId!,
      ptrExpectedPublicApprovalReceiptId: captured.binding.ptrPublicApprovalReceiptId,
      ptrPublicApprovalReceiptId: ptr.publicApprovalReceiptId!,
      ptrExpectedAtlasSourceCommit: captured.binding.ptrAtlasSourceCommit,
      ptrAtlasSourceCommit: ptr.atlasSourceCommit!,
      ptrPinnedExpectedReleaseSha256: captured.binding.ptrExpectedReleaseSha256,
      ptrExpectedReleaseSha256: ptr.expectedReleaseSha256!,
      ptrExpectedReleaseHeaderSha256: captured.binding.ptrReleaseHeaderSha256,
      ptrReleaseHeaderSha256: ptr.releaseHeaderSha256!,
      ptrExpectedVerificationDigest: captured.binding.ptrVerificationDigest,
      ptrVerificationDigest: ptr.verificationDigest!,
      ptrSealedStateHmacSha256: ptr.sealedStateHmacSha256!,
      ptrOwnerInvariantHmacSha256: ptr.ownerInvariantHmacSha256!,
      ptrDeployedAbiV10Sha256: ptrSchema.abiSha256,
    }
    const liveProjection = jsonProjection(LIVE_INVARIANT_KEYS, liveValues)
    const liveInvariantDigest = await sha256Hex(
      'warpkeep.release-recovery.realm-live-invariant.v1\n',
      serializeExactObject(LIVE_INVARIANT_KEYS, liveProjection as never),
    )

    const snapshotValues: Readonly<Record<string, JsonValue>> = {
      schemaVersion: 1,
      profile: EVIDENCE_SNAPSHOT_PROFILE,
      phase: input.phase,
      observationSequence: input.sequence,
      liveInvariantDigest,
      observedFrom,
      observedThrough,
      bridgeObservedFrom: bridge.observedFrom,
      bridgeObservedThrough: bridge.observedThrough,
      ...upstream,
      g001SchemaResponseSha256: g001Schema.responseSha256,
      g002SchemaResponseSha256: g002Schema.responseSha256,
      ptrSchemaResponseSha256: ptrSchema.responseSha256,
    }
    const snapshotProjection = jsonProjection(EVIDENCE_SNAPSHOT_KEYS, snapshotValues)
    const evidenceSnapshotDigest = await sha256Hex(
      'warpkeep.release-recovery.realm-evidence-snapshot.v1\n',
      serializeExactObject(EVIDENCE_SNAPSHOT_KEYS, snapshotProjection as never),
    )

    return Object.freeze({
      ...liveProjection,
      ...snapshotProjection,
      schemaVersion: 1,
      profile: RECOVERY_REALM_EVIDENCE_PROFILE,
      phase: input.phase,
      observationSequence: input.sequence,
      liveInvariantDigest,
      evidenceSnapshotDigest,
    }) as RecoveryRealmEvidence
  } catch {
    throw new RecoveryRealmEvidenceError()
  } finally {
    try {
      overallTimeout?.cancel()
    } catch {
      // Cleanup cannot replace the selected result or fixed failure.
    }
  }
}
