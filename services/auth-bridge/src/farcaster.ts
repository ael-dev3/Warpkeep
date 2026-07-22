import { createAppClient, viemConnector } from '@farcaster/auth-client'
import type { FarcasterProofInput, FarcasterVerifier, VerifiedFarcasterProof } from './types'

export class FarcasterVerifierUnavailableError extends Error {
  constructor() {
    super('Farcaster verification is unavailable.')
    this.name = 'FarcasterVerifierUnavailableError'
  }
}

function canonicalFid(value: number | bigint | string): string {
  const fid = typeof value === 'bigint' ? value : BigInt(value)
  if (fid < 1n) throw new Error('Farcaster verification failed.')
  return fid.toString(10)
}

function createSingleOfficialFarcasterVerifier(rpcUrl: string): FarcasterVerifier {
  const client = createAppClient({
    ethereum: viemConnector({ rpcUrl }),
  })

  return {
    async verify(input: FarcasterProofInput): Promise<VerifiedFarcasterProof> {
      let result: Awaited<ReturnType<typeof client.verifySignInMessage>>
      try {
        result = await client.verifySignInMessage({
          nonce: input.nonce,
          domain: input.domain,
          message: input.message,
          signature: input.signature,
          acceptAuthAddress: input.acceptAuthAddress,
        })
      } catch {
        throw new FarcasterVerifierUnavailableError()
      }
      if (result.isError) {
        if (result.error?.errCode === 'unavailable' || result.error?.errCode === 'unknown') {
          throw new FarcasterVerifierUnavailableError()
        }
        throw new Error('Farcaster verification failed.')
      }
      if (!result.fid) throw new Error('Farcaster verification failed.')
      return { fid: canonicalFid(result.fid) }
    },
  }
}

/**
 * Requires every configured verifier to independently return the same FID.
 * One verifier is supported only for the explicitly local development profile.
 */
export function createConsensusFarcasterVerifier(
  verifiers: readonly FarcasterVerifier[],
): FarcasterVerifier {
  if (verifiers.length < 1 || verifiers.length > 2) {
    throw new Error('Farcaster verifier configuration is invalid.')
  }

  return {
    async verify(input: FarcasterProofInput): Promise<VerifiedFarcasterProof> {
      const results = await Promise.allSettled(verifiers.map(async (verifier) => ({
        fid: canonicalFid((await verifier.verify(input)).fid),
      })))

      if (results.length === 1) {
        const [result] = results
        if (result.status === 'fulfilled') return result.value
        throw result.reason
      }

      const [first, second] = results
      if (first.status === 'fulfilled' && second.status === 'fulfilled') {
        if (first.value.fid === second.value.fid) return first.value
        throw new FarcasterVerifierUnavailableError()
      }
      if (first.status === 'fulfilled' || second.status === 'fulfilled') {
        throw new FarcasterVerifierUnavailableError()
      }
      if (
        first.reason instanceof FarcasterVerifierUnavailableError
        || second.reason instanceof FarcasterVerifierUnavailableError
      ) {
        throw new FarcasterVerifierUnavailableError()
      }
      throw new Error('Farcaster verification failed.')
    },
  }
}

/**
 * Uses Farcaster's official auth client. Each client checks the SIWF signature,
 * custody/auth address ownership, and FID resource with `acceptAuthAddress`.
 */
export function createOfficialFarcasterVerifier(rpcUrls: readonly string[]): FarcasterVerifier {
  return createConsensusFarcasterVerifier(rpcUrls.map(createSingleOfficialFarcasterVerifier))
}
