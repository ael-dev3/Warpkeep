import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_RECURSION_DEPTH = 16;
const MAX_FILE_COUNT = 4096;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const OPEN_READ_NOFOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalSegment(segment, relativePath) {
  if (
    segment.length === 0
    || segment === '.'
    || segment === '..'
    || segment.startsWith('.')
    || /[\\:\u0000-\u001f\u007f]/u.test(segment)
    || /[. ]$/u.test(segment)
  ) {
    throw new Error(`Binding tree contains a non-canonical path segment: ${relativePath}`);
  }
}

function isWithinRoot(root, candidate) {
  const difference = relative(root, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function assertWithinRoot(rootRealPath, candidateRealPath, relativePath) {
  if (!isWithinRoot(rootRealPath, candidateRealPath)) {
    throw new Error(`Binding tree entry escapes its input root: ${relativePath}`);
  }
}

function assertSameSnapshot(before, after, relativePath, stage) {
  const fields = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
  if (fields.some((field) => before[field] !== after[field])) {
    throw new Error(`Binding tree entry changed while reading (${stage}): ${relativePath}`);
  }
}

function assertRegularFile(details, relativePath) {
  if (details.isSymbolicLink()) {
    throw new Error(`Binding tree contains a symbolic link: ${relativePath}`);
  }
  if (!details.isFile()) {
    throw new Error(`Binding tree contains a special filesystem entry: ${relativePath}`);
  }
  if (details.nlink !== 1n) {
    throw new Error(`Binding tree contains a hard-linked file: ${relativePath}`);
  }
  if (details.size > BigInt(MAX_FILE_BYTES)) {
    throw new Error(`Binding tree file size exceeds the fixed 4 MiB limit: ${relativePath}`);
  }
}

async function readBoundedFile(handle, expectedSize, relativePath) {
  const expectedBytes = Number(expectedSize);
  const capacity = Math.min(expectedBytes + 1, MAX_FILE_BYTES + 1);
  const buffer = Buffer.allocUnsafe(capacity);
  let offset = 0;

  while (offset < capacity) {
    const { bytesRead } = await handle.read(buffer, offset, capacity - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }

  if (offset > expectedBytes) {
    throw new Error(`Binding tree entry changed while reading (grew beyond checked size): ${relativePath}`);
  }
  return buffer.subarray(0, offset);
}

async function readStableFile(absolutePath, relativePath, rootRealPath) {
  const beforePathStat = await lstat(absolutePath, { bigint: true });
  assertRegularFile(beforePathStat, relativePath);

  const beforeRealPath = await realpath(absolutePath);
  assertWithinRoot(rootRealPath, beforeRealPath, relativePath);

  let handle;
  try {
    handle = await open(absolutePath, OPEN_READ_NOFOLLOW);
  } catch (error) {
    throw new Error(`Could not safely open binding file without following links: ${relativePath}`, {
      cause: error
    });
  }

  let bytes;
  try {
    const beforeDescriptorStat = await handle.stat({ bigint: true });
    assertRegularFile(beforeDescriptorStat, relativePath);
    assertSameSnapshot(beforePathStat, beforeDescriptorStat, relativePath, 'before read');

    bytes = await readBoundedFile(handle, beforeDescriptorStat.size, relativePath);

    const afterDescriptorStat = await handle.stat({ bigint: true });
    assertRegularFile(afterDescriptorStat, relativePath);
    assertSameSnapshot(beforeDescriptorStat, afterDescriptorStat, relativePath, 'descriptor');
    if (BigInt(bytes.length) !== afterDescriptorStat.size) {
      throw new Error(`Binding tree entry changed while reading (byte count): ${relativePath}`);
    }
  } finally {
    await handle.close();
  }

  const afterPathStat = await lstat(absolutePath, { bigint: true });
  assertRegularFile(afterPathStat, relativePath);
  assertSameSnapshot(beforePathStat, afterPathStat, relativePath, 'path');

  const afterRealPath = await realpath(absolutePath);
  assertWithinRoot(rootRealPath, afterRealPath, relativePath);
  if (beforeRealPath !== afterRealPath) {
    throw new Error(`Binding tree entry changed real path while reading: ${relativePath}`);
  }

  return bytes;
}

export async function readSpacetimeBindingTree(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    throw new Error('Spacetime binding tree root must be an absolute path.');
  }

  const absoluteRoot = resolve(root);
  const beforeRootStat = await lstat(absoluteRoot, { bigint: true });
  if (beforeRootStat.isSymbolicLink()) {
    throw new Error('Spacetime binding tree root must not be a symbolic link.');
  }
  if (!beforeRootStat.isDirectory()) {
    throw new Error('Spacetime binding tree root must be a directory.');
  }

  const rootRealPath = await realpath(absoluteRoot);
  const entries = [];
  const caseInsensitivePaths = new Map();
  let fileCount = 0;
  let totalBytes = 0;

  async function walkDirectory(absoluteDirectory, segments) {
    const relativeDirectory = segments.join('/') || '<root>';
    const beforeDirectoryStat = await lstat(absoluteDirectory, { bigint: true });
    if (beforeDirectoryStat.isSymbolicLink()) {
      throw new Error(`Binding tree contains a symbolic link: ${relativeDirectory}`);
    }
    if (!beforeDirectoryStat.isDirectory()) {
      throw new Error(`Binding tree directory changed type while reading: ${relativeDirectory}`);
    }

    const beforeDirectoryRealPath = await realpath(absoluteDirectory);
    assertWithinRoot(rootRealPath, beforeDirectoryRealPath, relativeDirectory);

    const children = await readdir(absoluteDirectory, { withFileTypes: true });
    children.sort((left, right) => comparePaths(left.name, right.name));

    for (const child of children) {
      const childSegments = [...segments, child.name];
      const relativePath = childSegments.join('/');
      assertCanonicalSegment(child.name, relativePath);

      const collisionKey = relativePath.toLowerCase();
      const collision = caseInsensitivePaths.get(collisionKey);
      if (collision !== undefined && collision !== relativePath) {
        throw new Error(`Binding tree contains a case-insensitive collision: ${collision}, ${relativePath}`);
      }
      caseInsensitivePaths.set(collisionKey, relativePath);

      const absolutePath = join(absoluteDirectory, child.name);
      const childStat = await lstat(absolutePath, { bigint: true });
      if (childStat.isSymbolicLink()) {
        throw new Error(`Binding tree contains a symbolic link: ${relativePath}`);
      }

      if (childStat.isDirectory()) {
        if (childSegments.length > MAX_RECURSION_DEPTH) {
          throw new Error(`Binding tree exceeds the fixed recursion depth of ${MAX_RECURSION_DEPTH}: ${relativePath}`);
        }
        await walkDirectory(absolutePath, childSegments);
        continue;
      }

      if (!childStat.isFile()) {
        throw new Error(`Binding tree contains a special filesystem entry: ${relativePath}`);
      }
      if (!child.name.endsWith('.ts')) {
        throw new Error(`Binding tree may contain only .ts binding files: ${relativePath}`);
      }

      fileCount += 1;
      if (fileCount > MAX_FILE_COUNT) {
        throw new Error(`Binding tree file count exceeds the fixed ${MAX_FILE_COUNT} limit.`);
      }

      const bytes = await readStableFile(absolutePath, relativePath, rootRealPath);
      totalBytes += bytes.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error('Binding tree total size exceeds the fixed 32 MiB limit.');
      }
      entries.push({ path: relativePath, bytes });
    }

    const afterDirectoryStat = await lstat(absoluteDirectory, { bigint: true });
    if (!afterDirectoryStat.isDirectory() || afterDirectoryStat.isSymbolicLink()) {
      throw new Error(`Binding tree directory changed type while reading: ${relativeDirectory}`);
    }
    assertSameSnapshot(beforeDirectoryStat, afterDirectoryStat, relativeDirectory, 'directory');

    const afterDirectoryRealPath = await realpath(absoluteDirectory);
    assertWithinRoot(rootRealPath, afterDirectoryRealPath, relativeDirectory);
    if (beforeDirectoryRealPath !== afterDirectoryRealPath) {
      throw new Error(`Binding tree directory changed real path while reading: ${relativeDirectory}`);
    }
  }

  await walkDirectory(absoluteRoot, []);

  const afterRootStat = await lstat(absoluteRoot, { bigint: true });
  if (!afterRootStat.isDirectory() || afterRootStat.isSymbolicLink()) {
    throw new Error('Spacetime binding tree root changed type while reading.');
  }
  assertSameSnapshot(beforeRootStat, afterRootStat, '<root>', 'root');

  if (entries.length === 0) {
    throw new Error('Spacetime binding tree must not be empty.');
  }
  if (!entries.some((entry) => entry.path === 'index.ts')) {
    throw new Error('Spacetime binding tree must contain root index.ts.');
  }

  entries.sort((left, right) => comparePaths(left.path, right.path));
  return entries;
}

export async function compareSpacetimeBindingTrees(expectedRoot, actualRoot) {
  const [expectedEntries, actualEntries] = await Promise.all([
    readSpacetimeBindingTree(expectedRoot),
    readSpacetimeBindingTree(actualRoot)
  ]);
  const expectedByPath = new Map(expectedEntries.map((entry) => [entry.path, entry.bytes]));
  const actualByPath = new Map(actualEntries.map((entry) => [entry.path, entry.bytes]));
  const paths = [...new Set([...expectedByPath.keys(), ...actualByPath.keys()])].sort(comparePaths);

  return paths.filter((path) => {
    const expected = expectedByPath.get(path);
    const actual = actualByPath.get(path);
    return expected === undefined || actual === undefined || !expected.equals(actual);
  });
}
