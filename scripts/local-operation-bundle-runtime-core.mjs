import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, lstatSync, mkdirSync, realpathSync, readdirSync, rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePreparedOperationBundleFiles } from './local-prepared-bundle-files.mjs';
import { getSealedRealmOperationBundleSpecification } from './sealed-realms-production-bundle-engine.mjs';

import {
  copyLocalBindingBoundedFile, readLocalBindingBoundedFile,
} from './local-binding-bounded-file.mjs';
import {
  captureFixedOperationBundleSource,
  deriveOperationBundlePackageSourceGraph,
  preserveLocalBindingRuntimePrimaryAndCleanup,
  runLocalBindingBoundedProcess,
  validateLocalBindingYamlManifest,
} from './local-binding-runtime-core.mjs';

const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const RUNS_ROOT = `${ROOT}/runs`;
const CACHE_ROOT = `${ROOT}/cache/operation-bundles`;
const YAML_ROOT = `${ROOT}/toolchain/yaml-2.9.0/package`;
const MAX_ARTIFACT = 4 * 1024 * 1024;
const MAX_RESULT_OUTPUT = 64 * 1024;
const LANES = Object.freeze(['activation', 'g001', 'g002', 'ptr']);
const LANE_METADATA = Object.freeze({
  activation: Object.freeze({
    basename: 'sealed-realms-production-activation-lane.bundle.mjs',
    exportNames: Object.freeze(['createSealedRealmsProductionActivationWorkflowRuntime', 'runSealedRealmsProductionActivationOperation']),
    factoryExport: 'createSealedRealmsProductionActivationWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
  }),
  g001: Object.freeze({
    basename: 'sealed-realms-production-g001-lane.bundle.mjs',
    exportNames: Object.freeze(['createSealedRealmsProductionG001WorkflowRuntime', 'runSealedRealmsProductionG001Operation']),
    factoryExport: 'createSealedRealmsProductionG001WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID',
  }),
  g002: Object.freeze({
    basename: 'sealed-realms-production-g002-lane.bundle.mjs',
    exportNames: Object.freeze(['createSealedRealmsProductionG002WorkflowRuntime', 'runSealedRealmsProductionG002Operation']),
    factoryExport: 'createSealedRealmsProductionG002WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID',
  }),
  ptr: Object.freeze({
    basename: 'sealed-realms-production-ptr-lane.bundle.mjs',
    exportNames: Object.freeze(['createSealedRealmsProductionPtrWorkflowRuntime', 'runSealedRealmsProductionPtrOperation']),
    factoryExport: 'createSealedRealmsProductionPtrWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID',
  }),
});

export class OperationBundleRuntimeError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'OperationBundleRuntimeError';
    this.code = code;
  }
}
function fail(code, cause) {
  throw new OperationBundleRuntimeError(code, cause === undefined ? undefined : { cause });
}
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function sha256(body) { return createHash('sha256').update(body).digest('hex'); }

function privateDirectory(path) {
  try {
    const state = lstatSync(path, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
        || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
      fail('OPERATION_BUNDLE_RUNTIME_DIRECTORY_INVALID');
    }
  } catch (error) {
    if (error instanceof OperationBundleRuntimeError) throw error;
    fail('OPERATION_BUNDLE_RUNTIME_DIRECTORY_INVALID', error);
  }
}

function cleanEnvironment(operationRoot) {
  const home = join(operationRoot, 'home');
  const temporary = join(operationRoot, 'tmp');
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(temporary, { mode: 0o700 });
  chmodSync(home, 0o700);
  chmodSync(temporary, 0o700);
  privateDirectory(home);
  privateDirectory(temporary);
  return Object.freeze({
    HOME: home, TMPDIR: temporary, PATH: `${dirname(NODE_PATH)}:/usr/bin:/bin`,
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
  });
}

function attestExecutable(path, bytes, digest, uid, expectedIdentity) {
  const opened = readLocalBindingBoundedFile(path, {
    maximumBytes: bytes ?? 64 * 1024 * 1024,
    ...(bytes === undefined ? {} : { expectedBytes: bytes }),
    expectedSha256: digest, expectedUid: uid,
    requireExecutable: true, rejectWritableExecutable: true, discardBody: true,
    ...(expectedIdentity === undefined ? {} : { expectedIdentity }),
  });
  opened.body.fill(0);
  return opened.identity;
}

function validateHost() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== NODE_PATH || process.execArgv.length !== 0
      || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ESBUILD_BINARY_PATH
      || process.env.ESBUILD_WORKER_THREADS) {
    fail('OPERATION_BUNDLE_RUNTIME_HOST_INVALID');
  }
  for (const name of Object.keys(process.env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY)/iu.test(name)) {
      fail('OPERATION_BUNDLE_RUNTIME_HOST_INVALID');
    }
  }
}

function validateGraphManifest(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) return false;
  let previous = '';
  for (const entry of value) {
    if (!exactKeys(entry, ['path', 'byteLength', 'sha256']) || typeof entry.path !== 'string'
        || entry.path <= previous || entry.path.startsWith('/') || entry.path.includes('\\')
        || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0
        || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) return false;
    previous = entry.path;
  }
  return true;
}

export function parseOperationBundleWorkerResult(source, expected) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 64 * 1024 || !source.endsWith('\n')) {
    fail('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { fail('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID'); }
  const failureKeys = ['schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'lane',
    'primaryFailure', 'cleanupFailure'];
  if (value?.profile === 'warpkeep-local-operation-bundle-worker-failure-v1') {
    const failure = part => part === null || (exactKeys(part, ['code'])
      && typeof part.code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(part.code));
    if (!exactKeys(value, failureKeys) || `${JSON.stringify(value)}\n` !== source
        || value.schemaVersion !== 1 || value.nonce !== expected.nonce
        || value.sourceCommit !== expected.sourceCommit || value.sourceTree !== expected.sourceTree
        || value.lane !== expected.lane || !failure(value.primaryFailure)
        || !failure(value.cleanupFailure)
        || (value.primaryFailure === null && value.cleanupFailure === null)) {
      fail('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID');
    }
    const errors = [value.primaryFailure, value.cleanupFailure]
      .filter(part => part !== null)
      .map(part => new OperationBundleRuntimeError(part.code));
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, 'OPERATION_BUNDLE_RUNTIME_WORKER_FAILED', { cause: errors[0] });
  }
  const keys = ['schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'lane',
    'basename', 'bundleBytes', 'byteDigest', 'sourceClosureDigest', 'graphManifest',
    'exportNames', 'factoryExport', 'factoryFailureCode', 'handoffPath'];
  const spec = LANE_METADATA[expected?.lane];
  if (!exactKeys(value, keys) || `${JSON.stringify(value)}\n` !== source || spec === undefined
      || value.schemaVersion !== 1 || value.profile !== 'warpkeep-local-operation-bundle-worker-result-v1'
      || value.nonce !== expected.nonce || value.sourceCommit !== expected.sourceCommit
      || value.sourceTree !== expected.sourceTree || value.lane !== expected.lane
      || value.basename !== spec.basename || value.handoffPath !== expected.handoffPath
      || !Number.isSafeInteger(value.bundleBytes) || value.bundleBytes < 1 || value.bundleBytes > MAX_ARTIFACT
      || !/^[0-9a-f]{64}$/u.test(value.byteDigest ?? '')
      || (expected.byteDigest !== undefined && value.byteDigest !== expected.byteDigest)
      || !/^[0-9a-f]{64}$/u.test(value.sourceClosureDigest ?? '')
      || !validateGraphManifest(value.graphManifest)
      || JSON.stringify(value.exportNames) !== JSON.stringify(spec.exportNames)
      || value.factoryExport !== spec.factoryExport
      || value.factoryFailureCode !== spec.factoryFailureCode) {
    fail('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID');
  }
  return value;
}

export function parseOperationBundleLoadResult(source, expected) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 64 * 1024 || !source.endsWith('\n')) {
    fail('OPERATION_BUNDLE_RUNTIME_LOAD_RESULT_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { fail('OPERATION_BUNDLE_RUNTIME_LOAD_RESULT_INVALID'); }
  const keys = ['schemaVersion', 'profile', 'nonce', 'byteDigest', 'exportNames', 'factoryFailureCode'];
  if (!exactKeys(value, keys) || `${JSON.stringify(value)}\n` !== source || value.schemaVersion !== 1
      || value.profile !== 'warpkeep-linux-operation-bundle-load-v1'
      || value.nonce !== expected.nonce || value.byteDigest !== expected.byteDigest
      || JSON.stringify(value.exportNames) !== JSON.stringify([...expected.exportNames].sort())
      || value.factoryFailureCode !== expected.factoryFailureCode) {
    fail('OPERATION_BUNDLE_RUNTIME_LOAD_RESULT_INVALID');
  }
  return value;
}

export function parseOperationBundleCliMetadata(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_RESULT_OUTPUT
      || !source.endsWith('\n')) fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
  let value;
  try { value = JSON.parse(source); } catch (error) {
    fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID', error);
  }
  const topKeys = ['profile', 'sourceCommit', 'sourceTree', 'bundles'];
  if (`${JSON.stringify(value)}\n` !== source || !exactKeys(value, topKeys)
      || value.profile !== PROFILE || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '') || !Array.isArray(value.bundles)
      || value.bundles.length !== LANES.length) {
    fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
  }
  const bundleKeys = ['lane', 'basename', 'bundleBytes', 'byteDigest', 'sourceClosureDigest',
    'graphCount', 'exportCount', 'load'];
  const loadKeys = ['profile', 'byteDigest', 'exportNames', 'factoryFailureCode'];
  const bundles = value.bundles.map((bundle, index) => {
    const lane = LANES[index];
    const spec = LANE_METADATA[lane];
    const load = bundle?.load;
    if (!exactKeys(bundle, bundleKeys) || bundle.lane !== lane || bundle.basename !== spec.basename
        || !Number.isSafeInteger(bundle.bundleBytes) || bundle.bundleBytes < 1
        || bundle.bundleBytes > MAX_ARTIFACT
        || !/^[0-9a-f]{64}$/u.test(bundle.byteDigest ?? '')
        || !/^[0-9a-f]{64}$/u.test(bundle.sourceClosureDigest ?? '')
        || !Number.isSafeInteger(bundle.graphCount) || bundle.graphCount < 1 || bundle.graphCount > 256
        || bundle.exportCount !== 2 || !exactKeys(load, loadKeys)
        || load.profile !== 'warpkeep-linux-operation-bundle-load-v1'
        || load.byteDigest !== bundle.byteDigest
        || JSON.stringify(load.exportNames) !== JSON.stringify([...spec.exportNames].sort())
        || load.factoryFailureCode !== spec.factoryFailureCode) {
      fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
    }
    return Object.freeze({
      lane, basename: spec.basename, bundleBytes: bundle.bundleBytes,
      byteDigest: bundle.byteDigest, sourceClosureDigest: bundle.sourceClosureDigest,
      graphCount: bundle.graphCount, exportCount: bundle.exportCount,
      load: Object.freeze({
        profile: 'warpkeep-linux-operation-bundle-load-v1',
        byteDigest: load.byteDigest,
        exportNames: Object.freeze([...load.exportNames]),
        factoryFailureCode: load.factoryFailureCode,
      }),
    });
  });
  return Object.freeze({
    profile: PROFILE, sourceCommit: value.sourceCommit, sourceTree: value.sourceTree,
    bundles: Object.freeze(bundles),
  });
}

export function assertReproducibleOperationBundleCycles(left, right) {
  const comparable = value => ({
    sourceCommit: value.sourceCommit, sourceTree: value.sourceTree, lane: value.lane,
    basename: value.basename, bundleBytes: value.bundleBytes, byteDigest: value.byteDigest,
    sourceClosureDigest: value.sourceClosureDigest, graphManifest: value.graphManifest,
    exportNames: value.exportNames, factoryExport: value.factoryExport,
    factoryFailureCode: value.factoryFailureCode,
  });
  if (!Buffer.from(left.bytes ?? []).equals(Buffer.from(right.bytes ?? []))
      || JSON.stringify(comparable(left)) !== JSON.stringify(comparable(right))) {
    fail('OPERATION_BUNDLE_RUNTIME_REPRODUCIBILITY_FAILED');
  }
  return left;
}

export function verifyOperationBundleMaterializedGraph(root, manifest) {
  if (!validateGraphManifest(manifest)) fail('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED');
  for (const entry of manifest) {
    if (entry.path.startsWith('node_modules/')) continue;
    try {
      const opened = readLocalBindingBoundedFile(join(root, ...entry.path.split('/')), {
        maximumBytes: Math.max(entry.byteLength, 1), expectedBytes: entry.byteLength,
        expectedSha256: entry.sha256,
        expectedUid: process.platform === 'win32' ? undefined : 1000,
      });
      opened.body.fill(0);
    } catch (error) { fail('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED', error); }
  }
}

function readYaml(source) {
  const opened = readLocalBindingBoundedFile(join(source.root,
    'scripts', 'local-binding-runtime-yaml-v1.json'), {
    maximumBytes: 1024 * 1024, minimumBytes: 1, expectedUid: 1000,
  });
  try {
    const manifest = validateLocalBindingYamlManifest(opened.body.toString('utf8'));
    return Object.freeze({ root: YAML_ROOT, entry: manifest.entry, files: manifest.files });
  } finally { opened.body.fill(0); }
}

async function loadArtifact(context, cycleRoot, worker) {
  const loadRoot = join(cycleRoot, 'load');
  mkdirSync(loadRoot, { mode: 0o700 });
  chmodSync(loadRoot, 0o700);
  privateDirectory(loadRoot);
  const artifactPath = join(loadRoot, worker.basename);
  copyLocalBindingBoundedFile(worker.handoffPath, artifactPath, {
    maximumBytes: MAX_ARTIFACT, expectedBytes: worker.bundleBytes,
    expectedSha256: worker.byteDigest, expectedMode: 0o400, expectedUid: 1000,
    destinationMode: 0o400,
  });
  const request = Object.freeze({
    schemaVersion: 1, profile: 'warpkeep-local-operation-bundle-load-request-v1',
    nonce: context.nonce, artifactPath, byteDigest: worker.byteDigest,
    exportNames: worker.exportNames, factoryExport: worker.factoryExport,
    factoryFailureCode: worker.factoryFailureCode,
  });
  const result = await runLocalBindingBoundedProcess(NODE_PATH,
    [join(context.source.root, 'scripts', 'local-operation-bundle-load.mjs')], {
      cwd: loadRoot, env: context.environment, fd3: `${JSON.stringify(request)}\n`,
      timeout: 30_000, maxOutput: MAX_RESULT_OUTPUT, containProcessGroup: true,
    });
  if (result.stderr !== '') fail('OPERATION_BUNDLE_RUNTIME_LOAD_FAILED');
  return parseOperationBundleLoadResult(result.stdout, request);
}

async function executeCycle(context, lane, cycle) {
  const cycleRoot = join(context.operationRoot, `${lane}-${cycle}`);
  mkdirSync(cycleRoot, { mode: 0o700 });
  chmodSync(cycleRoot, 0o700);
  privateDirectory(cycleRoot);
  const materializationRoot = join(cycleRoot, 'source');
  const materialized = context.source.materialize(materializationRoot);
  if (materialized.commit !== context.source.commit || materialized.tree !== context.source.tree) {
    fail('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED');
  }
  context.source.verify();
  const handoffPath = join(cycleRoot, 'artifact.mjs');
  const request = Object.freeze({
    schemaVersion: 1, profile: 'warpkeep-local-operation-bundle-worker-v1',
    nonce: context.nonce, sourceCommit: context.source.commit, sourceTree: context.source.tree,
    lane, sourceRoot: context.source.root, materializationRoot, cacheRoot: CACHE_ROOT,
    handoffPath, controls: context.source.bootstrap, packageGraph: context.packageGraph,
    yaml: context.yaml,
  });
  const encoded = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(encoded) > 1024 * 1024) fail('OPERATION_BUNDLE_RUNTIME_WORKER_REQUEST_INVALID');
  const result = await runLocalBindingBoundedProcess(NODE_PATH,
    ['--no-warnings', join(context.source.root, 'scripts', 'local-operation-bundle-worker.mjs')], {
      cwd: cycleRoot, env: context.environment, fd3: encoded,
      timeout: 5 * 60_000, maxOutput: MAX_RESULT_OUTPUT, containProcessGroup: true,
    });
  if (result.stderr !== '') fail('OPERATION_BUNDLE_RUNTIME_WORKER_FAILED');
  const worker = parseOperationBundleWorkerResult(result.stdout, {
    nonce: context.nonce, lane, sourceCommit: context.source.commit,
    sourceTree: context.source.tree, handoffPath,
  });
  context.source.verifyMaterialization(materializationRoot);
  verifyOperationBundleMaterializedGraph(materializationRoot, worker.graphManifest);
  const opened = readLocalBindingBoundedFile(handoffPath, {
    maximumBytes: MAX_ARTIFACT, minimumBytes: 1, expectedBytes: worker.bundleBytes,
    expectedSha256: worker.byteDigest, expectedMode: 0o400, expectedUid: 1000,
  });
  const bytes = new Uint8Array(opened.body);
  opened.body.fill(0);
  const load = await loadArtifact(context, cycleRoot, worker);
  context.source.verify();
  return Object.freeze({ ...worker, bytes, load });
}

function copyBundle(cycle) {
  return Object.freeze({
    lane: cycle.lane, basename: cycle.basename, bytes: new Uint8Array(cycle.bytes),
    byteDigest: cycle.byteDigest, sourceClosureDigest: cycle.sourceClosureDigest,
    graphManifest: Object.freeze(cycle.graphManifest.map(entry => Object.freeze({ ...entry }))),
    exportNames: Object.freeze([...cycle.exportNames]), factoryExport: cycle.factoryExport,
    factoryFailureCode: cycle.factoryFailureCode,
    load: Object.freeze({
      profile: cycle.load.profile, byteDigest: cycle.load.byteDigest,
      exportNames: Object.freeze([...cycle.load.exportNames]),
      factoryFailureCode: cycle.load.factoryFailureCode,
    }),
  });
}

function composeCapturedBundleFiles(source, bundles) {
  const entryDeclarations = new Map();
  try {
    source.verify();
    for (const lane of LANES) {
      const path = getSealedRealmOperationBundleSpecification(lane).entryPath.replace(/\.mjs$/u, '.d.mts');
      const record = source.gitBuffer(source.root, ['ls-tree', '-z', source.tree, '--', path], 4096);
      const text = record.toString('utf8');
      const match = /^100644 blob ([0-9a-f]{40})\t([^\0]+)\0$/u.exec(text);
      if (!match || match[2] !== path || !Buffer.from(text).equals(record)) {
        fail('OPERATION_BUNDLE_RUNTIME_DECLARATION_INVALID');
      }
      const body = source.gitBuffer(source.root, ['cat-file', 'blob', match[1]], 64 * 1024);
      entryDeclarations.set(path, body);
      if (body.length < 1 || body.length > 64 * 1024) {
        fail('OPERATION_BUNDLE_RUNTIME_DECLARATION_INVALID');
      }
    }
    source.verify();
    return derivePreparedOperationBundleFiles({ bundles, entryDeclarations });
  } finally {
    for (const body of entryDeclarations.values()) body.fill(0);
  }
}

export async function derivePreparedLinuxOperationBundlesCore() {
  return deriveOperationResult(false);
}

export async function derivePreparedLinuxOperationBundleFilesCore() {
  return deriveOperationResult(true);
}

async function deriveOperationResult(includeFiles) {
  validateHost();
  for (const path of [ROOT, join(ROOT, 'toolchain'), dirname(dirname(NODE_PATH)), dirname(NODE_PATH),
    join(ROOT, 'cache'), CACHE_ROOT, RUNS_ROOT]) privateDirectory(path);
  const nodeIdentity = attestExecutable(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000);
  const gitIdentity = attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0);
  const nonce = randomBytes(16).toString('hex');
  const operationRoot = join(RUNS_ROOT, `operation-bundle-${nonce}`);
  mkdirSync(operationRoot, { mode: 0o700 });
  chmodSync(operationRoot, 0o700);
  privateDirectory(operationRoot);
  const environment = cleanEnvironment(operationRoot);
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let source;
  let finalResult;
  let primaryError;
  try {
    source = captureFixedOperationBundleSource({
      repositoryRoot, operationRoot, environment, gitIdentity,
    });
    source.verify();
    const packageGraph = deriveOperationBundlePackageSourceGraph(source.root);
    source.verify();
    const yaml = readYaml(source);
    const context = Object.freeze({ nonce, operationRoot, environment, source, packageGraph, yaml });
    const bundles = [];
    for (const lane of LANES) {
      const first = await executeCycle(context, lane, 1);
      const second = await executeCycle(context, lane, 2);
      bundles.push(copyBundle(assertReproducibleOperationBundleCycles(first, second)));
    }
    source.verify();
    attestExecutable(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, nodeIdentity);
    attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0, gitIdentity);
    if (JSON.stringify(readdirSync(CACHE_ROOT).sort()) !== JSON.stringify(['_cacache'])) {
      fail('OPERATION_BUNDLE_RUNTIME_CACHE_INVALID');
    }
    finalResult = Object.freeze({
      profile: PROFILE, sourceCommit: source.commit, sourceTree: source.tree,
      bundles: Object.freeze(bundles),
    });
    if (includeFiles) finalResult = composeCapturedBundleFiles(source, finalResult);
    source.verify();
  } catch (error) { primaryError = error; }
  let cleanupError;
  if (primaryError === undefined) {
    try {
      privateDirectory(operationRoot);
      rmSync(operationRoot, { recursive: true, force: false });
    } catch (error) { cleanupError = error; }
  }
  preserveLocalBindingRuntimePrimaryAndCleanup(primaryError, cleanupError);
  if (nodeIdentity === undefined) fail('OPERATION_BUNDLE_RUNTIME_HOST_INVALID');
  return finalResult;
}
