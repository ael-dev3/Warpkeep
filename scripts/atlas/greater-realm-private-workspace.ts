import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_PUBLICATION_RESERVED_PREFIX = '.wk-publish-';
const PRIVATE_PUBLICATION_ENVELOPE = '.wk-publish-envelope-v1';
const PRIVATE_PUBLICATION_COMMIT = '.wk-publish-commit-v1';
const PRIVATE_PUBLICATION_PAYLOAD_PREFIX = '.wk-publish-payload-';
const PRIVATE_PENDING_DIRECTORY = '.pending';
const PRIVATE_PENDING_TARGET_PREFIX = 'target-';
const PRIVATE_PUBLICATION_ENVELOPE_BYTES = Buffer.from(
  'warpkeep-greater-realm-private-directory-envelope-v1\n',
  'utf8',
);
const PRIVATE_PUBLICATION_PAYLOAD = /^\.wk-publish-payload-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRIVATE_PENDING_STAGE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRIVATE_LOCK_PREFIX = 'greater-realm-private-lock-v2\npid:';
const PRIVATE_LOCK_SUFFIX = '\n';
const PRIVATE_LOCK_MAXIMUM_BYTES = 96;
const DEFAULT_MAXIMUM_FILE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_TREE_ENTRIES = 250_000;
const FORBIDDEN_SECRET_ARGUMENT = /^(?:--)?(?:private-)?(?:atlas-)?(?:seed|seed-hex|seed-material|layout-digest|stage-digest|package-digest)(?:=|$)/iu;
const RESERVED_ENVIRONMENT_KEY = /^WARPKEEP_GREATER_REALM_/iu;
const POSSIBLE_SECRET_VALUE = /^(?:[0-9a-f]{64}|[A-Za-z0-9+/_-]{43}=?)$/iu;
const ALLOWED_PUBLIC_DIGEST_ENVIRONMENT_KEYS = new Set([
  'NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S',
]);
const POSSIBLE_HEX_SECRET_VALUE = /^[0-9a-f]{64}$/iu;
const WINDOWS_FORBIDDEN_COMPONENT_CHARACTER = /[\u0000-\u001f\u007f<>:"|?*]/u;
const WINDOWS_RESERVED_DEVICE_STEM = /^(?:aux|clock\$|com[1-9\u00b9\u00b2\u00b3]|con|conin\$|conout\$|lpt[1-9\u00b9\u00b2\u00b3]|nul|prn)$/iu;

type FilesystemIdentity = Readonly<{
  dev: number;
  ino: number;
}>;

type DirectoryAttestation = Readonly<{
  path: string;
  identity: FilesystemIdentity;
}>;

export class GreaterRealmPrivateWorkspaceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmPrivateWorkspaceError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmPrivateWorkspaceError(code);
}

function pathInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function sameIdentity(
  left: Pick<Stats, 'dev' | 'ino'>,
  right: Pick<Stats, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownerOnlyDirectoryStatus(status: Stats): void {
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('GREATER_REALM_PRIVATE_DIRECTORY_INVALID');
  if ((status.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    fail('GREATER_REALM_PRIVATE_DIRECTORY_PERMISSIONS');
  }
}

function ownerOnlyDirectory(path: string): void {
  ownerOnlyDirectoryStatus(lstatSync(path));
}

function assertTrustedAncestorStatus(
  status: Stats,
): void {
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail('GREATER_REALM_PRIVATE_PATH_INVALID');
  }
  if (process.getuid !== undefined) {
    const currentUser = process.getuid();
    if (status.uid !== 0 && status.uid !== currentUser) {
      fail('GREATER_REALM_PRIVATE_PATH_UNTRUSTED_ANCESTOR');
    }
  }
  const writableByOthers = (status.mode & 0o022) !== 0;
  const protectedByStickyRoot = (
    (status.mode & 0o1000) !== 0
    && status.uid === 0
  );
  if (writableByOthers && !protectedByStickyRoot) {
    fail('GREATER_REALM_PRIVATE_PATH_UNTRUSTED_ANCESTOR');
  }
}

function directoryPaths(path: string): readonly string[] {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const paths = [root];
  let current = root;
  for (const component of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, component);
    paths.push(current);
  }
  return Object.freeze(paths);
}

function attestDirectory(
  path: string,
  privateDirectory: boolean,
  expected?: FilesystemIdentity,
): DirectoryAttestation {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path);
    if (privateDirectory) ownerOnlyDirectoryStatus(before);
    else assertTrustedAncestorStatus(before);
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    const after = lstatSync(path);
    if (
      !opened.isDirectory()
      || !sameIdentity(before, opened)
      || !sameIdentity(opened, after)
      || (expected !== undefined && !sameIdentity(opened, expected))
      || realpathSync(path) !== path
    ) fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    if (privateDirectory) ownerOnlyDirectoryStatus(after);
    else assertTrustedAncestorStatus(after);
    return Object.freeze({
      path,
      identity: Object.freeze({ dev: opened.dev, ino: opened.ino }),
    });
  } catch (error) {
    if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
    return fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function hardenNewPrivateDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path);
    if (
      !before.isDirectory()
      || before.isSymbolicLink()
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_PRIVATE_DIRECTORY_INVALID');
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (!opened.isDirectory() || !sameIdentity(before, opened)) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
    fchmodSync(descriptor, PRIVATE_DIRECTORY_MODE);
    const hardened = fstatSync(descriptor);
    const current = lstatSync(path);
    ownerOnlyDirectoryStatus(hardened);
    ownerOnlyDirectoryStatus(current);
    if (!sameIdentity(opened, hardened) || !sameIdentity(hardened, current)) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
  } catch (error) {
    if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
    return fail('GREATER_REALM_PRIVATE_DIRECTORY_CREATE_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncTrustedDirectoryEntry(path: string): void {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path);
    assertTrustedAncestorStatus(before);
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (!sameIdentity(before, opened)) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
    fsyncSync(descriptor);
    const after = lstatSync(path);
    if (!sameIdentity(opened, after)) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
  } catch (error) {
    if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
    fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertExistingPathHasNoSymlinks(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;
  for (const component of components) {
    current = join(current, component);
    if (!existsSync(current)) break;
    const status = lstatSync(current);
    if (status.isSymbolicLink()) fail('GREATER_REALM_PRIVATE_PATH_SYMLINK');
    if (current !== absolute && !status.isDirectory()) {
      fail('GREATER_REALM_PRIVATE_PATH_INVALID');
    }
  }
}

/**
 * Resolve any symlinks in an existing ancestor without accepting a symlink as
 * the requested workspace or repository itself. This keeps macOS' `/var`
 * alias usable while still rejecting attacker-controlled workspace aliases.
 */
function canonicalProspectivePath(path: string): string {
  const absolute = resolve(path);
  const missingComponents: string[] = [];
  let existing = absolute;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) fail('GREATER_REALM_PRIVATE_PATH_INVALID');
    missingComponents.unshift(basename(existing));
    existing = parent;
  }
  const status = lstatSync(existing);
  if (status.isSymbolicLink()) fail('GREATER_REALM_PRIVATE_PATH_SYMLINK');
  if (!status.isDirectory()) fail('GREATER_REALM_PRIVATE_PATH_INVALID');
  return resolve(realpathSync(existing), ...missingComponents);
}

function ensurePrivateWorkspaceRoot(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;
  for (const component of components) {
    const parent = current;
    current = join(current, component);
    let status = existsSync(current) ? lstatSync(current) : undefined;
    let created = false;
    if (!status) {
      try {
        mkdirSync(current, { mode: PRIVATE_DIRECTORY_MODE });
        created = true;
      } catch {
        status = existsSync(current) ? lstatSync(current) : undefined;
        if (!status) fail('GREATER_REALM_PRIVATE_DIRECTORY_CREATE_FAILED');
      }
      status = lstatSync(current);
    }
    if (status === undefined) fail('GREATER_REALM_PRIVATE_DIRECTORY_CREATE_FAILED');
    if (!status.isDirectory() || status.isSymbolicLink()) {
      fail('GREATER_REALM_PRIVATE_PATH_INVALID');
    }
    if (created) {
      hardenNewPrivateDirectory(current);
      fsyncTrustedDirectoryEntry(parent);
    }
  }
  ownerOnlyDirectory(absolute);
}

function validateRelativePath(value: string): readonly string[] {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4_096
    || value.includes('\0')
    || isAbsolute(value)
    || value.normalize('NFC') !== value
  ) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
  const components = value.split(/[\\/]/u);
  if (components.some(component => (
    component.length === 0
    || component === '.'
    || component === '..'
    || component.startsWith(PRIVATE_PUBLICATION_RESERVED_PREFIX)
    || component.length > 255
    || component.normalize('NFC') !== component
    // The workspace is portable across supported platforms. Reject Windows
    // drive-relative paths, NTFS alternate streams, device aliases, control
    // characters, and names that Win32 silently trims even on POSIX hosts so
    // a package cannot acquire a different identity after being moved.
    || WINDOWS_FORBIDDEN_COMPONENT_CHARACTER.test(component)
    || component.endsWith('.')
    || component.endsWith(' ')
    || WINDOWS_RESERVED_DEVICE_STEM.test(
      component.split('.')[0]!.replace(/[ .]+$/u, ''),
    )
  ))) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
  return Object.freeze(components);
}

function publicationClaimName(component: string): string {
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-private-publication-claim-v1\0', 'utf8')
    .update(component, 'utf8')
    .digest('hex');
  return `${PRIVATE_PUBLICATION_RESERVED_PREFIX}claim-${digest}`;
}

function pendingPublicationTargetName(relativePath: string): string {
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-private-pending-target-v1\0', 'utf8')
    .update(relativePath, 'utf8')
    .digest('hex');
  return `${PRIVATE_PENDING_TARGET_PREFIX}${digest}`;
}

function resolvePrivatePath(root: string, value: string): string {
  const components = validateRelativePath(value);
  const target = resolve(root, ...components);
  if (!pathInside(root, target) || target === root) {
    fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
  }
  return target;
}

function assertRegularOwnerFile(path: string): Stats {
  const status = lstatSync(path);
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (status.mode & 0o077) !== 0
  ) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
  return status;
}

function assertRegularOwnerFileStatus(status: Stats): void {
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (status.mode & 0o077) !== 0
  ) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
}

function safeUnlinkIdentity(path: string, identity: FilesystemIdentity): void {
  try {
    const current = lstatSync(path);
    if (sameIdentity(current, identity)) unlinkSync(path);
  } catch {
    // Cleanup is best-effort and never follows or removes a replacement entry.
  }
}

function zeroizeOpenFile(
  descriptor: number,
  byteLength: number,
): void {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) return;
  const zeros = Buffer.alloc(Math.min(64 * 1_024, byteLength));
  try {
    let offset = 0;
    while (offset < byteLength) {
      const length = Math.min(zeros.byteLength, byteLength - offset);
      const written = writeSync(descriptor, zeros, 0, length, offset);
      if (written <= 0) break;
      offset += written;
    }
    fsyncSync(descriptor);
  } catch {
    // Secure erasure cannot be guaranteed by a filesystem. We still overwrite
    // every reachable byte best-effort before unlinking the private inode.
  } finally {
    zeros.fill(0);
  }
}

function zeroizeOpenFileStrict(
  descriptor: number,
  byteLength: number,
): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    fail('GREATER_REALM_PRIVATE_FILE_INVALID');
  }
  const zeros = Buffer.alloc(Math.min(64 * 1_024, Math.max(1, byteLength)));
  try {
    let offset = 0;
    while (offset < byteLength) {
      const length = Math.min(zeros.byteLength, byteLength - offset);
      const written = writeSync(descriptor, zeros, 0, length, offset);
      if (written !== length) fail('GREATER_REALM_PRIVATE_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    zeros.fill(0);
  }
}

function writeAll(
  descriptor: number,
  bytes: Uint8Array,
  onProgress?: (writtenByteCount: number) => void,
): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written <= 0) fail('GREATER_REALM_PRIVATE_WRITE_FAILED');
    offset += written;
    onProgress?.(offset);
  }
}

export function defaultGreaterRealmPrivateWorkspaceRoot(): string {
  return join(homedir(), '.warpkeep', 'private', 'greater-realm');
}

function possibleSecretEnvironmentEntry(key: string, value: string | undefined): boolean {
  return typeof value === 'string'
    && POSSIBLE_SECRET_VALUE.test(value)
    && !(
      POSSIBLE_HEX_SECRET_VALUE.test(value)
      && ALLOWED_PUBLIC_DIGEST_ENVIRONMENT_KEYS.has(key.toUpperCase())
    );
}

/**
 * The atlas CLI accepts only non-secret selectors. Generation material must be
 * created internally or read from a protected file descriptor.
 */
export function assertGreaterRealmPrivateInvocation(
  arguments_: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!Array.isArray(arguments_) || arguments_.some(argument => (
    typeof argument !== 'string'
    || FORBIDDEN_SECRET_ARGUMENT.test(argument)
    || POSSIBLE_SECRET_VALUE.test(argument)
  ))) fail('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
  if (Object.entries(environment).some(([key, value]) => (
    RESERVED_ENVIRONMENT_KEY.test(key)
    || possibleSecretEnvironmentEntry(key, value)
  ))) {
    fail('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
  }
}

export type GreaterRealmPrivateTreeAttestation = Readonly<{
  entryCount: number;
  fileCount: number;
  directoryCount: number;
  byteCount: number;
}>;

export type GreaterRealmPrivateWorkspace = Readonly<{
  root: string;
  ensureDirectory(relativePath: string): string;
  hasFile(relativePath: string): boolean;
  readFile(relativePath: string, maximumBytes?: number): Buffer;
  writeFileAtomic(relativePath: string, bytes: Uint8Array, maximumBytes?: number): void;
  recoverAtomicFileWrite(relativePath: string): 'absent' | 'installed';
  recoverAtomicDirectoryPublish(relativePath: string): 'absent' | 'published';
  attestTree(relativePath?: string): GreaterRealmPrivateTreeAttestation;
  withExclusiveLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T>;
  withAtomicDirectoryPublish<T>(
    relativePath: string,
    operation: (stagedWorkspace: GreaterRealmPrivateWorkspace) => Promise<T>,
  ): Promise<T>;
}>;

export function openGreaterRealmPrivateWorkspace(input: Readonly<{
  repositoryRoot: string;
  workspaceRoot?: string;
}>): GreaterRealmPrivateWorkspace {
  if (!isAbsolute(input.repositoryRoot) || !existsSync(input.repositoryRoot)) {
    fail('GREATER_REALM_PRIVATE_REPOSITORY_INVALID');
  }
  const repositoryRoot = canonicalProspectivePath(input.repositoryRoot);
  assertExistingPathHasNoSymlinks(repositoryRoot);
  const repositoryStatus = lstatSync(repositoryRoot);
  if (!repositoryStatus.isDirectory() || repositoryStatus.isSymbolicLink()) {
    fail('GREATER_REALM_PRIVATE_REPOSITORY_INVALID');
  }
  const requestedRoot = input.workspaceRoot ?? defaultGreaterRealmPrivateWorkspaceRoot();
  if (!isAbsolute(requestedRoot)) fail('GREATER_REALM_PRIVATE_ROOT_NOT_ABSOLUTE');
  const workspaceRoot = canonicalProspectivePath(requestedRoot);
  if (pathInside(repositoryRoot, workspaceRoot) || pathInside(workspaceRoot, repositoryRoot)) {
    fail('GREATER_REALM_PRIVATE_ROOT_REPOSITORY_OVERLAP');
  }
  assertExistingPathHasNoSymlinks(workspaceRoot);
  let existingWorkspaceAncestor = workspaceRoot;
  while (!existsSync(existingWorkspaceAncestor)) {
    const parent = dirname(existingWorkspaceAncestor);
    if (parent === existingWorkspaceAncestor) fail('GREATER_REALM_PRIVATE_PATH_INVALID');
    existingWorkspaceAncestor = parent;
  }
  const existingAncestorAttestations = Object.freeze(
    directoryPaths(existingWorkspaceAncestor).map(ancestorPath => (
      attestDirectory(ancestorPath, false)
    )),
  );
  const existingAncestorIdentities = new Map(existingAncestorAttestations.map(attestation => (
    [attestation.path, attestation.identity] as const
  )));
  ensurePrivateWorkspaceRoot(workspaceRoot);

  const workspaceBoundaryPaths = directoryPaths(workspaceRoot);
  const workspaceBoundary = Object.freeze(workspaceBoundaryPaths.map((path, index) => (
    attestDirectory(
      path,
      index === workspaceBoundaryPaths.length - 1,
      existingAncestorIdentities.get(path),
    )
  )));

  const attestWorkspaceBoundary = (): void => {
    for (let index = 0; index < workspaceBoundary.length; index += 1) {
      const expected = workspaceBoundary[index];
      if (expected === undefined) fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
      attestDirectory(
        expected.path,
        index === workspaceBoundary.length - 1,
        expected.identity,
      );
    }
  };

  const attestPrivateDirectoryChain = (
    path: string,
    expected?: readonly DirectoryAttestation[],
  ): readonly DirectoryAttestation[] => {
    const absolute = resolve(path);
    if (!pathInside(workspaceRoot, absolute)) {
      fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    }
    attestWorkspaceBoundary();
    const difference = relative(workspaceRoot, absolute);
    const paths: string[] = [workspaceRoot];
    let current = workspaceRoot;
    for (const component of difference.split(sep).filter(Boolean)) {
      current = join(current, component);
      paths.push(current);
    }
    if (expected !== undefined && expected.length !== paths.length) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
    const attestations = paths.map((directoryPath, index) => {
      const expectedEntry = expected?.[index];
      if (expectedEntry !== undefined && expectedEntry.path !== directoryPath) {
        fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
      }
      return attestDirectory(directoryPath, true, expectedEntry?.identity);
    });
    attestWorkspaceBoundary();
    return Object.freeze(attestations);
  };

  const readPrivatePublicationControl = (
    path: string,
    maximumBytes: number,
  ): Buffer => {
    const parent = dirname(path);
    const parentAttestation = attestPrivateDirectoryChain(parent);
    let descriptor: number | undefined;
    let bytes: Buffer | undefined;
    try {
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const before = fstatSync(descriptor);
      assertRegularOwnerFileStatus(before);
      if (
        before.size < 1
        || before.size > maximumBytes
        || (before.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
        if (count <= 0) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        offset += count;
      }
      const after = fstatSync(descriptor);
      const current = lstatSync(path);
      if (
        !sameIdentity(before, after)
        || !sameIdentity(after, current)
        || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs
        || after.nlink !== 1
        || (after.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      attestPrivateDirectoryChain(parent, parentAttestation);
      const result = bytes;
      bytes = undefined;
      return result;
    } catch (error) {
      bytes?.fill(0);
      if (
        error instanceof GreaterRealmPrivateWorkspaceError
        && error.code === 'GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE'
      ) throw error;
      fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  /**
   * A published logical directory is an owner-only envelope whose complete
   * payload becomes visible only when its no-clobber commit link is present.
   * Callers continue to address the logical path; control entries are never
   * exposed through the workspace API.
   */
  const resolveWorkspacePath = (value: string): string => {
    const components = validateRelativePath(value);
    let current = workspaceRoot;
    for (let index = 0; index < components.length; index += 1) {
      const component = components[index];
      if (component === undefined) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
      const claim = join(current, publicationClaimName(component));
      if (existsSync(claim)) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      current = join(current, component);
      if (!existsSync(current)) {
        for (const suffix of components.slice(index + 1)) current = join(current, suffix);
        break;
      }
      const currentStatus = lstatSync(current);
      if (currentStatus.isSymbolicLink()) fail('GREATER_REALM_PRIVATE_PATH_SYMLINK');
      if (!currentStatus.isDirectory()) continue;

      const envelopeMarker = join(current, PRIVATE_PUBLICATION_ENVELOPE);
      const commitMarker = join(current, PRIVATE_PUBLICATION_COMMIT);
      const hasEnvelopeMarker = existsSync(envelopeMarker);
      const hasCommitMarker = existsSync(commitMarker);
      if (!hasEnvelopeMarker && !hasCommitMarker) continue;
      if (!hasEnvelopeMarker || !hasCommitMarker) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }

      const envelopeAttestation = attestDirectory(current, true);
      let envelopeBytes: Buffer | undefined;
      let commitBytes: Buffer | undefined;
      try {
        envelopeBytes = readPrivatePublicationControl(
          envelopeMarker,
          PRIVATE_PUBLICATION_ENVELOPE_BYTES.byteLength,
        );
        if (!envelopeBytes.equals(PRIVATE_PUBLICATION_ENVELOPE_BYTES)) {
          fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        }
        commitBytes = readPrivatePublicationControl(commitMarker, 256);
        const commitMatch = /^warpkeep-greater-realm-private-directory-commit-v1\n([^\n]+)\n$/u
          .exec(commitBytes.toString('utf8'));
        const payloadName = commitMatch?.[1];
        if (payloadName === undefined || !PRIVATE_PUBLICATION_PAYLOAD.test(payloadName)) {
          fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        }
        const expectedEntries = [
          PRIVATE_PUBLICATION_COMMIT,
          PRIVATE_PUBLICATION_ENVELOPE,
          payloadName,
        ].sort();
        const actualEntries = readdirSync(current).sort();
        if (
          actualEntries.length !== expectedEntries.length
          || actualEntries.some((entry, entryIndex) => entry !== expectedEntries[entryIndex])
        ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        const payload = join(current, payloadName);
        attestDirectory(payload, true);
        attestDirectory(current, true, envelopeAttestation.identity);
        current = payload;
      } catch (error) {
        if (
          error instanceof GreaterRealmPrivateWorkspaceError
          && error.code === 'GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE'
        ) throw error;
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      } finally {
        envelopeBytes?.fill(0);
        commitBytes?.fill(0);
      }
    }
    if (!pathInside(workspaceRoot, current) || current === workspaceRoot) {
      fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    }
    return current;
  };

  const ensurePrivateDirectory = (path: string): void => {
    const absolute = resolve(path);
    if (!pathInside(workspaceRoot, absolute)) {
      fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    }
    attestWorkspaceBoundary();
    let current = workspaceRoot;
    let parentAttestation = attestDirectory(current, true);
    for (const component of relative(workspaceRoot, absolute).split(sep).filter(Boolean)) {
      const next = join(current, component);
      let created = false;
      try {
        mkdirSync(next, { mode: PRIVATE_DIRECTORY_MODE });
        created = true;
      } catch {
        if (!existsSync(next)) fail('GREATER_REALM_PRIVATE_DIRECTORY_CREATE_FAILED');
      }
      if (created) {
        hardenNewPrivateDirectory(next);
        // A durable child inode is not enough: the parent directory entry must
        // reach stable storage before a later checkpoint can depend on it.
        fsyncPrivateDirectory(current, parentAttestation.identity);
      }
      const nextAttestation = attestDirectory(next, true);
      attestDirectory(current, true, parentAttestation.identity);
      current = next;
      parentAttestation = nextAttestation;
    }
    attestWorkspaceBoundary();
    attestPrivateDirectoryChain(absolute);
  };

  const ensureDirectory = (relativePath: string): string => {
    const destination = resolveWorkspacePath(relativePath);
    assertExistingPathHasNoSymlinks(destination);
    ensurePrivateDirectory(destination);
    if (!pathInside(workspaceRoot, destination)) {
      fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    }
    return destination;
  };

  const readFile = (
    relativePath: string,
    maximumBytes = DEFAULT_MAXIMUM_FILE_BYTES,
  ): Buffer => {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
      fail('GREATER_REALM_PRIVATE_FILE_LIMIT_INVALID');
    }
    const path = resolveWorkspacePath(relativePath);
    assertExistingPathHasNoSymlinks(path);
    const parentAttestation = attestPrivateDirectoryChain(dirname(path));
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    let descriptor: number | undefined;
    let bytes: Buffer | undefined;
    try {
      descriptor = openSync(path, flags);
      const before = fstatSync(descriptor);
      if (
        !before.isFile()
        || before.size < 0
        || before.size > maximumBytes
        || before.nlink !== 1
        || (process.getuid !== undefined && before.uid !== process.getuid())
        || (before.mode & 0o077) !== 0
      ) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
        if (count <= 0) fail('GREATER_REALM_PRIVATE_READ_FAILED');
        offset += count;
      }
      const after = fstatSync(descriptor);
      const current = lstatSync(path);
      if (
        before.dev !== after.dev
        || before.ino !== after.ino
        || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs
        || before.nlink !== after.nlink
        || !current.isFile()
        || current.isSymbolicLink()
        || current.nlink !== 1
        || current.dev !== after.dev
        || current.ino !== after.ino
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      assertRegularOwnerFileStatus(after);
      attestPrivateDirectoryChain(dirname(path), parentAttestation);
      closeSync(descriptor);
      descriptor = undefined;
      const result = bytes;
      bytes = undefined;
      return result;
    } catch (error) {
      bytes?.fill(0);
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_READ_FAILED');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const hasFile = (relativePath: string): boolean => {
    const path = resolveWorkspacePath(relativePath);
    assertExistingPathHasNoSymlinks(path);
    const parentAttestation = attestPrivateDirectoryChain(dirname(path));
    if (!existsSync(path)) {
      attestPrivateDirectoryChain(dirname(path), parentAttestation);
      return false;
    }
    let descriptor: number | undefined;
    try {
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(descriptor);
      assertRegularOwnerFileStatus(opened);
      const current = assertRegularOwnerFile(path);
      if (!sameIdentity(opened, current)) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      attestPrivateDirectoryChain(dirname(path), parentAttestation);
      return true;
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_FILE_INVALID');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const writeFileAtomic = (
    relativePath: string,
    bytes: Uint8Array,
    maximumBytes = DEFAULT_MAXIMUM_FILE_BYTES,
  ): void => {
    if (
      !(bytes instanceof Uint8Array)
      || !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 0
      || bytes.byteLength > maximumBytes
    ) fail('GREATER_REALM_PRIVATE_FILE_LIMIT_INVALID');
    const destination = resolveWorkspacePath(relativePath);
    const parentRelativePath = relativePath.split(/[\\/]/u).slice(0, -1).join('/');
    const parent = parentRelativePath
      ? ensureDirectory(parentRelativePath)
      : workspaceRoot;
    const parentAttestation = attestPrivateDirectoryChain(parent);
    if (dirname(destination) !== parent || existsSync(destination)) {
      fail('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');
    }
    const temporaryName = `.${basename(destination)}.${randomUUID()}.tmp`;
    const temporary = join(parent, temporaryName);
    let descriptor: number | undefined;
    let temporaryIdentity: FilesystemIdentity | undefined;
    let destinationInstalled = false;
    let writtenByteCount = 0;
    let completed = false;
    try {
      descriptor = openSync(
        temporary,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        PRIVATE_FILE_MODE,
      );
      fchmodSync(descriptor, PRIVATE_FILE_MODE);
      const created = fstatSync(descriptor);
      assertRegularOwnerFileStatus(created);
      temporaryIdentity = Object.freeze({ dev: created.dev, ino: created.ino });
      writeAll(descriptor, bytes, byteCount => { writtenByteCount = byteCount; });
      fsyncSync(descriptor);
      const written = fstatSync(descriptor);
      assertRegularOwnerFileStatus(written);
      if (
        temporaryIdentity === undefined
        || !sameIdentity(written, temporaryIdentity)
        || written.size !== bytes.byteLength
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      const temporaryPathStatus = assertRegularOwnerFile(temporary);
      if (!sameIdentity(temporaryPathStatus, temporaryIdentity)) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      attestPrivateDirectoryChain(parent, parentAttestation);
      linkSync(temporary, destination);
      destinationInstalled = true;
      const linked = lstatSync(destination);
      if (
        !linked.isFile()
        || linked.isSymbolicLink()
        || linked.nlink !== 2
        || !sameIdentity(linked, temporaryIdentity)
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      unlinkSync(temporary);
      const installed = assertRegularOwnerFile(destination);
      if (!sameIdentity(installed, temporaryIdentity)) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      const openInstalled = fstatSync(descriptor);
      assertRegularOwnerFileStatus(openInstalled);
      if (!sameIdentity(openInstalled, temporaryIdentity)) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
      attestPrivateDirectoryChain(parent, parentAttestation);
      closeSync(descriptor);
      descriptor = undefined;
      completed = true;
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_WRITE_FAILED');
    } finally {
      if (!completed && descriptor !== undefined) {
        zeroizeOpenFile(descriptor, writtenByteCount);
      }
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve the original fixed diagnostic. */ }
      }
      if (!completed && destinationInstalled && temporaryIdentity !== undefined) {
        safeUnlinkIdentity(destination, temporaryIdentity);
      }
      if (temporaryIdentity !== undefined) safeUnlinkIdentity(temporary, temporaryIdentity);
    }
  };

  const attestTreeAt = (start: string): GreaterRealmPrivateTreeAttestation => {
    assertExistingPathHasNoSymlinks(start);
    const startParent = start === workspaceRoot ? workspaceRoot : dirname(start);
    const startParentAttestation = attestPrivateDirectoryChain(startParent);
    let entryCount = 0;
    let fileCount = 0;
    let directoryCount = 0;
    let byteCount = 0;
    const visit = (path: string): void => {
      const status = lstatSync(path);
      if (status.isSymbolicLink()) fail('GREATER_REALM_PRIVATE_PATH_SYMLINK');
      if (status.isFile()) {
        let descriptor: number | undefined;
        try {
          descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          const opened = fstatSync(descriptor);
          assertRegularOwnerFileStatus(opened);
          const current = assertRegularOwnerFile(path);
          if (
            !sameIdentity(status, opened)
            || !sameIdentity(opened, current)
            || status.size !== opened.size
            || opened.size !== current.size
          ) {
            fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
          }
        } catch (error) {
          if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
          fail('GREATER_REALM_PRIVATE_FILE_INVALID');
        } finally {
          if (descriptor !== undefined) closeSync(descriptor);
        }
        entryCount += 1;
        fileCount += 1;
        byteCount += status.size;
      } else if (status.isDirectory()) {
        const directoryAttestation = attestDirectory(path, true);
        entryCount += 1;
        directoryCount += 1;
        for (const entry of readdirSync(path, { withFileTypes: true })
          .sort((left, right) => left.name.localeCompare(right.name))) {
          if (
            entry.name.includes('\0')
            || entry.name.normalize('NFC') !== entry.name
          ) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
          visit(join(path, entry.name));
        }
        attestDirectory(path, true, directoryAttestation.identity);
      } else {
        fail('GREATER_REALM_PRIVATE_SPECIAL_FILE');
      }
      if (
        entryCount > MAXIMUM_TREE_ENTRIES
        || !Number.isSafeInteger(byteCount)
      ) fail('GREATER_REALM_PRIVATE_TREE_LIMIT');
    };
    visit(start);
    attestPrivateDirectoryChain(startParent, startParentAttestation);
    return Object.freeze({ entryCount, fileCount, directoryCount, byteCount });
  };

  const attestTree = (relativePath?: string): GreaterRealmPrivateTreeAttestation => (
    attestTreeAt(relativePath === undefined
      ? workspaceRoot
      : resolveWorkspacePath(relativePath))
  );

  /**
   * Remove only the exact entries reached below a pinned private directory.
   * Regular files are pinned without following links, overwritten, synced,
   * and unlinked. Copy-on-write and journaled filesystems still cannot promise
   * physical-media erasure. A rejected live staging operation may retire its
   * own symbolic-link inode without following it; crash recovery remains
   * fail-closed for links and special files.
   */
  const removePrivateTree = (
    path: string,
    expectedRoot?: FilesystemIdentity,
    retireRejectedStageLinks = false,
  ): void => {
    const parent = dirname(path);
    const parentAttestation = attestPrivateDirectoryChain(parent);
    const visit = (entryPath: string, expected?: FilesystemIdentity): void => {
      const status = lstatSync(entryPath);
      if (expected !== undefined && !sameIdentity(status, expected)) {
        fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
      }
      if (status.isSymbolicLink() && retireRejectedStageLinks) {
        const identity = Object.freeze({ dev: status.dev, ino: status.ino });
        safeUnlinkIdentity(entryPath, identity);
        if (existsSync(entryPath)) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
        const entryParent = dirname(entryPath);
        const entryParentIdentity = attestDirectory(entryParent, true).identity;
        fsyncPrivateDirectory(entryParent, entryParentIdentity);
        return;
      }
      if (!status.isDirectory() || status.isSymbolicLink()) {
        if (!status.isFile() || status.isSymbolicLink()) {
          fail('GREATER_REALM_PRIVATE_SPECIAL_FILE');
        }
        const identity = Object.freeze({ dev: status.dev, ino: status.ino });
        let descriptor: number | undefined;
        try {
          descriptor = openSync(
            entryPath,
            constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
          );
          const opened = fstatSync(descriptor);
          assertRegularOwnerFileStatus(opened);
          if (
            !sameIdentity(status, opened)
            || opened.size !== status.size
            || (opened.mode & 0o777) !== PRIVATE_FILE_MODE
          ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
          zeroizeOpenFileStrict(descriptor, opened.size);
          const after = fstatSync(descriptor);
          const current = lstatSync(entryPath);
          if (
            !sameIdentity(opened, after)
            || !sameIdentity(after, current)
            || after.nlink !== 1
            || after.size !== opened.size
          ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
          closeSync(descriptor);
          descriptor = undefined;
        } finally {
          if (descriptor !== undefined) closeSync(descriptor);
        }
        safeUnlinkIdentity(entryPath, identity);
        if (existsSync(entryPath)) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
        const entryParent = dirname(entryPath);
        const entryParentIdentity = attestDirectory(entryParent, true).identity;
        fsyncPrivateDirectory(entryParent, entryParentIdentity);
        return;
      }
      const directory = attestDirectory(entryPath, true, expected);
      for (const entry of readdirSync(entryPath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        if (
          entry.name.includes('\0')
          || entry.name.normalize('NFC') !== entry.name
        ) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
        visit(join(entryPath, entry.name));
      }
      attestDirectory(entryPath, true, directory.identity);
      rmdirSync(entryPath);
      if (existsSync(entryPath)) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
      const directoryParent = dirname(entryPath);
      const directoryParentIdentity = attestDirectory(directoryParent, true).identity;
      fsyncPrivateDirectory(directoryParent, directoryParentIdentity);
    };
    visit(path, expectedRoot);
    attestPrivateDirectoryChain(parent, parentAttestation);
  };

  const fsyncPrivateDirectory = (
    path: string,
    expected: FilesystemIdentity,
  ): void => {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        path,
        constants.O_RDONLY
          | (constants.O_DIRECTORY ?? 0)
          | (constants.O_NOFOLLOW ?? 0),
      );
      const opened = fstatSync(descriptor);
      ownerOnlyDirectoryStatus(opened);
      if (!sameIdentity(opened, expected)) {
        fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
      }
      fsyncSync(descriptor);
      const current = lstatSync(path);
      if (!sameIdentity(opened, current)) {
        fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
      }
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const assertAtomicArtifactStatus = (status: Stats): void => {
    if (
      !status.isFile()
      || status.isSymbolicLink()
      || (status.nlink !== 1 && status.nlink !== 2)
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o777) !== PRIVATE_FILE_MODE
    ) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
  };

  /**
   * Complete or retire only a UUID-scoped temporary inode created by this
   * module. A two-link inode is recoverable only when its other name is the
   * exact destination; every replacement, extra link, or special file fails
   * closed. An uninstalled temporary is overwritten best-effort before unlink.
   */
  const recoverAtomicTemporary = (
    temporary: string,
    destinations: readonly string[],
    parent: string,
    parentAttestation: readonly DirectoryAttestation[],
  ): void => {
    const before = lstatSync(temporary);
    assertAtomicArtifactStatus(before);
    const identity = Object.freeze({ dev: before.dev, ino: before.ino });
    if (before.nlink === 2) {
      const matchingDestinations = destinations.filter(destination => {
        if (!existsSync(destination)) return false;
        const status = lstatSync(destination);
        assertAtomicArtifactStatus(status);
        return sameIdentity(status, identity);
      });
      if (matchingDestinations.length !== 1) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      attestPrivateDirectoryChain(parent, parentAttestation);
      safeUnlinkIdentity(temporary, identity);
      if (existsSync(temporary)) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      const installed = assertRegularOwnerFile(matchingDestinations[0]!);
      if (
        !sameIdentity(installed, identity)
        || (installed.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      attestPrivateDirectoryChain(parent, parentAttestation);
      return;
    }

    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        temporary,
        constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      );
      const opened = fstatSync(descriptor);
      assertAtomicArtifactStatus(opened);
      const current = lstatSync(temporary);
      if (
        opened.nlink !== 1
        || !sameIdentity(before, opened)
        || !sameIdentity(opened, current)
        || opened.size !== current.size
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      zeroizeOpenFile(descriptor, opened.size);
      const after = fstatSync(descriptor);
      if (!sameIdentity(opened, after) || after.nlink !== 1) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      closeSync(descriptor);
      descriptor = undefined;
      attestPrivateDirectoryChain(parent, parentAttestation);
      safeUnlinkIdentity(temporary, identity);
      if (existsSync(temporary)) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      attestPrivateDirectoryChain(parent, parentAttestation);
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const recoverAtomicFileWrite = (
    relativePath: string,
  ): 'absent' | 'installed' => {
    const destination = resolveWorkspacePath(relativePath);
    assertExistingPathHasNoSymlinks(destination);
    const parent = dirname(destination);
    const parentAttestation = attestPrivateDirectoryChain(parent);
    const escapedName = basename(destination).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const temporaryPattern = new RegExp(
      `^\\.${escapedName}\\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.tmp$`,
      'u',
    );
    let recoveredTemporary = false;
    for (const entry of readdirSync(parent).sort()) {
      if (!temporaryPattern.test(entry)) continue;
      recoverAtomicTemporary(
        join(parent, entry),
        [destination],
        parent,
        parentAttestation,
      );
      recoveredTemporary = true;
    }
    let result: 'absent' | 'installed' = 'absent';
    if (existsSync(destination)) {
      const installed = assertRegularOwnerFile(destination);
      if ((installed.mode & 0o777) !== PRIVATE_FILE_MODE) {
        fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      }
      result = 'installed';
    }
    if (recoveredTemporary) {
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
    }
    attestPrivateDirectoryChain(parent, parentAttestation);
    return result;
  };

  const recoverPrivatePublicationControlTemporaries = (
    destination: string,
    destinationAttestation: readonly DirectoryAttestation[],
  ): void => {
    const temporaryPattern = /^\.wk-publish-temporary-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
    for (const entry of readdirSync(destination).sort()) {
      if (!entry.startsWith(`${PRIVATE_PUBLICATION_RESERVED_PREFIX}temporary-`)) continue;
      if (!temporaryPattern.test(entry)) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      recoverAtomicTemporary(
        join(destination, entry),
        [
          join(destination, PRIVATE_PUBLICATION_ENVELOPE),
          join(destination, PRIVATE_PUBLICATION_COMMIT),
        ],
        destination,
        destinationAttestation,
      );
    }
  };

  const inspectPrivatePublication = (
    destination: string,
  ): Readonly<{
    status: 'absent' | 'incomplete' | 'published';
    identity?: FilesystemIdentity;
  }> => {
    if (!existsSync(destination)) return Object.freeze({ status: 'absent' });
    const destinationStatus = lstatSync(destination);
    if (!destinationStatus.isDirectory() || destinationStatus.isSymbolicLink()) {
      fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
    }
    const destinationIdentity = attestDirectory(destination, true).identity;
    const destinationAttestation = attestPrivateDirectoryChain(destination);
    recoverPrivatePublicationControlTemporaries(destination, destinationAttestation);
    const entries = readdirSync(destination).sort();
    const payloadNames = entries.filter(entry => PRIVATE_PUBLICATION_PAYLOAD.test(entry));
    const allowedEntries = new Set([
      PRIVATE_PUBLICATION_ENVELOPE,
      PRIVATE_PUBLICATION_COMMIT,
      ...payloadNames,
    ]);
    if (
      payloadNames.length > 1
      || entries.some(entry => !allowedEntries.has(entry))
    ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');

    const envelopeMarker = join(destination, PRIVATE_PUBLICATION_ENVELOPE);
    const commitMarker = join(destination, PRIVATE_PUBLICATION_COMMIT);
    const hasEnvelope = existsSync(envelopeMarker);
    const hasCommit = existsSync(commitMarker);
    let envelopeBytes: Buffer | undefined;
    let commitBytes: Buffer | undefined;
    let committedPayloadName: string | undefined;
    try {
      if (hasEnvelope) {
        envelopeBytes = readPrivatePublicationControl(
          envelopeMarker,
          PRIVATE_PUBLICATION_ENVELOPE_BYTES.byteLength,
        );
        if (!envelopeBytes.equals(PRIVATE_PUBLICATION_ENVELOPE_BYTES)) {
          fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        }
      }
      if (hasCommit) {
        commitBytes = readPrivatePublicationControl(commitMarker, 256);
        committedPayloadName = /^warpkeep-greater-realm-private-directory-commit-v1\n([^\n]+)\n$/u
          .exec(commitBytes.toString('utf8'))?.[1];
        if (
          committedPayloadName === undefined
          || !PRIVATE_PUBLICATION_PAYLOAD.test(committedPayloadName)
        ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      if (hasEnvelope && hasCommit) {
        const expectedEntries = [
          PRIVATE_PUBLICATION_COMMIT,
          PRIVATE_PUBLICATION_ENVELOPE,
          committedPayloadName!,
        ].sort();
        if (
          entries.length !== expectedEntries.length
          || entries.some((entry, index) => entry !== expectedEntries[index])
        ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        const payload = join(destination, committedPayloadName!);
        attestDirectory(payload, true);
        attestTreeAt(payload);
        attestDirectory(destination, true, destinationIdentity);
        return Object.freeze({
          status: 'published',
          identity: destinationIdentity,
        });
      }
      // The publisher creates these in strict order: envelope, payload,
      // commit. Any other incomplete arrangement is not one of our crash
      // states and must not be retired automatically.
      if (
        hasCommit
        || (!hasEnvelope && payloadNames.length !== 0)
        || (hasEnvelope && payloadNames.length > 1)
      ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      if (payloadNames.length === 1) {
        attestDirectory(join(destination, payloadNames[0]!), true);
      }
      attestTreeAt(destination);
      attestDirectory(destination, true, destinationIdentity);
      return Object.freeze({
        status: 'incomplete',
        identity: destinationIdentity,
      });
    } finally {
      envelopeBytes?.fill(0);
      commitBytes?.fill(0);
    }
  };

  /**
   * Staging directories are grouped by a digest of their exact logical
   * destination. A hard crash before the publication claim is installed can
   * therefore be recovered without sweeping another batch's private work.
   */
  const recoverPendingPublicationStages = (
    destinationRelativePath: string,
  ): void => {
    const pending = join(workspaceRoot, PRIVATE_PENDING_DIRECTORY);
    if (!existsSync(pending)) return;
    const pendingAttestation = attestPrivateDirectoryChain(pending);
    const target = join(
      pending,
      pendingPublicationTargetName(destinationRelativePath),
    );
    if (!existsSync(target)) {
      attestPrivateDirectoryChain(pending, pendingAttestation);
      return;
    }
    const targetIdentity = attestDirectory(target, true).identity;
    for (const entry of readdirSync(target, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (
        !PRIVATE_PENDING_STAGE.test(entry.name)
        || !entry.isDirectory()
        || entry.isSymbolicLink()
      ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      const stage = join(target, entry.name);
      const stageIdentity = attestDirectory(stage, true).identity;
      removePrivateTree(stage, stageIdentity);
    }
    const currentTarget = lstatSync(target);
    if (!sameIdentity(currentTarget, targetIdentity)) {
      fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');
    }
    rmdirSync(target);
    if (existsSync(target)) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
    fsyncPrivateDirectory(pending, pendingAttestation.at(-1)!.identity);
    attestPrivateDirectoryChain(pending, pendingAttestation);
  };

  const recoverAtomicDirectoryPublish = (
    relativePath: string,
  ): 'absent' | 'published' => {
    const destinationComponents = validateRelativePath(relativePath);
    if (destinationComponents[0] === '.pending') {
      fail('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID');
    }
    const parentRelativePath = destinationComponents.slice(0, -1).join('/');
    const parent = parentRelativePath
      ? ensureDirectory(parentRelativePath)
      : workspaceRoot;
    const destinationName = destinationComponents.at(-1);
    if (destinationName === undefined) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    const destination = join(parent, destinationName);
    const claim = join(parent, publicationClaimName(destinationName));
    const parentAttestation = attestPrivateDirectoryChain(parent);
    assertExistingPathHasNoSymlinks(destination);
    recoverPendingPublicationStages(destinationComponents.join('/'));

    let claimIdentity: FilesystemIdentity | undefined;
    if (existsSync(claim)) {
      const claimStatus = assertRegularOwnerFile(claim);
      if (
        (claimStatus.mode & 0o777) !== PRIVATE_FILE_MODE
        || claimStatus.size < 0
      ) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      claimIdentity = Object.freeze({ dev: claimStatus.dev, ino: claimStatus.ino });
      const expectedClaim = Buffer.from(
        `warpkeep-greater-realm-private-directory-claim-v1\n${destinationName}\n`,
        'utf8',
      );
      let claimDescriptor: number | undefined;
      let actualClaim: Buffer | undefined;
      try {
        if (claimStatus.size > expectedClaim.byteLength) {
          fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        }
        claimDescriptor = openSync(
          claim,
          constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        const openedClaim = fstatSync(claimDescriptor);
        if (
          !sameIdentity(openedClaim, claimIdentity)
          || openedClaim.size !== claimStatus.size
          || openedClaim.nlink !== 1
          || (openedClaim.mode & 0o777) !== PRIVATE_FILE_MODE
        ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        actualClaim = Buffer.alloc(openedClaim.size);
        let offset = 0;
        while (offset < actualClaim.byteLength) {
          const count = readSync(
            claimDescriptor,
            actualClaim,
            offset,
            actualClaim.byteLength - offset,
            null,
          );
          if (count <= 0) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
          offset += count;
        }
        const currentClaim = assertRegularOwnerFile(claim);
        if (
          !sameIdentity(currentClaim, claimIdentity)
          || currentClaim.size !== actualClaim.byteLength
        ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        const completeClaim = actualClaim.equals(expectedClaim);
        const recoverablePartialClaim = (
          !existsSync(destination)
          && actualClaim.byteLength < expectedClaim.byteLength
          && expectedClaim.subarray(0, actualClaim.byteLength).equals(actualClaim)
        );
        if (!completeClaim && !recoverablePartialClaim) {
          fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
        }
        if (recoverablePartialClaim) {
          closeSync(claimDescriptor);
          claimDescriptor = undefined;
          safeUnlinkIdentity(claim, claimIdentity);
          if (existsSync(claim) || existsSync(destination)) {
            fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
          }
          fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
          attestPrivateDirectoryChain(parent, parentAttestation);
          return 'absent';
        }
      } finally {
        if (claimDescriptor !== undefined) closeSync(claimDescriptor);
        actualClaim?.fill(0);
        expectedClaim.fill(0);
      }
    }

    const publication = inspectPrivatePublication(destination);
    if (claimIdentity === undefined) {
      if (publication.status === 'absent') return 'absent';
      if (publication.status !== 'published' || publication.identity === undefined) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      fsyncPrivateDirectory(destination, publication.identity);
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
      return 'published';
    }

    if (publication.status === 'incomplete') {
      if (publication.identity === undefined) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      removePrivateTree(destination, publication.identity);
      if (existsSync(destination)) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
    } else if (publication.status === 'published') {
      if (publication.identity === undefined) {
        fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
      }
      fsyncPrivateDirectory(destination, publication.identity);
    }
    safeUnlinkIdentity(claim, claimIdentity);
    if (existsSync(claim)) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
    fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
    attestPrivateDirectoryChain(parent, parentAttestation);
    return publication.status === 'published' ? 'published' : 'absent';
  };

  const writePrivatePublicationControlAtomic = (
    parent: string,
    name: string,
    bytes: Uint8Array,
    parentAttestation: readonly DirectoryAttestation[],
  ): FilesystemIdentity => {
    if (
      !name.startsWith(PRIVATE_PUBLICATION_RESERVED_PREFIX)
      || name.includes('/')
      || name.includes('\\')
      || bytes.byteLength < 1
      || bytes.byteLength > 4_096
    ) fail('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
    const destination = join(parent, name);
    const temporary = join(
      parent,
      `${PRIVATE_PUBLICATION_RESERVED_PREFIX}temporary-${randomUUID()}`,
    );
    let descriptor: number | undefined;
    let temporaryIdentity: FilesystemIdentity | undefined;
    let destinationInstalled = false;
    let completed = false;
    try {
      descriptor = openSync(
        temporary,
        constants.O_CREAT
          | constants.O_EXCL
          | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        PRIVATE_FILE_MODE,
      );
      fchmodSync(descriptor, PRIVATE_FILE_MODE);
      const created = fstatSync(descriptor);
      assertRegularOwnerFileStatus(created);
      if ((created.mode & 0o777) !== PRIVATE_FILE_MODE) {
        fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      }
      temporaryIdentity = Object.freeze({ dev: created.dev, ino: created.ino });
      writeAll(descriptor, bytes);
      fsyncSync(descriptor);
      const written = fstatSync(descriptor);
      const temporaryPathStatus = assertRegularOwnerFile(temporary);
      if (
        !sameIdentity(written, temporaryIdentity)
        || !sameIdentity(temporaryPathStatus, temporaryIdentity)
        || written.size !== bytes.byteLength
        || temporaryPathStatus.size !== bytes.byteLength
        || (written.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      attestPrivateDirectoryChain(parent, parentAttestation);
      linkSync(temporary, destination);
      destinationInstalled = true;
      const linked = lstatSync(destination);
      const stillOpened = fstatSync(descriptor);
      if (
        !linked.isFile()
        || linked.isSymbolicLink()
        || linked.nlink !== 2
        || stillOpened.nlink !== 2
        || !sameIdentity(linked, temporaryIdentity)
        || !sameIdentity(stillOpened, temporaryIdentity)
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      unlinkSync(temporary);
      const installed = assertRegularOwnerFile(destination);
      const finalOpened = fstatSync(descriptor);
      if (
        !sameIdentity(installed, temporaryIdentity)
        || !sameIdentity(finalOpened, temporaryIdentity)
        || installed.size !== bytes.byteLength
        || finalOpened.size !== bytes.byteLength
        || (installed.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
      attestPrivateDirectoryChain(parent, parentAttestation);
      completed = true;
      return temporaryIdentity;
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_WRITE_FAILED');
    } finally {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve the fixed diagnostic. */ }
      }
      if (!completed && destinationInstalled && temporaryIdentity !== undefined) {
        safeUnlinkIdentity(destination, temporaryIdentity);
      }
      if (temporaryIdentity !== undefined) safeUnlinkIdentity(temporary, temporaryIdentity);
    }
  };

  const recoverStaleExclusiveLock = (
    lockPath: string,
    parent: string,
    parentAttestation: readonly DirectoryAttestation[],
  ): boolean => {
    let descriptor: number | undefined;
    let bytes: Buffer | undefined;
    try {
      const before = lstatSync(lockPath);
      assertRegularOwnerFileStatus(before);
      if (
        before.nlink !== 1
        || (before.mode & 0o777) !== PRIVATE_FILE_MODE
        || before.size < 0
        || before.size > PRIVATE_LOCK_MAXIMUM_BYTES
      ) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      const identity = Object.freeze({ dev: before.dev, ino: before.ino });
      descriptor = openSync(
        lockPath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const opened = fstatSync(descriptor);
      if (!sameIdentity(opened, identity) || opened.size !== before.size) {
        fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      }
      bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
        if (count <= 0) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
        offset += count;
      }
      const after = fstatSync(descriptor);
      const current = lstatSync(lockPath);
      if (
        !sameIdentity(opened, after)
        || !sameIdentity(after, current)
        || opened.size !== after.size
        || opened.mtimeMs !== after.mtimeMs
        || opened.ctimeMs !== after.ctimeMs
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      const text = bytes.toString('utf8');
      const match = /^greater-realm-private-lock-v2\npid:([1-9][0-9]*)\n$/u.exec(text);
      let recoverable = false;
      if (match !== null) {
        const pid = Number(match[1]);
        if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2_147_483_647) {
          fail('GREATER_REALM_PRIVATE_FILE_INVALID');
        }
        try {
          process.kill(pid, 0);
        } catch (error) {
          recoverable = (error as NodeJS.ErrnoException)?.code === 'ESRCH';
        }
        if (!recoverable) return false;
      } else {
        // A strict prefix can only be left before operation() is entered. The
        // creator rechecks the path identity after the full record is fsynced,
        // so racing recovery cannot let two operations enter concurrently.
        recoverable = PRIVATE_LOCK_PREFIX.startsWith(text)
          || (
            text.startsWith(PRIVATE_LOCK_PREFIX)
            && /^[1-9][0-9]*$/u.test(text.slice(PRIVATE_LOCK_PREFIX.length))
          );
        if (!recoverable) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      }
      attestPrivateDirectoryChain(parent, parentAttestation);
      safeUnlinkIdentity(lockPath, identity);
      if (existsSync(lockPath)) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
      attestPrivateDirectoryChain(parent, parentAttestation);
      return true;
    } catch (error) {
      if (error instanceof GreaterRealmPrivateWorkspaceError) throw error;
      fail('GREATER_REALM_PRIVATE_FILE_INVALID');
    } finally {
      bytes?.fill(0);
      if (descriptor !== undefined) closeSync(descriptor);
    }
  };

  const withExclusiveLock = async <T>(
    relativePath: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const lockPath = resolveWorkspacePath(relativePath);
    const parentPath = relativePath.split(/[\\/]/u).slice(0, -1).join('/');
    const parent = parentPath ? ensureDirectory(parentPath) : workspaceRoot;
    if (dirname(lockPath) !== parent) {
      fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    }
    const parentAttestation = attestPrivateDirectoryChain(parent);
    let descriptor: number | undefined;
    for (;;) {
      try {
        descriptor = openSync(
          lockPath,
          constants.O_CREAT
            | constants.O_EXCL
            | constants.O_WRONLY
            | (constants.O_NOFOLLOW ?? 0),
          PRIVATE_FILE_MODE,
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
          fail('GREATER_REALM_PRIVATE_FILE_INVALID');
        }
        if (!recoverStaleExclusiveLock(lockPath, parent, parentAttestation)) {
          fail('GREATER_REALM_PRIVATE_ALREADY_RUNNING');
        }
      }
    }
    let lockIdentity: FilesystemIdentity | undefined;
    const lockBytes = Buffer.from(
      `${PRIVATE_LOCK_PREFIX}${process.pid}${PRIVATE_LOCK_SUFFIX}`,
      'utf8',
    );
    try {
      if (descriptor === undefined) fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      const created = fstatSync(descriptor);
      lockIdentity = Object.freeze({ dev: created.dev, ino: created.ino });
      fchmodSync(descriptor, PRIVATE_FILE_MODE);
      assertRegularOwnerFileStatus(fstatSync(descriptor));
      attestPrivateDirectoryChain(parent, parentAttestation);
      writeAll(descriptor, lockBytes);
      fsyncSync(descriptor);
      const written = fstatSync(descriptor);
      const current = assertRegularOwnerFile(lockPath);
      if (
        !sameIdentity(written, lockIdentity)
        || !sameIdentity(current, lockIdentity)
        || written.size !== lockBytes.byteLength
        || current.size !== lockBytes.byteLength
        || (written.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
      attestPrivateDirectoryChain(parent, parentAttestation);
      return await operation();
    } finally {
      lockBytes.fill(0);
      let lockInvalid = false;
      try {
        if (descriptor === undefined) throw new Error('lock descriptor missing');
        const opened = fstatSync(descriptor);
        const current = lstatSync(lockPath);
        if (
          lockIdentity === undefined
          || !sameIdentity(opened, lockIdentity)
          || !sameIdentity(current, lockIdentity)
          || current.nlink !== 1
          || opened.nlink !== 1
        ) lockInvalid = true;
      } catch {
        lockInvalid = true;
      }
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { lockInvalid = true; }
        descriptor = undefined;
      }
      if (lockIdentity !== undefined) safeUnlinkIdentity(lockPath, lockIdentity);
      try {
        if (existsSync(lockPath)) lockInvalid = true;
        fsyncPrivateDirectory(parent, parentAttestation.at(-1)!.identity);
        attestPrivateDirectoryChain(parent, parentAttestation);
      } catch {
        lockInvalid = true;
      }
      if (lockInvalid) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
    }
  };

  const withAtomicDirectoryPublish = async <T>(
    relativePath: string,
    operation: (stagedWorkspace: GreaterRealmPrivateWorkspace) => Promise<T>,
  ): Promise<T> => {
    if (typeof operation !== 'function') {
      fail('GREATER_REALM_PRIVATE_STAGING_OPERATION_INVALID');
    }
    const destinationComponents = validateRelativePath(relativePath);
    if (destinationComponents[0] === '.pending') {
      fail('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID');
    }
    const destinationRelativePath = destinationComponents.join('/');
    const publicationLockPath = (
      `locks/publications/${pendingPublicationTargetName(destinationRelativePath)}.lock`
    );
    return withExclusiveLock(publicationLockPath, async () => {
    const destinationParentRelativePath = destinationComponents.slice(0, -1).join('/');
    const destinationParent = destinationParentRelativePath
      ? ensureDirectory(destinationParentRelativePath)
      : workspaceRoot;
    const destinationName = destinationComponents.at(-1);
    if (destinationName === undefined) fail('GREATER_REALM_PRIVATE_RELATIVE_PATH_INVALID');
    const destination = join(destinationParent, destinationName);
    const claim = join(destinationParent, publicationClaimName(destinationName));
    const destinationParentAttestation = attestPrivateDirectoryChain(destinationParent);
    assertExistingPathHasNoSymlinks(destination);
    if (existsSync(destination) || existsSync(claim)) {
      fail('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');
    }

    recoverPendingPublicationStages(destinationRelativePath);
    const pendingRelativePath = PRIVATE_PENDING_DIRECTORY;
    const pending = ensureDirectory(pendingRelativePath);
    const pendingAttestation = attestPrivateDirectoryChain(pending);
    const pendingTargetRelativePath = (
      `${pendingRelativePath}/${pendingPublicationTargetName(destinationRelativePath)}`
    );
    const pendingTarget = ensureDirectory(pendingTargetRelativePath);
    const pendingTargetIdentity = attestDirectory(pendingTarget, true).identity;
    const stagingRelativePath = `${pendingTargetRelativePath}/${randomUUID()}`;
    const staging = ensureDirectory(stagingRelativePath);
    const stagingIdentity = attestDirectory(staging, true).identity;

    const translate = (logicalPath: string): string => {
      const logicalComponents = validateRelativePath(logicalPath);
      if (
        logicalComponents.length < destinationComponents.length
        || destinationComponents.some((component, index) => logicalComponents[index] !== component)
      ) fail('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID');
      const suffix = logicalComponents.slice(destinationComponents.length);
      return [stagingRelativePath, ...suffix].join('/');
    };
    const stagedWorkspace: GreaterRealmPrivateWorkspace = Object.freeze({
      root: staging,
      ensureDirectory: path => ensureDirectory(translate(path)),
      hasFile: path => hasFile(translate(path)),
      readFile: (path, maximumBytes) => readFile(translate(path), maximumBytes),
      writeFileAtomic: (path, bytes, maximumBytes) => (
        writeFileAtomic(translate(path), bytes, maximumBytes)
      ),
      recoverAtomicFileWrite: path => recoverAtomicFileWrite(translate(path)),
      recoverAtomicDirectoryPublish: () => (
        fail('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID')
      ),
      attestTree: path => attestTree(path === undefined
        ? stagingRelativePath
        : translate(path)),
      withExclusiveLock: (path, nestedOperation) => (
        withExclusiveLock(translate(path), nestedOperation)
      ),
      withAtomicDirectoryPublish: async () => (
        fail('GREATER_REALM_PRIVATE_STAGING_SCOPE_INVALID')
      ),
    });

    let claimDescriptor: number | undefined;
    let claimIdentity: FilesystemIdentity | undefined;
    let envelopeIdentity: FilesystemIdentity | undefined;
    let destinationCreatedByPublisher = false;
    let claimRemoved = false;
    const claimBytes = Buffer.from(
      `warpkeep-greater-realm-private-directory-claim-v1\n${destinationName}\n`,
      'utf8',
    );
    try {
      const result = await operation(stagedWorkspace);
      const stagedTree = attestTree(stagingRelativePath);
      attestDirectory(staging, true, stagingIdentity);
      attestPrivateDirectoryChain(destinationParent, destinationParentAttestation);

      try {
        claimDescriptor = openSync(
          claim,
          constants.O_CREAT
            | constants.O_EXCL
            | constants.O_WRONLY
            | (constants.O_NOFOLLOW ?? 0),
          PRIVATE_FILE_MODE,
        );
      } catch {
        fail('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');
      }
      fchmodSync(claimDescriptor, PRIVATE_FILE_MODE);
      const createdClaim = fstatSync(claimDescriptor);
      assertRegularOwnerFileStatus(createdClaim);
      if ((createdClaim.mode & 0o777) !== PRIVATE_FILE_MODE) {
        fail('GREATER_REALM_PRIVATE_FILE_INVALID');
      }
      claimIdentity = Object.freeze({ dev: createdClaim.dev, ino: createdClaim.ino });
      writeAll(claimDescriptor, claimBytes);
      fsyncSync(claimDescriptor);
      const writtenClaim = fstatSync(claimDescriptor);
      const currentClaim = assertRegularOwnerFile(claim);
      if (
        !sameIdentity(writtenClaim, claimIdentity)
        || !sameIdentity(currentClaim, claimIdentity)
        || writtenClaim.size !== claimBytes.byteLength
        || currentClaim.size !== claimBytes.byteLength
        || (writtenClaim.mode & 0o777) !== PRIVATE_FILE_MODE
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      fsyncPrivateDirectory(
        destinationParent,
        destinationParentAttestation.at(-1)!.identity,
      );
      attestPrivateDirectoryChain(destinationParent, destinationParentAttestation);

      try {
        mkdirSync(destination, { mode: PRIVATE_DIRECTORY_MODE });
        destinationCreatedByPublisher = true;
      } catch {
        if (existsSync(destination)) fail('GREATER_REALM_PRIVATE_DESTINATION_EXISTS');
        fail('GREATER_REALM_PRIVATE_DIRECTORY_CREATE_FAILED');
      }
      hardenNewPrivateDirectory(destination);
      fsyncPrivateDirectory(
        destinationParent,
        destinationParentAttestation.at(-1)!.identity,
      );
      envelopeIdentity = attestDirectory(destination, true).identity;
      const envelopeAttestation = attestPrivateDirectoryChain(destination);
      writePrivatePublicationControlAtomic(
        destination,
        PRIVATE_PUBLICATION_ENVELOPE,
        PRIVATE_PUBLICATION_ENVELOPE_BYTES,
        envelopeAttestation,
      );

      const payloadName = `${PRIVATE_PUBLICATION_PAYLOAD_PREFIX}${randomUUID()}`;
      const payload = join(destination, payloadName);
      renameSync(staging, payload);
      attestDirectory(payload, true, stagingIdentity);
      fsyncPrivateDirectory(destination, envelopeIdentity);
      fsyncPrivateDirectory(pendingTarget, pendingTargetIdentity);
      const installedTree = attestTreeAt(payload);
      if (
        installedTree.entryCount !== stagedTree.entryCount
        || installedTree.fileCount !== stagedTree.fileCount
        || installedTree.directoryCount !== stagedTree.directoryCount
        || installedTree.byteCount !== stagedTree.byteCount
      ) fail('GREATER_REALM_PRIVATE_DIRECTORY_CHANGED');

      const commitBytes = Buffer.from(
        `warpkeep-greater-realm-private-directory-commit-v1\n${payloadName}\n`,
        'utf8',
      );
      try {
        writePrivatePublicationControlAtomic(
          destination,
          PRIVATE_PUBLICATION_COMMIT,
          commitBytes,
          envelopeAttestation,
        );
      } finally {
        commitBytes.fill(0);
      }
      attestDirectory(destination, true, envelopeIdentity);
      attestDirectory(payload, true, stagingIdentity);
      attestPrivateDirectoryChain(destination, envelopeAttestation);
      fsyncPrivateDirectory(destination, envelopeIdentity);
      fsyncPrivateDirectory(destinationParent, destinationParentAttestation.at(-1)!.identity);
      recoverPendingPublicationStages(destinationRelativePath);
      attestPrivateDirectoryChain(pending, pendingAttestation);

      const finalClaimDescriptor = fstatSync(claimDescriptor);
      const finalClaimPath = assertRegularOwnerFile(claim);
      if (
        !sameIdentity(finalClaimDescriptor, claimIdentity)
        || !sameIdentity(finalClaimPath, claimIdentity)
        || finalClaimDescriptor.nlink !== 1
        || finalClaimPath.nlink !== 1
        || finalClaimDescriptor.size !== claimBytes.byteLength
        || finalClaimPath.size !== claimBytes.byteLength
      ) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      closeSync(claimDescriptor);
      claimDescriptor = undefined;
      safeUnlinkIdentity(claim, claimIdentity);
      if (existsSync(claim)) fail('GREATER_REALM_PRIVATE_FILE_CHANGED');
      fsyncPrivateDirectory(
        destinationParent,
        destinationParentAttestation.at(-1)!.identity,
      );
      claimRemoved = true;
      return result;
    } catch (error) {
      let cleanupFailed = false;
      try {
        if (claimRemoved) {
          cleanupFailed = true;
        } else if (envelopeIdentity !== undefined && existsSync(destination)) {
          removePrivateTree(destination, envelopeIdentity);
          destinationCreatedByPublisher = false;
        } else if (destinationCreatedByPublisher) {
          // The name was exclusively claimed by this publisher, but its
          // identity could not be pinned. Keep the claim in place so no
          // reader can mistake the uncertain directory for a package.
          cleanupFailed = true;
        }
        if (existsSync(staging)) {
          removePrivateTree(staging, stagingIdentity, true);
        }
        if (existsSync(pendingTarget)) {
          const currentPendingTarget = lstatSync(pendingTarget);
          if (!sameIdentity(currentPendingTarget, pendingTargetIdentity)) {
            cleanupFailed = true;
          } else {
            recoverPendingPublicationStages(destinationRelativePath);
          }
        }
        if (claimDescriptor !== undefined) {
          try { closeSync(claimDescriptor); } catch { cleanupFailed = true; }
          claimDescriptor = undefined;
        }
        if (!destinationCreatedByPublisher && claimIdentity !== undefined) {
          safeUnlinkIdentity(claim, claimIdentity);
        }
        if (!destinationCreatedByPublisher && existsSync(claim)) cleanupFailed = true;
        attestPrivateDirectoryChain(destinationParent, destinationParentAttestation);
        attestPrivateDirectoryChain(pending, pendingAttestation);
      } catch {
        cleanupFailed = true;
      }
      if (cleanupFailed) fail('GREATER_REALM_PRIVATE_STAGING_CLEANUP_FAILED');
      throw error;
    } finally {
      claimBytes.fill(0);
      if (claimDescriptor !== undefined) {
        try { closeSync(claimDescriptor); } catch { /* Catch path owns diagnostics. */ }
      }
    }
    });
  };

  return Object.freeze({
    root: workspaceRoot,
    ensureDirectory,
    hasFile,
    readFile,
    writeFileAtomic,
    recoverAtomicFileWrite,
    recoverAtomicDirectoryPublish,
    attestTree,
    withExclusiveLock,
    withAtomicDirectoryPublish,
  });
}

/** Executable-only seams for crash-state construction in focused tests. */
export const greaterRealmPrivateWorkspaceTestSeams = Object.freeze({
  lockRecord(pid: number): string {
    if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2_147_483_647) {
      fail('GREATER_REALM_PRIVATE_FILE_INVALID');
    }
    return `${PRIVATE_LOCK_PREFIX}${pid}${PRIVATE_LOCK_SUFFIX}`;
  },
  pendingTargetName(relativePath: string): string {
    return pendingPublicationTargetName(validateRelativePath(relativePath).join('/'));
  },
});
