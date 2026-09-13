// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, chmodSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { tmpdir } from 'node:os';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';
import { observePtrProductionState, requestPtrProductionUpdateObservation } from '../scripts/ptr-production-state-observation.mjs';
import * as observationCaller from '../scripts/ptr-production-state-observation.mjs';
import { capturePtrBridgeObservation, signPtrObservation, signPtrUpdateObservation,
  verifyPtrUpdateObservationPair, captureG002BridgeObservation, signG002UpdateObservation,
  verifyG002UpdateObservationPair } from '../services/release-recovery/src/ptrObservation';
import { preparationPrivateJwk } from '../services/release-recovery/test/preparationFixture';
import { createPtrUpdateObservationTransportFixture } from './helpers/ptrUpdateObservationFixture';
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

const updateGateway = 'https://release-auth.warpkeep.com/v1/recovery/ptr-update-observation';
const updateAudience = 'https://release-auth.warpkeep.com/ptr-update-observation';
const updateOidcUrl = 'https://pipelines.actions.githubusercontent.com/token?audience=' + encodeURIComponent(updateAudience);
const commonUpdate = {
  bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
  predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
  scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
  claimRunId: identity.runId, claimRunAttempt: identity.runAttempt,
};
const preContext = () => ({ ...commonUpdate, phase: 'pre' as const });
const updateToken = ['e30', Buffer.from(JSON.stringify({ jti: identity.requestId, aud: updateAudience,
  sha: identity.sourceCommit, run_id: identity.runId, run_attempt: identity.runAttempt })).toString('base64url'), 'fixture'].join('.');
const updateJob = () => ({ ...job(), name: 'operate_ptr',
  labels: parseYaml(readFileSync('.github/workflows/sealed-realms-production.yml','utf8')).jobs.operate_ptr['runs-on'] });
const g002Gateway = 'https://release-auth.warpkeep.com/v1/recovery/g002-update-observation';
const g002Audience = 'https://release-auth.warpkeep.com/g002-update-observation';
const g002OidcUrl = 'https://pipelines.actions.githubusercontent.com/token?audience=' + encodeURIComponent(g002Audience);
const g002Token = ['e30', Buffer.from(JSON.stringify({ jti: identity.requestId, aud: g002Audience,
  sha: identity.sourceCommit, run_id: identity.runId, run_attempt: identity.runAttempt })).toString('base64url'), 'fixture'].join('.');

async function setupUpdate(context: Parameters<typeof signPtrUpdateObservation>[1] = preContext(),
  preObservationJws?: string, realm: 'ptr' | 'g002' = 'ptr') {
  const selectedGateway = realm === 'ptr' ? updateGateway : g002Gateway;
  const selectedOidcUrl = realm === 'ptr' ? updateOidcUrl : g002OidcUrl;
  const selectedToken = realm === 'ptr' ? updateToken : g002Token;
  for (const [key,value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: `operate_${realm}`,
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    GITHUB_SHA: identity.sourceCommit, GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: identity.runAttempt,
    WARPKEEP_OPERATION: `${realm}-update-apply`,
    GITHUB_TOKEN: 'fixture-github-token', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-token' })) vi.stubEnv(key,value);
  const post = context.phase === 'post';
  vi.spyOn(Date, 'now').mockReturnValue((post ? 113 : 108) * 1000);
  const observed = bridge();
  if (post) Object.assign(observed, { observedFrom: 108, observedThrough: 110 });
  observed[realm].programKeccak256 = context.phase === 'pre' ? context.beforeProgram : context.candidateProgram;
  const compact = realm === 'ptr'
    ? await signPtrUpdateObservation(identity, context,
      capturePtrBridgeObservation(observed, expected, post ? 107 : 99, post ? 111 : 106),
      post ? 112 : 107, preparationPrivateJwk, preObservationJws)
    : await signG002UpdateObservation(identity, context,
      captureG002BridgeObservation(observed, expected, post ? 107 : 99, post ? 111 : 106),
      post ? 112 : 107, preparationPrivateJwk, preObservationJws);
  const reattest = vi.fn(async()=>{});
  const fetchMock = vi.fn(async(url:string, init?:RequestInit) => {
    if (url === selectedOidcUrl) return reply(url,{value:selectedToken});
    if (url === jobsUrl) return reply(url, {total_count:1,jobs:[{ ...updateJob(), name: `operate_${realm}` }]});
    if (url === selectedGateway) {
      expect(JSON.parse(String(init?.body))).toEqual({
        oidcToken:selectedToken, sourceCommit:identity.sourceCommit, requestId:identity.requestId, context,
        ...(preObservationJws === undefined ? {} : { preObservationJws }),
      });
      return reply(url,{[realm === 'ptr' ? 'ptrUpdateObservationJws' : 'g002UpdateObservationJws']:compact});
    }
    throw new Error('unexpected request');
  });
  vi.stubGlobal('fetch',fetchMock);
  const baseInput = {
    reattest, sourceCommit:identity.sourceCommit, sourceTree:identity.sourceTree,
    runId:identity.runId, runAttempt:identity.runAttempt,
  };
  const input = (context.phase === 'post'
    ? { ...baseInput, context, preObservationJws }
    : { ...baseInput, context }) as Parameters<typeof requestPtrProductionUpdateObservation>[0];
  return { compact, reattest, fetchMock, input };
}

describe('PTR update observation workflow caller',()=>{
  it('returns a fresh signed pre observation bound to the exact operate_ptr attempt and context',async()=>{
    const transport=createPtrUpdateObservationTransportFixture(identity);
    transport.install();
    const reattest=vi.fn(async()=>{});
    const result=await requestPtrProductionUpdateObservation(transport.callerInput(reattest,preContext()));
    expect(result.observation).toMatchObject({ identity, context:preContext(), purpose:'existing-ptr-update-observation' });
    expect(reattest.mock.calls.length).toBeGreaterThanOrEqual(7);
    expect(transport.requests.map(request=>request.url)).toEqual([updateOidcUrl,jobsUrl,updateGateway]);
  });

  it('rejects non-plain input and context without invoking getters or transport',async()=>{
    const f=await setupUpdate();
    const getter=vi.fn(()=>preContext());
    const input=Object.defineProperty({ ...f.input },'context',{get:getter,enumerable:true});
    await expect(requestPtrProductionUpdateObservation(input)).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
    expect(getter).not.toHaveBeenCalled();
    await expect(requestPtrProductionUpdateObservation(new Proxy(f.input,{}))).rejects.toThrow(
      'PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
    await expect(requestPtrProductionUpdateObservation({ ...f.input, extra: true } as never)).rejects.toThrow(
      'PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
    await expect(requestPtrProductionUpdateObservation({
      ...f.input, context: new Proxy(preContext(), {}),
    })).rejects.toThrow('PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it.each(['wrong-job','inspect-operation','wrong-context','wrong-pre-pair','stale-after-reattest','redirect','oversized'])(
    'refuses %s before returning signed update evidence',async scenario=>{
      let f=await setupUpdate();
      const original=f.fetchMock.getMockImplementation()!;
      if(scenario==='wrong-job') f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>
        url===jobsUrl?reply(url,{total_count:1,jobs:[{...updateJob(),name:'observe_ptr'}]}):original(url,init));
      if(scenario==='inspect-operation') vi.stubEnv('WARPKEEP_OPERATION','ptr-update-inspect');
      if(scenario==='wrong-context') {
        const changed={...preContext(),bindingDigest:'f'.repeat(64)};
        const observed=bridge(); observed.ptr.programKeccak256=changed.beforeProgram;
        const signed=await signPtrUpdateObservation(identity,changed,
          capturePtrBridgeObservation(observed,expected,99,106),107,preparationPrivateJwk);
        f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>
          url===updateGateway?reply(url,{ptrUpdateObservationJws:signed}):original(url,init));
      }
      if(scenario==='wrong-pre-pair') {
        const ownObserved=bridge(); ownObserved.ptr.programKeccak256=commonUpdate.beforeProgram;
        const ownPre=await signPtrUpdateObservation(identity,preContext(),
          capturePtrBridgeObservation(ownObserved,expected,99,106),107,preparationPrivateJwk);
        const foreign={...commonUpdate,bindingDigest:'f'.repeat(64),phase:'pre' as const};
        const observed=bridge(); observed.ptr.programKeccak256=foreign.beforeProgram;
        const pre=await signPtrUpdateObservation(identity,foreign,
          capturePtrBridgeObservation(observed,expected,99,106),107,preparationPrivateJwk);
        const postContext={...foreign,phase:'post' as const,
          preObservationJwsSha256:Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(pre))).toString('hex'),
          completionReceiptDigest:'7'.repeat(64),completionRecordDigest:'8'.repeat(64),terminalRecordDigest:'9'.repeat(64),
          terminalRunId:identity.runId,terminalRunAttempt:identity.runAttempt,terminalOutcome:'completed' as const,
          terminalAt:'1970-01-01T00:01:47.000Z'};
        const postObserved=bridge(); Object.assign(postObserved,{observedFrom:108,observedThrough:110});
        postObserved.ptr.programKeccak256=postContext.candidateProgram;
        const post=await signPtrUpdateObservation(identity,postContext,
          capturePtrBridgeObservation(postObserved,expected,107,112),
          112,preparationPrivateJwk,pre);
        f=await setupUpdate(postContext,pre);
        f.input={...f.input,preObservationJws:ownPre} as typeof f.input;
        const nextOriginal=f.fetchMock.getMockImplementation()!;
        f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>
          url===updateGateway?reply(url,{ptrUpdateObservationJws:post}):nextOriginal(url,init));
      }
      if(scenario==='stale-after-reattest') f.reattest.mockImplementation(async()=>{
        if(f.fetchMock.mock.calls.some(([url])=>url===updateGateway)) vi.spyOn(Date,'now').mockReturnValue(195000);
      });
      if(scenario==='redirect') f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>
        url===updateGateway?reply(updateGateway+'/redirect',{ptrUpdateObservationJws:f.compact}):original(url,init));
      if(scenario==='oversized') f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>
        url===updateGateway?reply(url,{ptrUpdateObservationJws:'x'.repeat(17000)}):original(url,init));
      await expect(requestPtrProductionUpdateObservation(f.input)).rejects.toThrow(
        'PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
      if(['wrong-job','inspect-operation'].includes(scenario))
        expect(f.fetchMock.mock.calls.some(([url])=>url===updateGateway)).toBe(false);
    });

  it('accepts a post only when it forms the exact signed pair supplied in the request',async()=>{
    const preFixture=await setupUpdate();
    const pre=(await requestPtrProductionUpdateObservation(preFixture.input)).compact;
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
    const digest=Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(pre))).toString('hex');
    const postContext={...commonUpdate,phase:'post' as const,preObservationJwsSha256:digest,
      completionReceiptDigest:'7'.repeat(64),completionRecordDigest:'8'.repeat(64),terminalRecordDigest:'9'.repeat(64),
      terminalRunId:identity.runId,terminalRunAttempt:identity.runAttempt,terminalOutcome:'completed' as const,
      terminalAt:'1970-01-01T00:01:47.000Z'};
    const postFixture=await setupUpdate(postContext,pre);
    const result=await requestPtrProductionUpdateObservation(postFixture.input);
    expect((await verifyPtrUpdateObservationPair(pre,result.compact)).post).toEqual(result.observation);
  });
});

const setupG002 = (context = preContext() as Parameters<typeof signG002UpdateObservation>[1], pre?: string) =>
  setupUpdate(context, pre, 'g002');
const requestG002 = async (input: Parameters<typeof requestPtrProductionUpdateObservation>[0]) =>
  observationCaller.requestG002ProductionUpdateObservation(input);
const postContextFor = async (pre: string) => ({ ...commonUpdate, phase:'post' as const,
  preObservationJwsSha256:Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(pre))).toString('hex'),
  completionReceiptDigest:'7'.repeat(64),completionRecordDigest:'8'.repeat(64),terminalRecordDigest:'9'.repeat(64),
  terminalRunId:identity.runId,terminalRunAttempt:identity.runAttempt,terminalOutcome:'completed' as const,
  terminalAt:'1970-01-01T00:01:47.000Z' });

describe('G002 update observation workflow caller',()=>{
  it('requests the fixed G002 audience and endpoint and verifies the signed sealed realm state',async()=>{
    const f=await setupG002();
    const result=await requestG002(f.input);
    expect(result).toMatchObject({compact:f.compact,observation:{
      profile:'warpkeep-recovery-g002-update-observation-v1',aud:g002Audience,
      purpose:'existing-g002-update-observation',identity,context:preContext(),
      observation:{recoveryAuthorizationEpoch:3,bridgeConfigEpoch:7,
        g002:{realmId:'GENESIS_002',databaseName:'warpkeep-genesis-002',programKeccak256:commonUpdate.beforeProgram,
          sealed:true,admissionsOpen:false,accessRequestsOpen:false,playerCount:0,atlasReady:true}},
    }});
    expect(Object.hasOwn(result.observation.observation,'ptr')).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(f.fetchMock.mock.calls.map(([url])=>url)).toEqual([g002OidcUrl,jobsUrl,g002Gateway]);
  });

  it('returns the candidate program only as part of the exact signed G002 pre/post pair',async()=>{
    const first=await setupG002(); const pre=(await requestG002(first.input)).compact;
    const f=await setupG002(await postContextFor(pre),pre);
    const result=await requestG002(f.input);
    const pair=await verifyG002UpdateObservationPair(pre,result.compact);
    expect(pair.pre.observation.g002.programKeccak256).toBe(commonUpdate.beforeProgram);
    expect(pair.post.observation.g002.programKeccak256).toBe(commonUpdate.candidateProgram);
    expect(pair.post).toEqual(result.observation);
  });

  it.each([
    ['GITHUB_JOB','operate_ptr'],['GITHUB_JOB','observe_ptr'],['GITHUB_JOB','operate_readonly'],
    ['WARPKEEP_OPERATION','ptr-update-apply'],['WARPKEEP_OPERATION','g002-update-inspect'],
    ['GITHUB_REF','refs/heads/other'],['GITHUB_SHA','b'.repeat(40)],['GITHUB_RUN_ATTEMPT','3'],
    ['GITHUB_WORKFLOW_REF','ael-dev3/Warpkeep/.github/workflows/other.yml@refs/heads/main'],
  ])('rejects the wrong authenticated workflow coordinate %s=%s before transport',async(key,value)=>{
    const f=await setupG002(); vi.stubEnv(key,value);
    await expect(requestG002(f.input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it('rejects caller-selected realm/policy and accessors without invoking caller code',async()=>{
    const f=await setupG002(); const getter=vi.fn(()=>preContext());
    for(const input of [{...f.input,realm:'ptr'},{...f.input,policy:{}},new Proxy(f.input,{}),
      Object.defineProperty({...f.input},'context',{get:getter,enumerable:true})]) {
      await expect(requestG002(input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
    }
    expect(getter).not.toHaveBeenCalled(); expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it.each(['oidc','jobs','signer','signature'] as const)('revalidates authority after awaiting %s',async boundary=>{
    const f=await setupG002(); const original=f.fetchMock.getMockImplementation()!;
    const selected=boundary==='oidc'?g002OidcUrl:boundary==='jobs'?jobsUrl:g002Gateway;
    let changed=false;
    f.reattest.mockImplementation(async()=>{if(changed)throw new Error('private authority expired');});
    if(boundary==='signature') {
      const verify=crypto.subtle.verify.bind(crypto.subtle);
      vi.spyOn(crypto.subtle,'verify').mockImplementation(async(...args)=>{
        const result=await verify(...args); changed=true; return result;
      });
    } else f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
      const result=await original(url,init); if(url===selected)changed=true; return result;
    });
    await expect(requestG002(f.input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
    if(boundary==='oidc'||boundary==='jobs')expect(f.fetchMock.mock.calls.some(([url])=>url===g002Gateway)).toBe(false);
  });

  it('rejects expiry crossed during actual asynchronous signature verification',async()=>{
    const f=await setupG002(); const verify=crypto.subtle.verify.bind(crypto.subtle);
    vi.spyOn(crypto.subtle,'verify').mockImplementation(async(...args)=>{
      const result=await verify(...args); vi.spyOn(Date,'now').mockReturnValue(195000); return result;
    });
    await expect(requestG002(f.input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
  });

  it.each(['sourceCommit','sourceTree','runId','runAttempt','checkRunId','requestId'] as const)(
    'rejects a valid G002 signature bound to a different %s',async field=>{
      const f=await setupG002(); const original=f.fetchMock.getMockImplementation()!;
      const changed={...identity,[field]:field==='requestId'?'223e4567-e89b-42d3-a456-426614174000':field.startsWith('source')?'b'.repeat(40):'3'};
      const observed=bridge(); observed.candidateCommit=changed.sourceCommit; observed.requestId=changed.requestId;
      const context={...preContext(),claimRunId:changed.runId,claimRunAttempt:changed.runAttempt};
      const compact=await signG002UpdateObservation(changed,context,captureG002BridgeObservation(observed,
        {...expected,candidateCommit:changed.sourceCommit,requestId:changed.requestId},99,106),107,preparationPrivateJwk);
      f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>url===g002Gateway
        ?reply(url,{g002UpdateObservationJws:compact}):original(url,init));
      await expect(requestG002(f.input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
    });

  it.each(['g002','ptr'] as const)('rejects a genuine signature from the other protocol in the %s caller',async realm=>{
    const observed=bridge();
    const foreign=realm==='g002'
      ?await signPtrUpdateObservation(identity,preContext(),capturePtrBridgeObservation(observed,expected,99,106),107,preparationPrivateJwk)
      :await signG002UpdateObservation(identity,preContext(),captureG002BridgeObservation(observed,expected,99,106),107,preparationPrivateJwk);
    const f=await setupUpdate(preContext(),undefined,realm); const original=f.fetchMock.getMockImplementation()!;
    const endpoint=realm==='g002'?g002Gateway:updateGateway;
    const key=realm==='g002'?'g002UpdateObservationJws':'ptrUpdateObservationJws';
    f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>url===endpoint?reply(url,{[key]:foreign}):original(url,init));
    await expect((realm==='g002'?requestG002:requestPtrProductionUpdateObservation)(f.input)).rejects.toThrow(
      realm==='g002'?'G002_PRODUCTION_STATE_OBSERVATION_FAILED':'PTR_PRODUCTION_STATE_OBSERVATION_FAILED');
  });

  it.each(['ptr-job','wrong-response-key','duplicate-response','redirect','oversized','wrong-context','wrong-pre-pair'])(
    'refuses %s without returning G002 update evidence',async scenario=>{
      let f=await setupG002();
      if(scenario==='wrong-pre-pair') {
        const pre=f.compact;
        const other=await setupG002({...preContext(),bindingDigest:'f'.repeat(64)});
        f=await setupG002(await postContextFor(pre),pre);
        f.input={...f.input,preObservationJws:other.compact} as typeof f.input;
      }
      const original=f.fetchMock.getMockImplementation()!;
      let replacement=f.compact;
      if(scenario==='wrong-context')replacement=await signG002UpdateObservation(identity,{...preContext(),scopeDigest:'f'.repeat(64)},
        captureG002BridgeObservation(bridge(),expected,99,106),107,preparationPrivateJwk);
      f.fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
        if(url===jobsUrl&&scenario==='ptr-job')return reply(url,{total_count:1,jobs:[updateJob()]});
        if(url===g002Gateway) {
          if(scenario==='wrong-response-key')return reply(url,{ptrUpdateObservationJws:f.compact});
          if(scenario==='duplicate-response')return reply(url,'{"g002UpdateObservationJws":"x","g002UpdateObservationJws":"y"}');
          return reply(scenario==='redirect'?g002Gateway+'/other':url,
            {g002UpdateObservationJws:scenario==='oversized'?'x'.repeat(17000):replacement});
        }
        return original(url,init);
      });
      await expect(requestG002(f.input)).rejects.toThrow('G002_PRODUCTION_STATE_OBSERVATION_FAILED');
    });
});
