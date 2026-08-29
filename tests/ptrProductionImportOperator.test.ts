// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ptrProductionImportConfirmationDigest,
  ptrProductionImportReceiptDigest,
  type PtrProductionImportReceipt,
} from '../scripts/ptr-production-import-core';
import {
  executePtrProductionImportOperator,
} from '../scripts/ptr-production-import-operator';
import {
  ptrProductionPublishReceiptDigest,
} from '../scripts/ptr-production-publisher.mjs';
import { PtrProductionImportError } from '../scripts/ptr-production-import-core';

const DATABASE_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'd'.repeat(64);
const SPACETIME_DIGEST = 'e'.repeat(64);
const SPACETIME_CLI_CONFIG_DIGEST = '6'.repeat(64);
const RELEASE_MANIFEST_SHA256 = createHash('sha256')
  .update(Buffer.from('ptr')).digest('hex');
const RELEASE_SHA256 = '0'.repeat(64);
const RELEASE_HEADER_JSON = '{"ptr":"header"}\n';
const RELEASE_HEADER_SHA256 = createHash('sha256')
  .update(RELEASE_HEADER_JSON).digest('hex');
const VERIFICATION_DIGEST = '4'.repeat(64);
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const PUBLIC_APPROVAL_ID = `GRA-${'B'.repeat(26)}`;
const OWNER_FID_STRING = '123456789';
const OWNER_FID = BigInt(OWNER_FID_STRING);
const ADMIN_SECRET = 's'.repeat(48);
const LAUNCH_ENTROPY = 'p'.repeat(48);

function publishReceipt(overrides: Readonly<Record<string, unknown>> = {}) {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-production-publish-v1',
    databaseIdentity: DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    sourceCommit: SOURCE_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: SPACETIME_CLI_CONFIG_DIGEST,
    deleteData: 'never',
    outcome: 'verified',
    freshDatabase: true,
    freshStatusDigest: '9'.repeat(64),
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
    ...overrides,
  } as const;
  return Object.freeze({
    ...receipt,
    publishReceiptDigest: ptrProductionPublishReceiptDigest(receipt),
  });
}

const PUBLISH_RECEIPT = publishReceipt();

const authority = Object.freeze({
  atlasId: 'PTR_GREATER_REALM',
  sourceCommit: SOURCE_COMMIT,
  releaseSha256: RELEASE_SHA256,
  publicReleaseId: PUBLIC_RELEASE_ID,
  publicApprovalReceiptId: PUBLIC_APPROVAL_ID,
  headerJson: RELEASE_HEADER_JSON,
});

function environment(): NodeJS.ProcessEnv {
  return {
    WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/cache',
    WK_PTR_MATERIALIZATION_PARENT: '/private/materialization',
    WARPKEEP_GREATER_REALM_WORKSPACE: '/private/atlas-workspace',
    WARPKEEP_PTR_RECEIPT_DIRECTORY: '/private/ptr-receipts',
    WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    WARPKEEP_PTR_LAUNCH_ENTROPY: LAUNCH_ENTROPY,
    WARPKEEP_PLAYER_CANARY_OWNER_FID: OWNER_FID_STRING,
    HOME: '/untrusted/home',
  };
}

function argumentsFor(command: 'inspect' | 'apply'): string[] {
  const values = [
    command,
    `--database-identity=${DATABASE_IDENTITY}`,
    `--genesis-002-database-identity=${G002_IDENTITY}`,
    `--module-source-commit=${SOURCE_COMMIT}`,
    `--module-sha256=${MODULE_SHA256}`,
    `--module-tree-id=${MODULE_TREE_ID}`,
    `--dependency-closure-digest=${DEPENDENCY_DIGEST}`,
    `--spacetime-executable-sha256=${SPACETIME_DIGEST}`,
    `--spacetime-cli-config-sha256=${SPACETIME_CLI_CONFIG_DIGEST}`,
    `--publish-receipt-digest=${PUBLISH_RECEIPT.publishReceiptDigest}`,
    `--atlas-source-commit=${SOURCE_COMMIT}`,
    `--release-sha256=${RELEASE_SHA256}`,
  ];
  if (command === 'apply') {
    values.push(`--confirm=${ptrProductionImportConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: SPACETIME_CLI_CONFIG_DIGEST,
      publishReceiptDigest: PUBLISH_RECEIPT.publishReceiptDigest,
      atlasSourceCommit: SOURCE_COMMIT,
      releaseSha256: RELEASE_SHA256,
      publicReleaseId: PUBLIC_RELEASE_ID,
      importEpoch: 1n,
    })}`);
  }
  return values;
}

function builtArtifact() {
  return {
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    assertSourceAndArtifact: vi.fn(),
    assertArtifact: vi.fn(),
    cleanup: vi.fn(),
  };
}

function status(owner = false, present = true) {
  return {
    present,
    atlasId: present ? 'PTR_GREATER_REALM' : undefined,
    publicReleaseId: present ? PUBLIC_RELEASE_ID : undefined,
    publicApprovalReceiptId: present ? PUBLIC_APPROVAL_ID : undefined,
    sourceCommit: present ? SOURCE_COMMIT : undefined,
    expectedReleaseSha256: present ? RELEASE_SHA256 : undefined,
    releaseHeaderSha256: present ? RELEASE_HEADER_SHA256 : undefined,
    state: present ? 'ready' : 'absent',
    importEpoch: present ? 1n : undefined,
    verificationPhase: present ? 'complete' : 'components',
    verificationCursor: 0n,
    verificationDigest: present
      ? VERIFICATION_DIGEST
      : `sha256-v1:${'0'.repeat(64)}:0:`,
    expectedRegionCount: present ? 1 : 0,
    expectedComponentCount: present ? 1 : 0,
    expectedChunkCount: present ? 1 : 0,
    expectedCellCount: present ? 1 : 0,
    expectedSlotCount: present ? 600 : 0,
    expectedResourceNodeCount: present ? 1 : 0,
    verifiedComponentCount: present ? 1 : 0,
    verifiedChunkCount: present ? 1 : 0,
    verifiedCellCount: present ? 1 : 0,
    verifiedSlotCount: present ? 600 : 0,
    verifiedResourceNodeCount: present ? 1 : 0,
    componentExpectedCellCount: present ? 1 : 0,
    componentExpectedSlotCount: present ? 600 : 0,
    componentExpectedResourceNodeCount: present ? 1 : 0,
    importedPassableCellCount: present ? 1 : 0,
    regionManifestRows: present ? 1 : 0,
    componentRows: present ? 1n : 0n,
    chunkRows: present ? 1n : 0n,
    cellRows: present ? 1n : 0n,
    slotRows: present ? 600n : 0n,
    resourceRows: present ? 1n : 0n,
    claimRows: 0n,
    occupancyRows: 0n,
    activationRows: 0n,
    publicAtlasRows: 0n,
    publicRegionRows: 0n,
    workerSystemRows: 0n,
    importsExact: present,
    ready: present,
    importMutationsCompiled: true,
    activationMutationsCompiled: false,
    ownerProvisioned: owner,
    ownerEnabled: owner,
    ownerFid: owner ? OWNER_FID : undefined,
    ownerAuthEpoch: owner ? 1 : undefined,
  } as const;
}

function importReceipt(): PtrProductionImportReceipt {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep.ptr.production-import.v1',
    outcome: 'ready',
    databaseIdentity: DATABASE_IDENTITY,
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: SOURCE_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    atlasId: 'PTR_GREATER_REALM',
    atlasSourceCommit: SOURCE_COMMIT,
    publicReleaseId: PUBLIC_RELEASE_ID,
    releaseManifestSha256: RELEASE_MANIFEST_SHA256,
    expectedReleaseSha256: RELEASE_SHA256,
    releaseHeaderSha256: RELEASE_HEADER_SHA256,
    verificationDigest: VERIFICATION_DIGEST,
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: '5'.repeat(64),
    zeroPopulationBoundary: true,
    importsExact: true,
    ready: true,
    atlasFinalized: true,
    atlasWritesClosedByFinalization: true,
    importMutationsCompiled: true,
    activationMutationsCompiled: false,
  } as const;
  return Object.freeze({
    ...receipt,
    importReceiptDigest: ptrProductionImportReceiptDigest(receipt),
  });
}

function baseDependencies(initialStatus: unknown) {
  const artifact = builtArtifact();
  const close = vi.fn(async () => undefined);
  const session = {
    inspect: vi.fn(async () => initialStatus),
    prepareSubmission: vi.fn(async () => undefined),
    submit: vi.fn(async () => undefined),
    close,
  };
  return {
    artifact,
    session,
    dependencies: {
      prepareArtifact: vi.fn(() => artifact),
      openWorkspace: vi.fn(() => ({ private: true })),
      readRuntimeRelease: vi.fn(() => ({ manifestBytes: Buffer.from('ptr') })),
      verifyRuntimeRelease: vi.fn(),
      importAuthority: vi.fn(() => authority),
      readPublishReceipt: vi.fn(() => ({
        receipt: PUBLISH_RECEIPT,
        path: '/private/ptr-receipts/publish.json',
        receiptFileSha256: 'a'.repeat(64),
      })),
      attestSourceAncestry: vi.fn(),
      createTransport: vi.fn(() => session),
      executeImport: vi.fn(),
      writeReceipt: vi.fn(),
    },
  };
}

describe('PTR production import/provision operator', () => {
  it('inspects exact protected state without mutation entropy or private owner disclosure', async () => {
    const fixture = baseDependencies(status(false, false));
    const env = environment();
    delete env.WARPKEEP_PTR_LAUNCH_ENTROPY;
    const result = await executePtrProductionImportOperator({
      arguments: argumentsFor('inspect'),
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: fixture.dependencies as never,
    });
    expect(result).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep.ptr.production-import-inspection.v1',
      databaseIdentity: DATABASE_IDENTITY,
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      atlasId: 'PTR_GREATER_REALM',
      confirmationDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      mutationSurface: 'atlas-import-then-owner-provision-only',
      activationMutationsEnabled: false,
      admissionsOpen: false,
      accessRequestsOpen: false,
      privacySafe: true,
    });
    expect(fixture.dependencies.executeImport).not.toHaveBeenCalled();
    expect(fixture.dependencies.writeReceipt).not.toHaveBeenCalled();
    expect(fixture.session.submit).not.toHaveBeenCalled();
    expect(fixture.session.close).toHaveBeenCalledOnce();
    expect(fixture.artifact.cleanup).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(OWNER_FID_STRING);
    expect(JSON.stringify(result)).not.toContain(ADMIN_SECRET);
    expect(JSON.stringify(result)).not.toContain('ownerFid');
    expect(env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(env).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    expect(env).not.toHaveProperty('WARPKEEP_PTR_LAUNCH_ENTROPY');
    expect(fixture.dependencies.createTransport).toHaveBeenCalledWith({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    });
  });

  it('imports, writes sealed import evidence, provisions one owner, and writes exact live evidence', async () => {
    const fixture = baseDependencies(status(false, false));
    const statuses = [status(false), status(true)];
    fixture.session.inspect
      .mockImplementation(async () => statuses.shift() ?? status(false, false));
    // The operator consumes the fresh status before import; owner provisioning
    // then consumes exact ready-without-owner and ready-with-owner statuses.
    fixture.session.inspect
      .mockResolvedValueOnce(status(false, false))
      .mockResolvedValueOnce(status(false))
      .mockResolvedValueOnce(status(true));
    const receipt = importReceipt();
    fixture.dependencies.executeImport.mockImplementation(async input => {
      input.assertCanStartWrite();
      return receipt;
    });
    fixture.dependencies.writeReceipt.mockImplementation(({ kind }) => ({
      path: `/private/ptr-receipts/${kind}.json`,
      receiptFileSha256: kind === 'atlas-import'
        ? '6'.repeat(64)
        : kind === 'owner-provision'
          ? '7'.repeat(64)
          : '8'.repeat(64),
      result: 'installed',
    }));
    const env = environment();
    const result = await executePtrProductionImportOperator({
      arguments: argumentsFor('apply'),
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: fixture.dependencies as never,
    });
    expect(result).toMatchObject({
      ptrAtlasImportReceipt: receipt,
      ptrOwnerProvisionReceipt: {
        profile: 'warpkeep-ptr-owner-provision-v1',
        ownerProvisioned: true,
        ownerEnabled: true,
      },
      ptrSealedLiveReceipt: {
        profile: 'warpkeep-ptr-sealed-live-v1',
        atlasState: 'ready',
        admissionsOpen: false,
        accessRequestsOpen: false,
        ownerProvisioned: true,
        ownerEnabled: true,
      },
      ptrSealedLiveReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      privacySafe: true,
      activationWrites: 'none',
      publicRootWrites: 'none',
    });
    expect(fixture.dependencies.executeImport).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseIdentity: DATABASE_IDENTITY,
        disallowedDatabaseIdentities: [G002_IDENTITY],
        importEpoch: 1n,
        publicName: 'The Greater Realm',
        transport: fixture.session,
      }),
    );
    expect(fixture.session.submit).toHaveBeenCalledWith(
      'admin_provision_ptr_owner_v1',
      { ownerFid: OWNER_FID, authEpoch: 1 },
      expect.any(Function),
    );
    expect(fixture.dependencies.writeReceipt.mock.calls.map(
      ([value]) => value.kind,
    )).toEqual(['atlas-import', 'owner-provision', 'sealed-live']);
    expect(fixture.session.close).toHaveBeenCalledOnce();
    expect(fixture.artifact.cleanup).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(OWNER_FID_STRING);
    expect(serialized).not.toContain(ADMIN_SECRET);
    expect(serialized).not.toContain(LAUNCH_ENTROPY);
    expect(serialized).not.toContain('ownerFid');
    expect(serialized).not.toContain('ownerAuthEpoch');
  });

  it('never reports success when SIGTERM arrives during the final owner write', async () => {
    const fixture = baseDependencies(status(false, false));
    fixture.session.inspect
      .mockResolvedValueOnce(status(false, false))
      .mockResolvedValueOnce(status(false))
      .mockResolvedValueOnce(status(true));
    fixture.dependencies.executeImport.mockImplementation(async input => {
      input.assertCanStartWrite();
      return importReceipt();
    });
    fixture.session.submit.mockImplementation(async () => {
      process.emit('SIGTERM');
    });
    fixture.dependencies.writeReceipt.mockImplementation(({ kind }) => ({
      path: `/private/ptr-receipts/${kind}.json`,
      receiptFileSha256: '7'.repeat(64),
      result: 'installed',
    }));
    const sigintListeners = process.listenerCount('SIGINT');
    const sigtermListeners = process.listenerCount('SIGTERM');
    await expect(executePtrProductionImportOperator({
      arguments: argumentsFor('apply'),
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: fixture.dependencies as never,
    })).rejects.toMatchObject({
      submitted: true,
    });
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
  });

  it('redacts unknown post-write failures and always closes/cleans/scrubs', async () => {
    const fixture = baseDependencies(status(false, false));
    fixture.dependencies.executeImport.mockImplementation(async input => {
      input.assertCanStartWrite();
      throw new Error(`private:${ADMIN_SECRET}:${OWNER_FID_STRING}`);
    });
    const env = environment();
    let diagnostic = '';
    try {
      await executePtrProductionImportOperator({
        arguments: argumentsFor('apply'),
        environment: env,
        attestProtectedMain: () => SOURCE_COMMIT,
        dependencies: fixture.dependencies as never,
      });
    } catch (error) {
      diagnostic = error instanceof Error ? error.message : String(error);
      expect(error).toMatchObject({ submitted: true });
    }
    expect(diagnostic)
      .toBe('PTR_PRODUCTION_OPERATOR_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED');
    expect(diagnostic).not.toContain(ADMIN_SECRET);
    expect(diagnostic).not.toContain(OWNER_FID_STRING);
    expect(fixture.session.close).toHaveBeenCalledOnce();
    expect(fixture.artifact.cleanup).toHaveBeenCalledOnce();
    expect(fixture.dependencies.writeReceipt).not.toHaveBeenCalled();
    expect(env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(env).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    expect(env).not.toHaveProperty('WARPKEEP_PTR_LAUNCH_ENTROPY');
  });

  it('rejects a publish receipt bound to another database before transport', async () => {
    const fixture = baseDependencies(status(false, false));
    const wrongReceipt = publishReceipt({ databaseIdentity: '8'.repeat(64) });
    fixture.dependencies.readPublishReceipt.mockReturnValue({
      receipt: wrongReceipt,
      path: '/private/ptr-receipts/wrong.json',
      receiptFileSha256: '8'.repeat(64),
    });
    const values = argumentsFor('inspect').map(value => (
      value.startsWith('--publish-receipt-digest=')
        ? `--publish-receipt-digest=${wrongReceipt.publishReceiptDigest}`
        : value
    ));
    await expect(executePtrProductionImportOperator({
      arguments: values,
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: fixture.dependencies as never,
    })).rejects.toThrow('PTR_PRODUCTION_PUBLISH_RECEIPT_BINDING_INVALID');
    expect(fixture.dependencies.createTransport).not.toHaveBeenCalled();
  });

  it('marks exact-ready ownerless prior state and stable post-write failures for reconciliation', async () => {
    const priorReady = baseDependencies(status(false));
    await expect(executePtrProductionImportOperator({
      arguments: argumentsFor('apply'),
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: priorReady.dependencies as never,
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_IMPORT_PRIOR_READY_STATE_MANUAL_RECONCILIATION_REQUIRED',
      submitted: true,
    });
    expect(priorReady.dependencies.executeImport).not.toHaveBeenCalled();

    const stableFailure = baseDependencies(status(false, false));
    stableFailure.dependencies.executeImport.mockImplementation(async input => {
      input.assertCanStartWrite();
      throw new PtrProductionImportError('PTR_PRODUCTION_STATUS_SHAPE_CHANGED');
    });
    await expect(executePtrProductionImportOperator({
      arguments: argumentsFor('apply'),
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: stableFailure.dependencies as never,
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_OPERATOR_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      submitted: true,
    });
  });
});
