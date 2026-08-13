import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE,
  NotificationPagesPrivateDeployJournalError,
  recoverNotificationPagesPrivateDeploySkippedInvocation,
  withNotificationPagesPrivateDeployJournal,
} from '../scripts/notification-pages-private-deploy-journal.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const CANDIDATE = 'a'.repeat(40);
const ROOT_DIGEST = 'b'.repeat(64);
const ROOT_SOURCE = 'c'.repeat(40);

function privateHome(): string {
  const path = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-pages-journal-home-',
  ));
  chmodSync(path, 0o700);
  return path;
}

function deterministicRandom() {
  let counter = 0;
  return (size: number) => {
    counter += 1;
    return Buffer.alloc(size, counter);
  };
}

function contract(mode: 'gen0' | 'durable' = 'durable') {
  return {
    candidatePagesSourceCommit: CANDIDATE,
    mode,
    rootReceiptDigest: mode === 'durable' ? ROOT_DIGEST : null,
    rootPagesSourceCommit: mode === 'durable' ? ROOT_SOURCE : null,
  };
}

function run<T>(input: {
  home: string;
  runId?: string;
  runAttempt?: number;
  contract?: Readonly<Record<string, unknown>>;
  random?: (size: number) => Buffer;
  operation: Parameters<typeof withNotificationPagesPrivateDeployJournal<T>>[0]['operation'];
}) {
  return withNotificationPagesPrivateDeployJournal({
    contract: input.contract ?? contract(),
    repositoryRoot: REPOSITORY_ROOT,
    reportedHome: input.home,
    runId: input.runId ?? '17',
    runAttempt: input.runAttempt ?? 1,
    clock: () => new Date('2026-08-13T12:00:00.000Z'),
    randomBytesImpl: input.random ?? deterministicRandom(),
    processIdentity: 'test-process-start-identity',
    processIdentityProbe: () => ({
      state: 'present' as const,
      identity: 'test-process-start-identity',
    }),
    operation: input.operation,
  });
}

function skippedProof(overrides: Record<string, unknown> = {}) {
  return {
    candidatePagesSourceCommit: CANDIDATE,
    deployStepConclusion: 'skipped',
    deployStepName: 'Deploy private-authorized release to GitHub Pages',
    jobConclusion: 'cancelled',
    jobId: '987654321',
    jobName: 'Notification Pages private deploy v1',
    jobStatus: 'completed',
    markerStepConclusion: 'success',
    markerStepName:
      'Recheck protected source and durably mark deployment invocation',
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE,
    repository: 'ael-dev3/Warpkeep',
    runAttempt: 1,
    runId: '17',
    schemaVersion: 1,
    workflow: '.github/workflows/deploy-pages.yml',
    ...overrides,
  };
}

function recover(input: {
  home: string;
  proof?: Record<string, unknown>;
}) {
  return recoverNotificationPagesPrivateDeploySkippedInvocation({
    repositoryRoot: REPOSITORY_ROOT,
    reportedHome: input.home,
    clock: () => new Date('2026-08-13T12:00:00.000Z'),
    randomBytesImpl: deterministicRandom(),
    processIdentity: 'test-process-start-identity',
    processIdentityProbe: () => ({
      state: 'present' as const,
      identity: 'test-process-start-identity',
    }),
    adjudicate: async () => input.proof ?? skippedProof(),
  });
}

describe('notification Pages private deployment journal', () => {
  it('persists one effect boundary and completes through exact-current recovery', async () => {
    const home = privateHome();
    const random = deterministicRandom();
    await run({
      home,
      random,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
        expect(journal.inspect()).toMatchObject({
          deploymentInvoked: true,
          completed: false,
          candidateAuthorityDigest: 'd'.repeat(64),
        });
      },
    });

    await expect(run({
      home,
      runId: '18',
      random,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        return journal.deployInvoked('d'.repeat(64));
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED',
      deploymentMayHaveChanged: true,
    });

    await run({
      home,
      runId: '19',
      random,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        journal.completed('e'.repeat(64), 'installed');
        expect(journal.inspect()).toMatchObject({
          deploymentInvoked: true,
          completed: true,
          phase: 'postflight-completed',
        });
      },
    });
  });

  it('makes same-attempt transitions idempotent except the deployment boundary', async () => {
    const home = privateHome();
    const random = deterministicRandom();
    await run({
      home,
      random,
      operation(journal) {
        journal.prepared(null);
        journal.prepared(null);
        journal.reconciledNotCurrent('gen0');
        journal.reconciledNotCurrent('gen0');
        journal.deployInvoked(null);
        expect(() => journal.deployInvoked(null)).toThrow(
          'NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED',
        );
      },
      contract: contract('gen0'),
    });
  });

  it('compacts completion to one private canonical terminal outside the repository', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        journal.completed('f'.repeat(64), 'unchanged');
      },
    });
    expect(directory.startsWith(REPOSITORY_ROOT)).toBe(false);
    const names = readdirSync(directory);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/-terminal\.json$/u);
    for (const name of names) {
      const path = join(directory, name);
      const body = readFileSync(path, 'utf8');
      expect(body.endsWith('\n')).toBe(true);
      expect(JSON.stringify(JSON.parse(body)) + '\n').toBe(body);
    }
  });

  it('repairs a crash after terminal publication while record unlinking', async () => {
    const home = privateHome();
    let directory = '';
    const remnants: Array<{ name: string; body: string }> = [];
    await run({
      home,
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        for (const name of readdirSync(directory)) {
          if (/^notification-pages-private-deploy-.*-[0-9]{8}-/u.test(name)) {
            remnants.push({ name, body: readFileSync(join(directory, name), 'utf8') });
          }
        }
        journal.completed('f'.repeat(64), 'unchanged');
      },
    });
    expect(readdirSync(directory)).toHaveLength(1);
    for (const remnant of remnants) {
      writeFileSync(join(directory, remnant.name), remnant.body, { mode: 0o600 });
    }
    await run({
      home,
      runId: '26',
      operation(journal) {
        expect(journal.inspect()).toMatchObject({
          completed: true,
          phase: 'postflight-completed',
        });
      },
    });
    expect(readdirSync(directory)).toHaveLength(1);
    expect(readdirSync(directory)[0]).toMatch(/-terminal\.json$/u);
  });

  it('keeps receipt generation 255 reachable within the directory bound', async () => {
    const home = privateHome();
    let directory = '';
    for (let generation = 0; generation <= 255; generation += 1) {
      const source = generation.toString(16).padStart(40, '0');
      await run({
        home,
        runId: String(1_000 + generation),
        contract: {
          ...contract(),
          candidatePagesSourceCommit: source,
        },
        operation(journal) {
          directory = journal.directory;
          journal.prepared(null);
          journal.reconciledExactCurrent('durable');
          journal.completed(source.padStart(64, '0'), 'installed');
        },
      });
    }
    const names = readdirSync(directory);
    expect(names).toHaveLength(256);
    expect(names.every(name => name.endsWith('-terminal.json'))).toBe(true);
  }, 120_000);

  it('retires only an invocation whose exact deploy action was skipped', async () => {
    const home = privateHome();
    await run({
      home,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
      },
    });
    await expect(recover({ home })).resolves.toMatchObject({
      recovered: true,
      candidatePagesSourceCommit: CANDIDATE,
    });
    await expect(run({
      home,
      runId: '30',
      contract: { ...contract(), candidatePagesSourceCommit: '9'.repeat(40) },
      operation(journal) {
        journal.prepared(null);
        expect(journal.inspect().phase).toBe('prepared');
      },
    })).resolves.toBeUndefined();
  });

  it.each(['failure', 'cancelled']) (
    'recovers a fsynced marker after its workflow step ends %s',
    async markerStepConclusion => {
      const home = privateHome();
      await run({
        home,
        operation(journal) {
          journal.prepared(null);
          journal.reconciledNotCurrent('durable');
          journal.candidateAuthorized('d'.repeat(64));
          // This append is the simulated crash-after-fsync boundary.
          journal.deployInvoked('d'.repeat(64));
        },
      });
      await expect(recover({
        home,
        proof: skippedProof({ markerStepConclusion }),
      })).resolves.toMatchObject({ recovered: true });
    },
  );

  it('supersedes repeated skipped-action checkpoints for one operation', async () => {
    const home = privateHome();
    let directory = '';
    for (const runId of ['17', '18']) {
      await run({
        home,
        runId,
        operation(journal) {
          directory = journal.directory;
          journal.prepared(null);
          journal.reconciledNotCurrent('durable');
          journal.candidateAuthorized('d'.repeat(64));
          journal.deployInvoked('d'.repeat(64));
        },
      });
      await expect(recover({
        home,
        proof: skippedProof({ runId }),
      })).resolves.toMatchObject({ recovered: true });
      const names = readdirSync(directory);
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/-abandonment-[0-9]{8}\.json$/u);
    }
    await run({
      home,
      runId: '19',
      operation(journal) {
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        journal.completed('f'.repeat(64), 'installed');
      },
    });
    expect(readdirSync(directory)).toHaveLength(1);
    expect(readdirSync(directory)[0]).toMatch(/-terminal\.json$/u);
  });

  it('retains 256 abandoned operations without blocking generation 255', async () => {
    const home = privateHome();
    let directory = '';
    for (let generation = 0; generation <= 255; generation += 1) {
      const candidate = generation.toString(16).padStart(40, '0');
      const runId = String(2_000 + generation);
      await run({
        home,
        runId,
        contract: { ...contract(), candidatePagesSourceCommit: candidate },
        operation(journal) {
          directory = journal.directory;
          journal.prepared(null);
          journal.reconciledNotCurrent('durable');
          journal.candidateAuthorized('d'.repeat(64));
          journal.deployInvoked('d'.repeat(64));
        },
      });
      await recoverNotificationPagesPrivateDeploySkippedInvocation({
        repositoryRoot: REPOSITORY_ROOT,
        reportedHome: home,
        clock: () => new Date('2026-08-13T12:00:00.000Z'),
        randomBytesImpl: deterministicRandom(),
        processIdentity: 'test-process-start-identity',
        processIdentityProbe: () => ({
          state: 'present' as const,
          identity: 'test-process-start-identity',
        }),
        adjudicate: async () => skippedProof({
          candidatePagesSourceCommit: candidate,
          runId,
        }),
      });
    }
    expect(readdirSync(directory)).toHaveLength(256);
    for (let generation = 0; generation <= 255; generation += 1) {
      const candidate = `f${generation.toString(16).padStart(39, '0')}`;
      await run({
        home,
        runId: String(3_000 + generation),
        contract: { ...contract(), candidatePagesSourceCommit: candidate },
        operation(journal) {
          journal.prepared(null);
          journal.reconciledExactCurrent('durable');
          journal.completed(candidate.padStart(64, '0'), 'installed');
        },
      });
    }
    const names = readdirSync(directory);
    expect(names).toHaveLength(512);
    expect(names.filter(name => name.includes('-abandonment-'))).toHaveLength(256);
    expect(names.filter(name => name.endsWith('-terminal.json'))).toHaveLength(256);
  }, 180_000);

  it.each([
    ['cancelled', 'action may have started'],
    ['failure', 'action returned failure'],
    ['timed_out', 'action timed out'],
    [null, 'action step absent'],
  ])('keeps deployment ambiguous when deploy conclusion is %s (%s)', async (
    conclusion,
    _description,
  ) => {
    const home = privateHome();
    await run({
      home,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
      },
    });
    await expect(recover({
      home,
      proof: skippedProof({ deployStepConclusion: conclusion }),
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
    await expect(run({
      home,
      runId: '31',
      contract: { ...contract(), candidatePagesSourceCommit: '8'.repeat(40) },
      operation: () => undefined,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_DEPLOY_JOURNAL_OTHER_OPERATION_UNFINISHED',
    );
  });

  it('keeps a failed marker ambiguous unless the authenticated deploy is skipped', async () => {
    const home = privateHome();
    await run({
      home,
      operation(journal) {
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
      },
    });
    await expect(recover({
      home,
      proof: skippedProof({
        markerStepConclusion: 'failure',
        deployStepConclusion: 'failure',
      }),
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS',
      deploymentMayHaveChanged: true,
    });
  });

  it('fails closed on altered records and unfinished competing operations', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
      },
    });
    await expect(run({
      home,
      runId: '20',
      contract: { ...contract(), candidatePagesSourceCommit: '9'.repeat(40) },
      operation: () => undefined,
    })).rejects.toThrow('NOTIFICATION_PAGES_DEPLOY_JOURNAL_OTHER_OPERATION_UNFINISHED');

    const first = readdirSync(directory).find(name => name.endsWith('-prepared.json'))!;
    const path = join(directory, first);
    const value = JSON.parse(readFileSync(path, 'utf8'));
    value.payload.handoff = { unexpected: true };
    writeFileSync(path, JSON.stringify(value) + '\n', { mode: 0o600 });
    await expect(run({
      home,
      runId: '21',
      operation: () => undefined,
    })).rejects.toBeInstanceOf(NotificationPagesPrivateDeployJournalError);
  });

  it('never accepts non-private journal record modes', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
      },
    });
    const first = readdirSync(directory).find(name => name.endsWith('-prepared.json'))!;
    chmodSync(join(directory, first), 0o644);
    await expect(run({
      home,
      runId: '22',
      operation: () => undefined,
    })).rejects.toThrow('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_INVALID');
  });

  it('never repairs another live writer before acquiring the global lock', async () => {
    const home = privateHome();
    const random = deterministicRandom();
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>(resolveHold => {
      releaseFirst = resolveHold;
    });
    let enteredFirst!: () => void;
    const firstEntered = new Promise<void>(resolveEntered => {
      enteredFirst = resolveEntered;
    });
    let temporary = '';
    const first = run({
      home,
      random,
      async operation(journal) {
        journal.prepared(null);
        temporary = join(
          journal.directory,
          `.notification-pages-private-deploy-${journal.operationId}`
            + '-00000002-reconciled-not-current-'
            + `${'7'.repeat(24)}.json.tmp`,
        );
        writeFileSync(temporary, '{', { mode: 0o400 });
        enteredFirst();
        await holdFirst;
      },
    });
    await firstEntered;
    await expect(run({
      home,
      runId: '23',
      random,
      operation: () => undefined,
    })).rejects.toThrow('NOTIFICATION_PAGES_DEPLOY_JOURNAL_BUSY');
    expect(existsSync(temporary)).toBe(true);
    releaseFirst();
    await first;

    await run({
      home,
      runId: '24',
      random,
      operation(journal) {
        expect(journal.inspect().phase).toBe('prepared');
      },
    });
    expect(existsSync(temporary)).toBe(false);
  });

  it('repairs an owner-only subset directory mode left by interrupted creation', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
      },
    });
    chmodSync(directory, 0o500);
    await run({
      home,
      runId: '25',
      operation: () => undefined,
    });
    expect(statSync(directory).mode & 0o7777).toBe(0o700);
  });
});
