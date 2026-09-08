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

const privateDirectories = vi.hoisted(() => ({
  descriptors: new Map<number, string>(),
  paths: new Set<string>(),
}));

const sourceBuild = vi.hoisted(() => ({
  ptr: vi.fn(() => {
    throw new Error('stop after independent PTR closure');
  }),
  workspace: vi.fn(() => {
    throw new Error('workspace closure selected');
  }),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const privateStatus = <T extends { mode: number | bigint }>(status: T): T => {
    Object.defineProperty(status, 'mode', {
      value: typeof status.mode === 'bigint' ? 0o40700n : 0o40700,
    });
    return status;
  };
  const chmod = (path: import('node:fs').PathLike, mode: import('node:fs').Mode) => {
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
  };
  return {
    ...actual,
    chmodSync: chmod,
    openSync(path: import('node:fs').PathLike, flags: string | number, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode);
      const candidate = String(path);
      if (basename(candidate).startsWith('warpkeep-ptr-module-')) {
        privateDirectories.descriptors.set(descriptor, candidate);
        privateDirectories.paths.add(candidate);
      }
      return descriptor;
    },
    closeSync(descriptor: number) {
      privateDirectories.descriptors.delete(descriptor);
      actual.closeSync(descriptor);
    },
    fchmodSync(descriptor: number, mode: number) {
      const path = privateDirectories.descriptors.get(descriptor);
      if (path === undefined) return actual.fchmodSync(descriptor, mode);
      if (process.platform !== 'win32') return actual.fchmodSync(descriptor, mode);
      // Windows does not implement descriptor chmod. Mode normalization in
      // this test double lets the publisher proceed without substituting an
      // unsafe pathname chmod for the production descriptor operation.
    },
    fstatSync(descriptor: number, options?: { bigint?: boolean }) {
      const status = actual.fstatSync(descriptor, options as never);
      return process.platform === 'win32' && privateDirectories.descriptors.has(descriptor)
        ? privateStatus(status)
        : status;
    },
    lstatSync(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      const status = actual.lstatSync(path, options as never);
      return process.platform === 'win32' && privateDirectories.paths.has(String(path))
        ? privateStatus(status)
        : status;
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
  withGreaterRealmLockedSourceBuild: sourceBuild.workspace,
}));

vi.mock('../scripts/ptr-binding-locked-source-build.ts', () => ({
  withPtrLockedSourceBuild: sourceBuild.ptr,
}));

vi.mock('../scripts/ptr-binding-linux-locked-source-build.ts', () => ({
  withPtrLinuxLockedSourceBuild: sourceBuild.ptr,
}));

import {
  preparePtrSourceBuiltArtifact,
} from '../scripts/ptr-production-publisher.mjs';

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

describe.skipIf(!((process.platform === 'linux' && process.arch === 'x64')
  || (process.platform === 'darwin' && process.arch === 'arm64')))('PTR publisher private directory races', () => {
  it('prepares PTR source builds through the independent PTR closure', () => {
    expect(() => preparePtrSourceBuiltArtifact({
      sourceCommit: 'a'.repeat(40),
      reattestSource: () => 'a'.repeat(40),
      dependencyCacheRoot: '/private/dependency-cache',
      environment: { PATH: '/usr/bin:/bin' },
    })).toThrow('stop after independent PTR closure');
    expect(sourceBuild.ptr).toHaveBeenCalledOnce();
    expect(sourceBuild.workspace).not.toHaveBeenCalled();
  });

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
