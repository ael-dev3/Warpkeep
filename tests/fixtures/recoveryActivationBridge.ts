import { createHash } from 'node:crypto';
import { canonicalAuthBridgeNotificationPreparedReceiptPublication } from '../../scripts/auth-bridge-notification-prepared-receipt.mjs';
import { createSealedRealmsProductionAuthBridgeState, createSealedRealmsProductionAuthBridgeStateTestCapability } from '../../scripts/sealed-realms-production-auth-bridge-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../../scripts/sealed-realms-production-source-authority.mjs';
import { createSealedRealmsProductionContinuationStore, issueSealedRealmsProductionContinuation, claimSealedRealmsProductionContinuation } from '../../scripts/sealed-realms-production-continuation.mjs';
import { issueSealedRealmsProductionWorkflowPermit } from '../../scripts/sealed-realms-production-workflow-authority.mjs';
import { createSealedRealmsProductionActivationDispatchContext, createSealedRealmsProductionActivationLane,
  createSealedRealmsProductionActivationDispatcher } from '../../scripts/sealed-realms-production-activation-lane-entry.mjs';
import type { SealedRealmsProductionAuthBridgeState, SealedRealmsProductionActivationEvidenceGenerator } from '../../scripts/sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionPrivateState } from '../../scripts/sealed-realms-production-private-state.mjs';

const SOURCE = 'a'.repeat(40);
const NOW = '2026-08-28T12:02:00.000Z';
export const RECOVERY_TEST_VERSION = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT = '223e4567-e89b-42d3-a456-426614174000';

export function recoveryOperationAuthority(operation: string, source = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never, workflowInputSha: source, readGit: () => `${source}\n`,
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

export async function recoveryProtectedContext(
  state: SealedRealmsProductionPrivateState, operation: string, runId: string,
  completed = new Set<string>(), source = SOURCE,
) {
  const sourceAuthority = recoveryOperationAuthority(operation, source);
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority, githubToken: 'github-sealed-realms-owner-token', runId, runAttempt: '1',
    fetchImpl: (async (request: string) => {
      const requestedRun = /\/runs\/([1-9][0-9]*)$/u.exec(request)?.[1] ?? runId;
      const body = request.endsWith('/branches/main')
        ? { name: 'main', protected: true, commit: { sha: source } }
        : { id: Number(requestedRun), run_attempt: 1, event: 'workflow_dispatch',
          status: completed.has(requestedRun) ? 'completed' : 'in_progress',
          conclusion: completed.has(requestedRun) ? 'failure' : null,
          head_branch: 'main', head_sha: source, path: '.github/workflows/sealed-realms-production.yml',
          repository: { full_name: 'ael-dev3/Warpkeep' } };
      const encoded = JSON.stringify(body);
      const response = new Response(encoded, { headers: { 'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(encoded)) } });
      Object.defineProperty(response, 'url', { value: request });
      return response;
    }) as typeof fetch,
  });
  return { store: createSealedRealmsProductionContinuationStore({ privateState: state }),
    permit, sourceAuthority, kind: 'activation-evidence' as const, runId, runAttempt: '1' };
}

export async function recoveryActivationDispatcher(state: SealedRealmsProductionPrivateState,
  bridgeState: SealedRealmsProductionAuthBridgeState, generator: SealedRealmsProductionActivationEvidenceGenerator,
  runId: string, completed = new Set<string>()) {
  const context = await recoveryProtectedContext(state, 'activation-evidence-generate', runId, completed);
  return createSealedRealmsProductionActivationDispatcher({
    context: createSealedRealmsProductionActivationDispatchContext({
      readGit: () => `${SOURCE}\n`, readBinding: () => ({ schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
      verifyEvidence: verifiedSha => ({ verifiedSha }), permit: context.permit,
      continuationStore: context.store, runId, runAttempt: '1', sourceAuthority: context.sourceAuthority,
    }),
    lane: createSealedRealmsProductionActivationLane({ bridgeState, generator }),
  });
}

/** Exercises the actual gate/claim/private-chain machinery with explicit test transport evidence. */
export async function recoveryActivationBridge(
  state: SealedRealmsProductionPrivateState, home: string,
  receipts: { ptrPublishReceipt: { databaseIdentity: string }; g002AtlasImportReceipt: { importReceiptDigest: string };
    ptrAtlasImportReceipt: { importReceiptDigest: string }; ptrOwnerProvisionReceipt: { provisionReceiptDigest: string } },
  source = SOURCE,
) {
  const ptrDatabaseIdentity = receipts.ptrPublishReceipt.databaseIdentity;
  const ptrBindingDigest = createHash('sha256').update('warpkeep.auth-bridge.ptr-binding.v1\n')
    .update(`${JSON.stringify([RECOVERY_TEST_VERSION, source, ptrDatabaseIdentity, 'warpkeep-ptr-spacetimedb'])}\n`).digest('hex');
  const prepared = {
    schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: source,
    notificationDeliveryContractDigest: '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9',
    notificationClientCount: 1, notificationDeliveryEnabled: true, notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true, publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false, accessExpectedFidRequiredAfter: false, hermesExecutionApproved: false,
    pagesPresentationEnabled: false, liveAttestationDigest: 'b'.repeat(64),
    preparedAt: '2026-08-28T11:00:00.000Z', expiresAt: '2026-08-28T23:00:00.000Z',
  } as const;
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(prepared);
  const tuple = { sourceCommit: source, deploymentId: DEPLOYMENT, workerVersionId: RECOVERY_TEST_VERSION,
    ptrDatabaseIdentity, ptrBindingDigest };
  const completed = new Set<string>();
  let nonce = 0;
  let probeCount = 0;
  const bridge = createSealedRealmsProductionAuthBridgeState({
    authority: recoveryOperationAuthority('activation-evidence-inspect', source), privateState: state,
    repositoryRoot: process.cwd(), reportedHome: home,
    deploymentAttester: () => ({ deploymentId: DEPLOYMENT, workerVersionId: RECOVERY_TEST_VERSION,
      bridgeSourceCommit: source, controlPlaneAttestationDigest: 'c'.repeat(64),
      publicAttestationDigest: 'd'.repeat(64), privateAttestationDigest: 'e'.repeat(64), observedAt: NOW }),
    bindingAttester: () => ({ ptrDatabaseIdentity, ptrBindingDigest,
      ptrBindingAttestationDigest: '2'.repeat(64), observedAt: NOW }),
    fetchImpl: (async () => {
      probeCount += 1;
      const body = JSON.stringify({ error: {
        code: 'admission_requests_suspended', message: 'New admission requests are temporarily suspended.' } });
      const response = new Response(body, { status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://warpkeep.com' } });
      Object.defineProperty(response, 'url', { value: 'https://auth.warpkeep.com/v2/access/request' });
      return response;
    }) as typeof fetch,
    inspectImportReceipt: ({ lane }) => ({ disposition: completed.has(lane) ? 'adopted' : 'no-effect',
      ...tuple, ...(completed.has(lane) ? { receiptDigest: receipts[`${lane}AtlasImportReceipt`].importReceiptDigest }
        : { noEffectDigest: (lane === 'g002' ? '6' : '7').repeat(64) }) }) as never,
    authenticateImportResult: ({ lane }) => ({ disposition: 'adopted', ...tuple,
      receiptDigest: receipts[`${lane}AtlasImportReceipt`].importReceiptDigest }),
    resolveOwnerProvisionReceipt: () => ({ ...tuple, receiptDigest: receipts.ptrAtlasImportReceipt.importReceiptDigest,
      provisionReceiptDigest: receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest }),
    now: () => new Date(), randomBytesImpl: () => Buffer.alloc(32, ++nonce),
    testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => ({ receipt: prepared, receiptDigest: publication.receiptDigest }),
    testOnlyResolveCompletedJournal: () => ({ journalHeadDigest: '3'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3', outcome: 'verified',
      predecessorDigest: null, runId: '42', runAttempt: 1, completedAt: NOW,
      sourceCommit: source, workerVersionId: RECOVERY_TEST_VERSION }),
  });
  for (const [index, lane] of (['g002', 'ptr'] as const).entries()) {
    const binding = await bridge.inspectGateForContinuation({ lane });
    const inspect = await recoveryProtectedContext(state, `${lane}-import-inspect`, String(80001 + index * 2), new Set(), source);
    await issueSealedRealmsProductionContinuation({ ...inspect, kind: `${lane}-import`, ...binding });
    const apply = await recoveryProtectedContext(state, `${lane}-import-apply`, String(80002 + index * 2), new Set(), source);
    await claimSealedRealmsProductionContinuation({ ...apply, kind: `${lane}-import`, ...binding,
      effect: claim => bridge.applyGateForContinuation({ claim, store: apply.store,
        sourceAuthority: apply.sourceAuthority, kind: `${lane}-import`, runId: apply.runId,
        runAttempt: apply.runAttempt, ...binding, lane, apply: () => { completed.add(lane); } }),
    });
  }
  return { bridge, probes: () => probeCount };
}
