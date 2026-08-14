// @vitest-environment node

import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  deriveAuthBridgeNotificationPreparedDeployClosurePaths,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const repository = resolve(import.meta.dirname, '..');
const B0_CLOSURE_PATHS = [
  '.github/workflows/notification-bridge-b0.yml',
  'scripts/auth-bridge-notification-b0-cloudflare-runtime.d.mts',
  'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
  'scripts/auth-bridge-notification-b0-deploy-adapter.d.mts',
  'scripts/auth-bridge-notification-b0-deploy-adapter.mjs',
  'scripts/auth-bridge-notification-b0-deploy-journal.d.mts',
  'scripts/auth-bridge-notification-b0-deploy-journal.mjs',
  'scripts/auth-bridge-notification-b0-deploy.d.mts',
  'scripts/auth-bridge-notification-b0-deploy.mjs',
  'scripts/verify-auth-bridge-notification-b0-policy.d.mts',
  'scripts/verify-auth-bridge-notification-b0-policy.mjs',
] as const;

describe('notification bridge B0 security closure topology', () => {
  it('keeps the derived and builtins-only closure namespaces equal', () => {
    const derived = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: repository,
    });
    expect(derived).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    );
    expect(derived).toHaveLength(372);
  }, 30_000);

  it('includes every B0 effect, recovery, workflow, policy, and ABI path', () => {
    for (const path of B0_CLOSURE_PATHS) {
      expect(
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
      ).toContain(path);
    }
  });
});
