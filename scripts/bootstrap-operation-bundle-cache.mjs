import { OPERATION_BUNDLE_NOBLE_PACKAGE } from './local-operation-bundle-noble-v1.mjs';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, realpathSync, writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { downloadLocalPreparationArchive } from './local-preparation-archive-download.mjs';

const PROFILE = 'warpkeep-operation-bundle-cache-bootstrap-linux-x64-v1';
const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const CACHE_ROOT = `${ROOT}/cache/operation-bundles`;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const DEADLINE_MS = 30_000;
const LOCK_MAXIMUM_BYTES = 4 * 1024 * 1024;
const FIXED_PACKAGES = Object.freeze([
  Object.freeze({
    key: 'node_modules/esbuild',
    name: 'esbuild',
    version: '0.28.1',
    resolved: 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz',
    integrity: 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==',
  }),
  Object.freeze({
    key: 'node_modules/@esbuild/linux-x64',
    name: '@esbuild/linux-x64',
    version: '0.28.1',
    resolved: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz',
    integrity: 'sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==',
  }),
]);
const RECOVERY_PACKAGES = Object.freeze([...FIXED_PACKAGES, Object.freeze({
  key: 'node_modules/fflate', name: 'fflate', version: '0.8.3',
  resolved: 'https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz',
  integrity: 'sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==',
})]);

export class OperationBundleCacheError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'OperationBundleCacheError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new OperationBundleCacheError(code, cause === undefined ? undefined : { cause });
}

function privateDirectory(path) {
  try {
    const state = lstatSync(path, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
        || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
      fail('OPERATION_BUNDLE_CACHE_DIRECTORY_INVALID');
    }
  } catch (error) {
    if (error instanceof OperationBundleCacheError) throw error;
    fail('OPERATION_BUNDLE_CACHE_DIRECTORY_INVALID', error);
  }
}

function fsyncDirectory(path) {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
    | (constants.O_NOFOLLOW ?? 0));
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function ensurePrivateChild(parent, name) {
  privateDirectory(parent);
  const path = join(parent, name);
  if (!existsSync(path)) {
    mkdirSync(path, { mode: 0o700 });
    chmodSync(path, 0o700);
    fsyncDirectory(parent);
  }
  privateDirectory(path);
  return path;
}

function attestNode(expectedIdentity) {
  const result = readLocalBindingBoundedFile(NODE_PATH, {
    maximumBytes: NODE_BYTES,
    expectedBytes: NODE_BYTES,
    expectedSha256: NODE_SHA256,
    expectedUid: 1000,
    requireExecutable: true,
    rejectWritableExecutable: true,
    discardBody: true,
    expectedIdentity,
  });
  result.body.fill(0);
  return result.identity;
}

function readFixedLock() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let opened;
  try {
    opened = readLocalBindingBoundedFile(join(repositoryRoot, 'package-lock.json'), {
      maximumBytes: LOCK_MAXIMUM_BYTES,
      minimumBytes: 1,
      expectedUid: 1000,
    });
    return JSON.parse(opened.body.toString('utf8'));
  } catch (error) {
    fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID', error);
  } finally {
    opened?.body.fill(0);
  }
}

function selectFixedPackages(lock, recovery) {
  const packages = recovery ? RECOVERY_PACKAGES : [...FIXED_PACKAGES, OPERATION_BUNDLE_NOBLE_PACKAGE];
  const records = lock?.packages;
  if (records === null || typeof records !== 'object' || Array.isArray(records)) {
    fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID');
  }
  for (const package_ of packages) {
    const record = records[package_.key];
    if (record === null || typeof record !== 'object' || Array.isArray(record)
        || record.version !== package_.version
        || record.resolved !== package_.resolved
        || record.integrity !== package_.integrity) {
      fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID');
    }
  }
  const esbuild = records['node_modules/esbuild'];
  const companion = records['node_modules/@esbuild/linux-x64'];
  if (esbuild.optionalDependencies?.['@esbuild/linux-x64'] !== '0.28.1'
      || JSON.stringify(companion.os) !== JSON.stringify(['linux'])
      || JSON.stringify(companion.cpu) !== JSON.stringify(['x64'])) {
    fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID');
  }
  return packages;
}

function archiveIdentity(cacheRoot, integrity) {
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(integrity);
  if (match === null) fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID');
  const digest = Buffer.from(match[1], 'base64').toString('hex');
  if (!/^[0-9a-f]{128}$/u.test(digest)) fail('OPERATION_BUNDLE_CACHE_LOCK_INVALID');
  const first = ensurePrivateChild(cacheRoot, '_cacache');
  const second = ensurePrivateChild(first, 'content-v2');
  const third = ensurePrivateChild(second, 'sha512');
  const fourth = ensurePrivateChild(third, digest.slice(0, 2));
  const fifth = ensurePrivateChild(fourth, digest.slice(2, 4));
  return Object.freeze({ path: join(fifth, digest.slice(4)), digest });
}

function readVerifiedArchive(expected) {
  let opened;
  try {
    opened = readLocalBindingBoundedFile(expected.path, {
      maximumBytes: MAX_ARCHIVE_BYTES,
      minimumBytes: 1,
      expectedMode: 0o400,
      expectedUid: 1000,
    });
    if (createHash('sha512').update(opened.body).digest('hex') !== expected.digest) {
      fail('OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID');
    }
    return opened.identity;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.cause?.code === 'ENOENT') throw error;
    if (error instanceof OperationBundleCacheError) throw error;
    fail('OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID', error);
  } finally {
    opened?.body.fill(0);
  }
}

function installVerifiedArchive(expected, body) {
  if (createHash('sha512').update(body).digest('hex') !== expected.digest) {
    fail('OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID');
  }
  let descriptor;
  try {
    descriptor = openSync(expected.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o400);
    let offset = 0;
    while (offset < body.length) {
      const count = writeSync(descriptor, body, offset, body.length - offset);
      if (!Number.isSafeInteger(count) || count <= 0 || count > body.length - offset) {
        fail('OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID');
      }
      offset += count;
    }
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fsyncDirectory(dirname(expected.path));
  return readVerifiedArchive(expected);
}

function validateHost() {
  if (process.platform !== 'linux'
      || process.arch !== 'x64'
      || process.getuid?.() !== 1000
      || process.execPath !== NODE_PATH
      || process.env.NODE_OPTIONS
      || process.execArgv.length !== 0) {
    fail('OPERATION_BUNDLE_CACHE_HOST_INVALID');
  }
}

function validateBaseNamespace() {
  for (const path of [ROOT, join(ROOT, 'toolchain'), dirname(dirname(NODE_PATH)), dirname(NODE_PATH),
    join(ROOT, 'cache')]) privateDirectory(path);
}

async function runBootstrap(recovery) {
  validateHost();
  validateBaseNamespace();
  const nodeIdentity = attestNode();
  const packages = selectFixedPackages(readFixedLock(), recovery);
  const cacheRoot = ensurePrivateChild(join(ROOT, 'cache'), 'operation-bundles');
  let installedCount = 0;
  for (const package_ of packages) {
    const expected = archiveIdentity(cacheRoot, package_.integrity);
    try {
      readVerifiedArchive(expected);
      continue;
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.cause?.code !== 'ENOENT') throw error;
    }
    const body = await downloadLocalPreparationArchive(new URL(package_.resolved), {
      maximumBytes: MAX_ARCHIVE_BYTES,
      deadlineMs: DEADLINE_MS,
      errorCode: 'OPERATION_BUNDLE_CACHE_FETCH_REJECTED',
    });
    try {
      installVerifiedArchive(expected, body);
      installedCount += 1;
    } finally {
      body.fill(0);
    }
  }
  validateBaseNamespace();
  for (const package_ of packages) archiveIdentity(cacheRoot, package_.integrity);
  attestNode(nodeIdentity);
  return Object.freeze({ profile: recovery ? 'warpkeep-recovery-bundle-cache-bootstrap-linux-x64-v1' : PROFILE,
    packageCount: packages.length, installedCount });
}

export async function bootstrapOperationBundleCache(...arguments_) {
  return bootstrap(arguments_, false);
}

export async function bootstrapRecoveryBundleCache(...arguments_) {
  return bootstrap(arguments_, true);
}

async function bootstrap(arguments_, recovery) {
  if (arguments_.length !== 0) fail('OPERATION_BUNDLE_CACHE_ARGUMENTS_INVALID');
  try {
    return await runBootstrap(recovery);
  } catch (error) {
    if (error instanceof OperationBundleCacheError) throw error;
    fail(typeof error?.message === 'string' && /^OPERATION_BUNDLE_CACHE_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : 'OPERATION_BUNDLE_CACHE_FAILED', error);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('OPERATION_BUNDLE_CACHE_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else {
    bootstrapOperationBundleCache().then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(error => {
      process.stderr.write(`${error.code ?? 'OPERATION_BUNDLE_CACHE_FAILED'}\n`);
      process.exitCode = 1;
    });
  }
}
