import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

export const GENESIS001_FROZEN_SOURCE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const GENESIS001_FROZEN_SOURCE_TREE = '90deebb5faf4129282f5c35999244f540001b27d';
export const GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256 =
  '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9';

const MATERIALIZER_BLOB = 'c50182e99ed2e2fab1ca994c905818d383782cfc';
const MATERIALIZER_SHA256 = 'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93';
const DEPENDENCY_BLOBS = Object.freeze([
  Object.freeze({ path: 'spacetimedb/package.json', blob: 'faf7214653f1248a3f9231fd6a13dda130821014' }),
  Object.freeze({ path: 'spacetimedb/pnpm-lock.yaml', blob: '649efdebd25528f593aff612ca8aef6f761d1e94' }),
  Object.freeze({ path: 'spacetimedb/pnpm-workspace.yaml', blob: 'a640febaa07fad295f2de4b4416b7a22910eb2e6' }),
]);
const ABSOLUTE_GIT = '/usr/bin/git';
const MAXIMUM_MATERIALIZER_BYTES = 64 * 1024;
const MAXIMUM_SOURCE_ENTRIES = 1_000;
const MAXIMUM_SOURCE_FILE_BYTES = 1 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 16 * 1024 * 1024;
const SOURCE_FILE_COUNT = 174;
const SOURCE_ENTRY_COUNT = 209;

export class Genesis001FrozenSourceError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'Genesis001FrozenSourceError';
    this.code = code;
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause });
  }
}

function fail(code, cause) {
  throw new Genesis001FrozenSourceError(code, cause);
}

function pathInside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (difference !== '..'
    && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function identity(status) {
  return Object.freeze({
    dev: status.dev,
    ino: status.ino,
    mode: status.mode,
    uid: status.uid,
    nlink: status.nlink,
    size: status.size,
    mtimeNs: status.mtimeNs,
    ctimeNs: status.ctimeNs,
  });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.uid === right.uid && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function sameDirectoryCleanupIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.uid === right.uid;
}

function exactLogicalPath(value) {
  return value === '' || (value.length <= 4096 && !value.includes('\\')
    && !/[\0-\x1f\x7f]/u.test(value) && !posix.isAbsolute(value)
    && posix.normalize(value) === value
    && value.split('/').every(component => component !== '' && component !== '.' && component !== '..'));
}

function readRegularFile(path, maximumBytes, code) {
  let descriptor;
  let body;
  let result;
  let primaryError;
  try {
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n
      || before.size < 0n || before.size > BigInt(maximumBytes)
      || (before.mode & 0o7777n) !== 0o600n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path) fail(code);
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(identity(before), identity(opened))) fail(code);
    body = Buffer.allocUnsafe(Number(opened.size));
    let offset = 0;
    while (offset < body.byteLength) {
      const count = readSync(descriptor, body, offset, body.byteLength - offset, offset);
      if (count < 1) fail(code);
      offset += count;
    }
    if (!sameIdentity(identity(before), identity(fstatSync(descriptor, { bigint: true })))
      || !sameIdentity(identity(before), identity(lstatSync(path, { bigint: true })))) fail(code);
    result = Object.freeze({
      identity: identity(before),
      size: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    });
  } catch (error) {
    primaryError = error instanceof Genesis001FrozenSourceError
      ? error
      : new Genesis001FrozenSourceError(code, error);
  }
  body?.fill(0);
  let closeError;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeError = error; }
  if (primaryError !== undefined || closeError !== undefined) {
    if (primaryError !== undefined && closeError === undefined) throw primaryError;
    if (primaryError === undefined) throw closeError;
    throw new AggregateError(
      [primaryError, closeError],
      'GENESIS001_FROZEN_SOURCE_READ_AND_CLOSE_FAILED',
    );
  }
  return result ?? fail(code);
}

function directoryIdentity(path, code) {
  try {
    const status = lstatSync(path, { bigint: true });
    if (status.isSymbolicLink() || !status.isDirectory()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path) fail(code);
    return identity(status);
  } catch (error) {
    if (error instanceof Genesis001FrozenSourceError) throw error;
    return fail(code, error);
  }
}

function sourceInventory(root) {
  const entries = [];
  let totalBytes = 0;
  const visit = (path) => {
    if (entries.length >= MAXIMUM_SOURCE_ENTRIES) fail('GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
    const logical = relative(root, path).split(sep).join('/');
    if (!exactLogicalPath(logical)) fail('GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
    const status = lstatSync(path, { bigint: true });
    if (status.isDirectory() && !status.isSymbolicLink()) {
      entries.push(Object.freeze({ kind: 'directory', path: logical,
        identity: directoryIdentity(path, 'GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID') }));
      for (const name of readdirSync(path).sort((left, right) => (
        Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
      ))) visit(join(path, name));
      return;
    }
    if (!status.isFile() || status.isSymbolicLink()) {
      fail('GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
    }
    const regular = readRegularFile(path, MAXIMUM_SOURCE_FILE_BYTES,
      'GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
    totalBytes += regular.size;
    if (totalBytes > MAXIMUM_SOURCE_BYTES) fail('GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
    entries.push(Object.freeze({ kind: 'file', path: logical, ...regular }));
  };
  visit(root);
  const projected = entries.map(entry => entry.kind === 'directory'
    ? ['directory', entry.path]
    : ['file', entry.path, entry.size, entry.sha256]);
  const digest = createHash('sha256')
    .update('warpkeep-genesis001-frozen-source-inventory-v1\0')
    .update(JSON.stringify(projected))
    .digest('hex');
  return Object.freeze({
    digest,
    entries: Object.freeze(entries),
    byPath: new Map(entries.map(entry => [entry.path, entry])),
  });
}

function trustedGitEnvironment(privateHome) {
  return Object.freeze({
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', HOME: privateHome,
    LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin', TMPDIR: privateHome,
  });
}

function runGit(repositoryRoot, privateHome, arguments_, options = {}) {
  return execFileSync(ABSOLUTE_GIT, [
    '--no-pager', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null',
    '-c', 'core.excludesFile=/dev/null', '-C', repositoryRoot, ...arguments_,
  ], {
    cwd: '/', env: trustedGitEnvironment(privateHome),
    encoding: options.encoding, maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
  });
}

function exactLine(value, code) {
  const line = value.endsWith('\n') ? value.slice(0, -1) : value;
  if (line.length < 1 || line.includes('\n') || line.includes('\r')) fail(code);
  return line;
}

function authenticatedGitObject(repositoryRoot, destination, type, objectId, maximumBytes, code) {
  let body;
  try {
    body = runGit(repositoryRoot, destination, ['cat-file', type, objectId], {
      maxBuffer: maximumBytes + 1,
    });
  } catch (error) {
    return fail(code, error);
  }
  if (body.byteLength < 1 || body.byteLength > maximumBytes
    || createHash('sha1').update(`${type} ${body.byteLength}\0`).update(body).digest('hex')
      !== objectId) {
    body.fill(0);
    fail(code);
  }
  return body;
}

function authenticateSource(repositoryRoot, destination) {
  const gitStatus = lstatSync(ABSOLUTE_GIT);
  if (!gitStatus.isFile() || gitStatus.isSymbolicLink() || (gitStatus.mode & 0o022) !== 0
    || realpathSync.native(ABSOLUTE_GIT) !== ABSOLUTE_GIT) {
    fail('GENESIS001_FROZEN_SOURCE_GIT_INVALID');
  }
  const commit = exactLine(runGit(repositoryRoot, destination, [
    'rev-parse', '--verify', `${GENESIS001_FROZEN_SOURCE_COMMIT}^{commit}`,
  ], { encoding: 'utf8' }), 'GENESIS001_FROZEN_SOURCE_COMMIT_INVALID');
  const tree = exactLine(runGit(repositoryRoot, destination, [
    'rev-parse', '--verify', `${GENESIS001_FROZEN_SOURCE_COMMIT}^{tree}`,
  ], { encoding: 'utf8' }), 'GENESIS001_FROZEN_SOURCE_TREE_INVALID');
  if (commit !== GENESIS001_FROZEN_SOURCE_COMMIT) fail('GENESIS001_FROZEN_SOURCE_COMMIT_INVALID');
  if (tree !== GENESIS001_FROZEN_SOURCE_TREE) fail('GENESIS001_FROZEN_SOURCE_TREE_INVALID');
  authenticatedGitObject(repositoryRoot, destination, 'commit', commit, 64 * 1024,
    'GENESIS001_FROZEN_SOURCE_COMMIT_INVALID').fill(0);
  authenticatedGitObject(repositoryRoot, destination, 'tree', tree, 1 * 1024 * 1024,
    'GENESIS001_FROZEN_SOURCE_TREE_INVALID').fill(0);
  for (const dependency of DEPENDENCY_BLOBS) {
    const blob = exactLine(runGit(repositoryRoot, destination, [
      'rev-parse', '--verify', `${GENESIS001_FROZEN_SOURCE_COMMIT}:${dependency.path}`,
    ], { encoding: 'utf8' }), 'GENESIS001_FROZEN_SOURCE_DEPENDENCY_INVALID');
    if (blob !== dependency.blob) fail('GENESIS001_FROZEN_SOURCE_DEPENDENCY_INVALID');
    authenticatedGitObject(repositoryRoot, destination, 'blob', blob,
      8 * 1024 * 1024, 'GENESIS001_FROZEN_SOURCE_DEPENDENCY_INVALID').fill(0);
  }
  const materializer = authenticatedGitObject(
    repositoryRoot, destination, 'blob', MATERIALIZER_BLOB,
    MAXIMUM_MATERIALIZER_BYTES, 'GENESIS001_FROZEN_SOURCE_MATERIALIZER_INVALID',
  );
  if (materializer.byteLength < 1 || materializer.byteLength > MAXIMUM_MATERIALIZER_BYTES
    || createHash('sha256').update(materializer).digest('hex') !== MATERIALIZER_SHA256) {
    materializer.fill(0);
    fail('GENESIS001_FROZEN_SOURCE_MATERIALIZER_INVALID');
  }
  return materializer;
}

function runMaterializer(repositoryRoot, destination, materializer) {
  const dataUrl = `data:text/javascript;base64,${materializer.toString('base64')}`;
  materializer.fill(0);
  const bootstrap = [
    "const loaded=await import(process.argv[1]);",
    "const value=loaded.materializeGenesis001Frozen({repoRoot:process.argv[2],destination:process.argv[3]});",
    "process.stdout.write(JSON.stringify(value));",
  ].join('');
  let output;
  try {
    output = execFileSync(process.execPath, [
      '--input-type=module', '--eval', bootstrap, dataUrl, repositoryRoot, destination,
    ], {
      cwd: '/', encoding: 'utf8', maxBuffer: 16 * 1024,
      env: trustedGitEnvironment(dirname(destination)),
    });
  } catch (error) {
    return fail('GENESIS001_FROZEN_SOURCE_MATERIALIZATION_INVALID', error);
  }
  let metadata;
  try { metadata = JSON.parse(output); } catch (error) {
    return fail('GENESIS001_FROZEN_SOURCE_MATERIALIZATION_INVALID', error);
  }
  if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify([
    'baseline', 'baselineAbiSha256', 'extractedFileCount', 'freezeNonce',
  ].sort())
    || metadata.baseline !== GENESIS001_FROZEN_SOURCE_COMMIT
    || metadata.baselineAbiSha256 !== 'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03'
    || metadata.freezeNonce !== '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
    || metadata.extractedFileCount !== 172) {
    fail('GENESIS001_FROZEN_SOURCE_MATERIALIZATION_INVALID');
  }
}

function allowedGenerated(logical, allowed) {
  const prefixes = allowed?.prefixes ?? [];
  const files = allowed?.files ?? [];
  return prefixes.some(prefix => logical === prefix.slice(0, -1) || logical.startsWith(prefix))
    || files.some(file => logical === file || file.startsWith(`${logical}/`));
}

function verifyInventory(root, frozen, allowed) {
  const seen = new Set();
  let count = 0;
  const visit = (path) => {
    count += 1;
    if (count > 25_000) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
    const logical = relative(root, path).split(sep).join('/');
    if (!exactLogicalPath(logical)) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
    const expected = frozen.byPath.get(logical);
    if (expected !== undefined) {
      seen.add(logical);
      if (expected.kind === 'directory') {
        const current = directoryIdentity(path, 'GENESIS001_FROZEN_SOURCE_CHANGED');
        if (!sameDirectoryCleanupIdentity(expected.identity, current)) {
          fail('GENESIS001_FROZEN_SOURCE_CHANGED');
        }
      } else {
        const current = readRegularFile(path, MAXIMUM_SOURCE_FILE_BYTES,
          'GENESIS001_FROZEN_SOURCE_CHANGED');
        if (!sameIdentity(expected.identity, current.identity)
          || expected.sha256 !== current.sha256) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
      }
    } else if (!allowedGenerated(logical, allowed)) {
      fail('GENESIS001_FROZEN_SOURCE_UNEXPECTED_ENTRY');
    } else {
      const status = lstatSync(path);
      if (status.isSymbolicLink()) {
        const target = resolve(dirname(path), readlinkSync(path));
        if (!pathInside(root, target) || !pathInside(root, realpathSync(path))) {
          fail('GENESIS001_FROZEN_SOURCE_GENERATED_ESCAPE');
        }
        return;
      }
      if (!status.isDirectory() && !status.isFile()) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
      if (!pathInside(root, realpathSync(path))) fail('GENESIS001_FROZEN_SOURCE_GENERATED_ESCAPE');
    }
    const status = lstatSync(path);
    if (status.isDirectory() && !status.isSymbolicLink()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    }
  };
  visit(root);
  if (seen.size !== frozen.entries.length) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
}

function removeFrozenInventory(root, frozen) {
  verifyInventory(root, frozen);
  for (const entry of [...frozen.entries].reverse()) {
    const path = entry.path === '' ? root : join(root, ...entry.path.split('/'));
    if (entry.kind === 'file') {
      const current = readRegularFile(path, MAXIMUM_SOURCE_FILE_BYTES,
        'GENESIS001_FROZEN_SOURCE_CLEANUP_FAILED');
      if (!sameIdentity(entry.identity, current.identity) || entry.sha256 !== current.sha256) {
        fail('GENESIS001_FROZEN_SOURCE_CLEANUP_FAILED');
      }
      unlinkSync(path);
    } else {
      const current = directoryIdentity(path, 'GENESIS001_FROZEN_SOURCE_CLEANUP_FAILED');
      if (!sameDirectoryCleanupIdentity(entry.identity, current) || readdirSync(path).length !== 0) {
        fail('GENESIS001_FROZEN_SOURCE_CLEANUP_FAILED');
      }
      rmdirSync(path);
    }
  }
}

export function createGenesis001FrozenSourceMaterialization(input) {
  if (process.platform !== 'linux' || process.arch !== 'x64'
    || input === null || typeof input !== 'object' || Array.isArray(input)
    || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(['destination', 'repositoryRoot'])
    || !isAbsolute(input.repositoryRoot) || !isAbsolute(input.destination)
    || resolve(input.repositoryRoot) !== input.repositoryRoot
    || resolve(input.destination) !== input.destination) {
    fail('GENESIS001_FROZEN_SOURCE_INPUT_INVALID');
  }
  let repositoryRoot;
  let parent;
  try {
    repositoryRoot = realpathSync(input.repositoryRoot);
    parent = realpathSync(dirname(input.destination));
  } catch (error) {
    return fail('GENESIS001_FROZEN_SOURCE_INPUT_INVALID', error);
  }
  const parentStatus = lstatSync(parent);
  if (dirname(input.destination) !== parent || pathInside(repositoryRoot, input.destination)
    || pathInside(input.destination, repositoryRoot) || parentStatus.isSymbolicLink()
    || !parentStatus.isDirectory() || (parentStatus.mode & 0o077) !== 0
    || (process.getuid !== undefined && parentStatus.uid !== process.getuid())) {
    fail('GENESIS001_FROZEN_SOURCE_INPUT_INVALID');
  }
  const materializer = authenticateSource(repositoryRoot, input.destination);
  runMaterializer(repositoryRoot, input.destination, materializer);
  const frozen = sourceInventory(input.destination);
  if (frozen.digest !== GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256
    || frozen.entries.length !== SOURCE_ENTRY_COUNT
    || frozen.entries.filter(entry => entry.kind === 'file').length !== SOURCE_FILE_COUNT) {
    fail('GENESIS001_FROZEN_SOURCE_INVENTORY_INVALID');
  }
  verifyInventory(input.destination, frozen);
  let cleaned = false;
  return Object.freeze({
    root: input.destination,
    moduleSourceCommit: GENESIS001_FROZEN_SOURCE_COMMIT,
    moduleTreeId: GENESIS001_FROZEN_SOURCE_TREE,
    sourceClosureDigest: GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256,
    verify(allowed) {
      if (cleaned) fail('GENESIS001_FROZEN_SOURCE_CHANGED');
      if (allowed !== undefined && (allowed === null || typeof allowed !== 'object'
        || Array.isArray(allowed) || Object.keys(allowed).some(key => !['files', 'prefixes'].includes(key)))) {
        fail('GENESIS001_FROZEN_SOURCE_INPUT_INVALID');
      }
      verifyInventory(input.destination, frozen, allowed);
    },
    cleanup() {
      if (!cleaned) removeFrozenInventory(input.destination, frozen);
      cleaned = true;
    },
  });
}
