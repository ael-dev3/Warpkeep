import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

function fail(code, cause) {
  throw new Error(code, cause === undefined ? undefined : { cause });
}

function readExactRegular(path) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(MAX_BUNDLE_BYTES)) {
    fail('LOCAL_BINDING_WORKER_BUNDLE_INVALID');
  }
  let descriptor;
  let body;
  let primary;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode
        || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs || opened.ctimeNs !== before.ctimeNs) {
      fail('LOCAL_BINDING_WORKER_BUNDLE_CHANGED');
    }
    body = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.mode !== opened.mode
        || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs
        || body.length !== Number(after.size)) fail('LOCAL_BINDING_WORKER_BUNDLE_CHANGED');
  } catch (error) { primary = error; }
  let closeError;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeError = error; }
  if (primary !== undefined || closeError !== undefined) {
    if (primary !== undefined && closeError === undefined) throw primary;
    throw new AggregateError([primary, closeError].filter(Boolean), 'LOCAL_BINDING_WORKER_BUNDLE_READ_FAILED', {
      cause: primary,
    });
  }
  return body;
}

export function createLocalBindingWorkerResult(input) {
  const source = readExactRegular(input.bundlePath);
  const handoff = resolve(input.handoffPath);
  if (dirname(handoff) !== resolve(input.handoffRoot)) fail('LOCAL_BINDING_WORKER_HANDOFF_INVALID');
  let descriptor;
  let primary;
  try {
    descriptor = openSync(handoff, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    let offset = 0;
    while (offset < source.length) offset += writeSync(descriptor, source, offset, source.length - offset);
  } catch (error) {
    primary = error;
  }
  let closeError;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeError = error; }
  if (primary !== undefined || closeError !== undefined) {
    source.fill(0);
    if (primary !== undefined && closeError === undefined) fail('LOCAL_BINDING_WORKER_HANDOFF_INVALID', primary);
    throw new AggregateError([primary, closeError].filter(Boolean), 'LOCAL_BINDING_WORKER_HANDOFF_INVALID', {
      cause: primary,
    });
  }
  const bundleSha256 = createHash('sha256').update(source).digest('hex');
  source.fill(0);
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-local-binding-worker-result-v1',
    nonce: input.nonce,
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    moduleTreeId: input.moduleTreeId,
    dependencyClosureDigest: input.dependencyClosureDigest,
    bundleSha256,
    bundleBytes: Number(lstatSync(handoff, { bigint: true }).size),
    handoffPath: handoff,
  });
}
