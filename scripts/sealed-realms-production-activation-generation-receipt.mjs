import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const ACTIVATION_GENERATION_RECEIPT_PROFILE =
  'warpkeep-sealed-realms-activation-generation-receipt-v1';
const KEYS = Object.freeze([
  'schemaVersion', 'profile', 'sourceCommit', 'sourceAuthorityDigest', 'operation',
  'runId', 'runAttempt', 'activationEvidenceDigest', 'activationChainDigest',
  'descriptorSha256', 'artifactSha256', 'artifactSchemaVersion', 'artifactProfile',
  'generatedAt', 'outcome',
]);
const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const MAXIMUM_BYTES = 4096;

function fail() { throw new Error('SEALED_REALMS_ACTIVATION_GENERATION_RECEIPT_INVALID'); }

function record(input) {
  if (types.isProxy(input) || input === null || typeof input !== 'object'
    || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(KEYS)
    || KEYS.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail();
  const value = Object.fromEntries(KEYS.map(key => [key, descriptors[key].value]));
  if (value.schemaVersion !== 1 || value.profile !== ACTIVATION_GENERATION_RECEIPT_PROFILE
    || typeof value.sourceCommit !== 'string' || !COMMIT.test(value.sourceCommit) || value.operation !== 'activation-evidence-generate'
    || typeof value.runId !== 'string' || !RUN_ID.test(value.runId) || !Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1 || value.runAttempt > 1000
    || ['sourceAuthorityDigest', 'activationEvidenceDigest', 'activationChainDigest',
      'descriptorSha256', 'artifactSha256'].some(key => typeof value[key] !== 'string' || !DIGEST.test(value[key]))
    || ![1, 2, 3, 4].includes(value.artifactSchemaVersion)
    || value.artifactProfile !== (value.artifactSchemaVersion === 4
      ? 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4'
      : value.artifactSchemaVersion === 3
      ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3'
      : `warpkeep-0.4.0-sealed-launch-v${value.artifactSchemaVersion}`)
    || value.outcome !== 'generated' || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || new Date(value.generatedAt).toISOString() !== value.generatedAt) fail();
  return Object.freeze(value);
}

/** Canonical data codec only. A caller-created receipt grants no authority. */
export function activationGenerationReceiptBytes(input) {
  const bytes = Buffer.from(`${JSON.stringify(record(input))}\n`);
  if (bytes.length > MAXIMUM_BYTES) fail();
  return bytes;
}

export function parseActivationGenerationReceipt(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 2 || input.byteLength > MAXIMUM_BYTES) fail();
  const source = new TextDecoder('utf-8', { fatal: true }).decode(input);
  const value = record(JSON.parse(source));
  if (`${JSON.stringify(value)}\n` !== source) fail();
  return value;
}

export function activationGenerationReceiptDigest(input) {
  parseActivationGenerationReceipt(input);
  return createHash('sha256')
    .update('warpkeep.sealed-realms.activation-generation-receipt.v1\n')
    .update(input).digest('hex');
}
