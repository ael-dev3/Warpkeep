import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readRecoveryWorkflowCurrentContext } from './recovery-workflow-current-context.mjs';
import { resumeRecoveryWorkflowReconciliation } from './recovery-workflow-reconciliation.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID'); };

/** Current protected job only. Reconcile an existing claim; never reissue or deploy. */
export async function reconcileRecoveryWorkflowCurrentRun(...args) {
  let context, session;
  try {
    if (args.length !== 0) fail();
    context = await readRecoveryWorkflowCurrentContext();
    session = resumeRecoveryWorkflowReconciliation(context.privateRoot, context.contextSource);
    const result = await session.reconcile();
    // Explicit projection: no private claim, context, or unsigned response output.
    if (!['completed', 'not-deployed'].includes(result.outcome)
        || typeof result.terminalJws !== 'string' || result.terminalJws.length === 0
        || result.terminalJws.length > 16384) fail();
    return Object.freeze({ outcome: result.outcome, terminalJws: result.terminalJws });
  } catch { fail(); }
  finally { session?.dispose(); context = undefined; session = undefined; }
}

let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* import only */ }
if (direct) {
  try {
    if (process.argv.length !== 2) fail();
    const result = await reconcileRecoveryWorkflowCurrentRun();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID\n');
    process.exitCode = 1;
  }
}
