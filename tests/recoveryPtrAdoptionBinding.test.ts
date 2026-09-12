// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import * as projection from '../scripts/recovery-binding-projection.mjs';
import * as activation from '../scripts/recovery-activation-candidate.mjs';

const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const ptrKeys = [
  'ptrExistingUpdateReceiptDigest', 'ptrExistingUpdateReceiptCommitment',
  'ptrExistingStateAdoptionReceiptDigest', 'ptrExistingStateAdoptionReceiptCommitment',
  'ptrDatabaseIdentity', 'ptrExpectedProgramKeccak256', 'ptrModuleSourceCommit',
  'ptrModuleSha256', 'ptrModuleTreeId', 'ptrDependencyClosureDigest',
  'ptrSpacetimeExecutableSha256', 'ptrSpacetimeCliConfigSha256',
  'ptrAtlasSourceCommit', 'ptrAtlasId', 'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId',
  'ptrReleaseVersion', 'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
  'ptrAtlasReady', 'ptrSealed', 'ptrPopulationGuardPassed', 'ptrSingletonOwnerCount',
  'ptrOwnerEnabled', 'ptrGeneralAdmissionCount', 'ptrAdmissionsOpen', 'ptrAccessRequestsOpen',
  'ptrExpectedSealedStateHmacSha256', 'ptrExpectedOwnerInvariantHmacSha256',
];
const expectedKeys = Object.keys(recoveryBindingCandidate()).flatMap(key =>
  key === 'ptrPublishReceiptDigest' ? ptrKeys : key.startsWith('ptr') ? [] : [key]);
// Synthetic public scalar data only; neither this fixture nor its hashes authenticates adoption.
function candidate(): Record<string, string | number | boolean | null> {
  const values = {
    ...recoveryBindingCandidate(), schemaVersion: 4,
    profile: 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4',
    ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
    ptrExistingStateAdoptionReceiptDigest: '8'.repeat(64), ptrExistingStateAdoptionReceiptCommitment: null,
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1,
    ptrGeneralAdmissionCount: 0, ptrExpectedSealedStateHmacSha256: '7'.repeat(64),
    ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64),
  };
  return Object.fromEntries(expectedKeys.map(key => [key, values[key as keyof typeof values]]));
}
function referenceHash(domain: string, keys: readonly string[], binding: Record<string, unknown>) {
  const prefix = Buffer.from(`warpkeep-recovery-v1:${domain}:`);
  const body = Buffer.from(JSON.stringify(Object.fromEntries(keys.map(key =>
    [key, key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]]))));
  const length = Buffer.alloc(4); length.writeUInt32BE(prefix.length);
  const bodyLength = Buffer.alloc(8); bodyLength.writeBigUInt64BE(BigInt(body.length));
  return createHash('sha256').update(length).update(prefix).update(bodyLength).update(body).digest('hex');
}

describe('explicit PTR preserved-state adoption binding v4', () => {
  it('accepts an explicit V4 document through generic dispatch without requiring initialization claims', () => {
    const input = candidate();
    expect(activation.validateRecoveryActivationCandidateDocument(encode(input))).toEqual(input);
    const binding = activation.createRecoveryActivationBindingFromCandidate(encode(input));
    expect(activation.parseRecoveryBinding(encode(binding))).toEqual(binding);
    expect(Object.keys(binding)).toEqual(expectedKeys);
    expect(Object.isFrozen(binding)).toBe(true);
  });
  it('uses the agreed PTR observation projection while retaining the complete non-PTR policy', () => {
    expect(projection.RECOVERY_BINDING_KEYS_V4).toEqual(expectedKeys);
    expect(projection.recoveryBindingKeys(4)).toEqual(expectedKeys);
    const policy = activation.recoveryActivationCandidatePolicyForVersion(4);
    for (const [key, value] of Object.entries(activation.recoveryActivationCandidatePolicy())) {
      if (!key.startsWith('ptr') && !['schemaVersion', 'profile'].includes(key)) expect(policy[key]).toBe(value);
    }
    expect(Object.keys(policy).filter(key => key.startsWith('ptr'))).toEqual([
      'ptrExistingUpdateReceiptCommitment', 'ptrExistingStateAdoptionReceiptCommitment',
      'ptrAtlasId', 'ptrReleaseVersion', 'ptrAtlasReady', 'ptrSealed',
      'ptrPopulationGuardPassed', 'ptrSingletonOwnerCount', 'ptrOwnerEnabled',
      'ptrGeneralAdmissionCount', 'ptrAdmissionsOpen', 'ptrAccessRequestsOpen',
    ]);
  });
  it('uses explicit V4 parsers and complete distinct commitment/core domains', () => {
    const input = candidate(), source = encode(input);
    expect(projection.parseRecoveryBindingDocumentV4(source)).toEqual(input);
    expect(projection.parseRecoveryBindingDocument(source)).toEqual(input);
    expect(activation.validateRecoveryActivationCandidateV4(source)).toEqual(input);
    const binding = activation.createRecoveryActivationBindingV4(source);
    expect(activation.parseRecoveryBindingV4(encode(binding))).toEqual(binding);
    expect(activation.createRecoveryActivationBindingFromCandidate(source)).toEqual(binding);
    for (const key of expectedKeys.filter(key => key.endsWith('Commitment') && key !== 'g001FreezePublishReceiptCommitment')) {
      expect(binding[key]).toBe(referenceHash(`warpkeep.0.4.0.recovery-sealed-launch.${key}.v4\n`,
        expectedKeys.filter(field => !field.endsWith('Commitment')), binding));
      expect(projection.recoveryReceiptCommitmentV4(key, binding)).toBe(binding[key]);
      expect(projection.recoveryReceiptCommitment(key, binding)).toBe(binding[key]);
    }
    const core = referenceHash('warpkeep.0.4.0.recovery-authorization-core.v4\n', expectedKeys, binding);
    expect(binding.recoveryAuthorizationCoreSha256).toBe(core);
    expect(projection.recoveryAuthorizationCoreSha256V4(binding)).toBe(core);
    expect(projection.recoveryAuthorizationCoreSha256ForBinding(binding)).toBe(core);
  });
  it('preserves the existing V3 canonical binding and hash vector', () => {
    const values: Record<string, unknown> = { ...recoveryBindingCandidate(), schemaVersion: 3,
      profile: 'warpkeep-0.4.0-sealed-launch-ptr-update-v3',
      ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null };
    const binding = activation.createRecoveryActivationBindingV3(encode(Object.fromEntries(
      projection.RECOVERY_BINDING_KEYS_V3.map(key => [key, values[key]]))));
    expect(createHash('sha256').update(encode(binding)).digest('hex'))
      .toBe('9ec8eb92e2c4e76c9b59440c224f3e1e6eeedc5c00271e83b721184f37844bf0');
    expect(binding.recoveryAuthorizationCoreSha256)
      .toBe('ab315044d4b2abe3b345da1c3c00055fa384b2f22d11f265dbc44ffadb8db2e7');
    expect(activation.parseRecoveryBinding(encode(binding))).toEqual(binding);
  });
  it.each(expectedKeys)('requires the complete V4 field %s', key => {
    const input = candidate(); delete input[key];
    expect(() => activation.validateRecoveryActivationCandidateDocument(encode(input))).toThrow();
  });
  it.each([
    ['ptrSealed', false], ['ptrPopulationGuardPassed', false], ['ptrSingletonOwnerCount', 0],
    ['ptrSingletonOwnerCount', 2], ['ptrGeneralAdmissionCount', 1], ['ptrOwnerEnabled', false],
    ['ptrAtlasReady', false], ['ptrAdmissionsOpen', true], ['ptrAccessRequestsOpen', true],
    ['ptrExpectedSealedStateHmacSha256', null], ['ptrExpectedOwnerInvariantHmacSha256', 'A'.repeat(64)],
    ['ptrExistingStateAdoptionReceiptDigest', null], ['ptrExistingUpdateReceiptDigest', 'invalid'],
    ['ptrExistingStateAdoptionReceiptCommitment', 'a'.repeat(64)],
  ] as const)('rejects invalid retained-state policy %s=%s', (key, value) => {
    const input = candidate(); input[key] = value;
    expect(() => activation.createRecoveryActivationBindingFromCandidate(encode(input))).toThrow();
  });
  it.each(expectedKeys.filter(key => !key.endsWith('Commitment')
    && !['schemaVersion', 'profile', 'recoveryAuthorizationCoreSha256'].includes(key)))(
    'binds the complete public context in the adoption commitment: %s', key => {
      const input = candidate();
      const before = projection.recoveryReceiptCommitmentV4('ptrExistingStateAdoptionReceiptCommitment', input);
      const value = input[key];
      input[key] = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${value ?? ''}a`;
      expect(projection.recoveryReceiptCommitmentV4('ptrExistingStateAdoptionReceiptCommitment', input)).not.toBe(before);
    });
  it.each(expectedKeys.filter(key => key.endsWith('Commitment')
    && key !== 'g001FreezePublishReceiptCommitment').concat('recoveryAuthorizationCoreSha256'))(
    'rejects an altered stored commitment or core %s', key => {
      const binding = { ...activation.createRecoveryActivationBindingFromCandidate(encode(candidate())) };
      binding[key] = '0'.repeat(64);
      expect(() => activation.parseRecoveryBinding(encode(binding))).toThrow();
    });
  it.each(['ptrAtlasImportReceiptDigest', 'ptrSealedLiveReceiptDigest', 'ptrOwnerProvisionReceiptDigest',
    'ptrPublishReceiptDigest', 'ptrFreshStatusDigest', 'ptrReleaseManifestSha256', 'ptrOwnerAnchorRows',
    'ptrPresentationEnabled', 'ptrPlayersV2', 'ptrAtlasImportsExact'])(
    'rejects mixed historical initialization field %s', key => {
      const input = candidate(); input[key] = recoveryBindingCandidate()[key]!;
      expect(() => activation.validateRecoveryActivationCandidateDocument(encode(input))).toThrow();
    });
  it('rejects downgrades and substitution between V2/V3/V4 domains', () => {
    const input = candidate();
    for (const version of [2, 3]) {
      const changed = { ...input, schemaVersion: version };
      expect(() => activation.validateRecoveryActivationCandidateDocument(encode(changed))).toThrow();
    }
    expect(() => projection.parseRecoveryBindingDocumentV3(encode(input))).toThrow();
    expect(() => activation.validateRecoveryActivationCandidate(encode(input))).toThrow();
    expect(() => projection.recoveryReceiptCommitmentV3('ptrExistingStateAdoptionReceiptCommitment', input)).toThrow();
    expect(() => projection.recoveryReceiptCommitmentV4('ptrOwnerProvisionReceiptCommitment', input)).toThrow();
    const binding = { ...activation.createRecoveryActivationBindingFromCandidate(encode(input)) };
    binding.ptrExistingStateAdoptionReceiptCommitment = referenceHash(
      'warpkeep.0.4.0.recovery-sealed-launch.ptrExistingStateAdoptionReceiptCommitment.v3\n',
      expectedKeys.filter(key => !key.endsWith('Commitment')), binding);
    expect(() => activation.parseRecoveryBinding(encode(binding))).toThrow();
  });
  it('rejects unsafe property introspection, noncanonical bytes and unknown versions', () => {
    const input = candidate(); let reads = 0;
    Object.defineProperty(input, 'schemaVersion', { enumerable: true, get() { reads++; return 4; } });
    expect(() => projection.recoveryAuthorizationCoreSha256ForBinding(input)).toThrow();
    expect(reads).toBe(0);
    expect(() => projection.recoveryReceiptCommitment('ptrExistingStateAdoptionReceiptCommitment', new Proxy(candidate(), {}))).toThrow();
    const source = encode(candidate());
    for (const changed of [source.trimEnd(), source.replace('"schemaVersion": 4,', '"schemaVersion": 4, "schemaVersion": 4,'), source.replaceAll('\n', '\r\n')]) {
      expect(() => projection.parseRecoveryBindingDocument(changed)).toThrow();
    }
    expect(() => projection.recoveryBindingKeys(5 as 4)).toThrow();
    expect(() => activation.recoveryActivationCandidatePolicyForVersion(5 as 4)).toThrow();
  });
});
