import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync,
  readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as vm from 'node:vm';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { bindOperationOwnedCliSnapshot } from './local-binding-runtime-cli-snapshot.mjs';
import { runLocalBindingBoundedProcess } from './local-binding-runtime-process.mjs';

export { runLocalBindingBoundedProcess } from './local-binding-runtime-process.mjs';

const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const WORKER_PROFILE = 'warpkeep-local-binding-worker-v1';
const GENESIS002_WORKER_PROFILE = 'warpkeep-local-binding-genesis002-worker-v1';
const GENESIS001_WORKER_PROFILE = 'warpkeep-local-binding-genesis001-worker-v1';
const GENESIS001_CURRENT_WORKER_PROFILE = 'warpkeep-local-binding-genesis001-current-worker-v1';
const GENESIS001_COMPATIBILITY_WORKER_PROFILE = 'warpkeep-local-binding-genesis001-compatibility-worker-v1';
const WORKER_RESULT_PROFILE = 'warpkeep-local-binding-worker-result-v1';
const GENESIS002_WORKER_RESULT_PROFILE = 'warpkeep-local-binding-genesis002-worker-result-v1';
const GENESIS001_WORKER_RESULT_PROFILE = 'warpkeep-local-binding-genesis001-worker-result-v1';
const GENESIS001_CURRENT_WORKER_RESULT_PROFILE = 'warpkeep-local-binding-genesis001-current-worker-result-v1';
const GENESIS001_COMPATIBILITY_RESULT_PROFILE = 'warpkeep-local-binding-genesis001-compatibility-result-v1';
const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GENESIS001_NODE_PATH = `${ROOT}/toolchain/node-v24.19.0-linux-x64/bin/node`;
const GENESIS001_NODE_BYTES = 125989464;
const GENESIS001_NODE_SHA256 = 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12';
const CLI_PATH = `${ROOT}/toolchain/spacetime-2.6.1/spacetimedb-cli`;
const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_PATH = `${ROOT}/toolchain/spacetime-2.6.1/spacetimedb-standalone`;
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const YAML_ROOT = `${ROOT}/toolchain/yaml-2.9.0/package`;
const CACHE_ROOT = `${ROOT}/cache/ptr`;
const GENESIS002_CACHE_ROOT = `${ROOT}/cache/genesis002`;
const RUNS_ROOT = `${ROOT}/runs`;
const MAX_SOURCE_FILE = 4 * 1024 * 1024;
const MAX_SOURCE_TOTAL = 64 * 1024 * 1024;
const MAX_SOURCE_MODULES = 256;
const MAX_WORKER_REQUEST = 1024 * 1024;
const MAX_WORKER_OUTPUT = 64 * 1024;
const CONTROL_FILES = Object.freeze([
  'scripts/local-binding-bounded-file.mjs',
  'scripts/local-binding-runtime-cli-snapshot.mjs',
  'scripts/local-binding-runtime-process.mjs',
  'scripts/local-binding-runtime.mjs',
  'scripts/local-binding-runtime-core.mjs',
  'scripts/local-binding-runtime-worker.mjs',
  'scripts/local-binding-runtime-worker-request.mjs',
  'scripts/local-binding-native-ts-hooks.mjs',
  'scripts/local-binding-runtime-worker-result.mjs',
  'scripts/genesis001-current-binding-linux-locked-source-build.ts',
  'scripts/bootstrap-genesis002-local-binding-cache.mjs',
  'scripts/local-binding-runtime-yaml-v1.json',
  'scripts/spacetime-binding-tree.mjs',
  'scripts/spacetime-cli-attestation.mjs',
  'scripts/spacetime-additive-migration-proof.mjs',
  'scripts/genesis001-binding-frozen-source.mjs',
  'scripts/genesis001-local-upgrade-proof.mjs',
  'scripts/genesis001-frozen-publisher-core.ts',
]);
const REQUEST_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'repositoryRoot',
  'dependencyCacheRoot', 'materializationRoot', 'nodePath', 'cliPath', 'handoffPath', 'graph', 'yaml',
]);
const { SourceTextModule } = vm;

const PTR_LANE = Object.freeze({
  name: 'ptr', workerProfile: WORKER_PROFILE, resultProfile: WORKER_RESULT_PROFILE,
  graphEntry: 'scripts/ptr-binding-linux-locked-source-build.ts', cacheRoot: CACHE_ROOT,
  bindingPrefix: 'spacetimedb/ptr/generated-bindings/', includePrivate: false,
});
const GENESIS002_LANE = Object.freeze({
  name: 'genesis002', workerProfile: GENESIS002_WORKER_PROFILE,
  resultProfile: GENESIS002_WORKER_RESULT_PROFILE,
  graphEntry: 'scripts/genesis002-binding-linux-locked-source-build.ts',
  cacheRoot: GENESIS002_CACHE_ROOT,
  bindingPrefix: 'scripts/genesis002_module_bindings/', includePrivate: true,
});
const GENESIS001_LANE = Object.freeze({
  name: 'genesis001', workerProfile: GENESIS001_WORKER_PROFILE,
  resultProfile: GENESIS001_WORKER_RESULT_PROFILE,
  graphEntry: 'scripts/genesis001-binding-linux-locked-source-build.ts',
  cacheRoot: GENESIS002_CACHE_ROOT,
  bindingPrefix: '', includePrivate: false,
});
const GENESIS001_CURRENT_LANE = Object.freeze({
  name: 'genesis001-current', workerProfile: GENESIS001_CURRENT_WORKER_PROFILE,
  resultProfile: GENESIS001_CURRENT_WORKER_RESULT_PROFILE,
  graphEntry: 'scripts/genesis001-current-binding-linux-locked-source-build.ts',
  cacheRoot: GENESIS002_CACHE_ROOT,
  bindingPrefix: '', includePrivate: false,
});
const GENESIS001_COMPATIBILITY_LANE = Object.freeze({
  name: 'genesis001-compatibility', workerProfile: GENESIS001_COMPATIBILITY_WORKER_PROFILE,
  resultProfile: GENESIS001_COMPATIBILITY_RESULT_PROFILE,
  graphEntry: 'scripts/genesis001-baseline-binding-linux-locked-source-build.ts',
  cacheRoot: GENESIS002_CACHE_ROOT, bindingPrefix: '', includePrivate: false,
});

function laneForWorkerProfile(profile) {
  if (profile === WORKER_PROFILE) return PTR_LANE;
  if (profile === GENESIS002_WORKER_PROFILE) return GENESIS002_LANE;
  if (profile === GENESIS001_WORKER_PROFILE) return GENESIS001_LANE;
  if (profile === GENESIS001_CURRENT_WORKER_PROFILE) return GENESIS001_CURRENT_LANE;
  if (profile === GENESIS001_COMPATIBILITY_WORKER_PROFILE) return GENESIS001_COMPATIBILITY_LANE;
  fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
}

export class LocalBindingRuntimeCoreError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'LocalBindingRuntimeError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new LocalBindingRuntimeCoreError(code, cause === undefined ? undefined : { cause });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function serializedIdentity(state) {
  return Object.freeze(Object.fromEntries(
    ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, String(state[key])]),
  ));
}

function frame(digest, label, value) {
  for (const item of [label, String(value)]) {
    const body = Buffer.from(item, 'utf8');
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(body.length));
    digest.update(length).update(body);
  }
}

function yamlDigest(record) {
  const digest = createHash('sha256');
  for (const key of ['schemaVersion', 'profile', 'name', 'version', 'sri', 'entry']) {
    frame(digest, key, record[key]);
  }
  for (const entry of record.files) {
    for (const key of ['path', 'mode', 'bytes', 'sha256']) frame(digest, `file.${key}`, entry[key]);
  }
  return digest.digest('hex');
}

function canonicalRelativePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 512
    && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..'
      && !part.startsWith('.') && !/[\u0000-\u001f\u007f]/u.test(part));
}

export function validateLocalBindingYamlManifest(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1024 * 1024) {
    fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID');
  }
  let record;
  try { record = JSON.parse(source); } catch { fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID'); }
  if (!exactKeys(record, ['schemaVersion', 'profile', 'name', 'version', 'sri', 'entry', 'files', 'digest'])
      || record.schemaVersion !== 1 || record.profile !== 'warpkeep-local-binding-yaml-v1'
      || record.name !== 'yaml' || record.version !== '2.9.0'
      || record.sri !== 'sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA=='
      || record.entry !== 'dist/index.js' || !Array.isArray(record.files)
      || record.files.length === 0 || record.files.length > 4096 || !/^[0-9a-f]{64}$/u.test(record.digest)
      || `${JSON.stringify(record, null, 2)}\n` !== source) {
    fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID');
  }
  let previous = '';
  let total = 0;
  const collisions = new Set();
  for (const entry of record.files) {
    if (!exactKeys(entry, ['path', 'mode', 'bytes', 'sha256']) || !canonicalRelativePath(entry.path)
        || entry.path <= previous || ![0o644, 0o755].includes(entry.mode)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 16 * 1024 * 1024
        || !/^[0-9a-f]{64}$/u.test(entry.sha256) || collisions.has(entry.path.toLowerCase())) {
      fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID');
    }
    collisions.add(entry.path.toLowerCase());
    total += entry.bytes;
    if (total > 64 * 1024 * 1024) fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID');
    previous = entry.path;
  }
  if (!record.files.some(entry => entry.path === record.entry) || yamlDigest(record) !== record.digest) {
    fail('LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID');
  }
  return record;
}

function within(root, candidate) {
  const difference = relative(root, candidate);
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function fixedContainedPath(path, prefix) {
  return typeof path === 'string' && isAbsolute(path) && within(prefix, path) && path !== prefix;
}

export function validateLocalBindingRuntimeHost(value) {
  const execArgv = JSON.stringify(value?.execArgv);
  if (value?.platform !== 'linux' || value?.arch !== 'x64' || value?.uid !== 1000
      || value?.execPath !== NODE_PATH || value?.nodeOptions
      || ![JSON.stringify([]), JSON.stringify(['--experimental-vm-modules'])].includes(execArgv)) {
    fail('LOCAL_BINDING_RUNTIME_HOST_INVALID');
  }
}

export function validateLocalBindingWorkerRequest(value) {
  const lane = laneForWorkerProfile(value?.profile);
  const operationRoot = typeof value?.repositoryRoot === 'string' ? dirname(value.repositoryRoot) : '';
  const operationName = operationRoot === '' ? '' : relative(RUNS_ROOT, operationRoot);
  if (!exactKeys(value, REQUEST_KEYS) || value.schemaVersion !== 1
      || !/^[0-9a-f]{32}$/u.test(value.nonce ?? '') || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '')
      || !fixedContainedPath(value.repositoryRoot, RUNS_ROOT)
      || !/^binding-[0-9a-f]{32}$/u.test(operationName)
      || value.dependencyCacheRoot !== lane.cacheRoot || !fixedContainedPath(value.materializationRoot, RUNS_ROOT)
      || value.nodePath !== NODE_PATH || value.cliPath !== join(operationRoot, 'cli', 'spacetimedb-cli')
      || !fixedContainedPath(value.handoffPath, RUNS_ROOT)
      || value.graph?.root !== value.repositoryRoot
      || value.graph?.entry !== lane.graphEntry
      || !Array.isArray(value.graph?.modules) || value.graph.modules.length === 0
      || value.graph.modules.length > MAX_SOURCE_MODULES || value.yaml?.root !== YAML_ROOT
      || value.yaml?.entry !== 'dist/index.js' || !Array.isArray(value.yaml?.files)
      || value.yaml.files.length === 0 || !within(operationRoot, value.materializationRoot)
      || !within(operationRoot, value.handoffPath)) {
    fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  }
  for (const record of value.graph.modules) {
    if (!exactKeys(record, ['path', 'format', 'imports', 'bytes', 'sha256', 'identity'])
        || !canonicalRelativePath(record.path) || !['typescript', 'module'].includes(record.format)
        || !Array.isArray(record.imports) || !Number.isSafeInteger(record.bytes)
        || record.bytes < 0 || record.bytes > MAX_SOURCE_FILE || !/^[0-9a-f]{64}$/u.test(record.sha256 ?? '')
        || !exactKeys(record.identity, ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
        || Object.values(record.identity).some(part => !/^[0-9]+$/u.test(part))) {
      fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
    }
  }
  for (const record of value.yaml.files) {
    if (!exactKeys(record, ['path', 'mode', 'bytes', 'sha256']) || !canonicalRelativePath(record.path)
        || ![0o644, 0o755].includes(record.mode) || !Number.isSafeInteger(record.bytes)
        || record.bytes < 0 || record.bytes > 16 * 1024 * 1024
        || !/^[0-9a-f]{64}$/u.test(record.sha256 ?? '')) fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  }
  return value;
}

export function parseLocalBindingWorkerResult(source, nonce, handoffPath, workerProfile = WORKER_PROFILE) {
  const lane = laneForWorkerProfile(workerProfile);
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_WORKER_OUTPUT || !source.endsWith('\n')) {
    fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { fail('LOCAL_BINDING_WORKER_RESULT_INVALID'); }
  if (workerProfile === GENESIS001_COMPATIBILITY_WORKER_PROFILE) {
    const compatibilityKeys = [
      'schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree',
      'baselineBundleSha256', 'frozenBundleSha256', 'baselineDescriptorSha256',
      'frozenDescriptorSha256', 'checkedFrozenWriters',
    ];
    const writers = [
      'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
      'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
    ];
    if (!exactKeys(value, compatibilityKeys) || `${JSON.stringify(value)}\n` !== source
        || value.schemaVersion !== 1 || value.profile !== lane.resultProfile || value.nonce !== nonce
        || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
        || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '')
        || ['baselineBundleSha256', 'frozenBundleSha256', 'baselineDescriptorSha256', 'frozenDescriptorSha256']
          .some(key => !/^[0-9a-f]{64}$/u.test(value[key] ?? ''))
        || value.baselineBundleSha256 === value.frozenBundleSha256
        || JSON.stringify(value.checkedFrozenWriters) !== JSON.stringify(writers)) {
      fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
    }
    return value;
  }
  const keys = ['schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'moduleTreeId',
    'dependencyClosureDigest', 'bundleSha256', 'bundleBytes', 'handoffPath'];
  if (!exactKeys(value, keys) || `${JSON.stringify(value)}\n` !== source || value.schemaVersion !== 1
      || value.profile !== lane.resultProfile || value.nonce !== nonce
      || value.handoffPath !== handoffPath || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '') || !/^[0-9a-f]{40,64}$/u.test(value.moduleTreeId ?? '')
      || !/^[0-9a-f]{64}$/u.test(value.dependencyClosureDigest ?? '')
      || !/^[0-9a-f]{64}$/u.test(value.bundleSha256 ?? '')
      || !Number.isSafeInteger(value.bundleBytes) || value.bundleBytes < 1 || value.bundleBytes > 32 * 1024 * 1024) {
    fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
  }
  return value;
}

function equalBytes(left, right) {
  return left.byteLength === right.byteLength && Buffer.from(left).equals(Buffer.from(right));
}

export function assertReproducibleLocalBindingCycles(left, right) {
  if (left.sourceCommit !== right.sourceCommit || left.sourceTree !== right.sourceTree
      || left.dependencyClosureDigest !== right.dependencyClosureDigest
      || left.bundleSha256 !== right.bundleSha256 || !equalBytes(left.bundle, right.bundle)
      || !Array.isArray(left.bindings) || left.bindings.length === 0
      || left.bindings.length !== right.bindings?.length) {
    fail('LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED');
  }
  for (let index = 0; index < left.bindings.length; index += 1) {
    const a = left.bindings[index];
    const b = right.bindings[index];
    if (a.path !== b.path || !equalBytes(a.bytes, b.bytes)) {
      fail('LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED');
    }
  }
  return left;
}

function stableFileRecord(
  path, expectedBytes, expectedDigest, expectedOwner, requireExecutable = false, expectedIdentity,
) {
  const maximumBytes = expectedBytes ?? (path === GIT_PATH ? 64 * 1024 * 1024 : MAX_SOURCE_FILE);
  return readLocalBindingBoundedFile(path, {
    maximumBytes,
    expectedBytes,
    expectedSha256: expectedDigest,
    expectedUid: expectedOwner,
    requireExecutable,
    rejectWritableExecutable: requireExecutable,
    discardBody: requireExecutable,
    expectedIdentity,
  });
}

function stableFile(path, expectedBytes, expectedDigest, expectedOwner, requireExecutable = false, expectedIdentity) {
  return stableFileRecord(
    path, expectedBytes, expectedDigest, expectedOwner, requireExecutable, expectedIdentity,
  ).body;
}

function privateDirectory(path) {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
      || (state.mode & 0o777n) !== 0o700n || realpathSync(path) !== path) {
    fail('LOCAL_BINDING_RUNTIME_DIRECTORY_INVALID');
  }
}

function attestGenesis001CompilerNamespace(expected) {
  const versionRoot = dirname(dirname(GENESIS001_NODE_PATH));
  const binRoot = dirname(GENESIS001_NODE_PATH);
  const result = {};
  try {
    for (const [path, children, key] of [
      [versionRoot, ['bin'], 'versionRoot'],
      [binRoot, ['node'], 'binRoot'],
    ]) {
      privateDirectory(path);
      const state = lstatSync(path, { bigint: true });
      if (JSON.stringify(readdirSync(path).sort()) !== JSON.stringify(children)
          || (expected?.[key] !== undefined
            && JSON.stringify(serializedIdentity(state)) !== JSON.stringify(expected[key]))) {
        fail('LOCAL_BINDING_RUNTIME_COMPILER_INVALID');
      }
      result[key] = serializedIdentity(state);
    }
    const nodeState = lstatSync(GENESIS001_NODE_PATH, { bigint: true });
    if (!nodeState.isFile() || nodeState.isSymbolicLink() || nodeState.uid !== 1000n
        || (nodeState.mode & 0o777n) !== 0o500n
        || realpathSync(GENESIS001_NODE_PATH) !== GENESIS001_NODE_PATH) {
      fail('LOCAL_BINDING_RUNTIME_COMPILER_INVALID');
    }
    const node = stableFileRecord(
      GENESIS001_NODE_PATH, GENESIS001_NODE_BYTES, GENESIS001_NODE_SHA256,
      1000, true, expected?.node,
    );
    node.body.fill(0);
    result.node = node.identity;
    return Object.freeze(result);
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_RUNTIME_COMPILER_INVALID') throw error;
    fail(expected === undefined
      ? 'LOCAL_BINDING_RUNTIME_COMPILER_INVALID'
      : 'LOCAL_BINDING_RUNTIME_COMPILER_CHANGED', error);
  }
}

function git(repositoryRoot, environment, gitIdentity, args, maxBuffer = 1024 * 1024) {
  stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
  const result = spawnSync(GIT_PATH, args, {
    cwd: repositoryRoot, env: environment, encoding: 'utf8', shell: false,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer, timeout: 60_000,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    fail('LOCAL_BINDING_RUNTIME_GIT_FAILED', result.error);
  }
  stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
  return result.stdout.trim();
}

function exactGitLine(value) {
  const line = value.endsWith('\n') ? value.slice(0, -1) : value;
  return line.length > 0 && !line.includes('\n') && !line.includes('\r') ? line : undefined;
}

function privateEmptyDirectory(path, expectedIdentity) {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
      || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path
      || readdirSync(path).length !== 0
      || (expectedIdentity !== undefined
        && JSON.stringify(serializedIdentity(state)) !== JSON.stringify(expectedIdentity))) {
    fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
  }
  return serializedIdentity(state);
}

function createGenesis001CurrentFixedGitBoundary(operationRoot, baseEnvironment, expectedGitIdentity) {
  const execRoot = join(operationRoot, 'git-exec');
  const templateRoot = join(operationRoot, 'git-template');
  mkdirSync(execRoot, { mode: 0o700 });
  mkdirSync(templateRoot, { mode: 0o700 });
  const execIdentity = privateEmptyDirectory(execRoot);
  const templateIdentity = privateEmptyDirectory(templateRoot);
  const gitAuthority = stableFileRecord(
    GIT_PATH, undefined, GIT_SHA256, 0, true, expectedGitIdentity,
  );
  gitAuthority.body.fill(0);
  const environment = Object.freeze({
    HOME: baseEnvironment.HOME,
    TMPDIR: baseEnvironment.TMPDIR,
    PATH: `${dirname(NODE_PATH)}:/usr/bin:/bin`,
    LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_EXEC_PATH: execRoot,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    GIT_TEMPLATE_DIR: templateRoot,
    GIT_TERMINAL_PROMPT: '0',
    PAGER: 'cat',
  });
  const prefix = Object.freeze([
    '--no-pager', '--no-optional-locks', '--no-replace-objects',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    '-c', `init.templateDir=${templateRoot}`,
    '-c', 'protocol.allow=never',
    '-c', 'protocol.file.allow=always',
    '-c', 'protocol.ext.allow=never',
    '-c', 'credential.helper=',
  ]);
  const run = (cwd, args, maxBuffer = 1024 * 1024, encoding = 'utf8') => {
    if (!Array.isArray(args) || args.length === 0 || args.length > 128
        || args.some(argument => typeof argument !== 'string' || argument.length === 0
          || argument.length > 4096 || argument.includes('\0'))
        || typeof cwd !== 'string' || !isAbsolute(cwd)) {
      fail('LOCAL_BINDING_RUNTIME_GIT_FAILED');
    }
    privateEmptyDirectory(execRoot, execIdentity);
    privateEmptyDirectory(templateRoot, templateIdentity);
    stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitAuthority.identity).fill(0);
    const result = spawnSync(GIT_PATH, [...prefix, ...args], {
      cwd, env: environment, encoding, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer, timeout: 60_000,
    });
    stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitAuthority.identity).fill(0);
    privateEmptyDirectory(execRoot, execIdentity);
    privateEmptyDirectory(templateRoot, templateIdentity);
    if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
      fail('LOCAL_BINDING_RUNTIME_GIT_FAILED', result.error);
    }
    return result.stdout;
  };
  const boundary = {
    git: (cwd, args, maxBuffer) => String(run(cwd, args, maxBuffer, 'utf8')).trim(),
    read: (cwd, args, maxBuffer) => Buffer.from(run(cwd, args, maxBuffer, 'buffer')),
    chmod: chmodSync,
    prepare: prepareGenesis001CurrentIndependentSnapshotContext,
  };
  boundary.attest = root => attestGenesis001CurrentIndependentSnapshotContext(root, boundary.git);
  return Object.freeze(boundary);
}

function attestGenesis001CurrentIndependentSnapshotContext(root, runGit) {
  const gitRoot = join(root, '.git');
  const excludePath = join(gitRoot, 'info', 'exclude');
  const contextFiles = [join(gitRoot, 'config'), ...(existsSync(excludePath) ? [excludePath] : [])];
  try {
    const rootState = lstatSync(root, { bigint: true });
    const gitState = lstatSync(gitRoot, { bigint: true });
    if (!rootState.isDirectory() || rootState.isSymbolicLink() || rootState.uid !== 1000n
        || (rootState.mode & 0o7777n) !== 0o700n || realpathSync(root) !== root
        || !gitState.isDirectory() || gitState.isSymbolicLink() || gitState.uid !== 1000n
        || (gitState.mode & 0o022n) !== 0n || realpathSync(gitRoot) !== gitRoot) {
      fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
    }
    for (const path of contextFiles) {
      const state = lstatSync(path, { bigint: true });
      if (!state.isFile() || state.isSymbolicLink() || state.uid !== 1000n || state.nlink !== 1n
          || ![0o600n, 0o644n].includes(state.mode & 0o7777n) || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
    }
    for (const path of [join(gitRoot, 'info'), join(gitRoot, 'objects', 'info')]) {
      const state = lstatSync(path, { bigint: true });
      if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
          || (state.mode & 0o022n) !== 0n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
    }
    const hooksRoot = join(gitRoot, 'hooks');
    if (existsSync(hooksRoot)) {
      const state = lstatSync(hooksRoot, { bigint: true });
      if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
          || (state.mode & 0o022n) !== 0n || realpathSync(hooksRoot) !== hooksRoot
          || readdirSync(hooksRoot).length !== 0) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
    }
    for (const path of [
      join(gitRoot, 'config.worktree'), join(gitRoot, 'info', 'grafts'),
      join(gitRoot, 'info', 'attributes'), join(gitRoot, 'objects', 'info', 'alternates'),
      join(gitRoot, 'shallow'),
    ]) if (existsSync(path)) fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID') throw error;
    fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID', error);
  }
  const names = runGit(root, ['config', '--no-includes', '--local', '--null', '--name-only', '--list'])
    .split('\0').filter(Boolean).map(value => value.toLowerCase());
  const allowedName = name => [
    'core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates',
    'core.ignorecase', 'core.precomposeunicode', 'remote.origin.url', 'remote.origin.fetch',
    'extensions.worktreeconfig', 'gpg.format', 'user.signingkey', 'commit.gpgsign',
  ].includes(name) || /^branch\.[a-z0-9._\/-]{1,255}\.(?:remote|merge)$/u.test(name);
  const origin = exactGitLine(runGit(root, [
    'config', '--no-includes', '--local', '--get-all', 'remote.origin.url',
  ]));
  const resolvedOrigin = exactGitLine(runGit(root, ['remote', 'get-url', '--all', 'origin']));
  const fetch = exactGitLine(runGit(root, [
    'config', '--no-includes', '--local', '--get-all', 'remote.origin.fetch',
  ]));
  const repositoryFormat = exactGitLine(runGit(root, [
    'config', '--no-includes', '--local', '--get', 'core.repositoryformatversion',
  ]));
  const fileMode = exactGitLine(runGit(root, [
    'config', '--no-includes', '--local', '--get', 'core.filemode',
  ]));
  const bare = exactGitLine(runGit(root, [
    'config', '--no-includes', '--local', '--get', 'core.bare',
  ]));
  const topLevel = exactGitLine(runGit(root, ['rev-parse', '--show-toplevel']));
  const gitDirectory = exactGitLine(runGit(root, ['rev-parse', '--path-format=absolute', '--git-dir']));
  const commonDirectory = exactGitLine(runGit(root, [
    'rev-parse', '--path-format=absolute', '--git-common-dir',
  ]));
  if (names.some(name => !allowedName(name)) || names.includes('extensions.worktreeconfig')
      || repositoryFormat !== '0' || fileMode !== 'true' || bare !== 'false'
      || topLevel !== root || gitDirectory !== gitRoot || commonDirectory !== gitRoot
      || origin !== CANONICAL_ORIGIN_URL || resolvedOrigin !== CANONICAL_ORIGIN_URL
      || fetch !== '+refs/heads/*:refs/remotes/origin/*') {
    fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
  }
}

function prepareGenesis001CurrentIndependentSnapshotContext(root) {
  const gitRoot = join(root, '.git');
  try {
    for (const path of [root, gitRoot, join(gitRoot, 'objects')]) {
      const state = lstatSync(path, { bigint: true });
      if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
          || (state.mode & 0o022n) !== 0n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
    }
    for (const path of [join(gitRoot, 'info'), join(gitRoot, 'objects', 'info')]) {
      if (!existsSync(path)) mkdirSync(path, { recursive: false, mode: 0o700 });
      const before = lstatSync(path, { bigint: true });
      if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== 1000n
          || (before.mode & 0o022n) !== 0n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
      chmodSync(path, 0o700);
      const after = lstatSync(path, { bigint: true });
      if (!after.isDirectory() || after.isSymbolicLink() || after.uid !== 1000n
          || (after.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID');
      }
    }
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID') throw error;
    fail('LOCAL_BINDING_RUNTIME_GIT_CONTEXT_INVALID', error);
  }
}

function initializeGenesis001CurrentIndependentSnapshot(input, boundary) {
  boundary.git(input.repositoryRoot, [
    'clone', '--local', '--no-hardlinks', '--no-checkout', '--no-tags', '--',
    input.repositoryRoot, input.root,
  ], 4 * 1024 * 1024);
  boundary.chmod(input.root, 0o700);
  boundary.prepare?.(input.root);
  boundary.git(input.root, [
    'config', '--no-includes', '--local', '--unset-all', 'remote.origin.tagOpt',
  ]);
  boundary.git(input.root, [
    'config', '--no-includes', '--local', '--replace-all',
    'remote.origin.url', CANONICAL_ORIGIN_URL,
  ]);
  boundary.attest(input.root);
  boundary.git(input.root, ['checkout', '--detach', '--force', input.commit], 4 * 1024 * 1024);
  const commit = boundary.git(input.root, ['rev-parse', '--verify', 'HEAD']);
  const tree = boundary.git(input.root, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if (commit !== input.commit || tree !== input.tree) fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
  boundary.attest(input.root);
  return Object.freeze({ root: input.root, commit, tree, kind: 'independent-clone' });
}

export const localBindingRuntimeTestSeams = Object.freeze({
  createGenesis001CurrentFixedGitBoundary,
  initializeGenesis001CurrentIndependentSnapshot,
});

function resolveGraphTarget(root, parentPath, specifier) {
  if (!specifier.startsWith('.')) fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
  const base = resolve(root, dirname(parentPath), specifier);
  const candidates = [base, `${base}.ts`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.mjs')]
    .filter(candidate => {
      try { return lstatSync(candidate).isFile(); } catch { return false; }
    });
  if (candidates.length !== 1 || !within(root, candidates[0])) fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
  return relative(root, candidates[0]).split(sep).join('/');
}

function deriveFixedEntrySourceGraph(root, entry) {
  if (typeof SourceTextModule !== 'function') {
    if (!fixedContainedPath(root, RUNS_ROOT) || basename(root) !== 'source') {
      fail('LOCAL_BINDING_RUNTIME_VM_MODULES_REQUIRED');
    }
    const operationRoot = dirname(root);
    const functionName = entry === PTR_LANE.graphEntry ? 'deriveLocalBindingSourceGraph'
      : entry === GENESIS002_LANE.graphEntry ? 'deriveGenesis002LocalBindingSourceGraph'
        : entry === GENESIS001_LANE.graphEntry ? 'deriveGenesis001LocalBindingSourceGraph'
          : entry === GENESIS001_CURRENT_LANE.graphEntry ? 'deriveGenesis001CurrentLocalBindingSourceGraph'
          : entry === GENESIS001_COMPATIBILITY_LANE.graphEntry
            ? 'deriveGenesis001CompatibilitySourceGraph'
            : fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    const moduleUrl = pathToFileURL(join(root, 'scripts', 'local-binding-runtime-core.mjs')).href;
    const script = `import { ${functionName} } from ${JSON.stringify(moduleUrl)};process.stdout.write(JSON.stringify(${functionName}(${JSON.stringify(root)})));`;
    const node = stableFileRecord(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true);
    node.body.fill(0);
    const child = spawnSync(NODE_PATH, [
      '--no-warnings', '--experimental-vm-modules', '--input-type=module', '--eval', script,
    ], {
      cwd: root,
      env: {
        HOME: join(operationRoot, 'home'), TMPDIR: join(operationRoot, 'tmp'),
        PATH: dirname(NODE_PATH), LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
      },
      encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_SOURCE_TOTAL, timeout: 60_000,
    });
    stableFile(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true, node.identity).fill(0);
    if (child.status !== 0 || child.signal !== null || child.error !== undefined
        || child.stderr !== '' || typeof child.stdout !== 'string') {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID', child.error);
    }
    let graph;
    try { graph = JSON.parse(child.stdout); } catch (error) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID', error);
    }
    if (graph?.root !== root || graph?.entry !== entry || !Array.isArray(graph?.modules)) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    }
    return Object.freeze({
      root: graph.root, entry: graph.entry,
      modules: Object.freeze(graph.modules.map(record => Object.freeze(record))),
    });
  }
  const pending = [entry];
  const records = new Map();
  let total = 0;
  while (pending.length > 0) {
    const path = pending.shift();
    if (records.has(path)) continue;
    if (!canonicalRelativePath(path) || records.size >= MAX_SOURCE_MODULES) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    }
    const format = path.endsWith('.ts') ? 'typescript' : path.endsWith('.mjs') ? 'module' : undefined;
    if (format === undefined) fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    const absolute = resolve(root, ...path.split('/'));
    const beforeIdentity = lstatSync(absolute, { bigint: true });
    const body = stableFile(absolute, undefined, undefined, undefined, false);
    const afterIdentity = lstatSync(absolute, { bigint: true });
    if (JSON.stringify(serializedIdentity(beforeIdentity)) !== JSON.stringify(serializedIdentity(afterIdentity))) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    }
    if (body.length > MAX_SOURCE_FILE) fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    total += body.length;
    if (total > MAX_SOURCE_TOTAL) fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    const source = body.toString('utf8');
    if (/sourceMappingURL/u.test(source)) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID');
    }
    let parsed;
    try {
      parsed = new SourceTextModule(format === 'typescript'
        ? stripTypeScriptTypes(source, { mode: 'transform', sourceMap: false }) : source,
      { identifier: `warpkeep-source:${path}` });
    } catch (error) { fail('LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID', error); }
    const imports = [];
    const seen = new Set();
    for (const request of parsed.moduleRequests) {
      const specifier = request.specifier;
      if (seen.has(specifier)) continue;
      seen.add(specifier);
      if (specifier.startsWith('node:')) imports.push({ specifier, builtin: true });
      else if (specifier === 'yaml') imports.push({ specifier, yaml: true });
      else {
        const target = resolveGraphTarget(root, path, specifier);
        imports.push({ specifier, target });
        pending.push(target);
      }
    }
    imports.sort((a, b) => a.specifier.localeCompare(b.specifier));
    records.set(path, {
      path, format, imports, bytes: body.length, sha256: sha256(body),
      identity: serializedIdentity(afterIdentity),
    });
  }
  return Object.freeze({ root, entry, modules: [...records.values()].sort((a, b) => a.path.localeCompare(b.path)) });
}

export function deriveLocalBindingSourceGraph(root) {
  return deriveFixedEntrySourceGraph(root, PTR_LANE.graphEntry);
}

export function deriveGenesis002LocalBindingSourceGraph(root) {
  return deriveFixedEntrySourceGraph(root, GENESIS002_LANE.graphEntry);
}

export function deriveGenesis001LocalBindingSourceGraph(root) {
  return deriveFixedEntrySourceGraph(root, GENESIS001_LANE.graphEntry);
}

export function deriveGenesis001CurrentLocalBindingSourceGraph(root) {
  return deriveFixedEntrySourceGraph(root, GENESIS001_CURRENT_LANE.graphEntry);
}

export function deriveGenesis001CompatibilitySourceGraph(root) {
  return deriveFixedEntrySourceGraph(root, GENESIS001_COMPATIBILITY_LANE.graphEntry);
}

function attestYaml(manifest) {
  privateDirectory(YAML_ROOT);
  const expected = new Map(manifest.files.map(entry => [entry.path, entry]));
  const expectedDirectories = new Set(['']);
  for (const path of expected.keys()) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      expectedDirectories.add(parts.slice(0, index).join('/'));
    }
  }
  const actual = new Set();
  function visit(directory, segments) {
    privateDirectory(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = [...segments, entry.name].join('/');
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(path)) fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
        visit(absolute, [...segments, entry.name]);
      }
      else if (entry.isFile()) {
        const authority = expected.get(path);
        if (authority === undefined) fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
        stableFile(absolute, authority.bytes, authority.sha256);
        if ((Number(lstatSync(absolute, { bigint: true }).mode) & 0o777) !== authority.mode) {
          fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
        }
        actual.add(path);
      } else fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
    }
  }
  visit(YAML_ROOT, []);
  if (actual.size !== expected.size) fail('LOCAL_BINDING_RUNTIME_YAML_NAMESPACE_INVALID');
  return Object.freeze({ root: YAML_ROOT, entry: manifest.entry, files: manifest.files });
}

const GENESIS001_CURRENT_BINDING_PREFIX = 'src/spacetime/module_bindings/';
const MAX_BINDING_FILE_COUNT = 4096;
const MAX_BINDING_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BINDING_TOTAL_BYTES = 32 * 1024 * 1024;

function gitBuffer(repositoryRoot, environment, gitIdentity, args, maxBuffer) {
  stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
  const result = spawnSync(GIT_PATH, args, {
    cwd: repositoryRoot, env: environment, encoding: null, shell: false,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer, timeout: 60_000,
  });
  stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
  if (result.status !== 0 || result.signal !== null || result.error !== undefined
      || !Buffer.from(result.stderr).equals(Buffer.alloc(0))) {
    fail('LOCAL_BINDING_RUNTIME_GIT_FAILED', result.error);
  }
  return Buffer.from(result.stdout);
}

function canonicalBindingPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512 || !path.endsWith('.ts')) return false;
  const parts = path.split('/');
  return parts.length <= 16 && parts.every(part => part.length > 0 && part !== '.' && part !== '..'
    && !part.startsWith('.') && !/[\\:\u0000-\u001f\u007f]/u.test(part) && !/[. ]$/u.test(part));
}

export function parseGenesis001CurrentCommittedBindingListing(listing) {
  if (!Buffer.isBuffer(listing) || listing.length === 0 || listing.length > 4 * 1024 * 1024
      || listing.at(-1) !== 0) fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
  const records = listing.subarray(0, listing.length === 0 ? 0 : listing.length - 1).toString('utf8').split('\0');
  if (records.length > MAX_BINDING_FILE_COUNT) fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
  const descriptors = [];
  const namespace = new Map();
  let totalBytes = 0;
  for (const record of records) {
    const match = /^(100644) (blob) ([0-9a-f]{40,64}) +([0-9]+)\t(.+)$/u.exec(record);
    if (match === null || !match[5].startsWith(GENESIS001_CURRENT_BINDING_PREFIX)) {
      fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
    }
    const path = match[5].slice(GENESIS001_CURRENT_BINDING_PREFIX.length);
    const size = Number(match[4]);
    if (!canonicalBindingPath(path) || !Number.isSafeInteger(size) || size < 0 || size > MAX_BINDING_FILE_BYTES) {
      fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
    }
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const member = parts.slice(0, index).join('/');
      const collision = namespace.get(member.toLowerCase());
      if (collision !== undefined && collision !== member) fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
      namespace.set(member.toLowerCase(), member);
    }
    totalBytes += size;
    if (totalBytes > MAX_BINDING_TOTAL_BYTES) fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
    descriptors.push(Object.freeze({ object: match[3], path, sourcePath: match[5], size }));
  }
  if (!descriptors.some(entry => entry.path === 'index.ts')) {
    fail('LOCAL_BINDING_RUNTIME_EXPECTED_BINDINGS_INVALID');
  }
  return Object.freeze(descriptors.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function readCommittedGenesis001CurrentBindings(source, environment, gitIdentity) {
  const readGit = source.gitBuffer === undefined
    ? (cwd, args, maxBuffer) => gitBuffer(cwd, environment, gitIdentity, args, maxBuffer)
    : source.gitBuffer;
  const listing = readGit(source.root, [
    'ls-tree', '--full-tree', '-r', '-z', '-l', source.commit, '--', GENESIS001_CURRENT_BINDING_PREFIX,
  ], 4 * 1024 * 1024);
  const descriptors = parseGenesis001CurrentCommittedBindingListing(listing);
  const entries = [];
  for (const descriptor of descriptors) {
    const bytes = readGit(source.root, [
      'show', `${source.commit}:${descriptor.sourcePath}`,
    ], MAX_BINDING_FILE_BYTES + 1);
    if (bytes.length !== descriptor.size) fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    entries.push(Object.freeze({ path: descriptor.path, bytes: new Uint8Array(bytes) }));
  }
  return Object.freeze(entries);
}

function writeGenesis001CurrentBindingMismatch(operationRoot, source, expectedEntries, actualEntries) {
  const expected = new Map(expectedEntries.map(entry => [entry.path, entry.bytes]));
  const actual = new Map(actualEntries.map(entry => [entry.path, entry.bytes]));
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  const mismatches = paths.filter(path => {
    const left = expected.get(path);
    const right = actual.get(path);
    return left === undefined || right === undefined || !equalBytes(left, right);
  }).map(path => {
    const left = expected.get(path);
    const right = actual.get(path);
    return Object.freeze({
      path: `${GENESIS001_CURRENT_BINDING_PREFIX}${path}`,
      expectedBytes: left?.byteLength ?? null,
      expectedSha256: left === undefined ? null : sha256(left),
      generatedBytes: right?.byteLength ?? null,
      generatedSha256: right === undefined ? null : sha256(right),
    });
  });
  const root = join(operationRoot, 'diagnostics');
  mkdirSync(root, { mode: 0o700 });
  writeFileSync(join(root, 'genesis001-current-binding-mismatch-v1.json'), `${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-local-binding-genesis001-current-binding-mismatch-v1',
    sourceCommit: source.commit,
    sourceTree: source.tree,
    mismatches,
  })}\n`, { flag: 'wx', mode: 0o600 });
}

function cleanEnvironment(operationRoot) {
  const home = join(operationRoot, 'home');
  const temporary = join(operationRoot, 'tmp');
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(temporary, { mode: 0o700 });
  return Object.freeze({
    HOME: home, TMPDIR: temporary, PATH: `${dirname(NODE_PATH)}:/usr/bin:/bin`,
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
  });
}

function snapshotCommittedSource(repositoryRoot, operationRoot, environment, gitIdentity, independentCurrent = false) {
  const currentBoundary = independentCurrent
    ? createGenesis001CurrentFixedGitBoundary(operationRoot, environment, gitIdentity)
    : undefined;
  const runGit = currentBoundary?.git
    ?? ((cwd, args, maxBuffer) => git(cwd, environment, gitIdentity, args, maxBuffer));
  const commit = runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  const tree = runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^[0-9a-f]{40}$/u.test(tree)) fail('LOCAL_BINDING_RUNTIME_GIT_FAILED');
  const committedControls = new Map();
  for (const path of CONTROL_FILES) {
    let expected;
    if (currentBoundary !== undefined) {
      expected = currentBoundary.read(repositoryRoot, ['show', `${commit}:${path}`], 5 * 1024 * 1024);
    } else {
      stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
      const committed = spawnSync(GIT_PATH, ['show', `${commit}:${path}`], {
        cwd: repositoryRoot, env: environment, encoding: null, stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 5 * 1024 * 1024, timeout: 60_000,
      });
      stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
      if (committed.status !== 0 || committed.signal !== null || committed.error !== undefined) {
        fail('LOCAL_BINDING_RUNTIME_GIT_FAILED', committed.error);
      }
      expected = Buffer.from(committed.stdout);
    }
    if (!expected.equals(stableFile(
      join(repositoryRoot, ...path.split('/')), expected.length, sha256(expected), undefined, false,
    ))) {
      fail('LOCAL_BINDING_RUNTIME_CONTROL_SOURCE_CHANGED');
    }
    committedControls.set(path, expected);
  }
  const root = join(operationRoot, 'source');
  const source = independentCurrent
    ? initializeGenesis001CurrentIndependentSnapshot(
      { repositoryRoot, root, commit, tree }, currentBoundary,
    )
    : (() => {
      git(repositoryRoot, environment, gitIdentity, [
        'worktree', 'add', '--detach', root, commit,
      ], 4 * 1024 * 1024);
      chmodSync(root, 0o700);
      if (git(root, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD']) !== commit
          || git(root, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD^{tree}']) !== tree) {
        fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
      }
      return Object.freeze({ root, commit, tree, kind: 'linked-worktree' });
    })();
  const bootstrap = Object.freeze([...committedControls].map(([path, expected]) => {
    const absolute = join(root, ...path.split('/'));
    const bytes = expected.length;
    const digest = sha256(expected);
    const opened = readLocalBindingBoundedFile(absolute, {
      maximumBytes: Math.max(bytes, 1),
      expectedBytes: bytes,
      expectedSha256: digest,
      expectedUid: 1000,
    });
    expected.fill(0);
    opened.body.fill(0);
    return Object.freeze({ path, bytes, sha256: digest, identity: opened.identity });
  }));
  return {
    ...source, bootstrap,
    ...(currentBoundary === undefined ? {} : {
      git: currentBoundary.git,
      gitBuffer: currentBoundary.read,
    }),
  };
}

export function verifyLocalBindingBootstrapSource(source) {
  for (const record of source.bootstrap) {
    readLocalBindingBoundedFile(join(source.root, ...record.path.split('/')), {
      maximumBytes: Math.max(record.bytes, 1), expectedBytes: record.bytes,
      expectedSha256: record.sha256, expectedUid: 1000, expectedIdentity: record.identity,
    }).body.fill(0);
  }
}

function readHandoff(path, result) {
  const body = readLocalBindingBoundedFile(path, {
    maximumBytes: 32 * 1024 * 1024,
    minimumBytes: 1,
    expectedBytes: result.bundleBytes,
    expectedSha256: result.bundleSha256,
    expectedUid: 1000,
  }).body;
  return new Uint8Array(body);
}

function removeAcceptedGenesis001CompatibilityProof(operationRoot) {
  const proofRoot = join(operationRoot, 'proof');
  privateDirectory(proofRoot);
  rmSync(proofRoot, { recursive: true, force: false });
}

async function executeCycle(context, lane, index) {
  const cycleRoot = join(context.laneRoot ?? context.operationRoot, `cycle-${index}`);
  mkdirSync(cycleRoot, { mode: 0o700 });
  const handoffRoot = join(cycleRoot, 'handoff');
  const buildRoot = join(cycleRoot, 'builds');
  const generatedRoot = join(cycleRoot, 'generated');
  for (const path of [handoffRoot, buildRoot, generatedRoot]) mkdirSync(path, { mode: 0o700 });
  const handoffPath = join(handoffRoot, 'bundle.js');
  const nonce = randomBytes(16).toString('hex');
  const request = validateLocalBindingWorkerRequest({
    schemaVersion: 1, profile: lane.workerProfile, nonce,
    sourceCommit: context.source.commit, sourceTree: context.source.tree,
    repositoryRoot: context.source.root, dependencyCacheRoot: lane.cacheRoot,
    materializationRoot: buildRoot, nodePath: NODE_PATH, cliPath: context.cli.path,
    handoffPath, graph: context.graph, yaml: context.yaml,
  });
  const encoded = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(encoded) > MAX_WORKER_REQUEST) fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  context.verifyExecutables();
  verifyLocalBindingBootstrapSource(context.source);
  const worker = await runLocalBindingBoundedProcess(NODE_PATH, ['--experimental-vm-modules', join(context.source.root, 'scripts', 'local-binding-runtime-worker.mjs')], {
    cwd: context.repositoryRoot, env: context.environment, fd3: encoded,
    timeout: 15 * 60_000, maxOutput: MAX_WORKER_OUTPUT,
    ...(lane === GENESIS001_COMPATIBILITY_LANE ? { containProcessGroup: true } : {}),
  });
  verifyLocalBindingBootstrapSource(context.source);
  const result = parseLocalBindingWorkerResult(worker.stdout, nonce, handoffPath, lane.workerProfile);
  if (result.sourceCommit !== context.source.commit || result.sourceTree !== context.source.tree) {
    fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
  }
  if (lane === GENESIS001_COMPATIBILITY_LANE) {
    context.verifyExecutables();
    const accepted = Object.freeze({
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      baselineBundleSha256: result.baselineBundleSha256,
      frozenBundleSha256: result.frozenBundleSha256,
      baselineDescriptorSha256: result.baselineDescriptorSha256,
      frozenDescriptorSha256: result.frozenDescriptorSha256,
      checkedFrozenWriters: Object.freeze([...result.checkedFrozenWriters]),
    });
    removeAcceptedGenesis001CompatibilityProof(context.operationRoot);
    return accepted;
  }
  const bundle = readHandoff(handoffPath, result);
  context.verifyExecutables();
  const generateArgs = [
    'generate', '--lang', 'typescript', '--yes', '--no-config', '--js-path', handoffPath,
    '--out-dir', generatedRoot,
    ...(lane.includePrivate ? ['--include-private'] : []),
  ];
  await runLocalBindingBoundedProcess(context.cli.path, generateArgs,
    { cwd: cycleRoot, env: context.environment, timeout: 5 * 60_000, maxOutput: 4 * 1024 * 1024 });
  context.verifyExecutables();
  const bindings = (await context.readBindingTree(generatedRoot)).map(entry => ({
    path: `${lane.bindingPrefix}${entry.path}`,
    bytes: new Uint8Array(entry.bytes),
  }));
  return Object.freeze({
    sourceCommit: result.sourceCommit, sourceTree: result.sourceTree,
    dependencyClosureDigest: result.dependencyClosureDigest,
    bundleSha256: result.bundleSha256, bundle, bindings,
  });
}

export async function executeFixedLocalBindingParentCycles(context) {
  const first = await executeCycle(context, PTR_LANE, 1);
  const second = await executeCycle(context, PTR_LANE, 2);
  return assertReproducibleLocalBindingCycles(first, second);
}

export async function executeFixedGenesis001LocalBindingParentCycles(context) {
  const first = await executeCycle(context, GENESIS001_LANE, 1);
  const second = await executeCycle(context, GENESIS001_LANE, 2);
  return assertReproducibleLocalBindingCycles(first, second);
}

function sortedBindingEntries(entries) {
  return [...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function sameBindingEntries(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) return false;
  const expected = sortedBindingEntries(left);
  const actual = sortedBindingEntries(right);
  return expected.every((entry, index) => entry.path === actual[index]?.path
    && equalBytes(entry.bytes, actual[index].bytes));
}

export async function executeFixedGenesis001CurrentBindingParentCycles(context) {
  const expectedBefore = await context.readCommittedBindings();
  const first = await executeCycle(context, GENESIS001_CURRENT_LANE, 1);
  const second = await executeCycle(context, GENESIS001_CURRENT_LANE, 2);
  const reproducible = assertReproducibleLocalBindingCycles(first, second);
  const expectedAfter = await context.readCommittedBindings();
  if (!sameBindingEntries(expectedBefore, expectedAfter)) fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
  if (!sameBindingEntries(expectedBefore, reproducible.bindings)) {
    context.recordBindingMismatch?.(expectedBefore, reproducible.bindings);
    fail('LOCAL_BINDING_RUNTIME_CURRENT_BINDINGS_MISMATCH');
  }
  return Object.freeze({ ...reproducible, bindingFileCount: expectedBefore.length });
}

export async function executeFixedGenesis001CompatibilityParent(context) {
  const cycle = await executeCycle(context, GENESIS001_COMPATIBILITY_LANE, 1);
  return cycle;
}

export async function executeFixedPairedLocalBindingParentCycles(context) {
  const laneContexts = {};
  for (const lane of [GENESIS002_LANE, PTR_LANE]) {
    const laneRoot = join(context.operationRoot, lane.name);
    mkdirSync(laneRoot, { mode: 0o700 });
    laneContexts[lane.name] = { ...context, laneRoot, graph: context.graphs[lane.name] };
  }
  const genesis002 = assertReproducibleLocalBindingCycles(
    await executeCycle(laneContexts.genesis002, GENESIS002_LANE, 1),
    await executeCycle(laneContexts.genesis002, GENESIS002_LANE, 2),
  );
  const ptr = assertReproducibleLocalBindingCycles(
    await executeCycle(laneContexts.ptr, PTR_LANE, 1),
    await executeCycle(laneContexts.ptr, PTR_LANE, 2),
  );
  if (genesis002.sourceCommit !== context.source.commit || ptr.sourceCommit !== context.source.commit
      || genesis002.sourceTree !== context.source.tree || ptr.sourceTree !== context.source.tree) {
    fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
  }
  return Object.freeze({ genesis002, ptr });
}

export function preserveLocalBindingRuntimePrimaryAndCleanup(primaryError, cleanupError) {
  if (primaryError === undefined && cleanupError === undefined) return;
  if (primaryError !== undefined && cleanupError === undefined) throw primaryError;
  throw new AggregateError([primaryError, cleanupError].filter(error => error !== undefined), 'LOCAL_BINDING_RUNTIME_FAILED', {
    cause: primaryError,
  });
}

async function deriveLocalBindingRuntime(mode) {
  const paired = mode === 'paired';
  const genesis001 = mode === 'genesis001';
  const genesis001Compatibility = mode === 'genesis001-compatibility';
  const genesis001Current = mode === 'genesis001-current';
  const needsGenesis001 = genesis001 || genesis001Compatibility;
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  validateLocalBindingRuntimeHost({
    platform: process.platform,
    arch: process.arch,
    uid: process.getuid?.(),
    execPath: process.execPath,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS,
  });
  for (const path of [
    ROOT, join(ROOT, 'toolchain'), dirname(dirname(NODE_PATH)), dirname(NODE_PATH),
    dirname(CLI_PATH), join(ROOT, 'cache'), CACHE_ROOT,
    ...((paired || needsGenesis001 || genesis001Current) ? [GENESIS002_CACHE_ROOT] : []), RUNS_ROOT,
    ...(needsGenesis001 ? [dirname(dirname(GENESIS001_NODE_PATH)), dirname(GENESIS001_NODE_PATH)] : []),
  ]) privateDirectory(path);
  const nodeAuthority = stableFileRecord(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true);
  nodeAuthority.body.fill(0);
  stableFile(CLI_PATH, CLI_BYTES, CLI_SHA256, 1000, true).fill(0);
  stableFile(STANDALONE_PATH, STANDALONE_BYTES, STANDALONE_SHA256, 1000, true).fill(0);
  const gitAuthority = stableFileRecord(GIT_PATH, undefined, GIT_SHA256, 0, true);
  gitAuthority.body.fill(0);
  const version = spawnSync(NODE_PATH, ['--version'], { encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 });
  stableFile(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true, nodeAuthority.identity).fill(0);
  if (version.status !== 0 || version.stdout.trim() !== 'v22.22.3') fail('LOCAL_BINDING_RUNTIME_NODE_INVALID');
  const genesis001NodeAuthority = needsGenesis001 ? attestGenesis001CompilerNamespace() : undefined;

  const operationRoot = join(RUNS_ROOT, `binding-${randomUUID().replaceAll('-', '')}`);
  mkdirSync(operationRoot, { mode: 0o700 });
  const environment = cleanEnvironment(operationRoot);
  if (genesis001NodeAuthority !== undefined) {
    const compilerEnvironment = Object.freeze({
      ...environment, PATH: dirname(GENESIS001_NODE_PATH),
    });
    const compilerVersion = spawnSync(GENESIS001_NODE_PATH, ['--version'], {
      cwd: operationRoot, env: compilerEnvironment, encoding: 'utf8', shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 64 * 1024,
    });
    attestGenesis001CompilerNamespace(genesis001NodeAuthority);
    if (compilerVersion.status !== 0 || compilerVersion.signal !== null
        || compilerVersion.error !== undefined || compilerVersion.stdout !== 'v24.19.0\n'
        || compilerVersion.stderr !== '') {
      fail('LOCAL_BINDING_RUNTIME_COMPILER_INVALID', compilerVersion.error);
    }
  }
  let source;
  let cli;
  let cliSource;
  let complete = false;
  let finalResult;
  let primaryError;
  try {
    source = snapshotCommittedSource(
      repositoryRoot, operationRoot, environment, gitAuthority.identity, genesis001Current,
    );
    const graph = genesis001Compatibility
      ? deriveGenesis001CompatibilitySourceGraph(source.root)
      : genesis001Current ? deriveGenesis001CurrentLocalBindingSourceGraph(source.root)
      : genesis001 ? deriveGenesis001LocalBindingSourceGraph(source.root)
        : deriveLocalBindingSourceGraph(source.root);
    const graphs = paired ? Object.freeze({
      genesis002: deriveGenesis002LocalBindingSourceGraph(source.root),
      ptr: graph,
    }) : undefined;
    const manifestPath = join(source.root, 'scripts', 'local-binding-runtime-yaml-v1.json');
    const manifestSource = stableFile(manifestPath).toString('utf8');
    const manifest = validateLocalBindingYamlManifest(manifestSource);
    const yaml = attestYaml(manifest);
    verifyLocalBindingBootstrapSource(source);
    const { attestPinnedSpacetimeCli } = await import(pathToFileURL(
      join(source.root, 'scripts', 'spacetime-cli-attestation.mjs'),
    ).href);
    verifyLocalBindingBootstrapSource(source);
    cliSource = attestPinnedSpacetimeCli(CLI_PATH, spawnSync, environment);
    cli = bindOperationOwnedCliSnapshot(cliSource, operationRoot);
    verifyLocalBindingBootstrapSource(source);
    const { readSpacetimeBindingTree } = await import(pathToFileURL(
      join(source.root, 'scripts', 'spacetime-binding-tree.mjs'),
    ).href);
    verifyLocalBindingBootstrapSource(source);
    const verifyExecutables = () => {
      stableFile(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true, nodeAuthority.identity).fill(0);
      if (genesis001NodeAuthority !== undefined) {
        attestGenesis001CompilerNamespace(genesis001NodeAuthority);
      }
      stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitAuthority.identity).fill(0);
      cli.verify();
    };
    const readCommittedBindings = () => readCommittedGenesis001CurrentBindings(
      source, environment, gitAuthority.identity,
    );
    const recordBindingMismatch = (expected, actual) => writeGenesis001CurrentBindingMismatch(
      operationRoot, source, expected, actual,
    );
    const context = {
      repositoryRoot, operationRoot, environment, source, graph, graphs, yaml, cli,
      readBindingTree: readSpacetimeBindingTree, readCommittedBindings,
      recordBindingMismatch, verifyExecutables,
    };
    const selected = paired
      ? await executeFixedPairedLocalBindingParentCycles(context)
      : genesis001Compatibility
        ? await executeFixedGenesis001CompatibilityParent(context)
        : genesis001Current ? await executeFixedGenesis001CurrentBindingParentCycles(context)
        : genesis001 ? await executeFixedGenesis001LocalBindingParentCycles(context)
          : await executeFixedLocalBindingParentCycles(context);
    cli.verify();
    const verifySourceGit = source.git
      ?? ((cwd, args) => git(cwd, environment, gitAuthority.identity, args));
    if (verifySourceGit(source.root, ['rev-parse', '--verify', 'HEAD']) !== source.commit
        || verifySourceGit(source.root, ['rev-parse', '--verify', 'HEAD^{tree}']) !== source.tree) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    }
    complete = true;
    const copyLane = lane => Object.freeze({
      bundleSha256: lane.bundleSha256,
      dependencyClosureDigest: lane.dependencyClosureDigest,
      bindings: Object.freeze(lane.bindings.map(entry => Object.freeze({
        path: entry.path, bytes: new Uint8Array(entry.bytes),
      }))),
    });
    finalResult = paired ? Object.freeze({
      profile: PROFILE, sourceCommit: source.commit, sourceTree: source.tree,
      genesis002: copyLane(selected.genesis002), ptr: copyLane(selected.ptr),
    }) : genesis001Compatibility ? Object.freeze({
      profile: PROFILE, sourceCommit: selected.sourceCommit, sourceTree: selected.sourceTree,
      baselineBundleSha256: selected.baselineBundleSha256,
      frozenBundleSha256: selected.frozenBundleSha256,
      baselineDescriptorSha256: selected.baselineDescriptorSha256,
      frozenDescriptorSha256: selected.frozenDescriptorSha256,
      checkedFrozenWriters: Object.freeze([...selected.checkedFrozenWriters]),
    }) : genesis001Current ? Object.freeze({
      profile: PROFILE, sourceCommit: selected.sourceCommit, sourceTree: selected.sourceTree,
      bundleSha256: selected.bundleSha256,
      dependencyClosureDigest: selected.dependencyClosureDigest,
      bindingFileCount: selected.bindingFileCount,
    }) : genesis001 ? Object.freeze({
      profile: PROFILE, sourceCommit: selected.sourceCommit, sourceTree: selected.sourceTree,
      bundleSha256: selected.bundleSha256,
      dependencyClosureDigest: selected.dependencyClosureDigest,
      diagnosticBindings: Object.freeze(selected.bindings.map(entry => Object.freeze({
        path: entry.path, bytes: new Uint8Array(entry.bytes),
      }))),
    }) : Object.freeze({
      profile: PROFILE, sourceCommit: selected.sourceCommit, sourceTree: selected.sourceTree,
      ...copyLane(selected),
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try { cliSource?.cleanup(); } catch (error) { cleanupError = error; }
  if (complete) {
    try {
      if (source?.kind === 'linked-worktree') {
        git(repositoryRoot, environment, gitAuthority.identity, [
          'worktree', 'remove', '--force', source.root,
        ]);
      }
      rmSync(operationRoot, { recursive: true, force: false });
    } catch (error) { cleanupError ??= error; }
  }
  preserveLocalBindingRuntimePrimaryAndCleanup(primaryError, cleanupError);
  return finalResult;
}

export function deriveFixedLocalBindingRuntime() {
  return deriveLocalBindingRuntime('ptr');
}

export function deriveFixedPairedLocalBindingRuntime() {
  return deriveLocalBindingRuntime('paired');
}

export function deriveFixedGenesis001LocalCompilation() {
  return deriveLocalBindingRuntime('genesis001');
}

export function deriveFixedGenesis001LocalCompatibility() {
  return deriveLocalBindingRuntime('genesis001-compatibility');
}

export function deriveFixedGenesis001CurrentBindingCheck() {
  return deriveLocalBindingRuntime('genesis001-current');
}
