// @vitest-environment node
import { expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { RECOVERY_BINDING_KEYS_V2, recoveryReceiptCommitmentV2, recoveryAuthorizationCoreSha256, parseRecoveryBindingDocumentV2 } from '../scripts/recovery-binding-projection.mjs';

// Projection fixture only: deliberately not an authorized or deployable binding.
function projection(): Record<string, string | null> {
  return Object.fromEntries(RECOVERY_BINDING_KEYS_V2.map(key => [key, null]));
}

it('has a complete synthetic candidate with nulls only for historical evidence and pending hashes', () => {
  const candidate = recoveryBindingCandidate();
  expect(Object.keys(candidate)).toEqual(RECOVERY_BINDING_KEYS_V2);
  const permittedNulls = RECOVERY_BINDING_KEYS_V2.filter(key => key.endsWith('Commitment')
    || key === 'g001FreezePublishReceiptDigest' || key === 'recoveryAuthorizationCoreSha256');
  expect(Object.keys(candidate).filter(key => candidate[key] === null)).toEqual(permittedNulls);
  expect(candidate.g001PlayerAccessEnabled).toBe(true);
  expect(candidate.g002PlayerAccessEnabled).toBe(false);
  expect(candidate.ptrOwnerEnabled).toBe(true);
  expect(candidate.ptrAdmissionsOpen).toBe(false);
});

it('excludes populated core and receipt commitments from receipt hashing', () => {
  const input = projection();
  const before = recoveryReceiptCommitmentV2('g002PublishReceiptCommitment', input);
  input.recoveryAuthorizationCoreSha256 = 'a'.repeat(64);
  input.ptrPublishReceiptCommitment = 'b'.repeat(64);
  expect(recoveryReceiptCommitmentV2('g002PublishReceiptCommitment', input)).toBe(before);
  input.g002PublishReceiptDigest = 'c'.repeat(64);
  expect(recoveryReceiptCommitmentV2('g002PublishReceiptCommitment', input)).not.toBe(before);
});

it('includes populated receipt commitments but excludes its own core slot', () => {
  const input = projection();
  const before = recoveryAuthorizationCoreSha256(input);
  input.recoveryAuthorizationCoreSha256 = 'a'.repeat(64);
  expect(recoveryAuthorizationCoreSha256(input)).toBe(before);
  input.ptrPublishReceiptCommitment = 'b'.repeat(64);
  expect(recoveryAuthorizationCoreSha256(input)).not.toBe(before);
});

it('rejects unknown commitment labels and extra projection fields', () => {
  expect(() => recoveryReceiptCommitmentV2('invented', projection())).toThrow();
  expect(() => recoveryAuthorizationCoreSha256({ ...projection(), extra: true })).toThrow();
});

it.each(RECOVERY_BINDING_KEYS_V2.filter(key => key !== 'recoveryAuthorizationCoreSha256'))(
  'binds core to independently substituted field %s', key => {
    const input = projection();
    const baseline = recoveryAuthorizationCoreSha256(input);
    input[key] = 'substituted';
    expect(recoveryAuthorizationCoreSha256(input)).not.toBe(baseline);
  });

it.each([undefined, NaN, Infinity, -1, -0, 0.5, {}, [], 'x'.repeat(4097), '\u00e9']) (
  'rejects non-scalar or noncanonical projection value %#', value => {
    expect(() => recoveryAuthorizationCoreSha256({ ...projection(), recoveryAuthorizationEpoch: value })).toThrow();
  });

it('rejects missing fields even when replaced by an unknown field', () => {
  const input = projection();
  delete input.recoveryAuthorizationEpoch;
  input.unknown = null;
  expect(() => recoveryAuthorizationCoreSha256(input)).toThrow();
});

it('does not invoke getters or proxy traps while snapshotting input', () => {
  let invoked = false;
  const input = projection();
  Object.defineProperty(input, 'recoveryAuthorizationEpoch', { enumerable: true,
    get() { invoked = true; return 1; } });
  expect(() => recoveryAuthorizationCoreSha256(input)).toThrow();
  expect(invoked).toBe(false);
  const proxy = new Proxy(projection(), { getPrototypeOf() { invoked = true; return Object.prototype; } });
  expect(() => recoveryAuthorizationCoreSha256(proxy)).toThrow();
  expect(invoked).toBe(false);
});

it('ignores caller property order without mutating the caller', () => {
  const input = Object.freeze(projection());
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  expect(recoveryAuthorizationCoreSha256(reversed)).toBe(recoveryAuthorizationCoreSha256(input));
  expect(Object.values(input).every(value => value === null)).toBe(true);
});

it('reads canonical projection data without conferring semantic validity', () => {
  const input = projection();
  const result = parseRecoveryBindingDocumentV2(`${JSON.stringify(input, null, 2)}\n`);
  expect(result).toEqual(input);
  expect(Object.isFrozen(result)).toBe(true);
});

it.each(['duplicate', 'reordered', 'compact', 'missing-newline', 'extra', 'malformed']) (
  'rejects noncanonical document: %s', variant => {
    const input = projection();
    const canonical = `${JSON.stringify(input, null, 2)}\n`;
    const documents: Record<string, string> = {
      duplicate: canonical.replace('{', '{"schemaVersion":null,'),
      reordered: `${JSON.stringify(Object.fromEntries(Object.entries(input).reverse()), null, 2)}\n`,
      compact: JSON.stringify(input),
      'missing-newline': canonical.trimEnd(),
      extra: `${JSON.stringify({ ...input, extra: null }, null, 2)}\n`,
      malformed: '{',
    };
    expect(() => parseRecoveryBindingDocumentV2(documents[variant]!)).toThrow('RECOVERY_BINDING_PROJECTION_INVALID');
  });
