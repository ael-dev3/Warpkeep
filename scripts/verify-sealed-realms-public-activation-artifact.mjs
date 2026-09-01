import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const MINIMUM_ARTIFACT_BYTES = 2;
const MAXIMUM_ARTIFACT_BYTES = 32 * 1_024;
const PROFILE = 'warpkeep-0.4.0-sealed-launch-v1';
const G001_ID =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const G001_SOURCE = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const G001_ABI =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
const G001_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
const G001_FREEZE_DIGEST =
  '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63';
const G001_POLICY_DIGEST =
  'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60';
const ARTIFACT_RELATIVE_PATH = [
  'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime',
  'sealed-realms-v1', 'public', '0.4.0-sealed-launch.json',
];

const BINDING_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'pagesDeploymentApproved',
  'preparationSourceCommit', 'g001DatabaseIdentity',
  'g001SourceBaselineCommit', 'g001BaselineAbiSha256',
  'g001FreezeReleaseNonce', 'g001FreezePublishReceiptDigest',
  'g001FreezePublishReceiptCommitment', 'g001PolicyReceiptDigest',
  'g001PolicyReceiptCommitment',
  'g001PolicyObservationBootstrapReceiptDigest',
  'g001PolicyObservationBootstrapReceiptCommitment',
  'g001PolicySourceCommit', 'g001ReleaseVersion',
  'g001PlayerAccessEnabled', 'g001AdmissionStateMutationsEnabled',
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
  'admissionMonitorDisabled', 'admissionMonitorLoaded',
  'authBridgeSourceCommit', 'admissionRequestSuspensionReceiptDigest',
  'admissionRequestSuspensionReceiptCommitment',
  'g002PublishReceiptDigest', 'g002PublishReceiptCommitment',
  'g002FreshStatusDigest', 'g002FreshStatusCommitment',
  'g002DatabaseIdentity', 'g002ModuleSourceCommit', 'g002ModuleSha256',
  'g002ModuleTreeId', 'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256', 'g002SpacetimeCliConfigSha256',
  'g002AtlasImportReceiptDigest', 'g002AtlasImportReceiptCommitment',
  'g002SealedLiveReceiptDigest', 'g002SealedLiveReceiptCommitment',
  'g002AtlasSourceCommit', 'g002AtlasId', 'g002PublicReleaseId',
  'g002ReleaseSha256', 'g002ReleaseHeaderSha256',
  'g002VerificationDigest', 'g002AllowedFids', 'g002AccessRequests',
  'g002PlayersV1', 'g002PlayersV2', 'g002OwnershipBindings', 'g002Founders',
  'g002Castles', 'g002RealmProfiles', 'g002TermsAcceptances',
  'g002MarkAccounts', 'g002ResourceAccounts', 'g002Claims',
  'g002Occupancies', 'g002ActivationRows', 'g002WorkerSystemRows',
  'g002AtlasReady', 'g002AtlasFinalized',
  'g002AtlasWritesClosedByFinalization', 'g002AtlasImportMutationsEnabled',
  'g002AtlasActivationMutationsEnabled', 'g002PlayerAccessEnabled',
  'g002AdmissionMutationsEnabled', 'ptrPublishReceiptDigest',
  'ptrPublishReceiptCommitment', 'ptrFreshStatusDigest',
  'ptrFreshStatusCommitment', 'ptrAtlasImportReceiptDigest',
  'ptrAtlasImportReceiptCommitment', 'ptrSealedLiveReceiptDigest',
  'ptrSealedLiveReceiptCommitment', 'ptrOwnerProvisionReceiptDigest',
  'ptrOwnerProvisionReceiptCommitment', 'ptrDatabaseIdentity',
  'ptrModuleSourceCommit', 'ptrModuleSha256', 'ptrModuleTreeId',
  'ptrDependencyClosureDigest', 'ptrSpacetimeExecutableSha256',
  'ptrSpacetimeCliConfigSha256', 'ptrAtlasSourceCommit', 'ptrAtlasId',
  'ptrPublicReleaseId', 'ptrReleaseVersion', 'ptrReleaseManifestSha256',
  'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256',
  'ptrVerificationDigest', 'ptrAllowedFids', 'ptrAccessRequests',
  'ptrPlayersV1', 'ptrPlayersV2', 'ptrOwnershipBindings', 'ptrCastles',
  'ptrRealmProfiles', 'ptrTermsAcceptances', 'ptrMarkAccounts',
  'ptrResourceAccounts', 'ptrClaims', 'ptrOccupancies', 'ptrActivationRows',
  'ptrPublicAtlasRows', 'ptrPublicRegionRows', 'ptrWorkerSystemRows',
  'ptrAtlasReady', 'ptrAtlasFinalized', 'ptrAtlasWritesClosedByFinalization',
  'ptrAtlasImportsExact', 'ptrAtlasImportMutationsCompiled',
  'ptrAtlasActivationMutationsCompiled', 'ptrOwnerAnchorRows',
  'ptrOwnerProvisioned', 'ptrOwnerEnabled', 'ptrAdmissionsOpen',
  'ptrAccessRequestsOpen', 'ptrAdmissionSurfacePresent',
  'ptrAccessRequestSurfacePresent', 'g002PresentationEnabled',
  'ptrPresentationEnabled', 'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled',
  'admissionNotificationsEnabled',
]);

const COMMITMENT_DIGESTS = Object.freeze({
  g001FreezePublishReceiptCommitment: 'g001FreezePublishReceiptDigest',
  g001PolicyReceiptCommitment: 'g001PolicyReceiptDigest',
  g001PolicyObservationBootstrapReceiptCommitment:
    'g001PolicyObservationBootstrapReceiptDigest',
  g001CensusPrivacySafeReceiptCommitment:
    'g001CensusPrivacySafeReceiptDigest',
  g001AdmittedPlayerCensusReceiptCommitment:
    'g001AdmittedPlayerCensusReceiptDigest',
  admissionMonitorSuspensionReceiptCommitment:
    'admissionMonitorSuspensionReceiptDigest',
  admissionMonitorCurrentStateReceiptCommitment:
    'admissionMonitorCurrentStateReceiptDigest',
  admissionRequestSuspensionReceiptCommitment:
    'admissionRequestSuspensionReceiptDigest',
  g002PublishReceiptCommitment: 'g002PublishReceiptDigest',
  g002FreshStatusCommitment: 'g002FreshStatusDigest',
  g002AtlasImportReceiptCommitment: 'g002AtlasImportReceiptDigest',
  g002SealedLiveReceiptCommitment: 'g002SealedLiveReceiptDigest',
  ptrPublishReceiptCommitment: 'ptrPublishReceiptDigest',
  ptrFreshStatusCommitment: 'ptrFreshStatusDigest',
  ptrAtlasImportReceiptCommitment: 'ptrAtlasImportReceiptDigest',
  ptrSealedLiveReceiptCommitment: 'ptrSealedLiveReceiptDigest',
  ptrOwnerProvisionReceiptCommitment: 'ptrOwnerProvisionReceiptDigest',
});

const G002_ZERO_KEYS = Object.freeze([
  'g002AllowedFids', 'g002AccessRequests', 'g002PlayersV1', 'g002PlayersV2',
  'g002OwnershipBindings', 'g002Founders', 'g002Castles',
  'g002RealmProfiles', 'g002TermsAcceptances', 'g002MarkAccounts',
  'g002ResourceAccounts', 'g002Claims', 'g002Occupancies',
  'g002ActivationRows', 'g002WorkerSystemRows',
]);
const PTR_ZERO_KEYS = Object.freeze([
  'ptrAllowedFids', 'ptrAccessRequests', 'ptrPlayersV1', 'ptrPlayersV2',
  'ptrOwnershipBindings', 'ptrCastles', 'ptrRealmProfiles',
  'ptrTermsAcceptances', 'ptrMarkAccounts', 'ptrResourceAccounts',
  'ptrClaims', 'ptrOccupancies', 'ptrActivationRows', 'ptrPublicAtlasRows',
  'ptrPublicRegionRows', 'ptrWorkerSystemRows',
]);

export class SealedRealmsPublicActivationArtifactVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsPublicActivationArtifactVerificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsPublicActivationArtifactVerificationError(code);
}

function exactRecord(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== BINDING_KEYS.length
    || Reflect.ownKeys(value).some((key, index) => key !== BINDING_KEYS[index])
  ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_SCHEMA_INVALID');
  return value;
}

function commitment(commitmentKey, binding) {
  const digestKey = COMMITMENT_DIGESTS[commitmentKey];
  if (digestKey === undefined || !SHA256.test(binding[digestKey] ?? '')) {
    fail('SEALED_REALMS_PUBLIC_ACTIVATION_COMMITMENT_INVALID');
  }
  const snapshot = Object.fromEntries(BINDING_KEYS
    .filter(key => !Object.hasOwn(COMMITMENT_DIGESTS, key))
    .map(key => [key, binding[key]]));
  return createHash('sha256')
    .update(`warpkeep.0.4.0.sealed-launch.${commitmentKey}.v1\n`)
    .update(`${JSON.stringify(snapshot)}\n`)
    .digest('hex');
}

function verifyBinding(binding) {
  const digestKeys = BINDING_KEYS.filter(key => (
    key.endsWith('Digest')
    || key.endsWith('Sha256')
    || key.endsWith('Identity')
    || key.endsWith('Nonce')
  ));
  const commitKeys = BINDING_KEYS.filter(key => (
    key.endsWith('SourceCommit') || key.endsWith('TreeId')
  ));
  if (
    binding.schemaVersion !== 1
    || binding.profile !== PROFILE
    || binding.pagesDeploymentApproved !== true
    || digestKeys.some(key => !SHA256.test(binding[key] ?? ''))
    || commitKeys.some(key => !COMMIT.test(binding[key] ?? ''))
    || binding.g001DatabaseIdentity !== G001_ID
    || binding.g001SourceBaselineCommit !== G001_SOURCE
    || binding.g001BaselineAbiSha256 !== G001_ABI
    || binding.g001FreezeReleaseNonce !== G001_NONCE
    || binding.g001FreezePublishReceiptDigest !== G001_FREEZE_DIGEST
    || binding.g001PolicyReceiptDigest !== G001_POLICY_DIGEST
    || binding.g001PolicySourceCommit !== binding.preparationSourceCommit
    || binding.authBridgeSourceCommit !== binding.preparationSourceCommit
    || binding.g001ReleaseVersion !== '0.3.43'
    || binding.g001PlayerAccessEnabled !== true
    || binding.g001AdmissionStateMutationsEnabled !== false
    || binding.g001AccessRequestSubmissionsEnabled !== false
    || binding.g001CensusPrivacySafeReceiptProfile
      !== 'warpkeep-genesis-001-census-export-privacy-safe-v1'
    || binding.g001AdmittedPlayerCensusReceiptProfile
      !== 'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1'
    || binding.admissionMonitorDisabled !== true
    || binding.admissionMonitorLoaded !== false
    || binding.g002DatabaseIdentity === G001_ID
    || binding.g002ModuleSourceCommit !== binding.preparationSourceCommit
    || binding.g002AtlasSourceCommit !== binding.preparationSourceCommit
    || binding.g002AtlasId !== 'GENESIS_002_GREATER_REALM'
    || !PUBLIC_RELEASE_ID.test(binding.g002PublicReleaseId ?? '')
    || G002_ZERO_KEYS.some(key => binding[key] !== 0)
    || binding.g002AtlasReady !== true
    || binding.g002AtlasFinalized !== true
    || binding.g002AtlasWritesClosedByFinalization !== true
    || binding.g002AtlasImportMutationsEnabled !== true
    || binding.g002AtlasActivationMutationsEnabled !== false
    || binding.g002PlayerAccessEnabled !== false
    || binding.g002AdmissionMutationsEnabled !== false
    || binding.ptrDatabaseIdentity === G001_ID
    || binding.ptrDatabaseIdentity === binding.g002DatabaseIdentity
    || binding.ptrModuleSourceCommit !== binding.preparationSourceCommit
    || binding.ptrAtlasSourceCommit !== binding.preparationSourceCommit
    || binding.ptrAtlasId !== 'PTR_GREATER_REALM'
    || !PUBLIC_RELEASE_ID.test(binding.ptrPublicReleaseId ?? '')
    || binding.ptrReleaseVersion !== '0.4.0-ptr.1'
    || PTR_ZERO_KEYS.some(key => binding[key] !== 0)
    || binding.ptrAtlasReady !== true
    || binding.ptrAtlasFinalized !== true
    || binding.ptrAtlasWritesClosedByFinalization !== true
    || binding.ptrAtlasImportsExact !== true
    || binding.ptrAtlasImportMutationsCompiled !== true
    || binding.ptrAtlasActivationMutationsCompiled !== false
    || binding.ptrOwnerAnchorRows !== 1
    || binding.ptrOwnerProvisioned !== true
    || binding.ptrOwnerEnabled !== true
    || binding.ptrAdmissionsOpen !== false
    || binding.ptrAccessRequestsOpen !== false
    || binding.ptrAdmissionSurfacePresent !== false
    || binding.ptrAccessRequestSurfacePresent !== false
    || binding.g002PresentationEnabled !== false
    || binding.ptrPresentationEnabled !== true
    || binding.legacyGreaterRealmClientPresentationEnabled !== false
    || binding.legacyGreaterRealmServerPresentationEnabled !== false
    || binding.admissionNotificationsEnabled !== false
  ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_BINDING_INVALID');
  if (Object.keys(COMMITMENT_DIGESTS).length !== 17) fail(
    'SEALED_REALMS_PUBLIC_ACTIVATION_COMMITMENT_INVALID',
  );
  for (const commitmentKey of Object.keys(COMMITMENT_DIGESTS)) {
    if (
      !SHA256.test(binding[commitmentKey] ?? '')
      || binding[commitmentKey] !== commitment(commitmentKey, binding)
    ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_COMMITMENT_INVALID');
  }
}

function readFixedArtifactBytes() {
  if (typeof process.getuid !== 'function') {
    fail('SEALED_REALMS_PUBLIC_ACTIVATION_PLATFORM_UNSUPPORTED');
  }
  const path = resolve(homedir(), ...ARTIFACT_RELATIVE_PATH);
  const before = lstatSync(path, { bigint: true });
  const uid = BigInt(process.getuid());
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || before.uid !== uid
    || (before.mode & 0o777n) !== 0o600n
  ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_FILE_UNSAFE');
  if (
    before.size < BigInt(MINIMUM_ARTIFACT_BYTES)
    || before.size > BigInt(MAXIMUM_ARTIFACT_BYTES)
  ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_FILE_SIZE_INVALID');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (
      !opened.isFile()
      || opened.nlink !== 1n
      || opened.uid !== uid
      || (opened.mode & 0o777n) !== 0o600n
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.size !== before.size
      || opened.mtimeNs !== before.mtimeNs
      || opened.ctimeNs !== before.ctimeNs
      || opened.size < BigInt(MINIMUM_ARTIFACT_BYTES)
      || opened.size > BigInt(MAXIMUM_ARTIFACT_BYTES)
    ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_FILE_SIZE_INVALID');
    const allocation = Buffer.alloc(MAXIMUM_ARTIFACT_BYTES + 1);
    const byteLength = readSync(fd, allocation, 0, allocation.byteLength, 0);
    const bytes = allocation.subarray(0, byteLength);
    const after = fstatSync(fd, { bigint: true });
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.mode !== opened.mode
      || after.uid !== opened.uid
      || after.nlink !== opened.nlink
      || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs
      || bytes.byteLength !== Number(opened.size)
    ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_FILE_CHANGED');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export function verifySealedRealmsPublicActivationArtifact() {
  if (arguments.length !== 0) {
    fail('SEALED_REALMS_PUBLIC_ACTIVATION_ARGUMENT_INVALID');
  }
  const bytes = readFixedArtifactBytes();
  let source;
  let binding;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    binding = exactRecord(JSON.parse(source));
  } catch (error) {
    if (error instanceof SealedRealmsPublicActivationArtifactVerificationError) {
      throw error;
    }
    return fail('SEALED_REALMS_PUBLIC_ACTIVATION_SCHEMA_INVALID');
  }
  if (
    !Buffer.from(source, 'utf8').equals(bytes)
    || `${JSON.stringify(binding, null, 2)}\n` !== source
  ) fail('SEALED_REALMS_PUBLIC_ACTIVATION_NONCANONICAL');
  verifyBinding(binding);
  return bytes;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(verifySealedRealmsPublicActivationArtifact());
}
