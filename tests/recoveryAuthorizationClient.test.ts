// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { requestRecovery } from '../scripts/recovery-authorization-client.mjs';
const origin = 'https://release-auth.warpkeep.com/v1/recovery/';
const locator = { requestId: '123e4567-e89b-42d3-a456-426614174000', candidateCommit: 'a'.repeat(40),
  sourceVerifyRunId: '123', sourceVerifyRunAttempt: '1', artifactId: '456', oidcToken: 'test.oidc.token' };
function response(url: string, source: string, headers: Record<string, string> = {}) {
  const result = new Response(source, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([
  ['status', {}, 'statusJws', 'status'], ['issue', locator, 'authorizationJws', 'issue'],
  ['claim', { ...locator, authorizationJws: 'test.authorization.jws' }, 'claimReceiptJws', 'claim'],
  ['complete', { ...locator, claimReceiptJws: 'test.claim.jws' }, 'terminalJws', 'complete'],
  ['reconcile', { ...locator, claimReceiptJws: 'test.claim.jws' }, 'terminalJws', 'reconcile'],
  ['terminal', { requestId: locator.requestId }, 'terminalJws', `requests/${locator.requestId}`],
] as const)('sends only the exact %s contract to the fixed origin', async (endpoint, request, field, path) => {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(origin + path); expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('accept-encoding')).toBe('identity');
    expect(init.method).toBe(endpoint === 'status' || endpoint === 'terminal' ? 'GET' : 'POST');
    expect(init.body).toBe(endpoint === 'status' || endpoint === 'terminal' ? undefined : JSON.stringify(request));
    return response(url, JSON.stringify({ [field]: 'test.signed.object' }));
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(requestRecovery(endpoint, JSON.stringify(request))).resolves.toEqual({ [field]: 'test.signed.object' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('never retries a failed request or exposes its error', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('private-sentinel')); vi.stubGlobal('fetch', fetcher);
  await expect(requestRecovery('issue', JSON.stringify(locator))).rejects.toThrowError(/^RECOVERY_CLIENT_INVALID$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([{}, { ...locator, epoch: 1 }, { ...locator, oidcToken: '' }, { ...locator, candidateCommit: 'wrong' }])('rejects invalid request before transport', async request => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(requestRecovery('issue', JSON.stringify(request))).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([['issue', 405000], ['claim', 105000], ['status', 30000], ['complete', 30000], ['reconcile', 30000], ['terminal', 30000]] as const)('bounds %s with its own absolute deadline', async (endpoint, duration) => {
  vi.useFakeTimers();
  const fetcher = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetcher);
  const request = endpoint === 'status' ? {} : endpoint === 'terminal' ? { requestId: locator.requestId }
    : endpoint === 'claim' ? { ...locator, authorizationJws: 'test.authorization.jws' }
      : endpoint === 'complete' || endpoint === 'reconcile' ? { ...locator, claimReceiptJws: 'test.claim.jws' } : locator;
  let settled = false;
  const result = requestRecovery(endpoint, JSON.stringify(request));
  const rejected = expect(result.finally(() => { settled = true; })).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  await vi.advanceTimersByTimeAsync(duration - 1); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await rejected; expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['{"statusJws":"first","statusJws":"second"}', '{"statusJws":"signed","extra":true}',
  '{"statusJws":null}', '\ufeff{"statusJws":"signed"}', '{"statusJws":""}', '{"statusJws":"\\ud800"}',
  '{"authorizationJws":"wrong-kind"}', 'A'.repeat(32769)])('rejects invalid response without returning private bytes: %#', async source => {
  vi.stubGlobal('fetch', vi.fn(async () => response(origin + 'status', source)));
  await expect(requestRecovery('status', '{}')).rejects.toThrowError(/^RECOVERY_CLIENT_INVALID$/);
});
it('accepts insignificant response whitespace while keeping one exact member', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(origin + 'status', ' { "statusJws" : "test.signed.object" }\n')));
  await expect(requestRecovery('status', '{}')).resolves.toEqual({ statusJws: 'test.signed.object' });
});
it.each([{ 'content-type': 'text/html' }, { 'cache-control': 'public' }, { 'content-length': '32769' },
  { 'content-length': '1' }, { 'content-length': '01' }] as Record<string, string>[])('rejects wrong response metadata: %j', async headers => {
  vi.stubGlobal('fetch', vi.fn(async () => response(origin + 'status', '{"statusJws":"test.signed.object"}', headers)));
  await expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
});
it('rejects a substituted final URL and a redirected response', async () => {
  for (const redirected of [false, true]) {
    const result = response(redirected ? origin + 'status' : 'https://other.example/status', '{"statusJws":"private-sentinel"}');
    Object.defineProperty(result, 'redirected', { value: redirected });
    vi.stubGlobal('fetch', vi.fn(async () => result));
    await expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  }
});
it('rejects fatal UTF8 and cancels an unfinished response at the original deadline', async () => {
  const invalid = new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  Object.defineProperty(invalid, 'url', { value: origin + 'status' });
  vi.stubGlobal('fetch', vi.fn(async () => invalid));
  await expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  vi.useFakeTimers();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const stalled = new Response(stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  Object.defineProperty(stalled, 'url', { value: origin + 'status' });
  vi.stubGlobal('fetch', vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 10000)); return stalled; }));
  const rejected = expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  await vi.advanceTimersByTimeAsync(30000); await rejected; expect(cancelled).toBe(true);
});
it('rejects authorization bytes in completion and URL overrides before any request', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(requestRecovery('complete', JSON.stringify({ ...locator, authorizationJws: 'test.authorization.jws' }))).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  await expect(Reflect.apply(requestRecovery, null, ['status', '{}', 'https://other.example'])).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  expect(fetcher).not.toHaveBeenCalled();
});
it('cancels an HTTP failure without parsing or retrying its private body', async () => {
  let cancelled = false;
  const result = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 });
  Object.defineProperty(result, 'url', { value: origin + 'issue' });
  const fetcher = vi.fn(async () => result); vi.stubGlobal('fetch', fetcher);
  await expect(requestRecovery('issue', JSON.stringify(locator))).rejects.toThrowError(/^RECOVERY_CLIENT_INVALID$/);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(cancelled).toBe(true);
});
it('clears received chunks and cancels chunked overflow without waiting for EOF', async () => {
  let cancelled = false;
  const chunk = new Uint8Array(32769).fill(65);
  const result = new Response(new ReadableStream({ start(controller) { controller.enqueue(chunk); }, cancel() { cancelled = true; } }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  Object.defineProperty(result, 'url', { value: origin + 'status' });
  vi.stubGlobal('fetch', vi.fn(async () => result));
  await expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
  expect(chunk.every(value => value === 0)).toBe(true); expect(cancelled).toBe(true);
});
it('rejects transparently decoded encoded responses before comparing wire length', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(origin + 'status', '{"statusJws":"test.signed.object"}', { 'content-encoding': 'gzip' })));
  await expect(requestRecovery('status', '{}')).rejects.toThrow('RECOVERY_CLIENT_INVALID');
});
