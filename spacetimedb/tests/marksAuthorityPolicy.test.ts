import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_U128,
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_BURN_METHOD,
  SNAP_MARK_POLICY_VERSION,
  SNAP_PROXY_ADDRESS,
  applyOneToOneBurnCredit,
  markAccountIsConsistent,
  normalizeSnapBurnCredit,
  snapBurnCreditsEqual,
} from '../src/marksAuthorityPolicy';

const zeroAccount = Object.freeze({
  totalSnapBurnedMicros: 0n,
  earnedMicros: 0n,
  spentMicros: 0n,
  balanceMicros: 0n,
  policyVersion: SNAP_MARK_POLICY_VERSION,
});

const transactionHash = `0x${'12'.repeat(32)}`;
const blockHash = `0x${'34'.repeat(32)}`;
const canonicalCredit = Object.freeze({
  eventKey: `1:${transactionHash}:9`,
  chainId: 1,
  tokenContract: SNAP_PROXY_ADDRESS,
  transactionHash,
  logIndex: 9,
  burnReference: '123456789',
  burnMethod: SNAP_BURN_METHOD,
  senderAddress: `0x${'56'.repeat(20)}`,
  blockNumber: 25_012_700n,
  blockHash,
  amountMicros: 1_250_000n,
  attributedFid: 42n,
  attributionPolicyVersion: SNAP_MARK_POLICY_VERSION,
  implementationAddress: SNAP_APPROVED_IMPLEMENTATION,
  contractCodeHash: SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
});

test('one SNAP micro credits exactly one Mark micro without floating point', () => {
  assert.equal(markAccountIsConsistent(zeroAccount), true);
  const credited = applyOneToOneBurnCredit(zeroAccount, 1_250_000n);
  assert.deepEqual(credited, {
    totalSnapBurnedMicros: 1_250_000n,
    earnedMicros: 1_250_000n,
    spentMicros: 0n,
    balanceMicros: 1_250_000n,
    policyVersion: SNAP_MARK_POLICY_VERSION,
  });
  assert.equal(markAccountIsConsistent(credited), true);
});

test('Mark account corruption and u128 overflow fail closed before credit', () => {
  assert.equal(markAccountIsConsistent({ ...zeroAccount, balanceMicros: 1n }), false);
  assert.equal(markAccountIsConsistent({ ...zeroAccount, spentMicros: 1n }), false);
  assert.throws(
    () => applyOneToOneBurnCredit({ ...zeroAccount, balanceMicros: 1n }, 1n),
    /MARK_ACCOUNT_INVARIANT/,
  );
  assert.throws(
    () => applyOneToOneBurnCredit({
      ...zeroAccount,
      totalSnapBurnedMicros: MAX_U128,
      earnedMicros: MAX_U128,
      balanceMicros: MAX_U128,
    }, 1n),
    /MARK_ACCOUNT_OVERFLOW/,
  );
});

test('burn receipts pin chain, proxy, implementation, code hash, method, policy, and event key', () => {
  const normalized = normalizeSnapBurnCredit(canonicalCredit);
  assert.equal(normalized.amountMicros, canonicalCredit.amountMicros);
  assert.equal(normalized.eventKey, canonicalCredit.eventKey);
  assert.equal(snapBurnCreditsEqual(normalized, normalized), true);

  const mismatches = [
    [{ chainId: 10 }, 'SNAP_CHAIN_MISMATCH'],
    [{ tokenContract: `0x${'aa'.repeat(20)}` }, 'SNAP_PROXY_MISMATCH'],
    [{ implementationAddress: `0x${'bb'.repeat(20)}` }, 'SNAP_IMPLEMENTATION_MISMATCH'],
    [{ contractCodeHash: `0x${'cc'.repeat(32)}` }, 'SNAP_CODE_HASH_MISMATCH'],
    [{ burnMethod: 'Transfer(address,address,uint256)' }, 'SNAP_BURN_METHOD_MISMATCH'],
    [{ attributionPolicyVersion: 'another-policy' }, 'SNAP_ATTRIBUTION_POLICY_MISMATCH'],
    [{ eventKey: `1:${transactionHash}:10` }, 'SNAP_EVENT_KEY_MISMATCH'],
    [{ blockNumber: 25_012_690n }, 'SNAP_BLOCK_NUMBER_INVALID'],
    [{ amountMicros: 0n }, 'SNAP_AMOUNT_INVALID'],
  ] as const;
  for (const [change, code] of mismatches) {
    assert.throws(
      () => normalizeSnapBurnCredit({ ...canonicalCredit, ...change }),
      new RegExp(code),
    );
  }
});

test('an event key can be idempotent only when every immutable receipt field matches', () => {
  const normalized = normalizeSnapBurnCredit(canonicalCredit);
  assert.equal(snapBurnCreditsEqual(normalized, { ...normalized }), true);
  assert.equal(snapBurnCreditsEqual(normalized, {
    ...normalized,
    amountMicros: normalized.amountMicros + 1n,
  }), false);
  assert.equal(snapBurnCreditsEqual(normalized, {
    ...normalized,
    attributedFid: normalized.attributedFid + 1n,
  }), false);
});
