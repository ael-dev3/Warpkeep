export const ETHEREUM_MAINNET_CHAIN_ID = 1;
export const SNAP_PROXY_ADDRESS = '0x49b5a631f54927c0007232844f06fe18cbf69786';
export const SNAP_PROXY_DEPLOYMENT_BLOCK = 25_012_691n;
export const SNAP_APPROVED_IMPLEMENTATION = '0xe9a747d64790d3ed0b647455b2f7503636f5e98a';
export const SNAP_APPROVED_IMPLEMENTATION_CODE_HASH =
  '0x56d5edb395905863637b94ca9fde441c401b42e8353ad6f84deaf201182bf7c7';
export const SNAP_APPROVED_PROXY_CODE_HASH =
  '0xa50288164ca4d99a6c559b6f601c35acc60fbf39e21b8c009d809ff35b955ed0';
export const SNAP_BURN_METHOD = 'Burned(uint256,address,bytes32,uint256,uint32)';
export const SNAP_MARK_POLICY_VERSION = 'snap-current-linked-wallet-1to1-v1';
/** Compatibility export; entry-agreement authority now has its own module. */
export {
  WARPKEEP_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
} from './entryAgreementPolicy';
export const MAX_U128 = (1n << 128n) - 1n;
export const MAX_U256 = (1n << 256n) - 1n;

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

export class MarksAuthorityPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MarksAuthorityPolicyError';
  }
}

export type MarkAccountState = Readonly<{
  totalSnapBurnedMicros: bigint;
  earnedMicros: bigint;
  spentMicros: bigint;
  balanceMicros: bigint;
  policyVersion: string;
}>;

export function markAccountIsConsistent(account: MarkAccountState): boolean {
  return account.totalSnapBurnedMicros >= 0n
    && account.totalSnapBurnedMicros <= MAX_U128
    && account.earnedMicros >= 0n
    && account.earnedMicros <= MAX_U128
    && account.spentMicros >= 0n
    && account.spentMicros <= account.earnedMicros
    && account.balanceMicros === account.earnedMicros - account.spentMicros
    && account.totalSnapBurnedMicros === account.earnedMicros
    && account.policyVersion === SNAP_MARK_POLICY_VERSION;
}

export function applyOneToOneBurnCredit(
  account: MarkAccountState,
  amountMicros: bigint,
): MarkAccountState {
  if (!markAccountIsConsistent(account)) {
    throw new MarksAuthorityPolicyError('MARK_ACCOUNT_INVARIANT');
  }
  if (amountMicros <= 0n || amountMicros > MAX_U128) {
    throw new MarksAuthorityPolicyError('MARK_CREDIT_AMOUNT_INVALID');
  }
  if (
    amountMicros > MAX_U128 - account.totalSnapBurnedMicros
    || amountMicros > MAX_U128 - account.earnedMicros
    || amountMicros > MAX_U128 - account.balanceMicros
  ) {
    throw new MarksAuthorityPolicyError('MARK_ACCOUNT_OVERFLOW');
  }
  return Object.freeze({
    totalSnapBurnedMicros: account.totalSnapBurnedMicros + amountMicros,
    earnedMicros: account.earnedMicros + amountMicros,
    spentMicros: account.spentMicros,
    balanceMicros: account.balanceMicros + amountMicros,
    policyVersion: account.policyVersion,
  });
}

export type SnapBurnCreditInput = Readonly<{
  eventKey: string;
  chainId: number;
  tokenContract: string;
  transactionHash: string;
  logIndex: number;
  burnReference: string;
  burnMethod: string;
  senderAddress: string;
  blockNumber: bigint;
  blockHash: string;
  amountMicros: bigint;
  attributedFid: bigint;
  attributionPolicyVersion: string;
  implementationAddress: string;
  contractCodeHash: string;
}>;

export type CanonicalSnapBurnCredit = Omit<SnapBurnCreditInput, 'implementationAddress'>;

function normalizedAddress(value: string, code: string): string {
  if (!ADDRESS_PATTERN.test(value)) throw new MarksAuthorityPolicyError(code);
  return value.toLowerCase();
}

function normalizedHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new MarksAuthorityPolicyError(code);
  return value.toLowerCase();
}

/**
 * Validates every security-sensitive receipt field against values compiled
 * into the module. Finality/provider agreement remains the bounded local
 * runner's responsibility; this reducer contract cannot query Ethereum.
 */
export function normalizeSnapBurnCredit(
  input: SnapBurnCreditInput,
): CanonicalSnapBurnCredit {
  if (input.chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new MarksAuthorityPolicyError('SNAP_CHAIN_MISMATCH');
  }
  const tokenContract = normalizedAddress(input.tokenContract, 'SNAP_PROXY_INVALID');
  if (tokenContract !== SNAP_PROXY_ADDRESS) {
    throw new MarksAuthorityPolicyError('SNAP_PROXY_MISMATCH');
  }
  const implementationAddress = normalizedAddress(
    input.implementationAddress,
    'SNAP_IMPLEMENTATION_INVALID',
  );
  if (implementationAddress !== SNAP_APPROVED_IMPLEMENTATION) {
    throw new MarksAuthorityPolicyError('SNAP_IMPLEMENTATION_MISMATCH');
  }
  const contractCodeHash = normalizedHash(input.contractCodeHash, 'SNAP_CODE_HASH_INVALID');
  if (contractCodeHash !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH) {
    throw new MarksAuthorityPolicyError('SNAP_CODE_HASH_MISMATCH');
  }
  if (input.burnMethod !== SNAP_BURN_METHOD) {
    throw new MarksAuthorityPolicyError('SNAP_BURN_METHOD_MISMATCH');
  }
  if (input.attributionPolicyVersion !== SNAP_MARK_POLICY_VERSION) {
    throw new MarksAuthorityPolicyError('SNAP_ATTRIBUTION_POLICY_MISMATCH');
  }
  if (input.attributedFid <= 0n) {
    throw new MarksAuthorityPolicyError('SNAP_ATTRIBUTED_FID_INVALID');
  }
  if (!Number.isSafeInteger(input.logIndex) || input.logIndex < 0 || input.logIndex > 0xffff_ffff) {
    throw new MarksAuthorityPolicyError('SNAP_LOG_INDEX_INVALID');
  }
  if (input.blockNumber < SNAP_PROXY_DEPLOYMENT_BLOCK) {
    throw new MarksAuthorityPolicyError('SNAP_BLOCK_NUMBER_INVALID');
  }
  if (input.amountMicros <= 0n || input.amountMicros > MAX_U128) {
    throw new MarksAuthorityPolicyError('SNAP_AMOUNT_INVALID');
  }
  if (!/^[1-9][0-9]{0,77}$/.test(input.burnReference)) {
    throw new MarksAuthorityPolicyError('SNAP_BURN_REFERENCE_INVALID');
  }
  const burnId = BigInt(input.burnReference);
  if (burnId > MAX_U256) throw new MarksAuthorityPolicyError('SNAP_BURN_REFERENCE_INVALID');

  const transactionHash = normalizedHash(input.transactionHash, 'SNAP_TX_HASH_INVALID');
  const blockHash = normalizedHash(input.blockHash, 'SNAP_BLOCK_HASH_INVALID');
  const senderAddress = normalizedAddress(input.senderAddress, 'SNAP_SENDER_INVALID');
  const expectedEventKey = `${ETHEREUM_MAINNET_CHAIN_ID}:${transactionHash}:${input.logIndex}`;
  if (input.eventKey.toLowerCase() !== expectedEventKey) {
    throw new MarksAuthorityPolicyError('SNAP_EVENT_KEY_MISMATCH');
  }

  return Object.freeze({
    eventKey: expectedEventKey,
    chainId: input.chainId,
    tokenContract,
    transactionHash,
    logIndex: input.logIndex,
    burnReference: input.burnReference,
    burnMethod: input.burnMethod,
    senderAddress,
    blockNumber: input.blockNumber,
    blockHash,
    amountMicros: input.amountMicros,
    attributedFid: input.attributedFid,
    attributionPolicyVersion: input.attributionPolicyVersion,
    contractCodeHash,
  });
}

export function snapBurnCreditsEqual(
  left: CanonicalSnapBurnCredit,
  right: CanonicalSnapBurnCredit,
): boolean {
  return left.eventKey === right.eventKey
    && left.chainId === right.chainId
    && left.tokenContract === right.tokenContract
    && left.transactionHash === right.transactionHash
    && left.logIndex === right.logIndex
    && left.burnReference === right.burnReference
    && left.burnMethod === right.burnMethod
    && left.senderAddress === right.senderAddress
    && left.blockNumber === right.blockNumber
    && left.blockHash === right.blockHash
    && left.amountMicros === right.amountMicros
    && left.attributedFid === right.attributedFid
    && left.attributionPolicyVersion === right.attributionPolicyVersion
    && left.contractCodeHash === right.contractCodeHash;
}
