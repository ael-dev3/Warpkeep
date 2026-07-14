import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ETHEREUM_MAINNET_CHAIN_ID,
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_APPROVED_PROXY_CODE_HASH,
  SNAP_MARK_POLICY_VERSION,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
} from '../src/marksAuthorityPolicy';
import { FARCASTER_WALLET_POLICY_VERSION } from '../src/profileAuthorityPolicy';
import {
  FIRST_SCAN_PREVIOUS_BLOCK,
  MAX_SCAN_BATCH_BLOCKS,
  applyScanBatchCredit,
  normalizeScanBatchPlan,
  planWalletSnapshotTransition,
  scanBatchReadyToFinalize,
} from '../src/scanBatchPolicy';

const snapshotId = '12'.repeat(32);
const nextSnapshotId = '34'.repeat(32);
const previousHash = `0x${'56'.repeat(32)}`;
const throughHash = `0x${'78'.repeat(32)}`;
const batchId = '9a'.repeat(32);

const snapshot = Object.freeze({
  generation: 1n,
  snapshotId,
  attributionCount: 2,
  policyVersion: FARCASTER_WALLET_POLICY_VERSION,
});

const initialPlan = Object.freeze({
  batchId,
  previousFinalizedBlock: FIRST_SCAN_PREVIOUS_BLOCK,
  previousFinalizedBlockHash: previousHash,
  throughFinalizedBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 100n,
  throughFinalizedBlockHash: throughHash,
  walletSnapshotGeneration: 1n,
  walletSnapshotId: snapshotId,
  expectedCredits: 2,
  expectedMicros: 3_000_000n,
  proxyCodeHash: SNAP_APPROVED_PROXY_CODE_HASH,
  implementationAddress: SNAP_APPROVED_IMPLEMENTATION,
  implementationCodeHash: SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
});

test('wallet snapshot generation is CAS-bound and exact retries are distinguishable', () => {
  assert.deepEqual(planWalletSnapshotTransition({
    existing: null,
    expectedGeneration: 0n,
    snapshotId: snapshotId.toUpperCase(),
    attributionCount: 2,
  }), {
    kind: 'create',
    generation: 1n,
    snapshotId,
    attributionCount: 2,
    policyVersion: FARCASTER_WALLET_POLICY_VERSION,
  });

  assert.equal(planWalletSnapshotTransition({
    existing: snapshot,
    expectedGeneration: 0n,
    snapshotId,
    attributionCount: 2,
  }).kind, 'retry');
  assert.deepEqual(planWalletSnapshotTransition({
    existing: snapshot,
    expectedGeneration: 1n,
    snapshotId: nextSnapshotId,
    attributionCount: 0,
  }), {
    kind: 'replace',
    generation: 2n,
    snapshotId: nextSnapshotId,
    attributionCount: 0,
    policyVersion: FARCASTER_WALLET_POLICY_VERSION,
  });

  assert.throws(() => planWalletSnapshotTransition({
    existing: snapshot,
    expectedGeneration: 1n,
    snapshotId,
    attributionCount: 2,
  }), /WALLET_SNAPSHOT_ID_REUSED/);
  assert.throws(() => planWalletSnapshotTransition({
    existing: snapshot,
    expectedGeneration: 9n,
    snapshotId: nextSnapshotId,
    attributionCount: 2,
  }), /WALLET_SNAPSHOT_GENERATION_MISMATCH/);
});

test('wallet snapshot replacement rejects malformed persisted singleton state', () => {
  const invalidStates = [
    { generation: 0n },
    { generation: (1n << 64n) },
    { snapshotId: 'ab'.repeat(32).toUpperCase() },
    { snapshotId: 'not-a-private-id' },
    { attributionCount: -1 },
    { attributionCount: 10_001 },
    { policyVersion: 'unknown-wallet-policy' },
  ] as const;
  for (const change of invalidStates) {
    assert.throws(() => planWalletSnapshotTransition({
      existing: { ...snapshot, ...change },
      expectedGeneration: 1n,
      snapshotId: nextSnapshotId,
      attributionCount: 2,
    }), /WALLET_SNAPSHOT_STATE_INVALID/);
  }
});

test('initial batch pins the exact snapshot, range totals, and compiled code attestation', () => {
  assert.deepEqual(normalizeScanBatchPlan(initialPlan, null, snapshot), initialPlan);

  const mismatches = [
    [{ walletSnapshotGeneration: 2n }, 'SCAN_BATCH_WALLET_SNAPSHOT_MISMATCH'],
    [{ walletSnapshotId: nextSnapshotId }, 'SCAN_BATCH_WALLET_SNAPSHOT_MISMATCH'],
    [{ proxyCodeHash: `0x${'ab'.repeat(32)}` }, 'SCAN_BATCH_ATTESTATION_MISMATCH'],
    [{ implementationAddress: `0x${'cd'.repeat(20)}` }, 'SCAN_BATCH_ATTESTATION_MISMATCH'],
    [{ implementationCodeHash: `0x${'ef'.repeat(32)}` }, 'SCAN_BATCH_ATTESTATION_MISMATCH'],
    [{ previousFinalizedBlock: FIRST_SCAN_PREVIOUS_BLOCK + 1n }, 'SCAN_CURSOR_MISMATCH'],
    [{ throughFinalizedBlock: FIRST_SCAN_PREVIOUS_BLOCK + MAX_SCAN_BATCH_BLOCKS + 1n }, 'SCAN_BATCH_INPUT_INVALID'],
    [{ expectedCredits: 0 }, 'SCAN_BATCH_INPUT_INVALID'],
    [{ expectedMicros: 1n }, 'SCAN_BATCH_INPUT_INVALID'],
  ] as const;
  for (const [change, error] of mismatches) {
    assert.throws(
      () => normalizeScanBatchPlan({ ...initialPlan, ...change }, null, snapshot),
      new RegExp(error),
    );
  }
});

test('continuation batches compare-and-swap the entire finalized cursor', () => {
  const cursor = Object.freeze({
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    tokenContract: SNAP_PROXY_ADDRESS,
    policyVersion: SNAP_MARK_POLICY_VERSION,
    deploymentStartBlock: SNAP_PROXY_DEPLOYMENT_BLOCK,
    lastFinalizedBlock: initialPlan.throughFinalizedBlock,
    lastFinalizedBlockHash: throughHash,
    proxyCodeHash: SNAP_APPROVED_PROXY_CODE_HASH,
    implementationAddress: SNAP_APPROVED_IMPLEMENTATION,
    implementationCodeHash: SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
    walletSnapshotGeneration: 1n,
    walletSnapshotId: snapshotId,
  });
  const continuation = {
    ...initialPlan,
    batchId: 'bc'.repeat(32),
    previousFinalizedBlock: cursor.lastFinalizedBlock,
    previousFinalizedBlockHash: cursor.lastFinalizedBlockHash,
    throughFinalizedBlock: cursor.lastFinalizedBlock + 10n,
    throughFinalizedBlockHash: `0x${'de'.repeat(32)}`,
  };
  assert.deepEqual(normalizeScanBatchPlan(continuation, cursor, snapshot), continuation);
  assert.throws(
    () => normalizeScanBatchPlan(continuation, {
      ...cursor,
      lastFinalizedBlockHash: `0x${'00'.repeat(32)}`,
    }, snapshot),
    /SCAN_CURSOR_MISMATCH/,
  );
  assert.throws(
    () => normalizeScanBatchPlan(continuation, {
      ...cursor,
      proxyCodeHash: `0x${'11'.repeat(32)}`,
    }, snapshot),
    /SCAN_CURSOR_MISMATCH/,
  );
  assert.throws(
    () => normalizeScanBatchPlan(continuation, {
      ...cursor,
      walletSnapshotId: 'ab'.repeat(32).toUpperCase(),
    }, snapshot),
    /SCAN_CURSOR_MISMATCH/,
  );
});

test('batch totals cannot exceed the frozen plan and finalize only after receipt equality', () => {
  const once = applyScanBatchCredit({
    appliedCredits: 0,
    appliedMicros: 0n,
    expectedCredits: 2,
    expectedMicros: 3_000_000n,
    amountMicros: 1_000_000n,
  });
  assert.deepEqual(once, { appliedCredits: 1, appliedMicros: 1_000_000n });
  assert.throws(() => applyScanBatchCredit({
    appliedCredits: 1,
    appliedMicros: 1_000_000n,
    expectedCredits: 2,
    expectedMicros: 3_000_000n,
    amountMicros: 2_000_001n,
  }), /SCAN_BATCH_EXPECTED_TOTAL_EXCEEDED/);

  const reconciled = {
    status: 'pending',
    expectedCredits: 2,
    expectedMicros: 3_000_000n,
    appliedCredits: 2,
    appliedMicros: 3_000_000n,
    receiptCredits: 2,
    receiptMicros: 3_000_000n,
  };
  assert.equal(scanBatchReadyToFinalize(reconciled), true);
  assert.equal(scanBatchReadyToFinalize({ ...reconciled, status: 'finalized' }), false);
  assert.equal(scanBatchReadyToFinalize({ ...reconciled, receiptCredits: 1 }), false);
  assert.equal(scanBatchReadyToFinalize({ ...reconciled, receiptMicros: 2_999_999n }), false);
});
