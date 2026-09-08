import { execFileSync } from 'node:child_process';
import { types } from 'node:util';
import { parseWorkflowEvidenceJson } from './sealed-realms-production-workflow-evidence-json.mjs';

const COMMIT = /^[0-9a-f]{40}$/u;
const POSITIVE = /^[1-9][0-9]{0,19}$/u;
const REPOSITORY = 'ael-dev3/Warpkeep';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const VERIFY_PATH = '.github/workflows/verify.yml';
const WORKFLOW_PATH = '.github/workflows/sealed-realms-production.yml';
const scopes = new WeakMap();
const GIT = process.platform === 'win32' ? 'git' : String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const NULL_PATH = String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108);
const FIXED_PATH = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110);
const GIT_ENV = Object.freeze({ GIT_CONFIG_GLOBAL: NULL_PATH, GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_REPLACE_OBJECTS: '1', HOME: NULL_PATH, PATH: FIXED_PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' });

function fail(code = 'SEALED_REALMS_WORKFLOW_EVIDENCE_INVALID') {
  const error = new Error(code);
  error.name = 'SealedRealmsProductionWorkflowEvidenceError';
  error.code = code;
  throw error;
}

function exactInput(input) {
  if (types.isProxy(input) || input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, 'workflowInputSha')) fail();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'workflowInputSha');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
    || typeof descriptor.value !== 'string' || !COMMIT.test(descriptor.value)) fail();
  return descriptor.value;
}

function git(args) {
  try {
    return execFileSync(GIT, ['--no-replace-objects', ...args], { cwd: process.cwd(),
      env: GIT_ENV, encoding: 'utf8', maxBuffer: 128 * 1_024, timeout: 5_000, windowsHide: true });
  } catch { fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SOURCE_INVALID'); }
}

function localSource(commit) {
  if (git(['rev-parse', '--verify', 'HEAD^{commit}']) !== `${commit}\n`
    || git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']) !== `${commit}\n`) {
    fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SOURCE_INVALID');
  }
  let bytes;
  try {
    bytes = Buffer.from(git(['show', `${commit}:config/releases/0.4.0-sealed-launch.json`]));
    const binding = parseWorkflowEvidenceJson(bytes);
    if (binding.pagesDeploymentApproved === false && binding.preparationSourceCommit === null) {
      return Object.freeze([commit]);
    }
    // These are lookup coordinates only. Source authority still owns the full
    // S/A schema, tree, version transform and permitted-operation validation.
    const parent = binding.preparationSourceCommit;
    if (binding.pagesDeploymentApproved !== true || typeof parent !== 'string' || !COMMIT.test(parent)
      || parent === commit || git(['rev-list', '--parents', '-n', '1', 'HEAD']) !== `${commit} ${parent}\n`
      || git(['rev-parse', '--verify', `${parent}^{commit}`]) !== `${parent}\n`) {
      fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SOURCE_INVALID');
    }
    return Object.freeze([commit, parent]);
  } catch { fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SOURCE_INVALID'); }
  finally { bytes?.fill(0); }
}

function context(commit) {
  const operation = process.env.WARPKEEP_OPERATION;
  const job = operation === 'activation-evidence-generate' ? 'operate'
    : ['preflight', 'activation-evidence-inspect', 'g001-policy-observe'].includes(operation) ? 'operate_readonly' : undefined;
  if (job === undefined) fail('SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID');
  const fixed = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: 'refs/heads/main', GITHUB_SHA: commit, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_JOB: job, GITHUB_WORKFLOW: 'Sealed Realms Production',
    GITHUB_WORKFLOW_REF: `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main` };
  if (Object.entries(fixed).some(([key, value]) => process.env[key] !== value)) {
    fail('SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID');
  }
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const token = process.env.GITHUB_TOKEN;
  if (!POSITIVE.test(runId ?? '') || !POSITIVE.test(runAttempt ?? '') || BigInt(runAttempt) > 1_000n
    || typeof token !== 'string' || !/^\S{20,4096}$/u.test(token)) {
    fail('SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID');
  }
  return { runId, runAttempt, token, operation, job };
}

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  return value;
}

function repository(value) {
  const raw = record(value);
  const owner = record(raw.owner);
  if (raw.id !== '1273513252' || raw.full_name !== REPOSITORY
    || owner.id !== '183124839' || owner.login !== 'ael-dev3') fail();
  return raw;
}

function runIdentity(value, commit, path, name, event) {
  const raw = record(value);
  repository(raw.repository);
  const headRepository = record(raw.head_repository);
  if (!POSITIVE.test(raw.id ?? '') || !POSITIVE.test(raw.run_attempt ?? '')
    || !POSITIVE.test(raw.run_number ?? '') || !POSITIVE.test(raw.workflow_id ?? '')
    || raw.name !== name || ![path, `${path}@main`].includes(raw.path)
    || raw.event !== event || raw.head_branch !== 'main' || raw.head_sha !== commit
    || headRepository.id !== '1273513252' || headRepository.full_name !== REPOSITORY
    || raw.url !== `${API}/actions/runs/${raw.id}`
    || raw.workflow_url !== `${API}/actions/workflows/${raw.workflow_id}`) fail();
  return raw;
}

function sameRun(left, right) {
  return ['id', 'run_attempt', 'run_number', 'workflow_id', 'head_sha', 'path', 'status', 'conclusion']
    .every(key => left[key] === right[key]);
}

async function load(state) {
  const controller = new AbortController();
  state.controller = controller;
  let timer;
  const deadline = performance.now() + 30_000;
  const timeout = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('interrupted')), { once: true });
    timer = setTimeout(() => controller.abort(), 30_000);
  });
  const bounded = async operation => {
    const result = await Promise.race([operation, timeout]);
    if (performance.now() >= deadline) fail();
    return result;
  };
  const request = async path => {
    if (state.revoked || controller.signal.aborted) fail();
    const url = `${API}${path}`;
    let response, reader, bytes;
    const chunks = [];
    try {
      response = await bounded(state.fetch(url, { method: 'GET', redirect: 'error', cache: 'no-store',
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${state.identity.token}`,
          'x-github-api-version': '2022-11-28', 'accept-encoding': 'identity' } }));
      if (!(response instanceof Response) || response.status !== 200 || response.redirected
        || response.url !== url || response.body === null
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
        || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(0|[1-9][0-9]{0,6})$/u.test(declared) || Number(declared) > 512 * 1_024)) fail();
      if (response.headers.get('link') !== null) fail();
      reader = response.body.getReader();
      let size = 0;
      for (;;) {
        const part = await bounded(reader.read());
        if (part.done) break;
        if (!(part.value instanceof Uint8Array) || part.value.length > 512 * 1_024 - size) fail();
        chunks.push(Buffer.from(part.value)); size += part.value.length;
        if (declared !== null && size > Number(declared)) fail();
      }
      if (declared !== null && size !== Number(declared)) fail();
      bytes = Buffer.concat(chunks, size);
      return parseWorkflowEvidenceJson(bytes);
    } finally {
      try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* sanitized */ }
      try { reader?.releaseLock(); } catch { /* a cancellation may still settle */ }
      bytes?.fill(0); for (const chunk of chunks) chunk.fill(0);
    }
  };
  const current = async () => {
    const [branch, raw] = await Promise.all([request('/branches/main'), request(`/actions/runs/${state.identity.runId}`)]);
    if (branch.name !== 'main' || branch.protected !== true || record(branch.commit).sha !== state.commit) fail();
    const run = runIdentity(raw, state.commit, WORKFLOW_PATH, 'Sealed Realms Production', 'workflow_dispatch');
    if (run.id !== state.identity.runId || run.run_attempt !== state.identity.runAttempt
      || run.status !== 'in_progress' || run.conclusion !== null) fail();
  };
  const discover = async commit => {
    const listing = await request(`/actions/workflows/verify.yml/runs?branch=main&event=push&head_sha=${commit}&per_page=100&page=1`);
    if (!Number.isSafeInteger(listing.total_count) || listing.total_count < 1 || listing.total_count > 100
      || !Array.isArray(listing.workflow_runs) || listing.workflow_runs.length !== listing.total_count) fail();
    const runs = listing.workflow_runs.map(raw => runIdentity(raw, commit, VERIFY_PATH, 'Verify', 'push'));
    if (new Set(runs.map(run => run.id)).size !== runs.length
      || new Set(runs.map(run => run.run_number)).size !== runs.length
      || new Set(runs.map(run => run.workflow_id)).size !== 1) fail();
    const selected = runs.reduce((left, right) => BigInt(left.run_number) > BigInt(right.run_number) ? left : right);
    if (selected.id === state.identity.runId || selected.status !== 'completed' || selected.conclusion !== 'success') fail();
    return selected;
  };
  try {
    const repo = repository(await request(''));
    if (repo.name !== 'Warpkeep' || repo.default_branch !== 'main' || repo.archived !== false || repo.disabled !== false) fail();
    await current();
    const proofs = await Promise.all(state.commits.map(async commit => {
      const selected = await discover(commit);
      const latest = runIdentity(await request(`/actions/runs/${selected.id}`), commit, VERIFY_PATH, 'Verify', 'push');
      const attempt = runIdentity(await request(`/actions/runs/${selected.id}/attempts/${selected.run_attempt}`), commit, VERIFY_PATH, 'Verify', 'push');
      const reopened = runIdentity(await request(`/actions/runs/${selected.id}`), commit, VERIFY_PATH, 'Verify', 'push');
      const rediscovered = await discover(commit);
      if (!sameRun(selected, latest) || !sameRun(latest, attempt) || !sameRun(attempt, reopened)
        || !sameRun(reopened, rediscovered)) fail();
      return commit;
    }));
    await current();
    return new Set(proofs);
  } catch { fail('SEALED_REALMS_WORKFLOW_EVIDENCE_UNAVAILABLE'); }
  finally { clearTimeout(timer); controller.abort(); state.controller = undefined; }
}

function scopeState(scope) {
  const state = scopes.get(scope);
  if (state === undefined || state.revoked) fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SCOPE_INVALID');
  return state;
}

/** Only genuine fixed GitHub readback can populate a synchronous evidence scope. */
export async function createSealedRealmsProductionWorkflowEvidence(input) {
  if (arguments.length !== 1) fail();
  const commit = exactInput(input);
  const identity = context(commit);
  const commits = localSource(commit);
  if (typeof globalThis.fetch !== 'function') fail();
  const scope = Object.freeze({});
  scopes.set(scope, { commit, commits, identity, fetch: globalThis.fetch,
    proofs: undefined, refreshing: false, revoked: false });
  try { await refreshSealedRealmsProductionWorkflowEvidence(scope); return scope; }
  catch (error) { revokeSealedRealmsProductionWorkflowEvidence(scope); throw error; }
}

export async function refreshSealedRealmsProductionWorkflowEvidence(scope) {
  if (arguments.length !== 1) fail();
  const state = scopeState(scope);
  state.proofs = undefined;
  if (state.refreshing) {
    revokeSealedRealmsProductionWorkflowEvidence(scope);
    fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SCOPE_INVALID');
  }
  state.refreshing = true;
  try {
    if (JSON.stringify(context(state.commit)) !== JSON.stringify(state.identity)
      || JSON.stringify(localSource(state.commit)) !== JSON.stringify(state.commits)) fail();
    const proofs = await load(state);
    if (state.revoked || JSON.stringify(context(state.commit)) !== JSON.stringify(state.identity)
      || JSON.stringify(localSource(state.commit)) !== JSON.stringify(state.commits)) fail();
    state.proofs = proofs;
    state.freshUntil = performance.now() + 30_000;
  } catch { fail('SEALED_REALMS_WORKFLOW_EVIDENCE_UNAVAILABLE'); }
  finally { state.refreshing = false; }
}

export function verifySealedRealmsProductionWorkflowEvidence(scope, commit) {
  if (arguments.length !== 2 || typeof commit !== 'string' || !COMMIT.test(commit)) fail();
  const state = scopeState(scope);
  if (state.refreshing || !state.proofs?.has(commit) || performance.now() >= state.freshUntil
    || JSON.stringify(context(state.commit)) !== JSON.stringify(state.identity)) fail();
  return Object.freeze({ verifiedSha: commit });
}

export function revokeSealedRealmsProductionWorkflowEvidence(scope) {
  if (arguments.length !== 1) fail();
  const state = scopes.get(scope);
  if (state === undefined) fail('SEALED_REALMS_WORKFLOW_EVIDENCE_SCOPE_INVALID');
  state.revoked = true; state.proofs = undefined; state.identity.token = undefined; state.controller?.abort();
}
