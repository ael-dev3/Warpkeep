import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { verifyGenesis001LinuxPolicyReceipt } from './genesis001-linux-policy-receipt.mjs';

export const GENESIS_001_SERVER_FREEZE_PROFILE = 'warpkeep-genesis-001-server-freeze-v1';
export const GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE = 'warpkeep-g001-linux-freeze-confirmation-v1';
export const GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE = 'warpkeep-g001-linux-freeze-current-state-v1';
const CONFIRMATION_KEYS = ['schemaVersion', 'profile', 'sourceCommit', 'census', 'policyObservation'];
const CURRENT_KEYS = ['schemaVersion', 'profile', 'sourceCommit', 'confirmationReceiptDigest', 'policyObservation'];
const CENSUS_KEYS = ['firstDigest', 'secondDigest', 'confirmationDigest', 'confirmationRecordDigest',
  'consumedRecordDigest', 'secondObservedAt', 'expiresAt', 'consumedAt'];
const COMMIT = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const TTL = 300_000;
const MAXIMUM_CONFIRMATION_AGE = 600_000;
const CENSUS_PROFILE = 'warpkeep-sealed-realms-g001-census-private-v1';
const fail = () => { throw Error('GENESIS_001_LINUX_FREEZE_RECEIPT_INVALID'); };

function exact(value, keys) {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail();
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function hash(value) {
  if (typeof value !== 'string' || !HASH.test(value)) fail();
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail();
  return Date.parse(value);
}
const sha = text => createHash('sha256').update(text).digest('hex');
const bodyDigest = value => sha(`${JSON.stringify(value)}\n`);
const receiptDigest = value => sha(`${value.profile}\n${JSON.stringify(value)}\n`);

function policy(value, commit) {
  try { return verifyGenesis001LinuxPolicyReceipt(value, commit); } catch { fail(); }
}
function census(value, commit) {
  const captured = exact(value, CENSUS_KEYS);
  for (const key of CENSUS_KEYS.slice(0, 5)) hash(captured[key]);
  const second = timestamp(captured.secondObservedAt);
  const expires = timestamp(captured.expiresAt);
  const consumed = timestamp(captured.consumedAt);
  const { firstDigest, secondDigest, confirmationDigest, secondObservedAt, expiresAt, consumedAt } = captured;
  if (firstDigest === secondDigest || expires - second !== TTL || consumed < second || consumed >= expires
    || confirmationDigest !== sha(['warpkeep.sealed-realms.g001-census-confirmation.v1',
      commit, firstDigest, secondDigest, expiresAt].join('\n'))
    || captured.confirmationRecordDigest !== bodyDigest({ schemaVersion: 1, profile: CENSUS_PROFILE,
      sourceCommit: commit, firstDigest, secondDigest, secondObservedAt, expiresAt, confirmationDigest })
    || captured.consumedRecordDigest !== bodyDigest({ schemaVersion: 1, profile: CENSUS_PROFILE,
      sourceCommit: commit, firstDigest, secondDigest, confirmationDigest, consumedAt })) fail();
  return Object.freeze(captured);
}
function confirmationBody(value, commit) {
  const body = exact(value, CONFIRMATION_KEYS);
  if (typeof commit !== 'string' || !COMMIT.test(commit) || body.sourceCommit !== commit
    || body.schemaVersion !== 1 || body.profile !== GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE) fail();
  const captured = census(body.census, commit);
  const observation = policy(body.policyObservation, commit);
  const observed = timestamp(observation.policyObservationReceipt.observedAt);
  if (observed < timestamp(captured.consumedAt) || observed >= timestamp(captured.expiresAt)) fail();
  return Object.freeze({ ...body, census: captured, policyObservation: observation });
}
function currentBody(value, commit) {
  const body = exact(value, CURRENT_KEYS);
  if (typeof commit !== 'string' || !COMMIT.test(commit) || body.sourceCommit !== commit
    || body.schemaVersion !== 1 || body.profile !== GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE) fail();
  hash(body.confirmationReceiptDigest);
  return Object.freeze({ ...body, policyObservation: policy(body.policyObservation, commit) });
}
function verify(value, commit, keys, validate) {
  const captured = exact(value, [...keys, 'receiptDigest']);
  const body = validate(Object.fromEntries(keys.map(key => [key, captured[key]])), commit);
  if (hash(captured.receiptDigest) !== receiptDigest(body)) fail();
  return Object.freeze({ ...body, receiptDigest: captured.receiptDigest });
}

/** Pure provenance codecs only. A valid hash does not authenticate collection,
 * current workflow authority, retained census ownership or deployment approval.
 * Native producers must supply the actual policy observation and consumers must
 * join these census digests to the authenticated stable pair. No monitor state,
 * player-state snapshot, timer suspension or provider mutation is asserted. */
export function createGenesis001LinuxFreezeConfirmationReceipt(value, commit) {
  if (arguments.length !== 2) fail();
  const body = confirmationBody(value, commit);
  return Object.freeze({ ...body, receiptDigest: receiptDigest(body) });
}
export function verifyGenesis001LinuxFreezeConfirmationReceipt(value, commit) {
  if (arguments.length !== 2) fail();
  return verify(value, commit, CONFIRMATION_KEYS, confirmationBody);
}
export function createGenesis001LinuxFreezeCurrentStateReceipt(value, commit) {
  if (arguments.length !== 2) fail();
  const body = currentBody(value, commit);
  return Object.freeze({ ...body, receiptDigest: receiptDigest(body) });
}
export function verifyGenesis001LinuxFreezeCurrentStateReceipt(value, commit) {
  if (arguments.length !== 2) fail();
  return verify(value, commit, CURRENT_KEYS, currentBody);
}

/** Historical validation at an explicit trusted time; never creates live authority. */
export function projectGenesis001LinuxFreezeEvidence(value, verificationTimestamp) {
  if (arguments.length !== 2) fail();
  const evidence = exact(value, ['preparationSourceCommit', 'confirmationReceipt', 'currentStateReceipt']);
  const confirmation = verifyGenesis001LinuxFreezeConfirmationReceipt(evidence.confirmationReceipt,
    evidence.preparationSourceCommit);
  const current = verifyGenesis001LinuxFreezeCurrentStateReceipt(evidence.currentStateReceipt,
    evidence.preparationSourceCommit);
  const before = confirmation.policyObservation, after = current.policyObservation;
  const confirmedAt = timestamp(before.policyObservationReceipt.observedAt);
  const observedAt = timestamp(after.policyObservationReceipt.observedAt);
  const verifiedAt = timestamp(verificationTimestamp);
  if (current.confirmationReceiptDigest !== confirmation.receiptDigest
    || observedAt < confirmedAt || observedAt > verifiedAt || verifiedAt - observedAt > TTL
    || verifiedAt - confirmedAt > MAXIMUM_CONFIRMATION_AGE
    || before.execution.runId === after.execution.runId
    || before.receiptLinkSha256 === after.receiptLinkSha256
    || ['moduleTreeId', 'operatorBlob', 'operatorSha256', 'dependencyClosureSha256']
      .some(key => before[key] !== after[key])
    || ['bundleSha256', 'sourceClosureSha256'].some(key => before.execution[key] !== after.execution[key])) fail();
  return Object.freeze({
    g001AdmissionControlProfile: GENESIS_001_SERVER_FREEZE_PROFILE,
    g001FreezeConfirmationReceiptDigest: confirmation.receiptDigest,
    g001FreezeCurrentStateReceiptDigest: current.receiptDigest,
  });
}
