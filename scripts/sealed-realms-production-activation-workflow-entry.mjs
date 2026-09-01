import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';

import {
  createSealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  createSealedRealmsProductionActivationLane,
} from './sealed-realms-production-activation-lane-entry.mjs';
import {
  createSealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';

const OPERATIONS = new Set([
  'activation-evidence-inspect',
  'activation-evidence-generate',
]);
const COMMIT = /^[0-9a-f]{40}$/u;
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json';
const GIT_EXECUTABLE = process.platform === 'win32'
  ? 'git'
  : String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const GIT_ENVIRONMENT = process.platform === 'win32'
  ? undefined
  : Object.freeze({
    GIT_CONFIG_GLOBAL: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110),
    TZ: 'UTC',
  });
const runtimes = new WeakMap();
const consumedRuntimes = new WeakSet();

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
      value === null || typeof value !== 'object' || Array.isArray(value)
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
    return execFileSync(GIT_EXECUTABLE, [...arguments_], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: GIT_ENVIRONMENT,
      maxBuffer: 128 * 1_024,
      timeout: 5_000,
      windowsHide: true,
    });
  } catch {
    fail('SEALED_REALMS_ACTIVATION_WORKFLOW_GIT_INVALID');
  }
}

function readBinding(commit) {
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

function verifyEvidence(commit) {
  return Object.freeze({ verifiedSha: commit });
}

function sourceAuthority(operation, workflowInputSha) {
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

function buildDispatcher(operation, workflowInputSha) {
  const authority = sourceAuthority(operation, workflowInputSha);
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: userInfo().homedir,
  });
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
  const lane = createSealedRealmsProductionActivationLane({ bridgeState });
  return createSealedRealmsProductionDispatcher({
    readGit,
    readBinding,
    verifyEvidence,
    activationLane: lane,
  });
}

export function createSealedRealmsProductionActivationWorkflowRuntime(input) {
  const options = exactObject(input, ['operation', 'workflowInputSha']);
  const operation = operationName(options.operation);
  const workflowInputSha = sourceSha(options.workflowInputSha);
  const runtime = Object.freeze({});
  runtimes.set(runtime, Object.freeze({
    operation,
    workflowInputSha,
    dispatcher: buildDispatcher(operation, workflowInputSha),
  }));
  return runtime;
}

export async function runSealedRealmsProductionActivationOperation(input) {
  const options = exactObject(input, ['runtime', 'operation', 'workflowInputSha']);
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
  return member.dispatcher.dispatch(Object.freeze({ operation, workflowInputSha }));
}
