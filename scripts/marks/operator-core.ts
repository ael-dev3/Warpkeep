import { createHmac } from 'node:crypto';
import { keccak256, type Hex } from 'viem';

import { MAX_U128 } from '../../src/marks/marksPolicy';

import {
  DEFAULT_MAX_LOG_RANGE,
  ETHEREUM_MAINNET_CHAIN_ID,
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_BURN_EVENT_TOPIC,
  SNAP_MARK_POLICY_ID,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
  assertApprovedSnapImplementation,
  attributeCanonicalSnapBurns,
  decodeCanonicalSnapBurn,
  planBoundedBlockRanges,
  privacySafeAttributionSummary,
  reconcileProviderBurns,
  type CanonicalSnapBurn,
  type TrustedWalletAttribution,
} from './snap-burn-policy';
import type { EthereumReadProvider, RpcBlock, RpcLog } from './operator-transport';

export const EIP_1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const SNAP_DECIMALS_SELECTOR = '0x313ce567';
export const SNAP_SYMBOL_SELECTOR = '0x95d89b41';
export const EIP_1967_UPGRADED_EVENT_TOPIC =
  '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b';
export const DEFAULT_MAX_SCAN_RANGES = 64;
export const MAX_CANONICAL_BURNS_PER_RUN = 100_000;
export const MAX_ATTESTED_EVENT_BLOCKS_PER_RUN = 4_096;

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const HEX_QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;

export class MarksOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MarksOperatorError';
  }
}

export type PrivateScanCursor = Readonly<{
  lastFinalizedBlock: bigint;
  lastFinalizedBlockHash: string;
}>;

export type CurrentWhitelistedWalletAttribution = Omit<TrustedWalletAttribution, 'active'> & Readonly<{
  active: true;
  whitelisted: true;
}>;

export type DryRunScanInput = Readonly<{
  providers: readonly [EthereumReadProvider, EthereumReadProvider];
  trustedWallets: readonly CurrentWhitelistedWalletAttribution[];
  cursor?: PrivateScanCursor;
  maximumRanges?: number;
  reportAliasKey?: string;
}>;

export type PrivacySafeScanReport = Readonly<{
  schemaVersion: 1;
  command: 'scan';
  dryRun: true;
  network: 'ethereum-mainnet';
  policyId: string;
  finalizedHead: Readonly<{ blockNumber: string; blockHash: string }>;
  cursor: Readonly<{ lastFinalizedBlock: string; lastFinalizedBlockHash: string }>;
  range: Readonly<{
    fromBlock: string;
    throughBlock: string;
    rangesProcessed: number;
    maximumBlocksPerRange: '2000';
    completeThroughFinalizedHead: boolean;
  }>;
  attestation: Readonly<{
    approved: true;
    eip1967Resolved: true;
    proxyBytecodePinned: true;
    implementationBytecodePinned: true;
    metadataPinned: true;
    canonicalBurnEventPinned: true;
    upgradeHistoryPinned: true;
    eventBlockImplementationsPinned: true;
  }>;
  attribution: Readonly<{
    policyId: string;
    decodedEvents: number;
    creditedEvents: number;
    quarantinedEvents: number;
    creditedAccounts: number;
    creditedMicros: string;
  }>;
  accountTotals?: readonly Readonly<{ accountAlias: string; creditedMicros: string }>[];
}>;

function normalizedBlock(block: RpcBlock): RpcBlock {
  if (block.number < 0n || !HASH_PATTERN.test(block.hash)) {
    throw new MarksOperatorError('MARKS_BLOCK_INVALID');
  }
  return Object.freeze({ number: block.number, hash: block.hash.toLowerCase() });
}

async function assertMainnetProviders(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
): Promise<void> {
  const [primaryChainId, secondaryChainId] = await Promise.all([
    providers[0].getChainId(),
    providers[1].getChainId(),
  ]);
  if (
    primaryChainId !== BigInt(ETHEREUM_MAINNET_CHAIN_ID)
    || secondaryChainId !== BigInt(ETHEREUM_MAINNET_CHAIN_ID)
  ) {
    throw new MarksOperatorError('MARKS_CHAIN_ID_MISMATCH');
  }
}

async function commonFinalizedBlock(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
): Promise<RpcBlock> {
  const [primaryHead, secondaryHead] = await Promise.all([
    providers[0].getFinalizedHead(),
    providers[1].getFinalizedHead(),
  ]).then(values => values.map(normalizedBlock) as [RpcBlock, RpcBlock]);
  const blockNumber = primaryHead.number < secondaryHead.number ? primaryHead.number : secondaryHead.number;
  if (blockNumber < SNAP_PROXY_DEPLOYMENT_BLOCK) {
    throw new MarksOperatorError('MARKS_FINALIZED_HEAD_INVALID');
  }
  const [primaryBlock, secondaryBlock] = await Promise.all([
    providers[0].getBlock(blockNumber),
    providers[1].getBlock(blockNumber),
  ]).then(values => values.map(normalizedBlock) as [RpcBlock, RpcBlock]);
  if (
    primaryBlock.number !== blockNumber
    || secondaryBlock.number !== blockNumber
    || primaryBlock.hash !== secondaryBlock.hash
    || (primaryHead.number === blockNumber && primaryHead.hash !== primaryBlock.hash)
    || (secondaryHead.number === blockNumber && secondaryHead.hash !== secondaryBlock.hash)
  ) {
    throw new MarksOperatorError('MARKS_FINALIZED_PROVIDER_DISAGREEMENT');
  }
  return primaryBlock;
}

async function assertCursorCanonical(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
  cursor: PrivateScanCursor,
): Promise<void> {
  if (
    cursor.lastFinalizedBlock < SNAP_PROXY_DEPLOYMENT_BLOCK - 1n
    || !HASH_PATTERN.test(cursor.lastFinalizedBlockHash)
  ) {
    throw new MarksOperatorError('MARKS_CURSOR_INVALID');
  }
  if (cursor.lastFinalizedBlock === SNAP_PROXY_DEPLOYMENT_BLOCK - 1n) return;
  const [primary, secondary] = await Promise.all([
    providers[0].getBlock(cursor.lastFinalizedBlock),
    providers[1].getBlock(cursor.lastFinalizedBlock),
  ]).then(values => values.map(normalizedBlock) as [RpcBlock, RpcBlock]);
  const expectedHash = cursor.lastFinalizedBlockHash.toLowerCase();
  if (
    primary.number !== cursor.lastFinalizedBlock
    || secondary.number !== cursor.lastFinalizedBlock
    || primary.hash !== expectedHash
    || secondary.hash !== expectedHash
  ) {
    throw new MarksOperatorError('MARKS_CURSOR_REORG_DETECTED');
  }
}

function implementationFromStorage(value: string): string {
  const match = /^0x0{24}([0-9a-f]{40})$/i.exec(value);
  if (!match) throw new MarksOperatorError('MARKS_IMPLEMENTATION_SLOT_INVALID');
  const address = `0x${match[1].toLowerCase()}`;
  if (address === '0x0000000000000000000000000000000000000000') {
    throw new MarksOperatorError('MARKS_IMPLEMENTATION_SLOT_INVALID');
  }
  return address;
}

function decodeDecimals(value: string): number {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new MarksOperatorError('MARKS_METADATA_INVALID');
  }
  const parsed = BigInt(value);
  if (parsed > 255n) throw new MarksOperatorError('MARKS_METADATA_INVALID');
  return Number(parsed);
}

function decodeAbiString(value: string): string {
  if (!/^0x[0-9a-f]+$/i.test(value) || (value.length - 2) % 64 !== 0) {
    throw new MarksOperatorError('MARKS_METADATA_INVALID');
  }
  const payload = value.slice(2);
  if (payload.length < 128 || BigInt(`0x${payload.slice(0, 64)}`) !== 32n) {
    throw new MarksOperatorError('MARKS_METADATA_INVALID');
  }
  const length = BigInt(`0x${payload.slice(64, 128)}`);
  if (length < 1n || length > 32n) throw new MarksOperatorError('MARKS_METADATA_INVALID');
  const byteLength = Number(length);
  const encoded = payload.slice(128, 128 + byteLength * 2);
  if (encoded.length !== byteLength * 2) throw new MarksOperatorError('MARKS_METADATA_INVALID');
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(encoded.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16)),
    );
  } catch {
    throw new MarksOperatorError('MARKS_METADATA_INVALID');
  }
  if (!/^[\x20-\x7e]+$/.test(decoded)) throw new MarksOperatorError('MARKS_METADATA_INVALID');
  return decoded;
}

type ProviderAttestation = Readonly<{
  implementationAddress: string;
  proxyCodeHash: string;
  implementationCodeHash: string;
  decimals: number;
  symbol: string;
}>;

async function attestProvider(
  provider: EthereumReadProvider,
  blockNumber: bigint,
): Promise<ProviderAttestation> {
  const implementationAddress = implementationFromStorage(
    await provider.getStorageAt(SNAP_PROXY_ADDRESS, EIP_1967_IMPLEMENTATION_SLOT, blockNumber),
  );
  const [proxyCode, implementationCode, decimalsResult, symbolResult] = await Promise.all([
    provider.getCode(SNAP_PROXY_ADDRESS, blockNumber),
    provider.getCode(implementationAddress, blockNumber),
    provider.call(SNAP_PROXY_ADDRESS, SNAP_DECIMALS_SELECTOR, blockNumber),
    provider.call(SNAP_PROXY_ADDRESS, SNAP_SYMBOL_SELECTOR, blockNumber),
  ]);
  if (proxyCode === '0x' || implementationCode === '0x') {
    throw new MarksOperatorError('MARKS_BYTECODE_MISSING');
  }
  const attestation = Object.freeze({
    implementationAddress,
    proxyCodeHash: keccak256(proxyCode as Hex),
    implementationCodeHash: keccak256(implementationCode as Hex),
    decimals: decodeDecimals(decimalsResult),
    symbol: decodeAbiString(symbolResult),
  });
  assertApprovedSnapImplementation({
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    proxyAddress: SNAP_PROXY_ADDRESS,
    ...attestation,
  });
  return attestation;
}

async function assertAttestation(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
  blockNumber: bigint,
): Promise<void> {
  const [primary, secondary] = await Promise.all([
    attestProvider(providers[0], blockNumber),
    attestProvider(providers[1], blockNumber),
  ]);
  if (JSON.stringify(primary) !== JSON.stringify(secondary)) {
    throw new MarksOperatorError('MARKS_ATTESTATION_PROVIDER_DISAGREEMENT');
  }
  if (primary.implementationAddress !== SNAP_APPROVED_IMPLEMENTATION) {
    throw new MarksOperatorError('MARKS_IMPLEMENTATION_NOT_APPROVED');
  }
}

function quantity(value: string): bigint {
  if (!HEX_QUANTITY_PATTERN.test(value)) throw new MarksOperatorError('MARKS_LOG_INVALID');
  return BigInt(value);
}

function decodeProviderLogs(
  logs: readonly RpcLog[],
  fromBlock: bigint,
  toBlock: bigint,
): readonly CanonicalSnapBurn[] {
  return Object.freeze(logs.map(log => {
    const blockNumber = quantity(log.blockNumber);
    const logIndex = quantity(log.logIndex);
    if (blockNumber < fromBlock || blockNumber > toBlock || logIndex > 0xffff_ffffn) {
      throw new MarksOperatorError('MARKS_LOG_OUTSIDE_RANGE');
    }
    return decodeCanonicalSnapBurn({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber,
      blockHash: log.blockHash,
      transactionHash: log.transactionHash,
      logIndex: Number(logIndex),
      removed: log.removed,
    });
  }));
}

type CanonicalUpgrade = Readonly<{
  eventKey: string;
  implementationAddress: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
}>;

function decodeUpgradeLogs(
  logs: readonly RpcLog[],
  fromBlock: bigint,
  toBlock: bigint,
): readonly CanonicalUpgrade[] {
  const upgrades = logs.map((log) => {
    const blockNumber = quantity(log.blockNumber);
    const logIndex = quantity(log.logIndex);
    if (
      blockNumber < fromBlock
      || blockNumber > toBlock
      || logIndex > 0xffff_ffffn
      || log.removed === true
      || log.address.toLowerCase() !== SNAP_PROXY_ADDRESS
      || log.topics.length !== 2
      || log.topics[0]?.toLowerCase() !== EIP_1967_UPGRADED_EVENT_TOPIC
      || !/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[1] ?? '')
      || log.data !== '0x'
      || !HASH_PATTERN.test(log.blockHash)
      || !HASH_PATTERN.test(log.transactionHash)
    ) {
      throw new MarksOperatorError('MARKS_UPGRADE_LOG_INVALID');
    }
    const implementationAddress = `0x${log.topics[1]!.slice(-40).toLowerCase()}`;
    return Object.freeze({
      eventKey: `${blockNumber}:${log.transactionHash.toLowerCase()}:${logIndex}`,
      implementationAddress,
      blockNumber,
      blockHash: log.blockHash.toLowerCase(),
      transactionHash: log.transactionHash.toLowerCase(),
      logIndex: Number(logIndex),
    });
  });
  const seen = new Set<string>();
  for (const upgrade of upgrades) {
    if (seen.has(upgrade.eventKey)) {
      throw new MarksOperatorError('MARKS_DUPLICATE_UPGRADE_EVENT');
    }
    seen.add(upgrade.eventKey);
    if (upgrade.implementationAddress !== SNAP_APPROVED_IMPLEMENTATION) {
      throw new MarksOperatorError('MARKS_UNAPPROVED_HISTORICAL_UPGRADE');
    }
  }
  return Object.freeze(upgrades);
}

function upgradeFingerprint(upgrade: CanonicalUpgrade): string {
  return [
    upgrade.eventKey,
    upgrade.implementationAddress,
    upgrade.blockHash,
  ].join('|');
}

function reconcileProviderUpgrades(
  primary: readonly CanonicalUpgrade[],
  secondary: readonly CanonicalUpgrade[],
): void {
  const first = primary.map(upgradeFingerprint).sort();
  const second = secondary.map(upgradeFingerprint).sort();
  if (first.length !== second.length || first.some((value, index) => value !== second[index])) {
    throw new MarksOperatorError('MARKS_UPGRADE_PROVIDER_DISAGREEMENT');
  }
}

async function assertApprovedEventBlockImplementations(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
  burns: readonly CanonicalSnapBurn[],
): Promise<void> {
  const hashesByBlock = new Map<bigint, string>();
  for (const burn of burns) {
    const existing = hashesByBlock.get(burn.blockNumber);
    if (existing !== undefined && existing !== burn.blockHash) {
      throw new MarksOperatorError('MARKS_EVENT_BLOCK_HASH_CONFLICT');
    }
    hashesByBlock.set(burn.blockNumber, burn.blockHash);
  }
  if (hashesByBlock.size > MAX_ATTESTED_EVENT_BLOCKS_PER_RUN) {
    throw new MarksOperatorError('MARKS_EVENT_BLOCK_ATTESTATION_LIMIT');
  }

  for (const [blockNumber, expectedBlockHash] of [...hashesByBlock].sort((left, right) => (
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
  ))) {
    const canonicalHash = await canonicalBlockHash(providers, blockNumber);
    if (canonicalHash !== expectedBlockHash) {
      throw new MarksOperatorError('MARKS_EVENT_BLOCK_HASH_MISMATCH');
    }
    const [primarySlot, secondarySlot] = await Promise.all([
      providers[0].getStorageAt(SNAP_PROXY_ADDRESS, EIP_1967_IMPLEMENTATION_SLOT, blockNumber),
      providers[1].getStorageAt(SNAP_PROXY_ADDRESS, EIP_1967_IMPLEMENTATION_SLOT, blockNumber),
    ]);
    const primaryImplementation = implementationFromStorage(primarySlot);
    const secondaryImplementation = implementationFromStorage(secondarySlot);
    if (
      primaryImplementation !== SNAP_APPROVED_IMPLEMENTATION
      || secondaryImplementation !== SNAP_APPROVED_IMPLEMENTATION
    ) {
      throw new MarksOperatorError('MARKS_EVENT_BLOCK_IMPLEMENTATION_MISMATCH');
    }
    const [primaryCode, secondaryCode] = await Promise.all([
      providers[0].getCode(primaryImplementation, blockNumber),
      providers[1].getCode(secondaryImplementation, blockNumber),
    ]);
    if (
      primaryCode === '0x'
      || secondaryCode === '0x'
      || keccak256(primaryCode as Hex) !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
      || keccak256(secondaryCode as Hex) !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
    ) {
      throw new MarksOperatorError('MARKS_EVENT_BLOCK_CODE_MISMATCH');
    }
  }
}

async function scanRange(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<readonly CanonicalSnapBurn[]> {
  const burnRequest = Object.freeze({
    address: SNAP_PROXY_ADDRESS,
    topic0: SNAP_BURN_EVENT_TOPIC,
    fromBlock,
    toBlock,
  });
  const upgradeRequest = Object.freeze({
    address: SNAP_PROXY_ADDRESS,
    topic0: EIP_1967_UPGRADED_EVENT_TOPIC,
    fromBlock,
    toBlock,
  });
  const [primaryLogs, secondaryLogs, primaryUpgrades, secondaryUpgrades] = await Promise.all([
    providers[0].getLogs(burnRequest),
    providers[1].getLogs(burnRequest),
    providers[0].getLogs(upgradeRequest),
    providers[1].getLogs(upgradeRequest),
  ]);
  reconcileProviderUpgrades(
    decodeUpgradeLogs(primaryUpgrades, fromBlock, toBlock),
    decodeUpgradeLogs(secondaryUpgrades, fromBlock, toBlock),
  );
  return reconcileProviderBurns(
    decodeProviderLogs(primaryLogs, fromBlock, toBlock),
    decodeProviderLogs(secondaryLogs, fromBlock, toBlock),
  );
}

function aliasAccount(fid: bigint, key: string): string {
  if (new TextEncoder().encode(key).byteLength < 32) {
    throw new MarksOperatorError('MARKS_ALIAS_KEY_TOO_SHORT');
  }
  return `acct_${createHmac('sha256', key).update(`fid:${fid}`).digest('hex').slice(0, 24)}`;
}

async function canonicalBlockHash(
  providers: readonly [EthereumReadProvider, EthereumReadProvider],
  blockNumber: bigint,
): Promise<string> {
  const [primary, secondary] = await Promise.all([
    providers[0].getBlock(blockNumber),
    providers[1].getBlock(blockNumber),
  ]).then(values => values.map(normalizedBlock) as [RpcBlock, RpcBlock]);
  if (
    primary.number !== blockNumber
    || secondary.number !== blockNumber
    || primary.hash !== secondary.hash
  ) {
    throw new MarksOperatorError('MARKS_BLOCK_PROVIDER_DISAGREEMENT');
  }
  return primary.hash;
}

export async function runDryScan(input: DryRunScanInput): Promise<PrivacySafeScanReport> {
  if (input.providers.length !== 2) throw new MarksOperatorError('MARKS_TWO_PROVIDERS_REQUIRED');
  if (input.trustedWallets.length > 10_000) throw new MarksOperatorError('MARKS_ATTRIBUTION_INPUT_TOO_LARGE');
  if (input.trustedWallets.some(wallet => (
    wallet.whitelisted !== true
    || wallet.active !== true
    || wallet.fid <= 0n
    || wallet.fid > BigInt(Number.MAX_SAFE_INTEGER)
  ))) {
    throw new MarksOperatorError('MARKS_ATTRIBUTION_NOT_WHITELISTED');
  }
  const maximumRanges = input.maximumRanges ?? DEFAULT_MAX_SCAN_RANGES;
  if (!Number.isSafeInteger(maximumRanges) || maximumRanges < 1 || maximumRanges > 256) {
    throw new MarksOperatorError('MARKS_MAX_RANGES_INVALID');
  }

  await assertMainnetProviders(input.providers);
  const finalizedHead = await commonFinalizedBlock(input.providers);
  if (input.cursor) await assertCursorCanonical(input.providers, input.cursor);
  await assertAttestation(input.providers, finalizedHead.number);

  const fromBlock = input.cursor
    ? input.cursor.lastFinalizedBlock + 1n
    : SNAP_PROXY_DEPLOYMENT_BLOCK;
  if (fromBlock > finalizedHead.number + 1n) {
    throw new MarksOperatorError('MARKS_CURSOR_AHEAD_OF_FINALIZED');
  }
  // Bound the planning horizon before allocating range records. Two providers
  // agreeing on an implausibly distant head must not turn the local dry-run
  // into an unbounded allocation before the configured range cap is applied.
  const maximumBlocksThisRun = DEFAULT_MAX_LOG_RANGE * BigInt(maximumRanges);
  const boundedThroughBlock = fromBlock <= finalizedHead.number
    ? (
        fromBlock + maximumBlocksThisRun - 1n < finalizedHead.number
          ? fromBlock + maximumBlocksThisRun - 1n
          : finalizedHead.number
      )
    : undefined;
  const ranges = boundedThroughBlock === undefined
    ? []
    : planBoundedBlockRanges(fromBlock, boundedThroughBlock, DEFAULT_MAX_LOG_RANGE);
  const burns: CanonicalSnapBurn[] = [];
  for (const range of ranges) {
    const rangeBurns = await scanRange(input.providers, range.fromBlock, range.toBlock);
    if (rangeBurns.length > MAX_CANONICAL_BURNS_PER_RUN - burns.length) {
      throw new MarksOperatorError('MARKS_EVENT_LIMIT_EXCEEDED');
    }
    burns.push(...rangeBurns);
  }
  await assertApprovedEventBlockImplementations(input.providers, burns);
  const attribution = attributeCanonicalSnapBurns(burns, input.trustedWallets);
  const throughBlock = ranges.length > 0
    ? ranges[ranges.length - 1].toBlock
    : input.cursor?.lastFinalizedBlock ?? finalizedHead.number;
  const throughBlockHash = throughBlock === finalizedHead.number
    ? finalizedHead.hash
    : await canonicalBlockHash(input.providers, throughBlock);
  const finalHeadHash = await canonicalBlockHash(input.providers, finalizedHead.number);
  if (finalHeadHash !== finalizedHead.hash) {
    throw new MarksOperatorError('MARKS_FINALIZED_REORG_DETECTED');
  }

  const accountTotals = input.reportAliasKey === undefined
    ? undefined
    : Object.freeze([...attribution.perFidMicros]
      .map(([fid, creditedMicros]) => Object.freeze({
        accountAlias: aliasAccount(fid, input.reportAliasKey as string),
        creditedMicros: creditedMicros.toString(),
      }))
      .sort((left, right) => left.accountAlias.localeCompare(right.accountAlias)));

  return Object.freeze({
    schemaVersion: 1,
    command: 'scan',
    dryRun: true,
    network: 'ethereum-mainnet',
    policyId: SNAP_MARK_POLICY_ID,
    finalizedHead: Object.freeze({
      blockNumber: finalizedHead.number.toString(),
      blockHash: finalizedHead.hash,
    }),
    cursor: Object.freeze({
      lastFinalizedBlock: throughBlock.toString(),
      lastFinalizedBlockHash: throughBlockHash,
    }),
    range: Object.freeze({
      fromBlock: fromBlock.toString(),
      throughBlock: throughBlock.toString(),
      rangesProcessed: ranges.length,
      maximumBlocksPerRange: '2000',
      completeThroughFinalizedHead: throughBlock === finalizedHead.number,
    }),
    attestation: Object.freeze({
      approved: true,
      eip1967Resolved: true,
      proxyBytecodePinned: true,
      implementationBytecodePinned: true,
      metadataPinned: true,
      canonicalBurnEventPinned: true,
      upgradeHistoryPinned: true,
      eventBlockImplementationsPinned: true,
    }),
    attribution: privacySafeAttributionSummary(attribution),
    ...(accountTotals ? { accountTotals } : {}),
  });
}

export type ReconciliationAggregate = Readonly<{
  policyId: string;
  creditedEvents: number;
  creditedAccounts: number;
  creditedMicros: string;
}>;

function checkedAggregate(value: ReconciliationAggregate): ReconciliationAggregate {
  const microsAreCanonical = /^(?:0|[1-9][0-9]*)$/.test(value.creditedMicros)
    && value.creditedMicros.length <= MAX_U128.toString().length
    && BigInt(value.creditedMicros) <= MAX_U128;
  if (
    value.policyId !== SNAP_MARK_POLICY_ID
    || !Number.isSafeInteger(value.creditedEvents)
    || value.creditedEvents < 0
    || !Number.isSafeInteger(value.creditedAccounts)
    || value.creditedAccounts < 0
    || !microsAreCanonical
  ) {
    throw new MarksOperatorError('MARKS_RECONCILIATION_INPUT_INVALID');
  }
  return value;
}

export function reconcilePrivacySafeAggregates(input: Readonly<{
  scan: ReconciliationAggregate;
  database: ReconciliationAggregate;
}>): Readonly<{
  schemaVersion: 1;
  command: 'reconcile';
  reconciled: true;
  policyId: string;
  creditedEvents: number;
  creditedAccounts: number;
  creditedMicros: string;
}> {
  const scan = checkedAggregate(input.scan);
  const database = checkedAggregate(input.database);
  if (JSON.stringify(scan) !== JSON.stringify(database)) {
    throw new MarksOperatorError('MARKS_RECONCILIATION_MISMATCH');
  }
  return Object.freeze({
    schemaVersion: 1,
    command: 'reconcile',
    reconciled: true,
    ...scan,
  });
}
