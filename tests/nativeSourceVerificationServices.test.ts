// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  NATIVE_SERVICE_CHECKS_PROFILE, NATIVE_SERVICE_SOURCE_INPUTS, NATIVE_SERVICE_PREREQUISITES,
  deriveNativeServicePartitions, nativeServiceCommands,
  type NativeServicePartitions, type NativeServiceTools,
} from '../scripts/native-source-verification-services.mjs';
import { parseVitestReport } from '../scripts/native-source-verification-reports.mjs';

const repository = process.cwd();
const inputBytes = Object.fromEntries(Object.keys(NATIVE_SERVICE_SOURCE_INPUTS)
  .map(path => [path, readFileSync(join(repository, path))]));
function testPaths(folder: string): string[] {
  return readdirSync(join(repository, folder), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? testPaths(folder + '/' + entry.name)
      : /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) ? [folder + '/' + entry.name] : []);
}
const inventory = [...Object.keys(NATIVE_SERVICE_SOURCE_INPUTS),
  ...['services/auth-bridge/test', 'services/auth-bridge/test-workerd',
    'services/release-recovery/test', 'services/release-recovery/test-workerd'].flatMap(testPaths)];
const root = '/reviewed/repository', stem = root + '/artifacts/qa/service-check';
const tools: NativeServiceTools = { node: { path: '/attested/node' }, pnpm: { path: '/attested/pnpm' },
  authBridge: { vitest: { path: '/attested/auth/vitest.mjs' } },
  releaseRecovery: { vitest: { path: '/attested/recovery/vitest.mjs' }, wrangler: { path: '/attested/recovery/wrangler.js' } } };
const partitions = () => deriveNativeServicePartitions(inventory, inputBytes);
const commands = () => nativeServiceCommands(root, partitions(), tools, stem);
const allFiles = (value: NativeServicePartitions) => [
  ...value.authBridge.ordinaryVitestFiles, ...value.authBridge.workerdVitestFiles,
  ...value.releaseRecovery.ordinaryVitestFiles, ...value.releaseRecovery.workerdVitestFiles];
function rawReport(files: readonly string[], status: 'passed' | 'skipped' | 'failed' | 'pending' = 'passed') {
  const failed = status === 'failed' ? files.length : 0;
  return JSON.stringify({ numTotalTestSuites: files.length,
    numPassedTestSuites: failed ? 0 : files.length, numFailedTestSuites: failed, numPendingTestSuites: 0,
    numTotalTests: files.length, numPassedTests: status === 'passed' ? files.length : 0,
    numFailedTests: failed, numPendingTests: ['skipped', 'pending'].includes(status) ? files.length : 0,
    numTodoTests: 0, success: !failed, snapshot: { failure: false },
    testResults: files.map(file => ({ name: root + '/' + file,
      status: failed ? 'failed' : 'passed', message: '', assertionResults: [{ title: 'observed assertion',
        fullName: 'actual service observed assertion', ancestorTitles: ['actual service'], status,
        failureMessages: failed ? ['intentional fixture failure'] : [] }] })) });
}

describe('source-owned native service partition recipe', () => {
  it('covers both complete source test namespaces without promoting coverage or release authority', () => {
    const value = partitions();
    expect(value.profile).toBe(NATIVE_SERVICE_CHECKS_PROFILE);
    expect([value.authBridge.ordinaryVitestFiles.length, value.authBridge.workerdVitestFiles.length,
      value.releaseRecovery.ordinaryVitestFiles.length, value.releaseRecovery.workerdVitestFiles.length]).toEqual([18, 1, 49, 8]);
    expect(allFiles(value).sort()).toEqual(inventory.filter(path => path.endsWith('.test.ts')).sort());
    expect(new Set(allFiles(value)).size).toBe(76);
    expect(value.completeCoverage).toBe(false); expect(value.productionAuthorized).toBe(false);
  });
  it('accepts the actual source bytes as Buffer, Uint8Array and UTF-8 strings', () => {
    for (const convert of [(body: Buffer) => body, (body: Buffer) => new Uint8Array(body),
      (body: Buffer) => body.toString('utf8')]) {
      expect(deriveNativeServicePartitions(inventory,
        Object.fromEntries(Object.entries(inputBytes).map(([path, body]) => [path, convert(body)])))).toEqual(partitions());
    }
  });
  it.each(Object.keys(NATIVE_SERVICE_SOURCE_INPUTS))('refuses changed source recipe input %s', path => {
    expect(() => deriveNativeServicePartitions(inventory, { ...inputBytes,
      [path]: Buffer.concat([inputBytes[path], Buffer.from('\n')]) })).toThrow('SOURCE_RECIPE_CHANGED');
  });
  it('requires every source input in the tracked inventory and refuses missing/extra supplied bytes', () => {
    const first = Object.keys(inputBytes)[0];
    expect(() => deriveNativeServicePartitions(inventory.filter(path => path !== first), inputBytes)).toThrow('SOURCE_RECIPE_CHANGED');
    const missing = { ...inputBytes }; delete missing[first];
    expect(() => deriveNativeServicePartitions(inventory, missing)).toThrow('SOURCE_INPUTS_INVALID');
    expect(() => deriveNativeServicePartitions(inventory, { ...inputBytes, 'caller-recipe.json': Buffer.from('{}') })).toThrow('SOURCE_INPUTS_INVALID');
  });
  it('refuses missing Workerd and ordinary files instead of accepting a partial namespace', () => {
    const value = partitions();
    for (const file of [value.authBridge.workerdVitestFiles[0], value.authBridge.ordinaryVitestFiles[0],
      value.releaseRecovery.workerdVitestFiles[0], value.releaseRecovery.ordinaryVitestFiles[0]]) {
      expect(() => deriveNativeServicePartitions(inventory.filter(path => path !== file), inputBytes)).toThrow('TEST_NAMESPACE_CHANGED');
    }
  });
  it.each(['services/auth-bridge/test/new.test.ts', 'services/release-recovery/test-workerd/new.test.ts',
    'services/auth-bridge/src/ignored.test.ts', 'services/release-recovery/test/unselected.spec.ts',
    'services/auth-bridge/test/ignored.test.tsx', 'services/new-service/test/new.test.ts'])
  ('refuses new or unselected namespace %s', path => {
    expect(() => deriveNativeServicePartitions([...inventory, path], inputBytes)).toThrow('TEST_NAMESPACE_CHANGED');
  });
  it('does not misclassify tracked helpers and worker configuration as assertions', () => {
    expect(deriveNativeServicePartitions([...inventory, 'services/auth-bridge/test/recoveryConfigurationFixture.ts',
      'services/release-recovery/test-workerd/reconciliationProof.fake.ts'], inputBytes)).toEqual(partitions());
  });
  it.each(['', '../outside.test.ts', '/absolute.test.ts', 'services/auth-bridge/test/../hidden.test.ts',
    'services\\auth-bridge\\test\\bad.test.ts', 'services/auth-bridge/test/line\n.test.ts'])
  ('rejects noncanonical inventory path %s', path => {
    expect(() => deriveNativeServicePartitions([...inventory, path], inputBytes)).toThrow('INVENTORY_INVALID');
  });
  it('rejects duplicate paths and caller skip/authority changes before constructing commands', () => {
    expect(() => deriveNativeServicePartitions([...inventory, inventory[0]], inputBytes)).toThrow('INVENTORY_INVALID');
    const omitted = { ...partitions(), authBridge: { ...partitions().authBridge, ordinaryVitestFiles: [] } };
    expect(() => nativeServiceCommands(root, omitted, tools, stem)).toThrow('PARTITIONS_CHANGED');
    expect(() => nativeServiceCommands(root, { ...partitions(), productionAuthorized: true } as unknown as NativeServicePartitions,
      tools, stem)).toThrow('PARTITIONS_CHANGED');
  });
});

describe('native service commands and raw reports', () => {
  it('partitions the declared checks into five terminal checks and four exact raw Vitest reports', () => {
    const value = commands();
    expect(value).toHaveLength(9);
    const tests = value.filter(command => command.kind === 'vitest-json');
    expect(tests).toHaveLength(4);
    expect(value.filter(command => command.kind === 'terminal-check')).toHaveLength(5);
    expect(tests.flatMap(command => command.files).sort()).toEqual(allFiles(partitions()).sort());
    expect(new Set(value.map(command => command.reportPath)).size).toBe(9);
    for (const command of value) {
      expect(command.cwd).toBe(root + '/' + command.service);
      expect(command.reportPath.startsWith(stem + '-')).toBe(true);
      expect(command.deadlineMs).toBe(900_000);
      expect(command.environment).toEqual({ WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' });
      expect(command.args).not.toContain('install'); expect(command.args).not.toContain('audit');
      expect(command.args).not.toContain('check'); expect(command.args).not.toContain('deploy');
    }
  });
  it('executes declared type scripts with explicit patched-pnpm no-switch/no-install flags and no aggregate check', () => {
    const typed = commands().filter(command => command.script?.startsWith('typecheck'));
    expect(typed).toHaveLength(4);
    for (const command of typed) {
      const metadata = JSON.parse(inputBytes[command.service + '/package.json'].toString('utf8'));
      expect(metadata.scripts[command.script!]).toBe(command.script === 'typecheck'
        ? 'tsc --noEmit' : 'tsc --noEmit -p test-workerd/tsconfig.json');
      expect(command.executable).toBe(tools.pnpm.path);
      expect(command.args).toEqual(['--pm-on-fail=ignore', '--config.verify-deps-before-run=false',
        '--dir', command.cwd, 'run', command.script]);
      expect(command.files).toEqual([]); expect(command.report).toBeUndefined();
    }
  });
  it('retains the exact recovery Wrangler check from its actual check script without generating or deploying', () => {
    const command = commands().find(value => value.id === 'release-recovery-worker-configuration')!;
    const metadata = JSON.parse(inputBytes['services/release-recovery/package.json'].toString('utf8'));
    expect(metadata.scripts.check.split('&&').map((part: string) => part.trim()))
      .toContain('wrangler ' + command.args.slice(1).join(' '));
    expect(command.executable).toBe(tools.node.path);
    expect(command.args[0]).toBe(tools.releaseRecovery.wrangler.path);
    expect(command.args.at(-1)).toBe('--check');
    expect(command.files).toEqual([]); expect(command.report).toBeUndefined();
  });
  it('keeps ordinary/Workerd config, file namespaces and existing test-case timeouts intact', () => {
    for (const command of commands().filter(value => value.kind === 'vitest-json')) {
      expect(command.executable).toBe(tools.node.path);
      const config = command.args[command.args.indexOf('--config') + 1];
      expect(config).toBe(command.script === 'test' ? 'vitest.config.ts' : 'vitest.workerd.config.ts');
      expect(command.args.slice(2, 2 + command.files.length))
        .toEqual(command.files.map(file => file.slice(command.service.length + 1)));
      expect(command.args).toContain('--maxWorkers=1'); expect(command.args).toContain('--no-cache');
      expect(command.args).toContain('--reporter=json'); expect(command.args).toContain('--outputFile=' + command.reportPath);
      expect(command.args.some(arg => /testTimeout|retry|bail|testNamePattern|passWithNoTests|exclude/.test(arg))).toBe(false);
      expect(command.report).toEqual({ kind: 'vitest-json', repositoryRoot: root,
        expectedFiles: command.files, childTerminalRequired: true });
    }
  });
  it('raw service descriptors feed the strict parser without inferring test counts from terminal checks', () => {
    for (const command of commands().filter(value => value.kind === 'vitest-json')) {
      const parsed = parseVitestReport(rawReport(command.files), command.report!);
      expect(parsed.files.sort()).toEqual([...command.files].sort());
      expect(parsed.success).toBe(true); expect(parsed.childTerminalRequired).toBe(true);
      for (const status of ['skipped', 'failed', 'pending'] as const) {
        const failed = parseVitestReport(rawReport(command.files, status), command.report!);
        expect(failed.success).toBe(false);
        expect(failed[status]).toBe(command.files.length);
      }
      const foreign = [command.service === 'services/auth-bridge'
        ? 'services/release-recovery/test/crypto.test.ts' : 'services/auth-bridge/test/app.test.ts'];
      expect(() => parseVitestReport(rawReport(foreign), command.report!)).toThrow('Unexpected reported file');
      expect(() => parseVitestReport(rawReport(command.files.slice(1)), command.report!)).toThrow('inventory mismatch');
    }
  });
  it('names metadata-only ambient refusals and actual installed entry inputs without granting authority', () => {
    expect([...NATIVE_SERVICE_PREREQUISITES.requiredSourceInputs].sort()).toEqual(Object.keys(NATIVE_SERVICE_SOURCE_INPUTS).sort());
    expect(NATIVE_SERVICE_PREREQUISITES.forbiddenConfigBasenames).toContain('.dev.vars');
    expect(NATIVE_SERVICE_PREREQUISITES.forbiddenConfigPrefixes).toContain('.env.');
    expect(NATIVE_SERVICE_PREREQUISITES.allowedExamplePaths).toEqual(['services/auth-bridge/.dev.vars.example']);
    expect(NATIVE_SERVICE_PREREQUISITES.installedInputs).toHaveLength(8);
    expect(NATIVE_SERVICE_PREREQUISITES.installedInputs.every(value => value.packagePath.startsWith(value.serviceRoot + '/node_modules/')
      && value.entryPath.startsWith(value.serviceRoot + '/node_modules/'))).toBe(true);
    expect(NATIVE_SERVICE_PREREQUISITES.completeCoverage).toBe(false);
    expect(NATIVE_SERVICE_PREREQUISITES.productionAuthorized).toBe(false);
  });
  it.each([['/reviewed/repository/../other', stem], [root, root + '/outside/report'],
    [root, root + '/artifacts/qa/nested/report'], [root, root + '/artifacts/qa/bad report']])
  ('refuses uncontrolled command/report root %s %s', (base, output) => {
    expect(() => nativeServiceCommands(base, partitions(), tools, output)).toThrow('COMMAND_ROOT_INVALID');
  });
  it('refuses missing or noncanonical attested tool inputs', () => {
    expect(() => nativeServiceCommands(root, partitions(), { ...tools,
      releaseRecovery: { ...tools.releaseRecovery, wrangler: { path: '../wrangler' } } }, stem)).toThrow('TOOL_INPUTS_INVALID');
    expect(() => nativeServiceCommands(root, partitions(), {} as NativeServiceTools, stem)).toThrow('TOOL_INPUTS_INVALID');
  });
});
