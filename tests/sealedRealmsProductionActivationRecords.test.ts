// @vitest-environment node

import {
  createHash,
} from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setImmediate } from 'node:timers';
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
    }) => actual.deriveGenesis001SealedLaunchEvidenceForTesting(
      value,
      {
        freezePublishSourceCommit: value.freezePublishReceipt.receipt.protectedMainCommit,
        freezePublishReceiptBasename: value.freezePublishReceipt.receiptBasename,
        freezePublishReceiptDigest: value.freezePublishReceipt.receiptSha256,
      },
      new Date('2026-08-28T12:02:00.000Z'),
    ),
  };
});

import {
  GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN,
} from '../scripts/genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
  deriveGenesis001RecoveryLaunchEvidence,
  genesis001AdmissionMonitorCurrentStateReceiptDigest,
  genesis001FreezePublishReceiptDigest,
  genesis001MonitorSuspensionReceiptDigest,
  genesis001PolicyReceiptDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';
import {
  ptrOwnerProvisionReceiptDigest,
  ptrProductionAtlasImportReceiptDigest,
  ptrProductionPublishReceiptDigest,
  ptrSealedLiveReceiptDigest,
} from '../scripts/generate-0.4.0-sealed-launch-activation.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from '../scripts/genesis002-activation-receipts.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  createSealedRealmsProductionActivationRecords,
  writeSealedRealmsProductionActivationDescriptor,
  writeSealedRealmsProductionRecoveryActivationDescriptor,
} from '../scripts/sealed-realms-production-activation-records.mjs';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import * as activationRecordsModule from '../scripts/sealed-realms-production-activation-records.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const temporaryHomes: string[] = [];
const FIXED_DESCRIPTOR_RELATIVE_PATH =
  'activation-evidence/0.4.0-sealed-launch-envelope.json';
const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const G001_MAXIMUM_ROWS = 4_096;
const FIXTURE_SOURCE_COMMIT = 'a'.repeat(40);
const FIXTURE_G001_FREEZE_SOURCE_COMMIT =
  'd945256b217fa13ade944b9ed9880e8463b46123';
const FIXTURE_G001_BASELINE = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const FIXTURE_G001_BASELINE_ABI =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
const FIXTURE_G001_FREEZE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
const FIXTURE_G002_DATABASE = 'd'.repeat(64);
const FIXTURE_G002_MODULE_SHA = 'b'.repeat(64);
const FIXTURE_G002_TREE = 'c'.repeat(40);
const FIXTURE_G002_DEPENDENCY = 'e'.repeat(64);
const FIXTURE_G002_SPACETIME = 'f'.repeat(64);
const FIXTURE_G002_CLI = '0'.repeat(64);
const FIXTURE_G002_FRESH_STATUS = '1'.repeat(64);
const FIXTURE_G002_RELEASE = `GRR-${'A'.repeat(26)}`;
const FIXTURE_PTR_DATABASE = '9'.repeat(64);
const FIXTURE_PTR_MODULE_SHA = 'a'.repeat(64);
const FIXTURE_PTR_TREE = 'b'.repeat(40);
const FIXTURE_PTR_DEPENDENCY = 'c'.repeat(64);
const FIXTURE_PTR_SPACETIME = 'd'.repeat(64);
const FIXTURE_PTR_CLI = 'e'.repeat(64);
const FIXTURE_PTR_FRESH_STATUS = 'f'.repeat(64);
const FIXTURE_PTR_RELEASE = `GRR-${'B'.repeat(26)}`;
const ACTIVATION_RECORD_NAMES = Object.freeze({
  g001FreezePublishReceipt: 'g001-freeze-publish-receipt.json',
  g001PolicyObservationBootstrapReceipt: 'g001-policy-observation-bootstrap-receipt.json',
  g001CensusPrivacySafePrivateReceipt: 'g001-census-privacy-safe-private-receipt.json',
  g001AdmittedPlayerCensusPrivateReceipt: 'g001-admitted-player-census-private-receipt.json',
  g001AdmissionMonitorSuspensionReceipt: 'g001-admission-monitor-suspension-receipt.json',
  g001AdmissionMonitorCurrentStateReceipt: 'g001-admission-monitor-current-state-receipt.json',
  g002PublishReceipt: 'g002-publish-receipt.json',
  g002AtlasImportReceipt: 'g002-atlas-import-receipt.json',
  g002SealedLiveReceipt: 'g002-sealed-live-receipt.json',
  ptrPublishReceipt: 'ptr-publish-receipt.json',
  ptrAtlasImportReceipt: 'ptr-atlas-import-receipt.json',
  ptrOwnerProvisionReceipt: 'ptr-owner-provision-receipt.json',
  ptrSealedLiveReceipt: 'ptr-sealed-live-receipt.json',
});
const ACTIVATION_RECORD_OPERATIONS = Object.freeze({
  g001FreezePublishReceipt: 'g001-policy-observe',
  g001PolicyObservationBootstrapReceipt: 'g001-policy-observe',
  g001CensusPrivacySafePrivateReceipt: 'g001-census-second-inspect',
  g001AdmittedPlayerCensusPrivateReceipt: 'g001-census-second-suspend',
  g001AdmissionMonitorSuspensionReceipt: 'g001-census-second-suspend',
  g001AdmissionMonitorCurrentStateReceipt: 'g001-current-state',
  g002PublishReceipt: 'g002-publish-apply',
  g002AtlasImportReceipt: 'g002-import-apply',
  g002SealedLiveReceipt: 'g002-live-inspect',
  ptrPublishReceipt: 'ptr-publish-apply',
  ptrAtlasImportReceipt: 'ptr-import-apply',
  ptrOwnerProvisionReceipt: 'ptr-owner-provision',
  ptrSealedLiveReceipt: 'ptr-live-inspect',
});

function fullSortedCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fullSortedCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, fullSortedCanonical(item)]));
  }
  return value;
}

function fullDescriptorDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(fullSortedCanonical(value)))
    .digest('hex');
}

function fullPtrDigest(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(value)}\n`)
    .digest('hex');
}

function fullG001Policy() {
  return {
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: FIXTURE_G001_BASELINE,
    freezeReleaseNonce: FIXTURE_G001_FREEZE_NONCE,
  };
}

function fullG001BuildProvenance() {
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

function fullG001FreezeReceipt() {
  const livePolicyReceipt = fullG001Policy();
  const buildProvenance = fullG001BuildProvenance();
  return {
    schemaVersion: 2,
    profile: 'warpkeep-genesis-001-freeze-publish-final-receipt-v2',
    outcome: 'published',
    target: {
      uri: 'https://maincloud.spacetimedb.com',
      database: G001_DATABASE_IDENTITY,
    },
    protectedMainCommit: FIXTURE_G001_FREEZE_SOURCE_COMMIT,
    sourceBaselineCommit: FIXTURE_G001_BASELINE,
    baselineAbiSha256: FIXTURE_G001_BASELINE_ABI,
    freezeReleaseNonce: FIXTURE_G001_FREEZE_NONCE,
    artifactSha256: '3'.repeat(64),
    candidateDescriptorSha256: '4'.repeat(64),
    postflightDescriptorSha256: '4'.repeat(64),
    buildProvenance,
    buildProvenanceSha256: fullDescriptorDigest(buildProvenance),
    livePolicyReceipt,
    livePolicyReceiptSha256: genesis001PolicyReceiptDigest(livePolicyReceipt),
  };
}

function fullG001PolicyObservation() {
  const policy = fullG001Policy();
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-live-policy-observation-v1',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    observedAt: '2026-08-28T12:00:00.000Z',
    databaseIdentity: G001_DATABASE_IDENTITY,
    procedure: 'genesis_001_access_policy_v1',
    mutationSubmitted: false,
    policy,
    policyReceiptDigest: genesis001PolicyReceiptDigest(policy),
  };
}

function fullLengthFramed(hash: ReturnType<typeof createHash>, label: string, value: string) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.length));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.length));
  hash.update(length).update(valueBytes);
}

function fullG001PolicyBootstrapReceipt() {
  const receipt = {
    profile: 'warpkeep-greater-realm-production-bootstrap-v1',
    protectedCommit: FIXTURE_SOURCE_COMMIT,
    moduleTreeId: '1'.repeat(40),
    bootstrapBlob: '2'.repeat(40),
    bootstrapSha256:
      'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a',
    moduleArchiveCount: 16,
    command: 'g001-policy-observe',
    launchCleanup: {
      outcome: 'cleaned',
      runId: `run-${'4'.repeat(32)}`,
      cleanupConfirmationSha256: '5'.repeat(64),
      treeInventorySha256: '6'.repeat(64),
    },
    policyObservationReceipt: fullG001PolicyObservation(),
    policyObservationReceiptLinkSha256: '',
  };
  const hash = createHash('sha256');
  fullLengthFramed(hash, 'domain', 'warpkeep-production-g001-policy-observation-bootstrap-link-v1');
  fullLengthFramed(hash, 'protectedCommit', receipt.protectedCommit);
  fullLengthFramed(hash, 'moduleTreeId', receipt.moduleTreeId);
  fullLengthFramed(hash, 'bootstrapBlob', receipt.bootstrapBlob);
  fullLengthFramed(hash, 'bootstrapSha256', receipt.bootstrapSha256);
  fullLengthFramed(hash, 'command', receipt.command);
  fullLengthFramed(hash, 'launchCleanup', `${JSON.stringify(fullSortedCanonical(receipt.launchCleanup))}\n`);
  fullLengthFramed(hash, 'policyObservationReceipt', `${JSON.stringify(receipt.policyObservationReceipt)}\n`);
  receipt.policyObservationReceiptLinkSha256 = hash.digest('hex');
  return receipt;
}

function fullG001CensusReceipt(stamp = '20260828T120000Z', nonceHex = '7'.repeat(64)) {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: '89'.repeat(32),
      size: 128,
    },
    privateBlindingNonceHex: nonceHex,
  };
  return { ...receipt, opaqueProofDigest: genesis001CensusOpaqueProofDigest(receipt) };
}

function fullG001AdmittedPlayerReceipt(observedAt: string, nonceHex: string) {
  const entries = [{ fid: '4242', authEpoch: '7' }];
  const normalizedSetDigest = createHash('sha256')
    .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN)
    .update(`${JSON.stringify(entries[0])}\n`)
    .digest('hex');
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    databaseIdentity: G001_DATABASE_IDENTITY,
    preparationSourceCommit: FIXTURE_SOURCE_COMMIT,
    observedAt,
    collectionMethod: 'preferred-exact-query',
    beforeAggregate: { allowedFids: '1', enabledAllowedFids: '1' },
    afterAggregate: { allowedFids: '1', enabledAllowedFids: '1' },
    admittedPlayerCount: '1',
    entries,
    normalizedSetDigest,
    rawEvidenceDigest: createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)
      .update(`fixture-${observedAt}`)
      .digest('hex'),
    nonceHex,
  };
  return {
    ...proof,
    opaqueProofDigest: createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN)
      .update(`${JSON.stringify(proof)}\n`)
      .digest('hex'),
  };
}

function fullG001CensusActivationReceipt() {
  const applicant = {
    first: fullG001CensusReceipt(),
    second: fullG001CensusReceipt('20260828T120100Z', '8'.repeat(64)),
  };
  const admitted = {
    first: fullG001AdmittedPlayerReceipt('2026-08-28T12:00:00.000Z', '1'.repeat(64)),
    second: fullG001AdmittedPlayerReceipt('2026-08-28T12:01:00.000Z', '2'.repeat(64)),
  };
  const recordDigest = (record: object) => sha256(`${JSON.stringify(record)}\n`);
  const joint = (applicantReceipt: typeof applicant.first, admittedReceipt: typeof admitted.first) => {
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-g001-census-private-v1',
      sourceCommit: FIXTURE_SOURCE_COMMIT,
      applicant: applicantReceipt,
      admitted: admittedReceipt,
      observedAt: admittedReceipt.observedAt,
    };
    return { recordDigest: recordDigest(record), record };
  };
  const first = joint(applicant.first, admitted.first);
  const second = joint(applicant.second, admitted.second);
  const expiresAt = '2026-08-28T12:06:00.000Z';
  const confirmationDigest = sha256([
    'warpkeep.sealed-realms.g001-census-confirmation.v1', FIXTURE_SOURCE_COMMIT,
    first.recordDigest, second.recordDigest, expiresAt,
  ].join('\n'));
  const confirmation = {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-private-v1',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    firstDigest: first.recordDigest,
    secondDigest: second.recordDigest,
    secondObservedAt: second.record.observedAt,
    expiresAt,
    confirmationDigest,
  };
  const consumed = {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-private-v1',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    firstDigest: first.recordDigest,
    secondDigest: second.recordDigest,
    confirmationDigest,
    consumedAt: second.record.observedAt,
  };
  return {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-activation-private-v1',
    first,
    second,
    confirmation: { recordDigest: recordDigest(confirmation), record: confirmation },
    consumed: { recordDigest: recordDigest(consumed), record: consumed },
  };
}

function fullG001MonitorSuspensionReceipt() {
  const receipt = {
    disabled: true,
    label: 'com.warpkeep.hermes-admission-monitor',
    loaded: false,
    monitorPlistSha256: 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256: '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    profile: 'warpkeep-genesis001-admission-monitor-suspension-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
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

function fullG001MonitorCurrentStateReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis001-admission-monitor-current-state-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    observedAt: '2026-08-28T12:01:30.000Z',
    label: 'com.warpkeep.hermes-admission-monitor',
    disabled: true,
    loaded: false,
    monitorPlistSha256: 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256: '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
  };
}

function fullG002PublishReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-production-publish-v1',
    databaseIdentity: FIXTURE_G002_DATABASE,
    database: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_G002_MODULE_SHA,
    moduleTreeId: FIXTURE_G002_TREE,
    dependencyClosureDigest: FIXTURE_G002_DEPENDENCY,
    spacetimeExecutableSha256: FIXTURE_G002_SPACETIME,
    spacetimeCliConfigSha256: FIXTURE_G002_CLI,
    deleteData: 'never',
    outcome: 'verified',
    freshStatusDigest: FIXTURE_G002_FRESH_STATUS,
    playerAccessEnabled: false,
    admissionMutationsEnabled: false,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
  };
  return { ...receipt, publishReceiptDigest: genesis002PublishReceiptDigest(receipt) };
}

function fullG002ImportReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep.genesis-002.production-import.v1',
    outcome: 'ready',
    databaseIdentity: FIXTURE_G002_DATABASE,
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_G002_MODULE_SHA,
    moduleTreeId: FIXTURE_G002_TREE,
    dependencyClosureDigest: FIXTURE_G002_DEPENDENCY,
    spacetimeExecutableSha256: FIXTURE_G002_SPACETIME,
    atlasId: 'GENESIS_002_GREATER_REALM',
    atlasSourceCommit: FIXTURE_SOURCE_COMMIT,
    publicReleaseId: FIXTURE_G002_RELEASE,
    expectedReleaseSha256: '5'.repeat(64),
    verificationDigest: '7'.repeat(64),
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: '8'.repeat(64),
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasWritesClosedByFinalization: true,
  };
  return { ...receipt, importReceiptDigest: genesis002ProductionImportReceiptDigest(receipt) };
}

function fullG002SealedLiveReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: FIXTURE_G002_DATABASE,
    databaseAlias: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_G002_MODULE_SHA,
    releaseVersion: '0.4.0',
    realmId: 'GENESIS_002',
    atlasSourceCommit: FIXTURE_SOURCE_COMMIT,
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: FIXTURE_G002_RELEASE,
    releaseSha256: '5'.repeat(64),
    releaseHeaderSha256: '6'.repeat(64),
    verificationDigest: '7'.repeat(64),
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

function fullPtrPublishReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-production-publish-v1',
    databaseIdentity: FIXTURE_PTR_DATABASE,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_PTR_MODULE_SHA,
    moduleTreeId: FIXTURE_PTR_TREE,
    dependencyClosureDigest: FIXTURE_PTR_DEPENDENCY,
    spacetimeExecutableSha256: FIXTURE_PTR_SPACETIME,
    spacetimeCliConfigSha256: FIXTURE_PTR_CLI,
    deleteData: 'never',
    outcome: 'verified',
    freshDatabase: true,
    freshStatusDigest: FIXTURE_PTR_FRESH_STATUS,
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
  };
  return { ...receipt, publishReceiptDigest: ptrProductionPublishReceiptDigest(receipt) };
}

function fullPtrImportReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep.ptr.production-import.v1',
    outcome: 'ready',
    databaseIdentity: FIXTURE_PTR_DATABASE,
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_PTR_MODULE_SHA,
    moduleTreeId: FIXTURE_PTR_TREE,
    dependencyClosureDigest: FIXTURE_PTR_DEPENDENCY,
    spacetimeExecutableSha256: FIXTURE_PTR_SPACETIME,
    atlasId: 'PTR_GREATER_REALM',
    atlasSourceCommit: FIXTURE_SOURCE_COMMIT,
    publicReleaseId: FIXTURE_PTR_RELEASE,
    releaseManifestSha256: '1'.repeat(64),
    expectedReleaseSha256: '2'.repeat(64),
    releaseHeaderSha256: '3'.repeat(64),
    verificationDigest: '4'.repeat(64),
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
  return { ...receipt, importReceiptDigest: ptrProductionAtlasImportReceiptDigest(receipt) };
}

function fullPtrOwnerProvisionReceipt(importReceipt = fullPtrImportReceipt()) {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-owner-provision-v1',
    outcome: 'verified',
    databaseIdentity: FIXTURE_PTR_DATABASE,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: FIXTURE_SOURCE_COMMIT,
    atlasImportReceiptDigest: importReceipt.importReceiptDigest,
    ownerOpaqueProofDigest: '0123456789abcdef'.repeat(4),
    ownerAnchorRows: 1,
    ownerProvisioned: true,
    ownerEnabled: true,
    zeroPopulationBoundary: true,
  };
  return { ...receipt, provisionReceiptDigest: ptrOwnerProvisionReceiptDigest(receipt) };
}

function fullPtrSealedLiveReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: FIXTURE_PTR_DATABASE,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: FIXTURE_SOURCE_COMMIT,
    moduleSha256: FIXTURE_PTR_MODULE_SHA,
    releaseVersion: '0.4.0-ptr.1',
    realmId: 'PTR',
    atlasSourceCommit: FIXTURE_SOURCE_COMMIT,
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: FIXTURE_PTR_RELEASE,
    releaseManifestSha256: '1'.repeat(64),
    expectedReleaseSha256: '2'.repeat(64),
    releaseHeaderSha256: '3'.repeat(64),
    verificationDigest: '4'.repeat(64),
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
    ownerOpaqueProofDigest: '0123456789abcdef'.repeat(4),
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

type ActivationRecordMember = keyof typeof ACTIVATION_RECORD_NAMES;

function fullBindingCandidate() {
  const candidate = JSON.parse(readFileSync(resolve(
    import.meta.dirname,
    '..',
    'config',
    'releases',
    '0.4.0-sealed-launch.json',
  ), 'utf8')) as Record<string, unknown>;
  candidate.preparationSourceCommit = FIXTURE_SOURCE_COMMIT;
  return candidate;
}

function fullRecordAuthority() {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: 'g002-publish-apply',
    workflowInputSha: FIXTURE_SOURCE_COMMIT,
    readGit: args => args[0] === 'rev-parse'
      ? `${FIXTURE_SOURCE_COMMIT}\n`
      : (() => { throw new Error('unexpected git request'); })(),
    readBinding: () => {
      const candidate = fullBindingCandidate();
      return {
        schemaVersion: candidate.schemaVersion,
        profile: candidate.profile,
        pagesDeploymentApproved: candidate.pagesDeploymentApproved,
        preparationSourceCommit: candidate.preparationSourceCommit,
      };
    },
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function fullCorpus() {
  const ptrAtlasImportReceipt = fullPtrImportReceipt();
  return {
    g001FreezePublishReceipt: {
      receiptBasename: 'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json',
      receiptSha256: genesis001FreezePublishReceiptDigest(fullG001FreezeReceipt()),
      receipt: fullG001FreezeReceipt(),
    },
    g001PolicyObservationBootstrapReceipt: fullG001PolicyBootstrapReceipt(),
    g001CensusPrivacySafePrivateReceipt: {
      first: fullG001CensusReceipt(),
      second: fullG001CensusReceipt('20260828T120100Z', '8'.repeat(64)),
    },
    g001AdmittedPlayerCensusPrivateReceipt: fullG001CensusActivationReceipt(),
    g001AdmissionMonitorSuspensionReceipt: fullG001MonitorSuspensionReceipt(),
    g001AdmissionMonitorCurrentStateReceipt: fullG001MonitorCurrentStateReceipt(),
    g002PublishReceipt: fullG002PublishReceipt(),
    g002AtlasImportReceipt: fullG002ImportReceipt(),
    g002SealedLiveReceipt: fullG002SealedLiveReceipt(),
    ptrPublishReceipt: fullPtrPublishReceipt(),
    ptrAtlasImportReceipt,
    ptrOwnerProvisionReceipt: fullPtrOwnerProvisionReceipt(ptrAtlasImportReceipt),
    ptrSealedLiveReceipt: fullPtrSealedLiveReceipt(),
  } satisfies Record<ActivationRecordMember, object>;
}

function activationRecordSemanticDigest(
  member: ActivationRecordMember,
  bodyDigest: string,
  operation: string = ACTIVATION_RECORD_OPERATIONS[member],
) {
  const hash = createHash('sha256');
  for (const value of [
    'warpkeep.sealed-realms.activation-record.v1',
    member,
    FIXTURE_SOURCE_COMMIT,
    FIXTURE_SOURCE_COMMIT,
    operation,
    'b'.repeat(64),
    bodyDigest,
  ]) hash.update(value).update('\n');
  return hash.digest('hex');
}

function writeActivationRecord(
  state: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  member: ActivationRecordMember,
  receipt: object,
  operation: string = ACTIVATION_RECORD_OPERATIONS[member],
) {
  const body = Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8');
  const bodyDigest = createHash('sha256').update(body).digest('hex');
  const record = {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-activation-record-v1',
    member,
    preparationSourceCommit: FIXTURE_SOURCE_COMMIT,
    sourceCommit: FIXTURE_SOURCE_COMMIT,
    operation,
    sourceAuthorityDigest: 'b'.repeat(64),
    bodyDigest,
    receipt,
    semanticDigest: activationRecordSemanticDigest(member, bodyDigest, operation),
  };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  try {
    state.write({
      root: 'runtime',
      relativePath: `activation-evidence/records/${ACTIVATION_RECORD_NAMES[member]}`,
      bytes,
    });
  } finally {
    body.fill(0);
    bytes.fill(0);
  }
}

function fullCorpusFixture() {
  const state = privateStateFixture();
  const records = createSealedRealmsProductionActivationRecords({
    privateState: state,
    authority: fullRecordAuthority(),
    readBindingCandidate: fullBindingCandidate,
  });
  const receipts = fullCorpus();
  for (const member of Object.keys(receipts) as ActivationRecordMember[]) {
    writeActivationRecord(state, member, receipts[member]);
  }
  return { state, records, receipts };
}

function replaceActivationRecord(
  state: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  member: ActivationRecordMember,
  receipt: object,
) {
  state.remove({
    root: 'runtime',
    relativePath: `activation-evidence/records/${ACTIVATION_RECORD_NAMES[member]}`,
  });
  writeActivationRecord(state, member, receipt);
}

function sha256(...parts: readonly string[]) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function maxCensusEntries() {
  return Array.from({ length: G001_MAXIMUM_ROWS }, (_unused, index) => ({
    fid: (9_000_000_000_000_000n + BigInt(index)).toString(),
    authEpoch: '4294967295',
  }));
}

function maxAdmittedPlayerReceipt(
  sourceCommit: string,
  observedAt: string,
  nonceHex: string,
) {
  const entries = maxCensusEntries();
  const normalizedSetDigest = sha256(
    GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN,
    `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
  );
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    databaseIdentity: G001_DATABASE_IDENTITY,
    preparationSourceCommit: sourceCommit,
    observedAt,
    collectionMethod: 'preferred-exact-query',
    beforeAggregate: { allowedFids: String(G001_MAXIMUM_ROWS), enabledAllowedFids: String(G001_MAXIMUM_ROWS) },
    afterAggregate: { allowedFids: String(G001_MAXIMUM_ROWS), enabledAllowedFids: String(G001_MAXIMUM_ROWS) },
    admittedPlayerCount: String(G001_MAXIMUM_ROWS),
    entries,
    normalizedSetDigest,
    rawEvidenceDigest: sha256(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN,
      `maximum-${observedAt}`,
    ),
    nonceHex,
  };
  return {
    ...proof,
    opaqueProofDigest: sha256(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN,
      `${JSON.stringify(proof)}\n`,
    ),
  };
}

function maximumCensusPrivacyReceipt(sourceCommit: string, stamp: string, nonceHex: string) {
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit,
    privateCensusReference: {
      count: G001_MAXIMUM_ROWS,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: '89'.repeat(32),
      size: 1_048_576,
    },
    privateBlindingNonceHex: nonceHex,
  };
  return { ...proof, opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof) };
}

function maximumG001CensusActivationWrapper(sourceCommit: string) {
  const applicantFirst = maximumCensusPrivacyReceipt(sourceCommit, '20260828T120000Z', '1'.repeat(64));
  const applicantSecond = maximumCensusPrivacyReceipt(sourceCommit, '20260828T120100Z', '2'.repeat(64));
  const admittedFirst = maxAdmittedPlayerReceipt(sourceCommit, '2026-08-28T12:00:00.000Z', '3'.repeat(64));
  const admittedSecond = maxAdmittedPlayerReceipt(sourceCommit, '2026-08-28T12:01:00.000Z', '4'.repeat(64));
  const record = (applicant: object, admitted: object, observedAt: string) => ({
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-private-v1',
    sourceCommit,
    applicant,
    admitted,
    observedAt,
  });
  const envelope = (value: object) => ({
    recordDigest: sha256(`${JSON.stringify(value)}\n`),
    record: value,
  });
  const first = envelope(record(applicantFirst, admittedFirst, '2026-08-28T12:00:00.000Z'));
  const second = envelope(record(applicantSecond, admittedSecond, '2026-08-28T12:01:00.000Z'));
  const expiresAt = '2026-08-28T12:06:00.000Z';
  const confirmationDigest = sha256([
    'warpkeep.sealed-realms.g001-census-confirmation.v1', sourceCommit,
    first.recordDigest, second.recordDigest, expiresAt,
  ].join('\n'));
  return {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-activation-private-v1',
    first,
    second,
    confirmation: envelope({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-g001-census-private-v1',
      sourceCommit,
      firstDigest: first.recordDigest,
      secondDigest: second.recordDigest,
      secondObservedAt: '2026-08-28T12:01:00.000Z',
      expiresAt,
      confirmationDigest,
    }),
    consumed: envelope({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-g001-census-private-v1',
      sourceCommit,
      firstDigest: first.recordDigest,
      secondDigest: second.recordDigest,
      confirmationDigest,
      consumedAt: '2026-08-28T12:01:00.000Z',
    }),
  };
}

function privateStateFixture(options: Readonly<{
  testOnlyRace?: (phase: string, path: string) => void;
}> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-activation-records-'));
  temporaryHomes.push(home);
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {},
    testOnlyAllowPlatformMode: true,
    ...options,
  });
}

function runtimePath(home: string, relativePath: string) {
  return join(
    home,
    'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime',
    'sealed-realms-v1',
    ...relativePath.split('/'),
  );
}

function fixedDescriptorPath(home: string) {
  return runtimePath(home, FIXED_DESCRIPTOR_RELATIVE_PATH);
}

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('sealed-realms activation descriptor records', () => {
  it.each(['valid', 'independent', 'module-source', 'atlas-source', 'digest', 'missing', 'historical'])(
    'validates the twelve-record recovery descriptor: %s', (scenario) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:02:00.000Z'));
    try {
      const state = privateStateFixture();
      const receipts = fullCorpus();
      if (scenario === 'independent') {
        for (const realm of ['g002', 'ptr'] as const) {
          for (const [member, receipt] of Object.entries(receipts)) {
            if (!member.startsWith(realm)) continue;
            const mutable = receipt as Record<string, unknown>;
            if ('sourceCommit' in mutable) mutable.sourceCommit = (realm === 'g002' ? 'e' : 'f').repeat(40);
            if ('moduleSourceCommit' in mutable) mutable.moduleSourceCommit = (realm === 'g002' ? 'e' : 'f').repeat(40);
            if ('atlasSourceCommit' in mutable) mutable.atlasSourceCommit = (realm === 'g002' ? 'c' : 'd').repeat(40);
          }
        }
        const { publishReceiptDigest: _g002Publish, ...g002Publish } = receipts.g002PublishReceipt;
        receipts.g002PublishReceipt.publishReceiptDigest = genesis002PublishReceiptDigest(g002Publish);
        const { importReceiptDigest: _g002Import, ...g002Import } = receipts.g002AtlasImportReceipt;
        receipts.g002AtlasImportReceipt.importReceiptDigest = genesis002ProductionImportReceiptDigest(g002Import);
        const { publishReceiptDigest: _ptrPublish, ...ptrPublish } = receipts.ptrPublishReceipt;
        receipts.ptrPublishReceipt.publishReceiptDigest = ptrProductionPublishReceiptDigest(ptrPublish);
        const { importReceiptDigest: _ptrImport, ...ptrImport } = receipts.ptrAtlasImportReceipt;
        receipts.ptrAtlasImportReceipt.importReceiptDigest = ptrProductionAtlasImportReceiptDigest(ptrImport);
        receipts.ptrOwnerProvisionReceipt.atlasImportReceiptDigest = receipts.ptrAtlasImportReceipt.importReceiptDigest;
        const { provisionReceiptDigest: _owner, ...owner } = receipts.ptrOwnerProvisionReceipt;
        receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest = ptrOwnerProvisionReceiptDigest(owner);
      }
      const candidate = recoveryBindingCandidate();
      Object.assign(candidate, {
        preparationSourceCommit: FIXTURE_SOURCE_COMMIT,
        recoveryAuthWorkerSourceCommit: FIXTURE_SOURCE_COMMIT,
        authBridgeSourceCommit: FIXTURE_SOURCE_COMMIT,
      }, deriveGenesis001RecoveryLaunchEvidence({
        preparationSourceCommit: FIXTURE_SOURCE_COMMIT,
        policyObservationBootstrapReceipt: receipts.g001PolicyObservationBootstrapReceipt,
        censusPrivacySafePrivateReceipt: receipts.g001CensusPrivacySafePrivateReceipt,
        admissionMonitorSuspensionReceipt: receipts.g001AdmissionMonitorSuspensionReceipt,
        admissionMonitorCurrentStateReceipt: receipts.g001AdmissionMonitorCurrentStateReceipt,
        admittedPlayerCensusPrivateReceipt: receipts.g001AdmittedPlayerCensusPrivateReceipt,
      }));
      for (const realm of ['g002', 'ptr'] as const) {
        const published = receipts[`${realm}PublishReceipt`] as Record<string, unknown>;
        for (const field of ['databaseIdentity', 'moduleSha256', 'moduleTreeId',
          'dependencyClosureDigest', 'spacetimeExecutableSha256', 'spacetimeCliConfigSha256',
          'freshStatusDigest', 'publishReceiptDigest']) {
          candidate[`${realm}${field[0]!.toUpperCase()}${field.slice(1)}`] = published[field] as string;
        }
        candidate[`${realm}ModuleSourceCommit`] = published.sourceCommit as string;
        candidate[`${realm}AtlasImportReceiptDigest`] = receipts[`${realm}AtlasImportReceipt`].importReceiptDigest;
        const live = receipts[`${realm}SealedLiveReceipt`] as Record<string, unknown>;
        candidate[`${realm}SealedLiveReceiptDigest`] = realm === 'g002'
          ? genesis002SealedLiveReceiptDigest(live) : ptrSealedLiveReceiptDigest(live);
        for (const field of ['atlasId', 'atlasSourceCommit', 'publicReleaseId', 'releaseHeaderSha256', 'verificationDigest']) {
          candidate[`${realm}${field[0]!.toUpperCase()}${field.slice(1)}`] = live[field] as string;
        }
      }
      candidate.g002ReleaseSha256 = receipts.g002SealedLiveReceipt.releaseSha256;
      candidate.ptrReleaseManifestSha256 = receipts.ptrSealedLiveReceipt.releaseManifestSha256;
      candidate.ptrExpectedReleaseSha256 = receipts.ptrSealedLiveReceipt.expectedReleaseSha256;
      candidate.ptrOwnerProvisionReceiptDigest = receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest;
      for (const member of Object.keys(receipts) as ActivationRecordMember[]) {
        if (member !== 'g001FreezePublishReceipt') writeActivationRecord(state, member, receipts[member]);
      }
      const records = createSealedRealmsProductionActivationRecords({
        privateState: state, authority: fullRecordAuthority(),
        readBindingCandidate: () => `${JSON.stringify(candidate, null, 2)}\n`,
      });
      if (scenario === 'module-source') candidate.g002ModuleSourceCommit = 'e'.repeat(40);
      if (scenario === 'atlas-source') candidate.ptrAtlasSourceCommit = 'e'.repeat(40);
      if (scenario === 'digest') candidate.ptrPublishReceiptDigest = 'e'.repeat(64);
      if (scenario === 'missing') state.remove({
        root: 'runtime', relativePath: `activation-evidence/records/${ACTIVATION_RECORD_NAMES.ptrSealedLiveReceipt}`,
      });
      if (scenario === 'historical') writeActivationRecord(state, 'g001FreezePublishReceipt', receipts.g001FreezePublishReceipt);
      const consume = vi.fn((fd: number) => {
        const bytes = readFileSync(fd);
        try {
          const descriptor = JSON.parse(bytes.toString('utf8'));
          expect(descriptor.schemaVersion).toBe(2);
          expect(descriptor).not.toHaveProperty('g001FreezePublishReceipt');
          expect(descriptor.bindingCandidate.g001FreezePublishReceiptDigest).toBeNull();
          expect(Object.keys(descriptor)).toHaveLength(15);
        } finally { bytes.fill(0); }
        return undefined;
      });
      if (scenario === 'valid' || scenario === 'independent') {
        expect(writeSealedRealmsProductionRecoveryActivationDescriptor({ records, consumeDescriptor: consume })).toEqual({});
        expect(consume).toHaveBeenCalledTimes(1);
      } else {
        expect(() => writeSealedRealmsProductionRecoveryActivationDescriptor({ records, consumeDescriptor: consume })).toThrow();
        expect(consume).not.toHaveBeenCalled();
      }
    } finally { vi.useRealTimers(); }
  });

  it('exposes no raw-receipt capture surface and never accepts descriptor evidence input', () => {
    const state = privateStateFixture();
    const source = 'a'.repeat(40);
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g002-publish-apply',
      workflowInputSha: source,
      readGit: args => args[0] === 'rev-parse'
        ? `${source}\n`
        : (() => { throw new Error('unexpected git request'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: source,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const records = createSealedRealmsProductionActivationRecords({
      privateState: state,
      authority,
      readBindingCandidate: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: source,
        g002PublishReceiptDigest: null,
      }),
    });
    expect(Object.keys(records)).toEqual([]);
    expect(Object.keys(activationRecordsModule))
      .not.toContain('captureSealedRealmsProductionActivationReceipt');
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      evidence: {},
      consumeDescriptor: () => undefined,
    } as never)).toThrow();
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: () => undefined,
    })).toThrow('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
  });

  it('reopens one complete fixed thirteen-record corpus into the canonical private descriptor', () => {
    const { state, records, receipts } = fullCorpusFixture();
    let source = '';
    expect(writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: descriptor => {
        source = readFileSync(descriptor, 'utf8');
        return undefined;
      },
    })).toEqual({});
    const descriptor = JSON.parse(source);
    expect(Object.keys(descriptor)).toEqual([
      'schemaVersion',
      'profile',
      'bindingCandidate',
      'g001FreezePublishReceipt',
      'g001PolicyObservationBootstrapReceipt',
      'g001CensusPrivacySafePrivateReceipt',
      'g001AdmittedPlayerCensusPrivateReceipt',
      'g001AdmissionMonitorSuspensionReceipt',
      'g001AdmissionMonitorCurrentStateReceipt',
      'authBridgeSuspensionPrivateReceipt',
      'g002PublishReceipt',
      'g002AtlasImportReceipt',
      'g002SealedLiveReceipt',
      'g002SealedLiveReceiptDigest',
      'ptrPublishReceipt',
      'ptrAtlasImportReceipt',
      'ptrOwnerProvisionReceipt',
      'ptrSealedLiveReceipt',
      'ptrSealedLiveReceiptDigest',
    ]);
    expect(source).toBe(`${JSON.stringify(descriptor, null, 2)}\n`);
    expect(descriptor.bindingCandidate.pagesDeploymentApproved).toBe(true);
    expect(descriptor.authBridgeSuspensionPrivateReceipt).toBeNull();
    expect(descriptor.g002SealedLiveReceiptDigest)
      .toBe(genesis002SealedLiveReceiptDigest(receipts.g002SealedLiveReceipt));
    expect(descriptor.ptrSealedLiveReceiptDigest)
      .toBe(ptrSealedLiveReceiptDigest(receipts.ptrSealedLiveReceipt));
    expect(state.exists({
      root: 'runtime', relativePath: 'public/0.4.0-sealed-launch.json',
    })).toBe(false);
  });

  it('rejects a rehashed admitted census captured by inspection instead of suspension', () => {
    const { state, records, receipts } = fullCorpusFixture();
    const member = 'g001AdmittedPlayerCensusPrivateReceipt';
    state.remove({
      root: 'runtime',
      relativePath: `activation-evidence/records/${ACTIVATION_RECORD_NAMES[member]}`,
    });
    writeActivationRecord(state, member, receipts[member], 'g001-census-second-inspect');
    let consumed = false;
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: () => { consumed = true; return undefined; },
    })).toThrow('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    expect(consumed).toBe(false);
    expect(state.exists({ root: 'runtime', relativePath: FIXED_DESCRIPTOR_RELATIVE_PATH })).toBe(false);
  });

  it('rejects a rehashed individual G002 sealed-live record tamper before descriptor exposure', () => {
    const { state, records, receipts } = fullCorpusFixture();
    replaceActivationRecord(state, 'g002SealedLiveReceipt', {
      ...receipts.g002SealedLiveReceipt,
      playerPresentationEnabled: true,
    });
    let consumed = false;
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: () => {
        consumed = true;
        return undefined;
      },
    })).toThrow('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    expect(consumed).toBe(false);
    expect(state.exists({
      root: 'runtime', relativePath: FIXED_DESCRIPTOR_RELATIVE_PATH,
    })).toBe(false);
  });

  it('rejects a rehashed PTR owner/import cross-link swap before descriptor exposure', () => {
    const { state, records, receipts } = fullCorpusFixture();
    const { provisionReceiptDigest: _oldDigest, ...ownerBody } = receipts.ptrOwnerProvisionReceipt;
    const swappedOwnerBody = {
      ...ownerBody,
      atlasImportReceiptDigest: 'f'.repeat(64),
    };
    replaceActivationRecord(state, 'ptrOwnerProvisionReceipt', {
      ...swappedOwnerBody,
      provisionReceiptDigest: ptrOwnerProvisionReceiptDigest(swappedOwnerBody),
    });
    let consumed = false;
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: () => {
        consumed = true;
        return undefined;
      },
    })).toThrow('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    expect(consumed).toBe(false);
    expect(state.exists({
      root: 'runtime', relativePath: FIXED_DESCRIPTOR_RELATIVE_PATH,
    })).toBe(false);
  });

  it('keeps a schema-valid maximum-width G001 census record below the generic cap', () => {
    const source = 'a'.repeat(40);
    const receipt = maximumG001CensusActivationWrapper(source);
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-activation-record-v1',
      member: 'g001AdmittedPlayerCensusPrivateReceipt',
      preparationSourceCommit: source,
      sourceCommit: source,
      operation: 'g001-census-second-suspend',
      sourceAuthorityDigest: 'b'.repeat(64),
      bodyDigest: sha256(`${JSON.stringify(receipt)}\n`),
      receipt,
      semanticDigest: 'c'.repeat(64),
    };
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    try {
      expect(bytes.byteLength).toBeGreaterThan(400 * 1_024);
      expect(bytes.byteLength).toBeLessThanOrEqual(512 * 1_024);
    } finally {
      bytes.fill(0);
    }
  }, 30_000);

  it('keeps the descriptor FD callback synchronous, no-clobber, and private', () => {
    const state = privateStateFixture();
    const bytes = Buffer.from('{\n  "private": true\n}\n', 'utf8');
    let observed = '';
    try {
      expect(state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes,
        consume: descriptor => {
          observed = readFileSync(descriptor, 'utf8');
          return undefined;
        },
      })).toEqual({});
      expect(observed).toBe('{\n  "private": true\n}\n');
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{\n  "private": false\n}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow();
    } finally {
      bytes.fill(0);
    }
  });

  it('rejects a caller-selected descriptor target before any private write', () => {
    const state = privateStateFixture();
    const bytes = Buffer.from('{"private":true}\n', 'utf8');
    try {
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        root: 'audit',
        relativePath: 'caller-selected.json',
        bytes,
        consume: () => undefined,
      } as never)).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_TARGET_INVALID');
      expect(state.exists({ root: 'audit', relativePath: 'caller-selected.json' })).toBe(false);
    } finally {
      bytes.fill(0);
    }
  });

  it('closes the descriptor FD after a callback throw or thenable result', () => {
    const thrownState = privateStateFixture();
    let thrownDescriptor = -1;
    const callbackFailure = new Error('consume failure');
    expect(() => thrownState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: descriptor => {
        thrownDescriptor = descriptor;
        throw callbackFailure;
      },
    })).toThrow(callbackFailure);
    expect(() => readFileSync(thrownDescriptor)).toThrow();

    const thenableState = privateStateFixture();
    let thenableDescriptor = -1;
    expect(() => thenableState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: descriptor => {
        thenableDescriptor = descriptor;
        return Promise.resolve() as never;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_ASYNC_CONSUME');
    expect(() => readFileSync(thenableDescriptor)).toThrow();
  });

  it('observes and suppresses a rejecting descriptor thenable before failing closed', async () => {
    const state = privateStateFixture();
    let descriptor = -1;
    let assimilated = false;
    let unhandled: unknown;
    const observeUnhandled = (reason: unknown) => { unhandled = reason; };
    const rejectingThenable = Object.freeze({
      then(_resolve: unknown, reject: (reason: Error) => void) {
        assimilated = true;
        reject(new Error('late descriptor rejection'));
      },
    });
    process.on('unhandledRejection', observeUnhandled);
    try {
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{"private":true}\n', 'utf8'),
        consume: reopened => {
          descriptor = reopened;
          return rejectingThenable as never;
        },
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_ASYNC_CONSUME');
      expect(() => readFileSync(descriptor)).toThrow();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(assimilated).toBe(true);
      expect(unhandled).toBeUndefined();
    } finally {
      process.off('unhandledRejection', observeUnhandled);
    }
  });

  it('allows only the fixed descriptor path to use its 1 MiB ceiling', () => {
    const genericState = privateStateFixture();
    const descriptorBytes = Buffer.alloc((512 * 1_024) + 1, 0x61);
    const oversizedDescriptor = Buffer.alloc((1 * 1_024 * 1_024) + 1, 0x62);
    try {
      expect(() => genericState.write({
        root: 'runtime',
        relativePath: 'activation-evidence/generic-stays-bounded.json',
        bytes: Buffer.from(descriptorBytes),
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
      let observedByteLength = 0;
      const descriptorState = privateStateFixture();
      expect(descriptorState.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: descriptorBytes,
        consume: descriptor => {
          observedByteLength = readFileSync(descriptor).byteLength;
          return undefined;
        },
      })).toEqual({});
      expect(observedByteLength).toBe(descriptorBytes.byteLength);
      const oversizedState = privateStateFixture();
      expect(() => oversizedState.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: oversizedDescriptor,
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
    } finally {
      descriptorBytes.fill(0);
      oversizedDescriptor.fill(0);
    }
  });

  it('rejects a descriptor name replacement before it exposes the reopened FD', () => {
    let armed = false;
    let callbackCalled = false;
    const state = privateStateFixture({
      testOnlyRace: (phase, path) => {
        if (armed && phase === 'descriptor-after-open') {
          armed = false;
          renameSync(path, `${path}.displaced`);
          writeFileSync(path, '{"attacker":true}\n');
        }
      },
    });
    armed = true;
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        callbackCalled = true;
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
    expect(callbackCalled).toBe(false);
  });

  it('rejects pre-existing and hard-link descriptor names without overwriting them', () => {
    for (const [basename, create] of [
      ['pre-existing', (target: string, _anchor: string) => writeFileSync(target, '{"old":true}\n')],
      ['hard-link', (target: string, anchor: string) => linkSync(anchor, target)],
    ] as const) {
      const state = privateStateFixture();
      const home = temporaryHomes.at(-1)!;
      const target = fixedDescriptorPath(home);
      const parent = runtimePath(home, 'activation-evidence');
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const anchor = join(parent, `${basename}-anchor.json`);
      writeFileSync(anchor, '{"anchor":true}\n', { mode: 0o600 });
      create(target, anchor);
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{"private":true}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS');
      expect(readFileSync(target, 'utf8')).not.toBe('{"private":true}\n');
    }
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a pre-existing symlink descriptor name without overwriting it',
    () => {
      const state = privateStateFixture();
      const home = temporaryHomes.at(-1)!;
      const parent = runtimePath(home, 'activation-evidence');
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const anchor = join(parent, 'anchor.json');
      writeFileSync(anchor, '{"anchor":true}\n', { mode: 0o600 });
      const target = fixedDescriptorPath(home);
      symlinkSync(anchor, target);
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{"private":true}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS');
      expect(readFileSync(target, 'utf8')).toBe('{"anchor":true}\n');
    },
  );

  it('rejects a post-consume descriptor replacement before returning', () => {
    const state = privateStateFixture();
    const home = temporaryHomes.at(-1)!;
    const target = fixedDescriptorPath(home);
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        renameSync(target, `${target}.displaced`);
        writeFileSync(target, '{"attacker":true}\n');
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
  });

  it('rejects a post-consume descriptor hard-link before returning', () => {
    const state = privateStateFixture();
    const home = temporaryHomes.at(-1)!;
    const target = fixedDescriptorPath(home);
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        linkSync(target, `${target}.alias`);
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
  });

  it('preserves the PTR owner receipt import digest in its signed canonical body', () => {
    const receipt = {
      schemaVersion: 1,
      profile: 'warpkeep-ptr-owner-provision-v1',
      outcome: 'verified',
      databaseIdentity: '9'.repeat(64),
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      moduleSourceCommit: 'a'.repeat(40),
      atlasImportReceiptDigest: '2'.repeat(64),
      ownerOpaqueProofDigest: '0123456789abcdef'.repeat(4),
      ownerAnchorRows: 1,
      ownerProvisioned: true,
      ownerEnabled: true,
      zeroPopulationBoundary: true,
    } as const;
    const digest = ptrOwnerProvisionReceiptDigest(receipt);
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(ptrOwnerProvisionReceiptDigest({
      ...receipt,
      atlasImportReceiptDigest: '3'.repeat(64),
    })).not.toBe(digest);
  });
});
