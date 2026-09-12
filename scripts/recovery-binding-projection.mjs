// Fixed versioned wire fields mirrored from the recovery receiver; no runtime Worker dependency.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
const V1_AFTER_PREPARATION = [
  'g001DatabaseIdentity', 'g001ExpectedProgramKeccak256',
  'g001SourceBaselineCommit', 'g001BaselineAbiSha256',
  'g001FreezeReleaseNonce', 'g001FreezePublishReceiptDigest',
  'g001FreezePublishReceiptCommitment', 'g001PolicyReceiptDigest',
  'g001PolicyReceiptCommitment', 'g001PolicyObservationBootstrapReceiptDigest',
  'g001PolicyObservationBootstrapReceiptCommitment', 'g001PolicySourceCommit',
  'g001ReleaseVersion', 'g001PlayerAccessEnabled',
  'g001AdmissionStateMutationsEnabled', 'g001AccessRequestSubmissionsEnabled',
  'g001CensusPrivacySafeReceiptProfile', 'g001CensusPrivacySafeReceiptDigest',
  'g001CensusPrivacySafeReceiptCommitment',
  'g001AdmittedPlayerCensusReceiptProfile',
  'g001AdmittedPlayerCensusReceiptDigest',
  'g001AdmittedPlayerCensusReceiptCommitment',
  'admissionMonitorSuspensionReceiptDigest',
  'admissionMonitorSuspensionReceiptCommitment',
  'admissionMonitorCurrentStateReceiptDigest',
  'admissionMonitorCurrentStateReceiptCommitment', 'admissionMonitorDisabled',
  'admissionMonitorLoaded', 'authBridgeSourceCommit',
  'admissionRequestSuspensionReceiptDigest',
  'admissionRequestSuspensionReceiptCommitment', 'g002PublishReceiptDigest',
  'g002PublishReceiptCommitment', 'g002FreshStatusDigest',
  'g002FreshStatusCommitment', 'g002DatabaseIdentity',
  'g002ExpectedProgramKeccak256', 'g002ModuleSourceCommit',
  'g002ModuleSha256', 'g002ModuleTreeId', 'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256', 'g002SpacetimeCliConfigSha256',
  'g002AtlasImportReceiptDigest', 'g002AtlasImportReceiptCommitment',
  'g002SealedLiveReceiptDigest', 'g002SealedLiveReceiptCommitment',
  'g002AtlasSourceCommit', 'g002AtlasId', 'g002PublicReleaseId',
  'g002PublicApprovalReceiptId',
  'g002ReleaseSha256', 'g002ReleaseHeaderSha256', 'g002VerificationDigest',
  'g002AllowedFids', 'g002AccessRequests', 'g002PlayersV1', 'g002PlayersV2',
  'g002OwnershipBindings', 'g002Founders', 'g002Castles', 'g002RealmProfiles',
  'g002TermsAcceptances', 'g002MarkAccounts', 'g002ResourceAccounts',
  'g002Claims', 'g002Occupancies', 'g002ActivationRows', 'g002WorkerSystemRows',
  'g002AtlasReady', 'g002AtlasFinalized', 'g002AtlasWritesClosedByFinalization',
  'g002AtlasImportMutationsEnabled', 'g002AtlasActivationMutationsEnabled',
  'g002PlayerAccessEnabled',
  'g002AdmissionMutationsEnabled',
  'ptrPublishReceiptDigest', 'ptrPublishReceiptCommitment',
  'ptrFreshStatusDigest', 'ptrFreshStatusCommitment',
  'ptrAtlasImportReceiptDigest', 'ptrAtlasImportReceiptCommitment',
  'ptrSealedLiveReceiptDigest', 'ptrSealedLiveReceiptCommitment',
  'ptrOwnerProvisionReceiptDigest', 'ptrOwnerProvisionReceiptCommitment',
  'ptrDatabaseIdentity', 'ptrExpectedProgramKeccak256',
  'ptrModuleSourceCommit', 'ptrModuleSha256',
  'ptrModuleTreeId', 'ptrDependencyClosureDigest', 'ptrSpacetimeExecutableSha256',
  'ptrSpacetimeCliConfigSha256', 'ptrAtlasSourceCommit', 'ptrAtlasId',
  'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId', 'ptrReleaseVersion',
  'ptrReleaseManifestSha256',
  'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
  'ptrAllowedFids', 'ptrAccessRequests', 'ptrPlayersV1', 'ptrPlayersV2',
  'ptrOwnershipBindings', 'ptrCastles', 'ptrRealmProfiles', 'ptrTermsAcceptances',
  'ptrMarkAccounts', 'ptrResourceAccounts', 'ptrClaims', 'ptrOccupancies',
  'ptrActivationRows', 'ptrPublicAtlasRows', 'ptrPublicRegionRows',
  'ptrWorkerSystemRows', 'ptrAtlasReady', 'ptrAtlasFinalized',
  'ptrAtlasWritesClosedByFinalization', 'ptrAtlasImportsExact',
  'ptrAtlasImportMutationsCompiled', 'ptrAtlasActivationMutationsCompiled',
  'ptrOwnerAnchorRows', 'ptrOwnerProvisioned', 'ptrOwnerEnabled',
  'ptrAdmissionsOpen', 'ptrAccessRequestsOpen', 'ptrAdmissionSurfacePresent',
  'ptrAccessRequestSurfacePresent', 'g002PresentationEnabled',
  'ptrPresentationEnabled', 'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled', 'admissionNotificationsEnabled',
]

const BINDING_KEYS = [
  'schemaVersion', 'profile', 'authorizationMode', 'recoveryAuthorizationProfile',
  'recoveryAuthorizationRequestId', 'recoveryAuthorizationCoreSha256',
  'recoveryKeyId', 'recoveryKeyThumbprint', 'recoveryAuthorizationEpoch',
  'recoveryRepository', 'recoveryRepositoryId', 'recoveryRepositoryOwnerId',
  'recoveryRef', 'recoveryWorkflowRef', 'recoveryEnvironment',
  'recoveryReleaseVersion', 'recoveryOperation', 'recoveryCanonicalOrigin',
  'recoveryIssuer', 'recoveryAuthWorker', 'recoveryAuthWorkerVersion',
  'recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit',
  'recoveryAuthWorkerConfigIdentity', 'recoveryAuthWorkerConfigEpoch',
  'sourceClosureProfile',
  'sourceClosureSha256', 'pagesDeploymentApproved', 'preparationSourceCommit',
  'preparationSourceTree', ...V1_AFTER_PREPARATION,
]

const RECEIPT_COMMITMENTS = Object.freeze({
  g001PolicyReceiptCommitment: 'g001PolicyReceiptDigest',
  g001PolicyObservationBootstrapReceiptCommitment: 'g001PolicyObservationBootstrapReceiptDigest',
  g001CensusPrivacySafeReceiptCommitment: 'g001CensusPrivacySafeReceiptDigest',
  g001AdmittedPlayerCensusReceiptCommitment: 'g001AdmittedPlayerCensusReceiptDigest',
  admissionMonitorSuspensionReceiptCommitment: 'admissionMonitorSuspensionReceiptDigest',
  admissionMonitorCurrentStateReceiptCommitment: 'admissionMonitorCurrentStateReceiptDigest',
  admissionRequestSuspensionReceiptCommitment: 'admissionRequestSuspensionReceiptDigest',
  g002PublishReceiptCommitment: 'g002PublishReceiptDigest',
  g002FreshStatusCommitment: 'g002FreshStatusDigest',
  g002AtlasImportReceiptCommitment: 'g002AtlasImportReceiptDigest',
  g002SealedLiveReceiptCommitment: 'g002SealedLiveReceiptDigest',
  ptrPublishReceiptCommitment: 'ptrPublishReceiptDigest',
  ptrFreshStatusCommitment: 'ptrFreshStatusDigest',
  ptrAtlasImportReceiptCommitment: 'ptrAtlasImportReceiptDigest',
  ptrSealedLiveReceiptCommitment: 'ptrSealedLiveReceiptDigest',
  ptrOwnerProvisionReceiptCommitment: 'ptrOwnerProvisionReceiptDigest',
})

export const RECOVERY_BINDING_KEYS_V2 = Object.freeze([...BINDING_KEYS]);
const commitmentKeys = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(RECEIPT_COMMITMENTS)]);
function fail() { throw new Error('RECOVERY_BINDING_PROJECTION_INVALID'); }
function snapshot(input, keys = BINDING_KEYS) {
  if (types.isProxy(input) || !input || typeof input !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail();
  return Object.fromEntries(keys.map(key => {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    const value = descriptor.value;
    if (!(value === null || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0))
        || (typeof value === 'string' && value.length <= 4096 && !/[^\x20-\x7e]/u.test(value)))) fail();
    return [key, value];
  }));
}
function digest(domain, keys, binding) {
  const projection = Object.fromEntries(keys.map(key => [key,
    key === 'recoveryAuthorizationCoreSha256' ? null : binding[key]]));
  const domainBytes = Buffer.from(`warpkeep-recovery-v1:${domain}:`);
  const body = Buffer.from(JSON.stringify(projection));
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32BE(domainBytes.length);
  const bodyLength = Buffer.alloc(8);
  bodyLength.writeBigUInt64BE(BigInt(body.length));
  return createHash('sha256').update(domainLength).update(domainBytes)
    .update(bodyLength).update(body).digest('hex');
}
/** Data projection only: semantic binding validation and deployment authority are separate. */
export function recoveryReceiptCommitmentV2(commitmentKey, input) {
  if (typeof commitmentKey !== 'string' || !Object.hasOwn(RECEIPT_COMMITMENTS, commitmentKey)) fail();
  return digest(`warpkeep.0.4.0.recovery-sealed-launch.${commitmentKey}.v2\n`,
    BINDING_KEYS.filter(key => !commitmentKeys.has(key)), snapshot(input));
}
/** Data projection only; never treats the supplied fields as authenticated evidence. */
export function recoveryAuthorizationCoreSha256(input) {
  return digest('warpkeep.0.4.0.recovery-authorization-core.v1\n', BINDING_KEYS, snapshot(input));
}

/** Canonical document decoding only. All release semantics still require validation. */
export function parseRecoveryBindingDocumentV2(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) fail();
  let parsed;
  try { parsed = JSON.parse(source); } catch { fail(); }
  const captured = snapshot(parsed);
  if (`${JSON.stringify(captured, null, 2)}\n` !== source) fail();
  return Object.freeze(captured);
}

const freshPtrKeys = new Set(['ptrPublishReceiptDigest', 'ptrPublishReceiptCommitment',
  'ptrFreshStatusDigest', 'ptrFreshStatusCommitment']);
export const RECOVERY_BINDING_KEYS_V3 = Object.freeze(BINDING_KEYS.flatMap(key =>
  key === 'ptrPublishReceiptDigest' ? ['ptrExistingUpdateReceiptDigest', 'ptrExistingUpdateReceiptCommitment']
    : freshPtrKeys.has(key) ? [] : [key]));
const receiptCommitmentsV3 = new Set(Object.keys(RECEIPT_COMMITMENTS).flatMap(key =>
  key === 'ptrPublishReceiptCommitment' ? ['ptrExistingUpdateReceiptCommitment']
    : key === 'ptrFreshStatusCommitment' ? [] : [key]));
const commitmentKeysV3 = new Set(['g001FreezePublishReceiptCommitment', ...receiptCommitmentsV3]);
const profiles = Object.freeze({ 2: 'warpkeep-0.4.0-sealed-launch-v2', 3: 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' });

function bindingVersion(input) {
  if (types.isProxy(input) || !input || typeof input !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of ['schemaVersion', 'profile']) {
    if (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value')) fail();
  }
  const version = descriptors.schemaVersion.value;
  if ((version !== 2 && version !== 3) || descriptors.profile.value !== profiles[version]) fail();
  return version;
}
export function recoveryBindingKeys(version) {
  if (version !== 2 && version !== 3) fail();
  return version === 2 ? RECOVERY_BINDING_KEYS_V2 : RECOVERY_BINDING_KEYS_V3;
}
function snapshotV3(input) {
  if (bindingVersion(input) !== 3) fail();
  return snapshot(input, RECOVERY_BINDING_KEYS_V3);
}
/** Hash projection only; no receipt authenticity or deployment authority. */
export function recoveryReceiptCommitmentV3(commitmentKey, input) {
  if (typeof commitmentKey !== 'string' || !receiptCommitmentsV3.has(commitmentKey)) fail();
  return digest(`warpkeep.0.4.0.recovery-sealed-launch.${commitmentKey}.v3\n`,
    RECOVERY_BINDING_KEYS_V3.filter(key => !commitmentKeysV3.has(key)), snapshotV3(input));
}
export function recoveryReceiptCommitment(commitmentKey, input) {
  return bindingVersion(input) === 2 ? recoveryReceiptCommitmentV2(commitmentKey, input)
    : recoveryReceiptCommitmentV3(commitmentKey, input);
}
export function recoveryAuthorizationCoreSha256V3(input) {
  return digest('warpkeep.0.4.0.recovery-authorization-core.v3\n', RECOVERY_BINDING_KEYS_V3, snapshotV3(input));
}
export function recoveryAuthorizationCoreSha256ForBinding(input) {
  return bindingVersion(input) === 2 ? recoveryAuthorizationCoreSha256(input) : recoveryAuthorizationCoreSha256V3(input);
}
function decode(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) fail();
  try { return JSON.parse(source); } catch { fail(); }
}
/** Canonical V3 wire decoding only; semantic policy and authority are separate. */
export function parseRecoveryBindingDocumentV3(source) {
  const captured = snapshotV3(decode(source));
  if (`${JSON.stringify(captured, null, 2)}\n` !== source) fail();
  return Object.freeze(captured);
}
/** Explicit version dispatch; never falls back from an invalid V3 document. */
export function parseRecoveryBindingDocument(source) {
  return bindingVersion(decode(source)) === 2 ? parseRecoveryBindingDocumentV2(source) : parseRecoveryBindingDocumentV3(source);
}
