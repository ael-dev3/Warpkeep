import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGlobalLogLevel, stdbLogger } from 'spacetimedb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureHermesMachineOutput } from '../scripts/hermes-machine-output';
import { connect, parseHermesArguments, readStatus, requestAdminToken, requireCredentialedProductionTarget } from '../scripts/hermes-admin';

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

  it('projects the protocol-v2 inspection to an exact aggregate allowlist', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = {
      worldTiles: 61n,
      legacyPlayers: 0n,
      playersV2: 0n,
      playerOwnershipsV2: 0n,
      consistentPlayerPairsV2: 0n,
      orphanedPlayerRowsV2: 0n,
      orphanedOwnershipRowsV2: 0n,
      castles: 0n,
      allowedFids: 0n,
      enabledAllowedFids: 0n,
      auditEntries: 2n,
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      note: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV2: vi.fn(async () => status) },
    };

    await readStatus(connection as never, true, true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
      worldTiles: '61',
      legacyPlayers: '0',
      playersV2: '0',
      playerOwnershipsV2: '0',
      consistentPlayerPairsV2: '0',
      orphanedPlayerRowsV2: '0',
      orphanedOwnershipRowsV2: '0',
      castles: '0',
      allowedFids: '0',
      enabledAllowedFids: '0',
      auditEntries: '2',
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
    expect(rendered).not.toContain('must-not-escape');
  });

  it('projects protocol-v3 inspection without private rows or identifiers', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const zeroFields = Object.fromEntries([
      'worldTiles', 'worldTileMeta', 'realms', 'castleSlots', 'castleSlotClaims',
      'legacyPlayers', 'playersV2', 'playerOwnershipsV2', 'castles', 'realmProfiles',
      'markAccounts', 'snapBurnCredits', 'walletAttributions', 'scanCursors',
      'allowedFids', 'enabledAllowedFids', 'auditEntries', 'orphanedPlayerRowsV2',
      'orphanedOwnershipRowsV2', 'orphanedCastleClaims', 'orphanedCastles',
      'orphanedRealmProfiles', 'orphanedMarkAccounts', 'orphanedBurnCredits',
      'founderStateGaps', 'markAccountInvariantViolations',
      'publicMarkProjectionViolations', 'duplicateBurnReferences',
      'burnAccountReconciliationViolations', 'ambiguousActiveWalletAddresses',
    ].map((key) => [key, 0n]));
    const status = {
      ...zeroFields,
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      walletAddress: 'must-not-escape',
      transactionHash: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV3: vi.fn(async () => status) },
    };

    await readStatus(connection as never, false, true, true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(rendered) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      ...Object.keys(zeroFields),
      'protocolVersion', 'worldSeed', 'worldSeedName',
    ].sort());
    expect(parsed).toMatchObject({
      worldTiles: '0',
      snapBurnCredits: '0',
      ambiguousActiveWalletAddresses: '0',
      protocolVersion: 3,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
    expect(rendered).not.toContain('must-not-escape');
  });
});

describe('Hermes command-line boundary', () => {
  it('rejects unknown, duplicate, misplaced, and extra arguments', () => {
    expect(parseHermesArguments(['inspect-alpha', '--json'])).toMatchObject({
      command: 'inspect-alpha',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(() => parseHermesArguments(['inspect-alpha', '--jsno'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--json', '--json'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--confirm'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['allow-fid', '123', 'note', '--json'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-alpha', 'extra'])).toThrow(/unexpected number/i);
  });
});

describe('Hermes credential destination policy', () => {
  it('accepts the canonical name or its pinned immutable identity only', () => {
    const uri = 'https://maincloud.spacetimedb.com';
    const bridge = 'https://auth.warpkeep.com';
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-89e4u', bridge)).not.toThrow();
    expect(() => requireCredentialedProductionTarget(
      uri,
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      bridge,
    )).not.toThrow();
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-lookalike', bridge))
      .toThrow(/canonical Warpkeep production targets/i);
  });

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

  it('classifies protocol-v2 aggregate inspection as read-only', () => {
    const result = runHermes(['inspect-alpha-v2', '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"inspect-alpha-v2"');
    expect(result.stdout).toContain('"mutation":false');
    expect(result.stderr).toBe('');
  });

  it('classifies protocol-v3 aggregate inspection as read-only', () => {
    const result = runHermes(['inspect-alpha-v3', '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"inspect-alpha-v3"');
    expect(result.stdout).toContain('"mutation":false');
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
