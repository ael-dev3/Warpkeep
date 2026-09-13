// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVATION_GENERATION_RECEIPT_PROFILE, activationGenerationReceiptBytes,
  parseActivationGenerationReceipt, activationGenerationReceiptDigest } from '../scripts/sealed-realms-production-activation-generation-receipt.mjs';
import { createRecoveryActivationBinding, createRecoveryActivationBindingV5 } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import { verifySealedRealmsPublicActivationBytes } from '../scripts/verify-sealed-realms-public-activation-artifact.mjs';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';

function receipt() {
  return { schemaVersion: 1, profile: ACTIVATION_GENERATION_RECEIPT_PROFILE,
    sourceCommit: 'a'.repeat(40), sourceAuthorityDigest: 'b'.repeat(64),
    operation: 'activation-evidence-generate', runId: '81002', runAttempt: 1,
    activationEvidenceDigest: 'c'.repeat(64), activationChainDigest: 'd'.repeat(64),
    descriptorSha256: 'e'.repeat(64), artifactSha256: 'f'.repeat(64),
    artifactSchemaVersion: 2, artifactProfile: 'warpkeep-0.4.0-sealed-launch-v2',
    generatedAt: '2026-08-28T12:02:00.000Z', outcome: 'generated' } as const;
}

describe('activation generation receipt codec', () => {
  it('round trips V5 with its exact profile and rejects older or mixed profiles', () => {
    const value = { ...receipt(), artifactSchemaVersion: 5, artifactProfile: 'warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5' } as const;
    const bytes = activationGenerationReceiptBytes(value);
    expect(parseActivationGenerationReceipt(bytes)).toEqual(value);
    for (const artifactProfile of ['warpkeep-0.4.0-sealed-launch-v5', 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4']) {
      expect(() => activationGenerationReceiptBytes({ ...value, artifactProfile } as never)).toThrow();
    }
    for (const artifactSchemaVersion of [1, 2, 3, 4]) expect(() => activationGenerationReceiptBytes({ ...value, artifactSchemaVersion } as never)).toThrow();
  });
  it('retains exact operation/run/digest facts and a deterministic domain digest', () => {
    const bytes = activationGenerationReceiptBytes(receipt());
    expect(parseActivationGenerationReceipt(bytes)).toEqual(receipt());
    expect(activationGenerationReceiptDigest(bytes)).toMatch(/^[a-f0-9]{64}$/u);
    const changed = activationGenerationReceiptBytes({ ...receipt(), runId: '81003' });
    expect(activationGenerationReceiptDigest(changed)).not.toBe(activationGenerationReceiptDigest(bytes));
  });
  it('round trips the exact PTR-update V3 artifact profile', () => {
    const value = { ...receipt(), artifactSchemaVersion: 3, artifactProfile: 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' } as const;
    const bytes = activationGenerationReceiptBytes(value);
    expect(parseActivationGenerationReceipt(bytes)).toEqual(value);
    expect(activationGenerationReceiptDigest(bytes)).not.toBe(activationGenerationReceiptDigest(activationGenerationReceiptBytes(receipt())));
  });
  it('round trips the exact preserved PTR V4 artifact without aliasing an initialization profile', () => {
    const value = { ...receipt(), artifactSchemaVersion: 4, artifactProfile: 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4' } as const;
    const bytes = activationGenerationReceiptBytes(value);
    expect(parseActivationGenerationReceipt(bytes)).toEqual(value);
    expect(activationGenerationReceiptDigest(bytes)).not.toBe(activationGenerationReceiptDigest(activationGenerationReceiptBytes(receipt())));
    for (const artifactProfile of ['warpkeep-0.4.0-sealed-launch-v4', 'warpkeep-0.4.0-sealed-launch-ptr-update-v3']) {
      expect(() => activationGenerationReceiptBytes({ ...value, artifactProfile } as never)).toThrow();
    }
    expect(() => activationGenerationReceiptBytes({ ...value, artifactSchemaVersion: 3 } as never)).toThrow();
  });
  it.each([
    [3, 'warpkeep-0.4.0-sealed-launch-v3'],
    [2, 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'],
    [3, 'warpkeep-0.4.0-sealed-launch-v2'],
    [4, 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'],
    ['3', 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'],
  ])('rejects mismatched artifact schema %s and profile %s', (artifactSchemaVersion, artifactProfile) => {
    expect(() => activationGenerationReceiptBytes({ ...receipt(), artifactSchemaVersion, artifactProfile } as never)).toThrow();
  });
  it.each([
    ['runId', 81002], ['runAttempt', '1'], ['runAttempt', 1001], ['sourceCommit', 'a'.repeat(39)],
    ['operation', 'activation-evidence-inspect'], ['artifactSchemaVersion', 1], ['outcome', 'pending'],
    ['generatedAt', '2026-08-28T12:02:00Z'], ['artifactSha256', 'F'.repeat(64)],
  ])('rejects malformed %s', (key, value) => {
    expect(() => activationGenerationReceiptBytes({ ...receipt(), [key]: value } as never)).toThrow();
  });
  it('rejects accessors without invoking them, proxies, extras and noncanonical bytes', () => {
    const value = receipt(); let called = false;
    Object.defineProperty(value, 'runId', { enumerable: true, get: () => { called = true; return '81002'; } });
    expect(() => activationGenerationReceiptBytes(value)).toThrow();
    expect(called).toBe(false);
    expect(() => activationGenerationReceiptBytes(new Proxy(receipt(), {}))).toThrow();
    expect(() => activationGenerationReceiptBytes({ ...receipt(), secret: 'no' } as never)).toThrow();
    for (const bytes of [Buffer.from(JSON.stringify(receipt())), Buffer.from(`${JSON.stringify(receipt(), null, 2)}\n`),
      Buffer.from('{"schemaVersion":1,"schemaVersion":1}\n'), Buffer.from([0xff]), Buffer.alloc(4097)]) {
      expect(() => parseActivationGenerationReceipt(bytes)).toThrow();
    }
  });
});

describe('recovery public activation bytes', () => {
  it('consumes V5 public bytes without fabricating notification or initial-import claims', () => {
    const binding = createRecoveryActivationBindingV5(`${JSON.stringify(recoveryG002PtrAdoptionCandidate(), null, 2)}\n`);
    const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
    expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
    for (const mutation of [{ g002Sealed: false }, { admissionNotificationsEnabled: false }, { schemaVersion: 4 }]) {
      expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(`${JSON.stringify({ ...binding, ...mutation }, null, 2)}\n`))).toThrow();
    }
  });
  it('accepts only canonical derived V2 commitments and rejects changed authority fields', () => {
    const binding = createRecoveryActivationBinding(`${JSON.stringify(recoveryBindingCandidate(), null, 2)}\n`);
    const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
    expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
    expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(`${JSON.stringify({ ...binding,
      g002DatabaseIdentity: '1'.repeat(64) }, null, 2)}\n`))).toThrow();
    expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(`${JSON.stringify(binding)}\n`))).toThrow();
  });
});
