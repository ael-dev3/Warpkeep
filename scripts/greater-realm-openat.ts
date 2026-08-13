import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER_SOURCE = join(dirname(fileURLToPath(import.meta.url)), 'greater-realm-openat-helper.py');
const HELPER_SOURCE_SHA256 = 'a39c531b97b32648bded65ef6262b95bfe016e4d6fae687376f69867df220b67';
const SYSTEM_PYTHON_ENTRY = '/usr/bin/python3';
const LINUX_SYSTEM_PYTHON_PATH = /^\/usr\/bin\/python3\.[0-9]+$/u;
const MAX_HELPER_SOURCE_BYTES = 64 * 1024;
const MAX_HELPER_INPUT_BYTES = 512 * 1024 * 1024;

export class GreaterRealmOpenAtError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmOpenAtError';
  }
}

function fail(code = 'GREATER_REALM_OPENAT_HELPER_INVALID'): never {
  throw new GreaterRealmOpenAtError(code);
}

function exactPrivateDirectory(path: string): Readonly<{
  path: string;
  dev: bigint;
  ino: bigint;
  uid: bigint;
}> {
  const canonical = realpathSync(resolve(path));
  const status = lstatSync(canonical, { bigint: true });
  if (
    canonical !== resolve(path)
    || status.isSymbolicLink()
    || !status.isDirectory()
    || (status.mode & 0o7777n) !== 0o700n
    || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
  ) fail();
  return Object.freeze({
    path: canonical,
    dev: status.dev,
    ino: status.ino,
    uid: status.uid,
  });
}

function exactSystemPython(): Readonly<{ path: string; identity: string }> {
  const directoryPath = '/usr/bin';
  const directory = lstatSync(directoryPath, { bigint: true });
  const entry = lstatSync(SYSTEM_PYTHON_ENTRY, { bigint: true });
  const path = realpathSync(SYSTEM_PYTHON_ENTRY);
  const target = lstatSync(path, { bigint: true });
  const platformEntryValid = process.platform === 'darwin'
    ? entry.isFile() && !entry.isSymbolicLink() && path === SYSTEM_PYTHON_ENTRY
    : process.platform === 'linux'
      && (entry.isFile() || entry.isSymbolicLink())
      && (path === SYSTEM_PYTHON_ENTRY || LINUX_SYSTEM_PYTHON_PATH.test(path));
  if (
    !platformEntryValid
    || realpathSync(directoryPath) !== directoryPath
    || directory.isSymbolicLink()
    || !directory.isDirectory()
    || directory.uid !== 0n
    || (directory.mode & 0o7777n) !== 0o755n
    || entry.uid !== 0n
    || dirname(path) !== directoryPath
    || target.isSymbolicLink()
    || !target.isFile()
    || target.uid !== 0n
    || (target.mode & 0o7777n) !== 0o755n
  ) fail();
  return Object.freeze({
    path,
    identity: [
      directory.dev, directory.ino, directory.mode, directory.uid, directory.nlink,
      directory.mtimeNs, directory.ctimeNs,
      entry.dev, entry.ino, entry.mode, entry.uid, entry.nlink, entry.size,
      entry.mtimeNs, entry.ctimeNs,
      target.dev, target.ino, target.mode, target.uid, target.nlink,
      target.size, target.mtimeNs, target.ctimeNs, path,
    ].join(':'),
  });
}

function exactSource(descriptor: number): Readonly<{
  identity: string;
  body: Buffer;
}> {
  const before = fstatSync(descriptor, { bigint: true });
  if (
    !before.isFile()
    || before.nlink !== 1n
    || before.size < 1n
    || before.size > BigInt(MAX_HELPER_SOURCE_BYTES)
    || (before.mode & 0o7777n) !== 0o644n
    || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
  ) fail();
  const body = Buffer.allocUnsafe(Number(before.size));
  let offset = 0;
  while (offset < body.byteLength) {
    const count = readSync(descriptor, body, offset, body.byteLength - offset, offset);
    if (count <= 0) {
      body.fill(0);
      fail();
    }
    offset += count;
  }
  const after = fstatSync(descriptor, { bigint: true });
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (
    after.dev !== before.dev
    || after.ino !== before.ino
    || after.mode !== before.mode
    || after.uid !== before.uid
    || after.nlink !== before.nlink
    || after.size !== before.size
    || after.mtimeNs !== before.mtimeNs
    || after.ctimeNs !== before.ctimeNs
    || sha256 !== HELPER_SOURCE_SHA256
  ) {
    body.fill(0);
    fail();
  }
  return Object.freeze({
    identity: [
      after.dev, after.ino, after.mode, after.uid, after.nlink,
      after.size, after.mtimeNs, after.ctimeNs, sha256,
    ].join(':'),
    body,
  });
}

function validateRelative(path: string): void {
  if (
    path.length < 1
    || path.length > 4_096
    || isAbsolute(path)
    || path.endsWith('/')
    || /[\u0000-\u001f\u007f\\]/u.test(path)
    || path.split('/').some(component => (
      component === '' || component === '.' || component === '..' || component.length > 255
    ))
  ) fail();
}

export type GreaterRealmOpenAtHelper = Readonly<{
  root: string;
  mkdir: (relativePath: string) => void;
  writeFile: (relativePath: string, body: Buffer, mode: 0o600 | 0o644 | 0o700) => void;
  symlink: (relativePath: string, target: string, targetRootRelative: string) => void;
  finish: () => void;
}>;

/**
 * Runs exact commit-bound Python source via a root-owned system interpreter.
 * No compiled user-writable executable path exists. The protected outer
 * bootstrap independently pins both this source digest and the Apple runtime.
 */
export function stageGreaterRealmOpenAtHelper(input: Readonly<{
  root: string;
}>): GreaterRealmOpenAtHelper {
  const root = exactPrivateDirectory(input.root);
  const python = exactSystemPython();
  let sourceDescriptor: number | undefined = openSync(
    HELPER_SOURCE,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  let rootDescriptor: number | undefined = openSync(
    root.path,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  const source = exactSource(sourceDescriptor);
  const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(source.body);
  source.body.fill(0);
  const attestRoot = () => {
    const byFd = fstatSync(rootDescriptor!, { bigint: true });
    const byPath = lstatSync(root.path, { bigint: true });
    if (
      !byFd.isDirectory()
      || !byPath.isDirectory()
      || byPath.isSymbolicLink()
      || byFd.dev !== root.dev
      || byFd.ino !== root.ino
      || byPath.dev !== byFd.dev
      || byPath.ino !== byFd.ino
      || (byFd.mode & 0o7777n) !== 0o700n
      || byFd.uid !== root.uid
      || realpathSync(root.path) !== root.path
    ) fail();
  };
  const invoke = (arguments_: readonly string[], body?: Buffer) => {
    attestRoot();
    if (exactSystemPython().identity !== python.identity) fail();
    const sourceBefore = exactSource(sourceDescriptor!);
    sourceBefore.body.fill(0);
    if (sourceBefore.identity !== source.identity) fail();
    const result = spawnSync(python.path, [
      '-I', '-S', '-B', '-c', sourceText, ...arguments_,
    ], {
      cwd: root.path,
      encoding: 'buffer',
      env: { LANG: 'C', LC_ALL: 'C' },
      input: body,
      stdio: ['pipe', 'pipe', 'pipe', rootDescriptor!],
      timeout: 60_000,
      maxBuffer: 1_000_000,
    });
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || !Buffer.isBuffer(result.stdout)
      || !Buffer.isBuffer(result.stderr)
      || result.stdout.byteLength !== 0
      || result.stderr.byteLength !== 0
    ) fail('GREATER_REALM_OPENAT_HELPER_OPERATION_FAILED');
    const sourceAfter = exactSource(sourceDescriptor!);
    sourceAfter.body.fill(0);
    if (sourceAfter.identity !== source.identity) fail();
    if (exactSystemPython().identity !== python.identity) fail();
    attestRoot();
  };
  let finished = false;
  return Object.freeze({
    root: root.path,
    mkdir: (relativePath: string) => {
      if (finished) fail();
      validateRelative(relativePath);
      invoke(['mkdir', relativePath]);
    },
    writeFile: (relativePath: string, body: Buffer, mode: 0o600 | 0o644 | 0o700) => {
      if (finished || body.byteLength > MAX_HELPER_INPUT_BYTES) fail();
      validateRelative(relativePath);
      invoke(['write', relativePath, mode.toString(8), String(body.byteLength)], body);
    },
    symlink: (relativePath: string, target: string, targetRootRelative: string) => {
      if (finished) fail();
      validateRelative(relativePath);
      validateRelative(targetRootRelative);
      if (
        target.length < 1
        || target.length > 4_096
        || isAbsolute(target)
        || /[\u0000-\u001f\u007f\\]/u.test(target)
      ) fail();
      invoke(['symlink', relativePath, target, targetRootRelative]);
    },
    finish: () => {
      if (finished) return;
      attestRoot();
      const sourceAfter = exactSource(sourceDescriptor!);
      sourceAfter.body.fill(0);
      if (sourceAfter.identity !== source.identity) fail();
      closeSync(rootDescriptor!);
      rootDescriptor = undefined;
      closeSync(sourceDescriptor!);
      sourceDescriptor = undefined;
      finished = true;
    },
  });
}
