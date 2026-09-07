import { createHash } from 'node:crypto';
import { parseRecoveryBindingV2 } from './recovery-activation-candidate.mjs';
import { requestFreshRecoveryOidc } from './recovery-workflow-oidc.mjs';
import { requestRecovery } from './recovery-authorization-client.mjs';
import { verifyRecoveryAuthorization } from './verify-recovery-authorization-jws.mjs';
import { verifyRecoveryClaimReceipt, verifyRecoveryClaimCorrelation } from './verify-recovery-claim-receipt.mjs';
import { verifyRecoveryStatus } from './verify-recovery-status.mjs';
import { verifyRecoveryTerminal } from './verify-recovery-terminal.mjs';

const CONTEXT_KEYS = ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
  'candidateCommit', 'candidateTree', 'artifactId', 'githubArtifactArchiveSha256',
  'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256'];
const fail = () => { throw new Error('RECOVERY_WORKFLOW_SESSION_INVALID'); };
const now = () => Math.floor(Date.now() / 1000);

/** In-memory integration only. Caller must independently verify source/artifact context.
 * No deployment effect, durable handoff, raw-JWS getter or credential output exists here.
 */
export async function beginRecoveryWorkflowSession(...args) {
  let authorizationJws, claimReceiptJws, claimExpectedSource;
  let phase = 'starting';
  const tokenHashes = new Set();
  try {
    const [bindingSource, expectedSource] = args;
    if (args.length !== 2 || typeof expectedSource !== 'string' || expectedSource.length > 16384) fail();
    const context = JSON.parse(expectedSource);
    if (!context || Array.isArray(context) || typeof context !== 'object'
        || Object.keys(context).join(',') !== CONTEXT_KEYS.join(',') || JSON.stringify(context) !== expectedSource
        || CONTEXT_KEYS.some(key => typeof context[key] !== 'string'
          || !(key.endsWith('Id') || key.endsWith('Attempt') ? /^[1-9][0-9]{0,19}$/u
            : key.startsWith('candidate') ? /^[a-f0-9]{40}$/u : /^[a-f0-9]{64}$/u).test(context[key]))
        || context.pagesRunId === context.sourceVerifyRunId) fail();
    const binding = parseRecoveryBindingV2(bindingSource);
    const locators = Object.freeze({ requestId: binding.recoveryAuthorizationRequestId,
      candidateCommit: context.candidateCommit, sourceVerifyRunId: context.sourceVerifyRunId,
      sourceVerifyRunAttempt: context.sourceVerifyRunAttempt, artifactId: context.artifactId });
    const epoch = binding.recoveryAuthorizationEpoch;
    async function request(endpoint, extra = {}) {
      let oidcToken;
      try {
        oidcToken = await requestFreshRecoveryOidc();
        if (phase === 'disposed') fail();
        const hash = createHash('sha256').update(oidcToken).digest('hex');
        if (tokenHashes.has(hash)) fail();
        tokenHashes.add(hash);
        if (endpoint === 'complete' || endpoint === 'reconcile') {
          verifyRecoveryClaimCorrelation(claimReceiptJws, claimExpectedSource, now());
        }
        return await requestRecovery(endpoint, JSON.stringify({ ...locators, oidcToken, ...extra }));
      } finally { oidcToken = undefined; }
    }
    async function status() {
      const response = await requestRecovery('status', '{}');
      verifyRecoveryStatus(response.statusJws, epoch, now());
    }
    ({ authorizationJws } = await request('issue'));
    ({ claimExpectedSource } = verifyRecoveryAuthorization(authorizationJws, bindingSource, expectedSource, now()));
    ({ claimReceiptJws } = await request('claim', { authorizationJws }));
    verifyRecoveryClaimReceipt(claimReceiptJws, claimExpectedSource, now());
    authorizationJws = undefined;
    phase = 'claimed';
    try { await status(); } catch { phase = 'reconcile-only'; }
    return Object.freeze({
      async checkDeploymentBoundary() {
        if (phase !== 'claimed') fail();
        phase = 'checking';
        try {
          await status();
          if (phase !== 'checking') fail();
          const result = verifyRecoveryClaimReceipt(claimReceiptJws, claimExpectedSource, now());
          phase = 'boundary-checked';
          return result;
        } catch { if (phase !== 'disposed') phase = 'reconcile-only'; fail(); }
      },
      async finish(endpoint) {
        if (!['complete', 'reconcile'].includes(endpoint)
            || !['claimed', 'boundary-checked', 'reconcile-only'].includes(phase)
            || (endpoint === 'complete' && phase !== 'boundary-checked')) fail();
        phase = 'finishing';
        try {
          // A terminal response is correlated with the original claim context;
          // the expired receipt is not reused as a deployment-time permit.
          const { terminalJws } = await request(endpoint, { claimReceiptJws });
          if (phase !== 'finishing') fail();
          const result = verifyRecoveryTerminal(terminalJws, claimExpectedSource, now());
          phase = 'finished'; claimReceiptJws = undefined; claimExpectedSource = undefined; tokenHashes.clear();
          return result;
        } catch { if (phase !== 'disposed') phase = 'reconcile-only'; fail(); }
      },
      dispose() {
        phase = 'disposed'; authorizationJws = undefined; claimReceiptJws = undefined;
        claimExpectedSource = undefined; tokenHashes.clear();
      },
    });
  } catch {
    authorizationJws = undefined; claimReceiptJws = undefined; claimExpectedSource = undefined; tokenHashes.clear();
    fail();
  }
}
