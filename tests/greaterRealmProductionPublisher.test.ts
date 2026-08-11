// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  executeGreaterRealmProductionPublishLane,
  greaterRealmProductionModuleDeltaPolicy,
  GREATER_REALM_PRODUCTION_PUBLISH_LANE,
  GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
  GREATER_REALM_PRODUCTION_V14_TABLE_REFS,
  GREATER_REALM_PRODUCTION_V17_TABLE_REFS,
  requireGreaterRealmProductionPublishLane,
  type GreaterRealmProductionPublishLane,
  type GreaterRealmProductionReleaseFlags,
} from '../scripts/greater-realm-production-publisher-core';
import type { MigrationArtifactReceipt } from '../scripts/publish-spacetime-dev.mjs';
import type { GreaterRealmProductionImportStatus } from '../scripts/greater-realm-production-import-core';
import { inspectGreaterRealmLegacyProductionAggregate } from '../scripts/greater-realm-production-legacy-aggregate';
import {
  parseGreaterRealmProductionPublisherArguments,
  publishGreaterRealmModuleWithFreshPostflight,
} from '../scripts/greater-realm-production-publisher';
import type {
  GreaterRealmProductionCompileMode,
  GreaterRealmProductionCutoverStatus,
} from '../scripts/greater-realm-production-relocation-core';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
} from '../scripts/greater-realm-production-transport';

const artifactReceipt = Object.freeze({
  artifactPath: '/test/spacetimedb/dist/bundle.js',
  v11TableSchemaDigest: '1'.repeat(64),
  v12TableSchemaDigest: '2'.repeat(64),
  v13TableSchemaDigest: '3'.repeat(64),
  v14TableSchemaDigest: '4'.repeat(64),
  v15TableSchemaDigest: '5'.repeat(64),
  v16TableSchemaDigest: '6'.repeat(64),
  v17TableSchemaDigest: '7'.repeat(64),
  artifactDigest: '8'.repeat(64),
}) satisfies MigrationArtifactReceipt;

function approvals(lane: GreaterRealmProductionPublishLane): GreaterRealmProductionReleaseFlags {
  const importLane = lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17;
  return Object.freeze({
    entryAgreementApproved: true,
    additivePublishApproved: true,
    importForwardFixApproved: importLane,
    activationForwardFixApproved:
      lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17 && !importLane,
    clientActivationApproved: false,
    admissionNotificationsApproved: false,
  });
}
const ATLAS_SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SOURCE_COMMIT = 'c'.repeat(40);
const ATLAS_ID = 'GREATER_REALM_V1';
const PUBLIC_RELEASE_ID = 'GRR-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const EXPECTED_RELEASE_SHA256 = 'd'.repeat(64);
const CLOSED_RELEASE_FLAGS = Object.freeze({
  entryAgreementApproved: false,
  additivePublishApproved: false,
  importForwardFixApproved: false,
  activationForwardFixApproved: false,
  clientActivationApproved: false,
  admissionNotificationsApproved: false,
}) satisfies GreaterRealmProductionReleaseFlags;

function status(input: Readonly<{
  state?: GreaterRealmProductionImportStatus['state'];
  importCompiled: boolean;
  activationCompiled: boolean;
}>): GreaterRealmProductionImportStatus {
  const present = input.state !== undefined && input.state !== 'absent';
  return Object.freeze({
    present,
    atlasId: present ? ATLAS_ID : undefined,
    publicReleaseId: present ? PUBLIC_RELEASE_ID : undefined,
    state: input.state ?? 'absent',
    importEpoch: present ? 7n : undefined,
    verificationPhase: present ? 'complete' : 'components',
    verificationCursor: 0n,
    verificationDigest: present ? 'a'.repeat(64) : `sha256-v1:${'0'.repeat(64)}:0:`,
    expectedComponentCount: present ? 4 : 0,
    expectedChunkCount: present ? 8 : 0,
    expectedCellCount: present ? 1200 : 0,
    expectedSlotCount: present ? 600 : 0,
    expectedResourceNodeCount: present ? 12000 : 0,
    regionManifestRows: present ? 6 : 0,
    componentRows: present ? 4n : 0n,
    chunkRows: present ? 8n : 0n,
    cellRows: present ? 1200n : 0n,
    slotRows: present ? 600n : 0n,
    resourceRows: present ? 12000n : 0n,
    claimRows: input.state === 'active' || input.state === 'halted' ? 100n : 0n,
    occupancyRows: input.state === 'active' || input.state === 'halted' ? 100n : 0n,
    activationRows: 0n,
    publicAtlasRows: input.state === 'active' || input.state === 'halted' ? 1n : 0n,
    publicRegionRows: input.state === 'active' || input.state === 'halted' ? 6n : 0n,
    workerSystemRows: input.state === 'active' || input.state === 'halted' ? 1n : 0n,
    importsExact: present,
    ready: input.state === 'ready',
    importMutationsCompiled: input.importCompiled,
    activationMutationsCompiled: input.activationCompiled,
  });
}

function cutoverStatus(input: Readonly<{
  releaseState: string;
  activationMode: string;
  importCompiled: boolean;
  activationCompiled: boolean;
  publicGraph?: boolean;
}>): GreaterRealmProductionCutoverStatus {
  const publicGraph = input.publicGraph === true;
  return Object.freeze({
    importMutationsCompiled: input.importCompiled,
    activationMutationsCompiled: input.activationCompiled,
    releaseState: input.releaseState,
    activationMode: input.activationMode,
    activationPresent: input.activationMode !== 'absent',
    releasePresent: true,
    atlasId: ATLAS_ID,
    publicReleaseId: PUBLIC_RELEASE_ID,
    sourceCommit: ATLAS_SOURCE_COMMIT,
    expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
    atlasRows: publicGraph ? 1n : 0n,
    atlasMode: publicGraph ? input.activationMode : 'absent',
    visibleRegionRows: publicGraph ? 6n : 0n,
    activeVisibleRegionRows: publicGraph ? 6n : 0n,
    workerSystemV2Rows: publicGraph ? 1n : 0n,
    workerSystemV2Mode: publicGraph ? input.activationMode : 'absent',
    currentWorldGraphApplicable: publicGraph,
  } as GreaterRealmProductionCutoverStatus);
}

function fakeDependencies() {
  const v14 = vi.fn((value: unknown) => {
    const description = value as Readonly<{ generation?: string }>;
    if (description.generation !== undefined && description.generation !== 'v14') {
      throw new Error('not v14');
    }
    return Object.freeze({
      tableSignatures: Object.freeze({ legacy: 'exact' }),
      tableCount: 56 as const,
    });
  });
  const v17 = vi.fn((input: Readonly<{
    description: unknown;
    artifactReceipt: MigrationArtifactReceipt;
    predecessorSignatures?: Readonly<Record<string, string>>;
  }>) => {
    const description = input.description as Readonly<{ generation?: string }>;
    if (description.generation !== undefined && description.generation !== 'v17') {
      throw new Error('not v17');
    }
    if (
      input.predecessorSignatures !== undefined
      && input.predecessorSignatures.legacy !== 'exact'
    ) throw new Error('predecessor changed');
    return Object.freeze({
      tableSignatures: Object.freeze({ legacy: 'exact', suffix: 'exact' }),
      tableCount: 84 as const,
    });
  });
  const projectCutoverStatus = vi.fn((
    value: unknown,
    mode: GreaterRealmProductionCompileMode,
  ) => {
    const projected = value as GreaterRealmProductionCutoverStatus;
    if (
      projected.importMutationsCompiled !== mode.importMutationsCompiled
      || projected.activationMutationsCompiled !== mode.activationMutationsCompiled
    ) throw new Error('compile mode changed');
    return projected;
  });
  const projectCutoverStatusShape = vi.fn((value: unknown) => (
    value as GreaterRealmProductionCutoverStatus
  ));
  return {
    verifyV14Predecessor: v14,
    verifyV17Schema: v17,
    projectCutoverStatus,
    projectCutoverStatusShape,
  };
}

async function executeLane(
  lane: GreaterRealmProductionPublishLane,
  before: GreaterRealmProductionImportStatus | GreaterRealmProductionCutoverStatus | undefined,
  after: GreaterRealmProductionImportStatus | GreaterRealmProductionCutoverStatus,
  options: Readonly<{
    publishThrows?: boolean;
    publishThrowsBefore?: boolean;
    afterHistorical?: unknown;
    flags?: GreaterRealmProductionReleaseFlags;
    expectedAtlasSourceCommit?: string;
    expectedAtlasId?: string;
    expectedPublicReleaseId?: string;
    expectedReleaseSha256?: string;
    moduleSourceCommit?: string;
    moduleDeltaPolicy?: 'append-approval-only' | 'import-gate-only'
      | 'activation-gate-only' | 'reviewed-same-schema';
  }> = {},
) {
  let published = false;
  const append = lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17;
  const readSchema = vi.fn(async () => ({
    generation: append ? published ? 'v17' : 'v14' : 'v17',
  }));
  const readImportStatus = vi.fn(async () => (
    published ? { ...after } : { ...(before ?? after) }
  ));
  const cutoverAuthority = (
    value: GreaterRealmProductionImportStatus | GreaterRealmProductionCutoverStatus,
  ) => 'present' in value ? {
      importMutationsCompiled: value.importMutationsCompiled,
      activationMutationsCompiled: value.activationMutationsCompiled,
      releasePresent: value.present,
      releaseState: value.state,
      activationPresent: false,
      activationMode: 'absent',
      atlasId: value.atlasId,
      publicReleaseId: value.publicReleaseId,
      sourceCommit: value.present ? ATLAS_SOURCE_COMMIT : undefined,
      expectedReleaseSha256: value.present ? EXPECTED_RELEASE_SHA256 : undefined,
      importEpoch: value.importEpoch,
      expectedComponentCount: value.expectedComponentCount,
      expectedChunkCount: value.expectedChunkCount,
      expectedCellCount: value.expectedCellCount,
      expectedSlotCount: value.expectedSlotCount,
      expectedResourceNodeCount: value.expectedResourceNodeCount,
      regionManifestRows: value.regionManifestRows,
      componentRows: value.componentRows,
      chunkRows: value.chunkRows,
      cellRows: value.cellRows,
      slotRows: value.slotRows,
      resourceNodeRows: value.resourceRows,
      greaterRealmClaimRows: value.claimRows,
      greaterRealmOccupancyRows: value.occupancyRows,
      activationRows: value.activationRows,
      atlasRows: value.publicAtlasRows,
      visibleRegionRows: value.publicRegionRows,
      workerSystemV2Rows: value.workerSystemRows,
      releaseImportsExact: value.importsExact,
      releaseReady: value.ready,
    } as GreaterRealmProductionCutoverStatus
    : value;
  const readCutoverStatus = vi.fn(async () => cutoverAuthority(
    published ? after : (before ?? after),
  ));
  const historical = Object.freeze({ founders: 100n, workers: 400n, privateRows: 'counts-only' });
  const readHistoricalAggregate = vi.fn(async () => (
    published ? (options.afterHistorical ?? historical) : historical
  ));
  const publish = vi.fn(async () => {
    if (options.publishThrowsBefore) throw new Error('publisher did not reach server');
    published = true;
    if (options.publishThrows) throw new Error('response lost');
  });
  const receipt = await executeGreaterRealmProductionPublishLane({
    lane,
    flags: options.flags ?? approvals(lane),
    expectedAtlasSourceCommit: options.expectedAtlasSourceCommit ?? ATLAS_SOURCE_COMMIT,
    expectedAtlasId: options.expectedAtlasId ?? ATLAS_ID,
    expectedPublicReleaseId: options.expectedPublicReleaseId ?? PUBLIC_RELEASE_ID,
    expectedReleaseSha256: options.expectedReleaseSha256 ?? EXPECTED_RELEASE_SHA256,
    moduleSourceCommit: options.moduleSourceCommit ?? MODULE_SOURCE_COMMIT,
    moduleDeltaPolicy: options.moduleDeltaPolicy
      ?? greaterRealmProductionModuleDeltaPolicy(lane),
    artifactReceipt,
    readSchema,
    readImportStatus,
    readCutoverStatus,
    readHistoricalAggregate,
    publish,
    testOnlyDependencies: fakeDependencies(),
  });
  return {
    receipt, readSchema, readImportStatus, readCutoverStatus,
    readHistoricalAggregate, publish,
  };
}

describe('Greater Realm production publisher lanes', () => {
  it('rejects an injected closed approval envelope before selecting a lane', () => {
    expect(() => requireGreaterRealmProductionPublishLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      CLOSED_RELEASE_FLAGS,
    )).toThrow(/COMPOSITE_APPROVAL_REQUIRED/);
    expect(Object.keys(GREATER_REALM_PRODUCTION_RELEASE_FLAGS).sort())
      .toEqual(Object.keys(CLOSED_RELEASE_FLAGS).sort());
  });

  it('requires one exact named publisher lane and explicit confirmation', () => {
    for (const lane of Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE)) {
      expect(parseGreaterRealmProductionPublisherArguments([lane, '--confirm']))
        .toEqual({ lane, confirmed: true });
    }
    for (const arguments_ of [
      [] as string[],
      ['append-inert-v17'],
      ['append-inert-v17', '--confirm', '--confirm'],
      ['unknown', '--confirm'],
    ]) expect(() => parseGreaterRealmProductionPublisherArguments(arguments_)).toThrow(/USAGE/);
  });

  it('binds exactly 56 v14 and 84 v17 table identities', () => {
    expect(Object.keys(GREATER_REALM_PRODUCTION_V14_TABLE_REFS)).toHaveLength(56);
    expect(Object.keys(GREATER_REALM_PRODUCTION_V17_TABLE_REFS)).toHaveLength(84);
    expect(GREATER_REALM_PRODUCTION_V17_TABLE_REFS.greater_realm_release_v1).toBe(72);
    expect(GREATER_REALM_PRODUCTION_V17_TABLE_REFS.realm_worker_system_v2).toBe(83);
    for (const [name, reference] of Object.entries(GREATER_REALM_PRODUCTION_V14_TABLE_REFS)) {
      expect(GREATER_REALM_PRODUCTION_V17_TABLE_REFS[name]).toBe(reference);
    }
  });

  it('executes the 56-to-84 append only into the inert compile mode', async () => {
    const result = await executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: false, activationCompiled: false }),
    );
    expect(result.receipt).toMatchObject({
      outcome: 'verified',
      atlasSourceCommit: ATLAS_SOURCE_COMMIT,
      atlasId: ATLAS_ID,
      publicReleaseId: PUBLIC_RELEASE_ID,
      expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      moduleDeltaPolicy: 'append-approval-only',
      predecessorTableCount: 56,
      postTableCount: 84,
      schemaMutation: 'append-28',
      importMutationsCompiled: false,
      activationMutationsCompiled: false,
      releaseState: 'absent',
    });
    expect(result.publish).toHaveBeenCalledTimes(1);
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: false, activationCompiled: false }),
      { moduleDeltaPolicy: 'reviewed-same-schema' },
    )).rejects.toThrowError('GREATER_REALM_PRODUCTION_MODULE_DELTA_POLICY_INVALID');
  });

  it.each([
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
      status({ importCompiled: false, activationCompiled: false }),
      status({ importCompiled: true, activationCompiled: false }),
      'import',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17,
      status({ state: 'importing', importCompiled: true, activationCompiled: false }),
      status({ state: 'importing', importCompiled: true, activationCompiled: false }),
      'import',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17,
      status({ state: 'ready', importCompiled: true, activationCompiled: false }),
      status({ state: 'ready', importCompiled: true, activationCompiled: false }),
      'import',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17,
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: true, activationCompiled: false,
      }),
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: false, activationCompiled: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_READY_V17,
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: false, activationCompiled: true,
      }),
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: false, activationCompiled: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_PREPARED_V17,
      cutoverStatus({
        releaseState: 'ready', activationMode: 'prepared',
        importCompiled: false, activationCompiled: true,
      }),
      cutoverStatus({
        releaseState: 'ready', activationMode: 'prepared',
        importCompiled: false, activationCompiled: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_CANARY_V17,
      cutoverStatus({
        releaseState: 'canary', activationMode: 'canary',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      cutoverStatus({
        releaseState: 'canary', activationMode: 'canary',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ACTIVE_V17,
      cutoverStatus({
        releaseState: 'active', activationMode: 'active',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      cutoverStatus({
        releaseState: 'active', activationMode: 'active',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_HALTED_V17,
      cutoverStatus({
        releaseState: 'halted', activationMode: 'halted',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      cutoverStatus({
        releaseState: 'halted', activationMode: 'halted',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
      'cutover',
    ],
    [
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ROLLED_BACK_V17,
      cutoverStatus({
        releaseState: 'ready', activationMode: 'rolled-back',
        importCompiled: false, activationCompiled: true,
      }),
      cutoverStatus({
        releaseState: 'ready', activationMode: 'rolled-back',
        importCompiled: false, activationCompiled: true,
      }),
      'cutover',
    ],
  ] as const)('executes same-schema forward lane %s without changing state', async (
    lane,
    before,
    after,
    reader,
  ) => {
    const result = await executeLane(lane, before, after);
    expect(result.receipt).toMatchObject({
      predecessorTableCount: 84,
      postTableCount: 84,
      schemaMutation: 'none',
      releaseState: 'releaseState' in after ? after.releaseState : after.state,
      importMutationsCompiled: after.importMutationsCompiled,
      activationMutationsCompiled: after.activationMutationsCompiled,
    });
    expect(reader === 'import' ? result.readImportStatus : result.readCutoverStatus)
      .toHaveBeenCalledTimes(3);
  });

  it.each([
    GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_DRAINING_V17,
    GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_FROZEN_V17,
    GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_PLANNED_V17,
  ] as const)('preserves the exact pre-canary phase for %s', async lane => {
    const activationMode = lane.includes('draining')
      ? 'draining'
      : lane.includes('frozen') ? 'frozen' : 'planned';
    const checkpoint = cutoverStatus({
      releaseState: 'ready', activationMode,
      importCompiled: false, activationCompiled: true,
    });
    const result = await executeLane(lane, checkpoint, checkpoint);
    expect(result.receipt).toMatchObject({ releaseState: 'ready', activationMode });
  });

  it('never models active or halted as an import-enabled predecessor', async () => {
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ACTIVE_V17,
      cutoverStatus({
        releaseState: 'active', activationMode: 'active',
        importCompiled: true, activationCompiled: false, publicGraph: true,
      }),
      cutoverStatus({
        releaseState: 'active', activationMode: 'active',
        importCompiled: false, activationCompiled: true, publicGraph: true,
      }),
    )).rejects.toThrow(/PREPUBLICATION_INSPECTION_FAILED|compile mode changed/);
  });

  it('requires the independently exact atlas and module commit pair at handoff', async () => {
    const before = cutoverStatus({
      releaseState: 'ready', activationMode: 'absent',
      importCompiled: true, activationCompiled: false,
    });
    const after = cutoverStatus({
      releaseState: 'ready', activationMode: 'absent',
      importCompiled: false, activationCompiled: true,
    });
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17,
      before,
      after,
      { expectedAtlasSourceCommit: 'e'.repeat(40) },
    )).rejects.toThrowError('GREATER_REALM_PRODUCTION_PUBLISH_ATLAS_RELEASE_MISMATCH');
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17,
      before,
      after,
      { expectedPublicReleaseId: 'GRR-ZZZZZZZZZZZZZZZZZZZZZZZZZZ' },
    )).rejects.toThrowError('GREATER_REALM_PRODUCTION_PUBLISH_ATLAS_RELEASE_MISMATCH');
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17,
      before,
      after,
      { moduleSourceCommit: 'not-a-commit' },
    )).rejects.toThrowError('GREATER_REALM_PRODUCTION_PUBLISH_SOURCE_PROVENANCE_INVALID');
  });

  it('reconciles a lost publisher response only after exact postflight', async () => {
    const result = await executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
      status({ importCompiled: false, activationCompiled: false }),
      status({ importCompiled: true, activationCompiled: false }),
      { publishThrows: true },
    );
    expect(result.receipt.outcome).toBe('verified-after-submission-error');
  });

  it.each([
    [
      'append',
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: false, activationCompiled: false }),
    ],
    [
      'import handoff',
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
      status({ importCompiled: false, activationCompiled: false }),
      status({ importCompiled: true, activationCompiled: false }),
    ],
    [
      'activation handoff',
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17,
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: true, activationCompiled: false,
      }),
      cutoverStatus({
        releaseState: 'ready', activationMode: 'absent',
        importCompiled: false, activationCompiled: true,
      }),
    ],
    [
      'same-schema forward fix',
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17,
      status({ state: 'importing', importCompiled: true, activationCompiled: false }),
      status({ state: 'importing', importCompiled: true, activationCompiled: false }),
    ],
  ] as const)(
    'never mistakes a pre-server %s failure for a successful release',
    async (_class, lane, before, after) => {
      await expect(executeLane(lane, before, after, { publishThrowsBefore: true }))
        .rejects.toMatchObject({
          code: 'GREATER_REALM_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS',
          publishAttempted: true,
        });
    },
  );

  it('never reconciles a same-schema forward-fix submission error from unchanged state', async () => {
    const checkpoint = cutoverStatus({
      releaseState: 'active', activationMode: 'active',
      importCompiled: false, activationCompiled: true, publicGraph: true,
    });
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ACTIVE_V17,
      checkpoint,
      checkpoint,
      { publishThrows: true },
    )).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS',
      publishAttempted: true,
    });
  });

  it.each([
    ['success', false, 'verified'],
    ['submission-error', true, 'verified-after-submission-error'],
  ] as const)(
    'forces a fresh shared session after publish %s and stays within the token budget',
    async (_label, submissionError, outcome) => {
      let published = false;
      let connectionIndex = 0;
      const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
      const disconnects = [vi.fn(), vi.fn()];
      const statusCalls = [vi.fn(), vi.fn()];
      const legacyCalls = [vi.fn(), vi.fn()];
      const connectDatabase = vi.fn(async () => {
        const index = connectionIndex++;
        const rejectStaleConnection = () => {
          if (index === 0 && published) throw new Error('stale pre-publish websocket');
        };
        return {
          isDisconnectRequested: false,
          disconnect: disconnects[index]!,
          procedures: {
            adminGetGreaterRealmStatusV1: statusCalls[index]!.mockImplementation(async () => {
              rejectStaleConnection();
              return status({
                importCompiled: published,
                activationCompiled: false,
              });
            }),
            legacyProbe: legacyCalls[index]!.mockImplementation(async () => {
              rejectStaleConnection();
              return { exact: true };
            }),
          },
          reducers: {},
        };
      });
      const session = createGreaterRealmAdminTransportSession({
        adminSecret: 's'.repeat(32),
        requestToken: requestToken as never,
        connectDatabase: connectDatabase as never,
      });
      const transport = bindGreaterRealmProductionStatusTransport(
        session,
        'admin_get_greater_realm_status_v1',
      );
      const inspectLegacy = vi.fn(async connection => {
        const dynamic = connection as unknown as Readonly<{
          procedures: Readonly<{ legacyProbe: (value: unknown) => Promise<unknown> }>;
        }>;
        for (let index = 0; index < 7; index += 1) {
          await dynamic.procedures.legacyProbe({ index });
        }
        return {
          alpha: {},
          dailyMarks: {},
          accessRequests: { totalRequests: 0n, pendingRequests: 0n },
        };
      });
      const readHistoricalAggregate = () => inspectGreaterRealmLegacyProductionAggregate({
        session,
        expectations: {} as never,
        testOnlyDependencies: {
          inspect: inspectLegacy,
          verify: () => Object.freeze({ exact: 'stable' }),
        },
      });
      const publish = vi.fn(async () => {
        published = true;
        if (submissionError) throw new Error('publisher response lost');
      });
      try {
        const receipt = await executeGreaterRealmProductionPublishLane({
          lane: GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
          flags: approvals(GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17),
          expectedAtlasSourceCommit: ATLAS_SOURCE_COMMIT,
          expectedAtlasId: ATLAS_ID,
          expectedPublicReleaseId: PUBLIC_RELEASE_ID,
          expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
          moduleSourceCommit: MODULE_SOURCE_COMMIT,
          moduleDeltaPolicy: 'import-gate-only',
          artifactReceipt,
          readSchema: async () => ({ generation: 'v17' }),
          readImportStatus: transport.inspect,
          readHistoricalAggregate,
          publish: () => publishGreaterRealmModuleWithFreshPostflight({ session, publish }),
          testOnlyDependencies: fakeDependencies(),
        });
        expect(receipt.outcome).toBe(outcome);
      } finally {
        await session.close();
      }
      expect(publish).toHaveBeenCalledTimes(1);
      expect(requestToken).toHaveBeenCalledTimes(2);
      expect(connectDatabase).toHaveBeenCalledTimes(2);
      expect(statusCalls[0]).toHaveBeenCalledTimes(2);
      expect(statusCalls[1]).toHaveBeenCalledTimes(1);
      expect(legacyCalls[0]).toHaveBeenCalledTimes(7);
      expect(legacyCalls[1]).toHaveBeenCalledTimes(7);
      expect(disconnects[0]).toHaveBeenCalledTimes(1);
      expect(disconnects[1]).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects historical drift, wrong compile mode, and coupled downstream approvals', async () => {
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
      status({ importCompiled: false, activationCompiled: false }),
      status({ importCompiled: true, activationCompiled: false }),
      { afterHistorical: { founders: 101n } },
    )).rejects.toMatchObject({ publishAttempted: true });

    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: true, activationCompiled: false }),
    )).rejects.toThrow(/PUBLISH_OUTCOME_AMBIGUOUS/);

    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: false, activationCompiled: false }),
      { flags: { ...approvals(GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17),
        clientActivationApproved: true } },
    )).rejects.toThrow(/DOWNSTREAM_APPROVAL_MUST_REMAIN_SEPARATE/);
  });

  it('does not call any inspection or publisher under an injected closed envelope', async () => {
    const readSchema = vi.fn();
    const publish = vi.fn();
    await expect(executeGreaterRealmProductionPublishLane({
      lane: GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      expectedAtlasSourceCommit: ATLAS_SOURCE_COMMIT,
      expectedAtlasId: ATLAS_ID,
      expectedPublicReleaseId: PUBLIC_RELEASE_ID,
      expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      moduleDeltaPolicy: 'append-approval-only',
      flags: CLOSED_RELEASE_FLAGS,
      artifactReceipt,
      readSchema,
      readHistoricalAggregate: vi.fn(),
      publish,
    })).rejects.toThrow(/COMPOSITE_APPROVAL_REQUIRED/);
    expect(readSchema).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
