// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  authBridgeNotificationB0DeployTestSeams,
} from '../scripts/auth-bridge-notification-b0-deploy.mjs';
import {
  authBridgeNotificationPreparedDeployTestSeams,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';

const validEnvironment = Object.freeze({
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_RUN_ID: '1001',
  GITHUB_SHA: 'c'.repeat(40),
  GITHUB_TOKEN: 'github-owner-test-token-value',
  GITHUB_WORKFLOW_REF:
    'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
  WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
  WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
    'cloudflare-owner-test-token-value',
  WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
  WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
});

async function expectGitInspectionsToDrain(
  settleGitInspections: (
    inspections: readonly Promise<string>[],
  ) => Promise<readonly string[]>,
  expectedCode: string,
) {
  let releaseDelayedInspection!: () => void;
  const delayedInspection = new Promise<string>(resolve => {
    releaseDelayedInspection = () => resolve('delayed');
  });
  const outcome = settleGitInspections([
    Promise.reject(new Error('bounded inspection rejected')),
    delayedInspection,
  ]).then(
    value => ({ status: 'fulfilled' as const, value }),
    error => ({ status: 'rejected' as const, error }),
  );

  const earlyStatus = await Promise.race([
    outcome.then(() => 'settled' as const),
    new Promise<'pending'>(resolve => {
      setTimeout(() => resolve('pending'), 20);
    }),
  ]);
  releaseDelayedInspection();
  const result = await outcome;

  expect(earlyStatus).toBe('pending');
  expect(result).toMatchObject({
    status: 'rejected',
    error: { code: expectedCode },
  });
}

describe('auth-bridge deployment Git inspection lifecycle', () => {
  it('drains every B0 inspection after one child rejects', async () => {
    await expectGitInspectionsToDrain(
      authBridgeNotificationB0DeployTestSeams.settleGitInspections,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_GIT_INSPECTION_FAILED',
    );
  });

  it('drains every prepared inspection after one child rejects', async () => {
    await expectGitInspectionsToDrain(
      authBridgeNotificationPreparedDeployTestSeams.settleGitInspections,
      'AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED',
    );
  });
});

describe('auth-bridge deployment ambient environment boundary', () => {
  for (const name of ['BASH_ENV', 'HTTP_PROXY']) {
    it(`rejects ${name} in both direct protected entrypoints`, () => {
      expect(() => authBridgeNotificationB0DeployTestSeams
        .copyAndScrubEnvironment({
          ...validEnvironment,
          [name]: 'hostile-ambient-value',
        }))
        .toThrow(/AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_ENVIRONMENT_FORBIDDEN/u);
      expect(() => authBridgeNotificationPreparedDeployTestSeams
        .copyAndScrubEnvironment({
          ...validEnvironment,
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-prepared.yml@refs/heads/main',
          WARPKEEP_PLAYER_CANARY_OWNER_FID: '9152',
          [name]: 'hostile-ambient-value',
        }))
        .toThrow(/AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_FORBIDDEN/u);
    });
  }
});
