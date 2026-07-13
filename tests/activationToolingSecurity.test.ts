import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { parseMigrationProofReceipt, parsePublishArguments, publishChildEnvironment, publishModule, requireCanonicalPublishCoordinates, validateIssuerDeployment, verifyCanonicalDatabaseList, verifyFreshLegacyAggregate, verifyMigrationArtifactReceipt, verifyPinnedCliAttestation } from '../scripts/publish-spacetime-dev.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { parseProductionVerifierArguments, protectedAggregateChildArguments, protectedAggregateChildEnvironment, protectedAggregateChildOptions, requiredProtectedAggregateSecret, rootAssetUrls, validateProductionSigningKey, verifyBridge, verifyExpectedAlphaAggregate, verifyExpectedAlphaV2Aggregate, verifyRootAssets } from '../scripts/verify-alpha-production.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provenArtifactPath = resolve(repositoryRoot, 'spacetimedb/dist/bundle.js');
const ISSUER = 'https://auth.warpkeep.com';
const FRONTEND = 'https://warpkeep.com';
const AUTH_V2_CLAIMS = [
  'sub',
  'aud',
  'fid',
  'token_type',
  'auth_version',
  'auth_epoch',
  'roles',
  'session_iat',
  'session_exp',
];
const AUTH_V2_SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
};
const AUTH_V2_CREDENTIAL_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
  '/v2/session/logout',
]);
const AUTH_V2_PAUSED_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
]);
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

type AuthV2FixtureOptions = {
  health?: Record<string, unknown>;
  discoveryClaims?: string[];
  omitSecurityHeader?: string;
  legacyNotRetired?: boolean;
  omitCredentialedCors?: boolean;
  exposeHostileCors?: boolean;
  publicRoutesNotPaused?: boolean;
};

function authV2Headers(
  extra: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = new Headers(AUTH_V2_SECURITY_HEADERS);
  if (omitSecurityHeader) headers.delete(omitSecurityHeader);
  new Headers(extra).forEach((value, name) => headers.set(name, value));
  return headers;
}

function credentialedCors(origin: string): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function authV2JsonResponse(
  value: unknown,
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = authV2Headers(extraHeaders, omitSecurityHeader);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

function authV2EmptyResponse(
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  return new Response(null, {
    status,
    headers: authV2Headers(extraHeaders, omitSecurityHeader),
  });
}

function authV2BridgeFetch(options: AuthV2FixtureOptions = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const requestHeaders = new Headers(init?.headers);
    const origin = requestHeaders.get('origin');
    if (url.origin !== ISSUER) throw new Error('Unexpected fixture origin.');

    if (method === 'GET' && url.pathname === '/healthz') {
      return authV2JsonResponse(options.health ?? {
        ok: true,
        service: 'warpkeep-auth-bridge',
        securityProfile: 'warpkeep-auth-v2',
        publicAuthEnabled: false,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return authV2JsonResponse({
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        claims_supported: options.discoveryClaims ?? AUTH_V2_CLAIMS,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return authV2JsonResponse({
        keys: [{
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: 'warpkeep-test-key',
          x: publicJwk.x,
          y: publicJwk.y,
        }],
      }, 200, {}, options.omitSecurityHeader);
    }

    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      if (options.legacyNotRetired) {
        return authV2EmptyResponse(204, origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          vary: 'Origin',
        } : {}, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'legacy_auth_retired',
          message: 'This authentication protocol has been retired.',
        },
      }, 410, origin === FRONTEND ? {
        'access-control-allow-origin': FRONTEND,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
      } : {}, options.omitSecurityHeader);
    }

    if (method === 'OPTIONS' && AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)) {
      const cors = origin === FRONTEND
        ? credentialedCors(FRONTEND)
        : options.exposeHostileCors
          ? credentialedCors(origin ?? '*')
          : {};
      if (options.omitCredentialedCors && origin === FRONTEND) {
        delete (cors as Record<string, string>)['access-control-allow-credentials'];
      }
      if (AUTH_V2_PAUSED_PATHS.has(url.pathname)) {
        if (options.publicRoutesNotPaused) {
          return authV2EmptyResponse(204, cors, options.omitSecurityHeader);
        }
        return authV2JsonResponse({
          error: {
            code: 'public_auth_paused',
            message: 'Farcaster sign-in is temporarily paused for security hardening.',
          },
        }, 503, cors, options.omitSecurityHeader);
      }
      if (origin === FRONTEND) {
        return authV2EmptyResponse(204, cors, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'origin_not_allowed',
          message: 'This browser origin is not allowed.',
        },
      }, 403, {}, options.omitSecurityHeader);
    }

    if (method === 'OPTIONS' && url.pathname === '/v1/admin/token') {
      return authV2JsonResponse({
        error: { code: 'not_found', message: 'Route not found.' },
      }, 404, {}, options.omitSecurityHeader);
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function legacyBridgeFetch() {
  const documents = validDocuments();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const origin = new Headers(init?.headers).get('origin');
    if (method === 'GET' && url.pathname === '/healthz') {
      return jsonResponse({ ok: true, service: 'warpkeep-auth-bridge' });
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return jsonResponse(documents.discovery);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return jsonResponse(documents.jwks);
    }
    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      return new Response(null, {
        status: origin === FRONTEND ? 204 : 403,
        headers: origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          vary: 'Origin',
        } : {},
      });
    }
    if (method === 'OPTIONS' && url.pathname === '/v1/admin/token') {
      return jsonResponse({ error: { code: 'not_found' } }, { status: 404 });
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function withNonCanonicalPaddingBits(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(value.at(-1) ?? '');
  if (index < 0 || index % 4 !== 0) throw new Error('Expected a canonical test coordinate.');
  return `${value.slice(0, -1)}${alphabet[index + 1]}`;
}

async function withTestProvenArtifact<T>(callback: (receipt: {
  artifactPath: string;
  artifactDigest: string;
}) => Promise<T> | T): Promise<T> {
  let previous: Buffer | undefined;
  try {
    previous = await readFile(provenArtifactPath);
  } catch {
    // A clean checkout has no ignored build output to preserve.
  }
  const content = Buffer.from('test-only-proven-spacetimedb-artifact');
  await mkdir(dirname(provenArtifactPath), { recursive: true });
  await writeFile(provenArtifactPath, content, { mode: 0o600 });
  const receipt = Object.freeze({
    artifactPath: provenArtifactPath,
    artifactDigest: createHash('sha256').update(content).digest('hex'),
  });
  try {
    return await callback(receipt);
  } finally {
    if (previous === undefined) await rm(provenArtifactPath, { force: true });
    else await writeFile(provenArtifactPath, previous);
  }
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
    const databaseIdentity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    await withTestProvenArtifact(async receipt => {
      await expect(publishModule(
        'spacetime',
        databaseIdentity,
        receipt,
        fakeSpawn as never,
      )).resolves.toBeUndefined();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('spacetime');
    expect(calls[0]?.[1]).toEqual([
      'publish',
      '--server', 'https://maincloud.spacetimedb.com',
      '--js-path', provenArtifactPath,
      '--delete-data=never',
      '--yes=remote',
      '--no-config',
      databaseIdentity,
    ]);
    expect(calls[0]?.[1]).not.toContain('--module-path');
    expect(calls[0]?.[2]).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(calls[0]?.[2]).not.toHaveProperty('shell');
    expect(calls[0]?.[2]).toHaveProperty('env');
  });

  it('binds an exact single migration receipt and rejects artifact changes before spawn', async () => {
    await withTestProvenArtifact(async receipt => {
      const success = 'Additive protocol-v2 migration proof passed with SpacetimeDB 2.6.1: '
        + `test-only receipt. artifact_sha256=${receipt.artifactDigest}\n`;
      const parsed = parseMigrationProofReceipt(success);
      expect(parsed).toEqual(receipt);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(() => parseMigrationProofReceipt('')).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(`${success}${success}`)).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace('2.6.1', '2.6.2')))
        .toThrow(/exact success receipt/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactPath: resolve(repositoryRoot, 'spacetimedb/dist/other.js'),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactDigest: receipt.artifactDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({ ...receipt, extra: true }))
        .toThrow(/receipt was invalid/i);
      await expect(publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b5700',
        receipt,
        vi.fn() as never,
      )).rejects.toThrow(/pinned canonical database identity/i);

      await writeFile(provenArtifactPath, 'test-only-changed-artifact');
      expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/changed after migration/i);
      const spawnProcess = vi.fn();
      await expect(publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
        receipt,
        spawnProcess as never,
      )).rejects.toThrow(/changed after migration/i);
      expect(spawnProcess).not.toHaveBeenCalled();
    });
  });

  it('rejects a symlink at the canonical proven-artifact path', async () => {
    await withTestProvenArtifact(async receipt => {
      await rm(provenArtifactPath, { force: true });
      try {
        await symlink(resolve(repositoryRoot, 'spacetimedb/src/config.ts'), provenArtifactPath);
        expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/could not be read/i);
      } finally {
        await rm(provenArtifactPath, { force: true });
      }
    });
  });

  it('kills and rejects a publish whose combined output exceeds the fixed bound', async () => {
    await withTestProvenArtifact(async receipt => {
      const child = new EventEmitter() as EventEmitter & {
        kill: ReturnType<typeof vi.fn>;
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.kill = vi.fn();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const publish = publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
        receipt,
        (() => child) as never,
      );
      child.stdout.emit('data', Buffer.alloc(1_000_001));
      child.emit('close', 1, 'SIGKILL');
      await expect(publish).rejects.toThrow(/did not complete successfully/i);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  it('rejects unknown publisher flags and noncanonical production coordinates', () => {
    expect(parsePublishArguments([])).toEqual({ dryRun: false });
    expect(parsePublishArguments(['--dry-run'])).toEqual({ dryRun: true });
    expect(() => parsePublishArguments(['--dryrun'])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments(['--dry-run', '--dry-run'])).toThrow(/unknown or duplicate/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-lookalike',
    })).toThrow(/canonical existing/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    })).not.toThrow();
  });

  it('pins the exact CLI build and canonical existing database identity', () => {
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.1; Commit: 052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).not.toThrow();
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.2; Commit: other',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).toThrow(/exact reviewed/i);
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep-89e4u   | c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).not.toThrow();
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep-89e4u   | a2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).toThrow(/identity/i);
  });

  it('runs the deployed v1 aggregate as the fresh pre-publication hard stop', () => {
    const calls: unknown[][] = [];
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({
        worldTiles: '61',
        allowedFids: '0',
        enabledAllowedFids: '0',
        players: '0',
        castles: '0',
      }),
      stderr: '',
      };
    };
    expect(() => verifyFreshLegacyAggregate(
      'TEST_ONLY_HERMES_SECRET_'.repeat(2),
      fakeSpawnSync,
    )).not.toThrow();
    const options = calls[0]?.[2] as { env?: Record<string, string> };
    expect(options.env).toMatchObject({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    });
    expect(Object.keys(options.env ?? {}).sort()).toEqual([
      'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
      'WARPKEEP_AUTH_BRIDGE_URL',
      'WARPKEEP_SPACETIMEDB_DATABASE',
      'WARPKEEP_SPACETIMEDB_URI',
    ]);
  });

  it('enforces a hard deadline with graceful then forced termination', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    await withTestProvenArtifact(async receipt => {
      const publish = publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
        receipt,
        (() => child) as never,
      );
      const rejection = expect(publish).rejects.toThrow(/hard deadline/i);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      child.emit('error', new Error('test-only signal delivery failure'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      child.emit('error', new Error('test-only forced-kill delivery failure'));
      await rejection;
    });
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

describe('bounded auth-v2 production readiness verification', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves the explicit legacy-compatible mode for the currently contained service', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = legacyBridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(log).toHaveBeenCalledWith(
      'bridge: legacy-compatible health, discovery, JWKS, and strict CORS verified (auth-v2 gate not requested)',
    );
  });

  it('attests contained auth-v2 using only bounded GET and OPTIONS requests', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = authV2BridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2: true,
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(14);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(url.origin).toBe(ISSUER);
      expect(url.pathname).not.toBe('/v1/admin/config-attestation');
      expect(init?.method ?? 'GET').toMatch(/^(?:GET|OPTIONS)$/);
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      if (
        AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)
        || url.pathname === '/v1/farcaster/challenge'
        || url.pathname === '/v1/farcaster/exchange'
      ) {
        expect(headers.get('access-control-request-method')).toBe('POST');
        expect(headers.get('access-control-request-headers')).toBe('content-type');
        expect([FRONTEND, 'https://not-warpkeep.invalid']).toContain(headers.get('origin'));
      }
      if (url.pathname === '/v1/admin/token') {
        expect(headers.get('access-control-request-headers')).toBe('authorization, content-type');
      }
    }
    expect(log).toHaveBeenCalledWith(
      'bridge: contained auth-v2 health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified',
    );
  });

  it.each([
    [
      'a legacy health document',
      { health: { ok: true, service: 'warpkeep-auth-bridge' } },
      /contained Warpkeep security profile/i,
    ],
    [
      'an enabled public-auth switch',
      {
        health: {
          ok: true,
          service: 'warpkeep-auth-bridge',
          securityProfile: 'warpkeep-auth-v2',
          publicAuthEnabled: true,
        },
      },
      /contained Warpkeep security profile/i,
    ],
    [
      'incomplete v2 discovery claims',
      { discoveryClaims: AUTH_V2_CLAIMS.slice(0, -1) },
      /exact required profile and claims/i,
    ],
    [
      'a missing HSTS policy',
      { omitSecurityHeader: 'strict-transport-security' },
      /exact strict-transport-security security header/i,
    ],
    [
      'a non-retired v1 route',
      { legacyNotRetired: true },
      /retired bridge .* returned HTTP 204/i,
    ],
    [
      'non-credentialed v2 CORS',
      { omitCredentialedCors: true },
      /exact credentialed browser CORS/i,
    ],
    [
      'hostile-origin credentialed CORS',
      { exposeHostileCors: true },
      /exposed browser CORS to an untrusted origin/i,
    ],
    [
      'v2 routes that are not demonstrably paused',
      { publicRoutesNotPaused: true },
      /paused check returned HTTP 204/i,
    ],
  ] as const)(
    'fails the explicit auth-v2 gate for %s',
    async (_label, options, expectedError) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2: true,
        fetchImpl: authV2BridgeFetch(options),
      })).rejects.toThrow(expectedError);
    },
  );
});

describe('bounded frontend root-asset verification', () => {
  it('rejects a document with more than the fixed unique root-asset count', () => {
    const tags = Array.from({ length: 17 }, (_, index) => (
      `<script type="module" src="/assets/root-${index}.js"></script>`
    )).join('');
    expect(() => rootAssetUrls(tags, FRONTEND)).toThrow(/too many root application assets/i);
  });

  it('verifies root assets sequentially under one cumulative byte budget', async () => {
    const assets = [
      new URL('/assets/root-a.js', FRONTEND),
      new URL('/assets/root-b.js', FRONTEND),
      new URL('/assets/root.css', FRONTEND),
    ];
    let active = 0;
    let maximumActive = 0;
    const result = await verifyRootAssets(assets, undefined, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolvePromise => queueMicrotask(resolvePromise));
      active -= 1;
      return { byteLength: 1, shaMatches: false };
    });
    expect(result).toEqual({ totalBytes: 3, shaMatches: false });
    expect(maximumActive).toBe(1);

    const budgets: number[] = [];
    await expect(verifyRootAssets(assets, undefined, async (
      _asset: URL,
      _sha: string | undefined,
      maximumBytes: number,
    ) => {
      budgets.push(maximumBytes);
      return { byteLength: maximumBytes, shaMatches: false };
    })).rejects.toThrow(/cumulative byte limit/i);
    expect(budgets).toEqual([16_000_000, 8_000_000]);
  });
});

describe('protected aggregate child isolation', () => {
  const additiveV2Aggregate = Object.freeze({
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

  it('accepts only exact legacy and additive-v2 aggregate objects', () => {
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
    }))).not.toThrow();
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(additiveV2Aggregate))).not.toThrow();
  });

  it.each([
    ['missing ownership count', (() => {
      const value = { ...additiveV2Aggregate } as Record<string, unknown>;
      delete value.playerOwnershipsV2;
      return value;
    })()],
    ['unexpected identity-shaped field', { ...additiveV2Aggregate, identity: 'forbidden' }],
    ['nonzero orphan count', { ...additiveV2Aggregate, orphanedPlayerRowsV2: '1' }],
    ['wrong protocol', { ...additiveV2Aggregate, protocolVersion: 1 }],
    ['wrong generation', { ...additiveV2Aggregate, worldSeedName: 'OTHER' }],
  ])('rejects a protocol-v2 aggregate with %s', (_label, value) => {
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(value))).toThrow();
  });

  it('rejects malformed and extra-key legacy aggregate output', () => {
    expect(() => verifyExpectedAlphaAggregate('{')).toThrow(/machine-readable/i);
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
      identity: 'forbidden',
    }))).toThrow(/unexpected fields/i);
  });

  it('passes only the four required values and never forwards the ambient environment', () => {
    process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL = 'must-not-be-forwarded';
    try {
      const child = protectedAggregateChildEnvironment(ISSUER);
      expect(Object.keys(child).sort()).toEqual([
        'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
        'WARPKEEP_AUTH_BRIDGE_URL',
        'WARPKEEP_SPACETIMEDB_DATABASE',
        'WARPKEEP_SPACETIMEDB_URI',
      ]);
      expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
      expect(JSON.stringify(child)).not.toContain('test-only-secret');
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
    expect(options.input).toBe('test-only-secret');
    expect(JSON.stringify(options.env)).not.toContain('test-only-secret');
  });

  it('selects the versioned aggregate command only for the additive-v2 gate', () => {
    expect(protectedAggregateChildArguments('/test/tsx', false)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha', '--json',
    ]);
    expect(protectedAggregateChildArguments('/test/tsx', true)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v2', '--json',
    ]);
  });

  it('rejects unknown or duplicate production-verifier flags', () => {
    expect(parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-additive-v2-aggregate',
    ])).toEqual({
      requireProtectedAggregate: false,
      requireAdditiveV2Aggregate: true,
      requireAuthV2: true,
    });
    expect(() => parseProductionVerifierArguments(['--require-auth-v3']))
      .toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-auth-v2',
    ])).toThrow(/unknown or duplicate/i);
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
