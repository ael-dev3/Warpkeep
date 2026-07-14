import {
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
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  QaCycleLockError,
  acquireQaCycleLock,
  attestQaRepository,
  checksForTier,
  qaCycleEnvironment,
  probeLocalBrokerHealth,
  probeLocalBrokerSnapshot,
  prunePrivateReports,
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
  it('selects predictable tiers and exposes only static non-mutating checks', () => {
    expect(tierForLocalHour(8)).toBe('quick');
    expect(tierForLocalHour(9)).toBe('standard');
    expect(tierForLocalHour(12)).toBe('deep');
    expect(tierForLocalHour(18)).toBe('deep');

    const quick = checksForTier('quick');
    const standard = checksForTier('standard');
    const deep = checksForTier('deep');
    expect(quick.map((check) => check.id)).toEqual(['targeted-unit', 'typecheck']);
    expect(standard.map((check) => check.id)).toEqual([
      'full-unit', 'typecheck', 'runtime-assets', 'file-sizes'
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
    await expect(attestQaRepository(root)).resolves.toBeUndefined();
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'warpkeep',
      private: true,
      scripts: { ...contracts[0][2], test: 'node unreviewed-script.mjs' }
    }));
    await expect(attestQaRepository(root)).rejects.toThrow('command contract mismatch');
  });

  it('keeps production builds production-like while pinning SpacetimeDB outside the isolated HOME', () => {
    const environment = qaCycleEnvironment();
    expect(environment.HOME).not.toBe(process.env.HOME);
    expect(environment.NODE_ENV).toBeUndefined();
    expect(environment.SPACETIME_BIN).toMatch(
      /\/\.local\/share\/spacetime\/bin\/2\.6\.1\/spacetimedb-cli$/,
    );
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
    }, { cwd: root });

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
  });

  it('probes only the exact loopback broker health route without credentials', async () => {
    const response = new Response(JSON.stringify({ ok: true, mode: 'read-only' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
    Object.defineProperty(response, 'url', {
      value: 'http://127.0.0.1:41731/healthz'
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
    await expect(probeLocalBrokerHealth(fetchMock as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:41731/healthz');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toMatch(/(?:authorization|cookie|token)/i);
  });

  it('validates and discards only the bounded FID-free loopback snapshot', async () => {
    const response = new Response(JSON.stringify(sanitizedObserverSnapshot()), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
    Object.defineProperty(response, 'url', {
      value: 'http://127.0.0.1:41731/snapshot'
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);

    await expect(probeLocalBrokerSnapshot(
      fetchMock as unknown as typeof fetch
    )).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:41731/snapshot');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        Origin: 'http://127.0.0.1:5173'
      }
    });
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toMatch(
      /(?:authorization|cookie|token|proof)/i
    );

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
    const identityBearing = new Response(JSON.stringify({
      ...sanitizedObserverSnapshot(),
      fid: 424242
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    Object.defineProperty(identityBearing, 'url', {
      value: 'http://127.0.0.1:41731/snapshot'
    });
    const oversized = new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(256 * 1_024 + 1)
      }
    });
    Object.defineProperty(oversized, 'url', {
      value: 'http://127.0.0.1:41731/snapshot'
    });

    for (const response of [identityBearing, oversized]) {
      const fetchMock = vi.fn(async () => response);
      await expect(probeLocalBrokerSnapshot(
        fetchMock as unknown as typeof fetch
      )).rejects.toThrow();
    }
  });

  it('gives the snapshot broker 30 seconds but remains strictly bounded', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException(
            'The operation was aborted.',
            'AbortError'
          )), { once: true });
        });
      });
      const probe = probeLocalBrokerSnapshot(fetchMock as unknown as typeof fetch);
      const rejection = expect(probe).rejects.toMatchObject({ name: 'AbortError' });

      await vi.advanceTimersByTimeAsync(29_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
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
    expect(template).toContain('--broker=snapshot');
    expect(template).not.toContain('--broker=health');
    expect(template).not.toMatch(/(?:RunAtLoad|KeepAlive|launchctl)/);
  });
});
