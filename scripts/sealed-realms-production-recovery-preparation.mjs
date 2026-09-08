import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { types } from 'node:util';
import { assertSealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { assertRecoverySourceClosureSnapshot } from './recovery-source-closure.mjs';
import { verifySealedRealmsProductionRecoveryPreparationReceipt } from './sealed-realms-production-recovery-preparation-receipt.mjs';
import { requestSealedRealmsProductionRecoveryPreparation } from './sealed-realms-production-recovery-preparation-transport.mjs';
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
function retained(state) {
  let bytes;
  try {
    bytes = state.privateState.read({ root: 'runtime', relativePath: state.path });
    if (bytes.length > 16385) fail();
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (source !== `${state.compact}\n`) fail();
    const intent = verifySealedRealmsProductionRecoveryPreparationReceipt(state.compact);
    if (intent.preparationCommit !== state.commit || intent.preparationTree !== state.tree) fail();
    return Object.freeze({ recoveryAuthorizationRequestId: intent.requestId, recoveryAuthorizationEpoch: intent.authorizationEpoch });
  } finally { bytes?.fill(0); }
}
/** Authenticates the current service reservation, retains its exact signed bytes, and owns only two candidate facts. */
export async function createSealedRealmsProductionRecoveryPreparation(input) {
  let bytes;
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
    const retainedState = { ...state, path, compact };
    bytes = Buffer.from(`${compact}\n`);
    try { privateState.write({ root: 'runtime', relativePath: path, bytes }); }
    catch { if (!privateState.exists({ root: 'runtime', relativePath: path })) fail(); }
    retained(retainedState);
    attest(state);
    const capability = Object.freeze({}); owners.set(capability, Object.freeze(retainedState));
    return capability;
  } catch { fail(); }
  finally { bytes?.fill(0); }
}
export function readSealedRealmsProductionRecoveryPreparation(input) {
  try {
    if (arguments.length !== 1) fail();
    const { capability, privateState, authority } = capture(input, ['capability', 'privateState', 'authority']);
    if (types.isProxy(capability)) fail();
    const state = owners.get(capability);
    if (!state || state.privateState !== privateState || state.authority !== authority) fail();
    attest(state); const facts = retained(state); attest(state); return facts;
  } catch { fail(); }
}
export function disposeSealedRealmsProductionRecoveryPreparation(capability) { owners.delete(capability); }
