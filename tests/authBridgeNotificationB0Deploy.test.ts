// @vitest-environment node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES,
  attestAuthBridgeNotificationB0Deployment,
  authBridgeNotificationB0VersionContract,
  executeAuthBridgeNotificationB0DeployAdapter,
} from '../scripts/auth-bridge-notification-b0-deploy-adapter.mjs';
import {
  authBridgeNotificationB0SourceDigest,
  attestAuthBridgeNotificationB0CandidateMultipartMetadata,
  createAuthBridgeNotificationB0CloudflareRuntime,
  inspectAuthBridgeNotificationB0Multipart,
  projectAuthBridgeNotificationB0CloudflareVersion,
} from '../scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
  withAuthBridgeNotificationB0DeployJournal,
} from '../scripts/auth-bridge-notification-b0-deploy-journal.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const SOURCE_DIGEST = 'd'.repeat(64);
const PREDECESSOR_DEPLOYMENT_ID =
  '123e4567-e89b-42d3-a456-426614174001';
const PREDECESSOR_VERSION_ID =
  '123e4567-e89b-42d3-a456-426614174002';
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174003';
const DFA_SOURCE_COMMIT =
  'dfa24a4806486fd09302f76d9e3346b63bf1baa6';
const DFA_VERSION_ID = '035e091c-02a2-48f0-854d-9eada8e545dc';
const DFA_VERSION_CREATED_AT = '2026-08-21T05:13:08.501893Z';
const DFA_SCRIPT_ETAG =
  'ad64a309e164d064e25d327b576514e317d72fe586a320ca3448660f18c88083';
const REVIEWED_V5_DEPLOYMENT_ID =
  'bb527e8d-c7dc-4eba-92a8-21beae4d3965';
const REVIEWED_V5_VERSION_ID =
  '3aaf1957-7613-47f5-b40b-24018aec1335';
const REVIEWED_V5_SOURCE_ETAG =
  '5db8091c35db39f07c9b714441a9a8291c5a4636900a90ec19c3c5ea0b6982f7';
const REVIEWED_V5_DEPLOYMENT_MESSAGE =
  'Promote main:e8bd065 single admission notification; rollback:481f8b94';
const REVIEWED_V5_VERSION_MESSAGE =
  'main:e8bd065 single admission notification; rollback:481f8b94';
const REVIEWED_V5_VARIABLES = Object.freeze({
  ACCESS_EXPECTED_FID_REQUIRED: 'true',
  ALLOWED_ORIGINS: 'https://warpkeep.com',
  APPROVAL_NOTIFICATIONS_ENABLED: 'true',
  ENVIRONMENT: 'production',
  FARCASTER_DOMAIN: 'warpkeep.com',
  FARCASTER_SIWE_URI: 'https://warpkeep.com/',
  ISSUER: 'https://auth.warpkeep.com',
  MINIAPP_NOTIFICATION_CLIENTS:
    '9152=https://api.farcaster.xyz/v1/frame-notifications',
  MINIAPP_NOTIFICATION_HUB_URLS:
    'https://rho.farcaster.xyz:3381/,https://hub.pinata.cloud/',
  OIDC_AUDIENCE: 'warpkeep-spacetimedb',
  OIDC_KEY_ID: 'warpkeep-alpha-2026-07-01',
  PUBLIC_AUTH_ENABLED: 'true',
  QA_OBSERVER_ENABLED: 'false',
  SPACETIMEDB_DATABASE:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
});
const REVIEWED_V5_DURABLE_OBJECT_BINDINGS = Object.freeze([
  Object.freeze({
    name: 'ADMISSION_NOTIFICATIONS',
    className: 'AdmissionNotification',
    namespaceId: '01d53045d07a4f79ab21646de395d82c',
  }),
  Object.freeze({
    name: 'AUTH_RATE_LIMITER',
    className: 'AuthRateLimiter',
    namespaceId: 'd800d603256f4a0f9907ba0b9267bc89',
  }),
  Object.freeze({
    name: 'CHALLENGE_REPLAY_GUARD',
    className: 'ChallengeReplayGuard',
    namespaceId: 'bbda3461bd4c4caf91478705d65374fc',
  }),
  Object.freeze({
    name: 'QA_CHALLENGE_REPLAY_GUARD',
    className: 'QaChallengeReplayGuard',
    namespaceId: '28d55581e3124399b8cfbc2bd4019bef',
  }),
  Object.freeze({
    name: 'SESSION_FAMILIES',
    className: 'SessionFamily',
    namespaceId: 'b4525a7a374743deb3666471fe2ae06c',
  }),
]);
const EXACT_NAMED_HANDLERS = Object.freeze([
  'AdmissionNotification',
  'AuthRateLimiter',
  'ChallengeReplayGuard',
  'DurableObjectAdmissionNotificationStore',
  'DurableObjectChallengeStore',
  'DurableObjectQaObserverChallengeStore',
  'DurableObjectSessionFamilyStore',
  'MemoryChallengeStore',
  'MemoryQaObserverChallengeStore',
  'MemorySessionFamilyStore',
  'MiniAppWebhookInvalidError',
  'MiniAppWebhookVerifierUnavailableError',
  'QaChallengeReplayGuard',
  'SessionFamily',
  'SpacetimeHttpAccessRequestResolver',
  'SpacetimeHttpAuthEpochResolver',
  'SpacetimeHttpQaObserverResolver',
  'admissionNotificationDeliveryContractDigest',
  'admissionNotificationDeliveryContractVector',
  'createAuthBridge',
  'createMiniAppWebhookVerifier',
  'serializeAdmissionNotificationDeliveryContract',
]);
const RUNTIME_MODULE_BYTES = Buffer.from(
  'export default { fetch() { return new Response("ok") } };\n',
  'utf8',
);
const RUNTIME_SOURCE_DIGEST = authBridgeNotificationB0SourceDigest([{
  name: 'index.js',
  field: 'index.js',
  contentType: 'application/javascript+module',
  bytes: RUNTIME_MODULE_BYTES,
}]);
const NOW = new Date('2026-08-13T12:00:00.000Z');
const temporaryDirectories: string[] = [];
type Phase =
  | 'prepared'
  | 'remote-reconcile-started'
  | 'upload-invoked'
  | 'uploaded'
  | 'release-uncertain'
  | 'release-invoked'
  | 'completed'
  | null;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function contract(
  sourceDigest = SOURCE_DIGEST,
  accessExpectedFidRequired = false,
  sourceCommit = SOURCE_COMMIT,
) {
  return authBridgeNotificationB0VersionContract({
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    sourceCommit,
    sourceDigest,
    beforeModes: {
      bridgeSourceCommit: sourceCommit,
      publicAuthEnabled: true,
      accessExpectedFidRequired,
    },
  }) as Readonly<Record<string, unknown>> & Readonly<{
    durableObjectBindings: readonly Readonly<{
      name: string;
      className: string;
    }>[];
    migrations: readonly Readonly<{
      tag: string;
      newSqliteClasses: readonly string[];
    }>[];
    variables: Readonly<Record<string, string>>;
    compatibilityDate: string;
    compatibilityFlags: readonly string[];
    versionMessage: string;
    versionTag: string;
  }>;
}

function runtimeMultipart(
  value: ReturnType<typeof contract>,
  boundary = 'warpkeep-b0-v5-boundary',
) {
  const metadata = JSON.stringify({
    main_module: 'index.js',
    bindings: [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
    ],
    compatibility_date: value.compatibilityDate,
    compatibility_flags: value.compatibilityFlags,
    keep_bindings: ['secret_text', 'secret_key'],
    annotations: {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
    },
  });
  return Buffer.from([
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="metadata"\r\n',
    'Content-Type: application/json\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n',
    'Content-Type: application/javascript+module\r\n\r\n',
    RUNTIME_MODULE_BYTES.toString('utf8'),
    `\r\n--${boundary}--\r\n`,
  ].join(''), 'utf8');
}

function cloudflareResponse(
  body: unknown,
  url: string,
  resultInfo?: unknown,
  emptyMessages: 'array' | 'null' | 'record' = 'array',
) {
  const response = new Response(JSON.stringify({
    success: true,
    errors: emptyMessages === 'array'
      ? []
      : (emptyMessages === 'null' ? null : {}),
    messages: emptyMessages === 'array'
      ? []
      : (emptyMessages === 'null' ? null : {}),
    result: body,
    ...(resultInfo === undefined ? {} : { result_info: resultInfo }),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: false });
  return response;
}

function cloudflareMultipartResponse(
  body: Buffer,
  url: string,
  contentType: string,
) {
  const response = new Response(Uint8Array.from(body), {
    status: 200,
    headers: {
      'cf-entrypoint': 'index.js',
      'content-type': contentType,
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: false });
  return response;
}

type ReviewedV5Detail = Record<string, unknown> & {
  annotations: Record<string, unknown>;
  metadata: Record<string, unknown>;
  resources: {
    bindings: Record<string, unknown>[];
    script: Record<string, unknown>;
    script_runtime: Record<string, unknown>;
  };
};

type CandidateDetail = Record<string, unknown> & {
  annotations: Record<string, unknown>;
  metadata: Record<string, unknown>;
  resources: {
    bindings: Record<string, unknown>[];
    script: Record<string, unknown>;
    script_runtime: Record<string, unknown>;
  };
};

function exactCandidateExports(value: ReturnType<typeof contract>) {
  return Object.fromEntries([
    ['default', { type: 'worker' }],
    ...value.durableObjectBindings.map(binding => [
      binding.className,
      { type: 'durable-object', storage: 'sqlite' },
    ]),
  ]);
}

function reviewedV5Detail(): ReviewedV5Detail {
  return {
    id: REVIEWED_V5_VERSION_ID,
    number: 46,
    annotations: {
      'workers/message': REVIEWED_V5_VERSION_MESSAGE,
      'workers/triggered_by': 'version_upload',
    },
    metadata: {
      created_on: '2026-08-04T14:42:56.481717Z',
      has_preview: false,
      source: 'wrangler',
    },
    resources: {
      bindings: [
        ...Object.entries(REVIEWED_V5_VARIABLES).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text,
        })),
        ...AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
          name,
          type: 'secret_text',
        })),
        ...REVIEWED_V5_DURABLE_OBJECT_BINDINGS.map(binding => ({
          name: binding.name,
          type: 'durable_object_namespace',
          class_name: binding.className,
          namespace_id: binding.namespaceId,
        })),
      ],
      script: {
        etag: REVIEWED_V5_SOURCE_ETAG,
        handlers: ['fetch'],
        last_deployed_from: 'wrangler',
        named_handlers: [],
      },
      script_runtime: {
        compatibility_date: '2026-07-11',
        compatibility_flags: ['nodejs_compat'],
        migration_tag: 'v5',
        usage_model: 'standard',
      },
    },
  };
}

function candidateMetadata(value = contract()) {
  return {
    main_module: 'index.js',
    bindings: [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
      ...AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
        name,
        type: 'inherit',
      })),
    ],
    compatibility_date: '2026-07-11',
    compatibility_flags: ['nodejs_compat'],
    annotations: {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
    },
  };
}

function deployment(versionId = VERSION_ID) {
  return {
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
    observedAt: '2026-08-13T11:59:00.000Z',
  };
}

function rawCandidateVersion(value = contract()) {
  return {
    id: VERSION_ID,
    number: 48,
    metadata: {
      author_email: '',
      author_id: 'e'.repeat(32),
      created_on: '2026-08-13T11:58:00.000Z',
      has_preview: false,
      source: 'api',
    },
    annotations: {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
      'workers/triggered_by': 'version_upload',
    },
    resources: {
      bindings: [
        ...Object.entries(value.variables).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text,
        })),
        ...AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
          name,
          type: 'secret_text',
        })),
        ...value.durableObjectBindings.map(binding => ({
          name: binding.name,
          type: 'durable_object_namespace',
          class_name: binding.className,
          namespace_id: REVIEWED_V5_DURABLE_OBJECT_BINDINGS.find(
            reviewed => reviewed.name === binding.name,
          )?.namespaceId,
        })),
      ],
      script: {
        etag: SOURCE_DIGEST,
        handlers: ['fetch'],
        last_deployed_from: 'api',
        named_handlers: EXACT_NAMED_HANDLERS.map(name => ({
          handlers: ['class'],
          name,
        })),
      },
      script_runtime: {
        compatibility_date: '2026-07-11',
        compatibility_flags: ['nodejs_compat'],
        migration_tag: 'v5',
        usage_model: 'standard',
      },
    },
  };
}

function exactDfaV47Candidate() {
  const value = contract(RUNTIME_SOURCE_DIGEST, true, DFA_SOURCE_COMMIT);
  const candidate = rawCandidateVersion(value);
  return {
    value,
    candidate: {
      ...candidate,
      id: DFA_VERSION_ID,
      number: 47,
      metadata: {
        author_email: '',
        author_id: 'e'.repeat(32),
        created_on: DFA_VERSION_CREATED_AT,
        has_preview: false,
        source: 'api',
      },
      resources: {
        ...candidate.resources,
        script: {
          ...candidate.resources.script,
          etag: DFA_SCRIPT_ETAG,
        },
      },
    },
  };
}

function reviewedV5RuntimeHarness(
  mutate?: (detail: ReviewedV5Detail) => void,
  domainEmptyMessages: 'null' | 'record' = 'null',
  deployableCandidates: readonly Readonly<{
    detail?: CandidateDetail;
    id: string;
    message: string;
    tag: string;
  }>[] = [],
) {
  const value = contract(RUNTIME_SOURCE_DIGEST, true);
  const boundary = 'warpkeep-b0-v5-boundary';
  const contentType = `multipart/form-data; boundary=${boundary}`;
  const body = runtimeMultipart(value, boundary);
  const detail = reviewedV5Detail();
  mutate?.(detail);
  let candidateBody: Buffer | undefined;
  let releasedVersionId: string | undefined;
  const fetchImpl = vi.fn(async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/workers/scripts')) {
      return cloudflareResponse([{
        id: value.workerName,
        migration_tag: 'v5',
        cache_options: { enabled: false, cross_version_cache: true },
      }], url);
    }
    if (url.includes('/workers/domains?service=')) {
      return cloudflareResponse([{
        id: 'domain-id',
        zone_id: ZONE_ID,
        zone_name: 'warpkeep.com',
        hostname: 'auth.warpkeep.com',
        service: value.workerName,
        environment: 'production',
        cert_id: 'certificate-id',
        enabled: true,
        previews_enabled: false,
      }], url, { count: 1 }, domainEmptyMessages);
    }
    if (url.endsWith('/environments/production/routes?show_zonename=true')) {
      return cloudflareResponse([], url);
    }
    if (url.endsWith('/script-settings')) {
      return cloudflareResponse({
        logpush: false,
        observability: { enabled: false },
        tags: [],
        tail_consumers: [],
      }, url);
    }
    if (url.endsWith('/subdomain')) {
      return cloudflareResponse({
        enabled: false,
        previews_enabled: false,
      }, url);
    }
    if (url.endsWith('/deployments') && method === 'GET') {
      return cloudflareResponse([{
        id: REVIEWED_V5_DEPLOYMENT_ID,
        created_on: '2026-08-04T14:45:32.958436Z',
        source: 'wrangler',
        strategy: 'percentage',
        versions: [{
          version_id: REVIEWED_V5_VERSION_ID,
          percentage: 100,
        }],
        annotations: {
          'workers/message': REVIEWED_V5_DEPLOYMENT_MESSAGE,
          'workers/triggered_by': 'deployment',
        },
      }], url);
    }
    if (url.endsWith('/deployments') && method === 'POST') {
      const payload = JSON.parse(String(init?.body)) as {
        versions?: { version_id?: string }[];
      };
      releasedVersionId = payload.versions?.[0]?.version_id;
      return cloudflareResponse({
        id: '223e4567-e89b-42d3-a456-426614174000',
      }, url);
    }
    if (url.includes('/versions?deployable=true')) {
      return cloudflareResponse({
        items: deployableCandidates.map(candidate => ({
          id: candidate.id,
          annotations: {
            'workers/message': candidate.message,
            'workers/tag': candidate.tag,
          },
        })),
      }, url);
    }
    if (url.endsWith(`/versions/${REVIEWED_V5_VERSION_ID}`)) {
      return cloudflareResponse(detail, url);
    }
    const candidate = deployableCandidates.find(item => (
      url.endsWith(`/versions/${item.id}`)
    ));
    if (candidate?.detail !== undefined) {
      return cloudflareResponse(candidate.detail, url);
    }
    if (candidate !== undefined && url.includes('/content/v2?version=')) {
      return cloudflareMultipartResponse(body, url, contentType);
    }
    if (url.includes('/content/v2?version=')) {
      return cloudflareMultipartResponse(body, url, contentType);
    }
    if (
      url.endsWith('/versions?bindings_inherit=strict')
      && method === 'POST'
    ) {
      candidateBody = Buffer.from(init?.body as Buffer);
      return cloudflareResponse({ id: VERSION_ID }, url);
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  });
  const runtime = createAuthBridgeNotificationB0CloudflareRuntime({
    contract: value,
    apiToken: 'cloudflare-test-token-value-1234567890',
    repositoryRoot: realpathSync(process.cwd()),
    serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
    nodeExecutable: process.execPath,
    wranglerEntrypoint: process.execPath,
    multipartBody: body,
    multipartContentType: contentType,
    fetchImpl: fetchImpl as typeof fetch,
    journal: { inspect: () => ({ phase: 'prepared' }) },
  });
  return {
    body,
    contentType,
    detail,
    fetchImpl,
    runtime,
    value,
    candidateMetadata: () => {
      if (candidateBody === undefined) throw new Error('candidate not uploaded');
      return inspectAuthBridgeNotificationB0Multipart(
        candidateBody,
        contentType,
      ).metadata;
    },
    releasedVersionId: () => releasedVersionId,
  };
}

function recoveryHarness({
  uploadLosesResponse = false,
  releaseLosesResponse = false,
  initialPhase = null,
  initialCandidateExists = false,
  initialLiveVersion = PREDECESSOR_VERSION_ID,
}: Readonly<{
  uploadLosesResponse?: boolean;
  releaseLosesResponse?: boolean;
  initialPhase?: Phase;
  initialCandidateExists?: boolean;
  initialLiveVersion?: string;
}> = {}) {
  const value = contract();
  const events: string[] = [];
  let phase: Phase = initialPhase;
  let candidateExists = initialCandidateExists;
  let liveVersion = initialLiveVersion;
  const journal = {
    inspect: vi.fn(() => ({
      phase,
      predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
      predecessorVersionId: PREDECESSOR_VERSION_ID,
    })),
    prepared: vi.fn(async () => { phase ??= 'prepared'; }),
    remoteReconcileStarted: vi.fn(async () => {
      if (phase === 'prepared') phase = 'remote-reconcile-started';
    }),
    uploadInvoked: vi.fn(async () => { phase = 'upload-invoked'; }),
    uploaded: vi.fn(async () => {
      if (!['release-uncertain', 'release-invoked', 'completed'].includes(
        phase ?? '',
      )) phase = 'uploaded';
    }),
    releaseUncertain: vi.fn(async () => {
      if (!['release-invoked', 'completed'].includes(phase ?? '')) {
        phase = 'release-uncertain';
      }
    }),
    releaseInvoked: vi.fn(async () => { phase = 'release-invoked'; }),
    completed: vi.fn(async () => { phase = 'completed'; }),
  };
  const releaseVersion = vi.fn(async () => {
    events.push('deployments-post');
    liveVersion = VERSION_ID;
    if (releaseLosesResponse) throw new Error('lost deployment response');
  });
  return {
    events,
    releaseVersion,
    options: {
      contract: value,
      prepareUpload: vi.fn(async () => ({
        mode: 'version' as const,
        predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
        predecessorVersionId: PREDECESSOR_VERSION_ID,
      })),
      reconcileVersion: vi.fn(async () => (
        candidateExists ? [VERSION_ID] : []
      )),
      uploadVersion: vi.fn(async () => {
        events.push('versions-post');
        candidateExists = true;
        if (uploadLosesResponse) throw new Error('lost version response');
        return { versionId: VERSION_ID };
      }),
      inspectVersion: vi.fn(async () => ({
        ...value,
        versionId: VERSION_ID,
        createdAt: '2026-08-13T11:58:00.000Z',
      })),
      inspectDeployment: vi.fn(async () => deployment(liveVersion)),
      assertPredecessorStable: vi.fn(async () => undefined),
      releaseVersion,
      assertCanStartWrite: vi.fn(async () => true as const),
      journal,
      clock: () => new Date(NOW),
    },
  };
}

describe('auth-bridge notification B0 deploy', () => {
  it('binds only the established six inherited secrets without replaying v5 migration', () => {
    const value = contract();
    expect(value.secretBindingNames).toEqual([
      'ADMIN_TOKEN_SECRET',
      'FARCASTER_RPC_URL',
      'FARCASTER_RPC_URL_SECONDARY',
      'NOTIFICATION_OPERATOR_SECRET',
      'SESSION_COOKIE_KEY',
      'SIGNING_KEY_JWK',
    ]);
    expect(JSON.stringify(value)).not.toContain('PLAYER_CANARY_OWNER_FID');
    expect(attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: candidateMetadata(value),
      contract: value,
      predecessorVersionId: REVIEWED_V5_VERSION_ID,
    })).toBe(true);
    expect(() => attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: {
        ...candidateMetadata(value),
        migrations: {
          old_tag: 'v4',
          new_tag: 'v5',
          steps: [{ new_sqlite_classes: ['AdmissionNotification'] }],
        },
      },
      contract: value,
      predecessorVersionId: REVIEWED_V5_VERSION_ID,
    })).toThrowError(/MULTIPART_METADATA_MISMATCH/u);
    expect(() => attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: {
        ...candidateMetadata(value),
        bindings: [
          ...candidateMetadata(value).bindings,
          { name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text', text: '1' },
        ],
      },
      contract: value,
      predecessorVersionId: REVIEWED_V5_VERSION_ID,
    })).toThrowError(/(?:MULTIPART_METADATA_MISMATCH|VERSION_BINDING_UNEXPECTED)/u);
    expect(() => attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: {
        ...candidateMetadata(value),
        bindings: candidateMetadata(value).bindings.map(binding => (
          binding.name === 'ADMIN_TOKEN_SECRET'
            ? { ...binding, version_id: PREDECESSOR_VERSION_ID }
            : binding
        )),
      },
      contract: value,
      predecessorVersionId: REVIEWED_V5_VERSION_ID,
    })).toThrowError(/MULTIPART_METADATA_MISMATCH/u);
  });

  it('pins the exact reviewed e8 v5 predecessor and uploads without migrations', async () => {
    expect(Object.keys(REVIEWED_V5_VARIABLES)).toHaveLength(15);
    expect(AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES).toHaveLength(6);
    expect(REVIEWED_V5_DURABLE_OBJECT_BINDINGS).toHaveLength(5);
    expect(REVIEWED_V5_DURABLE_OBJECT_BINDINGS.every(binding => (
      /^[a-f0-9]{32}$/u.test(binding.namespaceId)
    ))).toBe(true);
    const harness = reviewedV5RuntimeHarness();
    expect(harness.detail.resources.script_runtime).not.toHaveProperty('exports');
    const plan = await harness.runtime.prepareUpload(harness.value);
    expect(plan).toEqual({
      mode: 'version',
      predecessorDeploymentId: REVIEWED_V5_DEPLOYMENT_ID,
      predecessorVersionId: REVIEWED_V5_VERSION_ID,
    });
    await expect(harness.runtime.uploadVersion(
      harness.value,
      plan,
    )).resolves.toEqual({ versionId: VERSION_ID });
    const metadata = harness.candidateMetadata();
    expect(metadata).not.toHaveProperty('keep_bindings');
    expect(metadata).not.toHaveProperty('migrations');
    expect((metadata.bindings as { name: string; type: string }[])
      .filter(binding => binding.type === 'inherit'))
      .toEqual(AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
        name,
        type: 'inherit',
      })));
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => (
      (init?.method ?? 'GET') === 'POST'
    ))).toHaveLength(1);
    harness.runtime.dispose();
  });

  it('accepts only the live null or reviewed empty-array API message envelope', async () => {
    const invalid = reviewedV5RuntimeHarness(undefined, 'record');
    await expect(invalid.runtime.prepareUpload(invalid.value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_RESPONSE_ENVELOPE_INVALID',
    });
    invalid.runtime.dispose();
  });

  it.each([
    {
      name: 'migration tag',
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_REVIEWED_V5_PREREQUISITE_REQUIRED',
      mutate: (detail: ReviewedV5Detail) => {
        detail.resources.script_runtime.migration_tag = 'v4';
      },
    },
    {
      name: 'source etag',
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_REVIEWED_V5_PREREQUISITE_REQUIRED',
      mutate: (detail: ReviewedV5Detail) => {
        detail.resources.script.etag = 'f'.repeat(64);
      },
    },
    {
      name: 'plain variable',
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
      mutate: (detail: ReviewedV5Detail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'PUBLIC_AUTH_ENABLED'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.text = 'false';
      },
    },
    {
      name: 'secret binding name',
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
      mutate: (detail: ReviewedV5Detail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMIN_TOKEN_SECRET'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.name = 'UNREVIEWED_SECRET';
      },
    },
    {
      name: 'Durable Object namespace id',
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
      mutate: (detail: ReviewedV5Detail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMISSION_NOTIFICATIONS'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.namespace_id = 'f'.repeat(32);
      },
    },
  ])('rejects a near-miss reviewed v5 predecessor: $name', async ({
    code,
    mutate,
  }) => {
    const harness = reviewedV5RuntimeHarness(mutate);
    await expect(harness.runtime.prepareUpload(harness.value))
      .rejects.toMatchObject({ code });
    expect(harness.fetchImpl.mock.calls.every(([, init]) => (
      (init?.method ?? 'GET') === 'GET'
    ))).toBe(true);
    harness.runtime.dispose();
  });

  it('attests the exact exports-absent v47 GET shape and exact optional exports', () => {
    const { candidate, value } = exactDfaV47Candidate();
    expect(candidate.resources.bindings).toHaveLength(27);
    expect((candidate.resources.bindings as Record<string, unknown>[])
      .filter(binding => (
      binding.type === 'durable_object_namespace'
      )).map(binding => binding.namespace_id)).toEqual(
      REVIEWED_V5_DURABLE_OBJECT_BINDINGS.map(binding => binding.namespaceId),
    );
    expect(candidate.resources.script_runtime).not.toHaveProperty('exports');
    expect(candidate.resources.script.named_handlers).toHaveLength(22);
    expect(projectAuthBridgeNotificationB0CloudflareVersion({
      value: candidate,
      contract: value,
      sourceDigest: RUNTIME_SOURCE_DIGEST,
    })).toMatchObject({
      sourceDigest: RUNTIME_SOURCE_DIGEST,
      versionId: DFA_VERSION_ID,
      createdAt: '2026-08-21T05:13:08.501Z',
    });

    const exportsPresent = structuredClone(candidate) as CandidateDetail;
    exportsPresent.resources.script_runtime.exports = exactCandidateExports(value);
    expect(projectAuthBridgeNotificationB0CloudflareVersion({
      value: exportsPresent,
      contract: value,
      sourceDigest: RUNTIME_SOURCE_DIGEST,
    })).toMatchObject({ versionId: DFA_VERSION_ID });
  });

  it.each([
    {
      name: 'top-level extra key',
      mutate: (detail: CandidateDetail) => {
        detail.unreviewed = false;
      },
    },
    {
      name: 'missing named handler',
      mutate: (detail: CandidateDetail) => {
        (detail.resources.script.named_handlers as unknown[]).pop();
      },
    },
    {
      name: 'duplicate named handler',
      mutate: (detail: CandidateDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers.push(structuredClone(handlers[0]));
      },
    },
    {
      name: 'renamed named handler',
      mutate: (detail: CandidateDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].name = 'AdmissionNotificationV2';
      },
    },
    {
      name: 'named handler extra key',
      mutate: (detail: CandidateDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].type = 'class';
      },
    },
    {
      name: 'wrong named handler type',
      mutate: (detail: CandidateDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].handlers = ['fetch'];
      },
    },
    {
      name: 'null named handlers',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script.named_handlers = null;
      },
    },
    {
      name: 'missing fetch handler',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script.handlers = ['scheduled'];
      },
    },
    {
      name: 'missing script handlers key',
      mutate: (detail: CandidateDetail) => {
        delete detail.resources.script.handlers;
      },
    },
    {
      name: 'non-SHA script etag',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script.etag = 'not-a-sha';
      },
    },
    {
      name: 'null script',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script = null as unknown as Record<string, unknown>;
      },
    },
    {
      name: 'wrong deployment source',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script.last_deployed_from = 'wrangler';
      },
    },
    {
      name: 'script extra key',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script.unreviewed = false;
      },
    },
    {
      name: 'null exports',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script_runtime.exports = null;
      },
    },
    {
      name: 'present near-miss exports',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script_runtime.exports = {
          default: { type: 'worker' },
        };
      },
    },
    {
      name: 'runtime extra key under exports-absent shape',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script_runtime.unreviewed = false;
      },
    },
    {
      name: 'runtime limits under exports-absent shape',
      mutate: (detail: CandidateDetail) => {
        detail.resources.script_runtime.limits = {};
      },
    },
    {
      name: 'wrong Durable Object namespace id',
      mutate: (detail: CandidateDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMISSION_NOTIFICATIONS'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.namespace_id = 'f'.repeat(32);
      },
    },
    {
      name: 'raw binding extra key',
      mutate: (detail: CandidateDetail) => {
        detail.resources.bindings[0].unreviewed = false;
      },
    },
    {
      name: 'wrong secret binding name',
      mutate: (detail: CandidateDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMIN_TOKEN_SECRET'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.name = 'UNREVIEWED_SECRET';
      },
    },
    {
      name: 'duplicate secret binding',
      mutate: (detail: CandidateDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMIN_TOKEN_SECRET'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        detail.resources.bindings.push(structuredClone(binding));
      },
    },
    {
      name: 'metadata preview drift',
      mutate: (detail: CandidateDetail) => {
        detail.metadata.has_preview = true;
      },
    },
    {
      name: 'metadata author email drift',
      mutate: (detail: CandidateDetail) => {
        detail.metadata.author_email = 'operator@example.invalid';
      },
    },
    {
      name: 'metadata author email non-string',
      mutate: (detail: CandidateDetail) => {
        detail.metadata.author_email = null;
      },
    },
    {
      name: 'metadata missing preview field',
      mutate: (detail: CandidateDetail) => {
        delete detail.metadata.has_preview;
      },
    },
    {
      name: 'metadata source drift',
      mutate: (detail: CandidateDetail) => {
        detail.metadata.source = 'wrangler';
      },
    },
    {
      name: 'metadata extra key',
      mutate: (detail: CandidateDetail) => {
        detail.metadata.modified_on = DFA_VERSION_CREATED_AT;
      },
    },
    {
      name: 'annotation trigger drift',
      mutate: (detail: CandidateDetail) => {
        detail.annotations['workers/triggered_by'] = 'deployment';
      },
    },
    {
      name: 'annotation missing trigger',
      mutate: (detail: CandidateDetail) => {
        delete detail.annotations['workers/triggered_by'];
      },
    },
    {
      name: 'annotation extra key',
      mutate: (detail: CandidateDetail) => {
        detail.annotations['workers/unreviewed'] = 'forbidden';
      },
    },
  ])('rejects an exact candidate GET near miss before deployment: $name', ({
    mutate,
  }) => {
    const { candidate, value } = exactDfaV47Candidate();
    const hostile = structuredClone(candidate) as CandidateDetail;
    mutate(hostile);
    expect(() => projectAuthBridgeNotificationB0CloudflareVersion({
      value: hostile,
      contract: value,
      sourceDigest: RUNTIME_SOURCE_DIGEST,
    })).toThrow(/AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_VERSION_/u);
  });

  it('rejects runtime, binding, and source-policy drift after exact GET shape', () => {
    const value = contract();
    expect(() => projectAuthBridgeNotificationB0CloudflareVersion({
      value: {
        ...rawCandidateVersion(value),
        resources: {
          ...rawCandidateVersion(value).resources,
          script_runtime: {
            ...rawCandidateVersion(value).resources.script_runtime,
            migration_tag: 'v4',
          },
        },
      },
      contract: value,
      sourceDigest: SOURCE_DIGEST,
    })).toThrowError(/VERSION_MISMATCH/u);
    expect(() => projectAuthBridgeNotificationB0CloudflareVersion({
      value: {
        ...rawCandidateVersion(value),
        resources: {
          ...rawCandidateVersion(value).resources,
          bindings: [
            ...rawCandidateVersion(value).resources.bindings,
            { name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text' },
          ],
        },
      },
      contract: value,
      sourceDigest: SOURCE_DIGEST,
    })).toThrowError(/VERSION_BINDING_MISMATCH/u);
  });

  it('ignores retained dfa v47 and releases only the protected successor candidate', async () => {
    const successor = contract(RUNTIME_SOURCE_DIGEST, true, SOURCE_COMMIT);
    const successorDetail = rawCandidateVersion(successor) as CandidateDetail;
    const harness = reviewedV5RuntimeHarness(undefined, 'null', [
      {
        id: DFA_VERSION_ID,
        tag: `notification-b0-${DFA_SOURCE_COMMIT}`,
        message: `Warpkeep notification B0 ${DFA_SOURCE_COMMIT}`,
      },
      {
        id: VERSION_ID,
        tag: successor.versionTag,
        message: successor.versionMessage,
        detail: successorDetail,
      },
    ]);
    const plan = await harness.runtime.prepareUpload(successor);
    const candidates = await harness.runtime.reconcileVersion(successor);
    expect(candidates).toEqual([VERSION_ID]);
    expect(harness.fetchImpl.mock.calls.some(([input]) => (
      String(input).endsWith(`/versions/${DFA_VERSION_ID}`)
    ))).toBe(false);

    await harness.runtime.releaseVersion({
      versionId: candidates[0],
      predecessorDeploymentId: plan.predecessorDeploymentId,
      predecessorVersionId: plan.predecessorVersionId,
      percentage: 100,
      message: successor.versionMessage,
    });
    expect(harness.releasedVersionId()).toBe(VERSION_ID);
    expect(harness.fetchImpl.mock.calls.filter(([, init]) => (
      (init?.method ?? 'GET') === 'POST'
    ))).toHaveLength(1);
    harness.runtime.dispose();
  });

  it('orders one nondeploying candidate upload before attestation and one deployment POST', async () => {
    const value = contract();
    const events: string[] = [];
    let phase: Phase = null;
    let candidateExists = false;
    let live = PREDECESSOR_VERSION_ID;
    const journal = {
      inspect: vi.fn(() => ({
        phase,
        predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
        predecessorVersionId: PREDECESSOR_VERSION_ID,
      })),
      prepared: vi.fn(async () => { events.push('prepared'); phase ??= 'prepared'; }),
      remoteReconcileStarted: vi.fn(async () => {
        events.push('remote-reconcile-started');
        phase = 'remote-reconcile-started';
      }),
      uploadInvoked: vi.fn(async () => {
        events.push('upload-invoked');
        phase = 'upload-invoked';
      }),
      uploaded: vi.fn(async () => { events.push('uploaded'); phase = 'uploaded'; }),
      releaseUncertain: vi.fn(async () => {
        events.push('release-uncertain');
        phase = 'release-uncertain';
      }),
      releaseInvoked: vi.fn(async () => {
        events.push('release-invoked');
        phase = 'release-invoked';
      }),
      completed: vi.fn(async () => { events.push('completed'); phase = 'completed'; }),
    };
    await executeAuthBridgeNotificationB0DeployAdapter({
      contract: value,
      prepareUpload: vi.fn(async () => {
        events.push('prepare-upload');
        return {
          mode: 'version' as const,
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
        };
      }),
      reconcileVersion: vi.fn(async () => {
        events.push('reconcile-version');
        return candidateExists ? [VERSION_ID] : [];
      }),
      uploadVersion: vi.fn(async () => {
        events.push('versions-post');
        candidateExists = true;
        return { versionId: VERSION_ID };
      }),
      inspectVersion: vi.fn(async () => {
        events.push('inspect-version-source-config-migration-bindings');
        return {
          ...value,
          versionId: VERSION_ID,
          createdAt: '2026-08-13T11:58:00.000Z',
        };
      }),
      inspectDeployment: vi.fn(async () => {
        events.push('inspect-deployment');
        return deployment(live);
      }),
      assertPredecessorStable: vi.fn(async () => {
        events.push('assert-predecessor-stable');
      }),
      releaseVersion: vi.fn(async () => {
        events.push('deployments-post');
        live = VERSION_ID;
      }),
      assertCanStartWrite: vi.fn(async write => {
        events.push(`permit-${write}`);
        return true as const;
      }),
      journal,
      clock: () => new Date(NOW),
    });
    expect(events.filter(event => event === 'versions-post')).toHaveLength(1);
    expect(events.filter(event => event === 'deployments-post')).toHaveLength(1);
    expect(events.indexOf('versions-post')).toBeLessThan(
      events.indexOf('inspect-version-source-config-migration-bindings'),
    );
    expect(events.indexOf('assert-predecessor-stable')).toBeLessThan(
      events.indexOf('deployments-post'),
    );
    expect(events.indexOf('release-invoked')).toBeLessThan(
      events.indexOf('deployments-post'),
    );
  });

  it('requires exact fresh postflight identity', () => {
    expect(attestAuthBridgeNotificationB0Deployment({
      value: deployment(),
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: '2026-08-13T11:58:00.000Z',
      now: NOW,
    }).versionId).toBe(VERSION_ID);
    expect(() => attestAuthBridgeNotificationB0Deployment({
      value: { ...deployment(), trafficPercentage: 99 },
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: '2026-08-13T11:58:00.000Z',
      now: NOW,
    })).toThrowError(/POSTFLIGHT_MISMATCH/u);
  });

  it('recovers a lost version-upload response from one exact remote candidate', async () => {
    const harness = recoveryHarness({ uploadLosesResponse: true });
    const result = await executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    );
    expect(result.outcome).toBe('verified');
    expect(harness.events.filter(event => event === 'versions-post')).toHaveLength(1);
    expect(harness.events.filter(event => event === 'deployments-post')).toHaveLength(1);
  });

  it('accepts a lost deployment response only after exact postflight proof', async () => {
    const harness = recoveryHarness({ releaseLosesResponse: true });
    const result = await executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    );
    expect(result.outcome).toBe('verified-after-release-error');
    expect(harness.events.filter(event => event === 'deployments-post')).toHaveLength(1);
  });

  it('never repeats a journaled deployment invocation without remote proof', async () => {
    const harness = recoveryHarness({
      initialPhase: 'release-invoked',
      initialCandidateExists: true,
    });
    await expect(executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    )).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(harness.releaseVersion).not.toHaveBeenCalled();
  });

  it('persists a separate no-replace B0 WAL and repairs an exact crash link', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-journal-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const options = {
      contract: contract(),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      runId: '1001',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
    } as const;
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      operation: async journal => {
        await journal.prepared(contract());
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
          sourceCommit: SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          versionTag: `notification-b0-${SOURCE_COMMIT}`,
        });
      },
    });
    const stateDirectory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const remoteRecord = readdirSync(stateDirectory).find(name =>
      name.endsWith('-remote-reconcile-started.json'));
    expect(remoteRecord).toBeDefined();
    const recordPath = join(stateDirectory, remoteRecord!);
    const body = readFileSync(recordPath, 'utf8');
    expect(body).toContain(PREDECESSOR_DEPLOYMENT_ID);
    expect(body).toContain(PREDECESSOR_VERSION_ID);
    expect(body).not.toContain('PLAYER_CANARY_OWNER_FID');

    const match = /^auth-bridge-notification-b0-deploy-([a-f0-9]{64})-(02)-(remote-reconcile-started)\.json$/u
      .exec(remoteRecord!);
    expect(match).not.toBeNull();
    const temporary = join(
      stateDirectory,
      `.auth-bridge-notification-b0-deploy-${match![1]}-${match![2]}-${match![3]}-${'a'.repeat(24)}.json.tmp`,
    );
    linkSync(recordPath, temporary);
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      runId: '1002',
      runAttempt: 2,
      operation: async journal => {
        expect(journal.inspect().phase).toBe('remote-reconcile-started');
      },
    });
    expect(readdirSync(stateDirectory)).not.toContain(temporary.split('/').at(-1));
  });

  it('retains unresolved dfa upload history beside a distinct successor operation', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-successor-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const repositoryRoot = realpathSync(process.cwd());
    const dfaContract = contract(SOURCE_DIGEST, false, DFA_SOURCE_COMMIT);
    const successorContract = contract(SOURCE_DIGEST, false, SOURCE_COMMIT);
    let dfaOperationId = '';
    await withAuthBridgeNotificationB0DeployJournal({
      contract: dfaContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1101',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: async journal => {
        dfaOperationId = journal.operationId;
        await journal.prepared(dfaContract);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
          sourceCommit: DFA_SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          versionTag: `notification-b0-${DFA_SOURCE_COMMIT}`,
        });
        await journal.uploadInvoked({
          sourceCommit: DFA_SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          uploadMode: 'version',
          versionTag: `notification-b0-${DFA_SOURCE_COMMIT}`,
        });
        expect(journal.inspect().phase).toBe('upload-invoked');
      },
    });

    let successorOperationId = '';
    await withAuthBridgeNotificationB0DeployJournal({
      contract: successorContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1102',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: async journal => {
        successorOperationId = journal.operationId;
        expect(journal.inspect().phase).toBeNull();
        await journal.prepared(successorContract);
        expect(journal.inspect().phase).toBe('prepared');
      },
    });
    expect(successorOperationId).not.toBe(dfaOperationId);

    await withAuthBridgeNotificationB0DeployJournal({
      contract: dfaContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1103',
      runAttempt: 2,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: journal => {
        expect(journal.operationId).toBe(dfaOperationId);
        expect(journal.inspect().phase).toBe('upload-invoked');
      },
    });
    await withAuthBridgeNotificationB0DeployJournal({
      contract: successorContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1104',
      runAttempt: 2,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: journal => {
        expect(journal.operationId).toBe(successorOperationId);
        expect(journal.inspect().phase).toBe('prepared');
      },
    });
  });

  it('blocks a successor opening when retained dfa history is corrupt', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-corrupt-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const repositoryRoot = realpathSync(process.cwd());
    const dfaContract = contract(SOURCE_DIGEST, false, DFA_SOURCE_COMMIT);
    const successorContract = contract(SOURCE_DIGEST, false, SOURCE_COMMIT);
    let dfaOperationId = '';
    await withAuthBridgeNotificationB0DeployJournal({
      contract: dfaContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1201',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: async journal => {
        dfaOperationId = journal.operationId;
        await journal.prepared(dfaContract);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
          sourceCommit: DFA_SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          versionTag: `notification-b0-${DFA_SOURCE_COMMIT}`,
        });
        await journal.uploadInvoked({
          sourceCommit: DFA_SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          uploadMode: 'version',
          versionTag: `notification-b0-${DFA_SOURCE_COMMIT}`,
        });
      },
    });
    const stateDirectory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const dfaPrepared = readdirSync(stateDirectory).find(name => (
      name.includes(dfaOperationId) && name.endsWith('-prepared.json')
    ));
    expect(dfaPrepared).toBeDefined();
    writeFileSync(join(stateDirectory, dfaPrepared!), '{}\n');

    await expect(withAuthBridgeNotificationB0DeployJournal({
      contract: successorContract,
      repositoryRoot,
      reportedHome: home,
      runId: '1202',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
      operation: journal => journal.inspect(),
    })).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_/u,
      ),
    });
  });

  it('retains the kernel lock in Node after the synchronous helper exits', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-lock-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const options = {
      contract: contract(),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      runId: '2001',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
    } as const;
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      operation: async () => {
        await expect(withAuthBridgeNotificationB0DeployJournal({
          ...options,
          runId: '2002',
          runAttempt: 2,
          operation: journal => journal.inspect(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_BUSY',
        });
      },
    });
    await expect(withAuthBridgeNotificationB0DeployJournal({
      ...options,
      runId: '2003',
      runAttempt: 3,
      operation: journal => journal.inspect(),
    })).resolves.toMatchObject({ phase: null });
  });

  it('releases only by closing the retained descriptor or actor process death', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-death-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const repositoryRoot = realpathSync(process.cwd());
    const moduleUrl = new URL(
      '../scripts/auth-bridge-notification-b0-deploy-journal.mjs',
      import.meta.url,
    ).href;
    const childProgram = `
      import { withAuthBridgeNotificationB0DeployJournal } from ${JSON.stringify(moduleUrl)};
      await withAuthBridgeNotificationB0DeployJournal({
        contract: ${JSON.stringify(contract())},
        repositoryRoot: ${JSON.stringify(repositoryRoot)},
        reportedHome: ${JSON.stringify(home)},
        runId: '3001',
        runAttempt: 1,
        processIdentity: 'child-process-start-identity',
        operation: async () => {
          process.stdout.write('READY\\n');
          await new Promise(() => { setInterval(() => {}, 1_000); });
        },
      });
    `;
    const child = spawn(process.execPath, [
      '--input-type=module', '-e', childProgram,
    ], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += String(chunk); });
    const deadline = Date.now() + 10_000;
    while (!output.includes('READY\n')) {
      if (child.exitCode !== null) {
        throw new Error('B0 lock holder exited before acquiring its lock');
      }
      if (Date.now() >= deadline) throw new Error('B0 lock holder did not start');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    const contender = {
      contract: contract(),
      repositoryRoot,
      reportedHome: home,
      runId: '3002',
      runAttempt: 2,
      processIdentity: 'parent-process-start-identity',
      operation: (journal: { inspect: () => unknown }) => journal.inspect(),
    } as const;
    await expect(withAuthBridgeNotificationB0DeployJournal(contender))
      .rejects.toMatchObject({
        code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_BUSY',
      });
    child.kill('SIGKILL');
    await once(child, 'close');
    await expect(withAuthBridgeNotificationB0DeployJournal({
      ...contender,
      runId: '3003',
      runAttempt: 3,
    })).resolves.toMatchObject({ phase: null });
  });
});
