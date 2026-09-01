import { createHash } from 'node:crypto';
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
  NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
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

function fixtureDigest(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function fixtureOperationId(contractDigest: string): string {
  return createHash('sha256')
    .update(
      `${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n`
        + `${contractDigest}\n`,
      'utf8',
    )
    .digest('hex');
}

function canonicalFixtureValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalFixtureValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalFixtureValue(item)]),
    );
  }
  return value;
}

function fixtureValueDigest(value: Readonly<Record<string, unknown>>): string {
  return createHash('sha256')
    .update(`${JSON.stringify(canonicalFixtureValue(value))}\n`, 'utf8')
    .digest('hex');
}

function writeCanonicalFixture(
  directory: string,
  name: string,
  value: Readonly<Record<string, unknown>>,
): void {
  writeFileSync(
    join(directory, name),
    `${JSON.stringify(value)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
}

function seedTerminalFixture(
  directory: string,
  generation: number,
  options: {
    completedAt?: string;
    contractDigest?: string;
    finalSequence?: number;
  } = {},
): void {
  const contractDigest = options.contractDigest
    ?? fixtureDigest(`terminal-contract-${generation}`);
  const operationId = fixtureOperationId(contractDigest);
  writeCanonicalFixture(
    directory,
    `notification-pages-private-deploy-${operationId}-terminal.json`,
    {
      candidateAuthorityDigest: null,
      completedAt: options.completedAt ?? '2026-08-13T12:00:00.000Z',
      contractDigest,
      deploymentInvoked: false,
      finalRecordDigest: fixtureDigest(`terminal-record-${generation}`),
      finalSequence: options.finalSequence ?? 3,
      operationId,
      profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
      receiptDigest: fixtureDigest(`terminal-receipt-${generation}`),
      receiptResult: 'installed',
      runAttempt: 1,
      runId: String(10_000 + generation),
      schemaVersion: 1,
    },
  );
}

function seedAbandonmentFixture(
  directory: string,
  generation: number,
  options: { contractDigest?: string } = {},
): {
  checkpointDigest: string;
  checkpointSequence: number;
  contractDigest: string;
  operationId: string;
} {
  const contractDigest = options.contractDigest
    ?? fixtureDigest(`abandonment-contract-${generation}`);
  const operationId = fixtureOperationId(contractDigest);
  const checkpointSequence = 5;
  const checkpoint = {
    adjudicationDigest: fixtureDigest(`abandonment-proof-${generation}`),
    candidatePagesSourceCommit: generation.toString(16).padStart(40, '0'),
    checkpointSequence,
    contractDigest,
    deployRecordDigest: fixtureDigest(`abandonment-deploy-${generation}`),
    deploySequence: 4,
    operationId,
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
    reason: 'github-actions-deploy-step-skipped',
    retiredAt: '2026-08-13T12:00:00.000Z',
    retiredRecordDigest: fixtureDigest(`abandonment-retired-${generation}`),
    retiredSequence: 4,
    runAttempt: 1,
    runId: String(20_000 + generation),
    schemaVersion: 1,
  };
  writeCanonicalFixture(
    directory,
    `notification-pages-private-deploy-${operationId}`
      + `-abandonment-${String(checkpointSequence).padStart(8, '0')}.json`,
    checkpoint,
  );
  return {
    checkpointDigest: fixtureValueDigest(checkpoint),
    checkpointSequence,
    contractDigest,
    operationId,
  };
}

function seedCompletedHistoryFixture(
  directory: string,
  generation: number,
  options: {
    contractDigest?: string;
    deploymentInvoked?: boolean;
    previousRecordDigest?: string | null;
    startSequence?: number;
  } = {},
): void {
  const contractDigest = options.contractDigest
    ?? fixtureDigest(`completed-history-contract-${generation}`);
  const operationId = fixtureOperationId(contractDigest);
  const runId = String(30_000 + generation);
  let previousRecordDigest = options.previousRecordDigest ?? null;
  let sequence = options.startSequence ?? 0;
  const append = (
    phase: string,
    payload: Readonly<Record<string, unknown>>,
    recordRunId = runId,
  ) => {
    sequence += 1;
    const record = {
      contractDigest,
      operationId,
      payload,
      phase,
      previousRecordDigest,
      profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
      recordedAt: '2026-08-13T12:00:00.000Z',
      runAttempt: 1,
      runId: recordRunId,
      schemaVersion: 1,
      sequence,
    };
    writeCanonicalFixture(
      directory,
      `notification-pages-private-deploy-${operationId}`
        + `-${String(sequence).padStart(8, '0')}-${phase}.json`,
      record,
    );
    previousRecordDigest = fixtureValueDigest(record);
  };
  if (options.deploymentInvoked === true) {
    append('prepared', { handoff: null });
    append('reconciled-not-current', { mode: 'durable' });
    append('candidate-authorized', {
      candidateAuthorityDigest: 'd'.repeat(64),
    });
    append('deploy-invoked', {
      candidateAuthorityDigest: 'd'.repeat(64),
      candidatePagesSourceCommit: CANDIDATE,
    });
  }
  const completionRunId = options.deploymentInvoked === true
    ? String(40_000 + generation)
    : runId;
  append('prepared', { handoff: null }, completionRunId);
  append('reconciled-exact-current', { mode: 'durable' }, completionRunId);
  append('postflight-completed', {
    receiptDigest: fixtureDigest(`completed-history-receipt-${generation}`),
    receiptResult: 'installed',
  }, completionRunId);
}

function seedSaturatedActiveHistoryFixture(directory: string): {
  firstRunId: string;
  lastRunId: string;
} {
  const contractDigest = fixtureValueDigest(contract());
  const operationId = fixtureOperationId(contractDigest);
  let previousRecordDigest: string | null = null;
  let sequence = 0;
  const append = (
    runId: string,
    phase: string,
    payload: Readonly<Record<string, unknown>>,
  ) => {
    sequence += 1;
    const record = {
      contractDigest,
      operationId,
      payload,
      phase,
      previousRecordDigest,
      profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
      recordedAt: '2026-08-13T12:00:00.000Z',
      runAttempt: 1,
      runId,
      schemaVersion: 1,
      sequence,
    };
    writeCanonicalFixture(
      directory,
      `notification-pages-private-deploy-${operationId}`
        + `-${String(sequence).padStart(8, '0')}-${phase}.json`,
      record,
    );
    previousRecordDigest = fixtureValueDigest(record);
  };
  const firstRunId = '50000';
  append(firstRunId, 'prepared', { handoff: null });
  append(firstRunId, 'reconciled-not-current', { mode: 'durable' });
  append(firstRunId, 'candidate-authorized', {
    candidateAuthorityDigest: 'd'.repeat(64),
  });
  append(firstRunId, 'deploy-invoked', {
    candidateAuthorityDigest: 'd'.repeat(64),
    candidatePagesSourceCommit: CANDIDATE,
  });
  let lastRunId = firstRunId;
  for (let retry = 1; retry <= 62; retry += 1) {
    lastRunId = String(50_000 + retry);
    append(lastRunId, 'prepared', { handoff: null });
    append(lastRunId, 'reconciled-not-current', { mode: 'durable' });
  }
  expect(sequence).toBe(128);
  return { firstRunId, lastRunId };
}

async function emptyJournalDirectory(home: string): Promise<string> {
  let directory = '';
  await run({
    home,
    operation(journal) {
      directory = journal.directory;
    },
  });
  return directory;
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

  it('prunes a valid crash-left abandonment superseded by its terminal', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const contractDigest = fixtureDigest('valid-overlap-contract');
    seedAbandonmentFixture(directory, 900, { contractDigest });
    seedTerminalFixture(directory, 900, {
      contractDigest,
      finalSequence: 8,
    });
    await run({
      home,
      runId: '901',
      operation: () => undefined,
    });
    const names = readdirSync(directory);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/-terminal\.json$/u);
  });

  it('rejects an abandonment that is not older than its overlapping terminal', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const contractDigest = fixtureDigest('invalid-overlap-contract');
    seedAbandonmentFixture(directory, 901, { contractDigest });
    seedTerminalFixture(directory, 901, {
      contractDigest,
      finalSequence: 7,
    });
    let invoked = false;
    await expect(run({
      home,
      runId: '902',
      operation() {
        invoked = true;
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID',
    });
    expect(invoked).toBe(false);
  });

  it('rejects an overlapping terminal that predates its abandonment', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const contractDigest = fixtureDigest('predating-overlap-contract');
    seedAbandonmentFixture(directory, 903, { contractDigest });
    seedTerminalFixture(directory, 903, {
      completedAt: '2026-08-13T11:59:59.999Z',
      contractDigest,
      finalSequence: 8,
    });
    await expect(run({
      home,
      runId: '904',
      operation: () => undefined,
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID',
    });
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
    const directory = await emptyJournalDirectory(home);
    for (let generation = 0; generation < 255; generation += 1) {
      seedTerminalFixture(directory, generation);
    }
    const generation = 255;
    const source = generation.toString(16).padStart(40, '0');
    await run({
      home,
      runId: String(1_000 + generation),
      contract: {
        ...contract(),
        candidatePagesSourceCommit: source,
      },
      operation(journal) {
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        journal.completed(source.padStart(64, '0'), 'installed');
      },
    });
    const names = readdirSync(directory);
    expect(names).toHaveLength(256);
    expect(names.every(name => name.endsWith('-terminal.json'))).toBe(true);
  });

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
    const directory = await emptyJournalDirectory(home);
    for (let generation = 0; generation <= 255; generation += 1) {
      seedAbandonmentFixture(directory, generation);
    }
    for (let generation = 0; generation < 255; generation += 1) {
      seedTerminalFixture(directory, generation);
    }
    const generation = 255;
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
    const names = readdirSync(directory);
    expect(names).toHaveLength(512);
    expect(names.filter(name => name.includes('-abandonment-'))).toHaveLength(256);
    expect(names.filter(name => name.endsWith('-terminal.json'))).toHaveLength(256);
  });

  it('rejects 513 preexisting retained operations before invoking its callback', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    for (let generation = 0; generation <= 255; generation += 1) {
      seedAbandonmentFixture(directory, generation);
      seedTerminalFixture(directory, generation);
    }
    seedTerminalFixture(directory, 256);
    let invoked = false;
    await expect(run({
      home,
      runId: '4000',
      operation() {
        invoked = true;
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
    });
    expect(invoked).toBe(false);
  });

  it('rejects a new operation at retained capacity before its first record', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    for (let generation = 0; generation <= 255; generation += 1) {
      seedAbandonmentFixture(directory, generation);
      seedTerminalFixture(directory, generation);
    }
    const before = readdirSync(directory).sort();
    await expect(run({
      home,
      runId: '4001',
      operation(journal) {
        journal.prepared(null);
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
    });
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it('preserves idempotency and ambiguity at active-record capacity', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const { firstRunId, lastRunId } = seedSaturatedActiveHistoryFixture(directory);
    const before = readdirSync(directory).sort();
    await expect(run({
      home,
      runId: lastRunId,
      operation(journal) {
        journal.prepared(null);
      },
    })).resolves.toBeUndefined();
    await expect(run({
      home,
      runId: firstRunId,
      operation(journal) {
        journal.deployInvoked('d'.repeat(64));
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED',
      deploymentMayHaveChanged: true,
    });
    await expect(run({
      home,
      runId: lastRunId,
      operation(journal) {
        journal.candidateAuthorized('d'.repeat(64));
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
      deploymentMayHaveChanged: true,
    });
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it('rejects saturated recovery before adjudication with ambiguity preserved', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const { firstRunId } = seedSaturatedActiveHistoryFixture(directory);
    const before = readdirSync(directory).sort();
    let adjudicated = false;
    await expect(recoverNotificationPagesPrivateDeploySkippedInvocation({
      repositoryRoot: REPOSITORY_ROOT,
      reportedHome: home,
      clock: () => new Date('2026-08-13T12:00:00.000Z'),
      randomBytesImpl: deterministicRandom(),
      processIdentity: 'test-process-start-identity',
      processIdentityProbe: () => ({
        state: 'present' as const,
        identity: 'test-process-start-identity',
      }),
      adjudicate: async () => {
        adjudicated = true;
        return skippedProof({ runId: firstRunId });
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
      deploymentMayHaveChanged: true,
    });
    expect(adjudicated).toBe(false);
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it('does not compact a crash-left new terminal into a full retained set', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    for (let generation = 0; generation <= 255; generation += 1) {
      seedAbandonmentFixture(directory, generation);
      seedTerminalFixture(directory, generation);
    }
    seedCompletedHistoryFixture(directory, 902, {
      deploymentInvoked: true,
    });
    const before = readdirSync(directory).sort();
    let invoked = false;
    await expect(run({
      home,
      runId: '4005',
      operation() {
        invoked = true;
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
      deploymentMayHaveChanged: true,
    });
    expect(invoked).toBe(false);
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it('repairs its own crash-left terminal replacement at retained capacity', async () => {
    const home = privateHome();
    const directory = await emptyJournalDirectory(home);
    const contractDigest = fixtureDigest('repair-at-capacity-contract');
    const abandonment = seedAbandonmentFixture(directory, 905, {
      contractDigest,
    });
    for (let generation = 0; generation < 511; generation += 1) {
      seedTerminalFixture(directory, generation);
    }
    seedCompletedHistoryFixture(directory, 905, {
      contractDigest,
      previousRecordDigest: abandonment.checkpointDigest,
      startSequence: abandonment.checkpointSequence,
    });
    await run({
      home,
      runId: '4006',
      operation: () => undefined,
    });
    const names = readdirSync(directory);
    expect(names).toHaveLength(512);
    expect(names.some(name => name.includes('-abandonment-'))).toBe(false);
    expect(names.every(name => name.endsWith('-terminal.json'))).toBe(true);
  });

  it('does not publish an abandonment into a full retained set', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      runId: '4002',
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
      },
    });
    for (let generation = 0; generation <= 255; generation += 1) {
      seedAbandonmentFixture(directory, generation);
      seedTerminalFixture(directory, generation);
    }
    const before = readdirSync(directory).sort();
    await expect(run({
      home,
      runId: '4002',
      operation(journal) {
        journal.prepared(null);
      },
    })).resolves.toBeUndefined();
    await expect(run({
      home,
      runId: '4002',
      operation(journal) {
        journal.deployInvoked('d'.repeat(64));
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED',
      deploymentMayHaveChanged: true,
    });
    await expect(run({
      home,
      runId: '4002',
      operation(journal) {
        journal.postflightNotCurrent('durable');
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
      deploymentMayHaveChanged: true,
    });
    expect(readdirSync(directory).sort()).toEqual(before);
    let adjudicated = false;
    await expect(recoverNotificationPagesPrivateDeploySkippedInvocation({
      repositoryRoot: REPOSITORY_ROOT,
      reportedHome: home,
      clock: () => new Date('2026-08-13T12:00:00.000Z'),
      randomBytesImpl: deterministicRandom(),
      processIdentity: 'test-process-start-identity',
      processIdentityProbe: () => ({
        state: 'present' as const,
        identity: 'test-process-start-identity',
      }),
      adjudicate: async () => {
        adjudicated = true;
        return skippedProof({ runId: '4002' });
      },
    })).rejects.toMatchObject({
      code: 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED',
      deploymentMayHaveChanged: true,
    });
    expect(adjudicated).toBe(false);
    expect(readdirSync(directory).sort()).toEqual(before);
  });

  it('replaces its own abandonment terminal at retained capacity', async () => {
    const home = privateHome();
    let directory = '';
    await run({
      home,
      runId: '4003',
      operation(journal) {
        directory = journal.directory;
        journal.prepared(null);
        journal.reconciledNotCurrent('durable');
        journal.candidateAuthorized('d'.repeat(64));
        journal.deployInvoked('d'.repeat(64));
      },
    });
    await recover({
      home,
      proof: skippedProof({ runId: '4003' }),
    });
    for (let generation = 0; generation < 511; generation += 1) {
      seedTerminalFixture(directory, generation);
    }
    expect(readdirSync(directory)).toHaveLength(512);
    await run({
      home,
      runId: '4004',
      operation(journal) {
        journal.prepared(null);
        journal.reconciledExactCurrent('durable');
        journal.completed('f'.repeat(64), 'installed');
      },
    });
    const names = readdirSync(directory);
    expect(names).toHaveLength(512);
    expect(names.some(name => name.includes('-abandonment-'))).toBe(false);
    expect(names.every(name => name.endsWith('-terminal.json'))).toBe(true);
  });

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
