import { createHash } from 'node:crypto';
import { closeSync, constants, fsyncSync, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { types } from 'node:util';
import { genesis001CensusOpaqueProofDigest } from './genesis001-sealed-launch-adoption.mjs';
import { verifyGenesis001AdmittedPlayerCensusReceipt,
  projectGenesis001AdmittedPlayerCensusStablePair } from './genesis001-admitted-player-census.mjs';
import { createGenesis001LinuxPolicyReceipt, verifyGenesis001LinuxPolicyReceipt } from './genesis001-linux-policy-receipt.mjs';
import { createGenesis001LinuxFreezeConfirmationReceipt, createGenesis001LinuxFreezeCurrentStateReceipt,
  projectGenesis001LinuxFreezeEvidence } from './genesis001-linux-freeze-receipt.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { G001_POLICY_ROOT, policyPrivateAncestors } from './genesis001-linux-policy-boundary.mjs';

export const GENESIS_001_LINUX_CENSUS_COMPLETE_PROFILE = 'warpkeep-g001-linux-census-complete-v1';
const CENSUS_PROFILE = 'warpkeep-sealed-realms-g001-census-private-v1';
const COMMIT = /^[a-f0-9]{40}$/u, HASH = /^[a-f0-9]{64}$/u, RUN = /^[a-f0-9]{32}$/u;
const fail = () => { throw Error('G001_LINUX_CENSUS_ATTEMPT_INVALID'); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const record = value => Object.freeze({ recordDigest: digest(bytes(value)), record: Object.freeze(value) });
function exact(value, keys) {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length
    || keys.some(key => !fields[key]?.enumerable || !Object.hasOwn(fields[key], 'value'))) fail();
  return Object.fromEntries(keys.map(key => [key, fields[key].value]));
}
function time(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail();
  return Date.parse(value);
}
function applicant(value, sourceCommit) {
  const proof = exact(value, ['schemaVersion', 'profile', 'realmId', 'releaseVersion', 'sourceCommit',
    'privateCensusReference', 'privateBlindingNonceHex', 'opaqueProofDigest']);
  const reference = exact(proof.privateCensusReference, ['count', 'size', 'sha256', 'pathBasename']);
  if (proof.schemaVersion !== 1 || proof.profile !== 'warpkeep-genesis-001-census-export-private-proof-v1'
    || proof.realmId !== 'GENESIS_001' || proof.releaseVersion !== '0.3.43' || proof.sourceCommit !== sourceCommit
    || !Number.isSafeInteger(reference.count) || reference.count < 0 || reference.count > 4096
    || !Number.isSafeInteger(reference.size) || reference.size < 1 || reference.size > 1048576
    || !HASH.test(reference.sha256) || !HASH.test(proof.privateBlindingNonceHex)
    || /^0{64}$/u.test(proof.privateBlindingNonceHex)
    || proof.opaqueProofDigest !== genesis001CensusOpaqueProofDigest(proof)) fail();
  const match = /^warpkeep-access-request-census-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.txt$/u.exec(reference.pathBasename);
  if (!match) fail();
  const observedAt = time(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`);
  return { proof: Object.freeze({ ...proof, privateCensusReference: Object.freeze(reference) }), observedAt };
}
export function createGenesis001LinuxCensusSample(value, sourceCommit) {
  if (arguments.length !== 2 || !COMMIT.test(sourceCommit)) fail();
  const input = exact(value, ['applicant', 'admitted']);
  const a = applicant(input.applicant, sourceCommit), admitted = verifyGenesis001AdmittedPlayerCensusReceipt(input.admitted);
  if (admitted.preparationSourceCommit !== sourceCommit || a.proof.privateBlindingNonceHex === admitted.nonceHex
    || a.proof.opaqueProofDigest === admitted.opaqueProofDigest) fail();
  return Object.freeze({ schemaVersion: 1, profile: CENSUS_PROFILE, sourceCommit,
    applicant: a.proof, admitted, observedAt: new Date(Math.max(a.observedAt, time(admitted.observedAt))).toISOString() });
}
function sample(value, sourceCommit) {
  const captured = exact(value, ['schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt']);
  const verified = createGenesis001LinuxCensusSample({ applicant: captured.applicant, admitted: captured.admitted }, sourceCommit);
  if (JSON.stringify(verified) !== JSON.stringify(captured)) fail();
  return verified;
}
export function validateGenesis001LinuxCensusPair(firstValue, secondValue, sourceCommit) {
  if (arguments.length !== 3) fail();
  const first = sample(firstValue, sourceCommit), second = sample(secondValue, sourceCommit);
  const a = applicant(first.applicant, sourceCommit), b = applicant(second.applicant, sourceCommit);
  projectGenesis001AdmittedPlayerCensusStablePair({ first: first.admitted, second: second.admitted });
  const separation = time(second.observedAt) - time(first.observedAt), applicantSeparation = b.observedAt - a.observedAt;
  if (separation < 60000 || separation > 300000 || applicantSeparation < 60000 || applicantSeparation > 300000
    || ['count', 'size', 'sha256'].some(key => a.proof.privateCensusReference[key] !== b.proof.privateCensusReference[key])) fail();
  const unique = [a.proof.privateBlindingNonceHex, b.proof.privateBlindingNonceHex,
    first.admitted.nonceHex, second.admitted.nonceHex, a.proof.opaqueProofDigest, b.proof.opaqueProofDigest,
    first.admitted.opaqueProofDigest, second.admitted.opaqueProofDigest];
  if (new Set(unique).size !== unique.length) fail();
  return Object.freeze({ first, second });
}

/** Builds derivative metadata only from a fully collected stable pair. These
 * legacy-compatible confirmation/consumed bytes consume the evidence window;
 * they make no claim that a monitor, server timer or player was suspended. */
export function createGenesis001LinuxCensusAttempt(value, execution, completedAt) {
  if (arguments.length !== 3) fail();
  const collected = exact(value, ['schemaVersion', 'profile', 'sourceCommit', 'repositoryRoot', 'attemptId',
    'githubRunId', 'githubRunAttempt', 'callerIdentity', 'mutationSubmitted', 'initialPolicyObservation',
    'first', 'second', 'consumedAt', 'confirmationPolicyObservation', 'currentPolicyObservation']);
  if (collected.schemaVersion !== 1 || collected.profile !== 'warpkeep-g001-linux-census-collected-v1'
    || !COMMIT.test(collected.sourceCommit) || !RUN.test(collected.attemptId)
    || typeof collected.githubRunId !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(collected.githubRunId)
    || typeof collected.githubRunAttempt !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(collected.githubRunAttempt)
    || !HASH.test(collected.callerIdentity) || collected.mutationSubmitted !== false
    || execution.sourceCommit !== collected.sourceCommit || execution.execution.runId !== collected.attemptId) fail();
  const sourceCommit = collected.sourceCommit;
  const pair = validateGenesis001LinuxCensusPair(collected.first, collected.second, sourceCommit);
  const first = record(pair.first), second = record(pair.second);
  const expiresAt = new Date(time(pair.second.observedAt) + 300000).toISOString();
  const confirmationDigest = digest(['warpkeep.sealed-realms.g001-census-confirmation.v1', sourceCommit,
    first.recordDigest, second.recordDigest, expiresAt].join('\n'));
  const base = { schemaVersion: 1, profile: CENSUS_PROFILE, sourceCommit,
    firstDigest: first.recordDigest, secondDigest: second.recordDigest };
  const confirmation = record({ ...base, secondObservedAt: pair.second.observedAt, expiresAt, confirmationDigest });
  const consumed = record({ ...base, confirmationDigest, consumedAt: collected.consumedAt });
  const policy = observation => createGenesis001LinuxPolicyReceipt({ ...execution, policyObservationReceipt: observation }, sourceCommit);
  const initialPolicyObservation = policy(collected.initialPolicyObservation);
  const initialAt = time(collected.initialPolicyObservation.observedAt);
  if (initialAt > applicant(first.record.applicant, sourceCommit).observedAt
    || initialAt > time(first.record.admitted.observedAt)
    || time(first.record.observedAt) - initialAt > 300000) fail();
  const freezeConfirmationReceipt = createGenesis001LinuxFreezeConfirmationReceipt({ schemaVersion: 1,
    profile: 'warpkeep-g001-linux-freeze-confirmation-v1', sourceCommit,
    census: { firstDigest: first.recordDigest, secondDigest: second.recordDigest, confirmationDigest,
      confirmationRecordDigest: confirmation.recordDigest, consumedRecordDigest: consumed.recordDigest,
      secondObservedAt: pair.second.observedAt, expiresAt, consumedAt: collected.consumedAt },
    policyObservation: policy(collected.confirmationPolicyObservation) }, sourceCommit);
  const freezeCurrentStateReceipt = createGenesis001LinuxFreezeCurrentStateReceipt({ schemaVersion: 1,
    profile: 'warpkeep-g001-linux-freeze-current-state-v1', sourceCommit,
    confirmationReceiptDigest: freezeConfirmationReceipt.receiptDigest,
    policyObservation: policy(collected.currentPolicyObservation) }, sourceCommit);
  projectGenesis001LinuxFreezeEvidence({ preparationSourceCommit: sourceCommit,
    confirmationReceipt: freezeConfirmationReceipt, currentStateReceipt: freezeCurrentStateReceipt }, completedAt);
  const body = Object.freeze({ schemaVersion: 1, profile: GENESIS_001_LINUX_CENSUS_COMPLETE_PROFILE,
    sourceCommit, attemptId: collected.attemptId, githubRunId: collected.githubRunId, githubRunAttempt: collected.githubRunAttempt,
    callerIdentity: collected.callerIdentity, mutationSubmitted: false, initialPolicyObservation,
    first, second, confirmation, consumed, freezeConfirmationReceipt, freezeCurrentStateReceipt, completedAt });
  return Object.freeze({ ...body, receiptDigest: digest(bytes(body)) });
}

/** A valid codec is data only. Selecting an attempt still requires the actual
 * completed protected workflow, exact source/run binding and retained corpus. */
export function verifyGenesis001LinuxCensusAttempt(value) {
  const all = exact(value, ['schemaVersion', 'profile', 'sourceCommit', 'attemptId', 'githubRunId', 'githubRunAttempt',
    'callerIdentity', 'mutationSubmitted', 'initialPolicyObservation', 'first', 'second', 'confirmation', 'consumed',
    'freezeConfirmationReceipt', 'freezeCurrentStateReceipt', 'completedAt', 'receiptDigest']);
  for (const key of ['first', 'second', 'confirmation', 'consumed']) {
    const wrapped = exact(all[key], ['recordDigest', 'record']);
    if (wrapped.recordDigest !== digest(bytes(wrapped.record))) fail();
  }
  const initial = verifyGenesis001LinuxPolicyReceipt(all.initialPolicyObservation, all.sourceCommit);
  const execution = { profile: 'warpkeep-g001-linux-policy-execution-v1', sourceCommit: initial.protectedCommit,
    sourceTree: initial.moduleTreeId, operatorBlob: initial.operatorBlob, operatorSha256: initial.operatorSha256,
    runtime: initial.runtime, dependencyClosureSha256: initial.dependencyClosureSha256,
    execution: initial.execution, cleanup: initial.cleanup };
  const recreated = createGenesis001LinuxCensusAttempt({ schemaVersion: 1, profile: 'warpkeep-g001-linux-census-collected-v1',
    sourceCommit: all.sourceCommit, repositoryRoot: '/', attemptId: all.attemptId, githubRunId: all.githubRunId,
    githubRunAttempt: all.githubRunAttempt, callerIdentity: all.callerIdentity, mutationSubmitted: all.mutationSubmitted,
    initialPolicyObservation: initial.policyObservationReceipt, first: all.first.record, second: all.second.record,
    consumedAt: all.consumed.record.consumedAt,
    confirmationPolicyObservation: all.freezeConfirmationReceipt?.policyObservation?.policyObservationReceipt,
    currentPolicyObservation: all.freezeCurrentStateReceipt?.policyObservation?.policyObservationReceipt }, execution, all.completedAt);
  if (JSON.stringify(recreated) !== JSON.stringify(all)) fail();
  return recreated;
}

function directory(path) {
  const status = lstatSync(path, { bigint: true });
  if (path !== resolve(path) || realpathSync(path) !== path || !status.isDirectory() || status.isSymbolicLink()
    || status.uid !== BigInt(process.getuid()) || status.gid !== BigInt(process.getgid())
    || (status.mode & 0o7777n) !== 0o700n) fail();
  return ['dev', 'ino', 'uid', 'gid', 'mode'].map(key => String(status[key])).join(':');
}
/** Append-only private retention. A short/interrupted write remains visible
 * and unselectable. No retry overwrites or deletes a retained observation. */
export function retainGenesis001LinuxCensusRecord(root, basename, value) {
  if (arguments.length !== 3 || !['first.json', 'second.json', 'complete.json'].includes(basename)) fail();
  const before = directory(root), body = bytes(value), path = join(root, basename);
  if (body.length > 4 * 1024 * 1024) fail();
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, body); fsyncSync(descriptor);
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.nlink !== 1 || status.uid !== process.getuid() || status.gid !== process.getgid()
      || (status.mode & 0o7777) !== 0o600 || status.size !== body.length || directory(root) !== before) fail();
    const read = readLocalBindingBoundedFile(path, { maximumBytes: 4 * 1024 * 1024,
      expectedBytes: body.length, expectedSha256: digest(body), expectedUid: process.getuid(), expectedMode: 0o600 });
    read.body.fill(0);
    const parent = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally { body.fill(0); if (descriptor !== undefined) closeSync(descriptor); }
}

/** Reopen the exact raw reports and append-only sample bytes before selecting
 * complete evidence. No directory-wide search or newest-file heuristic. */
export function verifyGenesis001LinuxCensusRetainedSamples(root, firstValue, secondValue, sourceCommit) {
  const pair = validateGenesis001LinuxCensusPair(firstValue, secondValue, sourceCommit);
  const before = directory(root);
  for (const kind of ['first', 'second']) {
    const value = pair[kind], expected = bytes(value);
    try {
      readLocalBindingBoundedFile(join(root, `${kind}.json`), { maximumBytes: 4 * 1024 * 1024,
        expectedBytes: expected.length, expectedSha256: digest(expected), expectedUid: process.getuid(), expectedMode: 0o600 }).body.fill(0);
    } finally { expected.fill(0); }
    const privateRoot = join(root, kind), privateBefore = directory(privateRoot);
    const reference = value.applicant.privateCensusReference;
    readLocalBindingBoundedFile(join(privateRoot, reference.pathBasename), { maximumBytes: 1048576,
      expectedBytes: reference.size, expectedSha256: reference.sha256, expectedUid: process.getuid(), expectedMode: 0o600 }).body.fill(0);
    const exporter = reference.pathBasename.replace('warpkeep-access-request-census-', 'warpkeep-access-request-census-export-reference-').replace(/\.txt$/u, '.json');
    for (const [name, expectedBody] of [[exporter, bytes(reference)],
      [`genesis-001-census-privacy-safe-${value.applicant.opaqueProofDigest}.json`, Buffer.from(`${JSON.stringify(value.applicant, null, 2)}\n`)]]) {
      try {
        readLocalBindingBoundedFile(join(privateRoot, name), { maximumBytes: 8192, expectedBytes: expectedBody.length,
          expectedSha256: digest(expectedBody), expectedUid: process.getuid(), expectedMode: 0o600 }).body.fill(0);
      } finally { expectedBody.fill(0); }
    }
    if (directory(privateRoot) !== privateBefore) fail();
  }
  if (directory(root) !== before) fail();
}

/** Fixed private data read, deliberately not workflow authority. Activation
 * must authenticate selector.githubRunId/githubRunAttempt as the exact
 * successful protected census operation, then call this again and compare the
 * immutable selector before consuming receipt. No path or newest-file input. */
export function readFixedLinuxG001CensusAttempt(attemptId, sourceCommit) {
  if (arguments.length !== 2 || typeof attemptId !== 'string' || !RUN.test(attemptId)
    || typeof sourceCommit !== 'string' || !COMMIT.test(sourceCommit)) fail();
  const root = join(G001_POLICY_ROOT, 'attempts', attemptId);
  policyPrivateAncestors(root);
  const opened = readLocalBindingBoundedFile(join(root, 'complete.json'), { maximumBytes: 4 * 1024 * 1024,
    expectedUid: 1000, expectedMode: 0o600 });
  let receipt;
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(opened.body);
    receipt = verifyGenesis001LinuxCensusAttempt(JSON.parse(source));
    if (`${JSON.stringify(receipt)}\n` !== source || receipt.attemptId !== attemptId || receipt.sourceCommit !== sourceCommit) fail();
    verifyGenesis001LinuxCensusRetainedSamples(root, receipt.first.record, receipt.second.record, sourceCommit);
    readLocalBindingBoundedFile(join(root, 'complete.json'), { maximumBytes: 4 * 1024 * 1024,
      expectedBytes: opened.body.length, expectedSha256: digest(opened.body), expectedIdentity: opened.identity,
      expectedUid: 1000, expectedMode: 0o600 }).body.fill(0);
    policyPrivateAncestors(root);
  } finally { opened.body.fill(0); }
  const selector = Object.freeze({ profile: 'warpkeep-g001-linux-census-completed-v1', sourceCommit,
    attemptId, githubRunId: receipt.githubRunId, githubRunAttempt: receipt.githubRunAttempt,
    receiptDigest: receipt.receiptDigest, completedAt: receipt.completedAt, mutationSubmitted: false });
  return Object.freeze({ selector, receipt });
}
