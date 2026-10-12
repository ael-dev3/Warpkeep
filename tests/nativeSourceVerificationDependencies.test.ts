// @vitest-environment node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureNativeRootDependencyAttestation, deriveNativeRootDependencyArchive,
  NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS, NATIVE_ROOT_DEPENDENCY_PROFILE,
} from '../scripts/native-source-verification-dependencies.mjs';

type Entry = { path: string; body?: Buffer; mode?: number; kind?: number; target?: string };
function archive(entries: Entry[]) {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = entry.body ?? Buffer.alloc(0), header = Buffer.alloc(512);
    header.write(`package/${entry.path}`, 0, 100, 'ascii');
    header.write(`${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii');
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii'); header.fill(32, 148, 156);
    header[156] = entry.kind ?? 48;
    if (entry.target) header.write(entry.target, 157, 100, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((total, byte) => total + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii'); header[154] = 0; header[155] = 32;
    blocks.push(header, body);
    if (body.length % 512) blocks.push(Buffer.alloc(512 - body.length % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
const sri = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const metadata = (name = 'yaml', extra: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({ name, version: '1.0.0', ...extra }));
function lock(bytes: Buffer, name = 'yaml', extra: Record<string, unknown> = {}) {
  const packages: Record<string, unknown> = { '': { name: 'warpkeep', version: '0.3.43' } };
  for (const path of NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS) {
    const packageName = path.slice('node_modules/'.length);
    packages[path] = { version: '1.0.0', resolved: `https://registry.npmjs.org/${packageName}/-/${packageName.split('/').at(-1)}-1.0.0.tgz`, integrity: sri(bytes) };
  }
  packages[`node_modules/${name}`] = { version: '1.0.0', resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-1.0.0.tgz`, integrity: sri(bytes), ...extra };
  packages['node_modules/react'] = { version: '1.0.0' };
  return Buffer.from(JSON.stringify({ name: 'warpkeep', version: '0.3.43', lockfileVersion: 3, packages }));
}
const release = (result: ReturnType<typeof deriveNativeRootDependencyArchive>) => result.files.forEach(file => file.bytes.fill(0));

describe('native dependency archive data', () => {
  it('derives every regular member, empty file, implicit directory and executable bin from source lock SRI', () => {
    const bytes = archive([{ path: 'package.json', body: metadata('yaml', { bin: { yaml: './bin.mjs' } }) },
      { path: 'lib/', mode: 0o755, kind: 53 }, { path: 'lib/empty.js' },
      { path: 'lib/core.js', body: Buffer.from('export const value=1;') },
      { path: 'bin.mjs', body: Buffer.from('#!/usr/bin/env node\n') }]);
    const result = deriveNativeRootDependencyArchive(lock(bytes, 'yaml', { bin: { yaml: 'bin.mjs' } }), 'node_modules/yaml', bytes);
    try {
      expect(result.files.map(file => [file.path, file.bytes.length, file.mode])).toEqual([
        ['bin.mjs', 20, 0o755], ['lib/core.js', 21, 0o644], ['lib/empty.js', 0, 0o644],
        ['package.json', metadata('yaml', { bin: { yaml: './bin.mjs' } }).length, 0o644],
      ]);
      expect(result.directories).toEqual(['lib']);
      expect(result).toMatchObject({ archiveIntegrityVerified: true, installedTreeVerified: false, registrySignaturesVerified: false, productionAuthorized: false });
      expect(bytes.subarray(0, 2)).toEqual(Buffer.from([31, 139]));
    } finally { release(result); }
  });

  it('compares archive integrity from the actual lock, not a caller digest', () => {
    const bytes = archive([{ path: 'package.json', body: metadata() }]), changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', changed)).toThrow('ARCHIVE_SRI');
  });

  it.each([['link', 50], ['hardlink', 49], ['PAX', 120]] as const)('refuses unsupported %s headers despite matching SRI', (_label, kind) => {
    const bytes = archive([{ path: 'package.json', body: metadata() }, { path: 'unsupported', kind, target: 'package/package.json' }]);
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', bytes)).toThrow('ARCHIVE_HEADER');
  });

  it.each(['../escape', '/absolute', 'node_modules/bundled/index.js'])('refuses unsafe/bundled archive path %s', path => {
    const bytes = archive([{ path: 'package.json', body: metadata() }, { path, body: Buffer.from('x') }]);
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', bytes)).toThrow();
  });

  it('refuses duplicate and file-as-directory members', () => {
    for (const entries of [
      [{ path: 'package.json', body: metadata() }, { path: 'package.json', body: metadata() }],
      [{ path: 'package.json', body: metadata() }, { path: 'lib', body: Buffer.from('x') }, { path: 'lib/index.js', body: Buffer.from('x') }],
    ]) {
      const bytes = archive(entries);
      expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', bytes)).toThrow('ARCHIVE_PATH');
    }
  });

  it('refuses writable tar modes, package identity mismatch and undisclosed postinstall transformations', () => {
    for (const entries of [
      [{ path: 'package.json', body: metadata(), mode: 0o666 }],
      [{ path: 'package.json', body: metadata('other') }],
      [{ path: 'package.json', body: metadata('yaml', { scripts: { postinstall: 'node install.js' } }) }],
    ]) {
      const bytes = archive(entries);
      expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', bytes)).toThrow();
    }
    const bytes = archive([{ path: 'package.json', body: metadata() }]);
    expect(() => deriveNativeRootDependencyArchive(lock(bytes, 'yaml', { hasInstallScript: true }), 'node_modules/yaml', bytes)).toThrow('LOCK_RECORD');
  });

  it('requires canonical lock package records and exact bin metadata/targets', () => {
    const bytes = archive([{ path: 'package.json', body: metadata('yaml', { bin: { yaml: 'missing.js' } }) }]);
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', bytes)).toThrow('PACKAGE_METADATA');
    expect(() => deriveNativeRootDependencyArchive(lock(bytes, 'yaml', { bin: { yaml: 'missing.js' } }), 'node_modules/yaml', bytes)).toThrow('BIN');
    expect(() => deriveNativeRootDependencyArchive(lock(bytes, 'yaml', { resolved: 'https://example.org/package.tgz' }), 'node_modules/yaml', bytes)).toThrow('LOCK_RECORD');
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/react', bytes)).toThrow('PACKAGE_SELECTION');
  });

  it('accepts safe legacy uppercase, scoped and nested recorded names without selecting them for verification', () => {
    const bytes = archive([{ path: 'package.json', body: metadata() }]);
    const source = JSON.parse(lock(bytes).toString());
    for (const path of ['node_modules/JSONStream', 'node_modules/@Legacy/Tool', 'node_modules/Parent/node_modules/Child']) {
      source.packages[path] = { version: '1.3.5' };
    }
    const result = deriveNativeRootDependencyArchive(Buffer.from(JSON.stringify(source)), 'node_modules/yaml', bytes);
    try { expect(result.packagePath).toBe('node_modules/yaml'); expect(result.installedTreeVerified).toBe(false); }
    finally { release(result); }
  });

  it.each([
    'node_modules/.', 'node_modules/..', 'node_modules/.hidden',
    'node_modules/@../foo', 'node_modules/@./foo', 'node_modules/@/foo', 'node_modules/@scope',
    'node_modules/@scope/..', 'node_modules/Foo/bar', 'node_modules/foo/../bar',
    'node_modules/foo/node_modules', 'node_modules/foo/node_modules/.',
    'node_modules/foo/node_modules/@../bar', 'node_modules/foo/node_modules/@scope/.hidden',
    `node_modules/${'x'.repeat(241)}`, Array.from({ length: 11 }, () => 'node_modules/x').join('/'),
  ])('rejects unsafe, malformed or excessive recorded package path %s', path => {
    const bytes = archive([{ path: 'package.json', body: metadata() }]);
    const source = JSON.parse(lock(bytes).toString()); source.packages[path] = { version: '1.0.0' };
    expect(() => deriveNativeRootDependencyArchive(Buffer.from(JSON.stringify(source)), 'node_modules/yaml', bytes)).toThrow('LOCK_PATH');
  });

  it('requires a complete terminated gzip/tar and bounded valid UTF8 lock', () => {
    const bytes = archive([{ path: 'package.json', body: metadata() }]);
    expect(() => deriveNativeRootDependencyArchive(Buffer.from([255]), 'node_modules/yaml', bytes)).toThrow();
    const invalid = Buffer.from('not gzip');
    expect(() => deriveNativeRootDependencyArchive(lock(invalid), 'node_modules/yaml', invalid)).toThrow('ARCHIVE_FORMAT');
    expect(() => deriveNativeRootDependencyArchive(lock(bytes), 'node_modules/yaml', Buffer.alloc(32 * 1024 * 1024 + 1))).toThrow('ARCHIVE_BOUNDS');
  });
});

// These functional captures use real native descriptors. Windows-only metadata
// cannot substitute for the UID-bound filesystem evidence required by the API.
const native = process.platform === 'linux' && process.arch === 'x64' && process.getuid?.() === 1000 && process.getgid?.() === 1000;
describe.skipIf(!native)('native root installed archive capture', () => {
  const roots: string[] = [];
  afterEach(() => { vi.restoreAllMocks(); for (const path of roots.splice(0)) fs.rmSync(path, { recursive: true, force: true }); });
  function fixture() {
    const root = fs.mkdtempSync(join(tmpdir(), 'warpkeep-native-dependency-')); roots.push(root); fs.chmodSync(root, 0o755);
    const makeDirectory = (path: string) => {
      fs.mkdirSync(path, { recursive: true, mode: 0o755 });
      for (let parent = path; parent !== root; parent = dirname(parent)) fs.chmodSync(parent, 0o755);
    };
    const bytes = archive([{ path: 'package.json', body: metadata('yaml', { bin: { yaml: 'bin.mjs' } }) },
      { path: 'lib/core.js', body: Buffer.from('export const value=1;') }, { path: 'lib/empty.js' },
      { path: 'bin.mjs', body: Buffer.from('#!/usr/bin/env node\n'), mode: 0o644 }]);
    const sourceLock = lock(bytes, 'yaml', { bin: { yaml: 'bin.mjs' } });
    const expected = deriveNativeRootDependencyArchive(sourceLock, 'node_modules/yaml', bytes);
    fs.writeFileSync(join(root, 'package-lock.json'), sourceLock, { mode: 0o644 });
    fs.chmodSync(join(root, 'package-lock.json'), 0o644);
    const archivePath = join(root, 'yaml.tgz'); fs.writeFileSync(archivePath, bytes, { mode: 0o600 });
    makeDirectory(join(root, 'node_modules/yaml'));
    for (const file of expected.files) {
      const path = join(root, 'node_modules/yaml', file.path); makeDirectory(dirname(path));
      fs.writeFileSync(path, file.bytes, { mode: file.mode }); fs.chmodSync(path, file.mode);
    }
    release(expected);
    makeDirectory(join(root, 'node_modules/.bin'));
    fs.symlinkSync('../yaml/bin.mjs', join(root, 'node_modules/.bin/yaml'));
    return { root, archivePath, bytes, sourceLock, makeDirectory, capture: () => captureNativeRootDependencyAttestation(root, [{ packagePath: 'node_modules/yaml', archivePath }]) };
  }

  it('binds complete installed own-package bytes, bin target, source-lock and explicit uncovered records without writing', () => {
    const value = fixture(), before = fs.lstatSync(join(value.root, 'package-lock.json'), { bigint: true });
    const result = value.capture();
    expect(result).toMatchObject({ profile: NATIVE_ROOT_DEPENDENCY_PROFILE, verifiedPackageCount: 1,
      rootLockRecordCount: 7, rootLockFullyVerified: false, moduleDependenciesVerified: false,
      serviceDependenciesVerified: false, auditVerified: false, registrySignaturesVerified: false, productionAuthorized: false });
    expect(result.verifiedPackages[0].files).toHaveLength(4);
    expect(result.verifiedPackages[0].files.find(file => file.path === 'lib/empty.js')?.bytes).toBe(0);
    expect(result.verifiedPackages[0].binLinks[0]).toMatchObject({ kind: 'symlink', target: '../yaml/bin.mjs' });
    expect(result.uncoveredRootRecords).toHaveLength(6);
    expect(fs.lstatSync(join(value.root, 'package-lock.json'), { bigint: true })).toMatchObject({
      dev: before.dev, ino: before.ino, mode: before.mode, uid: before.uid, gid: before.gid,
      nlink: before.nlink, size: before.size, mtimeNs: before.mtimeNs, ctimeNs: before.ctimeNs,
    });
    expect(fs.readFileSync(join(value.root, 'package-lock.json'))).toEqual(value.sourceLock);
  });

  it.each(['tamper', 'extra', 'missing', 'symlink', 'mode', 'bin'])('rejects real installed %s', variant => {
    const value = fixture(), core = join(value.root, 'node_modules/yaml/lib/core.js');
    if (variant === 'tamper') fs.writeFileSync(core, 'modified');
    if (variant === 'extra') fs.writeFileSync(join(value.root, 'node_modules/yaml/extra.js'), 'x');
    if (variant === 'missing') fs.unlinkSync(core);
    if (variant === 'symlink') { fs.unlinkSync(core); fs.symlinkSync('empty.js', core); }
    if (variant === 'mode') fs.chmodSync(core, 0o666);
    if (variant === 'bin') { fs.unlinkSync(join(value.root, 'node_modules/.bin/yaml')); fs.symlinkSync('../yaml/lib/core.js', join(value.root, 'node_modules/.bin/yaml')); }
    expect(value.capture).toThrow();
  });

  it('records actual hardlinks and rejects generated bin shims instead of inventing archive equivalence', () => {
    const value = fixture(), core = join(value.root, 'node_modules/yaml/lib/core.js');
    fs.linkSync(core, join(value.root, 'held-core.js'));
    expect(value.capture().verifiedPackages[0].files.find(file => file.path === 'lib/core.js')).toMatchObject({ hardlinked: true });
    fs.unlinkSync(join(value.root, 'node_modules/.bin/yaml'));
    fs.writeFileSync(join(value.root, 'node_modules/.bin/yaml'), '#!/bin/sh\nnode ../yaml/bin.mjs\n', { mode: 0o755 });
    fs.chmodSync(join(value.root, 'node_modules/.bin/yaml'), 0o755);
    expect(value.capture).toThrow('BIN_BYTES');
  });

  it('permits only a recorded in-node_modules package directory link, never an outside package', () => {
    const value = fixture(), source = join(value.root, 'node_modules/yaml'), destination = join(value.root, 'node_modules/.store/yaml');
    value.makeDirectory(dirname(destination)); fs.renameSync(source, destination); fs.symlinkSync('.store/yaml', source);
    expect(value.capture().verifiedPackages[0].packageDirectory).toMatchObject({ kind: 'symlink', target: '.store/yaml', realPath: destination });
    fs.unlinkSync(source); fs.renameSync(destination, join(value.root, 'outside-yaml')); fs.symlinkSync('../outside-yaml', source);
    expect(value.capture).toThrow('PACKAGE_LINK');
  });

  it('marks a nested install boundary uncovered without falsely counting its dependency bytes', () => {
    const value = fixture(), nested = join(value.root, 'node_modules/yaml/node_modules'); value.makeDirectory(nested);
    fs.writeFileSync(join(nested, 'unknown.js'), 'not part of yaml archive');
    expect(value.capture().verifiedPackages[0].excludedNestedInstallRoots).toHaveLength(1);
  });

  it('retains missing archive coverage and rejects real wrong-owner archive metadata before reading its body', () => {
    const value = fixture();
    const missing = captureNativeRootDependencyAttestation(value.root, []);
    expect(missing.verifiedPackageCount).toBe(0); expect(missing.uncoveredRootRecords).toHaveLength(7);
    expect(missing.rootLockFullyVerified).toBe(false);
    expect(() => captureNativeRootDependencyAttestation(value.root, [{ packagePath: 'node_modules/yaml', archivePath: '/etc/hosts' }])).toThrow('OWNER');
  });

  it('captures the selected archive while leaving the actual-root-shaped JSONStream record explicitly uncovered', () => {
    const value = fixture(), source = JSON.parse(value.sourceLock.toString());
    source.packages['node_modules/JSONStream'] = { version: '1.3.5',
      resolved: 'https://registry.npmjs.org/JSONStream/-/JSONStream-1.3.5.tgz' };
    fs.writeFileSync(join(value.root, 'package-lock.json'), JSON.stringify(source));
    const result = value.capture();
    expect(result.verifiedPackageCount).toBe(1);
    expect(result.uncoveredRootRecords).toContainEqual({ path: 'node_modules/JSONStream', reason: 'outside-fixed-root-slice' });
    expect(result.rootLockFullyVerified).toBe(false);
  });

  it('rejects lock/hash/coverage caller overrides and source or installed changes between complete passes', () => {
    const value = fixture();
    expect(() => captureNativeRootDependencyAttestation(value.root, [{ packagePath: 'node_modules/yaml', archivePath: value.archivePath, verified: true } as never])).toThrow('INPUT');
    let reads = 0; const original = fs.opendirSync;
    vi.spyOn(fs, 'opendirSync').mockImplementation(((path: fs.PathLike, options?: unknown) => {
      const result = Reflect.apply(original, fs, [path, options]);
      if (String(path) === join(value.root, 'node_modules/yaml') && ++reads === 2) fs.writeFileSync(join(value.root, 'node_modules/yaml/lib/core.js'), 'changed after first pass');
      return result;
    }) as typeof fs.opendirSync);
    expect(value.capture).toThrow();
  });
});
