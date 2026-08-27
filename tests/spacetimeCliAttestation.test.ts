import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  attestPinnedSpacetimeCli,
  verifyPinnedCliAttestation,
} from '../scripts/spacetime-cli-attestation.mjs';

const VERSION = '2.6.1';
const COMMIT = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const PINNED_EXECUTABLES = Object.freeze({
  'darwin-arm64': Object.freeze({
    launcher: '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
    cli: '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
    standalone: '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa',
  }),
  'linux-x64': Object.freeze({
    launcher: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
    cli: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b',
    standalone: 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b',
  }),
});
const platformKey = `${process.platform}-${process.arch}` as keyof typeof PINNED_EXECUTABLES;
const pinnedExecutables = PINNED_EXECUTABLES[platformKey];
const roots: string[] = [];

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveCommand(command: string) {
  const candidates = isAbsolute(command) || command.includes('/')
    ? [resolve(command)]
    : (process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map(entry => join(entry, command));
  for (const candidate of candidates) {
    try {
      return realpathSync(candidate);
    } catch {
      // Continue until a candidate resolves.
    }
  }
  return undefined;
}

function findReviewedCli() {
  if (pinnedExecutables === undefined) return undefined;
  const executable = resolveCommand(process.env.SPACETIME_BIN ?? 'spacetime');
  if (executable === undefined) return undefined;
  try {
    const launcherDigest = sha256(executable);
    const reviewedCli = launcherDigest === pinnedExecutables.cli
      ? executable
      : resolve(
        dirname(executable),
        '..',
        'share',
        'spacetime',
        'bin',
        'current',
        'spacetimedb-cli',
      );
    const standalone = join(dirname(reviewedCli), 'spacetimedb-standalone');
    const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    verifyPinnedCliAttestation(version.stdout, launcherDigest);
    if (
      version.error
      || version.status !== 0
      || version.signal
      || sha256(reviewedCli) !== pinnedExecutables.cli
      || sha256(standalone) !== pinnedExecutables.standalone
    ) return undefined;
    return executable;
  } catch {
    return undefined;
  }
}

const reviewedCli = findReviewedCli();

async function attestedFixture() {
  if (reviewedCli === undefined) throw new Error('The reviewed CLI fixture was unavailable.');
  const testRoot = await mkdtemp(join(tmpdir(), 'warpkeep-cli-attestation-test-'));
  roots.push(testRoot);
  const snapshot = attestPinnedSpacetimeCli(reviewedCli);
  return { snapshot, testRoot };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe.skipIf(reviewedCli === undefined)(
  'pinned SpacetimeDB CLI snapshot re-attestation',
  () => {
    it('returns immutable exact provenance and verifies the intact snapshot', async () => {
      const { snapshot } = await attestedFixture();
      try {
        expect(snapshot.provenance).toEqual({
          version: VERSION,
          commit: COMMIT,
          cliExecutableSha256: pinnedExecutables?.cli,
          standaloneExecutableSha256: pinnedExecutables?.standalone,
        });
        expect(Object.isFrozen(snapshot.provenance)).toBe(true);
        expect(() => snapshot.verify()).not.toThrow();
        expect(() => {
          (snapshot.provenance as { version: string }).version = '2.6.2';
        }).toThrow(TypeError);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);

    it('rejects replacement of the CLI pathname even when bytes and mode match', async () => {
      const { snapshot, testRoot } = await attestedFixture();
      try {
        const originalPath = join(testRoot, 'original-cli-snapshot');
        await rename(snapshot.path, originalPath);
        await copyFile(originalPath, snapshot.path);
        await chmod(snapshot.path, 0o500);
        expect(() => snapshot.verify()).toThrow(/re-attestation/i);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);

    it('rejects content mutation of a snapshotted executable', async () => {
      const { snapshot } = await attestedFixture();
      try {
        const companionPath = join(snapshot.directory, 'spacetimedb-standalone');
        await chmod(companionPath, 0o700);
        await writeFile(companionPath, 'mutated-standalone');
        await chmod(companionPath, 0o500);
        expect(() => snapshot.verify()).toThrow(/re-attestation/i);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);

    it('rejects a new hard link to either snapshotted executable', async () => {
      const { snapshot, testRoot } = await attestedFixture();
      try {
        await link(
          join(snapshot.directory, 'spacetimedb-standalone'),
          join(testRoot, 'standalone-hard-link'),
        );
        expect(() => snapshot.verify()).toThrow(/re-attestation/i);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);

    it('rejects private-directory metadata and membership mutation', async () => {
      const { snapshot } = await attestedFixture();
      try {
        await chmod(snapshot.directory, 0o755);
        await writeFile(join(snapshot.directory, 'unreviewed-file'), 'unreviewed');
        expect(() => snapshot.verify()).toThrow(/re-attestation/i);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);

    it('rejects replacement of the private snapshot directory', async () => {
      const { snapshot, testRoot } = await attestedFixture();
      const originalDirectory = join(testRoot, 'original-snapshot-directory');
      try {
        await rename(snapshot.directory, originalDirectory);
        await mkdir(snapshot.directory, { mode: 0o700 });
        await copyFile(join(originalDirectory, 'spacetimedb-cli'), snapshot.path);
        await chmod(snapshot.path, 0o500);
        await copyFile(
          join(originalDirectory, 'spacetimedb-standalone'),
          join(snapshot.directory, 'spacetimedb-standalone'),
        );
        await chmod(join(snapshot.directory, 'spacetimedb-standalone'), 0o500);
        expect(() => snapshot.verify()).toThrow(/re-attestation/i);
      } finally {
        snapshot.cleanup();
      }
    }, 30_000);
  },
);
