import { createHash } from 'node:crypto';
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, openSync, readSync, writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';
import { verifyLocalBindingBootstrapSource } from './local-binding-runtime-core.mjs';

const NODE_PATH = '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node';
const RUNS_ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1/runs';
const MAX_REQUEST = 1024 * 1024;
const MAX_ARTIFACT = 4 * 1024 * 1024;
const LANES = new Set(['activation', 'g001', 'g002', 'ptr']);
let acceptedRequest;

function fail(code, cause) { throw new Error(code, cause === undefined ? undefined : { cause }); }
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function inside(parent, child) {
  const difference = relative(parent, child);
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference));
}

function failureCode(error, fallback) {
  for (const candidate of [error?.code, error?.message]) {
    if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(candidate)) return candidate;
  }
  return fallback;
}

function failureRecord(request, primaryError, cleanupError) {
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-local-operation-bundle-worker-failure-v1',
    nonce: request.nonce,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    lane: request.lane,
    primaryFailure: primaryError === undefined ? null
      : Object.freeze({ code: failureCode(primaryError, 'OPERATION_BUNDLE_WORKER_FAILED') }),
    cleanupFailure: cleanupError === undefined ? null
      : Object.freeze({ code: failureCode(cleanupError, 'OPERATION_BUNDLE_WORKER_CLEANUP_FAILED') }),
  });
}

function readRequest() {
  const chunks = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_REQUEST + 1 - total));
    const count = readSync(3, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > MAX_REQUEST) fail('OPERATION_BUNDLE_WORKER_REQUEST_INVALID');
    chunks.push(chunk.subarray(0, count));
  }
  const source = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(source); } catch (error) {
    fail('OPERATION_BUNDLE_WORKER_REQUEST_INVALID', error);
  }
  const keys = ['schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'lane',
    'sourceRoot', 'materializationRoot', 'cacheRoot', 'handoffPath', 'controls', 'packageGraph', 'yaml'];
  const operationRoot = typeof value?.sourceRoot === 'string' ? dirname(value.sourceRoot) : '';
  const operationName = relative(RUNS_ROOT, operationRoot);
  const cycleRoot = typeof value?.materializationRoot === 'string' ? dirname(value.materializationRoot) : '';
  if (!source.endsWith('\n') || `${JSON.stringify(value)}\n` !== source || !exactKeys(value, keys)
      || value.schemaVersion !== 1 || value.profile !== 'warpkeep-local-operation-bundle-worker-v1'
      || !/^[0-9a-f]{32}$/u.test(value.nonce ?? '') || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '') || !LANES.has(value.lane)
      || !isAbsolute(value.sourceRoot ?? '') || !inside(RUNS_ROOT, value.sourceRoot)
      || !/^operation-bundle-[0-9a-f]{32}$/u.test(operationName)
      || value.packageGraph?.root !== value.sourceRoot
      || value.packageGraph?.entry !== 'scripts/local-operation-bundle-packages.ts'
      || !Array.isArray(value.packageGraph?.modules) || value.packageGraph.modules.length === 0
      || value.yaml?.root !== '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/yaml-2.9.0/package'
      || value.yaml?.entry !== 'dist/index.js' || !Array.isArray(value.yaml?.files)
      || !Array.isArray(value.controls) || value.controls.length === 0
      || !isAbsolute(value.materializationRoot ?? '') || !inside(operationRoot, value.materializationRoot)
      || !new RegExp(`^${value.lane}-[12]$`, 'u').test(relative(operationRoot, cycleRoot))
      || relative(cycleRoot, value.materializationRoot) !== 'source'
      || value.cacheRoot !== '/home/warpkeep/.warpkeep/release-preparation-v1/cache/operation-bundles'
      || value.handoffPath !== join(cycleRoot, 'artifact.mjs')) {
    fail('OPERATION_BUNDLE_WORKER_REQUEST_INVALID');
  }
  return value;
}

function writeArtifact(path, body) {
  if (body.byteLength < 1 || body.byteLength > MAX_ARTIFACT) fail('OPERATION_BUNDLE_WORKER_ARTIFACT_INVALID');
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o400);
    let offset = 0;
    while (offset < body.byteLength) {
      const count = writeSync(descriptor, body, offset, body.byteLength - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0) fail('OPERATION_BUNDLE_WORKER_ARTIFACT_INVALID');
      offset += count;
    }
    fchmodSync(descriptor, 0o400);
    fsyncSync(descriptor);
    const state = fstatSync(descriptor, { bigint: true });
    if (!state.isFile() || state.nlink !== 1n || state.uid !== 1000n
        || (state.mode & 0o777n) !== 0o400n || state.size !== BigInt(body.byteLength)) {
      fail('OPERATION_BUNDLE_WORKER_ARTIFACT_INVALID');
    }
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== NODE_PATH
      || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ESBUILD_BINARY_PATH
      || JSON.stringify(process.execArgv) !== JSON.stringify(['--no-warnings'])
      || process.env.ESBUILD_WORKER_THREADS) fail('OPERATION_BUNDLE_WORKER_HOST_INVALID');
  const request = readRequest();
  acceptedRequest = request;
  const source = Object.freeze({ root: request.sourceRoot, bootstrap: request.controls });
  verifyLocalBindingBootstrapSource(source);
  installLocalBindingNativeTsHooks(request.packageGraph, request.yaml);
  const packages = await import('warpkeep:operation-bundle-packages');
  verifyLocalBindingBootstrapSource(source);
  const namespace = packages.materializeFixedOperationBundlePackages({
    sourceRoot: request.materializationRoot,
    cacheRoot: request.cacheRoot,
    yamlRoot: request.yaml.root,
    yamlManifest: request.yaml,
  });
  let esbuild;
  let artifact;
  let primaryError;
  try {
    esbuild = await import(pathToFileURL(namespace.esbuildEntry).href);
    const engine = await import(pathToFileURL(join(request.sourceRoot,
      'scripts', 'sealed-realms-production-bundle-engine.mjs')).href);
    verifyLocalBindingBootstrapSource(source);
    artifact = await engine.buildSealedRealmOperationBundle({
      lane: request.lane, sourceRoot: request.materializationRoot, build: esbuild.build,
    });
  } catch (error) { primaryError = error; }
  let cleanupError;
  try { esbuild?.stop(); } catch (error) { cleanupError = error; }
  try { packages.reattestFixedOperationBundlePackages({
    sourceRoot: request.materializationRoot, ...namespace,
  }); } catch (error) { cleanupError ??= error; }
  if (primaryError !== undefined || cleanupError !== undefined) {
    return failureRecord(request, primaryError, cleanupError);
  }
  verifyLocalBindingBootstrapSource(source);
  writeArtifact(request.handoffPath, artifact.bytes);
  const opened = readLocalBindingBoundedFile(request.handoffPath, {
    maximumBytes: MAX_ARTIFACT, expectedBytes: artifact.bytes.byteLength,
    expectedSha256: artifact.byteDigest, expectedMode: 0o400, expectedUid: 1000,
  });
  opened.body.fill(0);
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-local-operation-bundle-worker-result-v1',
    nonce: request.nonce,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    lane: artifact.lane,
    basename: artifact.basename,
    bundleBytes: artifact.bytes.byteLength,
    byteDigest: artifact.byteDigest,
    sourceClosureDigest: artifact.sourceClosureDigest,
    graphManifest: artifact.graphManifest,
    exportNames: artifact.exportNames,
    factoryExport: artifact.factoryExport,
    factoryFailureCode: artifact.factoryFailureCode,
    handoffPath: request.handoffPath,
  });
}

main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
  if (acceptedRequest !== undefined) {
    process.stdout.write(`${JSON.stringify(failureRecord(acceptedRequest, error, undefined))}\n`);
  } else {
    process.stderr.write('OPERATION_BUNDLE_WORKER_FAILED\n');
    process.exitCode = 1;
  }
});
