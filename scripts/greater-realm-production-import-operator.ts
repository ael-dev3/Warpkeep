import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertGreaterRealmPrivateInvocation,
} from './atlas/greater-realm-private-workspace';
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
  executeGreaterRealmProductionImport,
  projectGreaterRealmProductionImportCommandJournalAudit,
  projectGreaterRealmProductionImportCommandJournalStatus,
  projectGreaterRealmProductionImportStatus,
  verifyGreaterRealmProductionImportAuthority,
} from './greater-realm-production-import-core';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import {
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
  projectGreaterRealmProductionCutoverStatusShape,
} from './greater-realm-production-relocation-core';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
  readGreaterRealmProductionAdminSecretFile,
  requireGreaterRealmProductionTransportTarget,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMPORT_EPOCH = 1n;
const PUBLIC_NAME = 'The Greater Realm';
const STATUS_PROCEDURE = 'admin_get_greater_realm_status_v1';

type Command = 'inspect' | 'apply' | 'recover-inspect' | 'recover';

export class GreaterRealmProductionImportOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionImportOperatorError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionImportOperatorError(code);
}

export function parseGreaterRealmProductionImportArguments(
  arguments_: readonly string[],
): Readonly<{
  command: Command;
  confirmed: boolean;
  recoveryConfirmationDigest?: string;
}> {
  const command = arguments_[0];
  const flags = arguments_.slice(1);
  if (command === 'recover-inspect' && flags.length === 0) {
    return Object.freeze({ command, confirmed: false });
  }
  if (command === 'recover' && flags.length === 1) {
    const match = /^--confirm-recovery=([0-9a-f]{64})$/u.exec(flags[0]!);
    if (match !== null) {
      return Object.freeze({
        command,
        confirmed: true,
        recoveryConfirmationDigest: match[1]!,
      });
    }
  }
  if (
    (command !== 'inspect' && command !== 'apply')
    || flags.some(flag => flag !== '--confirm')
    || new Set(flags).size !== flags.length
    || (command === 'inspect' && flags.length !== 0)
    || (command === 'apply' && flags.length !== 1)
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_USAGE: <inspect|apply --confirm|recover-inspect|recover --confirm-recovery=<sha256>>');
  return Object.freeze({ command, confirmed: flags.includes('--confirm') });
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

function recoveryRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_RECEIPT_INVALID');
  }
  return value as Readonly<Record<string, unknown>>;
}

function importJournalWithReceiptContext(input: Readonly<{
  journal: GreaterRealmCutoverOperationJournalChain;
  latestStatus: () => unknown;
  latestAudit: () => unknown;
}>): GreaterRealmCutoverOperationJournalChain {
  return Object.freeze({
    ...input.journal,
    bindCommandPlan: plan => input.journal.bindCommandPlan({
      ...plan,
      receiptBeforeStatus: input.latestStatus(),
      receiptBeforeAudit: input.latestAudit(),
    }),
    reconcileCommand: terminal => input.journal.reconcileCommand({
      ...terminal,
      receiptAfterStatus: input.latestStatus(),
      receiptAfterAudit: input.latestAudit(),
    }),
  });
}

type ImportRecoveredChain = Parameters<NonNullable<
  Parameters<typeof recoverGreaterRealmCutoverOperatorJournal>[0]['commandReceiptForRecoveredChain']
>>[0];

function reconstructRecoveredImportReceipt(chain: ImportRecoveredChain) {
  if (chain.command.kind !== 'import' || chain.command.name !== 'apply') {
    fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_COMMAND_MISMATCH');
  }
  const before = recoveryRecord(chain.beforeStatus);
  const after = recoveryRecord(chain.afterStatus);
  const afterAudit = recoveryRecord(chain.afterAudit);
  if (
    chain.operations.length !== chain.operationReceiptCount
    || after.state !== 'ready'
    || after.verificationPhase !== 'complete'
    || after.verificationCursor !== '0'
    || typeof after.verificationDigest !== 'string'
    || !/^(?:[0-9a-f]{64}|sha256-v1:[0-9a-f]{64}:[0-9a-f]+:[0-9a-f]*)$/u.test(after.verificationDigest)
    || after.importsExact !== true
    || after.ready !== true
    || afterAudit.releaseState !== 'ready'
    || afterAudit.verificationPhase !== 'complete'
    || afterAudit.verificationCursor !== '0'
    || afterAudit.verificationDigest !== after.verificationDigest
    || afterAudit.releaseImportsExact !== true
    || afterAudit.releaseReady !== true
    || (chain.operationReceiptCount === 0
      && JSON.stringify(before) !== JSON.stringify(after))
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_RECEIPT_INVALID');
  for (let index = 0; index < chain.operations.length; index += 1) {
    const operation = chain.operations[index]!;
    if (
      operation.operationOrdinal !== index + 1
      || operation.operation.kind !== 'reducer'
      || operation.operation.identity.importEpoch !== IMPORT_EPOCH.toString()
      || operation.operation.identity.reducer !== operation.operation.name
    ) fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_RECEIPT_INVALID');
  }
  const recoveredAfterSubmissionError = chain.operations.some(operation => (
    operation.outcome !== 'verified'
  ));
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-import-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-import-v1',
      outcome: chain.operationReceiptCount === 0
        ? 'already-ready'
        : recoveredAfterSubmissionError ? 'verified-after-submission-error' : 'ready',
      atlasId: chain.sourceRelease.atlasId,
      publicReleaseId: chain.sourceRelease.publicReleaseId,
      atlasSourceCommit: chain.sourceRelease.atlasSourceCommit,
      moduleSourceCommit: chain.sourceRelease.moduleSourceCommit,
      importEpoch: IMPORT_EPOCH.toString(),
      expectedReleaseSha256: chain.sourceRelease.expectedReleaseSha256,
      verificationDigest: after.verificationDigest,
      operationsSubmitted: chain.operationReceiptCount,
      operationReceiptChainDigest: chain.operationReceiptChainDigest,
      operationReceiptCount: chain.operationReceiptCount,
      postcondition: 'ready-import-only',
    }),
  });
}

export async function executeGreaterRealmProductionImportOperator(input: Readonly<{
  command: Command;
  confirmed: boolean;
  recoveryConfirmationDigest?: string;
  adminSecret?: string;
  adminSecretPath?: string;
  environment: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  receiptDirectory?: string;
  attestProtectedMain?: () => string;
}>): Promise<Readonly<Record<string, unknown>>> {
  if (input.command === 'apply' && !input.confirmed) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_CONFIRMATION_REQUIRED');
  }
  if (input.command === 'recover' && (
    !input.confirmed || input.recoveryConfirmationDigest === undefined
  )) fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_CONFIRMATION_REQUIRED');
  const receiptDirectory = input.receiptDirectory
    ?? defaultGreaterRealmCutoverReceiptDirectory();
  if (input.command === 'recover-inspect') {
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (inspection.plan !== null && inspection.plan.command.kind !== 'import') {
      fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_COMMAND_MISMATCH');
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
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (
      inspection.confirmationDigest !== input.recoveryConfirmationDigest
      || (inspection.plan !== null && inspection.plan.command.kind !== 'import')
    ) fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_CONFIRMATION_REQUIRED');
    if (inspection.recoveryMode === 'lock-only') {
      recoverGreaterRealmCutoverOperatorLock({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        confirmationDigest: input.recoveryConfirmationDigest!,
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
        confirmationDigest: input.recoveryConfirmationDigest!,
        inspect: async () => fail('GREATER_REALM_PRODUCTION_IMPORT_LOCAL_RECOVERY_INSPECTION_FORBIDDEN'),
      });
      return Object.freeze({
        command: 'recover',
        recoveryMode: 'command-receipt',
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
    (input.adminSecret === undefined) === (input.adminSecretPath === undefined)
    || (input.adminSecret !== undefined && typeof input.adminSecret !== 'string')
    || (input.adminSecretPath !== undefined && typeof input.adminSecretPath !== 'string')
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_ADMIN_SECRET_SOURCE_INVALID');
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectGreaterRealmProductionProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const {
    artifacts, workspace, atlasSourceCommit, moduleSourceCommit, atlasId, publicReleaseId,
  } = provenance;
  let session: ReturnType<typeof createGreaterRealmAdminTransportSession> | undefined;
  let statusTransport: ReturnType<typeof bindGreaterRealmProductionStatusTransport> | undefined;
  let authorityStatusTransport: ReturnType<typeof bindGreaterRealmProductionStatusTransport>
    | undefined;
  const requireSession = (): ReturnType<typeof createGreaterRealmAdminTransportSession> => {
    if (session !== undefined) return session;
    const adminSecret = input.adminSecret
      ?? readGreaterRealmProductionAdminSecretFile(input.adminSecretPath!);
    session = createGreaterRealmAdminTransportSession({ adminSecret });
    return session;
  };
  const requireStatusTransport = () => {
    statusTransport ??= bindGreaterRealmProductionStatusTransport(
      requireSession(),
      STATUS_PROCEDURE,
    );
    return statusTransport;
  };
  const requireAuthorityTransport = () => {
    authorityStatusTransport ??= bindGreaterRealmProductionStatusTransport(
      requireSession(),
      GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
    );
    return authorityStatusTransport;
  };
  let latestImportStatus: ReturnType<typeof projectGreaterRealmProductionImportStatus>
    | undefined;
  let latestAuthorityStatus: ReturnType<typeof projectGreaterRealmProductionCutoverStatusShape>
    | undefined;
  const transport = Object.freeze({
    inspect: async () => {
      const value = await requireStatusTransport().inspect();
      latestImportStatus = projectGreaterRealmProductionImportStatus(value);
      return value;
    },
    submit: (reducer: string, arguments_: Readonly<Record<string, unknown>>, permit: () => void) => (
      requireStatusTransport().submit(reducer, arguments_, permit)
    ),
  });
  const authorityTransport = Object.freeze({
    inspect: async () => {
      const value = await requireAuthorityTransport().inspect();
      latestAuthorityStatus = projectGreaterRealmProductionCutoverStatusShape(value);
      return value;
    },
  });
  try {
    if (input.command === 'recover') {
      const inspectState = async () => {
        const statusValue = await transport.inspect();
        const authorityValue = await authorityTransport.inspect();
        verifyGreaterRealmProductionImportAuthority({
          statusValue,
          authorityStatusValue: authorityValue,
          artifacts,
          importEpoch: IMPORT_EPOCH,
        });
        return Object.freeze({
          status: projectGreaterRealmProductionImportStatus(statusValue),
          audit: projectGreaterRealmProductionCutoverStatusShape(authorityValue),
        });
      };
      const recovered = await recoverGreaterRealmCutoverOperatorJournal({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        confirmationDigest: input.recoveryConfirmationDigest!,
        prepareRecovery: () => { requireSession(); },
        inspect: inspectState,
        inspectCommand: async () => {
          const observed = await inspectState();
          return Object.freeze({
            status: projectGreaterRealmProductionImportCommandJournalStatus(
              observed.status,
            ),
            audit: projectGreaterRealmProductionImportCommandJournalAudit(
              observed.audit,
            ),
            receiptStatus: projectGreaterRealmProductionImportCommandJournalStatus(
              observed.status,
            ),
            receiptAudit: projectGreaterRealmProductionImportCommandJournalAudit(
              observed.audit,
            ),
          });
        },
        resumeCommand: async recovery => {
          if (
            recovery.command.kind !== 'import'
            || recovery.sourceRelease.atlasSourceCommit !== atlasSourceCommit
            || recovery.sourceRelease.moduleSourceCommit !== moduleSourceCommit
            || recovery.sourceRelease.atlasId !== atlasId
            || recovery.sourceRelease.publicReleaseId !== publicReleaseId
            || recovery.sourceRelease.expectedReleaseSha256
              !== provenance.expectedReleaseSha256
          ) {
            fail('GREATER_REALM_PRODUCTION_IMPORT_RECOVERY_COMMAND_MISMATCH');
          }
          const receipt = await executeGreaterRealmProductionImport({
            artifacts,
            moduleSourceCommit,
            importEpoch: IMPORT_EPOCH,
            publicName: PUBLIC_NAME,
            assertCanStartWrite: recovery.assertCanStartWrite,
            operationJournal: importJournalWithReceiptContext({
              journal: recovery.operationJournal,
              latestStatus: () => projectGreaterRealmProductionImportCommandJournalStatus(
                latestImportStatus
                  ?? fail('GREATER_REALM_PRODUCTION_IMPORT_RECEIPT_CONTEXT_MISSING'),
              ),
              latestAudit: () => projectGreaterRealmProductionImportCommandJournalAudit(
                latestAuthorityStatus
                  ?? fail('GREATER_REALM_PRODUCTION_IMPORT_RECEIPT_CONTEXT_MISSING'),
              ),
            }),
            transport: Object.freeze({
              inspect: transport.inspect,
              inspectAuthority: authorityTransport.inspect,
              prepareSubmission: () => requireSession().prepareSubmission(),
              submit: transport.submit,
            }),
          });
          return Object.freeze({ kind: receipt.kind, record: { ...receipt } });
        },
        commandReceiptForRecoveredChain: async chain => reconstructRecoveredImportReceipt(chain),
      });
      return Object.freeze({
        command: 'recover',
        outcome: recovered.recovery.outcome,
        groupDigest: recovered.recovery.groupDigest,
        operationReceiptChainDigest: recovered.recovery.operationReceiptChainDigest,
        operationReceiptCount: recovered.recovery.operationReceiptCount,
        commandReceiptDigest: recovered.recovery.commandReceiptDigest,
        deletion: 'disabled',
      });
    }
    if (input.command === 'inspect') {
      const status = verifyGreaterRealmProductionImportAuthority({
        statusValue: await transport.inspect(),
        authorityStatusValue: await authorityTransport.inspect(),
        artifacts,
        importEpoch: IMPORT_EPOCH,
      });
      return Object.freeze({
        command: 'inspect',
        atlasSourceCommit,
        moduleSourceCommit,
        publicReleaseId: artifacts.manifest.publicReleaseId,
        expectedReleaseSha256: provenance.expectedReleaseSha256,
        state: status.state,
        importMutationsCompiled: status.importMutationsCompiled,
        activationMutationsCompiled: status.activationMutationsCompiled,
        importsExact: status.importsExact,
        ready: status.ready,
        networkMode: 'read-only',
      });
    }

    return await withGreaterRealmCutoverOperatorLock({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      operation: control => workspace.withExclusiveLock('production-import-v1.lock', async () => {
        // Validate the local secret and construct the owner-scoped session
        // before retaining any command WAL. No token or network request occurs here.
        requireSession();
        const operationJournal = createGreaterRealmCutoverOperationJournalChain({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          control,
          command: Object.freeze({ kind: 'import', name: 'apply' }),
          target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
          sourceRelease: Object.freeze({
            atlasSourceCommit,
            moduleSourceCommit,
            atlasId,
            publicReleaseId,
            expectedReleaseSha256: provenance.expectedReleaseSha256,
          }),
        });
        const receipt = await executeGreaterRealmProductionImport({
          artifacts,
          moduleSourceCommit,
          importEpoch: IMPORT_EPOCH,
          publicName: PUBLIC_NAME,
          assertCanStartWrite: control.assertCanStartWrite,
          operationJournal: importJournalWithReceiptContext({
            journal: operationJournal,
            latestStatus: () => projectGreaterRealmProductionImportCommandJournalStatus(
              latestImportStatus
                ?? fail('GREATER_REALM_PRODUCTION_IMPORT_RECEIPT_CONTEXT_MISSING'),
            ),
            latestAudit: () => projectGreaterRealmProductionImportCommandJournalAudit(
              latestAuthorityStatus
                ?? fail('GREATER_REALM_PRODUCTION_IMPORT_RECEIPT_CONTEXT_MISSING'),
            ),
          }),
          transport: Object.freeze({
            inspect: transport.inspect,
            inspectAuthority: authorityTransport.inspect,
            prepareSubmission: () => requireSession().prepareSubmission(),
            submit: transport.submit,
          }),
        });
        const commandReceiptPlan = operationJournal.prepareCommandReceipt({
          kind: 'warpkeep-greater-realm-production-import-v1',
          record: { ...receipt },
        });
        const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          kind: 'warpkeep-greater-realm-production-import-v1',
          record: { ...receipt },
          now: new Date(commandReceiptPlan.recordedAt),
        });
        if (privateReceipt.receiptDigest !== commandReceiptPlan.receiptDigest) {
          fail('GREATER_REALM_PRODUCTION_IMPORT_COMMAND_RECEIPT_MISMATCH');
        }
        operationJournal.completeCommandReceipt({
          path: privateReceipt.path,
          receiptDigest: privateReceipt.receiptDigest,
        });
        return Object.freeze({
          command: 'apply',
          outcome: receipt.outcome,
          atlasSourceCommit: receipt.atlasSourceCommit,
          moduleSourceCommit: receipt.moduleSourceCommit,
          publicReleaseId: receipt.publicReleaseId,
          expectedReleaseSha256: receipt.expectedReleaseSha256,
          verificationDigest: receipt.verificationDigest,
          operationsSubmitted: receipt.operationsSubmitted,
          receiptDigest: privateReceipt.receiptDigest,
          receiptResult: privateReceipt.result,
          deletion: 'disabled',
          activation: 'disabled',
        });
      }),
    });
  } finally {
    await session?.close();
  }
}

export const greaterRealmProductionImportOperatorTestSeams = Object.freeze({
  reconstructRecoveredImportReceipt,
});

async function main(): Promise<void> {
  requireGenesis001LegacyGreaterRealmProductionCliReadOnly({
    entrypoint: 'import',
    arguments_: process.argv.slice(2),
  });
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionImportArguments(process.argv.slice(2));
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
    fail('GREATER_REALM_PRODUCTION_IMPORT_ADMIN_SECRET_SOURCE_INVALID');
  }
  const result = await executeGreaterRealmProductionImportOperator({
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
      error instanceof GreaterRealmProductionImportOperatorError
        ? error.code
        : error !== null
          && typeof error === 'object'
          && 'code' in error
          && typeof error.code === 'string'
          ? error.code
          : 'GREATER_REALM_PRODUCTION_IMPORT_OPERATOR_FAILED',
    );
    process.exitCode = 1;
  });
}
