// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestFreshRecoveryOidc } from '../scripts/recovery-workflow-oidc.mjs';
const runnerUrl = 'https://pipelines.actions.githubusercontent.com/test/_apis/distributedtask/hubs/build/plans/test/jobs/test/idtoken?api-version=2.0';
beforeEach(() => {
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_run', GITHUB_JOB: 'deploy-recovery',
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    ACTIONS_ID_TOKEN_REQUEST_URL: runnerUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'private-runner-token' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function response(url: string, source: string) {
  const result = new Response(source, { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
it('requests anew for every call with the fixed audience and does not cache tokens', async () => {
  let count = 0;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(`${runnerUrl}&audience=warpkeep-release-recovery`);
    expect(init.method).toBe('GET'); expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-runner-token');
    expect(new Headers(init.headers).get('accept-encoding')).toBe('identity');
    count++; return response(url, JSON.stringify({ value: `test.token.${count}` }));
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(requestFreshRecoveryOidc()).resolves.toBe('test.token.1');
  await expect(requestFreshRecoveryOidc()).resolves.toBe('test.token.2');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['https://attacker.example/token', 'http://pipelines.actions.githubusercontent.com/token',
  'https://pipelines.actions.githubusercontent.com.evil.example/token', 'https://user@pipelines.actions.githubusercontent.com/token',
  'https://pipelines.actions.githubusercontent.com:8443/token', `${runnerUrl}#fragment`, `${runnerUrl}&audience=other`])('rejects unsafe runner endpoint before sending credentials: %#', async url => {
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', url); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(requestFreshRecoveryOidc()).rejects.toThrowError(/^RECOVERY_OIDC_REQUEST_INVALID$/); expect(fetcher).not.toHaveBeenCalled();
});
it.each(['GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_JOB', 'GITHUB_WORKFLOW_REF', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'])('rejects missing runner context %s', async name => {
  vi.stubEnv(name, ''); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(requestFreshRecoveryOidc()).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID'); expect(fetcher).not.toHaveBeenCalled();
});
it('does not retry or echo provider errors', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('private-runner-token')); vi.stubGlobal('fetch', fetcher);
  await expect(requestFreshRecoveryOidc()).rejects.toThrowError(/^RECOVERY_OIDC_REQUEST_INVALID$/); expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['{"value":"first","value":"second"}', '{"value":null}', '{"value":""}', '\ufeff{"value":"test.token.value"}', 'A'.repeat(32769)])('rejects malformed token response: %#', async source => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url, source)));
  await expect(requestFreshRecoveryOidc()).rejects.toThrowError(/^RECOVERY_OIDC_REQUEST_INVALID$/);
});
it('bounds a stalled provider request to thirty seconds', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  let settled = false;
  const result = requestFreshRecoveryOidc().then(() => { settled = true; }, error => { settled = true; throw error; });
  const rejected = expect(result).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID');
  await vi.advanceTimersByTimeAsync(29999);
  const early = settled;
  await vi.advanceTimersByTimeAsync(1); await rejected; expect(early).toBe(false);
});
it('does not accept caller URL, audience or token overrides', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(Reflect.apply(requestFreshRecoveryOidc, null, ['other-audience'])).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID');
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['content-type', 'content-encoding', 'content-length', 'url', 'redirected', 'status'])('rejects invalid response %s and cancels its body', async field => {
  let cancelled = false;
  const result = new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
    status: field === 'status' ? 503 : 200, headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(result, 'url', { value: field === 'url' ? 'https://other.example' : `${runnerUrl}&audience=warpkeep-release-recovery` });
  if (field === 'redirected') Object.defineProperty(result, 'redirected', { value: true });
  if (field === 'content-type') result.headers.set(field, 'text/html');
  if (field === 'content-encoding') result.headers.set(field, 'gzip');
  if (field === 'content-length') result.headers.set(field, '32769');
  const fetcher = vi.fn(async () => result); vi.stubGlobal('fetch', fetcher);
  await expect(requestFreshRecoveryOidc()).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID');
  expect(cancelled).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps one deadline across response headers and stalled body reading', async () => {
  vi.useFakeTimers(); let cancelled = false;
  const chunk = new TextEncoder().encode('{"value":');
  const result = new Response(new ReadableStream({ start(controller) { controller.enqueue(chunk); }, cancel() { cancelled = true; } }),
    { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: `${runnerUrl}&audience=warpkeep-release-recovery` });
  vi.stubGlobal('fetch', vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 10000)); return result; }));
  const rejected = expect(requestFreshRecoveryOidc()).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID');
  await vi.advanceTimersByTimeAsync(30000); await rejected;
  expect(cancelled).toBe(true); expect(chunk.every(value => value === 0)).toBe(true);
});
it('rejects malformed UTF8 rather than replacing damaged token bytes', async () => {
  const result = new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: `${runnerUrl}&audience=warpkeep-release-recovery` });
  vi.stubGlobal('fetch', vi.fn(async () => result));
  await expect(requestFreshRecoveryOidc()).rejects.toThrow('RECOVERY_OIDC_REQUEST_INVALID');
});
