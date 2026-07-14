import {
  MARK_ATTRIBUTION_POLICY_ID,
  MAX_U128,
  checkedMarkMicrosTotal,
  snapMicrosToMarkMicros,
} from '../../src/marks/marksPolicy';

export const ETHEREUM_MAINNET_CHAIN_ID = 1;
export const SNAP_PROXY_ADDRESS = '0x49b5a631f54927c0007232844f06fe18cbf69786';
export const SNAP_PROXY_DEPLOYMENT_BLOCK = 25_012_691n;
export const SNAP_APPROVED_IMPLEMENTATION = '0xe9a747d64790d3ed0b647455b2f7503636f5e98a';
export const SNAP_APPROVED_IMPLEMENTATION_CODE_HASH =
  '0x56d5edb395905863637b94ca9fde441c401b42e8353ad6f84deaf201182bf7c7';
export const SNAP_APPROVED_PROXY_CODE_HASH =
  '0xa50288164ca4d99a6c559b6f601c35acc60fbf39e21b8c009d809ff35b955ed0';
export const SNAP_BURN_EVENT_TOPIC =
  '0x2bd3de8e7296e5766033a01c8991401d3f0b8b1dde97f35302773b62b2b0f4dc';
export const SNAP_BURN_EVENT_SIGNATURE = 'Burned(uint256,address,bytes32,uint256,uint32)';
export const SNAP_TOKEN_DECIMALS = 6;
export const SNAP_TOKEN_SYMBOL = 'SNAP';
export const SNAP_MARK_POLICY_ID = MARK_ATTRIBUTION_POLICY_ID;
export const DEFAULT_MAX_LOG_RANGE = 2_000n;

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const DATA_PATTERN = /^0x[0-9a-f]*$/i;

export class SnapBurnPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SnapBurnPolicyError';
  }
}

export type RawSnapBurnLog = Readonly<{
  address: string;
  topics: readonly string[];
  data: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  removed?: boolean;
}>;

export type CanonicalSnapBurn = Readonly<{
  eventKey: string;
  burnId: bigint;
  sender: string;
  /** Raw third indexed word, retained only for exact provider reconciliation. */
  opaqueIndexedTopic: string;
  amountMicros: bigint;
  markMicros: bigint;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
}>;

export type TrustedWalletAttribution = Readonly<{
  fid: bigint;
  address: string;
  active: boolean;
}>;

export type AttributedSnapBurn = Readonly<{
  fid: bigint;
  burn: CanonicalSnapBurn;
}>;

export type QuarantinedSnapBurn = Readonly<{
  eventKey: string;
  reason: 'missing_attribution' | 'ambiguous_attribution';
}>;

export type SnapBurnAttributionResult = Readonly<{
  credited: readonly AttributedSnapBurn[];
  quarantined: readonly QuarantinedSnapBurn[];
  creditedMicros: bigint;
  perFidMicros: ReadonlyMap<bigint, bigint>;
}>;

function normalizedAddress(value: string, errorCode = 'SNAP_ADDRESS_INVALID'): string {
  if (!ADDRESS_PATTERN.test(value)) throw new SnapBurnPolicyError(errorCode);
  return value.toLowerCase();
}

function normalizedHash(value: string, errorCode: string): string {
  if (!HASH_PATTERN.test(value)) throw new SnapBurnPolicyError(errorCode);
  return value.toLowerCase();
}

function parseWord(value: string, errorCode: string): bigint {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new SnapBurnPolicyError(errorCode);
  return BigInt(`0x${value}`);
}

function senderFromTopic(topic: string): string {
  const normalized = normalizedHash(topic, 'SNAP_BURN_SENDER_TOPIC_INVALID');
  if (!/^0x0{24}[0-9a-f]{40}$/.test(normalized)) {
    throw new SnapBurnPolicyError('SNAP_BURN_SENDER_TOPIC_INVALID');
  }
  return `0x${normalized.slice(-40)}`;
}

export function decodeCanonicalSnapBurn(log: RawSnapBurnLog): CanonicalSnapBurn {
  if (normalizedAddress(log.address) !== SNAP_PROXY_ADDRESS) {
    throw new SnapBurnPolicyError('SNAP_BURN_PROXY_MISMATCH');
  }
  if (log.removed === true) throw new SnapBurnPolicyError('SNAP_BURN_REMOVED');
  if (log.blockNumber < SNAP_PROXY_DEPLOYMENT_BLOCK) {
    throw new SnapBurnPolicyError('SNAP_BURN_BEFORE_DEPLOYMENT');
  }
  const blockHash = normalizedHash(log.blockHash, 'SNAP_BURN_BLOCK_HASH_INVALID');
  const transactionHash = normalizedHash(log.transactionHash, 'SNAP_BURN_TX_HASH_INVALID');
  if (!Number.isSafeInteger(log.logIndex) || log.logIndex < 0 || log.logIndex > 0xffff_ffff) {
    throw new SnapBurnPolicyError('SNAP_BURN_LOG_INDEX_INVALID');
  }
  if (
    log.topics.length !== 4
    || normalizedHash(log.topics[0] ?? '', 'SNAP_BURN_TOPIC_INVALID') !== SNAP_BURN_EVENT_TOPIC
  ) {
    throw new SnapBurnPolicyError('SNAP_BURN_TOPIC_MISMATCH');
  }

  const burnId = parseWord((log.topics[1] ?? '').slice(2), 'SNAP_BURN_ID_INVALID');
  if (burnId <= 0n) throw new SnapBurnPolicyError('SNAP_BURN_ID_INVALID');
  const sender = senderFromTopic(log.topics[2] ?? '');
  // Topic 3 is an opaque token-contract argument. Warpkeep neither interprets
  // it nor uses it for attribution; the sender's trusted current wallet link
  // is the sole policy input.
  const opaqueIndexedTopic = normalizedHash(
    log.topics[3] ?? '',
    'SNAP_BURN_OPAQUE_TOPIC_INVALID',
  );

  if (!DATA_PATTERN.test(log.data) || log.data.length !== 2 + 64 * 2) {
    throw new SnapBurnPolicyError('SNAP_BURN_DATA_INVALID');
  }
  const amountMicros = parseWord(log.data.slice(2, 66), 'SNAP_BURN_AMOUNT_INVALID');
  const sourceChainId = parseWord(log.data.slice(66, 130), 'SNAP_BURN_CHAIN_INVALID');
  if (sourceChainId !== BigInt(ETHEREUM_MAINNET_CHAIN_ID)) {
    throw new SnapBurnPolicyError('SNAP_BURN_CHAIN_MISMATCH');
  }
  if (amountMicros <= 0n || amountMicros > MAX_U128) {
    throw new SnapBurnPolicyError('SNAP_BURN_AMOUNT_OUT_OF_RANGE');
  }

  return Object.freeze({
    eventKey: `${ETHEREUM_MAINNET_CHAIN_ID}:${transactionHash}:${log.logIndex}`,
    burnId,
    sender,
    opaqueIndexedTopic,
    amountMicros,
    markMicros: snapMicrosToMarkMicros(amountMicros),
    blockNumber: log.blockNumber,
    blockHash,
    transactionHash,
    logIndex: log.logIndex,
  });
}

function burnFingerprint(burn: CanonicalSnapBurn): string {
  return [
    burn.eventKey,
    burn.burnId.toString(),
    burn.sender,
    burn.opaqueIndexedTopic,
    burn.amountMicros.toString(),
    burn.blockNumber.toString(),
    burn.blockHash,
  ].join('|');
}

function sortedFingerprints(burns: readonly CanonicalSnapBurn[]): readonly string[] {
  return burns.map(burnFingerprint).sort();
}

export function reconcileProviderBurns(
  primary: readonly CanonicalSnapBurn[],
  secondary: readonly CanonicalSnapBurn[],
): readonly CanonicalSnapBurn[] {
  const first = sortedFingerprints(primary);
  const second = sortedFingerprints(secondary);
  if (first.length !== second.length || first.some((value, index) => value !== second[index])) {
    throw new SnapBurnPolicyError('SNAP_PROVIDER_DISAGREEMENT');
  }
  return Object.freeze([...primary].sort((left, right) => (
    Number(left.blockNumber - right.blockNumber) || left.logIndex - right.logIndex
  )));
}

export function attributeCanonicalSnapBurns(
  burns: readonly CanonicalSnapBurn[],
  trustedWallets: readonly TrustedWalletAttribution[],
): SnapBurnAttributionResult {
  const walletFids = new Map<string, Set<bigint>>();
  for (const wallet of trustedWallets) {
    if (!wallet.active || wallet.fid <= 0n) continue;
    const address = normalizedAddress(wallet.address, 'SNAP_ATTRIBUTION_ADDRESS_INVALID');
    const fids = walletFids.get(address) ?? new Set<bigint>();
    fids.add(wallet.fid);
    walletFids.set(address, fids);
  }

  const seenEventKeys = new Set<string>();
  const seenBurnIds = new Map<bigint, string>();
  const credited: AttributedSnapBurn[] = [];
  const quarantined: QuarantinedSnapBurn[] = [];
  const perFidMicros = new Map<bigint, bigint>();

  for (const burn of burns) {
    if (seenEventKeys.has(burn.eventKey)) {
      throw new SnapBurnPolicyError('SNAP_DUPLICATE_EVENT_KEY');
    }
    seenEventKeys.add(burn.eventKey);
    const existingBurnEventKey = seenBurnIds.get(burn.burnId);
    if (existingBurnEventKey !== undefined) {
      throw new SnapBurnPolicyError('SNAP_DUPLICATE_BURN_ID');
    }
    seenBurnIds.set(burn.burnId, burn.eventKey);

    const fids = [...(walletFids.get(burn.sender) ?? [])];
    if (fids.length === 0) {
      quarantined.push(Object.freeze({ eventKey: burn.eventKey, reason: 'missing_attribution' }));
      continue;
    }
    if (fids.length !== 1) {
      quarantined.push(Object.freeze({ eventKey: burn.eventKey, reason: 'ambiguous_attribution' }));
      continue;
    }
    const fid = fids[0];
    const previous = perFidMicros.get(fid) ?? 0n;
    if (burn.markMicros > MAX_U128 - previous) {
      throw new SnapBurnPolicyError('SNAP_FID_TOTAL_OUT_OF_RANGE');
    }
    perFidMicros.set(fid, previous + burn.markMicros);
    credited.push(Object.freeze({ fid, burn }));
  }

  return Object.freeze({
    credited: Object.freeze(credited),
    quarantined: Object.freeze(quarantined),
    creditedMicros: checkedMarkMicrosTotal(credited.map(entry => entry.burn.markMicros)),
    perFidMicros,
  });
}

export type ImplementationAttestation = Readonly<{
  chainId: number;
  proxyAddress: string;
  proxyCodeHash: string;
  implementationAddress: string;
  implementationCodeHash: string;
  decimals: number;
  symbol: string;
}>;

export function assertApprovedSnapImplementation(attestation: ImplementationAttestation): void {
  if (attestation.chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_CHAIN_MISMATCH');
  }
  if (normalizedAddress(attestation.proxyAddress) !== SNAP_PROXY_ADDRESS) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_PROXY_MISMATCH');
  }
  if (normalizedHash(attestation.proxyCodeHash, 'SNAP_ATTESTATION_PROXY_CODE_INVALID') !== SNAP_APPROVED_PROXY_CODE_HASH) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_PROXY_CODE_MISMATCH');
  }
  if (normalizedAddress(attestation.implementationAddress) !== SNAP_APPROVED_IMPLEMENTATION) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_IMPLEMENTATION_MISMATCH');
  }
  if (
    normalizedHash(attestation.implementationCodeHash, 'SNAP_ATTESTATION_IMPLEMENTATION_CODE_INVALID')
    !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
  ) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_IMPLEMENTATION_CODE_MISMATCH');
  }
  if (attestation.decimals !== SNAP_TOKEN_DECIMALS || attestation.symbol !== SNAP_TOKEN_SYMBOL) {
    throw new SnapBurnPolicyError('SNAP_ATTESTATION_METADATA_MISMATCH');
  }
}

export type FinalizedHead = Readonly<{ blockNumber: bigint; blockHash: string }>;

export function reconcileFinalizedHeads(primary: FinalizedHead, secondary: FinalizedHead): FinalizedHead {
  const primaryHash = normalizedHash(primary.blockHash, 'SNAP_FINALIZED_HASH_INVALID');
  const secondaryHash = normalizedHash(secondary.blockHash, 'SNAP_FINALIZED_HASH_INVALID');
  if (
    primary.blockNumber < SNAP_PROXY_DEPLOYMENT_BLOCK
    || primary.blockNumber !== secondary.blockNumber
    || primaryHash !== secondaryHash
  ) {
    throw new SnapBurnPolicyError('SNAP_FINALIZED_HEAD_DISAGREEMENT');
  }
  return Object.freeze({ blockNumber: primary.blockNumber, blockHash: primaryHash });
}

export type BlockRange = Readonly<{ fromBlock: bigint; toBlock: bigint }>;

export function planBoundedBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  maximumRange = DEFAULT_MAX_LOG_RANGE,
): readonly BlockRange[] {
  if (
    fromBlock < SNAP_PROXY_DEPLOYMENT_BLOCK
    || toBlock < fromBlock
    || maximumRange <= 0n
    || maximumRange > 10_000n
  ) {
    throw new SnapBurnPolicyError('SNAP_SCAN_RANGE_INVALID');
  }
  const ranges: BlockRange[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + maximumRange - 1n > toBlock ? toBlock : cursor + maximumRange - 1n;
    ranges.push(Object.freeze({ fromBlock: cursor, toBlock: end }));
    cursor = end + 1n;
  }
  return Object.freeze(ranges);
}

export function privacySafeAttributionSummary(result: SnapBurnAttributionResult) {
  return Object.freeze({
    policyId: SNAP_MARK_POLICY_ID,
    decodedEvents: result.credited.length + result.quarantined.length,
    creditedEvents: result.credited.length,
    quarantinedEvents: result.quarantined.length,
    creditedAccounts: result.perFidMicros.size,
    creditedMicros: result.creditedMicros.toString(),
  });
}
