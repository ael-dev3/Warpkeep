import { describe, expect, it } from 'vitest';

import type {
  AdminGreaterRealmCutoverStatusV1,
  AdminGreaterRealmReenableStatusV1,
} from '../src/spacetime/module_bindings/types';
import {
  selectFounderAdmissionAuthorityMode,
  verifyGreaterRealmAdmissionPostcondition,
  verifyGreaterRealmAdmissionPrecondition,
  verifyGreaterRealmReenablePostconditionV1,
  verifyGreaterRealmReenablePreconditionV1,
  type FounderReenableTargetStatus,
} from '../scripts/founder-admission-authority';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const ROSTER_A = '0123456789abcdef';
const ROSTER_B = 'fedcba9876543210';

function greaterRealmStatus(
  overrides: Partial<AdminGreaterRealmCutoverStatusV1> = {},
): AdminGreaterRealmCutoverStatusV1 {
  return {
    importMutationsCompiled: false,
    activationMutationsCompiled: true,
    releaseRows: 1n,
    releasePresent: true,
    atlasId: 'greater-realm-v17',
    publicReleaseId: 'greater-realm-public-v17',
    sourceCommit: '1'.repeat(40),
    importEpoch: 1n,
    releaseState: 'active',
    verificationPhase: 'complete',
    verificationCursor: 0n,
    expectedReleaseSha256: SHA_A,
    releaseHeaderSha256: SHA_B,
    verificationDigest: 'sha256-v1:verified',
    expectedRegionCount: 6,
    expectedComponentCount: 6,
    expectedChunkCount: 6,
    expectedCellCount: 601,
    expectedSlotCount: 600,
    expectedResourceNodeCount: 12_000,
    componentExpectedCellCount: 600,
    componentExpectedSlotCount: 600,
    componentExpectedResourceNodeCount: 12_000,
    importedPassableCellCount: 600,
    verifiedComponentCount: 6,
    verifiedChunkCount: 6,
    verifiedCellCount: 601,
    verifiedSlotCount: 600,
    verifiedResourceNodeCount: 12_000,
    regionManifestRows: 6,
    componentRows: 6n,
    chunkRows: 6n,
    cellRows: 601n,
    slotRows: 600n,
    activeSlotRows: 600n,
    resourceNodeRows: 12_000n,
    activeResourceNodeRows: 12_000n,
    releaseImportsExact: true,
    releaseVerificationExact: true,
    releaseReady: false,
    activationRows: 1n,
    activationPresent: true,
    activationMode: 'active',
    everActive: true,
    topologySnapshotDigest: SHA_A,
    relocationPlanDigest: SHA_B,
    snapshotCastleDigest: SHA_C,
    snapshotWorkerDigest: SHA_A,
    snapshotResourceDigest: SHA_B,
    snapshotMarksDigest: SHA_C,
    snapshotInnerKeepDigest: SHA_A,
    snapshotScheduleDigest: SHA_B,
    snapshotCastleCount: 100,
    snapshotWorkerCount: 400,
    snapshotResourceAccountCount: 100,
    snapshotMarkAccountCount: 100,
    snapshotInnerKeepBuildingCount: 100,
    snapshotClaimCount: 100,
    snapshotOccupancyCount: 100,
    nextAllocationSequence: 599n,
    postCanaryFoundingCount: 499,
    postCanaryDispatchCount: 7,
    rollbackEligible: false,
    resumeEligible: false,
    legacyFoundingOpen: false,
    legacyJourneyDispatchOpen: false,
    castleCapacity: 600,
    currentFounderCount: 599,
    founderCapacityRemaining: 1,
    castleRows: 599n,
    greaterRealmClaimRows: 599n,
    greaterRealmOccupancyRows: 599n,
    plannedClaimRows: 0n,
    activeClaimRows: 599n,
    unknownClaimStateRows: 0n,
    relocatedClaimRows: 100n,
    foundedClaimRows: 499n,
    unknownClaimKindRows: 0n,
    legacyClaimRows: 0n,
    legacyOccupiedWorldTileRows: 0n,
    lowlandsFounderCount: 100,
    frostmereFounderCount: 100,
    sunscarFounderCount: 100,
    mirefenFounderCount: 100,
    stonewakeFounderCount: 100,
    emberwoodFounderCount: 99,
    unassignedRegionFounderCount: 0,
    profileRows: 599n,
    markAccountRows: 599n,
    resourceAccountRows: 599n,
    allowedFidRows: 599n,
    enabledAllowedFidRows: 598n,
    castleWorkerRows: 2_396n,
    idleCastleWorkerRows: 2_300n,
    nonIdleCastleWorkerRows: 96n,
    auditRows: 1_000n,
    legacyRealmRows: 1n,
    legacyRealmActive: false,
    atlasRows: 1n,
    atlasMode: 'active',
    atlasRevision: 1n,
    atlasCastleCapacity: 600,
    atlasVisibleRegionCount: 6,
    atlasVisibleCellCount: 601,
    atlasVisibleChunkCount: 6,
    visibleRegionRows: 6n,
    activeVisibleRegionRows: 6n,
    workerSystemV2Rows: 1n,
    workerSystemV2Mode: 'active',
    workerSystemV2RosterDigest: ROSTER_A,
    workerSystemV2CurrentCastleCount: 599,
    workerSystemV2CurrentWorkerCount: 2_396,
    workerSystemV1Rows: 1n,
    workerSystemV1Mode: 'active',
    workerSystemV1RosterDigest: ROSTER_A,
    workerSystemV1ExpectedCastleCount: 599,
    workerSystemV1ExpectedWorkerCount: 2_396,
    workerSystemV1LegacyDrainRequired: false,
    goldNodeOccupationRows: 1n,
    goldExpeditionRows: 1n,
    goldExpeditionScheduleRows: 1n,
    foodNodeOccupationRows: 2n,
    foodExpeditionRows: 2n,
    foodExpeditionScheduleRows: 2n,
    woodNodeOccupationRows: 3n,
    woodExpeditionRows: 3n,
    woodExpeditionScheduleRows: 3n,
    stoneNodeOccupationRows: 4n,
    stoneExpeditionRows: 4n,
    stoneExpeditionScheduleRows: 4n,
    workerAssignmentRows: 10n,
    workerNodeOccupationRows: 10n,
    workerAssignmentScheduleRows: 10n,
    currentWorldGraphApplicable: true,
    currentWorldGraphExact: true,
    currentWorldIntegrityViolationCount: 0,
    activeAdmissionEligible: true,
    ...overrides,
  };
}

function admittedStatus(
  before: AdminGreaterRealmCutoverStatusV1,
): AdminGreaterRealmCutoverStatusV1 {
  return greaterRealmStatus({
    ...before,
    nextAllocationSequence: before.nextAllocationSequence + 1n,
    postCanaryFoundingCount: before.postCanaryFoundingCount + 1,
    currentFounderCount: before.currentFounderCount + 1,
    founderCapacityRemaining: before.founderCapacityRemaining - 1,
    castleRows: before.castleRows + 1n,
    greaterRealmClaimRows: before.greaterRealmClaimRows + 1n,
    greaterRealmOccupancyRows: before.greaterRealmOccupancyRows + 1n,
    activeClaimRows: before.activeClaimRows + 1n,
    foundedClaimRows: before.foundedClaimRows + 1n,
    emberwoodFounderCount: before.emberwoodFounderCount + 1,
    profileRows: before.profileRows + 1n,
    markAccountRows: before.markAccountRows + 1n,
    resourceAccountRows: before.resourceAccountRows + 1n,
    allowedFidRows: before.allowedFidRows + 1n,
    enabledAllowedFidRows: before.enabledAllowedFidRows + 1n,
    castleWorkerRows: before.castleWorkerRows + 4n,
    idleCastleWorkerRows: before.idleCastleWorkerRows + 4n,
    auditRows: before.auditRows + 1n,
    workerSystemV2RosterDigest: ROSTER_B,
    workerSystemV2CurrentCastleCount: before.workerSystemV2CurrentCastleCount + 1,
    workerSystemV2CurrentWorkerCount: before.workerSystemV2CurrentWorkerCount + 4,
    workerSystemV1RosterDigest: ROSTER_B,
    workerSystemV1ExpectedCastleCount: before.workerSystemV1ExpectedCastleCount + 1,
    workerSystemV1ExpectedWorkerCount: before.workerSystemV1ExpectedWorkerCount + 4,
    activeAdmissionEligible: before.founderCapacityRemaining > 1,
  });
}

const disabledTarget: FounderReenableTargetStatus = Object.freeze({
  admissionState: 'disabled',
  authEpoch: 1,
  requestState: 'pending',
  requestCycle: 2n,
  requestedAtMicros: 1_800_000_000_000_000n,
});

function reenableProof(
  overrides: Partial<AdminGreaterRealmReenableStatusV1> = {},
): AdminGreaterRealmReenableStatusV1 {
  return {
    currentWorldGraphApplicable: true,
    targetFounderGraphExact: true,
    targetAllowedEnabled: false,
    targetAuthEpoch: disabledTarget.authEpoch,
    targetRequestCycle: disabledTarget.requestCycle,
    targetRequestedAtMicros: disabledTarget.requestedAtMicros,
    targetReenableEligible: true,
    ...overrides,
  };
}

describe('mode-aware founder admission authority', () => {
  it('selects only explicit legacy-open or applicable Greater Realm authority', () => {
    const active = greaterRealmStatus();
    expect(selectFounderAdmissionAuthorityMode(active)).toBe('greater-realm');
    expect(selectFounderAdmissionAuthorityMode(greaterRealmStatus({
      currentWorldGraphApplicable: false,
      currentWorldGraphExact: false,
      activeAdmissionEligible: false,
      legacyFoundingOpen: true,
    }))).toBe('legacy');
    expect(() => selectFounderAdmissionAuthorityMode(greaterRealmStatus({
      currentWorldGraphApplicable: false,
      currentWorldGraphExact: false,
      activeAdmissionEligible: false,
      legacyFoundingOpen: false,
    }))).toThrow(/closed/i);
    expect(() => selectFounderAdmissionAuthorityMode({
      ...active,
      unexpectedAuthority: true,
    } as AdminGreaterRealmCutoverStatusV1)).toThrow(/137-field ABI/i);
  });

  it('accepts an exact active 599-founder graph with disabled existing founders', () => {
    const before = greaterRealmStatus();
    const verified = verifyGreaterRealmAdmissionPrecondition(before);
    expect(verified).toEqual(before);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(before.enabledAllowedFidRows).toBeLessThan(before.allowedFidRows);
  });

  it.each([
    { currentWorldGraphExact: false, currentWorldIntegrityViolationCount: 1, activeAdmissionEligible: false },
    { activationMode: 'halted', activeAdmissionEligible: false },
    { releaseState: 'canary', activeAdmissionEligible: false },
    { atlasMode: 'halted', activeAdmissionEligible: false },
    { workerSystemV2Mode: 'canary', activeAdmissionEligible: false },
    { greaterRealmClaimRows: 598n },
    { greaterRealmOccupancyRows: 598n },
    { activeSlotRows: 599n },
    { legacyClaimRows: 1n },
    { enabledAllowedFidRows: 600n },
    { activeAdmissionEligible: false },
  ])('rejects a hostile or transitional new-founder checkpoint %#', overrides => {
    expect(() => verifyGreaterRealmAdmissionPrecondition(
      greaterRealmStatus(overrides),
    )).toThrow(/exact active 600-castle authority/i);
  });

  it.each([
    { importMutationsCompiled: false, activationMutationsCompiled: true, accepted: true },
    { importMutationsCompiled: false, activationMutationsCompiled: false, accepted: false },
    { importMutationsCompiled: true, activationMutationsCompiled: false, accepted: false },
    { importMutationsCompiled: true, activationMutationsCompiled: true, accepted: false },
  ])('requires the exact FT production mutation-gate posture %#', gates => {
    const verify = () => verifyGreaterRealmAdmissionPrecondition(greaterRealmStatus({
      importMutationsCompiled: gates.importMutationsCompiled,
      activationMutationsCompiled: gates.activationMutationsCompiled,
    }));
    if (gates.accepted) expect(verify).not.toThrow();
    else expect(verify).toThrow(/exact active 600-castle authority/i);
  });

  it('closes new founding at exact capacity without invalidating the current graph', () => {
    const full = admittedStatus(greaterRealmStatus());
    expect(full.currentWorldGraphExact).toBe(true);
    expect(full.activeAdmissionEligible).toBe(false);
    expect(() => verifyGreaterRealmAdmissionPrecondition(full)).toThrow(/exact active/i);
  });

  it('proves the exact 599-to-600 founder transition and one region allocation', () => {
    const before = greaterRealmStatus();
    const after = admittedStatus(before);
    expect(verifyGreaterRealmAdmissionPostcondition(after, before)).toEqual(after);
    expect(after.currentFounderCount).toBe(600);
    expect(after.founderCapacityRemaining).toBe(0);
    expect(after.auditRows).toBe(before.auditRows + 1n);
  });

  it.each([
    (after: AdminGreaterRealmCutoverStatusV1) => ({ ...after, auditRows: after.auditRows - 1n }),
    (after: AdminGreaterRealmCutoverStatusV1) => ({
      ...after,
      workerSystemV1RosterDigest: ROSTER_A,
      workerSystemV2RosterDigest: ROSTER_A,
    }),
    (after: AdminGreaterRealmCutoverStatusV1) => ({
      ...after,
      idleCastleWorkerRows: after.idleCastleWorkerRows - 1n,
      nonIdleCastleWorkerRows: after.nonIdleCastleWorkerRows + 1n,
    }),
    (after: AdminGreaterRealmCutoverStatusV1) => ({
      ...after,
      postCanaryDispatchCount: after.postCanaryDispatchCount + 1,
    }),
    (after: AdminGreaterRealmCutoverStatusV1) => ({
      ...after,
      goldExpeditionRows: after.goldExpeditionRows + 1n,
    }),
  ])('rejects an inexact or unrelated founder postflight %#', mutate => {
    const before = greaterRealmStatus();
    expect(() => verifyGreaterRealmAdmissionPostcondition(
      mutate(admittedStatus(before)),
      before,
    )).toThrow();
  });
});

describe('target-exact Greater Realm founder re-enable authority', () => {
  it('allows a disabled exact target even when the Realm is at capacity 600', () => {
    const full = admittedStatus(greaterRealmStatus());
    const checkpoint = verifyGreaterRealmReenablePreconditionV1(
      full,
      reenableProof(),
      disabledTarget,
    );
    expect(checkpoint.status.currentFounderCount).toBe(600);
    expect(checkpoint.status.activeAdmissionEligible).toBe(false);
    expect(checkpoint.targetProof.targetFounderGraphExact).toBe(true);
  });

  it.each([
    reenableProof({ targetFounderGraphExact: false, targetReenableEligible: false }),
    reenableProof({ targetReenableEligible: false }),
    reenableProof({ targetRequestCycle: 3n, targetReenableEligible: false }),
    reenableProof({ targetRequestedAtMicros: 1_800_000_000_000_001n, targetReenableEligible: false }),
    reenableProof({ targetAllowedEnabled: true, targetReenableEligible: false }),
  ])('rejects target proof bypass %#', proof => {
    expect(() => verifyGreaterRealmReenablePreconditionV1(
      admittedStatus(greaterRealmStatus()),
      proof,
      disabledTarget,
    )).toThrow(/exact disabled v17 founder request CAS/i);
  });

  it('rejects a count-only bypass when no disabled aggregate row exists', () => {
    const full = admittedStatus(greaterRealmStatus());
    expect(() => verifyGreaterRealmReenablePreconditionV1(
      greaterRealmStatus({ ...full, enabledAllowedFidRows: full.allowedFidRows }),
      reenableProof(),
      disabledTarget,
    )).toThrow(/exact disabled/i);
  });

  it('accepts only enabled +1, audit +1, and the exact resolved target proof', () => {
    const beforeStatus = admittedStatus(greaterRealmStatus());
    const before = verifyGreaterRealmReenablePreconditionV1(
      beforeStatus,
      reenableProof(),
      disabledTarget,
    );
    const afterStatus = greaterRealmStatus({
      ...beforeStatus,
      enabledAllowedFidRows: beforeStatus.enabledAllowedFidRows + 1n,
      auditRows: beforeStatus.auditRows + 1n,
    });
    const afterTarget: FounderReenableTargetStatus = Object.freeze({
      ...disabledTarget,
      admissionState: 'enabled',
      authEpoch: 2,
      requestState: 'resolved',
    });
    const afterProof = reenableProof({
      targetAllowedEnabled: true,
      targetAuthEpoch: 2,
      targetReenableEligible: false,
    });
    expect(() => verifyGreaterRealmReenablePostconditionV1(
      afterStatus,
      afterProof,
      afterTarget,
      before,
    )).not.toThrow();

    expect(() => verifyGreaterRealmReenablePostconditionV1(
      { ...afterStatus, auditRows: beforeStatus.auditRows },
      afterProof,
      afterTarget,
      before,
    )).toThrow(/exact target transition/i);
    expect(() => verifyGreaterRealmReenablePostconditionV1(
      { ...afterStatus, workerAssignmentRows: afterStatus.workerAssignmentRows + 1n },
      afterProof,
      afterTarget,
      before,
    )).toThrow(/unrelated aggregate/i);
    expect(() => verifyGreaterRealmReenablePostconditionV1(
      afterStatus,
      { ...afterProof, targetAllowedEnabled: false },
      afterTarget,
      before,
    )).toThrow(/exact target transition/i);
  });
});
