import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  QaCycleLockError,
  acquireQaCycleLock,
  attestQaRepository,
  checksForTier,
  qaCycleEnvironment,
  probeLocalBrokerHealth,
  probeLocalBrokerSnapshot,
  prunePrivateReports,
  qaNetworkSandboxContract,
  runCommandCheck,
  runQaCycle,
  tierForLocalHour,
  writePrivateReport,
  type QaCycleReport
} from '../scripts/qa-observer/qa-cycle-runner.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoots: string[] = [];
const darwinSandboxIt = process.platform === 'darwin'
  && process.env.WARPKEEP_QA_SOCKET_TMP === undefined
  ? it
  : it.skip;

async function temporaryRoot() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'warpkeep-qa-cycle-')));
  temporaryRoots.push(root);
  return root;
}

async function temporarySocketRoot() {
  // Darwin's Unix socket path ceiling is much shorter than a runner-isolated
  // TMPDIR can be. Keep this test transport independent of that environment.
  const root = await realpath(await mkdtemp(join(
    process.env.WARPKEEP_QA_SOCKET_TMP ?? '/tmp',
    'wkq-'
  )));
  await chmod(root, 0o700);
  temporaryRoots.push(root);
  return root;
}

type LocalBrokerHandler = (request: IncomingMessage, response: ServerResponse) => void;

async function withLocalBroker(
  handler: LocalBrokerHandler,
  test: (socketPath: string) => Promise<void>
) {
  const root = await temporarySocketRoot();
  const socketPath = join(root, 'broker.sock');
  const server = createServer(handler);
  await new Promise<void>((resolveListen, rejectListen) => {
    const reject = (error: Error) => {
      server.off('error', reject);
      rejectListen(error);
    };
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  await chmod(socketPath, 0o600);
  try {
    await test(socketPath);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

function passingReport(): QaCycleReport {
  return {
    version: 2,
    startedAt: '2026-07-14T08:00:00.000Z',
    finishedAt: '2026-07-14T08:00:01.000Z',
    tier: 'quick',
    broker: 'off',
    status: 'pass',
    durationMs: 1_000,
    checks: [{ id: 'targeted-unit', status: 'pass', durationMs: 900, attempts: 1 }]
  };
}

function sanitizedObserverSnapshot() {
  return {
    version: 2,
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    worldTileCount: 1_261,
    worldTileMetaCount: 1_261,
    realm: {
      realmId: 'GENESIS_001',
      numericSeed: 3_445_214_658,
      generationVersion: 2,
      authoritativeRadius: 20,
      renderRadius: 22,
      playerCapacity: 100
    },
    aggregates: {
      castleCount: 1,
      profileCount: 1,
      foundedCount: 1,
      activeCount: 0
    }
  };
}

function brokerJsonHeaders(body: string, overrides: Record<string, string> = {}) {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'x-content-type-options': 'nosniff',
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true
  })));
});

describe('local autonomous QA cycle runner', () => {
  darwinSandboxIt('enforces source-write and unrelated Unix-socket denials in the real macOS sandbox', async () => {
    const runtimeRoot = await temporaryRoot();
    const allowedSocketRoot = await temporarySocketRoot();
    const directories = Object.fromEntries([
      'runtime-home',
      'runtime-tmp',
      'npm-cache',
      'build-output',
      'root-tsc-cache',
      'root-vite-cache',
      'root-vite-config',
      'auth-vite-cache',
      'auth-vite-config',
      'spacetime-dist',
      'spacetime-v1-dist',
      'spacetime-v2-dist',
      'spacetime-v3-dist'
    ].map((name) => [name, join(runtimeRoot, name)]));
    await Promise.all(Object.values(directories).map((path) => mkdir(path, {
      recursive: true,
      mode: 0o700
    })));
    const sandboxOptions = {
      observatoryRoot: join(
        process.env.HOME ?? '/Users/invalid',
        'Library/Application Support/Warpkeep/qa-observatory'
      ),
      repositoryRoot,
      userHome: process.env.HOME ?? '/Users/invalid',
      spacetimeCliRoot: dirname(qaCycleEnvironment().SPACETIME_BIN),
      runtimeHome: directories['runtime-home'],
      runtimeTmp: directories['runtime-tmp'],
      npmCache: directories['npm-cache'],
      socketTmpRoot: allowedSocketRoot,
      buildOutputRoot: directories['build-output'],
      rootTscCacheRoot: directories['root-tsc-cache'],
      rootViteCacheRoot: directories['root-vite-cache'],
      rootViteConfigRoot: directories['root-vite-config'],
      authViteCacheRoot: directories['auth-vite-cache'],
      authViteConfigRoot: directories['auth-vite-config'],
      spacetimeDistRoot: directories['spacetime-dist'],
      spacetimeV1DistRoot: directories['spacetime-v1-dist'],
      spacetimeV2DistRoot: directories['spacetime-v2-dist'],
      spacetimeV3DistRoot: directories['spacetime-v3-dist']
    } as const;
    const environment = {
      ...qaCycleEnvironment(),
      HOME: sandboxOptions.runtimeHome,
      TMPDIR: sandboxOptions.runtimeTmp,
      npm_config_cache: sandboxOptions.npmCache,
      WARPKEEP_QA_SOCKET_TMP: allowedSocketRoot
    };
    const executeProgram = (program: string) => runCommandCheck({
      id: 'sandbox-contract',
      executable: process.execPath,
      args: ['-e', program],
      timeoutMs: 5_000
    }, {
      cwd: repositoryRoot,
      environment,
      commandContract: (check) => qaNetworkSandboxContract(check, {
        platform: 'darwin',
        ...sandboxOptions
      })
    });

    const forbiddenSourcePath = join(
      repositoryRoot,
      'scripts/qa-observer/.sandbox-write-probe'
    );
    await rm(forbiddenSourcePath, { force: true });
    const sourceWrite = await executeProgram(
      `require('node:fs').writeFileSync(${JSON.stringify(forbiddenSourcePath)},'forbidden')`
    );
    expect(sourceWrite.status).toBe('fail');
    await expect(readFile(forbiddenSourcePath, 'utf8')).rejects.toThrow();

    const hardlinkSourcePath = join(
      repositoryRoot,
      'scripts/qa-observer/.sandbox-hardlink-source'
    );
    const hardlinkDestinationPath = join(sandboxOptions.runtimeTmp, 'hardlink-destination');
    await writeFile(hardlinkSourcePath, 'original', { mode: 0o600 });
    try {
      const hardlinkWrite = await executeProgram([
        "const fs=require('node:fs');",
        `fs.linkSync(${JSON.stringify(hardlinkSourcePath)},${JSON.stringify(hardlinkDestinationPath)});`,
        `fs.appendFileSync(${JSON.stringify(hardlinkDestinationPath)},'changed');`
      ].join(''));
      expect(hardlinkWrite.status).toBe('fail');
      await expect(readFile(hardlinkSourcePath, 'utf8')).resolves.toBe('original');
    } finally {
      await rm(hardlinkDestinationPath, { force: true });
      await rm(hardlinkSourcePath, { force: true });
    }

    const allowedRuntimePath = join(sandboxOptions.runtimeTmp, 'allowed.txt');
    const runtimeWrite = await executeProgram(
      `require('node:fs').writeFileSync(${JSON.stringify(allowedRuntimePath)},'allowed')`
    );
    expect(runtimeWrite.status).toBe('pass');
    await expect(readFile(allowedRuntimePath, 'utf8')).resolves.toBe('allowed');

    const socketProgram = (socketPath: string) => [
      "const socket=require('node:net').connect({path:",
      JSON.stringify(socketPath),
      '});',
      "socket.once('connect',()=>socket.end());",
      "socket.once('close',()=>process.exit(0));",
      "socket.once('error',()=>process.exit(7));",
      'setTimeout(()=>process.exit(8),1000);'
    ].join('');
    await withLocalBroker((_request, response) => response.end(), async (socketPath) => {
      expect((await executeProgram(socketProgram(socketPath))).status).toBe('fail');
    });
    const allowedSocketPath = join(allowedSocketRoot, 'allowed.sock');
    const allowedServer = createServer();
    await new Promise<void>((resolveListen, rejectListen) => {
      allowedServer.once('error', rejectListen);
      allowedServer.listen(allowedSocketPath, () => resolveListen());
    });
    try {
      expect((await executeProgram(socketProgram(allowedSocketPath))).status).toBe('pass');
    } finally {
      await new Promise<void>((resolveClose) => allowedServer.close(() => resolveClose()));
    }
  }, 20_000);

  it('wraps the entire macOS check process tree in the exact loopback-only network sandbox', () => {
    const check = {
      id: 'bounded-test',
      executable: process.execPath,
      args: ['--version'],
      timeoutMs: 1_000
    } as const;
    expect(qaNetworkSandboxContract(check, {
      platform: 'darwin',
      observatoryRoot: '/Users/test/Library/Application Support/Warpkeep/qa-observatory',
      repositoryRoot: '/Users/test/projects/Warpkeep',
      userHome: '/Users/test',
      spacetimeCliRoot: '/Users/test/.local/share/spacetime/bin/2.6.1',
      runtimeHome: '/Users/test/Library/Application Support/Warpkeep/qa-observatory/runtime-home',
      runtimeTmp: '/Users/test/Library/Application Support/Warpkeep/qa-observatory/tmp',
      npmCache: '/Users/test/Library/Application Support/Warpkeep/qa-observatory/npm-cache',
      socketTmpRoot: '/private/tmp/wkqa-test',
      buildOutputRoot: '/Users/test/projects/Warpkeep/dist',
      rootTscCacheRoot: '/Users/test/projects/Warpkeep/node_modules/.tmp',
      rootViteCacheRoot: '/Users/test/projects/Warpkeep/node_modules/.vite',
      rootViteConfigRoot: '/Users/test/projects/Warpkeep/node_modules/.vite-temp',
      authViteCacheRoot: '/Users/test/projects/Warpkeep/services/auth-bridge/node_modules/.vite',
      authViteConfigRoot: '/Users/test/projects/Warpkeep/services/auth-bridge/node_modules/.vite-temp',
      spacetimeDistRoot: '/Users/test/projects/Warpkeep/spacetimedb/dist',
      spacetimeV1DistRoot: '/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/production-v1/dist',
      spacetimeV2DistRoot: '/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/additive-v2-schema/dist',
      spacetimeV3DistRoot: '/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/additive-v3-schema/dist',
      profilePath: '/reviewed/qa-cycle-network.sb'
    })).toEqual({
      executable: '/usr/bin/sandbox-exec',
      args: [
        '-D',
        'OBSERVATORY_ROOT=/Users/test/Library/Application Support/Warpkeep/qa-observatory',
        '-D',
        'REPOSITORY_ROOT=/Users/test/projects/Warpkeep',
        '-D',
        'USER_HOME=/Users/test',
        '-D',
        'SPACETIME_CLI_ROOT=/Users/test/.local/share/spacetime/bin/2.6.1',
        '-D',
        'RUNTIME_HOME=/Users/test/Library/Application Support/Warpkeep/qa-observatory/runtime-home',
        '-D',
        'RUNTIME_TMP=/Users/test/Library/Application Support/Warpkeep/qa-observatory/tmp',
        '-D',
        'NPM_CACHE=/Users/test/Library/Application Support/Warpkeep/qa-observatory/npm-cache',
        '-D',
        'SOCKET_TMP_ROOT=/private/tmp/wkqa-test',
        '-D',
        'BUILD_OUTPUT_ROOT=/Users/test/projects/Warpkeep/dist',
        '-D',
        'ROOT_TSC_CACHE_ROOT=/Users/test/projects/Warpkeep/node_modules/.tmp',
        '-D',
        'ROOT_VITE_CACHE_ROOT=/Users/test/projects/Warpkeep/node_modules/.vite',
        '-D',
        'ROOT_VITE_CONFIG_ROOT=/Users/test/projects/Warpkeep/node_modules/.vite-temp',
        '-D',
        'AUTH_VITE_CACHE_ROOT=/Users/test/projects/Warpkeep/services/auth-bridge/node_modules/.vite',
        '-D',
        'AUTH_VITE_CONFIG_ROOT=/Users/test/projects/Warpkeep/services/auth-bridge/node_modules/.vite-temp',
        '-D',
        'SPACETIME_DIST_ROOT=/Users/test/projects/Warpkeep/spacetimedb/dist',
        '-D',
        'SPACETIME_V1_DIST_ROOT=/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/production-v1/dist',
        '-D',
        'SPACETIME_V2_DIST_ROOT=/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/additive-v2-schema/dist',
        '-D',
        'SPACETIME_V3_DIST_ROOT=/Users/test/projects/Warpkeep/spacetimedb/migration-fixtures/additive-v3-schema/dist',
        '-f',
        '/reviewed/qa-cycle-network.sb',
        process.execPath,
        '--version'
      ]
    });
    expect(qaNetworkSandboxContract(check, { platform: 'linux' })).toEqual({
      executable: process.execPath,
      args: ['--version']
    });
    const rendered = checksForTier('quick').find((candidate) => (
      candidate.id === 'rendered-webgl-browser'
    ));
    expect(rendered).toBeDefined();
    expect(qaNetworkSandboxContract(rendered!, { platform: 'darwin' })).toEqual({
      executable: process.execPath,
      args: [join(repositoryRoot, 'scripts/qa-observer/rendered-webgl-browser-probe.mjs')]
    });
    expect(() => qaNetworkSandboxContract({
      ...check,
      networkBoundary: 'self-contained-browser'
    }, { platform: 'darwin' })).toThrow(/self-contained browser boundary/i);
    expect(() => qaNetworkSandboxContract(check, {
      platform: 'darwin',
      userHome: 'relative-home'
    })).toThrow(/sandbox path/i);
    expect(() => qaNetworkSandboxContract(check, {
      platform: 'darwin',
      repositoryRoot: '/reviewed\0suffix'
    })).toThrow(/sandbox path/i);
  });

  it('selects predictable tiers and exposes only static non-mutating checks', () => {
    expect(tierForLocalHour(8)).toBe('quick');
    expect(tierForLocalHour(9)).toBe('standard');
    expect(tierForLocalHour(12)).toBe('deep');
    expect(tierForLocalHour(18)).toBe('deep');

    const quick = checksForTier('quick');
    const standard = checksForTier('standard');
    const deep = checksForTier('deep');
    expect(quick.map((check) => check.id)).toEqual([
      'rendered-webgl-browser',
      'sandbox-boundary',
      'targeted-unit',
      'synthetic-app-states',
      'typecheck'
    ]);
    const syntheticAppStates = quick.find((check) => check.id === 'synthetic-app-states');
    expect(syntheticAppStates?.maximumAttempts).toBe(2);
    expect(syntheticAppStates?.args).toEqual([
      'test',
      '--',
      'tests/qaJourneyLab.test.tsx',
      'tests/localQaRuntime.test.ts',
      'tests/alphaParticipationTermsDialog.test.tsx',
      'tests/farcasterQrAuthPanel.test.tsx',
      'tests/farcasterAdmissionPanel.test.tsx',
      'tests/menuFarcasterAuthIntegration.test.tsx',
      'tests/WarpkeepExperienceRealm.test.tsx',
      'tests/WarpkeepExperience.test.tsx',
      'tests/WarpkeepSpacetimeTermsGate.test.tsx',
      'tests/WarpkeepSpacetimeCanonicalReadiness.test.tsx',
      'tests/menuMainMenu.test.tsx',
      'tests/settingsPanel.test.tsx',
      'tests/creditsRoll.test.tsx',
      'tests/warpkeepBuildStamp.test.tsx',
      'tests/latestPatchNotes.test.ts',
      'tests/realmMapScreen.test.tsx',
      'tests/realmAccessibilityControls.test.tsx',
      'tests/realmInteractionState.test.ts',
      'tests/castleInspectionPanel.test.tsx',
      'tests/realmHud.test.tsx',
      'tests/renderedWebglQaFixture.test.ts',
      'tests/renderedWebglQaHarness.test.tsx',
      'tests/renderedWebglQaContract.test.ts',
      'tests/renderedWebglBrowserProbe.test.ts'
    ]);
    const renderedWebglBrowser = quick.find((check) => check.id === 'rendered-webgl-browser');
    expect(renderedWebglBrowser?.executable).toBe(process.execPath);
    expect(renderedWebglBrowser?.networkBoundary).toBe('self-contained-browser');
    expect(renderedWebglBrowser?.maximumAttempts).toBe(2);
    expect(renderedWebglBrowser?.args).toEqual([
      join(repositoryRoot, 'scripts/qa-observer/rendered-webgl-browser-probe.mjs')
    ]);
    const sandboxBoundary = quick.find((check) => check.id === 'sandbox-boundary');
    expect(sandboxBoundary).toMatchObject({
      executable: process.execPath,
      args: [],
      timeoutMs: 10_000
    });
    expect(sandboxBoundary?.networkBoundary).toBeUndefined();
    expect(standard.map((check) => check.id)).toEqual([
      'rendered-webgl-browser', 'sandbox-boundary', 'full-unit', 'typecheck',
      'runtime-assets', 'file-sizes'
    ]);
    expect(deep.map((check) => check.id)).toEqual(expect.arrayContaining([
      'production-build',
      'auth-bridge-unit',
      'auth-bridge-workerd-unit',
      'spacetimedb-unit',
      'spacetimedb-build',
      'spacetimedb-bindings',
      'spacetimedb-migration'
    ]));
    expect(JSON.stringify({ quick, standard, deep })).not.toMatch(
      /(?:deploy|publish|seed-world|allow-fid|disable-fid|bump-auth|apply|reconcile|secret|token|credential)/i
    );
  });

  it('retries only the reviewed local fixture lanes once and records the aggregate attempt count', async () => {
    const calls = new Map<string, number>();
    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'off',
      executeCheck: async (check) => {
        const attempt = (calls.get(check.id) ?? 0) + 1;
        calls.set(check.id, attempt);
        const transient = ['rendered-webgl-browser', 'synthetic-app-states'].includes(check.id);
        return {
          id: check.id,
          status: transient && attempt === 1 ? 'fail' : 'pass',
          durationMs: attempt
        };
      }
    });

    expect(report.status).toBe('pass');
    expect(Object.fromEntries(calls)).toEqual({
      'rendered-webgl-browser': 2,
      'sandbox-boundary': 1,
      'targeted-unit': 1,
      'synthetic-app-states': 2,
      typecheck: 1
    });
    expect(report.checks.find((check) => check.id === 'rendered-webgl-browser')).toEqual({
      id: 'rendered-webgl-browser',
      status: 'pass',
      durationMs: 3,
      attempts: 2
    });
    expect(report.checks.find((check) => check.id === 'synthetic-app-states')).toEqual({
      id: 'synthetic-app-states',
      status: 'pass',
      durationMs: 3,
      attempts: 2
    });
    expect(report.checks.find((check) => check.id === 'sandbox-boundary')?.attempts).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/(?:output|stderr|stdout|payload|token|credential)/i);
  });

  it('stops a persistently failing rendered fixture at the two-attempt cap', async () => {
    let renderedAttempts = 0;
    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'off',
      executeCheck: async (check) => {
        if (check.id === 'rendered-webgl-browser') renderedAttempts += 1;
        return {
          id: check.id,
          status: check.id === 'rendered-webgl-browser' ? 'fail' : 'pass',
          durationMs: 1
        };
      }
    });

    expect(renderedAttempts).toBe(2);
    expect(report.status).toBe('fail');
    expect(report.checks[0]).toEqual({
      id: 'rendered-webgl-browser',
      status: 'fail',
      durationMs: 2,
      attempts: 2
    });
  });

  it('attests exact package-script, disabled production-gate, and sandbox contracts', async () => {
    const root = await temporaryRoot();
    const contracts = [
      ['package.json', 'warpkeep', {
        test: 'vitest --run',
        typecheck: 'tsc -b',
        build: 'tsc -b && vite build && node scripts/verify-production-dist-exclusions.mjs',
        'verify:runtime-assets': 'node scripts/verify-runtime-assets.mjs',
        'verify:file-sizes': 'node scripts/verify-file-sizes.mjs',
        'qa:rendered-webgl': 'node scripts/qa-observer/rendered-webgl-browser-probe.mjs',
        'stdb:verify-bindings': 'node scripts/verify-spacetime-bindings.mjs',
        'stdb:verify-additive-migration': 'node scripts/verify-spacetime-additive-migration.mjs'
      }],
      ['services/auth-bridge/package.json', '@warpkeep/auth-bridge', {
        typecheck: 'tsc --noEmit',
        'typecheck:workerd': 'tsc --noEmit -p test-workerd/tsconfig.json',
        test: 'vitest run',
        'test:workerd': 'vitest run --config vitest.workerd.config.ts'
      }],
      ['spacetimedb/package.json', 'warpkeep-spacetimedb-module', {
        typecheck: 'tsc --noEmit',
        'test:pure': 'tsx --test tests/*.test.ts',
        'stdb:build': 'spacetime build --module-path .'
      }]
    ] as const;
    for (const [path, name, scripts] of contracts) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), JSON.stringify({ name, private: true, scripts }));
    }
    await mkdir(join(root, 'scripts/qa-observer'), { recursive: true });
    await writeFile(
      join(root, 'scripts/qa-observer/qa-cycle-network.sb'),
      await readFile(join(repositoryRoot, 'scripts/qa-observer/qa-cycle-network.sb'), 'utf8')
    );
    const disabledProductionGates = [
      '[vars]',
      'PUBLIC_AUTH_ENABLED = "false"',
      'QA_OBSERVER_ENABLED = "false"',
      ''
    ].join('\n');
    await writeFile(
      join(root, 'services/auth-bridge/wrangler.toml'),
      disabledProductionGates
    );
    await expect(attestQaRepository(root)).resolves.toBeUndefined();
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'warpkeep',
      private: true,
      scripts: { ...contracts[0][2], test: 'node unreviewed-script.mjs' }
    }));
    await expect(attestQaRepository(root)).rejects.toThrow('command contract mismatch');
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'warpkeep',
      private: true,
      scripts: contracts[0][2]
    }));
    for (const unsafeProductionGates of [
      disabledProductionGates.replace(
        'PUBLIC_AUTH_ENABLED = "false"',
        'PUBLIC_AUTH_ENABLED = "true"'
      ),
      disabledProductionGates.replace(
        'QA_OBSERVER_ENABLED = "false"',
        'QA_OBSERVER_ENABLED = "true"'
      ),
      disabledProductionGates.replace(
        'QA_OBSERVER_ENABLED = "false"',
        'QA_OBSERVER_ENABLED = "false"\nQA_OBSERVER_ENABLED = "false"'
      ),
      ...[
        'QA_OBSERVER_PUBLIC_JWK',
        'QA_OBSERVER_KEY_REGISTERED_AT',
        'QA_OBSERVER_KEY_EXPIRES_AT'
      ].map((key) => `${disabledProductionGates}${key} = "forbidden"\n`)
    ]) {
      await writeFile(
        join(root, 'services/auth-bridge/wrangler.toml'),
        unsafeProductionGates
      );
      await expect(attestQaRepository(root)).rejects.toThrow(
        'production gate contract mismatch'
      );
    }
    await writeFile(
      join(root, 'services/auth-bridge/wrangler.toml'),
      disabledProductionGates
    );
    await writeFile(
      join(root, 'scripts/qa-observer/qa-cycle-network.sb'),
      '(version 1)\n(allow default)\n'
    );
    await expect(attestQaRepository(root)).rejects.toThrow('network sandbox contract mismatch');
  });

  it('keeps production builds production-like while pinning SpacetimeDB outside the isolated HOME', () => {
    const environment = qaCycleEnvironment();
    expect(environment.HOME).not.toBe(process.env.HOME);
    expect(environment.NODE_ENV).toBeUndefined();
    expect(environment.SPACETIME_BIN).toMatch(
      /\/\.local\/share\/spacetime\/bin\/2\.6\.1\/spacetimedb-cli$/,
    );
    expect(environment.WARPKEEP_QA_SOCKET_TMP)
      .toMatch(/^\/private\/tmp\/q[A-Za-z0-9_-]{11}$/);
    expect(environment.PATH).not.toContain(`${process.env.HOME}/.local/bin`);
    expect(environment.npm_config_userconfig).toBe('/dev/null');
    expect(environment.npm_config_logs_max).toBe('0');
    expect(environment.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(environment.GIT_CONFIG_NOSYSTEM).toBe('1');
  });

  it('enforces process timeouts without retaining child output', async () => {
    const root = await temporaryRoot();
    const result = await runCommandCheck({
      id: 'bounded-test',
      executable: process.execPath,
      args: ['-e', "process.stdout.write('PRIVATE_PAYLOAD');setTimeout(()=>{},60000)"],
      timeoutMs: 40
    }, {
      cwd: root,
      // The complete Vitest process is already inside the outer runner sandbox
      // during autonomous cycles. Avoid trying to enter a second macOS sandbox
      // solely for this nested process-lifecycle fixture.
      commandContract: (check) => ({
        executable: check.executable,
        args: check.args
      })
    });

    expect(result.status).toBe('timeout');
    expect(result.durationMs).toBeLessThan(5_000);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PAYLOAD');
    expect(Object.keys(result).sort()).toEqual(['durationMs', 'id', 'status']);
  });

  it('terminates background descendants even when the check leader exits successfully', async () => {
    const root = await temporaryRoot();
    const pidPath = join(root, 'descendant.pid');
    const program = [
      "const {spawn}=require('node:child_process');",
      `const child=spawn(${JSON.stringify(process.execPath)},['-e','setInterval(()=>{},60000)'],{stdio:'ignore'});`,
      'child.unref();',
      `require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(child.pid));`
    ].join('');
    const result = await runCommandCheck({
      id: 'bounded-test',
      executable: process.execPath,
      args: ['-e', program],
      timeoutMs: 5_000
    }, {
      cwd: root,
      commandContract: (check) => ({ executable: check.executable, args: check.args })
    });
    expect(result.status).toBe('pass');
    const descendantPid = Number(await readFile(pidPath, 'utf8'));
    expect(Number.isSafeInteger(descendantPid)).toBe(true);
    let alive = true;
    for (let attempt = 0; attempt < 50 && alive; attempt += 1) {
      try {
        process.kill(descendantPid, 0);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      } catch {
        alive = false;
      }
    }
    if (alive) process.kill(descendantPid, 'SIGKILL');
    expect(alive).toBe(false);
  });

  it('uses an owner-only overlap lock and never replaces an active owner', async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, 'private', 'qa-cycle.lock');
    const first = await acquireQaCycleLock(lockPath, {
      now: new Date('2026-07-14T08:00:00.000Z'),
      pid: process.pid,
      runId: '1111111111111111'
    });

    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    await expect(acquireQaCycleLock(lockPath, {
      now: new Date('2026-07-14T08:01:00.000Z'),
      pid: process.pid,
      runId: '2222222222222222'
    })).rejects.toBeInstanceOf(QaCycleLockError);

    await first.release();
    const second = await acquireQaCycleLock(lockPath, {
      now: new Date('2026-07-14T08:02:00.000Z'),
      pid: process.pid,
      runId: '3333333333333333'
    });
    await second.release();
  });

  it('writes only a sanitized mode-0600 report and prunes recognized old reports', async () => {
    const root = await temporaryRoot();
    const reportsDirectory = join(root, 'reports');
    const reportPath = await writePrivateReport(passingReport(), {
      reportsDirectory,
      now: new Date('2026-07-14T08:00:01.000Z'),
      randomSuffix: 'aabbccdd'
    });
    expect((await stat(reportsDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
    const stored = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      'broker', 'checks', 'durationMs', 'finishedAt', 'startedAt', 'status', 'tier', 'version'
    ]);
    expect(JSON.stringify(stored)).not.toMatch(/(?:output|stderr|stdout|payload|token|credential)/i);

    await expect(writePrivateReport({
      ...passingReport(),
      stdout: 'PRIVATE_PAYLOAD'
    } as unknown as QaCycleReport, {
      reportsDirectory,
      now: new Date('2026-07-14T08:00:01.500Z'),
      randomSuffix: 'bbccddee'
    })).rejects.toThrow('Invalid QA report');

    const oldPath = join(reportsDirectory, 'qa-20260601T080000000Z-11223344.json');
    const ignoredPath = join(reportsDirectory, 'keep-me.txt');
    await writeFile(oldPath, '{}\n', { mode: 0o600 });
    await writeFile(ignoredPath, 'not a QA report\n', { mode: 0o600 });
    const old = new Date('2026-06-01T08:00:00.000Z');
    await utimes(oldPath, old, old);
    expect(await prunePrivateReports({
      reportsDirectory,
      now: new Date('2026-07-14T08:00:02.000Z'),
      retentionDays: 14,
      maximumReports: 200
    })).toBe(1);
    expect(await readdir(reportsDirectory)).toEqual(expect.arrayContaining([
      'keep-me.txt',
      'qa-20260714T080001000Z-aabbccdd.json'
    ]));
  });

  it('rejects a report directory reached through a symlink ancestor', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await symlink(outside, join(root, 'linked'));
    await expect(writePrivateReport(passingReport(), {
      reportsDirectory: join(root, 'linked', 'reports'),
      now: new Date('2026-07-14T08:00:01.000Z'),
      randomSuffix: 'aabbccdd'
    })).rejects.toThrow('Unsafe directory');
    await expect(readFile(
      join(outside, 'reports', 'qa-20260714T080001000Z-aabbccdd.json'),
      'utf8'
    )).rejects.toThrow();
    await expect(readdir(outside)).resolves.not.toContain('reports');
  });

  it('probes only the exact owner-private Unix socket health route without credentials', async () => {
    let observed: Readonly<{ method?: string; url?: string; origin?: string }> = {};
    await withLocalBroker((request, response) => {
      observed = {
        method: request.method,
        url: request.url,
        origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined
      };
      const body = JSON.stringify({ ok: true, mode: 'read-only' });
      response.writeHead(200, brokerJsonHeaders(body));
      response.end(body);
    }, async (socketPath) => {
      await expect(probeLocalBrokerHealth({ socketPath })).resolves.toBeUndefined();
    });
    expect(observed).toEqual({ method: 'GET', url: '/healthz', origin: undefined });
  });

  it('fails closed before opening an overlong Unix socket path', async () => {
    await expect(probeLocalBrokerHealth({
      socketPath: `/${'a'.repeat(100)}`
    })).rejects.toThrow('Unsafe local QA broker socket');
  });

  it('validates and discards only the bounded identity-free Unix-socket attestation', async () => {
    let observed: Readonly<{ method?: string; url?: string; origin?: string }> = {};
    await withLocalBroker((request, response) => {
      observed = {
        method: request.method,
        url: request.url,
        origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined
      };
      const body = JSON.stringify(sanitizedObserverSnapshot());
      response.writeHead(200, brokerJsonHeaders(body));
      response.end(body);
    }, async (socketPath) => {
      await expect(probeLocalBrokerSnapshot({ socketPath })).resolves.toBeUndefined();
    });
    expect(observed).toEqual({ method: 'GET', url: '/snapshot', origin: undefined });

    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'snapshot',
      probeBroker: async () => {},
      executeCheck: async (check) => ({
        id: check.id,
        status: 'pass',
        durationMs: 1
      })
    });
    expect(report.status).toBe('pass');
    expect(report.checks[0]).toEqual({
      id: 'broker-snapshot',
      status: 'pass',
      durationMs: expect.any(Number),
      attempts: 1
    });
    expect(Object.keys(report.checks[0]!).sort()).toEqual([
      'attempts', 'durationMs', 'id', 'status'
    ]);
    expect(JSON.stringify(report)).not.toMatch(/(?:castleId|worldSeed|fid|publicBio|portraitAvailable)/i);
  });

  it('rejects oversized or identity-bearing snapshot responses', async () => {
    await withLocalBroker((_request, response) => {
      const body = JSON.stringify({ ...sanitizedObserverSnapshot(), fid: 424242 });
      response.writeHead(200, brokerJsonHeaders(body));
      response.end(body);
    }, async (socketPath) => {
      await expect(probeLocalBrokerSnapshot({ socketPath })).rejects.toThrow();
    });
    await withLocalBroker((_request, response) => {
      response.writeHead(200, {
        ...brokerJsonHeaders('{}'),
        'content-length': String(16 * 1_024 + 1)
      });
      response.end('{}');
    }, async (socketPath) => {
      await expect(probeLocalBrokerSnapshot({ socketPath })).rejects.toThrow();
    });
  });

  it('rejects a broker response without the exact no-store and nosniff envelope', async () => {
    const body = JSON.stringify({ ok: true, mode: 'read-only' });
    await withLocalBroker((_request, response) => {
      response.writeHead(200, brokerJsonHeaders(body, { 'cache-control': 'private' }));
      response.end(body);
    }, async (socketPath) => {
      await expect(probeLocalBrokerHealth({ socketPath })).rejects.toThrow(
        'Invalid local QA broker response'
      );
    });

    await withLocalBroker((_request, response) => {
      response.writeHead(200, brokerJsonHeaders(body, { 'x-content-type-options': 'sniff' }));
      response.end(body);
    }, async (socketPath) => {
      await expect(probeLocalBrokerHealth({ socketPath })).rejects.toThrow(
        'Invalid local QA broker response'
      );
    });
  });

  it('bounds a stalled Unix-socket snapshot response', async () => {
    await withLocalBroker((_request, _response) => {}, async (socketPath) => {
      const startedAt = Date.now();
      await expect(probeLocalBrokerSnapshot({ socketPath, timeoutMs: 40 })).rejects.toThrow(
        'timed out'
      );
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    });
  });

  it('fails the aggregate report closed and keeps the launchd schedule inert', async () => {
    const checks = checksForTier('quick');
    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'health',
      probeBroker: async () => {
        throw new Error('unavailable');
      },
      executeCheck: async (check) => ({
        id: check.id,
        status: check === checks[0] ? 'fail' : 'pass',
        durationMs: 1
      })
    });
    expect(report.status).toBe('fail');
    expect(report.checks.map((check) => check.status)).toContain('fail');

    const template = await readFile(join(
      repositoryRoot,
      'scripts/qa-observer/launchd/com.warpkeep.qa-cycle.plist.template'
    ), 'utf8');
    expect(template.match(/<key>Hour<\/key>/g)).toHaveLength(12);
    expect(template).toContain('<integer>8</integer>');
    expect(template).toContain('<integer>19</integer>');
    expect(template).toContain('--broker=off');
    expect(template).not.toContain('--broker=health');
    expect(template).not.toContain('--broker=snapshot');
    expect(template).not.toMatch(/(?:RunAtLoad|KeepAlive|launchctl)/);
  });

  it('stops before repository tests when the parent sandbox boundary does not pass', async () => {
    const executed: string[] = [];
    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'off',
      executeCheck: async (check) => {
        executed.push(check.id);
        return {
          id: check.id,
          status: check.id === 'sandbox-boundary' ? 'fail' : 'pass',
          durationMs: 1
        };
      }
    });

    expect(executed).toEqual(['rendered-webgl-browser', 'sandbox-boundary']);
    expect(report.status).toBe('fail');
    expect(report.checks).toEqual([
      { id: 'rendered-webgl-browser', status: 'pass', durationMs: 1, attempts: 1 },
      { id: 'sandbox-boundary', status: 'fail', durationMs: 1, attempts: 1 }
    ]);
  });

  it('also stops when the parent sandbox boundary cannot be executed', async () => {
    const executed: string[] = [];
    const report = await runQaCycle({
      startedAt: new Date(),
      tier: 'quick',
      broker: 'off',
      executeCheck: async (check) => {
        executed.push(check.id);
        if (check.id === 'sandbox-boundary') throw new Error('unavailable');
        return { id: check.id, status: 'pass', durationMs: 1 };
      }
    });

    expect(executed).toEqual(['rendered-webgl-browser', 'sandbox-boundary']);
    expect(report.status).toBe('fail');
    expect(report.checks.at(-1)).toEqual({
      id: 'sandbox-boundary',
      status: 'fail',
      durationMs: 0,
      attempts: 1
    });
  });
});
