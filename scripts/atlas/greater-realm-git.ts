import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAXIMUM_ATTESTED_BINARY_BYTES = 512 * 1024 * 1024;
const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

export type GreaterRealmTrustedGitAttestation = Readonly<{
  binaryPath: string;
  binarySha256: string;
  execPath: string;
  version: string;
}>;

function fail(): never {
  throw new Error('GREATER_REALM_TOOLCHAIN_INVALID');
}

function pathInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function assertTrustedSystemPath(path: string, expectedKind: 'directory' | 'file'): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  const paths = [root];
  for (const component of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, component);
    paths.push(current);
  }
  for (let index = 0; index < paths.length; index += 1) {
    const currentPath = paths[index]!;
    const status = lstatSync(currentPath);
    const final = index === paths.length - 1;
    if (status.isSymbolicLink()) fail();
    if (final ? expectedKind === 'directory' && !status.isDirectory() : !final && !status.isDirectory()) {
      fail();
    }
    if (final && expectedKind === 'file' && !status.isFile()) fail();
    if (
      process.getuid !== undefined
      && status.uid !== 0
      || (status.mode & 0o022) !== 0
    ) fail();
  }
}

export function sha256GreaterRealmAttestedFile(
  path: string,
  allowedRoot?: string,
): Readonly<{ canonicalPath: string; sha256: string }> {
  let descriptor: number | undefined;
  try {
    const canonicalPath = realpathSync(path);
    if (allowedRoot !== undefined) {
      const canonicalRoot = realpathSync(allowedRoot);
      if (!pathInside(canonicalRoot, canonicalPath) || canonicalPath === canonicalRoot) fail();
    }
    const before = lstatSync(canonicalPath);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.size < 1
      || before.size > MAXIMUM_ATTESTED_BINARY_BYTES
      || (before.mode & 0o022) !== 0
      || (
        process.getuid !== undefined
        && before.uid !== 0
        && before.uid !== process.getuid()
      )
    ) fail();
    descriptor = openSync(canonicalPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.size !== before.size
      || opened.mtimeMs !== before.mtimeMs
      || opened.ctimeMs !== before.ctimeMs
    ) fail();
    const digest = createHash('sha256');
    const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, opened.size));
    try {
      let offset = 0;
      while (offset < opened.size) {
        const count = readSync(
          descriptor,
          chunk,
          0,
          Math.min(chunk.length, opened.size - offset),
          offset,
        );
        if (count <= 0) fail();
        digest.update(chunk.subarray(0, count));
        offset += count;
      }
    } finally {
      chunk.fill(0);
    }
    const after = fstatSync(descriptor);
    const current = lstatSync(canonicalPath);
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs
      || after.ctimeMs !== opened.ctimeMs
      || current.dev !== after.dev
      || current.ino !== after.ino
      || current.size !== after.size
      || realpathSync(path) !== canonicalPath
    ) fail();
    const sha256 = digest.digest('hex');
    if (!SHA256_PATTERN.test(sha256)) fail();
    return Object.freeze({ canonicalPath, sha256 });
  } catch (error) {
    if (error instanceof Error && error.message === 'GREATER_REALM_TOOLCHAIN_INVALID') {
      throw error;
    }
    return fail();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function trustedGitCandidates(): readonly string[] {
  if (process.platform === 'darwin') {
    return Object.freeze([
      '/Library/Developer/CommandLineTools/usr/bin/git',
      '/usr/bin/git',
    ]);
  }
  if (process.platform === 'win32') {
    return Object.freeze([
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
    ]);
  }
  return Object.freeze(['/usr/bin/git']);
}

function baseEnvironment(execPath?: string): NodeJS.ProcessEnv {
  return {
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: NULL_DEVICE,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: NULL_DEVICE,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
    PAGER: 'cat',
    ...(execPath === undefined ? {} : { GIT_EXEC_PATH: execPath }),
    ...(process.platform === 'win32' ? {
      ComSpec: process.env.ComSpec,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
    } : {}),
  };
}

function rawGit(
  binaryPath: string,
  arguments_: readonly string[],
  execPath?: string,
): SpawnSyncReturns<string> {
  return spawnSync(binaryPath, [...arguments_], {
    cwd: parse(binaryPath).root,
    encoding: 'utf8',
    env: baseEnvironment(execPath),
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
}

let cachedAttestation: GreaterRealmTrustedGitAttestation | undefined;

export function inspectGreaterRealmTrustedGit(): GreaterRealmTrustedGitAttestation {
  if (cachedAttestation !== undefined) return cachedAttestation;
  const requested = trustedGitCandidates().find(candidate => existsSync(candidate));
  if (requested === undefined) fail();
  const binary = sha256GreaterRealmAttestedFile(requested);
  assertTrustedSystemPath(binary.canonicalPath, 'file');
  const execResult = rawGit(binary.canonicalPath, ['--exec-path']);
  const execPathValue = execResult.stdout.trim();
  if (
    execResult.error
    || execResult.status !== 0
    || execResult.stderr.length !== 0
    || !isAbsolute(execPathValue)
    || !existsSync(execPathValue)
  ) fail();
  const execPath = realpathSync(execPathValue);
  assertTrustedSystemPath(execPath, 'directory');
  const versionResult = rawGit(binary.canonicalPath, ['--version'], execPath);
  const version = versionResult.stdout.trim();
  if (
    versionResult.error
    || versionResult.status !== 0
    || versionResult.stderr.length !== 0
    || !/^git version [0-9][ -~]{0,126}$/u.test(version)
  ) fail();
  cachedAttestation = Object.freeze({
    binaryPath: binary.canonicalPath,
    binarySha256: binary.sha256,
    execPath,
    version,
  });
  return cachedAttestation;
}

export function runGreaterRealmTrustedGit(
  arguments_: readonly string[],
  cwd: string,
): SpawnSyncReturns<string> {
  if (
    !Array.isArray(arguments_)
    || arguments_.length === 0
    || arguments_.length > 256
    || arguments_.some(argument => (
      typeof argument !== 'string'
      || argument.length === 0
      || argument.length > 4_096
      || argument.includes('\0')
    ))
    || !isAbsolute(cwd)
  ) fail();
  const git = inspectGreaterRealmTrustedGit();
  return spawnSync(git.binaryPath, [
    '--no-pager',
    '--no-optional-locks',
    '--no-replace-objects',
    '-c', `core.hooksPath=${NULL_DEVICE}`,
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    ...arguments_,
  ], {
    cwd,
    encoding: 'utf8',
    env: baseEnvironment(git.execPath),
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  });
}
