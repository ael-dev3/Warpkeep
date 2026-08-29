// @vitest-environment node

import {
  createHash,
} from 'node:crypto';
import {
  chmodSync,
  closeSync,
  linkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scripts/genesis001-sealed-launch-adoption.mjs', async () => {
  const actual = await vi.importActual<typeof import(
    '../scripts/genesis001-sealed-launch-adoption.mjs'
  )>('../scripts/genesis001-sealed-launch-adoption.mjs');
  return {
    ...actual,
    deriveGenesis001SealedLaunchEvidence: (value: {
      freezePublishReceipt: {
        receiptBasename: string;
        receiptSha256: string;
        receipt: { protectedMainCommit: string };
      };
    }) => {
      const derived = actual.deriveGenesis001SealedLaunchEvidenceForTesting(
        value,
        {
          freezePublishSourceCommit:
            value.freezePublishReceipt.receipt.protectedMainCommit,
          freezePublishReceiptBasename:
            value.freezePublishReceipt.receiptBasename,
          freezePublishReceiptDigest: value.freezePublishReceipt.receiptSha256,
        },
        new Date('2026-08-28T12:02:00.000Z'),
      );
      return {
        ...derived,
        g001FreezePublishReceiptDigest:
          actual.GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
      };
    },
  };
});

import {
  createSealedLaunchActivationBindingFromEvidence,
  generateSealedLaunchActivationBindingFromDescriptor,
} from '../scripts/generate-0.4.0-sealed-launch-activation.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from '../scripts/genesis002-activation-receipts.mjs';
import {
  GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
  genesis001CensusOpaqueProofDigest,
  genesis001AdmissionMonitorCurrentStateReceiptDigest,
  genesis001FreezePublishReceiptDigest,
  genesis001MonitorSuspensionReceiptDigest,
  genesis001PolicyObservationBootstrapReceiptDigest,
  genesis001PolicyReceiptDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];
const PREPARATION_COMMIT = 'a'.repeat(40);
const DATABASE_IDENTITY = 'd'.repeat(64);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'e'.repeat(64);
const SPACETIME_DIGEST = 'f'.repeat(64);
const CLI_CONFIG_DIGEST = '0'.repeat(64);
const FRESH_STATUS_DIGEST = '1'.repeat(64);
const ATLAS_COMMIT = PREPARATION_COMMIT;
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const RELEASE_SHA256 = '5'.repeat(64);
const RELEASE_HEADER_SHA256 = '6'.repeat(64);
const VERIFICATION_DIGEST = '7'.repeat(64);
const PUBLISH_RECEIPT_DIGEST =
  '013a3b8824135f0f1a782a915f9ce8d7908c19d39510423fc1f817e137a06bb1';
const IMPORT_RECEIPT_DIGEST =
  '7c9e58982395bd6314a07f6f568981641397a1dc54637ed61482eef39990e628';
const SEALED_LIVE_RECEIPT_DIGEST =
  'dcb9c865763cd9724edd4d71f0ca93ba58f3b54d863b9d263ae4675cef9f53b4';
const PTR_DATABASE_IDENTITY = '9'.repeat(64);
const PTR_MODULE_SHA256 = 'a'.repeat(64);
const PTR_MODULE_TREE_ID = 'b'.repeat(40);
const PTR_DEPENDENCY_DIGEST = 'c'.repeat(64);
const PTR_SPACETIME_DIGEST = 'd'.repeat(64);
const PTR_CLI_CONFIG_DIGEST = 'e'.repeat(64);
const PTR_FRESH_STATUS_DIGEST = 'f'.repeat(64);
const PTR_PUBLIC_RELEASE_ID = `GRR-${'B'.repeat(26)}`;
const PTR_RELEASE_MANIFEST_SHA256 = '1'.repeat(64);
const PTR_EXPECTED_RELEASE_SHA256 = '2'.repeat(64);
const PTR_RELEASE_HEADER_SHA256 = '3'.repeat(64);
const PTR_VERIFICATION_DIGEST = '4'.repeat(64);
const PTR_OWNER_OPAQUE_PROOF_DIGEST = '0123456789abcdef'.repeat(4);
const FREEZE_SOURCE_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123';
const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const G001_BASELINE = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const G001_BASELINE_ABI =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
const G001_FREEZE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
const TEST_PREPARATION_BOOTSTRAP_AUTHORITY: Readonly<{
  preparationSourceCommit: string;
  moduleTreeId: string;
  bootstrapBlob: string;
  bootstrapSha256: string;
}> = Object.freeze({
  preparationSourceCommit: PREPARATION_COMMIT,
  moduleTreeId: '1'.repeat(40),
  bootstrapBlob: '2'.repeat(40),
  bootstrapSha256:
    'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a',
});

function sortedCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortedCanonical(item)]));
  }
  return value;
}

function descriptorDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortedCanonical(value)))
    .digest('hex');
}

function ptrReceiptDigest(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(value)}\n`)
    .digest('hex');
}

function g001Policy() {
  return {
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: G001_BASELINE,
    freezeReleaseNonce: G001_FREEZE_NONCE,
  } as const;
}

function g001BuildProvenance() {
  return {
    schemaVersion: 2,
    profile: 'warpkeep-genesis-001-frozen-build-provenance-v2',
    platform: 'darwin',
    architecture: 'arm64',
    nodeVersion: 'v24.19.0',
    nodeExecutableSha256:
      '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1',
    spacetimeCliVersion: '2.6.1',
    spacetimeCliCommit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
    spacetimeCliExecutableSha256:
      '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
    spacetimeStandaloneExecutableSha256:
      '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa',
    dependencyInstallerProfile:
      'warpkeep-genesis-001-historical-root-dependency-closure-v1',
    dependencyLockfileSha256:
      '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234',
    lockedPackageCount: 16,
    dependencyArchiveClosureSha256: '1'.repeat(64),
    dependencyClosureSha256: '2'.repeat(64),
    dependencyTreeEntryCount: 128,
  };
}

function g001FreezeReceipt() {
  const livePolicyReceipt = g001Policy();
  const buildProvenance = g001BuildProvenance();
  return {
    schemaVersion: 2,
    profile: 'warpkeep-genesis-001-freeze-publish-final-receipt-v2',
    outcome: 'published',
    target: {
      uri: 'https://maincloud.spacetimedb.com',
      database: G001_DATABASE_IDENTITY,
    },
    protectedMainCommit: FREEZE_SOURCE_COMMIT,
    sourceBaselineCommit: G001_BASELINE,
    baselineAbiSha256: G001_BASELINE_ABI,
    freezeReleaseNonce: G001_FREEZE_NONCE,
    artifactSha256: '3'.repeat(64),
    candidateDescriptorSha256: '4'.repeat(64),
    postflightDescriptorSha256: '4'.repeat(64),
    buildProvenance,
    buildProvenanceSha256: descriptorDigest(buildProvenance),
    livePolicyReceipt,
    livePolicyReceiptSha256: genesis001PolicyReceiptDigest(livePolicyReceipt),
  };
}

const TEST_FREEZE_RECEIPT = g001FreezeReceipt();
const TEST_FREEZE_RECEIPT_BASENAME =
  'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json';
const TEST_ADOPTION_AUTHORITY = Object.freeze({
  freezePublishSourceCommit: FREEZE_SOURCE_COMMIT,
  freezePublishReceiptBasename: TEST_FREEZE_RECEIPT_BASENAME,
  freezePublishReceiptDigest:
    genesis001FreezePublishReceiptDigest(TEST_FREEZE_RECEIPT),
});

function g001PolicyObservation() {
  const policy = g001Policy();
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-live-policy-observation-v1',
    sourceCommit: PREPARATION_COMMIT,
    observedAt: '2026-08-28T12:00:00.000Z',
    databaseIdentity: G001_DATABASE_IDENTITY,
    procedure: 'genesis_001_access_policy_v1',
    mutationSubmitted: false,
    policy,
    policyReceiptDigest: genesis001PolicyReceiptDigest(policy),
  };
}

function updateLengthFramed(
  hash: ReturnType<typeof createHash>,
  label: string,
  value: string,
) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.length));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.length));
  hash.update(length).update(valueBytes);
}

function relinkG001PolicyObservationBootstrapReceipt<T extends {
  protectedCommit: string;
  moduleTreeId: string;
  bootstrapBlob: string;
  bootstrapSha256: string;
  launchCleanup: Record<string, unknown>;
  policyObservationReceipt: ReturnType<typeof g001PolicyObservation>;
  policyObservationReceiptLinkSha256: string;
}>(receipt: T): T {
  const hash = createHash('sha256');
  updateLengthFramed(
    hash,
    'domain',
    'warpkeep-production-g001-policy-observation-bootstrap-link-v1',
  );
  updateLengthFramed(hash, 'protectedCommit', receipt.protectedCommit);
  updateLengthFramed(hash, 'moduleTreeId', receipt.moduleTreeId);
  updateLengthFramed(hash, 'bootstrapBlob', receipt.bootstrapBlob);
  updateLengthFramed(hash, 'bootstrapSha256', receipt.bootstrapSha256);
  updateLengthFramed(hash, 'command', 'g001-policy-observe');
  updateLengthFramed(
    hash,
    'launchCleanup',
    `${JSON.stringify(sortedCanonical(receipt.launchCleanup))}\n`,
  );
  updateLengthFramed(
    hash,
    'policyObservationReceipt',
    `${JSON.stringify(receipt.policyObservationReceipt)}\n`,
  );
  receipt.policyObservationReceiptLinkSha256 = hash.digest('hex');
  return receipt;
}

function g001PolicyObservationBootstrapReceipt() {
  const receipt = {
    profile: 'warpkeep-greater-realm-production-bootstrap-v1',
    protectedCommit: PREPARATION_COMMIT,
    moduleTreeId: TEST_PREPARATION_BOOTSTRAP_AUTHORITY.moduleTreeId,
    bootstrapBlob: TEST_PREPARATION_BOOTSTRAP_AUTHORITY.bootstrapBlob,
    bootstrapSha256: TEST_PREPARATION_BOOTSTRAP_AUTHORITY.bootstrapSha256,
    moduleArchiveCount: 16,
    command: 'g001-policy-observe',
    launchCleanup: {
      outcome: 'cleaned',
      runId: `run-${'4'.repeat(32)}`,
      cleanupConfirmationSha256: '5'.repeat(64),
      treeInventorySha256: '6'.repeat(64),
    },
    policyObservationReceipt: g001PolicyObservation(),
    policyObservationReceiptLinkSha256: '',
  };
  return relinkG001PolicyObservationBootstrapReceipt(receipt);
}

function g001CensusReceipt(
  stamp = '20260828T120000Z',
  nonceHex = '7'.repeat(64),
) {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: PREPARATION_COMMIT,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: '89'.repeat(32),
      size: 128,
    },
    privateBlindingNonceHex: nonceHex,
  };
  return {
    ...receipt,
    opaqueProofDigest: genesis001CensusOpaqueProofDigest(receipt),
  };
}

function g001MonitorEvidence() {
  const receipt = {
    disabled: true,
    label: 'com.warpkeep.hermes-admission-monitor',
    loaded: false,
    monitorPlistSha256:
      'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256:
      '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    profile: 'warpkeep-genesis001-admission-monitor-suspension-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: PREPARATION_COMMIT,
    suspendedAt: '2026-08-28T12:01:00.000Z',
  };
  const receiptSha256 = genesis001MonitorSuspensionReceiptDigest(receipt);
  return {
    receiptBasename:
      `genesis001-admission-monitor-suspended-20260828T120100000Z-${receiptSha256.slice(0, 12)}.json`,
    receiptSha256,
    receipt,
  };
}

function g001MonitorCurrentStateReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis001-admission-monitor-current-state-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: PREPARATION_COMMIT,
    observedAt: '2026-08-28T12:01:30.000Z',
    label: 'com.warpkeep.hermes-admission-monitor',
    disabled: true,
    loaded: false,
    monitorPlistSha256:
      'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256:
      '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
  };
}

function bindingCandidate() {
  const value = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'config/releases/0.4.0-sealed-launch.json'),
    'utf8',
  ));
  Object.assign(value, {
    pagesDeploymentApproved: true,
    preparationSourceCommit: PREPARATION_COMMIT,
    authBridgeSourceCommit: PREPARATION_COMMIT,
    admissionRequestSuspensionReceiptDigest: 'e'.repeat(64),
  });
  let clear = false;
  for (const key of Object.keys(value)) {
    if (key === 'g002PublishReceiptDigest') clear = true;
    if (clear) value[key] = null;
  }
  return value;
}

function publishReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-production-publish-v1',
    databaseIdentity: DATABASE_IDENTITY,
    database: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    sourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    deleteData: 'never',
    outcome: 'verified',
    freshStatusDigest: FRESH_STATUS_DIGEST,
    playerAccessEnabled: false,
    admissionMutationsEnabled: false,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
    publishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
  };
}

function atlasImportReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep.genesis-002.production-import.v1',
    outcome: 'ready',
    databaseIdentity: DATABASE_IDENTITY,
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    atlasId: 'GENESIS_002_GREATER_REALM',
    atlasSourceCommit: ATLAS_COMMIT,
    publicReleaseId: PUBLIC_RELEASE_ID,
    expectedReleaseSha256: RELEASE_SHA256,
    verificationDigest: VERIFICATION_DIGEST,
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: '8'.repeat(64),
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasWritesClosedByFinalization: true,
    importReceiptDigest: IMPORT_RECEIPT_DIGEST,
  };
}

function sealedLiveReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    releaseVersion: '0.4.0',
    realmId: 'GENESIS_002',
    atlasSourceCommit: ATLAS_COMMIT,
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: PUBLIC_RELEASE_ID,
    releaseSha256: RELEASE_SHA256,
    releaseHeaderSha256: RELEASE_HEADER_SHA256,
    verificationDigest: VERIFICATION_DIGEST,
    atlasState: 'ready',
    atlasFinalized: true,
    atlasImportsExact: true,
    atlasImportSurfaceCompiled: true,
    atlasWritesClosedByFinalization: true,
    admissionsOpen: false,
    accessRequestsOpen: false,
    admittedPlayers: 0,
    founders: 0,
    allowedFids: 0,
    accessRequests: 0,
    playersV1: 0,
    playersV2: 0,
    ownershipBindings: 0,
    castles: 0,
    realmProfiles: 0,
    termsAcceptances: 0,
    markAccounts: 0,
    resourceAccounts: 0,
    claimRows: 0,
    occupancyRows: 0,
    activationRows: 0,
    workerSystemRows: 0,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  };
}

function ptrPublishReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-production-publish-v1',
    databaseIdentity: PTR_DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    sourceCommit: PREPARATION_COMMIT,
    moduleSha256: PTR_MODULE_SHA256,
    moduleTreeId: PTR_MODULE_TREE_ID,
    dependencyClosureDigest: PTR_DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: PTR_SPACETIME_DIGEST,
    spacetimeCliConfigSha256: PTR_CLI_CONFIG_DIGEST,
    deleteData: 'never',
    outcome: 'verified',
    freshDatabase: true,
    freshStatusDigest: PTR_FRESH_STATUS_DIGEST,
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
  };
  return {
    ...receipt,
    publishReceiptDigest: ptrReceiptDigest(
      'warpkeep.ptr.production-publish-receipt.v1',
      receipt,
    ),
  };
}

function ptrAtlasImportReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep.ptr.production-import.v1',
    outcome: 'ready',
    databaseIdentity: PTR_DATABASE_IDENTITY,
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: PTR_MODULE_SHA256,
    moduleTreeId: PTR_MODULE_TREE_ID,
    dependencyClosureDigest: PTR_DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: PTR_SPACETIME_DIGEST,
    atlasId: 'PTR_GREATER_REALM',
    atlasSourceCommit: PREPARATION_COMMIT,
    publicReleaseId: PTR_PUBLIC_RELEASE_ID,
    releaseManifestSha256: PTR_RELEASE_MANIFEST_SHA256,
    expectedReleaseSha256: PTR_EXPECTED_RELEASE_SHA256,
    releaseHeaderSha256: PTR_RELEASE_HEADER_SHA256,
    verificationDigest: PTR_VERIFICATION_DIGEST,
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: '6'.repeat(64),
    zeroPopulationBoundary: true,
    importsExact: true,
    ready: true,
    atlasFinalized: true,
    atlasWritesClosedByFinalization: true,
    importMutationsCompiled: true,
    activationMutationsCompiled: false,
  };
  return {
    ...receipt,
    importReceiptDigest: ptrReceiptDigest(
      'warpkeep.ptr.production-import-receipt.v1',
      receipt,
    ),
  };
}

function ptrOwnerProvisionReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-owner-provision-v1',
    outcome: 'verified',
    databaseIdentity: PTR_DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    ownerOpaqueProofDigest: PTR_OWNER_OPAQUE_PROOF_DIGEST,
    ownerAnchorRows: 1,
    ownerProvisioned: true,
    ownerEnabled: true,
    zeroPopulationBoundary: true,
  };
  return {
    ...receipt,
    provisionReceiptDigest: ptrReceiptDigest(
      'warpkeep.ptr.owner-provision-receipt.v1',
      receipt,
    ),
  };
}

function ptrSealedLiveReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: PTR_DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: PTR_MODULE_SHA256,
    releaseVersion: '0.4.0-ptr.1',
    realmId: 'PTR',
    atlasSourceCommit: PREPARATION_COMMIT,
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: PTR_PUBLIC_RELEASE_ID,
    releaseManifestSha256: PTR_RELEASE_MANIFEST_SHA256,
    expectedReleaseSha256: PTR_EXPECTED_RELEASE_SHA256,
    releaseHeaderSha256: PTR_RELEASE_HEADER_SHA256,
    verificationDigest: PTR_VERIFICATION_DIGEST,
    atlasState: 'ready',
    atlasFinalized: true,
    atlasImportsExact: true,
    atlasWritesClosedByFinalization: true,
    allowedFids: 0,
    accessRequests: 0,
    playersV1: 0,
    playersV2: 0,
    ownershipBindings: 0,
    castles: 0,
    realmProfiles: 0,
    termsAcceptances: 0,
    markAccounts: 0,
    resourceAccounts: 0,
    claimRows: 0,
    occupancyRows: 0,
    activationRows: 0,
    publicAtlasRows: 0,
    publicRegionRows: 0,
    workerSystemRows: 0,
    atlasImportMutationsCompiled: true,
    atlasActivationMutationsCompiled: false,
    ownerOpaqueProofDigest: PTR_OWNER_OPAQUE_PROOF_DIGEST,
    ownerAnchorRows: 1,
    ownerProvisioned: true,
    ownerEnabled: true,
    admissionsOpen: false,
    accessRequestsOpen: false,
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
    playerPresentationEnabled: true,
  };
}

function evidenceEnvelope() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-sealed-launch-activation-evidence-v1',
    bindingCandidate: bindingCandidate(),
    g001FreezePublishReceipt: {
      receiptBasename: TEST_FREEZE_RECEIPT_BASENAME,
      receiptSha256: TEST_ADOPTION_AUTHORITY.freezePublishReceiptDigest,
      receipt: TEST_FREEZE_RECEIPT,
    },
    g001PolicyObservationBootstrapReceipt:
      g001PolicyObservationBootstrapReceipt(),
    g001CensusPrivacySafePrivateReceipt: {
      first: g001CensusReceipt(),
      second: g001CensusReceipt('20260828T120100Z', '8'.repeat(64)),
    },
    g001AdmissionMonitorSuspensionReceipt: g001MonitorEvidence(),
    g001AdmissionMonitorCurrentStateReceipt:
      g001MonitorCurrentStateReceipt(),
    g002PublishReceipt: publishReceipt(),
    g002AtlasImportReceipt: atlasImportReceipt(),
    g002SealedLiveReceipt: sealedLiveReceipt(),
    g002SealedLiveReceiptDigest: SEALED_LIVE_RECEIPT_DIGEST,
    ptrPublishReceipt: ptrPublishReceipt(),
    ptrAtlasImportReceipt: ptrAtlasImportReceipt(),
    ptrOwnerProvisionReceipt: ptrOwnerProvisionReceipt(),
    ptrSealedLiveReceipt: ptrSealedLiveReceipt(),
    ptrSealedLiveReceiptDigest: ptrReceiptDigest(
      'warpkeep.ptr.sealed-live-receipt.v1',
      ptrSealedLiveReceipt(),
    ),
  };
}

function createBindingFromEvidence(
  envelope: ReturnType<typeof evidenceEnvelope>,
) {
  return createSealedLaunchActivationBindingFromEvidence(
    envelope,
    TEST_PREPARATION_BOOTSTRAP_AUTHORITY,
  );
}

function generateBindingFromDescriptor(descriptor: number) {
  return generateSealedLaunchActivationBindingFromDescriptor(
    descriptor,
    TEST_PREPARATION_BOOTSTRAP_AUTHORITY,
  );
}

function canonical(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function inputDescriptor(contents: string | Uint8Array, mode = 0o600) {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-activation-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'candidate.json');
  writeFileSync(path, contents, { encoding: 'utf8', mode, flag: 'wx' });
  chmodSync(path, mode);
  return openSync(path, 'r');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('sealed 0.4.0 activation binding generator', () => {
  it('derives every G1/G2 field and commitment from one exact evidence envelope', () => {
    const descriptor = inputDescriptor(canonical(evidenceEnvelope()));
    try {
      const result = generateBindingFromDescriptor(descriptor);
      expect(result.pagesDeploymentApproved).toBe(true);
      expect(result).toMatchObject({
        g001DatabaseIdentity: G001_DATABASE_IDENTITY,
        g001SourceBaselineCommit: G001_BASELINE,
        g001BaselineAbiSha256: G001_BASELINE_ABI,
        g001FreezeReleaseNonce: G001_FREEZE_NONCE,
        g001FreezePublishReceiptDigest:
          GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
        g001PolicyReceiptDigest:
          g001PolicyObservation().policyReceiptDigest,
        g001PolicyObservationBootstrapReceiptDigest:
          genesis001PolicyObservationBootstrapReceiptDigest(
            g001PolicyObservationBootstrapReceipt(),
          ),
        g001PolicySourceCommit: PREPARATION_COMMIT,
        g001ReleaseVersion: '0.3.43',
        g001PlayerAccessEnabled: true,
        g001AdmissionStateMutationsEnabled: false,
        g001AccessRequestSubmissionsEnabled: false,
        g001CensusPrivacySafeReceiptProfile:
          'warpkeep-genesis-001-census-export-privacy-safe-v1',
        g001CensusPrivacySafeReceiptDigest:
          g001CensusReceipt(
            '20260828T120100Z',
            '8'.repeat(64),
          ).opaqueProofDigest,
        admissionMonitorSuspensionReceiptDigest:
          g001MonitorEvidence().receiptSha256,
        admissionMonitorCurrentStateReceiptDigest:
          genesis001AdmissionMonitorCurrentStateReceiptDigest(
            g001MonitorCurrentStateReceipt(),
          ),
        admissionMonitorDisabled: true,
        admissionMonitorLoaded: false,
        g002PublishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
        g002FreshStatusDigest: FRESH_STATUS_DIGEST,
        g002DatabaseIdentity: DATABASE_IDENTITY,
        g002ModuleSourceCommit: PREPARATION_COMMIT,
        g002ModuleSha256: MODULE_SHA256,
        g002ModuleTreeId: MODULE_TREE_ID,
        g002DependencyClosureDigest: DEPENDENCY_DIGEST,
        g002SpacetimeExecutableSha256: SPACETIME_DIGEST,
        g002SpacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
        g002AtlasImportReceiptDigest: IMPORT_RECEIPT_DIGEST,
        g002SealedLiveReceiptDigest: SEALED_LIVE_RECEIPT_DIGEST,
        g002AtlasSourceCommit: ATLAS_COMMIT,
        g002AtlasId: 'GENESIS_002_GREATER_REALM',
        g002PublicReleaseId: PUBLIC_RELEASE_ID,
        g002ReleaseSha256: RELEASE_SHA256,
        g002ReleaseHeaderSha256: RELEASE_HEADER_SHA256,
        g002VerificationDigest: VERIFICATION_DIGEST,
        g002AllowedFids: 0,
        g002AccessRequests: 0,
        g002PlayersV1: 0,
        g002PlayersV2: 0,
        g002OwnershipBindings: 0,
        g002Founders: 0,
        g002Castles: 0,
        g002RealmProfiles: 0,
        g002TermsAcceptances: 0,
        g002MarkAccounts: 0,
        g002ResourceAccounts: 0,
        g002Claims: 0,
        g002Occupancies: 0,
        g002ActivationRows: 0,
        g002WorkerSystemRows: 0,
        g002AtlasReady: true,
        g002AtlasFinalized: true,
        g002AtlasWritesClosedByFinalization: true,
        g002AtlasImportMutationsEnabled: true,
        g002AtlasActivationMutationsEnabled: false,
        g002PlayerAccessEnabled: false,
        g002AdmissionMutationsEnabled: false,
        g002PresentationEnabled: false,
        ptrPublishReceiptDigest: ptrPublishReceipt().publishReceiptDigest,
        ptrFreshStatusDigest: PTR_FRESH_STATUS_DIGEST,
        ptrAtlasImportReceiptDigest:
          ptrAtlasImportReceipt().importReceiptDigest,
        ptrSealedLiveReceiptDigest: ptrReceiptDigest(
          'warpkeep.ptr.sealed-live-receipt.v1',
          ptrSealedLiveReceipt(),
        ),
        ptrOwnerProvisionReceiptDigest:
          ptrOwnerProvisionReceipt().provisionReceiptDigest,
        ptrDatabaseIdentity: PTR_DATABASE_IDENTITY,
        ptrModuleSourceCommit: PREPARATION_COMMIT,
        ptrModuleSha256: PTR_MODULE_SHA256,
        ptrModuleTreeId: PTR_MODULE_TREE_ID,
        ptrDependencyClosureDigest: PTR_DEPENDENCY_DIGEST,
        ptrSpacetimeExecutableSha256: PTR_SPACETIME_DIGEST,
        ptrSpacetimeCliConfigSha256: PTR_CLI_CONFIG_DIGEST,
        ptrAtlasSourceCommit: PREPARATION_COMMIT,
        ptrAtlasId: 'PTR_GREATER_REALM',
        ptrPublicReleaseId: PTR_PUBLIC_RELEASE_ID,
        ptrReleaseVersion: '0.4.0-ptr.1',
        ptrReleaseManifestSha256: PTR_RELEASE_MANIFEST_SHA256,
        ptrExpectedReleaseSha256: PTR_EXPECTED_RELEASE_SHA256,
        ptrReleaseHeaderSha256: PTR_RELEASE_HEADER_SHA256,
        ptrVerificationDigest: PTR_VERIFICATION_DIGEST,
        ptrAllowedFids: 0,
        ptrAccessRequests: 0,
        ptrPlayersV1: 0,
        ptrPlayersV2: 0,
        ptrOwnershipBindings: 0,
        ptrCastles: 0,
        ptrRealmProfiles: 0,
        ptrTermsAcceptances: 0,
        ptrMarkAccounts: 0,
        ptrResourceAccounts: 0,
        ptrClaims: 0,
        ptrOccupancies: 0,
        ptrActivationRows: 0,
        ptrPublicAtlasRows: 0,
        ptrPublicRegionRows: 0,
        ptrWorkerSystemRows: 0,
        ptrAtlasReady: true,
        ptrAtlasFinalized: true,
        ptrAtlasWritesClosedByFinalization: true,
        ptrAtlasImportsExact: true,
        ptrAtlasImportMutationsCompiled: true,
        ptrAtlasActivationMutationsCompiled: false,
        ptrOwnerAnchorRows: 1,
        ptrOwnerProvisioned: true,
        ptrOwnerEnabled: true,
        ptrAdmissionsOpen: false,
        ptrAccessRequestsOpen: false,
        ptrAdmissionSurfacePresent: false,
        ptrAccessRequestSurfacePresent: false,
        ptrPresentationEnabled: true,
        legacyGreaterRealmClientPresentationEnabled: false,
        legacyGreaterRealmServerPresentationEnabled: false,
        admissionNotificationsEnabled: false,
      });
      expect(result).not.toHaveProperty('bindingCandidate');
      expect(result).not.toHaveProperty('g002PublishReceipt');
      expect(result).not.toHaveProperty('g002AtlasImportReceipt');
      expect(result).not.toHaveProperty('g002SealedLiveReceipt');
      expect(result).not.toHaveProperty('ptrPublishReceipt');
      expect(result).not.toHaveProperty('ptrAtlasImportReceipt');
      expect(result).not.toHaveProperty('ptrOwnerProvisionReceipt');
      expect(result).not.toHaveProperty('ptrSealedLiveReceipt');
      expect(result).not.toHaveProperty('ownerOpaqueProofDigest');
      expect(result).not.toHaveProperty('operationChainDigest');
      for (const [key, value] of Object.entries(result)) {
        if (key.endsWith('Commitment')) expect(value).toMatch(/^[0-9a-f]{64}$/u);
      }
      expect(canonical(result)).toBe(`${JSON.stringify(result, null, 2)}\n`);
      const canonicalOutput = canonical(result);
      for (const privateValue of [
        '89'.repeat(32),
        'warpkeep-access-request-census-20260828T120100Z.txt',
        '8'.repeat(64),
        PTR_OWNER_OPAQUE_PROOF_DIGEST,
      ]) expect(canonicalOutput).not.toContain(privateValue);
    } finally {
      closeSync(descriptor);
    }
  });

  it('rejects noncanonical, extra-field, or non-private evidence files', () => {
    for (const [contents, mode] of [
      [JSON.stringify(evidenceEnvelope()), 0o600],
      [canonical({ ...evidenceEnvelope(), applicantNames: ['private'] }), 0o600],
      [canonical(evidenceEnvelope()), 0o644],
    ] as const) {
      const descriptor = inputDescriptor(contents, mode);
      try {
        expect(() => generateBindingFromDescriptor(descriptor)).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });

  it('rejects PTR import receipts outside the operator numeric bounds', () => {
    for (const patch of [
      { importEpoch: (1n << 64n).toString() },
      { operationsSubmitted: 4_097 },
    ]) {
      const evidence = evidenceEnvelope();
      const {
        importReceiptDigest: _discardedDigest,
        ...receiptWithoutDigest
      } = evidence.ptrAtlasImportReceipt;
      const receipt = { ...receiptWithoutDigest, ...patch };
      evidence.ptrAtlasImportReceipt = {
        ...receipt,
        importReceiptDigest: ptrReceiptDigest(
          'warpkeep.ptr.production-import-receipt.v1',
          receipt,
        ),
      };
      expect(
        () => createBindingFromEvidence(evidence),
        JSON.stringify(patch),
      ).toThrow('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    }
  });

  it('rejects invalid UTF-8, oversized, hard-linked, or non-regular input', () => {
    const invalidUtf8 = inputDescriptor(new Uint8Array([0xc3, 0x28]));
    const oversized = inputDescriptor(new Uint8Array((32 * 1_024) + 1));
    const hardLinkDirectory = mkdtempSync(join(
      tmpdir(),
      'warpkeep-sealed-activation-hardlink-',
    ));
    temporaryDirectories.push(hardLinkDirectory);
    const hardLinkSource = join(hardLinkDirectory, 'candidate.json');
    const hardLinkAlias = join(hardLinkDirectory, 'candidate-alias.json');
    writeFileSync(hardLinkSource, canonical(evidenceEnvelope()), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    linkSync(hardLinkSource, hardLinkAlias);
    const hardLinked = openSync(hardLinkSource, 'r');
    const nonRegular = openSync('/dev/null', 'r');
    try {
      for (const descriptor of [
        invalidUtf8,
        oversized,
        hardLinked,
        nonRegular,
      ]) {
        expect(
          () => generateBindingFromDescriptor(descriptor),
        ).toThrow();
      }
    } finally {
      for (const descriptor of [
        invalidUtf8,
        oversized,
        hardLinked,
        nonRegular,
      ]) closeSync(descriptor);
    }
  });

  it('rejects prefilled G1/G2 values and inconsistent individually valid receipts', () => {
    const baseline = createBindingFromEvidence(
      evidenceEnvelope(),
    );
    const bindingKeys = Object.keys(bindingCandidate());
    const derivedKeys = [
      ...bindingKeys.slice(
        bindingKeys.indexOf('g001DatabaseIdentity'),
        bindingKeys.indexOf('authBridgeSourceCommit'),
      ),
      ...bindingKeys.slice(bindingKeys.indexOf('g002PublishReceiptDigest')),
    ];
    for (const key of derivedKeys) {
      const prefilled = evidenceEnvelope();
      prefilled.bindingCandidate[key] = baseline[key];
      expect(
        () => createBindingFromEvidence(prefilled),
        key,
      ).toThrow();
    }

    const inconsistent = evidenceEnvelope();
    inconsistent.g002AtlasImportReceipt = {
      ...inconsistent.g002AtlasImportReceipt,
      moduleSha256: '9'.repeat(64),
      importReceiptDigest: undefined as unknown as string,
    };
    inconsistent.g002AtlasImportReceipt.importReceiptDigest =
      genesis002ProductionImportReceiptDigest(Object.fromEntries(
        Object.entries(inconsistent.g002AtlasImportReceipt).slice(0, -1),
      ));

    const inconsistentLive = evidenceEnvelope();
    inconsistentLive.g002SealedLiveReceipt = {
      ...inconsistentLive.g002SealedLiveReceipt,
      databaseIdentity: '9'.repeat(64),
    };
    inconsistentLive.g002SealedLiveReceiptDigest =
      genesis002SealedLiveReceiptDigest(inconsistentLive.g002SealedLiveReceipt);

    for (const value of [inconsistent, inconsistentLive]) {
      const descriptor = inputDescriptor(canonical(value));
      try {
        expect(() => generateBindingFromDescriptor(descriptor)).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });

  it('rejects forged, colliding, populated, or privacy-unsafe PTR receipts', () => {
    const redigestPublish = (
      receipt: ReturnType<typeof ptrPublishReceipt>,
    ) => {
      const body = Object.fromEntries(Object.entries(receipt).slice(0, -1));
      receipt.publishReceiptDigest = ptrReceiptDigest(
        'warpkeep.ptr.production-publish-receipt.v1',
        body,
      );
    };
    const redigestImport = (
      receipt: ReturnType<typeof ptrAtlasImportReceipt>,
    ) => {
      const body = Object.fromEntries(Object.entries(receipt).slice(0, -1));
      receipt.importReceiptDigest = ptrReceiptDigest(
        'warpkeep.ptr.production-import-receipt.v1',
        body,
      );
    };
    const redigestOwner = (
      receipt: ReturnType<typeof ptrOwnerProvisionReceipt>,
    ) => {
      const body = Object.fromEntries(Object.entries(receipt).slice(0, -1));
      receipt.provisionReceiptDigest = ptrReceiptDigest(
        'warpkeep.ptr.owner-provision-receipt.v1',
        body,
      );
    };
    const redigestLive = (envelope: ReturnType<typeof evidenceEnvelope>) => {
      envelope.ptrSealedLiveReceiptDigest = ptrReceiptDigest(
        'warpkeep.ptr.sealed-live-receipt.v1',
        envelope.ptrSealedLiveReceipt,
      );
    };

    const collision = evidenceEnvelope();
    collision.ptrPublishReceipt.databaseIdentity = DATABASE_IDENTITY;
    collision.ptrAtlasImportReceipt.databaseIdentity = DATABASE_IDENTITY;
    collision.ptrOwnerProvisionReceipt.databaseIdentity = DATABASE_IDENTITY;
    collision.ptrSealedLiveReceipt.databaseIdentity = DATABASE_IDENTITY;
    redigestPublish(collision.ptrPublishReceipt);
    redigestImport(collision.ptrAtlasImportReceipt);
    redigestOwner(collision.ptrOwnerProvisionReceipt);
    redigestLive(collision);

    const populated = evidenceEnvelope();
    populated.ptrSealedLiveReceipt.playersV2 = 1;
    redigestLive(populated);

    const disabledOwner = evidenceEnvelope();
    disabledOwner.ptrOwnerProvisionReceipt.ownerEnabled = false;
    disabledOwner.ptrSealedLiveReceipt.ownerEnabled = false;
    redigestOwner(disabledOwner.ptrOwnerProvisionReceipt);
    redigestLive(disabledOwner);

    const forgedOwnerLink = evidenceEnvelope();
    forgedOwnerLink.ptrOwnerProvisionReceipt.ownerOpaqueProofDigest =
      'abcdef0123456789'.repeat(4);
    redigestOwner(forgedOwnerLink.ptrOwnerProvisionReceipt);

    const openedAdmissionSurface = evidenceEnvelope();
    openedAdmissionSurface.ptrPublishReceipt.admissionSurfacePresent = true;
    openedAdmissionSurface.ptrSealedLiveReceipt.admissionSurfacePresent = true;
    redigestPublish(openedAdmissionSurface.ptrPublishReceipt);
    redigestLive(openedAdmissionSurface);

    const privacyUnsafe = evidenceEnvelope();
    Object.assign(privacyUnsafe.ptrOwnerProvisionReceipt, {
      ownerFid: '4242',
    });

    for (const value of [
      collision,
      populated,
      disabledOwner,
      forgedOwnerLink,
      openedAdmissionSurface,
      privacyUnsafe,
    ]) {
      expect(() => createBindingFromEvidence(value)).toThrow();
    }
  });

  it('forbids test-only preparation authority outside the test environment', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => createSealedLaunchActivationBindingFromEvidence(
        evidenceEnvelope(),
        TEST_PREPARATION_BOOTSTRAP_AUTHORITY,
      )).toThrow(/TEST_AUTHORITY_FORBIDDEN/u);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('rejects missing, reordered, extra, swapped, or stale receipt evidence', () => {
    const reorderedEnvelope = Object.fromEntries(
      Object.entries(evidenceEnvelope()).reverse(),
    ) as ReturnType<typeof evidenceEnvelope>;
    const missingEnvelope = evidenceEnvelope() as Partial<
      ReturnType<typeof evidenceEnvelope>
    >;
    delete missingEnvelope.profile;
    const missing = evidenceEnvelope();
    delete (missing.g002PublishReceipt as Partial<ReturnType<typeof publishReceipt>>)
      .moduleTreeId;
    const reordered = evidenceEnvelope();
    reordered.g002SealedLiveReceipt = Object.fromEntries(
      Object.entries(reordered.g002SealedLiveReceipt).reverse(),
    ) as ReturnType<typeof sealedLiveReceipt>;
    const extra = evidenceEnvelope();
    Object.assign(extra.g002AtlasImportReceipt, { applicantCount: 0 });
    const swapped = evidenceEnvelope();
    [swapped.g002PublishReceipt, swapped.g002AtlasImportReceipt] = [
      swapped.g002AtlasImportReceipt as unknown as ReturnType<typeof publishReceipt>,
      swapped.g002PublishReceipt as unknown as ReturnType<typeof atlasImportReceipt>,
    ];
    const stale = evidenceEnvelope();
    stale.g002SealedLiveReceiptDigest = '9'.repeat(64);
    const stalePublish = evidenceEnvelope();
    stalePublish.g002PublishReceipt.publishReceiptDigest = '9'.repeat(64);
    const staleImport = evidenceEnvelope();
    staleImport.g002AtlasImportReceipt.importReceiptDigest = '9'.repeat(64);
    const nakedPolicyObservation = evidenceEnvelope();
    nakedPolicyObservation.g001PolicyObservationBootstrapReceipt =
      g001PolicyObservation() as unknown as ReturnType<
        typeof g001PolicyObservationBootstrapReceipt
      >;
    const forgedPolicyObservationLink = evidenceEnvelope();
    forgedPolicyObservationLink.g001PolicyObservationBootstrapReceipt
      .policyObservationReceiptLinkSha256 = '9'.repeat(64);
    const missingMonitorCurrentState = evidenceEnvelope() as Partial<
      ReturnType<typeof evidenceEnvelope>
    >;
    delete missingMonitorCurrentState.g001AdmissionMonitorCurrentStateReceipt;
    const arbitraryTree = evidenceEnvelope();
    arbitraryTree.g001PolicyObservationBootstrapReceipt =
      relinkG001PolicyObservationBootstrapReceipt({
        ...arbitraryTree.g001PolicyObservationBootstrapReceipt,
        moduleTreeId: '7'.repeat(40),
      });
    const arbitraryBlob = evidenceEnvelope();
    arbitraryBlob.g001PolicyObservationBootstrapReceipt =
      relinkG001PolicyObservationBootstrapReceipt({
        ...arbitraryBlob.g001PolicyObservationBootstrapReceipt,
        bootstrapBlob: '8'.repeat(40),
      });
    const arbitraryBootstrapSha = evidenceEnvelope();
    arbitraryBootstrapSha.g001PolicyObservationBootstrapReceipt =
      relinkG001PolicyObservationBootstrapReceipt({
        ...arbitraryBootstrapSha.g001PolicyObservationBootstrapReceipt,
        bootstrapSha256: '9'.repeat(64),
      });

    for (const value of [
      reorderedEnvelope,
      missingEnvelope,
      missing,
      reordered,
      extra,
      swapped,
      stale,
      stalePublish,
      staleImport,
      nakedPolicyObservation,
      forgedPolicyObservationLink,
      missingMonitorCurrentState,
      arbitraryTree,
      arbitraryBlob,
      arbitraryBootstrapSha,
    ]) {
      const descriptor = inputDescriptor(canonical(value));
      try {
        expect(() => generateBindingFromDescriptor(descriptor)).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });
});
