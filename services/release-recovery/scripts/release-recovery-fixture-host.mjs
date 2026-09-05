import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { types } from 'node:util'

import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from '../../../scripts/genesis002-activation-receipts.mjs'
import { ptrProductionImportReceiptDigest } from '../../../scripts/ptr-production-import-core.ts'
import { ptrProductionPublishReceiptDigest } from '../../../scripts/ptr-production-publisher.mjs'
import {
  ptrOwnerProvisionReceiptDigest,
  ptrSealedLiveReceiptDigest,
} from '../../../scripts/ptr-production-release-receipts.ts'
import { isExactCurrentOwnerOnlyAcl } from '../../../scripts/recovery-bootstrap-acl.mjs'
import { createFixedFixtureOutputStore } from './release-recovery-fixture-output-transaction.mjs'
import {
  parseToolchainEvidenceBytes,
  parseToolchainSourcePolicyBytes,
} from './release-recovery-toolchain-records.mjs'

const FIXED_PRIVATE_ROOT = String.raw`C:\Users\heyas\.warpkeep\private\release-recovery-v1`
const FIXED_WSL_EXECUTABLE = String.raw`C:\Windows\System32\wsl.exe`
const FIXED_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
const FIXED_WHOAMI = String.raw`C:\Windows\System32\whoami.exe`
const FIXED_ICACLS = String.raw`C:\Windows\System32\icacls.exe`
const FIXED_GUEST_BOOTSTRAP_PROGRAM =
  '/opt/warpkeep/release-recovery-v1/bin/bootstrap-toolchain-v1'
const FIXED_GUEST_MATERIALIZER_PROGRAM =
  '/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1'
const FIXED_GUEST_STATE_ROOT = '/var/lib/warpkeep/release-recovery-v1'
const FIXED_GUEST_INSTALL_SCRIPT = String.raw`set -efu
umask 077
target=$1
expected_bytes=$2
expected_sha256=$3
case "$target" in
  /opt/warpkeep/release-recovery-v1/bin/bootstrap-toolchain-v1|/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1) ;;
  *) exit 41 ;;
esac
parent=/opt/warpkeep/release-recovery-v1/bin
/usr/bin/install -d -m 0700 -o 0 -g 0 "$parent"
if [ -e "$target" ]; then
  [ ! -L "$target" ]
  [ "$(/usr/bin/stat --format='%F|%a|%u|%g|%s' -- "$target")" = "regular file|500|0|0|$expected_bytes" ]
  [ "$(/usr/bin/sha256sum --binary -- "$target" | /usr/bin/cut -d ' ' -f 1)" = "$expected_sha256" ]
  exit 0
fi
temporary="$parent/.install-$expected_sha256"
trap '/bin/rm -f -- "$temporary"' EXIT HUP INT TERM
( set -C; /bin/cat > "$temporary" )
[ "$(/usr/bin/stat --format='%F|%a|%u|%g|%s' -- "$temporary")" = "regular file|600|0|0|$expected_bytes" ]
[ "$(/usr/bin/sha256sum --binary -- "$temporary" | /usr/bin/cut -d ' ' -f 1)" = "$expected_sha256" ]
/bin/chmod 0500 "$temporary"
/bin/mv -n -- "$temporary" "$target"
[ "$(/usr/bin/stat --format='%F|%a|%u|%g|%s' -- "$target")" = "regular file|500|0|0|$expected_bytes" ]
[ "$(/usr/bin/sha256sum --binary -- "$target" | /usr/bin/cut -d ' ' -f 1)" = "$expected_sha256" ]
trap - EXIT HUP INT TERM
`
const FIXED_HOST_ENVIRONMENT = Object.freeze({
  ComSpec: String.raw`C:\Windows\System32\cmd.exe`,
  PATH: String.raw`C:\Windows\System32`,
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  SystemRoot: String.raw`C:\Windows`,
  WINDIR: String.raw`C:\Windows`,
})
const FIXED_GUEST_ENVIRONMENT_ARGUMENTS = Object.freeze([
  '/usr/bin/env',
  '-i',
  `HOME=${FIXED_GUEST_STATE_ROOT}/home`,
  `XDG_CACHE_HOME=${FIXED_GUEST_STATE_ROOT}/xdg-cache`,
  `XDG_CONFIG_HOME=${FIXED_GUEST_STATE_ROOT}/xdg-config`,
  `XDG_DATA_HOME=${FIXED_GUEST_STATE_ROOT}/xdg-data`,
  `TMPDIR=${FIXED_GUEST_STATE_ROOT}/tmp`,
  'LANG=C',
  'LC_ALL=C',
  'TZ=UTC',
  'NO_COLOR=1',
  'CI=1',
  'WSL_DISTRO_NAME=Ubuntu-24.04',
  'PATH=/usr/bin:/bin:/usr/sbin',
])
const LOWER_HEX_40 = /^[0-9a-f]{40}$/u
const LOWER_HEX_64 = /^[0-9a-f]{64}$/u
const CANONICAL_BASE64URL = /^[A-Za-z0-9_-]+$/u
const PRIVATE_RECORD_MAXIMUMS = Object.freeze({
  'recovery-bootstrap-marker.json': 256,
  'recovery-rpc-secret.txt': 44,
  'recovery-census-pepper.txt': 44,
  'player-canary-owner-fid.txt': 17,
  'auth-bridge-signing-public.jwk.json': 1_024,
  'fixture-materialization/wsl-toolchain-attestation-v1.json': 256 * 1_024,
  'activation-evidence/records/g002-publish-receipt.json': 256 * 1_024,
  'activation-evidence/records/g002-atlas-import-receipt.json': 256 * 1_024,
  'activation-evidence/records/g002-sealed-live-receipt.json': 256 * 1_024,
  'activation-evidence/records/ptr-publish-receipt.json': 256 * 1_024,
  'activation-evidence/records/ptr-atlas-import-receipt.json': 256 * 1_024,
  'activation-evidence/records/ptr-owner-provision-receipt.json': 256 * 1_024,
  'activation-evidence/records/ptr-sealed-live-receipt.json': 256 * 1_024,
})
const FIXED_OUTPUT_PATHS = Object.freeze([
  'services/release-recovery/fixtures/toolchains/linux-x64.json',
  'services/release-recovery/fixtures/spacetime/g001.raw-module-def-v10.json',
  'services/release-recovery/fixtures/spacetime/g002.raw-module-def-v10.json',
  'services/release-recovery/fixtures/spacetime/ptr.raw-module-def-v10.json',
  'services/release-recovery/fixtures/spacetime/manifest.json',
])
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '../../..')
const FIXED_TOOLCHAIN_SOURCE_POLICY = join(
  SCRIPT_DIRECTORY,
  'release-recovery-wsl-toolchain-source-policy-v1.json',
)
const rootCapabilities = new WeakMap()
const sourcePolicyCapabilities = new WeakMap()
const publicSourceCapabilities = new WeakMap()
const bootstrapResultCapabilities = new WeakMap()
let fixtureOutputStore

function fail() {
  const error = new Error('RECOVERY_FIXTURE_INPUT_INVALID')
  delete error.stack
  throw error
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function freezeData(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child)
    Object.freeze(value)
  }
  return value
}

function exactObject(value, expectedKeys) {
  if (
    types.isProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) fail()
  const result = Object.create(null)
  for (const key of expectedKeys) {
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value')
    ) fail()
    result[key] = descriptor.value
  }
  return result
}

function sameHostPath(left, right) {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase()
}

function within(parent, child) {
  const relation = relative(parent, child)
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
}

function assertNoLinkComponents(path, stopAt) {
  const target = resolve(path)
  const root = resolve(stopAt)
  if (!within(root, target)) fail()
  const components = relative(root, target).split(sep).filter(Boolean)
  let current = root
  const rootStat = lstatSync(root, { throwIfNoEntry: false })
  if (rootStat === undefined || rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail()
  for (const component of components) {
    current = join(current, component)
    const currentStat = lstatSync(current, { throwIfNoEntry: false })
    if (currentStat === undefined || currentStat.isSymbolicLink()) fail()
  }
}

function fixedCommand(executable, args, maximumBytes = 16 * 1024, environment) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env: environment,
    maxBuffer: maximumBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (
    result.error !== undefined
    ||
    result.status !== 0
    || result.signal !== null
    || typeof result.stdout !== 'string'
    || typeof result.stderr !== 'string'
    || result.stderr.length !== 0
    || Buffer.byteLength(result.stdout, 'utf8') > maximumBytes
    || result.stdout.includes('\0')
  ) fail()
  return result.stdout
}

function fixedBinaryCommand(executable, args, maximumBytes, environment) {
  const result = spawnSync(executable, args, {
    encoding: null,
    env: environment,
    maxBuffer: maximumBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (
    result.error !== undefined
    ||
    result.status !== 0
    || result.signal !== null
    || !(result.stdout instanceof Uint8Array)
    || !(result.stderr instanceof Uint8Array)
    || result.stderr.byteLength !== 0
    || result.stdout.byteLength === 0
    || result.stdout.byteLength > maximumBytes
  ) fail()
  return Buffer.from(result.stdout)
}

function canonicalJsonCommand(executable, args, request, maximumBytes, environment) {
  let input
  try {
    input = Buffer.from(`${JSON.stringify(request)}\n`, 'utf8')
    if (input.byteLength < 2 || input.byteLength > 256 * 1024) fail()
    const result = spawnSync(executable, args, {
      encoding: null,
      env: environment,
      input,
      maxBuffer: maximumBytes,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || !(result.stdout instanceof Uint8Array)
      || !(result.stderr instanceof Uint8Array)
      || result.stderr.byteLength !== 0
      || result.stdout.byteLength < 2
      || result.stdout.byteLength > maximumBytes
    ) fail()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout)
    const value = JSON.parse(text)
    if (text !== `${JSON.stringify(value)}\n`) fail()
    return value
  } catch {
    fail()
  } finally {
    input?.fill(0)
  }
}

function installFixedGuestProgram(sourceName, target, expectedBytes, expectedSha256, distribution) {
  let bytes
  try {
    bytes = readFileSync(join(SCRIPT_DIRECTORY, sourceName))
    if (
      bytes.byteLength !== expectedBytes
      || sha256(bytes) !== expectedSha256
    ) fail()
    const result = spawnSync(FIXED_WSL_EXECUTABLE, [
      '--distribution',
      distribution,
      '--user',
      'root',
      '--exec',
      '/bin/sh',
      '-ceu',
      FIXED_GUEST_INSTALL_SCRIPT,
      '--',
      target,
      String(expectedBytes),
      expectedSha256,
    ], {
      encoding: null,
      env: FIXED_HOST_ENVIRONMENT,
      input: bytes,
      maxBuffer: 4 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || !(result.stdout instanceof Uint8Array)
      || !(result.stderr instanceof Uint8Array)
      || result.stdout.byteLength !== 0
      || result.stderr.byteLength !== 0
    ) fail()
  } catch {
    fail()
  } finally {
    bytes?.fill(0)
  }
}

function assertOwnerOnly(path, stat, expectedMode) {
  if (process.platform !== 'win32') {
    if (
      typeof process.getuid !== 'function'
      || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== expectedMode
    ) fail()
    return
  }
  const principal = fixedCommand(FIXED_WHOAMI, [], 512, FIXED_HOST_ENVIRONMENT).trim()
  if (principal.length === 0 || /[\0\r\n:]/u.test(principal)) fail()
  const permissions = fixedCommand(FIXED_ICACLS, [path], 8 * 1024, FIXED_HOST_ENVIRONMENT)
  if (!isExactCurrentOwnerOnlyAcl(permissions, principal)) fail()
  const targetVariable = 'WARPKEEP_RELEASE_RECOVERY_OWNER_TARGET_B64'
  const ownerScript = String.raw`
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false, $true)
$target = $utf8.GetString([Convert]::FromBase64String($env:WARPKEEP_RELEASE_RECOVERY_OWNER_TARGET_B64))
$security = if ([IO.Directory]::Exists($target)) {
  [IO.Directory]::GetAccessControl($target)
} elseif ([IO.File]::Exists($target)) {
  [IO.File]::GetAccessControl($target)
} else { throw 'unavailable' }
$owner = $security.GetOwner([Security.Principal.SecurityIdentifier]).Value
$current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
[Console]::Out.Write($current + [Environment]::NewLine + $owner + [Environment]::NewLine)
`
  const ownerLines = fixedCommand(
    FIXED_POWERSHELL,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', ownerScript],
    512,
    { ...FIXED_HOST_ENVIRONMENT, [targetVariable]: Buffer.from(path, 'utf8').toString('base64') },
  ).trim().split(/\r?\n/u)
  if (ownerLines.length !== 2 || ownerLines[0] !== ownerLines[1]) fail()
}

function stableDescriptor(path, expectedKind, maximumBytes) {
  const beforePath = lstatSync(path, { throwIfNoEntry: false })
  if (
    beforePath === undefined
    || beforePath.isSymbolicLink()
    || (expectedKind === 'directory' ? !beforePath.isDirectory() : !beforePath.isFile())
    || (maximumBytes !== undefined && (beforePath.size < 1 || beforePath.size > maximumBytes))
  ) fail()
  assertOwnerOnly(path, beforePath, expectedKind === 'directory' ? 0o700 : 0o600)
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  const before = fstatSync(descriptor)
  if (
    (expectedKind === 'directory' ? !before.isDirectory() : !before.isFile())
    || before.dev !== beforePath.dev
    || before.ino !== beforePath.ino
    || (maximumBytes !== undefined && (before.size < 1 || before.size > maximumBytes))
  ) {
    closeSync(descriptor)
    fail()
  }
  return { descriptor, before }
}

function assertRootStable(capability) {
  const descriptorStat = fstatSync(capability.descriptor)
  const pathStat = lstatSync(capability.canonicalPath, { throwIfNoEntry: false })
  if (
    pathStat === undefined
    || pathStat.isSymbolicLink()
    || !pathStat.isDirectory()
    || !descriptorStat.isDirectory()
    || descriptorStat.dev !== capability.before.dev
    || descriptorStat.ino !== capability.before.ino
    || pathStat.dev !== capability.before.dev
    || pathStat.ino !== capability.before.ino
    || !sameHostPath(realpathSync.native(capability.canonicalPath), capability.canonicalPath)
  ) fail()
}

export async function openFixedPrivateRoot(requestedPath) {
  try {
    if (requestedPath !== FIXED_PRIVATE_ROOT) fail()
    assertNoLinkComponents(requestedPath, win32.parse(requestedPath).root)
    const canonicalPath = realpathSync.native(requestedPath)
    if (!sameHostPath(canonicalPath, requestedPath)) fail()
    const { descriptor, before } = stableDescriptor(requestedPath, 'directory')
    const capability = Object.freeze({
      canonicalPath,
      directory: true,
      reparsePoint: false,
      ownerOnly: true,
      mode: 0o700,
      descriptorVerified: true,
    })
    rootCapabilities.set(capability, { descriptor, before, canonicalPath })
    return capability
  } catch {
    fail()
  }
}

export async function readFixedPrivateRecord(root, relativePath, maximumBytes) {
  let descriptor
  let bytes
  try {
    const capability = rootCapabilities.get(root)
    if (
      capability === undefined
      || PRIVATE_RECORD_MAXIMUMS[relativePath] !== maximumBytes
      || relativePath.includes('\\')
      || relativePath.split('/').some(component => component === '' || component === '.' || component === '..')
    ) fail()
    assertRootStable(capability)
    const target = resolve(capability.canonicalPath, ...relativePath.split('/'))
    assertNoLinkComponents(target, capability.canonicalPath)
    const canonicalPath = realpathSync.native(target)
    if (!sameHostPath(canonicalPath, target)) fail()
    const opened = stableDescriptor(target, 'file', maximumBytes)
    descriptor = opened.descriptor
    bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    if (
      after.dev !== opened.before.dev
      || after.ino !== opened.before.ino
      || after.size !== opened.before.size
      || bytes.byteLength !== opened.before.size
    ) fail()
    assertRootStable(capability)
    return Object.freeze({
      canonicalPath,
      regularFile: true,
      reparsePoint: false,
      ownerOnly: true,
      mode: 0o600,
      descriptorVerified: true,
      bytes: Uint8Array.from(bytes),
    })
  } catch {
    fail()
  } finally {
    bytes?.fill(0)
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export async function closeFixedPrivateRoot(root) {
  const capability = rootCapabilities.get(root)
  if (capability === undefined) fail()
  rootCapabilities.delete(root)
  closeSync(capability.descriptor)
}

function canonicalJson(bytes, maximumBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > maximumBytes) fail()
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const value = JSON.parse(text)
    if (text !== `${JSON.stringify(value)}\n`) fail()
    return value
  } catch {
    fail()
  }
}

function activationRecordDigest(record) {
  const hash = createHash('sha256')
  for (const part of [
    'warpkeep.sealed-realms.activation-record.v1',
    record.member,
    record.preparationSourceCommit,
    record.sourceCommit,
    record.operation,
    record.sourceAuthorityDigest,
    record.bodyDigest,
  ]) hash.update(part).update('\n')
  return hash.digest('hex')
}

function activationReceiptRecord(bytes, member, operation, verifyReceipt) {
  const record = exactObject(canonicalJson(bytes, 256 * 1_024), [
    'schemaVersion',
    'profile',
    'member',
    'preparationSourceCommit',
    'sourceCommit',
    'operation',
    'sourceAuthorityDigest',
    'bodyDigest',
    'receipt',
    'semanticDigest',
  ])
  if (
    record.schemaVersion !== 1
    || record.profile !== 'warpkeep-sealed-realms-activation-record-v1'
    || record.member !== member
    || record.operation !== operation
    || !LOWER_HEX_40.test(record.preparationSourceCommit)
    || !LOWER_HEX_40.test(record.sourceCommit)
    || !LOWER_HEX_64.test(record.sourceAuthorityDigest)
    || !LOWER_HEX_64.test(record.bodyDigest)
    || !LOWER_HEX_64.test(record.semanticDigest)
    || /^0+$/u.test(record.sourceAuthorityDigest)
    || activationRecordDigest(record) !== record.semanticDigest
  ) fail()
  const receiptBytes = Buffer.from(`${JSON.stringify(record.receipt)}\n`, 'utf8')
  if (sha256(receiptBytes) !== record.bodyDigest) fail()
  verifyReceipt(record.receipt)
  return Object.freeze({
    preparationSourceCommit: record.preparationSourceCommit,
    sourceAuthorityDigest: record.sourceAuthorityDigest,
    receipt: record.receipt,
  })
}

function receiptWithDigest(value, digestField, calculateDigest) {
  if (
    types.isProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (
    keys.at(-1) !== digestField
    || keys.some(key => {
      const descriptor = descriptors[key]
      return typeof key !== 'string'
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
    })
  ) fail()
  const digest = value[digestField]
  const body = Object.fromEntries(keys.slice(0, -1).map(key => [key, value[key]]))
  if (!LOWER_HEX_64.test(digest) || calculateDigest(body) !== digest) fail()
  return value
}

function sameActivationAuthority(records) {
  const first = records[0]
  if (records.some(record => (
    record.preparationSourceCommit !== first.preparationSourceCommit
    || record.sourceAuthorityDigest !== first.sourceAuthorityDigest
  ))) fail()
}

export async function verifyFixedPublishReceipt(input) {
  try {
    const request = exactObject(input, [
      'realm',
      'path',
      'bytes',
      'receiptSha256',
      'corroboratingReceipts',
    ])
    const expected = request.realm === 'g002'
      ? Object.freeze({
          path: 'activation-evidence/records/g002-publish-receipt.json',
          member: 'g002PublishReceipt',
          operation: 'g002-publish-apply',
        })
      : request.realm === 'ptr'
        ? Object.freeze({
            path: 'activation-evidence/records/ptr-publish-receipt.json',
            member: 'ptrPublishReceipt',
            operation: 'ptr-publish-apply',
          })
        : undefined
    if (expected === undefined || request.path !== expected.path) fail()
    if (sha256(request.bytes) !== request.receiptSha256) fail()
    const corroborating = exactObject(
      request.corroboratingReceipts,
      request.realm === 'g002'
        ? ['importBytes', 'liveBytes']
        : ['importBytes', 'ownerBytes', 'liveBytes'],
    )
    const publishRecord = activationReceiptRecord(
      request.bytes,
      expected.member,
      expected.operation,
      receipt => receiptWithDigest(
        receipt,
        'publishReceiptDigest',
        request.realm === 'g002'
          ? genesis002PublishReceiptDigest
          : ptrProductionPublishReceiptDigest,
      ),
    )
    const receipt = publishRecord.receipt
    let authorityRecords
    if (request.realm === 'g002') {
      const importRecord = activationReceiptRecord(
        corroborating.importBytes,
        'g002AtlasImportReceipt',
        'g002-import-apply',
        value => receiptWithDigest(
          value,
          'importReceiptDigest',
          genesis002ProductionImportReceiptDigest,
        ),
      )
      const liveRecord = activationReceiptRecord(
        corroborating.liveBytes,
        'g002SealedLiveReceipt',
        'g002-live-inspect',
        genesis002SealedLiveReceiptDigest,
      )
      authorityRecords = [publishRecord, importRecord, liveRecord]
      const imported = importRecord.receipt
      const live = liveRecord.receipt
      if (
        receipt.databaseIdentity !== imported.databaseIdentity
        || receipt.databaseIdentity !== live.databaseIdentity
        || receipt.moduleIdentity !== imported.moduleIdentity
        || receipt.moduleIdentity !== live.moduleIdentity
        || receipt.sourceCommit !== imported.moduleSourceCommit
        || receipt.sourceCommit !== live.moduleSourceCommit
        || receipt.moduleSha256 !== imported.moduleSha256
        || receipt.moduleSha256 !== live.moduleSha256
        || receipt.moduleTreeId !== imported.moduleTreeId
        || receipt.dependencyClosureDigest !== imported.dependencyClosureDigest
        || receipt.spacetimeExecutableSha256 !== imported.spacetimeExecutableSha256
        || imported.atlasId !== live.atlasId
        || imported.atlasSourceCommit !== live.atlasSourceCommit
        || imported.publicReleaseId !== live.publicReleaseId
        || imported.expectedReleaseSha256 !== live.releaseSha256
        || imported.verificationDigest !== live.verificationDigest
        || receipt.atlasImportMutationsEnabled !== live.atlasImportSurfaceCompiled
        || receipt.atlasActivationMutationsEnabled !== imported.activationMutationsEnabled
        || receipt.atlasActivationMutationsEnabled !== live.activationMutationsEnabled
        || receipt.playerPresentationEnabled !== imported.playerPresentationEnabled
        || receipt.playerPresentationEnabled !== live.playerPresentationEnabled
        || imported.atlasWritesClosedByFinalization !== live.atlasWritesClosedByFinalization
      ) fail()
    } else {
      const importRecord = activationReceiptRecord(
        corroborating.importBytes,
        'ptrAtlasImportReceipt',
        'ptr-import-apply',
        value => receiptWithDigest(value, 'importReceiptDigest', ptrProductionImportReceiptDigest),
      )
      const ownerRecord = activationReceiptRecord(
        corroborating.ownerBytes,
        'ptrOwnerProvisionReceipt',
        'ptr-owner-provision',
        value => receiptWithDigest(value, 'provisionReceiptDigest', ptrOwnerProvisionReceiptDigest),
      )
      const liveRecord = activationReceiptRecord(
        corroborating.liveBytes,
        'ptrSealedLiveReceipt',
        'ptr-live-inspect',
        ptrSealedLiveReceiptDigest,
      )
      authorityRecords = [publishRecord, importRecord, ownerRecord, liveRecord]
      const imported = importRecord.receipt
      const owner = ownerRecord.receipt
      const live = liveRecord.receipt
      if (
        receipt.databaseIdentity !== imported.databaseIdentity
        || receipt.databaseIdentity !== owner.databaseIdentity
        || receipt.databaseIdentity !== live.databaseIdentity
        || receipt.databaseAlias !== owner.databaseAlias
        || receipt.databaseAlias !== live.databaseAlias
        || receipt.moduleIdentity !== imported.moduleIdentity
        || receipt.moduleIdentity !== owner.moduleIdentity
        || receipt.moduleIdentity !== live.moduleIdentity
        || receipt.sourceCommit !== imported.moduleSourceCommit
        || receipt.sourceCommit !== owner.moduleSourceCommit
        || receipt.sourceCommit !== live.moduleSourceCommit
        || receipt.moduleSha256 !== imported.moduleSha256
        || receipt.moduleSha256 !== live.moduleSha256
        || receipt.moduleTreeId !== imported.moduleTreeId
        || receipt.dependencyClosureDigest !== imported.dependencyClosureDigest
        || receipt.spacetimeExecutableSha256 !== imported.spacetimeExecutableSha256
        || imported.atlasSourceCommit !== live.atlasSourceCommit
        || imported.atlasId !== live.atlasId
        || imported.publicReleaseId !== live.publicReleaseId
        || imported.releaseManifestSha256 !== live.releaseManifestSha256
        || imported.expectedReleaseSha256 !== live.expectedReleaseSha256
        || imported.releaseHeaderSha256 !== live.releaseHeaderSha256
        || imported.verificationDigest !== live.verificationDigest
        || imported.importsExact !== live.atlasImportsExact
        || imported.atlasFinalized !== live.atlasFinalized
        || imported.atlasWritesClosedByFinalization !== live.atlasWritesClosedByFinalization
        || imported.importMutationsCompiled !== live.atlasImportMutationsCompiled
        || imported.activationMutationsCompiled !== live.atlasActivationMutationsCompiled
        || owner.atlasImportReceiptDigest !== imported.importReceiptDigest
        || owner.ownerOpaqueProofDigest !== live.ownerOpaqueProofDigest
        || owner.ownerAnchorRows !== live.ownerAnchorRows
        || owner.ownerProvisioned !== live.ownerProvisioned
        || owner.ownerEnabled !== live.ownerEnabled
        || receipt.admissionSurfacePresent !== live.admissionSurfacePresent
        || receipt.accessRequestSurfacePresent !== live.accessRequestSurfacePresent
      ) fail()
    }
    sameActivationAuthority(authorityRecords)
    return Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-authenticated-publish-source-v1',
      realm: request.realm,
      authenticationProfile: 'producer-local-receipt-authentication-v1',
      receiptSha256: request.receiptSha256,
      databaseIdentity: receipt.databaseIdentity,
      sourceCommit: receipt.sourceCommit,
      sourceTree: receipt.moduleTreeId,
      publishedModuleSha256: receipt.moduleSha256,
      historicalDependencyClosureSha256: receipt.dependencyClosureDigest,
      signatureVerified: true,
      matchingImportReceiptVerified: true,
      matchingLiveReceiptVerified: true,
    })
  } catch {
    fail()
  }
}

export async function verifyFixedToolchainAttestation(input) {
  try {
    const request = exactObject(input, ['path', 'bytes', 'attestationSha256'])
    if (
      request.path !== 'fixture-materialization/wsl-toolchain-attestation-v1.json'
      || sha256(request.bytes) !== request.attestationSha256
    ) fail()
    const value = exactObject(canonicalJson(request.bytes, 256 * 1_024), [
      'schemaVersion',
      'profile',
      'platform',
      'architecture',
      'sourcePolicySha256',
      'offlineReady',
      'signaturesVerified',
      'toolchainManifestSha256',
      'cacheCatalogSha256',
      'cacheClosureSha256',
      'bootstrapProgramBytes',
      'bootstrapProgramSha256',
      'materializerProgramBytes',
      'materializerProgramSha256',
    ])
    if (
      value.schemaVersion !== 1
      || value.profile !== 'warpkeep-release-recovery-wsl-toolchain-attestation-v1'
      || value.platform !== 'linux'
      || value.architecture !== 'x64'
      || !LOWER_HEX_64.test(value.sourcePolicySha256)
      || /^0+$/u.test(value.sourcePolicySha256)
      || value.offlineReady !== true
      || value.signaturesVerified !== true
      || !LOWER_HEX_64.test(value.cacheClosureSha256)
      || /^0+$/u.test(value.cacheClosureSha256)
    ) fail()
    exactProgramCoordinates({
      sourcePolicySha256: value.sourcePolicySha256,
      manifestSha256: value.toolchainManifestSha256,
      cacheCatalogSha256: value.cacheCatalogSha256,
      cacheClosureSha256: value.cacheClosureSha256,
      bootstrapProgramBytes: value.bootstrapProgramBytes,
      bootstrapProgramSha256: value.bootstrapProgramSha256,
      materializerProgramBytes: value.materializerProgramBytes,
      materializerProgramSha256: value.materializerProgramSha256,
    }, true)
    return Object.freeze({
      ...value,
      attestationSha256: request.attestationSha256,
    })
  } catch {
    fail()
  }
}

function fixedFixtureOutputStore() {
  fixtureOutputStore ??= createFixedFixtureOutputStore({
    repositoryRoot: REPOSITORY_ROOT,
    paths: FIXED_OUTPUT_PATHS,
  })
  return fixtureOutputStore
}

export async function readFixedFixtureOutput(relativePath) {
  try {
    return await fixedFixtureOutputStore().read(relativePath)
  } catch {
    fail()
  }
}

export async function recoverFixedFixtureOutputs() {
  try {
    await fixedFixtureOutputStore().recover()
  } catch {
    fail()
  }
}

export async function beginFixedFixtureOutputTransaction(paths) {
  try {
    return await fixedFixtureOutputStore().begin(paths)
  } catch {
    fail()
  }
}

function exactPlatformAttestation(value, policy) {
  const platform = exactObject(value, [
    'schemaVersion',
    'profile',
    'executableSha256',
    'wslVersion',
    'distribution',
    'osReleaseSha256',
    'kernelReleaseSha256',
    'gitSha256',
    'unshareSha256',
    'loopbackToolSha256',
  ])
  if (
    platform.schemaVersion !== 1
    || platform.profile !== 'warpkeep-release-recovery-wsl-host-guest-preflight-v1'
    || platform.executableSha256 !== policy.executableSha256
    || platform.wslVersion !== policy.wslVersion
    || platform.distribution !== policy.distribution
    || platform.osReleaseSha256 !== policy.guestOsReleaseSha256
    || platform.kernelReleaseSha256 !== policy.guestKernelReleaseSha256
    || platform.gitSha256 !== policy.gitSha256
    || platform.unshareSha256 !== policy.unshareSha256
    || platform.loopbackToolSha256 !== policy.loopbackToolSha256
  ) fail()
  return value
}

function exactProgramCoordinates(value, includeBootstrap) {
  const coordinates = exactObject(
    value,
    includeBootstrap
      ? [
          'sourcePolicySha256',
          'manifestSha256',
          'cacheCatalogSha256',
          'cacheClosureSha256',
          'bootstrapProgramBytes',
          'bootstrapProgramSha256',
          'materializerProgramBytes',
          'materializerProgramSha256',
        ]
      : [
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
        ],
  )
  if (
    !LOWER_HEX_64.test(coordinates.sourcePolicySha256)
    || /^0+$/u.test(coordinates.sourcePolicySha256)
    || !LOWER_HEX_64.test(coordinates.manifestSha256)
    || /^0+$/u.test(coordinates.manifestSha256)
    || !LOWER_HEX_64.test(coordinates.cacheCatalogSha256)
    || /^0+$/u.test(coordinates.cacheCatalogSha256)
    || !LOWER_HEX_64.test(coordinates.cacheClosureSha256)
    || /^0+$/u.test(coordinates.cacheClosureSha256)
    || !Number.isSafeInteger(coordinates.materializerProgramBytes)
    || coordinates.materializerProgramBytes < 1
    || coordinates.materializerProgramBytes > 16 * 1024 * 1024
    || !LOWER_HEX_64.test(coordinates.materializerProgramSha256)
    || /^0+$/u.test(coordinates.materializerProgramSha256)
  ) fail()
  if (
    !Number.isSafeInteger(coordinates.bootstrapProgramBytes)
    || coordinates.bootstrapProgramBytes < 1
    || coordinates.bootstrapProgramBytes > 16 * 1024 * 1024
    || !LOWER_HEX_64.test(coordinates.bootstrapProgramSha256)
    || /^0+$/u.test(coordinates.bootstrapProgramSha256)
  ) fail()
  if (!includeBootstrap && (
    coordinates.platform !== 'linux'
    || coordinates.architecture !== 'x64'
    || coordinates.offlineReady !== true
    || coordinates.signaturesVerified !== true
  )) fail()
  return coordinates
}

export async function preflightFixedToolchainSourcePolicy(...unexpected) {
  let descriptor
  let bytes
  try {
    if (unexpected.length !== 0) fail()
    assertNoLinkComponents(FIXED_TOOLCHAIN_SOURCE_POLICY, REPOSITORY_ROOT)
    if (realpathSync.native(FIXED_TOOLCHAIN_SOURCE_POLICY) !== FIXED_TOOLCHAIN_SOURCE_POLICY) fail()
    const named = lstatSync(FIXED_TOOLCHAIN_SOURCE_POLICY)
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || named.size < 2
      || named.size > 512 * 1024
    ) fail()
    descriptor = openSync(
      FIXED_TOOLCHAIN_SOURCE_POLICY,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    )
    const before = fstatSync(descriptor)
    if (
      !before.isFile()
      || before.dev !== named.dev
      || before.ino !== named.ino
      || before.size !== named.size
    ) fail()
    bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || bytes.byteLength !== before.size
    ) fail()
    const parsed = parseToolchainSourcePolicyBytes(bytes)
    freezeData(parsed.policy)
    const capability = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-toolchain-source-policy-capability-v1',
      sourcePolicySha256: parsed.sha256,
    })
    sourcePolicyCapabilities.set(capability, parsed)
    return capability
  } catch {
    fail()
  } finally {
    bytes?.fill(0)
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function fixedGuestHostPath(path) {
  const normalized = win32.normalize(path)
  const parsed = win32.parse(normalized)
  const drive = /^([A-Za-z]):\\$/u.exec(parsed.root)
  if (
    drive === null
    || normalized.includes('\0')
    || /[\r\n]/u.test(normalized)
  ) fail()
  const segments = relative(parsed.root, normalized).split('\\')
  if (
    segments.length < 1
    || segments.some(segment => (
      segment.length < 1
      || segment === '.'
      || segment === '..'
      || /[\u0000-\u001f]/u.test(segment)
    ))
  ) fail()
  return `/mnt/${drive[1].toLowerCase()}/${segments.join('/')}`
}

export async function preflightFixedPublicSourceObjectDatabase(...unexpected) {
  let descriptor
  let configBytes
  try {
    if (unexpected.length !== 0) fail()
    const gitDirectory = join(REPOSITORY_ROOT, '.git')
    const objectDirectory = join(gitDirectory, 'objects')
    assertNoLinkComponents(objectDirectory, REPOSITORY_ROOT)
    for (const path of [gitDirectory, objectDirectory]) {
      const status = lstatSync(path)
      if (
        status.isSymbolicLink()
        || !status.isDirectory()
        || realpathSync.native(path) !== path
      ) fail()
    }
    for (const path of [
      join(objectDirectory, 'info', 'alternates'),
      join(objectDirectory, 'info', 'http-alternates'),
      join(gitDirectory, 'info', 'grafts'),
      join(gitDirectory, 'refs', 'replace'),
    ]) {
      if (lstatSync(path, { throwIfNoEntry: false }) !== undefined) fail()
    }
    const configPath = join(gitDirectory, 'config')
    assertNoLinkComponents(configPath, REPOSITORY_ROOT)
    if (realpathSync.native(configPath) !== configPath) fail()
    const named = lstatSync(configPath)
    if (
      named.isSymbolicLink()
      || !named.isFile()
      || named.size < 1
      || named.size > 64 * 1024
    ) fail()
    descriptor = openSync(configPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const before = fstatSync(descriptor)
    if (
      !before.isFile()
      || before.dev !== named.dev
      || before.ino !== named.ino
      || before.size !== named.size
    ) fail()
    configBytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || configBytes.byteLength !== before.size
    ) fail()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(configBytes)
    if (
      text.includes('\0')
      || /^\s*\[(?:include|includeIf|extensions)\b/imu.test(text)
      || /^\s*(?:alternateRefsCommand|useReplaceRefs|partialClone)\s*=/imu.test(text)
    ) fail()
    const capability = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-fixed-public-source-capability-v1',
    })
    publicSourceCapabilities.set(capability, Object.freeze({
      objectDirectory: fixedGuestHostPath(objectDirectory),
    }))
    return capability
  } catch {
    fail()
  } finally {
    configBytes?.fill(0)
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function exactBootstrapSources(value) {
  const sources = exactObject(value, ['g002', 'ptr'])
  const sanitized = Object.create(null)
  for (const realm of ['g002', 'ptr']) {
    const source = exactObject(sources[realm], [
      'receiptSha256', 'databaseIdentity', 'sourceCommit', 'sourceTree',
      'publishedModuleSha256', 'historicalDependencyClosureSha256',
    ])
    for (const digest of [
      source.receiptSha256,
      source.databaseIdentity,
      source.publishedModuleSha256,
      source.historicalDependencyClosureSha256,
    ]) if (!LOWER_HEX_64.test(digest) || /^0+$/u.test(digest)) fail()
    if (
      !LOWER_HEX_40.test(source.sourceCommit)
      || /^0+$/u.test(source.sourceCommit)
      || !LOWER_HEX_40.test(source.sourceTree)
      || /^0+$/u.test(source.sourceTree)
    ) fail()
    sanitized[realm] = Object.freeze({
      sourceCommit: source.sourceCommit,
      sourceTree: source.sourceTree,
      historicalDependencyClosureSha256: source.historicalDependencyClosureSha256,
    })
  }
  return Object.freeze(sanitized)
}

function fixedGuestProgramCoordinates() {
  let bootstrap
  let materializer
  try {
    bootstrap = readFileSync(join(SCRIPT_DIRECTORY, 'release-recovery-wsl-bootstrap.py'))
    materializer = readFileSync(join(SCRIPT_DIRECTORY, 'release-recovery-wsl-materialize.mjs'))
    if (
      bootstrap.byteLength < 1
      || bootstrap.byteLength > 16 * 1024 * 1024
      || materializer.byteLength < 1
      || materializer.byteLength > 16 * 1024 * 1024
    ) fail()
    return Object.freeze({
      bootstrapProgramBytes: bootstrap.byteLength,
      bootstrapProgramSha256: sha256(bootstrap),
      materializerProgramBytes: materializer.byteLength,
      materializerProgramSha256: sha256(materializer),
    })
  } finally {
    bootstrap?.fill(0)
    materializer?.fill(0)
  }
}

function readFixedGuestArtifact(path, expectedMode, maximumBytes, distribution) {
  const prefix = ['--distribution', distribution, '--user', 'root', '--exec']
  const canonical = fixedCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/usr/bin/readlink', '-e', '--', path],
    512,
    FIXED_HOST_ENVIRONMENT,
  )
  const metadata = fixedCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/usr/bin/stat', '--format=%F|%a|%u|%g|%s', '--', path],
    512,
    FIXED_HOST_ENVIRONMENT,
  )
  const match = /^regular file\|([0-7]{3})\|0\|0\|([1-9][0-9]*)\n$/u.exec(metadata)
  if (canonical !== `${path}\n` || match === null || match[1] !== expectedMode) fail()
  const length = Number(match[2])
  if (!Number.isSafeInteger(length) || length < 1 || length > maximumBytes) fail()
  const bytes = fixedBinaryCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/bin/cat', '--', path],
    maximumBytes,
    FIXED_HOST_ENVIRONMENT,
  )
  if (bytes.byteLength !== length) fail()
  return bytes
}

function attestFixedGuestProgram(path, expectedBytes, expectedSha256, distribution) {
  const prefix = ['--distribution', distribution, '--user', 'root', '--exec']
  const canonical = fixedCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/usr/bin/readlink', '-e', '--', path],
    512,
    FIXED_HOST_ENVIRONMENT,
  )
  const metadata = fixedCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/usr/bin/stat', '--format=%F|%a|%u|%g|%s', '--', path],
    512,
    FIXED_HOST_ENVIRONMENT,
  )
  const bytes = fixedBinaryCommand(
    FIXED_WSL_EXECUTABLE,
    [...prefix, '/bin/cat', '--', path],
    expectedBytes,
    FIXED_HOST_ENVIRONMENT,
  )
  if (
    canonical !== `${path}\n`
    || metadata !== `regular file|500|0|0|${expectedBytes}\n`
    || bytes.byteLength !== expectedBytes
    || sha256(bytes) !== expectedSha256
  ) fail()
}

function decodeBase64url(value, maximumBytes) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > Math.ceil(maximumBytes * 4 / 3)
    || !CANONICAL_BASE64URL.test(value)
  ) fail()
  const bytes = Buffer.from(value, 'base64url')
  if (
    bytes.byteLength === 0
    || bytes.byteLength > maximumBytes
    || bytes.toString('base64url') !== value
  ) fail()
  return Uint8Array.from(bytes)
}

function decodeFixtureRealm(value, realm) {
  const result = exactObject(value, [
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
    'rawModuleDefV10ResponseBase64url',
  ])
  if (result.realm !== realm) fail()
  return Object.freeze({
    realm: result.realm,
    historicalDependencyClosureSha256: result.historicalDependencyClosureSha256,
    linuxSourceDependencyClosureSha256: result.linuxSourceDependencyClosureSha256,
    linuxCacheClosureSha256: result.linuxCacheClosureSha256,
    transformedSourceClosureSha256: result.transformedSourceClosureSha256,
    firstBuildArtifactSha256: result.firstBuildArtifactSha256,
    secondBuildArtifactSha256: result.secondBuildArtifactSha256,
    programArtifactSha256: result.programArtifactSha256,
    programHashAlgorithm: result.programHashAlgorithm,
    programKeccak256: result.programKeccak256,
    rawModuleDefV10ResponseBytes:
      decodeBase64url(result.rawModuleDefV10ResponseBase64url, 2 * 1024 * 1024),
  })
}

function decodeFixtureResult(value, expectedManifestSha256) {
  const wire = exactObject(value, [
    'schemaVersion',
    'profile',
    'toolchainManifestBase64url',
    'toolchainManifestSha256',
    'realms',
  ])
  if (
    wire.schemaVersion !== 1
    || wire.profile !== 'warpkeep-release-recovery-wsl-fixture-result-v1'
    || wire.toolchainManifestSha256 !== expectedManifestSha256
  ) fail()
  const realms = exactObject(wire.realms, ['g001', 'g002', 'ptr'])
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-result-v1',
    toolchainManifestBytes: decodeBase64url(wire.toolchainManifestBase64url, 512 * 1024),
    toolchainManifestSha256: wire.toolchainManifestSha256,
    realms: Object.freeze({
      g001: decodeFixtureRealm(realms.g001, 'g001'),
      g002: decodeFixtureRealm(realms.g002, 'g002'),
      ptr: decodeFixtureRealm(realms.ptr, 'ptr'),
    }),
  })
}

export async function preflightFixedWslHostAndGuest(input) {
  try {
    const request = exactObject(input, ['policy'])
    const policy = request.policy
    if (
      policy.executable !== FIXED_WSL_EXECUTABLE
      || policy.distribution !== 'Ubuntu-24.04'
      || policy.executableBytes !== 274_432
      || policy.executableSha256 !== '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2'
    ) fail()
    const executableStat = statSync(FIXED_WSL_EXECUTABLE)
    const executableBytes = readFileSync(FIXED_WSL_EXECUTABLE)
    if (
      !executableStat.isFile()
      || executableStat.size !== policy.executableBytes
      || executableBytes.byteLength !== policy.executableBytes
      || sha256(executableBytes) !== policy.executableSha256
    ) fail()
    const versionScript = String.raw`
$ErrorActionPreference = 'Stop'
$version = (Get-Item -LiteralPath 'C:\Windows\System32\wsl.exe').VersionInfo
$fileVersion = '{0}.{1}.{2}.{3}' -f $version.FileMajorPart, $version.FileMinorPart, $version.FileBuildPart, $version.FilePrivatePart
$productVersion = '{0}.{1}.{2}.{3}' -f $version.ProductMajorPart, $version.ProductMinorPart, $version.ProductBuildPart, $version.ProductPrivatePart
[Console]::Out.Write($fileVersion + [Environment]::NewLine + $productVersion + [Environment]::NewLine)
`
    const versions = fixedCommand(
      FIXED_POWERSHELL,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', versionScript],
      512,
      FIXED_HOST_ENVIRONMENT,
    ).trim().split(/\r?\n/u)
    if (
      versions.length !== 2
      || versions[0] !== policy.executableFileVersion
      || versions[1] !== policy.executableProductVersion
    ) fail()
    const wslVersionOutput = fixedCommand(
      FIXED_WSL_EXECUTABLE,
      ['--version'],
      8 * 1024,
      FIXED_HOST_ENVIRONMENT,
    )
    if (!wslVersionOutput.split(/\r?\n/u).includes(`WSL version: ${policy.wslVersion}`)) fail()
    const readGuest = path => fixedBinaryCommand(
      FIXED_WSL_EXECUTABLE,
      ['--distribution', policy.distribution, '--exec', '/bin/cat', path],
      4 * 1024 * 1024,
      FIXED_HOST_ENVIRONMENT,
    )
    const osRelease = readGuest('/etc/os-release')
    const kernelRelease = readGuest('/proc/sys/kernel/osrelease')
    const gitBytes = readGuest(policy.gitExecutable)
    const unshareBytes = readGuest(policy.unshare[0])
    const loopbackToolBytes = readGuest(policy.loopbackTool)
    const osFields = new Map()
    for (const line of osRelease.toString('utf8').split('\n')) {
      if (line.length === 0) continue
      const separator = line.indexOf('=')
      if (separator < 1) fail()
      const key = line.slice(0, separator)
      const value = line.slice(separator + 1).replace(/^"|"$/gu, '')
      if (osFields.has(key)) fail()
      osFields.set(key, value)
    }
    const guestDistribution = fixedCommand(
      FIXED_WSL_EXECUTABLE,
      ['--distribution', policy.distribution, '--exec', '/bin/sh', '-ceu',
        'printf "%s\\n" "$WSL_DISTRO_NAME"'],
      256,
      FIXED_HOST_ENVIRONMENT,
    )
    const gitVersion = fixedCommand(
      FIXED_WSL_EXECUTABLE,
      ['--distribution', policy.distribution, '--exec', policy.gitExecutable, '--version'],
      256,
      FIXED_HOST_ENVIRONMENT,
    )
    const packageVersion = packageName => fixedCommand(
      FIXED_WSL_EXECUTABLE,
      ['--distribution', policy.distribution, '--exec', '/usr/bin/dpkg-query',
        '--show', '--showformat=${Version}', packageName],
      256,
      FIXED_HOST_ENVIRONMENT,
    )
    const namespaceJson = fixedCommand(
      FIXED_WSL_EXECUTABLE,
      [
        '--distribution',
        policy.distribution,
        '--exec',
        ...policy.unshare,
        '/bin/sh',
        '-ceu',
        [
          '/usr/sbin/ip link set lo up',
          '/usr/sbin/ip -json link show',
          '/usr/sbin/ip -json route show table all',
        ].join('; '),
      ],
      64 * 1024,
      FIXED_HOST_ENVIRONMENT,
    ).trim().split(/\r?\n/u)
    if (namespaceJson.length !== 2) fail()
    let links
    let routes
    try {
      links = JSON.parse(namespaceJson[0])
      routes = JSON.parse(namespaceJson[1])
    } catch {
      fail()
    }
    if (
      osRelease.byteLength !== policy.guestOsReleaseBytes
      || sha256(osRelease) !== policy.guestOsReleaseSha256
      || osFields.get('ID') !== 'ubuntu'
      || osFields.get('VERSION_ID') !== '24.04'
      || osFields.get('VERSION_CODENAME') !== 'noble'
      || kernelRelease.byteLength !== policy.guestKernelReleaseBytes
      || kernelRelease.toString('utf8') !== policy.guestKernelRelease
      || sha256(kernelRelease) !== policy.guestKernelReleaseSha256
      || guestDistribution !== `${policy.distribution}\n`
      || gitVersion !== `${policy.gitVersion}\n`
      || packageVersion('git') !== policy.gitPackageVersion
      || packageVersion('util-linux') !== policy.unsharePackageVersion
      || packageVersion('iproute2') !== policy.loopbackPackageVersion
      || sha256(gitBytes) !== policy.gitSha256
      || sha256(unshareBytes) !== policy.unshareSha256
      || sha256(loopbackToolBytes) !== policy.loopbackToolSha256
      || !Array.isArray(links)
      || links.length !== 1
      || links[0]?.ifname !== 'lo'
      || !Array.isArray(links[0]?.flags)
      || !links[0].flags.includes('LOOPBACK')
      || !links[0].flags.includes('UP')
      || !Array.isArray(routes)
      || routes.some(route => route?.dev !== 'lo')
    ) fail()
    return Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-host-guest-preflight-v1',
      executableSha256: policy.executableSha256,
      wslVersion: policy.wslVersion,
      distribution: policy.distribution,
      osReleaseSha256: policy.guestOsReleaseSha256,
      kernelReleaseSha256: policy.guestKernelReleaseSha256,
      gitSha256: policy.gitSha256,
      unshareSha256: policy.unshareSha256,
      loopbackToolSha256: policy.loopbackToolSha256,
    })
  } catch {
    fail()
  }
}

export async function bootstrapFixedWslToolchain(input) {
  try {
    const request = exactObject(input, [
      'platform', 'sourcePolicy', 'sourceObjects', 'sources',
    ])
    const parsedPolicy = sourcePolicyCapabilities.get(request.sourcePolicy)
    const sourceTransport = publicSourceCapabilities.get(request.sourceObjects)
    if (parsedPolicy === undefined) fail()
    if (sourceTransport === undefined) fail()
    publicSourceCapabilities.delete(request.sourceObjects)
    const sources = exactBootstrapSources(request.sources)
    exactPlatformAttestation(request.platform, {
      executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
      wslVersion: '2.7.11.0',
      distribution: 'Ubuntu-24.04',
      guestOsReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
      guestKernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
      gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
      unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
      loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0',
    })
    const toolchain = fixedGuestProgramCoordinates()
    installFixedGuestProgram(
      'release-recovery-wsl-bootstrap.py',
      FIXED_GUEST_BOOTSTRAP_PROGRAM,
      toolchain.bootstrapProgramBytes,
      toolchain.bootstrapProgramSha256,
      'Ubuntu-24.04',
    )
    installFixedGuestProgram(
      'release-recovery-wsl-materialize.mjs',
      FIXED_GUEST_MATERIALIZER_PROGRAM,
      toolchain.materializerProgramBytes,
      toolchain.materializerProgramSha256,
      'Ubuntu-24.04',
    )
    attestFixedGuestProgram(
      FIXED_GUEST_BOOTSTRAP_PROGRAM,
      toolchain.bootstrapProgramBytes,
      toolchain.bootstrapProgramSha256,
      'Ubuntu-24.04',
    )
    attestFixedGuestProgram(
      FIXED_GUEST_MATERIALIZER_PROGRAM,
      toolchain.materializerProgramBytes,
      toolchain.materializerProgramSha256,
      'Ubuntu-24.04',
    )
    const result = exactObject(canonicalJsonCommand(
      FIXED_WSL_EXECUTABLE,
      [
        '--distribution',
        'Ubuntu-24.04',
        '--user',
        'root',
        '--exec',
        ...FIXED_GUEST_ENVIRONMENT_ARGUMENTS,
        FIXED_GUEST_BOOTSTRAP_PROGRAM,
        '--public-object-database',
        sourceTransport.objectDirectory,
      ],
      Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep-release-recovery-wsl-toolchain-bootstrap-request-v1',
        sourcePolicy: parsedPolicy.policy,
        sourcePolicySha256: parsedPolicy.sha256,
        platform: request.platform,
        sources,
        programs: toolchain,
      }),
      64 * 1024,
      FIXED_HOST_ENVIRONMENT,
    ), [
      'prepared',
      'sourcePolicySha256',
      'manifestSha256',
      'cacheSha256',
      'cacheClosureSha256',
      'signaturesVerified',
      'offlineReady',
    ])
    if (
      result.prepared !== true
      || result.sourcePolicySha256 !== parsedPolicy.sha256
      || !LOWER_HEX_64.test(result.manifestSha256)
      || /^0+$/u.test(result.manifestSha256)
      || !LOWER_HEX_64.test(result.cacheSha256)
      || /^0+$/u.test(result.cacheSha256)
      || !LOWER_HEX_64.test(result.cacheClosureSha256)
      || /^0+$/u.test(result.cacheClosureSha256)
      || result.signaturesVerified !== true
      || result.offlineReady !== true
    ) fail()
    let manifestBytes
    let catalogBytes
    try {
      manifestBytes = readFixedGuestArtifact(
        `${FIXED_GUEST_STATE_ROOT}/toolchains/linux-x64.json`,
        '400',
        512 * 1024,
        'Ubuntu-24.04',
      )
      catalogBytes = readFixedGuestArtifact(
        `${FIXED_GUEST_STATE_ROOT}/cache-catalog-v2.json`,
        '400',
        8 * 1024 * 1024,
        'Ubuntu-24.04',
      )
      if (
        sha256(manifestBytes) !== result.manifestSha256
        || sha256(catalogBytes) !== result.cacheSha256
      ) fail()
      const catalog = exactObject(canonicalJson(catalogBytes, 8 * 1024 * 1024), [
        'schemaVersion', 'profile', 'platform', 'architecture', 'inventoryRoots',
        'manifestPath', 'manifestSha256', 'cacheClosureSha256', 'signaturesVerified',
        'offlineReady', 'entries',
      ])
      if (
        catalog.schemaVersion !== 2
        || catalog.profile !== 'warpkeep-release-recovery-wsl-cache-catalog-v2'
        || catalog.platform !== 'linux'
        || catalog.architecture !== 'x64'
        || JSON.stringify(catalog.inventoryRoots)
          !== JSON.stringify(['pnpm-store', 'source-caches', 'toolchains'])
        || catalog.manifestPath !== 'toolchains/linux-x64.json'
        || catalog.manifestSha256 !== result.manifestSha256
        || catalog.cacheClosureSha256 !== result.cacheClosureSha256
        || catalog.signaturesVerified !== true
        || catalog.offlineReady !== true
        || !Array.isArray(catalog.entries)
        || catalog.entries.length < 1
        || catalog.entries.length > 100_000
      ) fail()
      const verifiedManifest = parseToolchainEvidenceBytes(manifestBytes, parsedPolicy, {
        g001: {
          sourceCommit: parsedPolicy.policy.sourceRules.g001.sourceCommit,
          sourceTree: parsedPolicy.policy.sourceRules.g001.sourceTree,
          historicalDependencyClosureSha256: null,
        },
        g002: sources.g002,
        ptr: sources.ptr,
      })
      if (JSON.stringify(verifiedManifest.programs) !== JSON.stringify({
        ...toolchain,
        installedMode: '500',
        installedVerified: true,
      })) fail()
    } finally {
      manifestBytes?.fill(0)
      catalogBytes?.fill(0)
    }
    const verified = Object.freeze({
      ...result,
      ...toolchain,
    })
    bootstrapResultCapabilities.set(verified, Object.freeze({ ...verified }))
    return verified
  } catch {
    fail()
  }
}

export async function publishFixedToolchainAttestation(resultCapability) {
  let root
  let descriptor
  let bytes
  let temporary
  let temporaryCreated = false
  try {
    const result = bootstrapResultCapabilities.get(resultCapability)
    if (result === undefined) fail()
    const record = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-toolchain-attestation-v1',
      platform: 'linux',
      architecture: 'x64',
      sourcePolicySha256: result.sourcePolicySha256,
      offlineReady: true,
      signaturesVerified: true,
      toolchainManifestSha256: result.manifestSha256,
      cacheCatalogSha256: result.cacheSha256,
      cacheClosureSha256: result.cacheClosureSha256,
      bootstrapProgramBytes: result.bootstrapProgramBytes,
      bootstrapProgramSha256: result.bootstrapProgramSha256,
      materializerProgramBytes: result.materializerProgramBytes,
      materializerProgramSha256: result.materializerProgramSha256,
    })
    bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8')
    await verifyFixedToolchainAttestation({
      path: 'fixture-materialization/wsl-toolchain-attestation-v1.json',
      bytes,
      attestationSha256: sha256(bytes),
    })
    root = await openFixedPrivateRoot(FIXED_PRIVATE_ROOT)
    const parent = join(FIXED_PRIVATE_ROOT, 'fixture-materialization')
    assertNoLinkComponents(parent, FIXED_PRIVATE_ROOT)
    const parentStat = lstatSync(parent)
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail()
    assertOwnerOnly(parent, parentStat, 0o700)
    const target = join(parent, 'wsl-toolchain-attestation-v1.json')
    const existing = lstatSync(target, { throwIfNoEntry: false })
    if (existing !== undefined) {
      const current = await readFixedPrivateRecord(
        root,
        'fixture-materialization/wsl-toolchain-attestation-v1.json',
        256 * 1_024,
      )
      try {
        if (!Buffer.from(current.bytes).equals(bytes)) fail()
      } finally {
        current.bytes.fill(0)
      }
      return Object.freeze({ published: true })
    }
    temporary = join(parent, `.wsl-toolchain-attestation-${sha256(bytes)}.pending`)
    if (lstatSync(temporary, { throwIfNoEntry: false }) !== undefined) fail()
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    )
    temporaryCreated = true
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    chmodSync(temporary, 0o600)
    const temporaryStat = lstatSync(temporary)
    if (
      !temporaryStat.isFile()
      || temporaryStat.isSymbolicLink()
      || temporaryStat.nlink !== 1
      || temporaryStat.size !== bytes.byteLength
    ) fail()
    assertOwnerOnly(temporary, temporaryStat, 0o600)
    assertNoLinkComponents(parent, FIXED_PRIVATE_ROOT)
    if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) fail()
    renameSync(temporary, target)
    temporaryCreated = false
    const published = await readFixedPrivateRecord(
      root,
      'fixture-materialization/wsl-toolchain-attestation-v1.json',
      256 * 1_024,
    )
    try {
      if (!Buffer.from(published.bytes).equals(bytes)) fail()
    } finally {
      published.bytes.fill(0)
    }
    return Object.freeze({ published: true })
  } catch {
    fail()
  } finally {
    bootstrapResultCapabilities.delete(resultCapability)
    bytes?.fill(0)
    if (descriptor !== undefined) closeSync(descriptor)
    if (temporaryCreated && temporary !== undefined) {
      try { unlinkSync(temporary) } catch { /* retain the fixed error */ }
    }
    if (root !== undefined) {
      try { await closeFixedPrivateRoot(root) } catch { /* retain the fixed error */ }
    }
  }
}

export async function executeFixedWslFixturePlan(input) {
  try {
    const request = exactObject(input, ['policy', 'platform', 'plan'])
    exactPlatformAttestation(request.platform, request.policy)
    const plan = exactObject(request.plan, [
      'schemaVersion', 'profile', 'recoveryBuildProfile', 'toolchain', 'realms',
    ])
    if (
      plan.schemaVersion !== 1
      || plan.profile !== 'warpkeep-release-recovery-wsl-fixture-plan-v1'
      || plan.recoveryBuildProfile
        !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
    ) fail()
    const toolchain = exactProgramCoordinates(plan.toolchain, false)
    attestFixedGuestProgram(
      FIXED_GUEST_MATERIALIZER_PROGRAM,
      toolchain.materializerProgramBytes,
      toolchain.materializerProgramSha256,
      request.policy.distribution,
    )
    const wire = canonicalJsonCommand(
      FIXED_WSL_EXECUTABLE,
      [
        '--distribution',
        request.policy.distribution,
        '--user',
        'root',
        '--exec',
        ...request.policy.unshare,
        ...FIXED_GUEST_ENVIRONMENT_ARGUMENTS,
        FIXED_GUEST_MATERIALIZER_PROGRAM,
      ],
      Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep-release-recovery-wsl-fixture-request-v1',
        platform: request.platform,
        plan: request.plan,
        network: 'initialize-and-attest-loopback-only-before-install',
      }),
      12 * 1024 * 1024,
      FIXED_HOST_ENVIRONMENT,
    )
    return decodeFixtureResult(wire, toolchain.manifestSha256)
  } catch {
    fail()
  }
}
