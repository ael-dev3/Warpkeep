// @vitest-environment node
import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), attest: vi.fn(), verify: vi.fn(), cleanup: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawn }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({ attestPinnedSpacetimeCli: mocks.attest }));
import { createPtrUpdateProviderCredentials, requestPtrUpdateProvider, disposePtrUpdateProviderCredentials } from '../scripts/ptr-update-provider-credentials.mjs';

const TARGET = 'https://maincloud.spacetimedb.com/v1/database/c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const TOKEN = 'syntheticHeader.syntheticPayload.syntheticSignature';
const IDENTITY = '7'.repeat(64);
const ERROR = 'PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID';
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-provider-test-'));
  const path = join(root, 'module.js'); const body = Buffer.from('synthetic module bytes');
  writeFileSync(path, body); const descriptor = openSync(path, 'r');
  cleanups.push(() => { closeSync(descriptor); rmSync(root, { recursive: true }); });
  const source = vi.fn(); const config = vi.fn();
  const artifact = { artifactDescriptor: descriptor, moduleSha256: createHash('sha256').update(body).digest('hex'),
    spacetimeExecutable: join(root, 'cli'), spacetimeExecutableSha256: 'a'.repeat(64),
    spacetimeCliRootDirectory: join(root, 'private-root'), spacetimeCliConfigPath: join(root, 'config.toml'),
    spacetimeCliConfigSha256: 'b'.repeat(64), assertSourceAndArtifact: source, assertCliConfig: config };
  mocks.attest.mockReturnValue({ path: join(root, 'attested-cli'), digest: 'a'.repeat(64), verify: mocks.verify, cleanup: mocks.cleanup });
  mocks.spawn.mockImplementation(() => ({ status: 0, signal: null, stdout: Buffer.from(`You are logged in as ${IDENTITY}\nYour auth token (don't share this!) is ${TOKEN}\n`), stderr: Buffer.alloc(0) }));
  const fetch = vi.fn(async (url: string) => { const response = new Response('{"ok":true}'); Object.defineProperty(response, 'url', { value: url }); return response; });
  vi.stubGlobal('fetch', fetch);
  const create = () => { const cap = createPtrUpdateProviderCredentials({ artifact }); cleanups.push(() => disposePtrUpdateProviderCredentials(cap)); return cap; };
  return { artifact, body, source, config, fetch, create };
}
it('uses only staged CLI argv and a private provider header for the fixed target', async () => {
  const f = fixture(); const cap = f.create(); expect(Object.keys(cap)).toEqual([]);
  const response = await requestPtrUpdateProvider(cap, { operation: 'metadata' });
  expect(response.claimedProviderIdentity).toBe(IDENTITY); expect(response.bytes.toString()).toBe('{"ok":true}');
  expect(mocks.spawn).toHaveBeenCalledWith(expect.stringContaining('attested-cli'), ['--root-dir', f.artifact.spacetimeCliRootDirectory,
    '--config-path', f.artifact.spacetimeCliConfigPath, 'login', 'show', '--token'], expect.objectContaining({ env: {}, shell: false, timeout: 10000, maxBuffer: 32768 }));
  expect(f.fetch).toHaveBeenCalledWith(TARGET, expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${TOKEN}` } }));
  expect(f.source.mock.calls.length).toBeGreaterThanOrEqual(4); expect(f.config.mock.calls.length).toBeGreaterThanOrEqual(4);
});
it('reads plan/apply bytes positionally from artifact and marks immediately before submission', async () => {
  const f = fixture(); const cap = f.create(); const bodies: Buffer[] = [];
  f.fetch.mockImplementation(async (url: string, options?: RequestInit) => { bodies.push(Buffer.from(options?.body as Uint8Array)); const response = new Response('{}'); Object.defineProperty(response, 'url', { value: url }); return response; });
  await requestPtrUpdateProvider(cap, { operation: 'plan' });
  const marker = vi.fn(() => { expect(f.fetch).toHaveBeenCalledTimes(1); });
  await requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: marker });
  expect(bodies).toEqual([f.body, f.body]); expect(marker).toHaveBeenCalledOnce();
  expect(f.fetch.mock.calls.map(call => call[0])).toEqual([`${TARGET}/pre_publish?host_type=Js&style=NoColor`, `${TARGET}?host_type=Js&policy=BreakClients&token=0x1234`]);
});
it.each(['missing', 'stderr', 'failure', 'extra-line', 'bad-identity', 'bad-token', 'throws'])('refuses %s CLI output without exposing secrets or calling a provider', async mode => {
  const f = fixture(); const cap = f.create();
  mocks.spawn.mockImplementation(() => {
    if (mode === 'throws') throw new Error(TOKEN);
    return { status: mode === 'failure' ? 1 : 0, signal: null,
      stdout: Buffer.from(mode === 'missing' ? 'You are not logged in. Run `spacetime login` to log in.\n' :
        `You are logged in as ${mode === 'bad-identity' ? 'owner' : IDENTITY}\nYour auth token (don't share this!) is ${mode === 'bad-token' ? 'bad token' : TOKEN}\n${mode === 'extra-line' ? 'extra\n' : ''}`),
      stderr: Buffer.from(mode === 'stderr' ? TOKEN : '') };
  });
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(new Error(ERROR));
  expect(f.fetch).not.toHaveBeenCalled();
});
it('rejects forged capabilities, caller bytes and missing apply marker', async () => {
  const f = fixture(); const cap = f.create();
  await expect(requestPtrUpdateProvider({} as never, { operation: 'metadata' })).rejects.toThrow(ERROR);
  await expect(requestPtrUpdateProvider(cap, { operation: 'plan', candidateBytes: f.body } as never)).rejects.toThrow(ERROR);
  await expect(requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234' } as never)).rejects.toThrow(ERROR);
  expect(f.fetch).not.toHaveBeenCalled();
});
it('refuses artifact mutation, throwing getters and attestation errors with fixed diagnostics', async () => {
  const f = fixture();
  expect(() => createPtrUpdateProviderCredentials({ get artifact() { throw Error(TOKEN); } } as never)).toThrow(ERROR);
  const cap = f.create(); f.source.mockImplementation(() => { throw Error(TOKEN); });
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
  expect(f.fetch).not.toHaveBeenCalled();
});
it('checks actual candidate SHA before provider planning', async () => {
  const f = fixture(); const cap = f.create(); writeFileSync(join(f.artifact.spacetimeCliConfigPath, '..', 'module.js'), 'different bytes');
  await expect(requestPtrUpdateProvider(cap, { operation: 'plan' })).rejects.toThrow(ERROR); expect(f.fetch).not.toHaveBeenCalled();
});
it('rechecks source after awaited marker and after response, and redacts reflection', async () => {
  const f = fixture(); const cap = f.create();
  await expect(requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: async () => { f.source.mockImplementation(() => { throw Error(TOKEN); }); } })).rejects.toThrow(ERROR);
  expect(f.fetch).not.toHaveBeenCalled(); f.source.mockReset();
  f.fetch.mockImplementation(async (url: string) => { const response = new Response(TOKEN); Object.defineProperty(response, 'url', { value: url }); return response; });
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
});
it('disposal is idempotent and prevents later extraction', async () => {
  const f = fixture(); const cap = f.create(); disposePtrUpdateProviderCredentials(cap); disposePtrUpdateProviderCredentials(cap);
  expect(mocks.cleanup).toHaveBeenCalledOnce(); await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
});
it('a refused contender cannot release another in-flight request', async () => {
  const f = fixture(); const cap = f.create(); let release!: () => void;
  const pending = requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: () => new Promise<void>(resolve => { release = resolve; }) });
  await Promise.resolve();
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
  expect(f.fetch).not.toHaveBeenCalled(); release(); await pending;
});
it('uses fixed schema and unauthenticated health routes', async () => {
  const f = fixture(); const cap = f.create();
  await requestPtrUpdateProvider(cap, { operation: 'schema' });
  await requestPtrUpdateProvider(cap, { operation: 'health' });
  expect(f.fetch).toHaveBeenCalledWith(`${TARGET}/schema?version=10`, expect.objectContaining({ method: 'GET' }));
  expect(f.fetch).toHaveBeenCalledWith('https://maincloud.spacetimedb.com/v1/health', expect.objectContaining({ method: 'GET', headers: {} }));
});
it.each(['redirect', 'wrong-url', 'status', 'throw', 'oversize', 'source-change'])('refuses hostile %s response with fixed diagnostics', async mode => {
  const f = fixture(); const cap = f.create();
  f.fetch.mockImplementation(async (url: string) => {
    if (mode === 'throw') throw Error(TOKEN);
    const response = new Response(mode === 'oversize' ? new Uint8Array(32 * 1024 * 1024 + 1) : '{}', { status: mode === 'status' ? 403 : 200 });
    Object.defineProperty(response, 'url', { value: mode === 'wrong-url' ? 'https://example.invalid' : url });
    Object.defineProperty(response, 'redirected', { value: mode === 'redirect' });
    if (mode === 'source-change') f.source.mockImplementation(() => { throw Error(TOKEN); });
    return response;
  });
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(new Error(ERROR));
});
it('bounds a stalled marker and never submits after its late completion', async () => {
  vi.useFakeTimers(); const f = fixture(); const cap = f.create(); let release!: () => void;
  const pending = requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: () => new Promise<void>(resolve => { release = resolve; }) });
  const rejected = expect(pending).rejects.toThrow(ERROR);
  await vi.advanceTimersByTimeAsync(30000); await rejected;
  release(); await Promise.resolve(); expect(f.fetch).not.toHaveBeenCalled();
});
it('bounds a stalled fetch and aborts it', async () => {
  vi.useFakeTimers(); const f = fixture(); const cap = f.create(); let signal!: AbortSignal;
  f.fetch.mockImplementation((_url: string, options?: RequestInit) => { signal = options!.signal!; return new Promise<Response>(() => {}); });
  const pending = expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
  await vi.advanceTimersByTimeAsync(30000); await pending; expect(signal.aborted).toBe(true);
});
it('erases owned CLI output buffers on refusal', async () => {
  const f = fixture(); const cap = f.create();
  const stdout = Buffer.from(`You are logged in as ${IDENTITY}\nYour auth token (don't share this!) is ${TOKEN}\n`);
  const stderr = Buffer.from(TOKEN);
  mocks.spawn.mockReturnValue({ status: 0, signal: null, stdout, stderr });
  await expect(requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
  expect(stdout.every(byte => byte === 0)).toBe(true); expect(stderr.every(byte => byte === 0)).toBe(true);
});
