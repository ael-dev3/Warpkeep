import { describe, expect, it } from 'vitest'

import {
  EVIDENCE_SNAPSHOT_KEYS,
  LIVE_INVARIANT_KEYS,
  observeRecoveryRealmEvidence,
  type ObserveRecoveryRealmEvidenceInput,
} from '../src/realmEvidence.js'
import {
  RECOVERY_BINDING_PATH,
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  RECOVERY_WORKFLOW_PATH,
  type RecoveryArmingTuple,
  type RecoveryRealmBindingProjection,
} from '../src/config.js'
import { sha256Hex } from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'
import {
  validateSpacetimeProgramPins,
  type SpacetimeProgramPins,
} from '../src/spacetimeProgramPins.js'

const encoder = new TextEncoder()
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const CANDIDATE_COMMIT = 'f'.repeat(40)
const G001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002_DATABASE = 'd'.repeat(64)
const PTR_DATABASE = 'e'.repeat(64)
const G001_PROGRAM = '4'.repeat(64)
const G002_PROGRAM = 'c'.repeat(64)
const PTR_PROGRAM = 'a'.repeat(64)
const RPC_CREDENTIAL = 'A'.repeat(43)

type MutableRecord = Record<string, any>

function binding(): RecoveryRealmBindingProjection {
  return {
    requestId: REQUEST_ID,
    authorizationMode: 'recovery-authorization-v1',
    recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
    recoveryKeyId: RECOVERY_KEY_ID,
    recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
    authorizationEpoch: 7,
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages',
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    issuer: 'https://release-auth.warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '123e4567-e89b-42d3-a456-426614174001',
    bridgeSourceCommit: '1'.repeat(40),
    bridgeConfigIdentity: '2'.repeat(64),
    bridgeConfigEpoch: 9,
    preparationCommit: '2'.repeat(40),
    preparationTree: '3'.repeat(40),
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: '3'.repeat(64),
    recoveryAuthorizationCoreSha256: '4'.repeat(64),
    pagesDeploymentApproved: true,
    genesis001Database: G001_DATABASE,
    genesis002Database: G002_DATABASE,
    ptrDatabase: PTR_DATABASE,
    g001ExpectedProgramKeccak256: G001_PROGRAM,
    g002ExpectedProgramKeccak256: G002_PROGRAM,
    ptrExpectedProgramKeccak256: PTR_PROGRAM,
    g002AtlasId: 'GENESIS_002_GREATER_REALM',
    g002PublicReleaseId: `GRR-${'A'.repeat(26)}`,
    g002PublicApprovalReceiptId: `GRA-${'B'.repeat(26)}`,
    g002AtlasSourceCommit: '4'.repeat(40),
    g002ReleaseSha256: '5'.repeat(64),
    g002ReleaseHeaderSha256: '6'.repeat(64),
    g002VerificationDigest: '7'.repeat(64),
    ptrAtlasId: 'PTR_GREATER_REALM',
    ptrPublicReleaseId: `GRR-${'C'.repeat(26)}`,
    ptrPublicApprovalReceiptId: `GRA-${'D'.repeat(26)}`,
    ptrAtlasSourceCommit: '5'.repeat(40),
    ptrExpectedReleaseSha256: '8'.repeat(64),
    ptrReleaseHeaderSha256: '9'.repeat(64),
    ptrVerificationDigest: 'a'.repeat(64),
  }
}

function armed(protectedBinding: RecoveryRealmBindingProjection): RecoveryArmingTuple {
  return {
    ...protectedBinding,
    bindingPath: RECOVERY_BINDING_PATH,
    workflowPath: RECOVERY_WORKFLOW_PATH,
  }
}

function fixtureBytes(tag: 'Types' | 'Tables' | 'Reducers'): Uint8Array {
  return encoder.encode(JSON.stringify({ sections: [{ [tag]: [] }] }))
}

const commonPin = (
  realm: 'g001' | 'g002' | 'ptr',
  databaseIdentity: string,
  modulePath: string,
  nodeVersion: '24.19.0' | '22.22.3',
  fixturePath: string,
  dependency: string,
  artifact: string,
  program: string,
  abi: string,
  response: string,
) => ({
  realm,
  databaseIdentity,
  recoveryBuildProfile: 'warpkeep-release-recovery-cross-platform-program-build-v1',
  modulePath,
  dependencyLockClosureSha256: dependency,
  toolchainManifestPath: 'services/release-recovery/fixtures/toolchains/linux-x64.json',
  toolchainManifestSha256: '2'.repeat(64),
  nodeVersion,
  spacetimeVersion: '2.6.1',
  gitPackageVersion: '1:2.43.0-1ubuntu7.3',
  wslVersion: '2.7.11.0',
  firstBuildArtifactSha256: artifact,
  secondBuildArtifactSha256: artifact,
  programArtifactSha256: artifact,
  programHashAlgorithm: 'keccak-256',
  programKeccak256: program,
  deployedAbiV10Sha256: abi,
  rawModuleDefV10ResponseSha256: response,
  rawModuleDefV10FixturePath: fixturePath,
})

async function pins(fixtures: Readonly<Record<'g001' | 'g002' | 'ptr', Uint8Array>>): Promise<SpacetimeProgramPins> {
  const abi = {
    g001: await sha256Hex('warpkeep.release-recovery.spacetimedb-abi.g001.raw-module-def-v10.v1\n', fixtures.g001),
    g002: await sha256Hex('warpkeep.release-recovery.spacetimedb-abi.g002.raw-module-def-v10.v1\n', fixtures.g002),
    ptr: await sha256Hex('warpkeep.release-recovery.spacetimedb-abi.ptr.raw-module-def-v10.v1\n', fixtures.ptr),
  }
  const response = {
    g001: await sha256Hex('warpkeep.release-recovery.spacetimedb-schema-response.g001.raw-module-def-v10.v1\n', fixtures.g001),
    g002: await sha256Hex('warpkeep.release-recovery.spacetimedb-schema-response.g002.raw-module-def-v10.v1\n', fixtures.g002),
    ptr: await sha256Hex('warpkeep.release-recovery.spacetimedb-schema-response.ptr.raw-module-def-v10.v1\n', fixtures.ptr),
  }
  const g001 = commonPin(
    'g001', G001_DATABASE, 'spacetimedb', '24.19.0',
    'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json',
    '1'.repeat(64), '3'.repeat(64), G001_PROGRAM, abi.g001, response.g001,
  )
  const g002 = commonPin(
    'g002', G002_DATABASE, 'spacetimedb/genesis002', '22.22.3',
    'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json',
    'a'.repeat(64), 'b'.repeat(64), G002_PROGRAM, abi.g002, response.g002,
  )
  const ptr = commonPin(
    'ptr', PTR_DATABASE, 'spacetimedb/ptr', '22.22.3',
    'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json',
    '8'.repeat(64), '9'.repeat(64), PTR_PROGRAM, abi.ptr, response.ptr,
  )
  return validateSpacetimeProgramPins({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-spacetime-program-pins-v1',
    realms: {
      g001: {
        realm: g001.realm,
        databaseIdentity: g001.databaseIdentity,
        recoveryBuildProfile: g001.recoveryBuildProfile,
        g001BaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
        g001BaselineTree: '90deebb5faf4129282f5c35999244f540001b27d',
        g001BaselineSpacetimeTree: 'ab450fd2b3dcdd3ed67ef1f0431e18ae507382ac',
        g001BaselineAbiSha256: 'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03',
        g001FreezePreparationCommit: 'd945256b217fa13ade944b9ed9880e8463b46123',
        g001FreezePreparationTree: '8c2b0b0eda17cefc212f08716a287c44b0e84d48',
        g001FreezePreparationSourceSha256: '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251',
        g001MaterializerSha256: 'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93',
        g001FreezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
        g001TransformedFrozenSourceClosureSha256: '7'.repeat(64),
        modulePath: g001.modulePath,
        dependencyLockClosureSha256: g001.dependencyLockClosureSha256,
        toolchainManifestPath: g001.toolchainManifestPath,
        toolchainManifestSha256: g001.toolchainManifestSha256,
        nodeVersion: g001.nodeVersion,
        spacetimeVersion: g001.spacetimeVersion,
        gitPackageVersion: g001.gitPackageVersion,
        wslVersion: g001.wslVersion,
        firstBuildArtifactSha256: g001.firstBuildArtifactSha256,
        secondBuildArtifactSha256: g001.secondBuildArtifactSha256,
        programArtifactSha256: g001.programArtifactSha256,
        programHashAlgorithm: g001.programHashAlgorithm,
        programKeccak256: g001.programKeccak256,
        deployedAbiV10Sha256: g001.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: g001.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: g001.rawModuleDefV10FixturePath,
      },
      g002: {
        realm: g002.realm,
        databaseIdentity: g002.databaseIdentity,
        recoveryBuildProfile: g002.recoveryBuildProfile,
        g002SourceCommit: '8'.repeat(40),
        g002SourceTree: '9'.repeat(40),
        modulePath: g002.modulePath,
        dependencyLockClosureSha256: g002.dependencyLockClosureSha256,
        toolchainManifestPath: g002.toolchainManifestPath,
        toolchainManifestSha256: g002.toolchainManifestSha256,
        nodeVersion: g002.nodeVersion,
        spacetimeVersion: g002.spacetimeVersion,
        gitPackageVersion: g002.gitPackageVersion,
        wslVersion: g002.wslVersion,
        firstBuildArtifactSha256: g002.firstBuildArtifactSha256,
        secondBuildArtifactSha256: g002.secondBuildArtifactSha256,
        programArtifactSha256: g002.programArtifactSha256,
        programHashAlgorithm: g002.programHashAlgorithm,
        programKeccak256: g002.programKeccak256,
        deployedAbiV10Sha256: g002.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: g002.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: g002.rawModuleDefV10FixturePath,
      },
      ptr: {
        realm: ptr.realm,
        databaseIdentity: ptr.databaseIdentity,
        recoveryBuildProfile: ptr.recoveryBuildProfile,
        ptrSourceCommit: 'f'.repeat(40),
        ptrSourceTree: '1'.repeat(40),
        modulePath: ptr.modulePath,
        dependencyLockClosureSha256: ptr.dependencyLockClosureSha256,
        toolchainManifestPath: ptr.toolchainManifestPath,
        toolchainManifestSha256: ptr.toolchainManifestSha256,
        nodeVersion: ptr.nodeVersion,
        spacetimeVersion: ptr.spacetimeVersion,
        gitPackageVersion: ptr.gitPackageVersion,
        wslVersion: ptr.wslVersion,
        firstBuildArtifactSha256: ptr.firstBuildArtifactSha256,
        secondBuildArtifactSha256: ptr.secondBuildArtifactSha256,
        programArtifactSha256: ptr.programArtifactSha256,
        programHashAlgorithm: ptr.programHashAlgorithm,
        programKeccak256: ptr.programKeccak256,
        deployedAbiV10Sha256: ptr.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: ptr.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: ptr.rawModuleDefV10FixturePath,
      },
    },
  })
}

function bridgeResponse(protectedBinding: RecoveryRealmBindingProjection): MutableRecord {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-realm-observation-v1',
    requestId: REQUEST_ID,
    candidateCommit: CANDIDATE_COMMIT,
    recoveryAuthorizationEpoch: 7,
    observedFrom: 101,
    observedThrough: 102,
    bridgeService: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: protectedBinding.bridgeWorkerVersion,
    bridgeWorkerVersionId: protectedBinding.bridgeWorkerVersionId,
    bridgeSourceCommit: protectedBinding.bridgeSourceCommit,
    bridgeConfigIdentity: protectedBinding.bridgeConfigIdentity,
    bridgeConfigEpoch: protectedBinding.bridgeConfigEpoch,
    publicAdmissionRequestsOpen: false,
    g001: {
      databaseIdentity: G001_DATABASE,
      programKeccak256: G001_PROGRAM,
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      playerAccessEnabled: true,
      admissionStateMutationsEnabled: false,
      accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
      admittedPlayerCount: 1,
      enabledPlayerCount: 1,
      censusStable: true,
      admittedPlayerCensusHmacSha256: 'b'.repeat(64),
      alphaInvariantHmacSha256: 'c'.repeat(64),
    },
    g002: {
      databaseIdentity: G002_DATABASE,
      programKeccak256: G002_PROGRAM,
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
      atlasId: protectedBinding.g002AtlasId,
      publicReleaseId: protectedBinding.g002PublicReleaseId,
      publicApprovalReceiptId: protectedBinding.g002PublicApprovalReceiptId,
      atlasSourceCommit: protectedBinding.g002AtlasSourceCommit,
      expectedReleaseSha256: protectedBinding.g002ReleaseSha256,
      releaseHeaderSha256: protectedBinding.g002ReleaseHeaderSha256,
      verificationDigest: protectedBinding.g002VerificationDigest,
      sealedStateHmacSha256: 'd'.repeat(64),
    },
    ptr: {
      databaseIdentity: PTR_DATABASE,
      programKeccak256: PTR_PROGRAM,
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
      atlasId: protectedBinding.ptrAtlasId,
      publicReleaseId: protectedBinding.ptrPublicReleaseId,
      publicApprovalReceiptId: protectedBinding.ptrPublicApprovalReceiptId,
      atlasSourceCommit: protectedBinding.ptrAtlasSourceCommit,
      expectedReleaseSha256: protectedBinding.ptrExpectedReleaseSha256,
      releaseHeaderSha256: protectedBinding.ptrReleaseHeaderSha256,
      verificationDigest: protectedBinding.ptrVerificationDigest,
      sealedStateHmacSha256: 'e'.repeat(64),
      ownerInvariantHmacSha256: 'f'.repeat(64),
    },
    upstreamResponseDigests: {
      programIdentityBeforeTranscriptHmacSha256: '1'.repeat(64),
      g001PolicyResponseHmacSha256: '2'.repeat(64),
      g001AlphaBeforeResponseHmacSha256: '3'.repeat(64),
      g001PlayerEnumerationBeforeResponseHmacSha256: '4'.repeat(64),
      g001AdmissionStatusesResponseHmacSha256: '5'.repeat(64),
      g001PlayerEnumerationAfterResponseHmacSha256: '6'.repeat(64),
      g001AlphaAfterResponseHmacSha256: '7'.repeat(64),
      g002StatusResponseHmacSha256: '8'.repeat(64),
      ptrAdminStatusResponseHmacSha256: '9'.repeat(64),
      ptrOwnerStatusResponseHmacSha256: 'a'.repeat(64),
      programIdentityAfterTranscriptHmacSha256: 'b'.repeat(64),
    },
  }
}

function response(url: string, bytes: Uint8Array): Response {
  const value = new Response(Uint8Array.from(bytes).buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(bytes.byteLength),
    },
  })
  Object.defineProperty(value, 'url', { value: url })
  return value
}

async function testInputs(
  mutateBridge?: (value: MutableRecord) => void,
): Promise<Omit<ObserveRecoveryRealmEvidenceInput, 'phase' | 'sequence'>> {
  const protectedBinding = binding()
  const fixtures = {
    g001: fixtureBytes('Types'),
    g002: fixtureBytes('Tables'),
    ptr: fixtureBytes('Reducers'),
  } as const
  const parsedPins = await pins(fixtures)
  const observed = bridgeResponse(protectedBinding)
  mutateBridge?.(observed)
  const byDatabase: Readonly<Record<string, Uint8Array>> = {
    [G001_DATABASE]: fixtures.g001,
    [G002_DATABASE]: fixtures.g002,
    [PTR_DATABASE]: fixtures.ptr,
  }
  let unixIndex = 0
  return {
    bridge: {
      async observeReleaseRecoveryState(request) {
        if (
          Object.keys(request).join(',') !== 'schemaVersion,profile,rpcCredential,requestId,candidateCommit,recoveryAuthorizationEpoch'
          || request.rpcCredential !== RPC_CREDENTIAL
        ) throw new Error('bad-request')
        return observed
      },
    },
    rpcCredential: RPC_CREDENTIAL,
    binding: protectedBinding,
    armed: armed(protectedBinding),
    candidateCommit: CANDIDATE_COMMIT,
    pins: parsedPins,
    expectedRawModuleDefV10Fixtures: fixtures,
    fetch: (async (input, init) => {
      const url = String(input)
      const match = /^https:\/\/maincloud\.spacetimedb\.com\/v1\/database\/([0-9a-f]{64})\/schema\?version=10$/u.exec(url)
      if (
        match === null
        || init?.method !== 'GET'
        || init.credentials !== 'omit'
        || init.redirect !== 'manual'
        || init.cache !== 'no-store'
        || !(init.signal instanceof AbortSignal)
        || JSON.stringify(init.headers) !== JSON.stringify({ Accept: 'application/json' })
      ) throw new Error('unsafe-fetch')
      const bytes = byDatabase[match[1]!]
      if (bytes === undefined) throw new Error('wrong-database')
      return response(url, bytes)
    }) as typeof fetch,
    nowUnixSeconds: () => [100, 103][unixIndex++]!,
    deadlineRuntime: {
      nowAfterIoMilliseconds: () => 1_000,
      timeoutSignal: () => new AbortController().signal,
    },
  }
}

async function expectFailure(
  input: ObserveRecoveryRealmEvidenceInput,
  secret = '',
): Promise<void> {
  try {
    await observeRecoveryRealmEvidence(input)
    throw new Error('expected failure')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('RecoveryRealmEvidenceError')
    expect((error as Error).message).toBe('RECOVERY_REALM_EVIDENCE_FAILED')
    expect(Object.hasOwn(error as object, 'stack')).toBe(false)
    expect(Object.hasOwn(error as object, 'cause')).toBe(false)
    expect(Reflect.ownKeys(error as object).sort()).toEqual(['code', 'message', 'name'])
    if (secret.length > 0) expect(String(error)).not.toContain(secret)
  }
}

describe('observeRecoveryRealmEvidence', () => {
  it('keeps the live invariant stable while phase and monotonic sequence separate snapshots', async () => {
    const issue = await observeRecoveryRealmEvidence({ ...await testInputs(), phase: 'issue', sequence: 1 })
    const claim = await observeRecoveryRealmEvidence({ ...await testInputs(), phase: 'claim', sequence: 2 })
    const typedRealmEvidence: Readonly<{
      g001ProgramKeccak256: string
      g002AtlasId: string
      ptrSingletonOwnerCount: 1
      g001SchemaResponseSha256: string
    }> = issue

    expect(issue.liveInvariantDigest).toBe(claim.liveInvariantDigest)
    expect(issue.evidenceSnapshotDigest).not.toBe(claim.evidenceSnapshotDigest)
    expect(issue.profile).toBe('warpkeep-release-recovery-realm-evidence-v1')
    expect(issue.phase).toBe('issue')
    expect(issue.observationSequence).toBe(1)
    expect(claim.phase).toBe('claim')
    expect(claim.observationSequence).toBe(2)
    expect(Object.isFrozen(issue)).toBe(true)
    expect(typedRealmEvidence.g001ProgramKeccak256).toBe(G001_PROGRAM)
    expect(JSON.stringify(issue)).not.toContain(RPC_CREDENTIAL)
    expect(Object.keys(issue)).not.toContain('rawBody')
  })

  it('exports the exact flat digest projection key orders', () => {
    expect(LIVE_INVARIANT_KEYS).toHaveLength(84)
    expect(LIVE_INVARIANT_KEYS.slice(0, 8)).toEqual([
      'schemaVersion', 'profile', 'requestId', 'candidateCommit',
      'recoveryAuthorizationEpoch', 'recoveryAuthorizationCoreSha256',
      'protectedRealmBindingSha256', 'armedRealmBindingSha256',
    ])
    expect(LIVE_INVARIANT_KEYS.at(-1)).toBe('ptrDeployedAbiV10Sha256')
    expect(EVIDENCE_SNAPSHOT_KEYS).toEqual([
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
    ])
  })

  it('rejects invalid phase/sequence and protected-versus-armed drift before I/O', async () => {
    let fetchCalls = 0
    const invalidPhase = await testInputs()
    const invalidPhaseWithFetch = {
      ...invalidPhase,
      fetch: (async () => {
        fetchCalls += 1
        throw new Error('network-reached')
      }) as typeof fetch,
    }
    await expectFailure({
      ...invalidPhaseWithFetch,
      phase: 'claim',
      sequence: 1,
    } as unknown as ObserveRecoveryRealmEvidenceInput)

    const mismatch = await testInputs()
    const mutableArmed = { ...mismatch.armed, bridgeConfigEpoch: 10 }
    await expectFailure({ ...mismatch, armed: mutableArmed as RecoveryArmingTuple, phase: 'issue', sequence: 1 })
    expect(fetchCalls).toBe(0)
  })

  it('rejects bridge echo, deployment, and admission-state substitutions', async () => {
    const mutations: readonly ((value: MutableRecord) => void)[] = [
      value => { value.recoveryAuthorizationEpoch = 8 },
      value => { value.candidateCommit = '0'.repeat(40) },
      value => { value.bridgeWorkerVersionId = '123e4567-e89b-42d3-a456-426614174099' },
      value => { value.bridgeSourceCommit = '6'.repeat(40) },
      value => { value.bridgeConfigIdentity = '6'.repeat(64) },
      value => { value.bridgeConfigEpoch = 10 },
      value => { value.publicAdmissionRequestsOpen = true },
      value => { value.g001.admissionStateMutationsEnabled = true },
      value => { value.g002.admissionsOpen = true },
      value => { value.ptr.accessRequestsOpen = true },
    ]
    for (const mutate of mutations) {
      await expectFailure({ ...await testInputs(mutate), phase: 'issue', sequence: 1 })
    }
  })

  it('rejects program and database substitutions in each of the three realms', async () => {
    const mutations: readonly ((value: MutableRecord) => void)[] = [
      value => { value.g001.databaseIdentity = G002_DATABASE },
      value => { value.g001.programKeccak256 = G002_PROGRAM },
      value => { value.g002.databaseIdentity = PTR_DATABASE },
      value => { value.g002.programKeccak256 = PTR_PROGRAM },
      value => { value.ptr.databaseIdentity = G002_DATABASE },
      value => { value.ptr.programKeccak256 = G002_PROGRAM },
    ]
    for (const mutate of mutations) {
      await expectFailure({ ...await testInputs(mutate), phase: 'claim', sequence: 2 })
    }
  })

  it('rejects every protected G002 and PTR atlas coordinate substitution', async () => {
    const mutations: readonly ((value: MutableRecord) => void)[] = [
      value => { value.g002.atlasId = 'PTR_GREATER_REALM' },
      value => { value.g002.publicReleaseId = `GRR-${'E'.repeat(26)}` },
      value => { value.g002.publicApprovalReceiptId = `GRA-${'E'.repeat(26)}` },
      value => { value.g002.atlasSourceCommit = '6'.repeat(40) },
      value => { value.g002.expectedReleaseSha256 = 'b'.repeat(64) },
      value => { value.g002.releaseHeaderSha256 = 'b'.repeat(64) },
      value => { value.g002.verificationDigest = 'b'.repeat(64) },
      value => { value.ptr.atlasId = 'GENESIS_002_GREATER_REALM' },
      value => { value.ptr.publicReleaseId = `GRR-${'F'.repeat(26)}` },
      value => { value.ptr.publicApprovalReceiptId = `GRA-${'F'.repeat(26)}` },
      value => { value.ptr.atlasSourceCommit = '6'.repeat(40) },
      value => { value.ptr.expectedReleaseSha256 = 'b'.repeat(64) },
      value => { value.ptr.releaseHeaderSha256 = 'b'.repeat(64) },
      value => { value.ptr.verificationDigest = 'b'.repeat(64) },
    ]
    for (const mutate of mutations) {
      await expectFailure({ ...await testInputs(mutate), phase: 'issue', sequence: 1 })
    }
  })

  it('rejects schema substitution, noncanonical fixtures, and missing fixture material', async () => {
    const substituted = await testInputs()
    await expectFailure({
      ...substituted,
      expectedRawModuleDefV10Fixtures: {
        ...substituted.expectedRawModuleDefV10Fixtures,
        ptr: substituted.expectedRawModuleDefV10Fixtures.g002,
      },
      phase: 'issue',
      sequence: 1,
    })

    const noncanonical = await testInputs()
    await expectFailure({
      ...noncanonical,
      expectedRawModuleDefV10Fixtures: {
        ...noncanonical.expectedRawModuleDefV10Fixtures,
        g001: encoder.encode('{ "sections": [{"Types":[]}]}'),
      },
      phase: 'issue',
      sequence: 1,
    })

    const missing = await testInputs()
    delete (missing.expectedRawModuleDefV10Fixtures as MutableRecord).g001
    await expectFailure({ ...missing, phase: 'issue', sequence: 1 })

    const missingPins = await testInputs()
    await expectFailure({
      ...missingPins,
      pins: undefined,
      phase: 'issue',
      sequence: 1,
    } as unknown as ObserveRecoveryRealmEvidenceInput)
  })

  it('rejects extra bridge fields, exotic nested records, and an aborted overall deadline', async () => {
    await expectFailure({ ...await testInputs(value => { value.extra = true }), phase: 'issue', sequence: 1 })
    await expectFailure({
      ...await testInputs(value => { value.g001 = Object.create(value.g001) }),
      phase: 'issue',
      sequence: 1,
    })

    const timedOut = await testInputs()
    await expectFailure({
      ...timedOut,
      deadlineRuntime: {
        nowAfterIoMilliseconds: () => 1_000,
        timeoutSignal: () => AbortSignal.abort(),
      },
      phase: 'issue',
      sequence: 1,
    })
  })

  it('maps bridge, schema, and hostile accessor failures to one redacted error', async () => {
    const bridgeSecret = 'private-fid-123456'
    const bridgeFailure = await testInputs()
    await expectFailure({
      ...bridgeFailure,
      bridge: {
        observeReleaseRecoveryState: async () => { throw new Error(bridgeSecret) },
      },
      phase: 'issue',
      sequence: 1,
    }, bridgeSecret)

    const fetchSecret = 'spacetimedb-upstream-body-secret'
    const schemaFailure = await testInputs()
    await expectFailure({
      ...schemaFailure,
      fetch: (async () => { throw new Error(fetchSecret) }) as typeof fetch,
      phase: 'issue',
      sequence: 1,
    }, fetchSecret)

    const accessorSecret = 'credential-value-in-getter'
    const hostile = await testInputs()
    Object.defineProperty(hostile.binding, RECOVERY_REALM_BINDING_PROJECTION_KEYS[0], {
      enumerable: true,
      get: () => { throw new Error(accessorSecret) },
    })
    await expectFailure({ ...hostile, phase: 'issue', sequence: 1 }, accessorSecret)
  })
})
