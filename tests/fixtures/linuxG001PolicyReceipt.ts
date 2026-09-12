import { createGenesis001LinuxPolicyReceipt } from '../../scripts/genesis001-linux-policy-receipt.mjs';
/** Synthetic evidence for pure consumer tests; never native or private authority. */
export function linuxG001PolicyExecution(observation: {
  sourceCommit: string;
}) {
  return {
    profile: 'warpkeep-g001-linux-policy-execution-v1',
    sourceCommit: observation.sourceCommit,
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
    policyObservationReceipt: observation,
  };
}
export function linuxG001PolicyReceipt(observation: { sourceCommit: string }) {
  return createGenesis001LinuxPolicyReceipt(
    linuxG001PolicyExecution(observation),
    observation.sourceCommit,
  );
}
