import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { buildRecoveryWorkflowModule } from './recovery-workflow-bundle-engine.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID'); };

/** In-memory module build, not an attested compiler or release installation.
 * Output belongs beside its TS entrypoint; root MJS modules retain their URLs.
 */
export async function buildRecoveryWorkflowArtifactModule(...args) {
  if (args.length !== 0) fail();
  return buildRecoveryWorkflowModule(ROOT, build, 'artifact');
}
export async function buildRecoveryWorkflowClaimModule(...args) {
  if (args.length !== 0) fail();
  return buildRecoveryWorkflowModule(ROOT, build, 'claim');
}
