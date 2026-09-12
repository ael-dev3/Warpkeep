// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, chmodSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { tmpdir } from 'node:os';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';
import { observePtrProductionState } from '../scripts/ptr-production-state-observation.mjs';
import { capturePtrBridgeObservation, signPtrObservation } from '../services/release-recovery/src/ptrObservation';
import { preparationPrivateJwk } from '../services/release-recovery/test/preparationFixture';
vi.mock('../services/release-recovery/src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256',
    x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
const identity = { sourceCommit: 'c'.repeat(40), sourceTree: 'd'.repeat(40),
  runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993',
  requestId: '123e4567-e89b-42d3-a456-426614174000' }
const expected = { requestId: identity.requestId, candidateCommit: identity.sourceCommit, recoveryAuthorizationEpoch: 3 }
const hash = 'a'.repeat(64)
function bridge() {
  const atlas = { admissionsOpen: false, accessRequestsOpen: false, sealed: true, atlasReady: true,
    generalAdmissionCount: 0, populationGuardPassed: true, publicReleaseId: `GRR-${'A'.repeat(26)}`,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`, atlasSourceCommit: 'e'.repeat(40),
    expectedReleaseSha256: hash, releaseHeaderSha256: hash, verificationDigest: hash, sealedStateHmacSha256: hash }
  return { schemaVersion: 1, profile: 'warpkeep-release-recovery-realm-observation-v1', ...expected,
    observedFrom: 100, observedThrough: 105, bridgeService: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd', bridgeSourceCommit: 'f'.repeat(40),
    bridgeConfigIdentity: hash, bridgeConfigEpoch: 7, publicAdmissionRequestsOpen: false,
    g001: { databaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      programKeccak256: hash, realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
      admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
      admittedPlayerCount: 1, enabledPlayerCount: 1, censusStable: true,
      admittedPlayerCensusHmacSha256: hash, alphaInvariantHmacSha256: hash },
    g002: { ...atlas, databaseIdentity: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
      programKeccak256: hash, realmId: 'GENESIS_002', databaseName: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1', releaseVersion: '0.4.0', launchState: 'sealed',
      playerCount: 0, atlasId: 'GENESIS_002_GREATER_REALM' },
    ptr: { ...atlas, databaseIdentity: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
      programKeccak256: hash, realmId: 'PTR', releaseVersion: '0.4.0-ptr.1', moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      launchState: 'owner-only', singletonOwnerCount: 1, ownerEnabled: true, atlasId: 'PTR_GREATER_REALM',
      ownerInvariantHmacSha256: hash },
    upstreamResponseDigests: Object.fromEntries(['programIdentityBeforeTranscriptHmacSha256',
      'g001PolicyResponseHmacSha256', 'g001AlphaBeforeResponseHmacSha256', 'g001PlayerEnumerationBeforeResponseHmacSha256',
      'g001AdmissionStatusesResponseHmacSha256', 'g001PlayerEnumerationAfterResponseHmacSha256',
      'g001AlphaAfterResponseHmacSha256', 'g002StatusResponseHmacSha256', 'ptrAdminStatusResponseHmacSha256',
      'ptrOwnerStatusResponseHmacSha256', 'programIdentityAfterTranscriptHmacSha256'].map(key => [key, hash])) }
}

const gateway = 'https://release-auth.warpkeep.com/v1/recovery/ptr-observation';
const audience = 'https://release-auth.warpkeep.com/ptr-observation';
const oidcUrl = 'https://pipelines.actions.githubusercontent.com/token?audience=' + encodeURIComponent(audience);
const api = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const jobsUrl = api + '/actions/runs/' + identity.runId + '/attempts/2/jobs?per_page=100';
const checkUrl = api + '/check-runs/' + identity.checkRunId;
const token = ['e30', Buffer.from(JSON.stringify({ jti: identity.requestId, aud: audience,
  sha: identity.sourceCommit, run_id: identity.runId, run_attempt: '2' })).toString('base64url'), 'fixture'].join('.');
const reply = (url: string, body: unknown) => {
  const json = JSON.stringify(body, (_key, value) => typeof value === 'bigint' ? `__integer_${value}` : value)
    .replace(/"__integer_([0-9]+)"/gu, '$1');
  const response = new Response(typeof body === 'string' ? body : json, { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: url }); return response;
};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const job = () => ({name:'observe_ptr',head_sha:identity.sourceCommit,
  id:BigInt(identity.checkRunId),run_id:BigInt(identity.runId),run_attempt:2,
  status:'in_progress',conclusion:null,check_run_url:checkUrl,
  labels:parseYaml(readFileSync('.github/workflows/sealed-realms-production.yml','utf8')).jobs.observe_ptr['runs-on']});
async function setup() {
  for (const [key,value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'observe_ptr',
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    GITHUB_SHA: identity.sourceCommit, GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: '2',
    GITHUB_TOKEN: 'fixture-github-token', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-token' })) vi.stubEnv(key,value);
  vi.spyOn(Date, 'now').mockReturnValue(108000);
  const home = mkdtempSync(join(tmpdir(),'ptr-observation-'));
  const roots = [join(sealedRealmsPrivateBase(home),'audit','private'),join(sealedRealmsPrivateBase(home),'runtime'),join(sealedRealmsPrivateBase(home),'cache')];
  for (const root of roots) { mkdirSync(root,{recursive:true,mode:0o700}); chmodSync(root,0o700); }
  const privateState = createSealedRealmsProductionPrivateState({reportedHome:home,testOnlyOwnerUid:statSync(roots[0]).uid,
    testOnlyFsync:()=>{},testOnlyAllowPlatformMode:true});
  const compact = await signPtrObservation(identity,capturePtrBridgeObservation(bridge(),expected,99,106),107,preparationPrivateJwk);
  const reattest = vi.fn(async()=>{});
  const fetchMock = vi.fn(async(url:string, init?:RequestInit) => {
    if (url === oidcUrl) return reply(url,{value:token});
    if (url === jobsUrl) return reply(url, {total_count:1,jobs:[job()]});
    if (url === gateway) { expect(JSON.parse(String(init?.body))).toEqual({oidcToken:token,sourceCommit:identity.sourceCommit,requestId:identity.requestId}); return reply(url,{ptrObservationJws:compact}); }
    throw new Error('unexpected request');
  });
  vi.stubGlobal('fetch',fetchMock);
  return {privateState,compact,reattest,fetchMock, input:{privateState,reattest,sourceCommit:identity.sourceCommit,
    sourceTree:identity.sourceTree,runId:identity.runId,runAttempt:identity.runAttempt},cleanup:()=>rmSync(home,{recursive:true,force:true})};
}
describe('PTR observation workflow caller',()=>{
  it.each(['id','run_id','run_attempt'])('rejects an independently mismatched job %s',async field=>{
    const f=await setup(),original=f.fetchMock.getMockImplementation()!;
    f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>url===jobsUrl
      ?reply(url,{total_count:1,jobs:[{...job(),[field]:3}]}):original(url,init));
    try {
      await expect(observePtrProductionState(f.input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
      expect(f.fetchMock.mock.calls.some(([url])=>url===gateway)).toBe(false);
    } finally {f.cleanup();}
  });
  it('refuses expiry crossed during asynchronous signature verification',async()=>{
    const f=await setup();
    const verify=crypto.subtle.verify.bind(crypto.subtle);
    vi.spyOn(crypto.subtle,'verify').mockImplementation(async (...args)=>{
      const result=await verify(...args); vi.spyOn(Date,'now').mockReturnValue(195000); return result;
    });
    try {
      await expect(observePtrProductionState(f.input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
      expect(f.privateState.exists({root:'audit',relativePath:'ptr-state-observations/'+identity.sourceCommit+'/'+identity.runId+'-2-'+identity.requestId+'.jws'})).toBe(false);
    } finally {f.cleanup();}
  });
  it.each(['sourceCommit','sourceTree','runId','runAttempt','checkRunId','requestId'])(
    'rejects a correctly signed observation for a different %s',async field=>{
      const f=await setup(),original=f.fetchMock.getMockImplementation()!;
      const changed={...identity,[field]:field==='requestId'?'223e4567-e89b-42d3-a456-426614174000':field.startsWith('source')?'b'.repeat(40):'3'};
      const modifiedBridge=bridge();
      modifiedBridge.candidateCommit=changed.sourceCommit;modifiedBridge.requestId=changed.requestId;
      const modifiedExpected={...expected,candidateCommit:changed.sourceCommit,requestId:changed.requestId};
      const signed=await signPtrObservation(changed,capturePtrBridgeObservation(modifiedBridge,modifiedExpected,99,106),107,preparationPrivateJwk);
      f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>url===gateway?reply(url,{ptrObservationJws:signed}):original(url,init));
      try {await expect(observePtrProductionState(f.input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');}
      finally {f.cleanup();}
    });
  it('verifies fresh signed identity and reopens the exact no-clobber private JWS before bounded success',async()=>{
    const f=await setup(); try {
      expect(await observePtrProductionState(f.input)).toEqual({operation:'ptr-state-inspect',status:'state-inspected'});
      expect(f.privateState.read({root:'audit',relativePath:'ptr-state-observations/'+identity.sourceCommit+'/'+identity.runId+'-2-'+identity.requestId+'.jws'}).toString()).toBe(f.compact);
      expect(f.reattest.mock.calls.length).toBeGreaterThanOrEqual(5);
      await expect(observePtrProductionState(f.input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
    } finally {f.cleanup();}
  });
  it.each(['wrong-job','authority','duplicate-response','invalid-signature','wrong-request','oversize','redirect','duplicate-job','wrong-source-job'])(
    'refuses %s without persisting private evidence',async scenario=>{
      const f=await setup(); const original=f.fetchMock.getMockImplementation()!;
      try {
        if(scenario==='wrong-job') vi.stubEnv('GITHUB_JOB','operate_readonly');
        if(scenario==='authority') f.reattest.mockRejectedValueOnce(new Error('private-diagnostic'));
        f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
          if(url===gateway && scenario==='duplicate-response') return reply(url,'{"ptrObservationJws":"x","ptrObservationJws":"y"}');
          if(url===gateway && scenario==='invalid-signature') return reply(url,{ptrObservationJws:f.compact.slice(0,-3)+'AAA'});
          if(url===gateway && scenario==='oversize') return reply(url,{ptrObservationJws:'x'.repeat(17000)});
          if(url===gateway && scenario==='redirect') return reply(gateway+'/other',{ptrObservationJws:f.compact});
          if(url===oidcUrl && scenario==='wrong-request') return reply(url,{value:'e30.'+Buffer.from(JSON.stringify({jti:'wrong'})).toString('base64url')+'.fixture'});
          const response=await original(url,init);
          if(url===jobsUrl && ['duplicate-job','wrong-source-job'].includes(scenario)) {
            const value=await response.json();
            if(scenario==='duplicate-job'){value.jobs.push(value.jobs[0]);value.total_count=2;} else value.jobs[0].head_sha='b'.repeat(40);
            return reply(url,value);
          }
          return response;
        });
        await expect(observePtrProductionState(f.input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
        expect(f.privateState.exists({root:'audit',relativePath:'ptr-state-observations/'+identity.sourceCommit+'/'+identity.runId+'-2-'+identity.requestId+'.jws'})).toBe(false);
      } finally {f.cleanup();}
    });
});
