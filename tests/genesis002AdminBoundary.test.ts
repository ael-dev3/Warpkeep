// @vitest-environment node

import { resolve } from 'node:path';

import { build, type Plugin } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

const captured = {
  lifecycle: undefined as ((ctx: unknown) => unknown) | undefined,
  procedures: new Map<string, (ctx: unknown) => unknown>(),
  reducers: new Map<string, (ctx: unknown, input: unknown) => unknown>(),
};

let requireGenesis002Admin: (ctx: never) => unknown;

import {
  readFreshGenesis002AdminClaims,
} from '../spacetimedb/genesis002/src/adminPolicy';

const ISSUED_AT = 1_800_000_000;
const NOW_MICROS = BigInt(ISSUED_AT) * 1_000_000n;

function validPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: ['warpkeep-genesis-002-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    iat: ISSUED_AT,
    nbf: ISSUED_AT,
    exp: ISSUED_AT + 300,
    jti: 'test-id',
    ...overrides,
  };
}

function context(payload: unknown): unknown {
  return {
    senderAuth: { jwt: { fullPayload: payload } },
    timestamp: { microsSinceUnixEpoch: NOW_MICROS },
    withTx: (effect: (tx: unknown) => unknown) => effect(context(payload)),
  };
}

function expectInvalid(payload: unknown): void {
  expect(() => readFreshGenesis002AdminClaims(payload, NOW_MICROS))
    .toThrow('INVALID_GENESIS_002_ADMIN_SESSION');
}

beforeAll(async () => {
  Object.assign(globalThis, { __genesis002AdminBoundaryCapture: captured });
  const virtualModules = new Map<string, string>([
    ['spacetimedb/server', `
      export class SenderError extends Error {
        constructor(message) { super(message); this.name = 'SenderError'; }
      }
      const scalar = () => ({});
      export const t = {
        array: scalar, bool: scalar, object: scalar, option: scalar,
        string: scalar, u32: scalar, u64: scalar,
      };
    `],
    ['genesis002-schema', `
      const captured = globalThis.__genesis002AdminBoundaryCapture;
      export default {
        clientConnected(handler) { captured.lifecycle = handler; return handler; },
        procedure(options, _output, handler) {
          captured.procedures.set(options.name, handler); return handler;
        },
        reducer(options, _input, handler) {
          captured.reducers.set(options.name, handler); return handler;
        },
      };
    `],
    ['genesis002-population', `
      export const genesis002PopulationSnapshot = () => ({});
      export const requireGenesis002PopulationEmpty = () => undefined;
    `],
    ['genesis002-policy', `
      export const assertGenesis002AtlasNotFinalized = () => undefined;
      export const withGenesis002AtlasImportBoundary = (_snapshot, effect) => effect();
    `],
    ['greater-realm-policy', 'export const GREATER_REALM_PUBLIC_REGIONS = [];'],
    ['greater-realm-authority', `
      export const beginGreaterRealmVerificationV1 = () => undefined;
      export const finalizeGreaterRealmReleaseV1 = () => undefined;
      export const greaterRealmAuthorityErrorCode = () => undefined;
      export const importGreaterRealmChunkPayloadV1 = () => 'imported';
      export const importGreaterRealmComponentsV1 = () => 0;
      export const importGreaterRealmRegionsV1 = () => 0;
      export const inspectGreaterRealmV17 = () => ({
        state: 'empty', verificationPhase: 'none', verificationCursor: 0n,
        verificationDigest: '', expectedComponentCount: 0,
        expectedChunkCount: 0, expectedCellCount: 0, expectedSlotCount: 0,
        expectedResourceNodeCount: 0, componentRows: 0n, chunkRows: 0n,
        cellRows: 0n, slotRows: 0n, resourceRows: 0n, regionManifestRows: 0,
        ready: false,
      });
      export const stageGreaterRealmReleaseV1 = () => 'staged';
      export const verifyGreaterRealmBatchV1 = () => ({ phase: 'complete', processed: 0 });
    `],
  ]);
  const boundaryPlugin: Plugin = {
    name: 'genesis002-admin-boundary-runtime',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^spacetimedb\/server$/ }, () => ({
        path: 'spacetimedb/server', namespace: 'g002-test',
      }));
      pluginBuild.onResolve({ filter: /.*/ }, arguments_ => {
        const importer = arguments_.importer.replaceAll('\\', '/');
        if (!importer.includes('/spacetimedb/genesis002/src/')) return undefined;
        if (arguments_.path === './schema') {
          return { path: 'genesis002-schema', namespace: 'g002-test' };
        }
        if (arguments_.path === './population') {
          return { path: 'genesis002-population', namespace: 'g002-test' };
        }
        if (arguments_.path === './policy') {
          return { path: 'genesis002-policy', namespace: 'g002-test' };
        }
        if (arguments_.path === '../../src/greaterRealmV17Policy') {
          return { path: 'greater-realm-policy', namespace: 'g002-test' };
        }
        if (arguments_.path === '../../src/greaterRealmV17Authority') {
          return { path: 'greater-realm-authority', namespace: 'g002-test' };
        }
        return undefined;
      });
      pluginBuild.onLoad({ filter: /.*/, namespace: 'g002-test' }, arguments_ => ({
        contents: virtualModules.get(arguments_.path) ?? '',
        loader: 'js',
      }));
    },
  };
  const result = await build({
    stdin: {
      contents: `
        import './spacetimedb/genesis002/src/lifecycle.ts';
        import './spacetimedb/genesis002/src/atlasImportReducers.ts';
        export { requireGenesis002Admin } from './spacetimedb/genesis002/src/auth.ts';
      `,
      resolveDir: resolve(import.meta.dirname, '..'),
      sourcefile: 'genesis002-admin-boundary-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    plugins: [boundaryPlugin],
  });
  const encoded = Buffer.from(result.outputFiles[0]!.text).toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}`) as Readonly<{
    requireGenesis002Admin: (ctx: never) => unknown;
  }>;
  requireGenesis002Admin = module.requireGenesis002Admin;
});

describe('Genesis 002 administrator confused-deputy boundary', () => {
  it('accepts only the exact fresh Hermes G002 authority shape', () => {
    expect(readFreshGenesis002AdminClaims(validPayload(), NOW_MICROS)).toEqual({
      issuer: 'https://auth.warpkeep.com',
      subject: 'service:hermes',
      audience: ['warpkeep-genesis-002-spacetimedb'],
      tokenType: 'spacetime-access',
      roles: ['warpkeep-admin'],
      issuedAt: ISSUED_AT,
      notBefore: ISSUED_AT,
      expiresAt: ISSUED_AT + 300,
      jti: 'test-id',
    });
  });

  it.each([
    ['G001 audience', { aud: ['warpkeep-spacetimedb'] }],
    ['PTR audience', { aud: ['warpkeep-ptr-spacetimedb'] }],
    ['scalar audience', { aud: 'warpkeep-genesis-002-spacetimedb' }],
    ['multiple audiences', { aud: ['warpkeep-genesis-002-spacetimedb', 'warpkeep-spacetimedb'] }],
    ['wrong issuer', { iss: 'https://hostile.example' }],
    ['wrong subject', { sub: 'service:auth-epoch-resolver' }],
    ['wrong role', { roles: ['warpkeep-ptr-owner'] }],
    ['multiple roles', { roles: ['warpkeep-admin', 'warpkeep-ptr-owner'] }],
    ['wrong token type', { token_type: 'player-access' }],
    ['future iat beyond skew', { iat: ISSUED_AT + 2 }],
    ['future nbf beyond skew', { nbf: ISSUED_AT + 2 }],
    ['expired token', { exp: ISSUED_AT }],
    ['overlong lifetime', { exp: ISSUED_AT + 301 }],
    ['unsafe iat', { iat: 1.5 }],
    ['unsafe nbf', { nbf: -1 }],
    ['unsafe expiry', { exp: Number.MAX_SAFE_INTEGER + 1 }],
    ['empty jti', { jti: '' }],
    ['non-url-safe jti', { jti: 'test id' }],
    ['overlong jti', { jti: 'A'.repeat(129) }],
  ])('rejects %s', (_name, override) => {
    expectInvalid(validPayload(override));
  });

  it.each([
    'auth_version',
    'auth_epoch',
    'fid',
    'realm_id',
    'session_iat',
    'session_exp',
    'resolver_fid',
    'request_fid',
    'request_operation',
    'device_thumbprint',
    'scope',
    'permissions',
    'authority',
    'admin',
  ])('rejects unknown authority-bearing claim %s', key => {
    expectInvalid({ ...validPayload(), [key]: key === 'fid' ? '123' : 'hostile' });
  });

  it('rejects non-record, null-prototype, and custom-prototype claim containers', () => {
    for (const payload of [
      null,
      [],
      'token',
      Object.assign(Object.create(null), validPayload()),
      Object.assign(Object.create({ fid: '123' }), validPayload()),
    ]) {
      expectInvalid(payload);
    }
  });

  it('rejects non-enumerable and symbol own claim keys', () => {
    const hidden = validPayload();
    Object.defineProperty(hidden, 'fid', {
      value: '123',
      enumerable: false,
    });
    const symbol = Object.assign(validPayload(), {
      [Symbol('authority')]: 'hostile',
    });
    expectInvalid(hidden);
    expectInvalid(symbol);
  });

  it('maps every local parser failure to the one G002 sender error', () => {
    for (const payload of [validPayload({ aud: ['warpkeep-spacetimedb'] }), null]) {
      expect(() => requireGenesis002Admin(context(payload) as never)).toThrowError(
        expect.objectContaining({
          name: 'SenderError',
          message: 'INVALID_GENESIS_002_ADMIN_SESSION',
        }),
      );
    }
  });

  it('enforces the same G002 parser in lifecycle and every atlas-import entrypoint', () => {
    const hostile = context(validPayload({ aud: ['warpkeep-spacetimedb'] }));
    expect(captured.lifecycle).toBeTypeOf('function');
    expect(() => captured.lifecycle?.(hostile)).toThrow(
      'INVALID_GENESIS_002_ADMIN_SESSION',
    );

    for (const name of [
      'admin_get_greater_realm_status_v1',
      'admin_get_greater_realm_import_plan_v1',
    ]) {
      const procedure = captured.procedures.get(name);
      expect(procedure, name).toBeTypeOf('function');
      expect(() => procedure?.(hostile), name).toThrow(
        'INVALID_GENESIS_002_ADMIN_SESSION',
      );
    }
    for (const name of [
      'admin_stage_greater_realm_release_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_begin_greater_realm_verification_v1',
      'admin_verify_greater_realm_batch_v1',
      'admin_finalize_greater_realm_release_v1',
    ]) {
      const reducer = captured.reducers.get(name);
      expect(reducer, name).toBeTypeOf('function');
      expect(() => reducer?.(hostile, {
        atlasId: 'GENESIS_002_GREATER_REALM',
      }), name).toThrow('INVALID_GENESIS_002_ADMIN_SESSION');
    }
  });
});
