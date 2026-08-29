import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TOOLCHAIN_LOCK_PATH = resolve(
  ROOT,
  'scripts',
  'atlas',
  'greater-realm-toolchain-lock.json',
);
const CLI_PATH = resolve(ROOT, 'scripts', 'atlas', 'greater-realm-cli.ts');
const MAXIMUM_CONTROL_BYTES = 16 * 1024 * 1024;
const MAXIMUM_PACKAGE_FILE_BYTES = 256 * 1024 * 1024;
const MAXIMUM_PACKAGE_FILES = 8_192;
const MAXIMUM_PACKAGE_BYTES = 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SRI_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const FORBIDDEN_SECRET_ARGUMENT = /^(?:--)?(?:private-)?(?:atlas-)?(?:seed|seed-hex|seed-material|layout-digest|stage-digest|package-digest)(?:=|$)/iu;
const RESERVED_ENVIRONMENT_KEY = /^WARPKEEP_GREATER_REALM_/iu;
const POSSIBLE_SECRET_VALUE = /^(?:[0-9a-f]{64}|[A-Za-z0-9+/_-]{43}=?)$/iu;
const ALLOWED_PUBLIC_DIGEST_ENVIRONMENT_KEYS = new Set([
  'NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S',
]);
const ALLOWED_PUBLIC_REPOSITORY_ENVIRONMENT_KEYS = new Set([
  'PWD',
  'INIT_CWD',
  'NPM_CONFIG_LOCAL_PREFIX',
]);
const POSSIBLE_HEX_SECRET_VALUE = /^[0-9a-f]{64}$/iu;
const ALLOWED_COMMANDS = Object.freeze([
  'compare-candidates',
  'retain-pending-owner-report',
  'export-pending-owner-report',
  'export-genesis002-runtime-release',
  'export-ptr-runtime-release',
  'export-runtime-release',
  'export-sanitized-review',
  'generate-candidates',
  'inspect-package',
  'select-candidate',
  'verify-private-package',
  'verify-sanitized-review',
]);
const COMMON_PACKAGE_NAMES = Object.freeze([
  '@img/colour',
  'detect-libc',
  'esbuild',
  'semver',
  'sharp',
  'tsx',
  'typescript',
]);
const LOCKED_PACKAGE_NAMES = Object.freeze([
  '@esbuild/darwin-arm64',
  '@esbuild/linux-x64',
  '@img/colour',
  '@img/sharp-darwin-arm64',
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-libvips-linux-x64',
  '@img/sharp-linux-x64',
  '@typescript/typescript-darwin-arm64',
  '@typescript/typescript-linux-x64',
  'detect-libc',
  'esbuild',
  'fsevents',
  'semver',
  'sharp',
  'tsx',
  'typescript',
]);
const DIRECT_PACKAGE_NAMES = Object.freeze(['sharp', 'tsx', 'typescript']);
const DANGEROUS_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'BUN_OPTIONS',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ESBUILD_BINARY_PATH',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'LIBVIPS_PATH',
  'NODE_COMPILE_CACHE',
  'NODE_ICU_DATA',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_PRESERVE_SYMLINKS',
  'NODE_PRESERVE_SYMLINKS_MAIN',
  'SHARP_FORCE_GLOBAL_LIBVIPS',
  'SHARP_IGNORE_GLOBAL_LIBVIPS',
  'TSX_TSCONFIG_PATH',
]);
const DANGEROUS_CHILD_ENVIRONMENT_KEY_SET = new Set(
  DANGEROUS_CHILD_ENVIRONMENT_KEYS.map(key => key.toUpperCase()),
);

function dangerousChildEnvironmentKey(key) {
  return DANGEROUS_CHILD_ENVIRONMENT_KEY_SET.has(key.toUpperCase());
}

function fail(code) {
  throw new Error(code);
}

function exactRecord(value, keys, code = 'GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID') {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) fail(code);
  const actual = ownKeys.toSorted();
  const expected = [...keys].toSorted();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail(code);
  return value;
}

function pathInside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function comparePortableNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertTrustedStatus(status, kind) {
  const currentUser = process.getuid?.();
  if (
    (kind === 'directory' ? !status.isDirectory() : !status.isFile())
    || status.isSymbolicLink()
    || (currentUser !== undefined && status.uid !== 0 && status.uid !== currentUser)
    || (status.mode & 0o022) !== 0
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
}

function readPinnedFile(path, maximumBytes = MAXIMUM_CONTROL_BYTES) {
  let descriptor;
  let bytes;
  try {
    const beforePath = lstatSync(path);
    assertTrustedStatus(beforePath, 'file');
    if (beforePath.size < 1 || beforePath.size > maximumBytes) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    assertTrustedStatus(before, 'file');
    if (!sameIdentity(beforePath, before) || before.size !== beforePath.size) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
      if (count <= 0) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
      offset += count;
    }
    const after = fstatSync(descriptor);
    const afterPath = lstatSync(path);
    assertTrustedStatus(after, 'file');
    assertTrustedStatus(afterPath, 'file');
    if (
      !sameIdentity(before, after)
      || !sameIdentity(after, afterPath)
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    const result = bytes;
    bytes = undefined;
    return result;
  } catch (error) {
    bytes?.fill(0);
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPinnedJson(path) {
  const bytes = readPinnedFile(path);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function attestDirectory(path, expected) {
  let descriptor;
  try {
    const before = lstatSync(path);
    assertTrustedStatus(before, 'directory');
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    const after = lstatSync(path);
    assertTrustedStatus(opened, 'directory');
    assertTrustedStatus(after, 'directory');
    if (
      !sameIdentity(before, opened)
      || !sameIdentity(opened, after)
      || (expected !== undefined && !sameIdentity(opened, expected))
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    return Object.freeze({ dev: opened.dev, ino: opened.ino });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertAuxiliaryNodeModules(path) {
  const identity = attestDirectory(path);
  const entries = readdirSync(path, { withFileTypes: true });
  if (
    entries.length > 1
    || (entries.length === 1 && (entries[0]?.name !== '.bin' || !entries[0].isDirectory()))
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  if (entries.length === 1) attestDirectory(join(path, '.bin'));
  attestDirectory(path, identity);
}

function hashPinnedPackageFile(path) {
  let descriptor;
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(64 * 1024);
  try {
    const beforePath = lstatSync(path);
    assertTrustedStatus(beforePath, 'file');
    if (beforePath.size < 0 || beforePath.size > MAXIMUM_PACKAGE_FILE_BYTES) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    assertTrustedStatus(before, 'file');
    if (!sameIdentity(beforePath, before) || beforePath.size !== before.size) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    let byteCount = 0;
    while (byteCount < before.size) {
      const count = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.byteLength, before.size - byteCount),
        null,
      );
      if (count <= 0) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
      digest.update(chunk.subarray(0, count));
      byteCount += count;
    }
    const after = fstatSync(descriptor);
    const afterPath = lstatSync(path);
    assertTrustedStatus(after, 'file');
    assertTrustedStatus(afterPath, 'file');
    if (
      !sameIdentity(before, after)
      || !sameIdentity(after, afterPath)
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    return Object.freeze({
      byteCount,
      executable: (after.mode & 0o111) !== 0,
      sha256: digest.digest('hex'),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  } finally {
    chunk.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function computeGreaterRealmPackageTree(packageRoot, options = {}) {
  if (
    options === null
    || typeof options !== 'object'
    || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'excludedFiles')
    || (options.excludedFiles !== undefined && !Array.isArray(options.excludedFiles))
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  const excludedFiles = new Set(options.excludedFiles ?? []);
  if (
    excludedFiles.size !== (options.excludedFiles?.length ?? 0)
    || [...excludedFiles].some(path => (
      typeof path !== 'string'
      || path.length === 0
      || path.startsWith('/')
      || path.includes('\\')
      || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
    ))
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  const canonicalRoot = realpathSync(packageRoot);
  const records = [];
  let byteCount = 0;
  const visit = (directory, relativeDirectory = '') => {
    const directoryIdentity = attestDirectory(directory);
    const entries = readdirSync(directory, { withFileTypes: true })
      .toSorted((left, right) => comparePortableNames(left.name, right.name));
    for (const entry of entries) {
      if (
        entry.name.includes('\0')
        || entry.name.normalize('NFC') !== entry.name
        || entry.name === '.'
        || entry.name === '..'
      ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (relativeDirectory === '' && entry.name === 'node_modules') {
        assertAuxiliaryNodeModules(path);
        continue;
      }
      if (entry.isSymbolicLink()) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
      if (entry.isDirectory()) {
        visit(path, relativePath);
        continue;
      }
      if (!entry.isFile()) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
      const file = hashPinnedPackageFile(path);
      if (excludedFiles.has(relativePath)) continue;
      byteCount += file.byteCount;
      records.push(Object.freeze({
        path: relativePath,
        byteCount: file.byteCount,
        executable: file.executable,
        sha256: file.sha256,
      }));
      if (
        records.length > MAXIMUM_PACKAGE_FILES
        || !Number.isSafeInteger(byteCount)
        || byteCount > MAXIMUM_PACKAGE_BYTES
      ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    attestDirectory(directory, directoryIdentity);
  };
  visit(canonicalRoot);
  const treeSha256 = createHash('sha256')
    .update('warpkeep.greater-realm.package-tree.v1\0', 'utf8')
    .update(JSON.stringify(records), 'utf8')
    .digest('hex');
  return Object.freeze({
    byteCount,
    fileCount: records.length,
    treeSha256,
  });
}

function packageRecord(value, expectedName) {
  const record = exactRecord(
    value,
    ['byteCount', 'fileCount', 'integrity', 'name', 'treeSha256', 'version'],
  );
  if (
    record.name !== expectedName
    || !VERSION_PATTERN.test(record.version)
    || !SRI_PATTERN.test(record.integrity)
    || !SHA256_PATTERN.test(record.treeSha256)
    || !Number.isSafeInteger(record.fileCount)
    || record.fileCount < 1
    || record.fileCount > MAXIMUM_PACKAGE_FILES
    || !Number.isSafeInteger(record.byteCount)
    || record.byteCount < 1
    || record.byteCount > MAXIMUM_PACKAGE_BYTES
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  return record;
}

function parseToolchainLock(repositoryRoot) {
  const path = resolve(repositoryRoot, relative(ROOT, TOOLCHAIN_LOCK_PATH));
  const bytes = readPinnedFile(path);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    const lock = exactRecord(
      value,
      [
        'configuredNodeEngine',
        'configuredPackageManager',
        'kind',
        'packages',
        'profiles',
      ],
    );
    if (
      lock.kind !== 'warpkeep.greater-realm.trusted-toolchain.v1'
      || lock.configuredNodeEngine !== '>=22.13 <23'
      || lock.configuredPackageManager !== 'npm@10.9.8'
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
    const packages = exactRecord(lock.packages, LOCKED_PACKAGE_NAMES);
    const parsedPackages = new Map();
    for (const [name, record] of Object.entries(packages)) {
      if (!PACKAGE_NAME_PATTERN.test(name)) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
      parsedPackages.set(name, packageRecord(record, name));
    }
    const profiles = exactRecord(lock.profiles, ['darwin-arm64', 'linux-x64']);
    const parsedProfiles = new Map();
    for (const [name, value] of Object.entries(profiles)) {
      if (!/^[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)?$/u.test(name)) {
        fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
      }
      const profile = exactRecord(
        value,
        [
          'esbuildPackage',
          'libvipsPackage',
          'sharpPackage',
          'tsxOptionalPackages',
          'typescriptPackage',
        ],
      );
      const packageNames = [
        profile.esbuildPackage,
        profile.libvipsPackage,
        profile.sharpPackage,
        profile.typescriptPackage,
      ];
      if (
        packageNames.some(packageName => (
          typeof packageName !== 'string' || !parsedPackages.has(packageName)
        ))
        || !Array.isArray(profile.tsxOptionalPackages)
        || profile.tsxOptionalPackages.some(packageName => (
          typeof packageName !== 'string' || !parsedPackages.has(packageName)
        ))
        || new Set(profile.tsxOptionalPackages).size !== profile.tsxOptionalPackages.length
        || (
          name === 'darwin-arm64'
            ? profile.tsxOptionalPackages.length !== 1
              || profile.tsxOptionalPackages[0] !== 'fsevents'
            : profile.tsxOptionalPackages.length !== 0
        )
      ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
      parsedProfiles.set(name, Object.freeze({
        esbuildPackage: profile.esbuildPackage,
        libvipsPackage: profile.libvipsPackage,
        sharpPackage: profile.sharpPackage,
        tsxOptionalPackages: Object.freeze([...profile.tsxOptionalPackages]),
        typescriptPackage: profile.typescriptPackage,
      }));
    }
    return Object.freeze({
      configuredNodeEngine: lock.configuredNodeEngine,
      configuredPackageManager: lock.configuredPackageManager,
      manifestSha256: createHash('sha256').update(bytes).digest('hex'),
      packages: parsedPackages,
      profiles: parsedProfiles,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function parsePackageMetadata(packageRoot, expectedName, expectedVersion) {
  const bytes = readPinnedFile(resolve(packageRoot, 'package.json'), 1024 * 1024);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.name !== expectedName
      || value.version !== expectedVersion
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_INVALID');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function assertPackageLockBoundary(repositoryRoot, toolchainLock) {
  const packageJson = readPinnedJson(resolve(repositoryRoot, 'package.json'));
  const packageLock = readPinnedJson(resolve(repositoryRoot, 'package-lock.json'));
  const rootPackage = packageLock?.packages?.[''];
  if (
    packageJson?.packageManager !== toolchainLock.configuredPackageManager
    || packageJson?.engines?.node !== toolchainLock.configuredNodeEngine
    || packageLock?.lockfileVersion !== 3
    || rootPackage?.packageManager !== undefined
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_LOCK_MISMATCH');
  for (const name of DIRECT_PACKAGE_NAMES) {
    const expected = toolchainLock.packages.get(name);
    if (
      expected === undefined
      || packageJson?.devDependencies?.[name] !== expected.version
      || rootPackage?.devDependencies?.[name] !== expected.version
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_LOCK_MISMATCH');
  }
  for (const [name, expected] of toolchainLock.packages) {
    const locked = packageLock?.packages?.[`node_modules/${name}`];
    if (
      locked?.version !== expected.version
      || locked?.integrity !== expected.integrity
      || typeof locked?.resolved !== 'string'
      || !locked.resolved.startsWith('https://registry.npmjs.org/')
    ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_LOCK_MISMATCH');
  }
}

function chooseProfile(toolchainLock, platform, architecture, sharpEnvironment) {
  const prefix = `${platform}-${architecture}`;
  const candidates = [...toolchainLock.profiles]
    .filter(([name, profile]) => name === prefix || name.startsWith(`${prefix}-`))
    .filter(([, profile]) => (
      existsSync(resolve(sharpEnvironment, ...profile.sharpPackage.split('/')))
      && existsSync(resolve(sharpEnvironment, ...profile.libvipsPackage.split('/')))
    ));
  if (candidates.length !== 1) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PROFILE_INVALID');
  return Object.freeze({ name: candidates[0][0], packages: candidates[0][1] });
}

function verifyPackage(alias, expected, expectedName) {
  const beforeCanonical = realpathSync(alias.alias);
  if (beforeCanonical !== alias.canonical) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  }
  // npm's reviewed esbuild postinstall replaces `bin/esbuild` with the exact
  // selected native-package executable. Attest the stable package tree without
  // that platform-specific copy here, then bind the installed copy byte-for-
  // byte to the separately locked native package below.
  const observed = computeGreaterRealmPackageTree(alias.canonical, {
    excludedFiles: expectedName === 'esbuild' ? ['bin/esbuild'] : [],
  });
  if (
    observed.treeSha256 !== expected.treeSha256
    || observed.fileCount !== expected.fileCount
    || observed.byteCount !== expected.byteCount
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
  parsePackageMetadata(alias.canonical, expectedName, expected.version);
  if (realpathSync(alias.alias) !== alias.canonical) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  }
  return Object.freeze({
    canonicalRoot: alias.canonical,
    name: expectedName,
    treeSha256: observed.treeSha256,
    version: expected.version,
  });
}

function assertResolverBinding(importer, packageName, expectedRoot) {
  let resolved;
  try {
    resolved = realpathSync(createRequire(importer).resolve(packageName));
  } catch (error) {
    if (
      expectedRoot === undefined
      && error !== null
      && typeof error === 'object'
      && error.code === 'MODULE_NOT_FOUND'
    ) return;
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_RESOLUTION_INVALID');
  }
  if (
    expectedRoot === undefined
    || resolved === expectedRoot
    || !pathInside(expectedRoot, resolved)
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_RESOLUTION_INVALID');
}

function assertRuntimeNode(version, configuredRange) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (
    configuredRange !== '>=22.13 <23'
    || match === null
    || Number(match[1]) !== 22
    || Number(match[2]) < 13
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_NODE_INVALID');
}

export function verifyGreaterRealmTrustedToolchain(input = {}) {
  const requestedRepositoryRoot = resolve(input.repositoryRoot ?? ROOT);
  let repositoryRoot;
  let nodeModulesRoot;
  try {
    repositoryRoot = realpathSync(requestedRepositoryRoot);
    attestDirectory(repositoryRoot);
    const requestedNodeModulesRoot = resolve(repositoryRoot, 'node_modules');
    if (!existsSync(requestedNodeModulesRoot)) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_MISSING');
    }
    nodeModulesRoot = realpathSync(requestedNodeModulesRoot);
    if (nodeModulesRoot !== requestedNodeModulesRoot) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    attestDirectory(nodeModulesRoot);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
  }
  const toolchainLock = parseToolchainLock(repositoryRoot);
  assertRuntimeNode(input.runtimeNode ?? process.versions.node, toolchainLock.configuredNodeEngine);
  assertPackageLockBoundary(repositoryRoot, toolchainLock);

  const resolveAlias = (base, name) => {
    const alias = resolve(base, ...name.split('/'));
    if (!pathInside(nodeModulesRoot, alias) || !existsSync(alias)) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_MISSING');
    }
    const status = lstatSync(alias);
    if (!status.isDirectory() && !status.isSymbolicLink()) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    const canonical = realpathSync(alias);
    if (canonical === nodeModulesRoot || !pathInside(nodeModulesRoot, canonical)) {
      fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FILESYSTEM_INVALID');
    }
    return Object.freeze({ alias, canonical });
  };

  const expected = name => {
    const record = toolchainLock.packages.get(name);
    if (record === undefined) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
    return record;
  };
  const tsxAlias = resolveAlias(nodeModulesRoot, 'tsx');
  const sharpAlias = resolveAlias(nodeModulesRoot, 'sharp');
  const typescriptAlias = resolveAlias(nodeModulesRoot, 'typescript');
  const tsxEnvironment = dirname(tsxAlias.canonical);
  const esbuildAlias = resolveAlias(tsxEnvironment, 'esbuild');
  const sharpEnvironment = dirname(sharpAlias.canonical);
  const typescriptEnvironment = dirname(typescriptAlias.canonical);
  const profile = chooseProfile(
    toolchainLock,
    input.platform ?? process.platform,
    input.architecture ?? process.arch,
    sharpEnvironment,
  );
  const aliases = Object.freeze({
    '@img/colour': resolveAlias(sharpEnvironment, '@img/colour'),
    'detect-libc': resolveAlias(sharpEnvironment, 'detect-libc'),
    esbuild: esbuildAlias,
    semver: resolveAlias(sharpEnvironment, 'semver'),
    sharp: sharpAlias,
    tsx: tsxAlias,
    typescript: typescriptAlias,
    [profile.packages.esbuildPackage]: resolveAlias(
      dirname(esbuildAlias.canonical),
      profile.packages.esbuildPackage,
    ),
    [profile.packages.sharpPackage]: resolveAlias(
      sharpEnvironment,
      profile.packages.sharpPackage,
    ),
    [profile.packages.libvipsPackage]: resolveAlias(
      sharpEnvironment,
      profile.packages.libvipsPackage,
    ),
    [profile.packages.typescriptPackage]: resolveAlias(
      typescriptEnvironment,
      profile.packages.typescriptPackage,
    ),
    ...Object.fromEntries(profile.packages.tsxOptionalPackages.map(name => [
      name,
      resolveAlias(tsxEnvironment, name),
    ])),
  });
  const tsxImporter = resolve(tsxAlias.canonical, 'dist', 'cli.mjs');
  assertResolverBinding(tsxImporter, 'esbuild', esbuildAlias.canonical);
  assertResolverBinding(
    tsxImporter,
    'fsevents',
    profile.packages.tsxOptionalPackages.includes('fsevents')
      ? aliases.fsevents?.canonical
      : undefined,
  );
  const sharpImporter = resolve(sharpAlias.canonical, 'dist', 'index.cjs');
  for (const name of ['@img/colour', 'detect-libc', 'semver']) {
    assertResolverBinding(sharpImporter, name, aliases[name]?.canonical);
  }
  assertResolverBinding(
    sharpImporter,
    `${profile.packages.sharpPackage}/sharp.node`,
    aliases[profile.packages.sharpPackage]?.canonical,
  );
  for (const suffix of ['lib', 'package', 'versions']) {
    assertResolverBinding(
      sharpImporter,
      `${profile.packages.libvipsPackage}/${suffix}`,
      aliases[profile.packages.libvipsPackage]?.canonical,
    );
  }
  assertResolverBinding(
    resolve(esbuildAlias.canonical, 'lib', 'main.js'),
    `${profile.packages.esbuildPackage}/package.json`,
    aliases[profile.packages.esbuildPackage]?.canonical,
  );
  assertResolverBinding(
    resolve(typescriptAlias.canonical, 'package.json'),
    `${profile.packages.typescriptPackage}/package.json`,
    aliases[profile.packages.typescriptPackage]?.canonical,
  );
  const selectedNames = [
    ...COMMON_PACKAGE_NAMES,
    profile.packages.esbuildPackage,
    profile.packages.sharpPackage,
    profile.packages.libvipsPackage,
    profile.packages.typescriptPackage,
    ...profile.packages.tsxOptionalPackages,
  ].toSorted();
  const verifiedPackages = selectedNames.map(name => {
    const alias = aliases[name];
    if (alias === undefined) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
    return verifyPackage(alias, expected(name), name);
  });
  const installedEsbuild = hashPinnedPackageFile(resolve(esbuildAlias.canonical, 'bin', 'esbuild'));
  const nativeEsbuild = hashPinnedPackageFile(resolve(
    aliases[profile.packages.esbuildPackage].canonical,
    'bin',
    'esbuild',
  ));
  if (
    !installedEsbuild.executable
    || !nativeEsbuild.executable
    || installedEsbuild.byteCount !== nativeEsbuild.byteCount
    || installedEsbuild.sha256 !== nativeEsbuild.sha256
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
  const tsxCli = resolve(tsxAlias.canonical, 'dist', 'cli.mjs');
  const tsxCliStatus = lstatSync(tsxCli);
  assertTrustedStatus(tsxCliStatus, 'file');
  if (!verifiedPackages.some(pkg => pkg.name === 'tsx')) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  }
  return Object.freeze({
    manifestSha256: toolchainLock.manifestSha256,
    profile: profile.name,
    tsxCli,
    verifiedPackageCount: verifiedPackages.length,
  });
}

export function reverifyGreaterRealmTrustedToolchain(receipt, input = {}) {
  if (
    receipt === null
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || !SHA256_PATTERN.test(receipt.manifestSha256 ?? '')
    || typeof receipt.profile !== 'string'
    || typeof receipt.tsxCli !== 'string'
    || !Number.isSafeInteger(receipt.verifiedPackageCount)
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_INVALID');
  const finalReceipt = verifyGreaterRealmTrustedToolchain(input);
  if (
    finalReceipt.manifestSha256 !== receipt.manifestSha256
    || finalReceipt.profile !== receipt.profile
    || finalReceipt.tsxCli !== receipt.tsxCli
    || finalReceipt.verifiedPackageCount !== receipt.verifiedPackageCount
  ) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
  return finalReceipt;
}

function exactCanonicalPublicRepositoryEnvironmentEntry(key, value, repositoryRoot) {
  if (
    typeof value !== 'string'
    || !ALLOWED_PUBLIC_REPOSITORY_ENVIRONMENT_KEYS.has(key.toUpperCase())
    || !isAbsolute(value)
    || value !== repositoryRoot
  ) return false;
  try {
    const canonicalRepositoryRoot = realpathSync(repositoryRoot);
    return canonicalRepositoryRoot === repositoryRoot
      && realpathSync(value) === canonicalRepositoryRoot;
  } catch {
    return false;
  }
}

function possibleSecretEnvironmentEntry(key, value, repositoryRoot) {
  return typeof value === 'string'
    && POSSIBLE_SECRET_VALUE.test(value)
    && !(
      POSSIBLE_HEX_SECRET_VALUE.test(value)
      && ALLOWED_PUBLIC_DIGEST_ENVIRONMENT_KEYS.has(key.toUpperCase())
    )
    && !exactCanonicalPublicRepositoryEnvironmentEntry(key, value, repositoryRoot);
}

function assertBootstrapInvocation(arguments_, environment, repositoryRoot = ROOT) {
  if (
    !Array.isArray(arguments_)
    || arguments_.some(argument => (
      typeof argument !== 'string'
      || FORBIDDEN_SECRET_ARGUMENT.test(argument)
      || POSSIBLE_SECRET_VALUE.test(argument)
    ))
    || Object.entries(environment).some(([key, value]) => (
      RESERVED_ENVIRONMENT_KEY.test(key)
      || possibleSecretEnvironmentEntry(key, value, repositoryRoot)
    ))
  ) fail('GREATER_REALM_PRIVATE_INVOCATION_REJECTED');
  if (Object.keys(environment).some(dangerousChildEnvironmentKey)) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_ENVIRONMENT_INVALID');
  }
}

function assertBootstrapCommand(command) {
  if (typeof command !== 'string' || !ALLOWED_COMMANDS.includes(command)) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_ARGUMENTS_INVALID');
  }
}

/** Executable-only seam for non-vacuous invocation-boundary regressions. */
export const greaterRealmToolchainBootstrapTestSeams = Object.freeze({
  assertCommand(command) {
    assertBootstrapCommand(command);
  },
  assertInvocation(arguments_, environment, repositoryRoot) {
    assertBootstrapInvocation(arguments_, environment, repositoryRoot);
  },
});

function main() {
  const arguments_ = process.argv.slice(2);
  assertBootstrapInvocation(arguments_, process.env);
  const verifyOnly = arguments_[0] === '--verify-only';
  if (verifyOnly && arguments_.length !== 1) fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_ARGUMENTS_INVALID');
  if (!verifyOnly) assertBootstrapCommand(arguments_[0]);
  const receipt = verifyGreaterRealmTrustedToolchain();
  if (verifyOnly) {
    process.stdout.write(`${JSON.stringify({
      profile: receipt.profile,
      verified: true,
      verifiedPackageCount: receipt.verifiedPackageCount,
    })}\n`);
    return;
  }
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (dangerousChildEnvironmentKey(key)) delete environment[key];
  }
  environment.PATH = dirname(process.execPath);
  environment.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT = `sha256:${receipt.manifestSha256}`;
  environment.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE = receipt.profile;
  const result = spawnSync(
    process.execPath,
    [receipt.tsxCli, CLI_PATH, ...arguments_],
    {
      cwd: ROOT,
      env: environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error || result.signal !== null || result.status === null) {
    fail('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_CHILD_FAILED');
  }
  if (result.status === 0) {
    reverifyGreaterRealmTrustedToolchain(receipt);
  }
  process.exitCode = result.status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_:-]{3,160}$/u.test(error.message)
      ? error.message
      : 'GREATER_REALM_TOOLCHAIN_BOOTSTRAP_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
