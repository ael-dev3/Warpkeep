import { GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE, GENESIS_001_LINUX_POLICY_OPERATOR_PATH } from './genesis001-linux-policy-receipt.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fstatSync, readSync, realpathSync } from 'node:fs';
import { types } from 'node:util';
import { readSealedRealmsProductionActivationEvidenceMember, assertSealedRealmsProductionAuthBridgeStateTestCapability } from './sealed-realms-production-auth-bridge-state.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { validateSealedRealmsProductionRecoveryActivationEvidence } from './sealed-realms-production-activation-records.mjs';
import { createRecoveryActivationBindingFromCandidate } from './recovery-activation-candidate.mjs';

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
  return readPolicySourceAuthority(authority, testOnly, false);
}

export function readRecoveryActivationLinuxPolicyAuthority(authority, testOnly) {
  return readPolicySourceAuthority(authority, testOnly, true);
}

function readPolicySourceAuthority(authority, testOnly, linux) {
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
    const keys = ['preparationSourceCommit', 'moduleTreeId', ...(linux ? ['operatorBlob', 'operatorSha256'] : ['bootstrapBlob', 'bootstrapSha256'])];
    if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(keys)
      || keys.some(key => !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) fail();
    const value = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    if (value.preparationSourceCommit !== sourceCommit || !COMMIT.test(value.moduleTreeId)
      || !COMMIT.test(value[linux ? 'operatorBlob' : 'bootstrapBlob']) || !SHA256.test(value[linux ? 'operatorSha256' : 'bootstrapSha256'])) fail();
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
  const operatorPath = linux ? GENESIS_001_LINUX_POLICY_OPERATOR_PATH : BOOTSTRAP_PATH;
  const entry = fixedGit(['ls-tree', '-z', sourceCommit, '--', operatorPath], true).toString('utf8');
  const match = /^100644 blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(entry);
  if (match?.[2] !== operatorPath) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  if (!COMMIT.test(moduleTreeId) || match === null) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  const bytes = fixedGit(['cat-file', 'blob', match[1]], true);
  try {
    if (!fixedGit(['config', '--local', '--null', '--list'], true).equals(config)) {
      fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
    }
    if (linux) return Object.freeze({ preparationSourceCommit: sourceCommit, moduleTreeId,
      operatorBlob: match[1], operatorSha256: createHash('sha256').update(bytes).digest('hex') });
    return Object.freeze({ preparationSourceCommit: sourceCommit, moduleTreeId,
      bootstrapBlob: match[1], bootstrapSha256: createHash('sha256').update(bytes).digest('hex') });
  } finally { bytes.fill(0); config.fill(0); }
}

function validateRecoveryEvidence(envelope, verificationTime, existingStateAdoption, g002ExistingStateAdoption) {
  const version = envelope !== null && typeof envelope === 'object' && !types.isProxy(envelope)
    ? Object.getOwnPropertyDescriptor(envelope, 'schemaVersion')?.value : undefined;
  if ((version === 4 || version === 5) !== (existingStateAdoption !== undefined)
    || (version === 5) !== (g002ExistingStateAdoption !== undefined)) fail();
  // Adoption JSON never supplies its own authenticity. Each opaque owner reopens
  // its complete retained signed envelope and genuine completed update history.
  return validateSealedRealmsProductionRecoveryActivationEvidence(envelope, verificationTime, existingStateAdoption, g002ExistingStateAdoption);
}

/** Evidence comparison only, not generator authority; each adoption requires its retained opaque evidence. */
export function validateRecoveryLaunchActivationProjection(envelope, bridge, verificationTime, existingStateAdoption, g002ExistingStateAdoption) {
  const candidate = validateRecoveryEvidence(envelope, verificationTime, existingStateAdoption, g002ExistingStateAdoption);
  const g002Adoption = candidate.schemaVersion === 5;
  const adoption = candidate.schemaVersion === 4 || g002Adoption;
  if (adoption) {
    if (types.isProxy(bridge) || bridge === null || typeof bridge !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(bridge))) fail();
    const keys = ['schemaVersion', 'profile', 'sourceCommit', 'deploymentAuthority',
      ...(g002Adoption ? ['g002ExistingStateAdoptionReceiptDigest'] : ['g002Gate', 'g002ImportAuthorityCrossLink']),
      'ptrExistingStateAdoptionReceiptDigest', 'activationGate'];
    const descriptors = Object.getOwnPropertyDescriptors(bridge);
    if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(keys)
      || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))
      || bridge.schemaVersion !== (g002Adoption ? 5 : 4)
      || bridge.profile !== (g002Adoption ? 'warpkeep-sealed-realms-auth-bridge-suspension-g002-ptr-adoption-private-v1'
        : 'warpkeep-sealed-realms-auth-bridge-suspension-ptr-adoption-private-v1')
      || bridge.ptrExistingStateAdoptionReceiptDigest !== candidate.ptrExistingStateAdoptionReceiptDigest
      || bridge.activationGate.ptrExistingStateAdoptionReceiptDigest !== candidate.ptrExistingStateAdoptionReceiptDigest
      || Object.hasOwn(bridge.activationGate, 'ptrGateDigest')
      || Object.hasOwn(bridge.activationGate, 'ptrImportAuthorityCrossLinkDigest')) fail();
    if (g002Adoption) {
      const gateKeys = ['deploymentAuthorityDigest', 'g002ExistingStateAdoptionReceiptDigest',
        'ptrExistingStateAdoptionReceiptDigest', 'deploymentAttestationDigest', 'bindingAttestationDigest',
        'postNoRedirect', 'postContentType', 'postAccessControlAllowOrigin', 'postProbeStatus',
        'postProbeBodyBase64', 'postProbeDigest', 'optionsNoRedirect', 'optionsContentType',
        'optionsAccessControlAllowOrigin', 'optionsProbeStatus', 'optionsProbeBodyBase64',
        'optionsProbeDigest', 'confirmationDigest', 'observedAt', 'nonce'];
      const gate = bridge.activationGate;
      if (types.isProxy(gate) || gate === null || typeof gate !== 'object'
        || ![Object.prototype, null].includes(Object.getPrototypeOf(gate))) fail();
      const descriptors = Object.getOwnPropertyDescriptors(gate);
      if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(gateKeys)
        || gateKeys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))
        || bridge.g002ExistingStateAdoptionReceiptDigest !== candidate.g002ExistingStateAdoptionReceiptDigest
        || gate.g002ExistingStateAdoptionReceiptDigest !== candidate.g002ExistingStateAdoptionReceiptDigest) fail();
    }
  }
  const deployment = bridge.deploymentAuthority;
  const bridgeDigest = createHash('sha256')
    .update(g002Adoption ? 'warpkeep.sealed-realms.auth-bridge-suspension-g002-ptr-adoption-private-receipt.v1\n'
      : adoption ? 'warpkeep.sealed-realms.auth-bridge-suspension-ptr-adoption-private-receipt.v1\n'
      : 'warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n')
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
    || (!g002Adoption && bridge.g002ImportAuthorityCrossLink.realmImportReceiptDigest !== candidate.g002AtlasImportReceiptDigest)
    || (!adoption && bridge.ptrImportAuthorityCrossLink.realmImportReceiptDigest !== candidate.ptrAtlasImportReceiptDigest)
    || candidate.admissionRequestSuspensionReceiptDigest !== bridgeDigest
    || !(Date.parse(bridge.activationGate.observedAt)
      >= Date.parse(envelope.g001AdmissionMonitorCurrentStateReceipt.observedAt))) fail();
  return createRecoveryActivationBindingFromCandidate(`${JSON.stringify(candidate, null, 2)}\n`);
}

export function createRecoveryLaunchActivationBindingFromEvidence(envelope, member, authority, testOnly, existingStateAdoption, g002ExistingStateAdoption) {
  const candidate = validateRecoveryEvidence(envelope, undefined, existingStateAdoption, g002ExistingStateAdoption);
  const bootstrap = envelope.g001PolicyObservationBootstrapReceipt;
  const linux = bootstrap.profile === GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE;
  const source = linux ? readRecoveryActivationLinuxPolicyAuthority(authority, testOnly)
    : readRecoveryActivationBootstrapAuthority(authority, testOnly);
  if (candidate.preparationSourceCommit !== source.preparationSourceCommit
    || bootstrap.moduleTreeId !== source.moduleTreeId || bootstrap[linux ? 'operatorBlob' : 'bootstrapBlob'] !== source[linux ? 'operatorBlob' : 'bootstrapBlob']
    || bootstrap[linux ? 'operatorSha256' : 'bootstrapSha256'] !== source[linux ? 'operatorSha256' : 'bootstrapSha256']) fail('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  return validateRecoveryLaunchActivationProjection(envelope,
    readSealedRealmsProductionActivationEvidenceMember(member).authBridgeSuspensionPrivateReceipt,
    undefined, existingStateAdoption, g002ExistingStateAdoption);
}

function sameFile(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every(key => left[key] === right[key]);
}

/** The producer supplies one owner-private descriptor to this fixed synchronous reader. */
export function generateRecoveryLaunchActivationBindingFromDescriptor(descriptor, member, authority, testOnly, existingStateAdoption, g002ExistingStateAdoption) {
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
    return createRecoveryLaunchActivationBindingFromEvidence(envelope, member, authority, testOnly, existingStateAdoption, g002ExistingStateAdoption);
  } finally { bytes.fill(0); }
}
