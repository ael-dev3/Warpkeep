import { readSealedRealmsProductionRecoveryApprovalFacts } from './sealed-realms-production-recovery-approval-facts.ts';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { types } from 'node:util';
import { assertSealedRealmsProductionActivationRecordsAuthority,
  readSealedRealmsProductionRecoveryCandidateRecords } from './sealed-realms-production-activation-records.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { recoveryActivationCandidatePolicy, recoveryActivationCandidatePolicyForVersion, validateRecoveryActivationCandidate, validateRecoveryActivationCandidateV3 } from './recovery-activation-candidate.mjs';
import { RECOVERY_BINDING_KEYS_V2, RECOVERY_BINDING_KEYS_V3 } from './recovery-binding-projection.mjs';

import { readSealedRealmsProductionRecoveryBridgeFacts } from './sealed-realms-production-auth-bridge-state.mjs';

const BOOTSTRAP = 'scripts/greater-realm-production-bootstrap.mjs';
const GIT = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const NULL_PATH = String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108);
const FIXED_PATH = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110);
const ENV = Object.freeze({ GIT_CONFIG_GLOBAL: NULL_PATH, GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: NULL_PATH, GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
  HOME: NULL_PATH, PATH: FIXED_PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' });
const SHA = /^[a-f0-9]{40}$/u;

function fail(code = 'SEALED_REALMS_RECOVERY_CANDIDATE_INVALID', missingFields) {
  const error = new Error(code);
  error.code = code;
  // Only fixed public schema names may leave an incomplete derivation.
  if (missingFields !== undefined) error.missingFields = Object.freeze([...missingFields]);
  throw error;
}
function input(value) {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ['records', 'privateState', 'authority', ...(Object.hasOwn(descriptors, 'bridgeState') ? ['bridgeState'] : []), ...(Object.hasOwn(descriptors, 'readContext') ? ['readContext'] : [])];
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail();
  return Object.fromEntries(keys.map(key => {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value')) fail();
    return [key, descriptors[key].value];
  }));
}
function git(args) {
  try {
    return execFileSync(GIT, ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false', ...args], { cwd: process.cwd(), env: ENV,
      encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 10_000, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID'); }
}
function line(args) {
  let bytes;
  try { bytes = git(args); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID'); }
  finally { bytes?.fill(0); }
}
function source(commit) {
  let root;
  try { root = realpathSync(process.cwd()); }
  catch { fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID'); }
  if (line(['rev-parse', '--verify', 'HEAD^{commit}']) !== `${commit}\n`
    || line(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']) !== `${commit}\n`
    || line(['rev-parse', '--show-toplevel']) !== `${root}\n`) fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID');
  const tree = line(['rev-parse', '--verify', `${commit}^{tree}`]).trimEnd();
  const entry = line(['ls-tree', '-z', commit, '--', BOOTSTRAP]);
  const match = /^100644 blob ([a-f0-9]{40})\tscripts\/greater-realm-production-bootstrap\.mjs\0$/u.exec(entry);
  if (!SHA.test(tree) || match === null) fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID');
  let bytes;
  try {
    bytes = git(['cat-file', 'blob', match[1]]);
    return Object.freeze({ preparationSourceCommit: commit, preparationSourceTree: tree,
      bootstrapBlob: match[1], bootstrapSha256: createHash('sha256').update(bytes).digest('hex') });
  } finally { bytes?.fill(0); }
}

/** Derives data only from the actual source and opaque private corpus, never caller facts. */
export function inspectSealedRealmsProductionRecoveryCandidate(inputValue) {
  if (arguments.length !== 1) fail();
  const options = input(inputValue);
  assertSealedRealmsProductionActivationRecordsAuthority({ records: options.records,
    privateState: options.privateState, authority: options.authority });
  const commit = sourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (options.authority.mode !== 'S' || options.authority.operation !== 'activation-evidence-generate') fail();
  const corpus = readSealedRealmsProductionRecoveryCandidateRecords(options.records, options.readContext);
  const readBridge = () => Object.hasOwn(options, 'bridgeState')
    ? readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: options.bridgeState, privateState: options.privateState, authority: options.authority })
    : Object.freeze({});
  const bridge = readBridge();
  const readApprovals = () => readSealedRealmsProductionRecoveryApprovalFacts({ records: options.records,
    privateState: options.privateState, authority: options.authority, readContext: options.readContext });
  const approvals = readApprovals();
  const actual = source(commit);
  if (JSON.stringify(corpus.bootstrap) !== JSON.stringify(actual)) fail('SEALED_REALMS_RECOVERY_CANDIDATE_SOURCE_INVALID');
  const update = Object.hasOwn(corpus.projection, 'ptrExistingUpdateReceiptDigest');
  if (update && Object.hasOwn(corpus.projection, 'ptrPublishReceiptDigest')) fail();
  const keys = update ? RECOVERY_BINDING_KEYS_V3 : RECOVERY_BINDING_KEYS_V2;
  const facts = { ...(update ? recoveryActivationCandidatePolicyForVersion(3) : recoveryActivationCandidatePolicy()) };
  for (const projection of [corpus.projection, bridge, approvals, {
    preparationSourceCommit: actual.preparationSourceCommit, preparationSourceTree: actual.preparationSourceTree }]) {
    for (const [key, value] of Object.entries(projection)) {
      if (!keys.includes(key) || (Object.hasOwn(facts, key) && facts[key] !== value)) fail();
      facts[key] = value;
    }
  }
  if (JSON.stringify(corpus) !== JSON.stringify(readSealedRealmsProductionRecoveryCandidateRecords(options.records, options.readContext))
    || JSON.stringify(bridge) !== JSON.stringify(readBridge())
    || JSON.stringify(approvals) !== JSON.stringify(readApprovals())
    || JSON.stringify(actual) !== JSON.stringify(source(commit))) fail();
  const ordered = Object.freeze(Object.fromEntries(keys
    .filter(key => Object.hasOwn(facts, key)).map(key => [key, facts[key]])));
  return Object.freeze({ facts: ordered,
    missingFields: Object.freeze(keys.filter(key => !Object.hasOwn(ordered, key))) });
}

/** The real workflow reader cannot emit candidate bytes while authenticated inputs are missing. */
export function readSealedRealmsProductionRecoveryCandidate(inputValue) {
  if (arguments.length !== 1) fail();
  const derived = inspectSealedRealmsProductionRecoveryCandidate(inputValue);
  if (derived.missingFields.length !== 0) fail('SEALED_REALMS_RECOVERY_CANDIDATE_INPUTS_MISSING', derived.missingFields);
  const document = `${JSON.stringify(derived.facts, null, 2)}\n`;
  if (derived.facts.schemaVersion === 3) validateRecoveryActivationCandidateV3(document);
  else validateRecoveryActivationCandidate(document);
  return document;
}
