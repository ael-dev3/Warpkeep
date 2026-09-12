import { verifySealedRealmsProductionWorkflowEvidence } from './sealed-realms-production-workflow-evidence.mjs';
import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runLocalBindingBoundedProcess } from './local-binding-runtime-process.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { verifyAuthBridgeNotificationPreparedDeployClosure } from './auth-bridge-notification-prepared-deploy-closure.mjs';
import { attestPolicyHost, attestPolicySource, cleanupPolicyRun, G001_POLICY_ENV,
  G001_POLICY_HOME, G001_POLICY_NODE, G001_POLICY_NODE_SHA, G001_POLICY_ROOT,
  policyDigest, policyDirectory, policyFail, policyGit, policyOwnedRun, policyPrivateAncestors } from './genesis001-linux-policy-boundary.mjs';

const MATERIALIZER = 'scripts/genesis001-linux-policy-materializer.mjs';
const CHILD = 'scripts/genesis001-linux-policy-child.mjs';
const BOOTSTRAP = Object.freeze([MATERIALIZER, CHILD, 'scripts/genesis001-linux-policy-native.mjs',
  'scripts/genesis001-linux-policy-boundary.mjs', 'scripts/local-binding-runtime-process.mjs',
  'scripts/local-binding-bounded-file.mjs', 'scripts/local-binding-runtime-core.mjs',
  'scripts/local-binding-native-ts-hooks.mjs']);
let active = false;
let pending;
const preparations = new WeakMap();
function checkBootstrap(source) {
  // Reuse the complete generated source inventory, including the native core's
  // static imports. The fixed spawned entries are additionally bound to Git.
  verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: process.cwd() });
  for (const path of BOOTSTRAP) {
    const committed = policyGit(process.cwd(), ['show', `${source.sourceCommit}:${path}`], true);
    try { readLocalBindingBoundedFile(join(process.cwd(), path), { maximumBytes: 4 * 1024 * 1024,
      expectedBytes: committed.length, expectedSha256: policyDigest(committed), expectedUid: 1000 }).body.fill(0); }
    finally { committed.fill(0); }
  }
}
function canonicalResult(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 32768) policyFail();
  const value = JSON.parse(text);
  if (`${JSON.stringify(value)}\n` !== text) policyFail();
  return value;
}
function secretIdentity(status) {
  return Object.fromEntries(['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .map(key => [key, String(status[key])]));
}
function secretStatus(path, fd) {
  const status = fd === undefined ? lstatSync(path, { bigint: true }) : fstatSync(fd, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink() || status.uid !== 1000n || status.gid !== 1000n
    || (status.mode & 0o7777n) !== 0o600n || status.nlink !== 1n || status.size < 32n || status.size > 514n
    || realpathSync(path) !== path) policyFail();
  return secretIdentity(status);
}
function capturePrivateParents() {
  const values = [];
  for (let path = G001_POLICY_ROOT;; path = dirname(path)) {
    values.push({ path, identity: policyDirectory(path, path === G001_POLICY_HOME ? 0o750 : 0o700) });
    if (path === G001_POLICY_HOME) break;
  }
  return values;
}

function verifyPreparation(state) {
  const { host, source, operationRoot, runId, built } = state;
  attestPolicyHost(host); attestPolicySource(source); checkBootstrap(source);
  policyOwnedRun(operationRoot, runId);
  for (const cycle of ['first', 'second']) readLocalBindingBoundedFile(join(operationRoot, `${cycle}.mjs`), {
    maximumBytes: 16 * 1024 * 1024, expectedBytes: built.bundleBytes,
    expectedSha256: built.bundleSha256, expectedUid: 1000, expectedMode: 0o600 }).body.fill(0);
}
function requirePreparation(handle) {
  const state = preparations.get(handle);
  if (state === undefined) policyFail();
  return state;
}
export function assertFixedLinuxG001PolicyPreparation(handle) {
  if (arguments.length !== 1 || requirePreparation(handle).status !== 'prepared') policyFail();
}
/** Removes only this authentic preparation; repeated cleanup after consumption is harmless. */
export function disposeFixedLinuxG001PolicyObservation(handle) {
  if (arguments.length !== 1 || active) policyFail();
  const state = requirePreparation(handle);
  if (state.cleanup !== undefined) return;
  state.cleanup = cleanupPolicyRun(state.operationRoot, state.runId);
  state.status = 'disposed';
  if (pending === handle) pending = undefined;
}

/** Builds and attests without opening a credential. Workflow refresh must follow this boundary. */
export async function prepareFixedLinuxG001PolicyObservation() {
  if (arguments.length !== 0 || active || pending !== undefined) policyFail();
  active = true;
  let operationRoot, runId, retained = false;
  try {
    const host = attestPolicyHost();
    if (process.env.WARPKEEP_OPERATION !== 'g001-policy-observe' || process.env.GITHUB_JOB !== 'operate_readonly') policyFail();
    const source = attestPolicySource();
    if (source.sourceCommit !== process.env.GITHUB_SHA) policyFail();
    checkBootstrap(source);
    policyPrivateAncestors(G001_POLICY_ROOT);
    const runs = join(G001_POLICY_ROOT, 'runs');
    if (!existsSync(runs)) mkdirSync(runs, { mode: 0o700 });
    policyDirectory(runs);
    runId = randomBytes(16).toString('hex'); operationRoot = join(runs, runId);
    mkdirSync(operationRoot, { mode: 0o700 }); policyOwnedRun(operationRoot, runId);
    const request = { runId, operationRoot, source };
    const materialization = await runLocalBindingBoundedProcess(G001_POLICY_NODE,
      ['--experimental-vm-modules', join(process.cwd(), MATERIALIZER)], {
        cwd: process.cwd(), env: G001_POLICY_ENV, fd3: JSON.stringify(request),
        containProcessGroup: true, timeout: 10 * 60 * 1000, maxOutput: 32768,
      });
    const built = canonicalResult(materialization.stdout);
    if (JSON.stringify(Object.keys(built)) !== JSON.stringify(['bundleSha256', 'bundleBytes', 'sourceClosureSha256', 'dependencyClosureSha256'])
      || !['bundleSha256', 'sourceClosureSha256', 'dependencyClosureSha256'].every(key => /^[a-f0-9]{64}$/u.test(built[key]))
      || !Number.isSafeInteger(built.bundleBytes) || built.bundleBytes < 1 || built.bundleBytes > 16 * 1024 * 1024) policyFail();
    const state = { host, source, operationRoot, runId, built, status: 'prepared', cleanup: undefined };
    verifyPreparation(state);
    const handle = Object.freeze({});
    preparations.set(handle, state); pending = handle; retained = true;
    return handle;
  } catch { policyFail(); }
  finally {
    try {
      if (!retained && operationRoot !== undefined) {
        try { cleanupPolicyRun(operationRoot, runId); } catch { /* Preserve failed owned source state; never claim cleanup. */ }
      }
    } finally { active = false; }
  }
}

/** Consumes only the prepared capability after the workflow obtains fresh authority. */
export async function executeFixedLinuxG001PolicyObservation(handle, evidence) {
  if (arguments.length !== 2 || active) policyFail();
  const state = requirePreparation(handle);
  if (state.status !== 'prepared' || pending !== handle) policyFail();
  state.status = 'consuming'; active = true;
  const { source, operationRoot, runId, built } = state;
  let secretFd;
  try {
    if (process.env.WARPKEEP_OPERATION !== 'g001-policy-observe' || process.env.GITHUB_JOB !== 'operate_readonly'
      || process.env.GITHUB_SHA !== source.sourceCommit) policyFail();
    verifyPreparation(state);
    const parents = capturePrivateParents();
    const secretPath = join(G001_POLICY_ROOT, 'admin-token');
    const before = secretStatus(secretPath);
    verifySealedRealmsProductionWorkflowEvidence(evidence, source.sourceCommit);
    secretFd = openSync(secretPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (JSON.stringify(secretStatus(secretPath, secretFd)) !== JSON.stringify(before)
      || JSON.stringify(capturePrivateParents()) !== JSON.stringify(parents)) policyFail();
    verifySealedRealmsProductionWorkflowEvidence(evidence, source.sourceCommit);
    const observed = await runLocalBindingBoundedProcess(G001_POLICY_NODE, [join(process.cwd(), CHILD)], {
      cwd: process.cwd(), env: G001_POLICY_ENV,
      fd3: JSON.stringify({ runId, operationRoot, source, bundleSha256: built.bundleSha256, bundleBytes: built.bundleBytes }),
      inheritedFd4: secretFd, containProcessGroup: true, timeout: 180000, maxOutput: 32768,
    });
    if (JSON.stringify(secretStatus(secretPath, secretFd)) !== JSON.stringify(before)
      || JSON.stringify(secretStatus(secretPath)) !== JSON.stringify(before)
      || JSON.stringify(capturePrivateParents()) !== JSON.stringify(parents)) policyFail();
    closeSync(secretFd); secretFd = undefined;
    if (observed.stderr !== '') policyFail();
    const receipt = canonicalResult(observed.stdout);
    if (receipt.sourceCommit !== source.sourceCommit || receipt.mutationSubmitted !== false) policyFail();
    verifyPreparation(state);
    state.cleanup = cleanupPolicyRun(operationRoot, runId);
    return Object.freeze({ profile: 'warpkeep-g001-linux-policy-execution-v1', ...source,
      runtime: Object.freeze({ profile: 'warpkeep-g001-policy-observation-linux-x64-v1',
        nodeVersion: 'v22.22.3', nodeSha256: G001_POLICY_NODE_SHA }),
      dependencyClosureSha256: built.dependencyClosureSha256,
      execution: Object.freeze({ runId, bundleSha256: built.bundleSha256, sourceClosureSha256: built.sourceClosureSha256 }),
      cleanup: state.cleanup, policyObservationReceipt: receipt });
  } catch { policyFail(); }
  finally {
    try {
      if (secretFd !== undefined) closeSync(secretFd);
      if (state.cleanup === undefined) {
        try { state.cleanup = cleanupPolicyRun(operationRoot, runId); }
        catch { /* Disposal can retry the authentic owned namespace; no success receipt escapes. */ }
      }
    } finally {
      state.status = 'consumed';
      if (state.cleanup !== undefined && pending === handle) pending = undefined;
      active = false;
    }
  }
}
