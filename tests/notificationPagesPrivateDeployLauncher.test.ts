// @vitest-environment node

import {
  chmodSync,
  closeSync,
  mkdtempSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  NotificationPagesPrivateDeployLauncherError,
  runNotificationPagesPrivateDeployLauncher,
} from '../scripts/notification-pages-private-deploy-launcher.mjs';

const SOURCE = 'a'.repeat(40);
const MANIFEST = 'b'.repeat(64);
const RUNNER = 'c'.repeat(64);

function outputDescriptor(): { close: () => void; descriptor: number } {
  const directory = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-pages-launcher-',
  ));
  chmodSync(directory, 0o700);
  const descriptor = openSync(join(directory, 'output'), 'a', 0o600);
  return { close: () => closeSync(descriptor), descriptor };
}

function environment(
  descriptor: number,
  includeRunner = true,
): NodeJS.ProcessEnv {
  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_OUTPUT_FD: String(descriptor),
    GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '41',
    GITHUB_WORKFLOW_REF:
      'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    RUNNER_ARCH: 'ARM64',
    RUNNER_OS: 'macOS',
    WARPKEEP_PAGES_SOURCE_COMMIT: SOURCE,
    WARPKEEP_PRIVATE_NODE: realpathSync(process.execPath),
    ...(includeRunner
      ? { WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST: RUNNER }
      : {}),
  };
}

function authorities(order: string[]) {
  const attestSourceClosure = vi.fn(() => {
    order.push('source');
    return Object.freeze({ manifestSha256: MANIFEST });
  });
  const attestToolchain = vi.fn(() => {
    order.push('toolchain');
    return Object.freeze({
      runnerIdentityDigest: RUNNER,
      sourceClosureManifestSha256: MANIFEST,
    });
  });
  const cli = vi.fn(async () => undefined);
  const loadOperator = vi.fn(async () => {
    order.push('load');
    return { runNotificationPagesPrivateDeployOperatorCli: cli };
  });
  return { attestSourceClosure, attestToolchain, cli, loadOperator };
}

describe('notification Pages private deploy launcher', () => {
  it('attests source, toolchain, and source again before loading the operator', async () => {
    const output = outputDescriptor();
    try {
      const order: string[] = [];
      const mocked = authorities(order);
      await runNotificationPagesPrivateDeployLauncher(
        ['predeploy'],
        environment(output.descriptor),
        mocked,
      );
      expect(order).toEqual(['source', 'toolchain', 'source', 'load']);
      expect(mocked.cli).toHaveBeenCalledTimes(1);
      expect(mocked.cli.mock.calls[0]?.[2]).toMatchObject({
        runnerIdentityDigest: RUNNER,
        sourceClosureManifestSha256: MANIFEST,
      });
    } finally {
      output.close();
    }
  });

  it('never loads dependency-bearing code when either attestation fails', async () => {
    const output = outputDescriptor();
    try {
      const order: string[] = [];
      const mocked = authorities(order);
      mocked.attestToolchain.mockImplementationOnce(() => {
        order.push('toolchain-failed');
        throw new Error('HOSTILE_TOOLCHAIN');
      });
      await expect(runNotificationPagesPrivateDeployLauncher(
        ['predeploy'],
        environment(output.descriptor),
        mocked,
      )).rejects.toMatchObject({
        code: 'NOTIFICATION_PAGES_DEPLOY_LAUNCHER_TOOLCHAIN_INVALID',
      });
      expect(mocked.loadOperator).not.toHaveBeenCalled();

      const changed = authorities([]);
      changed.attestSourceClosure
        .mockReturnValueOnce(Object.freeze({ manifestSha256: MANIFEST }))
        .mockReturnValueOnce(Object.freeze({ manifestSha256: 'd'.repeat(64) }));
      await expect(runNotificationPagesPrivateDeployLauncher(
        ['predeploy'],
        environment(output.descriptor),
        changed,
      )).rejects.toMatchObject({
        code: 'NOTIFICATION_PAGES_DEPLOY_LAUNCHER_AUTHORITY_INVALID',
      });
      expect(changed.loadOperator).not.toHaveBeenCalled();
    } finally {
      output.close();
    }
  });

  it('rejects another runner and dangerous ambient runtime overrides', async () => {
    const output = outputDescriptor();
    try {
      const mismatch = authorities([]);
      const anotherRunner = environment(output.descriptor);
      anotherRunner.WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST = 'd'.repeat(64);
      await expect(runNotificationPagesPrivateDeployLauncher(
        ['predeploy'],
        anotherRunner,
        mismatch,
      )).rejects.toMatchObject({
        code: 'NOTIFICATION_PAGES_DEPLOY_LAUNCHER_RUNNER_IDENTITY_MISMATCH',
      });
      expect(mismatch.loadOperator).not.toHaveBeenCalled();

      const hostile = environment(output.descriptor);
      hostile.NODE_OPTIONS = '--import=/tmp/hostile.mjs';
      await expect(runNotificationPagesPrivateDeployLauncher(
        ['predeploy'],
        hostile,
        authorities([]),
      )).rejects.toBeInstanceOf(NotificationPagesPrivateDeployLauncherError);
    } finally {
      output.close();
    }
  });

  it('attests without loading the operator in the low-privilege toolchain job', async () => {
    const output = outputDescriptor();
    try {
      const order: string[] = [];
      const mocked = authorities(order);
      await runNotificationPagesPrivateDeployLauncher(
        ['attest-toolchain'],
        environment(output.descriptor, false),
        mocked,
      );
      expect(order).toEqual(['source', 'toolchain', 'source']);
      expect(mocked.loadOperator).not.toHaveBeenCalled();
    } finally {
      output.close();
    }
  });
});
