import { strict as assert } from 'node:assert';
import { constants } from 'node:fs';
import { mock } from 'node:test';

const scenario = process.argv[2];
const state = {
  dev: 1n, ino: 2n, mode: 0o100600n, uid: 1000n, nlink: 1n,
  size: 2n, mtimeNs: 3n, ctimeNs: 4n,
  isFile: () => true, isSymbolicLink: () => false,
};
if (scenario === 'writable-executable') state.mode = 0o100755n | 0o022n;
const primary = new Error('primary read failure');
const close = new Error('close failure');
let readCalls = 0;

mock.module('node:fs', { namedExports: {
  constants,
  lstatSync: () => state,
  realpathSync: path => path,
  openSync: () => 7,
  fstatSync: () => state,
  readSync: (_fd, buffer) => {
    readCalls += 1;
    if (scenario === 'combined') throw primary;
    if (scenario === 'digest') {
      if (readCalls > 1) return 0;
      buffer.set(Uint8Array.of(1, 2));
      return 2;
    }
    buffer.set(Uint8Array.of(1, 2, 3));
    return 3;
  },
  closeSync: () => {
    if (scenario === 'combined') throw close;
  },
} });

const { readLocalBindingBoundedFile } = await import('../../scripts/local-binding-bounded-file.mjs');
let error;
try {
  readLocalBindingBoundedFile('/fixed/file', {
    maximumBytes: 4,
    requireExecutable: scenario === 'writable-executable',
    rejectWritableExecutable: scenario === 'writable-executable',
    expectedSha256: scenario === 'digest' ? '0'.repeat(64) : undefined,
  });
} catch (caught) {
  error = caught;
}
assert(error);
if (scenario === 'growth') {
  assert.equal(error.code, 'LOCAL_BINDING_BOUNDED_FILE_CHANGED');
  process.stdout.write('{"code":"LOCAL_BINDING_BOUNDED_FILE_CHANGED"}\n');
} else if (scenario === 'combined') {
  assert(error instanceof AggregateError);
  assert.deepEqual(error.errors, [primary, close]);
  assert.equal(error.cause, primary);
  process.stdout.write('{"primary":"primary read failure","close":"close failure"}\n');
} else if (scenario === 'writable-executable') {
  assert.equal(error.code, 'LOCAL_BINDING_BOUNDED_FILE_INVALID');
  process.stdout.write('{"code":"LOCAL_BINDING_BOUNDED_FILE_INVALID"}\n');
} else if (scenario === 'digest') {
  assert.equal(error.code, 'LOCAL_BINDING_BOUNDED_FILE_CHANGED');
  process.stdout.write('{"code":"LOCAL_BINDING_BOUNDED_FILE_CHANGED"}\n');
} else {
  throw new Error('unknown scenario');
}
