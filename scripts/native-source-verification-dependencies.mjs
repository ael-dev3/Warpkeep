import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

export const NATIVE_ROOT_DEPENDENCY_PROFILE = 'warpkeep-native-root-dependency-archives-v1';
// A source-owned slice of the actual root tools, not all root/module/service dependencies.
export const NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS = Object.freeze([
  'node_modules/@typescript/typescript-linux-x64', 'node_modules/tsx',
  'node_modules/typescript', 'node_modules/vite', 'node_modules/vitest', 'node_modules/yaml',
]);
const MAX_ARCHIVE = 32 * 1024 * 1024, MAX_PACKAGE = 128 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024, MAX_FILES = 8192, MAX_DIRECTORIES = 2048;
const digest = body => createHash('sha256').update(body).digest('hex');
const fail = code => { throw new Error(`NATIVE_SOURCE_DEPENDENCIES_${code}`); };
const identityKeys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
const identity = stat => Object.freeze(Object.fromEntries(identityKeys.map(key => [key, String(stat[key])])));
const sameIdentity = (left, right) => isDeepStrictEqual(identity(left), identity(right));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(body, limit) {
  if (!(body instanceof Uint8Array) || body.byteLength > limit) fail('BOUNDS');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { fail('UTF8'); }
}
function safePath(path) {
  if (typeof path !== 'string' || path.length < 1 || path.length > 240
    || !/^[A-Za-z0-9@._+/-]+$/u.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')
    || path.split('/').length > 20) fail('PATH');
  return path;
}
function safeLockPath(path) {
  try {
    safePath(path);
    const parts = path.split('/'), component = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;
    for (let at = 0; at < parts.length;) {
      if (parts[at++] !== 'node_modules') fail('LOCK_PATH');
      let name = parts[at++];
      if (name?.startsWith('@')) {
        if (!component.test(name.slice(1))) fail('LOCK_PATH');
        name = parts[at++];
      }
      if (typeof name !== 'string' || !component.test(name)) fail('LOCK_PATH');
    }
  } catch { fail('LOCK_PATH'); }
}
function lock(bytes) {
  let value;
  try { value = JSON.parse(text(bytes, 2 * 1024 * 1024)); } catch { fail('LOCK'); }
  if (!object(value) || value.lockfileVersion !== 3 || !object(value.packages)
    || !object(value.packages['']) || !value.packages[''].name
    || Object.keys(value.packages).length > 1025) fail('LOCK');
  const paths = Object.keys(value.packages).filter(path => path !== '').sort();
  if (!paths.length) fail('LOCK_PATH');
  for (const path of paths) safeLockPath(path);
  for (const path of paths) if (!object(value.packages[path])) fail('LOCK_RECORD');
  return { value, paths };
}
function bins(value, name) {
  if (value === undefined) return [];
  const map = typeof value === 'string' ? { [name.split('/').at(-1)]: value } : value;
  if (!object(map) || Object.keys(map).length > 16) fail('BIN');
  return Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([bin, path]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(bin) || typeof path !== 'string') fail('BIN');
    return Object.freeze({ name: bin, path: safePath(path.startsWith('./') ? path.slice(2) : path) });
  });
}
function record(parsed, packagePath) {
  if (!NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS.includes(packagePath)) fail('PACKAGE_SELECTION');
  const value = parsed.value.packages[packagePath], name = packagePath.slice('node_modules/'.length);
  if (!object(value) || value.link || value.hasInstallScript || value.inBundle
    || typeof value.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(value.version)
    || typeof value.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(value.integrity)
    || value.resolved !== `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${value.version}.tgz`) fail('LOCK_RECORD');
  return { name, version: value.version, integrity: value.integrity, resolved: value.resolved, bins: bins(value.bin, name) };
}
function field(header, offset, length) {
  const value = header.subarray(offset, offset + length), zero = value.indexOf(0), end = zero < 0 ? value.length : zero;
  if (value.subarray(end).some(byte => byte !== 0) || value.subarray(0, end).some(byte => byte < 32 || byte > 126)) fail('ARCHIVE_HEADER');
  return value.subarray(0, end).toString('ascii');
}
function octal(header, offset, length) {
  const value = header.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/u, '').trimStart();
  if (!/^[0-7]{1,11}$/u.test(value)) fail('ARCHIVE_HEADER');
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) fail('ARCHIVE_HEADER');
  return number;
}
/** Pure data comparison. The native capture below independently reads the real
 * source lock and installed tree. Caller bytes or this result alone confer no
 * source, installed-tree, registry-signature, audit or execution authority. */
export function deriveNativeRootDependencyArchive(lockBytes, packagePath, archiveBytes) {
  const expected = record(lock(lockBytes), packagePath), owned = [];
  let archive, inflated;
  try {
    if (!(archiveBytes instanceof Uint8Array) || archiveBytes.byteLength < 1 || archiveBytes.byteLength > MAX_ARCHIVE) fail('ARCHIVE_BOUNDS');
    archive = Buffer.from(archiveBytes);
    if (`sha512-${createHash('sha512').update(archive).digest('base64')}` !== expected.integrity) fail('ARCHIVE_SRI');
    try { inflated = gunzipSync(archive, { maxOutputLength: MAX_PACKAGE }); } catch { fail('ARCHIVE_FORMAT'); }
    if (inflated.length % 512 !== 0) fail('ARCHIVE_FORMAT');
    const names = new Set(), directories = new Set();
    let ended = false, totalBytes = 0;
    for (let at = 0; at < inflated.length;) {
      const header = inflated.subarray(at, at + 512);
      if (header.every(byte => byte === 0)) {
        if (at + 1024 > inflated.length || inflated.subarray(at).some(byte => byte !== 0)) fail('ARCHIVE_END');
        ended = true; break;
      }
      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
      if (checksum !== octal(header, 148, 8) || field(header, 257, 6) !== 'ustar'
        || ![0, 48, 53].includes(header[156]) || field(header, 157, 100) !== ''
        || header.subarray(500).some(byte => byte !== 0)) fail('ARCHIVE_HEADER');
      const prefix = field(header, 345, 155), raw = `${prefix ? prefix + '/' : ''}${field(header, 0, 100)}`;
      const directory = header[156] === 53, size = octal(header, 124, 12), mode = octal(header, 100, 8);
      if (raw === 'package/' && directory && size === 0 && mode === 0o755) { at += 512; continue; }
      if (!raw.startsWith('package/')) fail('ARCHIVE_PATH');
      const path = safePath(directory && raw.endsWith('/') ? raw.slice(8, -1) : raw.slice(8));
      if (path === 'node_modules' || path.startsWith('node_modules/') || names.has(path.toLowerCase())) fail('ARCHIVE_PATH');
      names.add(path.toLowerCase());
      if (directory) {
        if (size !== 0 || mode !== 0o755 || directories.size >= MAX_DIRECTORIES) fail('ARCHIVE_DIRECTORY');
        directories.add(path); at += 512; continue;
      }
      if (![0o644, 0o755].includes(mode) || size > 64 * 1024 * 1024 || owned.length >= MAX_FILES
        || (totalBytes += size) > MAX_PACKAGE || at + 512 + size > inflated.length) fail('ARCHIVE_FILE');
      const next = at + 512 + Math.ceil(size / 512) * 512;
      if (next > inflated.length || inflated.subarray(at + 512 + size, next).some(byte => byte !== 0)) fail('ARCHIVE_PADDING');
      owned.push({ path, bytes: Buffer.from(inflated.subarray(at + 512, at + 512 + size)), archiveMode: mode });
      at = next;
    }
    if (!ended || !owned.length) fail('ARCHIVE_END');
    const filePaths = new Set(owned.map(file => file.path));
    for (const path of [...filePaths, ...directories]) {
      const parts = path.split('/');
      for (let n = 1; n < parts.length; n++) {
        const parent = parts.slice(0, n).join('/');
        if (filePaths.has(parent)) fail('ARCHIVE_PATH');
        directories.add(parent);
      }
    }
    if (directories.size > MAX_DIRECTORIES) fail('ARCHIVE_DIRECTORY');
    const metadata = owned.find(file => file.path === 'package.json');
    if (!metadata) fail('PACKAGE_METADATA');
    let packageJson;
    try { packageJson = JSON.parse(text(metadata.bytes, 1024 * 1024)); } catch { fail('PACKAGE_METADATA'); }
    if (!object(packageJson) || packageJson.name !== expected.name || packageJson.version !== expected.version
      || packageJson.scripts?.preinstall || packageJson.scripts?.install || packageJson.scripts?.postinstall
      || packageJson.bundleDependencies || packageJson.bundledDependencies
      || !isDeepStrictEqual(bins(packageJson.bin, expected.name), expected.bins)) fail('PACKAGE_METADATA');
    const binPaths = new Set(expected.bins.map(bin => bin.path));
    if ([...binPaths].some(path => !filePaths.has(path))) fail('BIN');
    const files = owned.sort((a, b) => a.path < b.path ? -1 : 1).map(file => Object.freeze({
      ...file, mode: binPaths.has(file.path) ? 0o755 : file.archiveMode, sha256: digest(file.bytes),
    }));
    return Object.freeze({ packagePath, ...expected, archiveSha256: digest(archive), archiveBytes: archive.length,
      files: Object.freeze(files), directories: Object.freeze([...directories].sort()), totalBytes,
      archiveIntegrityVerified: true, installedTreeVerified: false, registrySignaturesVerified: false, productionAuthorized: false });
  } catch (error) { for (const file of owned) file.bytes.fill(0); throw error; }
  finally { archive?.fill(0); inflated?.fill(0); }
}
function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
}
function ownedStat(path) {
  const stat = fs.lstatSync(path, { bigint: true });
  if (stat.uid !== 1000n || stat.gid !== 1000n || stat.nlink < 1n) fail('OWNER');
  return stat;
}
function directory(path) {
  const stat = ownedStat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o7777n) !== 0o755n) fail('DIRECTORY');
  return stat;
}
function readFile(path, max, modes, singleLink = false) {
  const before = ownedStat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(max)
    || !modes.includes(Number(before.mode & 0o7777n)) || singleLink && before.nlink !== 1n) fail('FILE');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let body, accepted = false;
  try {
    if (!sameIdentity(before, fs.fstatSync(fd, { bigint: true }))) fail('FILE_CHANGED');
    body = Buffer.alloc(Number(before.size));
    for (let at = 0; at < body.length;) {
      const size = fs.readSync(fd, body, at, body.length - at, at);
      if (size === 0) fail('FILE_CHANGED'); at += size;
    }
    const extra = Buffer.alloc(1), extraBytes = fs.readSync(fd, extra, 0, 1, body.length);
    extra.fill(0);
    const after = fs.fstatSync(fd, { bigint: true });
    if (extraBytes !== 0 || !sameIdentity(before, after)
      || !sameIdentity(before, ownedStat(path))) fail('FILE_CHANGED');
    accepted = true;
    return { path, body, sha256: digest(body), bytes: body.length, mode: Number(before.mode & 0o7777n), identity: identity(before) };
  } finally { if (!accepted) body?.fill(0); fs.closeSync(fd); }
}
function entries(path) {
  const dir = fs.opendirSync(path), names = [];
  try {
    for (let item; (item = dir.readSync()) !== null;) {
      if (names.length >= MAX_FILES + MAX_DIRECTORIES) fail('INSTALLED_BOUNDS'); names.push(item.name);
    }
  } finally { dir.closeSync(); }
  return names.sort();
}
function packageRoot(root, packagePath) {
  const logical = join(root, packagePath), modules = join(root, 'node_modules');
  const parts = packagePath.split('/');
  for (let n = 1; n < parts.length; n++) directory(join(root, ...parts.slice(0, n)));
  const stat = ownedStat(logical);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(logical), real = fs.realpathSync(logical);
    if (isAbsolute(target) || !inside(modules, real)) fail('PACKAGE_LINK');
    directory(real);
    const rel = relative(modules, real).split(sep);
    for (let n = 1; n < rel.length; n++) directory(join(modules, ...rel.slice(0, n)));
    if (!sameIdentity(stat, ownedStat(logical)) || target !== fs.readlinkSync(logical)) fail('PACKAGE_LINK_CHANGED');
    return { path: logical, realPath: real, kind: 'symlink', target, identity: identity(stat) };
  }
  directory(logical);
  if (fs.realpathSync(logical) !== logical) fail('PACKAGE_LINK');
  return { path: logical, realPath: logical, kind: 'directory', identity: identity(stat) };
}
function installed(root, expected) {
  const packageDirectory = packageRoot(root, expected.packagePath), files = [], directories = [], excludedNestedInstallRoots = [];
  const expectedFiles = new Map(expected.files.map(file => [file.path, file]));
  const expectedDirectories = new Set(expected.directories);
  function walk(path, prefix = '') {
    const before = directory(path), names = entries(path);
    if (directories.length >= MAX_DIRECTORIES) fail('INSTALLED_BOUNDS');
    directories.push({ path: prefix || '.', identity: identity(before), mode: 0o755, entriesSha256: digest(Buffer.from(JSON.stringify(names))) });
    for (const name of names) {
      const child = join(path, name), relativePath = safePath(prefix ? prefix + '/' + name : name);
      if (!prefix && name === 'node_modules') {
        const stat = directory(child);
        excludedNestedInstallRoots.push({ path: relativePath, identity: identity(stat) }); continue;
      }
      const stat = ownedStat(child);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        if (!expectedDirectories.has(relativePath)) fail('INSTALLED_EXTRA');
        walk(child, relativePath); continue;
      }
      const file = expectedFiles.get(relativePath);
      if (!file) fail('INSTALLED_EXTRA');
      const actual = readFile(child, 64 * 1024 * 1024, [file.mode]);
      try { if (actual.bytes !== file.bytes.length || !actual.body.equals(file.bytes)) fail('INSTALLED_BYTES'); }
      finally { actual.body.fill(0); }
      const { body, ...facts } = actual;
      files.push({ ...facts, path: relativePath, archiveMode: file.archiveMode, hardlinked: stat.nlink > 1n });
      if (files.length > MAX_FILES) fail('INSTALLED_BOUNDS');
    }
    if (!sameIdentity(before, directory(path)) || !isDeepStrictEqual(names, entries(path))) fail('DIRECTORY_CHANGED');
  }
  walk(packageDirectory.realPath);
  if (!isDeepStrictEqual(files.map(file => file.path).sort(), [...expectedFiles.keys()].sort())
    || !isDeepStrictEqual(directories.map(dir => dir.path).filter(path => path !== '.').sort(), [...expectedDirectories].sort())) fail('INSTALLED_MISSING');
  const binLinks = expected.bins.map(bin => {
    const binDirectory = join(dirname(packageDirectory.path), '.bin'); directory(binDirectory);
    const path = join(binDirectory, bin.name), stat = ownedStat(path), targetPath = join(packageDirectory.realPath, bin.path);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(path);
      if (isAbsolute(target) || fs.realpathSync(path) !== targetPath || !sameIdentity(stat, ownedStat(path))) fail('BIN_LINK');
      return { name: bin.name, path, kind: 'symlink', target, targetPath, identity: identity(stat) };
    }
    // A regular bin must be the actual archive entry (e.g. an installed hardlink),
    // not an unproved generated pnpm shell shim.
    const actual = readFile(path, 64 * 1024 * 1024, [0o755]), file = expectedFiles.get(bin.path);
    try { if (!actual.body.equals(file.bytes)) fail('BIN_BYTES'); } finally { actual.body.fill(0); }
    const { body, ...facts } = actual;
    return { ...facts, name: bin.name, kind: 'file', targetPath, hardlinked: stat.nlink > 1n };
  });
  return { packageDirectory, files: files.sort((a, b) => a.path < b.path ? -1 : 1), directories, binLinks, excludedNestedInstallRoots };
}
/** Reads, never installs. Archive locators can select no extra packages or hashes:
 * all expected bytes/SRI/bin metadata come from this real source-owned root lock.
 * Missing locators stay uncovered; supplied invalid archives/trees fail closed. */
export function captureNativeRootDependencyAttestation(repositoryRoot, archives) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000 || process.getgid?.() !== 1000) fail('HOST');
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot
    || fs.realpathSync(repositoryRoot) !== repositoryRoot || !Array.isArray(archives)
    || archives.length > NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS.length) fail('INPUT');
  const rootIdentity = identity(directory(repositoryRoot)), lockPath = join(repositoryRoot, 'package-lock.json');
  const sourceLock = readFile(lockPath, 2 * 1024 * 1024, [0o644], true), parsed = lock(sourceLock.body);
  const locators = new Map(), verifiedPackages = [], retained = [];
  let totalBytes = 0;
  try {
    for (const packagePath of NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS) record(parsed, packagePath);
    for (const locator of archives) {
      if (!object(locator) || !isDeepStrictEqual(Object.keys(locator).sort(), ['archivePath', 'packagePath'])
        || !NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS.includes(locator.packagePath) || locators.has(locator.packagePath)
        || typeof locator.archivePath !== 'string' || !isAbsolute(locator.archivePath)
        || resolve(locator.archivePath) !== locator.archivePath || fs.realpathSync(locator.archivePath) !== locator.archivePath) fail('INPUT');
      locators.set(locator.packagePath, locator.archivePath);
    }
    for (const packagePath of NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS) {
      if (!locators.has(packagePath)) continue;
      const archive = readFile(locators.get(packagePath), MAX_ARCHIVE, [0o400, 0o444, 0o600, 0o644], true);
      let expected, held = false;
      try {
        expected = deriveNativeRootDependencyArchive(sourceLock.body, packagePath, archive.body);
        if ((totalBytes += expected.totalBytes) > MAX_TOTAL) fail('TOTAL_BOUNDS');
        const first = installed(repositoryRoot, expected);
        retained.push({ archive, expected, first }); held = true;
        const { body, ...archiveFacts } = archive;
        verifiedPackages.push({ packagePath, name: expected.name, version: expected.version,
          resolved: expected.resolved, integrity: expected.integrity, archive: archiveFacts,
          archiveFileCount: expected.files.length, archiveIntegrityVerified: true, installedPackageFilesVerified: true,
          ...first });
      } finally { if (!held) { archive.body.fill(0); for (const file of expected?.files ?? []) file.bytes.fill(0); } }
    }
    // A complete second pass runs after every selected package's first pass,
    // so changes to an earlier package during later package reads are detected.
    for (const { archive, expected, first } of retained) {
      if (!isDeepStrictEqual(first, installed(repositoryRoot, expected))) fail('INSTALLED_CHANGED');
      const repeatedArchive = readFile(archive.path, MAX_ARCHIVE, [archive.mode], true);
      try { if (!isDeepStrictEqual(archive.identity, repeatedArchive.identity) || !archive.body.equals(repeatedArchive.body)) fail('ARCHIVE_CHANGED'); }
      finally { repeatedArchive.body.fill(0); }
    }
    const repeatedLock = readFile(lockPath, 2 * 1024 * 1024, [0o644], true);
    try { if (!isDeepStrictEqual(sourceLock.identity, repeatedLock.identity) || !sourceLock.body.equals(repeatedLock.body)
      || !isDeepStrictEqual(rootIdentity, identity(directory(repositoryRoot)))) fail('SOURCE_CHANGED'); }
    finally { repeatedLock.body.fill(0); }
    const verified = new Set(verifiedPackages.map(pkg => pkg.packagePath));
    const { body, ...lockfile } = sourceLock;
    return Object.freeze({ schemaVersion: 1, profile: NATIVE_ROOT_DEPENDENCY_PROFILE, repositoryRoot, repositoryIdentity: rootIdentity,
      lockfile, rootLockRecordCount: parsed.paths.length, selectedPackagePaths: NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS,
      verifiedPackages, verifiedPackageCount: verifiedPackages.length, verifiedInstalledBytes: totalBytes,
      uncoveredRootRecords: parsed.paths.filter(path => !verified.has(path)).map(path => ({ path,
        reason: NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS.includes(path) ? 'archive-not-supplied' : 'outside-fixed-root-slice' })),
      inventoryStable: true, rootLockFullyVerified: false, moduleDependenciesVerified: false, serviceDependenciesVerified: false,
      registrySignaturesVerified: false, auditVerified: false, environmentVerified: false, productionAuthorized: false,
      scope: 'Stable archive-SRI/all-own-package-file comparison for the source-owned root tool slice only. Nested installs, unselected root packages, generated shims/postinstall transformations, pnpm/module/services, registry signatures, audit, full environment and release authority remain unproved.' });
  } finally {
    sourceLock.body.fill(0);
    for (const { archive, expected } of retained) { archive.body.fill(0); for (const file of expected.files) file.bytes.fill(0); }
  }
}
