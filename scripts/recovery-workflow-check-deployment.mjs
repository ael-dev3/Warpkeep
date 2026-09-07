import { readRecoveryWorkflowCurrentContext } from './recovery-workflow-current-context.mjs';
import { checkPersistedRecoveryDeploymentBoundary } from './recovery-workflow-deployment-boundary.mjs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_DEPLOYMENT_CHECK_INVALID'); };

/** Immediate check only. No deployment effect or reusable authorization output. */
export async function checkRecoveryWorkflowDeployment(...args) {
  let context;
  try {
    if (args.length !== 0) fail();
    context = await readRecoveryWorkflowCurrentContext();
    await checkPersistedRecoveryDeploymentBoundary(context.privateRoot, context.bindingSource, context.contextSource);
    return Object.freeze({ boundaryChecked: true });
  } catch { fail(); }
  finally { context = undefined; }
}

let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* import only */ }
if (direct) {
  try {
    if (process.argv.length !== 2) fail();
    await checkRecoveryWorkflowDeployment();
    process.stdout.write('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_CHECKED\n');
  } catch {
    process.stderr.write('RECOVERY_WORKFLOW_DEPLOYMENT_CHECK_INVALID\n');
    process.exitCode = 1;
  }
}
