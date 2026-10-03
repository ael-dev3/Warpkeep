// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPtrNativeBridgeApiClient, parsePtrNativeBridgeResponseEnvelope, parsePtrNativeBridgeVersionModules } from '../scripts/ptr-auth-bridge-native-operator';
import { PTR_BRIDGE_ACCOUNT, PTR_BRIDGE_WORKER, PTR_BRIDGE_LATEST_UPLOAD_PATH, assertNativeBridgeLatestUpload } from '../scripts/ptr-auth-bridge-native-core.mjs';

import { authBridgeNotificationPreparedSourceDigest } from '../scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs';

const domains = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/domains?service=${PTR_BRIDGE_WORKER}`;
const base = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}`;
const inventory = (page: number | string) => `${base}/versions?deployable=true&page=${page}&per_page=100`;
const envelope = () => ({ success: true, errors: [] as unknown, messages: [] as unknown,
  result: [{ service: PTR_BRIDGE_WORKER }], result_info: { total_count: 1 } });

describe('fixed Cloudflare observed GET response representations', () => {
  test('accepts the actual observed paired null lists on only the fixed domains GET', () => {
    // Actual HTTP200 shape observed 2026-10-03T17:58:19.656Z; retained metadata SHA256
    // b64a1058db4a6eaa618fcf6406f675b24217cb067c0e091b8abc7e43264c8c0d.
    // This parser regression is not provider permission, domain validity or deployment proof.
    const value = { ...envelope(), errors: null, messages: null };
    expect(parsePtrNativeBridgeResponseEnvelope(value, domains, 'GET'))
      .toEqual({ result: value.result, resultInfo: value.result_info });
    expect(value.errors).toBeNull(); expect(value.messages).toBeNull();
  });
  test('accepts paired null lists on the actual exact latest-upload GET and preserves the version inventory', () => {
    // Actual authenticated HTTP200 shape: metadata-only receipt
    // october-release-existing-admin-envelope-readonly-v1.json SHA256
    // 75b6988fe48764816c2db804b516d05d2fb7c77647be7a3ad0435d141fb86225.
    const versionId = '11111111-1111-4111-8111-111111111111';
    const result = { items: [{ id: versionId, number: 42 }] };
    const resultInfo = { count: 1, page: 1, per_page: 1, total_count: 3, total_pages: 3 };
    const value = { success: true, errors: null, messages: null, result, result_info: resultInfo };
    const parsed = parsePtrNativeBridgeResponseEnvelope(value, PTR_BRIDGE_LATEST_UPLOAD_PATH, 'GET');
    expect(parsed.result).toBe(result); expect(parsed.resultInfo).toBe(resultInfo);
    expect(() => assertNativeBridgeLatestUpload(parsed.result, parsed.resultInfo, versionId, 42)).not.toThrow();
    expect(() => assertNativeBridgeLatestUpload(parsed.result, parsed.resultInfo, versionId, 43))
      .toThrow('PTR_NATIVE_BRIDGE_LATEST_UPLOAD_CHANGED');
    const wrongInventory = parsePtrNativeBridgeResponseEnvelope({ ...value, result: { items: [] } }, PTR_BRIDGE_LATEST_UPLOAD_PATH, 'GET');
    expect(() => assertNativeBridgeLatestUpload(wrongInventory.result, wrongInventory.resultInfo, versionId, 42))
      .toThrow('PTR_NATIVE_BRIDGE_LATEST_UPLOAD_CHANGED');
  });
  test.each([1, 100])('accepts paired null lists on only canonical inventory page %s without rewriting its result', page => {
    // Authenticated page-1 HTTP200 shape is retained in the metadata-only
    // october-release-native-bridge-version-inventory-envelope-v1.json receipt,
    // SHA256 86b4c3138ee080aed969e7c65e20f3630a95e8020f6bcc08d775ec44f381723a.
    const result = { items: [{ id: '11111111-1111-4111-8111-111111111111', annotations: { 'workers/tag': 'test-candidate' } }] };
    const resultInfo = { page, per_page: 100 };
    const value = { success: true, errors: null, messages: null, result, result_info: resultInfo };
    const parsed = parsePtrNativeBridgeResponseEnvelope(value, inventory(page), 'GET');
    expect(parsed.result).toBe(result); expect(parsed.resultInfo).toBe(resultInfo);
    expect(value.errors).toBeNull(); expect(value.messages).toBeNull();
  });
  test.each([0, 101, '01', '001', '+1', '1.0', '1e0', '-1', '1 ', ' 1', '1\n'])('refuses noncanonical or out-of-bound inventory page %s', page => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, inventory(page), 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test.each([
    inventory(1).replace('deployable=true', 'deployable=false'), inventory(1).replace('deployable=true&', ''),
    inventory(1).replace('page=1&per_page=100', 'per_page=100&page=1'),
    inventory(1).replace('per_page=100', 'per_page=99'), `${inventory(1)}&extra=true`, `${inventory(1)}\n`,
    inventory(1).replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)), inventory(1).replace(PTR_BRIDGE_WORKER, 'other-worker'),
  ])('refuses wrong inventory filter, query shape or fixed target: %s', path => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test('preserves normal empty array envelopes and their result without coercion', () => {
    const value = envelope();
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100), `${base}/deployments`, `${base}/subdomain`, `${base}/script-settings`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts`, `${base}/versions/11111111-1111-4111-8111-111111111111`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/services/${PTR_BRIDGE_WORKER}/environments/production/routes?show_zonename=true`]) {
      const result = parsePtrNativeBridgeResponseEnvelope(value, path, 'GET');
      expect(result.result).toBe(value.result); expect(result.resultInfo).toBe(value.result_info);
    }
    expect(parsePtrNativeBridgeResponseEnvelope(value, `${base}/versions?bindings_inherit=strict`, 'POST').result).toBe(value.result);
  });
  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'get'])('refuses null lists on %s regardless of the fixed path', method => {
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, method))
        .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
    }
  });
  test.each([`${base}/deployments`, `${base}/versions?bindings_inherit=strict`, `${base}/subdomain`,
    domains.replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)), domains.replace(PTR_BRIDGE_WORKER, 'other-worker'),
    `${domains}&page=1`, domains.split('?')[0]!, `${base}/versions`,
    `${base}/versions?page=2&per_page=1`, `${base}/versions?page=1&per_page=2`,
    `${base}/versions?per_page=1&page=1`, `${base}/versions?deployable=true&page=1&per_page=1`,
    `${PTR_BRIDGE_LATEST_UPLOAD_PATH}&extra=true`,
    PTR_BRIDGE_LATEST_UPLOAD_PATH.replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)),
    PTR_BRIDGE_LATEST_UPLOAD_PATH.replace(PTR_BRIDGE_WORKER, 'other-worker')])('refuses null lists on every other endpoint: %s', path => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test.each([
    { errors: null, messages: [] }, { errors: [], messages: null },
    { errors: undefined, messages: null }, { errors: null, messages: undefined },
    { errors: {}, messages: null }, { errors: null, messages: {} },
    { errors: 'none', messages: null }, { errors: null, messages: false },
    { errors: [{ code: 1 }], messages: [] }, { errors: [], messages: ['warning'] },
  ])('rejects missing, mixed, nonempty or arbitrary error/message fields', fields => {
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), ...fields }, path, 'GET'))
        .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
    }
  });
  test('does not waive success or own-result guards on any observed fixed GET', () => {
    const value = { ...envelope(), errors: null, messages: null };
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      for (const success of [false, null, undefined, 1, 'true']) {
        expect(() => parsePtrNativeBridgeResponseEnvelope({ ...value, success }, path, 'GET'))
          .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
      }
      const { result: _discarded, ...missing } = value;
      expect(() => parsePtrNativeBridgeResponseEnvelope(missing, path, 'GET')).toThrow();
      expect(() => parsePtrNativeBridgeResponseEnvelope(Object.assign(Object.create({ result: [] }), missing), path, 'GET')).toThrow();
    }
  });
  test('still requires explicit success true and an own result', () => {
    for (const success of [false, null, undefined, 1, 'true']) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null, success }, domains, 'GET')).toThrow();
    }
    const { result: _discarded, ...missing } = { ...envelope(), errors: null, messages: null };
    expect(() => parsePtrNativeBridgeResponseEnvelope(missing, domains, 'GET')).toThrow();
    const inherited = Object.assign(Object.create({ result: [] }), missing);
    expect(() => parsePtrNativeBridgeResponseEnvelope(inherited, domains, 'GET')).toThrow();
    for (const value of [null, [], 'ok', 1]) expect(() => parsePtrNativeBridgeResponseEnvelope(value, domains, 'GET')).toThrow();
  });
});

// Transport fixtures below never contact a provider or create a mutation journal.
describe('bounded credential-free provider rejection diagnostics', () => {
  const uploadPath = `${base}/versions?bindings_inherit=strict`;
  const token = 'provider-token-for-error-regression-only';
  const requestBody = 'REQUEST_BODY_MUST_NOT_APPEAR_IN_ERROR';
  afterEach(() => { vi.unstubAllGlobals(); });

  function response(body: BodyInit | null, status = 400, contentType = 'application/json', path = uploadPath) {
    const value = new Response(body, { status, headers: { 'content-type': contentType } });
    Object.defineProperty(value, 'url', { value: `https://api.cloudflare.com/client/v4${path}` });
    return value;
  }
  async function rejection(value: Response, privateValues: readonly string[] = [], method: string | null = 'POST') {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => value);
    vi.stubGlobal('fetch', fetchMock);
    const client = createPtrNativeBridgeApiClient(token, () => {}, privateValues);
    let failure: unknown;
    try { await client.json(uploadPath, method === null ? undefined : { method, body: requestBody, contentType: 'application/json' }); }
    catch (error) { failure = error; }
    finally { client.dispose(); }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!(failure instanceof Error)) throw new Error('Expected a rejected provider response');
    expect(failure.message).toMatch(/^[A-Z][A-Z0-9_]{0,158}$/u);
    expect(failure.message).not.toContain(token); expect(failure.message).not.toContain(requestBody);
    expect(failure).not.toHaveProperty('body'); expect(failure).not.toHaveProperty('response');
    return failure;
  }

  test('reads actual HTTP400-shaped error envelopes and retains only safe startup code and source coordinates', async () => {
    const rawMessage = 'Uncaught TypeError: PRIVATE_PROVIDER_TEXT at index.js:12530:6';
    const failure = await rejection(response(JSON.stringify({ success: false,
      errors: [{ code: 10021, message: rawMessage }], messages: [], result: null })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_STARTUP_C10021_L12530_K6');
    expect(String(failure)).not.toContain(rawMessage); expect(JSON.stringify(failure)).not.toContain('PRIVATE_PROVIDER_TEXT');
  });
  test('classifies the genuine startup export-map rejection without copying the export name or provider message', async () => {
    const rawMessage = 'Uncaught TypeError: Incorrect type for map entry PRIVATE_EXPORT_NAME: provided value not function or ExportedHandler.';
    const failure = await rejection(response(JSON.stringify({ errors: [{ code: 10021, message: rawMessage }] })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_EXPORT_INVALID_C10021');
    expect(String(failure)).not.toContain('PRIVATE_EXPORT_NAME');
  });
  test.each([
    ['cannot inherit binding PRIVATE_BINDING', 'INHERIT_BINDING'],
    ['Invalid migration tag PRIVATE_TAG', 'MIGRATION'],
    ['Invalid metadata main_module PRIVATE_MODULE', 'METADATA'],
    ['PRIVATE_UNCLASSIFIED_PROVIDER_TEXT', 'REQUEST_REJECTED'],
  ])('uses only the predefined %s classifier', async (message, hint) => {
    const failure = await rejection(response(JSON.stringify({ errors: [{ code: 10021, message }] })));
    expect(failure.message).toBe(`PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_${hint}_C10021`);
    expect(failure.message).not.toContain(message);
  });
  test('does not infer code10021 startup hints from a different provider code', async () => {
    const failure = await rejection(response(JSON.stringify({ errors: [{ code: 10000, message: 'Uncaught Error: PRIVATE' }] })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_REQUEST_REJECTED_C10000');
  });
  test('deduplicates and sorts bounded numeric codes without retaining arbitrary fields', async () => {
    const failure = await rejection(response(JSON.stringify({ errors: [
      { code: 10054, message: token, secret: requestBody }, { code: 10021 }, { code: 10054 }, { code: 10000 },
    ], result: { token }, messages: [requestBody] })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_REQUEST_REJECTED_C10000_C10021_C10054');
    expect(JSON.stringify(failure)).not.toContain(token); expect(JSON.stringify(failure)).not.toContain(requestBody);
  });
  test('suppresses known private numeric owner echoes and source coordinates as well as string credentials', async () => {
    const owner = '900123', admin = 'a'.repeat(64);
    const failure = await rejection(response(JSON.stringify({ errors: [
      { code: Number(owner), message: owner }, { code: owner }, { code: token }, { code: admin },
      { code: 10021, message: `Uncaught Error: ${token} ${admin} ${owner} at index.js:${owner}:4` },
    ], privateRows: [{ owner, admin }] })), [owner, admin]);
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_STARTUP_C10021');
    for (const secret of [token, owner, admin]) {
      expect(String(failure)).not.toContain(secret); expect(JSON.stringify(failure)).not.toContain(secret);
    }
  });
  test.each([
    ['zero', 0], ['negative', -1], ['fraction', 1.5], ['oversized', 1_000_000_000],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['string', '10021'], ['object', { code: 10021 }], ['null', null],
  ])('refuses a %s value as a numeric provider code', async (_label, code) => {
    const failure = await rejection(response(JSON.stringify({ errors: [{ code, message: token }] })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_REQUEST_REJECTED_NO_SAFE_CODES');
  });
  test.each([
    ['distinct', [1, 2, 3, 4, 5].map(code => ({ code }))],
    ['array length', Array.from({ length: 17 }, () => ({ code: 10021 }))],
  ])('bounds the %s error-code inventory', async (_label, errors) => {
    const failure = await rejection(response(JSON.stringify({ errors })));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_REQUEST_REJECTED_ERROR_CODES_BOUND');
  });
  test.each([
    ['empty', '', 'application/json', 'EMPTY_BODY'],
    ['html', '<html>PRIVATE_SECRET</html>', 'text/html', 'NON_JSON'],
    ['malformed', '{"message":"PRIVATE_SECRET"', 'application/json', 'INVALID_JSON'],
    ['array', '["PRIVATE_SECRET"]', 'application/json', 'NO_SAFE_CODES'],
    ['missing codes', '{"message":"PRIVATE_SECRET"}', 'application/json', 'NO_SAFE_CODES'],
  ])('retains only a fixed %s body classifier', async (_label, body, contentType, detail) => {
    const failure = await rejection(response(body, 400, contentType));
    expect(failure.message).toBe(`PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_REQUEST_REJECTED_${detail}`);
    expect(String(failure)).not.toContain('PRIVATE_SECRET');
  });
  test('bounds a rejected body at 64KiB, cancels its stream and zeroes the received bytes without replay', async () => {
    const chunk = new Uint8Array(64 * 1024 + 1).fill(83); let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(chunk); }, cancel() { cancelled = true; } });
    const failure = await rejection(response(stream));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_ERROR_BODY_BOUND');
    expect(cancelled).toBe(true); expect(chunk.every(byte => byte === 0)).toBe(true);
  });
  test('does not retain a failing stream error and preserves the known400 unresolved classification', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(token + requestBody)); } });
    const failure = await rejection(response(stream));
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_400_MUTATION_OUTCOME_UNRESOLVED_ERROR_BODY_READ_FAILED');
  });
  test('zeroes received rejection bytes after classification', async () => {
    const chunk = new TextEncoder().encode(JSON.stringify({ errors: [{ code: 10021, message: token }] }));
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(chunk); controller.close(); } });
    expect((await rejection(response(stream))).message).toContain('_C10021');
    expect(chunk.every(byte => byte === 0)).toBe(true);
  });
  test('retains READ_FAILED for a rejected GET without implying mutation or retry authority', async () => {
    const failure = await rejection(response(JSON.stringify({ errors: [{ code: 10000 }] }), 403), [], null);
    expect(failure.message).toBe('PTR_NATIVE_BRIDGE_HTTP_403_READ_FAILED_AUTH_REJECTED_C10000');
  });
  test('keeps the existing successful200 envelope and source checks unchanged', async () => {
    const value = envelope(), fetchMock = vi.fn(async () => response(JSON.stringify(value), 200));
    vi.stubGlobal('fetch', fetchMock); const assert = vi.fn(), client = createPtrNativeBridgeApiClient(token, assert);
    try { expect(await client.json(uploadPath, { method: 'POST', body: requestBody })).toEqual({ result: value.result, resultInfo: value.result_info }); }
    finally { client.dispose(); }
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(assert).toHaveBeenCalledTimes(2);
  });
});

describe('immutable version module content', () => {
  const versionId = '11111111-1111-4111-8111-111111111111';
  const path = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/workers/${PTR_BRIDGE_WORKER}/versions/${versionId}?include=modules`;
  const module = (name: string, body: string, content_type = 'application/javascript+module') =>
    ({ name, content_type, content_base64: Buffer.from(body).toString('base64') });
  const version = () => ({ id: versionId, number: 51, main_module: 'index.js', modules: [
    module('index.js', 'export default {fetch() {return new Response("old");}}'),
    module('index.js.map', '{"version":3,"sources":["index.ts"]}', 'application/source-map'),
  ] });
  const parse = (value: unknown) => parsePtrNativeBridgeVersionModules(value, versionId, 51);
  const clear = (parsed: ReturnType<typeof parse>) => parsed.parts.forEach(part => part.bytes.fill(0));

  test('preserves every module and the held original digest independently of a newer upload', () => {
    // Actual root metadata-only beta read SHA256 369d3be7f21761ced8f010a192262cf4ed8ff6916d1889cc5a39f0b100adb7a2
    // proved distinct immutable v51/v52 content; these are synthetic protocol fixtures, not provider proof.
    const old = version(), newer = { ...version(), id: '22222222-2222-4222-8222-222222222222', number: 52,
      modules: [module('index.js', 'export default {fetch() {return new Response("new");}}'), old.modules[1]!] };
    const original = parse(old), candidate = parsePtrNativeBridgeVersionModules(newer, newer.id, 52);
    try {
      expect(original.entrypoint).toBe('index.js');
      expect(original.parts.map(part => part.name)).toEqual(['index.js', 'index.js.map']);
      const expected = old.modules.map(part => ({ field: part.name, name: part.name,
        contentType: part.content_type, bytes: Buffer.from(part.content_base64, 'base64') }));
      try { expect(original.sourceDigest).toBe(authBridgeNotificationPreparedSourceDigest(expected)); }
      finally { expected.forEach(part => part.bytes.fill(0)); }
      expect(candidate.sourceDigest).not.toBe(original.sourceDigest);
      expect(original.parts[1]!.contentType).toBe('application/source-map');
      expect(authBridgeNotificationPreparedSourceDigest(original.parts.slice(0, 1))).not.toBe(original.sourceDigest);
    } finally { clear(original); clear(candidate); }
  });
  test('uses the exact full version include=modules GET through the existing bounded client', async () => {
    const body = { success: true, errors: [], messages: [], result: version() };
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      const response = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      Object.defineProperty(response, 'url', { value: `https://api.cloudflare.com/client/v4${path}` }); return response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const assert = vi.fn(), client = createPtrNativeBridgeApiClient('immutable-read-token-fixture-only', assert);
    try {
      const response = await client.json(path), parsed = parse(response.result);
      try { expect(parsed.entrypoint).toBe('index.js'); } finally { clear(parsed); }
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.cloudflare.com/client/v4${path}`);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
      expect(assert).toHaveBeenCalledTimes(2); expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  test.each([
    ['wrong ID', { id: '22222222-2222-4222-8222-222222222222' }], ['wrong number', { number: 52 }],
    ['string number', { number: '51' }], ['missing entrypoint', { main_module: 'missing.js' }],
    ['empty inventory', { modules: [] }], ['oversized inventory', { modules: Array.from({ length: 257 }, () => module('index.js', 'x')) }],
  ])('rejects %s without substituting live content', (_label, delta) => {
    expect(() => parse({ ...version(), ...delta })).toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
  });
  test.each(['id', 'number', 'main_module', 'modules'])('requires own %s version metadata', field => {
    const source = version(), value = { ...source } as Record<string, unknown>; delete value[field];
    expect(() => parse(Object.assign(Object.create({ [field]: source[field as keyof typeof source] }), value)))
      .toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
  });
  test('rejects duplicate names even when their MIME types differ', () => {
    expect(() => parse({ ...version(), modules: [module('index.js', 'x'), module('index.js', '{}', 'application/source-map')] }))
      .toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
  });
  test.each(['eA', 'eA=', 'eB==', 'eA===', 'e A==', 'eA==\n', 'eA--', 'eA__'])('rejects noncanonical base64 %j', content_base64 => {
    expect(() => parse({ ...version(), modules: [{ ...module('index.js', 'x'), content_base64 }] }))
      .toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
  });
  test('bounds total decoded bytes across individually bounded modules', () => {
    const content_base64 = Buffer.alloc(8 * 1024 * 1024 + 1, 120).toString('base64');
    expect(() => parse({ ...version(), modules: [
      { name: 'index.js', content_type: 'application/javascript+module', content_base64 },
      { name: 'other.js', content_type: 'application/javascript+module', content_base64 },
    ] })).toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
  });
  test('keeps the established module MIME/name contract strict', () => {
    for (const replacement of [module('index.js', 'x', 'text/html'), module('', 'x'), module('bad\0name', 'x')]) {
      expect(() => parse({ ...version(), modules: [replacement], main_module: replacement.name })).toThrow();
    }
  });
  test('clears already decoded bytes when a later module is invalid', () => {
    const from = Buffer.from.bind(Buffer), decoded: Buffer[] = [];
    const spy = vi.spyOn(Buffer, 'from').mockImplementation(((value: any, encoding?: any) => {
      const buffer = from(value, encoding); if (encoding === 'base64') decoded.push(buffer); return buffer;
    }) as typeof Buffer.from);
    try {
      expect(() => parse({ ...version(), modules: [module('index.js', 'x'), { name: 'bad.js', content_type: 'text/plain', content_base64: 'invalid' }] }))
        .toThrow('PTR_NATIVE_BRIDGE_VERSION_MODULES_INVALID');
      expect(decoded.length).toBe(1); expect(decoded.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
    } finally { spy.mockRestore(); }
  });
});
