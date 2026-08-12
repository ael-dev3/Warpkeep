// @vitest-environment node

import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  digestGreaterRealmProductionCutoverStatus,
  executeGreaterRealmProductionRelocation,
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS,
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
  GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS,
  GreaterRealmProductionRelocationError,
  projectGreaterRealmProductionCutoverStatus,
  type GreaterRealmProductionCutoverStatus,
  type GreaterRealmProductionRelocationCommand,
} from '../scripts/greater-realm-production-relocation-core';
import { parseGreaterRealmProductionVerifierArguments } from '../scripts/greater-realm-production-verifier';
import { verifyGreaterRealmActiveProductionStatus } from '../scripts/greater-realm-production-verifier-core';
import {
  greaterRealmProductionRelocationOperatorTestSeams,
  parseGreaterRealmProductionRelocationArguments,
} from '../scripts/greater-realm-production-relocation-operator';
import { withGreaterRealmCutoverOperatorLock } from '../scripts/greater-realm-cutover-receipts';

const ATLAS_SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SOURCE_COMMIT = 'c'.repeat(40);
const DIGEST = 'd'.repeat(64);
const ATLAS_ID = 'GREATER_REALM_V1';
const PUBLIC_RELEASE_ID = 'GRR-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const EXPECTED_PROVENANCE = Object.freeze({
  expectedAtlasSourceCommit: ATLAS_SOURCE_COMMIT,
  expectedAtlasId: ATLAS_ID,
  expectedPublicReleaseId: PUBLIC_RELEASE_ID,
  expectedReleaseSha256: DIGEST,
  moduleSourceCommit: MODULE_SOURCE_COMMIT,
  assertCanStartWrite: () => undefined,
});

function readyStatus(founders = 100): GreaterRealmProductionCutoverStatus {
  const population = BigInt(founders);
  return Object.freeze({
    importMutationsCompiled: false,
    activationMutationsCompiled: true,
    releasePresent: true,
    releaseImportsExact: true,
    releaseVerificationExact: true,
    releaseReady: true,
    activationPresent: false,
    everActive: false,
    rollbackEligible: false,
    resumeEligible: false,
    legacyFoundingOpen: true,
    legacyJourneyDispatchOpen: true,
    legacyRealmActive: true,
    workerSystemV1LegacyDrainRequired: true,
    currentWorldGraphApplicable: false,
    currentWorldGraphExact: false,
    activeAdmissionEligible: false,
    atlasId: ATLAS_ID,
    publicReleaseId: PUBLIC_RELEASE_ID,
    sourceCommit: ATLAS_SOURCE_COMMIT,
    expectedReleaseSha256: DIGEST,
    releaseHeaderSha256: DIGEST,
    verificationDigest: DIGEST,
    topologySnapshotDigest: undefined,
    relocationPlanDigest: undefined,
    snapshotCastleDigest: undefined,
    snapshotWorkerDigest: undefined,
    snapshotResourceDigest: undefined,
    snapshotMarksDigest: undefined,
    snapshotInnerKeepDigest: undefined,
    snapshotScheduleDigest: undefined,
    workerSystemV2RosterDigest: undefined,
    workerSystemV1RosterDigest: DIGEST,
    importEpoch: 7n,
    atlasRevision: undefined,
    releaseState: 'ready',
    verificationPhase: 'complete',
    activationMode: 'absent',
    atlasMode: 'absent',
    workerSystemV2Mode: 'absent',
    workerSystemV1Mode: 'active',
    expectedRegionCount: 6,
    expectedComponentCount: 1,
    expectedChunkCount: 1,
    expectedCellCount: 12,
    expectedSlotCount: 600,
    expectedResourceNodeCount: 12_000,
    componentExpectedCellCount: 10,
    componentExpectedSlotCount: 600,
    componentExpectedResourceNodeCount: 12_000,
    importedPassableCellCount: 10,
    verifiedComponentCount: 1,
    verifiedChunkCount: 1,
    verifiedCellCount: 12,
    verifiedSlotCount: 600,
    verifiedResourceNodeCount: 12_000,
    regionManifestRows: 6,
    snapshotCastleCount: 0,
    snapshotWorkerCount: 0,
    snapshotResourceAccountCount: 0,
    snapshotMarkAccountCount: 0,
    snapshotInnerKeepBuildingCount: 0,
    snapshotClaimCount: 0,
    snapshotOccupancyCount: 0,
    postCanaryFoundingCount: 0,
    postCanaryDispatchCount: 0,
    castleCapacity: 600,
    currentFounderCount: founders,
    founderCapacityRemaining: 600 - founders,
    lowlandsFounderCount: 0,
    frostmereFounderCount: 0,
    sunscarFounderCount: 0,
    mirefenFounderCount: 0,
    stonewakeFounderCount: 0,
    emberwoodFounderCount: 0,
    unassignedRegionFounderCount: 0,
    atlasCastleCapacity: 0,
    atlasVisibleRegionCount: 0,
    atlasVisibleCellCount: 0,
    atlasVisibleChunkCount: 0,
    workerSystemV2CurrentCastleCount: 0,
    workerSystemV2CurrentWorkerCount: 0,
    workerSystemV1ExpectedCastleCount: founders,
    workerSystemV1ExpectedWorkerCount: founders * 4,
    currentWorldIntegrityViolationCount: 0,
    releaseRows: 1n,
    verificationCursor: 0n,
    componentRows: 1n,
    chunkRows: 1n,
    cellRows: 12n,
    slotRows: 600n,
    activeSlotRows: 0n,
    resourceNodeRows: 12_000n,
    activeResourceNodeRows: 0n,
    activationRows: 0n,
    nextAllocationSequence: 0n,
    castleRows: population,
    greaterRealmClaimRows: 0n,
    greaterRealmOccupancyRows: 0n,
    plannedClaimRows: 0n,
    activeClaimRows: 0n,
    unknownClaimStateRows: 0n,
    relocatedClaimRows: 0n,
    foundedClaimRows: 0n,
    unknownClaimKindRows: 0n,
    legacyClaimRows: population,
    legacyOccupiedWorldTileRows: population,
    profileRows: population,
    markAccountRows: population,
    resourceAccountRows: population,
    allowedFidRows: population,
    enabledAllowedFidRows: population,
    castleWorkerRows: population * 4n,
    idleCastleWorkerRows: population * 4n,
    nonIdleCastleWorkerRows: 0n,
    auditRows: population,
    legacyRealmRows: 1n,
    atlasRows: 0n,
    visibleRegionRows: 0n,
    activeVisibleRegionRows: 0n,
    workerSystemV2Rows: 0n,
    workerSystemV1Rows: 1n,
    goldNodeOccupationRows: 0n,
    goldExpeditionRows: 0n,
    goldExpeditionScheduleRows: 0n,
    foodNodeOccupationRows: 0n,
    foodExpeditionRows: 0n,
    foodExpeditionScheduleRows: 0n,
    woodNodeOccupationRows: 0n,
    woodExpeditionRows: 0n,
    woodExpeditionScheduleRows: 0n,
    stoneNodeOccupationRows: 0n,
    stoneExpeditionRows: 0n,
    stoneExpeditionScheduleRows: 0n,
    workerAssignmentRows: 0n,
    workerNodeOccupationRows: 0n,
    workerAssignmentScheduleRows: 0n,
  });
}

function activationStatus(
  mode: 'prepared' | 'draining' | 'frozen' | 'planned' | 'canary' | 'active' | 'halted' | 'rolled-back',
  founders = 100,
): GreaterRealmProductionCutoverStatus {
  const base = readyStatus(founders);
  const activationPresent = true;
  const planned = mode === 'planned';
  const publicGraph = mode === 'canary' || mode === 'active'
    || (mode === 'halted' && base.everActive);
  const everActive = mode === 'active';
  const rolledBack = mode === 'rolled-back';
  const haltedAfterActive = false;
  const releaseState = publicGraph ? mode : mode === 'halted' ? 'halted' : 'ready';
  return Object.freeze({
    ...base,
    activationPresent,
    activationRows: 1n,
    activationMode: mode,
    releaseState,
    releaseReady: releaseState === 'ready',
    everActive,
    rollbackEligible: !everActive && !rolledBack,
    resumeEligible: haltedAfterActive,
    legacyFoundingOpen: mode === 'prepared' || rolledBack,
    legacyJourneyDispatchOpen: mode === 'prepared' || rolledBack,
    topologySnapshotDigest: DIGEST,
    relocationPlanDigest: DIGEST,
    snapshotCastleDigest: DIGEST,
    snapshotWorkerDigest: DIGEST,
    snapshotResourceDigest: DIGEST,
    snapshotMarksDigest: DIGEST,
    snapshotInnerKeepDigest: DIGEST,
    snapshotScheduleDigest: DIGEST,
    snapshotCastleCount: founders,
    snapshotWorkerCount: founders * 4,
    snapshotResourceAccountCount: founders,
    snapshotMarkAccountCount: founders,
    snapshotInnerKeepBuildingCount: founders,
    nextAllocationSequence: planned || publicGraph ? BigInt(founders) : 0n,
    greaterRealmClaimRows: planned ? BigInt(founders) : 0n,
    plannedClaimRows: planned ? BigInt(founders) : 0n,
  });
}

function publicStatus(
  mode: 'canary' | 'active' | 'halted',
  founders = 100,
): GreaterRealmProductionCutoverStatus {
  const population = BigInt(founders);
  const relocatedFounders = Math.min(founders, 100);
  const base = activationStatus(mode === 'halted' ? 'active' : mode, founders);
  const active = mode === 'active';
  return Object.freeze({
    ...base,
    releaseState: mode,
    releaseReady: false,
    activationMode: mode,
    everActive: mode !== 'canary',
    rollbackEligible: mode === 'canary',
    resumeEligible: mode === 'halted',
    legacyFoundingOpen: false,
    legacyJourneyDispatchOpen: false,
    legacyRealmActive: false,
    currentWorldGraphApplicable: true,
    currentWorldGraphExact: true,
    activeAdmissionEligible: active && founders < 600,
    lowlandsFounderCount: Math.min(founders, 100),
    frostmereFounderCount: Math.min(Math.max(founders - 100, 0), 100),
    sunscarFounderCount: Math.min(Math.max(founders - 200, 0), 100),
    mirefenFounderCount: Math.min(Math.max(founders - 300, 0), 100),
    stonewakeFounderCount: Math.min(Math.max(founders - 400, 0), 100),
    emberwoodFounderCount: Math.min(Math.max(founders - 500, 0), 100),
    atlasCastleCapacity: 600,
    atlasVisibleRegionCount: 6,
    atlasVisibleCellCount: 12,
    atlasVisibleChunkCount: 1,
    workerSystemV2CurrentCastleCount: founders,
    workerSystemV2CurrentWorkerCount: founders * 4,
    atlasRevision: 1n,
    atlasMode: mode,
    workerSystemV2Mode: mode,
    workerSystemV2RosterDigest: DIGEST,
    snapshotCastleCount: relocatedFounders,
    snapshotWorkerCount: relocatedFounders * 4,
    snapshotResourceAccountCount: relocatedFounders,
    snapshotMarkAccountCount: relocatedFounders,
    snapshotInnerKeepBuildingCount: relocatedFounders,
    activeSlotRows: 600n,
    activeResourceNodeRows: 12_000n,
    greaterRealmClaimRows: population,
    greaterRealmOccupancyRows: population,
    plannedClaimRows: 0n,
    activeClaimRows: population,
    relocatedClaimRows: BigInt(relocatedFounders),
    foundedClaimRows: BigInt(founders - relocatedFounders),
    legacyClaimRows: 0n,
    legacyOccupiedWorldTileRows: 0n,
    atlasRows: 1n,
    visibleRegionRows: 6n,
    activeVisibleRegionRows: 6n,
    workerSystemV2Rows: 1n,
    postCanaryFoundingCount: founders - relocatedFounders,
    nextAllocationSequence: BigInt(founders),
  });
}

function rolledBackStatus(founders = 100): GreaterRealmProductionCutoverStatus {
  return Object.freeze({
    ...activationStatus('rolled-back', founders),
    rollbackEligible: false,
    snapshotClaimCount: 0,
    snapshotOccupancyCount: 0,
  });
}

function fakeTransport(
  before: GreaterRealmProductionCutoverStatus,
  after: GreaterRealmProductionCutoverStatus,
  throwAfterApply = false,
) {
  let current = before;
  const inspect = vi.fn(async () => ({ ...current }));
  const submit = vi.fn(async () => {
    current = { ...after, auditRows: before.auditRows + 1n };
    if (throwAfterApply) throw new Error('lost acknowledgement');
  });
  return { inspect, submit };
}

describe('production relocation phase operator', () => {
  const phases: readonly [
    Exclude<GreaterRealmProductionRelocationCommand, 'inspect'>,
    GreaterRealmProductionCutoverStatus,
    GreaterRealmProductionCutoverStatus,
  ][] = [
    ['prepare', readyStatus(), activationStatus('prepared')],
    ['begin-drain', activationStatus('prepared'), activationStatus('draining')],
    ['freeze', activationStatus('draining'), activationStatus('frozen')],
    ['plan', activationStatus('frozen'), activationStatus('planned')],
    ['canary', activationStatus('planned'), publicStatus('canary')],
    ['commit', publicStatus('canary'), publicStatus('active')],
    ['halt', publicStatus('active'), publicStatus('halted')],
    ['resume', publicStatus('halted'), publicStatus('active')],
    ['rollback', publicStatus('canary'), rolledBackStatus()],
  ];

  it('requires confirmation for every mutating relocation command', () => {
    expect(parseGreaterRealmProductionRelocationArguments(['inspect']))
      .toEqual({ command: 'inspect', confirmed: false });
    for (const command of Object.values(GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS)) {
      expect(command).toMatch(/^admin_/);
    }
    for (const command of [
      'prepare', 'begin-drain', 'freeze', 'plan', 'canary',
      'commit', 'halt', 'resume', 'rollback',
    ]) {
      expect(parseGreaterRealmProductionRelocationArguments([command, '--confirm']))
        .toEqual({ command, confirmed: true });
      expect(() => parseGreaterRealmProductionRelocationArguments([command]))
        .toThrowError('GREATER_REALM_PRODUCTION_RELOCATION_USAGE');
    }
  });

  it('stays synchronized with the frozen 137-field status projection', () => {
    const generatedTypes = readFileSync(new URL(
      '../src/spacetime/module_bindings/types.ts',
      import.meta.url,
    ), 'utf8');
    const body = generatedTypes.match(
      /export const AdminGreaterRealmCutoverStatusV1 = __t\.object\([^,]+, \{([\s\S]*?)\n\}\);/u,
    )?.[1];
    expect(body).toBeDefined();
    const generatedFields = [...body!.matchAll(/^  ([A-Za-z0-9]+):/gmu)]
      .map(match => match[1]!);
    expect(GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS).toHaveLength(137);
    expect(generatedFields).toHaveLength(137);
    expect(generatedFields.indexOf('auditRows') + 1).toBe(96);
    expect([...GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS].sort())
      .toEqual([...generatedFields].sort());
    expect(Object.keys(readyStatus()).sort()).toEqual(
      [...GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS].sort(),
    );
    expect(projectGreaterRealmProductionCutoverStatus(readyStatus())).toEqual(readyStatus());
  });

  it('pins the generated cutover procedure wire spelling to its registered source', () => {
    const generatedIndex = readFileSync(new URL(
      '../src/spacetime/module_bindings/index.ts',
      import.meta.url,
    ), 'utf8');
    const generatedProcedure = readFileSync(new URL(
      '../src/spacetime/module_bindings/admin_get_greater_realm_cutover_status_v_1_procedure.ts',
      import.meta.url,
    ), 'utf8');
    const serverSource = readFileSync(new URL(
      '../spacetimedb/src/reducers/greaterRealmCutover.ts',
      import.meta.url,
    ), 'utf8');
    expect(GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE).toBe(
      'admin_get_greater_realm_cutover_status_v_1',
    );
    expect(generatedIndex.match(
      /__procedureSchema\("admin_get_greater_realm_cutover_status_v_1"/gu,
    )).toHaveLength(1);
    expect(generatedIndex.match(
      /"\.\/admin_get_greater_realm_cutover_status_v_1_procedure"/gu,
    )).toHaveLength(1);
    expect(generatedProcedure).toContain('AdminGreaterRealmCutoverStatusV1');
    expect(serverSource.match(
      /name: 'admin_get_greater_realm_cutover_status_v1'/gu,
    )).toHaveLength(1);
  });

  it('treats component cells as passable while preserving the larger total-cell count', () => {
    expect(projectGreaterRealmProductionCutoverStatus(readyStatus())).toMatchObject({
      expectedCellCount: 12,
      componentExpectedCellCount: 10,
      importedPassableCellCount: 10,
    });
    expect(() => projectGreaterRealmProductionCutoverStatus({
      ...readyStatus(),
      componentExpectedCellCount: 12,
    })).toThrowError('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVARIANT_FAILED');
    expect(() => projectGreaterRealmProductionCutoverStatus({
      ...readyStatus(),
      componentExpectedCellCount: 13,
      importedPassableCellCount: 13,
    })).toThrowError('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVARIANT_FAILED');
  });

  it.each(phases)('executes %s with two preflight reads, zero arguments, and a postflight read', async (
    command,
    before,
    after,
  ) => {
    const transport = fakeTransport(before, after);
    const result = await executeGreaterRealmProductionRelocation({
      command,
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      transport,
    });
    expect(result.outcome).toBe('verified');
    expect(result.afterMode).toBe(after.activationMode);
    expect(result).toMatchObject({
      atlasSourceCommit: ATLAS_SOURCE_COMMIT,
      atlasId: ATLAS_ID,
      publicReleaseId: PUBLIC_RELEASE_ID,
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      auditRowsDelta: '1',
    });
    expect(transport.inspect).toHaveBeenCalledTimes(3);
    expect(transport.submit).toHaveBeenCalledWith(
      GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS[command],
      {},
      expect.any(Function),
    );
  });

  it('reconciles an ambiguous acknowledgement only after the exact postcondition', async () => {
    const transport = fakeTransport(publicStatus('canary'), publicStatus('active'), true);
    const result = await executeGreaterRealmProductionRelocation({
      command: 'commit',
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      transport,
    });
    expect(result.outcome).toBe('verified-after-submission-error');
    expect(result.submitted).toBe(true);
    expect(transport.submit).toHaveBeenCalledTimes(1);
  });

  it('refuses a relocation write when the lock permit closes after final preflight', async () => {
    const transport = fakeTransport(activationStatus('prepared'), activationStatus('draining'));
    const assertCanStartWrite = vi.fn(() => {
      throw new Error('GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGINT');
    });
    await expect(executeGreaterRealmProductionRelocation({
      command: 'begin-drain',
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      assertCanStartWrite,
      transport,
    })).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGINT/);
    expect(assertCanStartWrite).toHaveBeenCalledTimes(1);
    expect(transport.inspect).toHaveBeenCalledTimes(2);
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('never attributes a hostile concurrent advance after a rejected write permit', async () => {
    const directory = mkdtempSync('/private/tmp/warpkeep-gr-relocation-signal-');
    chmodSync(directory, 0o700);
    let remote = activationStatus('prepared');
    const hostileAdvance = activationStatus('draining');
    const reducer = vi.fn(async () => undefined);
    const inspect = vi.fn(async () => ({ ...remote }));
    const submit = vi.fn(async (
      _reducer: string,
      _arguments: Readonly<Record<never, never>>,
      assertCanStartWrite: () => void,
    ) => {
      process.emit('SIGTERM');
      try {
        assertCanStartWrite();
      } catch (error) {
        // Model an unrelated actor advancing remote state after this operator's
        // permit rejection. The local driver must not reconcile it as its own.
        remote = hostileAdvance;
        throw error;
      }
      await reducer();
    });
    let receiptWritten = false;
    try {
      await expect(withGreaterRealmCutoverOperatorLock({
        directory,
        repositoryRoot: process.cwd(),
        operation: async control => {
          await executeGreaterRealmProductionRelocation({
            command: 'begin-drain',
            confirmed: true,
            ...EXPECTED_PROVENANCE,
            assertCanStartWrite: control.assertCanStartWrite,
            transport: { inspect, submit },
          });
          receiptWritten = true;
        },
      })).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGTERM/);
      expect(reducer).not.toHaveBeenCalled();
      expect(receiptWritten).toBe(false);
      expect(inspect).toHaveBeenCalledTimes(2);
      expect(remote.activationMode).toBe('draining');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not submit or append an audit row for an already-satisfied retry', async () => {
    const status = publicStatus('active');
    const transport = fakeTransport(status, status);
    const result = await executeGreaterRealmProductionRelocation({
      command: 'commit',
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      transport,
    });
    expect(result).toMatchObject({
      outcome: 'already-satisfied',
      submitted: false,
      auditRowsBefore: status.auditRows.toString(),
      auditRowsAfter: status.auditRows.toString(),
      auditRowsDelta: '0',
    });
    expect(transport.inspect).toHaveBeenCalledTimes(1);
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('requires exactly one audit row for a real transition and digests the delta', async () => {
    const before = publicStatus('canary');
    const afterWithoutAudit = publicStatus('active');
    let current = before;
    const transport = {
      inspect: vi.fn(async () => ({ ...current })),
      submit: vi.fn(async () => { current = afterWithoutAudit; }),
    };
    await expect(executeGreaterRealmProductionRelocation({
      command: 'commit',
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      transport,
    })).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_RELOCATION_AUDIT_DELTA_INVALID',
      submitted: true,
    });
    expect(digestGreaterRealmProductionCutoverStatus(before)).not.toBe(
      digestGreaterRealmProductionCutoverStatus({
        ...before,
        auditRows: before.auditRows + 1n,
      }),
    );
  });

  it('fails before a write on drift, missing confirmation, or source mismatch', async () => {
    const before = activationStatus('prepared');
    const drifted = activationStatus('draining');
    const inspect = vi.fn()
      .mockResolvedValueOnce({ ...before })
      .mockResolvedValueOnce({ ...drifted });
    const submit = vi.fn();
    await expect(executeGreaterRealmProductionRelocation({
      command: 'begin-drain',
      confirmed: true,
      ...EXPECTED_PROVENANCE,
      transport: { inspect, submit },
    })).rejects.toMatchObject({ code: 'GREATER_REALM_PRODUCTION_RELOCATION_PREWRITE_STATUS_CHANGED' });
    await expect(executeGreaterRealmProductionRelocation({
      command: 'begin-drain',
      confirmed: false,
      ...EXPECTED_PROVENANCE,
      transport: { inspect, submit },
    })).rejects.toMatchObject({ code: 'GREATER_REALM_PRODUCTION_RELOCATION_CONFIRMATION_REQUIRED' });
    await expect(executeGreaterRealmProductionRelocation({
      command: 'inspect',
      confirmed: false,
      ...EXPECTED_PROVENANCE,
      expectedAtlasSourceCommit: 'e'.repeat(40),
      transport: fakeTransport(readyStatus(), readyStatus()),
    })).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_RELOCATION_ATLAS_RELEASE_MISMATCH',
    });
    await expect(executeGreaterRealmProductionRelocation({
      command: 'inspect',
      confirmed: false,
      ...EXPECTED_PROVENANCE,
      expectedPublicReleaseId: 'GRR-ZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      transport: fakeTransport(readyStatus(), readyStatus()),
    })).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_RELOCATION_ATLAS_RELEASE_MISMATCH',
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('fails closed on projection growth and on a non-applied ambiguous submission', async () => {
    expect(() => projectGreaterRealmProductionCutoverStatus({
      ...readyStatus(),
      actor: 'private',
    })).toThrowError('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_SHAPE_CHANGED');

    const status = publicStatus('canary');
    const transport = {
      inspect: vi.fn(async () => ({ ...status })),
      submit: vi.fn(async () => { throw new Error('not applied'); }),
    };
    let caught: unknown;
    try {
      await executeGreaterRealmProductionRelocation({
        command: 'commit',
        confirmed: true,
        ...EXPECTED_PROVENANCE,
        transport,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GreaterRealmProductionRelocationError);
    expect(caught).toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_RELOCATION_AUDIT_DELTA_INVALID',
      submitted: true,
    });
  });

  it('accepts exact active admission state through founder 599 and closes it at 600', () => {
    expect(projectGreaterRealmProductionCutoverStatus(publicStatus('active', 599))
      .activeAdmissionEligible).toBe(true);
    expect(projectGreaterRealmProductionCutoverStatus(publicStatus('active', 600))
      .activeAdmissionEligible).toBe(false);
    expect(projectGreaterRealmProductionCutoverStatus({
      ...publicStatus('active', 599),
      enabledAllowedFidRows: 598n,
    }).activeAdmissionEligible).toBe(true);
  });

  it('verifies the complete active production aggregate through exact capacity 600', () => {
    expect(verifyGreaterRealmActiveProductionStatus({
      value: publicStatus('active', 599),
      expectedFounderCount: 599,
      ...EXPECTED_PROVENANCE,
    })).toMatchObject({
      atlasSourceCommit: ATLAS_SOURCE_COMMIT,
      atlasId: ATLAS_ID,
      publicReleaseId: PUBLIC_RELEASE_ID,
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      expectedFounderCount: 599,
      founderCapacityRemaining: 1,
      admissionState: 'open',
      activeClaimRows: '599',
      occupancyRows: '599',
    });
    expect(verifyGreaterRealmActiveProductionStatus({
      value: publicStatus('active', 600),
      expectedFounderCount: 600,
      ...EXPECTED_PROVENANCE,
    })).toMatchObject({
      expectedFounderCount: 600,
      founderCapacityRemaining: 0,
      admissionState: 'at-capacity',
      activeClaimRows: '600',
      occupancyRows: '600',
    });
  });

  it('fails the active verifier on expectation, commit, or roster drift', () => {
    expect(() => verifyGreaterRealmActiveProductionStatus({
      value: publicStatus('active', 600),
      expectedFounderCount: 599,
      ...EXPECTED_PROVENANCE,
    })).toThrowError('GREATER_REALM_PRODUCTION_VERIFIER_ACTIVE_GRAPH_INVALID');
    expect(() => verifyGreaterRealmActiveProductionStatus({
      value: publicStatus('active'),
      expectedFounderCount: 100,
      ...EXPECTED_PROVENANCE,
      expectedAtlasSourceCommit: 'e'.repeat(40),
    })).toThrowError('GREATER_REALM_PRODUCTION_VERIFIER_ATLAS_RELEASE_MISMATCH');
    expect(() => verifyGreaterRealmActiveProductionStatus({
      value: publicStatus('active'),
      expectedFounderCount: 100,
      ...EXPECTED_PROVENANCE,
      expectedPublicReleaseId: 'GRR-ZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    })).toThrowError('GREATER_REALM_PRODUCTION_VERIFIER_ATLAS_RELEASE_MISMATCH');
    expect(() => verifyGreaterRealmActiveProductionStatus({
      value: { ...publicStatus('active'), workerSystemV1RosterDigest: 'e'.repeat(64) },
      expectedFounderCount: 100,
      ...EXPECTED_PROVENANCE,
    })).toThrowError('GREATER_REALM_PRODUCTION_VERIFIER_ACTIVE_GRAPH_INVALID');
  });

  it('accepts only a canonical explicit 1..600 verifier count', () => {
    expect(parseGreaterRealmProductionVerifierArguments([
      '--expected-founder-count=600',
    ])).toEqual({ expectedFounderCount: 600 });
    for (const value of ['0', '0600', '601', '+1', '1.0']) {
      expect(() => parseGreaterRealmProductionVerifierArguments([
        `--expected-founder-count=${value}`,
      ])).toThrowError('GREATER_REALM_PRODUCTION_VERIFIER_FOUNDER_COUNT_INVALID');
    }
  });

  it('reconstructs the exact relocation receipt from durable before/after context and retains a resume driver', () => {
    const before = readyStatus();
    const after = { ...activationStatus('prepared'), auditRows: before.auditRows + 1n };
    const receiptStatus = (status: GreaterRealmProductionCutoverStatus) => Object.freeze({
      activationMode: status.activationMode,
      releaseState: status.releaseState,
      currentFounderCount: status.currentFounderCount,
      founderCapacityRemaining: status.founderCapacityRemaining,
      activeClaimRows: status.activeClaimRows.toString(),
      greaterRealmOccupancyRows: status.greaterRealmOccupancyRows.toString(),
      legacyClaimRows: status.legacyClaimRows.toString(),
      auditRows: status.auditRows.toString(),
      activeAdmissionEligible: status.activeAdmissionEligible,
      topologySnapshotDigest: status.topologySnapshotDigest ?? null,
      relocationPlanDigest: status.relocationPlanDigest ?? null,
      statusDigest: digestGreaterRealmProductionCutoverStatus(status),
    });
    const result = greaterRealmProductionRelocationOperatorTestSeams
      .reconstructRecoveredRelocationReceipt({
        command: Object.freeze({ kind: 'relocation', name: 'prepare' }),
        sourceRelease: Object.freeze({
          atlasSourceCommit: ATLAS_SOURCE_COMMIT,
          moduleSourceCommit: MODULE_SOURCE_COMMIT,
          atlasId: ATLAS_ID,
          publicReleaseId: PUBLIC_RELEASE_ID,
          expectedReleaseSha256: DIGEST,
        }),
        beforeStatus: receiptStatus(before),
        beforeAudit: Object.freeze({ auditRows: before.auditRows.toString() }),
        afterStatus: receiptStatus(after),
        afterAudit: Object.freeze({ auditRows: after.auditRows.toString() }),
        operations: Object.freeze([Object.freeze({
          operationOrdinal: 1,
          planDigest: '1'.repeat(64),
          operation: Object.freeze({
            kind: 'reducer',
            name: GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS.prepare,
            argumentsDigest: '2'.repeat(64),
            argumentsByteLength: 2,
            argumentsRedacted: true,
            identity: Object.freeze({
              reducer: GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS.prepare,
              command: 'prepare',
            }),
          }),
          beforeStatus: Object.freeze({}), beforeAudit: Object.freeze({}),
          afterStatus: Object.freeze({}), afterAudit: Object.freeze({}),
          outcome: 'recovered-after-owner-death',
          completionReceiptDigest: '3'.repeat(64),
        })]),
        operationReceiptChainDigest: '3'.repeat(64),
        operationReceiptCount: 1,
        outcome: 'recovered-after-owner-death',
      });
    expect(result.record).toMatchObject({
      command: 'prepare',
      reducer: GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS.prepare,
      outcome: 'verified-after-submission-error',
      submitted: true,
      beforeMode: before.activationMode,
      afterMode: after.activationMode,
      auditRowsDelta: '1',
      statusDigest: digestGreaterRealmProductionCutoverStatus(after),
    });
    const source = readFileSync(new URL(
      '../scripts/greater-realm-production-relocation-operator.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).toMatch(/resumeCommand:\s*async resumed[\s\S]*operationJournal:/u);
  });
});
