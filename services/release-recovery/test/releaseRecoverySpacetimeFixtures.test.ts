import { createHash } from 'node:crypto'
import { win32 } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  FIXED_PRIVATE_RECORD_PATHS,
  FIXTURE_OUTPUT_PATHS,
  parseGeneratorArguments,
  runGenerator,
} from '../scripts/generate-release-recovery-spacetime-fixtures.mjs'
import {
  TOOLCHAIN_BOOTSTRAP_POLICY,
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
const PRIVATE_ROOT = String.raw`C:\synthetic\owner-private\release-recovery-v1`

const encode = (value: string): Uint8Array => encoder.encode(value)
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const SOURCE = Object.freeze({
  g002: Object.freeze({
    receiptSha256: '4'.repeat(64),
    databaseIdentity: 'd'.repeat(64),
    sourceCommit: '8'.repeat(40),
    sourceTree: '9'.repeat(40),
    publishedModuleSha256: 'b'.repeat(64),
    dependencyLockClosureSha256: 'a'.repeat(64),
  }),
  ptr: Object.freeze({
    receiptSha256: '5'.repeat(64),
    databaseIdentity: 'e'.repeat(64),
    sourceCommit: 'f'.repeat(40),
    sourceTree: '1'.repeat(40),
    publishedModuleSha256: '9'.repeat(64),
    dependencyLockClosureSha256: '8'.repeat(64),
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
    [FIXED_PRIVATE_RECORD_PATHS.ptrReceipt, encode('synthetic-ptr-receipt\n')],
  ])
}

function runnerResult(): any {
  const toolchainManifestBytes = encode(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1',
    platform: 'linux',
    architecture: 'x64',
    nodeVersions: ['24.19.0', '22.22.3'],
    pnpmVersion: '11.7.0',
    spacetimeVersion: '2.6.1',
    gitPackageVersion: '1:2.43.0-1ubuntu7.3',
    wslVersion: '2.7.11.0',
  })}\n`)
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-result-v1',
    toolchainManifestBytes,
    toolchainManifestSha256: sha256(toolchainManifestBytes),
    realms: {
      g001: {
        realm: 'g001',
        dependencyLockClosureSha256: '1'.repeat(64),
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
    open: vi.fn(async () => rootHandle),
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
    close: vi.fn(async () => undefined),
  }
  const verifyReceipt = vi.fn(async ({ realm, bytes }: any) => authenticatedReceipt(realm, bytes))
  const result = options.result ?? runnerResult()
  const verifyToolchain = vi.fn(async ({ bytes }: any) => ({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
    platform: 'linux',
    architecture: 'x64',
    offlineReady: true,
    signaturesVerified: true,
    attestationSha256: sha256(bytes),
    toolchainManifestSha256: result.toolchainManifestSha256,
  }))
  const runner = vi.fn(async (_request: any) => result)
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
  it('accepts only one exact mode and one absolute private root', () => {
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

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check', adapters: fixture.adapters }))

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

      await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters }))

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
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters }))
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
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters }))
    expect(fixture.runner).not.toHaveBeenCalled()
    expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
    expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it('derives only fixed receipt paths and passes only sanitized coordinates to WSL', async () => {
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters })

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

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters })

    expect(fixture.privateRoot.read.mock.calls.every((call: any[]) => call[0] === fixture.rootHandle))
      .toBe(true)
    expect(fixture.privateRoot.close).toHaveBeenCalledWith(fixture.rootHandle)
  })

  it('zeroizes verifier copies of private receipt and toolchain records', async () => {
    const fixture = dependencies()

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters })

    for (const call of fixture.verifyReceipt.mock.calls) {
      expect((call[0] as any).bytes.every((byte: number) => byte === 0)).toBe(true)
    }
    for (const call of fixture.verifyToolchain.mock.calls) {
      expect((call[0] as any).bytes.every((byte: number) => byte === 0)).toBe(true)
    }
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
      adapters: receiptFixture.adapters,
    }))
    expect(receiptFixture.runner).not.toHaveBeenCalled()

    const toolchainFixture = dependencies()
    toolchainFixture.verifyToolchain.mockImplementationOnce(async ({ bytes }: any) => ({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
      platform: 'linux',
      architecture: 'x64',
      offlineReady: true,
      signaturesVerified: false,
      attestationSha256: sha256(bytes),
      toolchainManifestSha256: runnerResult().toolchainManifestSha256,
    }))
    await rejected(runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
      adapters: toolchainFixture.adapters,
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
      await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters }))
      expect(fixture.output.outputs.recover).not.toHaveBeenCalled()
      expect(fixture.output.outputs.begin).not.toHaveBeenCalled()
    }
  })

  it('accepts only a digest-and-schema result and strictly parses every RawModuleDef v10 response', async () => {
    const extra = runnerResult()
    extra.realms.g001.programBytes = encode('private-program-bytes')
    const extraFixture = dependencies({ result: extra })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: extraFixture.adapters }))
    expect(extraFixture.output.outputs.begin).not.toHaveBeenCalled()

    const malformed = runnerResult()
    malformed.realms.g001.rawModuleDefV10ResponseBytes =
      encode('{"sections":[],"sections":[]}')
    const malformedFixture = dependencies({ result: malformed })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: malformedFixture.adapters }))
    expect(malformedFixture.output.outputs.begin).not.toHaveBeenCalled()
  })

  it('stages one exact manifest/toolchain/fixture set only after all validation succeeds', async () => {
    const fixture = dependencies()
    const result = await runGenerator({
      privateRoot: PRIVATE_ROOT,
      mode: 'write',
      adapters: fixture.adapters,
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

    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters }))

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

    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters })

    expect(output.outputs.recover).toHaveBeenCalledTimes(1)
    expect(output.outputs.recover.mock.invocationCallOrder[0])
      .toBeLessThan(output.outputs.begin.mock.invocationCallOrder[0]!)
    expect(output.hasStaleStage()).toBe(false)
  })

  it('preflights all checked-in outputs before WSL and --check never recovers or writes', async () => {
    const empty = dependencies()
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check', adapters: empty.adapters }))
    expect(empty.runner).not.toHaveBeenCalled()
    expect(empty.output.outputs.recover).not.toHaveBeenCalled()
    expect(empty.output.outputs.begin).not.toHaveBeenCalled()

    const output = memoryOutputs()
    const writer = dependencies({ output })
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: writer.adapters })
    output.outputs.read.mockClear()
    output.outputs.recover.mockClear()
    output.outputs.begin.mockClear()
    const checker = dependencies({ output })

    await expect(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check', adapters: checker.adapters }))
      .resolves.toEqual({ verified: true })
    expect(output.outputs.read).toHaveBeenCalledTimes(Object.values(FIXTURE_OUTPUT_PATHS).length * 2)
    expect(output.outputs.recover).not.toHaveBeenCalled()
    expect(output.outputs.begin).not.toHaveBeenCalled()

    output.committed.set(FIXTURE_OUTPUT_PATHS.ptr, encode('{"sections":[]}'))
    const drifted = dependencies({ output })
    await rejected(runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'check', adapters: drifted.adapters }))
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
      ['--private-root', PRIVATE_ROOT, '--output', 'chosen.json'],
    ]) expect(() => parseToolchainArguments(argv)).toThrowError('RECOVERY_FIXTURE_INPUT_INVALID')
  })

  it('pins release signatures and archive identities without consulting PATH or caller URLs', () => {
    expect(TOOLCHAIN_BOOTSTRAP_POLICY).toMatchObject({
      nodeReleaseSignatures: {
        '24.19.0': {
          algorithm: 'EdDSA',
          fingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
          keyBytes: 924,
          keySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
        },
        '22.22.3': {
          algorithm: 'RSA',
          fingerprint: 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
          keyBytes: 3163,
          keySha256: 'e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27',
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
        archiveSha256: 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118',
        cliSha256: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
        standaloneSha256: 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b',
      },
    })
  })

  it('prepares only through a validated fixed-policy bootstrap and returns no details', async () => {
    const fixture = dependencies()
    const bootstrap = vi.fn(async (_request: any) => ({
      prepared: true,
      manifestSha256: runnerResult().toolchainManifestSha256,
      cacheSha256: '6'.repeat(64),
      signaturesVerified: true,
      offlineReady: true,
    }))
    await expect(prepareReleaseRecoveryWslToolchain({
      privateRoot: PRIVATE_ROOT,
      adapters: { privateRoot: fixture.privateRoot, bootstrap },
    })).resolves.toEqual({ prepared: true })
    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(bootstrap.mock.calls[0]![0])).not.toContain('example.test')
  })

  it('fixes the WSL isolation policy and rejects caller-selected execution fields', async () => {
    const fixture = dependencies()
    await runGenerator({ privateRoot: PRIVATE_ROOT, mode: 'write', adapters: fixture.adapters })
    const plan = fixture.runner.mock.calls[0]![0].plan
    const execute = vi.fn(async () => runnerResult())

    await runReleaseRecoverySpacetimeFixturesWsl({ plan, execute })

    expect(execute).toHaveBeenCalledWith({ policy: WSL_EXECUTION_POLICY, plan })
    expect(WSL_EXECUTION_POLICY).toEqual({
      executable: 'wsl.exe',
      distribution: 'Ubuntu-24.04',
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
