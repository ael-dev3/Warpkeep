import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync,
  lstatSync, mkdirSync, openSync, readdirSync, realpathSync, writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { greaterRealmImmutableArtifactTestSeams } from './greater-realm-production-immutable-artifact';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_LOCK_BYTES = 4 * 1024 * 1024;

type PackageKey = 'node_modules/esbuild' | 'node_modules/@esbuild/linux-x64';
type FileExpectation = Readonly<{ path: string; bytes: number; executable: boolean }>;
type NamespaceRecord = Readonly<{ path: string; mode: number; bytes: number; sha256: string }>;
type SafeArchive = Readonly<{
  uncompressed: Buffer;
  entries: readonly Readonly<{ path: string; kind: 'directory' | 'file'; offset: number; size: number }>[];
  fileBytes: number;
}>;

const FIXED_PACKAGES = Object.freeze([
  Object.freeze({
    key: 'node_modules/esbuild' as const,
    name: 'esbuild', version: '0.28.1',
    resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz',
    integrity: 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==',
    files: Object.freeze([
      Object.freeze({ path: 'bin/esbuild', bytes: 9350, executable: true }),
      Object.freeze({ path: 'install.js', bytes: 11773, executable: false }),
      Object.freeze({ path: 'lib/main.js', bytes: 97214, executable: false }),
      Object.freeze({ path: 'package.json', bytes: 3980, executable: false }),
      Object.freeze({ path: 'LICENSE.md', bytes: 1069, executable: false }),
      Object.freeze({ path: 'README.md', bytes: 175, executable: false }),
      Object.freeze({ path: 'lib/main.d.ts', bytes: 23392, executable: false }),
    ]),
  }),
  Object.freeze({
    key: 'node_modules/@esbuild/linux-x64' as const,
    name: '@esbuild/linux-x64', version: '0.28.1',
    resolved: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz',
    integrity: 'sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==',
    files: Object.freeze([
      Object.freeze({ path: 'bin/esbuild', bytes: 11407472, executable: true }),
      Object.freeze({ path: 'package.json', bytes: 372, executable: false }),
      Object.freeze({ path: 'README.md', bytes: 141, executable: false }),
    ]),
  }),
]);

export class OperationBundlePackagesError extends Error {
  readonly code: string;
  constructor(code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'OperationBundlePackagesError';
    this.code = code;
  }
}

function fail(code: string, cause?: unknown): never {
  throw new OperationBundlePackagesError(code, cause === undefined ? undefined : { cause });
}

function exactObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference));
}

function canonicalPath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'
      && !/[\u0000-\u001f\u007f]/u.test(part));
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

function sriDigest(integrity: string): string {
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(integrity);
  if (match === null) fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  const digest = Buffer.from(match[1], 'base64').toString('hex');
  if (!/^[0-9a-f]{128}$/u.test(digest)) fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  return digest;
}

export function selectFixedOperationBundlePackages(lock: unknown) {
  if (!exactObject(lock) || !exactObject(lock.packages)) {
    fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  }
  const records = lock.packages;
  for (const spec of FIXED_PACKAGES) {
    const record = records[spec.key];
    if (!exactObject(record) || record.version !== spec.version
        || record.resolved !== spec.resolved || record.integrity !== spec.integrity) {
      fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
    }
  }
  const compiler = records['node_modules/esbuild'] as Record<string, unknown>;
  const companion = records['node_modules/@esbuild/linux-x64'] as Record<string, unknown>;
  if (!exactObject(compiler.optionalDependencies)
      || compiler.optionalDependencies['@esbuild/linux-x64'] !== '0.28.1'
      || JSON.stringify(companion.os) !== JSON.stringify(['linux'])
      || JSON.stringify(companion.cpu) !== JSON.stringify(['x64'])) {
    fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID');
  }
  return FIXED_PACKAGES;
}

function specFor(key: PackageKey) {
  const spec = FIXED_PACKAGES.find(candidate => candidate.key === key);
  if (spec === undefined) fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  return spec;
}

export function validateFixedOperationBundleArchive(key: PackageKey, parsed: SafeArchive) {
  const spec = specFor(key);
  if (!Buffer.isBuffer(parsed?.uncompressed) || !Array.isArray(parsed?.entries)
      || !Number.isSafeInteger(parsed?.fileBytes)) {
    fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  }
  const files = parsed.entries.filter(entry => entry.kind === 'file');
  const directories = parsed.entries.filter(entry => entry.kind === 'directory');
  const expectedDirectories = new Set<string>();
  for (const expected of spec.files) {
    const components = expected.path.split('/');
    for (let index = 1; index < components.length; index += 1) {
      expectedDirectories.add(components.slice(0, index).join('/'));
    }
  }
  if (files.length !== spec.files.length
      || directories.some(entry => !expectedDirectories.has(entry.path))) {
    fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  }
  const actual = new Map(files.map(entry => [entry.path, entry]));
  if (actual.size !== files.length) fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
  const records: NamespaceRecord[] = [];
  for (const expected of spec.files) {
    const entry = actual.get(expected.path);
    if (entry === undefined || entry.size !== expected.bytes || !canonicalPath(entry.path)
        || !Number.isSafeInteger(entry.offset) || entry.offset < 0
        || entry.offset + entry.size > parsed.uncompressed.length) {
      fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
    }
    const body = parsed.uncompressed.subarray(entry.offset, entry.offset + entry.size);
    records.push(Object.freeze({
      path: `${key.slice('node_modules/'.length)}/${entry.path}`,
      mode: expected.executable ? 0o500 : 0o400,
      bytes: entry.size,
      sha256: sha256(body),
    }));
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze(records);
}

function directory(path: string): void {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink() || realpathSync(path) !== path
      || (process.platform !== 'win32' && ((state.mode & 0o7777n) !== 0o700n
        || state.uid !== BigInt(process.getuid?.() ?? 1000)))) {
    fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
  }
}

function createDirectory(path: string): void {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  directory(path);
}

function writeExclusive(path: string, body: Uint8Array, mode: number): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), mode);
    let offset = 0;
    while (offset < body.byteLength) {
      const count = writeSync(descriptor, body, offset, body.byteLength - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0) fail('OPERATION_BUNDLE_PACKAGES_WRITE_FAILED');
      offset += count;
    }
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
    const state = fstatSync(descriptor, { bigint: true });
    if (!state.isFile() || state.nlink !== 1n || state.size !== BigInt(body.byteLength)
        || (process.platform !== 'win32' && ((state.mode & 0o777n) !== BigInt(mode)
          || state.uid !== BigInt(process.getuid?.() ?? 1000)))) {
      fail('OPERATION_BUNDLE_PACKAGES_WRITE_FAILED');
    }
  } catch (error) {
    if (error instanceof OperationBundlePackagesError) throw error;
    fail('OPERATION_BUNDLE_PACKAGES_WRITE_FAILED', error);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function expectedDirectories(records: readonly NamespaceRecord[]): Set<string> {
  const result = new Set(['']);
  for (const record of records) {
    const components = record.path.split('/');
    for (let index = 1; index < components.length; index += 1) {
      result.add(components.slice(0, index).join('/'));
    }
  }
  return result;
}

export function assertFixedOperationBundleNamespace(
  root: string, records: readonly NamespaceRecord[],
): void {
  const canonicalRoot = resolve(root);
  if (canonicalRoot !== root || !Array.isArray(records) || records.length === 0) {
    fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
  }
  const expected = new Map<string, NamespaceRecord>();
  for (const record of records) {
    if (!canonicalPath(record.path) || ![0o400, 0o500, 0o644, 0o755].includes(record.mode)
        || !Number.isSafeInteger(record.bytes) || record.bytes < 0
        || !/^[0-9a-f]{64}$/u.test(record.sha256) || expected.has(record.path)) {
      fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
    }
    expected.set(record.path, record);
  }
  const directories = expectedDirectories(records);
  const observed = new Set<string>();
  const visit = (path: string, logical: string) => {
    directory(path);
    if (!directories.has(logical)) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      if (!inside(canonicalRoot, child)) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
      const state = lstatSync(child, { bigint: true });
      const childLogical = logical === '' ? name : `${logical}/${name}`;
      if (state.isSymbolicLink()) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
      if (state.isDirectory()) visit(child, childLogical);
      else if (state.isFile()) {
        const record = expected.get(childLogical);
        if (record === undefined) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
        const opened = readLocalBindingBoundedFile(child, {
          maximumBytes: Math.max(record.bytes, 1), expectedBytes: record.bytes,
          expectedSha256: record.sha256,
          expectedMode: process.platform === 'win32' ? undefined : record.mode,
          expectedUid: process.platform === 'win32' ? undefined : (process.getuid?.() ?? 1000),
        });
        opened.body.fill(0);
        observed.add(childLogical);
      } else fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
    }
  };
  try { visit(canonicalRoot, ''); } catch (error) {
    if (error instanceof OperationBundlePackagesError) throw error;
    fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID', error);
  }
  if (observed.size !== expected.size) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
}

function parseJsonFile(path: string, maximumBytes: number): unknown {
  const opened = readLocalBindingBoundedFile(path, {
    maximumBytes, minimumBytes: 1,
    expectedUid: process.platform === 'win32' ? undefined : 1000,
  });
  try { return JSON.parse(opened.body.toString('utf8')); }
  catch (error) { return fail('OPERATION_BUNDLE_PACKAGES_LOCK_INVALID', error); }
  finally { opened.body.fill(0); }
}

function archivePath(cacheRoot: string, integrity: string): string {
  const digest = sriDigest(integrity);
  return join(cacheRoot, '_cacache', 'content-v2', 'sha512', digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
}

function readArchive(cacheRoot: string, integrity: string): Buffer {
  const digest = sriDigest(integrity);
  let opened;
  try {
    opened = readLocalBindingBoundedFile(archivePath(cacheRoot, integrity), {
      maximumBytes: MAX_ARCHIVE_BYTES, minimumBytes: 1, expectedMode: 0o400, expectedUid: 1000,
    });
    if (createHash('sha512').update(opened.body).digest('hex') !== digest) {
      fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID');
    }
    return opened.body;
  } catch (error) {
    opened?.body.fill(0);
    if (error instanceof OperationBundlePackagesError) throw error;
    fail('OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID', error);
  }
}

function createParents(root: string, path: string): void {
  const components = path.split('/').slice(0, -1);
  let current = root;
  for (const component of components) {
    current = join(current, component);
    if (!existsSync(current)) createDirectory(current);
    else directory(current);
  }
}

function extractArchive(
  nodeModules: string, key: PackageKey, archive: Buffer,
): readonly NamespaceRecord[] {
  const parsed = greaterRealmImmutableArtifactTestSeams.parseSafeNpmTar(archive) as SafeArchive;
  archive.fill(0);
  try {
    const records = validateFixedOperationBundleArchive(key, parsed);
    const packageRoot = join(nodeModules, ...key.slice('node_modules/'.length).split('/'));
    createParents(nodeModules, `${key.slice('node_modules/'.length)}/placeholder`);
    if (!existsSync(packageRoot)) createDirectory(packageRoot);
    for (const record of records) {
      const relativePath = record.path.slice(key.slice('node_modules/'.length).length + 1);
      createParents(packageRoot, relativePath);
      const entry = parsed.entries.find(candidate => candidate.kind === 'file' && candidate.path === relativePath)!;
      writeExclusive(join(packageRoot, ...relativePath.split('/')),
        parsed.uncompressed.subarray(entry.offset, entry.offset + entry.size), record.mode);
    }
    return records;
  } finally { parsed.uncompressed.fill(0); }
}

function copyYaml(
  nodeModules: string,
  yamlRoot: string,
  manifest: Readonly<{ entry: string; files: readonly NamespaceRecord[] }>,
): readonly NamespaceRecord[] {
  assertFixedOperationBundleNamespace(yamlRoot, manifest.files);
  const yamlDestination = join(nodeModules, 'yaml');
  createDirectory(yamlDestination);
  const records = manifest.files.map(record => Object.freeze({ ...record, path: `yaml/${record.path}` }));
  for (const record of manifest.files) {
    createParents(yamlDestination, record.path);
    const opened = readLocalBindingBoundedFile(join(yamlRoot, ...record.path.split('/')), {
      maximumBytes: Math.max(record.bytes, 1), expectedBytes: record.bytes,
      expectedSha256: record.sha256, expectedMode: record.mode, expectedUid: 1000,
    });
    try { writeExclusive(join(yamlDestination, ...record.path.split('/')), opened.body, record.mode); }
    finally { opened.body.fill(0); }
  }
  return Object.freeze(records);
}

export function materializeFixedOperationBundlePackages(input: Readonly<{
  sourceRoot: string;
  cacheRoot: string;
  yamlRoot: string;
  yamlManifest: Readonly<{ entry: string; files: readonly NamespaceRecord[] }>;
}>) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || !isAbsolute(input.sourceRoot) || !isAbsolute(input.cacheRoot) || !isAbsolute(input.yamlRoot)) {
    fail('OPERATION_BUNDLE_PACKAGES_INPUT_INVALID');
  }
  const packages = selectFixedOperationBundlePackages(
    parseJsonFile(join(input.sourceRoot, 'package-lock.json'), MAX_LOCK_BYTES),
  );
  const nodeModules = join(input.sourceRoot, 'node_modules');
  if (existsSync(nodeModules)) fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_INVALID');
  createDirectory(nodeModules);
  const records: NamespaceRecord[] = [];
  for (const package_ of packages) {
    records.push(...extractArchive(nodeModules, package_.key, readArchive(input.cacheRoot, package_.integrity)));
  }
  records.push(...copyYaml(nodeModules, input.yamlRoot, input.yamlManifest));
  records.sort((left, right) => left.path.localeCompare(right.path));
  assertFixedOperationBundleNamespace(nodeModules, records);
  const snapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
    root: nodeModules, boundary: input.sourceRoot,
  });
  return Object.freeze({
    root: nodeModules,
    esbuildEntry: join(nodeModules, 'esbuild', 'lib', 'main.js'),
    records: Object.freeze(records),
    contentDigest: snapshot.contentDigest,
  });
}

export function reattestFixedOperationBundlePackages(input: Readonly<{
  sourceRoot: string;
  root: string;
  records: readonly NamespaceRecord[];
  contentDigest: string;
}>): void {
  assertFixedOperationBundleNamespace(input.root, input.records);
  const snapshot = greaterRealmImmutableArtifactTestSeams.dependencyTreeSnapshot({
    root: input.root, boundary: input.sourceRoot,
  });
  if (snapshot.contentDigest !== input.contentDigest) {
    fail('OPERATION_BUNDLE_PACKAGES_NAMESPACE_CHANGED');
  }
}
