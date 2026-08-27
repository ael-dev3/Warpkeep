// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_002_PRODUCTION_TARGET,
  executeGenesis002Publish,
  genesis002PublishConfirmationDigest,
  genesis002PublishArguments,
  genesis002PublishReceiptDigest,
  parseGenesis002DatabaseList,
  verifyGenesis002GeneratedAbi,
} from '../scripts/genesis002-production-publisher.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_SHA256 = 'e'.repeat(64);
const EXECUTABLE_SHA256 = 'f'.repeat(64);
const CLI_CONFIG_SHA256 = '0'.repeat(64);
const G002_IDENTITY = 'd'.repeat(64);
const G001_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const publishIdentity = {
  sourceCommit: SOURCE_COMMIT,
  moduleSha256: MODULE_SHA256,
  moduleTreeId: MODULE_TREE_ID,
  dependencyClosureDigest: DEPENDENCY_SHA256,
  spacetimeExecutableSha256: EXECUTABLE_SHA256,
  spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
};

function publishReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-production-publish-v1',
    databaseIdentity: G002_IDENTITY,
    database: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    sourceCommit: SOURCE_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_SHA256,
    spacetimeExecutableSha256: EXECUTABLE_SHA256,
    spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
    deleteData: 'never',
    outcome: 'verified',
    freshStatusDigest: '1'.repeat(64),
    playerAccessEnabled: false,
    admissionMutationsEnabled: false,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
  } as const;
}

describe('Genesis 002 production publisher', () => {
  it('pins the exact domain-separated publish receipt digest', () => {
    expect(genesis002PublishReceiptDigest(publishReceipt())).toBe(
      '013a3b8824135f0f1a782a915f9ce8d7908c19d39510423fc1f817e137a06bb1',
    );
    expect(genesis002PublishReceiptDigest({
      ...publishReceipt(),
      moduleSha256: '1'.repeat(64),
    })).not.toBe(
      '013a3b8824135f0f1a782a915f9ce8d7908c19d39510423fc1f817e137a06bb1',
    );
  });

  it('rejects reordered, missing, extra, or malformed publish receipts', () => {
    const receipt = publishReceipt();
    expect(() => genesis002PublishReceiptDigest(
      Object.fromEntries(Object.entries(receipt).reverse()),
    )).toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
    const { sourceCommit: _sourceCommit, ...missing } = receipt;
    expect(() => genesis002PublishReceiptDigest(missing))
      .toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
    expect(() => genesis002PublishReceiptDigest({ ...receipt, unexpected: true }))
      .toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
    expect(() => genesis002PublishReceiptDigest({
      ...receipt,
      outcome: 'submitted',
    })).toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
  });

  it('rejects array coercion for every regex-validated publish receipt field', () => {
    const receipt = publishReceipt();
    for (const field of [
      'databaseIdentity',
      'sourceCommit',
      'moduleSha256',
      'moduleTreeId',
      'dependencyClosureDigest',
      'spacetimeExecutableSha256',
      'spacetimeCliConfigSha256',
      'freshStatusDigest',
    ] as const) {
      expect(
        () => genesis002PublishReceiptDigest({
          ...receipt,
          [field]: [receipt[field]],
        }),
        field,
      ).toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
    }
  });

  it('has one non-overridable new-database target and deletion disabled', () => {
    expect(GENESIS_002_PRODUCTION_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      database: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
      modulePath: 'spacetimedb/genesis002',
      genesis001DatabaseIdentity: G001_IDENTITY,
      deleteData: 'never',
    });
    expect(genesis002PublishArguments(
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
      'warpkeep-genesis-002',
    ]);
  });

  it('parses only an exact unique G002 alias and rejects any G001 collision', () => {
    expect(parseGenesis002DatabaseList(
      `warpkeep-genesis-002 | ${G002_IDENTITY}\n`,
    )).toBe(G002_IDENTITY);
    expect(parseGenesis002DatabaseList('')).toBeNull();
    expect(() => parseGenesis002DatabaseList(
      `warpkeep-genesis-002 | ${G001_IDENTITY}\n`,
    )).toThrow('GENESIS_002_TARGET_COLLIDES_WITH_GENESIS_001');
    expect(() => parseGenesis002DatabaseList(
      `warpkeep-genesis-002 | ${G002_IDENTITY}\nwarpkeep-genesis-002 | ${'e'.repeat(64)}\n`,
    )).toThrow('GENESIS_002_DATABASE_LIST_INVALID');
  });

  it('publishes only from an absent alias with exact confirmation and identity-bound status postflight', async () => {
    const confirmationDigest = genesis002PublishConfirmationDigest(publishIdentity);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'published\n', stderr: '' })
      .mockReturnValueOnce({
        status: 0,
        stdout: `warpkeep-genesis-002 | ${G002_IDENTITY}\n`,
        stderr: '',
      });
    const postflight = vi.fn(async () => ({
      realmId: 'GENESIS_002',
      launchState: 'sealed',
      atlasPresent: false,
      zeroPopulationBoundary: true,
    }));
    await expect(executeGenesis002Publish({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      spawn,
      postflight,
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: { PATH: '/usr/bin:/bin' },
    })).resolves.toMatchObject({
      profile: 'warpkeep-genesis-002-production-publish-v1',
      databaseIdentity: G002_IDENTITY,
      database: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      deleteData: 'never',
      outcome: 'verified',
      publishReceiptDigest:
        '11f932cacf0ef115fb6b67aec1df558456edb580bcec1da2fdbb185a664eec4d',
    });
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls[1]?.[1]).toEqual(
      genesis002PublishArguments(
        '/private/bundle.js',
        '/private/spacetime-root',
        '/private/spacetime-cli.toml',
      ),
    );
    expect(postflight).toHaveBeenCalledWith(G002_IDENTITY);
    for (const call of spawn.mock.calls) {
      expect(call[2]?.env).toEqual({ PATH: '/usr/bin:/bin' });
    }
  });

  it('fails before publish for an existing alias or wrong confirmation', async () => {
    const spawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: `warpkeep-genesis-002 | ${G002_IDENTITY}\n`,
      stderr: '',
    });
    await expect(executeGenesis002Publish({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      confirmationDigest: 'f'.repeat(64),
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      spawn,
      postflight: vi.fn(),
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).rejects.toThrow('GENESIS_002_PUBLISH_CONFIRMATION_INVALID');
    expect(spawn).not.toHaveBeenCalled();

    const confirmationDigest = genesis002PublishConfirmationDigest(publishIdentity);
    await expect(executeGenesis002Publish({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      spawn,
      postflight: vi.fn(),
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).rejects.toThrow('GENESIS_002_DATABASE_ALREADY_EXISTS');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('never retries an uncertain publish and requires manual reconciliation', async () => {
    const confirmationDigest = genesis002PublishConfirmationDigest(publishIdentity);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'connection lost' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });
    await expect(executeGenesis002Publish({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      spawn,
      postflight: vi.fn(),
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).rejects.toMatchObject({
      code: 'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls.filter(call => call[1]?.includes('publish'))).toHaveLength(1);
  });

  it('accepts a lost publish response only after exact fresh identity status reconciliation', async () => {
    const confirmationDigest = genesis002PublishConfirmationDigest(publishIdentity);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'response lost' })
      .mockReturnValueOnce({
        status: 0,
        stdout: `warpkeep-genesis-002 | ${G002_IDENTITY}\n`,
        stderr: '',
      });
    await expect(executeGenesis002Publish({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_SHA256,
      spacetimeExecutableSha256: EXECUTABLE_SHA256,
      spacetimeCliConfigSha256: CLI_CONFIG_SHA256,
      confirmationDigest,
      artifactPath: '/private/bundle.js',
      spacetimeCliRootDirectory: '/private/spacetime-root',
      spacetimeCliConfigPath: '/private/spacetime-cli.toml',
      spacetimeExecutable: '/private/spacetime',
      spawn,
      postflight: vi.fn(async () => ({ zeroPopulationBoundary: true })),
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).resolves.toMatchObject({
      outcome: 'verified-after-submission-error',
      databaseIdentity: G002_IDENTITY,
    });
    expect(spawn.mock.calls.filter(call => call[1]?.includes('publish'))).toHaveLength(1);
  });

  it('pins the exact generated module ABI and rejects activation or omitted sealed wires', () => {
    const reducers = [
      'accept_alpha_terms_v1', 'admin_admit_founder_for_access_request_v2',
      'admin_admit_founder_v1', 'admin_allow_fid',
      'admin_allow_fid_for_access_request_v1',
      'admin_begin_greater_realm_verification_v1', 'admin_bump_auth_epoch',
      'admin_disable_fid', 'admin_finalize_greater_realm_release_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1', 'admin_reset_access_request_v1',
      'admin_stage_greater_realm_release_v1', 'admin_upsert_realm_profile_v1',
      'admin_verify_greater_realm_batch_v1', 'bootstrap_player', 'bootstrap_player_v2',
    ];
    const procedures = [
      'access_request_get_status_v_1', 'access_request_submit_v_1',
      'admin_get_greater_realm_import_plan_v_1',
      'admin_get_greater_realm_status_v_1',
      'auth_resolver_get_fid_admission_v_2', 'get_my_admission_status_v_2',
      'get_realm_status_v1',
    ];
    const tables = [
      'access_request_v1', 'admin_audit', 'allowed_fid',
      'alpha_terms_acceptance_v1', 'castle', 'greater_realm_activation_v1',
      'greater_realm_castle_claim_v1', 'greater_realm_castle_slot_v1',
      'greater_realm_cell_occupancy_v1', 'greater_realm_cell_v1',
      'greater_realm_chunk_v1', 'greater_realm_navigation_component_v1',
      'greater_realm_release_v1', 'greater_realm_resource_node_v1',
      'mark_account_v1', 'player', 'player_ownership_v2', 'player_v2',
      'realm_atlas_v1', 'realm_atlas_visible_region_v1', 'realm_profile_v1',
      'realm_worker_system_v2', 'resource_account_v1',
    ];
    expect(verifyGenesis002GeneratedAbi({
      reducers,
      procedures,
      tables,
      publicTables: [],
    })).toMatchObject({
      reducerCount: 18,
      procedureCount: 7,
      tableCount: 23,
      publicTableCount: 0,
    });
    expect(() => verifyGenesis002GeneratedAbi({
      reducers: [...reducers, 'admin_activate_greater_realm_v1'],
      procedures,
      tables,
      publicTables: [],
    })).toThrow('GENESIS_002_MODULE_ABI_INVALID');
    expect(() => verifyGenesis002GeneratedAbi({
      reducers: reducers.slice(1), procedures, tables, publicTables: [],
    })).toThrow('GENESIS_002_MODULE_ABI_INVALID');
    expect(() => verifyGenesis002GeneratedAbi({
      reducers,
      procedures,
      tables,
      publicTables: ['realm_atlas_v1'],
    })).toThrow('GENESIS_002_MODULE_ABI_INVALID');
  });
});
