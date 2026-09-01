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
      preparationSourceCommit: sourceCommit,
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

function requireExports(module: WorkflowAuthorityModule) {
  expect(module.issueSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  expect(module.attestSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  expect(module.assertSealedRealmsProductionWorkflowPermit).toBeTypeOf('function');
  return typeof module.issueSealedRealmsProductionWorkflowPermit === 'function'
    && typeof module.attestSealedRealmsProductionWorkflowPermit === 'function'
    && typeof module.assertSealedRealmsProductionWorkflowPermit === 'function';
}

describe('sealed-realms protected workflow authority', () => {
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
