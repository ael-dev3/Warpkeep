// @vitest-environment node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GENESIS002_EDGES,
  GENESIS002_PACKAGE_KEYS,
  GENESIS002_TOP_LEVEL,
  createGenesis002Fixture,
  type Genesis002Fixture,
} from './fixtures/genesis002LockedSourceBuildFixture';

const builderBoundary = vi.hoisted(() => ({
  capturedCommits: [] as string[],
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
      builderBoundary.capturedCommits.push(input.moduleSourceCommit);
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      builderBoundary.retainedRoots.push(input.destination);
      const tracked = walk(input.destination);
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify(allowed?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>) {
          const current = walk(input.destination);
          for (const [logical, identity] of tracked) {
            if (current.get(logical) !== identity) throw new Error('CURRENT_G001_FIXTURE_SOURCE_CHANGED');
          }
          const prefixes = allowed?.prefixes ?? [];
          const files = allowed?.files ?? [];
          for (const logical of current.keys()) {
            if (tracked.has(logical) || logical === '') continue;
            if (files.includes(logical) || files.some(file => file.startsWith(`${logical}/`))
              || prefixes.some(prefix => logical === prefix.slice(0, -1) || logical.startsWith(prefix))) continue;
            throw new Error(`CURRENT_G001_FIXTURE_UNTRACKED_PATH:${logical}`);
          }
        },
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
        symlink(logical: string, target: string) {
          const destination = exact(logical);
          const resolved = path.resolve(path.dirname(destination), target);
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

import * as runtime from '../scripts/local-binding-runtime.mjs';
import {
  Genesis001CurrentBindingLockedSourceBuildError,
  withGenesis001CurrentLinuxLockedSourceBuild,
} from '../scripts/genesis001-current-binding-linux-locked-source-build';
import { PtrBindingLockedSourceBuildError } from '../scripts/ptr-binding-locked-source-build-core';
import { withGenesis001LinuxLockedSourceBuild } from '../scripts/genesis001-binding-linux-locked-source-build';

const cleanupRoots: string[] = [];

beforeEach(() => {
  builderBoundary.capturedCommits.length = 0;
  builderBoundary.retainedRoots.length = 0;
});

afterEach(() => {
  for (const root of cleanupRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function currentFixture(options: Parameters<typeof createGenesis002Fixture>[0] = {}): Genesis002Fixture {
  const value = createGenesis002Fixture(options);
  cleanupRoots.push(...value.cleanupRoots);
  return value;
}

function assertInstalledCurrent(root: string): void {
  const nodeModules = join(root, 'spacetimedb', 'node_modules');
  expect(existsSync(join(root, 'spacetimedb', 'genesis002', 'node_modules'))).toBe(false);
  expect(existsSync(nodeModules)).toBe(true);
  for (const key of GENESIS002_PACKAGE_KEYS) {
    const separator = key.lastIndexOf('@');
    const name = key.slice(0, separator);
    const packageRoot = join(nodeModules, '.pnpm', key.replace('/', '+'), 'node_modules', ...name.split('/'));
    expect(JSON.parse(requireFile(join(packageRoot, 'package.json')))).toMatchObject({ name });
    for (const edge of GENESIS002_EDGES[key]!) {
      const edgeName = edge.slice(0, edge.lastIndexOf('@'));
      expect(existsSync(join(nodeModules, '.pnpm', key.replace('/', '+'), 'node_modules', ...edgeName.split('/'))))
        .toBe(true);
    }
  }
  for (const name of Object.keys(GENESIS002_TOP_LEVEL)) {
    expect(existsSync(join(nodeModules, name, 'package.json'))).toBe(true);
  }
}

function requireFile(path: string): string {
  return readFileSync(path, 'utf8');
}

function runCurrent(value: Genesis002Fixture, extras: Readonly<Record<string, unknown>> = {}) {
  return withGenesis001CurrentLinuxLockedSourceBuild({
    ...value.input,
    operation: ({ materializedRoot, dependencyClosureDigest, moduleTreeId }: Readonly<{
      materializedRoot: string;
      dependencyClosureDigest: string;
      moduleTreeId: string;
    }>) => {
      assertInstalledCurrent(materializedRoot);
      const dist = join(materializedRoot, 'spacetimedb', 'dist');
      mkdirSync(dist, { mode: 0o700 });
      writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
      return { dependencyClosureDigest, moduleTreeId };
    },
    ...extras,
  } as never);
}

it('exposes the fixed current G001 check', () => {
  expect(runtime.derivePreparedGenesis001CurrentLinuxBindingCheck).toEqual(expect.any(Function));
});

it('rejects every caller option including explicit undefined', async () => {
  const operation = runtime.derivePreparedGenesis001CurrentLinuxBindingCheck as unknown as
    (input: unknown) => Promise<unknown>;
  await expect(operation(undefined))
    .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
  await expect(operation({}))
    .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
});

it('returns only the fixed public current-binding evidence schema', async () => {
  vi.resetModules();
  vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
    deriveFixedGenesis001CurrentBindingCheck: async () => ({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
      bindingFileCount: 17,
      privatePath: '/must/not/escape',
      bindings: [{ path: 'index.ts', bytes: Uint8Array.of(1) }],
    }),
  }));
  try {
    const entrypoint = await import('../scripts/local-binding-runtime.mjs');
    const result = await entrypoint.derivePreparedGenesis001CurrentLinuxBindingCheck();
    expect(result).toEqual({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
      bindingFileCount: 17,
    });
    expect(Object.keys(result).sort()).toEqual([
      'bindingFileCount', 'bundleSha256', 'dependencyClosureDigest',
      'profile', 'sourceCommit', 'sourceTree',
    ].sort());
  } finally {
    vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
    vi.resetModules();
  }
});

describe('fixed current-root G001 locked source build', () => {
  it('uses the shared error identity and captured current commit', () => {
    expect(Genesis001CurrentBindingLockedSourceBuildError).toBe(PtrBindingLockedSourceBuildError);
    const value = currentFixture();
    const result = runCurrent(value);
    expect(builderBoundary.capturedCommits).toEqual([value.input.moduleSourceCommit]);
    expect(result).toEqual({
      result: { dependencyClosureDigest: result.dependencyClosureDigest, moduleTreeId: 'b'.repeat(40) },
      dependencyClosureDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      moduleTreeId: 'b'.repeat(40),
    });
    expect(result.dependencyClosureDigest).not.toBe(createHash('sha256').update('bundle').digest('hex'));
    expect(existsSync(builderBoundary.retainedRoots[0]!)).toBe(false);
  });

  it('requires exactly the five fixed current-profile inputs', () => {
    const value = currentFixture();
    const { moduleSourceCommit: _commit, ...missingCommit } = value.input;
    expect(() => withGenesis001CurrentLinuxLockedSourceBuild({
      ...missingCommit, operation: () => undefined,
    } as never)).toThrowError('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    for (const [key, injected] of [['profile', 'historical'], ['generatedFiles', []]] as const) {
      expect(() => runCurrent(currentFixture(), { [key]: injected }))
        .toThrowError('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    }
    expect(() => runCurrent(currentFixture(), { moduleSourceCommit: 'historical' }))
      .toThrowError('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
    expect(() => withGenesis001LinuxLockedSourceBuild({
      ...currentFixture().input,
      operation: () => undefined,
    } as never)).toThrowError('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');
  });

  it.each([
    ['tracked source mutation', (root: string) => writeFileSync(join(root, 'spacetimedb', 'package.json'), 'changed')],
    ['unexpected namespace member', (root: string) => writeFileSync(join(root, 'unexpected'), 'changed')],
  ])('retains private diagnostics after %s', (_label, mutate) => {
    const value = currentFixture();
    expect(() => runCurrent(value, {
      operation: ({ materializedRoot }: { materializedRoot: string }) => {
        mutate(materializedRoot);
        const dist = join(materializedRoot, 'spacetimedb', 'dist');
        mkdirSync(dist, { mode: 0o700 });
        writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
      },
    })).toThrow();
    expect(builderBoundary.retainedRoots).toHaveLength(1);
    expect(existsSync(builderBoundary.retainedRoots[0]!)).toBe(true);
  });

  it.each([
    ['current importer missing', (lock: Record<string, any>) => { delete lock.importers.genesis002; }],
    ['current candidate importer changed', (lock: Record<string, any>) => {
      lock.importers['migration-fixtures/current-candidate-inspection'].devDependencies.typescript.version = '5.6.2';
    }],
    ['source lock namespace widened', (lock: Record<string, any>) => { lock.importers.foreign = lock.importers['.']; }],
  ])('rejects complete current lock drift: %s', (_label, mutateLock) => {
    expect(() => runCurrent(currentFixture({ mutateLock })))
      .toThrowError(expect.objectContaining({ message: 'PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID' }));
  });

  it('does not fall back to a repository-root lock', () => {
    const value = currentFixture();
    rmSync(join(value.input.repositoryRoot, 'spacetimedb', 'pnpm-lock.yaml'));
    writeFileSync(join(value.input.repositoryRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    expect(() => runCurrent(value)).toThrow();
    expect(builderBoundary.capturedCommits).toEqual([value.input.moduleSourceCommit]);
  });
});
