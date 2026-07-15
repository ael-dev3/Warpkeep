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

async function temporaryRoot() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'warpkeep-qa-cycle-')));
  temporaryRoots.push(root);
  return root;
}

async function temporarySocketRoot() {
  // Darwin's Unix socket path ceiling is much shorter than a runner-isolated
  // TMPDIR can be. Keep this test transport independent of that environment.
  const root = await realpath(await mkdtemp('/tmp/wkq-'));
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
    version: 1,
    startedAt: '2026-07-14T08:00:00.000Z',
    finishedAt: '2026-07-14T08:00:01.000Z',
    tier: 'quick',
    broker: 'off',
    status: 'pass',
    durationMs: 1_000,
    checks: [{ id: 'targeted-unit', status: 'pass', durationMs: 900 }]
  };
}

function sanitizedObserverSnapshot() {
  return {
    version: 1,
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
    castles: [{
      castleId: 1,
      tileKey: '0,0',
      q: 0,
      r: 0,
      level: 1,
      name: 'Synthetic Test Keep',
      portraitAvailable: false,
      publicStatus: 'founded'
    }]
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true
  })));
});

describe('local autonomous QA cycle runner', () => {
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
      profilePath: '/reviewed/qa-cycle-network.sb'
    })).toEqual({
      executable: '/usr/bin/sandbox-exec',
      args: [
        '-D',
        'OBSERVATORY_ROOT=/Users/test/Library/Application Support/Warpkeep/qa-observatory',
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
      'targeted-unit',
      'synthetic-app-states',
      'rendered-webgl-browser',
      'typecheck'
    ]);
    const syntheticAppStates = quick.find((check) => check.id === 'synthetic-app-states');
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
    expect(renderedWebglBrowser?.args).toEqual([
      join(repositoryRoot, 'scripts/qa-observer/rendered-webgl-browser-probe.mjs')
    ]);
    expect(standard.map((check) => check.id)).toEqual([
      'full-unit', 'typecheck', 'rendered-webgl-browser', 'runtime-assets', 'file-sizes'
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

  it('attests the exact package-script contract before autonomous execution', async () => {
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
    expect(environment.PATH).not.toContain(`${process.env.HOME}/.local/bin`);
    expect(environment.npm_config_userconfig).toBe('/dev/null');
    expect(environment.npm_config_logs_max).toBe('0');
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
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, mode: 'read-only' }));
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

  it('validates and discards only the bounded FID-free Unix-socket snapshot', async () => {
    let observed: Readonly<{ method?: string; url?: string; origin?: string }> = {};
    await withLocalBroker((request, response) => {
      observed = {
        method: request.method,
        url: request.url,
        origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined
      };
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(sanitizedObserverSnapshot()));
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
      durationMs: expect.any(Number)
    });
    expect(Object.keys(report.checks[0]!).sort()).toEqual(['durationMs', 'id', 'status']);
    expect(JSON.stringify(report)).not.toMatch(/(?:castleId|worldSeed|fid|publicBio|portraitAvailable)/i);
  });

  it('rejects oversized or identity-bearing snapshot responses', async () => {
    await withLocalBroker((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ...sanitizedObserverSnapshot(), fid: 424242 }));
    }, async (socketPath) => {
      await expect(probeLocalBrokerSnapshot({ socketPath })).rejects.toThrow();
    });
    await withLocalBroker((_request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(256 * 1_024 + 1)
      });
      response.end('{}');
    }, async (socketPath) => {
      await expect(probeLocalBrokerSnapshot({ socketPath })).rejects.toThrow();
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
});
