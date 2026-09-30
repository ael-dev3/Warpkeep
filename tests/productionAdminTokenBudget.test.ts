// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultProductionAdminStateDirectory,
  ensureProductionAdminTokenReservation,
  inspectProductionAdminTokenBudget,
  productionAdminRecordedOwnerIsDead,
  productionAdminRecordedOwnerDigestIsDead,
  productionAdminTokenBudgetTestSeams,
  probeProductionAdminProcessIdentity,
  recordProductionAdminTokenAttempt,
  releaseProductionAdminTokenReservation,
  reserveProductionAdminTokenBudget,
} from '../scripts/production-admin-token-budget.mjs';
import {
  readProductionAdminBridgeTrustedTime,
  requestAdminToken,
} from '../scripts/hermes-admin';

const temporaryDirectories: string[] = [];
const NOW = Date.parse('2026-08-11T17:45:00.000Z');

describe('production administrator process identities', () => {
  const boot = '12345678-1234-1234-1234-123456789abc';
  const stable = `linux-v1:${boot}:8573835`;
  const legacy = 'Tue Sep 29 17:50:47 2026';
  const livePid = () => true;
  const digest = (value: string, length: number) => createHash('sha256')
    .update(value, 'utf8').digest('hex').slice(0, length);
  const stat = (pid = 1234, ticks = '8573835', comm = 'worker') => (
    `${pid} (${comm}) ${['S', ...Array<string>(18).fill('0'), ticks, '0', '0'].join(' ')}\n`
  );

  it('does not treat a live legacy owner as dead when its displayed start time drifts', () => {
    const original = 'Tue Sep 29 17:50:47 2026';
    const observed = 'Tue Sep 29 17:50:57 2026';
    expect(productionAdminRecordedOwnerIsDead({
      pid: 1234,
      processStartIdentity: original,
      probe: () => ({ state: 'present', identity: observed }),
    })).toBeUndefined();
  });

  it('keeps exact owners and proves reuse only with different stable Linux birth identities', () => {
    const probe = (_pid: number, expected?: string) => ({
      state: 'present' as const,
      identity: expected === legacy ? legacy : stable,
    });
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234, processStartIdentity: legacy, probe })).toBe(false);
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234, processStartIdentity: stable, probe })).toBe(false);
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234,
      processStartIdentity: `linux-v1:${boot}:8573834`, probe })).toBe(true);
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234,
      processStartIdentity: stable, probe: () => ({ state: 'absent' }) })).toBe(true);
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234,
      processStartIdentity: stable, probe: () => ({ state: 'ambiguous' }) })).toBeUndefined();
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234,
      processStartIdentity: 'unknown-start-format', probe })).toBeUndefined();
  });

  it.each([16, 64])('matches stable or legacy %s-character owner digests without treating a live nonmatch as dead', length => {
    const probe = (_pid: number, expected?: string) => ({
      state: 'present' as const, identity: expected === 'legacy' ? legacy : stable,
    });
    for (const identity of [stable, legacy]) {
      expect(productionAdminRecordedOwnerDigestIsDead({ pid: 1234,
        processStartIdentityDigest: digest(identity, length), probe })).toBe(false);
    }
    expect(productionAdminRecordedOwnerDigestIsDead({ pid: 1234,
      processStartIdentityDigest: digest('clock-shifted-or-unknown-owner', length), probe })).toBeUndefined();
    expect(productionAdminRecordedOwnerDigestIsDead({ pid: 1234,
      processStartIdentityDigest: digest(legacy, length),
      probe: () => ({ state: 'absent' }) })).toBe(true);
    expect(productionAdminRecordedOwnerDigestIsDead({ pid: 1234,
      processStartIdentityDigest: digest(legacy, length),
      probe: () => ({ state: 'ambiguous' }) })).toBeUndefined();
  });

  it('reads bounded Linux birth fields and ignores arbitrary comm bytes and parentheses', () => {
    const comm = Buffer.from([0x77, 0xff, 0xc3, 0x28, 0x29, 0x20, 0x78]).toString('latin1');
    const reads: Array<readonly [string, number]> = [];
    const observed = productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, (path, limit) => {
      reads.push([path, limit]);
      if (path === '/proc/sys/kernel/random/boot_id') return `${boot}\n`;
      if (path === '/proc/1234/stat') return stat(1234, '8573835', comm);
      throw new Error('unexpected process birth source');
    }, livePid);
    expect(observed).toEqual({ state: 'present', identity: stable });
    expect(reads).toEqual([['/proc/sys/kernel/random/boot_id', 64], ['/proc/1234/stat', 4096]]);
  });

  it.each([
    { boot: 'invalid', stat: stat() },
    { boot: `\u00a0${boot}`, stat: stat() },
    { boot, stat: stat(4321) },
    { boot, stat: '1234 (worker) S 0\n' },
    { boot, stat: stat(1234, '08573835') },
    { boot, stat: stat(1234, '8573835.0') },
    { boot, stat: stat(1234, '1'.repeat(21)) },
    { boot, stat: stat().replace(') S ', ') S \u00a0') },
    { boot, stat: `${stat()}${' '.repeat(4096)}` },
  ])('fails closed on malformed or unbounded Linux birth data %#', fixture => {
    expect(productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, path => (
      path.endsWith('/boot_id') ? fixture.boot : fixture.stat
    ), livePid)).toEqual({ state: 'ambiguous' });
  });

  it('distinguishes an absent PID from inaccessible proc data and an unavailable boot identity', () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    let existenceChecks = 0;
    expect(productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, path => {
      if (path.endsWith('/boot_id')) return boot;
      throw missing;
    }, () => {
      existenceChecks += 1;
      if (existenceChecks > 1) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      return true;
    })).toEqual({ state: 'absent' });
    expect(productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, () => {
      throw missing;
    }, livePid)).toEqual({ state: 'ambiguous' });
    expect(productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, path => {
      if (path.endsWith('/boot_id')) return boot;
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    }, livePid)).toEqual({ state: 'ambiguous' });
    expect(probeProductionAdminProcessIdentity(-1)).toEqual({ state: 'ambiguous' });
  });

  it('keeps a live owner unknown when its proc stat view is missing instead of declaring it dead', () => {
    const observed = productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, path => {
      if (path.endsWith('/boot_id')) return boot;
      throw Object.assign(new Error('proc view missing'), { code: 'ENOENT' });
    }, livePid);
    expect(observed).toEqual({ state: 'ambiguous' });
    expect(productionAdminRecordedOwnerIsDead({ pid: 1234,
      processStartIdentity: stable, probe: () => observed })).toBeUndefined();
    expect(productionAdminTokenBudgetTestSeams.probeLinuxProcessIdentity(1234, () => {
      throw new Error('proc should not be read for an inaccessible PID');
    }, () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }))
      .toEqual({ state: 'ambiguous' });
  });

  it.skipIf(process.platform !== 'linux')('uses the actual kernel birth token by default for new owner records', () => {
    expect(probeProductionAdminProcessIdentity(process.pid)).toEqual({ state: 'present', identity: expect.stringMatching(/^linux-v1:/u) });
  });
});

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function options(directory: string, now = NOW) {
  return Object.freeze({ stateDirectory: directory, now: () => now });
}

describe('shared production administrator token budget', () => {
  it('persists six attempts across callers/restarts and serializes concurrent claims', async () => {
    const directory = temporaryDirectory('warpkeep-admin-budget-concurrent-');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => (
      recordProductionAdminTokenAttempt(options(directory))
    )));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(6);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(2);
    await expect(inspectProductionAdminTokenBudget(options(directory))).resolves.toMatchObject({
      attempts: 6,
      reserved: 0,
      remaining: 0,
    });
    await expect(recordProductionAdminTokenAttempt(options(directory)))
      .rejects.toThrow(/PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED/);
  });

  it.each(['lock-temp-opened', 'lock-linked'] as const)(
    'recovers the exact %s SIGKILL boundary without wedging later callers',
    async step => {
      const directory = temporaryDirectory(`warpkeep-admin-budget-crash-${step}-`);
      const modulePath = join(process.cwd(), 'scripts', 'production-admin-token-budget.mjs');
      const child = spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        [
          `import { recordProductionAdminTokenAttempt } from ${JSON.stringify(modulePath)};`,
          `await recordProductionAdminTokenAttempt({`,
          `stateDirectory:${JSON.stringify(directory)},now:()=>${NOW},`,
          `testOnlyStep:value=>{if(value===${JSON.stringify(step)})process.kill(process.pid,'SIGKILL');}`,
          `});`,
        ].join('\n'),
      ], {
        encoding: 'utf8',
        env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }),
      });
      expect(child.signal).toBe('SIGKILL');
      const before = readdirSync(directory)
        .filter(name => name.includes('admin-token-budget-v1'))
        .sort();
      expect(before.some(name => name.endsWith('.tmp'))).toBe(true);
      if (step === 'lock-linked') {
        const final = lstatSync(join(directory, '.admin-token-budget-v1.lock'));
        const temporary = lstatSync(join(directory, before.find(name => name.endsWith('.tmp'))!));
        expect(final.nlink).toBe(2);
        expect(temporary.dev).toBe(final.dev);
        expect(temporary.ino).toBe(final.ino);
      }
      const recoveryNow = step === 'lock-linked' ? NOW + 30_001 : NOW;
      await expect(inspectProductionAdminTokenBudget(options(directory, recoveryNow))).resolves.toMatchObject({
        attempts: 0,
        reserved: 0,
        remaining: 6,
      });
      expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false);
      expect(existsSync(join(directory, '.admin-token-budget-v1.lock'))).toBe(false);
    },
  );

  it('reserves reconciliation capacity from ordinary callers and records before failed HTTP', async () => {
    const directory = temporaryDirectory('warpkeep-admin-budget-reservation-');
    const reservation = await reserveProductionAdminTokenBudget({
      ...options(directory),
      slots: 2,
    });
    for (let index = 0; index < 4; index += 1) {
      await recordProductionAdminTokenAttempt(options(directory));
    }
    await expect(recordProductionAdminTokenAttempt(options(directory)))
      .rejects.toThrow(/PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED/);
    await recordProductionAdminTokenAttempt({
      ...options(directory),
      reservationId: reservation.reservationId,
    });
    await expect(inspectProductionAdminTokenBudget(options(directory))).resolves.toMatchObject({
      attempts: 5,
      reserved: 1,
      remaining: 0,
    });
    await releaseProductionAdminTokenReservation({
      ...options(directory),
      reservationId: reservation.reservationId,
    });
    await expect(inspectProductionAdminTokenBudget(options(directory))).resolves.toMatchObject({
      attempts: 5,
      reserved: 0,
      remaining: 1,
    });

    const failedDirectory = temporaryDirectory('warpkeep-admin-budget-failed-http-');
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('offline');
    });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com',
      's'.repeat(32),
      fetchImpl,
      {
        recordAttempt: input => recordProductionAdminTokenAttempt({
          ...options(failedDirectory),
          ...input,
        }),
      },
    )).rejects.toThrow(/Could not reach/);
    await expect(inspectProductionAdminTokenBudget(options(failedDirectory))).resolves.toMatchObject({
      attempts: 1,
      remaining: 5,
    });
  });

  it('clears a reservation only after both expiry and exact dead-owner proof', async () => {
    const directory = temporaryDirectory('warpkeep-admin-budget-stale-');
    const modulePath = join(process.cwd(), 'scripts', 'production-admin-token-budget.mjs');
    const child = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      [
        `import { reserveProductionAdminTokenBudget } from ${JSON.stringify(modulePath)};`,
        `await reserveProductionAdminTokenBudget({stateDirectory:${JSON.stringify(directory)},slots:2,now:()=>${NOW}});`,
      ].join('\n'),
    ], { encoding: 'utf8', env: process.env });
    expect(child.status).toBe(0);
    await expect(inspectProductionAdminTokenBudget(options(directory, NOW + 300_000)))
      .resolves.toMatchObject({ reserved: 2, reservations: 1 });
    await expect(inspectProductionAdminTokenBudget(options(directory, NOW + 300_001)))
      .resolves.toMatchObject({ reserved: 0, reservations: 0 });
  });

  it('fails closed on rollback/future state and rejects unsafe state ancestors', async () => {
    const directory = temporaryDirectory('warpkeep-admin-budget-clock-');
    await recordProductionAdminTokenAttempt(options(directory));
    await expect(inspectProductionAdminTokenBudget(options(directory, NOW - 1)))
      .rejects.toThrow(/CLOCK_ROLLBACK/);

    const unsafeParent = join(temporaryDirectory('warpkeep-admin-budget-unsafe-'), 'unsafe');
    const unsafeState = join(unsafeParent, 'state');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(unsafeParent, { mode: 0o700 });
    chmodSync(unsafeParent, 0o777);
    await expect(recordProductionAdminTokenAttempt(options(unsafeState)))
      .rejects.toThrow(/ANCESTOR_WRITABLE/);
  });

  it('uses an exact HTTPS Date clock and rejects local forward/backward jumps', async () => {
    const date = new Date(NOW).toUTCString();
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      return new Response('{}', { status: 200, headers: { date } });
    });
    await expect(readProductionAdminBridgeTrustedTime(
      'https://auth.warpkeep.com',
      fetchImpl,
      () => NOW + 30_000,
    )).resolves.toBe(NOW);
    await expect(readProductionAdminBridgeTrustedTime(
      'https://auth.warpkeep.com',
      fetchImpl,
      () => NOW + 60_001,
    )).rejects.toThrow(/token clock/);
    await expect(readProductionAdminBridgeTrustedTime(
      'https://auth.warpkeep.com',
      fetchImpl,
      () => NOW - 60_001,
    )).rejects.toThrow(/token clock/);
  });

  it('ignores ambient HOME and injected fake-fetch calls leave canonical state untouched', async () => {
    const beforeHome = process.env.HOME;
    const canonicalDirectory = defaultProductionAdminStateDirectory();
    const ledgerPath = join(canonicalDirectory, 'admin-token-budget-v1.json');
    const before = existsSync(ledgerPath) ? readFileSync(ledgerPath) : undefined;
    try {
      process.env.HOME = temporaryDirectory('warpkeep-hostile-home-');
      expect(defaultProductionAdminStateDirectory()).toBe(canonicalDirectory);
      await expect(requestAdminToken(
        'https://auth.warpkeep.com',
        's'.repeat(32),
        vi.fn(async () => { throw new Error('test-only offline'); }),
        {
          recordAttempt: async () => Object.freeze({
            attemptId: '0'.repeat(32), attemptedAtMs: NOW, reservationId: null,
          }),
        },
      )).rejects.toThrow(/Could not reach/);
    } finally {
      if (beforeHome === undefined) delete process.env.HOME;
      else process.env.HOME = beforeHome;
    }
    const after = existsSync(ledgerPath) ? readFileSync(ledgerPath) : undefined;
    expect(after?.equals(before ?? Buffer.alloc(0)) ?? before === undefined).toBe(true);
  });

  it('replenishes only an exact live owner reservation', async () => {
    const directory = temporaryDirectory('warpkeep-admin-budget-replenish-');
    const reservation = await reserveProductionAdminTokenBudget({
      ...options(directory), slots: 2,
    });
    await recordProductionAdminTokenAttempt({
      ...options(directory), reservationId: reservation.reservationId,
    });
    // A second process/caller may advance the shared trusted timestamp before
    // this owner closes. Exact owned release must not strand its reservation.
    await recordProductionAdminTokenAttempt(options(directory, NOW + 1_000));
    await expect(releaseProductionAdminTokenReservation({
      ...options(directory),
      reservationId: reservation.reservationId,
    })).resolves.toMatchObject({ reservationId: reservation.reservationId });

    const second = await reserveProductionAdminTokenBudget({
      ...options(directory, NOW + 1_000), slots: 2,
    });
    await recordProductionAdminTokenAttempt({
      ...options(directory, NOW + 1_000), reservationId: second.reservationId,
    });
    await expect(ensureProductionAdminTokenReservation({
      ...options(directory, NOW + 1_000),
      reservationId: second.reservationId,
      minimumRemaining: 1,
    })).resolves.toMatchObject({ remaining: 1 });
    await expect(ensureProductionAdminTokenReservation({
      ...options(directory, NOW + 1_000),
      reservationId: 'f'.repeat(32),
      minimumRemaining: 1,
    })).rejects.toThrow(/RESERVATION_INVALID/);
  });
});
