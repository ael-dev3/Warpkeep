import { spawnSync } from 'node:child_process';
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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';

import { greaterRealmImmutableArtifactTestSeams } from '../../scripts/greater-realm-production-immutable-artifact';
import { createLockedSourceBuildPackageArchive } from './lockedSourceBuildArchiveFixture';

export const GENESIS002_PACKAGE_KEYS = Object.freeze([
  '@esbuild/linux-x64@0.25.12',
  'base64-js@1.5.1',
  'esbuild@0.25.12',
  'get-tsconfig@4.14.0',
  'headers-polyfill@4.0.3',
  'object-inspect@1.13.4',
  'prettier@3.9.5',
  'pure-rand@7.0.1',
  'resolve-pkg-maps@1.0.0',
  'safe-stable-stringify@2.5.0',
  'spacetimedb@2.6.1',
  'statuses@2.0.2',
  'tsx@4.20.6',
  'typescript@5.6.3',
  'url-polyfill@1.1.14',
]);

export const GENESIS002_EDGES = Object.freeze<Record<string, readonly string[]>>({
  '@esbuild/linux-x64@0.25.12': Object.freeze([]),
  'base64-js@1.5.1': Object.freeze([]),
  'esbuild@0.25.12': Object.freeze(['@esbuild/linux-x64@0.25.12']),
  'get-tsconfig@4.14.0': Object.freeze(['resolve-pkg-maps@1.0.0']),
  'headers-polyfill@4.0.3': Object.freeze([]),
  'object-inspect@1.13.4': Object.freeze([]),
  'prettier@3.9.5': Object.freeze([]),
  'pure-rand@7.0.1': Object.freeze([]),
  'resolve-pkg-maps@1.0.0': Object.freeze([]),
  'safe-stable-stringify@2.5.0': Object.freeze([]),
  'spacetimedb@2.6.1': Object.freeze([
    'base64-js@1.5.1',
    'headers-polyfill@4.0.3',
    'object-inspect@1.13.4',
    'prettier@3.9.5',
    'pure-rand@7.0.1',
    'safe-stable-stringify@2.5.0',
    'statuses@2.0.2',
    'url-polyfill@1.1.14',
  ]),
  'statuses@2.0.2': Object.freeze([]),
  'tsx@4.20.6': Object.freeze(['esbuild@0.25.12', 'get-tsconfig@4.14.0']),
  'typescript@5.6.3': Object.freeze([]),
  'url-polyfill@1.1.14': Object.freeze([]),
});

export const GENESIS002_TOP_LEVEL = Object.freeze({
  esbuild: 'esbuild@0.25.12',
  spacetimedb: 'spacetimedb@2.6.1',
  tsx: 'tsx@4.20.6',
  typescript: 'typescript@5.6.3',
});

export const GENESIS002_IMPORTERS = Object.freeze([
  '.',
  'genesis002',
  ...Array.from({ length: 16 }, (_, index) => `migration-fixtures/additive-v${index + 2}-schema`),
  'migration-fixtures/current-candidate-inspection',
  'migration-fixtures/production-v1',
].sort());

type Snapshot = Readonly<Record<string, string>>;

export type Genesis002Fixture = Readonly<{
  input: Readonly<{
    repositoryRoot: string;
    moduleSourceCommit: string;
    dependencyCacheRoot: string;
    materializationParent: string;
  }>;
  lock: Record<string, any>;
  workspace: Record<string, any>;
  archives: ReadonlyMap<string, string>;
  cleanupRoots: readonly string[];
  sourceSnapshot: () => Snapshot;
  assertInstalledG002: (materializedRoot: string) => Snapshot;
  expectedClosureDigest: () => string;
  observedMaterializationSnapshot: () => Snapshot;
  commitSource: () => string;
}>;

function privateDirectory(label: string): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), label)));
  chmodSync(root, 0o700);
  return root;
}

function nameAndVersion(key: string): readonly [string, string] {
  const separator = key.lastIndexOf('@');
  return [key.slice(0, separator), key.slice(separator + 1)];
}

function treeSnapshot(root: string, ignoreGit = false): Snapshot {
  const entries: Record<string, string> = {};
  const visit = (candidate: string) => {
    const logical = relative(root, candidate).split(sep).join('/');
    if (ignoreGit && (logical === '.git' || logical.startsWith('.git/'))) return;
    const status = lstatSync(candidate);
    if (status.isFile()) {
      entries[logical] = `file:${createHash('sha256').update(readFileSync(candidate)).digest('hex')}`;
    } else if (status.isSymbolicLink()) {
      entries[logical] = `symlink:${readlinkSync(candidate)}`;
    } else if (status.isDirectory()) {
      entries[logical] = 'directory';
      for (const name of readdirSync(candidate).sort()) visit(join(candidate, name));
    } else entries[logical] = 'other';
  };
  visit(root);
  return Object.freeze(entries);
}

function inside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (difference !== '..'
    && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

export function createGenesis002Fixture(options: Readonly<{
  manifest?: Readonly<Record<string, unknown>>;
  mutateLock?: (lock: Record<string, any>) => void;
  mutateWorkspace?: (workspace: Record<string, any>) => void;
  archiveOverride?: Readonly<{
    key: string;
    name?: string;
    version?: string;
    corrupt?: 'path' | 'link';
  }>;
  lockIndent?: number;
}> = {}): Genesis002Fixture {
  const repositoryRoot = privateDirectory('warpkeep-g002-source-fixture-');
  const dependencyCacheRoot = privateDirectory('warpkeep-g002-cache-fixture-');
  const materializationParent = privateDirectory('warpkeep-g002-state-fixture-');
  const spacetimeRoot = join(repositoryRoot, 'spacetimedb');
  const moduleRoot = join(spacetimeRoot, 'genesis002');
  mkdirSync(moduleRoot, { recursive: true, mode: 0o700 });
  for (const path of [spacetimeRoot, moduleRoot]) chmodSync(path, 0o700);
  const manifest = options.manifest ?? {
    name: 'warpkeep-genesis-002-spacetimedb-module',
    version: '0.4.0',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    description: 'fixed G002 fixture',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
  };
  writeFileSync(join(moduleRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(spacetimeRoot, 'package.json'), `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.7.0',
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
  })}\n`, { mode: 0o600 });
  const lock = parse(readFileSync(resolve('spacetimedb/pnpm-lock.yaml'), 'utf8')) as Record<string, any>;
  const archives = new Map<string, string>();
  for (const key of GENESIS002_PACKAGE_KEYS) {
    const [expectedName, expectedVersion] = nameAndVersion(key);
    const override = options.archiveOverride?.key === key ? options.archiveOverride : undefined;
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
  options.mutateLock?.(lock);
  writeFileSync(join(spacetimeRoot, 'pnpm-lock.yaml'), stringify(lock, {
    indent: options.lockIndent ?? 2,
  }), { mode: 0o600 });
  const workspace = parse(readFileSync(resolve('spacetimedb/pnpm-workspace.yaml'), 'utf8')) as Record<string, any>;
  options.mutateWorkspace?.(workspace);
  writeFileSync(join(spacetimeRoot, 'pnpm-workspace.yaml'), stringify(workspace, { indent: 2 }), {
    mode: 0o600,
  });

  let expectedDigest: string | undefined;
  let installedSnapshot: Snapshot | undefined;
  let committed = false;
  const input = {
    repositoryRoot,
    moduleSourceCommit: 'a'.repeat(40),
    dependencyCacheRoot,
    materializationParent,
  };
  const fixture: Genesis002Fixture = Object.freeze({
    input,
    lock,
    workspace,
    archives,
    cleanupRoots: Object.freeze([repositoryRoot, dependencyCacheRoot, materializationParent]),
    sourceSnapshot: () => treeSnapshot(repositoryRoot, true),
    assertInstalledG002(materializedRoot: string): Snapshot {
      const g002Root = join(materializedRoot, 'spacetimedb', 'genesis002');
      const nodeModules = join(g002Root, 'node_modules');
      const pnpmRoot = join(nodeModules, '.pnpm');
      if (JSON.stringify(readdirSync(nodeModules).sort()) !== JSON.stringify([
        '.bin', '.pnpm', ...Object.keys(GENESIS002_TOP_LEVEL),
      ].sort())) throw new Error('G002_FIXTURE_TOP_LEVEL_LAYOUT_INVALID');
      if (JSON.stringify(readdirSync(pnpmRoot).sort()) !== JSON.stringify([
        ...GENESIS002_PACKAGE_KEYS.map(key => key.replace('/', '+')), 'lock.yaml',
      ].sort())) throw new Error('G002_FIXTURE_STORE_LAYOUT_INVALID');
      for (const key of GENESIS002_PACKAGE_KEYS) {
        const [name, version] = nameAndVersion(key);
        const packageRoot = join(pnpmRoot, key.replace('/', '+'), 'node_modules', ...name.split('/'));
        const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
          name?: unknown; version?: unknown;
        };
        if (manifest.name !== name || manifest.version !== version) {
          throw new Error(`G002_FIXTURE_INSTALLED_MANIFEST_INVALID:${key}`);
        }
        for (const dependencyKey of GENESIS002_EDGES[key]!) {
          const [dependencyName] = nameAndVersion(dependencyKey);
          const path = join(pnpmRoot, key.replace('/', '+'), 'node_modules', ...dependencyName.split('/'));
          if (!inside(g002Root, realpathSync(path))) throw new Error(`G002_FIXTURE_LINK_ESCAPE:${key}`);
          const targetManifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
            name?: unknown;
          };
          if (targetManifest.name !== dependencyName) throw new Error(`G002_FIXTURE_EDGE_INVALID:${key}`);
        }
      }
      for (const [name, key] of Object.entries(GENESIS002_TOP_LEVEL)) {
        const [expectedName] = nameAndVersion(key);
        const linked = JSON.parse(readFileSync(join(nodeModules, name, 'package.json'), 'utf8')) as {
          name?: unknown;
        };
        if (linked.name !== expectedName) throw new Error(`G002_FIXTURE_ROOT_LINK_INVALID:${name}`);
      }
      if (readdirSync(join(materializedRoot, 'spacetimedb')).includes('node_modules')) {
        throw new Error('G002_FIXTURE_ROOT_INSTALL_DETECTED');
      }
      installedSnapshot = treeSnapshot(nodeModules);
      const manifestBytes = readFileSync(join(g002Root, 'package.json'));
      const lockBytes = readFileSync(join(materializedRoot, 'spacetimedb', 'pnpm-lock.yaml'));
      const workspaceBytes = readFileSync(join(materializedRoot, 'spacetimedb', 'pnpm-workspace.yaml'));
      const parsedLock = parse(lockBytes.toString('utf8')) as {
        packages: Record<string, { resolution: { integrity: string } }>;
      };
      const dependencySnapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
        root: nodeModules,
        boundary: g002Root,
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
      framed('domain', 'warpkeep-genesis002-workspace-linux-x64-dependency-closure-v1');
      framed('manifest-path', 'spacetimedb/genesis002/package.json');
      framed('manifest-bytes', manifestBytes);
      framed('lock-path', 'spacetimedb/pnpm-lock.yaml');
      framed('lock-bytes', lockBytes);
      framed('workspace-path', 'spacetimedb/pnpm-workspace.yaml');
      framed('workspace-bytes', workspaceBytes);
      for (const key of GENESIS002_PACKAGE_KEYS) {
        framed('package-key', key);
        framed('package-integrity', parsedLock.packages[key]!.resolution.integrity);
        framed('package-edges', JSON.stringify(GENESIS002_EDGES[key]));
      }
      framed('installed-content-profile', 'spacetimedb/genesis002/node_modules');
      framed('installed-content-sha256', dependencySnapshot.contentDigest);
      framed('installed-entry-count', String(dependencySnapshot.entries.size));
      expectedDigest = digest.digest('hex');
      return installedSnapshot;
    },
    expectedClosureDigest: () => expectedDigest ?? (() => { throw new Error('G002_FIXTURE_NOT_INSPECTED'); })(),
    observedMaterializationSnapshot: () => installedSnapshot
      ?? (() => { throw new Error('G002_FIXTURE_NOT_INSPECTED'); })(),
    commitSource(): string {
      if (committed) return input.moduleSourceCommit;
      const run = (arguments_: readonly string[], env?: NodeJS.ProcessEnv) => {
        const result = spawnSync('git', arguments_, {
          cwd: repositoryRoot,
          encoding: 'utf8',
          env: env ?? process.env,
        });
        if (result.error !== undefined || result.status !== 0) {
          throw new Error(`G002_FIXTURE_GIT_FAILED:${arguments_.join(' ')}:${result.stderr}`);
        }
        return result.stdout.trim();
      };
      run(['init', '--quiet']);
      run(['add', '--', 'spacetimedb']);
      run(['commit', '--quiet', '-m', 'fixture'], {
        ...process.env,
        GIT_AUTHOR_NAME: 'Warpkeep Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@invalid.example',
        GIT_COMMITTER_NAME: 'Warpkeep Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@invalid.example',
      });
      input.moduleSourceCommit = run(['rev-parse', 'HEAD']);
      committed = true;
      return input.moduleSourceCommit;
    },
  });
  return fixture;
}
