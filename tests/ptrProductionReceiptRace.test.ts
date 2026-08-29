// @vitest-environment node

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const race = vi.hoisted(() => ({
  armed: false,
  displacedPath: '',
  target: '' as '' | 'directory' | 'file',
  victimPath: '',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    chmodSync(path: import('node:fs').PathLike, mode: import('node:fs').Mode) {
      const candidate = String(path);
      const selected = race.target === 'file'
        ? candidate.endsWith('.json')
        : race.target === 'directory'
          ? candidate.endsWith('/receipts')
          : false;
      if (race.armed && selected) {
        race.armed = false;
        actual.renameSync(candidate, race.displacedPath);
        actual.symlinkSync(race.victimPath, candidate);
      }
      actual.chmodSync(path, mode);
    },
  };
});

import {
  writePrivatePtrProductionReceipt,
} from '../scripts/ptr-production-receipt-file';

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

describe('PTR production receipt pathname races', () => {
  it('never follows a swapped receipt pathname when applying private mode', () => {
    const root = actualFs.realpathSync(actualFs.mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-receipt-race-'),
    ));
    const repositoryRoot = join(root, 'repository');
    const privateRoot = join(root, 'private');
    const receiptDirectory = join(privateRoot, 'receipts');
    const victimPath = join(root, 'victim.txt');
    actualFs.mkdirSync(repositoryRoot, { mode: 0o700 });
    actualFs.mkdirSync(privateRoot, { mode: 0o700 });
    actualFs.writeFileSync(victimPath, 'not a receipt', { mode: 0o644 });
    actualFs.chmodSync(victimPath, 0o644);
    race.victimPath = victimPath;
    race.displacedPath = join(root, 'displaced-receipt.json');
    race.target = 'file';
    race.armed = true;
    try {
      let failure: unknown;
      try {
        writePrivatePtrProductionReceipt({
          directory: receiptDirectory,
          repositoryRoot,
          kind: 'sealed-live',
          receipt: Object.freeze({ schemaVersion: 1, profile: 'race-test' }),
        });
      } catch (error) {
        failure = error;
      }
      expect(actualFs.lstatSync(victimPath).mode & 0o777).toBe(0o644);
      expect(failure).toBeUndefined();
      expect(race.armed).toBe(true);
    } finally {
      race.armed = false;
      race.displacedPath = '';
      race.target = '';
      race.victimPath = '';
      actualFs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('never follows a swapped receipt directory when applying private mode', () => {
    const root = actualFs.realpathSync(actualFs.mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-directory-race-'),
    ));
    const repositoryRoot = join(root, 'repository');
    const privateRoot = join(root, 'private');
    const receiptDirectory = join(privateRoot, 'receipts');
    const victimPath = join(root, 'victim-directory');
    actualFs.mkdirSync(repositoryRoot, { mode: 0o700 });
    actualFs.mkdirSync(privateRoot, { mode: 0o700 });
    actualFs.mkdirSync(victimPath, { mode: 0o755 });
    actualFs.chmodSync(victimPath, 0o755);
    race.victimPath = victimPath;
    race.displacedPath = join(root, 'displaced-receipts');
    race.target = 'directory';
    race.armed = true;
    try {
      let failure: unknown;
      try {
        writePrivatePtrProductionReceipt({
          directory: receiptDirectory,
          repositoryRoot,
          kind: 'sealed-live',
          receipt: Object.freeze({ schemaVersion: 1, profile: 'race-test' }),
        });
      } catch (error) {
        failure = error;
      }
      expect(actualFs.lstatSync(victimPath).mode & 0o777).toBe(0o755);
      expect(failure).toBeUndefined();
      expect(race.armed).toBe(true);
    } finally {
      race.armed = false;
      race.displacedPath = '';
      race.target = '';
      race.victimPath = '';
      actualFs.rmSync(root, { recursive: true, force: true });
    }
  });
});
