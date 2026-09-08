import { expect, it } from 'vitest'
import { RECOVERY_BINDING_KEYS_V2 as localKeys, recoveryReceiptCommitmentV2,
  recoveryAuthorizationCoreSha256 } from '../../../scripts/recovery-binding-projection.mjs'
import { RECOVERY_BINDING_KEYS_V2, RECOVERY_RECEIPT_COMMITMENT_DIGESTS } from '../src/githubEvidence.js'
import { serializeExactObject, sha256Hex, type JsonValue } from '../src/protocol.js'
import { createRecoveryActivationBinding } from '../../../scripts/recovery-activation-candidate.mjs'
import { recoveryBindingCandidate } from '../../../tests/fixtures/recoveryBindingCandidate.js'
import { RECOVERY_BINDING_KEYS_V3 as localKeysV3 } from '../../../scripts/recovery-binding-projection.mjs'
import { createRecoveryActivationBindingV3 } from '../../../scripts/recovery-activation-candidate.mjs'
import { RECOVERY_BINDING_KEYS_V3, RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3 } from '../src/githubEvidence.js'

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

it('independently verifies every generated complete-candidate commitment and core', async () => {
  const binding = createRecoveryActivationBinding(`${JSON.stringify(recoveryBindingCandidate(), null, 2)}\n`)
  const excluded = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)])
  const keys = RECOVERY_BINDING_KEYS_V2.filter(key => !excluded.has(key))
  const receipt = Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!]))
  for (const key of Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS)) {
    expect(binding[key]).toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v2\n`,
      serializeExactObject(keys, receipt as never)))
  }
  expect(binding.recoveryAuthorizationCoreSha256).toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v1\n',
    serializeExactObject(RECOVERY_BINDING_KEYS_V2, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
})

it('independently verifies root-generated V3 bytes and separate receipt/core domains', async () => {
  expect(localKeysV3).toEqual(RECOVERY_BINDING_KEYS_V3)
  const prior = recoveryBindingCandidate()
  const candidate = Object.fromEntries(localKeysV3.map(key => [key,
    key === 'schemaVersion' ? 3 : key === 'profile' ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'
      : key === 'ptrExistingUpdateReceiptDigest' ? '93'.repeat(32)
        : key === 'ptrExistingUpdateReceiptCommitment' ? null : prior[key],
  ]))
  const binding = createRecoveryActivationBindingV3(`${JSON.stringify(candidate, null, 2)}\n`)
  const excluded = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3)])
  const keys = RECOVERY_BINDING_KEYS_V3.filter(key => !excluded.has(key))
  const receipt = Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!]))
  for (const key of Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3)) {
    expect(binding[key]).toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v3\n`,
      serializeExactObject(keys, receipt as never)))
    expect(binding[key]).not.toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v2\n`,
      serializeExactObject(keys, receipt as never)))
  }
  expect(binding.recoveryAuthorizationCoreSha256).toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v3\n',
    serializeExactObject(RECOVERY_BINDING_KEYS_V3, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
  expect(binding.recoveryAuthorizationCoreSha256).not.toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v1\n',
    serializeExactObject(RECOVERY_BINDING_KEYS_V3, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
})
