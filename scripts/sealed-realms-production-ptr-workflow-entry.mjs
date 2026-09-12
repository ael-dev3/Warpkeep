import { execFileSync } from 'node:child_process';
import { types } from 'node:util';
import { lstatSync, realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, dirname, isAbsolute } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { preparePtrSourceBuiltArtifact } from './ptr-production-publisher.mjs';
import { createPtrProductionExistingUpdateAdapter, exportPtrExistingUpdateCompletion } from './ptr-production-existing-update-adapter.mjs';
import { createSealedRealmsProductionActivationRecords, writeSealedRealmsProductionPtrExistingUpdateRecord } from './sealed-realms-production-activation-records.mjs';
import { createSealedRealmsProductionBridgeProvider } from './sealed-realms-production-bridge-provider.mjs';
import {
  createSealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  createSealedRealmsProductionContinuationStore,
} from './sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionPtrDispatchContext,
  createSealedRealmsProductionPtrDispatcher,
  createSealedRealmsProductionPtrLane,
} from './sealed-realms-production-ptr-lane-entry.mjs';
import {
  createSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  createSealedRealmsProductionWorkflowEvidence,
  refreshSealedRealmsProductionWorkflowEvidence,
  revokeSealedRealmsProductionWorkflowEvidence,
  verifySealedRealmsProductionWorkflowEvidence,
} from './sealed-realms-production-workflow-evidence.mjs';
import {
  resolveSealedRealmsProductionWorkflowPrivateState,
} from './sealed-realms-production-workflow-private-state.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
  attestSealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';

const OPERATIONS = new Set([
  'ptr-update-inspect',
  'ptr-update-apply',
  'ptr-publish-inspect',
  'ptr-publish-apply',
  'ptr-import-inspect',
  'ptr-import-apply',
  'ptr-owner-provision-inspect',
  'ptr-owner-provision',
  'ptr-live-inspect',
]);
const COMMIT = /^[0-9a-f]{40}$/u;
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json';
const SOURCE_BINDING_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'pagesDeploymentApproved', 'preparationSourceCommit',
]);
const GIT_EXECUTABLE = process.platform === 'win32'
  ? 'git'
  : String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const SYSTEM_PATH = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110);
const GIT_ENVIRONMENT = process.platform === 'win32'
  ? undefined
  : Object.freeze({
    GIT_CONFIG_GLOBAL: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    HOME: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: SYSTEM_PATH,
    TZ: 'UTC',
  });
const runtimes = new WeakMap();
const consumedRuntimes = new WeakSet();
const isProxy = types.isProxy;

function fail(code) {
  const error = new Error(code);
  error.name = 'SealedRealmsProductionPtrWorkflowEntryError';
  error.code = code;
  throw error;
}

function exactObject(value, keys) {
  let descriptors;
  try {
    if (
      isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail('SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID');
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID') throw error;
    fail('SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID');
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== keys.length
    || descriptorKeys.some((key, index) => typeof key !== 'string' || key !== keys[index])
    || keys.some(key => (
      !Object.hasOwn(descriptors[key], 'value') || descriptors[key].enumerable !== true
    ))
  ) fail('SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID');
  return Object.freeze(Object.fromEntries(
    keys.map(key => [key, descriptors[key].value]),
  ));
}

function operationName(value) {
  if (typeof value !== 'string' || !OPERATIONS.has(value)) {
    fail('SEALED_REALMS_PTR_WORKFLOW_OPERATION_INVALID');
  }
  return value;
}

function sourceSha(value) {
  if (typeof value !== 'string' || !COMMIT.test(value)) {
    fail('SEALED_REALMS_PTR_WORKFLOW_SOURCE_INVALID');
  }
  return value;
}

function readGit(arguments_) {
  try {
    return execFileSync(GIT_EXECUTABLE, ['--no-replace-objects', ...arguments_], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: GIT_ENVIRONMENT,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 5_000,
      windowsHide: true,
    });
  } catch {
    fail('SEALED_REALMS_PTR_WORKFLOW_GIT_INVALID');
  }
}

function readBindingCandidate(commit) {
  let parsed;
  try {
    const source = readGit(['show', `${commit}:${BINDING_PATH}`]);
    if (
      typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 16 * 1_024
      || !source.endsWith('\n') || source.endsWith('\n\n') || source.includes('\0')
    ) fail('SEALED_REALMS_PTR_WORKFLOW_BINDING_INVALID');
    parsed = JSON.parse(source);
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_PTR_WORKFLOW_BINDING_INVALID') throw error;
    fail('SEALED_REALMS_PTR_WORKFLOW_BINDING_INVALID');
  }
  return parsed;
}

/** Keeps source authority on its exact four-field projection. */
function readBinding(commit) {
  const candidate = readBindingCandidate(commit);
  if (
    candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)
    || Object.getPrototypeOf(candidate) !== Object.prototype
  ) fail('SEALED_REALMS_PTR_WORKFLOW_BINDING_INVALID');
  return Object.freeze(Object.fromEntries(
    SOURCE_BINDING_KEYS.map(key => [key, candidate[key]]),
  ));
}

function sourceAuthority(operation, workflowInputSha, verifyEvidence) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha,
    readGit,
    readBinding,
    verifyEvidence,
  });
}

function unavailable() {
  fail('SEALED_REALMS_PTR_WORKFLOW_ADAPTER_UNAVAILABLE');
}

// These are the existing publisher's explicit configuration inputs. No PATH,
// HOME or other account's preparation installation supplies a fallback.
function updateConfiguration(expectedNode) {
  try {
    const account = userInfo();
    if (process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.geteuid?.() !== 1000
      || process.getgid?.() !== 1000 || process.getegid?.() !== 1000
      || account.uid !== 1000 || account.gid !== 1000
      || account.username !== 'warpkeep' || account.homedir !== '/home/warpkeep') throw 0;
    const paths = {
      dependencyCacheRoot: process.env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT,
      cliConfigSourcePath: process.env.WARPKEEP_SPACETIME_CLI_CONFIG_PATH,
      executable: process.env.SPACETIME_BIN,
      nodePath: process.execPath,
    };
    for (const [kind, path] of Object.entries(paths)) {
      if (typeof path !== 'string' || !isAbsolute(path) || realpathSync(path) !== path) throw 0;
      const status = lstatSync(path);
      if (status.isSymbolicLink()) throw 0;
      if (kind === 'dependencyCacheRoot') {
        if (!status.isDirectory() || status.uid !== 1000 || (status.mode & 0o7777) !== 0o700) throw 0;
      } else if (!status.isFile() || status.nlink !== 1
        || (kind === 'cliConfigSourcePath'
          ? status.uid !== 1000 || (status.mode & 0o7777) !== 0o600
          : kind === 'nodePath'
            ? status.uid !== 1000 || (status.mode & 0o7777) !== 0o500
            : ![0, 1000].includes(status.uid) || (status.mode & 0o022) !== 0)) throw 0;
      for (let parent = dirname(path);; parent = dirname(parent)) {
        const ancestor = lstatSync(parent);
        if (!ancestor.isDirectory() || ancestor.isSymbolicLink() || realpathSync(parent) !== parent
          || ![0, 1000].includes(ancestor.uid) || (ancestor.mode & 0o022) !== 0) throw 0;
        if (dirname(parent) === parent) break;
      }
    }
    if (basename(paths.nodePath) !== 'node') throw 0;
    const node = readLocalBindingBoundedFile(paths.nodePath, {
      maximumBytes: 124819136, expectedBytes: 124819136,
      expectedSha256: 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2',
      expectedUid: 1000, expectedMode: 0o500, requireExecutable: true,
      discardBody: true, expectedIdentity: expectedNode,
    });
    return Object.freeze({ ...paths, nodeIdentity: node.identity });
  } catch { fail('SEALED_REALMS_PTR_WORKFLOW_UPDATE_CONFIG_INVALID'); }
}

function createPublishMarker() {
  // Task 5 owns the first real marker/publisher integration. No publisher or
  // prepare effect is reachable while the fixed marker adapter is unavailable.
  fail('SEALED_REALMS_PTR_WORKFLOW_ADAPTER_UNAVAILABLE');
}

function exactGitArguments(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((member, index) => member === expected[index]);
}

function bridgeAuthorityFromSourceAuthority(authority, operation, verifyEvidence) {
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
  const preparationSourceCommit =
    preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
  if (authority.mode === 'S') return authority;
  if (
    authority.mode !== 'A'
    || authority.operation !== operation
    || operation !== 'ptr-live-inspect'
    || sourceCommit === preparationSourceCommit
  ) fail('SEALED_REALMS_PTR_WORKFLOW_SOURCE_INVALID');

  const readHistoricalGit = arguments_ => {
    if (
      exactGitArguments(arguments_, ['rev-parse', '--verify', 'HEAD^{commit}'])
      || exactGitArguments(arguments_, [
        'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}',
      ])
    ) return `${preparationSourceCommit}\n`;
    fail('SEALED_REALMS_PTR_WORKFLOW_GIT_INVALID');
  };
  const readHistoricalBinding = commit => {
    if (commit !== preparationSourceCommit) {
      fail('SEALED_REALMS_PTR_WORKFLOW_BINDING_INVALID');
    }
    return readBinding(commit);
  };
  const verifyHistoricalEvidence = commit => {
    if (commit !== preparationSourceCommit) {
      fail('SEALED_REALMS_PTR_WORKFLOW_SOURCE_INVALID');
    }
    return verifyEvidence(commit);
  };
  return authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha: preparationSourceCommit,
    readGit: readHistoricalGit,
    readBinding: readHistoricalBinding,
    verifyEvidence: verifyHistoricalEvidence,
  });
}

async function buildDispatcher(operation, workflowInputSha, evidence) {
  const verifyEvidence = commit => verifySealedRealmsProductionWorkflowEvidence(evidence, commit);
  const authority = sourceAuthority(operation, workflowInputSha, verifyEvidence);
  const bridgeAuthority = bridgeAuthorityFromSourceAuthority(authority, operation, verifyEvidence);
  const configuration = operation.startsWith('ptr-update-') ? updateConfiguration() : undefined;
  const githubToken = process.env.GITHUB_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority: authority,
    githubToken,
    runId,
    runAttempt,
    fetchImpl: globalThis.fetch,
  });
  const privateState = resolveSealedRealmsProductionWorkflowPrivateState();
  const continuationStore = createSealedRealmsProductionContinuationStore({ privateState });
  let artifact, existingUpdate, cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { existingUpdate?.dispose(); }
    finally { artifact?.cleanup(); }
  };
  try {
    if (configuration !== undefined) {
      const reattestSource = () => {
        const current = sourceAuthority(operation, workflowInputSha, verifyEvidence);
        const commit = sourceCommitFromSealedRealmsProductionAuthority(current);
        if (current.mode !== 'S' || commit !== workflowInputSha) fail('SEALED_REALMS_PTR_WORKFLOW_SOURCE_INVALID');
        const reopened = updateConfiguration(configuration.nodeIdentity);
        if (JSON.stringify(reopened) !== JSON.stringify(configuration)) fail('SEALED_REALMS_PTR_WORKFLOW_UPDATE_CONFIG_INVALID');
        return commit;
      };
      artifact = preparePtrSourceBuiltArtifact({
        sourceCommit: sourceCommitFromSealedRealmsProductionAuthority(authority),
        reattestSource,
        dependencyCacheRoot: configuration.dependencyCacheRoot,
        cliConfigSourcePath: configuration.cliConfigSourcePath,
        executable: configuration.executable,
        environment: Object.freeze({ PATH: `${dirname(configuration.nodePath)}:${SYSTEM_PATH}` }),
      });
      existingUpdate = createPtrProductionExistingUpdateAdapter({ authority, privateState, artifact });
    }
    const bridgeState = createSealedRealmsProductionAuthBridgeState({
      authority: bridgeAuthority,
      privateState,
      repositoryRoot: process.cwd(),
      bridgeProvider: createSealedRealmsProductionBridgeProvider({
        authority: bridgeAuthority, privateState, repositoryRoot: process.cwd(), fetchImpl: globalThis.fetch,
      }),
      fetchImpl: globalThis.fetch,
      inspectImportReceipt: unavailable,
      authenticateImportResult: unavailable,
      resolveOwnerProvisionReceipt: unavailable,
    });
    const reconciler = createSealedRealmsProductionPublicationReconciler({
      privateState,
      lane: 'ptr',
      postflight: unavailable,
    });
    const lane = createSealedRealmsProductionPtrLane({
      ...(existingUpdate === undefined ? {} : { existingUpdate }),
      reconciler,
      bridgeState,
      createPublishMarker,
      publish: unavailable,
      importCore: unavailable,
      inspectOwnerProvision: unavailable,
      provisionOwner: unavailable,
      liveInspect: unavailable,
    });
    const context = createSealedRealmsProductionPtrDispatchContext({
      readGit,
      readBinding,
      verifyEvidence,
      permit,
      continuationStore,
      runId,
      runAttempt,
      sourceAuthority: authority,
    });
    const writeCompletion = completion => {
      const records = createSealedRealmsProductionActivationRecords({ privateState, authority });
      writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority, completion });
    };
    const captureCompletedUpdate = () => writeCompletion(exportPtrExistingUpdateCompletion({
      adapter: existingUpdate, authority, store: continuationStore,
    }));
    const recoverCompletedUpdate = async () => {
      let completion;
      try {
        await attestSealedRealmsProductionWorkflowPermit({
          permit, sourceAuthority: authority, phase: 'continuation-terminal', runId, runAttempt,
        });
        // A normalized lane failure is not completion evidence. Only this
        // current-head export can prove an already committed effect and terminal.
        completion = exportPtrExistingUpdateCompletion({ adapter: existingUpdate, authority, store: continuationStore });
      } catch { return false; }
      writeCompletion(completion);
      return true;
    };
    return { dispatcher: createSealedRealmsProductionPtrDispatcher({ context, lane }), captureCompletedUpdate, recoverCompletedUpdate, cleanup };
  } catch (error) {
    try { cleanup(); } catch { fail('SEALED_REALMS_PTR_WORKFLOW_CLEANUP_FAILED'); }
    throw error;
  }
}

export async function createSealedRealmsProductionPtrWorkflowRuntime(input) {
  const options = exactObject(input, ['operation', 'workflowInputSha']);
  const operation = operationName(options.operation);
  const workflowInputSha = sourceSha(options.workflowInputSha);
  const evidence = await createSealedRealmsProductionWorkflowEvidence({ workflowInputSha });
  const runtime = Object.freeze({});
  try {
    runtimes.set(runtime, Object.freeze({
      operation,
      workflowInputSha,
      evidence,
      ...await buildDispatcher(operation, workflowInputSha, evidence),
    }));
    return runtime;
  } catch (error) {
    revokeSealedRealmsProductionWorkflowEvidence(evidence);
    throw error;
  }
}

export async function runSealedRealmsProductionPtrOperation(input) {
  const options = exactObject(input, ['runtime', 'operation', 'workflowInputSha']);
  if (isProxy(options.runtime)) fail('SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID');
  const operation = operationName(options.operation);
  const workflowInputSha = sourceSha(options.workflowInputSha);
  const member = runtimes.get(options.runtime);
  if (member === undefined) {
    fail(consumedRuntimes.has(options.runtime)
      ? 'SEALED_REALMS_PTR_WORKFLOW_RUNTIME_CONSUMED'
      : 'SEALED_REALMS_PTR_WORKFLOW_RUNTIME_INVALID');
  }
  if (member.operation !== operation) fail('SEALED_REALMS_PTR_WORKFLOW_OPERATION_INVALID');
  if (member.workflowInputSha !== workflowInputSha) fail('SEALED_REALMS_PTR_WORKFLOW_SOURCE_INVALID');
  runtimes.delete(options.runtime);
  consumedRuntimes.add(options.runtime);
  try {
    await refreshSealedRealmsProductionWorkflowEvidence(member.evidence);
    let result;
    try {
      result = await member.dispatcher.dispatch(Object.freeze({ operation, workflowInputSha }));
    } catch (error) {
      if (operation === 'ptr-update-apply' && error?.code === 'SEALED_REALMS_DISPATCH_LANE_FAILED'
        && await member.recoverCompletedUpdate()) {
        return Object.freeze({ operation, status: 'completed' });
      }
      throw error;
    }
    if (operation === 'ptr-update-apply' && result.operation === operation && result.status === 'completed') {
      member.captureCompletedUpdate();
    }
    return result;
  } finally {
    try { member.cleanup(); }
    catch { fail('SEALED_REALMS_PTR_WORKFLOW_CLEANUP_FAILED'); }
    finally { revokeSealedRealmsProductionWorkflowEvidence(member.evidence); }
  }
}
