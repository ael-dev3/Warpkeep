// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertFixedOperationBundleNamespace,
  selectFixedOperationBundlePackages,
  selectFixedRecoveryBundlePackages,
  validateFixedOperationBundleArchive,
} from '../scripts/local-operation-bundle-packages';

const ESBUILD_SRI = 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==';
const COMPANION_SRI = 'sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==';

function fixedLock() {
  return {
    packages: {
      'node_modules/@noble/hashes': JSON.parse(readFileSync('package-lock.json', 'utf8')).packages['node_modules/@noble/hashes'],
      'node_modules/esbuild': {
        version: '0.28.1',
        resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz',
        integrity: ESBUILD_SRI,
        optionalDependencies: { '@esbuild/linux-x64': '0.28.1' },
      },
      'node_modules/@esbuild/linux-x64': {
        version: '0.28.1',
        resolved: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz',
        integrity: COMPANION_SRI,
        os: ['linux'], cpu: ['x64'],
      },
    },
  };
}

describe('fixed operation bundle compiler packages', () => {
  it('includes the lock-pinned Keccak dependency for isolated operation bundles', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(selectFixedOperationBundlePackages(lock).map(spec => spec.key)).toContain('node_modules/@noble/hashes');
  });
  it('rejects changed Keccak archive bytes even when all pinned filenames and lengths match', () => {
    const spec = selectFixedOperationBundlePackages(fixedLock()).find(x => x.key === 'node_modules/@noble/hashes')!;
    let offset = 0;
    const entries = spec.files.map(file => {
      const entry = {path: file.path, kind: 'file' as const, offset, size: file.bytes};
      offset += file.bytes; return entry;
    });
    expect(entries).toHaveLength(247);
    expect(() => validateFixedOperationBundleArchive('node_modules/@noble/hashes', {
      uncompressed: Buffer.alloc(offset), entries, fileBytes: offset,
    })).toThrow('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  });
  it('requires the exact 17-file recovery archive inventory with non-executable modes', () => {
    const spec = selectFixedRecoveryBundlePackages(JSON.parse(readFileSync('package-lock.json', 'utf8')))[2]!;
    let offset = 0;
    const entries = spec.files.map(file => {
      const entry = {path: file.path, kind: 'file' as const, offset, size: file.bytes};
      offset += file.bytes; return entry;
    });
    const parsed = {uncompressed: Buffer.alloc(offset), entries, fileBytes: offset};
    const result = validateFixedOperationBundleArchive('node_modules/fflate', parsed);
    expect(result).toHaveLength(17);
    expect(result.every(file => file.mode === 0o400 && file.path.startsWith('fflate/'))).toBe(true);
    for (const changed of [entries.slice(1), [...entries, entries[0]!],
      entries.map((entry, index) => index === 0 ? {...entry, size: entry.size + 1} : entry),
      entries.map((entry, index) => index === 0 ? {...entry, path: '../escape'} : entry)]) {
      expect(() => validateFixedOperationBundleArchive('node_modules/fflate', {...parsed, entries: changed}))
        .toThrow('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
    }
  });
  it('adds only pinned fflate for recovery without adding the operation-only Keccak dependency', () => {
    const lock = fixedLock();
    Object.assign(lock.packages, { 'node_modules/fflate': {
      version: '0.8.3', resolved: 'https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz',
      integrity: 'sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rU20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==',
    } });
    // A one-byte integrity change is not accepted, even at the fixed version.
    expect(() => selectFixedRecoveryBundlePackages(lock)).toThrow('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
    const record = (lock.packages as Record<string, any>)['node_modules/fflate'];
    record.integrity = 'sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==';
    expect(selectFixedRecoveryBundlePackages(lock).map(value => value.key)).toEqual([
      'node_modules/esbuild', 'node_modules/@esbuild/linux-x64', 'node_modules/fflate',
    ]);
    expect(selectFixedOperationBundlePackages(lock)).toHaveLength(3);
    record.version = '0.8.2';
    expect(() => selectFixedRecoveryBundlePackages(lock)).toThrow('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
    expect(() => selectFixedRecoveryBundlePackages(fixedLock())).toThrow('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  });
  it('selects the fixed compiler pair and pinned Keccak dependency', () => {
    const selected = selectFixedOperationBundlePackages(fixedLock());
    expect(selected.map(entry => entry.key)).toEqual([
      'node_modules/esbuild',
      'node_modules/@esbuild/linux-x64',
      'node_modules/@noble/hashes',
    ]);
    expect(selected.map(entry => entry.integrity)).toEqual([ESBUILD_SRI, COMPANION_SRI, fixedLock().packages['node_modules/@noble/hashes'].integrity]);
  });

  it.each([
    ['missing Keccak', (lock: any) => { delete lock.packages['node_modules/@noble/hashes']; }],
    ['changed Keccak version', (lock: any) => { lock.packages['node_modules/@noble/hashes'].version = '1.8.1'; }],
    ['changed Keccak URL', (lock: any) => { lock.packages['node_modules/@noble/hashes'].resolved += '?mirror'; }],
    ['changed Keccak integrity', (lock: any) => { lock.packages['node_modules/@noble/hashes'].integrity += 'changed'; }],
    ['unexpected Keccak dependencies', (lock: any) => { lock.packages['node_modules/@noble/hashes'].dependencies = {unreviewed: '1.0.0'}; }],
    ['missing compiler', (lock: any) => { delete lock.packages['node_modules/esbuild']; }],
    ['wrong compiler URL', (lock: any) => { lock.packages['node_modules/esbuild'].resolved += '?mirror=1'; }],
    ['wrong companion OS', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].os = ['darwin']; }],
    ['wrong companion version', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].version = '0.28.0'; }],
  ])('rejects %s without transport', (_name, mutate) => {
    const lock = fixedLock();
    mutate(lock);
    expect(() => selectFixedOperationBundlePackages(lock)).toThrow('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  });

  it('accepts only the seven authenticated compiler files and their exact lengths', () => {
    let offset = 0;
    const files = ([
      ['bin/esbuild', 9350], ['install.js', 11773], ['lib/main.js', 97214],
      ['package.json', 3980], ['LICENSE.md', 1069], ['README.md', 175],
      ['lib/main.d.ts', 23392],
    ] as const).map(([path, size]) => {
      const entry = { path, kind: 'file' as const, offset, size };
      offset += size;
      return entry;
    });
    expect(validateFixedOperationBundleArchive('node_modules/esbuild', {
      uncompressed: Buffer.alloc(offset), entries: files, fileBytes: 146953,
    }).map(entry => entry.path)).toEqual(files.map(entry => `esbuild/${entry.path}`)
      .sort((left, right) => left.localeCompare(right)));
    expect(() => validateFixedOperationBundleArchive('node_modules/esbuild', {
      uncompressed: Buffer.alloc(offset + 1),
      entries: [...files, { path: 'unexpected.js', kind: 'file' as const, offset: 0, size: 1 }],
      fileBytes: 146954,
    })).toThrow('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  });

  it('accepts only the three authenticated Linux companion files and exact lengths', () => {
    let offset = 0;
    const files = ([
      ['bin/esbuild', 11407472], ['package.json', 372], ['README.md', 141],
    ] as const).map(([path, size]) => {
      const entry = { path, kind: 'file' as const, offset, size };
      offset += size;
      return entry;
    });
    const parsed = { uncompressed: Buffer.alloc(offset), entries: files, fileBytes: offset };
    expect(validateFixedOperationBundleArchive('node_modules/@esbuild/linux-x64', parsed)
      .map(entry => entry.path)).toEqual([
      '@esbuild/linux-x64/bin/esbuild',
      '@esbuild/linux-x64/package.json',
      '@esbuild/linux-x64/README.md',
    ]);
    expect(() => validateFixedOperationBundleArchive('node_modules/@esbuild/linux-x64', {
      ...parsed,
      entries: [...files, { path: 'install.js', kind: 'file' as const, offset: 0, size: 1 }],
    })).toThrow('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  });

  it('rejects extra files and links in a real temporary namespace', () => {
    const parent = mkdtempSync(join(tmpdir(), 'warpkeep-operation-packages-'));
    const root = join(parent, 'node_modules');
    const expected = [
      { path: 'esbuild/package.json', mode: 0o400, bytes: 2, sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ];
    try {
      chmodSync(parent, 0o700);
      mkdirSync(join(root, 'esbuild'), { recursive: true, mode: 0o700 });
      chmodSync(root, 0o700);
      chmodSync(join(root, 'esbuild'), 0o700);
      writeFileSync(join(root, 'esbuild', 'package.json'), '{}', { mode: 0o400 });
      expect(() => assertFixedOperationBundleNamespace(root, expected)).not.toThrow();
      chmodSync(join(root, 'esbuild', 'package.json'), 0o600);
      writeFileSync(join(root, 'esbuild', 'package.json'), '{"changed":true}', { mode: 0o400 });
      chmodSync(join(root, 'esbuild', 'package.json'), 0o400);
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow();
      chmodSync(join(root, 'esbuild', 'package.json'), 0o600);
      writeFileSync(join(root, 'esbuild', 'package.json'), '{}', { mode: 0o400 });
      chmodSync(join(root, 'esbuild', 'package.json'), 0o400);
      writeFileSync(join(root, 'extra'), 'x', { mode: 0o400 });
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
      rmSync(join(root, 'extra'));
      symlinkSync(join(root, 'esbuild'), join(root, 'linked'), 'junction');
      expect(() => assertFixedOperationBundleNamespace(root, expected))
        .toThrow('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform !== 'win32').each(['operation', 'recovery'])('builds the isolated %s bundles from verified package namespaces', scenario => {
    const repositoryRoot = resolve(import.meta.dirname, '..');
    const linuxRoot = `/mnt/${repositoryRoot[0]!.toLowerCase()}${repositoryRoot.slice(2).replaceAll('\\', '/')}`;
    const result = spawnSync('C:/Windows/System32/wsl.exe', [
      '--distribution', 'WarpkeepRunner', '--user', 'warpkeep', '--',
      '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
      '--no-warnings', '--experimental-vm-modules',
      `${linuxRoot}/tests/fixtures/localOperationBundlePackagesNativeFixture.mjs`, linuxRoot, scenario,
    ], {encoding: 'utf8', env: {}, maxBuffer: 64 * 1024, timeout: 60000});
    expect(result.status, result.stderr).toBe(0);
    const evidence = JSON.parse(result.stdout);
    expect(evidence.code).toBe(scenario === 'operation' ? 'OPERATION_ISOLATED_BUILD_VERIFIED' : 'RECOVERY_ISOLATED_BUILD_VERIFIED');
    expect(evidence.transportBuiltins).toEqual([]);
    if (scenario === 'operation') {
      expect(evidence.recoveryBuild.map((lane: any) => lane.lane)).toEqual(['g002', 'ptr']);
      for (const lane of evidence.recoveryBuild) {
        expect(lane.repeatable).toBe(true);
        expect(lane.loaded.byteDigest).toBe(lane.sha256);
        expect(lane.graph).toHaveLength(4);
      }
    } else expect(evidence.recoveryBuild.repeatable).toBe(true);
  }, 60000);

  it.skipIf(process.platform !== 'win32').each([
    ['missing', 'OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID'],
    ['corrupt', 'OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID'],
    ['post-use-mutation', 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID'],
    ['noble-post-use-mutation', 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID'],
  ])('rejects %s cached package state without transport', (scenario, expectedCode) => {
    if (process.platform !== 'win32') return;
    const repositoryRoot = resolve(import.meta.dirname, '..');
    const linuxRoot = `/mnt/${repositoryRoot[0]!.toLowerCase()}${repositoryRoot.slice(2).replaceAll('\\', '/')}`;
    const fixture = `${linuxRoot}/tests/fixtures/localOperationBundlePackagesNativeFixture.mjs`;
    const result = spawnSync('C:/Windows/System32/wsl.exe', [
      '--distribution', 'WarpkeepRunner', '--user', 'warpkeep', '--',
      '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
      '--no-warnings', '--experimental-vm-modules', fixture, linuxRoot, scenario,
    ], { encoding: 'utf8', env: {}, maxBuffer: 64 * 1024, timeout: 60_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ code: expectedCode, transportBuiltins: [] });
  });
});
