import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { hostname, userInfo } from 'node:os';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE =
  'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH =
  'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json';

const SOURCE_CLOSURE_PROFILE =
  'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
const SOURCE_CLOSURE_MANIFEST_PATH =
  'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json';
const RAW_FILE_SOURCE_DIGEST_PROFILE = 'raw-file-sha256-v1';
const SOURCE_DIGEST_PROFILES = new Set([
  RAW_FILE_SOURCE_DIGEST_PROFILE,
  'bootstrap-pin-projection-sha256-v1',
  'reviewed-release-transition-projection-sha256-v1',
  'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1',
]);
const SERVICE_PATH = 'services/auth-bridge';
const VIRTUAL_STORE_PATH = `${SERVICE_PATH}/node_modules/.pnpm`;
const LOCKFILE_PATH = `${SERVICE_PATH}/pnpm-lock.yaml`;
const INSTALLED_LOCKFILE_PATH = `${VIRTUAL_STORE_PATH}/lock.yaml`;
const PACKAGE_MANAGER = 'pnpm@11.7.0';
const WRANGLER_VERSION = '4.110.0';
const MAX_MANIFEST_BYTES = 32 * 1_024;
const MAX_SOURCE_MANIFEST_BYTES = 192 * 1_024;
const MAX_ENTRIES = 25_000;
const MAX_DIRECTORIES = 4_000;
const MAX_FILES = 20_000;
const MAX_SYMBOLIC_LINKS = 3_000;
const MAX_RESOLVER_ENTRIES = 64;
const MAX_RESOLVER_DIRECTORIES = 16;
const MAX_RESOLVER_FILES = 16;
const MAX_RESOLVER_SYMBOLIC_LINKS = 32;
const MAX_RESOLVER_FILE_BYTES = 512 * 1_024;
const MAX_FILE_BYTES = 128 * 1_024 * 1_024;
const MAX_TOTAL_FILE_BYTES = 768 * 1_024 * 1_024;
const MAX_DEPTH = 32;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SAFE_ENTRY_NAME = /^[\x20-\x7e]+$/u;
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9@+_.,=~()\- /]+$/u;
const NORMALIZED_SHIM_DIRECTORY_NAME = '.bin';
const NORMALIZED_SERVICE_ROOT = '$AUTH_BRIDGE_SERVICE_ROOT';
const NORMALIZED_PNPM_STORE = '$PNPM_STORE';
const NORMALIZED_PNPM_VALIDATION_TIME = '$PNPM_VALIDATION_TIME';
const REQUIRED_TOP_LEVEL_LINKS = Object.freeze(['typescript', 'wrangler', 'yaml']);
const REQUIRED_EXECUTABLE_PATHS = Object.freeze([
  '.pnpm/@cloudflare+workerd-darwin-arm64@1.20260708.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd',
  '.pnpm/@esbuild+darwin-arm64@0.28.1/node_modules/@esbuild/darwin-arm64/bin/esbuild',
  '.pnpm/@typescript+typescript-darwin-arm64@7.0.2/node_modules/@typescript/typescript-darwin-arm64/lib/tsc',
  '.pnpm/wrangler@4.110.0_@cloudflare+workers-types@5.20260708.1_@types+node@26.1.1/node_modules/wrangler/bin/wrangler.js',
]);
const WRANGLER_ENTRYPOINT = REQUIRED_EXECUTABLE_PATHS.at(-1);
const MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'sourceClosureProfile',
  'sourceClosureManifestPath',
  'lockfileSha256',
  'packageManager',
  'platform',
  'architecture',
  'nodeVersion',
  'virtualStorePath',
  'normalizedShimDirectoryName',
  'normalizedServiceRoot',
  'topLevelLinks',
  'requiredExecutablePaths',
  'resolverNamespaceEntryCount',
  'resolverNamespaceDirectoryCount',
  'resolverNamespaceFileCount',
  'resolverNamespaceSymbolicLinkCount',
  'resolverNamespaceSha256',
  'normalizedShimFileCount',
  'entryCount',
  'directoryCount',
  'fileCount',
  'symbolicLinkCount',
  'executableFileCount',
  'totalFileBytes',
  'treeSha256',
]);
const LINK_KEYS = Object.freeze(['path', 'target']);
const authenticatedInstalledToolchainAuthorities = new WeakMap();

export class AuthBridgeNotificationPreparedInstalledToolchainError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedInstalledToolchainError';
    this.code = code;
  }
}

function fail(code) {
  throw new AuthBridgeNotificationPreparedInstalledToolchainError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function canonicalDirectory(path, code) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(code);
  let canonical;
  let metadata;
  try {
    canonical = realpathSync(resolve(path));
    metadata = lstatSync(resolve(path));
  } catch {
    fail(code);
  }
  if (
    canonical !== resolve(path)
    || metadata.isSymbolicLink()
    || !metadata.isDirectory()
  ) fail(code);
  return canonical;
}

function canonicalExecutable(path, code) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(code);
  let canonical;
  let metadata;
  try {
    canonical = realpathSync(resolve(path));
    metadata = lstatSync(resolve(path));
  } catch {
    fail(code);
  }
  assertOwnedSafeMetadata(metadata, 'file', code);
  if (
    canonical !== resolve(path)
    || metadata.isSymbolicLink()
    || !metadata.isFile()
    || (metadata.mode & 0o111) === 0
  ) fail(code);
  return canonical;
}

function currentUserId() {
  if (typeof process.getuid !== 'function') {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_PLATFORM_INVALID');
  }
  return process.getuid();
}

function runnerIdentityDigest({
  repository,
  sourceClosureManifestSha256,
  installedToolchainManifestSha256,
  resolverNamespaceSha256,
  treeSha256,
}) {
  let account;
  let rootMetadata;
  let repositoryMetadata;
  const host = hostname();
  try {
    account = userInfo();
    rootMetadata = lstatSync('/');
    repositoryMetadata = lstatSync(repository);
  } catch {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RUNNER_IDENTITY_INVALID');
  }
  if (
    typeof host !== 'string'
    || host.length < 1
    || host.length > 255
    || /[\0\r\n]/u.test(host)
    || typeof account?.homedir !== 'string'
    || !isAbsolute(account.homedir)
    || account.uid !== currentUserId()
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RUNNER_IDENTITY_INVALID');
  return createHash('sha256').update(JSON.stringify({
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE,
    host,
    ownerUid: account.uid,
    ownerHome: resolve(account.homedir),
    repository,
    repositoryDevice: String(repositoryMetadata.dev),
    rootDevice: String(rootMetadata.dev),
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    sourceClosureManifestSha256,
    installedToolchainManifestSha256,
    resolverNamespaceSha256,
    treeSha256,
  })).digest('hex');
}

function assertOwnedSafeMetadata(metadata, kind, code) {
  if (
    metadata.uid !== currentUserId()
    // Linux reports symbolic-link mode as 0777 because those permission bits
    // are not enforceable there. Darwin retains the stricter production rule.
    // The exact mode remains bound into both resolver and tree digests.
    || (
      (metadata.mode & 0o022) !== 0
      && !(kind === 'symbolicLink' && process.platform === 'linux')
    )
    || (kind !== 'directory' && metadata.nlink !== 1)
  ) fail(code);
}

function sameMetadata(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function canonicalMode(metadata) {
  return (metadata.mode & 0o7777).toString(8).padStart(4, '0');
}

function readBoundedRegularFile(path, maximumBytes, code) {
  let descriptor;
  let buffer;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = fstatSync(descriptor);
    assertOwnedSafeMetadata(before, 'file', code);
    if (!before.isFile() || before.size > maximumBytes) {
      fail(code);
    }
    buffer = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const count = readSync(
        descriptor,
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      );
      if (count < 1) fail(code);
      offset += count;
    }
    const after = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (
      !sameMetadata(before, after)
      || !sameMetadata(before, pathAfter)
      || pathAfter.isSymbolicLink()
    ) fail(code);
    return buffer;
  } catch (error) {
    if (buffer !== undefined) buffer.fill(0);
    if (error instanceof AuthBridgeNotificationPreparedInstalledToolchainError) {
      throw error;
    }
    fail(code);
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the primary failure. */ }
    }
  }
}

function sha256File(path, maximumBytes, code) {
  const body = readBoundedRegularFile(path, maximumBytes, code);
  try { return createHash('sha256').update(body).digest('hex'); } finally {
    body.fill(0);
  }
}

function canonicalTreeFile(path, maximumBytes, code, serviceRoot, normalized) {
  const body = readBoundedRegularFile(path, maximumBytes, code);
  try {
    if (!normalized) {
      return Object.freeze({
        size: body.byteLength,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
    }
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SHIM_INVALID');
    }
    if (
      !source.startsWith('#!/bin/sh\n')
      || !source.includes(serviceRoot)
      || source.includes(NORMALIZED_SERVICE_ROOT)
    ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SHIM_INVALID');
    const canonical = source.replaceAll(serviceRoot, NORMALIZED_SERVICE_ROOT);
    const canonicalBody = Buffer.from(canonical, 'utf8');
    try {
      return Object.freeze({
        size: canonicalBody.byteLength,
        sha256: createHash('sha256').update(canonicalBody).digest('hex'),
      });
    } finally {
      canonicalBody.fill(0);
    }
  } finally {
    body.fill(0);
  }
}

function canonicalResolverMetadataFile(path, relativePath, serviceRoot, code) {
  const body = readBoundedRegularFile(path, MAX_RESOLVER_FILE_BYTES, code);
  let source;
  let document;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    document = JSON.parse(source);
  } catch {
    fail(code);
  } finally {
    body.fill(0);
  }
  const expectedSource = `${JSON.stringify(document, null, 2)}${
    relativePath === '.modules.yaml' ? '' : '\n'
  }`;
  if (!isRecord(document) || expectedSource !== source) {
    fail(code);
  }
  if (relativePath === '.modules.yaml') {
    if (
      typeof document.prunedAt !== 'string'
      || !Number.isFinite(Date.parse(document.prunedAt))
      || typeof document.storeDir !== 'string'
      || !isAbsolute(document.storeDir)
      || document.virtualStoreDir !== '.pnpm'
    ) fail(code);
    document.prunedAt = NORMALIZED_PNPM_VALIDATION_TIME;
    document.storeDir = NORMALIZED_PNPM_STORE;
  } else if (relativePath === '.pnpm-workspace-state-v1.json') {
    if (
      !Number.isSafeInteger(document.lastValidatedTimestamp)
      || !isRecord(document.projects)
      || JSON.stringify(Object.keys(document.projects))
        !== JSON.stringify([serviceRoot])
    ) fail(code);
    const project = document.projects[serviceRoot];
    if (!isRecord(project)) fail(code);
    document.lastValidatedTimestamp = NORMALIZED_PNPM_VALIDATION_TIME;
    document.projects = { [NORMALIZED_SERVICE_ROOT]: project };
  } else {
    fail(code);
  }
  const canonical = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
  try {
    return Object.freeze({
      size: canonical.byteLength,
      sha256: createHash('sha256').update(canonical).digest('hex'),
    });
  } finally {
    canonical.fill(0);
  }
}

function canonicalResolverFile(path, relativePath, serviceRoot, code) {
  if (relativePath.startsWith(`${NORMALIZED_SHIM_DIRECTORY_NAME}/`)) {
    return canonicalTreeFile(path, MAX_RESOLVER_FILE_BYTES, code, serviceRoot, true);
  }
  if (
    relativePath === '.modules.yaml'
    || relativePath === '.pnpm-workspace-state-v1.json'
  ) return canonicalResolverMetadataFile(path, relativePath, serviceRoot, code);
  return canonicalTreeFile(path, MAX_RESOLVER_FILE_BYTES, code, serviceRoot, false);
}

function readCanonicalJson(path, maximumBytes, keys, code) {
  const body = readBoundedRegularFile(path, maximumBytes, code);
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    value = JSON.parse(source);
  } catch {
    fail(code);
  } finally {
    body.fill(0);
  }
  if (!exactKeys(value, keys) || `${JSON.stringify(value, null, 2)}\n` !== source) {
    fail(code);
  }
  return value;
}

function validateRelativePath(value, code) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 1_024
    || !SAFE_RELATIVE_PATH.test(value)
    || value.includes('\\')
    || value.includes('//')
    || value.split('/').some(part => part === '' || part === '.' || part === '..')
  ) fail(code);
  return value;
}

function sourceManifestBinding(repository, installedManifestSha256) {
  const path = resolve(repository, SOURCE_CLOSURE_MANIFEST_PATH);
  const document = readCanonicalJson(
    path,
    MAX_SOURCE_MANIFEST_BYTES,
    ['schemaVersion', 'profile', 'members'],
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID',
  );
  if (
    document.schemaVersion !== 2
    || document.profile !== SOURCE_CLOSURE_PROFILE
    || !Array.isArray(document.members)
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID');
  const expected = new Map([
    [AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
      undefined],
    [LOCKFILE_PATH, undefined],
  ]);
  let previous = '';
  for (const member of document.members) {
    if (
      !exactKeys(member, ['path', 'digestProfile', 'sha256'])
      || validateRelativePath(
        member.path,
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID',
      ) !== member.path
      || !SOURCE_DIGEST_PROFILES.has(member.digestProfile)
      || !SHA256_HEX.test(member.sha256 ?? '')
      || member.path <= previous
    ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID');
    previous = member.path;
    if (expected.has(member.path)) {
      if (member.digestProfile !== RAW_FILE_SOURCE_DIGEST_PROFILE) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID');
      }
      expected.set(member.path, member.sha256);
    }
  }
  if (
    expected.get(AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH)
      !== installedManifestSha256
    || !SHA256_HEX.test(expected.get(LOCKFILE_PATH) ?? '')
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID');
  return Object.freeze({
    manifestSha256: sha256File(
      path,
      MAX_SOURCE_MANIFEST_BYTES,
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID',
    ),
    lockfileSha256: expected.get(LOCKFILE_PATH),
  });
}

function manifestHeader(manifest) {
  return Object.freeze({
    profile: manifest.profile,
    sourceClosureProfile: manifest.sourceClosureProfile,
    lockfileSha256: manifest.lockfileSha256,
    packageManager: manifest.packageManager,
    platform: manifest.platform,
    architecture: manifest.architecture,
    nodeVersion: manifest.nodeVersion,
    virtualStorePath: manifest.virtualStorePath,
    normalizedShimDirectoryName: manifest.normalizedShimDirectoryName,
    normalizedServiceRoot: manifest.normalizedServiceRoot,
    topLevelLinks: manifest.topLevelLinks,
    requiredExecutablePaths: manifest.requiredExecutablePaths,
    resolverNamespaceEntryCount: manifest.resolverNamespaceEntryCount,
    resolverNamespaceDirectoryCount: manifest.resolverNamespaceDirectoryCount,
    resolverNamespaceFileCount: manifest.resolverNamespaceFileCount,
    resolverNamespaceSymbolicLinkCount:
      manifest.resolverNamespaceSymbolicLinkCount,
    resolverNamespaceSha256: manifest.resolverNamespaceSha256,
  });
}

function inspectTopLevelLinks(nodeModules, expectedLinks) {
  const links = [];
  for (const name of expectedLinks) {
    const path = resolve(nodeModules, name);
    let metadata;
    let target;
    let canonical;
    try {
      metadata = lstatSync(path);
      target = readlinkSync(path, 'utf8');
      canonical = realpathSync(path);
    } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TOP_LEVEL_LINK_INVALID');
    }
    assertOwnedSafeMetadata(
      metadata,
      'symbolicLink',
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_TOP_LEVEL_LINK_INVALID',
    );
    if (
      !metadata.isSymbolicLink()
      || isAbsolute(target)
      || target.includes('\\')
      || !inside(nodeModules, resolve(dirname(path), target))
      || !inside(nodeModules, canonical)
    ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TOP_LEVEL_LINK_INVALID');
    links.push(Object.freeze({ path: name, target }));
  }
  return Object.freeze(links);
}

function inspectResolverNamespace(nodeModules, virtualStore, serviceRoot) {
  const hash = createHash('sha256');
  hash.update(`${AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE}\n`);
  hash.update('resolver-namespace-v1\n');
  const counters = {
    resolverNamespaceEntryCount: 0,
    resolverNamespaceDirectoryCount: 0,
    resolverNamespaceFileCount: 0,
    resolverNamespaceSymbolicLinkCount: 0,
  };
  const visit = (absolute, relativePath, depth) => {
    if (depth > 3) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
    let metadata;
    try { metadata = lstatSync(absolute); } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
    }
    counters.resolverNamespaceEntryCount += 1;
    if (counters.resolverNamespaceEntryCount > MAX_RESOLVER_ENTRIES) {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
    }
    if (metadata.isDirectory()) {
      assertOwnedSafeMetadata(
        metadata,
        'directory',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID',
      );
      counters.resolverNamespaceDirectoryCount += 1;
      if (
        counters.resolverNamespaceDirectoryCount > MAX_RESOLVER_DIRECTORIES
      ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      hash.update(`D\0${relativePath}\0${canonicalMode(metadata)}\0`);
      if (relativePath === '.pnpm') return;
      let descriptor;
      let before;
      let entries;
      try {
        descriptor = openSync(
          absolute,
          fsConstants.O_RDONLY
            | fsConstants.O_NOFOLLOW
            | fsConstants.O_DIRECTORY,
        );
        before = fstatSync(descriptor);
        entries = readdirSync(absolute);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      } finally {
        if (descriptor !== undefined) {
          try {
            const after = fstatSync(descriptor);
            const pathAfter = lstatSync(absolute);
            if (
              !sameMetadata(before, after)
              || !sameMetadata(before, pathAfter)
              || pathAfter.isSymbolicLink()
            ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
          } finally {
            try { closeSync(descriptor); } catch { /* Preserve failure. */ }
          }
        }
      }
      entries.sort();
      for (const name of entries) {
        if (
          name.length < 1
          || !SAFE_ENTRY_NAME.test(name)
          || name.includes('/')
          || name.includes('\\')
          || name.includes('\0')
        ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
        const childRelative = relativePath === '.' ? name : `${relativePath}/${name}`;
        visit(resolve(absolute, name), childRelative, depth + 1);
      }
      return;
    }
    if (metadata.isFile()) {
      assertOwnedSafeMetadata(
        metadata,
        'file',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID',
      );
      counters.resolverNamespaceFileCount += 1;
      if (counters.resolverNamespaceFileCount > MAX_RESOLVER_FILES) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      }
      const canonical = canonicalResolverFile(
        absolute,
        relativePath,
        serviceRoot,
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID',
      );
      hash.update(
        `F\0${relativePath}\0${canonicalMode(metadata)}\0${canonical.size}\0${canonical.sha256}\0`,
      );
      return;
    }
    if (metadata.isSymbolicLink()) {
      assertOwnedSafeMetadata(
        metadata,
        'symbolicLink',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID',
      );
      let target;
      let canonical;
      let after;
      try {
        target = readlinkSync(absolute, 'utf8');
        canonical = realpathSync(absolute);
        after = lstatSync(absolute);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      }
      if (
        !sameMetadata(metadata, after)
        || target.length < 1
        || target.length > 1_024
        || isAbsolute(target)
        || target.includes('\\')
        || target.includes('\0')
        || !inside(nodeModules, resolve(dirname(absolute), target))
        || !inside(virtualStore, canonical)
      ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      counters.resolverNamespaceSymbolicLinkCount += 1;
      if (
        counters.resolverNamespaceSymbolicLinkCount
          > MAX_RESOLVER_SYMBOLIC_LINKS
      ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
      hash.update(`L\0${relativePath}\0${canonicalMode(metadata)}\0${target}\0`);
      return;
    }
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
  };
  visit(nodeModules, '.', 0);
  return Object.freeze({
    ...counters,
    resolverNamespaceSha256: hash.digest('hex'),
  });
}

function inspectVirtualStore(virtualStore, header) {
  const hash = createHash('sha256');
  hash.update(`${AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE}\n`);
  hash.update(`${JSON.stringify(header)}\n`);
  const counters = {
    entryCount: 0,
    directoryCount: 0,
    fileCount: 0,
    symbolicLinkCount: 0,
    executableFileCount: 0,
    normalizedShimFileCount: 0,
    totalFileBytes: 0,
  };
  const visit = (absolute, relativePath, depth) => {
    if (depth > MAX_DEPTH) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_TOO_LARGE');
    let metadata;
    try { metadata = lstatSync(absolute); } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
    }
    counters.entryCount += 1;
    if (counters.entryCount > MAX_ENTRIES) {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_TOO_LARGE');
    }
    if (metadata.isDirectory()) {
      assertOwnedSafeMetadata(
        metadata,
        'directory',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID',
      );
      counters.directoryCount += 1;
      if (counters.directoryCount > MAX_DIRECTORIES) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_TOO_LARGE');
      }
      hash.update(`D\0${relativePath}\0${canonicalMode(metadata)}\0`);
      let descriptor;
      let before;
      let entries;
      try {
        descriptor = openSync(
          absolute,
          fsConstants.O_RDONLY
            | fsConstants.O_NOFOLLOW
            | fsConstants.O_DIRECTORY,
        );
        before = fstatSync(descriptor);
        entries = readdirSync(absolute);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
      } finally {
        if (descriptor !== undefined) {
          try {
            const after = fstatSync(descriptor);
            const pathAfter = lstatSync(absolute);
            if (
              !sameMetadata(before, after)
              || !sameMetadata(before, pathAfter)
              || pathAfter.isSymbolicLink()
            ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
          } finally {
            try { closeSync(descriptor); } catch { /* Preserve failure. */ }
          }
        }
      }
      entries.sort();
      for (const name of entries) {
        if (
          name.length < 1
          || !SAFE_ENTRY_NAME.test(name)
          || name.includes('/')
          || name.includes('\\')
          || name.includes('\0')
        ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
        const childRelative = relativePath === '.' ? name : `${relativePath}/${name}`;
        visit(resolve(absolute, name), childRelative, depth + 1);
      }
      return;
    }
    if (metadata.isFile()) {
      assertOwnedSafeMetadata(
        metadata,
        'file',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID',
      );
      if (metadata.size > MAX_FILE_BYTES) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
      }
      counters.fileCount += 1;
      const normalized = relativePath.split('/').includes(
        NORMALIZED_SHIM_DIRECTORY_NAME,
      );
      const canonical = canonicalTreeFile(
        absolute,
        MAX_FILE_BYTES,
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID',
        resolve(virtualStore, '..', '..'),
        normalized,
      );
      counters.totalFileBytes += canonical.size;
      if (
        counters.fileCount > MAX_FILES
        || counters.totalFileBytes > MAX_TOTAL_FILE_BYTES
      ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_TOO_LARGE');
      if ((metadata.mode & 0o111) !== 0) counters.executableFileCount += 1;
      if (normalized) counters.normalizedShimFileCount += 1;
      hash.update(
        `F\0${relativePath}\0${canonicalMode(metadata)}\0${canonical.size}\0${canonical.sha256}\0`,
      );
      return;
    }
    if (metadata.isSymbolicLink()) {
      assertOwnedSafeMetadata(
        metadata,
        'symbolicLink',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID',
      );
      let target;
      let canonical;
      try {
        target = readlinkSync(absolute, 'utf8');
        canonical = realpathSync(absolute);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
      }
      if (
        target.length < 1
        || target.length > 1_024
        || isAbsolute(target)
        || target.includes('\\')
        || target.includes('\0')
        || !inside(virtualStore, resolve(dirname(absolute), target))
        || !inside(virtualStore, canonical)
      ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
      counters.symbolicLinkCount += 1;
      if (counters.symbolicLinkCount > MAX_SYMBOLIC_LINKS) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_TOO_LARGE');
      }
      hash.update(
        `L\0${relativePath}\0${canonicalMode(metadata)}\0${target}\0`,
      );
      return;
    }
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TREE_INVALID');
  };
  visit(virtualStore, '.', 0);
  return Object.freeze({
    ...counters,
    treeSha256: hash.digest('hex'),
  });
}

function inspectRequiredExecutables(nodeModules, paths) {
  for (const relativePath of paths) {
    validateRelativePath(
      relativePath,
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_EXECUTABLE_INVALID',
    );
    const path = resolve(nodeModules, relativePath);
    let canonical;
    let metadata;
    try {
      canonical = realpathSync(path);
      metadata = lstatSync(path);
    } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_EXECUTABLE_INVALID');
    }
    assertOwnedSafeMetadata(
      metadata,
      'file',
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_EXECUTABLE_INVALID',
    );
    if (
      canonical !== path
      || metadata.isSymbolicLink()
      || !metadata.isFile()
      || (metadata.mode & 0o111) === 0
    ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_EXECUTABLE_INVALID');
  }
}

function inspectInstalledTree({ repository, manifestHeader: header }) {
  const service = canonicalDirectory(
    resolve(repository, SERVICE_PATH),
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SERVICE_INVALID',
  );
  const nodeModules = canonicalDirectory(
    resolve(service, 'node_modules'),
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_NODE_MODULES_INVALID',
  );
  const virtualStore = canonicalDirectory(
    resolve(nodeModules, '.pnpm'),
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_VIRTUAL_STORE_INVALID',
  );
  if (!inside(service, nodeModules) || !inside(nodeModules, virtualStore)) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_VIRTUAL_STORE_INVALID');
  }
  for (const path of [repository, service, nodeModules]) {
    const metadata = lstatSync(path);
    assertOwnedSafeMetadata(
      metadata,
      'directory',
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_DIRECTORY_INVALID',
    );
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_DIRECTORY_INVALID');
    }
  }
  const topLevelLinks = inspectTopLevelLinks(
    nodeModules,
    REQUIRED_TOP_LEVEL_LINKS,
  );
  if (header !== undefined && JSON.stringify(topLevelLinks) !== JSON.stringify(
    header.topLevelLinks,
  )) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_TOP_LEVEL_LINK_MISMATCH');
  inspectRequiredExecutables(nodeModules, REQUIRED_EXECUTABLE_PATHS);
  const wranglerEntrypoint = resolve(nodeModules, WRANGLER_ENTRYPOINT);
  const topWranglerEntrypoint = resolve(nodeModules, 'wrangler/bin/wrangler.js');
  let resolvedTopWrangler;
  try { resolvedTopWrangler = realpathSync(topWranglerEntrypoint); } catch {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
  }
  if (resolvedTopWrangler !== wranglerEntrypoint) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
  }
  let packageDocument;
  try {
    packageDocument = JSON.parse(readFileSync(
      resolve(dirname(dirname(wranglerEntrypoint)), 'package.json'),
      'utf8',
    ));
  } catch {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
  }
  if (
    packageDocument?.name !== 'wrangler'
    || packageDocument?.version !== WRANGLER_VERSION
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
  const resolverNamespace = inspectResolverNamespace(
    nodeModules,
    virtualStore,
    service,
  );
  const treeHeader = header ?? Object.freeze({
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE,
    sourceClosureProfile: SOURCE_CLOSURE_PROFILE,
    lockfileSha256: sha256File(
      resolve(repository, LOCKFILE_PATH),
      2 * 1_024 * 1_024,
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_LOCKFILE_INVALID',
    ),
    packageManager: PACKAGE_MANAGER,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    virtualStorePath: VIRTUAL_STORE_PATH,
    normalizedShimDirectoryName: NORMALIZED_SHIM_DIRECTORY_NAME,
    normalizedServiceRoot: NORMALIZED_SERVICE_ROOT,
    topLevelLinks,
    requiredExecutablePaths: REQUIRED_EXECUTABLE_PATHS,
    ...resolverNamespace,
  });
  return Object.freeze({
    topLevelLinks,
    wranglerEntrypoint,
    ...resolverNamespace,
    ...inspectVirtualStore(virtualStore, treeHeader),
  });
}

function parseManifest(repository) {
  const path = resolve(
    repository,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
  );
  const document = readCanonicalJson(
    path,
    MAX_MANIFEST_BYTES,
    MANIFEST_KEYS,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_MANIFEST_INVALID',
  );
  if (
    document.schemaVersion !== 1
    || document.profile
      !== AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE
    || document.sourceClosureProfile !== SOURCE_CLOSURE_PROFILE
    || document.sourceClosureManifestPath !== SOURCE_CLOSURE_MANIFEST_PATH
    || !SHA256_HEX.test(document.lockfileSha256 ?? '')
    || document.packageManager !== PACKAGE_MANAGER
    || document.platform !== process.platform
    || document.architecture !== process.arch
    || document.nodeVersion !== process.version
    || document.virtualStorePath !== VIRTUAL_STORE_PATH
    || document.normalizedShimDirectoryName !== NORMALIZED_SHIM_DIRECTORY_NAME
    || document.normalizedServiceRoot !== NORMALIZED_SERVICE_ROOT
    || !Array.isArray(document.topLevelLinks)
    || document.topLevelLinks.length !== REQUIRED_TOP_LEVEL_LINKS.length
    || document.topLevelLinks.some((link, index) => (
      !exactKeys(link, LINK_KEYS)
      || link.path !== REQUIRED_TOP_LEVEL_LINKS[index]
      || typeof link.target !== 'string'
      || link.target.length < 1
      || link.target.length > 1_024
      || isAbsolute(link.target)
      || link.target.includes('\\')
      || link.target.includes('\0')
    ))
    || JSON.stringify(document.requiredExecutablePaths)
      !== JSON.stringify(REQUIRED_EXECUTABLE_PATHS)
    || !Number.isSafeInteger(document.resolverNamespaceEntryCount)
    || document.resolverNamespaceEntryCount < 1
    || document.resolverNamespaceEntryCount > MAX_RESOLVER_ENTRIES
    || !Number.isSafeInteger(document.resolverNamespaceDirectoryCount)
    || document.resolverNamespaceDirectoryCount < 1
    || document.resolverNamespaceDirectoryCount > MAX_RESOLVER_DIRECTORIES
    || !Number.isSafeInteger(document.resolverNamespaceFileCount)
    || document.resolverNamespaceFileCount < 1
    || document.resolverNamespaceFileCount > MAX_RESOLVER_FILES
    || !Number.isSafeInteger(document.resolverNamespaceSymbolicLinkCount)
    || document.resolverNamespaceSymbolicLinkCount < 1
    || document.resolverNamespaceSymbolicLinkCount
      > MAX_RESOLVER_SYMBOLIC_LINKS
    || document.resolverNamespaceEntryCount
      !== document.resolverNamespaceDirectoryCount
        + document.resolverNamespaceFileCount
        + document.resolverNamespaceSymbolicLinkCount
    || !SHA256_HEX.test(document.resolverNamespaceSha256 ?? '')
    || !Number.isSafeInteger(document.normalizedShimFileCount)
    || document.normalizedShimFileCount < 1
    || document.normalizedShimFileCount > document.fileCount
    || !Number.isSafeInteger(document.entryCount)
    || document.entryCount < 1
    || document.entryCount > MAX_ENTRIES
    || !Number.isSafeInteger(document.directoryCount)
    || document.directoryCount < 1
    || document.directoryCount > MAX_DIRECTORIES
    || !Number.isSafeInteger(document.fileCount)
    || document.fileCount < 1
    || document.fileCount > MAX_FILES
    || !Number.isSafeInteger(document.symbolicLinkCount)
    || document.symbolicLinkCount < 1
    || document.symbolicLinkCount > MAX_SYMBOLIC_LINKS
    || !Number.isSafeInteger(document.executableFileCount)
    || document.executableFileCount < 1
    || document.executableFileCount > document.fileCount
    || !Number.isSafeInteger(document.totalFileBytes)
    || document.totalFileBytes < 1
    || document.totalFileBytes > MAX_TOTAL_FILE_BYTES
    || !SHA256_HEX.test(document.treeSha256 ?? '')
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_MANIFEST_INVALID');
  return Object.freeze({
    document,
    sha256: sha256File(
      path,
      MAX_MANIFEST_BYTES,
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_MANIFEST_INVALID',
    ),
  });
}

export function createAuthBridgeNotificationPreparedInstalledToolchainCandidate({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const repository = canonicalDirectory(
    repositoryRoot,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_REPOSITORY_INVALID',
  );
  const lockfileSha256 = sha256File(
    resolve(repository, LOCKFILE_PATH),
    2 * 1_024 * 1_024,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_LOCKFILE_INVALID',
  );
  const installedLockfileSha256 = sha256File(
    resolve(repository, INSTALLED_LOCKFILE_PATH),
    2 * 1_024 * 1_024,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_LOCKFILE_INVALID',
  );
  if (lockfileSha256 !== installedLockfileSha256) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_LOCKFILE_MISMATCH');
  }
  const preliminary = inspectInstalledTree({ repository });
  return Object.freeze({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE,
    sourceClosureProfile: SOURCE_CLOSURE_PROFILE,
    sourceClosureManifestPath: SOURCE_CLOSURE_MANIFEST_PATH,
    lockfileSha256,
    packageManager: PACKAGE_MANAGER,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    virtualStorePath: VIRTUAL_STORE_PATH,
    normalizedShimDirectoryName: NORMALIZED_SHIM_DIRECTORY_NAME,
    normalizedServiceRoot: NORMALIZED_SERVICE_ROOT,
    topLevelLinks: preliminary.topLevelLinks,
    requiredExecutablePaths: REQUIRED_EXECUTABLE_PATHS,
    resolverNamespaceEntryCount: preliminary.resolverNamespaceEntryCount,
    resolverNamespaceDirectoryCount:
      preliminary.resolverNamespaceDirectoryCount,
    resolverNamespaceFileCount: preliminary.resolverNamespaceFileCount,
    resolverNamespaceSymbolicLinkCount:
      preliminary.resolverNamespaceSymbolicLinkCount,
    resolverNamespaceSha256: preliminary.resolverNamespaceSha256,
    normalizedShimFileCount: preliminary.normalizedShimFileCount,
    entryCount: preliminary.entryCount,
    directoryCount: preliminary.directoryCount,
    fileCount: preliminary.fileCount,
    symbolicLinkCount: preliminary.symbolicLinkCount,
    executableFileCount: preliminary.executableFileCount,
    totalFileBytes: preliminary.totalFileBytes,
    treeSha256: preliminary.treeSha256,
  });
}

export function verifyAuthBridgeNotificationPreparedInstalledToolchain({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  nodeExecutable = process.execPath,
  wranglerEntrypoint,
} = {}) {
  const repository = canonicalDirectory(
    repositoryRoot,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_REPOSITORY_INVALID',
  );
  const node = canonicalExecutable(
    nodeExecutable,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_NODE_INVALID',
  );
  if (
    node !== canonicalExecutable(
      process.execPath,
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_NODE_INVALID',
    )
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_PLATFORM_INVALID');
  const manifest = parseManifest(repository);
  const binding = sourceManifestBinding(repository, manifest.sha256);
  if (binding.lockfileSha256 !== manifest.document.lockfileSha256) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID');
  }
  const candidate = createAuthBridgeNotificationPreparedInstalledToolchainCandidate({
    repositoryRoot: repository,
  });
  if (`${JSON.stringify(candidate, null, 2)}\n`
    !== `${JSON.stringify(manifest.document, null, 2)}\n`) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_DIGEST_MISMATCH');
  }
  const expectedWrangler = resolve(
    repository,
    SERVICE_PATH,
    'node_modules',
    WRANGLER_ENTRYPOINT,
  );
  if (canonicalExecutable(
    expectedWrangler,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID',
  ) !== expectedWrangler) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
  if (wranglerEntrypoint !== undefined) {
    const topWranglerEntrypoint = resolve(
      repository,
      SERVICE_PATH,
      'node_modules',
      'wrangler/bin/wrangler.js',
    );
    let resolvedWranglerEntrypoint;
    try {
      if (resolve(wranglerEntrypoint) !== topWranglerEntrypoint) {
        fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
      }
      resolvedWranglerEntrypoint = realpathSync(wranglerEntrypoint);
    } catch {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
    }
    if (resolvedWranglerEntrypoint !== expectedWrangler) {
      fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_WRANGLER_INVALID');
    }
  }
  const identityDigest = runnerIdentityDigest({
    repository,
    sourceClosureManifestSha256: binding.manifestSha256,
    installedToolchainManifestSha256: manifest.sha256,
    resolverNamespaceSha256: manifest.document.resolverNamespaceSha256,
    treeSha256: manifest.document.treeSha256,
  });
  const authority = Object.freeze({
    profile: manifest.document.profile,
    sourceClosureManifestSha256: binding.manifestSha256,
    runnerIdentityDigest: identityDigest,
    resolverNamespaceEntryCount:
      manifest.document.resolverNamespaceEntryCount,
    resolverNamespaceSha256: manifest.document.resolverNamespaceSha256,
    entryCount: manifest.document.entryCount,
    totalFileBytes: manifest.document.totalFileBytes,
    treeSha256: manifest.document.treeSha256,
    wranglerEntrypoint: expectedWrangler,
  });
  authenticatedInstalledToolchainAuthorities.set(authority, Object.freeze({
    repository,
    nodeExecutable: node,
    installedToolchainManifestSha256: manifest.sha256,
  }));
  return authority;
}

export function assertAuthBridgeNotificationPreparedInstalledToolchainAuthority(
  authority,
  { repositoryRoot, nodeExecutable = process.execPath } = {},
) {
  const metadata = authenticatedInstalledToolchainAuthorities.get(authority);
  const repository = canonicalDirectory(
    repositoryRoot,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_AUTHORITY_INVALID',
  );
  const node = canonicalExecutable(
    nodeExecutable,
    'AUTH_BRIDGE_PREPARED_TOOLCHAIN_AUTHORITY_INVALID',
  );
  if (
    metadata === undefined
    || metadata.repository !== repository
    || metadata.nodeExecutable !== node
    || authority.runnerIdentityDigest !== runnerIdentityDigest({
      repository,
      sourceClosureManifestSha256: authority.sourceClosureManifestSha256,
      installedToolchainManifestSha256:
        metadata.installedToolchainManifestSha256,
      resolverNamespaceSha256: authority.resolverNamespaceSha256,
      treeSha256: authority.treeSha256,
    })
  ) fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_AUTHORITY_INVALID');
  return authority;
}

function main() {
  if (process.argv.length === 3 && process.argv[2] === '--print-candidate') {
    process.stdout.write(`${JSON.stringify(
      createAuthBridgeNotificationPreparedInstalledToolchainCandidate(),
      null,
      2,
    )}\n`);
    return;
  }
  if (process.argv.length !== 2) {
    fail('AUTH_BRIDGE_PREPARED_TOOLCHAIN_ARGUMENT_INVALID');
  }
  const result = verifyAuthBridgeNotificationPreparedInstalledToolchain();
  process.stdout.write(
    `auth bridge installed toolchain: ${result.entryCount} entries verified\n`,
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try { main(); } catch (error) {
    process.stderr.write(`${
      error instanceof AuthBridgeNotificationPreparedInstalledToolchainError
        ? error.code
        : 'AUTH_BRIDGE_PREPARED_TOOLCHAIN_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
