import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ProductionPlayerCanaryOwnerApprovalError,
  inspectProductionPlayerCanaryOwnerApproval,
  parseProductionPlayerCanaryOwnerApproval,
  productionPlayerCanaryRouteSetCommitment,
  productionPlayerCanaryOwnerApprovalTestSeams,
  writeProductionPlayerCanaryOwnerApproval,
} from '../scripts/production-player-canary-owner-approval.mjs';
import {
  productionPlayerCanaryBaselineChallengeDigest,
  productionPlayerCanaryBaselineReconciliationTestSeams,
} from '../scripts/production-player-canary-baseline-reconciliation.mjs';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const APPROVED_AT = new Date('2026-08-13T12:00:00.000Z');

function privateDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-canary-approval-'));
  chmodSync(directory, 0o700);
  return realpathSync(directory);
}

function approval(routeSteps = 4, lifetimeSeconds = 1_260) {
  const routes = ['food', 'wood', 'stone', 'gold'].map((resourceKind, index) => ({
    ordinal: index + 1,
    workerId: `genesis-001-castle-1-worker-0${index + 1}`,
    resourceKind,
    locationId: `GRL-${String.fromCharCode(65 + index).repeat(26)}`,
    atlasRevision: '7',
    routeSteps,
    nodeCount: 8,
  }));
  return {
    schemaVersion: 1,
    kind: 'warpkeep-production-player-canary-owner-approval-v1',
    approvalId: 'c'.repeat(32),
    evidenceNonce: NONCE,
    reviewedAdmissionPlanDigest: PLAN,
    protectedCommit: 'd'.repeat(40),
    protectedTree: 'e'.repeat(40),
    predecessorLiveReceiptDigest: 'f'.repeat(64),
    predecessorLiveRootReceiptDigest: '1'.repeat(64),
    predecessorLiveRootPagesSourceCommit: '2'.repeat(40),
    approvedAt: APPROVED_AT.toISOString(),
    notAfter: new Date(APPROVED_AT.getTime() + lifetimeSeconds * 1_000).toISOString(),
    minimumGatheringSeconds: 60,
    maximumGatheringSeconds: 120,
    maximumRouteSteps: routeSteps,
    serverBaselineCommitment: '9'.repeat(64),
    routes,
    commands: routes.map(({ ordinal }) => ({
      ordinal,
      dispatchIdempotencyKey: `canary-dispatch-${ordinal.toString().padStart(2, '0')}`,
      recallIdempotencyKey: `canary-recall-${ordinal.toString().padStart(4, '0')}`,
    })),
  };
}

const reconciliationTestSeams = productionPlayerCanaryBaselineReconciliationTestSeams!;
const ownerApprovalTestSeams = productionPlayerCanaryOwnerApprovalTestSeams!;

function baselineReconciliation(value = approval()) {
  const input = {
    adminSecret: 's'.repeat(32),
    arguments: {
      fid: 123n,
      reviewedAdmissionPlanDigest: value.reviewedAdmissionPlanDigest,
      evidenceNonce: value.evidenceNonce,
    },
    assertCanStartWrite: () => undefined,
  };
  return reconciliationTestSeams.brandCapturedStatusForTest({
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryBaselineChallengeDigest(value.evidenceNonce),
    reviewedAdmissionPlanDigest: value.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: value.serverBaselineCommitment,
    capturedAtMicros: BigInt(APPROVED_AT.getTime() - 1_000) * 1_000n,
    baselineCaptured: true,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    pristineWorkerCount: 4,
    terminalGraphEmpty: true,
    pristineResourceAccount: true,
  }, input);
}

describe('production player canary owner approval', () => {
  it('compares every descriptor/path metadata field, not only device and inode', () => {
    const exact = {
      dev: 1n,
      ino: 2n,
      mode: 0o100600n,
      uid: 501n,
      nlink: 1n,
      size: 100n,
      mtimeNs: 3n,
      ctimeNs: 4n,
    };
    expect(ownerApprovalTestSeams.sameFile(exact, { ...exact })).toBe(true);
    for (const [key, value] of Object.entries({
      mode: 0o100644n,
      uid: 502n,
      nlink: 2n,
      size: 101n,
      mtimeNs: 5n,
      ctimeNs: 6n,
    })) {
      expect(ownerApprovalTestSeams.sameFile(exact, { ...exact, [key]: value }), key)
        .toBe(false);
    }
  });

  it('descriptor-reads one canonical private approval and nonce-binds its routes', () => {
    const directory = privateDirectory();
    const value = approval();
    const reference = writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: baselineReconciliation(value),
    });
    const inspected = inspectProductionPlayerCanaryOwnerApproval({
      directory,
      reference,
      now: new Date(APPROVED_AT.getTime() + 1_000),
    });
    expect(inspected).toMatchObject({
      artifactDigest: reference.sha256,
      approval: value,
      routeSetCommitment: productionPlayerCanaryRouteSetCommitment(value),
    });
    expect(productionPlayerCanaryRouteSetCommitment({ ...value, evidenceNonce: '3'.repeat(64) }))
      .not.toBe(inspected.routeSetCommitment);
  });

  it('rejects a cutoff one second shorter than travel, gather, and operator margin', () => {
    expect(() => parseProductionPlayerCanaryOwnerApproval(approval(4, 1_259)))
      .toThrow('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_CUTOFF_TOO_SHORT');
    expect(parseProductionPlayerCanaryOwnerApproval(approval(4, 1_260))).toMatchObject({
      maximumRouteSteps: 4,
    });
  });

  it('rejects the retired caller-supplied baseline shape', () => {
    const { serverBaselineCommitment: _retired, ...withoutServerBaseline } = approval();
    const value = {
      ...withoutServerBaseline,
      baseline: {
        observedAtMicros: '1',
        settledThroughMicros: '1',
        revision: '0',
        food: '0',
        wood: '0',
        stone: '0',
        gold: '0',
      },
    };
    expect(() => parseProductionPlayerCanaryOwnerApproval(value))
      .toThrow('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
  });

  it('rejects noncanonical, symlink-like, or wrong-mode artifacts', () => {
    const directory = privateDirectory();
    const value = approval();
    const reference = writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: baselineReconciliation(value),
    });
    const path = join(directory, reference.filename);
    chmodSync(path, 0o644);
    expect(() => inspectProductionPlayerCanaryOwnerApproval({
      directory, reference, now: APPROVED_AT,
    })).toThrowError(ProductionPlayerCanaryOwnerApprovalError);

    const another = privateDirectory();
    const filename = `production-player-canary-owner-approval-${value.approvalId}.json`;
    writeFileSync(join(another, filename), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    expect(() => inspectProductionPlayerCanaryOwnerApproval({
      directory: another,
      reference: { filename, sha256: '4'.repeat(64) },
      now: APPROVED_AT,
    })).toThrowError(ProductionPlayerCanaryOwnerApprovalError);
  });

  it('repairs the exact killed-after-link state before an idempotent retry', () => {
    const directory = privateDirectory();
    const value = approval();
    const reconciled = baselineReconciliation(value);
    const reference = writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: reconciled,
    });
    const destination = join(directory, reference.filename);
    const orphan = join(directory, `.${reference.filename}.${'8'.repeat(32)}.tmp`);
    linkSync(destination, orphan);
    expect(readdirSync(directory)).toHaveLength(2);

    expect(writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: reconciled,
    }))
      .toEqual(reference);
    expect(readdirSync(directory)).toEqual([reference.filename]);
    expect(inspectProductionPlayerCanaryOwnerApproval({
      directory,
      reference,
      now: new Date(APPROVED_AT.getTime() + 1_000),
    })).toMatchObject({ approval: value });
  });

  it('requires a precommitted identifier and repeats the exact public write input', () => {
    const directory = privateDirectory();
    const value = approval();
    const reconciled = baselineReconciliation(value);
    const publicInput = Object.freeze({
      directory,
      approval: value,
      baselineReconciliation: reconciled,
    });
    const reference = writeProductionPlayerCanaryOwnerApproval(publicInput);
    expect(writeProductionPlayerCanaryOwnerApproval(publicInput)).toEqual(reference);
    expect(readdirSync(directory)).toEqual([reference.filename]);

    const { approvalId: _missing, ...withoutApprovalId } = value;
    expect(() => writeProductionPlayerCanaryOwnerApproval({
      directory: privateDirectory(),
      approval: withoutApprovalId,
      baselineReconciliation: reconciled,
    })).toThrow('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
  });

  it('does not repair an unrelated hard-link alias', () => {
    const directory = privateDirectory();
    const anotherDirectory = privateDirectory();
    const value = approval();
    const reference = writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: baselineReconciliation(value),
    });
    const unrelatedAlias = join(anotherDirectory, 'unrelated-approval-link');
    linkSync(join(directory, reference.filename), unrelatedAlias);

    expect(() => writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: baselineReconciliation(value),
    }))
      .toThrowError(ProductionPlayerCanaryOwnerApprovalError);
    expect(readdirSync(directory)).toEqual([reference.filename]);
    expect(readdirSync(anotherDirectory)).toEqual(['unrelated-approval-link']);
  });

  it('requires a branded matching server reconciliation before publication', () => {
    const directory = privateDirectory();
    const value = approval();
    expect(() => writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: value,
      baselineReconciliation: {
        ...baselineReconciliation(value),
      },
    })).toThrow('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_BASELINE_RECONCILIATION_REQUIRED');
    expect(() => writeProductionPlayerCanaryOwnerApproval({
      directory,
      approval: { ...value, serverBaselineCommitment: '8'.repeat(64) },
      baselineReconciliation: baselineReconciliation(value),
    })).toThrow('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_BASELINE_RECONCILIATION_REQUIRED');
    expect(readdirSync(directory)).toEqual([]);
  });
});
