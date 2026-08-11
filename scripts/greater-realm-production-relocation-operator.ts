import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertGreaterRealmPrivateInvocation } from './atlas/greater-realm-private-workspace';
import {
  defaultGreaterRealmCutoverReceiptDirectory,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from './greater-realm-cutover-receipts';
import {
  executeGreaterRealmProductionRelocation,
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
  GREATER_REALM_PRODUCTION_RELOCATION_COMMAND,
  type GreaterRealmProductionRelocationCommand,
  type GreaterRealmProductionRelocationTransport,
} from './greater-realm-production-relocation-core';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import {
  createGreaterRealmFreshAdminTransport,
  readGreaterRealmProductionAdminSecret,
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
  command: GreaterRealmProductionRelocationCommand;
  confirmed: boolean;
}> {
  const command = arguments_[0] as GreaterRealmProductionRelocationCommand | undefined;
  const flags = arguments_.slice(1);
  const validCommand = command !== undefined
    && Object.values(GREATER_REALM_PRODUCTION_RELOCATION_COMMAND).includes(command);
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
      + '[--confirm]',
    );
  }
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

export async function executeGreaterRealmProductionRelocationOperator(input: Readonly<{
  command: GreaterRealmProductionRelocationCommand;
  confirmed: boolean;
  adminSecret: string;
  environment: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  receiptDirectory?: string;
  attestProtectedMain?: () => string;
  transport?: GreaterRealmProductionRelocationTransport;
}>): Promise<Readonly<Record<string, unknown>>> {
  if (input.command !== 'inspect' && !input.confirmed) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_CONFIRMATION_REQUIRED');
  }
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
  const ownedTransport = input.transport === undefined
    ? createGreaterRealmFreshAdminTransport({
        adminSecret: input.adminSecret,
        statusProcedure: GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
      })
    : undefined;
  const transport = input.transport ?? ownedTransport!;
  try {
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

    const receiptDirectory = input.receiptDirectory
      ?? defaultGreaterRealmCutoverReceiptDirectory();
    return await withGreaterRealmCutoverOperatorLock({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      operation: async () => {
        const receipt = await executeGreaterRealmProductionRelocation({
          command: input.command,
          confirmed: input.confirmed,
          expectedAtlasSourceCommit: atlasSourceCommit,
          expectedAtlasId: atlasId,
          expectedPublicReleaseId: publicReleaseId,
          expectedReleaseSha256,
          moduleSourceCommit,
          transport,
        });
        const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          kind: 'warpkeep-greater-realm-production-relocation-v1',
          record: { ...receipt },
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

async function main(): Promise<void> {
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionRelocationArguments(process.argv.slice(2));
  const adminSecret = readGreaterRealmProductionAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  const result = await executeGreaterRealmProductionRelocationOperator({
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
