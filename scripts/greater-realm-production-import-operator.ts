import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertGreaterRealmPrivateInvocation,
} from './atlas/greater-realm-private-workspace';
import {
  defaultGreaterRealmCutoverReceiptDirectory,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from './greater-realm-cutover-receipts';
import {
  executeGreaterRealmProductionImport,
  verifyGreaterRealmProductionImportAuthority,
} from './greater-realm-production-import-core';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import { GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE } from './greater-realm-production-relocation-core';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
  readGreaterRealmProductionAdminSecret,
  requireGreaterRealmProductionTransportTarget,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMPORT_EPOCH = 1n;
const PUBLIC_NAME = 'The Greater Realm';
const STATUS_PROCEDURE = 'admin_get_greater_realm_status_v1';

type Command = 'inspect' | 'apply';

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
): Readonly<{ command: Command; confirmed: boolean }> {
  const command = arguments_[0];
  const flags = arguments_.slice(1);
  if (
    (command !== 'inspect' && command !== 'apply')
    || flags.some(flag => flag !== '--confirm')
    || new Set(flags).size !== flags.length
    || (command === 'inspect' && flags.length !== 0)
    || (command === 'apply' && flags.length !== 1)
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_USAGE: <inspect|apply --confirm>');
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

export async function executeGreaterRealmProductionImportOperator(input: Readonly<{
  command: Command;
  confirmed: boolean;
  adminSecret: string;
  environment: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  receiptDirectory?: string;
  attestProtectedMain?: () => string;
}>): Promise<Readonly<Record<string, unknown>>> {
  if (input.command === 'apply' && !input.confirmed) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_CONFIRMATION_REQUIRED');
  }
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectGreaterRealmProductionProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const { artifacts, workspace, atlasSourceCommit, moduleSourceCommit } = provenance;
  const session = createGreaterRealmAdminTransportSession({
    adminSecret: input.adminSecret,
  });
  const transport = bindGreaterRealmProductionStatusTransport(session, STATUS_PROCEDURE);
  const authorityTransport = bindGreaterRealmProductionStatusTransport(
    session,
    GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
  );
  try {
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

    const receiptDirectory = input.receiptDirectory
      ?? defaultGreaterRealmCutoverReceiptDirectory();
    return await withGreaterRealmCutoverOperatorLock({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      operation: () => workspace.withExclusiveLock('production-import-v1.lock', async () => {
        const receipt = await executeGreaterRealmProductionImport({
          artifacts,
          moduleSourceCommit,
          importEpoch: IMPORT_EPOCH,
          publicName: PUBLIC_NAME,
          transport: Object.freeze({
            inspect: transport.inspect,
            inspectAuthority: authorityTransport.inspect,
            submit: transport.submit,
          }),
        });
        const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          kind: 'warpkeep-greater-realm-production-import-v1',
          record: { ...receipt },
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
    await session.close();
  }
}

async function main(): Promise<void> {
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionImportArguments(process.argv.slice(2));
  const adminSecret = readGreaterRealmProductionAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  const result = await executeGreaterRealmProductionImportOperator({
    ...parsed,
    adminSecret,
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
