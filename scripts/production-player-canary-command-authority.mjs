import { createHash } from 'node:crypto';

export const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v2';

const SHA256 = /^[0-9a-f]{64}$/u;
const INPUT_KEYS = Object.freeze([
  'challengeDigest',
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
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).some(key => typeof key !== 'string')
    || Reflect.ownKeys(value).length !== INPUT_KEYS.length
    || Reflect.ownKeys(value).sort().join('\0') !== [...INPUT_KEYS].sort().join('\0')
  ) fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const input = Object.fromEntries(INPUT_KEYS.map(key => [key, descriptors[key]?.value]));
  if (INPUT_KEYS.some(key => typeof input[key] !== 'string' || !SHA256.test(input[key]))) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  }
  return Object.freeze(input);
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
    'warpkeep.production-player-canary.command-key.v2',
    input.challengeDigest,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    operation,
    ordinal,
  ]);
  const operationCode = operation === 'dispatch' ? 'd'
    : operation === 'recall' ? 'r'
      : 'f';
  return `pc2-${operationCode}${String(ordinal).padStart(2, '0')}-${hash}`;
}

/** Derive nine stored-challenge-bound keys without accepting caller key bytes. */
export function deriveProductionPlayerCanaryCommandAuthorityV2(rawInput) {
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
  const recoveryFenceIdempotencyKey = commandKey(input, 'fence', 0);
  if (new Set([...orderedKeys, recoveryFenceIdempotencyKey]).size !== 9) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  }
  return Object.freeze({
    commandKeyPolicyVersion: PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION,
    commandSetCommitment: digest([
      'warpkeep.production-player-canary.command-set.v2',
      input.challengeDigest,
      input.reviewedAdmissionPlanDigest,
      input.serverBaselineCommitment,
      input.routeSetCommitment,
      ...orderedKeys,
      recoveryFenceIdempotencyKey,
    ]),
    recoveryFenceIdempotencyKey,
    commands,
  });
}
