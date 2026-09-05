// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

const materializations = vi.hoisted(() => ({ roots: [] as string[] }));

vi.mock('../scripts/greater-realm-production-provenance', async () => {
  const crypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  const walk = (root: string): Map<string, string> => {
    const entries = new Map<string, string>();
    const visit = (candidate: string) => {
      const status = fs.lstatSync(candidate);
      const logical = path.relative(root, candidate).split(path.sep).join('/');
      const value = status.isFile()
        ? crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex')
        : status.isDirectory() ? 'directory' : fs.readlinkSync(candidate);
      entries.set(logical, `${status.mode & 0o7777}:${status.size}:${value}`);
      if (status.isDirectory()) {
        for (const name of fs.readdirSync(candidate).sort()) visit(path.join(candidate, name));
      }
    };
    visit(root);
    return entries;
  };
  return {
    createGreaterRealmProductionCommitMaterialization(input: Readonly<{
      repositoryRoot: string;
      moduleSourceCommit: string;
      destination: string;
    }>) {
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      // The real commit materializer creates every directory through the
      // descriptor writer at 0700. cpSync does not provide that contract
      // consistently, so the synthetic materializer must reproduce it.
      const makeDirectoriesPrivate = (candidate: string) => {
        const status = fs.lstatSync(candidate);
        if (!status.isDirectory()) return;
        fs.chmodSync(candidate, 0o700);
        for (const name of fs.readdirSync(candidate)) {
          makeDirectoriesPrivate(path.join(candidate, name));
        }
      };
      makeDirectoriesPrivate(input.destination);
      materializations.roots.push(input.destination);
      const tracked = walk(input.destination);
      let cleaned = false;
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify(allowed?: Readonly<{ prefixes?: readonly string[]; files?: readonly string[] }>) {
          const current = walk(input.destination);
          for (const [logical, identity] of tracked) {
            if (current.get(logical) !== identity) throw new Error('NATIVE_FIXTURE_TRACKED_SOURCE_CHANGED');
          }
          const prefixes = allowed?.prefixes ?? [];
          const files = allowed?.files ?? [];
          for (const logical of current.keys()) {
            if (tracked.has(logical) || logical === '') continue;
            if (files.includes(logical) || files.some(file => file.startsWith(`${logical}/`))
              || prefixes.some(prefix => (
                logical === prefix.slice(0, -1) || logical.startsWith(prefix)
              ))) continue;
            throw new Error(`NATIVE_FIXTURE_UNTRACKED_PATH:${logical}`);
          }
        },
        cleanup() {
          if (!cleaned) fs.rmSync(input.destination, { recursive: true, force: false });
          cleaned = true;
        },
      });
    },
  };
});

// Deliberately do not mock greater-realm-openat: this suite proves the staged
// Python writer creates native links through its descriptor-relative boundary.
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
const TOP_LEVEL_PACKAGES = Object.freeze({
  esbuild: 'esbuild@0.25.12',
  spacetimedb: 'spacetimedb@2.6.1',
  tsx: 'tsx@4.20.6',
  typescript: 'typescript@5.6.3',
});
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
  materializations.roots.length = 0;
});

function privateDirectory(label: string): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), label)));
  chmodSync(root, 0o700);
  temporaryDirectories.push(root);
  return root;
}

function tarHeader(path: string, kind: 'directory' | 'file', size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, 'utf8');
  header.write(`${(kind === 'directory' ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = kind === 'directory' ? 0x35 : 0x30;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((total, value) => total + value, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function packageArchive(name: string, version: string): Buffer {
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
  for (const path of [...directories].sort()) blocks.push(tarHeader(`${path}/`, 'directory', 0));
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

function fixture(): Readonly<{
  repositoryRoot: string;
  dependencyCacheRoot: string;
  materializationParent: string;
}> {
  const repositoryRoot = privateDirectory('warpkeep-ptr-native-source-');
  const dependencyCacheRoot = privateDirectory('warpkeep-ptr-native-cache-');
  const materializationParent = privateDirectory('warpkeep-ptr-native-state-');
  const ptrRoot = join(repositoryRoot, 'spacetimedb', 'ptr');
  mkdirSync(ptrRoot, { recursive: true, mode: 0o700 });
  writeFileSync(join(ptrRoot, 'package.json'), `${JSON.stringify({
    name: 'warpkeep-ptr-spacetimedb-module',
    version: '0.4.0-ptr.1',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    description: 'native writer fixture',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
  }, null, 2)}\n`, { mode: 0o600 });
  const lock = parse(readFileSync(resolve('spacetimedb/ptr/pnpm-lock.yaml'), 'utf8')) as Record<string, any>;
  for (const key of SELECTED_PACKAGE_KEYS) {
    const [name, version] = packageNameAndVersion(key);
    const archive = packageArchive(name, version);
    const digest = createHash('sha512').update(archive).digest('hex');
    lock.packages[key].resolution.integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;
    const path = join(dependencyCacheRoot, '_cacache', 'content-v2', 'sha512',
      digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, archive, { mode: 0o600 });
  }
  writeFileSync(join(ptrRoot, 'pnpm-lock.yaml'), stringify(lock, { indent: 2 }), { mode: 0o600 });
  return Object.freeze({ repositoryRoot, dependencyCacheRoot, materializationParent });
}

function inside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (difference !== '..'
    && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function installedSymlinks(root: string): readonly string[] {
  const links: string[] = [];
  const visit = (candidate: string) => {
    const status = lstatSync(candidate);
    if (status.isSymbolicLink()) {
      links.push(relative(root, candidate).split(sep).join('/'));
      return;
    }
    if (status.isDirectory()) {
      for (const name of readdirSync(candidate).sort()) visit(join(candidate, name));
    }
  };
  visit(root);
  return Object.freeze(links.sort());
}

function expectedSymlinks(): readonly string[] {
  const links: string[] = [];
  for (const [name] of Object.entries(TOP_LEVEL_PACKAGES)) links.push(name);
  links.push('.bin/esbuild', '.bin/tsc', '.bin/tsserver', '.bin/tsx');
  for (const [key, edges] of Object.entries(EXPECTED_EDGES)) {
    for (const dependencyKey of edges) {
      const [dependencyName] = packageNameAndVersion(dependencyKey);
      links.push(`.pnpm/${key.replace('/', '+')}/node_modules/${dependencyName}`);
    }
  }
  return Object.freeze(links.sort());
}

function independentlyExpectedClosureDigest(root: string): string {
  const ptrRoot = join(root, 'spacetimedb', 'ptr');
  const manifest = readFileSync(join(ptrRoot, 'package.json'));
  const lock = readFileSync(join(ptrRoot, 'pnpm-lock.yaml'));
  const parsed = parse(lock.toString('utf8')) as {
    packages: Record<string, { resolution: { integrity: string } }>;
  };
  const snapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
    root: join(ptrRoot, 'node_modules'), boundary: ptrRoot,
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
  framed('domain', 'warpkeep-ptr-independent-dependency-closure-v1');
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

describe('independent PTR locked-source build native writer', () => {
  // Windows cannot prove native POSIX modes or create these relative package
  // links without developer privileges. Linux runs this test without emulation.
  it.skipIf(process.platform !== 'linux')(
    'creates the exact contained symlink layout, attests provenance, and cleans up',
    () => {
      const value = fixture();
      let materializedRoot = '';
      let independentlyDerived = '';
      const output = withPtrLockedSourceBuild({
        repositoryRoot: value.repositoryRoot,
        moduleSourceCommit: 'a'.repeat(40),
        dependencyCacheRoot: value.dependencyCacheRoot,
        materializationParent: value.materializationParent,
        operation: context => {
          materializedRoot = context.materializedRoot;
          const ptrRoot = join(materializedRoot, 'spacetimedb', 'ptr');
          const nodeModules = join(ptrRoot, 'node_modules');
          for (const path of [materializedRoot, ptrRoot, nodeModules,
            join(nodeModules, '.bin'), join(nodeModules, '.pnpm')]) {
            expect(lstatSync(path).mode & 0o7777, path).toBe(0o700);
          }
          expect(lstatSync(join(nodeModules, '.pnpm', 'lock.yaml')).mode & 0o7777).toBe(0o600);
          expect(readdirSync(nodeModules).sort()).toEqual([
            '.bin', '.pnpm', ...Object.keys(TOP_LEVEL_PACKAGES),
          ].sort());
          expect(readdirSync(join(nodeModules, '.pnpm')).sort()).toEqual([
            ...SELECTED_PACKAGE_KEYS.map(key => key.replace('/', '+')), 'lock.yaml',
          ].sort());
          const links = installedSymlinks(nodeModules);
          expect(links).toEqual(expectedSymlinks());
          for (const logical of links) {
            const path = join(nodeModules, ...logical.split('/'));
            expect(lstatSync(path).isSymbolicLink(), logical).toBe(true);
            expect(isAbsolute(readlinkSync(path)), logical).toBe(false);
            expect(inside(ptrRoot, resolve(dirname(path), readlinkSync(path))), logical).toBe(true);
            expect(inside(ptrRoot, realpathSync(path)), logical).toBe(true);
          }
          independentlyDerived = independentlyExpectedClosureDigest(materializedRoot);
          const dist = join(ptrRoot, 'dist');
          mkdirSync(dist, { mode: 0o700 });
          writeFileSync(join(dist, 'bundle.js'), 'bundle', { mode: 0o600 });
          return 'native-built';
        },
      });
      expect(output).toEqual({
        result: 'native-built',
        dependencyClosureDigest: independentlyDerived,
        moduleTreeId: 'b'.repeat(40),
      });
      expect(materializations.roots).toEqual([materializedRoot]);
      expect(existsSync(materializedRoot)).toBe(false);
    },
  );
});
