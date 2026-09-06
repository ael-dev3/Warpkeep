import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  createGenesis001BaselineSourceMaterialization,
  createGenesis001FrozenSourceMaterialization,
} from './genesis001-binding-frozen-source.mjs';
import { stageGreaterRealmOpenAtHelper } from './greater-realm-openat';
import { createGreaterRealmProductionCommitMaterialization } from './greater-realm-production-provenance';
import { greaterRealmImmutableArtifactTestSeams } from './greater-realm-production-immutable-artifact';
import { ensureCanonicalProductionAdminStateDirectory } from './production-admin-token-budget.mjs';

const COMMIT = /^[0-9a-f]{40}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const VERSION = /^[0-9][0-9A-Za-z.+-]{0,127}$/u;
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]+={0,2})$/u;
const MAXIMUM_SOURCE_AUTHORITY_BYTES = 8 * 1_024 * 1_024;
const MAXIMUM_PACKAGE_ARCHIVE_BYTES = 256 * 1_024 * 1_024;
const MAXIMUM_PACKAGE_MANIFEST_BYTES = 1 * 1_024 * 1_024;
const MAXIMUM_CLOSURE_ENTRIES = 20_000;
const MAXIMUM_CLOSURE_FILE_BYTES = 512 * 1_024 * 1_024;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const DEPENDENCIES = Object.freeze({ spacetimedb: '2.6.1' });
const DEV_DEPENDENCIES = Object.freeze({
  esbuild: '0.25.12',
  tsx: '4.20.6',
  typescript: '5.6.3',
});
const ROOT_PACKAGE_KEYS = Object.freeze([
  'esbuild@0.25.12',
  'spacetimedb@2.6.1',
  'tsx@4.20.6',
  'typescript@5.6.3',
]);
const SHARED_PACKAGE_EDGES = Object.freeze<Record<string, readonly string[]>>({
  'base64-js@1.5.1': Object.freeze([]),
  'get-tsconfig@4.14.3': Object.freeze(['resolve-pkg-maps@1.0.0']),
  'headers-polyfill@4.0.3': Object.freeze([]),
  'object-inspect@1.13.4': Object.freeze([]),
  'prettier@3.9.6': Object.freeze([]),
  'pure-rand@7.0.1': Object.freeze([]),
  'resolve-pkg-maps@1.0.0': Object.freeze([]),
  'safe-stable-stringify@2.5.0': Object.freeze([]),
  'spacetimedb@2.6.1': Object.freeze([
    'base64-js@1.5.1',
    'headers-polyfill@4.0.3',
    'object-inspect@1.13.4',
    'prettier@3.9.6',
    'pure-rand@7.0.1',
    'safe-stable-stringify@2.5.0',
    'statuses@2.0.2',
    'url-polyfill@1.1.14',
  ]),
  'statuses@2.0.2': Object.freeze([]),
  'typescript@5.6.3': Object.freeze([]),
  'url-polyfill@1.1.14': Object.freeze([]),
});

const DARWIN_EXPECTED_PACKAGE_EDGES = Object.freeze<Record<string, readonly string[]>>({
  ...SHARED_PACKAGE_EDGES,
  '@esbuild/darwin-arm64@0.25.12': Object.freeze([]),
  'esbuild@0.25.12': Object.freeze(['@esbuild/darwin-arm64@0.25.12']),
  'fsevents@2.3.3': Object.freeze([]),
  'tsx@4.20.6': Object.freeze([
    'esbuild@0.25.12',
    'fsevents@2.3.3',
    'get-tsconfig@4.14.3',
  ]),
});

const LINUX_EXPECTED_PACKAGE_EDGES = Object.freeze<Record<string, readonly string[]>>({
  ...SHARED_PACKAGE_EDGES,
  '@esbuild/linux-x64@0.25.12': Object.freeze([]),
  'esbuild@0.25.12': Object.freeze(['@esbuild/linux-x64@0.25.12']),
  'tsx@4.20.6': Object.freeze(['esbuild@0.25.12', 'get-tsconfig@4.14.3']),
});

const GENESIS002_EXPECTED_PACKAGE_EDGES = Object.freeze<Record<string, readonly string[]>>({
  'base64-js@1.5.1': Object.freeze([]),
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
  'typescript@5.6.3': Object.freeze([]),
  'url-polyfill@1.1.14': Object.freeze([]),
  '@esbuild/linux-x64@0.25.12': Object.freeze([]),
  'esbuild@0.25.12': Object.freeze(['@esbuild/linux-x64@0.25.12']),
  'tsx@4.20.6': Object.freeze(['esbuild@0.25.12', 'get-tsconfig@4.14.0']),
});

type OptionalPlatformMetadata = Readonly<{
  os?: readonly string[];
  cpu?: readonly string[];
  optional?: true;
}>;

const DARWIN_OPTIONAL_PLATFORM_METADATA = Object.freeze<Record<string, OptionalPlatformMetadata>>({
  '@esbuild/darwin-arm64@0.25.12': Object.freeze({
    os: Object.freeze(['darwin']),
    cpu: Object.freeze(['arm64']),
    optional: true,
  }),
  'fsevents@2.3.3': Object.freeze({
    os: Object.freeze(['darwin']),
    optional: true,
  }),
});

const LINUX_OPTIONAL_PLATFORM_METADATA = Object.freeze<Record<string, OptionalPlatformMetadata>>({
  '@esbuild/linux-x64@0.25.12': Object.freeze({
    os: Object.freeze(['linux']),
    cpu: Object.freeze(['x64']),
    optional: true,
  }),
});

type PtrLockedSourceBuildProfile = Readonly<{
  os: 'darwin' | 'linux';
  cpu: 'arm64' | 'x64';
  provenanceDomain: string;
  expectedPackageEdges: Readonly<Record<string, readonly string[]>>;
  expectedPackageKeys: readonly string[];
  optionalPlatformMetadata: Readonly<Record<string, OptionalPlatformMetadata>>;
  importerKinds: Readonly<Record<string, 'module' | 'fixture'>>;
  moduleRoot: string;
  manifestPath: string;
  lockPath: string;
  workspacePath?: string;
  workspacePackages?: readonly string[];
  generatedPrefix: string;
  bundlePath: string;
  stateChild: string;
  requireMaterializationParent: boolean;
  fixedModuleSourceCommit?: string;
  expectedModuleTreeId?: string;
  expectedSourceClosureDigest?: string;
  materialize: (input: Readonly<{
    repositoryRoot: string;
    moduleSourceCommit: string;
    destination: string;
  }>) => Readonly<{
    root: string;
    moduleSourceCommit: string;
    moduleTreeId: string;
    sourceClosureDigest?: string;
    verify: (allowedUntracked?: Readonly<{
      prefixes?: readonly string[];
      files?: readonly string[];
    }>) => void;
    cleanup: () => void;
  }>;
}>;

const materializeCommit = (input: Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  destination: string;
}>) => createGreaterRealmProductionCommitMaterialization(input);

const DARWIN_PROFILE = Object.freeze<PtrLockedSourceBuildProfile>({
  os: 'darwin',
  cpu: 'arm64',
  provenanceDomain: 'warpkeep-ptr-independent-dependency-closure-v1',
  expectedPackageEdges: DARWIN_EXPECTED_PACKAGE_EDGES,
  expectedPackageKeys: Object.freeze(Object.keys(DARWIN_EXPECTED_PACKAGE_EDGES).sort()),
  optionalPlatformMetadata: DARWIN_OPTIONAL_PLATFORM_METADATA,
  importerKinds: Object.freeze({ '.': 'module' }),
  moduleRoot: 'spacetimedb/ptr',
  manifestPath: 'spacetimedb/ptr/package.json',
  lockPath: 'spacetimedb/ptr/pnpm-lock.yaml',
  generatedPrefix: 'spacetimedb/ptr/node_modules/',
  bundlePath: 'spacetimedb/ptr/dist/bundle.js',
  stateChild: 'ptr-locked-source-builds-v1',
  requireMaterializationParent: false,
  materialize: materializeCommit,
});

const LINUX_PROFILE = Object.freeze<PtrLockedSourceBuildProfile>({
  os: 'linux',
  cpu: 'x64',
  provenanceDomain: 'warpkeep-ptr-independent-linux-x64-dependency-closure-v1',
  expectedPackageEdges: LINUX_EXPECTED_PACKAGE_EDGES,
  expectedPackageKeys: Object.freeze(Object.keys(LINUX_EXPECTED_PACKAGE_EDGES).sort()),
  optionalPlatformMetadata: LINUX_OPTIONAL_PLATFORM_METADATA,
  importerKinds: Object.freeze({ '.': 'module' }),
  moduleRoot: 'spacetimedb/ptr',
  manifestPath: 'spacetimedb/ptr/package.json',
  lockPath: 'spacetimedb/ptr/pnpm-lock.yaml',
  generatedPrefix: 'spacetimedb/ptr/node_modules/',
  bundlePath: 'spacetimedb/ptr/dist/bundle.js',
  stateChild: 'ptr-locked-source-builds-v1',
  requireMaterializationParent: false,
  materialize: materializeCommit,
});

const GENESIS002_IMPORTER_KINDS = Object.freeze<Record<string, 'module' | 'fixture'>>({
  '.': 'module',
  genesis002: 'module',
  ...Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
    `migration-fixtures/additive-v${index + 2}-schema`, 'fixture' as const,
  ])),
  'migration-fixtures/current-candidate-inspection': 'fixture',
  'migration-fixtures/production-v1': 'fixture',
});

const GENESIS002_PROFILE = Object.freeze<PtrLockedSourceBuildProfile>({
  os: 'linux',
  cpu: 'x64',
  provenanceDomain: 'warpkeep-genesis002-workspace-linux-x64-dependency-closure-v1',
  expectedPackageEdges: GENESIS002_EXPECTED_PACKAGE_EDGES,
  expectedPackageKeys: Object.freeze(Object.keys(GENESIS002_EXPECTED_PACKAGE_EDGES).sort()),
  optionalPlatformMetadata: LINUX_OPTIONAL_PLATFORM_METADATA,
  importerKinds: GENESIS002_IMPORTER_KINDS,
  moduleRoot: 'spacetimedb/genesis002',
  manifestPath: 'spacetimedb/genesis002/package.json',
  lockPath: 'spacetimedb/pnpm-lock.yaml',
  workspacePath: 'spacetimedb/pnpm-workspace.yaml',
  workspacePackages: Object.freeze(['.', 'genesis002', 'migration-fixtures/*']),
  generatedPrefix: 'spacetimedb/genesis002/node_modules/',
  bundlePath: 'spacetimedb/genesis002/dist/bundle.js',
  stateChild: 'genesis002-locked-source-builds-v1',
  requireMaterializationParent: true,
  materialize: materializeCommit,
});

const GENESIS001_IMPORTER_KINDS = Object.freeze<Record<string, 'module' | 'fixture'>>({
  '.': 'module',
  ...Object.fromEntries(Array.from({ length: 13 }, (_, index) => [
    `migration-fixtures/additive-v${index + 2}-schema`, 'fixture' as const,
  ])),
  'migration-fixtures/production-v1': 'fixture',
});

const GENESIS001_PROFILE = Object.freeze<PtrLockedSourceBuildProfile>({
  os: 'linux',
  cpu: 'x64',
  provenanceDomain: 'warpkeep-genesis001-frozen-linux-x64-dependency-closure-v1',
  expectedPackageEdges: GENESIS002_EXPECTED_PACKAGE_EDGES,
  expectedPackageKeys: Object.freeze(Object.keys(GENESIS002_EXPECTED_PACKAGE_EDGES).sort()),
  optionalPlatformMetadata: LINUX_OPTIONAL_PLATFORM_METADATA,
  importerKinds: GENESIS001_IMPORTER_KINDS,
  moduleRoot: 'spacetimedb',
  manifestPath: 'spacetimedb/package.json',
  lockPath: 'spacetimedb/pnpm-lock.yaml',
  workspacePath: 'spacetimedb/pnpm-workspace.yaml',
  workspacePackages: Object.freeze(['.', 'migration-fixtures/*']),
  generatedPrefix: 'spacetimedb/node_modules/',
  bundlePath: 'spacetimedb/dist/bundle.js',
  stateChild: 'genesis001-locked-source-builds-v1',
  requireMaterializationParent: true,
  fixedModuleSourceCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
  expectedModuleTreeId: '90deebb5faf4129282f5c35999244f540001b27d',
  expectedSourceClosureDigest: '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9',
  materialize: input => createGenesis001FrozenSourceMaterialization({
    repositoryRoot: input.repositoryRoot,
    destination: input.destination,
  }),
});

const GENESIS001_BASELINE_PROFILE = Object.freeze<PtrLockedSourceBuildProfile>({
  ...GENESIS001_PROFILE,
  provenanceDomain: 'warpkeep-genesis001-baseline-linux-x64-dependency-closure-v1',
  stateChild: 'genesis001-baseline-locked-source-builds-v1',
  expectedSourceClosureDigest: '99772bf087a8bacd8414e762a88174d19a93a8afa3fae5904ce77cc93e7921be',
  materialize: input => createGenesis001BaselineSourceMaterialization({
    repositoryRoot: input.repositoryRoot,
    destination: input.destination,
  }),
});

// This frozen export retains its historical test-seam name for G001 byte
// compatibility. PTR consumes only the two pure validators explicitly shared
// by that surface; no fixture, process override, recovery, or authority seam.
const { parseSafeNpmTar, dependencyTreeSnapshot } = greaterRealmImmutableArtifactTestSeams;
type DependencySnapshot = ReturnType<typeof dependencyTreeSnapshot>;
type SafeNpmTar = ReturnType<typeof parseSafeNpmTar>;

export class PtrBindingLockedSourceBuildError extends Error {
  constructor(readonly code: string, cause?: unknown) {
    super(code);
    this.name = 'PtrBindingLockedSourceBuildError';
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause });
  }
}

function fail(code: string): never {
  throw new PtrBindingLockedSourceBuildError(code);
}

type ExactFileIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  mode: bigint;
  uid: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

function fileIdentity(status: ReturnType<typeof lstatSync>): ExactFileIdentity {
  const value = status as unknown as ExactFileIdentity;
  return Object.freeze({
    dev: value.dev, ino: value.ino, mode: value.mode, uid: value.uid,
    nlink: value.nlink, size: value.size, mtimeNs: value.mtimeNs, ctimeNs: value.ctimeNs,
  });
}

function sameFileIdentity(left: ExactFileIdentity, right: ExactFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.uid === right.uid && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readExactBoundedFile(
  path: string,
  maximumBytes: number,
  invalidCode: string,
  changedCode: string,
): Readonly<{ body: Buffer; identity: ExactFileIdentity }> {
  let descriptor: number | undefined;
  let body: Buffer | undefined;
  let result: Readonly<{ body: Buffer; identity: ExactFileIdentity }> | undefined;
  let primaryError: unknown;
  try {
    const byPath = lstatSync(path, { bigint: true });
    if (byPath.isSymbolicLink() || !byPath.isFile() || byPath.nlink !== 1n
      || byPath.size < 1n || byPath.size > BigInt(maximumBytes)
      || realpathSync(path) !== path
      || (process.getuid !== undefined && byPath.uid !== BigInt(process.getuid()))) fail(invalidCode);
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    const expected = fileIdentity(byPath);
    if (!sameFileIdentity(expected, fileIdentity(opened))) fail(changedCode);
    body = Buffer.allocUnsafe(Number(opened.size));
    let offset = 0;
    while (offset < body.byteLength) {
      const count = readSync(descriptor, body, offset, body.byteLength - offset, offset);
      if (count < 1) fail(changedCode);
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (body.byteLength !== Number(opened.size)
      || !sameFileIdentity(expected, fileIdentity(after))
      || !sameFileIdentity(expected, fileIdentity(afterPath))) fail(changedCode);
    result = Object.freeze({ body, identity: expected });
  } catch (error) {
    body?.fill(0);
    primaryError = error instanceof PtrBindingLockedSourceBuildError
      ? error
      : new PtrBindingLockedSourceBuildError(invalidCode, error);
  }
  let closeError: unknown;
  try {
    if (descriptor !== undefined) closeSync(descriptor);
  } catch (error) {
    closeError = error;
  }
  if (primaryError !== undefined || closeError !== undefined) {
    if (primaryError !== undefined && closeError === undefined) throw primaryError;
    if (primaryError === undefined && closeError !== undefined) {
      body?.fill(0);
      throw closeError;
    }
    throw new AggregateError(
      [primaryError, closeError],
      'PTR_LOCKED_SOURCE_BUILD_READ_AND_CLOSE_FAILED',
    );
  }
  return result ?? fail(invalidCode);
}

function assertExactFileIdentity(path: string, expected: ExactFileIdentity, changedCode: string): void {
  try {
    const current = lstatSync(path, { bigint: true });
    if (current.isSymbolicLink() || !current.isFile() || realpathSync(path) !== path
      || !sameFileIdentity(expected, fileIdentity(current))) fail(changedCode);
  } catch (error) {
    if (error instanceof PtrBindingLockedSourceBuildError) throw error;
    fail(changedCode);
  }
}

function exactRecord(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[], code: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
}

function exactDependencies(value: unknown, expected: Readonly<Record<string, string>>, code: string): void {
  const dependencies = exactRecord(value, code);
  exactKeys(dependencies, Object.keys(expected), code);
  for (const [name, version] of Object.entries(expected)) {
    if (dependencies[name] !== version) fail(code);
  }
}

function parseJsonObject(body: Buffer, code: string): Readonly<Record<string, unknown>> {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (decoded.includes('\0')) fail(code);
    return exactRecord(JSON.parse(decoded) as unknown, code);
  } catch (error) {
    if (error instanceof PtrBindingLockedSourceBuildError) throw error;
    return fail(code);
  }
}

function validatePtrManifest(body: Buffer): void {
  const code = 'PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID';
  const manifest = parseJsonObject(body, code);
  if (manifest.private !== true || manifest.type !== 'module'
    || manifest.packageManager !== 'pnpm@11.7.0') fail(code);
  exactDependencies(manifest.dependencies, DEPENDENCIES, code);
  exactDependencies(manifest.devDependencies, DEV_DEPENDENCIES, code);
  for (const field of [
    'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
    'bundledDependencies', 'bundleDependencies',
  ]) if (Object.hasOwn(manifest, field)) fail(code);
  if (manifest.scripts !== undefined) {
    const scripts = exactRecord(manifest.scripts, code);
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== 'string' || [
        'preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly',
      ].includes(name)) fail(code);
    }
  }
}

function validateWorkspace(body: Buffer, profile: PtrLockedSourceBuildProfile): void {
  const code = 'PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID';
  let workspace: Readonly<Record<string, unknown>>;
  try {
    workspace = exactRecord(parseYaml(new TextDecoder('utf-8', { fatal: true }).decode(body)), code);
  } catch (error) {
    if (error instanceof PtrBindingLockedSourceBuildError) throw error;
    return fail(code);
  }
  exactKeys(workspace, ['allowBuilds', 'packages'], code);
  if (JSON.stringify(workspace.packages) !== JSON.stringify(profile.workspacePackages)) fail(code);
  const allowBuilds = exactRecord(workspace.allowBuilds, code);
  exactKeys(allowBuilds, ['esbuild'], code);
  if (allowBuilds.esbuild !== true) fail(code);
}

type LockedPackage = Readonly<{
  key: string;
  name: string;
  version: string;
  integrity: string;
  integrityDigest: Buffer;
  dependencies: readonly string[];
}>;

function packageNameAndVersion(key: string): Readonly<{ name: string; version: string }> {
  const separator = key.lastIndexOf('@');
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  if (separator < 1 || !PACKAGE_NAME.test(name) || !VERSION.test(version)) {
    fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  }
  return Object.freeze({ name, version });
}

function canonicalIntegrity(value: unknown): Readonly<{ value: string; digest: Buffer }> {
  if (typeof value !== 'string') fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  const match = SHA512_INTEGRITY.exec(value);
  if (match === null) fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  const digest = Buffer.from(match[1]!, 'base64');
  if (digest.byteLength !== 64 || digest.toString('base64') !== match[1]) {
    digest.fill(0);
    fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  }
  return Object.freeze({ value, digest });
}

function platformMetadata(
  packageRecord: Readonly<Record<string, unknown>>,
  profile: PtrLockedSourceBuildProfile,
): Readonly<{
  compatible: boolean;
}> {
  const validate = (value: unknown): readonly string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') {
      fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    }
    return value as readonly string[];
  };
  const os = validate(packageRecord.os);
  const cpu = validate(packageRecord.cpu);
  return Object.freeze({
    compatible: (os === undefined || os[0] === profile.os)
      && (cpu === undefined || cpu[0] === profile.cpu),
  });
}

function assertExactSelectedPlatformMetadata(
  key: string,
  packageRecord: Readonly<Record<string, unknown>>,
  snapshot: Readonly<Record<string, unknown>>,
  profile: PtrLockedSourceBuildProfile,
): void {
  const expected = profile.optionalPlatformMetadata[key] ?? Object.freeze({});
  for (const field of ['os', 'cpu'] as const) {
    const expectedPresent = expected[field] !== undefined;
    if (Object.hasOwn(packageRecord, field) !== expectedPresent
      || JSON.stringify(packageRecord[field]) !== JSON.stringify(expected[field])) {
      fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
    }
  }
  const expectedOptional = expected.optional === true;
  if (Object.hasOwn(snapshot, 'optional') !== expectedOptional
    || snapshot.optional !== (expectedOptional ? true : undefined)) {
    fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
  }
}

function selectedPackages(
  lockBody: Buffer,
  profile: PtrLockedSourceBuildProfile,
): readonly LockedPackage[] {
  const code = 'PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID';
  let lock: Readonly<Record<string, unknown>>;
  try {
    lock = exactRecord(parseYaml(new TextDecoder('utf-8', { fatal: true }).decode(lockBody)), code);
  } catch (error) {
    if (error instanceof PtrBindingLockedSourceBuildError) throw error;
    return fail(code);
  }
  exactKeys(lock, ['lockfileVersion', 'settings', 'importers', 'packages', 'snapshots'], code);
  if (String(lock.lockfileVersion) !== '9.0') fail(code);
  const settings = exactRecord(lock.settings, code);
  exactKeys(settings, ['autoInstallPeers', 'excludeLinksFromLockfile'], code);
  if (settings.autoInstallPeers !== true || settings.excludeLinksFromLockfile !== false) fail(code);
  const importers = exactRecord(lock.importers, code);
  exactKeys(importers, Object.keys(profile.importerKinds), code);
  for (const [importerName, kind] of Object.entries(profile.importerKinds)) {
    const importer = exactRecord(importers[importerName], code);
    exactKeys(importer, ['dependencies', 'devDependencies'], code);
    for (const [field, expected] of [
      ['dependencies', DEPENDENCIES],
      ['devDependencies', kind === 'module' ? DEV_DEPENDENCIES : Object.freeze({
        typescript: DEV_DEPENDENCIES.typescript,
      })],
    ] as const) {
      const dependencies = exactRecord(importer[field], code);
      exactKeys(dependencies, Object.keys(expected), code);
      for (const [name, version] of Object.entries(expected)) {
        const dependency = exactRecord(dependencies[name], code);
        exactKeys(dependency, ['specifier', 'version'], code);
        if (dependency.specifier !== version || dependency.version !== version) fail(code);
      }
    }
  }
  const packageRecords = exactRecord(lock.packages, code);
  const snapshots = exactRecord(lock.snapshots, code);
  const selected = new Map<string, LockedPackage>();
  const pending = [...ROOT_PACKAGE_KEYS];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (selected.has(key)) continue;
    const { name, version } = packageNameAndVersion(key);
    const packageRecord = exactRecord(packageRecords[key], code);
    const resolution = exactRecord(packageRecord.resolution, code);
    exactKeys(resolution, ['integrity'], code);
    const integrity = canonicalIntegrity(resolution.integrity);
    const platform = platformMetadata(packageRecord, profile);
    if (!platform.compatible) {
      integrity.digest.fill(0);
      fail(code);
    }
    const snapshot = exactRecord(snapshots[key], code);
    if (Object.keys(snapshot).some(field => ![
      'dependencies', 'optionalDependencies', 'optional',
    ].includes(field))) fail(code);
    assertExactSelectedPlatformMetadata(key, packageRecord, snapshot, profile);
    const dependencies: string[] = [];
    for (const field of ['dependencies', 'optionalDependencies'] as const) {
      if (snapshot[field] === undefined) continue;
      const edges = exactRecord(snapshot[field], code);
      for (const [dependencyName, dependencyVersion] of Object.entries(edges)) {
        if (!PACKAGE_NAME.test(dependencyName) || typeof dependencyVersion !== 'string'
          || !VERSION.test(dependencyVersion)) fail(code);
        const dependencyKey = `${dependencyName}@${dependencyVersion}`;
        const dependencyRecord = exactRecord(packageRecords[dependencyKey], code);
        const dependencyPlatform = platformMetadata(dependencyRecord, profile);
        if (!dependencyPlatform.compatible) {
          if (field !== 'optionalDependencies') fail(code);
          continue;
        }
        dependencies.push(dependencyKey);
        pending.push(dependencyKey);
      }
    }
    selected.set(key, Object.freeze({
      key, name, version, integrity: integrity.value, integrityDigest: integrity.digest,
      dependencies: Object.freeze(dependencies.sort()),
    }));
  }
  const packages = [...selected.values()].sort((left, right) => left.key.localeCompare(right.key));
  if (JSON.stringify(packages.map(value => value.key))
    !== JSON.stringify(profile.expectedPackageKeys)) {
    for (const value of packages) value.integrityDigest.fill(0);
    fail(code);
  }
  for (const package_ of packages) {
    if (JSON.stringify(package_.dependencies)
      !== JSON.stringify(profile.expectedPackageEdges[package_.key])) {
      for (const value of packages) value.integrityDigest.fill(0);
      fail(code);
    }
  }
  return Object.freeze(packages);
}

function canonicalDirectory(path: string, privateDirectory: boolean, code: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) fail(code);
  try {
    const canonical = realpathSync(path);
    const status = lstatSync(path, { bigint: true });
    if (canonical !== path || status.isSymbolicLink() || !status.isDirectory()
      || (privateDirectory && (status.mode & 0o7777n) !== 0o700n)
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))) fail(code);
    return canonical;
  } catch (error) {
    if (error instanceof PtrBindingLockedSourceBuildError) throw error;
    return fail(code);
  }
}

function ensurePrivateChild(parent: string, name: string): string {
  const path = join(parent, name);
  if (!existsSync(path)) {
    mkdirSync(path, { mode: DIRECTORY_MODE });
    chmodSync(path, DIRECTORY_MODE);
  }
  return canonicalDirectory(path, true, 'PTR_LOCKED_SOURCE_BUILD_STATE_INVALID');
}

function updateFramed(digest: ReturnType<typeof createHash>, label: string, value: string | Buffer): void {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const lengths = Buffer.allocUnsafe(16);
  lengths.writeBigUInt64BE(BigInt(labelBytes.byteLength), 0);
  lengths.writeBigUInt64BE(BigInt(valueBytes.byteLength), 8);
  digest.update(lengths.subarray(0, 8));
  digest.update(labelBytes);
  digest.update(lengths.subarray(8));
  digest.update(valueBytes);
  lengths.fill(0);
}

function archivePath(cacheRoot: string, digest: Buffer): string {
  const hex = digest.toString('hex');
  const path = join(cacheRoot, '_cacache', 'content-v2', 'sha512',
    hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  if (relative(cacheRoot, path).startsWith(`..${sep}`) || !isAbsolute(path)) {
    fail('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
  }
  return path;
}

function pnpmDirectory(key: string): string {
  return key.replace('/', '+');
}

function pathInside(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === '' || (difference !== '..'
    && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function createInternalLink(input: Readonly<{
  root: string;
  destination: string;
  target: string;
  writer: ReturnType<typeof stageGreaterRealmOpenAtHelper>;
}>): void {
  const resolved = resolve(dirname(input.destination), input.target);
  if (!pathInside(input.root, resolved)) fail('PTR_LOCKED_SOURCE_BUILD_LINK_INVALID');
  const destination = relative(input.root, input.destination).split(sep).join('/');
  const targetRootRelative = relative(input.root, resolved).split(sep).join('/');
  input.writer.symlink(destination, input.target, targetRootRelative);
  if (!pathInside(input.root, realpathSync(input.destination))) {
    fail('PTR_LOCKED_SOURCE_BUILD_LINK_INVALID');
  }
}

function installedPackageManifest(path: string, package_: LockedPackage): void {
  const manifest = readExactBoundedFile(join(path, 'package.json'), MAXIMUM_PACKAGE_MANIFEST_BYTES,
    'PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID', 'PTR_LOCKED_SOURCE_BUILD_ARCHIVE_CHANGED');
  try {
    const decoded = parseJsonObject(manifest.body, 'PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID');
    if (decoded.name !== package_.name || decoded.version !== package_.version) {
      fail('PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID');
    }
  } finally {
    manifest.body.fill(0);
  }
}

type ArchiveIdentity = Readonly<{ path: string; identity: ExactFileIdentity; sha512: string }>;

function readVerifiedArchive(cacheRoot: string, package_: LockedPackage): Readonly<{
  body: Buffer;
  identity: ArchiveIdentity;
}> {
  const path = archivePath(cacheRoot, package_.integrityDigest);
  const archive = readExactBoundedFile(path, MAXIMUM_PACKAGE_ARCHIVE_BYTES,
    'PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID', 'PTR_LOCKED_SOURCE_BUILD_CACHE_CHANGED');
  const sha512 = createHash('sha512').update(archive.body).digest('hex');
  if (sha512 !== package_.integrityDigest.toString('hex')) {
    archive.body.fill(0);
    fail('PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID');
  }
  return Object.freeze({
    body: archive.body,
    identity: Object.freeze({ path, identity: archive.identity, sha512 }),
  });
}

function assertArchiveIdentity(value: ArchiveIdentity): void {
  const current = readExactBoundedFile(value.path, MAXIMUM_PACKAGE_ARCHIVE_BYTES,
    'PTR_LOCKED_SOURCE_BUILD_CACHE_CHANGED', 'PTR_LOCKED_SOURCE_BUILD_CACHE_CHANGED');
  try {
    if (!sameFileIdentity(value.identity, current.identity)
      || createHash('sha512').update(current.body).digest('hex') !== value.sha512) {
      fail('PTR_LOCKED_SOURCE_BUILD_CACHE_CHANGED');
    }
  } finally {
    current.body.fill(0);
  }
}

function sameDependencySnapshot(left: DependencySnapshot, right: DependencySnapshot): boolean {
  return left.contentDigest === right.contentDigest && left.identityDigest === right.identityDigest;
}

type DependencyEntry = DependencySnapshot['entries'] extends ReadonlyMap<string, infer T> ? T : never;

function sameDependencyEntry(left: DependencyEntry, right: DependencyEntry): boolean {
  return left.kind === right.kind && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function sameCleanupIdentity(left: DependencyEntry, right: DependencyEntry): boolean {
  return left.kind === right.kind && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && (left.kind === 'directory' || (
      left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
    ));
}

function removeExactDependencyTree(root: string, snapshot: DependencySnapshot): void {
  const entries = [...snapshot.entries.entries()].sort(([left], [right]) => (
    right.split('/').length - left.split('/').length || right.localeCompare(left)
  ));
  for (const [logical, expected] of entries) {
    const path = logical === '' ? root : join(root, ...logical.split('/'));
    const current = lstatSync(path, { bigint: true });
    const kind = current.isDirectory() ? 'directory'
      : current.isFile() ? 'file' : current.isSymbolicLink() ? 'symlink' : undefined;
    const observed: DependencyEntry = Object.freeze({
      kind: kind!, dev: current.dev, ino: current.ino, mode: current.mode & 0o7777n,
      size: current.size, mtimeNs: current.mtimeNs, ctimeNs: current.ctimeNs,
    });
    if (kind === undefined || !sameCleanupIdentity(expected, observed)) {
      fail('PTR_LOCKED_SOURCE_BUILD_CLEANUP_FAILED');
    }
    if (kind === 'directory') rmdirSync(path);
    else unlinkSync(path);
  }
}

function cleanupBundle(materializedRoot: string, bundlePath: string): void {
  const path = join(materializedRoot, ...bundlePath.split('/'));
  const dist = dirname(path);
  const before = lstatSync(path, { bigint: true });
  const directory = lstatSync(dist, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n
    || (before.mode & 0o7000n) !== 0n
    || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
    || realpathSync(path) !== path || directory.isSymbolicLink() || !directory.isDirectory()
    || (directory.mode & 0o7000n) !== 0n
    || (process.getuid !== undefined && directory.uid !== BigInt(process.getuid()))
    || realpathSync(dist) !== dist || JSON.stringify(readdirSync(dist)) !== JSON.stringify(['bundle.js'])) {
    fail('PTR_LOCKED_SOURCE_BUILD_OUTPUT_INVALID');
  }
  const identity = fileIdentity(before);
  assertExactFileIdentity(path, identity, 'PTR_LOCKED_SOURCE_BUILD_OUTPUT_CHANGED');
  unlinkSync(path);
  rmdirSync(dist);
}

function dependencyClosureDigest(input: Readonly<{
  manifestBytes: Buffer;
  lockBytes: Buffer;
  workspaceBytes?: Buffer;
  packages: readonly LockedPackage[];
  snapshot: DependencySnapshot;
  profile: PtrLockedSourceBuildProfile;
  sourceClosureDigest?: string;
}>): string {
  const digest = createHash('sha256');
  updateFramed(digest, 'domain', input.profile.provenanceDomain);
  updateFramed(digest, 'manifest-path', input.profile.manifestPath);
  updateFramed(digest, 'manifest-bytes', input.manifestBytes);
  updateFramed(digest, 'lock-path', input.profile.lockPath);
  updateFramed(digest, 'lock-bytes', input.lockBytes);
  if (input.profile.workspacePath !== undefined && input.workspaceBytes !== undefined) {
    updateFramed(digest, 'workspace-path', input.profile.workspacePath);
    updateFramed(digest, 'workspace-bytes', input.workspaceBytes);
  }
  if (input.sourceClosureDigest !== undefined) {
    updateFramed(digest, 'frozen-source-inventory-sha256', input.sourceClosureDigest);
  }
  for (const package_ of input.packages) {
    updateFramed(digest, 'package-key', package_.key);
    updateFramed(digest, 'package-integrity', package_.integrity);
    updateFramed(digest, 'package-edges', JSON.stringify(package_.dependencies));
  }
  updateFramed(digest, 'installed-content-profile', `${input.profile.moduleRoot}/node_modules`);
  updateFramed(digest, 'installed-content-sha256', input.snapshot.contentDigest);
  updateFramed(digest, 'installed-entry-count', String(input.snapshot.entries.size));
  return digest.digest('hex');
}

function thenable(value: unknown): boolean {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function';
}

export type PtrSourceBuildInput<T> = Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  dependencyCacheRoot: string;
  materializationParent?: string;
  operation: (context: Readonly<{
    materializedRoot: string;
    dependencyClosureDigest: string;
    moduleTreeId: string;
  }>) => T;
}>;

export type PtrSourceBuildResult<T> = Readonly<{
  result: T;
  dependencyClosureDigest: string;
  moduleTreeId: string;
}>;

export type Genesis002SourceBuildInput<T> = Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  dependencyCacheRoot: string;
  materializationParent: string;
  operation: (context: Readonly<{
    materializedRoot: string;
    dependencyClosureDigest: string;
    moduleTreeId: string;
  }>) => T;
}>;

export type Genesis002SourceBuildResult<T> = Readonly<{
  result: T;
  dependencyClosureDigest: string;
  moduleTreeId: string;
}>;

export type Genesis001SourceBuildInput<T> = Readonly<{
  repositoryRoot: string;
  dependencyCacheRoot: string;
  materializationParent: string;
  operation: (context: Readonly<{
    materializedRoot: string;
    dependencyClosureDigest: string;
    moduleTreeId: string;
  }>) => T;
}>;

export type Genesis001SourceBuildResult<T> = Readonly<{
  result: T;
  dependencyClosureDigest: string;
  moduleTreeId: string;
}>;

function withPtrLockedSourceBuildProfile<T>(
  input: PtrSourceBuildInput<T> | Genesis002SourceBuildInput<T> | Genesis001SourceBuildInput<T>,
  profile: PtrLockedSourceBuildProfile,
): PtrSourceBuildResult<T> {
  const inputCode = 'PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID';
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(inputCode);
  const record = input as Readonly<Record<string, unknown>>;
  const repositoryRootInput = record.repositoryRoot;
  const moduleSourceCommit = profile.fixedModuleSourceCommit ?? record.moduleSourceCommit;
  const dependencyCacheRootInput = record.dependencyCacheRoot;
  const materializationParent = record.materializationParent;
  const operation = record.operation;
  const expectedKeys = ['dependencyCacheRoot', 'operation', 'repositoryRoot',
    ...(profile.fixedModuleSourceCommit === undefined ? ['moduleSourceCommit'] : []),
    ...(profile.requireMaterializationParent || Object.hasOwn(record, 'materializationParent')
      ? ['materializationParent'] : [])].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)) fail(inputCode);
  if (typeof repositoryRootInput !== 'string' || typeof dependencyCacheRootInput !== 'string'
    || typeof moduleSourceCommit !== 'string' || typeof operation !== 'function'
    || (materializationParent !== undefined && typeof materializationParent !== 'string')) fail(inputCode);
  const repositoryRoot = canonicalDirectory(repositoryRootInput, false, inputCode);
  const dependencyCacheRoot = canonicalDirectory(dependencyCacheRootInput, true, inputCode);
  if (!COMMIT.test(moduleSourceCommit)) fail(inputCode);
  if (profile.requireMaterializationParent && materializationParent === undefined) fail(inputCode);
  const stateRoot = materializationParent === undefined
    ? ensureCanonicalProductionAdminStateDirectory()
    : canonicalDirectory(materializationParent, true, inputCode);
  const parent = ensurePrivateChild(stateRoot, profile.stateChild);
  const destination = join(parent, randomUUID().replaceAll('-', ''));
  const materialization = profile.materialize({
    repositoryRoot, moduleSourceCommit, destination,
  });
  if ((profile.expectedModuleTreeId !== undefined
      && materialization.moduleTreeId !== profile.expectedModuleTreeId)
    || (profile.expectedSourceClosureDigest !== undefined
      && materialization.sourceClosureDigest !== profile.expectedSourceClosureDigest)) {
    fail('PTR_LOCKED_SOURCE_BUILD_SOURCE_INVALID');
  }
  const ptrRoot = join(materialization.root, ...profile.moduleRoot.split('/'));
  const manifestPath = join(materialization.root, ...profile.manifestPath.split('/'));
  const lockPath = join(materialization.root, ...profile.lockPath.split('/'));
  const workspacePath = profile.workspacePath === undefined
    ? undefined
    : join(materialization.root, ...profile.workspacePath.split('/'));
  let manifest: ReturnType<typeof readExactBoundedFile> | undefined;
  let lock: ReturnType<typeof readExactBoundedFile> | undefined;
  let workspace: ReturnType<typeof readExactBoundedFile> | undefined;
  let packages: readonly LockedPackage[] = [];
  let archiveIdentities: readonly ArchiveIdentity[] = [];
  let installedSnapshot: DependencySnapshot | undefined;
  let closureDigest: string | undefined;
  let result: T | undefined;
  let operationCompleted = false;
  let primaryError: unknown;
  try {
    manifest = readExactBoundedFile(manifestPath, MAXIMUM_SOURCE_AUTHORITY_BYTES,
      'PTR_LOCKED_SOURCE_BUILD_MANIFEST_INVALID', 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    validatePtrManifest(manifest.body);
    lock = readExactBoundedFile(lockPath, MAXIMUM_SOURCE_AUTHORITY_BYTES,
      'PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID', 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    packages = selectedPackages(lock.body, profile);
    if (workspacePath !== undefined) {
      workspace = readExactBoundedFile(workspacePath, MAXIMUM_SOURCE_AUTHORITY_BYTES,
        'PTR_LOCKED_SOURCE_BUILD_WORKSPACE_INVALID', 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
      validateWorkspace(workspace.body, profile);
    }
    const writer = stageGreaterRealmOpenAtHelper({ root: ptrRoot });
    const archives: ArchiveIdentity[] = [];
    let entryCount = 0;
    let fileBytes = 0;
    let writerPrimary: unknown;
    try {
      writer.mkdir('node_modules/.pnpm');
      for (const package_ of packages) {
        const archive = readVerifiedArchive(dependencyCacheRoot, package_);
        archives.push(archive.identity);
        let parsed: SafeNpmTar | undefined;
        try {
          parsed = parseSafeNpmTar(archive.body);
          archive.body.fill(0);
          entryCount += parsed.entries.length;
          fileBytes += parsed.fileBytes;
          if (entryCount > MAXIMUM_CLOSURE_ENTRIES || fileBytes > MAXIMUM_CLOSURE_FILE_BYTES) {
            fail('PTR_LOCKED_SOURCE_BUILD_ARCHIVE_INVALID');
          }
          const base = `node_modules/.pnpm/${pnpmDirectory(package_.key)}/node_modules/${package_.name}`;
          writer.mkdir(base);
          for (const entry of parsed.entries) {
            const path = `${base}/${entry.path}`;
            if (entry.kind === 'directory') writer.mkdir(path);
            else writer.writeFile(path,
              parsed.uncompressed.subarray(entry.offset, entry.offset + entry.size), entry.mode);
          }
          installedPackageManifest(join(ptrRoot, ...base.split('/')), package_);
        } finally {
          archive.body.fill(0);
          parsed?.uncompressed.fill(0);
        }
      }
      const byKey = new Map(packages.map(value => [value.key, value]));
      const nodeModules = join(ptrRoot, 'node_modules');
      for (const package_ of packages) {
        const ownNodeModules = join(nodeModules, '.pnpm', pnpmDirectory(package_.key), 'node_modules');
        for (const dependencyKey of package_.dependencies) {
          const dependency = byKey.get(dependencyKey) ?? fail('PTR_LOCKED_SOURCE_BUILD_LOCK_INVALID');
          const destinationPath = join(ownNodeModules, ...dependency.name.split('/'));
          const dependencyPath = join(nodeModules, '.pnpm', pnpmDirectory(dependency.key),
            'node_modules', ...dependency.name.split('/'));
          createInternalLink({
            root: ptrRoot, destination: destinationPath,
            target: relative(dirname(destinationPath), dependencyPath), writer,
          });
        }
      }
      for (const [name, version] of Object.entries({ ...DEPENDENCIES, ...DEV_DEPENDENCIES })) {
        createInternalLink({
          root: ptrRoot, destination: join(nodeModules, name),
          target: `.pnpm/${pnpmDirectory(`${name}@${version}`)}/node_modules/${name}`, writer,
        });
      }
      for (const [name, target] of [
        ['esbuild', '../esbuild/bin/esbuild'],
        ['tsc', '../typescript/bin/tsc'],
        ['tsserver', '../typescript/bin/tsserver'],
        ['tsx', '../tsx/dist/cli.mjs'],
      ] as const) {
        createInternalLink({ root: ptrRoot, destination: join(nodeModules, '.bin', name), target, writer });
      }
      writer.writeFile('node_modules/.pnpm/lock.yaml', lock.body, FILE_MODE);
      archiveIdentities = Object.freeze(archives);
    } catch (error) {
      writerPrimary = error;
    } finally {
      let finishError: unknown;
      try { writer.finish(); } catch (error) { finishError = error; }
      if (writerPrimary !== undefined || finishError !== undefined) {
        throw new AggregateError([
          ...(writerPrimary === undefined ? [] : [writerPrimary]),
          ...(finishError === undefined ? [] : [finishError]),
        ], 'PTR_LOCKED_SOURCE_BUILD_INSTALL_FAILED');
      }
    }
    const dependencyRoot = join(ptrRoot, 'node_modules');
    installedSnapshot = dependencyTreeSnapshot({ root: dependencyRoot, boundary: ptrRoot });
    closureDigest = dependencyClosureDigest({
      manifestBytes: manifest.body,
      lockBytes: lock.body,
      workspaceBytes: workspace?.body,
      packages,
      snapshot: installedSnapshot,
      profile,
      sourceClosureDigest: materialization.sourceClosureDigest,
    });
    materialization.verify({ prefixes: [profile.generatedPrefix] });
    assertExactFileIdentity(manifestPath, manifest.identity, 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    assertExactFileIdentity(lockPath, lock.identity, 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    if (workspacePath !== undefined && workspace !== undefined) {
      assertExactFileIdentity(workspacePath, workspace.identity,
        'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    }
    result = operation(Object.freeze({
      materializedRoot: materialization.root,
      dependencyClosureDigest: closureDigest,
      moduleTreeId: materialization.moduleTreeId,
    }));
    if (thenable(result)) fail('PTR_LOCKED_SOURCE_BUILD_OPERATION_THENABLE');
    operationCompleted = true;
    assertExactFileIdentity(manifestPath, manifest.identity, 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    assertExactFileIdentity(lockPath, lock.identity, 'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    if (workspacePath !== undefined && workspace !== undefined) {
      assertExactFileIdentity(workspacePath, workspace.identity,
        'PTR_LOCKED_SOURCE_BUILD_SOURCE_CHANGED');
    }
    for (const archive of archiveIdentities) assertArchiveIdentity(archive);
    const after = dependencyTreeSnapshot({ root: dependencyRoot, boundary: ptrRoot });
    if (!sameDependencySnapshot(installedSnapshot, after)) fail('PTR_LOCKED_SOURCE_BUILD_DEPENDENCY_CHANGED');
    materialization.verify({ prefixes: [profile.generatedPrefix], files: [profile.bundlePath] });
    cleanupBundle(materialization.root, profile.bundlePath);
    removeExactDependencyTree(dependencyRoot, installedSnapshot);
    materialization.verify();
  } catch (error) {
    primaryError = error;
  } finally {
    manifest?.body.fill(0);
    lock?.body.fill(0);
    workspace?.body.fill(0);
    for (const package_ of packages) package_.integrityDigest.fill(0);
  }
  let cleanupError: unknown;
  try {
    if (primaryError === undefined) materialization.cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError !== undefined || cleanupError !== undefined) {
    if (primaryError !== undefined && cleanupError === undefined) throw primaryError;
    throw new AggregateError([
      ...(primaryError === undefined ? [] : [primaryError]),
      ...(cleanupError === undefined ? [] : [cleanupError]),
    ], 'PTR_LOCKED_SOURCE_BUILD_FAILED');
  }
  if (!operationCompleted || installedSnapshot === undefined || closureDigest === undefined) {
    return fail('PTR_LOCKED_SOURCE_BUILD_FAILED');
  }
  return Object.freeze({
    result: result as T,
    dependencyClosureDigest: closureDigest,
    moduleTreeId: materialization.moduleTreeId,
  });
}

export function withPtrDarwinLockedSourceBuild<T>(
  input: PtrSourceBuildInput<T>,
): PtrSourceBuildResult<T> {
  return withPtrLockedSourceBuildProfile(input, DARWIN_PROFILE);
}

export function withPtrLinuxLockedSourceBuild<T>(
  input: PtrSourceBuildInput<T>,
): PtrSourceBuildResult<T> {
  return withPtrLockedSourceBuildProfile(input, LINUX_PROFILE);
}

export function withGenesis002LinuxLockedSourceBuild<T>(
  input: Genesis002SourceBuildInput<T>,
): Genesis002SourceBuildResult<T> {
  return withPtrLockedSourceBuildProfile(input, GENESIS002_PROFILE);
}

export function withGenesis001LinuxLockedSourceBuild<T>(
  input: Genesis001SourceBuildInput<T>,
): Genesis001SourceBuildResult<T> {
  return withPtrLockedSourceBuildProfile(input, GENESIS001_PROFILE);
}

export function withGenesis001BaselineLinuxLockedSourceBuild<T>(
  input: Genesis001SourceBuildInput<T>,
): Genesis001SourceBuildResult<T> {
  return withPtrLockedSourceBuildProfile(input, GENESIS001_BASELINE_PROFILE);
}
