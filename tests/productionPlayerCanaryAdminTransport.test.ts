import { describe, expect, it, vi } from 'vitest';

import type { DbConnection } from '../src/spacetime/module_bindings';
import type {
  AdminGetProductionPlayerCanaryBaselineV1Result,
  AdminGetProductionPlayerCanaryEvidenceV1Result,
} from '../src/spacetime/module_bindings/types/procedures';
import {
  PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER,
  captureProductionPlayerCanaryBaselineV1,
  getProductionPlayerCanaryBaselineV1,
  getProductionPlayerCanaryEvidenceV1,
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

  it('invokes typed baseline reconciliation and final evidence procedures', async () => {
    const baselineResult = Object.freeze({ marker: 'baseline' }) as unknown as
      AdminGetProductionPlayerCanaryBaselineV1Result;
    const evidenceResult = Object.freeze({ marker: 'evidence' }) as unknown as
      AdminGetProductionPlayerCanaryEvidenceV1Result;
    const adminGetProductionPlayerCanaryBaselineV1 = vi.fn(async () => baselineResult);
    const adminGetProductionPlayerCanaryEvidenceV1 = vi.fn(async () => evidenceResult);
    const session = readSession({
      adminGetProductionPlayerCanaryBaselineV1,
      adminGetProductionPlayerCanaryEvidenceV1,
    });
    const finalArguments = Object.freeze({
      ...BASELINE_ARGUMENTS,
      dispatchIdempotencyKeys: ['d1', 'd2', 'd3', 'd4'],
      recallIdempotencyKeys: ['r1', 'r2', 'r3', 'r4'],
    });

    await expect(getProductionPlayerCanaryBaselineV1({
      session,
      arguments: BASELINE_ARGUMENTS,
    })).resolves.toBe(baselineResult);
    await expect(getProductionPlayerCanaryEvidenceV1({
      session,
      arguments: finalArguments,
    })).resolves.toBe(evidenceResult);
    expect(adminGetProductionPlayerCanaryBaselineV1)
      .toHaveBeenCalledWith(BASELINE_ARGUMENTS);
    expect(adminGetProductionPlayerCanaryEvidenceV1)
      .toHaveBeenCalledWith(finalArguments);
    expect(Object.keys(finalArguments).sort()).toEqual([
      'dispatchIdempotencyKeys', 'evidenceNonce', 'fid',
      'recallIdempotencyKeys', 'reviewedAdmissionPlanDigest',
    ]);
  });
});
