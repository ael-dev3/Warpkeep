import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'
import { types } from 'node:util'

const STAGE_RELATIVE_PATH = 'services/release-recovery/.release-recovery-fixtures-stage-v1'
const JOURNAL_NAME = 'transaction-journal-v1.ndjson'
const JOURNAL_PROFILE = 'warpkeep-release-recovery-fixture-output-transaction-journal-v1'
const MAXIMUM_JOURNAL_BYTES = 2 * 1024 * 1024
const HEX_64 = /^[0-9a-f]{64}$/u
const FIXED_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
const WINDOWS_MOVE_FILE_WRITE_THROUGH = String.raw`
$ErrorActionPreference = 'Stop'
$null = Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class WarpkeepDurableMove {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool MoveFileExW(string existingPath, string newPath, uint flags);
  public static void Move(string existingPath, string newPath) {
    const uint MOVEFILE_WRITE_THROUGH = 0x00000008;
    if (!MoveFileExW(existingPath, newPath, MOVEFILE_WRITE_THROUGH)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
  }
}
'@
[WarpkeepDurableMove]::Move(
  $env:WARPKEEP_DURABLE_SOURCE,
  $env:WARPKEEP_DURABLE_TARGET
)
`
const FIXED_WINDOWS_ENVIRONMENT = Object.freeze({
  ComSpec: String.raw`C:\Windows\System32\cmd.exe`,
  PATH: String.raw`C:\Windows\System32`,
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  SystemRoot: String.raw`C:\Windows`,
  WINDIR: String.raw`C:\Windows`,
})

function fail() {
  const error = new Error('RECOVERY_FIXTURE_INPUT_INVALID')
  delete error.stack
  throw error
}

function exactObject(value, keys) {
  if (
    types.isProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actual = Reflect.ownKeys(descriptors)
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) fail()
  const result = Object.create(null)
  for (const key of keys) {
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function within(parent, child) {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function flushDirectory(path) {
  assertCanonicalDirectory(path)
  const flags = process.platform === 'win32'
    ? constants.O_WRONLY
    : constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
  const descriptor = openSync(path, flags)
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isDirectory()) fail()
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  assertCanonicalDirectory(path)
}

function durableRename(source, target, scratchRoot) {
  if (
    typeof source !== 'string'
    || typeof target !== 'string'
    || !isAbsolute(source)
    || !isAbsolute(target)
    || source.includes('\0')
    || target.includes('\0')
  ) fail()
  const sourceParent = dirname(source)
  const targetParent = dirname(target)
  assertCanonicalDirectory(sourceParent)
  assertCanonicalDirectory(targetParent)
  assertCanonicalDirectory(scratchRoot)
  const sourceStatus = lstatSync(source, { throwIfNoEntry: false })
  if (
    sourceStatus === undefined
    || sourceStatus.isSymbolicLink()
    || !sourceStatus.isFile()
    || !samePath(realpathSync.native(source), source)
    || lstatSync(target, { throwIfNoEntry: false }) !== undefined
    || lstatSync(sourceParent).dev !== lstatSync(targetParent).dev
  ) fail()
  if (process.platform === 'win32') {
    const result = spawnSync(FIXED_POWERSHELL, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      WINDOWS_MOVE_FILE_WRITE_THROUGH,
    ], {
      cwd: scratchRoot,
      encoding: null,
      env: {
        ...FIXED_WINDOWS_ENVIRONMENT,
        TEMP: scratchRoot,
        TMP: scratchRoot,
        WARPKEEP_DURABLE_SOURCE: source,
        WARPKEEP_DURABLE_TARGET: target,
      },
      maxBuffer: 4 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
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
  } else {
    renameSync(source, target)
  }
  flushDirectory(sourceParent)
  if (!samePath(sourceParent, targetParent)) flushDirectory(targetParent)
}

function durableUnlink(parent, path) {
  unlinkSync(path)
  flushDirectory(parent)
}

function durableCreateDirectory(parent, path, mode) {
  mkdirSync(path, { mode })
  assertCanonicalDirectory(path)
  flushDirectory(path)
  flushDirectory(parent)
}

function writeDurableStageFile(stageRoot, path, bytes) {
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o600,
  )
  try {
    const status = fstatSync(descriptor)
    if (!status.isFile() || status.size !== 0) fail()
    let offset = 0
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset)
      if (!Number.isSafeInteger(written) || written < 1) fail()
      offset += written
    }
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  flushDirectory(stageRoot)
}

function assertCanonicalDirectory(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (
    stat === undefined
    || stat.isSymbolicLink()
    || !stat.isDirectory()
    || !samePath(realpathSync.native(path), path)
  ) fail()
}

function directoryChain(repositoryRoot, targetParent, create) {
  if (!within(repositoryRoot, targetParent)) fail()
  assertCanonicalDirectory(repositoryRoot)
  const path = relative(repositoryRoot, targetParent)
  let current = repositoryRoot
  for (const component of path === '' ? [] : path.split(sep)) {
    current = resolve(current, component)
    let stat = lstatSync(current, { throwIfNoEntry: false })
    if (stat === undefined) {
      if (!create) break
      durableCreateDirectory(dirname(current), current, 0o755)
      stat = lstatSync(current, { throwIfNoEntry: false })
    }
    if (
      stat === undefined
      || stat.isSymbolicLink()
      || !stat.isDirectory()
      || !samePath(realpathSync.native(current), current)
    ) fail()
  }
  assertCanonicalDirectory(repositoryRoot)
}

function validatePaths(repositoryRoot, value) {
  if (types.isProxy(value) || !Array.isArray(value) || value.length < 1 || value.length > 32) fail()
  const paths = []
  for (const path of value) {
    if (
      typeof path !== 'string'
      || path.length < 1
      || path.length > 512
      || path.includes('\\')
      || path.split('/').some(component => component === '' || component === '.' || component === '..')
      || paths.includes(path)
    ) fail()
    const target = resolve(repositoryRoot, ...path.split('/'))
    if (!within(repositoryRoot, target)) fail()
    paths.push(path)
  }
  return Object.freeze(paths)
}

function descriptorBytes(path, maximumBytes) {
  const beforePath = lstatSync(path, { throwIfNoEntry: false })
  if (
    beforePath === undefined
    || beforePath.isSymbolicLink()
    || !beforePath.isFile()
    || beforePath.size < 1
    || beforePath.size > maximumBytes
    || !samePath(realpathSync.native(path), path)
  ) fail()
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = fstatSync(descriptor)
    if (
      !before.isFile()
      || before.dev !== beforePath.dev
      || before.ino !== beforePath.ino
      || before.size !== beforePath.size
    ) fail()
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || bytes.byteLength !== before.size
    ) fail()
    return bytes
  } finally {
    closeSync(descriptor)
  }
}

function fileFingerprint(path, maximumBytes = 64 * 1024 * 1024) {
  const bytes = descriptorBytes(path, maximumBytes)
  return Object.freeze({ bytes: bytes.byteLength, sha256: sha256(bytes) })
}

function sameFingerprint(path, expected) {
  const actual = fileFingerprint(path, Math.max(expected.bytes, 1))
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function validateFingerprint(bytes, digest) {
  if (
    !Number.isSafeInteger(bytes)
    || bytes < 1
    || bytes > 64 * 1024 * 1024
    || typeof digest !== 'string'
    || !HEX_64.test(digest)
  ) fail()
}

function validateState(value, paths, sequence) {
  const state = exactObject(value, [
    'schemaVersion',
    'profile',
    'sequence',
    'phase',
    'paths',
    'entries',
  ])
  if (
    state.schemaVersion !== 1
    || state.profile !== JOURNAL_PROFILE
    || state.sequence !== sequence
    || !['STAGING', 'PREPARED', 'COMMITTING', 'COMMITTED'].includes(state.phase)
    || JSON.stringify(state.paths) !== JSON.stringify(paths)
    || !Array.isArray(state.entries)
    || state.entries.length !== paths.length
  ) fail()
  for (let index = 0; index < paths.length; index += 1) {
    const entry = exactObject(state.entries[index], [
      'path',
      'staged',
      'newBytes',
      'newSha256',
      'hadOld',
      'oldBytes',
      'oldSha256',
      'backupState',
      'installState',
    ])
    if (
      entry.path !== paths[index]
      || typeof entry.staged !== 'boolean'
      || ![null, true, false].includes(entry.hadOld)
      || !['none', 'intent', 'moved'].includes(entry.backupState)
      || !['none', 'intent', 'installed'].includes(entry.installState)
    ) fail()
    if (entry.staged) validateFingerprint(entry.newBytes, entry.newSha256)
    else if (entry.newBytes !== null || entry.newSha256 !== null) fail()
    if (entry.hadOld === true) validateFingerprint(entry.oldBytes, entry.oldSha256)
    else if (entry.oldBytes !== null || entry.oldSha256 !== null) fail()
  }
  return state
}

function journalSnapshot(state) {
  return {
    schemaVersion: state.schemaVersion,
    profile: state.profile,
    sequence: state.sequence,
    phase: state.phase,
    paths: [...state.paths],
    entries: state.entries.map(entry => ({ ...entry })),
  }
}

function appendJournal(stageRoot, journalPath, state) {
  assertCanonicalDirectory(stageRoot)
  const existing = lstatSync(journalPath, { throwIfNoEntry: false })
  if (
    existing !== undefined
    && (existing.isSymbolicLink() || !existing.isFile() || !samePath(realpathSync.native(journalPath), journalPath))
  ) fail()
  state.sequence += 1
  const bytes = Buffer.from(`${JSON.stringify(journalSnapshot(state))}\n`, 'utf8')
  if (bytes.byteLength > 64 * 1024) fail()
  const descriptor = openSync(
    journalPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
    0o600,
  )
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.size + bytes.byteLength > MAXIMUM_JOURNAL_BYTES) fail()
    let offset = 0
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset)
      if (!Number.isSafeInteger(written) || written < 1) fail()
      offset += written
    }
    fsyncSync(descriptor)
  } finally {
    bytes.fill(0)
    closeSync(descriptor)
  }
  if (existing === undefined) flushDirectory(stageRoot)
}

function readJournal(stageRoot, journalPath, paths) {
  assertCanonicalDirectory(stageRoot)
  const bytes = descriptorBytes(journalPath, MAXIMUM_JOURNAL_BYTES)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const lines = text.split('\n')
  if (lines.at(-1) !== '') lines.pop()
  else lines.pop()
  if (lines.length < 1) fail()
  let state
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length < 2 || lines[index].length > 64 * 1024) fail()
    let value
    try {
      value = JSON.parse(lines[index])
    } catch {
      fail()
    }
    if (lines[index] !== JSON.stringify(value)) fail()
    state = validateState(value, paths, index)
  }
  return state
}

function assertStageMember(stageRoot, path) {
  assertCanonicalDirectory(stageRoot)
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (
    stat === undefined
    || stat.isSymbolicLink()
    || !stat.isFile()
    || !samePath(realpathSync.native(path), path)
  ) fail()
  return stat
}

function allowedStageNames(paths) {
  const allowed = new Set([JOURNAL_NAME])
  for (let index = 0; index < paths.length; index += 1) {
    allowed.add(`${index}.new`)
    allowed.add(`${index}.old`)
  }
  return allowed
}

function assertStageInventory(stageRoot, paths) {
  assertCanonicalDirectory(stageRoot)
  const allowed = allowedStageNames(paths)
  for (const member of readdirSync(stageRoot, { withFileTypes: true })) {
    if (!allowed.has(member.name) || member.isSymbolicLink() || !member.isFile()) fail()
    assertStageMember(stageRoot, resolve(stageRoot, member.name))
  }
}

function removeStageMember(stageRoot, path) {
  if (lstatSync(path, { throwIfNoEntry: false }) === undefined) return
  assertStageMember(stageRoot, path)
  durableUnlink(stageRoot, path)
}

function removeCompletedStage(stageRoot, journalPath, paths) {
  assertStageInventory(stageRoot, paths)
  for (let index = 0; index < paths.length; index += 1) {
    removeStageMember(stageRoot, resolve(stageRoot, `${index}.new`))
    removeStageMember(stageRoot, resolve(stageRoot, `${index}.old`))
  }
  removeStageMember(stageRoot, journalPath)
  assertCanonicalDirectory(stageRoot)
  if (readdirSync(stageRoot).length !== 0) fail()
  rmdirSync(stageRoot)
  flushDirectory(dirname(stageRoot))
}

function targetFor(repositoryRoot, paths, path) {
  if (!paths.includes(path)) fail()
  const target = resolve(repositoryRoot, ...path.split('/'))
  if (!within(repositoryRoot, target)) fail()
  return target
}

function assertTargetFile(repositoryRoot, target, expected) {
  directoryChain(repositoryRoot, dirname(target), false)
  if (!sameFingerprint(target, expected)) fail()
  directoryChain(repositoryRoot, dirname(target), false)
}

function removeTarget(repositoryRoot, target, expected) {
  assertTargetFile(repositoryRoot, target, expected)
  durableUnlink(dirname(target), target)
  directoryChain(repositoryRoot, dirname(target), false)
}

function restorePreviousSet(repositoryRoot, stageRoot, journalPath, paths, state) {
  for (let index = paths.length - 1; index >= 0; index -= 1) {
    const entry = state.entries[index]
    if (entry.hadOld === null) continue
    const target = targetFor(repositoryRoot, paths, entry.path)
    const backup = resolve(stageRoot, `${index}.old`)
    const targetStat = lstatSync(target, { throwIfNoEntry: false })
    const backupStat = lstatSync(backup, { throwIfNoEntry: false })
    if (entry.hadOld === true) {
      const oldFingerprint = { bytes: entry.oldBytes, sha256: entry.oldSha256 }
      if (backupStat !== undefined) {
        assertStageMember(stageRoot, backup)
        if (!sameFingerprint(backup, oldFingerprint)) fail()
        if (targetStat !== undefined) {
          const newFingerprint = { bytes: entry.newBytes, sha256: entry.newSha256 }
          removeTarget(repositoryRoot, target, newFingerprint)
        }
        directoryChain(repositoryRoot, dirname(target), false)
        durableRename(backup, target, stageRoot)
        assertTargetFile(repositoryRoot, target, oldFingerprint)
      } else {
        if (targetStat === undefined) fail()
        assertTargetFile(repositoryRoot, target, oldFingerprint)
      }
    } else if (targetStat !== undefined) {
      removeTarget(repositoryRoot, target, {
        bytes: entry.newBytes,
        sha256: entry.newSha256,
      })
    }
  }
  removeCompletedStage(stageRoot, journalPath, paths)
}

function finishCommittedSet(repositoryRoot, stageRoot, journalPath, paths, state) {
  for (let index = 0; index < paths.length; index += 1) {
    const entry = state.entries[index]
    if (!entry.staged) fail()
    const target = targetFor(repositoryRoot, paths, entry.path)
    assertTargetFile(repositoryRoot, target, {
      bytes: entry.newBytes,
      sha256: entry.newSha256,
    })
    const backup = resolve(stageRoot, `${index}.old`)
    if (lstatSync(backup, { throwIfNoEntry: false }) !== undefined) {
      if (entry.hadOld !== true) fail()
      assertStageMember(stageRoot, backup)
      if (!sameFingerprint(backup, { bytes: entry.oldBytes, sha256: entry.oldSha256 })) fail()
      durableUnlink(stageRoot, backup)
    }
  }
  removeCompletedStage(stageRoot, journalPath, paths)
}

function recoverStage(repositoryRoot, stageRoot, journalPath, paths) {
  directoryChain(repositoryRoot, dirname(stageRoot), false)
  const stage = lstatSync(stageRoot, { throwIfNoEntry: false })
  if (stage === undefined) return
  assertCanonicalDirectory(stageRoot)
  assertStageInventory(stageRoot, paths)
  const journal = lstatSync(journalPath, { throwIfNoEntry: false })
  if (journal === undefined) {
    if (readdirSync(stageRoot).length !== 0) fail()
    rmdirSync(stageRoot)
    flushDirectory(dirname(stageRoot))
    return
  }
  const state = readJournal(stageRoot, journalPath, paths)
  if (state.phase === 'COMMITTED') {
    appendJournal(stageRoot, journalPath, state)
    finishCommittedSet(repositoryRoot, stageRoot, journalPath, paths, state)
    return
  }
  if (state.phase === 'STAGING') {
    if (state.entries.some(entry => entry.hadOld !== null || entry.backupState !== 'none')) fail()
    removeCompletedStage(stageRoot, journalPath, paths)
    return
  }
  restorePreviousSet(repositoryRoot, stageRoot, journalPath, paths, state)
}

export function createFixedFixtureOutputStore(input) {
  const options = exactObject(input, ['repositoryRoot', 'paths'])
  if (typeof options.repositoryRoot !== 'string' || !isAbsolute(options.repositoryRoot)) fail()
  const repositoryRoot = resolve(options.repositoryRoot)
  assertCanonicalDirectory(repositoryRoot)
  const paths = validatePaths(repositoryRoot, options.paths)
  const stageRoot = resolve(repositoryRoot, ...STAGE_RELATIVE_PATH.split('/'))
  const journalPath = resolve(stageRoot, JOURNAL_NAME)
  if (!within(repositoryRoot, stageRoot)) fail()

  return Object.freeze({
    async read(path) {
      try {
        assertCanonicalDirectory(repositoryRoot)
        if (lstatSync(stageRoot, { throwIfNoEntry: false }) !== undefined) fail()
        const target = targetFor(repositoryRoot, paths, path)
        directoryChain(repositoryRoot, dirname(target), false)
        return Uint8Array.from(descriptorBytes(target, 64 * 1024 * 1024))
      } catch {
        fail()
      }
    },
    async recover() {
      try {
        assertCanonicalDirectory(repositoryRoot)
        recoverStage(repositoryRoot, stageRoot, journalPath, paths)
      } catch {
        fail()
      }
    },
    async begin(requestedPaths) {
      try {
        if (JSON.stringify(requestedPaths) !== JSON.stringify(paths)) fail()
        assertCanonicalDirectory(repositoryRoot)
        for (const path of paths) {
          const target = targetFor(repositoryRoot, paths, path)
          directoryChain(repositoryRoot, dirname(target), false)
        }
        directoryChain(repositoryRoot, dirname(stageRoot), false)
        if (lstatSync(stageRoot, { throwIfNoEntry: false }) !== undefined) fail()
        durableCreateDirectory(dirname(stageRoot), stageRoot, 0o700)
        assertCanonicalDirectory(stageRoot)
        const state = {
          schemaVersion: 1,
          profile: JOURNAL_PROFILE,
          sequence: -1,
          phase: 'STAGING',
          paths: [...paths],
          entries: paths.map(path => ({
            path,
            staged: false,
            newBytes: null,
            newSha256: null,
            hadOld: null,
            oldBytes: null,
            oldSha256: null,
            backupState: 'none',
            installState: 'none',
          })),
        }
        appendJournal(stageRoot, journalPath, state)
        let closed = false
        return Object.freeze({
          async stage(path, bytes) {
            try {
              if (
                closed
                || !(bytes instanceof Uint8Array)
                || bytes.byteLength < 1
                || bytes.byteLength > 64 * 1024 * 1024
              ) fail()
              const index = paths.indexOf(path)
              if (index < 0 || state.entries[index].staged) fail()
              assertCanonicalDirectory(stageRoot)
              const stagePath = resolve(stageRoot, `${index}.new`)
              writeDurableStageFile(stageRoot, stagePath, bytes)
              const fingerprint = fileFingerprint(stagePath)
              state.entries[index].staged = true
              state.entries[index].newBytes = fingerprint.bytes
              state.entries[index].newSha256 = fingerprint.sha256
              appendJournal(stageRoot, journalPath, state)
            } catch {
              fail()
            }
          },
          async commit() {
            if (closed || state.entries.some(entry => !entry.staged)) fail()
            try {
              for (let index = 0; index < paths.length; index += 1) {
                const entry = state.entries[index]
                const target = targetFor(repositoryRoot, paths, entry.path)
                directoryChain(repositoryRoot, dirname(target), true)
                const stat = lstatSync(target, { throwIfNoEntry: false })
                if (stat === undefined) {
                  entry.hadOld = false
                } else {
                  const fingerprint = fileFingerprint(target)
                  entry.hadOld = true
                  entry.oldBytes = fingerprint.bytes
                  entry.oldSha256 = fingerprint.sha256
                }
              }
              state.phase = 'PREPARED'
              appendJournal(stageRoot, journalPath, state)
              state.phase = 'COMMITTING'
              for (let index = 0; index < paths.length; index += 1) {
                const entry = state.entries[index]
                const target = targetFor(repositoryRoot, paths, entry.path)
                const staged = resolve(stageRoot, `${index}.new`)
                const backup = resolve(stageRoot, `${index}.old`)
                if (entry.hadOld) {
                  entry.backupState = 'intent'
                  appendJournal(stageRoot, journalPath, state)
                  assertTargetFile(repositoryRoot, target, {
                    bytes: entry.oldBytes,
                    sha256: entry.oldSha256,
                  })
                  if (lstatSync(backup, { throwIfNoEntry: false }) !== undefined) fail()
                  durableRename(target, backup, stageRoot)
                  assertStageMember(stageRoot, backup)
                  if (!sameFingerprint(backup, { bytes: entry.oldBytes, sha256: entry.oldSha256 })) fail()
                  entry.backupState = 'moved'
                  appendJournal(stageRoot, journalPath, state)
                }
                entry.installState = 'intent'
                appendJournal(stageRoot, journalPath, state)
                assertStageMember(stageRoot, staged)
                if (!sameFingerprint(staged, { bytes: entry.newBytes, sha256: entry.newSha256 })) fail()
                if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) fail()
                directoryChain(repositoryRoot, dirname(target), false)
                durableRename(staged, target, stageRoot)
                assertTargetFile(repositoryRoot, target, {
                  bytes: entry.newBytes,
                  sha256: entry.newSha256,
                })
                entry.installState = 'installed'
                appendJournal(stageRoot, journalPath, state)
              }
              state.phase = 'COMMITTED'
              appendJournal(stageRoot, journalPath, state)
              finishCommittedSet(repositoryRoot, stageRoot, journalPath, paths, state)
              closed = true
            } catch {
              try { recoverStage(repositoryRoot, stageRoot, journalPath, paths) } catch { /* retain recovery state */ }
              if (
                state.phase === 'COMMITTED'
                && lstatSync(stageRoot, { throwIfNoEntry: false }) === undefined
              ) {
                for (const entry of state.entries) {
                  if (!entry.staged) fail()
                  assertTargetFile(
                    repositoryRoot,
                    targetFor(repositoryRoot, paths, entry.path),
                    { bytes: entry.newBytes, sha256: entry.newSha256 },
                  )
                }
                closed = true
                return
              }
              fail()
            }
          },
          async rollback() {
            if (closed) return
            try {
              recoverStage(repositoryRoot, stageRoot, journalPath, paths)
              closed = true
            } catch {
              fail()
            }
          },
        })
      } catch {
        fail()
      }
    },
  })
}
