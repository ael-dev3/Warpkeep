import { constants } from 'node:fs';
import {
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import {
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep
} from 'node:path';

export const ATOMIC_FAMILY_TRANSACTION_PREFIX = '.warpkeep-family-install-';

function pathExists(path) {
  return lstatSync(path, { throwIfNoEntry: false });
}

function readPinnedRegularFile(path, label, expectedBytes) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`${label} must be a regular non-symbolic file.`);
    if (expectedBytes !== undefined) {
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
        throw new Error(`${label} has an invalid expected byte length.`);
      }
      if (before.size !== expectedBytes) {
        throw new Error(`${label} does not match its expected byte length.`);
      }
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const pathStat = pathExists(path);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || bytes.byteLength !== after.size
      || !pathStat?.isFile()
      || pathStat.isSymbolicLink()
      || pathStat.dev !== after.dev
      || pathStat.ino !== after.ino
      || pathStat.size !== after.size
    ) throw new Error(`${label} changed while it was being read.`);
    return {
      bytes,
      identity: { dev: after.dev, ino: after.ino, size: after.size }
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPathChain(path, label, { leaf = 'any', allowMissingLeaf = false } = {}) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;

  components.forEach((component, index) => {
    current = join(current, component);
    const stat = pathExists(current);
    const isLeaf = index === components.length - 1;
    if (!stat) {
      if (isLeaf && allowMissingLeaf) return;
      throw new Error(`${label} has a missing path ancestor: ${current}`);
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} must not contain a symbolic-link path component: ${current}`);
    }
    if (!isLeaf && !stat.isDirectory()) {
      throw new Error(`${label} has a non-directory path ancestor: ${current}`);
    }
    if (isLeaf && leaf === 'directory' && !stat.isDirectory()) {
      throw new Error(`${label} must be a regular non-symbolic directory.`);
    }
    if (isLeaf && leaf === 'file' && !stat.isFile()) {
      throw new Error(`${label} must be a regular non-symbolic file.`);
    }
  });
}

export function resolveContainedPath(root, relativePath, label = 'contained path') {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('\0')
    || isAbsolute(relativePath)
  ) throw new Error(`${label} must use a non-empty relative path.`);

  const components = relativePath.split(/[\\/]/u);
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    throw new Error(`${label} must not contain empty, current-directory, or parent-directory segments.`);
  }

  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, normalize(relativePath));
  const relation = relative(absoluteRoot, target);
  if (relation === '' || relation.startsWith(`..${sep}`) || relation === '..' || isAbsolute(relation)) {
    throw new Error(`${label} escapes its declared root.`);
  }
  return target;
}

/**
 * Creates a relative directory one component at a time without following a
 * symbolic-link root, ancestor, or leaf. Callers still need exclusive control
 * of the tree because portable Node.js does not expose openat-style directory
 * handles for race-free path mutation.
 */
export function ensureContainedDirectory({ root, relativePath, label }) {
  assertPathChain(root, `${label} root`, { leaf: 'directory' });
  const absoluteRoot = resolve(root);
  const destination = resolveContainedPath(absoluteRoot, relativePath, label);
  const components = relative(absoluteRoot, destination).split(sep).filter(Boolean);
  let current = absoluteRoot;

  for (const component of components) {
    current = join(current, component);
    let stat = pathExists(current);
    if (!stat) {
      try {
        mkdirSync(current, { mode: 0o755 });
      } catch (error) {
        stat = pathExists(current);
        if (!stat) throw error;
      }
      stat = pathExists(current);
    }
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`${label} must not contain a non-directory or symbolic-link component: ${current}`);
    }
  }

  return destination;
}

/**
 * Reads a package file without following a symbolic-link leaf. Callers still
 * pin the accepted bytes and semantic structure; this helper pins the path.
 */
export function readContainedRegularFile({ root, relativePath, label, expectedBytes }) {
  assertPathChain(root, `${label} root`, { leaf: 'directory' });
  const path = resolveContainedPath(root, relativePath, label);
  assertPathChain(path, label, { leaf: 'file' });

  return readPinnedRegularFile(path, label, expectedBytes).bytes;
}

export function assertNoStaleAtomicFamilyTransactions(
  destinationRoot,
  label = 'Atomic family destination root'
) {
  assertPathChain(destinationRoot, label, { leaf: 'directory' });
  const stale = readdirSync(destinationRoot)
    .filter((name) => name.startsWith(ATOMIC_FAMILY_TRANSACTION_PREFIX))
    .sort();
  if (stale.length > 0) {
    throw new Error(
      `${label} contains unresolved atomic-family transaction state: ${stale.join(', ')}.`
    );
  }
}

function assertExactInstalledFile(path, expected, label) {
  assertPathChain(path, label, { leaf: 'file' });
  const bytes = readFileSync(path);
  if (!bytes.equals(expected)) throw new Error(`${label} does not match the staged exact bytes.`);
}

function invokeFailureHook(injectFailure, phase, context = {}) {
  injectFailure?.({ phase, ...context });
}

function assertInstalledEntryUnchanged(entry) {
  if (!entry.installedIdentity) {
    throw new Error(`${entry.label} installed identity is unavailable for rollback.`);
  }
  const installed = readPinnedRegularFile(
    entry.destination,
    `${entry.label} installed rollback candidate`
  );
  if (
    installed.identity.dev !== entry.installedIdentity.dev
    || installed.identity.ino !== entry.installedIdentity.ino
    || installed.identity.size !== entry.installedIdentity.size
    || !installed.bytes.equals(entry.bytes)
  ) {
    throw new Error(`${entry.label} installed path changed before rollback.`);
  }
}

function assertBackupEntryUnchanged(entry) {
  if (!entry.backupIdentity || !entry.existingBytes) {
    throw new Error(`${entry.label} backup identity is unavailable for rollback.`);
  }
  const backup = readPinnedRegularFile(
    entry.backup,
    `${entry.label} rollback backup`
  );
  if (
    backup.identity.dev !== entry.backupIdentity.dev
    || backup.identity.ino !== entry.backupIdentity.ino
    || backup.identity.size !== entry.backupIdentity.size
    || !backup.bytes.equals(entry.existingBytes)
  ) {
    throw new Error(`${entry.label} backup changed before rollback.`);
  }
}

function assertOriginalDestinationUnchanged(entry) {
  if (!entry.existingIdentity || !entry.existingBytes) {
    throw new Error(`${entry.label} original destination identity is unavailable for rollback.`);
  }
  const destination = readPinnedRegularFile(
    entry.destination,
    `${entry.label} original rollback destination`
  );
  if (
    destination.identity.dev !== entry.existingIdentity.dev
    || destination.identity.ino !== entry.existingIdentity.ino
    || destination.identity.size !== entry.existingIdentity.size
    || !destination.bytes.equals(entry.existingBytes)
  ) {
    throw new Error(`${entry.label} original destination changed after backup.`);
  }
}

function rollback(entries) {
  const failures = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.backedUp && entry.installed) {
        assertBackupEntryUnchanged(entry);
        assertInstalledEntryUnchanged(entry);
        renameSync(entry.backup, entry.destination);
        entry.backedUp = false;
        entry.installed = false;
      } else if (entry.installed) {
        assertInstalledEntryUnchanged(entry);
        rmSync(entry.destination);
        entry.installed = false;
      } else if (entry.backedUp) {
        // Replacement did not start, so the original destination still owns
        // its directory entry. Revalidate that assumption before discarding
        // the only transaction-local evidence of the pinned original.
        assertBackupEntryUnchanged(entry);
        assertOriginalDestinationUnchanged(entry);
        rmSync(entry.backup);
        entry.backedUp = false;
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Atomic family rollback failed; transaction evidence was preserved.');
  }
}

/**
 * Replaces a complete related file family without ever writing through an
 * existing destination inode. All stages and backups live under the
 * destination directory so every rename remains on the destination filesystem.
 *
 * `injectFailure` is deliberately test-only and lets tests prove rollback at
 * each transaction boundary without touching repository assets.
 */
export function installAtomicFileFamily({
  destinationRoot,
  entries,
  injectFailure
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Atomic file-family installation requires at least one prepared output.');
  }

  assertNoStaleAtomicFamilyTransactions(destinationRoot);
  const seen = new Set();
  const prepared = entries.map((entry, index) => {
    if (!Buffer.isBuffer(entry.bytes)) {
      throw new Error(`Atomic family entry ${index} must provide prepared Buffer bytes.`);
    }
    const label = entry.label ?? `Atomic family entry ${index}`;
    const destination = resolveContainedPath(destinationRoot, entry.relativePath, label);
    if (seen.has(destination)) throw new Error(`${label} duplicates another family destination.`);
    seen.add(destination);

    assertPathChain(destination, label, { allowMissingLeaf: true });
    const existing = pathExists(destination);
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
      throw new Error(`${label} destination must be a regular non-symbolic file when present.`);
    }
    const pinnedExisting = existing
      ? readPinnedRegularFile(destination, `${label} existing destination`)
      : undefined;
    return {
      bytes: entry.bytes,
      destination,
      existingBytes: pinnedExisting?.bytes,
      existingIdentity: pinnedExisting?.identity,
      existed: Boolean(existing),
      index,
      label,
      relativePath: entry.relativePath,
      installed: false,
      backedUp: false
    };
  });

  // The hook runs only after the complete family and every destination have
  // passed preflight. No staging directory or destination has changed yet.
  invokeFailureHook(injectFailure, 'afterPreflight', { entries: prepared });

  const transactionRoot = mkdtempSync(
    join(resolve(destinationRoot), ATOMIC_FAMILY_TRANSACTION_PREFIX)
  );
  let preserveTransaction = false;
  try {
    prepared.forEach((entry) => {
      entry.stage = join(transactionRoot, `stage-${entry.index}`);
      entry.backup = join(transactionRoot, `backup-${entry.index}`);
      const descriptor = openSync(
        entry.stage,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600
      );
      try {
        writeFileSync(descriptor, entry.bytes);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      chmodSync(entry.stage, 0o644);
      assertExactInstalledFile(entry.stage, entry.bytes, `${entry.label} staged output`);
    });
    invokeFailureHook(injectFailure, 'afterStage', {
      entries: prepared,
      transactionRoot
    });

    try {
      prepared.forEach((entry) => {
        // Revalidate the destination path immediately before each mutation.
        assertPathChain(entry.destination, entry.label, { allowMissingLeaf: true });
        const current = pathExists(entry.destination);
        if (
          Boolean(current) !== entry.existed
          || (current && (
            current.dev !== entry.existingIdentity.dev
            || current.ino !== entry.existingIdentity.ino
            || current.size !== entry.existingIdentity.size
          ))
        ) {
          throw new Error(`${entry.label} destination changed after preflight.`);
        }
        if (current && (!current.isFile() || current.isSymbolicLink())) {
          throw new Error(`${entry.label} destination changed after preflight.`);
        }

        if (entry.existed) {
          const pinnedCurrent = readPinnedRegularFile(
            entry.destination,
            `${entry.label} destination recheck`
          );
          if (
            pinnedCurrent.identity.dev !== entry.existingIdentity.dev
            || pinnedCurrent.identity.ino !== entry.existingIdentity.ino
            || pinnedCurrent.identity.size !== entry.existingIdentity.size
            || !pinnedCurrent.bytes.equals(entry.existingBytes)
          ) throw new Error(`${entry.label} destination bytes changed after preflight.`);

          // Preserve the original inode through a transaction-local hard link,
          // then rename the stage directly over the destination. The public
          // path is therefore replaced atomically and is never truncated.
          linkSync(entry.destination, entry.backup);
          entry.backedUp = true;
          const pinnedBackup = readPinnedRegularFile(
            entry.backup,
            `${entry.label} transaction backup`
          );
          if (
            pinnedBackup.identity.dev !== entry.existingIdentity.dev
            || pinnedBackup.identity.ino !== entry.existingIdentity.ino
            || pinnedBackup.identity.size !== entry.existingIdentity.size
            || !pinnedBackup.bytes.equals(entry.existingBytes)
          ) throw new Error(`${entry.label} transaction backup does not match the pinned destination.`);
          entry.backupIdentity = pinnedBackup.identity;
        }
        invokeFailureHook(injectFailure, 'afterBackup', {
          destination: entry.destination,
          entry,
          index: entry.index,
          transactionRoot
        });

        renameSync(entry.stage, entry.destination);
        entry.installed = true;
        const installed = readPinnedRegularFile(
          entry.destination,
          `${entry.label} installed output`
        );
        if (!installed.bytes.equals(entry.bytes)) {
          throw new Error(`${entry.label} installed output does not match the staged exact bytes.`);
        }
        entry.installedIdentity = installed.identity;
        invokeFailureHook(injectFailure, 'afterReplace', {
          destination: entry.destination,
          entry,
          index: entry.index,
          transactionRoot
        });
      });

      invokeFailureHook(injectFailure, 'beforePostVerify', {
        entries: prepared,
        transactionRoot
      });
      prepared.forEach((entry) => {
        assertExactInstalledFile(
          entry.destination,
          entry.bytes,
          `${entry.label} installed output`
        );
      });
      invokeFailureHook(injectFailure, 'afterPostVerify', {
        entries: prepared,
        transactionRoot
      });
    } catch (error) {
      try {
        rollback(prepared);
      } catch (rollbackError) {
        preserveTransaction = true;
        throw new AggregateError(
          [error, rollbackError],
          'Atomic file-family installation and rollback both failed.'
        );
      }
      throw error;
    }
  } finally {
    if (!preserveTransaction) rmSync(transactionRoot, { recursive: true, force: true });
  }
}
