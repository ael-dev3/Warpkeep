// @vitest-environment node
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { validateRecoveryActivationCandidate, createRecoveryActivationBinding, parseRecoveryBindingV2 } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryActivationCandidatePolicyForVersion, createRecoveryActivationBindingFromCandidate,
  validateRecoveryActivationCandidateV6, parseRecoveryBinding, parseRecoveryBindingV5 } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryBindingKeys, recoveryReceiptCommitmentV6 } from '../scripts/recovery-binding-projection.mjs';

const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
function versionedCandidate(version: 2 | 3 | 4 | 5 | 6) {
  const prior = recoveryBindingCandidate();
  const policy = recoveryActivationCandidatePolicyForVersion(version);
  return Object.fromEntries(recoveryBindingKeys(version).map(key => [key,
    Object.hasOwn(policy, key) ? policy[key] : Object.hasOwn(prior, key) ? prior[key] : '93'.repeat(32)]));
}
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

// Recorded from the pre-V6 implementations. Protect exact legacy serialized
// bindings and hash domains, including all generated commitments, from drift.
it.each([
  [2, 'b4bebd139415df9e25aebaee9d3639026cb58274d77172d68a566ceb0ba3f190'],
  [3, 'b58e32c3d4aa8ecee4ab051c4f2d009a6de2036e45c8249e7b4fe2be7eb7b058'],
  [4, '38e2cb621e58bcaebdf158ad303ffe00780851a9bfd4efcf605e44d118530dde'],
  [5, 'f857390371839e5afef80f2999a7c97629f0a19663d50fa2bd99e3b507cd7503'],
] as const)('preserves the exact V%s binding bytes', (version, expected) => {
  const binding = createRecoveryActivationBindingFromCandidate(encode(versionedCandidate(version)));
  expect(createHash('sha256').update(encode(binding)).digest('hex')).toBe(expected);
});

it('projects V6 server freeze evidence while preserving V5 dual adoption semantics', () => {
  const candidate = versionedCandidate(6);
  expect(validateRecoveryActivationCandidateV6(encode(candidate))).toEqual(candidate);
  const binding = createRecoveryActivationBindingFromCandidate(encode(candidate));
  expect(parseRecoveryBinding(encode(binding))).toEqual(binding);
  expect(binding.g001AdmissionControlProfile).toBe('warpkeep-genesis-001-server-freeze-v1');
  expect(binding.g001PlayerAccessEnabled).toBe(true);
  expect(binding.g001AdmissionStateMutationsEnabled).toBe(false);
  expect(binding.g001AccessRequestSubmissionsEnabled).toBe(false);
  expect(binding.ptrSingletonOwnerCount).toBe(1);
  expect(binding.g002PlayerCount).toBe(0);
  expect(Object.keys(binding).filter(key => key.startsWith('admissionMonitor'))).toEqual([]);
  expect(() => parseRecoveryBindingV5(encode(binding))).toThrow();
  expect(() => recoveryReceiptCommitmentV6('admissionMonitorSuspensionReceiptCommitment', binding)).toThrow();
});

it.each([
  ['g001AdmissionControlProfile', 'warpkeep-genesis001-admission-monitor-suspension-v1'],
  ['g001PlayerAccessEnabled', false],
  ['g001AdmissionStateMutationsEnabled', true],
  ['g001AccessRequestSubmissionsEnabled', true],
  ['g001FreezeConfirmationReceiptDigest', null],
  ['g001FreezeCurrentStateReceiptDigest', null],
  ['g001FreezeConfirmationReceiptCommitment', 'a'.repeat(64)],
  ['admissionMonitorDisabled', true],
  ['admissionMonitorLoaded', false],
] as const)('rejects unsafe or fabricated V6 field %s', (key, value) => {
  const candidate = versionedCandidate(6);
  candidate[key] = value;
  expect(() => validateRecoveryActivationCandidateV6(encode(candidate))).toThrow();
});

it.each(['g001FreezeConfirmationReceiptDigest', 'g001FreezeCurrentStateReceiptDigest'])(
  'binds every V6 commitment to %s', key => {
    const binding = { ...createRecoveryActivationBindingFromCandidate(encode(versionedCandidate(6))) };
    binding[key] = '91'.repeat(32);
    expect(() => parseRecoveryBinding(encode(binding))).toThrow();
  });
