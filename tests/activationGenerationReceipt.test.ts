// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVATION_GENERATION_RECEIPT_PROFILE, activationGenerationReceiptBytes,
  parseActivationGenerationReceipt, activationGenerationReceiptDigest } from '../scripts/sealed-realms-production-activation-generation-receipt.mjs';
import { createRecoveryActivationBinding } from '../scripts/recovery-activation-candidate.mjs';
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
  it('retains exact operation/run/digest facts and a deterministic domain digest', () => {
    const bytes = activationGenerationReceiptBytes(receipt());
    expect(parseActivationGenerationReceipt(bytes)).toEqual(receipt());
    expect(activationGenerationReceiptDigest(bytes)).toMatch(/^[a-f0-9]{64}$/u);
    const changed = activationGenerationReceiptBytes({ ...receipt(), runId: '81003' });
    expect(activationGenerationReceiptDigest(changed)).not.toBe(activationGenerationReceiptDigest(bytes));
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
  it('accepts only canonical derived V2 commitments and rejects changed authority fields', () => {
    const binding = createRecoveryActivationBinding(`${JSON.stringify(recoveryBindingCandidate(), null, 2)}\n`);
    const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
    expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
    expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(`${JSON.stringify({ ...binding,
      g002DatabaseIdentity: '1'.repeat(64) }, null, 2)}\n`))).toThrow();
    expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(`${JSON.stringify(binding)}\n`))).toThrow();
  });
});
