import { chmodSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  copyLocalBindingBoundedFile,
  readLocalBindingBoundedFile,
} from './local-binding-bounded-file.mjs';

const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';
const IDENTITY_FIELDS = Object.freeze(['dev', 'ino', 'mode', 'uid', 'nlink', 'mtimeNs', 'ctimeNs']);
const CONTAINER_IDENTITY_FIELDS = Object.freeze(['dev', 'ino', 'mode', 'uid']);

function fail(code, cause) {
  const error = new Error(code, cause === undefined ? undefined : { cause });
  error.code = code;
  throw error;
}

function directoryIdentity(state, fields = IDENTITY_FIELDS) {
  return Object.freeze(Object.fromEntries(fields.map(key => [key, String(state[key])])));
}

function verifyDirectory(path, expectedIdentity, fields = IDENTITY_FIELDS) {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
      || (state.mode & 0o777n) !== 0o700n || realpathSync(path) !== path
      || (expectedIdentity !== undefined
        && Object.entries(expectedIdentity).some(([key, value]) => String(state[key]) !== value))) {
    fail('LOCAL_BINDING_RUNTIME_CLI_SNAPSHOT_INVALID');
  }
  return directoryIdentity(state, fields);
}

function verifyExecutable(path, bytes, digest, expectedIdentity) {
  try {
    const record = readLocalBindingBoundedFile(path, {
      maximumBytes: bytes,
      expectedBytes: bytes,
      expectedSha256: digest,
      expectedUid: 1000,
      expectedMode: 0o500,
      expectedIdentity,
      requireExecutable: true,
      rejectWritableExecutable: true,
      discardBody: true,
    });
    return record.identity;
  } catch (error) {
    fail('LOCAL_BINDING_RUNTIME_CLI_SNAPSHOT_INVALID', error);
  }
}

export function bindOperationOwnedCliSnapshot(source, operationRoot) {
  if (source === null || typeof source !== 'object' || typeof source.verify !== 'function'
      || typeof source.path !== 'string' || dirname(source.path) !== source.directory
      || typeof operationRoot !== 'string') {
    fail('LOCAL_BINDING_RUNTIME_CLI_SNAPSHOT_INVALID');
  }
  verifyDirectory(operationRoot);
  const directory = join(operationRoot, 'cli');
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  const operationRecord = verifyDirectory(operationRoot, undefined, CONTAINER_IDENTITY_FIELDS);
  const directoryContainerRecord = verifyDirectory(directory, undefined, CONTAINER_IDENTITY_FIELDS);
  source.verify();
  const path = join(directory, 'spacetimedb-cli');
  const standalonePath = join(directory, 'spacetimedb-standalone');
  copyLocalBindingBoundedFile(source.path, path, {
    maximumBytes: CLI_BYTES,
    expectedBytes: CLI_BYTES,
    expectedSha256: CLI_SHA256,
    expectedMode: 0o500,
    expectedUid: 1000,
    requireExecutable: true,
    rejectWritableExecutable: true,
    destinationMode: 0o500,
  });
  verifyDirectory(operationRoot, operationRecord, CONTAINER_IDENTITY_FIELDS);
  verifyDirectory(directory, directoryContainerRecord, CONTAINER_IDENTITY_FIELDS);
  source.verify();
  copyLocalBindingBoundedFile(join(source.directory, 'spacetimedb-standalone'), standalonePath, {
    maximumBytes: STANDALONE_BYTES,
    expectedBytes: STANDALONE_BYTES,
    expectedSha256: STANDALONE_SHA256,
    expectedMode: 0o500,
    expectedUid: 1000,
    requireExecutable: true,
    rejectWritableExecutable: true,
    destinationMode: 0o500,
  });
  verifyDirectory(operationRoot, operationRecord, CONTAINER_IDENTITY_FIELDS);
  verifyDirectory(directory, directoryContainerRecord, CONTAINER_IDENTITY_FIELDS);
  source.verify();
  const directoryRecord = verifyDirectory(directory);
  const cliIdentity = verifyExecutable(path, CLI_BYTES, CLI_SHA256);
  const standaloneIdentity = verifyExecutable(standalonePath, STANDALONE_BYTES, STANDALONE_SHA256);
  const result = Object.freeze({
    path,
    directory,
    verify() {
      verifyDirectory(operationRoot, operationRecord, CONTAINER_IDENTITY_FIELDS);
      verifyDirectory(directory, directoryRecord);
      verifyExecutable(path, CLI_BYTES, CLI_SHA256, cliIdentity);
      verifyExecutable(standalonePath, STANDALONE_BYTES, STANDALONE_SHA256, standaloneIdentity);
      source.verify();
    },
  });
  result.verify();
  return result;
}
