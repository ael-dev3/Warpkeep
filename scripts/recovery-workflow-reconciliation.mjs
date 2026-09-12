import { createHash } from 'node:crypto';
import { readRecoveryClaimHandoffForReconciliation } from './recovery-claim-handoff.mjs';
import { requestFreshRecoveryOidc } from './recovery-workflow-oidc.mjs';
import { requestRecovery } from './recovery-authorization-client.mjs';
import { verifyRecoveryTerminal } from './verify-recovery-terminal.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_RECONCILIATION_INVALID'); };

/** Reopens an existing claim for reconciliation only. Context must be independently established. */
export function resumeRecoveryWorkflowReconciliation(...args) {
  let retained;
  let phase = 'ready';
  const tokenHashes = new Set();
  try {
    if (args.length !== 2) fail();
    const [privateRoot, contextSource] = args;
    retained = readRecoveryClaimHandoffForReconciliation(privateRoot, contextSource);
    return Object.freeze({
      async reconcile() {
        if (phase !== 'ready') fail();
        phase = 'requesting';
        let oidcToken;
        try {
          oidcToken = await requestFreshRecoveryOidc();
          if (phase !== 'requesting') fail();
          const hash = createHash('sha256').update(oidcToken).digest('hex');
          if (tokenHashes.has(hash)) fail();
          tokenHashes.add(hash);
          // Re-read after OIDC acquisition: that wait can cross the deadline,
          // and storage may have changed since this process opened it.
          const current = readRecoveryClaimHandoffForReconciliation(privateRoot, contextSource);
          if (current.claimReceiptJws !== retained.claimReceiptJws || current.expectedSource !== retained.expectedSource) fail();
          const expected = JSON.parse(current.expectedSource);
          const body = JSON.stringify({ requestId: expected.requestId, candidateCommit: expected.candidateCommit,
            sourceVerifyRunId: expected.sourceVerifyRunId, sourceVerifyRunAttempt: expected.sourceVerifyRunAttempt,
            artifactId: expected.artifactId, oidcToken, claimReceiptJws: current.claimReceiptJws });
          const { terminalJws } = await requestRecovery('reconcile', body);
          oidcToken = undefined;
          if (phase !== 'requesting') fail();
          const result = verifyRecoveryTerminal(terminalJws, retained.expectedSource, Math.floor(Date.now() / 1000));
          phase = 'finished'; retained = undefined; tokenHashes.clear();
          // Only the verified public terminal attestation may leave this session.
          return Object.freeze({ ...result, terminalJws });
        } catch {
          if (phase !== 'disposed') phase = 'ready';
          fail();
        } finally { oidcToken = undefined; }
      },
      dispose() { phase = 'disposed'; retained = undefined; tokenHashes.clear(); },
    });
  } catch { retained = undefined; tokenHashes.clear(); fail(); }
}
