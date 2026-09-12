import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';

import { greaterRealmImmutableArtifactTestSeams } from '../../scripts/greater-realm-production-immutable-artifact';
import { createLockedSourceBuildPackageArchive } from './lockedSourceBuildArchiveFixture';

export const DARWIN_PACKAGE_KEYS = Object.freeze([
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

export const LINUX_PACKAGE_KEYS = Object.freeze([
  '@esbuild/linux-x64@0.25.12',
  'base64-js@1.5.1',
  'esbuild@0.25.12',
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

const SHARED_EDGES = Object.freeze<Record<string, readonly string[]>>({
  'base64-js@1.5.1': [],
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
  'typescript@5.6.3': [],
  'url-polyfill@1.1.14': [],
});

export const DARWIN_EDGES = Object.freeze<Record<string, readonly string[]>>({
  ...SHARED_EDGES,
  '@esbuild/darwin-arm64@0.25.12': [],
  'esbuild@0.25.12': ['@esbuild/darwin-arm64@0.25.12'],
  'fsevents@2.3.3': [],
  'tsx@4.20.6': ['esbuild@0.25.12', 'fsevents@2.3.3', 'get-tsconfig@4.14.3'],
});

export const LINUX_EDGES = Object.freeze<Record<string, readonly string[]>>({
  ...SHARED_EDGES,
  '@esbuild/linux-x64@0.25.12': [],
  'esbuild@0.25.12': ['@esbuild/linux-x64@0.25.12'],
  'tsx@4.20.6': ['esbuild@0.25.12', 'get-tsconfig@4.14.3'],
});

export const TOP_LEVEL_PACKAGES = Object.freeze({
  esbuild: 'esbuild@0.25.12',
  spacetimedb: 'spacetimedb@2.6.1',
  tsx: 'tsx@4.20.6',
  typescript: 'typescript@5.6.3',
});

export type PtrFixture = Readonly<{
  repositoryRoot: string;
  dependencyCacheRoot: string;
  materializationParent: string;
  sourceCommit: string;
  lock: Record<string, any>;
  archives: ReadonlyMap<string, string>;
  cleanupRoots: readonly string[];
}>;

function privateDirectory(label: string): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), label)));
  chmodSync(root, 0o700);
  return root;
}

export function packageNameAndVersion(key: string): readonly [string, string] {
  const separator = key.lastIndexOf('@');
  return [key.slice(0, separator), key.slice(separator + 1)];
}

export function createPtrFixture(input: Readonly<{
  keys: readonly string[];
  manifest?: Readonly<Record<string, unknown>>;
  mutateLock?: (lock: Record<string, any>) => void;
  archiveOverride?: Readonly<{
    key: string;
    name?: string;
    version?: string;
    corrupt?: 'path' | 'link';
  }>;
  lockIndent?: number;
}>): PtrFixture {
  const repositoryRoot = privateDirectory('warpkeep-ptr-source-fixture-');
  const dependencyCacheRoot = privateDirectory('warpkeep-ptr-cache-fixture-');
  const materializationParent = privateDirectory('warpkeep-ptr-state-fixture-');
  const ptrRoot = join(repositoryRoot, 'spacetimedb', 'ptr');
  mkdirSync(ptrRoot, { recursive: true, mode: 0o700 });
  for (const path of [join(repositoryRoot, 'spacetimedb'), ptrRoot]) chmodSync(path, 0o700);
  const manifest = input.manifest ?? {
    name: 'warpkeep-ptr-spacetimedb-module',
    version: '0.4.0-ptr.1',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    description: 'fixed-profile fixture',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
  };
  writeFileSync(join(ptrRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const lock = parse(readFileSync(resolve('spacetimedb/ptr/pnpm-lock.yaml'), 'utf8')) as Record<string, any>;
  const archives = new Map<string, string>();
  for (const key of input.keys) {
    const [expectedName, expectedVersion] = packageNameAndVersion(key);
    const override = input.archiveOverride?.key === key ? input.archiveOverride : undefined;
    const archive = createLockedSourceBuildPackageArchive({
      name: override?.name ?? expectedName,
      version: override?.version ?? expectedVersion,
      corrupt: override?.corrupt,
    });
    const digest = createHash('sha512').update(archive).digest('hex');
    lock.packages[key].resolution.integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;
    const path = join(dependencyCacheRoot, '_cacache', 'content-v2', 'sha512',
      digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
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
    dependencies: { spacetimedb: '2.6.1' },
  }), { mode: 0o600 });
  writeFileSync(join(repositoryRoot, 'spacetimedb', 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', {
    mode: 0o600,
  });
  return Object.freeze({
    repositoryRoot,
    dependencyCacheRoot,
    materializationParent,
    sourceCommit: 'a'.repeat(40),
    lock,
    archives,
    cleanupRoots: Object.freeze([repositoryRoot, dependencyCacheRoot, materializationParent]),
  });
}

export function installedSymlinks(root: string): readonly string[] {
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

export function expectedSymlinks(edges: Readonly<Record<string, readonly string[]>>): readonly string[] {
  const links = [...Object.keys(TOP_LEVEL_PACKAGES).map(name => name),
    '.bin/esbuild', '.bin/tsc', '.bin/tsserver', '.bin/tsx'];
  for (const [key, dependencies] of Object.entries(edges)) {
    for (const dependencyKey of dependencies) {
      const [dependencyName] = packageNameAndVersion(dependencyKey);
      links.push(`.pnpm/${key.replace('/', '+')}/node_modules/${dependencyName}`);
    }
  }
  return Object.freeze(links.sort());
}

export function independentlyExpectedClosureDigest(input: Readonly<{
  root: string;
  domain: string;
  keys: readonly string[];
  edges: Readonly<Record<string, readonly string[]>>;
}>): string {
  const ptrRoot = join(input.root, 'spacetimedb', 'ptr');
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
  framed('domain', input.domain);
  framed('manifest-path', 'spacetimedb/ptr/package.json');
  framed('manifest-bytes', manifest);
  framed('lock-path', 'spacetimedb/ptr/pnpm-lock.yaml');
  framed('lock-bytes', lock);
  for (const key of input.keys) {
    framed('package-key', key);
    framed('package-integrity', parsed.packages[key]!.resolution.integrity);
    framed('package-edges', JSON.stringify(input.edges[key]));
  }
  framed('installed-content-profile', 'spacetimedb/ptr/node_modules');
  framed('installed-content-sha256', snapshot.contentDigest);
  framed('installed-entry-count', String(snapshot.entries.size));
  return digest.digest('hex');
}
