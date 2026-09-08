import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fstatSync, readSync, realpathSync } from 'node:fs';
import { types } from 'node:util';
import { readSealedRealmsProductionActivationEvidenceMember, assertSealedRealmsProductionAuthBridgeStateTestCapability } from './sealed-realms-production-auth-bridge-state.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { validateSealedRealmsProductionRecoveryActivationEvidence } from './sealed-realms-production-activation-records.mjs';
import { createRecoveryActivationBinding } from './recovery-activation-candidate.mjs';

const MAXIMUM_CANDIDATE_BYTES = 1024 * 1024;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ORIGIN = 'https://github.com/ael-dev3/Warpkeep.git';
const BOOTSTRAP_PATH = 'scripts/greater-realm-production-bootstrap.mjs';
const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
  HOME: '/dev/null', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin', TZ: 'UTC',
});

function fail(code = 'RECOVERY_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID') {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function fixedGit(args, binary = false) {
  const result = spawnSync('/usr/bin/git', [
    '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'http.proxy=', '-c', 'http.sslVerify=true', '-c', 'credential.helper=', ...args,
  ], {
    cwd: process.cwd(), env: GIT_ENVIRONMENT, encoding: binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024, timeout: 30000,
  });
  if (result.error || result.signal !== null || result.status !== 0
    || (binary ? !Buffer.isBuffer(result.stdout) : typeof result.stdout !== 'string')
    || result.stderr?.length !== 0) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  return binary ? result.stdout : result.stdout.trim();
}

/** S is authenticated separately; these facts come from its immutable Git objects. */
export function readRecoveryActivationBootstrapAuthority(authority, testOnly) {
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  if (authority.mode !== 'S' || authority.operation !== 'activation-evidence-generate') {
    fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  }
  if (testOnly !== undefined) {
    if (process.env.NODE_ENV !== 'test' || types.isProxy(testOnly)
      || testOnly === null || Object.getPrototypeOf(testOnly) !== Object.prototype) {
      fail('RECOVERY_LAUNCH_ACTIVATION_TEST_AUTHORITY_FORBIDDEN');
    }
    const wrapper = Object.getOwnPropertyDescriptors(testOnly);
    if (JSON.stringify(Reflect.ownKeys(wrapper)) !== JSON.stringify(['capability', 'facts'])
      || ['capability', 'facts'].some(key => !Object.hasOwn(wrapper[key], 'value') || !wrapper[key].enumerable)) fail();
    assertSealedRealmsProductionAuthBridgeStateTestCapability(wrapper.capability.value);
    const facts = wrapper.facts.value;
    if (types.isProxy(facts) || facts === null || Object.getPrototypeOf(facts) !== Object.prototype) fail();
    const descriptors = Object.getOwnPropertyDescriptors(facts);
    const keys = ['preparationSourceCommit', 'moduleTreeId', 'bootstrapBlob', 'bootstrapSha256'];
    if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(keys)
      || keys.some(key => !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) fail();
    const value = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    if (value.preparationSourceCommit !== sourceCommit || !COMMIT.test(value.moduleTreeId)
      || !COMMIT.test(value.bootstrapBlob) || !SHA256.test(value.bootstrapSha256)) fail();
    return Object.freeze(value);
  }
  const config = fixedGit(['config', '--local', '--null', '--list'], true);
  const configText = new TextDecoder('utf-8', { fatal: true }).decode(config);
  const allowed = /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode)|remote\.origin\.(?:url|fetch)|branch\.[A-Za-z0-9._/-]+\.(?:remote|merge))$/u;
  const entries = configText.split('\0');
  if (entries.pop() !== '') fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  const seen = new Set();
  for (const entry of entries) {
    const separator = entry.indexOf('\n');
    const key = entry.slice(0, separator);
    if (separator < 1 || !allowed.test(key) || seen.has(key)) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
    seen.add(key);
  }
  const tracked = fixedGit(['ls-files', '-v', '-z'], true).toString('utf8').split('\0');
  if (tracked.pop() !== '' || tracked.length < 1 || tracked.some(entry => !entry.startsWith('H '))
    || fixedGit(['rev-parse', '--show-toplevel']) !== realpathSync(process.cwd())
    || fixedGit(['rev-parse', '--verify', 'HEAD^{commit}']) !== sourceCommit
    || fixedGit(['rev-parse', '--verify', 'refs/remotes/origin/main']) !== sourceCommit
    || ![ORIGIN, 'https://github.com/ael-dev3/Warpkeep'].includes(fixedGit(['remote', 'get-url', 'origin']))
    || fixedGit(['status', '--porcelain=v1', '--untracked-files=all']) !== ''
    || fixedGit(['ls-remote', '--refs', ORIGIN, 'refs/heads/main']) !== `${sourceCommit}\trefs/heads/main`) {
    fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  }
  const moduleTreeId = fixedGit(['rev-parse', '--verify', `${sourceCommit}^{tree}`]);
  const entry = fixedGit(['ls-tree', '-z', sourceCommit, '--', BOOTSTRAP_PATH], true).toString('utf8');
  const match = /^100644 blob ([a-f0-9]{40})\tscripts\/greater-realm-production-bootstrap\.mjs\0$/u.exec(entry);
  if (!COMMIT.test(moduleTreeId) || match === null) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  const bytes = fixedGit(['cat-file', 'blob', match[1]], true);
  try {
    if (!fixedGit(['config', '--local', '--null', '--list'], true).equals(config)) {
      fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
    }
    return Object.freeze({ preparationSourceCommit: sourceCommit, moduleTreeId,
      bootstrapBlob: match[1], bootstrapSha256: createHash('sha256').update(bytes).digest('hex') });
  } finally { bytes.fill(0); config.fill(0); }
}

/** Pure comparison for reopened evidence; neither input grants generator authority. */
export function validateRecoveryLaunchActivationProjection(envelope, bridge, verificationTime) {
  const candidate = validateSealedRealmsProductionRecoveryActivationEvidence(envelope, verificationTime);
  const deployment = bridge.deploymentAuthority;
  const bridgeDigest = createHash('sha256')
    .update('warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n')
    .update(`${JSON.stringify(bridge)}\n`).digest('hex');
  const ptrBindingDigest = createHash('sha256').update('warpkeep.auth-bridge.ptr-binding.v1\n')
    .update(`${JSON.stringify([deployment.workerVersionId, candidate.preparationSourceCommit,
      candidate.ptrDatabaseIdentity, 'warpkeep-ptr-spacetimedb'])}\n`).digest('hex');
  if (bridge.sourceCommit !== candidate.preparationSourceCommit
    || deployment.sourceCommit !== candidate.preparationSourceCommit
    || deployment.bridgeSourceCommit !== candidate.preparationSourceCommit
    || deployment.workerVersionId !== candidate.recoveryAuthWorkerVersionId
    || deployment.ptrDatabaseIdentity !== candidate.ptrDatabaseIdentity
    || deployment.ptrBindingDigest !== ptrBindingDigest
    || bridge.g002ImportAuthorityCrossLink.realmImportReceiptDigest !== candidate.g002AtlasImportReceiptDigest
    || bridge.ptrImportAuthorityCrossLink.realmImportReceiptDigest !== candidate.ptrAtlasImportReceiptDigest
    || candidate.admissionRequestSuspensionReceiptDigest !== bridgeDigest
    || !(Date.parse(bridge.activationGate.observedAt)
      >= Date.parse(envelope.g001AdmissionMonitorCurrentStateReceipt.observedAt))) fail();
  return createRecoveryActivationBinding(`${JSON.stringify(candidate, null, 2)}\n`);
}

export function createRecoveryLaunchActivationBindingFromEvidence(envelope, member, authority, testOnly) {
  const candidate = validateSealedRealmsProductionRecoveryActivationEvidence(envelope);
  const source = readRecoveryActivationBootstrapAuthority(authority, testOnly);
  const bootstrap = envelope.g001PolicyObservationBootstrapReceipt;
  if (candidate.preparationSourceCommit !== source.preparationSourceCommit
    || bootstrap.moduleTreeId !== source.moduleTreeId || bootstrap.bootstrapBlob !== source.bootstrapBlob
    || bootstrap.bootstrapSha256 !== source.bootstrapSha256) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  return validateRecoveryLaunchActivationProjection(envelope,
    readSealedRealmsProductionActivationEvidenceMember(member).authBridgeSuspensionPrivateReceipt);
}

function sameFile(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every(key => left[key] === right[key]);
}

/** The producer supplies one owner-private descriptor to this fixed synchronous reader. */
export function generateRecoveryLaunchActivationBindingFromDescriptor(descriptor, member, authority, testOnly) {
  if (!Number.isInteger(descriptor) || descriptor < 0 || typeof process.getuid !== 'function') fail();
  const before = fstatSync(descriptor, { bigint: true });
  if (!before.isFile() || before.uid !== BigInt(process.getuid()) || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o600n || before.size < 2n || before.size > BigInt(MAXIMUM_CANDIDATE_BYTES)) fail();
  const bytes = Buffer.alloc(Number(before.size) + 1);
  try {
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(descriptor, bytes, count, bytes.length - count, count);
      if (read === 0) break;
      count += read;
    }
    if (count !== Number(before.size) || !sameFile(before, fstatSync(descriptor, { bigint: true }))) fail();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
    const envelope = JSON.parse(source);
    if (`${JSON.stringify(envelope, null, 2)}\n` !== source) fail();
    return createRecoveryLaunchActivationBindingFromEvidence(envelope, member, authority, testOnly);
  } finally { bytes.fill(0); }
}
