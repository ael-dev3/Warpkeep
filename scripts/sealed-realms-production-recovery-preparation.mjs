import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { types } from 'node:util';
import { assertSealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { assertRecoverySourceClosureSnapshot } from './recovery-source-closure.mjs';
import { verifySealedRealmsProductionRecoveryPreparationReceipt } from './sealed-realms-production-recovery-preparation-receipt.mjs';
import { requestSealedRealmsProductionRecoveryPreparation, requestSealedRealmsProductionRecoveryPreparationObservation } from './sealed-realms-production-recovery-preparation-transport.mjs';
import { verifySealedRealmsProductionRecoveryPreparationObservation } from './sealed-realms-production-recovery-preparation-observation-receipt.mjs';
import { readSealedRealmsProductionCompletedGenerationContext } from './sealed-realms-production-activation-records.mjs';
const owners = new WeakMap();
const fail = () => { throw Error('SEALED_REALMS_RECOVERY_PREPARATION_INVALID'); };
function capture(input, keys) {
  if (types.isProxy(input) || input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail();
  return Object.fromEntries(keys.map(key => {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value')) fail();
    return [key, descriptors[key].value];
  }));
}
function owner(privateState, authority) {
  assertSealedRealmsProductionPrivateState(privateState);
  const commit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  if (authority.mode !== 'S' || authority.operation !== 'activation-evidence-generate') fail();
  return commit;
}
function treeAt(root, commit) {
  const nullPath = process.platform === 'win32' ? 'NUL' : String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108);
  const result = execFileSync(process.platform === 'win32' ? 'git' : String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116),
    ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', 'rev-parse', '--verify', `${commit}^{tree}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 128, timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: nullPath, GIT_CONFIG_SYSTEM: nullPath, GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0', LANG: 'C', LC_ALL: 'C' } });
  if (!/^[a-f0-9]{40}\n$/u.test(result)) fail();
  return result.slice(0, -1);
}
function attest(state) {
  if (owner(state.privateState, state.authority) !== state.commit || process.cwd() !== state.root || realpathSync(state.root) !== state.root) fail();
  assertRecoverySourceClosureSnapshot({ repositoryRoot: state.root, sourceCommit: state.commit, sourceTree: state.tree });
}
function readExact(state, path, compact) {
  let bytes;
  try {
    bytes = state.privateState.read({ root: 'runtime', relativePath: path });
    if (bytes.length > 16385) fail();
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (source !== `${compact}\n`) fail();
  } finally { bytes?.fill(0); }
}
function retainedIntent(state) {
  readExact(state, state.path, state.compact);
  const intent = verifySealedRealmsProductionRecoveryPreparationReceipt(state.compact);
  if (intent.preparationCommit !== state.commit || intent.preparationTree !== state.tree) fail();
  return intent;
}
function retained(state) {
  const intent = retainedIntent(state);
  readExact(state, state.observationPath, state.observationCompact);
  const observation = verifySealedRealmsProductionRecoveryPreparationObservation(
    state.observationCompact, state.compact, Math.floor(Date.now() / 1000));
  return Object.freeze({
    recoveryAuthorizationRequestId: intent.requestId, recoveryAuthorizationEpoch: intent.authorizationEpoch,
    recoveryAuthWorkerVersionId: observation.bridgeWorkerVersionId,
    recoveryAuthWorkerSourceCommit: observation.bridgeSourceCommit,
    recoveryAuthWorkerConfigIdentity: observation.bridgeConfigIdentity,
    recoveryAuthWorkerConfigEpoch: observation.bridgeConfigEpoch,
  });
}
function fresh(state) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < state.observationIssuedAt || now >= state.observationExpiresAt) fail();
}
function persist(state, path, compact) {
  const bytes = Buffer.from(`${compact}\n`);
  try {
    try { state.privateState.write({ root: 'runtime', relativePath: path, bytes }); }
    catch { if (!state.privateState.exists({ root: 'runtime', relativePath: path })) fail(); }
    readExact(state, path, compact);
  } finally { bytes.fill(0); }
}
/** Retains exact reservation and fresh configuration signatures under the genuine source/private owner. */
export async function createSealedRealmsProductionRecoveryPreparation(input) {
  try {
    if (arguments.length !== 1) fail();
    const { privateState, authority } = capture(input, ['privateState', 'authority']);
    const commit = owner(privateState, authority), root = realpathSync(process.cwd());
    if (process.cwd() !== root) fail();
    const state = { privateState, authority, commit, root, tree: treeAt(root, commit) };
    attest(state);
    const compact = await requestSealedRealmsProductionRecoveryPreparation(commit, () => { attest(state); });
    attest(state);
    const intent = verifySealedRealmsProductionRecoveryPreparationReceipt(compact);
    if (intent.preparationCommit !== commit || intent.preparationTree !== state.tree) fail();
    const path = `recovery-preparation/${commit}/${intent.authorizationEpoch}.jws`;
    const reservationState = { ...state, path, compact };
    persist(state, path, compact);
    retainedIntent(reservationState);
    attest(state);
    const observationCompact = await requestSealedRealmsProductionRecoveryPreparationObservation(commit, () => {
      attest(state); retainedIntent(reservationState);
    });
    attest(state); retainedIntent(reservationState);
    const observation = verifySealedRealmsProductionRecoveryPreparationObservation(observationCompact, compact, Math.floor(Date.now() / 1000));
    const digest = createHash('sha256').update(observationCompact).digest('hex');
    const observationPath = `recovery-preparation/${commit}/${intent.authorizationEpoch}/observations/${digest}.jws`;
    persist(state, observationPath, observationCompact);
    const retainedState = { ...reservationState, observationPath, observationCompact,
      observationIssuedAt: observation.issuedAt, observationExpiresAt: observation.expiresAt };
    retained(retainedState); attest(state); fresh(retainedState);
    const capability = Object.freeze({}); owners.set(capability, Object.freeze(retainedState));
    return capability;
  } catch { fail(); }
}
export function readSealedRealmsProductionRecoveryPreparation(input) {
  try {
    if (arguments.length !== 1) fail();
    const { capability, privateState, authority } = capture(input, ['capability', 'privateState', 'authority']);
    if (types.isProxy(capability)) fail();
    const state = owners.get(capability);
    if (!state || state.privateState !== privateState || state.authority !== authority) fail();
    attest(state); const facts = retained(state); attest(state); fresh(state); return facts;
  } catch { fail(); }
}
function readRetainedCompact(state, path) {
  let bytes;
  try {
    bytes = state.privateState.read({ root: 'runtime', relativePath: path });
    if (bytes.length < 2 || bytes.length > 16385) fail();
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/u.test(source)) fail();
    return source.slice(0, -1);
  } finally { bytes?.fill(0); }
}
function observationFacts(intent, observation) {
  return Object.freeze({
    recoveryAuthorizationRequestId: intent.requestId, recoveryAuthorizationEpoch: intent.authorizationEpoch,
    recoveryAuthWorkerVersionId: observation.bridgeWorkerVersionId,
    recoveryAuthWorkerSourceCommit: observation.bridgeSourceCommit,
    recoveryAuthWorkerConfigIdentity: observation.bridgeConfigIdentity,
    recoveryAuthWorkerConfigEpoch: observation.bridgeConfigEpoch,
  });
}
/** Historical data for one genuine completed-family callback, never a fresh preparation capability. */
export function readSealedRealmsProductionCompletedRecoveryPreparation(input) {
  try {
    if (arguments.length !== 1) fail();
    const { privateState, authority, records, readContext } = capture(input, ['privateState', 'authority', 'records', 'readContext']);
    const contextInput = { records, privateState, authority, readContext };
    const context = readSealedRealmsProductionCompletedGenerationContext(contextInput);
    const contextBytes = JSON.stringify(context), candidate = context.bindingCandidate;
    const generatedTime = Date.parse(context.generatedAt), generatedAt = Math.floor(generatedTime / 1000);
    if (!Number.isSafeInteger(generatedTime) || new Date(generatedTime).toISOString() !== context.generatedAt
        || !Number.isSafeInteger(generatedAt) || generatedTime > Date.now()) fail();
    const commit = owner(privateState, authority), root = realpathSync(process.cwd());
    const state = { privateState, authority, commit, root, tree: treeAt(root, commit) };
    const epoch = candidate.recoveryAuthorizationEpoch;
    if (candidate.preparationSourceCommit !== commit || candidate.preparationSourceTree !== state.tree
        || !Number.isSafeInteger(epoch) || epoch < 1) fail();
    attest(state);
    const path = `recovery-preparation/${commit}/${epoch}.jws`;
    const compact = readRetainedCompact(state, path);
    const intent = retainedIntent({ ...state, path, compact });
    if (intent.authorizationEpoch !== epoch || intent.requestId !== candidate.recoveryAuthorizationRequestId
        || intent.createdAt > generatedAt) fail();
    const directory = `recovery-preparation/${commit}/${epoch}/observations`;
    const names = privateState.list({ root: 'runtime', relativeDirectory: directory });
    if (names.length < 1 || names.length > 256 || new Set(names).size !== names.length
        || names.some(name => !/^[a-f0-9]{64}\.jws$/u.test(name))) fail();
    let selected;
    const retainedObservations = [];
    for (const name of [...names].sort()) {
      const observationPath = `${directory}/${name}`, observationCompact = readRetainedCompact(state, observationPath);
      if (`${createHash('sha256').update(observationCompact).digest('hex')}.jws` !== name) fail();
      // Verify every signature at its own signed issue time first. This separates
      // legitimate old/future observations from malformed or foreign evidence.
      // That time is never returned or used as completed-generation authority.
      const issuedAt = JSON.parse(Buffer.from(observationCompact.split('.')[1], 'base64url').toString('utf8')).issuedAt;
      const observation = verifySealedRealmsProductionRecoveryPreparationObservation(observationCompact, compact, issuedAt);
      retainedObservations.push({ observationPath, observationCompact });
      if (generatedAt < observation.issuedAt || generatedAt >= observation.expiresAt) continue;
      const facts = observationFacts(intent, observation);
      if (Object.entries(facts).some(([key, value]) => candidate[key] !== value)) fail();
      selected ??= { facts, observationCompact };
    }
    if (!selected) fail();
    verifySealedRealmsProductionRecoveryPreparationObservation(selected.observationCompact, compact, generatedAt);
    // Reopen the whole bounded corpus so additions, replacements and removal
    // cannot change support while the completed context is being checked.
    attest(state);
    if (JSON.stringify(readSealedRealmsProductionCompletedGenerationContext(contextInput)) !== contextBytes) fail();
    readExact(state, path, compact);
    for (const observation of retainedObservations) readExact(state, observation.observationPath, observation.observationCompact);
    if (JSON.stringify(privateState.list({ root: 'runtime', relativeDirectory: directory })) !== JSON.stringify(names)) fail();
    attest(state);
    if (JSON.stringify(readSealedRealmsProductionCompletedGenerationContext(contextInput)) !== contextBytes) fail();
    readExact(state, path, compact);
    for (const observation of retainedObservations) readExact(state, observation.observationPath, observation.observationCompact);
    if (JSON.stringify(privateState.list({ root: 'runtime', relativeDirectory: directory })) !== JSON.stringify(names)) fail();
    return selected.facts;
  } catch { fail(); }
}
export function disposeSealedRealmsProductionRecoveryPreparation(capability) { owners.delete(capability); }
