// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  ptrProductionImportReceiptDigest,
  type PtrProductionImportReceipt,
} from '../scripts/ptr-production-import-core';
import {
  executePtrOwnerProvisionOperator,
  ptrOwnerProvisionConfirmationDigest,
} from '../scripts/ptr-owner-provision-operator';
import {
  executePtrOwnerProvision,
  ptrOwnerProvisionReceiptDigest,
  ptrSealedLiveReceiptDigest,
} from '../scripts/ptr-production-release-receipts';

const DATABASE_IDENTITY = '1'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const OWNER_FID = 123456789n;
const OWNER_SECRET = 's'.repeat(48);
const ENTROPY = 'p'.repeat(48);

function receipt(): PtrProductionImportReceipt {
  const value = {
    schemaVersion: 1, profile: 'warpkeep.ptr.production-import.v1', outcome: 'ready',
    databaseIdentity: DATABASE_IDENTITY, moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: SOURCE_COMMIT, moduleSha256: MODULE_SHA256,
    moduleTreeId: 'c'.repeat(40), dependencyClosureDigest: 'd'.repeat(64),
    spacetimeExecutableSha256: 'e'.repeat(64), atlasId: 'PTR_GREATER_REALM',
    atlasSourceCommit: SOURCE_COMMIT, publicReleaseId: `GRR-${'A'.repeat(26)}`,
    releaseManifestSha256: 'f'.repeat(64), expectedReleaseSha256: '0'.repeat(64),
    releaseHeaderSha256: '3'.repeat(64), verificationDigest: '4'.repeat(64),
    importEpoch: '1', operationsSubmitted: 16, operationChainDigest: '5'.repeat(64),
    zeroPopulationBoundary: true, importsExact: true, ready: true,
    atlasFinalized: true, atlasWritesClosedByFinalization: true,
    importMutationsCompiled: true, activationMutationsCompiled: false,
  } as const;
  return Object.freeze({
    ...value,
    importReceiptDigest: ptrProductionImportReceiptDigest(value),
  });
}

function status(owner = false) {
  return {
    present: true, atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: `GRR-${'A'.repeat(26)}`,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`,
    sourceCommit: SOURCE_COMMIT, expectedReleaseSha256: '0'.repeat(64),
    releaseHeaderSha256: '3'.repeat(64), state: 'ready', importEpoch: 1n,
    verificationPhase: 'complete', verificationCursor: 0n,
    verificationDigest: '4'.repeat(64), expectedRegionCount: 1,
    expectedComponentCount: 1, expectedChunkCount: 1, expectedCellCount: 1,
    expectedSlotCount: 600, expectedResourceNodeCount: 1,
    verifiedComponentCount: 1, verifiedChunkCount: 1, verifiedCellCount: 1,
    verifiedSlotCount: 600, verifiedResourceNodeCount: 1,
    componentExpectedCellCount: 1, componentExpectedSlotCount: 600,
    componentExpectedResourceNodeCount: 1, importedPassableCellCount: 1,
    regionManifestRows: 1, componentRows: 1n, chunkRows: 1n, cellRows: 1n,
    slotRows: 600n, resourceRows: 1n, claimRows: 0n, occupancyRows: 0n,
    activationRows: 0n, publicAtlasRows: 0n, publicRegionRows: 0n,
    workerSystemRows: 0n, importsExact: true, ready: true,
    importMutationsCompiled: true, activationMutationsCompiled: false,
    ownerProvisioned: owner, ownerEnabled: owner,
  } as const;
}

function args(command: 'inspect' | 'provision', confirmation?: string): string[] {
  return [
    command,
    `--database-identity=${DATABASE_IDENTITY}`,
    `--module-source-commit=${SOURCE_COMMIT}`,
    `--module-sha256=${MODULE_SHA256}`,
    `--atlas-import-receipt-digest=${receipt().importReceiptDigest}`,
    ...(confirmation === undefined ? [] : [`--confirm=${confirmation}`]),
  ];
}

function env(): NodeJS.ProcessEnv {
  return {
    WARPKEEP_PTR_RECEIPT_DIRECTORY: '/private/ptr-receipts',
    WARPKEEP_PLAYER_CANARY_OWNER_FID: OWNER_FID.toString(),
    WARPKEEP_ADMIN_TOKEN_SECRET: OWNER_SECRET,
    WARPKEEP_PTR_LAUNCH_ENTROPY: ENTROPY,
  };
}

describe('PTR owner-provision operator', () => {
  it('rejects inherited argument names with the typed argument error', async () => {
    await expect(executePtrOwnerProvisionOperator({
      arguments: [...args('inspect'), '--constructor=x'],
      environment: env(),
      dependencies: {} as never,
    })).rejects.toMatchObject({
      code: 'PTR_OWNER_PROVISION_ARGUMENT_INVALID',
      submitted: false,
    });
  });

  it('keeps inspect ownerless and derives confirmation only from reopened import ancestry', async () => {
    const order: string[] = [];
    const environment = env();
    const result = await executePtrOwnerProvisionOperator({
      arguments: args('inspect'), environment,
      dependencies: {
        readImportReceipt: vi.fn(() => { order.push('reopen'); return { receipt: receipt() }; }),
        inspectStatus: vi.fn(async () => { order.push('inspect'); return status(false); }),
        resolveOwnerAuthority: vi.fn(async () => { order.push('resolve'); throw new Error(); }),
        requestOwnerToken: vi.fn(async () => { order.push('token'); throw new Error(); }),
      } as never,
    });
    expect(order).toEqual(['reopen', 'inspect']);
    expect(result).toMatchObject({
      profile: 'warpkeep.ptr.owner-provision-inspection.v1',
      atlasImportReceiptDigest: receipt().importReceiptDigest,
      confirmationDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      ownerProvisioned: false,
      privacySafe: true,
    });
    expect(environment.WARPKEEP_PLAYER_CANARY_OWNER_FID).toBe(OWNER_FID.toString());
    expect(environment.WARPKEEP_ADMIN_TOKEN_SECRET).toBe(OWNER_SECRET);
    expect(environment.WARPKEEP_PTR_LAUNCH_ENTROPY).toBe(ENTROPY);
    expect(JSON.stringify(result)).not.toContain(OWNER_FID.toString());
  });

  it('closes the default atlas status session after inspection without requesting owner authority', async () => {
    const close = vi.fn(async () => undefined);
    const environment = env();
    const createStatusTransport = vi.fn(() => ({
      inspect: vi.fn(async () => status(false)),
      prepareSubmission: vi.fn(), submit: vi.fn(), close,
    }));
    const result = await executePtrOwnerProvisionOperator({
      arguments: args('inspect'), environment,
      dependencies: {
        readImportReceipt: vi.fn(() => ({ receipt: receipt() })),
        createStatusTransport,
        requestOwnerToken: vi.fn(async () => { throw new Error('OWNER_TOKEN_NOT_REQUESTED'); }),
      } as never,
    });
    expect(result).toMatchObject({ profile: 'warpkeep.ptr.owner-provision-inspection.v1' });
    expect(createStatusTransport).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(environment.WARPKEEP_ADMIN_TOKEN_SECRET).toBeUndefined();
    expect(environment.WARPKEEP_PLAYER_CANARY_OWNER_FID).toBe(OWNER_FID.toString());
  });

  it('closes the default atlas status session when its first inspection fails', async () => {
    const close = vi.fn(async () => undefined);
    const createStatusTransport = vi.fn(() => ({
      inspect: vi.fn(async () => { throw new Error('STATUS_UNAVAILABLE'); }),
      prepareSubmission: vi.fn(), submit: vi.fn(), close,
    }));
    await expect(executePtrOwnerProvisionOperator({
      arguments: args('inspect'), environment: env(),
      dependencies: { readImportReceipt: vi.fn(() => ({ receipt: receipt() })), createStatusTransport } as never,
    })).rejects.toMatchObject({ code: 'PTR_OWNER_PROVISION_FAILED', submitted: false });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses one genuine owner token for default authority and the provision session', async () => {
    const statuses = [status(false), status(false), status(true)];
    const environment = env();
    const statusClose = vi.fn(async () => undefined);
    const ownerClose = vi.fn(async () => undefined);
    const requestOwnerToken = vi.fn(async () => 'owner.jwt.token');
    const validateOwnerToken = vi.fn(() => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 }));
    const ownerTokenUsed: string[] = [];
    const confirmation = ptrOwnerProvisionConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY, moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256, atlasImportReceiptDigest: receipt().importReceiptDigest,
      status: status(false),
    });
    const result = await executePtrOwnerProvisionOperator({
      arguments: args('provision', confirmation), environment,
      dependencies: {
        readImportReceipt: vi.fn(() => ({ receipt: receipt() })),
        createStatusTransport: vi.fn(() => ({
          inspect: vi.fn(async () => statuses.shift()),
          prepareSubmission: vi.fn(), submit: vi.fn(), close: statusClose,
        })),
        requestOwnerToken, validateOwnerToken,
        deriveOwnerProof: vi.fn(() => '7'.repeat(64)),
        createOwnerTransport: vi.fn((input: { requestToken: () => Promise<string> }) => ({
          provisionOwner: vi.fn(async () => {
            ownerTokenUsed.push(await input.requestToken());
            return { ownerFid: OWNER_FID, ownerAuthEpoch: 7 };
          }),
          close: ownerClose,
        })),
        writeReceipt: vi.fn(),
        nowSeconds: () => 1_800_000_000,
      } as never,
    });
    expect(result).toMatchObject({ privacySafe: true });
    expect(requestOwnerToken).toHaveBeenCalledTimes(1);
    expect(validateOwnerToken).toHaveBeenCalledTimes(1);
    expect(ownerTokenUsed).toEqual(['owner.jwt.token']);
    expect(statusClose).toHaveBeenCalledTimes(1);
    expect(ownerClose).toHaveBeenCalledTimes(1);
    expect(environment.WARPKEEP_ADMIN_TOKEN_SECRET).toBeUndefined();
    expect(environment.WARPKEEP_PLAYER_CANARY_OWNER_FID).toBeUndefined();
    expect(environment.WARPKEEP_PTR_LAUNCH_ENTROPY).toBeUndefined();
  });

  it('rejects a default owner token for a different FID before provisioning', async () => {
    const close = vi.fn(async () => undefined);
    const createOwnerTransport = vi.fn();
    const confirmation = ptrOwnerProvisionConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY, moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256, atlasImportReceiptDigest: receipt().importReceiptDigest,
      status: status(false),
    });
    await expect(executePtrOwnerProvisionOperator({
      arguments: args('provision', confirmation), environment: env(),
      dependencies: {
        readImportReceipt: vi.fn(() => ({ receipt: receipt() })),
        createStatusTransport: vi.fn(() => ({
          inspect: vi.fn(async () => status(false)),
          prepareSubmission: vi.fn(), submit: vi.fn(), close,
        })),
        requestOwnerToken: vi.fn(async () => 'owner.jwt.token'),
        validateOwnerToken: vi.fn(() => ({ ownerFid: OWNER_FID + 1n, ownerAuthEpoch: 7 })),
        createOwnerTransport,
      } as never,
    })).rejects.toMatchObject({ code: 'PTR_OWNER_PROVISION_OWNER_AUTHORITY_INVALID', submitted: false });
    expect(createOwnerTransport).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('orders receipt/status, owner authority, second reopen, proof, one mutation, and receipts', async () => {
    const order: string[] = [];
    const statuses = [status(false), status(false), status(true)];
    const dependencies = {
      readImportReceipt: vi.fn(() => { order.push('reopen'); return { receipt: receipt() }; }),
      inspectStatus: vi.fn(async () => { order.push('status'); return statuses.shift(); }),
      resolveOwnerAuthority: vi.fn(async () => {
        order.push('resolve'); return { ownerFid: OWNER_FID, ownerAuthEpoch: 7 };
      }),
      requestOwnerToken: vi.fn(async () => { order.push('token'); return 'owner.jwt.token'; }),
      validateOwnerToken: vi.fn(() => {
        order.push('validate'); return { ownerFid: OWNER_FID, ownerAuthEpoch: 7 };
      }),
      deriveOwnerProof: vi.fn(() => { order.push('proof'); return '7'.repeat(64); }),
      createOwnerTransport: vi.fn(() => ({
        provisionOwner: vi.fn(async () => {
          order.push('mutation'); return { ownerFid: OWNER_FID, ownerAuthEpoch: 7 };
        }),
        close: vi.fn(async () => { order.push('close'); }),
      })),
      writeReceipt: vi.fn(({ kind }: { kind: string }) => {
        order.push(`write:${kind}`); return { result: 'installed' };
      }),
      nowSeconds: () => 1_800_000_000,
    };
    const confirmation = ptrOwnerProvisionConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      atlasImportReceiptDigest: receipt().importReceiptDigest,
      status: status(false),
    });
    const result = await executePtrOwnerProvisionOperator({
      arguments: args('provision', confirmation), environment: env(),
      dependencies: dependencies as never,
    });
    expect(order).toEqual([
      'reopen', 'status', 'resolve', 'token', 'validate', 'reopen', 'proof',
      'status', 'mutation', 'status', 'write:owner-provision',
      'write:sealed-live', 'close',
    ]);
    expect(dependencies.deriveOwnerProof).toHaveBeenCalledWith({
      launchEntropy: ENTROPY,
      ownerFid: OWNER_FID,
      ownerAuthEpoch: 7,
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
    });
    expect(result).toMatchObject({
      ptrOwnerProvisionReceipt: { atlasImportReceiptDigest: receipt().importReceiptDigest },
      ptrSealedLiveReceipt: {
        ownerProvisionReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      privacySafe: true,
    });
    expect(JSON.stringify(result)).not.toContain(OWNER_FID.toString());
    expect(JSON.stringify(result)).not.toContain(OWNER_SECRET);
    expect(JSON.stringify(result)).not.toContain(ENTROPY);
  });

  it('rejects a swapped second import receipt before proof or mutation', async () => {
    const first = receipt();
    const swapped = { ...first, importReceiptDigest: '8'.repeat(64) };
    const readImportReceipt = vi.fn()
      .mockReturnValueOnce({ receipt: first })
      .mockReturnValueOnce({ receipt: swapped });
    const confirmation = ptrOwnerProvisionConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY, moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256, atlasImportReceiptDigest: first.importReceiptDigest,
      status: status(false),
    });
    const deriveOwnerProof = vi.fn();
    const createOwnerTransport = vi.fn();
    await expect(executePtrOwnerProvisionOperator({
      arguments: args('provision', confirmation), environment: env(),
      dependencies: {
        readImportReceipt, inspectStatus: vi.fn(async () => status(false)),
        resolveOwnerAuthority: vi.fn(async () => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 })),
        requestOwnerToken: vi.fn(async () => 'owner.jwt.token'),
        validateOwnerToken: vi.fn(() => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 })),
        deriveOwnerProof, createOwnerTransport,
      } as never,
    })).rejects.toThrow('PTR_OWNER_PROVISION_IMPORT_ANCESTRY_INVALID');
    expect(deriveOwnerProof).not.toHaveBeenCalled();
    expect(createOwnerTransport).not.toHaveBeenCalled();
  });

  it.each([
    'owner-database',
    'owner-proof',
    'sealed-module',
    'sealed-proof',
    'sealed-import-ancestry',
  ] as const)('rejects authenticated receipt tampering: %s', async mutation => {
    const statuses = [status(false), status(false), status(true)];
    const confirmation = ptrOwnerProvisionConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      atlasImportReceiptDigest: receipt().importReceiptDigest,
      status: status(false),
    });
    await expect(executePtrOwnerProvisionOperator({
      arguments: args('provision', confirmation), environment: env(),
      dependencies: {
        readImportReceipt: vi.fn(() => ({ receipt: receipt() })),
        inspectStatus: vi.fn(async () => statuses.shift()),
        resolveOwnerAuthority: vi.fn(async () => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 })),
        requestOwnerToken: vi.fn(async () => 'owner.jwt.token'),
        validateOwnerToken: vi.fn(() => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 })),
        deriveOwnerProof: vi.fn(() => '7'.repeat(64)),
        createOwnerTransport: vi.fn(() => ({
          provisionOwner: vi.fn(async () => ({ ownerFid: OWNER_FID, ownerAuthEpoch: 7 })),
          close: vi.fn(async () => undefined),
        })),
        executeProvision: async (
          input: Parameters<typeof executePtrOwnerProvision>[0],
        ) => {
          const provision = await executePtrOwnerProvision(input);
          const { provisionReceiptDigest: _ownerDigest, ...ownerBody } =
            provision.ownerProvisionReceipt;
          const ownerMutation = mutation === 'owner-database'
            ? { databaseIdentity: '2'.repeat(64) }
            : mutation === 'owner-proof'
              ? { ownerOpaqueProofDigest: '8'.repeat(64) }
              : {};
          const ownerWithoutDigest = { ...ownerBody, ...ownerMutation };
          const ownerProvisionReceipt = {
            ...ownerWithoutDigest,
            provisionReceiptDigest: ptrOwnerProvisionReceiptDigest(ownerWithoutDigest),
          };
          const sealedMutation = mutation === 'sealed-module'
            ? { moduleSha256: '9'.repeat(64) }
            : mutation === 'sealed-proof'
              ? { ownerOpaqueProofDigest: '6'.repeat(64) }
              : mutation === 'sealed-import-ancestry'
                ? { verificationDigest: '5'.repeat(64) }
                : {};
          const sealedLiveReceipt = {
            ...provision.sealedLiveReceipt,
            ...sealedMutation,
            ownerProvisionReceiptDigest: ownerProvisionReceipt.provisionReceiptDigest,
          };
          return {
            ownerProvisionReceipt,
            sealedLiveReceipt,
            sealedLiveReceiptDigest: ptrSealedLiveReceiptDigest(sealedLiveReceipt),
          } as never;
        },
        writeReceipt: vi.fn(),
        nowSeconds: () => 1_800_000_000,
      } as never,
    })).rejects.toThrow('PTR_OWNER_PROVISION_RECEIPT_ANCESTRY_INVALID');
  });
});
