import { parseRecoveryBinding } from './recovery-activation-candidate.mjs';
import { readRecoveryClaimHandoffForDeployment } from './recovery-claim-handoff.mjs';
import { requestRecovery } from './recovery-authorization-client.mjs';
import { verifyRecoveryStatus } from './verify-recovery-status.mjs';
import { verifyRecoveryClaimReceipt } from './verify-recovery-claim-receipt.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID'); };

/** Separate-process preflight only; no deployment effect or durable permission.
 * The caller must independently establish the current source/artifact context.
 */
export async function checkPersistedRecoveryDeploymentBoundary(...args) {
  let retained, current;
  try {
    if (args.length !== 3) fail();
    const [privateRoot, bindingSource, contextSource] = args;
    const binding = parseRecoveryBinding(bindingSource);
    retained = readRecoveryClaimHandoffForDeployment(privateRoot, contextSource);
    const expected = JSON.parse(retained.expectedSource);
    if (expected.requestId !== binding.recoveryAuthorizationRequestId
        || expected.authorizationEpoch !== binding.recoveryAuthorizationEpoch) fail();
    const { statusJws } = await requestRecovery('status', '{}');
    verifyRecoveryStatus(statusJws, binding.recoveryAuthorizationEpoch, Math.floor(Date.now() / 1000));
    // The network wait can cross receipt expiry or permit storage substitution.
    current = readRecoveryClaimHandoffForDeployment(privateRoot, contextSource);
    if (current.claimReceiptJws !== retained.claimReceiptJws || current.expectedSource !== retained.expectedSource) fail();
    return verifyRecoveryClaimReceipt(current.claimReceiptJws, current.expectedSource, Math.floor(Date.now() / 1000));
  } catch { fail(); }
  finally { retained = undefined; current = undefined; }
}
