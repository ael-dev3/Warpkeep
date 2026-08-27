import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertGreaterRealmPrivateInvocation } from './atlas/greater-realm-private-workspace';
import {
  requireGenesis001LegacyGreaterRealmProductionCliReadOnly,
} from './greater-realm-legacy-production-seal.mjs';
import {
  defaultGreaterRealmCutoverReceiptDirectory,
  GREATER_REALM_CUTOVER_RECEIPT_TARGET,
  inspectGreaterRealmCutoverOperatorJournalRecovery,
  recoverGreaterRealmCutoverOperatorLock,
  recoverGreaterRealmCutoverOperatorJournal,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from './greater-realm-cutover-receipts';
import {
  createGreaterRealmCutoverOperationJournalChain,
  type GreaterRealmCutoverOperationJournalChain,
} from './greater-realm-cutover-operation-journal';
import {
  executeGreaterRealmProductionRelocation,
  digestGreaterRealmProductionCutoverStatus,
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
  GREATER_REALM_PRODUCTION_RELOCATION_COMMAND,
  GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS,
  projectGreaterRealmProductionCutoverStatusShape,
  projectGreaterRealmProductionRelocationJournalStatus,
  type GreaterRealmProductionRelocationCommand,
  type GreaterRealmProductionCutoverStatus,
  type GreaterRealmProductionRelocationTransport,
} from './greater-realm-production-relocation-core';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import {
  createGreaterRealmFreshAdminTransport,
  readGreaterRealmProductionAdminSecretFile,
  requireGreaterRealmProductionTransportTarget,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export class GreaterRealmProductionRelocationOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionRelocationOperatorError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionRelocationOperatorError(code);
}

export function parseGreaterRealmProductionRelocationArguments(
  arguments_: readonly string[],
): Readonly<{
    command: GreaterRealmProductionRelocationCommand | 'recover-inspect' | 'recover';
    confirmed: boolean;
    recoveryConfirmationDigest?: string;
  }> {
  const command = arguments_[0] as GreaterRealmProductionRelocationCommand
    | 'recover-inspect' | 'recover' | undefined;
  const flags = arguments_.slice(1);
  if (command === 'recover-inspect' && flags.length === 0) {
    return Object.freeze({ command, confirmed: false });
  }
  if (command === 'recover' && flags.length === 1) {
    const match = /^--confirm-recovery=([0-9a-f]{64})$/u.exec(flags[0]!);
    if (match !== null) return Object.freeze({
      command,
      confirmed: true,
      recoveryConfirmationDigest: match[1]!,
    });
  }
  const validCommand = command !== undefined
    && Object.values(GREATER_REALM_PRODUCTION_RELOCATION_COMMAND)
      .includes(command as GreaterRealmProductionRelocationCommand);
  const mutation = command !== 'inspect';
  if (
    !validCommand
    || flags.some(flag => flag !== '--confirm')
    || new Set(flags).size !== flags.length
    || (mutation && flags.length !== 1)
    || (!mutation && flags.length !== 0)
  ) {
    fail(
      'GREATER_REALM_PRODUCTION_RELOCATION_USAGE: '
      + '<inspect|prepare|begin-drain|freeze|plan|canary|commit|halt|resume|rollback> '
      + '[--confirm] | <recover-inspect|recover --confirm-recovery=<sha256>>',
    );
  }
  return Object.freeze({
    command: command as GreaterRealmProductionRelocationCommand,
    confirmed: flags.includes('--confirm'),
  });
}

function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .map(([key, child]) => [key, printable(child)]));
  }
  return value;
}

function relocationRecoveryRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_RECEIPT_INVALID');
  }
  return value as Readonly<Record<string, unknown>>;
}

function relocationReceiptStatus(
  status: GreaterRealmProductionCutoverStatus,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    activationMode: status.activationMode,
    releaseState: status.releaseState,
    currentFounderCount: status.currentFounderCount,
    founderCapacityRemaining: status.founderCapacityRemaining,
    activeClaimRows: status.activeClaimRows.toString(),
    greaterRealmOccupancyRows: status.greaterRealmOccupancyRows.toString(),
    legacyClaimRows: status.legacyClaimRows.toString(),
    auditRows: status.auditRows.toString(),
    activeAdmissionEligible: status.activeAdmissionEligible,
    topologySnapshotDigest: status.topologySnapshotDigest ?? null,
    relocationPlanDigest: status.relocationPlanDigest ?? null,
    statusDigest: digestGreaterRealmProductionCutoverStatus(status),
  });
}

function relocationJournalWithReceiptContext(input: Readonly<{
  journal: GreaterRealmCutoverOperationJournalChain;
  latestStatus: () => GreaterRealmProductionCutoverStatus;
}>): GreaterRealmCutoverOperationJournalChain {
  return Object.freeze({
    ...input.journal,
    bindCommandPlan: plan => input.journal.bindCommandPlan({
      ...plan,
      receiptBeforeStatus: relocationReceiptStatus(input.latestStatus()),
      receiptBeforeAudit: Object.freeze({ auditRows: input.latestStatus().auditRows }),
    }),
    reconcileCommand: terminal => input.journal.reconcileCommand({
      ...terminal,
      receiptAfterStatus: relocationReceiptStatus(input.latestStatus()),
      receiptAfterAudit: Object.freeze({ auditRows: input.latestStatus().auditRows }),
    }),
  });
}

type RelocationRecoveredChain = Parameters<NonNullable<
  Parameters<typeof recoverGreaterRealmCutoverOperatorJournal>[0]['commandReceiptForRecoveredChain']
>>[0];

function reconstructRecoveredRelocationReceipt(chain: RelocationRecoveredChain) {
  if (chain.command.kind !== 'relocation') {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
  }
  const command = chain.command.name as GreaterRealmProductionRelocationCommand;
  if (
    command === 'inspect'
    || !Object.values(GREATER_REALM_PRODUCTION_RELOCATION_COMMAND).includes(command)
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
  const reducer = GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS[command];
  const before = relocationRecoveryRecord(chain.beforeStatus);
  const after = relocationRecoveryRecord(chain.afterStatus);
  const beforeAudit = relocationRecoveryRecord(chain.beforeAudit);
  const afterAudit = relocationRecoveryRecord(chain.afterAudit);
  const auditBefore = before.auditRows;
  const auditAfter = after.auditRows;
  const expectedDelta = chain.operationReceiptCount === 0 ? 0n : 1n;
  if (
    chain.operations.length !== chain.operationReceiptCount
    || chain.operationReceiptCount > 1
    || typeof auditBefore !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(auditBefore)
    || typeof auditAfter !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(auditAfter)
    || BigInt(auditAfter) - BigInt(auditBefore) !== expectedDelta
    || beforeAudit.auditRows !== auditBefore
    || afterAudit.auditRows !== auditAfter
    || typeof before.activationMode !== 'string'
    || typeof after.activationMode !== 'string'
    || typeof after.releaseState !== 'string'
    || !Number.isSafeInteger(after.currentFounderCount)
    || !Number.isSafeInteger(after.founderCapacityRemaining)
    || !['activeClaimRows', 'greaterRealmOccupancyRows', 'legacyClaimRows']
      .every(key => typeof after[key] === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(after[key] as string))
    || typeof after.activeAdmissionEligible !== 'boolean'
    || typeof after.statusDigest !== 'string'
    || !/^[0-9a-f]{64}$/u.test(after.statusDigest)
    || (after.topologySnapshotDigest !== null
      && (typeof after.topologySnapshotDigest !== 'string'
        || !/^[0-9a-f]{64}$/u.test(after.topologySnapshotDigest)))
    || (after.relocationPlanDigest !== null
      && (typeof after.relocationPlanDigest !== 'string'
        || !/^[0-9a-f]{64}$/u.test(after.relocationPlanDigest)))
    || (chain.operationReceiptCount === 0
      && JSON.stringify(before) !== JSON.stringify(after))
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_RECEIPT_INVALID');
  if (chain.operationReceiptCount === 1) {
    const operation = chain.operations[0]!;
    if (
      operation.operationOrdinal !== 1
      || operation.operation.kind !== 'reducer'
      || operation.operation.name !== reducer
      || operation.operation.identity.reducer !== reducer
      || operation.operation.identity.command !== command
    ) fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_RECEIPT_INVALID');
  }
  const recoveredAfterSubmissionError = chain.operations.some(operation => (
    operation.outcome !== 'verified'
  ));
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-relocation-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      command,
      reducer,
      outcome: chain.operationReceiptCount === 0
        ? 'already-satisfied'
        : recoveredAfterSubmissionError ? 'verified-after-submission-error' : 'verified',
      submitted: chain.operationReceiptCount === 1,
      atlasSourceCommit: chain.sourceRelease.atlasSourceCommit,
      atlasId: chain.sourceRelease.atlasId,
      publicReleaseId: chain.sourceRelease.publicReleaseId,
      expectedReleaseSha256: chain.sourceRelease.expectedReleaseSha256,
      moduleSourceCommit: chain.sourceRelease.moduleSourceCommit,
      beforeMode: before.activationMode,
      afterMode: after.activationMode,
      releaseState: after.releaseState,
      currentFounderCount: after.currentFounderCount,
      founderCapacityRemaining: after.founderCapacityRemaining,
      activeClaimRows: after.activeClaimRows,
      occupancyRows: after.greaterRealmOccupancyRows,
      legacyClaimRows: after.legacyClaimRows,
      auditRowsBefore: auditBefore,
      auditRowsAfter: auditAfter,
      auditRowsDelta: expectedDelta.toString(),
      activeAdmissionEligible: after.activeAdmissionEligible,
      ...(after.topologySnapshotDigest === null
        ? {}
        : { topologySnapshotDigest: after.topologySnapshotDigest }),
      ...(after.relocationPlanDigest === null
        ? {}
        : { relocationPlanDigest: after.relocationPlanDigest }),
      statusDigest: after.statusDigest,
      operationReceiptChainDigest: chain.operationReceiptChainDigest,
      operationReceiptCount: chain.operationReceiptCount,
    }),
  });
}

export async function executeGreaterRealmProductionRelocationOperator(input: Readonly<{
  command: GreaterRealmProductionRelocationCommand | 'recover-inspect' | 'recover';
  confirmed: boolean;
  recoveryConfirmationDigest?: string;
  adminSecret?: string;
  adminSecretPath?: string;
  environment: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  receiptDirectory?: string;
  attestProtectedMain?: () => string;
  transport?: GreaterRealmProductionRelocationTransport;
}>): Promise<Readonly<Record<string, unknown>>> {
  if (input.command !== 'inspect' && input.command !== 'recover-inspect' && !input.confirmed) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_CONFIRMATION_REQUIRED');
  }
  const receiptDirectory = input.receiptDirectory
    ?? defaultGreaterRealmCutoverReceiptDirectory();
  if (input.command === 'recover-inspect') {
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (inspection.plan !== null && inspection.plan.command.kind !== 'relocation') {
      fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
    }
    return Object.freeze({
      command: 'recover-inspect',
      recoveryMode: inspection.recoveryMode,
      recoveryEligible: inspection.recoveryEligible,
      recoveryOwnerState: inspection.recoveryOwnerState,
      recoveryOwnerExpiresAtMs: inspection.recoveryOwnerExpiresAtMs,
      groupDigest: inspection.plan?.groupDigest,
      operationReceiptChainDigest: inspection.plan?.operationReceiptChainDigest,
      operationReceiptCount: inspection.plan?.operationReceiptCount,
      confirmationDigest: inspection.confirmationDigest,
      deletion: 'disabled',
      networkMode: 'read-only-local',
    });
  }
  if (input.command === 'recover') {
    if (input.recoveryConfirmationDigest === undefined) {
      fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_CONFIRMATION_REQUIRED');
    }
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (
      inspection.confirmationDigest !== input.recoveryConfirmationDigest
      || (inspection.plan !== null && inspection.plan.command.kind !== 'relocation')
    ) fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_CONFIRMATION_REQUIRED');
    if (inspection.recoveryMode === 'lock-only') {
      recoverGreaterRealmCutoverOperatorLock({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        confirmationDigest: input.recoveryConfirmationDigest,
      });
      return Object.freeze({
        command: 'recover',
        recoveryMode: 'lock-only',
        outcome: 'cleared-dead-lock',
        deletion: 'disabled',
        networkMode: 'none',
      });
    }
    if (inspection.recoveryMode === 'command-receipt') {
      const recovered = await recoverGreaterRealmCutoverOperatorJournal({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        confirmationDigest: input.recoveryConfirmationDigest,
        inspect: async () => fail('GREATER_REALM_PRODUCTION_RELOCATION_LOCAL_RECOVERY_INSPECTION_FORBIDDEN'),
      });
      return Object.freeze({
        command: 'recover',
        recoveryMode: 'command-receipt',
        recoveredCommand: inspection.plan!.command.name,
        outcome: recovered.recovery.outcome,
        groupDigest: recovered.recovery.groupDigest,
        operationReceiptChainDigest: recovered.recovery.operationReceiptChainDigest,
        operationReceiptCount: recovered.recovery.operationReceiptCount,
        commandReceiptDigest: recovered.recovery.commandReceiptDigest,
        deletion: 'disabled',
        networkMode: 'none',
      });
    }
  }
  if (
    input.transport === undefined
    && ((input.adminSecret === undefined) === (input.adminSecretPath === undefined)
      || (input.adminSecret !== undefined && typeof input.adminSecret !== 'string')
      || (input.adminSecretPath !== undefined && typeof input.adminSecretPath !== 'string'))
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_ADMIN_SECRET_SOURCE_INVALID');
  if (
    input.transport !== undefined
    && (input.adminSecret !== undefined || input.adminSecretPath !== undefined)
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_ADMIN_SECRET_SOURCE_INVALID');
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectGreaterRealmProductionProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const {
    atlasSourceCommit,
    atlasId,
    publicReleaseId,
    expectedReleaseSha256,
    moduleSourceCommit,
  } = provenance;
  let ownedTransport: ReturnType<typeof createGreaterRealmFreshAdminTransport> | undefined;
  const requireTransport = (): GreaterRealmProductionRelocationTransport => {
    if (input.transport !== undefined) return input.transport;
    if (ownedTransport !== undefined) return ownedTransport;
    const adminSecret = input.adminSecret
      ?? readGreaterRealmProductionAdminSecretFile(input.adminSecretPath!);
    ownedTransport = createGreaterRealmFreshAdminTransport({
      adminSecret,
      statusProcedure: GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
    });
    return ownedTransport;
  };
  let latestStatus: GreaterRealmProductionCutoverStatus | undefined;
  const transport: GreaterRealmProductionRelocationTransport = Object.freeze({
    inspect: async () => {
      const value = await requireTransport().inspect();
      latestStatus = projectGreaterRealmProductionCutoverStatusShape(value);
      return value;
    },
    submit: (reducer, arguments_, permit) => (
      requireTransport().submit(reducer, arguments_, permit)
    ),
  });
  try {
    if (input.command === 'recover') {
      if (input.recoveryConfirmationDigest === undefined) {
        fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_CONFIRMATION_REQUIRED');
      }
      const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
      });
      if (inspection.plan === null || inspection.plan.command.kind !== 'relocation') {
        fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
      }
      const recoveredCommand = inspection.plan.command.name as GreaterRealmProductionRelocationCommand;
      if (!Object.values(GREATER_REALM_PRODUCTION_RELOCATION_COMMAND).includes(recoveredCommand)) {
        fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
      }
      const inspectState = async () => {
        const status = projectGreaterRealmProductionCutoverStatusShape(await transport.inspect());
        return Object.freeze({
          status: projectGreaterRealmProductionRelocationJournalStatus(
            recoveredCommand as Exclude<GreaterRealmProductionRelocationCommand, 'inspect'>,
            status,
          ),
          audit: Object.freeze({ auditRows: status.auditRows }),
          receiptStatus: relocationReceiptStatus(status),
          receiptAudit: Object.freeze({ auditRows: status.auditRows }),
        });
      };
      const recovery = await recoverGreaterRealmCutoverOperatorJournal({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        confirmationDigest: input.recoveryConfirmationDigest,
        prepareRecovery: () => { requireTransport(); },
        inspect: inspectState,
        inspectCommand: inspectState,
        resumeCommand: async resumed => {
          if (
            resumed.command.kind !== 'relocation'
            || resumed.command.name !== recoveredCommand
            || resumed.sourceRelease.atlasSourceCommit !== atlasSourceCommit
            || resumed.sourceRelease.moduleSourceCommit !== moduleSourceCommit
            || resumed.sourceRelease.atlasId !== atlasId
            || resumed.sourceRelease.publicReleaseId !== publicReleaseId
            || resumed.sourceRelease.expectedReleaseSha256 !== expectedReleaseSha256
          ) fail('GREATER_REALM_PRODUCTION_RELOCATION_RECOVERY_COMMAND_MISMATCH');
          const receipt = await executeGreaterRealmProductionRelocation({
            command: recoveredCommand,
            confirmed: true,
            expectedAtlasSourceCommit: atlasSourceCommit,
            expectedAtlasId: atlasId,
            expectedPublicReleaseId: publicReleaseId,
            expectedReleaseSha256,
            moduleSourceCommit,
            transport,
            assertCanStartWrite: resumed.assertCanStartWrite,
            operationJournal: relocationJournalWithReceiptContext({
              journal: resumed.operationJournal,
              latestStatus: () => latestStatus
                ?? fail('GREATER_REALM_PRODUCTION_RELOCATION_RECEIPT_CONTEXT_MISSING'),
            }),
          });
          return Object.freeze({ kind: receipt.kind, record: { ...receipt } });
        },
        commandReceiptForRecoveredChain: async chain => (
          reconstructRecoveredRelocationReceipt(chain)
        ),
      });
      return Object.freeze({
        command: 'recover',
        recoveredCommand,
        outcome: recovery.recovery.outcome,
        groupDigest: recovery.recovery.groupDigest,
        operationReceiptChainDigest: recovery.recovery.operationReceiptChainDigest,
        operationReceiptCount: recovery.recovery.operationReceiptCount,
        commandReceiptDigest: recovery.recovery.commandReceiptDigest,
        deletion: 'disabled',
      });
    }
    if (input.command === 'inspect') {
      const inspection = await executeGreaterRealmProductionRelocation({
        command: input.command,
        confirmed: false,
        expectedAtlasSourceCommit: atlasSourceCommit,
        expectedAtlasId: atlasId,
        expectedPublicReleaseId: publicReleaseId,
        expectedReleaseSha256,
        moduleSourceCommit,
        transport,
        assertCanStartWrite: () => undefined,
      });
      return Object.freeze({
        command: input.command,
        atlasSourceCommit,
        atlasId,
        publicReleaseId,
        expectedReleaseSha256,
        moduleSourceCommit,
        releaseState: inspection.releaseState,
        activationMode: inspection.afterMode,
        currentFounderCount: inspection.currentFounderCount,
        founderCapacityRemaining: inspection.founderCapacityRemaining,
        activeAdmissionEligible: inspection.activeAdmissionEligible,
        statusDigest: inspection.statusDigest,
        networkMode: 'read-only',
      });
    }

    const relocationCommand = input.command as GreaterRealmProductionRelocationCommand;
    return await withGreaterRealmCutoverOperatorLock({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      operation: async control => {
        // Validate the local secret and construct the owner-scoped transport
        // before retaining any command WAL. No token or network request occurs here.
        requireTransport();
        const operationJournal = createGreaterRealmCutoverOperationJournalChain({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          control,
          command: Object.freeze({ kind: 'relocation', name: relocationCommand }),
          target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
          sourceRelease: Object.freeze({
            atlasSourceCommit,
            moduleSourceCommit,
            atlasId,
            publicReleaseId,
            expectedReleaseSha256,
          }),
        });
        const receipt = await executeGreaterRealmProductionRelocation({
          command: relocationCommand,
          confirmed: input.confirmed,
          expectedAtlasSourceCommit: atlasSourceCommit,
          expectedAtlasId: atlasId,
          expectedPublicReleaseId: publicReleaseId,
          expectedReleaseSha256,
          moduleSourceCommit,
          transport,
          assertCanStartWrite: control.assertCanStartWrite,
          operationJournal: relocationJournalWithReceiptContext({
            journal: operationJournal,
            latestStatus: () => latestStatus
              ?? fail('GREATER_REALM_PRODUCTION_RELOCATION_RECEIPT_CONTEXT_MISSING'),
          }),
        });
        const commandReceiptPlan = operationJournal.prepareCommandReceipt({
          kind: 'warpkeep-greater-realm-production-relocation-v1',
          record: { ...receipt },
        });
        const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          kind: 'warpkeep-greater-realm-production-relocation-v1',
          record: { ...receipt },
          now: new Date(commandReceiptPlan.recordedAt),
        });
        if (privateReceipt.receiptDigest !== commandReceiptPlan.receiptDigest) {
          fail('GREATER_REALM_PRODUCTION_RELOCATION_COMMAND_RECEIPT_MISMATCH');
        }
        operationJournal.completeCommandReceipt({
          path: privateReceipt.path,
          receiptDigest: privateReceipt.receiptDigest,
        });
        return Object.freeze({
          command: receipt.command,
          reducer: receipt.reducer,
          outcome: receipt.outcome,
          submitted: receipt.submitted,
          atlasSourceCommit: receipt.atlasSourceCommit,
          atlasId: receipt.atlasId,
          publicReleaseId: receipt.publicReleaseId,
          expectedReleaseSha256: receipt.expectedReleaseSha256,
          moduleSourceCommit: receipt.moduleSourceCommit,
          releaseState: receipt.releaseState,
          activationMode: receipt.afterMode,
          currentFounderCount: receipt.currentFounderCount,
          founderCapacityRemaining: receipt.founderCapacityRemaining,
          activeAdmissionEligible: receipt.activeAdmissionEligible,
          auditRowsBefore: receipt.auditRowsBefore,
          auditRowsAfter: receipt.auditRowsAfter,
          auditRowsDelta: receipt.auditRowsDelta,
          statusDigest: receipt.statusDigest,
          receiptDigest: privateReceipt.receiptDigest,
          receiptResult: privateReceipt.result,
          deletion: 'disabled',
        });
      },
    });
  } finally {
    await ownedTransport?.close();
  }
}

export const greaterRealmProductionRelocationOperatorTestSeams = Object.freeze({
  reconstructRecoveredRelocationReceipt,
});

async function main(): Promise<void> {
  requireGenesis001LegacyGreaterRealmProductionCliReadOnly({
    entrypoint: 'relocation',
    arguments_: process.argv.slice(2),
  });
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionRelocationArguments(process.argv.slice(2));
  if (process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE
    !== 'warpkeep-greater-realm-production-bootstrap-v1') {
    fail('GREATER_REALM_PRODUCTION_TRUSTED_BOOTSTRAP_REQUIRED');
  }
  const adminSecretPath = process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  delete process.env.WKGR_PRODUCTION_PROTECTED_COMMIT;
  delete process.env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  if (
    parsed.command !== 'recover-inspect'
    && parsed.command !== 'recover'
    && (typeof adminSecretPath !== 'string' || adminSecretPath.length === 0)
  ) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_ADMIN_SECRET_SOURCE_INVALID');
  }
  const result = await executeGreaterRealmProductionRelocationOperator({
    ...parsed,
    ...(adminSecretPath === undefined ? {} : { adminSecretPath }),
    environment: process.env,
  });
  console.log(JSON.stringify(printable(result)));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(
      error instanceof GreaterRealmProductionRelocationOperatorError
        ? error.code
        : error !== null
          && typeof error === 'object'
          && 'code' in error
          && typeof error.code === 'string'
          ? error.code
          : 'GREATER_REALM_PRODUCTION_RELOCATION_OPERATOR_FAILED',
    );
    process.exitCode = 1;
  });
}
