import { createHash } from 'node:crypto';
import { readSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const PROFILE = 'warpkeep-linux-operation-bundle-load-v1';
const MAX_REQUEST = 64 * 1024;
const MAX_ARTIFACT = 4 * 1024 * 1024;

function fail(code, cause) {
  throw new Error(code, cause === undefined ? undefined : { cause });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function readRequest() {
  const chunks = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_REQUEST + 1 - total));
    const count = readSync(3, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > MAX_REQUEST) fail('OPERATION_BUNDLE_LOAD_REQUEST_INVALID');
    chunks.push(chunk.subarray(0, count));
  }
  const source = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(source); } catch (error) {
    fail('OPERATION_BUNDLE_LOAD_REQUEST_INVALID', error);
  }
  const keys = ['schemaVersion', 'profile', 'nonce', 'artifactPath', 'byteDigest',
    'exportNames', 'factoryExport', 'factoryFailureCode'];
  const cwd = process.cwd();
  const difference = relative(cwd, value?.artifactPath ?? '');
  if (!source.endsWith('\n') || `${JSON.stringify(value)}\n` !== source
      || !exactKeys(value, keys) || value.schemaVersion !== 1
      || value.profile !== 'warpkeep-local-operation-bundle-load-request-v1'
      || !/^[0-9a-f]{32}$/u.test(value.nonce ?? '')
      || !isAbsolute(value.artifactPath ?? '') || difference === '' || difference === '..'
      || difference.startsWith(`..${sep}`) || isAbsolute(difference)
      || !/^[0-9a-f]{64}$/u.test(value.byteDigest ?? '')
      || !Array.isArray(value.exportNames) || value.exportNames.length !== 2
      || value.exportNames.some(name => typeof name !== 'string')
      || typeof value.factoryExport !== 'string' || !value.exportNames.includes(value.factoryExport)
      || typeof value.factoryFailureCode !== 'string') {
    fail('OPERATION_BUNDLE_LOAD_REQUEST_INVALID');
  }
  return value;
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ESBUILD_BINARY_PATH
      || process.env.ESBUILD_WORKER_THREADS || process.execArgv.length !== 0) {
    fail('OPERATION_BUNDLE_LOAD_HOST_INVALID');
  }
  const request = readRequest();
  const opened = readLocalBindingBoundedFile(request.artifactPath, {
    maximumBytes: MAX_ARTIFACT, minimumBytes: 1, expectedSha256: request.byteDigest,
    expectedMode: 0o400, expectedUid: 1000,
  });
  opened.body.fill(0);
  const loaded = await import(pathToFileURL(request.artifactPath).href);
  const exportNames = Object.keys(loaded).sort();
  if (JSON.stringify(exportNames) !== JSON.stringify([...request.exportNames].sort())
      || typeof loaded[request.factoryExport] !== 'function') {
    fail('OPERATION_BUNDLE_LOAD_EXPORTS_INVALID');
  }
  let failure;
  try { await loaded[request.factoryExport]({}); } catch (error) { failure = error; }
  if (failure === undefined
      || (failure?.code !== request.factoryFailureCode && failure?.message !== request.factoryFailureCode)) {
    fail('OPERATION_BUNDLE_LOAD_FACTORY_INVALID', failure);
  }
  const after = readLocalBindingBoundedFile(request.artifactPath, {
    maximumBytes: MAX_ARTIFACT, minimumBytes: 1, expectedSha256: request.byteDigest,
    expectedMode: 0o400, expectedUid: 1000,
  });
  if (createHash('sha256').update(after.body).digest('hex') !== request.byteDigest) {
    fail('OPERATION_BUNDLE_LOAD_ARTIFACT_CHANGED');
  }
  after.body.fill(0);
  return Object.freeze({
    schemaVersion: 1, profile: PROFILE, nonce: request.nonce,
    byteDigest: request.byteDigest,
    exportNames: Object.freeze(exportNames),
    factoryFailureCode: request.factoryFailureCode,
  });
}

main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
  process.stderr.write(`${error?.message ?? 'OPERATION_BUNDLE_LOAD_FAILED'}\n`);
  process.exitCode = 1;
});
