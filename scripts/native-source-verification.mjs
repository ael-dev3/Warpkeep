// Maintained local test verification. This first tranche cannot authorize a release.
import fs from 'node:fs';
import cp from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { probeProductionAdminProcessIdentity } from './production-admin-token-budget.mjs';
import { parseVitestReport, parseNodeEvents } from './native-source-verification-reports.mjs';
import { captureNativeBuildOutput } from './native-source-verification-build-output.mjs';

export const NATIVE_VERIFICATION_PROFILE = 'warpkeep-native-source-test-partitions-v1';
export const NATIVE_SOURCE_CHECKS_PROFILE = 'warpkeep-native-source-checks-v1';
export const NAMESPACE_FILES = Object.freeze([
  'tests/ptrProductionExistingUpdateContinuation.test.ts',
  'tests/sealedRealmsExistingUpdate.test.ts',
  'tests/sealedRealmsProductionContinuation.test.ts',
  'tests/sealedRealmsProductionDispatcher.test.ts',
]);
// Source-owned requirements, never a caller-provided coverage/waiver switch.
export const REQUIRED_NATIVE_DOMAINS = Object.freeze(['source-policy', 'ordinary-tests',
  'namespace-tests', 'module-pure-tests', 'root-types', 'production-builds',
  'auth-bridge', 'release-recovery', 'connected-module', 'genuine-preparation']);
const IMPLEMENTED_DOMAINS = Object.freeze(['ordinary-tests', 'namespace-tests', 'module-pure-tests']);
const SOURCE_CHECK_DOMAINS = Object.freeze(['root-types', 'production-builds']);
const GITLEAKS_SHA256 = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509';
const SOURCE_CHECK_SCRIPTS = Object.freeze({
  build: 'de5307c5c53b88ce0a0c6fb1e31632830045af1f10f17aadf30c3f20295cdc3b',
  typecheck: 'fd976a80ae41f2c383ec0d06706d657812879206c8154f4492c2075e672aa0dd',
  'verify:licenses': '1054c8f4b4baeb0341e2a6a78570f4daea1fc258c4c7039bbaa9a39770103b2b',
  'verify:runtime-assets': 'ee722851acc0a079760928d54edd26641293d674df6e2b82629c9fdfad3a7d9a',
  'verify:file-sizes': '7bf1378ff8c295bce544c9673fb8b8d2a3a029d0027f034a45eaf8f640fed5ce',
  'verify:sealed-launch': '16b1b565fd4e57569e08b4abdf81bbb4dd665c7a02a6692a615c7719632b9328',
});
const GIT = '/usr/bin/git';
const MAX_BYTES = 64 * 1024 * 1024;
// Existing 2.6.1 native compiler binary authority, also retained by local-binding-runtime-core.
const SPACETIME_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const YAML_ARCHIVE_SHA256 = '008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91';
const HEX40 = /^[a-f0-9]{40}$/u, HEX64 = /^[a-f0-9]{64}$/u;
const sha = body => createHash('sha256').update(body).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = code => { throw Error(`NATIVE_SOURCE_VERIFICATION_${code}`); };
const same = (a, b) => { if (!isDeepStrictEqual(a, b)) fail('CHANGED'); };
const identity = stat => ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
  .map(key => String(stat[key])).join(':');

function environment(tools) {
  return { HOME: '/nonexistent', PATH: [dirname(process.execPath),
    ...(tools ? [dirname(tools.pnpm.path), dirname(tools.spacetime.path)] : []), '/usr/bin', '/bin'].join(':'),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', NO_COLOR: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
    ...(tools ? { SPACETIME_BIN: tools.spacetime.path, pnpm_config_pm_on_fail: 'ignore' } : {}) };
}
function git(root, args) {
  const result = cp.spawnSync(GIT, ['--no-replace-objects', '--no-optional-locks', '--literal-pathspecs',
    '-c', 'advice.graftFileDeprecated=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args],
  { cwd: root, env: environment(), shell: false, timeout: 60_000, maxBuffer: MAX_BYTES });
  if (result.error || result.status !== 0 || result.signal !== null || result.stderr.length) fail('GIT_FAILED');
  return result.stdout;
}
function nativeRoot() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || !process.getuid?.()
    || !process.getgid?.() || !/^22\./u.test(process.versions.node) || process.execArgv.length) fail('HOST_INVALID');
  const root = resolve(process.cwd());
  if (fs.realpathSync(root) !== root || git(root, ['rev-parse', '--show-toplevel']).toString().trim() !== root) fail('ROOT_INVALID');
  const qa = join(root, 'artifacts', 'qa'), state = fs.lstatSync(qa);
  if (!state.isDirectory() || state.isSymbolicLink() || fs.realpathSync(qa) !== qa
    || state.uid !== process.getuid() || state.mode & 0o022) fail('QA_DIRECTORY_INVALID');
  return root;
}
function read(path, maximumBytes = MAX_BYTES, mode) {
  const value = readLocalBindingBoundedFile(path, { maximumBytes, expectedUid: process.getuid?.(),
    ...(mode === undefined ? {} : { expectedMode: mode }) });
  return { ...value, sha256: sha(value.body) };
}
function artifact(root, path, digest) {
  const full = resolve(path);
  if (dirname(full) !== join(root, 'artifacts', 'qa')) fail('ARTIFACT_PATH_INVALID');
  const value = read(full, MAX_BYTES, 0o600);
  if (digest && value.sha256 !== digest) fail('ARTIFACT_CHANGED');
  return { path: full, sha256: value.sha256, identity: value.identity, bytes: value.body.length };
}
function output(root, path, body) {
  const full = resolve(path);
  if (dirname(full) !== join(root, 'artifacts', 'qa') || !/^[A-Za-z0-9._-]+$/u.test(full.slice(dirname(full).length + 1))) fail('OUTPUT_PATH_INVALID');
  const descriptor = fs.openSync(full, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.fchmodSync(descriptor, 0o600); fs.writeFileSync(descriptor, body); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  return artifact(root, full, sha(body));
}
function writeReserved(root, path, body, reservation) {
  const before = artifact(root, path);
  same(before, reservation);
  if (before.bytes !== 0) fail('OUTPUT_NOT_EMPTY');
  const descriptor = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    const opened = read(path, MAX_BYTES, 0o600);
    same(opened.identity, before.identity);
    same(Object.fromEntries(Object.keys(before.identity).map(key => [key, String(stat[key])])), before.identity);
    if (!stat.isFile() || stat.nlink !== 1n || stat.size !== 0n) fail('OUTPUT_CHANGED');
    fs.writeFileSync(descriptor, body); fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  return artifact(root, path, sha(body));
}
function sourceSnapshot(root) {
  const sourceCommit = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim();
  const sourceTree = git(root, ['rev-parse', '--verify', 'HEAD^{tree}']).toString().trim();
  if (!HEX40.test(sourceCommit) || !HEX40.test(sourceTree) || git(root, ['status', '--porcelain=v1', '--untracked-files=all']).length
    || git(root, ['ls-files', '-v', '-z']).toString().split('\0').filter(Boolean).some(line => !line.startsWith('H '))) fail('SOURCE_NOT_CLEAN');
  const signature = cp.spawnSync(GIT, ['--no-optional-locks', '--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false', 'verify-commit', sourceCommit], { cwd: root, env: environment(), shell: false,
    timeout: 60_000, maxBuffer: 1024 * 1024 });
  if (signature.error || signature.status !== 0 || signature.signal !== null) fail('LOCAL_SIGNATURE_INVALID');
  const files = [];
  let totalBytes = 0;
  for (const entry of git(root, ['ls-tree', '-r', '-l', '-z', sourceTree]).toString().split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(entry);
    if (!match || /[\\\x00-\x1f\x7f]/u.test(match[4]) || match[4].split('/').some(part => ['', '.', '..', '.git'].includes(part))) fail('SOURCE_ENTRY_INVALID');
    totalBytes += Number(match[3]);
    if (!Number.isSafeInteger(totalBytes) || totalBytes > 256 * 1024 * 1024) fail('SOURCE_SIZE_INVALID');
    const bytes = read(join(root, match[4]), MAX_BYTES, match[1] === '100644' ? 0o644 : 0o755);
    if (bytes.body.length !== Number(match[3]) || createHash('sha1').update(`blob ${bytes.body.length}\0`).update(bytes.body).digest('hex') !== match[2]) fail('RAW_SOURCE_CHANGED');
    files.push({ path: match[4], oid: match[2], mode: match[1], sha256: bytes.sha256, identity: bytes.identity });
  }
  if (!files.length || files.length > 8192) fail('SOURCE_INVENTORY_INVALID');
  const indexPath = resolve(root, git(root, ['rev-parse', '--git-path', 'index']).toString().trim());
  const index = read(indexPath);
  return { sourceCommit, sourceTree, files, indexPath, indexSha256: index.sha256, indexIdentity: index.identity,
    refsSha256: sha(git(root, ['show-ref'])), signatureTranscriptSha256: sha(Buffer.concat([signature.stdout, signature.stderr])),
    signatureScope: 'Local configured Git signature trust only; no accepted-main GitHub proof.' };
}

export function deriveNativeTestPartitions(paths, viteConfig, modulePackage) {
  if (!Array.isArray(paths) || new Set(paths).size !== paths.length || paths.some(path => typeof path !== 'string'
    || /[\\\x00-\x1f]/u.test(path) || path.split('/').some(part => ['', '.', '..'].includes(part)))) fail('INVENTORY_INVALID');
  const source = new Set(paths), config = String(viteConfig), metadata = JSON.parse(String(modulePackage));
  if (config.match(/\binclude\s*:/gu)?.length !== 1
    || config.match(/include:\s*\[\s*['"]tests\/\*\*\/\*\.\{test,spec\}\.\{ts,tsx\}['"]\s*\]/gu)?.length !== 1
    || metadata.scripts?.['test:pure'] !== 'tsx --test tests/*.test.ts') fail('RUNNER_CONFIG_CHANGED');
  if (!NAMESPACE_FILES.every(file => source.has(file))) fail('NAMESPACE_INVENTORY_MISSING');
  const rootFiles = paths.filter(path => /^tests\/.+\.(?:test|spec)\.tsx?$/u.test(path)).sort();
  const ordinaryVitestFiles = rootFiles.filter(path => !NAMESPACE_FILES.includes(path));
  const moduleFiles = paths.filter(path => /^spacetimedb\/tests\/[^/]+\.test\.ts$/u.test(path)).sort();
  if (!ordinaryVitestFiles.length || !moduleFiles.length) fail('TEST_INVENTORY_EMPTY');
  return { ordinaryVitestFiles, namespaceVitestFiles: [...NAMESPACE_FILES], moduleFiles };
}
function installedTool(path, expectedLinks = 1, uid = process.getuid?.()) {
  const full = fs.realpathSync(path), descriptor = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.uid !== BigInt(uid) || before.nlink !== BigInt(expectedLinks)
      || before.size < 1n || before.size > BigInt(MAX_BYTES * 2) || before.mode & 0o022n) fail('INSTALLED_TOOL_INVALID');
    const body = fs.readFileSync(descriptor);
    if (body.length !== Number(before.size) || identity(before) !== identity(fs.fstatSync(descriptor, { bigint: true }))
      || identity(before) !== identity(fs.lstatSync(full, { bigint: true })) || fs.realpathSync(path) !== full) fail('INSTALLED_TOOL_CHANGED');
    return { body, fact: { requestedPath: path, path: full, sha256: sha(body), identity: identity(before), bytes: body.length } };
  } finally { fs.closeSync(descriptor); }
}
function inputFacts(root) {
  const rootPackage = JSON.parse(read(join(root, 'package.json')).body), lock = JSON.parse(read(join(root, 'package-lock.json')).body);
  const modulePackage = JSON.parse(read(join(root, 'spacetimedb/package.json')).body);
  const vitest = installedTool(join(root, 'node_modules/vitest/vitest.mjs'));
  const vitestPackage = installedTool(join(root, 'node_modules/vitest/package.json'));
  const tsx = installedTool(join(root, 'spacetimedb/node_modules/tsx/dist/cli.mjs'), 2);
  const tsxPackage = installedTool(join(root, 'spacetimedb/node_modules/tsx/package.json'), 2);
  if (JSON.parse(vitestPackage.body).name !== 'vitest' || JSON.parse(vitestPackage.body).version !== rootPackage.devDependencies.vitest
    || lock.packages['node_modules/vitest']?.version !== rootPackage.devDependencies.vitest
    || JSON.parse(tsxPackage.body).name !== 'tsx' || JSON.parse(tsxPackage.body).version !== modulePackage.devDependencies.tsx) fail('INSTALLED_PACKAGE_MISMATCH');
  // Full ordinary tests need these existing offline tools; fail before any test if unavailable.
  if (typeof process.env.SPACETIME_BIN !== 'string' || resolve(process.env.SPACETIME_BIN) !== process.env.SPACETIME_BIN) fail('SPACETIME_PREREQUISITE_MISSING');
  const spacetime = installedTool(process.env.SPACETIME_BIN);
  if (spacetime.fact.sha256 !== SPACETIME_SHA256) fail('SPACETIME_PREREQUISITE_INVALID');
  const yaml = read(join(root, '.git/yaml-2.9.0.tgz'), 112086);
  if (yaml.body.length !== 112086 || yaml.sha256 !== YAML_ARCHIVE_SHA256) fail('YAML_PREREQUISITE_INVALID');
  const pnpmManifest = JSON.parse(read(join(root, 'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json')).body);
  const pnpm = {};
  for (const [key, pathKey, digestKey] of [['executable', 'pnpmExecutable', 'pnpmExecutableSha256'],
    ['package', 'pnpmPackagePath', 'pnpmPackageSha256'], ['launcher', 'pnpmLauncherPath', 'pnpmLauncherSha256'],
    ['runtime', 'pnpmRuntimePath', 'pnpmRuntimeSha256']]) {
    const actual = installedTool(pnpmManifest[pathKey]);
    if (actual.fact.sha256 !== pnpmManifest[digestKey]) fail('PNPM_PREREQUISITE_INVALID');
    pnpm[key] = actual.fact;
  }
  const pnpmVersion = cp.spawnSync(pnpm.executable.path, ['--version'], { cwd: root, env: environment(), shell: false, timeout: 30_000, maxBuffer: 1024 * 1024 });
  if (pnpmVersion.error || pnpmVersion.status !== 0 || pnpmVersion.signal !== null || pnpmVersion.stderr.length
    || `pnpm@${pnpmVersion.stdout.toString().trim()}` !== pnpmManifest.packageManager) fail('PNPM_VERSION_INVALID');
  return { node: installedTool(process.execPath).fact, git: installedTool(GIT, 1, 0).fact,
    vitest: vitest.fact, vitestPackage: vitestPackage.fact, tsx: tsx.fact, tsxPackage: tsxPackage.fact,
    spacetime: spacetime.fact, pnpm: pnpm.executable, pnpmInputs: pnpm,
    yamlArchive: { path: join(root, '.git/yaml-2.9.0.tgz'), sha256: yaml.sha256, identity: yaml.identity, bytes: yaml.body.length },
    producer: { path: join(root, 'scripts/native-source-verification.mjs'), sha256: read(join(root, 'scripts/native-source-verification.mjs')).sha256 },
    reporter: { path: join(root, 'scripts/native-source-verification-node-reporter.mjs'), sha256: read(join(root, 'scripts/native-source-verification-node-reporter.mjs')).sha256 },
    limitation: 'Installed entry/package bytes only; complete installed dependency-graph attestation remains required.' };
}
export function nativeTestCommands(root, partitions, tools, stem) {
  if (partitions.ordinaryVitestFiles.some(path => NAMESPACE_FILES.includes(path))
    || !isDeepStrictEqual(partitions.namespaceVitestFiles, [...NAMESPACE_FILES])) fail('PARTITIONS_INVALID');
  return [{ id: 'ordinary-tests', kind: 'vitest-json', files: partitions.ordinaryVitestFiles, cwd: root,
    executable: tools.node.path, args: [tools.vitest.path, 'run', ...partitions.ordinaryVitestFiles,
      '--maxWorkers=1', '--testTimeout=180000', '--no-cache', '--reporter=json', `--outputFile=${stem}-ordinary-tests.report.json`],
    reportPath: `${stem}-ordinary-tests.report.json`, deadlineMs: 3_600_000 },
  { id: 'namespace-tests', kind: 'vitest-json', files: partitions.namespaceVitestFiles, cwd: root,
    executable: '/usr/bin/sudo', args: ['-n', '/bin/bash', join(root, 'scripts/test-sealed-realms-existing-update-linux.sh'),
      '--as', String(process.getuid?.()), String(process.getgid?.()), tools.node.path, root,
      '--report-json', `${stem}-namespace-tests.report.json`], reportPath: `${stem}-namespace-tests.report.json`, deadlineMs: 900_000 },
  ...partitions.moduleFiles.map((file, index) => ({ id: `module-pure-${index + 1}`, kind: 'node-events', files: [file],
    cwd: join(root, 'spacetimedb'), executable: tools.node.path,
    args: [tools.tsx.path, '--test', '--test-timeout=120000', `--test-reporter=${pathToFileURL(join(root, 'scripts/native-source-verification-node-reporter.mjs')).href}`, file.slice('spacetimedb/'.length)],
    reportPath: `${stem}-module-pure-${index + 1}.events.ndjson`, deadlineMs: 180_000 }))];
}
/** Fixed source recipe. pnpm runs the declared scripts; it is not evidence of npm execution. */
export function nativeSourceCheckCommands(root, tools, stem, packageBytes) {
  const metadata = JSON.parse(String(packageBytes));
  if (metadata.packageManager !== 'npm@10.9.8' || typeof metadata.scripts !== 'object'
    || !metadata.scripts || Array.isArray(metadata.scripts)) fail('SOURCE_CHECK_RECIPE_CHANGED');
  for (const [name, expected] of Object.entries(SOURCE_CHECK_SCRIPTS)) {
    if (typeof metadata.scripts[name] !== 'string' || sha(metadata.scripts[name]) !== expected
      || Object.hasOwn(metadata.scripts, `pre${name}`) || Object.hasOwn(metadata.scripts, `post${name}`)) fail('SOURCE_CHECK_RECIPE_CHANGED');
  }
  const command = (id, executable, args, extra = {}) => ({ id, kind: 'terminal-check', files: [], cwd: root,
    executable, args, reportPath: `${stem}-${id}.report.json`, deadlineMs: 900_000, environment: {}, ...extra });
  const script = (id, name, extra = {}) => command(id, tools.pnpm.path,
    ['--pm-on-fail=ignore', '--verify-deps-before-run=false', '--dir', root, 'run', name],
    { script: name, scriptSha256: SOURCE_CHECK_SCRIPTS[name], ...extra });
  return [command('scanner-regression', tools.node.path,
    ['--experimental-strip-types', join(root, 'scripts/verify-scanner-regression.ts'), tools.gitleaks.path]),
  command('source-secrets', tools.gitleaks.path, ['git', '--config', join(root, '.gitleaks.toml'), '--redact', '--no-banner',
    '--log-opts=HEAD', '--report-format=json', `--report-path=${stem}-source-secrets.report.json`, root], { kind: 'gitleaks-json' }),
  script('source-licenses', 'verify:licenses'), script('source-runtime-assets', 'verify:runtime-assets'),
  script('source-file-sizes', 'verify:file-sizes'), script('source-sealed-launch', 'verify:sealed-launch'),
  script('root-types', 'typecheck'),
  script('production-build-default', 'build', { buildVariant: 'default' }),
  script('production-build-github-pages', 'build', { buildVariant: 'github-pages', environment: { GITHUB_PAGES: 'true' } }),
  script('production-build-canonical-pages', 'build', { buildVariant: 'canonical-pages', environment: { GITHUB_PAGES: 'true', DEPLOY_BASE: '/' } })];
}
export function captureNativeSourceCheckConfiguration(root) {
  if (typeof root !== 'string' || resolve(root) !== root || fs.realpathSync(root) !== root) fail('ROOT_INVALID');
  // Vite loads these ignored files independently of child process.env. Check names only;
  // verification must not read secrets or silently include ambient production settings.
  const absentPaths = ['.env', '.env.local', '.env.production', '.env.production.local', '.npmrc', '.pnpmfile.cjs',
    'node_modules/.bin/node'].map(path => join(root, path));
  for (let parent = dirname(root); ; parent = dirname(parent)) {
    for (const name of ['.npmrc', '.pnpmfile.cjs', 'pnpm-workspace.yaml']) absentPaths.push(join(parent, name));
    if (parent === dirname(parent)) break;
  }
  absentPaths.push('/etc/npmrc', '/etc/pnpmrc', '/nonexistent/.npmrc',
    '/nonexistent/.config/pnpm/config.yaml', '/nonexistent/.config/pnpm/auth.ini');
  for (const path of absentPaths) {
    try { fs.lstatSync(path); fail('AMBIENT_BUILD_CONFIGURATION'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const path = join(root, 'pnpm-workspace.yaml');
  let exists = true;
  try { fs.lstatSync(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (!exists) return { absentPaths, workspace: { path, present: false } };
  const workspace = read(path);
  // Only these reviewed noninstalling configs are supported. Arbitrary YAML may
  // introduce configDependencies/hooks before the run handler's no-install flag.
  if (!['9a2fbc5c71133f43a167a90faa705b7c5e29c105f9b816f6b828cbe25a839498',
    sha(Buffer.from('allowBuilds: {}\n'))].includes(workspace.sha256)) fail('WORKSPACE_CONFIGURATION_UNSUPPORTED');
  return { absentPaths, workspace: { path, present: true, sha256: workspace.sha256, identity: workspace.identity, bytes: workspace.body.length } };
}
function sourceCheckInputs(root, inputs) {
  const tools = { closedBuildConfiguration: captureNativeSourceCheckConfiguration(root) };
  tools.pnpmBuiltinConfiguration = installedTool(join(dirname(inputs.pnpmInputs.runtime.path), 'pnpmrc')).fact;
  if (tools.pnpmBuiltinConfiguration.sha256 !== '6985e6e532eed7e6fd69a7d560ac5a5753d74a9f9709627092d5be02afddd84e') fail('PNPM_CONFIGURATION_INVALID');
  for (const [key, path, name] of [['typescript', 'node_modules/typescript/bin/tsc', 'typescript'],
    ['vite', 'node_modules/vite/bin/vite.js', 'vite'], ['rootTsx', 'node_modules/tsx/dist/cli.mjs', 'tsx']]) {
    const entry = installedTool(join(root, path)), metadata = installedTool(join(root, `node_modules/${name}/package.json`));
    const declared = JSON.parse(read(join(root, 'package.json')).body).devDependencies[name];
    const lock = JSON.parse(read(join(root, 'package-lock.json')).body).packages[`node_modules/${name}`];
    if (JSON.parse(metadata.body).name !== name || JSON.parse(metadata.body).version !== declared || lock?.version !== declared) fail('INSTALLED_PACKAGE_MISMATCH');
    tools[key] = entry.fact; tools[`${key}Package`] = metadata.fact;
    // Script launchers resolve these exact existing bin links; never execute a different PATH tool.
    const bin = name === 'typescript' ? 'tsc' : name === 'tsx' ? 'tsx' : 'vite';
    if (fs.realpathSync(join(root, 'node_modules/.bin', bin)) !== entry.fact.path) fail('INSTALLED_BIN_MISMATCH');
  }
  tools.typescriptLoader = installedTool(join(root, 'node_modules/typescript/lib/tsc.js')).fact;
  tools.typescriptNative = installedTool(join(root, 'node_modules/@typescript/typescript-linux-x64/lib/tsc')).fact;
  // This preexisting system binary is independently hash-pinned, not chowned or installed by verification.
  tools.gitleaks = installedTool('/usr/bin/gitleaks', 1, 501).fact;
  if (tools.gitleaks.sha256 !== GITLEAKS_SHA256) fail('GITLEAKS_PREREQUISITE_INVALID');
  nativeSourceCheckCommands(root, { ...inputs, ...tools }, join(root, 'artifacts/qa/recipe-check'), read(join(root, 'package.json')).body);
  return { ...inputs, ...tools };
}
export function createNativeSourceChecksPlan(planPath) {
  const root = nativeRoot(), source = sourceSnapshot(root), tools = sourceCheckInputs(root, inputFacts(root));
  const plan = { schemaVersion: 1, profile: NATIVE_SOURCE_CHECKS_PROFILE, source, tools, repositoryRoot: root,
    productionAuthorized: false, completeCoverage: false, implementedDomains: SOURCE_CHECK_DOMAINS,
    requiredDomains: REQUIRED_NATIVE_DOMAINS,
    scope: 'Fixed source-policy subset, build-mode root types and three production builds. pnpm script execution; no npm install/audit/signature provenance, full tests, services or release authority.' };
  same(sourceSnapshot(root), source);
  return output(root, planPath, json(plan));
}
export function createNativeVerificationPlan(planPath) {
  const root = nativeRoot(), source = sourceSnapshot(root);
  const partitions = deriveNativeTestPartitions(source.files.map(file => file.path), read(join(root, 'vite.config.ts')).body,
    read(join(root, 'spacetimedb/package.json')).body);
  const plan = { schemaVersion: 1, profile: NATIVE_VERIFICATION_PROFILE, source, partitions, tools: inputFacts(root),
    repositoryRoot: root, productionAuthorized: false, completeCoverage: false,
    implementedDomains: IMPLEMENTED_DOMAINS, requiredDomains: REQUIRED_NATIVE_DOMAINS };
  same(sourceSnapshot(root), source);
  return output(root, planPath, json(plan));
}
function processGroup(pid) {
  try { const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/u)[2]); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; }
}
function groupMembers(pgid) {
  const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), result = [];
  for (const name of fs.readdirSync('/proc').filter(value => /^[1-9][0-9]*$/u.test(value))) {
    let text;
    try { text = fs.readFileSync(`/proc/${name}/stat`, 'utf8'); }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
    const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/u);
    // Root-owned namespace launchers are still group members even when kill(0) returns EPERM.
    if (Number(fields[2]) === pgid) {
      if (!/^[0-9]+$/u.test(fields[19] ?? '') || result.length >= 1024) fail('GROUP_UNBOUNDED');
      result.push({ pid: Number(name), pgid, identity: `linux-v1:${boot}:${fields[19]}` });
    }
  }
  return result.sort((a, b) => a.pid - b.pid);
}
function ownedNamespaceProcess(owner, pid, expectedIdentity) {
  if (fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() !== owner.bootId) fail('OWNER_CHANGED');
  let text;
  try { text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return { state: 'absent', scope: 'owned-namespace-proc-only' }; throw error; }
  const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/u);
  if (!/^[0-9]+$/u.test(fields[19] ?? '') || !Number.isSafeInteger(Number(fields[2]))) fail('CHILD_IDENTITY_CHANGED');
  const actual = { identity: `linux-v1:${owner.bootId}:${fields[19]}`, pgid: Number(fields[2]), scope: 'owned-namespace-proc-only' };
  if (expectedIdentity && actual.identity !== expectedIdentity) return { ...actual, state: 'absent', pidReused: true };
  if (actual.pgid !== owner.pgid) fail('CHILD_GROUP_CHANGED');
  return { ...actual, state: 'present' };
}
async function boundedTerminal(closed, milliseconds, extra) {
  let timer;
  try { return await Promise.race([closed, ...(extra ? [extra] : []), new Promise(done => { timer = setTimeout(() => done(null), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function observeOutputBounds(paths) {
  let timer, stopped = false;
  const exceeded = new Promise(done => {
    const inspect = () => {
      if (stopped) return;
      for (const path of paths) {
        try {
          const stat = fs.lstatSync(path);
          if (stat.size > MAX_BYTES) { stopped = true; done({ outputBoundExceeded: path }); return; }
        } catch (error) { stopped = true; done({ outputObservationFailed: error.code ?? 'STAT_FAILED' }); return; }
      }
    };
    timer = setInterval(inspect, 100); inspect();
  });
  return { exceeded, stop: () => { stopped = true; clearInterval(timer); } };
}
function captureBounded(stream, descriptor, path, rejectOutput) {
  let bytes = 0, failed = false;
  stream.on('data', chunk => {
    if (failed) return;
    try {
      const count = Math.min(chunk.length, MAX_BYTES - bytes);
      for (let offset = 0; offset < count;) {
        const written = fs.writeSync(descriptor, chunk, offset, count - offset);
        if (written < 1) fail('OUTPUT_WRITE_FAILED');
        offset += written;
      }
      bytes += count;
      if (count !== chunk.length) { failed = true; rejectOutput({ outputBoundExceeded: path, truncated: true }); }
    } catch (error) { failed = true; rejectOutput({ outputCaptureFailed: error.code ?? 'WRITE_FAILED', path }); }
  });
  stream.on('error', error => rejectOutput({ outputCaptureFailed: error.code ?? 'STREAM_FAILED', path }));
}
function retainedOutput(root, path) {
  try { return artifact(root, path); }
  catch (error) {
    // A rejected oversized/changed file stays retained. Never label its unverified bytes a report.
    const stat = fs.lstatSync(path, { bigint: true });
    return { path, bytes: String(stat.size), sha256: null, identity: identity(stat), readFailure: String(error.code ?? error.message).slice(0, 160) };
  }
}
/** Exact owned namespace cleanup request; the privileged helper revalidates every identity. */
export function nativeNamespaceCleanupCommand(root, owner, member, signal) {
  const birth = /^linux-v1:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):(0|[1-9][0-9]{0,19})$/u;
  const ownerBirth = birth.exec(owner?.identity ?? ''), memberBirth = birth.exec(member?.identity ?? '');
  const positive = value => Number.isSafeInteger(value) && value > 0;
  if (typeof root !== 'string' || !root.startsWith('/') || /[\\\x00-\x1f]/u.test(root)
    || root.split('/').slice(1).some(part => ['', '.', '..'].includes(part))
    || !positive(owner?.uid) || !positive(owner?.gid) || !positive(owner?.pid)
    || owner.pgid !== owner.pid || !positive(member?.pid) || member.pid === owner.pid
    || member.pgid !== owner.pgid || !ownerBirth || !memberBirth
    || ownerBirth[1] !== owner.bootId || memberBirth[1] !== owner.bootId
    || !['SIGTERM', 'SIGKILL'].includes(signal)) fail('NAMESPACE_CLEANUP_IDENTITY_INVALID');
  return { executable: '/usr/bin/sudo', args: ['-n', '/bin/bash', `${root}/scripts/test-sealed-realms-existing-update-linux.sh`,
    '--cleanup', String(owner.uid), String(owner.gid), root, String(owner.pid), String(owner.pgid),
    owner.identity, String(member.pid), member.identity, signal] };
}
function signalNamespaceMember(root, owner, member, signal, cleanupAttempts, signals) {
  const command = nativeNamespaceCleanupCommand(root, owner, member, signal), startedAt = new Date().toISOString();
  const result = cp.spawnSync(command.executable, command.args, { cwd: root, env: environment(), shell: false,
    timeout: 5_000, maxBuffer: 16 * 1024 });
  const attempt = { command, member, signal, startedAt, finishedAt: new Date().toISOString(),
    pid: result.pid ?? null, terminal: { exitCode: result.status, signal: result.signal,
      error: result.error?.code ?? null }, stdout: result.stdout?.toString() ?? '', stderr: result.stderr?.toString() ?? '' };
  cleanupAttempts.push(attempt);
  if (result.error || result.status !== 0 || result.signal !== null || result.stderr.length) fail('NAMESPACE_CLEANUP_FAILED');
  let acknowledgement;
  try { acknowledgement = JSON.parse(result.stdout); } catch { fail('NAMESPACE_CLEANUP_ACK_INVALID'); }
  if (acknowledgement.profile !== 'warpkeep-owned-namespace-cleanup-v1'
    || acknowledgement.owner?.pid !== owner.pid || acknowledgement.owner.pgid !== owner.pgid
    || acknowledgement.owner.identity !== owner.identity || acknowledgement.owner.uid !== owner.uid
    || acknowledgement.owner.gid !== owner.gid || acknowledgement.target?.pid !== member.pid
    || acknowledgement.target.identity !== member.identity || acknowledgement.target.pgid !== owner.pgid
    || acknowledgement.signal !== signal || !['signaled', 'absent'].includes(acknowledgement.status)
    || !Number.isSafeInteger(acknowledgement.actor?.pid) || acknowledgement.actor.pid < 1
    || acknowledgement.actor.pgid !== owner.pgid || !acknowledgement.actor.identity?.startsWith(`linux-v1:${owner.bootId}:`)) fail('NAMESPACE_CLEANUP_ACK_INVALID');
  attempt.acknowledgement = acknowledgement;
  if (acknowledgement.status === 'signaled') signals.push({ ...member, signal, method: 'privileged-pidfd' });
}
async function waitForOwnedGroup(owner, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (true) {
    if (fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() !== owner.bootId) fail('OWNER_CHANGED');
    if (groupMembers(owner.pgid).every(member => member.pid === owner.pid)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(done => setTimeout(done, 25));
  }
}
async function cleanupOwnedChildren(root, owner, closed, signals, cleanupAttempts, command) {
  const deadline = Date.now() + 30_000;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const actualOwner = probeProductionAdminProcessIdentity(owner.pid, owner.identity);
    if (actualOwner.state !== 'present' || actualOwner.identity !== owner.identity) fail('OWNER_CHANGED');
    for (const member of groupMembers(owner.pgid).filter(item => item.pid !== owner.pid).reverse()) {
      if (Date.now() + 5_000 > deadline) fail('CLEANUP_DEADLINE');
      if (command.id === 'namespace-tests') {
        // kill(0) is ambiguous for root-owned sudo/unshare descendants. The root pidfd caller validates them.
        signalNamespaceMember(root, owner, member, signal, cleanupAttempts, signals);
        continue;
      }
      const actual = probeProductionAdminProcessIdentity(member.pid, member.identity);
      if (actual.state !== 'present' || actual.identity !== member.identity || processGroup(member.pid) !== owner.pgid) fail('CHILD_IDENTITY_CHANGED');
      try { process.kill(member.pid, signal); signals.push({ ...member, signal }); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const terminal = await boundedTerminal(closed, Math.min(5_000, Math.max(0, deadline - Date.now())));
    if (await waitForOwnedGroup(owner, Math.min(5_000, Math.max(0, deadline - Date.now()))) && terminal) return terminal;
  }
  return await boundedTerminal(closed, Math.min(5_000, Math.max(0, deadline - Date.now())));
}
export async function runNativeVerificationPlan(planPath, digest, stem) {
  const root = nativeRoot();
  if (!HEX64.test(digest)) fail('PLAN_DIGEST_INVALID');
  const planRef = artifact(root, planPath, digest), plan = JSON.parse(read(planRef.path).body), source = sourceSnapshot(root);
  const checks = plan.profile === NATIVE_SOURCE_CHECKS_PROFILE;
  const partitions = checks ? null : deriveNativeTestPartitions(source.files.map(file => file.path), read(join(root, 'vite.config.ts')).body,
    read(join(root, 'spacetimedb/package.json')).body);
  const domains = checks ? SOURCE_CHECK_DOMAINS : IMPLEMENTED_DOMAINS;
  const currentTools = () => checks ? sourceCheckInputs(root, inputFacts(root)) : inputFacts(root);
  if (![NATIVE_VERIFICATION_PROFILE, NATIVE_SOURCE_CHECKS_PROFILE].includes(plan.profile) || plan.schemaVersion !== 1 || plan.repositoryRoot !== root
    || plan.productionAuthorized !== false || plan.completeCoverage !== false) fail('PLAN_INVALID');
  same(plan.source, source);
  if (!checks) same(plan.partitions, partitions);
  else if (Object.hasOwn(plan, 'partitions')) fail('PLAN_INVALID');
  same(plan.tools, currentTools());
  same(plan.implementedDomains, domains); same(plan.requiredDomains, REQUIRED_NATIVE_DOMAINS);
  const actor = probeProductionAdminProcessIdentity(process.pid), owner = { pid: process.pid, pgid: process.pid,
    uid: process.getuid(), gid: process.getgid(), identity: actor.identity,
    bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() };
  if (actor.state !== 'present' || processGroup(process.pid) !== process.pid || groupMembers(process.pid).length !== 1) fail('EXCLUSIVE_SESSION_REQUIRED');
  stem = resolve(stem);
  const commands = checks ? nativeSourceCheckCommands(root, plan.tools, stem, read(join(root, 'package.json')).body)
    : nativeTestCommands(root, partitions, plan.tools, stem), reserved = new Map();
  // Reserve all owned artifacts before launching any child.
  for (const path of [`${stem}-summary.json`, ...commands.flatMap(command => [command.reportPath,
    `${stem}-${command.id}.stdout.log`, `${stem}-${command.id}.stderr.log`, `${stem}-${command.id}-started.json`, `${stem}-${command.id}-terminal.json`])]) {
    reserved.set(path, output(root, path, Buffer.alloc(0)));
  }
  const startedAt = new Date().toISOString(), results = [];
  output(root, `${stem}-started.json`, json({ profile: plan.profile, planRef, owner, source, commands, startedAt }));
  let preservationError = null;
  for (const command of commands) {
    const stdoutPath = command.kind === 'node-events' ? command.reportPath : `${stem}-${command.id}.stdout.log`;
    const stderrPath = `${stem}-${command.id}.stderr.log`, stdout = fs.openSync(stdoutPath, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW),
      stderr = fs.openSync(stderrPath, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
    let child, birth, closed, terminal, timedOut = false, phaseError = null, cleanupError = null, outputFailure = null, outputWatch, unexpectedGroup = null;
    let rejectOutput;
    const streamFailure = new Promise(done => { rejectOutput = done; });
    const signals = [], cleanupAttempts = [], childStartedAt = new Date().toISOString();
    try {
      child = cp.spawn(command.executable, command.args, { cwd: command.cwd, env: { ...environment(plan.tools), ...command.environment }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      closed = new Promise(done => { child.once('error', error => done({ exitCode: null, signal: null, spawnError: error.code ?? 'SPAWN_ERROR' }));
        child.once('close', (exitCode, signal) => done({ exitCode, signal, spawnError: null })); });
      captureBounded(child.stdout, stdout, stdoutPath, rejectOutput);
      captureBounded(child.stderr, stderr, stderrPath, rejectOutput);
      outputWatch = observeOutputBounds([command.reportPath, stdoutPath, stderrPath]);
      birth = child.pid ? probeProductionAdminProcessIdentity(child.pid) : { state: 'absent' };
      if (child.pid && command.id === 'namespace-tests' && birth.state === 'ambiguous') {
        // An actual spawned sudo PID in this private session may be root-owned. This is birth observation, not signal permission.
        birth = ownedNamespaceProcess(owner, child.pid);
      }
      writeReserved(root, `${stem}-${command.id}-started.json`, json({ command, owner, childPid: child.pid ?? null,
        childIdentity: birth.identity ?? null, childPgid: child.pid ? processGroup(child.pid) : null,
        childObservationScope: birth.scope ?? 'production-admin-process-probe', startedAt: childStartedAt }), reserved.get(`${stem}-${command.id}-started.json`));
      terminal = await boundedTerminal(closed, command.deadlineMs, Promise.race([outputWatch.exceeded, streamFailure]));
      if (terminal?.outputBoundExceeded || terminal?.outputObservationFailed || terminal?.outputCaptureFailed) {
        outputFailure = terminal; terminal = await cleanupOwnedChildren(root, owner, closed, signals, cleanupAttempts, command);
      } else if (!terminal) { timedOut = true; terminal = await cleanupOwnedChildren(root, owner, closed, signals, cleanupAttempts, command); }
      else if (groupMembers(owner.pgid).some(member => member.pid !== owner.pid)) {
        // A closed launcher must not abandon descendants. Preserve this original failure even after successful cleanup.
        unexpectedGroup = groupMembers(owner.pgid);
        terminal = await cleanupOwnedChildren(root, owner, closed, signals, cleanupAttempts, command);
      }
    } catch (error) {
      phaseError = String(error.message).slice(0, 160);
      if (closed) try { terminal = await cleanupOwnedChildren(root, owner, closed, signals, cleanupAttempts, command); }
      catch (cleanup) { cleanupError = String(cleanup.message).slice(0, 160); }
    } finally {
      outputWatch?.stop();
      // An ambiguous failed child is never signaled further; close our owned pipes and retain the remaining-group failure.
      if (!terminal || phaseError || cleanupError) { child?.stdout?.destroy(); child?.stderr?.destroy(); }
      fs.closeSync(stdout); fs.closeSync(stderr);
    }
    const absence = child?.pid && birth?.state === 'present' ? (command.id === 'namespace-tests'
      ? ownedNamespaceProcess(owner, child.pid, birth.identity) : probeProductionAdminProcessIdentity(child.pid, birth.identity)) : null;
    const absent = absence?.state === 'absent';
    let parsed = null, reportFailure = null;
    try {
      if (command.kind === 'terminal-check') {
        const terminalRecorded = Boolean(terminal && Number.isSafeInteger(terminal.exitCode) && terminal.exitCode >= 0
          && terminal.signal === null && terminal.spawnError === null && !timedOut && !phaseError && !cleanupError && !outputFailure && !unexpectedGroup);
        const buildOutput = terminalRecorded && terminal.exitCode === 0 && absent
          && groupMembers(owner.pgid).length === 1 && command.buildVariant ? captureNativeBuildOutput(root, command.buildVariant) : null;
        parsed = { complete: terminalRecorded, success: terminalRecorded && terminal.exitCode === 0, terminal, buildOutput,
          scope: 'Producer-owned actual terminal and bounded raw output; complete fixed command, not a test count or CI proof.' };
        writeReserved(root, command.reportPath, json(parsed), reserved.get(command.reportPath));
      } else if (command.kind === 'gitleaks-json') {
        const findings = JSON.parse(read(command.reportPath).body);
        if (!Array.isArray(findings)) fail('SCANNER_REPORT_INVALID');
        parsed = { complete: true, success: findings.length === 0, findingsCount: findings.length,
          scope: 'Actual Gitleaks full HEAD-reachable source report; terminal status remains independently required.' };
      } else parsed = (command.kind === 'vitest-json' ? parseVitestReport : parseNodeEvents)
        (read(command.reportPath).body, { repositoryRoot: root, expectedFiles: command.files });
    }
    catch (error) { reportFailure = String(error.message).slice(0, 160); }
    const result = { command, child: { pid: child?.pid ?? null, identity: birth?.identity ?? null,
      observationScope: birth?.scope ?? 'production-admin-process-probe', absence, absent: Boolean(absent) },
      startedAt: childStartedAt, finishedAt: new Date().toISOString(), terminal: terminal ?? null, timedOut, phaseError, cleanupError, outputFailure, unexpectedGroup, signals, cleanupAttempts,
      report: retainedOutput(root, command.reportPath), stdout: retainedOutput(root, stdoutPath), stderr: retainedOutput(root, stderrPath), parsed, reportFailure,
      remainingGroup: groupMembers(owner.pgid) };
    result.completed = !phaseError && !cleanupError && !outputFailure && !unexpectedGroup && !timedOut && terminal?.signal === null && terminal.spawnError === null
      && (checks ? Number.isSafeInteger(terminal.exitCode) && terminal.exitCode >= 0 : [0, 1].includes(terminal.exitCode))
      && absent && result.remainingGroup.length === 1 && parsed?.complete === true;
    result.passed = result.completed && terminal.exitCode === 0 && parsed.success === true;
    result.stderrScope = 'Raw bytes retained; ordinary Verify does not require an empty console stream. Exit/report failures remain separate. No full-profile warning disposition exists yet.';
    results.push(result);
    writeReserved(root, `${stem}-${command.id}-terminal.json`, json(result), reserved.get(`${stem}-${command.id}-terminal.json`));
    try { same(sourceSnapshot(root), source); same(currentTools(), plan.tools); }
    catch (error) { preservationError = String(error.message).slice(0, 160); break; }
    if (!result.completed || groupMembers(owner.pgid).length !== 1) break;
  }
  const allRecorded = !preservationError && results.length === commands.length && results.every(result => result.completed);
  const allChecksPassed = allRecorded && results.every(result => result.passed);
  const summary = { schemaVersion: 1, profile: plan.profile, status: allRecorded ? 'native-verification-recorded' : 'native-verification-failed',
    repositoryRoot: root, planRef, source, sourceAfter: preservationError ? null : source, owner, startedAt, finishedAt: new Date().toISOString(),
    results, preservationError, implementedDomains: domains, requiredDomains: REQUIRED_NATIVE_DOMAINS,
    missingDomains: REQUIRED_NATIVE_DOMAINS.filter(domain => !domains.includes(domain)),
    completeCoverage: false, productionAuthorized: false, allRecorded, allChecksPassed, allTestsPassed: !checks && allChecksPassed,
    pending: ['Source-owned skipped-case dispositions and complete installed dependency attestation.',
      'Fresh accepted-main/signature transport and independent post-outer whole-group absence.',
      'Local inode/index/ref preservation is not portable proof for a different Actions checkout; authenticated intrinsic commit/tree/blob/recipe transport remains unimplemented.',
      'Remaining fixed verification domains; genuine hosted dispatch/OIDC remains separate.',
      ...(checks ? ['Source-policy subset uses pnpm to execute exact existing scripts; npm install/audit/signature provenance and complete installed dependency bytes remain uncovered.'] : [])],
    outputPolicy: 'Owned stdout/stderr are hard-limited to64MiB each. Vitest external JSON output is monitored every100ms against64MiB; a single JSON write can cross that observation limit. Any breach triggers bounded owned-child cleanup and remains rejected evidence.' };
  const body = json(summary);
  writeReserved(root, `${stem}-summary.json`, body, reserved.get(`${stem}-summary.json`));
  const published = output(root, join(root, 'artifacts', 'qa', `native-source-verification-${sha(body)}.json`), body);
  return { path: published.path, sha256: published.sha256, allRecorded, allChecksPassed, allTestsPassed: summary.allTestsPassed,
    completeCoverage: false, productionAuthorized: false };
}

/** Fixed artifact ingestion seam. No receipt from this incomplete producer can mint source authority. */
export function requireCompleteNativeSourceVerificationEvidence(locator, commit) {
  if (typeof locator !== 'string' || !HEX64.test(locator) || typeof commit !== 'string' || !HEX40.test(commit)) fail('EVIDENCE_LOCATOR_INVALID');
  const root = resolve(process.cwd());
  if (fs.realpathSync(root) !== root) fail('ROOT_INVALID');
  const reference = artifact(root, join(root, 'artifacts', 'qa', `native-source-verification-${locator}.json`), locator);
  const receipt = JSON.parse(read(reference.path).body);
  if (receipt.schemaVersion !== 1 || ![NATIVE_VERIFICATION_PROFILE, NATIVE_SOURCE_CHECKS_PROFILE].includes(receipt.profile)
    || receipt.repositoryRoot !== root || receipt.source?.sourceCommit !== commit) fail('EVIDENCE_SOURCE_INVALID');
  // Do not accept echoed exit codes, coverage booleans or invented future domains.
  // The full authenticated producer/persistence and accepted-main profile do not exist yet.
  fail('INCOMPLETE');
}
