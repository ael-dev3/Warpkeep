// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GENESIS_002_SEALED_LIVE_TARGET,
  genesis002SealedLiveReceiptDigest,
  parseGenesis002SealedLiveArguments,
  verifyGenesis002FreshPublishStatus,
  verifyGenesis002SealedLiveStatus,
} from '../scripts/genesis002-sealed-live-receipt.mjs';

const G001 =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const IDENTITY = '1'.repeat(64);
const MODULE_COMMIT = '2'.repeat(40);
const MODULE_SHA = '3'.repeat(64);
const ATLAS_COMMIT = '4'.repeat(40);
const RELEASE_SHA = '5'.repeat(64);
const HEADER_SHA = '6'.repeat(64);
const VERIFY_SHA = '7'.repeat(64);
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const PUBLIC_APPROVAL_ID = `GRA-${'B'.repeat(26)}`;

const realmStatus = () => ({
  realmId: 'GENESIS_002',
  databaseName: 'warpkeep-genesis-002',
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
  releaseVersion: '0.4.0',
  launchState: 'sealed',
  admissionsOpen: false,
  accessRequestsOpen: false,
  admittedPlayers: 0n,
  founders: 0n,
  allowedFids: 0n,
  accessRequests: 0n,
  playersV1: 0n,
  playersV2: 0n,
  ownershipBindings: 0n,
  castles: 0n,
  realmProfiles: 0n,
  termsAcceptances: 0n,
  markAccounts: 0n,
  resourceAccounts: 0n,
  castleClaims: 0n,
  cellOccupancies: 0n,
  activationRows: 0n,
  workerSystemRows: 0n,
  atlasImportMutationsEnabled: true,
  atlasActivationMutationsEnabled: false,
  playerPresentationEnabled: false,
  atlasPresent: true,
  atlasId: 'GENESIS_002_GREATER_REALM',
  publicReleaseId: PUBLIC_RELEASE_ID,
  atlasState: 'ready',
  atlasReady: true,
  atlasCellRows: 100n,
  atlasSlotRows: 600n,
  atlasResourceRows: 20n,
});

const atlasStatus = () => ({
  present: true,
  atlasId: 'GENESIS_002_GREATER_REALM',
  publicReleaseId: PUBLIC_RELEASE_ID,
  publicApprovalReceiptId: PUBLIC_APPROVAL_ID,
  sourceCommit: ATLAS_COMMIT,
  expectedReleaseSha256: RELEASE_SHA,
  releaseHeaderSha256: HEADER_SHA,
  state: 'ready',
  importEpoch: 1n,
  verificationPhase: 'complete',
  verificationCursor: 0n,
  verificationDigest: VERIFY_SHA,
  expectedRegionCount: 6,
  expectedComponentCount: 3,
  expectedChunkCount: 2,
  expectedCellCount: 100,
  expectedSlotCount: 600,
  expectedResourceNodeCount: 20,
  verifiedComponentCount: 3,
  verifiedChunkCount: 2,
  verifiedCellCount: 100,
  verifiedSlotCount: 600,
  verifiedResourceNodeCount: 20,
  componentExpectedCellCount: 100,
  componentExpectedSlotCount: 600,
  componentExpectedResourceNodeCount: 20,
  importedPassableCellCount: 100,
  regionManifestRows: 6,
  componentRows: 3n,
  chunkRows: 2n,
  cellRows: 100n,
  slotRows: 600n,
  resourceRows: 20n,
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
});

const input = () => ({
  databaseIdentity: IDENTITY,
  moduleSourceCommit: MODULE_COMMIT,
  moduleSha256: MODULE_SHA,
  atlasSourceCommit: ATLAS_COMMIT,
  publicReleaseId: PUBLIC_RELEASE_ID,
  publicApprovalReceiptId: PUBLIC_APPROVAL_ID,
  releaseSha256: RELEASE_SHA,
  releaseHeaderSha256: HEADER_SHA,
  verificationDigest: VERIFY_SHA,
  realmStatusValue: realmStatus(),
  atlasStatusValue: atlasStatus(),
});

describe('Genesis 002 sealed live receipt', () => {
  it('is locked to a distinct immutable Maincloud database identity', () => {
    expect(GENESIS_002_SEALED_LIVE_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      bridge: 'https://auth.warpkeep.com',
      databaseAlias: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
      genesis001DatabaseIdentity: G001,
    });
  });

  it('requires every exact immutable live-operator binding and rejects G001', () => {
    const arguments_ = [
      `--database-identity=${IDENTITY}`,
      `--module-source-commit=${MODULE_COMMIT}`,
      `--module-sha256=${MODULE_SHA}`,
      `--atlas-source-commit=${ATLAS_COMMIT}`,
      `--public-release-id=${PUBLIC_RELEASE_ID}`,
      `--public-approval-receipt-id=${PUBLIC_APPROVAL_ID}`,
      `--release-sha256=${RELEASE_SHA}`,
      `--release-header-sha256=${HEADER_SHA}`,
      `--verification-digest=${VERIFY_SHA}`,
    ];
    expect(parseGenesis002SealedLiveArguments(arguments_)).toEqual({
      databaseIdentity: IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA,
      atlasSourceCommit: ATLAS_COMMIT,
      publicReleaseId: PUBLIC_RELEASE_ID,
      publicApprovalReceiptId: PUBLIC_APPROVAL_ID,
      releaseSha256: RELEASE_SHA,
      releaseHeaderSha256: HEADER_SHA,
      verificationDigest: VERIFY_SHA,
    });
    expect(() => parseGenesis002SealedLiveArguments(arguments_.slice(0, -1))).toThrow();
    expect(() => parseGenesis002SealedLiveArguments([
      ...arguments_.slice(1),
      `--database-identity=${G001}`,
    ])).toThrow('GENESIS_002_LIVE_TARGET_COLLIDES_WITH_GENESIS_001');
  });

  it('emits a privacy-safe final receipt only for ready atlas plus exact zero state', () => {
    const result = verifyGenesis002SealedLiveStatus(input());
    expect(result.receipt).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-genesis-002-sealed-live-v1',
      databaseIdentity: IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA,
      atlasSourceCommit: ATLAS_COMMIT,
      atlasId: 'GENESIS_002_GREATER_REALM',
      publicReleaseId: PUBLIC_RELEASE_ID,
      releaseSha256: RELEASE_SHA,
      releaseHeaderSha256: HEADER_SHA,
      verificationDigest: VERIFY_SHA,
      atlasState: 'ready',
      atlasFinalized: true,
      activationMutationsEnabled: false,
      playerPresentationEnabled: false,
      admissionNotificationsEnabled: false,
      workerSystemRows: 0,
    });
    expect(result.receipt).not.toHaveProperty('publicApprovalReceiptId');
    expect(result.receiptDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('recomputes only the exact ordered sealed-live receipt schema', () => {
    const result = verifyGenesis002SealedLiveStatus(input());
    expect(genesis002SealedLiveReceiptDigest(result.receipt)).toBe(
      '36026daf8b85fbb0163c0400974e0725898294b78223a1d6e3d3e07dab780900',
    );
    expect(result.receiptDigest).toBe(
      '36026daf8b85fbb0163c0400974e0725898294b78223a1d6e3d3e07dab780900',
    );
    expect(() => genesis002SealedLiveReceiptDigest(
      Object.fromEntries(Object.entries(result.receipt).reverse()),
    )).toThrow('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
    const { databaseIdentity: _databaseIdentity, ...missing } = result.receipt;
    expect(() => genesis002SealedLiveReceiptDigest(missing))
      .toThrow('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
    expect(() => genesis002SealedLiveReceiptDigest({
      ...result.receipt,
      futureAdmissionAuthority: false,
    })).toThrow('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
    expect(() => genesis002SealedLiveReceiptDigest({
      ...result.receipt,
      databaseIdentity: [IDENTITY],
    })).toThrow('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
    expect(() => genesis002SealedLiveReceiptDigest({
      ...result.receipt,
      allowedFids: -0,
    })).toThrow('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
  });

  it('rejects wrong target, source, population, activation, or unfinished atlas', () => {
    for (const candidate of [
      { ...input(), databaseIdentity: G001 },
      { ...input(), atlasSourceCommit: '8'.repeat(40) },
      { ...input(), realmStatusValue: { ...realmStatus(), allowedFids: 1n } },
      { ...input(), realmStatusValue: { ...realmStatus(), workerSystemRows: 1n } },
      { ...input(), realmStatusValue: { ...realmStatus(), playerPresentationEnabled: true } },
      { ...input(), atlasStatusValue: { ...atlasStatus(), activationRows: 1n } },
      { ...input(), atlasStatusValue: { ...atlasStatus(), activationMutationsCompiled: true } },
      { ...input(), atlasStatusValue: { ...atlasStatus(), state: 'verifying', ready: false } },
      { ...input(), atlasStatusValue: { ...atlasStatus(), verifiedCellCount: 99 } },
    ]) {
      expect(() => verifyGenesis002SealedLiveStatus(candidate)).toThrow();
    }
  });

  it('rejects shape widening instead of silently ignoring new authority fields', () => {
    expect(() => verifyGenesis002SealedLiveStatus({
      ...input(),
      realmStatusValue: { ...realmStatus(), admissionsOpenSoon: true },
    })).toThrow('GENESIS_002_LIVE_REALM_STATUS_SHAPE_CHANGED');
    expect(() => verifyGenesis002SealedLiveStatus({
      ...input(),
      atlasStatusValue: { ...atlasStatus(), activationReady: true },
    })).toThrow('GENESIS_002_LIVE_ATLAS_STATUS_SHAPE_CHANGED');
  });

  it('verifies a fresh published identity is sealed and wholly empty before atlas import', () => {
    const freshRealm = {
      ...realmStatus(),
      atlasPresent: false,
      atlasId: undefined,
      publicReleaseId: undefined,
      atlasState: 'absent',
      atlasReady: false,
      atlasCellRows: 0n,
      atlasSlotRows: 0n,
      atlasResourceRows: 0n,
    };
    const freshAtlas = Object.fromEntries(Object.entries(atlasStatus()).map(([key, value]) => {
      if ([
        'atlasId', 'publicReleaseId', 'publicApprovalReceiptId', 'sourceCommit',
        'expectedReleaseSha256', 'releaseHeaderSha256', 'importEpoch',
      ].includes(key)) return [key, undefined];
      if (key === 'present' || key === 'importsExact' || key === 'ready') return [key, false];
      if (key === 'state') return [key, 'absent'];
      if (key === 'verificationPhase') return [key, 'components'];
      if (key === 'verificationDigest') return [key, `sha256-v1:${'0'.repeat(64)}:0:`];
      if (typeof value === 'bigint') return [key, 0n];
      if (typeof value === 'number') return [key, 0];
      return [key, value];
    }));
    const result = verifyGenesis002FreshPublishStatus({
      databaseIdentity: IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA,
      realmStatusValue: freshRealm,
      atlasStatusValue: freshAtlas,
    });
    expect(result).toMatchObject({
      profile: 'warpkeep-genesis-002-fresh-publish-v1',
      databaseIdentity: IDENTITY,
      realmId: 'GENESIS_002',
      atlasPresent: false,
      zeroPopulationBoundary: true,
      activationMutationsEnabled: false,
      playerPresentationEnabled: false,
    });
    expect(() => verifyGenesis002FreshPublishStatus({
      databaseIdentity: IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA,
      realmStatusValue: { ...freshRealm, playersV2: 1n },
      atlasStatusValue: freshAtlas,
    })).toThrow('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
  });
});
