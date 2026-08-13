// @vitest-environment node

import {
  chmodSync,
  existsSync,
  mkdtempSync,
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
  };
}

function contract(mode: 'gen0' | 'durable') {
  return classifyNotificationPagesPrivateDeployment({
    candidatePagesSourceCommit: CANDIDATE,
    ...bindings(mode),
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
    reconcile,
    withJournal: withNotificationPagesPrivateDeployJournal,
    writeGen0: vi.fn(async () => ({
      receiptDigest: RECEIPT_DIGEST,
      result: 'installed',
    })),
    inspectCandidate,
    promote: vi.fn(async () => ({
      receiptDigest: RECEIPT_DIGEST,
      result: 'installed',
    })),
  };
}

function execute(input: {
  mode: 'gen0' | 'durable';
  command: 'predeploy' | 'mark-deploy-invoked' | 'postflight';
  runId?: string;
  runAttempt?: number;
  home: string;
  dependencies: ReturnType<typeof dependencies>;
}) {
  return executeNotificationPagesPrivateDeployPhase({
    command: input.command,
    contract: contract(input.mode),
    runId: input.runId ?? '41',
    runAttempt: input.runAttempt ?? 1,
    reportedHome: input.home,
  }, input.dependencies);
}

describe('notification Pages private deployment operator', () => {
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
    await execute({
      mode: 'durable', command: 'postflight', home: reportedHome,
      dependencies: mocked,
    });
    expect(mocked.promote).toHaveBeenCalledWith(
      expect.objectContaining({ candidatePagesSourceCommit: CANDIDATE }),
      AUTHORITY_DIGEST,
    );
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
