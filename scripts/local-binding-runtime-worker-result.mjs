import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import {
  copyLocalBindingBoundedFile,
  readLocalBindingBoundedFile,
} from './local-binding-bounded-file.mjs';

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

function writeCheckedLocalBindingHandoff(input) {
  const handoff = resolve(input.handoffPath);
  if (dirname(handoff) !== resolve(input.handoffRoot)) fail('LOCAL_BINDING_WORKER_HANDOFF_INVALID');
  const source = readExactRegular(input.bundlePath);
  const sha256 = createHash('sha256').update(source).digest('hex');
  let copied;
  let installed;
  try {
    copied = copyLocalBindingBoundedFile(input.bundlePath, handoff, {
      maximumBytes: MAX_BUNDLE_BYTES,
      expectedBytes: source.byteLength,
      expectedSha256: sha256,
      destinationMode: 0o600,
      expectedUid: process.platform === 'win32' ? undefined : 1000,
    });
    installed = readLocalBindingBoundedFile(handoff, {
      maximumBytes: MAX_BUNDLE_BYTES,
      expectedBytes: copied.bytes,
      expectedSha256: copied.sha256,
      expectedMode: process.platform === 'win32' ? undefined : 0o600,
      expectedUid: process.platform === 'win32' ? undefined : 1000,
      expectedIdentity: copied.identity,
    });
  } catch (error) {
    source.fill(0);
    installed?.body.fill(0);
    return fail('LOCAL_BINDING_WORKER_HANDOFF_INVALID', error);
  }
  source.fill(0);
  return Object.freeze({
    path: handoff, sha256: copied.sha256, byteLength: copied.bytes,
    identity: copied.identity, body: installed.body,
  });
}

export function preserveLocalBindingWorkerBundle(input) {
  const checked = writeCheckedLocalBindingHandoff(input);
  const bytes = new Uint8Array(checked.body);
  checked.body.fill(0);
  return Object.freeze({
    path: checked.path, sha256: checked.sha256, byteLength: checked.byteLength,
    identity: checked.identity, bytes,
  });
}

export function createLocalBindingWorkerResult(input) {
  const checked = writeCheckedLocalBindingHandoff(input);
  checked.body.fill(0);
  return Object.freeze({
    schemaVersion: 1,
    profile: input.requestProfile === 'warpkeep-local-binding-genesis002-worker-v1'
      ? 'warpkeep-local-binding-genesis002-worker-result-v1'
      : input.requestProfile === 'warpkeep-local-binding-genesis001-worker-v1'
        ? 'warpkeep-local-binding-genesis001-worker-result-v1'
      : input.requestProfile === 'warpkeep-local-binding-worker-v1'
        ? 'warpkeep-local-binding-worker-result-v1'
        : fail('LOCAL_BINDING_WORKER_RESULT_INVALID'),
    nonce: input.nonce,
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    moduleTreeId: input.moduleTreeId,
    dependencyClosureDigest: input.dependencyClosureDigest,
    bundleSha256: checked.sha256,
    bundleBytes: checked.byteLength,
    handoffPath: checked.path,
  });
}
