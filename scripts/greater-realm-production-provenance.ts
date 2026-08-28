import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  runGreaterRealmTrustedGit,
  inspectGreaterRealmTrustedGit,
  sha256GreaterRealmAttestedFile,
} from './atlas/greater-realm-git';
import type { GreaterRealmRuntimeReleaseArtifacts } from './atlas/greater-realm-runtime-release';
import {
  readGreaterRealmRuntimeRelease,
  verifyGreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  openGreaterRealmPrivateWorkspace,
  type GreaterRealmPrivateWorkspace,
} from './atlas/greater-realm-private-workspace';
import { stageGreaterRealmOpenAtHelper } from './greater-realm-openat';

const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const GATE_POLICY_PATH = 'spacetimedb/src/greaterRealmV17Policy.ts';
const PUBLISHER_POLICY_PATH = 'scripts/greater-realm-production-publisher-core.ts';
const IMPORT_GATE_FALSE = 'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;';
const IMPORT_GATE_TRUE = 'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;';
const ACTIVATION_GATE_FALSE = 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;';
const ACTIVATION_GATE_TRUE = 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;';
const ENTRY_APPROVAL_FALSE = '  entryAgreementApproved: false,';
const ENTRY_APPROVAL_TRUE = '  entryAgreementApproved: true,';
const ADDITIVE_APPROVAL_FALSE = '  additivePublishApproved: false,';
const ADDITIVE_APPROVAL_TRUE = '  additivePublishApproved: true,';
const IMPORT_FORWARD_FALSE = '  importForwardFixApproved: false,';
const IMPORT_FORWARD_TRUE = '  importForwardFixApproved: true,';
const ACTIVATION_FORWARD_FALSE = '  activationForwardFixApproved: false,';
const ACTIVATION_FORWARD_TRUE = '  activationForwardFixApproved: true,';

export type GreaterRealmProductionProvenance = Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
}>;

export class GreaterRealmProductionProvenanceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionProvenanceError';
  }
}

function productionGitContext(repositoryRoot: string) {
  let root: string;
  let gitDirectory: string;
  let commonDirectory: string;
  const contextFiles: string[] = [];
  try {
    root = realpathSync(repositoryRoot);
    const requested = resolve(repositoryRoot);
    const rootStatus = lstatSync(requested);
    const dotGit = join(root, '.git');
    const dotGitStatus = lstatSync(dotGit);
    if (
      root !== requested
      || !rootStatus.isDirectory()
      || rootStatus.isSymbolicLink()
      || (process.getuid !== undefined && rootStatus.uid !== process.getuid())
      || (rootStatus.mode & 0o022) !== 0
      || dotGitStatus.isSymbolicLink()
      || (process.getuid !== undefined && dotGitStatus.uid !== process.getuid())
      || (dotGitStatus.mode & 0o022) !== 0
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    if (dotGitStatus.isDirectory()) {
      if (realpathSync(dotGit) !== dotGit) {
        fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
      }
      gitDirectory = dotGit;
    } else if (dotGitStatus.isFile() && dotGitStatus.size > 8 && dotGitStatus.size <= 4_096) {
      const body = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(dotGit));
      const match = body.match(/^gitdir: (\/[ -~]{1,4000})\n?$/u);
      if (match === null || resolve(match[1]!) !== match[1]) {
        fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
      }
      gitDirectory = realpathSync(match[1]!);
      const gitStatus = lstatSync(gitDirectory);
      if (
        !gitStatus.isDirectory()
        || gitStatus.isSymbolicLink()
        || (process.getuid !== undefined && gitStatus.uid !== process.getuid())
        || (gitStatus.mode & 0o022) !== 0
      ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
      contextFiles.push(dotGit);
    } else {
      fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    }
    const commonPointer = join(gitDirectory, 'commondir');
    if (existsSync(commonPointer)) {
      const pointerStatus = lstatSync(commonPointer);
      if (
        !pointerStatus.isFile()
        || pointerStatus.isSymbolicLink()
        || pointerStatus.size < 1
        || pointerStatus.size > 4_096
        || (process.getuid !== undefined && pointerStatus.uid !== process.getuid())
        || (pointerStatus.mode & 0o022) !== 0
      ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
      const pointer = new TextDecoder('utf-8', { fatal: true })
        .decode(readFileSync(commonPointer));
      const match = pointer.match(/^([^\0\r\n]{1,4000})\n?$/u);
      if (match === null) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
      commonDirectory = realpathSync(resolve(gitDirectory, match[1]!));
      contextFiles.push(commonPointer);
    } else {
      commonDirectory = gitDirectory;
    }
    const commonStatus = lstatSync(commonDirectory);
    if (
      !commonStatus.isDirectory()
      || commonStatus.isSymbolicLink()
      || (process.getuid !== undefined && commonStatus.uid !== process.getuid())
      || (commonStatus.mode & 0o022) !== 0
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  } catch (error) {
    if (error instanceof GreaterRealmProductionProvenanceError) throw error;
    return fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  }
  const configurationPath = join(commonDirectory, 'config');
  contextFiles.push(configurationPath);
  const worktreeConfigurationPath = join(gitDirectory, 'config.worktree');
  if (existsSync(worktreeConfigurationPath)) contextFiles.push(worktreeConfigurationPath);
  const informationExcludePath = join(commonDirectory, 'info', 'exclude');
  if (existsSync(informationExcludePath)) contextFiles.push(informationExcludePath);
  const forbiddenAbsentPaths = [
    join(commonDirectory, 'info', 'grafts'),
    join(commonDirectory, 'info', 'attributes'),
    join(commonDirectory, 'objects', 'info', 'alternates'),
    join(commonDirectory, 'shallow'),
  ];
  const optionalAbsentPaths = [
    ...(existsSync(worktreeConfigurationPath) ? [] : [worktreeConfigurationPath]),
    ...(existsSync(informationExcludePath) ? [] : [informationExcludePath]),
  ];
  const directoryBefore = new Map<string, Readonly<{
    dev: number;
    ino: number;
    mode: number;
    uid: number;
    mtimeMs: number;
    ctimeMs: number;
  }>>();
  for (const directory of [
    join(commonDirectory, 'info'),
    join(commonDirectory, 'objects', 'info'),
  ]) {
    const status = lstatSync(directory);
    if (
      status.isSymbolicLink()
      || !status.isDirectory()
      || realpathSync(directory) !== directory
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o022) !== 0
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    directoryBefore.set(directory, Object.freeze({
      dev: status.dev,
      ino: status.ino,
      mode: status.mode & 0o7777,
      uid: status.uid,
      mtimeMs: status.mtimeMs,
      ctimeMs: status.ctimeMs,
    }));
  }
  if (!pathInside(commonDirectory, gitDirectory)) {
    fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  }
  for (const path of [...contextFiles, ...forbiddenAbsentPaths, ...optionalAbsentPaths]) {
    if (path !== join(root, '.git') && !pathInside(commonDirectory, path)) {
      fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    }
  }
  for (const forbiddenPath of forbiddenAbsentPaths) {
    if (existsSync(forbiddenPath)) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  }
  const attestContextFile = (path: string) => {
    const before = lstatSync(path, { bigint: true });
    if (
      before.isSymbolicLink()
      || !before.isFile()
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n && (before.mode & 0o7777n) !== 0o644n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    const sha256 = sha256GreaterRealmAttestedFile(path, resolve(path, '..')).sha256;
    const after = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    return Object.freeze({
      sha256,
      dev: after.dev,
      ino: after.ino,
      mode: after.mode,
      nlink: after.nlink,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    });
  };
  const contextBefore = new Map(contextFiles.map(path => [path, attestContextFile(path)]));
  const prefix = Object.freeze([
    `--git-dir=${gitDirectory}`,
    `--work-tree=${root}`,
    '-c', 'core.bare=false',
    '-c', `core.worktree=${root}`,
    '-c', 'http.proxy=',
    '-c', 'https.proxy=',
    '-c', 'http.sslVerify=true',
    '-c', 'core.commitGraph=false',
    '-c', 'core.attributesFile=/dev/null',
    '-c', 'core.excludesFile=/dev/null',
    '-c', 'core.autocrlf=false',
    '-c', 'core.eol=lf',
    '-c', 'core.symlinks=true',
  ] as const);
  const run = (arguments_: readonly string[]) => runGreaterRealmTrustedGit(
    [...prefix, ...arguments_],
    root,
  );
  const readBlob = (objectId: string): Buffer => {
    if (!COMMIT.test(objectId)) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    const trusted = inspectGreaterRealmTrustedGit();
    const result = spawnSync(trusted.binaryPath, [
      '--no-pager',
      '--no-optional-locks',
      '--no-replace-objects',
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false',
      ...prefix,
      'cat-file', 'blob', objectId,
    ], {
      cwd: root,
      encoding: 'buffer',
      env: {
        GIT_ATTR_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_EXEC_PATH: trusted.execPath,
        GIT_OPTIONAL_LOCKS: '0',
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
        PAGER: 'cat',
      },
      maxBuffer: 512 * 1024 * 1024 + 1024,
      timeout: 60_000,
    });
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || !Buffer.isBuffer(result.stdout)
      || !Buffer.isBuffer(result.stderr)
      || result.stderr.byteLength !== 0
      || result.stdout.byteLength > 512 * 1024 * 1024
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    return result.stdout;
  };
  const read = (arguments_: readonly string[], allowMissing = false): string | undefined => {
    const result = run(arguments_);
    if (
      result.error !== undefined
      || result.stderr !== ''
      || (result.status !== 0 && !(allowMissing && result.status === 1))
    ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    return result.status === 0 ? result.stdout : undefined;
  };
  const localNames = (read(['config', '--local', '--null', '--name-only', '--list']) ?? '')
    .split('\0').filter(Boolean).map(value => value.toLowerCase());
  const allowedLocalName = (name: string) => (
    name === 'core.repositoryformatversion'
    || name === 'core.filemode'
    || name === 'core.bare'
    || name === 'core.logallrefupdates'
    || name === 'core.ignorecase'
    || name === 'core.precomposeunicode'
    || name === 'remote.origin.url'
    || name === 'remote.origin.fetch'
    || name === 'extensions.worktreeconfig'
    || name === 'gpg.format'
    || name === 'user.signingkey'
    || name === 'commit.gpgsign'
    || /^branch\.[a-z0-9._\/-]{1,255}\.(?:remote|merge)$/u.test(name)
  );
  const worktreeNames = (existsSync(worktreeConfigurationPath)
    ? (read(['config', '--worktree', '--null', '--name-only', '--list']) ?? '')
    : '')
    .split('\0').filter(Boolean).map(value => value.toLowerCase());
  const worktreeConfigEnabled = exactSingleLine(
    read(['config', '--local', '--get', 'extensions.worktreeConfig'], true) ?? '',
  );
  const bare = exactSingleLine(read(['config', '--local', '--get', 'core.bare']) ?? '');
  const repositoryFormat = exactSingleLine(
    read(['config', '--local', '--get', 'core.repositoryformatversion']) ?? '',
  );
  const fileMode = exactSingleLine(read(['config', '--local', '--get', 'core.filemode']) ?? '');
  const topLevel = exactSingleLine(read(['rev-parse', '--show-toplevel']) ?? '');
  const absoluteGitDirectory = exactSingleLine(
    read(['rev-parse', '--path-format=absolute', '--git-dir']) ?? '',
  );
  const absoluteCommonDirectory = exactSingleLine(
    read(['rev-parse', '--path-format=absolute', '--git-common-dir']) ?? '',
  );
  const isBare = exactSingleLine(read(['rev-parse', '--is-bare-repository']) ?? '');
  const insideWorkTree = exactSingleLine(read(['rev-parse', '--is-inside-work-tree']) ?? '');
  if (
    localNames.some(name => !allowedLocalName(name))
    || worktreeNames.length !== 0
    || (worktreeConfigEnabled !== undefined && worktreeConfigEnabled !== 'true')
    || repositoryFormat !== '0'
    || fileMode !== 'true'
    || bare !== 'false'
    || topLevel !== root
    || absoluteGitDirectory !== gitDirectory
    || absoluteCommonDirectory !== commonDirectory
    || isBare !== 'false'
    || insideWorkTree !== 'true'
  ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  return Object.freeze({
    root,
    gitDirectory,
    commonDirectory,
    run,
    read,
    readBlob,
    finish: () => {
      for (const [path, before] of contextBefore) {
        const after = attestContextFile(path);
        if (
          after.sha256 !== before.sha256
          || after.dev !== before.dev
          || after.ino !== before.ino
          || after.mode !== before.mode
          || after.nlink !== before.nlink
          || after.size !== before.size
          || after.mtimeNs !== before.mtimeNs
          || after.ctimeNs !== before.ctimeNs
        ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_CHANGED');
      }
      for (const path of [...forbiddenAbsentPaths, ...optionalAbsentPaths]) {
        if (existsSync(path)) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_CHANGED');
      }
      for (const [path, before] of directoryBefore) {
        const after = lstatSync(path);
        if (
          after.isSymbolicLink()
          || !after.isDirectory()
          || realpathSync(path) !== path
          || after.dev !== before.dev
          || after.ino !== before.ino
          || (after.mode & 0o7777) !== before.mode
          || after.uid !== before.uid
          || after.mtimeMs !== before.mtimeMs
          || after.ctimeMs !== before.ctimeMs
        ) fail('GREATER_REALM_PRODUCTION_GIT_CONTEXT_CHANGED');
      }
    },
  });
}

function pathInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function exactPathAbsent(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

export type GreaterRealmProductionCommitMaterialization = Readonly<{
  root: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  verify: (allowedUntracked?: Readonly<{
    prefixes?: readonly string[];
    files?: readonly string[];
  }>) => void;
  cleanup: () => void;
}>;

type MaterializedTrackedFileIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  mode: bigint;
  uid: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

type GreaterRealmTrackedTreeEntry = Readonly<{
  path: string;
  objectId: string;
  size: number;
}>;

function parseExactRegularTree(
  output: string,
): readonly GreaterRealmTrackedTreeEntry[] {
  const entries: GreaterRealmTrackedTreeEntry[] = [];
  const paths = new Set<string>();
  let previousPath: string | undefined;
  let totalBytes = 0;
  for (const record of output.split('\0')) {
    if (record === '') continue;
    const match = record.match(
      /^100644 blob ([0-9a-f]{40}) +([0-9]{1,12})\t([A-Za-z0-9._/@+-]{1,4096})$/u,
    );
    const size = match === null ? -1 : Number(match[2]);
    if (
      match === null
      || !Number.isSafeInteger(size)
      || size < 0
      || size > 512 * 1024 * 1024
      || match[3]!.startsWith('/')
      || match[3]!.split('/').some(component => (
        component === '' || component === '.' || component === '..'
      ))
      || paths.has(match[3]!)
      || (previousPath !== undefined && Buffer.compare(
        Buffer.from(previousPath, 'utf8'), Buffer.from(match[3]!, 'utf8'),
      ) >= 0)
      || entries.length >= 100_000
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
    totalBytes += size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > 2 * 1024 * 1024 * 1024) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
    }
    paths.add(match[3]!);
    previousPath = match[3]!;
    entries.push(Object.freeze({ objectId: match[1]!, size, path: match[3]! }));
  }
  if (entries.length < 1) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
  return Object.freeze(entries);
}

function exactMaterializedBlob(input: Readonly<{
  root: string;
  path: string;
  expectedObjectId: string;
  expectedIdentity?: MaterializedTrackedFileIdentity;
}>): MaterializedTrackedFileIdentity {
  const path = join(input.root, ...input.path.split('/'));
  let descriptor: number | undefined;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    if (realpathSync(path) !== path) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    }
    const before = lstatSync(path, { bigint: true });
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || (before.mode & 0o7777n) !== 0o644n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || before.nlink !== 1n
      || before.size < 0n
      || before.size > 512n * 1024n * 1024n
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== before.dev
      || opened.ino !== before.ino
      || (opened.mode & 0o7777n) !== 0o644n
      || opened.size !== before.size
      || opened.mtimeNs !== before.mtimeNs
      || opened.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    const digest = createHash('sha1');
    digest.update(`blob ${opened.size.toString()}\0`, 'utf8');
    let offset = 0n;
    while (offset < opened.size) {
      const count = readSync(
        descriptor,
        buffer,
        0,
        Number((opened.size - offset) > BigInt(buffer.byteLength)
          ? BigInt(buffer.byteLength)
          : (opened.size - offset)),
        Number(offset),
      );
      if (count <= 0) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
      digest.update(buffer.subarray(0, count));
      offset += BigInt(count);
    }
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    const identity = Object.freeze({
      dev: after.dev,
      ino: after.ino,
      mode: after.mode & 0o7777n,
      uid: after.uid,
      nlink: after.nlink,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    });
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || (after.mode & 0o7777n) !== 0o644n
      || after.uid !== opened.uid
      || after.nlink !== 1n
      || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs
      || current.dev !== after.dev
      || current.ino !== after.ino
      || current.size !== after.size
      || (current.mode & 0o7777n) !== 0o644n
      || current.uid !== after.uid
      || current.nlink !== 1n
      || current.mtimeNs !== after.mtimeNs
      || current.ctimeNs !== after.ctimeNs
      || realpathSync(path) !== path
      || digest.digest('hex') !== input.expectedObjectId
      || (input.expectedIdentity !== undefined && (
        identity.dev !== input.expectedIdentity.dev
        || identity.ino !== input.expectedIdentity.ino
        || identity.mode !== input.expectedIdentity.mode
        || identity.uid !== input.expectedIdentity.uid
        || identity.nlink !== input.expectedIdentity.nlink
        || identity.size !== input.expectedIdentity.size
        || identity.mtimeNs !== input.expectedIdentity.mtimeNs
        || identity.ctimeNs !== input.expectedIdentity.ctimeNs
      ))
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_CHANGED');
    return identity;
  } catch (error) {
    if (error instanceof GreaterRealmProductionProvenanceError) throw error;
    return fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
  } finally {
    buffer.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactPartialMaterializedBlob(input: Readonly<{
  root: string;
  path: string;
}>): void {
  const path = join(input.root, ...input.path.split('/'));
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path, { bigint: true });
    if (
      !before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o644n
      || before.size < 0n || before.size > 512n * 1024n * 1024n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    const after = lstatSync(path, { bigint: true });
    if (
      opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode
      || opened.uid !== before.uid || opened.nlink !== before.nlink || opened.size !== before.size
      || opened.mtimeNs !== before.mtimeNs || opened.ctimeNs !== before.ctimeNs
      || after.dev !== opened.dev || after.ino !== opened.ino || after.mode !== opened.mode
      || after.uid !== opened.uid || after.nlink !== opened.nlink || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_CHANGED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateMaterializationAllowance(input: Readonly<{
  prefixes?: readonly string[];
  files?: readonly string[];
}>): Readonly<{ prefixes: readonly string[]; files: ReadonlySet<string> }> {
  const prefixes = input.prefixes ?? [];
  const files = new Set(input.files ?? []);
  const invalid = (path: string, directory: boolean) => {
    const normalized = directory && path.endsWith('/') ? path.slice(0, -1) : path;
    return path.length < 1
      || normalized.length < 1
      || path.startsWith('/')
      || path.includes('\0')
      || normalized.split('/').some(component => (
        component === '' || component === '.' || component === '..'
      ))
      || (directory ? !path.endsWith('/') : path.endsWith('/'));
  };
  if (prefixes.some(prefix => invalid(prefix, true)) || [...files].some(file => invalid(file, false))) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_UNTRACKED_FILE_REJECTED');
  }
  return Object.freeze({ prefixes: Object.freeze([...prefixes]), files });
}

function fsyncProductionDirectory(path: string): void {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const status = fstatSync(descriptor, { bigint: true });
    if (
      !status.isDirectory()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function rawMaterializationInventory(input: Readonly<{
  destination: string;
  rootIdentity: Readonly<{ dev: number; ino: number }>;
  trackedTree: readonly GreaterRealmTrackedTreeEntry[];
  trackedIdentities?: Map<string, MaterializedTrackedFileIdentity>;
  allowedUntracked?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>;
  allowMissingTracked?: boolean;
  allowPartialTracked?: boolean;
}>): Readonly<{
  presentTracked: readonly GreaterRealmTrackedTreeEntry[];
  directories: readonly string[];
}> {
  const allowance = validateMaterializationAllowance(input.allowedUntracked ?? {});
  const rootStatus = lstatSync(input.destination, { bigint: true });
  if (
    rootStatus.isSymbolicLink()
    || !rootStatus.isDirectory()
    || (rootStatus.mode & 0o7777n) !== 0o700n
    || (process.getuid !== undefined && rootStatus.uid !== BigInt(process.getuid()))
    || rootStatus.dev !== BigInt(input.rootIdentity.dev)
    || rootStatus.ino !== BigInt(input.rootIdentity.ino)
    || realpathSync(input.destination) !== input.destination
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
  const leaves = new Set<string>();
  const directories: string[] = [];
  const walk = (directory: string, logical: string) => {
    const before = lstatSync(directory, { bigint: true });
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || (before.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || realpathSync(directory) !== directory
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
    const names = readdirSync(directory).sort((left, right) => Buffer.compare(
      Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'),
    ));
    for (const name of names) {
      if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
        fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
      }
      const childLogical = logical === '' ? name : `${logical}/${name}`;
      const child = join(directory, name);
      const status = lstatSync(child, { bigint: true });
      if (status.isDirectory() && !status.isSymbolicLink()) {
        directories.push(childLogical);
        walk(child, childLogical);
      } else {
        leaves.add(childLogical);
      }
    }
    const after = lstatSync(directory, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.uid !== before.uid
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
  };
  walk(input.destination, '');
  const tracked = new Map(input.trackedTree.map(entry => [entry.path, entry]));
  const permitted = (path: string) => allowance.files.has(path)
    || allowance.prefixes.some(prefix => path.startsWith(prefix));
  for (const leaf of leaves) {
    if (!tracked.has(leaf) && !permitted(leaf)) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_UNTRACKED_FILE_REJECTED');
    }
  }
  for (const directory of directories) {
    const prefix = `${directory}/`;
    if (
      !input.trackedTree.some(entry => entry.path.startsWith(prefix))
      && !allowance.prefixes.some(allowed => (
        allowed.startsWith(prefix) || prefix.startsWith(allowed)
      ))
      && ![...allowance.files].some(file => file.startsWith(prefix))
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_UNTRACKED_FILE_REJECTED');
  }
  const presentTracked: GreaterRealmTrackedTreeEntry[] = [];
  for (const entry of input.trackedTree) {
    if (!leaves.has(entry.path)) {
      if (!input.allowMissingTracked) {
        fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
      }
      continue;
    }
    if (input.allowPartialTracked) {
      exactPartialMaterializedBlob({ root: input.destination, path: entry.path });
    }
    const identity = input.allowPartialTracked
      ? undefined
      : exactMaterializedBlob({
          root: input.destination,
          path: entry.path,
          expectedObjectId: entry.objectId,
          expectedIdentity: input.trackedIdentities?.get(entry.path),
        });
    if (input.trackedIdentities !== undefined && !input.trackedIdentities.has(entry.path)) {
      if (identity === undefined) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
      input.trackedIdentities.set(entry.path, identity);
    }
    presentTracked.push(entry);
  }
  return Object.freeze({
    presentTracked: Object.freeze(presentTracked),
    directories: Object.freeze(directories),
  });
}

function verifyExactProductionWorkingTree(input: Readonly<{
  git: ReturnType<typeof productionGitContext>;
  root: string;
  commit: string;
}>): void {
  const trackedTree = parseExactRegularTree(
    input.git.read(['ls-tree', '-r', '-z', '-l', '--full-tree', input.commit]) ?? '',
  );
  for (const entry of trackedTree) {
    exactMaterializedBlob({
      root: input.root,
      path: entry.path,
      expectedObjectId: entry.objectId,
    });
  }
  const ordinary = (input.git.read([
    'ls-files', '--others', '--exclude-standard', '-z',
  ]) ?? '').split('\0').filter(Boolean);
  const ignored = (input.git.read([
    'ls-files', '--others', '--ignored', '--exclude-standard', '-z',
  ]) ?? '').split('\0').filter(Boolean);
  const allowedIgnoredPrefixes = [
    'node_modules/',
    'services/auth-bridge/node_modules/',
    'spacetimedb/node_modules/',
    ...Array.from({ length: 16 }, (_, index) => (
      `spacetimedb/migration-fixtures/additive-v${index + 2}-schema/node_modules/`
    )),
    'spacetimedb/migration-fixtures/current-candidate-inspection/node_modules/',
    'spacetimedb/migration-fixtures/production-v1/node_modules/',
  ];
  if (
    ordinary.length !== 0
    || ignored.some(path => !allowedIgnoredPrefixes.some(prefix => path.startsWith(prefix)))
  ) fail('GREATER_REALM_PRODUCTION_WORKING_TREE_INVALID');
}

function bindGreaterRealmProductionCommitMaterialization(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  destination: string;
  expectedRootIdentity?: Readonly<{ dev: number; ino: number }>;
}>): GreaterRealmProductionCommitMaterialization {
  const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
  const destination = resolve(input.destination);
  const status = lstatSync(destination);
  if (
    status.isSymbolicLink()
    || !status.isDirectory()
    || (status.mode & 0o7777) !== 0o700
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || realpathSync(destination) !== destination
    || pathInside(repositoryRoot, destination)
    || pathInside(destination, repositoryRoot)
    || (input.expectedRootIdentity !== undefined && (
      status.dev !== input.expectedRootIdentity.dev
      || status.ino !== input.expectedRootIdentity.ino
    ))
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  const opened = Object.freeze({ dev: status.dev, ino: status.ino });
  const repositoryGit = productionGitContext(repositoryRoot);
  let trackedTree: readonly GreaterRealmTrackedTreeEntry[];
  try {
    const expectedTree = exactSingleLine(
      repositoryGit.read(['rev-parse', '--verify', `${input.moduleSourceCommit}^{tree}`]) ?? '',
    );
    if (expectedTree !== input.moduleTreeId) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
    }
    trackedTree = parseExactRegularTree(
      repositoryGit.read([
        'ls-tree', '-r', '-z', '-l', '--full-tree', input.moduleSourceCommit,
      ]) ?? '',
    );
  } finally {
    repositoryGit.finish();
  }
  const trackedIdentities = new Map<string, MaterializedTrackedFileIdentity>();
  let cleaned = false;
  const verify = (allowedUntracked: Readonly<{
    prefixes?: readonly string[];
    files?: readonly string[];
  }> = {}) => {
    if (cleaned) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
    const current = lstatSync(destination);
    if (
      current.isSymbolicLink()
      || !current.isDirectory()
      || (current.mode & 0o7777) !== 0o700
      || (process.getuid !== undefined && current.uid !== process.getuid())
      || current.dev !== opened.dev
      || current.ino !== opened.ino
      || realpathSync(destination) !== destination
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CHANGED');
    rawMaterializationInventory({
      destination,
      rootIdentity: opened,
      trackedTree,
      trackedIdentities,
      allowedUntracked,
    });
  };
  return Object.freeze({
    root: destination,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleTreeId: input.moduleTreeId,
    verify,
    cleanup: () => {
      if (cleaned) return;
      cleanupGreaterRealmProductionCommitMaterialization({
        repositoryRoot,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: input.moduleTreeId,
        destination,
        expectedRootIdentity: opened,
      });
      cleaned = true;
    },
  });
}

/** Reopens a retained private raw tree for journal reconciliation/cleanup. */
export function openGreaterRealmProductionCommitMaterialization(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  destination: string;
  expectedRootIdentity: Readonly<{ dev: number; ino: number }>;
  allowedUntracked?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>;
}>): GreaterRealmProductionCommitMaterialization {
  if (
    !COMMIT.test(input.moduleSourceCommit)
    || !COMMIT.test(input.moduleTreeId)
    || !isAbsolute(input.destination)
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  const materialization = bindGreaterRealmProductionCommitMaterialization(input);
  materialization.verify(input.allowedUntracked);
  return materialization;
}

/** Proves a journal-cleaned raw materialization has no remaining inode. */
export function attestGreaterRealmProductionCommitMaterializationRemoved(input: Readonly<{
  repositoryRoot: string;
  destination: string;
}>): void {
  if (!isAbsolute(input.destination) || !exactPathAbsent(input.destination)) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
  }
  const destination = resolve(input.destination);
  const parent = realpathSync(dirname(destination));
  const parentStatus = lstatSync(parent);
  if (
    dirname(destination) !== parent
    || parentStatus.isSymbolicLink()
    || !parentStatus.isDirectory()
    || (parentStatus.mode & 0o7777) !== 0o700
    || (process.getuid !== undefined && parentStatus.uid !== process.getuid())
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
}

/** A private unregistered raw tree whose tracked bytes are bound to one commit. */
export function resolveGreaterRealmProductionCommitTreeId(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
}>): string {
  if (!COMMIT.test(input.moduleSourceCommit)) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  }
  const git = productionGitContext(realpathSync(resolve(input.repositoryRoot)));
  try {
    const exists = git.run(['cat-file', '-e', `${input.moduleSourceCommit}^{commit}`]);
    const tree = exactSingleLine(
      git.read(['rev-parse', '--verify', `${input.moduleSourceCommit}^{tree}`]) ?? '',
    );
    if (exists.error !== undefined || exists.status !== 0 || tree === undefined || !COMMIT.test(tree)) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
    }
    return tree;
  } finally {
    git.finish();
  }
}

/** A private unregistered raw tree whose tracked bytes are bound to one commit. */
export function createGreaterRealmProductionCommitMaterialization(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  destination: string;
}>): GreaterRealmProductionCommitMaterialization {
  if (!COMMIT.test(input.moduleSourceCommit) || !isAbsolute(input.destination)) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  }
  const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
  const destination = resolve(input.destination);
  const parent = realpathSync(dirname(destination));
  const parentStatus = lstatSync(parent);
  if (
    !exactPathAbsent(destination)
    || pathInside(repositoryRoot, destination)
    || pathInside(destination, repositoryRoot)
    || parentStatus.isSymbolicLink()
    || !parentStatus.isDirectory()
    || (process.getuid !== undefined && parentStatus.uid !== process.getuid())
    || (parentStatus.mode & 0o077) !== 0
    || dirname(destination) !== parent
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  const git = productionGitContext(repositoryRoot);
  let moduleTreeId: string | undefined;
  let trackedTree: readonly GreaterRealmTrackedTreeEntry[] = [];
  const writer = stageGreaterRealmOpenAtHelper({ root: parent });
  let created = false;
  let completed = false;
  let primaryError: unknown;
  try {
    const exists = git.run(['cat-file', '-e', `${input.moduleSourceCommit}^{commit}`]);
    moduleTreeId = exactSingleLine(
      git.read(['rev-parse', '--verify', `${input.moduleSourceCommit}^{tree}`]) ?? '',
    );
    trackedTree = parseExactRegularTree(
      git.read(['ls-tree', '-r', '-z', '-l', '--full-tree', input.moduleSourceCommit]) ?? '',
    );
    if (
      exists.error !== undefined
      || exists.status !== 0
      || moduleTreeId === undefined
      || !COMMIT.test(moduleTreeId)
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
    const destinationName = destination.slice(parent.length + 1);
    if (destinationName.length < 1 || destinationName.includes('/')) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
    }
    writer.mkdir(destinationName);
    created = true;
    for (const entry of trackedTree) {
      const body = git.readBlob(entry.objectId);
      try {
        const objectId = createHash('sha1')
          .update(`blob ${body.byteLength}\0`, 'utf8')
          .update(body)
          .digest('hex');
        if (body.byteLength !== entry.size || objectId !== entry.objectId) {
          fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
        }
        writer.writeFile(`${destinationName}/${entry.path}`, body, 0o644);
      } finally {
        body.fill(0);
      }
    }
    completed = true;
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try { git.finish(); } catch (error) { cleanupErrors.push(error); }
    try { writer.finish(); } catch (error) { cleanupErrors.push(error); }
    if (primaryError !== undefined || cleanupErrors.length !== 0) {
      throw new AggregateError(
        [...(primaryError === undefined ? [] : [primaryError]), ...cleanupErrors],
        'GREATER_REALM_PRODUCTION_MATERIALIZATION_FAILED',
      );
    }
  }
  if (!created || !completed) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_INVALID');
  const materialization = bindGreaterRealmProductionCommitMaterialization({
    repositoryRoot,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleTreeId: moduleTreeId!,
    destination,
  });
  materialization.verify();
  return materialization;
}

/**
 * Removes only an exact present subset of the commit tree. This makes raw-tree
 * teardown resumable after a crash without ever broad-deleting unknown data.
 */
export function cleanupGreaterRealmProductionCommitMaterialization(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  destination: string;
  expectedRootIdentity: Readonly<{ dev: number; ino: number }>;
  allowPartialTracked?: boolean;
}>): void {
  if (!isAbsolute(input.destination)) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
  }
  const destination = resolve(input.destination);
  if (exactPathAbsent(destination)) {
    attestGreaterRealmProductionCommitMaterializationRemoved({
      repositoryRoot: input.repositoryRoot,
      destination,
    });
    return;
  }
  const git = productionGitContext(realpathSync(resolve(input.repositoryRoot)));
  let trackedTree: readonly GreaterRealmTrackedTreeEntry[];
  try {
    const tree = exactSingleLine(
      git.read(['rev-parse', '--verify', `${input.moduleSourceCommit}^{tree}`]) ?? '',
    );
    if (tree !== input.moduleTreeId) {
      fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
    }
    trackedTree = parseExactRegularTree(
      git.read(['ls-tree', '-r', '-z', '-l', '--full-tree', input.moduleSourceCommit]) ?? '',
    );
  } finally {
    git.finish();
  }
  const inventory = rawMaterializationInventory({
    destination,
    rootIdentity: input.expectedRootIdentity,
    trackedTree,
    allowMissingTracked: true,
    allowPartialTracked: input.allowPartialTracked,
  });
  for (const entry of [...inventory.presentTracked].reverse()) {
    const path = join(destination, ...entry.path.split('/'));
    if (input.allowPartialTracked) {
      exactPartialMaterializedBlob({ root: destination, path: entry.path });
    } else {
      exactMaterializedBlob({ root: destination, path: entry.path, expectedObjectId: entry.objectId });
    }
    unlinkSync(path);
    fsyncProductionDirectory(dirname(path));
  }
  for (const relativeDirectory of [...inventory.directories].sort((left, right) => (
    right.split('/').length - left.split('/').length
    || Buffer.compare(Buffer.from(right, 'utf8'), Buffer.from(left, 'utf8'))
  ))) {
    const path = join(destination, ...relativeDirectory.split('/'));
    if (exactPathAbsent(path)) continue;
    const status = lstatSync(path, { bigint: true });
    if (
      status.isSymbolicLink()
      || !status.isDirectory()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      || readdirSync(path).length !== 0
    ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
    rmdirSync(path);
    fsyncProductionDirectory(dirname(path));
  }
  const root = lstatSync(destination);
  if (
    root.isSymbolicLink()
    || !root.isDirectory()
    || root.dev !== input.expectedRootIdentity.dev
    || root.ino !== input.expectedRootIdentity.ino
    || readdirSync(destination).length !== 0
  ) fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
  rmdirSync(destination);
  fsyncProductionDirectory(dirname(destination));
  if (!exactPathAbsent(destination)) {
    fail('GREATER_REALM_PRODUCTION_MATERIALIZATION_CLEANUP_FAILED');
  }
}

export function attestGreaterRealmProductionSourceAncestry(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
}>): void {
  if (!COMMIT.test(input.atlasSourceCommit) || !COMMIT.test(input.moduleSourceCommit)) {
    fail('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
  }
  const git = productionGitContext(input.repositoryRoot);
  try {
    const atlasExists = git.run(['cat-file', '-e', `${input.atlasSourceCommit}^{commit}`]);
    const moduleExists = git.run(['cat-file', '-e', `${input.moduleSourceCommit}^{commit}`]);
    const isAncestor = git.run([
      'merge-base', '--is-ancestor', input.atlasSourceCommit, input.moduleSourceCommit,
    ]);
    if (
      atlasExists.error !== undefined || atlasExists.status !== 0
      || moduleExists.error !== undefined || moduleExists.status !== 0
      || isAncestor.error !== undefined || isAncestor.status !== 0
    ) fail('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
  } finally {
    git.finish();
  }
}

function trustedGitText(
  repositoryRoot: string,
  arguments_: readonly string[],
): string {
  const git = productionGitContext(repositoryRoot);
  try {
    const result = git.run(arguments_);
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || result.stderr !== ''
      || Buffer.byteLength(result.stdout, 'utf8') > 2 * 1024 * 1024
    ) fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
    return result.stdout;
  } finally {
    git.finish();
  }
}

function exactlyOnce(value: string, expected: string): boolean {
  const first = value.indexOf(expected);
  return first >= 0 && value.indexOf(expected, first + expected.length) < 0;
}

function requireExactRegularBlob(
  repositoryRoot: string,
  commit: string,
  path: string,
  errorCode: string,
): void {
  const output = trustedGitText(repositoryRoot, [
    'ls-tree', '-z', commit, '--', path,
  ]);
  const prefix = `100644 blob `;
  const suffix = `\t${path}\0`;
  if (
    !output.startsWith(prefix)
    || !output.endsWith(suffix)
    || output.length !== prefix.length + 40 + suffix.length
    || !COMMIT.test(output.slice(prefix.length, prefix.length + 40))
  ) fail(errorCode);
}

/** Initial gate handoffs may change only one exact v17 policy literal. */
export function attestGreaterRealmProductionGateOnlyDelta(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  gate: 'import' | 'activation';
}>): void {
  attestGreaterRealmProductionSourceAncestry(input);
  for (const commit of [input.atlasSourceCommit, input.moduleSourceCommit]) {
    requireExactRegularBlob(
      input.repositoryRoot,
      commit,
      GATE_POLICY_PATH,
      'GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID',
    );
    requireExactRegularBlob(
      input.repositoryRoot,
      commit,
      PUBLISHER_POLICY_PATH,
      'GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID',
    );
  }
  const changedPaths = trustedGitText(input.repositoryRoot, [
    'diff', '--name-only', '--no-ext-diff', '--no-textconv',
    input.atlasSourceCommit, input.moduleSourceCommit, '--', '.',
  ]).split('\n').filter(Boolean);
  if (
    changedPaths.length !== 2
    || !changedPaths.includes(GATE_POLICY_PATH)
    || !changedPaths.includes(PUBLISHER_POLICY_PATH)
  ) {
    fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
  }
  const atlas = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${GATE_POLICY_PATH}`,
  ]);
  const module = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${GATE_POLICY_PATH}`,
  ]);
  const atlasPublisher = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const modulePublisher = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const selectedFalse = input.gate === 'import' ? IMPORT_GATE_FALSE : ACTIVATION_GATE_FALSE;
  const selectedTrue = input.gate === 'import' ? IMPORT_GATE_TRUE : ACTIVATION_GATE_TRUE;
  const selectedForwardFalse = input.gate === 'import'
    ? IMPORT_FORWARD_FALSE
    : ACTIVATION_FORWARD_FALSE;
  const selectedForwardTrue = input.gate === 'import'
    ? IMPORT_FORWARD_TRUE
    : ACTIVATION_FORWARD_TRUE;
  if (
    !exactlyOnce(atlas, selectedFalse)
    || atlas.includes(selectedTrue)
    || !exactlyOnce(module, selectedTrue)
    || module.includes(selectedFalse)
    || (input.gate === 'import' && (
      !exactlyOnce(atlas, ACTIVATION_GATE_FALSE)
      || !exactlyOnce(module, ACTIVATION_GATE_FALSE)
      || atlas.includes(ACTIVATION_GATE_TRUE)
      || module.includes(ACTIVATION_GATE_TRUE)
    ))
    || (input.gate === 'activation' && (
      !exactlyOnce(atlas, IMPORT_GATE_FALSE)
      || !exactlyOnce(module, IMPORT_GATE_FALSE)
      || atlas.includes(IMPORT_GATE_TRUE)
      || module.includes(IMPORT_GATE_TRUE)
    ))
    || module.replace(selectedTrue, selectedFalse) !== atlas
    || !exactlyOnce(atlasPublisher, ENTRY_APPROVAL_FALSE)
    || !exactlyOnce(atlasPublisher, ADDITIVE_APPROVAL_FALSE)
    || !exactlyOnce(atlasPublisher, selectedForwardFalse)
    || atlasPublisher.includes(ENTRY_APPROVAL_TRUE)
    || atlasPublisher.includes(ADDITIVE_APPROVAL_TRUE)
    || atlasPublisher.includes(selectedForwardTrue)
    || !exactlyOnce(modulePublisher, ENTRY_APPROVAL_TRUE)
    || !exactlyOnce(modulePublisher, ADDITIVE_APPROVAL_TRUE)
    || !exactlyOnce(modulePublisher, selectedForwardTrue)
    || modulePublisher.includes(ENTRY_APPROVAL_FALSE)
    || modulePublisher.includes(ADDITIVE_APPROVAL_FALSE)
    || modulePublisher.includes(selectedForwardFalse)
    || modulePublisher
      .replace(ENTRY_APPROVAL_TRUE, ENTRY_APPROVAL_FALSE)
      .replace(ADDITIVE_APPROVAL_TRUE, ADDITIVE_APPROVAL_FALSE)
      .replace(selectedForwardTrue, selectedForwardFalse) !== atlasPublisher
  ) fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
}

/** Candidate review precedes the exact two-literal inert-append approval. */
export function attestGreaterRealmProductionAppendApprovalOnlyDelta(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
}>): void {
  attestGreaterRealmProductionSourceAncestry(input);
  requireExactRegularBlob(
    input.repositoryRoot,
    input.atlasSourceCommit,
    PUBLISHER_POLICY_PATH,
    'GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID',
  );
  requireExactRegularBlob(
    input.repositoryRoot,
    input.moduleSourceCommit,
    PUBLISHER_POLICY_PATH,
    'GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID',
  );
  const changedPaths = trustedGitText(input.repositoryRoot, [
    'diff', '--name-only', '--no-ext-diff', '--no-textconv',
    input.atlasSourceCommit, input.moduleSourceCommit, '--', '.',
  ]).split('\n').filter(Boolean);
  if (changedPaths.length !== 1 || changedPaths[0] !== PUBLISHER_POLICY_PATH) {
    fail('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
  }
  const atlas = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const module = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  if (
    !exactlyOnce(atlas, ENTRY_APPROVAL_FALSE)
    || !exactlyOnce(atlas, ADDITIVE_APPROVAL_FALSE)
    || atlas.includes(ENTRY_APPROVAL_TRUE)
    || atlas.includes(ADDITIVE_APPROVAL_TRUE)
    || !exactlyOnce(module, ENTRY_APPROVAL_TRUE)
    || !exactlyOnce(module, ADDITIVE_APPROVAL_TRUE)
    || module.includes(ENTRY_APPROVAL_FALSE)
    || module.includes(ADDITIVE_APPROVAL_FALSE)
    || module
      .replace(ENTRY_APPROVAL_TRUE, ENTRY_APPROVAL_FALSE)
      .replace(ADDITIVE_APPROVAL_TRUE, ADDITIVE_APPROVAL_FALSE) !== atlas
  ) fail('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
}

function fail(code: string): never {
  throw new GreaterRealmProductionProvenanceError(code);
}

function exactSingleLine(output: string): string | undefined {
  const value = output.endsWith('\n') ? output.slice(0, -1) : output;
  return value.length > 0 && !value.includes('\n') && !value.includes('\r')
    ? value
    : undefined;
}

function attestProtectedMainAgainstOrigin(input: Readonly<{
  repositoryRoot: string;
  expectedOriginUrl: string;
}>): string {
  if (
    !input.repositoryRoot.startsWith('/')
    || input.expectedOriginUrl.length < 1
    || input.expectedOriginUrl.includes('\0')
  ) fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_INVALID');
  const git = productionGitContext(input.repositoryRoot);
  try {
    const branch = exactSingleLine(git.read(['symbolic-ref', '--quiet', '--short', 'HEAD']) ?? '');
    const sourceCommit = exactSingleLine(git.read(['rev-parse', '--verify', 'HEAD^{commit}']) ?? '');
    const configuredOrigin = exactSingleLine(git.read([
      'config', '--local', '--get-all', 'remote.origin.url',
    ]) ?? '');
    const resolvedOrigin = exactSingleLine(git.read(['remote', 'get-url', '--all', 'origin']) ?? '');
    const protectedMain = git.read([
      'ls-remote', '--exit-code', 'origin', 'refs/heads/main',
    ]) ?? '';
    const status = git.read([
      'status', '--porcelain=v1', '--untracked-files=all', '--no-renames',
    ]) ?? '';
    try {
      verifyExactProductionWorkingTree({
        git,
        root: git.root,
        commit: sourceCommit ?? '',
      });
    } catch {
      fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
    }
    const protectedMainMatch = protectedMain.match(
      /^([0-9a-f]{40})\trefs\/heads\/main\n?$/u,
    );
    if (
      branch !== 'main'
      || sourceCommit === undefined
      || !COMMIT.test(sourceCommit)
      || configuredOrigin !== input.expectedOriginUrl
      || resolvedOrigin !== input.expectedOriginUrl
      || protectedMainMatch === null
      || protectedMainMatch[1] !== sourceCommit
      || status !== ''
    ) fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
    return sourceCommit;
  } finally {
    git.finish();
  }
}

/** Exact clean canonical main attestation using only the pinned, scrubbed Git runner. */
export function attestGreaterRealmProductionProtectedMain(
  repositoryRoot: string,
): string {
  return attestProtectedMainAgainstOrigin({
    repositoryRoot,
    expectedOriginUrl: CANONICAL_ORIGIN_URL,
  });
}

function manifestString(
  manifest: Readonly<Record<string, unknown>>,
  field: 'sourceCommit' | 'atlasId' | 'publicReleaseId' | 'releaseSha256',
): string {
  const value = manifest[field];
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail('GREATER_REALM_PRODUCTION_ATLAS_PROVENANCE_INVALID');
  return value;
}

/**
 * Binds the immutable atlas-generation identity and the currently attested
 * server-module identity without ever requiring the two commits to be equal.
 */
export function inspectGreaterRealmProductionProvenance(input: Readonly<{
  repositoryRoot: string;
  workspaceRoot?: string;
  attestModuleSourceCommit: () => string;
}>): GreaterRealmProductionProvenance {
  const moduleSourceCommit = input.attestModuleSourceCommit();
  if (!COMMIT.test(moduleSourceCommit)) {
    fail('GREATER_REALM_PRODUCTION_MODULE_PROVENANCE_INVALID');
  }
  const workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot: input.repositoryRoot,
    workspaceRoot: input.workspaceRoot,
  });
  const artifacts = readGreaterRealmRuntimeRelease(workspace);
  verifyGreaterRealmRuntimeReleaseArtifacts(artifacts);
  const atlasSourceCommit = manifestString(artifacts.manifest, 'sourceCommit');
  const atlasId = manifestString(artifacts.manifest, 'atlasId');
  const publicReleaseId = manifestString(artifacts.manifest, 'publicReleaseId');
  const expectedReleaseSha256 = manifestString(artifacts.manifest, 'releaseSha256');
  if (!COMMIT.test(atlasSourceCommit) || !SHA256.test(expectedReleaseSha256)) {
    fail('GREATER_REALM_PRODUCTION_ATLAS_PROVENANCE_INVALID');
  }
  attestGreaterRealmProductionSourceAncestry({
    repositoryRoot: input.repositoryRoot,
    atlasSourceCommit,
    moduleSourceCommit,
  });
  return Object.freeze({
    workspace,
    artifacts,
    atlasSourceCommit,
    moduleSourceCommit,
    atlasId,
    publicReleaseId,
    expectedReleaseSha256,
  });
}

export const greaterRealmProductionProvenanceTestSeams = Object.freeze({
  attestProtectedMainAgainstOrigin,
});
