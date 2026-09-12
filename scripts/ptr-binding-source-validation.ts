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
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_DEPENDENCY_TREE_BYTES = 512 * 1024 * 1024;
const MAX_DEPENDENCY_TREE_ENTRIES = 20_000;

function fail(code: string): never {
  throw new Error(code);
}

function updateLengthFramed(
  digest: ReturnType<typeof createHash>,
  label: string,
  value: string | Buffer,
): void {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const lengths = Buffer.allocUnsafe(16);
  lengths.writeBigUInt64BE(BigInt(labelBytes.byteLength), 0);
  lengths.writeBigUInt64BE(BigInt(valueBytes.byteLength), 8);
  digest.update(lengths.subarray(0, 8));
  digest.update(labelBytes);
  digest.update(lengths.subarray(8, 16));
  digest.update(valueBytes);
  lengths.fill(0);
}

type DependencyEntryIdentity = Readonly<{
  kind: 'directory' | 'file' | 'symlink';
  dev: bigint;
  ino: bigint;
  mode: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

export type DependencyTreeSnapshot = Readonly<{
  contentDigest: string;
  identityDigest: string;
  entries: ReadonlyMap<string, DependencyEntryIdentity>;
}>;

function inside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function sameIdentity(
  left: DependencyEntryIdentity,
  right: DependencyEntryIdentity,
): boolean {
  return left.kind === right.kind
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export function dependencyTreeSnapshot(input: Readonly<{
  root: string;
  boundary: string;
}>): DependencyTreeSnapshot {
  const root = resolve(input.root);
  const boundary = realpathSync(resolve(input.boundary));
  const rootStatus = lstatSync(root, { bigint: true });
  if (
    rootStatus.isSymbolicLink()
    || !rootStatus.isDirectory()
    || realpathSync(root) !== root
    || !inside(boundary, root)
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
  const content = createHash('sha256');
  const identity = createHash('sha256');
  updateLengthFramed(content, 'domain', 'warpkeep-dependency-tree-content-v2');
  updateLengthFramed(identity, 'domain', 'warpkeep-dependency-tree-identity-v2');
  const entries = new Map<string, DependencyEntryIdentity>();
  let totalBytes = 0n;
  const visit = (path: string, logicalPath: string) => {
    if (entries.size >= MAX_DEPENDENCY_TREE_ENTRIES) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const before = lstatSync(path, { bigint: true });
    if (process.getuid !== undefined && before.uid !== BigInt(process.getuid())) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const mode = before.mode & 0o7777n;
    if ((mode & 0o7000n) !== 0n) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    const kind = before.isDirectory()
      ? 'directory'
      : before.isFile()
        ? 'file'
        : before.isSymbolicLink()
          ? 'symlink'
          : undefined;
    if (kind === undefined) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    if (kind !== 'symlink' && (before.mode & 0o022n) !== 0n) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const record = Object.freeze({
      kind,
      dev: before.dev,
      ino: before.ino,
      mode,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });
    entries.set(logicalPath, record);
    updateLengthFramed(content, 'entry-kind', kind);
    updateLengthFramed(content, 'entry-path', logicalPath);
    updateLengthFramed(content, 'entry-mode', mode.toString(8));
    if (kind === 'directory') {
      const names = readdirSync(path).sort();
      for (const name of names) {
        if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
          fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
        }
        visit(join(path, name), logicalPath === '' ? name : `${logicalPath}/${name}`);
      }
    } else if (kind === 'symlink') {
      const target = readlinkSync(path, 'utf8');
      const resolvedTarget = resolve(path, '..', target);
      if (
        target.length < 1
        || target.length > 4_096
        || target.includes('\0')
        || isAbsolute(target)
        || !inside(boundary, resolvedTarget)
        || !inside(boundary, realpathSync(path))
      ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      updateLengthFramed(content, 'entry-symlink-target', target);
    } else {
      if (
        before.nlink !== 1n
        || before.size < 0n
        || before.size > BigInt(MAX_DEPENDENCY_TREE_BYTES)
      ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      totalBytes += before.size;
      if (totalBytes > BigInt(MAX_DEPENDENCY_TREE_BYTES)) {
        fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      }
      let descriptor: number | undefined;
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      const fileDigest = createHash('sha256');
      try {
        descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened = fstatSync(descriptor, { bigint: true });
        if (
          opened.dev !== before.dev
          || opened.ino !== before.ino
          || opened.size !== before.size
          || opened.mtimeNs !== before.mtimeNs
          || opened.ctimeNs !== before.ctimeNs
        ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
        let offset = 0n;
        while (offset < opened.size) {
          const remaining = opened.size - offset;
          const count = readSync(
            descriptor,
            buffer,
            0,
            Number(remaining > BigInt(buffer.byteLength) ? BigInt(buffer.byteLength) : remaining),
            Number(offset),
          );
          if (count <= 0) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
          fileDigest.update(buffer.subarray(0, count));
          offset += BigInt(count);
        }
        const after = fstatSync(descriptor, { bigint: true });
        if (
          after.dev !== opened.dev
          || after.ino !== opened.ino
          || after.size !== opened.size
          || after.mtimeNs !== opened.mtimeNs
          || after.ctimeNs !== opened.ctimeNs
        ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
      } finally {
        buffer.fill(0);
        if (descriptor !== undefined) closeSync(descriptor);
      }
      updateLengthFramed(content, 'entry-file-size', before.size.toString());
      updateLengthFramed(content, 'entry-file-sha256', fileDigest.digest());
    }
    const after = lstatSync(path, { bigint: true });
    const afterRecord: DependencyEntryIdentity = Object.freeze({
      kind: after.isDirectory() ? 'directory' : after.isFile() ? 'file' : 'symlink',
      dev: after.dev,
      ino: after.ino,
      mode: after.mode & 0o7777n,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    });
    if (!sameIdentity(record, afterRecord)) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
    updateLengthFramed(identity, 'entry-path', logicalPath);
    updateLengthFramed(identity, 'entry-kind', kind);
    updateLengthFramed(identity, 'entry-dev', record.dev.toString());
    updateLengthFramed(identity, 'entry-ino', record.ino.toString());
    updateLengthFramed(identity, 'entry-mode', record.mode.toString(8));
    updateLengthFramed(identity, 'entry-size', record.size.toString());
    updateLengthFramed(identity, 'entry-mtime-ns', record.mtimeNs.toString());
    updateLengthFramed(identity, 'entry-ctime-ns', record.ctimeNs.toString());
  };
  visit(root, '');
  return Object.freeze({
    contentDigest: content.digest('hex'),
    identityDigest: identity.digest('hex'),
    entries,
  });
}

function tarString(field: Buffer): string {
  const zero = field.indexOf(0);
  const body = zero < 0 ? field : field.subarray(0, zero);
  if (zero >= 0 && field.subarray(zero).some(value => value !== 0)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
}

function tarOctal(field: Buffer, maximum: number): number {
  const value = field.toString('ascii').replace(/[\0 ]+$/u, '').trimStart();
  if (!/^[0-7]+$/u.test(value)) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  return parsed;
}

type SafeTarEntry = Readonly<{
  path: string;
  kind: 'directory' | 'file';
  mode: 0o600 | 0o700;
  offset: number;
  size: number;
}>;

export function parseSafeNpmTar(archive: Buffer): Readonly<{
  uncompressed: Buffer;
  entries: readonly SafeTarEntry[];
  fileBytes: number;
}> {
  let uncompressed: Buffer;
  try {
    uncompressed = gunzipSync(archive, { maxOutputLength: MAX_UNCOMPRESSED_ARCHIVE_BYTES });
  } catch {
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  if (uncompressed.length < 1_024 || uncompressed.length % 512 !== 0) {
    uncompressed.fill(0);
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  const entries: SafeTarEntry[] = [];
  const paths = new Set<string>();
  let offset = 0;
  let zeroBlocks = 0;
  let totalFileBytes = 0;
  while (offset + 512 <= uncompressed.length) {
    const header = uncompressed.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks >= 2) break;
      continue;
    }
    if (zeroBlocks !== 0 || entries.length >= MAX_DEPENDENCY_TREE_ENTRIES) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    let calculatedChecksum = 0;
    for (let index = 0; index < header.length; index += 1) {
      calculatedChecksum += index >= 148 && index < 156 ? 0x20 : header[index]!;
    }
    if (
      tarOctal(header.subarray(148, 156), Number.MAX_SAFE_INTEGER) !== calculatedChecksum
      || tarString(header.subarray(257, 263)) !== 'ustar'
      || tarString(header.subarray(263, 265)) !== '00'
      || tarString(header.subarray(157, 257)) !== ''
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const prefix = tarString(header.subarray(345, 500));
    const name = tarString(header.subarray(0, 100));
    const rawPath = prefix === '' ? name : `${prefix}/${name}`;
    const normalized = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const components = normalized.split('/');
    const type = header[156];
    const kind = type === 0 || type === 0x30
      ? 'file'
      : type === 0x35
        ? 'directory'
        : undefined;
    const size = tarOctal(header.subarray(124, 136), MAX_UNCOMPRESSED_ARCHIVE_BYTES);
    const archiveMode = tarOctal(header.subarray(100, 108), 0o7777);
    if (
      kind === undefined
      || (archiveMode & 0o7000) !== 0
      || normalized.length < 7
      || normalized.length > 4_096
      || /[\u0000-\u001f\u007f\\]/u.test(normalized)
      || isAbsolute(normalized)
      || components[0] !== 'package'
      || components.slice(1).some(component => component === '' || component === '.' || component === '..')
      || paths.has(normalized)
      || (kind === 'directory' && size !== 0)
      || (kind === 'file' && components.length < 2)
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    paths.add(normalized);
    totalFileBytes += size;
    if (totalFileBytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const bodyOffset = offset + 512;
    const paddedSize = Math.ceil(size / 512) * 512;
    if (
      bodyOffset + paddedSize > uncompressed.length
      || uncompressed.subarray(bodyOffset + size, bodyOffset + paddedSize)
        .some(value => value !== 0)
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const path = components.slice(1).join('/');
    if (path !== '') {
      entries.push(Object.freeze({
        path,
        kind,
        mode: kind === 'directory' ? 0o700 : (archiveMode & 0o111) === 0 ? 0o600 : 0o700,
        offset: bodyOffset,
        size,
      }));
    }
    offset = bodyOffset + paddedSize;
  }
  if (
    zeroBlocks < 2
    || entries.length < 1
    || uncompressed.subarray(offset).some(value => value !== 0)
  ) {
    uncompressed.fill(0);
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  return Object.freeze({
    uncompressed,
    entries: Object.freeze(entries),
    fileBytes: totalFileBytes,
  });
}
