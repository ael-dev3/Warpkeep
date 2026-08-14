import { describe, expect, it, vi } from 'vitest';

import {
  ProductionPlayerCanaryBaselineReconciliationError,
  productionPlayerCanaryBaselineChallengeDigest,
  productionPlayerCanaryBaselineReconciliationTestSeams,
  requireProductionPlayerCanaryBaselineReconciliation,
} from '../scripts/production-player-canary-baseline-reconciliation.mjs';
import { GreaterRealmCutoverWriteNotStartedError } from
  '../scripts/greater-realm-cutover-write-control';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const COMMITMENT = 'c'.repeat(64);
const ROUTE = 'd'.repeat(64);
const reconciliationTestSeams = productionPlayerCanaryBaselineReconciliationTestSeams!;

function input(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    adminSecret: 's'.repeat(32),
    arguments: {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
    },
    assertCanStartWrite: () => undefined,
    ...overrides,
  };
}

function capturedStatus(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: COMMITMENT,
    routeSetCommitment: ROUTE,
    capturedAtMicros: 1_723_545_600_000_000n,
    baselineCaptured: true,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    pristineWorkerCount: 4,
    terminalGraphEmpty: true,
    pristineResourceAccount: true,
    ...overrides,
  };
}

function missingStatus() {
  return {
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: '',
    routeSetCommitment: '',
    capturedAtMicros: 0n,
    baselineCaptured: false,
    directTierOneFounder: false,
    normalRequestAdmission: false,
    pristineWorkerCount: 0,
    terminalGraphEmpty: false,
    pristineResourceAccount: false,
  };
}

function dependencies(options: Readonly<{
  capture?: () => Promise<void>;
  refresh?: () => Promise<void>;
  read?: () => Promise<unknown>;
}> = {}) {
  const events: string[] = [];
  const session = {
    close: vi.fn(async () => { events.push('close'); }),
  };
  const openSession = vi.fn(async () => {
    events.push('open');
    return session;
  });
  const capture = vi.fn(async () => {
    events.push('capture');
    await options.capture?.();
  });
  const refresh = vi.fn(async () => {
    events.push('refresh');
    await options.refresh?.();
  });
  const read = vi.fn(async () => {
    events.push('read');
    return options.read === undefined ? capturedStatus() : options.read();
  });
  return {
    events,
    session,
    operations: { openSession, capture, refresh, read },
  };
}

describe('production player canary baseline reconciliation', () => {
  it('submits once and always verifies after a fresh authenticated boundary', async () => {
    const fixture = dependencies();
    const result = await reconciliationTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    );

    expect(result).toMatchObject({
      profile: 'warpkeep-production-player-canary-baseline-reconciliation-v1',
      submissionOutcome: 'capture-acknowledged',
      serverBaselineCommitment: COMMITMENT,
      capturedAtMicros: 1_723_545_600_000_000n,
    });
    expect(requireProductionPlayerCanaryBaselineReconciliation(result)).toBe(result);
    expect(() => requireProductionPlayerCanaryBaselineReconciliation({ ...result }))
      .toThrow('PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_REQUIRED');
    expect(fixture.operations.capture).toHaveBeenCalledTimes(1);
    expect(fixture.operations.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
    expect(fixture.operations.openSession).toHaveBeenCalledTimes(1);
    expect(fixture.events).toEqual([
      'open', 'capture', 'refresh', 'read', 'close',
    ]);
  });

  it('accepts an exact row after a lost submit response without resubmitting', async () => {
    const lostResponse = new Error('connection disappeared after submission');
    const fixture = dependencies({
      capture: async () => { throw lostResponse; },
    });

    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    )).resolves.toMatchObject({
      submissionOutcome: 'row-reconciled-after-submission-error',
      serverBaselineCommitment: COMMITMENT,
    });
    expect(fixture.operations.capture).toHaveBeenCalledTimes(1);
    expect(fixture.operations.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
    expect(fixture.operations.openSession).toHaveBeenCalledTimes(1);
  });

  it('reacquires an exact committed row after restart without submitting', async () => {
    const fixture = dependencies();
    const { assertCanStartWrite: _permit, ...reacquireInput } = input();
    const result = await reconciliationTestSeams.reacquireWithDependencies(
      reacquireInput,
      fixture.operations,
    );

    expect(result).toMatchObject({
      submissionOutcome: 'existing-row-reacquired',
      serverBaselineCommitment: COMMITMENT,
      routeSetCommitment: ROUTE,
    });
    expect(requireProductionPlayerCanaryBaselineReconciliation(result)).toBe(result);
    expect(fixture.events).toEqual(['open', 'read', 'close']);
    expect(fixture.operations.capture).not.toHaveBeenCalled();
    expect(fixture.operations.refresh).not.toHaveBeenCalled();
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
  });

  it('fails closed when restart reacquisition is absent or unreadable', async () => {
    const { assertCanStartWrite: _permit, ...reacquireInput } = input();
    const absent = dependencies({ read: async () => missingStatus() });
    await expect(reconciliationTestSeams.reacquireWithDependencies(
      reacquireInput,
      absent.operations,
    )).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_BASELINE_REACQUISITION_ABSENT',
    );
    expect(absent.operations.capture).not.toHaveBeenCalled();

    const unavailable = dependencies({
      read: async () => { throw new Error('read unavailable'); },
    });
    await expect(reconciliationTestSeams.reacquireWithDependencies(
      reacquireInput,
      unavailable.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_BASELINE_REACQUISITION_UNAVAILABLE',
      disposition: 'halt',
    });
    expect(unavailable.events).toEqual(['open', 'read', 'close']);
  });

  it('rethrows the identical proven pre-mutation failure only after absence is read back', async () => {
    const notStarted = new GreaterRealmCutoverWriteNotStartedError(
      'TEST_CAPTURE_NOT_STARTED',
    );
    const fixture = dependencies({
      capture: async () => { throw notStarted; },
      read: async () => missingStatus(),
    });

    let rejected: unknown;
    try {
      await reconciliationTestSeams.reconcileWithDependencies(
        input(),
        fixture.operations,
      );
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBe(notStarted);
    expect(fixture.operations.capture).toHaveBeenCalledTimes(1);
    expect(fixture.operations.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
    expect(fixture.events).toEqual([
      'open', 'capture', 'refresh', 'read', 'close',
    ]);
  });

  it('requires an explicit operator retry when an ambiguous submit reconciles absent', async () => {
    const fixture = dependencies({
      capture: async () => { throw new Error('ambiguous submit'); },
      read: async () => missingStatus(),
    });

    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_BASELINE_EXPLICIT_OPERATOR_RETRY_REQUIRED',
      disposition: 'explicit-operator-retry-required',
    });
    expect(fixture.operations.capture).toHaveBeenCalledTimes(1);
    expect(fixture.operations.read).toHaveBeenCalledTimes(1);
  });

  it('halts when an acknowledged capture is absent from the authoritative readback', async () => {
    const fixture = dependencies({ read: async () => missingStatus() });

    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      fixture.operations,
    )).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_ACKNOWLEDGED_BUT_ABSENT',
    );
    expect(fixture.operations.capture).toHaveBeenCalledTimes(1);
  });

  it('halts on boundary/readback failure or a commitment mismatch', async () => {
    const boundaryUnavailable = dependencies({
      capture: async () => { throw new Error('ambiguous submit'); },
      refresh: async () => { throw new Error('fresh authentication unavailable'); },
    });
    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      boundaryUnavailable.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_UNAVAILABLE',
      disposition: 'halt',
    });
    expect(boundaryUnavailable.operations.capture).toHaveBeenCalledTimes(1);
    expect(boundaryUnavailable.operations.read).not.toHaveBeenCalled();

    const unavailable = dependencies({
      capture: async () => { throw new Error('ambiguous submit'); },
      read: async () => { throw new Error('readback unavailable'); },
    });
    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      unavailable.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_UNAVAILABLE',
      disposition: 'halt',
    });
    expect(unavailable.operations.capture).toHaveBeenCalledTimes(1);
    expect(unavailable.operations.read).toHaveBeenCalledTimes(1);

    const mismatch = dependencies();
    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input({ expectedServerBaselineCommitment: 'd'.repeat(64) }),
      mismatch.operations,
    )).rejects.toMatchObject({
      code: 'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_COMMITMENT_MISMATCH',
      disposition: 'halt',
    });
    expect(mismatch.operations.capture).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed or conflicting readback without minting authority', async () => {
    const malformed = dependencies({
      read: async () => ({ ...capturedStatus(), extra: true }),
    });
    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      malformed.operations,
    )).rejects.toBeInstanceOf(ProductionPlayerCanaryBaselineReconciliationError);

    const conflict = dependencies({
      read: async () => capturedStatus({ reviewedAdmissionPlanDigest: 'd'.repeat(64) }),
    });
    await expect(reconciliationTestSeams.reconcileWithDependencies(
      input(),
      conflict.operations,
    )).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_STATUS_CONFLICT',
    );
    expect(malformed.operations.capture).toHaveBeenCalledTimes(1);
    expect(conflict.operations.capture).toHaveBeenCalledTimes(1);
  });
});
