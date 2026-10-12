// @vitest-environment node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { beforeAll, describe, test } from 'vitest';

const DATABASE = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const PROVIDER_OWNER = 'c200431f50cf410304546489e2600c8446408f1aa727c91d86bc00aef6724d15';
const OTHER = '2'.repeat(64);
const NOW_MICROS = 1_050_000_000n;
let onConnect: (ctx: unknown) => void;
let requirePtrAdmin: (ctx: unknown) => unknown;
let requirePtrAtlasAdmin: (ctx: unknown) => unknown;
let requirePtrOwner: (ctx: unknown) => unknown;

beforeAll(async () => {
  const runtimeStub: Plugin = {
    name: 'ptr-maintenance-connection-runtime',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^spacetimedb\/server$/ }, () => ({ path: 'server', namespace: 'ptr-maintenance-runtime' }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'ptr-maintenance-runtime' }, () => ({ loader: 'js', contents: 'export class SenderError extends Error {}' }));
      pluginBuild.onResolve({ filter: /^\.\/schema$/ }, args => {
        if (args.importer.replaceAll('\\', '/').endsWith('/spacetimedb/ptr/src/lifecycle.ts')) {
          return { path: 'schema', namespace: 'ptr-maintenance-schema' };
        }
      });
      pluginBuild.onLoad({ filter: /.*/, namespace: 'ptr-maintenance-schema' }, () => ({ loader: 'js', contents: 'export default { clientConnected: callback => callback };' }));
    },
  };
  const result = await build({ stdin: { contents: `
    export { onConnect } from './spacetimedb/ptr/src/lifecycle.ts';
    export { requirePtrAdmin, requirePtrAtlasAdmin, requirePtrOwner } from './spacetimedb/ptr/src/auth.ts';
  `, loader: 'ts', resolveDir: resolve(import.meta.dirname, '..'), sourcefile: 'ptr-maintenance-entry.ts' },
  bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false, plugins: [runtimeStub] });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`) as {
    onConnect: typeof onConnect; requirePtrAdmin: typeof requirePtrAdmin;
    requirePtrAtlasAdmin: typeof requirePtrAtlasAdmin; requirePtrOwner: typeof requirePtrOwner;
  };
  ({ onConnect, requirePtrAdmin, requirePtrAtlasAdmin, requirePtrOwner } = module);
});

function maintenanceContext() {
  let databaseReads = 0;
  const context = {
    connectionId: { value: 1n },
    sender: { toHexString: () => PROVIDER_OWNER },
    databaseIdentity: { toHexString: () => DATABASE },
    timestamp: { microsSinceUnixEpoch: NOW_MICROS },
    senderAuth: { isInternal: false, hasJWT: true, jwt: {
      identity: { toHexString: () => PROVIDER_OWNER },
      fullPayload: { iss: 'https://provider.example', sub: 'provider-owner', iat: 1_000, exp: 1_300 },
    } },
    db: new Proxy({}, { get() { databaseReads++; throw new Error('UNEXPECTED_DATABASE_ACCESS'); } }),
  };
  return { context, reads: () => databaseReads };
}

describe('PTR provider-owner maintenance admission', () => {
  test('admits only the pinned authenticated owner without reading or mutating retained rows', () => {
    const { context, reads } = maintenanceContext();
    assert.doesNotThrow(() => onConnect(context));
    assert.equal(reads(), 0);
  });

  test('rejects a different sender, database, or JWT identity before retained-row access', () => {
    for (const change of ['sender', 'databaseIdentity', 'jwtIdentity'] as const) {
      const { context, reads } = maintenanceContext();
      if (change === 'jwtIdentity') context.senderAuth.jwt.identity = { toHexString: () => OTHER };
      else context[change] = { toHexString: () => OTHER };
      assert.throws(() => onConnect(context), /INVALID_PTR_OWNER_SESSION/u);
      assert.equal(reads(), 0);
    }
  });

  test('does not admit internal, connectionless, or JWT-free calls as maintenance', () => {
    for (const change of ['internal', 'connection', 'hasJWT', 'jwt'] as const) {
      const { context, reads } = maintenanceContext();
      const changed: Record<string, unknown> = { ...context, senderAuth: { ...context.senderAuth } };
      const auth = changed.senderAuth as Record<string, unknown>;
      if (change === 'internal') auth.isInternal = true;
      else if (change === 'connection') changed.connectionId = null;
      else if (change === 'hasJWT') auth.hasJWT = false;
      else auth.jwt = null;
      assert.throws(() => onConnect(changed), change === 'jwt' ? /AUTH_REQUIRED/u : /INVALID_PTR_OWNER_SESSION/u);
      assert.equal(reads(), 0);
    }
  });

  test('maintenance admission does not supply owner, provisioning, or atlas procedure authority', () => {
    const { context, reads } = maintenanceContext();
    assert.throws(() => requirePtrAdmin(context), /INVALID_PTR_ADMIN_SESSION/u);
    assert.throws(() => requirePtrAtlasAdmin(context), /INVALID_PTR_ATLAS_ADMIN_SESSION/u);
    assert.throws(() => requirePtrOwner(context), /INVALID_PTR_OWNER_SESSION/u);
    assert.equal(reads(), 0);
  });

  test('retains the ordinary fresh-administrator admission and empty-population guard', () => {
    const { context } = maintenanceContext();
    const payload = { iss: 'https://auth.warpkeep.com', sub: 'service:hermes',
      aud: ['warpkeep-ptr-spacetimedb'], token_type: 'spacetime-access', roles: ['warpkeep-admin'],
      iat: 1_000, nbf: 1_000, exp: 1_300, jti: 'ordinary-atlas-administrator' };
    let reads = 0;
    let population = 0n;
    const ordinary = { ...context, sender: { toHexString: () => OTHER },
      senderAuth: { ...context.senderAuth, jwt: { identity: { toHexString: () => OTHER }, fullPayload: payload } },
      db: new Proxy({}, { get() { return { count: () => { reads++; return population; } }; } }) };
    assert.doesNotThrow(() => onConnect(ordinary));
    assert.equal(reads, 14);
    population = 1n;
    assert.throws(() => onConnect(ordinary), /PTR_POPULATION_NOT_EMPTY/u);
    assert.equal(reads, 28);
  });
});
