import { blake3 } from '@noble/hashes/blake3'

const encoder = new TextEncoder()

/**
 * SpacetimeDB 2.6.1 Identity::from_claims, including its c200 checksum prefix.
 * https://github.com/clockworklabs/SpacetimeDB/blob/052c83fe984a4c4eb7bb4f9afa5c6b1903891d87/crates/lib/src/identity.rs#L196
 * The host independently derives this identity from the authenticated issuer and
 * subject and rejects a supplied hex_identity that differs.
 */
export function spacetimeIdentityFromClaims(issuer: string, subject: string): string {
  for (const claim of [issuer, subject]) {
    if (typeof claim !== 'string' || encoder.encode(claim).length < 1 || encoder.encode(claim).length > 128) {
      throw new Error('Invalid SpacetimeDB identity claims.')
    }
  }
  const idHash = blake3(encoder.encode(`${issuer}|${subject}`)).subarray(0, 26)
  const checksumInput = new Uint8Array(28)
  checksumInput.set([0xc2, 0x00])
  checksumInput.set(idHash, 2)
  const identity = new Uint8Array(32)
  identity.set([0xc2, 0x00])
  identity.set(blake3(checksumInput).subarray(0, 4), 2)
  identity.set(idHash, 6)
  return Array.from(identity, byte => byte.toString(16).padStart(2, '0')).join('')
}
