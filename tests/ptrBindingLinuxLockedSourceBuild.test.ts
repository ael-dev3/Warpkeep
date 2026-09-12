// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DARWIN_PACKAGE_KEYS,
  LINUX_EDGES,
  LINUX_PACKAGE_KEYS,
  TOP_LEVEL_PACKAGES,
  createPtrFixture,
  independentlyExpectedClosureDigest,
  type PtrFixture,
} from './fixtures/ptrLockedSourceBuildFixture';

const boundary = vi.hoisted(() => ({
  cleanupFailure: false,
  retainedRoots: [] as string[],
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const normalize = <T extends { mode: number | bigint; isDirectory(): boolean; isFile(): boolean }>(
    status: T,
  ): T => {
    const permissions = status.isDirectory() ? 0o700 : status.isFile() ? 0o600 : 0o777;
    Object.defineProperty(status, 'mode', {
      value: typeof status.mode === 'bigint'
        ? (status.mode & ~0o7777n) | BigInt(permissions)
        : (status.mode & ~0o7777) | permissions,
    });
    return status;
  };
  return {
    ...actual,
    lstatSync(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      const status = actual.lstatSync(path, options as never);
      return process.platform === 'win32' ? normalize(status) : status;
    },
    fstatSync(descriptor: number, options?: { bigint?: boolean }) {
      const status = actual.fstatSync(descriptor, options as never);
      return process.platform === 'win32' ? normalize(status) : status;
    },
  };
});

vi.mock('../scripts/greater-realm-production-provenance', async () => {
  const crypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  const walk = (root: string): Map<string, string> => {
    const result = new Map<string, string>();
    const visit = (candidate: string) => {
      const status = fs.lstatSync(candidate);
      const logical = path.relative(root, candidate).split(path.sep).join('/');
      const identity = status.isFile()
        ? crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex')
        : status.isDirectory() ? 'directory' : fs.readlinkSync(candidate);
      result.set(logical, `${status.mode & 0o7777}:${status.size}:${identity}`);
      if (status.isDirectory()) {
        for (const name of fs.readdirSync(candidate).sort()) visit(path.join(candidate, name));
      }
    };
    visit(root);
    return result;
  };
  return {
    createGreaterRealmProductionCommitMaterialization(input: Readonly<{
      repositoryRoot: string;
      moduleSourceCommit: string;
      destination: string;
    }>) {
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      boundary.retainedRoots.push(input.destination);
      const tracked = walk(input.destination);
      let cleaned = false;
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify(allowed?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>) {
          const current = walk(input.destination);
          for (const [logical, identity] of tracked) {
            if (current.get(logical) !== identity) throw new Error('LINUX_FIXTURE_TRACKED_SOURCE_CHANGED');
          }
          const prefixes = allowed?.prefixes ?? [];
          const files = allowed?.files ?? [];
          for (const logical of current.keys()) {
            if (tracked.has(logical) || logical === '') continue;
            if (files.includes(logical) || files.some(file => file.startsWith(`${logical}/`))
              || prefixes.some(prefix => (
                logical === prefix.slice(0, -1) || logical.startsWith(prefix)
              ))) continue;
            throw new Error(`LINUX_FIXTURE_UNTRACKED_PATH:${logical}`);
          }
        },
        cleanup() {
          if (boundary.cleanupFailure) throw new Error('LINUX_FIXTURE_CLEANUP_FAILED');
          if (!cleaned) fs.rmSync(input.destination, { recursive: true, force: false });
          cleaned = true;
        },
      });
    },
  };
});

vi.mock('../scripts/greater-realm-openat', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    stageGreaterRealmOpenAtHelper(input: Readonly<{ root: string }>) {
      const exact = (logical: string) => path.join(input.root, ...logical.split('/'));
      return Object.freeze({
        root: input.root,
        mkdir(logical: string) {
          fs.mkdirSync(exact(logical), { recursive: true, mode: 0o700 });
          fs.chmodSync(exact(logical), 0o700);
        },
        writeFile(logical: string, body: Buffer, mode: 0o600 | 0o644 | 0o700) {
          fs.mkdirSync(path.dirname(exact(logical)), { recursive: true, mode: 0o700 });
          fs.writeFileSync(exact(logical), body, { flag: 'wx', mode });
          fs.chmodSync(exact(logical), mode);
        },
        symlink(logical: string, target: string, targetRootRelative: string) {
          const destination = exact(logical);
          const resolved = path.resolve(path.dirname(destination), target);
          if (path.relative(input.root, resolved).split(path.sep).join('/') !== targetRootRelative) {
            throw new Error('LINUX_FIXTURE_LINK_ESCAPE');
          }
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          if (fs.lstatSync(resolved).isDirectory()) {
            fs.cpSync(resolved, destination, { recursive: true, errorOnExist: true });
          } else fs.copyFileSync(resolved, destination, fs.constants.COPYFILE_EXCL);
        },
        finish() {},
      });
    },
  };
});

import {
  PtrBindingLockedSourceBuildError as LinuxPtrBuildError,
  withPtrLinuxLockedSourceBuild,
} from '../scripts/ptr-binding-linux-locked-source-build';
import {
  PtrBindingLockedSourceBuildError as DarwinPtrBuildError,
  withPtrLockedSourceBuild,
} from '../scripts/ptr-binding-locked-source-build';

const temporaryDirectories: string[] = [];

beforeEach(() => {
  boundary.cleanupFailure = false;
  boundary.retainedRoots.length = 0;
});

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(input: Readonly<{
  keys?: readonly string[];
  mutateLock?: (lock: Record<string, any>) => void;
  archiveOverride?: Readonly<{
    key: string;
    name?: string;
    version?: string;
    corrupt?: 'path' | 'link';
  }>;
}> = {}): PtrFixture {
  const value = createPtrFixture({ ...input, keys: input.keys ?? LINUX_PACKAGE_KEYS });
  temporaryDirectories.push(...value.cleanupRoots);
  return value;
}

function runFixture(
  value: PtrFixture,
  operation?: (root: string, digest: string) => unknown,
  extras: Readonly<Record<string, unknown>> = {},
) {
  return withPtrLinuxLockedSourceBuild({
    repositoryRoot: value.repositoryRoot,
    moduleSourceCommit: value.sourceCommit,
    dependencyCacheRoot: value.dependencyCacheRoot,
    materializationParent: value.materializationParent,
    operation: ({ materializedRoot, dependencyClosureDigest }: Readonly<{
      materializedRoot: string;
      dependencyClosureDigest: string;
    }>) => {
      const result = operation?.(materializedRoot, dependencyClosureDigest) ?? 'linux-built';
      const dist = join(materializedRoot, 'spacetimedb', 'ptr', 'dist');
      if (!existsSync(dist)) mkdirSync(dist, { mode: 0o700 });
      const bundle = join(dist, 'bundle.js');
      if (!existsSync(bundle)) writeFileSync(bundle, 'bundle', { mode: 0o600 });
      return result;
    },
    ...extras,
  } as never);
}

function thrownMessages(operation: () => unknown): readonly string[] {
  let thrown: unknown;
  try { operation(); } catch (error) { thrown = error; }
  if (thrown === undefined) throw new Error('TEST_EXPECTED_FAILURE');
  const messages: string[] = [];
  const visit = (error: unknown) => {
    if (error instanceof Error) messages.push(error.message);
    if (error instanceof Error && error.cause !== undefined) visit(error.cause);
    if (error instanceof AggregateError) for (const cause of error.errors) visit(cause);
  };
  visit(thrown);
  return messages;
}

describe('fixed Linux PTR locked-source build', () => {
  it('shares the preserved public error identity with the Darwin wrapper', () => {
    expect(LinuxPtrBuildError).toBe(DarwinPtrBuildError);
    expect(new LinuxPtrBuildError('PTR_TEST_ERROR')).toMatchObject({
      name: 'PtrBindingLockedSourceBuildError',
      code: 'PTR_TEST_ERROR',
      message: 'PTR_TEST_ERROR',
    });
  });

  it('installs the exact Linux x64 closure and independently attests its domain', () => {
    const value = fixture();
    let builtRoot = '';
    let independent = '';
    const output = runFixture(value, (root, digest) => {
      builtRoot = root;
      const nodeModules = join(root, 'spacetimedb', 'ptr', 'node_modules');
      expect(readdirSync(nodeModules).sort()).toEqual([
        '.bin', '.pnpm', ...Object.keys(TOP_LEVEL_PACKAGES),
      ].sort());
      expect(readdirSync(join(nodeModules, '.pnpm')).sort()).toEqual([
        ...LINUX_PACKAGE_KEYS.map(key => key.replace('/', '+')), 'lock.yaml',
      ].sort());
      expect(existsSync(join(nodeModules, '.pnpm', 'fsevents@2.3.3'))).toBe(false);
      expect(existsSync(join(nodeModules, '.pnpm', '@esbuild+darwin-arm64@0.25.12'))).toBe(false);
      expect(existsSync(join(root, 'spacetimedb', 'node_modules'))).toBe(false);
      expect(existsSync(join(root, 'spacetimedb', 'genesis002', 'node_modules'))).toBe(false);
      independent = independentlyExpectedClosureDigest({
        root,
        domain: 'warpkeep-ptr-independent-linux-x64-dependency-closure-v1',
        keys: LINUX_PACKAGE_KEYS,
        edges: LINUX_EDGES,
      });
      expect(digest).toBe(independent);
      return 'linux-built';
    });
    expect(output).toEqual({
      result: 'linux-built',
      dependencyClosureDigest: independent,
      moduleTreeId: 'b'.repeat(40),
    });
    expect(existsSync(builtRoot)).toBe(false);
  });

  it('returns deterministic Linux provenance across fresh roots', () => {
    expect(runFixture(fixture()).dependencyClosureDigest)
      .toBe(runFixture(fixture()).dependencyClosureDigest);
  });

  it.each([
    ['missing linux cpu', (lock: Record<string, any>) => {
      delete lock.packages['@esbuild/linux-x64@0.25.12'].cpu;
    }],
    ['missing linux os', (lock: Record<string, any>) => {
      delete lock.packages['@esbuild/linux-x64@0.25.12'].os;
    }],
    ['widened linux cpu', (lock: Record<string, any>) => {
      lock.packages['@esbuild/linux-x64@0.25.12'].cpu = ['x64', 'arm64'];
    }],
    ['missing linux optional marker', (lock: Record<string, any>) => {
      delete lock.snapshots['@esbuild/linux-x64@0.25.12'].optional;
    }],
    ['misplaced generic cpu', (lock: Record<string, any>) => {
      lock.packages['typescript@5.6.3'].cpu = ['x64'];
    }],
    ['misplaced generic optional marker', (lock: Record<string, any>) => {
      lock.snapshots['typescript@5.6.3'].optional = true;
    }],
  ])('rejects exact Linux metadata mutation: %s', (_label, mutateLock) => {
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(
      fixture({ mutateLock }),
      () => { operationCalled = true; },
    ));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operationCalled).toBe(false);
  });

  it.each([
    ['foreign platform substitution', (lock: Record<string, any>) => {
      delete lock.snapshots['esbuild@0.25.12'].optionalDependencies['@esbuild/linux-x64'];
    }],
    ['malformed foreign optional metadata', (lock: Record<string, any>) => {
      lock.packages['@esbuild/darwin-arm64@0.25.12'].os = ['darwin', 'linux'];
    }],
    ['missing Linux package while Darwin remains', (lock: Record<string, any>) => {
      delete lock.packages['@esbuild/linux-x64@0.25.12'];
    }],
  ])('rejects %s before cache installation', (_label, mutateLock) => {
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(
      fixture({ mutateLock }),
      () => { operationCalled = true; },
    ));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operationCalled).toBe(false);
  });

  it.each(['missing-lock', 'invalid-lock', 'missing-manifest'] as const)(
    'never uses root authority for %s',
    mutation => {
      const value = fixture();
      const ptrRoot = join(value.repositoryRoot, 'spacetimedb', 'ptr');
      if (mutation === 'missing-lock') rmSync(join(ptrRoot, 'pnpm-lock.yaml'));
      if (mutation === 'invalid-lock') writeFileSync(join(ptrRoot, 'pnpm-lock.yaml'), 'not: [valid');
      if (mutation === 'missing-manifest') rmSync(join(ptrRoot, 'package.json'));
      let operationCalled = false;
      const messages = thrownMessages(() => runFixture(value, () => { operationCalled = true; }));
      expect(messages).toContain(mutation === 'missing-manifest'
        ? 'PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID'
        : 'PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
      expect(operationCalled).toBe(false);
    },
  );

  it.each([
    ['wrong package name', { key: 'typescript@5.6.3', name: 'not-typescript' }],
    ['archive link', { key: 'typescript@5.6.3', corrupt: 'link' as const }],
  ])('rejects Linux cache archive mutation: %s', (_label, archiveOverride) => {
    const messages = thrownMessages(() => runFixture(fixture({ archiveOverride })));
    expect(messages.some(message => [
      'PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID',
      'GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID',
    ].includes(message))).toBe(true);
  });

  it('rejects callback dependency mutation after reaching the operation boundary', () => {
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(fixture(), root => {
      operationCalled = true;
      writeFileSync(join(root, 'spacetimedb', 'ptr', 'node_modules', 'changed.js'), 'changed');
    }));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_DEPENDENCY_CHANGED');
    expect(operationCalled).toBe(true);
  });

  it('retains the primary callback throw and owned materialization', () => {
    const messages = thrownMessages(() => runFixture(fixture(), () => {
      throw new Error('LINUX_CALLBACK_FAILED');
    }));
    expect(messages).toContain('LINUX_CALLBACK_FAILED');
    expect(boundary.retainedRoots).toHaveLength(1);
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it('rejects callback thenables and retains the owned materialization', () => {
    const messages = thrownMessages(() => runFixture(fixture(), () => Promise.resolve('invalid')));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_OPERATION_THENABLE');
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it('rejects output outside the fixed PTR bundle allowance', () => {
    const messages = thrownMessages(() => runFixture(fixture(), root => {
      writeFileSync(join(root, 'unexpected-output'), 'unexpected');
    }));
    expect(messages).toContain('LINUX_FIXTURE_UNTRACKED_PATH:unexpected-output');
  });

  it('surfaces materialization cleanup failure after exact build cleanup', () => {
    boundary.cleanupFailure = true;
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(fixture(), () => {
      operationCalled = true;
      return 'built';
    }));
    expect(messages).toContain('LINUX_FIXTURE_CLEANUP_FAILED');
    expect(operationCalled).toBe(true);
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it.each(['profile', 'platform', 'generatedFiles'])(
    'rejects caller-selected %s input',
    field => {
      let operationCalled = false;
      const messages = thrownMessages(() => runFixture(
        fixture(),
        () => { operationCalled = true; },
        { [field]: field === 'generatedFiles' ? ['arbitrary'] : 'linux' },
      ));
      expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
      expect(operationCalled).toBe(false);
    },
  );

  it('keeps Darwin selection fixed when called on this host', () => {
    const value = fixture({
      mutateLock: lock => { delete lock.packages['@esbuild/darwin-arm64@0.25.12']; },
    });
    let operationCalled = false;
    const messages = thrownMessages(() => withPtrLockedSourceBuild({
      repositoryRoot: value.repositoryRoot,
      moduleSourceCommit: value.sourceCommit,
      dependencyCacheRoot: value.dependencyCacheRoot,
      materializationParent: value.materializationParent,
      operation: () => { operationCalled = true; },
    }));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operationCalled).toBe(false);
  });

  it('rejects a Darwin-only graph through the fixed Linux wrapper', () => {
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(fixture({
      keys: DARWIN_PACKAGE_KEYS,
      mutateLock: lock => { delete lock.packages['@esbuild/linux-x64@0.25.12']; },
    }), () => { operationCalled = true; }));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operationCalled).toBe(false);
  });
});
