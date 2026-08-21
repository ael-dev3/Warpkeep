import {
  appendFileSync,
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  createGreaterRealmCutoverExpectedAfterPredicate,
  createGreaterRealmCutoverOperationJournalChain,
  type GreaterRealmCutoverOperationJournalChain,
  type GreaterRealmImmutableArtifactCleanupContext,
  type GreaterRealmImmutableArtifactRetentionRecord,
} from '../../scripts/greater-realm-cutover-operation-journal';
import {
  GREATER_REALM_CUTOVER_RECEIPT_TARGET,
  inspectGreaterRealmCutoverOperatorJournalRecovery,
  recoverGreaterRealmCutoverOperatorJournal,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from '../../scripts/greater-realm-cutover-receipts';

const [action, directory, repositoryRoot, nowText, crashStep, counterPath] = process.argv.slice(2);
if (
  action === undefined || directory === undefined || repositoryRoot === undefined
  || nowText === undefined || counterPath === undefined
) throw new Error('JOURNAL_CRASH_FIXTURE_USAGE');
const now = Number(nowText);
if (!Number.isSafeInteger(now)) throw new Error('JOURNAL_CRASH_FIXTURE_TIME_INVALID');

const sourceRelease = Object.freeze({
  atlasSourceCommit: 'a'.repeat(40),
  moduleSourceCommit: 'b'.repeat(40),
  atlasId: 'atlas-test',
  publicReleaseId: 'release-test',
  expectedReleaseSha256: 'c'.repeat(64),
});
const command = Object.freeze({ kind: 'import' as const, name: 'apply' });
const before0 = Object.freeze({ step: 0 });
const audit0 = Object.freeze({ rows: 0 });
const after1 = Object.freeze({ step: 1 });
const audit1 = Object.freeze({ rows: 1 });
const after2 = Object.freeze({ step: 2 });
const audit2 = Object.freeze({ rows: 2 });

function predicate(contract: string, step: number, rows: number) {
  return createGreaterRealmCutoverExpectedAfterPredicate({
    moduleSourceCommit: sourceRelease.moduleSourceCommit,
    contract,
    statusRules: Object.freeze({ step: Object.freeze({ rule: 'equals' as const, value: step }) }),
    auditRules: Object.freeze({ rows: Object.freeze({ rule: 'equals' as const, value: rows }) }),
  });
}

const terminalPredicate = predicate('fixture-command-terminal-v1', 2, 2);

function appendOperation(name: string): void {
  appendFileSync(counterPath!, `${name}\n`, { encoding: 'utf8', mode: 0o600 });
}

function recordArtifactCleanupContext(
  label: string,
  record: GreaterRealmImmutableArtifactRetentionRecord,
  context: GreaterRealmImmutableArtifactCleanupContext,
): void {
  const operationWalNames = readdirSync(directory!).filter(name => (
    name.includes('cutover-operation-') && name.endsWith('.json')
  )).sort();
  appendFileSync(`${counterPath}.cleanup-context.jsonl`, `${JSON.stringify({
    label,
    record,
    context,
    operationWalNames,
    immutable: Object.isFrozen(context)
      && Object.isFrozen(context.command)
      && Object.isFrozen(context.sourceRelease)
      && Object.isFrozen(context.operations)
      && context.operations.every(operation => (
        Object.isFrozen(operation)
        && Object.isFrozen(operation.operation)
        && Object.isFrozen(operation.operation.identity)
        && Object.isFrozen(operation.operation.identity.publishSupervisorIdentity)
      )),
  })}\n`, { encoding: 'utf8', mode: 0o600 });
}

function submitted(name: string): boolean {
  return existsSync(counterPath!) && readFileSync(counterPath!, 'utf8').split('\n').includes(name);
}

function linkedPublicationPair(): Readonly<{
  temporaryPath: string;
  destinationPath: string;
  dev: number;
  ino: number;
}> {
  const linked = readdirSync(directory!).map(name => Object.freeze({
    name,
    path: join(directory!, name),
    status: lstatSync(join(directory!, name)),
  })).filter(entry => entry.status.nlink === 2);
  const temporary = linked.filter(entry => entry.name.endsWith('.tmp'));
  if (temporary.length !== 1) throw new Error('JOURNAL_LINKED_PUBLICATION_TEMPORARY_INVALID');
  const destination = linked.filter(entry => (
    entry.path !== temporary[0]!.path
    && entry.status.dev === temporary[0]!.status.dev
    && entry.status.ino === temporary[0]!.status.ino
  ));
  if (destination.length !== 1) {
    throw new Error('JOURNAL_LINKED_PUBLICATION_DESTINATION_INVALID');
  }
  return Object.freeze({
    temporaryPath: temporary[0]!.path,
    destinationPath: destination[0]!.path,
    dev: temporary[0]!.status.dev,
    ino: temporary[0]!.status.ino,
  });
}

function exerciseLinkedImmutablePublication(step: string): void {
  if (crashStep === `repair-${step}`) {
    const linked = linkedPublicationPair();
    const repairReceipt = writePrivateGreaterRealmCutoverReceipt({
      directory: directory!,
      repositoryRoot: repositoryRoot!,
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      record: Object.freeze({
        outcome: 'verified',
        artifactDigest: 'f'.repeat(64),
        linkedPublicationRepairStep: step,
      }),
      now: new Date(now),
    });
    if (repairReceipt.result !== 'installed' || existsSync(linked.temporaryPath)) {
      throw new Error('JOURNAL_LINKED_PUBLICATION_REPAIR_FAILED');
    }
    const repaired = lstatSync(linked.destinationPath);
    if (
      repaired.dev !== linked.dev || repaired.ino !== linked.ino || repaired.nlink !== 1
    ) throw new Error('JOURNAL_LINKED_PUBLICATION_REPAIR_INVALID');
    appendFileSync(`${counterPath}.linked-publication-repaired`, `${step}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    return;
  }
  const tamperPrefix = `tamper-${step}-`;
  if (!crashStep?.startsWith(tamperPrefix)) return;
  const mismatch = crashStep.slice(tamperPrefix.length);
  if (!['inode', 'body', 'mode', 'nlink'].includes(mismatch)) {
    throw new Error('JOURNAL_LINKED_PUBLICATION_TAMPER_INVALID');
  }
  const linked = linkedPublicationPair();
  const body = readFileSync(linked.destinationPath);
  unlinkSync(linked.temporaryPath);
  if (mismatch === 'inode') {
    const replacement = `${counterPath}.wrong-inode-replacement.json`;
    writeFileSync(replacement, body, { mode: 0o600 });
    unlinkSync(linked.destinationPath);
    renameSync(replacement, linked.destinationPath);
  } else if (mismatch === 'body') {
    writeFileSync(linked.destinationPath, '{"wrong":true}\n', { encoding: 'utf8' });
  } else if (mismatch === 'mode') {
    chmodSync(linked.destinationPath, 0o640);
  } else {
    linkSync(linked.destinationPath, `${counterPath}.wrong-nlink`);
  }
}

function injectStep(step: string): void {
  if (
    step === 'after-command-started-linked-publication-fsync'
    || step === 'after-prepared-linked-publication-fsync'
  ) exerciseLinkedImmutablePublication(step);
  if (
    crashStep === 'concurrent-recovery-claim-before-link'
    && step === 'before-recovery-owner-link'
  ) {
    appendFileSync(`${counterPath}.claim-ready`, `${process.pid}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    const deadline = Date.now() + 10_000;
    while (!existsSync(`${counterPath}.claim-release`)) {
      if (Date.now() >= deadline) {
        throw new Error('JOURNAL_CONCURRENT_CLAIM_BARRIER_TIMEOUT');
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (
    (crashStep === 'concurrent-recovery-claim-before-link'
      || crashStep === 'concurrent-linked-recovery-owner-publication')
    && step === 'after-recovery-owner-fsync'
  ) {
    appendFileSync(`${counterPath}.claim-linked-ready`, `${process.pid}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    const deadline = Date.now() + 10_000;
    while (!existsSync(`${counterPath}.claim-finish-release`)) {
      if (Date.now() >= deadline) {
        throw new Error('JOURNAL_CONCURRENT_CLAIM_FINISH_BARRIER_TIMEOUT');
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (step === crashStep) process.exit(0);
  if (`fail-${step}` === crashStep) {
    throw new Error(`JOURNAL_INJECTED_CLEANUP_FAILURE:${step}`);
  }
}

function receiptFor(chain: GreaterRealmCutoverOperationJournalChain) {
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-import-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-import-v1',
      ...sourceRelease,
      ...chain.summary(),
    }),
  });
}

function publishReceiptFor(chain: GreaterRealmCutoverOperationJournalChain) {
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-publish-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-publish-v1',
      ...sourceRelease,
      ...chain.summary(),
    }),
  });
}

async function installInitialImport(): Promise<never> {
  await withGreaterRealmCutoverOperatorLock({
    directory: directory!,
    repositoryRoot: repositoryRoot!,
    now: () => now,
    testOnlyStep: injectStep,
    operation: async control => {
      const chain = createGreaterRealmCutoverOperationJournalChain({
        directory: directory!,
        repositoryRoot: repositoryRoot!,
        control,
        command,
        target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
        sourceRelease,
        now: () => now,
        testOnlyStep: injectStep,
      });
      chain.bindCommandPlan({
        beforeStatus: before0,
        beforeAudit: audit0,
        terminalExpectedAfterPredicate: terminalPredicate,
      });
      const operation = await chain.prepare({
        operationKind: 'reducer',
        operationName: 'fixture-op-1',
        arguments: Object.freeze({ batch: 1 }),
        identity: Object.freeze({ reducer: 'fixture-op-1' }),
        beforeStatus: before0,
        beforeAudit: audit0,
        expectedAfterPredicate: predicate('fixture-op-1-v1', 1, 1),
      });
      await operation.writePermit.markSubmissionUncertain!();
      operation.writePermit();
      appendOperation('op-1');
      process.exit(0);
    },
  });
  throw new Error('JOURNAL_CRASH_FIXTURE_DID_NOT_EXIT');
}

async function installCompletedImport(): Promise<void> {
  await withGreaterRealmCutoverOperatorLock({
    directory: directory!,
    repositoryRoot: repositoryRoot!,
    now: () => now,
    testOnlyStep: injectStep,
    operation: async control => {
      const chain = createGreaterRealmCutoverOperationJournalChain({
        directory: directory!,
        repositoryRoot: repositoryRoot!,
        control,
        command,
        target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
        sourceRelease,
        now: () => now,
        testOnlyStep: injectStep,
      });
      const oneOperationTerminal = predicate('fixture-command-one-operation-v1', 1, 1);
      chain.bindCommandPlan({
        beforeStatus: before0,
        beforeAudit: audit0,
        terminalExpectedAfterPredicate: oneOperationTerminal,
      });
      const operation = await chain.prepare({
        operationKind: 'reducer',
        operationName: 'fixture-op-1',
        arguments: Object.freeze({ batch: 1 }),
        identity: Object.freeze({ reducer: 'fixture-op-1' }),
        beforeStatus: before0,
        beforeAudit: audit0,
        expectedAfterPredicate: oneOperationTerminal,
      });
      await operation.writePermit.markSubmissionUncertain!();
      operation.writePermit();
      appendOperation('op-1');
      await operation.reconcile({
        afterStatus: after1,
        afterAudit: audit1,
        outcome: 'verified',
      });
      chain.reconcileCommand({ afterStatus: after1, afterAudit: audit1 });
      const receipt = receiptFor(chain);
      const prepared = chain.prepareCommandReceipt(receipt);
      const installed = writePrivateGreaterRealmCutoverReceipt({
        directory: directory!,
        repositoryRoot: repositoryRoot!,
        kind: receipt.kind,
        record: receipt.record,
        now: new Date(now),
      });
      if (
        installed.receiptDigest !== prepared.receiptDigest
        || !installed.path.endsWith(prepared.receiptBasename)
      ) throw new Error('JOURNAL_COMPLETED_IMPORT_RECEIPT_INVALID');
      chain.completeCommandReceipt({
        path: installed.path,
        receiptDigest: installed.receiptDigest,
      });
    },
  });
}

async function installInitialLockOnly(): Promise<never> {
  await withGreaterRealmCutoverOperatorLock({
    directory: directory!,
    repositoryRoot: repositoryRoot!,
    now: () => now,
    operation: async () => { process.exit(0); },
  });
  throw new Error('JOURNAL_CRASH_FIXTURE_DID_NOT_EXIT');
}

async function recoverImport(): Promise<void> {
  const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
    directory: directory!,
    repositoryRoot: repositoryRoot!,
    now: () => now,
  });
  if (crashStep === 'concurrent-recovery-claim') {
    appendFileSync(`${counterPath}.claim-ready`, `${process.pid}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    const deadline = Date.now() + 10_000;
    while (!existsSync(`${counterPath}.claim-release`)) {
      if (Date.now() >= deadline) throw new Error('JOURNAL_CONCURRENT_CLAIM_BARRIER_TIMEOUT');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  await recoverGreaterRealmCutoverOperatorJournal({
    directory: directory!,
    repositoryRoot: repositoryRoot!,
    confirmationDigest: inspection.confirmationDigest!,
    now: () => now,
    testOnlyStep: injectStep,
    inspect: async record => record.operation.name === 'fixture-op-1'
      ? Object.freeze({ status: after1, audit: audit1 })
      : Object.freeze({ status: after2, audit: audit2 }),
    inspectCommand: async () => submitted('op-2')
      ? Object.freeze({ status: after2, audit: audit2 })
      : Object.freeze({ status: after1, audit: audit1 }),
    resumeCommand: async recovery => {
      recovery.operationJournal.bindCommandPlan({
        beforeStatus: before0,
        beforeAudit: audit0,
        terminalExpectedAfterPredicate: terminalPredicate,
      });
      const operation = await recovery.operationJournal.prepare({
        operationKind: 'reducer',
        operationName: 'fixture-op-2',
        arguments: Object.freeze({ batch: 2 }),
        identity: Object.freeze({ reducer: 'fixture-op-2' }),
        beforeStatus: after1,
        beforeAudit: audit1,
        expectedAfterPredicate: predicate('fixture-op-2-v1', 2, 2),
      });
      await operation.writePermit.markSubmissionUncertain!();
      operation.writePermit();
      appendOperation('op-2');
      await operation.reconcile({
        afterStatus: after2,
        afterAudit: audit2,
        outcome: 'verified',
      });
      recovery.operationJournal.reconcileCommand({ afterStatus: after2, afterAudit: audit2 });
      return receiptFor(recovery.operationJournal);
    },
    commandReceiptForRecoveredChain: async recovered => {
      if (
        JSON.stringify(recovered.beforeStatus) !== JSON.stringify(before0)
        || JSON.stringify(recovered.beforeAudit) !== JSON.stringify(audit0)
        || JSON.stringify(recovered.afterStatus) !== JSON.stringify(after2)
        || JSON.stringify(recovered.afterAudit) !== JSON.stringify(audit2)
        || recovered.operations.length !== 2
        || recovered.operations.some((operation, index) => (
          operation.operationOrdinal !== index + 1
          || operation.operation.name !== `fixture-op-${index + 1}`
          || operation.completionReceiptDigest.length !== 64
        ))
      ) throw new Error('JOURNAL_RECOVERED_CHAIN_CONTEXT_INVALID');
      return Object.freeze({
        kind: 'warpkeep-greater-realm-production-import-v1' as const,
        record: Object.freeze({
          schemaVersion: 1,
          kind: 'warpkeep-greater-realm-production-import-v1',
          ...sourceRelease,
          operationReceiptChainDigest: recovered.operationReceiptChainDigest,
          operationReceiptCount: recovered.operationReceiptCount,
        }),
      });
    },
  });
}

const retentionRecord: GreaterRealmImmutableArtifactRetentionRecord = Object.freeze({
  schemaVersion: 1,
  profile: 'warpkeep-greater-realm-immutable-artifact-v1',
  materializationRoot: `${directory}/fixture-materialization`,
  artifactPath: `${directory}/fixture-materialization/spacetimedb/dist/bundle.js`,
  artifactDigest: 'd'.repeat(64),
  moduleSourceCommit: sourceRelease.moduleSourceCommit,
  moduleTreeId: 'e'.repeat(40),
  dependencyClosureDigest: 'f'.repeat(64),
  materializationDev: '1',
  materializationIno: '2',
  artifactDev: '1',
  artifactIno: '3',
  artifactMode: '600',
  artifactUid: String(process.getuid?.() ?? 0),
  artifactNlink: '1',
  artifactSize: '4',
  artifactMtimeNs: '5',
  artifactCtimeNs: '6',
});

async function installInitialPublish(
  mode: 'compile-changing' | 'reviewed-same-schema' | 'plan-only',
): Promise<never> {
  await withGreaterRealmCutoverOperatorLock({
    directory: directory!, repositoryRoot: repositoryRoot!, now: () => now,
    operation: async control => {
      const chain = createGreaterRealmCutoverOperationJournalChain({
        directory: directory!, repositoryRoot: repositoryRoot!, control,
        command: Object.freeze({ kind: 'publish', name: 'publish' }),
        target: GREATER_REALM_CUTOVER_RECEIPT_TARGET, sourceRelease,
        artifactRetentionRecord: retentionRecord, now: () => now,
      });
      const terminal = predicate('fixture-publish-terminal-v1', 1, 1);
      chain.bindCommandPlan({
        beforeStatus: before0, beforeAudit: audit0,
        terminalExpectedAfterPredicate: terminal,
      });
      if (mode === 'plan-only') process.exit(0);
      const operation = await chain.prepare({
        operationKind: 'publish', operationName: 'publish', arguments: Object.freeze({}),
        identity: Object.freeze({
          moduleDeltaPolicy: mode,
          artifactDigest: retentionRecord.artifactDigest,
        }),
        beforeStatus: before0, beforeAudit: audit0,
        expectedAfterPredicate: terminal,
      });
      await operation.writePermit.markSubmissionUncertain!();
      operation.writePermit();
      appendOperation('publish');
      process.exit(0);
    },
  });
  throw new Error('JOURNAL_CRASH_FIXTURE_DID_NOT_EXIT');
}

async function installCompletedPublish(
  cleanupMode: 'complete' | 'exit' | 'throw',
): Promise<void> {
  try {
    await withGreaterRealmCutoverOperatorLock({
      directory: directory!, repositoryRoot: repositoryRoot!, now: () => now,
      operation: async control => {
        const chain = createGreaterRealmCutoverOperationJournalChain({
          directory: directory!, repositoryRoot: repositoryRoot!, control,
          command: Object.freeze({ kind: 'publish', name: 'publish' }),
          target: GREATER_REALM_CUTOVER_RECEIPT_TARGET, sourceRelease,
          artifactRetentionRecord: retentionRecord, now: () => now,
        });
        chain.bindCommandPlan({
          beforeStatus: before0,
          beforeAudit: audit0,
          terminalExpectedAfterPredicate: terminalPredicate,
        });
        const states = [
          Object.freeze({
            beforeStatus: before0, beforeAudit: audit0,
            afterStatus: after1, afterAudit: audit1,
          }),
          Object.freeze({
            beforeStatus: after1, beforeAudit: audit1,
            afterStatus: after2, afterAudit: audit2,
          }),
        ] as const;
        for (let index = 0; index < states.length; index += 1) {
          const ordinal = index + 1;
          const state = states[index]!;
          const operation = await chain.prepare({
            operationKind: 'publish',
            operationName: `publish-${ordinal}`,
            arguments: Object.freeze({ ordinal }),
            identity: Object.freeze({
              moduleDeltaPolicy: 'reviewed-same-schema',
              artifactDigest: retentionRecord.artifactDigest,
              publishSupervisorIdentity: Object.freeze({
                schemaVersion: 1,
                profile: 'fixture-publish-supervisor-v1',
                supervisorId: `fixture-supervisor-${ordinal}`,
              }),
            }),
            beforeStatus: state.beforeStatus,
            beforeAudit: state.beforeAudit,
            expectedAfterPredicate: predicate(
              `fixture-publish-${ordinal}-v1`, ordinal, ordinal,
            ),
          });
          await operation.writePermit.markSubmissionUncertain!();
          operation.writePermit();
          appendOperation(`publish-${ordinal}`);
          await operation.reconcile({
            afterStatus: state.afterStatus,
            afterAudit: state.afterAudit,
            outcome: 'verified',
          });
        }
        chain.reconcileCommand({ afterStatus: after2, afterAudit: audit2 });
        const receipt = publishReceiptFor(chain);
        const prepared = chain.prepareCommandReceipt(receipt);
        const installed = writePrivateGreaterRealmCutoverReceipt({
          directory: directory!,
          repositoryRoot: repositoryRoot!,
          kind: receipt.kind,
          record: receipt.record,
          now: new Date(now),
        });
        if (
          installed.receiptDigest !== prepared.receiptDigest
          || !installed.path.endsWith(prepared.receiptBasename)
        ) throw new Error('JOURNAL_PUBLISH_RECEIPT_FIXTURE_INVALID');
        chain.completeCommandReceipt({
          path: installed.path,
          receiptDigest: installed.receiptDigest,
          cleanupArtifact: (record, context) => {
            recordArtifactCleanupContext(`normal-${cleanupMode}`, record, context);
            if (cleanupMode === 'exit') process.exit(0);
            if (cleanupMode === 'throw') {
              throw new Error('JOURNAL_ARTIFACT_CLEANUP_CALLBACK_FAILURE');
            }
            appendOperation('artifact-cleanup');
          },
        });
      },
    });
  } catch (error) {
    if (
      cleanupMode === 'throw'
      && error instanceof Error
      && error.message === 'JOURNAL_ARTIFACT_CLEANUP_CALLBACK_FAILURE'
    ) return;
    throw error;
  }
}

async function recoverPublish(): Promise<void> {
  const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
    directory: directory!, repositoryRoot: repositoryRoot!, now: () => now,
  });
  await recoverGreaterRealmCutoverOperatorJournal({
    directory: directory!, repositoryRoot: repositoryRoot!,
    confirmationDigest: inspection.confirmationDigest!, now: () => now,
    testOnlyStep: injectStep,
    revalidateArtifact: () => undefined,
    cleanupArtifact: (record, context) => {
      recordArtifactCleanupContext('recovered-cleanup-tail', record, context);
      if (crashStep === 'throw-publish-artifact-cleanup-callback') {
        throw new Error('JOURNAL_ARTIFACT_CLEANUP_CALLBACK_FAILURE');
      }
      appendOperation('artifact-cleanup');
    },
    inspect: async () => Object.freeze({ status: after1, audit: audit1 }),
    classifyPublishRecovery: async () => 'gate-consumed',
    inspectCommand: async () => Object.freeze({ status: after1, audit: audit1 }),
    commandReceiptForRecoveredChain: async recovered => {
      if (
        JSON.stringify(recovered.beforeStatus) !== JSON.stringify(before0)
        || JSON.stringify(recovered.afterStatus) !== JSON.stringify(after1)
        || recovered.operations.length !== 1
        || recovered.operations[0]?.operation.name !== 'publish'
      ) throw new Error('JOURNAL_RECOVERED_CHAIN_CONTEXT_INVALID');
      return Object.freeze({
        kind: 'warpkeep-greater-realm-production-publish-v1' as const,
        record: Object.freeze({
          schemaVersion: 1,
          kind: 'warpkeep-greater-realm-production-publish-v1',
          ...sourceRelease,
          operationReceiptChainDigest: recovered.operationReceiptChainDigest,
          operationReceiptCount: recovered.operationReceiptCount,
        }),
      });
    },
  });
}

if (action === 'initial-import') await installInitialImport();
else if (action === 'complete-import') await installCompletedImport();
else if (action === 'initial-lock-only') await installInitialLockOnly();
else if (action === 'recover-import') await recoverImport();
else if (action === 'initial-publish') await installInitialPublish('compile-changing');
else if (action === 'initial-publish-same-schema') {
  await installInitialPublish('reviewed-same-schema');
} else if (action === 'initial-publish-plan-only') await installInitialPublish('plan-only');
else if (action === 'normal-publish-cleanup-context') {
  await installCompletedPublish('complete');
} else if (action === 'initial-publish-cleanup-tail') {
  await installCompletedPublish('exit');
} else if (action === 'initial-publish-cleanup-failure') {
  await installCompletedPublish('throw');
}
else if (action === 'recover-publish') await recoverPublish();
else throw new Error('JOURNAL_CRASH_FIXTURE_ACTION_INVALID');
