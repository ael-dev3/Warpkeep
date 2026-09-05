import { createHash } from 'node:crypto';
import { closeSync, constants, lstatSync, openSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

function fail(code, cause) {
  throw new Error(code, cause === undefined ? undefined : { cause });
}

function readExactRegular(path) {
  try {
    return readLocalBindingBoundedFile(path, {
      maximumBytes: MAX_BUNDLE_BYTES,
      minimumBytes: 1,
    }).body;
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_BOUNDED_FILE_INVALID') fail('LOCAL_BINDING_WORKER_BUNDLE_INVALID', error);
    if (error?.code === 'LOCAL_BINDING_BOUNDED_FILE_CHANGED') fail('LOCAL_BINDING_WORKER_BUNDLE_CHANGED', error);
    throw error;
  }
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
