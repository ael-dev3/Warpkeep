// @vitest-environment node
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, statSync, symlinkSync, unlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { recoveryAuthorizationFixture } from './fixtures/recoveryAuthorizationFixture';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), correlation: vi.fn() }));
vi.mock('../scripts/verify-recovery-claim-receipt.mjs', () => ({ verifyRecoveryClaimReceipt: mocks.claim, verifyRecoveryClaimCorrelation: mocks.correlation }));
import { writeRecoveryClaimHandoff, readRecoveryClaimHandoffForDeployment, readRecoveryClaimHandoffForReconciliation } from '../scripts/recovery-claim-handoff.mjs';
const context = recoveryAuthorizationFixture().context;
const contextSource = JSON.stringify(context);
// Filesystem tests mock cryptographic verification; signed grammar has its own suite.
const expectedSource = JSON.stringify(context);
let root: string;
const file = () => join(root, 'recovery-claim-v1.json');
const test = it.skipIf(process.platform !== 'linux');
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-private-handoff-'));
  vi.resetAllMocks(); mocks.correlation.mockReturnValue({ claimDeadline: 2200 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
test('writes a private exclusive file and reopens it with both receipt checks', () => {
  expect(writeRecoveryClaimHandoff(root, 'private-claim', expectedSource)).toEqual({ claimDeadline: 2200 });
  expect(statSync(file()).mode & 0o777).toBe(0o600);
  expect(readFileSync(file(), 'utf8')).not.toContain('authorizationJws');
  expect(readRecoveryClaimHandoffForDeployment(root, contextSource)).toEqual({ claimReceiptJws: 'private-claim', expectedSource });
  expect(mocks.claim).toHaveBeenCalledTimes(2);
  expect(readRecoveryClaimHandoffForReconciliation(root, contextSource)).toEqual({ claimReceiptJws: 'private-claim', expectedSource });
  expect(mocks.claim).toHaveBeenCalledTimes(2);
});
test('refuses replacement of an existing handoff', () => {
  writeRecoveryClaimHandoff(root, 'original', expectedSource);
  const before = readFileSync(file());
  expect(() => writeRecoveryClaimHandoff(root, 'replacement', expectedSource)).toThrow('RECOVERY_CLAIM_HANDOFF_INVALID');
  expect(readFileSync(file())).toEqual(before);
});
test('refuses a directory accessible by another user', () => {
  chmodSync(root, 0o755);
  expect(() => writeRecoveryClaimHandoff(root, 'private-claim', expectedSource)).toThrow('RECOVERY_CLAIM_HANDOFF_INVALID');
});
test('refuses broadened file permissions and hard links', () => {
  writeRecoveryClaimHandoff(root, 'private-claim', expectedSource); chmodSync(file(), 0o644);
  expect(() => readRecoveryClaimHandoffForDeployment(root, contextSource)).toThrow();
  chmodSync(file(), 0o600); linkSync(file(), join(root, 'copy'));
  expect(() => readRecoveryClaimHandoffForReconciliation(root, contextSource)).toThrow();
});
test('rejects symlink files rather than following them', () => {
  writeFileSync(join(root, 'other'), '{}', { mode: 0o600 }); symlinkSync(join(root, 'other'), file());
  expect(() => readRecoveryClaimHandoffForReconciliation(root, contextSource)).toThrow();
  expect(readFileSync(join(root, 'other'), 'utf8')).toBe('{}');
});
test('rejects another run or artifact on reopen', () => {
  writeRecoveryClaimHandoff(root, 'private-claim', expectedSource);
  expect(() => readRecoveryClaimHandoffForDeployment(root, JSON.stringify({ ...context, artifactId: '999' }))).toThrow();
});
test('rejects a modified stored deadline and noncanonical bytes', () => {
  writeRecoveryClaimHandoff(root, 'private-claim', expectedSource);
  const value = JSON.parse(readFileSync(file(), 'utf8')); value.claimDeadline++;
  writeFileSync(file(), JSON.stringify(value));
  expect(() => readRecoveryClaimHandoffForReconciliation(root, contextSource)).toThrow();
  value.claimDeadline--; writeFileSync(file(), `${JSON.stringify(value)}\n`);
  expect(() => readRecoveryClaimHandoffForReconciliation(root, contextSource)).toThrow();
});
test('retains strict deployment expiry while allowing only verified reconciliation', () => {
  writeRecoveryClaimHandoff(root, 'private-claim', expectedSource);
  mocks.claim.mockImplementation(() => { throw new Error('expired'); });
  expect(() => readRecoveryClaimHandoffForDeployment(root, contextSource)).toThrow();
  expect(readRecoveryClaimHandoffForReconciliation(root, contextSource).claimReceiptJws).toBe('private-claim');
  mocks.correlation.mockImplementation(() => { throw new Error('deadline'); });
  expect(() => readRecoveryClaimHandoffForReconciliation(root, contextSource)).toThrow();
});
it.skipIf(process.platform === 'linux')('requires Linux rather than silently weakening filesystem checks', () => {
  expect(() => writeRecoveryClaimHandoff(root, 'private-claim', expectedSource)).toThrow('RECOVERY_CLAIM_HANDOFF_INVALID');
});
