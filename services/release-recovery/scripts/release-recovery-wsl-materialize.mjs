#!/var/lib/warpkeep/release-recovery-v1/toolchains/node-v24.19.0-linux-x64/bin/node

import { spawn, spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const STATE_ROOT = '/var/lib/warpkeep/release-recovery-v1'
const CATALOG_PATH = `${STATE_ROOT}/cache-catalog-v2.json`
const MANIFEST_PATH = `${STATE_ROOT}/toolchains/linux-x64.json`
const REPOSITORY = `${STATE_ROOT}/source-caches/repository.git`
const GIT = '/usr/bin/git'
const IP = '/usr/sbin/ip'
const NODE_24 = `${STATE_ROOT}/toolchains/node-v24.19.0-linux-x64/bin/node`
const NODE_22 = `${STATE_ROOT}/toolchains/node-v22.22.3-linux-x64/bin/node`
const PNPM = `${STATE_ROOT}/toolchains/pnpm-11.7.0/package/bin/pnpm.mjs`
const SPACETIME = `${STATE_ROOT}/toolchains/spacetime-2.6.1/spacetime`
const STANDALONE = `${STATE_ROOT}/toolchains/spacetime-2.6.1/spacetimedb-standalone`
const RUN_PARENT = `${STATE_ROOT}/runs`
const MATERIALIZER_PATH = '/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1'
const G001_BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
const G001_BASELINE_TREE = '90deebb5faf4129282f5c35999244f540001b27d'
const G001_BASELINE_SPACETIME_TREE = 'ab450fd2b3dcdd3ed67ef1f0431e18ae507382ac'
const G001_PREPARATION_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123'
const G001_PREPARATION_TREE = '8c2b0b0eda17cefc212f08716a287c44b0e84d48'
const G001_PREPARATION_SOURCE_SHA256 =
  '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251'
const G001_MATERIALIZER_PATH = 'scripts/genesis001-frozen-materializer.mjs'
const G001_MATERIALIZER_SHA256 =
  'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93'
const G001_BASELINE_ABI_SHA256 =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03'
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668'
const IP_SHA256 = '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0'
const NODE_RELEASE_EVIDENCE = Object.freeze({
  '24.19.0': Object.freeze({
    version: '24.19.0',
    archiveUrl: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
    archiveBytes: 31_633_904,
    archiveSha256: '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
    archiveMemberPath: 'node-v24.19.0-linux-x64/bin/node',
    archiveMemberMode: '755',
    archiveMemberBytes: 125_989_464,
    archiveMemberSha256: 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12',
    shasumsUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt',
    shasumsBytes: 2_967,
    shasumsSha256: 'be0629ee2bcd8e40bb856abdd3407f0762101b76bd60a36b8867f637733631c0',
    signatureUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.sig',
    signatureBytes: 119,
    signatureSha256: '801534e2d4c769c087e2e3eec89e879032872357e64e82336f86f03e72ece630',
    signingAlgorithm: 'EdDSA',
    signerFingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
    publicKeyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/5BE8A3F6C8A5C01D106C0AD820B1A390B168D356.asc',
    publicKeyBytes: 924,
    publicKeySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
  }),
  '22.22.3': Object.freeze({
    version: '22.22.3',
    archiveUrl: 'https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-x64.tar.xz',
    archiveBytes: 31_059_464,
    archiveSha256: '2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f',
    archiveMemberPath: 'node-v22.22.3-linux-x64/bin/node',
    archiveMemberMode: '755',
    archiveMemberBytes: 124_819_136,
    archiveMemberSha256: 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2',
    shasumsUrl: 'https://nodejs.org/dist/v22.22.3/SHASUMS256.txt',
    shasumsBytes: 3_777,
    shasumsSha256: 'b99296390cb403042da79c14d81e681076a9ac03af062d13f840dadc4ec751b3',
    signatureUrl: 'https://nodejs.org/dist/v22.22.3/SHASUMS256.txt.sig',
    signatureBytes: 566,
    signatureSha256: '4f362980820626546e556d5ddf6d8e4641a42e0419c23d3f73966cec1ff408ac',
    signingAlgorithm: 'RSA',
    signerFingerprint: 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
    publicKeyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/CC68F5A3106FF448322E48ED27F5E38D5B0A215F.asc',
    publicKeyBytes: 3_163,
    publicKeySha256: 'e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27',
  }),
})
const PNPM_EVIDENCE = Object.freeze({
  version: '11.7.0',
  url: 'https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz',
  compressedBytes: 4_590_455,
  sri: 'sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA==',
  sha256: 'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee',
})
const PNPM_MEMBER_EVIDENCE = Object.freeze({
  'package/bin/pnpm.mjs': Object.freeze({
    mode: '755', bytes: 1_464,
    sha256: 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd',
  }),
  'package/dist/pnpm.mjs': Object.freeze({
    mode: '644', bytes: 12_565_169,
    sha256: 'd3a7f4bde2f32c5acc5f012d1edc24c24ea247c2f6c8823146f8cd69ed70b22f',
  }),
  'package/package.json': Object.freeze({
    mode: '644', bytes: 2_216,
    sha256: '2b20455ee8d69d072df339bf9851edea94ee08a9ea14db9289a7fca0bbb7abb0',
  }),
})
const SPACETIME_EVIDENCE = Object.freeze({
  version: '2.6.1',
  commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
  archiveUrl: 'https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/spacetime-x86_64-unknown-linux-gnu.tar.gz',
  archiveBytes: 57_464_969,
  archiveSha256: 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118',
  redirectPolicy: 'github-release-one-hop-headerless',
})
const SPACETIME_MEMBER_EVIDENCE = Object.freeze({
  'spacetimedb-cli': Object.freeze({
    mode: '755', bytes: 47_905_552,
    sha256: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
  }),
  'spacetimedb-standalone': Object.freeze({
    mode: '755', bytes: 130_219_584,
    sha256: 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b',
  }),
})
const SYSTEM_TOOL_EVIDENCE = Object.freeze({
  git: Object.freeze({
    package: 'git', version: '1:2.43.0-1ubuntu7.3', path: '/usr/bin/git',
    sha256: GIT_SHA256,
  }),
  gpg: Object.freeze({
    package: 'gpg', version: '2.4.4-2ubuntu17.4', path: '/usr/bin/gpg',
    sha256: '7ecb1341104b0ee1107fe908abce37e24546de1db0848b29c75f59f72094f4e8',
  }),
  gpgv: Object.freeze({
    package: 'gpgv', version: '2.4.4-2ubuntu17.4', path: '/usr/bin/gpgv',
    sha256: '097b577cdf8b51dcc1fb42417d5ef3ca2e22b36a8ad16c9df4bd083a38fe476c',
  }),
  unshare: Object.freeze({
    package: 'util-linux', version: '2.39.3-9ubuntu6.6', path: '/usr/bin/unshare',
    sha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
  }),
  ip: Object.freeze({
    package: 'iproute2', version: '6.1.0-1ubuntu6.2', path: '/usr/sbin/ip',
    sha256: IP_SHA256,
  }),
})
const G001_FREEZE_NONCE = '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
const HEX40 = /^[0-9a-f]{40}$/u
const HEX64 = /^[0-9a-f]{64}$/u
const SAFE_REALM = /^(?:g001|g002|ptr)$/u
const MAX_REQUEST_BYTES = 256 * 1024
const MAX_CATALOG_BYTES = 8 * 1024 * 1024
const MAX_MANIFEST_BYTES = 512 * 1024
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024
const MAX_CACHE_ENTRIES = 100_000
const FIXED_ENVIRONMENT_KEYS = Object.freeze([
  'CI', 'HOME', 'LANG', 'LC_ALL', 'NO_COLOR', 'PATH', 'TMPDIR', 'TZ',
  'WSL_DISTRO_NAME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
])

class Invalid extends Error {}

function fail() {
  throw new Invalid()
}

function exact(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail()
  return value
}

function canonicalJson(bytes, maximumBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > maximumBytes) fail()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const value = JSON.parse(text)
  if (text !== `${JSON.stringify(value)}\n`) fail()
  return value
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const KECCAK_MASK = (1n << 64n) - 1n
const KECCAK_ROTATIONS = Object.freeze([
  0n, 1n, 62n, 28n, 27n,
  36n, 44n, 6n, 55n, 20n,
  3n, 10n, 43n, 25n, 39n,
  41n, 45n, 15n, 21n, 8n,
  18n, 2n, 61n, 56n, 14n,
])
const KECCAK_ROUND_CONSTANTS = Object.freeze([
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
])

function rotateLane(value, shift) {
  if (shift === 0n) return value
  return ((value << shift) | (value >> (64n - shift))) & KECCAK_MASK
}

function keccakPermutation(state) {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const columns = Array.from({ length: 5 }, (_, x) => (
      state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
    ))
    for (let x = 0; x < 5; x += 1) {
      const delta = columns[(x + 4) % 5] ^ rotateLane(columns[(x + 1) % 5], 1n)
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= delta
    }
    const lanes = Array(25).fill(0n)
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        lanes[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLane(
          state[x + 5 * y],
          KECCAK_ROTATIONS[x + 5 * y],
        )
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (
          lanes[x + 5 * y]
          ^ ((KECCAK_MASK ^ lanes[(x + 1) % 5 + 5 * y])
            & lanes[(x + 2) % 5 + 5 * y])
        ) & KECCAK_MASK
      }
    }
    state[0] ^= roundConstant
  }
}

export function keccak256Bytes(input) {
  if (!(input instanceof Uint8Array) || input.byteLength > MAX_BUNDLE_BYTES) fail()
  const state = Array(25).fill(0n)
  const rate = 136
  const absorb = block => {
    for (let laneIndex = 0; laneIndex < rate / 8; laneIndex += 1) {
      let lane = 0n
      for (let byteIndex = 0; byteIndex < 8; byteIndex += 1) {
        lane |= BigInt(block[laneIndex * 8 + byteIndex]) << BigInt(byteIndex * 8)
      }
      state[laneIndex] ^= lane
    }
    keccakPermutation(state)
  }
  let offset = 0
  while (offset + rate <= input.byteLength) {
    absorb(input.subarray(offset, offset + rate))
    offset += rate
  }
  const finalBlock = new Uint8Array(rate)
  finalBlock.set(input.subarray(offset))
  finalBlock[input.byteLength - offset] = 0x01
  finalBlock[rate - 1] |= 0x80
  absorb(finalBlock)
  const output = new Uint8Array(32)
  for (let index = 0; index < output.byteLength; index += 1) {
    output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn)
  }
  return output
}

function inside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith('/'))
}

function privateDirectory(path) {
  mkdirSync(path, { mode: 0o700, recursive: true })
  chmodSync(path, 0o700)
  const status = lstatSync(path)
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || status.uid !== process.getuid()
    || (status.mode & 0o777) !== 0o700
    || realpathSync.native(path) !== path
  ) fail()
}

function privateFile(path, bytes) {
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 })
  chmodSync(path, 0o600)
  const status = lstatSync(path)
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || status.uid !== process.getuid()
    || (status.mode & 0o777) !== 0o600
  ) fail()
}

function fixedRun(executable, args, environment, maximumBytes = 8 * 1024 * 1024) {
  const result = spawnSync(executable, args, {
    cwd: '/',
    encoding: null,
    env: environment,
    maxBuffer: maximumBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60_000,
  })
  if (
    result.error !== undefined
    || result.status !== 0
    || result.signal !== null
    || !(result.stdout instanceof Uint8Array)
    || !(result.stderr instanceof Uint8Array)
    || result.stderr.byteLength !== 0
    || result.stdout.byteLength > maximumBytes
  ) fail()
  return Buffer.from(result.stdout)
}

function git(args, environment, maximumBytes = 64 * 1024 * 1024) {
  return fixedRun(
    GIT,
    ['--no-replace-objects', '--git-dir', REPOSITORY, ...args],
    environment,
    maximumBytes,
  )
}

function assertNoForbiddenCoordinate(value) {
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:privateRoot|root|canonicalPath|url|command|credential|output)$/u.test(key)) fail()
    assertNoForbiddenCoordinate(child)
  }
}

function validateRequest(value) {
  const request = exact(value, ['schemaVersion', 'profile', 'platform', 'plan', 'network'])
  if (
    request.schemaVersion !== 1
    || request.profile !== 'warpkeep-release-recovery-wsl-fixture-request-v1'
    || request.network !== 'initialize-and-attest-loopback-only-before-install'
  ) fail()
  const plan = exact(request.plan, [
    'schemaVersion', 'profile', 'recoveryBuildProfile', 'toolchain', 'realms',
  ])
  if (
    plan.schemaVersion !== 1
    || plan.profile !== 'warpkeep-release-recovery-wsl-fixture-plan-v1'
    || plan.recoveryBuildProfile !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
  ) fail()
  const toolchain = exact(plan.toolchain, [
    'sourcePolicySha256', 'manifestSha256', 'cacheCatalogSha256',
    'cacheClosureSha256', 'platform', 'architecture',
    'offlineReady', 'signaturesVerified', 'bootstrapProgramBytes',
    'bootstrapProgramSha256', 'materializerProgramBytes',
    'materializerProgramSha256',
  ])
  if (
    !HEX64.test(toolchain.sourcePolicySha256)
    || !HEX64.test(toolchain.manifestSha256)
    || !HEX64.test(toolchain.cacheCatalogSha256)
    || !HEX64.test(toolchain.cacheClosureSha256)
    || toolchain.platform !== 'linux'
    || toolchain.architecture !== 'x64'
    || toolchain.offlineReady !== true
    || toolchain.signaturesVerified !== true
    || !Number.isSafeInteger(toolchain.bootstrapProgramBytes)
    || toolchain.bootstrapProgramBytes < 1
    || toolchain.bootstrapProgramBytes > 16 * 1024 * 1024
    || !HEX64.test(toolchain.bootstrapProgramSha256)
    || !Number.isSafeInteger(toolchain.materializerProgramBytes)
    || toolchain.materializerProgramBytes < 1
    || toolchain.materializerProgramBytes > 16 * 1024 * 1024
    || !HEX64.test(toolchain.materializerProgramSha256)
  ) fail()
  const realms = exact(plan.realms, ['g001', 'g002', 'ptr'])
  const g001 = exact(realms.g001, [
    'realm', 'sourceAuthority', 'baselineCommit', 'baselineTree', 'baselineSpacetimeTree',
    'freezePreparationCommit', 'freezePreparationTree', 'freezePreparationSourceSha256',
    'materializerSha256', 'freezeReleaseNonce', 'modulePath', 'nodeVersion',
  ])
  if (
    g001.realm !== 'g001'
    || g001.sourceAuthority !== 'fixed-g001-frozen-materializer-v1'
    || g001.baselineCommit !== G001_BASELINE_COMMIT
    || g001.baselineTree !== G001_BASELINE_TREE
    || g001.baselineSpacetimeTree !== G001_BASELINE_SPACETIME_TREE
    || g001.freezePreparationCommit !== G001_PREPARATION_COMMIT
    || g001.freezePreparationTree !== G001_PREPARATION_TREE
    || g001.freezePreparationSourceSha256 !== G001_PREPARATION_SOURCE_SHA256
    || g001.materializerSha256 !== G001_MATERIALIZER_SHA256
    || g001.freezeReleaseNonce !== G001_FREEZE_NONCE
    || g001.modulePath !== 'spacetimedb'
    || g001.nodeVersion !== '24.19.0'
  ) fail()
  const validateAuthenticatedRealm = (raw, realm, modulePath) => {
    const authenticated = exact(raw, [
      'realm', 'sourceAuthority', 'receiptSha256', 'databaseIdentity', 'sourceCommit',
      'sourceTree', 'publishedModuleSha256', 'dependencyLockClosureSha256',
      'modulePath', 'nodeVersion',
    ])
    if (
      authenticated.realm !== realm
      || authenticated.sourceAuthority !== 'authenticated-publish-receipt-v1'
      || !HEX64.test(authenticated.receiptSha256)
      || !HEX64.test(authenticated.databaseIdentity)
      || !HEX40.test(authenticated.sourceCommit)
      || !HEX40.test(authenticated.sourceTree)
      || !HEX64.test(authenticated.publishedModuleSha256)
      || !HEX64.test(authenticated.dependencyLockClosureSha256)
      || authenticated.modulePath !== modulePath
      || authenticated.nodeVersion !== '22.22.3'
    ) fail()
    return authenticated
  }
  const g002 = validateAuthenticatedRealm(realms.g002, 'g002', 'spacetimedb/genesis002')
  const ptr = validateAuthenticatedRealm(realms.ptr, 'ptr', 'spacetimedb/ptr')
  if (g002.databaseIdentity === ptr.databaseIdentity) fail()
  assertNoForbiddenCoordinate(request)
  return plan
}

function positiveInteger(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail()
  return value
}

function validateManifestMember(value) {
  const member = exact(value, ['mode', 'bytes', 'sha256'])
  if ((member.mode !== '644' && member.mode !== '755') || !HEX64.test(member.sha256)) fail()
  positiveInteger(member.bytes, 256 * 1024 * 1024)
  return member
}

function requireFixedEvidence(value, expected) {
  for (const [field, fixed] of Object.entries(expected)) {
    if (value[field] !== fixed) fail()
  }
}

function requireCatalogFile(entries, path, mode, bytes, digest) {
  const entry = exact(entries.get(path), ['path', 'type', 'mode', 'bytes', 'sha256'])
  if (
    entry.path !== path
    || entry.type !== 'file'
    || entry.mode !== mode
    || entry.bytes !== bytes
    || entry.sha256 !== digest
  ) fail()
}

function validateManifestSource(value, realm, coordinates) {
  const source = exact(value, [
    'realm', 'sourceCommit', 'sourceTree', 'dependencyLockClosureSha256',
    'dependencyInventoryDomain', 'dependencyClosureRecordPath', 'dependencyFiles',
  ])
  const expectedCommit = realm === 'g001' ? coordinates.baselineCommit : coordinates.sourceCommit
  const expectedTree = realm === 'g001' ? coordinates.baselineTree : coordinates.sourceTree
  if (
    source.realm !== realm
    || source.sourceCommit !== expectedCommit
    || source.sourceTree !== expectedTree
    || !HEX64.test(source.dependencyLockClosureSha256)
    || (coordinates.dependencyLockClosureSha256 !== undefined
      && source.dependencyLockClosureSha256 !== coordinates.dependencyLockClosureSha256)
    || source.dependencyInventoryDomain
      !== `warpkeep.release-recovery.source-dependencies.${realm}.v1`
    || source.dependencyClosureRecordPath
      !== `source-caches/${realm}-dependency-closure-sha256.txt`
    || !Array.isArray(source.dependencyFiles)
    || source.dependencyFiles.length < 1
    || source.dependencyFiles.length > 16
  ) fail()
  const expectedPaths = realm === 'g001'
    ? ['spacetimedb/package.json', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/pnpm-workspace.yaml']
    : realm === 'g002'
      ? ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'spacetimedb/genesis002/package.json']
      : ['spacetimedb/ptr/package.json', 'spacetimedb/ptr/pnpm-lock.yaml']
  if (source.dependencyFiles.length !== expectedPaths.length) fail()
  const closure = createHash('sha256')
  closure.update(`${source.dependencyInventoryDomain}\n`)
  for (let index = 0; index < source.dependencyFiles.length; index += 1) {
    const file = exact(source.dependencyFiles[index], ['path', 'blob', 'bytes', 'sha256'])
    if (
      file.path !== expectedPaths[index]
      || file.path === source.dependencyClosureRecordPath
      || !HEX40.test(file.blob)
      || !HEX64.test(file.sha256)
    ) fail()
    positiveInteger(file.bytes, 16 * 1024 * 1024)
    closure.update(`${file.path}\0${file.blob}\0${file.bytes}\0${file.sha256}\n`)
  }
  if (
    realm === 'g001'
    && JSON.stringify(source.dependencyFiles.map(file => file.blob)) !== JSON.stringify([
      'faf7214653f1248a3f9231fd6a13dda130821014',
      '649efdebd25528f593aff612ca8aef6f761d1e94',
      'a640febaa07fad295f2de4b4416b7a22910eb2e6',
    ])
  ) fail()
  if (closure.digest('hex') !== source.dependencyLockClosureSha256) fail()
  return source
}

function validateManifestCache(value, realm, source) {
  const cache = exact(value, [
    'realm', 'sourceCommit', 'sourceTree', 'storePath', 'closureRecordPath',
    'closureSha256', 'containsLinuxX64Esbuild', 'packages',
  ])
  if (
    cache.realm !== realm
    || cache.sourceCommit !== source.sourceCommit
    || cache.sourceTree !== source.sourceTree
    || cache.storePath !== `pnpm-store/${realm}`
    || cache.closureRecordPath !== source.dependencyClosureRecordPath
    || cache.closureSha256 !== source.dependencyLockClosureSha256
    || cache.containsLinuxX64Esbuild !== true
    || !Array.isArray(cache.packages)
    || cache.packages.length < 1
    || cache.packages.length > 10_000
  ) fail()
  let previous = Buffer.alloc(0)
  let esbuild = false
  for (const raw of cache.packages) {
    const entry = exact(raw, [
      'name', 'version', 'url', 'sri', 'bytes', 'sha256', 'os', 'cpu',
    ])
    const coordinate = typeof entry.name === 'string' && typeof entry.version === 'string'
      ? Buffer.from(`${entry.name}@${entry.version}`, 'utf8')
      : null
    if (
      coordinate === null
      || coordinate.compare(previous) <= 0
      || typeof entry.url !== 'string'
      || !entry.url.startsWith('https://registry.npmjs.org/')
      || entry.url.includes('?')
      || entry.url.includes('#')
      || typeof entry.sri !== 'string'
      || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(entry.sri)
      || !HEX64.test(entry.sha256)
      || !Array.isArray(entry.os)
      || !Array.isArray(entry.cpu)
    ) fail()
    positiveInteger(entry.bytes, 64 * 1024 * 1024)
    previous = coordinate
    if (
      entry.name === '@esbuild/linux-x64'
      && entry.os.includes('linux')
      && entry.cpu.includes('x64')
    ) esbuild = true
  }
  if (!esbuild) fail()
}

export function validateToolchainManifestBytes(bytes, toolchain, realmCoordinates, catalogEntries) {
  if (
    toolchain === null
    || typeof toolchain !== 'object'
    || JSON.stringify(Object.keys(toolchain)) !== JSON.stringify([
      'sourcePolicySha256', 'bootstrapProgramBytes', 'bootstrapProgramSha256',
      'materializerProgramBytes', 'materializerProgramSha256', 'installedMode',
      'installedVerified',
    ])
    || !HEX64.test(toolchain.sourcePolicySha256)
    || !HEX64.test(toolchain.bootstrapProgramSha256)
    || !HEX64.test(toolchain.materializerProgramSha256)
    || toolchain.installedMode !== '500'
    || toolchain.installedVerified !== true
  ) fail()
  positiveInteger(toolchain.bootstrapProgramBytes, 16 * 1024 * 1024)
  positiveInteger(toolchain.materializerProgramBytes, 16 * 1024 * 1024)
  if (
    catalogEntries === null
    || typeof catalogEntries !== 'object'
    || Object.getPrototypeOf(catalogEntries) !== Map.prototype
    || catalogEntries.size < 1
    || catalogEntries.size > MAX_CACHE_ENTRIES
  ) fail()
  const realms = exact(realmCoordinates, ['g001', 'g002', 'ptr'])
  const manifest = exact(canonicalJson(bytes, MAX_MANIFEST_BYTES), [
    'schemaVersion', 'profile', 'platform', 'architecture', 'distribution',
    'recoveryBuildProfile', 'sourcePolicySha256', 'hostGuest', 'programs',
    'nodeReleases', 'pnpm', 'spacetime', 'systemTools', 'sourceObjectExport',
    'sources', 'dependencyCaches', 'signaturesVerified', 'offlineReady',
  ])
  if (
    manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1'
    || manifest.platform !== 'linux'
    || manifest.architecture !== 'x64'
    || manifest.distribution !== 'Ubuntu-24.04'
    || manifest.recoveryBuildProfile
      !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
    || manifest.sourcePolicySha256 !== toolchain.sourcePolicySha256
    || manifest.signaturesVerified !== true
    || manifest.offlineReady !== true
  ) fail()
  const hostGuest = exact(manifest.hostGuest, [
    'wslExecutable', 'wslExecutableBytes', 'wslExecutableSha256',
    'wslFileVersion', 'wslProductVersion', 'wslVersion', 'guestOsReleaseBytes',
    'guestOsReleaseSha256', 'guestKernelReleaseBytes', 'guestKernelReleaseSha256',
    'platformVerified',
  ])
  if (
    hostGuest.wslExecutable !== String.raw`C:\Windows\System32\wsl.exe`
    || hostGuest.wslExecutableBytes !== 274_432
    || hostGuest.wslExecutableSha256
      !== '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2'
    || hostGuest.wslFileVersion !== '10.0.26100.8737'
    || hostGuest.wslProductVersion !== '10.0.26100.8737'
    || hostGuest.wslVersion !== '2.7.11.0'
    || hostGuest.guestOsReleaseBytes !== 400
    || hostGuest.guestOsReleaseSha256
      !== '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829'
    || hostGuest.guestKernelReleaseBytes !== 34
    || hostGuest.guestKernelReleaseSha256
      !== '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92'
    || hostGuest.platformVerified !== true
  ) fail()
  const programs = exact(manifest.programs, [
    'bootstrapProgramBytes', 'bootstrapProgramSha256',
    'materializerProgramBytes', 'materializerProgramSha256', 'installedMode',
    'installedVerified',
  ])
  if (
    programs.bootstrapProgramBytes !== toolchain.bootstrapProgramBytes
    || programs.bootstrapProgramSha256 !== toolchain.bootstrapProgramSha256
    || programs.materializerProgramBytes !== toolchain.materializerProgramBytes
    || programs.materializerProgramSha256 !== toolchain.materializerProgramSha256
    || programs.installedMode !== toolchain.installedMode
    || programs.installedVerified !== toolchain.installedVerified
  ) fail()
  const nodes = exact(manifest.nodeReleases, ['24.19.0', '22.22.3'])
  for (const version of ['24.19.0', '22.22.3']) {
    const node = exact(nodes[version], [
      'version', 'archiveUrl', 'archiveBytes', 'archiveSha256', 'archiveMemberPath',
      'archiveMemberMode', 'archiveMemberBytes', 'archiveMemberSha256', 'shasumsUrl',
      'shasumsBytes', 'shasumsSha256', 'signatureUrl', 'signatureBytes',
      'signatureSha256', 'signingAlgorithm', 'signerFingerprint', 'publicKeyUrl',
      'publicKeyBytes', 'publicKeySha256', 'signatureVerified',
      'extractedMemberVerified',
    ])
    const expected = NODE_RELEASE_EVIDENCE[version]
    requireFixedEvidence(node, expected)
    if (
      node.signatureVerified !== true
      || node.extractedMemberVerified !== true
    ) fail()
  }
  const pnpm = exact(manifest.pnpm, [
    'version', 'url', 'compressedBytes', 'sri', 'sha256', 'members',
    'archiveVerified', 'membersVerified',
  ])
  requireFixedEvidence(pnpm, PNPM_EVIDENCE)
  if (
    pnpm.archiveVerified !== true
    || pnpm.membersVerified !== true
  ) fail()
  const pnpmMembers = exact(pnpm.members, [
    'package/bin/pnpm.mjs', 'package/dist/pnpm.mjs', 'package/package.json',
  ])
  for (const memberPath of Object.keys(PNPM_MEMBER_EVIDENCE)) {
    const member = validateManifestMember(pnpmMembers[memberPath])
    requireFixedEvidence(member, PNPM_MEMBER_EVIDENCE[memberPath])
  }
  const spacetime = exact(manifest.spacetime, [
    'version', 'commit', 'archiveUrl', 'archiveBytes', 'archiveSha256',
    'redirectPolicy', 'members', 'archiveVerified', 'membersVerified',
  ])
  requireFixedEvidence(spacetime, SPACETIME_EVIDENCE)
  if (
    spacetime.archiveVerified !== true
    || spacetime.membersVerified !== true
  ) fail()
  const spacetimeMembers = exact(spacetime.members, ['spacetimedb-cli', 'spacetimedb-standalone'])
  for (const memberPath of Object.keys(SPACETIME_MEMBER_EVIDENCE)) {
    const member = validateManifestMember(spacetimeMembers[memberPath])
    requireFixedEvidence(member, SPACETIME_MEMBER_EVIDENCE[memberPath])
  }
  const tools = exact(manifest.systemTools, ['git', 'gpg', 'gpgv', 'unshare', 'ip'])
  for (const name of Object.keys(tools)) {
    const tool = exact(tools[name], [
      'package', 'version', 'path', 'sha256', 'installedBytes',
      'installedMode', 'installedVerified',
    ])
    requireFixedEvidence(tool, SYSTEM_TOOL_EVIDENCE[name])
    if (
      tool.installedMode !== '755'
      || tool.installedVerified !== true
    ) fail()
    positiveInteger(tool.installedBytes, 64 * 1024 * 1024)
  }
  const sources = exact(manifest.sources, ['g001', 'g002', 'ptr'])
  const caches = exact(manifest.dependencyCaches, ['g001', 'g002', 'ptr'])
  for (const realm of ['g001', 'g002', 'ptr']) {
    const source = validateManifestSource(sources[realm], realm, realms[realm])
    validateManifestCache(caches[realm], realm, source)
  }
  requireCatalogFile(
    catalogEntries,
    'toolchains/linux-x64.json',
    '400',
    bytes.byteLength,
    sha256(bytes),
  )
  for (const version of ['24.19.0', '22.22.3']) {
    const node = nodes[version]
    requireCatalogFile(
      catalogEntries,
      `toolchains/node-v${version}-linux-x64/bin/node`,
      '500',
      node.archiveMemberBytes,
      node.archiveMemberSha256,
    )
  }
  for (const [memberPath, installedMode] of [
    ['package/bin/pnpm.mjs', '500'],
    ['package/dist/pnpm.mjs', '400'],
    ['package/package.json', '400'],
  ]) {
    const member = pnpmMembers[memberPath]
    requireCatalogFile(
      catalogEntries,
      `toolchains/pnpm-11.7.0/${memberPath}`,
      installedMode,
      member.bytes,
      member.sha256,
    )
  }
  for (const [memberPath, installedName] of [
    ['spacetimedb-cli', 'spacetime'],
    ['spacetimedb-standalone', 'spacetimedb-standalone'],
  ]) {
    const member = spacetimeMembers[memberPath]
    requireCatalogFile(
      catalogEntries,
      `toolchains/spacetime-2.6.1/${installedName}`,
      '500',
      member.bytes,
      member.sha256,
    )
  }
  for (const realm of ['g001', 'g002', 'ptr']) {
    const closureBytes = Buffer.from(`${sources[realm].dependencyLockClosureSha256}\n`, 'ascii')
    requireCatalogFile(
      catalogEntries,
      `source-caches/${realm}-dependency-closure-sha256.txt`,
      '400',
      closureBytes.byteLength,
      sha256(closureBytes),
    )
  }
  for (const [path, content] of [
    ['source-caches/repository.git/HEAD', 'ref: refs/heads/never\n'],
    ['source-caches/repository.git/config', '[core]\n\trepositoryformatversion = 0\n\tbare = true\n'],
  ]) {
    const contentBytes = Buffer.from(content, 'ascii')
    requireCatalogFile(
      catalogEntries,
      path,
      '400',
      contentBytes.byteLength,
      sha256(contentBytes),
    )
  }
  const exported = exact(manifest.sourceObjectExport, [
    'profile', 'repositoryPath', 'objectFormat', 'objectInventoryDomain',
    'objectInventoryRecordPath', 'objectCount', 'objectBytes',
    'objectClosureSha256', 'exactObjectsVerified', 'sources',
  ])
  if (
    exported.profile !== 'warpkeep-release-recovery-source-object-export-v1'
    || exported.repositoryPath !== 'source-caches/repository.git'
    || exported.objectFormat !== 'sha1'
    || exported.objectInventoryDomain
      !== 'warpkeep.release-recovery.source-object-export.v1'
    || exported.objectInventoryRecordPath
      !== 'source-caches/repository-object-inventory-v1.json'
    || !HEX64.test(exported.objectClosureSha256)
    || exported.exactObjectsVerified !== true
  ) fail()
  positiveInteger(exported.objectCount, 100_000)
  positiveInteger(exported.objectBytes, 512 * 1024 * 1024)
  const exportedSources = exact(exported.sources, ['g001', 'g002', 'ptr'])
  const exportedG001 = exact(exportedSources.g001, [
    'sourceCommit', 'sourceTree', 'preparationCommit', 'preparationTree',
  ])
  if (
    exportedG001.sourceCommit !== sources.g001.sourceCommit
    || exportedG001.sourceTree !== sources.g001.sourceTree
    || exportedG001.preparationCommit !== G001_PREPARATION_COMMIT
    || exportedG001.preparationTree !== G001_PREPARATION_TREE
  ) fail()
  for (const realm of ['g002', 'ptr']) {
    const source = exact(exportedSources[realm], ['sourceCommit', 'sourceTree'])
    if (
      source.sourceCommit !== sources[realm].sourceCommit
      || source.sourceTree !== sources[realm].sourceTree
    ) fail()
  }
  return manifest
}

function buildEnvironment(cleanRoot, nodeExecutable) {
  const values = {
    HOME: `${cleanRoot}/home`,
    XDG_CACHE_HOME: `${cleanRoot}/xdg-cache`,
    XDG_CONFIG_HOME: `${cleanRoot}/xdg-config`,
    XDG_DATA_HOME: `${cleanRoot}/xdg-data`,
    TMPDIR: `${cleanRoot}/tmp`,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    NO_COLOR: '1',
    CI: '1',
    WSL_DISTRO_NAME: 'Ubuntu-24.04',
    PATH: dirname(nodeExecutable),
  }
  for (const path of [values.HOME, values.XDG_CACHE_HOME, values.XDG_CONFIG_HOME,
    values.XDG_DATA_HOME, values.TMPDIR]) privateDirectory(path)
  return Object.freeze(values)
}

function gitEnvironment(cleanRoot) {
  return Object.freeze({
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '',
    GIT_ASKPASS: '/bin/false',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_INDEX_FILE: `${cleanRoot}/git-index`,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    HOME: `${cleanRoot}/home`,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    SSH_ASKPASS: '/bin/false',
    TZ: 'UTC',
  })
}

function validCachePath(path) {
  const encoded = typeof path === 'string' ? Buffer.from(path, 'utf8') : null
  return encoded !== null
    && encoded.byteLength >= 1
    && encoded.byteLength <= 1_024
    && Buffer.from(encoded.toString('utf8'), 'utf8').equals(encoded)
    && !path.includes('\\')
    && !path.startsWith('/')
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
    && /^(?:toolchains|pnpm-store|source-caches)(?:\/|$)/u.test(path)
}

function cacheEntryClosure(entries) {
  const digest = createHash('sha256')
  digest.update('warpkeep.release-recovery.wsl-cache-catalog-closure.v2\n')
  for (const entry of entries) {
    digest.update(entry.type === 'directory'
      ? `directory\0${entry.path}\0${entry.mode}\n`
      : `file\0${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.mode}\n`)
  }
  return digest.digest('hex')
}

function attestCacheEntry(path, relativePath) {
  const status = lstatSync(path)
  if (
    status.isSymbolicLink()
    || status.uid !== 0
    || status.gid !== 0
    || realpathSync.native(path) !== path
  ) fail()
  const mode = (status.mode & 0o777).toString(8)
  if (status.isDirectory()) {
    if (mode !== '500' && mode !== '700') fail()
    return Object.freeze({ path: relativePath, type: 'directory', mode })
  }
  if (
    !status.isFile()
    || status.nlink !== 1
    || status.size < 0
    || status.size > 256 * 1024 * 1024
    || (mode !== '400' && mode !== '500')
  ) fail()
  const bytes = readFileSync(path)
  if (bytes.byteLength !== status.size) fail()
  return Object.freeze({
    path: relativePath,
    type: 'file',
    mode,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  })
}

function inventoryFixedCache() {
  const observed = []
  const visit = relativePath => {
    if (!validCachePath(relativePath) || observed.length >= MAX_CACHE_ENTRIES) fail()
    const absolute = `${STATE_ROOT}/${relativePath}`
    const entry = attestCacheEntry(absolute, relativePath)
    observed.push(entry)
    if (entry.type !== 'directory') return
    const names = readdirSync(absolute).sort((left, right) => (
      Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'))
    ))
    for (const name of names) visit(`${relativePath}/${name}`)
  }
  for (const root of ['pnpm-store', 'source-caches', 'toolchains']) visit(root)
  return observed.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))
}

export function verifyCacheCatalog(expectedSha256) {
  const catalogEntry = attestCacheEntry(CATALOG_PATH, 'cache-catalog-v2.json')
  if (catalogEntry.type !== 'file' || catalogEntry.mode !== '400') fail()
  const bytes = readFileSync(CATALOG_PATH)
  if (
    bytes.byteLength > MAX_CATALOG_BYTES
    || bytes.byteLength !== catalogEntry.bytes
    || sha256(bytes) !== catalogEntry.sha256
    || catalogEntry.sha256 !== expectedSha256
  ) fail()
  const catalog = exact(canonicalJson(bytes, MAX_CATALOG_BYTES), [
    'schemaVersion', 'profile', 'platform', 'architecture', 'inventoryRoots',
    'manifestPath', 'manifestSha256', 'cacheClosureSha256', 'signaturesVerified',
    'offlineReady', 'entries',
  ])
  if (
    catalog.schemaVersion !== 2
    || catalog.profile !== 'warpkeep-release-recovery-wsl-cache-catalog-v2'
    || catalog.platform !== 'linux'
    || catalog.architecture !== 'x64'
    || JSON.stringify(catalog.inventoryRoots) !== JSON.stringify([
      'pnpm-store', 'source-caches', 'toolchains',
    ])
    || catalog.manifestPath !== 'toolchains/linux-x64.json'
    || !HEX64.test(catalog.manifestSha256)
    || !HEX64.test(catalog.cacheClosureSha256)
    || catalog.signaturesVerified !== true
    || catalog.offlineReady !== true
    || !Array.isArray(catalog.entries)
    || catalog.entries.length < 1
    || catalog.entries.length > MAX_CACHE_ENTRIES
  ) fail()
  const fileEntries = new Map()
  let previousPath = Buffer.alloc(0)
  for (const raw of catalog.entries) {
    const entry = raw?.type === 'directory'
      ? exact(raw, ['path', 'type', 'mode'])
      : exact(raw, ['path', 'type', 'mode', 'bytes', 'sha256'])
    const encodedPath = typeof entry.path === 'string' ? Buffer.from(entry.path, 'utf8') : null
    if (
      !validCachePath(entry.path)
      || encodedPath === null
      || encodedPath.compare(previousPath) <= 0
      || (entry.type === 'directory' && entry.mode !== '500' && entry.mode !== '700')
      || (entry.type === 'file' && (
        !HEX64.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes)
        || entry.bytes < 0
        || entry.bytes > 256 * 1024 * 1024
        || (entry.mode !== '400' && entry.mode !== '500')
      ))
      || (entry.type !== 'directory' && entry.type !== 'file')
    ) fail()
    previousPath = encodedPath
    if (entry.type === 'file') fileEntries.set(entry.path, entry)
  }
  for (const path of [
    'toolchains/linux-x64.json',
    'toolchains/node-v24.19.0-linux-x64/bin/node',
    'toolchains/node-v22.22.3-linux-x64/bin/node',
    'toolchains/pnpm-11.7.0/package/bin/pnpm.mjs',
    'toolchains/spacetime-2.6.1/spacetime',
    'toolchains/spacetime-2.6.1/spacetimedb-standalone',
    'source-caches/g001-dependency-closure-sha256.txt',
    'source-caches/g002-dependency-closure-sha256.txt',
    'source-caches/ptr-dependency-closure-sha256.txt',
  ]) if (!fileEntries.has(path)) fail()
  for (const path of fileEntries.keys()) {
    if (
      path === 'source-caches/repository.git/info/grafts'
      || path === 'source-caches/repository.git/objects/info/alternates'
      || path === 'source-caches/repository.git/objects/info/http-alternates'
      || path.startsWith('source-caches/repository.git/refs/replace/')
    ) fail()
  }
  const manifestEntry = fileEntries.get(catalog.manifestPath)
  if (manifestEntry.sha256 !== catalog.manifestSha256) fail()
  if (cacheEntryClosure(catalog.entries) !== catalog.cacheClosureSha256) fail()
  const observed = inventoryFixedCache()
  if (JSON.stringify(observed) !== JSON.stringify(catalog.entries)) fail()
  return Object.freeze({ catalog, entries: fileEntries })
}

function attestFixedFile(path, expected) {
  const status = lstatSync(path)
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || status.uid !== 0
    || status.gid !== 0
    || (status.mode & 0o777) !== expected.mode
    || status.size < 1
    || status.size > 256 * 1024 * 1024
    || (expected.bytes !== undefined && status.size !== expected.bytes)
    || realpathSync.native(path) !== path
  ) fail()
  if (sha256(readFileSync(path)) !== expected.sha256) fail()
}

function verifyMaterializedStore(store, expected) {
  const observed = new Map()
  const visit = current => {
    const directory = lstatSync(current)
    if (
      !directory.isDirectory()
      || directory.isSymbolicLink()
      || directory.uid !== process.getuid()
      || (directory.mode & 0o777) !== 0o700
      || realpathSync.native(current) !== current
    ) fail()
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const status = lstatSync(path)
      if (status.isSymbolicLink()) fail()
      if (status.isDirectory()) {
        visit(path)
        continue
      }
      if (!status.isFile() || status.nlink !== 1 || status.uid !== process.getuid()) fail()
      const relativePath = relative(store, path).split(sep).join('/')
      const entry = expected.get(relativePath)
      if (
        entry === undefined
        || status.size !== entry.bytes
        || (status.mode & 0o777) !== entry.mode
        || sha256(readFileSync(path)) !== entry.sha256
      ) fail()
      observed.set(relativePath, true)
    }
  }
  visit(store)
  if (observed.size !== expected.size) fail()
}

function materializeRealmStore(realm, cleanRoot, catalogEntries) {
  if (!SAFE_REALM.test(realm)) fail()
  const prefix = `pnpm-store/${realm}/`
  const store = `${cleanRoot}/.pnpm-store`
  privateDirectory(store)
  const expected = new Map()
  for (const [catalogPath, catalogEntry] of catalogEntries) {
    if (!catalogPath.startsWith(prefix)) continue
    const relativePath = catalogPath.slice(prefix.length)
    if (
      relativePath.length < 1
      || relativePath.split('/').some(part => part === '' || part === '.' || part === '..')
      || expected.has(relativePath)
    ) fail()
    const target = resolve(store, relativePath)
    if (!inside(store, target)) fail()
    privateDirectory(dirname(target))
    const bytes = readFileSync(resolve(STATE_ROOT, catalogPath))
    if (bytes.byteLength !== catalogEntry.bytes || sha256(bytes) !== catalogEntry.sha256) fail()
    privateFile(target, bytes)
    const mode = Number.parseInt(catalogEntry.mode, 8)
    chmodSync(target, mode)
    expected.set(relativePath, Object.freeze({
      bytes: catalogEntry.bytes,
      mode,
      sha256: catalogEntry.sha256,
    }))
  }
  if (expected.size < 1) fail()
  verifyMaterializedStore(store, expected)
  return Object.freeze({
    path: store,
    verify: () => verifyMaterializedStore(store, expected),
  })
}

function attestNetworkNamespace() {
  fixedRun(IP, ['link', 'set', 'lo', 'up'], process.env, 4 * 1024)
  const links = JSON.parse(fixedRun(IP, ['-json', 'link', 'show'], process.env, 64 * 1024))
  const routes = JSON.parse(fixedRun(IP, ['-json', 'route', 'show', 'table', 'all'], process.env, 64 * 1024))
  if (
    !Array.isArray(links)
    || links.length !== 1
    || links[0]?.ifname !== 'lo'
    || !links[0]?.flags?.includes('LOOPBACK')
    || !links[0]?.flags?.includes('UP')
    || !Array.isArray(routes)
    || routes.some(route => route?.dev !== 'lo')
  ) fail()
}

function materializeCommit(commit, tree, modulePath, cleanRoot, realm) {
  if (!HEX40.test(commit) || !HEX40.test(tree)) fail()
  const environment = gitEnvironment(cleanRoot)
  const resolvedCommit = git(['rev-parse', '--verify', `${commit}^{commit}`], environment, 128)
    .toString('utf8').trim()
  const resolvedTree = git(['rev-parse', '--verify', `${commit}:${modulePath}`], environment, 128)
    .toString('utf8').trim()
  if (resolvedCommit !== commit || resolvedTree !== tree) fail()
  const prefixes = realm === 'g002'
    ? ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'spacetimedb']
    : realm === 'ptr' ? ['spacetimedb/ptr'] : fail()
  const listing = git(
    ['ls-tree', '-rz', '--full-tree', '--long', commit, '--', ...prefixes],
    environment,
    16 * 1024 * 1024,
  )
  const records = listing.subarray(0, listing.byteLength - 1).toString('binary').split('\0')
  if (listing.byteLength < 2 || listing.at(-1) !== 0 || records.length < 1) fail()
  const seen = new Set()
  let totalBytes = 0
  for (const encodedRecord of records) {
    const record = Buffer.from(encodedRecord, 'binary')
    const tab = record.indexOf(9)
    if (tab < 1) fail()
    const metadata = record.subarray(0, tab).toString('ascii')
    const match = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)$/u.exec(metadata)
    const pathBytes = record.subarray(tab + 1)
    const path = pathBytes.toString('utf8')
    if (
      match === null
      || !Buffer.from(path, 'utf8').equals(pathBytes)
      || path.length < 1
      || path.length > 4_096
      || path.includes('\\')
      || path.startsWith('/')
      || !prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
      || path.split('/').some(part => part === '' || part === '.' || part === '..')
      || seen.has(path)
    ) fail()
    seen.add(path)
    const size = Number(match[3])
    if (!Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024) fail()
    totalBytes += size
    if (totalBytes > 256 * 1024 * 1024) fail()
    const bytes = git(['cat-file', 'blob', match[2]], environment, size + 1)
    if (bytes.byteLength !== size) fail()
    const target = resolve(cleanRoot, path)
    if (!inside(cleanRoot, target)) fail()
    privateDirectory(dirname(target))
    privateFile(target, bytes)
    if (match[1] === '100755') chmodSync(target, 0o500)
  }
}

async function materializeG001(destination, runRoot, plan) {
  const environment = gitEnvironment(runRoot)
  const source = git(
    ['show', `${G001_PREPARATION_COMMIT}:${G001_MATERIALIZER_PATH}`],
    environment,
    2 * 1024 * 1024,
  )
  if (sha256(source) !== G001_MATERIALIZER_SHA256) fail()
  const modulePath = `${runRoot}/g001-materializer.mjs`
  privateFile(modulePath, source)
  const materializer = await import(`${pathToFileURL(modulePath).href}?sha256=${G001_MATERIALIZER_SHA256}`)
  if (typeof materializer.materializeGenesis001Frozen !== 'function') fail()
  const result = materializer.materializeGenesis001Frozen({
    repoRoot: REPOSITORY,
    destination,
  })
  exact(result, ['baseline', 'baselineAbiSha256', 'extractedFileCount', 'freezeNonce'])
  if (
    result.baseline !== plan.baselineCommit
    || result.baselineAbiSha256 !== G001_BASELINE_ABI_SHA256
    || !Number.isSafeInteger(result.extractedFileCount)
    || result.extractedFileCount < 1
    || result.freezeNonce !== plan.freezeReleaseNonce
  ) fail()
  unlinkSync(modulePath)
}

function sourceClosure(root) {
  const entries = []
  const visit = current => {
    for (const name of readdirSync(current).sort()) {
      if (name === 'node_modules' || name === 'dist') continue
      const path = join(current, name)
      const status = lstatSync(path)
      if (status.isSymbolicLink()) fail()
      if (status.isDirectory()) visit(path)
      else if (status.isFile() && status.nlink === 1) entries.push(path)
      else fail()
    }
  }
  visit(root)
  const digest = createHash('sha256')
  digest.update('warpkeep.release-recovery.transformed-source-closure.v1\n')
  for (const path of entries.sort((left, right) => Buffer.from(relative(root, left)).compare(Buffer.from(relative(root, right))))) {
    const bytes = readFileSync(path)
    digest.update(relative(root, path).split(sep).join('/')).update('\0')
    digest.update(String(bytes.byteLength)).update('\0').update(bytes)
  }
  return digest.digest('hex')
}

async function buildOnce(realm, realmPlan, catalogEntries) {
  if (!SAFE_REALM.test(realm)) fail()
  const cleanRoot = mkdtempSync(`${RUN_PARENT}/${realm}-build-`)
  chmodSync(cleanRoot, 0o700)
  let bundle
  try {
    const sourceRoot = `${cleanRoot}/source`
    const node = realm === 'g001' ? NODE_24 : NODE_22
    const modulePath = realm === 'g001'
      ? `${sourceRoot}/spacetimedb`
      : realm === 'g002'
        ? `${sourceRoot}/spacetimedb/genesis002`
        : `${sourceRoot}/spacetimedb/ptr`
    const workspacePath = realm === 'ptr' ? modulePath : `${sourceRoot}/spacetimedb`
    const importer = realm === 'g001'
      ? 'warpkeep-spacetimedb-module'
      : realm === 'g002'
        ? 'warpkeep-genesis-002-spacetimedb-module'
        : 'warpkeep-ptr-spacetimedb-module'
    const environment = buildEnvironment(cleanRoot, node)
    const store = materializeRealmStore(realm, cleanRoot, catalogEntries)
    if (realm === 'g001') await materializeG001(sourceRoot, cleanRoot, realmPlan)
    else {
      privateDirectory(sourceRoot)
      materializeCommit(
        realmPlan.sourceCommit,
        realmPlan.sourceTree,
        realmPlan.modulePath,
        sourceRoot,
        realm,
      )
    }
    const transformedSourceClosureSha256 = realm === 'g001'
      ? sourceClosure(`${sourceRoot}/spacetimedb`)
      : null
    const dependencyDigest = readFileSync(
      `${STATE_ROOT}/source-caches/${realm}-dependency-closure-sha256.txt`,
      'utf8',
    )
    if (dependencyDigest !== `${realmPlan.dependencyLockClosureSha256 ?? dependencyDigest.trim()}\n`) fail()
    fixedRun(node, [
      PNPM,
      '--dir', workspacePath,
      '--filter', importer,
      'install',
      '--offline',
      '--frozen-lockfile',
      '--ignore-scripts',
      `--store-dir=${store.path}`,
      `--virtual-store-dir=${modulePath}/node_modules/.pnpm`,
    ], environment)
    store.verify()
    const shim = `${modulePath}/node_modules/.bin/tsc`
    const shimStatus = lstatSync(shim)
    if (!shimStatus.isFile() || shimStatus.isSymbolicLink() || shimStatus.size < 1 || shimStatus.size > 64 * 1024) fail()
    unlinkSync(shim)
    const launcher = `${modulePath}/node_modules/.bin/warpkeep-tsc-launcher.cjs`
    privateFile(launcher, Buffer.from(`#!${node}\nrequire('../typescript/bin/tsc');\n`))
    chmodSync(launcher, 0o500)
    symlinkSync('warpkeep-tsc-launcher.cjs', shim)
    const dist = `${modulePath}/dist`
    try { lstatSync(dist); fail() } catch (error) { if (error instanceof Invalid) throw error }
    fixedRun(SPACETIME, ['build', '--module-path', modulePath], environment)
    if (JSON.stringify(readdirSync(dist)) !== JSON.stringify(['bundle.js'])) fail()
    const bundlePath = `${dist}/bundle.js`
    const status = lstatSync(bundlePath)
    if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || status.size > MAX_BUNDLE_BYTES) fail()
    bundle = Uint8Array.from(readFileSync(bundlePath))
    return Object.freeze({ bundle, transformedSourceClosureSha256 })
  } finally {
    rmSync(cleanRoot, { recursive: true, force: true })
  }
}

async function freePort() {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return rejectPromise(new Invalid())
      server.close(error => error === undefined ? resolvePromise(address.port) : rejectPromise(error))
    })
  })
}

export async function readBoundedResponse(response, expectedUrl, maximumBytes) {
  let reader
  let cancelled = false
  const chunks = []
  try {
    if (
      response.url !== expectedUrl
      || response.status !== 200
      || !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 1
    ) fail()
    const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (type !== 'application/json' || response.body === null) fail()
    reader = response.body.getReader()
    let length = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      if (!(part.value instanceof Uint8Array)) fail()
      if (part.value.byteLength > maximumBytes - length) {
        cancelled = true
        await reader.cancel()
        fail()
      }
      const chunk = Buffer.from(part.value)
      chunks.push(chunk)
      length += chunk.byteLength
    }
    if (length < 1) fail()
    return Uint8Array.from(Buffer.concat(chunks, length))
  } catch {
    if (reader !== undefined && !cancelled) {
      try { await reader.cancel() } catch { /* retain the fixed failure */ }
    }
    fail()
  } finally {
    for (const chunk of chunks) chunk.fill(0)
    if (reader !== undefined) {
      try { reader.releaseLock() } catch { /* retain the fixed result or failure */ }
    }
  }
}

async function acquireIdentity(server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const url = `${server}/v1/identity`
      const response = await fetch(url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(1_000),
      })
      const bytes = await readBoundedResponse(response, url, 4 * 1024)
      const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
      if (!HEX64.test(value.identity) || typeof value.token !== 'string' || value.token.length > 8 * 1024) fail()
      return value
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
    }
  }
  fail()
}

function parsePublished(stdout, name) {
  const match = new TextDecoder('utf8', { fatal: true }).decode(stdout).match(
    /^Created new database with name: ([a-z0-9-]{1,63}), identity: ([0-9a-f]{64})\r?\n$/u,
  )
  if (match === null || match[1] !== name) fail()
  return match[2]
}

function parseProgramHash(bytes) {
  const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
  const statement = Array.isArray(value) && value.length === 1 ? value[0] : fail()
  if (
    JSON.stringify(Object.keys(statement)) !== JSON.stringify(['schema', 'rows', 'total_duration_micros', 'stats'])
    || !Array.isArray(statement.rows)
    || statement.rows.length !== 1
    || !Array.isArray(statement.rows[0])
    || statement.rows[0].length !== 1
    || typeof statement.rows[0][0] !== 'string'
    || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/u.test(statement.rows[0][0])
  ) fail()
  const bytesBigEndian = statement.rows[0][0].slice(2).padStart(64, '0').match(/../gu)
  if (bytesBigEndian === null || bytesBigEndian.length !== 32) fail()
  return bytesBigEndian.reverse().join('')
}

async function captureSchemas(builds, environment) {
  const serverRoot = mkdtempSync(`${RUN_PARENT}/server-`)
  chmodSync(serverRoot, 0o700)
  let child
  let owner
  try {
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const publicKey = `${serverRoot}/jwt-public.pem`
    const privateKey = `${serverRoot}/jwt-private.pem`
    const data = `${serverRoot}/data`
    privateDirectory(data)
    privateFile(publicKey, generated.publicKey)
    privateFile(privateKey, generated.privateKey)
    const port = await freePort()
    const server = `http://127.0.0.1:${port}`
    child = spawn(STANDALONE, [
      'start', '--listen-addr', `127.0.0.1:${port}`, '--in-memory',
      '--data-dir', data, '--jwt-pub-key-path', publicKey,
      '--jwt-priv-key-path', privateKey, '--non-interactive',
    ], { cwd: '/', env: environment, stdio: 'ignore' })
    if (
      !Number.isSafeInteger(child.pid)
      || child.pid < 1
      || realpathSync.native(`/proc/${child.pid}/exe`) !== STANDALONE
    ) fail()
    owner = await acquireIdentity(server)
    const config = `${serverRoot}/cli.toml`
    privateFile(config, Buffer.from(`spacetimedb_token = ${JSON.stringify(owner.token)}\n`))
    const result = {}
    for (const realm of ['g001', 'g002', 'ptr']) {
      const bundlePath = `${serverRoot}/${realm}.bundle.js`
      privateFile(bundlePath, builds[realm].bundle)
      const name = `warpkeep-recovery-${realm}-${randomBytes(12).toString('hex')}`
      const identity = parsePublished(fixedRun(SPACETIME, [
        `--config-path=${config}`,
        'publish', '--server', server, '--js-path', bundlePath,
        '--delete-data=never', '--yes=skip-login', '--no-config', name,
      ], environment, 64 * 1024), name)
      const sqlUrl = `${server}/v1/database/${identity}/sql?confirmed=true`
      const sql = await readBoundedResponse(await fetch(sqlUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${owner.token}`,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'SELECT program_hash FROM st_module',
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      }), sqlUrl, 64 * 1024)
      if (parseProgramHash(sql) !== builds[realm].programKeccak256) fail()
      const schemaUrl = `${server}/v1/database/${identity}/schema?version=10`
      const schema = await readBoundedResponse(await fetch(schemaUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${owner.token}`,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      }), schemaUrl, MAX_SCHEMA_BYTES)
      JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(schema))
      result[realm] = schema
      unlinkSync(bundlePath)
    }
    return result
  } finally {
    if (owner !== undefined && typeof owner.token === 'string') owner.token = ''
    if (child !== undefined) await terminateOwnedChild(child)
    rmSync(serverRoot, { recursive: true, force: true })
  }
}

async function terminateOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const waitForExit = timeout => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise(true)
      return
    }
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('exit', onExit)
      child.off('error', onError)
      resolvePromise(value)
    }
    const onExit = () => finish(true)
    const onError = () => finish(false)
    const timer = setTimeout(() => finish(false), timeout)
    child.once('exit', onExit)
    child.once('error', onError)
  })
  const gracefulExit = waitForExit(5_000)
  child.kill('SIGTERM')
  if (await gracefulExit) return
  const forcedExit = waitForExit(5_000)
  child.kill('SIGKILL')
  if (!(await forcedExit)) fail()
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid() !== 0) fail()
  if (JSON.stringify(Object.keys(process.env).sort()) !== JSON.stringify([...FIXED_ENVIRONMENT_KEYS].sort())) fail()
  if (
    process.argv.length !== 2
    || realpathSync.native(process.argv[1]) !== MATERIALIZER_PATH
  ) fail()
  attestNetworkNamespace()
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.byteLength
    if (length > MAX_REQUEST_BYTES) fail()
    chunks.push(chunk)
  }
  const plan = validateRequest(canonicalJson(Buffer.concat(chunks), MAX_REQUEST_BYTES))
  attestFixedFile(MATERIALIZER_PATH, {
    bytes: plan.toolchain.materializerProgramBytes,
    mode: 0o500,
    sha256: plan.toolchain.materializerProgramSha256,
  })
  const verifiedCatalog = verifyCacheCatalog(plan.toolchain.cacheCatalogSha256)
  if (
    verifiedCatalog.catalog.manifestSha256 !== plan.toolchain.manifestSha256
    || verifiedCatalog.catalog.cacheClosureSha256 !== plan.toolchain.cacheClosureSha256
  ) fail()
  const manifest = readFileSync(MANIFEST_PATH)
  if (manifest.byteLength > MAX_MANIFEST_BYTES || sha256(manifest) !== plan.toolchain.manifestSha256) fail()
  validateToolchainManifestBytes(
    manifest,
    {
      sourcePolicySha256: plan.toolchain.sourcePolicySha256,
      bootstrapProgramBytes: plan.toolchain.bootstrapProgramBytes,
      bootstrapProgramSha256: plan.toolchain.bootstrapProgramSha256,
      materializerProgramBytes: plan.toolchain.materializerProgramBytes,
      materializerProgramSha256: plan.toolchain.materializerProgramSha256,
      installedMode: '500',
      installedVerified: true,
    },
    plan.realms,
    verifiedCatalog.entries,
  )
  for (const [path, entry] of verifiedCatalog.entries) {
    attestFixedFile(resolve(STATE_ROOT, path), {
      bytes: entry.bytes,
      mode: Number.parseInt(entry.mode, 8),
      sha256: entry.sha256,
    })
  }
  attestFixedFile(GIT, { mode: 0o755, sha256: GIT_SHA256 })
  attestFixedFile(IP, { mode: 0o755, sha256: IP_SHA256 })
  privateDirectory(RUN_PARENT)
  const builds = {}
  for (const realm of ['g001', 'g002', 'ptr']) {
    const first = await buildOnce(realm, plan.realms[realm], verifiedCatalog.entries)
    const second = await buildOnce(realm, plan.realms[realm], verifiedCatalog.entries)
    if (!Buffer.from(first.bundle).equals(Buffer.from(second.bundle))) fail()
    const digest = sha256(first.bundle)
    if (realm !== 'g001' && digest !== plan.realms[realm].publishedModuleSha256) fail()
    builds[realm] = {
      bundle: first.bundle,
      dependencyLockClosureSha256: plan.realms[realm].dependencyLockClosureSha256
        ?? readFileSync(`${STATE_ROOT}/source-caches/g001-dependency-closure-sha256.txt`, 'utf8').trim(),
      transformedSourceClosureSha256: first.transformedSourceClosureSha256,
      firstBuildArtifactSha256: digest,
      secondBuildArtifactSha256: digest,
      programArtifactSha256: digest,
      programKeccak256: Buffer.from(keccak256Bytes(first.bundle)).toString('hex'),
    }
  }
  const serverEnvironmentRoot = mkdtempSync(`${RUN_PARENT}/server-environment-`)
  chmodSync(serverEnvironmentRoot, 0o700)
  let schemas
  try {
    const environment = buildEnvironment(serverEnvironmentRoot, NODE_24)
    schemas = await captureSchemas(builds, environment)
  } finally {
    rmSync(serverEnvironmentRoot, { recursive: true, force: true })
  }
  const realmWire = realm => ({
    realm,
    dependencyLockClosureSha256: builds[realm].dependencyLockClosureSha256,
    transformedSourceClosureSha256: builds[realm].transformedSourceClosureSha256,
    firstBuildArtifactSha256: builds[realm].firstBuildArtifactSha256,
    secondBuildArtifactSha256: builds[realm].secondBuildArtifactSha256,
    programArtifactSha256: builds[realm].programArtifactSha256,
    programHashAlgorithm: 'keccak-256',
    programKeccak256: builds[realm].programKeccak256,
    rawModuleDefV10ResponseBase64url: Buffer.from(schemas[realm]).toString('base64url'),
  })
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-result-v1',
    toolchainManifestBase64url: Buffer.from(manifest).toString('base64url'),
    toolchainManifestSha256: plan.toolchain.manifestSha256,
    realms: { g001: realmWire('g001'), g002: realmWire('g002'), ptr: realmWire('ptr') },
  })}\n`)
}

function isDirectExecution() {
  try {
    return process.argv[1] !== undefined
      && pathToFileURL(process.argv[1]).href === import.meta.url
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  try {
    await main()
  } catch {
    process.exitCode = 1
  }
}
