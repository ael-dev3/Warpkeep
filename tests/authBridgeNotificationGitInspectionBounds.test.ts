// @vitest-environment node

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  attestAuthBridgeNotificationB0DeployCheckout,
} from '../scripts/auth-bridge-notification-b0-deploy.mjs';
import {
  attestAuthBridgeNotificationPreparedDeployCheckout,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';

const ORDINARY_GIT_OUTPUT_BYTES = 64 * 1024;
const TRACKED_LISTING_OUTPUT_BYTES = 256 * 1024;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
});

function repositoryWithTrackedFiles(fileCount: number) {
  const repository = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-git-inspection-bound-',
  ));
  temporaryDirectories.push(repository);
  const git = (arguments_: readonly string[]) => execFileSync(
    '/usr/bin/git',
    arguments_,
    {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  ).trim();
  git(['init', '--quiet', '--initial-branch=main']);
  git(['config', 'user.name', 'Warpkeep test']);
  git(['config', 'user.email', 'warpkeep-test@example.invalid']);
  for (let index = 0; index < fileCount; index += 1) {
    writeFileSync(
      join(
        repository,
        `tracked-${String(index).padStart(5, '0')}-${'x'.repeat(64)}.txt`,
      ),
      'x',
    );
  }
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'bounded tracked inventory']);
  git(['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep']);
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const trackedListingBytes = Buffer.byteLength(
    execFileSync('/usr/bin/git', ['ls-files', '-v'], {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    }),
    'utf8',
  );
  return Object.freeze({
    repositoryRoot: realpathSync(repository),
    sourceCommit,
    trackedListingBytes,
  });
}

describe('auth-bridge deployment Git inspection bounds', () => {
  it('accepts a valid tracked listing above the ordinary 64 KiB cap in both deployers', async () => {
    const fixture = repositoryWithTrackedFiles(1_400);
    expect(fixture.trackedListingBytes).toBeGreaterThan(
      ORDINARY_GIT_OUTPUT_BYTES,
    );
    expect(fixture.trackedListingBytes).toBeLessThanOrEqual(
      TRACKED_LISTING_OUTPUT_BYTES,
    );

    await expect(attestAuthBridgeNotificationB0DeployCheckout(fixture))
      .resolves.toBe(fixture.repositoryRoot);
    await expect(attestAuthBridgeNotificationPreparedDeployCheckout(fixture))
      .resolves.toBe(fixture.repositoryRoot);
  }, 60_000);

  it('rejects an otherwise valid tracked listing above 256 KiB in both deployers', async () => {
    const fixture = repositoryWithTrackedFiles(3_200);
    expect(fixture.trackedListingBytes).toBeGreaterThan(
      TRACKED_LISTING_OUTPUT_BYTES,
    );

    await expect(attestAuthBridgeNotificationB0DeployCheckout(fixture))
      .rejects.toMatchObject({
        code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_GIT_INSPECTION_FAILED',
      });
    await expect(attestAuthBridgeNotificationPreparedDeployCheckout(fixture))
      .rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED',
      });
  }, 60_000);
});
