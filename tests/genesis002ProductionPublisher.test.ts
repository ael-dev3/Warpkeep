// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_002_PRODUCTION_TARGET,
  createSealedRealmsPublicationMarkerReconciliation,
  createSealedRealmsPublicationPossiblySubmittedMarker,
  digestSealedRealmsPublicationPossiblySubmittedMarker,
  executeGenesis002Publish,
  genesis002PublishConfirmationDigest,
  genesis002PublishArguments,
  genesis002PublishReceiptDigest,
  parseGenesis002DatabaseList,
  parseSealedRealmsPublicationPossiblySubmittedMarker,
  verifyGenesis002GeneratedAbi,
} from '../scripts/genesis002-production-publisher.mjs';
import { genesis002ProductionImportReceiptDigest } from '../scripts/genesis002-activation-receipts.mjs';

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

const g002MarkerInput = Object.freeze({
  lane: 'g002' as const,
  sourceCommit: SOURCE_COMMIT,
  databaseUri: 'https://maincloud.spacetimedb.com' as const,
  alias: 'warpkeep-genesis-002' as const,
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1' as const,
  release: '0.4.0' as const,
  artifactDigest: MODULE_SHA256,
  toolchainDigest: DEPENDENCY_SHA256,
  publishPlanDigest: '1'.repeat(64),
  confirmationDigest: '2'.repeat(64),
  attemptNonce: '3'.repeat(64),
  markedAt: '2026-08-30T12:34:56.789Z',
});

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
  it('creates, parses, and digests the exact canonical possibly-submitted marker', () => {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
      g002MarkerInput,
    );
    const canonical = `${JSON.stringify(marker)}\n`;

    expect(Object.keys(marker)).toEqual([
      'schemaVersion', 'profile', 'lane', 'sourceCommit', 'databaseUri',
      'alias', 'moduleIdentity', 'release', 'artifactDigest',
      'toolchainDigest', 'publishPlanDigest', 'confirmationDigest',
      'attemptNonce', 'markedAt', 'submissionState',
    ]);
    expect(marker).toEqual({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-possibly-submitted-v1',
      ...g002MarkerInput,
      submissionState: 'possibly-submitted',
    });
    expect(Buffer.byteLength(canonical, 'utf8')).toBeLessThanOrEqual(4_096);
    expect(parseSealedRealmsPublicationPossiblySubmittedMarker(canonical))
      .toEqual(marker);
    expect(parseSealedRealmsPublicationPossiblySubmittedMarker(
      new TextEncoder().encode(canonical),
    )).toEqual(marker);
    expect(digestSealedRealmsPublicationPossiblySubmittedMarker(marker))
      .toMatch(/^[0-9a-f]{64}$/u);
    expect(digestSealedRealmsPublicationPossiblySubmittedMarker(canonical))
      .toBe(digestSealedRealmsPublicationPossiblySubmittedMarker(marker));
  });

  it('rejects every noncanonical, reordered, private, accessor, and cross-lane marker', () => {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
      g002MarkerInput,
    );
    const cases: unknown[] = [
      { ...marker, lane: 'ptr' },
      { ...marker, databaseUri: 'https://maincloud.spacetimedb.com/' },
      { ...marker, sourceCommit: SOURCE_COMMIT.toUpperCase() },
      { ...marker, markedAt: '2026-08-30T12:34:56Z' },
      { ...marker, submissionState: 'submitted' },
      { ...marker, ownerFid: '12345' },
      Object.fromEntries(Object.entries(marker).reverse()),
      Object.assign(Object.create({ inherited: true }), marker),
    ];
    const accessor = { ...marker } as Record<string, unknown>;
    Object.defineProperty(accessor, 'attemptNonce', {
      enumerable: true,
      get: () => '3'.repeat(64),
    });
    cases.push(accessor);
    const symbolic = { ...marker };
    Object.defineProperty(symbolic, Symbol('private'), { value: true });
    cases.push(symbolic);

    for (const value of cases) {
      expect(
        () => digestSealedRealmsPublicationPossiblySubmittedMarker(value),
      ).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    }
    expect(() => parseSealedRealmsPublicationPossiblySubmittedMarker(
      JSON.stringify(marker),
    )).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    expect(() => parseSealedRealmsPublicationPossiblySubmittedMarker(
      `${JSON.stringify(marker)}\n `,
    )).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    expect(() => parseSealedRealmsPublicationPossiblySubmittedMarker(
      `${' '.repeat(4_096)}${JSON.stringify(marker)}\n`,
    )).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    expect(() => createSealedRealmsPublicationPossiblySubmittedMarker({
      ...g002MarkerInput,
      lane: 'ptr',
      alias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      release: '0.4.0-ptr.1',
    })).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');

    const decode = vi.fn(() => '');
    vi.stubGlobal('TextDecoder', class {
      decode = decode;
    });
    try {
      expect(() => parseSealedRealmsPublicationPossiblySubmittedMarker(
        new Uint8Array(4_097),
      )).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
      expect(decode).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['sourceCommit', SOURCE_COMMIT],
    ['artifactDigest', MODULE_SHA256],
    ['toolchainDigest', DEPENDENCY_SHA256],
    ['publishPlanDigest', '1'.repeat(64)],
    ['confirmationDigest', '2'.repeat(64)],
    ['attemptNonce', '3'.repeat(64)],
  ] as const)(
    'rejects non-primitive %s values across marker create, parse, and digest',
    (field, valid) => {
      const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
        g002MarkerInput,
      );
      for (const invalid of [[valid], new String(valid)]) {
        expect(() => createSealedRealmsPublicationPossiblySubmittedMarker({
          ...g002MarkerInput,
          [field]: invalid,
        } as never)).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
        expect(() => digestSealedRealmsPublicationPossiblySubmittedMarker({
          ...marker,
          [field]: invalid,
        })).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
      }
      expect(() => parseSealedRealmsPublicationPossiblySubmittedMarker(
        `${JSON.stringify({ ...marker, [field]: [valid] })}\n`,
      )).toThrow('SEALED_REALMS_PUBLICATION_MARKER_INVALID');
    },
  );

  it('constructs only exact adopted or no-effect marker reconciliation evidence', () => {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
      g002MarkerInput,
    );
    const markerDigest = digestSealedRealmsPublicationPossiblySubmittedMarker(
      marker,
    );
    expect(createSealedRealmsPublicationMarkerReconciliation({
      marker,
      markerDigest,
      outcome: 'adopted',
      databaseIdentity: G002_IDENTITY,
      publicationReceiptDigest: '5'.repeat(64),
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
    })).toEqual({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-publication-marker-reconciliation-v1',
      lane: 'g002',
      markerDigest,
      outcome: 'adopted',
      databaseIdentity: G002_IDENTITY,
      publicationReceiptDigest: '5'.repeat(64),
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
    });
    expect(createSealedRealmsPublicationMarkerReconciliation({
      marker,
      markerDigest,
      outcome: 'no-effect',
      databaseIdentity: null,
      publicationReceiptDigest: null,
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
    })).toMatchObject({ outcome: 'no-effect', databaseIdentity: null });
    for (const invalid of [
      { outcome: 'adopted', databaseIdentity: null, publicationReceiptDigest: '5'.repeat(64) },
      { outcome: 'adopted', databaseIdentity: G002_IDENTITY, publicationReceiptDigest: null },
      { outcome: 'no-effect', databaseIdentity: G002_IDENTITY, publicationReceiptDigest: null },
      { outcome: 'no-effect', databaseIdentity: null, publicationReceiptDigest: '5'.repeat(64) },
    ] as const) {
      expect(() => createSealedRealmsPublicationMarkerReconciliation({
        marker,
        markerDigest,
        ...invalid,
        observationDigest: '4'.repeat(64),
        observedAt: '2026-08-30T12:35:56.789Z',
      })).toThrow('SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID');
    }
  });

  it.each([
    ['publicationReceiptDigest', '5'.repeat(64)],
    ['observationDigest', '4'.repeat(64)],
  ] as const)(
    'rejects non-primitive reconciliation %s values',
    (field, valid) => {
      const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
        g002MarkerInput,
      );
      const markerDigest = digestSealedRealmsPublicationPossiblySubmittedMarker(
        marker,
      );
      for (const invalid of [[valid], new String(valid)]) {
        expect(() => createSealedRealmsPublicationMarkerReconciliation({
          marker,
          markerDigest,
          outcome: 'adopted',
          databaseIdentity: G002_IDENTITY,
          publicationReceiptDigest: '5'.repeat(64),
          observationDigest: '4'.repeat(64),
          observedAt: '2026-08-30T12:35:56.789Z',
          [field]: invalid,
        } as never)).toThrow(
          'SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID',
        );
      }
    },
  );

  it('snapshots stateful marker and reconciliation inputs exactly once', () => {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
      g002MarkerInput,
    );
    let laneReads = 0;
    const statefulMarker = new Proxy({ ...marker }, {
      get(target, key, receiver) {
        if (key === 'lane') {
          laneReads += 1;
          return laneReads <= 2 ? 'g002' : 'ptr';
        }
        return Reflect.get(target, key, receiver);
      },
    });
    expect(digestSealedRealmsPublicationPossiblySubmittedMarker(
      statefulMarker,
    )).toBe(digestSealedRealmsPublicationPossiblySubmittedMarker(marker));
    expect(laneReads).toBe(0);

    const markerDigest = digestSealedRealmsPublicationPossiblySubmittedMarker(
      marker,
    );
    const reconciliation = {
      marker,
      markerDigest,
      outcome: 'adopted',
      databaseIdentity: G002_IDENTITY,
      publicationReceiptDigest: '5'.repeat(64),
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
    } as Record<string, unknown>;
    let outcomeReads = 0;
    Object.defineProperty(reconciliation, 'outcome', {
      enumerable: true,
      get: () => (++outcomeReads < 3 ? 'adopted' : 'no-effect'),
    });
    expect(() => createSealedRealmsPublicationMarkerReconciliation(
      reconciliation as never,
    )).toThrow('SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID');
    expect(outcomeReads).toBe(0);
    expect(() => createSealedRealmsPublicationMarkerReconciliation({
      marker,
      markerDigest,
      outcome: 'no-effect',
      databaseIdentity: null,
      publicationReceiptDigest: null,
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
      unexpected: true,
    } as never)).toThrow('SEALED_REALMS_PUBLICATION_RECONCILIATION_INVALID');
  });

  it('never accepts a marker or reconciliation as a publication or import receipt', () => {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker(
      g002MarkerInput,
    );
    const reconciliation = createSealedRealmsPublicationMarkerReconciliation({
      marker,
      markerDigest: digestSealedRealmsPublicationPossiblySubmittedMarker(marker),
      outcome: 'no-effect',
      databaseIdentity: null,
      publicationReceiptDigest: null,
      observationDigest: '4'.repeat(64),
      observedAt: '2026-08-30T12:35:56.789Z',
    });
    for (const value of [marker, reconciliation]) {
      expect(() => genesis002PublishReceiptDigest(value))
        .toThrow('GENESIS_002_PUBLISH_RECEIPT_INVALID');
      expect(() => genesis002ProductionImportReceiptDigest(value))
        .toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
    }
  });

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

  it('publishes only from an absent alias with exact confirmation and CLI identity postflight', async () => {
    const confirmationDigest = genesis002PublishConfirmationDigest(publishIdentity);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'published\n', stderr: '' })
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
      publishReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls[1]?.[1]).toEqual(
      genesis002PublishArguments(
        '/private/bundle.js',
        '/private/spacetime-root',
        '/private/spacetime-cli.toml',
      ),
    );
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
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).rejects.toMatchObject({
      code: 'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls.filter(call => call[1]?.includes('publish'))).toHaveLength(1);
  });

  it('returns only ambiguity after a lost publish response even when the alias appears', async () => {
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
      assertSourceAndArtifact: vi.fn(),
      childEnvironment: {},
    })).rejects.toMatchObject({
      code: 'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
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
