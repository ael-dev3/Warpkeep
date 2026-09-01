import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const SEALED_REALMS_PRIVATE_STATE_VERSION = 'sealed-realms-v1';
export const SEALED_REALMS_PRIVATE_ROOT_NAMES = Object.freeze([
  'audit', 'runtime', 'cache',
]);

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAXIMUM_FILE_BYTES = 512 * 1_024;
const MAXIMUM_FAMILY_MEMBER_BYTES = 2 * 1_024 * 1_024;
const MAXIMUM_FAMILY_BYTES = 8 * 1_024 * 1_024;
const SAFE_COMPONENT = /^(?:[a-z0-9][a-z0-9._-]{0,127})$/u;
const stateCapabilities = new WeakSet();

export class SealedRealmsProductionPrivateStateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionPrivateStateError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionPrivateStateError(code);
}

function exactInput(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail('SEALED_REALMS_PRIVATE_STATE_INPUT_INVALID');
  return value;
}

function assertedOwner(testOnlyOwnerUid) {
  if (testOnlyOwnerUid !== undefined) {
    if (!Number.isSafeInteger(testOnlyOwnerUid) || testOnlyOwnerUid < 0) {
      fail('SEALED_REALMS_PRIVATE_STATE_OWNER_INVALID');
    }
    return testOnlyOwnerUid;
  }
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid < 0) {
    fail('SEALED_REALMS_PRIVATE_STATE_OWNER_UNAVAILABLE');
  }
  return uid;
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function exactDirectory(path, owner, code, parent, allowTestOnlyPlatformMode = false) {
  let status;
  let canonical;
  try {
    status = lstatSync(path);
    canonical = realpathSync(path);
  } catch {
    fail(code);
  }
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || status.uid !== owner
    || (!allowTestOnlyPlatformMode && (status.mode & 0o7777) !== DIRECTORY_MODE)
    || canonical !== path
    || (parent !== undefined && dirname(canonical) !== parent)
  ) fail(code);
  return canonical;
}

function exactHomeDirectory(path, owner) {
  let status;
  let canonical;
  try {
    status = lstatSync(path);
    canonical = realpathSync(path);
  } catch {
    fail('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
  }
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || status.uid !== owner
    || canonical !== path
  ) fail('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
  return canonical;
}

function assertAncestors(home, target, owner, allowTestOnlyPlatformMode) {
  if (!inside(home, target)) fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
  const pieces = relative(home, target).split(sep).filter(Boolean);
  let current = home;
  exactHomeDirectory(current, owner);
  for (const piece of pieces) {
    current = join(current, piece);
    let status;
    try { status = lstatSync(current); } catch {
      fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
    }
    if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== owner) {
      fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
    }
  }
}

/**
 * Node does not expose portable openat(2) traversal. Retain and revalidate
 * the complete already-resolved parent identity chain around each operation so
 * any parent replacement/symlink race is detected before an authority is
 * returned. The check deliberately fails closed rather than repairing state.
 */
function captureDirectoryChain(home, target, owner, allowTestOnlyPlatformMode) {
  if (!inside(home, target)) fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
  const entries = [];
  let current = home;
  exactHomeDirectory(current, owner);
  let status;
  try { status = lstatSync(current); } catch {
    fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
  }
  entries.push(Object.freeze({
    path: current,
    dev: status.dev,
    ino: status.ino,
    uid: status.uid,
    mode: status.mode,
    realpath: realpathSync(current),
    home: true,
  }));
  for (const piece of relative(home, target).split(sep).filter(Boolean)) {
    const parent = current;
    current = join(parent, piece);
    exactDirectory(
      current, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', parent,
      allowTestOnlyPlatformMode,
    );
    try { status = lstatSync(current); } catch {
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
    }
    entries.push(Object.freeze({
      path: current,
      dev: status.dev,
      ino: status.ino,
      uid: status.uid,
      mode: status.mode,
      realpath: realpathSync(current),
      home: false,
    }));
  }
  return Object.freeze(entries);
}

function revalidateDirectoryChain(chain, owner, allowTestOnlyPlatformMode) {
  for (const entry of chain) {
    if (entry.home) {
      exactHomeDirectory(entry.path, owner);
    } else {
      const parent = dirname(entry.path);
      exactDirectory(
        entry.path, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED', parent,
        allowTestOnlyPlatformMode,
      );
    }
    let status;
    let canonical;
    try {
      status = lstatSync(entry.path);
      canonical = realpathSync(entry.path);
    } catch {
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED');
    }
    if (
      status.dev !== entry.dev || status.ino !== entry.ino
      || status.uid !== entry.uid || status.mode !== entry.mode
      || canonical !== entry.realpath
    ) fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED');
  }
}

function safeRelative(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 768) {
    fail('SEALED_REALMS_PRIVATE_STATE_RELATIVE_PATH_INVALID');
  }
  const segments = value.split('/');
  if (
    segments.length > 16
    || segments.some(segment => !SAFE_COMPONENT.test(segment)
      || segment === '.' || segment === '..')
    || isAbsolute(value)
    || value.includes('\\')
    || value.includes('\0')
  ) fail('SEALED_REALMS_PRIVATE_STATE_RELATIVE_PATH_INVALID');
  return Object.freeze([...segments]);
}

function byteValue(value) {
  if (!(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    fail('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
  }
  const bytes = Buffer.from(value);
  if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_FILE_BYTES) {
    bytes.fill(0);
    fail('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
  }
  return bytes;
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (count < 1) fail('SEALED_REALMS_PRIVATE_STATE_WRITE_FAILED');
    offset += count;
  }
}

function requirePrivateFile(
  status,
  owner,
  byteLength,
  code,
  allowTestOnlyPlatformMode = false,
) {
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.uid !== owner
    || status.nlink !== 1
    || (!allowTestOnlyPlatformMode && (status.mode & 0o7777) !== FILE_MODE)
    || status.size !== byteLength
  ) fail(code);
}

function defaultFsync(path) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch {
    fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_FSYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertCapability(capability) {
  if (!stateCapabilities.has(capability)) {
    fail('SEALED_REALMS_PRIVATE_STATE_CAPABILITY_INVALID');
  }
}

/**
 * Creates a bounded capability for the three pre-existing account-home roots.
 * The roots are validated only; this function never creates or repairs them.
 */
export function createSealedRealmsProductionPrivateState(input) {
  if (
    input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).some(key => ![
      'reportedHome', 'testOnlyOwnerUid', 'testOnlyFsync', 'testOnlyAllowPlatformMode',
      'testOnlyRace',
    ].includes(key))
  ) fail('SEALED_REALMS_PRIVATE_STATE_INPUT_INVALID');
  const options = input;
  if (
    typeof options.reportedHome !== 'string'
    || !isAbsolute(options.reportedHome)
    || (options.testOnlyFsync !== undefined && typeof options.testOnlyFsync !== 'function')
    || (options.testOnlyAllowPlatformMode !== undefined
      && options.testOnlyAllowPlatformMode !== true)
    || (options.testOnlyRace !== undefined && typeof options.testOnlyRace !== 'function')
  ) fail('SEALED_REALMS_PRIVATE_STATE_INPUT_INVALID');
  const testOnlyMode = options.testOnlyOwnerUid !== undefined
    || options.testOnlyFsync !== undefined
    || options.testOnlyAllowPlatformMode !== undefined
    || options.testOnlyRace !== undefined;
  const observeRace = options.testOnlyRace ?? (() => {});
  if (testOnlyMode && process.env.NODE_ENV !== 'test') {
    fail('SEALED_REALMS_PRIVATE_STATE_TEST_ONLY_FORBIDDEN');
  }
  const allowTestOnlyPlatformMode = options.testOnlyAllowPlatformMode === true;
  const requestedHome = resolve(options.reportedHome);
  if (!testOnlyMode) {
    let actualHome;
    try { actualHome = resolve(userInfo().homedir); } catch {
      fail('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
    }
    if (requestedHome !== actualHome) {
      fail('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
    }
  }
  const owner = assertedOwner(options.testOnlyOwnerUid);
  const home = exactHomeDirectory(requestedHome, owner);
  const roots = Object.freeze({
    audit: join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    runtime: join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    cache: join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  });
  for (const root of Object.values(roots)) {
    assertAncestors(home, root, owner, allowTestOnlyPlatformMode);
    exactDirectory(
      root, owner, 'SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID', undefined,
      allowTestOnlyPlatformMode,
    );
  }
  const fsyncDirectory = options.testOnlyFsync === undefined
    ? defaultFsync
    : options.testOnlyFsync;

  const rootPath = (root) => {
    if (!SEALED_REALMS_PRIVATE_ROOT_NAMES.includes(root)) {
      fail('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
    }
    const value = roots[root];
    assertAncestors(home, value, owner, allowTestOnlyPlatformMode);
    exactDirectory(
      value, owner, 'SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID', undefined,
      allowTestOnlyPlatformMode,
    );
    return value;
  };

  const descendant = (root, relativePath, createDirectories) => {
    const rootDirectory = rootPath(root);
    const segments = safeRelative(relativePath);
    let current = join(rootDirectory, SEALED_REALMS_PRIVATE_STATE_VERSION);
    const ensureDirectory = (path, parent) => {
      try {
        const status = lstatSync(path);
        if (!status.isDirectory() || status.isSymbolicLink()) {
          fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
        }
      } catch (error) {
        if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
        if (!createDirectories || error?.code !== 'ENOENT') {
          fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
        }
        let created;
        try {
          mkdirSync(path, { mode: DIRECTORY_MODE });
          created = lstatSync(path);
          if (!allowTestOnlyPlatformMode) {
            const descriptor = openSync(
              path,
              constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
                | (constants.O_NOFOLLOW ?? 0),
            );
            try { fchmodSync(descriptor, DIRECTORY_MODE); } finally { closeSync(descriptor); }
          }
        } catch {
          fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_CREATE_FAILED');
        }
        fsyncDirectory(parent);
        const retained = lstatSync(path);
        if (retained.dev !== created.dev || retained.ino !== created.ino) {
          fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED');
        }
      }
      exactDirectory(
        path, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', parent,
        allowTestOnlyPlatformMode,
      );
    };
    ensureDirectory(current, rootDirectory);
    for (const segment of segments.slice(0, -1)) {
      const next = join(current, segment);
      ensureDirectory(next, current);
      current = next;
    }
    return Object.freeze({
      directory: current,
      path: join(current, segments.at(-1)),
      basename: segments.at(-1),
    });
  };

  const write = ({ root, relativePath, bytes }) => {
    const target = descendant(root, relativePath, true);
    const parentChain = captureDirectoryChain(
      home, target.directory, owner, allowTestOnlyPlatformMode,
    );
    const body = byteValue(bytes);
    let descriptor;
    try {
      observeRace('write-before-open', target.path);
      descriptor = openSync(
        target.path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      fchmodSync(descriptor, FILE_MODE);
      writeAll(descriptor, body);
      const before = fstatSync(descriptor);
      requirePrivateFile(
        before, owner, body.byteLength, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      fsyncSync(descriptor);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const after = fstatSync(descriptor);
      if (
        after.dev !== before.dev || after.ino !== before.ino
        || after.size !== before.size || after.nlink !== before.nlink
      ) fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      closeSync(descriptor);
      descriptor = undefined;
      const named = lstatSync(target.path);
      requirePrivateFile(
        named, owner, body.byteLength, 'SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED',
        allowTestOnlyPlatformMode,
      );
      if (named.dev !== before.dev || named.ino !== before.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      fsyncDirectory(target.directory);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const finalNamed = lstatSync(target.path);
      requirePrivateFile(finalNamed, owner, body.byteLength,
        'SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED', allowTestOnlyPlatformMode);
      if (finalNamed.dev !== before.dev || finalNamed.ino !== before.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      return Object.freeze({ byteLength: body.byteLength });
    } catch (error) {
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      if (error?.code === 'EEXIST') fail('SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS');
      fail('SEALED_REALMS_PRIVATE_STATE_WRITE_FAILED');
    } finally {
      body.fill(0);
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const read = ({ root, relativePath }) => {
    const target = descendant(root, relativePath, false);
    const parentChain = captureDirectoryChain(
      home, target.directory, owner, allowTestOnlyPlatformMode,
    );
    let descriptor;
    let bytes;
    try {
      const named = lstatSync(target.path);
      requirePrivateFile(
        named, owner, named.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      if (named.size < 1 || named.size > MAXIMUM_FILE_BYTES) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_INVALID');
      }
      descriptor = openSync(target.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      observeRace('read-after-open', target.path);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const before = fstatSync(descriptor);
      requirePrivateFile(
        before, owner, named.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      if (before.dev !== named.dev || before.ino !== named.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      const afterNamed = lstatSync(target.path);
      if (
        bytes.byteLength !== before.size || after.dev !== before.dev
        || after.ino !== before.ino || after.size !== before.size
        || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
        || afterNamed.dev !== before.dev || afterNamed.ino !== before.ino
      ) fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      return bytes;
    } catch (error) {
      bytes?.fill(0);
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      fail('SEALED_REALMS_PRIVATE_STATE_READ_FAILED');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const list = ({ root, relativeDirectory = '.' }) => {
    const rootDirectory = rootPath(root);
    let directory = join(rootDirectory, SEALED_REALMS_PRIVATE_STATE_VERSION);
    try { lstatSync(directory); } catch (error) {
      if (error?.code === 'ENOENT') return Object.freeze([]);
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
    }
    exactDirectory(
      directory, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', rootDirectory,
      allowTestOnlyPlatformMode,
    );
    if (relativeDirectory !== '.') {
      for (const segment of safeRelative(relativeDirectory)) {
        const parent = directory;
        directory = join(parent, segment);
        try { lstatSync(directory); } catch (error) {
          if (error?.code === 'ENOENT') return Object.freeze([]);
          fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
        }
        exactDirectory(
          directory, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', parent,
          allowTestOnlyPlatformMode,
        );
      }
    }
    const parentChain = captureDirectoryChain(
      home, directory, owner, allowTestOnlyPlatformMode,
    );
    let names;
    try {
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      names = readdirSync(directory);
      observeRace('list-after-read', directory);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
    } catch (error) {
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
    }
    if (names.length > 256 || names.some(name => !SAFE_COMPONENT.test(name))) {
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
    }
    return Object.freeze([...names].sort());
  };

  const exists = ({ root, relativePath }) => {
    const rootDirectory = rootPath(root);
    const segments = safeRelative(relativePath);
    let directory = join(rootDirectory, SEALED_REALMS_PRIVATE_STATE_VERSION);
    try { lstatSync(directory); } catch (error) {
      if (error?.code === 'ENOENT') return false;
      fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
    }
    exactDirectory(
      directory, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', rootDirectory,
      allowTestOnlyPlatformMode,
    );
    for (const segment of segments.slice(0, -1)) {
      const parent = directory;
      directory = join(parent, segment);
      try { lstatSync(directory); } catch (error) {
        if (error?.code === 'ENOENT') return false;
        fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
      }
      exactDirectory(
        directory, owner, 'SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID', parent,
        allowTestOnlyPlatformMode,
      );
    }
    const parentChain = captureDirectoryChain(
      home, directory, owner, allowTestOnlyPlatformMode,
    );
    const target = { path: join(directory, segments.at(-1)) };
    let named;
    try { named = lstatSync(target.path); } catch (error) {
      if (error?.code === 'ENOENT') {
        revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
        return false;
      }
      fail('SEALED_REALMS_PRIVATE_STATE_FILE_INVALID');
    }
    requirePrivateFile(
      named, owner, named.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
      allowTestOnlyPlatformMode,
    );
    observeRace('exists-after-lstat', target.path);
    if (named.size < 1 || named.size > MAXIMUM_FILE_BYTES) {
      fail('SEALED_REALMS_PRIVATE_STATE_FILE_INVALID');
    }
    revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
    return true;
  };

  const append = ({ root, relativePath, bytes }) => {
    const target = descendant(root, relativePath, false);
    const parentChain = captureDirectoryChain(
      home, target.directory, owner, allowTestOnlyPlatformMode,
    );
    const body = byteValue(bytes);
    let descriptor;
    try {
      const named = lstatSync(target.path);
      requirePrivateFile(
        named, owner, named.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      if (named.size < 1 || named.size + body.byteLength > MAXIMUM_FILE_BYTES) {
        fail('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
      }
      descriptor = openSync(
        target.path,
        constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
      );
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const before = fstatSync(descriptor);
      requirePrivateFile(
        before, owner, named.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      if (before.dev !== named.dev || before.ino !== named.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      writeAll(descriptor, body);
      fsyncSync(descriptor);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const after = fstatSync(descriptor);
      if (
        after.dev !== before.dev || after.ino !== before.ino
        || after.size !== before.size + body.byteLength || after.nlink !== before.nlink
      ) fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      closeSync(descriptor);
      descriptor = undefined;
      const afterNamed = lstatSync(target.path);
      requirePrivateFile(
        afterNamed, owner, after.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED',
        allowTestOnlyPlatformMode,
      );
      if (afterNamed.dev !== after.dev || afterNamed.ino !== after.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      fsyncDirectory(target.directory);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      const finalNamed = lstatSync(target.path);
      requirePrivateFile(finalNamed, owner, after.size,
        'SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED', allowTestOnlyPlatformMode);
      if (finalNamed.dev !== after.dev || finalNamed.ino !== after.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      return Object.freeze({ byteLength: body.byteLength });
    } catch (error) {
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      fail('SEALED_REALMS_PRIVATE_STATE_APPEND_FAILED');
    } finally {
      body.fill(0);
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const remove = ({ root, relativePath }) => {
    const target = descendant(root, relativePath, false);
    const parentChain = captureDirectoryChain(
      home, target.directory, owner, allowTestOnlyPlatformMode,
    );
    try {
      const before = lstatSync(target.path);
      requirePrivateFile(
        before, owner, before.size, 'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
        allowTestOnlyPlatformMode,
      );
      const rechecked = lstatSync(target.path);
      if (rechecked.dev !== before.dev || rechecked.ino !== before.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      observeRace('remove-before-unlink', target.path);
      const finalBeforeUnlink = lstatSync(target.path);
      if (finalBeforeUnlink.dev !== before.dev || finalBeforeUnlink.ino !== before.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      unlinkSync(target.path);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      fsyncDirectory(target.directory);
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      try {
        lstatSync(target.path);
        fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      } catch (error) {
        if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
        if (error?.code !== 'ENOENT') fail('SEALED_REALMS_PRIVATE_STATE_REMOVE_FAILED');
      }
    } catch (error) {
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      fail('SEALED_REALMS_PRIVATE_STATE_REMOVE_FAILED');
    }
  };

  const writeFamily = ({ root, relativeDirectory, members }) => {
    if (
      typeof relativeDirectory !== 'string' || !SAFE_COMPONENT.test(relativeDirectory)
      || !Array.isArray(members) || members.length < 1 || members.length > 8
    ) fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
    const normalized = members.map((member) => {
      exactInput(member, ['basename', 'bytes']);
      if (typeof member.basename !== 'string' || !SAFE_COMPONENT.test(member.basename)) {
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      }
      if (!(member.bytes instanceof Uint8Array) && !Buffer.isBuffer(member.bytes)) {
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      }
      const bytes = Buffer.from(member.bytes);
      if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_FAMILY_MEMBER_BYTES) {
        bytes.fill(0);
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      }
      return { basename: member.basename, bytes };
    }).sort((left, right) => left.basename.localeCompare(right.basename));
    if (
      new Set(normalized.map(member => member.basename)).size !== normalized.length
      || normalized.reduce((total, member) => total + member.bytes.byteLength, 0)
        > MAXIMUM_FAMILY_BYTES
    ) {
      for (const member of normalized) member.bytes.fill(0);
      fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
    }
    const anchor = descendant(root, `${relativeDirectory}.anchor`, true);
    const parent = anchor.directory;
    const parentChain = captureDirectoryChain(home, parent, owner, allowTestOnlyPlatformMode);
    const finalPath = join(parent, relativeDirectory);
    const lockPath = join(parent, `${relativeDirectory}.family.lock`);
    const stagePath = join(parent, `${relativeDirectory}.stage.${randomBytes(16).toString('hex')}`);
    let lockDescriptor;
    let stageCreated = false;
    let published = false;
    const written = [];
    try {
      try {
        lockDescriptor = openSync(
          lockPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
            | (constants.O_NOFOLLOW ?? 0),
          FILE_MODE,
        );
      } catch (error) {
        if (error?.code === 'EEXIST') fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_BUSY');
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_WRITE_FAILED');
      }
      fchmodSync(lockDescriptor, FILE_MODE);
      writeAll(lockDescriptor, Buffer.from('warpkeep-private-family-lock-v1\n', 'utf8'));
      fsyncSync(lockDescriptor);
      closeSync(lockDescriptor);
      lockDescriptor = undefined;
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      try {
        lstatSync(finalPath);
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_EXISTS');
      } catch (error) {
        if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
        if (error?.code !== 'ENOENT') fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      }
      mkdirSync(stagePath, { mode: DIRECTORY_MODE });
      stageCreated = true;
      const stageIdentity = lstatSync(stagePath);
      if (
        !stageIdentity.isDirectory() || stageIdentity.isSymbolicLink()
        || stageIdentity.uid !== owner
      ) fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      fsyncDirectory(parent);
      const afterCreate = lstatSync(stagePath);
      if (afterCreate.dev !== stageIdentity.dev || afterCreate.ino !== stageIdentity.ino) {
        fail('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED');
      }
      for (const member of normalized) {
        const path = join(stagePath, member.basename);
        const descriptor = openSync(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
            | (constants.O_NOFOLLOW ?? 0),
          FILE_MODE,
        );
        try {
          fchmodSync(descriptor, FILE_MODE);
          writeAll(descriptor, member.bytes);
          fsyncSync(descriptor);
          const status = fstatSync(descriptor);
          requirePrivateFile(
            status, owner, member.bytes.byteLength,
            'SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID', allowTestOnlyPlatformMode,
          );
          written.push(Object.freeze({ path, dev: status.dev, ino: status.ino, size: status.size }));
        } finally {
          closeSync(descriptor);
        }
      }
      fsyncDirectory(stagePath);
      for (const member of written) {
        const status = lstatSync(member.path);
        if (
          status.dev !== member.dev || status.ino !== member.ino || status.size !== member.size
          || status.nlink !== 1
        ) fail('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      }
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      try {
        lstatSync(finalPath);
        fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_EXISTS');
      } catch (error) {
        if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
        if (error?.code !== 'ENOENT') fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      }
      renameSync(stagePath, finalPath);
      stageCreated = false;
      published = true;
      fsyncDirectory(parent);
      const finalIdentity = lstatSync(finalPath);
      if (
        finalIdentity.dev !== stageIdentity.dev || finalIdentity.ino !== stageIdentity.ino
        || readdirSync(finalPath).sort().join('\0')
          !== normalized.map(member => member.basename).join('\0')
      ) fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_INVALID');
      revalidateDirectoryChain(parentChain, owner, allowTestOnlyPlatformMode);
      unlinkSync(lockPath);
      fsyncDirectory(parent);
      return Object.freeze({ members: Object.freeze(normalized.map(member => member.basename)) });
    } catch (error) {
      if (!published && stageCreated) {
        try {
          for (const member of normalized) {
            try { unlinkSync(join(stagePath, member.basename)); } catch (cleanupError) {
              if (cleanupError?.code !== 'ENOENT') throw cleanupError;
            }
          }
          rmdirSync(stagePath);
          fsyncDirectory(parent);
        } catch {
          fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_CLEANUP_FAILED');
        }
      }
      if (!published) {
        try { unlinkSync(lockPath); fsyncDirectory(parent); } catch { /* durable busy state */ }
      }
      if (error instanceof SealedRealmsProductionPrivateStateError) throw error;
      fail('SEALED_REALMS_PRIVATE_STATE_FAMILY_WRITE_FAILED');
    } finally {
      if (lockDescriptor !== undefined) closeSync(lockDescriptor);
      for (const member of normalized) member.bytes.fill(0);
    }
  };

  const capability = Object.freeze({ write, read, list, exists, append, remove, writeFamily });
  stateCapabilities.add(capability);
  return capability;
}

export function assertSealedRealmsProductionPrivateState(capability) {
  assertCapability(capability);
  return capability;
}
