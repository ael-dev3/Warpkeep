import { expect, it } from 'vitest'
import { RECOVERY_BINDING_KEYS_V2 as localKeys, recoveryReceiptCommitmentV2,
  recoveryAuthorizationCoreSha256 } from '../../../scripts/recovery-binding-projection.mjs'
import { RECOVERY_BINDING_KEYS_V2, RECOVERY_RECEIPT_COMMITMENT_DIGESTS } from '../src/githubEvidence.js'
import { serializeExactObject, sha256Hex, type JsonValue } from '../src/protocol.js'

it('matches local projection bytes to the receiver serialization and domains', async () => {
  expect(localKeys).toEqual(RECOVERY_BINDING_KEYS_V2)
  const binding: Record<string, JsonValue> = Object.fromEntries(localKeys.map(key => [key, null]))
  binding.schemaVersion = 2
  binding.recoveryAuthorizationEpoch = 7
  binding.recoveryAuthorizationCoreSha256 = 'a'.repeat(64)
  const excluded = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)])
  const keys = RECOVERY_BINDING_KEYS_V2.filter(key => !excluded.has(key))
  const receipt = Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!]))
  for (const key of Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)) {
    const expected = await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v2\n`, serializeExactObject(keys, receipt as never))
    expect(recoveryReceiptCommitmentV2(key, binding)).toBe(expected)
    binding[key] = expected
  }
  expect(recoveryAuthorizationCoreSha256(binding)).toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v1\n',
    serializeExactObject(RECOVERY_BINDING_KEYS_V2, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
})
