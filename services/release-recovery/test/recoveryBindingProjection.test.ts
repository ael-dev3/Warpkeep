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


it('independently verifies root-generated V4 adoption fields and receipt/core domains', async () => {
  const local = await import('../../../scripts/recovery-binding-projection.mjs')
  const receiver = await import('../src/githubEvidence.js')
  expect(receiver.RECOVERY_BINDING_KEYS_V4).toBeDefined()
  expect(local.RECOVERY_BINDING_KEYS_V4).toEqual(receiver.RECOVERY_BINDING_KEYS_V4)
  const prior = recoveryBindingCandidate()
  const candidate = Object.fromEntries(local.RECOVERY_BINDING_KEYS_V4.map(key => [key,
    key === 'schemaVersion' ? 4 : key === 'profile' ? 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4'
      : key === 'ptrExistingUpdateReceiptDigest' ? '93'.repeat(32)
        : key === 'ptrExistingStateAdoptionReceiptDigest' ? '94'.repeat(32)
          : key === 'ptrExpectedSealedStateHmacSha256' ? '95'.repeat(32)
            : key === 'ptrExpectedOwnerInvariantHmacSha256' ? '96'.repeat(32)
              : key.endsWith('Commitment') ? null : ['ptrSealed', 'ptrPopulationGuardPassed'].includes(key) ? true
                : key === 'ptrSingletonOwnerCount' ? 1 : key === 'ptrGeneralAdmissionCount' ? 0 : prior[key],
  ]))
  const { createRecoveryActivationBindingV4 } = await import('../../../scripts/recovery-activation-candidate.mjs')
  const binding = createRecoveryActivationBindingV4(`${JSON.stringify(candidate, null, 2)}\n`)
  const excluded = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(receiver.RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V4)])
  const keys = receiver.RECOVERY_BINDING_KEYS_V4.filter(key => !excluded.has(key))
  const receipt = Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!]))
  for (const key of Object.keys(receiver.RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V4)) {
    expect(binding[key]).toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v4\n`,
      serializeExactObject(keys, receipt as never)))
    expect(binding[key]).not.toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v3\n`,
      serializeExactObject(keys, receipt as never)))
  }
  expect(binding.recoveryAuthorizationCoreSha256).toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v4\n',
    serializeExactObject(receiver.RECOVERY_BINDING_KEYS_V4, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
})

it('independently verifies root-generated V5 dual adoption and separate receipt/core domains', async () => {
  const local = await import('../../../scripts/recovery-binding-projection.mjs')
  const receiver = await import('../src/githubEvidence.js')
  expect(receiver.RECOVERY_BINDING_KEYS_V5).toBeDefined()
  expect(local.RECOVERY_BINDING_KEYS_V5).toEqual(receiver.RECOVERY_BINDING_KEYS_V5)
  const prior = recoveryBindingCandidate()
  const overrides: Record<string, JsonValue> = {
    schemaVersion: 5, profile: 'warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5',
    ptrExistingUpdateReceiptDigest: '93'.repeat(32), ptrExistingStateAdoptionReceiptDigest: '94'.repeat(32),
    ptrExpectedSealedStateHmacSha256: '95'.repeat(32), ptrExpectedOwnerInvariantHmacSha256: '96'.repeat(32),
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
    g002ExistingUpdateReceiptDigest: 'a3'.repeat(32), g002ExistingStateAdoptionReceiptDigest: 'a4'.repeat(32),
    g002ExpectedSealedStateHmacSha256: 'a5'.repeat(32), g002ReleaseVersion: '0.4.0', g002AtlasReady: true,
    g002Sealed: true, g002PopulationGuardPassed: true, g002PlayerCount: 0, g002GeneralAdmissionCount: 0,
    g002AdmissionsOpen: false, g002AccessRequestsOpen: false,
  }
  const candidate = Object.fromEntries(local.RECOVERY_BINDING_KEYS_V5.map(key => [key,
    key.endsWith('Commitment') ? null : Object.hasOwn(overrides, key) ? overrides[key] : prior[key],
  ]))
  const { createRecoveryActivationBindingV5 } = await import('../../../scripts/recovery-activation-candidate.mjs')
  const binding = createRecoveryActivationBindingV5(`${JSON.stringify(candidate, null, 2)}\n`)
  const excluded = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(receiver.RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V5)])
  const keys = receiver.RECOVERY_BINDING_KEYS_V5.filter(key => !excluded.has(key))
  const receipt = Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]!]))
  for (const key of Object.keys(receiver.RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V5)) {
    expect(binding[key]).toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v5\n`,
      serializeExactObject(keys, receipt as never)))
    expect(binding[key]).not.toBe(await sha256Hex(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v4\n`,
      serializeExactObject(keys, receipt as never)))
  }
  expect(binding.recoveryAuthorizationCoreSha256).toBe(await sha256Hex(
    'warpkeep.0.4.0.recovery-authorization-core.v5\n',
    serializeExactObject(receiver.RECOVERY_BINDING_KEYS_V5, { ...binding, recoveryAuthorizationCoreSha256: null } as never),
  ))
  for (const legacy of ['g002PublishReceiptDigest', 'g002FreshStatusDigest', 'g002AtlasImportReceiptDigest',
    'g002SealedLiveReceiptDigest', 'ptrOwnerProvisionReceiptDigest', 'admissionNotificationsEnabled']) {
    expect(binding).not.toHaveProperty(legacy)
  }
})
