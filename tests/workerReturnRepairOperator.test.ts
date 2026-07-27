import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildWorkerReturnRepairEnvelope,
  canonicalWorkerReturnRepairTarget,
  classifyWorkerReturnRepairStatus,
  executeWorkerReturnRepairCommand,
  parseWorkerReturnRepairArguments,
  projectWorkerReturnRepairStatus,
  verifyWorkerReturnRepairTransition,
  withWorkerReturnRepairOperatorLock,
  WorkerReturnRepairOperatorError,
  WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY,
  WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
  writePrivateWorkerReturnRepairReceipt,
  type WorkerReturnRepairExecutionRecord,
  type WorkerReturnRepairStatus,
} from '../scripts/worker-return-repair-operator-core';
import {
  attestExactProtectedWorkerReturnRepairMain,
  bindFreshWorkerReturnRepairMigrationProof,
  executeWorkerReturnRepairWithSingleAdminToken,
  readWorkerReturnRepairAdminSecret,
  submitWorkerReturnRepairWithIntent,
  workerReturnRepairIntentRecord,
} from '../scripts/worker-return-repair-operator';

const temporaryRoots: string[] = [];
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_DIGEST = 'b'.repeat(64);
const PUBLICATION_RECEIPT_DIGEST = 'e'.repeat(64);

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-return-repair-',
  ));
  temporaryRoots.push(root);
  return root;
}

function candidateStatus(
  overrides: Partial<WorkerReturnRepairStatus> = {},
): WorkerReturnRepairStatus {
  return Object.freeze({
    systemRows: 1n,
    mode: 'active',
    systemConfigValid: true,
    legacyDrainRequired: false,
    expectedCastleCount: 5n,
    expectedWorkerCount: 20n,
    actualWorkerCount: 20n,
    expectedCountsMatch: true,
    rosterDigestMatches: true,
    castlesMissingWorkers: 0n,
    castlesWithExtraWorkers: 0n,
    duplicateOrdinals: 0n,
    malformedWorkerIds: 0n,
    invalidWorkerStates: 0n,
    idleWorkers: 16n,
    outboundWorkers: 1n,
    gatheringWorkers: 2n,
    returningWorkers: 1n,
    assignments: 4n,
    occupations: 3n,
    schedules: 3n,
    orphanWorkers: 0n,
    orphanAssignments: 0n,
    assignmentsMissingOccupation: 0n,
    assignmentsWithoutSingleSchedule: 1n,
    orphanOccupations: 0n,
    orphanSchedules: 0n,
    invalidSchedules: 0n,
    assignmentPublicMismatches: 0n,
    occupationSiteMismatches: 0n,
    invalidAssignments: 0n,
    idempotencyReceipts: 7n,
    invalidIdempotencyReceipts: 0n,
    idempotencyOverflowFids: 0n,
    legacyExpeditions: 0n,
    legacyOccupations: 0n,
    legacySchedules: 0n,
    rosterDigest: '0123456789abcdef',
    rosterDigestExpected: '0123456789abcdef',
    ...overrides,
  });
}

function scheduleRestoredStatus(
  overrides: Partial<WorkerReturnRepairStatus> = {},
): WorkerReturnRepairStatus {
  return candidateStatus({
    schedules: 4n,
    assignmentsWithoutSingleSchedule: 0n,
    ...overrides,
  });
}

function returnCompletedStatus(
  overrides: Partial<WorkerReturnRepairStatus> = {},
): WorkerReturnRepairStatus {
  return candidateStatus({
    idleWorkers: 17n,
    returningWorkers: 0n,
    assignments: 3n,
    schedules: 3n,
    assignmentsWithoutSingleSchedule: 0n,
    ...overrides,
  });
}

function localAttestation() {
  return Object.freeze({
    sourceCommit: SOURCE_COMMIT,
    moduleArtifactDigest: MODULE_DIGEST,
    publicationReceiptDigest: PUBLICATION_RECEIPT_DIGEST,
  });
}

describe('Worker return repair arguments and target', () => {
  it('requires one explicit confirmation for apply and none for inspect', () => {
    expect(parseWorkerReturnRepairArguments(['inspect'])).toEqual({
      command: 'inspect',
      confirmed: false,
    });
    expect(parseWorkerReturnRepairArguments(['apply', '--confirm'])).toEqual({
      command: 'apply',
      confirmed: true,
    });
    expect(() => parseWorkerReturnRepairArguments(['apply']))
      .toThrow(/CONFIRMATION_REQUIRED/);
    expect(() => parseWorkerReturnRepairArguments(['inspect', '--confirm']))
      .toThrow(/ARGUMENTS_INVALID/);
    expect(() => parseWorkerReturnRepairArguments([
      'apply',
      '--confirm',
      '--confirm',
    ])).toThrow(/ARGUMENTS_INVALID/);
  });

  it('pins the immutable production identity, URI, and bridge', () => {
    const target = canonicalWorkerReturnRepairTarget({});
    expect(target).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      database:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      bridge: 'https://auth.warpkeep.com',
      label: 'warpkeep-production',
    });
    expect(() => canonicalWorkerReturnRepairTarget({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-alias',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
    expect(() => canonicalWorkerReturnRepairTarget({
      WARPKEEP_AUTH_BRIDGE_URL: 'https://example.com',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
  });
});

describe('Worker return repair aggregate projection and plan', () => {
  it('accepts only the exact aggregate-only status surface', () => {
    const projected = projectWorkerReturnRepairStatus(candidateStatus());
    expect(projected.assignmentsWithoutSingleSchedule).toBe(1n);
    expect(() => projectWorkerReturnRepairStatus({
      ...candidateStatus(),
      fid: 123n,
    })).toThrow(/STATUS_FIELDS_INVALID/);
    expect(() => projectWorkerReturnRepairStatus({
      ...candidateStatus(),
      assignments: '4',
    })).toThrow(/STATUS_COUNT_INVALID/);
    expect(() => projectWorkerReturnRepairStatus({
      ...candidateStatus(),
      workerId: 'private-worker-id',
    })).toThrow(/STATUS_FIELDS_INVALID/);
  });

  it('recognizes only the exact candidate and exact healthy graph', () => {
    expect(classifyWorkerReturnRepairStatus(candidateStatus()))
      .toBe('candidate');
    expect(classifyWorkerReturnRepairStatus(scheduleRestoredStatus()))
      .toBe('healthy');
    expect(classifyWorkerReturnRepairStatus(candidateStatus({
      occupationSiteMismatches: 1n,
    }))).toBe('blocked');
    expect(classifyWorkerReturnRepairStatus(candidateStatus({
      assignmentsWithoutSingleSchedule: 2n,
      schedules: 2n,
    }))).toBe('blocked');
    expect(classifyWorkerReturnRepairStatus(candidateStatus({
      returningWorkers: 0n,
      idleWorkers: 17n,
      assignments: 3n,
    }))).toBe('blocked');
  });

  it('builds the exact counts-and-provenance-only reducer envelope', () => {
    const envelope = buildWorkerReturnRepairEnvelope(
      candidateStatus(),
      localAttestation(),
    );
    expect(envelope).toEqual({
      capability: WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY,
      sourceCommit: SOURCE_COMMIT,
      moduleArtifactDigest: MODULE_DIGEST,
      expectedCastleCount: 5,
      expectedWorkerCount: 20,
      expectedAssignments: 4,
      expectedOccupations: 3,
      expectedSchedules: 3,
      expectedReturningWorkers: 1,
      expectedMissingSchedules: 1,
      rosterDigest: '0123456789abcdef',
    });
    expect(JSON.stringify(envelope)).not.toMatch(
      /fid|workerId|assignmentId|siteId|resourceAmount/i,
    );
  });

  it('accepts only schedule restoration or completion of one return', () => {
    expect(verifyWorkerReturnRepairTransition(
      candidateStatus(),
      scheduleRestoredStatus(),
    )).toBe('schedule-restored');
    expect(verifyWorkerReturnRepairTransition(
      candidateStatus(),
      returnCompletedStatus(),
    )).toBe('return-completed');
    expect(() => verifyWorkerReturnRepairTransition(
      candidateStatus(),
      scheduleRestoredStatus({ idempotencyReceipts: 8n }),
    )).toThrow(/POSTCONDITION_DRIFT/);
    expect(() => verifyWorkerReturnRepairTransition(
      candidateStatus(),
      candidateStatus(),
    )).toThrow(/POSTCONDITION_NOT_HEALTHY/);
  });
});

describe('Worker return repair bounded execution', () => {
  it('inspects without a mutation or local apply attestation', async () => {
    const inspect = vi.fn().mockResolvedValue(candidateStatus());
    const submit = vi.fn();
    const record = await executeWorkerReturnRepairCommand({
      command: 'inspect',
      confirmed: false,
      inspect,
      submit,
    });
    expect(record.outcome).toBe('inspected');
    expect(record.submitted).toBe(false);
    expect(inspect).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits once and verifies the restored-schedule post-state', async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce(candidateStatus())
      .mockResolvedValueOnce(scheduleRestoredStatus());
    const submit = vi.fn().mockResolvedValue(undefined);
    const record = await executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect,
      submit,
    });
    expect(record.outcome).toBe('schedule-restored');
    expect(record.verifiedTransition).toBe('schedule-restored');
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      expectedMissingSchedules: 1,
    }));
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('also verifies when the scheduler already completed that return', async () => {
    const record = await executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn()
        .mockResolvedValueOnce(candidateStatus())
        .mockResolvedValueOnce(returnCompletedStatus()),
      submit: vi.fn().mockResolvedValue(undefined),
    });
    expect(record.outcome).toBe('return-completed');
    expect(record.verifiedTransition).toBe('return-completed');
  });

  it('does not submit when another actor already restored health', async () => {
    const submit = vi.fn();
    const record = await executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn().mockResolvedValue(scheduleRestoredStatus()),
      submit,
    });
    expect(record.outcome).toBe('already-healthy');
    expect(record.submitted).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('fails closed before submit for any aggregate drift', async () => {
    const submit = vi.fn();
    await expect(executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn().mockResolvedValue(candidateStatus({
        orphanSchedules: 1n,
      })),
      submit,
    })).rejects.toMatchObject({
      code: 'WORKER_RETURN_REPAIR_PRECONDITION_MISMATCH',
      record: {
        outcome: 'blocked',
        submitted: false,
      },
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('uses post-inspection to resolve a transport-level submission error', async () => {
    const submit = vi.fn().mockRejectedValue(
      new Error('private server response'),
    );
    const record = await executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn()
        .mockResolvedValueOnce(candidateStatus())
        .mockResolvedValueOnce(scheduleRestoredStatus()),
      submit,
    });
    expect(record.outcome).toBe('verified-after-submission-error');
    expect(record.reasonCode)
      .toBe('WORKER_RETURN_REPAIR_SUBMISSION_ERROR_VERIFIED_BY_AGGREGATE');
    expect(submit).toHaveBeenCalledOnce();
    expect(JSON.stringify(
      record,
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    )).not.toContain('private server response');
  });

  it('never retries and distinguishes unchanged rejection from drift', async () => {
    const unchangedSubmit = vi.fn().mockRejectedValue(new Error('private'));
    await expect(executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn()
        .mockResolvedValueOnce(candidateStatus())
        .mockResolvedValueOnce(candidateStatus()),
      submit: unchangedSubmit,
    })).rejects.toMatchObject({
      code: 'WORKER_RETURN_REPAIR_MUTATION_REJECTED_OR_UNCOMMITTED',
      record: {
        outcome: 'mutation-rejected-or-uncommitted',
      },
    });
    expect(unchangedSubmit).toHaveBeenCalledOnce();

    const driftSubmit = vi.fn().mockResolvedValue(undefined);
    await expect(executeWorkerReturnRepairCommand({
      command: 'apply',
      confirmed: true,
      localAttestation: localAttestation(),
      inspect: vi.fn()
        .mockResolvedValueOnce(candidateStatus())
        .mockResolvedValueOnce(scheduleRestoredStatus({
          idempotencyReceipts: 8n,
        })),
      submit: driftSubmit,
    })).rejects.toMatchObject({
      code: 'WORKER_RETURN_REPAIR_MUTATION_OUTCOME_AMBIGUOUS',
      record: {
        outcome: 'mutation-outcome-ambiguous',
      },
    });
    expect(driftSubmit).toHaveBeenCalledOnce();
  });

  it('requests one token and uses it for fresh bounded operations', async () => {
    const sequence: string[] = [];
    const record = await executeWorkerReturnRepairWithSingleAdminToken({
      command: 'apply',
      confirmed: true,
      prepareLocalAttestation: async () => {
        sequence.push('attest');
        return localAttestation();
      },
      requestToken: async () => {
        sequence.push('token');
        return 'short-lived-token';
      },
      inspect: async token => {
        sequence.push(`inspect:${token}`);
        return sequence.filter(item => item.startsWith('inspect:')).length === 1
          ? candidateStatus()
          : scheduleRestoredStatus();
      },
      submit: async (token, envelope) => {
        sequence.push(`submit:${token}`);
        expect(envelope.expectedMissingSchedules).toBe(1);
      },
    });
    expect(record.outcome).toBe('schedule-restored');
    expect(sequence).toEqual([
      'attest',
      'token',
      'inspect:short-lived-token',
      'submit:short-lived-token',
      'inspect:short-lived-token',
    ]);
  });
});

describe('Worker return repair local security boundary', () => {
  it('accepts the credential only from explicitly framed stdin', () => {
    const root = temporaryRoot();
    const path = join(root, 'secret');
    const secret = 'test-only-worker-return-secret-1234567890';
    writeFileSync(path, `${secret}\n`, { mode: 0o600 });
    const descriptor = openSync(path, 'r');
    try {
      expect(readWorkerReturnRepairAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, descriptor)).toBe(secret);
    } finally {
      closeSync(descriptor);
    }
    expect(() => readWorkerReturnRepairAdminSecret({
      WARPKEEP_ADMIN_TOKEN_SECRET: secret,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    }, -1)).toThrow(/SECRET_ENV_REJECTED/);
    expect(() => readWorkerReturnRepairAdminSecret({}, -1))
      .toThrow(/SECRET_STDIN_REQUIRED/);
  });

  it('attests live protected main, canonical origin, and a clean tree', () => {
    const outputs = new Map<string, string>([
      ['symbolic-ref\0--quiet\0--short\0HEAD', 'main\n'],
      ['rev-parse\0--verify\0HEAD^{commit}', `${SOURCE_COMMIT}\n`],
      [
        'config\0--local\0--get-all\0remote.origin.url',
        'https://github.com/ael-dev3/Warpkeep.git\n',
      ],
      [
        'remote\0get-url\0--all\0origin',
        'https://github.com/ael-dev3/Warpkeep.git\n',
      ],
      [
        'ls-remote\0--exit-code\0origin\0refs/heads/main',
        `${SOURCE_COMMIT}\trefs/heads/main\n`,
      ],
      ['status\0--porcelain=v1\0--untracked-files=all', ''],
    ]);
    const readGit = vi.fn((args: readonly string[]) => {
      const output = outputs.get(args.join('\0'));
      if (output === undefined) throw new Error('unexpected git call');
      return output;
    });
    expect(attestExactProtectedWorkerReturnRepairMain(
      '/controlled/repository',
      readGit,
    )).toBe(SOURCE_COMMIT);
    expect(readGit.mock.calls.map(([args]) => args)).toContainEqual([
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/main',
    ]);

    outputs.set(
      'status\0--porcelain=v1\0--untracked-files=all',
      '?? private-proof.json\n',
    );
    expect(() => attestExactProtectedWorkerReturnRepairMain(
      '/controlled/repository',
      readGit,
    )).toThrow(/GIT_ATTESTATION_MISMATCH/);
  });

  it('binds the module digest to a fresh proof and unchanged source', () => {
    expect(bindFreshWorkerReturnRepairMigrationProof({
      sourceCommit: SOURCE_COMMIT,
      runMigrationProof: () => ({
        artifactDigest: MODULE_DIGEST,
        v11TableSchemaDigest: 'c'.repeat(64),
        v12TableSchemaDigest: 'd'.repeat(64),
      }),
      digestArtifact: () => MODULE_DIGEST,
      attestSourceAfterProof: () => SOURCE_COMMIT,
      readPublicationReceipt: artifactDigest => ({
        artifactDigest,
        receiptDigest: PUBLICATION_RECEIPT_DIGEST,
      }),
    })).toEqual(localAttestation());
    expect(() => bindFreshWorkerReturnRepairMigrationProof({
      sourceCommit: SOURCE_COMMIT,
      runMigrationProof: () => ({
        artifactDigest: MODULE_DIGEST,
        v11TableSchemaDigest: 'c'.repeat(64),
        v12TableSchemaDigest: 'd'.repeat(64),
      }),
      digestArtifact: () => 'e'.repeat(64),
      attestSourceAfterProof: () => SOURCE_COMMIT,
      readPublicationReceipt: artifactDigest => ({
        artifactDigest,
        receiptDigest: PUBLICATION_RECEIPT_DIGEST,
      }),
    })).toThrow(/PROOF_MISMATCH/);
    expect(() => bindFreshWorkerReturnRepairMigrationProof({
      sourceCommit: SOURCE_COMMIT,
      runMigrationProof: () => ({
        artifactDigest: MODULE_DIGEST,
        v11TableSchemaDigest: 'c'.repeat(64),
        v12TableSchemaDigest: 'd'.repeat(64),
      }),
      digestArtifact: () => MODULE_DIGEST,
      attestSourceAfterProof: () => SOURCE_COMMIT,
      readPublicationReceipt: () => ({
        artifactDigest: 'f'.repeat(64),
        receiptDigest: PUBLICATION_RECEIPT_DIGEST,
      }),
    })).toThrow(/PROOF_MISMATCH/);
  });

  it('creates an aggregate-only pre-submit intent record', () => {
    const envelope = buildWorkerReturnRepairEnvelope(
      candidateStatus(),
      localAttestation(),
    );
    expect(workerReturnRepairIntentRecord(envelope)).toEqual({
      command: 'apply',
      outcome: 'intent-recorded',
      submitted: false,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope,
    });
  });

  it('persists the intent before invoking the live submit callback', async () => {
    const sequence: string[] = [];
    const envelope = buildWorkerReturnRepairEnvelope(
      candidateStatus(),
      localAttestation(),
    );
    await submitWorkerReturnRepairWithIntent({
      envelope,
      writeIntent: record => {
        sequence.push(`intent:${record.outcome}`);
      },
      submit: async () => {
        sequence.push('submit');
      },
    });
    expect(sequence).toEqual(['intent:intent-recorded', 'submit']);
  });

  it('writes aggregate-only receipts with private permissions', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(receiptDirectory, { mode: 0o700 });
    const record: WorkerReturnRepairExecutionRecord = Object.freeze({
      command: 'apply',
      outcome: 'schedule-restored',
      submitted: true,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope: buildWorkerReturnRepairEnvelope(
        candidateStatus(),
        localAttestation(),
      ),
      before: candidateStatus(),
      after: scheduleRestoredStatus(),
      verifiedTransition: 'schedule-restored',
    });
    const receipt = writePrivateWorkerReturnRepairReceipt({
      directory: receiptDirectory,
      repositoryRoot,
      record,
      now: new Date('2026-07-27T20:00:00.000Z'),
    });
    expect(statSync(receiptDirectory).mode & 0o777).toBe(0o700);
    expect(statSync(receipt.path).mode & 0o777).toBe(0o600);
    const body = readFileSync(receipt.path, 'utf8');
    expect(body).toContain(WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY);
    expect(body).toContain('"assignments": "4"');
    expect(body).not.toMatch(
      /"(?:fid|workerId|assignmentId|siteId|token|qrPayload|identity)"\s*:/i,
    );
    expect(body).not.toContain('https://auth.warpkeep.com');
  });

  it('rejects concurrent runs and never auto-ages a lock', async () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(receiptDirectory, { mode: 0o700 });
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const didStart = new Promise<void>(resolveStarted => {
      started = resolveStarted;
    });
    const hold = new Promise<void>(resolveHold => {
      release = resolveHold;
    });
    const first = withWorkerReturnRepairOperatorLock(
      receiptDirectory,
      repositoryRoot,
      async () => {
        started?.();
        await hold;
      },
    );
    await didStart;
    await expect(withWorkerReturnRepairOperatorLock(
      receiptDirectory,
      repositoryRoot,
      async () => undefined,
    )).rejects.toThrow(/ALREADY_RUNNING/);
    release?.();
    await first;
  });

  it('rejects receipt paths inside the repository', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const record: WorkerReturnRepairExecutionRecord = Object.freeze({
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: candidateStatus(),
      after: candidateStatus(),
    });
    expect(() => writePrivateWorkerReturnRepairReceipt({
      directory: resolve(repositoryRoot, 'private-receipts'),
      repositoryRoot,
      record,
    })).toThrow(/REPOSITORY_OVERLAP/);
  });

  it('never stores an extra private field even through an invalid cast', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const malicious = {
      ...candidateStatus(),
      fid: 123n,
    } as unknown as WorkerReturnRepairStatus;
    const receiptDirectory = join(root, 'receipts');
    mkdirSync(receiptDirectory, { mode: 0o700 });
    const record = {
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: malicious,
      after: malicious,
    } as WorkerReturnRepairExecutionRecord;
    expect(() => writePrivateWorkerReturnRepairReceipt({
      directory: receiptDirectory,
      repositoryRoot,
      record,
    })).toThrow(/STATUS_FIELDS_INVALID/);
  });

  it('exposes only fixed operator codes on failures', () => {
    const error = new WorkerReturnRepairOperatorError(
      'WORKER_RETURN_REPAIR_COMMAND_FAILED',
    );
    expect(error.code).not.toMatch(/424242|private-worker|secret-value/i);
    expect(error.message).toBe(error.code);
  });
});
