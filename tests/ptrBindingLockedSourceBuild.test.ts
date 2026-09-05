// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

const boundary = vi.hoisted(() => ({
  cleanupFailure: false,
  finishFailure: false,
  stageFailure: false,
  writeFailure: false,
  retainedRoots: [] as string[],
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const normalize = <T extends { mode: number | bigint; isDirectory(): boolean; isFile(): boolean }>(
    status: T,
  ): T => {
    const permissions = status.isDirectory() ? 0o700 : status.isFile() ? 0o600 : 0o777;
    const normalizedMode = typeof status.mode === 'bigint'
      ? (status.mode & ~0o7777n) | BigInt(permissions)
      : (status.mode & ~0o7777) | permissions;
    Object.defineProperty(status, 'mode', {
      value: normalizedMode,
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
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const crypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  const walk = (root: string): Map<string, string> => {
    const result = new Map<string, string>();
    const visit = (candidate: string) => {
      const status = fs.lstatSync(candidate);
      const logical = path.relative(root, candidate).split(path.sep).join('/');
      const identity = `${status.dev}:${status.ino}:${status.mode}:${status.size}:$${
        status.isFile()
          ? crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex')
          : status.isDirectory() ? 'directory' : fs.readlinkSync(candidate)
      }`;
      result.set(logical, identity);
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
            if (current.get(logical) !== identity) throw new Error('MOCK_TRACKED_SOURCE_CHANGED');
          }
          const prefixes = allowed?.prefixes ?? [];
          const files = allowed?.files ?? [];
          for (const logical of current.keys()) {
            if (tracked.has(logical) || logical === '') continue;
            if (files.includes(logical) || files.some(file => file.startsWith(`${logical}/`))
              || prefixes.some(prefix => (
              logical === prefix.slice(0, -1) || logical.startsWith(prefix)
            ))) continue;
            throw new Error(`MOCK_UNTRACKED_PATH:${logical}`);
          }
        },
        cleanup() {
          if (boundary.cleanupFailure) throw new Error('MOCK_MATERIALIZATION_CLEANUP_FAILED');
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
      if (boundary.stageFailure) throw new Error('MOCK_WRITER_STAGE_FAILED');
      let finished = false;
      const exact = (logical: string) => path.join(input.root, ...logical.split('/'));
      return Object.freeze({
        root: input.root,
        mkdir(logical: string) {
          fs.mkdirSync(exact(logical), { recursive: true, mode: 0o700 });
          fs.chmodSync(exact(logical), 0o700);
        },
        writeFile(logical: string, body: Buffer, mode: 0o600 | 0o644 | 0o700) {
          if (boundary.writeFailure) throw new Error('MOCK_WRITER_WRITE_FAILED');
          fs.mkdirSync(path.dirname(exact(logical)), { recursive: true, mode: 0o700 });
          fs.writeFileSync(exact(logical), body, { flag: 'wx', mode });
          fs.chmodSync(exact(logical), mode);
        },
        symlink(logical: string, target: string, targetRootRelative: string) {
          const destination = exact(logical);
          const resolved = path.resolve(path.dirname(destination), target);
          if (path.relative(input.root, resolved).split(path.sep).join('/') !== targetRootRelative) {
            throw new Error('MOCK_WRITER_LINK_ESCAPE');
          }
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          // Windows cannot create the relative links used by pnpm without
          // developer privileges. The mock preserves the already-validated
          // target layout by copying; native coverage owns real link syscalls.
          if (fs.lstatSync(resolved).isDirectory()) {
            fs.cpSync(resolved, destination, { recursive: true, errorOnExist: true });
          } else fs.copyFileSync(resolved, destination, fs.constants.COPYFILE_EXCL);
        },
        finish() {
          if (finished) return;
          finished = true;
          if (boundary.finishFailure) throw new Error('MOCK_WRITER_FINISH_FAILED');
        },
      });
    },
  };
});

import { withPtrLockedSourceBuild } from '../scripts/ptr-binding-locked-source-build';
import { greaterRealmImmutableArtifactTestSeams } from '../scripts/greater-realm-production-immutable-artifact';

const SELECTED_PACKAGE_KEYS = Object.freeze([
  '@esbuild/darwin-arm64@0.25.12',
  'base64-js@1.5.1',
  'esbuild@0.25.12',
  'fsevents@2.3.3',
  'get-tsconfig@4.14.3',
  'headers-polyfill@4.0.3',
  'object-inspect@1.13.4',
  'prettier@3.9.6',
  'pure-rand@7.0.1',
  'resolve-pkg-maps@1.0.0',
  'safe-stable-stringify@2.5.0',
  'spacetimedb@2.6.1',
  'statuses@2.0.2',
  'tsx@4.20.6',
  'typescript@5.6.3',
  'url-polyfill@1.1.14',
]);
const EXPECTED_EDGES = Object.freeze<Record<string, readonly string[]>>({
  '@esbuild/darwin-arm64@0.25.12': [],
  'base64-js@1.5.1': [],
  'esbuild@0.25.12': ['@esbuild/darwin-arm64@0.25.12'],
  'fsevents@2.3.3': [],
  'get-tsconfig@4.14.3': ['resolve-pkg-maps@1.0.0'],
  'headers-polyfill@4.0.3': [],
  'object-inspect@1.13.4': [],
  'prettier@3.9.6': [],
  'pure-rand@7.0.1': [],
  'resolve-pkg-maps@1.0.0': [],
  'safe-stable-stringify@2.5.0': [],
  'spacetimedb@2.6.1': [
    'base64-js@1.5.1', 'headers-polyfill@4.0.3', 'object-inspect@1.13.4',
    'prettier@3.9.6', 'pure-rand@7.0.1', 'safe-stable-stringify@2.5.0',
    'statuses@2.0.2', 'url-polyfill@1.1.14',
  ],
  'statuses@2.0.2': [],
  'tsx@4.20.6': ['esbuild@0.25.12', 'fsevents@2.3.3', 'get-tsconfig@4.14.3'],
  'typescript@5.6.3': [],
  'url-polyfill@1.1.14': [],
});
const temporaryDirectories: string[] = [];

beforeEach(() => {
  boundary.cleanupFailure = false;
  boundary.finishFailure = false;
  boundary.stageFailure = false;
  boundary.writeFailure = false;
  boundary.retainedRoots.length = 0;
});

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function privateDirectory(label: string): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), label)));
  chmodSync(root, 0o700);
  temporaryDirectories.push(root);
  return root;
}

function tarHeader(
  path: string,
  kind: 'directory' | 'file' | 'symlink',
  size: number,
): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, 'utf8');
  header.write(`${(kind === 'directory' ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = kind === 'directory' ? 0x35 : kind === 'file' ? 0x30 : 0x32;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((total, value) => total + value, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function packageArchive(
  name: string,
  version: string,
  corrupt?: 'path' | 'link',
): Buffer {
  if (corrupt === 'path') {
    return gzipSync(Buffer.concat([
      tarHeader('package/../escape', 'file', 1), Buffer.from('x'), Buffer.alloc(511),
      Buffer.alloc(1_024),
    ]));
  }
  if (corrupt === 'link') {
    return gzipSync(Buffer.concat([
      tarHeader('package/link', 'symlink', 0), Buffer.alloc(1_024),
    ]));
  }
  const files = new Map<string, Buffer>([
    ['package.json', Buffer.from(`${JSON.stringify({ name, version })}\n`)],
  ]);
  if (name === 'esbuild') files.set('bin/esbuild', Buffer.from('#!/bin/sh\n'));
  if (name === 'tsx') files.set('dist/cli.mjs', Buffer.from('export {};\n'));
  if (name === 'typescript') {
    files.set('bin/tsc', Buffer.from('#!/bin/sh\n'));
    files.set('bin/tsserver', Buffer.from('#!/bin/sh\n'));
  }
  const directories = new Set<string>(['package']);
  for (const path of files.keys()) {
    const components = path.split('/');
    for (let index = 1; index < components.length; index += 1) {
      directories.add(`package/${components.slice(0, index).join('/')}`);
    }
  }
  const blocks: Buffer[] = [];
  for (const path of [...directories].sort()) {
    blocks.push(tarHeader(`${path}/`, 'directory', 0));
  }
  for (const [path, body] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    blocks.push(tarHeader(`package/${path}`, 'file', body.byteLength), body);
    if (body.byteLength % 512 !== 0) blocks.push(Buffer.alloc(512 - (body.byteLength % 512)));
  }
  blocks.push(Buffer.alloc(1_024));
  return gzipSync(Buffer.concat(blocks));
}

function packageNameAndVersion(key: string): readonly [string, string] {
  const separator = key.lastIndexOf('@');
  return [key.slice(0, separator), key.slice(separator + 1)];
}

type Fixture = Readonly<{
  repositoryRoot: string;
  dependencyCacheRoot: string;
  materializationParent: string;
  sourceCommit: string;
  lock: Record<string, any>;
  archives: ReadonlyMap<string, string>;
}>;

function fixture(input: Readonly<{
  manifest?: Readonly<Record<string, unknown>>;
  mutateLock?: (lock: Record<string, any>) => void;
  archiveOverride?: Readonly<{ key: string; name?: string; version?: string; corrupt?: 'path' | 'link' }>;
  lockIndent?: number;
}> = {}): Fixture {
  const repositoryRoot = privateDirectory('warpkeep-ptr-source-fixture-');
  const dependencyCacheRoot = privateDirectory('warpkeep-ptr-cache-fixture-');
  const materializationParent = privateDirectory('warpkeep-ptr-state-fixture-');
  const ptrRoot = join(repositoryRoot, 'spacetimedb', 'ptr');
  mkdirSync(ptrRoot, { recursive: true, mode: 0o700 });
  const manifest = input.manifest ?? {
    name: 'warpkeep-ptr-spacetimedb-module',
    version: '0.4.0-ptr.1',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    description: 'fixture',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: {
      esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3',
    },
  };
  writeFileSync(join(ptrRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const lock = parse(readFileSync(resolve('spacetimedb/ptr/pnpm-lock.yaml'), 'utf8')) as Record<string, any>;
  const archives = new Map<string, string>();
  for (const key of SELECTED_PACKAGE_KEYS) {
    const [expectedName, expectedVersion] = packageNameAndVersion(key);
    const override = input.archiveOverride?.key === key ? input.archiveOverride : undefined;
    const archive = packageArchive(
      override?.name ?? expectedName,
      override?.version ?? expectedVersion,
      override?.corrupt,
    );
    const digest = createHash('sha512').update(archive).digest('hex');
    lock.packages[key].resolution.integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;
    const path = join(
      dependencyCacheRoot, '_cacache', 'content-v2', 'sha512',
      digest.slice(0, 2), digest.slice(2, 4), digest.slice(4),
    );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, archive, { mode: 0o600 });
    archives.set(key, path);
  }
  input.mutateLock?.(lock);
  writeFileSync(join(ptrRoot, 'pnpm-lock.yaml'), stringify(lock, {
    indent: input.lockIndent ?? 2,
  }), { mode: 0o600 });
  writeFileSync(join(repositoryRoot, 'spacetimedb', 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: {
      esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3',
    },
  }), { mode: 0o600 });
  writeFileSync(join(repositoryRoot, 'spacetimedb', 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', { mode: 0o600 });
  return Object.freeze({
    repositoryRoot,
    dependencyCacheRoot,
    materializationParent,
    sourceCommit: 'a'.repeat(40),
    lock,
    archives,
  });
}

function runFixture(value: Fixture, operation?: (root: string, digest: string) => unknown) {
  return withPtrLockedSourceBuild({
    repositoryRoot: value.repositoryRoot,
    moduleSourceCommit: value.sourceCommit,
    dependencyCacheRoot: value.dependencyCacheRoot,
    materializationParent: value.materializationParent,
    operation: ({ materializedRoot, dependencyClosureDigest }) => {
      const result = operation?.(materializedRoot, dependencyClosureDigest) ?? 'built';
      const dist = join(materializedRoot, 'spacetimedb', 'ptr', 'dist');
      if (!existsSync(dist)) mkdirSync(dist, { mode: 0o700 });
      const bundle = join(dist, 'bundle.js');
      if (!existsSync(bundle)) writeFileSync(bundle, 'bundle', { mode: 0o600 });
      return result;
    },
  });
}

function thrownMessages(operation: () => unknown): readonly string[] {
  let thrown: unknown;
  try { operation(); } catch (error) { thrown = error; }
  if (thrown === undefined) throw new Error('TEST_EXPECTED_FAILURE');
  const messages: string[] = [];
  const visit = (error: unknown) => {
    if (error instanceof Error) messages.push(error.message);
    if (error instanceof AggregateError) for (const cause of error.errors) visit(cause);
  };
  visit(thrown);
  return messages;
}

function independentlyExpectedClosureDigest(root: string, domain: string): string {
  const ptrRoot = join(root, 'spacetimedb', 'ptr');
  const manifest = readFileSync(join(ptrRoot, 'package.json'));
  const lock = readFileSync(join(ptrRoot, 'pnpm-lock.yaml'));
  const parsed = parse(lock.toString('utf8')) as {
    packages: Record<string, { resolution: { integrity: string } }>;
  };
  const snapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
    root: join(ptrRoot, 'node_modules'),
    boundary: ptrRoot,
  });
  const digest = createHash('sha256');
  const framed = (label: string, value: string | Buffer) => {
    const labelBytes = Buffer.from(label);
    const valueBytes = typeof value === 'string' ? Buffer.from(value) : value;
    const lengths = Buffer.alloc(16);
    lengths.writeBigUInt64BE(BigInt(labelBytes.byteLength), 0);
    lengths.writeBigUInt64BE(BigInt(valueBytes.byteLength), 8);
    digest.update(lengths.subarray(0, 8)).update(labelBytes)
      .update(lengths.subarray(8)).update(valueBytes);
  };
  framed('domain', domain);
  framed('manifest-path', 'spacetimedb/ptr/package.json');
  framed('manifest-bytes', manifest);
  framed('lock-path', 'spacetimedb/ptr/pnpm-lock.yaml');
  framed('lock-bytes', lock);
  for (const key of SELECTED_PACKAGE_KEYS) {
    framed('package-key', key);
    framed('package-integrity', parsed.packages[key]!.resolution.integrity);
    framed('package-edges', JSON.stringify(EXPECTED_EDGES[key]));
  }
  framed('installed-content-profile', 'spacetimedb/ptr/node_modules');
  framed('installed-content-sha256', snapshot.contentDigest);
  framed('installed-entry-count', String(snapshot.entries.size));
  return digest.digest('hex');
}

describe('independent PTR locked-source build', () => {
  it('snapshots stateful input fields exactly once before materialization', () => {
    const value = fixture();
    const reads = new Map<string, number>();
    const once = <T>(name: string, first: T, later: T) => () => {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      return count === 1 ? first : later;
    };
    const input = Object.defineProperties({}, {
      repositoryRoot: { enumerable: true, get: once('repositoryRoot', value.repositoryRoot, 'invalid') },
      moduleSourceCommit: { enumerable: true, get: once('moduleSourceCommit', value.sourceCommit, 'invalid') },
      dependencyCacheRoot: { enumerable: true, get: once('dependencyCacheRoot', value.dependencyCacheRoot, 'invalid') },
      materializationParent: { enumerable: true, get: once('materializationParent', value.materializationParent, 'invalid') },
      operation: { enumerable: true, get: once('operation', ({ materializedRoot }: { materializedRoot: string }) => {
        const dist = join(materializedRoot, 'spacetimedb', 'ptr', 'dist');
        mkdirSync(dist, { mode: 0o700 });
        writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
        return 'snapshotted';
      }, () => { throw new Error('STATEFUL_INPUT_REREAD'); }) },
    });
    expect(withPtrLockedSourceBuild(input as never).result).toBe('snapshotted');
    expect(Object.fromEntries(reads)).toEqual({
      repositoryRoot: 1,
      moduleSourceCommit: 1,
      dependencyCacheRoot: 1,
      materializationParent: 1,
      operation: 1,
    });
  });

  it('installs the exact PTR-only Darwin ARM64 closure and cleans it after the callback', () => {
    const value = fixture();
    let builtRoot = '';
    const output = runFixture(value, root => {
      builtRoot = root;
      const nodeModules = join(root, 'spacetimedb', 'ptr', 'node_modules');
      expect(readdirSync(nodeModules).sort()).toEqual([
        '.bin', '.pnpm', 'esbuild', 'spacetimedb', 'tsx', 'typescript',
      ]);
      expect(readdirSync(join(nodeModules, '.pnpm')).sort()).toEqual([
        ...SELECTED_PACKAGE_KEYS.map(key => key.replace('/', '+')),
        'lock.yaml',
      ].sort());
      expect(existsSync(join(root, 'spacetimedb', 'node_modules'))).toBe(false);
      expect(existsSync(join(root, 'spacetimedb', 'genesis002', 'node_modules'))).toBe(false);
      expect(existsSync(join(root, 'spacetimedb', 'migration-fixtures', 'production-v1', 'node_modules'))).toBe(false);
      return 'built';
    });
    expect(output).toEqual({
      result: 'built',
      dependencyClosureDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      moduleTreeId: 'b'.repeat(40),
    });
    expect(existsSync(builtRoot)).toBe(false);
  });

  it('never falls back to a valid root lock or manifest', () => {
    for (const mutation of ['missing-lock', 'invalid-lock', 'missing-manifest'] as const) {
      const value = fixture();
      const ptrRoot = join(value.repositoryRoot, 'spacetimedb', 'ptr');
      if (mutation === 'missing-lock') rmSync(join(ptrRoot, 'pnpm-lock.yaml'));
      if (mutation === 'invalid-lock') writeFileSync(join(ptrRoot, 'pnpm-lock.yaml'), 'not: [valid');
      if (mutation === 'missing-manifest') rmSync(join(ptrRoot, 'package.json'));
      let operationCalled = false;
      const messages = thrownMessages(() => runFixture(value, () => { operationCalled = true; }));
      expect(messages, mutation).toContain(mutation === 'missing-manifest'
        ? 'PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID'
        : 'PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
      expect(operationCalled, mutation).toBe(false);
    }
  });

  it.each([
    ['extra importer', (lock: Record<string, any>) => { lock.importers.foreign = lock.importers['.']; }],
    ['importer mismatch', (lock: Record<string, any>) => { lock.importers['.'].dependencies.spacetimedb.version = '2.6.0'; }],
    ['transitive mismatch', (lock: Record<string, any>) => { lock.snapshots['spacetimedb@2.6.1'].dependencies['base64-js'] = '1.5.0'; }],
    ['foreign platform', (lock: Record<string, any>) => { lock.packages['@esbuild/darwin-arm64@0.25.12'].os = ['linux']; }],
    ['dependency alias', (lock: Record<string, any>) => { lock.snapshots['spacetimedb@2.6.1'].dependencies['base64-js'] = 'npm:base64-js@1.5.1'; }],
    ['invalid integrity', (lock: Record<string, any>) => { lock.packages['typescript@5.6.3'].resolution.integrity = 'sha512-not-canonical'; }],
  ])('rejects %s in the PTR lock graph', (_label, mutateLock) => {
    let operationCalled = false;
    const messages = thrownMessages(() => runFixture(
      fixture({ mutateLock }),
      () => { operationCalled = true; },
    ));
    expect(messages).toContain('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    expect(operationCalled).toBe(false);
  });

  it('rejects manifest dependency sections and lifecycle hooks', () => {
    const base = {
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.7.0',
      dependencies: { spacetimedb: '2.6.1' },
      devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
    };
    expect(thrownMessages(() => runFixture(fixture({
      manifest: { ...base, optionalDependencies: {} },
    })))).toContain('PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID');
    expect(thrownMessages(() => runFixture(fixture({
      manifest: { ...base, scripts: { postinstall: 'echo unsafe' } },
    })))).toContain('PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID');
  });

  it('rejects changed cache bytes before and during the callback', () => {
    const before = fixture();
    writeFileSync(before.archives.get('typescript@5.6.3')!, 'changed');
    expect(thrownMessages(() => runFixture(before)))
      .toContain('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
    const during = fixture();
    expect(thrownMessages(() => runFixture(during, () => {
      writeFileSync(during.archives.get('typescript@5.6.3')!, 'changed');
    }))).toContain('PTR_LOCKED_SOURCE_BUILD_CACHE_CHANGED');
  });

  it.each([
    ['wrong name', { key: 'typescript@5.6.3', name: 'not-typescript' }],
    ['wrong version', { key: 'typescript@5.6.3', version: '5.6.2' }],
    ['unsafe path', { key: 'typescript@5.6.3', corrupt: 'path' as const }],
    ['archive link', { key: 'typescript@5.6.3', corrupt: 'link' as const }],
  ])('rejects an archive with %s', (_label, archiveOverride) => {
    const messages = thrownMessages(() => runFixture(fixture({ archiveOverride })));
    expect(messages.some(message => [
      'PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID',
      'GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID',
    ].includes(message))).toBe(true);
  });

  it('returns a deterministic content digest that binds manifest and lock bytes', () => {
    let independentlyDerived = '';
    const first = runFixture(fixture(), (root, digest) => {
      independentlyDerived = independentlyExpectedClosureDigest(
        root,
        'warpkeep-ptr-independent-dependency-closure-v1',
      );
      expect(digest).not.toBe(independentlyExpectedClosureDigest(
        root,
        'warpkeep-genesis-001-historical-root-dependency-closure-v1',
      ));
    }).dependencyClosureDigest;
    const second = runFixture(fixture()).dependencyClosureDigest;
    const changedManifest = runFixture(fixture({ manifest: {
      name: 'warpkeep-ptr-spacetimedb-module',
      version: '0.4.0-ptr.1',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.7.0',
      description: 'different but valid metadata',
      dependencies: { spacetimedb: '2.6.1' },
      devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
    } })).dependencyClosureDigest;
    const changedLockBytes = runFixture(fixture({ lockIndent: 4 })).dependencyClosureDigest;
    expect(first).toBe(independentlyDerived);
    expect(first).toBe(second);
    expect(first).not.toBe(changedManifest);
    expect(first).not.toBe(changedLockBytes);
  });

  it.each([
    ['dependency mutation', (root: string) => writeFileSync(join(
      root, 'spacetimedb', 'ptr', 'node_modules', '.pnpm',
      'typescript@5.6.3', 'node_modules', 'typescript', 'changed.js',
    ), 'changed')],
    ['source mutation', (root: string) => writeFileSync(join(root, 'spacetimedb', 'ptr', 'package.json'), '{}')],
    ['extra output', (root: string) => {
      const dist = join(root, 'spacetimedb', 'ptr', 'dist');
      mkdirSync(dist, { mode: 0o700 });
      writeFileSync(join(dist, 'other.js'), 'other');
    }],
  ])('retains the owned materialization on %s', (_label, mutation) => {
    const messages = thrownMessages(() => runFixture(fixture(), root => mutation(root)));
    expect(messages.some(message => (
      message.includes('DEPENDENCY_TREE')
      || message === 'PTR_LOCKED_SOURCE_BUILD_DEPENDENCY_CHANGED'
      || message === 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED'
      || message.startsWith('MOCK_UNTRACKED_PATH:')
    )), `${_label}: ${messages.join(', ')}`).toBe(true);
    expect(boundary.retainedRoots).toHaveLength(1);
    expect(existsSync(boundary.retainedRoots[0]!)).toBe(true);
  });

  it('rejects callback exceptions and thenables without successful cleanup', () => {
    expect(thrownMessages(() => runFixture(
      fixture(),
      () => { throw new Error('callback failed'); },
    ))).toContain('callback failed');
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
    expect(thrownMessages(() => runFixture(fixture(), () => Promise.resolve('unfinished'))))
      .toContain('PTR_LOCKED_SOURCE_BUILD_OPERATION_THENABLE');
    expect(existsSync(boundary.retainedRoots.at(-1)!)).toBe(true);
  });

  it.each(['stageFailure', 'writeFailure', 'finishFailure', 'cleanupFailure'] as const)(
    'surfaces %s without claiming success',
    failure => {
      boundary[failure] = true;
      const messages = thrownMessages(() => runFixture(fixture()));
      expect(messages).toContain({
        stageFailure: 'MOCK_WRITER_STAGE_FAILED',
        writeFailure: 'MOCK_WRITER_WRITE_FAILED',
        finishFailure: 'MOCK_WRITER_FINISH_FAILED',
        cleanupFailure: 'MOCK_MATERIALIZATION_CLEANUP_FAILED',
      }[failure]);
    },
  );

  it('accepts only the exact bundle output and no generatedFiles authority', () => {
    const value = fixture();
    expect(thrownMessages(() => withPtrLockedSourceBuild({
      repositoryRoot: value.repositoryRoot,
      moduleSourceCommit: value.sourceCommit,
      dependencyCacheRoot: value.dependencyCacheRoot,
      materializationParent: value.materializationParent,
      generatedFiles: ['spacetimedb/ptr/dist/other.js'],
      operation: () => 'built',
    } as never))).toContain('PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID');

    const messages = thrownMessages(() => runFixture(fixture(), root => {
      const dist = join(root, 'spacetimedb', 'ptr', 'dist');
      mkdirSync(dist, { mode: 0o700 });
      const bundle = join(dist, 'bundle.js');
      writeFileSync(bundle, 'bundle');
      linkSync(bundle, join(dist, 'bundle-hardlink.js'));
    }));
    expect(messages.some(message => (
      message === 'PTR_LOCKED_SOURCE_BUILD_OUTPUT_INVALID'
      || message.startsWith('MOCK_UNTRACKED_PATH:')
    ))).toBe(true);
  });
});
