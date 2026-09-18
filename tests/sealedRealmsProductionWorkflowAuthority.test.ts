import { describe, expect, it, vi } from 'vitest';

import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const S = '1'.repeat(40);
const A = '2'.repeat(40);
const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/sealed-realms-production.yml';
type WorkflowAuthorityModule = Readonly<{
  issueSealedRealmsProductionWorkflowPermit?: (input: Record<string, unknown>) => Promise<object>;
  attestSealedRealmsProductionWorkflowPermit?: (input: Record<string, unknown>) => Promise<true>;
  assertSealedRealmsProductionWorkflowPermit?: (permit: unknown) => unknown;
  attestSealedRealmsProductionCompletedCensusRun?: (input: Record<string, unknown>) => Promise<true>;
}>;

async function workflowAuthorityModule(): Promise<WorkflowAuthorityModule> {
  return import('../scripts/sealed-realms-production-workflow-authority.mjs')
    .catch(() => Object.freeze({})) as Promise<WorkflowAuthorityModule>;
}

function sourceAuthority(
  operation = 'g002-publish-inspect',
  sourceCommit = S,
) {
  const readGit = (arguments_: readonly string[]) => {
    if (arguments_.join('\0') === 'rev-parse\0--verify\0HEAD^{commit}') {
      return `${sourceCommit}\n`;
    }
    if (arguments_.join('\0') === 'rev-parse\0--verify\0refs/remotes/origin/main^{commit}') {
      return `${sourceCommit}\n`;
    }
    throw new Error(`unexpected git call: ${arguments_.join(' ')}`);
  };
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: sourceCommit,
    readGit,
    readBinding: () => Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: commit => ({ verifiedSha: commit }),
  });
}

function response(url: string, value: unknown) {
  const body = JSON.stringify(value);
  const result = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function github(options: Readonly<{
  sourceCommit?: string;
  runId?: string;
  runAttempt?: number;
  mutateBranch?: (branch: Record<string, unknown>) => void;
  mutateRun?: (run: Record<string, unknown>, request: number) => void;
}> = {}) {
  const sourceCommit = options.sourceCommit ?? S;
  const runId = options.runId ?? '1001';
  const runAttempt = options.runAttempt ?? 1;
  let runRequests = 0;
  const calls: Readonly<{ url: string; init: RequestInit | undefined }>[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/branches/main')) {
      const branch: Record<string, unknown> = {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      };
      options.mutateBranch?.(branch);
      return response(url, branch);
    }
    if (url.endsWith(`/actions/runs/${runId}`)) {
      runRequests += 1;
      const run: Record<string, unknown> = {
        id: Number(runId),
        run_attempt: runAttempt,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        head_branch: 'main',
        head_sha: sourceCommit,
        path: WORKFLOW_PATH,
        repository: { full_name: REPOSITORY },
      };
      options.mutateRun?.(run, runRequests);
      return response(url, run);
    }
    throw new Error(`unexpected GitHub request: ${url}`);
  });
  return { fetchImpl, calls };
}

async function censusFixture(scenario = 'success', operation = 'activation-evidence-generate') {
  const module = await workflowAuthorityModule();
  let censusReads = 0, afterJobs = false, rerunDuringReattestation = false;
  const remote = github({
    mutateBranch: branch => {
      if (afterJobs && scenario === 'main-advanced') branch.commit = { sha: A };
      if (afterJobs && scenario === 'rerun-during-reattest') rerunDuringReattestation = true;
    },
    mutateRun: run => { if (afterJobs && scenario === 'activation-stopped') run.status = 'completed'; },
  });
  const authority = sourceAuthority(operation);
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/actions/runs/900/')) {
      if (!url.endsWith('/actions/runs/900')) return remote.fetchImpl(input, init);
    }
    if (url.endsWith('/jobs?per_page=100&page=1')) {
      afterJobs = true;
      const job = { name: 'operate_readonly', run_id: 900, run_attempt: 1,
        status: 'completed', conclusion: 'success', head_sha: S, head_branch: 'main',
        runner_name: 'warpkeep-wsl-production-01',
        labels: ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
        steps: [{ name: 'Attest runtime and execute authenticated operation', status: 'completed', conclusion: 'success' }],
      };
      if (scenario === 'wrong-job') job.name = 'operate';
      if (scenario === 'wrong-runner') job.runner_name = 'unrelated';
      if (scenario === 'wrong-labels') job.labels.pop();
      if (scenario === 'wrong-job-source') job.head_sha = A;
      if (scenario === 'wrong-job-attempt') job.run_attempt = 2;
      if (scenario === 'job-skipped') job.conclusion = 'skipped';
      if (scenario === 'step-skipped') job.steps[0].conclusion = 'skipped';
      if (scenario === 'step-missing') job.steps = [];
      return response(url, { total_count: scenario === 'truncated-jobs' ? 101 : scenario === 'duplicate-job' ? 2 : 1,
        jobs: scenario === 'duplicate-job' ? [job, job] : [job] });
    }
    censusReads++;
    const run = { id: 900, run_attempt: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
      head_branch: 'main', head_sha: S, path: WORKFLOW_PATH, name: 'Sealed Realms Production',
      display_title: `g001-freeze-census @ ${S}`, repository: { full_name: REPOSITORY } };
    if (scenario === 'failed-census') run.conclusion = 'failure';
    if (scenario === 'live-census') run.status = 'in_progress';
    if (scenario === 'wrong-operation') run.display_title = `g001-policy-observe @ ${S}`;
    if (scenario === 'wrong-workflow') run.path = '.github/workflows/verify.yml';
    if (scenario === 'wrong-repo') run.repository.full_name = 'different/Warpkeep';
    if (scenario === 'wrong-source') run.head_sha = A;
    if (scenario === 'wrong-branch') run.head_branch = 'other';
    if (scenario === 'rerun-after-jobs' && censusReads === 3) run.run_attempt = 2;
    if (rerunDuringReattestation) run.run_attempt = 2;
    if (scenario === 'attempt-failed' && url.endsWith('/attempts/1')) run.conclusion = 'failure';
    return response(url, run);
  });
  const permit = await module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: authority,
    githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl });
  return { module, fetchImpl, input: { permit, sourceAuthority: authority, censusRunId: '900', censusRunAttempt: '1' } };
}

describe('completed Linux census provenance', () => {
  it.each(['activation-evidence-inspect', 'activation-evidence-generate'])('joins exact successful census to live %s', async operation => {
    const f = await censusFixture('success', operation);
    await expect(f.module.attestSealedRealmsProductionCompletedCensusRun!(f.input)).resolves.toBe(true);
    const paths = f.fetchImpl.mock.calls.map(([url]) => String(url));
    expect(paths.filter(path => path.endsWith('/actions/runs/900'))).toHaveLength(2);
    expect(paths).toContain(`https://api.github.com/repos/${REPOSITORY}/actions/runs/900/attempts/1/jobs?per_page=100&page=1`);
    expect(f.fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });
  it.each(['failed-census', 'live-census', 'wrong-operation', 'wrong-workflow', 'wrong-repo', 'wrong-source',
    'wrong-branch', 'rerun-after-jobs', 'rerun-during-reattest', 'attempt-failed', 'wrong-job', 'wrong-runner', 'wrong-labels',
    'wrong-job-source', 'wrong-job-attempt', 'job-skipped', 'step-skipped', 'step-missing', 'truncated-jobs',
    'duplicate-job', 'main-advanced', 'activation-stopped'])('rejects %s instead of consuming retained data', async scenario => {
    const f = await censusFixture(scenario);
    await expect(f.module.attestSealedRealmsProductionCompletedCensusRun!(f.input)).rejects.toThrow(/SEALED_REALMS_WORKFLOW_AUTHORITY_/u);
  });
  it.each(['g001-freeze-census', 'ptr-state-inspect', 'preflight'])('refuses a %s permit before census reads', async operation => {
    const f = await censusFixture('success', operation), before = f.fetchImpl.mock.calls.length;
    await expect(f.module.attestSealedRealmsProductionCompletedCensusRun!(f.input)).rejects.toThrow('PERMIT_INVALID');
    expect(f.fetchImpl).toHaveBeenCalledTimes(before);
  });
  it.each(['copy', 'same-run', 'extra', 'getter', 'foreign-source', 'bad-attempt'])('rejects malformed %s selector before reads', async scenario => {
    const f = await censusFixture(), before = f.fetchImpl.mock.calls.length;
    const input: Record<string, unknown> = { ...f.input }, getter = vi.fn();
    if (scenario === 'copy') input.permit = { ...f.input.permit };
    if (scenario === 'same-run') input.censusRunId = '1001';
    if (scenario === 'extra') input.sourceCommit = S;
    if (scenario === 'getter') Object.defineProperty(input, 'censusRunId', { enumerable: true, get: getter });
    if (scenario === 'foreign-source') input.sourceAuthority = sourceAuthority('activation-evidence-generate');
    if (scenario === 'bad-attempt') input.censusRunAttempt = '1001';
    await expect(f.module.attestSealedRealmsProductionCompletedCensusRun!(input)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled(); expect(f.fetchImpl).toHaveBeenCalledTimes(before);
  });
});

function requireExports(module: WorkflowAuthorityModule) {
  expect(module.issueSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  expect(module.attestSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  expect(module.assertSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  return typeof module.issueSealedRealmsProductionWorkflowPermit === 'function'
    && typeof module.attestSealedRealmsProductionWorkflowPermit === 'function'
    && typeof module.assertSealedRealmsProductionWorkflowPermit === 'function';
}

describe('sealed-realms protected workflow authority', () => {
  it('cancels an oversized chunked GitHub body before buffering it completely', async () => {
    const module = await workflowAuthorityModule();
    const remote = github();
    const cancel = vi.fn();
    let chunks = 0;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith('/branches/main')) return remote.fetchImpl(input, init);
      const result = new Response(new ReadableStream({
        pull(controller) { chunks += 1; controller.enqueue(new Uint8Array(300 * 1024)); },
        cancel,
      }), { headers: { 'content-type': 'application/json' } });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    };
    await expect(module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: sourceAuthority(),
      githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl,
    })).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThanOrEqual(3);
  });

  it('keeps the request deadline active through a stalled response body', async () => {
    const module = await workflowAuthorityModule();
    const remote = github();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    vi.useFakeTimers();
    try {
      const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (!url.endsWith('/branches/main')) return remote.fetchImpl(input, init);
        const result = new Response(new ReadableStream({ cancel }), {
          headers: { 'content-type': 'application/json' },
        });
        Object.defineProperty(result, 'url', { value: url });
        return result;
      };
      const pending = module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: sourceAuthority(),
        githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl,
      });
      const rejected = expect(pending).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
      await vi.advanceTimersByTimeAsync(10_001);
      await rejected;
      expect(cancel).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it.each(['1', '500'])('rejects a mismatched declared body length %s', async length => {
    const module = await workflowAuthorityModule();
    const remote = github();
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const result = await remote.fetchImpl(input, init);
      if (String(input).endsWith('/branches/main')) result.headers.set('content-length', length);
      return result;
    };
    await expect(module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: sourceAuthority(),
      githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl,
    })).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
  });

  it('clears the request timer when fetching rejects before headers', async () => {
    const module = await workflowAuthorityModule();
    vi.useFakeTimers();
    try {
      await expect(module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: sourceAuthority(),
        githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1',
        fetchImpl: async () => { throw new Error('private upstream failure details'); },
      })).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_UNAVAILABLE');
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('rejects invalid UTF-8 instead of replacing malformed bytes in authenticated metadata', async () => {
    const module = await workflowAuthorityModule();
    const remote = github();
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith('/branches/main')) return remote.fetchImpl(input, init);
      const result = new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    };
    await expect(module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: sourceAuthority(),
      githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl,
    })).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_GITHUB_RESPONSE_INVALID');
  });

  it('binds the observation phase exclusively to the new observation operation', async () => {
    const module = await workflowAuthorityModule();
    for (const operation of ['ptr-state-inspect', 'ptr-live-inspect']) {
      const authority = sourceAuthority(operation);
      const remote = github();
      const permit = await module.issueSealedRealmsProductionWorkflowPermit!({ sourceAuthority: authority,
        githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl: remote.fetchImpl });
      const attest = (phase: string) => module.attestSealedRealmsProductionWorkflowPermit!({ permit,
        sourceAuthority: authority, phase, runId: '1001', runAttempt: '1' });
      if (operation === 'ptr-state-inspect') {
        await expect(attest('ptr-observation')).resolves.toBe(true);
        await expect(attest('continuation-effect')).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID');
      } else await expect(attest('ptr-observation')).rejects.toThrow('SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID');
    }
  });

  it.each(['ptr', 'g002'])('permits %s update observation only for its apply while preserving continuation phases', async lane => {
    const module = await workflowAuthorityModule();
    for (const operation of [
      'ptr-update-apply',
      'ptr-update-inspect',
      'g002-update-apply',
      'g002-update-inspect',
      'ptr-state-inspect',
      'ptr-live-inspect',
      'g002-publish-inspect',
    ]) {
      const authority = sourceAuthority(operation);
      const remote = github();
      const permit = await module.issueSealedRealmsProductionWorkflowPermit!({
        sourceAuthority: authority,
        githubToken: 'github-sealed-realms-owner-token',
        runId: '1001',
        runAttempt: '1',
        fetchImpl: remote.fetchImpl,
      });
      const attest = (phase: string) => module.attestSealedRealmsProductionWorkflowPermit!({
        permit,
        sourceAuthority: authority,
        phase,
        runId: '1001',
        runAttempt: '1',
      });
      if (operation === `${lane}-update-apply`) {
        await expect(attest(`${lane}-update-observation`)).resolves.toBe(true);
        await expect(attest('continuation-effect')).resolves.toBe(true);
        await expect(attest('continuation-terminal')).resolves.toBe(true);
      } else {
        await expect(attest(`${lane}-update-observation`)).rejects.toThrow(
          'SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID',
        );
      }
    }
  });

  it('issues only an opaque permit after exact GitHub attestation and re-attests every phase', async () => {
    const module = await workflowAuthorityModule();
    if (!requireExports(module)) return;
    const authority = sourceAuthority();
    const remote = github();
    const permit = await module.issueSealedRealmsProductionWorkflowPermit!({
      sourceAuthority: authority,
      githubToken: 'github-sealed-realms-owner-token',
      runId: '1001',
      runAttempt: '1',
      fetchImpl: remote.fetchImpl,
    });

    expect(Object.keys(permit)).toEqual([]);
    expect(JSON.stringify(permit)).toBe('{}');
    expect(() => module.assertSealedRealmsProductionWorkflowPermit!({}))
      .toThrow(/SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID/u);
    await expect(module.attestSealedRealmsProductionWorkflowPermit!({
      permit,
      sourceAuthority: authority,
      phase: 'continuation-issue',
      runId: '1001',
      runAttempt: '1',
    })).resolves.toBe(true);

    expect(remote.fetchImpl).toHaveBeenCalledTimes(4);
    expect(remote.calls.map(call => call.url)).toEqual([
      `https://api.github.com/repos/${REPOSITORY}/branches/main`,
      `https://api.github.com/repos/${REPOSITORY}/actions/runs/1001`,
      `https://api.github.com/repos/${REPOSITORY}/branches/main`,
      `https://api.github.com/repos/${REPOSITORY}/actions/runs/1001`,
    ]);
    for (const call of remote.calls) {
      expect(call.init).toMatchObject({
        method: 'GET', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      });
      expect(new Headers(call.init?.headers).get('authorization'))
        .toBe('Bearer github-sealed-realms-owner-token');
    }
  });

  it.each([
    ['unprotected main', (branch: Record<string, unknown>) => { branch.protected = false; }, undefined],
    ['wrong protected SHA', (branch: Record<string, unknown>) => { branch.commit = { sha: A }; }, undefined],
    ['wrong repository', undefined, (run: Record<string, unknown>) => { run.repository = { full_name: 'attacker/repo' }; }],
    ['wrong workflow', undefined, (run: Record<string, unknown>) => { run.path = '.github/workflows/other.yml'; }],
    ['wrong event', undefined, (run: Record<string, unknown>) => { run.event = 'push'; }],
    ['completed run', undefined, (run: Record<string, unknown>) => { run.status = 'completed'; run.conclusion = 'success'; }],
    ['wrong attempt', undefined, (run: Record<string, unknown>) => { run.run_attempt = 2; }],
    ['wrong run SHA', undefined, (run: Record<string, unknown>) => { run.head_sha = A; }],
  ] as const)('rejects %s before returning a permit', async (_label, mutateBranch, mutateRun) => {
    const module = await workflowAuthorityModule();
    if (!requireExports(module)) return;
    const remote = github({ mutateBranch, mutateRun });
    await expect(module.issueSealedRealmsProductionWorkflowPermit!({
      sourceAuthority: sourceAuthority(),
      githubToken: 'github-sealed-realms-owner-token',
      runId: '1001',
      runAttempt: '1',
      fetchImpl: remote.fetchImpl,
    })).rejects.toThrow(/SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED/u);
  });

  it('fails closed on a later re-attestation drift and on forged authority material', async () => {
    const module = await workflowAuthorityModule();
    if (!requireExports(module)) return;
    const authority = sourceAuthority();
    const remote = github({
      mutateRun: (run, request) => {
        if (request > 1) {
          run.status = 'completed';
          run.conclusion = 'success';
        }
      },
    });
    const permit = await module.issueSealedRealmsProductionWorkflowPermit!({
      sourceAuthority: authority,
      githubToken: 'github-sealed-realms-owner-token',
      runId: '1001',
      runAttempt: '1',
      fetchImpl: remote.fetchImpl,
    });
    await expect(module.attestSealedRealmsProductionWorkflowPermit!({
      permit,
      sourceAuthority: authority,
      phase: 'continuation-effect',
      runId: '1001',
      runAttempt: '1',
    })).rejects.toThrow(/SEALED_REALMS_WORKFLOW_AUTHORITY_ATTESTATION_REJECTED/u);

    const untouched = github();
    await expect(module.issueSealedRealmsProductionWorkflowPermit!({
      sourceAuthority: { ...authority },
      githubToken: 'github-sealed-realms-owner-token',
      runId: '1001',
      runAttempt: '1',
      fetchImpl: untouched.fetchImpl,
    })).rejects.toThrow(/SEALED_REALMS_SOURCE_AUTHORITY_OPAQUE_RESULT_REQUIRED/u);
    expect(untouched.fetchImpl).not.toHaveBeenCalled();
    await expect(module.attestSealedRealmsProductionWorkflowPermit!({
      permit: JSON.parse(JSON.stringify(permit)),
      sourceAuthority: authority,
      phase: 'continuation-effect',
      runId: '1001',
      runAttempt: '1',
    })).rejects.toThrow(/SEALED_REALMS_WORKFLOW_AUTHORITY_PERMIT_INVALID/u);
  });
});
