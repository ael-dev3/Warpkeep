import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertGreaterRealmPrivateInvocation } from './atlas/greater-realm-private-workspace';
import {
  defaultGreaterRealmProductionPagesEvidenceDirectory,
  GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
  verifyAndWritePrivateGreaterRealmProductionPagesEvidence,
} from './greater-realm-production-pages-evidence';
import {
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BOOTSTRAP_PROFILE = 'warpkeep-greater-realm-production-bootstrap-v1';
const FOUNDER_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u;

export class GreaterRealmProductionPagesEvidenceOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionPagesEvidenceOperatorError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionPagesEvidenceOperatorError(code);
}

export function parseGreaterRealmProductionPagesEvidenceOperatorArguments(
  arguments_: readonly string[],
): Readonly<{ expectedFounderCount: number }> {
  if (
    arguments_.length !== 1
    || !arguments_[0]?.startsWith('--expected-founder-count=')
  ) {
    fail(
      'GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_USAGE: '
      + '--expected-founder-count=<1..600>',
    );
  }
  const raw = arguments_[0].slice('--expected-founder-count='.length);
  if (!FOUNDER_COUNT.test(raw)) {
    fail('GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_FOUNDER_COUNT_INVALID');
  }
  return Object.freeze({ expectedFounderCount: Number(raw) });
}

type PagesEvidenceOperatorDependencies = Readonly<{
  inspectProvenance: typeof inspectGreaterRealmProductionProvenance;
  writeEvidence: typeof verifyAndWritePrivateGreaterRealmProductionPagesEvidence;
}>;

const PRODUCTION_DEPENDENCIES = Object.freeze({
  inspectProvenance: inspectGreaterRealmProductionProvenance,
  writeEvidence: verifyAndWritePrivateGreaterRealmProductionPagesEvidence,
}) satisfies PagesEvidenceOperatorDependencies;

export async function executeGreaterRealmProductionPagesEvidenceOperator(
  input: Readonly<{
    expectedFounderCount: number;
    adminSecretPath: string;
    environment: Readonly<Record<string, string | undefined>>;
    repositoryRoot?: string;
    workspaceRoot?: string;
    directory?: string;
    testOnlyDependencies?: PagesEvidenceOperatorDependencies;
  }>,
): Promise<Readonly<{
  filename: string;
  evidenceDigest: string;
  recordedAt: string;
  expiresAt: string;
  result: 'installed' | 'unchanged';
  expectedFounderCount: number;
  founderCapacityRemaining: number;
  activeAdmissionEligible: boolean;
}>> {
  if (
    input.testOnlyDependencies !== undefined
    && process.env.NODE_ENV !== 'test'
  ) fail('GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TEST_ONLY_DEPENDENCY_FORBIDDEN');
  if (
    !Number.isSafeInteger(input.expectedFounderCount)
    || input.expectedFounderCount < 1
    || input.expectedFounderCount > 600
  ) fail('GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_FOUNDER_COUNT_INVALID');
  if (typeof input.adminSecretPath !== 'string' || input.adminSecretPath.length === 0) {
    fail('GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_ADMIN_SECRET_PATH_REQUIRED');
  }

  const repositoryRoot = input.repositoryRoot ?? REPOSITORY_ROOT;
  const dependencies = input.testOnlyDependencies ?? PRODUCTION_DEPENDENCIES;
  // Resolve and attest every local source input before the evidence writer is
  // allowed to open the administrator secret or create an authenticated
  // transport. The writer repeats this provenance check inside its verifier.
  const provenance = dependencies.inspectProvenance({
    repositoryRoot,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: () => (
      attestGreaterRealmProductionProtectedMain(repositoryRoot)
    ),
  });
  const result = await dependencies.writeEvidence({
    directory: input.directory
      ?? defaultGreaterRealmProductionPagesEvidenceDirectory(),
    repositoryRoot,
    adminSecretPath: input.adminSecretPath,
    environment: input.environment,
    workspaceRoot: input.workspaceRoot,
    expectedSourceRelease: {
      atlasSourceCommit: provenance.atlasSourceCommit,
      atlasId: provenance.atlasId,
      publicReleaseId: provenance.publicReleaseId,
      expectedReleaseSha256: provenance.expectedReleaseSha256,
      moduleSourceCommit: provenance.moduleSourceCommit,
    },
    expectedFounderCount: input.expectedFounderCount,
    maximumAgeMilliseconds:
      GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
  });

  return Object.freeze({
    filename: basename(result.path),
    evidenceDigest: result.evidenceDigest,
    recordedAt: result.recordedAt,
    expiresAt: result.expiresAt,
    result: result.result,
    expectedFounderCount: result.evidence.expectedFounderCount,
    founderCapacityRemaining: result.evidence.founderCapacityRemaining,
    activeAdmissionEligible: result.evidence.activeAdmissionEligible,
  });
}

async function main(): Promise<void> {
  assertGreaterRealmPrivateInvocation();
  const parsed = parseGreaterRealmProductionPagesEvidenceOperatorArguments(
    process.argv.slice(2),
  );
  if (process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE !== BOOTSTRAP_PROFILE) {
    fail('GREATER_REALM_PRODUCTION_TRUSTED_BOOTSTRAP_REQUIRED');
  }
  const adminSecretPath = process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  delete process.env.WKGR_PRODUCTION_PROTECTED_COMMIT;
  delete process.env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  if (typeof adminSecretPath !== 'string' || adminSecretPath.length === 0) {
    fail('GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_ADMIN_SECRET_PATH_REQUIRED');
  }
  console.log(JSON.stringify(
    await executeGreaterRealmProductionPagesEvidenceOperator({
      ...parsed,
      adminSecretPath,
      environment: process.env,
    }),
  ));
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
        : 'GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_FAILED',
    );
    process.exitCode = 1;
  });
}
