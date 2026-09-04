import { pathToFileURL } from 'node:url'
import { types } from 'node:util'

import {
  FIXED_PRIVATE_ROOT,
  preflightFixedPrivatePrerequisites,
} from './generate-release-recovery-spacetime-fixtures.mjs'
import {
  bootstrapFixedWslToolchain,
  preflightFixedWslHostAndGuest,
} from './release-recovery-fixture-host.mjs'
import { WSL_EXECUTION_POLICY } from './run-release-recovery-spacetime-fixtures-wsl.mjs'

const LOWER_HEX_64 = /^[0-9a-f]{64}$/u

export const TOOLCHAIN_BOOTSTRAP_POLICY = Object.freeze({
  schemaVersion: 1,
  profile: 'warpkeep-release-recovery-wsl-toolchain-bootstrap-v1',
  distribution: 'Ubuntu-24.04',
  platform: 'linux',
  architecture: 'x64',
  nodeVersions: Object.freeze(['24.19.0', '22.22.3']),
  pnpmVersion: '11.7.0',
  spacetimeVersion: '2.6.1',
  spacetimeCommit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
  gitPackageVersion: '1:2.43.0-1ubuntu7.3',
  wslVersion: '2.7.11.0',
  packageFetchPolicy: 'fixed-https-no-redirect-no-credential',
  nodeReleaseSignatures: Object.freeze({
    '24.19.0': Object.freeze({
      algorithm: 'EdDSA',
      fingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
      keyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/5BE8A3F6C8A5C01D106C0AD820B1A390B168D356.asc',
      keyBytes: 924,
      keySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
    }),
    '22.22.3': Object.freeze({
      algorithm: 'RSA',
      fingerprint: 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
      keyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/CC68F5A3106FF448322E48ED27F5E38D5B0A215F.asc',
      keyBytes: 3_163,
      keySha256: 'e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27',
    }),
  }),
  pnpm: Object.freeze({
    version: '11.7.0',
    url: 'https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz',
    compressedBytes: 4_590_455,
    sri: 'sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA==',
    sha256: 'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee',
    members: Object.freeze({
      'package/bin/pnpm.mjs': Object.freeze({
        mode: 0o755,
        bytes: 1_464,
        sha256: 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd',
      }),
      'package/dist/pnpm.mjs': Object.freeze({
        mode: 0o644,
        bytes: 12_565_169,
        sha256: 'd3a7f4bde2f32c5acc5f012d1edc24c24ea247c2f6c8823146f8cd69ed70b22f',
      }),
      'package/package.json': Object.freeze({
        mode: 0o644,
        bytes: 2_216,
        sha256: '2b20455ee8d69d072df339bf9851edea94ee08a9ea14db9289a7fca0bbb7abb0',
      }),
    }),
  }),
  spacetime: Object.freeze({
    version: '2.6.1',
    commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
    archiveSha256: 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118',
    cliSha256: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
    standaloneSha256: 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b',
  }),
  gnupg: Object.freeze({
    packageVersion: '2.4.4-2ubuntu17.4',
    gpgSha256: '7ecb1341104b0ee1107fe908abce37e24546de1db0848b29c75f59f72094f4e8',
    gpgvSha256: '097b577cdf8b51dcc1fb42417d5ef3ca2e22b36a8ad16c9df4bd083a38fe476c',
  }),
  lifecycleScripts: false,
  noClobber: true,
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
    const prerequisites = await preflightFixedPrivatePrerequisites({
      privateRoot: options.privateRoot,
    })
    const platform = await preflightFixedWslHostAndGuest({
      policy: WSL_EXECUTION_POLICY,
    })
    const result = exactDataObject(
      await bootstrapFixedWslToolchain({
        policy: TOOLCHAIN_BOOTSTRAP_POLICY,
        platform,
        toolchain: prerequisites.toolchain,
      }),
      [
        'prepared',
        'manifestSha256',
        'cacheSha256',
        'signaturesVerified',
        'offlineReady',
      ],
    )
    if (
      result.prepared !== true
      || typeof result.manifestSha256 !== 'string'
      || !LOWER_HEX_64.test(result.manifestSha256)
      || /^0+$/u.test(result.manifestSha256)
      || result.manifestSha256 !== prerequisites.toolchain.manifestSha256
      || typeof result.cacheSha256 !== 'string'
      || !LOWER_HEX_64.test(result.cacheSha256)
      || /^0+$/u.test(result.cacheSha256)
      || result.cacheSha256 !== prerequisites.toolchain.cacheCatalogSha256
      || result.signaturesVerified !== true
      || result.offlineReady !== true
    ) fail()
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
