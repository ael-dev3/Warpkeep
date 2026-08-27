// @vitest-environment node

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import * as greaterRealmProductionBootstrapModule from '../scripts/greater-realm-production-bootstrap.mjs';
const {
  canonicalNpmPackageTarballUrl,
  greaterRealmProductionBootstrapTestSeams,
  parseGreaterRealmProductionBootstrapArguments,
  selectGreaterRealmDarwinArm64ModulePackages,
  stageGreaterRealmModuleArchives,
} = greaterRealmProductionBootstrapModule;
import { greaterRealmImmutableArtifactTestSeams } from '../scripts/greater-realm-production-immutable-artifact';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function privateDirectory(): string {
  const path = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-production-bootstrap-'));
  chmodSync(path, 0o700);
  temporaryDirectories.push(path);
  return path;
}

function installedRootClosureFixture(): string {
  const root = privateDirectory();
  mkdirSync(join(root, 'node_modules', 'tsx'), { recursive: true });
  const packages = {
    '': { name: 'warpkeep', version: '0.3.43' },
    'node_modules/tsx': {
      version: '4.23.0',
      resolved: 'https://registry.npmjs.org/tsx/-/tsx-4.23.0.tgz',
      integrity: `sha512-${'A'.repeat(86)}==`,
    },
    'node_modules/@typescript/typescript-linux-x64': {
      version: '7.0.2',
      resolved: 'https://registry.npmjs.org/typescript-linux-x64.tgz',
      integrity: `sha512-${'B'.repeat(86)}==`,
      optional: true,
      os: ['linux'],
      cpu: ['x64'],
    },
    'node_modules/@typescript/typescript-darwin-arm64': {
      version: '7.0.2',
      resolved: 'https://registry.npmjs.org/typescript-darwin-arm64.tgz',
      integrity: `sha512-${'C'.repeat(86)}==`,
      optional: true,
      os: ['darwin'],
      cpu: ['arm64'],
    },
  };
  const rootLock = {
    name: 'warpkeep',
    version: '0.3.43',
    lockfileVersion: 3,
    packages,
  };
  const installedLock = {
    name: rootLock.name,
    version: rootLock.version,
    lockfileVersion: 3,
    packages: {
      'node_modules/tsx': packages['node_modules/tsx'],
      'node_modules/@typescript/typescript-linux-x64':
        packages['node_modules/@typescript/typescript-linux-x64'],
    },
  };
  writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify(rootLock)}\n`);
  writeFileSync(
    join(root, 'node_modules', '.package-lock.json'),
    `${JSON.stringify(installedLock)}\n`,
  );
  writeFileSync(
    join(root, 'node_modules', 'tsx', 'package.json'),
    `${JSON.stringify({ name: 'tsx', version: '4.23.0' })}\n`,
  );
  return root;
}

function materializeHermesParserRootDependencies(
  root: string,
  options: Readonly<{ includeProductionNative?: boolean }> = {},
): void {
  mkdirSync(join(root, 'node_modules', '@typescript'), { recursive: true });
  const rootLockPath = join(root, 'package-lock.json');
  if (!existsSync(rootLockPath)) copyFileSync('package-lock.json', rootLockPath);
  const rootLock = JSON.parse(readFileSync(rootLockPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
    packages?: Record<string, unknown>;
  };
  const installedLock = JSON.parse(
    readFileSync('node_modules/.package-lock.json', 'utf8'),
  ) as {
    name?: unknown;
    version?: unknown;
    lockfileVersion?: unknown;
    packages?: Record<string, unknown>;
  };
  installedLock.name = rootLock.name;
  installedLock.version = rootLock.version;
  installedLock.packages ??= {};
  for (const name of ['typescript', 'yaml']) {
    cpSync(
      join('node_modules', name),
      join(root, 'node_modules', name),
      { recursive: true },
    );
  }
  const platformNative =
    `@typescript/typescript-${process.platform}-${process.arch}`;
  cpSync(
    join('node_modules', ...platformNative.split('/')),
    join(root, 'node_modules', ...platformNative.split('/')),
    { recursive: true },
  );
  const platformLockPath = `node_modules/${platformNative}`;
  installedLock.packages[platformLockPath] = rootLock.packages?.[platformLockPath];

  const productionNative = '@typescript/typescript-darwin-arm64';
  if (options.includeProductionNative === true && productionNative !== platformNative) {
    const productionLockPath = `node_modules/${productionNative}`;
    expect(rootLock.packages?.[productionLockPath]).toBeDefined();
    installedLock.packages[productionLockPath] = rootLock.packages?.[productionLockPath];
    const productionRoot = join(root, 'node_modules', ...productionNative.split('/'));
    mkdirSync(productionRoot, { recursive: true });
    writeFileSync(join(productionRoot, 'package.json'), `${JSON.stringify({
      name: productionNative,
      version: '7.0.2',
    }, null, 2)}\n`);
    writeFileSync(join(productionRoot, 'runtime.bin'), 'synthetic-darwin-arm64-fixture\n');
  }
  writeFileSync(
    join(root, 'node_modules', '.package-lock.json'),
    `${JSON.stringify(installedLock, null, 2)}\n`,
  );
}

function hermesParserResolverFixture(
  options: Readonly<{ includeProductionNative?: boolean }> = {},
): string {
  const root = privateDirectory();
  mkdirSync(join(root, 'services', 'auth-bridge'), { recursive: true });
  materializeHermesParserRootDependencies(root, options);
  return root;
}

function applyOwnerPrivateInstallModes(root: string): void {
  const pending = [join(root, 'node_modules')];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) throw new Error('missing fixture directory');
    chmodSync(directory, 0o700);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile()) throw new Error(`unexpected fixture entry: ${path}`);
      const executable = (lstatSync(path).mode & 0o111) !== 0;
      chmodSync(path, executable ? 0o700 : 0o600);
    }
  }
}

function lifecycleProgram(): string {
  const envelope = readFileSync(
    'docs/operations/greater-realm-production-launch-envelope.sh.txt',
    'utf8',
  );
  const match = /<<'WKGR_LAUNCH_LIFECYCLE_PY'\n([\s\S]*?)\nWKGR_LAUNCH_LIFECYCLE_PY\n/u
    .exec(envelope);
  if (match?.[1] === undefined) throw new Error('launch lifecycle program missing');
  return `${match[1]}\n`;
}

function bootstrapLifecycleLockProgram(): string {
  const bootstrap = readFileSync('scripts/greater-realm-production-bootstrap.mjs', 'utf8');
  const match = /const BOOTSTRAP_LIFECYCLE_LOCK_HELPER = String\.raw`\n([\s\S]*?)\n`;/u
    .exec(bootstrap);
  if (match?.[1] === undefined) throw new Error('bootstrap lifecycle lock helper missing');
  return `${match[1]}\n`;
}

type LifecycleResult = Readonly<{
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}>;

function runLifecycle(mode: string, ...arguments_: string[]): LifecycleResult {
  const result = spawnSync('/usr/bin/python3', [
    '-I', '-S', '-B', '-', mode, ...arguments_,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
    input: lifecycleProgram(),
    maxBuffer: 4 * 1024 * 1024,
  });
  return Object.freeze({
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function startLifecycleAsync(mode: string, ...arguments_: string[]) {
  const child = spawn('/usr/bin/python3', [
    '-I', '-S', '-B', '-', mode, ...arguments_,
  ], {
    cwd: process.cwd(),
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  child.stdin.end(lifecycleProgram());
  const result = new Promise<LifecycleResult>(
    (resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise);
      child.once('close', (status, signal) => resolvePromise(Object.freeze({
        status,
        signal,
        stdout,
        stderr,
      })));
    },
  );
  return Object.freeze({ child, result });
}

async function runLifecycleAsync(mode: string, ...arguments_: string[]): Promise<LifecycleResult> {
  return startLifecycleAsync(mode, ...arguments_).result;
}

function deadProcessIdentity(): Readonly<{ pid: number; start: string }> {
  const result = spawnSync('/bin/sh', [
    '-c', '/usr/bin/printf "%s\\n" "$$"; /bin/ps -o lstart= -p "$$"',
  ], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
  if (result.status !== 0) throw new Error('failed to create dead process identity');
  const [pid, ...start] = result.stdout.trim().split('\n');
  return Object.freeze({ pid: Number(pid), start: start.join(' ').trim() });
}

function processStart(pid: number): string {
  const result = spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
  if (result.status !== 0 || result.stdout.trim() === '') {
    throw new Error(`process identity unavailable for ${pid}`);
  }
  return result.stdout.trim();
}

function lifecycleAdmin(home: string): string {
  return join(home, '.warpkeep', 'private', 'production-admin-v1');
}

function allocateLifecycle(
  home: string,
  identity: Readonly<{ pid: number; start: string }> = deadProcessIdentity(),
  command = 'import-inspect',
  ...commandArguments: string[]
): string {
  const result = runLifecycle(
    'allocate',
    home,
    '1'.repeat(40),
    '2'.repeat(40),
    '3'.repeat(40),
    '4'.repeat(64),
    String(identity.pid),
    identity.start,
    command,
    ...commandArguments,
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

function inspectLifecycle(home: string, runId: string): Record<string, unknown> {
  const result = runLifecycle('inspect', home, runId);
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.keys(current).sort().map(key => [
        key,
        normalize((current as Record<string, unknown>)[key]),
      ]));
    }
    return current;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

function readLaunchFixture(runRoot: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(runRoot, 'launch-record.json'), 'utf8'),
  ) as Record<string, unknown>;
}

function writeLaunchFixture(runRoot: string, launch: Record<string, unknown>): void {
  writeFileSync(join(runRoot, 'launch-record.json'), canonicalJson(launch), { mode: 0o600 });
  chmodSync(join(runRoot, 'launch-record.json'), 0o600);
}

function bootstrapInputForRun(runRoot: string, command: string, ...arguments_: string[]) {
  const values = baseArguments(command, ...arguments_);
  values[0] = runRoot;
  values[1] = join(runRoot, 'repository');
  return parseGreaterRealmProductionBootstrapArguments(values);
}

function appendLifecycleFixture(
  runRoot: string,
  phase: string,
  updates: Record<string, unknown> = {},
) {
  const latest = greaterRealmProductionBootstrapTestSeams
    .readLaunchLifecycleChain(runRoot).records.at(-1);
  if (latest === undefined) throw new Error('lifecycle predecessor missing');
  return greaterRealmProductionBootstrapTestSeams.publishLaunchLifecycleRecord(
    runRoot,
    {
      ...latest.record,
      ordinal: latest.record.ordinal + 1,
      phase,
      previousRecordSha256: latest.digest,
      ...updates,
    },
  );
}

function completeUncompactedLifecycle(home: string): Readonly<{
  runId: string;
  runRoot: string;
  confirmation: string;
  complete: { record: Record<string, unknown>; digest: string };
}> {
  const runRoot = allocateLifecycle(home);
  const runId = basename(runRoot);
  const inspected = inspectLifecycle(home, runId);
  const launchBytes = readFileSync(join(runRoot, 'launch-record.json'));
  appendLifecycleFixture(runRoot, 'cleanup-prepared', {
    launchRecordSha256: createHash('sha256').update(launchBytes).digest('hex'),
    cleanupConfirmationSha256: inspected.confirmationDigest,
    cleanupTreeInventorySha256:
      (inspected.treeInventory as Record<string, unknown>).digest,
    cleanupReason: 'confirmed-dead-owner',
  });
  appendLifecycleFixture(runRoot, 'tree-removing');
  rmSync(runRoot, { recursive: true });
  appendLifecycleFixture(runRoot, 'run-removed');
  const complete = appendLifecycleFixture(runRoot, 'complete');
  return Object.freeze({
    runId,
    runRoot,
    confirmation: String(inspected.confirmationDigest),
    complete,
  });
}

function baseArguments(command: string, ...arguments_: string[]): string[] {
  const root = '/private/tmp/warpkeep-production-admin/run-' + 'a'.repeat(32);
  const adminCommands = new Set([
    'import-inspect', 'import-apply', 'import-recover', 'publish', 'publish-recover', 'relocation',
    'relocation-recover', 'verify', 'pages-active-evidence', 'hermes-list-pending',
    'hermes-admit-confirm', 'hermes-allow-confirm',
    'hermes-notification-recover-dry', 'hermes-notification-recover-confirm',
  ]);
  const notificationCommands = new Set([
    'hermes-admit-confirm', 'hermes-allow-confirm', 'hermes-notification-inspect',
    'hermes-notification-recover-dry', 'hermes-notification-recover-confirm',
  ]);
  const privateInputCommands = new Set(['hermes-admit-dry', 'hermes-admit-confirm']);
  return [
    root,
    `${root}/repository`,
    '1'.repeat(40),
    '2'.repeat(40),
    '3'.repeat(40),
    '4'.repeat(64),
    '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node',
    command === 'publish' || command === 'publish-recover'
      ? '/private/toolchain/spacetime'
      : '-',
    command === 'publish' || command === 'publish-recover'
      ? '/private/credentials/spacetime-cli.toml'
      : '-',
    adminCommands.has(command) ? '/private/credentials/admin-secret' : '-',
    notificationCommands.has(command) ? '/private/credentials/notification-secret' : '-',
    privateInputCommands.has(command) ? '/private/inputs/founder-admission.json' : '-',
    command,
    ...arguments_,
  ];
}

describe('Greater Realm production bootstrap', () => {
  const testNativeTypeScriptPackage =
    `@typescript/typescript-${process.platform}-${process.arch}`;
  it('parses only the exact command envelope and rejects option injection', () => {
    expect(parseGreaterRealmProductionBootstrapArguments(
      baseArguments('import-apply'),
    ).commandArguments).toEqual(['apply', '--confirm']);
    expect(parseGreaterRealmProductionBootstrapArguments(
      baseArguments('verify', '600'),
    ).commandArguments).toEqual(['--expected-founder-count=600']);
    expect(parseGreaterRealmProductionBootstrapArguments(
      baseArguments('pages-active-evidence', '600'),
    )).toMatchObject({
      commandArguments: ['--expected-founder-count=600'],
      adminSecretPath: '/private/credentials/admin-secret',
      notificationSecretPath: undefined,
      privateInputPath: undefined,
    });
    expect(parseGreaterRealmProductionBootstrapArguments(
      baseArguments('publish-recover-inspect'),
    ).commandArguments).toEqual(['recover-inspect']);
    expect(parseGreaterRealmProductionBootstrapArguments(
      baseArguments('hermes-list-pending'),
    )).toMatchObject({
      commandArguments: ['list-pending-access-requests'],
      adminSecretPath: '/private/credentials/admin-secret',
      notificationSecretPath: undefined,
      privateInputPath: undefined,
    });
    expect(() => parseGreaterRealmProductionBootstrapArguments(
      baseArguments('hermes-list-pending', 'unexpected'),
    )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
    expect(parseGreaterRealmProductionBootstrapArguments(baseArguments(
      'publish-recover',
      'b'.repeat(64),
      '8',
      '7',
      '4',
      '20',
    )).commandArguments).toEqual(['recover', `--confirm-recovery=${'b'.repeat(64)}`]);
    const localImportRecovery = baseArguments('import-recover', 'a'.repeat(64));
    localImportRecovery[9] = '-';
    expect(parseGreaterRealmProductionBootstrapArguments(localImportRecovery))
      .toMatchObject({ adminSecretPath: undefined });
    expect(() => parseGreaterRealmProductionBootstrapArguments(
      baseArguments('verify', '601'),
    )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
    for (const founderCount of ['0', '01', '601', '600\n']) {
      expect(() => parseGreaterRealmProductionBootstrapArguments(
        baseArguments('pages-active-evidence', founderCount),
      )).toThrow(/(?:COMMAND_)?ARGUMENTS_INVALID/);
    }
    expect(() => parseGreaterRealmProductionBootstrapArguments(
      baseArguments('hermes-allow-confirm', '123', '--confirm'),
    )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
    const invalidCommit = baseArguments('import-inspect');
    invalidCommit[2] = 'A'.repeat(40);
    expect(() => parseGreaterRealmProductionBootstrapArguments(invalidCommit))
      .toThrow(/ARGUMENTS_INVALID/);
    expect(() => parseGreaterRealmProductionBootstrapArguments(
      baseArguments('publish', '--option-injection', '1', '1', '1', '1'),
    )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
  });

  it('accepts only canonical semantically bounded publish aggregate counts', () => {
    const validRows = [
      ['append-inert-v17', '1', '0', '0', '0'],
      ['append-inert-v17', '7', '5', '3', '15'],
      ['append-inert-v17', '100', '100', '100', '500'],
    ] as const;
    for (const arguments_ of validRows) {
      const parsed = parseGreaterRealmProductionBootstrapArguments(
        baseArguments('publish', ...arguments_),
      );
      expect(parsed.commandArguments).toEqual([arguments_[0], '--confirm']);
      expect(parsed.launchArguments).toEqual(arguments_);
      expect(parsed.publishExpectationEnvironment).toEqual({
        WARPKEEP_EXPECTED_FOUNDER_COUNT: arguments_[1],
        WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: arguments_[2],
        WARPKEEP_EXPECTED_PLAYER_COUNT: arguments_[3],
        WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: arguments_[4],
      });
    }

    const invalidRows = [
      ['missing counts', ['append-inert-v17']],
      ['missing terms', ['append-inert-v17', '1', '1', '1']],
      ['extra count', ['append-inert-v17', '1', '1', '1', '1', '0']],
      ['leading zero', ['append-inert-v17', '01', '1', '1', '1']],
      ['founder below range', ['append-inert-v17', '0', '0', '0', '0']],
      ['founder above range', ['append-inert-v17', '101', '0', '0', '0']],
      ['enabled exceeds founder', ['append-inert-v17', '2', '3', '0', '0']],
      ['players exceed founder', ['append-inert-v17', '2', '0', '3', '0']],
      ['terms exceed five per player', ['append-inert-v17', '2', '0', '1', '6']],
      ['negative count', ['append-inert-v17', '2', '0', '-1', '0']],
    ] as const;
    for (const [, arguments_] of invalidRows) {
      expect(() => parseGreaterRealmProductionBootstrapArguments(
        baseArguments('publish', ...arguments_),
      )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
    }
    expect(() => parseGreaterRealmProductionBootstrapArguments(
      baseArguments('import-inspect', '1', '0', '0', '0'),
    )).toThrow(/COMMAND_ARGUMENTS_INVALID/);
  });

  it('injects publish aggregate expectations into only the publish child', () => {
    const runtime = { nodePath: '/private/runtime/node' };
    const npm = {
      environment: {
        HOME: '/private/run/npm-home',
        PATH: '/private/run:/usr/bin:/bin',
        TMPDIR: '/private/run/tmp',
      },
      moduleCache: '/private/run/module-cache',
    };
    const publish = parseGreaterRealmProductionBootstrapArguments(baseArguments(
      'publish',
      'append-inert-v17',
      '8',
      '7',
      '4',
      '20',
    ));
    const publishEnvironment = greaterRealmProductionBootstrapTestSeams
      .finalOperatorEnvironment(publish, runtime, npm, undefined);
    expect(Object.fromEntries(Object.entries(publishEnvironment).filter(([key]) => (
      key.startsWith('WARPKEEP_EXPECTED_')
    )))).toEqual({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '8',
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '7',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '20',
    });

    const nonPublish = parseGreaterRealmProductionBootstrapArguments(
      baseArguments('import-inspect'),
    );
    const nonPublishEnvironment = greaterRealmProductionBootstrapTestSeams
      .finalOperatorEnvironment(nonPublish, runtime, npm, undefined);
    expect(Object.keys(nonPublishEnvironment).filter(key => (
      key.startsWith('WARPKEEP_EXPECTED_')
    ))).toEqual([]);

    const recovery = parseGreaterRealmProductionBootstrapArguments(baseArguments(
      'publish-recover',
      'b'.repeat(64),
      '8',
      '7',
      '4',
      '20',
    ));
    const recoveryEnvironment = greaterRealmProductionBootstrapTestSeams
      .finalOperatorEnvironment(recovery, runtime, npm, undefined);
    expect(Object.fromEntries(Object.entries(recoveryEnvironment).filter(([key]) => (
      key.startsWith('WARPKEEP_EXPECTED_')
    )))).toEqual({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '8',
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '7',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '20',
    });
  });

  it('pins the reviewed publish count order and bound in the static launch envelope', () => {
    const bootstrap = readFileSync('scripts/greater-realm-production-bootstrap.mjs', 'utf8');
    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    const policy = readFileSync('scripts/entry-agreement-policy.mjs', 'utf8');
    expect(envelope).toContain(
      'LANE FOUNDER_COUNT ENABLED_ALLOWED_FID_COUNT PLAYER_COUNT TERMS_ACCEPTANCE_COUNT',
    );
    expect(envelope).toContain(
      'CONFIRMATION_DIGEST FOUNDER_COUNT ENABLED_ALLOWED_FID_COUNT PLAYER_COUNT TERMS_ACCEPTANCE_COUNT',
    );
    expect(envelope).toContain('if len(args) != 5');
    expect(envelope).toContain('founder,enabled,players,terms=map(int,args[1:])');
    expect(envelope).toContain('terms <= players * 5');
    expect(bootstrap).toContain(
      'const MAXIMUM_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER = 5;',
    );
    const historicalVersions = policy.match(
      /WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS = Object\.freeze\(\[([\s\S]*?)\]\);/u,
    )?.[1] ?? '';
    expect(1 + [...historicalVersions.matchAll(/'[^']+'/gu)].length).toBe(5);
    expect(policy).toContain(
      'WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length;',
    );
    expect(envelope).toContain(
      'for argument in command_args: argument_hash.update(framed("argument",argument))',
    );
    const base = ['append-inert-v17', '8', '7', '4', '20'];
    expect(greaterRealmProductionBootstrapTestSeams.launchArgumentsDigest('publish', base))
      .not.toBe(greaterRealmProductionBootstrapTestSeams.launchArgumentsDigest(
        'publish',
        ['append-inert-v17', '8', '7', '4', '19'],
      ));
    expect(() => parseGreaterRealmProductionBootstrapArguments(baseArguments(
      'publish', 'append-inert-v17', '8', '7', '4', '21',
    ))).toThrow(/COMMAND_ARGUMENTS_INVALID/);
  });

  it('maps each exact Hermes release row and enforces credential roles', () => {
    const recoveryPlan =
      `admission-notification-recovery-plan-20260811T130000000Z-${'a'.repeat(32)}.json`;
    const rows = [
      ['hermes-list-pending', [], ['list-pending-access-requests']],
      ['hermes-admit-dry', [], ['admit-founder', '--input-stdin', '--dry-run']],
      ['hermes-admit-confirm', [], ['admit-founder', '--input-stdin', '--confirm']],
      ['hermes-allow-dry', ['123', 'reviewed note'],
        ['allow-fid', '123', 'reviewed note', '--dry-run']],
      ['hermes-allow-confirm', ['123', 'reviewed note'],
        ['allow-fid', '123', 'reviewed note', '--confirm']],
      ['hermes-notification-inspect', ['123'],
        ['inspect-admission-notification', '123', '--json']],
      ['hermes-notification-recover-dry', ['123', 'reviewed recovery'],
        ['recover-admission-notification', '123', 'reviewed recovery', '--input-stdin', '--dry-run']],
      ['hermes-notification-recover-confirm', [recoveryPlan, 'b'.repeat(64)],
        ['recover-admission-notification', recoveryPlan, 'b'.repeat(64), '--input-stdin', '--confirm']],
    ] as const;
    for (const [command, arguments_, expected] of rows) {
      const parsed = parseGreaterRealmProductionBootstrapArguments(
        baseArguments(command, ...arguments_),
      );
      expect(parsed.commandArguments).toEqual(expected);
      for (const index of [9, 10, 11]) {
        const wrong = baseArguments(command, ...arguments_);
        wrong[index] = wrong[index] === '-' ? `/private/unexpected/${index}` : '-';
        expect(() => parseGreaterRealmProductionBootstrapArguments(wrong))
          .toThrow(/COMMAND_ARGUMENTS_INVALID/);
      }
    }
  });

  it('gives the no-argument pending census only an admin secret and private report directory', () => {
    const parsed = parseGreaterRealmProductionBootstrapArguments(
      baseArguments('hermes-list-pending'),
    );
    const environment = greaterRealmProductionBootstrapTestSeams.finalOperatorEnvironment(
      parsed,
      { nodePath: '/private/runtime/node' },
      {
        environment: {
          HOME: '/private/run/npm-home',
          PATH: '/private/run:/usr/bin:/bin',
          TMPDIR: '/private/run/tmp',
        },
        moduleCache: '/private/run/module-cache',
      },
      { pendingCensus: '/private/reports/pending-access-requests' },
    );
    expect(environment).toMatchObject({
      WKGR_HERMES_RELEASE_COMMAND: 'list-pending',
      WKGR_PRODUCTION_PROTECTED_COMMIT: '1'.repeat(40),
      WKGR_PRODUCTION_ADMIN_SECRET_PATH: '/private/credentials/admin-secret',
      WKGR_HERMES_PENDING_CENSUS_DIRECTORY:
        '/private/reports/pending-access-requests',
      WARPKEEP_SPACETIMEDB_DATABASE:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    });
    expect(environment).not.toHaveProperty('WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH');
    expect(environment).not.toHaveProperty('WKGR_PRODUCTION_PRIVATE_INPUT_PATH');
    expect(environment).not.toHaveProperty('WKGR_HERMES_FOUNDER_PLAN_DIRECTORY');
    expect(environment).not.toHaveProperty(
      'WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY',
    );

    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    expect(envelope).toContain(
      'hermes-list-pending|hermes-admit-dry',
    );
    expect(envelope).toMatch(
      /hermes-list-pending\)\n    \[ "\$#" -eq 0 \]/u,
    );
  });

  it('gives active-v17 Pages evidence only one count and the administrator secret', () => {
    const parsed = parseGreaterRealmProductionBootstrapArguments(
      baseArguments('pages-active-evidence', '417'),
    );
    expect(parsed).toMatchObject({
      commandArguments: ['--expected-founder-count=417'],
      adminSecretPath: '/private/credentials/admin-secret',
      notificationSecretPath: undefined,
      privateInputPath: undefined,
      spacetimeExecutablePath: undefined,
      spacetimeCliConfigPath: undefined,
    });
    for (const index of [9, 10, 11]) {
      const wrong = baseArguments('pages-active-evidence', '417');
      wrong[index] = wrong[index] === '-' ? `/private/unexpected/${index}` : '-';
      expect(() => parseGreaterRealmProductionBootstrapArguments(wrong))
        .toThrow(/COMMAND_ARGUMENTS_INVALID/);
    }

    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    expect(envelope).toContain('verify|pages-active-evidence|hermes-list-pending');
    expect(envelope).toMatch(
      /pages-active-evidence\)\n    \/usr\/bin\/python3[\s\S]*?1-5\]\[0-9\]\{2\}\|600/u,
    );
  });

  it('requires the Maincloud CLI authority for publish and couples optional recovery roles', () => {
    expect(parseGreaterRealmProductionBootstrapArguments(baseArguments(
      'publish',
      'append-inert-v17',
      '1',
      '1',
      '1',
      '1',
    ))).toMatchObject({
      spacetimeExecutablePath: '/private/toolchain/spacetime',
      spacetimeCliConfigPath: '/private/credentials/spacetime-cli.toml',
    });
    const missing = baseArguments('publish', 'append-inert-v17', '1', '1', '1', '1');
    missing[8] = '-';
    expect(() => parseGreaterRealmProductionBootstrapArguments(missing))
      .toThrow(/COMMAND_ARGUMENTS_INVALID/);
    const unexpected = baseArguments('import-inspect');
    unexpected[8] = '/private/credentials/spacetime-cli.toml';
    expect(() => parseGreaterRealmProductionBootstrapArguments(unexpected))
      .toThrow(/COMMAND_ARGUMENTS_INVALID/);

    const localRecovery = baseArguments(
      'publish-recover',
      'b'.repeat(64),
      '1',
      '1',
      '1',
      '1',
    );
    localRecovery[7] = '-';
    localRecovery[8] = '-';
    localRecovery[9] = '-';
    expect(parseGreaterRealmProductionBootstrapArguments(localRecovery)).toMatchObject({
      spacetimeExecutablePath: undefined,
      spacetimeCliConfigPath: undefined,
      adminSecretPath: undefined,
    });
    const partialRecovery = [...localRecovery];
    partialRecovery[7] = '/private/toolchain/spacetime';
    expect(() => parseGreaterRealmProductionBootstrapArguments(partialRecovery))
      .toThrow(/COMMAND_ARGUMENTS_INVALID/);
  });

  it('selects the exact 16-package darwin-arm64 module closure', () => {
    const lock = parse(readFileSync('spacetimedb/pnpm-lock.yaml', 'utf8'));
    const packages = selectGreaterRealmDarwinArm64ModulePackages(lock);
    expect(packages).toHaveLength(16);
    expect(packages.map((value: { key: string }) => value.key)).toContain(
      'get-tsconfig@4.14.0',
    );
    expect(packages.map((value: { key: string }) => value.key)).toContain(
      '@esbuild/darwin-arm64@0.25.12',
    );
  });

  it('stages and reattests only the exact Hermes parser resolver', () => {
    const root = hermesParserResolverFixture();
    const installed = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(root, testNativeTypeScriptPackage);
    const resolverRoot = join(root, 'services', 'auth-bridge', 'node_modules');
    expect(lstatSync(resolverRoot).mode & 0o7777).toBe(0o700);
    expect(readdirSync(resolverRoot).sort()).toEqual(['typescript', 'yaml']);
    expect(readlinkSync(join(resolverRoot, 'typescript')))
      .toBe('../../../node_modules/typescript');
    expect(readlinkSync(join(resolverRoot, 'yaml')))
      .toBe('../../../node_modules/yaml');
    expect(installed.packageIdentities).toMatchObject({
      [testNativeTypeScriptPackage]: {
        digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      typescript: { digest: expect.stringMatching(/^[0-9a-f]{64}$/u) },
      yaml: { digest: expect.stringMatching(/^[0-9a-f]{64}$/u) },
    });
    expect(greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(root, installed))
      .toEqual(installed);
  });

  it('attests the platform-specific installed npm lock and hardened modes', () => {
    const exact = installedRootClosureFixture();
    expect(greaterRealmProductionBootstrapTestSeams
      .attestInstalledRootDependencyClosure(exact, 'linux', 'x64'))
      .toMatchObject({
        platform: 'linux',
        architecture: 'x64',
        installedPackageCount: 2,
      });

    const polluted = installedRootClosureFixture();
    const installedPath = join(polluted, 'node_modules', '.package-lock.json');
    const installed = JSON.parse(readFileSync(installedPath, 'utf8')) as {
      packages: Record<string, unknown>;
    };
    const root = JSON.parse(readFileSync(
      join(polluted, 'package-lock.json'),
      'utf8',
    )) as { packages: Record<string, unknown> };
    installed.packages['node_modules/@typescript/typescript-darwin-arm64'] =
      root.packages['node_modules/@typescript/typescript-darwin-arm64'];
    writeFileSync(installedPath, `${JSON.stringify(installed)}\n`);
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestInstalledRootDependencyClosure(polluted, 'linux', 'x64'))
      .toThrow(/NPM_CLOSURE_INVALID/u);

    const writable = installedRootClosureFixture();
    chmodSync(join(writable, 'node_modules', '.package-lock.json'), 0o666);
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestInstalledRootDependencyClosure(writable, 'linux', 'x64'))
      .toThrow(/NPM_CLOSURE_INVALID/u);
  });

  it('attests the owner-private modes produced by the production umask', () => {
    const root = hermesParserResolverFixture();
    applyOwnerPrivateInstallModes(root);
    chmodSync(join(root, 'services', 'auth-bridge'), 0o750);
    const installed = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(root, testNativeTypeScriptPackage);
    expect(lstatSync(join(root, 'services', 'auth-bridge')).mode & 0o7777)
      .toBe(0o700);
    expect(installed.nativePackageName).toBe(testNativeTypeScriptPackage);
    expect(greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(root, installed))
      .toEqual(installed);
  });

  it('binds the fixed Darwin ARM64 native parser package in production', () => {
    const root = hermesParserResolverFixture({ includeProductionNative: true });
    const installed = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(root);
    expect(installed.nativePackageName)
      .toBe('@typescript/typescript-darwin-arm64');
    expect(installed.packageIdentities)
      .toHaveProperty('@typescript/typescript-darwin-arm64');
  });

  it('rejects preexisting, redirected, polluted, or mutated Hermes resolvers', () => {
    const preexisting = hermesParserResolverFixture();
    mkdirSync(join(preexisting, 'services', 'auth-bridge', 'node_modules'));
    expect(() => greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(
        preexisting,
        testNativeTypeScriptPackage,
      ))
      .toThrow(/HERMES_RESOLVER_INVALID/u);

    const redirected = hermesParserResolverFixture();
    const identity = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(
        redirected,
        testNativeTypeScriptPackage,
      );
    const resolverRoot = join(
      redirected,
      'services',
      'auth-bridge',
      'node_modules',
    );
    unlinkSync(join(resolverRoot, 'yaml'));
    symlinkSync('../../../node_modules/typescript', join(resolverRoot, 'yaml'));
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(redirected, identity))
      .toThrow(/HERMES_RESOLVER_INVALID/u);

    const polluted = hermesParserResolverFixture();
    const pollutedIdentity = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(
        polluted,
        testNativeTypeScriptPackage,
      );
    writeFileSync(
      join(polluted, 'services', 'auth-bridge', 'node_modules', 'extra'),
      'unreviewed\n',
    );
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(polluted, pollutedIdentity))
      .toThrow(/HERMES_RESOLVER_INVALID/u);

    const mutated = hermesParserResolverFixture();
    const mutatedIdentity = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(
        mutated,
        testNativeTypeScriptPackage,
      );
    const yamlManifest = join(mutated, 'node_modules', 'yaml', 'package.json');
    const original = readFileSync(yamlManifest, 'utf8');
    writeFileSync(yamlManifest, `${original}\n`);
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(mutated, mutatedIdentity))
      .toThrow(/HERMES_RESOLVER_INVALID/u);

    const nativeMutated = hermesParserResolverFixture();
    const nativeIdentity = greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(
        nativeMutated,
        testNativeTypeScriptPackage,
      );
    const nativeNotice = join(
      nativeMutated,
      'node_modules',
      '@typescript',
      `typescript-${process.platform}-${process.arch}`,
      'NOTICE.txt',
    );
    writeFileSync(nativeNotice, `${readFileSync(nativeNotice, 'utf8')}\n`);
    expect(() => greaterRealmProductionBootstrapTestSeams
      .attestHermesSourceParserResolver(nativeMutated, nativeIdentity))
      .toThrow(/HERMES_RESOLVER_INVALID/u);
  });

  it('makes a clean root-npm clone able to load durable Hermes authority', () => {
    const root = privateDirectory();
    const archive = spawnSync('git', [
      'archive', 'HEAD',
      'scripts',
      'package.json',
      'package-lock.json',
      'services/auth-bridge/package.json',
    ], {
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(archive.status).toBe(0);
    const extracted = spawnSync('tar', ['-x', '-C', root], {
      encoding: null,
      input: archive.stdout,
      maxBuffer: 4 * 1024 * 1024,
    });
    expect(extracted.status).toBe(0);
    materializeHermesParserRootDependencies(root);
    const authorityUrl = pathToFileURL(join(
      root,
      'scripts',
      'notification-pages-live-hermes-authority.mjs',
    )).href;
    const program = [
      `const authority = await import(${JSON.stringify(authorityUrl)});`,
      'const result = await authority.inspectHermesNotificationPagesLiveAuthority({ required: false });',
      'process.stdout.write(`${JSON.stringify(result)}\\n`);',
    ].join('\n');
    const before = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin' },
    });
    expect(before.status).not.toBe(0);
    expect(before.stderr).toMatch(/ERR_MODULE_NOT_FOUND/u);

    greaterRealmProductionBootstrapTestSeams
      .installHermesSourceParserResolver(root, testNativeTypeScriptPackage);
    const after = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin' },
    });
    expect(after.status).toBe(0);
    expect(JSON.parse(after.stdout)).toEqual({
      notificationPagesLiveBridgeSourceCommit: null,
      notificationPagesLivePagesSourceCommit: null,
      notificationPagesLiveReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
      notificationPagesLiveRootReceiptDigest: null,
    });
  });

  it('always reattests after the operator and preserves both failures', async () => {
    const events: string[] = [];
    await expect(greaterRealmProductionBootstrapTestSeams
      .runOperatorWithPostflightAttestation(
        async () => {
          events.push('operator');
          throw new Error('operator-failed');
        },
        async () => {
          events.push('postflight');
          throw new Error('resolver-changed');
        },
      )).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ message: 'operator-failed' }),
          expect.objectContaining({ message: 'resolver-changed' }),
        ],
      });
    expect(events).toEqual(['operator', 'postflight']);
    await expect(greaterRealmProductionBootstrapTestSeams
      .runOperatorWithPostflightAttestation(
        async () => 'operator-result',
        async () => undefined,
      )).resolves.toBe('operator-result');
  });

  it('fills an empty isolated module cache with all exact SHA-512 archives', async () => {
    const cacheRoot = privateDirectory();
    const bodies = Array.from({ length: 16 }, (_, index) => Buffer.from(`archive-${index}`));
    const packages = bodies.map((body, index) => Object.freeze({
      key: `package-${index}@1.0.0`,
      name: `package-${index}`,
      version: '1.0.0',
      integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
      dependencies: Object.freeze([]),
    }));
    const byUrl = new Map(packages.map((package_, index) => [
      canonicalNpmPackageTarballUrl(package_).href,
      bodies[index]!,
    ]));
    const fetched: string[] = [];
    await expect(stageGreaterRealmModuleArchives({
      cacheRoot,
      packages,
      fetchArchive: async (url: URL) => {
        fetched.push(url.href);
        return Buffer.from(byUrl.get(url.href)!);
      },
    })).resolves.toMatchObject({ packageCount: 16 });
    expect(fetched).toHaveLength(16);
    const firstDigest = createHash('sha512').update(bodies[0]!).digest('hex');
    const first = join(cacheRoot, '_cacache', 'content-v2', 'sha512',
      firstDigest.slice(0, 2), firstDigest.slice(2, 4), firstDigest.slice(4));
    expect(lstatSync(first).mode & 0o7777).toBe(0o600);

    fetched.length = 0;
    await stageGreaterRealmModuleArchives({
      cacheRoot,
      packages,
      fetchArchive: async () => { throw new Error('must-not-fetch'); },
    });
    expect(fetched).toEqual([]);
  });

  it('hard-fails every release production npm alias before tsx', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const name of [
      'stdb:greater-realm:import:inspect',
      'stdb:greater-realm:import:apply',
      'stdb:greater-realm:publish',
      'stdb:greater-realm:relocation',
      'verify:greater-realm-production',
      'verify:alpha-production:operator',
      'stdb:publish:dev',
      'profiles:plan',
      'profiles:refresh',
      'profiles:apply',
      'profiles:inspect',
      'stdb:admit-founder',
      'stdb:allow-fid',
      'stdb:inspect-admission-notification',
      'stdb:recover-admission-notification',
      'stdb:seed-world',
      'stdb:expand-world-v3',
      'stdb:disable-fid',
      'stdb:bump-auth-epoch',
      'stdb:inspect-alpha',
      'stdb:inspect-alpha-v2',
      'stdb:inspect-alpha-v3',
      'stdb:inspect-alpha-v4',
      'stdb:inspect-alpha-v8',
      'stdb:inspect-alpha-v10',
      'stdb:inspect-alpha-v12',
      'stdb:list-access-requests',
      'stdb:inspect-access-request-reset',
      'stdb:reset-access-request',
      'stdb:seed-alpha-component',
      'stdb:activate-alpha-water',
      'stdb:backfill-resources',
      'stdb:daily-marks:inspect',
      'stdb:daily-marks:backfill',
      'stdb:daily-marks:activate',
      'stdb:inspect-water-revision',
      'stdb:seed-water-revision',
      'stdb:activate-water-revision',
      'stdb:inner-keep:inspect',
      'stdb:inner-keep:plan-catalog',
      'stdb:inner-keep:seed-catalog',
      'stdb:inner-keep:plan-builders',
      'stdb:inner-keep:backfill-builders',
      'stdb:inner-keep:activate',
      'stdb:inner-keep:deactivate',
      'stdb:worker-rollout',
      'stdb:worker-rollout:inspect',
      'stdb:worker-rollout:stage',
      'stdb:worker-rollout:backfill',
      'stdb:worker-rollout:begin-drain',
      'stdb:worker-rollout:complete-drain',
      'stdb:worker-rollout:activate',
      'stdb:worker-return-repair',
      'stdb:worker-return-repair:inspect',
      'stdb:worker-return-repair:apply',
    ]) {
      expect(manifest.scripts[name]).toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
      expect(manifest.scripts[name]).toMatch(/\/usr\/bin\/printf .*\/usr\/bin\/false$/u);
      expect(manifest.scripts[name]).not.toMatch(/\b(?:node|tsx|spacetime)\b/u);
    }
    const forbiddenEntrypoints = [
      'hermes-admin.ts',
      'profiles/profiles-operator.ts',
      'daily-marks-operator.ts',
      'water-revision-operator.ts',
      'inner-keep-operator.ts',
      'worker-rollout-operator.ts',
      'worker-return-repair-operator.ts',
      'publish-spacetime-dev.mjs',
      'verify-alpha-production.mjs --require-auth-v2-enabled --require-rpc-role-attestation',
    ];
    expect(Object.entries(manifest.scripts).filter(([, command]) => (
      forbiddenEntrypoints.some(entrypoint => String(command).includes(entrypoint))
    ))).toEqual([]);
  });

  it('constructs proof children from only the explicit staged runtime', () => {
    const runRoot = privateDirectory();
    const nodeExecutable = join(runRoot, 'node');
    const homeDirectory = join(runRoot, 'npm-home');
    const temporaryDirectory = join(runRoot, 'tmp');
    const nodeBytes = Buffer.from('test-only-staged-node\n');
    writeFileSync(nodeExecutable, nodeBytes, { mode: 0o500 });
    mkdirSync(homeDirectory, { mode: 0o700 });
    mkdirSync(temporaryDirectory, { mode: 0o700 });
    const environment = greaterRealmImmutableArtifactTestSeams.proofChildEnvironment({
      nodeExecutable,
      homeDirectory,
      temporaryDirectory,
    }, '/private/toolchain/spacetime', createHash('sha256').update(nodeBytes).digest('hex'));
    expect(environment).toEqual({
      HOME: homeDirectory,
      PATH: `${runRoot}:/usr/bin:/bin`,
      TMPDIR: temporaryDirectory,
      SPACETIME_BIN: '/private/toolchain/spacetime',
    });
    expect(environment.PATH).not.toMatch(/node_modules|pnpm|npm/u);
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
    expect(environment).not.toHaveProperty('DYLD_INSERT_LIBRARIES');
    expect(environment).not.toHaveProperty('LD_PRELOAD');
  });

  it('pins the reviewed OpenAI-signed Node and bundled npm runtimes consistently', () => {
    const source = readFileSync('scripts/greater-realm-production-bootstrap.mjs', 'utf8');
    const immutableArtifact = readFileSync(
      'scripts/greater-realm-production-immutable-artifact.ts',
      'utf8',
    );
    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    const version = 'v24.19.0';
    const sha256 = '714024e01b43d82baacc136f44770a75017e9c7858542bad6746f19e7f15635d';
    const npmVersion = '11.17.0';
    const npmTreeSha256 =
      'a2a9f70444ecf3a3c487a5580ef60f0f1595495af2a886c03c1495f7110c25f9';

    expect(source).toContain(`const EXPECTED_NODE_VERSION = '${version}';`);
    expect(source).toContain(`const EXPECTED_NODE_SHA256 = '${sha256}';`);
    expect(immutableArtifact).toContain(`const TRUSTED_NODE_SHA256 = '${sha256}';`);
    expect(source).toContain("const EXPECTED_NODE_TEAM = '2DC432GLL2';");
    expect(source).toContain(`const EXPECTED_NPM_VERSION = '${npmVersion}';`);
    expect(source).toContain(`const EXPECTED_NPM_TREE_SHA256 = '${npmTreeSha256}';`);
    expect(source).toContain('const EXPECTED_NPM_TREE_ENTRIES = 2_375;');
    expect(source).toContain(
      "'warpkeep-chatgpt-bundled-npm-11.17.0-tree-v1'",
    );
    expect(envelope).toContain(`= ${sha256} ]`);
    expect(envelope).toContain(`[ "$("$staged_node" --version)" = ${version} ]`);
    expect(envelope).toContain('TeamIdentifier=2DC432GLL2');
  });

  it('binds the launch record before the one-shot detached operator gate', () => {
    const source = readFileSync('scripts/greater-realm-production-bootstrap.mjs', 'utf8');
    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    const gated = source.indexOf("phase: 'operator-gated'");
    const yielded = source.indexOf('setImmediate(resolvePromise)', gated);
    const released = source.indexOf("writeGate(child.stdio[3], 'WKGR_RELEASE_OPERATOR_START_V1", yielded);
    const running = source.indexOf("phase: 'operator-running'", released);
    expect(gated).toBeGreaterThan(-1);
    expect(yielded).toBeGreaterThan(gated);
    expect(released).toBeGreaterThan(yielded);
    expect(running).toBeGreaterThan(released);
    expect(source).toContain('detached: true');
    expect(envelope).toContain('exec /usr/bin/env -i PATH=/usr/bin:/bin');

    const digest = greaterRealmProductionBootstrapTestSeams.launchArgumentsDigest(
      'import-inspect',
      [],
    );
    expect(greaterRealmProductionBootstrapTestSeams.parseLaunchRecord({
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-production-launch-v1',
      phase: 'launch-prepared',
      pid: process.pid,
      processStartIdentity: 'Wed Aug 12 12:34:56 2026',
      runDev: '123',
      runIno: '456',
      protectedMain: '1'.repeat(40),
      moduleTree: '2'.repeat(40),
      bootstrapBlob: '3'.repeat(40),
      bootstrapSha256: '4'.repeat(64),
      command: 'import-inspect',
      commandArgumentsSha256: digest,
      childPid: null,
      childProcessStartIdentity: null,
      childPgid: null,
      terminal: null,
    })).toMatchObject({ commandArgumentsSha256: digest });
  });

  it('branches local lifecycle rows before allocation, runtime, credentials, and network', () => {
    const envelope = readFileSync(
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
      'utf8',
    );
    const lifecycleDispatch = envelope.indexOf('case "$production_command" in\n  launch-run-inspect)');
    const allocation = envelope.indexOf('state_root=$(run_launch_lifecycle allocate');
    const network = envelope.indexOf('git_safe ls-remote');
    const runtime = envelope.indexOf('/usr/bin/codesign --verify');
    expect(lifecycleDispatch).toBeGreaterThan(-1);
    expect(lifecycleDispatch).toBeLessThan(allocation);
    expect(lifecycleDispatch).toBeLessThan(network);
    expect(lifecycleDispatch).toBeLessThan(runtime);
    expect(envelope).toContain(
      '[ "$bundle_node:$spacetime_executable:$spacetime_cli_config:$admin_secret:$notification_secret:$private_input" = -:-:-:-:-:- ]',
    );
    expect(envelope).toContain('run_launch_lifecycle cleanup "$account_home" "$@"');
    expect(envelope).not.toContain('LIFECYCLE_CLEANUP_NOT_INSTALLED');
  });

  it('publishes lifecycle authority with deterministic hard-link recovery', () => {
    const adminRoot = privateDirectory();
    const runs = join(adminRoot, 'bootstrap-runs-v1');
    const authority = join(adminRoot, 'bootstrap-run-lifecycle-v1');
    mkdirSync(runs, { mode: 0o700 });
    mkdirSync(authority, { mode: 0o700 });
    const runId = `run-${'a'.repeat(32)}`;
    const runRoot = join(runs, runId);
    mkdirSync(runRoot, { mode: 0o700 });
    const start = 'Wed Aug 12 12:34:56 2026';
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
      runId,
      ordinal: 1,
      phase: 'allocated',
      previousRecordSha256: null,
      pid: process.pid,
      processStartIdentity: start,
      protectedMain: '1'.repeat(40),
      moduleTree: '2'.repeat(40),
      bootstrapBlob: '3'.repeat(40),
      bootstrapSha256: '4'.repeat(64),
      command: 'historical-safe-row',
      commandArgumentsSha256: '5'.repeat(64),
      runDev: null,
      runIno: null,
      launchRecordSha256: null,
      containedChildPid: null,
      containedChildProcessStartIdentity: null,
      containedChildPgid: null,
      containmentConfirmationSha256: null,
      cleanupConfirmationSha256: null,
      cleanupTreeInventorySha256: null,
      cleanupReason: null,
    };
    greaterRealmProductionBootstrapTestSeams.publishLaunchLifecycleRecord(
      runRoot,
      record,
      { directory: authority },
    );
    const [finalName] = readdirSync(authority);
    const finalPath = join(authority, finalName!);
    const bytes = readFileSync(finalPath);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const startDigest = createHash('sha256').update(start).digest('hex');
    const temporaryPath = join(
      authority,
      `.${finalName}-${process.pid}-${startDigest}-${digest}.tmp`,
    );
    linkSync(finalPath, temporaryPath);
    expect(lstatSync(finalPath).nlink).toBe(2);
    const before = greaterRealmProductionBootstrapTestSeams.readLaunchLifecycleChain(
      runRoot,
      { directory: authority },
    );
    expect(before.records[0]).toMatchObject({ publicationState: 'linked' });
    const repaired = greaterRealmProductionBootstrapTestSeams
      .repairLaunchLifecyclePublications(runRoot, { directory: authority });
    expect(repaired.records[0]).toMatchObject({ publicationState: 'installed' });
    expect(existsSync(temporaryPath)).toBe(false);
    expect(lstatSync(finalPath).nlink).toBe(1);
  });

  it('inspects, confirms, deletes, and terminalizes one exact dead-owner run', () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const nested = join(runRoot, 'repository', 'nested');
    mkdirSync(nested, { recursive: true, mode: 0o700 });
    chmodSync(join(runRoot, 'repository'), 0o700);
    chmodSync(nested, 0o700);
    writeFileSync(join(nested, 'tracked.txt'), 'tracked\n', { mode: 0o644 });
    const external = join(home, 'must-survive.txt');
    writeFileSync(external, 'outside\n', { mode: 0o600 });
    symlinkSync(external, join(nested, 'outside-link'));
    const externalDirectory = join(home, 'must-survive-directory');
    mkdirSync(externalDirectory, { mode: 0o700 });
    writeFileSync(join(externalDirectory, 'outside.txt'), 'outside directory\n', { mode: 0o600 });
    symlinkSync(externalDirectory, join(nested, 'outside-directory-link'));

    const inspected = inspectLifecycle(home, runId);
    expect(inspected).toMatchObject({
      runId,
      runState: 'present',
      authorityPhase: 'launch-installed',
      launchPhase: 'launch-prepared',
      deletionEligible: true,
      cleanupEligible: true,
      blockers: [],
    });
    const confirmation = String(inspected.confirmationDigest);
    const cleaned = runLifecycle('cleanup', home, runId, confirmation);
    expect(cleaned.status, cleaned.stderr).toBe(0);
    expect(JSON.parse(cleaned.stdout)).toMatchObject({ outcome: 'cleaned', runId });
    expect(existsSync(runRoot)).toBe(false);
    expect(readFileSync(external, 'utf8')).toBe('outside\n');
    expect(readFileSync(join(externalDirectory, 'outside.txt'), 'utf8'))
      .toBe('outside directory\n');
    const authority = join(lifecycleAdmin(home), 'bootstrap-run-lifecycle-v1');
    expect(readdirSync(authority)).toEqual([`${runId}-terminal.json`]);

    const terminal = inspectLifecycle(home, runId);
    expect(terminal).toMatchObject({
      runState: 'absent',
      authorityPhase: 'complete',
      confirmationDigest: confirmation,
    });
    const repeated = runLifecycle('cleanup', home, runId, confirmation);
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({ outcome: 'already-complete' });
  });

  it('recovers authority-only and pre-install launch-record crash states', () => {
    const home = privateDirectory();
    const authorityOnlyRoot = allocateLifecycle(home);
    const authorityOnlyId = basename(authorityOnlyRoot);
    rmSync(authorityOnlyRoot, { recursive: true });
    const authorityOnly = inspectLifecycle(home, authorityOnlyId);
    expect(authorityOnly).toMatchObject({ runState: 'absent', deletionEligible: true });
    expect(runLifecycle(
      'cleanup', home, authorityOnlyId, String(authorityOnly.confirmationDigest),
    ).status).toBe(0);

    for (const crash of ['missing', 'partial-temp', 'partial-final'] as const) {
      const runRoot = allocateLifecycle(home);
      const runId = basename(runRoot);
      const authority = join(lifecycleAdmin(home), 'bootstrap-run-lifecycle-v1');
      unlinkSync(join(authority, `${runId}-00000003-launch-installed.json`));
      const launchPath = join(runRoot, 'launch-record.json');
      unlinkSync(launchPath);
      if (crash === 'partial-temp') {
        writeFileSync(
          join(runRoot, `.launch-record-launch-prepared-${'a'.repeat(64)}.json.tmp`),
          '{"schemaVersion":',
          { mode: 0o600 },
        );
      } else if (crash === 'partial-final') {
        writeFileSync(launchPath, '{"schemaVersion":', { mode: 0o600 });
      }
      const inspected = inspectLifecycle(home, runId);
      expect(inspected.deletionEligible, JSON.stringify(inspected)).toBe(true);
      const result = runLifecycle(
        'cleanup', home, runId, String(inspected.confirmationDigest),
      );
      expect(result.status, `${crash}: ${result.stderr}`).toBe(0);
      expect(existsSync(runRoot)).toBe(false);
    }
  });

  it('repairs a linked launch publication and inventories complete and partial update temps', () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const launchPath = join(runRoot, 'launch-record.json');
    const launchBytes = readFileSync(launchPath);
    const launchDigest = createHash('sha256').update(launchBytes).digest('hex');
    const linked = join(
      runRoot,
      `.launch-record-launch-prepared-${launchDigest}.json.tmp`,
    );
    linkSync(launchPath, linked);
    const update = { ...readLaunchFixture(runRoot), phase: 'bootstrap-validating' };
    const updateBytes = canonicalJson(update);
    const updateDigest = createHash('sha256').update(updateBytes).digest('hex');
    writeFileSync(
      join(runRoot, `.launch-record-bootstrap-validating-${updateDigest}.json.tmp`),
      updateBytes,
      { mode: 0o600 },
    );
    writeFileSync(
      join(runRoot, `.launch-record-operator-starting-${'b'.repeat(64)}.json.tmp`),
      '{"partial":',
      { mode: 0o600 },
    );

    const inspected = inspectLifecycle(home, runId);
    expect(inspected).toMatchObject({
      launchPublication: 'linked',
      repairableLaunchTemporaryCount: 2,
      deletionEligible: true,
    });
    const cleaned = runLifecycle(
      'cleanup', home, runId, String(inspected.confirmationDigest),
    );
    expect(cleaned.status, cleaned.stderr).toBe(0);
    expect(existsSync(runRoot)).toBe(false);
  });

  it('blocks cross-record replacement and run-inode replacement', () => {
    const home = privateDirectory();
    const mismatchRoot = allocateLifecycle(home);
    const mismatchId = basename(mismatchRoot);
    writeLaunchFixture(mismatchRoot, {
      ...readLaunchFixture(mismatchRoot),
      command: 'different-safe-row',
    });
    const mismatch = inspectLifecycle(home, mismatchId);
    expect(mismatch.blockers).toEqual(expect.arrayContaining([
      'authority-launch-record-mismatch',
    ]));
    expect(mismatch.deletionEligible).toBe(false);
    expect(runLifecycle(
      'cleanup', home, mismatchId, String(mismatch.confirmationDigest),
    )).toMatchObject({ status: 1 });

    const missingRecordRoot = allocateLifecycle(home);
    const missingRecordId = basename(missingRecordRoot);
    unlinkSync(join(missingRecordRoot, 'launch-record.json'));
    const missingRecord = inspectLifecycle(home, missingRecordId);
    expect(missingRecord.blockers).toEqual(expect.arrayContaining([
      'authority-launch-record-missing',
    ]));
    expect(missingRecord.deletionEligible).toBe(false);

    const replacedRoot = allocateLifecycle(home);
    const replacedId = basename(replacedRoot);
    const replacementRoot = `${replacedRoot}-replacement`;
    mkdirSync(replacementRoot, { mode: 0o700 });
    rmSync(replacedRoot, { recursive: true });
    renameSync(replacementRoot, replacedRoot);
    const replaced = inspectLifecycle(home, replacedId);
    expect(replaced.blockers).toEqual(expect.arrayContaining([
      'authority-run-identity-mismatch',
    ]));
    expect(replaced.deletionEligible).toBe(false);

    const danglingRoot = allocateLifecycle(home);
    const danglingId = basename(danglingRoot);
    rmSync(danglingRoot, { recursive: true });
    symlinkSync(join(home, 'missing-run-target'), danglingRoot);
    const dangling = runLifecycle('inspect', home, danglingId);
    expect(dangling.status).toBe(1);
    expect(dangling.stderr).toContain(
      'GREATER_REALM_PRODUCTION_LAUNCH_LIFECYCLE_DIRECTORY_INVALID',
    );
  });

  it('allows only validated complete immutable tombstones and blocks active materialization state', () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const materializations = join(lifecycleAdmin(home), 'immutable-publish-materializations');
    mkdirSync(materializations, { mode: 0o700 });
    const absentMaterialization = join(materializations, 'b'.repeat(32));
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-immutable-artifact-v1',
      materializationRoot: absentMaterialization,
      artifactPath: join(absentMaterialization, 'spacetimedb', 'dist', 'bundle.js'),
      artifactDigest: '1'.repeat(64),
      moduleSourceCommit: '2'.repeat(40),
      moduleTreeId: '3'.repeat(40),
      dependencyClosureDigest: '4'.repeat(64),
      materializationDev: '1',
      materializationIno: '2',
      artifactDev: '1',
      artifactIno: '3',
      artifactMode: '600',
      artifactUid: '501',
      artifactNlink: '1',
      artifactSize: '42',
      artifactMtimeNs: '1',
      artifactCtimeNs: '1',
    };
    const retentionDigest = createHash('sha256')
      .update('warpkeep-greater-realm-immutable-artifact-retention-v1\0', 'utf8')
      .update(JSON.stringify(record), 'utf8')
      .digest('hex');
    const tombstone = join(
      materializations,
      `.greater-realm-immutable-cleanup-${retentionDigest}.json`,
    );
    const tombstoneTemporary = join(
      materializations,
      `.greater-realm-immutable-cleanup-${retentionDigest}-${'c'.repeat(32)}.tmp`,
    );
    writeFileSync(
      tombstone,
      `${JSON.stringify({
        schemaVersion: 1,
        profile: 'warpkeep-greater-realm-immutable-artifact-cleanup-v1',
        retentionDigest,
        phase: 'complete',
        record,
      })}\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      tombstoneTemporary,
      '{"partial":',
      { mode: 0o600 },
    );
    expect(inspectLifecycle(home, runId)).toMatchObject({
      blockers: [],
      deletionEligible: true,
    });
    unlinkSync(tombstoneTemporary);
    linkSync(tombstone, tombstoneTemporary);
    expect(lstatSync(tombstone).nlink).toBe(2);
    expect(inspectLifecycle(home, runId)).toMatchObject({ blockers: [] });
    unlinkSync(tombstoneTemporary);

    const active = join(materializations, 'd'.repeat(32));
    mkdirSync(active, { mode: 0o700 });
    const blocked = inspectLifecycle(home, runId);
    expect(blocked.blockers).toContain('active-immutable-materialization');
    expect(blocked.deletionEligible).toBe(false);
    rmSync(active, { recursive: true });
    const unblocked = inspectLifecycle(home, runId);
    expect(runLifecycle(
      'cleanup', home, runId, String(unblocked.confirmationDigest),
    ).status).toBe(0);
  });

  it('self-cleans a completed current-owner run under the shared lifecycle lock', async () => {
    const home = privateDirectory();
    const owner = Object.freeze({ pid: process.pid, start: processStart(process.pid) });
    const runRoot = allocateLifecycle(home, owner);
    const child = deadProcessIdentity();
    const complete = {
      ...readLaunchFixture(runRoot),
      phase: 'complete',
      childPid: child.pid,
      childProcessStartIdentity: child.start,
      childPgid: child.pid,
      terminal: {
        code: 0,
        signal: null,
        interruptedBy: null,
        reason: 'operator-exit',
      },
    };
    writeLaunchFixture(runRoot, complete);
    const outcome = await greaterRealmProductionBootstrapTestSeams.cleanupCompletedRun(
      bootstrapInputForRun(runRoot, 'import-inspect'),
      greaterRealmProductionBootstrapTestSeams.parseLaunchRecord(complete),
    );
    expect(outcome).toMatchObject({ outcome: 'cleaned', runId: basename(runRoot) });
    expect(existsSync(runRoot)).toBe(false);
    expect(readdirSync(join(
      lifecycleAdmin(home),
      'bootstrap-run-lifecycle-v1',
    ))).toEqual([`${basename(runRoot)}-terminal.json`]);
  });

  it('retains successful recovery inspections while active cutover authority exists', async () => {
    for (const command of [
      'import-recover-inspect',
      'publish-recover-inspect',
      'relocation-recover-inspect',
    ]) {
      const home = privateDirectory();
      const owner = Object.freeze({ pid: process.pid, start: processStart(process.pid) });
      const runRoot = allocateLifecycle(home, owner, command);
      const child = deadProcessIdentity();
      const complete = {
        ...readLaunchFixture(runRoot),
        phase: 'complete',
        childPid: child.pid,
        childProcessStartIdentity: child.start,
        childPgid: child.pid,
        terminal: {
          code: 0,
          signal: null,
          interruptedBy: null,
          reason: 'operator-exit',
        },
      };
      writeLaunchFixture(runRoot, complete);
      const receipts = join(lifecycleAdmin(home), 'greater-realm-cutover-receipts');
      mkdirSync(receipts, { mode: 0o700 });
      writeFileSync(join(receipts, '.greater-realm-cutover-active.json'), '{}\n', {
        mode: 0o600,
      });
      const outcome = await greaterRealmProductionBootstrapTestSeams.cleanupCompletedRun(
        bootstrapInputForRun(runRoot, command),
        greaterRealmProductionBootstrapTestSeams.parseLaunchRecord(complete),
      );
      expect(outcome).toMatchObject({
        outcome: 'retained-active-cutover-authority',
        runId: basename(runRoot),
        blockers: ['active-cutover-wal-or-lock'],
      });
      expect(String(outcome.lifecycleRecordSha256)).toMatch(/^[0-9a-f]{64}$/u);
      expect(String(outcome.launchRecordSha256)).toMatch(/^[0-9a-f]{64}$/u);
      expect(existsSync(runRoot)).toBe(true);
      expect(inspectLifecycle(home, basename(runRoot))).toMatchObject({
        authorityPhase: 'launch-installed',
        launchPhase: 'complete',
      });
    }
  });

  it('durably contains an exact operator group before active WAL recovery and deletes only later', async () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const operator = spawn('/bin/sh', [
      '-c', "trap 'exit 0' TERM; while :; do /bin/sleep 0.05; done",
    ], {
      detached: true,
      stdio: 'ignore',
    });
    if (!Number.isSafeInteger(operator.pid) || operator.pid! < 2) {
      throw new Error('operator fixture pid unavailable');
    }
    const operatorClosed = new Promise<void>((resolvePromise, rejectPromise) => {
      operator.once('error', rejectPromise);
      operator.once('close', () => resolvePromise());
    });
    const operatorStart = processStart(operator.pid!);
    writeLaunchFixture(runRoot, {
      ...readLaunchFixture(runRoot),
      phase: 'operator-running',
      childPid: operator.pid,
      childProcessStartIdentity: operatorStart,
      childPgid: operator.pid,
    });
    const receipts = join(lifecycleAdmin(home), 'greater-realm-cutover-receipts');
    mkdirSync(receipts, { mode: 0o700 });
    const wal = join(receipts, '.greater-realm-cutover-active.json');
    writeFileSync(wal, '{}\n', { mode: 0o600 });
    const inspected = inspectLifecycle(home, runId);
    expect(inspected).toMatchObject({
      containmentEligible: true,
      cleanupEligible: true,
      deletionEligible: false,
      processGroupState: 'live',
    });
    expect(inspected.blockers).toEqual(expect.arrayContaining([
      'active-cutover-wal-or-lock',
      'live-operator',
      'live-operator-process-group',
    ]));
    const contained = await runLifecycleAsync(
      'cleanup', home, runId, String(inspected.confirmationDigest),
    );
    expect(contained.status, contained.stderr).toBe(0);
    expect(JSON.parse(contained.stdout)).toMatchObject({
      outcome: 'operator-contained',
      deletion: 'blocked-pending-fresh-inspect-and-cutover-recovery',
    });
    await operatorClosed;
    expect(existsSync(runRoot)).toBe(true);
    expect(inspectLifecycle(home, runId)).toMatchObject({
      authorityPhase: 'operator-contained',
      deletionEligible: false,
    });

    unlinkSync(wal);
    const recovered = inspectLifecycle(home, runId);
    expect(recovered).toMatchObject({
      authorityPhase: 'operator-contained',
      deletionEligible: true,
      blockers: [],
    });
    const cleaned = runLifecycle(
      'cleanup', home, runId, String(recovered.confirmationDigest),
    );
    expect(cleaned.status, cleaned.stderr).toBe(0);
    expect(existsSync(runRoot)).toBe(false);
  });

  it('bounds TERM-ignoring containment and contains descendants after their leader exits', async () => {
    const ignoring = spawn('/bin/sh', [
      '-c', "trap '' INT TERM; while :; do /bin/sleep 0.05; done",
    ], {
      detached: true,
      stdio: 'ignore',
    });
    if (!Number.isSafeInteger(ignoring.pid) || ignoring.pid! < 2) {
      throw new Error('TERM-ignoring fixture pid unavailable');
    }
    const ignoringClosed = new Promise<void>((resolvePromise, rejectPromise) => {
      ignoring.once('error', rejectPromise);
      ignoring.once('close', () => resolvePromise());
    });
    const ignoringStart = processStart(ignoring.pid!);
    await greaterRealmProductionBootstrapTestSeams.containProcessGroup({
      pgid: ignoring.pid,
      processStartIdentity: ignoringStart,
      initialSignal: 'SIGTERM',
      terminationGraceMs: 100,
      killGraceMs: 2_000,
      signalGroup: (signal: NodeJS.Signals) => {
        try { process.kill(-ignoring.pid!, signal); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      },
    });
    await ignoringClosed;

    const leader = spawn(process.execPath, [
      'tests/fixtures/greaterRealmBootstrapLifecycleGroupFixture.mjs',
    ], {
      cwd: process.cwd(),
      detached: true,
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!Number.isSafeInteger(leader.pid) || leader.pid! < 2) {
      throw new Error('leader fixture pid unavailable');
    }
    const leaderClosed = new Promise<void>((resolvePromise, rejectPromise) => {
      leader.once('error', rejectPromise);
      leader.once('close', () => resolvePromise());
    });
    const leaderStart = processStart(leader.pid!);
    let output = '';
    leader.stdout.setEncoding('utf8');
    await new Promise<void>((resolvePromise, rejectPromise) => {
      leader.once('error', rejectPromise);
      leader.stdout.on('data', chunk => {
        output += String(chunk);
        if (output.includes('READY\n')) resolvePromise();
      });
    });
    leader.stdin.end('release\n');
    await leaderClosed;
    expect(output).toMatch(/DESCENDANT [1-9][0-9]*\n/u);
    await greaterRealmProductionBootstrapTestSeams.containProcessGroup({
      pgid: leader.pid,
      processStartIdentity: leaderStart,
      initialSignal: 'SIGTERM',
      terminationGraceMs: 100,
      killGraceMs: 2_000,
      signalGroup: (signal: NodeJS.Signals) => {
        try { process.kill(-leader.pid!, signal); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      },
    });
    expect(() => process.kill(-leader.pid!, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
  });

  it('treats a reused owner as dead but never signals a reused live child group', async () => {
    const home = privateDirectory();
    const ownerReusedRoot = allocateLifecycle(home, {
      pid: process.pid,
      start: 'definitely-not-this-process-start',
    });
    const ownerReusedId = basename(ownerReusedRoot);
    const ownerInspection = inspectLifecycle(home, ownerReusedId);
    expect(ownerInspection).toMatchObject({ ownerState: 'live-reused', deletionEligible: true });
    expect(runLifecycle(
      'cleanup', home, ownerReusedId, String(ownerInspection.confirmationDigest),
    ).status).toBe(0);

    const ambiguousRoot = allocateLifecycle(home);
    const ambiguousId = basename(ambiguousRoot);
    const unrelated = spawn('/bin/sh', [
      '-c', "trap '' INT TERM; while :; do /bin/sleep 0.05; done",
    ], {
      detached: true,
      stdio: 'ignore',
    });
    if (!Number.isSafeInteger(unrelated.pid) || unrelated.pid! < 2) {
      throw new Error('reused child fixture pid unavailable');
    }
    const unrelatedClosed = new Promise<void>(resolvePromise => {
      unrelated.once('close', () => resolvePromise());
    });
    writeLaunchFixture(ambiguousRoot, {
      ...readLaunchFixture(ambiguousRoot),
      phase: 'operator-running',
      childPid: unrelated.pid,
      childProcessStartIdentity: 'definitely-not-this-child-start',
      childPgid: unrelated.pid,
    });
    const ambiguous = inspectLifecycle(home, ambiguousId);
    expect(ambiguous).toMatchObject({
      childState: 'live-reused',
      processGroupState: 'live',
      containmentEligible: false,
      cleanupEligible: false,
    });
    const refused = runLifecycle(
      'cleanup', home, ambiguousId, String(ambiguous.confirmationDigest),
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('CLEANUP_BLOCKED');
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    process.kill(-unrelated.pid!, 'SIGKILL');
    await unrelatedClosed;
  });

  it('marks a short real operator timeout, escalates to KILL, and proves the group absent', async () => {
    const home = privateDirectory();
    const owner = Object.freeze({ pid: process.pid, start: processStart(process.pid) });
    const runRoot = allocateLifecycle(home, owner);
    const cloneRoot = join(runRoot, 'repository');
    mkdirSync(cloneRoot, { mode: 0o700 });
    const fakeNode = join(runRoot, 'term-ignoring-node');
    writeFileSync(fakeNode, [
      '#!/bin/sh',
      "trap '' INT TERM",
      'while :; do /bin/sleep 0.05; done',
      '',
    ].join('\n'), { mode: 0o500 });
    writeLaunchFixture(runRoot, {
      ...readLaunchFixture(runRoot),
      phase: 'operator-starting',
    });
    const input = bootstrapInputForRun(runRoot, 'import-inspect');
    const controller = greaterRealmProductionBootstrapTestSeams.createSignalController();
    try {
      await expect(greaterRealmProductionBootstrapTestSeams.runFinalOperator(
        input,
        { nodePath: fakeNode },
        {
          environment: {
            HOME: join(runRoot, 'npm-home'),
            PATH: '/usr/bin:/bin',
            TMPDIR: join(runRoot, 'tmp'),
          },
          moduleCache: join(runRoot, 'module-cache'),
        },
        controller,
        undefined,
        { operatorTimeoutMs: 750, terminationGraceMs: 100, killGraceMs: 2_000 },
      )).rejects.toThrow(/OPERATOR_TIMED_OUT/u);
    } finally {
      controller.dispose();
    }
    const terminal = readLaunchFixture(runRoot);
    expect(terminal).toMatchObject({
      phase: 'operator-terminal',
      terminal: {
        signal: 'SIGKILL',
        interruptedBy: null,
        reason: 'timeout',
      },
    });
    expect(() => process.kill(-Number(terminal.childPgid), 0)).toThrow(
      expect.objectContaining({ code: 'ESRCH' }),
    );
  }, 15_000);

  it('repairs every terminal publication crash seam and compacts a surviving record suffix', () => {
    for (const state of ['prewrite', 'midwrite', 'prelink', 'linked'] as const) {
      const home = privateDirectory();
      const fixture = completeUncompactedLifecycle(home);
      const authority = join(lifecycleAdmin(home), 'bootstrap-run-lifecycle-v1');
      const terminal = {
        schemaVersion: 1,
        profile: 'warpkeep-greater-realm-production-launch-terminal-v1',
        runId: fixture.runId,
        finalLifecycleRecordSha256: fixture.complete.digest,
        finalLifecycleRecord: fixture.complete.record,
      };
      const terminalBytes = canonicalJson(terminal);
      const terminalDigest = createHash('sha256').update(terminalBytes).digest('hex');
      const temporary = join(
        authority,
        `.${fixture.runId}-terminal.json-${terminalDigest}.tmp`,
      );
      const final = join(authority, `${fixture.runId}-terminal.json`);
      if (state === 'prewrite') {
        writeFileSync(temporary, '', { mode: 0o600 });
      } else if (state === 'midwrite') {
        writeFileSync(temporary, terminalBytes.slice(0, 37), { mode: 0o600 });
      } else {
        writeFileSync(temporary, terminalBytes, { mode: 0o600 });
        if (state === 'linked') linkSync(temporary, final);
      }
      if (state === 'linked') expect(lstatSync(final).nlink).toBe(2);
      const cleaned = runLifecycle(
        'cleanup', home, fixture.runId, fixture.confirmation,
      );
      expect(cleaned.status, `${state}: ${cleaned.stderr}`).toBe(0);
      expect(readdirSync(authority)).toEqual([`${fixture.runId}-terminal.json`]);
      expect(lstatSync(final).nlink).toBe(1);
    }

    const home = privateDirectory();
    const fixture = completeUncompactedLifecycle(home);
    const authority = join(lifecycleAdmin(home), 'bootstrap-run-lifecycle-v1');
    const terminal = {
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-production-launch-terminal-v1',
      runId: fixture.runId,
      finalLifecycleRecordSha256: fixture.complete.digest,
      finalLifecycleRecord: fixture.complete.record,
    };
    writeFileSync(
      join(authority, `${fixture.runId}-terminal.json`),
      canonicalJson(terminal),
      { mode: 0o600 },
    );
    for (const name of readdirSync(authority)) {
      if (
        name.startsWith(`${fixture.runId}-`)
        && !name.endsWith('-tree-removing.json')
        && !name.endsWith('-run-removed.json')
        && !name.endsWith('-complete.json')
        && name !== `${fixture.runId}-terminal.json`
      ) unlinkSync(join(authority, name));
    }
    expect(inspectLifecycle(home, fixture.runId)).toMatchObject({
      authorityPhase: 'complete',
      runState: 'absent',
    });
    const resumed = runLifecycle(
      'cleanup', home, fixture.runId, fixture.confirmation,
    );
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(readdirSync(authority)).toEqual([`${fixture.runId}-terminal.json`]);
  });

  it('resumes exact mid-tree removal without reauthorizing against later unrelated blockers', () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const nested = join(runRoot, 'repository');
    mkdirSync(nested, { mode: 0o700 });
    writeFileSync(join(nested, 'already-removed.txt'), 'one\n', { mode: 0o644 });
    writeFileSync(join(nested, 'still-present.txt'), 'two\n', { mode: 0o644 });
    const inspected = inspectLifecycle(home, runId);
    const launchDigest = createHash('sha256')
      .update(readFileSync(join(runRoot, 'launch-record.json'))).digest('hex');
    appendLifecycleFixture(runRoot, 'cleanup-prepared', {
      launchRecordSha256: launchDigest,
      cleanupConfirmationSha256: inspected.confirmationDigest,
      cleanupTreeInventorySha256:
        (inspected.treeInventory as Record<string, unknown>).digest,
      cleanupReason: 'confirmed-dead-owner',
    });
    appendLifecycleFixture(runRoot, 'tree-removing');
    unlinkSync(join(nested, 'already-removed.txt'));
    const receipts = join(lifecycleAdmin(home), 'greater-realm-cutover-receipts');
    mkdirSync(receipts, { mode: 0o700 });
    writeFileSync(join(receipts, '.greater-realm-cutover-later.json'), '{}\n', { mode: 0o600 });
    const resumed = inspectLifecycle(home, runId);
    expect(resumed).toMatchObject({
      authorityPhase: 'tree-removing',
      blockers: [],
      deletionEligible: true,
      confirmationDigest: inspected.confirmationDigest,
    });
    const cleaned = runLifecycle(
      'cleanup', home, runId, String(resumed.confirmationDigest),
    );
    expect(cleaned.status, cleaned.stderr).toBe(0);
    expect(existsSync(runRoot)).toBe(false);
  });

  it('confirmed cleanup clears dead-or-reused partial authority but refuses an unowned run', () => {
    const home = privateDirectory();
    const seedRoot = allocateLifecycle(home);
    const admin = lifecycleAdmin(home);
    const authority = join(admin, 'bootstrap-run-lifecycle-v1');
    const runs = join(admin, 'bootstrap-runs-v1');
    const partialRunId = `run-${'e'.repeat(32)}`;
    const fakeStart = 'definitely-not-this-process-start';
    const startDigest = createHash('sha256').update(fakeStart).digest('hex');
    const expectedDigest = 'f'.repeat(64);
    const partial = join(
      authority,
      `.${partialRunId}-00000001-allocated.json-${process.pid}-${startDigest}-${expectedDigest}.tmp`,
    );
    writeFileSync(partial, '{"partial":', { mode: 0o600 });
    const partialInspection = inspectLifecycle(home, partialRunId);
    expect(partialInspection).toMatchObject({
      ownerState: 'live-reused',
      runState: 'absent',
      repairablePartialAuthorityCount: 1,
      deletionEligible: true,
    });
    const cleared = runLifecycle(
      'cleanup', home, partialRunId, String(partialInspection.confirmationDigest),
    );
    expect(cleared.status, cleared.stderr).toBe(0);
    expect(existsSync(partial)).toBe(false);

    const orphanId = `run-${'d'.repeat(32)}`;
    mkdirSync(join(runs, orphanId), { mode: 0o700 });
    const orphan = inspectLifecycle(home, orphanId);
    expect(orphan).toMatchObject({
      runState: 'present',
      deletionEligible: false,
      cleanupEligible: false,
    });
    expect(orphan.blockers).toContain('unowned-run');
    expect(runLifecycle(
      'cleanup', home, orphanId, String(orphan.confirmationDigest),
    ).status).toBe(1);
    expect(existsSync(seedRoot)).toBe(true);
  });

  it('bounds completed terminal retention before authority inventory reaches its limit', () => {
    const home = privateDirectory();
    const fixture = completeUncompactedLifecycle(home);
    const authority = join(lifecycleAdmin(home), 'bootstrap-run-lifecycle-v1');
    for (let index = 0; index < 513; index += 1) {
      const runId = `run-${index.toString(16).padStart(32, '0')}`;
      const finalLifecycleRecord = { ...fixture.complete.record, runId };
      const finalLifecycleRecordSha256 = createHash('sha256')
        .update(canonicalJson(finalLifecycleRecord)).digest('hex');
      writeFileSync(
        join(authority, `${runId}-terminal.json`),
        canonicalJson({
          schemaVersion: 1,
          profile: 'warpkeep-greater-realm-production-launch-terminal-v1',
          runId,
          finalLifecycleRecordSha256,
          finalLifecycleRecord,
        }),
        { mode: 0o600 },
      );
    }
    const allocated = allocateLifecycle(home);
    expect(existsSync(allocated)).toBe(true);
    expect(readdirSync(authority).filter(name => name.endsWith('-terminal.json')))
      .toHaveLength(512);
    expect(readdirSync(authority).length).toBeLessThan(4_096);
  }, 15_000);

  it('never prunes a terminal authority while that run holds its lifecycle lock', async () => {
    const home = privateDirectory();
    const fixture = completeUncompactedLifecycle(home);
    const admin = lifecycleAdmin(home);
    const authority = join(admin, 'bootstrap-run-lifecycle-v1');
    const runs = join(admin, 'bootstrap-runs-v1');
    for (let index = 0; index < 513; index += 1) {
      const runId = `run-${index.toString(16).padStart(32, '0')}`;
      const finalLifecycleRecord = { ...fixture.complete.record, runId };
      const finalLifecycleRecordSha256 = createHash('sha256')
        .update(canonicalJson(finalLifecycleRecord)).digest('hex');
      writeFileSync(
        join(authority, `${runId}-terminal.json`),
        canonicalJson({
          schemaVersion: 1,
          profile: 'warpkeep-greater-realm-production-launch-terminal-v1',
          runId,
          finalLifecycleRecordSha256,
          finalLifecycleRecord,
        }),
        { mode: 0o600 },
      );
    }
    const protectedRunId = `run-${'0'.repeat(32)}`;
    const protectedTerminal = join(authority, `${protectedRunId}-terminal.json`);
    utimesSync(protectedTerminal, new Date(0), new Date(0));
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>(resolvePromise => { release = resolvePromise; });
    const acquired = new Promise<void>(resolvePromise => { entered = resolvePromise; });
    const locked = greaterRealmProductionBootstrapTestSeams.withLifecycleLock(
      join(runs, protectedRunId),
      async () => { entered(); await held; },
    );
    await acquired;
    const allocated = allocateLifecycle(home);
    release();
    await locked;
    expect(existsSync(allocated)).toBe(true);
    expect(existsSync(protectedTerminal)).toBe(true);
    expect(readdirSync(authority).filter(name => name.endsWith('-terminal.json')))
      .toHaveLength(512);
  }, 20_000);

  it('serializes duplicate confirmed cleanup and makes the losing confirmation retryable', async () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const payload = join(runRoot, 'repository');
    mkdirSync(payload, { mode: 0o700 });
    for (let index = 0; index < 1_000; index += 1) {
      writeFileSync(
        join(payload, `tracked-${String(index).padStart(4, '0')}.txt`),
        `${index}\n`,
        { mode: 0o644 },
      );
    }
    const inspected = inspectLifecycle(home, runId);
    const confirmation = String(inspected.confirmationDigest);
    const first = startLifecycleAsync('cleanup', home, runId, confirmation);
    const lockPath = join(
      lifecycleAdmin(home),
      'bootstrap-run-lifecycle-v1',
      `${runId}-lifecycle.lock`,
    );
    const deadline = Date.now() + 5_000;
    let lockPublished = false;
    while (!lockPublished) {
      try { lockPublished = lstatSync(lockPath).size > 0; } catch { lockPublished = false; }
      if (lockPublished) break;
      if (Date.now() >= deadline) throw new Error('first cleanup never acquired its lock');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    process.kill(first.child.pid!, 'SIGSTOP');
    const second = runLifecycle('cleanup', home, runId, confirmation);
    process.kill(first.child.pid!, 'SIGCONT');
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('LIFECYCLE_BUSY');
    const firstResult = await first.result;
    expect(firstResult.status, firstResult.stderr).toBe(0);
    expect(readdirSync(join(
      lifecycleAdmin(home),
      'bootstrap-run-lifecycle-v1',
    ))).toEqual([`${runId}-terminal.json`]);
    const retried = runLifecycle('cleanup', home, runId, confirmation);
    expect(retried.status, retried.stderr).toBe(0);
    expect(JSON.parse(retried.stdout)).toMatchObject({ outcome: 'already-complete' });
  }, 20_000);

  it('rejects the three-process open-before-flock unlink-and-recreate ABA race', async () => {
    const home = privateDirectory();
    const runRoot = allocateLifecycle(home);
    const runId = basename(runRoot);
    const lockPath = join(
      lifecycleAdmin(home),
      'bootstrap-run-lifecycle-v1',
      `${runId}-lifecycle.lock`,
    );
    let releaseA!: () => void;
    let enteredA!: () => void;
    const holdA = new Promise<void>(resolvePromise => { releaseA = resolvePromise; });
    const acquiredA = new Promise<void>(resolvePromise => { enteredA = resolvePromise; });
    const processA = greaterRealmProductionBootstrapTestSeams.withLifecycleLock(
      runRoot,
      async () => { enteredA(); await holdA; },
    );
    await acquiredA;

    const needle = '    try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)';
    const helper = bootstrapLifecycleLockProgram();
    expect(helper).toContain(needle);
    const pausedHelper = helper.replace(
      needle,
      `    print("OPEN",flush=True)\n    os.kill(os.getpid(),signal.SIGSTOP)\n${needle}`,
    );
    const processB = spawn('/usr/bin/python3', [
      '-I', '-S', '-B', '-c', pausedHelper, lockPath, runId,
    ], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let outputB = '';
    let errorB = '';
    processB.stdout.setEncoding('utf8');
    processB.stderr.setEncoding('utf8');
    processB.stdout.on('data', chunk => { outputB += String(chunk); });
    processB.stderr.on('data', chunk => { errorB += String(chunk); });
    const closedB = new Promise<number | null>((resolvePromise, rejectPromise) => {
      processB.once('error', rejectPromise);
      processB.once('close', code => resolvePromise(code));
    });
    const openedDeadline = Date.now() + 5_000;
    while (!outputB.includes('OPEN\n')) {
      if (Date.now() >= openedDeadline) throw new Error('paused contender did not open lock');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    releaseA();
    await processA;

    let releaseC!: () => void;
    let enteredC!: () => void;
    const holdC = new Promise<void>(resolvePromise => { releaseC = resolvePromise; });
    const acquiredC = new Promise<void>(resolvePromise => { enteredC = resolvePromise; });
    const processC = greaterRealmProductionBootstrapTestSeams.withLifecycleLock(
      runRoot,
      async () => { enteredC(); await holdC; },
    );
    await acquiredC;
    process.kill(processB.pid!, 'SIGCONT');
    expect(await closedB).toBe(1);
    expect(errorB).toContain('LIFECYCLE_LOCK_REPLACED');
    releaseC();
    await processC;
    expect(existsSync(lockPath)).toBe(false);
  }, 20_000);

  it('keeps the shared lock and deletion helper alive through a self-clean group SIGTERM', async () => {
    const home = privateDirectory();
    const fixture = spawn(process.execPath, [
      'tests/fixtures/greaterRealmBootstrapLifecycleSelfCleanFixture.mjs',
    ], {
      cwd: process.cwd(),
      detached: true,
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!Number.isSafeInteger(fixture.pid) || fixture.pid! < 2) {
      throw new Error('self-clean fixture pid unavailable');
    }
    let output = '';
    let fixtureError = '';
    fixture.stdout.setEncoding('utf8');
    fixture.stderr.setEncoding('utf8');
    fixture.stdout.on('data', chunk => { output += String(chunk); });
    fixture.stderr.on('data', chunk => { fixtureError += String(chunk); });
    const fixtureClosed = new Promise<number | null>((resolvePromise, rejectPromise) => {
      fixture.once('error', rejectPromise);
      fixture.once('close', code => resolvePromise(code));
    });
    const readyDeadline = Date.now() + 5_000;
    while (!output.includes('READY ')) {
      if (Date.now() >= readyDeadline) throw new Error('self-clean fixture not ready');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    const owner = Object.freeze({ pid: fixture.pid!, start: processStart(fixture.pid!) });
    const runRoot = allocateLifecycle(home, owner);
    const runId = basename(runRoot);
    const payload = join(runRoot, 'repository');
    mkdirSync(payload, { mode: 0o700 });
    for (let index = 0; index < 2_000; index += 1) {
      writeFileSync(
        join(payload, `tracked-${String(index).padStart(4, '0')}.txt`),
        `${index}\n`,
        { mode: 0o644 },
      );
    }
    const child = deadProcessIdentity();
    const complete = {
      ...readLaunchFixture(runRoot),
      phase: 'complete',
      childPid: child.pid,
      childProcessStartIdentity: child.start,
      childPgid: child.pid,
      terminal: {
        code: 0,
        signal: null,
        interruptedBy: null,
        reason: 'operator-exit',
      },
    };
    writeLaunchFixture(runRoot, complete);
    const before = inspectLifecycle(home, runId);
    const arguments_ = baseArguments('import-inspect');
    arguments_[0] = runRoot;
    arguments_[1] = join(runRoot, 'repository');
    fixture.stdin.end(JSON.stringify(arguments_));
    const lockPath = join(
      lifecycleAdmin(home),
      'bootstrap-run-lifecycle-v1',
      `${runId}-lifecycle.lock`,
    );
    const deleteDeadline = Date.now() + 10_000;
    let deletionStarted = false;
    while (!deletionStarted) {
      try {
        deletionStarted = existsSync(lockPath) && (
          !existsSync(payload) || readdirSync(payload).length < 2_000
        );
      } catch {
        deletionStarted = existsSync(lockPath);
      }
      if (deletionStarted) break;
      if (Date.now() >= deleteDeadline) throw new Error('self-clean deletion did not start');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    process.kill(-fixture.pid!, 'SIGTERM');
    process.kill(fixture.pid!, 'SIGSTOP');
    const contender = runLifecycle(
      'cleanup', home, runId, String(before.confirmationDigest),
    );
    process.kill(fixture.pid!, 'SIGCONT');
    expect(contender.status).toBe(1);
    expect(contender.stderr).toContain('LIFECYCLE_BUSY');
    expect(await fixtureClosed, fixtureError).toBe(0);
    expect(output).toContain('SIGNAL\n');
    expect(output).toContain('"outcome":"cleaned"');
    expect(output).toContain('"interrupted":true');
    expect(existsSync(runRoot)).toBe(false);
  }, 30_000);

  it('forwards a direct bootstrap SIGTERM to the isolated operator group and waits', async () => {
    const root = privateDirectory();
    const marker = join(root, 'operator-events.txt');
    const fixture = spawn(process.execPath, [
      'tests/fixtures/greaterRealmBootstrapSignalFixture.mjs',
      marker,
    ], {
      cwd: process.cwd(),
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      fixture.once('error', rejectPromise);
      fixture.stdout.setEncoding('utf8');
      fixture.stdout.on('data', chunk => {
        if (String(chunk).includes('READY')) resolvePromise();
      });
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const deadline = Date.now() + 2_000;
      const inspect = () => {
        try {
          if (readFileSync(marker, 'utf8').includes('started')) return resolvePromise();
        } catch {
          // The detached child has not created its marker yet.
        }
        if (Date.now() >= deadline) return rejectPromise(new Error('operator did not start'));
        setTimeout(inspect, 10);
      };
      inspect();
    });
    process.kill(fixture.pid!, 'SIGTERM');
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolvePromise, rejectPromise) => {
        fixture.once('error', rejectPromise);
        fixture.once('close', (code, signal) => resolvePromise({ code, signal }));
      },
    );
    expect(result).toEqual({ code: 0, signal: null });
    expect(readFileSync(marker, 'utf8')).toBe([
      'started',
      'terminal',
      'bootstrap-terminal:0:null',
      '',
    ].join('\n'));
  });
});
