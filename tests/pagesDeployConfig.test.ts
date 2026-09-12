import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { assertNotificationReleaseAuthorityMatchesSources } from '../scripts/validate-pages-deploy-config.mjs';
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
  GREATER_REALM_NOTIFICATION_RELEASE_PHASE,
  parseGreaterRealmNotificationReleaseAuthority,
  verifyGreaterRealmReleaseGateEnvelope,
  verifyGreaterRealmReleaseGateState,
} from '../scripts/verify-greater-realm-release-gates.mjs';
import {
  NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
} from '../scripts/notification-pages-live-release-binding.mjs';
import {
  GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS,
} from '../scripts/greater-realm-downstream-release-policy';

const FULL_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const NOW = new Date('2026-08-12T12:00:00.000Z');
const PREPARED_RECEIPT_DIGEST = 'b'.repeat(64);
const PREPARED_BRIDGE_SOURCE_COMMIT = 'c'.repeat(40);
const LIVE_ROOT_RECEIPT_DIGEST = 'd'.repeat(64);
const LIVE_ROOT_PAGES_SOURCE_COMMIT = 'e'.repeat(40);
const PLAYER_CANARY_RECEIPT_DIGEST = 'f'.repeat(64);
const PLAYER_CANARY_SOURCE_COMMIT = '1'.repeat(40);
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
    notificationDeliveryEnabled: false as const,
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
    assertPagesLiveRootSourceAncestor: vi.fn(),
    assertProductionPlayerCanarySourceAncestor: vi.fn(),
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

function validate(
  overrides?: Record<string, string>,
  options: Record<string, unknown> = {},
) {
  try {
    const stdout = validatePagesDeploymentConfiguration(
      deploymentEnvironment(overrides),
      { entryAgreementReleaseStatus: 'production-approved', ...options },
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

const EMPTY_RELEASE_BINDINGS = Object.freeze({
  notificationPreparedReceiptDigest: null,
  notificationPreparedBridgeSourceCommit: null,
  notificationPagesLiveRootReceiptDigest: null,
  notificationPagesLiveRootPagesSourceCommit: null,
  productionPlayerCanaryReceiptDigest: null,
  productionPlayerCanarySourceCommit: null,
});

const PREPARED_RELEASE_BINDINGS = Object.freeze({
  notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST,
  notificationPreparedBridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
  notificationPagesLiveRootReceiptDigest: null,
  notificationPagesLiveRootPagesSourceCommit: null,
  productionPlayerCanaryReceiptDigest: null,
  productionPlayerCanarySourceCommit: null,
});

const DURABLE_RELEASE_BINDINGS = Object.freeze({
  notificationPreparedReceiptDigest: null,
  notificationPreparedBridgeSourceCommit: null,
  notificationPagesLiveRootReceiptDigest: LIVE_ROOT_RECEIPT_DIGEST,
  notificationPagesLiveRootPagesSourceCommit: LIVE_ROOT_PAGES_SOURCE_COMMIT,
  productionPlayerCanaryReceiptDigest: null,
  productionPlayerCanarySourceCommit: null,
});

const PLAYER_CANARY_RELEASE_BINDINGS = Object.freeze({
  productionPlayerCanaryReceiptDigest: PLAYER_CANARY_RECEIPT_DIGEST,
  productionPlayerCanarySourceCommit: PLAYER_CANARY_SOURCE_COMMIT,
});

const INERT_NOTIFICATION_ENVELOPE = Object.freeze({
  entryAgreementReleaseStatus: 'production-approved' as const,
  importMutationsCompiled: false,
  activationMutationsCompiled: true,
  clientPresentationAllowed: false,
  serverPresentationAllowed: false,
  entryAgreementApproved: true,
  additivePublishApproved: true,
  importForwardFixApproved: false,
  activationForwardFixApproved: true,
  clientActivationApproved: false,
  admissionNotificationsApproved: true,
  pagesNotificationsEnabled: true,
});

const ACTIVATED_CLIENT_ENVELOPE = Object.freeze({
  ...INERT_NOTIFICATION_ENVELOPE,
  clientPresentationAllowed: true,
  serverPresentationAllowed: true,
  clientActivationApproved: true,
});

function pagesPresentationAuthority() {
  return {
    phase: GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
    ...PREPARED_RELEASE_BINDINGS,
  };
}

function durableFinalAuthority() {
  return {
    phase: GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
    ...DURABLE_RELEASE_BINDINGS,
  };
}

describe('Pages deployment configuration validation', () => {
  it('accepts the selected approved agreement at the real deployment entry point', () => {
    const result = validateCli();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shared alpha disabled');
    expect(result.stderr).toBe('');
  });

  it('preserves a generic fail-closed guard for an unapproved agreement status', () => {
    const result = validate(undefined, {
      entryAgreementReleaseStatus: 'review-only-rollout-blocked',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not production-approved');
    expect(result.stderr).toContain('Pages deployment is unavailable');
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

  it('requires exact source authority for notification presentation, never mutable env', () => {
    expect(validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false' }).status).toBe(0);
    const premature = validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true' });
    expect(premature.status).not.toBe(0);
    expect(premature.stderr).toContain('explicit source-supplied notification release phase');

    const environmentOnly = validate({
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true',
      WARPKEEP_NOTIFICATION_RELEASE_PHASE:
        GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
      WARPKEEP_NOTIFICATION_PREPARED_RECEIPT_DIGEST: PREPARED_RECEIPT_DIGEST,
      WARPKEEP_NOTIFICATION_PREPARED_BRIDGE_SOURCE_COMMIT:
        PREPARED_BRIDGE_SOURCE_COMMIT,
    });
    expect(environmentOnly.status).not.toBe(0);
    expect(environmentOnly.stderr).toContain(
      'explicit source-supplied notification release phase',
    );

    const ambiguous = validate({
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'TRUE'
    });
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toContain(
      'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED must be exactly true or false.'
    );

    const unexpectedAuthority = validate(undefined, {
      notificationReleaseAuthority: pagesPresentationAuthority(),
    });
    expect(unexpectedAuthority.status).not.toBe(0);
    expect(unexpectedAuthority.stderr).toContain(
      'notification release authority must be omitted',
    );
  });

  it('keeps notification Pages closed until an exact staged authority is checked in', () => {
    const activeNotificationEnvironment = {
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
    };
    for (const authority of [
      pagesPresentationAuthority(),
      durableFinalAuthority(),
    ]) {
      const result = validate(activeNotificationEnvironment, {
        notificationReleaseAuthority: authority,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'must exactly match the reviewed checked-in prepared, durable, and '
          + 'production-player-canary bindings',
      );
    }

    const nearMisses = [
      null,
      {},
      { ...pagesPresentationAuthority(), phase: 'activation-client' },
      { ...pagesPresentationAuthority(), unexpected: true },
      { ...pagesPresentationAuthority(), notificationPreparedReceiptDigest: null },
      {
        ...pagesPresentationAuthority(),
        notificationPagesLiveRootReceiptDigest: LIVE_ROOT_RECEIPT_DIGEST,
        notificationPagesLiveRootPagesSourceCommit: LIVE_ROOT_PAGES_SOURCE_COMMIT,
      },
      {
        ...pagesPresentationAuthority(),
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
      { ...durableFinalAuthority(), notificationPagesLiveRootReceiptDigest: null },
      {
        ...durableFinalAuthority(),
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
      {
        ...durableFinalAuthority(),
        notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST,
        notificationPreparedBridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
      },
    ];
    for (const authority of nearMisses) {
      const result = validate(activeNotificationEnvironment, {
        notificationReleaseAuthority: authority,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'explicit notification release phase and authority is invalid',
      );
    }

    expect(() => parseGreaterRealmNotificationReleaseAuthority(
      pagesPresentationAuthority(),
    )).not.toThrow();
    expect(() => parseGreaterRealmNotificationReleaseAuthority(
      durableFinalAuthority(),
    )).not.toThrow();

    for (const phase of Object.values(GREATER_REALM_NOTIFICATION_RELEASE_PHASE)) {
      const currentSource = validate(activeNotificationEnvironment, {
        notificationReleaseAuthority: {
          phase,
          ...AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING,
          ...NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
        },
      });
      expect(currentSource.status).not.toBe(0);
      expect(currentSource.stderr).toContain(
        'explicit notification release phase and authority is invalid',
      );
    }
  });

  it('rejects a checked-in production-player-canary binding mismatch', () => {
    const authority = {
      phase: GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ACTIVATION_CLIENT,
      ...DURABLE_RELEASE_BINDINGS,
      ...PLAYER_CANARY_RELEASE_BINDINGS,
    };
    const parsedSources = {
      preparedBinding: {
        notificationPreparedReceiptDigest: null,
        notificationPreparedBridgeSourceCommit: null,
      },
      liveRootBinding: DURABLE_RELEASE_BINDINGS,
      productionPlayerCanaryBinding: PLAYER_CANARY_RELEASE_BINDINGS,
    };
    expect(() => assertNotificationReleaseAuthorityMatchesSources(
      authority,
      parsedSources,
    )).not.toThrow();
    expect(() => assertNotificationReleaseAuthorityMatchesSources(
      authority,
      {
        ...parsedSources,
        productionPlayerCanaryBinding: {
          ...PLAYER_CANARY_RELEASE_BINDINGS,
          productionPlayerCanarySourceCommit: '2'.repeat(40),
        },
      },
    )).toThrow(/production-player-canary bindings/u);
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
    expect(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING).toEqual({
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
    expect(Object.isFrozen(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING)).toBe(true);
    expect(GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS).toEqual({
      clientActivationApproved: false,
      admissionNotificationsApproved: false,
    });
    expect(Object.isFrozen(GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS)).toBe(true);
    await expect(verifyGreaterRealmReleaseGateState({
      fetchImpl: fetchMock,
      now: NOW,
    })).resolves.toMatch(
      /^Greater Realm release phase=(?:closed-review|pre-generation|candidate-approved-inert-append|import-only|activation-only|activation-client|notification-pages-presentation-activation|notification-pages-rooted-inert|notification-durable-final); legacy=100 and v17=600 verifiers are distinct\.$/u,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps downstream approval separate from the production publisher', () => {
    const publisher = readFileSync(
      resolve(process.cwd(), 'scripts/greater-realm-production-publisher-core.ts'),
      'utf8',
    );
    const downstream = readFileSync(
      resolve(process.cwd(), 'scripts/greater-realm-downstream-release-policy.ts'),
      'utf8',
    );
    for (const field of [
      'clientActivationApproved',
      'admissionNotificationsApproved',
    ]) {
      expect(publisher.match(new RegExp(
        `^  ${field}: false,$`,
        'gmu',
      ))).toHaveLength(1);
      expect(downstream.match(new RegExp(
        `^  ${field}: false,$`,
        'gmu',
      ))).toHaveLength(1);
    }
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
      'hermesNotificationDeliveryApproved',
      'pagesNotificationsEnabled',
    ] as const;
    const accepted = new Set<string>();
    let rejected = 0;
    for (const entryAgreementReleaseStatus of [
      'review-only-rollout-blocked', 'production-approved',
    ] as const) {
      for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
        const notificationApproved = (mask & (1 << 9)) !== 0
          && (mask & (1 << 11)) !== 0;
        const hermesApproved = (mask & (1 << 10)) !== 0;
        const clientApproved = (mask & (1 << 8)) !== 0;
        const envelope = Object.fromEntries([
          ['entryAgreementReleaseStatus', entryAgreementReleaseStatus],
          ...fields.map((field, index) => [field, (mask & (1 << index)) !== 0]),
          [
            'notificationPreparedReceiptDigest',
            notificationApproved && !hermesApproved
              ? PREPARED_RECEIPT_DIGEST
              : null,
          ],
          [
            'notificationPreparedBridgeSourceCommit',
            notificationApproved && !hermesApproved
              ? PREPARED_BRIDGE_SOURCE_COMMIT
              : null,
          ],
          [
            'notificationPagesLiveRootReceiptDigest',
            notificationApproved && hermesApproved
              ? LIVE_ROOT_RECEIPT_DIGEST
              : null,
          ],
          [
            'notificationPagesLiveRootPagesSourceCommit',
            notificationApproved && hermesApproved
              ? LIVE_ROOT_PAGES_SOURCE_COMMIT
              : null,
          ],
          [
            'productionPlayerCanaryReceiptDigest',
            notificationApproved && hermesApproved && clientApproved
              ? PLAYER_CANARY_RECEIPT_DIGEST
              : null,
          ],
          [
            'productionPlayerCanarySourceCommit',
            notificationApproved && hermesApproved && clientApproved
              ? PLAYER_CANARY_SOURCE_COMMIT
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
      'activation-only',
      'candidate-approved-inert-append',
      'closed-review',
      'import-only',
      'notification-durable-final',
      'notification-pages-presentation-activation',
      'pre-generation',
    ]);
    expect(rejected).toBe(2 ** (fields.length + 1) - accepted.size);
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...ACTIVATED_CLIENT_ENVELOPE,
      hermesNotificationDeliveryApproved: false,
      ...PREPARED_RELEASE_BINDINGS,
    })).rejects.toThrow(/PHASE_INVALID/);
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      entryAgreementReleaseStatus: 'production-approved',
      ...Object.fromEntries(fields.map(field => [field, false])),
      importMutationsCompiled: true,
      activationMutationsCompiled: true,
      ...EMPTY_RELEASE_BINDINGS,
    })).rejects.toThrow(/ENVELOPE_INVALID/);
  });

  it('orders prepared authority checks before Pages presentation activation', async () => {
    const pagesEnvelope = {
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: false,
      ...PREPARED_RELEASE_BINDINGS,
    };
    const noFetch = vi.fn(async () => releaseResponse()) as typeof fetch;
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...pagesEnvelope,
      ...EMPTY_RELEASE_BINDINGS,
    }, { fetchImpl: noFetch, now: NOW })).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BINDING_REQUIRED',
    );
    expect(noFetch).not.toHaveBeenCalled();

    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...pagesEnvelope,
      notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST.toUpperCase(),
    }, { fetchImpl: noFetch, now: NOW })).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BINDING_INVALID',
    );
    expect(noFetch).not.toHaveBeenCalled();

    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse({
        body: releaseAttestation({ bridgeSourceCommit: 'd'.repeat(40) }),
      })) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_LIVE_ATTESTATION_MISMATCH',
    );

    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse({
        body: releaseAttestation({ notificationDeliveryEnabled: true }),
      })) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_LIVE_ATTESTATION_MISMATCH',
    );

    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse({
        headers: { date: new Date(NOW.getTime() - 6 * 60 * 1_000).toUTCString() },
      })) as typeof fetch,
      now: NOW,
    }, preparedGateDependencies())).rejects.toThrow(
      'AUTH_BRIDGE_PREPARED_ATTESTATION_NOT_FRESH',
    );

    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
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
    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
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
    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    }, ancestryFailure)).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PREPARED_BRIDGE_SOURCE_NOT_ANCESTOR',
    );
    expect(ancestryFailure.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();

    const callOrder: string[] = [];
    const orderedFetch = vi.fn(async () => {
      callOrder.push('fresh-live-attestation');
      return releaseResponse();
    }) as typeof fetch;
    const acceptedDependencies = {
      assertBridgeSourceAncestor: vi.fn(() => {
        callOrder.push('source-ancestry');
      }),
      inspectPreparedReceiptByDigest: vi.fn(async ({
        receiptDigest,
        fetchImpl,
        now,
      }: {
        receiptDigest: string;
        fetchImpl?: typeof fetch;
        now?: Date;
      }) => {
        callOrder.push('private-receipt');
        const live = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
        return {
          receiptDigest,
          receipt: { bridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT },
          liveAttestation: live.attestation,
        };
      }),
    };
    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: orderedFetch,
      now: NOW,
    }, acceptedDependencies)).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
    );
    expect(callOrder).toEqual([
      'source-ancestry',
      'private-receipt',
      'fresh-live-attestation',
    ]);
    expect(acceptedDependencies.inspectPreparedReceiptByDigest).toHaveBeenCalledTimes(1);
    expect(acceptedDependencies.assertBridgeSourceAncestor).toHaveBeenCalledWith(
      PREPARED_BRIDGE_SOURCE_COMMIT,
      process.cwd(),
    );
  });

  it('requires the durable root for Hermes and never reads prepared authority', async () => {
    const durableEnvelope = {
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: true,
      ...DURABLE_RELEASE_BINDINGS,
    };
    const fetchMock = vi.fn(async () => {
      throw new Error('durable final must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(async () => {
        throw new Error('durable final must not read the prepared receipt');
      }),
      assertBridgeSourceAncestor: vi.fn(() => {
        throw new Error('durable final must not inspect prepared ancestry');
      }),
      assertPagesLiveRootSourceAncestor: vi.fn(),
    };
    await expect(verifyGreaterRealmReleaseGateEnvelope(durableEnvelope, {
      fetchImpl: fetchMock,
      now: NOW,
    }, dependencies)).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
    expect(dependencies.assertPagesLiveRootSourceAncestor).toHaveBeenCalledWith(
      LIVE_ROOT_PAGES_SOURCE_COMMIT,
      process.cwd(),
    );

    dependencies.assertPagesLiveRootSourceAncestor.mockClear();
    dependencies.assertPagesLiveRootSourceAncestor.mockImplementationOnce(() => {
      throw new Error(
        'GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_SOURCE_NOT_ANCESTOR',
      );
    });
    await expect(verifyGreaterRealmReleaseGateEnvelope(durableEnvelope, {
      fetchImpl: fetchMock,
      now: NOW,
    }, dependencies)).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_SOURCE_NOT_ANCESTOR',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();

    dependencies.assertPagesLiveRootSourceAncestor.mockReset();

    for (const nearMiss of [
      { ...durableEnvelope, ...EMPTY_RELEASE_BINDINGS },
      { ...durableEnvelope, ...PREPARED_RELEASE_BINDINGS },
      {
        ...durableEnvelope,
        ...DURABLE_RELEASE_BINDINGS,
        notificationPreparedReceiptDigest: PREPARED_RECEIPT_DIGEST,
        notificationPreparedBridgeSourceCommit: PREPARED_BRIDGE_SOURCE_COMMIT,
      },
      {
        ...durableEnvelope,
        notificationPagesLiveRootReceiptDigest: null,
      },
    ]) {
      await expect(verifyGreaterRealmReleaseGateEnvelope(nearMiss, {
        fetchImpl: fetchMock,
        now: NOW,
      }, dependencies)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
  });

  it('allows activation-client only after durable Hermes and rejects every early path', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('activation-client gate must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(),
      assertBridgeSourceAncestor: vi.fn(),
      assertPagesLiveRootSourceAncestor: vi.fn(),
      assertProductionPlayerCanarySourceAncestor: vi.fn(),
    };
    const finalEnvelope = {
      ...ACTIVATED_CLIENT_ENVELOPE,
      hermesNotificationDeliveryApproved: true,
      ...DURABLE_RELEASE_BINDINGS,
      ...PLAYER_CANARY_RELEASE_BINDINGS,
    };
    await expect(verifyGreaterRealmReleaseGateEnvelope(
      finalEnvelope,
      { fetchImpl: fetchMock, now: NOW },
      dependencies,
    )).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ACTIVATION_CLIENT,
    );
    for (const early of [
      {
        ...ACTIVATED_CLIENT_ENVELOPE,
        hermesNotificationDeliveryApproved: false,
        ...PREPARED_RELEASE_BINDINGS,
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
      {
        ...ACTIVATED_CLIENT_ENVELOPE,
        hermesNotificationDeliveryApproved: false,
        ...DURABLE_RELEASE_BINDINGS,
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
      {
        ...ACTIVATED_CLIENT_ENVELOPE,
        hermesNotificationDeliveryApproved: true,
        ...EMPTY_RELEASE_BINDINGS,
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
      {
        ...ACTIVATED_CLIENT_ENVELOPE,
        hermesNotificationDeliveryApproved: true,
        ...DURABLE_RELEASE_BINDINGS,
      },
    ]) {
      await expect(verifyGreaterRealmReleaseGateEnvelope(
        early,
        { fetchImpl: fetchMock, now: NOW },
        dependencies,
      )).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
    expect(dependencies.assertPagesLiveRootSourceAncestor).toHaveBeenCalledWith(
      LIVE_ROOT_PAGES_SOURCE_COMMIT,
      process.cwd(),
    );
    expect(dependencies.assertProductionPlayerCanarySourceAncestor)
      .toHaveBeenCalledWith(PLAYER_CANARY_SOURCE_COMMIT, process.cwd());
  });

  it('accepts the durable root while Hermes stays inert without private hosted access', async () => {
    const rootedEnvelope = {
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: false,
      ...DURABLE_RELEASE_BINDINGS,
    };
    const fetchMock = vi.fn(async () => {
      throw new Error('rooted-inert static authority must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(async () => {
        throw new Error('rooted-inert must not read prepared authority');
      }),
      assertBridgeSourceAncestor: vi.fn(),
      assertPagesLiveRootSourceAncestor: vi.fn(),
      assertProductionPlayerCanarySourceAncestor: vi.fn(),
    };
    await expect(verifyGreaterRealmReleaseGateEnvelope(rootedEnvelope, {
      fetchImpl: fetchMock,
      now: NOW,
      notificationAuthorityMode: 'static',
    }, dependencies)).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
    expect(dependencies.assertPagesLiveRootSourceAncestor).toHaveBeenCalledWith(
      LIVE_ROOT_PAGES_SOURCE_COMMIT,
      process.cwd(),
    );
  });

  it('keeps hosted staged validation static while private predeploy owns inspection', async () => {
    const pagesEnvelope = {
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: false,
      ...PREPARED_RELEASE_BINDINGS,
    };
    const fetchMock = vi.fn(async () => {
      throw new Error('static staged validation must not fetch');
    }) as typeof fetch;
    const dependencies = preparedGateDependencies();
    await expect(verifyGreaterRealmReleaseGateEnvelope(pagesEnvelope, {
      fetchImpl: fetchMock,
      now: NOW,
      notificationAuthorityMode: 'static',
    }, dependencies)).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).toHaveBeenCalledTimes(1);
  });

  it('proves durable root source ancestry locally before final acceptance', async () => {
    const head = spawnSync('/usr/bin/git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).stdout.trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/u);
    const fetchMock = vi.fn(async () => {
      throw new Error('durable ancestry must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(async () => {
        throw new Error('durable ancestry must not read prepared authority');
      }),
      assertBridgeSourceAncestor: vi.fn(),
    };
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: true,
      ...DURABLE_RELEASE_BINDINGS,
      notificationPagesLiveRootPagesSourceCommit: head,
    }, { fetchImpl: fetchMock, now: NOW }, dependencies)).resolves.toBe(
      GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
    );
    await expect(verifyGreaterRealmReleaseGateEnvelope({
      ...INERT_NOTIFICATION_ENVELOPE,
      hermesNotificationDeliveryApproved: true,
      ...DURABLE_RELEASE_BINDINGS,
      notificationPagesLiveRootPagesSourceCommit: '0'.repeat(40),
    }, { fetchImpl: fetchMock, now: NOW }, dependencies)).rejects.toThrow(
      'GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_SOURCE_NOT_ANCESTOR',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
  });

  it('rejects every one-bit near miss before private or network access', async () => {
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
      'hermesNotificationDeliveryApproved',
      'pagesNotificationsEnabled',
    ] as const;
    const exactEnvelopes = [
      {
        ...INERT_NOTIFICATION_ENVELOPE,
        hermesNotificationDeliveryApproved: false,
        ...PREPARED_RELEASE_BINDINGS,
      },
      {
        ...INERT_NOTIFICATION_ENVELOPE,
        hermesNotificationDeliveryApproved: true,
        ...DURABLE_RELEASE_BINDINGS,
      },
      {
        ...INERT_NOTIFICATION_ENVELOPE,
        hermesNotificationDeliveryApproved: false,
        ...DURABLE_RELEASE_BINDINGS,
      },
      {
        ...ACTIVATED_CLIENT_ENVELOPE,
        hermesNotificationDeliveryApproved: true,
        ...DURABLE_RELEASE_BINDINGS,
        ...PLAYER_CANARY_RELEASE_BINDINGS,
      },
    ];
    const fetchMock = vi.fn(async () => {
      throw new Error('boolean near miss must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(),
      assertBridgeSourceAncestor: vi.fn(),
      assertPagesLiveRootSourceAncestor: vi.fn(),
      assertProductionPlayerCanarySourceAncestor: vi.fn(),
    };
    for (const exact of exactEnvelopes) {
      for (const field of fields) {
        const candidate = {
          ...exact,
          [field]: !exact[field],
        };
        const projectionOnly = exact.notificationPagesLiveRootReceiptDigest
          === LIVE_ROOT_RECEIPT_DIGEST
          && exact.clientActivationApproved === false
          && field === 'hermesNotificationDeliveryApproved';
        if (projectionOnly) {
          await expect(verifyGreaterRealmReleaseGateEnvelope(
            candidate,
            { fetchImpl: fetchMock, now: NOW },
            dependencies,
          )).resolves.toMatch(/notification-(?:pages-rooted-inert|durable-final)/u);
        } else {
          await expect(verifyGreaterRealmReleaseGateEnvelope(
            candidate,
            { fetchImpl: fetchMock, now: NOW },
            dependencies,
          )).rejects.toThrow();
        }
      }
      await expect(verifyGreaterRealmReleaseGateEnvelope({
        ...exact,
        entryAgreementReleaseStatus: 'review-only-rollout-blocked',
      }, { fetchImpl: fetchMock, now: NOW }, dependencies)).rejects.toThrow(
        'GREATER_REALM_RELEASE_GATE_PHASE_INVALID',
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
    expect(dependencies.assertPagesLiveRootSourceAncestor).toHaveBeenCalledTimes(2);
    expect(dependencies.assertProductionPlayerCanarySourceAncestor)
      .not.toHaveBeenCalled();
  });

  it('rejects authorities on every non-notification phase without side effects', async () => {
    const allFalse = {
      importMutationsCompiled: false,
      activationMutationsCompiled: false,
      clientPresentationAllowed: false,
      serverPresentationAllowed: false,
      entryAgreementApproved: false,
      additivePublishApproved: false,
      importForwardFixApproved: false,
      activationForwardFixApproved: false,
      clientActivationApproved: false,
      admissionNotificationsApproved: false,
      hermesNotificationDeliveryApproved: false,
      pagesNotificationsEnabled: false,
    };
    const activatedServer = {
      ...allFalse,
      activationMutationsCompiled: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      activationForwardFixApproved: true,
    };
    const nonNotificationEnvelopes = [
      { entryAgreementReleaseStatus: 'review-only-rollout-blocked', ...allFalse },
      { entryAgreementReleaseStatus: 'production-approved', ...allFalse },
      {
        entryAgreementReleaseStatus: 'production-approved',
        ...allFalse,
        entryAgreementApproved: true,
        additivePublishApproved: true,
      },
      {
        entryAgreementReleaseStatus: 'production-approved',
        ...allFalse,
        importMutationsCompiled: true,
        entryAgreementApproved: true,
        additivePublishApproved: true,
        importForwardFixApproved: true,
      },
      { entryAgreementReleaseStatus: 'production-approved', ...activatedServer },
    ];
    const fetchMock = vi.fn(async () => {
      throw new Error('non-notification phase must not fetch');
    }) as typeof fetch;
    const dependencies = {
      inspectPreparedReceiptByDigest: vi.fn(),
      assertBridgeSourceAncestor: vi.fn(),
      assertPagesLiveRootSourceAncestor: vi.fn(),
    };
    for (const envelope of nonNotificationEnvelopes) {
      for (const authority of [
        PREPARED_RELEASE_BINDINGS,
        DURABLE_RELEASE_BINDINGS,
        { ...EMPTY_RELEASE_BINDINGS, ...PLAYER_CANARY_RELEASE_BINDINGS },
      ]) {
        await expect(verifyGreaterRealmReleaseGateEnvelope({
          ...envelope,
          ...authority,
        }, { fetchImpl: fetchMock, now: NOW }, dependencies)).rejects.toThrow(
          /BINDING_UNEXPECTED/,
        );
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dependencies.inspectPreparedReceiptByDigest).not.toHaveBeenCalled();
    expect(dependencies.assertBridgeSourceAncestor).not.toHaveBeenCalled();
    expect(dependencies.assertPagesLiveRootSourceAncestor).not.toHaveBeenCalled();
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
