import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { validatePagesDeploymentConfiguration } from '../scripts/validate-pages-deploy-config.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  fetchFreshAuthBridgeReleaseAttestation,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING,
} from '../scripts/auth-bridge-notification-prepared-release-binding.mjs';
import {
  verifyGreaterRealmReleaseGateEnvelope,
  verifyGreaterRealmReleaseGateState,
} from '../scripts/verify-greater-realm-release-gates.mjs';

const FULL_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const NOW = new Date('2026-08-12T12:00:00.000Z');
const PREPARED_RECEIPT_DIGEST = 'b'.repeat(64);
const PREPARED_BRIDGE_SOURCE_COMMIT = 'c'.repeat(40);
const RELEASE_HEADERS = Object.freeze({
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

function releaseAttestation(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-admission-notification-bridge-v1' as const,
    bridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
    notificationDeliveryEnabled: true as const,
    notificationTransportConfigured: true as const,
    admissionNotificationStoreConfigured: true as const,
    notificationClientCount: 1 as const,
    notificationDeliveryContractDigest:
      AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    ...overrides,
  };
}

function releaseResponse({
  body = releaseAttestation(),
  headers = {},
}: {
  body?: Record<string, unknown>;
  headers?: HeadersInit;
} = {}): Response {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...RELEASE_HEADERS, ...headers },
  });
  Object.defineProperty(response, 'url', {
    value: AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  });
  return response;
}

function preparedGateDependencies() {
  return {
    inspectPreparedReceiptByDigest: vi.fn(async ({
      receiptDigest,
      fetchImpl,
      now,
    }: {
      receiptDigest: string;
      fetchImpl?: typeof fetch;
      now?: Date;
    }) => {
      const live = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
      return {
        receiptDigest,
        receipt: { bridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT },
        liveAttestation: live.attestation,
      };
    }),
    assertBridgeSourceAncestor: vi.fn(),
  };
}

function deploymentEnvironment(overrides: Record<string, string> = {}) {
  return {
    ...process.env,
    DEPLOY_BASE: '/',
    VITE_WARPKEEP_RELEASE_CHANNEL: 'alpha',
    VITE_WARPKEEP_BUILD_SHA: FULL_SHA,
    VITE_WARPKEEP_REPOSITORY_URL: 'https://github.com/ael-dev3/Warpkeep',
    VITE_WARPKEEP_CANONICAL_ORIGIN: 'https://warpkeep.com',
    VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'false',
    VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false',
    VITE_WARPKEEP_AUTH_BRIDGE_URL: '',
    VITE_WARPKEEP_OIDC_ISSUER: '',
    VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    ...overrides
  };
}

function validateCli(overrides?: Record<string, string>) {
  return spawnSync(process.execPath, ['scripts/validate-pages-deploy-config.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: deploymentEnvironment(overrides)
  });
}

function validate(overrides?: Record<string, string>) {
  try {
    const stdout = validatePagesDeploymentConfiguration(
      deploymentEnvironment(overrides),
      { entryAgreementReleaseStatus: 'production-approved' },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('Pages deployment configuration validation', () => {
  it('blocks the review-only agreement from the real deployment entry point', () => {
    const result = validateCli();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('entry agreement is review-only');
    expect(result.stderr).toContain('coordinated Pages and SpacetimeDB rollout approval');
  });

  it('accepts the root-base canonical build with shared alpha deliberately disabled', () => {
    const result = validate();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shared alpha disabled');
  });

  it('pins public database coordinates even while shared alpha is disabled', () => {
    const result = validate({
      VITE_SPACETIMEDB_DATABASE: 'warpkeep-89e4u'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e');
  });

  it('requires an exact fail-closed admission-notification presentation gate', () => {
    expect(validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false' }).status).toBe(0);
    const premature = validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true' });
    expect(premature.status).not.toBe(0);
    expect(premature.stderr).toContain('must remain false');

    const ambiguous = validate({
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'TRUE'
    });
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toContain(
      'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED must be exactly true or false.'
    );
  });

  it('attests that the current tree is one exact safe phase with distinct verifiers', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('current closed binding must not fetch');
    }) as typeof fetch;
    expect(AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING).toEqual({
      notificationPreparedReceiptDigest: null,
      notificationPreparedBridgeSourceCommit: null,
    });
    expect(Object.isFrozen(AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING)).toBe(true);
    await expect(verifyGreaterRealmReleaseGateState({
      fetchImpl: fetchMock,
      now: NOW,
    })).resolves.toMatch(
      /^Greater Realm release phase=(?:closed-review|pre-generation|candidate-approved-inert-append|import-only|activation-only|activation-client|activation-client-and-notifications); legacy=100 and v17=600 verifiers are distinct\.$/u,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only the exact safe release phase state machine', async () => {
    const fields = [
      'importMutationsCompiled',
      'activationMutationsCompiled',
      'clientPresentationAllowed',
      'serverPresentationAllowed',
      'entryAgreementApproved',
      'additivePublishApproved',
      'importForwardFixApproved',
      'activationForwardFixApproved',
      'clientActivationApproved',
      'admissionNotificationsApproved',
      'pagesNotificationsEnabled',
    ] as const;
    const accepted = new Set<string>();
    let rejected = 0;
    for (const entryAgreementReleaseStatus of [
      'review-only-rollout-blocked', 'production-approved',
    ] as const) {
      for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
        const envelope = Object.fromEntries([
          ['entryAgreementReleaseStatus', entryAgreementReleaseStatus],
          ...fields.map((field, index) => [field, (mask & (1 << index)) !== 0]),
          [
            'notificationPreparedReceiptDigest',
            (mask & (1 << 9)) !== 0 && (mask & (1 << 10)) !== 0
              ? PREPARED_RECEIPT_DIGEST
              : null,
          ],
          [
            'notificationPreparedBridgeSourceCommit',
            (mask & (1 << 9)) !== 0 && (mask & (1 << 10)) !== 0
              ? PREPARED_BRIDGE_SOURCE_COMMIT
              : null,
          ],
        ]);
        try {
          accepted.add(await verifyGreaterRealmReleaseGateEnvelope(envelope, {
            fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
            now: NOW,
          }, preparedGateDependencies()));
        } catch {
          rejected += 1;
        }
      }
    }
    expect([...accepted].sort()).toEqual([
      'activation-client',
      'activation-client-and-notifications',
      'activation-only',
      'candidate-approved-inert-append',
      'closed-review',
      'import-only',
      'pre-generation',
    ]);
    expect(rejected).toBe(2 ** (fields.length + 1) - accepted.size);
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      entryAgreementReleaseStatus: 'production-approved',
      ...Object.fromEntries(fields.map(field => [field, false])),
      activationMutationsCompiled: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      activationForwardFixApproved: true,
      admissionNotificationsApproved: true,
      pagesNotificationsEnabled: true,
      notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST,
      notificationPreparedBridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
    })).rejects.toThrow(/PHASE_INVALID/);
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      entryAgreementReleaseStatus: 'production-approved',
      ...Object.fromEntries(fields.map(field => [field, false])),
      importMutationsCompiled: true,
      activationMutationsCompiled: true,
      notificationPreparedReceiptDigest: null,
      notificationPreparedBridgeSourceCommit: null,
    })).rejects.toThrow(/ENVELOPE_INVALID/);
  });

  it('requires the exact prepared binding and a matching fresh live attestation', async () => {
    const finalEnvelope = {
      entryAgreementReleaseStatus: 'production-approved' as const,
      importMutationsCompiled: false,
      activationMutationsCompiled: true,
      clientPresentationAllowed: true,
      serverPresentationAllowed: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      importForwardFixApproved: false,
      activationForwardFixApproved: true,
      clientActivationApproved: true,
      admissionNotificationsApproved: true,
      pagesNotificationsEnabled: true,
      notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST,
      notificationPreparedBridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
    };
    const noFetch = vi.fn(async () => releaseResponse()) as typeof fetch;
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...finalEnvelope,
      notificationPreparedReceiptDigest: null,
      notificationPreparedBridgeSourceCommit: null,
    }, { fetchImpl: noFetch, now: NOW })).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BINDING_REQUIRED',
    );
    expect(noFetch).not.toHaveBeenCalled();

    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...finalEnvelope,
      notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST.toUpperCase(),
    }, { fetchImpl: noFetch, now: NOW })).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BINDING_INVALID',
    );
    expect(noFetch).not.toHaveBeenCalled();

    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse({
        body: releaseAttestation({ bridgeSourceCommit: 'd'.repeat(40) }),
      })) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_LIVE_ATTESTATION_MISMATCH',
    );

    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse({
        headers: { date: new Date(NOW.getTime() - 6 * 60 * 1_000).toUTCString() },
      })) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'AUTH_BRIDGE_PREPARED_ATTESTATION_NOT_FRESH',
    );

    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: vi.fn(async () => {
        throw new Error('unavailable');
      }) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'AUTH_BRIDGE_PREPARED_ATTESTATION_UNREACHABLE',
    );

    const missingReceiptInspector = vi.fn(async () => {
      throw new Error('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_INVALID');
    });
    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: noFetch,
      now: NOW,
    }, {
      inspectPreparedReceiptByDigest: missingReceiptInspector,
      assertBridgeSourceAncestor: vi.fn(),
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_INVALID');
    expect(missingReceiptInspector).toHaveBeenCalledWith({
      receiptDigest: PREPARED_RECEIPT_DIGEST,
      repositoryRoot: process.cwd(),
      fetchImpl: noFetch,
      now: NOW,
    });

    const ancestryFailure = preparedGateDependencies();
    ancestryFailure.assertBridgeSourceAncestor.mockImplementation(() => {
      throw new Error('GREATER_REALM_NOTIFICATION_PREPARED_BRIDGE_SOURCE_NOT_ANCESTOR');
    });
    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    }, ancestryFailure)).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BRIDGE_SOURCE_NOT_ANCESTOR',
    );
    expect(ancestryFailure.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();

    const acceptedDependencies = preparedGateDependencies();
    await expect(verifyGreaterRealmReleaseGateEnvelope(finalEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    }, acceptedDependencies)).resolves.toBe('activation-client-and-notifications');
    expect(acceptedDependencies.inspectPreparedReceiptByDigest).toHaveBeenCalledTimes(1);
    expect(acceptedDependencies.assertBridgeSourceAncestor).toHaveBeenCalledWith(
      PREPARED_BRIDGE_SOURCE_COMMIT,
      process.cwd(),
    );
  });

  it('requires exact active bridge/issuer configuration and rejects unsafe activation', () => {
    const active = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com'
    });
    expect(active.status).toBe(0);
    expect(active.stdout).toContain('shared alpha enabled');

    const unsafe = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.invalid'
    });
    expect(unsafe.status).not.toBe(0);
    expect(unsafe.stderr).toContain('stable public HTTPS origin');

    const matchingLookalike = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://lookalike.example'
    });
    expect(matchingLookalike.status).not.toBe(0);
    expect(matchingLookalike.stderr).toContain('https://auth.warpkeep.com');
  });

  it('pins the active Maincloud database rather than accepting a lookalike name', () => {
    const result = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
      VITE_SPACETIMEDB_DATABASE: 'lookalike-database'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e');
  });
});
