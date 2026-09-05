import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync, lstatSync, mkdirSync,
  readdirSync, realpathSync, rmSync,
} from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as vm from 'node:vm';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const WORKER_PROFILE = 'warpkeep-local-binding-worker-v1';
const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const CLI_PATH = `${ROOT}/toolchain/spacetime-2.6.1/spacetimedb-cli`;
const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_PATH = `${ROOT}/toolchain/spacetime-2.6.1/spacetimedb-standalone`;
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const YAML_ROOT = `${ROOT}/toolchain/yaml-2.9.0/package`;
const CACHE_ROOT = `${ROOT}/cache/ptr`;
const RUNS_ROOT = `${ROOT}/runs`;
const MAX_SOURCE_FILE = 4 * 1024 * 1024;
const MAX_SOURCE_TOTAL = 64 * 1024 * 1024;
const MAX_SOURCE_MODULES = 256;
const MAX_WORKER_REQUEST = 1024 * 1024;
const MAX_WORKER_OUTPUT = 64 * 1024;
const CONTROL_FILES = Object.freeze([
  'scripts/local-binding-bounded-file.mjs',
  'scripts/local-binding-runtime.mjs',
  'scripts/local-binding-runtime-core.mjs',
  'scripts/local-binding-runtime-worker.mjs',
  'scripts/local-binding-native-ts-hooks.mjs',
  'scripts/local-binding-runtime-worker-result.mjs',
  'scripts/local-binding-runtime-yaml-v1.json',
  'scripts/spacetime-binding-tree.mjs',
  'scripts/spacetime-cli-attestation.mjs',
  'scripts/spacetime-additive-migration-proof.mjs',
]);
const REQUEST_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'repositoryRoot',
  'dependencyCacheRoot', 'materializationRoot', 'nodePath', 'cliPath', 'handoffPath', 'graph', 'yaml',
]);
const { SourceTextModule } = vm;

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

export function validateLocalBindingWorkerRequest(value) {
  const operationRoot = typeof value?.repositoryRoot === 'string' ? dirname(value.repositoryRoot) : '';
  const operationName = operationRoot === '' ? '' : relative(RUNS_ROOT, operationRoot);
  if (!exactKeys(value, REQUEST_KEYS) || value.schemaVersion !== 1 || value.profile !== WORKER_PROFILE
      || !/^[0-9a-f]{32}$/u.test(value.nonce ?? '') || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '')
      || !fixedContainedPath(value.repositoryRoot, RUNS_ROOT)
      || !/^binding-[0-9a-f]{32}$/u.test(operationName)
      || value.dependencyCacheRoot !== CACHE_ROOT || !fixedContainedPath(value.materializationRoot, RUNS_ROOT)
      || value.nodePath !== NODE_PATH || typeof value.cliPath !== 'string' || !isAbsolute(value.cliPath)
      || basename(value.cliPath) !== 'spacetimedb-cli'
      || !basename(dirname(value.cliPath)).startsWith('warpkeep-cli-attestation-')
      || !fixedContainedPath(value.handoffPath, RUNS_ROOT)
      || value.graph?.root !== value.repositoryRoot
      || value.graph?.entry !== 'scripts/ptr-binding-linux-locked-source-build.ts'
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

export function parseLocalBindingWorkerResult(source, nonce, handoffPath) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_WORKER_OUTPUT || !source.endsWith('\n')) {
    fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { fail('LOCAL_BINDING_WORKER_RESULT_INVALID'); }
  const keys = ['schemaVersion', 'profile', 'nonce', 'sourceCommit', 'sourceTree', 'moduleTreeId',
    'dependencyClosureDigest', 'bundleSha256', 'bundleBytes', 'handoffPath'];
  if (!exactKeys(value, keys) || `${JSON.stringify(value)}\n` !== source || value.schemaVersion !== 1
      || value.profile !== 'warpkeep-local-binding-worker-result-v1' || value.nonce !== nonce
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

function deriveSourceGraph(root) {
  if (typeof SourceTextModule !== 'function') fail('LOCAL_BINDING_RUNTIME_VM_MODULES_REQUIRED');
  const entry = 'scripts/ptr-binding-linux-locked-source-build.ts';
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
    if (/\b(?:require\s*\(|import\s*\()/u.test(source) || /sourceMappingURL/u.test(source)) {
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

export function runLocalBindingBoundedProcess(executable, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.env, shell: false,
      stdio: options.fd3 === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0 };
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise({ stdout: Buffer.concat(output.stdout).toString('utf8'), stderr: Buffer.concat(output.stderr).toString('utf8') });
    };
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      output[`${name}Bytes`] += chunk.length;
      if (output[`${name}Bytes`] > options.maxOutput) {
        child.kill('SIGKILL');
        finish(new LocalBindingRuntimeCoreError('LOCAL_BINDING_RUNTIME_PROCESS_OUTPUT_LIMIT'));
      } else output[name].push(chunk);
    });
    child.on('error', error => finish(new LocalBindingRuntimeCoreError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error })));
    child.on('close', (code, signal) => {
      if (code !== 0 || signal !== null) finish(new LocalBindingRuntimeCoreError(
        signal === 'SIGKILL' ? 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT' : 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED',
      ));
      else finish();
    });
    if (options.fd3 !== undefined) {
      child.stdio[3].end(options.fd3);
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new LocalBindingRuntimeCoreError('LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'));
    }, options.timeout);
  });
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

function snapshotCommittedSource(repositoryRoot, operationRoot, environment, gitIdentity) {
  const commit = git(repositoryRoot, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD']);
  const tree = git(repositoryRoot, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^[0-9a-f]{40}$/u.test(tree)) fail('LOCAL_BINDING_RUNTIME_GIT_FAILED');
  const committedControls = new Map();
  for (const path of CONTROL_FILES) {
    stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
    const committed = spawnSync(GIT_PATH, ['show', `${commit}:${path}`], {
      cwd: repositoryRoot, env: environment, encoding: null, stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024, timeout: 60_000,
    });
    stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitIdentity).fill(0);
    const expected = Buffer.from(committed.stdout);
    if (committed.status !== 0 || !expected.equals(stableFile(
      join(repositoryRoot, ...path.split('/')), expected.length, sha256(expected), undefined, false,
    ))) {
      fail('LOCAL_BINDING_RUNTIME_CONTROL_SOURCE_CHANGED');
    }
    committedControls.set(path, expected);
  }
  const root = join(operationRoot, 'source');
  git(repositoryRoot, environment, gitIdentity, ['worktree', 'add', '--detach', root, commit], 4 * 1024 * 1024);
  chmodSync(root, 0o700);
  if (git(root, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD']) !== commit
      || git(root, environment, gitIdentity, ['rev-parse', '--verify', 'HEAD^{tree}']) !== tree) {
    fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
  }
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
  return { root, commit, tree, bootstrap };
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

async function executeCycle(context, index) {
  const cycleRoot = join(context.operationRoot, `cycle-${index}`);
  mkdirSync(cycleRoot, { mode: 0o700 });
  const handoffRoot = join(cycleRoot, 'handoff');
  const buildRoot = join(cycleRoot, 'builds');
  const generatedRoot = join(cycleRoot, 'generated');
  for (const path of [handoffRoot, buildRoot, generatedRoot]) mkdirSync(path, { mode: 0o700 });
  const handoffPath = join(handoffRoot, 'bundle.js');
  const nonce = randomBytes(16).toString('hex');
  const request = validateLocalBindingWorkerRequest({
    schemaVersion: 1, profile: WORKER_PROFILE, nonce,
    sourceCommit: context.source.commit, sourceTree: context.source.tree,
    repositoryRoot: context.source.root, dependencyCacheRoot: CACHE_ROOT,
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
  });
  verifyLocalBindingBootstrapSource(context.source);
  const result = parseLocalBindingWorkerResult(worker.stdout, nonce, handoffPath);
  if (result.sourceCommit !== context.source.commit || result.sourceTree !== context.source.tree) {
    fail('LOCAL_BINDING_WORKER_RESULT_INVALID');
  }
  const bundle = readHandoff(handoffPath, result);
  context.verifyExecutables();
  await runLocalBindingBoundedProcess(context.cli.path, [
    'generate', '--lang', 'typescript', '--yes', '--no-config', '--js-path', handoffPath,
    '--out-dir', generatedRoot,
  ], { cwd: cycleRoot, env: context.environment, timeout: 5 * 60_000, maxOutput: 4 * 1024 * 1024 });
  context.verifyExecutables();
  const bindings = (await context.readBindingTree(generatedRoot)).map(entry => ({
    path: `spacetimedb/ptr/generated-bindings/${entry.path}`,
    bytes: new Uint8Array(entry.bytes),
  }));
  return Object.freeze({
    sourceCommit: result.sourceCommit, sourceTree: result.sourceTree,
    dependencyClosureDigest: result.dependencyClosureDigest,
    bundleSha256: result.bundleSha256, bundle, bindings,
  });
}

export async function deriveFixedLocalBindingRuntime() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== NODE_PATH || process.env.NODE_OPTIONS
      || JSON.stringify(process.execArgv) !== JSON.stringify(['--experimental-vm-modules'])) {
    fail('LOCAL_BINDING_RUNTIME_HOST_INVALID');
  }
  for (const path of [
    ROOT, join(ROOT, 'toolchain'), dirname(dirname(NODE_PATH)), dirname(NODE_PATH),
    dirname(CLI_PATH), join(ROOT, 'cache'), CACHE_ROOT, RUNS_ROOT,
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

  const operationRoot = join(RUNS_ROOT, `binding-${randomUUID().replaceAll('-', '')}`);
  mkdirSync(operationRoot, { mode: 0o700 });
  const environment = cleanEnvironment(operationRoot);
  let source;
  let cli;
  let complete = false;
  let finalResult;
  let primaryError;
  try {
    source = snapshotCommittedSource(repositoryRoot, operationRoot, environment, gitAuthority.identity);
    const graph = deriveSourceGraph(source.root);
    const manifestPath = join(source.root, 'scripts', 'local-binding-runtime-yaml-v1.json');
    const manifestSource = stableFile(manifestPath).toString('utf8');
    const manifest = validateLocalBindingYamlManifest(manifestSource);
    const yaml = attestYaml(manifest);
    verifyLocalBindingBootstrapSource(source);
    const { attestPinnedSpacetimeCli } = await import(pathToFileURL(
      join(source.root, 'scripts', 'spacetime-cli-attestation.mjs'),
    ).href);
    verifyLocalBindingBootstrapSource(source);
    const cliAttestation = attestPinnedSpacetimeCli(CLI_PATH, spawnSync, environment);
    cli = cliAttestation;
    verifyLocalBindingBootstrapSource(source);
    const { readSpacetimeBindingTree } = await import(pathToFileURL(
      join(source.root, 'scripts', 'spacetime-binding-tree.mjs'),
    ).href);
    verifyLocalBindingBootstrapSource(source);
    const verifyExecutables = () => {
      stableFile(NODE_PATH, NODE_BYTES, NODE_SHA256, 1000, true, nodeAuthority.identity).fill(0);
      stableFile(GIT_PATH, undefined, GIT_SHA256, 0, true, gitAuthority.identity).fill(0);
      cli.verify();
    };
    const context = {
      repositoryRoot, operationRoot, environment, source, graph, yaml, cli,
      readBindingTree: readSpacetimeBindingTree, verifyExecutables,
    };
    const first = await executeCycle(context, 1);
    const second = await executeCycle(context, 2);
    const selected = assertReproducibleLocalBindingCycles(first, second);
    cli.verify();
    if (git(source.root, environment, gitAuthority.identity, ['rev-parse', '--verify', 'HEAD']) !== source.commit
        || git(source.root, environment, gitAuthority.identity, ['rev-parse', '--verify', 'HEAD^{tree}']) !== source.tree) {
      fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    }
    complete = true;
    finalResult = Object.freeze({
      profile: PROFILE, sourceCommit: selected.sourceCommit, sourceTree: selected.sourceTree,
      bundleSha256: selected.bundleSha256,
      dependencyClosureDigest: selected.dependencyClosureDigest,
      bindings: Object.freeze(selected.bindings.map(entry => Object.freeze({
        path: entry.path, bytes: new Uint8Array(entry.bytes),
      }))),
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try { cli?.cleanup(); } catch (error) { cleanupError = error; }
  if (complete) {
    try {
      if (source !== undefined) git(repositoryRoot, environment, gitAuthority.identity, ['worktree', 'remove', '--force', source.root]);
      rmSync(operationRoot, { recursive: true, force: false });
    } catch (error) { cleanupError ??= error; }
  }
  if (primaryError !== undefined || cleanupError !== undefined) {
    if (primaryError !== undefined && cleanupError === undefined) throw primaryError;
    throw new AggregateError([primaryError, cleanupError].filter(Boolean), 'LOCAL_BINDING_RUNTIME_FAILED', {
      cause: primaryError,
    });
  }
  return finalResult;
}
