import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readGenesis002GreaterRealmRuntimeRelease,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  openGreaterRealmPrivateWorkspace,
} from './atlas/greater-realm-private-workspace';
import {
  executeGenesis002ProductionImport,
  genesis002ProductionImportConfirmationDigest,
  parseGenesis002ProductionImportArguments,
  projectGenesis002ProductionImportStatus,
  Genesis002ProductionImportError,
  GENESIS_002_PRODUCTION_IMPORT_TARGET,
} from './genesis002-production-import-core';
import {
  prepareGenesis002SourceBuiltArtifact,
  Genesis002ProductionPublisherError,
} from './genesis002-production-publisher.mjs';
import {
  verifyGenesis002ImportRealmBoundary,
  verifyGenesis002SealedLiveStatus,
  Genesis002SealedLiveReceiptError,
} from './genesis002-sealed-live-receipt.mjs';
import {
  createGenesis002ProductionTransport,
  Genesis002ProductionTransportError,
  takeGenesis002ProductionAdminSecret,
} from './genesis002-production-transport';
import { greaterRealmProductionImportEngine } from './greater-realm-production-import-core';
import {
  attestGreaterRealmProductionProtectedMain,
  attestGreaterRealmProductionSourceAncestry,
} from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const IMPORT_EPOCH = 1n;
const PUBLIC_NAME = 'The Greater Realm';

export class Genesis002ProductionImportOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'Genesis002ProductionImportOperatorError';
  }
}

function fail(code: string): never {
  throw new Genesis002ProductionImportOperatorError(code);
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

function localEnvironment(environment: NodeJS.ProcessEnv) {
  const dependencyCacheRoot = environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const materializationParent = environment.WK_G002_MATERIALIZATION_PARENT;
  const workspaceRoot = environment.WARPKEEP_GREATER_REALM_WORKSPACE;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE
    ?? environment.SPACETIME_BIN
    ?? 'spacetime';
  delete environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  delete environment.WK_G002_MATERIALIZATION_PARENT;
  delete environment.WARPKEEP_GREATER_REALM_WORKSPACE;
  delete environment.WARPKEEP_SPACETIME_EXECUTABLE;
  delete environment.SPACETIME_BIN;
  if (
    environment.WARPKEEP_SPACETIMEDB_URI !== undefined
    || environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
    || environment.WARPKEEP_AUTH_BRIDGE_URL !== undefined
    || typeof dependencyCacheRoot !== 'string'
    || !isAbsolute(dependencyCacheRoot)
    || (materializationParent !== undefined && !isAbsolute(materializationParent))
    || (workspaceRoot !== undefined && !isAbsolute(workspaceRoot))
  ) fail('GENESIS_002_PRODUCTION_IMPORT_ENVIRONMENT_INVALID');
  return Object.freeze({
    dependencyCacheRoot,
    executable,
    ...(materializationParent === undefined ? {} : { materializationParent }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  });
}

export async function executeGenesis002ProductionImportOperator(input: Readonly<{
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
  attestProtectedMain?: () => string;
  dependencies?: Readonly<{
    prepareArtifact?: typeof prepareGenesis002SourceBuiltArtifact;
    openWorkspace?: typeof openGreaterRealmPrivateWorkspace;
    readRuntimeRelease?: typeof readGenesis002GreaterRealmRuntimeRelease;
    verifyRuntimeRelease?: typeof verifyGenesis002GreaterRealmRuntimeReleaseArtifacts;
    attestSourceAncestry?: typeof attestGreaterRealmProductionSourceAncestry;
    createTransport?: typeof createGenesis002ProductionTransport;
    executeImport?: typeof executeGenesis002ProductionImport;
    verifyLiveStatus?: typeof verifyGenesis002SealedLiveStatus;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  const arguments_ = parseGenesis002ProductionImportArguments(input.arguments);
  const local = localEnvironment(input.environment);
  const dependencies = input.dependencies ?? {};
  const prepareArtifact = dependencies.prepareArtifact
    ?? prepareGenesis002SourceBuiltArtifact;
  const openWorkspace = dependencies.openWorkspace
    ?? openGreaterRealmPrivateWorkspace;
  const readRuntimeRelease = dependencies.readRuntimeRelease
    ?? readGenesis002GreaterRealmRuntimeRelease;
  const verifyRuntimeRelease = dependencies.verifyRuntimeRelease
    ?? verifyGenesis002GreaterRealmRuntimeReleaseArtifacts;
  const attestSourceAncestry = dependencies.attestSourceAncestry
    ?? attestGreaterRealmProductionSourceAncestry;
  const createTransport = dependencies.createTransport
    ?? createGenesis002ProductionTransport;
  const executeImport = dependencies.executeImport
    ?? executeGenesis002ProductionImport;
  const verifyLiveStatus = dependencies.verifyLiveStatus
    ?? verifyGenesis002SealedLiveStatus;
  let adminSecret = takeGenesis002ProductionAdminSecret(input.environment);
  const attest = input.attestProtectedMain
    ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT));
  const sourceCommit = attest();
  if (sourceCommit !== arguments_.moduleSourceCommit) {
    fail('GENESIS_002_PRODUCTION_IMPORT_PROTECTED_MAIN_MISMATCH');
  }
  const artifact = prepareArtifact({
    sourceCommit,
    reattestSource: attest,
    dependencyCacheRoot: local.dependencyCacheRoot,
    materializationParent: local.materializationParent,
    executable: local.executable,
    environment: input.environment,
  });
  let session: ReturnType<typeof createGenesis002ProductionTransport> | undefined;
  try {
    if (
      artifact.moduleSha256 !== arguments_.moduleSha256
      || artifact.moduleTreeId !== arguments_.moduleTreeId
      || artifact.dependencyClosureDigest !== arguments_.dependencyClosureDigest
      || artifact.spacetimeExecutableSha256 !== arguments_.spacetimeExecutableSha256
    ) fail('GENESIS_002_PRODUCTION_IMPORT_MODULE_BINDING_MISMATCH');
    const workspace = openWorkspace({
      repositoryRoot: REPOSITORY_ROOT,
      workspaceRoot: local.workspaceRoot,
    });
    const artifacts = readRuntimeRelease(workspace);
    verifyRuntimeRelease(artifacts);
    const authority = greaterRealmProductionImportEngine.importAuthority(
      artifacts,
      verifyRuntimeRelease,
    );
    if (
      authority.atlasId !== GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId
      || authority.sourceCommit !== arguments_.atlasSourceCommit
      || authority.releaseSha256 !== arguments_.releaseSha256
    ) fail('GENESIS_002_PRODUCTION_IMPORT_ATLAS_BINDING_MISMATCH');
    attestSourceAncestry({
      repositoryRoot: REPOSITORY_ROOT,
      atlasSourceCommit: authority.sourceCommit,
      moduleSourceCommit: sourceCommit,
    });
    const confirmationInput = Object.freeze({
      databaseIdentity: arguments_.databaseIdentity,
      moduleSourceCommit: sourceCommit,
      moduleSha256: artifact.moduleSha256,
      moduleTreeId: artifact.moduleTreeId,
      dependencyClosureDigest: artifact.dependencyClosureDigest,
      spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
      atlasSourceCommit: authority.sourceCommit,
      releaseSha256: authority.releaseSha256,
      publicReleaseId: authority.publicReleaseId,
      importEpoch: IMPORT_EPOCH,
    });
    const confirmationDigest = genesis002ProductionImportConfirmationDigest(
      confirmationInput,
    );
    session = createTransport({
      databaseIdentity: arguments_.databaseIdentity,
      adminSecret,
    });
    const initialAtlasValue = await session.inspect();
    const initialRealmValue = await session.inspectRealm();
    const initialAtlas = projectGenesis002ProductionImportStatus(initialAtlasValue);
    const initialRealm = verifyGenesis002ImportRealmBoundary({
      expectedPublicReleaseId: authority.publicReleaseId,
      realmStatusValue: initialRealmValue,
    });
    if (initialAtlas.present && (
      initialAtlas.atlasId !== authority.atlasId
      || initialAtlas.publicReleaseId !== authority.publicReleaseId
      || initialAtlas.publicApprovalReceiptId !== authority.publicApprovalReceiptId
      || initialAtlas.sourceCommit !== authority.sourceCommit
      || initialAtlas.expectedReleaseSha256 !== authority.releaseSha256
      || initialAtlas.releaseHeaderSha256 !== createHash('sha256')
        .update(authority.headerJson).digest('hex')
      || initialAtlas.importEpoch !== IMPORT_EPOCH
    )) fail('GENESIS_002_PRODUCTION_IMPORT_LIVE_BINDING_MISMATCH');
    if (arguments_.command === 'inspect') {
      const sealedLive = initialAtlas.ready
        ? verifyLiveStatus({
          databaseIdentity: arguments_.databaseIdentity,
          moduleSourceCommit: sourceCommit,
          moduleSha256: artifact.moduleSha256,
          atlasSourceCommit: authority.sourceCommit,
          publicReleaseId: authority.publicReleaseId,
          publicApprovalReceiptId: authority.publicApprovalReceiptId,
          releaseSha256: authority.releaseSha256,
          releaseHeaderSha256: createHash('sha256')
            .update(authority.headerJson).digest('hex'),
          verificationDigest: initialAtlas.verificationDigest,
          realmStatusValue: initialRealmValue,
          atlasStatusValue: initialAtlasValue,
        })
        : undefined;
      artifact.assertArtifact();
      adminSecret = '';
      return Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep.genesis-002.production-import-inspection.v1',
        ...confirmationInput,
        importEpoch: IMPORT_EPOCH.toString(),
        moduleIdentity: GENESIS_002_PRODUCTION_IMPORT_TARGET.moduleIdentity,
        atlasId: GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId,
        confirmationDigest,
        currentAtlasStatus: printable(initialAtlas),
        currentRealmBoundary: printable(initialRealm),
        mutationSurface: 'atlas-import-only',
        zeroPopulationBoundary: true,
        activationMutationsEnabled: false,
        playerPresentationEnabled: false,
        ...(sealedLive === undefined ? {} : {
          sealedLiveReceipt: sealedLive.receipt,
          sealedLiveReceiptDigest: sealedLive.receiptDigest,
          privacySafe: true,
        }),
      });
    }
    if (arguments_.confirmationDigest !== confirmationDigest) {
      fail('GENESIS_002_PRODUCTION_IMPORT_CONFIRMATION_INVALID');
    }
    let interrupted = false;
    const interrupt = () => { interrupted = true; };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      const receipt = await executeImport({
        artifacts,
        databaseIdentity: arguments_.databaseIdentity,
        moduleSourceCommit: sourceCommit,
        moduleSha256: artifact.moduleSha256,
        moduleTreeId: artifact.moduleTreeId,
        dependencyClosureDigest: artifact.dependencyClosureDigest,
        spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
        importEpoch: IMPORT_EPOCH,
        publicName: PUBLIC_NAME,
        transport: session,
        assertCanStartWrite: () => {
          if (interrupted) fail('GENESIS_002_PRODUCTION_IMPORT_INTERRUPTED');
          artifact.assertArtifact();
        },
      });
      const [realmStatusValue, atlasStatusValue] = await Promise.all([
        session.inspectRealm(),
        session.inspect(),
      ]);
      const live = verifyLiveStatus({
        databaseIdentity: arguments_.databaseIdentity,
        moduleSourceCommit: sourceCommit,
        moduleSha256: artifact.moduleSha256,
        atlasSourceCommit: authority.sourceCommit,
        publicReleaseId: authority.publicReleaseId,
        publicApprovalReceiptId: authority.publicApprovalReceiptId,
        releaseSha256: authority.releaseSha256,
        releaseHeaderSha256: createHash('sha256').update(authority.headerJson).digest('hex'),
        verificationDigest: receipt.verificationDigest,
        realmStatusValue,
        atlasStatusValue,
      });
      artifact.assertArtifact();
      adminSecret = '';
      return Object.freeze({
        importReceipt: receipt,
        importReceiptDigest: receipt.importReceiptDigest,
        sealedLiveReceipt: live.receipt,
        sealedLiveReceiptDigest: live.receiptDigest,
        privacySafe: true,
        activationWrites: 'none',
        publicRootWrites: 'none',
      });
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  } finally {
    adminSecret = '';
    await session?.close();
    artifact.cleanup();
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await executeGenesis002ProductionImportOperator({
      arguments: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(printable(result), null, 2)}\n`);
  } catch (error) {
    const code = error instanceof Genesis002ProductionImportOperatorError
      || error instanceof Genesis002ProductionImportError
      || error instanceof Genesis002ProductionPublisherError
      || error instanceof Genesis002ProductionTransportError
      || error instanceof Genesis002SealedLiveReceiptError
      ? error.code
      : 'GENESIS_002_PRODUCTION_IMPORT_OPERATOR_FAILED';
    process.stderr.write(`${code}${
      error instanceof Genesis002ProductionImportError && error.submitted
        ? ':MANUAL_RECONCILIATION_REQUIRED'
        : ''}\n`);
    process.exitCode = 1;
  }
}
