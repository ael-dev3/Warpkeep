import { types } from 'node:util';
import {
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';

export const SEALED_REALMS_PRODUCTION_REPOSITORY = 'ael-dev3/Warpkeep';
export const SEALED_REALMS_PRODUCTION_WORKFLOW_PATH =
  '.github/workflows/sealed-realms-production.yml';
export const SEALED_REALMS_PRODUCTION_WORKFLOW_PHASES = Object.freeze([
  'permit-issue',
  'ptr-observation',
  'ptr-update-observation',
  'continuation-issue',
  'continuation-claim',
  'continuation-effect',
  'continuation-terminal',
  'continuation-reconcile',
  'continuation-reconcile-terminal',
]);

const GITHUB_ORIGIN = 'https://api.github.com';
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const SECRET = /^\S{20,4096}$/u;
const MAXIMUM_GITHUB_RESPONSE_BYTES = 512 * 1_024;
const permitStates = new WeakMap();

export class SealedRealmsProductionWorkflowAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionWorkflowAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionWorkflowAuthorityError(code);
}

function inputRecord(value, allowedKeys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !allowedKeys.includes(key))
  ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_INPUT_INVALID');
  return value;
}

function exactRunIdentity(runId, runAttempt) {
  const attempt = String(runAttempt ?? '');
  if (
    !RUN_ID.test(runId ?? '')
    || !RUN_ID.test(attempt)
    || Number(attempt) > 1_000
  ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_INPUT_INVALID');
  return Object.freeze({ runId, runAttempt: attempt });
}

async function boundedGithubJson(response, expectedUrl, signal) {
  let reader;
  let bytes;
  let onAbort;
  let complete = false;
  const chunks = [];
  try {
    let responseOrigin;
    try { responseOrigin = new URL(response?.url).origin; } catch {
      fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    }
    if (
      !(response instanceof Response)
      || response.redirected
      || response.status !== 200
      || response.url !== expectedUrl
      || responseOrigin !== GITHUB_ORIGIN
      || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
        response.headers.get('content-type') ?? '',
      )
    ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    const length = response.headers.get('content-length');
    if (
      length !== null
      && (!/^[0-9]+$/u.test(length)
        || Number(length) > MAXIMUM_GITHUB_RESPONSE_BYTES)
    ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    if (response.body === null || signal.aborted) {
      fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    }
    reader = response.body.getReader();
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(new SealedRealmsProductionWorkflowAuthorityError(
        'SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID',
      ));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let total = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) { complete = true; break; }
      if (!types.isUint8Array(chunk.value)) {
        fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
      }
      total += chunk.value.byteLength;
      if (total > MAXIMUM_GITHUB_RESPONSE_BYTES
        || (length !== null && total > Number(length))) {
        fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
      }
      chunks.push(Buffer.from(chunk.value));
    }
    if (length !== null && total !== Number(length)) {
      fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    }
    bytes = Buffer.concat(chunks, total);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SealedRealmsProductionWorkflowAuthorityError) throw error;
    fail('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
    if (!complete) {
      try { void (reader === undefined ? response?.body?.cancel() : reader.cancel())?.catch(() => {}); }
      catch { /* Cleanup cannot replace the bounded failure. */ }
    }
    try { reader?.releaseLock(); } catch { /* A cancelled pending read may still be settling. */ }
    bytes?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function reattest(state, inactiveClaimRun) {
  let interrupted;
  try { interrupted = state.isInterrupted(); } catch {
    fail('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED');
  }
  if (interrupted) {
    fail('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED');
  }
  const request = async (path) => {
    const url = `${GITHUB_ORIGIN}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await state.fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${state.githubToken}`,
          'x-github-api-version': '2022-11-28',
        },
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      fail('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_UNAVAILABLE');
    }
    try { return await boundedGithubJson(response, url, controller.signal); }
    finally { clearTimeout(timer); }
  };
  const [branch, run, claimRun] = await Promise.all([
    request(`/repos/${SEALED_REALMS_PRODUCTION_REPOSITORY}/branches/main`),
    request(`/repos/${SEALED_REALMS_PRODUCTION_REPOSITORY}/actions/runs/${state.runId}`),
    inactiveClaimRun === undefined
      ? Promise.resolve(undefined)
      : request(
        `/repos/${SEALED_REALMS_PRODUCTION_REPOSITORY}/actions/runs/${inactiveClaimRun.runId}`,
      ),
  ]);
  try { interrupted = state.isInterrupted(); } catch {
    fail('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED');
  }
  if (
    branch === null
    || typeof branch !== 'object'
    || Array.isArray(branch)
    || branch.name !== 'main'
    || branch.protected !== true
    || branch.commit?.sha !== state.sourceCommit
    || run === null
    || typeof run !== 'object'
    || Array.isArray(run)
    || String(run.id) !== state.runId
    || run.run_attempt !== Number(state.runAttempt)
    || run.event !== 'workflow_dispatch'
    || run.status !== 'in_progress'
    || run.conclusion !== null
    || run.head_branch !== 'main'
    || run.head_sha !== state.sourceCommit
    || run.path !== SEALED_REALMS_PRODUCTION_WORKFLOW_PATH
    || run.repository?.full_name !== SEALED_REALMS_PRODUCTION_REPOSITORY
    || interrupted
  ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED');
  if (inactiveClaimRun !== undefined && (
    claimRun === null
    || typeof claimRun !== 'object'
    || Array.isArray(claimRun)
    || String(claimRun.id) !== inactiveClaimRun.runId
    || claimRun.run_attempt !== Number(inactiveClaimRun.runAttempt)
    || claimRun.event !== 'workflow_dispatch'
    || claimRun.status !== 'completed'
    || ![
      'success', 'failure', 'cancelled', 'skipped', 'timed_out',
      'action_required', 'neutral', 'stale', 'startup_failure',
    ].includes(claimRun.conclusion)
    || claimRun.head_branch !== 'main'
    || claimRun.head_sha !== state.sourceCommit
    || claimRun.path !== SEALED_REALMS_PRODUCTION_WORKFLOW_PATH
    || claimRun.repository?.full_name !== SEALED_REALMS_PRODUCTION_REPOSITORY
  )) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_CLAIM_RUN_LIVE');
}

/** Issues one process-local permit only after a fresh sealed-realms GitHub attestation. */
export async function issueSealedRealmsProductionWorkflowPermit(input) {
  const options = inputRecord(input, [
    'sourceAuthority', 'githubToken', 'runId', 'runAttempt', 'fetchImpl',
    'isInterrupted',
  ]);
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(
    options.sourceAuthority,
  );
  const run = exactRunIdentity(options.runId, options.runAttempt);
  if (
    !SOURCE_COMMIT.test(sourceCommit)
    || !SECRET.test(options.githubToken ?? '')
    || (options.fetchImpl !== undefined && typeof options.fetchImpl !== 'function')
    || (options.isInterrupted !== undefined && typeof options.isInterrupted !== 'function')
  ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_INPUT_INVALID');
  const state = Object.freeze({
    sourceAuthority: options.sourceAuthority,
    sourceCommit,
    operation: options.sourceAuthority.operation,
    githubToken: options.githubToken,
    runId: run.runId,
    runAttempt: run.runAttempt,
    fetchImpl: options.fetchImpl ?? fetch,
    isInterrupted: options.isInterrupted ?? (() => false),
  });
  await reattest(state);
  const permit = Object.freeze({});
  permitStates.set(permit, state);
  return permit;
}

/** Re-attests the exact run immediately before one fixed protected phase. */
export async function attestSealedRealmsProductionWorkflowPermit(input) {
  const options = inputRecord(input, [
    'permit', 'sourceAuthority', 'phase', 'runId', 'runAttempt',
    'claimRunId', 'claimRunAttempt',
  ]);
  const state = permitStates.get(options.permit);
  if (state === undefined) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID');
  const run = exactRunIdentity(options.runId, options.runAttempt);
  const reconciliation = options.phase === 'continuation-reconcile'
    || options.phase === 'continuation-reconcile-terminal';
  const hasAnyClaimRun = Object.hasOwn(options, 'claimRunId')
    || Object.hasOwn(options, 'claimRunAttempt');
  const hasClaimRun = Object.hasOwn(options, 'claimRunId')
    && Object.hasOwn(options, 'claimRunAttempt');
  let claimRun;
  if (reconciliation && hasClaimRun) {
    claimRun = exactRunIdentity(options.claimRunId, options.claimRunAttempt);
  }
  if (
    options.sourceAuthority !== state.sourceAuthority
    || !SEALED_REALMS_PRODUCTION_WORKFLOW_PHASES.includes(options.phase)
    || options.phase === 'permit-issue'
    || (options.phase === 'ptr-observation') !== (state.operation === 'ptr-state-inspect')
    || (options.phase === 'ptr-update-observation'
      && state.operation !== 'ptr-update-apply')
    || run.runId !== state.runId
    || run.runAttempt !== state.runAttempt
    || sourceCommitFromSealedRealmsProductionAuthority(options.sourceAuthority)
      !== state.sourceCommit
    || options.sourceAuthority.operation !== state.operation
    || reconciliation !== hasClaimRun
    || hasAnyClaimRun !== hasClaimRun
    || (claimRun !== undefined && claimRun.runId === state.runId)
  ) fail('SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID');
  await reattest(state, claimRun);
  return true;
}

export function assertSealedRealmsProductionWorkflowPermit(permit) {
  if (!permitStates.has(permit)) {
    fail('SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID');
  }
  return permit;
}
