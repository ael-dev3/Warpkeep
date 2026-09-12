import { createHash } from 'node:crypto';
import { canonicalAuthBridgeNotificationPreparedReceiptPublication } from '../../scripts/auth-bridge-notification-prepared-receipt.mjs';
import { authenticateSealedRealmsProductionSourceAuthority, type SealedRealmsProductionSourceAuthority } from '../../scripts/sealed-realms-production-source-authority.mjs';
import { issueSealedRealmsProductionWorkflowPermit } from '../../scripts/sealed-realms-production-workflow-authority.mjs';
import { claimSealedRealmsProductionContinuation, createSealedRealmsProductionContinuationStore,
  issueSealedRealmsProductionContinuation } from '../../scripts/sealed-realms-production-continuation.mjs';
import { createSealedRealmsProductionAuthBridgeState, createSealedRealmsProductionAuthBridgeStateTestCapability } from '../../scripts/sealed-realms-production-auth-bridge-state.mjs';
import { readSealedRealmsProductionPtrExistingStateAdoptionEvidence,
  type SealedRealmsProductionPtrExistingStateAdoptionEvidence } from '../../scripts/sealed-realms-production-activation-records.mjs';
import type { SealedRealmsProductionPrivateState } from '../../scripts/sealed-realms-production-private-state.mjs';

/** External producers are fixtures; the adoption reader, G002 gate, claims and disk chain are real. */
export async function createPtrAdoptionBridgeFixture(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  existingStateAdoption: SealedRealmsProductionPtrExistingStateAdoptionEvidence;
  authority: SealedRealmsProductionSourceAuthority;
  sourceCommit: string;
  g002AtlasImportReceiptDigest?: string;
  now?: Date;
}>) {
  const adoption = readSealedRealmsProductionPtrExistingStateAdoptionEvidence({
    evidence: input.existingStateAdoption, privateState: input.privateState, sourceCommit: input.sourceCommit,
  });
  const sourceCommit = adoption.sourceCommit;
  const observation = adoption.pair.post.observation;
  if (observation.bridgeSourceCommit !== sourceCommit) throw Error('Sign a same-source bridge observation for this connected fixture');
  const sampled = input.now ?? new Date(Math.max(Date.now(), observation.observedThrough * 1000));
  const deploymentId = '223e4567-e89b-42d3-a456-426614174000';
  const workerVersionId = observation.bridgeWorkerVersionId;
  const ptrDatabaseIdentity = observation.ptr.databaseIdentity;
  const ptrBindingDigest = createHash('sha256').update('warpkeep.auth-bridge.ptr-binding.v1\n')
    .update(`${JSON.stringify([workerVersionId, sourceCommit, ptrDatabaseIdentity, 'warpkeep-ptr-spacetimedb'])}\n`).digest('hex');
  const receipt = {
    schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: sourceCommit,
    notificationDeliveryContractDigest: '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9',
    notificationClientCount: 1, notificationDeliveryEnabled: true, notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true, publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false, accessExpectedFidRequiredAfter: false, hermesExecutionApproved: false,
    pagesPresentationEnabled: false, liveAttestationDigest: 'b'.repeat(64),
    preparedAt: new Date(sampled.getTime() - 60_000).toISOString(),
    expiresAt: new Date(sampled.getTime() + 3_600_000).toISOString(),
  } as const;
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  let nonce = 0;
  const context = { sourceCommit, deploymentId, workerVersionId, ptrDatabaseIdentity, ptrBindingDigest };
  const importProof = (lane: string, adopted: boolean) => {
    if (lane !== 'g002') throw Error('PTR initialization is not part of adoption');
    return adopted ? { disposition: 'adopted' as const, ...context, receiptDigest: input.g002AtlasImportReceiptDigest ?? '4'.repeat(64) }
      : { disposition: 'no-effect' as const, ...context, noEffectDigest: '6'.repeat(64) };
  };
  const createBridge = (existingStateAdoption = input.existingStateAdoption,
    privateState = input.privateState, authority = input.authority) => createSealedRealmsProductionAuthBridgeState({
    authority, privateState, repositoryRoot: process.cwd(), existingStateAdoption,
    deploymentAttester: () => ({ deploymentId, workerVersionId, bridgeSourceCommit: sourceCommit,
      controlPlaneAttestationDigest: 'c'.repeat(64), publicAttestationDigest: 'd'.repeat(64),
      privateAttestationDigest: 'e'.repeat(64), observedAt: sampled.toISOString() }),
    bindingAttester: () => ({ ptrDatabaseIdentity, ptrBindingDigest, ptrBindingAttestationDigest: '2'.repeat(64),
      observedAt: sampled.toISOString() }),
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'admission_requests_suspended',
      message: 'New admission requests are temporarily suspended.' } }), { status: 503, headers: {
      'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://warpkeep.com',
    } }),
    inspectImportReceipt: ({ lane }) => importProof(lane, false),
    authenticateImportResult: ({ lane }) => importProof(lane, true) as Extract<ReturnType<typeof importProof>, { disposition: 'adopted' }>,
    resolveOwnerProvisionReceipt: () => { throw Error('PTR owner provisioning is not part of adoption'); },
    now: () => new Date(sampled), randomBytesImpl: () => Buffer.alloc(32, ++nonce),
    testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => ({ receipt, receiptDigest: publication.receiptDigest }),
    testOnlyResolveCompletedJournal: () => ({ journalHeadDigest: '3'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3', outcome: 'verified', predecessorDigest: null,
      runId: '42', runAttempt: 1, completedAt: sampled.toISOString(), sourceCommit, workerVersionId }),
  });
  const sourceAuthorityFor = (operation: string) => authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never, workflowInputSha: sourceCommit,
    readGit: args => { if (args[0] !== 'rev-parse') throw Error('Unexpected fixture Git query'); return `${sourceCommit}\n`; },
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
  const run = async (operation: string, runId: string, completedRunIds: ReadonlySet<string> = new Set()) => {
    const sourceAuthority = sourceAuthorityFor(operation);
    const permit = await issueSealedRealmsProductionWorkflowPermit({ sourceAuthority, githubToken: 'github-sealed-realms-owner-token',
      runId, runAttempt: '1', fetchImpl: async request => {
        const url = String(request);
        const requestedRunId = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? runId;
        const completed = completedRunIds.has(requestedRunId);
        const body = url.endsWith('/branches/main') ? { name: 'main', protected: true, commit: { sha: sourceCommit } }
          : { id: Number(requestedRunId), run_attempt: 1, event: 'workflow_dispatch',
            status: completed ? 'completed' : 'in_progress', conclusion: completed ? 'failure' : null,
            head_branch: 'main', head_sha: sourceCommit, path: '.github/workflows/sealed-realms-production.yml',
            repository: { full_name: 'ael-dev3/Warpkeep' } };
        const bytes = JSON.stringify(body);
        const response = new Response(bytes, { status: 200, headers: { 'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(bytes)) } });
        Object.defineProperty(response, 'url', { value: url }); return response;
      } });
    return { sourceAuthority, permit, runId, runAttempt: '1' as const };
  };
  const bridgeState = createBridge();
  const store = createSealedRealmsProductionContinuationStore({ privateState: input.privateState });
  const binding = await bridgeState.inspectGateForContinuation({ lane: 'g002' });
  const issued = await run('g002-import-inspect', '88001');
  await issueSealedRealmsProductionContinuation({ store, ...issued, kind: 'g002-import', ...binding });
  const claimed = await run('g002-import-apply', '88002');
  let fixtureEffectError: unknown;
  try {
    await claimSealedRealmsProductionContinuation({ store, ...claimed, kind: 'g002-import', ...binding,
      effect: async claim => {
        try {
          return await bridgeState.applyGateForContinuation({ claim, store, sourceAuthority: claimed.sourceAuthority,
            kind: 'g002-import', runId: claimed.runId, runAttempt: claimed.runAttempt, ...binding,
            lane: 'g002', apply: () => undefined });
        } catch (error) { fixtureEffectError = error; throw error; }
      } });
  } catch (error) { throw fixtureEffectError ?? error; }
  return { bridgeState, createBridge, sourceAuthorityFor, store, run, sampled, adoption };
}
