import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { publishChildEnvironment, publishModule, validateIssuerDeployment } from '../scripts/publish-spacetime-dev.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { protectedAggregateChildEnvironment, protectedAggregateChildOptions, requiredProtectedAggregateSecret, validateProductionSigningKey } from '../scripts/verify-alpha-production.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ISSUER = 'https://auth.warpkeep.com';
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function validDocuments() {
  return {
    discovery: {
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['ES256'],
    },
    jwks: {
      keys: [{
        kty: 'EC',
        crv: 'P-256',
        alg: 'ES256',
        use: 'sig',
        kid: 'warpkeep-test-key',
        x: publicJwk.x,
        y: publicJwk.y,
      }],
    },
  };
}

function withNonCanonicalPaddingBits(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(value.at(-1) ?? '');
  if (index < 0 || index % 4 !== 0) throw new Error('Expected a canonical test coordinate.');
  return `${value.slice(0, -1)}${alphabet[index + 1]}`;
}

describe('activation publish safety', () => {
  it('accepts only direct, no-store, bounded OIDC documents with one exact public key', async () => {
    const documents = validDocuments();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return jsonResponse(url.endsWith('/openid-configuration') ? documents.discovery : documents.jwks);
    };

    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch)).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls.every(({ init }) => init?.redirect === 'error' && init.cache === 'no-store')).toBe(true);
  });

  it('rejects redirects, wrong media types, chunked oversized bodies, and incomplete keys', async () => {
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(null, {
      status: 302,
      headers: { location: 'https://redirect.example/' },
    })) as typeof fetch)).rejects.toThrow(/without redirects/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => jsonResponse(validDocuments().discovery, {
      headers: { 'content-type': 'application/jsonp' },
    })) as typeof fetch)).rejects.toThrow(/exact JSON/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(64 * 1_024 + 1),
      },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
        controller.close();
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(oversized, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const cancelFailure = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
      },
      cancel() {
        throw new Error('publish-stream-cancel-sentinel');
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(cancelFailure, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const documents = validDocuments();
    delete (documents.jwks.keys[0] as { x?: string }).x;
    const incompleteKeyFetch = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, incompleteKeyFetch as typeof fetch))
      .rejects.toThrow(/public-only ES256 signing key/i);
  });

  it('rejects syntactically shaped coordinates that are not a usable P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = 'A'.repeat(43);
    documents.jwks.keys[0].y = 'A'.repeat(43);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/usable public-only ES256/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/unusable public signing key/i);
  });

  it('rejects a non-canonical base64url encoding of a valid P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = withNonCanonicalPaddingBits(documents.jwks.keys[0].x!);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/exact public-only ES256 signing key/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/invalid or private signing key/i);
  });

  it('uses one non-destructive bounded publish attempt with exact arguments', async () => {
    const calls: unknown[][] = [];
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const fakeSpawn = (...args: unknown[]) => {
      calls.push(args);
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    };
    await expect(publishModule('spacetime', 'warpkeep-89e4u', fakeSpawn as never)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('spacetime');
    expect(calls[0]?.[1]).toEqual([
      'publish',
      '--server', 'maincloud',
      '--module-path', 'spacetimedb',
      '--delete-data=never',
      '--yes=remote',
      'warpkeep-89e4u',
    ]);
    expect(calls[0]?.[2]).toMatchObject({
      stdio: 'inherit',
    });
    expect(calls[0]?.[2]).not.toHaveProperty('shell');
    expect(calls[0]?.[2]).toHaveProperty('env');
  });

  it('enforces a hard deadline with graceful then forced termination', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const publish = publishModule('spacetime', 'warpkeep-89e4u', (() => child) as never);
    const rejection = expect(publish).rejects.toThrow(/hard deadline/i);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('error', new Error('test-only signal delivery failure'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('error', new Error('test-only forced-kill delivery failure'));
    await rejection;
  });

  it('returns a failing status when dry-run issuer configuration is absent', () => {
    const result = spawnSync(process.execPath, ['scripts/publish-spacetime-dev.mjs', '--dry-run'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {},
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WARPKEEP_OIDC_ISSUER is required');
  });
});

describe('protected aggregate child isolation', () => {
  it('passes only the four required values and never forwards the ambient environment', () => {
    process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL = 'must-not-be-forwarded';
    try {
      const child = protectedAggregateChildEnvironment(ISSUER, 'test-only-secret');
      expect(Object.keys(child).sort()).toEqual([
        'WARPKEEP_ADMIN_TOKEN_SECRET',
        'WARPKEEP_AUTH_BRIDGE_URL',
        'WARPKEEP_SPACETIMEDB_DATABASE',
        'WARPKEEP_SPACETIMEDB_URI',
      ]);
      expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
    } finally {
      delete process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL;
    }
  });

  it('hard-kills a hung read-only aggregate child at the fixed deadline', () => {
    const options = protectedAggregateChildOptions(repositoryRoot, ISSUER, 'test-only-secret');
    expect(options).toMatchObject({
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 1_000_000,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
  });

  it('fails closed when the activation gate requires an unavailable aggregate credential', () => {
    expect(() => requiredProtectedAggregateSecret(undefined, true))
      .toThrow(/protected aggregate inspection was required/i);
    expect(requiredProtectedAggregateSecret(undefined, false)).toBeUndefined();
  });

  it('does not forward ambient Warpkeep data to the publish CLI', () => {
    const child = publishChildEnvironment({
      PATH: '/test/bin',
      HOME: '/test/home',
      WARPKEEP_UNRELATED_SECRET_SENTINEL: 'must-not-be-forwarded',
      WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-forwarded',
      SIGNING_KEY_JWK: 'must-not-be-forwarded',
    });
    expect(child).toEqual({ PATH: '/test/bin', HOME: '/test/home' });
    expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
  });
});
