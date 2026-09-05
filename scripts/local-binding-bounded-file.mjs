import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';

const IDENTITY_FIELDS = Object.freeze([
  'dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs',
]);

export class LocalBindingBoundedFileError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'LocalBindingBoundedFileError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new LocalBindingBoundedFileError(code, cause === undefined ? undefined : { cause });
}

function identity(state) {
  return Object.freeze(Object.fromEntries(IDENTITY_FIELDS.map(key => [key, String(state[key])])));
}

function sameIdentity(left, right) {
  return IDENTITY_FIELDS.every(key => String(left[key]) === String(right[key]));
}

function exactExpectedIdentity(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...IDENTITY_FIELDS].sort())
    && IDENTITY_FIELDS.every(key => /^[0-9]+$/u.test(value[key]));
}

export function readLocalBindingBoundedFile(path, options) {
  if (typeof path !== 'string' || path.length === 0 || options === null || typeof options !== 'object'
      || !Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1
      || (options.minimumBytes !== undefined
        && (!Number.isSafeInteger(options.minimumBytes) || options.minimumBytes < 0
          || options.minimumBytes > options.maximumBytes))
      || (options.expectedBytes !== undefined
        && (!Number.isSafeInteger(options.expectedBytes) || options.expectedBytes < 0
          || options.expectedBytes > options.maximumBytes))
      || (options.expectedSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(options.expectedSha256))
      || (options.expectedMode !== undefined && !Number.isSafeInteger(options.expectedMode))
      || (options.expectedUid !== undefined && !Number.isSafeInteger(options.expectedUid))
      || (options.rejectWritableExecutable !== undefined
        && typeof options.rejectWritableExecutable !== 'boolean')
      || (options.discardBody !== undefined && typeof options.discardBody !== 'boolean')
      || (options.discardBody === true && options.expectedSha256 === undefined)
      || (options.expectedIdentity !== undefined && !exactExpectedIdentity(options.expectedIdentity))) {
    fail('LOCAL_BINDING_BOUNDED_FILE_INPUT_INVALID');
  }
  let descriptor;
  let body;
  let allocation;
  let result;
  let primaryError;
  try {
    const byPath = lstatSync(path, { bigint: true });
    const minimum = options.minimumBytes ?? 0;
    if (byPath.isSymbolicLink() || !byPath.isFile() || byPath.nlink !== 1n
        || byPath.size < BigInt(minimum) || byPath.size > BigInt(options.maximumBytes)
        || realpathSync(path) !== path
        || (options.requireExecutable === true && (byPath.mode & 0o111n) === 0n)
        || (options.rejectWritableExecutable === true && (byPath.mode & 0o022n) !== 0n)) {
      fail('LOCAL_BINDING_BOUNDED_FILE_INVALID');
    }
    if ((options.expectedBytes !== undefined && byPath.size !== BigInt(options.expectedBytes))
        || (options.expectedMode !== undefined && Number(byPath.mode & 0o777n) !== options.expectedMode)
        || (options.expectedUid !== undefined && byPath.uid !== BigInt(options.expectedUid))
        || (options.expectedIdentity !== undefined && !sameIdentity(byPath, options.expectedIdentity))) {
      fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(byPath, opened)) fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');

    const expectedBytes = Number(opened.size);
    const capacity = Math.min(expectedBytes + 1, options.maximumBytes + 1);
    allocation = Buffer.allocUnsafe(options.discardBody === true ? Math.min(capacity, 1024 * 1024) : capacity);
    const digest = options.expectedSha256 === undefined ? undefined : createHash('sha256');
    let offset = 0;
    while (offset < capacity) {
      const destinationOffset = options.discardBody === true ? 0 : offset;
      const length = Math.min(capacity - offset, allocation.length - destinationOffset);
      const count = readSync(descriptor, allocation, destinationOffset, length, offset);
      if (count === 0) break;
      if (!Number.isSafeInteger(count) || count < 0 || count > length) {
        fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
      }
      digest?.update(allocation.subarray(destinationOffset, destinationOffset + count));
      offset += count;
    }
    if (offset !== expectedBytes) fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    body = options.discardBody === true ? Buffer.alloc(0) : Buffer.from(allocation.subarray(0, offset));
    allocation.fill(0);
    allocation = undefined;

    const afterDescriptor = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath)
        || (options.expectedSha256 !== undefined && digest.digest('hex') !== options.expectedSha256)) {
      fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    }
    result = Object.freeze({ body, identity: identity(opened) });
  } catch (error) {
    allocation?.fill(0);
    body?.fill(0);
    primaryError = error;
  }
  let closeError;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeError = error; }
  if (primaryError !== undefined || closeError !== undefined) {
    if (primaryError !== undefined && closeError === undefined) throw primaryError;
    throw new AggregateError(
      [primaryError, closeError].filter(error => error !== undefined),
      'LOCAL_BINDING_BOUNDED_FILE_READ_FAILED',
      { cause: primaryError },
    );
  }
  return result;
}
