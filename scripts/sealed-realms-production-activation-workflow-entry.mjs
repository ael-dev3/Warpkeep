import { createSealedRealmsProductionRecoveryProgramArtifacts, disposeSealedRealmsProductionRecoveryProgramArtifacts } from './sealed-realms-production-recovery-program-artifacts.mjs';
import { createSealedRealmsProductionRecoverySourceClosure, disposeSealedRealmsProductionRecoverySourceClosure } from './sealed-realms-production-recovery-source-closure.mjs';
import { createSealedRealmsProductionRecoveryPreparation, disposeSealedRealmsProductionRecoveryPreparation } from './sealed-realms-production-recovery-preparation.mjs';
import { execFileSync } from 'node:child_process';
import { types } from 'node:util';
import { createSealedRealmsProductionBridgeProvider } from './sealed-realms-production-bridge-provider.mjs';

import {
  createSealedRealmsProductionAuthBridgeState,
  createSealedRealmsProductionActivationEvidenceGenerator,
} from './sealed-realms-production-auth-bridge-state.mjs';
import { createSealedRealmsProductionActivationRecords, authenticateSealedRealmsProductionPtrExistingStateAdoption } from './sealed-realms-production-activation-records.mjs';
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

async function buildDispatcher(operation, workflowInputSha, evidence, lifecycle) {
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
  let existingStateAdoption;
  if (privateState.list({ root: 'runtime' }).includes('ptr-existing-state-adoptions-v4')) {
    // This separate source authority only reopens the historical update. It does
    // not receive an update permit or construct a provider capable of applying it.
    const retainedRecords = createSealedRealmsProductionActivationRecords({ privateState, authority });
    const updateAuthority = sourceAuthority('ptr-update-apply', workflowInputSha, verifyEvidence);
    existingStateAdoption = await authenticateSealedRealmsProductionPtrExistingStateAdoption({
      records: retainedRecords, authority: updateAuthority, store: continuationStore,
    });
  }
  const adoptionOptions = existingStateAdoption === undefined ? {} : { existingStateAdoption };
  const bridgeState = createSealedRealmsProductionAuthBridgeState({
    authority,
    privateState,
    repositoryRoot: process.cwd(),
    bridgeProvider: createSealedRealmsProductionBridgeProvider({
      authority, privateState, repositoryRoot: process.cwd(), fetchImpl: globalThis.fetch,
    }),
    fetchImpl: globalThis.fetch,
    inspectImportReceipt: unavailable,
    authenticateImportResult: unavailable,
    resolveOwnerProvisionReceipt: unavailable,
    ...adoptionOptions,
  });
  // The fixed reader reopens the opaque records and immutable S itself. Missing
  // recovery/provider facts remain an explicit failure, never caller defaults.
  let records;
  if (operation === 'activation-evidence-generate') {
    lifecycle.sourceClosure = await createSealedRealmsProductionRecoverySourceClosure({ privateState, authority });
    lifecycle.programArtifacts = await createSealedRealmsProductionRecoveryProgramArtifacts({ privateState, authority });
    lifecycle.preparation = await createSealedRealmsProductionRecoveryPreparation({ privateState, authority });
    records = createSealedRealmsProductionActivationRecords({ privateState, authority,
      readBindingCandidate: (_source, _projection, readContext) =>
        readSealedRealmsProductionRecoveryCandidate({ records, privateState, authority, bridgeState, readContext, sourceClosure: lifecycle.sourceClosure, programArtifacts: lifecycle.programArtifacts, preparation: lifecycle.preparation }), ...adoptionOptions });
  }
  const lane = createSealedRealmsProductionActivationLane({ bridgeState,
    ...(operation === 'activation-evidence-generate' ? {
      generator: createSealedRealmsProductionActivationEvidenceGenerator({
        records,
        privateState, authority,
        ...adoptionOptions,
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
  const lifecycle = { sourceClosure: undefined, preparation: undefined, programArtifacts: undefined };
  try {
    runtimes.set(runtime, Object.freeze({
      operation,
      workflowInputSha,
      evidence,
      dispatcher: await buildDispatcher(operation, workflowInputSha, evidence, lifecycle),
      sourceClosure: lifecycle.sourceClosure,
      preparation: lifecycle.preparation,
      programArtifacts: lifecycle.programArtifacts,
    }));
    return runtime;
  } catch (error) {
    if (lifecycle.preparation !== undefined) disposeSealedRealmsProductionRecoveryPreparation(lifecycle.preparation);
    if (lifecycle.programArtifacts !== undefined) disposeSealedRealmsProductionRecoveryProgramArtifacts(lifecycle.programArtifacts);
    if (lifecycle.sourceClosure !== undefined) disposeSealedRealmsProductionRecoverySourceClosure(lifecycle.sourceClosure);
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
    if (member.preparation !== undefined) disposeSealedRealmsProductionRecoveryPreparation(member.preparation);
    if (member.programArtifacts !== undefined) disposeSealedRealmsProductionRecoveryProgramArtifacts(member.programArtifacts);
    if (member.sourceClosure !== undefined) disposeSealedRealmsProductionRecoverySourceClosure(member.sourceClosure);
    revokeSealedRealmsProductionWorkflowEvidence(member.evidence);
  }
}
