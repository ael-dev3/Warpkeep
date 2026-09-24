import { refreshSealedRealmsProductionWorkflowEvidence,
  verifySealedRealmsProductionWorkflowEvidence } from './sealed-realms-production-workflow-evidence.mjs';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { closeSync, constants, existsSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runLocalBindingBoundedProcess } from './local-binding-runtime-process.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { verifyAuthBridgeNotificationPreparedDeployClosure } from './auth-bridge-notification-prepared-deploy-closure.mjs';
import { createGenesis001LinuxCensusAttempt, retainGenesis001LinuxCensusRecord,
  readFixedLinuxG001CensusAttempt, verifyGenesis001LinuxCensusRetainedSamples } from './genesis001-linux-census-attempt.mjs';
import { sourceCommitFromSealedRealmsProductionAuthority } from './sealed-realms-production-source-authority.mjs';
import { assertSealedRealmsProductionWorkflowPermit,
  attestSealedRealmsProductionActivationRead } from './sealed-realms-production-workflow-authority.mjs';
import { attestPolicyHost, attestPolicySource, cleanupPolicyRun, G001_POLICY_ENV,
  G001_POLICY_HOME, G001_POLICY_NODE, G001_POLICY_NODE_SHA, G001_POLICY_ROOT,
  policyDigest, policyDirectory, policyFail, policyGit, policyOwnedRun, policyPrivateAncestors } from './genesis001-linux-policy-boundary.mjs';

const MATERIALIZER = 'scripts/genesis001-linux-policy-materializer.mjs';
const CHILD = 'scripts/genesis001-linux-policy-child.mjs';
const BOOTSTRAP = Object.freeze([MATERIALIZER, CHILD, 'scripts/genesis001-linux-policy-native.mjs',
  'scripts/genesis001-linux-policy-boundary.mjs', 'scripts/local-binding-runtime-process.mjs',
  'scripts/local-binding-bounded-file.mjs', 'scripts/local-binding-runtime-core.mjs',
  'scripts/local-binding-native-ts-hooks.mjs']);
const NATIVE_FAILURE_MARKER = /^G001_LINUX_POLICY_NATIVE_FAILED(?::(g001-(?:admitted-(?:identity|aggregate|enumeration|status|reconciliation|collection)|census-directory|applicant-(?:collection|export|proof)|session-finalize|observation|receipt|policy-(?:state|procedure|transport|credential|authority|budget(?:-(?:capacity|clock|reservation|lock|ledger|interrupted|combined))?|inspect|cleanup))))?$/u;
const ADMITTED_DIAGNOSTICS = new Set([
  'g001-admitted-identity', 'g001-admitted-aggregate', 'g001-admitted-enumeration',
  'g001-admitted-status', 'g001-admitted-reconciliation',
  'g001-census-directory', 'g001-applicant-collection', 'g001-applicant-export', 'g001-applicant-proof',
  'g001-admitted-collection', 'g001-session-finalize',
  'g001-observation', 'g001-receipt',
  'g001-policy-state', 'g001-policy-procedure', 'g001-policy-transport',
  'g001-policy-credential', 'g001-policy-authority', 'g001-policy-budget',
  'g001-policy-budget-capacity', 'g001-policy-budget-clock', 'g001-policy-budget-reservation',
  'g001-policy-budget-lock', 'g001-policy-budget-ledger', 'g001-policy-budget-interrupted',
  'g001-policy-budget-combined',
  'g001-policy-inspect', 'g001-policy-cleanup',
]);

// Runtime warnings may reach stderr beside the child marker. Extract only the
// allowlisted marker and never propagate surrounding stderr into evidence.
function nativeFailureDiagnostic(stderr) {
  const matches = [...stderr.matchAll(/(?:^|\r?\n)(G001_LINUX_POLICY_NATIVE_FAILED(?::g001-(?:admitted-(?:identity|aggregate|enumeration|status|reconciliation|collection)|census-directory|applicant-(?:collection|export|proof)|session-finalize|observation|receipt|policy-(?:state|procedure|transport|credential|authority|budget(?:-(?:capacity|clock|reservation|lock|ledger|interrupted|combined))?|inspect|cleanup)))?)(?=\r?\n|$)/gu)];
  if (matches.length !== 1) return undefined;
  const parsed = NATIVE_FAILURE_MARKER.exec(matches[0][1]);
  return parsed === null ? undefined : parsed[1] ?? 'g001-observation';
}
function nativeErrorDiagnostic(error) {
  if (error === null || typeof error !== 'object' || types.isProxy(error)) return undefined;
  try {
    const field = Object.getOwnPropertyDescriptor(error, 'diagnostic');
    return field !== undefined && 'value' in field && typeof field.value === 'string'
      ? field.value : undefined;
  } catch { return undefined; }
}
let active = false;
let pending;
const preparations = new WeakMap();
const activationCensuses = new WeakMap();
function operationContext(kind) {
  const operation = process.env.WARPKEEP_OPERATION, job = process.env.GITHUB_JOB;
  const allowed = kind === 'policy' ? ['g001-policy-observe']
    : ['g001-freeze-census', 'activation-evidence-inspect', 'activation-evidence-generate'];
  if (!allowed.includes(operation)
    || job !== (operation === 'activation-evidence-generate' ? 'operate' : 'operate_readonly')) policyFail();
  return { operation, job };
}
function sameOperation(state) {
  if (JSON.stringify(operationContext(state.kind)) !== JSON.stringify(state.context)
    || process.env.GITHUB_SHA !== state.source.sourceCommit) policyFail();
}
function activationInput(input, keys) {
  if (types.isProxy(input) || input === null || typeof input !== 'object'
    || Object.getPrototypeOf(input) !== Object.prototype) policyFail();
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key =>
    !fields[key]?.enumerable || !Object.hasOwn(fields[key], 'value'))) policyFail();
  return Object.fromEntries(keys.map(key => [key, fields[key].value]));
}
function activationBinding(state, options, run) {
  sameOperation(state);
  if (!['activation-evidence-inspect', 'activation-evidence-generate'].includes(state.context.operation)
    || sourceCommitFromSealedRealmsProductionAuthority(options.sourceAuthority) !== state.source.sourceCommit
    || options.sourceAuthority.mode !== 'S' || options.sourceAuthority.operation !== state.context.operation
    || process.env.GITHUB_RUN_ID !== run.runId || process.env.GITHUB_RUN_ATTEMPT !== run.runAttempt) policyFail();
  assertSealedRealmsProductionWorkflowPermit(options.workflowPermit);
}
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
function canonicalResult(text, maximumBytes = 32768) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > maximumBytes) policyFail();
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
function capturePrivateParents(root = G001_POLICY_ROOT) {
  const values = [];
  for (let path = root;; path = dirname(path)) {
    values.push({ path, identity: policyDirectory(path, path === G001_POLICY_HOME ? 0o750 : 0o700) });
    if (path === G001_POLICY_HOME) break;
  }
  return values;
}

function verifyPreparation(state) {
  const { host, source, operationRoot, runId, built, kind } = state;
  attestPolicyHost(host); attestPolicySource(source, process.cwd(), kind); checkBootstrap(source);
  policyOwnedRun(operationRoot, runId);
  // The locked builder requires the first compiler pass at its canonical
  // transient bundle path and removes that materialization before returning.
  // The materializer retains a byte-identical private copy for both lifecycle
  // checks, so preparation verification must read the retained copies only.
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
  if (arguments.length !== 1 || requirePreparation(handle).status !== 'prepared'
    || requirePreparation(handle).kind !== 'policy') policyFail();
}
export function assertFixedLinuxG001CensusPreparation(handle) {
  if (arguments.length !== 1 || requirePreparation(handle).status !== 'prepared'
    || requirePreparation(handle).kind !== 'census') policyFail();
}
/** Removes only this authentic preparation; repeated cleanup after consumption is harmless. */
export function disposeFixedLinuxG001PolicyObservation(handle) {
  if (arguments.length !== 1 || active) policyFail();
  const state = requirePreparation(handle);
  state.adminSecret = undefined;
  if (state.cleanup !== undefined) return;
  state.cleanup = cleanupPolicyRun(state.operationRoot, state.runId);
  state.status = 'disposed';
  if (pending === handle) pending = undefined;
}

function validateAdminSecret(adminSecret) {
  if (arguments.length !== 1 || typeof adminSecret !== 'string'
    || Buffer.byteLength(adminSecret, 'utf8') < 32 || Buffer.byteLength(adminSecret, 'utf8') > 512
    || /[\u0000-\u0020\u007f]/u.test(adminSecret)) policyFail('g001-credential');
  return adminSecret;
}
/** Builds and attests before placing the protected workflow credential in the
 * operation's private root. Workflow refresh must follow this boundary. */
export async function prepareFixedLinuxG001PolicyObservation(adminSecret) {
  if (arguments.length !== 1) policyFail();
  return prepare('policy', validateAdminSecret(adminSecret));
}
export async function prepareFixedLinuxG001CensusObservation(adminSecret) {
  if (arguments.length !== 1) policyFail();
  validateAdminSecret(adminSecret);
  return prepare('census', adminSecret);
}
async function prepare(kind, adminSecret) {
  if (active || pending !== undefined) policyFail();
  active = true;
  let operationRoot, runId, retained = false;
  let diagnostic = 'g001-host';
  try {
    const host = attestPolicyHost();
    const context = operationContext(kind);
    diagnostic = 'g001-source';
    const source = attestPolicySource(undefined, process.cwd(), kind);
    if (source.sourceCommit !== process.env.GITHUB_SHA) policyFail();
    diagnostic = 'g001-closure';
    checkBootstrap(source);
    diagnostic = 'g001-private-root';
    policyPrivateAncestors(G001_POLICY_ROOT);
    const runs = join(G001_POLICY_ROOT, 'runs');
    if (!existsSync(runs)) mkdirSync(runs, { mode: 0o700 });
    policyDirectory(runs);
    runId = randomBytes(16).toString('hex'); operationRoot = join(runs, runId);
    mkdirSync(operationRoot, { mode: 0o700 }); policyOwnedRun(operationRoot, runId);
    const request = { runId, operationRoot, source, ...(kind === 'census' ? { kind } : {}) };
    diagnostic = 'g001-materialization';
    const materialization = await runLocalBindingBoundedProcess(G001_POLICY_NODE,
      ['--experimental-vm-modules', join(process.cwd(), MATERIALIZER)], {
        cwd: process.cwd(), env: G001_POLICY_ENV, fd3: JSON.stringify(request),
        containProcessGroup: true, timeout: 10 * 60 * 1000, maxOutput: 32768,
      });
    const built = canonicalResult(materialization.stdout);
    if (JSON.stringify(Object.keys(built)) !== JSON.stringify(['bundleSha256', 'bundleBytes', 'sourceClosureSha256', 'dependencyClosureSha256'])
      || !['bundleSha256', 'sourceClosureSha256', 'dependencyClosureSha256'].every(key => /^[a-f0-9]{64}$/u.test(built[key]))
      || !Number.isSafeInteger(built.bundleBytes) || built.bundleBytes < 1 || built.bundleBytes > 16 * 1024 * 1024) policyFail();
    const state = { host, source, operationRoot, runId, built, kind, context, adminSecret, status: 'prepared', cleanup: undefined };
    diagnostic = 'g001-prepared-verification';
    sameOperation(state);
    verifyPreparation(state);
    const handle = Object.freeze({});
    preparations.set(handle, state); pending = handle; retained = true;
    return handle;
  } catch { policyFail(diagnostic); }
  finally {
    try {
      if (!retained && operationRoot !== undefined) {
        try { cleanupPolicyRun(operationRoot, runId); } catch { /* Preserve failed owned source state; never claim cleanup. */ }
      }
    } finally { adminSecret = undefined; active = false; }
  }
}

/** Consumes only the prepared capability after the workflow obtains fresh authority. */
export async function executeFixedLinuxG001PolicyObservation(handle, evidence) {
  if (arguments.length !== 2) policyFail();
  return execute(handle, evidence, 'policy');
}
export async function executeFixedLinuxG001CensusObservation(handle, evidence) {
  if (arguments.length !== 2 || requirePreparation(handle).context.operation !== 'g001-freeze-census') policyFail();
  return execute(handle, evidence, 'census');
}
/** The same native read runs after activation builds. Its evidence never claims
 * that the still-live activation workflow has already completed successfully. */
export async function executeFixedLinuxG001ActivationCensusObservation(handle, input) {
  if (arguments.length !== 2) policyFail();
  const options = activationInput(input, ['sourceAuthority', 'workflowPermit', 'workflowEvidence']);
  const state = requirePreparation(handle);
  if (state.kind !== 'census' || state.status !== 'prepared' || pending !== handle) policyFail();
  const run = Object.freeze({ runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
  if (![run.runId, run.runAttempt].every(value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/u.test(value))) policyFail();
  const attest = async () => {
    activationBinding(state, options, run);
    await refreshSealedRealmsProductionWorkflowEvidence(options.workflowEvidence);
    activationBinding(state, options, run);
    await attestSealedRealmsProductionActivationRead({ permit: options.workflowPermit,
      sourceAuthority: options.sourceAuthority, ...run });
    activationBinding(state, options, run);
    verifySealedRealmsProductionWorkflowEvidence(options.workflowEvidence, state.source.sourceCommit);
  };
  await attest();
  const selector = await execute(handle, options.workflowEvidence, 'census');
  await attest();
  const capability = Object.freeze({});
  activationCensuses.set(capability, { state, options, run, selector });
  try {
    readFixedLinuxG001ActivationCensusEvidence(capability, {
      sourceAuthority: options.sourceAuthority, workflowPermit: options.workflowPermit });
    return capability;
  } catch (error) { activationCensuses.delete(capability); throw error; }
}
/** Reopens the exact complete private attempt executed by this live process.
 * Serialized receipts and selectors cannot establish the native execution. */
export function readFixedLinuxG001ActivationCensusEvidence(capability, input) {
  if (arguments.length !== 2) policyFail();
  const requested = activationInput(input, ['sourceAuthority', 'workflowPermit']);
  const member = activationCensuses.get(capability);
  if (!member || requested.sourceAuthority !== member.options.sourceAuthority
    || requested.workflowPermit !== member.options.workflowPermit) policyFail();
  const { state, options, run, selector } = member;
  activationBinding(state, options, run);
  attestPolicyHost(state.host); attestPolicySource(state.source, process.cwd(), 'census');
  verifySealedRealmsProductionWorkflowEvidence(options.workflowEvidence, state.source.sourceCommit);
  const retained = readFixedLinuxG001CensusAttempt(selector.attemptId, selector.sourceCommit);
  if (JSON.stringify(retained.selector) !== JSON.stringify(selector)) policyFail();
  activationBinding(state, options, run);
  verifySealedRealmsProductionWorkflowEvidence(options.workflowEvidence, state.source.sourceCommit);
  return retained;
}
async function execute(handle, evidence, kind) {
  if (active) policyFail();
  const state = requirePreparation(handle);
  if (state.status !== 'prepared' || pending !== handle || state.kind !== kind) policyFail();
  state.status = 'consuming'; active = true;
  const { source, operationRoot, runId, built } = state;
  let secretFd;
  let diagnostic = 'g001-prepared-verification';
  try {
    sameOperation(state);
    verifyPreparation(state);
    diagnostic = 'g001-private-root';
    const githubRunId = process.env.GITHUB_RUN_ID, githubRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
    const attemptRoot = join(G001_POLICY_ROOT, 'attempts', runId);
    if (kind === 'census') {
      if (!/^[1-9][0-9]{0,19}$/u.test(githubRunId) || !/^[1-9][0-9]{0,19}$/u.test(githubRunAttempt)) policyFail();
      const attempts = join(G001_POLICY_ROOT, 'attempts');
      if (!existsSync(attempts)) mkdirSync(attempts, { mode: 0o700 });
      policyPrivateAncestors(attempts);
      mkdirSync(attemptRoot, { mode: 0o700 }); policyPrivateAncestors(attemptRoot);
    }
    const secretRoot = operationRoot;
    const parents = capturePrivateParents(secretRoot);
    const secretPath = join(secretRoot, 'admin-token');
    diagnostic = 'g001-authority';
    verifySealedRealmsProductionWorkflowEvidence(evidence, source.sourceCommit);
    diagnostic = 'g001-credential-descriptor';
    // Both read-only observations use the existing protected workflow secret.
    // Only the credential-free build has run so far. Create one owned file
    // after refreshed authority, then remove the entire operation root during
    // cleanup; never depend on or leave a persistent runner token file.
    const secret = Buffer.from(state.adminSecret, 'utf8');
    state.adminSecret = undefined;
    let writable;
    try {
      writable = openSync(secretPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      writeFileSync(writable, secret); fsyncSync(writable);
    } finally { secret.fill(0); if (writable !== undefined) closeSync(writable); }
    const before = secretStatus(secretPath);
    secretFd = openSync(secretPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (JSON.stringify(secretStatus(secretPath, secretFd)) !== JSON.stringify(before)
      || JSON.stringify(capturePrivateParents(secretRoot)) !== JSON.stringify(parents)) policyFail();
    diagnostic = 'g001-authority';
    verifySealedRealmsProductionWorkflowEvidence(evidence, source.sourceCommit);
    diagnostic = 'g001-observation';
    const observed = await runLocalBindingBoundedProcess(G001_POLICY_NODE, [join(process.cwd(), CHILD)], {
      cwd: process.cwd(), env: G001_POLICY_ENV,
      fd3: JSON.stringify({ runId, operationRoot, source, bundleSha256: built.bundleSha256, bundleBytes: built.bundleBytes,
        ...(kind === 'census' ? { kind, githubRunId, githubRunAttempt } : {}) }),
      inheritedFd4: secretFd, containProcessGroup: true, timeout: kind === 'census' ? 600000 : 180000,
      maxOutput: kind === 'census' ? 4 * 1024 * 1024 : 32768, allowNonzeroExit: true,
    });
    diagnostic = 'g001-receipt';
    if (JSON.stringify(secretStatus(secretPath, secretFd)) !== JSON.stringify(before)
      || JSON.stringify(secretStatus(secretPath)) !== JSON.stringify(before)
      || JSON.stringify(capturePrivateParents(secretRoot)) !== JSON.stringify(parents)) policyFail();
    closeSync(secretFd); secretFd = undefined;
    if (observed.exitCode !== undefined && (observed.exitCode !== 0 || observed.signal !== null)) {
      const childDiagnostic = nativeFailureDiagnostic(observed.stderr);
      policyFail(childDiagnostic ?? 'g001-observation');
    }
    if (observed.stderr !== '') {
      const childDiagnostic = nativeFailureDiagnostic(observed.stderr);
      policyFail(childDiagnostic ?? 'g001-observation');
    }
    const receipt = canonicalResult(observed.stdout, kind === 'census' ? 4 * 1024 * 1024 : 32768);
    sameOperation(state);
    if (receipt.sourceCommit !== source.sourceCommit || receipt.mutationSubmitted !== false) policyFail();
    if (kind === 'census') {
      if (receipt.repositoryRoot !== process.cwd() || receipt.attemptId !== runId || receipt.githubRunId !== githubRunId
        || receipt.githubRunAttempt !== githubRunAttempt || process.env.GITHUB_RUN_ID !== githubRunId
        || process.env.GITHUB_RUN_ATTEMPT !== githubRunAttempt) policyFail();
      verifyGenesis001LinuxCensusRetainedSamples(attemptRoot, receipt.first, receipt.second, source.sourceCommit);
    }
    verifyPreparation(state);
    diagnostic = 'g001-cleanup';
    state.cleanup = cleanupPolicyRun(operationRoot, runId);
    diagnostic = 'g001-receipt';
    const execution = Object.freeze({ profile: 'warpkeep-g001-linux-policy-execution-v1', ...source,
      runtime: Object.freeze({ profile: 'warpkeep-g001-policy-observation-linux-x64-v1',
        nodeVersion: 'v22.22.3', nodeSha256: G001_POLICY_NODE_SHA }),
      dependencyClosureSha256: built.dependencyClosureSha256,
      execution: Object.freeze({ runId, bundleSha256: built.bundleSha256, sourceClosureSha256: built.sourceClosureSha256 }),
      cleanup: state.cleanup, policyObservationReceipt: receipt });
    if (kind === 'policy') return execution;
    const complete = createGenesis001LinuxCensusAttempt(receipt, execution, new Date().toISOString());
    verifyGenesis001LinuxCensusRetainedSamples(attemptRoot, receipt.first, receipt.second, source.sourceCommit);
    retainGenesis001LinuxCensusRecord(attemptRoot, 'complete.json', complete);
    // Workflow stdout receives only this opaque selector. The admitted FIDs,
    // applicant reports and full proof remain in the private attempt directory.
    return Object.freeze({ profile: 'warpkeep-g001-linux-census-completed-v1', sourceCommit: source.sourceCommit,
      attemptId: runId, githubRunId, githubRunAttempt, receiptDigest: complete.receiptDigest,
      completedAt: complete.completedAt, mutationSubmitted: false });
  } catch (error) {
    const childDiagnostic = nativeErrorDiagnostic(error);
    policyFail(typeof childDiagnostic === 'string' && ADMITTED_DIAGNOSTICS.has(childDiagnostic)
      ? childDiagnostic : diagnostic);
  }
  finally {
    try {
      if (secretFd !== undefined) closeSync(secretFd);
      if (state.cleanup === undefined) {
        try { state.cleanup = cleanupPolicyRun(operationRoot, runId); }
        catch { /* Disposal can retry the authentic owned namespace; no success receipt escapes. */ }
      }
    } finally {
      state.adminSecret = undefined;
      state.status = 'consumed';
      if (state.cleanup !== undefined && pending === handle) pending = undefined;
      active = false;
    }
  }
}
