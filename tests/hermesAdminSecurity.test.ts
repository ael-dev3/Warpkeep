import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGlobalLogLevel, stdbLogger } from 'spacetimedb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
} from '../spacetimedb/src/entryAgreementPolicy';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../spacetimedb/src/resourceAuthorityPolicy';
import { configureHermesMachineOutput } from '../scripts/hermes-machine-output';
import {
  admissionReadinessSummary,
  collectPendingAccessRequestCensus,
  connect,
  FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED,
  FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
  inspectAdmissionNotification,
  inspectHermesNotificationPagesLiveAuthority,
  listAccessRequests,
  PENDING_ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST,
  parseHermesArguments,
  privacySafeHermesErrorMessage,
  projectAdmissionNotificationDiagnostics,
  projectAccessRequestAdmissionStatus,
  projectAccessRequestListPage,
  projectAccessRequestResetStatus,
  projectWorkerSystemStatusV12,
  readNotificationOperatorSecret,
  readStatus,
  reconnectAfterAdmissionNotification,
  requestAdmissionNotification,
  requestAdmissionNotificationRecovery,
  requireAdmissionNotificationRecoveryPrecondition,
  requirePendingAdmissionRequest,
  requireAdmissionNotificationInspectionProductionTarget,
  requireUnchangedPendingAdmissionRequest,
  requireNotificationBeforeAdmission,
  requestAdminToken,
  requireAccessRequestInspectionProductionTarget,
  requireAccessRequestResetProductionTarget,
  requireAlphaComponentActivationProductionTarget,
  requireCredentialedProductionTarget,
  requireFounderAdmissionProductionTarget,
  requireFounderAdmissionNotificationDeliveryApproval,
  requireGenesisExpansionProductionTarget,
  requireResourceBackfillProductionTarget,
  resolveAdmissionReadyFounderProfile,
  throwHermesOperationFailure,
  verifyAccessRequestResetAggregatePreservation,
  verifyExpectedResourceAggregateV4,
  verifyFounderAdmissionPostconditionV3,
  verifyFounderAdmissionPreconditionV3,
  verifyFounderAdmissionRequestPostcondition,
  verifyFounderAdmissionResourcePostconditionV4,
  verifyFounderAdmissionResourcePreconditionV4,
  verifyFounderReenablePostcondition,
  verifyFounderReenablePrecondition,
  verifyGenesisExpansionPostconditionV3,
  verifyGenesisExpansionPreconditionV3,
  verifyGenesisExpansionResourceCheckpointV4,
  verifyGenesisExpansionResourcePreservationV4,
  withOperationTimeout,
  writePendingAccessRequestCensus,
} from '../scripts/hermes-admin';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const TEST_SECRET = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
const TEST_ADMIN_TOKEN_BUDGET = Object.freeze({
  recordAttempt: async () => Object.freeze({
    attemptId: '0'.repeat(32),
    attemptedAtMs: 0,
    reservationId: null,
  }),
});
const NOTIFICATION_SECRET = 'TEST_ONLY_NOTIFICATION_SECRET_'.repeat(2);

function admissionNotificationDiagnostics(overrides: Record<string, unknown> = {}) {
  return {
    status: 'not-subscribed',
    deliveryAttemptCount: 0,
    verificationFailureCount: 0,
    subscribed: false,
    recoveryCount: 0,
    retryReasons: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

function runHermes(
  args: string[],
  overrides: Record<string, string | undefined> = {},
  input?: string,
  timeout = 5_000,
) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    // Preserve the autonomous runner's one sandbox-authorized IPC namespace.
    // `tsx` creates a short-lived Unix socket before evaluating Hermes; falling
    // back to shared `/tmp` would fail the boundary for the wrong reason.
    TMPDIR: process.env.TMPDIR,
    WARPKEEP_QA_SOCKET_TMP: process.env.WARPKEEP_QA_SOCKET_TMP,
    WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    WARPKEEP_ADMIN_TOKEN_SECRET: TEST_SECRET,
    ...overrides
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  const row = args[0] === 'admit-founder'
    ? args.includes('--dry-run') ? 'admit-dry' : 'admit-confirm'
    : args[0] === 'allow-fid'
      ? args.includes('--dry-run') ? 'allow-dry' : 'allow-confirm'
      : args[0] === 'inspect-admission-notification'
        ? 'notification-inspect'
        : args[0] === 'recover-admission-notification'
          ? args.includes('--dry-run') ? 'notification-recover-dry' : 'notification-recover-confirm'
          : args[0] === 'list-pending-access-requests'
            ? 'list-pending'
          : undefined;
  let trustedRoot: string | undefined;
  let childInput = input;
  if (row !== undefined) {
    trustedRoot = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-hermes-trusted-'));
    chmodSync(trustedRoot, 0o700);
    const founderPlans = resolve(trustedRoot, 'founder-plans');
    const recoveryPlans = resolve(trustedRoot, 'recovery-plans');
    const pendingCensus = resolve(trustedRoot, 'pending-census');
    env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE =
      'warpkeep-greater-realm-production-bootstrap-v1';
    env.WKGR_HERMES_RELEASE_COMMAND = row;
    env.WKGR_PRODUCTION_PROTECTED_COMMIT = 'a'.repeat(40);
    if (row === 'admit-dry' || row === 'admit-confirm') {
      mkdirSync(founderPlans, { mode: 0o700 });
      env.WKGR_HERMES_FOUNDER_PLAN_DIRECTORY = founderPlans;
    }
    if (row === 'notification-recover-dry' || row === 'notification-recover-confirm') {
      mkdirSync(recoveryPlans, { mode: 0o700 });
      env.WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY = recoveryPlans;
    }
    if (row === 'list-pending') {
      mkdirSync(pendingCensus, { mode: 0o700 });
      env.WKGR_HERMES_PENDING_CENSUS_DIRECTORY = pendingCensus;
    }
    const needsAdmin = ['list-pending', 'admit-confirm', 'allow-confirm', 'notification-recover-dry',
      'notification-recover-confirm'].includes(row);
    const needsNotification = ['admit-confirm', 'allow-confirm', 'notification-inspect',
      'notification-recover-dry', 'notification-recover-confirm'].includes(row);
    const needsInput = row === 'admit-dry' || row === 'admit-confirm';
    if (needsAdmin && env.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined) {
      const path = resolve(trustedRoot, 'admin-secret');
      writeFileSync(path, env.WARPKEEP_ADMIN_TOKEN_SECRET, { mode: 0o600 });
      env.WKGR_PRODUCTION_ADMIN_SECRET_PATH = path;
    }
    if (needsNotification && env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET !== undefined) {
      const path = resolve(trustedRoot, 'notification-secret');
      writeFileSync(path, env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET, { mode: 0o600 });
      env.WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH = path;
    }
    if (needsInput && input !== undefined) {
      const path = resolve(trustedRoot, 'private-input.json');
      writeFileSync(path, input, { mode: 0o600 });
      env.WKGR_PRODUCTION_PRIVATE_INPUT_PATH = path;
      childInput = undefined;
    }
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    delete env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET;
  }
  try {
    return spawnSync(process.execPath, [tsxCli, 'scripts/hermes-admin.ts', ...args], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env,
      input: childInput,
      timeout
    });
  } finally {
    if (trustedRoot !== undefined) rmSync(trustedRoot, { recursive: true, force: true });
  }
}

function foundedGenerationV2Status(overrides: Record<string, bigint | number | string> = {}) {
  return {
    worldTiles: 1_261n,
    occupiedWorldTiles: 3n,
    worldTileMeta: 1_261n,
    realms: 1n,
    castleSlots: 100n,
    castleSlotClaims: 3n,
    legacyPlayers: 0n,
    playersV2: 2n,
    playerOwnershipsV2: 2n,
    castles: 3n,
    realmProfiles: 3n,
    markAccounts: 3n,
    snapBurnCredits: 2n,
    walletAttributions: 4n,
    walletAttributionSnapshots: 1n,
    scanCursors: 1n,
    scanBatches: 2n,
    alphaTermsAcceptances: 2n,
    allowedFids: 3n,
    enabledAllowedFids: 3n,
    auditEntries: 14n,
    orphanedPlayerRowsV2: 0n,
    orphanedOwnershipRowsV2: 0n,
    orphanedCastleClaims: 0n,
    orphanedCastles: 0n,
    orphanedRealmProfiles: 0n,
    orphanedMarkAccounts: 0n,
    orphanedBurnCredits: 0n,
    orphanedTermsAcceptances: 0n,
    founderStateGaps: 0n,
    markAccountInvariantViolations: 0n,
    publicMarkProjectionViolations: 0n,
    duplicateBurnReferences: 0n,
    burnAccountReconciliationViolations: 0n,
    ambiguousActiveWalletAddresses: 0n,
    staticWorldDriftViolations: 0n,
    termsAcceptanceInvariantViolations: 0n,
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    ...overrides,
  };
}

function foundedGenerationV3Status(overrides: Record<string, bigint | number | string> = {}) {
  return foundedGenerationV2Status({
    worldTiles: 10_000n,
    worldTileMeta: 10_000n,
    ...overrides,
  });
}

function workerSystemStatusV12(overrides: Record<string, unknown> = {}) {
  const counts = Object.fromEntries([
    'systemRows', 'expectedCastleCount', 'expectedWorkerCount', 'actualWorkerCount',
    'castlesMissingWorkers', 'castlesWithExtraWorkers', 'duplicateOrdinals',
    'malformedWorkerIds', 'invalidWorkerStates', 'idleWorkers', 'outboundWorkers',
    'gatheringWorkers', 'returningWorkers', 'assignments', 'occupations', 'schedules',
    'orphanWorkers', 'orphanAssignments', 'assignmentsMissingOccupation',
    'assignmentsWithoutSingleSchedule', 'orphanOccupations', 'orphanSchedules',
    'invalidSchedules', 'assignmentPublicMismatches', 'occupationSiteMismatches',
    'invalidAssignments', 'idempotencyReceipts', 'invalidIdempotencyReceipts',
    'idempotencyOverflowFids', 'legacyExpeditions', 'legacyOccupations',
    'legacySchedules',
  ].map(field => [field, 0n]));
  return {
    ...counts,
    mode: 'absent',
    systemConfigValid: false,
    legacyDrainRequired: true,
    expectedCountsMatch: false,
    rosterDigestMatches: false,
    rosterDigest: '',
    rosterDigestExpected: '0123456789abcdef',
    ...overrides,
  };
}

describe('Hermes machine-readable output', () => {
  afterEach(() => {
    setGlobalLogLevel('info');
    vi.restoreAllMocks();
  });

  it('suppresses SpacetimeDB info logs only in machine-readable mode', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    configureHermesMachineOutput(true);
    stdbLogger('info', 'transport chatter');
    expect(output).not.toHaveBeenCalled();

    configureHermesMachineOutput(false);
    stdbLogger('info', 'human transport status');
    expect(output).toHaveBeenCalledOnce();
  });

  it('never prints arbitrary SDK, transport, or server error messages', () => {
    const sensitive = 'FID 424242; token=private; response-body=private';
    const rendered = privacySafeHermesErrorMessage(new Error(sensitive));
    expect(rendered).toBe('Hermes command failed.');
    expect(rendered).not.toContain('424242');
    expect(rendered).not.toContain('private');
  });

  it('preserves fixed ambiguous-timeout guidance without exposing arbitrary errors', async () => {
    vi.useFakeTimers();
    const rendered = withOperationTimeout(new Promise<never>(() => undefined))
      .catch(error => privacySafeHermesErrorMessage(error));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(rendered).resolves.toMatch(/may still commit; inspect current state before retrying/i);
  });

  it('maps every failure after a one-use admission claim to fresh-inspection guidance', () => {
    const sensitive = new Error('private FID and server response must not escape');
    let caught: unknown;
    try {
      throwHermesOperationFailure(sensitive, true);
    } catch (error) {
      caught = error;
    }
    const rendered = privacySafeHermesErrorMessage(caught);
    expect(rendered).toMatch(
      /may have committed.*inspect the fresh mode-aware cutover and legacy\/v17 aggregate state/i,
    );
    expect(rendered).not.toContain('private FID');
    expect(rendered).not.toContain('server response');
  });

  it('consumes an uncertain reset plan and requires read-only reconciliation', () => {
    const sensitive = new Error('private request tuple must not escape');
    let caught: unknown;
    try {
      throwHermesOperationFailure(sensitive, false, true);
    } catch (error) {
      caught = error;
    }
    const rendered = privacySafeHermesErrorMessage(caught);
    expect(rendered).toMatch(/plan was consumed.*inspect-access-request-reset/is);
    expect(rendered).toMatch(/never create or submit a new plan/i);
    expect(rendered).not.toContain('private request tuple');
  });

  it('projects the protocol-v2 inspection to an exact aggregate allowlist', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = {
      worldTiles: 61n,
      legacyPlayers: 0n,
      playersV2: 0n,
      playerOwnershipsV2: 0n,
      consistentPlayerPairsV2: 0n,
      orphanedPlayerRowsV2: 0n,
      orphanedOwnershipRowsV2: 0n,
      castles: 0n,
      allowedFids: 0n,
      enabledAllowedFids: 0n,
      auditEntries: 2n,
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      note: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV2: vi.fn(async () => status) },
    };

    await readStatus(connection as never, 'v2', true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
      worldTiles: '61',
      legacyPlayers: '0',
      playersV2: '0',
      playerOwnershipsV2: '0',
      consistentPlayerPairsV2: '0',
      orphanedPlayerRowsV2: '0',
      orphanedOwnershipRowsV2: '0',
      castles: '0',
      allowedFids: '0',
      enabledAllowedFids: '0',
      auditEntries: '2',
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
    expect(rendered).not.toContain('must-not-escape');
  });

  it('projects protocol-v3 inspection without private rows or identifiers', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const zeroFields = Object.fromEntries([
      'worldTiles', 'worldTileMeta', 'realms', 'castleSlots', 'castleSlotClaims',
      'legacyPlayers', 'playersV2', 'playerOwnershipsV2', 'castles', 'realmProfiles',
      'markAccounts', 'snapBurnCredits', 'walletAttributions', 'scanCursors',
      'allowedFids', 'enabledAllowedFids', 'auditEntries', 'orphanedPlayerRowsV2',
      'orphanedOwnershipRowsV2', 'orphanedCastleClaims', 'orphanedCastles',
      'orphanedRealmProfiles', 'orphanedMarkAccounts', 'orphanedBurnCredits',
      'founderStateGaps', 'markAccountInvariantViolations',
      'publicMarkProjectionViolations', 'duplicateBurnReferences',
      'burnAccountReconciliationViolations', 'ambiguousActiveWalletAddresses',
    ].map((key) => [key, 0n]));
    const status = {
      ...zeroFields,
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      walletAddress: 'must-not-escape',
      transactionHash: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV3: vi.fn(async () => status) },
    };

    const safeStatus = await readStatus(connection as never, 'v3', true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(rendered) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      ...Object.keys(zeroFields),
      'protocolVersion', 'worldSeed', 'worldSeedName',
    ].sort());
    expect(parsed).toMatchObject({
      worldTiles: '0',
      snapBurnCredits: '0',
      ambiguousActiveWalletAddresses: '0',
      protocolVersion: 3,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
    expect(rendered).not.toContain('must-not-escape');
    expect(safeStatus).toMatchObject({
      worldTiles: 0n,
      protocolVersion: 3,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
  });

  it('projects protocol-v4 inspection to resource counts and policy only', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = {
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
      fid: 424_242_424_242n,
      food: 200n,
      identity: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV4: vi.fn(async () => status) },
    };

    await readStatus(connection as never, 'v4', true, 4n);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
      allowedFids: '4',
      castles: '4',
      markAccounts: '4',
      resourceAccounts: '4',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    });
    expect(rendered).not.toContain('424242424242');
    expect(rendered).not.toContain('must-not-escape');
  });

  it('can compose v3 and v4 into one caller-owned envelope without intermediate output', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const protocolV3Procedure = vi.fn(async () => foundedGenerationV2Status());
    const resourceV4Procedure = vi.fn(async () => ({
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 0n,
      missingResourceAccounts: 3n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    }));
    const connection = {
      procedures: {
        adminGetAlphaStatusV3: protocolV3Procedure,
        adminGetAlphaStatusV4: resourceV4Procedure,
      },
    };

    const protocolV3 = await readStatus(
      connection as never,
      'v3',
      false,
      undefined,
      false,
    );
    const resourceV4 = await readStatus(
      connection as never,
      'v4',
      false,
      undefined,
      false,
    );

    expect(protocolV3Procedure).toHaveBeenCalledOnce();
    expect(resourceV4Procedure).toHaveBeenCalledOnce();
    expect(output).not.toHaveBeenCalled();
    expect(protocolV3).not.toHaveProperty('identity');
    expect(resourceV4).not.toHaveProperty('fid');
  });

  it('projects the Worker v12 inspection to one exact aggregate-only contract', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = workerSystemStatusV12({
      castlesMissingWorkers: 4n,
      legacyExpeditions: 2n,
    });
    const procedure = vi.fn(async () => status);
    const connection = {
      procedures: { adminGetWorkerSystemStatusV1: procedure },
    };

    const projected = await readStatus(connection as never, 'v12', true);
    expect(procedure).toHaveBeenCalledWith({});
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(rendered) as Record<string, unknown>;
    expect(parsed.castlesMissingWorkers).toBe('4');
    expect(parsed.legacyExpeditions).toBe('2');
    expect(parsed.mode).toBe('absent');
    expect(parsed).not.toHaveProperty('fid');
    expect((projected as Readonly<Record<string, unknown>>).castlesMissingWorkers).toBe(4n);
  });

  it('rejects changed Worker v12 keys, non-u64 counts, flags, modes, and digests', () => {
    const valid = workerSystemStatusV12();
    expect(projectWorkerSystemStatusV12(valid)).toMatchObject(valid);
    for (const invalid of [
      { ...valid, fid: 424_242n },
      { ...valid, assignments: '0' },
      { ...valid, assignments: -1n },
      { ...valid, assignments: 1n << 64n },
      { ...valid, systemConfigValid: 'false' },
      { ...valid, mode: 'disabled' },
      { ...valid, rosterDigest: 'ABCDEF0123456789' },
      { ...valid, rosterDigestExpected: '' },
    ]) {
      expect(() => projectWorkerSystemStatusV12(invalid)).toThrow();
    }
  });

  it('requires the exact post-backfill founder graph before reporting success', () => {
    const valid = {
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(verifyExpectedResourceAggregateV4(valid, 4n)).toEqual(valid);
    for (const changed of [
      { resourceAccounts: 3n },
      { missingResourceAccounts: 1n },
      { orphanedResourceAccounts: 1n },
      { resourceInvariantViolations: 1n },
      { protocolVersion: 4 },
      { resourcePolicyVersion: 'genesis-resource-yield-v2' },
    ]) {
      expect(() => verifyExpectedResourceAggregateV4({ ...valid, ...changed }, 4n))
        .toThrow(/postcondition failed/i);
    }
    expect(() => verifyExpectedResourceAggregateV4(valid, 0n)).toThrow(/postcondition failed/i);
    expect(() => verifyExpectedResourceAggregateV4(valid, 101n)).toThrow(/postcondition failed/i);
  });

  it('accepts only the exact generation-v2 founded expansion checkpoint', () => {
    const status = foundedGenerationV2Status();
    expect(verifyGenesisExpansionPreconditionV3(status)).toEqual(status);

    expect(WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM).toBe(6);
    const retainedHistoryStatus = {
      ...status,
      alphaTermsAcceptances: status.playersV2
        * BigInt(WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM),
    };
    expect(verifyGenesisExpansionPreconditionV3(retainedHistoryStatus))
      .toEqual(retainedHistoryStatus);
    expect(() => verifyGenesisExpansionPreconditionV3({
      ...retainedHistoryStatus,
      alphaTermsAcceptances: retainedHistoryStatus.alphaTermsAcceptances + 1n,
    })).toThrow(/founded player graph/i);

    for (const changed of [
      { worldTiles: 1_260n },
      { worldTileMeta: 10_000n },
      { realms: 2n },
      { castleSlots: 99n },
      { staticWorldDriftViolations: 1n },
      { orphanedCastleClaims: 1n },
      { playerOwnershipsV2: 1n },
      { enabledAllowedFids: 2n },
      { protocolVersion: 4 },
      { worldSeedName: 'LOOKALIKE_WORLD' },
    ]) {
      expect(() => verifyGenesisExpansionPreconditionV3({ ...status, ...changed }))
        .toThrow(/expansion|checkpoint|founded/i);
    }
  });

  it('preserves either exact pre-backfill or ready private resource aggregates', () => {
    const prebackfill = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 0n,
      missingResourceAccounts: 3n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    const ready = {
      ...prebackfill,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
    };
    expect(verifyGenesisExpansionResourceCheckpointV4(prebackfill)).toEqual(prebackfill);
    expect(verifyGenesisExpansionResourceCheckpointV4(ready)).toEqual(ready);
    expect(verifyGenesisExpansionResourcePreservationV4(ready, ready)).toEqual(ready);

    for (const changed of [
      { resourceAccounts: 1n },
      { missingResourceAccounts: 2n },
      { orphanedResourceAccounts: 1n },
      { resourceInvariantViolations: 1n },
      { resourcePolicyVersion: 'unknown' },
    ]) {
      expect(() => verifyGenesisExpansionResourceCheckpointV4({
        ...prebackfill,
        ...changed,
      })).toThrow(/resource checkpoint was not exact/i);
    }
    expect(() => verifyGenesisExpansionResourcePreservationV4(ready, prebackfill))
      .toThrow(/changed private resource aggregate state/i);
  });

  it('requires an exact 10,000-cell transition that preserves all player state', () => {
    const before = verifyGenesisExpansionPreconditionV3(foundedGenerationV2Status());
    const after = {
      ...before,
      worldTiles: 10_000n,
      worldTileMeta: 10_000n,
      auditEntries: before.auditEntries + 1n,
    };
    expect(verifyGenesisExpansionPostconditionV3(after, before)).toEqual(after);

    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, worldTiles: 9_999n },
      before,
    )).toThrow(/postcondition failed/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, playersV2: before.playersV2 + 1n, playerOwnershipsV2: before.playerOwnershipsV2 + 1n },
      before,
    )).toThrow(/changed persistent player state/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, alphaTermsAcceptances: before.alphaTermsAcceptances + 1n },
      before,
    )).toThrow(/changed persistent player state/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, auditEntries: before.auditEntries + 2n },
      before,
    )).toThrow(/audit transition/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, termsAcceptanceInvariantViolations: 1n },
      before,
    )).toThrow(/nonzero termsAcceptanceInvariantViolations/i);
  });

  it('checks exact v3/v4 founder capacity before claim and exact aggregate mutation after submit', () => {
    const before = foundedGenerationV3Status();
    expect(verifyFounderAdmissionPreconditionV3(before)).toEqual(before);
    const retainedAgreementHistoryBefore = foundedGenerationV3Status({
      alphaTermsAcceptances: 6n,
    });
    expect(verifyFounderAdmissionPreconditionV3(retainedAgreementHistoryBefore))
      .toEqual(retainedAgreementHistoryBefore);
    expect(() => verifyFounderAdmissionPreconditionV3(foundedGenerationV3Status({
      alphaTermsAcceptances:
        2n * BigInt(WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM) + 1n,
    }))).toThrow(/capacity-safe/i);
    const beforeResources = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    expect(verifyFounderAdmissionResourcePreconditionV4(beforeResources, 3n))
      .toEqual(beforeResources);

    const after = {
      ...before,
      occupiedWorldTiles: 4n,
      castleSlotClaims: 4n,
      castles: 4n,
      realmProfiles: 4n,
      markAccounts: 4n,
      allowedFids: 4n,
      enabledAllowedFids: 4n,
      auditEntries: before.auditEntries + 1n,
    };
    expect(verifyFounderAdmissionPostconditionV3(after, before)).toEqual(after);
    const afterResources = {
      ...beforeResources,
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
    };
    expect(verifyFounderAdmissionResourcePostconditionV4(afterResources, beforeResources))
      .toEqual(afterResources);

    expect(() => verifyFounderAdmissionPreconditionV3({
      ...before,
      founderStateGaps: 1n,
    })).toThrow(/nonzero founderStateGaps/i);
    expect(() => verifyFounderAdmissionPreconditionV3(foundedGenerationV3Status({
      occupiedWorldTiles: 100n,
      castleSlotClaims: 100n,
      castles: 100n,
      realmProfiles: 100n,
      markAccounts: 100n,
      allowedFids: 100n,
      enabledAllowedFids: 100n,
    }))).toThrow(/capacity-safe/i);
    expect(() => verifyFounderAdmissionResourcePreconditionV4({
      ...beforeResources,
      resourceAccounts: 2n,
      missingResourceAccounts: 1n,
    }, 3n)).toThrow(/resource checkpoint/i);
    expect(() => verifyFounderAdmissionPostconditionV3({
      ...after,
      playersV2: before.playersV2 + 1n,
      playerOwnershipsV2: before.playerOwnershipsV2 + 1n,
    }, before)).toThrow(/unrelated persistent aggregate state/i);
  });

  it('binds an existing founder re-enable to one pending request and exact post-state', () => {
    const worldBefore = foundedGenerationV3Status({ enabledAllowedFids: 2n });
    const resources = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    const targetBefore = projectAccessRequestAdmissionStatus({
      admissionState: 'disabled',
      authEpoch: 3,
      requestState: 'pending',
      requestCycle: 4n,
      requestedAtMicros: 1_800_000_000_000_000n,
    });
    const before = verifyFounderReenablePrecondition(
      worldBefore,
      resources,
      targetBefore,
    );
    expect(() => verifyFounderReenablePrecondition(
      worldBefore,
      resources,
      { ...targetBefore, requestState: 'resolved' },
    )).toThrow(/exact pending access request/i);

    const targetAfter = projectAccessRequestAdmissionStatus({
      admissionState: 'enabled',
      authEpoch: 4,
      requestState: 'resolved',
      requestCycle: 4n,
      requestedAtMicros: 1_800_000_000_000_000n,
    });
    expect(() => verifyFounderReenablePostcondition(
      {
        ...worldBefore,
        enabledAllowedFids: 3n,
        auditEntries: worldBefore.auditEntries + 1n,
      },
      resources,
      targetAfter,
      before,
    )).not.toThrow();
    expect(() => verifyFounderReenablePostcondition(
      {
        ...worldBefore,
        enabledAllowedFids: 3n,
        auditEntries: worldBefore.auditEntries + 1n,
      },
      { ...resources, resourceAccounts: 2n, missingResourceAccounts: 1n },
      targetAfter,
      before,
    )).toThrow(/resource/i);
  });

  it('rejects stale, rotated, resolved, and wrong-kind admission request races', () => {
    const before = requirePendingAdmissionRequest(
      projectAccessRequestAdmissionStatus({
        admissionState: 'missing',
        authEpoch: 0,
        requestState: 'pending',
        requestCycle: 0n,
        requestedAtMicros: 1_800_000_000_000_000n,
      }),
      'missing',
    );
    expect(requireUnchangedPendingAdmissionRequest(before, { ...before }, 'missing'))
      .toEqual(before);
    expect(() => requireUnchangedPendingAdmissionRequest(
      before,
      { ...before, requestedAtMicros: before.requestedAtMicros + 1n },
      'missing',
    )).toThrow(/exact pending access request changed/i);
    expect(() => requireUnchangedPendingAdmissionRequest(
      before,
      {
        ...before,
        admissionState: 'disabled',
        authEpoch: 1,
        requestCycle: 2n,
      },
      'missing',
    )).toThrow(/expected kind/i);
    expect(() => requireUnchangedPendingAdmissionRequest(
      before,
      { ...before, requestState: 'resolved' },
      'missing',
    )).toThrow(/exact pending access request/i);
    expect(() => projectAccessRequestAdmissionStatus({
      ...before,
      requestState: 'resolved',
      requestCycle: 1n,
    })).toThrow(/impossible future request cycle/i);

    expect(() => verifyFounderAdmissionRequestPostcondition(
      projectAccessRequestAdmissionStatus({
        admissionState: 'enabled',
        authEpoch: 1,
        requestState: 'resolved',
        requestCycle: 0n,
        requestedAtMicros: before.requestedAtMicros,
      }),
      before,
    )).not.toThrow();
  });
});

describe('Hermes command-line boundary', () => {
  it('requires one exact current-source live Pages receipt before confirmed authority', async () => {
    const emptyRoot = Object.freeze({
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
    const inspectByPagesSourceCommit = vi.fn();
    await expect(inspectHermesNotificationPagesLiveAuthority({
      rootBinding: emptyRoot,
      required: false,
      repositoryRoot,
    }, {
      inspectByPagesSourceCommit: inspectByPagesSourceCommit as never,
    })).resolves.toEqual({
      notificationPagesLiveReceiptDigest: null,
      notificationPagesLivePagesSourceCommit: null,
      notificationPagesLiveBridgeSourceCommit: null,
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
    expect(inspectByPagesSourceCommit).not.toHaveBeenCalled();
    await expect(inspectHermesNotificationPagesLiveAuthority({
      rootBinding: emptyRoot,
      required: true,
      repositoryRoot,
    }, {
      inspectByPagesSourceCommit: inspectByPagesSourceCommit as never,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_REQUIRED',
    );

    const rootBinding = Object.freeze({
      notificationPagesLiveRootReceiptDigest: 'a'.repeat(64),
      notificationPagesLiveRootPagesSourceCommit: 'b'.repeat(40),
    });
    const pagesSourceCommit = 'c'.repeat(40);
    const bridgeSourceCommit = 'd'.repeat(40);
    const receiptDigest = 'e'.repeat(64);
    const exactInspect = vi.fn(async () => ({
      receiptDigest,
      chainRootReceiptDigest: rootBinding.notificationPagesLiveRootReceiptDigest,
      chainRootPagesSourceCommit: rootBinding.notificationPagesLiveRootPagesSourceCommit,
      receipt: {
        pages: {
          sourceCommit: pagesSourceCommit,
          notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false,
        },
        bridge: { sourceCommit: bridgeSourceCommit },
      },
    }));
    await expect(inspectHermesNotificationPagesLiveAuthority({
      rootBinding,
      required: true,
      pagesSourceCommit,
      repositoryRoot,
    }, {
      inspectByPagesSourceCommit: exactInspect as never,
    })).resolves.toEqual({
      notificationPagesLiveReceiptDigest: receiptDigest,
      notificationPagesLivePagesSourceCommit: pagesSourceCommit,
      notificationPagesLiveBridgeSourceCommit: bridgeSourceCommit,
      notificationPagesLiveRootReceiptDigest:
        rootBinding.notificationPagesLiveRootReceiptDigest,
      notificationPagesLiveRootPagesSourceCommit:
        rootBinding.notificationPagesLiveRootPagesSourceCommit,
    });
    expect(exactInspect).toHaveBeenCalledWith(expect.objectContaining({
      pagesSourceCommit,
      repositoryRoot,
    }));

    const driftedInspect = vi.fn(async () => ({
      receiptDigest,
      chainRootReceiptDigest: 'f'.repeat(64),
      chainRootPagesSourceCommit: rootBinding.notificationPagesLiveRootPagesSourceCommit,
      receipt: {
        pages: {
          sourceCommit: pagesSourceCommit,
          notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false,
        },
        bridge: { sourceCommit: bridgeSourceCommit },
      },
    }));
    await expect(inspectHermesNotificationPagesLiveAuthority({
      rootBinding,
      required: true,
      pagesSourceCommit,
      repositoryRoot,
    }, {
      inspectByPagesSourceCommit: driftedInspect as never,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_MISMATCH',
    );
  });

  it('keeps both founder mutation paths behind one literal notification release gate', () => {
    expect(FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED).toBe(false);

    for (const command of ['admit-founder', 'allow-fid'] as const) {
      const calls = {
        bridgeDelivery: vi.fn(),
        token: vi.fn(),
        connection: vi.fn(),
        planClaim: vi.fn(),
        reducer: vi.fn(),
      };
      const execute = (approved: boolean) => {
        requireFounderAdmissionNotificationDeliveryApproval(command, approved);
        calls.bridgeDelivery();
        calls.token();
        calls.connection();
        calls.planClaim();
        calls.reducer();
      };

      expect(() => execute(false)).toThrow(
        `Founder admission notification delivery is not approved. ${command} remains unavailable until the coordinated notification release.`,
      );
      expect(Object.values(calls).every(call => call.mock.calls.length === 0)).toBe(true);

      expect(() => execute(true)).not.toThrow();
      expect(Object.values(calls).every(call => call.mock.calls.length === 1)).toBe(true);
    }
  });

  it('checks the functional notification gate before transport, claims, or reducers', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    expect(source.match(
      /export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;/g,
    )).toHaveLength(1);

    const mainSource = source.slice(source.indexOf('async function main()'));
    const releaseGate = mainSource.indexOf(
      'requireFounderAdmissionNotificationDeliveryApproval(command);',
    );
    const notificationCredential = mainSource.indexOf(
      'const trustedLaunch = validateTrustedHermesLaunch(capturedTrustedLaunch);',
    );
    const liveNotificationAuthority = mainSource.indexOf(
      'await inspectHermesNotificationPagesLiveAuthority({',
    );
    const credential = mainSource.indexOf('const secret = trustedLaunch?.adminSecretPath');
    const token = mainSource.indexOf('let token = await requestAdminToken(');
    const connection = mainSource.indexOf('connection = await connect(');
    const claim = mainSource.indexOf('claimReviewedFounderAdmissionPlan({');
    const admissionReducer = mainSource.indexOf(
      'connection.reducers.adminAdmitFounderForAccessRequestV2(',
    );
    const reenableReducer = mainSource.indexOf(
      'connection.reducers.adminAllowFidForAccessRequestV1(',
    );
    expect(releaseGate).toBeGreaterThan(-1);
    expect(notificationCredential).toBeGreaterThan(releaseGate);
    expect(liveNotificationAuthority).toBeGreaterThan(notificationCredential);
    expect(credential).toBeGreaterThan(releaseGate);
    expect(credential).toBeGreaterThan(liveNotificationAuthority);
    expect(token).toBeGreaterThan(releaseGate);
    expect(connection).toBeGreaterThan(releaseGate);
    expect(claim).toBeGreaterThan(releaseGate);
    expect(admissionReducer).toBeGreaterThan(claim);
    expect(reenableReducer).toBeGreaterThan(releaseGate);
  });

  it('blacks out confirmed founder execution before reading credentials or targets', () => {
    for (const [command, arguments_] of [
      ['admit-founder', ['admit-founder', '--input-stdin', '--confirm']],
      ['allow-fid', ['allow-fid', '12345', 'reviewed note', '--confirm']],
    ] as const) {
      const result = runHermes([...arguments_], {
        WARPKEEP_NOTIFICATION_OPERATOR_SECRET: 'MUST_NOT_BE_READ',
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
        WARPKEEP_SPACETIMEDB_URI: 'http://invalid.example',
        WARPKEEP_SPACETIMEDB_DATABASE: 'INVALID_DATABASE',
        WARPKEEP_AUTH_BRIDGE_URL: 'http://invalid.example',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe(
        `Founder admission notification delivery is not approved. ${command} remains unavailable until the coordinated notification release.`,
      );
      expect(result.stderr).not.toContain('MUST_NOT_BE_READ');
      expect(result.stderr).not.toContain('WARPKEEP_');
    }
  });

  it('rejects unknown, duplicate, misplaced, and extra arguments', () => {
    expect(parseHermesArguments(['inspect-alpha', '--json'])).toMatchObject({
      command: 'inspect-alpha',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(() => parseHermesArguments(['inspect-alpha', '--jsno'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--json', '--json'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--confirm'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--dry-run'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['allow-fid', '123', 'note', '--json'])).toThrow(/invalid for this operation/i);
    expect(parseHermesArguments(['admit-founder', '--input-stdin', '--dry-run'])).toMatchObject({
      command: 'admit-founder',
      inspection: false,
      dryRun: true,
      existingFounderReenableOnly: false,
      privateInputStdin: true,
    });
    expect(parseHermesArguments(['admit-founder', '--input-stdin', '--confirm'])).toMatchObject({
      command: 'admit-founder',
      confirmedByFlag: true,
      privateInputStdin: true,
    });
    expect(parseHermesArguments(['allow-fid', '123', 'note', '--dry-run'])).toMatchObject({
      command: 'allow-fid',
      existingFounderReenableOnly: true,
    });
    expect(parseHermesArguments([
      'reset-access-request', '123', 'owner canary reset', '--input-stdin', '--dry-run',
    ])).toMatchObject({
      command: 'reset-access-request',
      inspection: false,
      dryRun: true,
    });
    expect(parseHermesArguments([
      'reset-access-request',
      'access-request-reset-plan-20260803T130000000Z-0123456789abcdef0123456789abcdef.json',
      'a'.repeat(64),
      '--input-stdin',
      '--confirm',
    ])).toMatchObject({
      command: 'reset-access-request',
      confirmedByFlag: true,
      privateInputStdin: true,
    });
    expect(() => parseHermesArguments([
      'reset-access-request', '123', 'owner canary reset',
    ])).toThrow(/exactly one/i);
    expect(() => parseHermesArguments([
      'reset-access-request', '--input-stdin', '--dry-run', '--confirm',
    ])).toThrow(/unexpected number/i);
    expect(() => parseHermesArguments([
      'reset-access-request', 'plan.json', 'a'.repeat(64), '--input-stdin', '--confirm', '--json',
    ])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments([
      'reset-access-request', 'plan.json', 'a'.repeat(64), '--confirm',
    ])).toThrow(/administrator secret.*--input-stdin/i);
    expect(() => parseHermesArguments([
      'reset-access-request', '123', 'owner canary reset', '--dry-run',
    ])).toThrow(/administrator secret.*--input-stdin/i);
    expect(parseHermesArguments([
      'recover-admission-notification',
      '123',
      'reviewed exhausted delivery recovery',
      '--input-stdin',
      '--dry-run',
    ])).toMatchObject({
      command: 'recover-admission-notification',
      inspection: false,
      dryRun: true,
      privateInputStdin: true,
    });
    expect(parseHermesArguments([
      'recover-admission-notification',
      'admission-notification-recovery-plan-20260811T130000000Z-0123456789abcdef0123456789abcdef.json',
      'b'.repeat(64),
      '--input-stdin',
      '--confirm',
    ])).toMatchObject({
      command: 'recover-admission-notification',
      confirmedByFlag: true,
      privateInputStdin: true,
    });
    expect(() => parseHermesArguments([
      'recover-admission-notification', '123', 'note', '--dry-run',
    ])).toThrow(/administrator secret.*--input-stdin/i);
    expect(parseHermesArguments([
      'inspect-access-request-reset', '123', '--json',
    ])).toMatchObject({
      command: 'inspect-access-request-reset',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments([
      'inspect-admission-notification', '123', '--json',
    ])).toMatchObject({
      command: 'inspect-admission-notification',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(() => parseHermesArguments([
      'inspect-admission-notification', '123', '--confirm',
    ])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-admission-notification']))
      .toThrow(/unexpected number/i);
    for (const retired of [
      ['notify-admitted', '123', '--confirm'],
      ['notify-admitted', '123'],
      ['notify-admitted', '123', '--dry-run'],
      ['notify-admitted', '123', '--confirm', '--json'],
    ]) {
      expect(() => parseHermesArguments(retired)).toThrow(/Usage: hermes-admin/i);
    }
    expect(() => parseHermesArguments(['admit-founder', '123', 'note', '--dry-run']))
      .toThrow(/unexpected number/i);
    expect(() => parseHermesArguments(['admit-founder', '--dry-run']))
      .toThrow(/private input/i);
    expect(() => parseHermesArguments(['admit-founder', '--input-stdin']))
      .toThrow(/exactly one/i);
    expect(() => parseHermesArguments([
      'admit-founder', '--input-stdin', '--dry-run', '--confirm',
    ])).toThrow(/exactly one/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--input-stdin']))
      .toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-alpha', 'extra'])).toThrow(/unexpected number/i);
    expect(parseHermesArguments(['inspect-alpha-v4', '--json'])).toMatchObject({
      command: 'inspect-alpha-v4',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['inspect-alpha-v8', '--json'])).toMatchObject({
      command: 'inspect-alpha-v8',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['inspect-alpha-v10', '--json'])).toMatchObject({
      command: 'inspect-alpha-v10',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['inspect-alpha-v12', '--json'])).toMatchObject({
      command: 'inspect-alpha-v12',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['inspect-publish-pre-v12', '--json'])).toMatchObject({
      command: 'inspect-publish-pre-v12',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['inspect-publish-post-v12', '--json'])).toMatchObject({
      command: 'inspect-publish-post-v12',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(() => parseHermesArguments(['inspect-publish-pre-v12', '--confirm']))
      .toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-publish-post-v12', '--dry-run']))
      .toThrow(/invalid for this operation/i);
    expect(parseHermesArguments(['seed-alpha-component', 'gold', '--dry-run'])).toMatchObject({
      command: 'seed-alpha-component',
      inspection: false,
      dryRun: true,
    });
    expect(parseHermesArguments(['seed-alpha-component', 'forest', '--confirm'])).toMatchObject({
      command: 'seed-alpha-component',
      confirmedByFlag: true,
    });
    expect(parseHermesArguments(['seed-alpha-component', 'stone', '--dry-run']))
      .toMatchObject({ command: 'seed-alpha-component', dryRun: true });
    expect(parseHermesArguments(['seed-alpha-component', 'water', '--confirm']))
      .toMatchObject({ command: 'seed-alpha-component', confirmedByFlag: true });
    expect(() => parseHermesArguments(['seed-alpha-component', 'iron', '--dry-run']))
      .toThrow(/gold, forest, food, wood/i);
    expect(() => parseHermesArguments(['seed-alpha-component', 'gold']))
      .toThrow(/exactly one/i);
    expect(() => parseHermesArguments([
      'seed-alpha-component', 'gold', '--dry-run', '--confirm',
    ])).toThrow(/exactly one/i);
    expect(parseHermesArguments(['activate-alpha-water', '--dry-run'])).toMatchObject({
      command: 'activate-alpha-water',
      dryRun: true,
    });
    expect(parseHermesArguments(['activate-alpha-water', '--confirm'])).toMatchObject({
      command: 'activate-alpha-water',
      confirmedByFlag: true,
    });
    expect(() => parseHermesArguments(['activate-alpha-water']))
      .toThrow(/exactly one/i);
    expect(parseHermesArguments(['backfill-resources', '4', '--confirm'])).toMatchObject({
      command: 'backfill-resources',
      inspection: false,
      confirmedByFlag: true,
    });
    expect(() => parseHermesArguments(['backfill-resources', '4', '--json'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['backfill-resources'])).toThrow(/unexpected number/i);
    expect(parseHermesArguments(['expand-world-v3', '--dry-run', '--confirm'])).toMatchObject({
      command: 'expand-world-v3',
      inspection: false,
      dryRun: true,
      confirmedByFlag: true,
    });
    expect(() => parseHermesArguments(['expand-world-v3', '1261', '--confirm']))
      .toThrow(/unexpected number/i);
    expect(parseHermesArguments([
      'list-access-requests',
      '--limit', '25',
      '--after-requested-at-micros', '1720000000000000',
      '--after-fid', '123',
      '--include-resolved',
      '--json',
    ])).toMatchObject({
      command: 'list-access-requests',
      inspection: true,
      machineReadableInspection: true,
      accessRequestList: {
        limit: 25,
        afterRequestedAtMicros: 1_720_000_000_000_000n,
        afterFid: 123n,
        includeResolved: true,
      },
    });
    expect(parseHermesArguments(['list-access-requests'])).toMatchObject({
      accessRequestList: {
        limit: 100,
        afterRequestedAtMicros: 0n,
        afterFid: 0n,
        includeResolved: false,
      },
    });
    expect(parseHermesArguments(['list-pending-access-requests'])).toMatchObject({
      command: 'list-pending-access-requests',
      inspection: true,
      machineReadableInspection: false,
    });
    expect(() => parseHermesArguments([
      'list-pending-access-requests', '--json',
    ])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments([
      'list-pending-access-requests', '--limit', '1',
    ])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments([
      'list-access-requests', '--after-fid', '123',
    ])).toThrow(/requires both/i);
    expect(() => parseHermesArguments([
      'list-access-requests', '--limit', '101',
    ])).toThrow(/1 to 100/i);
    expect(() => parseHermesArguments([
      'list-access-requests', '--limit', '10', '--limit', '20',
    ])).toThrow(/duplicate/i);
    expect(() => parseHermesArguments([
      'list-access-requests', '--confirm',
    ])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments([
      'inspect-alpha', '--limit', '5',
    ])).toThrow(/invalid for this operation/i);
  });
});

describe('Hermes private access request review boundary', () => {
  const options = {
    limit: 2,
    afterRequestedAtMicros: 0n,
    afterFid: 0n,
    includeResolved: false,
  } as const;

  const page = {
    entries: [
      {
        fid: 123n,
        requestedAtMicros: 1_720_000_000_000_000n,
        admissionState: 'missing',
        requestState: 'pending',
      },
      {
        fid: 456n,
        requestedAtMicros: 1_720_000_001_000_000n,
        admissionState: 'disabled',
        requestState: 'pending',
      },
    ],
    nextRequestedAtMicros: 1_720_000_001_000_000n,
    nextFid: 456n,
    hasMore: true,
    totalRequests: 4n,
    pendingRequests: 3n,
  } as const;

  it('accepts only the exact bounded, sorted, cursor-consistent owner page', () => {
    expect(projectAccessRequestListPage(page, options)).toEqual(page);
    for (const invalid of [
      { ...page, identity: 'must-not-escape' },
      { ...page, entries: [...page.entries, page.entries[0]] },
      { ...page, entries: [...page.entries].reverse() },
      { ...page, entries: [{ ...page.entries[0], fid: 0n }, page.entries[1]] },
      {
        ...page,
        entries: [{
          ...page.entries[0],
          admissionState: 'enabled',
          requestState: 'pending',
        }, page.entries[1]],
      },
      {
        ...page,
        entries: [{ ...page.entries[0], requestState: 'resolved' }, page.entries[1]],
      },
      { ...page, nextFid: 123n },
      { ...page, nextRequestedAtMicros: undefined, nextFid: undefined },
      { ...page, pendingRequests: 5n },
    ]) {
      expect(() => projectAccessRequestListPage(invalid, options)).toThrow();
    }
  });

  it('calls one fixed read-only procedure and emits a minimal machine page', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const procedure = vi.fn(async () => page);
    const connection = {
      procedures: { adminListAccessRequestsV1: procedure },
    };

    await expect(listAccessRequests(connection as never, options, true)).resolves.toEqual(page);
    expect(procedure).toHaveBeenCalledOnce();
    expect(procedure).toHaveBeenCalledWith({
      afterRequestedAtMicros: 0n,
      afterFid: 0n,
      limit: 2,
      includeResolved: false,
    });
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
      entries: [
        {
          fid: '123',
          requestedAt: '2024-07-03T09:46:40.000Z',
          admissionState: 'missing',
          requestState: 'pending',
        },
        {
          fid: '456',
          requestedAt: '2024-07-03T09:46:41.000Z',
          admissionState: 'disabled',
          requestState: 'pending',
        },
      ],
      nextCursor: {
        requestedAtMicros: '1720000001000000',
        fid: '456',
      },
      hasMore: true,
      totalRequests: '4',
      pendingRequests: '3',
    });
    expect(rendered).not.toContain('identity');
    expect(rendered).not.toContain('token');
    expect(rendered).not.toContain('note');
  });

  it('collects one stable pending-only census and installs FIDs only in a 0600 private report', async () => {
    const secondPage = {
      entries: [{
        fid: 789n,
        requestedAtMicros: 1_720_000_002_000_000n,
        admissionState: 'missing',
        requestState: 'pending',
      }],
      nextRequestedAtMicros: undefined,
      nextFid: undefined,
      hasMore: false,
      totalRequests: 4n,
      pendingRequests: 3n,
    } as const;
    const procedure = vi.fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(secondPage);
    const connection = {
      procedures: { adminListAccessRequestsV1: procedure },
    };
    const protectedCommit = 'a'.repeat(40);
    const census = await collectPendingAccessRequestCensus(
      connection as never,
      protectedCommit,
    );
    expect(procedure).toHaveBeenNthCalledWith(1, {
      afterRequestedAtMicros: 0n,
      afterFid: 0n,
      limit: 100,
      includeResolved: false,
    });
    expect(procedure).toHaveBeenNthCalledWith(2, {
      afterRequestedAtMicros: page.nextRequestedAtMicros,
      afterFid: page.nextFid,
      limit: 100,
      includeResolved: false,
    });
    expect(census).toEqual({
      schemaVersion: 1,
      kind: 'warpkeep-pending-access-request-census-v1',
      protectedCommit,
      targetConfigurationDigest:
        PENDING_ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST,
      totalRequests: '4',
      pendingRequests: '3',
      entries: [
        {
          fid: '123',
          requestedAtMicros: '1720000000000000',
          admissionState: 'missing',
        },
        {
          fid: '456',
          requestedAtMicros: '1720000001000000',
          admissionState: 'disabled',
        },
        {
          fid: '789',
          requestedAtMicros: '1720000002000000',
          admissionState: 'missing',
        },
      ],
      advisoryOnly: true,
      admissionMustRecheckRequestCas: true,
    });

    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), 'warpkeep-pending-census-'),
    );
    chmodSync(directory, 0o700);
    try {
      const reference = (() => {
        const previousUmask = process.umask(0o777);
        try {
          return writePendingAccessRequestCensus({
            directory,
            census,
            randomId: () => 'b'.repeat(32),
          });
        } finally {
          process.umask(previousUmask);
        }
      })();
      expect(reference.filename).toBe(
        `pending-access-request-census-${reference.sha256}.json`,
      );
      expect(reference.filename).not.toMatch(/123|456|789/u);
      const path = join(directory, reference.filename);
      const status = lstatSync(path);
      expect(status.isFile()).toBe(true);
      expect(status.mode & 0o7777).toBe(0o600);
      expect(status.nlink).toBe(1);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(census);
      expect(writePendingAccessRequestCensus({
        directory,
        census,
        randomId: () => 'c'.repeat(32),
      })).toEqual(reference);

      const crashTemporary = join(
        directory,
        `.${reference.filename}-${'d'.repeat(32)}.tmp`,
      );
      linkSync(path, crashTemporary);
      expect(lstatSync(path).nlink).toBe(2);
      expect(lstatSync(crashTemporary).nlink).toBe(2);
      expect(writePendingAccessRequestCensus({
        directory,
        census,
        randomId: () => 'e'.repeat(32),
      })).toEqual(reference);
      expect(lstatSync(path).nlink).toBe(1);
      expect(() => lstatSync(crashTemporary)).toThrow();
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(census);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails a census on total drift, duplicate FIDs, or a forty-first nonterminal page', async () => {
    const stableSecond = {
      entries: [{
        fid: 789n,
        requestedAtMicros: 1_720_000_002_000_000n,
        admissionState: 'missing',
        requestState: 'pending',
      }],
      nextRequestedAtMicros: undefined,
      nextFid: undefined,
      hasMore: false,
      totalRequests: 4n,
      pendingRequests: 3n,
    } as const;
    const connection = (procedure: ReturnType<typeof vi.fn>) => ({
      procedures: { adminListAccessRequestsV1: procedure },
    });
    await expect(collectPendingAccessRequestCensus(connection(
      vi.fn()
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce({ ...stableSecond, totalRequests: 5n }),
    ) as never, 'a'.repeat(40))).rejects.toThrow(/totals changed/i);

    await expect(collectPendingAccessRequestCensus(connection(
      vi.fn()
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce({
          ...stableSecond,
          entries: [{
            ...stableSecond.entries[0],
            fid: page.entries[0].fid,
          }],
        }),
    ) as never, 'a'.repeat(40))).rejects.toThrow(/continuity/i);

    let call = 0;
    const endless = vi.fn(async (_request: Readonly<{
      afterRequestedAtMicros: bigint;
      afterFid: bigint;
      limit: number;
      includeResolved: boolean;
    }>) => {
      call += 1;
      return {
        entries: [{
          fid: BigInt(call),
          requestedAtMicros: BigInt(call),
          admissionState: 'missing',
          requestState: 'pending',
        }],
        nextRequestedAtMicros: BigInt(call),
        nextFid: BigInt(call),
        hasMore: true,
        totalRequests: 4_096n,
        pendingRequests: 4_096n,
      };
    });
    await expect(collectPendingAccessRequestCensus(
      connection(endless) as never,
      'a'.repeat(40),
    )).rejects.toThrow(/pagination exceeded/i);
    expect(endless).toHaveBeenCalledTimes(41);
    expect(endless.mock.calls.every(([request]) => (
      request.limit === 100 && request.includeResolved === false
    ))).toBe(true);
  });

  it('keeps legacy listing separate from admission and exposes census only through the trusted row', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const listing = source.slice(
      source.indexOf('export async function listAccessRequests('),
      source.indexOf('type ResourceAggregateV4'),
    );
    expect(listing).toContain('adminListAccessRequestsV1');
    expect(listing).not.toContain('adminAdmitFounderV1');
    expect(listing).not.toContain('adminAllowFid');
    expect(listing).not.toContain('reducers.');
    const manifest = JSON.parse(readFileSync(
      resolve(repositoryRoot, 'package.json'),
      'utf8',
    ));
    expect(manifest.scripts['stdb:list-access-requests'])
      .toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
    const envelope = readFileSync(
      resolve(repositoryRoot, 'docs/operations/greater-realm-production-launch-envelope.sh.txt'),
      'utf8',
    );
    expect(envelope).toContain('hermes-list-pending');
    expect(envelope).not.toContain('list-pending-access-requests');
  });

  it('pins private listing to the immutable production database identity', () => {
    expect(() => requireAccessRequestInspectionProductionTarget(
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    )).not.toThrow();
    expect(() => requireAccessRequestInspectionProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable.*identity/i);
    expect(() => requireAccessRequestInspectionProductionTarget('lookalike'))
      .toThrow(/immutable.*identity/i);
  });

  it('pins request reset and reconciliation to the immutable production identity', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireAccessRequestResetProductionTarget(identity)).not.toThrow();
    expect(() => requireAccessRequestResetProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable.*identity/i);
    expect(() => requireAccessRequestResetProductionTarget('lookalike'))
      .toThrow(/immutable.*identity/i);

    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const createPlan = source.indexOf('createReviewedAccessRequestResetPlan({');
    const writePlan = source.indexOf('writeReviewedAccessRequestResetPlan({ plan })');
    const readPlan = source.indexOf('readReviewedAccessRequestResetPlan({');
    const claimPlan = source.indexOf('claimReviewedAccessRequestResetPlan({');
    const submitReset = source.indexOf('connection.reducers.adminResetAccessRequestV1({');
    expect(createPlan).toBeGreaterThan(0);
    expect(writePlan).toBeGreaterThan(createPlan);
    expect(readPlan).toBeGreaterThan(0);
    expect(claimPlan).toBeGreaterThan(readPlan);
    expect(submitReset).toBeGreaterThan(claimPlan);
    expect(source).toContain('inspect-access-request-reset');
  });
});

describe('Hermes access request reset boundary', () => {
  const pending = {
    admissionState: 'disabled',
    authEpoch: 7,
    requestState: 'pending',
    requestCycle: 8n,
    requestedAtMicros: 1_720_000_000_000_000n,
  } as const;

  it('binds the CLI input flag to secret-only stdin and rejects environment fallback', () => {
    const result = runHermes([
      'reset-access-request', '123', 'non-sensitive reset audit', '--input-stdin', '--dry-run',
    ], {
      WARPKEEP_SPACETIMEDB_DATABASE:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    }, TEST_SECRET);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/refuses an administrator secret from the environment/i);
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });

  it('accepts only an exact, internally consistent admin-private CAS tuple', () => {
    expect(projectAccessRequestResetStatus(pending)).toEqual(pending);
    expect(projectAccessRequestResetStatus({
      admissionState: 'enabled',
      authEpoch: 7,
      requestState: 'not_requested',
      requestCycle: undefined,
      requestedAtMicros: undefined,
    })).toEqual({
      admissionState: 'enabled',
      authEpoch: 7,
      requestState: 'not_requested',
      requestCycle: undefined,
      requestedAtMicros: undefined,
    });
    for (const invalid of [
      { ...pending, token: 'must-not-escape' },
      { ...pending, authEpoch: 0 },
      { ...pending, admissionState: 'missing' },
      { ...pending, requestCycle: undefined },
      { ...pending, requestedAtMicros: undefined },
      { ...pending, requestCycle: 9n },
      { ...pending, requestState: 'resolved' },
    ]) {
      expect(() => projectAccessRequestResetStatus(invalid)).toThrow();
    }
  });

  it('permits only the exact admission/audit deltas and preserves every v4 aggregate', () => {
    const beforeV3 = foundedGenerationV3Status({
      enabledAllowedFids: 3n,
      auditEntries: 14n,
    });
    const beforeV4 = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    expect(() => verifyAccessRequestResetAggregatePreservation(
      beforeV3,
      { ...beforeV3, auditEntries: 15n },
      beforeV4,
      beforeV4,
      pending,
    )).not.toThrow();
    expect(() => verifyAccessRequestResetAggregatePreservation(
      beforeV3,
      { ...beforeV3, enabledAllowedFids: 2n, auditEntries: 15n },
      beforeV4,
      beforeV4,
      {
        admissionState: 'enabled',
        authEpoch: 7,
        requestState: 'not_requested',
        requestCycle: undefined,
        requestedAtMicros: undefined,
      },
    )).not.toThrow();
    expect(() => verifyAccessRequestResetAggregatePreservation(
      beforeV3,
      { ...beforeV3, playersV2: beforeV3.playersV2 + 1n, auditEntries: 15n },
      beforeV4,
      beforeV4,
      pending,
    )).toThrow(/unexpected persistent aggregate/i);
    expect(() => verifyAccessRequestResetAggregatePreservation(
      beforeV3,
      { ...beforeV3, auditEntries: 15n },
      beforeV4,
      { ...beforeV4, resourceAccounts: 2n },
      pending,
    )).toThrow(/resource state/i);
  });
});

describe('Hermes atomic profiled admission boundary', () => {
  const fid = 12_345n;

  function currentProfileEnvelope(includePfp = true) {
    const fields = [
      ['USER_DATA_TYPE_USERNAME', 'fixture.eth'],
      ['USER_DATA_TYPE_DISPLAY', 'Fixture Keeper'],
      ['USER_DATA_TYPE_BIO', 'Controlled public fixture'],
      ...(includePfp
        ? [['USER_DATA_TYPE_PFP', 'https://images.example/fixture.png']] as const
        : []),
    ];
    return {
      messages: fields.map(([type, value], index) => ({
        data: {
          type: 'MESSAGE_TYPE_USER_DATA_ADD',
          fid: Number(fid),
          timestamp: 10 + index,
          network: 'FARCASTER_NETWORK_MAINNET',
          userDataBody: { type, value },
        },
      })),
      nextPageToken: '',
    };
  }

  it('resolves exactly one complete profile through the pinned public source', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://rho.farcaster.xyz:3381');
      expect(url.pathname).toBe('/v1/userDataByFid');
      expect(url.searchParams.get('fid')).toBe(fid.toString());
      expect(init).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error' });
      return new Response(JSON.stringify(currentProfileEnvelope()), {
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(resolveAdmissionReadyFounderProfile(fid, fetchImpl)).resolves.toEqual({
      canonicalUsername: 'fixture.eth',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://images.example/fixture.png',
      publicBio: 'Controlled public fixture',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('binds new-founder resolution and reviewed plans to the admission-only source scope', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    expect(FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST).toMatch(/^[a-f0-9]{64}$/);
    expect(source).toContain(
      'trustedProfileTransportAttestation(TRUSTED_FOUNDER_ADMISSION_PURPOSE)',
    );
    expect(source).toContain(
      'source: { sourceId: TRUSTED_PRODUCTION_FOUNDER_ADMISSION_SOURCE_ID }',
    );
    expect(source).toContain('purpose: TRUSTED_FOUNDER_ADMISSION_PURPOSE');
    expect(source).not.toContain(
      ['alpha-0.3.3', 'current-founded-public-profiles'].join('-'),
    );
  });

  it('fails closed before admission when username or HTTPS PFP is unavailable', async () => {
    const missingPfp = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(currentProfileEnvelope(false)),
      { headers: { 'content-type': 'application/json' } },
    ));
    await expect(resolveAdmissionReadyFounderProfile(fid, missingPfp))
      .rejects.toThrow(/username and HTTPS profile image are required/i);

    const unsafePfpEnvelope = currentProfileEnvelope();
    const pfpMessage = unsafePfpEnvelope.messages.find(message => (
      message.data.userDataBody.type === 'USER_DATA_TYPE_PFP'
    ));
    if (pfpMessage) pfpMessage.data.userDataBody.value = 'http://localhost/private.png';
    const unsafePfp = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(unsafePfpEnvelope),
      { headers: { 'content-type': 'application/json' } },
    ));
    await expect(resolveAdmissionReadyFounderProfile(fid, unsafePfp))
      .rejects.toThrow(/username and HTTPS profile image are required/i);
  });

  it('renders a dry-run summary containing booleans and counts only', () => {
    const summary = admissionReadinessSummary({
      canonicalUsername: 'must-not-escape.eth',
      displayName: 'must-not-escape',
      pfpUrl: 'https://must-not-escape.example/pfp.png',
      publicBio: 'must-not-escape',
    });
    expect(summary).toEqual({
      ready: true,
      trustedSourcePinned: true,
      requiredFieldsPresent: 2,
      requiredFieldsExpected: 2,
      optionalFieldsPresent: 2,
      publicFieldsPresent: 4,
      credentialsAccessed: false,
      mutationSubmitted: false,
      dryRun: true,
    });
    expect(Object.values(summary).every(value => (
      typeof value === 'boolean' || typeof value === 'number'
    ))).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('must-not-escape');
    expect(JSON.stringify(summary)).not.toContain(fid.toString());
  });

  it('binds confirmed admission to a fresh post-notification request CAS', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const mainSource = source.slice(source.indexOf('async function main()'));
    const resolveForPlan = mainSource.indexOf(
      'await resolveAdmissionReadyFounderProfile(request.fid)',
    );
    const writePlan = mainSource.indexOf('writeReviewedFounderAdmissionPlan({');
    const readPlan = mainSource.indexOf('readReviewedFounderAdmissionPlan({');
    const readCredential = mainSource.indexOf('const secret = trustedLaunch?.adminSecretPath');
    const branch = mainSource.slice(
      mainSource.indexOf("command === 'admit-founder'", readCredential),
      mainSource.indexOf("command === 'allow-fid'", readCredential),
    );
    const initialTarget = branch.indexOf('adminGetAccessRequestAdmissionStatusV1({ fid })');
    const reconnect = branch.indexOf('await reconnectAfterAdmissionNotification({');
    const freshTarget = branch.indexOf(
      'adminGetAccessRequestAdmissionStatusV1({ fid })',
      initialTarget + 1,
    );
    const unchanged = branch.indexOf('requireUnchangedPendingAdmissionRequest(');
    const claimPlan = branch.indexOf('claimReviewedFounderAdmissionPlan({');
    const finalNotificationAuthority = branch.lastIndexOf(
      'await readNotificationPagesLiveAuthority(true, true);',
      claimPlan,
    );
    const submitAdmission = branch.indexOf(
      'connection.reducers.adminAdmitFounderForAccessRequestV2(',
    );
    const resolvedPostcondition = branch.indexOf(
      'verifyFounderAdmissionRequestPostcondition(',
    );
    expect(resolveForPlan).toBeGreaterThan(-1);
    expect(writePlan).toBeGreaterThan(resolveForPlan);
    expect(readPlan).toBeGreaterThan(writePlan);
    expect(readCredential).toBeGreaterThan(readPlan);
    expect(initialTarget).toBeGreaterThan(-1);
    expect(reconnect).toBeGreaterThan(initialTarget);
    expect(freshTarget).toBeGreaterThan(reconnect);
    expect(unchanged).toBeGreaterThan(reconnect);
    expect(claimPlan).toBeGreaterThan(freshTarget);
    expect(finalNotificationAuthority).toBeGreaterThan(freshTarget);
    expect(claimPlan).toBeGreaterThan(finalNotificationAuthority);
    expect(submitAdmission).toBeGreaterThan(claimPlan);
    expect(resolvedPostcondition).toBeGreaterThan(submitAdmission);
    expect(branch).not.toContain('adminAdmitFounderV1');
    expect(branch).not.toContain('adminGetFidAuthEpoch');
    expect(mainSource).not.toContain('resolveAdmissionReadyFounderProfile(fid)');

    const packageManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageManifest.scripts['stdb:admit-founder'])
      .toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
    expect(packageManifest.scripts['stdb:inspect-admission-notification'])
      .toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
    expect(packageManifest.scripts['stdb:recover-admission-notification'])
      .toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
    expect(packageManifest.scripts['stdb:notify-admitted']).toBeUndefined();
    expect(mainSource).not.toContain("| 'notify-admitted'");
  });

  it('uses the same fresh-state request-CAS order for founder re-enable', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const mainSource = source.slice(source.indexOf('async function main()'));
    const branch = mainSource.slice(
      mainSource.indexOf("command === 'allow-fid' && fid !== undefined"),
      mainSource.indexOf("command === 'disable-fid' && fid !== undefined"),
    );
    const initialTarget = branch.indexOf('adminGetAccessRequestAdmissionStatusV1({ fid })');
    const reconnect = branch.indexOf('await reconnectAfterAdmissionNotification({');
    const freshTarget = branch.indexOf(
      'adminGetAccessRequestAdmissionStatusV1({ fid })',
      initialTarget + 1,
    );
    const submit = branch.indexOf(
      'connection.reducers.adminAllowFidForAccessRequestV1(',
    );
    const finalNotificationAuthority = branch.lastIndexOf(
      'await readNotificationPagesLiveAuthority(true, true);',
      submit,
    );
    const resolvedTarget = branch.indexOf(
      'adminGetAccessRequestAdmissionStatusV1({ fid })',
      freshTarget + 1,
    );
    expect(initialTarget).toBeGreaterThan(-1);
    expect(reconnect).toBeGreaterThan(initialTarget);
    expect(freshTarget).toBeGreaterThan(reconnect);
    expect(submit).toBeGreaterThan(freshTarget);
    expect(finalNotificationAuthority).toBeGreaterThan(freshTarget);
    expect(submit).toBeGreaterThan(finalNotificationAuthority);
    expect(resolvedTarget).toBeGreaterThan(submit);
    expect(branch).not.toContain('adminAllowFid({');
  });

  it('locks both admission commands to the real mode-aware cutover procedures', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const helperSource = source.slice(
      source.indexOf('async function readGreaterRealmCutoverStatus('),
      source.indexOf('async function main()'),
    );
    expect(helperSource).toContain('adminGetGreaterRealmCutoverStatusV1({})');
    expect(helperSource).toContain('adminGetGreaterRealmReenableStatusV1({ fid })');
    expect(helperSource).toContain('selectFounderAdmissionAuthorityMode(cutover)');
    expect(helperSource).toContain('verifyGreaterRealmAdmissionPrecondition(cutover)');
    expect(helperSource).toContain('verifyGreaterRealmReenablePreconditionV1(');

    const mainSource = source.slice(source.indexOf('async function main()'));
    const operations = mainSource.slice(mainSource.indexOf('let mutationStatusHandled = false'));
    const admission = operations.slice(
      operations.indexOf("command === 'admit-founder'"),
      operations.indexOf("command === 'allow-fid' && fid !== undefined"),
    );
    const admissionInitial = admission.indexOf(
      'readFounderAdmissionAuthorityPrecondition(connection)',
    );
    const admissionReconnect = admission.indexOf('await reconnectAfterAdmissionNotification({');
    const admissionFresh = admission.indexOf(
      'readFounderAdmissionAuthorityPrecondition(connection)',
      admissionInitial + 1,
    );
    const admissionLock = admission.indexOf('requireUnchangedFounderAuthorityMode(');
    const admissionSubmit = admission.indexOf('adminAdmitFounderForAccessRequestV2(');
    const admissionPost = admission.indexOf(
      'verifyFounderAdmissionAuthorityPostcondition(connection, beforeAuthority)',
    );
    expect(admissionInitial).toBeGreaterThan(-1);
    expect(admissionReconnect).toBeGreaterThan(admissionInitial);
    expect(admissionFresh).toBeGreaterThan(admissionReconnect);
    expect(admissionLock).toBeGreaterThan(admissionFresh);
    expect(admissionSubmit).toBeGreaterThan(admissionLock);
    expect(admissionPost).toBeGreaterThan(admissionSubmit);

    const reenable = operations.slice(
      operations.indexOf("command === 'allow-fid' && fid !== undefined"),
      operations.indexOf("command === 'disable-fid' && fid !== undefined"),
    );
    const reenableInitial = reenable.indexOf('readFounderReenableAuthorityPrecondition(');
    const reenableReconnect = reenable.indexOf('await reconnectAfterAdmissionNotification({');
    const reenableFresh = reenable.indexOf(
      'readFounderReenableAuthorityPrecondition(',
      reenableInitial + 1,
    );
    const reenableLock = reenable.indexOf('requireUnchangedFounderAuthorityMode(');
    const reenableSubmit = reenable.indexOf('adminAllowFidForAccessRequestV1(');
    const reenablePost = reenable.indexOf('verifyFounderReenableAuthorityPostcondition(');
    expect(reenableInitial).toBeGreaterThan(-1);
    expect(reenableReconnect).toBeGreaterThan(reenableInitial);
    expect(reenableFresh).toBeGreaterThan(reenableReconnect);
    expect(reenableLock).toBeGreaterThan(reenableFresh);
    expect(reenableSubmit).toBeGreaterThan(reenableLock);
    expect(reenablePost).toBeGreaterThan(reenableSubmit);
  });

  it('keeps notification recovery as a reviewed, claim-before-send non-admission operation', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const mainSource = source.slice(source.indexOf('async function main()'));
    const operations = mainSource.slice(mainSource.indexOf('let mutationStatusHandled = false'));
    const recoveryBranchStart = operations.indexOf(
      "command === 'recover-admission-notification'",
    );
    const branch = operations.slice(
      recoveryBranchStart,
      operations.indexOf("command === 'inspect-access-request-reset'", recoveryBranchStart),
    );
    const targetBefore = branch.indexOf('adminGetAccessRequestAdmissionStatusV1({ fid })');
    const inspectBefore = branch.indexOf('await inspectAdmissionNotification(');
    const digestBefore = branch.indexOf('admissionNotificationRecoveryStateDigest(');
    const createPlan = branch.indexOf('createReviewedAdmissionNotificationRecoveryPlan({');
    const writePlan = branch.indexOf('writeReviewedAdmissionNotificationRecoveryPlan({');
    const claimPlan = branch.indexOf('claimReviewedAdmissionNotificationRecoveryPlan({');
    const finalNotificationAuthority = branch.lastIndexOf(
      'await readNotificationPagesLiveAuthority(true, true);',
      claimPlan,
    );
    const submitRecovery = branch.indexOf('await requestAdmissionNotificationRecovery(');
    const targetAfter = branch.indexOf(
      'adminGetAccessRequestAdmissionStatusV1({ fid })',
      targetBefore + 1,
    );
    expect(targetBefore).toBeGreaterThan(-1);
    expect(inspectBefore).toBeGreaterThan(targetBefore);
    expect(digestBefore).toBeGreaterThan(inspectBefore);
    expect(createPlan).toBeGreaterThan(digestBefore);
    expect(writePlan).toBeGreaterThan(createPlan);
    expect(finalNotificationAuthority).toBeGreaterThan(writePlan);
    expect(claimPlan).toBeGreaterThan(writePlan);
    expect(claimPlan).toBeGreaterThan(finalNotificationAuthority);
    expect(submitRecovery).toBeGreaterThan(claimPlan);
    expect(targetAfter).toBeGreaterThan(submitRecovery);
    expect(branch).not.toContain('connection.reducers.');
    expect(branch).toContain('admissionMutationSubmitted: false');
  });

  it('does not accept a founder identity or note in argv', () => {
    const result = runHermes(['admit-founder', fid.toString(), 'controlled fixture', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected number');
    expect(`${result.stdout}${result.stderr}`).not.toContain(fid.toString());
    expect(`${result.stdout}${result.stderr}`).not.toContain('controlled fixture');
  });

  it('rejects the retired post-admission notification command before credentials', () => {
    const result = runHermes(['notify-admitted', '123', '--confirm'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
      WARPKEEP_NOTIFICATION_OPERATOR_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: hermes-admin');
    expect(result.stdout).not.toContain('Warpkeep Hermes target');
  });

  it('does not let the legacy noninteractive switch authorize a new founder', () => {
    const result = runHermes(['admit-founder', '--input-stdin'], {
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exactly one of --dry-run or --confirm');
    expect(result.stderr).not.toContain('Farcaster');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });
});

describe('Hermes credential destination policy', () => {
  it('accepts the canonical name or its pinned immutable identity only', () => {
    const uri = 'https://maincloud.spacetimedb.com';
    const bridge = 'https://auth.warpkeep.com';
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-89e4u', bridge)).not.toThrow();
    expect(() => requireCredentialedProductionTarget(
      uri,
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      bridge,
    )).not.toThrow();
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-lookalike', bridge))
      .toThrow(/canonical Warpkeep production targets/i);
  });

  it('requires the immutable database identity for profiled founder admission', () => {
    expect(() => requireFounderAdmissionProductionTarget(
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    )).not.toThrow();
    expect(() => requireFounderAdmissionProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);
  });

  it('pins confirmed Alpha component activation to the immutable database identity', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireAlphaComponentActivationProductionTarget(identity)).not.toThrow();
    expect(() => requireAlphaComponentActivationProductionTarget('warpkeep-89e4u'))
      .toThrow(/Alpha component activation requires the immutable/i);
  });

  it.each([
    ['bridge', { WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example' }],
    ['SpacetimeDB origin', { WARPKEEP_SPACETIMEDB_URI: 'https://lookalike.example' }],
    ['database', { WARPKEEP_SPACETIMEDB_DATABASE: 'lookalike-db' }]
  ])('rejects a non-canonical %s before network use', (_label, overrides) => {
    const result = runHermes(['inspect-alpha', '--json'], overrides);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('require the canonical Warpkeep production targets');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });

  it('pins durable resource backfill to the immutable database identity before token acquisition', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireResourceBackfillProductionTarget(identity)).not.toThrow();
    expect(() => requireResourceBackfillProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);

    for (const database of [undefined, 'warpkeep-89e4u', 'warpkeep-lookalike']) {
      const result = runHermes(
        ['backfill-resources', '4', '--confirm'],
        { WARPKEEP_SPACETIMEDB_DATABASE: database },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('immutable Warpkeep production database identity');
      expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
      expect(`${result.stdout}${result.stderr}`).not.toContain('Could not reach');
    }
  }, 15_000);

  it('pins the persistent world expansion to the immutable database identity before token acquisition', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireGenesisExpansionProductionTarget(identity)).not.toThrow();
    expect(() => requireGenesisExpansionProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);

    for (const database of [undefined, 'warpkeep-89e4u', 'warpkeep-lookalike']) {
      const result = runHermes(
        ['expand-world-v3', '--confirm'],
        { WARPKEEP_SPACETIMEDB_DATABASE: database },
        undefined,
        15_000,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('immutable Warpkeep production database identity');
      expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
      expect(`${result.stdout}${result.stderr}`).not.toContain('Could not reach');
    }
  }, 60_000);

  it('allows custom targets only for a secret-free dry run', () => {
    const result = runHermes(
      ['allow-fid', '12345', 'test-only-note', '--dry-run', '--confirm'],
      {
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.example',
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun":true');
    expect(result.stdout).toContain('existing complete founder re-enable only');
    expect(result.stdout).toContain('"existingFounderReenableOnly":true');
    expect(result.stderr).toBe('');
  });

  it.each(['v2', 'v3', 'v4', 'v8', 'v10', 'v12'])('rejects misleading dry-run use on read-only protocol-%s inspection', (version) => {
    const result = runHermes([`inspect-alpha-${version}`, '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('flag that is invalid for this operation');
  });

  it('dry-runs each Alpha component without credentials and requires explicit confirmation', () => {
    for (const component of ['gold', 'forest', 'food', 'wood', 'water', 'stone']) {
      const result = runHermes(['seed-alpha-component', component, '--dry-run'], {
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"command":"seed-alpha-component"');
      expect(result.stdout).toContain(`"alphaComponent":"${component}"`);
      expect(result.stdout).toContain('"mutation":true');
      expect(result.stdout).toContain('"alphaStatusInspected":false');
      expect(result.stdout).toContain('"credentialsAccessed":false');
      expect(result.stdout).toContain('"mutationSubmitted":false');
      expect(result.stderr).toBe('');
    }
    const refused = runHermes(['seed-alpha-component', 'gold'], {
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
    });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('exactly one of --dry-run or --confirm');

    const water = runHermes(['activate-alpha-water', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(water.status).toBe(0);
    expect(water.stdout).toContain('"command":"activate-alpha-water"');
    expect(water.stdout).toContain('"credentialsAccessed":false');
    expect(water.stdout).toContain('"mutationSubmitted":false');
    expect(water.stderr).toBe('');
  }, 30_000);

  it('validates and dry-runs the resource backfill without credentials or network use', () => {
    const result = runHermes(['backfill-resources', '4', '--dry-run', '--confirm'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"backfill-resources"');
    expect(result.stdout).toContain('"expectedFounderCount":"4"');
    expect(result.stdout).toContain('"resourcePolicyVersion":"genesis-resource-yield-v1"');
    expect(result.stdout).toContain('"mutation":true');
    expect(result.stderr).toBe('');

    for (const count of ['0', '001', '101', '1000', '-1', '1e2']) {
      const rejected = runHermes(['backfill-resources', count, '--dry-run', '--confirm'], {
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
      });
      expect(rejected.status, count).toBe(1);
      expect(rejected.stderr, count).toContain('founder count from 1 to 100');
    }
  }, 15_000);

  it('dry-runs the exact world expansion without credentials or network use', () => {
    const result = runHermes(['expand-world-v3', '--dry-run', '--confirm'], {
      WARPKEEP_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"expand-world-v3"');
    expect(result.stdout).toContain('"expectedWorldTiles":"1261"');
    expect(result.stdout).toContain('"expectedWorldTileMeta":"1261"');
    expect(result.stdout).toContain('"expectedGenerationVersion":2');
    expect(result.stdout).toContain('"targetWorldTiles":"10000"');
    expect(result.stdout).toContain('"mutation":true');
    expect(result.stderr).toBe('');
  });

  it('does not let the legacy noninteractive switch authorize a resource backfill', () => {
    const result = runHermes(['backfill-resources', '4'], {
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing mutation without --confirm');
    expect(result.stdout).toContain('Warpkeep Hermes target');
    expect(result.stdout).not.toContain(TEST_SECRET);
  });

  it('does not let the legacy noninteractive switch authorize the world expansion', () => {
    const result = runHermes(['expand-world-v3'], {
      WARPKEEP_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing mutation without --confirm');
    expect(result.stdout).toContain('Warpkeep Hermes target');
    expect(result.stdout).not.toContain(TEST_SECRET);
    expect(result.stderr).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
  });

  it('rejects a weak admin secret before network use', () => {
    const result = runHermes(['inspect-alpha', '--json'], {
      WARPKEEP_ADMIN_TOKEN_SECRET: 'replace-me'
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must contain 32 to 512 bytes');
    expect(result.stdout).toBe('');
  });

  it('accepts only a bounded exact-JSON admin session and rejects redirects', async () => {
    vi.useFakeTimers();
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({
        token: 'header.payload.signature',
        tokenType: 'spacetime-access'
      }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    };
    let resolved = false;
    const request = requestAdminToken(
      'https://auth.warpkeep.com',
      TEST_SECRET,
      fetchImpl as typeof fetch,
      TEST_ADMIN_TOKEN_BUDGET,
    ).then(token => {
      resolved = true;
      return token;
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toBe('header.payload.signature');
  });

  it('queues admission notifications through a separate exact server-only contract', async () => {
    expect(readNotificationOperatorSecret(NOTIFICATION_SECRET)).toBe(NOTIFICATION_SECRET);
    expect(() => readNotificationOperatorSecret('replace-me')).toThrow(/32 to 512 bytes/i);

    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://auth.warpkeep.com/v1/admin/admission-notification');
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${NOTIFICATION_SECRET}`);
      expect(headers.has('origin')).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({ fid: '12345' });
      return Response.json({ status: 'queued' }, { status: 202 });
    });
    await expect(requestAdmissionNotification(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      fetchImpl,
    )).resolves.toBe('queued');

    const extraField = vi.fn<typeof fetch>(async () => Response.json({
      status: 'queued',
      token: 'must-not-be-accepted',
    }));
    await expect(requestAdmissionNotification(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      extraField,
    )).rejects.toThrow(/invalid response/i);

    const rejected = vi.fn<typeof fetch>(async () => Response.json(
      { error: { code: 'founder_not_admitted' } },
      { status: 409 },
    ));
    await expect(requestAdmissionNotification(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      rejected,
    )).rejects.toThrow(/rejected the request/i);
  });

  it('submits one reviewed recovery ID for one exact pending generation', async () => {
    const requestedAtMicros = 1_799_999_999_000_000n;
    const recoveryId = 'c'.repeat(32);
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        'https://auth.warpkeep.com/v1/admin/admission-notification-recovery',
      );
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${NOTIFICATION_SECRET}`);
      expect(headers.has('origin')).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({
        fid: '12345',
        requestedAtMicros: Number(requestedAtMicros),
        recoveryId,
      });
      return Response.json({ status: 'queued' }, { status: 202 });
    });
    await expect(requestAdmissionNotificationRecovery(
      'https://auth.warpkeep.com',
      12_345n,
      requestedAtMicros,
      recoveryId,
      NOTIFICATION_SECRET,
      fetchImpl,
    )).resolves.toBe('queued');

    await expect(requestAdmissionNotificationRecovery(
      'https://auth.warpkeep.com',
      12_345n,
      requestedAtMicros,
      'invalid',
      NOTIFICATION_SECRET,
      fetchImpl,
    )).rejects.toThrow(/authorization was invalid/i);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('permits recovery only for an exhausted unrecovered matching request', () => {
    const requestedAtMicros = 1_799_999_999_000_000n;
    const recoverable = projectAdmissionNotificationDiagnostics(
      admissionNotificationDiagnostics({
        status: 'delivery-exhausted',
        generation: 'pending-request',
        requestedAtMicros: Number(requestedAtMicros),
        subscribed: true,
      }),
    );
    expect(requireAdmissionNotificationRecoveryPrecondition(
      recoverable,
      requestedAtMicros,
    )).toEqual(recoverable);

    for (const candidate of [
      { ...recoverable, status: 'queued' as const },
      { ...recoverable, requestedAtMicros: Number(requestedAtMicros + 1n) },
      { ...recoverable, recoveryCount: 1, lastRecoveryAt: 1_800_000_000_000 },
    ]) {
      expect(() => requireAdmissionNotificationRecoveryPrecondition(
        candidate,
        requestedAtMicros,
      )).toThrow(/exact exhausted, unrecovered/i);
    }
    expect(() => requireAdmissionNotificationRecoveryPrecondition(
      projectAdmissionNotificationDiagnostics(admissionNotificationDiagnostics()),
      requestedAtMicros,
    )).toThrow(/not enabled.*remains blocked/i);
  });

  it('inspects only the allowlisted token-free per-FID notification state', async () => {
    const diagnostics = admissionNotificationDiagnostics({
      status: 'already-sent',
      generation: 'pending-request',
      requestedAtMicros: 1_799_999_999_000_000,
      deliveryAttemptCount: 1,
      retryReasons: ['transport'],
      lastAttemptAt: 1_800_000_000_000,
    });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        'https://auth.warpkeep.com/v1/admin/admission-notification-status',
      );
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${NOTIFICATION_SECRET}`);
      expect(headers.has('origin')).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({ fid: '12345' });
      return Response.json(diagnostics);
    });

    const result = await inspectAdmissionNotification(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      fetchImpl,
    );
    expect(result).toEqual(diagnostics);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.retryReasons)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(NOTIFICATION_SECRET);
  });

  it('rejects diagnostic secret or token fields without reflecting their values', async () => {
    const sentinel = 'PRIVATE_NOTIFICATION_TOKEN_MUST_NOT_ESCAPE';
    expect(() => projectAdmissionNotificationDiagnostics({
      ...admissionNotificationDiagnostics(),
      notificationToken: sentinel,
    })).toThrow(/invalid diagnostics/i);

    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      ...admissionNotificationDiagnostics(),
      token: sentinel,
    }));
    const inspection = inspectAdmissionNotification(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      fetchImpl,
    );
    await expect(inspection).rejects.toThrow(/invalid diagnostics/i);
    await expect(inspection).rejects.not.toThrow(new RegExp(sentinel));
  });

  it('pins token-free inspection to the canonical bridge before admin authority', () => {
    expect(() => requireAdmissionNotificationInspectionProductionTarget(
      'https://auth.warpkeep.com',
    )).not.toThrow();
    expect(() => requireAdmissionNotificationInspectionProductionTarget(
      'https://lookalike.example',
    )).toThrow(/canonical Warpkeep bridge/i);

    const result = runHermes(['inspect-admission-notification', '12345'], {
      WARPKEEP_NOTIFICATION_OPERATOR_SECRET: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: 'weak-admin-secret',
      WARPKEEP_SPACETIMEDB_DATABASE: 'INVALID_DATABASE',
      WARPKEEP_SPACETIMEDB_URI: 'http://invalid.example',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH');
    expect(result.stderr).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(result.stderr).not.toContain('WARPKEEP_SPACETIMEDB');
  });

  it('waits for provider acceptance before allowing an opted-in admission mutation', async () => {
    const sleep = vi.fn(async () => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let requestCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe(
        'https://auth.warpkeep.com/v1/admin/admission-notification',
      );
      requestCount += 1;
      return requestCount === 1
        ? Response.json({ status: 'queued' }, { status: 202 })
        : Response.json({ status: 'already-sent' });
    });

    await expect(requireNotificationBeforeAdmission(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      fetchImpl,
      sleep,
      vi.fn(async () => undefined),
    )).resolves.toBe('already-sent');

    expect(sleep).toHaveBeenCalledWith(35_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      admissionNotification: 'already-sent',
      providerAcceptanceRequired: true,
      providerAcceptedBeforeAdmission: true,
    }));
    log.mockRestore();
  });

  it('rechecks prepared release authority before a queued notification retry', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      status: 'queued',
    }, { status: 202 }));
    let authorityChecks = 0;
    const refreshNotificationAuthority = vi.fn(async () => {
      authorityChecks += 1;
      if (authorityChecks === 2) throw new Error('prepared receipt drifted');
    });

    await expect(requireNotificationBeforeAdmission(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      fetchImpl,
      sleep,
      refreshNotificationAuthority,
    )).rejects.toThrow('prepared receipt drifted');

    expect(refreshNotificationAuthority).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(35_000);
  });

  it('keeps no-consent, queued, and exhausted notification states pending', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const notSubscribed = vi.fn<typeof fetch>(async () => Response.json({
      status: 'not-subscribed',
    }));
    await expect(requireNotificationBeforeAdmission(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      notSubscribed,
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    )).rejects.toThrow(/notifications are not enabled.*remains pending/is);

    const queued = vi.fn<typeof fetch>(async () => Response.json({
      status: 'queued',
    }, { status: 202 }));
    await expect(requireNotificationBeforeAdmission(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      queued,
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    )).rejects.toThrow(/has not accepted.*remains unchanged/is);

    const exhausted = vi.fn<typeof fetch>(async () => Response.json({
      status: 'delivery-exhausted',
    }));
    await expect(requireNotificationBeforeAdmission(
      'https://auth.warpkeep.com',
      12_345n,
      NOTIFICATION_SECRET,
      exhausted,
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    )).rejects.toThrow(/delivery is exhausted/i);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('rejects wrong-media and chunked oversized admin responses generically', async () => {
    const wrongMedia = async () => new Response(JSON.stringify({
      token: 'header.payload.signature',
      tokenType: 'spacetime-access'
    }), { headers: { 'content-type': 'text/plain' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, wrongMedia as typeof fetch,
      TEST_ADMIN_TOKEN_BUDGET,
    )).rejects.toThrow('invalid response');

    const oversized = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
        controller.close();
      }
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, oversized as typeof fetch,
      TEST_ADMIN_TOKEN_BUDGET,
    )).rejects.toThrow('invalid response');

    const cancelFailure = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
      },
      cancel() {
        throw new Error('stream-cancel-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, cancelFailure as typeof fetch,
      TEST_ADMIN_TOKEN_BUDGET,
    )).rejects.toThrow('invalid response');

    const readFailure = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('stream-read-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, readFailure as typeof fetch,
      TEST_ADMIN_TOKEN_BUDGET,
    )).rejects.toThrow('invalid response');
  });

  it('disconnects a silent connection when the handshake deadline expires', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const pendingConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    const builder = {
      withUri: vi.fn(() => builder),
      withDatabaseName: vi.fn(() => builder),
      withToken: vi.fn(() => builder),
      onConnect: vi.fn(() => builder),
      onConnectError: vi.fn(() => builder),
      build: vi.fn(() => pendingConnection),
    };

    const connection = connect(
      'https://maincloud.spacetimedb.com',
      'warpkeep-89e4u',
      'header.payload.signature',
      () => builder as never,
    );
    const rejection = expect(connection).rejects.toThrow('Could not connect to the Warpkeep database.');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects first and mints fresh admin authority only after provider acceptance', async () => {
    const events: string[] = [];
    const disconnect = vi.fn(() => events.push('initial-disconnected'));
    const initialConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    let releaseNotification!: () => void;
    const waitForNotification = vi.fn(async () => {
      events.push('notification-wait-started');
      await new Promise<void>(resolvePromise => {
        releaseNotification = resolvePromise;
      });
      events.push('provider-accepted');
      return 'already-sent' as const;
    });
    const requestToken = vi.fn(async () => {
      events.push('fresh-token-minted');
      return 'fresh.header.signature';
    });
    const freshConnection = { disconnect: vi.fn(), isDisconnectRequested: false };
    const refreshNotificationAuthority = vi.fn(async () => {
      events.push('notification-authority-refreshed');
    });
    const connectToDatabase = vi.fn(async () => {
      events.push('fresh-connected');
      return freshConnection as never;
    });

    const reconnect = reconnectAfterAdmissionNotification({
      connection: initialConnection as never,
      bridgeUrl: 'https://auth.warpkeep.com',
      fid: 12_345n,
      notificationOperatorSecret: NOTIFICATION_SECRET,
      adminSecret: TEST_SECRET,
      uri: 'https://maincloud.spacetimedb.com',
      database: 'warpkeep-89e4u',
    }, {
      refreshNotificationAuthority,
      waitForNotification: waitForNotification as never,
      requestToken: requestToken as never,
      connectToDatabase: connectToDatabase as never,
    });

    expect(disconnect).toHaveBeenCalledOnce();
    expect(requestToken).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(waitForNotification).toHaveBeenCalledOnce();
    });
    releaseNotification();
    await expect(reconnect).resolves.toBe(freshConnection);
    expect(events).toEqual([
      'initial-disconnected',
      'notification-authority-refreshed',
      'notification-wait-started',
      'provider-accepted',
      'fresh-token-minted',
      'fresh-connected',
    ]);
    expect(refreshNotificationAuthority).toHaveBeenCalledOnce();
  });

  it('blocks notification and fresh database authority when prepared release evidence drifts', async () => {
    const disconnect = vi.fn();
    const initialConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    const waitForNotification = vi.fn();
    const requestToken = vi.fn();
    const connectToDatabase = vi.fn();
    await expect(reconnectAfterAdmissionNotification({
      connection: initialConnection as never,
      bridgeUrl: 'https://auth.warpkeep.com',
      fid: 12_345n,
      notificationOperatorSecret: NOTIFICATION_SECRET,
      adminSecret: TEST_SECRET,
      uri: 'https://maincloud.spacetimedb.com',
      database: 'warpkeep-89e4u',
    }, {
      refreshNotificationAuthority: vi.fn(async () => {
        throw new Error('prepared receipt expired');
      }),
      waitForNotification: waitForNotification as never,
      requestToken: requestToken as never,
      connectToDatabase: connectToDatabase as never,
    })).rejects.toThrow('prepared receipt expired');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(waitForNotification).not.toHaveBeenCalled();
    expect(requestToken).not.toHaveBeenCalled();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it('creates no fresh admin session when notification eligibility fails', async () => {
    const disconnect = vi.fn();
    const initialConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    const requestToken = vi.fn(async () => 'must-not-be-minted');
    const connectToDatabase = vi.fn();
    await expect(reconnectAfterAdmissionNotification({
      connection: initialConnection as never,
      bridgeUrl: 'https://auth.warpkeep.com',
      fid: 12_345n,
      notificationOperatorSecret: NOTIFICATION_SECRET,
      adminSecret: TEST_SECRET,
      uri: 'https://maincloud.spacetimedb.com',
      database: 'warpkeep-89e4u',
    }, {
      waitForNotification: vi.fn(async () => {
        throw new Error('notification not eligible');
      }) as never,
      refreshNotificationAuthority: vi.fn(async () => undefined),
      requestToken: requestToken as never,
      connectToDatabase: connectToDatabase as never,
    })).rejects.toThrow('notification not eligible');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(requestToken).not.toHaveBeenCalled();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it('clears the initial JWT before either admission command can wait', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const mainSource = source.slice(source.indexOf('async function main()'));
    const initialConnect = mainSource.indexOf('connection = await connect(uri, database, token)');
    const clearToken = mainSource.indexOf("token = '';", initialConnect);
    const firstReconnect = mainSource.indexOf('await reconnectAfterAdmissionNotification({');
    expect(initialConnect).toBeGreaterThan(-1);
    expect(clearToken).toBeGreaterThan(initialConnect);
    expect(firstReconnect).toBeGreaterThan(clearToken);
  });
});
