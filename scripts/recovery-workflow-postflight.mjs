import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyRecoveryWorkflowLivePostflight } from './recovery-workflow-live-postflight.mjs';
import { reconcileRecoveryWorkflowCurrentRun } from './recovery-workflow-reconcile-current-run.mjs';
import { verifyRecoverySignedPayload } from './recovery-authorization-protocol.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_POSTFLIGHT_INVALID'); };

/** Completes current-job postflight evidence, not full release acceptance.
 * Even failed public verification must attempt reconciliation of the existing row. */
export async function runRecoveryWorkflowPostflight(...args) {
  try {
    if (args.length !== 0) fail();
    let live;
    try { live = await verifyRecoveryWorkflowLivePostflight(); } catch { /* reconcile ambiguity below */ }
    const terminal = await reconcileRecoveryWorkflowCurrentRun();
    if (live?.liveAttestationVerified !== true || terminal.outcome !== 'completed') fail();
    const payload = verifyRecoverySignedPayload(terminal.terminalJws, 'terminal');
    if (payload.outcome !== 'completed' || payload.deploymentAttestationSha256 !== live.deploymentAttestationSha256) fail();
    return Object.freeze({ outcome: 'completed', deploymentAttestationSha256: live.deploymentAttestationSha256,
      terminalJws: terminal.terminalJws });
  } catch { fail(); }
}

let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* import only */ }
if (direct) {
  try {
    if (process.argv.length !== 2) fail();
    process.stdout.write(`${JSON.stringify(await runRecoveryWorkflowPostflight())}\n`);
  } catch {
    process.stderr.write('RECOVERY_WORKFLOW_POSTFLIGHT_INVALID\n');
    process.exitCode = 1;
  }
}
