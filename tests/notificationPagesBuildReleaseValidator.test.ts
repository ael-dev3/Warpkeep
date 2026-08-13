// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  validateNotificationPagesBuildRelease,
} from '../scripts/notification-pages-build-release-validator.mjs';
import {
  GREATER_REALM_NOTIFICATION_RELEASE_PHASE,
} from '../scripts/verify-greater-realm-release-gates.mjs';

const SOURCE = 'a'.repeat(40);
const PREPARED_DIGEST = 'b'.repeat(64);
const BRIDGE_SOURCE = 'c'.repeat(40);
const ROOT_DIGEST = 'd'.repeat(64);
const ROOT_SOURCE = 'e'.repeat(40);

function environment(presentation: 'true' | 'false') {
  return {
    DEPLOY_BASE: '/',
    VITE_WARPKEEP_RELEASE_CHANNEL: 'alpha',
    VITE_WARPKEEP_BUILD_SHA: SOURCE,
    VITE_WARPKEEP_REPOSITORY_URL: 'https://github.com/ael-dev3/Warpkeep',
    VITE_WARPKEEP_CANONICAL_ORIGIN: 'https://warpkeep.com',
    VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
    VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: presentation,
    VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
    VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIMEDB_DATABASE:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    // These mutable decoys must never select build authority.
    WARPKEEP_NOTIFICATION_RELEASE_PHASE: 'attacker-selected',
    WARPKEEP_NOTIFICATION_PREPARED_RECEIPT_DIGEST: 'f'.repeat(64),
  };
}

function checkedValidation() {
  return 'checked source authority accepted';
}

describe('notification Pages build release validator', () => {
  it('accepts staged presentation using only the static checked-in inspector', async () => {
    const inspectGateState = vi.fn(async () => ({
      phase:
        GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
      notificationReleaseAuthority: {
        phase:
          GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
        notificationPreparedReceiptDigest: PREPARED_DIGEST,
        notificationPreparedBridgeSourceCommit: BRIDGE_SOURCE,
        notificationPagesLiveRootReceiptDigest: null,
        notificationPagesLiveRootPagesSourceCommit: null,
      },
    }));
    await expect(validateNotificationPagesBuildRelease(environment('true'), {
      classifyLane: () => ({ mode: 'gen0' }),
      inspectGateState,
      validateConfiguration: checkedValidation,
    })).resolves.toMatchObject({
      mode: 'gen0',
      phase:
        GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
    });
    expect(inspectGateState).toHaveBeenCalledWith({
      notificationAuthorityMode: 'static',
    });
  });

  it.each([
    GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT,
    GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
  ])('accepts durable source phase %s without a prepared authority', async phase => {
    const validateConfiguration = vi.fn(checkedValidation);
    await expect(validateNotificationPagesBuildRelease(environment('true'), {
      classifyLane: () => ({ mode: 'durable' }),
      inspectGateState: async () => ({
        phase,
        notificationReleaseAuthority: {
          phase,
          notificationPreparedReceiptDigest: null,
          notificationPreparedBridgeSourceCommit: null,
          notificationPagesLiveRootReceiptDigest: ROOT_DIGEST,
          notificationPagesLiveRootPagesSourceCommit: ROOT_SOURCE,
        },
      }),
      validateConfiguration,
    })).resolves.toMatchObject({ mode: 'durable', phase });
    expect(validateConfiguration).toHaveBeenCalledTimes(1);
  });

  it('rejects lane, presentation, or phase disagreement before validation', async () => {
    const validateConfiguration = vi.fn(checkedValidation);
    await expect(validateNotificationPagesBuildRelease(environment('false'), {
      classifyLane: () => ({ mode: 'gen0' }),
      inspectGateState: async () => ({
        phase:
          GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
        notificationReleaseAuthority: {},
      }),
      validateConfiguration,
    })).rejects.toThrow('NOTIFICATION_PAGES_BUILD_RELEASE_PRESENTATION_MISMATCH');
    await expect(validateNotificationPagesBuildRelease(environment('true'), {
      classifyLane: () => ({ mode: 'gen0' }),
      inspectGateState: async () => ({
        phase: GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
        notificationReleaseAuthority: {},
      }),
      validateConfiguration,
    })).rejects.toThrow('NOTIFICATION_PAGES_BUILD_RELEASE_PHASE_MISMATCH');
    expect(validateConfiguration).not.toHaveBeenCalled();
  });
});
