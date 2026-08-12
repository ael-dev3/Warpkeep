// @vitest-environment node

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectGreaterRealmCutoverOperatorJournalRecovery,
  recoverGreaterRealmCutoverOperatorJournal,
  recoverGreaterRealmCutoverOperatorLock,
  withGreaterRealmCutoverOperatorLock,
} from '../scripts/greater-realm-cutover-receipts';
import {
  executeGreaterRealmProductionImportOperator,
  parseGreaterRealmProductionImportArguments,
} from '../scripts/greater-realm-production-import-operator';
import {
  executeGreaterRealmProductionRelocationOperator,
  parseGreaterRealmProductionRelocationArguments,
} from '../scripts/greater-realm-production-relocation-operator';
import { createGreaterRealmCutoverExpectedAfterPredicate } from '../scripts/greater-realm-cutover-operation-journal';
import { readGreaterRealmProductionAdminSecretFile } from '../scripts/greater-realm-production-transport';

const DAY_MS = 24 * 60 * 60 * 1_000;
const FIXTURE = join(
  process.cwd(),
  'tests',
  'fixtures',
  'greaterRealmCutoverJournalCrashFixture.ts',
);
const TSX = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

function fixture(input: Readonly<{
  action: 'initial-import' | 'recover-import' | 'initial-publish' | 'recover-publish'
    | 'initial-publish-same-schema' | 'initial-publish-plan-only' | 'initial-lock-only'
    | 'normal-publish-cleanup-context' | 'initial-publish-cleanup-tail'
    | 'initial-publish-cleanup-failure';
  directory: string;
  now: number;
  crashStep?: string;
  counterPath: string;
}>): void {
  const result = spawnSync(process.execPath, [
    TSX,
    FIXTURE,
    input.action,
    input.directory,
    process.cwd(),
    String(input.now),
    input.crashStep ?? 'no-injected-crash',
    input.counterPath,
  ], { encoding: 'utf8', env: process.env, timeout: 20_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function failingPublishRecoveryFixture(input: Readonly<{
  directory: string;
  now: number;
  counterPath: string;
}>): void {
  const result = spawnSync(process.execPath, [
    TSX,
    FIXTURE,
    'recover-publish',
    input.directory,
    process.cwd(),
    String(input.now),
    'throw-publish-artifact-cleanup-callback',
    input.counterPath,
  ], { encoding: 'utf8', env: process.env, timeout: 20_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
  expect(result.stderr).toMatch(/JOURNAL_ARTIFACT_CLEANUP_CALLBACK_FAILURE/u);
}

function failingFixture(input: Readonly<{
  action: 'recover-import';
  directory: string;
  now: number;
  crashStep: string;
  counterPath: string;
}>): void {
  const result = spawnSync(process.execPath, [
    TSX,
    FIXTURE,
    input.action,
    input.directory,
    process.cwd(),
    String(input.now),
    input.crashStep,
    input.counterPath,
  ], { encoding: 'utf8', env: process.env, timeout: 20_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
  expect(result.stderr).toMatch(/JOURNAL_INJECTED_CLEANUP_FAILURE/u);
}

function concurrentFixture(input: Readonly<{
  action: 'recover-import';
  directory: string;
  now: number;
  crashStep: 'concurrent-recovery-claim';
  counterPath: string;
}>): Promise<Readonly<{
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}>> {
  const child = spawn(process.execPath, [
    TSX,
    FIXTURE,
    input.action,
    input.directory,
    process.cwd(),
    String(input.now),
    input.crashStep,
    input.counterPath,
  ], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`JOURNAL_CONCURRENT_FIXTURE_TIMEOUT\n${stdout}\n${stderr}`));
    }, 20_000);
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (status, signal) => {
      clearTimeout(timeout);
      resolve(Object.freeze({ status, signal, stdout, stderr }));
    });
  });
}

function operationNames(counterPath: string): string[] {
  if (!existsSync(counterPath)) return [];
  return readFileSync(counterPath, 'utf8').trim().split('\n').filter(Boolean);
}

function journalFiles(directory: string): string[] {
  return readdirSync(directory).filter(name => (
    name.includes('cutover-operation-')
    || name.includes('cutover-command-')
    || name.includes('cutover-command-group-')
    || name.includes('cutover-recovery-owner-')
  ));
}

function operationPhaseOrdinals(directory: string): Readonly<Record<string, readonly number[]>> {
  const phases: Record<string, number[]> = {};
  for (const name of readdirSync(directory).filter(entry => (
    entry.includes('cutover-operation-') && entry.endsWith('.json')
  ))) {
    const record = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Readonly<{
      operationOrdinal: number;
      phaseOrdinal: number;
    }>;
    (phases[String(record.operationOrdinal)] ??= []).push(record.phaseOrdinal);
  }
  for (const ordinals of Object.values(phases)) ordinals.sort((left, right) => left - right);
  return Object.freeze(phases);
}

function commandGroupOrdinals(directory: string): number[] {
  return readdirSync(directory)
    .filter(name => name.includes('cutover-command-group-') && name.endsWith('.json'))
    .map(name => Number(/-([0-9]{8})-[a-z-]+\.json$/u.exec(name)?.[1]))
    .sort((left, right) => left - right);
}

type RecordedArtifactCleanupContext = Readonly<{
  label: string;
  record: Readonly<Record<string, unknown>>;
  context: Readonly<{
    groupDigest: string;
    command: Readonly<Record<string, unknown>>;
    sourceRelease: Readonly<Record<string, unknown>>;
    operations: readonly Readonly<{
      operationOrdinal: number;
      planDigest: string;
      operation: Readonly<{
        identity: Readonly<Record<string, unknown>>;
      }>;
    }>[];
  }>;
  operationWalNames: readonly string[];
  immutable: boolean;
}>;

function artifactCleanupContexts(counterPath: string): RecordedArtifactCleanupContext[] {
  const path = `${counterPath}.cleanup-context.jsonl`;
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => (
    JSON.parse(line) as RecordedArtifactCleanupContext
  ));
}

function retainedCommandWalNames(directory: string): string[] {
  return readdirSync(directory).filter(name => (
    name.includes('cutover-operation-')
    || name.includes('cutover-command-')
    || name.includes('cutover-command-group-')
  )).sort();
}

function expectCompletePublisherCleanupContext(
  recorded: RecordedArtifactCleanupContext,
  expectedLabel: string,
  expectedOperationWalCount = 8,
): void {
  expect(recorded.label).toBe(expectedLabel);
  expect(recorded.immutable).toBe(true);
  expect(Object.keys(recorded.context).sort()).toEqual([
    'command', 'groupDigest', 'operations', 'sourceRelease',
  ]);
  expect(recorded.context.groupDigest).toMatch(/^[0-9a-f]{64}$/u);
  expect(recorded.context.command).toEqual({ kind: 'publish', name: 'publish' });
  expect(recorded.context.sourceRelease).toEqual(publishSourceRelease);
  expect(recorded.context.operations.map(operation => operation.operationOrdinal)).toEqual([1, 2]);
  expect(recorded.context.operations.map(operation => Object.keys(operation).sort())).toEqual([
    ['operation', 'operationOrdinal', 'planDigest'],
    ['operation', 'operationOrdinal', 'planDigest'],
  ]);
  expect(recorded.context.operations.map(operation => (
    (operation.operation.identity.publishSupervisorIdentity as Readonly<{ supervisorId: string }>).supervisorId
  ))).toEqual(['fixture-supervisor-1', 'fixture-supervisor-2']);
  expect(recorded.context.operations.every(operation => (
    /^[0-9a-f]{64}$/u.test(operation.planDigest)
  ))).toBe(true);
  expect(recorded.operationWalNames).toHaveLength(expectedOperationWalCount);
  expect(recorded.record.artifactDigest).toBe('d'.repeat(64));
}

const publishSourceRelease = Object.freeze({
  atlasSourceCommit: 'a'.repeat(40),
  moduleSourceCommit: 'b'.repeat(40),
  atlasId: 'atlas-test',
  publicReleaseId: 'release-test',
  expectedReleaseSha256: 'c'.repeat(64),
});
const publishBeforeStatus = Object.freeze({ step: 0 });
const publishBeforeAudit = Object.freeze({ rows: 0 });
const publishAfterStatus = Object.freeze({ step: 1 });
const publishAfterAudit = Object.freeze({ rows: 1 });

function publishExpectedAfterPredicate(contract: string) {
  return createGreaterRealmCutoverExpectedAfterPredicate({
    moduleSourceCommit: publishSourceRelease.moduleSourceCommit,
    contract,
    statusRules: Object.freeze({
      step: Object.freeze({ rule: 'equals' as const, value: 1 }),
    }),
    auditRules: Object.freeze({
      rows: Object.freeze({ rule: 'equals' as const, value: 1 }),
    }),
  });
}

type RecoverJournalInput = Parameters<typeof recoverGreaterRealmCutoverOperatorJournal>[0];
type PublishRecoveryClassifier = NonNullable<RecoverJournalInput['classifyPublishRecovery']>;
type ResumeCommand = NonNullable<RecoverJournalInput['resumeCommand']>;
type RecoveredChain = Parameters<
  NonNullable<RecoverJournalInput['commandReceiptForRecoveredChain']>
>[0];

function publishReceiptForRecoveredChain(recovered: RecoveredChain) {
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-publish-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-publish-v1',
      ...publishSourceRelease,
      operationReceiptChainDigest: recovered.operationReceiptChainDigest,
      operationReceiptCount: recovered.operationReceiptCount,
    }),
  });
}

function resumePublishToExpectedAfter(resumed: { value: boolean }): ResumeCommand {
  return async recovery => {
    resumed.value = true;
    recovery.operationJournal.bindCommandPlan({
      beforeStatus: publishBeforeStatus,
      beforeAudit: publishBeforeAudit,
      terminalExpectedAfterPredicate: publishExpectedAfterPredicate(
        'fixture-publish-terminal-v1',
      ),
    });
    const operation = await recovery.operationJournal.prepare({
      operationKind: 'publish',
      operationName: 'publish',
      arguments: Object.freeze({ recovery: true }),
      identity: Object.freeze({
        moduleDeltaPolicy: 'reviewed-same-schema',
        artifactDigest: 'd'.repeat(64),
      }),
      beforeStatus: publishBeforeStatus,
      beforeAudit: publishBeforeAudit,
      expectedAfterPredicate: publishExpectedAfterPredicate(
        'fixture-publish-terminal-v1',
      ),
    });
    await operation.writePermit.markSubmissionUncertain!();
    operation.writePermit();
    await operation.reconcile({
      afterStatus: publishAfterStatus,
      afterAudit: publishAfterAudit,
      outcome: 'verified',
    });
    recovery.operationJournal.reconcileCommand({
      afterStatus: publishAfterStatus,
      afterAudit: publishAfterAudit,
    });
    return publishReceiptForRecoveredChain(Object.freeze({
      command: recovery.command,
      sourceRelease: recovery.sourceRelease,
      beforeStatus: publishBeforeStatus,
      beforeAudit: publishBeforeAudit,
      afterStatus: publishAfterStatus,
      afterAudit: publishAfterAudit,
      operations: Object.freeze([]),
      ...recovery.operationJournal.summary(),
      outcome: 'verified' as const,
    }));
  };
}

async function recoverPublishState(input: Readonly<{
  directory: string;
  now: number;
  observedStatus: unknown;
  observedAudit: unknown;
  classifyPublishRecovery?: PublishRecoveryClassifier;
  inspect?: RecoverJournalInput['inspect'];
  inspectCommand?: RecoverJournalInput['inspectCommand'];
  resumeCommand?: ResumeCommand;
  commandReceiptForRecoveredChain?: RecoverJournalInput['commandReceiptForRecoveredChain'];
}>) {
  const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
    directory: input.directory,
    repositoryRoot: process.cwd(),
    now: () => input.now,
  });
  return recoverGreaterRealmCutoverOperatorJournal({
    directory: input.directory,
    repositoryRoot: process.cwd(),
    confirmationDigest: inspection.confirmationDigest!,
    now: () => input.now,
    revalidateArtifact: () => undefined,
    cleanupArtifact: () => undefined,
    inspect: input.inspect ?? (async () => Object.freeze({
      status: input.observedStatus,
      audit: input.observedAudit,
    })),
    ...(input.classifyPublishRecovery === undefined
      ? {}
      : { classifyPublishRecovery: input.classifyPublishRecovery }),
    inspectCommand: input.inspectCommand ?? (async () => Object.freeze({
      status: input.observedStatus,
      audit: input.observedAudit,
    })),
    ...(input.resumeCommand === undefined ? {} : { resumeCommand: input.resumeCommand }),
    commandReceiptForRecoveredChain:
      input.commandReceiptForRecoveredChain ?? (async recovered => (
        publishReceiptForRecoveredChain(recovered)
      )),
  });
}

function finishOrRelease(directory: string, counterPath: string, now: number): void {
  const entries = readdirSync(directory);
  const hasLock = entries.includes('.greater-realm-cutover.lock');
  if (hasLock) {
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now,
    });
    if (inspection.recoveryMode === 'lock-only') {
      recoverGreaterRealmCutoverOperatorLock({
        directory,
        repositoryRoot: process.cwd(),
        now: () => now,
        confirmationDigest: inspection.confirmationDigest!,
      });
    } else {
      fixture({
        action: 'recover-import',
        directory,
        now,
        counterPath,
      });
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Greater Realm cutover operation journal crash recovery', () => {
  it.each([
    'before-recovery-owner-link',
    'after-recovery-owner-partial-write-before-fsync',
    'after-recovery-owner-fsync',
    'after-recovery-active-operation-reconciled',
    'after-recovery-command-resume-terminal-reconciled',
    'after-recovery-final-receipt-installed',
    'after-recovery-nonterminal-wal-removal',
    'after-recovery-owner-claims-removed',
    'after-recovery-terminal-command-group-removed',
    'after-recovery-terminal-command-authority-removed',
    'after-recovery-terminal-files-removed',
    'before-recovery-original-lock-unlink',
    'after-recovery-original-lock-unlink',
  ])('restarts exactly at %s without repeating an operation ordinal', crashStep => {
    const parent = temporaryDirectory(`warpkeep-gr-journal-${crashStep}-`);
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    // Keep every synthetic 24-hour claim in the past so a killed fixture can
    // be proven dead+expired immediately by the next fixture.
    const base = Date.now() - 100 * DAY_MS;
    fixture({ action: 'initial-import', directory, now: base, counterPath });
    fixture({
      action: 'recover-import',
      directory,
      now: base + DAY_MS,
      crashStep,
      counterPath,
    });
    finishOrRelease(directory, counterPath, base + 2 * DAY_MS);

    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory).filter(name => name.includes('cutover.lock'))).toEqual([]);
    expect(readdirSync(directory).filter(name => /^greater-realm-import-[0-9a-f]{64}\.json$/u.test(name)))
      .toHaveLength(1);
  }, 45_000);

  it('stops at an older operation-phase unlink failure and retries from a contiguous suffix', () => {
    const parent = temporaryDirectory('warpkeep-gr-operation-cleanup-failure-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    failingFixture({
      action: 'recover-import', directory, now,
      crashStep: 'fail-before-operation-1-phase-2-removal', counterPath,
    });
    expect(operationPhaseOrdinals(directory)).toEqual({
      1: [2, 3, 4],
      2: [1, 2, 3, 4],
    });
    expect(commandGroupOrdinals(directory)).toEqual([1, 2, 3, 4, 5]);
    fixture({ action: 'recover-import', directory, now, counterPath });
    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
  }, 45_000);

  it('stops at a middle command-group directory-fsync failure and retries from its exact ordinal suffix', () => {
    const parent = temporaryDirectory('warpkeep-gr-group-cleanup-failure-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    failingFixture({
      action: 'recover-import', directory, now,
      crashStep: 'fail-before-command-group-ordinal-3-directory-fsync', counterPath,
    });
    expect(operationPhaseOrdinals(directory)).toEqual({});
    expect(commandGroupOrdinals(directory)).toEqual([4, 5]);
    fixture({ action: 'recover-import', directory, now, counterPath });
    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
  }, 45_000);

  it('removes recovery-owner claims newest-first so every crash leaves a valid claim prefix', () => {
    const parent = temporaryDirectory('warpkeep-gr-owner-prefix-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    fixture({
      action: 'recover-import', directory, now,
      crashStep: 'after-recovery-owner-fsync', counterPath,
    });
    fixture({
      action: 'recover-import', directory, now,
      crashStep: 'after-recovery-owner-claim-2-removed', counterPath,
    });
    const ownerFiles = readdirSync(directory).filter(name => (
      name.includes('cutover-recovery-owner-') && name.endsWith('.json')
    ));
    expect(ownerFiles).toHaveLength(1);
    expect(ownerFiles[0]).toMatch(/-00000001\.json$/u);
    finishOrRelease(directory, counterPath, now);
    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it('admits exactly one of two concurrent recovery-owner claims', async () => {
    const parent = temporaryDirectory('warpkeep-gr-owner-concurrent-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const readyPath = `${counterPath}.claim-ready`;
    const releasePath = `${counterPath}.claim-release`;
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    const first = concurrentFixture({
      action: 'recover-import', directory, now,
      crashStep: 'concurrent-recovery-claim', counterPath,
    });
    const second = concurrentFixture({
      action: 'recover-import', directory, now,
      crashStep: 'concurrent-recovery-claim', counterPath,
    });
    const deadline = Date.now() + 10_000;
    while (operationNames(readyPath).length !== 2) {
      if (Date.now() >= deadline) throw new Error('JOURNAL_CONCURRENT_READY_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    writeFileSync(releasePath, 'release\n', { encoding: 'utf8', mode: 0o600 });
    const results = await Promise.all([first, second]);
    expect(results.map(result => result.signal)).toEqual([null, null]);
    expect(
      results.map(result => result.status).sort(),
      results.map(result => `${result.stdout}\n${result.stderr}`).join('\n---\n'),
    ).toEqual([0, 1]);
    expect(results.map(result => result.stderr).join('\n')).toMatch(
      /GREATER_REALM_CUTOVER_RECOVERY_OWNER_CAS_CONFLICT/u,
    );
    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
  }, 45_000);

  it('removes a partial initial-lock prelink temporary only after encoded owner death is exact', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-prelink-temp-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({
      action: 'initial-import',
      directory,
      now,
      crashStep: 'after-partial-lock-write-before-fsync',
      counterPath,
    });
    expect(readdirSync(directory).some(name => (
      /^\.greater-realm-cutover-[0-9a-f]{32}-[1-9][0-9]*-[0-9a-f]{64}\.lock\.tmp$/u
        .test(name)
    ))).toBe(true);
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => 'reacquired',
    })).resolves.toBe('reacquired');
    expect(readdirSync(directory).filter(name => name.includes('cutover'))).toEqual([]);
    expect(operationNames(counterPath)).toEqual([]);
  }, 45_000);

  it('inspects and confirms exact lock-only recovery through both operators without an admin secret or network target', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-only-operator-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    fixture({
      action: 'initial-lock-only',
      directory,
      now: Date.now(),
      counterPath,
    });
    const importInspection = await executeGreaterRealmProductionImportOperator({
      command: 'recover-inspect',
      confirmed: false,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    });
    const relocationInspection = await executeGreaterRealmProductionRelocationOperator({
      command: 'recover-inspect',
      confirmed: false,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    });
    expect(importInspection).toMatchObject({
      recoveryMode: 'lock-only',
      recoveryEligible: true,
      networkMode: 'read-only-local',
    });
    expect(relocationInspection).toMatchObject({
      recoveryMode: 'lock-only',
      confirmationDigest: importInspection.confirmationDigest,
      networkMode: 'read-only-local',
    });
    await expect(executeGreaterRealmProductionImportOperator({
      command: 'recover',
      confirmed: true,
      recoveryConfirmationDigest: importInspection.confirmationDigest as string,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    })).resolves.toMatchObject({
      recoveryMode: 'lock-only',
      outcome: 'cleared-dead-lock',
      networkMode: 'none',
    });
    expect(readdirSync(directory).filter(name => name.includes('cutover'))).toEqual([]);
  }, 45_000);

  it('inspects a durable import journal before any admin-secret or transport requirement', async () => {
    const parent = temporaryDirectory('warpkeep-gr-local-journal-inspect-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    await expect(executeGreaterRealmProductionImportOperator({
      command: 'recover-inspect',
      confirmed: false,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    })).resolves.toMatchObject({
      recoveryMode: 'journal',
      recoveryEligible: true,
      operationReceiptCount: 0,
      networkMode: 'read-only-local',
    });
    fixture({ action: 'recover-import', directory, now, counterPath });
  }, 45_000);

  it('finishes the exact command-receipt cleanup suffix locally without an admin secret', async () => {
    const parent = temporaryDirectory('warpkeep-gr-command-receipt-local-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-import', directory, now, counterPath });
    fixture({
      action: 'recover-import',
      directory,
      now,
      crashStep: 'after-recovery-terminal-command-group-removed',
      counterPath,
    });
    const inspection = await executeGreaterRealmProductionImportOperator({
      command: 'recover-inspect',
      confirmed: false,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    });
    expect(inspection).toMatchObject({
      recoveryMode: 'command-receipt',
      recoveryEligible: true,
      operationReceiptCount: 2,
      networkMode: 'read-only-local',
    });
    await expect(executeGreaterRealmProductionImportOperator({
      command: 'recover',
      confirmed: true,
      recoveryConfirmationDigest: inspection.confirmationDigest as string,
      environment: Object.freeze({}),
      receiptDirectory: directory,
    })).resolves.toMatchObject({
      recoveryMode: 'command-receipt',
      outcome: 'completed-idempotently',
      operationReceiptCount: 2,
      networkMode: 'none',
    });
    expect(operationNames(counterPath)).toEqual(['op-1', 'op-2']);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it.each([
    'after-command-started-partial-write-before-fsync',
    'after-command-started-temporary-fsync-before-link',
  ])('classifies and removes an exact dead-owner nlink1 started-group prelink temporary at %s', crashStep => {
    const parent = temporaryDirectory(`warpkeep-gr-journal-prelink-temp-${crashStep}-`);
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({
      action: 'initial-import',
      directory,
      now,
      crashStep,
      counterPath,
    });
    expect(readdirSync(directory).some(name => (
      name.includes('command-group-') && name.endsWith('.json.tmp')
    ))).toBe(true);
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now,
    });
    expect(inspection).toMatchObject({
      recoveryMode: 'lock-only',
      recoveryEligible: true,
    });
    recoverGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      confirmationDigest: inspection.confirmationDigest!,
      now: () => now,
    });
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
    expect(operationNames(counterPath)).toEqual([]);
    expect(() => recoverGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      confirmationDigest: inspection.confirmationDigest!,
      now: () => now,
    })).toThrow();
  }, 45_000);

  it('resumes artifact cleanup after receipt installation without repeating publish', () => {
    const parent = temporaryDirectory('warpkeep-gr-journal-artifact-cleanup-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const base = Date.now() - 100 * DAY_MS;
    fixture({ action: 'initial-publish', directory, now: base, counterPath });
    fixture({
      action: 'recover-publish',
      directory,
      now: base + DAY_MS,
      crashStep: 'after-recovery-artifact-cleanup',
      counterPath,
    });
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => base + 2 * DAY_MS,
    });
    fixture({
      action: 'recover-publish',
      directory,
      now: inspection.recoveryOwnerExpiresAtMs ?? base + 2 * DAY_MS,
      counterPath,
    });
    expect(operationNames(counterPath).filter(name => name === 'publish')).toEqual(['publish']);
    expect(operationNames(counterPath).filter(name => name === 'artifact-cleanup')).toHaveLength(2);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it('passes the complete immutable publisher operation chain to normal artifact cleanup before deletion', () => {
    const parent = temporaryDirectory('warpkeep-gr-normal-cleanup-context-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    fixture({
      action: 'normal-publish-cleanup-context',
      directory,
      now: Date.now(),
      counterPath,
    });

    const contexts = artifactCleanupContexts(counterPath);
    expect(contexts).toHaveLength(1);
    expectCompletePublisherCleanupContext(contexts[0]!, 'normal-complete');
    expect(operationNames(counterPath)).toEqual([
      'publish-1', 'publish-2', 'artifact-cleanup',
    ]);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
  }, 45_000);

  it('leaves every operation WAL phase intact when normal artifact cleanup throws', () => {
    const parent = temporaryDirectory('warpkeep-gr-normal-cleanup-failure-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const base = Date.now() - 100 * DAY_MS;
    fixture({
      action: 'initial-publish-cleanup-failure',
      directory,
      now: base,
      counterPath,
    });
    expect(operationPhaseOrdinals(directory)).toEqual({
      1: [1, 2, 3, 4],
      2: [1, 2, 3, 4],
    });
    expect(commandGroupOrdinals(directory)).toEqual([1, 2, 3, 4, 5]);
    expectCompletePublisherCleanupContext(
      artifactCleanupContexts(counterPath)[0]!,
      'normal-throw',
    );

    fixture({
      action: 'recover-publish',
      directory,
      now: base + DAY_MS,
      counterPath,
    });
    const contexts = artifactCleanupContexts(counterPath);
    expect(contexts).toHaveLength(2);
    expectCompletePublisherCleanupContext(contexts[1]!, 'recovered-cleanup-tail');
    expect(operationNames(counterPath)).toEqual([
      'publish-1', 'publish-2', 'artifact-cleanup',
    ]);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it('keeps the full publisher WAL retryable when recovered cleanup-tail callback fails', () => {
    const parent = temporaryDirectory('warpkeep-gr-recovered-cleanup-context-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const base = Date.now() - 100 * DAY_MS;
    fixture({
      action: 'initial-publish-cleanup-tail',
      directory,
      now: base,
      counterPath,
    });
    const beforeFailureWal = retainedCommandWalNames(directory);
    expect(operationPhaseOrdinals(directory)).toEqual({
      1: [1, 2, 3, 4],
      2: [1, 2, 3, 4],
    });
    expect(commandGroupOrdinals(directory)).toEqual([1, 2, 3, 4, 5]);
    expectCompletePublisherCleanupContext(
      artifactCleanupContexts(counterPath)[0]!,
      'normal-exit',
    );

    failingPublishRecoveryFixture({
      directory,
      now: base + DAY_MS,
      counterPath,
    });
    expect(retainedCommandWalNames(directory)).toEqual(beforeFailureWal);
    expect(operationPhaseOrdinals(directory)).toEqual({
      1: [1, 2, 3, 4],
      2: [1, 2, 3, 4],
    });
    expect(commandGroupOrdinals(directory)).toEqual([1, 2, 3, 4, 5]);
    const afterFailureContexts = artifactCleanupContexts(counterPath);
    expect(afterFailureContexts).toHaveLength(2);
    expectCompletePublisherCleanupContext(
      afterFailureContexts[1]!,
      'recovered-cleanup-tail',
    );

    fixture({
      action: 'recover-publish',
      directory,
      now: base + 2 * DAY_MS,
      crashStep: 'after-operation-1-phase-4-removal',
      counterPath,
    });
    expect(operationPhaseOrdinals(directory)).toEqual({
      2: [1, 2, 3, 4],
    });
    const prefixDeletedContexts = artifactCleanupContexts(counterPath);
    expect(prefixDeletedContexts).toHaveLength(3);
    expectCompletePublisherCleanupContext(
      prefixDeletedContexts[2]!,
      'recovered-cleanup-tail',
    );

    fixture({
      action: 'recover-publish',
      directory,
      now: base + 3 * DAY_MS,
      counterPath,
    });
    const completedContexts = artifactCleanupContexts(counterPath);
    expect(completedContexts).toHaveLength(4);
    expectCompletePublisherCleanupContext(
      completedContexts[3]!,
      'recovered-cleanup-tail',
      4,
    );
    expect(operationNames(counterPath)).toEqual([
      'publish-1', 'publish-2', 'artifact-cleanup', 'artifact-cleanup',
    ]);
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory)).not.toContain('.greater-realm-cutover.lock');
  }, 45_000);

  it.each(['missing', 'invalid'] as const)(
    'rejects a %s late secret before command WAL or network work and releases the lock',
    async kind => {
      const parent = temporaryDirectory(`warpkeep-gr-journal-secret-${kind}-`);
      const directory = join(parent, 'receipts');
      const secretPath = join(parent, 'admin-secret');
      if (kind === 'invalid') {
        writeFileSync(secretPath, 'short\n', { mode: 0o600 });
        chmodSync(secretPath, 0o600);
      }
      const network = vi.fn();
      await expect(withGreaterRealmCutoverOperatorLock({
        directory,
        repositoryRoot: process.cwd(),
        operation: async () => {
          readGreaterRealmProductionAdminSecretFile(secretPath);
          network();
        },
      })).rejects.toThrow(/ADMIN_SECRET_FILE_INVALID|ADMIN_SECRET_LENGTH_INVALID|ENOENT/);
      expect(network).not.toHaveBeenCalled();
      expect(journalFiles(directory)).toEqual([]);
      expect(readdirSync(directory).filter(name => name.includes('cutover.lock'))).toEqual([]);
    },
  );

  it('removes only an unused recovery claim after a late credential typo', async () => {
    const parent = temporaryDirectory('warpkeep-gr-journal-recovery-secret-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const base = Date.now() - 100 * DAY_MS;
    fixture({ action: 'initial-import', directory, now: base, counterPath });
    const before = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => base + DAY_MS,
    });
    const remoteInspect = vi.fn(async () => ({ status: {}, audit: {} }));
    await expect(recoverGreaterRealmCutoverOperatorJournal({
      directory,
      repositoryRoot: process.cwd(),
      confirmationDigest: before.confirmationDigest!,
      now: () => base + DAY_MS,
      prepareRecovery: () => { readGreaterRealmProductionAdminSecretFile(join(parent, 'missing')); },
      inspect: remoteInspect,
    })).rejects.toThrow(/ADMIN_SECRET_FILE_INVALID|ENOENT/);
    expect(remoteInspect).not.toHaveBeenCalled();
    const after = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => base + DAY_MS,
    });
    expect(after).toMatchObject({
      recoveryEligible: true,
      recoveryOwnerState: 'none',
      confirmationDigest: before.confirmationDigest,
    });
    expect(operationNames(counterPath)).toEqual(['op-1']);
  });

  it('clears a reviewed-same-schema publish only from definitive-zero exact-before and resumes it', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-definite-zero-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });
    const inspect = vi.fn(async () => Object.freeze({
      status: publishBeforeStatus,
      audit: publishBeforeAudit,
    }));
    let classifierObservedWal = false;
    const classifyPublishRecovery = vi.fn(async ({ record, directory: journalDirectory }) => {
      expect(record.operation.identity.moduleDeltaPolicy).toBe('reviewed-same-schema');
      expect(readdirSync(journalDirectory).filter(name => (
        name.includes(`cutover-operation-${record.journalId}-`)
      ))).toHaveLength(2);
      classifierObservedWal = true;
      return 'definitive-zero' as const;
    });
    const resumed = { value: false };

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishBeforeStatus,
      observedAudit: publishBeforeAudit,
      inspect,
      classifyPublishRecovery,
      inspectCommand: async record => {
        expect(record.operationReceiptCount).toBe(0);
        return Object.freeze({ status: publishBeforeStatus, audit: publishBeforeAudit });
      },
      resumeCommand: resumePublishToExpectedAfter(resumed),
    })).resolves.toMatchObject({
      recovery: {
        outcome: 'completed-idempotently',
        operationReceiptCount: 1,
      },
    });

    expect(inspect).toHaveBeenCalledTimes(1);
    expect(classifyPublishRecovery).toHaveBeenCalledTimes(1);
    expect(classifierObservedWal).toBe(true);
    expect(resumed.value).toBe(true);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it.each([
    ['absent', undefined, 0],
    ['false', (async () => false) as unknown as PublishRecoveryClassifier, 1],
  ] as const)('refuses reviewed-same-schema exact-before when its publish classifier is %s', async (
    _kind,
    classifyPublishRecovery,
    expectedInspectCount,
  ) => {
    const parent = temporaryDirectory('warpkeep-gr-publish-classifier-refusal-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });
    const inspect = vi.fn(async () => Object.freeze({
      status: publishBeforeStatus,
      audit: publishBeforeAudit,
    }));

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishBeforeStatus,
      observedAudit: publishBeforeAudit,
      inspect,
      ...(classifyPublishRecovery === undefined ? {} : { classifyPublishRecovery }),
    })).rejects.toThrow(/PUBLISH_RECOVERY_CLASSIFIER_REQUIRED|PUBLISH_RECOVERY_CLASSIFICATION_INVALID/u);
    expect(inspect).toHaveBeenCalledTimes(expectedInspectCount);
    expect(readdirSync(directory).some(name => /^greater-realm-publish-[0-9a-f]{64}\.json$/u.test(name)))
      .toBe(false);
  }, 45_000);

  it('rejects expected-after as concurrent drift when the publish supervisor proves definitive zero', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-zero-drift-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });
    const inspect = vi.fn(async () => Object.freeze({
      status: publishAfterStatus,
      audit: publishAfterAudit,
    }));
    const classifyPublishRecovery = vi.fn(async () => 'definitive-zero' as const);
    const commandReceiptForRecoveredChain = vi.fn(async recovered => (
      publishReceiptForRecoveredChain(recovered)
    ));

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishAfterStatus,
      observedAudit: publishAfterAudit,
      inspect,
      classifyPublishRecovery,
      commandReceiptForRecoveredChain,
    })).rejects.toThrow(/PUBLISH_RECOVERY_CONCURRENT_DRIFT/u);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(classifyPublishRecovery).toHaveBeenCalledTimes(1);
    expect(commandReceiptForRecoveredChain).not.toHaveBeenCalled();
    expect(readdirSync(directory).some(name => /^greater-realm-operation-[0-9a-f]{64}\.json$/u.test(name)))
      .toBe(false);
  }, 45_000);

  it('reconciles gate-consumed expected-after and preserves count-positive terminal recovery', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-gate-consumed-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });
    const inspect = vi.fn(async () => Object.freeze({
      status: publishAfterStatus,
      audit: publishAfterAudit,
    }));
    const classifyPublishRecovery = vi.fn(async () => 'gate-consumed' as const);
    const inspectCommand = vi.fn(async record => {
      expect(record.operationReceiptCount).toBe(1);
      return Object.freeze({ status: publishAfterStatus, audit: publishAfterAudit });
    });
    const resumed = vi.fn();

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishAfterStatus,
      observedAudit: publishAfterAudit,
      inspect,
      classifyPublishRecovery,
      inspectCommand,
      resumeCommand: resumed as unknown as ResumeCommand,
    })).resolves.toMatchObject({
      recovery: {
        outcome: 'recovered-after-write',
        operationReceiptCount: 1,
      },
    });
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(classifyPublishRecovery).toHaveBeenCalledTimes(1);
    expect(inspectCommand).toHaveBeenCalledTimes(1);
    expect(resumed).not.toHaveBeenCalled();
    expect(journalFiles(directory)).toEqual([]);
    expect(readdirSync(directory).filter(name => /^greater-realm-publish-[0-9a-f]{64}\.json$/u.test(name)))
      .toHaveLength(1);
  }, 45_000);

  it('keeps gate-consumed exact-before as manual publish ambiguity', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-gate-before-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishBeforeStatus,
      observedAudit: publishBeforeAudit,
      classifyPublishRecovery: async () => 'gate-consumed',
    })).rejects.toThrow(/PUBLISH_SURVIVOR_PROOF_REQUIRED/u);
    expect(readdirSync(directory).some(name => /^greater-realm-publish-[0-9a-f]{64}\.json$/u.test(name)))
      .toBe(false);
  }, 45_000);

  it('rejects gate-consumed nonterminal drift without installing a receipt', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-gate-drift-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: Object.freeze({ step: 9 }),
      observedAudit: Object.freeze({ rows: 9 }),
      classifyPublishRecovery: async () => 'gate-consumed',
    })).rejects.toThrow(/JOURNAL_RECOVERY_STATE_MISMATCH/u);
    expect(readdirSync(directory).some(name => /^greater-realm-operation-[0-9a-f]{64}\.json$/u.test(name)))
      .toBe(false);
  }, 45_000);

  it('propagates a live publisher classifier refusal after exactly one observation', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-live-refusal-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-same-schema', directory, now, counterPath });
    const inspect = vi.fn(async () => Object.freeze({
      status: publishAfterStatus,
      audit: publishAfterAudit,
    }));
    const classifyPublishRecovery = vi.fn(async () => {
      throw new Error('PUBLISH_SUPERVISOR_LIVE');
    });

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishAfterStatus,
      observedAudit: publishAfterAudit,
      inspect,
      classifyPublishRecovery,
    })).rejects.toThrow('PUBLISH_SUPERVISOR_LIVE');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(classifyPublishRecovery).toHaveBeenCalledTimes(1);
  }, 45_000);

  it('rejects terminal-looking command drift when no operation receipt can attribute it', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-count-zero-drift-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-plan-only', directory, now, counterPath });
    const inspect = vi.fn();
    const resumeCommand = vi.fn();

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishAfterStatus,
      observedAudit: publishAfterAudit,
      inspect,
      inspectCommand: async record => {
        expect(record.operationReceiptCount).toBe(0);
        return Object.freeze({ status: publishAfterStatus, audit: publishAfterAudit });
      },
      resumeCommand: resumeCommand as unknown as ResumeCommand,
    })).rejects.toThrow(/COMMAND_ZERO_RECEIPT_CONCURRENT_DRIFT/u);
    expect(inspect).not.toHaveBeenCalled();
    expect(resumeCommand).not.toHaveBeenCalled();
  }, 45_000);

  it('resumes same-schema command recovery from exact-before when operation receipt count is zero', async () => {
    const parent = temporaryDirectory('warpkeep-gr-publish-count-zero-before-');
    const directory = join(parent, 'receipts');
    const counterPath = join(parent, 'remote-operations.txt');
    const now = Date.now();
    fixture({ action: 'initial-publish-plan-only', directory, now, counterPath });
    const resumed = { value: false };

    await expect(recoverPublishState({
      directory,
      now,
      observedStatus: publishBeforeStatus,
      observedAudit: publishBeforeAudit,
      inspectCommand: async record => {
        expect(record.operationReceiptCount).toBe(0);
        expect(record.command.kind).toBe('publish');
        return Object.freeze({ status: publishBeforeStatus, audit: publishBeforeAudit });
      },
      resumeCommand: resumePublishToExpectedAfter(resumed),
    })).resolves.toMatchObject({
      recovery: { operationReceiptCount: 1 },
    });
    expect(resumed.value).toBe(true);
    expect(journalFiles(directory)).toEqual([]);
  }, 45_000);

  it('freezes inspect and confirmed recovery CLI argument semantics', () => {
    const digest = 'a'.repeat(64);
    expect(parseGreaterRealmProductionImportArguments(['recover-inspect']))
      .toEqual({ command: 'recover-inspect', confirmed: false });
    expect(parseGreaterRealmProductionImportArguments([
      'recover', `--confirm-recovery=${digest}`,
    ])).toEqual({ command: 'recover', confirmed: true, recoveryConfirmationDigest: digest });
    expect(parseGreaterRealmProductionRelocationArguments(['recover-inspect']))
      .toEqual({ command: 'recover-inspect', confirmed: false });
    expect(parseGreaterRealmProductionRelocationArguments([
      'recover', `--confirm-recovery=${digest}`,
    ])).toEqual({ command: 'recover', confirmed: true, recoveryConfirmationDigest: digest });
    expect(() => parseGreaterRealmProductionImportArguments(['recover']))
      .toThrow(/PRODUCTION_IMPORT_USAGE/);
    expect(() => parseGreaterRealmProductionRelocationArguments(['recover']))
      .toThrow(/PRODUCTION_RELOCATION_USAGE/);
  });
});
