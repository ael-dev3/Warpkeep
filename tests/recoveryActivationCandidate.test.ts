// @vitest-environment node
import { expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { validateRecoveryActivationCandidate, createRecoveryActivationBinding, parseRecoveryBindingV2 } from '../scripts/recovery-activation-candidate.mjs';

const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
it('accepts the complete synthetic candidate as data, not deployment authority', () => {
  const candidate = recoveryBindingCandidate();
  expect(validateRecoveryActivationCandidate(encode(candidate))).toEqual(candidate);
});
it.each(Object.keys(recoveryBindingCandidate()))('rejects missing or invalid required candidate field %s', key => {
  const candidate = recoveryBindingCandidate();
  candidate[key] = candidate[key] === null ? 'unexpected' : null;
  expect(() => validateRecoveryActivationCandidate(encode(candidate))).toThrow();
});
it.each(['g001PlayerAccessEnabled', 'g001AdmissionStateMutationsEnabled', 'g002PlayerAccessEnabled',
  'ptrOwnerEnabled', 'ptrAdmissionsOpen', 'admissionMonitorDisabled'])('rejects unsafe policy %s', key => {
  const candidate = recoveryBindingCandidate();
  candidate[key] = !candidate[key];
  expect(() => validateRecoveryActivationCandidate(encode(candidate))).toThrow();
});
it('rejects cross-realm database reuse', () => {
  const candidate = recoveryBindingCandidate();
  candidate.ptrDatabaseIdentity = candidate.g002DatabaseIdentity!;
  expect(() => validateRecoveryActivationCandidate(encode(candidate))).toThrow();
});

it('generates and verifies a completed static binding without historical receipts', () => {
  const binding = createRecoveryActivationBinding(encode(recoveryBindingCandidate()));
  expect(binding.g001FreezePublishReceiptDigest).toBeNull();
  expect(binding.g001FreezePublishReceiptCommitment).toBeNull();
  expect(binding.recoveryAuthorizationCoreSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(parseRecoveryBindingV2(encode(binding))).toEqual(binding);
  expect(Object.isFrozen(binding)).toBe(true);
});

it.each(Object.keys(recoveryBindingCandidate()).filter(key => key.endsWith('Commitment')
  && key !== 'g001FreezePublishReceiptCommitment').concat('recoveryAuthorizationCoreSha256'))(
  'rejects altered stored hash %s', key => {
    const binding = { ...createRecoveryActivationBinding(encode(recoveryBindingCandidate())) };
    binding[key] = '0'.repeat(64);
    expect(() => parseRecoveryBindingV2(encode(binding))).toThrow();
  });

it('refuses to overwrite prepopulated candidate commitments', () => {
  const candidate = recoveryBindingCandidate();
  candidate.ptrPublishReceiptCommitment = 'a'.repeat(64);
  expect(() => createRecoveryActivationBinding(encode(candidate))).toThrow();
});

// Catch replacing the semantic checks with scalar/type-only validation.
it.each([
  ['recoveryRepository', 'other/Warpkeep'],
  ['recoveryRef', 'refs/heads/development'],
  ['recoveryKeyThumbprint', 'a'.repeat(43)],
  ['g001ReleaseVersion', '0.4.0'],
  ['g001PolicyReceiptDigest', 'a'.repeat(64)],
  ['g002AtlasId', 'PTR_GREATER_REALM'],
  ['ptrOwnerAnchorRows', 2],
  ['g002PlayersV2', 1],
  ['ptrAccessRequests', 1],
  ['recoveryAuthorizationEpoch', 0],
  ['recoveryAuthorizationEpoch', -1],
  ['recoveryAuthorizationEpoch', 1.5],
  ['recoveryAuthWorkerConfigEpoch', 0],
  ['recoveryAuthorizationRequestId', '00000000-0000-0000-0000-000000000000'],
  ['recoveryAuthWorkerVersionId', '550e8400-e29b-41d4-7716-446655440000'],
  ['ptrDatabaseIdentity', 'A'.repeat(64)],
  ['preparationSourceCommit', 'a'.repeat(39)],
] as const)('rejects well-typed but invalid %s: %s', (key, value) => {
  const candidate = recoveryBindingCandidate();
  candidate[key] = value;
  expect(() => createRecoveryActivationBinding(encode(candidate))).toThrow();
});

it('accepts dynamic positive epochs without pinning a particular activation', () => {
  const candidate = recoveryBindingCandidate();
  candidate.recoveryAuthorizationEpoch = 17;
  candidate.recoveryAuthWorkerConfigEpoch = 29;
  const binding = parseRecoveryBindingV2(encode(createRecoveryActivationBinding(encode(candidate))));
  expect(binding.recoveryAuthorizationEpoch).toBe(17);
  expect(binding.recoveryAuthWorkerConfigEpoch).toBe(29);
});

it.each(['g001PolicySourceCommit', 'authBridgeSourceCommit'])(
  'rejects %s detached from the preparation source', key => {
    const candidate = recoveryBindingCandidate();
    candidate[key] = 'c'.repeat(40);
    expect(() => createRecoveryActivationBinding(encode(candidate))).toThrow();
  });
