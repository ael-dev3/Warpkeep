// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  productionPlayerCanaryApprovalReconciliationTestSeams,
  productionPlayerCanaryApprovalRegistrationArgumentsV1,
} from '../scripts/production-player-canary-approval-reconciliation.mjs';
import {
  productionPlayerCanaryBaselineChallengeDigest,
  productionPlayerCanaryBaselineReconciliationTestSeams,
} from '../scripts/production-player-canary-baseline-reconciliation.mjs';
import {
  deriveProductionPlayerCanaryCommandAuthorityV1,
} from '../scripts/production-player-canary-command-authority.mjs';
import {
  inspectProductionPlayerCanaryOwnerApproval,
  prepareProductionPlayerCanaryOwnerApprovalV1,
  productionPlayerCanaryRouteSetCommitment,
  writePreparedProductionPlayerCanaryOwnerApproval,
} from '../scripts/production-player-canary-owner-approval.mjs';
import {
  productionPlayerCanarySubjectCommitment,
} from '../scripts/production-player-canary-evidence-authority.mjs';
import {
  executeProductionPlayerCanaryOperatorPhase,
  productionPlayerCanaryOperatorTestSeams,
} from '../scripts/production-player-canary-operator.mjs';
import {
  productionPlayerCanaryOperatorJournalTestSeams,
} from '../scripts/production-player-canary-operator-journal.mjs';

const NOW = new Date('2026-08-13T12:00:00.000Z');
const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const BASELINE = 'c'.repeat(64);
const PROTECTED_COMMIT = 'd'.repeat(40);
const PROTECTED_TREE = 'e'.repeat(40);
const LIVE = 'f'.repeat(64);
const ROOT = '1'.repeat(64);
const ROOT_COMMIT = '2'.repeat(40);
const SECRET = 'operator-admin-secret-material-0001';
const NOTIFICATION_SECRET = 'notification-secret-material-00001';
const RECEIPT_DIGEST = '3'.repeat(64);
const EVIDENCE_DIGEST = '4'.repeat(64);

const baselineTestSeams = productionPlayerCanaryBaselineReconciliationTestSeams!;
const approvalTestSeams = productionPlayerCanaryApprovalReconciliationTestSeams!;
const operatorTestSeams = productionPlayerCanaryOperatorTestSeams!;
const journalTestSeams = productionPlayerCanaryOperatorJournalTestSeams!;

const routes = Object.freeze(['food', 'wood', 'stone', 'gold'].map(
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
const routeSetCommitment = productionPlayerCanaryRouteSetCommitment({
  evidenceNonce: NONCE,
  reviewedAdmissionPlanDigest: PLAN,
  routes,
});
const commandAuthority = deriveProductionPlayerCanaryCommandAuthorityV1({
  evidenceNonce: NONCE,
  reviewedAdmissionPlanDigest: PLAN,
  serverBaselineCommitment: BASELINE,
  routeSetCommitment,
});

function privateFixture() {
  const home = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-canary-operator-',
  ));
  chmodSync(home, 0o700);
  const repositoryRoot = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-canary-operator-repository-',
  ));
  chmodSync(repositoryRoot, 0o700);
  const directories = Object.fromEntries([
    'founder-plans', 'owner-approvals', 'receipts',
  ].map(name => {
    const path = join(home, name);
    mkdirSync(path, { mode: 0o700 });
    chmodSync(path, 0o700);
    return [name, path];
  }));
  const contract = {
    schemaVersion: 1 as const,
    profile: 'warpkeep-production-player-canary-operator-v1' as const,
    operationId: '5'.repeat(32),
    evidenceNonce: NONCE,
    reviewedAdmissionClaimDigest: '6'.repeat(64),
    subjectCommitment: productionPlayerCanarySubjectCommitment(123n, NONCE),
    repositoryRoot,
    protectedCommit: PROTECTED_COMMIT,
    protectedTree: PROTECTED_TREE,
    founderPlanDirectory: directories['founder-plans'],
    reviewedAdmissionPlanReference: {
      filename: 'reviewed-plan.json',
      sha256: PLAN,
    },
    ownerApprovalDirectory: directories['owner-approvals'],
    receiptDirectory: directories.receipts,
  };
  return { home, contract };
}

function claimedPlan() {
  return {
    planDigest: PLAN,
    claimDigest: '6'.repeat(64),
    plan: {
      fid: '123',
      notificationPagesLivePagesSourceCommit: PROTECTED_COMMIT,
      notificationPagesLiveReceiptDigest: LIVE,
      notificationPagesLiveBridgeSourceCommit: '7'.repeat(40),
      notificationPagesLiveRootReceiptDigest: ROOT,
      notificationPagesLiveRootPagesSourceCommit: ROOT_COMMIT,
    },
  };
}

function baselineReconciliation() {
  return baselineTestSeams.brandCapturedStatusForTest({
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment,
    capturedAtMicros: BigInt(NOW.getTime() - 1_000) * 1_000n,
    baselineCaptured: true,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    pristineWorkerCount: 4,
    terminalGraphEmpty: true,
    pristineResourceAccount: true,
  }, {
    adminSecret: SECRET,
    arguments: {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
    },
    assertCanStartWrite: () => undefined,
  });
}

function routePlan() {
  return {
    profile: 'warpkeep-production-player-canary-route-plan-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment,
    atlasRevision: 7n,
    equalRouteSteps: 4,
    routes: routes.map(route => ({ ...route, atlasRevision: 7n })),
  };
}

function ownerApproval() {
  return {
    schemaVersion: 1,
    kind: 'warpkeep-production-player-canary-owner-approval-v1',
    approvalId: '8'.repeat(32),
    evidenceNonce: NONCE,
    reviewedAdmissionPlanDigest: PLAN,
    protectedCommit: PROTECTED_COMMIT,
    protectedTree: PROTECTED_TREE,
    predecessorLiveReceiptDigest: LIVE,
    predecessorLiveRootReceiptDigest: ROOT,
    predecessorLiveRootPagesSourceCommit: ROOT_COMMIT,
    approvedAt: NOW.toISOString(),
    notAfter: new Date(NOW.getTime() + 1_260_000).toISOString(),
    minimumGatheringSeconds: 60,
    maximumGatheringSeconds: 120,
    maximumRouteSteps: 4,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment,
    commandKeyPolicyVersion: commandAuthority.commandKeyPolicyVersion,
    commandSetCommitment: commandAuthority.commandSetCommitment,
    routes,
  };
}

function framed(values: readonly (string | bigint)[]) {
  return values.map(value => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

function registeredStatus(arguments_: Readonly<Record<string, unknown>>) {
  const registration = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.approval-registration.v1',
    productionPlayerCanaryBaselineChallengeDigest(NONCE),
    arguments_.reviewedAdmissionPlanDigest as string,
    arguments_.serverBaselineCommitment as string,
    arguments_.routeSetCommitment as string,
    arguments_.commandKeyPolicyVersion as string,
    arguments_.commandSetCommitment as string,
    arguments_.ownerApprovalArtifactDigest as string,
    arguments_.ownerApprovalCommitment as string,
    arguments_.approvedAtMicros as bigint,
    arguments_.notAfterMicros as bigint,
  ])}\n`, 'utf8').digest('hex');
  return {
    profile: 'warpkeep-production-player-canary-approval-registration-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: arguments_.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: arguments_.serverBaselineCommitment,
    routeSetCommitment: arguments_.routeSetCommitment,
    commandKeyPolicyVersion: arguments_.commandKeyPolicyVersion,
    commandSetCommitment: arguments_.commandSetCommitment,
    ownerApprovalArtifactDigest: arguments_.ownerApprovalArtifactDigest,
    ownerApprovalCommitment: arguments_.ownerApprovalCommitment,
    approvalRegistrationCommitment: registration,
    approvedAtMicros: arguments_.approvedAtMicros,
    notAfterMicros: arguments_.notAfterMicros,
    registeredAtMicros: (arguments_.approvedAtMicros as bigint) + 1_000n,
    approvalRegistered: true,
    routePlanBound: true,
    commandSetBound: true,
    ownerApprovalBound: true,
  };
}

function recoveryStatus(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    profile: 'warpkeep-production-player-canary-recovery-status-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment,
    commandSetCommitment: commandAuthority.commandSetCommitment,
    approvalRegistrationCommitment: '9'.repeat(64),
    notAfterMicros: BigInt(NOW.getTime() + 1_260_000) * 1_000n,
    observedAtMicros: BigInt(NOW.getTime()) * 1_000n,
    dispatchReceiptCount: 4,
    correlatedRecallReceiptCount: 4,
    noOpRecallReceiptCount: 0,
    unexpectedReceiptCount: 0,
    idleWorkerCount: 4,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 0,
    assignmentCount: 0n,
    occupationCount: 0n,
    scheduleCount: 0n,
    terminalSafe: true,
    structuralEvidenceCandidate: true,
    disposition: 'terminal-evidence-candidate',
    ...overrides,
  };
}

function dependencies(home: string) {
  const baseline = baselineReconciliation();
  const calls = {
    plan: vi.fn(),
    capture: vi.fn(),
    register: vi.fn(),
    evidence: vi.fn(),
    recovery: vi.fn(),
    receipt: vi.fn(),
  };
  const close = vi.fn(async () => undefined);
  const approvalDependencies = (arguments_: Readonly<Record<string, unknown>>) => ({
    openSession: async () => ({ close }),
    register: async ({ assertCanStartWrite }: { assertCanStartWrite: (() => void) & {
      markSubmissionUncertain?: () => Promise<void>;
    } }) => {
      calls.register();
      await assertCanStartWrite.markSubmissionUncertain?.();
      assertCanStartWrite();
    },
    refresh: async () => undefined,
    read: async () => registeredStatus(arguments_),
  });
  return {
    calls,
    deps: {
      withJournal: (input: Readonly<Record<string, unknown>>) =>
        journalTestSeams.withJournalDependencies(input as never, {
          currentProcessIdentity: () => 'Thu Aug 13 12:00:00 2026',
          probeProcessIdentity: () => ({
            state: 'present' as const,
            identity: 'Thu Aug 13 12:00:00 2026',
          }),
        }),
      assertProtectedSource: () => undefined,
      now: () => new Date(NOW),
      inspectClaimedPlan: async () => {
        calls.plan();
        return claimedPlan();
      },
      captureBaseline: async (input: Readonly<Record<string, unknown>>) => {
        calls.capture();
        const permit = input.assertCanStartWrite as (() => void) & {
          markSubmissionUncertain?: () => Promise<void>;
        };
        await permit.markSubmissionUncertain?.();
        permit();
        return baseline;
      },
      reacquireBaseline: async () => baseline,
      planRoutes: async () => routePlan(),
      inspectRecovery: async () => {
        calls.recovery();
        return recoveryStatus();
      },
      prepareOwnerApproval: prepareProductionPlayerCanaryOwnerApprovalV1,
      writeOwnerApproval: writePreparedProductionPlayerCanaryOwnerApproval,
      inspectOwnerApproval: inspectProductionPlayerCanaryOwnerApproval,
      approvalArguments: productionPlayerCanaryApprovalRegistrationArgumentsV1,
      registerApproval: async (input: Readonly<Record<string, unknown>>) =>
        approvalTestSeams.reconcileWithDependencies(
          input as never,
          approvalDependencies(input.arguments as Readonly<Record<string, unknown>>),
        ),
      reacquireApproval: async (input: Readonly<Record<string, unknown>>) =>
        approvalTestSeams.reacquireWithDependencies(input as never, {
          openSession: async () => ({ close }),
          read: async () => registeredStatus(
            input.arguments as Readonly<Record<string, unknown>>,
          ),
        }),
      inspectEvidence: async () => {
        calls.evidence();
        return Object.freeze({ privateExpectedEvidenceAuthority: true });
      },
      prepareReceipt: () => ({
        receiptDigest: RECEIPT_DIGEST,
        evidenceAuthorityDigest: EVIDENCE_DIGEST,
        recordedAt: NOW.toISOString(),
        notAfter: new Date(NOW.getTime() + 3_600_000).toISOString(),
      }),
      installReceipt: () => {
        calls.receipt();
        return {
          filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
          receiptDigest: RECEIPT_DIGEST,
          result: 'installed',
        };
      },
      reconcileReceipt: () => ({ state: 'absent' }),
    },
  };
}

describe('production player canary bounded operator', () => {
  it('constructs the public dependency seam before rejecting invalid input', async () => {
    await expect(executeProductionPlayerCanaryOperatorPhase(null as never))
      .rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_INPUT_INVALID');
  });

  it('executes one explicit boundary at a time through receipt installation', async () => {
    const fixture = privateFixture();
    const { calls, deps } = dependencies(fixture.home);
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, deps);

    const inspected = await execute({ command: 'inspect' });
    expect(inspected).toMatchObject({
      phase: 'prepared',
      expectedBaselineConfirmation: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(calls.capture).not.toHaveBeenCalled();

    await expect(execute({
      command: 'inspect-recovery',
      adminSecret: SECRET,
    })).resolves.toEqual({
      phase: null,
      recoveryStatus: recoveryStatus(),
    });
    await expect(execute({
      command: 'inspect-recovery',
      adminSecret: SECRET,
    })).resolves.toMatchObject({ phase: null });
    expect(calls.recovery).toHaveBeenCalledTimes(2);
    expect(calls.capture).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.evidence).not.toHaveBeenCalled();

    await expect(execute({
      command: 'capture-baseline',
      adminSecret: SECRET,
      confirmationDigest: inspected.expectedBaselineConfirmation,
    })).resolves.toMatchObject({ phase: 'baseline-reconciled' });
    expect(calls.capture).toHaveBeenCalledTimes(1);

    await expect(execute({
      command: 'inspect-route-plan',
      adminSecret: SECRET,
    })).resolves.toMatchObject({
      phase: 'baseline-reconciled',
      routePlan: { routeSetCommitment },
    });

    const prepared = await execute({
      command: 'prepare-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
    });
    expect(prepared).toMatchObject({
      phase: 'baseline-reconciled',
      expectedInstallConfirmation: expect.stringMatching(/^[0-9a-f]{64}$/u),
      expectedRegistrationConfirmation:
        expect.stringMatching(/^[0-9a-f]{64}$/u),
    });

    const installed = await execute({
      command: 'install-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
      confirmationDigest: prepared.expectedInstallConfirmation,
    });
    expect(installed).toMatchObject({ phase: 'owner-approval-installed' });
    const installedReference = installed.reference as Readonly<{
      filename: string;
    }>;

    unlinkSync(join(
      fixture.contract.ownerApprovalDirectory,
      installedReference.filename,
    ));
    await expect(execute({
      command: 'install-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
      confirmationDigest: prepared.expectedInstallConfirmation,
    })).resolves.toMatchObject({ phase: 'owner-approval-installed' });
    expect(readdirSync(fixture.contract.ownerApprovalDirectory)).toEqual([
      installedReference.filename,
    ]);

    const differentApproval = {
      ...ownerApproval(),
      approvalId: '9'.repeat(32),
    };
    const differentPrepared = await execute({
      command: 'prepare-owner-approval',
      adminSecret: SECRET,
      approval: differentApproval,
    });
    await expect(execute({
      command: 'install-owner-approval',
      adminSecret: SECRET,
      approval: differentApproval,
      confirmationDigest: differentPrepared.expectedInstallConfirmation,
    })).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_INTENT_MISMATCH',
    );

    await expect(execute({
      command: 'register-approval',
      adminSecret: SECRET,
      confirmationDigest: installed.expectedRegistrationConfirmation,
    })).resolves.toMatchObject({ phase: 'awaiting-authoritative-evidence' });
    expect(calls.register).toHaveBeenCalledTimes(1);

    await expect(execute({
      command: 'finalize-receipt',
      adminSecret: SECRET,
      notificationOperatorSecret: NOTIFICATION_SECRET,
    })).resolves.toEqual({
      phase: 'receipt-installed',
      filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
      receiptDigest: RECEIPT_DIGEST,
    });
    expect(calls.evidence).toHaveBeenCalledTimes(1);
    expect(calls.receipt).toHaveBeenCalledTimes(1);
    expect(calls.capture).toHaveBeenCalledTimes(1);
    expect(calls.register).toHaveBeenCalledTimes(1);

    const planReads = calls.plan.mock.calls.length;
    deps.reconcileReceipt = () => ({
      state: 'installed',
      filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
      receiptDigest: RECEIPT_DIGEST,
      result: 'unchanged',
    });
    await expect(execute({ command: 'finalize-receipt' })).resolves.toMatchObject({
      phase: 'receipt-installed',
      receiptDigest: RECEIPT_DIGEST,
    });
    expect(calls.plan).toHaveBeenCalledTimes(planReads);
    deps.reconcileReceipt = () => ({ state: 'absent' });
    await expect(execute({ command: 'finalize-receipt' })).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_INSTALLED_RECEIPT_MISSING',
    );
  });

  it('recovers a post-link receipt intent without plan, token, or network reads', async () => {
    const fixture = privateFixture();
    const { deps } = dependencies(fixture.home);
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, deps);
    const inspected = await execute({ command: 'inspect' });
    await execute({
      command: 'capture-baseline',
      adminSecret: SECRET,
      confirmationDigest: inspected.expectedBaselineConfirmation,
    });
    const prepared = await execute({
      command: 'prepare-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
    });
    const installed = await execute({
      command: 'install-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
      confirmationDigest: prepared.expectedInstallConfirmation,
    });
    await execute({
      command: 'register-approval',
      adminSecret: SECRET,
      confirmationDigest: installed.expectedRegistrationConfirmation,
    });
    deps.installReceipt = () => {
      throw new Error('simulated process loss after receipt link');
    };
    await expect(execute({
      command: 'finalize-receipt',
      adminSecret: SECRET,
      notificationOperatorSecret: NOTIFICATION_SECRET,
    })).rejects.toThrow('simulated process loss after receipt link');

    const forbidden = vi.fn(() => {
      throw new Error('network authority must not be read during recovery');
    });
    deps.inspectClaimedPlan = forbidden;
    deps.reacquireBaseline = forbidden;
    deps.planRoutes = forbidden;
    deps.reacquireApproval = forbidden;
    deps.inspectEvidence = forbidden;
    deps.reconcileReceipt = () => ({
      state: 'installed',
      filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
      receiptDigest: RECEIPT_DIGEST,
      result: 'unchanged',
    });
    await expect(execute({ command: 'finalize-receipt' })).resolves.toEqual({
      phase: 'receipt-installed',
      filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
      receiptDigest: RECEIPT_DIGEST,
    });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('checkpoints a committed baseline after a post-submit response loss', async () => {
    const fixture = privateFixture();
    const { calls, deps } = dependencies(fixture.home);
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, deps);
    const inspected = await execute({ command: 'inspect' });
    deps.captureBaseline = async (input: Readonly<Record<string, unknown>>) => {
      calls.capture();
      const permit = input.assertCanStartWrite as (() => void) & {
        markSubmissionUncertain?: () => Promise<void>;
      };
      await permit.markSubmissionUncertain?.();
      permit();
      throw new Error('simulated response loss after baseline commit');
    };
    await expect(execute({
      command: 'capture-baseline',
      adminSecret: SECRET,
      confirmationDigest: inspected.expectedBaselineConfirmation,
    })).rejects.toThrow('simulated response loss after baseline commit');

    const reacquire = vi.fn(async () => baselineReconciliation());
    deps.reacquireBaseline = reacquire;
    await expect(execute({
      command: 'inspect-route-plan',
      adminSecret: SECRET,
    })).resolves.toMatchObject({
      phase: 'baseline-reconciled',
      baseline: { serverBaselineCommitment: BASELINE },
      routePlan: { routeSetCommitment },
    });
    expect(calls.capture).toHaveBeenCalledTimes(1);
    expect(reacquire).toHaveBeenCalledTimes(1);
  });

  it('validates contract bindings before the first durable prepared record', async () => {
    const fixture = privateFixture();
    const { deps } = dependencies(fixture.home);
    const invalidContract = {
      ...fixture.contract,
      reviewedAdmissionClaimDigest: '0'.repeat(64),
    };
    await expect(operatorTestSeams.executeWithDependencies({
      command: 'inspect',
      contract: invalidContract,
      reportedHome: fixture.home,
    }, deps)).rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_REVIEWED_PLAN_INVALID');
    const journalDirectory = join(
      fixture.home,
      '.warpkeep/private/production-admin-v1',
      'production-player-canary-operator-journal-v1',
    );
    expect(readdirSync(journalDirectory).filter(name =>
      name.startsWith('production-player-canary-operator-'))).toEqual([]);
    await expect(operatorTestSeams.executeWithDependencies({
      command: 'inspect',
      contract: fixture.contract,
      reportedHome: fixture.home,
    }, deps)).resolves.toMatchObject({ phase: 'prepared' });
  });

  it('rejects hostile recovery aggregates without advancing the journal or invoking writes', async () => {
    const fixture = privateFixture();
    const { calls, deps } = dependencies(fixture.home);
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, deps);
    await execute({ command: 'inspect' });
    const hostile = [
      { ...recoveryStatus(), unexpected: true },
      recoveryStatus({ idleWorkerCount: 3 }),
      recoveryStatus({ structuralEvidenceCandidate: false }),
      recoveryStatus({ disposition: 'recall-required' }),
      recoveryStatus({ assignmentCount: -1n }),
      recoveryStatus({ dispatchReceiptCount: 5 }),
    ];
    for (const status of hostile) {
      deps.inspectRecovery = async () => status;
      await expect(execute({
        command: 'inspect-recovery',
        adminSecret: SECRET,
      })).rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_RECOVERY_STATUS_INVALID');
      expect((await execute({ command: 'inspect' })).phase).toBe('prepared');
    }
    let getterRead = false;
    const accessor = recoveryStatus();
    Object.defineProperty(accessor, 'serverBaselineCommitment', {
      enumerable: true,
      get() {
        getterRead = true;
        return BASELINE;
      },
    });
    deps.inspectRecovery = async () => accessor;
    await expect(execute({
      command: 'inspect-recovery',
      adminSecret: SECRET,
    })).rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_RECOVERY_STATUS_INVALID');
    expect(getterRead).toBe(false);
    const notAfterMicros = recoveryStatus().notAfterMicros as bigint;
    for (const observedAtMicros of [notAfterMicros, notAfterMicros + 1n]) {
      deps.inspectRecovery = async () => recoveryStatus({
        observedAtMicros,
        structuralEvidenceCandidate: false,
        disposition: 'terminal-evidence-impossible',
      });
      await expect(execute({
        command: 'inspect-recovery',
        adminSecret: SECRET,
      })).resolves.toMatchObject({
        phase: null,
        recoveryStatus: {
          observedAtMicros,
          structuralEvidenceCandidate: false,
          disposition: 'terminal-evidence-impossible',
        },
      });
      deps.inspectRecovery = async () => recoveryStatus({ observedAtMicros });
      await expect(execute({
        command: 'inspect-recovery',
        adminSecret: SECRET,
      })).rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_RECOVERY_STATUS_INVALID');
    }
    expect(calls.capture).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.receipt).not.toHaveBeenCalled();
  });

  it('keeps fresh-operation recovery inspection wholly outside journal creation', async () => {
    const fixture = privateFixture();
    const { calls, deps } = dependencies(fixture.home);
    const executeRecovery = () => operatorTestSeams.executeWithDependencies({
      command: 'inspect-recovery',
      contract: fixture.contract,
      reportedHome: fixture.home,
      adminSecret: SECRET,
    }, deps);
    const journalRoot = join(fixture.home, '.warpkeep');
    expect(existsSync(journalRoot)).toBe(false);

    let getterRead = false;
    const hostile = recoveryStatus();
    Object.defineProperty(hostile, 'profile', {
      enumerable: true,
      get() {
        getterRead = true;
        return 'warpkeep-production-player-canary-recovery-status-v1';
      },
    });
    deps.inspectRecovery = async () => hostile;
    await expect(executeRecovery()).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_RECOVERY_STATUS_INVALID',
    );
    expect(getterRead).toBe(false);
    expect(existsSync(journalRoot)).toBe(false);

    deps.inspectRecovery = async () => recoveryStatus();
    await expect(executeRecovery()).resolves.toEqual({
      phase: null,
      recoveryStatus: recoveryStatus(),
    });
    await expect(executeRecovery()).resolves.toMatchObject({ phase: null });
    expect(existsSync(journalRoot)).toBe(false);
    expect(calls.capture).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.evidence).not.toHaveBeenCalled();
    expect(calls.receipt).not.toHaveBeenCalled();
  });

  it('derives and accepts only the next explicitly confirmed approval retry', async () => {
    const fixture = privateFixture();
    const first = dependencies(fixture.home);
    let activeDeps = first.deps;
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, activeDeps);
    const inspected = await execute({ command: 'inspect' });
    await execute({
      command: 'capture-baseline',
      adminSecret: SECRET,
      confirmationDigest: inspected.expectedBaselineConfirmation,
    });
    const prepared = await execute({
      command: 'prepare-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
    });
    const installed = await execute({
      command: 'install-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
      confirmationDigest: prepared.expectedInstallConfirmation,
    });
    activeDeps.registerApproval = async (input: Readonly<Record<string, unknown>>) => {
      const permit = input.assertCanStartWrite as (() => void) & {
        markSubmissionUncertain?: () => Promise<void>;
      };
      await permit.markSubmissionUncertain?.();
      permit();
      throw Object.assign(new Error('registration result absent'), {
        code: 'PRODUCTION_PLAYER_CANARY_APPROVAL_EXPLICIT_OPERATOR_RETRY_REQUIRED',
      });
    };
    await expect(execute({
      command: 'register-approval',
      adminSecret: SECRET,
      confirmationDigest: installed.expectedRegistrationConfirmation,
    })).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_OPERATOR_APPROVAL_EXPLICIT_RETRY_REQUIRED',
      disposition: 'explicit-operator-retry-required',
    });
    const retry = await execute({
      command: 'prepare-owner-approval',
      adminSecret: SECRET,
      approval: ownerApproval(),
    });
    expect(retry).toMatchObject({
      nextApprovalAttempt: 2,
      expectedRegistrationConfirmation: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(retry.expectedRegistrationConfirmation)
      .not.toBe(installed.expectedRegistrationConfirmation);
    await expect(execute({
      command: 'register-approval',
      adminSecret: SECRET,
      confirmationDigest: installed.expectedRegistrationConfirmation,
    })).rejects.toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_CONFIRMATION_REQUIRED');

    const second = dependencies(fixture.home);
    activeDeps = second.deps;
    await expect(execute({
      command: 'register-approval',
      adminSecret: SECRET,
      confirmationDigest: retry.expectedRegistrationConfirmation,
    })).resolves.toMatchObject({ phase: 'awaiting-authoritative-evidence' });
    expect(second.calls.register).toHaveBeenCalledTimes(1);
  });

  it('rechecks protected source immediately beside each reducer permit', async () => {
    const fixture = privateFixture();
    const { deps } = dependencies(fixture.home);
    const execute = (input: Readonly<Record<string, unknown>>) =>
      operatorTestSeams.executeWithDependencies({
        contract: fixture.contract,
        reportedHome: fixture.home,
        ...input,
      }, deps);
    const inspected = await execute({ command: 'inspect' });
    let checks = 0;
    const reducer = vi.fn();
    deps.assertProtectedSource = () => {
      checks += 1;
      if (checks === 2) throw new Error('protected source drifted');
    };
    deps.captureBaseline = async (input: Readonly<Record<string, unknown>>) => {
      const permit = input.assertCanStartWrite as (() => void) & {
        markSubmissionUncertain?: () => Promise<void>;
      };
      await permit.markSubmissionUncertain?.();
      permit();
      reducer();
      return baselineReconciliation();
    };
    await expect(execute({
      command: 'capture-baseline',
      adminSecret: SECRET,
      confirmationDigest: inspected.expectedBaselineConfirmation,
    })).rejects.toThrow('protected source drifted');
    expect(checks).toBe(2);
    expect(reducer).not.toHaveBeenCalled();
  });

  it('rejects repository, private-directory, and journal path overlap preflight', async () => {
    const fixture = privateFixture();
    const { calls, deps } = dependencies(fixture.home);
    const reject = (contract: Readonly<Record<string, unknown>>) =>
      expect(operatorTestSeams.executeWithDependencies({
        command: 'inspect',
        contract,
        reportedHome: fixture.home,
      }, deps)).rejects.toThrow(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_PATH_ISOLATION_INVALID',
      );
    await reject({
      ...fixture.contract,
      ownerApprovalDirectory: fixture.contract.receiptDirectory,
    });

    const nestedFounder = join(fixture.home, 'nested-founder');
    const nestedOwner = join(nestedFounder, 'owner');
    mkdirSync(nestedOwner, { recursive: true, mode: 0o700 });
    chmodSync(nestedFounder, 0o700);
    chmodSync(nestedOwner, 0o700);
    await reject({
      ...fixture.contract,
      founderPlanDirectory: nestedFounder,
      ownerApprovalDirectory: nestedOwner,
    });

    const repositoryPrivate = join(fixture.contract.repositoryRoot, 'private');
    mkdirSync(repositoryPrivate, { mode: 0o700 });
    chmodSync(repositoryPrivate, 0o700);
    await reject({
      ...fixture.contract,
      founderPlanDirectory: repositoryPrivate,
    });

    const journalDirectory = join(
      fixture.home,
      '.warpkeep/private/production-admin-v1',
      'production-player-canary-operator-journal-v1',
    );
    mkdirSync(journalDirectory, { recursive: true, mode: 0o700 });
    chmodSync(journalDirectory, 0o700);
    await reject({
      ...fixture.contract,
      receiptDirectory: journalDirectory,
    });
    expect(calls.plan).not.toHaveBeenCalled();
    expect(calls.capture).not.toHaveBeenCalled();
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.receipt).not.toHaveBeenCalled();
  });
});
