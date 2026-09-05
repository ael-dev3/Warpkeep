import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { win32 } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const childProcessBoundary = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}))

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: childProcessBoundary.spawnSync,
}))

const fixedHost = vi.hoisted(() => ({
  openFixedPrivateRoot: vi.fn(),
  readFixedPrivateRecord: vi.fn(),
  closeFixedPrivateRoot: vi.fn(),
  verifyFixedPublishReceipt: vi.fn(),
  verifyFixedToolchainAttestation: vi.fn(),
  readFixedFixtureOutput: vi.fn(),
  recoverFixedFixtureOutputs: vi.fn(),
  beginFixedFixtureOutputTransaction: vi.fn(),
  preflightFixedPublicSourceObjectDatabase: vi.fn(),
  preflightFixedToolchainSourcePolicy: vi.fn(),
  preflightFixedWslHostAndGuest: vi.fn(),
  bootstrapFixedWslToolchain: vi.fn(),
  publishFixedToolchainAttestation: vi.fn(),
  executeFixedWslFixturePlan: vi.fn(),
}))

vi.mock('../scripts/release-recovery-fixture-host.mjs', () => fixedHost)

import {
  FIXED_PRIVATE_RECORD_PATHS,
  FIXTURE_OUTPUT_PATHS,
  parseGeneratorArguments,
  runGenerator,
} from '../scripts/generate-release-recovery-spacetime-fixtures.mjs'
import {
  TOOLCHAIN_SOURCE_POLICY_PATH,
  parseToolchainArguments,
  prepareReleaseRecoveryWslToolchain,
} from '../scripts/prepare-release-recovery-wsl-toolchain.mjs'
import {
  WSL_EXECUTION_POLICY,
  runReleaseRecoverySpacetimeFixturesWsl,
} from '../scripts/run-release-recovery-spacetime-fixtures-wsl.mjs'
import { parseSpacetimeProgramPins } from '../src/spacetimeProgramPins.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const FIXED_OPERATOR_ROOT = String.raw`C:\Users\heyas\.warpkeep\private\release-recovery-v1`
const PRIVATE_ROOT = FIXED_OPERATOR_ROOT
const SYNTHETIC_PRIVATE_ROOT = String.raw`C:\synthetic\owner-private\release-recovery-v1`
const FIXED_BOOTSTRAP_PROGRAM = '/opt/warpkeep/release-recovery-v1/bin/bootstrap-toolchain-v1'
const FIXED_MATERIALIZER_PROGRAM = '/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1'

const encode = (value: string): Uint8Array => encoder.encode(value)
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function toolchainDependencyFiles(realm: 'g001' | 'g002' | 'ptr') {
  const paths = realm === 'g001'
    ? ['spacetimedb/package.json', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/pnpm-workspace.yaml']
    : realm === 'g002'
      ? ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'spacetimedb/genesis002/package.json']
      : ['spacetimedb/ptr/package.json', 'spacetimedb/ptr/pnpm-lock.yaml']
  const g001Blobs = [
    'faf7214653f1248a3f9231fd6a13dda130821014',
    '649efdebd25528f593aff612ca8aef6f761d1e94',
    'a640febaa07fad295f2de4b4416b7a22910eb2e6',
  ]
  return paths.map((path, index) => ({
    path,
    blob: realm === 'g001' ? g001Blobs[index]! : `${realm === 'g002' ? 'c' : 'd'}`.repeat(40),
    bytes: 100 + index,
    sha256: sha256(encode(`${realm}:${path}`)),
  }))
}

function toolchainDependencyClosure(realm: 'g001' | 'g002' | 'ptr'): string {
  const hash = createHash('sha256')
  hash.update(`warpkeep.release-recovery.source-dependencies.${realm}.v1\n`)
  for (const file of toolchainDependencyFiles(realm)) {
    hash.update(`${file.path}\0${file.blob}\0${file.bytes}\0${file.sha256}\n`)
  }
  return hash.digest('hex')
}

function installedProgramEvidence() {
  const bootstrap = Uint8Array.from(readFileSync(new URL(
    '../scripts/release-recovery-wsl-bootstrap.py',
    import.meta.url,
  )))
  const materializer = Uint8Array.from(readFileSync(new URL(
    '../scripts/release-recovery-wsl-materialize.mjs',
    import.meta.url,
  )))
  return {
    bootstrapProgramBytes: bootstrap.byteLength,
    bootstrapProgramSha256: sha256(bootstrap),
    materializerProgramBytes: materializer.byteLength,
    materializerProgramSha256: sha256(materializer),
    installedMode: '500',
    installedVerified: true,
  }
}

const SOURCE = Object.freeze({
  g002: Object.freeze({
    receiptSha256: '4'.repeat(64),
    databaseIdentity: 'd'.repeat(64),
    sourceCommit: '8'.repeat(40),
    sourceTree: '9'.repeat(40),
    publishedModuleSha256: 'b'.repeat(64),
    dependencyLockClosureSha256: toolchainDependencyClosure('g002'),
  }),
  ptr: Object.freeze({
    receiptSha256: '5'.repeat(64),
    databaseIdentity: 'e'.repeat(64),
    sourceCommit: 'f'.repeat(40),
    sourceTree: '1'.repeat(40),
    publishedModuleSha256: '9'.repeat(64),
    dependencyLockClosureSha256: toolchainDependencyClosure('ptr'),
  }),
})

function privateBytes(): Map<string, Uint8Array> {
  const bridgeJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  }
  return new Map([
    [FIXED_PRIVATE_RECORD_PATHS.marker, encode(`${JSON.stringify({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-recovery-bootstrap-v1',
      keyId: 'warpkeep-0.4.0-recovery-2026-09-03-1',
      enabled: false,
    })}\n`)],
    [FIXED_PRIVATE_RECORD_PATHS.rpcSecret,
      encode('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8\n')],
    [FIXED_PRIVATE_RECORD_PATHS.censusPepper,
      encode('ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8\n')],
    [FIXED_PRIVATE_RECORD_PATHS.canaryFid, encode('539854\n')],
    [FIXED_PRIVATE_RECORD_PATHS.authBridgePublicJwk,
      encode(`${JSON.stringify(bridgeJwk)}\n`)],
    [FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation, encode('synthetic-toolchain-attestation\n')],
    [FIXED_PRIVATE_RECORD_PATHS.g002Receipt, encode('synthetic-g002-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.g002ImportReceipt, encode('synthetic-g002-import-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.g002LiveReceipt, encode('synthetic-g002-live-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.ptrReceipt, encode('synthetic-ptr-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.ptrImportReceipt, encode('synthetic-ptr-import-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.ptrOwnerReceipt, encode('synthetic-ptr-owner-receipt\n')],
    [FIXED_PRIVATE_RECORD_PATHS.ptrLiveReceipt, encode('synthetic-ptr-live-receipt\n')],
  ])
}

function runnerResult(): any {
  const policyBytes = Uint8Array.from(readFileSync(new URL(
    '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
    import.meta.url,
  )))
  const policy = JSON.parse(decoder.decode(policyBytes))
  const sourceCoordinates = {
    g001: {
      sourceCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      sourceTree: '90deebb5faf4129282f5c35999244f540001b27d',
      dependencyLockClosureSha256: toolchainDependencyClosure('g001'),
    },
    g002: {
      sourceCommit: SOURCE.g002.sourceCommit,
      sourceTree: SOURCE.g002.sourceTree,
      dependencyLockClosureSha256: SOURCE.g002.dependencyLockClosureSha256,
    },
    ptr: {
      sourceCommit: SOURCE.ptr.sourceCommit,
      sourceTree: SOURCE.ptr.sourceTree,
      dependencyLockClosureSha256: SOURCE.ptr.dependencyLockClosureSha256,
    },
  }
  const sources = Object.fromEntries(
    Object.entries(sourceCoordinates).map(([realm, source]) => [realm, {
      realm,
      ...source,
      dependencyInventoryDomain: `warpkeep.release-recovery.source-dependencies.${realm}.v1`,
      dependencyClosureRecordPath: `source-caches/${realm}-dependency-closure-sha256.txt`,
      dependencyFiles: toolchainDependencyFiles(realm as 'g001' | 'g002' | 'ptr'),
    }]),
  )
  const dependencyCaches = Object.fromEntries(
    Object.entries(sourceCoordinates).map(([realm, source]) => [realm, {
      realm,
      sourceCommit: source.sourceCommit,
      sourceTree: source.sourceTree,
      storePath: `pnpm-store/${realm}`,
      closureRecordPath: `source-caches/${realm}-dependency-closure-sha256.txt`,
      closureSha256: source.dependencyLockClosureSha256,
      containsLinuxX64Esbuild: true,
      packages: [{
        name: '@esbuild/linux-x64',
        version: '0.25.0',
        url: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.0.tgz',
        sri: `sha512-${Buffer.alloc(64, realm.charCodeAt(0)).toString('base64')}`,
        bytes: 1_000,
        sha256: sha256(encode(`archive:${realm}`)),
        os: ['linux'],
        cpu: ['x64'],
      }],
    }]),
  )
  const toolchainManifestBytes = encode(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1',
    platform: 'linux',
    architecture: 'x64',
    distribution: 'Ubuntu-24.04',
    recoveryBuildProfile: policy.recoveryBuildProfile,
    sourcePolicySha256: sha256(policyBytes),
    hostGuest: { ...policy.hostGuest, platformVerified: true },
    programs: installedProgramEvidence(),
    nodeReleases: Object.fromEntries(Object.entries(policy.nodeReleases).map(([version, value]: any) => [version, {
      ...value,
      signatureVerified: true,
      extractedMemberVerified: true,
    }])),
    pnpm: { ...policy.pnpm, archiveVerified: true, membersVerified: true },
    spacetime: { ...policy.spacetime, archiveVerified: true, membersVerified: true },
    systemTools: Object.fromEntries(Object.entries(policy.systemTools).map(([name, value]: any) => [name, {
      ...value,
      installedBytes: 1_000 + name.length,
      installedMode: '755',
      installedVerified: true,
    }])),
    sourceObjectExport: {
      profile: 'warpkeep-release-recovery-source-object-export-v1',
      repositoryPath: 'source-caches/repository.git',
      objectFormat: 'sha1',
      objectInventoryDomain: 'warpkeep.release-recovery.source-object-export.v1',
      objectInventoryRecordPath: 'source-caches/repository-object-inventory-v1.json',
      objectCount: 42,
      objectBytes: 12_345,
      objectClosureSha256: 'e'.repeat(64),
      exactObjectsVerified: true,
      sources: {
        g001: {
          sourceCommit: sourceCoordinates.g001.sourceCommit,
          sourceTree: sourceCoordinates.g001.sourceTree,
          preparationCommit: policy.sourceRules.g001.preparationCommit,
          preparationTree: policy.sourceRules.g001.preparationTree,
        },
        g002: {
          sourceCommit: sourceCoordinates.g002.sourceCommit,
          sourceTree: sourceCoordinates.g002.sourceTree,
        },
        ptr: {
          sourceCommit: sourceCoordinates.ptr.sourceCommit,
          sourceTree: sourceCoordinates.ptr.sourceTree,
        },
      },
    },
    sources,
    dependencyCaches,
    signaturesVerified: true,
    offlineReady: true,
  })}\n`)
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-result-v1',
    toolchainManifestBytes,
    toolchainManifestSha256: sha256(toolchainManifestBytes),
    realms: {
      g001: {
        realm: 'g001',
        dependencyLockClosureSha256: toolchainDependencyClosure('g001'),
        transformedSourceClosureSha256: '7'.repeat(64),
        firstBuildArtifactSha256: '3'.repeat(64),
        secondBuildArtifactSha256: '3'.repeat(64),
        programArtifactSha256: '3'.repeat(64),
        programHashAlgorithm: 'keccak-256',
        programKeccak256: '4'.repeat(64),
        rawModuleDefV10ResponseBytes: encode('{"sections":[{"Types":[]}]}'),
      },
      g002: {
        realm: 'g002',
        dependencyLockClosureSha256: SOURCE.g002.dependencyLockClosureSha256,
        transformedSourceClosureSha256: null,
        firstBuildArtifactSha256: SOURCE.g002.publishedModuleSha256,
        secondBuildArtifactSha256: SOURCE.g002.publishedModuleSha256,
        programArtifactSha256: SOURCE.g002.publishedModuleSha256,
        programHashAlgorithm: 'keccak-256',
        programKeccak256: 'c'.repeat(64),
        rawModuleDefV10ResponseBytes: encode('{"sections":[{"Tables":[]}]}'),
      },
      ptr: {
        realm: 'ptr',
        dependencyLockClosureSha256: SOURCE.ptr.dependencyLockClosureSha256,
        transformedSourceClosureSha256: null,
        firstBuildArtifactSha256: SOURCE.ptr.publishedModuleSha256,
        secondBuildArtifactSha256: SOURCE.ptr.publishedModuleSha256,
        programArtifactSha256: SOURCE.ptr.publishedModuleSha256,
        programHashAlgorithm: 'keccak-256',
        programKeccak256: 'a'.repeat(64),
        rawModuleDefV10ResponseBytes: encode('{"sections":[{"Reducers":[]}]}'),
      },
    },
  }
}

function platformAttestation(): any {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-host-guest-preflight-v1',
    executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
    wslVersion: '2.7.11.0',
    distribution: 'Ubuntu-24.04',
    osReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
    kernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
    gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
    unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
    loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0',
  }
}

function fixedProgramCoordinates(): any {
  const bootstrap = Uint8Array.from(readFileSync(new URL(
    '../scripts/release-recovery-wsl-bootstrap.py',
    import.meta.url,
  )))
  const materializer = Uint8Array.from(readFileSync(new URL(
    '../scripts/release-recovery-wsl-materialize.mjs',
    import.meta.url,
  )))
  return {
    bootstrap,
    materializer,
    toolchain: {
      manifestSha256: runnerResult().toolchainManifestSha256,
      cacheCatalogSha256: '7'.repeat(64),
      bootstrapProgramBytes: bootstrap.byteLength,
      bootstrapProgramSha256: sha256(bootstrap),
      materializerProgramBytes: materializer.byteLength,
      materializerProgramSha256: sha256(materializer),
    },
  }
}

function bootstrapResult(): any {
  const programs = fixedProgramCoordinates().toolchain
  return {
    prepared: true,
    sourcePolicySha256: '6'.repeat(64),
    manifestSha256: runnerResult().toolchainManifestSha256,
    cacheSha256: programs.cacheCatalogSha256,
    cacheClosureSha256: '8'.repeat(64),
    signaturesVerified: true,
    offlineReady: true,
    bootstrapProgramBytes: programs.bootstrapProgramBytes,
    bootstrapProgramSha256: programs.bootstrapProgramSha256,
    materializerProgramBytes: programs.materializerProgramBytes,
    materializerProgramSha256: programs.materializerProgramSha256,
  }
}

function fixtureWireResult(result = runnerResult()): any {
  const realm = (value: any) => ({
    ...value,
    rawModuleDefV10ResponseBase64url:
      Buffer.from(value.rawModuleDefV10ResponseBytes).toString('base64url'),
    rawModuleDefV10ResponseBytes: undefined,
  })
  const wireRealms = Object.fromEntries(
    Object.entries(result.realms).map(([name, value]) => [name, realm(value)]),
  )
  for (const value of Object.values(wireRealms) as any[]) {
    delete value.rawModuleDefV10ResponseBytes
  }
  return {
    schemaVersion: result.schemaVersion,
    profile: result.profile,
    toolchainManifestBase64url: Buffer.from(result.toolchainManifestBytes).toString('base64url'),
    toolchainManifestSha256: result.toolchainManifestSha256,
    realms: wireRealms,
  }
}

function authenticatedReceipt(realm: 'g002' | 'ptr', receiptBytes: Uint8Array): any {
  const source = SOURCE[realm]
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-authenticated-publish-source-v1',
    realm,
    authenticationProfile: 'producer-local-receipt-authentication-v1',
    receiptSha256: sha256(receiptBytes),
    databaseIdentity: source.databaseIdentity,
    sourceCommit: source.sourceCommit,
    sourceTree: source.sourceTree,
    publishedModuleSha256: source.publishedModuleSha256,
    dependencyLockClosureSha256: source.dependencyLockClosureSha256,
    signatureVerified: true,
    matchingImportReceiptVerified: true,
    matchingLiveReceiptVerified: true,
  }
}

type MemoryOutputs = ReturnType<typeof memoryOutputs>

function memoryOutputs(initial: ReadonlyMap<string, Uint8Array> = new Map(), failStage = -1) {
  const committed = new Map<string, Uint8Array>(
    [...initial].map(([path, bytes]) => [path, bytes.slice()]),
  )
  let staleStage = false
  let lastTransaction: any
  const outputs = {
    read: vi.fn(async (path: string) => committed.get(path)?.slice()),
    recover: vi.fn(async () => { staleStage = false }),
    begin: vi.fn(async (paths: readonly string[]) => {
      const staged = new Map<string, Uint8Array>()
      let stageCount = 0
      const transaction = {
        stage: vi.fn(async (path: string, bytes: Uint8Array) => {
          if (stageCount++ === failStage) throw new Error('synthetic-stage-failure-with-private-detail')
          if (!paths.includes(path) || staged.has(path)) throw new Error('bad-stage')
          staged.set(path, bytes.slice())
          staleStage = true
        }),
        commit: vi.fn(async () => {
          if (staged.size !== paths.length) throw new Error('partial-stage')
          committed.clear()
          for (const [path, bytes] of staged) committed.set(path, bytes.slice())
          staleStage = false
        }),
        rollback: vi.fn(async () => {
          staged.clear()
          staleStage = false
        }),
      }
      lastTransaction = transaction
      return transaction
    }),
  }
  return {
    outputs,
    committed,
    setStaleStage: () => { staleStage = true },
    hasStaleStage: () => staleStage,
    transaction: () => lastTransaction,
  }
}

function dependencies(options: Readonly<{
  files?: Map<string, Uint8Array>
  rootMutation?: Readonly<Record<string, unknown>>
  fileMutation?: Readonly<Record<string, unknown>>
  result?: any
  output?: MemoryOutputs
}> = {}) {
  for (const boundary of Object.values(fixedHost)) boundary.mockReset()
  const files = options.files ?? privateBytes()
  const output = options.output ?? memoryOutputs()
  const rootHandle = {
    canonicalPath: PRIVATE_ROOT,
    directory: true,
    reparsePoint: false,
    ownerOnly: true,
    mode: 0o700,
    descriptorVerified: true,
    ...options.rootMutation,
  }
  const privateRoot = {
    open: vi.fn(async (_requestedPath: string) => rootHandle),
    read: vi.fn(async (_root: unknown, relativePath: string, maximumBytes: number) => {
      const bytes = files.get(relativePath)
      if (bytes === undefined) throw new Error('missing-private-input-with-detail')
      if (bytes.byteLength > maximumBytes) throw new Error('oversize-private-input-with-detail')
      return {
        canonicalPath: win32.join(PRIVATE_ROOT, ...relativePath.split('/')),
        regularFile: true,
        reparsePoint: false,
        ownerOnly: true,
        mode: 0o600,
        descriptorVerified: true,
        bytes: bytes.slice(),
        ...options.fileMutation,
      }
    }),
    close: vi.fn(async (_root: unknown) => undefined),
  }
  const verifyReceipt = vi.fn(async ({ realm, bytes }: any) => authenticatedReceipt(realm, bytes))
  const result = options.result ?? runnerResult()
  const verifyToolchain = vi.fn(async ({ bytes }: any) => {
    const programs = fixedProgramCoordinates().toolchain
    return {
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
      platform: 'linux',
      architecture: 'x64',
      sourcePolicySha256: sha256(readFileSync(new URL(
        '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
        import.meta.url,
      ))),
      offlineReady: true,
      signaturesVerified: true,
      attestationSha256: sha256(bytes),
      toolchainManifestSha256: result.toolchainManifestSha256,
      cacheCatalogSha256: programs.cacheCatalogSha256,
      cacheClosureSha256: '8'.repeat(64),
      bootstrapProgramBytes: programs.bootstrapProgramBytes,
      bootstrapProgramSha256: programs.bootstrapProgramSha256,
      materializerProgramBytes: programs.materializerProgramBytes,
      materializerProgramSha256: programs.materializerProgramSha256,
    }
  })
  const runner = vi.fn(async (_request: any) => result)
  fixedHost.openFixedPrivateRoot.mockImplementation((requestedPath: any) => privateRoot.open(requestedPath))
  fixedHost.readFixedPrivateRecord.mockImplementation(
    (root: any, relativePath: any, maximumBytes: any) => privateRoot.read(root, relativePath, maximumBytes),
  )
  fixedHost.closeFixedPrivateRoot.mockImplementation((root: any) => privateRoot.close(root))
  fixedHost.verifyFixedPublishReceipt.mockImplementation((request: any) => verifyReceipt(request))
  fixedHost.verifyFixedToolchainAttestation.mockImplementation((request: any) => verifyToolchain(request))
  fixedHost.readFixedFixtureOutput.mockImplementation((path: any) => output.outputs.read(path))
  fixedHost.recoverFixedFixtureOutputs.mockImplementation(() => output.outputs.recover())
  fixedHost.beginFixedFixtureOutputTransaction.mockImplementation(
    (paths: any) => output.outputs.begin(paths),
  )
  fixedHost.preflightFixedWslHostAndGuest.mockResolvedValue(platformAttestation())
  fixedHost.preflightFixedPublicSourceObjectDatabase.mockResolvedValue(Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-fixed-public-source-capability-v1',
  }))
  fixedHost.preflightFixedToolchainSourcePolicy.mockResolvedValue(Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-toolchain-source-policy-capability-v1',
    sourcePolicySha256: '6'.repeat(64),
  }))
  fixedHost.executeFixedWslFixturePlan.mockImplementation((request: any) => runner(request))
  return {
    adapters: {
      privateRoot,
      verifyReceipt,
      verifyToolchain,
      runner,
      outputs: output.outputs,
    },
    privateRoot,
    verifyReceipt,
    verifyToolchain,
    runner,
    output,
    rootHandle,
  }
}

async function rejected(operation: Promise<unknown>): Promise<void> {
  try {
    await operation
    throw new Error('expected rejection')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('RecoveryFixtureInputError')
    expect((error as Error).message).toBe('RECOVERY_FIXTURE_INPUT_INVALID')
    expect(Reflect.ownKeys(error as object).sort()).toEqual(['code', 'message', 'name'])
    expect(String(error)).not.toContain('private-detail')
  }
}

function allObjectKeys(value: unknown, keys = new Set<string>()): ReadonlySet<string> {
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array) return keys
  for (const key of Object.keys(value)) {
    keys.add(key)
    allObjectKeys((value as Record<string, unknown>)[key], keys)
  }
  return keys
}

describe('guarded recovery fixture generator', () => {
  it('review boundary: fixed publish authority includes its matching producer records', () => {
    expect(Object.values(FIXED_PRIVATE_RECORD_PATHS)).toEqual([
      'recovery-bootstrap-marker.json',
      'recovery-rpc-secret.txt',
      'recovery-census-pepper.txt',
      'player-canary-owner-fid.txt',
      'auth-bridge-signing-public.jwk.json',
      'fixture-materialization/wsl-toolchain-attestation-v1.json',
      'activation-evidence/records/g002-publish-receipt.json',
      'activation-evidence/records/g002-atlas-import-receipt.json',
      'activation-evidence/records/g002-sealed-live-receipt.json',
      'activation-evidence/records/ptr-publish-receipt.json',
      'activation-evidence/records/ptr-atlas-import-receipt.json',
      'activation-evidence/records/ptr-owner-provision-receipt.json',
      'activation-evidence/records/ptr-sealed-live-receipt.json',
    ])
  })

  it('review boundary: production CLI accepts only the fixed operator root', () => {
    expect(parseGeneratorArguments(['--check', '--private-root', FIXED_OPERATOR_ROOT])).toEqual({
      privateRoot: FIXED_OPERATOR_ROOT,
      mode: 'check',
    })
    expect(parseToolchainArguments(['--private-root', FIXED_OPERATOR_ROOT])).toEqual({
      privateRoot: FIXED_OPERATOR_ROOT,
    })

    for (const root of [
      SYNTHETIC_PRIVATE_ROOT,
      `${FIXED_OPERATOR_ROOT}\\`,
      'C:/Users/heyas/.warpkeep/private/release-recovery-v1',
      String.raw`c:\Users\heyas\.warpkeep\private\release-recovery-v1`,
    ]) {
      expect(() => parseGeneratorArguments(['--check', '--private-root', root]))
        .toThrowError('RECOVERY_FIXTURE_INPUT_INVALID')
      expect(() => parseToolchainArguments(['--private-root', root]))
        .toThrowError('RECOVERY_FIXTURE_INPUT_INVALID')
    }
  })

  it('review boundary: production APIs reject injected implementations before observing them', async () => {
    const fixture = dependencies()
    await rejected(runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
      adapters: fixture.adapters,
    }))
    expect(fixture.privateRoot.open).not.toHaveBeenCalled()
    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()

    const bootstrap = vi.fn(async (_request: any) => bootstrapResult())
    await rejected(prepareReleaseRecoveryWslToolchain({
      privateRoot: PRIVATE_ROOT,
      adapters: { privateRoot: fixture.privateRoot, bootstrap },
    }))
    expect(bootstrap).not.toHaveBeenCalled()

    for (const [field, value] of [
      ['root', { canonicalPath: PRIVATE_ROOT }],
      ['url', 'https://example.test'],
      ['command', 'chosen-command'],
      ['credential', 'chosen-credential'],
      ['output', 'chosen-output'],
    ] as const) {
      const guarded = dependencies()
      await rejected(runGenerator({
        privateRoot: PRIVATE_ROOT,
        mode: 'write',
        [field]: value,
      } as any))
      expect(guarded.privateRoot.open).not.toHaveBeenCalled()
      expect(guarded.runner).not.toHaveBeenCalled()
      expect(guarded.output.outputs.begin).not.toHaveBeenCalled()

      const guardedBootstrap = vi.fn()
      fixedHost.bootstrapFixedWslToolchain.mockImplementation(guardedBootstrap)
      await rejected(prepareReleaseRecoveryWslToolchain({
        privateRoot: PRIVATE_ROOT,
        [field]: value,
      } as any))
      expect(guardedBootstrap).not.toHaveBeenCalled()
    }
  })

  it('review boundary: neither WSL nor bootstrap receives a private-root coordinate', async () => {
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })
    expect(JSON.stringify(fixture.runner.mock.calls[0]![0])).not.toContain(PRIVATE_ROOT)
    expect(allObjectKeys(fixture.runner.mock.calls[0]![0])).not.toContain('privateRoot')
    expect(allObjectKeys(fixture.runner.mock.calls[0]![0])).not.toContain('root')
    expect(allObjectKeys(fixture.runner.mock.calls[0]![0])).not.toContain('canonicalPath')

    const bootstrap = vi.fn(async (_request: any) => bootstrapResult())
    fixedHost.bootstrapFixedWslToolchain.mockImplementation(bootstrap)
    await prepareReleaseRecoveryWslToolchain({
      privateRoot: PRIVATE_ROOT,
    })
    expect(JSON.stringify(bootstrap.mock.calls[0]![0])).not.toContain(PRIVATE_ROOT)
    expect(allObjectKeys(bootstrap.mock.calls[0]![0])).not.toContain('privateRoot')
    expect(allObjectKeys(bootstrap.mock.calls[0]![0])).not.toContain('root')
    expect(allObjectKeys(bootstrap.mock.calls[0]![0])).not.toContain('canonicalPath')
  })

  it('review boundary: every fixed host prerequisite is validated before bootstrap', async () => {
    const files = privateBytes()
    files.delete(FIXED_PRIVATE_RECORD_PATHS.ptrLiveReceipt)
    const fixture = dependencies({ files })
    const bootstrap = vi.fn(async () => bootstrapResult())
    fixedHost.bootstrapFixedWslToolchain.mockImplementation(bootstrap)

    await rejected(prepareReleaseRecoveryWslToolchain({
      privateRoot: PRIVATE_ROOT,
    }))
    expect(fixture.privateRoot.read.mock.calls.map((call: any[]) => call[1]))
      .toEqual(Object.values(FIXED_PRIVATE_RECORD_PATHS).filter(
        path => path !== FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation,
      ))
    expect(fixedHost.preflightFixedWslHostAndGuest).not.toHaveBeenCalled()
    expect(bootstrap).not.toHaveBeenCalled()
  })

  it('bootstrap preserves every Task-0 prerequisite except its not-yet-produced attestation', async () => {
    const files = privateBytes()
    files.delete(FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation)
    const fixture = dependencies({ files })
    const resultCapability = Object.freeze(bootstrapResult())
    const bootstrap = vi.fn(async () => resultCapability)
    fixedHost.bootstrapFixedWslToolchain.mockImplementation(bootstrap)

    await expect(prepareReleaseRecoveryWslToolchain({ privateRoot: PRIVATE_ROOT }))
      .resolves.toEqual({ prepared: true })
    expect(fixture.privateRoot.read.mock.calls.map((call: any[]) => call[1]))
      .toEqual(Object.values(FIXED_PRIVATE_RECORD_PATHS).filter(
        path => path !== FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation,
      ))
    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(fixedHost.publishFixedToolchainAttestation.mock.calls[0]![0])
      .toBe(resultCapability)
  })

  it('review boundary: fixed WSL preflight failure precedes bootstrap, runner, and writes', async () => {
    const generatorFixture = dependencies()
    fixedHost.preflightFixedWslHostAndGuest.mockRejectedValueOnce(
      new Error('synthetic-fixed-wsl-preflight-detail'),
    )
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
    expect(generatorFixture.runner).not.toHaveBeenCalled()
    expect(generatorFixture.output.outputs.recover).not.toHaveBeenCalled()
    expect(generatorFixture.output.outputs.begin).not.toHaveBeenCalled()

    const bootstrapFixture = dependencies()
    const bootstrap = vi.fn()
    fixedHost.bootstrapFixedWslToolchain.mockImplementation(bootstrap)
    fixedHost.preflightFixedWslHostAndGuest.mockRejectedValueOnce(
      new Error('synthetic-fixed-wsl-preflight-detail'),
    )
    await rejected(prepareReleaseRecoveryWslToolchain({ privateRoot: PRIVATE_ROOT }))
    expect(bootstrapFixture.privateRoot.read).toHaveBeenCalledTimes(
      Object.values(FIXED_PRIVATE_RECORD_PATHS).length - 1,
    )
    expect(bootstrap).not.toHaveBeenCalled()
  })

  it('accepts only one exact mode and the fixed private root', () => {
    expect(parseGeneratorArguments(['--check', '--private-root', PRIVATE_ROOT])).toEqual({
      privateRoot: PRIVATE_ROOT,
      mode: 'check',
    })
    expect(parseGeneratorArguments(['--private-root', PRIVATE_ROOT, '--write'])).toEqual({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
    })

    for (const argv of [
      [],
      ['--check'],
      ['--check', '--write', '--private-root', PRIVATE_ROOT],
      ['--check', '--private-root', 'relative-root'],
      ['--check', '--private-root', PRIVATE_ROOT, '--source-commit', 'f'.repeat(40)],
      ['--check', '--private-root', PRIVATE_ROOT, '--receipt-path', 'chosen.json'],
      ['--check', '--private-root', PRIVATE_ROOT, '--url', 'https://example.test'],
      ['--check', '--private-root', PRIVATE_ROOT, '--private-root', PRIVATE_ROOT],
    ]) {
      expect(() => parseGeneratorArguments(argv)).toThrowError('RECOVERY_FIXTURE_INPUT_INVALID')
    }
  })

  it('rejects proxied CLI arrays without observing their elements', () => {
    let generatorRead = false
    const generatorArguments = new Proxy(['--check', '--private-root', PRIVATE_ROOT], {
      get(target, property, receiver) {
        generatorRead = true
        return Reflect.get(target, property, receiver)
      },
    })
    expect(() => parseGeneratorArguments(generatorArguments)).toThrowError(
      'RECOVERY_FIXTURE_INPUT_INVALID',
    )
    expect(generatorRead).toBe(false)

    let toolchainRead = false
    const toolchainArguments = new Proxy(['--private-root', PRIVATE_ROOT], {
      get(target, property, receiver) {
        toolchainRead = true
        return Reflect.get(target, property, receiver)
      },
    })
    expect(() => parseToolchainArguments(toolchainArguments)).toThrowError(
      'RECOVERY_FIXTURE_INPUT_INVALID',
    )
    expect(toolchainRead).toBe(false)
  })

  it('rejects caller coordinates and hostile option descriptors before root, WSL, or output work', async () => {
    const fixture = dependencies()
    await rejected(runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
      adapters: fixture.adapters,
      sourceCommit: 'f'.repeat(40),
    } as any))
    expect(fixture.privateRoot.open).not.toHaveBeenCalled()
    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()

    let accessed = false
    const hostile = Object.create(null)
    Object.defineProperties(hostile, {
      privateRoot: { enumerable: true, get: () => { accessed = true; return PRIVATE_ROOT } },
      mode: { enumerable: true, value: 'write' },
      adapters: { enumerable: true, value: fixture.adapters },
    })
    await rejected(runGenerator(hostile))
    expect(accessed).toBe(false)
  })

  it('fails a missing root detail-free with no WSL or output mutation', async () => {
    const fixture = dependencies()
    fixture.privateRoot.open.mockRejectedValueOnce(new Error('missing-private-detail'))

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check' }))

    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it.each(Object.values(FIXED_PRIVATE_RECORD_PATHS))(
    'requires fixed private input %s before WSL or output mutation',
    async missingPath => {
      const files = privateBytes()
      files.delete(missingPath)
      const fixture = dependencies({ files })

      await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))

      expect(fixture.runner).not.toHaveBeenCalled()
      expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
      expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['noncanonical root', { canonicalPath: String.raw`C:\outside\release-recovery-v1` }],
    ['non-directory root', { directory: false }],
    ['reparse root', { reparsePoint: true }],
    ['non-owner-only root', { ownerOnly: false }],
    ['wrong root mode', { mode: 0o755 }],
    ['unverified root descriptor', { descriptorVerified: false }],
  ])('rejects a %s before reading records', async (_label, rootMutation) => {
    const fixture = dependencies({ rootMutation })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
    expect(fixture.privateRoot.read).not.toHaveBeenCalled()
    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it.each([
    ['escaped canonical file', { canonicalPath: String.raw`C:\outside\receipt.json` }],
    ['non-regular file', { regularFile: false }],
    ['reparse file', { reparsePoint: true }],
    ['non-owner-only file', { ownerOnly: false }],
    ['wrong file mode', { mode: 0o644 }],
    ['unverified file descriptor', { descriptorVerified: false }],
  ])('rejects a %s before WSL or output mutation', async (_label, fileMutation) => {
    const fixture = dependencies({ fileMutation })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it('derives only fixed receipt paths and passes only sanitized coordinates to WSL', async () => {
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })

    expect(fixture.privateRoot.read.mock.calls.map((call: any[]) => call[1])).toEqual(
      Object.values(FIXED_PRIVATE_RECORD_PATHS),
    )
    expect(FIXED_PRIVATE_RECORD_PATHS.g002Receipt)
      .toBe('activation-evidence/records/g002-publish-receipt.json')
    expect(FIXED_PRIVATE_RECORD_PATHS.ptrReceipt)
      .toBe('activation-evidence/records/ptr-publish-receipt.json')
    expect(fixture.runner).toHaveBeenCalledTimes(1)
    const request = fixture.runner.mock.calls[0]![0]
    expect(request.plan.realms.g002.sourceCommit).toBe(SOURCE.g002.sourceCommit)
    expect(request.plan.realms.ptr.sourceTree).toBe(SOURCE.ptr.sourceTree)
    expect(request.plan.realms.g001.sourceAuthority)
      .toBe('fixed-g001-frozen-materializer-v1')
    const keys = [...allObjectKeys(request)].join(',')
    expect(keys).not.toMatch(/head|live|url|command|credential|secret|programBytes|receiptBytes/u)
    const serialized = JSON.stringify(request)
    for (const privateValue of [...privateBytes().values()].map(bytes => decoder.decode(bytes).trim())) {
      expect(serialized).not.toContain(privateValue)
    }
  })

  it('retains the opened descriptor capability through every fixed read and close', async () => {
    const fixture = dependencies()

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })

    expect(fixture.privateRoot.read.mock.calls.every((call: any[]) => call[0] === fixture.rootHandle))
      .toBe(true)
    expect(fixture.privateRoot.close).toHaveBeenCalledWith(fixture.rootHandle)
  })

  it('zeroizes verifier copies of private receipt and toolchain records', async () => {
    const fixture = dependencies()

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })

    for (const call of fixture.verifyReceipt.mock.calls) {
      expect((call[0] as any).bytes.every((byte: number) => byte === 0)).toBe(true)
      for (const bytes of Object.values((call[0] as any).corroboratingReceipts) as Uint8Array[]) {
        expect(bytes.every(byte => byte === 0)).toBe(true)
      }
    }
    for (const call of fixture.verifyToolchain.mock.calls) {
      expect((call[0] as any).bytes.every((byte: number) => byte === 0)).toBe(true)
    }
  })

  it('zeroizes every acquired private record when a later fixed read fails', async () => {
    const fixture = dependencies()
    const originalRead = fixture.privateRoot.read.getMockImplementation()!
    const acquired: Uint8Array[] = []
    let reads = 0
    fixture.privateRoot.read.mockImplementation(async (...args: any[]) => {
      if (reads++ === 3) throw new Error('later-private-read-detail')
      const file = await originalRead(args[0], args[1], args[2])
      acquired.push(file.bytes)
      return file
    })

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))

    expect(acquired).toHaveLength(3)
    expect(acquired.every(bytes => bytes.every(byte => byte === 0))).toBe(true)
  })

  it('zeroizes a newly acquired record when its descriptor evidence is invalid', async () => {
    const fixture = dependencies({ fileMutation: { mode: 0o644 } })
    const originalRead = fixture.privateRoot.read.getMockImplementation()!
    let acquired: Uint8Array | undefined
    fixture.privateRoot.read.mockImplementationOnce(async (...args: any[]) => {
      const file = await originalRead(args[0], args[1], args[2])
      acquired = file.bytes
      return file
    })

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))

    expect(acquired).toBeInstanceOf(Uint8Array)
    expect(acquired!.every(byte => byte === 0)).toBe(true)
  })

  it('zeroizes a decoded RPC secret when census decoding fails', async () => {
    const files = privateBytes()
    files.set(FIXED_PRIVATE_RECORD_PATHS.censusPepper, encode('invalid-census\n'))
    dependencies({ files })
    const fill = vi.spyOn(Buffer.prototype, 'fill')
    let secretBuffers: Buffer[]
    try {
      await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
      secretBuffers = fill.mock.instances.filter(
        (bytes): bytes is Buffer => Buffer.isBuffer(bytes) && bytes.byteLength === 32,
      )
    } finally {
      fill.mockRestore()
    }

    expect(secretBuffers!).toHaveLength(2)
    expect(secretBuffers!.every(bytes => bytes.every(byte => byte === 0))).toBe(true)
  })

  it('requires authenticated receipts and signed offline toolchain attestation before WSL', async () => {
    const receiptFixture = dependencies()
    receiptFixture.verifyReceipt.mockImplementationOnce(async ({ realm, bytes }: any) => ({
      ...authenticatedReceipt(realm, bytes),
      signatureVerified: false,
    }))
    await rejected(runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
    }))
    expect(receiptFixture.runner).not.toHaveBeenCalled()

    const toolchainFixture = dependencies()
    toolchainFixture.verifyToolchain.mockImplementationOnce(async ({ bytes }: any) => {
      const programs = fixedProgramCoordinates().toolchain
      return {
        schemaVersion: 1,
        profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
        platform: 'linux',
        architecture: 'x64',
        sourcePolicySha256: sha256(readFileSync(new URL(
          '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
          import.meta.url,
        ))),
        offlineReady: true,
        signaturesVerified: false,
        attestationSha256: sha256(bytes),
        toolchainManifestSha256: runnerResult().toolchainManifestSha256,
        cacheCatalogSha256: programs.cacheCatalogSha256,
        cacheClosureSha256: '8'.repeat(64),
        bootstrapProgramBytes: programs.bootstrapProgramBytes,
        bootstrapProgramSha256: programs.bootstrapProgramSha256,
        materializerProgramBytes: programs.materializerProgramBytes,
        materializerProgramSha256: programs.materializerProgramSha256,
      }
    })
    await rejected(runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
    }))
    expect(toolchainFixture.runner).not.toHaveBeenCalled()
  })

  it('rejects nondeterministic builds and published-module drift without staging', async () => {
    for (const mutate of [
      (result: any) => { result.realms.g001.secondBuildArtifactSha256 = '6'.repeat(64) },
      (result: any) => { result.realms.g002.programArtifactSha256 = '6'.repeat(64) },
      (result: any) => { result.realms.ptr.firstBuildArtifactSha256 = '6'.repeat(64) },
    ]) {
      const result = runnerResult()
      mutate(result)
      const fixture = dependencies({ result })
      await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
      expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
      expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
    }
  })

  it('accepts only a digest-and-schema result and strictly parses every RawModuleDef v10 response', async () => {
    const extra = runnerResult()
    extra.realms.g001.programBytes = encode('private-program-bytes')
    const extraFixture = dependencies({ result: extra })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
    expect(extraFixture.output.outputs.begin).not.toHaveBeenCalled()

    const malformed = runnerResult()
    malformed.realms.g001.rawModuleDefV10ResponseBytes =
      encode('{"sections":[],"sections":[]}')
    const malformedFixture = dependencies({ result: malformed })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))
    expect(malformedFixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it('stages one exact manifest/toolchain/fixture set only after all validation succeeds', async () => {
    const fixture = dependencies()
    const result = await runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
    })

    expect(result).toEqual({ written: true })
    expect(fixture.output.outputs.recover).toHaveBeenCalledTimes(1)
    expect(fixture.output.outputs.begin).toHaveBeenCalledWith(Object.values(FIXTURE_OUTPUT_PATHS))
    const transaction = fixture.output.transaction()
    expect(transaction.stage.mock.calls.map((call: any[]) => call[0]))
      .toEqual(Object.values(FIXTURE_OUTPUT_PATHS))
    expect(transaction.commit).toHaveBeenCalledTimes(1)
    expect(transaction.rollback).not.toHaveBeenCalled()
    expect([...fixture.output.committed.keys()]).toEqual(Object.values(FIXTURE_OUTPUT_PATHS))

    const manifestBytes = fixture.output.committed.get(FIXTURE_OUTPUT_PATHS.manifest)!
    const pins = parseSpacetimeProgramPins(manifestBytes)
    expect(pins.realms.g002.g002SourceCommit).toBe(SOURCE.g002.sourceCommit)
    expect(pins.realms.ptr.ptrSourceTree).toBe(SOURCE.ptr.sourceTree)
    expect(pins.realms.g001.firstBuildArtifactSha256)
      .toBe(pins.realms.g001.secondBuildArtifactSha256)
    expect(decoder.decode(fixture.output.committed.get(FIXTURE_OUTPUT_PATHS.g001)!))
      .toBe('{"sections":[{"Types":[]}]}')
  })

  it('rolls back a partial stage and leaves the previous fixture set intact', async () => {
    const previous = new Map<string, Uint8Array>(
      Object.values(FIXTURE_OUTPUT_PATHS).map(path => [path, encode(`old:${path}`)]),
    )
    const output = memoryOutputs(previous, 2)
    const fixture = dependencies({ output })

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' }))

    const transaction = output.transaction()
    expect(transaction.commit).not.toHaveBeenCalled()
    expect(transaction.rollback).toHaveBeenCalledTimes(1)
    expect([...output.committed].map(([path, bytes]) => [path, decoder.decode(bytes)]))
      .toEqual([...previous].map(([path, bytes]) => [path, decoder.decode(bytes)]))
    expect(output.hasStaleStage()).toBe(false)
  })

  it('recovers stale staging before beginning the one replacement transaction', async () => {
    const output = memoryOutputs()
    output.setStaleStage()
    const fixture = dependencies({ output })

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })

    expect(output.outputs.recover).toHaveBeenCalledTimes(1)
    expect(output.outputs.recover.mock.invocationCallOrder[0])
      .toBeLessThan(output.outputs.begin.mock.invocationCallOrder[0]!)
    expect(output.hasStaleStage()).toBe(false)
  })

  it('preflights all checked-in outputs before WSL and --check never recovers or writes', async () => {
    const empty = dependencies()
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check' }))
    expect(empty.runner).not.toHaveBeenCalled()
    expect(empty.output.outputs.recover).not.toHaveBeenCalled()
    expect(empty.output.outputs.begin).not.toHaveBeenCalled()

    const output = memoryOutputs()
    const writer = dependencies({ output })
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })
    output.outputs.read.mockClear()
    output.outputs.recover.mockClear()
    output.outputs.begin.mockClear()
    const checker = dependencies({ output })

    await expect(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check' }))
      .resolves.toEqual({ verified: true })
    expect(output.outputs.read).toHaveBeenCalledTimes(Object.values(FIXTURE_OUTPUT_PATHS).length * 2)
    expect(output.outputs.recover).not.toHaveBeenCalled()
    expect(output.outputs.begin).not.toHaveBeenCalled()

    output.committed.set(FIXTURE_OUTPUT_PATHS.ptr, encode('{"sections":[]}'))
    const drifted = dependencies({ output })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check' }))
    expect(output.outputs.recover).not.toHaveBeenCalled()
    expect(output.outputs.begin).not.toHaveBeenCalled()
  })
})

describe('toolchain bootstrap and WSL runner shells', () => {
  it('admits no bootstrap URL, command, credential, or output override', () => {
    expect(parseToolchainArguments(['--private-root', PRIVATE_ROOT]))
      .toEqual({ privateRoot: PRIVATE_ROOT })
    for (const argv of [
      [],
      ['--private-root', 'relative'],
      ['--private-root', PRIVATE_ROOT, '--url', 'https://example.test'],
      ['--private-root', PRIVATE_ROOT, '--command', 'curl'],
      ['--private-root', PRIVATE_ROOT, '--credential', 'chosen'],
      ['--private-root', PRIVATE_ROOT, '--output', 'chosen.json'],
    ]) expect(() => parseToolchainArguments(argv)).toThrowError('RECOVERY_FIXTURE_INPUT_INVALID')
  })

  it('pins release signatures and archive identities without consulting PATH or caller URLs', () => {
    expect(TOOLCHAIN_SOURCE_POLICY_PATH).toBe(
      'services/release-recovery/scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
    )
    const policy = JSON.parse(decoder.decode(readFileSync(new URL(
      '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
      import.meta.url,
    ))))
    expect(policy).toMatchObject({
      profile: 'warpkeep-release-recovery-wsl-toolchain-source-policy-v1',
      nodeReleases: {
        '24.19.0': {
          archiveBytes: 31_633_904,
          archiveMemberBytes: 125_989_464,
          shasumsBytes: 2_967,
          signatureBytes: 119,
          signingAlgorithm: 'EdDSA',
          signerFingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
        },
        '22.22.3': {
          archiveBytes: 31_059_464,
          archiveMemberBytes: 124_819_136,
          shasumsBytes: 3_777,
          signatureBytes: 566,
          signingAlgorithm: 'RSA',
          signerFingerprint: 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
        },
      },
      pnpm: {
        version: '11.7.0',
        compressedBytes: 4_590_455,
        sha256: 'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee',
      },
      spacetime: {
        version: '2.6.1',
        commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
        archiveBytes: 57_464_969,
        archiveSha256: 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118',
      },
    })
  })

  it('prepares only through a validated fixed-policy bootstrap and returns no details', async () => {
    const fixture = dependencies()
    const bootstrap = vi.fn(async (_request: any) => bootstrapResult())
    fixedHost.bootstrapFixedWslToolchain.mockImplementation(bootstrap)
    await expect(prepareReleaseRecoveryWslToolchain({
      privateRoot: PRIVATE_ROOT,
    })).resolves.toEqual({ prepared: true })
    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(bootstrap.mock.calls[0]![0])).not.toContain('example.test')
  })

  it('fixes the WSL isolation policy and rejects caller-selected execution fields', async () => {
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })
    const plan = fixture.runner.mock.calls[0]![0].plan
    const execute = vi.fn(async () => runnerResult())
    fixedHost.executeFixedWslFixturePlan.mockImplementation(execute)

    await runReleaseRecoverySpacetimeFixturesWsl({ plan })

    expect(execute).toHaveBeenCalledWith({
      policy: WSL_EXECUTION_POLICY,
      platform: expect.objectContaining({
        profile: 'warpkeep-release-recovery-wsl-host-guest-preflight-v1',
      }),
      plan,
    })
    expect(fixedHost.preflightFixedWslHostAndGuest.mock.invocationCallOrder.at(-1))
      .toBeLessThan(execute.mock.invocationCallOrder[0]!)
    expect(WSL_EXECUTION_POLICY).toEqual({
      executable: String.raw`C:\Windows\System32\wsl.exe`,
      executableBytes: 274_432,
      executableFileVersion: '10.0.26100.8737',
      executableProductVersion: '10.0.26100.8737',
      executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
      wslVersion: '2.7.11.0',
      distribution: 'Ubuntu-24.04',
      guestOsReleaseBytes: 400,
      guestOsReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
      guestKernelRelease: '6.18.33.2-microsoft-standard-WSL2\n',
      guestKernelReleaseBytes: 34,
      guestKernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
      gitExecutable: '/usr/bin/git',
      gitVersion: 'git version 2.43.0',
      gitPackageVersion: '1:2.43.0-1ubuntu7.3',
      gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
      unshare: ['/usr/bin/unshare', '--user', '--map-root-user', '--net'],
      unsharePackageVersion: '2.39.3-9ubuntu6.6',
      unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
      loopbackTool: '/usr/sbin/ip',
      loopbackPackageVersion: '6.1.0-1ubuntu6.2',
      loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0',
      network: 'loopback-only',
      buildsPerRealm: 2,
      offlineAfterBootstrap: true,
    })

    await rejected(runReleaseRecoverySpacetimeFixturesWsl({
      plan: { ...plan, command: 'chosen-command' },
      execute,
    } as any))
    expect(execute).toHaveBeenCalledTimes(1)
  })
})

describe('fixed production WSL host boundary', () => {
  it('uses numeric Windows file-version parts before any WSL invocation', async () => {
    if (process.platform !== 'win32') return
    const wslPath = String.raw`C:\Windows\System32\wsl.exe`
    const wslBytes = Uint8Array.from(readFileSync(wslPath))
    if (sha256(wslBytes) !== WSL_EXECUTION_POLICY.executableSha256) return
    let reachedWslVersion = false
    childProcessBoundary.spawnSync.mockReset()
    childProcessBoundary.spawnSync.mockImplementation((executable: any, args: any) => {
      if (executable === String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`) {
        const script = String(args.at(-1))
        const usesNumericParts = script.includes('FileMajorPart')
          && script.includes('FileMinorPart')
          && script.includes('FileBuildPart')
          && script.includes('FilePrivatePart')
          && script.includes('ProductMajorPart')
          && script.includes('ProductPrivatePart')
        return {
          error: undefined,
          status: 0,
          signal: null,
          stdout: usesNumericParts
            ? '10.0.26100.8737\n10.0.26100.8737\n'
            : '10.0.26100.8737 (WinBuild.160101.0800)\n10.0.26100.8737\n',
          stderr: '',
        }
      }
      if (executable === wslPath && JSON.stringify(args) === JSON.stringify(['--version'])) {
        reachedWslVersion = true
        return {
          error: new Error('synthetic-stop-before-wsl'),
          status: null,
          signal: null,
          stdout: '',
          stderr: '',
        }
      }
      throw new Error('unexpected synthetic process boundary')
    })
    const actualHost = await vi.importActual<
      typeof import('../scripts/release-recovery-fixture-host.mjs')
    >('../scripts/release-recovery-fixture-host.mjs')

    await expect(actualHost.preflightFixedWslHostAndGuest({
      policy: WSL_EXECUTION_POLICY,
    })).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')
    expect(reachedWslVersion).toBe(true)
  }, 15_000)

  it('accepts one real fixed toolchain-attestation schema shared with the generator', async () => {
    const programs = fixedProgramCoordinates().toolchain
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
      platform: 'linux',
      architecture: 'x64',
      sourcePolicySha256: sha256(readFileSync(new URL(
        '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
        import.meta.url,
      ))),
      offlineReady: true,
      signaturesVerified: true,
      toolchainManifestSha256: programs.manifestSha256,
      cacheCatalogSha256: programs.cacheCatalogSha256,
      cacheClosureSha256: '8'.repeat(64),
      bootstrapProgramBytes: programs.bootstrapProgramBytes,
      bootstrapProgramSha256: programs.bootstrapProgramSha256,
      materializerProgramBytes: programs.materializerProgramBytes,
      materializerProgramSha256: programs.materializerProgramSha256,
    }
    const bytes = encode(`${JSON.stringify(record)}\n`)
    const actualHost = await vi.importActual<
      typeof import('../scripts/release-recovery-fixture-host.mjs')
    >('../scripts/release-recovery-fixture-host.mjs')

    await expect(actualHost.verifyFixedToolchainAttestation({
      path: FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation,
      bytes,
      attestationSha256: sha256(bytes),
    })).resolves.toEqual({
      ...record,
      attestationSha256: sha256(bytes),
    })
  })

  it('tracks the corrected guest source and owned-child lifecycle boundaries', () => {
    const materializer = decoder.decode(fixedProgramCoordinates().materializer)

    expect(materializer).toContain('const sourceRoot = `${cleanRoot}/source`')
    expect(materializer).toContain('destination,\n  })')
    expect(materializer).toContain(
      "exact(result, ['baseline', 'baselineAbiSha256', 'extractedFileCount', 'freezeNonce'])",
    )
    expect(materializer).toContain(
      'attestFixedFile(GIT, { mode: 0o755, sha256: GIT_SHA256 })',
    )
    expect(materializer).toContain("const store = `${cleanRoot}/.pnpm-store`")
    expect(materializer).toContain("['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'spacetimedb']")
    expect(materializer).toContain("['--no-replace-objects', '--git-dir', REPOSITORY, ...args]")
    expect(materializer).toContain('store.verify()')
    expect(materializer).not.toContain('`${STATE_ROOT}/pnpm-store/${realm}`')
    expect(materializer).toContain('await terminateOwnedChild(child)')
    expect(materializer).toContain('realpathSync.native(`/proc/${child.pid}/exe`) !== STANDALONE')
    expect(materializer).not.toContain('[GIT, true]')
  })

  it('keeps the byte-pinned Python guest source LF-normalized by Git', () => {
    const programs = fixedProgramCoordinates()
    expect([...programs.bootstrap]).not.toContain(13)
    expect(execFileSync('git', [
      'check-attr', 'eol', '--',
      'services/release-recovery/scripts/release-recovery-wsl-bootstrap.py',
    ], {
      cwd: new URL('../../..', import.meta.url),
      encoding: 'utf8',
    })).toContain('eol: lf')
  })

  it('attests and invokes the fixed bootstrap and isolated materializer programs', async () => {
    const programs = fixedProgramCoordinates()
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write' })
    const basePlan = fixture.runner.mock.calls[0]![0].plan
    const plan = {
      ...basePlan,
      toolchain: {
        ...basePlan.toolchain,
        materializerProgramBytes: programs.toolchain.materializerProgramBytes,
        materializerProgramSha256: programs.toolchain.materializerProgramSha256,
      },
    }
    const manifestBytes = runnerResult().toolchainManifestBytes
    const catalogBytes = encode(`${JSON.stringify({
      schemaVersion: 2,
      profile: 'warpkeep-release-recovery-wsl-cache-catalog-v2',
      platform: 'linux',
      architecture: 'x64',
      inventoryRoots: ['pnpm-store', 'source-caches', 'toolchains'],
      manifestPath: 'toolchains/linux-x64.json',
      manifestSha256: sha256(manifestBytes),
      cacheClosureSha256: '8'.repeat(64),
      signaturesVerified: true,
      offlineReady: true,
      entries: [{ path: 'pnpm-store', type: 'directory', mode: '700' }],
    })}\n`)
    const fixedBootstrapResult = {
      prepared: true,
      sourcePolicySha256: sha256(readFileSync(new URL(
        '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
        import.meta.url,
      ))),
      manifestSha256: sha256(manifestBytes),
      cacheSha256: sha256(catalogBytes),
      cacheClosureSha256: '8'.repeat(64),
      signaturesVerified: true,
      offlineReady: true,
    }
    const materializerWire = fixtureWireResult()
    const capturedRequests = new Map<string, unknown>()

    childProcessBoundary.spawnSync.mockReset()
    childProcessBoundary.spawnSync.mockImplementation((executable: any, args: any, options: any) => {
      expect(executable).toBe(String.raw`C:\Windows\System32\wsl.exe`)
      if (args.includes('/bin/sh') && args.includes('-ceu')) {
        const expectedProgram = args.includes(FIXED_BOOTSTRAP_PROGRAM)
          ? programs.bootstrap
          : programs.materializer
        expect(args).toEqual(expect.arrayContaining(['--user', 'root']))
        expect(Buffer.from(options.input)).toEqual(Buffer.from(expectedProgram))
        expect(args).toEqual(expect.arrayContaining([
          String(expectedProgram.byteLength),
          sha256(expectedProgram),
        ]))
        return {
          error: undefined,
          status: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }
      }
      const path = args.at(-1)
      const artifactBytes = path === '/var/lib/warpkeep/release-recovery-v1/toolchains/linux-x64.json'
        ? manifestBytes
        : path === '/var/lib/warpkeep/release-recovery-v1/cache-catalog-v2.json'
          ? catalogBytes
          : args.includes(FIXED_BOOTSTRAP_PROGRAM)
            ? programs.bootstrap
            : programs.materializer
      const artifactMode = path?.startsWith('/var/lib/warpkeep/release-recovery-v1/')
        ? '400'
        : '500'
      if (args.includes('/usr/bin/readlink')) {
        return { error: undefined, status: 0, signal: null, stdout: `${path}\n`, stderr: '' }
      }
      if (args.includes('/usr/bin/stat')) {
        return {
          error: undefined,
          status: 0,
          signal: null,
          stdout: `regular file|${artifactMode}|0|0|${artifactBytes.byteLength}\n`,
          stderr: '',
        }
      }
      if (args.includes('/bin/cat')) {
        return {
          error: undefined,
          status: 0,
          signal: null,
          stdout: Buffer.from(artifactBytes),
          stderr: Buffer.alloc(0),
        }
      }
      const response = args.includes(FIXED_BOOTSTRAP_PROGRAM)
        ? fixedBootstrapResult
        : materializerWire
      const selectedProgram = args.includes(FIXED_BOOTSTRAP_PROGRAM)
        ? FIXED_BOOTSTRAP_PROGRAM
        : FIXED_MATERIALIZER_PROGRAM
      capturedRequests.set(
        selectedProgram,
        JSON.parse(Buffer.from(options.input).toString('utf8')),
      )
      return {
        error: undefined,
        status: 0,
        signal: null,
        stdout: Buffer.from(`${JSON.stringify(response)}\n`),
        stderr: Buffer.alloc(0),
      }
    })

    const actualHost = await vi.importActual<
      typeof import('../scripts/release-recovery-fixture-host.mjs')
    >('../scripts/release-recovery-fixture-host.mjs')
    const platform = platformAttestation()
    const sourcePolicy = await actualHost.preflightFixedToolchainSourcePolicy()
    const sourceObjects = await actualHost.preflightFixedPublicSourceObjectDatabase()
    await expect(actualHost.bootstrapFixedWslToolchain({
      platform,
      sourcePolicy,
      sourceObjects,
      sources: {
        g002: { ...SOURCE.g002 },
        ptr: { ...SOURCE.ptr },
      },
    })).resolves.toEqual({
      ...fixedBootstrapResult,
      bootstrapProgramBytes: programs.bootstrap.byteLength,
      bootstrapProgramSha256: sha256(programs.bootstrap),
      materializerProgramBytes: programs.materializer.byteLength,
      materializerProgramSha256: sha256(programs.materializer),
    })
    await expect(actualHost.executeFixedWslFixturePlan({
      policy: WSL_EXECUTION_POLICY,
      platform,
      plan,
    })).resolves.toEqual(runnerResult())

    const calls = childProcessBoundary.spawnSync.mock.calls
    expect(calls).toHaveLength(19)
    const bootstrapCall = calls.find(([, args]: any[]) => (
      args.includes(FIXED_BOOTSTRAP_PROGRAM)
      && !args.includes('/bin/sh')
      && !args.includes('/bin/cat')
      && !args.includes('/usr/bin/stat')
      && !args.includes('/usr/bin/readlink')
    ))!
    const materializerCall = calls.find(([, args]: any[]) => (
      args.includes(FIXED_MATERIALIZER_PROGRAM)
      && !args.includes('/bin/sh')
      && !args.includes('/bin/cat')
      && !args.includes('/usr/bin/stat')
      && !args.includes('/usr/bin/readlink')
    ))!
    expect(bootstrapCall[1]).toContain('/usr/bin/env')
    expect(bootstrapCall[1]).toEqual(expect.arrayContaining(['--user', 'root']))
    expect(materializerCall[1]).toEqual(expect.arrayContaining([
      '--user', 'root', '/usr/bin/unshare', '--user', '--map-root-user', '--net',
      FIXED_MATERIALIZER_PROGRAM,
    ]))
    for (const [call, program] of [
      [bootstrapCall, FIXED_BOOTSTRAP_PROGRAM],
      [materializerCall, FIXED_MATERIALIZER_PROGRAM],
    ] as const) {
      expect(Object.keys(call[2].env).sort()).toEqual([
        'ComSpec', 'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR',
      ])
      expect(JSON.stringify(call)).not.toContain(PRIVATE_ROOT)
      const request = capturedRequests.get(program)
      expect(allObjectKeys(request)).not.toContain('privateRoot')
      expect(allObjectKeys(request)).not.toContain('root')
      expect(allObjectKeys(request)).not.toContain('canonicalPath')
    }
  })
})
