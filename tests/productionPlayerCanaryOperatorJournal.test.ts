// @vitest-environment node

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  productionPlayerCanaryOperatorConfirmationDigest,
  productionPlayerCanaryOperatorEffectDigest,
  productionPlayerCanaryOperatorJournalTestSeams,
} from '../scripts/production-player-canary-operator-journal.mjs';

const journalTestSeams = productionPlayerCanaryOperatorJournalTestSeams!;
const withProductionPlayerCanaryOperatorJournal =
  journalTestSeams.withJournalDependencies;

const NONCE = '0f'.repeat(32);
const PLAN = 'b'.repeat(64);
const BASELINE = 'c'.repeat(64);
const ROUTE = 'd'.repeat(64);
const COMMAND = 'e'.repeat(64);
const REGISTRATION = 'f'.repeat(64);

function privateHome() {
  const directory = mkdtempSync(join(
    realpathSync(tmpdir()),
    'warpkeep-canary-operator-home-',
  ));
  chmodSync(directory, 0o700);
  return directory;
}

function contract(home: string) {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-production-player-canary-operator-v1' as const,
    operationId: '1'.repeat(32),
    evidenceNonce: NONCE,
    reviewedAdmissionClaimDigest: '2'.repeat(64),
    subjectCommitment: '3'.repeat(64),
    repositoryRoot: '/private/repository',
    protectedCommit: '4'.repeat(40),
    protectedTree: '5'.repeat(40),
    founderPlanDirectory: join(home, 'founder-plans'),
    reviewedAdmissionPlanReference: {
      filename: 'reviewed-plan.json',
      sha256: PLAN,
    },
    ownerApprovalDirectory: join(home, 'owner-approvals'),
    receiptDirectory: join(home, 'receipts'),
  };
}

function injected() {
  let random = 0;
  return {
    now: () => new Date('2026-08-13T12:00:00.000Z'),
    randomBytes: (size: number) => Buffer.alloc(size, ++random),
    currentProcessIdentity: () => 'Thu Aug 13 12:00:00 2026',
    probeProcessIdentity: () => ({
      state: 'present' as const,
      identity: 'Thu Aug 13 12:00:00 2026',
    }),
  };
}

function baselineResult(outcome = 'capture-acknowledged') {
  return {
    challengeDigest: '4'.repeat(64),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: BASELINE,
    routeSetCommitment: ROUTE,
    capturedAtMicros: 1_786_622_400_000_000n,
    submissionOutcome: outcome,
  };
}

function approvalResult(outcome = 'register-acknowledged') {
  return {
    approvalRegistrationCommitment: REGISTRATION,
    routeSetCommitment: ROUTE,
    commandSetCommitment: COMMAND,
    registeredAtMicros: 1_786_622_401_000_000n,
    submissionOutcome: outcome,
  };
}

function directorySnapshot(directory: string) {
  return readdirSync(directory).sort().map(name => {
    const path = join(directory, name);
    const status = statSync(path, { bigint: true });
    return {
      name,
      bytes: readFileSync(path).toString('base64'),
      mode: status.mode,
      nlink: status.nlink,
      size: status.size,
      mtimeNs: status.mtimeNs,
      ctimeNs: status.ctimeNs,
    };
  });
}

describe('production player canary private operator journal', () => {
  it('records every mutation boundary before its permit and keeps private material redacted', async () => {
    const home = privateHome();
    const operation = contract(home);
    const options = injected();
    const baselineArguments = {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
    };
    const baselineEffect = productionPlayerCanaryOperatorEffectDigest(
      baselineArguments,
    );
    const baselineConfirmation = productionPlayerCanaryOperatorConfirmationDigest({
      operationId: operation.operationId,
      action: 'capture-baseline',
      attempt: 1,
      effectDigest: baselineEffect,
    });
    const approvalArguments = {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
      serverBaselineCommitment: BASELINE,
      routeSetCommitment: ROUTE,
      commandSetCommitment: COMMAND,
    };
    const approvalEffect = productionPlayerCanaryOperatorEffectDigest(
      approvalArguments,
    );
    const approvalConfirmation = productionPlayerCanaryOperatorConfirmationDigest({
      operationId: operation.operationId,
      action: 'register-approval',
      attempt: 1,
      effectDigest: approvalEffect,
    });
    const reference = {
      filename: `production-player-canary-owner-approval-${'5'.repeat(32)}.json`,
      sha256: '6'.repeat(64),
    };

    await withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: async journal => {
        expect(journal.inspect().phase).toBe('prepared');
        const baseline = journal.beginBaselineWrite({
          arguments: baselineArguments,
          confirmationDigest: baselineConfirmation,
        });
        expect(() => baseline.permit()).toThrow(
          'PRODUCTION_PLAYER_CANARY_OPERATOR_WRITE_PERMIT_INVALID',
        );
        await baseline.permit.markSubmissionUncertain();
        expect(journal.inspect().phase).toBe('baseline-submission-uncertain');
        expect(() => baseline.permit()).not.toThrow();
        journal.baselineReconciled(baselineResult());

        journal.ownerApprovalInstallIntent({
          reference,
          approvalCommitment: '7'.repeat(64),
          routeSetCommitment: ROUTE,
          commandSetCommitment: COMMAND,
          confirmationDigest: '8'.repeat(64),
        });
        journal.ownerApprovalInstalled({
          reference,
          approvalCommitment: '7'.repeat(64),
          routeSetCommitment: ROUTE,
          commandSetCommitment: COMMAND,
        });

        const approval = journal.beginApprovalWrite({
          arguments: approvalArguments,
          confirmationDigest: approvalConfirmation,
        });
        await approval.permit.markSubmissionUncertain();
        approval.permit();
        journal.approvalReconciled(approvalResult());
        journal.awaitingAuthoritativeEvidence();
        journal.receiptInstallIntent({
          receiptDigest: '9'.repeat(64),
          evidenceAuthorityDigest: 'a'.repeat(64),
          recordedAt: '2026-08-13T12:00:00.000Z',
          notAfter: '2026-08-13T13:00:00.000Z',
        });
        journal.receiptInstalled({
          filename: `production-player-canary-${'9'.repeat(64)}.json`,
          receiptDigest: '9'.repeat(64),
          result: 'installed',
        });
        const activeDirectory = join(
          home,
          '.warpkeep/private/production-admin-v1',
          'production-player-canary-operator-journal-v1',
        );
        const beforeActiveInspection = directorySnapshot(activeDirectory);
        expect(() => journalTestSeams.inspectTerminalReceiptJournalAtHome(
          operation.operationId,
          home,
        )).toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
        expect(directorySnapshot(activeDirectory)).toEqual(beforeActiveInspection);
      },
    }, options);

    const directory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      'production-player-canary-operator-journal-v1',
    );
    const recordBytes = readdirSync(directory)
      .filter(name => /^production-player-canary-operator-[0-9a-f]{32}-/u.test(name))
      .map(name => readFileSync(join(directory, name), 'utf8'))
      .join('\n');
    expect(recordBytes).not.toContain(NONCE);
    expect(recordBytes).not.toContain('"fid"');
    expect(recordBytes).not.toContain('pc1-d01-');
    expect(recordBytes).toContain('"phase":"receipt-installed"');

    const beforeInspection = directorySnapshot(directory);
    expect(journalTestSeams.inspectTerminalReceiptJournalAtHome(
      operation.operationId,
      home,
    )).toMatchObject({
      operationId: operation.operationId,
      contract: {
        protectedCommit: operation.protectedCommit,
        protectedTree: operation.protectedTree,
      },
      ownerApprovalReference: reference,
      baselineCheckpoint: {
        serverBaselineCommitment: BASELINE,
        routeSetCommitment: ROUTE,
      },
      ownerApprovalCheckpoint: {
        approvalCommitment: '7'.repeat(64),
        commandSetCommitment: COMMAND,
      },
      approvalCheckpoint: {
        approvalRegistrationCommitment: REGISTRATION,
        commandSetCommitment: COMMAND,
      },
      receipt: {
        receiptDigest: '9'.repeat(64),
        result: 'installed',
      },
    });
    expect(directorySnapshot(directory)).toEqual(beforeInspection);

    await expect(withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: journal => journal.inspect(),
    }, options)).resolves.toMatchObject({ phase: 'receipt-installed' });

    for (const hostileName of [
      `production-player-canary-operator-${'2'.repeat(32)}`
        + '-00000001-prepared.json',
      `.production-player-canary-operator-${operation.operationId}`
        + `-00000099-prepared.json.${'a'.repeat(24)}.tmp`,
    ]) {
      const hostilePath = join(directory, hostileName);
      writeFileSync(hostilePath, '{}\n', { mode: 0o600 });
      const beforeFailure = directorySnapshot(directory);
      expect(() => journalTestSeams.inspectTerminalReceiptJournalAtHome(
        operation.operationId,
        home,
      )).toThrow('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
      expect(directorySnapshot(directory)).toEqual(beforeFailure);
      unlinkSync(hostilePath);
    }
  });

  it('poisons an absent post-intent row until a new explicit attempt is journaled', async () => {
    const home = privateHome();
    const operation = contract(home);
    const options = injected();
    const arguments_ = {
      fid: 123n,
      reviewedAdmissionPlanDigest: PLAN,
      evidenceNonce: NONCE,
    };
    const firstConfirmation = productionPlayerCanaryOperatorConfirmationDigest({
      operationId: operation.operationId,
      action: 'capture-baseline',
      attempt: 1,
      effectDigest: productionPlayerCanaryOperatorEffectDigest(arguments_),
    });

    await expect(withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: async journal => {
        const write = journal.beginBaselineWrite({
          arguments: arguments_,
          confirmationDigest: firstConfirmation,
        });
        await write.permit.markSubmissionUncertain();
        throw new Error('simulated process loss after durable uncertainty');
      },
    }, options)).rejects.toThrow('simulated process loss');

    await withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: journal => {
        expect(journal.inspect().phase).toBe('baseline-submission-uncertain');
        journal.baselineAbsenceObserved();
        expect(journal.inspect()).toMatchObject({
          phase: 'baseline-absence-observed',
          payload: { disposition: 'explicit-operator-retry-required' },
        });
        const secondEffect = productionPlayerCanaryOperatorEffectDigest(arguments_);
        const secondConfirmation = productionPlayerCanaryOperatorConfirmationDigest({
          operationId: operation.operationId,
          action: 'capture-baseline',
          attempt: 2,
          effectDigest: secondEffect,
        });
        const retry = journal.beginBaselineWrite({
          arguments: arguments_,
          confirmationDigest: secondConfirmation,
        });
        expect(retry.attempt).toBe(2);
      },
    }, options);
  });

  it('removes inert partial temporaries and does not leak lock entries', async () => {
    const home = privateHome();
    const operation = contract(home);
    const options = injected();
    await withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: journal => journal.inspect(),
    }, options);
    const directory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      'production-player-canary-operator-journal-v1',
    );
    writeFileSync(join(
      directory,
      `.production-player-canary-operator-${operation.operationId}`
        + `-00000099-prepared.json.${'a'.repeat(24)}.tmp`,
    ), Buffer.alloc(0), { mode: 0o600 });
    writeFileSync(join(
      directory,
      `.production-player-canary-operator-${operation.operationId}`
        + `-00000100-prepared.json.${'b'.repeat(24)}.tmp`,
    ), Buffer.from('{'), { mode: 0o600 });

    for (let index = 0; index < 260; index += 1) {
      await withProductionPlayerCanaryOperatorJournal({
        contract: operation,
        reportedHome: home,
        operation: journal => journal.inspect(),
      }, options);
    }
    const names = readdirSync(directory);
    expect(names.filter(name => name.includes('.tmp'))).toEqual([]);
    expect(names.filter(name => name.includes('-lock-'))).toEqual([]);
    expect(names.filter(name => name.includes('-prepared.json'))).toHaveLength(1);
  }, 30_000);

  it('retains the kernel lock in the actor after the acquisition helper exits', async () => {
    const home = privateHome();
    const operation = contract(home);
    const options = injected();
    await withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: async () => {
        const directory = join(
          home,
          '.warpkeep/private/production-admin-v1',
          'production-player-canary-operator-journal-v1',
        );
        const activeTemporary = join(
          directory,
          `.production-player-canary-operator-${operation.operationId}`
            + `-00000099-prepared.json.${'c'.repeat(24)}.tmp`,
        );
        writeFileSync(activeTemporary, Buffer.alloc(0), { mode: 0o600 });
        await expect(withProductionPlayerCanaryOperatorJournal({
          contract: operation,
          reportedHome: home,
          operation: journal => journal.inspect(),
        }, options)).rejects.toThrow(
          'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCKED',
        );
        expect(existsSync(activeTemporary)).toBe(true);
      },
    }, options);
    await expect(withProductionPlayerCanaryOperatorJournal({
      contract: operation,
      reportedHome: home,
      operation: journal => journal.inspect(),
    }, options)).resolves.toMatchObject({ phase: 'prepared' });
    const directory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      'production-player-canary-operator-journal-v1',
    );
    expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false);
  });
});
