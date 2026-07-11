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
  });

  it('never activates the checked-in invalid issuer placeholder', () => {
    expect(hasUsableWarpkeepBridge({
      spacetimeUri: DEFAULT_SPACETIMEDB_URI,
      spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
      audience: 'warpkeep-spacetimedb',
      sharedAlphaEnabled: true,
      bridgeUrl: 'https://auth.warpkeep.invalid',
      issuer: 'https://auth.warpkeep.invalid'
    })).toBe(false);
  });
});
