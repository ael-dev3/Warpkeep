import { types } from 'node:util';
import { assertSealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import { parseGitHubJsonObject } from '../services/release-recovery/src/http.ts';
import { snapshotPtrObservationIdentity, snapshotPtrObservationRequest, verifyPtrObservation,
  snapshotPtrUpdateObservationContext, snapshotPtrUpdateObservationRequest, verifyPtrUpdateObservation,
  verifyPtrUpdateObservationPair, PTR_OBSERVATION_AUDIENCE, PTR_OBSERVATION_OPERATION,
  PTR_UPDATE_OBSERVATION_AUDIENCE, PTR_UPDATE_OBSERVATION_JOB,
  PTR_UPDATE_OBSERVATION_PATH, snapshotG002UpdateObservationContext, snapshotG002UpdateObservationRequest,
  verifyG002UpdateObservation, verifyG002UpdateObservationPair, G002_UPDATE_OBSERVATION_AUDIENCE,
  G002_UPDATE_OBSERVATION_JOB, G002_UPDATE_OBSERVATION_PATH } from '../services/release-recovery/src/ptrObservation.ts';

const CODE = 'PTR_PRODUCTION_STATE_OBSERVATION_FAILED';
const ENDPOINT = 'https://release-auth.warpkeep.com/v1/recovery/ptr-observation';
const API = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const CONTEXT = Object.freeze({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'observe_ptr',
  GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' });
const UPDATE_CONTEXT = Object.freeze({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: PTR_UPDATE_OBSERVATION_JOB,
  GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
  WARPKEEP_OPERATION: 'ptr-update-apply' });
const PTR_UPDATE_POLICY = Object.freeze({
  context: UPDATE_CONTEXT, audience: PTR_UPDATE_OBSERVATION_AUDIENCE, job: PTR_UPDATE_OBSERVATION_JOB,
  endpoint: `https://release-auth.warpkeep.com${PTR_UPDATE_OBSERVATION_PATH}`, responseKey: 'ptrUpdateObservationJws',
  snapshotContext: snapshotPtrUpdateObservationContext, snapshotRequest: snapshotPtrUpdateObservationRequest,
  verify: verifyPtrUpdateObservation, verifyPair: verifyPtrUpdateObservationPair,
});
const G002_UPDATE_POLICY = Object.freeze({
  context: Object.freeze({ ...UPDATE_CONTEXT, GITHUB_JOB: G002_UPDATE_OBSERVATION_JOB, WARPKEEP_OPERATION: 'g002-update-apply' }),
  audience: G002_UPDATE_OBSERVATION_AUDIENCE, job: G002_UPDATE_OBSERVATION_JOB,
  endpoint: `https://release-auth.warpkeep.com${G002_UPDATE_OBSERVATION_PATH}`, responseKey: 'g002UpdateObservationJws',
  snapshotContext: snapshotG002UpdateObservationContext, snapshotRequest: snapshotG002UpdateObservationRequest,
  verify: verifyG002UpdateObservation, verifyPair: verifyG002UpdateObservationPair,
});
const fail = () => { throw new Error(CODE); };
const now = () => Math.floor(Date.now() / 1000);
const parse = bytes => parseGitHubJsonObject(bytes, CODE, []);

async function request(url, init, maximum, duration, integerFields = []) {
  const controller = new AbortController();
  const bytes = Buffer.alloc(maximum);
  let response, reader, timer;
  const deadline = performance.now() + duration;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error(CODE)); }, duration);
  });
  const bounded = async operation => {
    const result = await Promise.race([operation, timeout]);
    if (performance.now() >= deadline) fail();
    return result;
  };
  try {
    response = await bounded(globalThis.fetch(url, { ...init, redirect: 'error', cache: 'no-store',
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      headers: { ...init.headers, accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' } }));
    if (!(response instanceof Response) || response.status !== 200 || response.url !== url || response.redirected
      || response.body === null || response.headers.get('link') !== null
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
      || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]{0,6})$/u.test(declared) || Number(declared) > maximum)) fail();
    reader = response.body.getReader();
    let length = 0;
    for (;;) {
      const part = await bounded(reader.read());
      if (part.done) break;
      try {
        if (!(part.value instanceof Uint8Array) || part.value.length > maximum - length) fail();
        bytes.set(part.value, length); length += part.value.length;
      } finally { if (part.value instanceof Uint8Array) part.value.fill(0); }
    }
    if (declared !== null && Number(declared) !== length) fail();
    return parseGitHubJsonObject(bytes.subarray(0, length), CODE, integerFields);
  } finally {
    clearTimeout(timer); controller.abort(); bytes.fill(0);
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* bounded failure only */ }
  }
}

function singleString(value, key) {
  if (Object.keys(value).length !== 1 || typeof value[key] !== 'string') fail();
  return value[key];
}

function options(input) {
  if (!input || typeof input !== 'object' || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = ['privateState', 'reattest', 'sourceCommit', 'sourceTree', 'runId', 'runAttempt'];
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]
    || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) fail();
  const result = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  if (typeof result.reattest !== 'function') fail();
  assertSealedRealmsProductionPrivateState(result.privateState);
  for (const key of ['sourceCommit', 'sourceTree']) if (!/^[0-9a-f]{40}$/u.test(result[key] ?? '')) fail();
  for (const key of ['runId', 'runAttempt']) if (typeof result[key] !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(result[key])) fail();
  return Object.freeze(result);
}

function updateOptions(input, policy) {
  if (!input || typeof input !== 'object' || types.isProxy(input)
    || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const base = ['reattest', 'sourceCommit', 'sourceTree', 'runId', 'runAttempt', 'context'];
  const contextDescriptor = descriptors.context;
  if (!contextDescriptor || !Object.hasOwn(contextDescriptor, 'value') || !contextDescriptor.enumerable) fail();
  const contextValue = contextDescriptor.value;
  if (!contextValue || typeof contextValue !== 'object' || types.isProxy(contextValue)
    || Object.getPrototypeOf(contextValue) !== Object.prototype) fail();
  const context = policy.snapshotContext(contextValue);
  const keys = context.phase === 'post' ? [...base, 'preObservationJws'] : base;
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]
    || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) fail();
  const result = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  if (typeof result.reattest !== 'function') fail();
  for (const key of ['sourceCommit', 'sourceTree']) {
    if (typeof result[key] !== 'string' || !/^[0-9a-f]{40}$/u.test(result[key])) fail();
  }
  for (const key of ['runId', 'runAttempt']) {
    if (typeof result[key] !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(result[key])) fail();
  }
  if (context.phase === 'post' && (typeof result.preObservationJws !== 'string'
    || result.preObservationJws.length > 16384
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(result.preObservationJws))) fail();
  return Object.freeze({ ...result, context });
}

function oidcSource(audience) {
  const source = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const credential = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (typeof source !== 'string' || source.length > 4096 || /[\x00-\x20\x7f]/u.test(source)
    || typeof credential !== 'string' || credential.length > 16384 || !/^[\x21-\x7e]+$/u.test(credential)) fail();
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+actions\.githubusercontent\.com$/u.test(url.hostname)
    || url.searchParams.has('audience')) fail();
  url.searchParams.append('audience', audience);
  return Object.freeze({ url: url.href, credential });
}

function oidcClaims(oidcToken, audience, sourceCommit, runId, runAttempt) {
  if (oidcToken.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(oidcToken)) fail();
  const encoded = oidcToken.split('.')[1];
  const bytes = Buffer.from(encoded, 'base64url');
  try {
    if (bytes.toString('base64url') !== encoded) fail();
    const claims = parse(bytes);
    if (claims.aud !== audience || claims.sha !== sourceCommit
      || claims.run_id !== runId || claims.run_attempt !== runAttempt) fail();
    return claims;
  } finally { bytes.fill(0); }
}

function selectedJob(jobs, name, sourceCommit, runId, runAttempt) {
  if (!Number.isSafeInteger(jobs.total_count) || jobs.total_count < 1 || jobs.total_count > 100
    || !Array.isArray(jobs.jobs) || jobs.jobs.length !== jobs.total_count) fail();
  const selected = jobs.jobs.filter(job => job?.name === name);
  if (selected.length !== 1) fail();
  const job = selected[0];
  const prefix = `${API}/check-runs/`;
  if (job.status !== 'in_progress' || job.conclusion !== null || job.head_sha !== sourceCommit
    || job.run_id !== runId || job.run_attempt !== runAttempt
    || typeof job.id !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(job.id)
    || typeof job.check_run_url !== 'string' || job.check_run_url !== `${prefix}${job.id}`
    || !Array.isArray(job.labels) || job.labels.length !== 5
    || ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']
      .some(label => !job.labels.includes(label))) fail();
  return job.id;
}

/** Requests a separately signed pre/post PTR update observation. This does not
 * persist evidence or grant update, provision, import or adoption authority. */
export async function requestPtrProductionUpdateObservation(input) {
  return requestProductionUpdateObservation(input, PTR_UPDATE_POLICY);
}

/** Requests a separately signed pre/post G002 update observation. This does not
 * persist evidence or grant update, import or historical source authority. */
export async function requestG002ProductionUpdateObservation(input) {
  try { return await requestProductionUpdateObservation(input, G002_UPDATE_POLICY); }
  catch { throw new Error('G002_PRODUCTION_STATE_OBSERVATION_FAILED'); }
}

async function requestProductionUpdateObservation(input, policy) {
  let compact, oidcToken;
  try {
    const o = updateOptions(input, policy);
    const context = () => {
      if (Object.entries(policy.context).some(([key, value]) => process.env[key] !== value)
        || process.env.GITHUB_SHA !== o.sourceCommit || process.env.GITHUB_RUN_ID !== o.runId
        || process.env.GITHUB_RUN_ATTEMPT !== o.runAttempt) fail();
    };
    const reattest = async () => { context(); await o.reattest(); context(); };
    await reattest();
    const source = oidcSource(policy.audience);
    oidcToken = singleString(await request(source.url, { method: 'GET',
      headers: { authorization: `Bearer ${source.credential}` } }, 32768, 30000), 'value');
    await reattest();
    const claims = oidcClaims(oidcToken, policy.audience,
      o.sourceCommit, o.runId, o.runAttempt);
    const body = policy.snapshotRequest({ oidcToken, sourceCommit: o.sourceCommit,
      requestId: claims.jti, context: o.context,
      ...(o.context.phase === 'post' ? { preObservationJws: o.preObservationJws } : {}) });
    await reattest();
    const githubToken = process.env.GITHUB_TOKEN;
    if (typeof githubToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(githubToken)) fail();
    const jobs = await request(`${API}/actions/runs/${o.runId}/attempts/${o.runAttempt}/jobs?per_page=100`,
      { method: 'GET', headers: { authorization: `Bearer ${githubToken}`,
        'x-github-api-version': '2022-11-28' } }, 512 * 1024, 30000,
      ['/jobs/*/id', '/jobs/*/run_id', '/jobs/*/run_attempt']);
    await reattest();
    const checkRunId = selectedJob(jobs, policy.job, o.sourceCommit, o.runId, o.runAttempt);
    const identity = snapshotPtrObservationIdentity({ sourceCommit: o.sourceCommit, sourceTree: o.sourceTree,
      runId: o.runId, runAttempt: o.runAttempt, checkRunId, requestId: body.requestId });
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) > 32768) fail();
    await reattest();
    compact = singleString(await request(policy.endpoint, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: json }, 16384, 120000),
    policy.responseKey);
    oidcToken = undefined;
    await reattest();
    const verifyFresh = async () => {
      const observation = await policy.verify(compact, identity, o.context, now());
      context();
      if (o.context.phase === 'post') {
        await policy.verifyPair(o.preObservationJws, compact);
        context();
      }
      const current = now();
      if (current < observation.issuedAt || current >= observation.expiresAt) fail();
      return observation;
    };
    let observation = await verifyFresh();
    await reattest();
    observation = await verifyFresh();
    context();
    return Object.freeze({ compact, observation });
  } catch { fail(); }
  finally { oidcToken = undefined; }
}

/** Reads signed current PTR state. It never creates an import, provision or adoption receipt. */
export async function observePtrProductionState(input) {
  let compact, oidcToken, persisted;
  try {
    const o = options(input);
    const context = () => {
      if (Object.entries(CONTEXT).some(([key, value]) => process.env[key] !== value)
        || process.env.GITHUB_SHA !== o.sourceCommit || process.env.GITHUB_RUN_ID !== o.runId
        || process.env.GITHUB_RUN_ATTEMPT !== o.runAttempt) fail();
    };
    const reattest = async () => { context(); await o.reattest(); context(); };
    await reattest();
    const source = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const credential = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (typeof source !== 'string' || source.length > 4096 || /[\x00-\x20\x7f]/u.test(source)
      || typeof credential !== 'string' || credential.length > 16384 || !/^[\x21-\x7e]+$/u.test(credential)) fail();
    const oidcUrl = new URL(source);
    if (oidcUrl.protocol !== 'https:' || oidcUrl.username || oidcUrl.password || oidcUrl.port || oidcUrl.hash
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+actions\.githubusercontent\.com$/u.test(oidcUrl.hostname)
      || oidcUrl.searchParams.has('audience')) fail();
    oidcUrl.searchParams.append('audience', PTR_OBSERVATION_AUDIENCE);
    oidcToken = singleString(await request(oidcUrl.href, { method: 'GET',
      headers: { authorization: `Bearer ${credential}` } }, 32768, 30000), 'value');
    if (oidcToken.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(oidcToken)) fail();
    const encodedClaims = oidcToken.split('.')[1];
    const claimsBytes = Buffer.from(encodedClaims, 'base64url');
    let claims;
    try {
      if (claimsBytes.toString('base64url') !== encodedClaims) fail();
      claims = parse(claimsBytes);
    } finally { claimsBytes.fill(0); }
    // Candidate claims are not authentication. The pinned signer verifies this exact fresh JWT.
    if (claims.aud !== PTR_OBSERVATION_AUDIENCE || claims.sha !== o.sourceCommit
      || claims.run_id !== o.runId || claims.run_attempt !== o.runAttempt) fail();
    const body = snapshotPtrObservationRequest({ oidcToken, sourceCommit: o.sourceCommit, requestId: claims.jti });
    await reattest();
    const githubToken = process.env.GITHUB_TOKEN;
    if (typeof githubToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(githubToken)) fail();
    const jobs = await request(`${API}/actions/runs/${o.runId}/attempts/${o.runAttempt}/jobs?per_page=100`,
      { method: 'GET', headers: { authorization: `Bearer ${githubToken}`, 'x-github-api-version': '2022-11-28' } },
      512 * 1024, 30000, ['/jobs/*/id', '/jobs/*/run_id', '/jobs/*/run_attempt']);
    if (!Number.isSafeInteger(jobs.total_count) || jobs.total_count < 1 || jobs.total_count > 100
      || !Array.isArray(jobs.jobs) || jobs.jobs.length !== jobs.total_count) fail();
    const selected = jobs.jobs.filter(job => job?.name === 'observe_ptr');
    if (selected.length !== 1) fail();
    const job = selected[0];
    const prefix = `${API}/check-runs/`;
    if (job.status !== 'in_progress' || job.conclusion !== null || job.head_sha !== o.sourceCommit
      || job.run_id !== o.runId || job.run_attempt !== o.runAttempt
      || typeof job.id !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(job.id)
      || typeof job.check_run_url !== 'string' || !job.check_run_url.startsWith(prefix)
      || job.check_run_url !== `${prefix}${job.id}`
      || !Array.isArray(job.labels) || job.labels.length !== 5
      || ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']
        .some(label => !job.labels.includes(label))) fail();
    const identity = snapshotPtrObservationIdentity({ sourceCommit: o.sourceCommit, sourceTree: o.sourceTree,
      runId: o.runId, runAttempt: o.runAttempt, checkRunId: job.check_run_url.slice(prefix.length), requestId: body.requestId });
    const verifyFresh = async value => {
      const result = await verifyPtrObservation(value, identity, now());
      if (now() < result.issuedAt || now() >= result.expiresAt) fail();
      return result;
    };
    await reattest();
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) > 32768) fail();
    compact = singleString(await request(ENDPOINT, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: json }, 16384, 120000), 'ptrObservationJws');
    oidcToken = undefined;
    await verifyFresh(compact);
    await reattest();
    // Reverify after asynchronous authority checks, including the observation's short validity window.
    await verifyFresh(compact);
    const location = Object.freeze({ root: 'audit', relativePath:
      `ptr-state-observations/${o.sourceCommit}/${o.runId}-${o.runAttempt}-${identity.requestId}.jws` });
    persisted = Buffer.from(compact, 'utf8');
    o.privateState.write({ ...location, bytes: persisted });
    const reopen = async () => {
      const bytes = o.privateState.read(location);
      try {
        if (!bytes.equals(persisted)) fail();
        return await verifyFresh(bytes.toString('utf8'));
      } finally { bytes.fill(0); }
    };
    await reopen();
    await reattest();
    const verified = await reopen();
    const finalBytes = o.privateState.read(location);
    try {
      context();
      if (!finalBytes.equals(persisted) || now() < verified.issuedAt || now() >= verified.expiresAt) fail();
    } finally { finalBytes.fill(0); }
    return Object.freeze({ operation: PTR_OBSERVATION_OPERATION, status: 'state-inspected' });
  } catch { fail(); }
  finally { oidcToken = undefined; compact = undefined; persisted?.fill(0); }
}
