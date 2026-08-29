import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  assertProductionAdminTrustedAncestors,
} from './production-admin-token-budget.mjs';

export const PTR_PRODUCTION_RECEIPT_KINDS = Object.freeze([
  'publish', 'atlas-import', 'owner-provision', 'sealed-live',
] as const);

type PtrProductionReceiptKind = typeof PTR_PRODUCTION_RECEIPT_KINDS[number];
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAXIMUM_RECEIPT_BYTES = 64 * 1_024;
const RECEIPT_FILE = /^ptr-(?:publish|atlas-import|owner-provision|sealed-live)-[0-9a-f]{64}\.json$/u;
const PRIVATE_KEY = /^(?:fid|ownerFid|ownerAuthEpoch|token|secret)$/iu;

export class PtrProductionReceiptFileError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PtrProductionReceiptFileError';
  }
}

function fail(code: string): never {
  throw new PtrProductionReceiptFileError(code);
}

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
      fail('PTR_PRODUCTION_RECEIPT_SYMLINK_REJECTED');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function createPrivateDirectory(path: string, canonicalParent: string): string {
  let descriptor: number | undefined;
  try {
    mkdirSync(path, { mode: DIRECTORY_MODE });
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    fchmodSync(descriptor, DIRECTORY_MODE);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    const canonical = realpathSync(path);
    if (
      !opened.isDirectory()
      || current.isSymbolicLink()
      || opened.dev !== current.dev
      || opened.ino !== current.ino
      || opened.nlink !== current.nlink
      || opened.mode !== current.mode
      || opened.uid !== current.uid
      || (opened.mode & 0o7777) !== DIRECTORY_MODE
      || (process.getuid !== undefined && opened.uid !== process.getuid())
      || dirname(canonical) !== canonicalParent
    ) fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_CREATE_FAILED');
    return canonical;
  } catch (error) {
    if (error instanceof PtrProductionReceiptFileError) throw error;
    return fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_CREATE_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function privateDirectory(directory: string, repositoryRoot: string): string {
  if (!isAbsolute(directory) || resolve(directory) !== directory) {
    fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_NOT_ABSOLUTE');
  }
  assertNoSymlinkAncestors(directory);
  assertProductionAdminTrustedAncestors(directory);
  const repository = realpathSync(resolve(repositoryRoot));
  if (inside(repository, directory) || inside(directory, repository)) {
    fail('PTR_PRODUCTION_RECEIPT_REPOSITORY_OVERLAP');
  }
  const missing: string[] = [];
  let ancestor = directory;
  while (!existsSync(ancestor)) {
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_INVALID');
    ancestor = parent;
  }
  let canonicalParent = realpathSync(ancestor);
  if (inside(repository, canonicalParent) || inside(canonicalParent, repository)) {
    fail('PTR_PRODUCTION_RECEIPT_REPOSITORY_OVERLAP');
  }
  for (const child of missing) {
    canonicalParent = createPrivateDirectory(child, canonicalParent);
  }
  const status = lstatSync(directory);
  const canonical = realpathSync(directory);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (status.mode & 0o7777) !== DIRECTORY_MODE
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || canonical !== directory
  ) fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_INVALID');
  const entries = readdirSync(canonical, { withFileTypes: true });
  if (entries.length > 128) {
    fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  for (const entry of entries) {
    const path = join(canonical, entry.name);
    const child = lstatSync(path);
    if (
      !entry.isFile()
      || !RECEIPT_FILE.test(entry.name)
      || child.isSymbolicLink()
      || child.nlink !== 1
      || child.size < 1
      || child.size > MAXIMUM_RECEIPT_BYTES
      || (child.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && child.uid !== process.getuid())
    ) fail('PTR_PRODUCTION_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  return canonical;
}

/** Reads one canonical publish receipt without trusting its embedded digest. */
export function readPrivatePtrProductionPublishReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  expectedReceiptDigest: string;
}>): Readonly<{
  receipt: Readonly<Record<string, unknown>>;
  path: string;
  receiptFileSha256: string;
}> {
  if (
    !/^[0-9a-f]{64}$/u.test(input.expectedReceiptDigest)
    || !existsSync(input.directory)
  ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_NOT_FOUND');
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const matches: Array<Readonly<{
    receipt: Readonly<Record<string, unknown>>;
    path: string;
    receiptFileSha256: string;
  }>> = [];
  for (const name of readdirSync(directory)) {
    const file = /^ptr-publish-([0-9a-f]{64})\.json$/u.exec(name);
    if (file === null) continue;
    const path = join(directory, name);
    let descriptor: number | undefined;
    let bytes: Buffer | undefined;
    let expected: Buffer | undefined;
    try {
      descriptor = openSync(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const before = fstatSync(descriptor);
      if (
        !before.isFile()
        || before.nlink !== 1
        || before.size < 1
        || before.size > MAXIMUM_RECEIPT_BYTES
        || (before.mode & 0o7777) !== FILE_MODE
        || (process.getuid !== undefined && before.uid !== process.getuid())
      ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
      bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      if (
        before.dev !== after.dev
        || before.ino !== after.ino
        || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs
        || createHash('sha256').update(bytes).digest('hex') !== file[1]
      ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
      let parsed: unknown;
      try { parsed = JSON.parse(bytes.toString('utf8')); } catch {
        fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
      }
      const canonical = canonicalJson(parsed);
      if (
        canonical === null
        || typeof canonical !== 'object'
        || Array.isArray(canonical)
      ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
      expected = Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
      if (!bytes.equals(expected)) {
        fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
      }
      const receipt = canonical as Readonly<Record<string, unknown>>;
      if (receipt.publishReceiptDigest === input.expectedReceiptDigest) {
        matches.push(Object.freeze({
          receipt: Object.freeze(receipt),
          path,
          receiptFileSha256: file[1]!,
        }));
      }
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      bytes?.fill(0);
      expected?.fill(0);
    }
  }
  if (matches.length === 0) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_NOT_FOUND');
  if (matches.length !== 1) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_AMBIGUOUS');
  return matches[0]!;
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail('PTR_PRODUCTION_RECEIPT_RECORD_INVALID');
    }
    return value;
  }
  if (typeof value !== 'object' || Array.isArray(value) || ancestors.has(value)) {
    fail('PTR_PRODUCTION_RECEIPT_RECORD_INVALID');
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('PTR_PRODUCTION_RECEIPT_RECORD_INVALID');
  }
  ancestors.add(value);
  try {
    const record = value as Readonly<Record<string, unknown>>;
    if (
      Object.getOwnPropertySymbols(record).length !== 0
      || Object.keys(record).some(key => PRIVATE_KEY.test(key))
      || Object.values(Object.getOwnPropertyDescriptors(record)).some(
        descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
      )
    ) fail('PTR_PRODUCTION_RECEIPT_PRIVATE_DATA_REJECTED');
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [
        key,
        canonicalJson(child, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}

function readExisting(path: string, expected: Buffer): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.nlink !== 1
      || (before.mode & 0o7777) !== FILE_MODE
      || before.size !== expected.byteLength
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('PTR_PRODUCTION_RECEIPT_EXISTING_INVALID');
    const actual = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      !actual.equals(expected)
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('PTR_PRODUCTION_RECEIPT_EXISTING_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory: string): void {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

/** Deterministic, exclusive, private receipt publication outside the repository. */
export function writePrivatePtrProductionReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  kind: PtrProductionReceiptKind;
  receipt: Readonly<Record<string, unknown>>;
  testOnlyFailAfterBytesWritten?: () => void;
}>): Readonly<{
  path: string;
  receiptFileSha256: string;
  result: 'installed' | 'unchanged';
}> {
  if (!PTR_PRODUCTION_RECEIPT_KINDS.includes(input.kind)) {
    fail('PTR_PRODUCTION_RECEIPT_KIND_INVALID');
  }
  const canonical = canonicalJson(input.receipt);
  const body = Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
  if (body.byteLength < 1 || body.byteLength > MAXIMUM_RECEIPT_BYTES) {
    fail('PTR_PRODUCTION_RECEIPT_SIZE_INVALID');
  }
  const receiptFileSha256 = createHash('sha256').update(body).digest('hex');
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const path = join(directory, `ptr-${input.kind}-${receiptFileSha256}.json`);
  if (existsSync(path)) {
    readExisting(path, body);
    body.fill(0);
    return Object.freeze({ path, receiptFileSha256, result: 'unchanged' });
  }
  let descriptor: number | undefined;
  let createdIdentity: Readonly<{ dev: number; ino: number }> | undefined;
  let installed = false;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const created = fstatSync(descriptor);
    createdIdentity = Object.freeze({ dev: created.dev, ino: created.ino });
    fchmodSync(descriptor, FILE_MODE);
    let offset = 0;
    while (offset < body.byteLength) {
      const written = writeSync(
        descriptor,
        body,
        offset,
        body.byteLength - offset,
        offset,
      );
      if (written < 1) fail('PTR_PRODUCTION_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    input.testOnlyFailAfterBytesWritten?.();
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile()
      || opened.dev !== current.dev
      || opened.ino !== current.ino
      || opened.nlink !== 1
      || opened.size !== body.byteLength
      || (opened.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && opened.uid !== process.getuid())
    ) fail('PTR_PRODUCTION_RECEIPT_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(directory);
    readExisting(path, body);
    installed = true;
    return Object.freeze({ path, receiptFileSha256, result: 'installed' });
  } catch (error) {
    if (error instanceof PtrProductionReceiptFileError) throw error;
    return fail('PTR_PRODUCTION_RECEIPT_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve fixed error. */ }
    }
    if (!installed && createdIdentity !== undefined) {
      try {
        const current = lstatSync(path);
        if (
          !current.isSymbolicLink()
          && current.dev === createdIdentity.dev
          && current.ino === createdIdentity.ino
        ) {
          unlinkSync(path);
          try { fsyncDirectory(directory); } catch {
            /* The fixed write error remains authoritative. */
          }
        }
      } catch {
        /* Never unlink a path whose identity can no longer be proven. */
      }
    }
    body.fill(0);
  }
}
