import { RECOVERY_BINDING_KEYS_V2, parseRecoveryBindingDocumentV2,
  recoveryReceiptCommitmentV2, recoveryAuthorizationCoreSha256 } from './recovery-binding-projection.mjs';

const fixed = Object.freeze({
  schemaVersion: 2,
  profile: 'warpkeep-0.4.0-sealed-launch-v2',
  authorizationMode: 'recovery-authorization-v1',
  recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
  recoveryKeyId: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  recoveryKeyThumbprint: 'jJpfIbYjQL5LxwND5zk1MUOqN1B3vOh_ydTAOoUnuR8',
  recoveryRepository: 'ael-dev3/Warpkeep',
  recoveryRepositoryId: '1273513252', recoveryRepositoryOwnerId: '183124839',
  recoveryRef: 'refs/heads/main',
  recoveryWorkflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
  recoveryEnvironment: 'github-pages', recoveryReleaseVersion: '0.4.0',
  recoveryOperation: 'github-pages-production-deploy',
  recoveryCanonicalOrigin: 'https://warpkeep.com', recoveryIssuer: 'https://release-auth.warpkeep.com',
  recoveryAuthWorker: 'warpkeep-auth-bridge',
  recoveryAuthWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
  sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
  g001DatabaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  g001SourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
  g001BaselineAbiSha256: 'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03',
  g001FreezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
  g001PolicyReceiptDigest: 'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60',
  g001ReleaseVersion: '0.3.43', ptrReleaseVersion: '0.4.0-ptr.1',
  g001CensusPrivacySafeReceiptProfile: 'warpkeep-genesis-001-census-export-privacy-safe-v1',
  g001AdmittedPlayerCensusReceiptProfile: 'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
  g002AtlasId: 'GENESIS_002_GREATER_REALM', ptrAtlasId: 'PTR_GREATER_REALM',
  ptrOwnerAnchorRows: 1,
});
const trueKeys = new Set([
  'pagesDeploymentApproved', 'g001PlayerAccessEnabled', 'admissionMonitorDisabled',
  'g002AtlasReady', 'g002AtlasFinalized', 'g002AtlasWritesClosedByFinalization',
  'g002AtlasImportMutationsEnabled', 'ptrAtlasReady', 'ptrAtlasFinalized',
  'ptrAtlasWritesClosedByFinalization', 'ptrAtlasImportsExact', 'ptrAtlasImportMutationsCompiled',
  'ptrOwnerProvisioned', 'ptrOwnerEnabled', 'ptrPresentationEnabled',
]);
const falseKeys = new Set([
  'g001AdmissionStateMutationsEnabled', 'g001AccessRequestSubmissionsEnabled', 'admissionMonitorLoaded',
  'g002AtlasActivationMutationsEnabled', 'g002PlayerAccessEnabled',
  'g002AdmissionMutationsEnabled', 'ptrAtlasActivationMutationsCompiled',
  'ptrAdmissionsOpen', 'ptrAccessRequestsOpen', 'ptrAdmissionSurfacePresent',
  'ptrAccessRequestSurfacePresent', 'g002PresentationEnabled',
  'legacyGreaterRealmClientPresentationEnabled', 'legacyGreaterRealmServerPresentationEnabled',
  'admissionNotificationsEnabled',
]);
const zeroKeys = new Set([
  'g002AllowedFids', 'g002AccessRequests', 'g002PlayersV1', 'g002PlayersV2', 'g002OwnershipBindings',
  'g002Founders', 'g002Castles', 'g002RealmProfiles', 'g002TermsAcceptances', 'g002MarkAccounts',
  'g002ResourceAccounts', 'g002Claims', 'g002Occupancies', 'g002ActivationRows', 'g002WorkerSystemRows',
  'ptrAllowedFids', 'ptrAccessRequests', 'ptrPlayersV1', 'ptrPlayersV2', 'ptrOwnershipBindings',
  'ptrCastles', 'ptrRealmProfiles', 'ptrTermsAcceptances', 'ptrMarkAccounts', 'ptrResourceAccounts',
  'ptrClaims', 'ptrOccupancies', 'ptrActivationRows', 'ptrPublicAtlasRows', 'ptrPublicRegionRows', 'ptrWorkerSystemRows',
]);
function fail() { throw new Error('RECOVERY_ACTIVATION_CANDIDATE_INVALID'); }
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);

/** Static candidate consistency only. Does not authenticate receipt/source data or authorize deployment. */
export function validateRecoveryActivationCandidate(source) {
  const binding = parseRecoveryBindingDocumentV2(source);
  for (const [key, value] of Object.entries(binding)) {
    let valid;
    if (Object.hasOwn(fixed, key)) valid = value === fixed[key];
    else if (trueKeys.has(key)) valid = value === true;
    else if (falseKeys.has(key)) valid = value === false;
    else if (zeroKeys.has(key)) valid = value === 0;
    else if (key.endsWith('Commitment') || key === 'recoveryAuthorizationCoreSha256'
      || key === 'g001FreezePublishReceiptDigest') valid = value === null;
    else if (['recoveryAuthorizationEpoch', 'recoveryAuthWorkerConfigEpoch'].includes(key))
      valid = Number.isSafeInteger(value) && value > 0;
    else if (['recoveryAuthorizationRequestId', 'recoveryAuthWorkerVersionId'].includes(key)) valid = uuid(value);
    else if (/PublicApprovalReceiptId$/u.test(key)) valid = typeof value === 'string' && /^GRA-[A-Z2-7]{26}$/u.test(value);
    else if (/PublicReleaseId$/u.test(key)) valid = typeof value === 'string' && /^GRR-[A-Z2-7]{26}$/u.test(value);
    else if (/(?:Commit|Tree|TreeId)$/u.test(key)) valid = hex(value, 40);
    else if (/(?:Sha256|Digest|Keccak256|ConfigIdentity|DatabaseIdentity)$/u.test(key)) valid = hex(value, 64);
    else valid = false;
    if (!valid) fail();
  }
  if (new Set([binding.g001DatabaseIdentity, binding.g002DatabaseIdentity, binding.ptrDatabaseIdentity]).size !== 3) fail();
  if (binding.g001PolicySourceCommit !== binding.preparationSourceCommit
    || binding.authBridgeSourceCommit !== binding.preparationSourceCommit) fail();
  return binding;
}

const receiptKeys = RECOVERY_BINDING_KEYS_V2.filter(key => key.endsWith('Commitment')
  && key !== 'g001FreezePublishReceiptCommitment');

/** Generate static commitments only. Does not install, sign, or authenticate the source evidence. */
export function createRecoveryActivationBinding(source) {
  const binding = { ...validateRecoveryActivationCandidate(source) };
  for (const key of receiptKeys) binding[key] = recoveryReceiptCommitmentV2(key, binding);
  binding.recoveryAuthorizationCoreSha256 = recoveryAuthorizationCoreSha256(binding);
  return Object.freeze(binding);
}

/** Validate static semantics and hash consistency, not receipt authenticity or live deployment authority. */
export function parseRecoveryBindingV2(source) {
  const binding = parseRecoveryBindingDocumentV2(source);
  const candidate = { ...binding, recoveryAuthorizationCoreSha256: null };
  for (const key of receiptKeys) candidate[key] = null;
  validateRecoveryActivationCandidate(`${JSON.stringify(candidate, null, 2)}\n`);
  for (const key of receiptKeys) {
    if (!hex(binding[key], 64) || binding[key] !== recoveryReceiptCommitmentV2(key, binding)) fail();
  }
  if (!hex(binding.recoveryAuthorizationCoreSha256, 64)
    || binding.recoveryAuthorizationCoreSha256 !== recoveryAuthorizationCoreSha256(binding)) fail();
  return binding;
}
