// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import {
  greaterRealmImmutableArtifactTestSeams,
  withGenesis001HistoricalLockedDependencyClosure,
} from '../scripts/greater-realm-production-immutable-artifact';

const HISTORICAL_FIXTURES = Object.freeze([
  'production-v1',
  ...Array.from({ length: 13 }, (_, index) => `additive-v${index + 2}-schema`),
]);
const LOCKED_PACKAGES = Object.freeze([
  '@esbuild/darwin-arm64@0.25.12',
  'base64-js@1.5.1',
  'esbuild@0.25.12',
  'fsevents@2.3.3',
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
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function privateDirectory(label: string): string {
  const path = mkdtempSync(join(realpathSync(tmpdir()), label));
  chmodSync(path, 0o700);
  temporaryDirectories.push(path);
  return path;
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
  for (const path of [...directories].sort()) {
    blocks.push(tarHeader(`${path}/`, 'directory', 0));
  }
  for (const [path, body] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    blocks.push(tarHeader(`package/${path}`, 'file', body.byteLength), body);
    const remainder = body.byteLength % 512;
    if (remainder !== 0) blocks.push(Buffer.alloc(512 - remainder));
  }
  blocks.push(Buffer.alloc(1_024));
  return gzipSync(Buffer.concat(blocks));
}

function packageNameAndVersion(key: string): readonly [string, string] {
  const separator = key.lastIndexOf('@');
  return [key.slice(0, separator), key.slice(separator + 1)];
}

function historicalFixture(extraImporter?: string): Readonly<{
  materializedRoot: string;
  dependencyCacheRoot: string;
  firstArchivePath: string;
}> {
  const materializedRoot = privateDirectory('warpkeep-g001-historical-root-');
  const dependencyCacheRoot = privateDirectory('warpkeep-g001-historical-cache-');
  const spacetimeRoot = join(materializedRoot, 'spacetimedb');
  mkdirSync(spacetimeRoot, { mode: 0o700 });
  const lock = parse(readFileSync('spacetimedb/pnpm-lock.yaml', 'utf8')) as {
    importers: Record<string, unknown>;
    packages: Record<string, { resolution: { integrity: string } }>;
  };
  lock.importers = Object.fromEntries([
    ['.', lock.importers['.']],
    ...HISTORICAL_FIXTURES.map(name => (
      [`migration-fixtures/${name}`, lock.importers[`migration-fixtures/${name}`]]
    )),
    ...(extraImporter === undefined ? [] : [[extraImporter, lock.importers['genesis002']]]),
  ]);
  let firstArchivePath = '';
  for (const key of LOCKED_PACKAGES) {
    const [name, version] = packageNameAndVersion(key);
    const archive = packageArchive(name, version);
    const digest = createHash('sha512').update(archive).digest('hex');
    lock.packages[key]!.resolution.integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;
    const path = join(
      dependencyCacheRoot,
      '_cacache',
      'content-v2',
      'sha512',
      digest.slice(0, 2),
      digest.slice(2, 4),
      digest.slice(4),
    );
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, archive, { mode: 0o600 });
    if (firstArchivePath === '') firstArchivePath = path;
  }
  writeFileSync(join(spacetimeRoot, 'pnpm-lock.yaml'), stringify(lock), { mode: 0o600 });
  writeFileSync(join(spacetimeRoot, 'package.json'), `${JSON.stringify({
    name: 'warpkeep-spacetimedb-module',
    version: '0.1.0',
    private: true,
    packageManager: 'pnpm@11.7.0',
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: {
      esbuild: '0.25.12',
      tsx: '4.20.6',
      typescript: '5.6.3',
    },
  })}\n`, { mode: 0o600 });
  for (const fixture of HISTORICAL_FIXTURES) {
    mkdirSync(join(spacetimeRoot, 'migration-fixtures', fixture), {
      recursive: true,
      mode: 0o700,
    });
  }
  return Object.freeze({ materializedRoot, dependencyCacheRoot, firstArchivePath });
}

describe('Genesis 001 historical locked dependency closure', () => {
  it.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
    'rejects a structurally valid noncanonical historical lock before the operation',
    () => {
      const fixture = historicalFixture();
      let operationCalled = false;
      expect(() => withGenesis001HistoricalLockedDependencyClosure({
        ...fixture,
        operation: () => {
          operationCalled = true;
          return undefined;
        },
      })).toThrow('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
      expect(operationCalled).toBe(false);
    },
    120_000,
  );

  it('accepts only the exact historical importer set and 16-package Darwin ARM64 closure', () => {
    const accepted = historicalFixture();
    expect(greaterRealmImmutableArtifactTestSeams.genesis001HistoricalProfile(
      accepted.materializedRoot,
    )).toEqual(expect.objectContaining({ lockedPackageCount: 16 }));

    const rejected = historicalFixture('genesis002');
    expect(() => greaterRealmImmutableArtifactTestSeams.genesis001HistoricalProfile(
      rejected.materializedRoot,
    )).toThrow('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  });

  it.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
    'installs only root node_modules and returns privacy-safe deterministic provenance',
    () => {
      const fixture = historicalFixture();
      const closure = greaterRealmImmutableArtifactTestSeams
        .withGenesis001HistoricalFixtureClosure({
        ...fixture,
        operation: ({ materializedRoot, provenance }) => {
          expect(provenance.lockedPackageCount).toBe(16);
          expect(existsSync(join(materializedRoot, 'spacetimedb', 'node_modules'))).toBe(true);
          for (const name of HISTORICAL_FIXTURES) {
            expect(existsSync(join(
              materializedRoot,
              'spacetimedb',
              'migration-fixtures',
              name,
              'node_modules',
            ))).toBe(false);
          }
          return 'built';
        },
      });
      expect(closure.result).toBe('built');
      expect(closure.provenance).toEqual({
        dependencyInstallerProfile: 'warpkeep-genesis-001-historical-root-dependency-closure-v1',
        dependencyLockfileSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        lockedPackageCount: 16,
        dependencyArchiveClosureSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        dependencyClosureSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        dependencyTreeEntryCount: expect.any(Number),
      });
      expect(closure.provenance.dependencyTreeEntryCount).toBeGreaterThan(16);
      expect(JSON.stringify(closure.provenance)).not.toContain(fixture.materializedRoot);
      expect(JSON.stringify(closure.provenance)).not.toContain(fixture.dependencyCacheRoot);
      expect(closure.verify).toBeTypeOf('function');
      closure.verify();

      writeFileSync(fixture.firstArchivePath, 'mutated archive', { mode: 0o600 });
      expect(() => closure.verify()).toThrow();
    },
    120_000,
  );

  it.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
    'reattests the installed tree automatically after the build operation',
    () => {
      const fixture = historicalFixture();
      expect(() => greaterRealmImmutableArtifactTestSeams
        .withGenesis001HistoricalFixtureClosure({
        ...fixture,
        operation: ({ materializedRoot }) => {
          writeFileSync(
            join(materializedRoot, 'spacetimedb', 'node_modules', 'spacetimedb', 'package.json'),
            '{}\n',
          );
        },
      })).toThrow();
    },
    120_000,
  );
});
