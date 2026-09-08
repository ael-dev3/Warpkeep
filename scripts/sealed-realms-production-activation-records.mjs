import { createHash } from 'node:crypto';
import { types } from 'node:util';

import {
  assertSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from './genesis002-activation-receipts.mjs';
import {
  deriveGenesis001SealedLaunchEvidence,
  deriveGenesis001RecoveryLaunchEvidence,
  validateGenesis001RecoveryLaunchEvidenceAtTime,
  genesis001AdmissionMonitorCurrentStateReceiptDigest,
  genesis001CensusOpaqueProofDigest,
  genesis001FreezePublishReceiptDigest,
  genesis001MonitorSuspensionReceiptDigest,
} from './genesis001-sealed-launch-adoption.mjs';
import {
  verifyGenesis001AdmittedPlayerCensusReceipt,
} from './genesis001-admitted-player-census.mjs';
import { createRecoveryActivationBindingFromCandidate, validateRecoveryActivationCandidateDocument } from './recovery-activation-candidate.mjs';
import { parseActivationGenerationReceipt } from './sealed-realms-production-activation-generation-receipt.mjs';
import { readPtrExistingUpdateCompletion } from './ptr-production-existing-update-adapter.mjs';
import { updateDigest } from './sealed-realms-existing-update-protocol.mjs';

const isProxy = types.isProxy;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RECORD_PROFILE = 'warpkeep-sealed-realms-activation-record-v1';
const EVIDENCE_PROFILE = 'warpkeep-0.4.0-sealed-launch-activation-evidence-v1';
const RECORD_DIRECTORY = 'activation-evidence/records';
const recordsCapabilities = new WeakMap();
const candidateReadContexts = new WeakMap();

const RECEIPT_MEMBERS = Object.freeze([
  'g001FreezePublishReceipt',
  'g001PolicyObservationBootstrapReceipt',
  'g001CensusPrivacySafePrivateReceipt',
  'g001AdmittedPlayerCensusPrivateReceipt',
  'g001AdmissionMonitorSuspensionReceipt',
  'g001AdmissionMonitorCurrentStateReceipt',
  'g002PublishReceipt',
  'g002AtlasImportReceipt',
  'g002SealedLiveReceipt',
  'ptrPublishReceipt',
  'ptrAtlasImportReceipt',
  'ptrOwnerProvisionReceipt',
  'ptrSealedLiveReceipt',
]);

const PRODUCING_OPERATIONS = Object.freeze({
  g001FreezePublishReceipt: 'g001-policy-observe',
  g001PolicyObservationBootstrapReceipt: 'g001-policy-observe',
  g001CensusPrivacySafePrivateReceipt: 'g001-census-second-inspect',
  // The admitted-player baseline is captured at suspension, not the earlier
  // inspection. The producing operation is part of the record commitment.
  g001AdmittedPlayerCensusPrivateReceipt: 'g001-census-second-suspend',
  g001AdmissionMonitorSuspensionReceipt: 'g001-census-second-suspend',
  g001AdmissionMonitorCurrentStateReceipt: 'g001-current-state',
  g002PublishReceipt: 'g002-publish-apply',
  g002AtlasImportReceipt: 'g002-import-apply',
  g002SealedLiveReceipt: 'g002-live-inspect',
  ptrPublishReceipt: 'ptr-publish-apply',
  ptrExistingUpdateReceipt: 'ptr-update-apply',
  ptrAtlasImportReceipt: 'ptr-import-apply',
  ptrOwnerProvisionReceipt: 'ptr-owner-provision',
  ptrSealedLiveReceipt: 'ptr-live-inspect',
});

const RECEIPT_BASENAMES = Object.freeze({
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
  ptrExistingUpdateReceipt: 'ptr-existing-update-receipt.json',
  ptrAtlasImportReceipt: 'ptr-atlas-import-receipt.json',
  ptrOwnerProvisionReceipt: 'ptr-owner-provision-receipt.json',
  ptrSealedLiveReceipt: 'ptr-sealed-live-receipt.json',
});

const RECOVERY_MEMBERS_V2 = Object.freeze(RECEIPT_MEMBERS.filter(member => member !== 'g001FreezePublishReceipt'));
const RECOVERY_MEMBERS_V3 = Object.freeze(RECOVERY_MEMBERS_V2.map(member =>
  member === 'ptrPublishReceipt' ? 'ptrExistingUpdateReceipt' : member));
const RECOVERY_PROFILE_V2 = 'warpkeep-0.4.0-recovery-activation-evidence-v1';
const RECOVERY_PROFILE_V3 = 'warpkeep-0.4.0-recovery-activation-evidence-ptr-update-v1';

const G002_PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'databaseIdentity', 'database', 'moduleIdentity',
  'sourceCommit', 'moduleSha256', 'moduleTreeId', 'dependencyClosureDigest',
  'spacetimeExecutableSha256', 'spacetimeCliConfigSha256', 'deleteData', 'outcome',
  'freshStatusDigest', 'playerAccessEnabled', 'admissionMutationsEnabled',
  'atlasImportMutationsEnabled', 'atlasActivationMutationsEnabled',
  'playerPresentationEnabled',
]);
const G002_PUBLISH_RESULT_KEYS = Object.freeze([
  ...G002_PUBLISH_RECEIPT_KEYS, 'publishReceiptDigest',
]);
const G002_IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'outcome', 'databaseIdentity', 'moduleIdentity',
  'moduleSourceCommit', 'moduleSha256', 'moduleTreeId', 'dependencyClosureDigest',
  'spacetimeExecutableSha256', 'atlasId', 'atlasSourceCommit', 'publicReleaseId',
  'expectedReleaseSha256', 'verificationDigest', 'importEpoch', 'operationsSubmitted',
  'operationChainDigest', 'zeroPopulationBoundary', 'activationMutationsEnabled',
  'playerPresentationEnabled', 'atlasWritesClosedByFinalization',
]);
const G002_IMPORT_RESULT_KEYS = Object.freeze([
  ...G002_IMPORT_RECEIPT_KEYS, 'importReceiptDigest',
]);
const PTR_PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'databaseIdentity', 'databaseAlias', 'moduleIdentity',
  'sourceCommit', 'moduleSha256', 'moduleTreeId', 'dependencyClosureDigest',
  'spacetimeExecutableSha256', 'spacetimeCliConfigSha256', 'deleteData', 'outcome',
  'freshDatabase', 'freshStatusDigest', 'admissionSurfacePresent',
  'accessRequestSurfacePresent',
]);
const PTR_PUBLISH_RESULT_KEYS = Object.freeze([
  ...PTR_PUBLISH_RECEIPT_KEYS, 'publishReceiptDigest',
]);
const PTR_IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'outcome', 'databaseIdentity', 'moduleIdentity',
  'moduleSourceCommit', 'moduleSha256', 'moduleTreeId', 'dependencyClosureDigest',
  'spacetimeExecutableSha256', 'atlasId', 'atlasSourceCommit', 'publicReleaseId',
  'releaseManifestSha256', 'expectedReleaseSha256', 'releaseHeaderSha256',
  'verificationDigest', 'importEpoch', 'operationsSubmitted', 'operationChainDigest',
  'zeroPopulationBoundary', 'importsExact', 'ready', 'atlasFinalized',
  'atlasWritesClosedByFinalization', 'importMutationsCompiled',
  'activationMutationsCompiled',
]);
const PTR_IMPORT_RESULT_KEYS = Object.freeze([
  ...PTR_IMPORT_RECEIPT_KEYS, 'importReceiptDigest',
]);
const PTR_OWNER_PROVISION_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'outcome', 'databaseIdentity', 'databaseAlias',
  'moduleIdentity', 'moduleSourceCommit', 'atlasImportReceiptDigest',
  'ownerOpaqueProofDigest', 'ownerAnchorRows', 'ownerProvisioned', 'ownerEnabled',
  'zeroPopulationBoundary',
]);
const PTR_OWNER_PROVISION_RESULT_KEYS = Object.freeze([
  ...PTR_OWNER_PROVISION_RECEIPT_KEYS, 'provisionReceiptDigest',
]);
const PTR_SEALED_LIVE_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'uri', 'databaseIdentity', 'databaseAlias',
  'moduleIdentity', 'moduleSourceCommit', 'moduleSha256', 'releaseVersion', 'realmId',
  'atlasSourceCommit', 'atlasId', 'publicReleaseId', 'releaseManifestSha256',
  'expectedReleaseSha256', 'releaseHeaderSha256', 'verificationDigest', 'atlasState',
  'atlasFinalized', 'atlasImportsExact', 'atlasWritesClosedByFinalization', 'allowedFids',
  'accessRequests', 'playersV1', 'playersV2', 'ownershipBindings', 'castles',
  'realmProfiles', 'termsAcceptances', 'markAccounts', 'resourceAccounts', 'claimRows',
  'occupancyRows', 'activationRows', 'publicAtlasRows', 'publicRegionRows',
  'workerSystemRows', 'atlasImportMutationsCompiled', 'atlasActivationMutationsCompiled',
  'ownerOpaqueProofDigest', 'ownerAnchorRows', 'ownerProvisioned', 'ownerEnabled',
  'admissionsOpen', 'accessRequestsOpen', 'admissionSurfacePresent',
  'accessRequestSurfacePresent', 'playerPresentationEnabled',
]);
const PTR_IMPORT_EPOCH_MAXIMUM = (1n << 64n) - 1n;
const PTR_IMPORT_OPERATION_MAXIMUM = 4_096;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;

const FULL_BINDING_CANDIDATE_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'pagesDeploymentApproved',
  'preparationSourceCommit',
  'g001DatabaseIdentity',
  'g001SourceBaselineCommit',
  'g001BaselineAbiSha256',
  'g001FreezeReleaseNonce',
  'g001FreezePublishReceiptDigest',
  'g001FreezePublishReceiptCommitment',
  'g001PolicyReceiptDigest',
  'g001PolicyReceiptCommitment',
  'g001PolicyObservationBootstrapReceiptDigest',
  'g001PolicyObservationBootstrapReceiptCommitment',
  'g001PolicySourceCommit',
  'g001ReleaseVersion',
  'g001PlayerAccessEnabled',
  'g001AdmissionStateMutationsEnabled',
  'g001AccessRequestSubmissionsEnabled',
  'g001CensusPrivacySafeReceiptProfile',
  'g001CensusPrivacySafeReceiptDigest',
  'g001CensusPrivacySafeReceiptCommitment',
  'g001AdmittedPlayerCensusReceiptProfile',
  'g001AdmittedPlayerCensusReceiptDigest',
  'g001AdmittedPlayerCensusReceiptCommitment',
  'admissionMonitorSuspensionReceiptDigest',
  'admissionMonitorSuspensionReceiptCommitment',
  'admissionMonitorCurrentStateReceiptDigest',
  'admissionMonitorCurrentStateReceiptCommitment',
  'admissionMonitorDisabled',
  'admissionMonitorLoaded',
  'authBridgeSourceCommit',
  'admissionRequestSuspensionReceiptDigest',
  'admissionRequestSuspensionReceiptCommitment',
  'g002PublishReceiptDigest',
  'g002PublishReceiptCommitment',
  'g002FreshStatusDigest',
  'g002FreshStatusCommitment',
  'g002DatabaseIdentity',
  'g002ModuleSourceCommit',
  'g002ModuleSha256',
  'g002ModuleTreeId',
  'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256',
  'g002SpacetimeCliConfigSha256',
  'g002AtlasImportReceiptDigest',
  'g002AtlasImportReceiptCommitment',
  'g002SealedLiveReceiptDigest',
  'g002SealedLiveReceiptCommitment',
  'g002AtlasSourceCommit',
  'g002AtlasId',
  'g002PublicReleaseId',
  'g002ReleaseSha256',
  'g002ReleaseHeaderSha256',
  'g002VerificationDigest',
  'g002AllowedFids',
  'g002AccessRequests',
  'g002PlayersV1',
  'g002PlayersV2',
  'g002OwnershipBindings',
  'g002Founders',
  'g002Castles',
  'g002RealmProfiles',
  'g002TermsAcceptances',
  'g002MarkAccounts',
  'g002ResourceAccounts',
  'g002Claims',
  'g002Occupancies',
  'g002ActivationRows',
  'g002WorkerSystemRows',
  'g002AtlasReady',
  'g002AtlasFinalized',
  'g002AtlasWritesClosedByFinalization',
  'g002AtlasImportMutationsEnabled',
  'g002AtlasActivationMutationsEnabled',
  'g002PlayerAccessEnabled',
  'g002AdmissionMutationsEnabled',
  'ptrPublishReceiptDigest',
  'ptrPublishReceiptCommitment',
  'ptrFreshStatusDigest',
  'ptrFreshStatusCommitment',
  'ptrAtlasImportReceiptDigest',
  'ptrAtlasImportReceiptCommitment',
  'ptrSealedLiveReceiptDigest',
  'ptrSealedLiveReceiptCommitment',
  'ptrOwnerProvisionReceiptDigest',
  'ptrOwnerProvisionReceiptCommitment',
  'ptrDatabaseIdentity',
  'ptrModuleSourceCommit',
  'ptrModuleSha256',
  'ptrModuleTreeId',
  'ptrDependencyClosureDigest',
  'ptrSpacetimeExecutableSha256',
  'ptrSpacetimeCliConfigSha256',
  'ptrAtlasSourceCommit',
  'ptrAtlasId',
  'ptrPublicReleaseId',
  'ptrReleaseVersion',
  'ptrReleaseManifestSha256',
  'ptrExpectedReleaseSha256',
  'ptrReleaseHeaderSha256',
  'ptrVerificationDigest',
  'ptrAllowedFids',
  'ptrAccessRequests',
  'ptrPlayersV1',
  'ptrPlayersV2',
  'ptrOwnershipBindings',
  'ptrCastles',
  'ptrRealmProfiles',
  'ptrTermsAcceptances',
  'ptrMarkAccounts',
  'ptrResourceAccounts',
  'ptrClaims',
  'ptrOccupancies',
  'ptrActivationRows',
  'ptrPublicAtlasRows',
  'ptrPublicRegionRows',
  'ptrWorkerSystemRows',
  'ptrAtlasReady',
  'ptrAtlasFinalized',
  'ptrAtlasWritesClosedByFinalization',
  'ptrAtlasImportsExact',
  'ptrAtlasImportMutationsCompiled',
  'ptrAtlasActivationMutationsCompiled',
  'ptrOwnerAnchorRows',
  'ptrOwnerProvisioned',
  'ptrOwnerEnabled',
  'ptrAdmissionsOpen',
  'ptrAccessRequestsOpen',
  'ptrAdmissionSurfacePresent',
  'ptrAccessRequestSurfacePresent',
  'g002PresentationEnabled',
  'ptrPresentationEnabled',
  'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled',
  'admissionNotificationsEnabled',
]);
const FULL_BINDING_NULL_KEYS = Object.freeze(
  FULL_BINDING_CANDIDATE_KEYS.slice(4, -5),
);
const FULL_BINDING_FALSE_KEYS = Object.freeze(
  FULL_BINDING_CANDIDATE_KEYS.slice(-5),
);

export class SealedRealmsProductionActivationRecordsError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionActivationRecordsError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionActivationRecordsError(code);
}

function exactInput(value, keys, code = 'SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID') {
  if (
    isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Reflect.ownKeys(value)) !== JSON.stringify(keys)
    || keys.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor === undefined || !Object.hasOwn(descriptor, 'value')
        || descriptor.enumerable !== true;
    })
  ) fail(code);
  return value;
}

function exactBody(value) {
  if (
    isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).some(key => typeof key !== 'string')
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true,
    )
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  let source;
  let parsed;
  try {
    source = JSON.stringify(value);
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') < 2) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    }
    parsed = JSON.parse(source);
  } catch (error) {
    if (error instanceof SealedRealmsProductionActivationRecordsError) throw error;
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  }
  if (
    parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).length !== Object.keys(value).length
    || JSON.stringify(parsed) !== source
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  return Buffer.from(`${source}\n`, 'utf8');
}

function exactReceipt(value, keys) {
  if (
    isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Reflect.ownKeys(value)) !== JSON.stringify(keys)
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true,
    )
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  return value;
}

function receiptWithoutDigest(value, resultKeys, receiptKeys) {
  const result = exactReceipt(value, resultKeys);
  return Object.freeze(Object.fromEntries(receiptKeys.map(key => [key, result[key]])));
}

function requireSha(value) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  }
  return value;
}

function requireCommit(value) {
  if (typeof value !== 'string' || !COMMIT.test(value)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  }
  return value;
}

function canonicalJsonTree(value, depth = 0, ancestors = new Set()) {
  if (depth > 24) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  if (
    value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0))
  ) return;
  if (isProxy(value) || typeof value !== 'object' || ancestors.has(value)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 4_096 || Reflect.ownKeys(value).some(key => (
        key !== 'length' && (!/^(?:0|[1-9][0-9]{0,3})$/u.test(String(key))
          || Number(key) >= value.length)
      ))) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      for (const item of value) canonicalJsonTree(item, depth + 1, ancestors);
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.some(key => typeof key !== 'string')
      || Object.values(Object.getOwnPropertyDescriptors(value)).some(
        descriptor => !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true,
      )
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    for (const key of keys) canonicalJsonTree(value[key], depth + 1, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function ptrReceiptDigest(domain, receipt, keys) {
  exactReceipt(receipt, keys);
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

function ptrProductionPublishReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.production-publish-receipt.v1', receipt, PTR_PUBLISH_RECEIPT_KEYS,
  );
}

function ptrProductionAtlasImportReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.production-import-receipt.v1', receipt, PTR_IMPORT_RECEIPT_KEYS,
  );
}

function ptrOwnerProvisionReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.owner-provision-receipt.v1', receipt, PTR_OWNER_PROVISION_RECEIPT_KEYS,
  );
}

function ptrSealedLiveReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.sealed-live-receipt.v1', receipt, PTR_SEALED_LIVE_RECEIPT_KEYS,
  );
}

function censusPrivateProof(receipt, preparationSourceCommit) {
  const proof = exactReceipt(receipt, [
    'schemaVersion', 'profile', 'realmId', 'releaseVersion', 'sourceCommit',
    'privateCensusReference', 'privateBlindingNonceHex', 'opaqueProofDigest',
  ]);
  const reference = exactReceipt(proof.privateCensusReference, [
    'count', 'pathBasename', 'sha256', 'size',
  ]);
  if (
    proof.schemaVersion !== 1
    || proof.profile !== 'warpkeep-genesis-001-census-export-private-proof-v1'
    || proof.realmId !== 'GENESIS_001'
    || proof.releaseVersion !== '0.3.43'
    || proof.sourceCommit !== preparationSourceCommit
    || !Number.isSafeInteger(reference.count) || reference.count < 0 || reference.count > 4_096
    || !Number.isSafeInteger(reference.size) || reference.size < 1 || reference.size > 1_048_576
    || !/^warpkeep-access-request-census-[0-9]{8}T[0-9]{6}Z\.txt$/u.test(reference.pathBasename)
    || requireSha(reference.sha256) !== reference.sha256
    || !/^[a-f0-9]{64}$/u.test(proof.privateBlindingNonceHex)
    || /^0{64}$/u.test(proof.privateBlindingNonceHex)
    || proof.opaqueProofDigest !== genesis001CensusOpaqueProofDigest(proof)
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  return proof;
}

function validateG001Receipt(member, receipt, preparationSourceCommit) {
  canonicalJsonTree(receipt);
  if (member === 'g001FreezePublishReceipt') {
    const evidence = exactReceipt(receipt, ['receiptBasename', 'receiptSha256', 'receipt']);
    if (
      typeof evidence.receiptBasename !== 'string'
      || !/^genesis-001-freeze-publish-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u
        .test(evidence.receiptBasename)
      || !SHA256.test(evidence.receiptSha256)
      || genesis001FreezePublishReceiptDigest(evidence.receipt) !== evidence.receiptSha256
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    return;
  }
  if (member === 'g001PolicyObservationBootstrapReceipt') {
    const value = exactReceipt(receipt, [
      'profile', 'protectedCommit', 'moduleTreeId', 'bootstrapBlob', 'bootstrapSha256',
      'moduleArchiveCount', 'command', 'launchCleanup', 'policyObservationReceipt',
      'policyObservationReceiptLinkSha256',
    ]);
    exactReceipt(value.launchCleanup, [
      'outcome', 'runId', 'cleanupConfirmationSha256', 'treeInventorySha256',
    ]);
    exactReceipt(value.policyObservationReceipt, [
      'schemaVersion', 'profile', 'sourceCommit', 'observedAt', 'databaseIdentity',
      'procedure', 'mutationSubmitted', 'policy', 'policyReceiptDigest',
    ]);
    if (
      value.profile !== 'warpkeep-greater-realm-production-bootstrap-v1'
      || value.protectedCommit !== preparationSourceCommit
      || requireCommit(value.moduleTreeId) !== value.moduleTreeId
      || requireCommit(value.bootstrapBlob) !== value.bootstrapBlob
      || requireSha(value.bootstrapSha256) !== value.bootstrapSha256
      || value.moduleArchiveCount !== 16 || value.command !== 'g001-policy-observe'
      || requireSha(value.policyObservationReceiptLinkSha256)
        !== value.policyObservationReceiptLinkSha256
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    return;
  }
  if (member === 'g001CensusPrivacySafePrivateReceipt') {
    const pair = exactReceipt(receipt, ['first', 'second']);
    censusPrivateProof(pair.first, preparationSourceCommit);
    censusPrivateProof(pair.second, preparationSourceCommit);
    return;
  }
  if (member === 'g001AdmittedPlayerCensusPrivateReceipt') {
    const wrapper = exactReceipt(receipt, [
      'schemaVersion', 'profile', 'first', 'second', 'confirmation', 'consumed',
    ]);
    if (
      wrapper.schemaVersion !== 1
      || wrapper.profile !== 'warpkeep-sealed-realms-g001-census-activation-private-v1'
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    for (const item of [wrapper.first, wrapper.second]) {
      const envelope = exactReceipt(item, ['recordDigest', 'record']);
      const record = exactReceipt(envelope.record, [
        'schemaVersion', 'profile', 'sourceCommit', 'applicant', 'admitted', 'observedAt',
      ]);
      if (
        requireSha(envelope.recordDigest) !== envelope.recordDigest
        || createHash('sha256').update(`${JSON.stringify(record)}\n`).digest('hex')
          !== envelope.recordDigest
        || record.schemaVersion !== 1
        || record.profile !== 'warpkeep-sealed-realms-g001-census-private-v1'
        || record.sourceCommit !== preparationSourceCommit
      ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      censusPrivateProof(record.applicant, preparationSourceCommit);
      try { verifyGenesis001AdmittedPlayerCensusReceipt(record.admitted); } catch {
        fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      }
    }
    for (const item of [wrapper.confirmation, wrapper.consumed]) {
      const envelope = exactReceipt(item, ['recordDigest', 'record']);
      requireSha(envelope.recordDigest);
      if (
        createHash('sha256').update(`${JSON.stringify(envelope.record)}\n`).digest('hex')
          !== envelope.recordDigest
      ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    }
    return;
  }
  if (member === 'g001AdmissionMonitorSuspensionReceipt') {
    const evidence = exactReceipt(receipt, ['receiptBasename', 'receiptSha256', 'receipt']);
    const current = exactReceipt(evidence.receipt, [
      'disabled', 'label', 'loaded', 'monitorPlistSha256', 'monitorProgramSha256', 'profile',
      'realmId', 'release', 'sourceCommit', 'suspendedAt',
    ]);
    if (
      current.disabled !== true || current.loaded !== false || current.realmId !== 'GENESIS_001'
      || current.release !== '0.3.43' || current.sourceCommit !== preparationSourceCommit
      || evidence.receiptSha256 !== genesis001MonitorSuspensionReceiptDigest(current)
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    return;
  }
  if (member === 'g001AdmissionMonitorCurrentStateReceipt') {
    const current = exactReceipt(receipt, [
      'schemaVersion', 'profile', 'realmId', 'release', 'sourceCommit', 'observedAt', 'label',
      'disabled', 'loaded', 'monitorPlistSha256', 'monitorProgramSha256',
    ]);
    if (
      current.schemaVersion !== 1
      || current.profile !== 'warpkeep-genesis001-admission-monitor-current-state-v1'
      || current.realmId !== 'GENESIS_001' || current.release !== '0.3.43'
      || current.sourceCommit !== preparationSourceCommit || current.disabled !== true
      || current.loaded !== false
      || !requireSha(genesis001AdmissionMonitorCurrentStateReceiptDigest(current))
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
    return;
  }
  fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

function validatePtrPublishReceipt(receipt, preparationSourceCommit) {
  const body = receiptWithoutDigest(receipt, PTR_PUBLISH_RESULT_KEYS, PTR_PUBLISH_RECEIPT_KEYS);
  if (
    receipt.publishReceiptDigest !== ptrProductionPublishReceiptDigest(body)
    || body.schemaVersion !== 1 || body.profile !== 'warpkeep-ptr-production-publish-v1'
    || !requireSha(body.databaseIdentity) || body.databaseAlias !== 'warpkeep-ptr'
    || body.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || body.sourceCommit !== preparationSourceCommit || !requireSha(body.moduleSha256)
    || !requireCommit(body.moduleTreeId) || !requireSha(body.dependencyClosureDigest)
    || !requireSha(body.spacetimeExecutableSha256) || !requireSha(body.spacetimeCliConfigSha256)
    || body.deleteData !== 'never' || body.outcome !== 'verified' || body.freshDatabase !== true
    || !requireSha(body.freshStatusDigest) || body.admissionSurfacePresent !== false
    || body.accessRequestSurfacePresent !== false
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

// This validates receipt data, not ownership of the continuation records. Only
// the opaque completed-update writer captures this fixed private member.
function validatePtrExistingUpdateReceipt(receipt, sourceCommit) {
  exactReceipt(receipt, ['schemaVersion', 'profile', 'binding', 'inspectionDigest',
    'inspectionRecordDigest', 'submissionRecordDigest', 'acknowledgementRecordDigest',
    'completionRecordDigest', 'predecessorDigest', 'predecessorReceiptDigest', 'beforeProgram',
    'preservation', 'planDigest', 'installedPlanDigest', 'inspectionHostObservationDigest',
    'acknowledgement', 'responseDigest', 'submission', 'completionObservedAt', 'continuation']);
  const binding = exactReceipt(receipt.binding, ['sourceCommit', 'databaseIdentity',
    'candidateProgram', 'candidateSha256', 'candidateDescriptionDigest', 'moduleTreeId',
    'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest']);
  // These two subrecords were reopened from updateCanonical storage.
  const preservation = exactReceipt(receipt.preservation, ['addedTables', 'candidateDigest',
    'candidatePreservationDigest', 'classification', 'priorDigest', 'priorPreservationDigest', 'profile']);
  const submission = exactReceipt(receipt.submission, ['observedAt', 'runAttempt', 'runId']);
  const continuation = exactReceipt(receipt.continuation, ['scopeDigest', 'issuedRecordDigest',
    'claimRecordDigest', 'terminalRecordDigest', 'claimRunId', 'claimRunAttempt',
    'terminalRunId', 'terminalRunAttempt', 'outcome', 'observationDigest', 'terminalAt']);
  for (const key of ['databaseIdentity', 'candidateProgram', 'candidateSha256',
    'candidateDescriptionDigest', 'dependencyClosureDigest', 'cliDigest', 'cliConfigDigest']) requireSha(binding[key]);
  requireCommit(binding.moduleTreeId);
  for (const key of ['inspectionDigest', 'inspectionRecordDigest', 'submissionRecordDigest',
    'completionRecordDigest', 'beforeProgram', 'planDigest', 'installedPlanDigest',
    'inspectionHostObservationDigest']) requireSha(receipt[key]);
  for (const key of ['priorDigest', 'candidateDigest', 'priorPreservationDigest', 'candidatePreservationDigest']) requireSha(preservation[key]);
  for (const key of ['scopeDigest', 'issuedRecordDigest', 'claimRecordDigest', 'terminalRecordDigest']) requireSha(continuation[key]);
  for (const key of ['predecessorDigest', 'predecessorReceiptDigest', 'acknowledgementRecordDigest', 'responseDigest']) {
    if (receipt[key] !== null) requireSha(receipt[key]);
  }
  if (continuation.observationDigest !== null) requireSha(continuation.observationDigest);
  const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
  const run = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/u.test(value);
  const attempt = value => Number.isSafeInteger(value) && value > 0 && value <= 1_000;
  if (receipt.schemaVersion !== 1 || receipt.profile !== 'warpkeep-ptr-existing-update-receipt-v1'
    || binding.sourceCommit !== sourceCommit
    || binding.databaseIdentity !== 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e'
    || receipt.beforeProgram === binding.candidateProgram
    || (receipt.predecessorDigest === null) !== (receipt.predecessorReceiptDigest === null)
    || preservation.profile !== 'warpkeep-ptr-raw-v10-stable-row-schema-v1'
    || preservation.candidateDigest !== binding.candidateDescriptionDigest
    || preservation.priorPreservationDigest !== preservation.candidatePreservationDigest
    || !Array.isArray(preservation.addedTables)
    || preservation.addedTables.some(name => typeof name !== 'string' || name.length === 0)
    || JSON.stringify(preservation.addedTables) !== JSON.stringify([...new Set(preservation.addedTables)].sort())
    || preservation.classification !== (preservation.addedTables.length ? 'tables-preserved-with-additions' : 'tables-preserved')
    || !['received', 'not-received'].includes(receipt.acknowledgement)
    || (receipt.acknowledgement === 'received') !== (receipt.acknowledgementRecordDigest !== null)
    || (receipt.acknowledgement === 'received') !== (receipt.responseDigest !== null)
    || !run(submission.runId) || !attempt(submission.runAttempt)
    || continuation.claimRunId !== submission.runId || continuation.claimRunAttempt !== submission.runAttempt
    || !run(continuation.terminalRunId) || !attempt(continuation.terminalRunAttempt)
    || (continuation.outcome === 'completed' && (continuation.terminalRunId !== continuation.claimRunId
      || continuation.terminalRunAttempt !== continuation.claimRunAttempt))
    || !['completed', 'reconciled-effect-applied'].includes(continuation.outcome)
    || (continuation.outcome === 'completed' && continuation.observationDigest !== null)
    || (continuation.outcome === 'reconciled-effect-applied' && continuation.terminalRunId === continuation.claimRunId)
    || (continuation.outcome === 'reconciled-effect-applied' && continuation.observationDigest !== receipt.completionRecordDigest)
    || !iso(submission.observedAt) || !iso(receipt.completionObservedAt) || !iso(continuation.terminalAt)
    || Date.parse(submission.observedAt) > Date.parse(receipt.completionObservedAt)
    || Date.parse(receipt.completionObservedAt) > Date.parse(continuation.terminalAt)
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

function ptrUpdateModuleFacts(receipt) {
  const binding = receipt.binding;
  return { sourceCommit: binding.sourceCommit, databaseIdentity: binding.databaseIdentity,
    moduleSha256: binding.candidateSha256, moduleTreeId: binding.moduleTreeId,
    dependencyClosureDigest: binding.dependencyClosureDigest,
    spacetimeExecutableSha256: binding.cliDigest, spacetimeCliConfigSha256: binding.cliConfigDigest };
}

function validatePtrAtlasImportReceipt(receipt, preparationSourceCommit, atlasSourceCommit = preparationSourceCommit) {
  const body = receiptWithoutDigest(receipt, PTR_IMPORT_RESULT_KEYS, PTR_IMPORT_RECEIPT_KEYS);
  if (
    receipt.importReceiptDigest !== ptrProductionAtlasImportReceiptDigest(body)
    || body.schemaVersion !== 1 || body.profile !== 'warpkeep.ptr.production-import.v1'
    || body.outcome !== 'ready' || !requireSha(body.databaseIdentity)
    || body.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || body.moduleSourceCommit !== preparationSourceCommit || !requireSha(body.moduleSha256)
    || !requireCommit(body.moduleTreeId) || !requireSha(body.dependencyClosureDigest)
    || !requireSha(body.spacetimeExecutableSha256) || body.atlasId !== 'PTR_GREATER_REALM'
    || body.atlasSourceCommit !== atlasSourceCommit || !PUBLIC_RELEASE_ID.test(body.publicReleaseId)
    || !requireSha(body.releaseManifestSha256) || !requireSha(body.expectedReleaseSha256)
    || !requireSha(body.releaseHeaderSha256) || !requireSha(body.verificationDigest)
    || !/^[1-9][0-9]{0,19}$/u.test(body.importEpoch)
    || BigInt(body.importEpoch) > PTR_IMPORT_EPOCH_MAXIMUM
    || !Number.isSafeInteger(body.operationsSubmitted) || body.operationsSubmitted < 1
    || body.operationsSubmitted > PTR_IMPORT_OPERATION_MAXIMUM || !requireSha(body.operationChainDigest)
    || body.zeroPopulationBoundary !== true || body.importsExact !== true || body.ready !== true
    || body.atlasFinalized !== true || body.atlasWritesClosedByFinalization !== true
    || body.importMutationsCompiled !== true || body.activationMutationsCompiled !== false
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

function validatePtrOwnerProvisionReceipt(receipt, preparationSourceCommit) {
  const body = receiptWithoutDigest(
    receipt, PTR_OWNER_PROVISION_RESULT_KEYS, PTR_OWNER_PROVISION_RECEIPT_KEYS,
  );
  if (
    receipt.provisionReceiptDigest !== ptrOwnerProvisionReceiptDigest(body)
    || body.schemaVersion !== 1 || body.profile !== 'warpkeep-ptr-owner-provision-v1'
    || body.outcome !== 'verified' || !requireSha(body.databaseIdentity)
    || body.databaseAlias !== 'warpkeep-ptr' || body.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || body.moduleSourceCommit !== preparationSourceCommit || !requireSha(body.atlasImportReceiptDigest)
    || !requireSha(body.ownerOpaqueProofDigest) || /^0{64}$/u.test(body.ownerOpaqueProofDigest)
    || body.ownerAnchorRows !== 1 || body.ownerProvisioned !== true || body.ownerEnabled !== true
    || body.zeroPopulationBoundary !== true
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

function validatePtrSealedLiveReceipt(receipt, preparationSourceCommit, atlasSourceCommit = preparationSourceCommit) {
  exactReceipt(receipt, PTR_SEALED_LIVE_RECEIPT_KEYS);
  const zeroFields = [
    'allowedFids', 'accessRequests', 'playersV1', 'playersV2', 'ownershipBindings', 'castles',
    'realmProfiles', 'termsAcceptances', 'markAccounts', 'resourceAccounts', 'claimRows',
    'occupancyRows', 'activationRows', 'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
  ];
  if (
    !requireSha(ptrSealedLiveReceiptDigest(receipt))
    || receipt.schemaVersion !== 1 || receipt.profile !== 'warpkeep-ptr-sealed-live-v1'
    || receipt.uri !== 'https://maincloud.spacetimedb.com' || !requireSha(receipt.databaseIdentity)
    || receipt.databaseAlias !== 'warpkeep-ptr' || receipt.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || receipt.moduleSourceCommit !== preparationSourceCommit || !requireSha(receipt.moduleSha256)
    || receipt.releaseVersion !== '0.4.0-ptr.1' || receipt.realmId !== 'PTR'
    || receipt.atlasSourceCommit !== atlasSourceCommit || receipt.atlasId !== 'PTR_GREATER_REALM'
    || !PUBLIC_RELEASE_ID.test(receipt.publicReleaseId) || !requireSha(receipt.releaseManifestSha256)
    || !requireSha(receipt.expectedReleaseSha256) || !requireSha(receipt.releaseHeaderSha256)
    || !requireSha(receipt.verificationDigest) || receipt.atlasState !== 'ready'
    || receipt.atlasFinalized !== true || receipt.atlasImportsExact !== true
    || receipt.atlasWritesClosedByFinalization !== true
    || zeroFields.some(field => receipt[field] !== 0 || Object.is(receipt[field], -0))
    || receipt.atlasImportMutationsCompiled !== true
    || receipt.atlasActivationMutationsCompiled !== false || !requireSha(receipt.ownerOpaqueProofDigest)
    || /^0{64}$/u.test(receipt.ownerOpaqueProofDigest) || receipt.ownerAnchorRows !== 1
    || receipt.ownerProvisioned !== true || receipt.ownerEnabled !== true
    || receipt.admissionsOpen !== false || receipt.accessRequestsOpen !== false
    || receipt.admissionSurfacePresent !== false || receipt.accessRequestSurfacePresent !== false
    || receipt.playerPresentationEnabled !== true
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

/**
 * Records validate a producing member at capture time rather than treating a
 * later descriptor parser as an authenticity boundary. Each case below is a
 * fixed ABI, never a caller-selected schema.
 */
function validateMemberReceipt(member, receipt, preparationSourceCommit, atlasSourceCommit = preparationSourceCommit) {
  try {
    if (member === 'ptrExistingUpdateReceipt') {
      validatePtrExistingUpdateReceipt(receipt, preparationSourceCommit);
      return receipt;
    }
    if (member.startsWith('g001')) {
      validateG001Receipt(member, receipt, preparationSourceCommit);
      return receipt;
    }
    if (member === 'g002PublishReceipt') {
      const body = receiptWithoutDigest(
        receipt, G002_PUBLISH_RESULT_KEYS, G002_PUBLISH_RECEIPT_KEYS,
      );
      if (
        body.sourceCommit !== preparationSourceCommit
        || genesis002PublishReceiptDigest(body) !== receipt.publishReceiptDigest
      ) {
        fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      }
      return receipt;
    }
    if (member === 'g002AtlasImportReceipt') {
      const body = receiptWithoutDigest(
        receipt, G002_IMPORT_RESULT_KEYS, G002_IMPORT_RECEIPT_KEYS,
      );
      if (
        body.moduleSourceCommit !== preparationSourceCommit
        || genesis002ProductionImportReceiptDigest(body) !== receipt.importReceiptDigest
      ) {
        fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      }
      return receipt;
    }
    if (member === 'g002SealedLiveReceipt') {
      exactReceipt(receipt, [
        'schemaVersion', 'profile', 'uri', 'databaseIdentity', 'databaseAlias',
        'moduleIdentity', 'moduleSourceCommit', 'moduleSha256', 'releaseVersion', 'realmId',
        'atlasSourceCommit', 'atlasId', 'publicReleaseId', 'releaseSha256',
        'releaseHeaderSha256', 'verificationDigest', 'atlasState', 'atlasFinalized',
        'atlasImportsExact', 'atlasImportSurfaceCompiled', 'atlasWritesClosedByFinalization',
        'admissionsOpen', 'accessRequestsOpen', 'admittedPlayers', 'founders', 'allowedFids',
        'accessRequests', 'playersV1', 'playersV2', 'ownershipBindings', 'castles',
        'realmProfiles', 'termsAcceptances', 'markAccounts', 'resourceAccounts', 'claimRows',
        'occupancyRows', 'activationRows', 'workerSystemRows', 'activationMutationsEnabled',
        'playerPresentationEnabled', 'admissionNotificationsEnabled',
      ]);
      genesis002SealedLiveReceiptDigest(receipt);
      if (receipt.moduleSourceCommit !== preparationSourceCommit) {
        fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
      }
      return receipt;
    }
    if (member === 'ptrPublishReceipt') {
      validatePtrPublishReceipt(receipt, preparationSourceCommit);
      return receipt;
    }
    if (member === 'ptrAtlasImportReceipt') {
      validatePtrAtlasImportReceipt(receipt, preparationSourceCommit, atlasSourceCommit);
      return receipt;
    }
    if (member === 'ptrOwnerProvisionReceipt') {
      validatePtrOwnerProvisionReceipt(receipt, preparationSourceCommit);
      return receipt;
    }
    if (member === 'ptrSealedLiveReceipt') {
      validatePtrSealedLiveReceipt(receipt, preparationSourceCommit, atlasSourceCommit);
      return receipt;
    }
  } catch (error) {
    if (error instanceof SealedRealmsProductionActivationRecordsError) throw error;
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
  }
  fail('SEALED_REALMS_ACTIVATION_RECORDS_RECEIPT_INVALID');
}

function digest(...parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\n');
  return hash.digest('hex');
}

function receiptPath(member) {
  return `${RECORD_DIRECTORY}/${RECEIPT_BASENAMES[member]}`;
}

function capabilityState(records) {
  const member = recordsCapabilities.get(records);
  if (member === undefined) fail('SEALED_REALMS_ACTIVATION_RECORDS_CAPABILITY_INVALID');
  return member;
}

function parseRecord(bytes, state, expectedMember) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  const keys = [
    'schemaVersion', 'profile', 'member', 'preparationSourceCommit', 'sourceCommit',
    'operation', 'sourceAuthorityDigest', 'bodyDigest', 'receipt', 'semanticDigest',
  ];
  exactInput(value, keys, 'SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  if (
    `${JSON.stringify(value)}\n` !== source
    || value.schemaVersion !== 1
    || value.profile !== RECORD_PROFILE
    || value.member !== expectedMember
    || value.preparationSourceCommit !== state.preparationSourceCommit
    || !COMMIT.test(value.sourceCommit ?? '')
    || value.operation !== PRODUCING_OPERATIONS[expectedMember]
    || !SHA256.test(value.sourceAuthorityDigest ?? '')
    || !SHA256.test(value.bodyDigest ?? '')
    || !SHA256.test(value.semanticDigest ?? '')
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  // Recovery wrappers describe producing operations at S, even when the
  // published module or atlas was built from a separately authenticated source.
  // A self-consistent wrapper from another authority is not this store's record.
  if (state.recoveryRecords && (value.sourceCommit !== state.preparationSourceCommit
    || value.sourceAuthorityDigest !== state.sourceAuthorityDigest)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  let body;
  try {
    body = exactBody(value.receipt);
    if (
      body.byteLength < 2
      || createHash('sha256').update(body).digest('hex') !== value.bodyDigest
    ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    const bodySource = new TextDecoder('utf-8', { fatal: true }).decode(body);
    const receipt = JSON.parse(bodySource);
    if (`${JSON.stringify(receipt)}\n` !== bodySource) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    }
    const realm = expectedMember.startsWith('g002') ? 'g002'
      : expectedMember.startsWith('ptr') ? 'ptr' : null;
    const coordinates = state.recoveryCandidate;
    const moduleSource = state.recoveryRecords && realm
      ? requireCommit(expectedMember === 'ptrExistingUpdateReceipt' ? receipt.binding?.sourceCommit : receipt.sourceCommit ?? receipt.moduleSourceCommit)
      : coordinates && realm
      ? coordinates[`${realm}ModuleSourceCommit`] : state.preparationSourceCommit;
    const atlasSource = state.recoveryRecords && realm
      ? requireCommit(receipt.atlasSourceCommit ?? moduleSource)
      : coordinates && realm
      ? coordinates[`${realm}AtlasSourceCommit`] : state.preparationSourceCommit;
    validateMemberReceipt(expectedMember, receipt, moduleSource, atlasSource);
    if (coordinates && realm && Object.hasOwn(receipt, 'atlasSourceCommit')
      && receipt.atlasSourceCommit !== atlasSource) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    }
    const semantic = digest(
      'warpkeep.sealed-realms.activation-record.v1',
      expectedMember,
      state.preparationSourceCommit,
      value.sourceCommit,
      value.operation,
      value.sourceAuthorityDigest,
      value.bodyDigest,
    );
    if (semantic !== value.semanticDigest) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    }
    return receipt;
  } catch {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  } finally {
    body?.fill(0);
  }
}

function readReceipt(state, member) {
  const bytes = state.privateState.read({ root: 'runtime', relativePath: receiptPath(member) });
  try { return parseRecord(bytes, state, member); } finally { bytes.fill(0); }
}

function fullBindingCandidate(state) {
  let candidate;
  try { candidate = state.readBindingCandidate(state.preparationSourceCommit); } catch {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
  }
  exactInput(candidate, FULL_BINDING_CANDIDATE_KEYS,
    'SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
  if (
    candidate.schemaVersion !== 1
    || candidate.profile !== 'warpkeep-0.4.0-sealed-launch-v1'
    || candidate.pagesDeploymentApproved !== false
    || candidate.preparationSourceCommit !== state.preparationSourceCommit
    || FULL_BINDING_NULL_KEYS.some(key => candidate[key] !== null)
    || FULL_BINDING_FALSE_KEYS.some(key => candidate[key] !== false)
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
  // Reconstruct the sole permitted primitive candidate rather than preserving
  // an arbitrary configuration object. This deliberately keeps the four-key
  // authority projection separate from the descriptor's full fixed schema.
  return Object.freeze(Object.fromEntries(FULL_BINDING_CANDIDATE_KEYS.map(key => [
    key,
    key === 'pagesDeploymentApproved' ? true : candidate[key],
  ])));
}

function ptrSealedLiveDigest(receipt) {
  return createHash('sha256')
    .update('warpkeep.ptr.sealed-live-receipt.v1\n')
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

/**
 * The individual validators above bind each producer ABI before it is stored.
 * Reopening additionally proves the fixed historical graph agrees before any
 * descriptor bytes are assembled. No live infrastructure is consulted here.
 */
function validateReopenedCorpus(state, receipts, verificationTime) {
  let projection;
  try {
    const recovery = state.recoveryRecords || state.recoveryCandidate;
    const derive = recovery ? (verificationTime === undefined ? deriveGenesis001RecoveryLaunchEvidence
      : value => validateGenesis001RecoveryLaunchEvidenceAtTime(value, verificationTime)) : deriveGenesis001SealedLaunchEvidence;
    projection = derive({
      preparationSourceCommit: state.preparationSourceCommit,
      ...(recovery ? {} : { freezePublishReceipt: receipts.g001FreezePublishReceipt }),
      policyObservationBootstrapReceipt: receipts.g001PolicyObservationBootstrapReceipt,
      censusPrivacySafePrivateReceipt: receipts.g001CensusPrivacySafePrivateReceipt,
      admissionMonitorSuspensionReceipt: receipts.g001AdmissionMonitorSuspensionReceipt,
      admissionMonitorCurrentStateReceipt: receipts.g001AdmissionMonitorCurrentStateReceipt,
      admittedPlayerCensusPrivateReceipt: receipts.g001AdmittedPlayerCensusPrivateReceipt,
    });
    if (state.recoveryCandidate && Object.entries(projection)
      .some(([key, value]) => state.recoveryCandidate[key] !== value)) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    }
  } catch {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  const publish = receipts.g002PublishReceipt;
  const imported = receipts.g002AtlasImportReceipt;
  const live = receipts.g002SealedLiveReceipt;
  if (
    publish.databaseIdentity !== imported.databaseIdentity
    || publish.databaseIdentity !== live.databaseIdentity
    || publish.moduleIdentity !== imported.moduleIdentity
    || publish.moduleIdentity !== live.moduleIdentity
    || publish.sourceCommit !== imported.moduleSourceCommit
    || publish.sourceCommit !== live.moduleSourceCommit
    || publish.moduleSha256 !== imported.moduleSha256 || publish.moduleSha256 !== live.moduleSha256
    || publish.moduleTreeId !== imported.moduleTreeId
    || publish.dependencyClosureDigest !== imported.dependencyClosureDigest
    || publish.spacetimeExecutableSha256 !== imported.spacetimeExecutableSha256
    || imported.atlasId !== live.atlasId || imported.atlasSourceCommit !== live.atlasSourceCommit
    || imported.publicReleaseId !== live.publicReleaseId
    || imported.expectedReleaseSha256 !== live.releaseSha256
    || imported.verificationDigest !== live.verificationDigest
    || publish.atlasImportMutationsEnabled !== live.atlasImportSurfaceCompiled
    || publish.atlasActivationMutationsEnabled !== imported.activationMutationsEnabled
    || publish.atlasActivationMutationsEnabled !== live.activationMutationsEnabled
    || publish.playerPresentationEnabled !== imported.playerPresentationEnabled
    || publish.playerPresentationEnabled !== live.playerPresentationEnabled
    || imported.atlasWritesClosedByFinalization !== live.atlasWritesClosedByFinalization
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');

  const update = receipts.ptrExistingUpdateReceipt;
  const ptrPublish = update ? ptrUpdateModuleFacts(update) : receipts.ptrPublishReceipt;
  // Current-S initialization is the supported V3 path. Historical producer
  // coordinates need an authenticated continuity anchor, not rewritten wrappers.
  if (update && (Date.parse(update.continuation.terminalAt) > (verificationTime === undefined ? Date.now() : Date.parse(verificationTime))
    || update.binding.sourceCommit !== state.preparationSourceCommit
    || receipts.ptrAtlasImportReceipt.moduleSourceCommit !== state.preparationSourceCommit
    || receipts.ptrOwnerProvisionReceipt.moduleSourceCommit !== state.preparationSourceCommit)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  const ptrImported = receipts.ptrAtlasImportReceipt;
  const ptrOwner = receipts.ptrOwnerProvisionReceipt;
  const ptrLive = receipts.ptrSealedLiveReceipt;
  const ptrImportDigest = ptrImported.importReceiptDigest;
  if (
    ptrPublish.databaseIdentity !== ptrImported.databaseIdentity
    || ptrPublish.databaseIdentity !== ptrOwner.databaseIdentity
    || ptrPublish.databaseIdentity !== ptrLive.databaseIdentity
    || (!update && ptrPublish.databaseAlias !== ptrOwner.databaseAlias)
    || (!update && ptrPublish.databaseAlias !== ptrLive.databaseAlias)
    || (!update && ptrPublish.moduleIdentity !== ptrImported.moduleIdentity)
    || (!update && ptrPublish.moduleIdentity !== ptrOwner.moduleIdentity)
    || (!update && ptrPublish.moduleIdentity !== ptrLive.moduleIdentity)
    || ptrPublish.sourceCommit !== ptrImported.moduleSourceCommit
    || ptrPublish.sourceCommit !== ptrOwner.moduleSourceCommit
    || ptrPublish.sourceCommit !== ptrLive.moduleSourceCommit
    || ptrPublish.moduleSha256 !== ptrImported.moduleSha256 || ptrPublish.moduleSha256 !== ptrLive.moduleSha256
    || ptrPublish.moduleTreeId !== ptrImported.moduleTreeId
    || ptrPublish.dependencyClosureDigest !== ptrImported.dependencyClosureDigest
    || ptrPublish.spacetimeExecutableSha256 !== ptrImported.spacetimeExecutableSha256
    || ptrImported.atlasSourceCommit !== ptrLive.atlasSourceCommit
    || ptrImported.atlasId !== ptrLive.atlasId || ptrImported.publicReleaseId !== ptrLive.publicReleaseId
    || ptrImported.releaseManifestSha256 !== ptrLive.releaseManifestSha256
    || ptrImported.expectedReleaseSha256 !== ptrLive.expectedReleaseSha256
    || ptrImported.releaseHeaderSha256 !== ptrLive.releaseHeaderSha256
    || ptrImported.verificationDigest !== ptrLive.verificationDigest
    || ptrImported.importsExact !== ptrLive.atlasImportsExact
    || ptrImported.atlasFinalized !== ptrLive.atlasFinalized
    || ptrImported.atlasWritesClosedByFinalization !== ptrLive.atlasWritesClosedByFinalization
    || ptrImported.importMutationsCompiled !== ptrLive.atlasImportMutationsCompiled
    || ptrImported.activationMutationsCompiled !== ptrLive.atlasActivationMutationsCompiled
    || ptrOwner.atlasImportReceiptDigest !== ptrImportDigest
    || ptrOwner.ownerOpaqueProofDigest !== ptrLive.ownerOpaqueProofDigest
    || ptrOwner.ownerAnchorRows !== ptrLive.ownerAnchorRows
    || ptrOwner.ownerProvisioned !== ptrLive.ownerProvisioned
    || ptrOwner.ownerEnabled !== ptrLive.ownerEnabled
    || (!update && ptrPublish.admissionSurfacePresent !== ptrLive.admissionSurfacePresent)
    || (!update && ptrPublish.accessRequestSurfacePresent !== ptrLive.accessRequestSurfacePresent)
  ) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  if (state.recoveryRecords && new Set([
    projection.g001DatabaseIdentity, publish.databaseIdentity, ptrPublish.databaseIdentity,
  ]).size !== 3) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  return projection;
}

/** Creates an opaque fixed-record store bound to one authenticated preparation source. */
export function createSealedRealmsProductionActivationRecords(input) {
  const hasCandidateReader = input !== null && typeof input === 'object'
    && !isProxy(input) && Object.hasOwn(input, 'readBindingCandidate');
  const options = exactInput(input, ['privateState', 'authority',
    ...(hasCandidateReader ? ['readBindingCandidate'] : [])]);
  if (hasCandidateReader && (typeof options.readBindingCandidate !== 'function'
    || isProxy(options.readBindingCandidate))) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  }
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  let preparationSourceCommit;
  try {
    preparationSourceCommit = preparationSourceCommitFromSealedRealmsProductionAuthority(
      options.authority,
    );
  } catch {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  }
  const records = Object.freeze({});
  recordsCapabilities.set(records, Object.freeze({
    privateState,
    preparationSourceCommit,
    sourceCommit: sourceCommitFromSealedRealmsProductionAuthority(options.authority),
    sourceMode: options.authority.mode,
    sourceAuthorityDigest: options.authority.authorityDigest,
    readBindingCandidate: options.readBindingCandidate,
  }));
  return records;
}

export function assertSealedRealmsProductionActivationRecords(records) {
  capabilityState(records);
  return records;
}

/** Checks opaque store ownership; matching source strings alone are insufficient. */
export function assertSealedRealmsProductionActivationRecordsAuthority(input) {
  const options = exactInput(input, ['records', 'privateState', 'authority']);
  const state = capabilityState(options.records);
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  const sourceCommit = preparationSourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (state.privateState !== privateState || state.preparationSourceCommit !== sourceCommit) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_AUTHORITY_INVALID');
  }
  return options.records;
}

/** Only a live adapter-issued completion can create the fixed PTR update record. */
export function writeSealedRealmsProductionPtrExistingUpdateRecord(input) {
  const options = exactInput(input, ['records', 'authority', 'completion']);
  const state = capabilityState(options.records);
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (options.authority.mode !== 'S' || options.authority.operation !== 'ptr-update-apply'
    || state.sourceMode !== 'S' || state.sourceCommit !== sourceCommit
    || state.preparationSourceCommit !== sourceCommit
    || state.sourceAuthorityDigest !== options.authority.authorityDigest) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_AUTHORITY_INVALID');
  }
  const receipt = readPtrExistingUpdateCompletion({
    completion: options.completion, authority: options.authority, privateState: state.privateState,
  });
  const member = 'ptrExistingUpdateReceipt';
  validateMemberReceipt(member, receipt, sourceCommit);
  const body = exactBody(receipt);
  let bytes;
  try {
    const bodyDigest = createHash('sha256').update(body).digest('hex');
    const record = {
      schemaVersion: 1, profile: RECORD_PROFILE, member,
      preparationSourceCommit: sourceCommit, sourceCommit,
      operation: 'ptr-update-apply', sourceAuthorityDigest: options.authority.authorityDigest,
      bodyDigest, receipt,
      semanticDigest: digest('warpkeep.sealed-realms.activation-record.v1', member,
        sourceCommit, sourceCommit, 'ptr-update-apply', options.authority.authorityDigest, bodyDigest),
    };
    bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const target = { root: 'runtime', relativePath: `${RECORD_DIRECTORY}/ptr-existing-update-receipt.json` };
    if (!state.privateState.exists(target)) state.privateState.write({ ...target, bytes });
    const reopened = state.privateState.read(target);
    try {
      if (!reopened.equals(bytes)) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
    } finally { reopened.fill(0); }
    return Object.freeze({ receiptDigest: updateDigest(receipt), recordDigest: createHash('sha256').update(bytes).digest('hex') });
  } finally { body.fill(0); bytes?.fill(0); }
}

function recoveryReceiptProjection(state, receipts, g001) {
  const projection = { preparationSourceCommit: state.preparationSourceCommit, ...g001 };
  const copy = (prefix, source, fields) => {
    for (const field of fields) {
      projection[`${prefix}${field[0].toUpperCase()}${field.slice(1)}`] = source[field];
    }
  };
  for (const realm of ['g002', 'ptr']) {
    const updated = realm === 'ptr' && receipts.ptrExistingUpdateReceipt;
    const published = updated ? ptrUpdateModuleFacts(updated) : receipts[`${realm}PublishReceipt`];
    const live = receipts[`${realm}SealedLiveReceipt`];
    projection[`${realm}ModuleSourceCommit`] = published.sourceCommit;
    copy(realm, published, ['databaseIdentity', 'moduleSha256', 'moduleTreeId',
      'dependencyClosureDigest', 'spacetimeExecutableSha256', 'spacetimeCliConfigSha256',
      ...(updated ? [] : ['freshStatusDigest', 'publishReceiptDigest'])]);
    if (updated) {
      projection.ptrExistingUpdateReceiptDigest = updateDigest(updated);
      projection.ptrExpectedProgramKeccak256 = updated.binding.candidateProgram;
    }
    projection[`${realm}AtlasImportReceiptDigest`] = receipts[`${realm}AtlasImportReceipt`].importReceiptDigest;
    projection[`${realm}SealedLiveReceiptDigest`] = realm === 'g002'
      ? genesis002SealedLiveReceiptDigest(live) : ptrSealedLiveDigest(live);
    copy(realm, live, ['atlasId', 'atlasSourceCommit', 'publicReleaseId',
      'releaseHeaderSha256', 'verificationDigest', 'allowedFids', 'accessRequests',
      'playersV1', 'playersV2', 'ownershipBindings', 'castles', 'realmProfiles',
      'termsAcceptances', 'markAccounts', 'resourceAccounts', 'activationRows',
      'workerSystemRows', 'atlasFinalized', 'atlasWritesClosedByFinalization']);
    projection[`${realm}Claims`] = live.claimRows;
    projection[`${realm}Occupancies`] = live.occupancyRows;
    projection[`${realm}AtlasReady`] = live.atlasState === 'ready';
    projection[`${realm}PresentationEnabled`] = live.playerPresentationEnabled;
  }
  copy('g002', receipts.g002PublishReceipt, ['playerAccessEnabled', 'admissionMutationsEnabled',
    'atlasImportMutationsEnabled', 'atlasActivationMutationsEnabled']);
  copy('g002', receipts.g002SealedLiveReceipt, ['releaseSha256', 'founders']);
  projection.admissionNotificationsEnabled = receipts.g002SealedLiveReceipt.admissionNotificationsEnabled;
  copy('ptr', receipts.ptrSealedLiveReceipt, ['releaseManifestSha256', 'expectedReleaseSha256',
    'releaseVersion', 'publicAtlasRows', 'publicRegionRows', 'atlasImportsExact',
    'atlasImportMutationsCompiled', 'atlasActivationMutationsCompiled', 'ownerAnchorRows',
    'ownerProvisioned', 'ownerEnabled', 'admissionsOpen', 'accessRequestsOpen',
    'admissionSurfacePresent', 'accessRequestSurfacePresent']);
  projection.ptrOwnerProvisionReceiptDigest = receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest;
  // Only scalar binding facts leave this reader: no census bodies, nonces,
  // owner proof, private filenames or source capability are projected.
  return Object.freeze(projection);
}

function readRecoveryReceiptCorpus(records, verificationTime) {
  const original = capabilityState(records);
  if (original.sourceMode !== 'S' || original.sourceCommit !== original.preparationSourceCommit) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_AUTHORITY_INVALID');
  }
  const names = original.privateState.list({ root: 'runtime', relativeDirectory: RECORD_DIRECTORY });
  const version = names.includes(RECEIPT_BASENAMES.ptrExistingUpdateReceipt) ? 3 : 2;
  const members = version === 3 ? RECOVERY_MEMBERS_V3 : RECOVERY_MEMBERS_V2;
  const state = Object.freeze({ ...original, recoveryRecords: true, recoveryVersion: version });
  if (JSON.stringify(names) !== JSON.stringify(members.map(member => RECEIPT_BASENAMES[member]).sort())) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INCOMPLETE');
  }
  const receipts = Object.fromEntries(members.map(member => [member, readReceipt(state, member)]));
  const g001 = validateReopenedCorpus(state, receipts, verificationTime);
  return { state, receipts, projection: recoveryReceiptProjection(state, receipts, g001) };
}

/** Source-bound private-record data only; this projection grants no authority. */
export function readSealedRealmsProductionRecoveryReceiptProjection(records, verificationTime) {
  return readRecoveryReceiptCorpus(records, verificationTime).projection;
}

/** Same reopened corpus, with only the policy producer's immutable Git coordinates. */
export function readSealedRealmsProductionRecoveryCandidateRecords(records, context) {
  if (arguments.length < 1 || arguments.length > 2) fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  let verificationTime;
  if (context !== undefined) {
    const scope = candidateReadContexts.get(context);
    if (scope === undefined || scope.records !== records) fail('SEALED_REALMS_ACTIVATION_RECORDS_READ_CONTEXT_INVALID');
    verificationTime = scope.verificationTime;
    if (verificationTime !== undefined
      && JSON.stringify(readCompletedGenerationBinding(records, verificationTime)) !== JSON.stringify(scope.completion)) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_READ_CONTEXT_INVALID');
    }
  }
  const { receipts, projection } = readRecoveryReceiptCorpus(records, verificationTime);
  const bootstrap = receipts.g001PolicyObservationBootstrapReceipt;
  return Object.freeze({ projection, bootstrap: Object.freeze({
    preparationSourceCommit: bootstrap.protectedCommit,
    preparationSourceTree: bootstrap.moduleTreeId,
    bootstrapBlob: bootstrap.bootstrapBlob,
    bootstrapSha256: bootstrap.bootstrapSha256,
  }) });
}

// Historical candidate reads are data inspection only. Their time must come from
// the exact completed private family, never a timestamp supplied to a candidate.
function readCompletedGenerationBinding(records, verificationTime) {
  const state = capabilityState(records);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  let receiptBytes, descriptorBytes, artifactBytes;
  try {
    const names = state.privateState.list({ root: 'runtime' });
    if (names.some(name => name === 'public.family.lock' || name.startsWith('public.stage.'))
      || JSON.stringify(state.privateState.list({ root: 'runtime', relativeDirectory: 'public' }))
        !== JSON.stringify(['0.4.0-sealed-launch.json', 'activation-generation-receipt.json'])) fail();
    receiptBytes = state.privateState.read({ root: 'runtime', relativePath: 'public/activation-generation-receipt.json' });
    const receipt = parseActivationGenerationReceipt(receiptBytes);
    if (receipt.generatedAt !== verificationTime || Date.parse(receipt.generatedAt) > Date.now()
      || receipt.sourceCommit !== state.preparationSourceCommit
      || receipt.sourceAuthorityDigest !== state.sourceAuthorityDigest || ![2, 3].includes(receipt.artifactSchemaVersion)) fail();
    descriptorBytes = state.privateState.readActivationDescriptor();
    artifactBytes = state.privateState.read({ root: 'runtime', relativePath: 'public/0.4.0-sealed-launch.json' });
    if (receipt.descriptorSha256 !== digest(descriptorBytes) || receipt.artifactSha256 !== digest(artifactBytes)) fail();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(descriptorBytes);
    const envelope = JSON.parse(source);
    if (`${JSON.stringify(envelope, null, 2)}\n` !== source) fail();
    const candidate = validateSealedRealmsProductionRecoveryActivationEvidence(envelope, receipt.generatedAt);
    if (candidate.schemaVersion !== receipt.artifactSchemaVersion
      || candidate.preparationSourceCommit !== state.preparationSourceCommit
      || receipt.activationEvidenceDigest !== candidate.admissionRequestSuspensionReceiptDigest) fail();
    const { receipts } = readRecoveryReceiptCorpus(records, receipt.generatedAt);
    if (Object.entries(receipts).some(([member, value]) =>
      JSON.stringify(value) !== JSON.stringify(envelope[member]))) fail();
    const expected = Buffer.from(`${JSON.stringify(createRecoveryActivationBindingFromCandidate(`${JSON.stringify(candidate, null, 2)}\n`), null, 2)}\n`);
    try { if (!expected.equals(artifactBytes)) fail(); } finally { expected.fill(0); }
    return Object.freeze({ receiptSha256: digest(receiptBytes), descriptorSha256: receipt.descriptorSha256,
      artifactSha256: receipt.artifactSha256 });
  } catch { fail('SEALED_REALMS_ACTIVATION_RECORDS_READ_CONTEXT_INVALID'); }
  finally { receiptBytes?.fill(0); descriptorBytes?.fill(0); artifactBytes?.fill(0); }
}

/** Validates canonical recovery evidence data; this does not mint receipt authority. */
export function validateSealedRealmsProductionRecoveryActivationEvidence(envelope, verificationTime) {
  const version = envelope !== null && typeof envelope === 'object' && !isProxy(envelope)
    ? Object.getOwnPropertyDescriptor(envelope, 'schemaVersion')?.value : undefined;
  const members = version === 3 ? RECOVERY_MEMBERS_V3 : RECOVERY_MEMBERS_V2;
  exactInput(envelope, ['schemaVersion', 'profile', 'bindingCandidate', ...members]);
  canonicalJsonTree(envelope);
  if (![2, 3].includes(version)
    || envelope.profile !== (version === 3 ? RECOVERY_PROFILE_V3 : RECOVERY_PROFILE_V2)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  }
  const candidate = validateRecoveryActivationCandidateDocument(`${JSON.stringify(envelope.bindingCandidate, null, 2)}\n`);
  if (candidate.schemaVersion !== version) fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  const state = Object.freeze({
    preparationSourceCommit: candidate.preparationSourceCommit,
    recoveryCandidate: candidate,
  });
  const receipts = Object.fromEntries(members.map(member => {
    const realm = member.startsWith('g002') ? 'g002' : member.startsWith('ptr') ? 'ptr' : undefined;
    return [member, validateMemberReceipt(member, envelope[member],
      realm === undefined ? state.preparationSourceCommit : candidate[`${realm}ModuleSourceCommit`],
      realm === undefined ? state.preparationSourceCommit : candidate[`${realm}AtlasSourceCommit`])];
  }));
  const g001 = validateReopenedCorpus(state, receipts, verificationTime);
  for (const [key, value] of Object.entries(recoveryReceiptProjection(state, receipts, g001))) {
    if (candidate[key] !== value) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  return candidate;
}

function readRecoveryActivationEnvelope(records, verificationTime) {
  // Reopen the producing corpus before asking for recovery-core/source inputs.
  // The reader can now consume these facts without constructing a candidate to
  // authorize its own receipt coordinates.
  const { state, receipts, projection } = readRecoveryReceiptCorpus(records, verificationTime);
  let candidate;
  const context = Object.freeze({});
  const completion = verificationTime === undefined ? undefined : readCompletedGenerationBinding(records, verificationTime);
  candidateReadContexts.set(context, Object.freeze({ records, verificationTime, completion }));
  try {
    const source = state.readBindingCandidate(state.preparationSourceCommit, projection, context);
    // The recovery reader consumes canonical source bytes, never caller objects/getters.
    if (typeof source !== 'string') fail('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
    candidate = validateRecoveryActivationCandidateDocument(source);
    if (candidate.schemaVersion !== state.recoveryVersion
      || candidate.preparationSourceCommit !== state.preparationSourceCommit) {
      fail('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
    }
  } catch { fail('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID'); }
  finally { candidateReadContexts.delete(context); }
  if (completion !== undefined
    && JSON.stringify(readCompletedGenerationBinding(records, verificationTime)) !== JSON.stringify(completion)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_READ_CONTEXT_INVALID');
  }
  for (const [key, value] of Object.entries(projection)) {
    if (candidate[key] !== value) fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  // Candidate construction must not replace a member while it consumes the
  // snapshot. This comparison retains no credentials or mutation envelope.
  const reopened = readRecoveryReceiptCorpus(records, verificationTime);
  if (JSON.stringify(receipts) !== JSON.stringify(reopened.receipts)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
  }
  return { state, envelope: {
    schemaVersion: state.recoveryVersion,
    profile: state.recoveryVersion === 3 ? RECOVERY_PROFILE_V3 : RECOVERY_PROFILE_V2,
    bindingCandidate: candidate,
    ...receipts,
  } };
}

/** Reopens authentic records without writing or exposing their private bodies. */
export function inspectSealedRealmsProductionRecoveryActivationRecords(records, verificationTime) {
  const { state, envelope } = readRecoveryActivationEnvelope(records, verificationTime);
  validateSealedRealmsProductionRecoveryActivationEvidence(envelope, verificationTime);
  return Object.freeze({
    sourceCommit: state.preparationSourceCommit, schemaVersion: envelope.schemaVersion,
    descriptorSha256: createHash('sha256').update(`${JSON.stringify(envelope, null, 2)}\n`).digest('hex'),
  });
}

/** Recovery-only private input assembly, not a deployment authorization. */
export function writeSealedRealmsProductionRecoveryActivationDescriptor(input) {
  const options = exactInput(input, ['records', 'consumeDescriptor']);
  if (typeof options.consumeDescriptor !== 'function' || isProxy(options.consumeDescriptor)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  }
  const { state, envelope } = readRecoveryActivationEnvelope(options.records);
  validateSealedRealmsProductionRecoveryActivationEvidence(envelope);
  let bytes;
  try {
    bytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    state.privateState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes,
      // Let the private FD owner reject and observe asynchronous results before
      // closing its handle; swallowing the result here loses rejection handling.
      consume: descriptor => options.consumeDescriptor(descriptor),
    });
  } finally { bytes?.fill(0); }
  return Object.freeze({});
}

/**
 * Reopens all thirteen exact receipt records and writes the sole private
 * activation descriptor. The FD is scoped to one synchronous consumer only.
 */
export function writeSealedRealmsProductionActivationDescriptor(input) {
  const options = exactInput(input, ['records', 'consumeDescriptor']);
  if (typeof options.consumeDescriptor !== 'function' || isProxy(options.consumeDescriptor)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INPUT_INVALID');
  }
  const state = capabilityState(options.records);
  // Authenticate and reconstruct the fixed full candidate before inspecting
  // persisted names, so an arbitrary release object cannot become an
  // observable alternate activation path.
  const candidate = fullBindingCandidate(state);
  const names = state.privateState.list({ root: 'runtime', relativeDirectory: RECORD_DIRECTORY });
  const expectedNames = RECEIPT_MEMBERS.map(member => RECEIPT_BASENAMES[member]).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    fail('SEALED_REALMS_ACTIVATION_RECORDS_INCOMPLETE');
  }
  const receipts = Object.fromEntries(RECEIPT_MEMBERS.map(member => [member, readReceipt(state, member)]));
  validateReopenedCorpus(state, receipts);
  let descriptor;
  try {
    descriptor = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      profile: EVIDENCE_PROFILE,
      bindingCandidate: candidate,
      g001FreezePublishReceipt: receipts.g001FreezePublishReceipt,
      g001PolicyObservationBootstrapReceipt: receipts.g001PolicyObservationBootstrapReceipt,
      g001CensusPrivacySafePrivateReceipt: receipts.g001CensusPrivacySafePrivateReceipt,
      g001AdmittedPlayerCensusPrivateReceipt: receipts.g001AdmittedPlayerCensusPrivateReceipt,
      g001AdmissionMonitorSuspensionReceipt: receipts.g001AdmissionMonitorSuspensionReceipt,
      g001AdmissionMonitorCurrentStateReceipt: receipts.g001AdmissionMonitorCurrentStateReceipt,
      authBridgeSuspensionPrivateReceipt: null,
      g002PublishReceipt: receipts.g002PublishReceipt,
      g002AtlasImportReceipt: receipts.g002AtlasImportReceipt,
      g002SealedLiveReceipt: receipts.g002SealedLiveReceipt,
      g002SealedLiveReceiptDigest: genesis002SealedLiveReceiptDigest(
        receipts.g002SealedLiveReceipt,
      ),
      ptrPublishReceipt: receipts.ptrPublishReceipt,
      ptrAtlasImportReceipt: receipts.ptrAtlasImportReceipt,
      ptrOwnerProvisionReceipt: receipts.ptrOwnerProvisionReceipt,
      ptrSealedLiveReceipt: receipts.ptrSealedLiveReceipt,
      ptrSealedLiveReceiptDigest: ptrSealedLiveDigest(receipts.ptrSealedLiveReceipt),
    }, null, 2)}\n`, 'utf8');
    state.privateState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: descriptor,
      consume: descriptorFd => {
        const result = options.consumeDescriptor(descriptorFd);
        if (result !== undefined) {
          fail('SEALED_REALMS_ACTIVATION_RECORDS_CONSUME_INVALID');
        }
        return undefined;
      },
    });
  } finally {
    descriptor?.fill(0);
  }
  return Object.freeze({});
}
