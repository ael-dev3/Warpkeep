// @vitest-environment node

import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const race = vi.hoisted(() => ({
  armed: false,
  displacedPath: '',
  originalPath: '',
  victimPath: '',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    chmodSync(path: import('node:fs').PathLike, mode: import('node:fs').Mode) {
      const candidate = String(path);
      if (
        race.armed
        && basename(candidate).startsWith('warpkeep-ptr-module-')
      ) {
        race.armed = false;
        race.originalPath = candidate;
        race.displacedPath = `${candidate}.displaced`;
        actual.renameSync(candidate, race.displacedPath);
        actual.symlinkSync(race.victimPath, candidate);
        actual.chmodSync(candidate, mode);
        throw new Error('simulated pathname swap');
      }
      actual.chmodSync(path, mode);
    },
  };
});

vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({
  attestPinnedSpacetimeCli: () => Object.freeze({
    path: '/private/pinned-spacetime',
    digest: 'e'.repeat(64),
    cleanup: vi.fn(),
  }),
}));

vi.mock('../scripts/greater-realm-production-immutable-artifact.ts', () => ({
  withGreaterRealmLockedSourceBuild: () => {
    throw new Error('stop after directory hardening');
  },
}));

import {
  preparePtrSourceBuiltArtifact,
} from '../scripts/ptr-production-publisher.mjs';

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

describe('PTR publisher private directory races', () => {
  it('never follows a swapped artifact directory when applying private mode', () => {
    const root = actualFs.realpathSync(actualFs.mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-publisher-race-'),
    ));
    const victimPath = join(root, 'victim-directory');
    actualFs.mkdirSync(victimPath, { mode: 0o755 });
    actualFs.chmodSync(victimPath, 0o755);
    race.victimPath = victimPath;
    race.armed = true;
    try {
      expect(() => preparePtrSourceBuiltArtifact({
        sourceCommit: 'a'.repeat(40),
        reattestSource: () => 'a'.repeat(40),
        dependencyCacheRoot: '/private/dependency-cache',
        environment: { PATH: '/usr/bin:/bin' },
      })).toThrow();
      expect(actualFs.lstatSync(victimPath).mode & 0o777).toBe(0o755);
      expect(race.armed).toBe(true);
    } finally {
      race.armed = false;
      for (const path of [race.originalPath, race.displacedPath]) {
        if (path !== '') actualFs.rmSync(path, { recursive: true, force: true });
      }
      race.displacedPath = '';
      race.originalPath = '';
      race.victimPath = '';
      actualFs.rmSync(root, { recursive: true, force: true });
    }
  });
});
