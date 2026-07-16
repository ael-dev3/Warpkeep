import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { basename, join, parse, relative, resolve, sep } from 'node:path';

function pathMetadata(path) {
  return lstatSync(path, { throwIfNoEntry: false });
}

function isTrustedStickySystemDirectory(metadata) {
  return (
    metadata.uid === 0
    && (metadata.mode & 0o1000) !== 0
    && (metadata.mode & 0o002) !== 0
  );
}

function ensurePrivateDestinationDirectory(directory, label) {
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  let current = root;

  for (const component of components) {
    current = join(current, component);
    let metadata = pathMetadata(current);
    if (!metadata) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        metadata = pathMetadata(current);
        if (!metadata) throw error;
      }
      metadata = pathMetadata(current);
    }
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must not contain a non-directory or symbolic-link component.`);
    }
    const untrustedOwner = (
      expectedUid !== undefined
      && metadata.uid !== expectedUid
      && metadata.uid !== 0
    );
    const writableByAnotherUid = (metadata.mode & 0o022) !== 0;
    // Linux /tmp and /var/tmp are root-owned mode-01777 directories. The
    // sticky bit prevents another uid from replacing/removing this process's
    // private child; any pre-created child is still rejected below unless it
    // is owned by this uid (or root) and not writable by other users.
    const trustedStickySystemAncestor = isTrustedStickySystemDirectory(metadata);
    if (untrustedOwner || (writableByAnotherUid && !trustedStickySystemAncestor)) {
      if (current === absolute) {
        throw new Error(`${label} must be an owner-private directory.`);
      }
      throw new Error(`${label} must not contain an untrusted mutable path ancestor.`);
    }
  }

  const destination = pathMetadata(absolute);
  if (
    !destination?.isDirectory()
    || destination.isSymbolicLink()
    || (expectedUid !== undefined && destination.uid !== expectedUid)
    || (destination.mode & 0o077) !== 0
  ) throw new Error(`${label} must be an owner-private directory.`);
  return absolute;
}

/**
 * Atomically publishes exact public cache bytes without following a cache-path
 * symlink or truncating a predictable temporary file. Cache directories remain
 * owner-private even when the destination is supplied through an environment
 * override.
 */
export function writePinnedCacheFile({ destination, bytes, mode, label = 'Pinned cache file' }) {
  if (!Buffer.isBuffer(bytes) || (mode !== 0o600 && mode !== 0o700)) {
    throw new Error(`${label} configuration is invalid.`);
  }
  const absolute = resolve(destination);
  const directory = ensurePrivateDestinationDirectory(parse(absolute).dir, `${label} directory`);
  const directoryIdentity = pathMetadata(directory);
  const existing = pathMetadata(absolute);
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error(`${label} destination must be a regular non-symbolic file.`);
  }

  const temporary = join(
    directory,
    `.${basename(absolute)}.${randomBytes(16).toString('hex')}.tmp`,
  );
  let descriptor;
  let installed = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      mode,
    );
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    fchmodSync(descriptor, mode);
    const staged = fstatSync(descriptor);
    if (
      !staged.isFile()
      || staged.size !== bytes.byteLength
      || (staged.mode & 0o777) !== mode
      || staged.nlink !== 1
    ) throw new Error(`${label} staged write was invalid.`);

    // Revalidate the complete path chain immediately before mutation. Node.js
    // has no portable openat/renameat API, so the remaining race boundary is
    // deliberately limited to root or this same local uid: no other uid owns
    // or can write any accepted ancestor.
    ensurePrivateDestinationDirectory(directory, `${label} directory`);
    const currentDirectory = pathMetadata(directory);
    if (
      !currentDirectory?.isDirectory()
      || currentDirectory.isSymbolicLink()
      || currentDirectory.dev !== directoryIdentity?.dev
      || currentDirectory.ino !== directoryIdentity?.ino
    ) throw new Error(`${label} directory changed before installation.`);

    const current = pathMetadata(absolute);
    if (
      Boolean(current) !== Boolean(existing)
      || (current && (
        !current.isFile()
        || current.isSymbolicLink()
        || current.dev !== existing.dev
        || current.ino !== existing.ino
      ))
    ) throw new Error(`${label} destination changed before installation.`);

    renameSync(temporary, absolute);
    installed = true;
    const published = pathMetadata(absolute);
    if (
      !published?.isFile()
      || published.isSymbolicLink()
      || published.dev !== staged.dev
      || published.ino !== staged.ino
      || published.size !== bytes.byteLength
      || (published.mode & 0o777) !== mode
      || published.nlink !== 1
    ) throw new Error(`${label} published write was invalid.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!installed) rmSync(temporary, { force: true });
  }
}
