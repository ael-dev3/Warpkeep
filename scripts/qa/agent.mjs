import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { attestPinnedSpacetimeCli } from '../spacetime-cli-attestation.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIT_MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024;
const CHILD_MAXIMUM_OUTPUT_BYTES = 16 * 1024 * 1024;
const GIT_TIMEOUT_MILLISECONDS = 30_000;
const CHILD_TERMINATION_GRACE_MILLISECONDS = 25_000;
const CHILD_KILL_VERIFICATION_MILLISECONDS = 5_000;
const PROCESS_GROUP_POLL_MILLISECONDS = 50;
const LOCK_OWNER_MAXIMUM_BYTES = 2_048;
const LOCK_HELPER_READY = 'warpkeep-qa-lock-ready\n';
const LOCK_HELPER_TIMEOUT_MILLISECONDS = 5_000;
const QA_AGENT_EXECUTABLE_MAXIMUM_BYTES = 128 * 1_024 * 1_024;
const MAXIMUM_CHANGED_PATHS = 100_000;
const MAXIMUM_PATH_BYTES = 4_096;
const MAXIMUM_BASE_REF_BYTES = 256;
const COMMIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const BASE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const LOCK_NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const LOCK_DIGEST_PATTERN = /^[0-9a-f]{24}$/u;
const QA_AGENT_SANDBOX_EXECUTABLE = '/usr/bin/sandbox-exec';
const QA_AGENT_NETWORK_SANDBOX_PROFILE_PARTS = Object.freeze([
  '(version 1)',
  '(allow default)',
  '(deny network-outbound (require-not (remote ip "localhost:*")))',
]);

export const QA_AGENT_LANE_ORDER = Object.freeze([
  'root-changed-tests',
  'root-typecheck',
  'root-build',
  'auth-bridge-check',
  'spacetimedb-verify',
  'spacetimedb-bindings',
  'spacetimedb-worker-migration',
  'spacetimedb-additive-migration',
  'local-fullstack',
]);

const ROOT_FRONTEND_LANES = Object.freeze([
  'root-changed-tests',
  'root-typecheck',
  'root-build',
]);
const SPACETIMEDB_LANES = Object.freeze([
  'spacetimedb-verify',
  'spacetimedb-bindings',
  'spacetimedb-worker-migration',
  'spacetimedb-additive-migration',
]);
const DOCUMENTATION_BASENAMES = new Set([
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'LICENSE.md',
  'NOTICE',
  'NOTICE.md',
  'README.md',
  'SECURITY.md',
]);
const CONFIGURATION_BASENAMES = new Set([
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.node-version',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'wrangler.toml',
  'yarn.lock',
]);
const CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'SHELL',
  'TERM',
  'TMPDIR',
]);
const LANE_TIMEOUT_MILLISECONDS = Object.freeze({
  'root-changed-tests': 10 * 60 * 1_000,
  'root-typecheck': 5 * 60 * 1_000,
  'root-build': 12 * 60 * 1_000,
  'auth-bridge-check': 12 * 60 * 1_000,
  'spacetimedb-verify': 20 * 60 * 1_000,
  'spacetimedb-bindings': 10 * 60 * 1_000,
  'spacetimedb-worker-migration': 5 * 60 * 1_000,
  'spacetimedb-additive-migration': 45 * 60 * 1_000,
  'local-fullstack': 20 * 60 * 1_000,
});
const QA_AGENT_SCRIPT_CONTRACT = Object.freeze([
  Object.freeze({
    path: 'package.json',
    scripts: Object.freeze({
      build: 'tsc -b && node scripts/generate-inner-keep-browser-asset-catalog.mjs --check && node scripts/verify-runtime-assets.mjs && node scripts/verify-inner-keep-runtime-assets.mjs && node scripts/verify-inner-keep-population-assets.mjs && node scripts/verify-hegemony-gold-mine-candidates.mjs && node scripts/verify-hegemony-gold-mine-runtime.mjs && node scripts/verify-hegemony-wheat-farm-runtime-assets.mjs && node scripts/verify-hegemony-logging-camp-runtime-assets.mjs && node scripts/verify-hegemony-stone-quarry-runtime-assets.mjs && node scripts/verify-hegemony-supply-wagon-assets.mjs && node scripts/verify-hegemony-tree-runtime-assets.mjs && vite build && node scripts/verify-inner-keep-runtime-assets.mjs --production-dist && node scripts/verify-inner-keep-population-assets.mjs --production-dist && node scripts/verify-production-dist-exclusions.mjs && node scripts/verify-farcaster-miniapp.mjs',
      'stdb:verify-additive-migration': 'node scripts/verify-spacetime-additive-migration.mjs',
      'stdb:verify-bindings': 'node scripts/verify-spacetime-bindings.mjs',
      'stdb:verify-worker-migration': 'node scripts/verify-castle-worker-additive-migration.mjs',
      test: 'vitest --run',
      typecheck: 'tsc -b',
    }),
  }),
  Object.freeze({
    path: 'services/auth-bridge/package.json',
    scripts: Object.freeze({
      check: 'pnpm run typecheck && pnpm run typecheck:workerd && pnpm run test && pnpm run test:workerd',
      test: 'vitest run',
      'test:workerd': 'vitest run --config vitest.workerd.config.ts',
      typecheck: 'tsc --noEmit',
      'typecheck:workerd': 'tsc --noEmit -p test-workerd/tsconfig.json',
    }),
  }),
  Object.freeze({
    path: 'spacetimedb/package.json',
    scripts: Object.freeze({
      'stdb:build': 'spacetime build --module-path .',
      'test:pure': 'tsx --test tests/*.test.ts',
      typecheck: 'tsc --noEmit',
      verify: 'pnpm run typecheck && pnpm run test:pure && pnpm run stdb:build',
    }),
  }),
]);

export class QaAgentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QaAgentError';
  }
}

function fail(message) {
  throw new QaAgentError(message);
}

function assertQaAgentActive(signal) {
  if (signal?.aborted) fail('QA agent run was interrupted.');
}

function exactQaAgentSandboxPath(value) {
  if (
    typeof value !== 'string'
    || !isAbsolute(value)
    || resolve(value) !== value
    || /[\u0000-\u001f\u007f"\\]/u.test(value)
  ) fail('QA agent sandbox path was invalid.');
  return value;
}

export function qaAgentSandboxProfile(readOnlyPaths = []) {
  if (!Array.isArray(readOnlyPaths)) fail('QA agent sandbox policy was invalid.');
  const paths = [...new Set(readOnlyPaths.map(exactQaAgentSandboxPath))].sort();
  return [
    ...QA_AGENT_NETWORK_SANDBOX_PROFILE_PARTS,
    ...paths.map((path) => (
      `(deny file-write* (subpath ${JSON.stringify(path)}))`
    )),
  ].join(' ');
}

function exactBaseRef(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || Buffer.byteLength(value, 'utf8') > MAXIMUM_BASE_REF_BYTES
    || !BASE_REF_PATTERN.test(value)
    || value.includes('..')
    || value.includes('//')
    || value.includes('@{')
    || value.endsWith('/')
    || value.endsWith('.')
    || value.endsWith('.lock')
    || value.startsWith('-')
  ) {
    fail('QA agent base ref is invalid.');
  }
  return value;
}

export function parseQaAgentArguments(arguments_ = []) {
  if (
    !Array.isArray(arguments_)
    || arguments_.length !== 2
    || arguments_[0] !== '--base'
  ) {
    fail('Usage: qa-agent --base <ref>');
  }
  return Object.freeze({ base: exactBaseRef(arguments_[1]) });
}

function exactChangedPath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || Buffer.byteLength(value, 'utf8') > MAXIMUM_PATH_BYTES
    || value.startsWith('/')
    || value.startsWith('../')
    || value.includes('/../')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail('QA agent received an unsafe changed path.');
  }
  return value.startsWith('./') ? exactChangedPath(value.slice(2)) : value;
}

function isDocumentationPath(path) {
  return path.startsWith('docs/')
    || path.startsWith('LICENSES/')
    || path.startsWith('.reuse/')
    || DOCUMENTATION_BASENAMES.has(path)
    || /(?:^|\/)README\.md$/u.test(path);
}

function isConfigurationPath(path) {
  const basename = path.split('/').at(-1);
  return path.startsWith('.github/')
    || path.startsWith('.devcontainer/')
    || path.startsWith('.husky/')
    || CONFIGURATION_BASENAMES.has(path)
    || CONFIGURATION_BASENAMES.has(basename)
    || /(?:^|\/)(?:eslint|prettier|vitest|vite|rollup|webpack)\.config\.[cm]?[jt]s$/u.test(path)
    || /(?:^|\/)tsconfig(?:\.[A-Za-z0-9_-]+)?\.json$/u.test(path)
    || /(?:^|\/)(?:package|npm-shrinkwrap)-lock\.json$/u.test(path)
    || /(?:^|\/)package\.json$/u.test(path)
    || /(?:^|\/)wrangler\.toml$/u.test(path);
}

function addLanes(target, lanes) {
  for (const lane of lanes) target.add(lane);
}

/**
 * Pure path-to-lane planner. Unknown and trust/configuration surfaces escalate
 * to the complete local matrix instead of guessing at a narrower dependency
 * graph.
 */
export function classifyQaAgentPaths(values) {
  if (!Array.isArray(values)) fail('QA agent changed paths are invalid.');
  if (values.length > MAXIMUM_CHANGED_PATHS) fail('QA agent changed-path count is excessive.');
  const paths = [...new Set(values.map(exactChangedPath))].sort();
  const selected = new Set();
  let full = false;

  for (const path of paths) {
    if (isDocumentationPath(path)) continue;
    if (isConfigurationPath(path)) {
      full = true;
      break;
    }

    if (path.startsWith('services/auth-bridge/')) {
      addLanes(selected, ['root-changed-tests', 'auth-bridge-check', 'local-fullstack']);
      continue;
    }

    if (
      path.startsWith('spacetimedb/')
      || path.startsWith('src/spacetime/module_bindings/')
      || [
        'scripts/generate-spacetime-bindings.mjs',
        'scripts/verify-spacetime-bindings.mjs',
        'scripts/verify-castle-worker-additive-migration.mjs',
        'scripts/verify-spacetime-additive-migration.mjs',
      ].includes(path)
    ) {
      addLanes(selected, ROOT_FRONTEND_LANES);
      addLanes(selected, SPACETIMEDB_LANES);
      selected.add('local-fullstack');
      continue;
    }

    if (
      path.startsWith('src/')
      || path.startsWith('dev/')
      || path.startsWith('public/')
      || path === 'index.html'
      || path.startsWith('scripts/qa-observer/')
    ) {
      addLanes(selected, ROOT_FRONTEND_LANES);
      selected.add('local-fullstack');
      continue;
    }

    if (path.startsWith('tests/')) {
      selected.add('root-changed-tests');
      if (/\.tsx?$/u.test(path)) selected.add('root-typecheck');
      continue;
    }

    if (path.startsWith('scripts/qa/')) {
      selected.add('root-changed-tests');
      continue;
    }

    full = true;
    break;
  }

  const lanes = (full ? QA_AGENT_LANE_ORDER : QA_AGENT_LANE_ORDER.filter(
    (lane) => selected.has(lane)
  ));
  return Object.freeze({
    full,
    lanes: Object.freeze([...lanes]),
    pathCount: paths.length,
  });
}

export function qaAgentChildEnvironment(source = process.env) {
  const environment = {};
  for (const key of CHILD_ENVIRONMENT_KEYS) {
    const value = source?.[key];
    if (typeof value === 'string' && value.length > 0) environment[key] = value;
  }
  return Object.freeze({
    ...environment,
    CI: '1',
    FORCE_COLOR: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    NO_COLOR: '1',
    npm_config_manage_package_manager_versions: 'false',
    pnpm_config_verify_deps_before_run: 'false',
  });
}

async function createQaAgentRuntime(sourceEnvironment, signal) {
  assertQaAgentActive(signal);
  const root = await mkdtemp(join(tmpdir(), 'warpkeep-qa-agent-runtime-'));
  let ready = false;
  try {
    const metadata = await lstat(root);
    if (!privateOwnedDirectory(metadata, currentUid())) {
      fail('QA agent runtime root was unsafe.');
    }
    const home = join(root, 'home');
    const temporary = join(root, 'tmp');
    await Promise.all([
      mkdir(home, { mode: 0o700 }),
      mkdir(temporary, { mode: 0o700 }),
    ]);
    assertQaAgentActive(signal);
    ready = true;
    return Object.freeze({
      root,
      environment: Object.freeze({
        ...(sourceEnvironment ?? process.env),
        HOME: home,
        TMPDIR: temporary,
      }),
    });
  } finally {
    if (!ready) await rm(root, { force: true, recursive: true });
  }
}

async function attestQaAgentExecutable(path, signal) {
  assertQaAgentActive(signal);
  const before = await lstat(path);
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.size < 1
    || before.size > QA_AGENT_EXECUTABLE_MAXIMUM_BYTES
    || (before.mode & 0o111) === 0
  ) fail('QA agent SpacetimeDB CLI snapshot was unsafe.');
  const digest = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path, { signal })) {
      assertQaAgentActive(signal);
      digest.update(chunk);
    }
  } catch {
    fail('QA agent SpacetimeDB CLI snapshot could not be attested.');
  }
  const after = await lstat(path);
  if (
    !after.isFile()
    || after.isSymbolicLink()
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.mode !== after.mode
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || before.ctimeMs !== after.ctimeMs
  ) fail('QA agent SpacetimeDB CLI snapshot changed during attestation.');
  return Object.freeze({
    dev: after.dev,
    ino: after.ino,
    mode: after.mode,
    size: after.size,
    mtimeMs: after.mtimeMs,
    ctimeMs: after.ctimeMs,
    digest: digest.digest('hex'),
  });
}

function exactQaAgentExecutableAttestation(actual, expected) {
  return actual.dev === expected.dev
    && actual.ino === expected.ino
    && actual.mode === expected.mode
    && actual.size === expected.size
    && actual.mtimeMs === expected.mtimeMs
    && actual.ctimeMs === expected.ctimeMs
    && actual.digest === expected.digest;
}

export async function prepareQaAgentSpacetimeCli(runtime, options = {}) {
  if (
    runtime === null
    || typeof runtime !== 'object'
    || typeof runtime.root !== 'string'
    || runtime.environment === null
    || typeof runtime.environment !== 'object'
    || typeof runtime.environment.PATH !== 'string'
    || runtime.environment.PATH.length === 0
  ) fail('QA agent runtime was invalid.');
  assertQaAgentActive(options.signal);
  const attest = options.attest ?? attestPinnedSpacetimeCli;
  let snapshot;
  try {
    snapshot = attest('spacetime', undefined, runtime.environment);
    if (
      snapshot === null
      || typeof snapshot !== 'object'
      || typeof snapshot.path !== 'string'
      || typeof snapshot.directory !== 'string'
      || typeof snapshot.cleanup !== 'function'
    ) fail('QA agent SpacetimeDB CLI attestation was invalid.');
    const companionPath = join(snapshot.directory, 'spacetimedb-standalone');
    const [
      runtimeRoot,
      snapshotRoot,
      snapshotPath,
      snapshotCompanionPath,
      temporaryRoot,
    ] = await Promise.all([
      realpath(runtime.root),
      realpath(snapshot.directory),
      realpath(snapshot.path),
      realpath(companionPath),
      realpath(tmpdir()),
    ]);
    if (
      !runtimeRoot.startsWith(`${temporaryRoot}${sep}`)
      || runtimeRoot === snapshotRoot
      || dirname(snapshotPath) !== snapshotRoot
      || dirname(snapshotCompanionPath) !== snapshotRoot
      || !snapshotRoot.startsWith(`${temporaryRoot}${sep}`)
    ) fail('QA agent SpacetimeDB CLI snapshot was unsafe.');
    if (
      typeof snapshot.digest !== 'string'
      || !/^[0-9a-f]{64}$/u.test(snapshot.digest)
    ) fail('QA agent SpacetimeDB CLI attestation was invalid.');
    const aliasPath = join(snapshotRoot, 'spacetime');
    await symlink(snapshotPath, aliasPath, 'file');
    const aliasMetadata = await lstat(aliasPath);
    if (
      !aliasMetadata.isSymbolicLink()
      || await realpath(aliasPath) !== snapshotPath
    ) fail('QA agent SpacetimeDB CLI alias was unsafe.');
    const [cliAttestation, companionAttestation] = await Promise.all([
      attestQaAgentExecutable(snapshotPath, options.signal),
      attestQaAgentExecutable(snapshotCompanionPath, options.signal),
    ]);
    if (cliAttestation.digest !== snapshot.digest) {
      fail('QA agent SpacetimeDB CLI attestation was invalid.');
    }
    const assertIntact = async () => {
      assertQaAgentActive(options.signal);
      try {
        const [actualCli, actualCompanion, actualAlias] = await Promise.all([
          attestQaAgentExecutable(snapshotPath, options.signal),
          attestQaAgentExecutable(snapshotCompanionPath, options.signal),
          realpath(aliasPath),
        ]);
        const actualAliasMetadata = await lstat(aliasPath);
        if (
          actualAlias !== snapshotPath
          || !actualAliasMetadata.isSymbolicLink()
          || !exactQaAgentExecutableAttestation(actualCli, cliAttestation)
          || !exactQaAgentExecutableAttestation(
            actualCompanion,
            companionAttestation,
          )
        ) fail('QA agent SpacetimeDB CLI snapshot changed during verification.');
      } catch (error) {
        if (error instanceof QaAgentError) throw error;
        fail('QA agent SpacetimeDB CLI snapshot changed during verification.');
      }
    };
    assertQaAgentActive(options.signal);
    return Object.freeze({
      environment: Object.freeze({
        ...runtime.environment,
        PATH: `${snapshotRoot}${delimiter}${runtime.environment.PATH}`,
      }),
      readOnlyPaths: Object.freeze([snapshotRoot]),
      assertIntact,
      cleanup: snapshot.cleanup,
    });
  } catch (error) {
    try {
      snapshot?.cleanup();
    } catch {
      // The fixed-shape preparation failure remains authoritative.
    }
    if (error instanceof QaAgentError) throw error;
    fail('QA agent could not prepare the reviewed SpacetimeDB CLI.');
  }
}

export async function verifyQaAgentScriptContract(
  repositoryRoot,
  options = {},
) {
  assertQaAgentActive(options.signal);
  const root = await realpath(repositoryRoot);
  for (const contract of QA_AGENT_SCRIPT_CONTRACT) {
    let value;
    try {
      value = JSON.parse(await readFile(join(root, contract.path), 'utf8'));
    } catch {
      fail('QA agent command contract could not be read.');
    }
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.scripts === null
      || typeof value.scripts !== 'object'
      || Array.isArray(value.scripts)
    ) fail('QA agent command contract was invalid.');
    for (const [name, expected] of Object.entries(contract.scripts)) {
      if (value.scripts[name] !== expected) {
        fail('QA agent command contract changed without review.');
      }
    }
    assertQaAgentActive(options.signal);
  }
}

function boundedExecFile(
  executable,
  arguments_,
  options,
  execute = execFile,
) {
  return new Promise((resolvePromise, rejectPromise) => {
    execute(executable, arguments_, options, (error, stdout) => {
      if (error) {
        rejectPromise(new QaAgentError('QA agent Git command failed.'));
        return;
      }
      resolvePromise(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '', 'utf8'));
    });
  });
}

export function runQaAgentGitCommand(
  arguments_,
  options = {},
) {
  if (
    !Array.isArray(arguments_)
    || arguments_.length === 0
    || arguments_.some((argument) => typeof argument !== 'string' || argument.includes('\0'))
  ) {
    fail('QA agent Git arguments are invalid.');
  }
  const cwd = options.cwd ?? REPOSITORY_ROOT;
  return boundedExecFile('git', ['--no-optional-locks', ...arguments_], {
    cwd,
    encoding: 'buffer',
    env: qaAgentChildEnvironment(options.environment),
    maxBuffer: GIT_MAXIMUM_OUTPUT_BYTES,
    shell: false,
    signal: options.signal,
    timeout: GIT_TIMEOUT_MILLISECONDS,
    windowsHide: true,
  }, options.execFileImplementation);
}

function exactCommitOutput(value, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    fail(`QA agent ${label} encoding is invalid.`);
  }
  if (text.endsWith('\n')) text = text.slice(0, -1);
  if (!COMMIT_PATTERN.test(text)) fail(`QA agent ${label} is invalid.`);
  return text;
}

export function parseQaAgentNulPaths(value) {
  if (
    !Buffer.isBuffer(value)
    && typeof value !== 'string'
    && !(value instanceof Uint8Array)
  ) {
    fail('QA agent changed-path output is invalid.');
  }
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.byteLength > GIT_MAXIMUM_OUTPUT_BYTES) {
    fail('QA agent changed-path output is excessive.');
  }
  if (bytes.length === 0) return Object.freeze([]);
  if (bytes.at(-1) !== 0) fail('QA agent changed-path output is malformed.');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('QA agent changed-path encoding is invalid.');
  }
  const paths = text.slice(0, -1).split('\0').map(exactChangedPath);
  if (paths.length > MAXIMUM_CHANGED_PATHS) {
    fail('QA agent changed-path count is excessive.');
  }
  return Object.freeze(paths);
}

/**
 * Resolves the caller-provided ref to one exact commit before it can be used by
 * merge-base or diff. Every Git invocation is an argument array and includes
 * an explicit option terminator where a revision can otherwise be ambiguous.
 */
export async function resolveQaAgentGitState(base, options = {}) {
  const selectedBase = exactBaseRef(base);
  assertQaAgentActive(options.signal);
  const executeGit = options.executeGit ?? (
    (arguments_) => runQaAgentGitCommand(arguments_, options)
  );
  const [headOutput, baseOutput] = await Promise.all([
    executeGit(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']),
    executeGit([
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${selectedBase}^{commit}`,
    ]),
  ]);
  assertQaAgentActive(options.signal);
  const head = exactCommitOutput(headOutput, 'HEAD commit');
  const baseCommit = exactCommitOutput(baseOutput, 'base commit');
  const mergeBase = exactCommitOutput(
    await executeGit(['merge-base', head, baseCommit]),
    'merge base',
  );
  assertQaAgentActive(options.signal);
  const outputs = await Promise.all([
    executeGit(['diff', '--name-only', '-z', '--no-renames', mergeBase, head, '--']),
    executeGit(['diff', '--cached', '--name-only', '-z', '--no-renames', '--']),
    executeGit(['diff', '--name-only', '-z', '--no-renames', '--']),
    executeGit(['ls-files', '--others', '--exclude-standard', '-z', '--']),
    executeGit(['ls-files', '--stage', '-z', '--']),
  ]);
  assertQaAgentActive(options.signal);
  const paths = [...new Set(outputs.slice(0, 4).flatMap(parseQaAgentNulPaths))].sort();
  const indexBytes = outputs[4];
  if (
    !Buffer.isBuffer(indexBytes)
    && typeof indexBytes !== 'string'
    && !(indexBytes instanceof Uint8Array)
  ) fail('QA agent index state is invalid.');
  const normalizedIndexBytes = Buffer.isBuffer(indexBytes)
    ? indexBytes
    : Buffer.from(indexBytes);
  if (
    normalizedIndexBytes.byteLength > GIT_MAXIMUM_OUTPUT_BYTES
    || (
      normalizedIndexBytes.byteLength > 0
      && normalizedIndexBytes.at(-1) !== 0
    )
  ) fail('QA agent index state is invalid.');
  const indexDigest = createHash('sha256').update(normalizedIndexBytes).digest('hex');
  return Object.freeze({
    baseCommit,
    head,
    indexDigest,
    mergeBase,
    paths: Object.freeze(paths),
  });
}

export async function fingerprintQaAgentPaths(
  repositoryRoot,
  values,
  options = {},
) {
  assertQaAgentActive(options.signal);
  if (!Array.isArray(values) || values.length > MAXIMUM_CHANGED_PATHS) {
    fail('QA agent changed paths are invalid.');
  }
  const root = await realpath(repositoryRoot);
  const paths = [...new Set(values.map(exactChangedPath))].sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    assertQaAgentActive(options.signal);
    const absolutePath = resolve(root, path);
    if (!absolutePath.startsWith(`${root}${sep}`)) {
      fail('QA agent changed path escaped the repository.');
    }
    digest.update(path);
    digest.update('\0');
    let before;
    try {
      before = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        digest.update('missing\0');
        continue;
      }
      fail('QA agent could not fingerprint changed source.');
    }
    if (before.isSymbolicLink()) {
      let target;
      try {
        target = await readlink(absolutePath);
      } catch {
        fail('QA agent could not fingerprint changed source.');
      }
      digest.update('symlink\0');
      digest.update(target);
      digest.update('\0');
      continue;
    }
    if (!before.isFile()) {
      digest.update(`other:${before.mode}:${before.size}\0`);
      continue;
    }
    digest.update(`file:${before.mode}:${before.size}\0`);
    try {
      for await (const chunk of createReadStream(absolutePath, {
        signal: options.signal,
      })) {
        assertQaAgentActive(options.signal);
        digest.update(chunk);
      }
    } catch {
      fail('QA agent could not fingerprint changed source.');
    }
    const after = await lstat(absolutePath);
    if (
      !after.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('QA agent source changed while it was being fingerprinted.');
    digest.update('\0');
  }
  assertQaAgentActive(options.signal);
  return digest.digest('hex');
}

function repositoryLockDigest(repositoryRoot) {
  return createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 24);
}

export function qaAgentLockPath(repositoryRoot, lockRoot = tmpdir()) {
  if (typeof repositoryRoot !== 'string' || typeof lockRoot !== 'string') {
    fail('QA agent lock coordinates are invalid.');
  }
  return join(lockRoot, `warpkeep-qa-agent-${repositoryLockDigest(repositoryRoot)}.lock`);
}

function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function privateOwnedDirectory(metadata, expectedUid) {
  return metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && (metadata.mode & 0o077) === 0
    && (expectedUid === undefined || metadata.uid === expectedUid);
}

function privateOwnedFile(metadata, expectedUid) {
  return metadata.isFile()
    && !metadata.isSymbolicLink()
    && metadata.size <= LOCK_OWNER_MAXIMUM_BYTES
    && (metadata.mode & 0o077) === 0
    && (expectedUid === undefined || metadata.uid === expectedUid);
}

function parseLockOwner(value, expectedDigest, now) {
  let candidate;
  try {
    candidate = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (
    candidate === null
    || typeof candidate !== 'object'
    || Array.isArray(candidate)
    || Object.keys(candidate).sort().join(',')
      !== 'nonce,pid,repositoryDigest,startedAt,version'
    || candidate.version !== 1
    || !Number.isSafeInteger(candidate.pid)
    || candidate.pid <= 0
    || !Number.isSafeInteger(candidate.startedAt)
    || candidate.startedAt < 0
    || candidate.startedAt > now + 60_000
    || candidate.repositoryDigest !== expectedDigest
    || !LOCK_NONCE_PATTERN.test(candidate.nonce)
  ) {
    return undefined;
  }
  return candidate;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function ensureQaAgentLockDirectory(lockPath, uid) {
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') fail('QA agent lock could not be acquired.');
  }
  const metadata = await lstat(lockPath);
  if (!privateOwnedDirectory(metadata, uid)) {
    fail('QA agent lock is not a private owned directory.');
  }
}

export function qaAgentDirectoryGuardContract(
  lockPath,
  platform = process.platform,
) {
  if (typeof lockPath !== 'string' || !isAbsolute(lockPath) || lockPath.includes('\0')) {
    fail('QA agent lock coordinates are invalid.');
  }
  const helperArguments = Object.freeze([
    process.execPath,
    '-e',
    `process.stdout.write(${JSON.stringify(LOCK_HELPER_READY)});process.stdin.resume();`,
  ]);
  if (platform === 'darwin') {
    return Object.freeze({
      executable: '/usr/bin/lockf',
      arguments: Object.freeze([
        '-s',
        '-t', '0',
        '-k',
        lockPath,
        ...helperArguments,
      ]),
    });
  }
  if (platform === 'linux') {
    return Object.freeze({
      executable: '/usr/bin/flock',
      arguments: Object.freeze([
        '-x',
        '-n',
        lockPath,
        ...helperArguments,
      ]),
    });
  }
  fail('QA agent lock guard is unavailable on this platform.');
}

async function acquireQaAgentDirectoryGuard(lockPath, options = {}) {
  assertQaAgentActive(options.signal);
  const spawnProcess = options.spawnLockImplementation ?? spawn;
  const contract = qaAgentDirectoryGuardContract(
    lockPath,
    options.platform ?? process.platform,
  );
  let child;
  try {
    child = spawnProcess(contract.executable, [...contract.arguments], {
      detached: true,
      env: qaAgentChildEnvironment(options.environment),
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    fail('QA agent lock guard could not start.');
  }
  const closed = new Promise((resolveClose) => {
    child.once('close', (code, signal) => resolveClose({ code, signal }));
  });
  let bytes = 0;
  let text = '';
  const ready = new Promise((resolveReady, rejectReady) => {
    child.once('error', rejectReady);
    child.stdout?.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > Buffer.byteLength(LOCK_HELPER_READY)) {
        rejectReady(new Error('invalid lock helper output'));
        return;
      }
      text += chunk.toString('utf8');
      if (text === LOCK_HELPER_READY) resolveReady();
      else if (!LOCK_HELPER_READY.startsWith(text)) {
        rejectReady(new Error('invalid lock helper output'));
      }
    });
  });
  let timeout;
  let abort;
  const timedOut = new Promise((_, rejectTimeout) => {
    timeout = setTimeout(
      () => rejectTimeout(new Error('lock helper timeout')),
      LOCK_HELPER_TIMEOUT_MILLISECONDS,
    );
  });
  const aborted = new Promise((_, rejectAbort) => {
    abort = () => rejectAbort(new Error('lock helper interrupted'));
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    await Promise.race([
      ready,
      closed.then(() => {
        throw new Error('lock helper unavailable');
      }),
      timedOut,
      aborted,
    ]);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('lock helper exited');
    }
    return Object.freeze({ child, closed });
  } catch {
    try {
      await terminateQaAgentProcessGroup(child, {
        graceMilliseconds: 250,
        verificationMilliseconds: 1_000,
      });
    } catch {
      // The generic acquisition failure remains authoritative.
    }
    assertQaAgentActive(options.signal);
    fail('Another QA agent lock operation is active.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function releaseQaAgentDirectoryGuard(guard) {
  if (!guard?.child?.stdin || typeof guard.child.stdin.end !== 'function') {
    fail('QA agent lock guard was invalid.');
  }
  if (guard.child.exitCode !== null || guard.child.signalCode !== null) {
    fail('QA agent lock guard exited unexpectedly.');
  }
  guard.child.stdin.end();
  let timeout;
  let result;
  try {
    result = await Promise.race([
      guard.closed,
      new Promise((resolveDelay) => {
        timeout = setTimeout(
          () => resolveDelay(undefined),
          LOCK_HELPER_TIMEOUT_MILLISECONDS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  if (result === undefined) {
    await terminateQaAgentProcessGroup(guard.child, {
      graceMilliseconds: 250,
      verificationMilliseconds: 1_000,
    });
    fail('QA agent lock guard did not stop.');
  }
  if (result.code !== 0 || result.signal !== null) {
    fail('QA agent lock guard failed.');
  }
}

async function readQaAgentLockOwner(lockPath, repositoryDigest, now, uid) {
  const ownerPath = join(lockPath, 'owner.json');
  try {
    const metadata = await lstat(ownerPath);
    if (!privateOwnedFile(metadata, uid)) {
      fail('QA agent lock owner was unsafe.');
    }
    const owner = parseLockOwner(
      await readFile(ownerPath, { encoding: 'utf8', flag: 'r' }),
      repositoryDigest,
      now,
    );
    if (!owner) fail('QA agent lock owner was invalid.');
    return owner;
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function cleanupQaAgentLockTemps(lockPath, uid) {
  for (const name of await readdir(lockPath)) {
    if (!/^owner-[0-9a-f]{32}\.tmp$/u.test(name)) continue;
    const path = join(lockPath, name);
    const metadata = await lstat(path);
    if (!privateOwnedFile(metadata, uid)) {
      fail('QA agent lock temporary owner was unsafe.');
    }
    await rm(path, { force: false });
  }
}

/**
 * The private directory is a stable coordination inode. The platform's
 * reviewed advisory-lock utility (`lockf` on macOS, `flock` on Linux) holds
 * that inode while owner state is inspected or replaced. The kernel releases
 * the guard on crashes, so stale recovery has no second stale lock and cannot
 * rename a newly acquired owner's directory.
 */
export async function acquireQaAgentLock(options = {}) {
  const repositoryRoot = await realpath(options.repositoryRoot ?? REPOSITORY_ROOT);
  const lockRoot = await realpath(options.lockRoot ?? tmpdir());
  const digest = repositoryLockDigest(repositoryRoot);
  const lockPath = qaAgentLockPath(repositoryRoot, lockRoot);
  const pid = options.pid ?? process.pid;
  const now = Math.floor((options.now ?? Date.now)());
  const uid = options.uid ?? currentUid();
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  if (
    !Number.isSafeInteger(pid)
    || pid <= 0
    || !Number.isSafeInteger(now)
    || now < 0
  ) {
    fail('QA agent lock policy is invalid.');
  }
  const nonce = (options.createNonce ?? (() => randomBytes(16).toString('hex')))();
  if (!LOCK_NONCE_PATTERN.test(nonce)) fail('QA agent lock nonce is invalid.');
  await ensureQaAgentLockDirectory(lockPath, uid);
  const guard = await acquireQaAgentDirectoryGuard(lockPath, options);
  try {
    const existingOwner = await readQaAgentLockOwner(lockPath, digest, now, uid);
    if (existingOwner && isProcessAlive(existingOwner.pid)) {
      fail('Another QA agent run is active.');
    }
    await cleanupQaAgentLockTemps(lockPath, uid);
    const owner = Object.freeze({
      version: 1,
      pid,
      startedAt: now,
      repositoryDigest: digest,
      nonce,
    });
    const temporaryOwnerPath = join(lockPath, `owner-${nonce}.tmp`);
    await writeFile(
      temporaryOwnerPath,
      `${JSON.stringify(owner)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    await rename(temporaryOwnerPath, join(lockPath, 'owner.json'));
    return Object.freeze({ ...owner, lockPath });
  } finally {
    await releaseQaAgentDirectoryGuard(guard);
  }
}

export async function releaseQaAgentLock(lock, options = {}) {
  if (
    lock === null
    || typeof lock !== 'object'
    || typeof lock.lockPath !== 'string'
    || !Number.isSafeInteger(lock.pid)
    || !LOCK_NONCE_PATTERN.test(lock.nonce ?? '')
    || !LOCK_DIGEST_PATTERN.test(lock.repositoryDigest ?? '')
  ) {
    fail('QA agent lock release token is invalid.');
  }
  const uid = options.uid ?? currentUid();
  await ensureQaAgentLockDirectory(lock.lockPath, uid);
  const guard = await acquireQaAgentDirectoryGuard(lock.lockPath, options);
  try {
    const owner = await readQaAgentLockOwner(
      lock.lockPath,
      lock.repositoryDigest,
      Math.max(Date.now(), lock.startedAt),
      uid,
    );
    if (
      !owner
      || owner.pid !== lock.pid
      || owner.startedAt !== lock.startedAt
      || owner.nonce !== lock.nonce
    ) {
      fail('QA agent lock ownership changed before release.');
    }
    await rm(join(lock.lockPath, 'owner.json'), { force: false });
    await cleanupQaAgentLockTemps(lock.lockPath, uid);
  } finally {
    await releaseQaAgentDirectoryGuard(guard);
  }
}

export function qaAgentCommandsForPlan(plan, mergeBase) {
  if (
    plan === null
    || typeof plan !== 'object'
    || !Array.isArray(plan.lanes)
    || !COMMIT_PATTERN.test(mergeBase)
    || plan.lanes.some((lane) => !QA_AGENT_LANE_ORDER.includes(lane))
  ) {
    fail('QA agent execution plan is invalid.');
  }
  const commands = {
    'root-changed-tests': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['test']),
    }),
    'root-typecheck': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['run', 'typecheck']),
    }),
    'root-build': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['run', 'build']),
    }),
    'auth-bridge-check': Object.freeze({
      executable: 'pnpm',
      arguments: Object.freeze(['--dir', 'services/auth-bridge', 'run', 'check']),
    }),
    'spacetimedb-verify': Object.freeze({
      executable: 'pnpm',
      arguments: Object.freeze(['--dir', 'spacetimedb', 'run', 'verify']),
    }),
    'spacetimedb-bindings': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['run', 'stdb:verify-bindings']),
    }),
    'spacetimedb-worker-migration': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['run', 'stdb:verify-worker-migration']),
    }),
    'spacetimedb-additive-migration': Object.freeze({
      executable: 'npm',
      arguments: Object.freeze(['run', 'stdb:verify-additive-migration']),
    }),
    'local-fullstack': Object.freeze({
      executable: process.execPath,
      arguments: Object.freeze([
        'scripts/qa-observer/local-fullstack-browser-probe.mjs',
      ]),
      osNetworkSandbox: false,
    }),
  };
  return Object.freeze(plan.lanes.map((lane) => Object.freeze({
    id: lane,
    ...commands[lane],
    timeoutMilliseconds: LANE_TIMEOUT_MILLISECONDS[lane],
  })));
}

function wait(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForQaAgentCloseOrTimeout(closed, milliseconds) {
  let timeout;
  try {
    await Promise.race([
      closed,
      new Promise((resolveDelay) => {
        timeout = setTimeout(resolveDelay, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function signalQaAgentProcessGroup(child, signal, killProcess = process.kill) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0 || child.pid === process.pid) {
    fail('QA agent child process group was invalid.');
  }
  try {
    killProcess(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    fail('QA agent child process group could not be signalled.');
  }
}

function qaAgentProcessGroupIsAlive(pid, killProcess = process.kill) {
  try {
    killProcess(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    fail('QA agent child process group could not be verified.');
  }
}

async function waitForQaAgentProcessGroupStop(
  pid,
  killProcess,
  timeoutMilliseconds,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (qaAgentProcessGroupIsAlive(pid, killProcess)) {
    if (Date.now() >= deadline) {
      fail('QA agent child process group remained alive.');
    }
    await wait(PROCESS_GROUP_POLL_MILLISECONDS);
  }
}

export async function terminateQaAgentProcessGroup(child, options = {}) {
  const killProcess = options.killProcess ?? process.kill;
  const graceMilliseconds = options.graceMilliseconds
    ?? CHILD_TERMINATION_GRACE_MILLISECONDS;
  const verificationMilliseconds = options.verificationMilliseconds
    ?? CHILD_KILL_VERIFICATION_MILLISECONDS;
  if (
    !Number.isSafeInteger(graceMilliseconds)
    || graceMilliseconds < 0
    || !Number.isSafeInteger(verificationMilliseconds)
    || verificationMilliseconds <= 0
  ) fail('QA agent termination policy was invalid.');
  const closed = child.exitCode === null && child.signalCode === null
    ? new Promise((resolveClose) => child.once('close', resolveClose))
    : Promise.resolve();
  signalQaAgentProcessGroup(child, 'SIGTERM', killProcess);
  if (graceMilliseconds > 0) {
    await waitForQaAgentCloseOrTimeout(closed, graceMilliseconds);
  }
  // Always sweep the original group. A package-manager leader may exit while
  // a script descendant remains alive.
  signalQaAgentProcessGroup(child, 'SIGKILL', killProcess);
  await waitForQaAgentCloseOrTimeout(closed, verificationMilliseconds);
  await waitForQaAgentProcessGroupStop(
    child.pid,
    killProcess,
    verificationMilliseconds,
  );
}

/**
 * Child stdout/stderr are drained but never retained or forwarded. The caller
 * receives only one fixed-shape aggregate, and excessive output fails closed.
 */
export function runQaAgentCommand(command, options = {}) {
  if (
    command === null
    || typeof command !== 'object'
    || typeof command.id !== 'string'
    || !QA_AGENT_LANE_ORDER.includes(command.id)
    || typeof command.executable !== 'string'
    || !Array.isArray(command.arguments)
    || command.arguments.some((argument) => typeof argument !== 'string')
    || (
      command.osNetworkSandbox !== undefined
      && typeof command.osNetworkSandbox !== 'boolean'
    )
    || !Number.isSafeInteger(command.timeoutMilliseconds)
    || command.timeoutMilliseconds <= 0
  ) {
    fail('QA agent child command is invalid.');
  }
  const spawnProcess = options.spawnImplementation ?? spawn;
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    let outputBytes = 0;
    let outputExceeded = false;
    let timedOut = false;
    let interrupted = false;
    let spawnFailed = false;
    let childSpawned = false;
    let child;
    let timeout;
    let terminationPromise;
    const beginTermination = () => {
      if (!terminationPromise) {
        terminationPromise = Number.isSafeInteger(child?.pid) && child.pid > 0
          ? terminateQaAgentProcessGroup(child)
          : Promise.resolve();
        void terminationPromise.catch(() => {});
      }
      return terminationPromise;
    };
    const abort = () => {
      interrupted = true;
      void beginTermination();
    };
    const consume = (chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes <= CHILD_MAXIMUM_OUTPUT_BYTES || outputExceeded) return;
      outputExceeded = true;
      void beginTermination();
    };
    try {
      const useOsNetworkSandbox = command.osNetworkSandbox !== false;
      if (useOsNetworkSandbox && process.platform !== 'darwin') {
        rejectPromise(new QaAgentError(
          `QA agent lane ${command.id} requires the reviewed macOS network sandbox.`,
        ));
        return;
      }
      child = spawnProcess(
        useOsNetworkSandbox ? QA_AGENT_SANDBOX_EXECUTABLE : command.executable,
        useOsNetworkSandbox
          ? [
              '-p',
              qaAgentSandboxProfile(options.readOnlyPaths),
              command.executable,
              ...command.arguments,
            ]
          : [...command.arguments],
        {
          cwd: options.cwd ?? REPOSITORY_ROOT,
          detached: true,
          env: qaAgentChildEnvironment(options.environment),
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } catch {
      rejectPromise(new QaAgentError(
        `QA agent lane ${command.id} could not start.`,
      ));
      return;
    }
    child.once('spawn', () => {
      childSpawned = true;
    });
    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);
    child.on('error', () => {
      spawnFailed = true;
    });
    child.once('close', (code, signal) => {
      void (async () => {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
        try {
          if (terminationPromise) {
            await terminationPromise;
          } else if (childSpawned) {
            await terminateQaAgentProcessGroup(child, {
              graceMilliseconds: 0,
            });
          }
        } catch {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} did not stop within its termination boundary.`,
          ));
          return;
        }
        if (spawnFailed) {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} could not start.`,
          ));
          return;
        }
        if (outputExceeded) {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} exceeded its output boundary.`,
          ));
          return;
        }
        if (timedOut) {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} exceeded its time boundary.`,
          ));
          return;
        }
        if (interrupted) {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} was interrupted.`,
          ));
          return;
        }
        if (code !== 0) {
          rejectPromise(new QaAgentError(
            `QA agent lane ${command.id} failed with ${
              signal ? 'a process signal' : 'a nonzero exit'
            }.`,
          ));
          return;
        }
        resolvePromise(Object.freeze({
          lane: command.id,
          status: 'passed',
          durationMilliseconds: Math.max(0, Date.now() - startedAt),
        }));
      })();
    });
    timeout = setTimeout(() => {
      timedOut = true;
      void beginTermination();
    }, command.timeoutMilliseconds);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function runQaAgent(options = {}) {
  const parsed = parseQaAgentArguments(options.arguments ?? []);
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  assertQaAgentActive(options.signal);
  const runtime = await createQaAgentRuntime(options.environment, options.signal);
  let lock;
  let spacetimeRuntime;
  try {
    lock = await acquireQaAgentLock({
      repositoryRoot,
      ...(options.lockOptions ?? {}),
      environment: runtime.environment,
      signal: options.signal,
    });
    assertQaAgentActive(options.signal);
    await (options.verifyScriptContract ?? verifyQaAgentScriptContract)(
      repositoryRoot,
      { signal: options.signal },
    );
    assertQaAgentActive(options.signal);
    const git = await resolveQaAgentGitState(parsed.base, {
      ...(options.gitOptions ?? {}),
      cwd: repositoryRoot,
      environment: runtime.environment,
      signal: options.signal,
    });
    const sourceFingerprint = await fingerprintQaAgentPaths(
      repositoryRoot,
      git.paths,
      { signal: options.signal },
    );
    assertQaAgentActive(options.signal);
    const plan = classifyQaAgentPaths(git.paths);
    const laneUsesSpacetimeCli = (lane) => (
      SPACETIMEDB_LANES.includes(lane) || lane === 'local-fullstack'
    );
    if (plan.lanes.some(laneUsesSpacetimeCli)) {
      spacetimeRuntime = await (
        options.prepareSpacetimeCli ?? prepareQaAgentSpacetimeCli
      )(runtime, { signal: options.signal });
    }
    const report = options.report ?? (() => undefined);
    report(Object.freeze({
      event: 'plan',
      baseCommit: git.baseCommit,
      mergeBase: git.mergeBase,
      full: plan.full,
      laneCount: plan.lanes.length,
      pathCount: plan.pathCount,
    }));
    const commands = qaAgentCommandsForPlan(plan, git.mergeBase);
    const results = [];
    for (const command of commands) {
      assertQaAgentActive(options.signal);
      const usesSpacetimeCli = laneUsesSpacetimeCli(command.id);
      const cliRuntime = usesSpacetimeCli ? spacetimeRuntime : undefined;
      await cliRuntime?.assertIntact();
      let result;
      try {
        result = await (options.runCommand ?? runQaAgentCommand)(command, {
          cwd: repositoryRoot,
          environment: cliRuntime?.environment ?? runtime.environment,
          readOnlyPaths: cliRuntime?.readOnlyPaths ?? [],
          signal: options.signal,
        });
      } finally {
        await cliRuntime?.assertIntact();
      }
      results.push(result);
      report(Object.freeze({ event: 'lane', ...result }));
    }
    assertQaAgentActive(options.signal);
    const finalGit = await resolveQaAgentGitState(parsed.base, {
      ...(options.gitOptions ?? {}),
      cwd: repositoryRoot,
      environment: runtime.environment,
      signal: options.signal,
    });
    const finalFingerprint = await fingerprintQaAgentPaths(
      repositoryRoot,
      finalGit.paths,
      { signal: options.signal },
    );
    assertQaAgentActive(options.signal);
    if (
      finalGit.head !== git.head
      || finalGit.baseCommit !== git.baseCommit
      || finalGit.indexDigest !== git.indexDigest
      || finalGit.mergeBase !== git.mergeBase
      || finalFingerprint !== sourceFingerprint
      || finalGit.paths.length !== git.paths.length
      || finalGit.paths.some((path, index) => path !== git.paths[index])
    ) fail('QA agent source changed during verification.');
    assertQaAgentActive(options.signal);
    return Object.freeze({
      baseCommit: git.baseCommit,
      mergeBase: git.mergeBase,
      full: plan.full,
      pathCount: plan.pathCount,
      results: Object.freeze(results),
    });
  } finally {
    let firstFailure;
    if (lock) {
      try {
        await releaseQaAgentLock(lock, {
          environment: runtime.environment,
        });
      } catch (error) {
        firstFailure = error;
      }
    }
    if (spacetimeRuntime) {
      try {
        spacetimeRuntime.cleanup();
      } catch (error) {
        firstFailure ??= error;
      }
    }
    try {
      await rm(runtime.root, { force: true, recursive: true });
    } catch (error) {
      firstFailure ??= error;
    }
    if (firstFailure) throw firstFailure;
  }
}

function boundedReport(value) {
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line, 'utf8') > 2_048) {
    fail('QA agent report exceeded its fixed boundary.');
  }
  process.stdout.write(line);
}

async function main() {
  const abortController = new AbortController();
  const signalHandler = () => abortController.abort();
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  try {
    const result = await runQaAgent({
      arguments: process.argv.slice(2),
      report: boundedReport,
      signal: abortController.signal,
    });
    boundedReport({
      event: 'complete',
      full: result.full,
      pathCount: result.pathCount,
      laneCount: result.results.length,
    });
  } catch (error) {
    const message = error instanceof QaAgentError
      ? error.message
      : 'QA agent failed closed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', signalHandler);
    process.removeListener('SIGTERM', signalHandler);
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
