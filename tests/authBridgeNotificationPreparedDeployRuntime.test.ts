// @vitest-environment node

import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  authBridgeNotificationPreparedVersionContract,
  executeAuthBridgeNotificationPreparedDeployAdapter,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  authBridgeNotificationPreparedSourceDigest,
  attestAuthBridgeNotificationPreparedCandidateMultipartMetadata as attestAuthBridgeNotificationPreparedCandidateMultipartMetadataRaw,
  buildAuthBridgeNotificationPreparedWranglerMultipart,
  createAuthBridgeNotificationPreparedCloudflareRuntime as createAuthBridgeNotificationPreparedCloudflareRuntimeRaw,
  createAuthBridgeNotificationPreparedRecoveryRuntimeTestCapability,
  inspectAuthBridgeNotificationPreparedMultipart,
  inspectAuthBridgeNotificationPreparedRecoveryAuthority,
  parseAuthBridgeNotificationPreparedMultipart,
  projectAuthBridgeNotificationPreparedCloudflareVersion as projectAuthBridgeNotificationPreparedCloudflareVersionRaw,
} from '../scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
  resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority,
  resolveExistingAuthBridgeNotificationPreparedDeployJournal,
  writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead,
  withAuthBridgeNotificationPreparedDeployJournal,
} from '../scripts/auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  resolveExistingAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  attestAuthBridgeNotificationPreparedDeployCheckout,
  authBridgeNotificationPreparedDeployTestSeams,
  createAuthBridgeNotificationPreparedGithubWritePermit,
  createAuthBridgeNotificationPreparedRecoveryTestCapability,
  runAuthBridgeNotificationPreparedReadOnlyRecovery,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const OLD_VERSION_ID = '987e6543-e21b-42d3-a456-426614174000';
const NON_PREDECESSOR_VERSION_ID = '887e6543-e21b-42d3-a456-426614174000';
const CONCURRENT_VERSION_ID = '787e6543-e21b-42d3-a456-426614174000';
const OLD_DEPLOYMENT_ID = '323e4567-e89b-42d3-a456-426614174000';
const DRIFTED_DEPLOYMENT_ID = '423e4567-e89b-42d3-a456-426614174000';
const NOW = new Date('2026-08-13T00:00:00.000Z');
const PLAYER_CANARY_OWNER_FID = '4242424242';
const PTR_DATABASE = '9'.repeat(64);
const MAIN_DATABASE =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
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

function createAuthBridgeNotificationPreparedCloudflareRuntime(
  options: Omit<Parameters<
    typeof createAuthBridgeNotificationPreparedCloudflareRuntimeRaw
  >[0], 'ptrSpacetimeDbDatabase'>,
) {
  return createAuthBridgeNotificationPreparedCloudflareRuntimeRaw({
    ...options,
    ptrSpacetimeDbDatabase: PTR_DATABASE,
  });
}

function attestAuthBridgeNotificationPreparedCandidateMultipartMetadata(
  options: Omit<Parameters<
    typeof attestAuthBridgeNotificationPreparedCandidateMultipartMetadataRaw
  >[0], 'ptrSpacetimeDbDatabase'>,
) {
  return attestAuthBridgeNotificationPreparedCandidateMultipartMetadataRaw({
    ...options,
    ptrSpacetimeDbDatabase: PTR_DATABASE,
  });
}

function projectAuthBridgeNotificationPreparedCloudflareVersion(
  options: Omit<Parameters<
    typeof projectAuthBridgeNotificationPreparedCloudflareVersionRaw
  >[0], 'ptrSpacetimeDbDatabase'>,
) {
  return projectAuthBridgeNotificationPreparedCloudflareVersionRaw({
    ...options,
    ptrSpacetimeDbDatabase: PTR_DATABASE,
  });
}
const EXACT_DURABLE_OBJECT_BINDINGS = Object.freeze([
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

function multipart(boundary = 'warpkeep-boundary-v1') {
  const metadata = JSON.stringify({ main_module: 'index.js' });
  return Buffer.from([
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="metadata"\r\n',
    'Content-Type: application/json\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n',
    'Content-Type: application/javascript+module\r\n\r\n',
    'export default { fetch() { return new Response("ok") } };\n',
    `\r\n--${boundary}--\r\n`,
  ].join(''), 'utf8');
}

function uploadMultipart(
  value: ReturnType<typeof contract>,
  boundary = 'warpkeep-boundary-v1',
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
    'export default { fetch() { return new Response("ok") } };\n',
    `\r\n--${boundary}--\r\n`,
  ].join(''), 'utf8');
}

function contentMultipart(boundary = 'warpkeep-boundary-v1') {
  return Buffer.from([
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n',
    'Content-Type: application/javascript+module\r\n\r\n',
    'export default { fetch() { return new Response("ok") } };\n',
    `\r\n--${boundary}--\r\n`,
  ].join(''), 'utf8');
}

function contract(sourceDigest: string) {
  return authBridgeNotificationPreparedVersionContract({
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceDigest,
    beforeModes: BEFORE_MODES,
  }) as Readonly<{
    [key: string]: unknown;
    accountId: string;
    zoneId: string;
    workerName: string;
    versionTag: string;
    versionMessage: string;
    sourceCommit: string;
    sourceDigest: string;
    compatibilityDate: string;
    compatibilityFlags: readonly string[];
    variables: Readonly<Record<string, string>>;
    protectedPlainTextBindingNames: readonly string[];
    secretBindingNames: readonly string[];
    durableObjectBindings: readonly Readonly<{
      name: string;
      className: string;
    }>[];
  }>;
}

type ExactVersionDetail = Record<string, unknown> & {
  annotations: Record<string, unknown>;
  metadata: Record<string, unknown>;
  resources: {
    bindings: Record<string, unknown>[];
    script: Record<string, unknown>;
    script_runtime: Record<string, unknown>;
  };
};

function exactNamespaceId(name: string) {
  const binding = EXACT_DURABLE_OBJECT_BINDINGS.find(item => item.name === name);
  if (binding === undefined) throw new Error(`unknown Durable Object ${name}`);
  return binding.namespaceId;
}

function exactNamedHandlers() {
  return EXACT_NAMED_HANDLERS.map(name => ({ handlers: ['class'], name }));
}

function exactScript(etag: string) {
  return {
    etag,
    handlers: ['fetch'],
    last_deployed_from: 'api',
    named_handlers: exactNamedHandlers(),
  };
}

function exactExports(value: ReturnType<typeof contract>) {
  return {
    default: { type: 'worker' },
    ...Object.fromEntries(value.durableObjectBindings.map(binding => [
      binding.className,
      { type: 'durable-object', storage: 'sqlite', state: 'created' },
    ])),
  };
}

function exactVersionDetail(
  value: ReturnType<typeof contract>,
  {
    id = VERSION_ID,
    number = 2,
    createdAt = '2026-08-12T23:58:00.000Z',
    etag = 'e'.repeat(64),
    secretBindingNames = value.secretBindingNames,
    annotations = {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
      'workers/triggered_by': 'version_upload',
    },
    bridgeSourceCommit = value.sourceCommit,
    ptrDatabase = PTR_DATABASE,
    exports: runtimeExports,
  }: Readonly<{
    id?: string;
    number?: number;
    createdAt?: string;
    etag?: string;
    secretBindingNames?: readonly string[];
    annotations?: Readonly<Record<string, unknown>>;
    bridgeSourceCommit?: string;
    ptrDatabase?: string | null;
    exports?: Readonly<Record<string, unknown>> | null;
  }> = {},
): ExactVersionDetail {
  return {
    id,
    number,
    annotations: { ...annotations },
    metadata: {
      author_email: '',
      author_id: 'e'.repeat(32),
      created_on: createdAt,
      has_preview: false,
      source: 'api',
    },
    resources: {
      bindings: [
        ...Object.entries(value.variables).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text: name === 'WARPKEEP_BRIDGE_SOURCE_COMMIT'
            ? bridgeSourceCommit
            : text,
        })),
        ...(ptrDatabase === null ? [] : [{
          name: 'PTR_SPACETIMEDB_DATABASE',
          type: 'plain_text',
          text: ptrDatabase,
        }]),
        ...secretBindingNames.map(name => ({ name, type: 'secret_text' })),
        ...value.durableObjectBindings.map(binding => ({
          name: binding.name,
          type: 'durable_object_namespace',
          class_name: binding.className,
          namespace_id: exactNamespaceId(binding.name),
        })),
      ],
      script: exactScript(etag),
      script_runtime: {
        compatibility_date: value.compatibilityDate,
        compatibility_flags: value.compatibilityFlags,
        migration_tag: 'v5',
        usage_model: 'standard',
        ...(runtimeExports === undefined ? {} : { exports: runtimeExports }),
      },
    },
  };
}

function version(value = contract('d'.repeat(64))) {
  return {
    ...value,
    versionId: VERSION_ID,
    createdAt: '2026-08-12T23:58:00.000Z',
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
    observedAt: '2026-08-12T23:59:00.000Z',
  };
}

function temporaryHome() {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-deploy-journal-'));
  chmodSync(home, 0o700);
  temporaryDirectories.push(home);
  return home;
}

function journalOptions(home: string, value: Readonly<Record<string, unknown>>) {
  return {
    contract: value,
    repositoryRoot: realpathSync(process.cwd()),
    reportedHome: home,
    runId: '1001',
    runAttempt: 1,
    clock: () => new Date(NOW),
    processIdentity: 'test-process-start-identity',
  } as const;
}

function response(
  body: unknown,
  url: string,
  resultInfo?: unknown,
  nullMessages = false,
) {
  const value = new Response(JSON.stringify({
    success: true,
    errors: nullMessages ? null : [],
    messages: nullMessages ? null : [],
    result: body,
    ...(resultInfo === undefined ? {} : { result_info: resultInfo }),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(value, 'url', { value: url });
  Object.defineProperty(value, 'redirected', { value: false });
  return value;
}

function rejectedResponse(
  code: number,
  url: string,
  status = 400,
  message = 'private provider diagnostic must stay redacted',
) {
  const value = new Response(JSON.stringify({
    success: false,
    errors: [{ code, message }],
    messages: [],
    result: null,
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(value, 'url', { value: url });
  Object.defineProperty(value, 'redirected', { value: false });
  return value;
}

function officialVersionUploadResult(
  value: ReturnType<typeof contract>,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    resources: {
      bindings: [
        ...Object.entries(value.variables).map(([name, text]) => ({
          name,
          text,
          type: 'plain_text',
        })),
        {
          name: 'PTR_SPACETIMEDB_DATABASE',
          text: PTR_DATABASE,
          type: 'plain_text',
        },
        ...value.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
        ...value.durableObjectBindings.map(binding => ({
          name: binding.name,
          type: 'durable_object_namespace',
          class_name: binding.className,
        })),
      ],
      script: {
        etag: 'e'.repeat(64),
        handlers: ['fetch'],
        last_deployed_from: 'api',
        named_handlers: [],
      },
      script_runtime: {
        compatibility_date: value.compatibilityDate,
        compatibility_flags: value.compatibilityFlags,
        exports: {},
        limits: {},
        migration_tag: 'v5',
        usage_model: 'standard',
      },
    },
    id: VERSION_ID,
    exports_reconciliation: {
      created: [],
      deleted: [],
      info: [],
      removable_entries: [],
      renamed: [],
      transfer_pending: [],
      transferred: [],
      updated: [],
      warnings: [],
    },
    metadata: {
      author_email: 'operator@example.com',
      author_id: 'f'.repeat(32),
      created_on: '2026-08-12T23:58:00.000Z',
      hasPreview: false,
      modified_on: '2026-08-12T23:58:00.000Z',
      source: 'api',
    },
    number: 2,
    startup_time_ms: 10,
    ...overrides,
  };
}

function rawResponse(body: unknown, url: string) {
  const value = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(value, 'url', { value: url });
  Object.defineProperty(value, 'redirected', { value: false });
  return value;
}

function multipartResponse(
  body: Buffer,
  url: string,
  contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1',
) {
  const value = new Response(Uint8Array.from(body), {
    status: 200,
    headers: { 'content-type': contentType, 'cf-entrypoint': 'index.js' },
  });
  Object.defineProperty(value, 'url', { value: url });
  Object.defineProperty(value, 'redirected', { value: false });
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('auth-bridge prepared protected environment', () => {
  it('validates and immediately removes the PTR database and owner FID with all credentials', () => {
    const environment: NodeJS.ProcessEnv = {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_RUN_ID: '1001',
      GITHUB_SHA: SOURCE_COMMIT,
      GITHUB_TOKEN: 'github-owner-test-token-value',
      GITHUB_WORKFLOW_REF:
        'ael-dev3/Warpkeep/.github/workflows/notification-bridge-prepared.yml@refs/heads/main',
      WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT_ID,
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
        'cloudflare-owner-test-token-value',
      WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE_ID,
      WARPKEEP_PLAYER_CANARY_OWNER_FID: PLAYER_CANARY_OWNER_FID,
      WARPKEEP_PTR_SPACETIMEDB_DATABASE: PTR_DATABASE,
      WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
    };
    const values = authBridgeNotificationPreparedDeployTestSeams
      .copyAndScrubEnvironment(environment);
    expect(values.WARPKEEP_PLAYER_CANARY_OWNER_FID)
      .toBe(PLAYER_CANARY_OWNER_FID);
    expect(values.WARPKEEP_PTR_SPACETIMEDB_DATABASE).toBe(PTR_DATABASE);
    for (const name of [
      'GITHUB_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_PLAYER_CANARY_OWNER_FID',
      'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    ]) expect(environment).not.toHaveProperty(name);

    for (const invalid of ['0', '01', '-1', '9007199254740992']) {
      const hostile = { ...environment, ...{
        GITHUB_TOKEN: 'github-owner-test-token-value',
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
          'cloudflare-owner-test-token-value',
        WARPKEEP_PLAYER_CANARY_OWNER_FID: invalid,
        WARPKEEP_PTR_SPACETIMEDB_DATABASE: PTR_DATABASE,
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
      } };
      expect(() => authBridgeNotificationPreparedDeployTestSeams
        .copyAndScrubEnvironment(hostile))
        .toThrow(/ENVIRONMENT_INVALID/u);
      expect(hostile).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
      expect(hostile).not.toHaveProperty('WARPKEEP_PTR_SPACETIMEDB_DATABASE');
    }

    for (const invalid of ['warpkeep-ptr', '9'.repeat(63), 'A'.repeat(64), MAIN_DATABASE]) {
      const hostile = {
        ...environment,
        GITHUB_TOKEN: 'github-owner-test-token-value',
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
          'cloudflare-owner-test-token-value',
        WARPKEEP_PLAYER_CANARY_OWNER_FID: PLAYER_CANARY_OWNER_FID,
        WARPKEEP_PTR_SPACETIMEDB_DATABASE: invalid,
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
      };
      expect(() => authBridgeNotificationPreparedDeployTestSeams
        .copyAndScrubEnvironment(hostile)).toThrow(/ENVIRONMENT_INVALID/u);
      expect(hostile).not.toHaveProperty('WARPKEEP_PTR_SPACETIMEDB_DATABASE');
    }
  });

  it('requires and immediately scrubs the GitHub write token for recovery', () => {
    const environment: NodeJS.ProcessEnv = {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_RUN_ID: '1001',
      GITHUB_SHA: SOURCE_COMMIT,
      GITHUB_TOKEN: 'github-recovery-test-token-value',
      GITHUB_WORKFLOW_REF:
        'ael-dev3/Warpkeep/.github/workflows/notification-bridge-prepared.yml@refs/heads/main',
      WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT_ID,
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
        'cloudflare-recovery-test-token-value',
      WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE_ID,
      WARPKEEP_PRODUCTION_ADMIN_TOKEN:
        'production-recovery-test-token-value',
    };
    const validEnvironment = { ...environment };

    const values = authBridgeNotificationPreparedDeployTestSeams
      .copyAndScrubRecoveryEnvironment(environment);
    expect(values.GITHUB_TOKEN).toBe('github-recovery-test-token-value');
    for (const name of [
      'GITHUB_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    ]) expect(environment).not.toHaveProperty(name);

    const missingToken = { ...validEnvironment };
    delete missingToken.GITHUB_TOKEN;
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .copyAndScrubRecoveryEnvironment(missingToken))
      .toThrow(/RECOVERY_ENVIRONMENT_INVALID/u);

    const reusedCredential = {
      ...environment,
      GITHUB_TOKEN: 'shared-recovery-test-token-value',
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
        'shared-recovery-test-token-value',
      WARPKEEP_PRODUCTION_ADMIN_TOKEN:
        'production-recovery-test-token-value',
    };
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .copyAndScrubRecoveryEnvironment(reusedCredential))
      .toThrow(/RECOVERY_ENVIRONMENT_INVALID/u);
    expect(reusedCredential).not.toHaveProperty('GITHUB_TOKEN');
  });
});

describe('auth-bridge prepared durable deployment journal', () => {
  it.skipIf(process.platform === 'win32')(
  'publishes one canonical completed read-only recovery head and adopts its exact bytes', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: SOURCE_COMMIT,
          sourceDigest: value.sourceDigest,
          versionTag: value.versionTag,
        });
        await journal.uploaded(version(value));
        await journal.completed(deployment());
      },
    });
    const prior = resolveExistingAuthBridgeNotificationPreparedDeployJournal({
      repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
    });
    const directory = join(
      home, '.warpkeep', 'private', 'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const oldBytes = new Map(readdirSync(directory).map(name => [
      name, readFileSync(join(directory, name)),
    ] as const));
    const head = {
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      sourceCommit: SOURCE_COMMIT,
      runId: '1002',
      runAttempt: 1,
      priorPreparedReceiptDigest: '1'.repeat(64),
      priorCompletedJournalHeadDigest: prior.journalHeadDigest,
      preparedReceiptDigest: '2'.repeat(64),
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
      completedAt: NOW.toISOString(),
      noDeploy: true,
      outcome: 'verified-read-only-recovery',
    } as const;

    const first = writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead({
      head, repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
      processIdentity: 'test-process-start-identity',
    });
    const before = readFileSync(first.path);
    const second = writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead({
      head, repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
      processIdentity: 'test-process-start-identity',
    });
    expect(second).toEqual({ ...first, result: 'unchanged' });
    expect(readFileSync(first.path)).toEqual(before);
    const resolved = resolveExistingAuthBridgeNotificationPreparedDeployJournal({
      repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
    });
    expect(Object.keys(resolved)).toEqual([
      'journalHeadDigest', 'profile', 'outcome', 'predecessorDigest',
      'runId', 'runAttempt', 'completedAt', 'sourceCommit', 'workerVersionId',
    ]);
    expect(resolved).toMatchObject({
      journalHeadDigest: first.journalHeadDigest,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      outcome: 'verified-read-only-recovery',
      predecessorDigest: prior.journalHeadDigest,
      sourceCommit: SOURCE_COMMIT,
      workerVersionId: VERSION_ID,
    });
    expect(resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority({
      repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
    })).toMatchObject({
      priorPreparedReceiptDigest: head.priorPreparedReceiptDigest,
      preparedReceiptDigest: head.preparedReceiptDigest,
      deploymentId: head.deploymentId,
      ptrDatabaseIdentity: head.ptrDatabaseIdentity,
      ptrBindingDigest: head.ptrBindingDigest,
    });
    for (const [name, bytes] of oldBytes) {
      expect(readFileSync(join(directory, name))).toEqual(bytes);
    }

    for (const invalidPrior of ['8'.repeat(64), prior.predecessorDigest!]) {
      expect(() => writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead({
        head: { ...head, priorCompletedJournalHeadDigest: invalidPrior },
        repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
        processIdentity: 'test-process-start-identity',
      })).toThrow('AUTH_BRIDGE_PREPARED_READ_ONLY_RECOVERY_PREDECESSOR_INVALID');
    }
    expect(readdirSync(directory).filter(name =>
      name.startsWith('auth-bridge-prepared-read-only-recovery-'))).toHaveLength(1);
  });

  it('enumerates one completed existing journal without creating or repairing state', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: SOURCE_COMMIT,
          sourceDigest: value.sourceDigest,
          versionTag: value.versionTag,
        });
        await journal.uploaded(version(value));
        await journal.completed(deployment());
      },
    });
    const directory = join(
      home,
      '.warpkeep',
      'private',
      'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const before = readdirSync(directory).sort();

    const resolved = resolveExistingAuthBridgeNotificationPreparedDeployJournal({
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
    });

    expect(resolved).toMatchObject({
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      outcome: 'verified',
      sourceCommit: SOURCE_COMMIT,
      runId: '1001',
      runAttempt: 1,
      workerVersionId: VERSION_ID,
    });
    expect(resolved).not.toHaveProperty('directory');
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it.skipIf(process.platform === 'win32')(
    'resolves a canonical completed-head-only journal and rejects the missing receipt without changing bytes',
    async () => {
      const home = temporaryHome();
      const value = contract('e'.repeat(64));
      await withAuthBridgeNotificationPreparedDeployJournal({
        ...journalOptions(home, value),
        operation: async journal => {
          await journal.prepared(value);
          await journal.remoteReconcileStarted({
            predecessorDeploymentId: OLD_DEPLOYMENT_ID,
            predecessorVersionId: OLD_VERSION_ID,
            sourceCommit: SOURCE_COMMIT,
            sourceDigest: value.sourceDigest,
            versionTag: value.versionTag,
          });
          await journal.uploaded(version(value));
          await journal.completed(deployment());
        },
      });
      const directory = join(
        home,
        '.warpkeep',
        'private',
        'production-admin-v1',
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
      );
      const before = new Map(readdirSync(directory).sort().map(name => [
        name,
        readFileSync(join(directory, name)),
      ] as const));

      expect(resolveExistingAuthBridgeNotificationPreparedDeployJournal({
        repositoryRoot: realpathSync(process.cwd()),
        reportedHome: home,
      })).toMatchObject({
        profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
        outcome: 'verified',
        sourceCommit: SOURCE_COMMIT,
        runId: '1001',
        runAttempt: 1,
      });
      expect(() => resolveExistingAuthBridgeNotificationPreparedReceipt({
        repositoryRoot: realpathSync(process.cwd()),
        reportedHome: home,
        expectedSourceCommit: SOURCE_COMMIT,
        now: NOW,
      })).toThrow('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
      expect(readdirSync(directory).sort()).toEqual([...before.keys()]);
      for (const [name, bytes] of before) {
        expect(readFileSync(join(directory, name))).toEqual(bytes);
      }
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects two completed recovery-eligible journal heads without changing bytes', async () => {
    const home = temporaryHome();
    for (const [runId, value] of [
      ['1001', contract('d'.repeat(64))],
      ['1002', contract('e'.repeat(64))],
    ] as const) {
      await withAuthBridgeNotificationPreparedDeployJournal({
        ...journalOptions(home, value), runId,
        operation: async journal => {
          await journal.prepared(value);
          await journal.remoteReconcileStarted({
            predecessorDeploymentId: OLD_DEPLOYMENT_ID,
            predecessorVersionId: OLD_VERSION_ID,
            sourceCommit: SOURCE_COMMIT,
            sourceDigest: value.sourceDigest,
            versionTag: value.versionTag,
          });
          await journal.uploaded(version(value));
          await journal.completed(deployment());
        },
      });
    }
    const directory = join(home, '.warpkeep', 'private', 'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD);
    const before = readdirSync(directory).sort();
    expect(() => resolveExistingAuthBridgeNotificationPreparedDeployJournal({
      repositoryRoot: realpathSync(process.cwd()), reportedHome: home,
    })).toThrow(/MULTIPLE|STATE_INVALID|AMBIGUOUS/u);
    expect(readdirSync(directory).sort()).toEqual(before);
    },
  );

  it('persists the exact predecessor without any global-secret phase', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    const uploadMarker = {
      sourceCommit: SOURCE_COMMIT,
      sourceDigest: 'd'.repeat(64),
      uploadMode: 'version',
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    } as const;
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: uploadMarker.sourceCommit,
          sourceDigest: uploadMarker.sourceDigest,
          versionTag: uploadMarker.versionTag,
        });
        await journal.uploadInvoked(uploadMarker);
        expect(journal.inspect().phases).toEqual([
          'prepared',
          'remote-reconcile-started',
          'upload-invoked',
        ]);
        expect(journal.inspect().predecessorDeploymentId).toBe(OLD_DEPLOYMENT_ID);
        expect(journal.inspect().predecessorVersionId).toBe(OLD_VERSION_ID);
      },
    });
    const directory = join(
      home,
      '.warpkeep',
      'private',
      'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const journalText = readdirSync(directory)
      .map(name => readFileSync(join(directory, name), 'utf8'))
      .join('');
    expect(journalText).not.toContain('secret-stage');
    expect(journalText).not.toContain('secret-remove');
    expect(journalText).not.toContain(PLAYER_CANARY_OWNER_FID);
    expect(journalText).not.toContain(PTR_DATABASE);
  });

  it('persists only a fixed upload adjudication reason and never advances it', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    const uploadMarker = {
      sourceCommit: SOURCE_COMMIT,
      sourceDigest: 'd'.repeat(64),
      uploadMode: 'version',
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    } as const;
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: uploadMarker.sourceCommit,
          sourceDigest: uploadMarker.sourceDigest,
          versionTag: uploadMarker.versionTag,
        });
        await journal.uploadInvoked(uploadMarker);
        await expect(journal.uploadAdjudicationRequired({
          reason: 'raw-provider-diagnostic',
        } as never)).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_PAYLOAD_INVALID',
        });
        await journal.uploadAdjudicationRequired({
          reason: 'invalid-upload-response',
        });
        await journal.uploadAdjudicationRequired({
          reason: 'invalid-upload-response',
        });
        await expect(journal.uploadAdjudicationRequired({
          reason: 'definitive-provider-rejection',
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_PAYLOAD_MISMATCH',
        });
        await expect(journal.uploaded(version(value))).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_TRANSITION_INVALID',
        });
        expect(journal.inspect()).toMatchObject({
          phase: 'upload-adjudication-required',
          uploadAdjudicationReason: 'invalid-upload-response',
          phases: [
            'prepared',
            'remote-reconcile-started',
            'upload-invoked',
            'upload-adjudication-required',
          ],
        });
      },
    });

    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 2,
      operation: async journal => {
        expect(journal.inspect()).toMatchObject({
          phase: 'upload-adjudication-required',
          uploadAdjudicationReason: 'invalid-upload-response',
        });
        await expect(journal.completed(deployment())).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_TRANSITION_INVALID',
        });
      },
    });
  });

  it('retains first-entry-only upload/release invocation markers across runs', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    const uploadMarker = {
      sourceCommit: SOURCE_COMMIT,
      sourceDigest: 'd'.repeat(64),
      uploadMode: 'version',
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    };
    const releaseMarker = {
      sourceCommit: SOURCE_COMMIT,
      versionId: VERSION_ID,
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    };
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: uploadMarker.sourceCommit,
          sourceDigest: uploadMarker.sourceDigest,
          versionTag: uploadMarker.versionTag,
        });
        await journal.uploadInvoked(uploadMarker);
        expect(journal.inspect().phases).toEqual([
          'prepared',
          'remote-reconcile-started',
          'upload-invoked',
        ]);
        expect(journal.inspect().uploadMode).toBe('version');
      },
    });

    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 2,
      operation: async journal => {
        await journal.prepared(value);
        await expect(journal.uploadInvoked(uploadMarker)).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_ALREADY_INVOKED',
          deploymentMayHaveChanged: true,
        });
        await journal.uploaded(version(value));
        await journal.releaseUncertain(releaseMarker);
        await journal.releaseInvoked(releaseMarker);
      },
    });

    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 3,
      operation: async journal => {
        await journal.prepared(value);
        await journal.uploaded(version(value));
        await journal.releaseUncertain(releaseMarker);
        await expect(journal.releaseInvoked(releaseMarker)).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_ALREADY_INVOKED',
          deploymentMayHaveChanged: true,
        });
        await journal.completed(deployment());
        expect(journal.inspect().phase).toBe('completed');
      },
    });

    const directory = join(
      home,
      '.warpkeep',
      'private',
      'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
    );
    expect(lstatSync(directory).mode & 0o7777).toBe(0o700);
    for (const name of readdirSync(directory)) {
      const status = lstatSync(join(directory, name));
      expect(status.isFile()).toBe(true);
      expect(status.isSymbolicLink()).toBe(false);
      expect(status.mode & 0o7777).toBe(0o600);
      expect(status.nlink).toBe(1);
      expect(readFileSync(join(directory, name), 'utf8').endsWith('\n')).toBe(true);
    }
  });

  it('clamps a backward clock without publishing an unreadable history', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    const uploadMarker = {
      sourceCommit: SOURCE_COMMIT,
      sourceDigest: 'd'.repeat(64),
      uploadMode: 'version',
      versionTag: `notification-prepared-${SOURCE_COMMIT}`,
    };
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      clock: () => new Date('2026-08-13T00:00:00.000Z'),
      operation: journal => journal.prepared(value),
    });
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 2,
      clock: () => new Date('2026-08-12T23:59:59.999Z'),
      operation: async journal => {
        await journal.prepared(value);
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
          sourceCommit: uploadMarker.sourceCommit,
          sourceDigest: uploadMarker.sourceDigest,
          versionTag: uploadMarker.versionTag,
        });
        await journal.uploadInvoked(uploadMarker);
        expect(journal.inspect().phase).toBe('upload-invoked');
      },
    });
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 3,
      clock: () => new Date('2026-08-13T00:00:01.000Z'),
      operation: journal => {
        expect(journal.inspect().phases).toEqual([
          'prepared',
          'remote-reconcile-started',
          'upload-invoked',
        ]);
      },
    });
  });

  it('repairs an exact two-link crash pair and rejects foreign state entries', async () => {
    const home = temporaryHome();
    const value = contract('d'.repeat(64));
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      operation: journal => journal.prepared(value),
    });
    const directory = join(
      home,
      '.warpkeep',
      'private',
      'production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const record = readdirSync(directory).find(name => name.endsWith('-prepared.json'))!;
    const temporary = `.${record.slice(0, -5)}-${'e'.repeat(24)}.json.tmp`;
    linkSync(join(directory, record), join(directory, temporary));
    expect(lstatSync(join(directory, record)).nlink).toBe(2);

    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 2,
      operation: async journal => {
        await journal.prepared(value);
        expect(journal.inspect().phase).toBe('prepared');
      },
    });
    expect(readdirSync(directory)).not.toContain(temporary);
    expect(lstatSync(join(directory, record)).nlink).toBe(1);

    writeFileSync(join(directory, 'foreign-state'), 'forbidden', { mode: 0o600 });
    await expect(withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 3,
      operation: () => undefined,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_DIRECTORY_INVALID',
    });
  });
});

describe('auth-bridge prepared Cloudflare runtime', () => {
  function createRecoveryWritePermitHarness({
    failPermitCall,
  }: Readonly<{ failPermitCall?: number }> = {}) {
    const liveAttestation = {
      schemaVersion: 1,
      profile: 'warpkeep-admission-notification-bridge-v1',
      bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      notificationClientCount: 1,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    } as const;
    const priorReceipt = {
      schemaVersion: 1,
      kind: 'warpkeep-auth-bridge-notification-prepared-v1',
      bridgeOrigin: 'https://auth.warpkeep.com',
      bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      notificationClientCount: 1,
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      publicAuthEnabledBefore: true,
      publicAuthEnabledAfter: true,
      accessExpectedFidRequiredBefore: false,
      accessExpectedFidRequiredAfter: false,
      hermesExecutionApproved: false,
      pagesPresentationEnabled: false,
      liveAttestationDigest: '1'.repeat(64),
      preparedAt: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
    } as const;
    const priorPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(priorReceipt);
    const priorAuthority = {
      receipt: priorReceipt,
      preparedReceiptDigest: priorPublication.receiptDigest,
      completedJournalHeadDigest: 'a'.repeat(64),
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
    } as const;
    let currentJournal: Record<string, unknown> = {
      schemaVersion: 1,
      journalHeadDigest: 'a'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      outcome: 'verified',
      predecessorDigest: 'b'.repeat(64),
      runId: '1001',
      runAttempt: 1,
      completedAt: '2026-08-11T00:01:00.000Z',
      sourceCommit: SOURCE_COMMIT,
      workerVersionId: VERSION_ID,
    };
    const inspection = {
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
      oldestObservedAt: NOW.toISOString(),
      liveAttestation,
    } as const;
    const events: string[] = [];
    let persistedReceipt: Record<string, unknown> | undefined;
    let permitCalls = 0;
    let permitActive = false;
    const recordFinalReread = (name: string) => {
      if (permitActive) events.push(`reread:${name}`);
    };
    const permit = vi.fn(async (phase: string) => {
      events.push(`permit:${phase}`);
      permitCalls += 1;
      permitActive = true;
      if (permitCalls === failPermitCall) {
        throw new Error('recovery permit denied');
      }
      return true;
    });
    const createGithubWritePermit = vi.fn(() => permit);
    const writeReceipt = vi.fn(({ receipt }: { receipt: Record<string, unknown> }) => {
      events.push('writeReceipt');
      permitActive = false;
      persistedReceipt = receipt;
      return {
        receiptDigest: createHash('sha256')
          .update(`${JSON.stringify(receipt)}\n`)
          .digest('hex'),
      };
    });
    const readReceipt = vi.fn(() => {
      recordFinalReread('receipt');
      return persistedReceipt;
    });
    const writeHead = vi.fn(({ head }: { head: Record<string, unknown> }) => {
      events.push('writeHead');
      permitActive = false;
      const journalHeadDigest = createHash('sha256')
        .update(`${JSON.stringify(head)}\n`)
        .digest('hex');
      currentJournal = {
        ...head,
        journalHeadDigest,
        predecessorDigest: head.priorCompletedJournalHeadDigest,
      };
      return { journalHeadDigest };
    });
    const createAuthorityChain = vi.fn(() => {
      events.push('createAuthorityChain');
      permitActive = false;
      return { result: 'installed' };
    });
    const unused = vi.fn(() => {
      throw new Error('unused recovery seam was called');
    });
    const runtime = {
      attestCheckout: vi.fn(({ repositoryRoot }) => repositoryRoot),
      copyEnvironment: vi.fn(() => ({
        GITHUB_SHA: SOURCE_COMMIT,
        GITHUB_RUN_ID: '1001',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_TOKEN: 'github-recovery-test-token-value',
        WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT_ID,
        WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE_ID,
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
          'cloudflare-recovery-test-token-value',
        WARPKEEP_PRODUCTION_ADMIN_TOKEN:
          'production-recovery-test-token-value',
      })),
      clock: vi.fn(() => NOW),
      home: vi.fn(() => 'C:\\recovery-home'),
      createPrivateState: vi.fn(() => Object.freeze({})),
      createGithubWritePermit,
      resolveJournal: vi.fn(() => {
        recordFinalReread('journal');
        return currentJournal;
      }),
      resolvePrior: vi.fn(() => {
        recordFinalReread('prior');
        return priorAuthority;
      }),
      inspect: vi.fn(async () => {
        if (permitActive) events.push('inspectAfterPermit');
        return inspection;
      }),
      resolveFreshReceipt: unused,
      verifyReceipt: unused,
      resolveExpiredReceipt: vi.fn(() => {
        recordFinalReread('priorReceipt');
        return {
          receipt: priorReceipt,
          receiptDigest: priorPublication.receiptDigest,
        };
      }),
      resolvePendingReceipt: vi.fn(() => null),
      writeReceipt,
      readReceipt,
      writeHead,
      createAuthorityChain,
    };
    const run = async () => {
      const previousSourceCommit = process.env.GITHUB_SHA;
      process.env.GITHUB_SHA = SOURCE_COMMIT;
      try {
        return await authBridgeNotificationPreparedDeployTestSeams
          .withProductionRecoveryRuntime({
            testOnlyCapability:
              createAuthBridgeNotificationPreparedRecoveryTestCapability(),
            runtime: runtime as never,
            operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
          });
      } finally {
        if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
        else process.env.GITHUB_SHA = previousSourceCommit;
      }
    };
    return {
      run,
      events,
      permit,
      createGithubWritePermit,
      writeReceipt,
      writeHead,
      createAuthorityChain,
      runtime,
    };
  }

  it('sandwiches each durable recovery write between two permits and a final inspection', async () => {
    const successful = createRecoveryWritePermitHarness();

    await expect(successful.run()).resolves.toEqual({
      outcome: 'verified-read-only-recovery',
    });
    expect(successful.createGithubWritePermit).toHaveBeenCalledExactlyOnceWith({
      githubToken: 'github-recovery-test-token-value',
      sourceCommit: SOURCE_COMMIT,
      runId: '1001',
      runAttempt: '1',
      repositoryRoot: expect.any(String),
      fetchImpl: expect.any(Function),
      attestCheckout: expect.any(Function),
    });
    expect(successful.permit).toHaveBeenCalledTimes(6);
    for (let call = 1; call <= 6; call += 1) {
      expect(successful.permit).toHaveBeenNthCalledWith(call, 'recovery');
    }
    expect(successful.events).toEqual([
      'permit:recovery', 'inspectAfterPermit',
      'permit:recovery',
      'reread:prior', 'reread:priorReceipt',
      'writeReceipt',
      'permit:recovery', 'inspectAfterPermit',
      'permit:recovery',
      'reread:prior', 'reread:priorReceipt',
      'reread:receipt', 'writeHead',
      'permit:recovery', 'inspectAfterPermit',
      'permit:recovery',
      'reread:prior', 'reread:priorReceipt',
      'reread:receipt', 'reread:journal', 'reread:journal',
      'createAuthorityChain',
    ]);

    for (const [failedCall, expectedEvents, writes] of [
      [1, ['permit:recovery'], [0, 0, 0]],
      [2, [
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
      ], [0, 0, 0]],
      [3, [
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'writeReceipt', 'permit:recovery',
      ], [1, 0, 0]],
      [4, [
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'writeReceipt',
        'permit:recovery', 'inspectAfterPermit', 'permit:recovery',
      ], [1, 0, 0]],
      [5, [
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'writeReceipt',
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'reread:receipt', 'writeHead', 'permit:recovery',
      ], [1, 1, 0]],
      [6, [
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'writeReceipt',
        'permit:recovery', 'inspectAfterPermit',
        'permit:recovery',
        'reread:prior', 'reread:priorReceipt',
        'reread:receipt', 'writeHead',
        'permit:recovery', 'inspectAfterPermit', 'permit:recovery',
      ], [1, 1, 0]],
    ] as const) {
      const denied = createRecoveryWritePermitHarness({ failPermitCall: failedCall });
      await expect(denied.run()).rejects.toThrow('recovery permit denied');
      expect(denied.events).toEqual(expectedEvents);
      expect(denied.writeReceipt).toHaveBeenCalledTimes(writes[0]);
      expect(denied.writeHead).toHaveBeenCalledTimes(writes[1]);
      expect(denied.createAuthorityChain).toHaveBeenCalledTimes(writes[2]);
    }
  });

  it('stops generic recovery when the real GitHub permit sees main move after final inspection', async () => {
    const recovery = createRecoveryWritePermitHarness();
    let protectedBranchCommit = SOURCE_COMMIT;
    const originalInspect = recovery.runtime.inspect;
    let inspections = 0;
    recovery.runtime.inspect = vi.fn(async () => {
      const result = await originalInspect();
      inspections += 1;
      if (inspections === 2) protectedBranchCommit = 'd'.repeat(40);
      return result;
    });
    (recovery.runtime as unknown as {
      createGithubWritePermit:
        typeof createAuthBridgeNotificationPreparedGithubWritePermit;
    }).createGithubWritePermit = createAuthBridgeNotificationPreparedGithubWritePermit;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/branches/main')) return rawResponse({
        name: 'main',
        protected: true,
        commit: { sha: protectedBranchCommit },
      }, url);
      if (url.endsWith('/actions/runs/1001')) return rawResponse({
        id: 1001,
        run_attempt: 1,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        head_branch: 'main',
        head_sha: SOURCE_COMMIT,
        path: '.github/workflows/notification-bridge-prepared.yml',
        repository: { full_name: 'ael-dev3/Warpkeep' },
      }, url);
      throw new Error('unexpected GitHub recovery permit request');
    });
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await expect(recovery.run()).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED',
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(inspections).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(recovery.writeReceipt).not.toHaveBeenCalled();
    expect(recovery.writeHead).not.toHaveBeenCalled();
    expect(recovery.createAuthorityChain).not.toHaveBeenCalled();
  });

  it('runs the actual zero-argument production adoption path without mutation or repair', async () => {
    const liveAttestation = {
      schemaVersion: 1,
      profile: 'warpkeep-admission-notification-bridge-v1',
      bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      notificationClientCount: 1,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    } as const;
    const receipt = {
      schemaVersion: 1,
      kind: 'warpkeep-auth-bridge-notification-prepared-v1',
      bridgeOrigin: 'https://auth.warpkeep.com',
      bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      notificationClientCount: 1,
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      publicAuthEnabledBefore: true,
      publicAuthEnabledAfter: true,
      accessExpectedFidRequiredBefore: false,
      accessExpectedFidRequiredAfter: false,
      hermesExecutionApproved: false,
      pagesPresentationEnabled: false,
      liveAttestationDigest:
        canonicalAuthBridgeReleaseAttestationDigest(liveAttestation),
      preparedAt: NOW.toISOString(),
      expiresAt: '2026-08-14T00:00:00.000Z',
    } as const;
    const publication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    const journal = {
      schemaVersion: 1,
      journalHeadDigest: 'a'.repeat(64),
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      outcome: 'verified-read-only-recovery',
      predecessorDigest: 'b'.repeat(64),
      runId: '1002', runAttempt: 1, completedAt: NOW.toISOString(),
      sourceCommit: SOURCE_COMMIT, workerVersionId: VERSION_ID,
      priorPreparedReceiptDigest: 'c'.repeat(64),
      preparedReceiptDigest: publication.receiptDigest,
      deploymentId: OLD_DEPLOYMENT_ID,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      bridgeSourceCommit: SOURCE_COMMIT,
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
      noDeploy: true,
    } as const;
    const prior = {
      value: {
        preparedReceiptDigest: publication.receiptDigest,
        completedJournalHeadDigest: journal.journalHeadDigest,
        deploymentId: OLD_DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE_COMMIT,
        ptrDatabaseIdentity: PTR_DATABASE,
        ptrBindingDigest: '3'.repeat(64),
        expiresAt: receipt.expiresAt,
      },
      receipt,
      phase: 'g002',
    } as const;
    const inspection = {
      deploymentId: OLD_DEPLOYMENT_ID, workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT, ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
      liveAttestation,
      oldestObservedAt: NOW.toISOString(),
    } as const;
    const forbidden = vi.fn(() => {
      throw new Error('production mutation/repair seam was called');
    });
    const privateState = Object.freeze({
      list: forbidden, read: forbidden, write: forbidden,
      deploy: forbidden, upload: forbidden, release: forbidden,
      publish: forbidden, import: forbidden, reducer: forbidden,
      repair: forbidden, mkdir: forbidden, chmod: forbidden, fsync: forbidden,
    });
    const recoveryPermit = vi.fn(async () => true);
    const createGithubWritePermit = vi.fn(() => recoveryPermit);
    const runtime = {
      attestCheckout: vi.fn(({ repositoryRoot }) => repositoryRoot),
      copyEnvironment: vi.fn(() => ({
        GITHUB_SHA: SOURCE_COMMIT, GITHUB_RUN_ID: '1002',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_TOKEN: 'github-adoption-test-token-value',
        WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT_ID,
        WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE_ID,
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: 'x'.repeat(24),
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'y'.repeat(24),
      })),
      clock: vi.fn(() => NOW),
      home: vi.fn(() => 'C:\\production-home'),
      createPrivateState: vi.fn(() => privateState),
      createGithubWritePermit,
      resolveJournal: vi.fn(() => journal),
      resolvePrior: vi.fn(() => prior),
      inspect: vi.fn(async () => inspection),
      resolveFreshReceipt: vi.fn(() => ({
        receipt, receiptDigest: publication.receiptDigest,
      })),
      verifyReceipt: vi.fn(async () => ({ receipt, liveAttestation })),
      resolveExpiredReceipt: forbidden,
      resolvePendingReceipt: forbidden,
      writeReceipt: forbidden,
      readReceipt: forbidden,
      writeHead: forbidden,
      createAuthorityChain: forbidden,
    };
    const previousSourceCommit = process.env.GITHUB_SHA;
    const sourceDriftPermitFactory = vi.fn(() => {
      throw new Error('source-drift permit factory was called');
    });
    const sourceDriftWriteReceipt = vi.fn(() => {
      throw new Error('source-drift receipt writer was called');
    });
    const sourceDriftWriteHead = vi.fn(() => {
      throw new Error('source-drift head writer was called');
    });
    const sourceDriftAuthorityChain = vi.fn(() => {
      throw new Error('source-drift authority writer was called');
    });
    const postCheckoutSourceDriftRuntime = {
      ...runtime,
      copyEnvironment: vi.fn(() => ({
        GITHUB_SHA: 'd'.repeat(40), GITHUB_RUN_ID: '1002',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_TOKEN: 'github-adoption-test-token-value',
        WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT_ID,
        WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE_ID,
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: 'x'.repeat(24),
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'y'.repeat(24),
      })),
      createGithubWritePermit: sourceDriftPermitFactory,
      writeReceipt: sourceDriftWriteReceipt,
      writeHead: sourceDriftWriteHead,
      createAuthorityChain: sourceDriftAuthorityChain,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: postCheckoutSourceDriftRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_SOURCE_COMMIT_INVALID',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(sourceDriftPermitFactory).not.toHaveBeenCalled();
    expect(sourceDriftWriteReceipt).not.toHaveBeenCalled();
    expect(sourceDriftWriteHead).not.toHaveBeenCalled();
    expect(sourceDriftAuthorityChain).not.toHaveBeenCalled();

    process.env.GITHUB_SHA = SOURCE_COMMIT;
    let output;
    try {
      output = await authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
        testOnlyCapability:
          createAuthBridgeNotificationPreparedRecoveryTestCapability(),
        runtime: runtime as never,
        operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(output).toEqual({ outcome: 'verified-read-only-recovery' });
    expect(forbidden).not.toHaveBeenCalled();
    expect(createGithubWritePermit).not.toHaveBeenCalled();
    expect(recoveryPermit).not.toHaveBeenCalled();

    const completedTupleDriftRuntime = {
      ...runtime,
      inspect: vi.fn(async () => ({
        ...inspection,
        deploymentId: DRIFTED_DEPLOYMENT_ID,
        ptrDatabaseIdentity: '8'.repeat(64),
        ptrBindingDigest: '9'.repeat(64),
        liveAttestation: {
          ...liveAttestation,
          publicAuthEnabled: false,
        },
      })),
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: completedTupleDriftRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(forbidden).not.toHaveBeenCalled();

    let adoptionJournal: Record<string, unknown> = journal;
    let adoptionInspectionRound = 0;
    const adoptionRaceRuntime = {
      ...runtime,
      resolveJournal: vi.fn(() => adoptionJournal),
      inspect: vi.fn(async () => {
        adoptionInspectionRound += 1;
        if (adoptionInspectionRound === 2) {
          adoptionJournal = { ...journal, runAttempt: 2 };
        }
        return inspection;
      }),
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: adoptionRaceRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }

    const pendingHeadPrior = {
      ...prior,
      value: {
        ...prior.value,
        preparedReceiptDigest: journal.priorPreparedReceiptDigest,
        completedJournalHeadDigest: journal.predecessorDigest,
        expiresAt: '2026-08-12T00:00:00.000Z',
      },
      pendingRecoveryHead: journal,
    };
    const finishPendingHead = vi.fn(() => ({ result: 'installed' }));
    const headRuntime = {
      ...runtime,
      resolvePrior: vi.fn(() => pendingHeadPrior),
      createAuthorityChain: finishPendingHead,
    };
    createGithubWritePermit.mockClear();
    recoveryPermit.mockClear();
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: headRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).resolves.toEqual({ outcome: 'verified-read-only-recovery' });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(finishPendingHead).toHaveBeenCalledOnce();
    expect(createGithubWritePermit).toHaveBeenCalledOnce();
    expect(recoveryPermit).toHaveBeenCalledTimes(2);
    expect(recoveryPermit).toHaveBeenNthCalledWith(1, 'recovery');
    expect(recoveryPermit).toHaveBeenNthCalledWith(2, 'recovery');
    expect(forbidden).not.toHaveBeenCalled();

    let pendingPermitGranted = false;
    const pendingPostPermitDriftChain = vi.fn(() => {
      throw new Error('authority chain was written after post-permit drift');
    });
    const pendingPostPermitDriftRuntime = {
      ...headRuntime,
      createGithubWritePermit: vi.fn(() => vi.fn(async () => {
        pendingPermitGranted = true;
        return true;
      })),
      inspect: vi.fn(async () => pendingPermitGranted
        ? {
          ...inspection,
          liveAttestation: {
            ...liveAttestation,
            publicAuthEnabled: false,
          },
        }
        : inspection),
      createAuthorityChain: pendingPostPermitDriftChain,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: pendingPostPermitDriftRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(pendingPostPermitDriftRuntime.inspect).toHaveBeenCalledTimes(2);
    expect(pendingPostPermitDriftChain).not.toHaveBeenCalled();

    const pendingAuthorityDenied = vi.fn(() => {
      throw new Error('pending authority chain was written after denial');
    });
    let deniedPendingPermitCalls = 0;
    const deniedPendingPermit = vi.fn(async () => {
      deniedPendingPermitCalls += 1;
      if (deniedPendingPermitCalls === 2) {
        throw new Error('pending authority permit denied');
      }
      return true;
    });
    const deniedPendingPermitFactory = vi.fn(() => deniedPendingPermit);
    const deniedPendingHeadRuntime = {
      ...headRuntime,
      createGithubWritePermit: deniedPendingPermitFactory,
      createAuthorityChain: pendingAuthorityDenied,
    };
    deniedPendingHeadRuntime.inspect.mockClear();
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: deniedPendingHeadRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toThrow('pending authority permit denied');
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(deniedPendingPermitFactory).toHaveBeenCalledOnce();
    expect(deniedPendingHeadRuntime.inspect).toHaveBeenCalledTimes(2);
    expect(deniedPendingPermit).toHaveBeenCalledTimes(2);
    expect(deniedPendingPermit).toHaveBeenNthCalledWith(1, 'recovery');
    expect(deniedPendingPermit).toHaveBeenNthCalledWith(2, 'recovery');
    expect(pendingAuthorityDenied).not.toHaveBeenCalled();

    let pendingJournalAfterPermit: Record<string, unknown> = journal;
    const permitThenReplacePendingHead = vi.fn(async () => {
      pendingJournalAfterPermit = {
        ...journal,
        deploymentId: DRIFTED_DEPLOYMENT_ID,
      };
      return true;
    });
    const stalePendingAuthority = vi.fn(() => {
      throw new Error('authority chain was written after pending head replacement');
    });
    const postPermitPendingRaceRuntime = {
      ...headRuntime,
      createGithubWritePermit: vi.fn(() => permitThenReplacePendingHead),
      resolveJournal: vi.fn(() => pendingJournalAfterPermit),
      createAuthorityChain: stalePendingAuthority,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: postPermitPendingRaceRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(permitThenReplacePendingHead).toHaveBeenCalledTimes(2);
    expect(permitThenReplacePendingHead).toHaveBeenNthCalledWith(
      1,
      'recovery',
    );
    expect(permitThenReplacePendingHead).toHaveBeenNthCalledWith(
      2,
      'recovery',
    );
    expect(stalePendingAuthority).not.toHaveBeenCalled();

    const resumedAuthority = vi.fn(() => ({ result: 'installed' }));
    const later = new Date('2026-08-13T23:55:00.000Z');
    const laterInspection = {
      ...inspection,
      controlPlaneAttestationDigest: '8'.repeat(64),
      publicAttestationDigest: '9'.repeat(64),
      privateAttestationDigest: 'a'.repeat(64),
      ptrBindingAttestationDigest: 'b'.repeat(64),
      oldestObservedAt: later.toISOString(),
    };
    const laterHeadRuntime = {
      ...headRuntime,
      clock: vi.fn(() => later),
      inspect: vi.fn(async () => laterInspection),
      createAuthorityChain: resumedAuthority,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: laterHeadRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).resolves.toEqual({ outcome: 'verified-read-only-recovery' });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(resumedAuthority).toHaveBeenCalledOnce();
    expect(resumedAuthority).toHaveBeenCalledWith(expect.objectContaining({
      inspection: expect.objectContaining({
        controlPlaneAttestationDigest: journal.controlPlaneAttestationDigest,
        publicAttestationDigest: journal.publicAttestationDigest,
        privateAttestationDigest: journal.privateAttestationDigest,
        ptrBindingAttestationDigest: journal.ptrBindingAttestationDigest,
      }),
    }));
    expect(forbidden).not.toHaveBeenCalled();

    const semanticDriftAuthority = vi.fn(() => ({ result: 'installed' }));
    const semanticDriftInspection = {
      ...inspection,
      liveAttestation: {
        ...liveAttestation,
        publicAuthEnabled: false,
      },
    };
    const semanticDriftRuntime = {
      ...headRuntime,
      inspect: vi.fn(async () => semanticDriftInspection),
      createAuthorityChain: semanticDriftAuthority,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: semanticDriftRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(semanticDriftAuthority).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();

    let pendingJournal: Record<string, unknown> = journal;
    let pendingInspectionRound = 0;
    const forbiddenPendingRaceChain = vi.fn(() => {
      throw new Error('chain write after pending head replacement');
    });
    const pendingRaceRuntime = {
      ...headRuntime,
      resolveJournal: vi.fn(() => pendingJournal),
      inspect: vi.fn(async () => {
        pendingInspectionRound += 1;
        if (pendingInspectionRound === 2) {
          pendingJournal = { ...journal, deploymentId: DRIFTED_DEPLOYMENT_ID };
        }
        return inspection;
      }),
      createAuthorityChain: forbiddenPendingRaceChain,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: pendingRaceRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
        });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(forbiddenPendingRaceChain).not.toHaveBeenCalled();

    const oldReceipt = {
      ...receipt,
      liveAttestationDigest: '1'.repeat(64),
      preparedAt: '2026-08-10T00:00:00.000Z',
      expiresAt: '2026-08-11T00:00:00.000Z',
    };
    const oldPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(oldReceipt);
    expect(canonicalAuthBridgeReleaseAttestationDigest(
      inspection.liveAttestation,
    )).toBe(receipt.liveAttestationDigest);
    const oldComparable = { ...oldReceipt } as Record<string, unknown>;
    const recoveredComparable = { ...receipt } as Record<string, unknown>;
    for (const key of ['liveAttestationDigest', 'preparedAt', 'expiresAt']) {
      delete oldComparable[key];
      delete recoveredComparable[key];
    }
    expect(recoveredComparable).toEqual(oldComparable);
    const normalJournal = {
      journalHeadDigest: 'b'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      outcome: 'verified', predecessorDigest: '0'.repeat(64),
      runId: '1001', runAttempt: 1,
      completedAt: '2026-08-10T00:01:00.000Z',
      sourceCommit: SOURCE_COMMIT, workerVersionId: VERSION_ID,
    };
    const oldPrior = {
      value: {
        preparedReceiptDigest: oldPublication.receiptDigest,
        completedJournalHeadDigest: normalJournal.journalHeadDigest,
        deploymentId: OLD_DEPLOYMENT_ID, workerVersionId: VERSION_ID,
        ptrDatabaseIdentity: PTR_DATABASE, ptrBindingDigest: '3'.repeat(64),
      },
      receipt: oldReceipt,
    };
    let currentJournal: Record<string, unknown> = normalJournal;
    const installHead = vi.fn(({ head }) => {
      const journalHeadDigest = createHash('sha256')
        .update(`${JSON.stringify(head)}\n`).digest('hex');
      currentJournal = {
        ...head,
        journalHeadDigest,
        predecessorDigest: head.priorCompletedJournalHeadDigest,
      };
      return { journalHeadDigest };
    });
    let installedChainInput: unknown;
    const installChain = vi.fn((input: unknown) => {
      installedChainInput = input;
      return { result: 'installed' };
    });
    const receiptOnlyRuntime = {
      ...runtime,
      resolveJournal: vi.fn(() => currentJournal),
      resolvePrior: vi.fn(() => oldPrior),
      resolveFreshReceipt: forbidden,
      resolveExpiredReceipt: vi.fn(() => ({
        receipt: oldReceipt, receiptDigest: oldPublication.receiptDigest,
      })),
      resolvePendingReceipt: vi.fn(() => ({
        receipt, receiptDigest: publication.receiptDigest,
      })),
      writeHead: installHead,
      createAuthorityChain: installChain,
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: receiptOnlyRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).resolves.toEqual({ outcome: 'verified-read-only-recovery' });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    expect(installHead).toHaveBeenCalledOnce();
    expect(installChain).toHaveBeenCalledOnce();
    expect(forbidden).not.toHaveBeenCalled();

    currentJournal = normalJournal;
    installHead.mockClear();
    installChain.mockClear();
    let advancingClockSample = 0;
    const advancingRuntime = {
      ...receiptOnlyRuntime,
      clock: vi.fn(() => new Date(
        NOW.getTime() + advancingClockSample++ * 1_000,
      )),
      inspect: vi.fn(async ({ now }: { now: Date }) => {
        const observedAt = now.toISOString();
        const attestationDigest = (lane: string) => createHash('sha256')
          .update(`${lane}:${observedAt}`).digest('hex');
        return {
          ...inspection,
          controlPlaneAttestationDigest: attestationDigest('control'),
          publicAttestationDigest: attestationDigest('public'),
          privateAttestationDigest: attestationDigest('private'),
          ptrBindingAttestationDigest: attestationDigest('ptr'),
          oldestObservedAt: observedAt,
        };
      }),
    };
    process.env.GITHUB_SHA = SOURCE_COMMIT;
    try {
      await expect(authBridgeNotificationPreparedDeployTestSeams
        .withProductionRecoveryRuntime({
          testOnlyCapability:
            createAuthBridgeNotificationPreparedRecoveryTestCapability(),
          runtime: advancingRuntime as never,
          operation: () => runAuthBridgeNotificationPreparedReadOnlyRecovery(),
        })).resolves.toEqual({ outcome: 'verified-read-only-recovery' });
    } finally {
      if (previousSourceCommit === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSourceCommit;
    }
    const advancingChainInput = installedChainInput as {
      inspection: Record<string, unknown>;
      journal: Record<string, unknown>;
    };
    for (const key of [
      'controlPlaneAttestationDigest', 'publicAttestationDigest',
      'privateAttestationDigest', 'ptrBindingAttestationDigest',
    ]) {
      expect(advancingChainInput.inspection[key])
        .toBe(advancingChainInput.journal[key]);
    }
    expect(advancingRuntime.inspect.mock.calls.length).toBeGreaterThan(2);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('completes read-only recovery without any deploy or publisher callback', async () => {
    const mutation = vi.fn(() => { throw new Error('mutation forbidden'); });
    const priorReceipt = {
      schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
      bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      notificationClientCount: 1, notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
      accessExpectedFidRequiredBefore: false,
      accessExpectedFidRequiredAfter: false,
      hermesExecutionApproved: false, pagesPresentationEnabled: false,
      liveAttestationDigest: '1'.repeat(64),
      preparedAt: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
    } as const;
    const priorReceiptDigest = createHash('sha256')
      .update(`${JSON.stringify(priorReceipt)}\n`)
      .digest('hex');
    const priorAuthority = {
      receipt: priorReceipt,
      preparedReceiptDigest: priorReceiptDigest,
      completedJournalHeadDigest: 'a'.repeat(64),
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
    } as const;
    const resolvePriorAuthority = vi.fn(() => priorAuthority);
    const resolvePriorReceipt = vi.fn(() => ({
      receipt: priorReceipt, receiptDigest: priorReceiptDigest,
    }));
    let persistedReceipt: Record<string, unknown> | undefined;
    let persistedHead: Record<string, unknown> | undefined;
    const writeReceipt = vi.fn(({ receipt }) => {
      persistedReceipt = receipt;
      return {
        path: '/fixed/private/receipt.json',
        receiptDigest: createHash('sha256')
          .update(`${JSON.stringify(receipt)}\n`).digest('hex'),
      };
    });
    const readWrittenReceipt = vi.fn(() => persistedReceipt);
    const writeHead = vi.fn(input => {
      persistedHead = input.head;
      return {
        path: '/fixed/private/head.json',
        journalHeadDigest: createHash('sha256')
          .update(`${JSON.stringify(input.head)}\n`).digest('hex'),
      };
    });
    const resolveWrittenHead = vi.fn(() => ({
      ...persistedHead,
      journalHeadDigest: createHash('sha256')
        .update(`${JSON.stringify(persistedHead)}\n`).digest('hex'),
      predecessorDigest: persistedHead?.priorCompletedJournalHeadDigest,
    }));
    const createRecoveryAuthorityChain = vi.fn(() => ({ result: 'installed' }));
    const recoveryOptions = {
      testOnlyCapability:
        createAuthBridgeNotificationPreparedRecoveryTestCapability(),
      sourceCommit: SOURCE_COMMIT,
      runId: '1002',
      runAttempt: 1,
      clock: () => NOW,
      resolvePriorAuthority,
      resolvePriorReceipt,
      resolvePendingReceipt: vi.fn(() => null),
      inspectRecoveryAuthority: async () => ({
        deploymentId: OLD_DEPLOYMENT_ID, workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE_COMMIT, ptrDatabaseIdentity: PTR_DATABASE,
        ptrBindingDigest: '3'.repeat(64),
        controlPlaneAttestationDigest: '4'.repeat(64),
        publicAttestationDigest: '5'.repeat(64),
        privateAttestationDigest: '6'.repeat(64),
        ptrBindingAttestationDigest: '7'.repeat(64),
        oldestObservedAt: NOW.toISOString(),
        liveAttestation: {
          schemaVersion: 1,
          profile: 'warpkeep-admission-notification-bridge-v1',
          bridgeSourceCommit: SOURCE_COMMIT,
          notificationDeliveryEnabled: false,
          notificationTransportConfigured: true,
          admissionNotificationStoreConfigured: true,
          notificationClientCount: 1,
          notificationDeliveryContractDigest:
            AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
          publicAuthEnabled: true,
          accessExpectedFidRequired: false,
        },
      }),
      assertCanStartWrite: vi.fn(async () => true),
      writeReceipt,
      readWrittenReceipt,
      writeHead,
      resolveWrittenHead,
      createRecoveryAuthorityChain,
    } as const;
    const output = await runAuthBridgeNotificationPreparedReadOnlyRecovery(
      recoveryOptions as never,
    );
    expect(output).toEqual({ outcome: 'verified-read-only-recovery' });
    expect(resolvePriorAuthority.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(resolvePriorReceipt.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(readWrittenReceipt).toHaveBeenCalledTimes(3);
    expect(resolveWrittenHead).toHaveBeenCalledTimes(2);
    expect(createRecoveryAuthorityChain).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
    expect(JSON.stringify(output)).not.toContain(PTR_DATABASE);
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      testOnlyCapability:
        createAuthBridgeNotificationPreparedRecoveryTestCapability(),
      sourceCommit: SOURCE_COMMIT,
      runId: '1002', runAttempt: 1, clock: () => NOW,
      deploy: mutation,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID',
    });
    let inspectionRound = 0;
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      inspectRecoveryAuthority: async () => ({
        deploymentId: inspectionRound++ === 0
          ? OLD_DEPLOYMENT_ID : DRIFTED_DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE_COMMIT,
        ptrDatabaseIdentity: PTR_DATABASE,
        ptrBindingDigest: '3'.repeat(64),
        controlPlaneAttestationDigest: '4'.repeat(64),
        publicAttestationDigest: '5'.repeat(64),
        privateAttestationDigest: '6'.repeat(64),
        ptrBindingAttestationDigest: '7'.repeat(64),
        oldestObservedAt: NOW.toISOString(),
        liveAttestation: {
          schemaVersion: 1,
          profile: 'warpkeep-admission-notification-bridge-v1',
          bridgeSourceCommit: SOURCE_COMMIT,
          notificationDeliveryEnabled: false,
          notificationTransportConfigured: true,
          admissionNotificationStoreConfigured: true,
          notificationClientCount: 1,
          notificationDeliveryContractDigest:
            AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
          publicAuthEnabled: true,
          accessExpectedFidRequired: false,
        },
      }),
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT',
    });
    const times = [
      NOW,
      new Date(NOW.getTime() + 6 * 60 * 1_000),
    ];
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      clock: () => times.shift() ?? times.at(-1)!,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE',
    });
    let slowNow = NOW;
    let slowInspectionRound = 0;
    const forbiddenSlowWrite = vi.fn(() => {
      throw new Error('write after stale inspection');
    });
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      clock: () => slowNow,
      inspectRecoveryAuthority: async (input: unknown) => {
        const inspected = await (recoveryOptions.inspectRecoveryAuthority as any)(
          input,
        );
        slowInspectionRound += 1;
        if (slowInspectionRound === 2) {
          slowNow = new Date(NOW.getTime() + 6 * 60 * 1_000);
        }
        return inspected;
      },
      writeReceipt: forbiddenSlowWrite,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE',
    });
    expect(forbiddenSlowWrite).not.toHaveBeenCalled();
    let nearBoundaryNow = NOW;
    let nearBoundaryRound = 0;
    const forbiddenNearBoundaryWrite = vi.fn(() => {
      throw new Error('write after attestation freshness boundary');
    });
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      clock: () => nearBoundaryNow,
      inspectRecoveryAuthority: async (input: unknown) => {
        const inspected = await (recoveryOptions.inspectRecoveryAuthority as any)(
          input,
        );
        nearBoundaryRound += 1;
        if (nearBoundaryRound === 2) {
          nearBoundaryNow = new Date(NOW.getTime() + 2_000);
        }
        return {
          ...inspected,
          oldestObservedAt: new Date(
            NOW.getTime() - (5 * 60 * 1_000 - 1_000),
          ).toISOString(),
        };
      },
      writeReceipt: forbiddenNearBoundaryWrite,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_STALE',
    });
    expect(forbiddenNearBoundaryWrite).not.toHaveBeenCalled();

    let raceReceiptRead = 0;
    const raceHeadWrite = vi.fn(() => ({ journalHeadDigest: '0'.repeat(64) }));
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      readWrittenReceipt: vi.fn(() => {
        raceReceiptRead += 1;
        return raceReceiptRead === 1
          ? persistedReceipt
          : { ...persistedReceipt, expiresAt: '2026-08-13T12:00:00.000Z' };
      }),
      writeHead: raceHeadWrite,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_RECEIPT_WRITE_INVALID',
    });
    expect(raceHeadWrite).not.toHaveBeenCalled();

    let raceHeadRead = 0;
    const forbiddenRaceChain = vi.fn(() => {
      throw new Error('chain write after head replacement');
    });
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      resolveWrittenHead: vi.fn(() => {
        raceHeadRead += 1;
        const resolved = {
          ...persistedHead,
          journalHeadDigest: createHash('sha256')
            .update(`${JSON.stringify(persistedHead)}\n`).digest('hex'),
          predecessorDigest: persistedHead?.priorCompletedJournalHeadDigest,
        };
        return raceHeadRead === 1
          ? resolved
          : { ...resolved, deploymentId: DRIFTED_DEPLOYMENT_ID };
      }),
      createRecoveryAuthorityChain: forbiddenRaceChain,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID',
    });
    expect(forbiddenRaceChain).not.toHaveBeenCalled();
    let removedReceiptRead = 0;
    const forbiddenRemovedReceiptHead = vi.fn(() => {
      throw new Error('head write after receipt removal');
    });
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      readWrittenReceipt: vi.fn(() => {
        removedReceiptRead += 1;
        return removedReceiptRead === 1 ? persistedReceipt : undefined;
      }),
      writeHead: forbiddenRemovedReceiptHead,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECEIPT_SHAPE_INVALID',
    });
    expect(forbiddenRemovedReceiptHead).not.toHaveBeenCalled();

    let removedHeadRead = 0;
    const forbiddenRemovedHeadChain = vi.fn(() => {
      throw new Error('chain write after head removal');
    });
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...recoveryOptions,
      resolveWrittenHead: vi.fn(() => {
        removedHeadRead += 1;
        if (removedHeadRead > 1) return undefined;
        return {
          ...persistedHead,
          journalHeadDigest: createHash('sha256')
            .update(`${JSON.stringify(persistedHead)}\n`).digest('hex'),
          predecessorDigest: persistedHead?.priorCompletedJournalHeadDigest,
        };
      }),
      createRecoveryAuthorityChain: forbiddenRemovedHeadChain,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID',
    });
    expect(forbiddenRemovedHeadChain).not.toHaveBeenCalled();
    let crashReceipt: Record<string, unknown> | undefined;
    let crashReceiptDigest: string | undefined;
    const crashAfterReceiptWrite = vi.fn(({ receipt }) => {
      crashReceipt = receipt;
      crashReceiptDigest = createHash('sha256')
        .update(`${JSON.stringify(receipt)}\n`).digest('hex');
      throw new Error('simulated-crash-after-receipt');
    });
    const receiptCrashOptions = {
      ...recoveryOptions,
      writeReceipt: crashAfterReceiptWrite,
      resolvePendingReceipt: vi.fn(() => crashReceipt === undefined ? null : ({
        receipt: crashReceipt,
        receiptDigest: crashReceiptDigest,
      })),
    };
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery(
      receiptCrashOptions as never,
    )).rejects.toThrow('simulated-crash-after-receipt');
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      ...receiptCrashOptions,
      clock: () => new Date(NOW.getTime() + 60 * 1_000),
    } as never)).resolves.toEqual({
      outcome: 'verified-read-only-recovery',
    });
    expect(crashAfterReceiptWrite).toHaveBeenCalledOnce();
    await expect(runAuthBridgeNotificationPreparedReadOnlyRecovery({
      environment: {},
      deploy: mutation,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID',
    });
  });

  it('derives the first recovery binding only from one canonical old private chain', () => {
    const preparedAt = '2026-08-11T00:00:00.000Z';
    const expiresAt = '2026-08-12T00:00:00.000Z';
    const receipt = {
      schemaVersion: 1,
      kind: 'warpkeep-auth-bridge-notification-prepared-v1',
      bridgeOrigin: 'https://auth.warpkeep.com',
      bridgeSourceCommit: SOURCE_COMMIT,
      notificationDeliveryContractDigest:
        AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
      notificationClientCount: 1,
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: true,
      admissionNotificationStoreConfigured: true,
      publicAuthEnabledBefore: true,
      publicAuthEnabledAfter: true,
      accessExpectedFidRequiredBefore: false,
      accessExpectedFidRequiredAfter: false,
      hermesExecutionApproved: false,
      pagesPresentationEnabled: false,
      liveAttestationDigest: '1'.repeat(64),
      preparedAt,
      expiresAt,
    } as const;
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
    const receiptDigest = createHash('sha256').update(receiptBytes).digest('hex');
    const recordDigest = (value: object) => createHash('sha256')
      .update('warpkeep.sealed-realms.auth-bridge-import-authority-record.v1\n')
      .update(`${JSON.stringify(value)}\n`)
      .digest('hex');
    const authority = {
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-auth-bridge-import-authority-v1',
      recordType: 'deploymentAuthority',
      sourceCommit: SOURCE_COMMIT,
      previousRecordDigest: null,
      preparedReceiptBodyBase64: receiptBytes.toString('base64'),
      preparedReceiptDigest: receiptDigest,
      preparedAt,
      expiresAt,
      completedJournalHeadDigest: 'a'.repeat(64),
      completedJournalProfile:
        'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      completedJournalOutcome: 'verified',
      completedJournalPredecessorDigest: 'b'.repeat(64),
      runId: '1001',
      runAttempt: 1,
      completedAt: '2026-08-11T00:01:00.000Z',
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
      recordedAt: '2026-08-11T00:02:00.000Z',
    } as const;
    const probe = Buffer.from(JSON.stringify({
      error: {
        code: 'admission_requests_suspended',
        message: 'New admission requests are temporarily suspended.',
      },
    }));
    const gate = {
      schemaVersion: 1,
      profile: authority.profile,
      recordType: 'g002Gate',
      sourceCommit: SOURCE_COMMIT,
      previousRecordDigest: recordDigest(authority),
      deploymentAuthorityDigest: recordDigest(authority),
      lane: 'g002',
      supersedesGateDigest: null,
      confirmationDigest: '8'.repeat(64),
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      deploymentAttestationDigest: '9'.repeat(64),
      bindingAttestationDigest: 'a'.repeat(64),
      postNoRedirect: true,
      postContentType: 'application/json; charset=utf-8',
      postAccessControlAllowOrigin: 'https://warpkeep.com',
      postProbeStatus: 503,
      postProbeBodyBase64: probe.toString('base64'),
      postProbeDigest: createHash('sha256').update(probe).digest('hex'),
      optionsNoRedirect: true,
      optionsContentType: 'application/json; charset=utf-8',
      optionsAccessControlAllowOrigin: 'https://warpkeep.com',
      optionsProbeStatus: 503,
      optionsProbeBodyBase64: probe.toString('base64'),
      optionsProbeDigest: createHash('sha256').update(probe).digest('hex'),
      observedAt: '2026-08-11T00:03:00.000Z',
      nonce: 'b'.repeat(64),
    } as const;
    const cross = {
      schemaVersion: 1,
      profile: authority.profile,
      recordType: 'g002ImportAuthorityCrossLink',
      sourceCommit: SOURCE_COMMIT,
      previousRecordDigest: recordDigest(gate),
      deploymentAuthorityDigest: recordDigest(authority),
      lane: 'g002',
      consumedGateDigest: recordDigest(gate),
      realmImportReceiptDigest: 'c'.repeat(64),
      outcome: 'applied',
      linkedAt: '2026-08-11T00:04:00.000Z',
    } as const;
    const bytes = Buffer.from(
      `${JSON.stringify(authority)}\n${JSON.stringify(gate)}\n${JSON.stringify(cross)}\n`,
    );
    const chainDigest = createHash('sha256').update(JSON.stringify([
      authority.profile, SOURCE_COMMIT, receiptDigest,
      authority.completedJournalHeadDigest, OLD_DEPLOYMENT_ID, VERSION_ID,
      authority.ptrBindingDigest,
    ])).digest('hex');
    const privateState = {
      list: vi.fn(({ relativeDirectory }) => relativeDirectory === 'bridge'
        ? [`auth-bridge-import-authority-${chainDigest}.jsonl`, 'locks']
        : []),
      read: vi.fn(() => Buffer.from(bytes)),
    };
    const result = authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState,
        sourceCommit: SOURCE_COMMIT,
        journal: {
          profile: authority.completedJournalProfile,
          outcome: authority.completedJournalOutcome,
          predecessorDigest: authority.completedJournalPredecessorDigest,
          runId: authority.runId,
          runAttempt: authority.runAttempt,
          completedAt: authority.completedAt,
          journalHeadDigest: authority.completedJournalHeadDigest,
          sourceCommit: SOURCE_COMMIT,
          workerVersionId: VERSION_ID,
        },
        now: NOW,
      });
    expect(result.value).toMatchObject({
      deploymentId: OLD_DEPLOYMENT_ID,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
    });
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState,
        sourceCommit: SOURCE_COMMIT,
        journal: {
          profile: authority.completedJournalProfile,
          outcome: authority.completedJournalOutcome,
          predecessorDigest: authority.completedJournalPredecessorDigest,
          runId: '9999',
          runAttempt: authority.runAttempt,
          completedAt: authority.completedAt,
          journalHeadDigest: authority.completedJournalHeadDigest,
          sourceCommit: SOURCE_COMMIT,
          workerVersionId: VERSION_ID,
        },
        now: NOW,
      })).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_AMBIGUOUS');
    const pendingHeadJournal = {
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      outcome: 'verified-read-only-recovery',
      predecessorDigest: authority.completedJournalHeadDigest,
      journalHeadDigest: 'd'.repeat(64),
      priorPreparedReceiptDigest: receiptDigest,
      preparedReceiptDigest: 'e'.repeat(64),
      runId: '1002',
      runAttempt: 1,
      completedAt: NOW.toISOString(),
      sourceCommit: SOURCE_COMMIT,
      workerVersionId: VERSION_ID,
      deploymentId: OLD_DEPLOYMENT_ID,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: authority.ptrBindingDigest,
    } as const;
    expect(authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState,
        sourceCommit: SOURCE_COMMIT,
        journal: pendingHeadJournal,
        now: NOW,
      })).toMatchObject({
        pendingRecoveryHead: pendingHeadJournal,
        value: { completedJournalHeadDigest: authority.completedJournalHeadDigest },
      });
    expect(privateState.read).toHaveBeenCalledWith({
      root: 'runtime',
      relativePath: `bridge/auth-bridge-import-authority-${chainDigest}.jsonl`,
    });
    const parse = authBridgeNotificationPreparedDeployTestSeams
      .parseRecoveryAuthorityChain;
    const body = (...records: object[]) => Buffer.from(
      `${records.map(record => JSON.stringify(record)).join('\n')}\n`,
    );
    const forkedCross = {
      ...cross,
      previousRecordDigest: recordDigest(authority),
    };
    const swappedGate = {
      ...gate,
      recordType: 'ptrGate',
      lane: 'ptr',
    };
    for (const hostile of [
      body(authority),
      body(authority, cross),
      body(authority, cross, gate),
      body(authority, gate, forkedCross),
      body(authority, swappedGate),
    ]) {
      expect(() => parse(hostile, SOURCE_COMMIT)).toThrow(
        'AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID',
      );
    }
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState: {
          ...privateState,
          list: ({ relativeDirectory }: { relativeDirectory: string }) =>
            relativeDirectory === 'bridge'
              ? [`auth-bridge-import-authority-${'f'.repeat(64)}.jsonl`]
              : [],
        },
        sourceCommit: SOURCE_COMMIT,
        journal: {
          profile: authority.completedJournalProfile,
          journalHeadDigest: authority.completedJournalHeadDigest,
          sourceCommit: SOURCE_COMMIT,
          workerVersionId: VERSION_ID,
        },
        now: NOW,
      })).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState: {
          ...privateState,
          list: ({ relativeDirectory }: { relativeDirectory: string }) =>
            relativeDirectory === 'bridge'
              ? [`auth-bridge-import-authority-${chainDigest}.jsonl`, 'locks']
              : ['active.lock'],
        },
        sourceCommit: SOURCE_COMMIT,
        journal: {
          profile: authority.completedJournalProfile,
          journalHeadDigest: authority.completedJournalHeadDigest,
          sourceCommit: SOURCE_COMMIT,
          workerVersionId: VERSION_ID,
        },
        now: NOW,
      })).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_BUSY');
    expect(() => authBridgeNotificationPreparedDeployTestSeams
      .resolveRecoveryPriorAuthority({
        privateState,
        sourceCommit: SOURCE_COMMIT,
        journal: {
          profile: authority.completedJournalProfile,
          journalHeadDigest: authority.completedJournalHeadDigest,
          sourceCommit: SOURCE_COMMIT,
          workerVersionId: VERSION_ID,
        },
        now: new Date('2026-08-11T12:00:00.000Z'),
      })).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_AMBIGUOUS');

    const recoveredReceipt = {
      ...receipt,
      preparedAt: NOW.toISOString(),
      expiresAt: '2026-08-14T00:00:00.000Z',
      liveAttestationDigest: 'd'.repeat(64),
    } as const;
    const recoveredReceiptBytes = Buffer.from(`${JSON.stringify(recoveredReceipt)}\n`);
    const recoveredReceiptDigest = createHash('sha256')
      .update(recoveredReceiptBytes).digest('hex');
    const recoveredHead = {
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      sourceCommit: SOURCE_COMMIT,
      runId: '1002',
      runAttempt: 1,
      priorPreparedReceiptDigest: receiptDigest,
      priorCompletedJournalHeadDigest: authority.completedJournalHeadDigest,
      preparedReceiptDigest: recoveredReceiptDigest,
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: authority.ptrBindingDigest,
      controlPlaneAttestationDigest: 'e'.repeat(64),
      publicAttestationDigest: 'f'.repeat(64),
      privateAttestationDigest: '0'.repeat(64),
      ptrBindingAttestationDigest: '1'.repeat(64),
      completedAt: NOW.toISOString(),
      noDeploy: true,
      outcome: 'verified-read-only-recovery',
    } as const;
    const recoveredHeadDigest = createHash('sha256')
      .update(`${JSON.stringify(recoveredHead)}\n`).digest('hex');
    const files = new Map<string, Buffer>([[
      `bridge/auth-bridge-import-authority-${chainDigest}.jsonl`,
      Buffer.from(bytes),
    ]]);
    let crashAfterPersist = true;
    const durableState = {
      list: vi.fn(({ relativeDirectory }: { relativeDirectory: string }) => {
        if (relativeDirectory === 'bridge/locks') return [];
        if (relativeDirectory !== 'bridge') return [];
        return [...files.keys()].map(path => path.slice('bridge/'.length));
      }),
      read: vi.fn(({ relativePath }: { relativePath: string }) => {
        const value = files.get(relativePath);
        if (value === undefined) throw new Error('missing');
        return Buffer.from(value);
      }),
      write: vi.fn(({ relativePath, bytes: written }: {
        relativePath: string; bytes: Uint8Array;
      }) => {
        if (files.has(relativePath)) {
          throw Object.assign(new Error('exists'), {
            code: 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS',
          });
        }
        files.set(relativePath, Buffer.from(written));
        if (crashAfterPersist) {
          crashAfterPersist = false;
          throw new Error('simulated-crash-after-durable-write');
        }
        return { byteLength: written.byteLength };
      }),
    };
    const createRecoveryChain = authBridgeNotificationPreparedDeployTestSeams
      .createRecoveryAuthorityChain;
    const recoveryInput = {
      testOnlyCapability:
        createAuthBridgeNotificationPreparedRecoveryTestCapability(),
      privateState: durableState,
      sourceCommit: SOURCE_COMMIT,
      priorAuthority: result,
      receiptPublication: {
        receipt: recoveredReceipt,
        receiptBytesBase64: recoveredReceiptBytes.toString('base64'),
        receiptDigest: recoveredReceiptDigest,
      },
      journal: {
        ...recoveredHead,
        journalHeadDigest: recoveredHeadDigest,
        predecessorDigest: recoveredHead.priorCompletedJournalHeadDigest,
      },
      inspection: {
        deploymentId: OLD_DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE_COMMIT,
        ptrDatabaseIdentity: PTR_DATABASE,
        ptrBindingDigest: authority.ptrBindingDigest,
        controlPlaneAttestationDigest: recoveredHead.controlPlaneAttestationDigest,
        publicAttestationDigest: recoveredHead.publicAttestationDigest,
        privateAttestationDigest: recoveredHead.privateAttestationDigest,
        ptrBindingAttestationDigest: recoveredHead.ptrBindingAttestationDigest,
      },
      recordedAt: NOW,
    };
    expect(() => createRecoveryChain(recoveryInput))
      .toThrow('simulated-crash-after-durable-write');
    const oldAfterCrash = files.get(
      `bridge/auth-bridge-import-authority-${chainDigest}.jsonl`,
    );
    expect(oldAfterCrash).toEqual(bytes);
    const adopted = createRecoveryChain(recoveryInput);
    expect(adopted.result).toBe('unchanged');
    const { testOnlyCapability: _testOnlyCapability, ...unbrandedInput } =
      recoveryInput;
    expect(() => createRecoveryChain(unbrandedInput as never)).toThrow(
      'AUTH_BRIDGE_PREPARED_RECOVERY_TEST_ONLY_FORBIDDEN',
    );
    expect(files.size).toBe(2);
    const recoveredPath = [...files.keys()].find(path =>
      path !== `bridge/auth-bridge-import-authority-${chainDigest}.jsonl`)!;
    const recoveredRecord = JSON.parse(
      files.get(recoveredPath)!.toString('utf8'),
    );
    expect(Object.keys(recoveredRecord)).toEqual(
      Object.keys(authority),
    );
    expect(recoveredRecord).toMatchObject({
      profile: authority.profile,
      recordType: 'deploymentAuthority',
      previousRecordDigest: null,
      preparedReceiptDigest: recoveredReceiptDigest,
      completedJournalHeadDigest: recoveredHeadDigest,
      completedJournalProfile:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE,
      completedJournalOutcome: 'verified-read-only-recovery',
      completedJournalPredecessorDigest: authority.completedJournalHeadDigest,
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: authority.ptrBindingDigest,
      recordedAt: NOW.toISOString(),
    });
    files.set(recoveredPath, Buffer.from(
      `${JSON.stringify({ ...recoveredRecord, deploymentId: DRIFTED_DEPLOYMENT_ID })}\n`,
    ));
    expect(() => createRecoveryChain(recoveryInput)).toThrow(
      'AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT',
    );
  });

  it('inspects one unchanged latest deployment with four independently fresh attestations', async () => {
    const observedAt = NOW.toISOString();
    const expected = {
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
    } as const;
    const calls: string[] = [];
    const result = await inspectAuthBridgeNotificationPreparedRecoveryAuthority({
      testOnlyCapability:
        createAuthBridgeNotificationPreparedRecoveryRuntimeTestCapability(),
      expected,
      now: NOW,
      enumerateDeployments: async () => {
        calls.push('deployments');
        return [{ deploymentId: OLD_DEPLOYMENT_ID, workerVersionId: VERSION_ID }];
      },
      enumerateDeployableVersions: async () => {
        calls.push('deployable');
        return [{ workerVersionId: VERSION_ID }];
      },
      inspectVersion: async () => {
        calls.push('version');
        return {
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE_COMMIT,
          ptrDatabaseIdentity: PTR_DATABASE,
          ptrBindingDigest: '3'.repeat(64),
        };
      },
      inspectControlPlaneAttestation: async () => ({
        deploymentId: OLD_DEPLOYMENT_ID, workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE_COMMIT, observedAt, digest: '4'.repeat(64),
      }),
      inspectPublicAttestation: async () => ({
        bridgeSourceCommit: SOURCE_COMMIT, observedAt, digest: '5'.repeat(64),
        liveAttestation: {
          schemaVersion: 1,
          profile: 'warpkeep-admission-notification-bridge-v1',
          bridgeSourceCommit: SOURCE_COMMIT,
          notificationDeliveryEnabled: false,
          notificationTransportConfigured: true,
          admissionNotificationStoreConfigured: true,
          notificationClientCount: 1,
          notificationDeliveryContractDigest:
            AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
          publicAuthEnabled: true,
          accessExpectedFidRequired: false,
        },
      }),
      inspectPrivateAttestation: async () => ({
        bridgeSourceCommit: SOURCE_COMMIT, ptrDatabaseIdentity: PTR_DATABASE,
        ptrBindingDigest: '3'.repeat(64), observedAt, digest: '6'.repeat(64),
      }),
      inspectPtrBindingAttestation: async () => ({
        ptrDatabaseIdentity: PTR_DATABASE, ptrBindingDigest: '3'.repeat(64),
        observedAt, digest: '7'.repeat(64),
      }),
    });

    expect(calls).toEqual(['deployments', 'deployable', 'version']);
    expect(result).toMatchObject({
      deploymentId: OLD_DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE_COMMIT,
      ptrDatabaseIdentity: PTR_DATABASE,
      ptrBindingDigest: '3'.repeat(64),
      controlPlaneAttestationDigest: '4'.repeat(64),
      publicAttestationDigest: '5'.repeat(64),
      privateAttestationDigest: '6'.repeat(64),
      ptrBindingAttestationDigest: '7'.repeat(64),
    });

    await expect(inspectAuthBridgeNotificationPreparedRecoveryAuthority({
      testOnlyCapability:
        createAuthBridgeNotificationPreparedRecoveryRuntimeTestCapability(),
      expected: { ...expected, ptrBindingDigest: '8'.repeat(64) },
      now: NOW,
      enumerateDeployments: async () => [],
      enumerateDeployableVersions: async () => [],
      inspectVersion: async () => ({}),
      inspectControlPlaneAttestation: async () => ({}),
      inspectPublicAttestation: async () => ({}),
      inspectPrivateAttestation: async () => ({}),
      inspectPtrBindingAttestation: async () => ({}),
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID',
    });
  });

  it('attests and resolves the exact pinned Wrangler from the pnpm layout', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const commandRunner = vi.fn(async (input: Readonly<{
      executable: string;
      args: readonly string[];
    }>) => {
      const outputIndex = input.args.indexOf('--outfile');
      expect(outputIndex).toBeGreaterThan(0);
      writeFileSync(input.args[outputIndex + 1], body);
      expect(input.args[0]).toContain(
        '/node_modules/.pnpm/wrangler@4.110.0_',
      );
      expect(input.args).toContain('--dry-run');
      expect(JSON.stringify(input)).not.toContain(PTR_DATABASE);
      return {
        code: 0,
        signal: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    });
    const serviceRoot = realpathSync(join(process.cwd(), 'services/auth-bridge'));
    const result = await buildAuthBridgeNotificationPreparedWranglerMultipart({
      contract: value,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot,
      nodeExecutable: process.execPath,
      wranglerEntrypoint: join(serviceRoot, 'node_modules/wrangler/bin/wrangler.js'),
      commandRunner,
    });
    expect(result.sourceDigest).toBe(digest);
    expect(commandRunner).toHaveBeenCalledOnce();
    result.body.fill(0);
  });

  it('hashes all module bytes independent of multipart boundary', () => {
    const first = multipart('boundary-one');
    const second = multipart('boundary-two');
    const inspectedFirst = inspectAuthBridgeNotificationPreparedMultipart(
      first,
      'multipart/form-data; boundary=boundary-one',
    );
    const inspectedSecond = inspectAuthBridgeNotificationPreparedMultipart(
      second,
      'multipart/form-data; boundary=boundary-two',
    );
    expect(inspectedFirst.sourceDigest).toBe(inspectedSecond.sourceDigest);
    expect(parseAuthBridgeNotificationPreparedMultipart(
      first,
      'multipart/form-data; boundary=boundary-one',
    )).toHaveLength(2);
    expect(authBridgeNotificationPreparedSourceDigest([
      {
        name: 'index.js',
        contentType: 'application/javascript+module',
        bytes: Buffer.from('different'),
      },
    ])).not.toBe(inspectedFirst.sourceDigest);
    expect(authBridgeNotificationPreparedSourceDigest([{
      field: 'renamed-field',
      name: 'index.js',
      contentType: 'application/javascript+module',
      bytes: Buffer.from('export default {}'),
    }])).not.toBe(authBridgeNotificationPreparedSourceDigest([{
      field: 'index.js',
      name: 'index.js',
      contentType: 'application/javascript+module',
      bytes: Buffer.from('export default {}'),
    }]));
  });

  it('accepts Wrangler framing with no Content-Type on metadata only', () => {
    const body = multipart().toString('utf8').replace(
      'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
      'Content-Disposition: form-data; name="metadata"\r\n\r\n',
    );
    expect(inspectAuthBridgeNotificationPreparedMultipart(
      Buffer.from(body),
      'multipart/form-data; boundary=warpkeep-boundary-v1',
    )).toMatchObject({ metadata: { main_module: 'index.js' } });
  });

  it('projects only an exact version configuration with all required bindings', () => {
    const body = multipart();
    const digest = inspectAuthBridgeNotificationPreparedMultipart(
      body,
      'multipart/form-data; boundary=warpkeep-boundary-v1',
    ).sourceDigest;
    const value = contract(digest);
    const raw = exactVersionDetail(value);
    expect(raw.resources.bindings).toContainEqual({
      name: 'PTR_SPACETIMEDB_DATABASE',
      type: 'plain_text',
      text: PTR_DATABASE,
    });
    expect(raw.resources.script.named_handlers).toHaveLength(22);
    expect(raw.resources.script_runtime).not.toHaveProperty('exports');
    expect(projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: raw,
      contract: value,
      sourceDigest: digest,
    })).toEqual({ ...value, versionId: VERSION_ID, createdAt: raw.metadata.created_on });

    const exportsPresent = exactVersionDetail(value, {
      exports: exactExports(value),
    });
    expect(projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: exportsPresent,
      contract: value,
      sourceDigest: digest,
    })).toMatchObject({ versionId: VERSION_ID });

    expect(() => projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: {
        ...raw,
        resources: {
          ...raw.resources,
          bindings: raw.resources.bindings.slice(1),
        },
      },
      contract: value,
      sourceDigest: digest,
    })).toThrow('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_MISMATCH');
    for (const extra of [
      { value: PLAYER_CANARY_OWNER_FID },
      { text: PLAYER_CANARY_OWNER_FID },
      { extra: 'forbidden' },
    ]) {
      expect(() => projectAuthBridgeNotificationPreparedCloudflareVersion({
        value: {
          ...raw,
          resources: {
            ...raw.resources,
            bindings: raw.resources.bindings.map(binding => (
              binding.name === 'PLAYER_CANARY_OWNER_FID'
                ? { ...binding, ...extra }
                : binding
            )),
          },
        },
        contract: value,
        sourceDigest: digest,
      })).toThrow('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_UNEXPECTED');
    }
  });

  it.each([
    {
      name: 'top-level extra key',
      mutate: (detail: ExactVersionDetail) => {
        detail.unreviewed = false;
      },
    },
    {
      name: 'missing named handler',
      mutate: (detail: ExactVersionDetail) => {
        (detail.resources.script.named_handlers as unknown[]).pop();
      },
    },
    {
      name: 'duplicate named handler',
      mutate: (detail: ExactVersionDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers.push(structuredClone(handlers[0]));
      },
    },
    {
      name: 'renamed named handler',
      mutate: (detail: ExactVersionDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].name = 'AdmissionNotificationV2';
      },
    },
    {
      name: 'malformed named handler',
      mutate: (detail: ExactVersionDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].handlers = ['fetch'];
      },
    },
    {
      name: 'named handler extra key',
      mutate: (detail: ExactVersionDetail) => {
        const handlers = detail.resources.script.named_handlers as Record<
          string,
          unknown
        >[];
        handlers[0].type = 'class';
      },
    },
    {
      name: 'null named handlers',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script.named_handlers = null;
      },
    },
    {
      name: 'missing fetch handler',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script.handlers = ['scheduled'];
      },
    },
    {
      name: 'missing script handlers key',
      mutate: (detail: ExactVersionDetail) => {
        delete detail.resources.script.handlers;
      },
    },
    {
      name: 'non-SHA script etag',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script.etag = 'not-a-sha';
      },
    },
    {
      name: 'null script',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script = null as unknown as Record<string, unknown>;
      },
    },
    {
      name: 'wrong deployment source',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script.last_deployed_from = 'wrangler';
      },
    },
    {
      name: 'null exports',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script_runtime.exports = null;
      },
    },
    {
      name: 'present near-miss exports',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script_runtime.exports = {
          default: { type: 'worker' },
        };
      },
    },
    {
      name: 'runtime limits under exports-absent shape',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script_runtime.limits = {};
      },
    },
    {
      name: 'runtime extra under exports-absent shape',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.script_runtime.unreviewed = false;
      },
    },
    {
      name: 'wrong Durable Object namespace id',
      mutate: (detail: ExactVersionDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMISSION_NOTIFICATIONS'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.namespace_id = 'f'.repeat(32);
      },
    },
    {
      name: 'raw binding extra key',
      mutate: (detail: ExactVersionDetail) => {
        detail.resources.bindings[0].unreviewed = false;
      },
    },
    {
      name: 'wrong secret binding name',
      mutate: (detail: ExactVersionDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMIN_TOKEN_SECRET'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        binding.name = 'UNREVIEWED_SECRET';
      },
    },
    {
      name: 'duplicate secret binding',
      mutate: (detail: ExactVersionDetail) => {
        const binding = detail.resources.bindings.find(item => (
          item.name === 'ADMIN_TOKEN_SECRET'
        ));
        if (binding === undefined) throw new Error('fixture binding missing');
        detail.resources.bindings.push(structuredClone(binding));
      },
    },
    {
      name: 'metadata drift',
      mutate: (detail: ExactVersionDetail) => {
        detail.metadata.has_preview = true;
      },
    },
    {
      name: 'metadata author email drift',
      mutate: (detail: ExactVersionDetail) => {
        detail.metadata.author_email = 'operator@example.invalid';
      },
    },
    {
      name: 'metadata author email non-string',
      mutate: (detail: ExactVersionDetail) => {
        detail.metadata.author_email = null;
      },
    },
    {
      name: 'metadata missing preview',
      mutate: (detail: ExactVersionDetail) => {
        delete detail.metadata.has_preview;
      },
    },
    {
      name: 'metadata source drift',
      mutate: (detail: ExactVersionDetail) => {
        detail.metadata.source = 'wrangler';
      },
    },
    {
      name: 'metadata extra key',
      mutate: (detail: ExactVersionDetail) => {
        detail.metadata.modified_on = '2026-08-12T23:58:00.000Z';
      },
    },
    {
      name: 'annotation drift',
      mutate: (detail: ExactVersionDetail) => {
        detail.annotations['workers/triggered_by'] = 'deployment';
      },
    },
    {
      name: 'annotation missing trigger',
      mutate: (detail: ExactVersionDetail) => {
        delete detail.annotations['workers/triggered_by'];
      },
    },
    {
      name: 'annotation extra key',
      mutate: (detail: ExactVersionDetail) => {
        detail.annotations['workers/unreviewed'] = 'forbidden';
      },
    },
  ])('rejects exact prepared candidate GET near miss before deployment: $name', ({
    mutate,
  }) => {
    const body = multipart();
    const digest = inspectAuthBridgeNotificationPreparedMultipart(
      body,
      'multipart/form-data; boundary=warpkeep-boundary-v1',
    ).sourceDigest;
    const value = contract(digest);
    const hostile = structuredClone(exactVersionDetail(value));
    mutate(hostile);
    expect(() => projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: hostile,
      contract: value,
      sourceDigest: digest,
    })).toThrow(/AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_/u);
  });

  it('derives the immutable uploaded-source proof from version-specific modules', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const stable = exactVersionDetail(value);
    const predecessor = exactVersionDetail(value, {
      id: OLD_VERSION_ID,
      number: 1,
    });
    let remoteBody = contentMultipart();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/versions?page=1&per_page=1')) return response({
        items: [{
          id: VERSION_ID,
          number: stable.number,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }],
      }, url, {
        count: 1,
        page: 1,
        per_page: 1,
        total_count: 1,
        total_pages: 1,
      });
      if (url.includes('/versions?deployable=true')) return response({
        items: [{
          id: VERSION_ID,
          number: 2,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }],
      }, url, {
        count: 1,
        page: 1,
        per_page: 100,
        total_count: 1,
        total_pages: 1,
      });
      if (url.includes('/content/v2?version=')) {
        return multipartResponse(remoteBody, url);
      }
      if (url.endsWith(`/versions/${OLD_VERSION_ID}`)) {
        return response(predecessor, url);
      }
      if (url.endsWith(`/versions/${VERSION_ID}`)) return response(stable, url);
      throw new Error('unexpected request');
    });
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      journal: { inspect: () => ({
        phase: 'uploaded',
        predecessorDeploymentId: OLD_DEPLOYMENT_ID,
        predecessorVersionId: OLD_VERSION_ID,
      }) },
    });
    await expect(runtime.inspectVersion(VERSION_ID)).resolves.toEqual({
      ...value,
      versionId: VERSION_ID,
      createdAt: stable.metadata.created_on,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    remoteBody = Buffer.from(template.toString('utf8').replace(
      'return new Response("ok")',
      'return new Response("different")',
    ));
    await expect(runtime.inspectVersion(VERSION_ID)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED',
    });
    runtime.dispose();
  });

  it('projects the authenticated old live version before releasing the target', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const targetDetail = exactVersionDetail(value);
    const oldDetail = exactVersionDetail(value, {
      id: OLD_VERSION_ID,
      number: 1,
      createdAt: '2026-08-12T23:50:00.000Z',
      etag: 'd'.repeat(64),
      secretBindingNames: value.secretBindingNames.filter(
        name => name !== 'PLAYER_CANARY_OWNER_FID',
      ),
      annotations: {
        'workers/tag': `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
        'workers/message': `Warpkeep notification B0 ${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
        'workers/triggered_by': 'version_upload',
      },
      bridgeSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      ptrDatabase: null,
    });
    let uploaded = false;
    let targetLive = false;
    let phase: JournalPhase = null;
    let uploadMode: 'version' | null = null;
    let predecessorDeploymentId: string | null = null;
    let predecessorVersionId: string | null = null;
    let uploadAdjudicationReason:
      | 'invalid-upload-response'
      | 'definitive-provider-rejection'
      | null = null;
    let uploadPosts = 0;
    let releasePosts = 0;
    let secretEndpointWrites = 0;
    const mutationOrder: string[] = [];
    let previewsEnabled = false;
    let extraDomain = false;
    let extraRoute = false;
    let tailConsumer = false;
    let cacheEnabled = false;
    let targetMessage: string | null = value.versionMessage;
    let targetTrigger: string | null = 'deployment';
    let releaseBody: Readonly<Record<string, unknown>> | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/versions?page=1&per_page=1')) {
        const latest = uploaded
          ? {
              id: VERSION_ID,
              number: 2,
              annotations: {
                'workers/tag': value.versionTag,
                'workers/message': value.versionMessage,
              },
            }
          : {
              id: OLD_VERSION_ID,
              number: 1,
              annotations: {
                'workers/tag':
                  `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
                'workers/message':
                  `Warpkeep notification B0 ${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
              },
            };
        return response({ items: [latest] }, url, {
          count: 1,
          page: 1,
          per_page: 1,
          total_count: 1,
          total_pages: 1,
        });
      }
      if (url.includes('/versions?deployable=true')) {
        const items = [{
          id: OLD_VERSION_ID,
          number: 1,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }, ...(uploaded ? [{
          id: VERSION_ID,
          number: 2,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }] : [])];
        return response({ items }, url, {
          count: items.length,
          page: 1,
          per_page: 100,
          total_count: items.length,
          total_pages: 1,
        });
      }
      if (url.endsWith('/workers/scripts')) {
        return response([{
          id: value.workerName,
          migration_tag: 'v5',
          cache_options: { enabled: cacheEnabled, cross_version_cache: true },
        }], url);
      }
      if (url.includes('/secrets')) {
        if (method !== 'GET') secretEndpointWrites += 1;
        throw new Error(`legacy secret endpoint forbidden: ${method} ${url}`);
      }
      if (url.endsWith('/versions') && method === 'POST') {
        const candidate = inspectAuthBridgeNotificationPreparedMultipart(
          Buffer.from(init?.body as Buffer),
          String((init?.headers as Record<string, string>)['content-type']),
        );
        expect(candidate.metadata.keep_bindings).toEqual([
          'secret_text',
          'secret_key',
        ]);
        expect((candidate.metadata.bindings as { type?: string }[]).filter(
          (binding: { type?: string }) => binding.type === 'inherit',
        )).toEqual([]);
        expect((candidate.metadata.bindings as { type?: string }[]).filter(
          (binding: { type?: string }) => binding.type === 'secret_text',
        )).toEqual([{
          name: 'PLAYER_CANARY_OWNER_FID',
          text: PLAYER_CANARY_OWNER_FID,
          type: 'secret_text',
        }]);
        uploadPosts += 1;
        mutationOrder.push('upload');
        uploaded = true;
        return response(officialVersionUploadResult(value), url);
      }
      if (url.includes('/content/v2?version=')) {
        return multipartResponse(contentMultipart(), url);
      }
      if (url.endsWith(`/versions/${VERSION_ID}`)) {
        return response(targetDetail, url);
      }
      if (url.endsWith(`/versions/${OLD_VERSION_ID}`)) {
        return response(oldDetail, url);
      }
      if (url.endsWith('/deployments') && method === 'POST') {
        releaseBody = JSON.parse(String(init?.body)) as Readonly<Record<string, unknown>>;
        releasePosts += 1;
        mutationOrder.push('release');
        targetLive = true;
        return response({ id: '223e4567-e89b-42d3-a456-426614174000' }, url);
      }
      if (url.endsWith('/deployments')) {
        const target = targetLive;
        return response([{
          id: target
            ? '223e4567-e89b-42d3-a456-426614174000'
            : OLD_DEPLOYMENT_ID,
          created_on: target
            ? '2026-08-12T23:59:00.000Z'
            : '2026-08-12T23:55:00.000Z',
          strategy: 'percentage',
          versions: [{
            version_id: target ? VERSION_ID : OLD_VERSION_ID,
            percentage: 100,
          }],
          annotations: target ? {
            ...(targetMessage === null ? {} : { 'workers/message': targetMessage }),
            ...(targetTrigger === null
              ? {}
              : { 'workers/triggered_by': targetTrigger }),
          } : {},
        }], url);
      }
      if (url.includes('/workers/domains?service=')) {
        const domains = [{
        id: 'domain-id',
        zone_id: ZONE_ID,
        zone_name: 'warpkeep.com',
        hostname: 'auth.warpkeep.com',
        service: 'warpkeep-auth-bridge',
        environment: 'production',
        cert_id: 'certificate-id',
        enabled: true,
        previews_enabled: false,
        }, ...(extraDomain ? [{
          id: 'extra-domain-id',
          zone_id: ZONE_ID,
          zone_name: 'warpkeep.com',
          hostname: 'extra.warpkeep.com',
          service: 'warpkeep-auth-bridge',
          environment: 'production',
          cert_id: 'extra-certificate-id',
        }] : [])];
        return response(domains, url, {
        count: domains.length,
        page: 1,
        per_page: 100,
        total_count: domains.length + 1,
        total_pages: 1,
        });
      }
      if (url.endsWith('/environments/production/routes?show_zonename=true')) {
        return response(extraRoute ? [{
          id: 'route-id',
          pattern: 'extra.warpkeep.com/*',
          script: 'warpkeep-auth-bridge',
        }] : [], url);
      }
      if (url.endsWith('/script-settings')) {
        return response({
          logpush: false,
          observability: { enabled: false },
          tags: [],
          tail_consumers: tailConsumer ? [{ service: 'log-exporter' }] : [],
        }, url);
      }
      if (url.endsWith('/subdomain')) {
        return response({ enabled: false, previews_enabled: previewsEnabled }, url);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const journal = {
      inspect: () => ({
        phase,
        uploadMode,
        predecessorDeploymentId,
        predecessorVersionId,
        uploadAdjudicationReason,
      }),
      prepared: vi.fn(async () => { phase ??= 'prepared'; }),
      remoteReconcileStarted: vi.fn(async (input: Readonly<Record<string, unknown>>) => {
        predecessorDeploymentId = input.predecessorDeploymentId as string;
        predecessorVersionId = input.predecessorVersionId as string;
        phase = 'remote-reconcile-started';
      }),
      uploadInvoked: vi.fn(async (input: Readonly<Record<string, unknown>>) => {
        if (input.uploadMode !== 'version') {
          throw new Error('test harness requires an exact upload mode');
        }
        phase = 'upload-invoked';
        uploadMode = input.uploadMode;
      }),
      uploadAdjudicationRequired: vi.fn(async (
        input: Readonly<Record<string, unknown>>,
      ) => {
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
      uploaded: vi.fn(async () => { phase = 'uploaded'; }),
      releaseUncertain: vi.fn(async () => { phase = 'release-uncertain'; }),
      releaseInvoked: vi.fn(async () => { phase = 'release-invoked'; }),
      completed: vi.fn(async () => { phase = 'completed'; }),
    };
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      clock: () => new Date(NOW),
      journal,
    });
    previewsEnabled = true;
    await expect(runtime.inspectDeployment()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_SUBDOMAIN_MISMATCH',
    });
    previewsEnabled = false;
    extraDomain = true;
    await expect(runtime.inspectDeployment()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_DOMAIN_MISMATCH',
    });
    extraDomain = false;
    extraRoute = true;
    await expect(runtime.inspectDeployment()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_ROUTE_MISMATCH',
    });
    extraRoute = false;
    tailConsumer = true;
    await expect(runtime.inspectDeployment()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_SCRIPT_SETTINGS_MISMATCH',
    });
    tailConsumer = false;
    cacheEnabled = true;
    await expect(runtime.inspectDeployment()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_CACHE_MISMATCH',
    });
    cacheEnabled = false;
    await expect(runtime.inspectDeployment()).resolves.toMatchObject({
      versionId: OLD_VERSION_ID,
      versionTag:
        `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
      sourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
    });
    await expect(executeAuthBridgeNotificationPreparedDeployAdapter({
      contract: value,
      ...runtime,
      journal,
      assertCanStartWrite: async () => true as const,
      clock: () => new Date(NOW),
    })).resolves.toMatchObject({ outcome: 'verified' });
    expect(uploadPosts).toBe(1);
    expect(releasePosts).toBe(1);
    expect(secretEndpointWrites).toBe(0);
    expect(mutationOrder).toEqual(['upload', 'release']);
    expect(releaseBody).toMatchObject({
      annotations: { 'workers/message': value.versionMessage },
    });
    expect((releaseBody as unknown as {
      annotations?: Readonly<Record<string, string>>;
    })
      .annotations).not.toHaveProperty('workers/triggered_by');
    expect(targetLive).toBe(true);
    expect(phase).toBe('completed');
    for (const [message, trigger] of [
      [null, 'deployment'],
      ['wrong message', 'deployment'],
      [value.versionMessage, null],
      [value.versionMessage, 'wrong-trigger'],
    ] as const) {
      targetMessage = message;
      targetTrigger = trigger;
      await expect(runtime.inspectDeployment()).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID',
      });
    }
    runtime.dispose();
  });

  it('uploads one keep-bindings candidate and fails closed on lineage drift', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const urls: string[] = [];
    let predecessorExtraBinding = false;
    let includeSameTagNonpredecessor = false;
    let candidateListNumberShape: 'valid' | 'missing' | 'malformed' = 'valid';
    let livePredecessorDeploymentId = OLD_DEPLOYMENT_ID;
    let candidateVersionNumber: number | 'missing' | 'malformed' = 2;
    let latestUploadShape:
      | 'predecessor'
      | 'newer'
      | 'empty'
      | 'malformed'
      | 'missing-number'
      | 'candidate'
      | 'uploaded'
      | 'ambiguous' = 'predecessor';
    const predecessorDetail = exactVersionDetail(value, {
      id: OLD_VERSION_ID,
      number: 1,
      createdAt: '2026-08-12T23:50:00.000Z',
      etag: 'd'.repeat(64),
      secretBindingNames: value.secretBindingNames.filter(
        name => name !== 'PLAYER_CANARY_OWNER_FID',
      ),
      annotations: {
        'workers/tag': `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
        'workers/message': `Warpkeep notification B0 ${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
        'workers/triggered_by': 'version_upload',
      },
      bridgeSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      ptrDatabase: null,
    });
    const nonPredecessorDetail = exactVersionDetail(value, {
      id: NON_PREDECESSOR_VERSION_ID,
      number: 3,
      createdAt: '2026-08-12T23:52:00.000Z',
      etag: 'c'.repeat(64),
      secretBindingNames: value.secretBindingNames,
    });
    let predecessorSourceBody = contentMultipart();
    const prerequisiteResponse = (
      url: string,
      method: string,
      migrationTag = 'v5',
    ) => {
      if (url.endsWith('/versions?page=1&per_page=1')) {
        const predecessorItem = {
          id: OLD_VERSION_ID,
          number: 1,
          annotations: {
            'workers/tag':
              `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
            'workers/message':
              `Warpkeep notification B0 ${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
          },
        };
        const items = latestUploadShape === 'empty'
          ? []
          : latestUploadShape === 'malformed'
            ? [{ ...predecessorItem, number: '1' }]
            : latestUploadShape === 'missing-number'
              ? [Object.fromEntries(Object.entries(predecessorItem).filter(
                  ([name]) => name !== 'number',
                ))]
            : latestUploadShape === 'candidate'
              ? [{
                  id: NON_PREDECESSOR_VERSION_ID,
                  number: nonPredecessorDetail.number,
                  annotations: {
                    'workers/tag': value.versionTag,
                    'workers/message': value.versionMessage,
                  },
                }]
            : latestUploadShape === 'uploaded'
              ? [{
                  id: VERSION_ID,
                  number: typeof candidateVersionNumber === 'number'
                    ? candidateVersionNumber
                    : 2,
                  annotations: {
                    'workers/tag': value.versionTag,
                    'workers/message': value.versionMessage,
                  },
                }]
            : latestUploadShape === 'newer'
              ? [{
                  id: CONCURRENT_VERSION_ID,
                  number: 2,
                  annotations: {
                    'workers/tag': 'concurrent-nondeployed-secret-change',
                    'workers/message': 'concurrent-nondeployed-secret-change',
                  },
                }]
              : latestUploadShape === 'ambiguous'
                ? [predecessorItem, {
                  id: CONCURRENT_VERSION_ID,
                  number: 1,
                  annotations: {
                    'workers/tag': 'ambiguous-latest-upload',
                    'workers/message': 'ambiguous-latest-upload',
                  },
                }]
                : [predecessorItem];
        return response({ items }, url, {
          count: items.length,
          page: 1,
          per_page: 1,
          total_count: latestUploadShape === 'newer' ? 2 : items.length,
          total_pages: latestUploadShape === 'newer' ? 2 : 1,
        });
      }
      if (url.includes('/versions?deployable=true')) {
        const predecessorItem = {
          id: OLD_VERSION_ID,
          number: 1,
          annotations: {
            'workers/tag':
              `notification-b0-${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
            'workers/message':
              `Warpkeep notification B0 ${AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT}`,
          },
        };
        const items = [
          predecessorItem,
          ...(includeSameTagNonpredecessor ? [candidateListNumberShape === 'missing'
            ? {
                id: NON_PREDECESSOR_VERSION_ID,
                annotations: {
                  'workers/tag': value.versionTag,
                  'workers/message': value.versionMessage,
                },
              }
            : {
                id: NON_PREDECESSOR_VERSION_ID,
                number: candidateListNumberShape === 'malformed'
                  ? '3'
                  : nonPredecessorDetail.number,
                annotations: {
                  'workers/tag': value.versionTag,
                  'workers/message': value.versionMessage,
                },
              }] : []),
        ];
        return response({ items }, url, {
          count: items.length,
          page: 1,
          per_page: 100,
          total_count: items.length,
          total_pages: 1,
        });
      }
      if (url.endsWith('/workers/scripts')) {
        return response([{ id: value.workerName, migration_tag: migrationTag }], url);
      }
      if (url.includes('/workers/domains?service=')) return response([{
        id: 'domain-id',
        zone_id: ZONE_ID,
        zone_name: 'warpkeep.com',
        hostname: 'auth.warpkeep.com',
        service: 'warpkeep-auth-bridge',
        environment: 'production',
        cert_id: 'certificate-id',
        enabled: true,
        previews_enabled: false,
      }], url, {
        count: 1,
        page: 1,
        per_page: 100,
        total_count: 1,
        total_pages: 1,
      }, true);
      if (url.endsWith('/environments/production/routes?show_zonename=true')) {
        return response([], url);
      }
      if (url.endsWith('/script-settings')) return response({
        logpush: false,
        observability: { enabled: false },
        tags: [],
        tail_consumers: [],
      }, url);
      if (url.endsWith('/subdomain')) {
        return response({ enabled: false, previews_enabled: false }, url);
      }
      if (url.endsWith('/deployments') && method === 'GET') return response([{
        id: livePredecessorDeploymentId,
        created_on: '2026-08-12T23:55:00.000Z',
        strategy: 'percentage',
        versions: [{ version_id: OLD_VERSION_ID, percentage: 100 }],
        annotations: {},
      }], url);
      if (url.endsWith(`/versions/${OLD_VERSION_ID}`)) {
        return response({
          ...predecessorDetail,
          resources: {
            ...predecessorDetail.resources,
            bindings: [
              ...predecessorDetail.resources.bindings,
              ...(predecessorExtraBinding ? [{
                name: 'UNREVIEWED_EXTRA',
                type: 'plain_text',
                text: 'forbidden',
              }] : []),
            ],
            script_runtime: {
              ...predecessorDetail.resources.script_runtime,
              migration_tag: migrationTag,
            },
          },
        }, url);
      }
      if (url.endsWith(`/versions/${VERSION_ID}`)) {
        const candidateDetail = exactVersionDetail(value, {
          id: VERSION_ID,
          number: typeof candidateVersionNumber === 'number'
            ? candidateVersionNumber
            : 3,
        });
        if (candidateVersionNumber === 'missing') delete candidateDetail.number;
        if (candidateVersionNumber === 'malformed') candidateDetail.number = 0;
        return response(candidateDetail, url);
      }
      if (url.endsWith(`/versions/${NON_PREDECESSOR_VERSION_ID}`)) {
        return response(nonPredecessorDetail, url);
      }
      if (url.endsWith(`/content/v2?version=${OLD_VERSION_ID}`)) {
        return multipartResponse(predecessorSourceBody, url);
      }
      if (url.endsWith(`/content/v2?version=${VERSION_ID}`)) {
        return multipartResponse(contentMultipart(), url);
      }
      if (url.endsWith(`/content/v2?version=${NON_PREDECESSOR_VERSION_ID}`)) {
        return multipartResponse(contentMultipart(), url);
      }
      return undefined;
    };
    let candidateBody: Buffer | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      urls.push(`${method}:${url}`);
      if (url.includes('/secrets')) throw new Error('legacy secret endpoint forbidden');
      const prerequisite = prerequisiteResponse(url, method);
      if (prerequisite !== undefined) return prerequisite;
      if (url.endsWith('/versions') && method === 'POST') {
        candidateBody = Buffer.from(init?.body as Buffer);
        return response(officialVersionUploadResult(value), url);
      }
      if (url.endsWith('/deployments') && method === 'POST') {
        return response({ id: VERSION_ID }, url);
      }
      throw new Error('unexpected request');
    });
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      journal: { inspect: () => ({ phase: 'prepared', predecessorVersionId: null }) },
    });
    predecessorSourceBody = Buffer.from(
      contentMultipart().toString('utf8').replace(
        'return new Response("ok")',
        'return new Response("different")',
      ),
    );
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED',
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    predecessorSourceBody = contentMultipart();

    predecessorDetail.resources.script_runtime.exports = null;
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_EXPORT_MISMATCH',
    });
    delete predecessorDetail.resources.script_runtime.exports;
    const predecessorHandlers = predecessorDetail.resources.script
      .named_handlers as unknown[];
    const removedPredecessorHandler = predecessorHandlers.pop();
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_EXPORT_MISMATCH',
    });
    predecessorHandlers.push(removedPredecessorHandler);
    const predecessorNamespace = predecessorDetail.resources.bindings.find(
      binding => binding.name === 'ADMISSION_NOTIFICATIONS',
    );
    if (predecessorNamespace === undefined) {
      throw new Error('fixture binding missing');
    }
    const reviewedNamespaceId = predecessorNamespace.namespace_id;
    predecessorNamespace.namespace_id = 'f'.repeat(32);
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
    });
    predecessorNamespace.namespace_id = reviewedNamespaceId;
    const predecessorSourceBinding = predecessorDetail.resources.bindings.find(
      binding => binding.name === 'WARPKEEP_BRIDGE_SOURCE_COMMIT',
    );
    if (predecessorSourceBinding === undefined) {
      throw new Error('fixture source binding missing');
    }
    predecessorSourceBinding.text = 'f'.repeat(40);
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
    });
    predecessorSourceBinding.text =
      AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT;
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);

    const predecessorVersionNumber = predecessorDetail.number;
    for (const invalidPredecessorVersionNumber of [
      'missing',
      0,
      Number.MAX_SAFE_INTEGER,
    ] as const) {
      if (invalidPredecessorVersionNumber === 'missing') {
        delete predecessorDetail.number;
      } else {
        predecessorDetail.number = invalidPredecessorVersionNumber;
      }
      await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
        code: expect.stringMatching(
          /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:PREDECESSOR_(?:EXPORT_MISMATCH|NUMBER_MISMATCH|SEQUENCE_MISMATCH|VERSION_NUMBER_INVALID)|VERSION_LIST_INVALID)$/u,
        ),
      });
      expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    }
    predecessorDetail.number = predecessorVersionNumber;

    latestUploadShape = 'newer';
    await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:LATEST_(?:UPLOAD|VERSION)_MISMATCH|PREDECESSOR_DRIFT)$/u,
      ),
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    latestUploadShape = 'predecessor';

    for (const invalidLatestUploadShape of [
      'empty',
      'malformed',
      'missing-number',
      'ambiguous',
    ] as const) {
      latestUploadShape = invalidLatestUploadShape;
      await expect(runtime.prepareUpload(value)).rejects.toMatchObject({
        code: expect.stringMatching(
          /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:LATEST_(?:UPLOAD|VERSION)_(?:INVALID|AMBIGUOUS)|VERSION_LIST_(?:INVALID|AMBIGUOUS))$/u,
        ),
      });
      expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    }
    latestUploadShape = 'predecessor';

    const uploadPlan = await runtime.prepareUpload(value);
    expect(uploadPlan).toEqual({
      mode: 'version',
      predecessorDeploymentId: OLD_DEPLOYMENT_ID,
      predecessorVersionId: OLD_VERSION_ID,
    });
    await expect(runtime.reconcileVersion(value)).resolves.toEqual([]);
    includeSameTagNonpredecessor = true;
    await expect(runtime.reconcileVersion(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH',
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    includeSameTagNonpredecessor = false;
    livePredecessorDeploymentId = DRIFTED_DEPLOYMENT_ID;
    await expect(runtime.uploadVersion(value, uploadPlan)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_DRIFT',
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    livePredecessorDeploymentId = OLD_DEPLOYMENT_ID;

    latestUploadShape = 'newer';
    await expect(runtime.uploadVersion(value, uploadPlan)).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:LATEST_(?:UPLOAD|VERSION)_MISMATCH|PREDECESSOR_DRIFT)$/u,
      ),
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    latestUploadShape = 'predecessor';

    const successfulUploadStart = urls.length;
    await expect(runtime.uploadVersion(value, uploadPlan)).resolves.toEqual({
      versionId: VERSION_ID,
    });
    const successfulUploadRequests = urls.slice(successfulUploadStart);
    expect(successfulUploadRequests.at(-2)).toMatch(
      /^GET:.*\/versions\?page=1&per_page=1$/u,
    );
    expect(successfulUploadRequests.at(-1)).toMatch(/^POST:.*\/versions$/u);
    expect(successfulUploadRequests.at(-1)).not.toContain('bindings_inherit');
    const candidate = inspectAuthBridgeNotificationPreparedMultipart(
      candidateBody as Buffer,
      contentType,
    );
    expect(candidate.metadata.keep_bindings).toEqual([
      'secret_text',
      'secret_key',
    ]);
    expect((candidate.metadata.bindings as { type?: string }[]).filter(
      binding => binding.type === 'inherit',
    )).toEqual([]);
    expect((candidate.metadata.bindings as { type?: string }[]).filter(
      (binding: { type?: string }) => binding.type === 'secret_text',
    )).toEqual([{
      name: 'PLAYER_CANARY_OWNER_FID',
      text: PLAYER_CANARY_OWNER_FID,
      type: 'secret_text',
    }]);
    expect(candidate.metadata.bindings).toContainEqual({
      name: 'PTR_SPACETIMEDB_DATABASE',
      text: PTR_DATABASE,
      type: 'plain_text',
    });
    expect(attestAuthBridgeNotificationPreparedCandidateMultipartMetadata({
      metadata: candidate.metadata,
      contract: value,
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
    })).toBe(true);
    const candidateBindings = candidate.metadata.bindings as Record<string, unknown>[];
    const canaryIndex = candidateBindings.findIndex(
      binding => binding.type === 'secret_text',
    );
    const ptrIndex = candidateBindings.findIndex(
      binding => binding.name === 'PTR_SPACETIMEDB_DATABASE',
    );
    const hostileMetadata = [
      Object.fromEntries(Object.entries(candidate.metadata).filter(
        ([name]) => name !== 'keep_bindings',
      )),
      { ...candidate.metadata, keep_bindings: ['secret_key', 'secret_text'] },
      { ...candidate.metadata, keep_bindings: ['secret_text'] },
      { ...candidate.metadata, keep_bindings: ['secret_text', 'secret_key', 'kv_namespace'] },
      { ...candidate.metadata, keep_bindings: ['secret_text', 'secret_text'] },
      {
        ...candidate.metadata,
        bindings: candidateBindings.filter((_, index) => index !== canaryIndex),
      },
      {
        ...candidate.metadata,
        bindings: candidateBindings.map((binding, index) => index === canaryIndex
        ? { ...binding, name: 'UNREVIEWED_SECRET' }
        : binding),
      },
      {
        ...candidate.metadata,
        bindings: candidateBindings.map((binding, index) => index === canaryIndex
          ? { ...binding, type: 'plain_text' }
          : binding),
      },
      {
        ...candidate.metadata,
        bindings: candidateBindings.map((binding, index) => index === canaryIndex
          ? { ...binding, old_name: 'PLAYER_CANARY_OWNER_FID' }
          : binding),
      },
      {
        ...candidate.metadata,
        bindings: [
          ...candidateBindings,
          {
            name: value.secretBindingNames[0],
            type: 'inherit',
            version_id: OLD_VERSION_ID,
          },
        ],
      },
      { ...candidate.metadata, bindings: [...candidateBindings, candidateBindings[canaryIndex]] },
      {
        ...candidate.metadata,
        bindings: candidateBindings.filter((_, index) => index !== ptrIndex),
      },
      {
        ...candidate.metadata,
        bindings: candidateBindings.map((binding, index) => index === ptrIndex
          ? { ...binding, text: '8'.repeat(64) }
          : binding),
      },
    ];
    for (const metadata of hostileMetadata) {
      expect(() => attestAuthBridgeNotificationPreparedCandidateMultipartMetadata({
        metadata,
        contract: value,
        playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      })).toThrow(
        /AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:MULTIPART_METADATA_MISMATCH|VERSION_BINDING_UNEXPECTED)/u,
      );
    }

    candidateVersionNumber = 3;
    await expect(runtime.inspectVersion(VERSION_ID)).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:VERSION_(?:SEQUENCE|LINEAGE)|CANDIDATE_LINEAGE)_MISMATCH$/u,
      ),
    });
    for (const invalidCandidateVersionNumber of [
      'missing',
      'malformed',
      Number.MAX_SAFE_INTEGER + 1,
    ] as const) {
      candidateVersionNumber = invalidCandidateVersionNumber;
      await expect(runtime.inspectVersion(VERSION_ID)).rejects.toMatchObject({
        code: expect.stringMatching(
          /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:VERSION_(?:INVALID|SEQUENCE_MISMATCH|LINEAGE_MISMATCH)|CANDIDATE_LINEAGE_MISMATCH)$/u,
        ),
      });
    }
    candidateVersionNumber = 2;
    await expect(runtime.inspectVersion(VERSION_ID)).resolves.toMatchObject({
      versionId: VERSION_ID,
    });

    const createAuthorizedRecoveryRuntime = async () => {
      includeSameTagNonpredecessor = false;
      candidateListNumberShape = 'valid';
      latestUploadShape = 'predecessor';
      livePredecessorDeploymentId = OLD_DEPLOYMENT_ID;
      predecessorExtraBinding = false;
      const recoveryUrls: string[] = [];
      const recoveryFetchImpl = vi.fn(async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        recoveryUrls.push(`${method}:${url}`);
        const prerequisite = prerequisiteResponse(url, method);
        if (prerequisite !== undefined) return prerequisite;
        if (url.endsWith('/versions') && method === 'POST') {
          throw new Error('upload response lost after provider invocation');
        }
        throw new Error(`unexpected recovery request: ${method} ${url}`);
      });
      const recoveryRuntime =
        createAuthBridgeNotificationPreparedCloudflareRuntime({
          contract: value,
          apiToken: 'cloudflare-test-token-value-1234567890',
          playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
          repositoryRoot: realpathSync(process.cwd()),
          serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
          nodeExecutable: process.execPath,
          wranglerEntrypoint: process.execPath,
          multipartBody: body,
          multipartContentType: contentType,
          fetchImpl: recoveryFetchImpl,
          journal: {
            inspect: () => ({
              phase: 'upload-invoked',
              predecessorDeploymentId: OLD_DEPLOYMENT_ID,
              predecessorVersionId: OLD_VERSION_ID,
            }),
          },
        });
      const recoveryPlan = await recoveryRuntime.prepareUpload(value);
      await expect(recoveryRuntime.uploadVersion(value, recoveryPlan))
        .rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_OUTCOME_AMBIGUOUS',
          deploymentMayHaveChanged: true,
        });
      expect(recoveryUrls.filter(item => item.startsWith('POST:')))
        .toHaveLength(1);
      return { recoveryRuntime, recoveryUrls };
    };

    let authorizedRecovery = await createAuthorizedRecoveryRuntime();
    includeSameTagNonpredecessor = true;
    let recoveryReadStart = authorizedRecovery.recoveryUrls.length;
    await expect(authorizedRecovery.recoveryRuntime.reconcileVersion(value))
      .rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:VERSION_(?:SEQUENCE|LINEAGE)|CANDIDATE_LINEAGE)_MISMATCH$/u,
      ),
    });
    expect(authorizedRecovery.recoveryUrls.slice(recoveryReadStart).every(
      item => item.startsWith('GET:'),
    )).toBe(true);
    authorizedRecovery.recoveryRuntime.dispose();

    nonPredecessorDetail.number = 2;
    for (const invalidCandidateListNumberShape of [
      'missing',
      'malformed',
    ] as const) {
      authorizedRecovery = await createAuthorizedRecoveryRuntime();
      includeSameTagNonpredecessor = true;
      latestUploadShape = 'candidate';
      candidateListNumberShape = invalidCandidateListNumberShape;
      const invalidListReadStart = authorizedRecovery.recoveryUrls.length;
      await expect(authorizedRecovery.recoveryRuntime.reconcileVersion(value))
        .rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID',
        });
      expect(authorizedRecovery.recoveryUrls.slice(invalidListReadStart).every(
        item => item.startsWith('GET:'),
      )).toBe(true);
      authorizedRecovery.recoveryRuntime.dispose();
    }
    authorizedRecovery = await createAuthorizedRecoveryRuntime();
    includeSameTagNonpredecessor = true;
    latestUploadShape = 'candidate';
    candidateListNumberShape = 'valid';
    const adjacentRecoveryReadStart = authorizedRecovery.recoveryUrls.length;
    await expect(authorizedRecovery.recoveryRuntime.reconcileVersion(value))
      .resolves.toEqual([NON_PREDECESSOR_VERSION_ID]);
    expect(authorizedRecovery.recoveryUrls.slice(adjacentRecoveryReadStart).every(
      item => item.startsWith('GET:'),
    )).toBe(true);
    authorizedRecovery.recoveryRuntime.dispose();

    const uninvokedCandidateRuntime =
      createAuthBridgeNotificationPreparedCloudflareRuntime({
        contract: value,
        apiToken: 'cloudflare-test-token-value-1234567890',
        playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
        repositoryRoot: realpathSync(process.cwd()),
        serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
        nodeExecutable: process.execPath,
        wranglerEntrypoint: process.execPath,
        multipartBody: body,
        multipartContentType: contentType,
        fetchImpl,
        journal: {
          inspect: () => ({
            phase: 'remote-reconcile-started',
            predecessorDeploymentId: OLD_DEPLOYMENT_ID,
            predecessorVersionId: OLD_VERSION_ID,
          }),
        },
      });
    const uninvokedCandidateReadStart = urls.length;
    await expect(uninvokedCandidateRuntime.reconcileVersion(value))
      .rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UNINVOKED_CANDIDATE',
        deploymentMayHaveChanged: false,
      });
    expect(urls.slice(uninvokedCandidateReadStart).every(
      item => item.startsWith('GET:'),
    )).toBe(true);
    uninvokedCandidateRuntime.dispose();

    includeSameTagNonpredecessor = false;
    latestUploadShape = 'predecessor';
    nonPredecessorDetail.number = 3;

    const release = {
      versionId: VERSION_ID,
      predecessorDeploymentId: OLD_DEPLOYMENT_ID,
      predecessorVersionId: OLD_VERSION_ID,
      percentage: 100,
      message: value.versionMessage,
    } as const;
    latestUploadShape = 'uploaded';
    candidateVersionNumber = 3;
    await expect(runtime.releaseVersion(release)).rejects.toMatchObject({
      code: expect.stringMatching(
        /^AUTH_BRIDGE_PREPARED_CLOUDFLARE_(?:VERSION_(?:SEQUENCE|LINEAGE)|CANDIDATE_LINEAGE)_MISMATCH$/u,
      ),
    });
    expect(urls.filter(item => item.startsWith('POST:')
      && item.endsWith('/deployments'))).toHaveLength(0);
    candidateVersionNumber = 2;
    predecessorSourceBody = Buffer.from(
      contentMultipart().toString('utf8').replace(
        'return new Response("ok")',
        'return new Response("different")',
      ),
    );
    await expect(runtime.releaseVersion(release)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_SOURCE_UNVERIFIED',
    });
    expect(urls.filter(item => item.startsWith('POST:')
      && item.endsWith('/deployments'))).toHaveLength(0);
    predecessorSourceBody = contentMultipart();
    livePredecessorDeploymentId = DRIFTED_DEPLOYMENT_ID;
    await expect(runtime.releaseVersion(release)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_DRIFT',
    });
    expect(urls.filter(item => item.startsWith('POST:')
      && item.endsWith('/deployments'))).toHaveLength(0);
    livePredecessorDeploymentId = OLD_DEPLOYMENT_ID;
    predecessorExtraBinding = true;
    await expect(runtime.releaseVersion(release)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_PREDECESSOR_BINDING_MISMATCH',
    });
    expect(urls.filter(item => item.startsWith('POST:')
      && item.endsWith('/deployments'))).toHaveLength(0);
    predecessorExtraBinding = false;
    await runtime.releaseVersion(release);
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(2);
    latestUploadShape = 'predecessor';

    const failedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/secrets')) throw new Error('legacy secret endpoint forbidden');
      const prerequisite = prerequisiteResponse(url, method);
      if (prerequisite !== undefined) return prerequisite;
      if (init?.method === 'POST') throw new Error('connection lost');
      throw new Error('unexpected request');
    });
    const failedSettleDelayImpl = vi.fn(async () => undefined);
    const failed = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: failedFetch,
      settleDelayImpl: failedSettleDelayImpl,
      journal: {
        inspect: () => ({
          phase: 'upload-invoked',
          predecessorVersionId: OLD_VERSION_ID,
        }),
      },
    });
    const failedPlan = await failed.prepareUpload(value);
    await expect(failed.uploadVersion(value, failedPlan)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(failedFetch.mock.calls.filter(([, init]) => init?.method === 'POST'))
      .toHaveLength(1);
    const failedReconcileReadStart = failedFetch.mock.calls.length;
    await expect(failed.reconcileVersion(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(failedFetch.mock.calls.slice(failedReconcileReadStart).length)
      .toBeGreaterThan(0);
    expect(failedFetch.mock.calls.slice(failedReconcileReadStart).every(
      ([, init]) => init?.method === undefined || init.method === 'GET',
    )).toBe(true);
    expect(failedSettleDelayImpl).toHaveBeenCalledTimes(4);

    const rejectedFetch = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const prerequisite = prerequisiteResponse(url, method);
      if (prerequisite !== undefined) return prerequisite;
      if (url.endsWith('/versions') && method === 'POST') {
        return rejectedResponse(10021, url);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const rejected = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: rejectedFetch,
      journal: { inspect: () => ({ phase: 'prepared', predecessorVersionId: null }) },
    });
    const rejectedPlan = await rejected.prepareUpload(value);
    await expect(rejected.uploadVersion(value, rejectedPlan)).rejects.toMatchObject({
      code:
        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_10021',
      deploymentMayHaveChanged: false,
    });
    rejected.dispose();

    const echoedCanaryFetch = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const prerequisite = prerequisiteResponse(url, method);
      if (prerequisite !== undefined) return prerequisite;
      if (url.endsWith('/versions') && method === 'POST') {
        return rejectedResponse(
          10021,
          url,
          400,
          `hostile echo ${PLAYER_CANARY_OWNER_FID} ${PTR_DATABASE}`,
        );
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const echoedCanary = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: echoedCanaryFetch,
      journal: { inspect: () => ({ phase: 'prepared', predecessorVersionId: null }) },
    });
    const echoedCanaryPlan = await echoedCanary.prepareUpload(value);
    await expect(echoedCanary.uploadVersion(value, echoedCanaryPlan))
      .rejects.toMatchObject({
        code:
          'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_400_CODE_UNAVAILABLE',
        deploymentMayHaveChanged: false,
      });
    echoedCanary.dispose();

    const officialEcho = officialVersionUploadResult(value);
    const hostileUploadResults = [
      officialVersionUploadResult(value, { undocumented: 'redacted' }),
      {
        ...officialEcho,
        resources: {
          ...officialEcho.resources,
          secret_echo: {
            nested: `forbidden-${PLAYER_CANARY_OWNER_FID}-echo`,
          },
        },
      },
      {
        ...officialEcho,
        resources: {
          ...officialEcho.resources,
          ptr_database_echo: PTR_DATABASE,
        },
      },
    ];
    const hostileResponseFetches: ReturnType<typeof vi.fn>[] = [];
    const hostileResponseRuntimes: ReturnType<
      typeof createAuthBridgeNotificationPreparedCloudflareRuntime
    >[] = [];
    for (const hostileUploadResult of hostileUploadResults) {
      const hostileResponseFetch = vi.fn(async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/secrets')) {
          throw new Error('legacy secret endpoint forbidden');
        }
        const prerequisite = prerequisiteResponse(url, method);
        if (prerequisite !== undefined) return prerequisite;
        if (url.endsWith('/versions') && method === 'POST') {
          return response(hostileUploadResult, url);
        }
        throw new Error(`unexpected request: ${method} ${url}`);
      });
      const hostileResponseRuntime =
        createAuthBridgeNotificationPreparedCloudflareRuntime({
          contract: value,
          apiToken: 'cloudflare-test-token-value-1234567890',
          playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
          repositoryRoot: realpathSync(process.cwd()),
          serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
          nodeExecutable: process.execPath,
          wranglerEntrypoint: process.execPath,
          multipartBody: body,
          multipartContentType: contentType,
          fetchImpl: hostileResponseFetch,
          journal: {
            inspect: () => ({ phase: 'prepared', predecessorVersionId: null }),
          },
        });
      const hostileResponsePlan = await hostileResponseRuntime.prepareUpload(value);
      await expect(hostileResponseRuntime.uploadVersion(value, hostileResponsePlan))
        .rejects.toMatchObject({
          code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',
        });
      hostileResponseFetches.push(hostileResponseFetch);
      hostileResponseRuntimes.push(hostileResponseRuntime);
    }

    const migrationFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/secrets')) throw new Error('legacy secret endpoint forbidden');
      const prerequisite = prerequisiteResponse(url, method, 'v4');
      if (prerequisite !== undefined) return prerequisite;
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    const migrating = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: migrationFetch,
      journal: {
        inspect: () => ({ phase: 'prepared', predecessorVersionId: null }),
      },
    });
    await expect(migrating.prepareUpload(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_V5_PREREQUISITE_REQUIRED',
    });
    expect(migrationFetch.mock.calls.filter(([, init]) => (
      init?.method !== undefined && init.method !== 'GET'
    ))).toHaveLength(0);
    expect([
      ...fetchImpl.mock.calls,
      ...failedFetch.mock.calls,
      ...hostileResponseFetches.flatMap(fetch => fetch.mock.calls),
      ...migrationFetch.mock.calls,
    ]
      .some(([input]) => String(input).includes('/secrets'))).toBe(false);
    runtime.dispose();
    failed.dispose();
    for (const hostileResponseRuntime of hostileResponseRuntimes) {
      hostileResponseRuntime.dispose();
    }
    migrating.dispose();
  });

  it('rejects terminal upload adjudication before any Cloudflare request', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const fetchImpl = vi.fn(async () => {
      throw new Error('terminal adjudication must not reach Cloudflare');
    });
    const settleDelayImpl = vi.fn(async () => undefined);
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: uploadMultipart(value),
      multipartContentType: contentType,
      fetchImpl,
      settleDelayImpl,
      journal: {
        inspect: () => ({
          phase: 'upload-adjudication-required',
          uploadAdjudicationReason: 'invalid-upload-response',
        }),
      },
    });

    await expect(runtime.reconcileVersion(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(settleDelayImpl).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('rejects a fresh bare upload marker without fetch or settle', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    let listReads = 0;
    let writes = 0;
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (init?.method !== undefined && init.method !== 'GET') writes += 1;
      if (url.includes('/versions?deployable=true')) {
        listReads += 1;
        return response({ items: [] }, url);
      }
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    const settleDelayImpl = vi.fn(async () => undefined);
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      settleDelayImpl,
      journal: {
        inspect: () => ({
          phase: 'upload-invoked',
          uploadMode: 'version' as const,
          predecessorDeploymentId: OLD_DEPLOYMENT_ID,
          predecessorVersionId: OLD_VERSION_ID,
        }),
      },
    });
    await expect(runtime.reconcileVersion(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(listReads).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(settleDelayImpl).not.toHaveBeenCalled();
    expect(writes).toBe(0);
    runtime.dispose();
  });
});

describe('auth-bridge prepared GitHub write permit', () => {
  it('accepts the exact HTTPS Actions origin without a .git suffix', async () => {
    const repository = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-checkout-'));
    temporaryDirectories.push(repository);
    const git = (args: readonly string[]) => execFileSync('/usr/bin/git', args, {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim();
    git(['init', '--initial-branch=main']);
    git(['config', 'user.name', 'Warpkeep test']);
    git(['config', 'user.email', 'warpkeep-test@example.invalid']);
    writeFileSync(join(repository, 'tracked.txt'), 'exact checkout\n');
    git(['add', 'tracked.txt']);
    git(['commit', '-m', 'exact checkout']);
    git(['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep']);
    const head = git(['rev-parse', 'HEAD']);

    await expect(attestAuthBridgeNotificationPreparedDeployCheckout({
      repositoryRoot: realpathSync(repository),
      sourceCommit: head,
    })).resolves.toBe(realpathSync(repository));
  });

  it('rejects hidden index flags and direct checkout drift', async () => {
    const repository = mkdtempSync(join(
      realpathSync(tmpdir()),
      'warpkeep-checkout-hidden-',
    ));
    temporaryDirectories.push(repository);
    const git = (args: readonly string[]) => execFileSync('/usr/bin/git', args, {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim();
    git(['init', '--initial-branch=main']);
    git(['config', 'user.name', 'Warpkeep test']);
    git(['config', 'user.email', 'warpkeep-test@example.invalid']);
    const tracked = join(repository, 'tracked.txt');
    writeFileSync(tracked, 'exact checkout\n');
    git(['add', 'tracked.txt']);
    git(['commit', '-m', 'exact checkout']);
    git(['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep']);
    const head = git(['rev-parse', 'HEAD']);
    const inspect = () => attestAuthBridgeNotificationPreparedDeployCheckout({
      repositoryRoot: realpathSync(repository),
      sourceCommit: head,
    });

    git(['update-index', '--assume-unchanged', '--', 'tracked.txt']);
    writeFileSync(tracked, 'mutated\n');
    await expect(inspect()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_CHECKOUT_MISMATCH',
    });

    git(['update-index', '--no-assume-unchanged', '--', 'tracked.txt']);
    writeFileSync(tracked, 'exact checkout\n');
    git(['update-index', '--refresh']);
    git(['update-index', '--skip-worktree', '--', 'tracked.txt']);
    writeFileSync(tracked, 'mutated\n');
    await expect(inspect()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_CHECKOUT_MISMATCH',
    });

    git(['update-index', '--no-skip-worktree', '--', 'tracked.txt']);
    writeFileSync(tracked, 'exact checkout\n');
    git(['update-index', '--refresh']);
    writeFileSync(tracked, 'mutated\n');
    await expect(inspect()).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED',
    });
  });

  it('re-attests protected main and the current in-progress workflow per effect', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/branches/main')) return rawResponse({
        name: 'main',
        protected: true,
        commit: { sha: SOURCE_COMMIT },
      }, url);
      if (url.endsWith('/actions/runs/1001')) return rawResponse({
        id: 1001,
        run_attempt: 2,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        head_branch: 'main',
        head_sha: SOURCE_COMMIT,
        path: '.github/workflows/notification-bridge-prepared.yml',
        repository: { full_name: 'ael-dev3/Warpkeep' },
      }, url);
      throw new Error('unexpected request');
    });
    let interrupted = false;
    const attestCheckout = vi.fn(async () => realpathSync(process.cwd()));
    const permit = createAuthBridgeNotificationPreparedGithubWritePermit({
      githubToken: 'github-test-token-value-1234567890',
      sourceCommit: SOURCE_COMMIT,
      runId: '1001',
      runAttempt: 2,
      repositoryRoot: realpathSync(process.cwd()),
      fetchImpl,
      attestCheckout,
      isInterrupted: () => interrupted,
    });
    await expect(permit('upload')).resolves.toBe(true);
    await expect(permit('release')).resolves.toBe(true);
    await expect(permit('recovery')).resolves.toBe(true);
    expect(attestCheckout).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    interrupted = true;
    await expect(permit('release')).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('rejects a recovery permit when protected main no longer names the source', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/branches/main')) return rawResponse({
        name: 'main',
        protected: true,
        commit: { sha: 'd'.repeat(40) },
      }, url);
      if (url.endsWith('/actions/runs/1001')) return rawResponse({
        id: 1001,
        run_attempt: 2,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        head_branch: 'main',
        head_sha: SOURCE_COMMIT,
        path: '.github/workflows/notification-bridge-prepared.yml',
        repository: { full_name: 'ael-dev3/Warpkeep' },
      }, url);
      throw new Error('unexpected request');
    });
    const attestCheckout = vi.fn(async () => realpathSync(process.cwd()));
    const permit = createAuthBridgeNotificationPreparedGithubWritePermit({
      githubToken: 'github-test-token-value-1234567890',
      sourceCommit: SOURCE_COMMIT,
      runId: '1001',
      runAttempt: 2,
      repositoryRoot: realpathSync(process.cwd()),
      fetchImpl,
      attestCheckout,
    });

    await expect(permit('recovery')).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED',
    });
    expect(attestCheckout).toHaveBeenCalledExactlyOnceWith({
      repositoryRoot: realpathSync(process.cwd()),
      sourceCommit: SOURCE_COMMIT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects a recovery permit when the in-progress run attempt changed', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/branches/main')) return rawResponse({
        name: 'main',
        protected: true,
        commit: { sha: SOURCE_COMMIT },
      }, url);
      if (url.endsWith('/actions/runs/1001')) return rawResponse({
        id: 1001,
        run_attempt: 3,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        head_branch: 'main',
        head_sha: SOURCE_COMMIT,
        path: '.github/workflows/notification-bridge-prepared.yml',
        repository: { full_name: 'ael-dev3/Warpkeep' },
      }, url);
      throw new Error('unexpected request');
    });
    const attestCheckout = vi.fn(async () => realpathSync(process.cwd()));
    const permit = createAuthBridgeNotificationPreparedGithubWritePermit({
      githubToken: 'github-test-token-value-1234567890',
      sourceCommit: SOURCE_COMMIT,
      runId: '1001',
      runAttempt: 2,
      repositoryRoot: realpathSync(process.cwd()),
      fetchImpl,
      attestCheckout,
    });

    await expect(permit('recovery')).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED',
    });
    expect(attestCheckout).toHaveBeenCalledExactlyOnceWith({
      repositoryRoot: realpathSync(process.cwd()),
      sourceCommit: SOURCE_COMMIT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
