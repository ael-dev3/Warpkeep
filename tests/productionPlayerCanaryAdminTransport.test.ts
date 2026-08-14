import { describe, expect, it, vi } from 'vitest';

import type { DbConnection } from '../src/spacetime/module_bindings';
import type {
  AdminGetProductionPlayerCanaryApprovalV1Result,
  AdminGetProductionPlayerCanaryBaselineV1Result,
  AdminGetProductionPlayerCanaryEvidenceV1Result,
  AdminGetProductionPlayerCanaryRecoveryStatusV1Result,
  AdminPlanProductionPlayerCanaryRoutesV1Result,
} from '../src/spacetime/module_bindings/types/procedures';
import {
  PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_REDUCER,
  PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER,
  captureProductionPlayerCanaryBaselineV1,
  getProductionPlayerCanaryApprovalV1,
  getProductionPlayerCanaryBaselineV1,
  getProductionPlayerCanaryEvidenceV1,
  getProductionPlayerCanaryRecoveryStatusV1,
  planProductionPlayerCanaryRoutesV1,
  registerProductionPlayerCanaryApprovalV1,
} from '../scripts/production-player-canary-admin-transport';
import type {
  GreaterRealmProductionAdminSession,
} from '../scripts/greater-realm-production-transport';

const BASELINE_ARGUMENTS = Object.freeze({
  fid: 123n,
  reviewedAdmissionPlanDigest: 'a'.repeat(64),
  evidenceNonce: 'b'.repeat(64),
});

function readSession(procedures: Readonly<Record<string, unknown>>) {
  return {
    withConnection: async <Value>(
      operation: (connection: DbConnection) => Promise<Value>,
    ): Promise<Value> => operation({ procedures } as unknown as DbConnection),
  } as unknown as GreaterRealmProductionAdminSession;
}

describe('production player canary typed admin transport', () => {
  it('submits baseline capture exactly once through the write permit boundary', async () => {
    const submit = vi.fn(async () => undefined);
    const assertCanStartWrite = vi.fn();
    const session = { submit } as unknown as GreaterRealmProductionAdminSession;
    await captureProductionPlayerCanaryBaselineV1({
      session,
      arguments: BASELINE_ARGUMENTS,
      assertCanStartWrite,
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(
      PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER,
      BASELINE_ARGUMENTS,
      assertCanStartWrite,
    );
  });

  it('submits approval registration exactly once through the write permit boundary', async () => {
    const submit = vi.fn(async () => undefined);
    const assertCanStartWrite = vi.fn();
    const session = { submit } as unknown as GreaterRealmProductionAdminSession;
    const arguments_ = Object.freeze({
      ...BASELINE_ARGUMENTS,
      serverBaselineCommitment: 'c'.repeat(64),
      routeSetCommitment: 'd'.repeat(64),
      commandKeyPolicyVersion: 'warpkeep-production-player-canary-command-key-v1',
      commandSetCommitment: 'e'.repeat(64),
      ownerApprovalArtifactDigest: 'f'.repeat(64),
      ownerApprovalCommitment: '1'.repeat(64),
      approvedAtMicros: 1_000_000n,
      notAfterMicros: 2_000_000n,
    });
    await registerProductionPlayerCanaryApprovalV1({
      session,
      arguments: arguments_,
      assertCanStartWrite,
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(
      PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_REDUCER,
      arguments_,
      assertCanStartWrite,
    );
  });

  it('invokes all private typed reads and final evidence without raw command keys', async () => {
    const baselineResult = Object.freeze({ marker: 'baseline' }) as unknown as
      AdminGetProductionPlayerCanaryBaselineV1Result;
    const planResult = Object.freeze({ marker: 'plan' }) as unknown as
      AdminPlanProductionPlayerCanaryRoutesV1Result;
    const approvalResult = Object.freeze({ marker: 'approval' }) as unknown as
      AdminGetProductionPlayerCanaryApprovalV1Result;
    const evidenceResult = Object.freeze({ marker: 'evidence' }) as unknown as
      AdminGetProductionPlayerCanaryEvidenceV1Result;
    const recoveryResult = Object.freeze({ marker: 'recovery' }) as unknown as
      AdminGetProductionPlayerCanaryRecoveryStatusV1Result;
    const adminGetProductionPlayerCanaryBaselineV1 = vi.fn(async () => baselineResult);
    const adminPlanProductionPlayerCanaryRoutesV1 = vi.fn(async () => planResult);
    const adminGetProductionPlayerCanaryApprovalV1 = vi.fn(async () => approvalResult);
    const adminGetProductionPlayerCanaryEvidenceV1 = vi.fn(async () => evidenceResult);
    const adminGetProductionPlayerCanaryRecoveryStatusV1 = vi.fn(async () => recoveryResult);
    const session = readSession({
      adminGetProductionPlayerCanaryBaselineV1,
      adminPlanProductionPlayerCanaryRoutesV1,
      adminGetProductionPlayerCanaryApprovalV1,
      adminGetProductionPlayerCanaryEvidenceV1,
      adminGetProductionPlayerCanaryRecoveryStatusV1,
    });
    const finalArguments = BASELINE_ARGUMENTS;

    await expect(getProductionPlayerCanaryBaselineV1({
      session,
      arguments: BASELINE_ARGUMENTS,
    })).resolves.toBe(baselineResult);
    await expect(planProductionPlayerCanaryRoutesV1({
      session,
      arguments: BASELINE_ARGUMENTS,
    })).resolves.toBe(planResult);
    await expect(getProductionPlayerCanaryApprovalV1({
      session,
      arguments: BASELINE_ARGUMENTS,
    })).resolves.toBe(approvalResult);
    await expect(getProductionPlayerCanaryEvidenceV1({
      session,
      arguments: finalArguments,
    })).resolves.toBe(evidenceResult);
    await expect(getProductionPlayerCanaryRecoveryStatusV1({
      session,
      arguments: finalArguments,
    })).resolves.toBe(recoveryResult);
    expect(adminGetProductionPlayerCanaryBaselineV1)
      .toHaveBeenCalledWith(BASELINE_ARGUMENTS);
    expect(adminPlanProductionPlayerCanaryRoutesV1)
      .toHaveBeenCalledWith(BASELINE_ARGUMENTS);
    expect(adminGetProductionPlayerCanaryApprovalV1)
      .toHaveBeenCalledWith(BASELINE_ARGUMENTS);
    expect(adminGetProductionPlayerCanaryEvidenceV1)
      .toHaveBeenCalledWith(finalArguments);
    expect(adminGetProductionPlayerCanaryRecoveryStatusV1)
      .toHaveBeenCalledWith(finalArguments);
    expect(Object.keys(finalArguments).sort()).toEqual([
      'evidenceNonce', 'fid', 'reviewedAdmissionPlanDigest',
    ]);
  });
});
