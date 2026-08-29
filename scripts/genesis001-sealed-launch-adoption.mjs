import { createHash } from 'node:crypto';

export const GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT =
  'd945256b217fa13ade944b9ed9880e8463b46123';
export const GENESIS_001_FREEZE_PUBLISH_RECEIPT_BASENAME =
  'genesis-001-freeze-publish-1d362519-2d42-4758-bf6d-194e0628f2ea.json';
export const GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256 =
  '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63';

export const GENESIS_001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
export const GENESIS_001_SOURCE_BASELINE_COMMIT =
  '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const GENESIS_001_BASELINE_ABI_SHA256 =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
export const GENESIS_001_FREEZE_RELEASE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
export const GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE =
  'warpkeep-genesis-001-census-export-privacy-safe-v1';
export const GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE =
  'warpkeep-genesis-001-live-policy-observation-v1';
export const GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_PROFILE =
  'warpkeep-greater-realm-production-bootstrap-v1';
export const GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE =
  'warpkeep-genesis001-admission-monitor-current-state-v1';

const FREEZE_RECEIPT_PROFILE =
  'warpkeep-genesis-001-freeze-publish-final-receipt-v2';
const BUILD_PROVENANCE_PROFILE =
  'warpkeep-genesis-001-frozen-build-provenance-v2';
const DEPENDENCY_INSTALLER_PROFILE =
  'warpkeep-genesis-001-historical-root-dependency-closure-v1';
const CENSUS_PRIVATE_RECEIPT_PROFILE =
  'warpkeep-genesis-001-census-export-private-proof-v1';
const CENSUS_PROOF_DOMAIN =
  'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1\n';
const MONITOR_PROFILE =
  'warpkeep-genesis001-admission-monitor-suspension-v1';
const POLICY_OBSERVATION_BOOTSTRAP_LINK_DOMAIN =
  'warpkeep-production-g001-policy-observation-bootstrap-link-v1';
const POLICY_OBSERVATION_BOOTSTRAP_RECEIPT_DIGEST_DOMAIN =
  'warpkeep.genesis-001.policy-observation-bootstrap-receipt.v1\n';
const MONITOR_CURRENT_STATE_RECEIPT_DIGEST_DOMAIN =
  'warpkeep.genesis-001.admission-monitor-current-state-receipt.v1\n';
const MAXIMUM_MONITOR_CURRENT_STATE_AGE_MS = 5 * 60 * 1_000;
const MINIMUM_STABLE_CENSUS_SEPARATION_MS = 60 * 1_000;
const MAXIMUM_STABLE_CENSUS_SEPARATION_MS = 5 * 60 * 1_000;
const MAXIMUM_POLICY_TO_FIRST_CENSUS_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_POLICY_OBSERVATION_AGE_MS = 10 * 60 * 1_000;
const MONITOR_LABEL = 'com.warpkeep.hermes-admission-monitor';
const MONITOR_PLIST_SHA256 =
  'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf';
const MONITOR_PROGRAM_SHA256 =
  '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6';
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const CENSUS_BASENAME =
  /^warpkeep-access-request-census-[0-9]{8}T[0-9]{6}Z\.txt$/u;
const FREEZE_RECEIPT_BASENAME =
  /^genesis-001-freeze-publish-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u;
const MONITOR_RECEIPT_BASENAME =
  /^genesis001-admission-monitor-suspended-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{12}\.json$/u;

export const GENESIS_001_FREEZE_ADOPTION_AUTHORITY = Object.freeze({
  freezePublishSourceCommit: GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
  freezePublishReceiptBasename: GENESIS_001_FREEZE_PUBLISH_RECEIPT_BASENAME,
  freezePublishReceiptDigest: GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
});

export class Genesis001SealedLaunchAdoptionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis001SealedLaunchAdoptionError';
    this.code = code;
  }
}

function fail(code = 'GENESIS_001_SEALED_LAUNCH_ADOPTION_INVALID') {
  throw new Genesis001SealedLaunchAdoptionError(code);
}

function plainRecord(value, expectedKeys, ordered = false) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail();
  const keys = Reflect.ownKeys(value);
  if (
    keys.some(key => typeof key !== 'string')
    || keys.length !== expectedKeys.length
    || (
      ordered
        ? keys.some((key, index) => key !== expectedKeys[index])
        : [...keys].sort().some((key, index) => key !== [...expectedKeys].sort()[index])
    )
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail();
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(...parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function updateLengthFramed(hash, label, value) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.length));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.length));
  hash.update(length).update(valueBytes);
}

function canonicalLifecycleJson(value) {
  const normalize = current => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.keys(current).sort().map(key => [
        key,
        normalize(current[key]),
      ]));
    }
    return current;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

function descriptorDigest(value) {
  return sha256(canonicalJson(value));
}

function exactTimestamp(value) {
  if (
    typeof value !== 'string'
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u
      .test(value)
  ) fail();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail();
  return value;
}

function exactPolicy(value) {
  const policy = plainRecord(value, [
    'realmId',
    'releaseVersion',
    'playerAccessEnabled',
    'admissionStateMutationsEnabled',
    'accessRequestSubmissionsEnabled',
    'sourceBaselineCommit',
    'freezeReleaseNonce',
  ]);
  if (
    policy.realmId !== 'GENESIS_001'
    || policy.releaseVersion !== '0.3.43'
    || policy.playerAccessEnabled !== true
    || policy.admissionStateMutationsEnabled !== false
    || policy.accessRequestSubmissionsEnabled !== false
    || policy.sourceBaselineCommit !== GENESIS_001_SOURCE_BASELINE_COMMIT
    || policy.freezeReleaseNonce !== GENESIS_001_FREEZE_RELEASE_NONCE
  ) fail();
  return policy;
}

export function genesis001PolicyReceiptDigest(value) {
  return descriptorDigest(exactPolicy(value));
}

function exactBuildProvenance(value) {
  const provenance = plainRecord(value, [
    'architecture',
    'dependencyArchiveClosureSha256',
    'dependencyClosureSha256',
    'dependencyInstallerProfile',
    'dependencyLockfileSha256',
    'dependencyTreeEntryCount',
    'lockedPackageCount',
    'nodeExecutableSha256',
    'nodeVersion',
    'platform',
    'profile',
    'schemaVersion',
    'spacetimeCliCommit',
    'spacetimeCliExecutableSha256',
    'spacetimeCliVersion',
    'spacetimeStandaloneExecutableSha256',
  ]);
  if (
    provenance.schemaVersion !== 2
    || provenance.profile !== BUILD_PROVENANCE_PROFILE
    || provenance.platform !== 'darwin'
    || provenance.architecture !== 'arm64'
    || provenance.nodeVersion !== 'v24.19.0'
    || provenance.nodeExecutableSha256
      !== '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1'
    || provenance.spacetimeCliVersion !== '2.6.1'
    || provenance.spacetimeCliCommit
      !== '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87'
    || provenance.spacetimeCliExecutableSha256
      !== '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6'
    || provenance.spacetimeStandaloneExecutableSha256
      !== '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa'
    || provenance.dependencyInstallerProfile !== DEPENDENCY_INSTALLER_PROFILE
    || provenance.dependencyLockfileSha256
      !== '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234'
    || provenance.lockedPackageCount !== 16
    || !SHA256.test(provenance.dependencyArchiveClosureSha256 ?? '')
    || !SHA256.test(provenance.dependencyClosureSha256 ?? '')
    || !Number.isSafeInteger(provenance.dependencyTreeEntryCount)
    || provenance.dependencyTreeEntryCount <= 0
  ) fail();
  return provenance;
}

function exactFreezeReceipt(value, sourceCommit) {
  const receipt = plainRecord(value, [
    'artifactSha256',
    'baselineAbiSha256',
    'buildProvenance',
    'buildProvenanceSha256',
    'candidateDescriptorSha256',
    'freezeReleaseNonce',
    'livePolicyReceipt',
    'livePolicyReceiptSha256',
    'outcome',
    'postflightDescriptorSha256',
    'profile',
    'protectedMainCommit',
    'schemaVersion',
    'sourceBaselineCommit',
    'target',
  ]);
  const target = plainRecord(receipt.target, ['database', 'uri']);
  const buildProvenance = exactBuildProvenance(receipt.buildProvenance);
  const policy = exactPolicy(receipt.livePolicyReceipt);
  if (
    receipt.schemaVersion !== 2
    || receipt.profile !== FREEZE_RECEIPT_PROFILE
    || receipt.outcome !== 'published'
    || target.uri !== 'https://maincloud.spacetimedb.com'
    || target.database !== GENESIS_001_DATABASE_IDENTITY
    || receipt.protectedMainCommit !== sourceCommit
    || !COMMIT.test(receipt.protectedMainCommit ?? '')
    || receipt.sourceBaselineCommit !== GENESIS_001_SOURCE_BASELINE_COMMIT
    || receipt.baselineAbiSha256 !== GENESIS_001_BASELINE_ABI_SHA256
    || receipt.freezeReleaseNonce !== GENESIS_001_FREEZE_RELEASE_NONCE
    || !SHA256.test(receipt.artifactSha256 ?? '')
    || !SHA256.test(receipt.candidateDescriptorSha256 ?? '')
    || receipt.postflightDescriptorSha256 !== receipt.candidateDescriptorSha256
    || receipt.buildProvenanceSha256 !== descriptorDigest(buildProvenance)
    || receipt.livePolicyReceiptSha256 !== genesis001PolicyReceiptDigest(policy)
  ) fail();
  return receipt;
}

export function genesis001FreezePublishReceiptDigest(value) {
  return sha256(`${canonicalJson(value)}\n`);
}

function exactFreezeEvidence(value, authority) {
  const evidence = plainRecord(value, [
    'receiptBasename',
    'receiptSha256',
    'receipt',
  ], true);
  const pinned = plainRecord(authority, [
    'freezePublishSourceCommit',
    'freezePublishReceiptBasename',
    'freezePublishReceiptDigest',
  ], true);
  if (
    !COMMIT.test(pinned.freezePublishSourceCommit ?? '')
    || !FREEZE_RECEIPT_BASENAME.test(pinned.freezePublishReceiptBasename ?? '')
    || !SHA256.test(pinned.freezePublishReceiptDigest ?? '')
    || evidence.receiptBasename !== pinned.freezePublishReceiptBasename
    || evidence.receiptSha256 !== pinned.freezePublishReceiptDigest
    || genesis001FreezePublishReceiptDigest(evidence.receipt)
      !== pinned.freezePublishReceiptDigest
  ) fail();
  exactFreezeReceipt(evidence.receipt, pinned.freezePublishSourceCommit);
  return evidence;
}

function exactPolicyObservation(value, preparationSourceCommit) {
  const observation = plainRecord(value, [
    'schemaVersion',
    'profile',
    'sourceCommit',
    'observedAt',
    'databaseIdentity',
    'procedure',
    'mutationSubmitted',
    'policy',
    'policyReceiptDigest',
  ], true);
  const policy = exactPolicy(observation.policy);
  if (
    observation.schemaVersion !== 1
    || observation.profile !== GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE
    || observation.sourceCommit !== preparationSourceCommit
    || observation.databaseIdentity !== GENESIS_001_DATABASE_IDENTITY
    || observation.procedure !== 'genesis_001_access_policy_v1'
    || observation.mutationSubmitted !== false
    || observation.policyReceiptDigest !== genesis001PolicyReceiptDigest(policy)
  ) fail();
  exactTimestamp(observation.observedAt);
  return observation;
}

function genesis001PolicyObservationBootstrapLinkDigest(value) {
  const hash = createHash('sha256');
  updateLengthFramed(
    hash,
    'domain',
    POLICY_OBSERVATION_BOOTSTRAP_LINK_DOMAIN,
  );
  updateLengthFramed(hash, 'protectedCommit', value.protectedCommit);
  updateLengthFramed(hash, 'moduleTreeId', value.moduleTreeId);
  updateLengthFramed(hash, 'bootstrapBlob', value.bootstrapBlob);
  updateLengthFramed(hash, 'bootstrapSha256', value.bootstrapSha256);
  updateLengthFramed(hash, 'command', 'g001-policy-observe');
  updateLengthFramed(
    hash,
    'launchCleanup',
    canonicalLifecycleJson(value.launchCleanup),
  );
  updateLengthFramed(
    hash,
    'policyObservationReceipt',
    `${JSON.stringify(value.policyObservationReceipt)}\n`,
  );
  return hash.digest('hex');
}

export function genesis001PolicyObservationBootstrapReceiptDigest(value) {
  return sha256(
    POLICY_OBSERVATION_BOOTSTRAP_RECEIPT_DIGEST_DOMAIN,
    `${JSON.stringify(value)}\n`,
  );
}

function exactPolicyObservationBootstrapReceipt(
  value,
  preparationSourceCommit,
) {
  const receipt = plainRecord(value, [
    'profile',
    'protectedCommit',
    'moduleTreeId',
    'bootstrapBlob',
    'bootstrapSha256',
    'moduleArchiveCount',
    'command',
    'launchCleanup',
    'policyObservationReceipt',
    'policyObservationReceiptLinkSha256',
  ], true);
  const cleanup = plainRecord(receipt.launchCleanup, [
    'outcome',
    'runId',
    'cleanupConfirmationSha256',
    'treeInventorySha256',
  ], true);
  const observation = exactPolicyObservation(
    receipt.policyObservationReceipt,
    preparationSourceCommit,
  );
  if (
    receipt.profile !== GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_PROFILE
    || receipt.protectedCommit !== preparationSourceCommit
    || !COMMIT.test(receipt.moduleTreeId ?? '')
    || !COMMIT.test(receipt.bootstrapBlob ?? '')
    || !SHA256.test(receipt.bootstrapSha256 ?? '')
    || receipt.moduleArchiveCount !== 16
    || receipt.command !== 'g001-policy-observe'
    || cleanup.outcome !== 'cleaned'
    || !/^run-[0-9a-f]{32}$/u.test(cleanup.runId ?? '')
    || !SHA256.test(cleanup.cleanupConfirmationSha256 ?? '')
    || !SHA256.test(cleanup.treeInventorySha256 ?? '')
    || !SHA256.test(receipt.policyObservationReceiptLinkSha256 ?? '')
    || receipt.policyObservationReceiptLinkSha256
      !== genesis001PolicyObservationBootstrapLinkDigest(receipt)
  ) fail();
  return Object.freeze({ receipt, observation });
}

function exactCensusPrivateProof(value, preparationSourceCommit) {
  const receipt = plainRecord(value, [
    'schemaVersion',
    'profile',
    'realmId',
    'releaseVersion',
    'sourceCommit',
    'privateCensusReference',
    'privateBlindingNonceHex',
    'opaqueProofDigest',
  ], true);
  const reference = plainRecord(receipt.privateCensusReference, [
    'count',
    'pathBasename',
    'sha256',
    'size',
  ], true);
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== CENSUS_PRIVATE_RECEIPT_PROFILE
    || receipt.realmId !== 'GENESIS_001'
    || receipt.releaseVersion !== '0.3.43'
    || receipt.sourceCommit !== preparationSourceCommit
    || !Number.isSafeInteger(reference.count)
    || reference.count < 0
    || reference.count > 4_096
    || !Number.isSafeInteger(reference.size)
    || reference.size < 1
    || reference.size > 1_048_576
    || !SHA256.test(reference.sha256 ?? '')
    || !CENSUS_BASENAME.test(reference.pathBasename ?? '')
    || !HEX_64.test(receipt.privateBlindingNonceHex ?? '')
    || /^0{64}$/u.test(receipt.privateBlindingNonceHex)
    || receipt.opaqueProofDigest !== genesis001CensusOpaqueProofDigest(receipt)
  ) fail();
  return receipt;
}

function exactStableCensusEvidence(value, preparationSourceCommit) {
  const evidence = plainRecord(value, ['first', 'second'], true);
  const first = exactCensusPrivateProof(
    evidence.first,
    preparationSourceCommit,
  );
  const second = exactCensusPrivateProof(
    evidence.second,
    preparationSourceCommit,
  );
  const firstReference = first.privateCensusReference;
  const secondReference = second.privateCensusReference;
  const censusTime = reference => {
    const match = /^warpkeep-access-request-census-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.txt$/u
      .exec(reference.pathBasename);
    if (match === null) fail();
    const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== iso) fail();
    return parsed.getTime();
  };
  const firstObservedAt = censusTime(firstReference);
  const secondObservedAt = censusTime(secondReference);
  const separation = secondObservedAt - firstObservedAt;
  if (
    firstReference.count !== secondReference.count
    || firstReference.size !== secondReference.size
    || firstReference.sha256 !== secondReference.sha256
    || firstReference.pathBasename === secondReference.pathBasename
    || first.privateBlindingNonceHex === second.privateBlindingNonceHex
    || first.opaqueProofDigest === second.opaqueProofDigest
    || separation < MINIMUM_STABLE_CENSUS_SEPARATION_MS
    || separation > MAXIMUM_STABLE_CENSUS_SEPARATION_MS
  ) fail();
  return Object.freeze({ first, second, firstObservedAt, secondObservedAt });
}

export function genesis001CensusOpaqueProofDigest(value) {
  const proof = {
    schemaVersion: value?.schemaVersion,
    profile: value?.profile,
    realmId: value?.realmId,
    releaseVersion: value?.releaseVersion,
    sourceCommit: value?.sourceCommit,
    privateCensusReference: value?.privateCensusReference,
    privateBlindingNonceHex: value?.privateBlindingNonceHex,
  };
  return sha256(CENSUS_PROOF_DOMAIN, `${JSON.stringify(proof)}\n`);
}

export function genesis001MonitorSuspensionReceiptDigest(value) {
  return sha256(`${JSON.stringify(value)}\n`);
}

export function genesis001AdmissionMonitorCurrentStateReceiptDigest(value) {
  return sha256(
    MONITOR_CURRENT_STATE_RECEIPT_DIGEST_DOMAIN,
    `${JSON.stringify(value)}\n`,
  );
}

function exactMonitorEvidence(value, preparationSourceCommit) {
  const evidence = plainRecord(value, [
    'receiptBasename',
    'receiptSha256',
    'receipt',
  ], true);
  const receipt = plainRecord(evidence.receipt, [
    'disabled',
    'label',
    'loaded',
    'monitorPlistSha256',
    'monitorProgramSha256',
    'profile',
    'realmId',
    'release',
    'sourceCommit',
    'suspendedAt',
  ], true);
  exactTimestamp(receipt.suspendedAt);
  const digest = genesis001MonitorSuspensionReceiptDigest(receipt);
  const stamp = receipt.suspendedAt.replace(/[-:.]/gu, '');
  const basename =
    `genesis001-admission-monitor-suspended-${stamp}-${digest.slice(0, 12)}.json`;
  if (
    receipt.disabled !== true
    || receipt.label !== MONITOR_LABEL
    || receipt.loaded !== false
    || receipt.monitorPlistSha256 !== MONITOR_PLIST_SHA256
    || receipt.monitorProgramSha256 !== MONITOR_PROGRAM_SHA256
    || receipt.profile !== MONITOR_PROFILE
    || receipt.realmId !== 'GENESIS_001'
    || receipt.release !== '0.3.43'
    || receipt.sourceCommit !== preparationSourceCommit
    || !MONITOR_RECEIPT_BASENAME.test(evidence.receiptBasename ?? '')
    || evidence.receiptBasename !== basename
    || evidence.receiptSha256 !== digest
  ) fail();
  return Object.freeze({ evidence, digest });
}

function exactMonitorCurrentStateReceipt(value, preparationSourceCommit) {
  const receipt = plainRecord(value, [
    'schemaVersion',
    'profile',
    'realmId',
    'release',
    'sourceCommit',
    'observedAt',
    'label',
    'disabled',
    'loaded',
    'monitorPlistSha256',
    'monitorProgramSha256',
  ], true);
  const observedAt = exactTimestamp(receipt.observedAt);
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE
    || receipt.realmId !== 'GENESIS_001'
    || receipt.release !== '0.3.43'
    || receipt.sourceCommit !== preparationSourceCommit
    || receipt.label !== MONITOR_LABEL
    || receipt.disabled !== true
    || receipt.loaded !== false
    || receipt.monitorPlistSha256 !== MONITOR_PLIST_SHA256
    || receipt.monitorProgramSha256 !== MONITOR_PROGRAM_SHA256
  ) fail();
  return Object.freeze({
    receipt,
    observedAt: Date.parse(observedAt),
    digest: genesis001AdmissionMonitorCurrentStateReceiptDigest(receipt),
  });
}

function deriveGenesis001SealedLaunchEvidenceWithAuthority(
  value,
  authority,
  verificationTime,
) {
  const evidence = plainRecord(value, [
    'preparationSourceCommit',
    'freezePublishReceipt',
    'policyObservationBootstrapReceipt',
    'censusPrivacySafePrivateReceipt',
    'admissionMonitorSuspensionReceipt',
    'admissionMonitorCurrentStateReceipt',
  ], true);
  if (!COMMIT.test(evidence.preparationSourceCommit ?? '')) fail();
  const freeze = exactFreezeEvidence(evidence.freezePublishReceipt, authority);
  const policyObservationBootstrap = exactPolicyObservationBootstrapReceipt(
    evidence.policyObservationBootstrapReceipt,
    evidence.preparationSourceCommit,
  );
  const observation = policyObservationBootstrap.observation;
  const census = exactStableCensusEvidence(
    evidence.censusPrivacySafePrivateReceipt,
    evidence.preparationSourceCommit,
  );
  const monitor = exactMonitorEvidence(
    evidence.admissionMonitorSuspensionReceipt,
    evidence.preparationSourceCommit,
  );
  const monitorCurrent = exactMonitorCurrentStateReceipt(
    evidence.admissionMonitorCurrentStateReceipt,
    evidence.preparationSourceCommit,
  );
  const verifiedAt = verificationTime.getTime();
  const policyObservedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(verifiedAt)) fail();
  if (
    policyObservedAt > census.firstObservedAt
    || census.firstObservedAt - policyObservedAt
      > MAXIMUM_POLICY_TO_FIRST_CENSUS_AGE_MS
    || verifiedAt - policyObservedAt > MAXIMUM_POLICY_OBSERVATION_AGE_MS
    || census.secondObservedAt
      > Date.parse(monitor.evidence.receipt.suspendedAt)
    || Date.parse(monitor.evidence.receipt.suspendedAt)
      > monitorCurrent.observedAt
    || monitorCurrent.observedAt > verifiedAt
    || verifiedAt - monitorCurrent.observedAt
      > MAXIMUM_MONITOR_CURRENT_STATE_AGE_MS
  ) fail();
  return Object.freeze({
    g001DatabaseIdentity: GENESIS_001_DATABASE_IDENTITY,
    g001SourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT,
    g001BaselineAbiSha256: GENESIS_001_BASELINE_ABI_SHA256,
    g001FreezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE,
    g001FreezePublishReceiptDigest: freeze.receiptSha256,
    g001PolicyReceiptDigest: observation.policyReceiptDigest,
    g001PolicyObservationBootstrapReceiptDigest:
      genesis001PolicyObservationBootstrapReceiptDigest(
        policyObservationBootstrap.receipt,
      ),
    g001PolicySourceCommit: evidence.preparationSourceCommit,
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001CensusPrivacySafeReceiptProfile:
      GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE,
    g001CensusPrivacySafeReceiptDigest: census.second.opaqueProofDigest,
    admissionMonitorSuspensionReceiptDigest: monitor.digest,
    admissionMonitorCurrentStateReceiptDigest: monitorCurrent.digest,
    admissionMonitorDisabled: true,
    admissionMonitorLoaded: false,
  });
}

export function deriveGenesis001SealedLaunchEvidence(value) {
  return deriveGenesis001SealedLaunchEvidenceWithAuthority(
    value,
    GENESIS_001_FREEZE_ADOPTION_AUTHORITY,
    new Date(),
  );
}

export function deriveGenesis001SealedLaunchEvidenceForTesting(
  value,
  authority,
  verificationTime,
) {
  if (process.env.NODE_ENV !== 'test') fail();
  if (!(verificationTime instanceof Date)) fail();
  return deriveGenesis001SealedLaunchEvidenceWithAuthority(
    value,
    authority,
    verificationTime,
  );
}
