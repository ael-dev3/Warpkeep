// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  ptrProductionImportReceiptDigest,
  type PtrProductionImportReceipt,
} from '../scripts/ptr-production-import-core';
import {
  derivePtrOwnerOpaqueProofDigest,
  executePtrOwnerProvision,
  ptrOwnerProvisionReceiptDigest,
  ptrSealedLiveReceiptDigest,
  takePtrProductionLaunchEntropy,
  takePtrProductionOwnerFid,
  verifyPtrFreshPublishStatus,
} from '../scripts/ptr-production-release-receipts';
import {
  readPrivatePtrProductionPublishReceipt,
  writePrivatePtrProductionReceipt,
} from '../scripts/ptr-production-receipt-file';
import { ptrProductionPublishReceiptDigest } from '../scripts/ptr-production-publisher.mjs';

const DATABASE_IDENTITY = '1'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'd'.repeat(64);
const SPACETIME_DIGEST = 'e'.repeat(64);
const RELEASE_MANIFEST_SHA256 = 'f'.repeat(64);
const RELEASE_SHA256 = '0'.repeat(64);
const RELEASE_HEADER_SHA256 = '3'.repeat(64);
const VERIFICATION_DIGEST = '4'.repeat(64);
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const OWNER_FID_STRING = '123456789';
const OWNER_FID = BigInt(OWNER_FID_STRING);
const OWNER_AUTH_EPOCH = 7;
const ADMIN_SECRET = 's'.repeat(48);
const LAUNCH_ENTROPY = 'p'.repeat(48);

function readyStatus(owner = false) {
  return {
    present: true,
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: PUBLIC_RELEASE_ID,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`,
    sourceCommit: SOURCE_COMMIT,
    expectedReleaseSha256: RELEASE_SHA256,
    releaseHeaderSha256: RELEASE_HEADER_SHA256,
    state: 'ready',
    importEpoch: 1n,
    verificationPhase: 'complete',
    verificationCursor: 0n,
    verificationDigest: VERIFICATION_DIGEST,
    expectedRegionCount: 1,
    expectedComponentCount: 1,
    expectedChunkCount: 1,
    expectedCellCount: 1,
    expectedSlotCount: 600,
    expectedResourceNodeCount: 1,
    verifiedComponentCount: 1,
    verifiedChunkCount: 1,
    verifiedCellCount: 1,
    verifiedSlotCount: 600,
    verifiedResourceNodeCount: 1,
    componentExpectedCellCount: 1,
    componentExpectedSlotCount: 600,
    componentExpectedResourceNodeCount: 1,
    importedPassableCellCount: 1,
    regionManifestRows: 1,
    componentRows: 1n,
    chunkRows: 1n,
    cellRows: 1n,
    slotRows: 600n,
    resourceRows: 1n,
    claimRows: 0n,
    occupancyRows: 0n,
    activationRows: 0n,
    publicAtlasRows: 0n,
    publicRegionRows: 0n,
    workerSystemRows: 0n,
    importsExact: true,
    ready: true,
    importMutationsCompiled: true,
    activationMutationsCompiled: false,
    ownerProvisioned: owner,
    ownerEnabled: owner,
    ownerFid: owner ? OWNER_FID : undefined,
    ownerAuthEpoch: owner ? OWNER_AUTH_EPOCH : undefined,
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
  return {
    ...receipt,
    importReceiptDigest: ptrProductionImportReceiptDigest(receipt),
  };
}

describe('PTR owner provisioning and sealed evidence', () => {
  it('takes one canonical safe owner FID and immediately deletes the environment value', () => {
    const environment: NodeJS.ProcessEnv = {
      WARPKEEP_PLAYER_CANARY_OWNER_FID: OWNER_FID_STRING,
    };
    expect(takePtrProductionOwnerFid(environment)).toBe(OWNER_FID);
    expect(environment).not.toHaveProperty('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    for (const invalid of [
      '', '0', '01', '-1', '1.0', '9007199254740992', ' 123', '123 ',
    ]) {
      const candidate: NodeJS.ProcessEnv = {
        WARPKEEP_PLAYER_CANARY_OWNER_FID: invalid,
      };
      expect(() => takePtrProductionOwnerFid(candidate))
        .toThrow('PTR_PRODUCTION_OWNER_FID_INVALID');
      expect(candidate).not.toHaveProperty(
        'WARPKEEP_PLAYER_CANARY_OWNER_FID',
      );
    }
  });

  it('takes dedicated private launch entropy without repurposing the admin credential', () => {
    const environment: NodeJS.ProcessEnv = {
      WARPKEEP_PTR_LAUNCH_ENTROPY: LAUNCH_ENTROPY,
    };
    expect(takePtrProductionLaunchEntropy(environment)).toBe(LAUNCH_ENTROPY);
    expect(environment).not.toHaveProperty('WARPKEEP_PTR_LAUNCH_ENTROPY');
    const invalid: NodeJS.ProcessEnv = { WARPKEEP_PTR_LAUNCH_ENTROPY: 'short' };
    expect(() => takePtrProductionLaunchEntropy(invalid))
      .toThrow('PTR_PRODUCTION_LAUNCH_ENTROPY_INVALID');
    expect(invalid).not.toHaveProperty('WARPKEEP_PTR_LAUNCH_ENTROPY');
  });

  it('derives a nonzero nonreversible owner commitment with private entropy', () => {
    const bigintToString = vi.spyOn(BigInt.prototype, 'toString');
    const first = derivePtrOwnerOpaqueProofDigest({
      launchEntropy: LAUNCH_ENTROPY,
      ownerFid: OWNER_FID,
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
    });
    const second = derivePtrOwnerOpaqueProofDigest({
      launchEntropy: `${LAUNCH_ENTROPY}x`,
      ownerFid: OWNER_FID,
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
    });
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toBe('0'.repeat(64));
    expect(first).not.toBe(createHash('sha256').update(OWNER_FID_STRING).digest('hex'));
    expect(second).not.toBe(first);
    expect(first).not.toContain(OWNER_FID_STRING);
    expect(bigintToString).not.toHaveBeenCalled();
    bigintToString.mockRestore();
  });

  it('provisions only after an exact finalized empty atlas and emits no owner FID', async () => {
    const statuses = [readyStatus(false), readyStatus(true)];
    const transport = {
      inspect: vi.fn(async () => statuses.shift()),
      prepareSubmission: vi.fn(async () => undefined),
      submit: vi.fn(async (
        _reducer: string,
        _arguments: Readonly<Record<string, unknown>>,
        _assertCanStartWrite: () => void,
      ) => undefined),
      provisionOwner: vi.fn(async () => ({
        ownerFid: OWNER_FID,
        ownerAuthEpoch: OWNER_AUTH_EPOCH,
      })),
    };
    const ownerOpaqueProofDigest = derivePtrOwnerOpaqueProofDigest({
      launchEntropy: LAUNCH_ENTROPY,
      ownerFid: OWNER_FID,
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
    });
    const result = await executePtrOwnerProvision({
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      importReceipt: importReceipt(),
      ownerFid: OWNER_FID,
      ownerOpaqueProofDigest,
      transport,
      assertCanStartWrite: vi.fn(),
    });

    expect(transport.provisionOwner).toHaveBeenCalledWith(
      OWNER_FID,
      expect.any(Function),
    );
    expect(transport.submit).not.toHaveBeenCalled();
    expect(Object.keys(result.ownerProvisionReceipt)).toEqual([
      'schemaVersion', 'profile', 'outcome', 'databaseIdentity',
      'databaseAlias', 'moduleIdentity', 'moduleSourceCommit',
      'ownerOpaqueProofDigest', 'ownerAnchorRows', 'ownerProvisioned',
      'ownerEnabled', 'zeroPopulationBoundary', 'provisionReceiptDigest',
    ]);
    expect(Object.keys(result.sealedLiveReceipt)).toEqual([
      'schemaVersion', 'profile', 'uri', 'databaseIdentity', 'databaseAlias',
      'moduleIdentity', 'moduleSourceCommit', 'moduleSha256', 'releaseVersion',
      'realmId', 'atlasSourceCommit', 'atlasId', 'publicReleaseId',
      'releaseManifestSha256', 'expectedReleaseSha256',
      'releaseHeaderSha256', 'verificationDigest', 'atlasState',
      'atlasFinalized', 'atlasImportsExact',
      'atlasWritesClosedByFinalization', 'allowedFids', 'accessRequests',
      'playersV1', 'playersV2', 'ownershipBindings', 'castles',
      'realmProfiles', 'termsAcceptances', 'markAccounts', 'resourceAccounts',
      'claimRows', 'occupancyRows', 'activationRows', 'publicAtlasRows',
      'publicRegionRows', 'workerSystemRows', 'atlasImportMutationsCompiled',
      'atlasActivationMutationsCompiled', 'ownerOpaqueProofDigest',
      'ownerAnchorRows', 'ownerProvisioned', 'ownerEnabled', 'admissionsOpen',
      'accessRequestsOpen', 'admissionSurfacePresent',
      'accessRequestSurfacePresent', 'playerPresentationEnabled',
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(OWNER_FID_STRING);
    expect(serialized).not.toContain('ownerFid');
    expect(serialized).not.toContain('ownerAuthEpoch');
    const {
      provisionReceiptDigest,
      ...ownerReceiptWithoutDigest
    } = result.ownerProvisionReceipt;
    expect(provisionReceiptDigest)
      .toBe(ptrOwnerProvisionReceiptDigest(ownerReceiptWithoutDigest));
    expect(result.sealedLiveReceiptDigest)
      .toBe(ptrSealedLiveReceiptDigest(result.sealedLiveReceipt));
  });

  it('rejects provisioning before readiness or when any owner already exists', async () => {
    for (const status of [
      { ...readyStatus(false), state: 'verifying', ready: false },
      readyStatus(true),
    ]) {
      const submit = vi.fn();
      await expect(executePtrOwnerProvision({
        databaseIdentity: DATABASE_IDENTITY,
        moduleSourceCommit: SOURCE_COMMIT,
        moduleSha256: MODULE_SHA256,
        importReceipt: importReceipt(),
        ownerFid: OWNER_FID,
        ownerOpaqueProofDigest: '7'.repeat(64),
        transport: {
          inspect: vi.fn(async () => status),
          submit,
          provisionOwner: vi.fn(),
        },
        assertCanStartWrite: vi.fn(),
      })).rejects.toThrow();
      expect(submit).not.toHaveBeenCalled();
    }
  });

  it('accepts fresh publish status only when atlas and owner are absent', () => {
    const fresh = {
      ...readyStatus(false),
      present: false,
      atlasId: undefined,
      publicReleaseId: undefined,
      publicApprovalReceiptId: undefined,
      sourceCommit: undefined,
      expectedReleaseSha256: undefined,
      releaseHeaderSha256: undefined,
      state: 'absent',
      importEpoch: undefined,
      ready: false,
      verificationPhase: 'components',
      verificationDigest: `sha256-v1:${'0'.repeat(64)}:0:`,
      expectedRegionCount: 0,
      expectedComponentCount: 0,
      expectedChunkCount: 0,
      expectedCellCount: 0,
      expectedSlotCount: 0,
      expectedResourceNodeCount: 0,
      verifiedComponentCount: 0,
      verifiedChunkCount: 0,
      verifiedCellCount: 0,
      verifiedSlotCount: 0,
      verifiedResourceNodeCount: 0,
      componentExpectedCellCount: 0,
      componentExpectedSlotCount: 0,
      componentExpectedResourceNodeCount: 0,
      importedPassableCellCount: 0,
      regionManifestRows: 0,
      componentRows: 0n,
      chunkRows: 0n,
      cellRows: 0n,
      slotRows: 0n,
      resourceRows: 0n,
      importsExact: false,
    };
    expect(verifyPtrFreshPublishStatus(fresh)).toEqual({
      freshDatabase: true,
      admissionSurfacePresent: false,
      accessRequestSurfacePresent: false,
      zeroPopulationBoundary: true,
      atlasImportMutationsCompiled: true,
      atlasActivationMutationsCompiled: false,
      ownerProvisioned: false,
    });
    expect(() => verifyPtrFreshPublishStatus({
      ...fresh,
      ownerProvisioned: true,
      ownerEnabled: true,
      ownerFid: OWNER_FID,
      ownerAuthEpoch: OWNER_AUTH_EPOCH,
    })).toThrow();
    for (const inconsistent of [
      { expectedComponentCount: 1 },
      { verifiedCellCount: 1 },
      { componentExpectedSlotCount: 1 },
      { verificationCursor: 1n },
      { regionManifestRows: 1 },
    ]) {
      expect(() => verifyPtrFreshPublishStatus({
        ...fresh,
        ...inconsistent,
      })).toThrow('PTR_PRODUCTION_FRESH_STATUS_INVALID');
    }
  });
});

describe('PTR private production receipt files', () => {
  it('writes canonical 0600 files without overwrite and rejects symlink/repo paths', () => {
    const root = realpathSync(mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-receipt-test-'),
    ));
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private', 'receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    chmodSync(repositoryRoot, 0o700);
    mkdirSync(join(root, 'private'), { mode: 0o700 });
    chmodSync(join(root, 'private'), 0o700);
    try {
      const receipt = importReceipt();
      const first = writePrivatePtrProductionReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        kind: 'atlas-import',
        receipt,
      });
      expect(first.result).toBe('installed');
      expect(lstatSync(first.path).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(first.path, 'utf8'))).toEqual(receipt);
      const second = writePrivatePtrProductionReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        kind: 'atlas-import',
        receipt,
      });
      expect(second).toEqual({ ...first, result: 'unchanged' });

      expect(() => writePrivatePtrProductionReceipt({
        directory: join(repositoryRoot, 'receipts'),
        repositoryRoot,
        kind: 'atlas-import',
        receipt,
      })).toThrow('PTR_PRODUCTION_RECEIPT_REPOSITORY_OVERLAP');

      const real = join(root, 'real');
      const linked = join(root, 'linked');
      mkdirSync(real, { mode: 0o700 });
      symlinkSync(real, linked);
      expect(() => writePrivatePtrProductionReceipt({
        directory: join(linked, 'receipts'),
        repositoryRoot,
        kind: 'atlas-import',
        receipt,
      })).toThrow('PTR_PRODUCTION_RECEIPT_SYMLINK_REJECTED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('loads only the exact canonical private publish receipt by semantic digest', () => {
    const root = realpathSync(mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-publish-receipt-test-'),
    ));
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private', 'receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(join(root, 'private'), { mode: 0o700 });
    try {
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
        spacetimeCliConfigSha256: '9'.repeat(64),
        deleteData: 'never',
        outcome: 'verified',
        freshDatabase: true,
        freshStatusDigest: '8'.repeat(64),
        admissionSurfacePresent: false,
        accessRequestSurfacePresent: false,
      } as const;
      const fullReceipt = {
        ...receipt,
        publishReceiptDigest: ptrProductionPublishReceiptDigest(receipt),
      };
      writePrivatePtrProductionReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        kind: 'publish',
        receipt: fullReceipt,
      });
      expect(readPrivatePtrProductionPublishReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        expectedReceiptDigest: fullReceipt.publishReceiptDigest,
      })).toMatchObject({ receipt: fullReceipt });
      expect(() => readPrivatePtrProductionPublishReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        expectedReceiptDigest: '7'.repeat(64),
      })).toThrow('PTR_PRODUCTION_PUBLISH_RECEIPT_NOT_FOUND');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes only its own partial exclusive receipt after a write failure', () => {
    const root = realpathSync(mkdtempSync(
      join(tmpdir(), 'warpkeep-ptr-partial-receipt-test-'),
    ));
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private', 'receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(join(root, 'private'), { mode: 0o700 });
    try {
      let diagnostic = '';
      try {
        writePrivatePtrProductionReceipt({
          directory: receiptDirectory,
          repositoryRoot,
          kind: 'atlas-import',
          receipt: importReceipt(),
          testOnlyFailAfterBytesWritten: () => {
            throw new Error(`private:${ADMIN_SECRET}:${OWNER_FID_STRING}`);
          },
        });
      } catch (error) {
        diagnostic = error instanceof Error ? error.message : String(error);
      }
      expect(diagnostic).toBe('PTR_PRODUCTION_RECEIPT_WRITE_FAILED');
      expect(diagnostic).not.toContain(ADMIN_SECRET);
      expect(diagnostic).not.toContain(OWNER_FID_STRING);
      expect(readdirSync(receiptDirectory)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
