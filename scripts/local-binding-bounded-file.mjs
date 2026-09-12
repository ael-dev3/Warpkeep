import { createHash } from 'node:crypto';
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync,
  readSync, realpathSync, writeSync,
} from 'node:fs';

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

export function copyLocalBindingBoundedFile(sourcePath, destinationPath, options) {
  if (typeof destinationPath !== 'string' || destinationPath.length === 0
      || options === null || typeof options !== 'object'
      || !Number.isSafeInteger(options.destinationMode)
      || options.destinationMode < 0 || options.destinationMode > 0o777
      || options.expectedSha256 === undefined || options.expectedBytes === undefined) {
    fail('LOCAL_BINDING_BOUNDED_FILE_INPUT_INVALID');
  }
  const source = readLocalBindingBoundedFile(sourcePath, { ...options, discardBody: true });
  let sourceDescriptor;
  let destinationDescriptor;
  let scratch;
  let primaryError;
  try {
    sourceDescriptor = openSync(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const openedSource = fstatSync(sourceDescriptor, { bigint: true });
    if (!sameIdentity(openedSource, source.identity)) fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    destinationDescriptor = openSync(
      destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      options.destinationMode,
    );
    scratch = Buffer.allocUnsafe(Math.min(options.expectedBytes + 1, 1024 * 1024));
    const digest = createHash('sha256');
    let sourceOffset = 0;
    while (sourceOffset < options.expectedBytes) {
      const count = readSync(
        sourceDescriptor, scratch, 0,
        Math.min(scratch.length, options.expectedBytes - sourceOffset), sourceOffset,
      );
      if (!Number.isSafeInteger(count) || count <= 0
          || count > Math.min(scratch.length, options.expectedBytes - sourceOffset)) {
        fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
      }
      digest.update(scratch.subarray(0, count));
      let written = 0;
      while (written < count) {
        const next = writeSync(destinationDescriptor, scratch, written, count - written, sourceOffset + written);
        if (!Number.isSafeInteger(next) || next <= 0 || next > count - written) {
          fail('LOCAL_BINDING_BOUNDED_FILE_COPY_FAILED');
        }
        written += next;
      }
      sourceOffset += count;
    }
    if (readSync(sourceDescriptor, scratch, 0, 1, sourceOffset) !== 0
        || digest.digest('hex') !== options.expectedSha256
        || !sameIdentity(openedSource, fstatSync(sourceDescriptor, { bigint: true }))) {
      fail('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    }
    fchmodSync(destinationDescriptor, options.destinationMode);
    fsyncSync(destinationDescriptor);
    const destinationState = fstatSync(destinationDescriptor, { bigint: true });
    if (!destinationState.isFile() || destinationState.nlink !== 1n
        || destinationState.size !== BigInt(options.expectedBytes)
        || (process.platform !== 'win32'
          && Number(destinationState.mode & 0o777n) !== options.destinationMode)) {
      fail('LOCAL_BINDING_BOUNDED_FILE_COPY_FAILED');
    }
  } catch (error) {
    primaryError = error;
  }
  scratch?.fill(0);
  const closeErrors = [];
  for (const descriptor of [destinationDescriptor, sourceDescriptor]) {
    try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeErrors.push(error); }
  }
  if (primaryError !== undefined || closeErrors.length > 0) {
    if (primaryError !== undefined && closeErrors.length === 0) throw primaryError;
    throw new AggregateError(
      [primaryError, ...closeErrors].filter(error => error !== undefined),
      'LOCAL_BINDING_BOUNDED_FILE_COPY_FAILED',
      { cause: primaryError },
    );
  }
  readLocalBindingBoundedFile(sourcePath, {
    ...options, discardBody: true, expectedIdentity: source.identity,
  });
  const destination = readLocalBindingBoundedFile(destinationPath, {
    maximumBytes: options.maximumBytes,
    expectedBytes: options.expectedBytes,
    expectedSha256: options.expectedSha256,
    expectedMode: process.platform === 'win32' ? undefined : options.destinationMode,
    expectedUid: options.expectedUid,
  });
  const bytes = destination.body.length;
  destination.body.fill(0);
  return Object.freeze({
    bytes,
    sha256: options.expectedSha256,
    identity: destination.identity,
  });
}
