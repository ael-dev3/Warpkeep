import { describe, expect, it, vi } from 'vitest'

describe('release recovery WSL materializer response bounds', () => {
  it('does not execute the fixed guest entrypoint when imported for validation', async () => {
    const priorExitCode = process.exitCode
    process.exitCode = undefined
    try {
      vi.resetModules()
      await import('../scripts/release-recovery-wsl-materialize.mjs')
      expect(process.exitCode).toBeUndefined()
    } finally {
      process.exitCode = priorExitCode
    }
  })

  it('cancels while streaming when the next chunk crosses the byte limit', async () => {
    const priorExitCode = process.exitCode
    process.exitCode = undefined
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any
    process.exitCode = priorExitCode

    expect(typeof materializer.readBoundedResponse).toBe('function')
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: Uint8Array.of(1, 2, 3) })
      .mockResolvedValueOnce({ done: false, value: Uint8Array.of(4, 5, 6) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1_000_000) })
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const arrayBuffer = vi.fn(() => {
      throw new Error('whole-body allocation must not run')
    })
    const response = {
      url: 'http://127.0.0.1:12345/v1/identity',
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      body: { getReader: () => ({ read, cancel, releaseLock }) },
      arrayBuffer,
    }

    await expect(materializer.readBoundedResponse(
      response,
      'http://127.0.0.1:12345/v1/identity',
      5,
    )).rejects.toBeInstanceOf(Error)
    expect(read).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(releaseLock).toHaveBeenCalledTimes(1)
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('derives Keccak-256 locally without an unauthenticated cache module', async () => {
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any
    expect(Buffer.from(materializer.keccak256Bytes(new Uint8Array())).toString('hex'))
      .toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
    expect(Buffer.from(materializer.keccak256Bytes(Buffer.from('abc'))).toString('hex'))
      .toBe('4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45')
  })
})
