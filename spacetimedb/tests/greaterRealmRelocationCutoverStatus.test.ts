import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED, GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED } from '../src/greaterRealmV17Policy';
import { attestCurrentGreaterRealmGateModeForTest } from './greaterRealmGateModeTestPolicy';
import { Fixture, GREATER_REALM_CUTOVER_AUDIT_NOTE_V1, NOW, addOnePostCommitFounder, advanceToActive, advanceToPlanned, beginGreaterRealmDrainAuthorizedTransactionV1, commitGreaterRealmActiveAuthorizedTransactionV1, errorCode, freezeGreaterRealmActivationAuthorizedTransactionV1, haltGreaterRealmActivationAuthorizedTransactionV1, planGreaterRealmRelocationAuthorizedTransactionV1, prepareGreaterRealmActivationAuthorizedTransactionV1, projectGreaterRealmCutoverStatusV1, projectGreaterRealmReenableStatusV1, relocateGreaterRealmCanaryAuthorizedTransactionV1, resumeGreaterRealmActiveAuthorizedTransactionV1, rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1, runGreaterRealmCutoverTransitionWithAuditV1, stateText } from './greaterRealmRelocationTestSupport';



test('the bounded cutover status tracks every production phase and admission boundary', () => {
  const fixture = new Fixture();
  let status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseState, 'ready');
  assert.equal(status.activationMode, 'absent');
  assert.equal(status.releaseImportsExact, true);
  assert.equal(status.releaseVerificationExact, true);
  assert.equal(status.expectedCellCount, 601);
  assert.equal(status.importedPassableCellCount, 600);
  assert.equal(status.componentExpectedCellCount, 600);
  assert.equal(
    status.activationMutationsCompiled,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  assert.equal(status.currentFounderCount, 100);
  assert.equal(status.founderCapacityRemaining, 500);
  assert.equal(status.legacyClaimRows, 100n);
  assert.equal(status.legacyOccupiedWorldTileRows, 100n);
  assert.equal(status.activeSlotRows, 0n);
  assert.equal(status.activeResourceNodeRows, 0n);
  assert.equal(status.auditRows, 1n);
  assert.equal(status.legacyFoundingOpen, true);
  assert.equal(status.currentWorldGraphApplicable, false);
  assert.equal(status.activeAdmissionEligible, false);

  assert.equal(
    prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
    'prepared',
  );
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'prepared');
  assert.equal(status.rollbackEligible, true);
  assert.equal(status.legacyFoundingOpen, true);

  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'draining');
  assert.equal(status.legacyFoundingOpen, false);
  assert.equal(status.legacyJourneyDispatchOpen, false);

  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'planned');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'planned');
  assert.equal(status.plannedClaimRows, 100n);
  assert.equal(status.activeClaimRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, false);

  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseState, 'canary');
  assert.equal(status.activationMode, 'canary');
  assert.equal(status.atlasMode, 'canary');
  assert.equal(status.workerSystemV2Mode, 'canary');
  assert.equal(status.legacyRealmActive, false);
  assert.equal(status.legacyClaimRows, 0n);
  assert.equal(status.legacyOccupiedWorldTileRows, 0n);
  assert.equal(status.greaterRealmClaimRows, 100n);
  assert.equal(status.greaterRealmOccupancyRows, 100n);
  assert.equal(status.activeSlotRows, 600n);
  assert.equal(status.activeResourceNodeRows, 12_000n);
  assert.equal(status.relocatedClaimRows, 100n);
  assert.equal(status.foundedClaimRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, true);
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.currentWorldIntegrityViolationCount, 0);
  assert.equal(status.rollbackEligible, true);
  assert.equal(status.activeAdmissionEligible, false);
  assert.equal(
    status.lowlandsFounderCount
      + status.frostmereFounderCount
      + status.sunscarFounderCount
      + status.mirefenFounderCount
      + status.stonewakeFounderCount
      + status.emberwoodFounderCount,
    100,
  );
  for (const journeyField of [
    'goldNodeOccupationRows',
    'goldExpeditionRows',
    'goldExpeditionScheduleRows',
    'foodNodeOccupationRows',
    'foodExpeditionRows',
    'foodExpeditionScheduleRows',
    'woodNodeOccupationRows',
    'woodExpeditionRows',
    'woodExpeditionScheduleRows',
    'stoneNodeOccupationRows',
    'stoneExpeditionRows',
    'stoneExpeditionScheduleRows',
    'workerAssignmentRows',
    'workerNodeOccupationRows',
    'workerAssignmentScheduleRows',
  ] as const) assert.equal(status[journeyField], 0n, journeyField);

  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'active');
  assert.equal(status.everActive, true);
  assert.equal(status.rollbackEligible, false);
  assert.equal(status.resumeEligible, false);
  assert.equal(status.activeAdmissionEligible, true);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'halted');
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.resumeEligible, true);
  assert.equal(status.activeAdmissionEligible, false);

  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.activationMode, 'active');
  assert.equal(status.activeAdmissionEligible, true);

  fixture.tables.greaterRealmReleaseV1.rows[0]!.verifiedSlotCount = 599;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, true);
  assert.equal(status.releaseVerificationExact, false);
  assert.equal(status.currentWorldGraphExact, false);
  assert.equal(status.currentWorldIntegrityViolationCount, 1);
  assert.equal(status.activeAdmissionEligible, false);

  fixture.tables.greaterRealmReleaseV1.rows[0]!.verifiedSlotCount = 600;
  fixture.tables.greaterRealmReleaseV1.rows[0]!.componentExpectedCellCount = 601;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, false);
  assert.equal(status.releaseVerificationExact, false);
  fixture.tables.greaterRealmReleaseV1.rows[0]!.componentExpectedCellCount = 600;
  fixture.tables.greaterRealmReleaseV1.rows[0]!.importedPassableCellCount = 601;
  status = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(status.releaseImportsExact, false);
  assert.equal(status.releaseVerificationExact, false);
});

test('each changed cutover transition adds one fixed audit row while exact retries add none', () => {
  const fixture = new Fixture();
  const actorSubject = 'admin:audit-fixture';
  const transitions = [
    ['prepare_greater_realm_activation_v1', 'prepared', () => (
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, actorSubject)
    )],
    ['begin_greater_realm_drain_v1', 'draining', () => (
      beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx)
    )],
    ['freeze_greater_realm_activation_v1', 'frozen', () => (
      freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['plan_greater_realm_relocation_v1', 'planned', () => (
      planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['relocate_greater_realm_canary_v1', 'canary', () => (
      relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)
    )],
    ['commit_greater_realm_active_v1', 'active', () => (
      commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)
    )],
    ['halt_greater_realm_activation_v1', 'halted', () => (
      haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
    )],
    ['resume_greater_realm_active_v1', 'active', () => (
      resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)
    )],
  ] as const;

  for (const [action, changedResult, run] of transitions) {
    const before = fixture.tables.adminAudit.count();
    assert.equal(
      fixture.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
        fixture.ctx,
        actorSubject,
        action,
        run,
      )),
      changedResult,
      action,
    );
    assert.equal(fixture.tables.adminAudit.count(), before + 1n, action);
    assert.equal(projectGreaterRealmCutoverStatusV1(fixture.ctx).auditRows, before + 1n, action);
    const row = fixture.tables.adminAudit.rows.at(-1)!;
    assert.equal(row.action, action);
    assert.equal(row.targetFid, undefined);
    assert.equal(row.actorSubject, actorSubject);
    assert.deepEqual(row.createdAt, NOW);
    assert.equal(row.note, GREATER_REALM_CUTOVER_AUDIT_NOTE_V1);

    assert.equal(
      fixture.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
        fixture.ctx,
        actorSubject,
        action,
        run,
      )),
      'unchanged',
      `${action} retry`,
    );
    assert.equal(fixture.tables.adminAudit.count(), before + 1n, `${action} retry`);
  }

  const rollback = new Fixture();
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'prepare_greater_realm_activation_v1',
      () => prepareGreaterRealmActivationAuthorizedTransactionV1(rollback.ctx, actorSubject),
    )),
    'prepared',
  );
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'rollback_greater_realm_before_commit_v1',
      () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx),
    )),
    'rolled-back',
  );
  assert.equal(projectGreaterRealmCutoverStatusV1(rollback.ctx).auditRows, 3n);
  assert.equal(
    rollback.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      rollback.ctx,
      actorSubject,
      'rollback_greater_realm_before_commit_v1',
      () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx),
    )),
    'unchanged',
  );
  assert.equal(projectGreaterRealmCutoverStatusV1(rollback.ctx).auditRows, 3n);
});

test('audit insertion faults roll back both a small transition and the full canary transaction', () => {
  const actorSubject = 'admin:audit-fault';
  const prepare = new Fixture();
  const preparedBefore = stateText(prepare);
  assert.equal(
    errorCode(() => prepare.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      prepare.ctx,
      actorSubject,
      'prepare_greater_realm_activation_v1',
      () => prepareGreaterRealmActivationAuthorizedTransactionV1(prepare.ctx, actorSubject),
    ), 2)),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(prepare), preparedBefore);

  const canary = new Fixture();
  advanceToPlanned(canary);
  const plannedSnapshot = canary.snapshot();
  const plannedText = stateText(canary);
  assert.equal(
    canary.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      canary.ctx,
      actorSubject,
      'relocate_greater_realm_canary_v1',
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(canary.ctx),
    )),
    'canary',
  );
  const auditMutation = canary.mutationCount;
  assert.ok(auditMutation > 1_000);
  canary.restore(plannedSnapshot);
  assert.equal(
    errorCode(() => canary.transaction(() => runGreaterRealmCutoverTransitionWithAuditV1(
      canary.ctx,
      actorSubject,
      'relocate_greater_realm_canary_v1',
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(canary.ctx),
    ), auditMutation)),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(canary), plannedText);
});

test('cutover status proves rollback restoration and closes admission at exact capacity', () => {
  const rollback = new Fixture();
  advanceToPlanned(rollback);
  rollback.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(rollback.ctx));
  assert.equal(
    rollback.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx)),
    'rolled-back',
  );
  let status = projectGreaterRealmCutoverStatusV1(rollback.ctx);
  assert.equal(status.activationMode, 'rolled-back');
  assert.equal(status.releaseState, 'ready');
  assert.equal(status.rollbackEligible, false);
  assert.equal(status.legacyFoundingOpen, true);
  assert.equal(status.legacyClaimRows, 100n);
  assert.equal(status.legacyOccupiedWorldTileRows, 100n);
  assert.equal(status.greaterRealmClaimRows, 0n);
  assert.equal(status.greaterRealmOccupancyRows, 0n);
  assert.equal(status.activeSlotRows, 0n);
  assert.equal(status.activeResourceNodeRows, 0n);
  assert.equal(status.currentWorldGraphApplicable, false);
  assert.equal(status.activeAdmissionEligible, false);

  const full = new Fixture();
  advanceToActive(full);
  for (let index = 0; index < 500; index += 1) {
    addOnePostCommitFounder(full, BigInt(50_000 + index));
  }
  status = projectGreaterRealmCutoverStatusV1(full.ctx);
  assert.equal(status.currentFounderCount, 600);
  assert.equal(status.founderCapacityRemaining, 0);
  assert.equal(status.greaterRealmClaimRows, 600n);
  assert.equal(status.greaterRealmOccupancyRows, 600n);
  assert.equal(status.relocatedClaimRows, 100n);
  assert.equal(status.foundedClaimRows, 500n);
  assert.equal(status.currentWorldGraphExact, true);
  assert.equal(status.activeAdmissionEligible, false);
  for (const count of [
    status.lowlandsFounderCount,
    status.frostmereFounderCount,
    status.sunscarFounderCount,
    status.mirefenFounderCount,
    status.stonewakeFounderCount,
    status.emberwoodFounderCount,
  ]) assert.equal(count, 100);
});

test('cutover status keeps a disabled founder globally exact and proves only an exact v17 re-enable target', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const allowed = fixture.tables.allowedFid.fid.find(1_001n)!;
  fixture.tables.allowedFid.fid.update({ ...allowed, enabled: false });

  let aggregate = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(aggregate.currentWorldGraphExact, true);
  assert.equal(aggregate.enabledAllowedFidRows, 99n);
  assert.equal(aggregate.activeAdmissionEligible, true);

  let target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.deepEqual(target, {
    currentWorldGraphApplicable: true,
    targetFounderGraphExact: true,
    targetAllowedEnabled: false,
    targetAuthEpoch: 1,
    targetRequestCycle: 2n,
    targetRequestedAtMicros: 1n,
    targetReenableEligible: true,
  });

  fixture.tables.accessRequestV1.fid.update({
    ...fixture.tables.accessRequestV1.fid.find(1_001n)!,
    requestCycle: 3n,
  });
  target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.equal(target.targetFounderGraphExact, true);
  assert.equal(target.targetReenableEligible, false);

  fixture.tables.accessRequestV1.fid.update({
    ...fixture.tables.accessRequestV1.fid.find(1_001n)!,
    requestCycle: 2n,
  });
  fixture.tables.allowedFid.fid.update({
    ...fixture.tables.allowedFid.fid.find(1_001n)!,
    enabled: true,
    authEpoch: 2,
  });
  target = projectGreaterRealmReenableStatusV1(fixture.ctx, 1_001n);
  assert.equal(target.targetFounderGraphExact, true);
  assert.equal(target.targetAllowedEnabled, true);
  assert.equal(target.targetAuthEpoch, 2);
  assert.equal(target.targetReenableEligible, false);

  aggregate = projectGreaterRealmCutoverStatusV1(fixture.ctx);
  assert.equal(aggregate.currentWorldGraphExact, true);
  assert.equal(aggregate.enabledAllowedFidRows, 100n);
});

test('the registered production boundary stays gate-ordered and privacy-safe', () => {
  attestCurrentGreaterRealmGateModeForTest(
    GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  const schema = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const reducers = readFileSync(new URL('../src/reducers/greaterRealm.ts', import.meta.url), 'utf8');
  const cutoverReducers = readFileSync(
    new URL('../src/reducers/greaterRealmCutover.ts', import.meta.url),
    'utf8',
  );
  const authority = readFileSync(new URL('../src/greaterRealmRelocationDormant.ts', import.meta.url), 'utf8');
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const snapshotAuthority = readFileSync(
    new URL('../src/greaterRealmRelocationSnapshot.ts', import.meta.url),
    'utf8',
  );
  const relocationAuthority = readFileSync(
    new URL('../src/greaterRealmRelocationAuthority.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(schema, /greaterRealmRelocationAuthority/);
  assert.doesNotMatch(reducers, /relocate_greater_realm|rollback_greater_realm|commit_greater_realm/);
  assert.match(indexSource, /GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1/);
  for (const name of [
    'admin_prepare_greater_realm_activation_v1',
    'admin_begin_greater_realm_drain_v1',
    'admin_freeze_greater_realm_activation_v1',
    'admin_plan_greater_realm_relocation_v1',
    'admin_relocate_greater_realm_canary_v1',
    'admin_commit_greater_realm_active_v1',
    'admin_halt_greater_realm_activation_v1',
    'admin_resume_greater_realm_active_v1',
    'admin_rollback_greater_realm_before_commit_v1',
    'admin_get_greater_realm_cutover_status_v1',
  ]) {
    assert.match(cutoverReducers, new RegExp(`name: '${name}'`), name);
  }
  const registeredBoundary = cutoverReducers.slice(
    cutoverReducers.indexOf('function authorizedActivation'),
    cutoverReducers.indexOf('export const adminPrepareGreaterRealmActivationV1'),
  );
  assert.ok(
    registeredBoundary.indexOf('requireGreaterRealmV17ActivationGate();')
      < registeredBoundary.indexOf('const admin = requireAdmin(ctx);'),
  );
  assert.doesNotMatch(
    cutoverReducers.slice(0, cutoverReducers.indexOf('function senderActivationError')),
    /actorSubject: t\.|fid: t\.|castleId: t\.|cellKey: t\.|slotId: t\.|centerQ: t\.|centerR: t\.|t\.array\(/,
  );
  const dormantBodies = [...authority.matchAll(/export function dormant[\s\S]*?\n\}\n/gu)]
    .map(match => match[0]);
  assert.equal(dormantBodies.length, 9);
  for (const body of dormantBodies) {
    assert.ok(
      body.indexOf('requireGreaterRealmV17ActivationGate();')
        < body.indexOf('requireAdmin(ctx)'),
      body,
    );
  }
  assert.doesNotMatch(authority, /centerQ|centerR|allocationRank: t\.|regionOrderRank: t\./);
  const topologyCapture = snapshotAuthority.slice(
    snapshotAuthority.indexOf('export function captureGreaterRealmFrozenTopologyV1'),
    snapshotAuthority.indexOf('export function assertGreaterRealmCanonicalIdleWorkersV1'),
  );
  assert.doesNotMatch(
    topologyCapture,
    /greaterRealm(?:Chunk|Cell|ResourceNode)V1\.iter\(\)/,
  );
  assert.doesNotMatch(snapshotAuthority, /realmChatMessageV1/);
  assert.doesNotMatch(relocationAuthority, /captureGreaterRealmProtectedDigestsV1/);
  assert.equal(
    [...relocationAuthority.matchAll(/requireStaticActivationState\(ctx,/gu)].length,
    2,
    'full static scans must remain encapsulated by the actual activation flip',
  );
  for (const path of [
    '../src/goldExpeditionAuthority.ts',
    '../src/foodExpeditionAuthority.ts',
    '../src/woodExpeditionAuthority.ts',
    '../src/stoneExpeditionAuthority.ts',
    '../src/castleWorkerAuthority.ts',
  ]) {
    const legacyDispatch = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(legacyDispatch, /greaterRealmLegacyJourneyDispatchIsOpenV1\(ctx\)/, path);
    assert.match(legacyDispatch, /GREATER_REALM_LEGACY_DISPATCH_CLOSED/, path);
  }
  const founding = readFileSync(new URL('../src/foundingAuthority.ts', import.meta.url), 'utf8');
  const ensureFounder = founding.slice(founding.indexOf('export function ensureGenesisFounder'));
  assert.ok(
    ensureFounder.indexOf("return 'preserved';")
      < ensureFounder.lastIndexOf('greaterRealmLegacyFoundingIsOpenV1(ctx)'),
  );
  assert.ok(
    ensureFounder.lastIndexOf('greaterRealmLegacyFoundingIsOpenV1(ctx)')
      < ensureFounder.indexOf('assertGenesisFoundingGraph(ctx, fid)'),
  );
});
