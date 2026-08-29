import {
  fstatSync,
  realpathSync,
  readSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSealedLaunchActivationBinding,
} from './verify-0.4.0-sealed-launch.mjs';
import {
  deriveGenesis001SealedLaunchEvidence,
} from './genesis001-sealed-launch-adoption.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from './genesis002-activation-receipts.mjs';

const MAXIMUM_CANDIDATE_BYTES = 32 * 1_024;
const PTR_IMPORT_EPOCH_MAXIMUM = (1n << 64n) - 1n;
const PTR_IMPORT_OPERATION_MAXIMUM = 4_096;
const SYSTEM_GIT = '/usr/bin/git';
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const BOOTSTRAP_SOURCE_PATH =
  'scripts/greater-realm-production-bootstrap.mjs';
const EXPECTED_BOOTSTRAP_SHA256 =
  'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a';
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: '/usr/bin/false',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});
const EVIDENCE_PROFILE =
  'warpkeep-0.4.0-sealed-launch-activation-evidence-v1';
const EVIDENCE_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'bindingCandidate',
  'g001FreezePublishReceipt',
  'g001PolicyObservationBootstrapReceipt',
  'g001CensusPrivacySafePrivateReceipt',
  'g001AdmissionMonitorSuspensionReceipt',
  'g001AdmissionMonitorCurrentStateReceipt',
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
const PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'databaseIdentity',
  'database',
  'moduleIdentity',
  'sourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'spacetimeCliConfigSha256',
  'deleteData',
  'outcome',
  'freshStatusDigest',
  'playerAccessEnabled',
  'admissionMutationsEnabled',
  'atlasImportMutationsEnabled',
  'atlasActivationMutationsEnabled',
  'playerPresentationEnabled',
]);
const PUBLISH_RESULT_KEYS = Object.freeze([
  ...PUBLISH_RECEIPT_KEYS,
  'publishReceiptDigest',
]);
const IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'atlasId',
  'atlasSourceCommit',
  'publicReleaseId',
  'expectedReleaseSha256',
  'verificationDigest',
  'importEpoch',
  'operationsSubmitted',
  'operationChainDigest',
  'zeroPopulationBoundary',
  'activationMutationsEnabled',
  'playerPresentationEnabled',
  'atlasWritesClosedByFinalization',
]);
const IMPORT_RESULT_KEYS = Object.freeze([
  ...IMPORT_RECEIPT_KEYS,
  'importReceiptDigest',
]);
const PTR_PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'sourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'spacetimeCliConfigSha256',
  'deleteData',
  'outcome',
  'freshDatabase',
  'freshStatusDigest',
  'admissionSurfacePresent',
  'accessRequestSurfacePresent',
]);
const PTR_PUBLISH_RESULT_KEYS = Object.freeze([
  ...PTR_PUBLISH_RECEIPT_KEYS,
  'publishReceiptDigest',
]);
const PTR_IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'atlasId',
  'atlasSourceCommit',
  'publicReleaseId',
  'releaseManifestSha256',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'importEpoch',
  'operationsSubmitted',
  'operationChainDigest',
  'zeroPopulationBoundary',
  'importsExact',
  'ready',
  'atlasFinalized',
  'atlasWritesClosedByFinalization',
  'importMutationsCompiled',
  'activationMutationsCompiled',
]);
const PTR_IMPORT_RESULT_KEYS = Object.freeze([
  ...PTR_IMPORT_RECEIPT_KEYS,
  'importReceiptDigest',
]);
const PTR_OWNER_PROVISION_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'moduleSourceCommit',
  'ownerOpaqueProofDigest',
  'ownerAnchorRows',
  'ownerProvisioned',
  'ownerEnabled',
  'zeroPopulationBoundary',
]);
const PTR_OWNER_PROVISION_RESULT_KEYS = Object.freeze([
  ...PTR_OWNER_PROVISION_RECEIPT_KEYS,
  'provisionReceiptDigest',
]);
const PTR_SEALED_LIVE_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'uri',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'releaseVersion',
  'realmId',
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'releaseManifestSha256',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'atlasState',
  'atlasFinalized',
  'atlasImportsExact',
  'atlasWritesClosedByFinalization',
  'allowedFids',
  'accessRequests',
  'playersV1',
  'playersV2',
  'ownershipBindings',
  'castles',
  'realmProfiles',
  'termsAcceptances',
  'markAccounts',
  'resourceAccounts',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'atlasImportMutationsCompiled',
  'atlasActivationMutationsCompiled',
  'ownerOpaqueProofDigest',
  'ownerAnchorRows',
  'ownerProvisioned',
  'ownerEnabled',
  'admissionsOpen',
  'accessRequestsOpen',
  'admissionSurfacePresent',
  'accessRequestSurfacePresent',
  'playerPresentationEnabled',
]);
const G001_DERIVED_BINDING_KEYS = Object.freeze([
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
  'admissionMonitorSuspensionReceiptDigest',
  'admissionMonitorSuspensionReceiptCommitment',
  'admissionMonitorCurrentStateReceiptDigest',
  'admissionMonitorCurrentStateReceiptCommitment',
  'admissionMonitorDisabled',
  'admissionMonitorLoaded',
]);
const G002_DERIVED_BINDING_KEYS = Object.freeze([
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
  'g002PresentationEnabled',
  'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled',
  'admissionNotificationsEnabled',
]);
const PTR_DERIVED_BINDING_KEYS = Object.freeze([
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
  'ptrPresentationEnabled',
]);

export class SealedLaunchActivationGeneratorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedLaunchActivationGeneratorError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedLaunchActivationGeneratorError(code);
}

function exactRecord(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  return value;
}

function receiptWithoutDigest(value, resultKeys, receiptKeys) {
  const result = exactRecord(value, resultKeys);
  return Object.freeze(Object.fromEntries(
    receiptKeys.map(key => [key, result[key]]),
  ));
}

function ptrReceiptDigest(domain, receipt, keys) {
  exactRecord(receipt, keys);
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

export function ptrProductionPublishReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.production-publish-receipt.v1',
    receipt,
    PTR_PUBLISH_RECEIPT_KEYS,
  );
}

export function ptrProductionAtlasImportReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.production-import-receipt.v1',
    receipt,
    PTR_IMPORT_RECEIPT_KEYS,
  );
}

export function ptrOwnerProvisionReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.owner-provision-receipt.v1',
    receipt,
    PTR_OWNER_PROVISION_RECEIPT_KEYS,
  );
}

export function ptrSealedLiveReceiptDigest(receipt) {
  return ptrReceiptDigest(
    'warpkeep.ptr.sealed-live-receipt.v1',
    receipt,
    PTR_SEALED_LIVE_RECEIPT_KEYS,
  );
}

function exactGit(arguments_, binary = false, allowFailure = false) {
  const result = spawnSync(SYSTEM_GIT, [
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    '-c',
    'http.proxy=',
    '-c',
    'http.sslVerify=true',
    '-c',
    'credential.helper=',
    '-C',
    REPOSITORY_ROOT,
    ...arguments_,
  ], {
    encoding: binary ? null : 'utf8',
    env: GIT_ENVIRONMENT,
    maxBuffer: 2 * 1_024 * 1_024,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (
    result.error !== undefined
    || result.signal !== null
    || typeof result.status !== 'number'
    || (!allowFailure && result.status !== 0)
    || (binary ? !Buffer.isBuffer(result.stdout) : typeof result.stdout !== 'string')
    || (binary ? !Buffer.isBuffer(result.stderr) : typeof result.stderr !== 'string')
    || (binary ? result.stderr.length !== 0 : result.stderr !== '')
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  return Object.freeze({
    status: result.status,
    stdout: binary ? result.stdout : result.stdout.trim(),
    stderr: binary ? result.stderr : result.stderr.trim(),
  });
}

function exactLocalGitConfiguration() {
  const bytes = exactGit(
    ['config', '--local', '--null', '--list'],
    true,
  ).stdout;
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  } finally {
    bytes.fill(0);
  }
  const records = source.split('\0');
  if (records.at(-1) !== '') {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  records.pop();
  const seen = new Set();
  const required = new Map([
    ['core.repositoryformatversion', '0'],
    ['core.filemode', 'true'],
    ['core.bare', 'false'],
    ['core.logallrefupdates', 'true'],
    ['core.ignorecase', 'true'],
    ['core.precomposeunicode', 'true'],
    ['remote.origin.url', CANONICAL_ORIGIN_URL],
    ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
  ]);
  for (const record of records) {
    const separator = record.indexOf('\n');
    if (
      separator < 1
      || separator !== record.lastIndexOf('\n')
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
    const key = record.slice(0, separator);
    const value = record.slice(separator + 1);
    if (seen.has(key)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
    }
    seen.add(key);
    if (required.has(key)) {
      if (required.get(key) !== value) {
        fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
      }
      continue;
    }
    const branch = /^branch\.([A-Za-z0-9][A-Za-z0-9._/-]{0,199})\.(remote|merge)$/u
      .exec(key);
    if (
      branch === null
      || (branch[2] === 'remote' && value !== 'origin')
      || (branch[2] === 'merge'
        && !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u.test(value))
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  if ([...required.keys()].some(key => !seen.has(key))) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  return source;
}

function exactPreparationBootstrapAuthority(
  preparationSourceCommit,
  testOnlyAuthority,
) {
  if (!COMMIT.test(preparationSourceCommit ?? '')) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  if (testOnlyAuthority !== undefined) {
    if (process.env.NODE_ENV !== 'test') {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_TEST_AUTHORITY_FORBIDDEN');
    }
    const authority = exactRecord(testOnlyAuthority, [
      'preparationSourceCommit',
      'moduleTreeId',
      'bootstrapBlob',
      'bootstrapSha256',
    ]);
    if (
      authority.preparationSourceCommit !== preparationSourceCommit
      || !COMMIT.test(authority.moduleTreeId ?? '')
      || !COMMIT.test(authority.bootstrapBlob ?? '')
      || authority.bootstrapSha256 !== EXPECTED_BOOTSTRAP_SHA256
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
    return authority;
  }

  const localConfiguration = exactLocalGitConfiguration();
  const root = exactGit(['rev-parse', '--show-toplevel']).stdout;
  const head = exactGit(['rev-parse', '--verify', 'HEAD^{commit}']).stdout;
  const remoteMain = exactGit([
    'rev-parse',
    '--verify',
    'refs/remotes/origin/main',
  ]).stdout;
  const status = exactGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]).stdout;
  const origin = exactGit(['remote', 'get-url', 'origin']).stdout;
  const remoteHead = exactGit([
    'ls-remote',
    '--refs',
    CANONICAL_ORIGIN_URL,
    'refs/heads/main',
  ]).stdout;
  const tracked = exactGit(['ls-files', '-v', '-z']).stdout;
  const trackedEntries = tracked.split('\0');
  if (trackedEntries.at(-1) !== '') {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  trackedEntries.pop();
  const moduleTreeId = exactGit([
    'rev-parse',
    '--verify',
    `${preparationSourceCommit}^{tree}`,
  ]).stdout;
  const bootstrapTreeEntry = exactGit([
    'ls-tree',
    '-z',
    preparationSourceCommit,
    '--',
    BOOTSTRAP_SOURCE_PATH,
  ]).stdout;
  const bootstrapEntryMatch = new RegExp(
    `^100644 blob ([0-9a-f]{40})\\t${BOOTSTRAP_SOURCE_PATH}\\0$`,
    'u',
  ).exec(bootstrapTreeEntry);
  if (bootstrapEntryMatch === null) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
  }
  const bootstrapBlob = bootstrapEntryMatch[1];
  const objectType = exactGit(['cat-file', '-t', bootstrapBlob]).stdout;
  const bootstrapBytes = exactGit(
    ['cat-file', 'blob', bootstrapBlob],
    true,
  ).stdout;
  try {
    const bootstrapSha256 = createHash('sha256')
      .update(bootstrapBytes)
      .digest('hex');
    if (
      root !== REPOSITORY_ROOT
      || head !== preparationSourceCommit
      || remoteMain !== preparationSourceCommit
      || origin !== CANONICAL_ORIGIN_URL
      || remoteHead !== `${preparationSourceCommit}\trefs/heads/main`
      || status !== ''
      || trackedEntries.length < 1
      || trackedEntries.some(entry => !entry.startsWith('H '))
      || !COMMIT.test(moduleTreeId ?? '')
      || !COMMIT.test(bootstrapBlob ?? '')
      || objectType !== 'blob'
      || bootstrapSha256 !== EXPECTED_BOOTSTRAP_SHA256
      || exactLocalGitConfiguration() !== localConfiguration
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');
    return Object.freeze({
      preparationSourceCommit,
      moduleTreeId,
      bootstrapBlob,
      bootstrapSha256,
    });
  } finally {
    bootstrapBytes.fill(0);
  }
}

/** Derive every G1, G2, and PTR public field solely from exact evidence. */
export function createSealedLaunchActivationBindingFromEvidence(
  envelope,
  testOnlyPreparationBootstrapAuthority,
) {
  const evidence = exactRecord(envelope, EVIDENCE_KEYS);
  if (
    evidence.schemaVersion !== 1
    || evidence.profile !== EVIDENCE_PROFILE
    || typeof evidence.g002SealedLiveReceiptDigest !== 'string'
    || !/^[0-9a-f]{64}$/u.test(evidence.g002SealedLiveReceiptDigest)
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  if (
    evidence.bindingCandidate === null
    || typeof evidence.bindingCandidate !== 'object'
    || Array.isArray(evidence.bindingCandidate)
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  const candidate = exactRecord(
    evidence.bindingCandidate,
    Reflect.ownKeys(evidence.bindingCandidate),
  );
  if (
    G001_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)
    || G002_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)
    || PTR_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)
  ) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }
  const preparationAuthority = exactPreparationBootstrapAuthority(
    candidate.preparationSourceCommit,
    testOnlyPreparationBootstrapAuthority,
  );

  let genesis001;
  try {
    const privateEvidence = {
      preparationSourceCommit: candidate.preparationSourceCommit,
      freezePublishReceipt: evidence.g001FreezePublishReceipt,
      policyObservationBootstrapReceipt:
        evidence.g001PolicyObservationBootstrapReceipt,
      censusPrivacySafePrivateReceipt:
        evidence.g001CensusPrivacySafePrivateReceipt,
      admissionMonitorSuspensionReceipt:
        evidence.g001AdmissionMonitorSuspensionReceipt,
      admissionMonitorCurrentStateReceipt:
        evidence.g001AdmissionMonitorCurrentStateReceipt,
    };
    genesis001 = deriveGenesis001SealedLaunchEvidence(privateEvidence);
  } catch {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }
  const observationBootstrap = evidence.g001PolicyObservationBootstrapReceipt;
  if (
    observationBootstrap.moduleTreeId !== preparationAuthority.moduleTreeId
    || observationBootstrap.bootstrapBlob !== preparationAuthority.bootstrapBlob
    || observationBootstrap.bootstrapSha256
      !== preparationAuthority.bootstrapSha256
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_AUTHORITY_INVALID');

  const publish = exactRecord(evidence.g002PublishReceipt, PUBLISH_RESULT_KEYS);
  const publishReceipt = receiptWithoutDigest(
    publish,
    PUBLISH_RESULT_KEYS,
    PUBLISH_RECEIPT_KEYS,
  );
  const publishDigest = genesis002PublishReceiptDigest(publishReceipt);
  if (publish.publishReceiptDigest !== publishDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const atlasImport = exactRecord(
    evidence.g002AtlasImportReceipt,
    IMPORT_RESULT_KEYS,
  );
  const atlasImportReceipt = receiptWithoutDigest(
    atlasImport,
    IMPORT_RESULT_KEYS,
    IMPORT_RECEIPT_KEYS,
  );
  const atlasImportDigest = genesis002ProductionImportReceiptDigest(
    atlasImportReceipt,
  );
  if (atlasImport.importReceiptDigest !== atlasImportDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const sealedLive = evidence.g002SealedLiveReceipt;
  const sealedLiveDigest = genesis002SealedLiveReceiptDigest(sealedLive);
  if (evidence.g002SealedLiveReceiptDigest !== sealedLiveDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  if (
    publish.databaseIdentity !== atlasImport.databaseIdentity
    || publish.databaseIdentity !== sealedLive.databaseIdentity
    || publish.moduleIdentity !== atlasImport.moduleIdentity
    || publish.moduleIdentity !== sealedLive.moduleIdentity
    || publish.sourceCommit !== atlasImport.moduleSourceCommit
    || publish.sourceCommit !== sealedLive.moduleSourceCommit
    || publish.sourceCommit !== atlasImport.atlasSourceCommit
    || publish.moduleSha256 !== atlasImport.moduleSha256
    || publish.moduleSha256 !== sealedLive.moduleSha256
    || publish.moduleTreeId !== atlasImport.moduleTreeId
    || publish.dependencyClosureDigest !== atlasImport.dependencyClosureDigest
    || publish.spacetimeExecutableSha256
      !== atlasImport.spacetimeExecutableSha256
    || atlasImport.atlasId !== sealedLive.atlasId
    || atlasImport.atlasSourceCommit !== sealedLive.atlasSourceCommit
    || atlasImport.publicReleaseId !== sealedLive.publicReleaseId
    || atlasImport.expectedReleaseSha256 !== sealedLive.releaseSha256
    || atlasImport.verificationDigest !== sealedLive.verificationDigest
    || publish.atlasImportMutationsEnabled
      !== sealedLive.atlasImportSurfaceCompiled
    || publish.atlasActivationMutationsEnabled
      !== atlasImport.activationMutationsEnabled
    || publish.atlasActivationMutationsEnabled
      !== sealedLive.activationMutationsEnabled
    || publish.playerPresentationEnabled
      !== atlasImport.playerPresentationEnabled
    || publish.playerPresentationEnabled
      !== sealedLive.playerPresentationEnabled
    || atlasImport.atlasWritesClosedByFinalization
      !== sealedLive.atlasWritesClosedByFinalization
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');

  const ptrPublish = exactRecord(
    evidence.ptrPublishReceipt,
    PTR_PUBLISH_RESULT_KEYS,
  );
  const ptrPublishReceipt = receiptWithoutDigest(
    ptrPublish,
    PTR_PUBLISH_RESULT_KEYS,
    PTR_PUBLISH_RECEIPT_KEYS,
  );
  const ptrPublishDigest = ptrProductionPublishReceiptDigest(
    ptrPublishReceipt,
  );
  if (ptrPublish.publishReceiptDigest !== ptrPublishDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const ptrAtlasImport = exactRecord(
    evidence.ptrAtlasImportReceipt,
    PTR_IMPORT_RESULT_KEYS,
  );
  const ptrAtlasImportReceipt = receiptWithoutDigest(
    ptrAtlasImport,
    PTR_IMPORT_RESULT_KEYS,
    PTR_IMPORT_RECEIPT_KEYS,
  );
  const ptrAtlasImportDigest = ptrProductionAtlasImportReceiptDigest(
    ptrAtlasImportReceipt,
  );
  if (ptrAtlasImport.importReceiptDigest !== ptrAtlasImportDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const ptrOwnerProvision = exactRecord(
    evidence.ptrOwnerProvisionReceipt,
    PTR_OWNER_PROVISION_RESULT_KEYS,
  );
  const ptrOwnerProvisionReceipt = receiptWithoutDigest(
    ptrOwnerProvision,
    PTR_OWNER_PROVISION_RESULT_KEYS,
    PTR_OWNER_PROVISION_RECEIPT_KEYS,
  );
  const ptrOwnerProvisionDigest = ptrOwnerProvisionReceiptDigest(
    ptrOwnerProvisionReceipt,
  );
  if (ptrOwnerProvision.provisionReceiptDigest !== ptrOwnerProvisionDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const ptrSealedLive = exactRecord(
    evidence.ptrSealedLiveReceipt,
    PTR_SEALED_LIVE_RECEIPT_KEYS,
  );
  const ptrLiveDigest = ptrSealedLiveReceiptDigest(ptrSealedLive);
  if (evidence.ptrSealedLiveReceiptDigest !== ptrLiveDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const ptrLiveZeroFields = [
    'allowedFids',
    'accessRequests',
    'playersV1',
    'playersV2',
    'ownershipBindings',
    'castles',
    'realmProfiles',
    'termsAcceptances',
    'markAccounts',
    'resourceAccounts',
    'claimRows',
    'occupancyRows',
    'activationRows',
    'publicAtlasRows',
    'publicRegionRows',
    'workerSystemRows',
  ];
  if (
    ptrPublish.schemaVersion !== 1
    || ptrPublish.profile !== 'warpkeep-ptr-production-publish-v1'
    || !SHA256.test(ptrPublish.databaseIdentity ?? '')
    || ptrPublish.databaseAlias !== 'warpkeep-ptr'
    || ptrPublish.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || ptrPublish.sourceCommit !== candidate.preparationSourceCommit
    || !SHA256.test(ptrPublish.moduleSha256 ?? '')
    || !COMMIT.test(ptrPublish.moduleTreeId ?? '')
    || !SHA256.test(ptrPublish.dependencyClosureDigest ?? '')
    || !SHA256.test(ptrPublish.spacetimeExecutableSha256 ?? '')
    || !SHA256.test(ptrPublish.spacetimeCliConfigSha256 ?? '')
    || ptrPublish.deleteData !== 'never'
    || ptrPublish.outcome !== 'verified'
    || ptrPublish.freshDatabase !== true
    || !SHA256.test(ptrPublish.freshStatusDigest ?? '')
    || ptrPublish.admissionSurfacePresent !== false
    || ptrPublish.accessRequestSurfacePresent !== false
    || ptrAtlasImport.schemaVersion !== 1
    || ptrAtlasImport.profile !== 'warpkeep.ptr.production-import.v1'
    || ptrAtlasImport.outcome !== 'ready'
    || ptrAtlasImport.atlasId !== 'PTR_GREATER_REALM'
    || ptrAtlasImport.atlasSourceCommit !== candidate.preparationSourceCommit
    || !PUBLIC_RELEASE_ID.test(ptrAtlasImport.publicReleaseId ?? '')
    || !SHA256.test(ptrAtlasImport.releaseManifestSha256 ?? '')
    || !SHA256.test(ptrAtlasImport.expectedReleaseSha256 ?? '')
    || !SHA256.test(ptrAtlasImport.releaseHeaderSha256 ?? '')
    || !SHA256.test(ptrAtlasImport.verificationDigest ?? '')
    || !/^[1-9][0-9]{0,19}$/u.test(ptrAtlasImport.importEpoch ?? '')
    || BigInt(ptrAtlasImport.importEpoch) > PTR_IMPORT_EPOCH_MAXIMUM
    || !Number.isSafeInteger(ptrAtlasImport.operationsSubmitted)
    || ptrAtlasImport.operationsSubmitted < 1
    || ptrAtlasImport.operationsSubmitted > PTR_IMPORT_OPERATION_MAXIMUM
    || !SHA256.test(ptrAtlasImport.operationChainDigest ?? '')
    || ptrAtlasImport.zeroPopulationBoundary !== true
    || ptrAtlasImport.importsExact !== true
    || ptrAtlasImport.ready !== true
    || ptrAtlasImport.atlasFinalized !== true
    || ptrAtlasImport.atlasWritesClosedByFinalization !== true
    || ptrAtlasImport.importMutationsCompiled !== true
    || ptrAtlasImport.activationMutationsCompiled !== false
    || ptrOwnerProvision.schemaVersion !== 1
    || ptrOwnerProvision.profile !== 'warpkeep-ptr-owner-provision-v1'
    || ptrOwnerProvision.outcome !== 'verified'
    || !SHA256.test(ptrOwnerProvision.ownerOpaqueProofDigest ?? '')
    || /^0{64}$/u.test(ptrOwnerProvision.ownerOpaqueProofDigest)
    || ptrOwnerProvision.ownerAnchorRows !== 1
    || ptrOwnerProvision.ownerProvisioned !== true
    || ptrOwnerProvision.ownerEnabled !== true
    || ptrOwnerProvision.zeroPopulationBoundary !== true
    || ptrSealedLive.schemaVersion !== 1
    || ptrSealedLive.profile !== 'warpkeep-ptr-sealed-live-v1'
    || ptrSealedLive.uri !== 'https://maincloud.spacetimedb.com'
    || ptrSealedLive.databaseAlias !== 'warpkeep-ptr'
    || ptrSealedLive.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || ptrSealedLive.moduleSourceCommit !== candidate.preparationSourceCommit
    || ptrSealedLive.releaseVersion !== '0.4.0-ptr.1'
    || ptrSealedLive.realmId !== 'PTR'
    || ptrSealedLive.atlasId !== 'PTR_GREATER_REALM'
    || ptrSealedLive.atlasState !== 'ready'
    || ptrSealedLive.atlasFinalized !== true
    || ptrSealedLive.atlasImportsExact !== true
    || ptrSealedLive.atlasWritesClosedByFinalization !== true
    || ptrLiveZeroFields.some(field => (
      ptrSealedLive[field] !== 0 || Object.is(ptrSealedLive[field], -0)
    ))
    || ptrSealedLive.atlasImportMutationsCompiled !== true
    || ptrSealedLive.atlasActivationMutationsCompiled !== false
    || ptrSealedLive.ownerAnchorRows !== 1
    || ptrSealedLive.ownerProvisioned !== true
    || ptrSealedLive.ownerEnabled !== true
    || ptrSealedLive.admissionsOpen !== false
    || ptrSealedLive.accessRequestsOpen !== false
    || ptrSealedLive.admissionSurfacePresent !== false
    || ptrSealedLive.accessRequestSurfacePresent !== false
    || ptrSealedLive.playerPresentationEnabled !== true
    || ptrPublish.databaseIdentity === genesis001.g001DatabaseIdentity
    || ptrPublish.databaseIdentity === publish.databaseIdentity
    || ptrPublish.databaseIdentity !== ptrAtlasImport.databaseIdentity
    || ptrPublish.databaseIdentity !== ptrOwnerProvision.databaseIdentity
    || ptrPublish.databaseIdentity !== ptrSealedLive.databaseIdentity
    || ptrPublish.databaseAlias !== ptrOwnerProvision.databaseAlias
    || ptrPublish.databaseAlias !== ptrSealedLive.databaseAlias
    || ptrPublish.moduleIdentity !== ptrAtlasImport.moduleIdentity
    || ptrPublish.moduleIdentity !== ptrOwnerProvision.moduleIdentity
    || ptrPublish.moduleIdentity !== ptrSealedLive.moduleIdentity
    || ptrPublish.sourceCommit !== ptrAtlasImport.moduleSourceCommit
    || ptrPublish.sourceCommit !== ptrOwnerProvision.moduleSourceCommit
    || ptrPublish.sourceCommit !== ptrSealedLive.moduleSourceCommit
    || ptrPublish.moduleSha256 !== ptrAtlasImport.moduleSha256
    || ptrPublish.moduleSha256 !== ptrSealedLive.moduleSha256
    || ptrPublish.moduleTreeId !== ptrAtlasImport.moduleTreeId
    || ptrPublish.dependencyClosureDigest
      !== ptrAtlasImport.dependencyClosureDigest
    || ptrPublish.spacetimeExecutableSha256
      !== ptrAtlasImport.spacetimeExecutableSha256
    || ptrAtlasImport.atlasSourceCommit !== ptrSealedLive.atlasSourceCommit
    || ptrAtlasImport.atlasId !== ptrSealedLive.atlasId
    || ptrAtlasImport.publicReleaseId !== ptrSealedLive.publicReleaseId
    || ptrAtlasImport.releaseManifestSha256
      !== ptrSealedLive.releaseManifestSha256
    || ptrAtlasImport.expectedReleaseSha256
      !== ptrSealedLive.expectedReleaseSha256
    || ptrAtlasImport.releaseHeaderSha256
      !== ptrSealedLive.releaseHeaderSha256
    || ptrAtlasImport.verificationDigest
      !== ptrSealedLive.verificationDigest
    || ptrAtlasImport.importsExact !== ptrSealedLive.atlasImportsExact
    || ptrAtlasImport.atlasFinalized !== ptrSealedLive.atlasFinalized
    || ptrAtlasImport.atlasWritesClosedByFinalization
      !== ptrSealedLive.atlasWritesClosedByFinalization
    || ptrAtlasImport.importMutationsCompiled
      !== ptrSealedLive.atlasImportMutationsCompiled
    || ptrAtlasImport.activationMutationsCompiled
      !== ptrSealedLive.atlasActivationMutationsCompiled
    || ptrOwnerProvision.ownerOpaqueProofDigest
      !== ptrSealedLive.ownerOpaqueProofDigest
    || ptrOwnerProvision.ownerAnchorRows !== ptrSealedLive.ownerAnchorRows
    || ptrOwnerProvision.ownerProvisioned !== ptrSealedLive.ownerProvisioned
    || ptrOwnerProvision.ownerEnabled !== ptrSealedLive.ownerEnabled
    || ptrPublish.admissionSurfacePresent
      !== ptrSealedLive.admissionSurfacePresent
    || ptrPublish.accessRequestSurfacePresent
      !== ptrSealedLive.accessRequestSurfacePresent
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');

  const binding = {
    ...candidate,
    ...genesis001,
    g002PublishReceiptDigest: publishDigest,
    g002FreshStatusDigest: publish.freshStatusDigest,
    g002DatabaseIdentity: publish.databaseIdentity,
    g002ModuleSourceCommit: publish.sourceCommit,
    g002ModuleSha256: publish.moduleSha256,
    g002ModuleTreeId: publish.moduleTreeId,
    g002DependencyClosureDigest: publish.dependencyClosureDigest,
    g002SpacetimeExecutableSha256: publish.spacetimeExecutableSha256,
    g002SpacetimeCliConfigSha256: publish.spacetimeCliConfigSha256,
    g002AtlasImportReceiptDigest: atlasImportDigest,
    g002SealedLiveReceiptDigest: sealedLiveDigest,
    g002AtlasSourceCommit: sealedLive.atlasSourceCommit,
    g002AtlasId: sealedLive.atlasId,
    g002PublicReleaseId: sealedLive.publicReleaseId,
    g002ReleaseSha256: sealedLive.releaseSha256,
    g002ReleaseHeaderSha256: sealedLive.releaseHeaderSha256,
    g002VerificationDigest: sealedLive.verificationDigest,
    g002AllowedFids: sealedLive.allowedFids,
    g002AccessRequests: sealedLive.accessRequests,
    g002PlayersV1: sealedLive.playersV1,
    g002PlayersV2: sealedLive.playersV2,
    g002OwnershipBindings: sealedLive.ownershipBindings,
    g002Founders: sealedLive.founders,
    g002Castles: sealedLive.castles,
    g002RealmProfiles: sealedLive.realmProfiles,
    g002TermsAcceptances: sealedLive.termsAcceptances,
    g002MarkAccounts: sealedLive.markAccounts,
    g002ResourceAccounts: sealedLive.resourceAccounts,
    g002Claims: sealedLive.claimRows,
    g002Occupancies: sealedLive.occupancyRows,
    g002ActivationRows: sealedLive.activationRows,
    g002WorkerSystemRows: sealedLive.workerSystemRows,
    g002AtlasReady: sealedLive.atlasState === 'ready',
    g002AtlasFinalized: sealedLive.atlasFinalized,
    g002AtlasWritesClosedByFinalization:
      sealedLive.atlasWritesClosedByFinalization,
    g002AtlasImportMutationsEnabled: publish.atlasImportMutationsEnabled,
    g002AtlasActivationMutationsEnabled:
      sealedLive.activationMutationsEnabled,
    g002PlayerAccessEnabled: publish.playerAccessEnabled,
    g002AdmissionMutationsEnabled: publish.admissionMutationsEnabled,
    ptrPublishReceiptDigest: ptrPublishDigest,
    ptrFreshStatusDigest: ptrPublish.freshStatusDigest,
    ptrAtlasImportReceiptDigest: ptrAtlasImportDigest,
    ptrSealedLiveReceiptDigest: ptrLiveDigest,
    ptrOwnerProvisionReceiptDigest: ptrOwnerProvisionDigest,
    ptrDatabaseIdentity: ptrPublish.databaseIdentity,
    ptrModuleSourceCommit: ptrPublish.sourceCommit,
    ptrModuleSha256: ptrPublish.moduleSha256,
    ptrModuleTreeId: ptrPublish.moduleTreeId,
    ptrDependencyClosureDigest: ptrPublish.dependencyClosureDigest,
    ptrSpacetimeExecutableSha256: ptrPublish.spacetimeExecutableSha256,
    ptrSpacetimeCliConfigSha256: ptrPublish.spacetimeCliConfigSha256,
    ptrAtlasSourceCommit: ptrAtlasImport.atlasSourceCommit,
    ptrAtlasId: ptrAtlasImport.atlasId,
    ptrPublicReleaseId: ptrAtlasImport.publicReleaseId,
    ptrReleaseVersion: ptrSealedLive.releaseVersion,
    ptrReleaseManifestSha256: ptrAtlasImport.releaseManifestSha256,
    ptrExpectedReleaseSha256: ptrAtlasImport.expectedReleaseSha256,
    ptrReleaseHeaderSha256: ptrAtlasImport.releaseHeaderSha256,
    ptrVerificationDigest: ptrAtlasImport.verificationDigest,
    ptrAllowedFids: ptrSealedLive.allowedFids,
    ptrAccessRequests: ptrSealedLive.accessRequests,
    ptrPlayersV1: ptrSealedLive.playersV1,
    ptrPlayersV2: ptrSealedLive.playersV2,
    ptrOwnershipBindings: ptrSealedLive.ownershipBindings,
    ptrCastles: ptrSealedLive.castles,
    ptrRealmProfiles: ptrSealedLive.realmProfiles,
    ptrTermsAcceptances: ptrSealedLive.termsAcceptances,
    ptrMarkAccounts: ptrSealedLive.markAccounts,
    ptrResourceAccounts: ptrSealedLive.resourceAccounts,
    ptrClaims: ptrSealedLive.claimRows,
    ptrOccupancies: ptrSealedLive.occupancyRows,
    ptrActivationRows: ptrSealedLive.activationRows,
    ptrPublicAtlasRows: ptrSealedLive.publicAtlasRows,
    ptrPublicRegionRows: ptrSealedLive.publicRegionRows,
    ptrWorkerSystemRows: ptrSealedLive.workerSystemRows,
    ptrAtlasReady: ptrSealedLive.atlasState === 'ready',
    ptrAtlasFinalized: ptrSealedLive.atlasFinalized,
    ptrAtlasWritesClosedByFinalization:
      ptrSealedLive.atlasWritesClosedByFinalization,
    ptrAtlasImportsExact: ptrSealedLive.atlasImportsExact,
    ptrAtlasImportMutationsCompiled:
      ptrSealedLive.atlasImportMutationsCompiled,
    ptrAtlasActivationMutationsCompiled:
      ptrSealedLive.atlasActivationMutationsCompiled,
    ptrOwnerAnchorRows: ptrSealedLive.ownerAnchorRows,
    ptrOwnerProvisioned: ptrSealedLive.ownerProvisioned,
    ptrOwnerEnabled: ptrSealedLive.ownerEnabled,
    ptrAdmissionsOpen: ptrSealedLive.admissionsOpen,
    ptrAccessRequestsOpen: ptrSealedLive.accessRequestsOpen,
    ptrAdmissionSurfacePresent: ptrSealedLive.admissionSurfacePresent,
    ptrAccessRequestSurfacePresent:
      ptrSealedLive.accessRequestSurfacePresent,
    g002PresentationEnabled: sealedLive.playerPresentationEnabled,
    ptrPresentationEnabled: ptrSealedLive.playerPresentationEnabled,
    legacyGreaterRealmClientPresentationEnabled:
      sealedLive.playerPresentationEnabled,
    legacyGreaterRealmServerPresentationEnabled:
      sealedLive.playerPresentationEnabled,
    admissionNotificationsEnabled: sealedLive.admissionNotificationsEnabled,
  };
  return createSealedLaunchActivationBinding(binding);
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

/**
 * Read one canonical, owner-private evidence projection from a descriptor and
 * return only the public release binding with freshly derived commitments.
 */
export function generateSealedLaunchActivationBindingFromDescriptor(
  descriptor = 0,
  testOnlyPreparationBootstrapAuthority,
) {
  let storage;
  let bytes;
  try {
    const named = fstatSync(descriptor, { bigint: true });
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || named.nlink !== 1n
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 2n
      || named.size > BigInt(MAXIMUM_CANDIDATE_BYTES)
      || (process.getuid !== undefined && named.uid !== BigInt(process.getuid()))
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameFile(named, before)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    storage = Buffer.alloc(Number(named.size) + 1);
    let offset = 0;
    while (offset < storage.byteLength) {
      const count = readSync(
        descriptor,
        storage,
        offset,
        storage.byteLength - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset !== Number(named.size)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    bytes = storage.subarray(0, offset);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, after)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    let envelope;
    try {
      envelope = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    }
    if (`${JSON.stringify(envelope, null, 2)}\n` !== bytes.toString('utf8')) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_NONCANONICAL');
    }
    try {
      return createSealedLaunchActivationBindingFromEvidence(
        envelope,
        testOnlyPreparationBootstrapAuthority,
      );
    } catch {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    }
  } catch (error) {
    if (error instanceof SealedLaunchActivationGeneratorError) throw error;
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  } finally {
    bytes?.fill(0);
    storage?.fill(0);
  }
}

async function main() {
  if (process.argv.length !== 2) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_ARGUMENT_INVALID');
  }
  const binding = generateSealedLaunchActivationBindingFromDescriptor(0);
  process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`${
      error instanceof SealedLaunchActivationGeneratorError
        ? error.code
        : 'SEALED_LAUNCH_ACTIVATION_GENERATOR_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
