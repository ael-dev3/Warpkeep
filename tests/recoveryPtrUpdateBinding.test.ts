// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import * as projection from '../scripts/recovery-binding-projection.mjs';
import * as activation from '../scripts/recovery-activation-candidate.mjs';
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const freshKeys = ['ptrPublishReceiptDigest', 'ptrPublishReceiptCommitment', 'ptrFreshStatusDigest', 'ptrFreshStatusCommitment'];
const expectedKeys = projection.RECOVERY_BINDING_KEYS_V2.flatMap(key => key === 'ptrPublishReceiptDigest'
  ? ['ptrExistingUpdateReceiptDigest', 'ptrExistingUpdateReceiptCommitment'] : freshKeys.includes(key) ? [] : [key]);
const candidate = () => {
  const old = recoveryBindingCandidate();
  return Object.fromEntries(expectedKeys.map(key => [key, key === 'schemaVersion' ? 3 : key === 'profile'
    ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' : key === 'ptrExistingUpdateReceiptDigest' ? '9'.repeat(64)
      : key === 'ptrExistingUpdateReceiptCommitment' ? null : old[key]]));
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function referenceHash(domain: string, keys: readonly string[], binding: Record<string, unknown>) {
  const prefix = Buffer.from(`warpkeep-recovery-v1:${domain}:`);
  const body = Buffer.from(JSON.stringify(Object.fromEntries(keys.map(key => [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]]))));
  const length = Buffer.alloc(4); length.writeUInt32BE(prefix.length);
  const bodyLength = Buffer.alloc(8); bodyLength.writeBigUInt64BE(BigInt(body.length));
  return createHash('sha256').update(length).update(prefix).update(bodyLength).update(body).digest('hex');
}
describe('explicit PTR existing-update binding v3', () => {
  it('preserves complete V2 canonical output and hash vectors', () => {
    const old = activation.createRecoveryActivationBinding(encode(recoveryBindingCandidate()));
    expect(sha(encode(old))).toBe('b4bebd139415df9e25aebaee9d3639026cb58274d77172d68a566ceb0ba3f190');
    expect(old.recoveryAuthorizationCoreSha256).toBe('36692e154818c1fb2bd32117ca02e8d6ac9347dfb19cc66c5aa240848a26fb01');
    expect(projection.recoveryAuthorizationCoreSha256(old)).toBe(old.recoveryAuthorizationCoreSha256);
    expect(activation.parseRecoveryBindingV2(encode(old))).toEqual(old);
  });
  it('uses only the explicit ordered replacement and preserves every legacy policy', () => {
    expect(projection.RECOVERY_BINDING_KEYS_V3).toEqual(expectedKeys);
    expect(projection.recoveryBindingKeys(2)).toEqual(projection.RECOVERY_BINDING_KEYS_V2);
    expect(projection.recoveryBindingKeys(3)).toEqual(expectedKeys);
    const old = activation.recoveryActivationCandidatePolicy(), next = activation.recoveryActivationCandidatePolicyForVersion(3);
    for (const [key, value] of Object.entries(old)) {
      if (!freshKeys.includes(key) && !['schemaVersion', 'profile'].includes(key)) expect(next[key]).toEqual(value);
    }
    expect(next.schemaVersion).toBe(3); expect(next.ptrExistingUpdateReceiptCommitment).toBeNull();
    expect(activation.recoveryActivationCandidatePolicyForVersion(2)).toEqual(old);
  });
  it('creates, parses and dispatches V3 as static data without granting authority', () => {
    const input = candidate(), source = encode(input);
    expect(projection.parseRecoveryBindingDocumentV3(source)).toEqual(input);
    expect(projection.parseRecoveryBindingDocument(source)).toEqual(input);
    expect(activation.validateRecoveryActivationCandidateV3(source)).toEqual(input);
    expect(activation.validateRecoveryActivationCandidateDocument(source)).toEqual(input);
    const binding = activation.createRecoveryActivationBindingV3(source);
    expect(activation.createRecoveryActivationBindingFromCandidate(source)).toEqual(binding);
    expect(activation.parseRecoveryBindingV3(encode(binding))).toEqual(binding);
    expect(activation.parseRecoveryBinding(encode(binding))).toEqual(binding);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.keys(binding)).toEqual(expectedKeys);
  });
  it('dispatches V2 without changing its canonical binding', () => {
    const source = encode(recoveryBindingCandidate());
    const binding = activation.createRecoveryActivationBinding(source);
    expect(activation.createRecoveryActivationBindingFromCandidate(source)).toEqual(binding);
    expect(activation.parseRecoveryBinding(encode(binding))).toEqual(binding);
    expect(projection.recoveryAuthorizationCoreSha256ForBinding(binding)).toBe(binding.recoveryAuthorizationCoreSha256);
    expect(projection.recoveryReceiptCommitment('ptrPublishReceiptCommitment', binding)).toBe(binding.ptrPublishReceiptCommitment);
  });
  it('uses distinct complete V3 receipt and core domains', () => {
    const binding = activation.createRecoveryActivationBindingV3(encode(candidate()));
    const key = 'ptrExistingUpdateReceiptCommitment';
    const nonCommitments = expectedKeys.filter(key => !key.endsWith('Commitment'));
    expect(binding[key]).toBe(referenceHash(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v3\n`, nonCommitments, binding));
    expect(binding.recoveryAuthorizationCoreSha256).toBe(referenceHash('warpkeep.0.4.0.recovery-authorization-core.v3\n', expectedKeys, binding));
    expect(projection.recoveryAuthorizationCoreSha256V3(binding)).toBe(binding.recoveryAuthorizationCoreSha256);
    expect(projection.recoveryAuthorizationCoreSha256ForBinding(binding)).toBe(binding.recoveryAuthorizationCoreSha256);
    expect(projection.recoveryReceiptCommitment(key, binding)).toBe(binding[key]);
    expect(binding[key]).not.toBe(referenceHash(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v2\n`, nonCommitments, binding));
  });
  it.each(expectedKeys.filter(key => !key.endsWith('Commitment') && !['schemaVersion', 'profile', 'recoveryAuthorizationCoreSha256'].includes(key)))('commits complete public receipt context %s', key => {
    const input = candidate();
    const old = projection.recoveryReceiptCommitmentV3('ptrExistingUpdateReceiptCommitment', input);
    const value = input[key]; input[key] = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${value ?? ''}a`;
    expect(projection.recoveryReceiptCommitmentV3('ptrExistingUpdateReceiptCommitment', input)).not.toBe(old);
  });
  it.each(expectedKeys.filter(key => key.endsWith('Commitment') && key !== 'g001FreezePublishReceiptCommitment').concat('recoveryAuthorizationCoreSha256'))('rejects altered committed field %s', key => {
    const binding = { ...activation.createRecoveryActivationBindingV3(encode(candidate())) }; binding[key] = '0'.repeat(64);
    expect(() => activation.parseRecoveryBindingV3(encode(binding))).toThrow();
  });
  it.each(expectedKeys)('requires the complete V3 field %s', key => {
    const input = candidate(); delete input[key];
    expect(() => activation.validateRecoveryActivationCandidateV3(encode(input))).toThrow();
  });
  it.each(Object.entries(activation.recoveryActivationCandidatePolicy()).filter(([, value]) => typeof value === 'boolean' || value === 0))('enforces the unchanged V3 legacy policy %s', (key, value) => {
    const input = candidate(); input[key] = typeof value === 'boolean' ? !value : 1;
    expect(() => activation.validateRecoveryActivationCandidateV3(encode(input))).toThrow();
  });
  it.each([
    (x: Record<string, unknown>) => { x.schemaVersion = 2; },
    (x: Record<string, unknown>) => { x.profile = 'warpkeep-0.4.0-sealed-launch-v2'; },
    (x: Record<string, unknown>) => { x.ptrPublishReceiptDigest = x.ptrExistingUpdateReceiptDigest; },
    (x: Record<string, unknown>) => { x.ptrFreshStatusDigest = x.ptrExistingUpdateReceiptDigest; },
    (x: Record<string, unknown>) => { x.ptrExistingUpdateReceiptDigest = null; },
    (x: Record<string, unknown>) => { x.ptrExistingUpdateReceiptCommitment = 'a'.repeat(64); },
  ])('rejects downgrade, mixed fresh/update fields and incomplete receipt %#', mutate => {
    const input = candidate(); mutate(input);
    expect(() => activation.createRecoveryActivationBindingFromCandidate(encode(input))).toThrow();
  });
  it('rejects fresh/update parser and commitment substitution', () => {
    const old = recoveryBindingCandidate(), next = candidate();
    expect(() => activation.validateRecoveryActivationCandidate(encode(next))).toThrow();
    expect(() => activation.validateRecoveryActivationCandidateV3(encode(old))).toThrow();
    expect(() => projection.recoveryReceiptCommitmentV3('ptrPublishReceiptCommitment', next)).toThrow();
    expect(() => projection.recoveryReceiptCommitmentV2('ptrExistingUpdateReceiptCommitment', old)).toThrow();
    const binding = { ...activation.createRecoveryActivationBindingV3(encode(next)) };
    binding.g001PolicyReceiptCommitment = activation.createRecoveryActivationBinding(encode(old)).g001PolicyReceiptCommitment;
    expect(() => activation.parseRecoveryBinding(encode(binding))).toThrow();
  });
  it('rejects noncanonical bytes and unsafe version introspection without invoking getters', () => {
    const input = candidate(); let reads = 0;
    Object.defineProperty(input, 'schemaVersion', { enumerable: true, get() { reads++; return 3; } });
    expect(() => projection.recoveryAuthorizationCoreSha256ForBinding(input)).toThrow(); expect(reads).toBe(0);
    expect(() => projection.recoveryReceiptCommitment('ptrExistingUpdateReceiptCommitment', new Proxy(candidate(), {}))).toThrow();
    const source = encode(candidate());
    for (const changed of [source.trimEnd(), source.replace('"schemaVersion": 3,', '"schemaVersion": 3, "schemaVersion": 3,'), source.replaceAll('\n', '\r\n')]) {
      expect(() => projection.parseRecoveryBindingDocument(changed)).toThrow();
    }
    expect(() => projection.recoveryBindingKeys(5 as 3)).toThrow();
    expect(() => activation.recoveryActivationCandidatePolicyForVersion(5 as 3)).toThrow();
  });
});
