import { createHash } from 'node:crypto';

export const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const INPUT_KEYS = Object.freeze([
  'evidenceNonce',
  'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment',
  'routeSetCommitment',
]);

export class ProductionPlayerCanaryCommandAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryCommandAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryCommandAuthorityError(code);
}

function exactInput(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...INPUT_KEYS].sort().join('\0')
    || INPUT_KEYS.some(key => typeof value[key] !== 'string' || !SHA256.test(value[key]))
  ) fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  return value;
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

function digest(values) {
  return createHash('sha256').update(`${framed(values)}\n`, 'utf8').digest('hex');
}

function commandKey(input, operation, ordinal) {
  const hash = digest([
    'warpkeep.production-player-canary.command-key.v1',
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    operation,
    ordinal,
  ]);
  return `pc1-${operation === 'dispatch' ? 'd' : 'r'}${String(ordinal).padStart(2, '0')}-${hash}`;
}

/** Derive all eight non-secret mutation keys without accepting caller key bytes. */
export function deriveProductionPlayerCanaryCommandAuthorityV1(rawInput) {
  const input = exactInput(rawInput);
  const commands = Object.freeze(Array.from({ length: 4 }, (_, index) => {
    const ordinal = index + 1;
    return Object.freeze({
      ordinal,
      dispatchIdempotencyKey: commandKey(input, 'dispatch', ordinal),
      recallIdempotencyKey: commandKey(input, 'recall', ordinal),
    });
  }));
  const orderedKeys = commands.flatMap(command => [
    command.dispatchIdempotencyKey,
    command.recallIdempotencyKey,
  ]);
  if (new Set(orderedKeys).size !== 8) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  }
  return Object.freeze({
    commandKeyPolicyVersion: PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION,
    commandSetCommitment: digest([
      'warpkeep.production-player-canary.command-set.v1',
      input.evidenceNonce,
      input.reviewedAdmissionPlanDigest,
      input.serverBaselineCommitment,
      input.routeSetCommitment,
      ...orderedKeys,
    ]),
    commands,
  });
}
