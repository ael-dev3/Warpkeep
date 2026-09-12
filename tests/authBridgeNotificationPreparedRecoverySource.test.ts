// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  authBridgeNotificationPreparedVersionContract,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  createAuthBridgeNotificationPreparedCloudflareRuntime,
  inspectAuthBridgeNotificationPreparedRecoverySource,
} from '../scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs';

const ACCOUNT = 'a'.repeat(32);
const ZONE = 'b'.repeat(32);
const SOURCE = 'c'.repeat(40);
const VERSION = '123e4567-e89b-42d3-a456-426614174000';
const PTR = '9'.repeat(64);
const NOW = new Date('2026-09-12T10:00:00.000Z');
const ORIGIN = 'https://api.cloudflare.com';
const ACCOUNT_PATH = `/client/v4/accounts/${ACCOUNT}/workers`;
const BASE = `${ACCOUNT_PATH}/scripts/warpkeep-auth-bridge`;
const CONTENT = `${BASE}/content/v2?version=${VERSION}`;
const DETAIL = `${BASE}/versions/${VERSION}`;
const DOMAINS = `${ACCOUNT_PATH}/domains?service=warpkeep-auth-bridge`;
const ROUTES = `${ACCOUNT_PATH}/services/warpkeep-auth-bridge/environments/production/routes?show_zonename=true`;
// Fixed vector: the only executable part is 61 bytes, with SHA-256
// fdc916823f2e7a385c31fc9d5fa2f238a134f5888137e07ee5c4af91f25c9bfb.
// The expected multipart source digest is not derived by the inspector under test.
const SOURCE_DIGEST = '5f0b19aa2b2912605b073d6f36e76a2f4f1f7b24aa39b1632d002307bece37ee';
const MODULE = 'export default { fetch() { return new Response("ready") } };\n';
const NAMESPACES = [
  ['ADMISSION_NOTIFICATIONS', 'AdmissionNotification', '01d53045d07a4f79ab21646de395d82c'],
  ['AUTH_RATE_LIMITER', 'AuthRateLimiter', 'd800d603256f4a0f9907ba0b9267bc89'],
  ['CHALLENGE_REPLAY_GUARD', 'ChallengeReplayGuard', 'bbda3461bd4c4caf91478705d65374fc'],
  ['QA_CHALLENGE_REPLAY_GUARD', 'QaChallengeReplayGuard', '28d55581e3124399b8cfbc2bd4019bef'],
  ['SESSION_FAMILIES', 'SessionFamily', 'b4525a7a374743deb3666471fe2ae06c'],
] as const;
const NAMED_HANDLERS = [
  'AdmissionNotification', 'AuthRateLimiter', 'ChallengeReplayGuard',
  'DurableObjectAdmissionNotificationStore', 'DurableObjectChallengeStore',
  'DurableObjectQaObserverChallengeStore', 'DurableObjectSessionFamilyStore',
  'MemoryChallengeStore', 'MemoryQaObserverChallengeStore', 'MemorySessionFamilyStore',
  'MiniAppWebhookInvalidError', 'MiniAppWebhookVerifierUnavailableError',
  'QaChallengeReplayGuard', 'SessionFamily', 'SpacetimeHttpAccessRequestResolver',
  'SpacetimeHttpAuthEpochResolver', 'SpacetimeHttpQaObserverResolver',
  'admissionNotificationDeliveryContractDigest', 'admissionNotificationDeliveryContractVector',
  'createAuthBridge', 'createMiniAppWebhookVerifier', 'serializeAdmissionNotificationDeliveryContract',
];
type Contract = Readonly<Record<string, unknown>> & Readonly<{
  variables: Readonly<Record<string, string>>;
  secretBindingNames: readonly string[];
  durableObjectBindings: readonly Readonly<{ name: string; className: string }>[];
}>;

function multipart(module = MODULE, name = 'index.js', boundary = 'recovery-source') {
  return Buffer.from(`--${boundary}\r\n`
    + `Content-Disposition: form-data; name="${name}"; filename="${name}"\r\n`
    + 'Content-Type: application/javascript+module\r\n\r\n'
    + module + `\r\n--${boundary}--\r\n`);
}

function appendMetadata(body: Buffer, contents = '{"main_module":"index.js"}',
  disposition = 'name="metadata"', contentType = 'application/json') {
  return Buffer.from(body.toString().replace('--recovery-source--\r\n',
    `--recovery-source\r\nContent-Disposition: form-data; ${disposition}\r\n`
      + (contentType ? `Content-Type: ${contentType}\r\n` : '')
      + `\r\n${contents}\r\n--recovery-source--\r\n`));
}

function fixture() {
  const contract = authBridgeNotificationPreparedVersionContract({
    accountId: ACCOUNT, zoneId: ZONE, sourceCommit: SOURCE, sourceDigest: SOURCE_DIGEST,
    beforeModes: {
      bridgeSourceCommit: AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      publicAuthEnabled: true, accessExpectedFidRequired: false,
    },
  }) as Contract;
  const bindings: Record<string, string>[] = [
    ...Object.entries(contract.variables).map(([name, text]) => ({ name, type: 'plain_text', text })),
    { name: 'PTR_SPACETIMEDB_DATABASE', type: 'plain_text', text: PTR },
    ...contract.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
    ...NAMESPACES.map(([name, class_name, namespace_id]) => ({
      name, type: 'durable_object_namespace', class_name, namespace_id,
    })),
  ];
  const version = {
    id: VERSION, number: 2,
    annotations: { 'workers/message': `Warpkeep notification preparation ${SOURCE}`,
      'workers/tag': `notification-prepared-${SOURCE}`, 'workers/triggered_by': 'version_upload' },
    metadata: { author_email: '', author_id: 'e'.repeat(32),
      created_on: '2026-09-11T09:00:00.000Z', has_preview: false, source: 'api' },
    resources: {
      bindings,
      script: { etag: 'f'.repeat(64), handlers: ['fetch'], last_deployed_from: 'api',
        named_handlers: NAMED_HANDLERS.map(name => ({ name, handlers: ['class'] })) },
      script_runtime: { compatibility_date: '2026-07-11', compatibility_flags: ['nodejs_compat'],
        migration_tag: 'v5', usage_model: 'standard' },
    },
  };
  const domain = { id: 'domain', zone_id: ZONE, zone_name: 'warpkeep.com',
    hostname: 'auth.warpkeep.com', service: 'warpkeep-auth-bridge', environment: 'production',
    cert_id: 'certificate', enabled: true, previews_enabled: false };
  const script = { id: 'warpkeep-auth-bridge', migration_tag: 'v5', cache_options: { enabled: false } };
  const records = new Map<string, unknown>([
    [`${ACCOUNT_PATH}/scripts`, [script]], [DOMAINS, [domain]],
    [`${BASE}/subdomain`, { enabled: false, previews_enabled: false }],
    [ROUTES, []], [`${BASE}/script-settings`, { logpush: false, observability: { enabled: false } }],
    [DETAIL, version],
  ]);
  const state = { contract, records, version, bindings, domain, script,
    content: multipart(), entrypoint: 'index.js',
    boundary: 'recovery-source', responseDate: NOW.toUTCString(),
    redirect: false, wrongUrl: false, contentLength: null as string | null };
  const fetchImpl = vi.fn(async (urlInput: string | URL | Request, options?: RequestInit) => {
    const url = String(urlInput);
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    expect(options?.cache).toBe('no-store');
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const requestUrl = new URL(url);
    expect(requestUrl.origin).toBe(ORIGIN);
    expect(requestUrl.username).toBe('');
    expect(requestUrl.password).toBe('');
    expect(requestUrl.hash).toBe('');
    const path = `${requestUrl.pathname}${requestUrl.search}`;
    if (path !== CONTENT && !records.has(path)) throw new Error('Unexpected request');
    const headers = new Headers({ date: state.responseDate,
      'content-type': path === CONTENT
        ? `multipart/form-data; boundary=${state.boundary}` : 'application/json' });
    if (path === CONTENT) headers.set('cf-entrypoint', state.entrypoint);
    if (state.contentLength !== null) headers.set('content-length', state.contentLength);
    const body = path === CONTENT ? Uint8Array.from(state.content) : JSON.stringify({
      success: true, errors: [], messages: [], result: records.get(path),
      ...(path === DOMAINS ? { result_info: { count: 1 } } : {}),
    });
    const response = new Response(body, { status: 200, headers });
    Object.defineProperty(response, 'url', { value: state.wrongUrl ? `${ORIGIN}/different` : url });
    Object.defineProperty(response, 'redirected', { value: state.redirect });
    return response;
  });
  const options = { contract, workerVersionId: VERSION, ptrSpacetimeDbDatabase: PTR,
    apiToken: 'cloudflare-recovery-fixture-token', fetchImpl: fetchImpl as typeof fetch, now: NOW };
  return { ...state, state, fetchImpl, options };
}
type Fixture = ReturnType<typeof fixture>;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('original prepared Worker source and configuration recovery inspection', () => {
  it('authenticates real response shapes and uploaded modules using only the exact read endpoints', async () => {
    const f = fixture();
    const result = await inspectAuthBridgeNotificationPreparedRecoverySource(f.options);
    expect(result).toMatchObject({ workerVersionId: VERSION, bridgeSourceCommit: SOURCE,
      sourceDigest: SOURCE_DIGEST, ptrDatabaseIdentity: PTR, oldestObservedAt: NOW.toISOString() });
    expect(Date.parse(result.inspectedAt)).toBeGreaterThanOrEqual(NOW.getTime());
    expect(Object.isFrozen(result)).toBe(true);
    expect(f.fetchImpl.mock.calls.map(([url]) => String(url).slice(ORIGIN.length)).sort())
      .toEqual([...f.records.keys(), CONTENT].sort());
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('accepts a different multipart boundary without changing module authority', async () => {
    const f = fixture();
    f.state.boundary = 'another-boundary'; f.state.content = multipart(MODULE, 'index.js', f.state.boundary);
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options))
      .resolves.toMatchObject({ sourceDigest: SOURCE_DIGEST });
  });

  it.each(['application/json', ''])('accepts a single JSON metadata part with content type %j', async contentType => {
    const f = fixture();
    f.state.content = appendMetadata(f.state.content, undefined, undefined, contentType);
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options))
      .resolves.toMatchObject({ sourceDigest: SOURCE_DIGEST });
  });

  it.each([
    ['executable metadata part', (body: Buffer) => appendMetadata(body, 'export default 123;', 'name="metadata"; filename="extra.js"', 'application/javascript+module')],
    ['JSON module disguised as metadata', (body: Buffer) => appendMetadata(body, undefined, 'name="metadata"; filename="extra.json"')],
    ['metadata-named JSON module', (body: Buffer) => appendMetadata(body, undefined, 'name="metadata"; filename="metadata"')],
    ['duplicate metadata', (body: Buffer) => appendMetadata(appendMetadata(body))],
    ['malformed metadata JSON', (body: Buffer) => appendMetadata(body, 'not JSON')],
    ['metadata array', (body: Buffer) => appendMetadata(body, '[]')],
    ['metadata without an entrypoint', (body: Buffer) => appendMetadata(body, '{}')],
    ['metadata entrypoint mismatch', (body: Buffer) => appendMetadata(body, '{"main_module":"extra.js"}')],
  ] as const)('rejects %s instead of excluding unverified bytes from the historical digest', async (_label, change) => {
    const f = fixture(); f.state.content = change(f.state.content);
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options))
      .rejects.toThrow('MULTIPART_METADATA_INVALID');
  });

  it('uses the same byte boundary for ordinary version inspection without changing local upload metadata', async () => {
    const f = fixture();
    const predecessorVersionId = '223e4567-e89b-42d3-a456-426614174000';
    f.records.set(`${BASE}/versions/${predecessorVersionId}`, {
      ...structuredClone(f.version), id: predecessorVersionId, number: 1,
    });
    const value = f.contract;
    const uploadMetadata = {
      main_module: 'index.js',
      bindings: [
        ...Object.entries(value.variables).map(([name, text]) => ({ name, type: 'plain_text', text })),
        ...value.durableObjectBindings.map(binding => ({ name: binding.name, type: 'durable_object_namespace', class_name: binding.className })),
      ],
      compatibility_date: value.compatibilityDate,
      compatibility_flags: value.compatibilityFlags,
      keep_bindings: ['secret_text', 'secret_key'],
      annotations: { 'workers/message': value.versionMessage, 'workers/tag': value.versionTag },
    };
    const commandRunner = vi.fn(async () => { throw new Error('No local rebuild during version inspection'); });
    const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
      contract: value, apiToken: f.options.apiToken, playerCanaryOwnerFid: '123456', ptrSpacetimeDbDatabase: PTR,
      repositoryRoot: realpathSync(process.cwd()), serviceRoot: realpathSync(join(process.cwd(), 'services/auth-bridge')),
      nodeExecutable: process.execPath, wranglerEntrypoint: process.execPath,
      multipartBody: appendMetadata(multipart(), JSON.stringify(uploadMetadata)),
      multipartContentType: 'multipart/form-data; boundary=recovery-source',
      fetchImpl: f.options.fetchImpl, commandRunner,
      journal: { inspect: () => ({ phase: 'uploaded', predecessorDeploymentId: predecessorVersionId, predecessorVersionId }) },
    });
    try {
      await expect(runtime.inspectVersion(VERSION)).resolves.toMatchObject({ versionId: VERSION, sourceDigest: SOURCE_DIGEST });
      f.state.content = appendMetadata(multipart());
      await expect(runtime.inspectVersion(VERSION)).resolves.toMatchObject({ versionId: VERSION, sourceDigest: SOURCE_DIGEST });
      f.state.content = appendMetadata(multipart(), 'export default 123;', 'name="metadata"; filename="extra.js"', 'application/javascript+module');
      await expect(runtime.inspectVersion(VERSION)).rejects.toThrow('MULTIPART_METADATA_INVALID');
      expect(commandRunner).not.toHaveBeenCalled();
    } finally { runtime.dispose(); }
  });

  it('accepts response Date headers that advance during the bounded observation', async () => {
    const f = fixture();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const respond = f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async (url, options) => {
      elapsed = 1_100;
      f.state.responseDate = new Date(NOW.getTime() + 1_000).toUTCString();
      return respond(url, options);
    });
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options)).resolves.toMatchObject({
      oldestObservedAt: '2026-09-12T10:00:01.000Z', inspectedAt: '2026-09-12T10:00:01.100Z',
    });
  });

  const mutations: readonly [string, (f: Fixture) => void, string][] = [
    ['changed executable bytes', f => { f.state.content = multipart(MODULE.replace('ready', 'wrong')); }, 'VERSION_MISMATCH'],
    ['unbound additional module', f => { f.state.content = Buffer.from(f.state.content.toString().replace(
      '--recovery-source--\r\n', '--recovery-source\r\nContent-Disposition: form-data; name="extra.js"; filename="extra.js"\r\nContent-Type: application/javascript+module\r\n\r\nexport {};\n\r\n--recovery-source--\r\n')); }, 'VERSION_MISMATCH'],
    ['source TypeScript entrypoint', f => { f.state.entrypoint = 'src/index.ts'; }, 'VERSION_SOURCE_UNVERIFIED'],
    ['missing compiled entrypoint module', f => { f.state.content = multipart(MODULE, 'other.js'); }, 'VERSION_SOURCE_UNVERIFIED'],
    ['wrong version identity', f => { f.version.id = '223e4567-e89b-42d3-a456-426614174000'; }, 'VERSION_MISMATCH'],
    ['wrong zone', f => { f.domain.zone_id = 'd'.repeat(32); }, 'DOMAIN_MISMATCH'],
    ['wrong domain', f => { f.domain.hostname = 'other.warpkeep.com'; }, 'DOMAIN_MISMATCH'],
    ['extra route', f => { f.records.set(ROUTES, [{ pattern: 'other.warpkeep.com/*' }]); }, 'ROUTE_MISMATCH'],
    ['workers.dev enabled', f => { f.records.set(`${BASE}/subdomain`, { enabled: true, previews_enabled: false }); }, 'SUBDOMAIN_MISMATCH'],
    ['observability enabled', f => { f.records.set(`${BASE}/script-settings`, { observability: { enabled: true } }); }, 'SCRIPT_SETTINGS_MISMATCH'],
    ['wrong migration', f => { f.script.migration_tag = 'v6'; }, 'MIGRATION_MISMATCH'],
    ['wrong namespace', f => { f.bindings.find(b => b.type === 'durable_object_namespace')!.namespace_id = '1'.repeat(32); }, 'VERSION_BINDING_MISMATCH'],
    ['wrong PTR binding', f => { f.bindings.find(b => b.name === 'PTR_SPACETIMEDB_DATABASE')!.text = '8'.repeat(64); }, 'VERSION_BINDING_MISMATCH'],
    ['wrong ordinary configuration', f => { f.bindings.find(b => b.name === 'ALLOWED_ORIGINS')!.text = 'https://other.example'; }, 'VERSION_BINDING_MISMATCH'],
    ['missing secret binding', f => { f.bindings.splice(f.bindings.findIndex(b => b.type === 'secret_text'), 1); }, 'VERSION_BINDING_MISMATCH'],
    ['wrong compatibility flags', f => { f.version.resources.script_runtime.compatibility_flags = []; }, 'VERSION_MISMATCH'],
    ['missing runtime export', f => { f.version.resources.script.named_handlers.pop(); }, 'VERSION_EXPORT_MISMATCH'],
    ['unverified etag', f => { f.version.resources.script.etag = ''; }, 'VERSION_SOURCE_UNVERIFIED'],
    ['future Worker creation', f => { f.version.metadata.created_on = '2027-01-01T00:00:00.000Z'; }, 'VERSION_INVALID'],
  ];
  it.each(mutations)('rejects %s', async (_label, mutate, code) => {
    const f = fixture(); mutate(f);
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options)).rejects.toThrow(code);
  });

  it.each([
    ['stale Date', (f: Fixture) => { f.state.responseDate = new Date(NOW.getTime() - 300_000).toUTCString(); }],
    ['future Date', (f: Fixture) => { f.state.responseDate = new Date(NOW.getTime() + 60_000).toUTCString(); }],
    ['invalid Date', (f: Fixture) => { f.state.responseDate = 'not a date'; }],
    ['redirect', (f: Fixture) => { f.state.redirect = true; }],
    ['different response URL', (f: Fixture) => { f.state.wrongUrl = true; }],
    ['oversized response', (f: Fixture) => { f.state.contentLength = '999999999'; }],
  ])('rejects %s before accepting remote authority', async (_label, mutate) => {
    const f = fixture(); mutate(f);
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options)).rejects.toThrow('REQUEST_FAILED');
  });

  it('validates the complete canonical contract before contacting Cloudflare', async () => {
    const f = fixture();
    const contract = { ...f.contract, variables: { ...f.contract.variables, ALLOWED_ORIGINS: 'https://other.example' } };
    // Matching hostile remote configuration cannot make a noncanonical contract valid.
    f.bindings.find(b => b.name === 'ALLOWED_ORIGINS')!.text = 'https://other.example';
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource({ ...f.options, contract }))
      .rejects.toThrow('CONTRACT_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects mutation or local rebuild inputs instead of silently accepting them', async () => {
    const f = fixture();
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource({
      ...f.options, repositoryRoot: '/local-build',
    } as typeof f.options)).rejects.toThrow('SOURCE_INPUT_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('holds the request timeout through a stalled response body', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const f = fixture();
    const cancel = vi.fn();
    f.fetchImpl.mockImplementation(async (url) => {
      const response = new Response(new ReadableStream({ cancel }), {
        headers: { date: NOW.toUTCString(), 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: String(url) });
      return response;
    });
    const pending = inspectAuthBridgeNotificationPreparedRecoverySource(f.options);
    const assertion = expect(pending).rejects.toThrow('REQUEST_FAILED');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(cancel).toHaveBeenCalled();
  });

  it('bounds streamed response bytes even without Content-Length', async () => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async (url) => {
      const response = new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        headers: { date: NOW.toUTCString(), 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: String(url) });
      return response;
    });
    await expect(inspectAuthBridgeNotificationPreparedRecoverySource(f.options))
      .rejects.toThrow('REQUEST_FAILED');
  });
});
