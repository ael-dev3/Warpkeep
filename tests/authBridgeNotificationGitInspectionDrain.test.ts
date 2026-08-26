// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  authBridgeNotificationB0DeployTestSeams,
} from '../scripts/auth-bridge-notification-b0-deploy.mjs';
import {
  authBridgeNotificationPreparedDeployTestSeams,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';

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
