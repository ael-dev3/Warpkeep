// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';

const S = '1'.repeat(40);
const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/sealed-realms-production.yml';
type RuntimeModule = Readonly<Record<string, unknown>>;
type AnyFunction = (...arguments_: any[]) => any;

async function loadWorkflow(): Promise<RuntimeModule> {
  return import('../scripts/sealed-realms-production-workflow-authority.mjs').catch(
    () => Object.freeze({}),
  ) as Promise<RuntimeModule>;
}

async function loadContinuation(): Promise<RuntimeModule> {
  return import('../scripts/sealed-realms-production-continuation.mjs').catch(
    () => Object.freeze({}),
  ) as Promise<RuntimeModule>;
}

function functionExport(
  module: RuntimeModule,
  name: string,
): AnyFunction | undefined {
  const value = module[name];
  return typeof value === 'function' ? (value as AnyFunction) : undefined;
}

function sourceAuthority(operation: string, sourceCommit = S) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: sourceCommit,
    readGit: (arguments_) => {
      if (arguments_.join('\0') === 'rev-parse\0--verify\0HEAD^{commit}') {
        return `${sourceCommit}\n`;
      }
      if (
        arguments_.join('\0') ===
        'rev-parse\0--verify\0refs/remotes/origin/main^{commit}'
      ) {
        return `${sourceCommit}\n`;
      }
      throw new Error(`unexpected git call: ${arguments_.join(' ')}`);
    },
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (commit) => ({ verifiedSha: commit }),
  });
}

function response(url: string, value: unknown) {
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

function github(
  input: Readonly<{
    sourceCommit: string;
    runId: string;
    runAttempt: number;
    driftRunRequest?: number;
    onRunRequest?: (
      requestNumber: number,
      runId: string,
    ) => void | Promise<void>;
    runStatus?: (runId: string) => 'in_progress' | 'completed';
  }>,
) {
  let runRequests = 0;
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return response(url, {
        name: 'main',
        protected: true,
        commit: { sha: input.sourceCommit },
      });
    }
    const runMatch = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url);
    if (runMatch !== null) {
      runRequests += 1;
      const requestedRunId = runMatch[1]!;
      await input.onRunRequest?.(runRequests, requestedRunId);
      const drift =
        input.driftRunRequest !== undefined &&
        runRequests >= input.driftRunRequest;
      const status =
        input.runStatus?.(requestedRunId) ??
        (drift ? 'completed' : 'in_progress');
      return response(url, {
        id: Number(requestedRunId),
        run_attempt: input.runAttempt,
        event: 'workflow_dispatch',
        status,
        conclusion: status === 'completed' ? 'success' : null,
        head_branch: 'main',
        head_sha: input.sourceCommit,
        path: WORKFLOW_PATH,
        repository: { full_name: REPOSITORY },
      });
    }
    throw new Error(`unexpected GitHub request: ${url}`);
  });
}

async function workflowPermit(
  workflow: RuntimeModule,
  operation: string,
  runId: string,
  options: Readonly<{
    sourceCommit?: string;
    driftRunRequest?: number;
    onRunRequest?: (
      requestNumber: number,
      requestedRunId: string,
    ) => void | Promise<void>;
    runStatus?: (requestedRunId: string) => 'in_progress' | 'completed';
  }> = {},
) {
  const sourceCommit = options.sourceCommit ?? S;
  const source = sourceAuthority(operation, sourceCommit);
  const fetchImpl = github({
    sourceCommit,
    runId,
    runAttempt: 1,
    driftRunRequest: options.driftRunRequest,
    onRunRequest: options.onRunRequest,
    runStatus: options.runStatus,
  });
  const permit = await functionExport(
    workflow,
    'issueSealedRealmsProductionWorkflowPermit',
  )!({
    sourceAuthority: source,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl,
  });
  return { source, permit, fetchImpl };
}

function privateFixture() {
  const home = mkdtempSync(
    join(tmpdir(), 'warpkeep-sealed-realms-continuation-'),
  );
  for (const root of [
    join(
      home,
      'Library',
      'Application Support',
      'Warpkeep',
      'operations',
      'audit',
      'private',
    ),
    join(
      home,
      'Library',
      'Application Support',
      'Warpkeep',
      'operations',
      'runtime',
    ),
    join(
      home,
      'Library',
      'Application Support',
      'Warpkeep',
      'operations',
      'cache',
    ),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const state = (testOnlyRace?: (phase: string, path: string) => void) =>
    createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
      ...(testOnlyRace === undefined ? {} : { testOnlyRace }),
    });
  return {
    home,
    state,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

const BINDING = Object.freeze({
  subject: 'release-0.4.0',
  evidenceDigest: 'a'.repeat(64),
  receiptDigests: Object.freeze(['b'.repeat(64), 'c'.repeat(64)]),
  predecessorDigests: Object.freeze(['d'.repeat(64)]),
});

function store(
  continuation: RuntimeModule,
  privateState: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  clock: () => Date,
  nonce = { value: 1 },
) {
  return functionExport(
    continuation,
    'createSealedRealmsProductionContinuationStore',
  )!({
    privateState,
    clock,
    randomBytes: (length: number) => Buffer.alloc(length, nonce.value++),
  });
}

function issueInput(
  continuationStore: object,
  run: Awaited<ReturnType<typeof workflowPermit>>,
  kind: string,
  runId: string,
) {
  return {
    store: continuationStore,
    permit: run.permit,
    sourceAuthority: run.source,
    kind,
    runId,
    runAttempt: '1',
    ...BINDING,
  };
}

const readerName = 'readSealedRealmsProductionContinuationCompletion';
it('rejects a caller-forged store with the fixed capability error', async () => {
  const m = await loadContinuation();
  expect(m[readerName]).toBeTypeOf('function');
  expect(() =>
    functionExport(m, readerName)!({
      store: {},
      privateState: {},
      sourceAuthority: {},
      kind: 'ptr-update',
      ...BINDING,
    }),
  ).toThrow('SEALED_REALMS_CONTINUATION_STORE_INVALID');
});
describe('native authenticated continuation completion reader', () => {
  it.each([
    'completed',
    'reconciled-effect-applied',
    'reconciled-no-effect',
    'unresolved',
    'retry-completed',
    'retry-mismatched-history',
  ])('reads or refuses genuine %s records', async (outcome) => {
    const workflow = await loadWorkflow(),
      continuation = await loadContinuation(),
      f = privateFixture();
    try {
      const privateState = f.state();
      const st = store(
        continuation,
        privateState,
        () => new Date('2026-09-08T10:00:00.000Z'),
      );
      const issued = await workflowPermit(
        workflow,
        'ptr-update-inspect',
        '1001',
      );
      await functionExport(
        continuation,
        'issueSealedRealmsProductionContinuation',
      )!(issueInput(st, issued, 'ptr-update', '1001'));
      const applied = await workflowPermit(
        workflow,
        'ptr-update-apply',
        '1002',
      );
      const read = () =>
        functionExport(continuation, readerName)!({
          store: st,
          privateState,
          sourceAuthority: applied.source,
          kind: 'ptr-update',
          ...BINDING,
        });
      expect(read).toThrow();
      const effect = () => {
        if (outcome !== 'completed') throw Error('interrupted effect');
      };
      const claim = functionExport(
        continuation,
        'claimSealedRealmsProductionContinuation',
      )!({ ...issueInput(st, applied, 'ptr-update', '1002'), effect });
      if (outcome === 'completed') await claim;
      else await expect(claim).rejects.toThrow();
      if (outcome.startsWith('reconciled') || outcome.startsWith('retry-')) {
        const reconciled = await workflowPermit(
          workflow,
          'ptr-update-apply',
          '1003',
          {
            runStatus: (id) => (id === '1002' ? 'completed' : 'in_progress'),
          },
        );
        await functionExport(
          continuation,
          'reconcileSealedRealmsProductionContinuation',
        )!({
          ...issueInput(st, reconciled, 'ptr-update', '1003'),
          readOnlyReconcile: (context: any) =>
            outcome === 'reconciled-effect-applied'
              ? {
                  outcome: 'effect-applied',
                  observationDigest: 'e'.repeat(64),
                }
              : functionExport(
                  continuation,
                  'classifySealedRealmsProductionContinuationNoEffect',
                )!({
                  reconciliation: context,
                  evidenceDigest: BINDING.evidenceDigest,
                  observationDigest: 'e'.repeat(64),
                }),
        });
      }
      if (outcome === 'unresolved' || outcome === 'reconciled-no-effect') {
        expect(read).toThrow();
        return;
      }
      if (outcome.startsWith('retry-')) {
        const subject =
          outcome === 'retry-completed' ? BINDING.subject : 'changed-subject';
        const nextIssue = await workflowPermit(
          workflow,
          'ptr-update-inspect',
          '1004',
        );
        await functionExport(
          continuation,
          'issueSealedRealmsProductionContinuation',
        )!({
          ...issueInput(st, nextIssue, 'ptr-update', '1004'),
          subject,
        });
        const nextApply = await workflowPermit(
          workflow,
          'ptr-update-apply',
          '1005',
        );
        await functionExport(
          continuation,
          'claimSealedRealmsProductionContinuation',
        )!({
          ...issueInput(st, nextApply, 'ptr-update', '1005'),
          subject,
          effect: () => {},
        });
        const retryRead = () =>
          functionExport(continuation, readerName)!({
            store: st,
            privateState,
            sourceAuthority: nextApply.source,
            kind: 'ptr-update',
            ...BINDING,
            subject,
          });
        if (outcome === 'retry-mismatched-history') expect(retryRead).toThrow();
        else
          expect(retryRead()).toMatchObject({
            outcome: 'completed',
            claimRunId: '1005',
            terminalRunId: '1005',
            observationDigest: null,
          });
        return;
      }
      const result = read();
      expect(result.outcome).toBe(outcome);
      expect(result.claimRunId).toBe('1002');
      expect(result.terminalRunId).toBe(
        outcome === 'completed' ? '1002' : '1003',
      );
      expect(result.observationDigest).toBe(
        outcome === 'completed' ? null : 'e'.repeat(64),
      );
      expect(Object.isFrozen(result)).toBe(true);
      for (const field of [
        'scopeDigest',
        'issuedRecordDigest',
        'claimRecordDigest',
        'terminalRecordDigest',
      ])
        expect(result[field]).toMatch(/^[a-f0-9]{64}$/);
      expect(result.claimRecordDigest).not.toBe(result.issuedRecordDigest);
      expect(result.terminalRecordDigest).not.toBe(result.issuedRecordDigest);
      expect(() =>
        functionExport(continuation, readerName)!({
          store: st,
          privateState: f.state(),
          sourceAuthority: applied.source,
          kind: 'ptr-update',
          ...BINDING,
        }),
      ).toThrow();
      expect(() =>
        functionExport(continuation, readerName)!({
          store: st,
          privateState,
          sourceAuthority: applied.source,
          kind: 'ptr-update',
          ...BINDING,
          subject: 'other',
        }),
      ).toThrow();
    } finally {
      f.cleanup();
    }
  });
});
