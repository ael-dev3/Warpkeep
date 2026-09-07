import { readRecoveryWorkflowArtifact } from './read-recovery-workflow-artifact.js';
import { createRecoveryWorkflowPrivateDirectory } from '../../../scripts/recovery-workflow-private-directory.mjs';
import { beginRecoveryWorkflowSession, type RecoveryWorkflowSession } from '../../../scripts/recovery-workflow-session.mjs';
const fail = (): never => { throw new Error('RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID'); };

/** Protected workflow composition, not a deployment operation or reusable permit. */
export async function prepareRecoveryWorkflowClaim(...args: readonly unknown[]): Promise<Readonly<{ claimPersisted: true }>> {
  let session: Readonly<RecoveryWorkflowSession> | undefined;
  try {
    if (args.length !== 0) fail();
    const { bindingSource, contextSource } = await readRecoveryWorkflowArtifact();
    const context = JSON.parse(contextSource);
    const privateRoot = createRecoveryWorkflowPrivateDirectory(context.pagesRunId, context.pagesRunAttempt);
    session = await beginRecoveryWorkflowSession(bindingSource, contextSource, privateRoot);
    // Startup can retain a reconciliation-only session after persistence/status
    // failure. Do not report preparation success for that session.
    await session.checkDeploymentBoundary();
    return Object.freeze({ claimPersisted: true });
  } catch {
    // Before deployment, a failed prepared claim can only be reconciled.
    // Preserve disk state if reconciliation is unavailable; never reissue.
    if (session !== undefined) { try { await session.finish('reconcile'); } catch { /* fixed preparation failure below */ } }
    return fail();
  } finally { session?.dispose(); }
}
