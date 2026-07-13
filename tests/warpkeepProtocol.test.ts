import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
  WARPKEEP_EXPECTED_WORLD_SEED,
  WARPKEEP_EXPECTED_WORLD_SEED_NAME,
  readCompatibleWarpkeepBackendInfo
} from '../src/spacetime/warpkeepProtocol';
import { readCompatibleWarpkeepBackendInfoV1 } from './fixtures/warpkeepProtocolV1';

describe('Warpkeep backend protocol v2', () => {
  it('accepts only the v2 backend contract', () => {
    expect(WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION).toBe(2);
    expect(readCompatibleWarpkeepBackendInfo({
      protocolVersion: 2,
      worldSeed: WARPKEEP_EXPECTED_WORLD_SEED,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toEqual({
      protocolVersion: 2,
      worldSeed: WARPKEEP_EXPECTED_WORLD_SEED,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    });
  });

  it('rejects the right generation name with the wrong numeric seed', () => {
    expect(() => readCompatibleWarpkeepBackendInfo({
      protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
      worldSeed: WARPKEEP_EXPECTED_WORLD_SEED - 1,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toThrow('incompatible');
  });

  it('fails closed on the legacy protocol', () => {
    expect(() => readCompatibleWarpkeepBackendInfo({
      protocolVersion: 1,
      worldSeed: 3_445_214_658,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toThrow('incompatible');
  });

  it('proves the frozen protocol-v1 browser refuses a protocol-v2 backend', () => {
    expect(() => readCompatibleWarpkeepBackendInfoV1({
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: WARPKEEP_EXPECTED_WORLD_SEED_NAME
    })).toThrow('incompatible');
  });

  it('pins every protocol-v2 function to an exact wire name', () => {
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
    expect(bindings).toContain(
      '__procedureSchema("get_my_admission_status_v2"',
    );
    expect(bindings).toContain(
      '__procedureSchema("admin_get_alpha_status_v2"',
    );
    expect(bindings).toContain(
      '__reducerSchema("bootstrap_player_v2"',
    );
    expect(bindings).not.toContain('__procedureSchema("get_my_admission_status_v_2"');
    expect(bindings).not.toContain('__procedureSchema("admin_get_alpha_status_v_2"');
    expect(bindings).not.toContain('__reducerSchema("bootstrap_player_v_2"');
  });
});
