import { describe, expect, it } from 'vitest';

import {
  PTR_SPACETIME_URI,
  readPtrRealmConfig,
} from '../src/ptr/ptrRealmConfig';

const PTR_DATABASE_IDENTITY = 'a'.repeat(64);

describe('PTR realm public configuration', () => {
  it('opens only for the exact explicit flag and lower-hex database identity', () => {
    expect(readPtrRealmConfig({
      VITE_WARPKEEP_PTR_ENABLED: 'true',
      VITE_PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
    })).toEqual(Object.freeze({
      availability: 'available',
      enabled: true,
      spacetimeUri: PTR_SPACETIME_URI,
      databaseIdentity: PTR_DATABASE_IDENTITY,
    }));
  });

  it.each([
    [{}, 'missing values'],
    [{
      VITE_WARPKEEP_PTR_ENABLED: 'TRUE',
      VITE_PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
    }, 'non-exact flag'],
    [{
      VITE_WARPKEEP_PTR_ENABLED: 'true',
      VITE_PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY.toUpperCase(),
    }, 'uppercase database identity'],
    [{
      VITE_WARPKEEP_PTR_ENABLED: 'true',
      VITE_PTR_SPACETIMEDB_DATABASE: 'warpkeep-ptr',
    }, 'database alias'],
    [{
      VITE_WARPKEEP_PTR_ENABLED: 'true',
      VITE_PTR_SPACETIMEDB_DATABASE: 'b'.repeat(64),
      VITE_PTR_SPACETIMEDB_URI: 'https://alternate.invalid',
    }, 'alternate URI'],
  ] as const)('fails closed for %s (%s)', (environment, _description) => {
    expect(readPtrRealmConfig(environment)).toEqual(Object.freeze({
      availability: 'unavailable',
    }));
  });

  it('never treats Genesis configuration as a PTR fallback', () => {
    const config = readPtrRealmConfig({
      VITE_WARPKEEP_SPACETIMEDB_DATABASE: 'c'.repeat(64),
      VITE_WARPKEEP_SPACETIMEDB_URI: PTR_SPACETIME_URI,
    });

    expect(config.availability).toBe('unavailable');
    expect(JSON.stringify(config)).not.toMatch(/token|secret|credential|bearer|genesis/iu);
  });
});
