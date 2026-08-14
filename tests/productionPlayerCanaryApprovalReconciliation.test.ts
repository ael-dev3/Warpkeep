import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ProductionPlayerCanaryApprovalReconciliationError,
  productionPlayerCanaryApprovalRegistrationArgumentsV1,
  productionPlayerCanaryApprovalReconciliationTestSeams,
  requireProductionPlayerCanaryApprovalReconciliation,
} from '../scripts/production-player-canary-approval-reconciliation.mjs';
import {
  productionPlayerCanaryBaselineChallengeDigest,
  productionPlayerCanaryBaselineReconciliationTestSeams,
} from '../scripts/production-player-canary-baseline-reconciliation.mjs';
import {
  deriveProductionPlayerCanaryCommandAuthorityV2,
} from '../scripts/production-player-canary-command-authority.mjs';
import {
  productionPlayerCanaryRouteSetCommitment,
} from '../scripts/production-player-canary-owner-approval.mjs';
import { GreaterRealmCutoverWriteNotStartedError } from
  '../scripts/greater-realm-cutover-write-control';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const BASELINE = 'c'.repeat(64);
const APPROVED_AT = '2026-08-13T12:00:00.000Z';
const NOT_AFTER = '2026-08-13T13:00:00.000Z';
const APPROVED_AT_MICROS = BigInt(Date.parse(APPROVED_AT)) * 1_000n;
const NOT_AFTER_MICROS = BigInt(Date.parse(NOT_AFTER)) * 1_000n;
function framed(values: readonly (string | bigint)[]) {
  return values.map((value) => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}
const ROUTES = Object.freeze(['food', 'wood', 'stone', 'gold'].map(
  (resourceKind, index) => Object.freeze({
    ordinal: index + 1,
    workerId: `genesis-001-castle-1-worker-0${index + 1}`,
    resourceKind,
    locationId: `GRL-${String.fromCharCode(65 + index).repeat(26)}`,
    atlasRevision: '7',
    routeSteps: 4,
    nodeCount: 8,
  }),
));
const ROUTE = productionPlayerCanaryRouteSetCommitment({
  evidenceNonce: NONCE,
  reviewedAdmissionPlanDigest: PLAN,
  routes: ROUTES,
});
const COMMAND = deriveProductionPlayerCanaryCommandAuthorityV2({
  challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
  reviewedAdmissionPlanDigest: PLAN,
  serverBaselineCommitment: BASELINE,
  routeSetCommitment: ROUTE,
});
const ARTIFACT = 'd'.repeat(64);
const OWNER_APPROVAL = createHash('sha256').update(
  `${framed([
    'warpkeep.production-player-canary.owner-approval.v1',
    NONCE,
    ARTIFACT,
    BASELINE,
    ROUTE,
  ])}\n`,
  'utf8',
).digest('hex');
const REGISTRATION = createHash('sha256').update(`${framed([
  'warpkeep.production-player-canary.approval-registration.v1',
  productionPlayerCanaryBaselineChallengeDigest(NONCE),
  PLAN,
  BASELINE,
  ROUTE,
  COMMAND.commandKeyPolicyVersion,
  COMMAND.commandSetCommitment,
  ARTIFACT,
  OWNER_APPROVAL,
  APPROVED_AT_MICROS,
  NOT_AFTER_MICROS,
])}\n`, 'utf8').digest('hex');
const approvalTestSeams = productionPlayerCanaryApprovalReconciliationTestSeams!;
const baselineTestSeams = productionPlayerCanaryBaselineReconciliationTestSeams!;

function baselineReconciliation() {
  const input = {
    adminSecret: 's'.repeat(32),
    arguments: {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
    },
    assertCanStartWrite: () => undefined,
  };
  return baselineTestSeams.brandCapturedStatusForTest({
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
    capturedAtMicros: APPROVED_AT_MICROS - 1_000n,
    baselineCaptured: true,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    pristineWorkerCount: 4,
    terminalGraphEmpty: true,
    pristineResourceAccount: true,
  }, input);
}

function routePlan() {
  return {
    profile: 'warpkeep-production-player-canary-route-plan-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
    atlasRevision: 7n,
    equalRouteSteps: 4,
    routes: ROUTES.map(route => ({ ...route, atlasRevision: 7n })),
  };
}

function inspectedApproval() {
  return {
    approval: {
      evidenceNonce: NONCE,
      reviewedAdmissionPlanDigest: PLAN,
      serverBaselineCommitment: BASELINE,
      routeSetCommitment: ROUTE,
      commandKeyPolicyVersion: COMMAND.commandKeyPolicyVersion,
      commandSetCommitment: COMMAND.commandSetCommitment,
      approvedAt: APPROVED_AT,
      notAfter: NOT_AFTER,
      routes: ROUTES.map(route => ({ ...route })),
    },
    artifactDigest: ARTIFACT,
    approvalCommitment: OWNER_APPROVAL,
    routeSetCommitment: ROUTE,
    commandSetCommitment: COMMAND.commandSetCommitment,
  };
}

function arguments_() {
  return productionPlayerCanaryApprovalRegistrationArgumentsV1({
    fid: 123n,
    baselineReconciliation: baselineReconciliation(),
    routePlan: routePlan(),
    inspectedApproval: inspectedApproval(),
  });
}

function registeredStatus(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    profile: 'warpkeep-production-player-canary-approval-registration-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
    commandKeyPolicyVersion: COMMAND.commandKeyPolicyVersion,
    commandSetCommitment: COMMAND.commandSetCommitment,
    ownerApprovalArtifactDigest: ARTIFACT,
    ownerApprovalCommitment: OWNER_APPROVAL,
    approvalRegistrationCommitment: REGISTRATION,
    approvedAtMicros: APPROVED_AT_MICROS,
    notAfterMicros: NOT_AFTER_MICROS,
    registeredAtMicros: APPROVED_AT_MICROS + 1_000n,
    approvalRegistered: true,
    routePlanBound: true,
    commandSetBound: true,
    ownerApprovalBound: true,
    ...overrides,
  };
}

function missingStatus() {
  return {
    profile: 'warpkeep-production-player-canary-approval-registration-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
    commandKeyPolicyVersion: COMMAND.commandKeyPolicyVersion,
    commandSetCommitment: '',
    ownerApprovalArtifactDigest: '',
    ownerApprovalCommitment: '',
    approvalRegistrationCommitment: '',
    approvedAtMicros: 0n,
    notAfterMicros: 0n,
    registeredAtMicros: 0n,
    approvalRegistered: false,
    routePlanBound: false,
    commandSetBound: false,
    ownerApprovalBound: false,
  };
}

function input() {
  return {
    adminSecret: 's'.repeat(32),
    arguments: arguments_(),
    assertCanStartWrite: () => undefined,
  };
}

function dependencies(options: Readonly<{
  register?: () => Promise<void>;
  refresh?: () => Promise<void>;
  read?: () => Promise<unknown>;
  close?: () => Promise<void>;
}> = {}) {
  const events: string[] = [];
  const session = {
    close: vi.fn(async () => {
      events.push('close');
      await options.close?.();
    }),
  };
  return {
    events,
    operations: {
      openSession: vi.fn(async () => {
        events.push('open');
        return session;
      }),
      register: vi.fn(async () => {
        events.push('register');
        await options.register?.();
      }),
      refresh: vi.fn(async () => {
        events.push('refresh');
        await options.refresh?.();
      }),
      read: vi.fn(async () => {
        events.push('read');
        return options.read === undefined ? registeredStatus() : options.read();
      }),
    },
  };
}

describe('production player canary approval registration reconciliation', () => {
  it('constructs exact registration material without accepting or returning raw keys', () => {
    const result = arguments_();
    expect(result).toEqual({
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
      serverBaselineCommitment: BASELINE,
      routeSetCommitment: ROUTE,
      commandKeyPolicyVersion: COMMAND.commandKeyPolicyVersion,
      commandSetCommitment: COMMAND.commandSetCommitment,
      ownerApprovalArtifactDigest: ARTIFACT,
      ownerApprovalCommitment: OWNER_APPROVAL,
      approvedAtMicros: APPROVED_AT_MICROS,
      notAfterMicros: NOT_AFTER_MICROS,
    });
    expect(Object.values(result).map(String).join('|'))
      .not.toMatch(/pc[12]-(?:[dr]0[1-4]|f00)-/u);
    const poisoned = {
      fid: 123n,
      baselineReconciliation: baselineReconciliation(),
      routePlan: routePlan(),
      inspectedApproval: inspectedApproval(),
      dispatchIdempotencyKeys: COMMAND.commands.map(value => value.dispatchIdempotencyKey),
    } as unknown as Parameters<
      typeof productionPlayerCanaryApprovalRegistrationArgumentsV1
    >[0];
    expect(() => productionPlayerCanaryApprovalRegistrationArgumentsV1(poisoned))
      .toThrow('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_MATERIAL_INVALID');
  });

  it('submits once and reconciles only after a fresh read boundary', async () => {
    const fixture = dependencies();
    const result = await approvalTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    );
    expect(result).toMatchObject({
      profile: 'warpkeep-production-player-canary-approval-reconciliation-v1',
      submissionOutcome: 'register-acknowledged',
      routeSetCommitment: ROUTE,
      commandSetCommitment: COMMAND.commandSetCommitment,
    });
    expect(requireProductionPlayerCanaryApprovalReconciliation(result)).toBe(result);
    expect(() => requireProductionPlayerCanaryApprovalReconciliation({ ...result }))
      .toThrow('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_REQUIRED');
    expect(fixture.events).toEqual(['open', 'register', 'refresh', 'read', 'close']);
    expect(fixture.operations.register).toHaveBeenCalledTimes(1);
    expect(fixture.operations.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
  });

  it('accepts an exact row after an ambiguous response and never resubmits', async () => {
    const fixture = dependencies({
      register: async () => { throw new Error('connection lost after submit'); },
    });
    await expect(approvalTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    )).resolves.toMatchObject({
      submissionOutcome: 'row-reconciled-after-submission-error',
    });
    expect(fixture.operations.register).toHaveBeenCalledTimes(1);
  });

  it('reacquires an exact committed registration after restart without submitting', async () => {
    const fixture = dependencies();
    const { assertCanStartWrite: _permit, ...reacquireInput } = input();
    const result = await approvalTestSeams.reacquireWithDependencies(
      reacquireInput,
      fixture.operations,
    );
    expect(result).toMatchObject({
      submissionOutcome: 'existing-row-reacquired',
      approvalRegistrationCommitment: REGISTRATION,
      routeSetCommitment: ROUTE,
    });
    expect(requireProductionPlayerCanaryApprovalReconciliation(result)).toBe(result);
    expect(fixture.events).toEqual(['open', 'read', 'close']);
    expect(fixture.operations.register).not.toHaveBeenCalled();
    expect(fixture.operations.refresh).not.toHaveBeenCalled();
  });

  it('fails closed when registration restart reacquisition is absent or conflicts', async () => {
    const { assertCanStartWrite: _permit, ...reacquireInput } = input();
    const absent = dependencies({ read: async () => missingStatus() });
    await expect(approvalTestSeams.reacquireWithDependencies(
      reacquireInput,
      absent.operations,
    )).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_REACQUISITION_ABSENT',
    );
    expect(absent.operations.register).not.toHaveBeenCalled();

    const conflict = dependencies({
      read: async () => registeredStatus({ commandSetCommitment: '9'.repeat(64) }),
    });
    await expect(approvalTestSeams.reacquireWithDependencies(
      reacquireInput,
      conflict.operations,
    )).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_CONFLICT',
    );
    expect(conflict.operations.register).not.toHaveBeenCalled();
  });

  it('rethrows proven no-write absence and requires explicit retry for ambiguous absence', async () => {
    const notStarted = new GreaterRealmCutoverWriteNotStartedError(
      'TEST_APPROVAL_NOT_STARTED',
    );
    const proven = dependencies({
      register: async () => { throw notStarted; },
      read: async () => missingStatus(),
    });
    await expect(approvalTestSeams.reconcileWithDependencies(
      input(),
      proven.operations,
    )).rejects.toBe(notStarted);

    const ambiguous = dependencies({
      register: async () => { throw new Error('ambiguous'); },
      read: async () => missingStatus(),
    });
    await expect(approvalTestSeams.reconcileWithDependencies(
      input(),
      ambiguous.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_APPROVAL_EXPLICIT_OPERATOR_RETRY_REQUIRED',
      disposition: 'explicit-operator-retry-required',
    });
    expect(ambiguous.operations.register).toHaveBeenCalledTimes(1);
  });

  it('halts on stale/cross-challenge readback or any postflight failure', async () => {
    const crossChallenge = dependencies({
      read: async () => registeredStatus({ challengeDigest: '9'.repeat(64) }),
    });
    await expect(approvalTestSeams.reconcileWithDependencies(
      input(),
      crossChallenge.operations,
    )).rejects.toBeInstanceOf(ProductionPlayerCanaryApprovalReconciliationError);

    const forgedRegistrationCommitment = dependencies({
      read: async () => registeredStatus({
        approvalRegistrationCommitment: '9'.repeat(64),
      }),
    });
    await expect(approvalTestSeams.reconcileWithDependencies(
      input(),
      forgedRegistrationCommitment.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_CONFLICT',
      disposition: 'halt',
    });

    for (const options of [
      { refresh: async () => { throw new Error('refresh'); } },
      { read: async () => { throw new Error('read'); } },
      { close: async () => { throw new Error('close'); } },
    ]) {
      const fixture = dependencies(options);
      await expect(approvalTestSeams.reconcileWithDependencies(
        input(),
        fixture.operations,
      )).rejects.toMatchObject({
        code: 'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_UNAVAILABLE',
        disposition: 'halt',
      });
      expect(fixture.operations.register).toHaveBeenCalledTimes(1);
    }
  });
});
