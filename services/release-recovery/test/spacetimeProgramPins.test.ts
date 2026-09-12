import { keccak_256, sha3_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { describe, expect, it } from 'vitest'

import {
  G001_PROGRAM_PIN_KEYS,
  G002_PROGRAM_PIN_KEYS,
  PROGRAM_PIN_MANIFEST_KEYS,
  PROGRAM_PIN_REALM_KEYS,
  PTR_PROGRAM_PIN_KEYS,
  parseSpacetimeProgramPins,
  validateSpacetimeProgramPins,
} from '../src/spacetimeProgramPins.js'

const encoder = new TextEncoder()

const G001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const BUILD_PROFILE = 'warpkeep-release-recovery-cross-platform-program-build-v1'
const TOOLCHAIN_PATH = 'services/release-recovery/fixtures/toolchains/linux-x64.json'

const common = (
  realm: 'g001' | 'g002' | 'ptr',
  databaseIdentity: string,
  modulePath: string,
  nodeVersion: '24.19.0' | '22.22.3',
  fixturePath: string,
  dependencyLockClosureSha256: string,
  artifactSha256: string,
  programKeccak256: string,
  deployedAbiV10Sha256: string,
  rawResponseSha256: string,
) => ({
  realm,
  databaseIdentity,
  recoveryBuildProfile: BUILD_PROFILE,
  modulePath,
  dependencyLockClosureSha256,
  toolchainManifestPath: TOOLCHAIN_PATH,
  toolchainManifestSha256: '2'.repeat(64),
  nodeVersion,
  spacetimeVersion: '2.6.1',
  gitPackageVersion: '1:2.43.0-1ubuntu7.3',
  wslVersion: '2.7.11.0',
  firstBuildArtifactSha256: artifactSha256,
  secondBuildArtifactSha256: artifactSha256,
  programArtifactSha256: artifactSha256,
  programHashAlgorithm: 'keccak-256',
  programKeccak256,
  deployedAbiV10Sha256,
  rawModuleDefV10ResponseSha256: rawResponseSha256,
  rawModuleDefV10FixturePath: fixturePath,
})

function validManifest(): Record<string, unknown> {
  const g001Common = common(
    'g001',
    G001_DATABASE,
    'spacetimedb',
    '24.19.0',
    'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json',
    '1'.repeat(64),
    '3'.repeat(64),
    '4'.repeat(64),
    '5'.repeat(64),
    '6'.repeat(64),
  )
  const g002Common = common(
    'g002',
    'd'.repeat(64),
    'spacetimedb/genesis002',
    '22.22.3',
    'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json',
    'a'.repeat(64),
    'b'.repeat(64),
    'c'.repeat(64),
    'd'.repeat(64),
    'e'.repeat(64),
  )
  const ptrCommon = common(
    'ptr',
    'e'.repeat(64),
    'spacetimedb/ptr',
    '22.22.3',
    'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json',
    '8'.repeat(64),
    '9'.repeat(64),
    'a'.repeat(64),
    'b'.repeat(64),
    'c'.repeat(64),
  )

  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-spacetime-program-pins-v1',
    realms: {
      g001: {
        realm: g001Common.realm,
        databaseIdentity: g001Common.databaseIdentity,
        recoveryBuildProfile: g001Common.recoveryBuildProfile,
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
        modulePath: g001Common.modulePath,
        dependencyLockClosureSha256: g001Common.dependencyLockClosureSha256,
        toolchainManifestPath: g001Common.toolchainManifestPath,
        toolchainManifestSha256: g001Common.toolchainManifestSha256,
        nodeVersion: g001Common.nodeVersion,
        spacetimeVersion: g001Common.spacetimeVersion,
        gitPackageVersion: g001Common.gitPackageVersion,
        wslVersion: g001Common.wslVersion,
        firstBuildArtifactSha256: g001Common.firstBuildArtifactSha256,
        secondBuildArtifactSha256: g001Common.secondBuildArtifactSha256,
        programArtifactSha256: g001Common.programArtifactSha256,
        programHashAlgorithm: g001Common.programHashAlgorithm,
        programKeccak256: g001Common.programKeccak256,
        deployedAbiV10Sha256: g001Common.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: g001Common.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: g001Common.rawModuleDefV10FixturePath,
      },
      g002: {
        realm: g002Common.realm,
        databaseIdentity: g002Common.databaseIdentity,
        recoveryBuildProfile: g002Common.recoveryBuildProfile,
        g002SourceCommit: '8'.repeat(40),
        g002SourceTree: '9'.repeat(40),
        modulePath: g002Common.modulePath,
        dependencyLockClosureSha256: g002Common.dependencyLockClosureSha256,
        toolchainManifestPath: g002Common.toolchainManifestPath,
        toolchainManifestSha256: g002Common.toolchainManifestSha256,
        nodeVersion: g002Common.nodeVersion,
        spacetimeVersion: g002Common.spacetimeVersion,
        gitPackageVersion: g002Common.gitPackageVersion,
        wslVersion: g002Common.wslVersion,
        firstBuildArtifactSha256: g002Common.firstBuildArtifactSha256,
        secondBuildArtifactSha256: g002Common.secondBuildArtifactSha256,
        programArtifactSha256: g002Common.programArtifactSha256,
        programHashAlgorithm: g002Common.programHashAlgorithm,
        programKeccak256: g002Common.programKeccak256,
        deployedAbiV10Sha256: g002Common.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: g002Common.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: g002Common.rawModuleDefV10FixturePath,
      },
      ptr: {
        realm: ptrCommon.realm,
        databaseIdentity: ptrCommon.databaseIdentity,
        recoveryBuildProfile: ptrCommon.recoveryBuildProfile,
        ptrSourceCommit: 'f'.repeat(40),
        ptrSourceTree: '1'.repeat(40),
        modulePath: ptrCommon.modulePath,
        dependencyLockClosureSha256: ptrCommon.dependencyLockClosureSha256,
        toolchainManifestPath: ptrCommon.toolchainManifestPath,
        toolchainManifestSha256: ptrCommon.toolchainManifestSha256,
        nodeVersion: ptrCommon.nodeVersion,
        spacetimeVersion: ptrCommon.spacetimeVersion,
        gitPackageVersion: ptrCommon.gitPackageVersion,
        wslVersion: ptrCommon.wslVersion,
        firstBuildArtifactSha256: ptrCommon.firstBuildArtifactSha256,
        secondBuildArtifactSha256: ptrCommon.secondBuildArtifactSha256,
        programArtifactSha256: ptrCommon.programArtifactSha256,
        programHashAlgorithm: ptrCommon.programHashAlgorithm,
        programKeccak256: ptrCommon.programKeccak256,
        deployedAbiV10Sha256: ptrCommon.deployedAbiV10Sha256,
        rawModuleDefV10ResponseSha256: ptrCommon.rawModuleDefV10ResponseSha256,
        rawModuleDefV10FixturePath: ptrCommon.rawModuleDefV10FixturePath,
      },
    },
  }
}

function realm(manifest: Record<string, unknown>, name: 'g001' | 'g002' | 'ptr'): Record<string, unknown> {
  return (manifest.realms as Record<string, Record<string, unknown>>)[name]!
}

function orderedCopy(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map(key => [key, source[key]]))
}

async function reject(mutator: (manifest: Record<string, unknown>) => void): Promise<void> {
  const manifest = validManifest()
  mutator(manifest)
  expect(() => validateSpacetimeProgramPins(manifest)).toThrowError('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
}

describe('parseSpacetimeProgramPins', () => {
  it('parses the exact three-realm manifest into an independent deeply frozen snapshot', () => {
    const manifest = validManifest()
    const parsed = validateSpacetimeProgramPins(manifest)

    expect(Object.keys(parsed)).toEqual([...PROGRAM_PIN_MANIFEST_KEYS])
    expect(Object.keys(parsed.realms)).toEqual([...PROGRAM_PIN_REALM_KEYS])
    expect(Object.keys(parsed.realms.g001)).toEqual([...G001_PROGRAM_PIN_KEYS])
    expect(Object.keys(parsed.realms.g002)).toEqual([...G002_PROGRAM_PIN_KEYS])
    expect(Object.keys(parsed.realms.ptr)).toEqual([...PTR_PROGRAM_PIN_KEYS])
    expect(parsed.realms.g001.g001BaselineAbiSha256).toBe('cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03')
    expect(parsed.realms.g002.programArtifactSha256).toBe('b'.repeat(64))
    expect(parsed.realms.ptr.programKeccak256).toBe('a'.repeat(64))
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.realms)).toBe(true)
    expect(Object.isFrozen(parsed.realms.g001)).toBe(true)
    expect(Object.isFrozen(parsed.realms.g002)).toBe(true)
    expect(Object.isFrozen(parsed.realms.ptr)).toBe(true)

    realm(manifest, 'g002').programArtifactSha256 = 'f'.repeat(64)
    expect(parsed.realms.g002.programArtifactSha256).toBe('b'.repeat(64))
  })

  it('parses only explicit strict manifest bytes without another authority source', () => {
    const manifest = validManifest()
    const bytes = encoder.encode(JSON.stringify(manifest))
    const parsed = parseSpacetimeProgramPins(bytes)

    expect(parsed.realms.g001.databaseIdentity).toBe(G001_DATABASE)
    expect(parsed.realms.g002.programKeccak256).toBe('c'.repeat(64))
    expect(Object.isFrozen(parsed.realms.ptr)).toBe(true)

    const duplicate = encoder.encode(JSON.stringify(manifest).replace(
      '{"schemaVersion":1,',
      '{"schemaVersion":1,"schemaVersion":1,',
    ))
    expect(() => parseSpacetimeProgramPins(duplicate))
      .toThrowError('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
    expect(() => parseSpacetimeProgramPins(new Uint8Array([0xff])))
      .toThrowError('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
    expect(() => parseSpacetimeProgramPins({} as Uint8Array))
      .toThrowError('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
  })

  it('fixes the manifest and realm field order', () => {
    expect(PROGRAM_PIN_MANIFEST_KEYS).toEqual(['schemaVersion', 'profile', 'realms'])
    expect(PROGRAM_PIN_REALM_KEYS).toEqual(['g001', 'g002', 'ptr'])
    expect(G001_PROGRAM_PIN_KEYS).toEqual([
      'realm', 'databaseIdentity', 'recoveryBuildProfile', 'g001BaselineCommit',
      'g001BaselineTree', 'g001BaselineSpacetimeTree', 'g001BaselineAbiSha256',
      'g001FreezePreparationCommit', 'g001FreezePreparationTree',
      'g001FreezePreparationSourceSha256', 'g001MaterializerSha256',
      'g001FreezeReleaseNonce', 'g001TransformedFrozenSourceClosureSha256',
      'modulePath', 'dependencyLockClosureSha256', 'toolchainManifestPath',
      'toolchainManifestSha256', 'nodeVersion', 'spacetimeVersion',
      'gitPackageVersion', 'wslVersion', 'firstBuildArtifactSha256',
      'secondBuildArtifactSha256', 'programArtifactSha256', 'programHashAlgorithm',
      'programKeccak256', 'deployedAbiV10Sha256',
      'rawModuleDefV10ResponseSha256', 'rawModuleDefV10FixturePath',
    ])
    expect(G002_PROGRAM_PIN_KEYS).toEqual([
      'realm', 'databaseIdentity', 'recoveryBuildProfile', 'g002SourceCommit',
      'g002SourceTree', 'modulePath', 'dependencyLockClosureSha256',
      'toolchainManifestPath', 'toolchainManifestSha256', 'nodeVersion',
      'spacetimeVersion', 'gitPackageVersion', 'wslVersion',
      'firstBuildArtifactSha256', 'secondBuildArtifactSha256',
      'programArtifactSha256', 'programHashAlgorithm', 'programKeccak256',
      'deployedAbiV10Sha256', 'rawModuleDefV10ResponseSha256',
      'rawModuleDefV10FixturePath',
    ])
    expect(PTR_PROGRAM_PIN_KEYS).toEqual([
      'realm', 'databaseIdentity', 'recoveryBuildProfile', 'ptrSourceCommit',
      'ptrSourceTree', 'modulePath', 'dependencyLockClosureSha256',
      'toolchainManifestPath', 'toolchainManifestSha256', 'nodeVersion',
      'spacetimeVersion', 'gitPackageVersion', 'wslVersion',
      'firstBuildArtifactSha256', 'secondBuildArtifactSha256',
      'programArtifactSha256', 'programHashAlgorithm', 'programKeccak256',
      'deployedAbiV10Sha256', 'rawModuleDefV10ResponseSha256',
      'rawModuleDefV10FixturePath',
    ])
  })

  it('uses conventional Keccak-256 and rejects the NIST SHA3-256 algorithm substitution', async () => {
    const empty = new Uint8Array()
    expect(bytesToHex(keccak_256(empty))).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
    expect(bytesToHex(sha3_256(empty))).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a')
    expect(bytesToHex(keccak_256(empty))).not.toBe(bytesToHex(sha3_256(empty)))
    await reject(manifest => { realm(manifest, 'g002').programHashAlgorithm = 'sha3-256' })
  })

  it('rejects absent, extra, accessor-backed, reordered, and generic source fields', async () => {
    await reject(manifest => { delete manifest.profile })
    await reject(manifest => { manifest.extra = true })
    await reject(manifest => {
      Object.defineProperty(realm(manifest, 'g001'), 'databaseIdentity', {
        enumerable: true,
        get: () => G001_DATABASE,
      })
    })
    await reject(manifest => {
      manifest.realms = {
        g002: realm(manifest, 'g002'),
        g001: realm(manifest, 'g001'),
        ptr: realm(manifest, 'ptr'),
      }
    })
    for (const name of ['g001', 'g002', 'ptr'] as const) {
      await reject(manifest => {
        const source = realm(manifest, name)
        const keys = Object.keys(source)
        ;[keys[0], keys[1]] = [keys[1]!, keys[0]!]
        ;(manifest.realms as Record<string, unknown>)[name] = orderedCopy(source, keys)
      })
      await reject(manifest => { realm(manifest, name).sourceCommit = '1'.repeat(40) })
    }
  })

  it('rejects drift in every source-fixed G001 provenance coordinate', async () => {
    const fixed = [
      'databaseIdentity', 'g001BaselineCommit', 'g001BaselineTree',
      'g001BaselineSpacetimeTree', 'g001BaselineAbiSha256',
      'g001FreezePreparationCommit', 'g001FreezePreparationTree',
      'g001FreezePreparationSourceSha256', 'g001MaterializerSha256',
      'g001FreezeReleaseNonce',
    ] as const
    for (const key of fixed) {
      await reject(manifest => { realm(manifest, 'g001')[key] = key.includes('Commit') || key.includes('Tree') ? '0'.repeat(40) : '0'.repeat(64) })
    }
  })

  it('rejects fixed profile, module, fixture, and toolchain identity drift', async () => {
    const cases: readonly (readonly ['g001' | 'g002' | 'ptr', string, unknown])[] = [
      ['g001', 'recoveryBuildProfile', 'historical-darwin-publisher'],
      ['g001', 'modulePath', 'spacetimedb/genesis002'],
      ['g002', 'modulePath', 'spacetimedb/ptr'],
      ['ptr', 'modulePath', 'spacetimedb/genesis002'],
      ['g001', 'nodeVersion', '22.22.3'],
      ['g002', 'nodeVersion', '24.19.0'],
      ['ptr', 'spacetimeVersion', '2.6.0'],
      ['g001', 'gitPackageVersion', 'git version 2.43.0'],
      ['g002', 'wslVersion', '2.7.10.0'],
      ['ptr', 'toolchainManifestPath', '../toolchain.json'],
      ['g002', 'rawModuleDefV10FixturePath', 'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json'],
    ]
    for (const [name, key, value] of cases) {
      await reject(manifest => { realm(manifest, name)[key] = value })
    }
  })

  it('rejects malformed hashes, zero coordinates, and mismatched clean-build artifacts', async () => {
    await reject(manifest => { realm(manifest, 'g002').g002SourceCommit = '0'.repeat(40) })
    await reject(manifest => { realm(manifest, 'ptr').ptrSourceTree = 'A'.repeat(40) })
    await reject(manifest => { realm(manifest, 'g001').g001TransformedFrozenSourceClosureSha256 = 'f'.repeat(63) })
    await reject(manifest => { realm(manifest, 'g002').programKeccak256 = '0'.repeat(64) })
    await reject(manifest => { realm(manifest, 'ptr').secondBuildArtifactSha256 = 'f'.repeat(64) })
    await reject(manifest => { realm(manifest, 'g001').programArtifactSha256 = 'f'.repeat(64) })
    await reject(manifest => {
      realm(manifest, 'g001').deployedAbiV10Sha256 =
        realm(manifest, 'g001').g001BaselineAbiSha256
    })
  })

  it('rejects cross-realm database, artifact, program, ABI, response, and dependency substitutions', async () => {
    const fields = [
      'databaseIdentity', 'dependencyLockClosureSha256', 'programArtifactSha256',
      'programKeccak256', 'deployedAbiV10Sha256', 'rawModuleDefV10ResponseSha256',
    ] as const
    for (const field of fields) {
      await reject(manifest => {
        const target = realm(manifest, 'ptr')
        target[field] = realm(manifest, 'g002')[field]
        if (field === 'programArtifactSha256') {
          target.firstBuildArtifactSha256 = target[field]
          target.secondBuildArtifactSha256 = target[field]
        }
      })
    }
    await reject(manifest => { realm(manifest, 'ptr').toolchainManifestSha256 = 'f'.repeat(64) })
  })

  it('redacts hostile input details behind one stable failure', () => {
    const hostile = new Proxy(validManifest(), {
      ownKeys: () => { throw new Error('do-not-leak-this-value') },
    })
    try {
      validateSpacetimeProgramPins(hostile)
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('ReleaseRecoveryProgramPinsError')
      expect((error as Error).message).toBe('RELEASE_RECOVERY_PROGRAM_PINS_FAILED')
      expect(Object.getOwnPropertyDescriptor(error, 'name')).toMatchObject({ enumerable: false })
      expect(Object.hasOwn(error as object, 'stack')).toBe(false)
      expect(Object.hasOwn(error as object, 'cause')).toBe(false)
      expect(Reflect.ownKeys(error as object).sort()).toEqual(['code', 'message', 'name'])
      expect(Object.keys(error as object)).toEqual(['code'])
      expect(String(error)).not.toContain('do-not-leak-this-value')
    }
  })
})
