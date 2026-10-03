// @vitest-environment node
import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), attest: vi.fn(), verify: vi.fn(), cleanup: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawn }));
vi.mock('../scripts/spacetime-cli-attestation.mjs', () => ({ attestPinnedSpacetimeCli: mocks.attest }));
import * as providers from '../scripts/ptr-update-provider-credentials.mjs';

const TOKEN = 'syntheticHeader.syntheticPayload.syntheticSignature';
const IDENTITY = '7'.repeat(64);
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function providerSuite<Capability extends object>(
  lane: 'ptr' | 'g002',
  createCredentials: (input: { artifact: providers.PtrUpdateProviderArtifact }) => Capability,
  requestProvider: (capability: Capability, input: providers.PtrUpdateProviderRequest) => ReturnType<typeof providers.requestPtrUpdateProvider>,
  disposeCredentials: (capability: Capability) => void,
) {
  describe(`${lane} fixed production provider`, () => {
    const TARGET = lane === 'ptr'
      ? 'https://maincloud.spacetimedb.com/v1/database/c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e'
      : 'https://maincloud.spacetimedb.com/v1/database/c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194';
    const ERROR = lane === 'ptr' ? 'PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID' : 'G002_UPDATE_PROVIDER_CREDENTIALS_INVALID';
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
      const create = () => { const cap = createCredentials({ artifact }); cleanups.push(() => disposeCredentials(cap)); return cap; };
      return { artifact, body, source, config, fetch, create };
    }
    it('uses only staged CLI argv and a private provider header for the fixed target', async () => {
      const f = fixture(); const cap = f.create(); expect(Object.keys(cap)).toEqual([]);
      const response = await requestProvider(cap, { operation: 'metadata' });
      expect(response.claimedProviderIdentity).toBe(IDENTITY); expect(response.bytes.toString()).toBe('{"ok":true}');
      expect(mocks.spawn).toHaveBeenCalledWith(expect.stringContaining('attested-cli'), ['--root-dir', f.artifact.spacetimeCliRootDirectory,
        '--config-path', f.artifact.spacetimeCliConfigPath, 'login', 'show', '--token'], expect.objectContaining({ env: {}, shell: false, timeout: 10000, maxBuffer: 32768 }));
      expect(f.fetch).toHaveBeenCalledWith(TARGET, expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${TOKEN}` } }));
      expect(f.source.mock.calls.length).toBeGreaterThanOrEqual(4); expect(f.config.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
    it('preserves the artifact receiver for source assertion methods across async requests', async () => {
      const f = fixture();
      f.artifact.assertSourceAndArtifact = vi.fn(function (this: providers.PtrUpdateProviderArtifact) {
        expect(this.moduleSha256).toBe(f.artifact.moduleSha256);
        expect(this.spacetimeCliConfigSha256).toBe(f.artifact.spacetimeCliConfigSha256);
      });
      const cap = f.create(); await requestProvider(cap, { operation: 'metadata' });
      expect(f.artifact.assertSourceAndArtifact.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
    it('reads plan/apply bytes positionally from artifact and marks immediately before submission', async () => {
      const f = fixture(); const cap = f.create(); const bodies: Buffer[] = [];
      f.fetch.mockImplementation(async (url: string, options?: RequestInit) => { bodies.push(Buffer.from(options?.body as Uint8Array)); const response = new Response('{}'); Object.defineProperty(response, 'url', { value: url }); return response; });
      await requestProvider(cap, { operation: 'plan' });
      const marker = vi.fn(() => { expect(f.fetch).toHaveBeenCalledTimes(1); });
      await requestProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: marker });
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
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(new Error(ERROR));
      expect(f.fetch).not.toHaveBeenCalled();
    });
    it('rejects forged capabilities, caller bytes and missing apply marker', async () => {
      const f = fixture(); const cap = f.create();
      await expect(requestProvider({} as never, { operation: 'metadata' })).rejects.toThrow(ERROR);
      await expect(requestProvider(cap, { operation: 'plan', candidateBytes: f.body } as never)).rejects.toThrow(ERROR);
      await expect(requestProvider(cap, { operation: 'apply', migrationToken: '0x1234' } as never)).rejects.toThrow(ERROR);
      expect(f.fetch).not.toHaveBeenCalled();
    });
    it('refuses artifact mutation, throwing getters and attestation errors with fixed diagnostics', async () => {
      const f = fixture();
      expect(() => createCredentials({ get artifact() { throw Error(TOKEN); } } as never)).toThrow(ERROR);
      const cap = f.create(); f.source.mockImplementation(() => { throw Error(TOKEN); });
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
      expect(f.fetch).not.toHaveBeenCalled();
    });
    it('checks actual candidate SHA before provider planning', async () => {
      const f = fixture(); const cap = f.create(); writeFileSync(join(f.artifact.spacetimeCliConfigPath, '..', 'module.js'), 'different bytes');
      await expect(requestProvider(cap, { operation: 'plan' })).rejects.toThrow(ERROR); expect(f.fetch).not.toHaveBeenCalled();
    });
    it('rechecks source after awaited marker and after response, and redacts reflection', async () => {
      const f = fixture(); const cap = f.create();
      await expect(requestProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: async () => { f.source.mockImplementation(() => { throw Error(TOKEN); }); } })).rejects.toThrow(ERROR);
      expect(f.fetch).not.toHaveBeenCalled(); f.source.mockReset();
      f.fetch.mockImplementation(async (url: string) => { const response = new Response(TOKEN); Object.defineProperty(response, 'url', { value: url }); return response; });
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
    });
    it('disposal is idempotent and prevents later extraction', async () => {
      const f = fixture(); const cap = f.create(); disposeCredentials(cap); disposeCredentials(cap);
      expect(mocks.cleanup).toHaveBeenCalledOnce(); await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
    });
    it('a refused contender cannot release another in-flight request', async () => {
      const f = fixture(); const cap = f.create(); let release!: () => void;
      const pending = requestProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: () => new Promise<void>(resolve => { release = resolve; }) });
      await Promise.resolve();
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
      expect(f.fetch).not.toHaveBeenCalled(); release(); await pending;
    });
    it('uses fixed schema and unauthenticated health routes', async () => {
      const f = fixture(); const cap = f.create();
      await requestProvider(cap, { operation: 'schema' });
      await requestProvider(cap, { operation: 'health' });
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
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(new Error(ERROR));
    });
    it('bounds a stalled marker and never submits after its late completion', async () => {
      vi.useFakeTimers(); const f = fixture(); const cap = f.create(); let release!: () => void;
      const pending = requestProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: () => new Promise<void>(resolve => { release = resolve; }) });
      const rejected = expect(pending).rejects.toThrow(ERROR);
      await vi.advanceTimersByTimeAsync(30000); await rejected;
      release(); await Promise.resolve(); expect(f.fetch).not.toHaveBeenCalled();
    });
    it('bounds a stalled fetch and aborts it', async () => {
      vi.useFakeTimers(); const f = fixture(); const cap = f.create(); let signal!: AbortSignal;
      f.fetch.mockImplementation((_url: string, options?: RequestInit) => { signal = options!.signal!; return new Promise<Response>(() => {}); });
      const pending = expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
      await vi.advanceTimersByTimeAsync(30000); await pending; expect(signal.aborted).toBe(true);
    });
    it('erases owned CLI output buffers on refusal', async () => {
      const f = fixture(); const cap = f.create();
      const stdout = Buffer.from(`You are logged in as ${IDENTITY}\nYour auth token (don't share this!) is ${TOKEN}\n`);
      const stderr = Buffer.from(TOKEN);
      mocks.spawn.mockReturnValue({ status: 0, signal: null, stdout, stderr });
      await expect(requestProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
      expect(stdout.every(byte => byte === 0)).toBe(true); expect(stderr.every(byte => byte === 0)).toBe(true);
    });
    it('rejects cross-lane credentials without disposing or using their owner', async () => {
      const f = fixture(); const cap = f.create();
      const foreignRequest = lane === 'ptr' ? providers.requestG002UpdateProvider : providers.requestPtrUpdateProvider;
      const foreignDispose = lane === 'ptr' ? providers.disposeG002UpdateProviderCredentials : providers.disposePtrUpdateProviderCredentials;
      const foreignError = lane === 'ptr' ? 'G002_UPDATE_PROVIDER_CREDENTIALS_INVALID' : 'PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID';
      await expect(foreignRequest(cap as never, { operation: 'metadata' })).rejects.toThrow(foreignError);
      expect(() => foreignDispose(cap as never)).toThrow(foreignError);
      expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
      await requestProvider(cap, { operation: 'metadata' });
      expect(f.fetch).toHaveBeenCalledOnce(); expect(f.fetch.mock.calls[0][0]).toBe(TARGET);
    });
    it('rejects caller-selected transport policy before acquiring CLI authority', () => {
      const f = fixture();
      for (const extra of [{ target: 'https://example.invalid' }, { lane: lane === 'ptr' ? 'g002' : 'ptr' }]) {
        expect(() => createCredentials({ artifact: f.artifact, ...extra } as never)).toThrow(ERROR);
      }
      expect(mocks.attest).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
    });
    if (lane === 'g002') it('refuses using foreign G002 credentials through the PTR read facade', async () => {
      const f = fixture(), cap = f.create();
      await expect(providers.requestPtrInspectionProvider(cap as never, { operation: 'program' })).rejects.toThrow('PTR_UPDATE_PROVIDER_CREDENTIALS_INVALID');
      expect(mocks.spawn).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
    });
    if (lane === 'ptr') {
      it('performs only fixed program/table SELECTs and version-9 schema reads using existing credentials', async () => {
        const f = fixture(), cap = f.create(); const captures: { url: string; method: string; body?: string; contentType?: string }[] = [];
        f.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
          captures.push({ url, method: options!.method!, ...(options!.body ? { body: Buffer.from(options!.body as Uint8Array).toString() } : {}),
            contentType: (options!.headers as Record<string, string>)['Content-Type'] });
          const response = new Response('{}'); Object.defineProperty(response, 'url', { value: url }); return response;
        });
        await providers.requestPtrInspectionProvider(cap as never, { operation: 'program' });
        await providers.requestPtrInspectionProvider(cap as never, { operation: 'schema-v9' });
        for (const table of providers.PTR_INSPECTION_TABLES)
          await providers.requestPtrInspectionProvider(cap as never, { operation: `rows:${table}` });
        expect(captures[0]).toEqual({ url: `${TARGET}/sql`, method: 'POST', body: 'SELECT program_hash FROM st_module', contentType: 'text/plain' });
        expect(captures[1]).toEqual({ url: `${TARGET}/schema?version=9`, method: 'GET', contentType: undefined });
        expect(captures.slice(2)).toEqual(providers.PTR_INSPECTION_TABLES.map(table => ({ url: `${TARGET}/sql`, method: 'POST', body: `SELECT * FROM ${table}`, contentType: 'text/plain' })));
        expect(providers.PTR_INSPECTION_TABLES).toHaveLength(31); expect(new Set(providers.PTR_INSPECTION_TABLES).size).toBe(31);
      });
      it('reads the actual inner version-10 description through artifactless read-only credentials without exposing a write seam', async () => {
        const f = fixture();
        const cap = providers.createPtrInspectionProviderCredentials({ credentials: {
          spacetimeExecutable: f.artifact.spacetimeExecutable, spacetimeExecutableSha256: f.artifact.spacetimeExecutableSha256,
          spacetimeCliRootDirectory: f.artifact.spacetimeCliRootDirectory, spacetimeCliConfigPath: f.artifact.spacetimeCliConfigPath,
          spacetimeCliConfigSha256: f.artifact.spacetimeCliConfigSha256, assertSource: f.artifact.assertSourceAndArtifact,
          assertCliConfig: f.artifact.assertCliConfig,
        } });
        cleanups.push(() => providers.disposePtrUpdateProviderCredentials(cap));
        await providers.requestPtrInspectionProvider(cap, { operation: 'schema-v10' });
        expect(f.fetch).toHaveBeenCalledWith(`${TARGET}/schema?version=10`, expect.objectContaining({ method: 'GET' }));
        const request = (f.fetch.mock.calls[0]! as unknown as [string, RequestInit])[1];
        expect(request.body).toBeUndefined();
        await expect(providers.requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: vi.fn() })).rejects.toThrow(ERROR);
        await expect(providers.requestPtrInspectionProvider(cap, { operation: 'schema-v10', version: 9 } as never)).rejects.toThrow(ERROR);
        await expect(providers.requestG002UpdateProvider(cap as never, { operation: 'schema' })).rejects.toThrow('G002_UPDATE_PROVIDER_CREDENTIALS_INVALID');
        expect(f.fetch).toHaveBeenCalledOnce();
      });
      it('creates genuine read-only CLI credentials without an artifact and refuses every mutation path', async () => {
        const f = fixture(); const profile = { spacetimeExecutable: f.artifact.spacetimeExecutable, spacetimeExecutableSha256: f.artifact.spacetimeExecutableSha256,
          spacetimeCliRootDirectory: f.artifact.spacetimeCliRootDirectory, spacetimeCliConfigPath: f.artifact.spacetimeCliConfigPath,
          spacetimeCliConfigSha256: f.artifact.spacetimeCliConfigSha256, assertCliConfig: f.artifact.assertCliConfig };
        const assertSourceAndArtifact = f.artifact.assertSourceAndArtifact;
        const cap = providers.createPtrInspectionProviderCredentials({ credentials: { ...profile, assertSource: assertSourceAndArtifact } });
        cleanups.push(() => providers.disposePtrUpdateProviderCredentials(cap));
        await expect(providers.requestPtrUpdateProvider(cap, { operation: 'plan' })).rejects.toThrow(ERROR);
        await expect(providers.requestPtrUpdateProvider(cap, { operation: 'apply', migrationToken: '0x1234', beforeSend: vi.fn() })).rejects.toThrow(ERROR);
        await expect(providers.requestPtrUpdateProvider(cap, { operation: 'metadata' })).rejects.toThrow(ERROR);
        expect(f.fetch).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
        await providers.requestPtrInspectionProvider(cap, { operation: 'program' }); expect(f.fetch).toHaveBeenCalledOnce();
      });
      it('rejects SQL/destination/body injection, unknown tables and getters before credential extraction', async () => {
        const f = fixture(), cap = f.create();
        for (const input of [{ operation: 'apply' }, { operation: 'rows:castle;DELETE FROM castle' },
          { operation: 'rows:unreviewed_table' }, { operation: 'program', sql: 'DELETE FROM castle' },
          { operation: 'program', url: 'https://example.invalid' }, { operation: 'program', body: f.body },
          { get operation() { throw Error(TOKEN); } }, new Proxy({ operation: 'program' }, {})]) {
          await expect(providers.requestPtrInspectionProvider(cap as never, input as never)).rejects.toThrow(ERROR);
        }
        await expect(providers.requestPtrUpdateProvider(cap as never, { operation: 'program' } as never)).rejects.toThrow(ERROR);
        expect(f.fetch).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
      });
      it('erases fixed SQL bodies and rejects token-reflecting read responses', async () => {
        const f = fixture(), cap = f.create(); let sqlBytes!: Buffer;
        f.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
          sqlBytes = options!.body as Buffer; const response = new Response(TOKEN); Object.defineProperty(response, 'url', { value: url }); return response;
        });
        await expect(providers.requestPtrInspectionProvider(cap as never, { operation: 'program' })).rejects.toThrow(ERROR);
        expect(sqlBytes.every(byte => byte === 0)).toBe(true);
      });
      it('retains source/config authentication on fixed reads and bounds a stalled SQL response', async () => {
        vi.useFakeTimers(); const f = fixture(), cap = f.create(); let signal!: AbortSignal;
        f.fetch.mockImplementation((_url: string, options?: RequestInit) => { signal = options!.signal!; return new Promise<Response>(() => {}); });
        const pending = expect(providers.requestPtrInspectionProvider(cap as never, { operation: 'program' })).rejects.toThrow(ERROR);
        await vi.advanceTimersByTimeAsync(30000); await pending; expect(signal.aborted).toBe(true);
        f.source.mockImplementation(() => { throw Error(TOKEN); });
        await expect(providers.requestPtrInspectionProvider(cap as never, { operation: 'program' })).rejects.toThrow(ERROR);
        expect(f.fetch).toHaveBeenCalledOnce();
      });
    }
    it('cleans an acquired CLI when artifact and executable attestations disagree', () => {
      const f = fixture(); f.artifact.spacetimeExecutableSha256 = 'c'.repeat(64);
      expect(f.create).toThrow(ERROR);
      expect(mocks.cleanup).toHaveBeenCalledOnce(); expect(mocks.spawn).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
    });
  });
}
providerSuite('ptr', providers.createPtrUpdateProviderCredentials, providers.requestPtrUpdateProvider, providers.disposePtrUpdateProviderCredentials);
providerSuite('g002', providers.createG002UpdateProviderCredentials, providers.requestG002UpdateProvider, providers.disposeG002UpdateProviderCredentials);
