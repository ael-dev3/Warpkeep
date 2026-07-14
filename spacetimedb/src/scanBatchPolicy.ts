import {
  ETHEREUM_MAINNET_CHAIN_ID,
  MAX_U128,
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_APPROVED_PROXY_CODE_HASH,
  SNAP_MARK_POLICY_VERSION,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
} from './marksAuthorityPolicy';
import { FARCASTER_WALLET_POLICY_VERSION } from './profileAuthorityPolicy';

export const WALLET_SNAPSHOT_KEY = 'farcaster-current-wallets-v1';
export const SNAP_SCAN_CURSOR_KEY = 'ethereum-mainnet-snap-burn-v1';
export const FIRST_SCAN_PREVIOUS_BLOCK = SNAP_PROXY_DEPLOYMENT_BLOCK - 1n;
export const MAX_WALLET_ATTRIBUTIONS_PER_SNAPSHOT = 10_000;
export const MAX_SCAN_BATCH_BLOCKS = 512_000n;
export const MAX_U32 = 0xffff_ffff;
export const MAX_U64 = (1n << 64n) - 1n;

const PRIVATE_ID_PATTERN = /^[a-f0-9]{64}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

export class ScanBatchPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ScanBatchPolicyError';
  }
}

export function normalizePrivateStateId(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!PRIVATE_ID_PATTERN.test(normalized)) throw new ScanBatchPolicyError(code);
  return normalized;
}

export function normalizePrivateBlockHash(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) throw new ScanBatchPolicyError(code);
  return normalized;
}

export type WalletSnapshotState = Readonly<{
  generation: bigint;
  snapshotId: string;
  attributionCount: number;
  policyVersion: string;
}>;

export type WalletSnapshotTransition = Readonly<{
  kind: 'create' | 'replace' | 'retry';
  generation: bigint;
  snapshotId: string;
  attributionCount: number;
  policyVersion: string;
}>;

export function planWalletSnapshotTransition(input: Readonly<{
  existing: WalletSnapshotState | null;
  expectedGeneration: bigint;
  snapshotId: string;
  attributionCount: number;
}>): WalletSnapshotTransition {
  const snapshotId = normalizePrivateStateId(input.snapshotId, 'WALLET_SNAPSHOT_ID_INVALID');
  if (
    input.expectedGeneration < 0n
    || input.expectedGeneration >= MAX_U64
    || !Number.isSafeInteger(input.attributionCount)
    || input.attributionCount < 0
    || input.attributionCount > MAX_WALLET_ATTRIBUTIONS_PER_SNAPSHOT
  ) {
    throw new ScanBatchPolicyError('WALLET_SNAPSHOT_INPUT_INVALID');
  }
  const generation = input.expectedGeneration + 1n;
  const candidate = Object.freeze({
    generation,
    snapshotId,
    attributionCount: input.attributionCount,
    policyVersion: FARCASTER_WALLET_POLICY_VERSION,
  });
  if (input.existing === null) {
    if (input.expectedGeneration !== 0n) {
      throw new ScanBatchPolicyError('WALLET_SNAPSHOT_GENERATION_MISMATCH');
    }
    return Object.freeze({ kind: 'create' as const, ...candidate });
  }
  if (
    input.existing.generation <= 0n
    || input.existing.generation > MAX_U64
    || !PRIVATE_ID_PATTERN.test(input.existing.snapshotId)
    || !Number.isSafeInteger(input.existing.attributionCount)
    || input.existing.attributionCount < 0
    || input.existing.attributionCount > MAX_WALLET_ATTRIBUTIONS_PER_SNAPSHOT
    || input.existing.policyVersion !== FARCASTER_WALLET_POLICY_VERSION
  ) {
    throw new ScanBatchPolicyError('WALLET_SNAPSHOT_STATE_INVALID');
  }
  if (input.existing.generation === generation) {
    if (
      input.existing.snapshotId !== snapshotId
      || input.existing.attributionCount !== input.attributionCount
      || input.existing.policyVersion !== FARCASTER_WALLET_POLICY_VERSION
    ) {
      throw new ScanBatchPolicyError('WALLET_SNAPSHOT_RETRY_CONFLICT');
    }
    return Object.freeze({ kind: 'retry' as const, ...candidate });
  }
  if (input.existing.generation !== input.expectedGeneration) {
    throw new ScanBatchPolicyError('WALLET_SNAPSHOT_GENERATION_MISMATCH');
  }
  if (input.existing.snapshotId === snapshotId) {
    throw new ScanBatchPolicyError('WALLET_SNAPSHOT_ID_REUSED');
  }
  return Object.freeze({ kind: 'replace' as const, ...candidate });
}

export type ScanCursorState = Readonly<{
  chainId: number;
  tokenContract: string;
  policyVersion: string;
  deploymentStartBlock: bigint;
  lastFinalizedBlock: bigint;
  lastFinalizedBlockHash: string;
  proxyCodeHash: string;
  implementationAddress: string;
  implementationCodeHash: string;
  walletSnapshotGeneration: bigint;
  walletSnapshotId: string;
}>;

export type ScanBatchPlanInput = Readonly<{
  batchId: string;
  previousFinalizedBlock: bigint;
  previousFinalizedBlockHash: string;
  throughFinalizedBlock: bigint;
  throughFinalizedBlockHash: string;
  walletSnapshotGeneration: bigint;
  walletSnapshotId: string;
  expectedCredits: number;
  expectedMicros: bigint;
  proxyCodeHash: string;
  implementationAddress: string;
  implementationCodeHash: string;
}>;

export type CanonicalScanBatchPlan = Readonly<ScanBatchPlanInput & {
  batchId: string;
  previousFinalizedBlockHash: string;
  throughFinalizedBlockHash: string;
  walletSnapshotId: string;
  proxyCodeHash: string;
  implementationAddress: string;
  implementationCodeHash: string;
}>;

function normalizedAddress(value: string): string {
  if (!/^0x[0-9a-f]{40}$/i.test(value)) {
    throw new ScanBatchPolicyError('SCAN_BATCH_IMPLEMENTATION_INVALID');
  }
  return value.toLowerCase();
}

export function normalizeScanBatchPlan(
  input: ScanBatchPlanInput,
  cursor: ScanCursorState | null,
  snapshot: WalletSnapshotState,
): CanonicalScanBatchPlan {
  const batchId = normalizePrivateStateId(input.batchId, 'SCAN_BATCH_ID_INVALID');
  const previousFinalizedBlockHash = normalizePrivateBlockHash(
    input.previousFinalizedBlockHash,
    'SCAN_BATCH_PREVIOUS_HASH_INVALID',
  );
  const throughFinalizedBlockHash = normalizePrivateBlockHash(
    input.throughFinalizedBlockHash,
    'SCAN_BATCH_THROUGH_HASH_INVALID',
  );
  const walletSnapshotId = normalizePrivateStateId(
    input.walletSnapshotId,
    'SCAN_BATCH_WALLET_SNAPSHOT_INVALID',
  );
  const proxyCodeHash = normalizePrivateBlockHash(
    input.proxyCodeHash,
    'SCAN_BATCH_PROXY_CODE_HASH_INVALID',
  );
  const implementationAddress = normalizedAddress(input.implementationAddress);
  const implementationCodeHash = normalizePrivateBlockHash(
    input.implementationCodeHash,
    'SCAN_BATCH_IMPLEMENTATION_CODE_HASH_INVALID',
  );
  if (
    input.previousFinalizedBlock < FIRST_SCAN_PREVIOUS_BLOCK
    || input.throughFinalizedBlock <= input.previousFinalizedBlock
    || input.throughFinalizedBlock - input.previousFinalizedBlock > MAX_SCAN_BATCH_BLOCKS
    || input.walletSnapshotGeneration <= 0n
    || input.walletSnapshotGeneration > MAX_U64
    || !Number.isSafeInteger(input.expectedCredits)
    || input.expectedCredits < 0
    || input.expectedCredits > MAX_U32
    || input.expectedMicros < 0n
    || input.expectedMicros > MAX_U128
    || (input.expectedCredits === 0) !== (input.expectedMicros === 0n)
    || (
      input.expectedCredits > 0
      && input.expectedMicros < BigInt(input.expectedCredits)
    )
  ) {
    throw new ScanBatchPolicyError('SCAN_BATCH_INPUT_INVALID');
  }
  if (
    snapshot.generation !== input.walletSnapshotGeneration
    || snapshot.snapshotId !== walletSnapshotId
    || snapshot.policyVersion !== FARCASTER_WALLET_POLICY_VERSION
  ) {
    throw new ScanBatchPolicyError('SCAN_BATCH_WALLET_SNAPSHOT_MISMATCH');
  }
  if (
    proxyCodeHash !== SNAP_APPROVED_PROXY_CODE_HASH
    || implementationAddress !== SNAP_APPROVED_IMPLEMENTATION
    || implementationCodeHash !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
  ) {
    throw new ScanBatchPolicyError('SCAN_BATCH_ATTESTATION_MISMATCH');
  }
  if (cursor === null) {
    if (input.previousFinalizedBlock !== FIRST_SCAN_PREVIOUS_BLOCK) {
      throw new ScanBatchPolicyError('SCAN_CURSOR_MISMATCH');
    }
  } else if (
    cursor.chainId !== ETHEREUM_MAINNET_CHAIN_ID
    || cursor.tokenContract !== SNAP_PROXY_ADDRESS
    || cursor.policyVersion !== SNAP_MARK_POLICY_VERSION
    || cursor.deploymentStartBlock !== SNAP_PROXY_DEPLOYMENT_BLOCK
    || cursor.lastFinalizedBlock !== input.previousFinalizedBlock
    || cursor.lastFinalizedBlockHash !== previousFinalizedBlockHash
    || cursor.proxyCodeHash !== SNAP_APPROVED_PROXY_CODE_HASH
    || cursor.implementationAddress !== SNAP_APPROVED_IMPLEMENTATION
    || cursor.implementationCodeHash !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
    || cursor.walletSnapshotGeneration <= 0n
    || cursor.walletSnapshotGeneration > MAX_U64
    || !PRIVATE_ID_PATTERN.test(cursor.walletSnapshotId)
  ) {
    throw new ScanBatchPolicyError('SCAN_CURSOR_MISMATCH');
  }
  return Object.freeze({
    ...input,
    batchId,
    previousFinalizedBlockHash,
    throughFinalizedBlockHash,
    walletSnapshotId,
    proxyCodeHash,
    implementationAddress,
    implementationCodeHash,
  });
}

export function applyScanBatchCredit(input: Readonly<{
  appliedCredits: number;
  appliedMicros: bigint;
  expectedCredits: number;
  expectedMicros: bigint;
  amountMicros: bigint;
}>): Readonly<{ appliedCredits: number; appliedMicros: bigint }> {
  const appliedCredits = input.appliedCredits + 1;
  const appliedMicros = input.appliedMicros + input.amountMicros;
  if (
    !Number.isSafeInteger(input.appliedCredits)
    || input.appliedCredits < 0
    || input.amountMicros <= 0n
    || appliedCredits > input.expectedCredits
    || appliedMicros > input.expectedMicros
    || appliedMicros > MAX_U128
  ) {
    throw new ScanBatchPolicyError('SCAN_BATCH_EXPECTED_TOTAL_EXCEEDED');
  }
  return Object.freeze({ appliedCredits, appliedMicros });
}

export function scanBatchReadyToFinalize(input: Readonly<{
  status: string;
  expectedCredits: number;
  expectedMicros: bigint;
  appliedCredits: number;
  appliedMicros: bigint;
  receiptCredits: number;
  receiptMicros: bigint;
}>): boolean {
  return input.status === 'pending'
    && input.expectedCredits === input.appliedCredits
    && input.expectedMicros === input.appliedMicros
    && input.appliedCredits === input.receiptCredits
    && input.appliedMicros === input.receiptMicros;
}
