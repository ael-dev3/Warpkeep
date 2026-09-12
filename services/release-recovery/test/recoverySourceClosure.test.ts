import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  validateRecoverySourceClosureArtifact,
  type RecoverySourceTreeEntry,
} from '../src/recoverySourceClosure.js'
import { inspectRecoverySourceClosureArtifact } from '../src/archive.js'
const vector = JSON.parse(
  readFileSync(new URL('./fixtures/recoverySourceClosureRoot.json', import.meta.url), 'utf8'),
) as { canonical: string; sha256: string }
const document = JSON.parse(vector.canonical)
const tree = new Map<string, RecoverySourceTreeEntry>(
  document.entries.map((e: any) => [
    e.path,
    { path: e.path, mode: e.mode, type: 'blob', sha: e.oid, size: e.byteLength },
  ]),
)
const bytes = new TextEncoder().encode(vector.canonical)
const validate = (body = bytes, entries = tree) =>
  validateRecoverySourceClosureArtifact(body, {
    sourceCommit: document.sourceCommit,
    sourceTree: document.sourceTree,
    tree: entries,
  })
describe('authenticated source closure canonical inventory', () => {
  it('matches actual root codec canonical bytes and independently domain-hashed digest', async () =>
    expect(await validate()).toBe(vector.sha256))
  it('rejects an empty inventory just as the root producer does', async () => {
    const value = { ...document, entries: [] }
    await expect(validate(new TextEncoder().encode(JSON.stringify(value) + '\n'), new Map())).rejects.toThrow(
      'RECOVERY_GITHUB_EVIDENCE_INVALID',
    )
  })
  it.each([
    'unknown',
    'duplicate',
    'whitespace',
    'missing',
    'extra',
    'mode',
    'oid',
    'size',
    'rawHash',
    'commit',
    'tree',
    'order',
  ])('rejects %s disagreement', async (kind) => {
    const value = JSON.parse(vector.canonical)
    let source: string
    if (kind === 'unknown') value.extra = true
    if (kind === 'missing') value.entries.pop()
    if (kind === 'extra') value.entries.push({ ...value.entries[1], path: 'zzz' })
    if (kind === 'mode') value.entries[0].mode = '100755'
    if (kind === 'oid') value.entries[0].oid = '0'.repeat(40)
    if (kind === 'size') value.entries[0].byteLength++
    if (kind === 'rawHash') value.entries[0].sha256 = 'X'.repeat(64)
    if (kind === 'commit') value.sourceCommit = '0'.repeat(40)
    if (kind === 'tree') value.sourceTree = '0'.repeat(40)
    if (kind === 'order') value.entries.reverse()
    source = JSON.stringify(value) + '\n'
    if (kind === 'duplicate')
      source = source.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')
    if (kind === 'whitespace') source = ' ' + source
    await expect(validate(new TextEncoder().encode(source))).rejects.toThrow(
      'RECOVERY_GITHUB_EVIDENCE_INVALID',
    )
  })
  it.each(['120000', '160000'])(
    'refuses unsupported complete-tree mode %s, rather than filtering it',
    async (mode) => {
      const changed = new Map(tree)
      changed.set('unsafe', {
        path: 'unsafe',
        mode,
        type: mode === '160000' ? 'commit' : 'blob',
        sha: '0'.repeat(40),
        size: 1,
      })
      await expect(validate(bytes, changed)).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
    },
  )
})
const pinned = JSON.parse(
  readFileSync(new URL('./fixtures/recoverySourceClosureZip.json', import.meta.url), 'utf8'),
) as { base64: string }
const zip = Uint8Array.from(Buffer.from(pinned.base64, 'base64'))
function response(body: Uint8Array) {
  const r = new Response(body.slice().buffer, {
    headers: { 'content-type': 'application/zip', 'content-length': String(body.length) },
  })
  Object.defineProperty(r, 'url', { value: 'https://objects.githubusercontent.com/source.zip' })
  return r
}
describe('fixed source uploader ZIP', () => {
  it('accepts actual pinned helper output with producer Linux mode600 stat', async () => {
    const result = await inspectRecoverySourceClosureArtifact(response(zip), {
      archiveByteLength: zip.length,
    })
    expect(new TextDecoder().decode(result.bytes)).toBe('{}\n')
  })
  it.each(['prefix', 'trailing', 'name', 'mode', 'crc', 'descriptor', 'offset', 'count', 'method'])(
    'refuses %s mutation',
    async (kind) => {
      let b = zip.slice()
      const v = new DataView(b.buffer)
      const central = v.getUint32(b.length - 6, true)
      if (kind === 'prefix') b = new Uint8Array([0, ...b])
      if (kind === 'trailing') b = new Uint8Array([...b, 0])
      if (kind === 'name') b[30] = 0x78
      if (kind === 'mode') v.setUint32(central + 38, 0x81a40020, true)
      if (kind === 'crc') b[30 + 29] ^= 1
      if (kind === 'descriptor') b[central - 16] ^= 1
      if (kind === 'offset') v.setUint32(b.length - 6, central + 1, true)
      if (kind === 'count') v.setUint16(b.length - 12, 2, true)
      if (kind === 'method') v.setUint16(8, 8, true)
      await expect(
        inspectRecoverySourceClosureArtifact(response(b), { archiveByteLength: b.length }),
      ).rejects.toThrow('RECOVERY_GITHUB_ARCHIVE_INVALID')
    },
  )
})
