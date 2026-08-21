// @vitest-environment node

import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
  authBridgeNotificationB0VersionContract,
  executeAuthBridgeNotificationB0DeployAdapter,
  prepareAndWriteAuthBridgeNotificationB0Receipt,
} from '../scripts/auth-bridge-notification-b0-deploy-adapter.mjs';
import {
  withAuthBridgeNotificationB0DeployJournal,
} from '../scripts/auth-bridge-notification-b0-deploy-journal.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
} from '../scripts/auth-bridge-config-attestation.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const SOURCE_DIGEST = 'd'.repeat(64);
const PREDECESSOR_DEPLOYMENT_ID =
  '123e4567-e89b-42d3-a456-426614174001';
const PREDECESSOR_VERSION_ID =
  '123e4567-e89b-42d3-a456-426614174002';
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174003';
const VERSION_CREATED_AT = '2026-08-13T11:58:00.000Z';
const ADMIN_TOKEN = 'owner-private-test-admin-token-value';
const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function privateBody(prepared: boolean) {
  const primary = farcasterRpcEndpointFingerprint(
    DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  );
  const secondary = farcasterRpcEndpointFingerprint(
    DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  );
  return {
    profile: 'warpkeep-auth-v2',
    digest: (prepared ? 'e' : 'd').repeat(64),
    farcasterRpcEndpointFingerprints: [primary, secondary].sort(),
    farcasterRpcEndpointRoleFingerprints: { primary, secondary },
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
    ...(prepared ? {
      admissionNotificationRecoveryPath:
        '/v1/admin/admission-notification-recovery',
    } : {}),
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

function responseWithUrl(
  body: unknown,
  url: string,
  headers: HeadersInit,
) {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers,
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function testHarness() {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-receipt-'));
  chmodSync(home, 0o700);
  temporaryDirectories.push(home);
  const repositoryRoot = realpathSync(process.cwd());
  let now = new Date('2026-08-13T12:00:00.000Z');
  let candidateExists = false;
  let liveVersion = PREDECESSOR_VERSION_ID;
  let runAttempt = 0;
  const mutations: string[] = [];
  const value = authBridgeNotificationB0VersionContract({
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceDigest: SOURCE_DIGEST,
    beforeModes: {
      bridgeSourceCommit: SOURCE_COMMIT,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    },
  });
  const deployment = (versionId: string) => ({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    workerName: 'warpkeep-auth-bridge',
    route: { pattern: 'auth.warpkeep.com', customDomain: true },
    versionId,
    versionTag: `notification-b0-${SOURCE_COMMIT}`,
    sourceCommit: SOURCE_COMMIT,
    trafficPercentage: 100,
    observedAt: now.toISOString(),
  });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://auth.warpkeep.com/v1/admin/config-attestation') {
      return responseWithUrl(privateBody(liveVersion === VERSION_ID), url, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
    }
    if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
      return responseWithUrl({
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
      }, url, {
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
        date: now.toUTCString(),
      });
    }
    throw new Error(`unexpected receipt URL ${url}`);
  });
  const withJournal = <T>(operation: (journal: any) => T | Promise<T>) => {
    runAttempt += 1;
    return withAuthBridgeNotificationB0DeployJournal({
      contract: value,
      repositoryRoot,
      reportedHome: home,
      runId: String(4_000 + runAttempt),
      runAttempt,
      clock: () => new Date(now),
      processIdentity: 'test-process-start-identity',
      operation,
    });
  };
  const invoke = (hooks: Readonly<Record<string, unknown>> = {}) =>
    prepareAndWriteAuthBridgeNotificationB0Receipt({
      adminToken: ADMIN_TOKEN,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: fetchImpl as typeof fetch,
      clock: () => new Date(now),
      repositoryRoot,
      reportedHome: home,
      withPublicationJournal: withJournal,
      deploy: async () => withJournal(async journal => {
        await executeAuthBridgeNotificationB0DeployAdapter({
          contract: value,
          prepareUpload: async () => ({
            mode: 'version' as const,
            predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
            predecessorVersionId: PREDECESSOR_VERSION_ID,
          }),
          reconcileVersion: async () => candidateExists ? [VERSION_ID] : [],
          uploadVersion: async () => {
            mutations.push('versions-post');
            candidateExists = true;
            return { versionId: VERSION_ID };
          },
          inspectVersion: async () => ({
            ...value,
            versionId: VERSION_ID,
            createdAt: VERSION_CREATED_AT,
          }),
          inspectDeployment: async () => deployment(liveVersion),
          assertPredecessorStable: async () => undefined,
          releaseVersion: async () => {
            mutations.push('deployments-post');
            liveVersion = VERSION_ID;
          },
          assertCanStartWrite: async () => true as const,
          journal,
          clock: () => new Date(now),
        });
      }),
      ...hooks,
    });
  return {
    home,
    mutations,
    invoke,
    advance() { now = new Date(now.getTime() + 60_000); },
    inspect: () => withJournal(journal => journal.inspect()),
    receipts: () => {
      const directory = join(
        home,
        '.warpkeep/private/production-admin-v1/bridge-prepared-receipts-v1',
      );
      if (!existsSync(directory)) return [];
      return readdirSync(directory).filter(name =>
        /^auth-bridge-notification-prepared-[a-f0-9]{64}\.json$/u.test(name));
    },
  };
}

describe('auth-bridge notification B0 receipt recovery', () => {
  it('reopens a real completed WAL with an advancing observation clock', async () => {
    const harness = testHarness();
    await expect(harness.invoke({
      testOnlyAfterDeployCompleted: () => {
        throw new Error('crash immediately after durable completed');
      },
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PREPARATION_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(await harness.inspect()).toMatchObject({
      phase: 'completed',
      completedDeployment: {
        versionId: VERSION_ID,
        observedAt: '2026-08-13T12:00:00.000Z',
      },
      receiptPublicationIntent: null,
    });
    expect(harness.receipts()).toEqual([]);
    harness.advance();
    const recovered = await harness.invoke();
    expect(recovered.result).toBe('installed');
    expect(harness.mutations).toEqual(['versions-post', 'deployments-post']);
    expect(JSON.parse(readFileSync(recovered.path, 'utf8')).preparedAt)
      .toBe('2026-08-13T12:01:00.000Z');
    expect(harness.receipts()).toHaveLength(1);
  });

  it('reuses the WAL-bound receipt after completed-to-publication process loss', async () => {
    const harness = testHarness();
    await expect(harness.invoke({
      testOnlyAfterReceiptPublicationIntent: () => {
        throw new Error('crash after durable receipt intent');
      },
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PUBLICATION_FAILED',
      deploymentMayHaveChanged: true,
    });
    const intent = await harness.inspect();
    expect(intent.phase).toBe('receipt-publication-intent');
    expect(harness.receipts()).toEqual([]);
    harness.advance();
    const recovered = await harness.invoke();
    expect(recovered.result).toBe('installed');
    expect(harness.mutations).toEqual(['versions-post', 'deployments-post']);
    expect(harness.receipts()).toEqual([
      `auth-bridge-notification-prepared-${recovered.receiptDigest}.json`,
    ]);
    expect(JSON.parse(readFileSync(recovered.path, 'utf8')).preparedAt)
      .toBe('2026-08-13T12:00:00.000Z');
    expect(await harness.inspect()).toMatchObject({
      phase: 'receipt-published',
      publishedReceipt: { receiptDigest: recovered.receiptDigest },
    });
  });

  it('reconciles the same hard-linked receipt after publication-to-return loss', async () => {
    const harness = testHarness();
    let installedDigest = '';
    let installedPath = '';
    await expect(harness.invoke({
      testOnlyAfterReceiptWrite: (result: {
        path: string;
        receiptDigest: string;
      }) => {
        installedDigest = result.receiptDigest;
        installedPath = result.path;
        throw new Error('crash after receipt hard link');
      },
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PUBLICATION_FAILED',
      deploymentMayHaveChanged: true,
    });
    expect(harness.receipts()).toEqual([
      `auth-bridge-notification-prepared-${installedDigest}.json`,
    ]);
    const crashTemporary = join(
      dirname(installedPath),
      `.auth-bridge-notification-prepared-${installedDigest}-${'a'.repeat(24)}.json.tmp`,
    );
    linkSync(installedPath, crashTemporary);
    expect(lstatSync(installedPath).nlink).toBe(2);
    expect((await harness.inspect()).phase).toBe('receipt-publication-intent');
    harness.advance();
    const recovered = await harness.invoke();
    expect(recovered).toMatchObject({
      receiptDigest: installedDigest,
      result: 'unchanged',
    });
    expect(harness.mutations).toEqual(['versions-post', 'deployments-post']);
    expect(harness.receipts()).toHaveLength(1);
    expect(existsSync(crashTemporary)).toBe(false);
    expect(lstatSync(installedPath).nlink).toBe(1);
    expect(await harness.inspect()).toMatchObject({
      phase: 'receipt-published',
      publishedReceipt: { receiptDigest: installedDigest },
    });
  });
});
