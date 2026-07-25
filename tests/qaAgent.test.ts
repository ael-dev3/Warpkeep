import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Repository JavaScript tooling intentionally exposes test hooks.
import { QA_AGENT_LANE_ORDER, acquireQaAgentLock, classifyQaAgentPaths, fingerprintQaAgentPaths, parseQaAgentArguments, parseQaAgentNulPaths, prepareQaAgentSpacetimeCli, qaAgentChildEnvironment, qaAgentCommandsForPlan, qaAgentDirectoryGuardContract, releaseQaAgentLock, resolveQaAgentGitState, runQaAgent, runQaAgentCommand, runQaAgentGitCommand, terminateQaAgentProcessGroup, verifyQaAgentScriptContract } from '../scripts/qa/agent.mjs';

const tempRoots: string[] = [];
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const INDEX_RECORD = `100644 ${'d'.repeat(40)} 0\tsrc/staged.ts\0`;
const INDEX_DIGEST = createHash('sha256').update(INDEX_RECORD).digest('hex');

async function privateRoot() {
  const root = await mkdtemp(join(tmpdir(), 'warpkeep-qa-agent-test-'));
  tempRoots.push(root);
  await chmod(root, 0o700);
  const repository = join(root, 'repository');
  const locks = join(root, 'locks');
  await mkdir(repository, { mode: 0o700 });
  await mkdir(locks, { mode: 0o700 });
  return { locks, repository };
}

async function passThroughSpacetimeRuntime(runtime: {
  environment: NodeJS.ProcessEnv;
}) {
  return {
    environment: runtime.environment,
    readOnlyPaths: [],
    assertIntact: async () => undefined,
    cleanup: () => undefined,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => (
    rm(root, { force: true, recursive: true })
  )));
});

describe('local QA agent', () => {
  it('accepts only one exact --base ref argument', () => {
    expect(parseQaAgentArguments(['--base', 'origin/main'])).toEqual({
      base: 'origin/main',
    });
    for (const arguments_ of [
      [],
      ['--base'],
      ['--base=origin/main'],
      ['--base', 'origin/main', '--extra'],
      ['--base', '--upload-pack=evil'],
      ['--base', 'origin/../main'],
      ['--base', 'origin/main.lock'],
      ['--base', 'origin/main\nsecret'],
    ]) {
      expect(() => parseQaAgentArguments(arguments_)).toThrow(/base|Usage/i);
    }
  });

  it('classifies paths deterministically and escalates configuration or unknown files', () => {
    expect(classifyQaAgentPaths([
      'src/components/WarpkeepExperience.tsx',
      'src/components/WarpkeepExperience.tsx',
    ])).toEqual({
      full: false,
      lanes: [
        'root-changed-tests',
        'root-typecheck',
        'root-build',
        'local-fullstack',
      ],
      pathCount: 1,
    });
    expect(classifyQaAgentPaths(['services/auth-bridge/src/app.ts']).lanes).toEqual([
      'root-changed-tests',
      'auth-bridge-check',
      'local-fullstack',
    ]);
    expect(classifyQaAgentPaths(['spacetimedb/src/schema.ts']).lanes).toEqual([
      'root-changed-tests',
      'root-typecheck',
      'root-build',
      'spacetimedb-verify',
      'spacetimedb-bindings',
      'spacetimedb-worker-migration',
      'spacetimedb-additive-migration',
      'local-fullstack',
    ]);
    expect(classifyQaAgentPaths(['README.md', 'docs/operations/qa.md'])).toEqual({
      full: false,
      lanes: [],
      pathCount: 2,
    });
    for (const path of [
      '.github/workflows/verify.yml',
      'package-lock.json',
      'services/auth-bridge/wrangler.toml',
      'unknown-surface.txt',
    ]) {
      expect(classifyQaAgentPaths([path])).toEqual({
        full: true,
        lanes: QA_AGENT_LANE_ORDER,
        pathCount: 1,
      });
    }
    expect(classifyQaAgentPaths([
      'tests/qaAgent.test.ts',
      'scripts/qa/agent.mjs',
    ]).lanes).toEqual(['root-changed-tests', 'root-typecheck']);
  });

  it('parses only bounded, canonical NUL-delimited Git paths', () => {
    expect(parseQaAgentNulPaths(Buffer.from('src/a.ts\0tests/a.test.ts\0'))).toEqual([
      'src/a.ts',
      'tests/a.test.ts',
    ]);
    expect(parseQaAgentNulPaths(Buffer.alloc(0))).toEqual([]);
    expect(() => parseQaAgentNulPaths(Buffer.from('src/a.ts'))).toThrow(/malformed/i);
    expect(() => parseQaAgentNulPaths(Buffer.from('../outside\0'))).toThrow(/unsafe/i);
    expect(() => parseQaAgentNulPaths(Buffer.from('bad\npath\0'))).toThrow(/unsafe/i);
    expect(() => parseQaAgentNulPaths(Buffer.from([0xff, 0]))).toThrow(/encoding/i);
  });

  it('fingerprints changed source content without following repository escapes', async () => {
    const { repository } = await privateRoot();
    const sourceDirectory = join(repository, 'src');
    await mkdir(sourceDirectory, { mode: 0o700 });
    const sourcePath = join(sourceDirectory, 'changed.ts');
    await writeFile(sourcePath, 'export const value = 1;\n');
    const first = await fingerprintQaAgentPaths(repository, ['src/changed.ts']);
    await writeFile(sourcePath, 'export const value = 2;\n');
    const second = await fingerprintQaAgentPaths(repository, ['src/changed.ts']);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    await expect(fingerprintQaAgentPaths(
      repository,
      ['../outside'],
    )).rejects.toThrow(/unsafe|escaped/i);
  });

  it('resolves exact commits and includes committed, staged, unstaged, and untracked paths', async () => {
    const calls: string[][] = [];
    const outputs = new Map([
      ['rev-parse --verify --end-of-options HEAD^{commit}', `${SHA_A}\n`],
      ['rev-parse --verify --end-of-options origin/main^{commit}', `${SHA_B}\n`],
      [`merge-base ${SHA_A} ${SHA_B}`, `${SHA_C}\n`],
      [`diff --name-only -z --no-renames ${SHA_C} ${SHA_A} --`, 'src/committed.ts\0'],
      ['diff --cached --name-only -z --no-renames --', 'src/staged.ts\0'],
      ['diff --name-only -z --no-renames --', 'src/unstaged.ts\0'],
      ['ls-files --others --exclude-standard -z --', 'tests/untracked.test.ts\0'],
      ['ls-files --stage -z --', INDEX_RECORD],
    ]);
    const state = await resolveQaAgentGitState('origin/main', {
      executeGit: async (arguments_: string[]) => {
        calls.push(arguments_);
        const output = outputs.get(arguments_.join(' '));
        if (output === undefined) throw new Error('unexpected call');
        return Buffer.from(output);
      },
    });
    expect(state).toEqual({
      baseCommit: SHA_B,
      head: SHA_A,
      indexDigest: INDEX_DIGEST,
      mergeBase: SHA_C,
      paths: [
        'src/committed.ts',
        'src/staged.ts',
        'src/unstaged.ts',
        'tests/untracked.test.ts',
      ],
    });
    expect(calls).toHaveLength(8);

    await expect(resolveQaAgentGitState('origin/main', {
      executeGit: async () => Buffer.from(`${SHA_A}\n\n`),
    })).rejects.toThrow(/HEAD commit is invalid/i);
  });

  it('invokes Git without a shell and never exposes a failing child message', async () => {
    const execute = vi.fn((
      executable: string,
      arguments_: string[],
      options: Record<string, unknown>,
      callback: (error: Error | null, stdout?: Buffer) => void,
    ) => {
      expect(executable).toBe('git');
      expect(arguments_).toEqual([
        '--no-optional-locks',
        'rev-parse',
        '--verify',
        '--end-of-options',
        'origin/main^{commit}',
      ]);
      expect(options.shell).toBe(false);
      callback(null, Buffer.from(`${SHA_A}\n`));
      return {} as never;
    });
    await expect(runQaAgentGitCommand([
      'rev-parse',
      '--verify',
      '--end-of-options',
      'origin/main^{commit}',
    ], { execFileImplementation: execute })).resolves.toEqual(Buffer.from(`${SHA_A}\n`));

    const failing = vi.fn((
      _executable: string,
      _arguments: string[],
      _options: Record<string, unknown>,
      callback: (error: Error) => void,
    ) => {
      callback(new Error('SECRET_TOKEN_SHOULD_NOT_ESCAPE'));
      return {} as never;
    });
    await expect(runQaAgentGitCommand(['status'], {
      execFileImplementation: failing,
    })).rejects.toThrow('QA agent Git command failed.');
    await expect(runQaAgentGitCommand(['status'], {
      execFileImplementation: failing,
    })).rejects.not.toThrow(/SECRET_TOKEN/);
  });

  it('allowlists child environment fields and scrubs credentials and runtime injection', () => {
    const environment = qaAgentChildEnvironment({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      TMPDIR: '/safe/tmp',
      WARPKEEP_ADMIN_TOKEN: 'secret',
      GITHUB_TOKEN: 'secret',
      NODE_OPTIONS: '--require evil',
      npm_config_userconfig: '/secret/npmrc',
    });
    expect(environment).toMatchObject({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      TMPDIR: '/safe/tmp',
      CI: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      GIT_TERMINAL_PROMPT: '0',
      npm_config_manage_package_manager_versions: 'false',
      pnpm_config_verify_deps_before_run: 'false',
    });
    expect(environment).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN');
    expect(environment).not.toHaveProperty('GITHUB_TOKEN');
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
    expect(environment).not.toHaveProperty('npm_config_userconfig');
  });

  it('projects only an attested SpacetimeDB snapshot into the private runtime PATH', async () => {
    const root = await mkdtemp(join(tmpdir(), 'warpkeep-qa-agent-cli-test-'));
    tempRoots.push(root);
    await chmod(root, 0o700);
    const runtimeRoot = join(root, 'runtime');
    const snapshotRoot = join(root, 'snapshot');
    await mkdir(runtimeRoot, { mode: 0o700 });
    await mkdir(snapshotRoot, { mode: 0o700 });
    const cliSource = '#!/bin/sh\nexit 0\n';
    const snapshotPath = join(snapshotRoot, 'spacetimedb-cli');
    const companionPath = join(snapshotRoot, 'spacetimedb-standalone');
    await writeFile(snapshotPath, cliSource, { mode: 0o500 });
    await writeFile(companionPath, '#!/bin/sh\nexit 0\n', { mode: 0o500 });
    const cleanup = vi.fn();
    const prepared = await prepareQaAgentSpacetimeCli({
      root: runtimeRoot,
      environment: {
        PATH: '/safe/bin',
        HOME: join(runtimeRoot, 'home'),
      },
    }, {
      attest: () => ({
        path: snapshotPath,
        directory: snapshotRoot,
        digest: createHash('sha256').update(cliSource).digest('hex'),
        cleanup,
      }),
    });
    const alias = join(snapshotRoot, 'spacetime');
    expect(await realpath(alias)).toBe(await realpath(snapshotPath));
    expect(prepared.environment.PATH).toBe(
      `${await realpath(snapshotRoot)}:${'/safe/bin'}`,
    );
    expect(prepared.readOnlyPaths).toEqual([await realpath(snapshotRoot)]);
    await expect(prepared.assertIntact()).resolves.toBeUndefined();
    await chmod(snapshotPath, 0o700);
    await expect(prepared.assertIntact()).rejects.toThrow(/changed/i);
    prepared.cleanup();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('acquires one private atomic lock, refuses a live owner, and releases by ownership token', async () => {
    const { locks, repository } = await privateRoot();
    const options = {
      repositoryRoot: repository,
      lockRoot: locks,
      pid: 42_001,
      now: () => 1_800_000_000_000,
      isProcessAlive: (pid: number) => pid === 42_001,
      createNonce: () => '1'.repeat(32),
    };
    const lock = await acquireQaAgentLock(options);
    await expect(acquireQaAgentLock({
      ...options,
      createNonce: () => '2'.repeat(32),
    })).rejects.toThrow(/active/i);
    await releaseQaAgentLock(lock);
    const next = await acquireQaAgentLock({
      ...options,
      createNonce: () => '3'.repeat(32),
    });
    await releaseQaAgentLock(next);
  });

  it('uses the reviewed advisory lock utility for each supported kernel', () => {
    const lockPath = join(tmpdir(), 'warpkeep-qa-agent-contract.lock');
    const darwin = qaAgentDirectoryGuardContract(lockPath, 'darwin');
    expect(darwin.executable).toBe('/usr/bin/lockf');
    expect(darwin.arguments.slice(0, 5)).toEqual([
      '-s', '-t', '0', '-k', lockPath,
    ]);
    const linux = qaAgentDirectoryGuardContract(lockPath, 'linux');
    expect(linux.executable).toBe('/usr/bin/flock');
    expect(linux.arguments.slice(0, 3)).toEqual([
      '-x', '-n', lockPath,
    ]);
    expect(darwin.arguments.slice(-3, -1)).toEqual([process.execPath, '-e']);
    expect(linux.arguments.slice(-3, -1)).toEqual([process.execPath, '-e']);
    expect(() => qaAgentDirectoryGuardContract(lockPath, 'win32')).toThrow(
      /unavailable on this platform/i,
    );
  });

  it('atomically recovers a dead same-owner lock and rejects a symlink lock', async () => {
    const { locks, repository } = await privateRoot();
    const first = await acquireQaAgentLock({
      repositoryRoot: repository,
      lockRoot: locks,
      pid: 42_002,
      now: () => 1_800_000_000_000,
      isProcessAlive: () => false,
      createNonce: () => '4'.repeat(32),
    });
    const recovered = await acquireQaAgentLock({
      repositoryRoot: repository,
      lockRoot: locks,
      pid: 42_003,
      now: () => 1_800_000_001_000,
      isProcessAlive: () => false,
      createNonce: () => '5'.repeat(32),
    });
    expect(recovered.nonce).not.toBe(first.nonce);
    await releaseQaAgentLock(recovered);

    const lockPath = recovered.lockPath;
    await rm(lockPath, { force: true, recursive: true });
    const target = join(locks, 'attacker-owned-target');
    await mkdir(target, { mode: 0o700 });
    await symlink(target, lockPath);
    await expect(acquireQaAgentLock({
      repositoryRoot: repository,
      lockRoot: locks,
      pid: 42_004,
      now: () => 1_800_000_002_000,
      isProcessAlive: () => false,
      createNonce: () => '6'.repeat(32),
    })).rejects.toThrow(/private owned directory/i);
  });

  it('serializes competing stale-lock recoveries without deleting a new live owner', async () => {
    const { locks, repository } = await privateRoot();
    await acquireQaAgentLock({
      repositoryRoot: repository,
      lockRoot: locks,
      pid: 42_010,
      now: () => 1_800_000_000_000,
      isProcessAlive: () => false,
      createNonce: () => 'a'.repeat(32),
    });

    const attempts = await Promise.allSettled([
      acquireQaAgentLock({
        repositoryRoot: repository,
        lockRoot: locks,
        pid: 42_011,
        now: () => 1_800_000_001_000,
        isProcessAlive: (pid: number) => pid === 42_011 || pid === 42_012,
        createNonce: () => 'b'.repeat(32),
      }),
      acquireQaAgentLock({
        repositoryRoot: repository,
        lockRoot: locks,
        pid: 42_012,
        now: () => 1_800_000_001_000,
        isProcessAlive: (pid: number) => pid === 42_011 || pid === 42_012,
        createNonce: () => 'c'.repeat(32),
      }),
    ]);
    const acquired = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireQaAgentLock>>> => (
        attempt.status === 'fulfilled'
      )
    );
    expect(acquired).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await releaseQaAgentLock(acquired[0]!.value);
  });

  it('builds only the fixed serial local verification command matrix', () => {
    const commands = qaAgentCommandsForPlan({
      lanes: QA_AGENT_LANE_ORDER,
    }, SHA_C);
    expect(commands.map((command: { id: string }) => command.id)).toEqual(
      QA_AGENT_LANE_ORDER,
    );
    expect(commands[0]).toMatchObject({
      executable: 'npm',
      arguments: ['test'],
    });
    expect(commands.at(-1)).toMatchObject({
      arguments: ['scripts/qa-observer/local-fullstack-browser-probe.mjs'],
      osNetworkSandbox: false,
    });
    expect(commands.slice(0, -1).every((command: {
      osNetworkSandbox?: boolean;
    }) => (
      command.osNetworkSandbox !== false
    ))).toBe(true);
    const serialized = JSON.stringify(commands);
    expect(serialized).not.toMatch(/publish|deploy|maincloud|warpkeep\.com/i);
    const source = readFileSync(
      join(process.cwd(), 'scripts/qa/agent.mjs'),
      'utf8'
    );
    expect(source).toContain(
      'const CHILD_TERMINATION_GRACE_MILLISECONDS = 25_000;'
    );
  });

  it('refuses a mutable package-script dispatch contract before spawning a lane', async () => {
    const { repository } = await privateRoot();
    await mkdir(join(repository, 'services/auth-bridge'), { recursive: true, mode: 0o700 });
    await mkdir(join(repository, 'spacetimedb'), { recursive: true, mode: 0o700 });
    for (const relativePath of [
      'package.json',
      'services/auth-bridge/package.json',
      'spacetimedb/package.json',
    ]) {
      await writeFile(
        join(repository, relativePath),
        readFileSync(join(process.cwd(), relativePath), 'utf8'),
      );
    }
    await expect(verifyQaAgentScriptContract(repository)).resolves.toBeUndefined();

    const packagePath = join(repository, 'package.json');
    const changed = JSON.parse(readFileSync(packagePath, 'utf8'));
    changed.scripts.test = 'node scripts/publish-spacetime-dev.mjs';
    await writeFile(packagePath, `${JSON.stringify(changed)}\n`);
    await expect(verifyQaAgentScriptContract(repository)).rejects.toThrow(
      /command contract changed without review/i,
    );

    await writeFile(packagePath, readFileSync(join(process.cwd(), 'package.json')));
    const bridgePath = join(repository, 'services/auth-bridge/package.json');
    const changedBridge = JSON.parse(readFileSync(bridgePath, 'utf8'));
    changedBridge.scripts.test = 'node ../../scripts/publish-spacetime-dev.mjs';
    await writeFile(bridgePath, `${JSON.stringify(changedBridge)}\n`);
    await expect(verifyQaAgentScriptContract(repository)).rejects.toThrow(
      /command contract changed without review/i,
    );

    await writeFile(
      bridgePath,
      readFileSync(join(process.cwd(), 'services/auth-bridge/package.json')),
    );
    const spacetimePath = join(repository, 'spacetimedb/package.json');
    const changedSpacetime = JSON.parse(readFileSync(spacetimePath, 'utf8'));
    changedSpacetime.scripts['stdb:build'] = 'node ../scripts/publish-spacetime-dev.mjs';
    await writeFile(spacetimePath, `${JSON.stringify(changedSpacetime)}\n`);
    await expect(verifyQaAgentScriptContract(repository)).rejects.toThrow(
      /command contract changed without review/i,
    );
  });

  it('terminates and proves the entire detached process group is gone', async () => {
    const calls: Array<[number, string | number]> = [];
    const child = {
      pid: 43_210,
      exitCode: 0,
      signalCode: null,
      once: vi.fn(),
    };
    const killProcess = (pid: number, signal: string | number) => {
      calls.push([pid, signal]);
      if (signal === 0) {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      }
    };
    await terminateQaAgentProcessGroup(child, {
      graceMilliseconds: 0,
      verificationMilliseconds: 10,
      killProcess,
    });
    expect(calls).toEqual([
      [-43_210, 'SIGTERM'],
      [-43_210, 'SIGKILL'],
      [-43_210, 0],
    ]);

    await expect(terminateQaAgentProcessGroup(child, {
      graceMilliseconds: 0,
      verificationMilliseconds: 10,
      killProcess: (_pid: number, signal: string | number) => {
        if (signal === 0) {
          throw Object.assign(new Error('denied'), { code: 'EPERM' });
        }
      },
    })).rejects.toThrow(/could not be verified/i);
  });

  it('runs planned lanes serially in deterministic order', async () => {
    const { locks, repository } = await privateRoot();
    const outputs = new Map([
      ['rev-parse --verify --end-of-options HEAD^{commit}', `${SHA_A}\n`],
      ['rev-parse --verify --end-of-options origin/main^{commit}', `${SHA_B}\n`],
      [`merge-base ${SHA_A} ${SHA_B}`, `${SHA_C}\n`],
      [`diff --name-only -z --no-renames ${SHA_C} ${SHA_A} --`, 'src/changed.ts\0'],
      ['diff --cached --name-only -z --no-renames --', ''],
      ['diff --name-only -z --no-renames --', ''],
      ['ls-files --others --exclude-standard -z --', ''],
      ['ls-files --stage -z --', ''],
    ]);
    const observed: string[] = [];
    let isolatedHome = '';
    let active = false;
    const result = await runQaAgent({
      arguments: ['--base', 'origin/main'],
      repositoryRoot: repository,
      lockOptions: {
        lockRoot: locks,
        createNonce: () => '7'.repeat(32),
      },
      gitOptions: {
        executeGit: async (arguments_: string[]) => {
          const output = outputs.get(arguments_.join(' '));
          if (output === undefined) throw new Error('unexpected call');
          return Buffer.from(output);
        },
      },
      prepareSpacetimeCli: passThroughSpacetimeRuntime,
      runCommand: async (
        command: { id: string },
        commandOptions: { environment: NodeJS.ProcessEnv },
      ) => {
        expect(active).toBe(false);
        isolatedHome = commandOptions.environment.HOME ?? '';
        expect(isolatedHome).toMatch(/warpkeep-qa-agent-runtime-/);
        active = true;
        await Promise.resolve();
        observed.push(command.id);
        active = false;
        return Object.freeze({
          lane: command.id,
          status: 'passed',
          durationMilliseconds: 0,
        });
      },
      verifyScriptContract: async () => undefined,
    });
    expect(observed).toEqual([
      'root-changed-tests',
      'root-typecheck',
      'root-build',
      'local-fullstack',
    ]);
    expect(result.results.map((entry: { lane: string }) => entry.lane)).toEqual(
      observed,
    );
    expect(existsSync(join(isolatedHome, '..'))).toBe(false);
    const lockEntries = await readdir(locks, { recursive: true });
    expect(lockEntries.some((entry) => entry.endsWith('owner.json'))).toBe(false);
  });

  it('fails a zero-lane run when the staged index changes during verification', async () => {
    const { locks, repository } = await privateRoot();
    let indexRead = 0;
    const outputs = new Map([
      ['rev-parse --verify --end-of-options HEAD^{commit}', `${SHA_A}\n`],
      ['rev-parse --verify --end-of-options origin/main^{commit}', `${SHA_B}\n`],
      [`merge-base ${SHA_A} ${SHA_B}`, `${SHA_C}\n`],
      [`diff --name-only -z --no-renames ${SHA_C} ${SHA_A} --`, 'README.md\0'],
      ['diff --cached --name-only -z --no-renames --', ''],
      ['diff --name-only -z --no-renames --', ''],
      ['ls-files --others --exclude-standard -z --', ''],
    ]);
    await expect(runQaAgent({
      arguments: ['--base', 'origin/main'],
      repositoryRoot: repository,
      lockOptions: {
        lockRoot: locks,
        createNonce: () => '8'.repeat(32),
      },
      gitOptions: {
        executeGit: async (arguments_: string[]) => {
          if (arguments_.join(' ') === 'ls-files --stage -z --') {
            indexRead += 1;
            return Buffer.from(indexRead === 1 ? INDEX_RECORD : `${INDEX_RECORD}changed\0`);
          }
          const output = outputs.get(arguments_.join(' '));
          if (output === undefined) throw new Error('unexpected call');
          return Buffer.from(output);
        },
      },
      prepareSpacetimeCli: passThroughSpacetimeRuntime,
      runCommand: vi.fn(),
      verifyScriptContract: async () => undefined,
    })).rejects.toThrow(/source changed during verification/i);
  });

  it('honors an interruption between lanes and still releases local state', async () => {
    const { locks, repository } = await privateRoot();
    const outputs = new Map([
      ['rev-parse --verify --end-of-options HEAD^{commit}', `${SHA_A}\n`],
      ['rev-parse --verify --end-of-options origin/main^{commit}', `${SHA_B}\n`],
      [`merge-base ${SHA_A} ${SHA_B}`, `${SHA_C}\n`],
      [`diff --name-only -z --no-renames ${SHA_C} ${SHA_A} --`, 'src/changed.ts\0'],
      ['diff --cached --name-only -z --no-renames --', ''],
      ['diff --name-only -z --no-renames --', ''],
      ['ls-files --others --exclude-standard -z --', ''],
      ['ls-files --stage -z --', ''],
    ]);
    const abortController = new AbortController();
    const runCommand = vi.fn(async (command: { id: string }) => {
      abortController.abort();
      return Object.freeze({
        lane: command.id,
        status: 'passed',
        durationMilliseconds: 0,
      });
    });
    await expect(runQaAgent({
      arguments: ['--base', 'origin/main'],
      repositoryRoot: repository,
      lockOptions: {
        lockRoot: locks,
        createNonce: () => '9'.repeat(32),
      },
      gitOptions: {
        executeGit: async (arguments_: string[]) => {
          const output = outputs.get(arguments_.join(' '));
          if (output === undefined) throw new Error('unexpected call');
          return Buffer.from(output);
        },
      },
      prepareSpacetimeCli: passThroughSpacetimeRuntime,
      runCommand,
      signal: abortController.signal,
      verifyScriptContract: async () => undefined,
    })).rejects.toThrow(/interrupted/i);
    expect(runCommand).toHaveBeenCalledOnce();
    const lockEntries = await readdir(locks, { recursive: true });
    expect(lockEntries.some((entry) => entry.endsWith('owner.json'))).toBe(false);
  });

  it('drains but never returns raw child output', async () => {
    const result = await runQaAgentCommand({
      id: 'root-typecheck',
      executable: process.execPath,
      arguments: ['-e', 'process.stdout.write(\"SECRET_OUTPUT\");'],
      osNetworkSandbox: false,
      timeoutMilliseconds: 5_000,
    }, {
      environment: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
    });
    expect(result).toMatchObject({
      lane: 'root-typecheck',
      status: 'passed',
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_OUTPUT');
  });

  it('classifies an asynchronous spawn failure without inventing a process group', async () => {
    await expect(runQaAgentCommand({
      id: 'root-typecheck',
      executable: process.execPath,
      arguments: ['-e', ''],
      osNetworkSandbox: false,
      timeoutMilliseconds: 5_000,
    }, {
      environment: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
      spawnImplementation: () => spawn(
        join(tmpdir(), 'warpkeep-definitely-missing-executable'),
        [],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    })).rejects.toThrow(/could not start/i);
  });

  it('does not retain a losing five-second termination timer after child exit', () => {
    const moduleUrl = pathToFileURL(
      join(process.cwd(), 'scripts/qa/agent.mjs'),
    ).href;
    const script = `
      import { runQaAgentCommand } from ${JSON.stringify(moduleUrl)};
      await runQaAgentCommand({
        id: 'root-typecheck',
        executable: process.execPath,
        arguments: ['-e', ''],
        osNetworkSandbox: false,
        timeoutMilliseconds: 5_000,
      }, {
        environment: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
        },
      });
    `;
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      script,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      timeout: 4_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it.runIf(process.platform === 'darwin')(
    'denies lane writes to an attested CLI snapshot directory',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'warpkeep-qa-agent-sandbox-test-'));
      tempRoots.push(root);
      await chmod(root, 0o700);
      const snapshotRoot = join(root, 'snapshot');
      const home = join(root, 'home');
      const temporary = join(root, 'tmp');
      await mkdir(snapshotRoot, { mode: 0o700 });
      await mkdir(home, { mode: 0o700 });
      await mkdir(temporary, { mode: 0o700 });
      const executable = join(snapshotRoot, 'spacetime');
      await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o500 });

      await expect(runQaAgentCommand({
        id: 'spacetimedb-verify',
        executable: process.execPath,
        arguments: [
          '-e',
          'require("node:fs").chmodSync(process.argv[1], 0o700)',
          executable,
        ],
        timeoutMilliseconds: 5_000,
      }, {
        environment: {
          PATH: process.env.PATH,
          HOME: home,
          TMPDIR: temporary,
        },
        readOnlyPaths: [await realpath(snapshotRoot)],
      })).rejects.toThrow(/nonzero exit/i);
      expect((await stat(executable)).mode & 0o777).toBe(0o500);
    },
  );
});
