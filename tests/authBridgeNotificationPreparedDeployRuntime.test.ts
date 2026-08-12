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
  createAuthBridgeNotificationPreparedGithubWritePermit,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const OLD_VERSION_ID = '987e6543-e21b-42d3-a456-426614174000';
const NOW = new Date('2026-08-13T00:00:00.000Z');
const temporaryDirectories: string[] = [];

type JournalPhase =
  | 'prepared'
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

function response(body: unknown, url: string, resultInfo?: unknown) {
  const value = new Response(JSON.stringify({
    success: true,
    errors: [],
    messages: [],
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

describe('auth-bridge prepared durable deployment journal', () => {
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
        await journal.uploadInvoked(uploadMarker);
        expect(journal.inspect().phases).toEqual(['prepared', 'upload-invoked']);
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
        await journal.uploadInvoked(uploadMarker);
        expect(journal.inspect().phase).toBe('upload-invoked');
      },
    });
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...journalOptions(home, value),
      runAttempt: 3,
      clock: () => new Date('2026-08-13T00:00:01.000Z'),
      operation: journal => {
        expect(journal.inspect().phases).toEqual(['prepared', 'upload-invoked']);
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
    const bindings = [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
    ];
    const raw = {
      id: VERSION_ID,
      annotations: {
        'workers/tag': value.versionTag,
        'workers/message': value.versionMessage,
      },
      metadata: {
        created_on: '2026-08-12T23:58:00.000Z',
        source: 'api',
      },
      resources: {
        bindings,
        script_runtime: {
          compatibility_date: value.compatibilityDate,
          compatibility_flags: value.compatibilityFlags,
          limits: {},
          migration_tag: 'v5',
          usage_model: 'standard',
          exports: {
            default: { type: 'worker', cache: { enabled: false }, state: 'created' },
            ...Object.fromEntries(value.durableObjectBindings.map(binding => [
              binding.className,
              { type: 'durable-object', storage: 'sqlite', state: 'created' },
            ])),
          },
        },
      },
    };
    expect(projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: raw,
      contract: value,
      sourceDigest: digest,
    })).toEqual({ ...value, versionId: VERSION_ID, createdAt: raw.metadata.created_on });
    expect(() => projectAuthBridgeNotificationPreparedCloudflareVersion({
      value: {
        ...raw,
        resources: { ...raw.resources, bindings: bindings.slice(1) },
      },
      contract: value,
      sourceDigest: digest,
    })).toThrow('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_BINDING_MISMATCH');
    for (const scriptRuntime of [
      {
        ...raw.resources.script_runtime,
        exports: {
          ...raw.resources.script_runtime.exports,
          default: { type: 'worker', cache: { enabled: true }, state: 'created' },
        },
      },
      { ...raw.resources.script_runtime, limits: { cpu_ms: 1 } },
      { ...raw.resources.script_runtime, usage_model: 'unbound' },
    ]) {
      expect(() => projectAuthBridgeNotificationPreparedCloudflareVersion({
        value: {
          ...raw,
          resources: { ...raw.resources, script_runtime: scriptRuntime },
        },
        contract: value,
        sourceDigest: digest,
      })).toThrow(/AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_(?:EXPORT|RUNTIME)_MISMATCH/u);
    }
  });

  it('derives the immutable uploaded-source proof from version-specific modules', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const bindings = [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
    ];
    const stable = {
      id: VERSION_ID,
      annotations: {
        'workers/tag': value.versionTag,
        'workers/message': value.versionMessage,
      },
      metadata: {
        created_on: '2026-08-12T23:58:00.000Z',
        source: 'api',
      },
      resources: {
        bindings,
        script: { etag: 'e'.repeat(64) },
        script_runtime: {
          compatibility_date: value.compatibilityDate,
          compatibility_flags: value.compatibilityFlags,
          migration_tag: 'v5',
          exports: {
            default: { type: 'worker' },
            ...Object.fromEntries(value.durableObjectBindings.map(binding => [
              binding.className,
              { type: 'durable-object', storage: 'sqlite', state: 'created' },
            ])),
          },
        },
      },
    };
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
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      journal: { inspect: () => ({ phase: 'uploaded' }) },
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
    const bindings = [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
    ];
    const targetDetail = {
      id: VERSION_ID,
      annotations: {
        'workers/tag': value.versionTag,
        'workers/message': value.versionMessage,
      },
      metadata: { created_on: '2026-08-12T23:58:00.000Z', source: 'api' },
      resources: {
        bindings,
        script: { etag: 'e'.repeat(64) },
        script_runtime: {
          compatibility_date: value.compatibilityDate,
          compatibility_flags: value.compatibilityFlags,
          migration_tag: 'v5',
          exports: {
            default: { type: 'worker' },
            ...Object.fromEntries(value.durableObjectBindings.map(binding => [
              binding.className,
              { type: 'durable-object', storage: 'sqlite', state: 'created' },
            ])),
          },
        },
      },
    };
    const oldDetail = {
      id: OLD_VERSION_ID,
      annotations: {},
      metadata: { created_on: '2026-08-12T23:50:00.000Z', source: 'api' },
      resources: { bindings: [] },
    };
    let uploaded = false;
    let targetLive = false;
    let phase: JournalPhase = null;
    let uploadMode: 'migration' | 'version' | null = null;
    let uploadPosts = 0;
    let releasePosts = 0;
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
        items: uploaded ? [{
          id: VERSION_ID,
          annotations: {
            'workers/tag': value.versionTag,
            'workers/message': value.versionMessage,
          },
        }] : [],
      }, url);
      if (url.endsWith('/workers/scripts')) {
        return response([{
          id: value.workerName,
          migration_tag: 'v5',
          cache_options: { enabled: cacheEnabled, cross_version_cache: true },
        }], url);
      }
      if (url.endsWith('/secrets')) {
        return response(value.secretBindingNames.map(name => ({
          name,
          type: 'secret_text',
        })), url);
      }
      if (url.endsWith('/versions?bindings_inherit=strict') && method === 'POST') {
        uploadPosts += 1;
        uploaded = true;
        return response({ id: VERSION_ID }, url);
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
        targetLive = true;
        return response({ id: '223e4567-e89b-42d3-a456-426614174000' }, url);
      }
      if (url.endsWith('/deployments')) {
        const target = targetLive;
        return response([{
          id: target
            ? '223e4567-e89b-42d3-a456-426614174000'
            : '323e4567-e89b-42d3-a456-426614174000',
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
      inspect: () => ({ phase, uploadMode }),
      prepared: vi.fn(async () => { phase = 'prepared'; }),
      uploadInvoked: vi.fn(async (input: Readonly<Record<string, unknown>>) => {
        if (input.uploadMode !== 'migration' && input.uploadMode !== 'version') {
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
      versionTag: null,
      sourceCommit: null,
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
    uploadMode = 'migration';
    targetMessage = value.versionMessage;
    targetTrigger = 'upload';
    await expect(runtime.inspectDeployment()).resolves.toMatchObject({
      versionId: VERSION_ID,
    });
    for (const trigger of [null, 'wrong-trigger'] as const) {
      targetTrigger = trigger;
      await expect(runtime.inspectDeployment()).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_DEPLOYMENT_INVALID',
      });
    }
    runtime.dispose();
  });

  it('performs one direct mutation and applies only the reviewed v4-to-v5 migration', async () => {
    const template = multipart();
    const contentType = 'multipart/form-data; boundary=warpkeep-boundary-v1';
    const digest = inspectAuthBridgeNotificationPreparedMultipart(template, contentType)
      .sourceDigest;
    const value = contract(digest);
    const body = uploadMultipart(value);
    const urls: string[] = [];
    const prerequisiteResponse = (url: string, migrationTag = 'v5') => {
      if (url.endsWith('/workers/scripts')) {
        return response([{ id: value.workerName, migration_tag: migrationTag }], url);
      }
      if (url.endsWith('/secrets')) {
        return response(value.secretBindingNames.map(name => ({
          name,
          type: 'secret_text',
        })), url);
      }
      if (url.includes('/workers/domains?service=')) return response([{
        id: 'domain-id',
        zone_id: ZONE_ID,
        zone_name: 'warpkeep.com',
        hostname: 'auth.warpkeep.com',
        service: 'warpkeep-auth-bridge',
        environment: 'production',
        cert_id: 'certificate-id',
      }], url, {
        count: 1,
        page: 1,
        per_page: 100,
        total_count: 1,
        total_pages: 1,
      });
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
      return undefined;
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(`${init?.method}:${url}`);
      const prerequisite = prerequisiteResponse(url);
      if (prerequisite !== undefined) return prerequisite;
      if (url.endsWith('/versions?bindings_inherit=strict')) {
        return response({ id: VERSION_ID }, url);
      }
      if (url.endsWith('/deployments')) return response({ id: VERSION_ID }, url);
      throw new Error('unexpected request');
    });
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      journal: { inspect: () => ({ phase: 'prepared' }) },
    });
    const uploadPlan = await runtime.prepareUpload(value);
    await expect(runtime.uploadVersion(value, uploadPlan)).resolves.toEqual({
      versionId: VERSION_ID,
    });
    await runtime.releaseVersion({
      versionId: VERSION_ID,
      percentage: 100,
      message: value.versionMessage,
    });
    expect(urls.filter(item => item.startsWith('POST:'))).toHaveLength(2);

    const failedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const prerequisite = prerequisiteResponse(url);
      if (prerequisite !== undefined) return prerequisite;
      if (init?.method === 'POST') throw new Error('connection lost');
      throw new Error('unexpected request');
    });
    const failed = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: failedFetch,
      journal: { inspect: () => ({ phase: 'upload-invoked' }) },
    });
    const failedPlan = await failed.prepareUpload(value);
    await expect(failed.uploadVersion(value, failedPlan)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_OUTCOME_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    expect(failedFetch.mock.calls.filter(([, init]) => init?.method === 'POST'))
      .toHaveLength(1);

    let migrationUpload: RequestInit | undefined;
    let migrationUploadBody: Buffer | undefined;
    const migrationFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/versions?deployable=true')) {
        return response({ items: [] }, url);
      }
      const prerequisite = prerequisiteResponse(url, 'v4');
      if (prerequisite !== undefined) return prerequisite;
      if (url.endsWith('/warpkeep-auth-bridge?excludeScript=true&bindings_inherit=strict')) {
        migrationUpload = init;
        migrationUploadBody = Buffer.from(init?.body as Buffer);
        return response({ id: value.workerName, migration_tag: 'v5' }, url);
      }
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    const migrating = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value,
      apiToken: 'cloudflare-test-token-value-1234567890',
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl: migrationFetch,
      journal: {
        inspect: () => ({ phase: 'prepared', uploadMode: 'migration' as const }),
      },
    });
    await expect(migrating.reconcileVersion(value)).resolves.toEqual([]);
    await expect(migrating.prepareUpload(value)).resolves.toEqual({ mode: 'migration' });
    await expect(migrating.uploadVersion(value, { mode: 'migration' })).resolves.toEqual({});
    expect(migrationUpload?.method).toBe('PUT');
    expect(migrationUploadBody).toBeInstanceOf(Buffer);
    expect(inspectAuthBridgeNotificationPreparedMultipart(
      migrationUploadBody as Buffer,
      String((migrationUpload?.headers as Record<string, string>)['content-type']),
    ).metadata.migrations).toEqual({
      old_tag: 'v4',
      new_tag: 'v5',
      steps: [{ new_sqlite_classes: ['AdmissionNotification'] }],
    });
    expect(migrationFetch.mock.calls.filter(([, init]) => init?.method === 'PUT'))
      .toHaveLength(1);
    runtime.dispose();
    failed.dispose();
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
      repositoryRoot: realpathSync(process.cwd()),
      serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath,
      wranglerEntrypoint: process.execPath,
      multipartBody: body,
      multipartContentType: contentType,
      fetchImpl,
      settleDelayImpl,
      journal: {
        inspect: () => ({ phase: 'upload-invoked', uploadMode: 'version' as const }),
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
