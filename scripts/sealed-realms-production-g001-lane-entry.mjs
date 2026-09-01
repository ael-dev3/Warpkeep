import { createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import { posix } from 'node:path';

import {
  projectGenesis001AdmittedPlayerCensusStablePair,
  verifyGenesis001AdmittedPlayerCensusReceipt,
} from './genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
} from './genesis001-sealed-launch-adoption.mjs';
import {
  assertSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import {
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';

const OPERATIONS = new Set([
  'preflight', 'g001-policy-observe', 'g001-census-first',
  'g001-census-second-inspect', 'g001-census-second-suspend',
  'g001-current-state',
]);
const LABEL = 'com.warpkeep.hermes-admission-monitor';
const EXPECTED_PLIST_SHA256 = 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf';
const EXPECTED_PROGRAM_SHA256 = '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6';
const EXPECTED_BOOTSTRAP_SHA256 = 'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a';
const EXPECTED_ENVELOPE_BLOB = '62690134fd5de632e7831eca0b213eab101d4275';
const EXPECTED_ENVELOPE_SHA256 = 'cd06f32e7a479c4e9de3504029a994f6e7a18033d3d6766c2baac3ef59ce2624';
const EXPECTED_ENVELOPE_BYTES = 88_104;
const ENVELOPE_PATH = 'docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt';
const DISPATCHER_NODE = Object.freeze({
  path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
  version: 'v22.22.3',
  sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
  teamId: 'HX7739G8FX',
});
const ENVELOPE_NODE = Object.freeze({
  path: '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node',
  version: 'v24.19.0',
  sha256: '714024e01b43d82baacc136f44770a75017e9c7858542bad6746f19e7f15635d',
  teamId: '2DC432GLL2',
});
const FIXED_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: '/usr/bin/false',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});
const EMPTY_ENVIRONMENT = Object.freeze({});
const lanes = new WeakSet();
const launchAuthorities = new WeakMap();
const currentStateReceipts = new WeakMap();
const currentStateTestAdapters = new WeakMap();
const censusAuthorities = new WeakMap();
const censusFirstConfirmations = new WeakMap();
const censusSecondConfirmations = new WeakMap();
const censusFirstClaims = new WeakSet();
const censusSecondClaims = new WeakSet();
const CENSUS_PROFILE = 'warpkeep-sealed-realms-g001-census-private-v1';
const CENSUS_MINIMUM_STABLE_SEPARATION_MS = 60_000;
const CENSUS_MAXIMUM_STABLE_SEPARATION_MS = 300_000;
const CENSUS_CONFIRMATION_TTL_MS = 300_000;

export class SealedRealmsProductionG001LaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionG001LaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionG001LaneError(code); }

function exactObject(value, keys, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function requireWebSocket() {
  if (typeof globalThis.WebSocket !== 'function') {
    fail('SEALED_REALMS_G001_WEBSOCKET_UNAVAILABLE');
  }
}

function exactNode(value, expected, code) {
  exactObject(value, ['path', 'version', 'sha256', 'teamId'], code);
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(code);
  return value;
}

function exactCommit(value, code) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) fail(code);
  return value;
}

function exactDigest(value, code) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail(code);
  return value;
}

function exactPrivatePath(value, code) {
  if (
    typeof value !== 'string' || !value.startsWith('/') || value.length > 4 * 1024
    || value.includes('\0') || value.includes('\n') || value.includes('\r')
  ) fail(code);
  return value;
}

function digestBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactDate(value, code) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  const text = value.toISOString();
  if (new Date(text).getTime() !== value.getTime()) fail(code);
  return Object.freeze({ value: value.getTime(), text });
}

function exactCensusBasenameTime(value) {
  if (typeof value !== 'string') fail('SEALED_REALMS_G001_CENSUS_INVALID');
  const match = /^warpkeep-access-request-census-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.txt$/u
    .exec(value);
  if (match === null) fail('SEALED_REALMS_G001_CENSUS_INVALID');
  const text = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== text) {
    fail('SEALED_REALMS_G001_CENSUS_INVALID');
  }
  return Object.freeze({ value: date.getTime(), text });
}

function exactCensusApplicant(value, sourceCommit) {
  exactObject(value, [
    'schemaVersion', 'profile', 'realmId', 'releaseVersion', 'sourceCommit',
    'privateCensusReference', 'privateBlindingNonceHex', 'opaqueProofDigest',
  ], 'SEALED_REALMS_G001_CENSUS_INVALID');
  exactObject(value.privateCensusReference, [
    'count', 'pathBasename', 'sha256', 'size',
  ], 'SEALED_REALMS_G001_CENSUS_INVALID');
  const reference = value.privateCensusReference;
  if (
    value.schemaVersion !== 1
    || value.profile !== 'warpkeep-genesis-001-census-export-private-proof-v1'
    || value.realmId !== 'GENESIS_001'
    || value.releaseVersion !== '0.3.43'
    || value.sourceCommit !== sourceCommit
    || !Number.isSafeInteger(reference.count) || reference.count < 0 || reference.count > 4_096
    || !Number.isSafeInteger(reference.size) || reference.size < 1 || reference.size > 1_048_576
    || !/^[a-f0-9]{64}$/u.test(reference.sha256)
    || !/^[a-f0-9]{64}$/u.test(value.privateBlindingNonceHex)
    || /^0{64}$/u.test(value.privateBlindingNonceHex)
    || !/^[a-f0-9]{64}$/u.test(value.opaqueProofDigest)
  ) fail('SEALED_REALMS_G001_CENSUS_INVALID');
  const observedAt = exactCensusBasenameTime(reference.pathBasename);
  const proof = Object.freeze({
    schemaVersion: 1,
    profile: value.profile,
    realmId: value.realmId,
    releaseVersion: value.releaseVersion,
    sourceCommit: value.sourceCommit,
    privateCensusReference: Object.freeze({
      count: reference.count,
      pathBasename: reference.pathBasename,
      sha256: reference.sha256,
      size: reference.size,
    }),
    privateBlindingNonceHex: value.privateBlindingNonceHex,
  });
  if (genesis001CensusOpaqueProofDigest(proof) !== value.opaqueProofDigest) {
    fail('SEALED_REALMS_G001_CENSUS_INVALID');
  }
  return Object.freeze({
    ...proof,
    opaqueProofDigest: value.opaqueProofDigest,
    observedAt,
  });
}

function exactCensusAdmitted(value, sourceCommit) {
  let receipt;
  try { receipt = verifyGenesis001AdmittedPlayerCensusReceipt(value); } catch {
    fail('SEALED_REALMS_G001_CENSUS_INVALID');
  }
  if (receipt.preparationSourceCommit !== sourceCommit) {
    fail('SEALED_REALMS_G001_CENSUS_INVALID');
  }
  const observedAt = exactDate(new Date(receipt.observedAt), 'SEALED_REALMS_G001_CENSUS_INVALID');
  return Object.freeze({ receipt, observedAt });
}

function exactCensusSample(value, sourceCommit) {
  exactObject(value, ['applicant', 'admitted'], 'SEALED_REALMS_G001_CENSUS_INVALID');
  const applicant = exactCensusApplicant(value.applicant, sourceCommit);
  const admitted = exactCensusAdmitted(value.admitted, sourceCommit);
  if (
    applicant.privateBlindingNonceHex === admitted.receipt.nonceHex
    || applicant.opaqueProofDigest === admitted.receipt.opaqueProofDigest
  ) fail('SEALED_REALMS_G001_CENSUS_INVALID');
  return Object.freeze({ applicant, admitted });
}

function canonicalCensusApplicant(applicant) {
  return Object.freeze({
    schemaVersion: applicant.schemaVersion,
    profile: applicant.profile,
    realmId: applicant.realmId,
    releaseVersion: applicant.releaseVersion,
    sourceCommit: applicant.sourceCommit,
    privateCensusReference: applicant.privateCensusReference,
    privateBlindingNonceHex: applicant.privateBlindingNonceHex,
    opaqueProofDigest: applicant.opaqueProofDigest,
  });
}

function canonicalCensusSample(sample) {
  return Object.freeze({
    applicant: canonicalCensusApplicant(sample.applicant),
    admitted: sample.admitted.receipt,
  });
}

function parseCanonicalCensusRecord(bytes, keys) {
  const body = Buffer.from(bytes);
  try {
    const text = body.toString('utf8');
    let value;
    try { value = JSON.parse(text); } catch {
      fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
    }
    exactObject(value, keys, 'SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
    if (`${JSON.stringify(value)}\n` !== text) {
      fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
    }
    return Object.freeze({ value, digest: digestBytes(body) });
  } finally {
    body.fill(0);
  }
}

function censusPrivateRelative(kind, digest) {
  exactDigest(digest, 'SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  return `g001/census/${kind}/census-${kind}-${digest}.json`;
}

function writeCensusRecord(state, kind, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  const digest = digestBytes(bytes);
  try {
    state.write({ root: 'runtime', relativePath: censusPrivateRelative(kind, digest), bytes });
  } catch {
    bytes.fill(0);
    fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  }
  bytes.fill(0);
  return Object.freeze({ digest, relativePath: censusPrivateRelative(kind, digest) });
}

function readCensusRecord(state, relativePath, expectedDigest, keys) {
  let bytes;
  try { bytes = state.read({ root: 'runtime', relativePath }); } catch {
    fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  }
  const record = parseCanonicalCensusRecord(bytes, keys);
  if (record.digest !== expectedDigest) {
    fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  }
  return record.value;
}

function firstCensusRecord(value, sourceCommit) {
  exactObject(value, [
    'schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt',
  ], 'SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  if (
    value.schemaVersion !== 1 || value.profile !== CENSUS_PROFILE
    || value.sourceCommit !== sourceCommit
  ) fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  const sample = exactCensusSample(Object.freeze({
    applicant: value.applicant,
    admitted: value.admitted,
  }), sourceCommit);
  const observedAt = Math.max(sample.applicant.observedAt.value, sample.admitted.observedAt.value);
  if (value.observedAt !== new Date(observedAt).toISOString()) {
    fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  }
  return Object.freeze({ sample, observedAt });
}

function secondCensusRecord(value, sourceCommit) {
  exactObject(value, [
    'schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt',
  ], 'SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  return firstCensusRecord(value, sourceCommit);
}

function validateStableCensusPair(first, second, sourceCommit) {
  const applicantFirst = first.sample.applicant;
  const applicantSecond = second.sample.applicant;
  const applicantSeparation = applicantSecond.observedAt.value - applicantFirst.observedAt.value;
  const admittedFirst = first.sample.admitted;
  const admittedSecond = second.sample.admitted;
  try {
    projectGenesis001AdmittedPlayerCensusStablePair({
      first: admittedFirst.receipt,
      second: admittedSecond.receipt,
    });
  } catch {
    fail('SEALED_REALMS_G001_CENSUS_STABILITY_INVALID');
  }
  if (
    applicantSeparation < CENSUS_MINIMUM_STABLE_SEPARATION_MS
    || applicantSeparation > CENSUS_MAXIMUM_STABLE_SEPARATION_MS
    || applicantFirst.sourceCommit !== sourceCommit
    || applicantSecond.sourceCommit !== sourceCommit
    || applicantFirst.privateCensusReference.count !== applicantSecond.privateCensusReference.count
    || applicantFirst.privateCensusReference.size !== applicantSecond.privateCensusReference.size
    || applicantFirst.privateCensusReference.sha256 !== applicantSecond.privateCensusReference.sha256
    || applicantFirst.privateCensusReference.pathBasename === applicantSecond.privateCensusReference.pathBasename
    || applicantFirst.privateBlindingNonceHex === applicantSecond.privateBlindingNonceHex
    || applicantFirst.opaqueProofDigest === applicantSecond.opaqueProofDigest
  ) fail('SEALED_REALMS_G001_CENSUS_STABILITY_INVALID');
  const values = [
    applicantFirst.privateBlindingNonceHex,
    applicantSecond.privateBlindingNonceHex,
    admittedFirst.receipt.nonceHex,
    admittedSecond.receipt.nonceHex,
    applicantFirst.opaqueProofDigest,
    applicantSecond.opaqueProofDigest,
    admittedFirst.receipt.opaqueProofDigest,
    admittedSecond.receipt.opaqueProofDigest,
  ];
  if (new Set(values).size !== values.length) fail('SEALED_REALMS_G001_CENSUS_STABILITY_INVALID');
  const firstObservedAt = first.observedAt;
  const secondObservedAt = second.observedAt;
  const separation = secondObservedAt - firstObservedAt;
  if (
    separation < CENSUS_MINIMUM_STABLE_SEPARATION_MS
    || separation > CENSUS_MAXIMUM_STABLE_SEPARATION_MS
  ) fail('SEALED_REALMS_G001_CENSUS_STABILITY_INVALID');
  return Object.freeze({ firstObservedAt, secondObservedAt });
}

function censusConfirmationDigest(sourceCommit, firstDigest, secondDigest, expiresAt) {
  return digestBytes(Buffer.from([
    'warpkeep.sealed-realms.g001-census-confirmation.v1', sourceCommit,
    firstDigest, secondDigest, expiresAt,
  ].join('\n'), 'utf8'));
}

function readCensusNow(authority) {
  let value;
  try { value = authority.now(); } catch {
    fail('SEALED_REALMS_G001_CENSUS_CLOCK_INVALID');
  }
  return exactDate(value, 'SEALED_REALMS_G001_CENSUS_CLOCK_INVALID');
}

/**
 * Captures the fixed census collector, durable private state, and monitor
 * operator outside dispatcher input.  It is an opaque capability: callers can
 * supply neither a receipt nor a mutable census result to an operation.
 */
export function createSealedRealmsProductionG001CensusAuthority(input) {
  const options = exactObject(input, [
    'privateState', 'collect', 'suspend', 'now',
  ], 'SEALED_REALMS_G001_CENSUS_AUTHORITY_INPUT_INVALID');
  if (
    typeof options.collect !== 'function' || typeof options.suspend !== 'function'
    || typeof options.now !== 'function'
  ) fail('SEALED_REALMS_G001_CENSUS_AUTHORITY_INPUT_INVALID');
  let privateState;
  try { privateState = assertSealedRealmsProductionPrivateState(options.privateState); } catch {
    fail('SEALED_REALMS_G001_CENSUS_AUTHORITY_INPUT_INVALID');
  }
  const capability = Object.freeze({});
  censusAuthorities.set(capability, Object.freeze({
    privateState,
    collect: options.collect,
    suspend: options.suspend,
    now: options.now,
  }));
  return capability;
}

function censusAuthorityMember(capability) {
  const member = censusAuthorities.get(capability);
  if (member === undefined) fail('SEALED_REALMS_G001_CENSUS_AUTHORITY_INVALID');
  return member;
}

async function collectCensusSample(member, sourceCommit) {
  let raw;
  try { raw = await member.collect(Object.freeze({ sourceCommit })); } catch {
    fail('SEALED_REALMS_G001_CENSUS_UNAVAILABLE');
  }
  return exactCensusSample(raw, sourceCommit);
}

async function censusFirst(authority, capability) {
  const member = censusAuthorityMember(capability);
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  const sample = await collectCensusSample(member, sourceCommit);
  const observedAt = new Date(Math.max(sample.applicant.observedAt.value, sample.admitted.observedAt.value));
  const record = Object.freeze({
    schemaVersion: 1,
    profile: CENSUS_PROFILE,
    sourceCommit,
    applicant: canonicalCensusApplicant(sample.applicant),
    admitted: sample.admitted.receipt,
    observedAt: observedAt.toISOString(),
  });
  const persisted = writeCensusRecord(member.privateState, 'first', record);
  const confirmation = Object.freeze({});
  censusFirstConfirmations.set(confirmation, Object.freeze({
    capability, sourceCommit, firstDigest: persisted.digest, firstRelativePath: persisted.relativePath,
  }));
  return Object.freeze({ status: 'completed', confirmation });
}

function inputConfirmation(value) {
  if (
    value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(['confirmation'])
    || value.confirmation === null || typeof value.confirmation !== 'object'
  ) fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID');
  return value.confirmation;
}

async function censusSecondInspect(authority, capability, input) {
  const confirmation = inputConfirmation(input);
  const firstMember = censusFirstConfirmations.get(confirmation);
  if (firstMember === undefined || firstMember.capability !== capability || censusFirstClaims.has(confirmation)) {
    fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID');
  }
  censusFirstClaims.add(confirmation);
  try {
    const member = censusAuthorityMember(capability);
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
    if (firstMember.sourceCommit !== sourceCommit) fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID');
    const first = firstCensusRecord(readCensusRecord(
      member.privateState, firstMember.firstRelativePath, firstMember.firstDigest,
      ['schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt'],
    ), sourceCommit);
    const sample = await collectCensusSample(member, sourceCommit);
    const observedAt = new Date(Math.max(sample.applicant.observedAt.value, sample.admitted.observedAt.value));
    const secondRecord = Object.freeze({
      schemaVersion: 1,
      profile: CENSUS_PROFILE,
      sourceCommit,
      applicant: canonicalCensusApplicant(sample.applicant),
      admitted: sample.admitted.receipt,
      observedAt: observedAt.toISOString(),
    });
    const secondPersisted = writeCensusRecord(member.privateState, 'second', secondRecord);
    const second = secondCensusRecord(readCensusRecord(
      member.privateState, secondPersisted.relativePath, secondPersisted.digest,
      ['schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt'],
    ), sourceCommit);
    const stable = validateStableCensusPair(first, second, sourceCommit);
    const expiresAt = new Date(stable.secondObservedAt + CENSUS_CONFIRMATION_TTL_MS).toISOString();
    const confirmationDigest = censusConfirmationDigest(
      sourceCommit, firstMember.firstDigest, secondPersisted.digest, expiresAt,
    );
    const confirmationRecord = Object.freeze({
      schemaVersion: 1,
      profile: CENSUS_PROFILE,
      sourceCommit,
      firstDigest: firstMember.firstDigest,
      secondDigest: secondPersisted.digest,
      secondObservedAt: new Date(stable.secondObservedAt).toISOString(),
      expiresAt,
      confirmationDigest,
    });
    const confirmationPersisted = writeCensusRecord(member.privateState, 'confirmation', confirmationRecord);
    const secondConfirmation = Object.freeze({});
    censusFirstConfirmations.delete(confirmation);
    censusFirstClaims.delete(confirmation);
    censusSecondConfirmations.set(secondConfirmation, Object.freeze({
      capability,
      sourceCommit,
      firstDigest: firstMember.firstDigest,
      firstRelativePath: firstMember.firstRelativePath,
      secondDigest: secondPersisted.digest,
      secondRelativePath: secondPersisted.relativePath,
      confirmationDigest,
      confirmationRelativePath: confirmationPersisted.relativePath,
      confirmationRecordDigest: confirmationPersisted.digest,
    }));
    return Object.freeze({ status: 'completed', confirmation: secondConfirmation });
  } catch (error) {
    censusFirstClaims.delete(confirmation);
    if (error instanceof SealedRealmsProductionG001LaneError) throw error;
    fail('SEALED_REALMS_G001_CENSUS_INVALID');
  }
}

async function censusSecondSuspend(authority, capability, input) {
  const confirmation = inputConfirmation(input);
  const memberRecord = censusSecondConfirmations.get(confirmation);
  if (memberRecord === undefined || memberRecord.capability !== capability || censusSecondClaims.has(confirmation)) {
    fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID');
  }
  // Claim synchronously and irreversibly before any private read or operator call.
  censusSecondClaims.add(confirmation);
  censusSecondConfirmations.delete(confirmation);
  const member = censusAuthorityMember(capability);
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  if (memberRecord.sourceCommit !== sourceCommit) fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID');
  const confirmationRecord = readCensusRecord(
    member.privateState, memberRecord.confirmationRelativePath, memberRecord.confirmationRecordDigest,
    ['schemaVersion', 'profile', 'sourceCommit', 'firstDigest', 'secondDigest', 'secondObservedAt', 'expiresAt', 'confirmationDigest'],
  );
  if (
    confirmationRecord.schemaVersion !== 1 || confirmationRecord.profile !== CENSUS_PROFILE
    || confirmationRecord.sourceCommit !== sourceCommit
    || confirmationRecord.firstDigest !== memberRecord.firstDigest
    || confirmationRecord.secondDigest !== memberRecord.secondDigest
    || confirmationRecord.confirmationDigest !== memberRecord.confirmationDigest
    || censusConfirmationDigest(
      sourceCommit, memberRecord.firstDigest, memberRecord.secondDigest, confirmationRecord.expiresAt,
    ) !== memberRecord.confirmationDigest
  ) fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  const first = firstCensusRecord(readCensusRecord(
    member.privateState, memberRecord.firstRelativePath, memberRecord.firstDigest,
    ['schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt'],
  ), sourceCommit);
  const second = secondCensusRecord(readCensusRecord(
    member.privateState, memberRecord.secondRelativePath, memberRecord.secondDigest,
    ['schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt'],
  ), sourceCommit);
  const stable = validateStableCensusPair(first, second, sourceCommit);
  if (
    confirmationRecord.secondObservedAt !== new Date(stable.secondObservedAt).toISOString()
    || confirmationRecord.expiresAt !== new Date(stable.secondObservedAt + CENSUS_CONFIRMATION_TTL_MS).toISOString()
  ) fail('SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID');
  const now = readCensusNow(member);
  const expiry = Date.parse(confirmationRecord.expiresAt);
  if (now.value < stable.secondObservedAt || now.value >= expiry) {
    fail('SEALED_REALMS_G001_CENSUS_CONFIRMATION_EXPIRED');
  }
  const consumed = Object.freeze({
    schemaVersion: 1,
    profile: CENSUS_PROFILE,
    sourceCommit,
    firstDigest: memberRecord.firstDigest,
    secondDigest: memberRecord.secondDigest,
    confirmationDigest: memberRecord.confirmationDigest,
    consumedAt: now.text,
  });
  writeCensusRecord(member.privateState, 'consumed', consumed);
  try {
    await member.suspend(Object.freeze({ sourceCommit }));
  } catch {
    fail('SEALED_REALMS_G001_CENSUS_SUSPEND_UNAVAILABLE');
  }
  return Object.freeze({ status: 'completed' });
}

/** A test-only fixed-file hash adapter; ordinary lane/dispatch inputs cannot forge it. */
export function createSealedRealmsProductionG001CurrentStateTestAdapter(input) {
  if (process.env.NODE_ENV !== 'test') {
    fail('SEALED_REALMS_G001_CURRENT_STATE_TEST_ADAPTER_FORBIDDEN');
  }
  const options = exactObject(input, ['hashFixedFile'], 'SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  if (typeof options.hashFixedFile !== 'function') {
    fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  }
  const capability = Object.freeze({});
  currentStateTestAdapters.set(capability, options.hashFixedFile);
  return capability;
}

/**
 * Captures the sole G001 launch authority.  It is deliberately raw-Git based:
 * no caller can provide a tree/blob/hash/path-shaped receipt through dispatch
 * input.  The private path resolver is retained only inside this capability.
 */
export function createSealedRealmsProductionG001LaunchAuthority(input) {
  const options = exactObject(input, [
    'readRawGit', 'resolveAdminSecretPath', 'persistPolicyObservation',
  ], 'SEALED_REALMS_G001_LAUNCH_AUTHORITY_INPUT_INVALID');
  if (
    typeof options.readRawGit !== 'function'
    || typeof options.resolveAdminSecretPath !== 'function'
    || typeof options.persistPolicyObservation !== 'function'
  ) {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INPUT_INVALID');
  }
  const capability = Object.freeze({});
  launchAuthorities.set(capability, Object.freeze({
    readRawGit: options.readRawGit,
    resolveAdminSecretPath: options.resolveAdminSecretPath,
    persistPolicyObservation: options.persistPolicyObservation,
  }));
  return capability;
}

async function rawGitText(readRawGit, args) {
  let value;
  try { value = await readRawGit(Object.freeze([...args])); } catch {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1024) {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  return value;
}

async function rawGitBytes(readRawGit, args) {
  let value;
  try { value = await readRawGit(Object.freeze([...args])); } catch {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  if (!(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  const bytes = Buffer.from(value);
  if (bytes.byteLength < 1 || bytes.byteLength > 2 * 1024 * 1024) {
    bytes.fill(0);
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  return bytes;
}

function exactRawGitCommit(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}\n$/u.test(value)) {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  return value.slice(0, -1);
}

async function launchReceipt(launchAuthority, sourceCommit) {
  const capability = launchAuthorities.get(launchAuthority);
  if (capability === undefined) {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  const moduleTree = exactRawGitCommit(await rawGitText(capability.readRawGit, [
    'rev-parse', '--verify', `${sourceCommit}^{tree}`,
  ]));
  const bootstrapBlob = exactRawGitCommit(await rawGitText(capability.readRawGit, [
    'rev-parse', '--verify', `${sourceCommit}:scripts/greater-realm-production-bootstrap.mjs`,
  ]));
  const bootstrapBytes = await rawGitBytes(capability.readRawGit, [
    'cat-file', 'blob', bootstrapBlob,
  ]);
  try {
    if (createHash('sha256').update(bootstrapBytes).digest('hex') !== EXPECTED_BOOTSTRAP_SHA256) {
      fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
    }
  } finally {
    bootstrapBytes.fill(0);
  }
  const envelopeBlob = exactRawGitCommit(await rawGitText(capability.readRawGit, [
    'rev-parse', '--verify', `${sourceCommit}:${ENVELOPE_PATH}`,
  ]));
  if (envelopeBlob !== EXPECTED_ENVELOPE_BLOB) {
    fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  }
  const envelopeBytes = await rawGitBytes(capability.readRawGit, [
    'cat-file', 'blob', envelopeBlob,
  ]);
  let envelopeText;
  try {
    if (
      envelopeBytes.byteLength !== EXPECTED_ENVELOPE_BYTES
      || createHash('sha256').update(envelopeBytes).digest('hex') !== EXPECTED_ENVELOPE_SHA256
      || envelopeBytes.includes(0)
    ) fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
    try {
      envelopeText = new TextDecoder('utf-8', { fatal: true }).decode(envelopeBytes);
    } catch {
      fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
    }
    if (!envelopeText.endsWith('\n')) {
      fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
    }
  } finally {
    envelopeBytes.fill(0);
  }
  let secret;
  try {
    secret = await capability.resolveAdminSecretPath(Object.freeze({ sourceCommit }));
  } catch {
    fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  }
  exactObject(secret, ['sourceCommit', 'path'], 'SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  if (
    secret.sourceCommit !== sourceCommit
    || exactPrivatePath(secret.path, 'SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID') !== posix.resolve(secret.path)
  ) fail('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID');
  return Object.freeze({
    protectedMain: sourceCommit,
    moduleTree,
    bootstrapBlob,
    bootstrapSha256: EXPECTED_BOOTSTRAP_SHA256,
    envelopeText,
    adminSecretPath: secret.path,
  });
}

function receiptDerivedEnvelopeArguments(receipt, command, extraArguments = []) {
  if (!['g001-policy-observe', 'launch-run-inspect', 'launch-run-cleanup'].includes(command)) {
    fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  }
  if (!Array.isArray(extraArguments) || extraArguments.some(value => typeof value !== 'string')) {
    fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  }
  const policy = command === 'g001-policy-observe';
  return Object.freeze([
    receipt.protectedMain,
    receipt.moduleTree,
    receipt.bootstrapBlob,
    receipt.bootstrapSha256,
    policy ? ENVELOPE_NODE.path : '-',
    '-',
    '-',
    policy ? receipt.adminSecretPath : '-',
    '-',
    '-',
    command,
    ...extraArguments,
  ]);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function descriptorDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function exactTimestamp(value) {
  if (
    typeof value !== 'string'
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(value)
  ) fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== value) {
    fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  }
  return value;
}

function updateLengthFramed(hash, label, value) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  try {
    length.writeBigUInt64BE(BigInt(labelBytes.byteLength));
    hash.update(length).update(labelBytes);
    length.writeBigUInt64BE(BigInt(valueBytes.byteLength));
    hash.update(length).update(valueBytes);
  } finally {
    length.fill(0);
  }
}

function exactPolicyObservationReceipt(value, sourceCommit) {
  exactObject(value, [
    'schemaVersion', 'profile', 'sourceCommit', 'observedAt', 'databaseIdentity',
    'procedure', 'mutationSubmitted', 'policy', 'policyReceiptDigest',
  ], 'SEALED_REALMS_G001_ENVELOPE_INVALID');
  exactObject(value.policy, [
    'realmId', 'releaseVersion', 'playerAccessEnabled',
    'admissionStateMutationsEnabled', 'accessRequestSubmissionsEnabled',
    'sourceBaselineCommit', 'freezeReleaseNonce',
  ], 'SEALED_REALMS_G001_ENVELOPE_INVALID');
  if (
    value.schemaVersion !== 1
    || value.profile !== 'warpkeep-genesis-001-live-policy-observation-v1'
    || value.sourceCommit !== sourceCommit
    || value.databaseIdentity !== 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
    || value.procedure !== 'genesis_001_access_policy_v1'
    || value.mutationSubmitted !== false
    || value.policy.realmId !== 'GENESIS_001'
    || value.policy.releaseVersion !== '0.3.43'
    || value.policy.playerAccessEnabled !== true
    || value.policy.admissionStateMutationsEnabled !== false
    || value.policy.accessRequestSubmissionsEnabled !== false
    || value.policy.sourceBaselineCommit !== '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
    || value.policy.freezeReleaseNonce !== '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
    || value.policyReceiptDigest !== descriptorDigest(value.policy)
  ) fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  exactTimestamp(value.observedAt);
  return value;
}

function bootstrapObservationLinkDigest(receipt) {
  const hash = createHash('sha256');
  updateLengthFramed(hash, 'domain', 'warpkeep-production-g001-policy-observation-bootstrap-link-v1');
  updateLengthFramed(hash, 'protectedCommit', receipt.protectedCommit);
  updateLengthFramed(hash, 'moduleTreeId', receipt.moduleTreeId);
  updateLengthFramed(hash, 'bootstrapBlob', receipt.bootstrapBlob);
  updateLengthFramed(hash, 'bootstrapSha256', receipt.bootstrapSha256);
  updateLengthFramed(hash, 'command', 'g001-policy-observe');
  updateLengthFramed(hash, 'launchCleanup', `${JSON.stringify(canonical(receipt.launchCleanup))}\n`);
  updateLengthFramed(hash, 'policyObservationReceipt', `${JSON.stringify(receipt.policyObservationReceipt)}\n`);
  return hash.digest('hex');
}

function exactPolicyObservation(output, receipt) {
  const value = exactCanonicalJsonOutput(output, [
    'profile', 'protectedCommit', 'moduleTreeId', 'bootstrapBlob', 'bootstrapSha256',
    'moduleArchiveCount', 'command', 'launchCleanup', 'policyObservationReceipt',
    'policyObservationReceiptLinkSha256',
  ], 'SEALED_REALMS_G001_ENVELOPE_INVALID');
  exactObject(value.launchCleanup, [
    'outcome', 'runId', 'cleanupConfirmationSha256', 'treeInventorySha256',
  ], 'SEALED_REALMS_G001_ENVELOPE_INVALID');
  exactPolicyObservationReceipt(value.policyObservationReceipt, receipt.protectedMain);
  if (
    value.profile !== 'warpkeep-greater-realm-production-bootstrap-v1'
    || value.protectedCommit !== receipt.protectedMain
    || value.moduleTreeId !== receipt.moduleTree
    || value.bootstrapBlob !== receipt.bootstrapBlob
    || value.bootstrapSha256 !== receipt.bootstrapSha256
    || value.moduleArchiveCount !== 16
    || value.command !== 'g001-policy-observe'
    || value.launchCleanup.outcome !== 'cleaned'
    || !RUN_ID.test(value.launchCleanup.runId)
    || !/^[a-f0-9]{64}$/u.test(value.launchCleanup.cleanupConfirmationSha256)
    || !/^[a-f0-9]{64}$/u.test(value.launchCleanup.treeInventorySha256)
    || !/^[a-f0-9]{64}$/u.test(value.policyObservationReceiptLinkSha256)
    || value.policyObservationReceiptLinkSha256 !== bootstrapObservationLinkDigest(value)
  ) fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  return value;
}

function exactCanonicalJsonOutput(output, keys, code) {
  let value;
  try { value = JSON.parse(output); } catch {
    fail(code);
  }
  exactObject(value, keys, code);
  if (`${JSON.stringify(value)}\n` !== output) fail(code);
  return value;
}

const LIFECYCLE_PROFILE = 'warpkeep-greater-realm-production-launch-lifecycle-v1';
const RUN_ID = /^run-[a-f0-9]{32}$/u;

function exactLifecycleSummary(value) {
  exactObject(value, [
    'authorityPhase', 'authorityPublication', 'blockers', 'childState',
    'containmentEligible', 'launchPhase', 'launchPublication', 'ownerState',
    'processGroupState', 'repairableLaunchTemporaryCount',
    'repairablePartialAuthorityCount', 'runId', 'runState',
  ], 'SEALED_REALMS_G001_LIFECYCLE_INVALID');
  if (
    !RUN_ID.test(value.runId) || !['present', 'absent'].includes(value.runState)
    || !Array.isArray(value.blockers) || value.blockers.some(item => typeof item !== 'string')
    || typeof value.containmentEligible !== 'boolean'
    || !Number.isSafeInteger(value.repairableLaunchTemporaryCount)
    || !Number.isSafeInteger(value.repairablePartialAuthorityCount)
  ) fail('SEALED_REALMS_G001_LIFECYCLE_INVALID');
  return value;
}

function parseLifecycleInventory(output) {
  const value = exactCanonicalJsonOutput(output, ['profile', 'runs'], 'SEALED_REALMS_G001_LIFECYCLE_INVALID');
  if (
    value.profile !== LIFECYCLE_PROFILE || !Array.isArray(value.runs)
    || value.runs.length > 1
  ) fail('SEALED_REALMS_G001_LIFECYCLE_INVALID');
  return Object.freeze(value.runs.map(exactLifecycleSummary));
}

function parseLifecycleDetail(output, runId) {
  const value = exactCanonicalJsonOutput(output, [
    'authorityPhase', 'authorityPublication', 'blockers', 'childState',
    'cleanupEligible', 'confirmationDigest', 'containmentEligible', 'deletionEligible',
    'launchPhase', 'launchPublication', 'ownerState', 'processGroupState', 'profile',
    'repairableLaunchTemporaryCount', 'repairablePartialAuthorityCount', 'runId',
    'runState', 'treeInventory',
  ], 'SEALED_REALMS_G001_LIFECYCLE_INVALID');
  exactLifecycleSummary(Object.freeze({
    authorityPhase: value.authorityPhase,
    authorityPublication: value.authorityPublication,
    blockers: value.blockers,
    childState: value.childState,
    containmentEligible: value.containmentEligible,
    launchPhase: value.launchPhase,
    launchPublication: value.launchPublication,
    ownerState: value.ownerState,
    processGroupState: value.processGroupState,
    repairableLaunchTemporaryCount: value.repairableLaunchTemporaryCount,
    repairablePartialAuthorityCount: value.repairablePartialAuthorityCount,
    runId: value.runId,
    runState: value.runState,
  }));
  if (
    value.profile !== LIFECYCLE_PROFILE || value.runId !== runId
    || value.cleanupEligible !== true || value.deletionEligible !== true
    || !/^[a-f0-9]{64}$/u.test(value.confirmationDigest)
    || value.treeInventory === null || typeof value.treeInventory !== 'object'
    || Array.isArray(value.treeInventory)
  ) fail('SEALED_REALMS_G001_LIFECYCLE_INVALID');
  return value;
}

function parseLifecycleCleanup(output, runId, confirmationDigest) {
  const value = exactCanonicalJsonOutput(output, [
    'confirmationDigest', 'outcome', 'profile', 'runId', 'runState',
  ], 'SEALED_REALMS_G001_LIFECYCLE_INVALID');
  if (
    value.profile !== LIFECYCLE_PROFILE || value.runId !== runId
    || value.confirmationDigest !== confirmationDigest
    || value.outcome !== 'cleaned' || value.runState !== 'absent'
  ) fail('SEALED_REALMS_G001_LIFECYCLE_INVALID');
}

async function runAuthenticatedFrozenEnvelope({
  authority,
  launchAuthority,
  attestDispatcherNode,
  runEnvelopeChild,
}) {
  if (
    typeof attestDispatcherNode !== 'function' || typeof runEnvelopeChild !== 'function'
  ) fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  let dispatcherNode;
  try {
    dispatcherNode = attestDispatcherNode();
  } catch {
    fail('SEALED_REALMS_G001_ENVELOPE_ATTESTATION_INVALID');
  }
  exactNode(dispatcherNode, DISPATCHER_NODE, 'SEALED_REALMS_G001_ENVELOPE_ATTESTATION_INVALID');
  const receipt = await launchReceipt(launchAuthority, sourceCommit);
  const invoke = async (command, extraArguments = []) => exactChild(runEnvelopeChild, {
    file: '/usr/bin/env',
    args: Object.freeze([
      '-i', '/bin/sh', '-c', receipt.envelopeText,
      'warpkeep-production', ...receiptDerivedEnvelopeArguments(receipt, command, extraArguments),
    ]),
    shell: false,
    env: EMPTY_ENVIRONMENT,
  }, 'SEALED_REALMS_G001_ENVELOPE_UNAVAILABLE');
  const existing = parseLifecycleInventory(await invoke('launch-run-inspect'));
  if (existing.length === 1) {
    const summary = existing[0];
    if (summary.authorityPhase === 'complete' && summary.runState === 'absent') {
      return Object.freeze({ outcome: 'adopted' });
    }
    const detail = parseLifecycleDetail(await invoke('launch-run-inspect', [summary.runId]), summary.runId);
    await invoke('launch-run-cleanup', [summary.runId, detail.confirmationDigest])
      .then(output => parseLifecycleCleanup(output, summary.runId, detail.confirmationDigest));
  }
  const output = await invoke('g001-policy-observe');
  const observation = exactPolicyObservation(output, receipt);
  const persistence = launchAuthorities.get(launchAuthority);
  const bytes = Buffer.from(output, 'utf8');
  try {
    await persistence.persistPolicyObservation(Object.freeze({
      sourceCommit,
      bytes,
    }));
  } catch {
    fail('SEALED_REALMS_G001_ENVELOPE_INVALID');
  } finally {
    bytes.fill(0);
  }
  void observation;
  return Object.freeze({ outcome: 'observed' });
}

function childResult(value, code, allowMissingLaunchService = false) {
  exactObject(value, ['status', 'stdout', 'stderr'], code);
  if (
    !Number.isSafeInteger(value.status)
    || typeof value.stdout !== 'string' || typeof value.stderr !== 'string'
    || Buffer.byteLength(value.stdout, 'utf8') > 64 * 1_024
    || Buffer.byteLength(value.stderr, 'utf8') > 8 * 1_024
  ) fail(code);
  if (value.status === 0 && value.stderr === '') return value.stdout;
  if (
    allowMissingLaunchService && value.status !== 0 && value.stdout === ''
    && /^Could not find service[^\r\n]*(?:\r?\n)?$/u.test(value.stderr)
  ) return null;
  fail(code);
}

function parseDisabled(output) {
  const escaped = LABEL.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const matches = output.split(/\r?\n/u)
    .map(line => new RegExp(`^\\s*"${escaped}"\\s*=>\\s*(enabled|disabled)\\s*$`, 'u').exec(line))
    .filter(match => match !== null);
  if (matches.length !== 1) fail('SEALED_REALMS_G001_CURRENT_STATE_INVALID');
  return matches[0][1] === 'disabled';
}

function exactFileIdentity(value, path, accountUid, expectedMode, byteLength) {
  exactObject(value, [
    'dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs', 'realpath',
  ], 'SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  const exactInteger = current => Number.isSafeInteger(current) && current >= 0;
  if (
    !exactInteger(value.dev) || !exactInteger(value.ino)
    || value.uid !== accountUid || value.mode !== expectedMode || value.nlink !== 1
    || value.size !== byteLength || !exactInteger(value.mtimeNs) || !exactInteger(value.ctimeNs)
    || value.realpath !== path
  ) fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  return Object.freeze({ ...value });
}

function fixedFile(readFixedFile, kind, path, accountUid, expectedMode, testAdapter) {
  let value;
  try { value = readFixedFile(Object.freeze({ kind, path })); } catch {
    fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  }
  exactObject(value, ['kind', 'path', 'body', 'identity'], 'SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  const expectedDigest = kind === 'plist' ? EXPECTED_PLIST_SHA256 : EXPECTED_PROGRAM_SHA256;
  if (
    value.kind !== kind
    || value.path !== path
    || (!(value.body instanceof Uint8Array) && !Buffer.isBuffer(value.body))
    || value.body.byteLength < 1 || value.body.byteLength > (kind === 'plist' ? 64 * 1024 : 256 * 1024)
  ) fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  const body = Buffer.from(value.body);
  const identity = exactFileIdentity(value.identity, path, accountUid, expectedMode, body.byteLength);
  let digest;
  try {
    const testHash = currentStateTestAdapters.get(testAdapter);
    digest = testHash === undefined
      ? createHash('sha256').update(body).digest('hex')
      : testHash(Object.freeze({ kind, bytes: Buffer.from(body) }));
  } catch {
    body.fill(0);
    fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  }
  if (digest !== expectedDigest) {
    body.fill(0);
    fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
  }
  return Object.freeze({ body, identity });
}

function sameFixedFile(left, right) {
  return left.body.equals(right.body) && [
    'dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs', 'realpath',
  ].every(key => left.identity[key] === right.identity[key]);
}

async function exactChild(runChild, request, code, allowMissingLaunchService = false) {
  let result;
  try { result = await runChild(Object.freeze(request)); } catch {
    fail(code);
  }
  return childResult(result, code, allowMissingLaunchService);
}

/**
 * Reimplements only the frozen read-only monitor inspection with fixed tools,
 * fixed argv and opaque output. Test seams receive no file path or command
 * choice, so neither a caller nor a lane can substitute a shell command.
 */
export async function inspectSealedRealmsProductionG001CurrentState(input = {}) {
  const options = exactObject(input, [
    'authority', 'runChild', 'readFixedFile', 'resolveAccountUid', 'resolveAccountHome',
    'testOnlyAdapter',
  ], 'SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  if (
    typeof options.runChild !== 'function' || typeof options.readFixedFile !== 'function'
    || typeof options.resolveAccountUid !== 'function' || typeof options.resolveAccountHome !== 'function'
    || (options.testOnlyAdapter !== undefined && !currentStateTestAdapters.has(options.testOnlyAdapter))
  ) fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (options.authority.operation !== 'g001-current-state') {
    fail('SEALED_REALMS_G001_CURRENT_STATE_SOURCE_OPERATION_INVALID');
  }
  let accountUid;
  try { accountUid = options.resolveAccountUid(); } catch {
    fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  }
  if (!Number.isSafeInteger(accountUid) || accountUid < 1 || accountUid > 0x7fff_ffff) {
    fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  }
  let accountHome;
  try { accountHome = options.resolveAccountHome(); } catch {
    fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  }
  if (
    typeof accountHome !== 'string' || !accountHome.startsWith('/')
    || accountHome !== posix.resolve(accountHome)
  ) fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
  if (options.testOnlyAdapter === undefined) {
    let actualHome;
    try { actualHome = posix.resolve(userInfo().homedir); } catch {
      fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
    }
    if (accountHome !== actualHome || accountUid !== process.getuid?.()) {
      fail('SEALED_REALMS_G001_CURRENT_STATE_INPUT_INVALID');
    }
  }
  const plistPath = `${accountHome}/Library/LaunchAgents/${LABEL}.plist`;
  const programPath = `${accountHome}/.hermes/scripts/warpkeep_admission_monitor.py`;
  const plist = fixedFile(
    options.readFixedFile, 'plist', plistPath, accountUid, 0o600, options.testOnlyAdapter,
  );
  const program = fixedFile(
    options.readFixedFile, 'program', programPath, accountUid, 0o700, options.testOnlyAdapter,
  );
  try {
    const git = await exactChild(options.runChild, {
      file: '/usr/bin/git',
      args: Object.freeze(['rev-parse', '--verify', 'HEAD^{commit}']),
      shell: false,
      env: FIXED_ENVIRONMENT,
    }, 'SEALED_REALMS_G001_CURRENT_STATE_UNAVAILABLE');
    if (git !== `${sourceCommit}\n`) fail('SEALED_REALMS_G001_CURRENT_STATE_INVALID');
    const plistJson = await exactChild(options.runChild, {
      file: '/usr/bin/plutil',
      args: Object.freeze(['-convert', 'json', '-o', '-', '--', '-']),
      shell: false,
      env: FIXED_ENVIRONMENT,
      input: Buffer.from(plist.body),
    }, 'SEALED_REALMS_G001_CURRENT_STATE_UNAVAILABLE');
    let parsed;
    try { parsed = JSON.parse(plistJson); } catch {
      fail('SEALED_REALMS_G001_CURRENT_STATE_INVALID');
    }
    if (
      parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype
      || JSON.stringify(Object.keys(parsed)) !== JSON.stringify(['Label', 'ProgramArguments'])
      || parsed.Label !== LABEL
      || !Array.isArray(parsed.ProgramArguments)
      || parsed.ProgramArguments.length !== 4
      || parsed.ProgramArguments[0] !== programPath
      || JSON.stringify(parsed.ProgramArguments.slice(1)) !== JSON.stringify(['loop', '--interval', '60'])
    ) fail('SEALED_REALMS_G001_CURRENT_STATE_INVALID');
    const domain = `gui/${accountUid}`;
    const disabled = parseDisabled(await exactChild(options.runChild, {
      file: '/bin/launchctl',
      args: Object.freeze(['print-disabled', domain]),
      shell: false,
      env: FIXED_ENVIRONMENT,
    }, 'SEALED_REALMS_G001_CURRENT_STATE_UNAVAILABLE'));
    const loaded = (await exactChild(options.runChild, {
      file: '/bin/launchctl',
      args: Object.freeze(['print', `${domain}/${LABEL}`]),
      shell: false,
      env: FIXED_ENVIRONMENT,
    }, 'SEALED_REALMS_G001_CURRENT_STATE_UNAVAILABLE', true)) !== null;
    const postPlist = fixedFile(
      options.readFixedFile, 'plist', plistPath, accountUid, 0o600, options.testOnlyAdapter,
    );
    const postProgram = fixedFile(
      options.readFixedFile, 'program', programPath, accountUid, 0o700, options.testOnlyAdapter,
    );
    try {
      if (!sameFixedFile(plist, postPlist) || !sameFixedFile(program, postProgram)) {
        fail('SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID');
      }
    } finally {
      postPlist.body.fill(0);
      postProgram.body.fill(0);
    }
    if (!disabled || loaded) fail('SEALED_REALMS_G001_CURRENT_STATE_INVALID');
    const receipt = Object.freeze({});
    currentStateReceipts.set(receipt, Object.freeze({
      sourceCommit,
      plistIdentity: plist.identity,
      programIdentity: program.identity,
    }));
    return Object.freeze({ status: 'current-state-inspected', confirmation: receipt });
  } finally {
    plist.body.fill(0);
    program.body.fill(0);
  }
}

/** Reopens only a receipt minted by the fixed inspector for the same source. */
export function assertSealedRealmsProductionG001CurrentStateReceipt(receipt, authority) {
  const member = currentStateReceipts.get(receipt);
  if (
    member === undefined
    || member.sourceCommit !== sourceCommitFromSealedRealmsProductionAuthority(authority)
  ) fail('SEALED_REALMS_G001_CURRENT_STATE_RECEIPT_INVALID');
  return receipt;
}

function currentStateConfiguration(value) {
  exactObject(value, [
    'runChild', 'readFixedFile', 'resolveAccountUid', 'resolveAccountHome', 'testOnlyAdapter',
  ], 'SEALED_REALMS_G001_LANE_INPUT_INVALID');
  if (
    typeof value.runChild !== 'function' || typeof value.readFixedFile !== 'function'
    || typeof value.resolveAccountUid !== 'function' || typeof value.resolveAccountHome !== 'function'
    || (value.testOnlyAdapter !== undefined && !currentStateTestAdapters.has(value.testOnlyAdapter))
  ) fail('SEALED_REALMS_G001_LANE_INPUT_INVALID');
  return value;
}

/** Owns narrow G001 lifecycle seams and blocks any non-S mutation. */
export function createSealedRealmsProductionG001Lane(input) {
  const options = exactObject(input, [
    'launchAuthority', 'attestDispatcherNode', 'runEnvelopeChild',
    'censusAuthority', 'currentState', 'preflight',
  ], 'SEALED_REALMS_G001_LANE_INPUT_INVALID');
  if (
    launchAuthorities.get(options.launchAuthority) === undefined
    || typeof options.attestDispatcherNode !== 'function'
    || typeof options.runEnvelopeChild !== 'function'
    || (options.censusAuthority !== undefined && censusAuthorities.get(options.censusAuthority) === undefined)
    || typeof options.preflight !== 'function'
  ) fail('SEALED_REALMS_G001_LANE_INPUT_INVALID');
  const currentState = currentStateConfiguration(options.currentState);

  const execute = async ({ operation, authority, input } = {}) => {
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_G001_LANE_OPERATION_INVALID');
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_G001_LANE_SOURCE_OPERATION_INVALID');
    }
    if (authority.mode !== 'S' && !['preflight', 'g001-current-state'].includes(operation)) {
      fail('SEALED_REALMS_G001_LANE_SOURCE_MODE_INVALID');
    }
    if (operation === 'preflight') {
      await options.preflight(Object.freeze({ sourceCommit }));
      return Object.freeze({ status: 'preflight-inspected' });
    }
    if (operation === 'g001-current-state') {
      return inspectSealedRealmsProductionG001CurrentState(Object.freeze({
        authority,
        runChild: currentState.runChild,
        readFixedFile: currentState.readFixedFile,
        resolveAccountUid: currentState.resolveAccountUid,
        resolveAccountHome: currentState.resolveAccountHome,
        testOnlyAdapter: currentState.testOnlyAdapter,
      }));
    }
    requireWebSocket();
    if (operation === 'g001-policy-observe') {
      await runAuthenticatedFrozenEnvelope({
        authority,
        launchAuthority: options.launchAuthority,
        attestDispatcherNode: options.attestDispatcherNode,
        runEnvelopeChild: options.runEnvelopeChild,
      });
      return Object.freeze({ status: 'completed' });
    }
    if (options.censusAuthority === undefined) {
      fail('SEALED_REALMS_G001_CENSUS_UNAVAILABLE');
    }
    if (operation === 'g001-census-first') {
      return censusFirst(authority, options.censusAuthority);
    }
    if (operation === 'g001-census-second-inspect') {
      return censusSecondInspect(authority, options.censusAuthority, input);
    }
    return censusSecondSuspend(authority, options.censusAuthority, input);
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionG001Lane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_G001_LANE_CAPABILITY_INVALID');
  return lane;
}
