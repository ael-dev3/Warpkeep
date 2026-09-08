import { randomBytes } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
} from '../../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  createSealedRealmsProductionAuthBridgeState,
  createSealedRealmsProductionAuthBridgeStateTestCapability,
} from '../../scripts/sealed-realms-production-auth-bridge-state.mjs';
import {
  claimSealedRealmsProductionContinuation,
  createSealedRealmsProductionContinuationStore,
} from '../../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionG001DispatchContext,
  createSealedRealmsProductionG001CensusAuthority,
  createSealedRealmsProductionG001Dispatcher,
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001LaunchAuthority,
} from '../../scripts/sealed-realms-production-g001-lane-entry.mjs';
import {
  createSealedRealmsProductionG002DispatchContext,
  createSealedRealmsProductionG002Dispatcher,
  createSealedRealmsProductionG002Lane,
} from '../../scripts/sealed-realms-production-g002-lane-entry.mjs';
import {
  createSealedRealmsProductionPtrDispatchContext,
  createSealedRealmsProductionPtrDispatcher,
  createSealedRealmsProductionPtrLane,
} from '../../scripts/sealed-realms-production-ptr-lane-entry.mjs';
import {
  createSealedRealmsProductionActivationDispatchContext,
  createSealedRealmsProductionActivationDispatcher,
  createSealedRealmsProductionActivationLane,
} from '../../scripts/sealed-realms-production-activation-lane-entry.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../../scripts/sealed-realms-production-private-state.mjs';
import {
  createSealedRealmsProductionPublicationReconciler,
} from '../../scripts/sealed-realms-production-reconciliation.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../../scripts/sealed-realms-production-source-authority.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
} from '../../scripts/sealed-realms-production-workflow-authority.mjs';
import {
  collectGenesis001AdmittedPlayerCensus,
} from '../../scripts/genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
} from '../../scripts/genesis001-sealed-launch-adoption.mjs';
import {
  createSealedRealmsPublicationPossiblySubmittedMarker as createG002Marker,
} from '../../scripts/genesis002-production-publisher.mjs';
import {
  createSealedRealmsPublicationPossiblySubmittedMarker as createPtrMarker,
} from '../../scripts/ptr-production-publisher.mjs';

const SOURCE = '1'.repeat(40);
const WRONG_SOURCE = '2'.repeat(40);
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT_ID = '223e4567-e89b-42d3-a456-426614174000';
const NOW = new Date('2026-09-01T00:02:00.000Z');
const BODY = JSON.stringify({
  error: {
    code: 'admission_requests_suspended',
    message: 'New admission requests are temporarily suspended.',
  },
});

const [home, operation, runId, completedText = '', variant = 'normal'] = process.argv.slice(2);
if (
  typeof home !== 'string' || typeof operation !== 'string'
  || !/^[1-9][0-9]*$/u.test(runId ?? '')
) throw new Error('invalid fixture input');

globalThis.WebSocket = class WebSocket {};

const controlPath = join(home, 'process-boundary-control.json');
const readControl = () => JSON.parse(readFileSync(controlPath, 'utf8'));
const writeControl = value => writeFileSync(controlPath, `${JSON.stringify(value)}\n`, {
  encoding: 'utf8', mode: 0o600,
});
const increment = (key) => {
  const control = readControl();
  control.counts[key] = (control.counts[key] ?? 0) + 1;
  writeControl(control);
};

const privateState = createSealedRealmsProductionPrivateState({
  reportedHome: home,
  testOnlyOwnerUid: statSync(home).uid,
  testOnlyFsync: () => {},
  testOnlyAllowPlatformMode: true,
});

function sourceAuthority(operationName, sourceCommit = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operationName,
    workflowInputSha: sourceCommit,
    readGit: () => `${sourceCommit}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function response(url, value) {
  const body = JSON.stringify(value);
  const result = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function github(sourceCommit, currentRunId, completedRunIds) {
  return async (request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return response(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    const requested = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? currentRunId;
    const completed = completedRunIds.has(requested);
    return response(url, {
      id: Number(requested),
      run_attempt: 1,
      event: 'workflow_dispatch',
      status: completed ? 'completed' : 'in_progress',
      conclusion: completed ? 'failure' : null,
      head_branch: 'main',
      head_sha: sourceCommit,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  };
}

async function context(operationName, sourceCommit = SOURCE) {
  const authority = sourceAuthority(operationName, sourceCommit);
  const completed = new Set(completedText === '' ? [] : completedText.split(','));
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority: authority,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl: github(sourceCommit, runId, completed),
  });
  return Object.freeze({
    authority,
    continuation: Object.freeze({
      permit,
      store: createSealedRealmsProductionContinuationStore({ privateState }),
      runId,
      runAttempt: '1',
      sourceAuthority: authority,
    }),
  });
}

function publicationMarker(lane) {
  const common = {
    lane,
    sourceCommit: SOURCE,
    databaseUri: 'https://maincloud.spacetimedb.com',
    alias: lane === 'g002' ? 'warpkeep-genesis-002' : 'warpkeep-ptr',
    moduleIdentity: lane === 'g002'
      ? 'warpkeep-genesis-002-sealed-v1'
      : 'warpkeep-ptr-owner-view-v1',
    release: lane === 'g002' ? '0.4.0' : '0.4.0-ptr.1',
    artifactDigest: 'a'.repeat(64),
    toolchainDigest: 'b'.repeat(64),
    publishPlanDigest: 'c'.repeat(64),
    confirmationDigest: 'd'.repeat(64),
    attemptNonce: 'e'.repeat(64),
    markedAt: '2026-09-01T00:00:00.000Z',
  };
  return lane === 'g002' ? createG002Marker(common) : createPtrMarker(common);
}

function importProof(lane, disposition) {
  return disposition === 'adopted'
    ? {
      disposition,
      sourceCommit: SOURCE,
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      receiptDigest: lane === 'g002' ? '4'.repeat(64) : '5'.repeat(64),
    }
    : {
      disposition,
      sourceCommit: SOURCE,
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      noEffectDigest: lane === 'g002' ? '6'.repeat(64) : '7'.repeat(64),
    };
}

function ownerProof() {
  return {
    sourceCommit: SOURCE,
    deploymentId: DEPLOYMENT_ID,
    workerVersionId: VERSION_ID,
    ptrDatabaseIdentity: 'f'.repeat(64),
    ptrBindingDigest: '1'.repeat(64),
    receiptDigest: '5'.repeat(64),
    provisionReceiptDigest: '9'.repeat(64),
  };
}

function suspensionResponse() {
  return new Response(BODY, {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': 'https://warpkeep.com',
    },
  });
}

function bridge(authority) {
  const receipt = {
    schemaVersion: 1,
    kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com',
    bridgeSourceCommit: SOURCE,
    notificationDeliveryContractDigest: '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9',
    notificationClientCount: 1,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true,
    publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false,
    accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest: 'b'.repeat(64),
    preparedAt: '2026-08-31T23:00:00.000Z',
    expiresAt: '2026-09-01T12:00:00.000Z',
  };
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  return createSealedRealmsProductionAuthBridgeState({
    authority,
    privateState,
    repositoryRoot: process.cwd(),
    reportedHome: home,
    deploymentAttester: () => ({
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE,
      controlPlaneAttestationDigest: 'c'.repeat(64),
      publicAttestationDigest: 'd'.repeat(64),
      privateAttestationDigest: 'e'.repeat(64),
      observedAt: NOW.toISOString(),
    }),
    bindingAttester: () => ({
      ptrDatabaseIdentity: 'f'.repeat(64),
      ptrBindingDigest: '1'.repeat(64),
      ptrBindingAttestationDigest: '2'.repeat(64),
      observedAt: NOW.toISOString(),
    }),
    fetchImpl: async () => suspensionResponse(),
    now: () => new Date(NOW),
    randomBytesImpl: () => randomBytes(32),
    inspectImportReceipt: ({ lane }) => importProof(
      lane,
      (readControl().counts[`${lane}Import`] ?? 0) > 0 ? 'adopted' : 'no-effect',
    ),
    authenticateImportResult: ({ lane }) => importProof(lane, 'adopted'),
    resolveOwnerProvisionReceipt: () => ownerProof(),
    testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => ({
      receipt, receiptDigest: publication.receiptDigest,
    }),
    testOnlyResolveCompletedJournal: () => ({
      journalHeadDigest: '3'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
      outcome: 'verified',
      predecessorDigest: null,
      runId: '42',
      runAttempt: 1,
      completedAt: NOW.toISOString(),
      sourceCommit: SOURCE,
      workerVersionId: VERSION_ID,
    }),
  });
}

function realmLane(lane, authority) {
  const postflight = () => ({
    outcome: readControl().publicationOutcome ?? 'adopted',
    databaseIdentity: (readControl().publicationOutcome ?? 'adopted') === 'adopted'
      ? 'f'.repeat(64) : null,
    publicationReceiptDigest: (readControl().publicationOutcome ?? 'adopted') === 'adopted'
      ? '1'.repeat(64) : null,
    observationDigest: '2'.repeat(64),
    observedAt: '2026-09-01T00:01:00.000Z',
  });
  const common = {
    reconciler: createSealedRealmsProductionPublicationReconciler({
      privateState, lane, postflight,
    }),
    bridgeState: bridge(authority),
    createPublishMarker: () => publicationMarker(lane),
    publish: () => {
      if (variant !== 'crash-no-effect') increment(`${lane}Publish`);
      if (variant.startsWith('crash-')) throw new Error('simulated process loss after callback');
    },
    importCore: () => {
      if (variant !== 'crash-no-effect') increment(`${lane}Import`);
      if (variant.startsWith('crash-')) throw new Error('simulated process loss after callback');
    },
    liveInspect: () => ({
      receiptDigest: lane === 'g002' ? '4'.repeat(64) : '5'.repeat(64),
      evidenceDigest: 'a'.repeat(64),
    }),
  };
  return lane === 'g002'
    ? createSealedRealmsProductionG002Lane(common)
    : createSealedRealmsProductionPtrLane({
      ...common,
      inspectOwnerProvision: () => {
        increment('ownerInspect');
        return { receiptDigest: '5'.repeat(64), inspectionDigest: '8'.repeat(64) };
      },
      provisionOwner: () => {
        if (variant !== 'crash-no-effect') increment('ownerProvision');
        if (variant.startsWith('crash-')) throw new Error('simulated process loss after callback');
        return {
          receiptDigest: '5'.repeat(64),
          provisionReceiptDigest: '9'.repeat(64),
        };
      },
    });
}

function censusStamp(timestamp) {
  return new Date(timestamp).toISOString()
    .replaceAll('-', '').replaceAll(':', '').replace('.000', '');
}

function applicantProof(timestamp, nonce) {
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: SOURCE,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${censusStamp(timestamp)}.txt`,
      sha256: 'b'.repeat(64),
      size: 64,
    },
    privateBlindingNonceHex: nonce,
  };
  return Object.freeze({
    ...proof,
    opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof),
  });
}

async function admittedProof(timestamp, nonceByte) {
  return collectGenesis001AdmittedPlayerCensus({
    preparationSourceCommit: SOURCE,
    observedAt: new Date(timestamp).toISOString(),
    readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
    queryPreferred: () => ({
      outcome: 'exact-query-supported',
      output: Buffer.from('fid\tenabled\tauth_epoch\n1\ttrue\t1\n', 'utf8'),
    }),
    randomBytes: () => Buffer.alloc(32, nonceByte),
  });
}

async function g001Lane() {
  const base = readControl().censusBase;
  const firstTime = base;
  const secondTime = base + 60_000;
  const sample = operation === 'g001-census-first'
    ? {
      applicant: applicantProof(firstTime, '1'.repeat(64)),
      admitted: await admittedProof(firstTime, 3),
    }
    : {
      applicant: applicantProof(secondTime, '2'.repeat(64)),
      admitted: await admittedProof(secondTime, 4),
    };
  const launchAuthority = createSealedRealmsProductionG001LaunchAuthority({
    readRawGit: () => `${SOURCE}\n`,
    resolveAdminSecretPath: () => ({ sourceCommit: SOURCE, path: '/private/task5-secret' }),
    privateState,
  });
  const censusAuthority = createSealedRealmsProductionG001CensusAuthority({
    privateState,
    collect: async () => {
      increment(operation === 'g001-census-first' ? 'g001First' : 'g001Second');
      if (variant.startsWith('crash-')) throw new Error('simulated collection loss');
      return sample;
    },
    suspend: async () => {
      increment('g001Suspend');
      if (variant.startsWith('crash-')) throw new Error('simulated suspension loss');
    },
    now: () => new Date(base + 120_000),
  });
  return createSealedRealmsProductionG001Lane({
    launchAuthority,
    attestDispatcherNode: () => { throw new Error('unreachable'); },
    runEnvelopeChild: async () => ({ status: 1, stdout: '', stderr: '' }),
    censusAuthority,
    currentState: {
      runChild: async () => ({ status: 1, stdout: '', stderr: '' }),
      readFixedFile: () => { throw new Error('unreachable'); },
      resolveAccountUid: () => 501,
      resolveAccountHome: () => '/owner',
      testOnlyAdapter: undefined,
    },
    preflight: () => undefined,
    currentStateOperator: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-genesis001-admission-monitor-current-state-v1',
      realmId: 'GENESIS_001',
      release: '0.3.43',
      sourceCommit: SOURCE,
      observedAt: new Date().toISOString(),
      label: 'com.warpkeep.hermes-admission-monitor',
      disabled: true,
      loaded: false,
      monitorPlistSha256: 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
      monitorProgramSha256: '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    }),
  });
}

async function run() {
  const sourceCommit = variant === 'wrong-source' ? WRONG_SOURCE : SOURCE;
  const protectedContext = await context(operation, sourceCommit);
  let laneKey;
  let lane;
  if (operation.startsWith('g001-')) {
    laneKey = 'g001Lane';
    lane = await g001Lane();
  } else if (operation.startsWith('g002-')) {
    laneKey = 'g002Lane';
    lane = realmLane('g002', protectedContext.authority);
  } else if (operation.startsWith('ptr-')) {
    laneKey = 'ptrLane';
    lane = realmLane('ptr', protectedContext.authority);
  } else if (operation.startsWith('activation-')) {
    laneKey = 'activationLane';
    lane = createSealedRealmsProductionActivationLane({
      bridgeState: bridge(protectedContext.authority),
    });
  } else {
    throw new Error('unknown fixture operation');
  }

  if (variant === 'wrong-lane-brand') {
    laneKey = 'g002Lane';
    lane = realmLane('ptr', protectedContext.authority);
  }

  if (variant === 'wrong-subject') {
    const reconciler = createSealedRealmsProductionPublicationReconciler({
      privateState, lane: 'g002', postflight: () => ({
        outcome: 'adopted',
        databaseIdentity: 'f'.repeat(64),
        publicationReceiptDigest: '1'.repeat(64),
        observationDigest: '2'.repeat(64),
        observedAt: '2026-09-01T00:01:00.000Z',
      }),
    });
    const binding = reconciler.reopenContinuation();
    return claimSealedRealmsProductionContinuation({
      store: protectedContext.continuation.store,
      permit: protectedContext.continuation.permit,
      sourceAuthority: protectedContext.authority,
      kind: 'g002-publication',
      runId,
      runAttempt: '1',
      ...binding,
      subject: 'ptr-publication:0.4.0',
      effect: () => increment('forgedSubjectEffect'),
    });
  }

  const contextFactory = {
    g001Lane: createSealedRealmsProductionG001DispatchContext,
    g002Lane: createSealedRealmsProductionG002DispatchContext,
    ptrLane: createSealedRealmsProductionPtrDispatchContext,
    activationLane: createSealedRealmsProductionActivationDispatchContext,
  }[laneKey];
  const dispatchContext = contextFactory({
    readGit: () => `${sourceCommit}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
    permit: protectedContext.continuation.permit,
    continuationStore: protectedContext.continuation.store,
    runId,
    runAttempt: '1',
    sourceAuthority: protectedContext.authority,
  });
  const composer = {
    g001Lane: createSealedRealmsProductionG001Dispatcher,
    g002Lane: createSealedRealmsProductionG002Dispatcher,
    ptrLane: createSealedRealmsProductionPtrDispatcher,
    activationLane: createSealedRealmsProductionActivationDispatcher,
  }[laneKey];
  const dispatcher = composer({ context: dispatchContext, lane });
  return dispatcher.dispatch({ operation, workflowInputSha: sourceCommit });
}

try {
  const result = await run();
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED',
  })}\n`);
}
