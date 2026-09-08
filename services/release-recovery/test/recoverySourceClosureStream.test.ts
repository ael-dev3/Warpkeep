import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inspectRecoverySourceClosureArtifact } from '../src/archive.js'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/recoverySourceClosureZip.json', import.meta.url), 'utf8'),
) as { base64: string }
const bytes = Uint8Array.from(Buffer.from(fixture.base64, 'base64'))
function response(body: ReadableStream<Uint8Array>, length = bytes.length) {
  const result = new Response(body, {
    headers: { 'content-type': 'application/zip', 'content-length': String(length) },
  })
  Object.defineProperty(result, 'url', { value: 'https://objects.githubusercontent.com/source.zip' })
  return result
}
describe('bounded source ZIP transport', () => {
  it('accepts one-byte chunk boundaries', async () => {
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (offset === bytes.length) c.close()
        else c.enqueue(bytes.slice(offset, ++offset))
      },
    })
    expect(
      new TextDecoder().decode(
        (await inspectRecoverySourceClosureArtifact(response(body), { archiveByteLength: bytes.length }))
          .bytes,
      ),
    ).toBe('{}\n')
  })
  it('cancels a stalled body within the internal idle deadline', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    await expect(
      inspectRecoverySourceClosureArtifact(
        response(body),
        { archiveByteLength: bytes.length },
        { idleTimeoutMilliseconds: 5, totalTimeoutMilliseconds: 20 },
      ),
    ).rejects.toThrow('RECOVERY_GITHUB_ARCHIVE_INVALID')
    expect(cancelled).toBe(true)
  })
  it('refuses oversized declared source artifacts before pulling', async () => {
    let cancelled = false
    let pulled = false
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true
        },
        cancel() {
          cancelled = true
        },
      },
      { highWaterMark: 0 },
    )
    await expect(
      inspectRecoverySourceClosureArtifact(response(body, 17 * 1024 * 1024), {
        archiveByteLength: 17 * 1024 * 1024,
      }),
    ).rejects.toThrow('RECOVERY_GITHUB_ARCHIVE_INVALID')
    expect(pulled).toBe(false)
    expect(cancelled).toBe(true)
  })
  it.each(['short', 'long'])('refuses %s actual transport', async (kind) => {
    const changed = kind === 'short' ? bytes.slice(0, -1) : new Uint8Array([...bytes, 0])
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(changed)
        c.close()
      },
    })
    await expect(
      inspectRecoverySourceClosureArtifact(response(body), { archiveByteLength: bytes.length }),
    ).rejects.toThrow('RECOVERY_GITHUB_ARCHIVE_INVALID')
  })
})
