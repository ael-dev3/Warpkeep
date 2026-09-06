// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { greaterRealmImmutableArtifactTestSeams } from '../scripts/greater-realm-production-immutable-artifact';
import {
  GENESIS002_EDGES, GENESIS002_PACKAGE_KEYS, createGenesis002Fixture,
  type Genesis002Fixture,
} from './fixtures/genesis002LockedSourceBuildFixture';

const boundary = vi.hoisted(() => ({
  cleanupFailure: false,
  moduleTreeId: '90deebb5faf4129282f5c35999244f540001b27d',
  retainedRoots: [] as string[],
  sourceClosureDigest: '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9',
  sourceConstructionFailure: '' as string,
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

vi.mock('../scripts/genesis001-binding-frozen-source.mjs', async () => {
  const crypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  const snapshot = (root: string): Map<string, string> => {
    const result = new Map<string, string>();
    const visit = (candidate: string) => {
      const status = fs.lstatSync(candidate);
      const logical = path.relative(root, candidate).split(path.sep).join('/');
      result.set(logical, status.isFile()
        ? `file:${status.dev}:${status.ino}:${crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex')}`
        : status.isDirectory() ? `directory:${status.dev}:${status.ino}` : `link:${fs.readlinkSync(candidate)}`);
      if (status.isDirectory()) {
        for (const name of fs.readdirSync(candidate).sort()) visit(path.join(candidate, name));
      }
    };
    visit(root);
    return result;
  };
  return {
    GENESIS001_FROZEN_SOURCE_COMMIT: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    GENESIS001_FROZEN_SOURCE_TREE: '90deebb5faf4129282f5c35999244f540001b27d',
    GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256: '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9',
    createGenesis001FrozenSourceMaterialization(input: Readonly<{
      repositoryRoot: string;
      destination: string;
    }>) {
      if (boundary.sourceConstructionFailure !== '') throw new Error(boundary.sourceConstructionFailure);
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      boundary.retainedRoots.push(input.destination);
      const frozen = snapshot(input.destination);
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
        moduleTreeId: boundary.moduleTreeId,
        sourceClosureDigest: boundary.sourceClosureDigest,
        verify(allowed?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>) {
          const current = snapshot(input.destination);
          for (const [logical, identity] of frozen) {
            if (current.get(logical) !== identity) throw new Error('G001_FIXTURE_SOURCE_CHANGED');
          }
          for (const logical of current.keys()) {
            if (frozen.has(logical) || logical === '') continue;
            if (allowed?.files?.some(file => file === logical || file.startsWith(`${logical}/`))
              || allowed?.prefixes?.some(prefix => (
                logical === prefix.slice(0, -1) || logical.startsWith(prefix)
              ))) continue;
            throw new Error(`G001_FIXTURE_UNEXPECTED:${logical}`);
          }
        },
        cleanup() {
          if (boundary.cleanupFailure) throw new Error('G001_FIXTURE_CLEANUP_FAILED');
          fs.rmSync(input.destination, { recursive: true, force: false });
        },
      });
    },
  };
});

vi.mock('../scripts/greater-realm-production-provenance', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    createGreaterRealmProductionCommitMaterialization(input: Readonly<{
      repositoryRoot: string;
      moduleSourceCommit: string;
      destination: string;
    }>) {
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify() {},
        cleanup() { fs.rmSync(input.destination, { recursive: true, force: false }); },
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
          if (path.relative(input.root, resolved).split(path.sep).join('/') !== targetRootRelative) {
            throw new Error('G001_FIXTURE_LINK_ARGUMENT_INVALID');
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
  Genesis001BindingLockedSourceBuildError, withGenesis001LinuxLockedSourceBuild,
} from '../scripts/genesis001-binding-linux-locked-source-build';
import { withGenesis002LinuxLockedSourceBuild } from '../scripts/genesis002-binding-linux-locked-source-build';
import { PtrBindingLockedSourceBuildError } from '../scripts/ptr-binding-linux-locked-source-build';

const temporaryDirectories: string[] = [];

beforeEach(() => {
  boundary.cleanupFailure = false;
  boundary.moduleTreeId = '90deebb5faf4129282f5c35999244f540001b27d';
  boundary.retainedRoots.length = 0;
  boundary.sourceClosureDigest = '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9';
  boundary.sourceConstructionFailure = '';
});

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

function g001Fixture(options: Parameters<typeof createGenesis002Fixture>[0] = {}): Genesis002Fixture {
  const value = createGenesis002Fixture({
    ...options,
    mutateLock(lock) {
      delete lock.importers.genesis002;
      for (const version of [15, 16, 17]) delete lock.importers[`migration-fixtures/additive-v${version}-schema`];
      delete lock.importers['migration-fixtures/current-candidate-inspection'];
      options.mutateLock?.(lock);
    },
    mutateWorkspace(workspace) {
      workspace.packages = ['.', 'migration-fixtures/*'];
      options.mutateWorkspace?.(workspace);
    },
  });
  temporaryDirectories.push(...value.cleanupRoots);
  return value;
}

function input(value: Genesis002Fixture) {
  return {
    repositoryRoot: value.input.repositoryRoot,
    dependencyCacheRoot: value.input.dependencyCacheRoot,
    materializationParent: value.input.materializationParent,
  };
}

function createBundle(root: string) {
  const dist = join(root, 'spacetimedb', 'dist');
  mkdirSync(dist, { mode: 0o700 });
  writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
}

function runFixture(
  value: Genesis002Fixture,
  operation: (root: string, digest: string) => unknown = root => {
    const installed = JSON.parse(readFileSync(join(
      root, 'spacetimedb', 'node_modules', 'spacetimedb', 'package.json',
    ), 'utf8')) as { name?: unknown; version?: unknown };
    expect(installed).toMatchObject({ name: 'spacetimedb', version: '2.6.1' });
  },
  extras: Readonly<Record<string, unknown>> = {},
) {
  return withGenesis001LinuxLockedSourceBuild({
    ...input(value),
    operation: ({ materializedRoot, dependencyClosureDigest }: Readonly<{
      materializedRoot: string;
      dependencyClosureDigest: string;
    }>) => {
      const result = operation(materializedRoot, dependencyClosureDigest);
      if (!existsSync(join(materializedRoot, 'spacetimedb', 'dist', 'bundle.js'))) {
        createBundle(materializedRoot);
      }
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

function expectedClosure(root: string, value: Genesis002Fixture): string {
  const moduleRoot = join(root, 'spacetimedb');
  const dependencySnapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
    root: join(moduleRoot, 'node_modules'), boundary: moduleRoot,
  });
  const digest = createHash('sha256');
  const framed = (label: string, source: string | Buffer) => {
    const labelBytes = Buffer.from(label);
    const valueBytes = typeof source === 'string' ? Buffer.from(source) : source;
    const lengths = Buffer.alloc(16);
    lengths.writeBigUInt64BE(BigInt(labelBytes.byteLength), 0);
    lengths.writeBigUInt64BE(BigInt(valueBytes.byteLength), 8);
    digest.update(lengths.subarray(0, 8)).update(labelBytes)
      .update(lengths.subarray(8)).update(valueBytes);
  };
  framed('domain', 'warpkeep-genesis001-frozen-linux-x64-dependency-closure-v1');
  framed('manifest-path', 'spacetimedb/package.json');
  framed('manifest-bytes', readFileSync(join(moduleRoot, 'package.json')));
  framed('lock-path', 'spacetimedb/pnpm-lock.yaml');
  framed('lock-bytes', readFileSync(join(moduleRoot, 'pnpm-lock.yaml')));
  framed('workspace-path', 'spacetimedb/pnpm-workspace.yaml');
  framed('workspace-bytes', readFileSync(join(moduleRoot, 'pnpm-workspace.yaml')));
  framed('frozen-source-inventory-sha256', '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9');
  for (const key of GENESIS002_PACKAGE_KEYS) {
    framed('package-key', key);
    framed('package-integrity', value.lock.packages[key].resolution.integrity);
    framed('package-edges', JSON.stringify(GENESIS002_EDGES[key]));
  }
  framed('installed-content-profile', 'spacetimedb/node_modules');
  framed('installed-content-sha256', dependencySnapshot.contentDigest);
  framed('installed-entry-count', String(dependencySnapshot.entries.size));
  return digest.digest('hex');
}

describe('fixed Genesis 001 Linux locked-source build', () => {
  it('preserves the shared error alias and rejects caller source authority', () => {
    expect(Genesis001BindingLockedSourceBuildError).toBe(PtrBindingLockedSourceBuildError);
    expect(new Genesis001BindingLockedSourceBuildError('PTR_G001_TEST')).toMatchObject({
      name: 'PtrBindingLockedSourceBuildError', code: 'PTR_G001_TEST', message: 'PTR_G001_TEST',
    });
    const value = g001Fixture();
    const operation = vi.fn();
    expect(thrownMessages(() => withGenesis001LinuxLockedSourceBuild({
      ...input(value), operation, moduleSourceCommit: '0'.repeat(40),
    } as never))).toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    expect(operation).not.toHaveBeenCalled();
    expect(boundary.retainedRoots).toHaveLength(0);
  });

  it('installs real package bytes only under the historical root and returns both authorities', () => {
    const value = g001Fixture();
    let materializedRoot = '';
    const result = runFixture(value, (root, digest) => {
      materializedRoot = root;
      expect(digest).toBe(expectedClosure(root, value));
      expect(existsSync(join(root, 'node_modules'))).toBe(false);
      expect(existsSync(join(root, 'spacetimedb', 'genesis002', 'node_modules'))).toBe(false);
      expect(readdirSync(join(root, 'spacetimedb', 'node_modules', '.pnpm'))
        .filter(name => name !== 'lock.yaml')).toHaveLength(15);
      return 'g001-built';
    });
    expect(result).toEqual({
      result: 'g001-built', dependencyClosureDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      moduleTreeId: '90deebb5faf4129282f5c35999244f540001b27d',
    });
    expect(existsSync(materializedRoot)).toBe(false);
  });

  it('returns identical provenance across two fresh frozen materializations', () => {
    expect(runFixture(g001Fixture()).dependencyClosureDigest)
      .toBe(runFixture(g001Fixture()).dependencyClosureDigest);
  });

  it.each([
    ['missing importer', (lock: Record<string, any>) => { delete lock.importers['migration-fixtures/additive-v14-schema']; }],
    ['extra importer', (lock: Record<string, any>) => { lock.importers.foreign = lock.importers['.']; }],
    ['importer alias', (lock: Record<string, any>) => { lock.importers['.'].dependencies.spacetimedb.version = 'npm:spacetimedb@2.6.1'; }],
    ['platform mismatch', (lock: Record<string, any>) => { lock.packages['@esbuild/linux-x64@0.25.12'].os = ['darwin']; }],
  ])('rejects historical lock authority drift: %s', (_label, mutateLock) => {
    const operation = vi.fn();
    expect(thrownMessages(() => runFixture(g001Fixture({ mutateLock }), operation)))
      .toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects historical SRI mismatch before callback', () => {
    const operation = vi.fn();
    expect(thrownMessages(() => runFixture(g001Fixture({
      mutateLock(lock) {
        lock.packages['typescript@5.6.3'].resolution.integrity =
          'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
      },
    }), operation))).toContain('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
    expect(operation).not.toHaveBeenCalled();
  });

  it('keeps G001 and G002 workspace package lists non-substitutable', () => {
    expect(thrownMessages(() => runFixture(g001Fixture({
      mutateWorkspace(workspace) { workspace.packages = ['.', 'genesis002', 'migration-fixtures/*']; },
    })))).toContain('PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID');
    const g002 = createGenesis002Fixture({
      mutateWorkspace(workspace) { workspace.packages = ['.', 'migration-fixtures/*']; },
    });
    temporaryDirectories.push(...g002.cleanupRoots);
    expect(thrownMessages(() => withGenesis002LinuxLockedSourceBuild({
      ...g002.input, operation: () => 'invalid',
    }))).toContain('PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID');
  });

  it.each([
    ['missing package pattern', (workspace: Record<string, any>) => { workspace.packages.pop(); }],
    ['extra build permission', (workspace: Record<string, any>) => { workspace.allowBuilds.tsx = true; }],
    ['disabled esbuild', (workspace: Record<string, any>) => { workspace.allowBuilds.esbuild = false; }],
  ])('rejects historical workspace authority drift: %s', (_label, mutateWorkspace) => {
    expect(thrownMessages(() => runFixture(g001Fixture({ mutateWorkspace }))))
      .toContain('PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID');
  });

  it('rejects corrupt archives and package identity mismatches before callback', () => {
    const changed = g001Fixture();
    writeFileSync(changed.archives.get('get-tsconfig@4.14.0')!, 'changed');
    expect(thrownMessages(() => runFixture(changed))).toContain('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
    expect(thrownMessages(() => runFixture(g001Fixture({
      archiveOverride: { key: 'prettier@3.9.5', version: '3.9.6' },
    })))).toContain('PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID');
  });

  it.each(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])(
    'reattests source content and inode after the callback: %s', authority => {
      expect(thrownMessages(() => runFixture(g001Fixture(), root => {
        const path = join(root, 'spacetimedb', authority);
        const body = readFileSync(path);
        unlinkSync(path);
        writeFileSync(path, body, { mode: 0o600 });
      }))).toContain('PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    },
  );

  it('rejects source symlink replacement and unexpected source additions', () => {
    const value = g001Fixture();
    const symlinkMessages = thrownMessages(() => runFixture(value, root => {
      const path = join(root, 'spacetimedb', 'genesis002');
      rmSync(path, { recursive: true, force: false });
      symlinkSync(value.input.dependencyCacheRoot, path,
        process.platform === 'win32' ? 'junction' : 'dir');
    }));
    expect(symlinkMessages, symlinkMessages.join(' -> '))
      .toContain('G001_FIXTURE_SOURCE_CHANGED');
    expect(thrownMessages(() => runFixture(g001Fixture(), root => {
      writeFileSync(join(root, 'unexpected'), 'x', { mode: 0o600 });
    }))).toContain('G001_FIXTURE_UNEXPECTED:unexpected');
  });

  it('rejects dependency mutation, async callback, and bundle escape while retaining failures', () => {
    expect(thrownMessages(() => runFixture(g001Fixture(), root => {
      writeFileSync(join(root, 'spacetimedb', 'node_modules', 'changed'), 'x');
    }))).toContain('PTR_LOCKED_SOURCE_BUILD_DEPENDENCY_CHANGED');
    expect(thrownMessages(() => runFixture(g001Fixture(), () => Promise.resolve('invalid'))))
      .toContain('PTR_LOCKED_SOURCE_BUILD_OPERATION_THENABLE');
    const escape = g001Fixture();
    expect(thrownMessages(() => runFixture(escape, root => {
      const dist = join(root, 'spacetimedb', 'dist');
      mkdirSync(dist, { mode: 0o700 });
      symlinkSync(escape.input.dependencyCacheRoot, join(dist, 'bundle.js'),
        process.platform === 'win32' ? 'junction' : 'dir');
    }))).toContain('PTR_LOCKED_SOURCE_BUILD_OUTPUT_INVALID');
    expect(boundary.retainedRoots.slice(-3).every(root => existsSync(root))).toBe(true);
  });

  it('preserves callback and cleanup errors without deleting retained namespaces', () => {
    expect(thrownMessages(() => runFixture(g001Fixture(), () => {
      throw new Error('G001_CALLBACK_FAILED');
    }))).toContain('G001_CALLBACK_FAILED');
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
    boundary.cleanupFailure = true;
    let thrown: unknown;
    try { runFixture(g001Fixture()); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).message).toBe('PTR_LOCKED_SOURCE_BUILD_FAILED');
    expect((thrown as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'G001_FIXTURE_CLEANUP_FAILED' }),
    ]);
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
  });

  it('rejects missing parent and caller-selected profile/commands before materialization', () => {
    const value = g001Fixture();
    const { materializationParent: _omitted, ...withoutParent } = input(value);
    expect(thrownMessages(() => withGenesis001LinuxLockedSourceBuild({
      ...withoutParent, operation: () => 'invalid',
    } as never))).toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    for (const key of ['profile', 'platform', 'commands', 'generatedFiles']) {
      expect(thrownMessages(() => runFixture(g001Fixture(), () => 'invalid', { [key]: 'invalid' })))
        .toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    }
  });

  it('retains source-construction failures without invoking the callback', () => {
    boundary.sourceConstructionFailure = 'G001_MATERIALIZER_BYTES_INVALID';
    const operation = vi.fn();
    expect(thrownMessages(() => runFixture(g001Fixture(), operation)))
      .toContain('G001_MATERIALIZER_BYTES_INVALID');
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects substituted historical tree or frozen inventory authority before callback', () => {
    const wrongTreeOperation = vi.fn();
    boundary.moduleTreeId = '0'.repeat(40);
    expect(() => runFixture(g001Fixture(), wrongTreeOperation)).toThrow();
    expect(wrongTreeOperation).not.toHaveBeenCalled();
    boundary.moduleTreeId = '90deebb5faf4129282f5c35999244f540001b27d';
    const wrongSourceOperation = vi.fn();
    boundary.sourceClosureDigest = '0'.repeat(64);
    expect(() => runFixture(g001Fixture(), wrongSourceOperation)).toThrow();
    expect(wrongSourceOperation).not.toHaveBeenCalled();
  });
});
