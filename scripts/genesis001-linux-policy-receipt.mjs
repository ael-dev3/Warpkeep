import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  GENESIS_001_DATABASE_IDENTITY,
  GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
  genesis001PolicyReceiptDigest,
} from './genesis001-sealed-launch-adoption.mjs';
export const GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE =
  'warpkeep-g001-linux-policy-observation-v1';
export const GENESIS_001_LINUX_POLICY_OPERATOR_PATH =
  'scripts/genesis001-policy-observation-receipt.mjs';
const COMMIT = /^[a-f0-9]{40}$/u,
  HASH = /^[a-f0-9]{64}$/u,
  RUN = /^[a-f0-9]{32}$/u;
const matches = (pattern, value) =>
  typeof value === 'string' && pattern.test(value);
const KEYS = [
  'profile',
  'protectedCommit',
  'moduleTreeId',
  'operatorBlob',
  'operatorSha256',
  'runtime',
  'dependencyClosureSha256',
  'execution',
  'cleanup',
  'policyObservationReceipt',
];
const fail = () => {
  throw Error('GENESIS_001_LINUX_POLICY_RECEIPT_INVALID');
};
function exact(value, keys) {
  if (
    types.isProxy(value) ||
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some(
      (key) =>
        !descriptors[key]?.enumerable ||
        !Object.hasOwn(descriptors[key], 'value'),
    )
  )
    fail();
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
      .join(',') +
    '}'
  );
}
function link(value) {
  return createHash('sha256')
    .update('warpkeep.genesis001.linux-policy-receipt.v1\n')
    .update(canonical(value) + '\n')
    .digest('hex');
}
function validated(value, commit) {
  const receipt = exact(value, KEYS),
    runtime = exact(receipt.runtime, ['profile', 'nodeVersion', 'nodeSha256']);
  const execution = exact(receipt.execution, [
    'runId',
    'bundleSha256',
    'sourceClosureSha256',
  ]);
  const cleanup = exact(receipt.cleanup, [
    'outcome',
    'runId',
    'namespaceInventorySha256',
  ]);
  const observation = exact(receipt.policyObservationReceipt, [
    'schemaVersion',
    'profile',
    'sourceCommit',
    'observedAt',
    'databaseIdentity',
    'procedure',
    'mutationSubmitted',
    'policy',
    'policyReceiptDigest',
  ]);
  const policy = exact(observation.policy, [
    'realmId',
    'releaseVersion',
    'playerAccessEnabled',
    'admissionStateMutationsEnabled',
    'accessRequestSubmissionsEnabled',
    'sourceBaselineCommit',
    'freezeReleaseNonce',
  ]);
  if (
    receipt.profile !== GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE ||
    !matches(COMMIT, commit) ||
    receipt.protectedCommit !== commit ||
    !matches(COMMIT, receipt.moduleTreeId) ||
    !matches(COMMIT, receipt.operatorBlob) ||
    !matches(HASH, receipt.operatorSha256) ||
    !matches(HASH, receipt.dependencyClosureSha256) ||
    runtime.profile !== 'warpkeep-g001-policy-observation-linux-x64-v1' ||
    runtime.nodeVersion !== 'v22.22.3' ||
    runtime.nodeSha256 !==
      'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2' ||
    !matches(RUN, execution.runId) ||
    !matches(HASH, execution.bundleSha256) ||
    !matches(HASH, execution.sourceClosureSha256) ||
    cleanup.outcome !== 'cleaned' ||
    cleanup.runId !== execution.runId ||
    !matches(HASH, cleanup.namespaceInventorySha256) ||
    observation.schemaVersion !== 1 ||
    observation.profile !== GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE ||
    observation.sourceCommit !== commit ||
    observation.databaseIdentity !== GENESIS_001_DATABASE_IDENTITY ||
    observation.procedure !== 'genesis_001_access_policy_v1' ||
    observation.mutationSubmitted !== false ||
    typeof observation.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(observation.observedAt)) ||
    new Date(observation.observedAt).toISOString() !== observation.observedAt
  )
    fail();
  try {
    if (
      observation.policyReceiptDigest !== genesis001PolicyReceiptDigest(policy)
    )
      fail();
  } catch {
    fail();
  }
  return Object.freeze({
    ...receipt,
    runtime: Object.freeze(runtime),
    execution: Object.freeze(execution),
    cleanup: Object.freeze(cleanup),
    policyObservationReceipt: Object.freeze({
      ...observation,
      policy: Object.freeze(policy),
    }),
  });
}
/** Pure provenance codec. Native production and private record ownership supply authority. */
export function createGenesis001LinuxPolicyReceipt(result, commit) {
  if (arguments.length !== 2) fail();
  const input = exact(result, [
    'profile',
    'sourceCommit',
    'sourceTree',
    'operatorBlob',
    'operatorSha256',
    'runtime',
    'dependencyClosureSha256',
    'execution',
    'cleanup',
    'policyObservationReceipt',
  ]);
  if (input.profile !== 'warpkeep-g001-linux-policy-execution-v1') fail();
  const receipt = validated(
    {
      profile: GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE,
      protectedCommit: input.sourceCommit,
      moduleTreeId: input.sourceTree,
      operatorBlob: input.operatorBlob,
      operatorSha256: input.operatorSha256,
      runtime: input.runtime,
      dependencyClosureSha256: input.dependencyClosureSha256,
      execution: input.execution,
      cleanup: input.cleanup,
      policyObservationReceipt: input.policyObservationReceipt,
    },
    commit,
  );
  return Object.freeze({ ...receipt, receiptLinkSha256: link(receipt) });
}
export function verifyGenesis001LinuxPolicyReceipt(value, commit) {
  if (arguments.length !== 2) fail();
  const all = exact(value, [...KEYS, 'receiptLinkSha256']);
  const base = Object.fromEntries(KEYS.map((key) => [key, all[key]]));
  const receipt = validated(base, commit);
  if (
    !matches(HASH, all.receiptLinkSha256) ||
    all.receiptLinkSha256 !== link(receipt)
  )
    fail();
  return Object.freeze({
    ...receipt,
    receiptLinkSha256: all.receiptLinkSha256,
  });
}
