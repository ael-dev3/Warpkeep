import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { vi } from 'vitest';
import {
  captureG002BridgeObservation, signG002UpdateObservation, snapshotG002UpdateObservationRequest,
  verifyHistoricalG002UpdateObservation, type G002UpdateObservation,
  capturePtrBridgeObservation,
  signPtrUpdateObservation,
  snapshotPtrUpdateObservationRequest,
  verifyHistoricalPtrUpdateObservation,
  type PtrUpdateObservation,
  type PtrUpdateObservationContext,
} from '../../services/release-recovery/src/ptrObservation';
import { preparationPrivateJwk } from '../../services/release-recovery/test/preparationFixture';

const API = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const HASH = 'a'.repeat(64);

export type PtrUpdateObservationFixtureRun = Readonly<{
  sourceCommit: string;
  sourceTree: string;
  runId: string;
  runAttempt: string;
  checkRunId: string;
  requestId: string;
}>;
export type PtrUpdateObservationCallerInput = Readonly<{
  reattest: () => Promise<void>;
  sourceCommit: string;
  sourceTree: string;
  runId: string;
  runAttempt: string;
}> & (Readonly<{
  context: Extract<PtrUpdateObservationContext, { phase: 'pre' }>;
}> | Readonly<{
  context: Extract<PtrUpdateObservationContext, { phase: 'post' }>;
  preObservationJws: string;
}>);

function jsonResponse(url: string, body: unknown) {
  const json = JSON.stringify(body, (_key, value) => typeof value === 'bigint' ? `__integer_${value}` : value)
    .replace(/"__integer_([0-9]+)"/gu, '$1');
  const response = new Response(json, { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function bridge(lane: 'ptr' | 'g002', run: PtrUpdateObservationFixtureRun, requestId: string, programKeccak256: string,
  observedFrom: number, observedThrough: number, recoveryAuthorizationEpoch: number) {
  const atlas = {
    admissionsOpen: false, accessRequestsOpen: false, sealed: true, atlasReady: true,
    generalAdmissionCount: 0, populationGuardPassed: true, publicReleaseId: `GRR-${'A'.repeat(26)}`,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`, atlasSourceCommit: 'e'.repeat(40),
    expectedReleaseSha256: HASH, releaseHeaderSha256: HASH, verificationDigest: HASH,
    sealedStateHmacSha256: HASH,
  };
  return {
    schemaVersion: 1, profile: 'warpkeep-release-recovery-realm-observation-v1',
    requestId, candidateCommit: run.sourceCommit, recoveryAuthorizationEpoch,
    observedFrom, observedThrough, bridgeService: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd',
    bridgeSourceCommit: 'f'.repeat(40), bridgeConfigIdentity: HASH, bridgeConfigEpoch: 7,
    publicAdmissionRequestsOpen: false,
    g001: {
      databaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      programKeccak256: HASH, realmId: 'GENESIS_001', releaseVersion: '0.3.43',
      playerAccessEnabled: true, admissionStateMutationsEnabled: false,
      accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
      admittedPlayerCount: 1, enabledPlayerCount: 1, censusStable: true,
      admittedPlayerCensusHmacSha256: HASH, alphaInvariantHmacSha256: HASH,
    },
    g002: {
      ...atlas, databaseIdentity: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
      programKeccak256: lane === 'g002' ? programKeccak256 : HASH, realmId: 'GENESIS_002', databaseName: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1', releaseVersion: '0.4.0',
      launchState: 'sealed', playerCount: 0, atlasId: 'GENESIS_002_GREATER_REALM',
    },
    ptr: {
      ...atlas, databaseIdentity: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
      programKeccak256: lane === 'ptr' ? programKeccak256 : HASH, realmId: 'PTR', releaseVersion: '0.4.0-ptr.1',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1', launchState: 'owner-only',
      singletonOwnerCount: 1, ownerEnabled: true, atlasId: 'PTR_GREATER_REALM',
      ownerInvariantHmacSha256: HASH,
    },
    upstreamResponseDigests: Object.fromEntries([
      'programIdentityBeforeTranscriptHmacSha256', 'g001PolicyResponseHmacSha256',
      'g001AlphaBeforeResponseHmacSha256', 'g001PlayerEnumerationBeforeResponseHmacSha256',
      'g001AdmissionStatusesResponseHmacSha256', 'g001PlayerEnumerationAfterResponseHmacSha256',
      'g001AlphaAfterResponseHmacSha256', 'g002StatusResponseHmacSha256',
      'ptrAdminStatusResponseHmacSha256', 'ptrOwnerStatusResponseHmacSha256',
      'programIdentityAfterTranscriptHmacSha256',
    ].map(key => [key, HASH])),
  };
}

function createUpdateObservationTransportFixture(lane: 'ptr' | 'g002', initial: PtrUpdateObservationFixtureRun,
  options: Readonly<{
    nowSeconds?: number;
    recoveryAuthorizationEpoch?: number;
    bridgeSourceCommit?: string;
    fetchFallback?: (url: string, init?: RequestInit) => Promise<Response>;
  }> = {}) {
  const AUDIENCE = `https://release-auth.warpkeep.com/${lane}-update-observation`;
  const ENDPOINT = `https://release-auth.warpkeep.com/v1/recovery/${lane}-update-observation`;
  const job = `operate_${lane}`;
  const snapshotRequest = lane === 'ptr' ? snapshotPtrUpdateObservationRequest : snapshotG002UpdateObservationRequest;
  const capture = lane === 'ptr' ? capturePtrBridgeObservation : captureG002BridgeObservation;
  const historical = lane === 'ptr' ? verifyHistoricalPtrUpdateObservation : verifyHistoricalG002UpdateObservation;
  let run = { ...initial };
  let current = options.nowSeconds ?? 108;
  let fault: 'none' | 'redirect' | 'oversized' | 'invalid-signature' = 'none';
  const requests: Array<Readonly<{ url: string; method: string; context?: PtrUpdateObservationContext }>> = [];
  const observations: Array<PtrUpdateObservation | G002UpdateObservation> = [];
  const labels = parseYaml(readFileSync('.github/workflows/sealed-realms-production.yml', 'utf8'))
    .jobs[job]['runs-on'] as string[];
  const token = () => ['e30', Buffer.from(JSON.stringify({
    jti: run.requestId, aud: AUDIENCE, sha: run.sourceCommit,
    run_id: run.runId, run_attempt: run.runAttempt,
  })).toString('base64url'), 'fixture'].join('.');
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(Object.freeze({ url, method: init?.method ?? 'GET' }));
    const oidcUrl = 'https://pipelines.actions.githubusercontent.com/token?audience='
      + encodeURIComponent(AUDIENCE);
    const jobsUrl = `${API}/actions/runs/${run.runId}/attempts/${run.runAttempt}/jobs?per_page=100`;
    if (url === oidcUrl) return jsonResponse(url, { value: token() });
    if (url === jobsUrl) return jsonResponse(url, {
      total_count: 1,
      jobs: [{
        name: job, head_sha: run.sourceCommit, id: BigInt(run.checkRunId),
        run_id: BigInt(run.runId), run_attempt: BigInt(run.runAttempt),
        status: 'in_progress', conclusion: null, check_run_url: `${API}/check-runs/${run.checkRunId}`,
        labels,
      }],
    });
    if (url === ENDPOINT) {
      const request = snapshotRequest(JSON.parse(String(init?.body)));
      requests[requests.length - 1] = Object.freeze({ url, method: init?.method ?? 'POST',
        context: request.context });
      const terminal = request.context.phase === 'post'
        ? Math.ceil(Date.parse(request.context.terminalAt) / 1000) : 0;
      const observedFrom = Math.max(current - 8, terminal);
      const observedThrough = current - 3;
      const value = bridge(lane, run, request.requestId,
        request.context.phase === 'pre' ? request.context.beforeProgram : request.context.candidateProgram,
        observedFrom, observedThrough, options.recoveryAuthorizationEpoch ?? 3);
      if (options.bridgeSourceCommit !== undefined) value.bridgeSourceCommit = options.bridgeSourceCommit;
      const captured = capture(value, {
        requestId: request.requestId, candidateCommit: run.sourceCommit,
        recoveryAuthorizationEpoch: options.recoveryAuthorizationEpoch ?? 3,
      }, observedFrom - 1, observedThrough + 1);
      const signer = lane === 'ptr' ? signPtrUpdateObservation : signG002UpdateObservation;
      let compact = await signer({
        sourceCommit: run.sourceCommit, sourceTree: run.sourceTree, runId: run.runId,
        runAttempt: run.runAttempt, checkRunId: run.checkRunId, requestId: request.requestId,
      }, request.context, captured as never, current - 1, preparationPrivateJwk,
      'preObservationJws' in request ? request.preObservationJws : undefined);
      observations.push(await historical(compact));
      if (fault === 'invalid-signature') compact = compact.slice(0, -3) + 'AAA';
      if (fault === 'oversized') compact = 'x'.repeat(17000);
      return jsonResponse(fault === 'redirect' ? `${ENDPOINT}/redirect` : url,
        { [`${lane}UpdateObservationJws`]: compact });
    }
    if (options.fetchFallback) return options.fetchFallback(url, init);
    throw new Error(`unexpected fixture request: ${url}`);
  });
  const install = () => {
    for (const [key, value] of Object.entries({
      GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_JOB: job,
      GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
      GITHUB_SHA: run.sourceCommit, GITHUB_RUN_ID: run.runId, GITHUB_RUN_ATTEMPT: run.runAttempt,
      WARPKEEP_OPERATION: `${lane}-update-apply`, GITHUB_TOKEN: 'fixture-github-token',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/token',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-token',
    })) vi.stubEnv(key, value);
    vi.spyOn(Date, 'now').mockImplementation(() => current * 1000);
    vi.stubGlobal('fetch', fetchMock);
  };
  const useRun = (next: PtrUpdateObservationFixtureRun) => {
    run = { ...next };
    for (const [key, value] of Object.entries({
      GITHUB_SHA: run.sourceCommit, GITHUB_RUN_ID: run.runId, GITHUB_RUN_ATTEMPT: run.runAttempt,
    })) vi.stubEnv(key, value);
  };
  const callerInput = (reattest: () => Promise<void>, context: PtrUpdateObservationContext,
    preObservationJws?: string): PtrUpdateObservationCallerInput => {
    const base = {
      reattest, sourceCommit: run.sourceCommit, sourceTree: run.sourceTree,
      runId: run.runId, runAttempt: run.runAttempt,
    };
    if (context.phase === 'post') {
      if (preObservationJws === undefined) throw new Error('PTR_UPDATE_OBSERVATION_FIXTURE_PRE_REQUIRED');
      return { ...base, context, preObservationJws };
    }
    return { ...base, context };
  };
  return Object.freeze({
    fetchMock, requests, observations,
    install,
    useRun,
    setNowSeconds(value: number) { current = value; },
    setFault(value: typeof fault) { fault = value; },
    callerInput,
  });
}

// Fixture-only selection; production callers expose fixed realm facades.
export function createPtrUpdateObservationTransportFixture(initial: PtrUpdateObservationFixtureRun,
  options: Parameters<typeof createUpdateObservationTransportFixture>[2] = {}) {
  return createUpdateObservationTransportFixture('ptr', initial, options);
}
export function createG002UpdateObservationTransportFixture(initial: PtrUpdateObservationFixtureRun,
  options: Parameters<typeof createUpdateObservationTransportFixture>[2] = {}) {
  return createUpdateObservationTransportFixture('g002', initial, options);
}
