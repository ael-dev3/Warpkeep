// @vitest-environment node
import { it, expect } from 'vitest';
import {
  createGenesis001LinuxPolicyReceipt,
  verifyGenesis001LinuxPolicyReceipt,
} from '../scripts/genesis001-linux-policy-receipt.mjs';
import {
  GENESIS_001_DATABASE_IDENTITY,
  GENESIS_001_FREEZE_RELEASE_NONCE,
  GENESIS_001_SOURCE_BASELINE_COMMIT,
  GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
  genesis001PolicyReceiptDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';
function execution() {
  const commit = 'a'.repeat(40);
  const policy = {
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT,
    freezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE,
  };
  return {
    profile: 'warpkeep-g001-linux-policy-execution-v1',
    sourceCommit: commit,
    sourceTree: 'b'.repeat(40),
    operatorBlob: 'c'.repeat(40),
    operatorSha256: 'd'.repeat(64),
    runtime: {
      profile: 'warpkeep-g001-policy-observation-linux-x64-v1',
      nodeVersion: 'v22.22.3',
      nodeSha256:
        'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2',
    },
    dependencyClosureSha256: 'e'.repeat(64),
    execution: {
      runId: '1'.repeat(32),
      bundleSha256: 'f'.repeat(64),
      sourceClosureSha256: '2'.repeat(64),
    },
    cleanup: {
      outcome: 'cleaned',
      runId: '1'.repeat(32),
      namespaceInventorySha256: '3'.repeat(64),
    },
    policyObservationReceipt: {
      schemaVersion: 1,
      profile: GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
      sourceCommit: commit,
      observedAt: '2026-09-08T20:00:00.000Z',
      databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
      procedure: 'genesis_001_access_policy_v1',
      mutationSubmitted: false,
      policy,
      policyReceiptDigest: genesis001PolicyReceiptDigest(policy),
    },
  };
}
it('retains honest Linux provenance and exact closed policy', () => {
  const receipt = createGenesis001LinuxPolicyReceipt(
    execution(),
    'a'.repeat(40),
  );
  expect(receipt.profile).toBe('warpkeep-g001-linux-policy-observation-v1');
  expect(receipt).not.toHaveProperty('bootstrapBlob');
  expect(verifyGenesis001LinuxPolicyReceipt(receipt, 'a'.repeat(40))).toEqual(
    receipt,
  );
});
it.each(['source', 'runtime', 'cleanup', 'policy', 'link'])(
  'refuses changed %s provenance',
  (field) => {
    const value = structuredClone(
      createGenesis001LinuxPolicyReceipt(execution(), 'a'.repeat(40)),
    ) as any;
    if (field === 'source') value.protectedCommit = '0'.repeat(40);
    if (field === 'runtime') value.runtime.nodeSha256 = '0'.repeat(64);
    if (field === 'cleanup') value.cleanup.runId = '0'.repeat(32);
    if (field === 'policy')
      value.policyObservationReceipt.policy.admissionStateMutationsEnabled = true;
    if (field === 'link') value.receiptLinkSha256 = '0'.repeat(64);
    expect(() =>
      verifyGenesis001LinuxPolicyReceipt(value, 'a'.repeat(40)),
    ).toThrow('GENESIS_001_LINUX_POLICY_RECEIPT_INVALID');
  },
);
it('does not accept Darwin provenance under the Linux execution profile', () => {
  const value = execution();
  (value.runtime as any).nodeVersion = 'v24.19.0';
  expect(() =>
    createGenesis001LinuxPolicyReceipt(value, 'a'.repeat(40)),
  ).toThrow();
});

it('rejects coercible digest objects without invoking their code', () => {
  const value = execution();
  let called = false;
  (value as any).operatorSha256 = {
    toString() {
      called = true;
      return 'd'.repeat(64);
    },
  };
  expect(() =>
    createGenesis001LinuxPolicyReceipt(value, 'a'.repeat(40)),
  ).toThrow();
  expect(called).toBe(false);
});
