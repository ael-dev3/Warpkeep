import { githubFail, snapshotExactDataObject } from './config.js'
import { assertRecoveryPrivateKeyMatchesPinned } from './crypto.js'
import { parseGitHubJsonObject } from './http.js'
import { base64UrlEncode } from './protocol.js'

const CODE = 'RECOVERY_SIGNER_SECRETS_INVALID'

function decodeSecret(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) githubFail(CODE)
  const bytes = Uint8Array.from(atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='), c => c.charCodeAt(0))
  if (bytes.length !== 32 || base64UrlEncode(bytes) !== value) {
    bytes.fill(0)
    githubFail(CODE)
  }
  return bytes
}

/** Deploy-owned secrets only. No network or durable state is touched during validation. */
export async function validateSignerSecrets(input: unknown): Promise<Readonly<{
  privateJwk: JsonWebKey; rpcCredential: string
}>> {
  let jsonBytes: Uint8Array | undefined
  let scalar: Uint8Array | undefined
  let rpc: Uint8Array | undefined
  try {
    const source = snapshotExactDataObject(input, ['RECOVERY_SIGNING_PRIVATE_JWK', 'RELEASE_RECOVERY_RPC_SECRET'], CODE)
    const json = source.RECOVERY_SIGNING_PRIVATE_JWK
    if (typeof json !== 'string' || json.length > 4096) githubFail(CODE)
    jsonBytes = new TextEncoder().encode(json)
    if (jsonBytes.length > 4096) githubFail(CODE)
    const parsed = snapshotExactDataObject(parseGitHubJsonObject(jsonBytes, CODE, []), ['kty', 'crv', 'x', 'y', 'd'], CODE)
    scalar = decodeSecret(parsed.d)
    rpc = decodeSecret(source.RELEASE_RECOVERY_RPC_SECRET)
    let difference = 0
    for (let index = 0; index < 32; index += 1) difference |= scalar[index] ^ rpc[index]
    if (difference === 0) githubFail(CODE)
    await assertRecoveryPrivateKeyMatchesPinned(parsed)
    return Object.freeze({ privateJwk: Object.freeze({ ...parsed }) as JsonWebKey,
      rpcCredential: source.RELEASE_RECOVERY_RPC_SECRET as string })
  } catch { return githubFail(CODE) }
  finally { jsonBytes?.fill(0); scalar?.fill(0); rpc?.fill(0) }
}
