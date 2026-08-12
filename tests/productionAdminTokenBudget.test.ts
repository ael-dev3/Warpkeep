// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultProductionAdminStateDirectory,
  ensureProductionAdminTokenReservation,
  inspectProductionAdminTokenBudget,
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

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(`/private/tmp/${prefix}`);
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
