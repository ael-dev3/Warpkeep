import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, readdirSync, writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { downloadLocalPreparationArchive } from './local-preparation-archive-download.mjs';
import { validateLocalBindingYamlManifest } from './local-binding-runtime-core.mjs';

const PROFILE = 'warpkeep-genesis002-local-binding-cache-bootstrap-linux-x64-v1';
const ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const YAML_ROOT = `${ROOT}/toolchain/yaml-2.9.0/package`;
const CACHE_ROOT = `${ROOT}/cache/genesis002`;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const DEADLINE_MS = 30_000;
const EXPECTED_EDGES = Object.freeze({
  '@esbuild/linux-x64@0.25.12': [],
  'base64-js@1.5.1': [],
  'esbuild@0.25.12': ['@esbuild/linux-x64@0.25.12'],
  'get-tsconfig@4.14.0': ['resolve-pkg-maps@1.0.0'],
  'headers-polyfill@4.0.3': [],
  'object-inspect@1.13.4': [],
  'prettier@3.9.5': [],
  'pure-rand@7.0.1': [],
  'resolve-pkg-maps@1.0.0': [],
  'safe-stable-stringify@2.5.0': [],
  'spacetimedb@2.6.1': [
    'base64-js@1.5.1', 'headers-polyfill@4.0.3', 'object-inspect@1.13.4',
    'prettier@3.9.5', 'pure-rand@7.0.1', 'safe-stable-stringify@2.5.0',
    'statuses@2.0.2', 'url-polyfill@1.1.14',
  ],
  'statuses@2.0.2': [],
  'tsx@4.20.6': ['esbuild@0.25.12', 'get-tsconfig@4.14.0'],
  'typescript@5.6.3': [],
  'url-polyfill@1.1.14': [],
});
const EXPECTED_KEYS = Object.freeze(Object.keys(EXPECTED_EDGES).sort());

export class Genesis002LocalBindingCacheError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'Genesis002LocalBindingCacheError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new Genesis002LocalBindingCacheError(code, cause === undefined ? undefined : { cause });
}

function privateDirectory(path) {
  try {
    const state = lstatSync(path, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
        || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
      fail('GENESIS002_LOCAL_BINDING_CACHE_DIRECTORY_INVALID');
    }
  } catch (error) {
    if (error instanceof Genesis002LocalBindingCacheError) throw error;
    fail('GENESIS002_LOCAL_BINDING_CACHE_DIRECTORY_INVALID', error);
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

function attestExecutable(path, bytes, digest, uid, expectedIdentity) {
  const result = readLocalBindingBoundedFile(path, {
    maximumBytes: bytes ?? 64 * 1024 * 1024, expectedBytes: bytes,
    expectedSha256: digest, expectedUid: uid, requireExecutable: true,
    rejectWritableExecutable: true, discardBody: true, expectedIdentity,
  });
  result.body.fill(0);
  return result.identity;
}

function git(repositoryRoot, identity, args, encoding = 'utf8') {
  attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0);
  const result = spawnSync(GIT_PATH, args, {
    cwd: repositoryRoot, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    encoding, shell: false, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  });
  attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0, identity);
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_SOURCE_INVALID', result.error);
  }
  return encoding === null ? Buffer.from(result.stdout) : result.stdout.trim();
}

function attestCommittedSource(repositoryRoot, gitIdentity) {
  const commit = git(repositoryRoot, gitIdentity, ['rev-parse', '--verify', 'HEAD']);
  const tree = git(repositoryRoot, gitIdentity, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^[0-9a-f]{40}$/u.test(tree)) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_SOURCE_INVALID');
  }
  const files = [
    'scripts/bootstrap-genesis002-local-binding-cache.mjs',
    'scripts/local-binding-bounded-file.mjs',
    'scripts/local-preparation-archive-download.mjs',
    'scripts/local-binding-runtime-core.mjs',
    'scripts/local-binding-runtime-cli-snapshot.mjs',
    'scripts/local-binding-runtime-process.mjs',
    'scripts/local-binding-runtime-yaml-v1.json',
    'spacetimedb/pnpm-lock.yaml',
    'spacetimedb/pnpm-workspace.yaml',
  ];
  const bodies = new Map();
  for (const path of files) {
    const committed = git(repositoryRoot, gitIdentity, ['show', `${commit}:${path}`], null);
    const current = readLocalBindingBoundedFile(join(repositoryRoot, ...path.split('/')), {
      maximumBytes: 8 * 1024 * 1024, expectedBytes: committed.length,
      expectedSha256: createHash('sha256').update(committed).digest('hex'), expectedUid: 1000,
    });
    current.body.fill(0);
    bodies.set(path, committed);
  }
  return Object.freeze({ commit, tree, bodies });
}

function attestYaml(repositoryRoot, source) {
  for (const path of [YAML_ROOT]) privateDirectory(path);
  const manifestBody = source.bodies.get('scripts/local-binding-runtime-yaml-v1.json').toString('utf8');
  const manifest = validateLocalBindingYamlManifest(manifestBody);
  for (const entry of manifest.files) {
    const path = join(YAML_ROOT, ...entry.path.split('/'));
    const body = readLocalBindingBoundedFile(path, {
      maximumBytes: 16 * 1024 * 1024, expectedBytes: entry.bytes,
      expectedSha256: entry.sha256, expectedMode: entry.mode, expectedUid: 1000,
    }).body;
    body.fill(0);
  }
  const require = createRequire(import.meta.url);
  const yaml = require(join(YAML_ROOT, manifest.entry));
  if (typeof yaml?.parse !== 'function') fail('GENESIS002_LOCAL_BINDING_CACHE_YAML_INVALID');
  return yaml;
}

function packageNameAndVersion(key) {
  const separator = key.lastIndexOf('@');
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)
      || !/^[0-9][0-9A-Za-z.+-]{0,127}$/u.test(version)) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
  }
  return { name, version };
}

function selectPackages(lock) {
  const packages = [];
  for (const key of EXPECTED_KEYS) {
    const identity = packageNameAndVersion(key);
    const record = lock?.packages?.[key];
    const snapshot = lock?.snapshots?.[key];
    const integrity = record?.resolution?.integrity;
    if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)
        || snapshot === null || typeof snapshot !== 'object') {
      fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
    }
    const dependencies = [];
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(snapshot[field] ?? {})) {
        const dependencyKey = `${name}@${version}`;
        const dependency = lock.packages?.[dependencyKey];
        const compatible = (dependency?.os === undefined || JSON.stringify(dependency.os) === JSON.stringify(['linux']))
          && (dependency?.cpu === undefined || JSON.stringify(dependency.cpu) === JSON.stringify(['x64']));
        if (compatible) dependencies.push(dependencyKey);
        else if (field !== 'optionalDependencies') fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
      }
    }
    dependencies.sort();
    if (JSON.stringify(dependencies) !== JSON.stringify(EXPECTED_EDGES[key])) {
      fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
    }
    packages.push(Object.freeze({ key, ...identity, integrity }));
  }
  if (packages.length !== 15) fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
  return Object.freeze(packages);
}

function archiveIdentity(cacheRoot, integrity) {
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(integrity);
  if (match === null) fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
  const digest = Buffer.from(match[1], 'base64').toString('hex');
  if (!/^[0-9a-f]{128}$/u.test(digest)) fail('GENESIS002_LOCAL_BINDING_CACHE_LOCK_INVALID');
  const first = ensurePrivateChild(cacheRoot, '_cacache');
  const second = ensurePrivateChild(first, 'content-v2');
  const third = ensurePrivateChild(second, 'sha512');
  const fourth = ensurePrivateChild(third, digest.slice(0, 2));
  const fifth = ensurePrivateChild(fourth, digest.slice(2, 4));
  return Object.freeze({ path: join(fifth, digest.slice(4)), digest });
}

function readVerifiedArchive(expected) {
  const opened = readLocalBindingBoundedFile(expected.path, {
    maximumBytes: MAX_ARCHIVE_BYTES, minimumBytes: 1, expectedMode: 0o400, expectedUid: 1000,
  });
  try {
    if (createHash('sha512').update(opened.body).digest('hex') !== expected.digest) {
      fail('GENESIS002_LOCAL_BINDING_CACHE_ARCHIVE_INVALID');
    }
    return opened.identity;
  } finally { opened.body.fill(0); }
}

function tarballUrl(package_) {
  const leaf = package_.name.includes('/') ? package_.name.slice(package_.name.lastIndexOf('/') + 1) : package_.name;
  const url = new URL(`${package_.name}/-/${leaf}-${package_.version}.tgz`, 'https://registry.npmjs.org/');
  if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.port) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_URL_INVALID');
  }
  return url;
}

function downloadArchive(url) {
  return downloadLocalPreparationArchive(url, {
    maximumBytes: MAX_ARCHIVE_BYTES,
    deadlineMs: DEADLINE_MS,
    errorCode: 'GENESIS002_LOCAL_BINDING_CACHE_FETCH_REJECTED',
  });
}

function installArchive(expected, body) {
  if (createHash('sha512').update(body).digest('hex') !== expected.digest) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_ARCHIVE_INVALID');
  }
  let descriptor;
  try {
    descriptor = openSync(expected.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o400);
    let offset = 0;
    while (offset < body.length) offset += writeSync(descriptor, body, offset, body.length - offset);
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  fsyncDirectory(dirname(expected.path));
  return readVerifiedArchive(expected);
}

async function runBootstrap() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== NODE_PATH || process.env.NODE_OPTIONS || process.execArgv.length !== 0) {
    fail('GENESIS002_LOCAL_BINDING_CACHE_HOST_INVALID');
  }
  for (const path of [ROOT, join(ROOT, 'toolchain'), dirname(dirname(NODE_PATH)), dirname(NODE_PATH),
    join(ROOT, 'cache')]) privateDirectory(path);
  const nodeIdentity = attestExecutable(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000);
  const gitIdentity = attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0);
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = attestCommittedSource(repositoryRoot, gitIdentity);
  const yaml = attestYaml(repositoryRoot, source);
  const lock = yaml.parse(source.bodies.get('spacetimedb/pnpm-lock.yaml').toString('utf8'));
  const packages = selectPackages(lock);
  const cacheRoot = ensurePrivateChild(join(ROOT, 'cache'), 'genesis002');
  const installed = [];
  for (const package_ of packages) {
    const expected = archiveIdentity(cacheRoot, package_.integrity);
    try {
      readVerifiedArchive(expected);
      continue;
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.cause?.code !== 'ENOENT') throw error;
    }
    const body = await downloadArchive(tarballUrl(package_));
    try {
      installArchive(expected, body);
      installed.push(package_.key);
    } finally { body.fill(0); }
  }
  attestExecutable(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, nodeIdentity);
  attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0, gitIdentity);
  return Object.freeze({ profile: PROFILE, sourceCommit: source.commit, sourceTree: source.tree,
    packageCount: packages.length, installedCount: installed.length });
}

export async function bootstrapGenesis002LocalBindingCache(...arguments_) {
  if (arguments_.length !== 0) fail('GENESIS002_LOCAL_BINDING_CACHE_ARGUMENTS_INVALID');
  try { return await runBootstrap(); } catch (error) {
    if (error instanceof Genesis002LocalBindingCacheError) throw error;
    fail(typeof error?.message === 'string' && /^GENESIS002_LOCAL_BINDING_CACHE_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : 'GENESIS002_LOCAL_BINDING_CACHE_FAILED', error);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('GENESIS002_LOCAL_BINDING_CACHE_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else bootstrapGenesis002LocalBindingCache().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.code ?? 'GENESIS002_LOCAL_BINDING_CACHE_FAILED'}\n`);
    process.exitCode = 1;
  });
}
