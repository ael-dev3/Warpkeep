// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  PTR_PRODUCTION_TARGET,
  executePtrProductionPublish,
  parsePtrDatabaseList,
  ptrProductionPublishArguments,
  ptrProductionPublishConfirmationDigest,
  verifyPtrGeneratedAbi,
} from '../scripts/ptr-production-publisher.mjs';

const G001_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const PTR_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'd'.repeat(64);
const SPACETIME_DIGEST = 'e'.repeat(64);
const CLI_CONFIG_DIGEST = 'f'.repeat(64);

const identity = {
  sourceCommit: SOURCE_COMMIT,
  moduleSha256: MODULE_SHA256,
  moduleTreeId: MODULE_TREE_ID,
  dependencyClosureDigest: DEPENDENCY_DIGEST,
  spacetimeExecutableSha256: SPACETIME_DIGEST,
  spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
};

describe('PTR production publisher', () => {
  it('pins one fresh-only maincloud target and passes no destructive option', () => {
    expect(PTR_PRODUCTION_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      modulePath: 'spacetimedb/ptr',
      genesis001DatabaseIdentity: G001_IDENTITY,
      deleteData: 'never',
    });
    expect(ptrProductionPublishArguments(
      '/private/bundle.js',
      '/private/spacetime-root',
      '/private/spacetime-cli.toml',
    )).toEqual([
      '--root-dir', '/private/spacetime-root',
      '--config-path', '/private/spacetime-cli.toml',
      'publish',
      '--server', 'https://maincloud.spacetimedb.com',
      '--js-path', '/private/bundle.js',
      '--delete-data=never',
      '--no-config',
      '--yes=remote,skip-login',
      'warpkeep-ptr',
    ]);
  });

  it('accepts only one exact PTR alias and rejects every disallowed identity', () => {
    expect(parsePtrDatabaseList(`warpkeep-ptr | ${PTR_IDENTITY}\n`, {
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).toBe(PTR_IDENTITY);
    expect(parsePtrDatabaseList('', {
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).toBeNull();
    for (const collision of [G001_IDENTITY, G002_IDENTITY]) {
      expect(() => parsePtrDatabaseList(`warpkeep-ptr | ${collision}\n`, {
        disallowedDatabaseIdentities: [G002_IDENTITY],
      })).toThrow('PTR_PRODUCTION_TARGET_IDENTITY_FORBIDDEN');
    }
    expect(() => parsePtrDatabaseList(
      `warpkeep-ptr | ${PTR_IDENTITY}\nwarpkeep-ptr | ${'3'.repeat(64)}\n`,
      { disallowedDatabaseIdentities: [G002_IDENTITY] },
    )).toThrow('PTR_PRODUCTION_DATABASE_LIST_INVALID');

    for (const aliases of [
      'warpkeep-ptr, another-alias',
      'another-alias, warpkeep-ptr',
    ]) {
      expect(parsePtrDatabaseList(`${aliases} | ${PTR_IDENTITY}\n`, {
        disallowedDatabaseIdentities: [G002_IDENTITY],
      })).toBe(PTR_IDENTITY);
    }
    for (const malformed of [
      'warpkeep-ptr, | not-an-identity',
      'warpkeep-ptr not-a-table-row',
      `warpkeep-ptr something | ${PTR_IDENTITY}`,
      `warpkeep-ptr | ${PTR_IDENTITY} | unexpected`,
    ]) {
      expect(() => parsePtrDatabaseList(malformed, {
        disallowedDatabaseIdentities: [G002_IDENTITY],
      })).toThrow('PTR_PRODUCTION_DATABASE_LIST_INVALID');
    }
  });

  it('publishes once only after proving the alias absent and reconciles exact identity', async () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'published\n', stderr: '' })
      .mockReturnValueOnce({
        status: 0,
        stdout: `warpkeep-ptr | ${PTR_IDENTITY}\n`,
        stderr: '',
      });
    const postflight = vi.fn(async () => ({
      freshDatabase: true as const,
      admissionSurfacePresent: false as const,
      accessRequestSurfacePresent: false as const,
    }));
    const result = await executePtrProductionPublish({
      ...identity,
      confirmationDigest: ptrProductionPublishConfirmationDigest(identity),
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      childEnvironment: { PATH: '/usr/bin:/bin' },
      assertSourceAndArtifact: vi.fn(),
      postflight,
      spawn,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-ptr-production-publish-v1',
      outcome: 'verified',
      databaseIdentity: PTR_IDENTITY,
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      freshDatabase: true,
      admissionSurfacePresent: false,
      accessRequestSurfacePresent: false,
      publishReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(spawn.mock.calls.filter(call => call[1]?.includes('publish')))
      .toHaveLength(1);
    expect(postflight).toHaveBeenCalledWith(PTR_IDENTITY);
  });

  it('does not publish over an existing alias or retry an ambiguous outcome', async () => {
    const confirmationDigest = ptrProductionPublishConfirmationDigest(identity);
    const existing = vi.fn().mockReturnValue({
      status: 0,
      stdout: `warpkeep-ptr | ${PTR_IDENTITY}\n`,
      stderr: '',
    });
    await expect(executePtrProductionPublish({
      ...identity,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      childEnvironment: {},
      assertSourceAndArtifact: vi.fn(),
      postflight: vi.fn(),
      spawn: existing,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).rejects.toThrow('PTR_PRODUCTION_DATABASE_ALREADY_EXISTS');
    expect(existing).toHaveBeenCalledOnce();

    const ambiguous = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'lost' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });
    await expect(executePtrProductionPublish({
      ...identity,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      childEnvironment: {},
      assertSourceAndArtifact: vi.fn(),
      postflight: vi.fn(),
      spawn: ambiguous,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
    expect(ambiguous.mock.calls.filter(call => call[1]?.includes('publish')))
      .toHaveLength(1);
  });

  it('uses the real process runner when no test runner is injected', async () => {
    await expect(executePtrProductionPublish({
      ...identity,
      confirmationDigest: ptrProductionPublishConfirmationDigest(identity),
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/usr/bin/false',
      childEnvironment: { PATH: '/usr/bin:/bin' },
      assertSourceAndArtifact: vi.fn(),
      postflight: vi.fn(),
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).rejects.toThrow('PTR_PRODUCTION_SPACETIME_COMMAND_FAILED');
  });

  it('never turns a lost publish response into activatable verified evidence', async () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'response lost' })
      .mockReturnValueOnce({
        status: 0,
        stdout: `warpkeep-ptr | ${PTR_IDENTITY}\n`,
        stderr: '',
      });
    const postflight = vi.fn(async () => ({
      freshDatabase: true as const,
      admissionSurfacePresent: false as const,
      accessRequestSurfacePresent: false as const,
    }));
    await expect(executePtrProductionPublish({
      ...identity,
      confirmationDigest: ptrProductionPublishConfirmationDigest(identity),
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      childEnvironment: {},
      assertSourceAndArtifact: vi.fn(),
      postflight,
      spawn,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
    expect(spawn.mock.calls.filter(call => call[1]?.includes('publish')))
      .toHaveLength(1);
    expect(postflight).toHaveBeenCalledOnce();
  });

  it('pins the private generated ABI and rejects widened surfaces', () => {
    const reducers = [
      'admin_begin_greater_realm_verification_v1',
      'admin_finalize_greater_realm_release_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1',
      'admin_provision_ptr_owner_v1',
      'admin_stage_greater_realm_release_v1',
      'admin_suspend_ptr_owner_v1',
      'admin_verify_greater_realm_batch_v1',
    ];
    const procedures = [
      'admin_get_greater_realm_status_v1',
      'get_ptr_owner_status_v1',
      'get_realm_atlas_bootstrap_v1',
      'get_realm_atlas_chunk_v1',
      'get_realm_atlas_resource_locations_v1',
      'get_realm_atlas_window_v1',
      'plan_realm_route_v1',
    ];
    expect(verifyPtrGeneratedAbi({
      reducers,
      procedures,
      tables: [],
      publicTables: [],
    })).toEqual({
      reducerCount: 9,
      procedureCount: 7,
      tableCount: 0,
      publicTableCount: 0,
      ownerProvisionReducerCount: 1,
      ownerSuspendReducerCount: 1,
      atlasActivationReducerCount: 0,
    });
    expect(() => verifyPtrGeneratedAbi({
      reducers: [...reducers, 'admin_activate_greater_realm_v1'],
      procedures,
      tables: [],
      publicTables: [],
    })).toThrow('PTR_PRODUCTION_MODULE_ABI_INVALID');
    expect(() => verifyPtrGeneratedAbi({
      reducers,
      procedures,
      tables: ['allowed_fid'],
      publicTables: [],
    })).toThrow('PTR_PRODUCTION_MODULE_ABI_INVALID');
  });
});
