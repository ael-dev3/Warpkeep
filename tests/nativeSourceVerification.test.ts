// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import {
  deriveNativeTestPartitions, deriveNativeOrdinaryTestBatches, nativeTestCommands, NAMESPACE_FILES, REQUIRED_NATIVE_DOMAINS,
  NATIVE_VERIFICATION_PROFILE, NATIVE_SOURCE_CHECKS_PROFILE, nativeSourceCheckCommands,
  captureNativeSourceCheckConfiguration,
  captureNativeServiceConfiguration,
  nativeVerificationEnvironment, nativeOrdinaryTestEnvironment, NATIVE_NAMESPACE_LAUNCHER_PATH,
  retainNativeVerificationOutput,
  requireCompleteNativeSourceVerificationEvidence, nativeNamespaceCleanupCommand,
} from '../scripts/native-source-verification.mjs';
import { parseVitestReport, parseNodeEvents } from '../scripts/native-source-verification-reports.mjs';
import reporter from '../scripts/native-source-verification-node-reporter.mjs';
import { requireCompleteNativeSourceVerificationEvidence as inertEvidenceReader } from '../scripts/native-source-verification-evidence.mjs';
import { NATIVE_SERVICE_CHECKS_PROFILE } from '../scripts/native-source-verification-services.mjs';

const repository = process.cwd();
const folders: string[] = [];
const vite = "test: { include: ['tests/**/*.{test,spec}.{ts,tsx}'] }";
const packageBytes = JSON.stringify({ scripts: { 'test:pure': 'tsx --test tests/*.test.ts' } });
const isolatedOrdinaryFiles = ['tests/authBridgeNotificationPreparedWorkflow.test.ts',
  'tests/productionPlayerCanaryClosure.test.ts', 'tests/greaterRealmRuntimeRelease.test.ts',
  'tests/sealedRealmsProductionActivationRecords.test.ts'];
const source = ['tests/ordinary.test.ts', 'tests/nested/other.spec.tsx', 'src/untested.ts',
  'spacetimedb/tests/first.test.ts', 'spacetimedb/tests/second.test.ts', ...NAMESPACE_FILES, ...isolatedOrdinaryFiles];
const tools = { node: { path: '/native/node' }, vitest: { path: '/installed/vitest.mjs' }, tsx: { path: '/installed/tsx.mjs' }, namespaceLauncher: { path: NATIVE_NAMESPACE_LAUNCHER_PATH } };
const fixtureRoot = '/repo', fixtureFile = 'tests/fixture.test.mjs';
const scope = { repositoryRoot: fixtureRoot, expectedFiles: [fixtureFile] };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

afterEach(() => {
  process.chdir(repository);
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: false });
});

describe.skipIf(process.platform !== 'linux' || process.getuid?.() !== 1000)('native source-check configuration inventory', () => {
  it('allows genuine fixture replacement objects while strict source Git reads keep the original object', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-replacement-')); folders.push(root);
    const ordinary = nativeOrdinaryTestEnvironment();
    const git = (args: string[], env = ordinary) => {
      const result = spawnSync('/usr/bin/git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture',
        '-c', 'user.email=fixture@local.invalid', ...args], { cwd: root, env, shell: false,
        encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.signal).toBeNull();
      expect(result.stderr).toBe('');
      return result.stdout.trim();
    };
    git(['init', '--quiet', '--initial-branch=main']);
    writeFileSync(join(root, 'fixture.txt'), 'original bytes\n');
    git(['add', 'fixture.txt']); git(['commit', '--quiet', '-m', 'Original fixture']);
    const original = git(['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'fixture.txt'), 'replacement bytes\n');
    git(['add', 'fixture.txt']); git(['commit', '--quiet', '-m', 'Replacement fixture']);
    git(['replace', original, git(['rev-parse', 'HEAD'])]);
    expect(git(['show', `${original}:fixture.txt`])).toBe('replacement bytes');
    expect(git(['show', `${original}:fixture.txt`], nativeVerificationEnvironment())).toBe('original bytes');
  }, 30_000);
  it('executes the actual fixed type script with pnpm while missing dependencies remain uninstalled', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-pnpm-')); folders.push(root);
    const packageSource = readFileSync(join(repository, 'package.json'));
    writeFileSync(join(root, 'package.json'), packageSource, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(root, 'proof.ts'), 'export const verified: boolean = true;\n', { flag: 'wx', mode: 0o600 });
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, types: [], skipLibCheck: true }, files: ['proof.ts'] }), { flag: 'wx', mode: 0o600 });
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true, mode: 0o700 });
    symlinkSync(join(repository, 'node_modules/typescript/bin/tsc'), join(root, 'node_modules/.bin/tsc'));
    const manifest = JSON.parse(readFileSync(join(repository, 'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json'), 'utf8'));
    const tools = { node: { path: process.execPath }, pnpm: { path: manifest.pnpmExecutable },
      gitleaks: { path: '/usr/bin/gitleaks' }, spacetime: { path: '/unused/spacetime' } };
    const command = nativeSourceCheckCommands(root, tools, join(root, 'report'), packageSource).find(value => value.id === 'root-types')!;
    const env = nativeVerificationEnvironment(tools);
    expect(env.pnpm_config_verify_deps_before_run).toBeUndefined();
    const result = spawnSync(command.executable, [...command.args], { cwd: root, env, shell: false, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.status).toBe(0);
    writeFileSync(join(root, 'proof.ts'), 'export const verified: boolean = "invalid";\n');
    const invalid = spawnSync(command.executable, [...command.args], { cwd: root, env, shell: false, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
    expect(invalid.error).toBeUndefined(); expect(invalid.signal).toBeNull(); expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).toContain('TS2322');
    expect(readdirSync(join(root, 'node_modules'))).toEqual(['.bin']);
    expect(readFileSync(join(root, 'package.json'))).toEqual(packageSource);
    for (const name of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'package-lock.json']) expect(existsSync(join(root, name))).toBe(false);
  });
  it('retains a missing owned report as failure metadata instead of losing the run summary', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-missing-')); folders.push(root);
    mkdirSync(join(root, 'artifacts/qa'), { recursive: true, mode: 0o700 });
    const path = join(root, 'artifacts/qa/deleted-report.json');
    expect(retainNativeVerificationOutput(root, path)).toEqual({ path, bytes: null, sha256: null,
      identity: null, missing: true, readFailure: 'ENOENT' });
    expect(() => retainNativeVerificationOutput(root, join(root, 'outside.json'))).toThrow('ARTIFACT_PATH_INVALID');
  });
  it('collects a genuine full-HEAD scanner stdout report under the closed Git environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-scanner-')); folders.push(root);
    const env = nativeVerificationEnvironment({ pnpm: { path: '/unused/pnpm' }, spacetime: { path: '/unused/spacetime' } });
    expect(env.GIT_GRAFT_FILE).toBe('/dev/null');
    expect([env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0]).toEqual(['advice.graftFileDeprecated', 'false']);
    expect(env.HOME).toBe('/nonexistent');
    expect(env.NODE_OPTIONS).toBeUndefined();
    for (const args of [['init', '--initial-branch=main'], ['-c', 'user.name=Warpkeep scanner fixture',
      '-c', 'user.email=scanner-fixture@local.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Empty scanner fixture']]) {
      const result = spawnSync('/usr/bin/git', args, { cwd: root, env, shell: false, encoding: 'utf8', timeout: 15_000 });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.signal).toBeNull();
    }
    writeFileSync(join(root, '.gitleaks.toml'), readFileSync(join(repository, '.gitleaks.toml')), { flag: 'wx', mode: 0o600 });
    const command = nativeSourceCheckCommands(root, { node: { path: process.execPath }, pnpm: { path: '/unused/pnpm' },
      gitleaks: { path: '/usr/bin/gitleaks' } }, join(root, 'report'), readFileSync(join(repository, 'package.json')))[1];
    const result = spawnSync(command.executable, [...command.args], { cwd: root, env, shell: false, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expect(result.stderr).not.toContain('grafts is deprecated');
  });
  it('holds an absent workspace config without requiring or creating it', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-config-')); folders.push(root);
    const result = captureNativeSourceCheckConfiguration(root);
    expect(result.workspace).toEqual({ path: join(root, 'pnpm-workspace.yaml'), present: false });
    expect(result.absentPaths).toContain(join(root, '.env.production.local'));
    expect(captureNativeSourceCheckConfiguration(root)).toEqual(result);
  });
  it('refuses service credential files and a Node executable shadowing the attested runtime', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-service-config-')); folders.push(root);
    for (const service of ['auth-bridge', 'release-recovery']) mkdirSync(join(root, 'services', service, 'node_modules/.bin'), { recursive: true, mode: 0o700 });
    // Native checkout keeps a tracked root example. Neither fixed service
    // mode loads it; malformed unreadable bytes must not become execution input.
    writeFileSync(join(root, '.env.example'), Buffer.from([0xff, 0x00]), { flag: 'wx', mode: 0o000 });
    writeFileSync(join(root, 'services/auth-bridge/.dev.vars.example'), Buffer.from([0xff, 0x00]), { flag: 'wx', mode: 0o000 });
    const initial = captureNativeServiceConfiguration(root);
    expect(initial.absentPaths).not.toContain(join(root, '.env.example'));
    expect(initial.absentPaths).not.toContain(join(root, 'services/auth-bridge/.dev.vars.example'));
    expect(initial.absentPaths).toContain(join(root, 'services/auth-bridge/node_modules/.bin/node'));
    expect(captureNativeServiceConfiguration(root)).toEqual(initial);
    const nearExample = join(root, '.env.example.local');
    writeFileSync(nearExample, 'fixture only', { flag: 'wx', mode: 0o600 });
    expect(() => captureNativeServiceConfiguration(root)).toThrow('AMBIENT_SERVICE_CONFIGURATION');
    rmSync(nearExample);
    for (const service of ['auth-bridge', 'release-recovery']) {
      for (const name of ['.env.test', '.dev.vars', '.npmrc']) {
        const path = join(root, 'services', service, name);
        writeFileSync(path, 'fixture-only value', { flag: 'wx', mode: 0o600 });
        expect(() => captureNativeServiceConfiguration(root)).toThrow('AMBIENT_SERVICE_CONFIGURATION');
        rmSync(path);
      }
      const node = join(root, 'services', service, 'node_modules/.bin/node');
      symlinkSync(process.execPath, node);
      expect(() => captureNativeServiceConfiguration(root)).toThrow('SERVICE_NODE_SHADOWED');
      rmSync(node);
    }
  });
  it('binds actual ignored workspace bytes and rejects ambient Vite/package configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-native-config-')); folders.push(root);
    const workspace = join(root, 'pnpm-workspace.yaml'), body = Buffer.from('allowBuilds: {}\n');
    writeFileSync(workspace, body, { flag: 'wx', mode: 0o600 });
    const result = captureNativeSourceCheckConfiguration(root);
    expect(result.workspace.present).toBe(true);
    expect(result.workspace.sha256).toBe(digest(body));
    expect(result.workspace.bytes).toBe(body.length);
    expect(result.workspace.identity?.uid).toBe('1000');
    writeFileSync(workspace, 'allowBuilds: { esbuild: false }\n');
    expect(() => captureNativeSourceCheckConfiguration(root)).toThrow('WORKSPACE_CONFIGURATION_UNSUPPORTED');
    writeFileSync(workspace, 'configDependencies: { unreviewed: "1.0.0" }\n');
    expect(() => captureNativeSourceCheckConfiguration(root)).toThrow('WORKSPACE_CONFIGURATION_UNSUPPORTED');
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.npmrc', '.pnpmfile.cjs']) {
      const path = join(root, name); writeFileSync(path, 'fixture-only ambient configuration', { flag: 'wx', mode: 0o600 });
      expect(() => captureNativeSourceCheckConfiguration(root)).toThrow('AMBIENT_BUILD_CONFIGURATION');
      rmSync(path);
    }
  });
});

describe('native source test inventory and execution recipe', () => {
  it('separates ordinary fixture configuration from strict inspection without inheriting ambient variables', () => {
    const tools = { pnpm: { path: '/pinned/pnpm' }, spacetime: { path: '/pinned/spacetime' } };
    const strict = nativeVerificationEnvironment(tools), ordinary = nativeOrdinaryTestEnvironment(tools);
    expect(strict.HOME).toBe('/nonexistent');
    expect(strict.GIT_NO_REPLACE_OBJECTS).toBe('1'); expect(strict.GIT_GRAFT_FILE).toBe('/dev/null');
    expect(ordinary.HOME).toBe(userInfo().homedir);
    expect(ordinary.GIT_NO_REPLACE_OBJECTS).toBeUndefined(); expect(ordinary.GIT_GRAFT_FILE).toBeUndefined();
    expect(ordinary.GIT_OPTIONAL_LOCKS).toBe('0');
    expect(ordinary.SPACETIME_BIN).toBe('/pinned/spacetime');
    expect(Object.keys(ordinary).sort()).toEqual(Object.keys(strict)
      .filter(key => !['GIT_NO_REPLACE_OBJECTS', 'GIT_GRAFT_FILE'].includes(key)).sort());
    for (const [key, value] of Object.entries(strict)) {
      if (!['HOME', 'GIT_NO_REPLACE_OBJECTS', 'GIT_GRAFT_FILE'].includes(key)) expect(ordinary[key]).toBe(value);
    }
    for (const key of ['NODE_OPTIONS', 'GITHUB_TOKEN', 'GH_TOKEN', 'GIT_INDEX_FILE', 'CLOUDFLARE_API_TOKEN']) {
      expect(ordinary[key]).toBeUndefined(); expect(strict[key]).toBeUndefined();
    }
  });
  it('covers the exact disjoint ordinary/namespace union and every pure module file', () => {
    const result = deriveNativeTestPartitions(source, vite, packageBytes);
    expect(result.ordinaryVitestFiles).toEqual([...isolatedOrdinaryFiles, 'tests/nested/other.spec.tsx', 'tests/ordinary.test.ts'].sort());
    expect(result.namespaceVitestFiles).toEqual(NAMESPACE_FILES);
    expect(result.moduleFiles).toEqual(['spacetimedb/tests/first.test.ts', 'spacetimedb/tests/second.test.ts']);
    expect(new Set([...result.ordinaryVitestFiles, ...result.namespaceVitestFiles]).size).toBe(10);
    expect(result.ordinaryVitestFiles.some(file => NAMESPACE_FILES.includes(file))).toBe(false);
  });
  it.each(NAMESPACE_FILES)('refuses a source inventory missing required namespace file %s', file => {
    expect(() => deriveNativeTestPartitions(source.filter(value => value !== file), vite, packageBytes)).toThrow('NAMESPACE_INVENTORY_MISSING');
  });
  it('refuses duplicate, traversal and unsupported runner inventories', () => {
    for (const paths of [[...source, source[0]], [...source, 'tests/../outside.test.ts']]) {
      expect(() => deriveNativeTestPartitions(paths, vite, packageBytes)).toThrow('INVENTORY_INVALID');
    }
    for (const config of [vite.replace('{test,spec}', 'test'), `${vite}, include: ['other/**']`]) {
      expect(() => deriveNativeTestPartitions(source, config, packageBytes)).toThrow('RUNNER_CONFIG_CHANGED');
    }
    expect(() => deriveNativeTestPartitions(source, vite, JSON.stringify({ scripts: { 'test:pure': 'tsx --test --test-name-pattern=one tests/*.test.ts' } })))
      .toThrow('RUNNER_CONFIG_CHANGED');
  });
  it('refuses missing or substituted namespace launcher before any command can launch', () => {
    const partitions = deriveNativeTestPartitions(source, vite, packageBytes);
    for (const namespaceLauncher of [undefined, { path: '/repo/scripts/test-sealed-realms-existing-update-linux.sh' },
      { path: '/usr/local/libexec/another-helper.sh' }]) {
      expect(() => nativeTestCommands('/repo', partitions, { ...tools, namespaceLauncher } as never, '/repo/artifacts/qa/proof'))
        .toThrow('NAMESPACE_LAUNCHER_REQUIRED');
    }
  });
  it('uses exact isolated namespace/module runners and no test-name/shard filters', () => {
    const partitions = deriveNativeTestPartitions(source, vite, packageBytes);
    const commands = nativeTestCommands('/repo', partitions, tools, '/repo/artifacts/qa/proof');
    const ordinary = commands.filter(command => command.id.startsWith('ordinary-'));
    const namespace = commands.find(command => command.id === 'namespace-tests')!;
    const modules = commands.filter(command => command.kind === 'node-events');
    expect(commands).toHaveLength(8);
    expect(NATIVE_VERIFICATION_PROFILE).toBe('warpkeep-native-source-test-partitions-v1');
    expect(ordinary.flatMap(command => command.files).sort()).toEqual(partitions.ordinaryVitestFiles);
    for (const command of ordinary) {
      expect(command.args).toEqual(['/installed/vitest.mjs', 'run', ...command.files,
        '--maxWorkers=1', '--testTimeout=180000', '--no-cache', '--reporter=default', '--reporter=json',
        `--outputFile=${command.reportPath}`]);
      expect(command.reportPath).toBe(`/repo/artifacts/qa/proof-${command.id}.report.json`);
    }
    expect(namespace).toEqual({ id: 'namespace-tests', kind: 'vitest-json', files: [...NAMESPACE_FILES], cwd: '/repo',
      executable: '/usr/bin/sudo', args: ['-n', NATIVE_NAMESPACE_LAUNCHER_PATH, '--as',
        String(process.getuid?.()), String(process.getgid?.()), '/native/node', '/repo',
        '--report-json', '/repo/artifacts/qa/proof-namespace-tests.report.json'],
      reportPath: '/repo/artifacts/qa/proof-namespace-tests.report.json', deadlineMs: 900_000 });
    expect(commands.flatMap(command => command.args).some(argument => /test-name|shard/u.test(argument))).toBe(false);
    for (const [index, command] of modules.entries()) {
      expect(command).toEqual({ id: `module-pure-${index + 1}`, kind: 'node-events',
        files: [`spacetimedb/tests/${index === 0 ? 'first' : 'second'}.test.ts`], cwd: join('/repo', 'spacetimedb'),
        executable: '/native/node', args: ['/installed/tsx.mjs', '--test', '--test-timeout=120000',
          `--test-reporter=${pathToFileURL(join('/repo', 'scripts/native-source-verification-node-reporter.mjs')).href}`,
          `tests/${index === 0 ? 'first' : 'second'}.test.ts`],
        reportPath: `/repo/artifacts/qa/proof-module-pure-${index + 1}.events.ndjson`, deadlineMs: 180_000 });
    }
    expect(new Set(commands.map(command => command.id)).size).toBe(commands.length);
    expect(new Set(commands.map(command => command.reportPath)).size).toBe(commands.length);
    expect(commands.every(command => command.deadlineMs > 0 && Number.isFinite(command.deadlineMs))).toBe(true);
    expect(() => nativeTestCommands('/repo', { ...partitions, ordinaryVitestFiles: [NAMESPACE_FILES[0]] }, tools, '/repo/artifacts/qa/proof')).toThrow('PARTITIONS_INVALID');
  });
  it('isolates four fixed heavy files and balances a complete 701-file inventory without duplication', () => {
    const remaining = Array.from({ length: 697 }, (_, index) => `tests/ordinary/fixture-${String(index).padStart(3, '0')}.test.ts`);
    const files = [...remaining, ...isolatedOrdinaryFiles];
    const batches = deriveNativeOrdinaryTestBatches(files);
    expect(batches.map(batch => batch.id)).toEqual(['ordinary-security', 'ordinary-greater-realm',
      'ordinary-activation-records', 'ordinary-batch-1', 'ordinary-batch-2', 'ordinary-batch-3', 'ordinary-batch-4']);
    expect(batches.map(batch => batch.files.length)).toEqual([2, 1, 1, 175, 174, 174, 174]);
    expect(batches[0].files).toEqual(isolatedOrdinaryFiles.slice(0, 2));
    expect(batches[1].files).toEqual([isolatedOrdinaryFiles[2]]);
    expect(batches[2].files).toEqual([isolatedOrdinaryFiles[3]]);
    const union = batches.flatMap(batch => batch.files);
    expect(union).toHaveLength(701);
    expect(new Set(union).size).toBe(701);
    expect([...union].sort()).toEqual([...files].sort());
    expect(deriveNativeOrdinaryTestBatches([...files].reverse())).toEqual(batches);
    expect(batches[2].deadlineMs).toBe(7_200_000);
    expect(batches[2].deadlineMs).toBeGreaterThan(17 * 360_000 + 120_000 + 10_000);
    expect(batches[1].deadlineMs).toBeGreaterThan(33 * 90_000 + 3 * 180_000);
    for (const [index, batch] of batches.slice(3).entries()) {
      expect(batch.files).toEqual(remaining.filter((_, position) => position % 4 === index));
    }
  });
  it('covers the actual discovered ordinary inventory once, keeping PTR continuation only in namespace', () => {
    const discover = (directory: string): string[] => readdirSync(join(repository, directory), { withFileTypes: true })
      .flatMap(entry => entry.isDirectory() ? discover(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
    const rootFiles = discover('tests').filter(file => /\.(?:test|spec)\.tsx?$/u.test(file));
    const partitions = deriveNativeTestPartitions([...rootFiles, 'spacetimedb/tests/fixture.test.ts'],
      readFileSync(join(repository, 'vite.config.ts')), packageBytes);
    const commands = nativeTestCommands('/repo', partitions, tools, '/repo/artifacts/qa/proof');
    const vitest = commands.filter(command => command.kind === 'vitest-json');
    expect(vitest.flatMap(command => command.files).sort()).toEqual([...rootFiles].sort());
    expect(new Set(vitest.flatMap(command => command.files)).size).toBe(rootFiles.length);
    expect(vitest.flatMap(command => command.files).filter(file => file === NAMESPACE_FILES[0])).toHaveLength(1);
    expect(vitest.find(command => command.files.includes(NAMESPACE_FILES[0]))?.id).toBe('namespace-tests');
  });
  it.each(isolatedOrdinaryFiles)('refuses a missing fixed isolated source file %s', file => {
    expect(() => deriveNativeOrdinaryTestBatches(source.filter(value => value.startsWith('tests/')
      && !NAMESPACE_FILES.includes(value) && value !== file))).toThrow('ORDINARY_ISOLATED_INVENTORY_MISSING');
  });
  it('rejects malformed, duplicate, namespace and externally selected ordinary inventory entries', () => {
    const files = deriveNativeTestPartitions(source, vite, packageBytes).ordinaryVitestFiles;
    for (const entry of [files[0], NAMESPACE_FILES[0], '../outside.test.ts', 'tests/../outside.test.ts',
      'tests\\outside.test.ts', 'tests/outside.test.ts\n', '--test-name-pattern=one', 'src/ordinary.test.ts']) {
      expect(() => deriveNativeOrdinaryTestBatches([...files, entry])).toThrow('ORDINARY_INVENTORY_INVALID');
    }
    expect(() => deriveNativeOrdinaryTestBatches(undefined as never)).toThrow('ORDINARY_INVENTORY_INVALID');
    expect(() => deriveNativeOrdinaryTestBatches([...files, undefined] as never)).toThrow('ORDINARY_INVENTORY_INVALID');
    const sparse = [...files]; sparse.length += 1;
    expect(() => deriveNativeOrdinaryTestBatches(sparse)).toThrow('ORDINARY_INVENTORY_INVALID');
    expect(() => nativeTestCommands('/repo', { ...deriveNativeTestPartitions(source, vite, packageBytes),
      ordinaryVitestFiles: [...files, files[0]] }, tools, '/repo/artifacts/qa/proof')).toThrow('ORDINARY_INVENTORY_INVALID');
  });
});

describe('fixed native source checks recipe', () => {
  const packageSource = readFileSync(join(repository, 'package.json'), 'utf8');
  const checkTools = { node: { path: '/native/node' }, pnpm: { path: '/native/pnpm' }, gitleaks: { path: '/usr/bin/gitleaks' } };
  it('uses the existing complete script chain and exact three closed environments', () => {
    const commands = nativeSourceCheckCommands('/repo', checkTools, '/repo/artifacts/qa/proof', packageSource);
    expect(NATIVE_SOURCE_CHECKS_PROFILE).toBe('warpkeep-native-source-checks-v1');
    expect(commands.map(command => command.id)).toEqual(['scanner-regression', 'source-secrets', 'source-licenses',
      'source-runtime-assets', 'source-file-sizes', 'source-sealed-launch', 'root-types',
      'production-build-default', 'production-build-github-pages', 'production-build-canonical-pages']);
    expect(commands[0].args).toEqual(['--experimental-strip-types', '/repo/scripts/verify-scanner-regression.ts', '/usr/bin/gitleaks']);
    expect(commands[1].kind).toBe('gitleaks-json');
    expect(commands[1].args).toContain('--log-opts=HEAD');
    expect(commands[1].args).toContain('--report-path=-');
    expect(commands[1].reportPath).toBe('/repo/artifacts/qa/proof-source-secrets.report.json');
    const builds = commands.filter(command => command.buildVariant);
    expect(builds.map(command => command.environment)).toEqual([{}, { GITHUB_PAGES: 'true' }, { GITHUB_PAGES: 'true', DEPLOY_BASE: '/' }]);
    expect(builds.map(command => command.buildVariant)).toEqual(['default', 'github-pages', 'canonical-pages']);
    for (const command of commands.filter(value => value.script)) {
      expect(command.executable).toBe('/native/pnpm');
      expect(command.args).toEqual(['--pm-on-fail=ignore', '--config.verify-deps-before-run=false', '--dir', '/repo', 'run', command.script]);
      expect(command.scriptSha256).toBe(digest(Buffer.from(JSON.parse(packageSource).scripts[command.script!])));
      expect(command.kind).toBe('terminal-check');
      expect(command.deadlineMs).toBeGreaterThan(0);
      expect(command.reportPath).toBe(`/repo/artifacts/qa/proof-${command.id}.report.json`);
    }
    expect(commands.flatMap(command => command.args).some(value => /^(?:install|audit|--filter|--if-present)$/u.test(value))).toBe(false);
  });
  it.each(['build', 'typecheck', 'verify:licenses', 'verify:runtime-assets', 'verify:file-sizes', 'verify:sealed-launch'])
  ('refuses changed %s scripts and newly inserted lifecycle hooks before launching anything', name => {
    for (const mutate of [
      (metadata: { scripts: Record<string, string> }) => { metadata.scripts[name] += ' && echo bypass'; },
      (metadata: { scripts: Record<string, string> }) => { metadata.scripts[`pre${name}`] = 'echo side effect'; },
      (metadata: { scripts: Record<string, string> }) => { metadata.scripts[`post${name}`] = 'echo side effect'; },
    ]) {
      const metadata = JSON.parse(packageSource); mutate(metadata);
      expect(() => nativeSourceCheckCommands('/repo', checkTools, '/repo/artifacts/qa/proof', JSON.stringify(metadata)))
        .toThrow('SOURCE_CHECK_RECIPE_CHANGED');
    }
    const metadata = JSON.parse(packageSource); delete metadata.scripts[name];
    expect(() => nativeSourceCheckCommands('/repo', checkTools, '/repo/artifacts/qa/proof', JSON.stringify(metadata)))
      .toThrow('SOURCE_CHECK_RECIPE_CHANGED');
  });
  it('preserves the source npm declaration and refuses a different declared package manager', () => {
    const metadata = JSON.parse(packageSource); metadata.packageManager = 'pnpm@11.11.0';
    expect(() => nativeSourceCheckCommands('/repo', checkTools, '/repo/artifacts/qa/proof', JSON.stringify(metadata)))
      .toThrow('SOURCE_CHECK_RECIPE_CHANGED');
  });
});

describe('owned namespace cleanup requests', () => {
  const bootId = '11111111-2222-3333-4444-555555555555';
  const owner = { uid: 1000, gid: 1000, pid: 101, pgid: 101, bootId, identity: `linux-v1:${bootId}:700` };
  const member = { pid: 102, pgid: 101, identity: `linux-v1:${bootId}:701` };
  it('routes one exact birth-bound member through the existing privileged namespace helper', () => {
    const command = nativeNamespaceCleanupCommand('/repo', owner, member, 'SIGTERM');
    expect(command).toEqual({ executable: '/usr/bin/sudo', args: ['-n', NATIVE_NAMESPACE_LAUNCHER_PATH, '--cleanup', '1000', '1000', '/repo',
      '101', '101', owner.identity, '102', member.identity, 'SIGTERM'] });
    expect(nativeNamespaceCleanupCommand('/repo', owner, member, 'SIGKILL').args.at(-1)).toBe('SIGKILL');
  });
  it('refuses leader, foreign-group, wrong-boot and unsupported signal requests before launch', () => {
    for (const invalid of [{ ...member, pid: owner.pid }, { ...member, pgid: 202 },
      { ...member, identity: 'linux-v1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:701' },
      { ...member, identity: `${member.identity}junk` }, { ...member, pid: -102 }]) {
      expect(() => nativeNamespaceCleanupCommand('/repo', owner, invalid, 'SIGTERM')).toThrow('CLEANUP_IDENTITY_INVALID');
    }
    for (const invalid of [{ ...owner, uid: 0 }, { ...owner, gid: 0 }, { ...owner, pgid: 202 },
      { ...owner, bootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }]) {
      expect(() => nativeNamespaceCleanupCommand('/repo', invalid, member, 'SIGTERM')).toThrow('CLEANUP_IDENTITY_INVALID');
    }
    for (const signal of ['SIGINT', '0', '-1', '']) {
      expect(() => nativeNamespaceCleanupCommand('/repo', owner, member, signal)).toThrow('CLEANUP_IDENTITY_INVALID');
    }
    expect(() => nativeNamespaceCleanupCommand('../repo', owner, member, 'SIGTERM')).toThrow('CLEANUP_IDENTITY_INVALID');
  });
});

function vitestReport(statuses = ['passed', 'passed']) {
  return { numTotalTestSuites: 3, numPassedTestSuites: 3, numFailedTestSuites: 0, numPendingTestSuites: 0,
    numTotalTests: statuses.length, numPassedTests: statuses.filter(status => status === 'passed').length,
    numFailedTests: statuses.filter(status => status === 'failed').length,
    numPendingTests: statuses.filter(status => ['skipped', 'pending'].includes(status)).length,
    numTodoTests: statuses.filter(status => status === 'todo').length, success: !statuses.includes('failed'), snapshot: { failure: false },
    testResults: [{ name: `${fixtureRoot}/${fixtureFile}`, status: statuses.includes('failed') ? 'failed' : 'passed', message: '',
      assertionResults: statuses.map((status, index) => ({ title: `leaf${index}`, fullName: `outer leaf${index}`, status,
        ancestorTitles: ['outer'], failureMessages: [] })) }] };
}
describe('raw report completeness', () => {
  it('counts nested suites separately from files and assertions', () => {
    const parsed = parseVitestReport(JSON.stringify(vitestReport()), scope);
    expect([parsed.files.length, parsed.suiteCount, parsed.assertions.length]).toEqual([1, 3, 2]);
    expect(parsed.success).toBe(true);
    expect(parsed.childTerminalRequired).toBe(true);
  });
  it('retains exact skipped/todo/pending outcomes without claiming they passed', () => {
    const parsed = parseVitestReport(JSON.stringify(vitestReport(['passed', 'skipped', 'todo', 'pending'])), scope);
    expect([parsed.passed, parsed.skipped, parsed.todo, parsed.pending]).toEqual([1, 1, 1, 1]);
    expect(parsed.complete).toBe(false);
    expect(parsed.success).toBe(false);
  });
  it('retains raw success and suite failures even when every assertion passed', () => {
    const unsuccessful = vitestReport(); unsuccessful.success = false;
    const failedSuite = vitestReport(); failedSuite.numPassedTestSuites--; failedSuite.numFailedTestSuites++;
    for (const value of [unsuccessful, failedSuite]) {
      const parsed = parseVitestReport(JSON.stringify(value), scope);
      expect(parsed.complete).toBe(true); expect(parsed.success).toBe(false);
      expect(parsed.reportSuccess).toBe(value.success);
      expect(parsed.failedSuiteCount).toBe(value.numFailedTestSuites);
      expect(parsed.pendingSuiteCount).toBe(0);
      expect(parsed.passed).toBe(2);
    }
  });
  it('rejects missing files, duplicate files, leaf counts and suite/todo mismatches', () => {
    const count = vitestReport(); count.numPassedTests++;
    const suites = vitestReport(); suites.numTotalTestSuites++;
    const todo = vitestReport(); todo.numTodoTests++;
    const duplicate = vitestReport(); duplicate.testResults.push(duplicate.testResults[0]);
    for (const value of [count, suites, todo, duplicate]) expect(() => parseVitestReport(JSON.stringify(value), scope)).toThrow();
    expect(() => parseVitestReport(JSON.stringify(vitestReport()), { ...scope, expectedFiles: [fixtureFile, 'tests/missing.test.mjs'] })).toThrow('inventory');
  });
  it('does not accept snapshot, file setup or reported unhandled failures', () => {
    const snapshot = vitestReport(); snapshot.snapshot.failure = true;
    const setup = vitestReport(); setup.testResults[0].message = 'beforeAll failure';
    for (const value of [snapshot, setup, { ...vitestReport(), unhandledErrors: ['runtime failure'] }]) {
      expect(parseVitestReport(JSON.stringify(value), scope).success).toBe(false);
    }
    expect(() => parseVitestReport(Buffer.from([0xff]), scope)).toThrow();
  });
});

function actualNodeFixture(contents: string) {
  const folder = mkdtempSync(join(tmpdir(), 'warpkeep-native-report-')); folders.push(folder);
  const file = join(folder, 'fixture.test.mjs'); writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
  const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', `--test-reporter=${pathToFileURL(join(repository, 'scripts/native-source-verification-node-reporter.mjs')).href}`, file],
    { cwd: folder, env: environment, windowsHide: true, shell: false, encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
  return { result, folder, bytes: result.stdout, parsed: parseNodeEvents(result.stdout, { repositoryRoot: folder, expectedFiles: ['fixture.test.mjs'] }) };
}
describe('installed Node structured reports', () => {
  it('preserves real nested suite leaves, skip/todo/failure and nonenumerable errors', () => {
    const observed = actualNodeFixture("import {describe,it} from 'node:test';import assert from 'node:assert/strict';describe('outer',()=>{it('pass',()=>{});describe('inner',()=>{it('skip',{skip:true},()=>{});it('todo',{todo:'later'},()=>{});it('failure',()=>assert.fail('actual fixture failure'));});});");
    expect(observed.result.status).toBe(1);
    expect(observed.bytes).toContain('actual fixture failure');
    expect(observed.parsed.suiteCount).toBe(2);
    expect([observed.parsed.passed, observed.parsed.failed, observed.parsed.skipped, observed.parsed.todo]).toEqual([1, 1, 1, 1]);
    expect(observed.parsed.success).toBe(false);
  });
  it('recognizes clean nested suites and startup file failures without invented coverage', () => {
    const good = actualNodeFixture("import {describe,it} from 'node:test';describe('outer',()=>describe('inner',()=>it('pass',()=>{})));");
    expect(good.result.status).toBe(0); expect(good.parsed.passed).toBe(1); expect(good.parsed.success).toBe(true);
    expect(() => parseNodeEvents(good.bytes.slice(0, -1), { repositoryRoot: good.folder, expectedFiles: ['fixture.test.mjs'] })).toThrow('Truncated');
    const bad = actualNodeFixture("throw Error('startup fixture failure');");
    expect(bad.result.status).toBe(1); expect(bad.parsed.assertions).toHaveLength(0);
    expect(bad.parsed.fileFailureCount).toBe(1); expect(bad.parsed.success).toBe(false);
  });
  it('rejects an authentic reporter stream without terminal summary/plan', async () => {
    let bytes = '';
    for await (const line of reporter((async function* () { yield { type: 'test:diagnostic', data: { message: 'Bail out! incomplete run' } }; })())) bytes += line;
    expect(() => parseNodeEvents(bytes, scope)).toThrow('summary/root plan absent');
  });
});

describe('release authority remains closed and imports are safe', () => {
  it.each([NATIVE_VERIFICATION_PROFILE, NATIVE_SOURCE_CHECKS_PROFILE, NATIVE_SERVICE_CHECKS_PROFILE])('cannot turn a forged %s coverage envelope into a native source proof', profile => {
    const folder = mkdtempSync(join(tmpdir(), 'warpkeep-native-closed-')); folders.push(folder);
    mkdirSync(join(folder, 'artifacts', 'qa'), { recursive: true });
    const commit = 'a'.repeat(40), body = Buffer.from(JSON.stringify({ schemaVersion: 1, profile,
      repositoryRoot: folder, source: { sourceCommit: commit }, completeCoverage: true, productionAuthorized: true,
      implementedDomains: REQUIRED_NATIVE_DOMAINS, acceptedMain: true, signatureVerified: true, results: [] }));
    const locator = digest(body); writeFileSync(join(folder, 'artifacts', 'qa', `native-source-verification-${locator}.json`), body, { flag: 'wx', mode: 0o600 });
    process.chdir(folder);
    // Windows does not emulate native POSIX mode600; it must still never return proof.
    expect(() => requireCompleteNativeSourceVerificationEvidence(locator, commit)).toThrow();
    if (process.platform !== 'win32') {
      // A matching real byte digest reaches the closed authority boundary, not a nonexistent reader hash field.
      expect(() => requireCompleteNativeSourceVerificationEvidence(locator, commit)).toThrow('NATIVE_SOURCE_VERIFICATION_INCOMPLETE');
      writeFileSync(join(folder, 'artifacts', 'qa', `native-source-verification-${locator}.json`), Buffer.concat([body, Buffer.from('x')]));
      expect(() => requireCompleteNativeSourceVerificationEvidence(locator, commit)).toThrow('NATIVE_SOURCE_VERIFICATION_ARTIFACT_CHANGED');
    }
  });
  it('rejects path-shaped and malformed native locators before filesystem access', () => {
    for (const locator of ['../receipt.json', 'A'.repeat(64), 'a'.repeat(63), '']) {
      expect(() => requireCompleteNativeSourceVerificationEvidence(locator, 'a'.repeat(40))).toThrow('EVIDENCE_LOCATOR_INVALID');
    }
  });
  it('imports successfully from the actual CJS sealed-bundle compilation boundary', () => {
    expect(requireCompleteNativeSourceVerificationEvidence).toBe(inertEvidenceReader);
    const compiled = buildSync({ stdin: { contents: "export { requireCompleteNativeSourceVerificationEvidence } from './scripts/native-source-verification-evidence.mjs';",
      resolveDir: repository }, platform: 'node', format: 'cjs', bundle: true, write: false, logLevel: 'silent' });
    const module = { exports: {} as Record<string, unknown> };
    new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    expect(typeof module.exports.requireCompleteNativeSourceVerificationEvidence).toBe('function');
  });
  it('maintained CLI defaults to help and explicitly refuses release verification', () => {
    for (const args of [[], ['--help']]) {
      const help = spawnSync(process.execPath, ['scripts/verify-native-source.mjs', ...args], { cwd: repository, shell: false, encoding: 'utf8', timeout: 15_000, windowsHide: true });
      expect(help.status).toBe(0); expect(help.stderr).toBe(''); expect(help.stdout).toContain('no release authority');
    }
    const refused = spawnSync(process.execPath, ['scripts/verify-native-source.mjs', '--verify-release'], { cwd: repository, shell: false, encoding: 'utf8', timeout: 15_000, windowsHide: true });
    expect(refused.status).toBe(1); expect(refused.stderr).toContain('NATIVE_SOURCE_VERIFICATION_INCOMPLETE');
  });
});
