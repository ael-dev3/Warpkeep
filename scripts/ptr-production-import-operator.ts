import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readPtrGreaterRealmRuntimeRelease,
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  openGreaterRealmPrivateWorkspace,
} from './atlas/greater-realm-private-workspace';
import {
  PtrProductionAdminTokenError,
  takePtrProductionAdminSecret,
} from './ptr-production-admin-token';
import {
  executePtrProductionImport,
  parsePtrProductionImportArguments,
  projectPtrProductionStatus,
  ptrProductionImportConfirmationDigest,
  ptrProductionImportReceiptDigest,
  PtrProductionImportError,
  PTR_PRODUCTION_IMPORT_TARGET,
  type PtrProductionImportReceipt,
  type PtrProductionStatus,
} from './ptr-production-import-core';
import {
  preparePtrSourceBuiltArtifact,
  ptrProductionPublishReceiptDigest,
  PtrProductionPublisherError,
} from './ptr-production-publisher.mjs';
import {
  writePrivatePtrProductionReceipt,
  readPrivatePtrProductionPublishReceipt,
  PtrProductionReceiptFileError,
} from './ptr-production-receipt-file';
import {
  createPtrAtlasImportTransport,
  PtrProductionTransportError,
} from './ptr-production-transport';
import { greaterRealmProductionImportEngine } from './greater-realm-production-import-core';
import {
  attestGreaterRealmProductionProtectedMain,
  attestGreaterRealmProductionSourceAncestry,
} from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const IMPORT_EPOCH = 1n;
const PUBLIC_NAME = 'The Greater Realm';
const SHA256 = /^[0-9a-f]{64}$/u;

export class PtrProductionImportOperatorError extends Error {
  constructor(readonly code: string, readonly submitted = false) {
    super(code);
    this.name = 'PtrProductionImportOperatorError';
  }
}

function fail(code: string, submitted = false): never {
  throw new PtrProductionImportOperatorError(code, submitted);
}

function localEnvironment(environment: NodeJS.ProcessEnv): Readonly<{
  dependencyCacheRoot: string;
  receiptDirectory: string;
  materializationParent?: string;
  workspaceRoot?: string;
  executable: string;
}> {
  const dependencyCacheRoot = environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const receiptDirectory = environment.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  const materializationParent = environment.WK_PTR_MATERIALIZATION_PARENT;
  const workspaceRoot = environment.WARPKEEP_GREATER_REALM_WORKSPACE;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE
    ?? environment.SPACETIME_BIN
    ?? 'spacetime';
  delete environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  delete environment.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  delete environment.WK_PTR_MATERIALIZATION_PARENT;
  delete environment.WARPKEEP_GREATER_REALM_WORKSPACE;
  delete environment.WARPKEEP_SPACETIME_EXECUTABLE;
  delete environment.SPACETIME_BIN;
  if (
    environment.WARPKEEP_SPACETIMEDB_URI !== undefined
    || environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
    || environment.WARPKEEP_PTR_SPACETIMEDB_DATABASE !== undefined
    || environment.WARPKEEP_AUTH_BRIDGE_URL !== undefined
    || typeof dependencyCacheRoot !== 'string'
    || !isAbsolute(dependencyCacheRoot)
    || typeof receiptDirectory !== 'string'
    || !isAbsolute(receiptDirectory)
    || (materializationParent !== undefined && !isAbsolute(materializationParent))
    || (workspaceRoot !== undefined && !isAbsolute(workspaceRoot))
  ) fail('PTR_PRODUCTION_IMPORT_ENVIRONMENT_INVALID');
  return Object.freeze({
    dependencyCacheRoot,
    receiptDirectory,
    executable,
    ...(materializationParent === undefined ? {} : { materializationParent }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  });
}

type Authority = Readonly<{
  atlasId: string;
  sourceCommit: string;
  releaseSha256: string;
  publicReleaseId: string;
  publicApprovalReceiptId: string;
  headerJson: string;
}>;

function assertLiveAtlasBinding(
  status: PtrProductionStatus,
  authority: Authority,
): void {
  if (status.present && (
    status.atlasId !== authority.atlasId
    || status.publicReleaseId !== authority.publicReleaseId
    || status.publicApprovalReceiptId !== authority.publicApprovalReceiptId
    || status.sourceCommit !== authority.sourceCommit
    || status.expectedReleaseSha256 !== authority.releaseSha256
    || status.releaseHeaderSha256 !== createHash('sha256')
      .update(authority.headerJson).digest('hex')
    || status.importEpoch !== IMPORT_EPOCH
  )) fail('PTR_PRODUCTION_IMPORT_LIVE_BINDING_MISMATCH');
  if (status.ownerProvisioned || status.ownerEnabled) {
    fail('PTR_PRODUCTION_IMPORT_OWNER_STATE_NOT_ZERO');
  }
}

function privacySafeStatus(
  status: PtrProductionStatus,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    present: status.present,
    state: status.state,
    ready: status.ready,
    importsExact: status.importsExact,
    importEpoch: status.importEpoch?.toString() ?? null,
    verificationPhase: status.verificationPhase,
    verificationCursor: status.verificationCursor.toString(),
    verificationDigest: status.verificationDigest,
    regionManifestRows: status.regionManifestRows,
    componentRows: status.componentRows.toString(),
    chunkRows: status.chunkRows.toString(),
    cellRows: status.cellRows.toString(),
    slotRows: status.slotRows.toString(),
    resourceRows: status.resourceRows.toString(),
    claimRows: status.claimRows.toString(),
    occupancyRows: status.occupancyRows.toString(),
    activationRows: status.activationRows.toString(),
    publicAtlasRows: status.publicAtlasRows.toString(),
    publicRegionRows: status.publicRegionRows.toString(),
    workerSystemRows: status.workerSystemRows.toString(),
    atlasImportMutationsCompiled: status.importMutationsCompiled,
    atlasActivationMutationsCompiled: status.activationMutationsCompiled,
    ownerProvisioned: status.ownerProvisioned,
    ownerEnabled: status.ownerEnabled,
  });
}

function verifyImportReceiptBinding(
  receipt: PtrProductionImportReceipt,
  input: Readonly<{
    databaseIdentity: string;
    moduleSourceCommit: string;
    moduleSha256: string;
    moduleTreeId: string;
    dependencyClosureDigest: string;
    spacetimeExecutableSha256: string;
    authority: Authority;
    releaseManifestSha256: string;
  }>,
): void {
  const { importReceiptDigest, ...withoutDigest } = receipt;
  if (
    ptrProductionImportReceiptDigest(withoutDigest) !== importReceiptDigest
    || receipt.databaseIdentity !== input.databaseIdentity
    || receipt.moduleSourceCommit !== input.moduleSourceCommit
    || receipt.moduleSha256 !== input.moduleSha256
    || receipt.moduleTreeId !== input.moduleTreeId
    || receipt.dependencyClosureDigest !== input.dependencyClosureDigest
    || receipt.spacetimeExecutableSha256 !== input.spacetimeExecutableSha256
    || receipt.atlasSourceCommit !== input.authority.sourceCommit
    || receipt.publicReleaseId !== input.authority.publicReleaseId
    || receipt.expectedReleaseSha256 !== input.authority.releaseSha256
    || receipt.releaseHeaderSha256 !== createHash('sha256')
      .update(input.authority.headerJson).digest('hex')
    || receipt.releaseManifestSha256 !== input.releaseManifestSha256
    || receipt.importEpoch !== IMPORT_EPOCH.toString()
  ) fail('PTR_PRODUCTION_IMPORT_RECEIPT_BINDING_INVALID', true);
}

function verifyPublishReceiptBinding(
  value: Readonly<Record<string, unknown>>,
  input: Readonly<{
    expectedReceiptDigest: string;
    databaseIdentity: string;
    moduleSourceCommit: string;
    moduleSha256: string;
    moduleTreeId: string;
    dependencyClosureDigest: string;
    spacetimeExecutableSha256: string;
    spacetimeCliConfigSha256: string;
  }>,
): void {
  const { publishReceiptDigest, ...withoutDigest } = value;
  if (
    publishReceiptDigest !== input.expectedReceiptDigest
    || ptrProductionPublishReceiptDigest(withoutDigest)
      !== input.expectedReceiptDigest
    || value.databaseIdentity !== input.databaseIdentity
    || value.sourceCommit !== input.moduleSourceCommit
    || value.moduleSha256 !== input.moduleSha256
    || value.moduleTreeId !== input.moduleTreeId
    || value.dependencyClosureDigest !== input.dependencyClosureDigest
    || value.spacetimeExecutableSha256 !== input.spacetimeExecutableSha256
    || value.spacetimeCliConfigSha256 !== input.spacetimeCliConfigSha256
  ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_BINDING_INVALID');
}

function isStableOperatorError(error: unknown): boolean {
  return error instanceof PtrProductionImportOperatorError
    || error instanceof PtrProductionImportError
    || error instanceof PtrProductionPublisherError
    || error instanceof PtrProductionAdminTokenError
    || error instanceof PtrProductionTransportError;
}

function normalizeFailure(error: unknown, mutationStarted: boolean): never {
  if (mutationStarted) {
    if (error instanceof PtrProductionReceiptFileError) {
      fail(
        'PTR_PRODUCTION_EVIDENCE_WRITE_FAILED_MANUAL_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (
      isStableOperatorError(error)
      && typeof error === 'object'
      && error !== null
      && 'submitted' in error
      && error.submitted === true
    ) throw error;
    fail(
      'PTR_PRODUCTION_OPERATOR_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      true,
    );
  }
  if (isStableOperatorError(error)) throw error;
  if (error instanceof PtrProductionReceiptFileError) throw error;
  fail('PTR_PRODUCTION_IMPORT_OPERATOR_FAILED');
}

export async function executePtrProductionImportOperator(input: Readonly<{
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
  attestProtectedMain?: () => string;
  dependencies?: Readonly<{
    prepareArtifact?: typeof preparePtrSourceBuiltArtifact;
    openWorkspace?: typeof openGreaterRealmPrivateWorkspace;
    readRuntimeRelease?: typeof readPtrGreaterRealmRuntimeRelease;
    verifyRuntimeRelease?: typeof verifyPtrGreaterRealmRuntimeReleaseArtifacts;
    importAuthority?: typeof greaterRealmProductionImportEngine.importAuthority;
    readPublishReceipt?: typeof readPrivatePtrProductionPublishReceipt;
    attestSourceAncestry?: typeof attestGreaterRealmProductionSourceAncestry;
    createTransport?: typeof createPtrAtlasImportTransport;
    executeImport?: typeof executePtrProductionImport;
    writeReceipt?: typeof writePrivatePtrProductionReceipt;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  let adminSecret = '';
  let artifact: ReturnType<typeof preparePtrSourceBuiltArtifact> | undefined;
  let session: ReturnType<typeof createPtrAtlasImportTransport> | undefined;
  let mutationStarted = false;
  let failure: unknown;
  let failed = false;
  let cleanupFailed = false;
  let result: Readonly<Record<string, unknown>> | undefined;
  try {
    const arguments_ = parsePtrProductionImportArguments(input.arguments);
    const ownerAuthorityPresent = input.environment.WARPKEEP_PTR_LAUNCH_ENTROPY
      !== undefined
      || input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID !== undefined;
    delete input.environment.WARPKEEP_PTR_LAUNCH_ENTROPY;
    delete input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
    if (ownerAuthorityPresent) {
      fail('PTR_PRODUCTION_IMPORT_OWNER_AUTHORITY_FORBIDDEN');
    }
    adminSecret = takePtrProductionAdminSecret(input.environment);
    const local = localEnvironment(input.environment);
    const dependencies = input.dependencies ?? {};
    if (Reflect.ownKeys(dependencies).some(key => typeof key !== 'string'
      || /owner|entropy|proof|token|callback/iu.test(key))) {
      fail('PTR_PRODUCTION_IMPORT_OWNER_AUTHORITY_FORBIDDEN');
    }
    const prepareArtifact = dependencies.prepareArtifact
      ?? preparePtrSourceBuiltArtifact;
    const openWorkspace = dependencies.openWorkspace
      ?? openGreaterRealmPrivateWorkspace;
    const readRuntimeRelease = dependencies.readRuntimeRelease
      ?? readPtrGreaterRealmRuntimeRelease;
    const verifyRuntimeRelease = dependencies.verifyRuntimeRelease
      ?? verifyPtrGreaterRealmRuntimeReleaseArtifacts;
    const importAuthority = dependencies.importAuthority
      ?? greaterRealmProductionImportEngine.importAuthority;
    const readPublishReceipt = dependencies.readPublishReceipt
      ?? readPrivatePtrProductionPublishReceipt;
    const attestSourceAncestry = dependencies.attestSourceAncestry
      ?? attestGreaterRealmProductionSourceAncestry;
    const createTransport = dependencies.createTransport
      ?? createPtrAtlasImportTransport;
    const executeImport = dependencies.executeImport
      ?? executePtrProductionImport;
    const writeReceipt = dependencies.writeReceipt
      ?? writePrivatePtrProductionReceipt;
    const attest = input.attestProtectedMain
      ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT));
    const sourceCommit = attest();
    if (sourceCommit !== arguments_.moduleSourceCommit) {
      fail('PTR_PRODUCTION_IMPORT_PROTECTED_MAIN_MISMATCH');
    }
    artifact = prepareArtifact({
      sourceCommit,
      reattestSource: attest,
      dependencyCacheRoot: local.dependencyCacheRoot,
      materializationParent: local.materializationParent,
      executable: local.executable,
      environment: input.environment,
    });
    if (
      artifact.moduleSha256 !== arguments_.moduleSha256
      || artifact.moduleTreeId !== arguments_.moduleTreeId
      || artifact.dependencyClosureDigest !== arguments_.dependencyClosureDigest
      || artifact.spacetimeExecutableSha256
        !== arguments_.spacetimeExecutableSha256
    ) fail('PTR_PRODUCTION_IMPORT_MODULE_BINDING_MISMATCH');
    const publishEvidence = readPublishReceipt({
      directory: local.receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      expectedReceiptDigest: arguments_.publishReceiptDigest,
    });
    verifyPublishReceiptBinding(publishEvidence.receipt, {
      expectedReceiptDigest: arguments_.publishReceiptDigest,
      databaseIdentity: arguments_.databaseIdentity,
      moduleSourceCommit: sourceCommit,
      moduleSha256: artifact.moduleSha256,
      moduleTreeId: artifact.moduleTreeId,
      dependencyClosureDigest: artifact.dependencyClosureDigest,
      spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
      spacetimeCliConfigSha256: arguments_.spacetimeCliConfigSha256,
    });
    const workspace = openWorkspace({
      repositoryRoot: REPOSITORY_ROOT,
      workspaceRoot: local.workspaceRoot,
    });
    const artifacts = readRuntimeRelease(workspace);
    verifyRuntimeRelease(artifacts);
    const authority = importAuthority(
      artifacts,
      verifyRuntimeRelease,
    ) as Authority;
    if (
      authority.atlasId !== PTR_PRODUCTION_IMPORT_TARGET.atlasId
      || authority.sourceCommit !== arguments_.atlasSourceCommit
      || authority.releaseSha256 !== arguments_.releaseSha256
      || !SHA256.test(authority.releaseSha256)
    ) fail('PTR_PRODUCTION_IMPORT_ATLAS_BINDING_MISMATCH');
    attestSourceAncestry({
      repositoryRoot: REPOSITORY_ROOT,
      atlasSourceCommit: authority.sourceCommit,
      moduleSourceCommit: sourceCommit,
    });
    const disallowedDatabaseIdentities = Object.freeze([
      arguments_.genesis002DatabaseIdentity,
    ]);
    const confirmationInput = Object.freeze({
      databaseIdentity: arguments_.databaseIdentity,
      disallowedDatabaseIdentities,
      moduleSourceCommit: sourceCommit,
      moduleSha256: artifact.moduleSha256,
      moduleTreeId: artifact.moduleTreeId,
      dependencyClosureDigest: artifact.dependencyClosureDigest,
      spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
      spacetimeCliConfigSha256: arguments_.spacetimeCliConfigSha256,
      publishReceiptDigest: arguments_.publishReceiptDigest,
      atlasSourceCommit: authority.sourceCommit,
      releaseSha256: authority.releaseSha256,
      publicReleaseId: authority.publicReleaseId,
      importEpoch: IMPORT_EPOCH,
    });
    const confirmationDigest = ptrProductionImportConfirmationDigest(
      confirmationInput,
    );
    if (
      arguments_.command === 'apply'
      && arguments_.confirmationDigest !== confirmationDigest
    ) fail('PTR_PRODUCTION_IMPORT_CONFIRMATION_INVALID');
    session = createTransport({
      databaseIdentity: arguments_.databaseIdentity,
      adminSecret,
      disallowedDatabaseIdentities,
    });
    adminSecret = '';
    if (Object.hasOwn(session, 'provisionOwner')) {
      fail('PTR_PRODUCTION_IMPORT_OWNER_AUTHORITY_FORBIDDEN');
    }
    const initialStatus = projectPtrProductionStatus(await session.inspect());
    assertLiveAtlasBinding(initialStatus, authority);
    if (arguments_.command === 'inspect') {
      artifact.assertSourceAndArtifact();
      result = Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep.ptr.production-import-inspection.v1',
        ...confirmationInput,
        importEpoch: IMPORT_EPOCH.toString(),
        databaseAlias: PTR_PRODUCTION_IMPORT_TARGET.databaseAlias,
        moduleIdentity: PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity,
        releaseVersion: PTR_PRODUCTION_IMPORT_TARGET.releaseVersion,
        atlasId: PTR_PRODUCTION_IMPORT_TARGET.atlasId,
        confirmationDigest,
        currentAtlasStatus: privacySafeStatus(initialStatus),
        mutationSurface: 'atlas-import-only',
        zeroPopulationBoundary: true,
        atlasImportMutationsCompiled: true,
        activationMutationsEnabled: false,
        admissionsOpen: false,
        accessRequestsOpen: false,
        admissionSurfacePresent: false,
        accessRequestSurfacePresent: false,
        privacySafe: true,
      });
    } else {
      if (initialStatus.ready && !initialStatus.ownerProvisioned) {
        fail(
          'PTR_PRODUCTION_IMPORT_PRIOR_READY_STATE_MANUAL_RECONCILIATION_REQUIRED',
          true,
        );
      }
      if (initialStatus.ownerProvisioned || initialStatus.ownerEnabled) {
        fail('PTR_PRODUCTION_OWNER_ALREADY_PROVISIONED');
      }
      let interrupted = false;
      const interrupt = () => { interrupted = true; };
      const assertCanStartWrite = () => {
        if (interrupted) fail('PTR_PRODUCTION_IMPORT_INTERRUPTED');
        artifact?.assertSourceAndArtifact();
        mutationStarted = true;
      };
      const assertNotInterrupted = () => {
        if (interrupted) {
          fail('PTR_PRODUCTION_IMPORT_INTERRUPTED', mutationStarted);
        }
      };
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      try {
        const importReceipt = await executeImport({
          artifacts,
          databaseIdentity: arguments_.databaseIdentity,
          disallowedDatabaseIdentities,
          moduleSourceCommit: sourceCommit,
          moduleSha256: artifact.moduleSha256,
          moduleTreeId: artifact.moduleTreeId,
          dependencyClosureDigest: artifact.dependencyClosureDigest,
          spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
          importEpoch: IMPORT_EPOCH,
          publicName: PUBLIC_NAME,
          transport: session,
          assertCanStartWrite,
        });
        verifyImportReceiptBinding(importReceipt, {
          databaseIdentity: arguments_.databaseIdentity,
          moduleSourceCommit: sourceCommit,
          moduleSha256: artifact.moduleSha256,
          moduleTreeId: artifact.moduleTreeId,
          dependencyClosureDigest: artifact.dependencyClosureDigest,
          spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
          authority,
          releaseManifestSha256: createHash('sha256')
            .update(artifacts.manifestBytes).digest('hex'),
        });
        assertNotInterrupted();
        artifact.assertSourceAndArtifact();
        const ptrAtlasImportReceiptFile = writeReceipt({
          directory: local.receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          kind: 'atlas-import',
          receipt: importReceipt,
        });
        assertNotInterrupted();
        result = Object.freeze({
          ptrAtlasImportReceipt: importReceipt,
          ptrAtlasImportReceiptEvidence: Object.freeze({
            receiptFileSha256:
              ptrAtlasImportReceiptFile.receiptFileSha256,
            result: ptrAtlasImportReceiptFile.result,
          }),
          privacySafe: true,
          activationWrites: 'none',
          publicRootWrites: 'none',
        });
      } finally {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
      }
    }
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    delete input.environment.WARPKEEP_ADMIN_TOKEN_SECRET;
    delete input.environment.WARPKEEP_PTR_LAUNCH_ENTROPY;
    delete input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
    adminSecret = '';
    try { await session?.close(); } catch { cleanupFailed = true; }
    try { artifact?.cleanup(); } catch { cleanupFailed = true; }
  }
  if (failed) normalizeFailure(failure, mutationStarted);
  if (cleanupFailed) {
    fail(
      mutationStarted
        ? 'PTR_PRODUCTION_CLEANUP_FAILED_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_PRODUCTION_CLEANUP_FAILED',
      mutationStarted,
    );
  }
  if (result === undefined) fail('PTR_PRODUCTION_IMPORT_OPERATOR_FAILED');
  return result;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await executePtrProductionImportOperator({
      arguments: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof PtrProductionImportOperatorError
      || error instanceof PtrProductionImportError
      || error instanceof PtrProductionPublisherError
      || error instanceof PtrProductionAdminTokenError
      || error instanceof PtrProductionTransportError
      || error instanceof PtrProductionReceiptFileError
      ? error.code
      : 'PTR_PRODUCTION_IMPORT_OPERATOR_FAILED';
    const submitted = error instanceof PtrProductionImportOperatorError
      || error instanceof PtrProductionImportError
      ? error.submitted
      : false;
    process.stderr.write(`${code}${
      submitted ? ':MANUAL_RECONCILIATION_REQUIRED' : ''
    }\n`);
    process.exitCode = 1;
  }
}
