import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createOwnedTemporaryFixtures } from './helpers/ownedTemporaryFixture';

import {
  PrivateOperatorReportError,
  inspectPrivateOperatorReports,
  withExclusiveOperatorLock,
  writePrivateOperatorReport,
} from '../scripts/private-operator-report';

const temporaryFixtures = createOwnedTemporaryFixtures();
afterEach(() => temporaryFixtures.cleanup());

function privateDirectory(): string {
  const path = temporaryFixtures.create('warpkeep-private-operator-');
  chmodSync(path, 0o700);
  return path;
}

describe('private operator report boundaries', () => {
  it('removes owned fixtures without following links into another fixture owner', () => {
    const borrowedFixtures = createOwnedTemporaryFixtures();
    const borrowed = borrowedFixtures.create('warpkeep-fixture-cleanup-sentinel-');
    try {
      const sentinel = join(borrowed, 'preserved.txt');
      writeFileSync(sentinel, 'preserved\n');
      const owned = temporaryFixtures.create('warpkeep-fixture-cleanup-owned-');
      writeFileSync(join(owned, 'disposable.txt'), 'disposable\n');
      symlinkSync(borrowed, join(owned, 'borrowed'), 'junction');
      temporaryFixtures.cleanup();
      expect(existsSync(owned)).toBe(false);
      expect(readFileSync(sentinel, 'utf8')).toBe('preserved\n');
      // A second teardown is harmless and still cannot select another owner's root.
      temporaryFixtures.cleanup();
      expect(existsSync(borrowed)).toBe(true);
    } finally { borrowedFixtures.cleanup(); }
  });

  it('writes only mode-0600 privacy-screened reports in a mode-0700 directory', () => {
    const directory = privateDirectory();
    writePrivateOperatorReport({
      reportDirectory: directory,
      command: 'profiles-plan',
      report: { schemaVersion: 1, command: 'profiles-plan' },
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    const filename = readdirSync(directory).find(name => name.endsWith('.json')) as string;
    expect(statSync(directory).mode & 0o077).toBe(0);
    expect(statSync(join(directory, filename)).mode & 0o077).toBe(0);
    expect(JSON.parse(readFileSync(join(directory, filename), 'utf8')))
      .toMatchObject({ command: 'profiles-plan' });
    expect(inspectPrivateOperatorReports(directory)).toMatchObject({
      reportCount: 1,
      lockPresent: false,
      byCommand: { 'profiles-plan': 1 },
    });
    expect(() => writePrivateOperatorReport({
      reportDirectory: directory,
      command: 'profiles-refresh',
      report: { senderAddress: '0x1111111111111111111111111111111111111111' },
    })).toThrow('PRIVATE_OPERATOR_REPORT_SENSITIVE_FIELD');
  });

  it('prevents overlapping instances without deleting another lock', async () => {
    const directory = privateDirectory();
    writeFileSync(join(directory, '.operator.lock'), '{}\n', { mode: 0o600 });
    await expect(withExclusiveOperatorLock(directory, async () => true))
      .rejects.toThrow('PRIVATE_OPERATOR_ALREADY_RUNNING');
    expect(readFileSync(join(directory, '.operator.lock'), 'utf8')).toBe('{}\n');
  });

  it('uses a generic typed error for local report failures', async () => {
    const directory = privateDirectory();
    writeFileSync(join(directory, '.operator.lock'), '{}', { mode: 0o600 });
    try {
      await withExclusiveOperatorLock(directory, async () => true);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateOperatorReportError);
      expect((error as PrivateOperatorReportError).code)
        .toBe('PRIVATE_OPERATOR_ALREADY_RUNNING');
    }
  });
});
