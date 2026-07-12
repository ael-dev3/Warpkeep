import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGlobalLogLevel, stdbLogger } from 'spacetimedb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureHermesMachineOutput } from '../scripts/hermes-machine-output';
import { connect, requestAdminToken } from '../scripts/hermes-admin';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const TEST_SECRET = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);

afterEach(() => {
  vi.useRealTimers();
});

function runHermes(
  args: string[],
  overrides: Record<string, string | undefined> = {}
) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    WARPKEEP_ADMIN_TOKEN_SECRET: TEST_SECRET,
    ...overrides
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [tsxCli, 'scripts/hermes-admin.ts', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env,
    timeout: 5_000
  });
}

describe('Hermes machine-readable output', () => {
  afterEach(() => {
    setGlobalLogLevel('info');
    vi.restoreAllMocks();
  });

  it('suppresses SpacetimeDB info logs only in machine-readable mode', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    configureHermesMachineOutput(true);
    stdbLogger('info', 'transport chatter');
    expect(output).not.toHaveBeenCalled();

    configureHermesMachineOutput(false);
    stdbLogger('info', 'human transport status');
    expect(output).toHaveBeenCalledOnce();
  });
});

describe('Hermes credential destination policy', () => {
  it.each([
    ['bridge', { WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example' }],
    ['SpacetimeDB origin', { WARPKEEP_SPACETIMEDB_URI: 'https://lookalike.example' }],
    ['database', { WARPKEEP_SPACETIMEDB_DATABASE: 'lookalike-db' }]
  ])('rejects a non-canonical %s before network use', (_label, overrides) => {
    const result = runHermes(['inspect-alpha', '--json'], overrides);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('require the canonical Warpkeep production targets');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });

  it('allows custom targets only for a secret-free dry run', () => {
    const result = runHermes(
      ['allow-fid', '12345', 'test-only-note', '--dry-run', '--confirm'],
      {
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.example',
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun":true');
    expect(result.stderr).toBe('');
  });

  it('rejects a weak admin secret before network use', () => {
    const result = runHermes(['inspect-alpha', '--json'], {
      WARPKEEP_ADMIN_TOKEN_SECRET: 'replace-me'
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must contain 32 to 512 bytes');
    expect(result.stdout).toBe('');
  });

  it('accepts only a bounded exact-JSON admin session and rejects redirects', async () => {
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({
        token: 'header.payload.signature',
        tokenType: 'spacetime-access'
      }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    };
    await expect(requestAdminToken(
      'https://auth.warpkeep.com',
      TEST_SECRET,
      fetchImpl as typeof fetch
    )).resolves.toBe('header.payload.signature');
  });

  it('rejects wrong-media and chunked oversized admin responses generically', async () => {
    const wrongMedia = async () => new Response(JSON.stringify({
      token: 'header.payload.signature',
      tokenType: 'spacetime-access'
    }), { headers: { 'content-type': 'text/plain' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, wrongMedia as typeof fetch
    )).rejects.toThrow('invalid response');

    const oversized = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
        controller.close();
      }
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, oversized as typeof fetch
    )).rejects.toThrow('invalid response');

    const cancelFailure = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
      },
      cancel() {
        throw new Error('stream-cancel-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, cancelFailure as typeof fetch
    )).rejects.toThrow('invalid response');

    const readFailure = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('stream-read-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, readFailure as typeof fetch
    )).rejects.toThrow('invalid response');
  });

  it('disconnects a silent connection when the handshake deadline expires', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const pendingConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    const builder = {
      withUri: vi.fn(() => builder),
      withDatabaseName: vi.fn(() => builder),
      withToken: vi.fn(() => builder),
      onConnect: vi.fn(() => builder),
      onConnectError: vi.fn(() => builder),
      build: vi.fn(() => pendingConnection),
    };

    const connection = connect(
      'https://maincloud.spacetimedb.com',
      'warpkeep-89e4u',
      'header.payload.signature',
      () => builder as never,
    );
    const rejection = expect(connection).rejects.toThrow('Could not connect to the Warpkeep database.');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
