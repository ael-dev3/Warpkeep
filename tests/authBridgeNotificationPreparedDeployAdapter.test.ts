// @vitest-environment node

import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION,
  AuthBridgeNotificationPreparedDeployError,
  attestAuthBridgeNotificationPreparedDeployment,
  attestAuthBridgeNotificationPreparedVersion,
  authBridgeNotificationPreparedVersionContract,
  executeAuthBridgeNotificationPreparedDeployAdapter,
  prepareAndWriteAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
} from '../scripts/auth-bridge-config-attestation.mjs';
import {
  withAuthBridgeNotificationPreparedDeployJournal,
} from '../scripts/auth-bridge-notification-prepared-deploy-journal.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const SOURCE_DIGEST = 'd'.repeat(64);
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const NON_TARGET_VERSION_ID = '123e4567-e89b-42d3-a456-426614174001';
const NON_TARGET_DEPLOYMENT_ID = '123e4567-e89b-42d3-a456-426614174002';
const NOW = new Date('2026-08-12T12:00:00.000Z');
const CREATED_AT = '2026-08-12T11:58:00.000Z';
const OBSERVED_AT = '2026-08-12T11:59:00.000Z';
const ADMIN_TOKEN = 'owner-private-test-admin-token-value';
const temporaryDirectories: string[] = [];

type JournalPhase =
  | 'prepared'
  | 'remote-reconcile-started'
  | 'upload-invoked'
  | 'upload-adjudication-required'
  | 'uploaded'
  | 'release-uncertain'
  | 'release-invoked'
  | 'completed'
  | null;

const BEFORE_MODES = Object.freeze({
  bridgeSourceCommit: AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  publicAuthEnabled: true,
  accessExpectedFidRequired: false,
});

function contract() {
  return authBridgeNotificationPreparedVersionContract({
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceDigest: SOURCE_DIGEST,
    beforeModes: BEFORE_MODES,
  });
}

function version(value = contract()) {
  return {
    ...value,
    versionId: VERSION_ID,
    createdAt: CREATED_AT,
  };
}

function deployment() {
  return {
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    workerName: 'warpkeep-auth-bridge',
    route: { pattern: 'auth.warpkeep.com', customDomain: true },
    versionId: VERSION_ID,
    versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    sourceCommit: SOURCE_COMMIT,
    trafficPercentage: 100,
    observedAt: OBSERVED_AT,
  };
}

function nonTargetDeployment() {
  return { ...deployment(), versionId: NON_TARGET_VERSION_ID };
}

function harness({
  releaseError,
  inspectedVersion = version(),
  inspectedDeployments = [nonTargetDeployment(), deployment()],
  initialPhase = 'prepared',
  initialUploadMode = null,
}: {
  releaseError?: Error;
  inspectedVersion?: unknown;
  inspectedDeployments?: readonly unknown[];
  initialPhase?: JournalPhase;
  initialUploadMode?: 'version' | null;
} = {}) {
  const events: string[] = [];
  let inspectDeploymentCall = 0;
  let phase: JournalPhase = initialPhase;
  let uploadMode = initialUploadMode;
  let uploadAdjudicationReason:
    | 'invalid-upload-response'
    | 'definitive-provider-rejection'
    | null = null;
  let predecessorDeploymentId = initialPhase === 'prepared'
    ? null
    : NON_TARGET_DEPLOYMENT_ID;
  let predecessorVersionId = initialPhase === 'prepared'
    ? null
    : NON_TARGET_VERSION_ID;
  const journal = {
    inspect: vi.fn(() => ({
      phase,
      uploadMode,
      predecessorDeploymentId,
      predecessorVersionId,
      uploadAdjudicationReason,
    })),
    prepared: vi.fn(async () => {
      events.push('prepared');
      phase ??= 'prepared';
    }),
    remoteReconcileStarted: vi.fn(async (input: Readonly<Record<string, unknown>>) => {
      events.push('remote-reconcile-started');
      predecessorDeploymentId = input.predecessorDeploymentId as string;
      predecessorVersionId = input.predecessorVersionId as string;
      phase = 'remote-reconcile-started';
    }),
    uploadInvoked: vi.fn(async (input: Readonly<Record<string, unknown>>) => {
      events.push('upload-invoked');
      if (input.uploadMode !== 'version') {
        throw new Error('test harness requires an exact upload mode');
      }
      phase = 'upload-invoked';
      uploadMode = input.uploadMode;
    }),
    uploadAdjudicationRequired: vi.fn(async (
      input: Readonly<Record<string, unknown>>,
    ) => {
      events.push('upload-adjudication-required');
      if (
        phase !== 'upload-invoked'
        || ![
          'invalid-upload-response',
          'definitive-provider-rejection',
        ].includes(String(input.reason))
      ) throw new Error('test harness requires an exact adjudication reason');
      phase = 'upload-adjudication-required';
      uploadAdjudicationReason = input.reason as typeof uploadAdjudicationReason;
    }),
    uploaded: vi.fn(async () => {
      events.push('uploaded');
      if (phase === 'upload-adjudication-required') {
        throw new Error('test harness terminal upload adjudication cannot advance');
      }
      if (!['release-uncertain', 'release-invoked', 'completed'].includes(phase ?? '')) {
        phase = 'uploaded';
      }
    }),
    releaseUncertain: vi.fn(async () => {
      events.push('release-uncertain');
      if (phase !== 'release-invoked') phase = 'release-uncertain';
    }),
    releaseInvoked: vi.fn(async () => {
      events.push('release-invoked');
      phase = 'release-invoked';
    }),
    completed: vi.fn(async () => { events.push('completed'); phase = 'completed'; }),
  };
  return {
    events,
    journal,
    prepareUpload: vi.fn(async () => {
      events.push('prepare-upload');
      return {
        mode: 'version' as const,
        predecessorDeploymentId: NON_TARGET_DEPLOYMENT_ID,
        predecessorVersionId: NON_TARGET_VERSION_ID,
      };
    }),
    uploadVersion: vi.fn(async () => {
      events.push('upload');
      return { versionId: VERSION_ID };
    }),
    reconcileVersion: vi.fn(async (): Promise<readonly string[]> => {
      events.push('reconcile-version');
      return events.includes('upload') ? [VERSION_ID] : [];
    }),
    inspectVersion: vi.fn(async () => {
      events.push('inspect-version');
      return inspectedVersion;
    }),
    assertPredecessorStable: vi.fn(async (value: Readonly<{
      deploymentId: string;
      versionId: string;
    }>) => {
      events.push('assert-predecessor-stable');
      if (
        value.deploymentId !== NON_TARGET_DEPLOYMENT_ID
        || value.versionId !== NON_TARGET_VERSION_ID
      ) throw new Error('predecessor drift');
    }),
    releaseVersion: vi.fn(async () => {
      events.push('release');
      if (releaseError !== undefined) throw releaseError;
    }),
    inspectDeployment: vi.fn(async () => {
      events.push('inspect-deployment');
      const index = Math.min(
        inspectDeploymentCall,
        inspectedDeployments.length - 1,
      );
      inspectDeploymentCall += 1;
      return inspectedDeployments[index];
    }),
    assertCanStartWrite: vi.fn(async (phase: 'upload' | 'release') => {
      events.push(`permit-${phase}`);
      return true as const;
    }),
    clock: () => new Date(NOW),
  };
}

function temporaryJournalHome() {
  const home = realpathSync(mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-prepared-adapter-restart-',
  )));
  chmodSync(home, 0o700);
  temporaryDirectories.push(home);
  return home;
}

function durableJournalOptions(
  home: string,
  value: Readonly<Record<string, unknown>>,
  runAttempt: number,
) {
  return {
    contract: value,
    repositoryRoot: realpathSync(process.cwd()),
    reportedHome: home,
    runId: '1001',
    runAttempt,
    clock: () => new Date(NOW),
    processIdentity: 'test-process-start-identity',
  } as const;
}

function privateBody(prepared: boolean) {
  const primary = farcasterRpcEndpointFingerprint(
    DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  );
  const secondary = farcasterRpcEndpointFingerprint(
    DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  );
  return {
    profile: 'warpkeep-auth-v2',
    digest: (prepared ? 'e' : 'f').repeat(64),
    farcasterRpcEndpointFingerprints: [primary, secondary].sort(),
    farcasterRpcEndpointRoleFingerprints: {
      primary,
      secondary,
    },
    miniAppHubEndpointFingerprints: ['1'.repeat(64), '2'.repeat(64)],
    signingPublicKeyThumbprint: 'A'.repeat(43),
    quickAuthIssuer: 'https://auth.farcaster.xyz',
    quickAuthDomain: 'warpkeep.com',
    quickAuthBrowserOrigin: 'https://warpkeep.com',
    quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange',
    quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
    quickAuthMaxTokenBytes: 8 * 1_024,
    quickAuthMaxIssuerLifetimeSeconds: 60 * 60,
    accessRequestStatusPath: '/v2/access/status',
    accessRequestSubmitPath: '/v2/access/request',
    accessRequestResolverTokenTtlSeconds: 15,
    accessRequestResolverTimeoutMilliseconds: 5_000,
    accessRequestStatusProcedure: 'access_request_get_status_v1',
    accessRequestSubmitProcedure: 'access_request_submit_v1',
    approvalNotificationsEnabled: prepared,
    miniAppNotificationClientFids: [9_152],
    miniAppWebhookPath: '/v1/farcaster/miniapp/webhook',
    admissionNotificationPath: '/v1/admin/admission-notification',
    admissionNotificationRecoveryPath:
      '/v1/admin/admission-notification-recovery',
    admissionNotificationStatusPath: '/v1/admin/admission-notification-status',
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    qaObserverEnabled: false,
    qaObserverSpacetimeDbUri: null,
    qaObserverSpacetimeDbDatabase: null,
    qaObserverAudience: null,
    qaObserverKeyFingerprint: null,
    qaObserverKeyRegisteredAt: null,
    qaObserverKeyExpiresAt: null,
    qaObserverMaxRegistrationLifetimeMilliseconds:
      366 * 24 * 60 * 60 * 1_000,
  };
}

function publicBody() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-admission-notification-bridge-v1',
    bridgeSourceCommit: SOURCE_COMMIT,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    notificationClientCount: 1,
    notificationDeliveryContractDigest:
      AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
  };
}

function responseWithUrl(body: unknown, url: string, headers: HeadersInit) {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers,
  });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: false });
  return response;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('auth-bridge notification-prepared deploy adapter', () => {
  it('pins the exact Wrangler version, worker configuration, and preserved modes', () => {
    expect(contract()).toEqual({
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
      wranglerVersion: AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION,
      accountId: ACCOUNT_ID,
      zoneId: ZONE_ID,
      workerName: 'warpkeep-auth-bridge',
      entrypoint: 'src/index.ts',
      workersDev: false,
      route: { pattern: 'auth.warpkeep.com', customDomain: true },
      predecessorSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
      versionMessage: `Warpkeep notification preparation ${SOURCE_COMMIT}`,
      sourceCommit: SOURCE_COMMIT,
      sourceDigest: SOURCE_DIGEST,
      compatibilityDate: '2026-07-11',
      compatibilityFlags: ['nodejs_compat'],
      variables: expect.objectContaining({
        APPROVAL_NOTIFICATIONS_ENABLED: 'true',
        PUBLIC_AUTH_ENABLED: 'true',
        ACCESS_EXPECTED_FID_REQUIRED: 'false',
        WARPKEEP_BRIDGE_SOURCE_COMMIT: SOURCE_COMMIT,
      }),
      secretBindingNames: [
        'ADMIN_TOKEN_SECRET',
        'FARCASTER_RPC_URL',
        'FARCASTER_RPC_URL_SECONDARY',
        'NOTIFICATION_OPERATOR_SECRET',
        'PLAYER_CANARY_OWNER_FID',
        'SESSION_COOKIE_KEY',
        'SIGNING_KEY_JWK',
      ],
      durableObjectBindings: [
        { name: 'ADMISSION_NOTIFICATIONS', className: 'AdmissionNotification' },
        { name: 'AUTH_RATE_LIMITER', className: 'AuthRateLimiter' },
        { name: 'CHALLENGE_REPLAY_GUARD', className: 'ChallengeReplayGuard' },
        { name: 'QA_CHALLENGE_REPLAY_GUARD', className: 'QaChallengeReplayGuard' },
        { name: 'SESSION_FAMILIES', className: 'SessionFamily' },
      ],
      migrations: [
        { tag: 'v1', newSqliteClasses: ['ChallengeReplayGuard'] },
        { tag: 'v2', newSqliteClasses: ['AuthRateLimiter'] },
        { tag: 'v3', newSqliteClasses: ['SessionFamily'] },
        { tag: 'v4', newSqliteClasses: ['QaChallengeReplayGuard'] },
        { tag: 'v5', newSqliteClasses: ['AdmissionNotification'] },
      ],
    });
    const wrangler = readFileSync(
      join(process.cwd(), 'services/auth-bridge/wrangler.toml'),
      'utf8',
    );
    for (const literal of [
      'name = "warpkeep-auth-bridge"',
      'main = "src/index.ts"',
      'compatibility_date = "2026-07-11"',
      'compatibility_flags = ["nodejs_compat"]',
      'workers_dev = false',
      'pattern = "auth.warpkeep.com"',
      'custom_domain = true',
      'tag = "v1"\nnew_sqlite_classes = ["ChallengeReplayGuard"]',
      'tag = "v2"\nnew_sqlite_classes = ["AuthRateLimiter"]',
      'tag = "v3"\nnew_sqlite_classes = ["SessionFamily"]',
      'tag = "v4"\nnew_sqlite_classes = ["QaChallengeReplayGuard"]',
      'tag = "v5"\nnew_sqlite_classes = ["AdmissionNotification"]',
    ]) expect(wrangler).toContain(literal);
  });

  it('journals uncertainty before an adjacent final permit and one release', async () => {
    const values = harness();
    const result = await executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    });

    expect(values.events).toEqual([
      'prepared',
      'prepare-upload',
      'remote-reconcile-started',
      'reconcile-version',
      'permit-upload',
      'upload-invoked',
      'upload',
      'reconcile-version',
      'inspect-version',
      'uploaded',
      'inspect-deployment',
      'release-uncertain',
      'permit-release',
      'assert-predecessor-stable',
      'release-invoked',
      'release',
      'inspect-deployment',
      'completed',
    ]);
    expect(values.releaseVersion).toHaveBeenCalledOnce();
    expect(values.releaseVersion).toHaveBeenCalledWith({
      versionId: VERSION_ID,
      predecessorDeploymentId: NON_TARGET_DEPLOYMENT_ID,
      predecessorVersionId: NON_TARGET_VERSION_ID,
      percentage: 100,
      message: `Warpkeep notification preparation ${SOURCE_COMMIT}`,
    });
    expect(result).toMatchObject({ outcome: 'verified' });
  });

  it('reconciles an exact postflight after the release call reports an error', async () => {
    const values = harness({ releaseError: new Error('transport closed') });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).resolves.toMatchObject({ outcome: 'verified-after-release-error' });
    expect(values.journal.completed).toHaveBeenCalledOnce();
  });

  it('reconciles one deterministic version after an ambiguous upload outcome', async () => {
    const values = harness();
    values.uploadVersion.mockRejectedValueOnce(new Error('upload response lost'));
    values.reconcileVersion
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([VERSION_ID]);

    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).resolves.toMatchObject({ outcome: 'verified' });
    expect(values.uploadVersion).toHaveBeenCalledOnce();
    expect(values.reconcileVersion).toHaveBeenCalledTimes(2);
    expect(values.releaseVersion).toHaveBeenCalledOnce();

    const unresolved = harness();
    unresolved.uploadVersion.mockRejectedValueOnce(new Error('upload response lost'));
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...unresolved,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(unresolved.releaseVersion).not.toHaveBeenCalled();

    const rejected = harness();
    const rejection = Object.assign(new Error('redacted provider rejection'), {
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      deploymentMayHaveChanged: false,
    });
    const adjudication = Object.assign(new Error('settle window expired'), {
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    rejected.uploadVersion.mockRejectedValueOnce(rejection);
    rejected.reconcileVersion
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(adjudication);
    const surfacedRejection = await executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...rejected,
    }).catch(error => error as Error & { code?: string });
    expect(surfacedRejection).not.toBe(rejection);
    expect(surfacedRejection).toMatchObject({
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      message:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
    });
    expect(String(surfacedRejection)).not.toContain('redacted provider rejection');
    expect(rejected.releaseVersion).not.toHaveBeenCalled();

    const duplicate = harness();
    duplicate.reconcileVersion.mockResolvedValueOnce([VERSION_ID, VERSION_ID]);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...duplicate,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_RECONCILIATION_INVALID');
    expect(duplicate.uploadVersion).not.toHaveBeenCalled();

    const duplicateAfterUpload = harness();
    duplicateAfterUpload.reconcileVersion
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([VERSION_ID, NON_TARGET_VERSION_ID]);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...duplicateAfterUpload,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(duplicateAfterUpload.uploadVersion).toHaveBeenCalledOnce();
    expect(duplicateAfterUpload.releaseVersion).not.toHaveBeenCalled();
  });

  it('hard-stops a lineage-mismatched upload response before reconciliation', async () => {
    const values = harness();
    values.uploadVersion.mockRejectedValueOnce(Object.assign(
      new Error('upload response version number skipped the predecessor'),
      {
        code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH',
        deploymentMayHaveChanged: false,
      },
    ));
    values.reconcileVersion
      .mockResolvedValueOnce([])
      .mockResolvedValue([VERSION_ID]);

    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_RESPONSE_INVALID',
      deploymentMayHaveChanged: false,
    });
    expect(values.reconcileVersion).toHaveBeenCalledOnce();
    expect(values.inspectVersion).not.toHaveBeenCalled();
    expect(values.journal.uploaded).not.toHaveBeenCalled();
    expect(values.releaseVersion).not.toHaveBeenCalled();
  });

  it('hard-stops a definitive provider rejection before reconciliation', async () => {
    const values = harness();
    const rejection = Object.assign(new Error('redacted provider rejection'), {
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      deploymentMayHaveChanged: false,
    });
    values.uploadVersion.mockRejectedValueOnce(rejection);
    values.reconcileVersion
      .mockResolvedValueOnce([])
      .mockResolvedValue([VERSION_ID]);

    const surfaced = await executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    }).catch(error => error as Error & {
      code?: string;
      deploymentMayHaveChanged?: boolean;
    });
    expect(surfaced).not.toBe(rejection);
    expect(surfaced).toMatchObject({
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      deploymentMayHaveChanged: false,
    });
    expect(String(surfaced)).not.toContain('redacted provider rejection');
    expect(values.reconcileVersion).toHaveBeenCalledOnce();
    expect(values.inspectVersion).not.toHaveBeenCalled();
    expect(values.journal.uploaded).not.toHaveBeenCalled();
    expect(values.releaseVersion).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'an invalid upload-response lineage',
      uploadError: Object.assign(
        new Error('upload response version number skipped the predecessor'),
        {
          code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH',
          deploymentMayHaveChanged: false,
        },
      ),
      firstCode: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_RESPONSE_INVALID',
      reason: 'invalid-upload-response',
    },
    {
      name: 'a definitive sanitized provider rejection',
      uploadError: Object.assign(new Error('redacted provider rejection'), {
        code:
          'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
        deploymentMayHaveChanged: false,
      }),
      firstCode:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      reason: 'definitive-provider-rejection',
    },
  ] as const)(
    'durably refuses candidate adoption after $name and a fresh restart',
    async ({ uploadError, firstCode, reason }) => {
      const value = contract();
      const home = temporaryJournalHome();
      const values = harness();
      values.uploadVersion.mockRejectedValueOnce(uploadError);
      values.reconcileVersion
        .mockResolvedValueOnce([])
        .mockResolvedValue([VERSION_ID]);

      let firstState: unknown;
      await withAuthBridgeNotificationPreparedDeployJournal({
        ...durableJournalOptions(home, value, 1),
        operation: async journal => {
          const outcome = await executeAuthBridgeNotificationPreparedDeployAdapter({
            contract: value,
            ...values,
            journal,
          }).then(
            resolved => ({ kind: 'resolved' as const, resolved }),
            error => ({ kind: 'rejected' as const, error }),
          );
          expect(outcome).toMatchObject({
            kind: 'rejected',
            error: {
              code: firstCode,
              deploymentMayHaveChanged: false,
            },
          });
          firstState = journal.inspect();
        },
      });

      let restartEntryState: unknown;
      let restartExitState: unknown;
      let restartOutcome: unknown;
      await withAuthBridgeNotificationPreparedDeployJournal({
        ...durableJournalOptions(home, value, 2),
        operation: async journal => {
          restartEntryState = journal.inspect();
          restartOutcome = await executeAuthBridgeNotificationPreparedDeployAdapter({
            contract: value,
            ...values,
            journal,
          }).then(
            resolved => ({ kind: 'resolved' as const, resolved }),
            error => ({ kind: 'rejected' as const, error }),
          );
          restartExitState = journal.inspect();
        },
      });

      for (const state of [firstState, restartEntryState, restartExitState]) {
        expect.soft(state).toMatchObject({
          phase: 'upload-adjudication-required',
          uploadAdjudicationReason: reason,
        });
      }
      expect.soft(restartOutcome).toMatchObject({
        kind: 'rejected',
        error: {
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
          deploymentMayHaveChanged: true,
        },
      });
      expect.soft(values.prepareUpload).toHaveBeenCalledTimes(1);
      expect.soft(values.uploadVersion).toHaveBeenCalledTimes(1);
      expect.soft(values.reconcileVersion).toHaveBeenCalledOnce();
      expect.soft(values.inspectVersion).not.toHaveBeenCalled();
      expect.soft(values.inspectDeployment).not.toHaveBeenCalled();
      expect.soft(values.assertPredecessorStable).not.toHaveBeenCalled();
      expect.soft(values.releaseVersion).not.toHaveBeenCalled();
      expect.soft(values.assertCanStartWrite).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a matching candidate before an upload-invoked WAL marker exists', async () => {
    const values = harness();
    values.reconcileVersion.mockResolvedValueOnce([VERSION_ID]);

    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_DEPLOY_(?:UNINVOKED_CANDIDATE|VERSION_WITHOUT_UPLOAD_MARKER)$/u,
      ),
    });
    expect(values.journal.uploadInvoked).not.toHaveBeenCalled();
    expect(values.uploadVersion).not.toHaveBeenCalled();
    expect(values.inspectVersion).not.toHaveBeenCalled();
    expect(values.releaseVersion).not.toHaveBeenCalled();
  });

  it('retains typed ambiguity when both release and postflight fail', async () => {
    const values = harness({
      releaseError: new Error('transport closed'),
      inspectedDeployments: [
        nonTargetDeployment(),
        { ...deployment(), trafficPercentage: 50 },
      ],
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).rejects.toMatchObject({
      name: 'AuthBridgeNotificationPreparedDeployError',
      message: 'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(values.journal.completed).not.toHaveBeenCalled();

    const postflight = harness();
    postflight.inspectDeployment
      .mockResolvedValueOnce(nonTargetDeployment())
      .mockRejectedValueOnce(new Error('status unavailable'));
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...postflight,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });

    const completion = harness();
    completion.journal.completed.mockRejectedValueOnce(new Error('disk full'));
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...completion,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
  });

  it('rejects version drift before release and rejects noncanonical contracts before upload', async () => {
    const drift = harness({
      inspectedVersion: { ...version(), compatibilityDate: '2026-07-12' },
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...drift,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_MISMATCH',
    });
    expect(drift.releaseVersion).not.toHaveBeenCalled();

    const invalid = harness();
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: { ...contract(), workerName: 'another-worker' },
      ...invalid,
    })).rejects.toBeInstanceOf(AuthBridgeNotificationPreparedDeployError);
    expect(invalid.uploadVersion).not.toHaveBeenCalled();
    expect(invalid.journal.prepared).not.toHaveBeenCalled();
  });

  it('keeps upload and release adjacent to separate write permits', async () => {
    const beforeUpload = harness();
    beforeUpload.assertCanStartWrite.mockImplementation(async phase => {
      beforeUpload.events.push(`permit-${phase}`);
      if (phase === 'upload') throw new Error('stopped');
      return true as const;
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...beforeUpload,
    })).rejects.toThrow('stopped');
    expect(beforeUpload.uploadVersion).not.toHaveBeenCalled();

    const beforeRelease = harness();
    beforeRelease.assertCanStartWrite.mockImplementation(async phase => {
      beforeRelease.events.push(`permit-${phase}`);
      if (phase === 'release') throw new Error('stopped');
      return true as const;
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...beforeRelease,
    })).rejects.toThrow('stopped');
    expect(beforeRelease.journal.releaseUncertain).toHaveBeenCalledOnce();
    expect(beforeRelease.releaseVersion).not.toHaveBeenCalled();
    expect(beforeRelease.inspectDeployment).toHaveBeenCalledOnce();

    const asyncRejected = harness();
    asyncRejected.assertCanStartWrite.mockImplementation(async phase => {
      asyncRejected.events.push(`permit-${phase}`);
      if (phase === 'release') throw new Error('async stopped');
      return true as const;
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...asyncRejected,
    })).rejects.toThrow('async stopped');
    expect(asyncRejected.releaseVersion).not.toHaveBeenCalled();

    const falsePermit = harness();
    falsePermit.assertCanStartWrite.mockImplementation(async phase => {
      falsePermit.events.push(`permit-${phase}`);
      return false as never;
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...falsePermit,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
    expect(falsePermit.prepareUpload).toHaveBeenCalledOnce();
    expect(falsePermit.uploadVersion).not.toHaveBeenCalled();
  });

  it('completes an exact already-live version without a second release', async () => {
    const values = harness({ inspectedDeployments: [deployment()] });

    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).resolves.toMatchObject({ outcome: 'already-verified' });

    expect(values.inspectDeployment).toHaveBeenCalledOnce();
    expect(values.journal.completed).toHaveBeenCalledOnce();
    expect(values.journal.releaseUncertain).not.toHaveBeenCalled();
    expect(values.releaseVersion).not.toHaveBeenCalled();
  });

  it('refuses a fresh bare upload marker before any adapter dependency', async () => {
    const values = harness({
      initialPhase: 'upload-invoked',
      initialUploadMode: 'version',
    });
    values.reconcileVersion.mockResolvedValue([VERSION_ID]);

    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...values,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(values.prepareUpload).not.toHaveBeenCalled();
    expect(values.reconcileVersion).not.toHaveBeenCalled();
    expect(values.uploadVersion).not.toHaveBeenCalled();
    expect(values.inspectVersion).not.toHaveBeenCalled();
    expect(values.inspectDeployment).not.toHaveBeenCalled();
    expect(values.assertPredecessorStable).not.toHaveBeenCalled();
    expect(values.releaseVersion).not.toHaveBeenCalled();
    expect(values.assertCanStartWrite).not.toHaveBeenCalled();
    expect(values.journal.remoteReconcileStarted).not.toHaveBeenCalled();
    expect(values.journal.uploadInvoked).not.toHaveBeenCalled();
    expect(values.journal.uploaded).not.toHaveBeenCalled();
    expect(values.journal.releaseUncertain).not.toHaveBeenCalled();
    expect(values.journal.releaseInvoked).not.toHaveBeenCalled();
    expect(values.journal.completed).not.toHaveBeenCalled();
  });

  it('never repeats a marked upload or release without remote proof', async () => {
    const uploadRestart = harness({
      initialPhase: 'upload-invoked',
      initialUploadMode: 'version',
    });
    uploadRestart.reconcileVersion.mockResolvedValue([]);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...uploadRestart,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(uploadRestart.prepareUpload).not.toHaveBeenCalled();
    expect(uploadRestart.uploadVersion).not.toHaveBeenCalled();

    const releaseRestart = harness({
      initialPhase: 'release-invoked',
      initialUploadMode: 'version',
      inspectedDeployments: [nonTargetDeployment()],
    });
    releaseRestart.reconcileVersion.mockResolvedValue([VERSION_ID]);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...releaseRestart,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(releaseRestart.assertCanStartWrite).not.toHaveBeenCalledWith('release');
    expect(releaseRestart.releaseVersion).not.toHaveBeenCalled();

    const releaseConverged = harness({
      initialPhase: 'release-invoked',
      initialUploadMode: 'version',
      inspectedDeployments: [deployment()],
    });
    releaseConverged.reconcileVersion.mockResolvedValue([VERSION_ID]);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...releaseConverged,
    })).resolves.toMatchObject({ outcome: 'already-verified' });
    expect(releaseConverged.releaseVersion).not.toHaveBeenCalled();
  });

  it('preserves typed runtime adjudication errors for the operator', async () => {
    const uploadAttempt = harness();
    uploadAttempt.uploadVersion.mockRejectedValueOnce(
      new Error('upload response lost'),
    );
    const uploadAdjudication = Object.assign(new Error('settle window expired'), {
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    uploadAttempt.reconcileVersion
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(uploadAdjudication);
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...uploadAttempt,
    })).rejects.toBe(uploadAdjudication);
    expect(uploadAttempt.uploadVersion).toHaveBeenCalledOnce();
    expect(uploadAttempt.reconcileVersion).toHaveBeenCalledTimes(2);
  });

  it('retains typed ambiguity while reconciling an uploaded or already-live version', async () => {
    const inspection = harness();
    inspection.inspectDeployment.mockRejectedValueOnce(new Error('status unavailable'));
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...inspection,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_RECONCILIATION_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(inspection.releaseVersion).not.toHaveBeenCalled();

    const completion = harness({ inspectedDeployments: [deployment()] });
    completion.journal.completed.mockRejectedValueOnce(new Error('disk full'));
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...completion,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(completion.releaseVersion).not.toHaveBeenCalled();

    const infrastructureDrift = harness({
      inspectedDeployments: [{
        ...nonTargetDeployment(),
        route: { pattern: 'wrong.warpkeep.com', customDomain: true },
      }],
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: contract(),
      ...infrastructureDrift,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_RECONCILIATION_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(infrastructureDrift.releaseVersion).not.toHaveBeenCalled();
  });

  it('keeps the administrator token out of deploy and installs the authenticated receipt', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-deploy-adapter-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    let privateCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://auth.warpkeep.com/v1/admin/config-attestation') {
        privateCalls += 1;
        return responseWithUrl(
          privateBody(privateCalls > 1),
          url,
          {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
        return responseWithUrl(publicBody(), url, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy':
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          'permissions-policy':
            'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          'referrer-policy': 'no-referrer',
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-resource-policy': 'same-site',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'x-permitted-cross-domain-policies': 'none',
          date: NOW.toUTCString(),
        });
      }
      throw new Error('unexpected test URL');
    });
    const deploy = vi.fn(async (modes: unknown) => {
      expect(modes).toEqual(BEFORE_MODES);
      expect(JSON.stringify(modes)).not.toContain(ADMIN_TOKEN);
    });

    const result = await prepareAndWriteAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      expectedPredecessorBridgeSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      fetchImpl,
      clock: () => new Date(NOW),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      deploy,
    });

    expect(deploy).toHaveBeenCalledOnce();
    expect(result.result).toBe('installed');
    const receipt = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(receipt.bridgeSourceCommit).toBe(SOURCE_COMMIT);
    expect(receipt.preparedAt).toBe(NOW.toISOString());
  });

  it('surfaces only a fixed sanitized provider rejection code after deploy starts', async () => {
    const home = mkdtempSync(join(
      realpathSync(tmpdir()),
      'warpkeep-deploy-adapter-rejection-',
    ));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const rejection = Object.assign(new Error('private provider diagnostic'), {
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      deploymentMayHaveChanged: false,
    });
    const surfacedRejection = await prepareAndWriteAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      expectedPredecessorBridgeSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => responseWithUrl(
        privateBody(false),
        String(input),
        {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        },
      )),
      clock: () => new Date(NOW),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      deploy: async () => { throw rejection; },
    }).catch(error => error as Error & { code?: string });
    expect(surfacedRejection).not.toBe(rejection);
    expect(surfacedRejection).toMatchObject({
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      message:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
    });
    expect(String(surfacedRejection)).not.toContain('private provider diagnostic');
  });

  it('keeps direct attestation helpers fail-closed', () => {
    expect(attestAuthBridgeNotificationPreparedVersion({
      value: version(),
      contract: contract(),
    })).toEqual(version());
    expect(attestAuthBridgeNotificationPreparedDeployment({
      value: deployment(),
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: CREATED_AT,
      now: NOW,
    })).toEqual(deployment());
    expect(() => attestAuthBridgeNotificationPreparedDeployment({
      value: deployment(),
      contract: contract(),
      versionId: 'not-a-version',
      versionCreatedAt: CREATED_AT,
      now: NOW,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID');
    expect(() => attestAuthBridgeNotificationPreparedDeployment({
      value: { ...deployment(), observedAt: CREATED_AT },
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: CREATED_AT,
      now: new Date('2026-08-12T12:10:00.000Z'),
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_STALE');
    expect(() => attestAuthBridgeNotificationPreparedVersion({
      value: version(),
      contract: { ...contract(), sourceDigest: '0'.repeat(64) },
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_MISMATCH');
  });
});
