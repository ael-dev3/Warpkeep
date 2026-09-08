import { types } from 'node:util'

import {
  executeFixedWslFixturePlan,
  preflightFixedWslHostAndGuest,
} from './release-recovery-fixture-host.mjs'

const LOWER_HEX_40 = /^[0-9a-f]{40}$/u
const LOWER_HEX_64 = /^[0-9a-f]{64}$/u

const G001_PLAN_KEYS = Object.freeze([
  'realm',
  'sourceAuthority',
  'baselineCommit',
  'baselineTree',
  'baselineSpacetimeTree',
  'freezePreparationCommit',
  'freezePreparationTree',
  'freezePreparationSourceSha256',
  'materializerSha256',
  'freezeReleaseNonce',
  'modulePath',
  'nodeVersion',
])
const AUTHENTICATED_PLAN_KEYS = Object.freeze([
  'realm',
  'sourceAuthority',
  'receiptSha256',
  'databaseIdentity',
  'sourceCommit',
  'sourceTree',
  'publishedModuleSha256',
  'historicalDependencyClosureSha256',
  'modulePath',
  'nodeVersion',
])
const REALM_RESULT_KEYS = Object.freeze([
  'realm',
  'historicalDependencyClosureSha256',
  'linuxSourceDependencyClosureSha256',
  'linuxCacheClosureSha256',
  'transformedSourceClosureSha256',
  'firstBuildArtifactSha256',
  'secondBuildArtifactSha256',
  'programArtifactSha256',
  'programHashAlgorithm',
  'programKeccak256',
  'rawModuleDefV10ResponseBytes',
])

export const WSL_EXECUTION_POLICY = Object.freeze({
  executable: String.raw`C:\Windows\System32\wsl.exe`,
  executableBytes: 274_432,
  executableFileVersion: '10.0.26100.8737',
  executableProductVersion: '10.0.26100.8737',
  executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
  wslVersion: '2.7.11.0',
  distribution: 'WarpkeepRunner',
  guestOsReleaseBytes: 400,
  guestOsReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
  guestKernelRelease: '6.18.33.2-microsoft-standard-WSL2\n',
  guestKernelReleaseBytes: 34,
  guestKernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
  gitExecutable: '/usr/bin/git',
  gitVersion: 'git version 2.43.0',
  gitPackageVersion: '1:2.43.0-1ubuntu7.3',
  gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
  unshare: Object.freeze(['/usr/bin/unshare', '--user', '--map-root-user', '--net']),
  unsharePackageVersion: '2.39.3-9ubuntu6.6',
  unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
  loopbackTool: '/usr/sbin/ip',
  loopbackPackageVersion: '6.1.0-1ubuntu6.2',
  loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0',
  network: 'loopback-only',
  buildsPerRealm: 2,
  offlineAfterBootstrap: true,
})

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

function nonzeroHex(value, expression) {
  if (typeof value !== 'string' || !expression.test(value) || /^0+$/u.test(value)) fail()
  return value
}

function validateAuthenticatedPlan(value, realm, modulePath) {
  const plan = exactDataObject(value, AUTHENTICATED_PLAN_KEYS)
  if (
    plan.realm !== realm
    || plan.sourceAuthority !== 'authenticated-publish-receipt-v1'
    || plan.modulePath !== modulePath
    || plan.nodeVersion !== '22.22.3'
  ) fail()
  nonzeroHex(plan.receiptSha256, LOWER_HEX_64)
  nonzeroHex(plan.databaseIdentity, LOWER_HEX_64)
  nonzeroHex(plan.sourceCommit, LOWER_HEX_40)
  nonzeroHex(plan.sourceTree, LOWER_HEX_40)
  nonzeroHex(plan.publishedModuleSha256, LOWER_HEX_64)
  nonzeroHex(plan.historicalDependencyClosureSha256, LOWER_HEX_64)
}

export function validateWslFixturePlan(value) {
  try {
    const plan = exactDataObject(value, [
      'schemaVersion',
      'profile',
      'recoveryBuildProfile',
      'toolchain',
      'realms',
    ])
    if (
      plan.schemaVersion !== 1
      || plan.profile !== 'warpkeep-release-recovery-wsl-fixture-plan-v1'
      || plan.recoveryBuildProfile
        !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
    ) fail()
    const toolchain = exactDataObject(plan.toolchain, [
      'sourcePolicySha256',
      'manifestSha256',
      'cacheCatalogSha256',
      'cacheClosureSha256',
      'platform',
      'architecture',
      'offlineReady',
      'signaturesVerified',
      'bootstrapProgramBytes',
      'bootstrapProgramSha256',
      'materializerProgramBytes',
      'materializerProgramSha256',
    ])
    nonzeroHex(toolchain.sourcePolicySha256, LOWER_HEX_64)
    nonzeroHex(toolchain.manifestSha256, LOWER_HEX_64)
    nonzeroHex(toolchain.cacheCatalogSha256, LOWER_HEX_64)
    nonzeroHex(toolchain.cacheClosureSha256, LOWER_HEX_64)
    nonzeroHex(toolchain.bootstrapProgramSha256, LOWER_HEX_64)
    nonzeroHex(toolchain.materializerProgramSha256, LOWER_HEX_64)
    if (
      toolchain.platform !== 'linux'
      || toolchain.architecture !== 'x64'
      || toolchain.offlineReady !== true
      || toolchain.signaturesVerified !== true
      || !Number.isSafeInteger(toolchain.bootstrapProgramBytes)
      || toolchain.bootstrapProgramBytes < 1
      || toolchain.bootstrapProgramBytes > 16 * 1024 * 1024
      || !Number.isSafeInteger(toolchain.materializerProgramBytes)
      || toolchain.materializerProgramBytes < 1
      || toolchain.materializerProgramBytes > 16 * 1024 * 1024
    ) fail()
    const realms = exactDataObject(plan.realms, ['g001', 'g002', 'ptr'])
    const g001 = exactDataObject(realms.g001, G001_PLAN_KEYS)
    if (
      g001.realm !== 'g001'
      || g001.sourceAuthority !== 'fixed-g001-frozen-materializer-v1'
      || g001.modulePath !== 'spacetimedb'
      || g001.nodeVersion !== '24.19.0'
    ) fail()
    nonzeroHex(g001.baselineCommit, LOWER_HEX_40)
    nonzeroHex(g001.baselineTree, LOWER_HEX_40)
    nonzeroHex(g001.baselineSpacetimeTree, LOWER_HEX_40)
    nonzeroHex(g001.freezePreparationCommit, LOWER_HEX_40)
    nonzeroHex(g001.freezePreparationTree, LOWER_HEX_40)
    nonzeroHex(g001.freezePreparationSourceSha256, LOWER_HEX_64)
    nonzeroHex(g001.materializerSha256, LOWER_HEX_64)
    nonzeroHex(g001.freezeReleaseNonce, LOWER_HEX_64)
    validateAuthenticatedPlan(realms.g002, 'g002', 'spacetimedb/genesis002')
    validateAuthenticatedPlan(realms.ptr, 'ptr', 'spacetimedb/ptr')
    return value
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

function validateRealmResult(value, realm) {
  const result = exactDataObject(value, REALM_RESULT_KEYS)
  if (result.realm !== realm) fail()
  if (realm === 'g001') {
    if (result.historicalDependencyClosureSha256 !== null) fail()
  } else {
    nonzeroHex(result.historicalDependencyClosureSha256, LOWER_HEX_64)
  }
  nonzeroHex(result.linuxSourceDependencyClosureSha256, LOWER_HEX_64)
  nonzeroHex(result.linuxCacheClosureSha256, LOWER_HEX_64)
  if (realm === 'g001') {
    nonzeroHex(result.transformedSourceClosureSha256, LOWER_HEX_64)
  } else if (result.transformedSourceClosureSha256 !== null) {
    fail()
  }
  nonzeroHex(result.firstBuildArtifactSha256, LOWER_HEX_64)
  nonzeroHex(result.secondBuildArtifactSha256, LOWER_HEX_64)
  nonzeroHex(result.programArtifactSha256, LOWER_HEX_64)
  if (
    result.firstBuildArtifactSha256 !== result.secondBuildArtifactSha256
    || result.firstBuildArtifactSha256 !== result.programArtifactSha256
    || result.programHashAlgorithm !== 'keccak-256'
  ) fail()
  nonzeroHex(result.programKeccak256, LOWER_HEX_64)
  if (
    !(result.rawModuleDefV10ResponseBytes instanceof Uint8Array)
    || result.rawModuleDefV10ResponseBytes.byteLength === 0
    || result.rawModuleDefV10ResponseBytes.byteLength > 2 * 1024 * 1024
  ) fail()
}

export function validateWslFixtureResult(value) {
  try {
    const result = exactDataObject(value, [
      'schemaVersion',
      'profile',
      'toolchainManifestBytes',
      'toolchainManifestSha256',
      'realms',
    ])
    if (
      result.schemaVersion !== 1
      || result.profile !== 'warpkeep-release-recovery-wsl-fixture-result-v1'
      || !(result.toolchainManifestBytes instanceof Uint8Array)
      || result.toolchainManifestBytes.byteLength === 0
      || result.toolchainManifestBytes.byteLength > 512 * 1024
    ) fail()
    nonzeroHex(result.toolchainManifestSha256, LOWER_HEX_64)
    const realms = exactDataObject(result.realms, ['g001', 'g002', 'ptr'])
    validateRealmResult(realms.g001, 'g001')
    validateRealmResult(realms.g002, 'g002')
    validateRealmResult(realms.ptr, 'ptr')
    return value
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

export async function runReleaseRecoverySpacetimeFixturesWsl(input) {
  try {
    const options = exactDataObject(input, ['plan'])
    validateWslFixturePlan(options.plan)
    const platform = await preflightFixedWslHostAndGuest({ policy: WSL_EXECUTION_POLICY })
    const result = await executeFixedWslFixturePlan({
      policy: WSL_EXECUTION_POLICY,
      platform,
      plan: options.plan,
    })
    validateWslFixtureResult(result)
    return result
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}
