// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { signedPreparationFixture, signedPreparationObservationFixture } from './fixtures/recoveryPreparationSigned.js';
vi.mock('../scripts/recovery-public-key.mjs', async () => {
  const fixture = await import('./fixtures/recoveryPreparationSigned.js');
  return fixture.recoveryPreparationTestPublicKey;
});
const codecPath = '../scripts/sealed-realms-production-recovery-preparation-observation-receipt.mjs';
const codec = await import(/* @vite-ignore */ codecPath).catch(() => ({})) as Record<string, any>;
const verify = (...args: unknown[]) => codec.verifySealedRealmsProductionRecoveryPreparationObservation(...args);
it('accepts unchanged bytes from the independently bundled official service signer', () => {
  const vector = JSON.parse(readFileSync(new URL('./fixtures/recoveryPreparationObservationServiceVector.json', import.meta.url), 'utf8'));
  expect(verify(vector.preparationObservationJws, vector.preparationReceiptJws, vector.now)).toEqual(vector.observation);
});
it('authenticates the exact reserved intent and fresh distinct signed configuration observation', () => {
  const reservation = signedPreparationFixture(), observation = signedPreparationObservationFixture(reservation.intent);
  expect(verify(observation.compact, reservation.compact, 1700000012)).toEqual(observation.observation);
  expect(Object.isFrozen(verify(observation.compact, reservation.compact, 1700000012))).toBe(true);
});
it.each([1700000011, 1700000101, 1700000102, NaN, '1700000012'])('refuses unusable observation time %s', now => {
  const reservation = signedPreparationFixture(), observation = signedPreparationObservationFixture(reservation.intent);
  expect(() => verify(observation.compact, reservation.compact, now)).toThrow();
});
it.each([
  { expiresAt: 1700000200 }, { observedThrough: 1700000050 }, { observedFrom: 1699999999 },
  { issuedAt: 1700000027 }, { bridgeConfigEpoch: 0 }, { bridgeConfigIdentity: 'a'.repeat(63) },
  { bridgeWorkerVersionId: 'not-uuid' }, { bridgeSourceCommit: 'a'.repeat(64) },
  { bridgeService: 'other' }, { extra: true }, { purpose: 'activation-evidence-preparation' },
])('refuses signed malformed configuration fields %j', delta => {
  const reservation = signedPreparationFixture(), observation = signedPreparationObservationFixture(reservation.intent, delta);
  expect(() => verify(observation.compact, reservation.compact, 1700000030)).toThrow();
});
it('refuses foreign intents, receipt substitution, tampering and high-S alternatives', () => {
  const reservation = signedPreparationFixture(), observation = signedPreparationObservationFixture(reservation.intent);
  const foreign = signedPreparationFixture({ requestId: '123e4567-e89b-42d3-a456-426614174001' });
  expect(() => verify(observation.compact, foreign.compact, 1700000012)).toThrow();
  expect(() => verify(reservation.compact, reservation.compact, 1700000012)).toThrow();
  const parts = observation.compact.split('.'), signature = Buffer.from(parts[2]!, 'base64url');
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  Buffer.from((order - BigInt(`0x${signature.subarray(32).toString('hex')}`)).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  expect(() => verify(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`, reservation.compact, 1700000012)).toThrow();
  signature[0] ^= 1;
  expect(() => verify(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`, reservation.compact, 1700000012)).toThrow();
});
