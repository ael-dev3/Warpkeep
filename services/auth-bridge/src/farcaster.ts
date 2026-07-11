import { createAppClient, viemConnector } from '@farcaster/auth-client'
import type { FarcasterProofInput, FarcasterVerifier, VerifiedFarcasterProof } from './types'

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
      const result = await client.verifySignInMessage({
        nonce: input.nonce,
        domain: input.domain,
        message: input.message,
        signature: input.signature,
        acceptAuthAddress: input.acceptAuthAddress,
      })
      if (result.isError || !result.fid) throw new Error('Farcaster verification failed.')
      return { fid: canonicalFid(result.fid) }
    },
  }
}
