// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { g002PtrAdoptionKeys as keys, g002AdoptionKeys, recoveryG002PtrAdoptionCandidate as candidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import * as projection from '../scripts/recovery-binding-projection.mjs';
import * as activation from '../scripts/recovery-activation-candidate.mjs';

const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
function referenceHash(domain: string, fields: readonly string[], value: Record<string, unknown>) {
  const prefix = Buffer.from(`warpkeep-recovery-v1:${domain}:`);
  const body = Buffer.from(JSON.stringify(Object.fromEntries(fields.map(key => [key,
    key === 'recoveryAuthorizationCoreSha256' ? null : value[key]]))));
  const size = Buffer.alloc(4); size.writeUInt32BE(prefix.length);
  const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(body.length));
  return createHash('sha256').update(size).update(prefix).update(length).update(body).digest('hex');
}

describe('explicit G002 and PTR preserved-state public binding V5', () => {
  it('dispatches the exact V5 document and commitments without initialization or notification claims', () => {
    const input = candidate();
    expect(projection.RECOVERY_BINDING_KEYS_V5).toEqual(keys);
    expect(projection.recoveryBindingKeys(5)).toEqual(keys);
    expect(activation.validateRecoveryActivationCandidateV5(encode(input))).toEqual(input);
    expect(activation.validateRecoveryActivationCandidateDocument(encode(input))).toEqual(input);
    expect(projection.parseRecoveryBindingDocumentV5(encode(input))).toEqual(input);
    const binding = activation.createRecoveryActivationBindingV5(encode(input));
    expect(activation.createRecoveryActivationBindingFromCandidate(encode(input))).toEqual(binding);
    expect(activation.parseRecoveryBinding(encode(binding))).toEqual(binding);
    expect(activation.parseRecoveryBindingV5(encode(binding))).toEqual(binding);
    expect(Object.keys(binding)).toEqual(keys);
    expect(Object.isFrozen(binding)).toBe(true);
    for (const key of keys.filter(key => key.endsWith('Commitment') && key !== 'g001FreezePublishReceiptCommitment')) {
      expect(binding[key]).toBe(referenceHash(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v5\n`, keys.filter(key => !key.endsWith('Commitment')), binding));
      expect(projection.recoveryReceiptCommitmentV5(key, binding)).toBe(binding[key]);
      expect(projection.recoveryReceiptCommitment(key, binding)).toBe(binding[key]);
    }
    const core = referenceHash('warpkeep.0.4.0.recovery-authorization-core.v5\n', keys, binding);
    expect(binding.recoveryAuthorizationCoreSha256).toBe(core);
    expect(projection.recoveryAuthorizationCoreSha256V5(binding)).toBe(core);
    expect(projection.recoveryAuthorizationCoreSha256ForBinding(binding)).toBe(core);
  });
  it('retains the V4 non-G002 policy except unsupported notification state', () => {
    const before = activation.recoveryActivationCandidatePolicyForVersion(4);
    const after = activation.recoveryActivationCandidatePolicyForVersion(5);
    for (const [key, value] of Object.entries(before)) {
      if (!key.startsWith('g002') && !['schemaVersion', 'profile', 'admissionNotificationsEnabled'].includes(key)) expect(after[key]).toBe(value);
    }
    expect(after).not.toHaveProperty('admissionNotificationsEnabled');
    expect(Object.keys(candidate()).filter(key => key.startsWith('g002'))).toEqual(g002AdoptionKeys);
  });
  it.each(keys)('requires complete V5 fact %s', key => {
    const input = candidate(); delete input[key];
    expect(() => activation.validateRecoveryActivationCandidateDocument(encode(input))).toThrow();
  });
  it.each([
    ['g002AtlasReady', false], ['g002Sealed', false], ['g002PopulationGuardPassed', false],
    ['g002PlayerCount', 1], ['g002GeneralAdmissionCount', 1], ['g002AdmissionsOpen', true],
    ['g002AccessRequestsOpen', true], ['g002ReleaseVersion', '0.4.0-g002.1'],
    ['g002ExistingUpdateReceiptDigest', null], ['g002ExistingStateAdoptionReceiptDigest', null],
    ['g002ExpectedSealedStateHmacSha256', 'A'.repeat(64)],
  ] as const)('rejects unsafe or incomplete signed state %s', (key, value) => {
    const input = candidate(); input[key] = value;
    expect(() => activation.createRecoveryActivationBindingFromCandidate(encode(input))).toThrow();
  });
  it.each(keys.filter(key => !key.endsWith('Commitment') && !['schemaVersion', 'profile', 'recoveryAuthorizationCoreSha256'].includes(key)))(
    'binds complete public context in both adoption commitments: %s', key => {
      const input = candidate(), changed = { ...input }, value = input[key];
      changed[key] = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${value ?? ''}a`;
      for (const commitment of ['g002ExistingStateAdoptionReceiptCommitment', 'ptrExistingStateAdoptionReceiptCommitment']) {
        expect(projection.recoveryReceiptCommitmentV5(commitment, changed)).not.toBe(projection.recoveryReceiptCommitmentV5(commitment, input));
      }
    });
  it.each(Object.keys(recoveryBindingCandidate()).filter(key => !keys.includes(key)))(
    'rejects obsolete or unsupported field %s', key => {
      expect(() => activation.validateRecoveryActivationCandidateDocument(encode({ ...candidate(), [key]: recoveryBindingCandidate()[key] }))).toThrow();
    });
  it('rejects mixed versions, obsolete commitments and wrong digest domains', () => {
    const input = candidate();
    for (const version of [2, 3, 4, 6]) expect(() => projection.parseRecoveryBindingDocument(encode({ ...input, schemaVersion: version }))).toThrow();
    expect(() => projection.parseRecoveryBindingDocumentV4(encode(input))).toThrow();
    expect(() => projection.recoveryReceiptCommitmentV5('g002AtlasImportReceiptCommitment', input)).toThrow();
    const binding = { ...activation.createRecoveryActivationBindingV5(encode(input)) };
    binding.g002ExistingStateAdoptionReceiptCommitment = referenceHash('warpkeep.0.4.0.recovery-sealed-launch.g002ExistingStateAdoptionReceiptCommitment.v4\n', keys.filter(key => !key.endsWith('Commitment')), binding);
    expect(() => activation.parseRecoveryBinding(encode(binding))).toThrow();
    expect(() => projection.recoveryBindingKeys(6 as 5)).toThrow();
  });
});
