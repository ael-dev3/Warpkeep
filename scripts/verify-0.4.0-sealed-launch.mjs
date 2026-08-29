import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  fstatSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SEALED_LAUNCH_PROFILE = 'warpkeep-0.4.0-sealed-launch-v1';
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
const GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT =
  'd945256b217fa13ade944b9ed9880e8463b46123';
const GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256 =
  '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63';
const GENESIS_001_POLICY_RECEIPT_SHA256 =
  'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60';
const GENESIS_001_LEGACY_LAUNCH_ENVELOPE_SHA256 =
  'ffaa86e602b08d5a3b5994120a822194860b64d8ee117dea4d454b28fde7594a';
const GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256 =
  '9c126f8ab9a5b3504c47585c84b721c8d5b0dc005ce4e3af3207e7fab6c7cdff';
const GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_SOURCE_SHA256 =
  'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a';
const GENESIS_001_POLICY_OBSERVATION_SOURCE_SHA256 =
  '15ee745ddb38e3bf8206c145b3cc9e6ac4181194b0d93945266f9e90cbb87378';
const GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_SHA256 =
  '10c8286a38ac81a5672280dcede60f712a95bc78af2f263e3ee8cc40d4afd5ac';
const GENESIS_001_SEALED_LAUNCH_ADOPTION_SOURCE_SHA256 =
  'ddcf3040c98c98bb49ed2cf38dafeca0cd3b8c2a1d1a684d34be57adb0fa59bf';
const SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_SHA256 =
  '76ad949891c5818d0f9a52422d429994417b9a9214b2ea45fe796040a7b76061';
const SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256 =
  '6acda41b70c4b6689c3b46efa9ac997ab96172feed6af39b65f36ba9de1dd243';
const SEALED_LAUNCH_LOCK_STRUCTURE_SHA256 =
  'ceae3fad060d69c711938973c04a70fbda46fbcfeb0e1ad19f87caa0c9252e1f';
const RELEASE_VERSION_DIGEST_PLACEHOLDER = '<release-version>';
const GENESIS_001_POLICY_OBSERVATION_ENVELOPE_HEADER = Buffer.from([
  '# GENESIS 001 POLICY OBSERVATION - SEALED 0.4.0',
  '#',
  '# Dedicated review copy. The only production operator admitted by this envelope',
  '# is the read-only `g001-policy-observe` command. The only other admitted rows',
  '# are local launch-lifecycle inspection and confirmed cleanup; neither opens a',
  '# credential or network boundary.',
  '#',
  '# This file is a review copy, not an executable. The supported production',
  '# invocation supplies these exact bytes from the protected S release packet to:',
  "#   /usr/bin/env -i /bin/sh -c '<EXACT_REVIEWED_TEXT>' warpkeep-production \\",
  '#     PROTECTED_MAIN_40 TREE_40 BOOTSTRAP_BLOB_40 BOOTSTRAP_SHA256_64 \\',
  '#     ABSOLUTE_SIGNED_NODE ABSOLUTE_SPACETIME_OR_DASH \\',
  '#     ABSOLUTE_SPACETIME_CLI_CONFIG_OR_DASH ABSOLUTE_ADMIN_SECRET \\',
  '#     ABSOLUTE_NOTIFICATION_SECRET_OR_DASH ABSOLUTE_PRIVATE_INPUT_OR_DASH \\',
  '#     COMMAND [COMMAND_ARGUMENTS...]',
  '# `g001-policy-observe` takes no command arguments and requires only the signed',
  '# Node runtime plus the owner-private administrator-secret path. Spacetime,',
  '# Spacetime CLI configuration, notification-secret, and private-input slots are',
  '# all `-`.',
  '# The local lifecycle rows use six `-` runtime/credential slots:',
  '#     launch-run-inspect [RUN_ID]',
  '#     launch-run-cleanup RUN_ID CONFIRMATION_DIGEST',
  '# Run the production operator only while S remains protected remote main. Its',
  '# receipt becomes eligible only after the enclosing bootstrap succeeds,',
  '# postflight completes, and cleanup is confirmed. Use the lifecycle rows to',
  '# inspect or recover an interrupted run.',
  '# Never execute this file by pathname from a mutable checkout.',
  '',
].join('\n'), 'utf8');
const GENESIS_001_POLICY_OBSERVATION_ENVELOPE_SUBSTITUTIONS = Object.freeze([
  Object.freeze([
    Buffer.from(
      '  import-inspect|import-apply|import-recover-inspect|import-recover|publish|publish-recover-inspect|publish-recover|relocation|relocation-recover-inspect|relocation-recover|verify|pages-active-evidence|hermes-list-pending|hermes-admit-dry|hermes-admit-confirm|hermes-allow-dry|hermes-allow-confirm|hermes-notification-inspect|hermes-notification-recover-dry|hermes-notification-recover-confirm|launch-run-inspect|launch-run-cleanup) ;;',
    ),
    Buffer.from(
      '  g001-policy-observe|launch-run-inspect|launch-run-cleanup) ;;',
    ),
  ]),
  Object.freeze([
    Buffer.from(
      '  import-inspect|import-apply|publish|relocation|verify|pages-active-evidence|hermes-list-pending|hermes-admit-confirm|hermes-allow-confirm|hermes-notification-recover-dry|hermes-notification-recover-confirm)',
    ),
    Buffer.from('  g001-policy-observe)'),
  ]),
  Object.freeze([
    Buffer.from('  hermes-list-pending)\n'),
    Buffer.from('  g001-policy-observe)\n'),
  ]),
]);
export const GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'spacetimedb/package.json',
  'spacetimedb/pnpm-lock.yaml',
  'spacetimedb/pnpm-workspace.yaml',
  'spacetimedb/tsconfig.json',
  'spacetimedb/src',
  'spacetimedb/scripts',
  'scripts/genesis001-frozen-materializer.mjs',
  'scripts/genesis001-frozen-materializer.d.mts',
  'scripts/genesis001-frozen-publisher-core.ts',
  'scripts/genesis001-frozen-publisher-runtime.ts',
  'scripts/genesis001-frozen-publisher.ts',
  'scripts/greater-realm-production-immutable-artifact.ts',
  'scripts/greater-realm-production-provenance.ts',
  'scripts/greater-realm-production-transport.ts',
  'scripts/production-admin-token-budget.mjs',
  'scripts/publish-spacetime-dev.mjs',
  'scripts/spacetime-cli-attestation.mjs',
  'scripts/hermes-admin.ts',
  'scripts/hermes-machine-output.ts',
  'scripts/founder-admission-authority.ts',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/access-requests/reset-plan.ts',
  'scripts/admission-notifications/recovery-plan.ts',
  'scripts/genesis001-census-privacy-safe-receipt.mjs',
  'scripts/genesis001-admission-monitor-suspension.ts',
  'scripts/greater-realm-legacy-production-seal.mjs',
  'scripts/greater-realm-production-publisher.ts',
  'scripts/greater-realm-production-publisher-core.ts',
  'scripts/greater-realm-production-import-operator.ts',
  'scripts/greater-realm-production-relocation-operator.ts',
  'scripts/greater-realm-downstream-release-policy.ts',
  'docs/operations/greater-realm-production-launch-envelope.sh.txt',
]);
const SEALED_LAUNCH_ACTIVATION_PATHS = Object.freeze([
  'config/releases/0.4.0-sealed-launch.json',
  'package-lock.json',
  'package.json',
]);

const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
export const SEALED_LAUNCH_SOURCE_PATHS = Object.freeze({
  packageJson: 'package.json',
  packageLockJson: 'package-lock.json',
  viteConfigSource: 'vite.config.ts',
  buildInfoSource: 'src/build/buildInfo.ts',
  bindingJson: 'config/releases/0.4.0-sealed-launch.json',
  genesis001PolicySource: 'spacetimedb/src/genesis001AccessPolicy.ts',
  genesis001PolicyReceiptSource:
    'spacetimedb/src/reducers/genesis001AccessPolicy.ts',
  genesis001SchemaSource: 'spacetimedb/src/schema.ts',
  genesis001IndexSource: 'spacetimedb/src/index.ts',
  genesis001FrozenMaterializerSource:
    'scripts/genesis001-frozen-materializer.mjs',
  genesis001FrozenPublisherCoreSource:
    'scripts/genesis001-frozen-publisher-core.ts',
  genesis001FrozenPublisherRuntimeSource:
    'scripts/genesis001-frozen-publisher-runtime.ts',
  genesis001FrozenPublisherCliSource:
    'scripts/genesis001-frozen-publisher.ts',
  genesis001CensusPrivacySafeReceiptSource:
    'scripts/genesis001-census-privacy-safe-receipt.mjs',
  genesis001AdmissionMonitorSuspensionSource:
    'scripts/genesis001-admission-monitor-suspension.ts',
  genesis001AdmissionMonitorCurrentStateSource:
    'scripts/genesis001-admission-monitor-current-state.mjs',
  genesis001AdmissionMonitorCurrentStateDeclaration:
    'scripts/genesis001-admission-monitor-current-state.d.mts',
  genesis001SealedLaunchAdoptionSource:
    'scripts/genesis001-sealed-launch-adoption.mjs',
  genesis001PolicyObservationReceiptSource:
    'scripts/genesis001-policy-observation-receipt.mjs',
  genesis001PolicyObservationLaunchEnvelopeSource:
    'docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt',
  genesis001LegacyGreaterRealmProductionSealSource:
    'scripts/greater-realm-legacy-production-seal.mjs',
  legacyGreaterRealmProductionBootstrapSource:
    'scripts/greater-realm-production-bootstrap.mjs',
  legacyGreaterRealmProductionPublisherCliSource:
    'scripts/greater-realm-production-publisher.ts',
  legacyGreaterRealmProductionImportOperatorSource:
    'scripts/greater-realm-production-import-operator.ts',
  legacyGreaterRealmProductionRelocationOperatorSource:
    'scripts/greater-realm-production-relocation-operator.ts',
  legacyGreaterRealmProductionLaunchEnvelopeSource:
    'docs/operations/greater-realm-production-launch-envelope.sh.txt',
  genesis002ContractSource: 'spacetimedb/genesis002/src/contract.ts',
  genesis002PolicySource: 'spacetimedb/genesis002/src/policy.ts',
  genesis002PopulationSource: 'spacetimedb/genesis002/src/population.ts',
  genesis002StatusSource: 'spacetimedb/genesis002/src/reducers.ts',
  genesis002SchemaSource: 'spacetimedb/genesis002/src/schema.ts',
  genesis002LifecycleSource: 'spacetimedb/genesis002/src/lifecycle.ts',
  genesis002IndexSource: 'spacetimedb/genesis002/src/index.ts',
  genesis002AtlasImportSource:
    'spacetimedb/genesis002/src/atlasImportReducers.ts',
  genesis002PackageJson: 'spacetimedb/genesis002/package.json',
  genesis002TsconfigJson: 'spacetimedb/genesis002/tsconfig.json',
  spacetimeWorkspacePackageJson: 'spacetimedb/package.json',
  spacetimeWorkspaceLock: 'spacetimedb/pnpm-lock.yaml',
  spacetimeWorkspaceDefinition: 'spacetimedb/pnpm-workspace.yaml',
  genesis002PublisherCoreSource: 'scripts/genesis002-production-publisher.mjs',
  genesis002PublisherCliSource:
    'scripts/genesis002-production-publisher-cli.ts',
  genesis002ImportCoreSource: 'scripts/genesis002-production-import-core.ts',
  genesis002ImportOperatorSource:
    'scripts/genesis002-production-import-operator.ts',
  genesis002TransportSource: 'scripts/genesis002-production-transport.ts',
  genesis002LiveReceiptSource: 'scripts/genesis002-sealed-live-receipt.mjs',
  genesis002ActivationReceiptsSource:
    'scripts/genesis002-activation-receipts.mjs',
  genesis002PrivateLoopbackSource:
    'scripts/genesis002-private-loopback-verifier.ts',
  activationGeneratorSource:
    'scripts/generate-0.4.0-sealed-launch-activation.mjs',
  atlasContractSource: 'scripts/atlas/greater-realm-contracts.ts',
  atlasRuntimeReleaseSource: 'scripts/atlas/greater-realm-runtime-release.ts',
  atlasCliSource: 'scripts/atlas/greater-realm-cli.ts',
  immutableArtifactSource:
    'scripts/greater-realm-production-immutable-artifact.ts',
  legacyAtlasPolicySource: 'spacetimedb/src/greaterRealmV17Policy.ts',
  clientPresentationSource: 'src/spacetime/greaterRealmProviderBridge.ts',
  serverPresentationSource: 'src/greater-realm/greaterRealmTransport.ts',
  hermesSource: 'scripts/hermes-admin.ts',
  productionPublisherSource:
    'scripts/greater-realm-production-publisher-core.ts',
  downstreamPolicySource:
    'scripts/greater-realm-downstream-release-policy.ts',
  realmReleaseIdentitySource: 'src/release/realmReleaseIdentity.ts',
  ptrRealmConfigSource: 'src/ptr/ptrRealmConfig.ts',
  admissionLaunchPolicySource: 'src/release/admissionLaunchPolicy.ts',
  authBridgeSource: 'services/auth-bridge/src/app.ts',
  admissionRequestSuspensionProbeSource:
    'scripts/verify-admission-request-suspension.mjs',
  realmChoicePolicySource: 'src/components/menu/realmChoicePolicy.ts',
  realmChoiceSelectorSource: 'src/components/menu/RealmChoiceSelector.tsx',
  realmMenuSource: 'src/components/menu/WarpkeepMainMenu.tsx',
  farcasterManifestSource: 'public/.well-known/farcaster.json',
  farcasterContractSource: 'scripts/farcaster-miniapp-contract.mjs',
  latestPatchNotesSource: 'src/components/menu/latestPatchNotes.ts',
  verifyWorkflowSource: '.github/workflows/verify.yml',
  pagesWorkflowSource: '.github/workflows/deploy-pages.yml',
});
const BINDING_KEYS = Object.freeze([
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
const OPERATIONAL_BINDING_KEYS = Object.freeze(BINDING_KEYS.slice(
  BINDING_KEYS.indexOf('preparationSourceCommit'),
  BINDING_KEYS.indexOf('g002PresentationEnabled'),
));
const RECEIPT_COMMITMENT_DIGESTS = Object.freeze({
  g001FreezePublishReceiptCommitment: 'g001FreezePublishReceiptDigest',
  g001PolicyReceiptCommitment: 'g001PolicyReceiptDigest',
  g001PolicyObservationBootstrapReceiptCommitment:
    'g001PolicyObservationBootstrapReceiptDigest',
  g001CensusPrivacySafeReceiptCommitment:
    'g001CensusPrivacySafeReceiptDigest',
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

export class SealedLaunchVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedLaunchVerificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedLaunchVerificationError(code);
}

function parseJson(source, code) {
  try {
    return JSON.parse(source);
  } catch {
    return fail(code);
  }
}

function requireExactKeys(value, keys, code) {
  if (
    value === null
    || Array.isArray(value)
    || typeof value !== 'object'
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
}

function requireOnce(source, token, code) {
  if (
    typeof source !== 'string'
    || token.length < 1
    || source.split(token).length !== 2
  ) fail(code);
}

function requireAbsent(source, tokens, code) {
  if (tokens.some(token => source.includes(token))) fail(code);
}

function exactUtf8Bytes(source, code) {
  if (typeof source !== 'string') fail(code);
  const bytes = Buffer.from(source, 'utf8');
  try {
    if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== source) {
      fail(code);
    }
  } catch (error) {
    if (error instanceof SealedLaunchVerificationError) throw error;
    return fail(code);
  }
  return bytes;
}

function replaceUniqueBytes(source, before, after, code) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before)) fail(code);
  return Buffer.concat([
    source.subarray(0, first),
    after,
    source.subarray(first + before.byteLength),
  ]);
}

/**
 * Domain-separated commitment over every privacy-safe activation value and
 * one externally retained receipt digest. Any swapped or stale receipt makes
 * every reviewed commitment inconsistent with the checked-in binding.
 */
export function sealedLaunchReceiptCommitment(commitmentKey, binding) {
  const digestKey = RECEIPT_COMMITMENT_DIGESTS[commitmentKey];
  if (
    digestKey === undefined
    || binding === null
    || typeof binding !== 'object'
    || Array.isArray(binding)
    || !SHA256.test(binding[digestKey] ?? '')
  ) fail('SEALED_LAUNCH_RECEIPT_COMMITMENT_INVALID');
  const snapshot = Object.fromEntries(BINDING_KEYS
    .filter(key => !Object.hasOwn(RECEIPT_COMMITMENT_DIGESTS, key))
    .map(key => [key, binding[key]]));
  return createHash('sha256')
    .update(`warpkeep.0.4.0.sealed-launch.${commitmentKey}.v1\n`)
    .update(`${JSON.stringify(snapshot)}\n`)
    .digest('hex');
}

function parseBinding(source) {
  const binding = parseJson(source, 'SEALED_LAUNCH_BINDING_INVALID');
  requireExactKeys(binding, BINDING_KEYS, 'SEALED_LAUNCH_BINDING_INVALID');
  if (`${JSON.stringify(binding, null, 2)}\n` !== source) {
    fail('SEALED_LAUNCH_BINDING_NONCANONICAL');
  }
  if (
    binding.schemaVersion !== 1
    || binding.profile !== SEALED_LAUNCH_PROFILE
    || typeof binding.pagesDeploymentApproved !== 'boolean'
    || binding.g002PresentationEnabled !== false
    || typeof binding.ptrPresentationEnabled !== 'boolean'
    || binding.legacyGreaterRealmClientPresentationEnabled !== false
    || binding.legacyGreaterRealmServerPresentationEnabled !== false
    || binding.admissionNotificationsEnabled !== false
  ) fail('SEALED_LAUNCH_BINDING_INVALID');
  return binding;
}

function verifyPackageVersions(sources, expectedVersion) {
  const packageJson = parseJson(
    sources.packageJson,
    'SEALED_LAUNCH_PACKAGE_INVALID',
  );
  const packageLock = parseJson(
    sources.packageLockJson,
    'SEALED_LAUNCH_LOCK_INVALID',
  );
  if (
    `${JSON.stringify(packageJson, null, 2)}\n` !== sources.packageJson
    || `${JSON.stringify(packageLock, null, 2)}\n` !== sources.packageLockJson
    || packageJson?.name !== 'warpkeep'
    || packageJson.version !== expectedVersion
    || packageLock?.name !== 'warpkeep'
    || packageLock.version !== expectedVersion
    || packageLock.lockfileVersion !== 3
    || packageLock.packages?.['']?.name !== 'warpkeep'
    || packageLock.packages[''].version !== expectedVersion
  ) fail('SEALED_LAUNCH_RELEASE_IDENTITY_INVALID');
  packageJson.version = RELEASE_VERSION_DIGEST_PLACEHOLDER;
  packageLock.version = RELEASE_VERSION_DIGEST_PLACEHOLDER;
  packageLock.packages[''].version = RELEASE_VERSION_DIGEST_PLACEHOLDER;
  if (
    createHash('sha256')
      .update(`${JSON.stringify(packageJson, null, 2)}\n`)
      .digest('hex') !== SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256
    || createHash('sha256')
      .update(`${JSON.stringify(packageLock, null, 2)}\n`)
      .digest('hex') !== SEALED_LAUNCH_LOCK_STRUCTURE_SHA256
  ) fail('SEALED_LAUNCH_RELEASE_IDENTITY_INVALID');
}

function verifyGenesis001Policy(sources) {
  for (const token of [
    "realmId: 'GENESIS_001'",
    "releaseVersion: '0.3.43'",
    'playerAccessEnabled: true',
    'admissionStateMutationsEnabled: false',
    'accessRequestSubmissionsEnabled: false',
  ]) requireOnce(
    sources.genesis001PolicySource,
    token,
    'SEALED_LAUNCH_G001_POLICY_INVALID',
  );

  const receipt = sources.genesis001PolicyReceiptSource;
  for (const token of [
    "name: 'genesis_001_access_policy_v1'",
    'Genesis001AccessPolicyV1',
    'requireWarpkeepMetadataConnection',
    'return GENESIS_001_ACCESS_POLICY',
  ]) {
    if (!receipt.includes(token)) fail('SEALED_LAUNCH_G001_RECEIPT_WIRE_INVALID');
  }
  requireOnce(
    receipt,
    "name: 'genesis_001_access_policy_v1'",
    'SEALED_LAUNCH_G001_RECEIPT_WIRE_INVALID',
  );
  requireAbsent(
    receipt,
    ['ctx.db.', '.insert(', '.update(', '.delete('],
    'SEALED_LAUNCH_G001_RECEIPT_WIRE_INVALID',
  );
  requireOnce(
    sources.genesis001SchemaSource,
    "'genesis_001_access_policy_v1'",
    'SEALED_LAUNCH_G001_RECEIPT_SCHEMA_INVALID',
  );
  if (!sources.genesis001IndexSource.includes('genesis001AccessPolicyV1')) {
    fail('SEALED_LAUNCH_G001_RECEIPT_EXPORT_INVALID');
  }

  for (const token of [
    GENESIS_001_SOURCE_BASELINE_COMMIT,
    GENESIS_001_BASELINE_ABI_SHA256,
    GENESIS_001_FREEZE_RELEASE_NONCE,
    'G001_BASELINE',
    'G001_BASELINE_ABI_SHA256',
    'G001_FREEZE_NONCE',
    'spacetimedb',
  ]) {
    if (!sources.genesis001FrozenMaterializerSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_MATERIALIZER_INVALID');
    }
  }
  for (const token of [
    GENESIS_001_DATABASE_IDENTITY,
    'genesis_001_access_policy_v1',
    '--delete-data=never',
    'GENESIS001_FINAL_RECEIPT_PROFILE',
    'warpkeep-genesis-001-freeze-publish-final-receipt-v2',
    'warpkeep-genesis-001-frozen-build-provenance-v2',
    '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1',
    '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
    '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
    '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa',
    '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234',
    'publishGenesis001Frozen',
    'sourceBaselineCommit',
    'baselineAbiSha256',
    'freezeReleaseNonce',
    'buildProvenanceSha256',
    'livePolicyReceiptSha256',
  ]) {
    if (!sources.genesis001FrozenPublisherCoreSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_PUBLISHER_INVALID');
    }
  }
  requireAbsent(
    sources.genesis001FrozenPublisherCoreSource,
    [
      '--delete-data=always',
      "modulePath: 'spacetimedb'",
      "modulePath = 'spacetimedb'",
      'spacetimedb/src/index.ts',
    ],
    'SEALED_LAUNCH_G001_FUTURE_MODULE_PUBLISH_INVALID',
  );
  for (const token of [
    'materializeGenesis001Frozen',
    'writeGenesis001FrozenFinalReceipt',
    'inspectGenesis001FrozenFinalReceipt',
    'withGenesis001HistoricalLockedDependencyClosure',
    'GENESIS001_TRUSTED_NODE_TEAM',
    'input.cli.verify();',
    "PATH: '/usr/bin:/bin'",
  ]) {
    if (!sources.genesis001FrozenPublisherRuntimeSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_RUNTIME_INVALID');
    }
  }
  for (const token of [
    'createGenesis001FrozenPublisherDependencies',
    'createGenesis001SignalLatch',
    'requireGreaterRealmProductionTransportTarget',
    '--confirm-freeze-nonce=',
    "requiredExactPath(input.environment, 'SPACETIME_BIN')",
    "'WKG001_PRODUCTION_SPACETIME_CLI_CONFIG_PATH'",
    "'WKG001_PRODUCTION_ADMIN_SECRET_PATH'",
    "'WKG001_NODE_EXECUTABLE_PATH'",
    "'WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT'",
  ]) {
    if (!sources.genesis001FrozenPublisherCliSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_PUBLISHER_CLI_INVALID');
    }
  }
  requireOnce(
    sources.genesis001FrozenPublisherCliSource,
    'cli = attestGenesis001PinnedCli(executable, configuration.childEnvironment);',
    'SEALED_LAUNCH_G001_FROZEN_PUBLISHER_CLI_INVALID',
  );
  requireAbsent(
    `${sources.genesis001FrozenPublisherRuntimeSource}\n${sources.genesis001FrozenPublisherCliSource}`,
    ['WKG001_PNPM_EXECUTABLE_PATH', 'WKG001_PNPM_STORE_PATH', "executable: '/bin/bash'"],
    'SEALED_LAUNCH_G001_FROZEN_RUNTIME_INVALID',
  );
  for (const token of [
    'withGenesis001HistoricalLockedDependencyClosure',
    'warpkeep-genesis-001-historical-root-dependency-closure-v1',
    'GENESIS001_HISTORICAL_LOCKED_PACKAGE_KEYS',
    '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234',
    '600b829bb2fd9c991ff918085539e527ecba3c2609bfffe35a9cf6ce3ad7b84f',
  ]) {
    if (!sources.immutableArtifactSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_RUNTIME_INVALID');
    }
  }
}

function verifyGenesis001SealedLaunchAdoption(sources) {
  if (
    createHash('sha256')
      .update(sources.genesis001SealedLaunchAdoptionSource)
      .digest('hex') !== GENESIS_001_SEALED_LAUNCH_ADOPTION_SOURCE_SHA256
  ) fail('SEALED_LAUNCH_G001_ADOPTION_INVALID');
  if (
    createHash('sha256')
      .update(sources.genesis001PolicyObservationReceiptSource)
      .digest('hex') !== GENESIS_001_POLICY_OBSERVATION_SOURCE_SHA256
  ) fail('SEALED_LAUNCH_G001_POLICY_OBSERVATION_INVALID');
  for (const token of [
    GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
    GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
    "'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1\\n'",
    "const evidence = plainRecord(value, ['first', 'second'], true);",
    '/^0{64}$/u.test(receipt.privateBlindingNonceHex)',
    'firstReference.sha256 !== secondReference.sha256',
    'separation < MINIMUM_STABLE_CENSUS_SEPARATION_MS',
    'separation > MAXIMUM_STABLE_CENSUS_SEPARATION_MS',
    'policyObservedAt > census.firstObservedAt',
    'census.secondObservedAt',
    '> Date.parse(monitor.evidence.receipt.suspendedAt)',
    "'policyObservationBootstrapReceipt',",
    "'admissionMonitorCurrentStateReceipt',",
    "'warpkeep-production-g001-policy-observation-bootstrap-link-v1'",
    "'warpkeep.genesis-001.policy-observation-bootstrap-receipt.v1\\n'",
    "'warpkeep.genesis-001.admission-monitor-current-state-receipt.v1\\n'",
    'receipt.moduleArchiveCount !== 16',
    "receipt.command !== 'g001-policy-observe'",
    "cleanup.outcome !== 'cleaned'",
    'genesis001PolicyObservationBootstrapLinkDigest(receipt)',
    'verifiedAt - monitorCurrent.observedAt',
    '> MAXIMUM_MONITOR_CURRENT_STATE_AGE_MS',
    'census.firstObservedAt - policyObservedAt',
    '> MAXIMUM_POLICY_TO_FIRST_CENSUS_AGE_MS',
    'verifiedAt - policyObservedAt > MAXIMUM_POLICY_OBSERVATION_AGE_MS',
    'return sha256(`${canonicalJson(value)}\\n`);',
    'return descriptorDigest(exactPolicy(value));',
    'return sha256(CENSUS_PROOF_DOMAIN, `${JSON.stringify(proof)}\\n`);',
    'return sha256(`${JSON.stringify(value)}\\n`);',
    'export function deriveGenesis001SealedLaunchEvidence(value)',
  ]) {
    if (!sources.genesis001SealedLaunchAdoptionSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_ADOPTION_INVALID');
    }
  }
  for (const token of [
    "GENESIS_001_POLICY_OBSERVATION_PROCEDURE =\n  'genesis_001_access_policy_v1'",
    "import { setGlobalLogLevel } from 'spacetimedb';",
    "from './greater-realm-production-provenance.ts'",
    "from './greater-realm-production-transport.ts'",
    'attestGreaterRealmProductionProtectedMain',
    'readGreaterRealmProductionAdminSecretFile',
    'createGreaterRealmAdminTransportSession',
    "key.startsWith('WARPKEEP_ADMIN_TOKEN_SECRET')",
    "key.startsWith('WKGR_PRODUCTION_NOTIFICATION_SECRET')",
    'for (const key of TRUSTED_BOOTSTRAP_BINDINGS) delete environment[key];',
    'input.testOnlyDependencies !== undefined',
    "process.env.NODE_ENV !== 'test'",
    'const attestedSource = dependencies.attestProtectedMain(input.repositoryRoot);',
    'session = dependencies.createSession({ adminSecret });',
    "adminSecret = '';",
    'await session.invalidate();',
    'await session.inspect(',
    'await session.close();',
    'mutationSubmitted: false',
    "setGlobalLogLevel('error');",
    'captureGenesis001PolicyObservationBootstrapAuthority(',
    'process.stdout.write(`${JSON.stringify(receipt)}\\n`);',
  ]) {
    if (!sources.genesis001PolicyObservationReceiptSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_POLICY_OBSERVATION_INVALID');
    }
  }
  for (const token of [
    "adminSecret = '';",
    'await session.invalidate();',
    'await session.inspect(',
    'await session.close();',
  ]) requireOnce(
    sources.genesis001PolicyObservationReceiptSource,
    token,
    'SEALED_LAUNCH_G001_POLICY_OBSERVATION_INVALID',
  );
  requireAbsent(
    sources.genesis001PolicyObservationReceiptSource,
    [
      'node_modules/tsx',
      'spawnSync',
      'process.execPath',
      'session.submit',
      'session.prepareSubmission',
    ],
    'SEALED_LAUNCH_G001_POLICY_OBSERVATION_INVALID',
  );
  requireOnce(
    sources.legacyGreaterRealmProductionBootstrapSource,
    [
      "  'g001-policy-observe': Object.freeze({",
      "    entrypoint: 'scripts/genesis001-policy-observation-receipt.mjs',",
      "    exactArguments: Object.freeze(['observe']),",
      '    privateInput: false,',
      '    requiresAdminSecret: true,',
      '  }),',
    ].join('\n'),
    'SEALED_LAUNCH_G001_POLICY_OBSERVATION_BOOTSTRAP_INVALID',
  );
  const bootstrap = sources.legacyGreaterRealmProductionBootstrapSource;
  const bootstrapCode =
    'SEALED_LAUNCH_G001_POLICY_OBSERVATION_BOOTSTRAP_INVALID';
  if (
    createHash('sha256').update(bootstrap).digest('hex')
      !== GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_SOURCE_SHA256
  ) fail(bootstrapCode);
  for (const token of [
    'const MAXIMUM_G001_POLICY_OBSERVER_STREAM_BYTES = 16 * 1024;',
    "const G001_POLICY_OBSERVATION_COMMAND = 'g001-policy-observe';",
    'function createBoundedGenesis001PrivateChildStreamCapture(',
    "'warpkeep-production-g001-policy-observation-bootstrap-link-v1'",
    "'GREATER_REALM_PRODUCTION_BOOTSTRAP_G001_POLICY_OBSERVATION_OUTPUT_INVALID'",
    "'GREATER_REALM_PRODUCTION_BOOTSTRAP_G001_POLICY_OBSERVATION_STDERR_INVALID'",
    "launchCleanup.outcome !== 'cleaned'",
    'policyObservationReceiptLinkSha256:',
    'policyObservationErrorCapture.consume(output => {',
    'if (output.length !== 0) {',
    'output => parseGenesis001PolicyObservationOutput(output, input.commit)',
  ]) {
    if (!bootstrap.includes(token)) fail(bootstrapCode);
  }
  if (
    bootstrap.split("capturesPolicyObservation ? 'pipe' : 'inherit'").length !== 3
  ) fail(bootstrapCode);
  const finalization = bootstrap.slice(
    bootstrap.indexOf('async function completeBootstrapLaunch(input)'),
    bootstrap.indexOf('\nfunction packageNameAndVersion(',
      bootstrap.indexOf('async function completeBootstrapLaunch(input)')),
  );
  const operator = finalization.indexOf('runOperatorWithPostflightAttestation(');
  const runtime = finalization.indexOf('await input.reattestRuntime();');
  const complete = finalization.indexOf('await input.completeLaunchRecord(');
  const cleanup = finalization.indexOf('await input.cleanupCompletedRun(');
  const linked = finalization.indexOf('const linked = Object.freeze({');
  const returned = finalization.indexOf('return linked;');
  if (
    createHash('sha256').update(finalization).digest('hex')
      !== GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256
    || operator < 0
    || runtime <= operator
    || complete <= runtime
    || cleanup <= complete
    || linked <= cleanup
    || returned <= linked
    || finalization.includes('process.stdout')
  ) fail(bootstrapCode);
}

function verifyGenesis002Policy(sources) {
  for (const token of [
    'allowedFids: ctx.db.allowedFid.count()',
    'accessRequests: ctx.db.accessRequestV1.count()',
    'playersV1: ctx.db.player.count()',
    'playersV2: ctx.db.playerV2.count()',
    'ownershipBindings: ctx.db.playerOwnershipV2.count()',
    'castles: ctx.db.castle.count()',
    'realmProfiles: ctx.db.realmProfileV1.count()',
    'termsAcceptances: ctx.db.alphaTermsAcceptanceV1.count()',
    'markAccounts: ctx.db.markAccountV1.count()',
    'resourceAccounts: ctx.db.resourceAccountV1.count()',
    'castleClaims: ctx.db.greaterRealmCastleClaimV1.count()',
    'cellOccupancies: ctx.db.greaterRealmCellOccupancyV1.count()',
    'activationRows: ctx.db.greaterRealmActivationV1.count()',
    'workerSystemRows: ctx.db.realmWorkerSystemV2.count()',
  ]) requireOnce(
    sources.genesis002PopulationSource,
    token,
    'SEALED_LAUNCH_G002_POPULATION_BOUNDARY_INVALID',
  );
  for (const token of [
    'requireGenesis002Admin(tx);',
    'requireGenesis002PopulationEmpty(tx);',
    'const population = genesis002PopulationSnapshot(tx);',
    '...population,',
  ]) {
    if (!sources.genesis002StatusSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_STATUS_INVALID');
    }
  }
  for (const token of [
    "GENESIS_002_REALM_ID = 'GENESIS_002'",
    "GENESIS_002_DATABASE_NAME = 'warpkeep-genesis-002'",
    "GENESIS_002_MODULE_IDENTITY = 'warpkeep-genesis-002-sealed-v1'",
    "GENESIS_002_RELEASE_VERSION = '0.4.0'",
    "GENESIS_002_ATLAS_ID = 'GENESIS_002_GREATER_REALM'",
    'admissionsOpen: false',
    'accessRequestsOpen: false',
    'admittedPlayers: 0n',
    'founders: 0n',
    'importMutationsEnabled: true',
    'activationMutationsEnabled: false',
    'playerPresentationEnabled: false',
  ]) requireOnce(
    sources.genesis002ContractSource,
    token,
    'SEALED_LAUNCH_G002_CONTRACT_INVALID',
  );
  for (const mutation of [
    'access_request_submit_v1',
    'admin_allow_fid',
    'admin_allow_fid_for_access_request_v1',
    'admin_admit_founder_v1',
    'admin_admit_founder_for_access_request_v2',
    'admin_disable_fid',
    'admin_bump_auth_epoch',
    'admin_reset_access_request_v1',
    'bootstrap_player',
    'bootstrap_player_v2',
    'accept_alpha_terms_v1',
    'admin_upsert_realm_profile_v1',
  ]) requireOnce(
    sources.genesis002ContractSource,
    `'${mutation}'`,
    'SEALED_LAUNCH_G002_MUTATION_SET_INVALID',
  );
  requireOnce(
    sources.genesis002PolicySource,
    "readonly code = 'GENESIS_002_ADMISSIONS_SEALED'",
    'SEALED_LAUNCH_G002_POLICY_INVALID',
  );
  if (
    sources.genesis002PolicySource
      .split('assertGenesis002PopulationEmpty(readPopulation());').length !== 3
    || !sources.genesis002PolicySource.includes(
      'throw new Genesis002AdmissionsSealedError(mutation);',
    )
  ) fail('SEALED_LAUNCH_G002_POLICY_INVALID');

  const modulePackage = parseJson(
    sources.genesis002PackageJson,
    'SEALED_LAUNCH_G002_PACKAGE_INVALID',
  );
  if (
    modulePackage.name !== 'warpkeep-genesis-002-spacetimedb-module'
    || modulePackage.version !== '0.4.0'
    || modulePackage.private !== true
  ) fail('SEALED_LAUNCH_G002_PACKAGE_INVALID');
  for (const token of [
    'const genesis002 = schema(genesis002Tables);',
    'greaterRealmReleaseV1,',
    'greaterRealmChunkV1,',
    'greaterRealmCellV1,',
    'greaterRealmCastleSlotV1,',
    'greaterRealmResourceNodeV1,',
    'realmAtlasV1,',
  ]) {
    if (!sources.genesis002SchemaSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_SCHEMA_INVALID');
    }
  }
  for (const token of [
    "tableAccess: { tag: 'Private' }",
    'GENESIS_002_PRIVATE_TABLE_COUNT = 23',
    'makeGenesis002PrivateTable(',
  ]) {
    if (!sources.genesis002SchemaSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PRIVATE_SCHEMA_INVALID');
    }
  }
  if (
    sources.genesis002SchemaSource.split('makeGenesis002PrivateTable(').length
      !== 24
    || /public:\s*true/u.test(sources.genesis002SchemaSource)
  ) fail('SEALED_LAUNCH_G002_PRIVATE_SCHEMA_INVALID');
  requireAbsent(
    sources.genesis002SchemaSource,
    ['export { default } from', 'ScheduleV1', 'productionPlayerCanary'],
    'SEALED_LAUNCH_G002_SCHEMA_INVALID',
  );
  for (const token of [
    'genesis002.clientConnected',
    'requireGenesis002Admin(ctx)',
    'requireGenesis002PopulationEmpty(ctx)',
  ]) {
    if (!sources.genesis002LifecycleSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_LIFECYCLE_INVALID');
    }
  }
  requireAbsent(
    sources.genesis002IndexSource,
    [
      "from '../../src/index'",
      'greaterRealmCutover',
      'adminCommitGreaterRealmActive',
    ],
    'SEALED_LAUNCH_G002_ROOT_INVALID',
  );
  for (const token of [
    'withGenesis002AtlasImportBoundary',
    'requireGenesis002PopulationEmpty',
    'requireGenesis002Admin',
    'activationMutationsCompiled: GENESIS_002_ATLAS_POLICY.activationMutationsEnabled',
    "if (atlasId !== GENESIS_002_ATLAS_ID) fail('GENESIS_002_ATLAS_ID_INVALID')",
  ]) {
    if (!sources.genesis002AtlasImportSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_ATLAS_BOUNDARY_INVALID');
    }
  }
  for (const token of [
    "database: 'warpkeep-genesis-002'",
    "moduleIdentity: 'warpkeep-genesis-002-sealed-v1'",
    "modulePath: 'spacetimedb/genesis002'",
    "deleteData: 'never'",
    'withGreaterRealmLockedSourceBuild',
    'attestPinnedSpacetimeCli',
    "publishArtifactPath: '/dev/fd/3'",
    'verifyGenesis002GeneratedAbi',
    'publicTables',
    'publicTableCount: 0',
    "join(directory, 'generated-public')",
    'GENESIS_002_MODULE_ABI_INVALID',
    'constants.O_NOFOLLOW',
    'spacetimeCliConfigSha256',
    "'--config-path', spacetimeCliConfigPath",
    'GENESIS_002_DATABASE_ALREADY_EXISTS',
    'GENESIS_002_TARGET_COLLIDES_WITH_GENESIS_001',
    'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
  ]) {
    if (!sources.genesis002PublisherCoreSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PUBLISHER_INVALID');
    }
  }
  requireAbsent(
    sources.genesis002PublisherCoreSource,
    ["'HOME'", 'WARPKEEP_ADMIN_TOKEN_SECRET'],
    'SEALED_LAUNCH_G002_PUBLISHER_ENVIRONMENT_INVALID',
  );
  for (const token of [
    "export { genesis002PublishReceiptDigest } from './genesis002-activation-receipts.mjs';",
    'publishReceiptDigest: genesis002PublishReceiptDigest(receipt),',
  ]) requireOnce(
    sources.genesis002PublisherCoreSource.replaceAll('\n', ' '),
    token,
    'SEALED_LAUNCH_G002_PUBLISH_RECEIPT_INVALID',
  );
  for (const token of [
    'export function genesis002PublishReceiptDigest(receipt)',
    'warpkeep.genesis-002.production-publish-receipt.v1\\n',
    'export function genesis002ProductionImportReceiptDigest(receipt)',
    'warpkeep.genesis-002.production-import-receipt.v1\\n',
    'Object.is(receipt.operationsSubmitted, -0)',
    "(receipt.outcome === 'already-ready')",
    '!== (receipt.operationsSubmitted === 0)',
    'export function genesis002SealedLiveReceiptDigest(receipt)',
    'warpkeep.genesis-002.sealed-live-receipt.v1\\n',
  ]) requireOnce(
    sources.genesis002ActivationReceiptsSource,
    token,
    'SEALED_LAUNCH_G002_ACTIVATION_RECEIPTS_INVALID',
  );
  for (const token of [
    'descriptor.enumerable !== true',
    "receipt.profile !== 'warpkeep-genesis-002-sealed-live-v1'",
    "receipt.atlasState !== 'ready'",
    'receipt[field] !== 0 || Object.is(receipt[field], -0)',
    'receipt.admissionNotificationsEnabled !== false',
  ]) {
    if (!sources.genesis002ActivationReceiptsSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_ACTIVATION_RECEIPTS_INVALID');
    }
  }
  for (const token of [
    'WARPKEEP_SPACETIME_CLI_CONFIG_PATH',
    'takeGenesis002ProductionAdminSecret',
    'attestGreaterRealmProductionProtectedMain',
    'verifyGenesis002FreshPublishStatus',
    'cliConfigSourcePath: local.cliConfigSourcePath',
    'spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256',
    'publishReceipt: receipt,',
    'publishReceiptDigest: receipt.publishReceiptDigest,',
    'environment.WARPKEEP_SPACETIMEDB_URI !== undefined',
    'environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined',
  ]) {
    if (!sources.genesis002PublisherCliSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID');
    }
  }
  for (const token of [
    "databaseAlias: 'warpkeep-genesis-002'",
    "moduleIdentity: 'warpkeep-genesis-002-sealed-v1'",
    "atlasId: 'GENESIS_002_GREATER_REALM'",
    'GENESIS_002_PRODUCTION_IMPORT_TARGET_COLLIDES_WITH_GENESIS_001',
    'GENESIS_002_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
    'ZERO_BOUNDARY_FIELDS',
    'atlasWritesClosedByFinalization: true',
    'activationMutationsEnabled: false',
    'playerPresentationEnabled: false',
  ]) {
    if (!sources.genesis002ImportCoreSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_IMPORT_CORE_INVALID');
    }
  }
  for (const token of [
    "export { genesis002ProductionImportReceiptDigest } from './genesis002-activation-receipts.mjs';",
    'importReceiptDigest: genesis002ProductionImportReceiptDigest(receipt),',
  ]) requireOnce(
    sources.genesis002ImportCoreSource.replaceAll('\n', ' '),
    token,
    'SEALED_LAUNCH_G002_IMPORT_RECEIPT_INVALID',
  );
  for (const reducer of [
    'admin_stage_greater_realm_release_v1',
    'admin_import_greater_realm_components_v1',
    'admin_import_greater_realm_regions_v1',
    'admin_import_greater_realm_chunk_v1',
    'admin_begin_greater_realm_verification_v1',
    'admin_verify_greater_realm_batch_v1',
    'admin_finalize_greater_realm_release_v1',
  ]) {
    if (!sources.genesis002ImportCoreSource.includes(reducer)) {
      fail('SEALED_LAUNCH_G002_IMPORT_REDUCER_SET_INVALID');
    }
  }
  for (const token of [
    'prepareGenesis002SourceBuiltArtifact',
    'attestGreaterRealmProductionSourceAncestry',
    'GENESIS_002_PRODUCTION_IMPORT_MODULE_BINDING_MISMATCH',
    'verifyGenesis002SealedLiveStatus',
    'importReceiptDigest: receipt.importReceiptDigest',
    "activationWrites: 'none'",
    "publicRootWrites: 'none'",
    ':MANUAL_RECONCILIATION_REQUIRED',
  ]) {
    if (!sources.genesis002ImportOperatorSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_IMPORT_OPERATOR_INVALID');
    }
  }
  for (const token of [
    '.withDatabaseName(databaseIdentity)',
    "const STATUS_PROCEDURE = 'adminGetGreaterRealmStatusV1'",
    "const REALM_STATUS_PROCEDURE = 'getRealmStatusV1'",
    'Object.values(GENESIS_002_PRODUCTION_IMPORT_REDUCERS).includes(reducer)',
    'assertCanStartWrite();',
  ]) {
    if (!sources.genesis002TransportSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_TRANSPORT_INVALID');
    }
  }
  requireAbsent(
    sources.genesis002ImportCoreSource,
    ['admin_activate_greater_realm', 'admin_admit_founder', 'admin_allow_fid'],
    'SEALED_LAUNCH_G002_IMPORT_MUTATION_SURFACE_INVALID',
  );
  for (const token of [
    "databaseAlias: 'warpkeep-genesis-002'",
    "moduleIdentity: 'warpkeep-genesis-002-sealed-v1'",
    "atlasWritesClosedByFinalization: true",
    'activationMutationsEnabled: false',
    'playerPresentationEnabled: false',
    'admissionNotificationsEnabled: false',
    'workerSystemRows: 0',
    'GENESIS_002_LIVE_TARGET_COLLIDES_WITH_GENESIS_001',
    "status.atlasId !== 'GENESIS_002_GREATER_REALM'",
    'receiptDigest: genesis002SealedLiveReceiptDigest(receipt)',
  ]) {
    if (!sources.genesis002LiveReceiptSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_LIVE_RECEIPT_INVALID');
    }
  }
  requireOnce(
    sources.atlasContractSource,
    "GENESIS_002_GREATER_REALM_ATLAS_ID =\n  'GENESIS_002_GREATER_REALM'",
    'SEALED_LAUNCH_G002_ATLAS_PRODUCER_IDENTITY_INVALID',
  );
  requireOnce(
    sources.atlasContractSource,
    "GREATER_REALM_ATLAS_ID = 'GENESIS_001_GREATER_REALM'",
    'SEALED_LAUNCH_LEGACY_ATLAS_PRODUCER_IDENTITY_INVALID',
  );
  for (const [source, token] of [
    [sources.atlasRuntimeReleaseSource,
      'createGenesis002GreaterRealmRuntimeRelease'],
    [sources.atlasRuntimeReleaseSource,
      'verifyGenesis002GreaterRealmRuntimeReleaseArtifacts'],
    [sources.atlasRuntimeReleaseSource,
      'atlasId: GENESIS_002_GREATER_REALM_ATLAS_ID'],
    [sources.atlasCliSource, "'export-genesis002-runtime-release'"],
    [sources.atlasCliSource, 'createGenesis002GreaterRealmRuntimeRelease'],
    [sources.atlasCliSource, 'verifyGenesis002GreaterRealmRuntimeReleaseArtifacts'],
    [sources.immutableArtifactSource, "'genesis002'"],
    [sources.immutableArtifactSource, 'withGreaterRealmLockedSourceBuild'],
  ]) {
    if (!source.includes(token)) {
      fail('SEALED_LAUNCH_G002_ATLAS_PRODUCER_INVALID');
    }
  }
  for (const token of [
    'GENESIS_002_PRIVATE_LOOPBACK_TABLES',
    'GENESIS_002_PRIVATE_LOOPBACK_PROCEDURES',
    'executeGenesis002ProductionImport',
    'atlasWritesClosedByFinalization !== true',
    'requireConnectionRejected(',
    "['sql', ...anonymous",
    "['sql', ...nonAdmin",
    "'subscribe', ...prefix",
    "['call', ...prefix",
    "'warpkeep-genesis-002-private-loopback-v1'",
  ]) {
    if (!sources.genesis002PrivateLoopbackSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PRIVATE_LOOPBACK_INVALID');
    }
  }
  requireOnce(
    sources.verifyWorkflowSource,
    'npm run stdb:genesis002:verify-private-loopback',
    'SEALED_LAUNCH_G002_PRIVATE_LOOPBACK_WORKFLOW_INVALID',
  );
  for (const token of [
    '--exclude tests/authBridgeNotificationPreparedWorkflow.test.ts',
    '--exclude tests/productionPlayerCanaryClosure.test.ts',
    'npm test -- \\\n            tests/authBridgeNotificationPreparedWorkflow.test.ts',
    'tests/productionPlayerCanaryClosure.test.ts \\\n            --maxWorkers=1',
    '--maxWorkers=1 \\\n            --testTimeout=180000',
    '--testTimeout=180000',
  ]) requireOnce(
    sources.verifyWorkflowSource,
    token,
    'SEALED_LAUNCH_CLOSURE_TEST_LANE_INVALID',
  );
}

function verifyGenesis001CensusPrivacyBoundary(sources) {
  const source = sources.genesis001CensusPrivacySafeReceiptSource;
  for (const token of [
    GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE,
    'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1',
    'executeGenesis001CensusPrivacySafeReceipt',
    'privateCensusReference',
    'privateBlindingNonceHex',
    'systemRandomBytes',
    'PRIVATE_RECEIPT_OPENAT_SOURCE',
    'os.O_WRONLY | os.O_CREAT | os.O_EXCL',
    'constants.O_NOFOLLOW',
    '(before.mode & 0o7777n) !== 0o600n',
    'nonce?.fill(0);',
    GENESIS_001_SOURCE_BASELINE_COMMIT,
    'b043a0e2e4e2c23e183a0497f47c6d8265f4d95e1d3b58c85629d0de80683304',
    'fed7c0345b370df3fd2399fb0654f55dc55f8f1397ca95544a46429fecb20470',
    'WARPKEEP_G001_PRIVATE_CENSUS_TXT_PATH',
    'WARPKEEP_G001_PRIVATE_CENSUS_EXPORT_RECEIPT_PATH',
    'WARPKEEP_G001_PRIVATE_CENSUS_PROOF_DIRECTORY',
    'privateReceiptBasename,',
  ]) {
    if (!source.includes(token)) {
      fail('SEALED_LAUNCH_G001_CENSUS_PRIVACY_BOUNDARY_INVALID');
    }
  }
  requireOnce(
    source,
    'profile: GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE,',
    'SEALED_LAUNCH_G001_CENSUS_PRIVACY_BOUNDARY_INVALID',
  );
  requireAbsent(
    source,
    [
      'g001CensusExportReceiptDigest',
      'g001CensusRawDigest',
      'g001CensusApplicantCount',
    ],
    'SEALED_LAUNCH_G001_CENSUS_PRIVACY_BOUNDARY_INVALID',
  );
  for (const token of [
    'ACCESS_REQUEST_CENSUS_PRIVATE_REFERENCE_DIRECTORY',
    "'audit',",
    "'private',",
    'writeAccessRequestCensusExport',
    "status: 'ready',",
    'privateFilesWritten: false,',
    "status: 'written',",
    'privateExporterReferenceBasename:',
    "privateExporterReferenceFormat: 'canonical-json-v1'",
    "commandOutput: 'basename-status-only-v1'",
    'console.log(JSON.stringify(result));',
  ]) {
    if (!sources.hermesSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_CENSUS_PRIVATE_EXPORT_INVALID');
    }
  }
  requireAbsent(
    sources.hermesSource,
    ['console.log(JSON.stringify(reference));'],
    'SEALED_LAUNCH_G001_CENSUS_PRIVATE_EXPORT_INVALID',
  );
  const commandParserStart = sources.hermesSource.indexOf('function commandFrom(');
  const argumentParserStart = sources.hermesSource.indexOf(
    'export function parseHermesArguments(',
  );
  if (commandParserStart < 0 || argumentParserStart <= commandParserStart) {
    fail('SEALED_LAUNCH_G001_LEGACY_LISTING_SUSPENSION_INVALID');
  }
  const commandParser = sources.hermesSource.slice(
    commandParserStart,
    argumentParserStart,
  );
  for (const token of [
    "value === 'list-access-requests'",
    "value === 'list-pending-access-requests'",
    'Legacy access-request listing is suspended for the 0.4.0 sealed launch.',
    'Use only the reviewed private export-access-request-census command.',
  ]) {
    if (!commandParser.includes(token)) {
      fail('SEALED_LAUNCH_G001_LEGACY_LISTING_SUSPENSION_INVALID');
    }
  }
  if (
    commandParser.indexOf("value === 'list-access-requests'")
      > commandParser.indexOf("value === 'seed-world'")
    || commandParser.indexOf("value === 'list-pending-access-requests'")
      > commandParser.indexOf("value === 'seed-world'")
  ) fail('SEALED_LAUNCH_G001_LEGACY_LISTING_SUSPENSION_INVALID');
}

function verifyGenesis001AdmissionMonitorSuspension(sources) {
  const source = sources.genesis001AdmissionMonitorSuspensionSource;
  for (const token of [
    "'warpkeep-genesis001-admission-monitor-suspension-v1'",
    "'com.warpkeep.hermes-admission-monitor'",
    "realmId: 'GENESIS_001'",
    "release: '0.3.43'",
    'disabled: true,',
    'loaded: false,',
    'stableSuspendedState(before, final)',
    "const SYSTEM_LAUNCHCTL = '/bin/launchctl'",
    "'disable',",
    "'bootout',",
    'paths.plist,',
    'constants.O_EXCL',
    'constants.O_NOFOLLOW',
    'fchmodSync(descriptor, 0o600)',
    'receiptBasename: written.basename',
    'receiptSha256: written.sha256',
  ]) {
    if (!source.includes(token)) {
      fail('SEALED_LAUNCH_G001_ADMISSION_MONITOR_SUSPENSION_INVALID');
    }
  }
  requireOnce(
    source,
    "'warpkeep-genesis001-admission-monitor-suspension-v1'",
    'SEALED_LAUNCH_G001_ADMISSION_MONITOR_SUSPENSION_INVALID',
  );
  requireOnce(
    source,
    "'disable',",
    'SEALED_LAUNCH_G001_ADMISSION_MONITOR_SUSPENSION_INVALID',
  );
  requireOnce(
    source,
    "'bootout',",
    'SEALED_LAUNCH_G001_ADMISSION_MONITOR_SUSPENSION_INVALID',
  );
  requireAbsent(
    source,
    [
      'unlinkSync',
      'rmSync',
      'rmdirSync',
      'renameSync',
      "['remove'",
    ],
    'SEALED_LAUNCH_G001_ADMISSION_MONITOR_RETENTION_INVALID',
  );
}

function verifyGenesis001AdmissionMonitorCurrentState(sources) {
  const source = sources.genesis001AdmissionMonitorCurrentStateSource;
  const code = 'SEALED_LAUNCH_G001_ADMISSION_MONITOR_CURRENT_STATE_INVALID';
  if (
    createHash('sha256').update(source).digest('hex')
      !== GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_SHA256
  ) fail(code);
  for (const token of [
    "'warpkeep-genesis001-admission-monitor-current-state-v1'",
    "'com.warpkeep.hermes-admission-monitor'",
    "realmId: 'GENESIS_001'",
    "release: '0.3.43'",
    "const SYSTEM_GIT = '/usr/bin/git'",
    "const SYSTEM_LAUNCHCTL = '/bin/launchctl'",
    "const SYSTEM_PLUTIL = '/usr/bin/plutil'",
    "GIT_CONFIG_GLOBAL: '/dev/null'",
    "GIT_CONFIG_NOSYSTEM: '1'",
    "GIT_NO_REPLACE_OBJECTS: '1'",
    "'https://github.com/ael-dev3/Warpkeep.git'",
    "'HEAD^{commit}'",
    "'refs/remotes/origin/main'",
    "'ls-remote',",
    "'refs/heads/main'",
    "'ls-files', '-v', '-z'",
    "'core.fsmonitor=false'",
    "'core.untrackedCache=false'",
    "'http.sslVerify=true'",
    'function exactLocalGitConfiguration()',
    "'--untracked-files=all'",
    "'symbolic-ref', '-q', 'HEAD'",
    'EXPECTED_MONITOR_PLIST_SHA256',
    'EXPECTED_MONITOR_PROGRAM_SHA256',
    'constants.O_NOFOLLOW',
    'before.nlink !== 1n',
    "['print-disabled', domain]",
    "['print', `${domain}/${GENESIS001_ADMISSION_MONITOR_LABEL}`]",
    'createCurrentStateReceipt(snapshot, sourceCommit, new Date())',
    'sameFileIdentity(plist.identity, postQueryPlist.identity)',
    'sameFileIdentity(program.identity, postQueryProgram.identity)',
    "], false, plist.body));",
    "process.env.NODE_ENV !== 'test'",
    'process.stdout.write(`${JSON.stringify(receipt)}\\n`);',
  ]) {
    if (!source.includes(token)) fail(code);
  }
  requireAbsent(source, [
    "'disable'",
    "'bootout'",
    'unlinkSync',
    'rmSync',
    'rmdirSync',
    'renameSync',
    'writeFileSync',
  ], code);
  for (const token of [
    'Genesis001AdmissionMonitorCurrentStateReceipt',
    'createGenesis001AdmissionMonitorCurrentStateReceiptForTesting',
    'parseGenesis001AdmissionMonitorDisabledState',
  ]) {
    if (!sources.genesis001AdmissionMonitorCurrentStateDeclaration.includes(token)) {
      fail(code);
    }
  }
}

function verifyGenesis001LegacyGreaterRealmProductionSeal(sources) {
  const seal = sources.genesis001LegacyGreaterRealmProductionSealSource;
  for (const token of [
    "'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1'",
    GENESIS_001_DATABASE_IDENTITY,
    "'GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED'",
    "'import-apply'",
    "'import-recover'",
    "'publish'",
    "'publish-recover'",
    "'relocation-recover'",
    "'hermes-list-pending'",
    "'hermes-admit-confirm'",
    "'hermes-allow-confirm'",
    "command !== 'recover-inspect'",
    "command === 'apply' || command === 'recover'",
    'RELOCATION_MUTATIONS.has(command)',
    "command === 'relocation' && arguments_[13] !== 'inspect'",
  ]) {
    if (!seal.includes(token)) {
      fail('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_INVALID');
    }
  }
  requireOnce(
    seal,
    "'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1'",
    'SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_INVALID',
  );

  for (const [source, entrypoint, authorityBoundary] of [
    [
      sources.legacyGreaterRealmProductionPublisherCliSource,
      'publisher',
      'assertGreaterRealmPrivateInvocation();',
    ],
    [
      sources.legacyGreaterRealmProductionImportOperatorSource,
      'import',
      'assertGreaterRealmPrivateInvocation();',
    ],
    [
      sources.legacyGreaterRealmProductionRelocationOperatorSource,
      'relocation',
      'assertGreaterRealmPrivateInvocation();',
    ],
    [
      sources.legacyGreaterRealmProductionBootstrapSource,
      'bootstrap',
      'runGreaterRealmProductionBootstrap(process.argv.slice(2))',
    ],
  ]) {
    const main = source.slice(source.indexOf('async function main'));
    const gate = main.indexOf(
      'requireGenesis001LegacyGreaterRealmProductionCliReadOnly({',
    );
    const identity = main.indexOf(`entrypoint: '${entrypoint}'`);
    const boundary = main.indexOf(authorityBoundary);
    if (
      gate < 0
      || identity <= gate
      || boundary <= identity
    ) fail('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_ENTRYPOINT_OPEN');
  }

  const packageJson = parseJson(
    sources.packageJson,
    'SEALED_LAUNCH_PACKAGE_INVALID',
  );
  for (const alias of [
    'stdb:greater-realm:import:inspect',
    'stdb:greater-realm:import:apply',
    'stdb:greater-realm:publish',
    'stdb:greater-realm:relocation',
  ]) {
    const command = packageJson?.scripts?.[alias];
    if (
      typeof command !== 'string'
      || !command.includes('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH')
      || !command.includes('/usr/bin/false')
      || command.includes('scripts/greater-realm-production-')
    ) fail('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_ALIAS_OPEN');
  }

  const envelope = sources.legacyGreaterRealmProductionLaunchEnvelopeSource;
  const argumentsShift = envelope.indexOf('shift 11');
  const sealed = envelope.indexOf(
    'fail GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED',
  );
  const bootstrap = envelope.indexOf('/usr/bin/python3 -I -S -B');
  if (
    argumentsShift < 0
    || sealed <= argumentsShift
    || bootstrap <= sealed
    || envelope.split(
      'fail GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED',
    ).length !== 3
  ) fail('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_ENVELOPE_OPEN');
  for (const token of [
    'import-apply|import-recover|publish|publish-recover|relocation-recover',
    'hermes-list-pending',
    'hermes-admit-dry',
    'hermes-admit-confirm',
    'hermes-allow-dry',
    'hermes-allow-confirm',
    'hermes-notification-recover-dry',
    'hermes-notification-recover-confirm',
    '[ "${1-}" = inspect ]',
  ]) {
    if (!envelope.slice(argumentsShift, bootstrap).includes(token)) {
      fail('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_ENVELOPE_OPEN');
    }
  }
}

function verifyGenesis001PolicyObservationLaunchEnvelope(sources) {
  const code = 'SEALED_LAUNCH_G001_POLICY_OBSERVATION_ENVELOPE_INVALID';
  const legacy = exactUtf8Bytes(
    sources.legacyGreaterRealmProductionLaunchEnvelopeSource,
    code,
  );
  const observation = exactUtf8Bytes(
    sources.genesis001PolicyObservationLaunchEnvelopeSource,
    code,
  );
  if (
    createHash('sha256').update(legacy).digest('hex')
      !== GENESIS_001_LEGACY_LAUNCH_ENVELOPE_SHA256
  ) fail(code);

  const bodyMarker = Buffer.from('set -eu\n');
  const bodyOffset = legacy.indexOf(bodyMarker);
  if (
    bodyOffset < 1
    || bodyOffset !== legacy.lastIndexOf(bodyMarker)
  ) fail(code);
  let expectedBody = legacy.subarray(bodyOffset);
  for (const [before, after] of (
    GENESIS_001_POLICY_OBSERVATION_ENVELOPE_SUBSTITUTIONS
  )) {
    expectedBody = replaceUniqueBytes(expectedBody, before, after, code);
  }
  const expected = Buffer.concat([
    GENESIS_001_POLICY_OBSERVATION_ENVELOPE_HEADER,
    expectedBody,
  ]);
  if (!observation.equals(expected)) fail(code);

  const syntax = spawnSync('/bin/sh', ['-n'], {
    input: observation,
    encoding: null,
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
    maxBuffer: 256 * 1_024,
  });
  if (
    syntax.status !== 0
    || syntax.signal !== null
    || syntax.error !== undefined
    || !Buffer.isBuffer(syntax.stdout)
    || !Buffer.isBuffer(syntax.stderr)
    || syntax.stdout.byteLength !== 0
    || syntax.stderr.byteLength !== 0
  ) fail(code);
}

function verifyClosedPresentationAndNotifications(sources) {
  for (const [source, token, code] of [
    [sources.legacyAtlasPolicySource,
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
      'SEALED_LAUNCH_LEGACY_ATLAS_GATE_INVALID'],
    [sources.legacyAtlasPolicySource,
      'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
      'SEALED_LAUNCH_LEGACY_ATLAS_GATE_INVALID'],
    [sources.clientPresentationSource,
      'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;',
      'SEALED_LAUNCH_CLIENT_PRESENTATION_GATE_INVALID'],
    [sources.serverPresentationSource,
      'GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;',
      'SEALED_LAUNCH_SERVER_PRESENTATION_GATE_INVALID'],
    [sources.hermesSource,
      'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
      'SEALED_LAUNCH_HERMES_NOTIFICATION_GATE_INVALID'],
    [sources.pagesWorkflowSource,
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      'SEALED_LAUNCH_PAGES_NOTIFICATION_GATE_INVALID'],
  ]) requireOnce(source, token, code);
  for (const source of [
    sources.productionPublisherSource,
    sources.downstreamPolicySource,
  ]) {
    requireOnce(
      source,
      'clientActivationApproved: false,',
      'SEALED_LAUNCH_DOWNSTREAM_GATE_INVALID',
    );
    requireOnce(
      source,
      'admissionNotificationsApproved: false,',
      'SEALED_LAUNCH_DOWNSTREAM_GATE_INVALID',
    );
  }
}

function verifyPlayerFacingSealedRealmRelease(sources) {
  for (const token of [
    "readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')",
    'const productVersion = readWarpkeepPackageVersion();',
    '__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(productVersion)',
  ]) requireOnce(
    sources.viteConfigSource,
    token,
    'SEALED_LAUNCH_PUBLIC_BUILD_VERSION_DERIVATION_INVALID',
  );
  requireAbsent(
    sources.viteConfigSource,
    ['VITE_WARPKEEP_PRODUCT_VERSION', "JSON.stringify('0.3.43')"],
    'SEALED_LAUNCH_PUBLIC_BUILD_VERSION_DERIVATION_INVALID',
  );
  for (const token of [
    'productVersion: typeof __WARPKEEP_PRODUCT_VERSION__',
    '? __WARPKEEP_PRODUCT_VERSION__',
    'const release = `${buildInfo.channel.toUpperCase()} ${buildInfo.version}`;',
  ]) {
    if (!sources.buildInfoSource.includes(token)) {
      fail('SEALED_LAUNCH_PUBLIC_BUILD_STAMP_INVALID');
    }
  }
  for (const token of [
    "WARPKEEP_LAUNCHER_RELEASE_VERSION = '0.4.0'",
    "GENESIS_001_PRESERVED_RELEASE_VERSION = '0.3.43'",
    "GENESIS_002_SEALED_RELEASE_VERSION = '0.4.0'",
    "GENESIS_001_RELEASE_STATE = 'preserved-player-access'",
    "GENESIS_002_RELEASE_STATE = 'sealed-no-player-access'",
    'Genesis 001 is preserved at 0.3.43. Genesis 002 is sealed at 0.4.0. PTR 0.4.0-ptr.1 is owner-only, and new admissions are suspended.',
  ]) requireOnce(
    sources.realmReleaseIdentitySource,
    token,
    'SEALED_LAUNCH_REALM_RELEASE_IDENTITY_INVALID',
  );
  for (const token of [
    'NEW_ADMISSIONS_SUSPENDED = true as const;',
    'ACCESS_REQUEST_CONTROLS_ENABLED = false as const;',
    'Existing Genesis 001 access is preserved',
    'no new access requests are being accepted',
  ]) {
    if (!sources.admissionLaunchPolicySource.includes(token)) {
      fail('SEALED_LAUNCH_ADMISSION_PRESENTATION_POLICY_INVALID');
    }
  }
  for (const token of [
    'GENESIS_001_PRESERVED_RELEASE_VERSION',
    'GENESIS_002_SEALED_RELEASE_VERSION',
    "admission: 'not-admitted'",
    "statusLabel: 'Not admitted'",
    'Not admitted to Genesis 002',
    'Genesis 002 is sealed',
    'no access request or realm connection was made',
  ]) {
    if (!sources.realmChoicePolicySource.includes(token)) {
      fail('SEALED_LAUNCH_REALM_CHOICE_POLICY_INVALID');
    }
  }
  for (const token of [
    "choice.admission === 'admitted' ? '✓' : '×'",
    'aria-describedby={tooltipId}',
    'role="tooltip"',
    'data-admission={choice.admission}',
  ]) {
    if (!sources.realmChoiceSelectorSource.includes(token)) {
      fail('SEALED_LAUNCH_REALM_SELECTOR_INVALID');
    }
  }
  for (const token of [
    'useState<RealmId>(GENESIS_001_ID)',
    'GENESIS_002_SEALED_NOTICE',
    'PTR_DIRECTORY_ONLY_NOTICE',
    'admissionRequestsSuspended={NEW_ADMISSIONS_SUSPENDED}',
    '<RealmChoiceSelector',
  ]) {
    if (!sources.realmMenuSource.includes(token)) {
      fail('SEALED_LAUNCH_REALM_MENU_GATE_INVALID');
    }
  }
  if (
    sources.realmMenuSource.split('selectedRealmId === GENESIS_002_ID').length
      !== 3
  ) fail('SEALED_LAUNCH_REALM_MENU_GATE_INVALID');
  const manifest = parseJson(
    sources.farcasterManifestSource,
    'SEALED_LAUNCH_FARCASTER_MANIFEST_INVALID',
  );
  if (
    manifest?.miniapp?.description
      !== 'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.'
    || !Array.isArray(manifest.miniapp.screenshotUrls)
    || manifest.miniapp.screenshotUrls.length !== 3
    || manifest.miniapp.screenshotUrls.some(value => (
      typeof value !== 'string' || !value.includes('alpha-0.3.43-')
    ))
  ) fail('SEALED_LAUNCH_FARCASTER_MANIFEST_INVALID');
  requireOnce(
    sources.farcasterContractSource,
    'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.',
    'SEALED_LAUNCH_FARCASTER_CONTRACT_INVALID',
  );
  for (const token of [
    "'0.4.0': ALPHA_0_4_0_PATCH_NOTES",
    "title: 'THE SECOND GENESIS WAITS'",
    'Genesis 001 remains the preserved 0.3.43 Realm',
    'Genesis 002 carries the 0.4.0 world foundation with zero admitted players',
    'cannot be entered, queried by players, or reached through an access request',
    'New admissions are suspended',
    'A dedicated PTR carries future patch testing behind short-lived owner authority',
    'PTR is owner-only',
  ]) {
    if (!sources.latestPatchNotesSource.includes(token)) {
      fail('SEALED_LAUNCH_PATCH_NOTES_INVALID');
    }
  }
  for (const token of [
    "PTR_RELEASE_VERSION = '0.4.0-ptr.1'",
    "PTR_RELEASE_STATE = 'owner-only-testing'",
    'PTR 0.4.0-ptr.1 is owner-only',
  ]) requireOnce(
    sources.realmReleaseIdentitySource,
    token,
    'SEALED_LAUNCH_PTR_RELEASE_IDENTITY_INVALID',
  );
  for (const token of [
    "PTR_SPACETIME_URI = 'https://maincloud.spacetimedb.com'",
    'environment.VITE_WARPKEEP_PTR_ENABLED',
    'environment.VITE_PTR_SPACETIMEDB_DATABASE',
    'environment.VITE_PTR_SPACETIMEDB_URI',
    "enabled !== 'true'",
    '!DATABASE_IDENTITY.test(databaseIdentity)',
    'configurableUri !== undefined',
  ]) requireOnce(
    sources.ptrRealmConfigSource,
    token,
    'SEALED_LAUNCH_PTR_CLIENT_CONFIG_INVALID',
  );
  for (const source of [
    sources.realmReleaseIdentitySource,
    sources.admissionLaunchPolicySource,
    sources.realmChoicePolicySource,
    sources.realmMenuSource,
    sources.farcasterManifestSource,
    sources.farcasterContractSource,
    sources.latestPatchNotesSource,
  ]) requireAbsent(
    source,
    ['Explore a six-region world foundation'],
    'SEALED_LAUNCH_UNTRUTHFUL_ACTIVE_COPY',
  );
}

function verifyAdmissionRequestSuspensionBoundary(sources) {
  for (const token of [
    'export const ACCESS_REQUEST_SUBMISSIONS_SUSPENDED = true as const',
    "const V2_ACCESS_STATUS_PATH = '/v2/access/status'",
    "const V2_ACCESS_REQUEST_PATH = '/v2/access/request'",
    "&& (request.method === 'POST' || request.method === 'OPTIONS')",
    "'admission_requests_suspended'",
    "'New admission requests are temporarily suspended.'",
  ]) requireOnce(
    sources.authBridgeSource,
    token,
    'SEALED_LAUNCH_ADMISSION_REQUEST_BRIDGE_INVALID',
  );
  for (const token of [
    "'warpkeep-admission-request-suspension-live-v1'",
    "'https://auth.warpkeep.com'",
    "const REQUEST_PATH = '/v2/access/request'",
    "const STATUS_PATH = '/v2/access/status'",
    "redirect: 'manual'",
    "response.status !== 503",
    "body.error.code !== EXPECTED_ERROR.code",
    "body.error.message !== EXPECTED_ERROR.message",
    "response.status !== 204",
    'admissionRequestSuspensionReceiptDigest',
  ]) requireOnce(
    sources.admissionRequestSuspensionProbeSource,
    token,
    'SEALED_LAUNCH_ADMISSION_REQUEST_PROBE_INVALID',
  );
}

function verifyPagesTwoPhaseBoundary(sources) {
  const workflow = sources.pagesWorkflowSource;
  const buildIndex = workflow.indexOf('\n  build:\n');
  const deployIndex = workflow.indexOf('\n  deploy:\n');
  const verifyLiveIndex = workflow.indexOf('\n  verify-live:\n');
  const privateToolchainIndex = workflow.indexOf('\n  private-toolchain:\n');
  if (
    buildIndex < 1
    || deployIndex <= buildIndex
    || verifyLiveIndex <= deployIndex
    || privateToolchainIndex <= verifyLiveIndex
  ) fail('SEALED_LAUNCH_PAGES_WORKFLOW_INVALID');
  const classify = workflow.slice(0, buildIndex);
  const build = workflow.slice(buildIndex, deployIndex);
  const deploy = workflow.slice(deployIndex, verifyLiveIndex);
  const verifyLive = workflow.slice(verifyLiveIndex, privateToolchainIndex);
  for (const token of [
    'node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages',
    'WARPKEEP_PAGES_SOURCE_COMMIT: ${{ github.event.workflow_run.head_sha }}',
  ]) requireOnce(classify, token, 'SEALED_LAUNCH_PAGES_CLASSIFIER_INVALID');
  requireAbsent(
    classify,
    [
      'actions/upload-pages-artifact@',
      'actions/deploy-pages@',
      'environment:',
      'pages: write',
      'id-token: write',
      'secrets.',
      'npm ci',
    ],
    'SEALED_LAUNCH_PAGES_CLASSIFIER_PRIVILEGE_INVALID',
  );
  for (const token of [
    "needs.classify.outputs.deployment-lane == 'sealed-g002'",
    "VITE_WARPKEEP_PTR_ENABLED: 'true'",
    'VITE_PTR_SPACETIMEDB_DATABASE: ${{ vars.WARPKEEP_PTR_SPACETIMEDB_DATABASE }}',
    'node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages-build',
    'npm run verify:sealed-launch:activation',
    'npm run verify:admission-request-suspension',
    'npm run build',
    'actions/upload-pages-artifact@',
  ]) {
    if (!build.includes(token)) fail('SEALED_LAUNCH_PAGES_BUILD_GATE_INVALID');
  }
  if (
    build.indexOf('node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages-build')
      > build.indexOf('npm ci')
    || build.indexOf('npm run verify:sealed-launch:activation')
      > build.indexOf('npm run verify:admission-request-suspension')
    || build.indexOf('npm run verify:admission-request-suspension')
      > build.indexOf('npm run build')
    || build.indexOf('npm run build')
      > build.indexOf('actions/upload-pages-artifact@')
  ) fail('SEALED_LAUNCH_PAGES_BUILD_ORDER_INVALID');
  requireAbsent(build, [
    'VITE_PTR_SPACETIMEDB_URI',
    'VITE_WARPKEEP_PTR_SPACETIMEDB_URI',
    'VITE_PTR_SPACETIMEDB_ALIAS',
    'VITE_WARPKEEP_PTR_SPACETIMEDB_ALIAS',
    'VITE_WARPKEEP_PTR_SPACETIMEDB_DATABASE',
    'VITE_PTR_DATABASE',
    'VITE_WARPKEEP_PTR_DATABASE',
  ], 'SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID');
  for (const token of [
    "needs.classify.outputs.deployment-lane == 'sealed-g002'",
    'environment:',
    'id-token: write',
    'scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    'npm run verify:admission-request-suspension',
    'actions/deploy-pages@',
  ]) {
    if (!deploy.includes(token)) fail('SEALED_LAUNCH_PAGES_DEPLOY_GATE_INVALID');
  }
  if (
    deploy.indexOf('scripts/verify-0.4.0-sealed-launch.mjs --phase=activation')
      > deploy.indexOf('npm run verify:admission-request-suspension')
    || deploy.indexOf('npm run verify:admission-request-suspension')
      > deploy.indexOf('actions/deploy-pages@')
    || workflow.includes(
      "needs.classify.outputs.deployment-lane == 'sealed-launch-blocked'",
    )
  ) fail('SEALED_LAUNCH_PAGES_DEPLOY_ORDER_INVALID');
  for (const token of [
    'scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    'npm run verify:admission-request-suspension',
    'node scripts/verify-alpha-production.mjs "$verification_mode"',
  ]) {
    if (!verifyLive.includes(token)) {
      fail('SEALED_LAUNCH_PAGES_LIVE_POSTFLIGHT_INVALID');
    }
  }
  if (
    verifyLive.indexOf(
      'scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    ) > verifyLive.indexOf('npm run verify:admission-request-suspension')
    || verifyLive.indexOf('npm run verify:admission-request-suspension')
      > verifyLive.indexOf('node scripts/verify-alpha-production.mjs')
  ) fail('SEALED_LAUNCH_PAGES_LIVE_POSTFLIGHT_ORDER_INVALID');
}

function verifyStaticSources(sources) {
  for (const key of Object.keys(SEALED_LAUNCH_SOURCE_PATHS)) {
    if (typeof sources[key] !== 'string') fail('SEALED_LAUNCH_SOURCE_SET_INVALID');
  }
  verifyGenesis001Policy(sources);
  verifyGenesis001SealedLaunchAdoption(sources);
  verifyGenesis001CensusPrivacyBoundary(sources);
  verifyGenesis001AdmissionMonitorSuspension(sources);
  verifyGenesis001AdmissionMonitorCurrentState(sources);
  verifyGenesis001LegacyGreaterRealmProductionSeal(sources);
  verifyGenesis001PolicyObservationLaunchEnvelope(sources);
  verifyGenesis002Policy(sources);
  for (const token of [
    'createSealedLaunchActivationBindingFromEvidence',
  ]) {
    if (!sources.activationGeneratorSource.includes(token)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INVALID');
    }
  }
  if (
    createHash('sha256').update(sources.activationGeneratorSource).digest('hex')
      !== SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_SHA256
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INVALID');
  for (const token of [
    'export function generateSealedLaunchActivationBindingFromDescriptor(',
    '(named.mode & 0o7777n) !== 0o600n',
    "new TextDecoder('utf-8', { fatal: true })",
    'JSON.stringify(envelope, null, 2)',
    'bytes?.fill(0)',
    'warpkeep-0.4.0-sealed-launch-activation-evidence-v1',
    'G001_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)',
    'G002_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)',
    'PTR_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)',
    'deriveGenesis001SealedLaunchEvidence(privateEvidence)',
    'policyObservationBootstrapReceipt:\n        evidence.g001PolicyObservationBootstrapReceipt,',
    'admissionMonitorCurrentStateReceipt:\n        evidence.g001AdmissionMonitorCurrentStateReceipt,',
    "const SYSTEM_GIT = '/usr/bin/git';",
    "GIT_CONFIG_GLOBAL: '/dev/null'",
    "GIT_CONFIG_NOSYSTEM: '1'",
    "GIT_NO_REPLACE_OBJECTS: '1'",
    "'https://github.com/ael-dev3/Warpkeep.git'",
    "'HEAD^{commit}'",
    "'refs/remotes/origin/main'",
    "'ls-remote',",
    "'refs/heads/main'",
    "'ls-files', '-v', '-z'",
    "'core.fsmonitor=false'",
    "'core.untrackedCache=false'",
    "'http.sslVerify=true'",
    'function exactLocalGitConfiguration()',
    "'--untracked-files=all'",
    '`${preparationSourceCommit}^{tree}`',
    "'ls-tree',",
    "`^100644 blob ([0-9a-f]{40})\\\\t${BOOTSTRAP_SOURCE_PATH}\\\\0$`",
    "['cat-file', 'blob', bootstrapBlob]",
    'EXPECTED_BOOTSTRAP_SHA256',
    "process.env.NODE_ENV !== 'test'",
    'observationBootstrap.moduleTreeId !== preparationAuthority.moduleTreeId',
    'genesis002PublishReceiptDigest(publishReceipt)',
    'genesis002ProductionImportReceiptDigest(',
    'genesis002SealedLiveReceiptDigest(sealedLive)',
    'ptrProductionPublishReceiptDigest(',
    'ptrProductionAtlasImportReceiptDigest(',
    'ptrOwnerProvisionReceiptDigest(',
    'ptrSealedLiveReceiptDigest(',
    'warpkeep.ptr.production-publish-receipt.v1',
    'warpkeep.ptr.production-import-receipt.v1',
    'warpkeep.ptr.owner-provision-receipt.v1',
    'warpkeep.ptr.sealed-live-receipt.v1',
    'ptrPublish.databaseIdentity === genesis001.g001DatabaseIdentity',
    'ptrPublish.databaseIdentity === publish.databaseIdentity',
    'ptrOwnerProvision.ownerOpaqueProofDigest',
    'ptrOwnerProvision.ownerOpaqueProofDigest\n      !== ptrSealedLive.ownerOpaqueProofDigest',
    'ptrDatabaseIdentity: ptrPublish.databaseIdentity',
    'ptrAtlasId: ptrAtlasImport.atlasId',
    'ptrOwnerProvisioned: ptrSealedLive.ownerProvisioned',
    'ptrPresentationEnabled: ptrSealedLive.playerPresentationEnabled',
    'publish.databaseIdentity !== atlasImport.databaseIdentity',
    'publish.sourceCommit !== atlasImport.atlasSourceCommit',
    'atlasImport.publicReleaseId !== sealedLive.publicReleaseId',
    'g002DatabaseIdentity: publish.databaseIdentity',
    'g002AllowedFids: sealedLive.allowedFids',
    'g002AtlasReady: sealedLive.atlasState === \'ready\'',
    'g002PresentationEnabled: sealedLive.playerPresentationEnabled',
    'admissionNotificationsEnabled: sealedLive.admissionNotificationsEnabled',
    'createSealedLaunchActivationBinding(binding)',
  ]) {
    if (!sources.activationGeneratorSource.includes(token)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INVALID');
    }
  }
  requireAbsent(
    sources.activationGeneratorSource,
    [
      'readFileSync',
      'writeFileSync',
      'testOnlyAdoptionAuthority',
      'deriveGenesis001SealedLaunchEvidenceForTesting',
      'ownerFid',
      'ownerAuthEpoch',
    ],
    'SEALED_LAUNCH_ACTIVATION_GENERATOR_INVALID',
  );
  const packageJson = parseJson(
    sources.packageJson,
    'SEALED_LAUNCH_PACKAGE_INVALID',
  );
  if (
    packageJson?.scripts?.['generate:sealed-launch:activation']
      !== 'node scripts/generate-0.4.0-sealed-launch-activation.mjs'
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INVALID');
  verifyClosedPresentationAndNotifications(sources);
  verifyPlayerFacingSealedRealmRelease(sources);
  verifyAdmissionRequestSuspensionBoundary(sources);
  verifyPagesTwoPhaseBoundary(sources);
}

function verifyPreparationBinding(binding) {
  if (
    binding.pagesDeploymentApproved !== false
    || binding.ptrPresentationEnabled !== false
    || OPERATIONAL_BINDING_KEYS.some(key => binding[key] !== null)
  ) fail('SEALED_LAUNCH_PREPARATION_BINDING_INVALID');
}

function verifyActivationBinding(binding) {
  const digestKeys = [
    'g001FreezePublishReceiptDigest',
    'g001PolicyReceiptDigest',
    'g001PolicyObservationBootstrapReceiptDigest',
    'g001CensusPrivacySafeReceiptDigest',
    'admissionMonitorSuspensionReceiptDigest',
    'admissionMonitorCurrentStateReceiptDigest',
    'admissionRequestSuspensionReceiptDigest',
    'g002PublishReceiptDigest',
    'g002FreshStatusDigest',
    'g002ModuleSha256',
    'g002DependencyClosureDigest',
    'g002SpacetimeExecutableSha256',
    'g002SpacetimeCliConfigSha256',
    'g002AtlasImportReceiptDigest',
    'g002SealedLiveReceiptDigest',
    'g002ReleaseSha256',
    'g002ReleaseHeaderSha256',
    'g002VerificationDigest',
    'ptrPublishReceiptDigest',
    'ptrFreshStatusDigest',
    'ptrAtlasImportReceiptDigest',
    'ptrSealedLiveReceiptDigest',
    'ptrOwnerProvisionReceiptDigest',
    'ptrModuleSha256',
    'ptrDependencyClosureDigest',
    'ptrSpacetimeExecutableSha256',
    'ptrSpacetimeCliConfigSha256',
    'ptrReleaseManifestSha256',
    'ptrExpectedReleaseSha256',
    'ptrReleaseHeaderSha256',
    'ptrVerificationDigest',
  ];
  const commitKeys = [
    'preparationSourceCommit',
    'g001PolicySourceCommit',
    'authBridgeSourceCommit',
    'g002ModuleSourceCommit',
    'g002ModuleTreeId',
    'g002AtlasSourceCommit',
    'ptrModuleSourceCommit',
    'ptrModuleTreeId',
    'ptrAtlasSourceCommit',
  ];
  const zeroKeys = [
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
  ];
  const ptrZeroKeys = [
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
  ];
  if (
    binding.pagesDeploymentApproved !== true
    || digestKeys.some(key => !SHA256.test(binding[key] ?? ''))
    || commitKeys.some(key => !COMMIT.test(binding[key] ?? ''))
    || binding.g001DatabaseIdentity !== GENESIS_001_DATABASE_IDENTITY
    || binding.g001SourceBaselineCommit !== GENESIS_001_SOURCE_BASELINE_COMMIT
    || binding.g001BaselineAbiSha256 !== GENESIS_001_BASELINE_ABI_SHA256
    || binding.g001FreezeReleaseNonce !== GENESIS_001_FREEZE_RELEASE_NONCE
    || binding.g001FreezePublishReceiptDigest
      !== GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256
    || binding.g001PolicyReceiptDigest !== GENESIS_001_POLICY_RECEIPT_SHA256
    || binding.g001PolicySourceCommit !== binding.preparationSourceCommit
    || binding.authBridgeSourceCommit !== binding.preparationSourceCommit
    || !SHA256.test(binding.g002DatabaseIdentity ?? '')
    || binding.g002DatabaseIdentity === GENESIS_001_DATABASE_IDENTITY
    || binding.g002ModuleSourceCommit !== binding.preparationSourceCommit
    || binding.g002AtlasSourceCommit !== binding.preparationSourceCommit
    || binding.g002ModuleSourceCommit !== binding.g002AtlasSourceCommit
    || binding.g001ReleaseVersion !== '0.3.43'
    || binding.g001PlayerAccessEnabled !== true
    || binding.g001AdmissionStateMutationsEnabled !== false
    || binding.g001AccessRequestSubmissionsEnabled !== false
    || binding.g001CensusPrivacySafeReceiptProfile
      !== GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE
    || binding.admissionMonitorDisabled !== true
    || binding.admissionMonitorLoaded !== false
    || binding.g002AtlasId !== 'GENESIS_002_GREATER_REALM'
    || !PUBLIC_RELEASE_ID.test(binding.g002PublicReleaseId ?? '')
    || zeroKeys.some(key => binding[key] !== 0)
    || binding.g002AtlasReady !== true
    || binding.g002AtlasFinalized !== true
    || binding.g002AtlasWritesClosedByFinalization !== true
    || binding.g002AtlasImportMutationsEnabled !== true
    || binding.g002AtlasActivationMutationsEnabled !== false
    || binding.g002PlayerAccessEnabled !== false
    || binding.g002AdmissionMutationsEnabled !== false
    || !SHA256.test(binding.ptrDatabaseIdentity ?? '')
    || binding.ptrDatabaseIdentity === GENESIS_001_DATABASE_IDENTITY
    || binding.ptrDatabaseIdentity === binding.g002DatabaseIdentity
    || binding.ptrModuleSourceCommit !== binding.preparationSourceCommit
    || binding.ptrAtlasSourceCommit !== binding.preparationSourceCommit
    || binding.ptrModuleSourceCommit !== binding.ptrAtlasSourceCommit
    || binding.ptrAtlasId !== 'PTR_GREATER_REALM'
    || !PUBLIC_RELEASE_ID.test(binding.ptrPublicReleaseId ?? '')
    || binding.ptrReleaseVersion !== '0.4.0-ptr.1'
    || ptrZeroKeys.some(key => binding[key] !== 0)
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
  ) fail('SEALED_LAUNCH_ACTIVATION_BINDING_INVALID');
  for (const commitmentKey of Object.keys(RECEIPT_COMMITMENT_DIGESTS)) {
    if (
      !SHA256.test(binding[commitmentKey] ?? '')
      || binding[commitmentKey]
        !== sealedLaunchReceiptCommitment(commitmentKey, binding)
    ) fail('SEALED_LAUNCH_RECEIPT_COMMITMENT_INVALID');
  }
}

/**
 * Fill every release-wide commitment from one exact, privacy-safe activation
 * candidate. Commitment slots must be null so reviewed evidence can never be
 * silently replaced by a caller-provided value.
 */
export function createSealedLaunchActivationBinding(candidate) {
  requireExactKeys(
    candidate,
    BINDING_KEYS,
    'SEALED_LAUNCH_ACTIVATION_CANDIDATE_INVALID',
  );
  const commitmentKeys = Object.keys(RECEIPT_COMMITMENT_DIGESTS);
  if (commitmentKeys.some(key => candidate[key] !== null)) {
    fail('SEALED_LAUNCH_ACTIVATION_CANDIDATE_INVALID');
  }
  const binding = { ...candidate };
  for (const commitmentKey of commitmentKeys) {
    binding[commitmentKey] = sealedLaunchReceiptCommitment(
      commitmentKey,
      binding,
    );
  }
  verifyActivationBinding(binding);
  return Object.freeze(binding);
}

export function verifySealedLaunchSources(sources, requestedPhase = 'checked-in') {
  if (!['preparation', 'activation', 'checked-in'].includes(requestedPhase)) {
    fail('SEALED_LAUNCH_PHASE_INVALID');
  }
  verifyStaticSources(sources);
  const binding = parseBinding(sources.bindingJson);
  let phase = requestedPhase;
  if (phase === 'checked-in') {
    phase = binding.pagesDeploymentApproved ? 'activation' : 'preparation';
  }
  if (phase === 'preparation') {
    verifyPackageVersions(sources, '0.3.43');
    verifyPreparationBinding(binding);
  } else {
    verifyPackageVersions(sources, '0.4.0');
    verifyActivationBinding(binding);
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: SEALED_LAUNCH_PROFILE,
    phase,
    packageVersion: phase === 'preparation' ? '0.3.43' : '0.4.0',
    pagesDeploymentApproved: binding.pagesDeploymentApproved,
    g001ReleaseVersion: binding.g001ReleaseVersion,
    g002DatabaseIdentity: binding.g002DatabaseIdentity,
    ptrDatabaseIdentity: binding.ptrDatabaseIdentity,
    ptrPresentationEnabled: binding.ptrPresentationEnabled,
  });
}

export function classifySealedLaunchPagesSources(sources) {
  const result = verifySealedLaunchSources(sources, 'checked-in');
  return result.phase === 'activation' ? 'sealed-g002' : 'sealed-launch-blocked';
}

const FORBIDDEN_PTR_PAGES_ENVIRONMENT_KEYS = Object.freeze([
  'VITE_PTR_SPACETIMEDB_URI',
  'VITE_WARPKEEP_PTR_SPACETIMEDB_URI',
  'VITE_PTR_SPACETIMEDB_ALIAS',
  'VITE_WARPKEEP_PTR_SPACETIMEDB_ALIAS',
  'VITE_WARPKEEP_PTR_SPACETIMEDB_DATABASE',
  'VITE_PTR_DATABASE',
  'VITE_WARPKEEP_PTR_DATABASE',
]);

/** Bind the public PTR build inputs to the reviewed activation identity. */
export function verifySealedLaunchPagesBuildEnvironment({
  bindingSource,
  environment,
}) {
  const binding = parseBinding(bindingSource);
  verifyActivationBinding(binding);
  if (
    environment === null
    || typeof environment !== 'object'
    || Array.isArray(environment)
    || environment.VITE_WARPKEEP_PTR_ENABLED !== 'true'
    || !SHA256.test(environment.VITE_PTR_SPACETIMEDB_DATABASE ?? '')
    || environment.VITE_PTR_SPACETIMEDB_DATABASE
      !== binding.ptrDatabaseIdentity
    || environment.VITE_PTR_SPACETIMEDB_DATABASE
      === binding.g001DatabaseIdentity
    || environment.VITE_PTR_SPACETIMEDB_DATABASE
      === binding.g002DatabaseIdentity
    || FORBIDDEN_PTR_PAGES_ENVIRONMENT_KEYS.some(
      key => environment[key] !== undefined,
    )
  ) fail('SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID');
  return Object.freeze({
    ptrEnabled: true,
    ptrDatabaseIdentity: binding.ptrDatabaseIdentity,
  });
}

export function verifySealedLaunchActivationHistory({
  bindingSource,
  candidateActivationCommit,
  isAncestor,
  parentsOf,
  historicalPathChanges,
  sourceProjection,
  activationDelta,
}) {
  const binding = parseBinding(bindingSource);
  verifyActivationBinding(binding);
  const parents = typeof parentsOf === 'function'
    ? parentsOf(candidateActivationCommit)
    : undefined;
  const historicalProjection = typeof sourceProjection === 'function'
    ? sourceProjection(
        GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
        GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
      )
    : undefined;
  const preparationProjection = typeof sourceProjection === 'function'
    ? sourceProjection(
        binding.preparationSourceCommit,
        GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
      )
    : undefined;
  const delta = typeof activationDelta === 'function'
    ? activationDelta(
        binding.preparationSourceCommit,
        candidateActivationCommit,
        SEALED_LAUNCH_ACTIVATION_PATHS,
      )
    : undefined;
  if (
    !COMMIT.test(candidateActivationCommit ?? '')
    || candidateActivationCommit === binding.preparationSourceCommit
    || typeof isAncestor !== 'function'
    || !Array.isArray(parents)
    || parents.length !== 1
    || parents[0] !== binding.preparationSourceCommit
    || typeof historicalPathChanges !== 'function'
    || historicalPathChanges(
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
      binding.preparationSourceCommit,
      GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
    ) !== false
    || !Buffer.isBuffer(historicalProjection)
    || historicalProjection.byteLength < 1
    || !Buffer.isBuffer(preparationProjection)
    || !historicalProjection.equals(preparationProjection)
    || delta === null
    || typeof delta !== 'object'
    || !Array.isArray(delta.changedPaths)
    || JSON.stringify(delta.changedPaths)
      !== JSON.stringify(SEALED_LAUNCH_ACTIVATION_PATHS)
    || !Array.isArray(delta.preparationEntries)
    || !Array.isArray(delta.activationEntries)
    || [delta.preparationEntries, delta.activationEntries].some(entries => (
      JSON.stringify(entries) !== JSON.stringify(
        SEALED_LAUNCH_ACTIVATION_PATHS.map(path => ({
          path,
          mode: '100644',
          type: 'blob',
        })),
      )
    ))
    || isAncestor(
      GENESIS_001_SOURCE_BASELINE_COMMIT,
      candidateActivationCommit,
    ) !== true
    || isAncestor(
      GENESIS_001_SOURCE_BASELINE_COMMIT,
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
    ) !== true
    || isAncestor(
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
      binding.preparationSourceCommit,
    ) !== true
    || isAncestor(
      binding.preparationSourceCommit,
      candidateActivationCommit,
    ) !== true
  ) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  return Object.freeze({
    preparationSourceCommit: binding.preparationSourceCommit,
    candidateActivationCommit,
    genesis001SourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT,
    genesis001FreezePublishSourceCommit:
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
  });
}

function readSources(repositoryRoot = REPOSITORY_ROOT) {
  return Object.freeze(Object.fromEntries(
    Object.entries(SEALED_LAUNCH_SOURCE_PATHS).map(([key, path]) => {
      const absolute = resolve(repositoryRoot, path);
      try {
        const status = lstatSync(absolute);
        if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
          fail('SEALED_LAUNCH_SOURCE_FILE_INVALID');
        }
        return [key, readFileSync(absolute, 'utf8')];
      } catch (error) {
        if (error instanceof SealedLaunchVerificationError) throw error;
        return fail('SEALED_LAUNCH_SOURCE_FILE_INVALID');
      }
    }),
  ));
}

function git(arguments_, repositoryRoot) {
  return spawnSync('/usr/bin/git', ['--no-optional-locks', ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      HOME: '/nonexistent',
      PATH: '/usr/bin:/bin',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
    maxBuffer: 256 * 1_024,
  });
}

function currentCommit(repositoryRoot) {
  const result = git(['rev-parse', '--verify', 'HEAD^{commit}'], repositoryRoot);
  if (result.status !== 0 || !COMMIT.test(result.stdout.trim())) {
    fail('SEALED_LAUNCH_CHECKOUT_INVALID');
  }
  return result.stdout.trim();
}

function gitIsAncestor(repositoryRoot, ancestor, descendant) {
  const result = git(
    ['merge-base', '--is-ancestor', ancestor, descendant],
    repositoryRoot,
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
}

function gitRaw(arguments_, repositoryRoot, maximumBytes = 1024 * 1024) {
  const result = spawnSync('/usr/bin/git', [
    '--no-optional-locks',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    ...arguments_,
  ], {
    cwd: repositoryRoot,
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      HOME: '/nonexistent',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    maxBuffer: maximumBytes,
  });
  if (
    result.status !== 0
    || result.signal !== null
    || result.error !== undefined
    || !Buffer.isBuffer(result.stdout)
    || !Buffer.isBuffer(result.stderr)
    || result.stderr.byteLength !== 0
  ) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  return result.stdout;
}

function splitNul(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 1 || bytes.at(-1) !== 0) {
    fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  }
  const records = [];
  let offset = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index === offset) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
    records.push(bytes.subarray(offset, index));
    offset = index + 1;
  }
  if (offset !== bytes.byteLength) {
    fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  }
  return records;
}

function decodeGitPath(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  }
}

function parseTreeProjection(bytes) {
  return splitNul(bytes).map(record => {
    const separator = record.indexOf(9);
    if (separator < 1) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
    const metadata = record.subarray(0, separator).toString('ascii');
    const match = /^(100644|100755|120000|160000) (blob|commit) [0-9a-f]{40}$/u
      .exec(metadata);
    if (match === null) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
    return Object.freeze({
      path: decodeGitPath(record.subarray(separator + 1)),
      mode: match[1],
      type: match[2],
    });
  });
}

function gitParentsOf(repositoryRoot, commit) {
  const result = git(['rev-list', '--parents', '-n', '1', commit], repositoryRoot);
  const values = result.status === 0 ? result.stdout.trim().split(' ') : [];
  if (
    values.length < 1
    || values[0] !== commit
    || values.some(value => !COMMIT.test(value))
  ) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  return values.slice(1);
}

function gitHistoricalPathChanges(repositoryRoot, ancestor, descendant, paths) {
  const result = git([
    'rev-list', '--full-history', `${ancestor}..${descendant}`, '--', ...paths,
  ], repositoryRoot);
  if (result.status !== 0) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  return result.stdout !== '';
}

function gitSourceProjection(repositoryRoot, commit, paths) {
  const bytes = gitRaw([
    'ls-tree', '-r', '-z', '--full-tree', commit, '--', ...paths,
  ], repositoryRoot);
  const entries = parseTreeProjection(bytes);
  if (
    entries.length < paths.length
    || new Set(entries.map(entry => entry.path)).size !== entries.length
    || entries.some(entry => entry.mode !== '100644' || entry.type !== 'blob')
    || paths.some(path => !entries.some(
      entry => entry.path === path || entry.path.startsWith(`${path}/`),
    ))
  ) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  return bytes;
}

function gitActivationDelta(repositoryRoot, preparationCommit, activationCommit) {
  const changedBytes = gitRaw([
    'diff-tree', '--no-commit-id', '--name-only', '-z', '--no-renames', '-r',
    preparationCommit, activationCommit,
  ], repositoryRoot);
  const changedPaths = splitNul(changedBytes).map(decodeGitPath).sort();
  if (new Set(changedPaths).size !== changedPaths.length) {
    fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  }
  const entriesAt = commit => parseTreeProjection(gitRaw([
    'ls-tree', '-z', '--full-tree', commit, '--',
    ...SEALED_LAUNCH_ACTIVATION_PATHS,
  ], repositoryRoot)).sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    changedPaths: Object.freeze(changedPaths),
    preparationEntries: Object.freeze(entriesAt(preparationCommit)),
    activationEntries: Object.freeze(entriesAt(activationCommit)),
  });
}

export function inspectSealedLaunchGitHistoryForTesting({
  repositoryRoot,
  historicalCommit,
  preparationCommit,
  activationCommit,
  protectedPaths,
}) {
  if (
    process.env.NODE_ENV !== 'test'
    || typeof repositoryRoot !== 'string'
    || !COMMIT.test(historicalCommit ?? '')
    || !COMMIT.test(preparationCommit ?? '')
    || !COMMIT.test(activationCommit ?? '')
    || !Array.isArray(protectedPaths)
    || protectedPaths.length < 1
    || protectedPaths.some(path => (
      typeof path !== 'string'
      || path.length < 1
      || path.includes('\0')
      || path.startsWith('/')
      || path.split('/').includes('..')
    ))
  ) fail('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID');
  const root = realpathSync(repositoryRoot);
  return Object.freeze({
    historicalPathChanges: gitHistoricalPathChanges(
      root,
      historicalCommit,
      preparationCommit,
      protectedPaths,
    ),
    historicalProjection: gitSourceProjection(
      root,
      historicalCommit,
      protectedPaths,
    ),
    preparationProjection: gitSourceProjection(
      root,
      preparationCommit,
      protectedPaths,
    ),
    delta: gitActivationDelta(root, preparationCommit, activationCommit),
  });
}

function assertExactCheckout(repositoryRoot, expectedCommit) {
  if (
    typeof repositoryRoot !== 'string'
    || resolve(repositoryRoot) !== repositoryRoot
    || realpathSync(repositoryRoot) !== repositoryRoot
    || !COMMIT.test(expectedCommit ?? '')
  ) fail('SEALED_LAUNCH_CHECKOUT_INVALID');
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], repositoryRoot);
  const status = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    repositoryRoot,
  );
  if (
    head.status !== 0
    || head.stdout.trim() !== expectedCommit
    || status.status !== 0
    || status.stdout !== ''
  ) fail('SEALED_LAUNCH_CHECKOUT_INVALID');
}

export function classifySealedLaunchPagesDeployLane({
  repositoryRoot = REPOSITORY_ROOT,
  candidatePagesSourceCommit,
} = {}) {
  assertExactCheckout(repositoryRoot, candidatePagesSourceCommit);
  const sources = readSources(repositoryRoot);
  const mode = classifySealedLaunchPagesSources(sources);
  if (mode === 'sealed-g002') {
    verifySealedLaunchActivationHistory({
      bindingSource: sources.bindingJson,
      candidateActivationCommit: candidatePagesSourceCommit,
      isAncestor: (ancestor, descendant) => (
        gitIsAncestor(repositoryRoot, ancestor, descendant)
      ),
      parentsOf: commit => gitParentsOf(repositoryRoot, commit),
      historicalPathChanges: (ancestor, descendant, paths) => (
        gitHistoricalPathChanges(repositoryRoot, ancestor, descendant, paths)
      ),
      sourceProjection: (commit, paths) => (
        gitSourceProjection(repositoryRoot, commit, paths)
      ),
      activationDelta: (preparationCommit, activationCommit) => (
        gitActivationDelta(
          repositoryRoot,
          preparationCommit,
          activationCommit,
        )
      ),
    });
  }
  return Object.freeze({
    profile: SEALED_LAUNCH_PROFILE,
    candidatePagesSourceCommit,
    mode,
  });
}

function main(arguments_, environment) {
  if (arguments_.length !== 1) fail('SEALED_LAUNCH_ARGUMENT_INVALID');
  const match = /^--phase=(preparation|activation|checked-in|pages|pages-build)$/u.exec(
    arguments_[0],
  );
  if (match === null) fail('SEALED_LAUNCH_ARGUMENT_INVALID');
  const phase = match[1];
  if (phase !== 'pages' && phase !== 'pages-build') {
    const sources = readSources();
    const result = verifySealedLaunchSources(sources, phase);
    if (result.phase === 'activation') {
      const candidateActivationCommit = currentCommit(REPOSITORY_ROOT);
      assertExactCheckout(REPOSITORY_ROOT, candidateActivationCommit);
      verifySealedLaunchActivationHistory({
        bindingSource: sources.bindingJson,
        candidateActivationCommit,
        isAncestor: (ancestor, descendant) => (
          gitIsAncestor(REPOSITORY_ROOT, ancestor, descendant)
        ),
        parentsOf: commit => gitParentsOf(REPOSITORY_ROOT, commit),
        historicalPathChanges: (ancestor, descendant, paths) => (
          gitHistoricalPathChanges(
            REPOSITORY_ROOT,
            ancestor,
            descendant,
            paths,
          )
        ),
        sourceProjection: (commit, paths) => (
          gitSourceProjection(REPOSITORY_ROOT, commit, paths)
        ),
        activationDelta: (preparationCommit, activationCommit) => (
          gitActivationDelta(
            REPOSITORY_ROOT,
            preparationCommit,
            activationCommit,
          )
        ),
      });
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (
    environment.CI !== 'true'
    || environment.GITHUB_ACTIONS !== 'true'
    || environment.GITHUB_REPOSITORY !== 'ael-dev3/Warpkeep'
    || environment.GITHUB_EVENT_NAME !== 'workflow_run'
    || environment.GITHUB_WORKFLOW_REF
      !== 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
    || !COMMIT.test(environment.WARPKEEP_PAGES_SOURCE_COMMIT ?? '')
  ) fail('SEALED_LAUNCH_PAGES_ENVIRONMENT_INVALID');
  const result = classifySealedLaunchPagesDeployLane({
    candidatePagesSourceCommit: environment.WARPKEEP_PAGES_SOURCE_COMMIT,
  });
  if (phase === 'pages-build') {
    if (result.mode !== 'sealed-g002') {
      fail('SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID');
    }
    const ptr = verifySealedLaunchPagesBuildEnvironment({
      bindingSource: readSources().bindingJson,
      environment,
    });
    process.stdout.write(`${JSON.stringify({ ...result, ...ptr })}\n`);
    return;
  }
  const descriptor = Number(environment.GITHUB_OUTPUT_FD);
  if (!Number.isSafeInteger(descriptor) || descriptor < 3) {
    fail('SEALED_LAUNCH_PAGES_OUTPUT_INVALID');
  }
  const status = fstatSync(descriptor);
  if (!status.isFile() || status.nlink !== 1 || (status.mode & 0o022) !== 0) {
    fail('SEALED_LAUNCH_PAGES_OUTPUT_INVALID');
  }
  writeSync(descriptor, `deployment-lane=${result.mode}\n`, null, 'utf8');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2), process.env);
  } catch (error) {
    process.stderr.write(`${
      error instanceof SealedLaunchVerificationError
        ? error.code
        : 'SEALED_LAUNCH_VERIFICATION_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
