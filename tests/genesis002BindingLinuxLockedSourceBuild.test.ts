// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGenesis002Fixture,
  type Genesis002Fixture,
} from './fixtures/genesis002LockedSourceBuildFixture';
import {
  DARWIN_PACKAGE_KEYS,
  LINUX_PACKAGE_KEYS,
  createPtrFixture,
} from './fixtures/ptrLockedSourceBuildFixture';

const boundary = vi.hoisted(() => ({
  cleanupFailure: false,
  ignoreTrackedMutation: false,
  linkEscapeRoot: '' as string,
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
          if (!boundary.ignoreTrackedMutation) {
            for (const [logical, identity] of tracked) {
              if (current.get(logical) !== identity) throw new Error('G002_FIXTURE_TRACKED_SOURCE_CHANGED');
            }
          }
          const prefixes = allowed?.prefixes ?? [];
          const files = allowed?.files ?? [];
          for (const logical of current.keys()) {
            if (tracked.has(logical) || logical === '') continue;
            if (files.includes(logical) || files.some(file => file.startsWith(`${logical}/`))
              || prefixes.some(prefix => (
                logical === prefix.slice(0, -1) || logical.startsWith(prefix)
              ))) continue;
            throw new Error(`G002_FIXTURE_UNTRACKED_PATH:${logical}`);
          }
        },
        cleanup() {
          if (boundary.cleanupFailure) throw new Error('G002_FIXTURE_CLEANUP_FAILED');
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
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          if (boundary.linkEscapeRoot !== '') {
            const escape = boundary.linkEscapeRoot;
            boundary.linkEscapeRoot = '';
            fs.symlinkSync(escape, destination, process.platform === 'win32' ? 'junction' : 'dir');
            return;
          }
          if (path.relative(input.root, resolved).split(path.sep).join('/') !== targetRootRelative) {
            throw new Error('G002_FIXTURE_LINK_ARGUMENT_INVALID');
          }
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
  Genesis002BindingLockedSourceBuildError,
  withGenesis002LinuxLockedSourceBuild,
} from '../scripts/genesis002-binding-linux-locked-source-build';
import {
  PtrBindingLockedSourceBuildError,
  withPtrLinuxLockedSourceBuild,
} from '../scripts/ptr-binding-linux-locked-source-build';
import { withPtrLockedSourceBuild } from '../scripts/ptr-binding-locked-source-build';

const temporaryDirectories: string[] = [];

beforeEach(() => {
  boundary.cleanupFailure = false;
  boundary.ignoreTrackedMutation = false;
  boundary.linkEscapeRoot = '';
  boundary.retainedRoots.length = 0;
});

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(options: Parameters<typeof createGenesis002Fixture>[0] = {}): Genesis002Fixture {
  const value = createGenesis002Fixture(options);
  temporaryDirectories.push(...value.cleanupRoots);
  return value;
}

function runFixture(
  value: Genesis002Fixture,
  operation: (root: string, digest: string) => unknown = root => value.assertInstalledG002(root),
  extras: Readonly<Record<string, unknown>> = {},
) {
  return withGenesis002LinuxLockedSourceBuild({
    ...value.input,
    operation: ({ materializedRoot, dependencyClosureDigest }: Readonly<{
      materializedRoot: string;
      dependencyClosureDigest: string;
    }>) => {
      const result = operation(materializedRoot, dependencyClosureDigest);
      const dist = join(materializedRoot, 'spacetimedb', 'genesis002', 'dist');
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

describe('fixed Genesis 002 Linux workspace locked-source build', () => {
  it('uses the documented alias identity for the preserved PTR error surface', () => {
    expect(Genesis002BindingLockedSourceBuildError).toBe(PtrBindingLockedSourceBuildError);
    expect(new Genesis002BindingLockedSourceBuildError('PTR_G002_TEST')).toMatchObject({
      name: 'PtrBindingLockedSourceBuildError',
      code: 'PTR_G002_TEST',
      message: 'PTR_G002_TEST',
    });
  });

  it('installs only G002, returns independently derived provenance, and cleans up', () => {
    const value = fixture();
    const before = value.sourceSnapshot();
    let materializedRoot = '';
    const result = runFixture(value, (root, digest) => {
      materializedRoot = root;
      value.assertInstalledG002(root);
      expect(digest).toBe(value.expectedClosureDigest());
      expect(existsSync(join(root, 'spacetimedb', 'ptr', 'node_modules'))).toBe(false);
      return 'g002-built';
    });
    expect(result).toEqual({
      result: 'g002-built',
      dependencyClosureDigest: value.expectedClosureDigest(),
      moduleTreeId: 'b'.repeat(40),
    });
    expect(value.sourceSnapshot()).toEqual(before);
    expect(existsSync(materializedRoot)).toBe(false);
  });

  it('returns deterministic provenance across fresh private materializations', () => {
    const first = fixture();
    const second = fixture();
    expect(runFixture(first).dependencyClosureDigest).toBe(runFixture(second).dependencyClosureDigest);
  });

  it.each([
    ['root importer drift', (lock: Record<string, any>) => {
      lock.importers['.'].dependencies.spacetimedb.version = '2.6.0';
    }],
    ['G002 importer alias', (lock: Record<string, any>) => {
      lock.importers.genesis002.devDependencies.esbuild.version = 'npm:esbuild@0.25.12';
    }],
    ['fixture importer extra dependency', (lock: Record<string, any>) => {
      lock.importers['migration-fixtures/production-v1'].dependencies.extra = {
        specifier: '1.0.0', version: '1.0.0',
      };
    }],
    ['missing importer', (lock: Record<string, any>) => {
      delete lock.importers['migration-fixtures/additive-v17-schema'];
    }],
    ['extra importer', (lock: Record<string, any>) => {
      lock.importers.foreign = lock.importers['.'];
    }],
    ['transitive dependency alias', (lock: Record<string, any>) => {
      lock.snapshots['spacetimedb@2.6.1'].dependencies['base64-js'] = 'npm:base64-js@1.5.1';
    }],
  ])('rejects workspace lock authority drift: %s', (_label, mutateLock) => {
    let called = false;
    expect(thrownMessages(() => runFixture(fixture({ mutateLock }), () => { called = true; })))
      .toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(called).toBe(false);
  });

  it.each([
    ['missing package pattern', (workspace: Record<string, any>) => { workspace.packages.pop(); }],
    ['extra package pattern', (workspace: Record<string, any>) => { workspace.packages.push('ptr'); }],
    ['build permission widened', (workspace: Record<string, any>) => { workspace.allowBuilds.tsx = true; }],
    ['build permission disabled', (workspace: Record<string, any>) => { workspace.allowBuilds.esbuild = false; }],
  ])('rejects workspace YAML authority drift: %s', (_label, mutateWorkspace) => {
    let called = false;
    expect(thrownMessages(() => runFixture(fixture({ mutateWorkspace }), () => { called = true; })))
      .toContain('PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID');
    expect(called).toBe(false);
  });

  it.each([
    ['missing Linux cpu', (lock: Record<string, any>) => {
      delete lock.packages['@esbuild/linux-x64@0.25.12'].cpu;
    }],
    ['widened Linux os', (lock: Record<string, any>) => {
      lock.packages['@esbuild/linux-x64@0.25.12'].os = ['linux', 'darwin'];
    }],
    ['wrong Linux platform', (lock: Record<string, any>) => {
      lock.packages['@esbuild/linux-x64@0.25.12'].os = ['darwin'];
    }],
    ['missing optional marker', (lock: Record<string, any>) => {
      delete lock.snapshots['@esbuild/linux-x64@0.25.12'].optional;
    }],
    ['generic package optional marker', (lock: Record<string, any>) => {
      lock.snapshots['typescript@5.6.3'].optional = true;
    }],
  ])('rejects incompatible or widened selected metadata: %s', (_label, mutateLock) => {
    expect(thrownMessages(() => runFixture(fixture({ mutateLock }))))
      .toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  });

  it('rejects wrong archive bytes and complete installed manifest mismatches', () => {
    const changed = fixture();
    writeFileSync(changed.archives.get('get-tsconfig@4.14.0')!, 'changed');
    expect(thrownMessages(() => runFixture(changed)))
      .toContain('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
    expect(thrownMessages(() => runFixture(fixture({
      archiveOverride: { key: 'prettier@3.9.5', version: '3.9.6' },
    })))).toContain('PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID');
  });

  it.each(['manifest', 'lock', 'workspace'] as const)(
    'reattests consumed %s authority after the callback',
    authority => {
      boundary.ignoreTrackedMutation = true;
      const messages = thrownMessages(() => runFixture(fixture(), root => {
        const path = authority === 'manifest'
          ? join(root, 'spacetimedb', 'genesis002', 'package.json')
          : join(root, 'spacetimedb', authority === 'lock' ? 'pnpm-lock.yaml' : 'pnpm-workspace.yaml');
        writeFileSync(path, 'changed');
      }));
      expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    },
  );

  it('rejects internal link escape before invoking the operation', () => {
    const value = fixture();
    boundary.linkEscapeRoot = value.input.dependencyCacheRoot;
    let called = false;
    const messages = thrownMessages(() => runFixture(value, () => { called = true; }));
    expect(messages, messages.join(' -> '))
      .toContain('PTR_LOCKED_SOURCE_BUILD_LINK_INVALID');
    expect(called).toBe(false);
  });

  it.each([
    ['unexpected generated file', (root: string) => writeFileSync(join(root, 'unexpected'), 'x')],
    ['dependency mutation', (root: string) => writeFileSync(join(
      root, 'spacetimedb', 'genesis002', 'node_modules', 'changed.js',
    ), 'changed')],
  ])('retains the materialization on %s', (_label, mutate) => {
    const messages = thrownMessages(() => runFixture(fixture(), root => mutate(root)));
    expect(messages.some(message => message === 'PTR_LOCKED_SOURCE_BUILD_DEPENDENCY_CHANGED'
      || message.startsWith('G002_FIXTURE_UNTRACKED_PATH:'))).toBe(true);
    expect(boundary.retainedRoots).toHaveLength(1);
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it('preserves callback throws and rejects thenables without cleanup', () => {
    expect(thrownMessages(() => runFixture(fixture(), () => {
      throw new Error('G002_CALLBACK_FAILED');
    }))).toContain('G002_CALLBACK_FAILED');
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
    expect(thrownMessages(() => runFixture(fixture(), () => Promise.resolve('invalid'))))
      .toContain('PTR_LOCKED_SOURCE_BUILD_OPERATION_THENABLE');
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
  });

  it('retains cleanup failure as the aggregate cause after exact source cleanup', () => {
    boundary.cleanupFailure = true;
    let thrown: unknown;
    try { runFixture(fixture()); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).message).toBe('PTR_LOCKED_SOURCE_BUILD_FAILED');
    expect((thrown as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'G002_FIXTURE_CLEANUP_FAILED' }),
    ]);
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it('requires exactly five public inputs including the explicit private parent', () => {
    const missing = fixture();
    const { materializationParent: _omitted, ...withoutParent } = missing.input;
    expect(thrownMessages(() => withGenesis002LinuxLockedSourceBuild({
      ...withoutParent,
      operation: () => 'invalid',
    } as never))).toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    expect(boundary.retainedRoots).toHaveLength(0);

    for (const field of ['profile', 'platform', 'generatedFiles']) {
      const value = fixture();
      expect(thrownMessages(() => runFixture(value, () => 'invalid', { [field]: 'invalid' })))
        .toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
      expect(boundary.retainedRoots).toHaveLength(0);
    }
  });

  it('leaves both fixed PTR wrappers on their historical source graphs', () => {
    const runPtr = (keys: readonly string[], linux: boolean) => {
      const value = createPtrFixture({ keys });
      temporaryDirectories.push(...value.cleanupRoots);
      const operation = ({ materializedRoot }: { materializedRoot: string }) => {
        const dist = join(materializedRoot, 'spacetimedb', 'ptr', 'dist');
        mkdirSync(dist, { mode: 0o700 });
        writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
        return linux ? 'linux-ptr' : 'darwin-ptr';
      };
      const input = {
        repositoryRoot: value.repositoryRoot,
        moduleSourceCommit: value.sourceCommit,
        dependencyCacheRoot: value.dependencyCacheRoot,
        materializationParent: value.materializationParent,
        operation,
      };
      return linux ? withPtrLinuxLockedSourceBuild(input) : withPtrLockedSourceBuild(input);
    };
    expect(runPtr(DARWIN_PACKAGE_KEYS, false).result).toBe('darwin-ptr');
    expect(runPtr(LINUX_PACKAGE_KEYS, true).result).toBe('linux-ptr');
  });
});
