// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), fetch: vi.fn() }));
vi.mock('../scripts/recovery-workflow-current-context.mjs', () => ({ readRecoveryWorkflowCurrentContext: mocks.context }));
import { verifyRecoveryWorkflowLivePostflight as verify } from '../scripts/recovery-workflow-live-postflight.mjs';
const url = 'https://warpkeep.com/.well-known/warpkeep-deployment-v1.json';
const body = '{"synthetic":"locally validated attestation"}';
const digest = createHash('sha256').update(body).digest('hex');
const context = { privateRoot: '/private/run', bindingSource: 'binding', contextSource: JSON.stringify({ deploymentAttestationSha256: digest }) };
function response(value = body, headers: Record<string, string> = {}) {
  const result = new Response(value, { headers: { 'content-type': 'application/json', ...headers } });
  Object.defineProperty(result, 'url', { value: url, configurable: true });
  return result;
}
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.context.mockResolvedValue(context); mocks.fetch.mockResolvedValue(response()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('checks the exact fixed public bytes and revalidates context without sending credentials', async () => {
  expect(await verify()).toEqual({ liveAttestationVerified: true, deploymentAttestationSha256: digest });
  expect(mocks.context).toHaveBeenCalledTimes(2);
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(url, {
    method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
    headers: { accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' }, signal: expect.any(AbortSignal),
  });
});
it.each(['bytes', 'type', 'encoding', 'length', 'oversize', 'url', 'status', 'redirect'])('rejects %s drift', async kind => {
  const r = response(kind === 'bytes' ? body + ' ' : kind === 'oversize' ? 'x'.repeat(16385) : body,
    kind === 'type' ? { 'content-type': 'text/html' } : kind === 'encoding' ? { 'content-encoding': 'gzip' }
      : kind === 'length' ? { 'content-length': '1' } : {});
  if (kind === 'url') Object.defineProperty(r, 'url', { value: 'https://other.invalid/' });
  if (kind === 'status') Object.defineProperty(r, 'status', { value: 404 });
  if (kind === 'redirect') Object.defineProperty(r, 'redirected', { value: true });
  mocks.fetch.mockResolvedValue(r);
  await expect(verify()).rejects.toThrow(/^RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID$/);
});
it.each(['privateRoot', 'bindingSource', 'contextSource'] as const)('rejects %s substitution after the network wait', async key => {
  mocks.context.mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, [key]: 'changed' });
  await expect(verify()).rejects.toThrow(/^RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID$/);
});
it('rejects overrides before context and network access', async () => {
  await expect(Reflect.apply(verify, null, ['override'])).rejects.toThrow('RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID');
  expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('bounds a stalled body even when it ignores abort', async () => {
  vi.useFakeTimers();
  const r = new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(r, 'url', { value: url }); mocks.fetch.mockResolvedValue(r);
  const check = expect(verify()).rejects.toThrow(/^RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID$/);
  await vi.advanceTimersByTimeAsync(10000); await check;
});
