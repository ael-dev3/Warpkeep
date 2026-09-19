import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { OPERATION_BUNDLE_NOBLE_GRAPH_FILES } from './local-operation-bundle-noble-v1.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { getSealedRealmOperationBundleSpecification, SEALED_REALMS_PTR_OBSERVATION_GRAPH_PATHS,
  deriveSealedRealmOperationBundleSourceClosureDigest } from './sealed-realms-production-bundle-engine.mjs';
import { verifyAuthBridgeNotificationPreparedDeployClosure,
  importAuthBridgeNotificationPreparedAttestedModules } from './auth-bridge-notification-prepared-deploy-closure.mjs';

const MANIFEST = 'scripts/sealed-realms-production-bundle-manifest-v1.json';
const YAML_MANIFEST = 'scripts/local-binding-runtime-yaml-v1.json';
const SELF = 'scripts/sealed-realms-production-linux-preflight.mjs';
const BOOTSTRAP_MEMBERS = Object.freeze([SELF, 'scripts/local-binding-bounded-file.mjs',
  'scripts/sealed-realms-production-bundle-engine.mjs', 'scripts/local-operation-bundle-noble-v1.mjs',
  'scripts/auth-bridge-notification-prepared-deploy-closure.mjs']);
const OPERATIONS = Object.freeze({
  'ptr-state-inspect': Object.freeze({ lane: 'ptr', job: 'observe_ptr', run: 'runSealedRealmsProductionPtrOperation', status: 'state-inspected' }),
  preflight: Object.freeze({ lane: 'g001', job: 'operate_readonly', run: 'runSealedRealmsProductionG001Operation', status: 'preflight-inspected' }),
  'g001-policy-observe': Object.freeze({ lane: 'g001', job: 'operate_readonly', run: 'runSealedRealmsProductionG001Operation', status: 'completed' }),
  'g001-freeze-census': Object.freeze({ lane: 'g001', job: 'operate_readonly', run: 'runSealedRealmsProductionG001Operation', status: 'completed' }),
  'activation-evidence-inspect': Object.freeze({ lane: 'activation', job: 'operate_readonly', run: 'runSealedRealmsProductionActivationOperation', status: 'activation-evidence-inspected' }),
  'activation-evidence-generate': Object.freeze({ lane: 'activation', job: 'operate', run: 'runSealedRealmsProductionActivationOperation', status: 'completed' }),
  'g002-update-inspect': Object.freeze({ lane: 'g002', job: 'operate_g002', run: 'runSealedRealmsProductionG002Operation', status: 'update-inspected' }),
  'g002-update-apply': Object.freeze({ lane: 'g002', job: 'operate_g002', run: 'runSealedRealmsProductionG002Operation', status: 'completed' }),
  'ptr-update-inspect': Object.freeze({ lane: 'ptr', job: 'operate_ptr', run: 'runSealedRealmsProductionPtrOperation', status: 'update-inspected' }),
  'ptr-update-apply': Object.freeze({ lane: 'ptr', job: 'operate_ptr', run: 'runSealedRealmsProductionPtrOperation', status: 'completed' }),
});
const LANES = ['activation', 'g001', 'g002', 'ptr'];
const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const NODE_BYTES = 124819136;
const GIT = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const UID = 1000;
const ACCOUNT_HOME = '/home/warpkeep';
const NODE_PATH = `${ACCOUNT_HOME}/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node`;
const HEX40 = /^[a-f0-9]{40}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const GIT_ENV = Object.freeze({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null',
  GIT_TERMINAL_PROMPT: '0', HOME: '/dev/null', PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
const PHASES = new Set(['input', 'runtime', 'source', 'bundle', 'workflow', 'operation', 'result']);
const forbiddenEnvironment = /^(?:NODE_|ESBUILD_|TS_NODE_|BUN_|LD_|DYLD_|GIT_(?!HUB)|BASH_ENV$|ENV$|OPENSSL_CONF$|SSL_CERT_|PYTHONPATH$|VITEST$)/u;
let active = false;
const retainedReadRuntimes = new WeakMap();

function fail(phase) {
  const error = new Error('SEALED_REALMS_LINUX_PREFLIGHT_FAILED');
  error.phase = PHASES.has(phase) ? phase : 'result';
  throw error;
}
function exact(value, keys, phase) {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) fail(phase);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(keys)
    || keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail(phase);
  return value;
}
const digest = body => createHash('sha256').update(body).digest('hex');
function directory(path, owner, mode) {
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(path) !== path
    || status.uid !== owner || (status.mode & 0o7777) !== mode) fail('runtime');
}
function parents(path, phase) {
  let cursor = dirname(path);
  while (true) {
    const status = lstatSync(cursor);
    if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(cursor) !== cursor
      || ![0, UID].includes(status.uid) || (status.mode & 0o022) !== 0) fail(phase);
    if (cursor === '/') break;
    cursor = dirname(cursor);
  }
}
function runtime(expected, retainedRead = false) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== 'v22.22.3'
    || process.getuid?.() !== UID || process.geteuid?.() !== UID || process.getgid?.() !== UID || process.getegid?.() !== UID
    || process.execArgv.length !== 0 || Object.keys(process.env).some(key => forbiddenEnvironment.test(key))) fail('runtime');
  const account = userInfo();
  if (account.uid !== UID || account.gid !== UID || account.username !== 'warpkeep' || account.homedir !== ACCOUNT_HOME) fail('runtime');
  directory(ACCOUNT_HOME, UID, 0o750);
  if (retainedRead) {
    if (process.cwd() !== `${ACCOUNT_HOME}/Warpkeep-0.4` || process.env.HOME !== ACCOUNT_HOME
      || process.env.PATH !== '/usr/bin:/bin' || process.env.LANG !== 'C' || process.env.LC_ALL !== 'C'
      || process.env.TZ !== 'UTC' || process.env.WSL_DISTRO_NAME !== 'WarpkeepRunner'
      || Object.keys(process.env).some(key => !['HOME', 'PATH', 'LANG', 'LC_ALL', 'TZ', 'WSL_DISTRO_NAME'].includes(key))) fail('runtime');
  } else {
    if (process.env.RUNNER_OS !== 'Linux' || process.env.RUNNER_ARCH !== 'X64'
      || process.env.RUNNER_NAME !== 'warpkeep-wsl-production-01') fail('runtime');
    directory(`${ACCOUNT_HOME}/actions-runner`, UID, 0o700);
    const temporary = process.env.RUNNER_TEMP;
    if (typeof temporary !== 'string' || !isAbsolute(temporary)
      || !temporary.startsWith(`${ACCOUNT_HOME}/actions-runner/`) || temporary.includes('\0')
      || realpathSync(temporary) !== temporary) fail('runtime');
    parents(join(temporary, 'unused'), 'runtime');
  }
  if (process.execPath !== NODE_PATH) fail('runtime');
  parents(NODE_PATH, 'runtime');
  const nodeStatus = lstatSync(NODE_PATH);
  if (nodeStatus.gid !== UID || (nodeStatus.mode & 0o7777) !== 0o500) fail('runtime');
  const node = readLocalBindingBoundedFile(NODE_PATH, { maximumBytes: NODE_BYTES,
    expectedBytes: NODE_BYTES, expectedSha256: NODE_SHA256, expectedUid: UID,
    expectedMode: 0o500, requireExecutable: true, rejectWritableExecutable: true,
    discardBody: true, expectedIdentity: expected?.node });
  parents(GIT, 'runtime');
  const gitStatus = lstatSync(GIT);
  if (gitStatus.gid !== 0 || (gitStatus.mode & 0o7777) !== 0o755) fail('runtime');
  const git = readLocalBindingBoundedFile(GIT, { maximumBytes: 16 * 1024 * 1024,
    expectedSha256: GIT_SHA256, expectedUid: 0, expectedMode: 0o755, requireExecutable: true,
    rejectWritableExecutable: true, discardBody: true, expectedIdentity: expected?.git });
  return Object.freeze({ node: node.identity, git: git.identity });
}
function git(args, allowOne = false) {
  try {
    return execFileSync(GIT, ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: process.cwd(), env: GIT_ENV, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) { if (allowOne && error.status === 1) return undefined; fail('source'); }
}
function gitText(args, allowOne = false) {
  const bytes = git(args, allowOne);
  if (bytes === undefined) return undefined;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  finally { bytes.fill(0); }
}
function committed(commit, path, maximum = 4 * 1024 * 1024) {
  const entry = gitText(['ls-tree', '-z', commit, '--', path]);
  const prefix = /^100644 blob ([a-f0-9]{40})\t/u.exec(entry);
  if (!prefix || entry !== `${prefix[0]}${path}\0`) fail('source');
  const bytes = git(['cat-file', 'blob', prefix[1]]);
  if (bytes.length < 1 || bytes.length > maximum) { bytes.fill(0); fail('source'); }
  return bytes;
}
function sourceFile(commit, path, maximum = 4 * 1024 * 1024) {
  const bytes = committed(commit, path, maximum);
  let opened;
  try {
    const absolute = join(process.cwd(), path);
    parents(absolute, 'source');
    opened = readLocalBindingBoundedFile(absolute, { maximumBytes: maximum, expectedBytes: bytes.length,
      expectedSha256: digest(bytes), expectedUid: UID, expectedMode: 0o644 });
    return bytes;
  } catch (error) { bytes.fill(0); throw error; }
  finally { opened?.body.fill(0); }
}
function source(commit) {
  const root = realpathSync(process.cwd());
  if (root !== process.cwd() || gitText(['rev-parse', '--show-toplevel']) !== `${root}\n`
    || gitText(['rev-parse', '--verify', 'HEAD^{commit}']) !== `${commit}\n`
    || gitText(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']) !== `${commit}\n`
    || gitText(['symbolic-ref', '-q', 'HEAD'], true) !== undefined
    || !['https://github.com/ael-dev3/Warpkeep\n', 'https://github.com/ael-dev3/Warpkeep.git\n']
      .includes(gitText(['remote', 'get-url', 'origin']))
    || gitText(['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('source');
  const flags = gitText(['ls-files', '-v']);
  if (!flags.endsWith('\n') || flags.trimEnd().split('\n').some(line => !line.startsWith('H '))) fail('source');
  const common = gitText(['rev-parse', '--path-format=absolute', '--git-common-dir']).trimEnd();
  if (!isAbsolute(common) || existsSync(join(common, 'info/grafts'))) fail('source');
  for (const path of BOOTSTRAP_MEMBERS) sourceFile(commit, path).fill(0);
  return root;
}
function jsonFile(commit, path, maximum = 1024 * 1024) {
  const bytes = sourceFile(commit, path, maximum);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (`${JSON.stringify(value, null, 2)}\n` !== text) fail('bundle');
    return value;
  } finally { bytes.fill(0); }
}
function bundle(commit, lane) {
  const manifest = exact(jsonFile(commit, MANIFEST), ['schemaVersion', 'profile', 'sourceCommit', 'sourceTree', 'bundles'], 'bundle');
  if (manifest.schemaVersion !== 1 || manifest.profile !== PROFILE || !HEX40.test(manifest.sourceCommit)
    || !HEX40.test(manifest.sourceTree) || !Array.isArray(manifest.bundles)
    || JSON.stringify(manifest.bundles.map(item => item.lane)) !== JSON.stringify(LANES)
    || gitText(['rev-parse', '--verify', `${manifest.sourceCommit}^{tree}`]) !== `${manifest.sourceTree}\n`
    || git(['merge-base', '--is-ancestor', manifest.sourceCommit, commit], true) === undefined) fail('bundle');
  for (const entry of manifest.bundles) {
    exact(entry, ['lane', 'path', 'byteLength', 'sha256', 'sourceClosureDigest', 'graphManifest',
      'declaration', 'exportNames', 'factoryExport', 'factoryFailureCode'], 'bundle');
    const spec = getSealedRealmOperationBundleSpecification(entry.lane);
    if (entry.path !== `scripts/${spec.basename}` || !Number.isSafeInteger(entry.byteLength)
      || entry.byteLength < 1 || entry.byteLength > 4 * 1024 * 1024 || !HEX64.test(entry.sha256)
      || entry.factoryExport !== spec.factoryExport || entry.factoryFailureCode !== spec.factoryFailureCode
      || JSON.stringify(entry.exportNames) !== JSON.stringify(spec.exportNames)) fail('bundle');
  }
  const selected = manifest.bundles.find(item => item.lane === lane);
  const spec = getSealedRealmOperationBundleSpecification(lane);
  if (!Array.isArray(selected.graphManifest) || selected.graphManifest.length < 1 || selected.graphManifest.length > 256
    || selected.sourceClosureDigest !== deriveSealedRealmOperationBundleSourceClosureDigest(lane, selected.graphManifest)
    || spec.requiredGraphPaths.some(path => !selected.graphManifest.some(member => member.path === path))) fail('bundle');
  const yaml = exact(jsonFile(commit, YAML_MANIFEST), ['schemaVersion', 'profile', 'name', 'version', 'sri', 'entry', 'files', 'digest'], 'bundle');
  if (yaml.schemaVersion !== 1 || yaml.profile !== 'warpkeep-local-binding-yaml-v1' || yaml.name !== 'yaml'
    || yaml.version !== '2.9.0' || yaml.entry !== 'dist/index.js' || !Array.isArray(yaml.files)
    || yaml.sri !== 'sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA=='
    || yaml.files.length < 1 || yaml.files.length > 4096) fail('bundle');
  let previous = '';
  let total = 0;
  const aliases = new Set();
  for (const member of selected.graphManifest) {
    exact(member, ['path', 'byteLength', 'sha256'], 'bundle');
    if (typeof member.path !== 'string' || (!/^(?:scripts|spacetimedb|node_modules\/yaml|node_modules\/@noble\/hashes)\/[A-Za-z0-9._/-]+$/u.test(member.path)
      && !(spec.requiredGraphPaths.includes(member.path) && SEALED_REALMS_PTR_OBSERVATION_GRAPH_PATHS.includes(member.path)))
      || member.path.split('/').some(part => !part || part === '.' || part === '..')
      || member.path <= previous || aliases.has(member.path.toLowerCase())
      || !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 || member.byteLength > 4 * 1024 * 1024
      || !HEX64.test(member.sha256) || (total += member.byteLength) > 32 * 1024 * 1024) fail('bundle');
    previous = member.path; aliases.add(member.path.toLowerCase());
    if (member.path.startsWith('node_modules/')) {
      // Embedded dependency bytes were attested during preparation. Reopen only
      // its committed manifest here; never resolve mutable node_modules.
      const pinned = member.path.startsWith('node_modules/yaml/')
        ? yaml.files.filter(file => file.path === member.path.slice('node_modules/yaml/'.length))
        : OPERATION_BUNDLE_NOBLE_GRAPH_FILES.filter(file => member.path === `node_modules/@noble/hashes/${file.path}`);
      if (pinned.length !== 1 || pinned[0].bytes !== member.byteLength || pinned[0].sha256 !== member.sha256) fail('bundle');
    } else {
      const current = sourceFile(commit, member.path);
      const prepared = committed(manifest.sourceCommit, member.path);
      try { if (current.length !== member.byteLength || digest(current) !== member.sha256 || !current.equals(prepared)) fail('bundle'); }
      finally { current.fill(0); prepared.fill(0); }
    }
  }
  const bytes = sourceFile(commit, selected.path);
  try { if (bytes.length !== selected.byteLength || digest(bytes) !== selected.sha256) fail('bundle'); }
  finally { bytes.fill(0); }
  const declaration = exact(selected.declaration, ['path', 'byteLength', 'sha256'], 'bundle');
  if (declaration.path !== selected.path.replace(/\.mjs$/u, '.d.mts') || !HEX64.test(declaration.sha256)
    || !Number.isSafeInteger(declaration.byteLength) || declaration.byteLength < 1 || declaration.byteLength > 64 * 1024) fail('bundle');
  const declared = sourceFile(commit, declaration.path, 64 * 1024);
  try { if (declared.length !== declaration.byteLength || digest(declared) !== declaration.sha256) fail('bundle'); }
  finally { declared.fill(0); }
  return selected;
}

/** Fixed desktop read boundary. This never enters the workflow dispatcher. */
export function createSealedRealmsProductionRetainedFixtureRuntime(input) {
  const options = exact(input, ['operatingCommit'], 'input');
  if (arguments.length !== 1 || typeof options.operatingCommit !== 'string' || !HEX40.test(options.operatingCommit)) fail('input');
  const host = runtime(undefined, true);
  source(options.operatingCommit);
  const selected = bundle(options.operatingCommit, 'activation');
  sourceFile(options.operatingCommit, 'services/release-recovery/scripts/release-recovery-native-adoption-read.mjs').fill(0);
  const paths = [...new Set([...BOOTSTRAP_MEMBERS, MANIFEST, YAML_MANIFEST, selected.path, selected.declaration.path,
    'services/release-recovery/scripts/release-recovery-native-adoption-read.mjs',
    ...selected.graphManifest.filter(member => !member.path.startsWith('node_modules/')).map(member => member.path)])].sort();
  // Capture committed bytes once; every asynchronous boundary reopens those exact
  // files by identity and digest without repeatedly compiling or resolving dependencies.
  const files = paths.map(path => {
    const bytes = sourceFile(options.operatingCommit, path);
    try {
      const expected = { maximumBytes: 4 * 1024 * 1024, expectedBytes: bytes.length,
        expectedSha256: digest(bytes), expectedUid: UID, expectedMode: 0o644, discardBody: true };
      const opened = readLocalBindingBoundedFile(join(process.cwd(), path), expected);
      return Object.freeze({ path, expected: Object.freeze({ ...expected, expectedIdentity: opened.identity }) });
    } finally { bytes.fill(0); }
  });
  const tree = gitText(['rev-parse', '--verify', `${options.operatingCommit}^{tree}`]).trimEnd();
  if (!HEX40.test(tree)) fail('source');
  const capability = Object.freeze({});
  retainedReadRuntimes.set(capability, Object.freeze({ commit: options.operatingCommit, tree, host, selected, files: Object.freeze(files) }));
  return capability;
}

export function attestSealedRealmsProductionRetainedFixtureRuntime(capability) {
  const state = retainedReadRuntimes.get(capability);
  if (arguments.length !== 1 || !state) fail('input');
  runtime(state.host, true); source(state.commit);
  for (const file of state.files) {
    const absolute = join(process.cwd(), file.path);
    parents(absolute, 'source'); readLocalBindingBoundedFile(absolute, file.expected);
  }
  if (gitText(['rev-parse', '--verify', `${state.commit}^{tree}`]) !== `${state.tree}\n`) fail('source');
  return Object.freeze({ operatingCommit: state.commit, operatingTree: state.tree });
}

export async function readSealedRealmsProductionNativeFixtureSources(input) {
  const options = exact(input, ['operatingCommit', 'githubToken'], 'input');
  if (arguments.length !== 1) fail('input');
  const boundary = createSealedRealmsProductionRetainedFixtureRuntime({ operatingCommit: options.operatingCommit });
  const state = retainedReadRuntimes.get(boundary);
  const root = process.cwd();
  const closure = verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root });
  const [loaded] = await importAuthBridgeNotificationPreparedAttestedModules({ authority: closure,
    repositoryRoot: root, memberPaths: [state.selected.path] });
  attestSealedRealmsProductionRetainedFixtureRuntime(boundary);
  if (JSON.stringify(Object.keys(loaded).sort()) !== JSON.stringify([...state.selected.exportNames].sort())
    || typeof loaded.readSealedRealmsProductionRetainedFixtureSources !== 'function') fail('bundle');
  const result = await loaded.readSealedRealmsProductionRetainedFixtureSources({ operatingCommit: state.commit, githubToken: options.githubToken });
  attestSealedRealmsProductionRetainedFixtureRuntime(boundary);
  return result;
}

/** Fixed Linux operating caller; each selected lane owns its effects and evidence. */
export async function runSealedRealmsProductionLinuxOperation(input) {
  const options = exact(input, ['operation', 'workflowInputSha'], 'input');
  if (arguments.length !== 1 || typeof options.operation !== 'string' || !Object.hasOwn(OPERATIONS, options.operation)
    || typeof options.workflowInputSha !== 'string' || !HEX40.test(options.workflowInputSha) || active) fail('input');
  const operation = options.operation;
  const selectedOperation = OPERATIONS[operation];
  active = true;
  let phase = 'runtime';
  try {
    if (process.env.WARPKEEP_OPERATION !== operation || process.env.GITHUB_JOB !== selectedOperation.job) fail('runtime');
    const host = runtime();
    phase = 'source';
    const root = source(options.workflowInputSha);
    phase = 'bundle';
    const selected = bundle(options.workflowInputSha, selectedOperation.lane);
    const closure = verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root });
    const [loaded] = await importAuthBridgeNotificationPreparedAttestedModules({ authority: closure,
      repositoryRoot: root, memberPaths: [selected.path] });
    if (JSON.stringify(Object.keys(loaded).sort()) !== JSON.stringify([...selected.exportNames].sort())
      || typeof loaded[selected.factoryExport] !== 'function'
      || typeof loaded[selectedOperation.run] !== 'function') fail('bundle');
    runtime(host); source(options.workflowInputSha); bundle(options.workflowInputSha, selectedOperation.lane);
    phase = 'workflow';
    const workflowInputSha = options.workflowInputSha;
    const opaque = await loaded[selected.factoryExport]({ operation, workflowInputSha });
    runtime(host); source(workflowInputSha); bundle(workflowInputSha, selectedOperation.lane);
    // Execution failure does not establish whether an effect already committed.
    phase = 'operation';
    const result = await loaded[selectedOperation.run]({ runtime: opaque, operation, workflowInputSha });
    phase = 'result';
    runtime(host); source(workflowInputSha); bundle(workflowInputSha, selectedOperation.lane);
    exact(result, operation === 'g001-freeze-census' ? ['operation', 'status', 'censusAttempt'] : ['operation', 'status'], 'result');
    if (result.operation !== operation || result.status !== selectedOperation.status) fail('result');
    if (operation === 'g001-freeze-census') {
      const selector = exact(result.censusAttempt, ['profile', 'sourceCommit', 'attemptId',
        'githubRunId', 'githubRunAttempt', 'receiptDigest', 'completedAt', 'mutationSubmitted'], 'result');
      if (selector.profile !== 'warpkeep-g001-linux-census-completed-v1'
        || selector.sourceCommit !== workflowInputSha || typeof selector.attemptId !== 'string'
        || !/^[a-f0-9]{32}$/u.test(selector.attemptId)
        || typeof selector.githubRunId !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(selector.githubRunId)
        || selector.githubRunId !== process.env.GITHUB_RUN_ID
        || typeof selector.githubRunAttempt !== 'string' || !/^(?:[1-9][0-9]{0,2}|1000)$/u.test(selector.githubRunAttempt)
        || selector.githubRunAttempt !== process.env.GITHUB_RUN_ATTEMPT
        || typeof selector.receiptDigest !== 'string' || !HEX64.test(selector.receiptDigest)
        || typeof selector.completedAt !== 'string' || !Number.isFinite(Date.parse(selector.completedAt))
        || new Date(selector.completedAt).toISOString() !== selector.completedAt
        || selector.mutationSubmitted !== false) fail('result');
      return Object.freeze({ operation, status: selectedOperation.status, censusAttempt: Object.freeze({ ...selector }) });
    }
    return Object.freeze({ operation, status: selectedOperation.status });
  } catch (error) { fail(error?.message === 'SEALED_REALMS_LINUX_PREFLIGHT_FAILED' ? error.phase : phase); }
  finally { active = false; }
}

/** Compatibility entry keeps its exact preflight-only contract. */
export async function runSealedRealmsProductionLinuxPreflight(input) {
  const options = exact(input, ['operation', 'workflowInputSha'], 'input');
  if (arguments.length !== 1 || options.operation !== 'preflight') fail('input');
  return runSealedRealmsProductionLinuxOperation(options);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let options;
  try {
    if (process.argv.length !== 4 || !process.argv[2].startsWith('--operation=')
      || !Object.hasOwn(OPERATIONS, process.argv[2].slice('--operation='.length))
      || !/^--source=[a-f0-9]{40}$/u.test(process.argv[3])) fail('input');
    options = { operation: process.argv[2].slice('--operation='.length), workflowInputSha: process.argv[3].slice('--source='.length) };
  } catch {
    process.stderr.write('{"operation":"preflight","status":"failed","phase":"input"}\n');
    process.exitCode = 1;
  }
  if (options) runSealedRealmsProductionLinuxOperation(options).then(value => {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({ operation: options.operation, status: 'failed', phase: error.phase })}\n`);
    process.exitCode = 1;
  });
}
