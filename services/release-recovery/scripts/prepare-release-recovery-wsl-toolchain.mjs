import { pathToFileURL } from 'node:url'
import { types } from 'node:util'

import {
  FIXED_PRIVATE_ROOT,
  preflightFixedBootstrapPrerequisites,
} from './generate-release-recovery-spacetime-fixtures.mjs'
import {
  bootstrapFixedWslToolchain,
  preflightFixedPublicSourceObjectDatabase,
  preflightFixedToolchainSourcePolicy,
  preflightFixedWslHostAndGuest,
  publishFixedToolchainAttestation,
} from './release-recovery-fixture-host.mjs'
import { WSL_EXECUTION_POLICY } from './run-release-recovery-spacetime-fixtures-wsl.mjs'

const LOWER_HEX_64 = /^[0-9a-f]{64}$/u

export const TOOLCHAIN_SOURCE_POLICY_PATH =
  'services/release-recovery/scripts/release-recovery-wsl-toolchain-source-policy-v1.json'

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
  const keys = Reflect.ownKeys(descriptors)
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
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

export function parseToolchainArguments(argv) {
  try {
    if (
      types.isProxy(argv)
      || !Array.isArray(argv)
      || argv.length !== 2
      || argv[0] !== '--private-root'
    ) fail()
    if (argv[1] !== FIXED_PRIVATE_ROOT) fail()
    return Object.freeze({ privateRoot: argv[1] })
  } catch (error) {
    if (error instanceof RecoveryFixtureInputError) throw error
    fail()
  }
}

export async function prepareReleaseRecoveryWslToolchain(input) {
  try {
    const options = exactDataObject(input, ['privateRoot'])
    if (options.privateRoot !== FIXED_PRIVATE_ROOT) fail()
    const prerequisites = await preflightFixedBootstrapPrerequisites({
      privateRoot: options.privateRoot,
    })
    const sourcePolicy = await preflightFixedToolchainSourcePolicy()
    const sourceObjects = await preflightFixedPublicSourceObjectDatabase()
    const platform = await preflightFixedWslHostAndGuest({
      policy: WSL_EXECUTION_POLICY,
    })
    const resultCapability = await bootstrapFixedWslToolchain({
      platform,
      sourcePolicy,
      sourceObjects,
      sources: Object.freeze({
        g002: prerequisites.g002,
        ptr: prerequisites.ptr,
      }),
    })
    const result = exactDataObject(
      resultCapability,
      [
        'prepared',
        'sourcePolicySha256',
        'manifestSha256',
        'cacheSha256',
        'cacheClosureSha256',
        'signaturesVerified',
        'offlineReady',
        'bootstrapProgramBytes',
        'bootstrapProgramSha256',
        'materializerProgramBytes',
        'materializerProgramSha256',
      ],
    )
    if (
      result.prepared !== true
      || typeof result.manifestSha256 !== 'string'
      || !LOWER_HEX_64.test(result.manifestSha256)
      || /^0+$/u.test(result.manifestSha256)
      || typeof result.sourcePolicySha256 !== 'string'
      || !LOWER_HEX_64.test(result.sourcePolicySha256)
      || /^0+$/u.test(result.sourcePolicySha256)
      || typeof result.cacheSha256 !== 'string'
      || !LOWER_HEX_64.test(result.cacheSha256)
      || /^0+$/u.test(result.cacheSha256)
      || typeof result.cacheClosureSha256 !== 'string'
      || !LOWER_HEX_64.test(result.cacheClosureSha256)
      || /^0+$/u.test(result.cacheClosureSha256)
      || result.signaturesVerified !== true
      || result.offlineReady !== true
      || !Number.isSafeInteger(result.bootstrapProgramBytes)
      || result.bootstrapProgramBytes < 1
      || result.bootstrapProgramBytes > 16 * 1024 * 1024
      || !LOWER_HEX_64.test(result.bootstrapProgramSha256)
      || !Number.isSafeInteger(result.materializerProgramBytes)
      || result.materializerProgramBytes < 1
      || result.materializerProgramBytes > 16 * 1024 * 1024
      || !LOWER_HEX_64.test(result.materializerProgramSha256)
    ) fail()
    await publishFixedToolchainAttestation(resultCapability)
    return Object.freeze({ prepared: true })
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
  let options
  try {
    options = parseToolchainArguments(process.argv.slice(2))
    await prepareReleaseRecoveryWslToolchain(options)
    process.stdout.write('RECOVERY_FIXTURE_TOOLCHAIN_READY\n')
  } catch {
    process.stderr.write('RECOVERY_FIXTURE_INPUT_INVALID\n')
    process.exitCode = 1
  }
}
