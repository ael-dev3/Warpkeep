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

/**
 * Uses Farcaster's official auth client. The client checks the SIWF signature,
 * custody/auth address ownership, and FID resource with `acceptAuthAddress`.
 */
export function createOfficialFarcasterVerifier(rpcUrl: string): FarcasterVerifier {
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
