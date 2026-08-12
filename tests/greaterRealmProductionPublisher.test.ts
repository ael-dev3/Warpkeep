// @vitest-environment node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
import {
  authorizeGreaterRealmPublishExactBeforeClear,
  cleanupGreaterRealmPublishSupervisor,
  inspectGreaterRealmPublishSupervisor,
  planGreaterRealmPublishSupervisor,
  publishModule,
  type GreaterRealmPublishSupervisorIdentity,
  type MigrationArtifactReceipt,
} from '../scripts/publish-spacetime-dev.mjs';
import type { GreaterRealmProductionImportStatus } from '../scripts/greater-realm-production-import-core';
import type { GreaterRealmCutoverOperationJournalChain } from '../scripts/greater-realm-cutover-operation-journal';
import { GreaterRealmCutoverWriteNotStartedError } from '../scripts/greater-realm-cutover-write-control';
import { inspectGreaterRealmLegacyProductionAggregate } from '../scripts/greater-realm-production-legacy-aggregate';
import {
  executeGreaterRealmProductionPublisherRecovery,
  greaterRealmProductionPublisherTestSeams,
  parseGreaterRealmProductionPublisherArguments,
  publishGreaterRealmModuleWithFreshPostflight,
} from '../scripts/greater-realm-production-publisher';
import type {
  GreaterRealmImmutableArtifactRetentionRecord,
} from '../scripts/greater-realm-production-immutable-artifact';
import type {
  GreaterRealmProductionCompileMode,
  GreaterRealmProductionCutoverStatus,
} from '../scripts/greater-realm-production-relocation-core';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
} from '../scripts/greater-realm-production-transport';
import { withGreaterRealmCutoverOperatorLock } from '../scripts/greater-realm-cutover-receipts';

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
const canonicalTemporaryDirectory = realpathSync(tmpdir());
const publishSupervisorCrashFixture = resolve(
  import.meta.dirname,
  'fixtures/greaterRealmPublishSupervisorCrashFixture.mjs',
);
const CLOSED_RELEASE_FLAGS = Object.freeze({
  entryAgreementApproved: false,
  additivePublishApproved: false,
  importForwardFixApproved: false,
  activationForwardFixApproved: false,
  clientActivationApproved: false,
  admissionNotificationsApproved: false,
}) satisfies GreaterRealmProductionReleaseFlags;

const RECOVERY_CONFIRMATION_DIGEST = 'f'.repeat(64);
const RECOVERY_GROUP_DIGEST = 'e'.repeat(64);
const RECOVERY_LANE = GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17;
const recoverySourceRelease = Object.freeze({
  atlasSourceCommit: ATLAS_SOURCE_COMMIT,
  moduleSourceCommit: MODULE_SOURCE_COMMIT,
  atlasId: ATLAS_ID,
  publicReleaseId: PUBLIC_RELEASE_ID,
  expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
});
const recoveryRetention = Object.freeze({
  schemaVersion: 1,
  profile: 'warpkeep-greater-realm-immutable-artifact-v1',
  materializationRoot: '/test/materialization',
  artifactPath: artifactReceipt.artifactPath,
  artifactDigest: artifactReceipt.artifactDigest,
  moduleSourceCommit: MODULE_SOURCE_COMMIT,
  moduleTreeId: '9'.repeat(40),
  dependencyClosureDigest: 'a'.repeat(64),
  materializationDev: '1',
  materializationIno: '2',
  artifactDev: '1',
  artifactIno: '3',
  artifactMode: '600',
  artifactUid: '501',
  artifactNlink: '1',
  artifactSize: '4096',
  artifactMtimeNs: '100',
  artifactCtimeNs: '101',
}) satisfies GreaterRealmImmutableArtifactRetentionRecord;
const recoveryBeforeAudit = Object.freeze({
  historicalAggregateDigest: 'b'.repeat(64),
  artifactDigest: artifactReceipt.artifactDigest,
  v11TableSchemaDigest: artifactReceipt.v11TableSchemaDigest,
  v12TableSchemaDigest: artifactReceipt.v12TableSchemaDigest,
  v13TableSchemaDigest: artifactReceipt.v13TableSchemaDigest,
  v14TableSchemaDigest: artifactReceipt.v14TableSchemaDigest,
  v15TableSchemaDigest: artifactReceipt.v15TableSchemaDigest,
  v16TableSchemaDigest: artifactReceipt.v16TableSchemaDigest,
  v17TableSchemaDigest: artifactReceipt.v17TableSchemaDigest,
});
const recoveryBeforeStatus = Object.freeze({ phase: 'before' });

function recoverySupervisorIdentity(ordinal = 1): GreaterRealmPublishSupervisorIdentity {
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-greater-realm-publish-supervisor-v1',
    supervisorId: String(ordinal).padStart(32, '0'),
    supervisorDirectory: `/test/supervisor-${ordinal}`,
  });
}

function recoveryOperation(
  supervisorIdentity = recoverySupervisorIdentity(),
  receipt: MigrationArtifactReceipt = artifactReceipt,
) {
  return Object.freeze({
    kind: 'publish',
    name: RECOVERY_LANE,
    identity: Object.freeze({
      lane: RECOVERY_LANE,
      moduleDeltaPolicy: greaterRealmProductionModuleDeltaPolicy(RECOVERY_LANE),
      artifactDigest: receipt.artifactDigest,
      v14TableSchemaDigest: receipt.v14TableSchemaDigest,
      v17TableSchemaDigest: receipt.v17TableSchemaDigest,
      artifactReceipt: receipt,
      publishExecutableIdentity: Object.freeze({
        path: '/test/spacetime-snapshot',
        digest: 'c'.repeat(64),
      }),
      publishSupervisorIdentity: supervisorIdentity,
    }),
  });
}

function recoveryRecord(
  operation = recoveryOperation(),
  beforeAudit: Readonly<Record<string, unknown>> = recoveryBeforeAudit,
) {
  return Object.freeze({
    command: Object.freeze({ kind: 'publish', name: RECOVERY_LANE }),
    operation,
    sourceRelease: recoverySourceRelease,
    beforeStatus: recoveryBeforeStatus,
    beforeAudit,
  });
}

function recoveryInspection(
  recoveryMode: 'journal' | 'command-receipt' | 'lock-only' = 'journal',
) {
  return Object.freeze({
    recoveryMode,
    recoveryEligible: true,
    recoveryOwnerState: 'none',
    recoveryOwnerExpiresAtMs: null,
    confirmationDigest: RECOVERY_CONFIRMATION_DIGEST,
    plan: recoveryMode === 'lock-only' ? null : Object.freeze({
      groupDigest: RECOVERY_GROUP_DIGEST,
      command: Object.freeze({ kind: 'publish', name: RECOVERY_LANE }),
      operationReceiptChainDigest: 'd'.repeat(64),
      operationReceiptCount: 1,
    }),
  });
}

function recoveryResult(outcome = 'recovered') {
  return Object.freeze({
    lock: Object.freeze({ lockId: 'test-lock' }),
    recovery: Object.freeze({
      outcome,
      groupDigest: RECOVERY_GROUP_DIGEST,
      operationReceiptChainDigest: 'd'.repeat(64),
      operationReceiptCount: 1,
      commandReceiptDigest: 'a'.repeat(64),
    }),
  });
}

function recoveryHarness(overrides: Readonly<Record<string, unknown>> = {}) {
  const executableCleanup = vi.fn();
  const session = Object.freeze({
    close: vi.fn(async () => undefined),
    invalidate: vi.fn(async () => undefined),
    prepareSubmission: vi.fn(async () => undefined),
  });
  const inspectRecovery = vi.fn(() => recoveryInspection());
  const inspectProvenance = vi.fn(() => ({
    workspace: {},
    artifacts: {},
    ...recoverySourceRelease,
  }));
  const readExpectations = vi.fn(() => Object.freeze({
    expectedFounderCount: 1,
    expectedEnabledAllowedFidCount: 1,
    expectedPlayerCount: 1,
    expectedTermsAcceptanceCount: 1,
  }));
  const attestCli = vi.fn(() => Object.freeze({
    path: '/test/spacetime-snapshot',
    digest: 'c'.repeat(64),
    cleanup: executableCleanup,
  }));
  const createSession = vi.fn(() => session);
  const inspectSnapshot = vi.fn(async () => Object.freeze({
    status: recoveryBeforeStatus,
    audit: recoveryBeforeAudit,
  }));
  const inspectSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => ({
    identity,
    status: Object.freeze({ state: 'pre-gate-zero-write' }),
    processGroupExists: false,
    incompleteInstallZeroWrite: false,
    temporaries: Object.freeze([]),
    phases: Object.freeze([]),
    cliAuthority: Object.freeze({
      cliConfigPath: '/test/cli.toml',
      cliRootDirectory: '/test/cli-root',
      staged: true,
    }),
  }));
  const cleanupSupervisor = vi.fn();
  const cleanupArtifact = vi.fn();
  const attestArtifact = vi.fn();
  const planSupervisor = vi.fn(() => Object.freeze({
    identity: recoverySupervisorIdentity(99),
    allocate: vi.fn(),
    start: vi.fn(),
    release: vi.fn(),
    cleanup: vi.fn(),
    executionState: vi.fn(() => Object.freeze({})),
  }));
  const dependencies = {
    inspectRecovery,
    inspectProvenance,
    readExpectations,
    attestCli,
    createSession,
    inspectSnapshot,
    inspectSupervisor,
    cleanupSupervisor,
    cleanupArtifact,
    attestArtifact,
    planSupervisor,
    ...overrides,
  };
  return Object.freeze({
    dependencies,
    executableCleanup,
    session,
    inspectRecovery,
    inspectProvenance,
    readExpectations,
    attestCli,
    createSession,
    inspectSnapshot,
    inspectSupervisor,
    cleanupSupervisor,
    cleanupArtifact,
    attestArtifact,
    planSupervisor,
  });
}

function executeRecoveryWithHarness(
  harness: ReturnType<typeof recoveryHarness>,
  input: Readonly<Record<string, unknown>> = {},
) {
  return executeGreaterRealmProductionPublisherRecovery({
    command: 'recover',
    confirmed: true,
    recoveryConfirmationDigest: RECOVERY_CONFIRMATION_DIGEST,
    adminSecret: 's'.repeat(32),
    spacetimeCliConfigPath: '/test/source-cli.toml',
    executable: '/test/spacetime',
    environment: {},
    attestProtectedMain: () => MODULE_SOURCE_COMMIT,
    ...input,
    testOnlyDependencies: harness.dependencies as never,
  });
}

async function startPublishSupervisorCrashFixture(
  mode: string,
  supervisorRoot: string,
) {
  const child = spawn(process.execPath, [
    publishSupervisorCrashFixture,
    mode,
    supervisorRoot,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const identity = await new Promise<GreaterRealmPublishSupervisorIdentity>(
    (resolvePromise, rejectPromise) => {
      let output = '';
      const timeout = setTimeout(() => {
        rejectPromise(new Error('publish supervisor fixture timed out'));
      }, 10_000);
      child.once('error', error => {
        clearTimeout(timeout);
        rejectPromise(error);
      });
      child.stdout!.on('data', chunk => {
        output += chunk.toString('utf8');
        const newline = output.indexOf('\n');
        if (newline < 0) return;
        clearTimeout(timeout);
        try {
          resolvePromise(JSON.parse(output.slice(0, newline)));
        } catch (error) {
          rejectPromise(error);
        }
      });
    },
  );
  return Object.freeze({ child, identity });
}

async function waitForPublishSupervisor(
  identity: GreaterRealmPublishSupervisorIdentity,
  predicate: (inspection: ReturnType<typeof inspectGreaterRealmPublishSupervisor>) => boolean,
) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const inspection = inspectGreaterRealmPublishSupervisor(identity);
      if (predicate(inspection)) return inspection;
    } catch { /* An append-only phase may be between temp and final links. */ }
    if (Date.now() >= deadline) throw new Error('publish supervisor state timed out');
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
  }
}

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
    assertCanStartWrite?: () => void;
    onPublish?: () => void;
    publishError?: unknown;
    operationJournal?: GreaterRealmCutoverOperationJournalChain;
    operationJournalLifecycle?: Readonly<{ prepared: () => void; settled: () => void }>;
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
    options.onPublish?.();
    if (options.publishError !== undefined) throw options.publishError;
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
    assertCanStartWrite: options.assertCanStartWrite ?? (() => undefined),
    publish,
    operationJournal: options.operationJournal,
    operationJournalLifecycle: options.operationJournalLifecycle,
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
    expect(parseGreaterRealmProductionPublisherArguments(['recover-inspect'])).toEqual({
      command: 'recover-inspect',
      confirmed: false,
    });
    expect(parseGreaterRealmProductionPublisherArguments([
      'recover',
      `--confirm-recovery=${'a'.repeat(64)}`,
    ])).toEqual({
      command: 'recover',
      confirmed: true,
      recoveryConfirmationDigest: 'a'.repeat(64),
    });
    for (const arguments_ of [
      ['recover'],
      ['recover-inspect', '--confirm'],
      ['recover', `--confirm-recovery=${'A'.repeat(64)}`],
      ['recover', `--confirm-recovery=${'a'.repeat(63)}`],
    ]) expect(() => parseGreaterRealmProductionPublisherArguments(arguments_)).toThrow(/USAGE/);
  });

  it('validates the normal publish CLI authority before opening the administrator secret', () => {
    const events: string[] = [];
    const supervisor = Object.freeze({ identity: recoverySupervisorIdentity(77) });
    const planSupervisor = vi.fn(() => {
      events.push('config-validated');
      return supervisor as never;
    });
    const readAdminSecretFile = vi.fn(() => {
      events.push('secret-opened');
      return 's'.repeat(32);
    });
    expect(greaterRealmProductionPublisherTestSeams
      .prepareGreaterRealmPublisherLocalAuthorities({
        supervisorRoot: '/test/supervisors',
        spacetimeCliConfigPath: '/test/cli.toml',
        adminSecretPath: '/test/admin-secret',
        planSupervisor,
        readAdminSecretFile,
      })).toMatchObject({ supervisor, adminSecret: 's'.repeat(32) });
    expect(events).toEqual(['config-validated', 'secret-opened']);

    const rejectConfig = vi.fn(() => { throw new Error('invalid cli config'); });
    expect(() => greaterRealmProductionPublisherTestSeams
      .prepareGreaterRealmPublisherLocalAuthorities({
        supervisorRoot: '/test/supervisors',
        spacetimeCliConfigPath: '/test/invalid-cli.toml',
        adminSecretPath: '/test/admin-secret',
        planSupervisor: rejectConfig,
        readAdminSecretFile,
      })).toThrow(/invalid cli config/);
    expect(readAdminSecretFile).toHaveBeenCalledTimes(1);
  });

  it('validates and later retires the reusable recovery plan before opening a session', async () => {
    const events: string[] = [];
    const plannedIdentity = recoverySupervisorIdentity(99);
    const planSupervisor = vi.fn(() => {
      events.push('config-validated');
      return Object.freeze({ identity: plannedIdentity });
    });
    const createSession = vi.fn(() => {
      events.push('secret-session-opened');
      return Object.freeze({
        close: vi.fn(async () => undefined),
        invalidate: vi.fn(async () => undefined),
        prepareSubmission: vi.fn(async () => undefined),
      });
    });
    const cleanupSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => {
      events.push(`cleaned-${identity.supervisorId}`);
    });
    const recoverJournal = vi.fn(async callbacks => {
      await callbacks.prepareRecovery?.();
      return recoveryResult('reconciled-without-resume');
    });
    const harness = recoveryHarness({
      planSupervisor,
      createSession,
      cleanupSupervisor,
      recoverJournal,
    });
    await executeRecoveryWithHarness(harness);
    expect(events).toEqual([
      'config-validated',
      'secret-session-opened',
      `cleaned-${plannedIdentity.supervisorId}`,
    ]);
  });

  it('keeps recovery inspection and terminal local cleanup credential- and network-free', async () => {
    const localRecoverJournal = vi.fn(async () => recoveryResult('cleaned-command-receipt'));
    const inspectOnly = recoveryHarness({
      inspectRecovery: vi.fn(() => recoveryInspection('journal')),
      recoverJournal: localRecoverJournal,
    });
    await expect(executeGreaterRealmProductionPublisherRecovery({
      command: 'recover-inspect',
      confirmed: false,
      environment: {},
      testOnlyDependencies: inspectOnly.dependencies as never,
    })).resolves.toMatchObject({
      command: 'recover-inspect',
      recoveryMode: 'journal',
      networkMode: 'read-only-local',
    });
    expect(inspectOnly.inspectProvenance).not.toHaveBeenCalled();
    expect(inspectOnly.attestCli).not.toHaveBeenCalled();
    expect(inspectOnly.createSession).not.toHaveBeenCalled();
    expect(localRecoverJournal).not.toHaveBeenCalled();

    const localCleanup = recoveryHarness({
      inspectRecovery: vi.fn(() => recoveryInspection('command-receipt')),
      recoverJournal: localRecoverJournal,
    });
    await expect(executeGreaterRealmProductionPublisherRecovery({
      command: 'recover',
      confirmed: true,
      recoveryConfirmationDigest: RECOVERY_CONFIRMATION_DIGEST,
      environment: {},
      testOnlyDependencies: localCleanup.dependencies as never,
    })).resolves.toMatchObject({
      command: 'recover',
      recoveryMode: 'command-receipt',
      networkMode: 'none',
    });
    expect(localCleanup.inspectProvenance).not.toHaveBeenCalled();
    expect(localCleanup.attestCli).not.toHaveBeenCalled();
    expect(localCleanup.createSession).not.toHaveBeenCalled();
    expect(localRecoverJournal).toHaveBeenCalledTimes(1);
  });

  it('cleans definitive-zero supervisor authority before recovery can remove its WAL', async () => {
    const events: string[] = [];
    const inspectSnapshot = vi.fn(async () => {
      events.push('remote-inspect');
      return Object.freeze({ status: recoveryBeforeStatus, audit: recoveryBeforeAudit });
    });
    const inspectSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => {
      events.push('supervisor-inspect');
      return {
        identity,
        status: Object.freeze({ state: 'pre-gate-waiting' }),
        processGroupExists: false,
        incompleteInstallZeroWrite: false,
        temporaries: Object.freeze([]),
        phases: Object.freeze([]),
        cliAuthority: Object.freeze({
          cliConfigPath: '/test/cli.toml',
          cliRootDirectory: '/test/cli-root',
          staged: true,
        }),
      };
    });
    const cleanupSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => {
      events.push(identity.supervisorId === recoverySupervisorIdentity().supervisorId
        ? 'operation-supervisor-cleanup'
        : 'unused-plan-cleanup');
    });
    const recoverJournal = vi.fn(async callbacks => {
      await callbacks.prepareRecovery?.();
      callbacks.revalidateArtifact?.(recoveryRetention);
      const record = recoveryRecord();
      await callbacks.inspect(record);
      const classification = await callbacks.classifyPublishRecovery?.({
        record,
        inspectAfter: {},
        directory: '/test/receipts',
      });
      expect(classification).toBe('definitive-zero');
      events.push('wal-remove');
      return recoveryResult('resumed');
    });
    const harness = recoveryHarness({
      inspectSnapshot,
      inspectSupervisor,
      cleanupSupervisor,
      recoverJournal,
    });
    await executeRecoveryWithHarness(harness);
    expect(events).toEqual([
      'remote-inspect',
      'supervisor-inspect',
      'operation-supervisor-cleanup',
      'wal-remove',
      'unused-plan-cleanup',
    ]);
  });

  it('classifies consumed gates for exact-after reconciliation but retains exact-before', async () => {
    for (const observed of ['after', 'before'] as const) {
      const inspectSnapshot = vi.fn(async () => Object.freeze({
        status: observed === 'after' ? Object.freeze({ phase: 'after' }) : recoveryBeforeStatus,
        audit: recoveryBeforeAudit,
      }));
      const cleanupSupervisor = vi.fn();
      const inspectSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => ({
        identity,
        status: Object.freeze({ state: 'gate-consumed' }),
        processGroupExists: false,
        incompleteInstallZeroWrite: false,
        temporaries: Object.freeze([{ linked: true }]),
        phases: Object.freeze([]),
        cliAuthority: Object.freeze({
          cliConfigPath: '/test/cli.toml',
          cliRootDirectory: '/test/cli-root',
          staged: true,
        }),
      }));
      const recoverJournal = vi.fn(async callbacks => {
        callbacks.revalidateArtifact?.(recoveryRetention);
        const record = recoveryRecord();
        const snapshot = await callbacks.inspect(record);
        const classification = await callbacks.classifyPublishRecovery?.({
          record,
          inspectAfter: snapshot,
          directory: '/test/receipts',
        });
        expect(classification).toBe('gate-consumed');
        if (snapshot.status === recoveryBeforeStatus) {
          throw new Error('GREATER_REALM_CUTOVER_PUBLISH_SURVIVOR_PROOF_REQUIRED');
        }
        return recoveryResult('reconciled');
      });
      const harness = recoveryHarness({
        inspectSnapshot,
        inspectSupervisor,
        cleanupSupervisor,
        recoverJournal,
      });
      const result = executeRecoveryWithHarness(harness);
      if (observed === 'after') {
        await expect(result).resolves.toMatchObject({ outcome: 'reconciled' });
      } else {
        await expect(result).rejects.toThrow(/PUBLISH_SURVIVOR_PROOF_REQUIRED/);
      }
      expect(cleanupSupervisor).toHaveBeenCalledTimes(1);
      expect(cleanupSupervisor).toHaveBeenCalledWith(recoverySupervisorIdentity(99));
      expect(cleanupSupervisor).not.toHaveBeenCalledWith(recoverySupervisorIdentity());
    }
  });

  it('uses the durable cleanup-tail context to remove every completed supervisor first', async () => {
    const first = recoverySupervisorIdentity(1);
    const second = recoverySupervisorIdentity(2);
    const events: string[] = [];
    const cleanupSupervisor = vi.fn((identity: GreaterRealmPublishSupervisorIdentity) => {
      events.push(`supervisor-${identity.supervisorId}`);
    });
    const cleanupArtifact = vi.fn(() => { events.push('artifact'); });
    const recoverJournal = vi.fn(async callbacks => {
      callbacks.revalidateArtifact?.(recoveryRetention);
      callbacks.cleanupArtifact?.(recoveryRetention, Object.freeze({
        groupDigest: RECOVERY_GROUP_DIGEST,
        command: Object.freeze({ kind: 'publish', name: RECOVERY_LANE }),
        sourceRelease: recoverySourceRelease,
        operations: Object.freeze([
          Object.freeze({
            operationOrdinal: 1,
            planDigest: '1'.repeat(64),
            operation: recoveryOperation(first),
          }),
          Object.freeze({
            operationOrdinal: 2,
            planDigest: '2'.repeat(64),
            operation: recoveryOperation(second),
          }),
        ]),
      }));
      return recoveryResult('cleaned-tail');
    });
    const harness = recoveryHarness({ cleanupSupervisor, cleanupArtifact, recoverJournal });
    await executeRecoveryWithHarness(harness);
    expect(events).toEqual([
      `supervisor-${first.supervisorId}`,
      `supervisor-${second.supervisorId}`,
      'artifact',
      `supervisor-${recoverySupervisorIdentity(99).supervisorId}`,
    ]);
  });

  it('rejects artifact identity, audit, and retention disagreement before remote inspection', async () => {
    const badReceipt = Object.freeze({
      ...artifactReceipt,
      artifactDigest: '0'.repeat(64),
    });
    const cases = [
      Object.freeze({
        retention: recoveryRetention,
        record: recoveryRecord(recoveryOperation(recoverySupervisorIdentity(), badReceipt)),
      }),
      Object.freeze({
        retention: recoveryRetention,
        record: recoveryRecord(recoveryOperation(), Object.freeze({
          ...recoveryBeforeAudit,
          v17TableSchemaDigest: '0'.repeat(64),
        })),
      }),
      Object.freeze({
        retention: Object.freeze({ ...recoveryRetention, artifactDigest: '0'.repeat(64) }),
        record: recoveryRecord(),
      }),
    ];
    for (const testCase of cases) {
      const recoverJournal = vi.fn(async callbacks => {
        callbacks.revalidateArtifact?.(testCase.retention);
        await callbacks.inspect(testCase.record);
        return recoveryResult();
      });
      const harness = recoveryHarness({ recoverJournal });
      await expect(executeRecoveryWithHarness(harness)).rejects.toThrow(
        /GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID/,
      );
      expect(harness.inspectSnapshot).not.toHaveBeenCalled();
      expect(harness.executableCleanup).toHaveBeenCalledTimes(1);
    }
  });

  it('reattests protected main immediately before a resumed gate and publishes zero bytes on advance', async () => {
    const release = vi.fn();
    const publishModuleForRecovery = vi.fn(async (...arguments_: unknown[]) => {
      await (arguments_[6] as () => Promise<void>)();
      release();
    });
    const executePublishLane = vi.fn(async (options: Readonly<Record<string, unknown>>) => {
      await (options.publish as (permit: () => void) => Promise<void>)(() => undefined);
      return Object.freeze({ kind: 'greater-realm-production-publish-v1' });
    });
    const recoverJournal = vi.fn(async callbacks => {
      callbacks.revalidateArtifact?.(recoveryRetention);
      const commandRecord = Object.freeze({
        command: Object.freeze({ kind: 'publish', name: RECOVERY_LANE }),
        sourceRelease: recoverySourceRelease,
        beforeStatus: recoveryBeforeStatus,
        beforeAudit: recoveryBeforeAudit,
        operationReceiptCount: 0,
      });
      await callbacks.inspectCommand?.(commandRecord);
      await callbacks.resumeCommand?.(Object.freeze({
        command: commandRecord.command,
        sourceRelease: recoverySourceRelease,
        assertCanStartWrite: () => undefined,
        operationJournal: {},
      }));
      return recoveryResult();
    });
    const harness = recoveryHarness({
      recoverJournal,
      executePublishLane,
      publishModule: publishModuleForRecovery,
    });
    await expect(executeRecoveryWithHarness(harness, {
      attestProtectedMain: () => '0'.repeat(40),
    })).rejects.toThrow(/GREATER_REALM_PRODUCTION_MODULE_SOURCE_ADVANCED/);
    expect(release).not.toHaveBeenCalled();
    expect(harness.session.prepareSubmission).not.toHaveBeenCalled();
    expect(harness.executableCleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans an unbound recovery executable but retains one bound by an incomplete operation', async () => {
    const prebind = recoveryHarness({
      recoverJournal: vi.fn(async () => { throw new Error('pre-bind inspection failed'); }),
    });
    await expect(executeRecoveryWithHarness(prebind)).rejects.toThrow(/pre-bind/);
    expect(prebind.executableCleanup).toHaveBeenCalledTimes(1);

    const executePublishLane = vi.fn(async (options: Readonly<Record<string, unknown>>) => {
      const lifecycle = options.operationJournalLifecycle as Readonly<{ prepared: () => void }>;
      lifecycle.prepared();
      throw new Error('after durable operation prepare');
    });
    const recoverJournal = vi.fn(async callbacks => {
      callbacks.revalidateArtifact?.(recoveryRetention);
      const commandRecord = Object.freeze({
        command: Object.freeze({ kind: 'publish', name: RECOVERY_LANE }),
        sourceRelease: recoverySourceRelease,
        beforeStatus: recoveryBeforeStatus,
        beforeAudit: recoveryBeforeAudit,
        operationReceiptCount: 0,
      });
      await callbacks.inspectCommand?.(commandRecord);
      await callbacks.resumeCommand?.(Object.freeze({
        command: commandRecord.command,
        sourceRelease: recoverySourceRelease,
        assertCanStartWrite: () => undefined,
        operationJournal: {},
      }));
      return recoveryResult();
    });
    const bound = recoveryHarness({ recoverJournal, executePublishLane });
    await expect(executeRecoveryWithHarness(bound)).rejects.toThrow(/durable operation prepare/);
    expect(bound.executableCleanup).not.toHaveBeenCalled();
  });

  it('retains a recovery executable identity when rejected-permit abandonment is incomplete', async () => {
    const rejected = new GreaterRealmCutoverWriteNotStartedError('TEST_WRITE_NOT_STARTED');
    const prepared = vi.fn();
    const settled = vi.fn();
    const abandonAfterRejectedPermit = vi.fn(async () => false);
    const operationJournal = {
      bindCommandPlan: vi.fn(),
      prepare: vi.fn(async () => Object.freeze({
        planDigest: 'a'.repeat(64),
        writePermit: (() => undefined),
        markManualAmbiguity: vi.fn(),
        reconcile: vi.fn(),
        abandonAfterRejectedPermit,
      })),
      reconcileCommand: vi.fn(),
      prepareCommandReceipt: vi.fn(),
      completeCommandReceipt: vi.fn(),
      summary: vi.fn(() => Object.freeze({
        operationReceiptChainDigest: 'b'.repeat(64),
        operationReceiptCount: 0,
      })),
      authority: vi.fn(),
      retainsArtifact: vi.fn(() => true),
    } as unknown as GreaterRealmCutoverOperationJournalChain;
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17,
      undefined,
      status({ importCompiled: false, activationCompiled: false }),
      {
        publishError: rejected,
        operationJournal,
        operationJournalLifecycle: { prepared, settled },
      },
    )).rejects.toBe(rejected);
    expect(abandonAfterRejectedPermit).toHaveBeenCalledTimes(1);
    expect(prepared).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    expect(operationJournal.prepare).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ artifactReceipt }),
    }));
  });

  it('records parent SIGKILL before the publish gate as exact zero-write authority', async () => {
    const parent = mkdtempSync(join(canonicalTemporaryDirectory, 'wkgr-publish-supervisor-pre-'));
    const supervisorRoot = join(parent, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
    try {
      fixture = await startPublishSupervisorCrashFixture('pre-gate', supervisorRoot);
      fixture.child.kill('SIGKILL');
      await new Promise<void>(resolvePromise => fixture!.child.once('close', () => resolvePromise()));
      const inspection = await waitForPublishSupervisor(
        fixture.identity,
        value => value.status.state === 'pre-gate-zero-write'
          && value.processGroupExists === false,
      );
      expect(inspection.status).toMatchObject({
        state: 'pre-gate-zero-write',
        pid: expect.any(Number),
        processStartIdentity: expect.any(String),
      });
      expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(true);
      cleanupGreaterRealmPublishSupervisor(fixture.identity);
    } finally {
      if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
        fixture.child.kill('SIGKILL');
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('cleans a waiting supervisor before propagating a write-not-started rejection', async () => {
    const parent = mkdtempSync(join(canonicalTemporaryDirectory, 'wkgr-publish-rejected-'));
    const supervisorRoot = join(parent, 'supervisors');
    const artifactPath = join(parent, 'bundle.js');
    const cliConfigPath = join(parent, 'cli.toml');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    const artifact = Buffer.from('test-only-greater-realm-bundle', 'utf8');
    writeFileSync(artifactPath, artifact, { mode: 0o600 });
    writeFileSync(cliConfigPath, 'spacetimedb_token = "test-only-token"\n', { mode: 0o600 });
    const plan = planGreaterRealmPublishSupervisor(supervisorRoot, cliConfigPath);
    const rejected = new GreaterRealmCutoverWriteNotStartedError('TEST_MARKER_REJECTED');
    const permit = Object.assign(() => undefined, {
      markSubmissionUncertain: async () => { throw rejected; },
    });
    try {
      await expect(publishModule(
        '/usr/bin/false',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
        Object.freeze({
          ...artifactReceipt,
          artifactPath,
          artifactDigest: createHash('sha256').update(artifact).digest('hex'),
        }),
        undefined,
        permit,
        artifactPath,
        async () => undefined,
        plan,
      )).rejects.toBe(rejected);
      expect(inspectGreaterRealmPublishSupervisor(plan.identity)).toMatchObject({
        status: { state: 'not-allocated' },
        processGroupExists: false,
      });
    } finally {
      await plan.cleanup();
      artifact.fill(0);
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('retains post-gate SIGKILL as manual ambiguity even after its group exits', async () => {
    const parent = mkdtempSync(join(canonicalTemporaryDirectory, 'wkgr-publish-supervisor-post-'));
    const supervisorRoot = join(parent, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
    let pgid: number | undefined;
    try {
      fixture = await startPublishSupervisorCrashFixture('post-gate', supervisorRoot);
      fixture.child.kill('SIGKILL');
      await new Promise<void>(resolvePromise => fixture!.child.once('close', () => resolvePromise()));
      const live = await waitForPublishSupervisor(
        fixture.identity,
        value => value.status.state === 'gate-consumed' && value.processGroupExists,
      );
      pgid = live.status.pgid as number;
      expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(false);
      process.kill(-pgid, 'SIGKILL');
      await waitForPublishSupervisor(fixture.identity, value => !value.processGroupExists);
      expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(false);
      cleanupGreaterRealmPublishSupervisor(fixture.identity);
      pgid = undefined;
    } finally {
      if (pgid !== undefined) {
        try { process.kill(-pgid, 'SIGKILL'); } catch { /* Already contained. */ }
      }
      if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
        fixture.child.kill('SIGKILL');
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('classifies direct supervisor death while waiting as exact zero-write authority', async () => {
    const parent = mkdtempSync(join(canonicalTemporaryDirectory, 'wkgr-publish-supervisor-waiting-'));
    const supervisorRoot = join(parent, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
    let pgid: number | undefined;
    try {
      fixture = await startPublishSupervisorCrashFixture('direct-waiting', supervisorRoot);
      const waiting = await waitForPublishSupervisor(
        fixture.identity,
        value => value.status.state === 'pre-gate-waiting' && value.processGroupExists,
      );
      pgid = waiting.status.pgid as number;
      process.kill(-pgid, 'SIGKILL');
      await waitForPublishSupervisor(fixture.identity, value => !value.processGroupExists);
      expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(true);
      cleanupGreaterRealmPublishSupervisor(fixture.identity);
      pgid = undefined;
    } finally {
      if (pgid !== undefined) {
        try { process.kill(-pgid, 'SIGKILL'); } catch { /* Already contained. */ }
      }
      if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
        fixture.child.kill('SIGKILL');
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('classifies a crash after durable spawn authorization but before spawn as zero-write', async () => {
    const parent = mkdtempSync(join(
      canonicalTemporaryDirectory,
      'wkgr-publish-supervisor-authorized-',
    ));
    const supervisorRoot = join(parent, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
    try {
      fixture = await startPublishSupervisorCrashFixture('spawn-authorized', supervisorRoot);
      if (fixture.child.exitCode === null && fixture.child.signalCode === null) {
        await new Promise<void>(resolvePromise => fixture!.child.once('close', () => resolvePromise()));
      }
      expect(inspectGreaterRealmPublishSupervisor(fixture.identity)).toMatchObject({
        status: { state: 'spawn-authorized' },
        processGroupExists: false,
      });
      expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(true);
      cleanupGreaterRealmPublishSupervisor(fixture.identity);
    } finally {
      if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
        fixture.child.kill('SIGKILL');
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('recovers every atomic gate-consumed phase publication crash boundary exactly', async () => {
    for (const boundary of ['temporary-created', 'linked', 'post-unlink'] as const) {
      const parent = mkdtempSync(join(
        canonicalTemporaryDirectory,
        `wkgr-publish-supervisor-${boundary}-`,
      ));
      const supervisorRoot = join(parent, 'supervisors');
      mkdirSync(supervisorRoot, { mode: 0o700 });
      let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
      try {
        fixture = await startPublishSupervisorCrashFixture(
          `gate-consumed-${boundary}`,
          supervisorRoot,
        );
        await new Promise<void>(resolvePromise => fixture!.child.once('close', () => resolvePromise()));
        const inspection = await waitForPublishSupervisor(
          fixture.identity,
          value => value.processGroupExists === false,
        );
        if (boundary === 'post-unlink' || boundary === 'linked') {
          expect(inspection.status.state).toBe('gate-consumed');
          expect(inspection.temporaries).toHaveLength(boundary === 'linked' ? 1 : 0);
          expect(inspection.incompleteInstallZeroWrite).toBe(false);
          expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(false);
        } else {
          expect(inspection.temporaries).toHaveLength(1);
          expect(inspection.incompleteInstallZeroWrite).toBe(true);
          expect(authorizeGreaterRealmPublishExactBeforeClear(fixture.identity)).toBe(true);
        }
        cleanupGreaterRealmPublishSupervisor(fixture.identity);
      } finally {
        if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
          fixture.child.kill('SIGKILL');
        }
        rmSync(parent, { recursive: true, force: true });
      }
    }
  });

  it('classifies an empty allocated supervisor directory as zero-before-spawn', () => {
    const parent = mkdtempSync(join(canonicalTemporaryDirectory, 'wkgr-publish-supervisor-empty-'));
    const supervisorRoot = join(parent, 'supervisors');
    const cliConfigPath = join(parent, 'cli.toml');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    writeFileSync(cliConfigPath, 'spacetimedb_token = "test-only-token"\n', { mode: 0o600 });
    const plan = planGreaterRealmPublishSupervisor(supervisorRoot, cliConfigPath);
    try {
      mkdirSync(plan.identity.supervisorDirectory, { mode: 0o700 });
      expect(inspectGreaterRealmPublishSupervisor(plan.identity)).toMatchObject({
        status: { state: 'phase-install-incomplete' },
        processGroupExists: false,
        incompleteInstallZeroWrite: true,
      });
      expect(authorizeGreaterRealmPublishExactBeforeClear(plan.identity)).toBe(true);
      cleanupGreaterRealmPublishSupervisor(plan.identity);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('resumes cleanup after each durable Maincloud config deletion suffix', async () => {
    for (const suffix of [
      'config-removed',
      'root-removed',
      'prior-phases-removed',
    ] as const) {
      const parent = mkdtempSync(join(
        canonicalTemporaryDirectory,
        `wkgr-publish-supervisor-cleanup-${suffix}-`,
      ));
      const supervisorRoot = join(parent, 'supervisors');
      mkdirSync(supervisorRoot, { mode: 0o700 });
      let fixture: Awaited<ReturnType<typeof startPublishSupervisorCrashFixture>> | undefined;
      let pgid: number | undefined;
      try {
        fixture = await startPublishSupervisorCrashFixture('direct-waiting', supervisorRoot);
        const waiting = await waitForPublishSupervisor(
          fixture.identity,
          value => value.status.state === 'pre-gate-waiting' && value.processGroupExists,
        );
        pgid = waiting.status.pgid as number;
        process.kill(-pgid, 'SIGKILL');
        const contained = await waitForPublishSupervisor(
          fixture.identity,
          value => !value.processGroupExists,
        );
        expect(() => cleanupGreaterRealmPublishSupervisor(fixture!.identity, suffix))
          .toThrow(/TEST_CLEANUP_INTERRUPTED/);
        expect(inspectGreaterRealmPublishSupervisor(fixture.identity).cliAuthority)
          .toMatchObject({ staged: false });
        cleanupGreaterRealmPublishSupervisor(fixture.identity);
        pgid = undefined;
      } finally {
        if (pgid !== undefined) {
          try { process.kill(-pgid, 'SIGKILL'); } catch { /* Already contained. */ }
        }
        if (fixture?.child.exitCode === null && fixture.child.signalCode === null) {
          fixture.child.kill('SIGKILL');
        }
        rmSync(parent, { recursive: true, force: true });
      }
    }
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

  it('does not publish when the write permit closes after final preflight', async () => {
    const onPublish = vi.fn();
    await expect(executeLane(
      GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17,
      status({ importCompiled: false, activationCompiled: false }),
      status({ importCompiled: true, activationCompiled: false }),
      {
        assertCanStartWrite: () => {
          throw new Error('GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGTERM');
        },
        onPublish,
      },
    )).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGTERM/);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('contains a signal during publisher credential preparation before child spawn', async () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), 'warpkeep-gr-publisher-signal-'),
    );
    chmodSync(directory, 0o700);
    const publish = vi.fn(async () => undefined);
    const invalidate = vi.fn(async () => undefined);
    const prepareSubmission = vi.fn(async () => { process.emit('SIGINT'); });
    const session = {
      prepareSubmission,
      invalidate,
    } as never;
    try {
      await expect(withGreaterRealmCutoverOperatorLock({
        directory,
        repositoryRoot: process.cwd(),
        operation: control => publishGreaterRealmModuleWithFreshPostflight({
          session,
          publish: async () => {
            await prepareSubmission();
            await new Promise<void>(resolveTick => setImmediate(resolveTick));
            control.assertCanStartWrite();
            await publish();
          },
        }),
      })).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGINT/);
      expect(publish).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
        tokenBudget: Object.freeze({
          reserve: async (slots: number) => Object.freeze({
            reservationId: 'a'.repeat(32),
            remaining: slots,
          }),
          ensure: async (reservationId: string, minimumRemaining: number) => Object.freeze({
            reservationId,
            remaining: minimumRemaining,
          }),
          release: async (reservationId: string) => Object.freeze({
            reservationId,
            released: 0,
          }),
        }),
        readTrustedTime: async () => Date.now(),
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
          assertCanStartWrite: () => undefined,
          publish: () => publishGreaterRealmModuleWithFreshPostflight({
            session,
            publish,
          }),
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
      assertCanStartWrite: () => undefined,
      publish,
    })).rejects.toThrow(/COMPOSITE_APPROVAL_REQUIRED/);
    expect(readSchema).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
