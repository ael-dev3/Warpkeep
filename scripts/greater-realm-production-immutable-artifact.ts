import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse as parseYaml } from 'yaml';

import {
  parseMigrationProofReceiptAtExactPath,
  type MigrationArtifactReceipt,
} from './publish-spacetime-dev.mjs';
import {
  attestGreaterRealmProductionCommitMaterializationRemoved,
  cleanupGreaterRealmProductionCommitMaterialization,
  createGreaterRealmProductionCommitMaterialization,
  openGreaterRealmProductionCommitMaterialization,
  resolveGreaterRealmProductionCommitTreeId,
} from './greater-realm-production-provenance';
import {
  ensureCanonicalProductionAdminStateDirectory,
  productionAdminRecordedOwnerIsDead,
  type ProductionAdminProcessIdentityProbe,
} from './production-admin-token-budget.mjs';
import {
  stageGreaterRealmOpenAtHelper,
  type GreaterRealmOpenAtHelper,
} from './greater-realm-openat';
import type { GreaterRealmCutoverJournalLockIdentity } from './greater-realm-cutover-operation-journal';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,39})$/u;
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]+={0,2})$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const MAX_PACKAGE_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const MAX_DEPENDENCY_FILE_BYTES = 256 * 1024 * 1024;
const MAX_DEPENDENCY_TREE_BYTES = 512 * 1024 * 1024;
const MAX_DEPENDENCY_TREE_ENTRIES = 20_000;
const PROOF_TIMEOUT_MS = 20 * 60 * 1_000;
const MAX_PROOF_OUTPUT_BYTES = 1_000_000;
const TRUSTED_NODE_SHA256 = '714024e01b43d82baacc136f44770a75017e9c7858542bad6746f19e7f15635d';
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const FIXTURE_NAMES = Object.freeze([
  'production-v1',
  ...Array.from({ length: 16 }, (_, index) => `additive-v${index + 2}-schema`),
  'current-candidate-inspection',
] as const);
const MODULE_DEPENDENCIES = Object.freeze({
  esbuild: '0.25.12',
  spacetimedb: '2.6.1',
  tsx: '4.20.6',
  typescript: '5.6.3',
});

export type GreaterRealmImmutableArtifactProof = Readonly<{
  artifactReceipt: MigrationArtifactReceipt;
  artifactPath: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  retentionRecord: GreaterRealmImmutableArtifactRetentionRecord;
  adoptJournalRetention: (input: Readonly<{
    lockIdentity: GreaterRealmCutoverJournalLockIdentity;
    groupDigest: string;
  }>) => void;
  cleanup: () => void;
}>;

export type GreaterRealmImmutableArtifactRetentionRecord = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-greater-realm-immutable-artifact-v1';
  materializationRoot: string;
  artifactPath: string;
  artifactDigest: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  materializationDev: string;
  materializationIno: string;
  artifactDev: string;
  artifactIno: string;
  artifactMode: '600';
  artifactUid: string;
  artifactNlink: '1';
  artifactSize: string;
  artifactMtimeNs: string;
  artifactCtimeNs: string;
}>;

const IMMUTABLE_BUILD_PHASES = Object.freeze([
  'allocated',
  'building',
  'artifact-ready',
  'journal-adopted',
] as const);
type ImmutableBuildPhase = typeof IMMUTABLE_BUILD_PHASES[number];
type ImmutableBuildIntentRecord = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-greater-realm-immutable-build-intent-v1';
  intentId: string;
  phase: ImmutableBuildPhase;
  pid: number;
  processStartIdentity: string;
  moduleSourceCommit: string;
  moduleTreeId: string;
  materializationRoot: string;
  materializationDev: string | null;
  materializationIno: string | null;
  retentionRecord: GreaterRealmImmutableArtifactRetentionRecord | null;
  receiptDirectory: string;
  operatorLockIdentity: GreaterRealmCutoverJournalLockIdentity;
  journalGroupDigest: string | null;
}>;

export class GreaterRealmImmutableArtifactError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmImmutableArtifactError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmImmutableArtifactError(code);
}

function updateLengthFramed(
  digest: ReturnType<typeof createHash>,
  label: string,
  value: string | Buffer,
): void {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const lengths = Buffer.allocUnsafe(16);
  lengths.writeBigUInt64BE(BigInt(labelBytes.byteLength), 0);
  lengths.writeBigUInt64BE(BigInt(valueBytes.byteLength), 8);
  digest.update(lengths.subarray(0, 8));
  digest.update(labelBytes);
  digest.update(lengths.subarray(8, 16));
  digest.update(valueBytes);
  lengths.fill(0);
}

function ensurePrivateParent(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { mode: DIRECTORY_MODE });
    chmodSync(path, DIRECTORY_MODE);
  }
  const status = lstatSync(path);
  const canonical = realpathSync(path);
  if (
    canonical !== resolve(path)
    || status.isSymbolicLink()
    || !status.isDirectory()
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (status.mode & 0o7777) !== DIRECTORY_MODE
  ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_DIRECTORY_INVALID');
  return canonical;
}

export type GreaterRealmImmutableProofRuntime = Readonly<{
  nodeExecutable: string;
  homeDirectory: string;
  temporaryDirectory: string;
}>;

function immutableProofChildEnvironment(
  runtime: GreaterRealmImmutableProofRuntime,
  executable: string,
  expectedNodeSha256 = TRUSTED_NODE_SHA256,
): Readonly<Record<string, string>> {
  const nodeExecutable = resolve(runtime.nodeExecutable);
  const runRoot = dirname(nodeExecutable);
  if (
    !isAbsolute(runtime.nodeExecutable)
    || nodeExecutable !== runtime.nodeExecutable
    || realpathSync(nodeExecutable) !== nodeExecutable
    || runtime.homeDirectory !== join(runRoot, 'npm-home')
    || runtime.temporaryDirectory !== join(runRoot, 'tmp')
    || resolve(runtime.homeDirectory) !== runtime.homeDirectory
    || resolve(runtime.temporaryDirectory) !== runtime.temporaryDirectory
  ) fail('GREATER_REALM_IMMUTABLE_PROOF_RUNTIME_INVALID');
  const rootStatus = lstatSync(runRoot, { bigint: true });
  const nodeStatus = lstatSync(nodeExecutable, { bigint: true });
  if (
    rootStatus.isSymbolicLink() || !rootStatus.isDirectory()
    || (rootStatus.mode & 0o7777n) !== 0o700n
    || (process.getuid !== undefined && rootStatus.uid !== BigInt(process.getuid()))
    || nodeStatus.isSymbolicLink() || !nodeStatus.isFile() || nodeStatus.nlink !== 1n
    || (nodeStatus.mode & 0o7777n) !== 0o500n
    || (process.getuid !== undefined && nodeStatus.uid !== BigInt(process.getuid()))
    || createHash('sha256').update(readFileSync(nodeExecutable)).digest('hex')
      !== expectedNodeSha256
  ) fail('GREATER_REALM_IMMUTABLE_PROOF_RUNTIME_INVALID');
  for (const directory of [runtime.homeDirectory, runtime.temporaryDirectory]) {
    if (ensurePrivateParent(directory) !== directory || dirname(directory) !== runRoot) {
      fail('GREATER_REALM_IMMUTABLE_PROOF_RUNTIME_INVALID');
    }
  }
  if (!isAbsolute(executable) || resolve(executable) !== executable) {
    fail('GREATER_REALM_IMMUTABLE_PROOF_RUNTIME_INVALID');
  }
  return Object.freeze({
    HOME: runtime.homeDirectory,
    PATH: `${runRoot}:/usr/bin:/bin`,
    TMPDIR: runtime.temporaryDirectory,
    SPACETIME_BIN: executable,
  });
}

type DependencyEntryIdentity = Readonly<{
  kind: 'directory' | 'file' | 'symlink';
  dev: bigint;
  ino: bigint;
  mode: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

type DependencyTreeSnapshot = Readonly<{
  contentDigest: string;
  identityDigest: string;
  entries: ReadonlyMap<string, DependencyEntryIdentity>;
}>;

function inside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function sameIdentity(
  left: DependencyEntryIdentity,
  right: DependencyEntryIdentity,
): boolean {
  return left.kind === right.kind
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function dependencyTreeSnapshot(input: Readonly<{
  root: string;
  boundary: string;
}>): DependencyTreeSnapshot {
  const root = resolve(input.root);
  const boundary = realpathSync(resolve(input.boundary));
  const rootStatus = lstatSync(root, { bigint: true });
  if (
    rootStatus.isSymbolicLink()
    || !rootStatus.isDirectory()
    || realpathSync(root) !== root
    || !inside(boundary, root)
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
  const content = createHash('sha256');
  const identity = createHash('sha256');
  updateLengthFramed(content, 'domain', 'warpkeep-dependency-tree-content-v2');
  updateLengthFramed(identity, 'domain', 'warpkeep-dependency-tree-identity-v2');
  const entries = new Map<string, DependencyEntryIdentity>();
  let totalBytes = 0n;
  const visit = (path: string, logicalPath: string) => {
    if (entries.size >= MAX_DEPENDENCY_TREE_ENTRIES) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const before = lstatSync(path, { bigint: true });
    if (process.getuid !== undefined && before.uid !== BigInt(process.getuid())) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const mode = before.mode & 0o7777n;
    if ((mode & 0o7000n) !== 0n) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const kind = before.isDirectory()
      ? 'directory'
      : before.isFile()
        ? 'file'
        : before.isSymbolicLink()
          ? 'symlink'
          : undefined;
    if (kind === undefined) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    if (kind !== 'symlink' && (before.mode & 0o022n) !== 0n) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const record = Object.freeze({
      kind,
      dev: before.dev,
      ino: before.ino,
      mode,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });
    entries.set(logicalPath, record);
    updateLengthFramed(content, 'entry-kind', kind);
    updateLengthFramed(content, 'entry-path', logicalPath);
    updateLengthFramed(content, 'entry-mode', mode.toString(8));
    if (kind === 'directory') {
      const names = readdirSync(path).sort();
      for (const name of names) {
        if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
          fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
        }
        visit(join(path, name), logicalPath === '' ? name : `${logicalPath}/${name}`);
      }
    } else if (kind === 'symlink') {
      const target = readlinkSync(path, 'utf8');
      const resolvedTarget = resolve(path, '..', target);
      if (
        target.length < 1
        || target.length > 4_096
        || target.includes('\0')
        || isAbsolute(target)
        || !inside(boundary, resolvedTarget)
        || !inside(boundary, realpathSync(path))
      ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      updateLengthFramed(content, 'entry-symlink-target', target);
    } else {
      if (
        before.nlink !== 1n
        || before.size < 0n
        || before.size > BigInt(MAX_DEPENDENCY_FILE_BYTES)
      ) {
        fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      }
      totalBytes += before.size;
      if (totalBytes > BigInt(MAX_DEPENDENCY_TREE_BYTES)) {
        fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
      }
      let descriptor: number | undefined;
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      const fileDigest = createHash('sha256');
      try {
        descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened = fstatSync(descriptor, { bigint: true });
        if (
          opened.dev !== before.dev
          || opened.ino !== before.ino
          || opened.size !== before.size
          || opened.mtimeNs !== before.mtimeNs
          || opened.ctimeNs !== before.ctimeNs
        ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
        let offset = 0n;
        while (offset < opened.size) {
          const remaining = opened.size - offset;
          const count = readSync(
            descriptor,
            buffer,
            0,
            Number(remaining > BigInt(buffer.byteLength) ? BigInt(buffer.byteLength) : remaining),
            Number(offset),
          );
          if (count <= 0) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
          fileDigest.update(buffer.subarray(0, count));
          offset += BigInt(count);
        }
        const after = fstatSync(descriptor, { bigint: true });
        if (
          after.dev !== opened.dev
          || after.ino !== opened.ino
          || after.size !== opened.size
          || after.mtimeNs !== opened.mtimeNs
          || after.ctimeNs !== opened.ctimeNs
        ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
      } finally {
        buffer.fill(0);
        if (descriptor !== undefined) closeSync(descriptor);
      }
      updateLengthFramed(content, 'entry-file-size', before.size.toString());
      updateLengthFramed(content, 'entry-file-sha256', fileDigest.digest());
    }
    const after = lstatSync(path, { bigint: true });
    const afterRecord: DependencyEntryIdentity = Object.freeze({
      kind: after.isDirectory() ? 'directory' : after.isFile() ? 'file' : 'symlink',
      dev: after.dev,
      ino: after.ino,
      mode: after.mode & 0o7777n,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    });
    if (!sameIdentity(record, afterRecord)) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
    }
    updateLengthFramed(identity, 'entry-path', logicalPath);
    updateLengthFramed(identity, 'entry-kind', kind);
    updateLengthFramed(identity, 'entry-dev', record.dev.toString());
    updateLengthFramed(identity, 'entry-ino', record.ino.toString());
    updateLengthFramed(identity, 'entry-mode', record.mode.toString(8));
    updateLengthFramed(identity, 'entry-size', record.size.toString());
    updateLengthFramed(identity, 'entry-mtime-ns', record.mtimeNs.toString());
    updateLengthFramed(identity, 'entry-ctime-ns', record.ctimeNs.toString());
  };
  visit(root, '');
  return Object.freeze({
    contentDigest: content.digest('hex'),
    identityDigest: identity.digest('hex'),
    entries,
  });
}

function exactJson(path: string): Readonly<Record<string, unknown>> {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Readonly<Record<string, unknown>>;
  } catch {
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
}

type LockedPackage = Readonly<{
  key: string;
  name: string;
  version: string;
  integrity: string;
  dependencies: readonly string[];
}>;

function exactRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
  return value as Readonly<Record<string, unknown>>;
}

function packageNameAndVersion(key: string): Readonly<{ name: string; version: string }> {
  const separator = key.lastIndexOf('@');
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  if (
    separator < 1
    || !PACKAGE_NAME.test(name)
    || !/^[0-9][0-9A-Za-z.+-]{0,127}$/u.test(version)
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  return Object.freeze({ name, version });
}

function exactImporterDependency(
  importer: Readonly<Record<string, unknown>>,
  field: 'dependencies' | 'devDependencies',
  name: string,
  version: string,
): void {
  const dependencies = exactRecord(importer[field]);
  const dependency = exactRecord(dependencies[name]);
  if (dependency.specifier !== version || dependency.version !== version) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
}

function lockedPackageClosure(materializedRoot: string): Readonly<{
  packages: readonly LockedPackage[];
  lockBytes: Buffer;
}> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_PLATFORM_UNSUPPORTED');
  }
  const spacetimeRoot = join(materializedRoot, 'spacetimedb');
  const lockBytes = readFileSync(join(spacetimeRoot, 'pnpm-lock.yaml'));
  let lock: Readonly<Record<string, unknown>>;
  try {
    lock = exactRecord(parseYaml(lockBytes.toString('utf8')));
  } catch (error) {
    if (error instanceof GreaterRealmImmutableArtifactError) throw error;
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
  if (String(lock.lockfileVersion) !== '9.0') {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
  const importers = exactRecord(lock.importers);
  const expectedImporters = ['.', ...FIXTURE_NAMES.map(name => `migration-fixtures/${name}`)].sort();
  if (JSON.stringify(Object.keys(importers).sort()) !== JSON.stringify(expectedImporters)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
  const rootImporter = exactRecord(importers['.']);
  exactImporterDependency(rootImporter, 'dependencies', 'spacetimedb', '2.6.1');
  for (const [name, version] of Object.entries(MODULE_DEPENDENCIES)) {
    if (name !== 'spacetimedb') {
      exactImporterDependency(rootImporter, 'devDependencies', name, version);
    }
  }
  for (const fixture of FIXTURE_NAMES) {
    const importer = exactRecord(importers[`migration-fixtures/${fixture}`]);
    exactImporterDependency(importer, 'dependencies', 'spacetimedb', '2.6.1');
    exactImporterDependency(importer, 'devDependencies', 'typescript', '5.6.3');
  }
  const packageRecords = exactRecord(lock.packages);
  const snapshots = exactRecord(lock.snapshots);
  const pending = [
    'spacetimedb@2.6.1',
    'typescript@5.6.3',
    'esbuild@0.25.12',
    'tsx@4.20.6',
  ];
  const selected = new Map<string, LockedPackage>();
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (selected.has(key)) continue;
    const { name, version } = packageNameAndVersion(key);
    const packageRecord = exactRecord(packageRecords[key]);
    const resolution = exactRecord(packageRecord.resolution);
    const integrity = resolution.integrity;
    if (typeof integrity !== 'string' || !SHA512_INTEGRITY.test(integrity)) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
    }
    const snapshot = exactRecord(snapshots[key]);
    const dependencies: string[] = [];
    for (const field of ['dependencies', 'optionalDependencies'] as const) {
      const rawDependencies = snapshot[field];
      if (rawDependencies === undefined) continue;
      for (const [dependencyName, dependencyVersion] of Object.entries(
        exactRecord(rawDependencies),
      )) {
        if (
          !PACKAGE_NAME.test(dependencyName)
          || typeof dependencyVersion !== 'string'
          || !/^[0-9][0-9A-Za-z.+-]{0,127}$/u.test(dependencyVersion)
        ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
        const dependencyKey = `${dependencyName}@${dependencyVersion}`;
        const dependencyRecord = exactRecord(packageRecords[dependencyKey]);
        const os = dependencyRecord.os;
        const cpu = dependencyRecord.cpu;
        const compatible = (os === undefined || (
          Array.isArray(os) && os.length === 1 && os[0] === process.platform
        )) && (cpu === undefined || (
          Array.isArray(cpu) && cpu.length === 1 && cpu[0] === process.arch
        ));
        if (!compatible) {
          if (field !== 'optionalDependencies') {
            fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
          }
          continue;
        }
        dependencies.push(dependencyKey);
        pending.push(dependencyKey);
      }
    }
    selected.set(key, Object.freeze({
      key,
      name,
      version,
      integrity,
      dependencies: Object.freeze(dependencies.sort()),
    }));
  }
  const packages = [...selected.values()].sort((left, right) => left.key.localeCompare(right.key));
  if (
    packages.length !== 16
    || !packages.some(value => value.key === '@esbuild/darwin-arm64@0.25.12')
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  return Object.freeze({ packages: Object.freeze(packages), lockBytes });
}

function readVerifiedCacheArchive(cacheRoot: string, integrity: string): Buffer {
  const match = integrity.match(SHA512_INTEGRITY);
  if (match === null) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  const expected = Buffer.from(match[1]!, 'base64').toString('hex');
  if (!/^[0-9a-f]{128}$/u.test(expected)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
  const path = join(
    cacheRoot,
    '_cacache',
    'content-v2',
    'sha512',
    expected.slice(0, 2),
    expected.slice(2, 4),
    expected.slice(4),
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile()
      || before.nlink !== 1n
      || before.size < 1n
      || before.size > BigInt(MAX_PACKAGE_ARCHIVE_BYTES)
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || (before.mode & 0o022n) !== 0n
    ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_CACHE_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || createHash('sha512').update(body).digest('hex') !== expected
    ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_CACHE_INVALID');
    return body;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function tarString(field: Buffer): string {
  const zero = field.indexOf(0);
  const body = zero < 0 ? field : field.subarray(0, zero);
  if (zero >= 0 && field.subarray(zero).some(value => value !== 0)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
}

function tarOctal(field: Buffer, maximum: number): number {
  const value = field.toString('ascii').replace(/[\0 ]+$/u, '').trimStart();
  if (!/^[0-7]+$/u.test(value)) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  return parsed;
}

type SafeTarEntry = Readonly<{
  path: string;
  kind: 'directory' | 'file';
  mode: 0o600 | 0o700;
  offset: number;
  size: number;
}>;

function parseSafeNpmTar(archive: Buffer): Readonly<{
  uncompressed: Buffer;
  entries: readonly SafeTarEntry[];
  fileBytes: number;
}> {
  let uncompressed: Buffer;
  try {
    uncompressed = gunzipSync(archive, { maxOutputLength: MAX_UNCOMPRESSED_ARCHIVE_BYTES });
  } catch {
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  if (uncompressed.length < 1_024 || uncompressed.length % 512 !== 0) {
    uncompressed.fill(0);
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  const entries: SafeTarEntry[] = [];
  const paths = new Set<string>();
  let offset = 0;
  let zeroBlocks = 0;
  let totalFileBytes = 0;
  while (offset + 512 <= uncompressed.length) {
    const header = uncompressed.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks >= 2) break;
      continue;
    }
    if (zeroBlocks !== 0 || entries.length >= MAX_DEPENDENCY_TREE_ENTRIES) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    let calculatedChecksum = 0;
    for (let index = 0; index < header.length; index += 1) {
      calculatedChecksum += index >= 148 && index < 156 ? 0x20 : header[index]!;
    }
    if (
      tarOctal(header.subarray(148, 156), Number.MAX_SAFE_INTEGER) !== calculatedChecksum
      || tarString(header.subarray(257, 263)) !== 'ustar'
      || tarString(header.subarray(263, 265)) !== '00'
      || tarString(header.subarray(157, 257)) !== ''
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const prefix = tarString(header.subarray(345, 500));
    const name = tarString(header.subarray(0, 100));
    const rawPath = prefix === '' ? name : `${prefix}/${name}`;
    const normalized = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const components = normalized.split('/');
    const type = header[156];
    const kind = type === 0 || type === 0x30
      ? 'file'
      : type === 0x35
        ? 'directory'
        : undefined;
    const size = tarOctal(header.subarray(124, 136), MAX_UNCOMPRESSED_ARCHIVE_BYTES);
    const archiveMode = tarOctal(header.subarray(100, 108), 0o7777);
    if (
      kind === undefined
      || (archiveMode & 0o7000) !== 0
      || normalized.length < 7
      || normalized.length > 4_096
      || /[\u0000-\u001f\u007f\\]/u.test(normalized)
      || isAbsolute(normalized)
      || components[0] !== 'package'
      || components.slice(1).some(component => component === '' || component === '.' || component === '..')
      || paths.has(normalized)
      || (kind === 'directory' && size !== 0)
      || (kind === 'file' && components.length < 2)
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    paths.add(normalized);
    totalFileBytes += size;
    if (totalFileBytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const bodyOffset = offset + 512;
    const paddedSize = Math.ceil(size / 512) * 512;
    if (
      bodyOffset + paddedSize > uncompressed.length
      || uncompressed.subarray(bodyOffset + size, bodyOffset + paddedSize)
        .some(value => value !== 0)
    ) {
      uncompressed.fill(0);
      return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    const path = components.slice(1).join('/');
    if (path !== '') {
      entries.push(Object.freeze({
        path,
        kind,
        mode: kind === 'directory' ? 0o700 : (archiveMode & 0o111) === 0 ? 0o600 : 0o700,
        offset: bodyOffset,
        size,
      }));
    }
    offset = bodyOffset + paddedSize;
  }
  if (
    zeroBlocks < 2
    || entries.length < 1
    || uncompressed.subarray(offset).some(value => value !== 0)
  ) {
    uncompressed.fill(0);
    return fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
  }
  return Object.freeze({
    uncompressed,
    entries: Object.freeze(entries),
    fileBytes: totalFileBytes,
  });
}

type DependencyExtractionBudget = {
  entries: number;
  fileBytes: number;
};

function extractVerifiedPackage(input: Readonly<{
  archive: Buffer;
  destination: string;
  boundary: string;
  budget: DependencyExtractionBudget;
  writer: GreaterRealmOpenAtHelper;
}>): void {
  const parsed = parseSafeNpmTar(input.archive);
  input.archive.fill(0);
  try {
    if (
      parsed.entries.length > MAX_DEPENDENCY_TREE_ENTRIES - input.budget.entries
      || parsed.fileBytes > MAX_DEPENDENCY_TREE_BYTES - input.budget.fileBytes
    ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    input.budget.entries += parsed.entries.length;
    input.budget.fileBytes += parsed.fileBytes;
    if (existsNoFollow(input.destination)) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_COPY_FAILED');
    const destinationRelative = relative(input.boundary, input.destination).split(sep).join('/');
    if (
      destinationRelative.startsWith('../')
      || destinationRelative === '..'
      || isAbsolute(destinationRelative)
      || resolve(input.boundary, destinationRelative) !== input.destination
    ) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
    input.writer.mkdir(destinationRelative);
    for (const entry of parsed.entries) {
      const destination = `${destinationRelative}/${entry.path}`;
      if (entry.kind === 'directory') {
        input.writer.mkdir(destination);
      } else {
        input.writer.writeFile(
          destination,
          parsed.uncompressed.subarray(entry.offset, entry.offset + entry.size),
          entry.mode,
        );
      }
    }
  } finally {
    parsed.uncompressed.fill(0);
  }
}

function pnpmDirectory(key: string): string {
  return key.replace('/', '+');
}

function createInternalSymlink(input: Readonly<{
  destination: string;
  target: string;
  boundary: string;
  writer: GreaterRealmOpenAtHelper;
}>): void {
  let destinationExists = true;
  try {
    lstatSync(input.destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') destinationExists = false;
    else throw error;
  }
  if (
    destinationExists
    || isAbsolute(input.target)
    || !inside(input.boundary, resolve(input.destination, '..', input.target))
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LINK_INVALID');
  const destination = relative(input.boundary, input.destination).split(sep).join('/');
  const target = relative(
    input.boundary,
    resolve(input.destination, '..', input.target),
  ).split(sep).join('/');
  input.writer.symlink(destination, input.target, target);
  if (!inside(input.boundary, realpathSync(input.destination))) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LINK_INVALID');
  }
}

function dependencyRoots(root: string): readonly string[] {
  return Object.freeze([
    join(root, 'spacetimedb', 'node_modules'),
    ...FIXTURE_NAMES.map(fixture => (
      join(root, 'spacetimedb', 'migration-fixtures', fixture, 'node_modules')
    )),
  ]);
}

function generatedArtifactFiles(): readonly string[] {
  return Object.freeze([
    'spacetimedb/dist/bundle.js',
    ...FIXTURE_NAMES.map(fixture => (
      `spacetimedb/migration-fixtures/${fixture}/dist/bundle.js`
    )),
  ]);
}

function dependencyClosureIdentity(input: Readonly<{
  root: string;
  snapshots: readonly DependencyTreeSnapshot[];
  packages: readonly LockedPackage[];
  lockBytes: Buffer;
}>): Readonly<{
  dependencyClosureDigest: string;
  entryCount: number;
}> {
  if (input.snapshots.length !== dependencyRoots(input.root).length) {
    fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
  }
  const metadata = createHash('sha256');
  updateLengthFramed(metadata, 'domain', 'warpkeep-spacetimedb-pnpm-dependency-metadata-v2');
  updateLengthFramed(
    metadata,
    'spacetimedb-package-json',
    readFileSync(join(input.root, 'spacetimedb', 'package.json')),
  );
  updateLengthFramed(metadata, 'spacetimedb-pnpm-lock-yaml', input.lockBytes);
  updateLengthFramed(metadata, 'selected-packages-json', JSON.stringify(input.packages));
  const metadataDigest = metadata.digest();
  const digest = createHash('sha256');
  updateLengthFramed(digest, 'domain', 'warpkeep-spacetimedb-pnpm-dependency-closure-v2');
  updateLengthFramed(digest, 'metadata-sha256', metadataDigest);
  const roots = dependencyRoots(input.root);
  let entryCount = 0;
  input.snapshots.forEach((snapshot, index) => {
    updateLengthFramed(
      digest,
      'root-path',
      relative(input.root, roots[index]!).split(sep).join('/'),
    );
    updateLengthFramed(digest, 'root-entry-count', String(snapshot.entries.size));
    updateLengthFramed(digest, 'root-content-sha256', snapshot.contentDigest);
    entryCount += snapshot.entries.size;
  });
  return Object.freeze({
    dependencyClosureDigest: digest.digest('hex'),
    entryCount,
  });
}

function requireConstructedDependencyMetadata(root: string): void {
  const spacetimeRoot = join(root, 'spacetimedb');
  const nodeModules = join(spacetimeRoot, 'node_modules');
  const manifest = exactJson(join(spacetimeRoot, 'package.json'));
  if (
    manifest.private !== true
    || manifest.packageManager !== 'pnpm@11.7.0'
    || JSON.stringify(manifest.dependencies) !== JSON.stringify({ spacetimedb: '2.6.1' })
    || JSON.stringify(manifest.devDependencies) !== JSON.stringify({
      esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3',
    })
    || JSON.stringify(readdirSync(nodeModules).sort()) !== JSON.stringify([
      '.bin', '.pnpm', 'esbuild', 'spacetimedb', 'tsx', 'typescript',
    ])
    || !readFileSync(join(nodeModules, '.pnpm', 'lock.yaml'))
      .equals(readFileSync(join(spacetimeRoot, 'pnpm-lock.yaml')))
  ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  for (const [name, version] of Object.entries(MODULE_DEPENDENCIES)) {
    const target = `.pnpm/${pnpmDirectory(`${name}@${version}`)}/node_modules/${name}`;
    if (readlinkSync(join(nodeModules, name), 'utf8') !== target) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
    }
    const packageManifest = exactJson(join(nodeModules, name, 'package.json'));
    if (packageManifest.name !== name || packageManifest.version !== version) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
    }
  }
  for (const fixture of FIXTURE_NAMES) {
    const fixtureRoot = join(spacetimeRoot, 'migration-fixtures', fixture);
    const fixtureManifest = exactJson(join(fixtureRoot, 'package.json'));
    const fixtureModules = join(fixtureRoot, 'node_modules');
    if (
      fixtureManifest.private !== true
      || JSON.stringify(fixtureManifest.dependencies) !== JSON.stringify({ spacetimedb: '2.6.1' })
      || JSON.stringify(fixtureManifest.devDependencies) !== JSON.stringify({ typescript: '5.6.3' })
      || JSON.stringify(readdirSync(fixtureModules).sort()) !== JSON.stringify([
        '.bin', 'spacetimedb', 'typescript',
      ])
      || readlinkSync(join(fixtureModules, 'spacetimedb'), 'utf8')
        !== '../../../node_modules/.pnpm/spacetimedb@2.6.1/node_modules/spacetimedb'
      || readlinkSync(join(fixtureModules, 'typescript'), 'utf8')
        !== '../../../node_modules/.pnpm/typescript@5.6.3/node_modules/typescript'
      || JSON.stringify(readdirSync(join(fixtureModules, '.bin')).sort())
        !== JSON.stringify(['tsc', 'tsserver'])
    ) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
  }
}

function installLockedDependencyClosureWithWriter(input: Readonly<{
  materializedRoot: string;
  dependencyCacheRoot: string;
  writer: GreaterRealmOpenAtHelper;
}>): Readonly<{
  dependencyClosureDigest: string;
  snapshots: readonly DependencyTreeSnapshot[];
}> {
  const locked = lockedPackageClosure(input.materializedRoot);
  const spacetimeRoot = join(input.materializedRoot, 'spacetimedb');
  const nodeModules = join(spacetimeRoot, 'node_modules');
  const virtualStore = join(nodeModules, '.pnpm');
  const cacheRoot = ensurePrivateParent(input.dependencyCacheRoot);
  input.writer.mkdir('node_modules/.pnpm');
  const extractionBudget: DependencyExtractionBudget = { entries: 0, fileBytes: 0 };
  for (const package_ of locked.packages) {
    const virtualNodeModules = join(
      virtualStore,
      pnpmDirectory(package_.key),
      'node_modules',
    );
    const destination = join(virtualNodeModules, ...package_.name.split('/'));
    const archive = readVerifiedCacheArchive(cacheRoot, package_.integrity);
    extractVerifiedPackage({
      archive,
      destination,
      boundary: spacetimeRoot,
      budget: extractionBudget,
      writer: input.writer,
    });
    const packageManifest = exactJson(join(destination, 'package.json'));
    if (packageManifest.name !== package_.name || packageManifest.version !== package_.version) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_ARCHIVE_INVALID');
    }
  }
  const packagesByKey = new Map(locked.packages.map(value => [value.key, value]));
  for (const package_ of locked.packages) {
    const virtualNodeModules = join(
      virtualStore,
      pnpmDirectory(package_.key),
      'node_modules',
    );
    for (const dependencyKey of package_.dependencies) {
      const dependency = packagesByKey.get(dependencyKey);
      if (dependency === undefined) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_LOCK_INVALID');
      const destination = join(virtualNodeModules, ...dependency.name.split('/'));
      const dependencyPath = join(
        virtualStore,
        pnpmDirectory(dependency.key),
        'node_modules',
        ...dependency.name.split('/'),
      );
      createInternalSymlink({
        destination,
        target: relative(resolve(destination, '..'), dependencyPath),
        boundary: spacetimeRoot,
        writer: input.writer,
      });
    }
  }
  const rootPackages = [
    ['esbuild', '0.25.12'],
    ['spacetimedb', '2.6.1'],
    ['tsx', '4.20.6'],
    ['typescript', '5.6.3'],
  ] as const;
  for (const [name, version] of rootPackages) {
    createInternalSymlink({
      destination: join(nodeModules, name),
      target: `.pnpm/${pnpmDirectory(`${name}@${version}`)}/node_modules/${name}`,
      boundary: spacetimeRoot,
      writer: input.writer,
    });
  }
  const rootBins = [
    ['esbuild', '../esbuild/bin/esbuild'],
    ['tsc', '../typescript/bin/tsc'],
    ['tsserver', '../typescript/bin/tsserver'],
    ['tsx', '../tsx/dist/cli.mjs'],
  ] as const;
  for (const [name, target] of rootBins) {
    createInternalSymlink({
      destination: join(nodeModules, '.bin', name),
      target,
      boundary: spacetimeRoot,
      writer: input.writer,
    });
  }
  input.writer.writeFile('node_modules/.pnpm/lock.yaml', locked.lockBytes, 0o600);
  for (const fixture of FIXTURE_NAMES) {
    const fixtureModules = join(spacetimeRoot, 'migration-fixtures', fixture, 'node_modules');
    createInternalSymlink({
      destination: join(fixtureModules, 'spacetimedb'),
      target: '../../../node_modules/.pnpm/spacetimedb@2.6.1/node_modules/spacetimedb',
      boundary: spacetimeRoot,
      writer: input.writer,
    });
    createInternalSymlink({
      destination: join(fixtureModules, 'typescript'),
      target: '../../../node_modules/.pnpm/typescript@5.6.3/node_modules/typescript',
      boundary: spacetimeRoot,
      writer: input.writer,
    });
    for (const name of ['tsc', 'tsserver'] as const) {
      const destination = join(fixtureModules, '.bin', name);
      createInternalSymlink({
        destination,
        target: relative(
          resolve(destination, '..'),
          join(nodeModules, 'typescript', 'bin', name),
        ),
        boundary: spacetimeRoot,
        writer: input.writer,
      });
    }
  }
  requireConstructedDependencyMetadata(input.materializedRoot);
  const boundary = realpathSync(spacetimeRoot);
  const snapshots = dependencyRoots(input.materializedRoot).map(path => dependencyTreeSnapshot({
    root: path,
    boundary,
  }));
  const identity = dependencyClosureIdentity({
    root: input.materializedRoot,
    snapshots,
    packages: locked.packages,
    lockBytes: locked.lockBytes,
  });
  return Object.freeze({
    dependencyClosureDigest: identity.dependencyClosureDigest,
    snapshots: Object.freeze(snapshots),
  });
}

function installLockedDependencyClosure(input: Readonly<{
  materializedRoot: string;
  dependencyCacheRoot: string;
}>): Readonly<{
  dependencyClosureDigest: string;
  snapshots: readonly DependencyTreeSnapshot[];
}> {
  const writer = stageGreaterRealmOpenAtHelper({
    root: join(input.materializedRoot, 'spacetimedb'),
  });
  let result: ReturnType<typeof installLockedDependencyClosureWithWriter> | undefined;
  let primaryError: unknown;
  try {
    result = installLockedDependencyClosureWithWriter({ ...input, writer });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError: unknown;
  try { writer.finish(); } catch (error) { cleanupError = error; }
  if (primaryError !== undefined || cleanupError !== undefined) {
    throw new AggregateError(
      [...(primaryError === undefined ? [] : [primaryError]),
        ...(cleanupError === undefined ? [] : [cleanupError])],
      'GREATER_REALM_IMMUTABLE_DEPENDENCY_INSTALL_FAILED',
    );
  }
  return result ?? fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_INSTALL_FAILED');
}

type ProvenArtifactIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  mode: bigint;
  uid: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  digest: string;
}>;

function attestProvenArtifact(
  path: string,
  expected?: ProvenArtifactIdentity,
  durable = false,
): ProvenArtifactIdentity {
  let descriptor: number | undefined;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile()
      || before.nlink !== 1n
      || before.size < 1n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)
      || (before.mode & 0o7777n) !== BigInt(FILE_MODE)
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_INVALID');
    const digest = createHash('sha256');
    let offset = 0n;
    while (offset < before.size) {
      const remaining = before.size - offset;
      const count = readSync(
        descriptor,
        buffer,
        0,
        Number(remaining > BigInt(buffer.byteLength) ? BigInt(buffer.byteLength) : remaining),
        Number(offset),
      );
      if (count <= 0) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_INVALID');
      digest.update(buffer.subarray(0, count));
      offset += BigInt(count);
    }
    if (durable) fsyncSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    const identity = Object.freeze({
      dev: after.dev,
      ino: after.ino,
      mode: after.mode & 0o7777n,
      uid: after.uid,
      nlink: after.nlink,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
      digest: digest.digest('hex'),
    });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || (after.mode & 0o7777n) !== BigInt(FILE_MODE)
      || after.uid !== before.uid
      || after.nlink !== 1n
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
      || current.dev !== after.dev
      || current.ino !== after.ino
      || (current.mode & 0o7777n) !== BigInt(FILE_MODE)
      || current.uid !== after.uid
      || current.nlink !== 1n
      || current.size !== after.size
      || realpathSync(path) !== path
      || (expected !== undefined && (
        identity.dev !== expected.dev
        || identity.ino !== expected.ino
        || identity.mode !== expected.mode
        || identity.uid !== expected.uid
        || identity.nlink !== expected.nlink
        || identity.size !== expected.size
        || identity.mtimeNs !== expected.mtimeNs
        || identity.ctimeNs !== expected.ctimeNs
        || identity.digest !== expected.digest
      ))
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CHANGED');
    return identity;
  } finally {
    buffer.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseRetentionRecord(
  value: unknown,
): GreaterRealmImmutableArtifactRetentionRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(raw).join(',') !== [
      'schemaVersion', 'profile', 'materializationRoot', 'artifactPath', 'artifactDigest',
      'moduleSourceCommit', 'moduleTreeId', 'dependencyClosureDigest',
      'materializationDev', 'materializationIno', 'artifactDev', 'artifactIno',
      'artifactMode', 'artifactUid', 'artifactNlink', 'artifactSize',
      'artifactMtimeNs', 'artifactCtimeNs',
    ].join(',')
    || raw.schemaVersion !== 1
    || raw.profile !== 'warpkeep-greater-realm-immutable-artifact-v1'
    || typeof raw.materializationRoot !== 'string'
    || !isAbsolute(raw.materializationRoot)
    || resolve(raw.materializationRoot) !== raw.materializationRoot
    || !/^[0-9a-f]{32}$/u.test(basename(raw.materializationRoot))
    || typeof raw.artifactPath !== 'string'
    || raw.artifactPath !== join(raw.materializationRoot, 'spacetimedb', 'dist', 'bundle.js')
    || typeof raw.artifactDigest !== 'string'
    || !SHA256.test(raw.artifactDigest)
    || typeof raw.moduleSourceCommit !== 'string'
    || !COMMIT.test(raw.moduleSourceCommit)
    || typeof raw.moduleTreeId !== 'string'
    || !COMMIT.test(raw.moduleTreeId)
    || typeof raw.dependencyClosureDigest !== 'string'
    || !SHA256.test(raw.dependencyClosureDigest)
    || ![
      raw.materializationDev, raw.materializationIno, raw.artifactDev, raw.artifactIno,
      raw.artifactUid, raw.artifactSize, raw.artifactMtimeNs, raw.artifactCtimeNs,
    ].every(child => typeof child === 'string' && DECIMAL.test(child))
    || raw.artifactMode !== '600'
    || raw.artifactNlink !== '1'
  ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
  return Object.freeze(raw as GreaterRealmImmutableArtifactRetentionRecord);
}

function safeIdentityNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
  }
  return parsed;
}

const CLEANUP_PHASES = Object.freeze([
  'prepared',
  'artifact-unlinking',
  'artifact-removed',
  'tree-removing',
  'complete',
] as const);
type ImmutableCleanupPhase = typeof CLEANUP_PHASES[number];

function existsNoFollow(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function fsyncExactDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const status = fstatSync(descriptor);
    if (!status.isDirectory()) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

const BUILD_INTENT_FILE = /^\.greater-realm-immutable-build-([0-9a-f]{32})\.json$/u;
const BUILD_INTENT_TEMPORARY_FILE = /^\.greater-realm-immutable-build-([0-9a-f]{32})-([0-9a-f]{32})\.json\.tmp$/u;

function buildIntentPath(parent: string, intentId: string): string {
  if (!/^[0-9a-f]{32}$/u.test(intentId)) {
    fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  }
  return join(parent, `.greater-realm-immutable-build-${intentId}.json`);
}

function parseBuildIntent(value: unknown): ImmutableBuildIntentRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(raw).join(',') !== [
      'schemaVersion', 'profile', 'intentId', 'phase', 'pid', 'processStartIdentity',
      'moduleSourceCommit', 'moduleTreeId', 'materializationRoot',
      'materializationDev', 'materializationIno', 'retentionRecord',
      'receiptDirectory', 'operatorLockIdentity', 'journalGroupDigest',
    ].join(',')
    || raw.schemaVersion !== 1
    || raw.profile !== 'warpkeep-greater-realm-immutable-build-intent-v1'
    || typeof raw.intentId !== 'string' || !/^[0-9a-f]{32}$/u.test(raw.intentId)
    || typeof raw.phase !== 'string'
    || !IMMUTABLE_BUILD_PHASES.includes(raw.phase as ImmutableBuildPhase)
    || !Number.isSafeInteger(raw.pid) || Number(raw.pid) < 1
    || typeof raw.processStartIdentity !== 'string'
    || raw.processStartIdentity.length < 1 || raw.processStartIdentity.length > 128
    || typeof raw.moduleSourceCommit !== 'string' || !COMMIT.test(raw.moduleSourceCommit)
    || typeof raw.moduleTreeId !== 'string' || !COMMIT.test(raw.moduleTreeId)
    || typeof raw.materializationRoot !== 'string'
    || !isAbsolute(raw.materializationRoot)
    || resolve(raw.materializationRoot) !== raw.materializationRoot
    || basename(raw.materializationRoot) !== raw.intentId
    || !(
      (raw.materializationDev === null && raw.materializationIno === null)
      || (typeof raw.materializationDev === 'string' && DECIMAL.test(raw.materializationDev)
        && typeof raw.materializationIno === 'string' && DECIMAL.test(raw.materializationIno))
    )
    || !(
      raw.retentionRecord === null
      || JSON.stringify(parseRetentionRecord(raw.retentionRecord))
        === JSON.stringify(raw.retentionRecord)
    )
    || typeof raw.receiptDirectory !== 'string'
    || !isAbsolute(raw.receiptDirectory) || resolve(raw.receiptDirectory) !== raw.receiptDirectory
    || raw.operatorLockIdentity === null || typeof raw.operatorLockIdentity !== 'object'
    || Array.isArray(raw.operatorLockIdentity)
    || Object.keys(raw.operatorLockIdentity as object).join(',')
      !== 'lockId,pid,processStartIdentity,createdAtMs,expiresAtMs,dev,ino'
    || typeof (raw.operatorLockIdentity as Record<string, unknown>).lockId !== 'string'
    || !/^[0-9a-f]{32}$/u.test(
      (raw.operatorLockIdentity as Record<string, unknown>).lockId as string,
    )
    || ![
      (raw.operatorLockIdentity as Record<string, unknown>).pid,
      (raw.operatorLockIdentity as Record<string, unknown>).createdAtMs,
      (raw.operatorLockIdentity as Record<string, unknown>).expiresAtMs,
      (raw.operatorLockIdentity as Record<string, unknown>).dev,
      (raw.operatorLockIdentity as Record<string, unknown>).ino,
    ].every(child => Number.isSafeInteger(child) && Number(child) >= 0)
    || Number((raw.operatorLockIdentity as Record<string, unknown>).pid) < 1
    || typeof (raw.operatorLockIdentity as Record<string, unknown>).processStartIdentity !== 'string'
    || (raw.operatorLockIdentity as Record<string, unknown>).processStartIdentity
      !== raw.processStartIdentity
    || (raw.operatorLockIdentity as Record<string, unknown>).pid !== raw.pid
    || !(
      raw.journalGroupDigest === null
      || (typeof raw.journalGroupDigest === 'string' && SHA256.test(raw.journalGroupDigest))
    )
    || (raw.phase === 'allocated' && (
      raw.materializationDev !== null || raw.materializationIno !== null
      || raw.retentionRecord !== null || raw.journalGroupDigest !== null
    ))
    || (raw.phase === 'building' && (
      raw.materializationDev === null || raw.materializationIno === null
      || raw.retentionRecord !== null || raw.journalGroupDigest !== null
    ))
    || (raw.phase === 'artifact-ready' && (
      raw.materializationDev === null || raw.materializationIno === null
      || raw.retentionRecord === null || raw.journalGroupDigest !== null
    ))
    || (raw.phase === 'journal-adopted' && (
      raw.materializationDev === null || raw.materializationIno === null
      || raw.retentionRecord === null || raw.journalGroupDigest === null
    ))
  ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  return Object.freeze(raw as ImmutableBuildIntentRecord);
}

function readBuildIntent(path: string): ImmutableBuildIntentRecord {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let before = fstatSync(descriptor, { bigint: true });
    if (before.nlink === 2n) {
      const parent = dirname(path);
      const intentId = BUILD_INTENT_FILE.exec(basename(path))?.[1];
      if (intentId === undefined) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
      const candidates = readdirSync(parent)
        .filter(name => BUILD_INTENT_TEMPORARY_FILE.exec(name)?.[1] === intentId)
        .map(name => join(parent, name))
        .filter(candidate => {
          const status = lstatSync(candidate, { bigint: true });
          return status.isFile() && !status.isSymbolicLink()
            && status.dev === before.dev && status.ino === before.ino
            && (status.mode & 0o7777n) === 0o600n
            && (process.getuid === undefined || status.uid === BigInt(process.getuid()));
        });
      if (candidates.length !== 1) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
      unlinkSync(candidates[0]!);
      fsyncExactDirectory(parent);
      before = fstatSync(descriptor, { bigint: true });
    }
    if (
      !before.isFile() || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 1n || before.size > 64n * 1024n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
    ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      return fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
    } finally {
      body.fill(0);
    }
    const record = parseBuildIntent(parsed);
    if (buildIntentPath(dirname(path), record.intentId) !== path) {
      fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
    }
    return record;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeBuildIntent(input: Readonly<{
  path: string;
  record: ImmutableBuildIntentRecord;
  initial: boolean;
}>): void {
  const parent = ensurePrivateParent(dirname(input.path));
  if (input.path !== buildIntentPath(parent, input.record.intentId)) {
    fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  }
  const body = Buffer.from(`${JSON.stringify(input.record)}\n`, 'utf8');
  const temporary = join(parent, `.greater-realm-immutable-build-${input.record.intentId}-${
    randomUUID().replaceAll('-', '')
  }.json.tmp`);
  let descriptor: number | undefined;
  let temporaryPresent = false;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      | (constants.O_NOFOLLOW ?? 0), FILE_MODE);
    temporaryPresent = true;
    let offset = 0;
    while (offset < body.byteLength) {
      const count = writeSync(descriptor, body, offset, body.byteLength - offset);
      if (count <= 0) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_WRITE_FAILED');
      offset += count;
    }
    fsyncSync(descriptor);
    const status = fstatSync(descriptor, { bigint: true });
    if (!status.isFile() || status.nlink !== 1n || (status.mode & 0o7777n) !== 0o600n) {
      fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_WRITE_FAILED');
    }
    closeSync(descriptor);
    descriptor = undefined;
    if (input.initial) {
      linkSync(temporary, input.path);
      fsyncExactDirectory(parent);
      unlinkSync(temporary);
      temporaryPresent = false;
      fsyncExactDirectory(parent);
    } else {
      readBuildIntent(input.path);
      renameSync(temporary, input.path);
      temporaryPresent = false;
      fsyncExactDirectory(parent);
    }
  } catch (error) {
    if (input.initial && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_ALREADY_EXISTS');
    }
    throw error;
  } finally {
    body.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporaryPresent) {
      try { unlinkSync(temporary); } catch { /* The durable final record remains authoritative. */ }
    }
  }
}

function removeExactBuildTree(path: string, boundary: string): void {
  const status = lstatSync(path);
  if (status.isSymbolicLink()) {
    const target = resolve(dirname(path), readlinkSync(path, 'utf8'));
    if (!inside(boundary, target)) fail('GREATER_REALM_IMMUTABLE_BUILD_CLEANUP_FAILED');
    unlinkSync(path);
    fsyncExactDirectory(dirname(path));
    return;
  }
  if (status.isFile()) {
    if (
      status.nlink !== 1
      || (status.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) fail('GREATER_REALM_IMMUTABLE_BUILD_CLEANUP_FAILED');
    unlinkSync(path);
    fsyncExactDirectory(dirname(path));
    return;
  }
  if (
    !status.isDirectory() || (status.mode & 0o7777) !== DIRECTORY_MODE
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('GREATER_REALM_IMMUTABLE_BUILD_CLEANUP_FAILED');
  for (const child of readdirSync(path).sort().reverse()) {
    removeExactBuildTree(join(path, child), boundary);
  }
  rmdirSync(path);
  fsyncExactDirectory(dirname(path));
}

function cleanupBuildIntent(input: Readonly<{
  path: string;
  record: ImmutableBuildIntentRecord;
  repositoryRoot: string;
}>): void {
  const record = parseBuildIntent(input.record);
  if (record.phase !== 'allocated' && record.phase !== 'building') {
    fail('GREATER_REALM_IMMUTABLE_BUILD_ARTIFACT_RECOVERY_REQUIRED');
  }
  if (existsNoFollow(record.materializationRoot)) {
    const rootStatus = lstatSync(record.materializationRoot);
    if (
      rootStatus.isSymbolicLink() || !rootStatus.isDirectory()
      || (rootStatus.mode & 0o7777) !== DIRECTORY_MODE
      || (process.getuid !== undefined && rootStatus.uid !== process.getuid())
      || (record.materializationDev !== null && (
        rootStatus.dev !== safeIdentityNumber(record.materializationDev)
        || rootStatus.ino !== safeIdentityNumber(record.materializationIno!)
      ))
    ) fail('GREATER_REALM_IMMUTABLE_BUILD_CLEANUP_FAILED');
    const spacetimeBoundary = join(record.materializationRoot, 'spacetimedb');
    for (const root of [...dependencyRoots(record.materializationRoot)].reverse()) {
      if (existsNoFollow(root)) removeExactBuildTree(root, spacetimeBoundary);
    }
    const generatedDirectories = [...new Set(generatedArtifactFiles().map(relativePath => (
      dirname(join(record.materializationRoot, ...relativePath.split('/')))
    )))].sort().reverse();
    for (const directory of generatedDirectories) {
      if (existsNoFollow(directory)) removeExactBuildTree(directory, spacetimeBoundary);
    }
    const authorisedAncestors = new Set<string>();
    for (const child of [
      ...dependencyRoots(record.materializationRoot),
      ...generatedDirectories,
    ]) {
      let ancestor = dirname(child);
      while (ancestor !== record.materializationRoot) {
        authorisedAncestors.add(ancestor);
        ancestor = dirname(ancestor);
      }
    }
    for (const ancestor of [...authorisedAncestors].sort((left, right) => (
      right.split(sep).length - left.split(sep).length
    ))) {
      if (!existsNoFollow(ancestor) || readdirSync(ancestor).length !== 0) continue;
      const status = lstatSync(ancestor);
      if (
        status.isSymbolicLink() || !status.isDirectory()
        || (status.mode & 0o7777) !== DIRECTORY_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_IMMUTABLE_BUILD_CLEANUP_FAILED');
      rmdirSync(ancestor);
      fsyncExactDirectory(dirname(ancestor));
    }
    cleanupGreaterRealmProductionCommitMaterialization({
      repositoryRoot: input.repositoryRoot,
      moduleSourceCommit: record.moduleSourceCommit,
      moduleTreeId: record.moduleTreeId,
      destination: record.materializationRoot,
      expectedRootIdentity: { dev: rootStatus.dev, ino: rootStatus.ino },
      allowPartialTracked: record.phase === 'allocated',
    });
  } else {
    attestGreaterRealmProductionCommitMaterializationRemoved({
      repositoryRoot: input.repositoryRoot,
      destination: record.materializationRoot,
    });
  }
  unlinkSync(input.path);
  fsyncExactDirectory(dirname(input.path));
}

function recoverDeadBuildIntents(input: Readonly<{
  parent: string;
  repositoryRoot: string;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
}>): void {
  const parent = ensurePrivateParent(input.parent);
  for (const name of readdirSync(parent).sort()) {
    const temporary = BUILD_INTENT_TEMPORARY_FILE.exec(name);
    if (temporary !== null) {
      const finalPath = buildIntentPath(parent, temporary[1]!);
      if (existsNoFollow(finalPath)) {
        readBuildIntent(finalPath);
        if (existsNoFollow(join(parent, name))) {
          const status = lstatSync(join(parent, name));
          if (status.isSymbolicLink() || !status.isFile()) {
            fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
          }
          unlinkSync(join(parent, name));
          fsyncExactDirectory(parent);
        }
      } else {
        const materializationRoot = join(parent, temporary[1]!);
        if (existsNoFollow(materializationRoot)) {
          fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
        }
        const status = lstatSync(join(parent, name));
        if (
          status.isSymbolicLink() || !status.isFile() || status.nlink !== 1
          || (status.mode & 0o7777) !== FILE_MODE
          || (process.getuid !== undefined && status.uid !== process.getuid())
        ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
        unlinkSync(join(parent, name));
        fsyncExactDirectory(parent);
      }
      continue;
    }
    if (!BUILD_INTENT_FILE.test(name)) continue;
    const path = join(parent, name);
    const record = readBuildIntent(path);
    const dead = productionAdminRecordedOwnerIsDead({
      pid: record.pid,
      processStartIdentity: record.processStartIdentity,
      ...(input.processIdentityProbe === undefined
        ? {}
        : { probe: input.processIdentityProbe }),
    });
    if (dead !== true) fail('GREATER_REALM_IMMUTABLE_BUILD_OWNER_NOT_PROVEN_DEAD');
    if (record.phase === 'artifact-ready') {
      const directoryStatus = lstatSync(record.receiptDirectory);
      if (
        directoryStatus.isSymbolicLink() || !directoryStatus.isDirectory()
        || (directoryStatus.mode & 0o7777) !== DIRECTORY_MODE
        || (process.getuid !== undefined && directoryStatus.uid !== process.getuid())
        || realpathSync(record.receiptDirectory) !== record.receiptDirectory
      ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
      const lockId = record.operatorLockIdentity.lockId;
      if (readdirSync(record.receiptDirectory).some(name => (
        name.startsWith(`.greater-realm-cutover-command-group-${lockId}-`)
      ))) fail('GREATER_REALM_IMMUTABLE_BUILD_ARTIFACT_RECOVERY_REQUIRED');
      cleanupGreaterRealmRetainedImmutableArtifact({
        repositoryRoot: input.repositoryRoot,
        record: record.retentionRecord!,
      });
      continue;
    }
    if (record.phase === 'journal-adopted') {
      fail('GREATER_REALM_IMMUTABLE_BUILD_ARTIFACT_RECOVERY_REQUIRED');
    }
    cleanupBuildIntent({ path, record, repositoryRoot: input.repositoryRoot });
  }
}

function cleanupRetentionDigest(record: GreaterRealmImmutableArtifactRetentionRecord): string {
  return createHash('sha256')
    .update('warpkeep-greater-realm-immutable-artifact-retention-v1\0', 'utf8')
    .update(JSON.stringify(record), 'utf8')
    .digest('hex');
}

function cleanupTombstonePath(record: GreaterRealmImmutableArtifactRetentionRecord): string {
  return join(
    resolve(record.materializationRoot, '..'),
    `.greater-realm-immutable-cleanup-${cleanupRetentionDigest(record)}.json`,
  );
}

function retireArtifactReadyBuildIntent(
  record: GreaterRealmImmutableArtifactRetentionRecord,
): void {
  const parent = dirname(record.materializationRoot);
  const path = buildIntentPath(parent, basename(record.materializationRoot));
  if (!existsNoFollow(path)) return;
  const intent = readBuildIntent(path);
  if (
    (intent.phase !== 'artifact-ready' && intent.phase !== 'journal-adopted')
    || intent.materializationRoot !== record.materializationRoot
    || JSON.stringify(intent.retentionRecord) !== JSON.stringify(record)
  ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  unlinkSync(path);
  fsyncExactDirectory(parent);
}

function readCleanupPhase(
  path: string,
  record: GreaterRealmImmutableArtifactRetentionRecord,
): ImmutableCleanupPhase | undefined {
  let descriptor: number | undefined;
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    let before = fstatSync(descriptor, { bigint: true });
    if (before.nlink === 2n) {
      const parent = resolve(path, '..');
      const prefix = `.greater-realm-immutable-cleanup-${cleanupRetentionDigest(record)}-`;
      const candidates = readdirSync(parent)
        .filter(name => name.startsWith(prefix) && /^[a-z0-9.-]{1,200}$/u.test(name))
        .map(name => join(parent, name))
        .filter(candidate => {
          const status = lstatSync(candidate, { bigint: true });
          return status.isFile()
            && !status.isSymbolicLink()
            && status.dev === before.dev
            && status.ino === before.ino
            && (status.mode & 0o7777n) === 0o600n
            && (process.getuid === undefined || status.uid === BigInt(process.getuid()));
        });
      if (candidates.length !== 1) {
        fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
      }
      unlinkSync(candidates[0]!);
      fsyncExactDirectory(parent);
      before = fstatSync(descriptor, { bigint: true });
    }
    if (
      !before.isFile()
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 1n
      || before.size > 32n * 1024n
      || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      return fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    }
    const raw = value as Readonly<Record<string, unknown>>;
    if (
      Object.keys(raw).join(',') !== 'schemaVersion,profile,retentionDigest,phase,record'
      || raw.schemaVersion !== 1
      || raw.profile !== 'warpkeep-greater-realm-immutable-artifact-cleanup-v1'
      || raw.retentionDigest !== cleanupRetentionDigest(record)
      || typeof raw.phase !== 'string'
      || !CLEANUP_PHASES.includes(raw.phase as ImmutableCleanupPhase)
      || JSON.stringify(raw.record) !== JSON.stringify(record)
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    return raw.phase as ImmutableCleanupPhase;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeCleanupPhase(input: Readonly<{
  path: string;
  record: GreaterRealmImmutableArtifactRetentionRecord;
  phase: ImmutableCleanupPhase;
  initial: boolean;
}>): ImmutableCleanupPhase {
  const parent = ensurePrivateParent(resolve(input.path, '..'));
  if (dirname(input.path) !== parent) {
    fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
  }
  const body = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-greater-realm-immutable-artifact-cleanup-v1',
    retentionDigest: cleanupRetentionDigest(input.record),
    phase: input.phase,
    record: input.record,
  })}\n`, 'utf8');
  const temporary = join(parent, `.greater-realm-immutable-cleanup-${cleanupRetentionDigest(
    input.record,
  )}-${randomUUID().replaceAll('-', '')}.tmp`);
  let descriptor: number | undefined;
  let temporaryInstalled = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    temporaryInstalled = true;
    let offset = 0;
    while (offset < body.byteLength) {
      const count = writeSync(descriptor, body, offset, body.byteLength - offset);
      if (count <= 0) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_WRITE_FAILED');
      offset += count;
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    const status = fstatSync(descriptor, { bigint: true });
    if (
      !status.isFile()
      || status.nlink !== 1n
      || (status.mode & 0o7777n) !== 0o600n
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    if (input.initial) {
      try {
        linkSync(temporary, input.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        unlinkSync(temporary);
        temporaryInstalled = false;
        return readCleanupPhase(input.path, input.record)
          ?? fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
      }
      fsyncExactDirectory(parent);
      unlinkSync(temporary);
      temporaryInstalled = false;
      fsyncExactDirectory(parent);
    } else {
      if (readCleanupPhase(input.path, input.record) === undefined) {
        fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
      }
      renameSync(temporary, input.path);
      temporaryInstalled = false;
      fsyncExactDirectory(parent);
    }
    return input.phase;
  } finally {
    body.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporaryInstalled) {
      try { unlinkSync(temporary); } catch { /* Preserve the primary fail-closed error. */ }
    }
  }
}

function retainedArtifactIdentity(
  record: GreaterRealmImmutableArtifactRetentionRecord,
): ProvenArtifactIdentity {
  return Object.freeze({
    dev: BigInt(record.artifactDev),
    ino: BigInt(record.artifactIno),
    mode: BigInt(`0o${record.artifactMode}`),
    uid: BigInt(record.artifactUid),
    nlink: BigInt(record.artifactNlink),
    size: BigInt(record.artifactSize),
    mtimeNs: BigInt(record.artifactMtimeNs),
    ctimeNs: BigInt(record.artifactCtimeNs),
    digest: record.artifactDigest,
  });
}

/** Read-only proof used before a journal installs a recovered operation receipt. */
export function attestGreaterRealmRetainedImmutableArtifact(input: Readonly<{
  repositoryRoot: string;
  record: GreaterRealmImmutableArtifactRetentionRecord;
}>): void {
  const record = parseRetentionRecord(input.record);
  if (!existsNoFollow(record.materializationRoot) || !existsNoFollow(record.artifactPath)) {
    fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
  }
  const cleanupPhase = readCleanupPhase(cleanupTombstonePath(record), record);
  if (cleanupPhase !== undefined && cleanupPhase !== 'prepared') {
    fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
  }
  openGreaterRealmProductionCommitMaterialization({
    repositoryRoot: input.repositoryRoot,
    moduleSourceCommit: record.moduleSourceCommit,
    moduleTreeId: record.moduleTreeId,
    destination: record.materializationRoot,
    expectedRootIdentity: {
      dev: safeIdentityNumber(record.materializationDev),
      ino: safeIdentityNumber(record.materializationIno),
    },
    allowedUntracked: { files: ['spacetimedb/dist/bundle.js'] },
  });
  attestProvenArtifact(record.artifactPath, retainedArtifactIdentity(record));
}

/** Exact cleanup for normal completion or journal-authorized crash recovery. */
export function cleanupGreaterRealmRetainedImmutableArtifact(input: Readonly<{
  repositoryRoot: string;
  record: GreaterRealmImmutableArtifactRetentionRecord;
  testOnlyAfterArtifactUnlink?: () => void;
  testOnlyAfterTreeRemoved?: () => void;
}>): void {
  const record = parseRetentionRecord(input.record);
  const tombstone = cleanupTombstonePath(record);
  let phase = readCleanupPhase(tombstone, record)
    ?? writeCleanupPhase({ path: tombstone, record, phase: 'prepared', initial: true });
  if (phase === 'complete') {
    attestGreaterRealmProductionCommitMaterializationRemoved({
      repositoryRoot: input.repositoryRoot,
      destination: record.materializationRoot,
    });
    retireArtifactReadyBuildIntent(record);
    return;
  }
  const rootPresent = existsNoFollow(record.materializationRoot);
  if (!rootPresent) {
    if (phase !== 'tree-removing') {
      fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
    }
    attestGreaterRealmProductionCommitMaterializationRemoved({
      repositoryRoot: input.repositoryRoot,
      destination: record.materializationRoot,
    });
    writeCleanupPhase({ path: tombstone, record, phase: 'complete', initial: false });
    retireArtifactReadyBuildIntent(record);
    return;
  }
  const artifactPresent = existsNoFollow(record.artifactPath);
  if (
    artifactPresent
    && CLEANUP_PHASES.indexOf(phase) >= CLEANUP_PHASES.indexOf('artifact-removed')
  ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_STATE_INVALID');
  const expectedArtifact = retainedArtifactIdentity(record);
  if (CLEANUP_PHASES.indexOf(phase) < CLEANUP_PHASES.indexOf('artifact-removed')) {
    const artifactDirectory = resolve(record.artifactPath, '..');
    if (!artifactPresent && phase === 'artifact-unlinking' && existsNoFollow(artifactDirectory)) {
      if (readdirSync(artifactDirectory).length !== 0) {
        fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      }
      const status = lstatSync(artifactDirectory);
      if (
        status.isSymbolicLink() || !status.isDirectory()
        || (status.mode & 0o7777) !== DIRECTORY_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      rmdirSync(artifactDirectory);
      fsyncExactDirectory(resolve(artifactDirectory, '..'));
      let emptyAncestor = dirname(artifactDirectory);
      while (
        emptyAncestor !== record.materializationRoot
        && existsNoFollow(emptyAncestor)
        && readdirSync(emptyAncestor).length === 0
      ) {
        const ancestorStatus = lstatSync(emptyAncestor);
        if (
          ancestorStatus.isSymbolicLink() || !ancestorStatus.isDirectory()
          || (ancestorStatus.mode & 0o7777) !== DIRECTORY_MODE
          || (process.getuid !== undefined && ancestorStatus.uid !== process.getuid())
        ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
        const parent = dirname(emptyAncestor);
        rmdirSync(emptyAncestor);
        fsyncExactDirectory(parent);
        emptyAncestor = parent;
      }
    }
    const materialization = openGreaterRealmProductionCommitMaterialization({
      repositoryRoot: input.repositoryRoot,
      moduleSourceCommit: record.moduleSourceCommit,
      moduleTreeId: record.moduleTreeId,
      destination: record.materializationRoot,
      expectedRootIdentity: {
        dev: safeIdentityNumber(record.materializationDev),
        ino: safeIdentityNumber(record.materializationIno),
      },
      allowedUntracked: artifactPresent ? { files: ['spacetimedb/dist/bundle.js'] } : undefined,
    });
    if (phase !== 'artifact-unlinking') {
      phase = writeCleanupPhase({
        path: tombstone, record, phase: 'artifact-unlinking', initial: false,
      });
    }
    if (artifactPresent) {
      materialization.verify({ files: ['spacetimedb/dist/bundle.js'] });
      attestProvenArtifact(record.artifactPath, expectedArtifact);
      if (JSON.stringify(readdirSync(artifactDirectory).sort()) !== JSON.stringify([
        'bundle.js',
      ])) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      unlinkSync(record.artifactPath);
      fsyncExactDirectory(artifactDirectory);
      input.testOnlyAfterArtifactUnlink?.();
    }
    if (existsNoFollow(artifactDirectory)) {
      if (readdirSync(artifactDirectory).length !== 0) {
        fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      }
      rmdirSync(artifactDirectory);
      fsyncExactDirectory(resolve(artifactDirectory, '..'));
    }
    let emptyAncestor = dirname(artifactDirectory);
    while (
      emptyAncestor !== record.materializationRoot
      && existsNoFollow(emptyAncestor)
      && readdirSync(emptyAncestor).length === 0
    ) {
      const status = lstatSync(emptyAncestor);
      if (
        status.isSymbolicLink()
        || !status.isDirectory()
        || (status.mode & 0o7777) !== DIRECTORY_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      const parent = dirname(emptyAncestor);
      rmdirSync(emptyAncestor);
      fsyncExactDirectory(parent);
      emptyAncestor = parent;
    }
    phase = writeCleanupPhase({ path: tombstone, record, phase: 'artifact-removed', initial: false });
  }
  if (phase !== 'tree-removing') {
    phase = writeCleanupPhase({ path: tombstone, record, phase: 'tree-removing', initial: false });
  }
  cleanupGreaterRealmProductionCommitMaterialization({
    repositoryRoot: input.repositoryRoot,
    moduleSourceCommit: record.moduleSourceCommit,
    moduleTreeId: record.moduleTreeId,
    destination: record.materializationRoot,
    expectedRootIdentity: {
      dev: safeIdentityNumber(record.materializationDev),
      ino: safeIdentityNumber(record.materializationIno),
    },
  });
  fsyncExactDirectory(resolve(record.materializationRoot, '..'));
  input.testOnlyAfterTreeRemoved?.();
  writeCleanupPhase({ path: tombstone, record, phase: 'complete', initial: false });
  retireArtifactReadyBuildIntent(record);
}

export function runGreaterRealmImmutableMigrationProof(input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  executable: string;
  dependencyCacheRoot?: string;
  proofRuntime?: GreaterRealmImmutableProofRuntime;
  operatorAuthority: Readonly<{
    receiptDirectory: string;
    lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  }>;
  materializationParent?: string;
  testOnlyInstallDependencies?: (materializedRoot: string) => string;
  testOnlyRunProof?: (materializedRoot: string) => string;
  testOnlyParseProof?: (output: string, artifactPath: string) => MigrationArtifactReceipt;
  testOnlyDurabilityStep?: (step:
    | 'artifact-durable'
    | 'generated-output-removals-durable'
    | 'dependency-removals-durable'
    | 'retained-tree-durable'
  ) => void;
}>): GreaterRealmImmutableArtifactProof {
  const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
  const stateRoot = input.materializationParent === undefined
    ? ensureCanonicalProductionAdminStateDirectory()
    : ensurePrivateParent(input.materializationParent);
  const parent = ensurePrivateParent(join(stateRoot, 'immutable-publish-materializations'));
  recoverDeadBuildIntents({ parent, repositoryRoot });
  const intentId = randomUUID().replaceAll('-', '');
  const destination = join(parent, intentId);
  const moduleTreeId = resolveGreaterRealmProductionCommitTreeId({
    repositoryRoot,
    moduleSourceCommit: input.moduleSourceCommit,
  });
  const intentPath = buildIntentPath(parent, intentId);
  if (
    !isAbsolute(input.operatorAuthority.receiptDirectory)
    || resolve(input.operatorAuthority.receiptDirectory)
      !== input.operatorAuthority.receiptDirectory
  ) fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
  let buildIntent: ImmutableBuildIntentRecord = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-greater-realm-immutable-build-intent-v1',
    intentId,
    phase: 'allocated',
    pid: input.operatorAuthority.lockIdentity.pid,
    processStartIdentity: input.operatorAuthority.lockIdentity.processStartIdentity,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleTreeId,
    materializationRoot: destination,
    materializationDev: null,
    materializationIno: null,
    retentionRecord: null,
    receiptDirectory: input.operatorAuthority.receiptDirectory,
    operatorLockIdentity: input.operatorAuthority.lockIdentity,
    journalGroupDigest: null,
  });
  writeBuildIntent({ path: intentPath, record: buildIntent, initial: true });
  let materialization: ReturnType<typeof createGreaterRealmProductionCommitMaterialization>;
  try {
    materialization = createGreaterRealmProductionCommitMaterialization({
      repositoryRoot,
      moduleSourceCommit: input.moduleSourceCommit,
      destination,
    });
    if (materialization.moduleTreeId !== moduleTreeId) {
      fail('GREATER_REALM_IMMUTABLE_BUILD_INTENT_INVALID');
    }
    const materializationIdentity = lstatSync(materialization.root, { bigint: true });
    buildIntent = Object.freeze({
      ...buildIntent,
      phase: 'building',
      materializationDev: materializationIdentity.dev.toString(),
      materializationIno: materializationIdentity.ino.toString(),
    });
    writeBuildIntent({ path: intentPath, record: buildIntent, initial: false });
  } catch (error) {
    let cleanupError: unknown;
    try {
      cleanupBuildIntent({ path: intentPath, record: buildIntent, repositoryRoot });
    } catch (caught) {
      cleanupError = caught;
    }
    if (cleanupError !== undefined) {
      throw new AggregateError(
        [error, cleanupError],
        'GREATER_REALM_IMMUTABLE_MATERIALIZATION_AND_INTENT_CLEANUP_FAILED',
      );
    }
    throw error;
  }
  let retainedForPublisher = false;
  let primaryError: unknown;
  try {
    const installed = input.testOnlyInstallDependencies === undefined
      ? (() => {
          if (input.dependencyCacheRoot === undefined) {
            fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_CACHE_REQUIRED');
          }
          return installLockedDependencyClosure({
            materializedRoot: materialization.root,
            dependencyCacheRoot: input.dependencyCacheRoot,
          });
        })()
      : (() => {
          const dependencyClosureDigest = input.testOnlyInstallDependencies!(materialization.root);
          const roots = dependencyRoots(materialization.root).filter(path => existsSync(path));
          if (roots.length < 1) fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
          return Object.freeze({
            dependencyClosureDigest,
            snapshots: Object.freeze(roots.map(root => dependencyTreeSnapshot({
              root,
              boundary: join(materialization.root, 'spacetimedb'),
            }))),
          });
        })();
    const dependencyClosureDigest = installed.dependencyClosureDigest;
    if (!SHA256.test(dependencyClosureDigest)) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_INVALID');
    }
    const installedRoots = dependencyRoots(materialization.root).filter(path => existsSync(path));
    const allowedDependencyPrefixes = installedRoots.map(root => (
      `${relative(materialization.root, root).split(sep).join('/').replace(/\/$/u, '')}/`
    ));
    materialization.verify({ prefixes: allowedDependencyPrefixes });
    const output = input.testOnlyRunProof === undefined
      ? (() => {
          if (input.proofRuntime === undefined) {
            fail('GREATER_REALM_IMMUTABLE_PROOF_RUNTIME_REQUIRED');
          }
          const proofEnvironment = immutableProofChildEnvironment(
            input.proofRuntime,
            input.executable,
          );
          const result = spawnSync(input.proofRuntime.nodeExecutable, [
            'scripts/verify-spacetime-additive-migration.mjs',
          ], {
            cwd: materialization.root,
            encoding: 'utf8',
            env: proofEnvironment,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: PROOF_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            maxBuffer: MAX_PROOF_OUTPUT_BYTES,
          });
          if (
            result.error !== undefined
            || result.status !== 0
            || result.signal !== null
            || result.stderr !== ''
          ) fail('GREATER_REALM_IMMUTABLE_MIGRATION_PROOF_FAILED');
          return result.stdout;
        })()
      : input.testOnlyRunProof(materialization.root);
    for (const artifact of generatedArtifactFiles()) {
      const path = join(materialization.root, ...artifact.split('/'));
      if (!existsNoFollow(path)) {
        if (input.testOnlyRunProof === undefined) {
          fail('GREATER_REALM_IMMUTABLE_ARTIFACT_OUTPUT_MISSING');
        }
        continue;
      }
      const status = lstatSync(path);
      if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) {
        fail('GREATER_REALM_IMMUTABLE_ARTIFACT_OUTPUT_INVALID');
      }
      chmodSync(path, FILE_MODE);
      const directory = dirname(path);
      chmodSync(directory, DIRECTORY_MODE);
      const directoryStatus = lstatSync(directory);
      if (
        directoryStatus.isSymbolicLink()
        || !directoryStatus.isDirectory()
        || (directoryStatus.mode & 0o7777) !== DIRECTORY_MODE
      ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_OUTPUT_INVALID');
    }
    materialization.verify({
      prefixes: allowedDependencyPrefixes,
      files: generatedArtifactFiles(),
    });
    const dependencyTreesAfter = installedRoots.map(root => dependencyTreeSnapshot({
      root,
      boundary: join(materialization.root, 'spacetimedb'),
    }));
    if (
      dependencyTreesAfter.length !== installed.snapshots.length
      || dependencyTreesAfter.some((after, index) => (
        after.contentDigest !== installed.snapshots[index]!.contentDigest
        || after.identityDigest !== installed.snapshots[index]!.identityDigest
      ))
    ) {
      fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_TREE_CHANGED');
    }
    const artifactPath = join(materialization.root, 'spacetimedb', 'dist', 'bundle.js');
    chmodSync(artifactPath, FILE_MODE);
    const artifactIdentity = attestProvenArtifact(artifactPath, undefined, true);
    fsyncExactDirectory(dirname(artifactPath));
    fsyncExactDirectory(join(materialization.root, 'spacetimedb'));
    fsyncExactDirectory(materialization.root);
    input.testOnlyDurabilityStep?.('artifact-durable');
    const artifactReceipt = input.testOnlyParseProof === undefined
      ? parseMigrationProofReceiptAtExactPath(output, artifactPath)
      : input.testOnlyParseProof(output, artifactPath);
    if (
      artifactReceipt.artifactPath !== artifactPath
      || !SHA256.test(artifactReceipt.artifactDigest)
      || artifactReceipt.artifactDigest !== artifactIdentity.digest
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RECEIPT_INVALID');
    for (const artifact of generatedArtifactFiles().slice(1)) {
      const path = join(materialization.root, ...artifact.split('/'));
      if (!existsSync(path)) {
        if (input.testOnlyRunProof === undefined) {
          fail('GREATER_REALM_IMMUTABLE_ARTIFACT_OUTPUT_MISSING');
        }
        continue;
      }
      const directory = resolve(path, '..');
      if (
        JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(['bundle.js'])
        || lstatSync(path).isSymbolicLink()
        || !lstatSync(path).isFile()
      ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_CLEANUP_FAILED');
      unlinkSync(path);
      fsyncExactDirectory(directory);
      rmdirSync(directory);
      fsyncExactDirectory(dirname(directory));
    }
    input.testOnlyDurabilityStep?.('generated-output-removals-durable');
    for (const root of [...installedRoots].reverse()) {
      const status = lstatSync(root);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        fail('GREATER_REALM_IMMUTABLE_DEPENDENCY_CLEANUP_FAILED');
      }
      removeExactBuildTree(root, join(materialization.root, 'spacetimedb'));
    }
    input.testOnlyDurabilityStep?.('dependency-removals-durable');
    materialization.verify({ files: ['spacetimedb/dist/bundle.js'] });
    fsyncExactDirectory(dirname(artifactPath));
    fsyncExactDirectory(join(materialization.root, 'spacetimedb'));
    fsyncExactDirectory(materialization.root);
    input.testOnlyDurabilityStep?.('retained-tree-durable');
    const materializationIdentity = lstatSync(materialization.root, { bigint: true });
    if (
      materializationIdentity.isSymbolicLink()
      || !materializationIdentity.isDirectory()
      || (materializationIdentity.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined
        && materializationIdentity.uid !== BigInt(process.getuid()))
    ) fail('GREATER_REALM_IMMUTABLE_ARTIFACT_RETENTION_INVALID');
    const retentionRecord: GreaterRealmImmutableArtifactRetentionRecord = Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-immutable-artifact-v1',
      materializationRoot: materialization.root,
      artifactPath,
      artifactDigest: artifactIdentity.digest,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleTreeId: materialization.moduleTreeId,
      dependencyClosureDigest,
      materializationDev: materializationIdentity.dev.toString(),
      materializationIno: materializationIdentity.ino.toString(),
      artifactDev: artifactIdentity.dev.toString(),
      artifactIno: artifactIdentity.ino.toString(),
      artifactMode: '600',
      artifactUid: artifactIdentity.uid.toString(),
      artifactNlink: '1',
      artifactSize: artifactIdentity.size.toString(),
      artifactMtimeNs: artifactIdentity.mtimeNs.toString(),
      artifactCtimeNs: artifactIdentity.ctimeNs.toString(),
    });
    buildIntent = Object.freeze({
      ...buildIntent,
      phase: 'artifact-ready',
      retentionRecord,
    });
    writeBuildIntent({ path: intentPath, record: buildIntent, initial: false });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleanupGreaterRealmRetainedImmutableArtifact({
        repositoryRoot,
        record: retentionRecord,
      });
      cleaned = true;
    };
    let adopted = false;
    const adoptJournalRetention = ({
      lockIdentity,
      groupDigest,
    }: Readonly<{
      lockIdentity: GreaterRealmCutoverJournalLockIdentity;
      groupDigest: string;
    }>) => {
      if (
        adopted || !SHA256.test(groupDigest)
        || JSON.stringify(lockIdentity) !== JSON.stringify(buildIntent.operatorLockIdentity)
      ) {
        fail('GREATER_REALM_IMMUTABLE_BUILD_JOURNAL_ADOPTION_INVALID');
      }
      const current = readBuildIntent(intentPath);
      if (
        current.phase !== 'artifact-ready'
        || JSON.stringify(current.retentionRecord) !== JSON.stringify(retentionRecord)
      ) fail('GREATER_REALM_IMMUTABLE_BUILD_JOURNAL_ADOPTION_INVALID');
      buildIntent = Object.freeze({
        ...current,
        phase: 'journal-adopted',
        journalGroupDigest: groupDigest,
      });
      writeBuildIntent({ path: intentPath, record: buildIntent, initial: false });
      adopted = true;
    };
    retainedForPublisher = true;
    return Object.freeze({
      artifactReceipt,
      artifactPath,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleTreeId: materialization.moduleTreeId,
      dependencyClosureDigest,
      retentionRecord,
      adoptJournalRetention,
      cleanup,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (!retainedForPublisher) {
      try {
        if (buildIntent.phase === 'artifact-ready' && buildIntent.retentionRecord !== null) {
          cleanupGreaterRealmRetainedImmutableArtifact({
            repositoryRoot,
            record: buildIntent.retentionRecord,
          });
        } else {
          cleanupBuildIntent({ path: intentPath, record: buildIntent, repositoryRoot });
        }
      } catch (cleanupError) {
        if (primaryError !== undefined) {
          throw new AggregateError(
            [primaryError, cleanupError],
            `GREATER_REALM_IMMUTABLE_PROOF_AND_CLEANUP_FAILED:${
              primaryError instanceof Error ? primaryError.message : 'UNKNOWN_PRIMARY'
            }:${cleanupError instanceof Error ? cleanupError.message : 'UNKNOWN_CLEANUP'}`,
          );
        }
        throw cleanupError;
      }
    }
  }
}

export const greaterRealmImmutableArtifactTestSeams = Object.freeze({
  dependencyTreeSnapshot,
  proofChildEnvironment: (
    runtime: GreaterRealmImmutableProofRuntime,
    executable: string,
    expectedNodeSha256: string,
  ) => immutableProofChildEnvironment(runtime, executable, expectedNodeSha256),
  parseSafeNpmTar,
  recoverDeadBuildIntents,
});
