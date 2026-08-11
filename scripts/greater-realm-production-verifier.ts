import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertGreaterRealmPrivateInvocation } from './atlas/greater-realm-private-workspace';
import { GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE } from './greater-realm-production-relocation-core';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import {
  GREATER_REALM_PRODUCTION_MAX_FOUNDERS,
  verifyGreaterRealmActiveProductionStatus,
} from './greater-realm-production-verifier-core';
import {
  createGreaterRealmFreshAdminTransport,
  readGreaterRealmProductionAdminSecret,
  requireGreaterRealmProductionTransportTarget,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export class GreaterRealmProductionVerifierCliError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionVerifierCliError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionVerifierCliError(code);
}

export function parseGreaterRealmProductionVerifierArguments(
  arguments_: readonly string[],
): Readonly<{ expectedFounderCount: number }> {
  if (arguments_.length !== 1 || !arguments_[0]?.startsWith('--expected-founder-count=')) {
    fail(
      'GREATER_REALM_PRODUCTION_VERIFIER_USAGE: '
      + '--expected-founder-count=<1..600>',
    );
  }
  const value = arguments_[0].slice('--expected-founder-count='.length);
  if (!/^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u.test(value)) {
    fail('GREATER_REALM_PRODUCTION_VERIFIER_FOUNDER_COUNT_INVALID');
  }
  const expectedFounderCount = Number(value);
  if (expectedFounderCount > GREATER_REALM_PRODUCTION_MAX_FOUNDERS) {
    fail('GREATER_REALM_PRODUCTION_VERIFIER_FOUNDER_COUNT_INVALID');
  }
  return Object.freeze({ expectedFounderCount });
}

export async function executeGreaterRealmProductionVerifier(input: Readonly<{
  expectedFounderCount: number;
  adminSecret: string;
  environment: Readonly<Record<string, string | undefined>>;
  workspaceRoot?: string;
  attestProtectedMain?: () => string;
  inspect?: () => Promise<unknown>;
}>): Promise<ReturnType<typeof verifyGreaterRealmActiveProductionStatus>> {
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectGreaterRealmProductionProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const ownedTransport = input.inspect === undefined
    ? createGreaterRealmFreshAdminTransport({
        adminSecret: input.adminSecret,
        statusProcedure: GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
      })
    : undefined;
  const inspect = input.inspect ?? ownedTransport!.inspect;
  try {
    return verifyGreaterRealmActiveProductionStatus({
      value: await inspect(),
      expectedFounderCount: input.expectedFounderCount,
      expectedAtlasSourceCommit: provenance.atlasSourceCommit,
      expectedAtlasId: provenance.atlasId,
      expectedPublicReleaseId: provenance.publicReleaseId,
      expectedReleaseSha256: provenance.expectedReleaseSha256,
      moduleSourceCommit: provenance.moduleSourceCommit,
    });
  } finally {
    await ownedTransport?.close();
  }
}

async function main(): Promise<void> {
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionVerifierArguments(process.argv.slice(2));
  const adminSecret = readGreaterRealmProductionAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  console.log(JSON.stringify(await executeGreaterRealmProductionVerifier({
    ...parsed,
    adminSecret,
    environment: process.env,
  })));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && typeof error.code === 'string'
        ? error.code
        : 'GREATER_REALM_PRODUCTION_VERIFIER_FAILED',
    );
    process.exitCode = 1;
  });
}
