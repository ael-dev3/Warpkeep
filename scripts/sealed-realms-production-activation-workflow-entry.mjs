import { execFileSync } from 'node:child_process';
import { types } from 'node:util';

import {
  createSealedRealmsProductionAuthBridgeState,
  createSealedRealmsProductionActivationEvidenceGenerator,
} from './sealed-realms-production-auth-bridge-state.mjs';
import { createSealedRealmsProductionActivationRecords } from './sealed-realms-production-activation-records.mjs';
import { readSealedRealmsProductionRecoveryCandidate } from './sealed-realms-production-recovery-candidate.mjs';
import {
  createSealedRealmsProductionActivationDispatchContext,
  createSealedRealmsProductionActivationDispatcher,
  createSealedRealmsProductionActivationLane,
} from './sealed-realms-production-activation-lane-entry.mjs';
import {
  createSealedRealmsProductionContinuationStore,
} from './sealed-realms-production-continuation.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
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
} from './sealed-realms-production-workflow-authority.mjs';

const OPERATIONS = new Set([
  'activation-evidence-inspect',
  'activation-evidence-generate',
]);
const COMMIT = /^[0-9a-f]{40}$/u;
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json';
const SOURCE_BINDING_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'pagesDeploymentApproved', 'preparationSourceCommit',
]);
const GIT_EXECUTABLE = process.platform === 'win32'
  ? 'git'
  : String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const GIT_ENVIRONMENT = process.platform === 'win32'
  ? undefined
  : Object.freeze({
    GIT_CONFIG_GLOBAL: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    HOME: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110),
    TZ: 'UTC',
  });
const runtimes = new WeakMap();
const consumedRuntimes = new WeakSet();
const isProxy = types.isProxy;

function fail(code) {
  const error = new Error(code);
  error.name = 'SealedRealmsProductionActivationWorkflowEntryError';
  error.code = code;
  throw error;
}

function exactObject(value, keys) {
  let descriptors;
  try {
    if (
      isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID');
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID') throw error;
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID');
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== keys.length
    || descriptorKeys.some((key, index) => typeof key !== 'string' || key !== keys[index])
    || keys.some(key => (
      !Object.hasOwn(descriptors[key], 'value') || descriptors[key].enumerable !== true
    ))
  ) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID');
  return Object.freeze(Object.fromEntries(
    keys.map(key => [key, descriptors[key].value]),
  ));
}

function operationName(value) {
  if (typeof value !== 'string' || !OPERATIONS.has(value)) {
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_OPERATION_INVALID');
  }
  return value;
}

function sourceSha(value) {
  if (typeof value !== 'string' || !COMMIT.test(value)) {
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_SOURCE_INVALID');
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
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_GIT_INVALID');
  }
}

/** Reads inert checked-in source metadata; this is never a populated recovery candidate. */
function readBindingCandidate(commit) {
  let parsed;
  try {
    const source = readGit(['show', `${commit}:${BINDING_PATH}`]);
    if (
      typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 16 * 1_024
      || !source.endsWith('\n') || source.endsWith('\n\n') || source.includes('\0')
    ) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_BINDING_INVALID');
    parsed = JSON.parse(source);
  } catch (error) {
    if (error?.code === 'SEALED_REALMS_ACTIVATION_WORKFLOW_BINDING_INVALID') throw error;
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_BINDING_INVALID');
  }
  return parsed;
}

/** Returns the only four-field projection accepted by source authority. */
function readBinding(commit) {
  const candidate = readBindingCandidate(commit);
  if (
    candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)
    || Object.getPrototypeOf(candidate) !== Object.prototype
  ) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_BINDING_INVALID');
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
  fail('SEALED_REALMS_ACTIVATION_WORKFLOW_ADAPTER_UNAVAILABLE');
}

async function buildDispatcher(operation, workflowInputSha, evidence) {
  const verifyEvidence = commit => verifySealedRealmsProductionWorkflowEvidence(evidence, commit);
  const authority = sourceAuthority(operation, workflowInputSha, verifyEvidence);
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
  const bridgeState = createSealedRealmsProductionAuthBridgeState({
    authority,
    privateState,
    repositoryRoot: process.cwd(),
    deploymentAttester: unavailable,
    bindingAttester: unavailable,
    fetchImpl: globalThis.fetch,
    inspectImportReceipt: unavailable,
    authenticateImportResult: unavailable,
    resolveOwnerProvisionReceipt: unavailable,
  });
  // The fixed reader reopens the opaque records and immutable S itself. Missing
  // recovery/provider facts remain an explicit failure, never caller defaults.
  let records;
  if (operation === 'activation-evidence-generate') {
    records = createSealedRealmsProductionActivationRecords({ privateState, authority,
      readBindingCandidate: (_source, _projection, readContext) =>
        readSealedRealmsProductionRecoveryCandidate({ records, privateState, authority, readContext }) });
  }
  const lane = createSealedRealmsProductionActivationLane({ bridgeState,
    ...(operation === 'activation-evidence-generate' ? {
      generator: createSealedRealmsProductionActivationEvidenceGenerator({
        records,
        privateState, authority,
      }),
    } : {}),
  });
  const context = createSealedRealmsProductionActivationDispatchContext({
    readGit,
    readBinding,
    verifyEvidence,
    permit,
    continuationStore,
    runId,
    runAttempt,
    sourceAuthority: authority,
  });
  return createSealedRealmsProductionActivationDispatcher({ context, lane });
}

export async function createSealedRealmsProductionActivationWorkflowRuntime(input) {
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
      dispatcher: await buildDispatcher(operation, workflowInputSha, evidence),
    }));
    return runtime;
  } catch (error) {
    revokeSealedRealmsProductionWorkflowEvidence(evidence);
    throw error;
  }
}

export async function runSealedRealmsProductionActivationOperation(input) {
  const options = exactObject(input, ['runtime', 'operation', 'workflowInputSha']);
  if (isProxy(options.runtime)) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID');
  const operation = operationName(options.operation);
  const workflowInputSha = sourceSha(options.workflowInputSha);
  const member = runtimes.get(options.runtime);
  if (member === undefined) {
    fail(consumedRuntimes.has(options.runtime)
      ? 'SEALED_REALMS_ACTIVATION_WORKFLOW_RUNTIME_CONSUMED'
      : 'SEALED_REALMS_ACTIVATION_WORKFLOW_RUNTIME_INVALID');
  }
  if (member.operation !== operation) fail('SEALED_REALMS_ACTIVATION_WORKFLOW_OPERATION_INVALID');
  if (member.workflowInputSha !== workflowInputSha) {
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_SOURCE_INVALID');
  }
  runtimes.delete(options.runtime);
  consumedRuntimes.add(options.runtime);
  try {
    await refreshSealedRealmsProductionWorkflowEvidence(member.evidence);
    return await member.dispatcher.dispatch(Object.freeze({ operation, workflowInputSha }));
  } finally {
    revokeSealedRealmsProductionWorkflowEvidence(member.evidence);
  }
}
