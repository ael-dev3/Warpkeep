import { createServer } from 'node:net';
import {
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compareSpacetimeBindingTrees,
  readSpacetimeBindingTree
} from '../scripts/spacetime-binding-tree.mjs';

const scratchDirectories: string[] = [];

async function makeScratchDirectory() {
  const root = await mkdtemp(join(tmpdir(), 'warpkeep-binding-tree-test-'));
  scratchDirectories.push(root);
  return root;
}

async function makeTree(files: Readonly<Record<string, string | Buffer>>) {
  const root = await makeScratchDirectory();
  for (const [relativePath, bytes] of Object.entries(files)) {
    const absolutePath = join(root, ...relativePath.split('/'));
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
  vi.restoreAllMocks();
});

describe('Spacetime binding tree helper', () => {
  it('imports without invoking a generator and exposes the strict tree operations', () => {
    expect(readSpacetimeBindingTree).toEqual(expect.any(Function));
    expect(compareSpacetimeBindingTrees).toEqual(expect.any(Function));
  });

  it('returns byte-exact entries sorted by normalized relative path', async () => {
    const root = await makeTree({
      'types/reducers.ts': Buffer.from([0, 13, 10, 255]),
      'types/procedures.ts': 'export type Procedures = never;\n',
      'index.ts': 'export {};\n',
      'types.ts': 'export type Types = never;\n'
    });

    const entries = await readSpacetimeBindingTree(root);

    expect(entries.map((entry) => entry.path)).toEqual([
      'index.ts',
      'types.ts',
      'types/procedures.ts',
      'types/reducers.ts'
    ]);
    expect(entries[3]?.bytes).toEqual(Buffer.from([0, 13, 10, 255]));
  });

  it('reports no differences for identical bytes', async () => {
    const expected = await makeTree({ 'index.ts': 'same\n', 'types/reducers.ts': 'same\n' });
    const actual = await makeTree({ 'index.ts': 'same\n', 'types/reducers.ts': 'same\n' });

    await expect(compareSpacetimeBindingTrees(expected, actual)).resolves.toEqual([]);
  });

  it('reports changed bytes without normalizing line endings', async () => {
    const expected = await makeTree({ 'index.ts': 'export {};\n' });
    const actual = await makeTree({ 'index.ts': 'export {};\r\n' });

    await expect(compareSpacetimeBindingTrees(expected, actual)).resolves.toEqual(['index.ts']);
  });

  it('returns sorted unique diagnostics for missing, added and byte-different files', async () => {
    const expected = await makeTree({
      'index.ts': 'same',
      'z_changed.ts': 'before',
      'a_missing.ts': 'missing'
    });
    const actual = await makeTree({
      'index.ts': 'same',
      'z_changed.ts': 'after',
      'm_added.ts': 'added'
    });

    await expect(compareSpacetimeBindingTrees(expected, actual)).resolves.toEqual([
      'a_missing.ts',
      'm_added.ts',
      'z_changed.ts'
    ]);
  });

  it('rejects non-absolute roots before filesystem traversal', async () => {
    await expect(readSpacetimeBindingTree('relative/bindings')).rejects.toThrow(/absolute/i);
  });

  it('rejects roots that are not directories', async () => {
    const scratch = await makeScratchDirectory();
    const file = join(scratch, 'bindings.ts');
    await writeFile(file, 'export {};');

    await expect(readSpacetimeBindingTree(file)).rejects.toThrow(/directory/i);
  });

  it('rejects empty trees and trees without a root index.ts', async () => {
    const empty = await makeScratchDirectory();
    const missingIndex = await makeTree({ 'types.ts': 'export type Types = never;' });

    await expect(readSpacetimeBindingTree(empty)).rejects.toThrow(/empty/i);
    await expect(readSpacetimeBindingTree(missingIndex)).rejects.toThrow(/root index\.ts/i);
  });

  it.each([
    ['source maps', 'generated.ts.map'],
    ['JSON metadata', 'metadata.json'],
    ['non-TypeScript files', 'README.md']
  ])('rejects %s instead of ignoring them', async (_label, invalidPath) => {
    const root = await makeTree({ 'index.ts': 'export {};', [invalidPath]: 'invalid' });

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/\.ts binding files/i);
  });

  it('rejects dot-prefixed metadata and non-canonical directory segments', async () => {
    const hiddenFile = await makeTree({ 'index.ts': 'export {};', '.metadata.ts': 'invalid' });
    const hiddenDirectory = await makeTree({
      'index.ts': 'export {};',
      '.metadata/types.ts': 'invalid'
    });

    await expect(readSpacetimeBindingTree(hiddenFile)).rejects.toThrow(/canonical/i);
    await expect(readSpacetimeBindingTree(hiddenDirectory)).rejects.toThrow(/canonical/i);
  });

  const nativePosixIt = process.platform === 'win32' ? it.skip : it;

  nativePosixIt('rejects backslash, colon, controls and trailing dot/space path segments on POSIX', async () => {
    for (const invalidPath of ['back\\slash.ts', 'colon:name.ts', 'control\u0001.ts', 'trailing./file.ts', 'space /file.ts']) {
      const root = await makeTree({ 'index.ts': 'export {};', [invalidPath]: 'invalid' });
      await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/canonical/i);
    }
  });

  nativePosixIt('rejects case-insensitive path collisions on a case-sensitive filesystem', async () => {
    const root = await makeTree({
      'index.ts': 'export {};',
      'types.ts': 'lower',
      'Types.ts': 'upper'
    });

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/case-insensitive collision/i);
  });

  nativePosixIt('rejects symlinked roots, descendant files and descendant directories without following them', async () => {
    const scratch = await makeScratchDirectory();
    const targetRoot = join(scratch, 'target');
    await mkdir(targetRoot);
    await writeFile(join(targetRoot, 'index.ts'), 'export {};');
    const linkedRoot = join(scratch, 'linked-root');
    await symlink(targetRoot, linkedRoot, 'dir');
    await expect(readSpacetimeBindingTree(linkedRoot)).rejects.toThrow(/symbolic link/i);

    const fileTree = await makeTree({ 'index.ts': 'export {};' });
    await symlink(join(fileTree, 'index.ts'), join(fileTree, 'linked.ts'), 'file');
    await expect(readSpacetimeBindingTree(fileTree)).rejects.toThrow(/symbolic link/i);

    const directoryTree = await makeTree({ 'index.ts': 'export {};' });
    await mkdir(join(directoryTree, 'real-types'));
    await writeFile(join(directoryTree, 'real-types', 'reducers.ts'), 'export {};');
    await symlink(join(directoryTree, 'real-types'), join(directoryTree, 'types'), 'dir');
    await expect(readSpacetimeBindingTree(directoryTree)).rejects.toThrow(/symbolic link/i);
  });

  it('rejects hard-linked regular files', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    await link(join(root, 'index.ts'), join(root, 'linked.ts'));

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/hard-linked/i);
  });

  nativePosixIt('rejects native Unix socket special files (Windows has no filesystem socket fixture)', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    const socketPath = join(root, 'special.ts');
    const server = createServer();
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(socketPath, accept);
    });

    try {
      await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/special filesystem entry/i);
    } finally {
      await new Promise<void>((accept, reject) => {
        server.close((error) => error ? reject(error) : accept());
      });
    }
  });

  it('rejects recursion beyond the fixed depth of 16', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    const deepPath = Array.from({ length: 17 }, (_, index) => `level-${index}`).join('/');
    const deepFile = join(root, ...deepPath.split('/'), 'types.ts');
    await mkdir(dirname(deepFile), { recursive: true });
    await writeFile(deepFile, 'export {};');

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/recursion depth.*16/i);
  });

  it('rejects a regular file larger than the fixed 4 MiB limit', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    const oversized = await open(join(root, 'oversized.ts'), 'w');
    try {
      await oversized.truncate((4 * 1024 * 1024) + 1);
    } finally {
      await oversized.close();
    }

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/file size.*4 MiB/i);
  });

  it('bounds descriptor reads when a file grows after its pre-read stat', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    const sampleHandle = await open(join(root, 'index.ts'), 'r');
    const handlePrototype = Object.getPrototypeOf(sampleHandle) as typeof sampleHandle;
    await sampleHandle.close();
    const originalRead = handlePrototype.read;
    let grew = false;
    vi.spyOn(handlePrototype, 'readFile').mockImplementation(async () => {
      throw new Error('unbounded descriptor read attempted');
    });
    vi.spyOn(handlePrototype, 'read').mockImplementation(async function (
      this: typeof sampleHandle,
      ...readArguments: Parameters<typeof sampleHandle.read>
    ) {
      if (!grew) {
        grew = true;
        await import('node:fs/promises').then((filesystem) => (
          filesystem.appendFile(join(root, 'index.ts'), 'x')
        ));
      }
      return originalRead.apply(this, readArguments);
    });

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/changed while reading/i);
  });

  it('rejects total bytes beyond the fixed 32 MiB limit', async () => {
    const root = await makeTree({ 'index.ts': 'x' });
    for (let index = 0; index < 8; index += 1) {
      const file = await open(join(root, `chunk-${index}.ts`), 'w');
      try {
        await file.truncate(4 * 1024 * 1024);
      } finally {
        await file.close();
      }
    }

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/total size.*32 MiB/i);
  });

  it('rejects more than the fixed 4096 regular files', async () => {
    const root = await makeTree({ 'index.ts': 'export {};' });
    const paths = Array.from({ length: 4096 }, (_, index) => join(root, `binding-${index}.ts`));
    for (let offset = 0; offset < paths.length; offset += 256) {
      await Promise.all(paths.slice(offset, offset + 256).map((path) => writeFile(path, '')));
    }

    await expect(readSpacetimeBindingTree(root)).rejects.toThrow(/file count.*4096/i);
  }, 30_000);
});

describe('Spacetime binding verifier integration', () => {
  it('uses the strict comparator instead of the permissive local walker', async () => {
    const verifier = await readFile(resolve('scripts/verify-spacetime-bindings.mjs'), 'utf8');

    expect(verifier).toContain("import { compareSpacetimeBindingTrees } from './spacetime-binding-tree.mjs';");
    expect(verifier).toContain('compareSpacetimeBindingTrees(committedDirectory, stagingDirectory)');
    expect(verifier).not.toContain('function filesUnder(');
  });
});
