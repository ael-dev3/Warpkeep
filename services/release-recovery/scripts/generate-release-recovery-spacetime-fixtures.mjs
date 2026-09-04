import {
  createHash,
  createPublicKey,
  timingSafeEqual,
} from 'node:crypto'
import { isAbsolute, posix, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'
import { types } from 'node:util'

import { parseAndNormalizeRawModuleDefV10 } from '../src/rawModuleDefV10.ts'
import { validateSpacetimeProgramPins } from '../src/spacetimeProgramPins.ts'
import {
  runReleaseRecoverySpacetimeFixturesWsl,
  validateWslFixturePlan,
  validateWslFixtureResult,
} from './run-release-recovery-spacetime-fixtures-wsl.mjs'
import {
  beginFixedFixtureOutputTransaction,
  closeFixedPrivateRoot,
  openFixedPrivateRoot,
  readFixedFixtureOutput,
  readFixedPrivateRecord,
  recoverFixedFixtureOutputs,
  verifyFixedPublishReceipt,
  verifyFixedToolchainAttestation,
} from './release-recovery-fixture-host.mjs'

const decoder = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()
const LOWER_HEX_40 = /^[0-9a-f]{40}$/u
const LOWER_HEX_64 = /^[0-9a-f]{64}$/u
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/u
const POSITIVE_DECIMAL = /^[1-9][0-9]{0,15}$/u

export const FIXED_PRIVATE_ROOT = String.raw`C:\Users\heyas\.warpkeep\private\release-recovery-v1`

const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G001_BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
const G001_BASELINE_TREE = '90deebb5faf4129282f5c35999244f540001b27d'
const G001_BASELINE_SPACETIME_TREE = 'ab450fd2b3dcdd3ed67ef1f0431e18ae507382ac'
const G001_BASELINE_ABI_SHA256 =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03'
const G001_FREEZE_PREPARATION_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123'
const G001_FREEZE_PREPARATION_TREE = '8c2b0b0eda17cefc212f08716a287c44b0e84d48'
const G001_FREEZE_PREPARATION_SOURCE_SHA256 =
  '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251'
const G001_MATERIALIZER_SHA256 =
  'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93'
const G001_FREEZE_RELEASE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'

export const FIXED_PRIVATE_RECORD_PATHS = Object.freeze({
  marker: 'recovery-bootstrap-marker.json',
  rpcSecret: 'recovery-rpc-secret.txt',
  censusPepper: 'recovery-census-pepper.txt',
  canaryFid: 'player-canary-owner-fid.txt',
  authBridgePublicJwk: 'auth-bridge-signing-public.jwk.json',
  toolchainAttestation: 'fixture-materialization/wsl-toolchain-attestation-v1.json',
  g002Receipt: 'activation-evidence/records/g002-publish-receipt.json',
  g002ImportReceipt: 'activation-evidence/records/g002-atlas-import-receipt.json',
  g002LiveReceipt: 'activation-evidence/records/g002-sealed-live-receipt.json',
  ptrReceipt: 'activation-evidence/records/ptr-publish-receipt.json',
  ptrImportReceipt: 'activation-evidence/records/ptr-atlas-import-receipt.json',
  ptrOwnerReceipt: 'activation-evidence/records/ptr-owner-provision-receipt.json',
  ptrLiveReceipt: 'activation-evidence/records/ptr-sealed-live-receipt.json',
})

export const FIXTURE_OUTPUT_PATHS = Object.freeze({
  toolchain: 'services/release-recovery/fixtures/toolchains/linux-x64.json',
  g001: 'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json',
  g002: 'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json',
  ptr: 'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json',
  manifest: 'services/release-recovery/fixtures/spacetime/manifest.json',
})

const PRIVATE_MAXIMUM_BYTES = Object.freeze({
  [FIXED_PRIVATE_RECORD_PATHS.marker]: 256,
  [FIXED_PRIVATE_RECORD_PATHS.rpcSecret]: 44,
  [FIXED_PRIVATE_RECORD_PATHS.censusPepper]: 44,
  [FIXED_PRIVATE_RECORD_PATHS.canaryFid]: 17,
  [FIXED_PRIVATE_RECORD_PATHS.authBridgePublicJwk]: 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.g002Receipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.g002ImportReceipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.g002LiveReceipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.ptrReceipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.ptrImportReceipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.ptrOwnerReceipt]: 256 * 1_024,
  [FIXED_PRIVATE_RECORD_PATHS.ptrLiveReceipt]: 256 * 1_024,
})

const OUTPUT_MAXIMUM_BYTES = Object.freeze({
  [FIXTURE_OUTPUT_PATHS.toolchain]: 512 * 1_024,
  [FIXTURE_OUTPUT_PATHS.g001]: 2 * 1_024 * 1_024,
  [FIXTURE_OUTPUT_PATHS.g002]: 2 * 1_024 * 1_024,
  [FIXTURE_OUTPUT_PATHS.ptr]: 2 * 1_024 * 1_024,
  [FIXTURE_OUTPUT_PATHS.manifest]: 128 * 1_024,
})

const RECEIPT_AUTHENTICATION_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'realm',
  'authenticationProfile',
  'receiptSha256',
  'databaseIdentity',
  'sourceCommit',
  'sourceTree',
  'publishedModuleSha256',
  'dependencyLockClosureSha256',
  'signatureVerified',
  'matchingImportReceiptVerified',
  'matchingLiveReceiptVerified',
])

export class RecoveryFixtureInputError extends Error {
  constructor() {
    super('RECOVERY_FIXTURE_INPUT_INVALID')
    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: 'RecoveryFixtureInputError',
      writable: true,
    })
    Object.defineProperty(this, 'code', {
      configurable: false,
      enumerable: true,
      value: 'RECOVERY_FIXTURE_INPUT_INVALID',
      writable: false,
    })
    delete this.stack
  }
}

function fail() {
  throw new RecoveryFixtureInputError()
}

function exactDataObject(value, expectedKeys) {
  if (
    types.isProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Reflect.ownKeys(descriptors)
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) fail()
  const snapshot = Object.create(null)
  for (const key of expectedKeys) {
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value')
    ) fail()
    snapshot[key] = descriptor.value
  }
  return snapshot
}

function exactOrderedRecord(value, expectedKeys) {
  const record = exactDataObject(value, expectedKeys)
  if (JSON.stringify(Reflect.ownKeys(value)) !== JSON.stringify(expectedKeys)) fail()
  return record
}

function absoluteHostPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 32_767
    && !/[\0\r\n]/u.test(value)
    && (isAbsolute(value) || win32.isAbsolute(value) || posix.isAbsolute(value))
}

function hostPathModule(...values) {
  return values.some(value => typeof value === 'string' && win32.isAbsolute(value))
    ? win32
    : posix
}

function samePath(left, right) {
  const paths = hostPathModule(left, right)
  const normalize = value => {
    const normalized = paths.normalize(value)
    return paths === win32 ? normalized.toLowerCase() : normalized
  }
  return normalize(left) === normalize(right)
}

function expectedPrivatePath(canonicalRoot, relativePath) {
  const paths = hostPathModule(canonicalRoot)
  const components = relativePath.split('/')
  if (
    components.length === 0
    || components.some(component => component.length === 0 || component === '.' || component === '..')
  ) fail()
  return paths.join(canonicalRoot, ...components)
}

function nonzeroHex(value, expression) {
  if (typeof value !== 'string' || !expression.test(value) || /^0+$/u.test(value)) fail()
  return value
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function equalBytes(left, right) {
  return left.byteLength === right.byteLength
    && timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

function framedSha256(domain, bytes) {
  const domainBytes = encoder.encode(`warpkeep-recovery-v1:${domain}:`)
  const length = Buffer.alloc(12)
  length.writeUInt32BE(domainBytes.byteLength, 0)
  length.writeBigUInt64BE(BigInt(bytes.byteLength), 4)
  return createHash('sha256')
    .update(length.subarray(0, 4))
    .update(domainBytes)
    .update(length.subarray(4))
    .update(bytes)
    .digest('hex')
}

function parseCanonicalJson(bytes, maximumBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maximumBytes) fail()
  try {
    const text = decoder.decode(bytes)
    const value = JSON.parse(text)
    if (text !== `${JSON.stringify(value)}\n`) fail()
    return value
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

function decodeSecret(bytes) {
  let decoded
  try {
    const text = decoder.decode(bytes)
    if (!BASE64URL_32.test(text.slice(0, -1)) || text.at(-1) !== '\n') fail()
    const wire = text.slice(0, -1)
    decoded = Buffer.from(wire, 'base64url')
    if (decoded.byteLength !== 32 || decoded.toString('base64url') !== wire) fail()
    return Buffer.from(decoded)
  } finally {
    decoded?.fill(0)
  }
}

function validateBootstrapRecords(records) {
  const marker = exactOrderedRecord(
    parseCanonicalJson(records.get(FIXED_PRIVATE_RECORD_PATHS.marker), 256),
    ['schemaVersion', 'profile', 'keyId', 'enabled'],
  )
  if (
    marker.schemaVersion !== 1
    || marker.profile !== 'warpkeep-0.4.0-recovery-bootstrap-v1'
    || marker.keyId !== 'warpkeep-0.4.0-recovery-2026-09-03-1'
    || marker.enabled !== false
  ) fail()

  const rpc = decodeSecret(records.get(FIXED_PRIVATE_RECORD_PATHS.rpcSecret))
  const census = decodeSecret(records.get(FIXED_PRIVATE_RECORD_PATHS.censusPepper))
  try {
    if (timingSafeEqual(rpc, census)) fail()
  } finally {
    rpc.fill(0)
    census.fill(0)
  }

  const fidText = decoder.decode(records.get(FIXED_PRIVATE_RECORD_PATHS.canaryFid))
  if (fidText.at(-1) !== '\n' || !POSITIVE_DECIMAL.test(fidText.slice(0, -1))) fail()
  const fid = Number(fidText.slice(0, -1))
  if (!Number.isSafeInteger(fid) || fid <= 0 || String(fid) !== fidText.slice(0, -1)) fail()

  const publicJwk = exactOrderedRecord(
    parseCanonicalJson(records.get(FIXED_PRIVATE_RECORD_PATHS.authBridgePublicJwk), 1_024),
    ['kty', 'crv', 'x', 'y'],
  )
  if (
    publicJwk.kty !== 'EC'
    || publicJwk.crv !== 'P-256'
    || !BASE64URL_32.test(publicJwk.x)
    || !BASE64URL_32.test(publicJwk.y)
  ) fail()
  try {
    const imported = createPublicKey({ key: publicJwk, format: 'jwk' }).export({ format: 'jwk' })
    if (
      imported.kty !== publicJwk.kty
      || imported.crv !== publicJwk.crv
      || imported.x !== publicJwk.x
      || imported.y !== publicJwk.y
    ) fail()
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

function validateRootHandle(value, requestedPath) {
  const root = exactDataObject(value, [
    'canonicalPath',
    'directory',
    'reparsePoint',
    'ownerOnly',
    'mode',
    'descriptorVerified',
  ])
  if (
    !absoluteHostPath(root.canonicalPath)
    || !samePath(root.canonicalPath, requestedPath)
    || root.directory !== true
    || root.reparsePoint !== false
    || root.ownerOnly !== true
    || root.mode !== 0o700
    || root.descriptorVerified !== true
  ) fail()
  return value
}

function validatePrivateFile(value, root, relativePath, maximumBytes) {
  const file = exactDataObject(value, [
    'canonicalPath',
    'regularFile',
    'reparsePoint',
    'ownerOnly',
    'mode',
    'descriptorVerified',
    'bytes',
  ])
  if (
    !samePath(file.canonicalPath, expectedPrivatePath(root.canonicalPath, relativePath))
    || file.regularFile !== true
    || file.reparsePoint !== false
    || file.ownerOnly !== true
    || file.mode !== 0o600
    || file.descriptorVerified !== true
    || !(file.bytes instanceof Uint8Array)
    || file.bytes.byteLength === 0
    || file.bytes.byteLength > maximumBytes
  ) fail()
  return file.bytes
}

async function readPrivateRecords(host, root) {
  const records = new Map()
  for (const relativePath of Object.values(FIXED_PRIVATE_RECORD_PATHS)) {
    const maximumBytes = PRIVATE_MAXIMUM_BYTES[relativePath]
    const file = await host.read(root, relativePath, maximumBytes)
    records.set(relativePath, validatePrivateFile(file, root, relativePath, maximumBytes))
  }
  return records
}

function validateAuthenticatedReceipt(value, realm, bytes) {
  const receipt = exactDataObject(value, RECEIPT_AUTHENTICATION_KEYS)
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep-release-recovery-authenticated-publish-source-v1'
    || receipt.realm !== realm
    || receipt.authenticationProfile !== 'producer-local-receipt-authentication-v1'
    || receipt.receiptSha256 !== sha256(bytes)
    || receipt.signatureVerified !== true
    || receipt.matchingImportReceiptVerified !== true
    || receipt.matchingLiveReceiptVerified !== true
  ) fail()
  nonzeroHex(receipt.receiptSha256, LOWER_HEX_64)
  nonzeroHex(receipt.databaseIdentity, LOWER_HEX_64)
  nonzeroHex(receipt.sourceCommit, LOWER_HEX_40)
  nonzeroHex(receipt.sourceTree, LOWER_HEX_40)
  nonzeroHex(receipt.publishedModuleSha256, LOWER_HEX_64)
  nonzeroHex(receipt.dependencyLockClosureSha256, LOWER_HEX_64)
  return Object.freeze({
    receiptSha256: receipt.receiptSha256,
    databaseIdentity: receipt.databaseIdentity,
    sourceCommit: receipt.sourceCommit,
    sourceTree: receipt.sourceTree,
    publishedModuleSha256: receipt.publishedModuleSha256,
    dependencyLockClosureSha256: receipt.dependencyLockClosureSha256,
  })
}

async function authenticateReceipt(verifier, realm, path, bytes, records) {
  const verifierBytes = bytes.slice()
  const corroboratingReceipts = realm === 'g002'
    ? Object.freeze({
        importBytes: records.get(FIXED_PRIVATE_RECORD_PATHS.g002ImportReceipt).slice(),
        liveBytes: records.get(FIXED_PRIVATE_RECORD_PATHS.g002LiveReceipt).slice(),
      })
    : Object.freeze({
        importBytes: records.get(FIXED_PRIVATE_RECORD_PATHS.ptrImportReceipt).slice(),
        ownerBytes: records.get(FIXED_PRIVATE_RECORD_PATHS.ptrOwnerReceipt).slice(),
        liveBytes: records.get(FIXED_PRIVATE_RECORD_PATHS.ptrLiveReceipt).slice(),
      })
  try {
    return await verifier({
      realm,
      path,
      bytes: verifierBytes,
      receiptSha256: sha256(bytes),
      corroboratingReceipts,
    })
  } finally {
    verifierBytes.fill(0)
    for (const corroboratingBytes of Object.values(corroboratingReceipts)) {
      corroboratingBytes.fill(0)
    }
  }
}

function validateToolchainAttestation(value, bytes) {
  const attestation = exactDataObject(value, [
    'schemaVersion',
    'profile',
    'platform',
    'architecture',
    'offlineReady',
    'signaturesVerified',
    'attestationSha256',
    'toolchainManifestSha256',
    'cacheCatalogSha256',
    'bootstrapProgramBytes',
    'bootstrapProgramSha256',
    'materializerProgramBytes',
    'materializerProgramSha256',
  ])
  if (
    attestation.schemaVersion !== 1
    || attestation.profile !== 'warpkeep-release-recovery-wsl-toolchain-attestation-v1'
    || attestation.platform !== 'linux'
    || attestation.architecture !== 'x64'
    || attestation.offlineReady !== true
    || attestation.signaturesVerified !== true
    || attestation.attestationSha256 !== sha256(bytes)
    || !Number.isSafeInteger(attestation.bootstrapProgramBytes)
    || attestation.bootstrapProgramBytes < 1
    || attestation.bootstrapProgramBytes > 16 * 1024 * 1024
    || !Number.isSafeInteger(attestation.materializerProgramBytes)
    || attestation.materializerProgramBytes < 1
    || attestation.materializerProgramBytes > 16 * 1024 * 1024
  ) fail()
  nonzeroHex(attestation.toolchainManifestSha256, LOWER_HEX_64)
  nonzeroHex(attestation.cacheCatalogSha256, LOWER_HEX_64)
  nonzeroHex(attestation.bootstrapProgramSha256, LOWER_HEX_64)
  nonzeroHex(attestation.materializerProgramSha256, LOWER_HEX_64)
  return Object.freeze({
    manifestSha256: attestation.toolchainManifestSha256,
    cacheCatalogSha256: attestation.cacheCatalogSha256,
    bootstrapProgramBytes: attestation.bootstrapProgramBytes,
    bootstrapProgramSha256: attestation.bootstrapProgramSha256,
    materializerProgramBytes: attestation.materializerProgramBytes,
    materializerProgramSha256: attestation.materializerProgramSha256,
  })
}

async function authenticateToolchain(verifier, path, bytes) {
  const verifierBytes = bytes.slice()
  try {
    return await verifier({
      path,
      bytes: verifierBytes,
      attestationSha256: sha256(bytes),
    })
  } finally {
    verifierBytes.fill(0)
  }
}

function createPlan(toolchain, g002, ptr) {
  const plan = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-plan-v1',
    recoveryBuildProfile: 'warpkeep-release-recovery-cross-platform-program-build-v1',
    toolchain: Object.freeze({
      manifestSha256: toolchain.manifestSha256,
      cacheCatalogSha256: toolchain.cacheCatalogSha256,
      platform: 'linux',
      architecture: 'x64',
      offlineReady: true,
      signaturesVerified: true,
      materializerProgramBytes: toolchain.materializerProgramBytes,
      materializerProgramSha256: toolchain.materializerProgramSha256,
    }),
    realms: Object.freeze({
      g001: Object.freeze({
        realm: 'g001',
        sourceAuthority: 'fixed-g001-frozen-materializer-v1',
        baselineCommit: G001_BASELINE_COMMIT,
        baselineTree: G001_BASELINE_TREE,
        baselineSpacetimeTree: G001_BASELINE_SPACETIME_TREE,
        freezePreparationCommit: G001_FREEZE_PREPARATION_COMMIT,
        freezePreparationTree: G001_FREEZE_PREPARATION_TREE,
        freezePreparationSourceSha256: G001_FREEZE_PREPARATION_SOURCE_SHA256,
        materializerSha256: G001_MATERIALIZER_SHA256,
        freezeReleaseNonce: G001_FREEZE_RELEASE_NONCE,
        modulePath: 'spacetimedb',
        nodeVersion: '24.19.0',
      }),
      g002: Object.freeze({
        realm: 'g002',
        sourceAuthority: 'authenticated-publish-receipt-v1',
        receiptSha256: g002.receiptSha256,
        databaseIdentity: g002.databaseIdentity,
        sourceCommit: g002.sourceCommit,
        sourceTree: g002.sourceTree,
        publishedModuleSha256: g002.publishedModuleSha256,
        dependencyLockClosureSha256: g002.dependencyLockClosureSha256,
        modulePath: 'spacetimedb/genesis002',
        nodeVersion: '22.22.3',
      }),
      ptr: Object.freeze({
        realm: 'ptr',
        sourceAuthority: 'authenticated-publish-receipt-v1',
        receiptSha256: ptr.receiptSha256,
        databaseIdentity: ptr.databaseIdentity,
        sourceCommit: ptr.sourceCommit,
        sourceTree: ptr.sourceTree,
        publishedModuleSha256: ptr.publishedModuleSha256,
        dependencyLockClosureSha256: ptr.dependencyLockClosureSha256,
        modulePath: 'spacetimedb/ptr',
        nodeVersion: '22.22.3',
      }),
    }),
  })
  validateWslFixturePlan(plan)
  return plan
}

function validateToolchainManifest(bytes) {
  const manifest = exactOrderedRecord(parseCanonicalJson(bytes, 512 * 1_024), [
    'schemaVersion',
    'profile',
    'platform',
    'architecture',
    'nodeVersions',
    'pnpmVersion',
    'spacetimeVersion',
    'gitPackageVersion',
    'wslVersion',
  ])
  if (
    manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1'
    || manifest.platform !== 'linux'
    || manifest.architecture !== 'x64'
    || JSON.stringify(manifest.nodeVersions) !== JSON.stringify(['24.19.0', '22.22.3'])
    || manifest.pnpmVersion !== '11.7.0'
    || manifest.spacetimeVersion !== '2.6.1'
    || manifest.gitPackageVersion !== '1:2.43.0-1ubuntu7.3'
    || manifest.wslVersion !== '2.7.11.0'
  ) fail()
}

function normalizeRunnerResult(value, plan) {
  validateWslFixtureResult(value)
  if (
    value.toolchainManifestSha256 !== plan.toolchain.manifestSha256
    || sha256(value.toolchainManifestBytes) !== value.toolchainManifestSha256
  ) fail()
  validateToolchainManifest(value.toolchainManifestBytes)
  const fixtureBytes = {}
  const abiDigests = {}
  const responseDigests = {}
  for (const realm of ['g001', 'g002', 'ptr']) {
    const result = value.realms[realm]
    const normalized = parseAndNormalizeRawModuleDefV10(result.rawModuleDefV10ResponseBytes)
    fixtureBytes[realm] = normalized.canonicalBytes()
    abiDigests[realm] = framedSha256(
      `warpkeep.release-recovery.spacetimedb-abi.${realm}.raw-module-def-v10.v1\n`,
      fixtureBytes[realm],
    )
    responseDigests[realm] = framedSha256(
      `warpkeep.release-recovery.spacetimedb-schema-response.${realm}.raw-module-def-v10.v1\n`,
      result.rawModuleDefV10ResponseBytes,
    )
  }
  if (
    value.realms.g002.dependencyLockClosureSha256
      !== plan.realms.g002.dependencyLockClosureSha256
    || value.realms.ptr.dependencyLockClosureSha256
      !== plan.realms.ptr.dependencyLockClosureSha256
    || value.realms.g002.programArtifactSha256 !== plan.realms.g002.publishedModuleSha256
    || value.realms.ptr.programArtifactSha256 !== plan.realms.ptr.publishedModuleSha256
  ) fail()

  const common = (realm, databaseIdentity, modulePath, nodeVersion) => ({
    realm,
    databaseIdentity,
    recoveryBuildProfile: 'warpkeep-release-recovery-cross-platform-program-build-v1',
    modulePath,
    dependencyLockClosureSha256: value.realms[realm].dependencyLockClosureSha256,
    toolchainManifestPath: FIXTURE_OUTPUT_PATHS.toolchain,
    toolchainManifestSha256: value.toolchainManifestSha256,
    nodeVersion,
    spacetimeVersion: '2.6.1',
    gitPackageVersion: '1:2.43.0-1ubuntu7.3',
    wslVersion: '2.7.11.0',
    firstBuildArtifactSha256: value.realms[realm].firstBuildArtifactSha256,
    secondBuildArtifactSha256: value.realms[realm].secondBuildArtifactSha256,
    programArtifactSha256: value.realms[realm].programArtifactSha256,
    programHashAlgorithm: 'keccak-256',
    programKeccak256: value.realms[realm].programKeccak256,
    deployedAbiV10Sha256: abiDigests[realm],
    rawModuleDefV10ResponseSha256: responseDigests[realm],
    rawModuleDefV10FixturePath: FIXTURE_OUTPUT_PATHS[realm],
  })
  const g001 = common('g001', G001_DATABASE_IDENTITY, 'spacetimedb', '24.19.0')
  const g002 = common('g002', plan.realms.g002.databaseIdentity, 'spacetimedb/genesis002', '22.22.3')
  const ptr = common('ptr', plan.realms.ptr.databaseIdentity, 'spacetimedb/ptr', '22.22.3')
  const manifest = {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-spacetime-program-pins-v1',
    realms: {
      g001: {
        realm: g001.realm,
        databaseIdentity: g001.databaseIdentity,
        recoveryBuildProfile: g001.recoveryBuildProfile,
        g001BaselineCommit: G001_BASELINE_COMMIT,
        g001BaselineTree: G001_BASELINE_TREE,
        g001BaselineSpacetimeTree: G001_BASELINE_SPACETIME_TREE,
        g001BaselineAbiSha256: G001_BASELINE_ABI_SHA256,
        g001FreezePreparationCommit: G001_FREEZE_PREPARATION_COMMIT,
        g001FreezePreparationTree: G001_FREEZE_PREPARATION_TREE,
        g001FreezePreparationSourceSha256: G001_FREEZE_PREPARATION_SOURCE_SHA256,
        g001MaterializerSha256: G001_MATERIALIZER_SHA256,
        g001FreezeReleaseNonce: G001_FREEZE_RELEASE_NONCE,
        g001TransformedFrozenSourceClosureSha256:
          value.realms.g001.transformedSourceClosureSha256,
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
        g002SourceCommit: plan.realms.g002.sourceCommit,
        g002SourceTree: plan.realms.g002.sourceTree,
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
        ptrSourceCommit: plan.realms.ptr.sourceCommit,
        ptrSourceTree: plan.realms.ptr.sourceTree,
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
  }
  validateSpacetimeProgramPins(manifest)
  return Object.freeze({
    [FIXTURE_OUTPUT_PATHS.toolchain]: value.toolchainManifestBytes.slice(),
    [FIXTURE_OUTPUT_PATHS.g001]: fixtureBytes.g001,
    [FIXTURE_OUTPUT_PATHS.g002]: fixtureBytes.g002,
    [FIXTURE_OUTPUT_PATHS.ptr]: fixtureBytes.ptr,
    [FIXTURE_OUTPUT_PATHS.manifest]: encoder.encode(`${JSON.stringify(manifest)}\n`),
  })
}

const FIXED_PRIVATE_HOST = Object.freeze({
  privateRoot: Object.freeze({
    open: openFixedPrivateRoot,
    read: readFixedPrivateRecord,
    close: closeFixedPrivateRoot,
  }),
  verifyReceipt: verifyFixedPublishReceipt,
  verifyToolchain: verifyFixedToolchainAttestation,
})

const FIXED_OUTPUTS = Object.freeze({
  read: readFixedFixtureOutput,
  recover: recoverFixedFixtureOutputs,
  begin: beginFixedFixtureOutputTransaction,
})

async function readOutputSnapshot(outputs) {
  const snapshot = new Map()
  for (const path of Object.values(FIXTURE_OUTPUT_PATHS)) {
    const bytes = await outputs.read(path)
    if (
      !(bytes instanceof Uint8Array)
      || bytes.byteLength === 0
      || bytes.byteLength > OUTPUT_MAXIMUM_BYTES[path]
    ) fail()
    snapshot.set(path, bytes.slice())
  }
  return snapshot
}

function assertOutputMatches(snapshot, generated) {
  for (const path of Object.values(FIXTURE_OUTPUT_PATHS)) {
    const actual = snapshot.get(path)
    const expected = generated[path]
    if (actual === undefined || expected === undefined || !equalBytes(actual, expected)) fail()
  }
}

async function installAtomically(outputs, generated) {
  await outputs.recover()
  const paths = Object.values(FIXTURE_OUTPUT_PATHS)
  let transaction
  try {
    transaction = exactDataObject(await outputs.begin(paths), ['stage', 'commit', 'rollback'])
    if (
      typeof transaction.stage !== 'function'
      || typeof transaction.commit !== 'function'
      || typeof transaction.rollback !== 'function'
    ) fail()
    for (const path of paths) await transaction.stage(path, generated[path].slice())
    await transaction.commit()
  } catch {
    if (transaction !== undefined && typeof transaction.rollback === 'function') {
      try { await transaction.rollback() } catch { /* retain the fixed error */ }
    }
    fail()
  }
}

export function parseGeneratorArguments(argv) {
  try {
    if (types.isProxy(argv) || !Array.isArray(argv)) fail()
    let privateRoot
    let mode
    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index]
      if (argument === '--check' || argument === '--write') {
        if (mode !== undefined) fail()
        mode = argument.slice(2)
      } else if (argument === '--private-root') {
        if (privateRoot !== undefined || index + 1 >= argv.length) fail()
        privateRoot = argv[++index]
      } else {
        fail()
      }
    }
    if (
      (mode !== 'check' && mode !== 'write')
      || privateRoot !== FIXED_PRIVATE_ROOT
    ) fail()
    return Object.freeze({ privateRoot, mode })
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

async function preflightPrivatePrerequisites(privateRoot) {
  let rootHandle
  let records
  let rootClosed = false
  try {
    rootHandle = validateRootHandle(
      await FIXED_PRIVATE_HOST.privateRoot.open(privateRoot),
      privateRoot,
    )
    records = await readPrivateRecords(FIXED_PRIVATE_HOST.privateRoot, rootHandle)
    validateBootstrapRecords(records)

    const g002Bytes = records.get(FIXED_PRIVATE_RECORD_PATHS.g002Receipt)
    const ptrBytes = records.get(FIXED_PRIVATE_RECORD_PATHS.ptrReceipt)
    const toolchainBytes = records.get(FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation)
    const g002 = validateAuthenticatedReceipt(
      await authenticateReceipt(
        FIXED_PRIVATE_HOST.verifyReceipt,
        'g002',
        FIXED_PRIVATE_RECORD_PATHS.g002Receipt,
        g002Bytes,
        records,
      ),
      'g002',
      g002Bytes,
    )
    const ptr = validateAuthenticatedReceipt(
      await authenticateReceipt(
        FIXED_PRIVATE_HOST.verifyReceipt,
        'ptr',
        FIXED_PRIVATE_RECORD_PATHS.ptrReceipt,
        ptrBytes,
        records,
      ),
      'ptr',
      ptrBytes,
    )
    if (g002.databaseIdentity === ptr.databaseIdentity) fail()
    const toolchain = validateToolchainAttestation(
      await authenticateToolchain(
        FIXED_PRIVATE_HOST.verifyToolchain,
        FIXED_PRIVATE_RECORD_PATHS.toolchainAttestation,
        toolchainBytes,
      ),
      toolchainBytes,
    )
    await FIXED_PRIVATE_HOST.privateRoot.close(rootHandle)
    rootClosed = true
    for (const bytes of records.values()) bytes.fill(0)
    return Object.freeze({ g002, ptr, toolchain })
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  } finally {
    if (records !== undefined) {
      for (const bytes of records.values()) bytes.fill(0)
    }
    if (!rootClosed && rootHandle !== undefined) {
      try { await FIXED_PRIVATE_HOST.privateRoot.close(rootHandle) } catch { /* retain the fixed error */ }
    }
  }
}

export async function preflightFixedPrivatePrerequisites(input) {
  try {
    const options = exactDataObject(input, ['privateRoot'])
    if (options.privateRoot !== FIXED_PRIVATE_ROOT) fail()
    return await preflightPrivatePrerequisites(options.privateRoot)
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

export async function runGenerator(input) {
  try {
    const options = exactDataObject(input, ['privateRoot', 'mode'])
    if (
      options.privateRoot !== FIXED_PRIVATE_ROOT
      || (options.mode !== 'check' && options.mode !== 'write')
    ) fail()
    const prerequisites = await preflightFixedPrivatePrerequisites({
      privateRoot: options.privateRoot,
    })
    const plan = createPlan(prerequisites.toolchain, prerequisites.g002, prerequisites.ptr)
    const checkedBefore = options.mode === 'check'
      ? await readOutputSnapshot(FIXED_OUTPUTS)
      : undefined
    const result = await runReleaseRecoverySpacetimeFixturesWsl(Object.freeze({ plan }))
    const generated = normalizeRunnerResult(result, plan)

    if (options.mode === 'check') {
      assertOutputMatches(checkedBefore, generated)
      const checkedAfter = await readOutputSnapshot(FIXED_OUTPUTS)
      assertOutputMatches(checkedAfter, generated)
      return Object.freeze({ verified: true })
    }
    await installAtomically(FIXED_OUTPUTS, generated)
    return Object.freeze({ written: true })
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
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
    const options = parseGeneratorArguments(process.argv.slice(2))
    const result = await runGenerator(options)
    process.stdout.write(result.verified === true
      ? 'RECOVERY_FIXTURE_CHECK_VERIFIED\n'
      : 'RECOVERY_FIXTURE_WRITE_VERIFIED\n')
  } catch {
    process.stderr.write('RECOVERY_FIXTURE_INPUT_INVALID\n')
    process.exitCode = 1
  }
}
