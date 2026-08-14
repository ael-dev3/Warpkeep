// @vitest-environment node

import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  NotificationPagesPrivateDeployOperatorError,
  classifyNotificationPagesPrivateDeployment,
  executeNotificationPagesPrivateDeployPhase,
  notificationPagesPrivateDeployOperatorTestSeams,
} from '../scripts/notification-pages-private-deploy-operator.mjs';
import {
  withNotificationPagesPrivateDeployJournal,
} from '../scripts/notification-pages-private-deploy-journal.mjs';

const CANDIDATE = 'a'.repeat(40);
const ROOT_DIGEST = 'b'.repeat(64);
const ROOT_SOURCE = 'c'.repeat(40);
const PREPARED_DIGEST = 'd'.repeat(64);
const BRIDGE_SOURCE = 'e'.repeat(40);
const ACTIVE_DIGEST = 'f'.repeat(64);
const MODULE_DIGEST = '1'.repeat(64);
const AUTHORITY_DIGEST = '2'.repeat(64);
const RECEIPT_DIGEST = '3'.repeat(64);
const CANARY_RECEIPT_DIGEST = '8'.repeat(64);
const CANARY_SOURCE = '9'.repeat(40);
const CANARY_AUTHORITY_DIGEST = 'a'.repeat(64);

function home(): string {
  const path = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-pages-operator-home-',
  ));
  chmodSync(path, 0o700);
  return path;
}

function bindings(mode: 'closed-review' | 'gen0' | 'durable') {
  return {
    phase: {
      pagesPresentationEnabled: mode !== 'closed-review',
      hermesExecutionApproved: mode === 'durable',
    },
    preparedBinding: {
      notificationPreparedReceiptDigest:
        mode === 'gen0' ? PREPARED_DIGEST : null,
      notificationPreparedBridgeSourceCommit:
        mode === 'gen0' ? BRIDGE_SOURCE : null,
    },
    privateBinding: {
      notificationPagesActiveV17EvidenceDigest:
        mode === 'gen0' ? ACTIVE_DIGEST : null,
      notificationPagesDeployedModuleReceiptDigest:
        mode === 'gen0' ? MODULE_DIGEST : null,
      notificationPagesExpectedFounderCount: mode === 'gen0' ? 84 : null,
    },
    liveRootBinding: {
      notificationPagesLiveRootReceiptDigest:
        mode === 'durable' ? ROOT_DIGEST : null,
      notificationPagesLiveRootPagesSourceCommit:
        mode === 'durable' ? ROOT_SOURCE : null,
    },
    productionPlayerCanaryBinding: {
      productionPlayerCanaryReceiptDigest: null,
      productionPlayerCanarySourceCommit: null,
    },
  };
}

function contract(mode: 'gen0' | 'durable', playerCanary = false) {
  const sourceBindings = bindings(mode);
  return classifyNotificationPagesPrivateDeployment({
    candidatePagesSourceCommit: CANDIDATE,
    ...sourceBindings,
    productionPlayerCanaryBinding: playerCanary
      ? {
        productionPlayerCanaryReceiptDigest: CANARY_RECEIPT_DIGEST,
        productionPlayerCanarySourceCommit: CANARY_SOURCE,
      }
      : sourceBindings.productionPlayerCanaryBinding,
  });
}

function handoffSummary(runId: string, runAttempt: number) {
  return Object.freeze({
    expectedHandoffDigest: '4'.repeat(64),
    expectedKeyId: '5'.repeat(64),
    expectedWorkflowRunId: runId,
    expectedWorkflowRunAttempt: String(runAttempt),
    expectedPagesSourceCommit: CANDIDATE,
    expectedFounderCount: 84,
    expectedActiveEvidenceMaximumAgeMilliseconds: 86_400_000,
    expectedPreparedReceiptDigest: PREPARED_DIGEST,
    expectedActiveV17EvidenceDigest: ACTIVE_DIGEST,
    expectedDeployedModuleReceiptDigest: MODULE_DIGEST,
    expectedBridgeSourceCommit: BRIDGE_SOURCE,
  });
}

function dependencies(options: {
  reconciliations: Array<'exact-current' | 'definitely-not-current' | Error>;
  candidateAlreadyLive?: boolean;
}) {
  const reconcile = vi.fn(async () => {
    const next = options.reconciliations.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('TEST_RECONCILIATION_EXHAUSTED');
    return next === 'exact-current'
      ? {
        status: next,
        candidatePagesSourceCommit: CANDIDATE,
        notificationPresentationDigest: '6'.repeat(64),
        notificationPresentationAssetCount: 3,
      }
      : {
        status: next,
        candidatePagesSourceCommit: CANDIDATE,
        observedPagesSourceCommit: '7'.repeat(40),
      };
  });
  const inspectCandidate = vi.fn(async () => options.candidateAlreadyLive
    ? {
      candidateAlreadyLive: true,
      receiptDigest: RECEIPT_DIGEST,
    }
    : {
      candidateAlreadyLive: false,
      candidateAuthorityDigest: AUTHORITY_DIGEST,
    });
  const canaryAuthority = Object.freeze({
    candidatePagesSourceCommit: CANDIDATE,
    productionPlayerCanaryReceiptDigest: CANARY_RECEIPT_DIGEST,
    productionPlayerCanarySourceCommit: CANARY_SOURCE,
  });
  return {
    assertSource: vi.fn(),
    delay: vi.fn(async () => undefined),
    now: () => new Date('2026-08-13T12:00:00.000Z'),
    prepareHandoff: vi.fn((_contract, runId: string, runAttempt: number) =>
      handoffSummary(runId, runAttempt)),
    resolveHandoff: vi.fn(summary => ({
      ...summary,
      handoffPath: '/fixed/private/handoff.json',
      keyPath: '/fixed/private/key.txt',
    })),
    inspectHandoff: vi.fn(async () => ({ pagesSourceCommit: CANDIDATE })),
    assertDeploymentAuthority: vi.fn(async () => ({ attested: true })),
    reconcile,
    recoverSkippedInvocation: vi.fn(async () => ({ recovered: true })),
    withJournal: withNotificationPagesPrivateDeployJournal,
    writeGen0: vi.fn(async () => ({
      receiptDigest: RECEIPT_DIGEST,
      result: 'installed',
    })),
    inspectCandidate,
    inspectPlayerCanary: vi.fn(async () => ({
      authority: canaryAuthority,
      authorityDigest: CANARY_AUTHORITY_DIGEST,
    })),
    requireFreshPlayerCanary: vi.fn(() => canaryAuthority),
    promote: vi.fn(async () => ({
      receiptDigest: RECEIPT_DIGEST,
      result: 'installed',
    })),
  };
}

function execute(input: {
  mode: 'gen0' | 'durable';
  command:
    | 'recover-skipped-invocation'
    | 'attest-deployment-source'
    | 'predeploy'
    | 'mark-deploy-invoked'
    | 'postflight';
  runId?: string;
  runAttempt?: number;
  home: string;
  dependencies: ReturnType<typeof dependencies>;
  playerCanary?: boolean;
}) {
  return executeNotificationPagesPrivateDeployPhase({
    command: input.command,
    contract: contract(input.mode, input.playerCanary),
    runId: input.runId ?? '41',
    runAttempt: input.runAttempt ?? 1,
    sourceRunId: '51',
    sourceRunAttempt: 2,
    reportedHome: input.home,
  }, input.dependencies);
}

function githubResponse(url: string, body: Record<string, unknown>) {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function githubAdjudicationFetch(overrides: {
  run?: Record<string, unknown>;
  job?: Record<string, unknown>;
} = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const run = {
      id: 41,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'cancelled',
      event: 'workflow_run',
      path: '.github/workflows/deploy-pages.yml',
      head_branch: 'main',
      head_sha: CANDIDATE,
      repository: { full_name: 'ael-dev3/Warpkeep' },
      head_repository: { full_name: 'ael-dev3/Warpkeep' },
      ...overrides.run,
    };
    const job = {
      id: 987654321,
      run_id: 41,
      head_sha: CANDIDATE,
      name: 'Notification Pages private deploy v1',
      workflow_name: 'Deploy GitHub Pages',
      labels: [
        'self-hosted',
        'macOS',
        'ARM64',
        'warpkeep-production-admin',
        'warpkeep-repository-exclusive',
      ],
      status: 'completed',
      conclusion: 'cancelled',
      steps: [
        {
          name: 'Recheck protected source and durably mark deployment invocation',
          number: 7,
          status: 'completed',
          conclusion: 'success',
        },
        {
          name: 'Deploy private-authorized release to GitHub Pages',
          number: 8,
          status: 'completed',
          conclusion: 'skipped',
        },
      ],
      ...overrides.job,
    };
    return githubResponse(url, url.includes('/jobs?')
      ? { total_count: 1, jobs: [job] }
      : run);
  }) as unknown as typeof fetch;
}

function githubAuthorityFetch(overrides: {
  branch?: Record<string, unknown>;
  currentRun?: Record<string, unknown>;
  sourceRun?: Record<string, unknown>;
} = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main',
        protected: true,
        commit: { sha: CANDIDATE },
        ...overrides.branch,
      });
    }
    const source = url.includes('/actions/runs/51/');
    return githubResponse(url, {
      id: source ? 51 : 41,
      run_attempt: source ? 2 : 1,
      status: source ? 'completed' : 'in_progress',
      conclusion: source ? 'success' : null,
      event: source ? 'push' : 'workflow_run',
      path: source
        ? '.github/workflows/verify.yml'
        : '.github/workflows/deploy-pages.yml',
      head_branch: 'main',
      head_sha: CANDIDATE,
      repository: { full_name: 'ael-dev3/Warpkeep' },
      head_repository: { full_name: 'ael-dev3/Warpkeep' },
      ...(source ? overrides.sourceRun : overrides.currentRun),
    });
  }) as unknown as typeof fetch;
}

async function adjudicateWithToken(fetchImpl: typeof fetch) {
  const directory = home();
  const tokenPath = join(directory, 'github-token');
  writeFileSync(tokenPath, `${'g'.repeat(40)}\n`, { mode: 0o600 });
  const tokenDescriptor = openSync(tokenPath, 'r');
  try {
    return await notificationPagesPrivateDeployOperatorTestSeams
      .adjudicateSkippedGitHubDeployment({
        candidatePagesSourceCommit: CANDIDATE,
        runAttempt: 1,
        runId: '41',
      }, { fetchImpl, tokenDescriptor });
  } finally {
    closeSync(tokenDescriptor);
  }
}

async function attestWithToken(fetchImpl: typeof fetch) {
  const directory = home();
  const tokenPath = join(directory, 'github-token');
  writeFileSync(tokenPath, `${'g'.repeat(40)}\n`, { mode: 0o600 });
  const tokenDescriptor = openSync(tokenPath, 'r');
  try {
    return await notificationPagesPrivateDeployOperatorTestSeams
      .attestCurrentGitHubDeploymentAuthority({
        candidatePagesSourceCommit: CANDIDATE,
        runAttempt: 1,
        runId: '41',
        sourceRunAttempt: 2,
        sourceRunId: '51',
      }, { fetchImpl, tokenDescriptor });
  } finally {
    closeSync(tokenDescriptor);
  }
}

describe('notification Pages private deployment operator', () => {
  it('rejects historical 84-table active receipts and requires both schema digests', () => {
    const target = Object.freeze({
      uri: 'https://maincloud.spacetimedb.com',
      database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      deleteData: 'never',
    });
    const record = Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-publish-v1',
      lane: 'forward-activation-active-v17',
      outcome: 'verified',
      target,
      atlasSourceCommit: '1'.repeat(40),
      atlasId: 'GREATER_REALM_V1',
      publicReleaseId: 'GRR-TEST',
      expectedReleaseSha256: '2'.repeat(64),
      moduleSourceCommit: '3'.repeat(40),
      moduleDeltaPolicy: 'reviewed-same-schema',
      v17TableSchemaDigest: '4'.repeat(64),
      currentCandidateTableSchemaDigest: '5'.repeat(64),
      predecessorTableCount: 86,
      postTableCount: 86,
      schemaMutation: 'none',
      importMutationsCompiled: false,
      activationMutationsCompiled: true,
      releaseState: 'active',
      activationMode: 'active',
    });
    const receiptBytes = (nextRecord: Readonly<Record<string, unknown>>) => Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        kind: 'warpkeep-greater-realm-production-publish-v1',
        target,
        record: nextRecord,
      }, null, 2)}\n`,
      'utf8',
    );
    expect(notificationPagesPrivateDeployOperatorTestSeams
      .validateDeployedModuleReceipt(receiptBytes(record))).toMatchObject({
        atlasId: 'GREATER_REALM_V1',
      });
    expect(() => notificationPagesPrivateDeployOperatorTestSeams
      .validateDeployedModuleReceipt(receiptBytes({
        ...record,
        predecessorTableCount: 84,
        postTableCount: 84,
      }))).toThrow(/MODULE_RECEIPT_INVALID/);
    const missingCandidateDigest = { ...record } as Record<string, unknown>;
    delete missingCandidateDigest.currentCandidateTableSchemaDigest;
    expect(() => notificationPagesPrivateDeployOperatorTestSeams
      .validateDeployedModuleReceipt(receiptBytes(missingCandidateDigest)))
      .toThrow(/MODULE_RECEIPT_INVALID/);
  });

  it('classifies only exact closed, generation-zero, and durable source states', () => {
    for (const mode of ['closed-review', 'gen0', 'durable'] as const) {
      expect(classifyNotificationPagesPrivateDeployment({
        candidatePagesSourceCommit: CANDIDATE,
        ...bindings(mode),
      }).mode).toBe(mode);
    }
    const gen0 = bindings('gen0');
    for (const mutation of [
      { phase: { ...gen0.phase, hermesExecutionApproved: true } },
      {
        preparedBinding: {
          ...gen0.preparedBinding,
          notificationPreparedReceiptDigest: null,
        },
      },
      {
        privateBinding: {
          ...gen0.privateBinding,
          notificationPagesExpectedFounderCount: null,
        },
      },
      {
        liveRootBinding: {
          notificationPagesLiveRootReceiptDigest: ROOT_DIGEST,
          notificationPagesLiveRootPagesSourceCommit: ROOT_SOURCE,
        },
      },
    ]) {
      expect(() => classifyNotificationPagesPrivateDeployment({
        candidatePagesSourceCommit: CANDIDATE,
        ...gen0,
        ...mutation,
      })).toThrow('NOTIFICATION_PAGES_DEPLOY');
    }
  });

  it('creates and reattests a run-bound gen0 handoff before one deployment', async () => {
    const reportedHome = home();
    const mocked = dependencies({
      reconciliations: ['definitely-not-current', 'exact-current'],
    });
    await expect(execute({
      mode: 'gen0', command: 'predeploy', home: reportedHome, dependencies: mocked,
    })).resolves.toEqual({ deployRequired: true, completed: false });
    await expect(execute({
      mode: 'gen0', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: mocked,
    })).resolves.toEqual({ deploymentAttempted: true });
    expect(mocked.inspectHandoff).toHaveBeenCalledTimes(1);
    expect(mocked.assertDeploymentAuthority).toHaveBeenCalledTimes(1);
    expect(mocked.assertSource).toHaveBeenCalledTimes(3);
    await expect(execute({
      mode: 'gen0', command: 'postflight', home: reportedHome, dependencies: mocked,
    })).resolves.toEqual({ completed: true });
    expect(mocked.writeGen0).toHaveBeenCalledTimes(1);
  });

  it('durably retains and reattests successor authority before promotion', async () => {
    const reportedHome = home();
    const mocked = dependencies({
      reconciliations: ['definitely-not-current', 'exact-current'],
    });
    await execute({
      mode: 'durable', command: 'predeploy', home: reportedHome,
      dependencies: mocked,
    });
    await execute({
      mode: 'durable', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: mocked,
    });
    expect(mocked.inspectCandidate).toHaveBeenCalledTimes(2);
    expect(mocked.assertDeploymentAuthority).toHaveBeenCalledTimes(1);
    await execute({
      mode: 'durable', command: 'postflight', home: reportedHome,
      dependencies: mocked,
    });
    expect(mocked.promote).toHaveBeenCalledWith(
      expect.objectContaining({ candidatePagesSourceCommit: CANDIDATE }),
      AUTHORITY_DIGEST,
    );
  });

  it('authenticates C7 privately before reconciliation and freshly again before the marker', async () => {
    const reportedHome = home();
    const mocked = dependencies({
      reconciliations: ['definitely-not-current'],
    });
    await execute({
      mode: 'durable', command: 'predeploy', home: reportedHome,
      dependencies: mocked, playerCanary: true,
    });
    expect(mocked.inspectPlayerCanary).toHaveBeenCalledTimes(1);
    expect(mocked.requireFreshPlayerCanary).toHaveBeenCalledTimes(1);
    expect(mocked.inspectPlayerCanary.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.reconcile.mock.invocationCallOrder[0]);
    expect(mocked.reconcile.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.inspectCandidate.mock.invocationCallOrder[0]);
    expect(mocked.inspectCandidate).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiresProductionPlayerCanary: true }),
      expect.objectContaining({ authorityDigest: CANARY_AUTHORITY_DIGEST }),
    );

    await execute({
      mode: 'durable', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: mocked, playerCanary: true,
    });
    expect(mocked.inspectPlayerCanary).toHaveBeenCalledTimes(2);
    expect(mocked.requireFreshPlayerCanary).toHaveBeenCalledTimes(3);
    const secondCanaryInspection =
      mocked.inspectPlayerCanary.mock.invocationCallOrder[1];
    const secondCandidateInspection =
      mocked.inspectCandidate.mock.invocationCallOrder[1];
    const deploymentAuthority =
      mocked.assertDeploymentAuthority.mock.invocationCallOrder[0];
    const finalFreshness =
      mocked.requireFreshPlayerCanary.mock.invocationCallOrder[2];
    expect(secondCanaryInspection).toBeLessThan(secondCandidateInspection);
    expect(secondCandidateInspection).toBeLessThan(deploymentAuthority);
    expect(deploymentAuthority).toBeLessThan(finalFreshness);
  });

  it('retains the fresh C7 authority when reconciliation finds an already-live candidate', async () => {
    const mocked = dependencies({
      reconciliations: ['exact-current'],
      candidateAlreadyLive: true,
    });
    await expect(execute({
      mode: 'durable', command: 'predeploy', home: home(),
      dependencies: mocked, playerCanary: true,
    })).resolves.toEqual({ deployRequired: false, completed: true });
    expect(mocked.inspectPlayerCanary).toHaveBeenCalledTimes(1);
    expect(mocked.inspectCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ requiresProductionPlayerCanary: true }),
      expect.objectContaining({ authorityDigest: CANARY_AUTHORITY_DIGEST }),
    );
  });

  it('never opens private canary state for durable null-binding predecessors', async () => {
    const mocked = dependencies({
      reconciliations: ['definitely-not-current'],
    });
    await execute({
      mode: 'durable', command: 'predeploy', home: home(),
      dependencies: mocked,
    });
    expect(mocked.inspectPlayerCanary).not.toHaveBeenCalled();
    expect(mocked.requireFreshPlayerCanary).not.toHaveBeenCalled();
  });

  it('never marks a second deployment after a crash and an old CDN response', async () => {
    const reportedHome = home();
    const first = dependencies({ reconciliations: ['definitely-not-current'] });
    await execute({
      mode: 'durable', command: 'predeploy', home: reportedHome,
      dependencies: first,
    });
    await execute({
      mode: 'durable', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: first,
    });

    const recovery = dependencies({
      reconciliations: Array(4).fill('definitely-not-current'),
    });
    await expect(execute({
      mode: 'durable', command: 'predeploy', runId: '42', home: reportedHome,
      dependencies: recovery,
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_PREVIOUS_INVOCATION_UNCERTAIN',
      deploymentMayHaveChanged: true,
    });
    expect(recovery.reconcile).toHaveBeenCalledTimes(4);
    await expect(execute({
      mode: 'durable', command: 'mark-deploy-invoked', runId: '42',
      home: reportedHome, dependencies: recovery,
    })).rejects.toMatchObject({ deploymentMayHaveChanged: true });
  });

  it('runs skipped-action recovery before opening the current operation', async () => {
    const reportedHome = home();
    const mocked = dependencies({ reconciliations: [] });
    await expect(execute({
      mode: 'durable',
      command: 'recover-skipped-invocation',
      home: reportedHome,
      dependencies: mocked,
    })).resolves.toEqual({ recovered: true });
    expect(mocked.recoverSkippedInvocation).toHaveBeenCalledWith({
      repositoryRoot: expect.any(String),
      reportedHome,
    });
    expect(mocked.reconcile).not.toHaveBeenCalled();
  });

  it('performs the first source/run attestation without opening the journal', async () => {
    const mocked = dependencies({ reconciliations: [] });
    await expect(execute({
      mode: 'durable',
      command: 'attest-deployment-source',
      home: home(),
      dependencies: mocked,
    })).resolves.toEqual({ deploymentSourceAttested: true });
    expect(mocked.assertDeploymentAuthority).toHaveBeenCalledWith({
      candidatePagesSourceCommit: CANDIDATE,
      runAttempt: 1,
      runId: '41',
      sourceRunAttempt: 2,
      sourceRunId: '51',
    });
    expect(mocked.reconcile).not.toHaveBeenCalled();
  });

  it('derives abandonment proof only from the exact completed skipped action', async () => {
    await expect(adjudicateWithToken(githubAdjudicationFetch()))
      .resolves.toMatchObject({
        candidatePagesSourceCommit: CANDIDATE,
        deployStepConclusion: 'skipped',
        markerStepConclusion: 'success',
        runAttempt: 1,
        runId: '41',
      });
  });

  it.each(['failure', 'cancelled']) (
    'accepts a fsynced marker whose shell ended %s only when deploy was skipped',
    async markerConclusion => {
      const fetchImpl = githubAdjudicationFetch({
        job: {
          steps: [
            {
              name: 'Recheck protected source and durably mark deployment invocation',
              number: 7,
              status: 'completed',
              conclusion: markerConclusion,
            },
            {
              name: 'Deploy private-authorized release to GitHub Pages',
              number: 8,
              status: 'completed',
              conclusion: 'skipped',
            },
          ],
        },
      });
      await expect(adjudicateWithToken(fetchImpl)).resolves.toMatchObject({
        deployStepConclusion: 'skipped',
        markerStepConclusion: markerConclusion,
      });
    },
  );

  it('attests protected main and both exact attempt-specific workflow runs', async () => {
    await expect(attestWithToken(githubAuthorityFetch())).resolves.toEqual({
      candidatePagesSourceCommit: CANDIDATE,
      runAttempt: 1,
      runId: '41',
      sourceRunAttempt: 2,
      sourceRunId: '51',
    });
  });

  it.each([
    { name: 'unprotected main', branch: { protected: false } },
    { name: 'stale main', branch: { commit: { sha: '9'.repeat(40) } } },
    { name: 'wrong deploy attempt', currentRun: { run_attempt: 2 } },
    { name: 'deploy run already completed', currentRun: { status: 'completed' } },
    { name: 'Verify run not successful', sourceRun: { conclusion: 'failure' } },
    { name: 'ref-suffixed live API path', currentRun: {
      path: '.github/workflows/deploy-pages.yml@main',
    } },
  ])('rejects forged deployment authority: $name', async mutation => {
    await expect(attestWithToken(githubAuthorityFetch(mutation)))
      .rejects.toMatchObject({
        code: 'NOTIFICATION_PAGES_DEPLOY_GITHUB_AUTHORITY_INVALID',
        deploymentMayHaveChanged: false,
      });
  });

  it.each([
    {
      name: 'action may have started',
      job: {
        steps: [
          {
            name: 'Recheck protected source and durably mark deployment invocation',
            number: 7,
            status: 'completed',
            conclusion: 'success',
          },
          {
            name: 'Deploy private-authorized release to GitHub Pages',
            number: 8,
            status: 'completed',
            conclusion: 'cancelled',
          },
        ],
      },
    },
    {
      name: 'failed marker followed by a non-skipped deploy',
      job: {
        steps: [
          {
            name: 'Recheck protected source and durably mark deployment invocation',
            number: 7,
            status: 'completed',
            conclusion: 'failure',
          },
          {
            name: 'Deploy private-authorized release to GitHub Pages',
            number: 8,
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
    },
    {
      name: 'failed marker with a missing deploy step',
      job: {
        steps: [
          {
            name: 'Recheck protected source and durably mark deployment invocation',
            number: 7,
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
    },
    {
      name: 'wrong workflow',
      run: { path: '.github/workflows/decoy.yml' },
    },
    {
      name: 'ref-suffixed workflow path not returned by the live API',
      run: { path: '.github/workflows/deploy-pages.yml@main' },
    },
    {
      name: 'wrong source',
      run: { head_sha: '9'.repeat(40) },
    },
  ])('rejects ambiguous GitHub adjudication: $name', async mutation => {
    await expect(adjudicateWithToken(githubAdjudicationFetch(mutation)))
      .rejects.toMatchObject({
        code: 'NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS',
        deploymentMayHaveChanged: true,
      });
  });

  it('recovers exact-current after a failed postflight without another deploy', async () => {
    const reportedHome = home();
    const first = dependencies({
      reconciliations: [
        'definitely-not-current',
        'definitely-not-current',
        'definitely-not-current',
        'definitely-not-current',
        'definitely-not-current',
      ],
    });
    await execute({
      mode: 'durable', command: 'predeploy', home: reportedHome,
      dependencies: first,
    });
    await execute({
      mode: 'durable', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: first,
    });
    await expect(execute({
      mode: 'durable', command: 'postflight', home: reportedHome,
      dependencies: first,
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_POSTFLIGHT_UNCERTAIN',
      deploymentMayHaveChanged: true,
    });

    const recovery = dependencies({ reconciliations: ['exact-current'] });
    await expect(execute({
      mode: 'durable', command: 'predeploy', runId: '43', home: reportedHome,
      dependencies: recovery,
    })).resolves.toEqual({ deployRequired: false, completed: true });
    expect(recovery.promote).toHaveBeenCalledTimes(1);
  });

  it('replays installed gen0 from the original summary after handoff loss', async () => {
    const reportedHome = home();
    let rootInstalled = false;
    const first = dependencies({
      reconciliations: ['definitely-not-current', 'exact-current'],
    });
    first.writeGen0.mockImplementationOnce(async () => {
      rootInstalled = true;
      throw new Error('SIMULATED_CRASH_AFTER_ROOT_INSTALL');
    });
    await execute({
      mode: 'gen0', command: 'predeploy', home: reportedHome, dependencies: first,
    });
    await execute({
      mode: 'gen0', command: 'mark-deploy-invoked', home: reportedHome,
      dependencies: first,
    });
    await expect(execute({
      mode: 'gen0', command: 'postflight', home: reportedHome, dependencies: first,
    })).rejects.toThrow('SIMULATED_CRASH_AFTER_ROOT_INSTALL');
    expect(rootInstalled).toBe(true);

    const recovery = dependencies({ reconciliations: ['exact-current'] });
    recovery.prepareHandoff.mockImplementation(() => {
      throw new Error('MUST_NOT_MINT_REPLACEMENT_HANDOFF');
    });
    recovery.resolveHandoff.mockImplementation(summary => ({
      ...summary,
      handoffPath: '/deleted/or/expired/handoff.json',
      keyPath: '/deleted/or/expired/key.txt',
    }));
    recovery.writeGen0.mockResolvedValueOnce({
      receiptDigest: RECEIPT_DIGEST,
      result: 'unchanged',
    });
    await expect(execute({
      mode: 'gen0', command: 'predeploy', runId: '44', runAttempt: 2,
      home: reportedHome, dependencies: recovery,
    })).resolves.toEqual({ deployRequired: false, completed: true });
    expect(recovery.prepareHandoff).not.toHaveBeenCalled();
    expect(recovery.writeGen0).toHaveBeenCalledWith(expect.objectContaining({
      expectedWorkflowRunId: '41',
      expectedWorkflowRunAttempt: '1',
    }));
  });

  it('propagates ambiguous public reconciliation without creating authority', async () => {
    const reportedHome = home();
    const ambiguous = Object.assign(new Error('ambiguous'), {
      code: 'NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS',
    });
    const mocked = dependencies({ reconciliations: [ambiguous] });
    await expect(execute({
      mode: 'durable', command: 'predeploy', home: reportedHome,
      dependencies: mocked,
    })).rejects.toBe(ambiguous);
    expect(mocked.inspectCandidate).not.toHaveBeenCalled();
  });

  it('uses typed operator errors for invalid workflow inputs', async () => {
    await expect(executeNotificationPagesPrivateDeployPhase({
      command: 'predeploy',
      contract: contract('durable'),
      runId: '0',
      runAttempt: 1,
    })).rejects.toBeInstanceOf(NotificationPagesPrivateDeployOperatorError);
  });

  it('repairs a restrictive-umask handoff temp left before fchmod', () => {
    const directory = home();
    const temporary = join(
      directory,
      `.notification-pages-private-handoff-${'8'.repeat(64)}-${'9'.repeat(24)}.json.tmp`,
    );
    writeFileSync(temporary, '{}\n', { mode: 0o400 });
    chmodSync(temporary, 0o400);
    notificationPagesPrivateDeployOperatorTestSeams
      .repairHandoffTemporaries(directory);
    expect(existsSync(temporary)).toBe(false);
  });
});
