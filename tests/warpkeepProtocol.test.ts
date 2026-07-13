import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
  WARPKEEP_EXPECTED_WORLD_SEED_NAME,
  readCompatibleWarpkeepBackendInfo
} from '../src/spacetime/warpkeepProtocol';

describe('Warpkeep backend protocol v2', () => {
  it('accepts only the v2 backend contract', () => {
    expect(WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION).toBe(2);
    expect(readCompatibleWarpkeepBackendInfo({
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toEqual({
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    });
  });

  it('fails closed on the legacy protocol', () => {
    expect(() => readCompatibleWarpkeepBackendInfo({
      protocolVersion: 1,
      worldSeed: 3_445_214_658,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toThrow('incompatible');
  });

  it('pins the resolver procedure to the exact v2 wire name', () => {
    const bindings = readFileSync(
      resolve(process.cwd(), 'src/spacetime/module_bindings/index.ts'),
      'utf8',
    );
    expect(bindings).toContain(
      '__procedureSchema("auth_resolver_get_fid_admission_v2"',
    );
    expect(bindings).not.toContain(
      '__procedureSchema("auth_resolver_get_fid_admission_v_2"',
    );
  });
});
