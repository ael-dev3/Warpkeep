import { githubFail, snapshotExactDataObject } from './config.js'
import { parseGitHubJsonObject } from './http.js'

export const RECOVERY_SOURCE_CLOSURE_PROFILE = 'warpkeep-0.4.0-recovery-source-closure-v1'
export const RECOVERY_SOURCE_CLOSURE_MAX_BYTES = 16 * 1024 * 1024
const CODE = 'RECOVERY_GITHUB_EVIDENCE_INVALID'
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const SHA1 = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u
export type RecoverySourceTreeEntry = Readonly<{
  path: string
  mode: string
  type: string
  sha: string
  size?: number
}>
function compare(left: Uint8Array, right: Uint8Array): number {
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i]! - right[i]!
  return left.length - right.length
}

// Raw SHA-256 assertions are attested by the protected Verify producer. This
// independently authenticates the complete Git inventory and canonical digest.
export async function validateRecoverySourceClosureArtifact(
  bytes: Uint8Array,
  expected: Readonly<{
    sourceCommit: string
    sourceTree: string
    tree: ReadonlyMap<string, RecoverySourceTreeEntry>
  }>,
): Promise<string> {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < 1 ||
      bytes.length > RECOVERY_SOURCE_CLOSURE_MAX_BYTES
    )
      githubFail(CODE)
    const owned = Uint8Array.from(bytes)
    const value = snapshotExactDataObject(
      parseGitHubJsonObject(owned, CODE, []),
      ['schemaVersion', 'profile', 'sourceCommit', 'sourceTree', 'entries'],
      CODE,
    )
    if (
      value.schemaVersion !== 1 ||
      value.profile !== RECOVERY_SOURCE_CLOSURE_PROFILE ||
      typeof value.sourceCommit !== 'string' ||
      !SHA1.test(value.sourceCommit) ||
      value.sourceCommit !== expected.sourceCommit ||
      typeof value.sourceTree !== 'string' ||
      !SHA1.test(value.sourceTree) ||
      value.sourceTree !== expected.sourceTree ||
      !Array.isArray(value.entries) ||
      value.entries.length < 1 ||
      value.entries.length > 20000
    )
      githubFail(CODE)
    const regular = new Map<string, RecoverySourceTreeEntry>()
    for (const [path, entry] of expected.tree) {
      if (entry.type === 'tree' && entry.mode === '040000') continue
      if (
        entry.type !== 'blob' ||
        (entry.mode !== '100644' && entry.mode !== '100755') ||
        path !== entry.path
      )
        githubFail(CODE)
      regular.set(path, entry)
    }
    if (regular.size !== value.entries.length) githubFail(CODE)
    let total = 0
    let previous: Uint8Array | undefined
    const entries = value.entries.map((raw) => {
      const entry = snapshotExactDataObject(raw, ['path', 'mode', 'oid', 'byteLength', 'sha256'], CODE)
      if (
        typeof entry.path !== 'string' ||
        !entry.path ||
        /[\u0000-\u001f\u007f\\]/u.test(entry.path) ||
        entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        (entry.mode !== '100644' && entry.mode !== '100755') ||
        typeof entry.oid !== 'string' ||
        !SHA1.test(entry.oid) ||
        typeof entry.sha256 !== 'string' ||
        !SHA256.test(entry.sha256) ||
        typeof entry.byteLength !== 'number' ||
        !Number.isSafeInteger(entry.byteLength) ||
        entry.byteLength < 0 ||
        entry.byteLength > 64 * 1024 * 1024
      )
        githubFail(CODE)
      const pathBytes = encoder.encode(entry.path)
      if (
        pathBytes.length > 1024 ||
        decoder.decode(pathBytes) !== entry.path ||
        (previous !== undefined && compare(previous, pathBytes) >= 0)
      )
        githubFail(CODE)
      previous = pathBytes
      total += entry.byteLength
      if (total > 512 * 1024 * 1024) githubFail(CODE)
      const actual = regular.get(entry.path)
      if (
        actual === undefined ||
        actual.mode !== entry.mode ||
        actual.sha !== entry.oid ||
        actual.size !== entry.byteLength
      )
        githubFail(CODE)
      return {
        path: entry.path,
        mode: entry.mode,
        oid: entry.oid,
        byteLength: entry.byteLength,
        sha256: entry.sha256,
      }
    })
    const canonical =
      JSON.stringify({
        schemaVersion: 1,
        profile: RECOVERY_SOURCE_CLOSURE_PROFILE,
        sourceCommit: value.sourceCommit,
        sourceTree: value.sourceTree,
        entries,
      }) + '\n'
    if (decoder.decode(owned) !== canonical) githubFail(CODE)
    const prefix = encoder.encode('warpkeep.recovery-source-closure.v1\n')
    const domainBytes = new Uint8Array(prefix.length + owned.length)
    domainBytes.set(prefix)
    domainBytes.set(owned, prefix.length)
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', domainBytes))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    githubFail(CODE)
  }
}
