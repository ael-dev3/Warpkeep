import { describe, expect, it, vi } from 'vitest'
import {
  FarcasterVerifierUnavailableError,
  createConsensusFarcasterVerifier,
} from '../src/farcaster'
import type { FarcasterProofInput, FarcasterVerifier } from '../src/types'

const PROOF = Object.freeze({
  nonce: '12345678',
  domain: 'warpkeep.example',
  message: 'test-only SIWF message',
  signature: `0x${'00'.repeat(65)}` as `0x${string}`,
  acceptAuthAddress: true,
}) satisfies FarcasterProofInput

function succeeds(fid: string): FarcasterVerifier & { verify: ReturnType<typeof vi.fn> } {
  return { verify: vi.fn(async () => ({ fid })) }
}

function fails(error: Error): FarcasterVerifier & { verify: ReturnType<typeof vi.fn> } {
  return { verify: vi.fn(async () => { throw error }) }
}

describe('Farcaster verifier consensus', () => {
  it('returns only a matching canonical FID from both independent verifiers', async () => {
    const first = succeeds('12345')
    const second = succeeds('00012345')
    const verifier = createConsensusFarcasterVerifier([first, second])

    await expect(verifier.verify(PROOF)).resolves.toEqual({ fid: '12345' })
    expect(first.verify).toHaveBeenCalledOnce()
    expect(second.verify).toHaveBeenCalledOnce()
    expect(first.verify).toHaveBeenCalledWith(PROOF)
    expect(second.verify).toHaveBeenCalledWith(PROOF)
  })

  it('fails unavailable when successful verifiers disagree', async () => {
    const verifier = createConsensusFarcasterVerifier([
      succeeds('12345'),
      succeeds('54321'),
    ])

    await expect(verifier.verify(PROOF)).rejects.toBeInstanceOf(FarcasterVerifierUnavailableError)
  })

  it('fails unavailable when only one verifier succeeds', async () => {
    for (const failure of [
      new FarcasterVerifierUnavailableError(),
      new Error('invalid proof'),
    ]) {
      const verifier = createConsensusFarcasterVerifier([
        succeeds('12345'),
        fails(failure),
      ])
      await expect(verifier.verify(PROOF)).rejects.toBeInstanceOf(FarcasterVerifierUnavailableError)
    }
  })

  it('preserves provider outage and definitive rejection classifications', async () => {
    const unavailable = createConsensusFarcasterVerifier([
      fails(new FarcasterVerifierUnavailableError()),
      fails(new Error('invalid proof')),
    ])
    await expect(unavailable.verify(PROOF)).rejects.toBeInstanceOf(FarcasterVerifierUnavailableError)

    const invalid = createConsensusFarcasterVerifier([
      fails(new Error('invalid proof one')),
      fails(new Error('invalid proof two')),
    ])
    await expect(invalid.verify(PROOF)).rejects.toMatchObject({
      name: 'Error',
      message: 'Farcaster verification failed.',
    })
  })

  it('supports exactly one verifier for the explicitly local development profile', async () => {
    const only = succeeds('12345')
    await expect(createConsensusFarcasterVerifier([only]).verify(PROOF)).resolves.toEqual({ fid: '12345' })
    expect(() => createConsensusFarcasterVerifier([])).toThrow('Farcaster verifier configuration is invalid.')
    expect(() => createConsensusFarcasterVerifier([only, only, only])).toThrow(
      'Farcaster verifier configuration is invalid.',
    )
  })
})
