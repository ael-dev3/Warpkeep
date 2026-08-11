import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const GREATER_REALM_CUTOVER_RECEIPT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
} as const);

export const GREATER_REALM_CUTOVER_RECEIPT_KINDS = Object.freeze([
  'warpkeep-greater-realm-production-publish-v1',
  'warpkeep-greater-realm-production-import-v1',
  'warpkeep-greater-realm-production-relocation-v1',
] as const);

export type GreaterRealmCutoverReceiptKind =
  typeof GREATER_REALM_CUTOVER_RECEIPT_KINDS[number];

export type GreaterRealmPrivateReceiptWriteResult = Readonly<{
  path: string;
  receiptDigest: string;
  recordedAt: string;
  result: 'installed' | 'unchanged';
}>;

export class GreaterRealmCutoverReceiptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmCutoverReceiptError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmCutoverReceiptError(code);
}

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 64 * 1024;
const RECEIPT_FILE = /^greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}\.json$/u;
const TEMPORARY_FILE = /^\.greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}-[0-9a-f]{12}\.json\.tmp$/u;
const OPERATOR_LOCK_FILE = '.greater-realm-cutover.lock';

function inside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function assertNoSymlinkAncestors(path: string): void {
  let current = path;
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      fail('GREATER_REALM_CUTOVER_RECEIPT_SYMLINK_REJECTED');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function privateDirectory(directory: string, repositoryRoot: string): string {
  if (!isAbsolute(directory)) fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_NOT_ABSOLUTE');
  const requested = resolve(directory);
  const repository = realpathSync(resolve(repositoryRoot));
  if (inside(repository, requested) || inside(requested, repository)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_REPOSITORY_OVERLAP');
  }
  assertNoSymlinkAncestors(requested);
  const missing: string[] = [];
  let ancestor = requested;
  while (!existsSync(ancestor)) {
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_INVALID');
    ancestor = parent;
  }
  let canonicalParent = realpathSync(ancestor);
  if (inside(repository, canonicalParent) || inside(canonicalParent, repository)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_REPOSITORY_OVERLAP');
  }
  for (const path of missing) {
    mkdirSync(path, { mode: DIRECTORY_MODE });
    chmodSync(path, DIRECTORY_MODE);
    const status = lstatSync(path);
    const canonical = realpathSync(path);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o777) !== DIRECTORY_MODE
      || dirname(canonical) !== canonicalParent
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_CREATE_FAILED');
    canonicalParent = canonical;
  }
  const status = lstatSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (statSync(requested).mode & 0o777) !== DIRECTORY_MODE
  ) fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_INVALID');
  const canonical = realpathSync(requested);
  for (const entry of readdirSync(canonical, { withFileTypes: true })) {
    if (
      !entry.isFile()
      || (!RECEIPT_FILE.test(entry.name)
        && !TEMPORARY_FILE.test(entry.name)
        && entry.name !== OPERATOR_LOCK_FILE)
    ) {
      fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_NOT_DEDICATED');
    }
    const entryStatus = lstatSync(join(canonical, entry.name));
    if (
      entryStatus.isSymbolicLink()
      || (process.getuid !== undefined && entryStatus.uid !== process.getuid())
      || (entryStatus.mode & 0o777) !== FILE_MODE
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  return canonical;
}

function jsonSafe(value: unknown, ancestors = new Set<object>()): unknown {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || ancestors.has(value)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(child => jsonSafe(child, ancestors));
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
    }
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => {
        if (/secret|token|credential|actor|subject|fid|castleId|cellKey|slotId|nodeId/iu.test(key)) {
          fail('GREATER_REALM_CUTOVER_RECEIPT_PRIVATE_FIELD_REJECTED');
        }
        return [key, jsonSafe(child, ancestors)];
      }));
  } finally {
    ancestors.delete(value);
  }
}

function receiptPrefix(kind: GreaterRealmCutoverReceiptKind): 'publish' | 'import' | 'relocation' {
  if (kind.endsWith('publish-v1')) return 'publish';
  if (kind.endsWith('import-v1')) return 'import';
  return 'relocation';
}

function readExact(path: string, expected: Buffer): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size !== expected.byteLength
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
      || (before.mode & 0o777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_EXISTING_MISMATCH');
    const actual = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !actual.equals(expected)
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_EXISTING_MISMATCH');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function defaultGreaterRealmCutoverReceiptDirectory(): string {
  return join(homedir(), '.warpkeep', 'private', 'greater-realm-cutover-receipts');
}

/** Serializes all production cutover writes in the same owner-only directory. */
export async function withGreaterRealmCutoverOperatorLock<T>(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  operation: () => Promise<T>;
}>): Promise<T> {
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const lockPath = join(directory, OPERATOR_LOCK_FILE);
  let descriptor: number;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      fail('GREATER_REALM_CUTOVER_OPERATOR_ALREADY_RUNNING');
    }
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_FAILED');
  }
  try {
    const processId = Buffer.from(`${process.pid}\n`, 'ascii');
    let offset = 0;
    while (offset < processId.byteLength) {
      const written = writeSync(
        descriptor,
        processId,
        offset,
        processId.byteLength - offset,
      );
      if (written <= 0) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    chmodSync(lockPath, FILE_MODE);
    return await input.operation();
  } finally {
    const opened = fstatSync(descriptor);
    closeSync(descriptor);
    try {
      const current = lstatSync(lockPath);
      if (current.dev === opened.dev && current.ino === opened.ino) unlinkSync(lockPath);
    } catch {
      // Preserve a replacement lock and the operation's primary result.
    }
  }
}

/** No-clobber, owner-only receipt write outside the repository. */
export function writePrivateGreaterRealmCutoverReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  kind: GreaterRealmCutoverReceiptKind;
  record: Readonly<Record<string, unknown>>;
  now?: Date;
}>): GreaterRealmPrivateReceiptWriteResult {
  if (!GREATER_REALM_CUTOVER_RECEIPT_KINDS.includes(input.kind)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_KIND_INVALID');
  }
  const recordedAt = (input.now ?? new Date()).toISOString();
  if (new Date(recordedAt).toISOString() !== recordedAt) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_TIME_INVALID');
  }
  const body = Buffer.from(`${JSON.stringify(jsonSafe({
    schemaVersion: 1,
    kind: input.kind,
    recordedAt,
    target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
    record: input.record,
  }), null, 2)}\n`, 'utf8');
  if (body.byteLength < 1 || body.byteLength > MAX_RECEIPT_BYTES) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_SIZE_INVALID');
  }
  const receiptDigest = createHash('sha256').update(body).digest('hex');
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const basename = `greater-realm-${receiptPrefix(input.kind)}-${receiptDigest}.json`;
  const destination = join(directory, basename);
  if (existsSync(destination)) {
    readExact(destination, body);
    return Object.freeze({
      path: destination,
      receiptDigest,
      recordedAt,
      result: 'unchanged',
    });
  }
  const temporary = join(
    directory,
    `.${basename.slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    let offset = 0;
    while (offset < body.byteLength) {
      const written = writeSync(descriptor, body, offset, body.byteLength - offset);
      if (written <= 0) fail('GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    unlinkSync(temporary);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    readExact(destination, body);
    return Object.freeze({
      path: destination,
      receiptDigest,
      recordedAt,
      result: 'installed',
    });
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the fixed error. */ }
    }
    try { unlinkSync(temporary); } catch { /* Preserve the fixed error. */ }
    if (error instanceof GreaterRealmCutoverReceiptError) throw error;
    fail('GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
}
