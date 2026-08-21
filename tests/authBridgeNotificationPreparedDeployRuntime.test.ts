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
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
  authBridgeNotificationPreparedVersionContract,
  executeAuthBridgeNotificationPreparedDeployAdapter,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  authBridgeNotificationPreparedSourceDigest,
  attestAuthBridgeNotificationPreparedCandidateMultipartMetadata,
  buildAuthBridgeNotificationPreparedWranglerMultipart,
  createAuthBridgeNotificationPreparedCloudflareRuntime,
  inspectAuthBridgeNotificationPreparedMultipart,
  parseAuthBridgeNotificationPreparedMultipart,
  projectAuthBridgeNotificationPreparedCloudflareVersion,
} from '../scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD,
  withAuthBridgeNotificationPreparedDeployJournal,
} from '../scripts/auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  attestAuthBridgeNotificationPreparedDeployCheckout,
  authBridgeNotificationPreparedDeployTestSeams,
  createAuthBridgeNotificationPreparedGithubWritePermit,
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
const temporaryDirectories: string[] = [];

type JournalPhase =
  | 'prepared'
  | 'remote-reconcile-started'
  | 'upload-invoked'
  | 'uploaded'
  | 'release-uncertain'
  | 'release-invoked'
  | 'completed'
  | null;

const BEFORE_MODES = Object.freeze({
  bridgeSourceCommit: SOURCE_COMMIT,
  publicAuthEnabled: true,
  accessExpectedFidRequired: false,
});
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
    exports: runtimeExports,
  }: Readonly<{
    id?: string;
    number?: number;
    createdAt?: string;
    etag?: string;
    secretBindingNames?: readonly string[];
    annotations?: Readonly<Record<string, unknown>>;
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
          text,
        })),
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
  it('validates and immediately removes the owner FID with all credentials', () => {
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
      WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
    };
    const values = authBridgeNotificationPreparedDeployTestSeams
      .copyAndScrubEnvironment(environment);
    expect(values.WARPKEEP_PLAYER_CANARY_OWNER_FID)
      .toBe(PLAYER_CANARY_OWNER_FID);
    for (const name of [
      'GITHUB_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_PLAYER_CANARY_OWNER_FID',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    ]) expect(environment).not.toHaveProperty(name);

    for (const invalid of ['0', '01', '-1', '9007199254740992']) {
      const hostile = { ...environment, ...{
        GITHUB_TOKEN: 'github-owner-test-token-value',
        WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
          'cloudflare-owner-test-token-value',
        WARPKEEP_PLAYER_CANARY_OWNER_FID: invalid,
        WARPKEEP_PRODUCTION_ADMIN_TOKEN: 'production-admin-test-token-value',
      } };
      expect(() => authBridgeNotificationPreparedDeployTestSeams
        .copyAndScrubEnvironment(hostile))
        .toThrow(/ENVIRONMENT_INVALID/u);
      expect(hostile).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    }
  });
});

describe('auth-bridge prepared durable deployment journal', () => {
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
    expect(raw.resources.bindings).toHaveLength(28);
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
    let remoteBody = contentMultipart();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/versions?deployable=true')) return response({
        items: [{
          id: VERSION_ID,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }],
      }, url);
      if (url.includes('/content/v2?version=')) {
        return multipartResponse(remoteBody, url);
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
      journal: { inspect: () => ({ phase: 'prepared' }) },
    });
    await expect(runtime.inspectVersion(VERSION_ID)).resolves.toEqual({
      ...value,
      versionId: VERSION_ID,
      createdAt: stable.metadata.created_on,
    });
    await expect(runtime.reconcileVersion(value)).resolves.toEqual([VERSION_ID]);
    expect(fetchImpl).toHaveBeenCalledTimes(5);

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
        'workers/tag': `notification-b0-${SOURCE_COMMIT}`,
        'workers/message': `Warpkeep notification B0 ${SOURCE_COMMIT}`,
        'workers/triggered_by': 'version_upload',
      },
    });
    let uploaded = false;
    let targetLive = false;
    let phase: JournalPhase = null;
    let uploadMode: 'version' | null = null;
    let predecessorDeploymentId: string | null = null;
    let predecessorVersionId: string | null = null;
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
    let targetTrigger: string | null = 'warpkeep-notification-prepared';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/versions?deployable=true')) return response({
        items: [{
          id: OLD_VERSION_ID,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }, ...(uploaded ? [{
          id: VERSION_ID,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }] : [])],
      }, url);
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
      if (url.endsWith('/versions?bindings_inherit=strict') && method === 'POST') {
        const candidate = inspectAuthBridgeNotificationPreparedMultipart(
          Buffer.from(init?.body as Buffer),
          String((init?.headers as Record<string, string>)['content-type']),
        );
        expect(candidate.metadata).not.toHaveProperty('keep_bindings');
        expect((candidate.metadata.bindings as { type?: string }[]).filter(
          (binding: { type?: string }) => binding.type === 'inherit',
        )).toEqual(value.secretBindingNames
          .filter(name => name !== 'PLAYER_CANARY_OWNER_FID')
          .map(name => ({
            name,
            type: 'inherit',
            version_id: OLD_VERSION_ID,
          })));
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
      versionTag: `notification-b0-${SOURCE_COMMIT}`,
      sourceCommit: SOURCE_COMMIT,
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
    expect(targetLive).toBe(true);
    expect(phase).toBe('completed');
    for (const [message, trigger] of [
      [null, 'warpkeep-notification-prepared'],
      ['wrong message', 'warpkeep-notification-prepared'],
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

  it('uploads one nondeploying seven-binding candidate and fails closed on v4', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const urls: string[] = [];
    let predecessorExtraBinding = false;
    let includeSameTagNonpredecessor = false;
    let livePredecessorDeploymentId = OLD_DEPLOYMENT_ID;
    const predecessorDetail = exactVersionDetail(value, {
      id: OLD_VERSION_ID,
      number: 1,
      createdAt: '2026-08-12T23:50:00.000Z',
      etag: 'd'.repeat(64),
      secretBindingNames: value.secretBindingNames.filter(
        name => name !== 'PLAYER_CANARY_OWNER_FID',
      ),
      annotations: {
        'workers/tag': `notification-b0-${SOURCE_COMMIT}`,
        'workers/message': `Warpkeep notification B0 ${SOURCE_COMMIT}`,
        'workers/triggered_by': 'version_upload',
      },
    });
    const nonPredecessorDetail = exactVersionDetail(value, {
      id: NON_PREDECESSOR_VERSION_ID,
      number: 3,
      createdAt: '2026-08-12T23:52:00.000Z',
      etag: 'c'.repeat(64),
      secretBindingNames: value.secretBindingNames.filter(
        name => name !== 'PLAYER_CANARY_OWNER_FID',
      ),
    });
    let predecessorSourceBody = contentMultipart();
    const prerequisiteResponse = (
      url: string,
      method: string,
      migrationTag = 'v5',
    ) => {
      if (url.includes('/versions?deployable=true')) return response({
        items: [
          {
            id: OLD_VERSION_ID,
            annotations: {
              'workers/tag': value.versionTag,
              'workers/message': value.versionMessage,
            },
          },
          {
            id: CONCURRENT_VERSION_ID,
            annotations: {
              'workers/tag': 'concurrent-nondeployed-secret-change',
              'workers/message': 'concurrent-nondeployed-secret-change',
            },
          },
          ...(includeSameTagNonpredecessor ? [{
            id: NON_PREDECESSOR_VERSION_ID,
            annotations: {
              'workers/tag': value.versionTag,
              'workers/message': value.versionMessage,
            },
          }] : []),
        ],
      }, url);
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
      if (url.endsWith(`/versions/${NON_PREDECESSOR_VERSION_ID}`)) {
        return response(nonPredecessorDetail, url);
      }
      if (url.endsWith(`/content/v2?version=${OLD_VERSION_ID}`)) {
        return multipartResponse(predecessorSourceBody, url);
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
      if (url.endsWith('/versions?bindings_inherit=strict') && method === 'POST') {
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
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);

    const uploadPlan = await runtime.prepareUpload(value);
    expect(uploadPlan).toEqual({
      mode: 'version',
      predecessorDeploymentId: OLD_DEPLOYMENT_ID,
      predecessorVersionId: OLD_VERSION_ID,
    });
    await expect(runtime.reconcileVersion(value)).resolves.toEqual([]);
    includeSameTagNonpredecessor = true;
    await expect(runtime.reconcileVersion(value)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_MISMATCH',
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(0);
    includeSameTagNonpredecessor = false;
    await expect(runtime.uploadVersion(value, uploadPlan)).resolves.toEqual({
      versionId: VERSION_ID,
    });
    const candidate = inspectAuthBridgeNotificationPreparedMultipart(
      candidateBody as Buffer,
      contentType,
    );
    expect(candidate.metadata).not.toHaveProperty('keep_bindings');
    const inheritedBindings = (candidate.metadata.bindings as {
      name?: string;
      type?: string;
      version_id?: string;
    }[]).filter(binding => binding.type === 'inherit');
    expect(inheritedBindings).toEqual(value.secretBindingNames
      .filter(name => name !== 'PLAYER_CANARY_OWNER_FID')
      .map(name => ({
        name,
        type: 'inherit',
        version_id: OLD_VERSION_ID,
      })));
    expect((candidate.metadata.bindings as { type?: string }[]).filter(
      (binding: { type?: string }) => binding.type === 'secret_text',
    )).toEqual([{
      name: 'PLAYER_CANARY_OWNER_FID',
      text: PLAYER_CANARY_OWNER_FID,
      type: 'secret_text',
    }]);
    expect(attestAuthBridgeNotificationPreparedCandidateMultipartMetadata({
      metadata: candidate.metadata,
      contract: value,
      playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
      predecessorVersionId: OLD_VERSION_ID,
    })).toBe(true);
    const candidateBindings = candidate.metadata.bindings as Record<string, unknown>[];
    const firstInheritedIndex = candidateBindings.findIndex(
      binding => binding.type === 'inherit',
    );
    const hostileBindings = [
      candidateBindings.filter((_, index) => index !== firstInheritedIndex),
      candidateBindings.map((binding, index) => index === firstInheritedIndex
        ? { ...binding, name: 'UNREVIEWED_SECRET' }
        : binding),
      candidateBindings.map((binding, index) => index === firstInheritedIndex
        ? { ...binding, type: 'secret_text' }
        : binding),
      candidateBindings.map((binding, index) => index === firstInheritedIndex
        ? { ...binding, version_id: NON_PREDECESSOR_VERSION_ID }
        : binding),
      [
        ...candidateBindings,
        {
          name: value.secretBindingNames[0],
          type: 'inherit',
          version_id: OLD_VERSION_ID,
        },
      ],
    ];
    for (const bindings of hostileBindings) {
      expect(() => attestAuthBridgeNotificationPreparedCandidateMultipartMetadata({
        metadata: { ...candidate.metadata, bindings },
        contract: value,
        playerCanaryOwnerFid: PLAYER_CANARY_OWNER_FID,
        predecessorVersionId: OLD_VERSION_ID,
      })).toThrow('AUTH_BRIDGE_PREPARED_CLOUDFLARE_MULTIPART_METADATA_MISMATCH');
    }
    const release = {
      versionId: VERSION_ID,
      predecessorDeploymentId: OLD_DEPLOYMENT_ID,
      predecessorVersionId: OLD_VERSION_ID,
      percentage: 100,
      message: value.versionMessage,
    } as const;
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

    const failedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/secrets')) throw new Error('legacy secret endpoint forbidden');
      const prerequisite = prerequisiteResponse(url, method);
      if (prerequisite !== undefined) return prerequisite;
      if (init?.method === 'POST') throw new Error('connection lost');
      throw new Error('unexpected request');
    });
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
        if (url.endsWith('/versions?bindings_inherit=strict') && method === 'POST') {
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

  it('settles a prior upload marker and requires adjudication without another write', async () => {
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
    expect(listReads).toBe(5);
    expect(settleDelayImpl).toHaveBeenCalledTimes(4);
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
    expect(attestCheckout).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    interrupted = true;
    await expect(permit('release')).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
