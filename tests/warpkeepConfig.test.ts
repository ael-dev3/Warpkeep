import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SPACETIMEDB_DATABASE,
  DEFAULT_SPACETIMEDB_URI,
  hasUsableWarpkeepBridge,
  readWarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';

describe('Warpkeep runtime configuration', () => {
  it('uses the known Maincloud development database while leaving bridge activation off by default', () => {
    const config = readWarpkeepRuntimeConfig({});
    expect(config.spacetimeUri).toBe(DEFAULT_SPACETIMEDB_URI);
    expect(config.spacetimeDatabase).toBe(DEFAULT_SPACETIMEDB_DATABASE);
    expect(config.publicConfigValid).toBe(true);
    expect(config.sharedAlphaEnabled).toBe(false);
    expect(hasUsableWarpkeepBridge(config)).toBe(false);
  });

  it('accepts only an explicit development localhost bridge, never production localhost HTTP', () => {
    const local = {
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'http://localhost:8787',
      VITE_WARPKEEP_OIDC_ISSUER: 'http://localhost:8787',
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true'
    } as const;

    const production = readWarpkeepRuntimeConfig({ ...local, DEV: false });
    expect(production.bridgeUrl).toBeUndefined();
    expect(production.issuer).toBeUndefined();
    expect(hasUsableWarpkeepBridge(production)).toBe(false);

    const development = readWarpkeepRuntimeConfig({ ...local, DEV: true });
    expect(development.bridgeUrl).toBe('http://localhost:8787');
    expect(development.issuer).toBe('http://localhost:8787');
    expect(hasUsableWarpkeepBridge(development)).toBe(true);
  });

  it('requires the explicit kill switch and one exact bridge/issuer endpoint', () => {
    const complete = {
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'TRUE',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb'
    } as const;

    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig(complete))).toBe(true);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'false'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_WARPKEEP_OIDC_ISSUER: 'https://other-auth.warpkeep.com'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://attacker.example',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://attacker.example'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_SPACETIMEDB_DATABASE: 'lookalike-database'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_SPACETIMEDB_DATABASE: 'warpkeep-89e4u'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_SPACETIMEDB_URI: 'https://lookalike.example'
    }))).toBe(false);
    expect(hasUsableWarpkeepBridge(readWarpkeepRuntimeConfig({
      ...complete,
      VITE_WARPKEEP_OIDC_AUDIENCE: 'lookalike-audience'
    }))).toBe(false);
  });

  it.each([
    ['VITE_SPACETIMEDB_URI', 'not-a-url'],
    ['VITE_SPACETIMEDB_URI', 'https://user:secret@maincloud.spacetimedb.com'],
    ['VITE_SPACETIMEDB_URI', ''],
    ['VITE_SPACETIMEDB_URI', '   '],
    ['VITE_SPACETIMEDB_DATABASE', 'INVALID_DATABASE'],
    ['VITE_SPACETIMEDB_DATABASE', ''],
    ['VITE_SPACETIMEDB_DATABASE', '   '],
    ['VITE_WARPKEEP_OIDC_AUDIENCE', '*'],
    ['VITE_WARPKEEP_OIDC_AUDIENCE', ''],
    ['VITE_WARPKEEP_OIDC_AUDIENCE', '   ']
  ] as const)('fails closed when explicit public coordinate %s is malformed', (key, value) => {
    const parsed = readWarpkeepRuntimeConfig({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
      [key]: value
    });

    expect(parsed.publicConfigValid).toBe(false);
    expect(hasUsableWarpkeepBridge(parsed)).toBe(false);
  });

  it('rejects matching non-root bridge/issuer paths at both parsing and activation gates', () => {
    const parsed = readWarpkeepRuntimeConfig({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com/oidc',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com/oidc'
    });
    expect(parsed.bridgeUrl).toBeUndefined();
    expect(parsed.issuer).toBeUndefined();
    expect(hasUsableWarpkeepBridge(parsed)).toBe(false);

    expect(hasUsableWarpkeepBridge({
      spacetimeUri: DEFAULT_SPACETIMEDB_URI,
      spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
      audience: 'warpkeep-spacetimedb',
      publicConfigValid: true,
      sharedAlphaEnabled: true,
      bridgeUrl: 'https://auth.warpkeep.com/oidc',
      issuer: 'https://auth.warpkeep.com/oidc'
    })).toBe(false);
  });

  it('never activates the checked-in invalid issuer placeholder', () => {
    expect(hasUsableWarpkeepBridge({
      spacetimeUri: DEFAULT_SPACETIMEDB_URI,
      spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
      audience: 'warpkeep-spacetimedb',
      publicConfigValid: true,
      sharedAlphaEnabled: true,
      bridgeUrl: 'https://auth.warpkeep.invalid',
      issuer: 'https://auth.warpkeep.invalid'
    })).toBe(false);
  });
});
