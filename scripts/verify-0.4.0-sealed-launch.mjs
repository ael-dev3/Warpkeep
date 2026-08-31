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
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE =
  'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1';
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
// Task 6D pins the reviewed narrow S/A producer byte-for-byte. This avoids
// accepting decoy tokens or an early-return control-flow bypass before Task 7
// freezes the complete dispatcher closure.
const SEALED_REALMS_SOURCE_AUTHORITY_SOURCE_SHA256 =
  '2b0013d56f2c5be80fef56d0d85d481ecbc663f30814bc61792e21df811403e5';
const SEALED_REALMS_SOURCE_AUTHORITY_DECLARATION_SHA256 =
  'e06c540bf17a13b364b32d52a89ec3e6c3d288665dc7d9ef06a22e07a58b494c';
const GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_SOURCE_SHA256 =
  'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a';
const GENESIS_001_POLICY_OBSERVATION_SOURCE_SHA256 =
  '15ee745ddb38e3bf8206c145b3cc9e6ac4181194b0d93945266f9e90cbb87378';
const GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_SHA256 =
  '10c8286a38ac81a5672280dcede60f712a95bc78af2f263e3ee8cc40d4afd5ac';
const GENESIS_001_SEALED_LAUNCH_ADOPTION_SOURCE_SHA256 =
  'f9b3fc9bb02c9905aaa210daf05f71e2262f157e7bf9669058ce21e915593631';
const SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_SHA256 =
  'be5fc56e7fc232b186b5446fc1ac4b71130e1385a0e0783421f9cfa2b6e247df';
const SEALED_LAUNCH_PACKAGE_STRUCTURE_SHA256 =
  '22663812042c8f910fdd555b01350a49c5d481013a8a52bbe99246561e58dd31';
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
  genesis001AdmittedPlayerCensusSource:
    'scripts/genesis001-admitted-player-census.mjs',
  genesis001AdmittedPlayerCensusDeclaration:
    'scripts/genesis001-admitted-player-census.d.mts',
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
  genesis002AuthSource: 'spacetimedb/genesis002/src/auth.ts',
  genesis002AdminPolicySource:
    'spacetimedb/genesis002/src/adminPolicy.ts',
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
  authBridgeConfigSource: 'services/auth-bridge/src/config.ts',
  authBridgeJwtSource: 'services/auth-bridge/src/jwt.ts',
  authBridgeTypesSource: 'services/auth-bridge/src/types.ts',
  ptrOwnerPolicySource: 'spacetimedb/ptr/src/ownerPolicy.ts',
  ptrAuthSource: 'spacetimedb/ptr/src/auth.ts',
  ptrAtlasImportReducersSource: 'spacetimedb/ptr/src/atlasImportReducers.ts',
  ptrOwnerReducersSource: 'spacetimedb/ptr/src/ownerReducers.ts',
  ptrPublisherCoreSource: 'scripts/ptr-production-publisher.mjs',
  ptrPublisherCliSource: 'scripts/ptr-production-publisher-cli.ts',
  ptrProductionAdminTokenSource: 'scripts/ptr-production-admin-token.ts',
  ptrProductionTransportSource: 'scripts/ptr-production-transport.ts',
  ptrProductionImportCoreSource: 'scripts/ptr-production-import-core.ts',
  ptrProductionReleaseReceiptsSource:
    'scripts/ptr-production-release-receipts.ts',
  ptrProductionImportOperatorSource:
    'scripts/ptr-production-import-operator.ts',
  ptrProductionReceiptFileSource: 'scripts/ptr-production-receipt-file.ts',
  ptrOwnerProvisionOperatorSource: 'scripts/ptr-owner-provision-operator.ts',
  admissionRequestSuspensionProbeSource:
    'scripts/verify-admission-request-suspension.mjs',
  sealedRealmsProductionSourceAuthoritySource:
    'scripts/sealed-realms-production-source-authority.mjs',
  sealedRealmsProductionSourceAuthorityDeclaration:
    'scripts/sealed-realms-production-source-authority.d.mts',
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
    "'warpkeep-sealed-realms-g001-census-activation-private-v1'",
    'physicalRecordDigest(record)',
    "'warpkeep.sealed-realms.g001-census-confirmation.v1'",
    'JSON.stringify(embeddedApplicant) !== JSON.stringify(applicant)',
    'consumedAt >= Date.parse(expiresAt)',
    'censusActivation.consumedAt > monitorSuspendedAt',
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
  // Interim byte pins seal the complete G002 authority boundary until Task 7
  // atomically adds these roots to the authenticated closure and refreezes it.
  // Pinning the complete security-bearing sources prevents decoy token/name
  // preservation from weakening a parser, call site, bridge control, or
  // transport bound while the later closure update is intentionally deferred.
  for (const [source, expectedSha256] of [
    [sources.genesis002ContractSource,
      'a8c810ed4f2fe67ce3e8b641f6885f9baef158b0f6a70bcdac5f0a7cf89721b1'],
    [sources.genesis002AdminPolicySource,
      'ae3df9186b0e0b31826dbf06403676ffe977074819414b0d5a86590437919f9c'],
    [sources.genesis002AuthSource,
      'b819fa23258c32b5d15a94669655c52c55cc0e6256e1b57aa370a8573f60f8a4'],
    [sources.genesis002LifecycleSource,
      'aa142bf3b138c82059f3571a4622a51d6095f36055f61513c7db07a9a2573aa1'],
    [sources.genesis002AtlasImportSource,
      'ba814224620ebf7ec837e326ca5e495c978da61097c0f88831f0ff013cad7b6c'],
    [sources.authBridgeConfigSource,
      '39036b69b0264eb712ae4ac08b29c6e2854488488e632b246fd77eac1ad50b65'],
    [sources.authBridgeJwtSource,
      '30776921dc8d7fa237ad73fb2cd4515662ea5f523ee9f380cdaaddf33467dbb7'],
    [sources.authBridgeSource,
      '75bae3f93146fe841a98a633c4646f6746a76d373b4df5769e209243f088fb11'],
    [sources.genesis002PublisherCoreSource,
      'c7e07f7cd5dbeb05b9fd6e237b32b9332e4a8010c59f35cd89e2e3b49aa0a863'],
    [sources.genesis002PublisherCliSource,
      'f1d7156f3ee9f497d36bd6a224efa5dc4f22e2f47c0398623083c3031591be96'],
    [sources.genesis002TransportSource,
      '39619dae34b4e59bf3b6f7cf4db3577d46ee18fa8e172e527c943467215b6c9a'],
  ]) {
    if (
      typeof source !== 'string'
      || createHash('sha256').update(source).digest('hex') !== expectedSha256
    ) fail('SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID');
  }
  for (const [source, token] of [
    [sources.genesis002ContractSource,
      "GENESIS_002_AUDIENCE =\n  'warpkeep-genesis-002-spacetimedb'"],
    [sources.genesis002AdminPolicySource,
      'export function readFreshGenesis002AdminClaims('],
    [sources.genesis002AdminPolicySource,
      "const GENESIS_002_ISSUER = 'https://auth.warpkeep.com'"],
    [sources.genesis002AdminPolicySource,
      "const GENESIS_002_ADMIN_SUBJECT = 'service:hermes'"],
    [sources.genesis002AdminPolicySource,
      "const GENESIS_002_ADMIN_ROLE = 'warpkeep-admin'"],
    [sources.genesis002AdminPolicySource,
      "const GENESIS_002_TOKEN_TYPE = 'spacetime-access'"],
    [sources.genesis002AdminPolicySource,
      'const MAX_GENESIS_002_ADMIN_LIFETIME_SECONDS = 300'],
    [sources.genesis002AdminPolicySource,
      'const MAX_FUTURE_SKEW_MICROS = 1_000_000n'],
    [sources.genesis002AdminPolicySource,
      "readonly code = 'INVALID_GENESIS_002_ADMIN_SESSION'"],
    [sources.genesis002AuthSource,
      'readFreshGenesis002AdminClaims('],
    [sources.genesis002AuthSource,
      "throw new SenderError('INVALID_GENESIS_002_ADMIN_SESSION')"],
    [sources.authBridgeConfigSource,
      "GENESIS_002_OIDC_AUDIENCE = 'warpkeep-genesis-002-spacetimedb'"],
    [sources.authBridgeJwtSource,
      'export function genesis002AdminClaims('],
    [sources.authBridgeSource,
      "GENESIS_002_ADMIN_TOKEN_PATH = '/v1/admin/genesis-002-token'"],
    [sources.authBridgeSource,
      'genesis002AdminClaims(config, issuedAt)'],
    [sources.authBridgeSource,
      "logger.event('genesis002_admin_token_issued')"],
    [sources.authBridgeSource,
      "logger.event('genesis002_admin_token_rejected')"],
    [sources.genesis002TransportSource,
      "GENESIS_002_ADMIN_TOKEN_PATH =\n  '/v1/admin/genesis-002-token'"],
    [sources.genesis002TransportSource,
      'export async function requestGenesis002AdminToken('],
    [sources.genesis002TransportSource,
      "claims.aud[0] !== 'warpkeep-genesis-002-spacetimedb'"],
  ]) requireOnce(
    source,
    token,
    'SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID',
  );
  requireAbsent(
    sources.genesis002AuthSource,
    ["from '../../src/auth'", 'requireAdmin('],
    'SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID',
  );
  for (const source of [
    sources.genesis002PublisherCoreSource,
    sources.genesis002PublisherCliSource,
    sources.genesis002ImportCoreSource,
    sources.genesis002ImportOperatorSource,
    sources.genesis002TransportSource,
    sources.genesis002LiveReceiptSource,
  ]) requireAbsent(
    source,
    ["'/v1/admin/token'", "'warpkeep-spacetimedb'", "'./hermes-admin'"],
    'SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID',
  );
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
  const requiredPublisherTokens = [
    'WARPKEEP_SPACETIME_CLI_CONFIG_PATH',
    'attestGreaterRealmProductionProtectedMain',
    "networkMode: 'protected-main-attestation-only'",
    'authenticatedCliPostflight: true',
    'cliConfigSourcePath: local.cliConfigSourcePath',
    'spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256',
    'publishReceipt: receipt,',
    'publishReceiptDigest: receipt.publishReceiptDigest,',
  ];
  const forbiddenPublisherTokens = [
    'takeGenesis002ProductionAdminSecret',
    'verifyGenesis002FreshPublishStatus',
  ];
  for (const token of requiredPublisherTokens) {
    if (!sources.genesis002PublisherCliSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID');
    }
  }
  for (const token of forbiddenPublisherTokens) {
    if (sources.genesis002PublisherCliSource.includes(token)) {
      fail('SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID');
    }
  }
  for (const token of [
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

function verifyPtrOwnerAuthority(sources) {
  const code = 'SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID';
  // Interim pins cover the owner-binding authority until Task 7 atomically
  // adds these sources to the authenticated closure and refreezes it.
  for (const [source, expectedSha256] of [
    [sources.authBridgeTypesSource,
      'f4c4c9cd3071f4d85b4ca632133c573b5b9096f954c678d212c30298091dd9a9'],
    [sources.authBridgeJwtSource,
      '30776921dc8d7fa237ad73fb2cd4515662ea5f523ee9f380cdaaddf33467dbb7'],
    [sources.authBridgeSource,
      '75bae3f93146fe841a98a633c4646f6746a76d373b4df5769e209243f088fb11'],
    [sources.ptrOwnerPolicySource,
      '8e7103cb72bee2124bd1b0aa45efcc859c89ad2b4147145115805075b9dcb1c4'],
    [sources.ptrAuthSource,
      '7d3fb69d9d8fadc7a6801f146e8ba6e8efb8b66d990762b28dcd7d3f50c7eb89'],
    [sources.ptrAtlasImportReducersSource,
      '419abecc09643dda84ba00882bb5c0fffa493bfab879fb1031fe59f221803718'],
    [sources.ptrOwnerReducersSource,
      'b19b568e2ec396d0e205358b62647f506f8188ac444d929891b255b7c577d609'],
    [sources.ptrProductionAdminTokenSource,
      'e8f77b46fc117a8587f31b85cee646135ec9a5ce5cd21e548b0f67a0f63ed526'],
    [sources.ptrProductionTransportSource,
      'c99573418d72ce9f2af357da22e6425f337e38bc0a8871ca83bf7beae6b2b41e'],
    [sources.ptrProductionImportCoreSource,
      '6bfc9c68dd7ac14c9ee97d0c9d4187382614ccf1cb1fc8268474effeeb9d4327'],
    [sources.ptrProductionReleaseReceiptsSource,
      '33becc3d94131f62bbdfb5a8833804003ceed44e441ca85988037f495344f385'],
    [sources.ptrProductionImportOperatorSource,
      'cffafcde404530098542374b9ba0ac29b804339aa50d14af912c5d5120b2be53'],
    [sources.ptrProductionReceiptFileSource,
      '2eb39b131a5768e1d9f4b9ba69bc9c53d94bb8d249a5c30af0db0d62ee3c60ab'],
    [sources.ptrOwnerProvisionOperatorSource,
      '40144be3eba3fb4beb0c3b7eccdba4a2c2fd6c72a09ef158eae31413b52e9f78'],
    [sources.ptrPublisherCoreSource,
      '6e53d72915a70b022f8853bd809ca06bea63488ba5c54a19aa664cb9215eb0c2'],
    [sources.ptrPublisherCliSource,
      '8a261a4e2a23a51f80101060e168107f144a3c9811ce22450ea741b25739afa4'],
  ]) {
    if (
      typeof source !== 'string'
      || createHash('sha256').update(source).digest('hex') !== expectedSha256
    ) fail(code);
  }
  verifyPtrOwnerAuthoritySemantics(sources);
}

function contractSourceSlice(source, startMarker, endMarker, code) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (
    start < 0
    || source.indexOf(startMarker, start + startMarker.length) >= 0
    || end <= start
  ) fail(code);
  return source.slice(start, end);
}

function contractTokens(source, code) {
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    const character = source[offset];
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    if (character === '/' && source[offset + 1] === '/') {
      const lineEnd = source.indexOf('\n', offset + 2);
      offset = lineEnd < 0 ? source.length : lineEnd + 1;
      continue;
    }
    if (character === '/' && source[offset + 1] === '*') {
      const commentEnd = source.indexOf('*/', offset + 2);
      if (commentEnd < 0) fail(code);
      offset = commentEnd + 2;
      continue;
    }
    if (/[A-Za-z_$]/u.test(character)) {
      let end = offset + 1;
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end])) end += 1;
      tokens.push(Object.freeze({
        kind: 'identifier',
        value: source.slice(offset, end),
      }));
      offset = end;
      continue;
    }
    if (/[0-9]/u.test(character)) {
      let end = offset + 1;
      while (end < source.length && /[A-Za-z0-9_.]/u.test(source[end])) end += 1;
      tokens.push(Object.freeze({
        kind: 'number',
        value: source.slice(offset, end),
      }));
      offset = end;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let end = offset + 1;
      let escaped = false;
      let value = '';
      while (end < source.length && source[end] !== quote) {
        if (source[end] === '\\') {
          escaped = true;
          end += 2;
          continue;
        }
        if (source[end] === '\n' || source[end] === '\r') fail(code);
        value += source[end];
        end += 1;
      }
      if (end >= source.length) fail(code);
      tokens.push(Object.freeze({ kind: 'string', value, escaped }));
      offset = end + 1;
      continue;
    }
    if (character === '`') {
      fail(code);
    }
    if (character === '/') {
      const previous = tokens[tokens.length - 1]?.value;
      const regexMayStart = previous === undefined || [
        '=', '(', '[', '{', ',', ':', ';', '!', '&&', '||', '??',
        '?', '=>', 'return',
      ].includes(previous);
      if (regexMayStart) {
        let end = offset + 1;
        let inCharacterClass = false;
        while (end < source.length) {
          if (source[end] === '\\') {
            end += 2;
            continue;
          }
          if (source[end] === '\n' || source[end] === '\r') fail(code);
          if (source[end] === '[') inCharacterClass = true;
          else if (source[end] === ']') inCharacterClass = false;
          else if (source[end] === '/' && !inCharacterClass) break;
          end += 1;
        }
        if (end >= source.length || inCharacterClass) fail(code);
        end += 1;
        while (end < source.length && /[A-Za-z]/u.test(source[end])) end += 1;
        tokens.push(Object.freeze({
          kind: 'regex',
          value: source.slice(offset, end),
        }));
        offset = end;
        continue;
      }
    }
    const punctuator = [
      '...', '!==', '===', '=>', '&&', '||', '<=', '>=', '!=', '==',
      '?.', '??', '++', '--', '**',
    ].find(candidate => source.startsWith(candidate, offset));
    if (punctuator !== undefined) {
      tokens.push(Object.freeze({ kind: 'punctuator', value: punctuator }));
      offset += punctuator.length;
      continue;
    }
    tokens.push(Object.freeze({ kind: 'punctuator', value: character }));
    offset += 1;
  }
  return Object.freeze(tokens);
}

function contractBalancedDelimiters(tokens, code) {
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closers = new Set(pairs.values());
  const stack = [];
  for (const token of tokens) {
    const expected = pairs.get(token.value);
    if (expected !== undefined) stack.push(expected);
    else if (closers.has(token.value)) {
      if (stack.pop() !== token.value) fail(code);
    }
  }
  if (stack.length !== 0) fail(code);
}

function contractMatchingMixedDelimiter(tokens, openIndex, code) {
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closers = new Set(pairs.values());
  if (pairs.get(tokens[openIndex]?.value) === undefined) fail(code);
  const stack = [];
  for (let index = openIndex; index < tokens.length; index += 1) {
    const expected = pairs.get(tokens[index].value);
    if (expected !== undefined) stack.push(expected);
    else if (closers.has(tokens[index].value)) {
      if (stack.pop() !== tokens[index].value) fail(code);
      if (stack.length === 0) return index;
    }
  }
  return fail(code);
}

function contractMatchingDelimiter(tokens, openIndex, code) {
  const pairs = Object.freeze({ '(': ')', '[': ']', '{': '}', '<': '>' });
  const open = tokens[openIndex]?.value;
  const close = pairs[open];
  if (close === undefined) fail(code);
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === open) depth += 1;
    if (tokens[index].value === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return fail(code);
}

function contractTopLevelParts(tokens, start, end, separator, code) {
  const parts = [];
  const stack = [];
  const pairs = Object.freeze({ '(': ')', '[': ']', '{': '}' });
  let partStart = start;
  for (let index = start; index < end; index += 1) {
    const value = tokens[index].value;
    if (pairs[value] !== undefined) stack.push(pairs[value]);
    else if (value === ')' || value === ']' || value === '}') {
      if (stack.pop() !== value) fail(code);
    } else if (value === separator && stack.length === 0) {
      if (index === partStart) fail(code);
      parts.push(tokens.slice(partStart, index));
      partStart = index + 1;
    }
  }
  if (stack.length !== 0) fail(code);
  if (partStart < end) parts.push(tokens.slice(partStart, end));
  else if (separator !== ',' || parts.length === 0) fail(code);
  return parts;
}

function contractFunctionBody(source, functionName, code) {
  const tokens = contractTokens(source, code);
  const starts = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      tokens[index].value === 'function'
      && tokens[index + 1].value === functionName
    ) starts.push(index + 1);
  }
  if (starts.length !== 1) fail(code);
  let parametersOpen = starts[0] + 1;
  if (tokens[parametersOpen]?.value === '<') {
    parametersOpen = contractMatchingDelimiter(tokens, parametersOpen, code) + 1;
  }
  if (tokens[parametersOpen]?.value !== '(') fail(code);
  const parametersClose = contractMatchingDelimiter(tokens, parametersOpen, code);
  let angleDepth = 0;
  let bodyOpen = -1;
  for (let index = parametersClose + 1; index < tokens.length; index += 1) {
    if (tokens[index].value === '<') angleDepth += 1;
    else if (tokens[index].value === '>') angleDepth -= 1;
    else if (tokens[index].value === '{' && angleDepth === 0) {
      bodyOpen = index;
      break;
    }
    if (angleDepth < 0) fail(code);
  }
  if (bodyOpen < 0 || angleDepth !== 0) fail(code);
  const bodyClose = contractMatchingDelimiter(tokens, bodyOpen, code);
  if (bodyClose !== tokens.length - 1) fail(code);
  return Object.freeze({ tokens, bodyOpen, bodyClose });
}

function contractCompleteFunctionTokens(tokens, functionName, code) {
  contractBalancedDelimiters(tokens, code);
  const starts = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      tokens[index].value === 'function'
      && tokens[index + 1].value === functionName
    ) starts.push(index + 1);
  }
  if (starts.length !== 1) fail(code);
  const parametersOpen = starts[0] + 1;
  if (tokens[parametersOpen]?.value !== '(') fail(code);
  const parametersClose = contractMatchingMixedDelimiter(
    tokens,
    parametersOpen,
    code,
  );
  let angleDepth = 0;
  let bodyOpen = -1;
  for (let index = parametersClose + 1; index < tokens.length; index += 1) {
    if (tokens[index].value === '<') angleDepth += 1;
    else if (tokens[index].value === '>') angleDepth -= 1;
    else if (tokens[index].value === '{' && angleDepth === 0) {
      bodyOpen = index;
      break;
    }
    if (angleDepth < 0) fail(code);
  }
  if (bodyOpen < 0 || angleDepth !== 0) fail(code);
  const bodyClose = contractMatchingMixedDelimiter(tokens, bodyOpen, code);
  if (bodyClose !== tokens.length - 1) fail(code);
  return Object.freeze({ tokens, bodyOpen, bodyClose });
}

function contractFrozenReturnedObjectTokens(tokens, functionName, code) {
  const { bodyOpen, bodyClose } = contractCompleteFunctionTokens(
    tokens,
    functionName,
    code,
  );
  const returns = [];
  const stack = [];
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closers = new Set(pairs.values());
  for (let index = bodyOpen + 1; index < bodyClose; index += 1) {
    const value = tokens[index].value;
    const expected = pairs.get(value);
    if (expected !== undefined) stack.push(expected);
    else if (closers.has(value)) {
      if (stack.pop() !== value) fail(code);
    } else if (value === 'return' && stack.length === 0) returns.push(index);
  }
  if (stack.length !== 0 || returns.length !== 1) fail(code);
  const returnIndex = returns[0];
  if (JSON.stringify(contractValues(tokens.slice(returnIndex, returnIndex + 6)))
    !== JSON.stringify(['return', 'Object', '.', 'freeze', '(', '{'])) fail(code);
  const objectOpen = returnIndex + 5;
  const objectClose = contractMatchingMixedDelimiter(tokens, objectOpen, code);
  if (
    tokens[objectClose + 1]?.value !== ')'
    || tokens[objectClose + 2]?.value !== ';'
    || objectClose + 3 !== bodyClose
  ) fail(code);
  return Object.freeze({
    objectTokens: tokens.slice(objectOpen + 1, objectClose),
    parts: contractTopLevelParts(
      tokens,
      objectOpen + 1,
      objectClose,
      ',',
      code,
    ),
    returnTokens: tokens.slice(returnIndex, objectClose + 3),
  });
}

function contractReturnedObject(source, functionName, code) {
  const { tokens, bodyOpen, bodyClose } = contractFunctionBody(
    source,
    functionName,
    code,
  );
  const returns = [];
  const stack = [];
  const pairs = Object.freeze({ '(': ')', '[': ']', '{': '}' });
  for (let index = bodyOpen + 1; index < bodyClose; index += 1) {
    const value = tokens[index].value;
    if (pairs[value] !== undefined) stack.push(pairs[value]);
    else if (value === ')' || value === ']' || value === '}') {
      if (stack.pop() !== value) fail(code);
    } else if (value === 'return' && stack.length === 0) returns.push(index);
  }
  if (stack.length !== 0 || returns.length !== 1) fail(code);
  const objectOpen = returns[0] + 1;
  if (tokens[objectOpen]?.value !== '{') fail(code);
  const objectClose = contractMatchingDelimiter(tokens, objectOpen, code);
  if (
    objectClose >= bodyClose
    || (tokens[objectClose + 1]?.value !== ';'
      && tokens[objectClose + 1]?.value !== '}')
  ) fail(code);
  return contractTopLevelParts(tokens, objectOpen + 1, objectClose, ',', code);
}

function contractObjectProperty(part, code) {
  if (
    part.length < 3
    || part[0].kind !== 'identifier'
    || part[1].value !== ':'
  ) fail(code);
  return Object.freeze({ name: part[0].value, value: part.slice(2) });
}

function contractValues(tokens) {
  return tokens.map(token => token.value);
}

function contractSequenceCount(tokens, values) {
  let count = 0;
  for (let index = 0; index <= tokens.length - values.length; index += 1) {
    if (values.every((value, offset) => tokens[index + offset].value === value)) {
      count += 1;
    }
  }
  return count;
}

function contractTopLevelSemicolonEnd(tokens, start, code) {
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closers = new Set(pairs.values());
  const stack = [];
  for (let index = start; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    const expected = pairs.get(value);
    if (expected !== undefined) stack.push(expected);
    else if (closers.has(value)) {
      if (stack.pop() !== value) fail(code);
    } else if (value === ';' && stack.length === 0) return index;
  }
  return fail(code);
}

function contractTopLevelBodyEnd(tokens, start, code) {
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closers = new Set(pairs.values());
  const stack = [];
  for (let index = start; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (value === '{' && stack.length === 0) {
      return contractMatchingMixedDelimiter(tokens, index, code);
    }
    const expected = pairs.get(value);
    if (expected !== undefined) stack.push(expected);
    else if (closers.has(value) && stack.pop() !== value) fail(code);
  }
  return fail(code);
}

function contractTopLevelDeclarations(tokens, code) {
  const declarations = [];
  let start = 0;
  while (start < tokens.length) {
    let cursor = start;
    let exported = false;
    if (tokens[cursor]?.value === 'export') {
      exported = true;
      cursor += 1;
    }
    const kind = tokens[cursor]?.value;
    let name;
    let end;
    if (kind === 'import' && !exported) {
      end = contractTopLevelSemicolonEnd(tokens, start, code);
      const modules = tokens.slice(start, end)
        .filter(token => token.kind === 'string');
      if (modules.length !== 1 || modules[0].escaped) fail(code);
      name = modules[0].value;
    } else if (kind === 'const' || kind === 'type') {
      name = tokens[cursor + 1]?.value;
      if (tokens[cursor + 1]?.kind !== 'identifier') fail(code);
      end = contractTopLevelSemicolonEnd(tokens, start, code);
    } else if (kind === 'class' || kind === 'function') {
      name = tokens[cursor + 1]?.value;
      if (tokens[cursor + 1]?.kind !== 'identifier') fail(code);
      end = contractTopLevelBodyEnd(tokens, cursor + 2, code);
    } else fail(code);
    declarations.push(Object.freeze({
      exported,
      kind,
      name,
      start,
      end,
      tokens: tokens.slice(start, end + 1),
    }));
    start = end + 1;
  }
  return Object.freeze(declarations);
}

export function verifyPtrOwnerAuthoritySemantics(sources) {
  const code = 'SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID';
  const requiredSources = [
    'authBridgeSource', 'authBridgeJwtSource', 'authBridgeTypesSource',
    'ptrOwnerPolicySource', 'ptrAuthSource', 'ptrAtlasImportReducersSource',
    'ptrOwnerReducersSource', 'ptrPublisherCoreSource', 'ptrPublisherCliSource',
    'ptrProductionAdminTokenSource', 'ptrProductionTransportSource',
    'ptrProductionImportCoreSource', 'ptrProductionImportOperatorSource',
    'ptrProductionReleaseReceiptsSource', 'ptrProductionReceiptFileSource',
    'ptrOwnerProvisionOperatorSource', 'genesis002PublisherCoreSource',
    'genesis002PublisherCliSource',
  ];
  if (requiredSources.some(key => typeof sources[key] !== 'string')) fail(code);

  for (const [source, token] of [
    [sources.authBridgeTypesSource, 'export type PtrAtlasAdminTokenClaims ='],
    [sources.authBridgeJwtSource, 'export function ptrAtlasAdminClaims('],
    [sources.authBridgeSource,
      "export const PTR_ATLAS_ADMIN_TOKEN_PATH = '/v1/admin/ptr-atlas-token'"],
    [sources.ptrOwnerPolicySource, 'export type PtrAtlasAdminClaims ='],
    [sources.ptrOwnerPolicySource, 'export function readFreshPtrAtlasAdminClaims('],
    [sources.ptrAuthSource, 'export function requirePtrAtlasAdmin('],
    [sources.ptrOwnerReducersSource,
      'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);'],
    [sources.ptrProductionAdminTokenSource,
      'export function readPtrAtlasImportAuthority('],
    [sources.ptrProductionAdminTokenSource,
      'export function requestPtrAtlasProductionAdminToken('],
    [sources.ptrProductionTransportSource,
      'export function createPtrAtlasImportTransport('],
    [sources.ptrProductionTransportSource,
      'export function createPtrOwnerProvisionTransport('],
    [sources.ptrProductionImportCoreSource,
      "'warpkeep.ptr.production-import-receipt.v1\\n'"],
    [sources.ptrProductionImportOperatorSource,
      "mutationSurface: 'atlas-import-only'"],
    [sources.ptrProductionReceiptFileSource,
      'export function readPrivatePtrProductionImportReceipt('],
    [sources.ptrProductionReleaseReceiptsSource,
      "'atlasImportReceiptDigest',"],
    [sources.ptrProductionReleaseReceiptsSource,
      "'ownerProvisionReceiptDigest',"],
    [sources.ptrOwnerProvisionOperatorSource,
      'const secondEvidence = readImportReceipt({'],
    [sources.ptrOwnerProvisionOperatorSource,
      'const ownerOpaqueProofDigest = deriveOwnerProof({'],
    [sources.ptrOwnerProvisionOperatorSource,
      'transport = createOwnerTransport({'],
    [sources.ptrPublisherCoreSource,
      'export function createSealedRealmsPublicationPossiblySubmittedMarker('],
    [sources.genesis002PublisherCoreSource,
      'export function createSealedRealmsPublicationPossiblySubmittedMarker('],
  ]) requireOnce(source, token, code);
  const markerKeys = [
    'schemaVersion', 'profile', 'lane', 'sourceCommit', 'databaseUri',
    'alias', 'moduleIdentity', 'release', 'artifactDigest', 'toolchainDigest',
    'publishPlanDigest', 'confirmationDigest', 'attemptNonce', 'markedAt',
    'submissionState',
  ];
  for (const [publisher, lane] of [
    [sources.genesis002PublisherCoreSource, 'g002'],
    [sources.ptrPublisherCoreSource, 'ptr'],
  ]) {
    const keys = contractSourceSlice(
      publisher,
      'const PUBLICATION_MARKER_KEYS = Object.freeze([',
      'const PUBLICATION_RECONCILIATION_INPUT_KEYS',
      code,
    ).match(/'([^']+)'/gu)?.map(value => value.slice(1, -1));
    const reconciliationKeys = contractSourceSlice(
      publisher,
      'const PUBLICATION_RECONCILIATION_INPUT_KEYS = Object.freeze([',
      'const PUBLICATION_LANE_TUPLES',
      code,
    ).match(/'([^']+)'/gu)?.map(value => value.slice(1, -1));
    const snapshot = contractSourceSlice(
      publisher,
      'function exactPublicationRecord(',
      'function canonicalPublicationTimestamp(',
      code,
    );
    const timestamp = contractSourceSlice(
      publisher,
      'function canonicalPublicationTimestamp(',
      'function canonicalPublicationMarker(',
      code,
    );
    const markerValidation = contractSourceSlice(
      publisher,
      'function canonicalPublicationMarker(',
      'export function createSealedRealmsPublicationPossiblySubmittedMarker(',
      code,
    );
    const reconciliation = contractSourceSlice(
      publisher,
      'export function createSealedRealmsPublicationMarkerReconciliation(',
      lane === 'g002'
        ? 'function genesis002ChildEnvironment('
        : 'function exactRecord(',
      code,
    );
    const laneCheck = publisher.indexOf(`if (marker.lane !== '${lane}')`);
    const tupleLookup = publisher.indexOf(
      'const tuple = PUBLICATION_LANE_TUPLES[marker.lane];',
    );
    const byteBound = publisher.indexOf(
      'if (bytes.byteLength > PUBLICATION_MARKER_MAXIMUM_BYTES)',
    );
    const decoder = publisher.indexOf(
      "new TextDecoder('utf-8', { fatal: true }).decode(bytes)",
    );
    if (
      JSON.stringify(keys) !== JSON.stringify(markerKeys)
      || JSON.stringify(reconciliationKeys) !== JSON.stringify([
        'marker', 'markerDigest', 'outcome', 'databaseIdentity',
        'publicationReceiptDigest', 'observationDigest', 'observedAt',
      ])
      || laneCheck < 0
      || tupleLookup <= laneCheck
      || byteBound < 0
      || decoder <= byteBound
    ) fail(code);
    for (const token of [
      'descriptors = Object.getOwnPropertyDescriptors(value);',
      'const descriptorKeys = Reflect.ownKeys(descriptors);',
      "!Object.hasOwn(descriptor, 'value')",
      'Object.defineProperty(snapshot, key, {',
      'return Object.freeze(snapshot);',
    ]) requireOnce(snapshot, token, code);
    requireAbsent(snapshot, ['{ ...value }', 'value[key]'], code);
    requireOnce(timestamp, "typeof value === 'string'", code);
    for (const field of [
      'sourceCommit', 'artifactDigest', 'toolchainDigest',
      'publishPlanDigest', 'confirmationDigest', 'attemptNonce',
    ]) {
      requireOnce(
        markerValidation,
        `typeof marker.${field} !== 'string'`,
        code,
      );
    }
    requireOnce(
      reconciliation,
      'const source = exactPublicationRecord(',
      code,
    );
    requireOnce(
      reconciliation,
      'const marker = canonicalPublicationMarker(source.marker);',
      code,
    );
    for (const field of [
      'databaseIdentity', 'publicationReceiptDigest', 'observationDigest',
    ]) {
      requireOnce(
        reconciliation,
        `typeof source.${field} !== 'string'`,
        code,
      );
    }
    requireAbsent(reconciliation, ['input.marker', 'input.outcome'], code);
  }
  for (const [publisherCli, markerVariable] of [
    [sources.genesis002PublisherCliSource, 'marker'],
    [sources.ptrPublisherCliSource, 'possiblySubmittedMarker'],
  ]) {
    const keys = contractSourceSlice(
      publisherCli,
      'const PUBLICATION_MARKER_KEYS = Object.freeze([',
      'export class',
      code,
    ).match(/'([^']+)'/gu)?.map(value => value.slice(1, -1));
    const canonicalizer = contractSourceSlice(
      publisherCli,
      'function canonicalizeSuppliedPublicationMarker(',
      'function canonicalDigest(',
      code,
    );
    const transition = contractSourceSlice(
      publisherCli,
      'const suppliedMarker = input.possiblySubmittedMarker;',
      'let receipt;',
      code,
    );
    const canonicalizationToken =
      ': canonicalizeSuppliedPublicationMarker(suppliedMarker);';
    const canonicalization = transition.indexOf(canonicalizationToken);
    if (
      JSON.stringify(keys) !== JSON.stringify(markerKeys)
      || canonicalization < 0
      || transition.slice(
        canonicalization + canonicalizationToken.length,
      ).includes('suppliedMarker')
    ) fail(code);
    for (const token of [
      'descriptors = Object.getOwnPropertyDescriptors(value);',
      'const descriptorKeys = Reflect.ownKeys(descriptors);',
      "!Object.hasOwn(descriptor, 'value')",
      'Object.defineProperty(snapshot, key, {',
      'Object.freeze(snapshot);',
      'createSealedRealmsPublicationPossiblySubmittedMarker({',
      'PUBLICATION_MARKER_KEYS.some(key => marker[key] !== snapshot[key])',
    ]) requireOnce(canonicalizer, token, code);
    requireAbsent(canonicalizer, ['{ ...value }', 'value[key]'], code);
    requireOnce(
      transition,
      `await input.onPossiblySubmittedMarker(${markerVariable});`,
      code,
    );
    requireAbsent(transition, [
      'onPossiblySubmittedMarker(suppliedMarker)',
      'marker = suppliedMarker ??',
      'possiblySubmittedMarker = suppliedMarker ??',
    ], code);
  }
  if (
    sources.genesis002PublisherCliSource
      .split('fail(error.code, true, marker)').length !== 3
    || sources.ptrPublisherCliSource
      .split('fail(error.code, true, possiblySubmittedMarker)').length !== 4
    || !sources.genesis002PublisherCliSource.includes(
      'if (cleanupFailed && !failurePending)',
    )
    || !sources.ptrPublisherCliSource.includes(
      'error.publishAttempted && error.possiblySubmittedMarker === undefined',
    )
  ) fail(code);
  for (const [source, token] of [
    [sources.ptrPublisherCliSource,
      'ptrPublishReceiptEvidence: Object.freeze({'],
    [sources.ptrProductionImportOperatorSource,
      'ptrAtlasImportReceiptEvidence: Object.freeze({'],
    [sources.ptrOwnerProvisionOperatorSource,
      '!Object.hasOwn(patterns, match[1]!)'],
  ]) requireOnce(source, token, code);
  requireAbsent(sources.ptrPublisherCliSource, [
    'ptrPublishReceiptFile, ptrPublishReceiptEvidence:',
  ], code);
  requireAbsent(sources.ptrProductionImportOperatorSource, [
    'ptrAtlasImportReceiptFile, ptrAtlasImportReceiptEvidence:',
  ], code);
  if (
    !sources.ptrAtlasImportReducersSource.includes('requirePtrAtlasAdmin')
    || !sources.ptrPublisherCliSource.includes('onPossiblySubmittedMarker')
    || !sources.genesis002PublisherCliSource.includes('onPossiblySubmittedMarker')
  ) fail(code);

  requireAbsent(sources.ptrAtlasImportReducersSource, [
    'requirePtrAdmin', 'ownerFid', 'ownerAuthEpoch',
  ], code);
  requireAbsent(sources.ptrProductionImportOperatorSource, [
    'executePtrOwnerProvision', 'derivePtrOwnerOpaqueProofDigest',
    'createPtrOwnerProvisionTransport', "kind: 'owner-provision'",
    "kind: 'sealed-live'",
  ], code);
  for (const publisher of [
    sources.genesis002PublisherCliSource,
    sources.ptrPublisherCliSource,
  ]) requireAbsent(publisher, [
    'requestPtrProductionAdminToken', 'requestGenesis002ProductionAdminToken',
    'createPtrAtlasImportTransport', 'createPtrOwnerProvisionTransport',
  ], code);

  const atlasRouteStart = sources.authBridgeSource.indexOf(
    "if (request.method === 'POST' && url.pathname === PTR_ATLAS_ADMIN_TOKEN_PATH) {",
  );
  const atlasRouteEnd = sources.authBridgeSource.indexOf(
    "if (request.method === 'POST' && url.pathname === PTR_ADMIN_TOKEN_PATH) {",
    atlasRouteStart,
  );
  const atlasRoute = sources.authBridgeSource.slice(atlasRouteStart, atlasRouteEnd);
  if (
    atlasRouteStart < 0
    || atlasRouteEnd <= atlasRouteStart
    || !atlasRoute.includes('ptrAtlasAdminClaims(config, issuedAt)')
    || atlasRoute.includes('resolveLivePtrOwnerAdmission(')
    || atlasRoute.includes('ptrAdminClaims(')
  ) fail(code);

  const ownerRouteEnd = sources.authBridgeSource.indexOf(
    "if (request.method === 'POST' && url.pathname === ADMISSION_NOTIFICATION_PATH) {",
    atlasRouteEnd,
  );
  const ownerRoute = sources.authBridgeSource.slice(atlasRouteEnd, ownerRouteEnd);
  if (
    ownerRouteEnd <= atlasRouteEnd
    || ownerRoute.indexOf('resolveLivePtrOwnerAdmission(') < 0
    || ownerRoute.indexOf('ptrAdminClaims(')
      <= ownerRoute.indexOf('resolveLivePtrOwnerAdmission(')
  ) fail(code);

  const ownerReducerStart = sources.ptrOwnerReducersSource.indexOf(
    'export const adminProvisionPtrOwnerV1',
  );
  const ownerReducerEnd = sources.ptrOwnerReducersSource.indexOf(
    '/** Disable the retained owner anchor', ownerReducerStart,
  );
  const ownerReducer = sources.ptrOwnerReducersSource.slice(
    ownerReducerStart, ownerReducerEnd,
  );
  const adminIndex = ownerReducer.indexOf('const admin = requirePtrAdmin(ctx);');
  const bindingIndex = ownerReducer.indexOf(
    'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);',
  );
  const stateIndex = ownerReducer.indexOf('requirePtrPopulationEmpty(ctx);');
  if (
    ownerReducerStart < 0
    || ownerReducerEnd <= ownerReducerStart
    || adminIndex < 0
    || bindingIndex <= adminIndex
    || stateIndex <= bindingIndex
  ) fail(code);

  const ownerOperator = sources.ptrOwnerProvisionOperatorSource;
  const orderedTokens = [
    'const firstEvidence = readImportReceipt({',
    'await inspectStatus()',
    'const resolved = await resolveOwnerAuthority(ownerFid);',
    'ownerToken = await requestOwnerToken(adminSecret);',
    'const secondEvidence = readImportReceipt({',
    'const ownerOpaqueProofDigest = deriveOwnerProof({',
    'transport = createOwnerTransport({',
    'const provision = await executeProvision({',
  ];
  let orderCursor = -1;
  for (const token of orderedTokens) {
    const next = ownerOperator.indexOf(token, orderCursor + 1);
    if (next <= orderCursor) fail(code);
    orderCursor = next;
  }

  const task6cTransportTokens = contractTokens(
    sources.ptrProductionTransportSource,
    code,
  );
  const task6cTransportDeclarations = contractTopLevelDeclarations(
    task6cTransportTokens,
    code,
  );
  const task6cExpectedTransportDeclarations = [
    'import:../spacetimedb/ptr/generated-bindings',
    'import:./ptr-production-admin-token',
    'export const:PTR_PRODUCTION_TRANSPORT_TARGET',
    'export const:PTR_PRODUCTION_ALLOWED_REDUCERS',
    'const:SHA256',
    'const:MINIMUM_SECRET_BYTES',
    'const:MAXIMUM_SECRET_BYTES',
    'const:CONNECT_TIMEOUT_MILLISECONDS',
    'const:OPERATION_TIMEOUT_MILLISECONDS',
    'type:PtrProductionReducer',
    'const:PTR_PRODUCTION_ATLAS_REDUCER_METHODS',
    'type:RequestToken',
    'type:DynamicConnection',
    'export class:PtrProductionTransportError',
    'function:fail',
    'function:operationTimeout',
    'function:connectPtrProduction',
    'function:disconnect',
    'function:validSecret',
    'function:validTarget',
    'export type:PtrAtlasImportTransport',
    'export function:createPtrAtlasImportTransport',
    'export type:PtrOwnerProvisionTransport',
    'export function:createPtrOwnerProvisionTransport',
  ];
  if (JSON.stringify(task6cTransportDeclarations.map(declaration => (
    `${declaration.exported ? 'export ' : ''}${declaration.kind}:${declaration.name}`
  ))) !== JSON.stringify(task6cExpectedTransportDeclarations)) fail(code);
  const task6cDeclarationTokenPins = Object.freeze({
    PTR_PRODUCTION_ALLOWED_REDUCERS:
      '1c4faaa9592d30a0e236d64de2e3f4eb9888a705d86f61b7f4385a4fee7c7a7d',
    PTR_PRODUCTION_ATLAS_REDUCER_METHODS:
      'dd66c11bdbad0c73e1a83c14b83109a8e1d24301d8197766c6600972ef2d7358',
    createPtrAtlasImportTransport:
      '4e7152842700e892f2a79673430aa987c7927d7229da498c3fd2913439d7d6f0',
    createPtrOwnerProvisionTransport:
      'b6d582866d717e5a3084fe94bbf49feb4b6a91b76333b9cadd646886a843041d',
  });
  for (const [name, expectedDigest] of Object.entries(
    task6cDeclarationTokenPins,
  )) {
    const declaration = task6cTransportDeclarations.find(
      candidate => candidate.name === name,
    );
    if (
      declaration === undefined
      || createHash('sha256')
        .update(JSON.stringify(declaration.tokens))
        .digest('hex') !== expectedDigest
    ) fail(code);
  }

  const ownerAuthorityParser = contractSourceSlice(
    sources.ptrProductionAdminTokenSource,
    'export function readPtrOwnerProvisionAuthority(',
    'export function takePtrProductionAdminSecret(',
    code,
  );
  requireOnce(
    ownerAuthorityParser,
    "record.token_type !== 'spacetime-access'",
    code,
  );
  requireAbsent(ownerAuthorityParser, [
    "record.token_type !== 'admin'",
    "record.token_type === 'admin'",
  ], code);
  const atlasAuthorityParser = contractSourceSlice(
    sources.ptrProductionAdminTokenSource,
    'export function readPtrAtlasImportAuthority(',
    'export function readPtrOwnerProvisionAuthority(',
    code,
  );
  requireOnce(
    atlasAuthorityParser,
    "record.token_type !== 'spacetime-access'",
    code,
  );
  requireAbsent(atlasAuthorityParser, [
    'ptr_owner_fid', 'ptr_owner_auth_epoch',
    "record.token_type !== 'admin'", "record.token_type === 'admin'",
  ], code);
  const atlasAuthorityClaimKeys = contractSourceSlice(
    sources.ptrProductionAdminTokenSource,
    'const PTR_ATLAS_ADMIN_CLAIM_KEYS = Object.freeze([',
    '] as const);\n\nexport class PtrProductionAdminTokenError',
    code,
  );
  requireAbsent(atlasAuthorityClaimKeys, [
    'ptr_owner_fid', 'ptr_owner_auth_epoch',
  ], code);
  const moduleAtlasAuthorityClaimKeys = contractSourceSlice(
    sources.ptrOwnerPolicySource,
    'const PTR_ATLAS_ADMIN_EXACT_CLAIM_KEYS = Object.freeze([',
    '] as const);\n\nexport type WarpkeepBaseJwtClaims',
    code,
  );
  requireAbsent(moduleAtlasAuthorityClaimKeys, [
    'ptr_owner_fid', 'ptr_owner_auth_epoch',
  ], code);

  const ptrStatusKeys = contractSourceSlice(
    sources.ptrProductionImportCoreSource,
    'const STATUS_KEYS = Object.freeze([',
    'const OPTIONAL_STRINGS',
    code,
  );
  requireAbsent(ptrStatusKeys, ['ownerFid', 'ownerAuthEpoch'], code);
  const ptrImportReceiptKeys = contractSourceSlice(
    sources.ptrProductionImportCoreSource,
    'const IMPORT_RECEIPT_KEYS = Object.freeze([',
    'export class PtrProductionImportError',
    code,
  );
  requireAbsent(ptrImportReceiptKeys, [
    'ownerFid', 'ownerAuthEpoch', 'entropy', 'ownerOpaqueProofDigest',
    'ownerToken', 'ownerProvisionReceiptDigest',
  ], code);
  for (const token of [
    "'ownerFid', 'ownerAuthEpoch', 'entropy', 'ownerOpaqueProofDigest',",
    "'ownerToken', 'ownerTransport', 'ownerCallback',",
    'Object.hasOwn(input.transport, \'provisionOwner\')',
    'status.ownerProvisioned || status.ownerEnabled',
  ]) requireOnce(sources.ptrProductionImportCoreSource, token, code);

  const ownerReceiptKeys = contractSourceSlice(
    sources.ptrProductionReleaseReceiptsSource,
    'const OWNER_PROVISION_RECEIPT_KEYS = Object.freeze([',
    'const SEALED_LIVE_RECEIPT_KEYS',
    code,
  );
  requireOnce(ownerReceiptKeys, "'atlasImportReceiptDigest',", code);
  const sealedLiveReceiptKeys = contractSourceSlice(
    sources.ptrProductionReleaseReceiptsSource,
    'const SEALED_LIVE_RECEIPT_KEYS = Object.freeze([',
    'const ZERO_LIVE_FIELDS',
    code,
  );
  requireOnce(sealedLiveReceiptKeys, "'ownerProvisionReceiptDigest',", code);
  for (const token of [
    'tokenAuthority.ownerAuthEpoch !== resolved.ownerAuthEpoch',
    'ownerAuthEpoch: resolved.ownerAuthEpoch,\n      databaseIdentity',
    'ownerAuthEpoch: resolved.ownerAuthEpoch,\n      ownerOpaqueProofDigest',
    '!== secondReceipt.importReceiptDigest',
    'provision.ownerProvisionReceipt.databaseIdentity',
    'provision.sealedLiveReceipt.ownerOpaqueProofDigest\n        !== ownerOpaqueProofDigest',
    'provision.sealedLiveReceipt.ownerProvisionReceiptDigest\n        !== provisionReceiptDigest',
    'ptrSealedLiveReceiptDigest(provision.sealedLiveReceipt)',
  ]) requireOnce(ownerOperator, token, code);
  for (const [source, token] of [
    [sources.ptrProductionReleaseReceiptsSource,
      'ownerAuthority.ownerAuthEpoch !== input.ownerAuthEpoch'],
    [sources.ptrAtlasImportReducersSource,
      'ctx.db.ptrOwnerAnchorV1.count() !== 0n'],
    [sources.ptrOwnerReducersSource,
      '!atlas.ready || !atlas.importsExact'],
  ]) requireOnce(source, token, code);

  const ptrAdminClaims = contractSourceSlice(
    sources.authBridgeJwtSource,
    'export function ptrAdminClaims(',
    '/** Fresh 15-second resolver token',
    code,
  );
  requireAbsent(ptrAdminClaims, ["token_type: 'admin'"], code);

  for (const source of [
    sources.authBridgeJwtSource,
    sources.ptrOwnerPolicySource,
    sources.ptrProductionAdminTokenSource,
    sources.ptrProductionTransportSource,
  ]) {
    if (typeof source !== 'string') fail(code);
  }
  const hermesProperties = contractReturnedObject(
    contractSourceSlice(
      sources.authBridgeJwtSource,
      'function hermesAdminClaims',
      '/** Five-minute external Hermes token',
      code,
    ),
    'hermesAdminClaims',
    code,
  ).map(part => contractObjectProperty(part, code));
  if (JSON.stringify(hermesProperties.map(property => property.name)) !== JSON.stringify([
    'iss',
    'sub',
    'aud',
    'token_type',
    'roles',
    'iat',
    'nbf',
    'exp',
    'jti',
  ])) fail(code);
  const hermesTokenType = hermesProperties[3].value;
  if (
    hermesTokenType.length !== 1
    || hermesTokenType[0].kind !== 'string'
    || hermesTokenType[0].escaped
    || hermesTokenType[0].value !== 'spacetime-access'
  ) fail(code);

  const ptrAdminParts = contractReturnedObject(
    contractSourceSlice(
      sources.authBridgeJwtSource,
      'export function ptrAdminClaims(',
      '/** Five-minute ownerless Hermes token',
      code,
    ),
    'ptrAdminClaims',
    code,
  );
  if (
    ptrAdminParts.length !== 3
    || JSON.stringify(contractValues(ptrAdminParts[0])) !== JSON.stringify([
      '...',
      'hermesAdminClaims',
      '(',
      'config', '.', 'issuer',
      ',',
      'ptr', '.', 'audience',
      ',',
      'nowSeconds',
      ',',
      'ADMIN_TOKEN_TTL_SECONDS',
      ')',
    ])
  ) fail(code);
  const ptrAdminProperties = ptrAdminParts.slice(1)
    .map(part => contractObjectProperty(part, code));
  if (
    JSON.stringify(ptrAdminProperties.map(property => property.name))
      !== JSON.stringify(['ptr_owner_fid', 'ptr_owner_auth_epoch'])
    || JSON.stringify(contractValues(ptrAdminProperties[0].value))
      !== JSON.stringify(['ownerFid'])
    || JSON.stringify(contractValues(ptrAdminProperties[1].value))
      !== JSON.stringify(['ownerAuthEpoch'])
  ) fail(code);

  const ptrPolicyTokens = contractTokens(contractSourceSlice(
    sources.ptrOwnerPolicySource,
    'const WARPKEEP_TOKEN_TYPE',
    'const WARPKEEP_AUTH_VERSION',
    code,
  ), code);
  if (
    ptrPolicyTokens.length !== 5
    || JSON.stringify(contractValues(ptrPolicyTokens.slice(0, 3)))
      !== JSON.stringify(['const', 'WARPKEEP_TOKEN_TYPE', '='])
    || ptrPolicyTokens[3].kind !== 'string'
    || ptrPolicyTokens[3].escaped
    || ptrPolicyTokens[3].value !== 'spacetime-access'
    || ptrPolicyTokens[4].value !== ';'
  ) fail(code);

  const localParserBody = contractFunctionBody(contractSourceSlice(
    sources.ptrProductionAdminTokenSource,
    'export function readPtrOwnerProvisionAuthority(',
    'export function takePtrProductionAdminSecret(',
    code,
  ), 'readPtrOwnerProvisionAuthority', code);
  const localTokens = localParserBody.tokens;
  const localAuthorityTokens = localTokens.filter(token => (
    (token.kind === 'identifier' || token.kind === 'string')
    && token.value === 'token_type'
  ));
  const localMemberStarts = [];
  for (let index = localParserBody.bodyOpen + 1;
    index < localParserBody.bodyClose - 3;
    index += 1) {
    if (
      JSON.stringify(contractValues(localTokens.slice(index, index + 3)))
        === JSON.stringify(['record', '.', 'token_type'])
    ) localMemberStarts.push(index);
    if (
      localTokens[index].value === 'record'
      && localTokens[index + 1]?.value === '['
    ) fail(code);
  }
  if (
    localAuthorityTokens.length !== 1
    || localMemberStarts.length !== 1
    || localTokens[localMemberStarts[0] + 3]?.value !== '!=='
    || localTokens[localMemberStarts[0] + 4]?.kind !== 'string'
    || localTokens[localMemberStarts[0] + 4]?.escaped
    || localTokens[localMemberStarts[0] + 4]?.value !== 'spacetime-access'
  ) fail(code);
  const authorityConditions = [];
  for (let index = localParserBody.bodyOpen + 1;
    index < localParserBody.bodyClose;
    index += 1) {
    if (localTokens[index].value !== 'if' || localTokens[index + 1]?.value !== '(') continue;
    const conditionClose = contractMatchingDelimiter(localTokens, index + 1, code);
    if (
      localMemberStarts[0] > index + 1
      && localMemberStarts[0] < conditionClose
    ) authorityConditions.push([index + 2, conditionClose]);
  }
  if (authorityConditions.length !== 1) fail(code);
  const authorityClauses = contractTopLevelParts(
    localTokens,
    authorityConditions[0][0],
    authorityConditions[0][1],
    '||',
    code,
  ).filter(part => part.some(token => token.value === 'token_type'));
  if (
    authorityClauses.length !== 1
    || authorityClauses[0].length !== 5
    || JSON.stringify(contractValues(authorityClauses[0].slice(0, 4)))
      !== JSON.stringify(['record', '.', 'token_type', '!=='])
    || authorityClauses[0][4].kind !== 'string'
    || authorityClauses[0][4].escaped
    || authorityClauses[0][4].value !== 'spacetime-access'
  ) fail(code);

  const allowedReducerTokens = contractTokens(contractSourceSlice(
    sources.ptrProductionTransportSource,
    'export const PTR_PRODUCTION_ALLOWED_REDUCERS',
    'const SHA256',
    code,
  ), code);
  if (JSON.stringify(contractValues(allowedReducerTokens.slice(0, 9))) !== JSON.stringify([
    'export', 'const', 'PTR_PRODUCTION_ALLOWED_REDUCERS', '=',
    'Object', '.', 'freeze', '(', '[',
  ])) fail(code);
  const allowedReducerClose = contractMatchingDelimiter(
    allowedReducerTokens,
    8,
    code,
  );
  if (JSON.stringify(contractValues(allowedReducerTokens.slice(allowedReducerClose + 1)))
    !== JSON.stringify(['as', 'const', ')', ';'])) fail(code);
  const genericReducerParts = contractTopLevelParts(
    allowedReducerTokens,
    9,
    allowedReducerClose,
    ',',
    code,
  );
  const expectedGenericReducers = [
    'admin_stage_greater_realm_release_v1',
    'admin_import_greater_realm_components_v1',
    'admin_import_greater_realm_regions_v1',
    'admin_import_greater_realm_chunk_v1',
    'admin_begin_greater_realm_verification_v1',
    'admin_verify_greater_realm_batch_v1',
    'admin_finalize_greater_realm_release_v1',
  ];
  if (
    genericReducerParts.length !== expectedGenericReducers.length
    || genericReducerParts.some((part, index) => (
      part.length !== 1
      || part[0].kind !== 'string'
      || part[0].escaped
      || part[0].value !== expectedGenericReducers[index]
    ))
  ) fail(code);

  const reducerMapTokens = contractTokens(contractSourceSlice(
    sources.ptrProductionTransportSource,
    'const PTR_PRODUCTION_ATLAS_REDUCER_METHODS',
    'type RequestToken',
    code,
  ), code);
  if (JSON.stringify(contractValues(reducerMapTokens.slice(0, 18))) !== JSON.stringify([
    'const', 'PTR_PRODUCTION_ATLAS_REDUCER_METHODS', ':',
    'Readonly', '<', 'Record', '<', 'PtrProductionReducer', ',', 'string', '>', '>',
    '=', 'Object', '.', 'freeze', '(', '{',
  ])) fail(code);
  const reducerMapClose = contractMatchingDelimiter(reducerMapTokens, 17, code);
  if (JSON.stringify(contractValues(reducerMapTokens.slice(reducerMapClose + 1)))
    !== JSON.stringify(['as', 'const', ')', ';'])) fail(code);
  const reducerMapParts = contractTopLevelParts(
    reducerMapTokens,
    18,
    reducerMapClose,
    ',',
    code,
  );
  const expectedReducerMethods = [
    'adminStageGreaterRealmReleaseV1',
    'adminImportGreaterRealmComponentsV1',
    'adminImportGreaterRealmRegionsV1',
    'adminImportGreaterRealmChunkV1',
    'adminBeginGreaterRealmVerificationV1',
    'adminVerifyGreaterRealmBatchV1',
    'adminFinalizeGreaterRealmReleaseV1',
  ];
  if (
    reducerMapParts.length !== expectedGenericReducers.length
    || reducerMapParts.some((part, index) => (
      part.length !== 3
      || part[0].kind !== 'string'
      || part[0].escaped
      || part[0].value !== expectedGenericReducers[index]
      || part[1].value !== ':'
      || part[2].kind !== 'string'
      || part[2].escaped
      || part[2].value !== expectedReducerMethods[index]
    ))
  ) fail(code);

  for (const [source, token] of [
    [sources.authBridgeTypesSource, 'export type PtrAdminTokenClaims ='],
    [sources.authBridgeTypesSource, 'ptr_owner_fid: string'],
    [sources.authBridgeTypesSource, 'ptr_owner_auth_epoch: number'],
    [sources.authBridgeJwtSource, 'ptr_owner_fid: ownerFid'],
    [sources.authBridgeJwtSource, 'ptr_owner_auth_epoch: ownerAuthEpoch'],
    [sources.authBridgeSource, 'resolver.resolve(expectedOwnerFid)'],
    [sources.authBridgeSource, 'ownerAdmission.authEpoch'],
    [sources.ptrOwnerPolicySource, 'export type PtrAdminClaims ='],
    [sources.ptrOwnerPolicySource, 'ownerFid !== admin.ownerFid'],
    [sources.ptrOwnerPolicySource, 'authEpoch !== admin.ownerAuthEpoch'],
    [sources.ptrOwnerReducersSource,
      'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);'],
    [sources.ptrProductionAdminTokenSource,
      'export function readPtrOwnerProvisionAuthority('],
    [sources.ptrProductionAdminTokenSource,
      'ownerFid !== expectedOwnerFid'],
    [sources.ptrProductionAdminTokenSource,
      '(expiresAt as number) <= currentTimeSeconds'],
    [sources.ptrProductionTransportSource,
      'provisionOwner: (expectedOwnerFid, assertCanStartWrite) => runSerialized(async () => {'],
    [sources.ptrProductionTransportSource,
      'authority = readPtrOwnerProvisionAuthority('],
    [sources.ptrProductionTransportSource,
      'active = await connectDatabase(databaseIdentity, token);'],
    [sources.ptrProductionTransportSource,
      'await operationTimeout(method(Object.freeze({'],
    [sources.ptrProductionReleaseReceiptsSource,
      'ownerAuthority = await input.transport.provisionOwner('],
    [sources.ptrProductionReleaseReceiptsSource,
      'ownerAuthority.ownerAuthEpoch !== input.ownerAuthEpoch'],
    [sources.ptrOwnerProvisionOperatorSource,
      'ownerAuthEpoch: resolved.ownerAuthEpoch,\n      ownerOpaqueProofDigest'],
  ]) requireOnce(source, token, code);
  for (const token of [
    'Object.getPrototypeOf(payload) !== Object.prototype',
    'const keys = Reflect.ownKeys(record);',
  ]) {
    if (sources.ptrOwnerPolicySource.split(token).length !== 3) fail(code);
  }

  requireAbsent(sources.ptrProductionReleaseReceiptsSource, [
    'authEpoch: 1',
    'ownerAuthEpoch !== 1',
  ], code);

  const adminRouteStart = sources.authBridgeSource.indexOf(
    "if (request.method === 'POST' && url.pathname === PTR_ADMIN_TOKEN_PATH) {",
  );
  const adminRouteEnd = sources.authBridgeSource.indexOf(
    "if (request.method === 'POST' && url.pathname === ADMISSION_NOTIFICATION_PATH) {",
    adminRouteStart,
  );
  const adminRoute = sources.authBridgeSource.slice(
    adminRouteStart,
    adminRouteEnd,
  );
  const adminResolve = adminRoute.indexOf('resolveLivePtrOwnerAdmission(');
  const adminMint = adminRoute.indexOf('ptrAdminClaims(');
  if (
    adminRouteStart < 0
    || adminRouteEnd <= adminRouteStart
    || adminResolve < 0
    || adminMint <= adminResolve
  ) fail(code);

  const ownerResponseStart = sources.authBridgeSource.indexOf(
    'async function ptrOwnerQuickAuthResponseBody(',
  );
  const ownerResponseEnd = sources.authBridgeSource.indexOf(
    'function accessRequestResponseBody(',
    ownerResponseStart,
  );
  const ownerResponse = sources.authBridgeSource.slice(
    ownerResponseStart,
    ownerResponseEnd,
  );
  if (
    ownerResponseStart < 0
    || ownerResponseEnd <= ownerResponseStart
    || ownerResponse.includes('identity:')
  ) fail(code);

  const reducerStart = sources.ptrOwnerReducersSource.indexOf(
    'export const adminProvisionPtrOwnerV1',
  );
  const reducerEnd = sources.ptrOwnerReducersSource.indexOf(
    '/** Disable the retained owner anchor',
    reducerStart,
  );
  const reducer = sources.ptrOwnerReducersSource.slice(
    reducerStart,
    reducerEnd,
  );
  const requireAdmin = reducer.indexOf('const admin = requirePtrAdmin(ctx);');
  const requireBinding = reducer.indexOf(
    'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);',
  );
  const firstStateAccess = reducer.indexOf('requirePtrPopulationEmpty(ctx);');
  if (
    reducerStart < 0
    || reducerEnd <= reducerStart
    || requireAdmin < 0
    || requireBinding <= requireAdmin
    || firstStateAccess <= requireBinding
  ) fail(code);
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

export function verifyGenesis001AdmittedPlayerCensusBoundary(sources) {
  const code = 'SEALED_LAUNCH_G001_ADMITTED_PLAYER_CENSUS_BOUNDARY_INVALID';
  const source = sources.genesis001AdmittedPlayerCensusSource;
  const declaration = sources.genesis001AdmittedPlayerCensusDeclaration;
  for (const token of [
    "'warpkeep-genesis-001-admitted-player-census-private-proof-v1'",
    `'${GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE}'`,
    "'SELECT fid, enabled, auth_epoch FROM allowed_fid'",
    "'SELECT fid FROM player_v2'",
    "'admin_get_access_request_admission_status_v1'",
    "'warpkeep.genesis-001.admitted-player-census.normalized-set.v1\\n'",
    "'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\\n'",
    "'warpkeep.genesis-001.admitted-player-census.private-proof.v1\\n'",
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS = 4_096;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES =\n  1_024 * 1_024;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS =\n  60_000;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS =\n  300_000;',
    "if (value?.outcome === 'unsupported-exact-query') {",
    "result.outcome !== 'exact-query-supported'",
    "new TextDecoder('utf-8', { fatal: true })",
    'output.byteLength > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES',
    'output.some(byte => byte > 0x7f)',
    "parsed.lines.shift() !== 'fid\\tenabled\\tauth_epoch'",
    "parsed.lines.shift() !== 'fid'",
    'parsed.lines.length > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS',
    'MAXIMUM_FID = 9_007_199_254_740_991n',
    'MAXIMUM_AUTH_EPOCH = 4_294_967_295n',
    "enabled !== 'true'",
    'seen.has(fid)',
    '.update(GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN)',
    '.update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)',
    '.update(GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN)',
    "['allowedFids', 'enabledAllowedFids']",
    'allowedFids < 1n',
    'enabledAllowedFids !== allowedFids',
    "'admissionState',\n      'authEpoch',\n      'requestCycle',\n      'requestState',\n      'requestedAtMicros',",
    "status.admissionState !== 'enabled'",
    'for (const fid of enumeration.fids) {',
    'const status = exactProcedureStatus(await input.readAdmissionStatus(',
    'statuses.push(canonicalFallbackStatus(status));',
    'fallbackEntries.push({ fid, authEpoch: String(status.authEpoch) });',
    "typeof status.authEpoch !== 'number'",
    '!Number.isInteger(status.authEpoch)',
    'status.authEpoch > Number(MAXIMUM_AUTH_EPOCH)',
    '(requestCycle === undefined) !== (requestedAtMicros === undefined)',
    "typeof requestCycle !== 'bigint'",
    'requestCycle > MAXIMUM_U64',
    "typeof requestedAtMicros !== 'bigint'",
    'requestCycle > maximumCycle',
    'requestedAtMicros > MAXIMUM_U64',
    "!['not_requested', 'pending', 'resolved'].includes(status.requestState)",
    'const expectedRequestState = requestCycle === undefined',
    'status.requestState !== expectedRequestState',
    'const beforeAggregate = exactAggregate(await input.readAggregates());',
    'await input.queryPreferred(GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL)',
    'const afterAggregate = exactAggregate(await input.readAggregates());',
    'JSON.stringify(beforeAggregate) !== JSON.stringify(afterAggregate)',
    'BigInt(beforeAggregate.allowedFids) !== BigInt(entries.length)',
    'randomBytes(NONCE_BYTES)',
    'output.every(byte => byte === 0)',
    'opaqueProofDigest(privateProof(canonicalReceipt))',
    'normalizedSetDigest(normalized) !== receipt.normalizedSetDigest',
    'separation < GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS',
    'separation > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS',
    'first.nonceHex === second.nonceHex',
    'first.opaqueProofDigest === second.opaqueProofDigest',
    'profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,',
    'opaqueProofDigest: second.opaqueProofDigest,',
  ]) {
    if (!source.includes(token)) fail(code);
  }
  if (
    source.match(/^import /gmu)?.length !== 1
    || !source.startsWith("import { createHash } from 'node:crypto';\n")
    || source.split(
      'JSON.stringify(beforeAggregate) !== JSON.stringify(afterAggregate)',
    ).length !== 3
  ) fail(code);
  requireAbsent(source, [
    'node:fs',
    'node:child_process',
    'node:http',
    'node:https',
    'node:path',
    'pathToFileURL',
    'import.meta',
    'process.',
    'process[',
    'console.',
    'stdout',
    'stderr',
    'systemRandom',
    'Date()',
    'Date.now(',
    'new Date()',
    'globalThis.Date',
    'global.Date',
    'Math.random(',
    'randomUUID(',
    'crypto.randomUUID',
    'globalThis.crypto',
    'crypto.getRandomValues',
    'getRandomValues',
    'performance.now(',
    'fetch(',
    'WebSocket',
    'import(',
    'require(',
    '--format',
  ], code);
  const statusStart = source.indexOf('function exactProcedureStatus(value) {');
  const statusEnd = source.indexOf(
    '\nfunction canonicalFallbackStatus(status) {',
    statusStart,
  );
  if (statusStart < 0 || statusEnd <= statusStart) fail(code);
  const statusSource = source.slice(statusStart, statusEnd);
  for (const token of [
    "!['missing', 'enabled', 'disabled'].includes(status.admissionState)",
    "typeof status.authEpoch !== 'number'",
    '!Number.isInteger(status.authEpoch)',
    'status.authEpoch < 0',
    'status.authEpoch > Number(MAXIMUM_AUTH_EPOCH)',
    "status.admissionState === 'missing' && status.authEpoch !== 0",
    "status.admissionState !== 'missing' && status.authEpoch < 1",
    '(requestCycle === undefined) !== (requestedAtMicros === undefined)',
    "typeof requestCycle !== 'bigint'",
    'requestCycle < 0n',
    'requestCycle > MAXIMUM_U64',
    "typeof requestedAtMicros !== 'bigint'",
    'requestedAtMicros < 1n',
    'requestedAtMicros > MAXIMUM_U64',
    "!['not_requested', 'pending', 'resolved'].includes(status.requestState)",
    "const maximumCycle = status.admissionState === 'disabled'",
    'requestCycle !== undefined && requestCycle > maximumCycle',
    "const currentCycle = status.admissionState === 'missing'",
    'const expectedRequestState = requestCycle === undefined',
    'status.requestState !== expectedRequestState',
  ]) {
    if (!statusSource.includes(token)) fail(code);
  }
  requireOnce(
    statusSource,
    'status.requestState !== expectedRequestState',
    code,
  );

  const rawDigestStart = source.indexOf('function rawDigest(output, statuses = []) {');
  const rawDigestEnd = source.indexOf('\nfunction exactNonce(randomBytes) {', rawDigestStart);
  if (rawDigestStart < 0 || rawDigestEnd <= rawDigestStart) fail(code);
  requireOnce(
    source.slice(rawDigestStart, rawDigestEnd),
    [
      '.update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)',
      '    .update(output);',
    ].join('\n'),
    code,
  );

  requireOnce(source, 'for (const fid of enumeration.fids) {', code);
  const fallbackLoopStart = source.indexOf('for (const fid of enumeration.fids) {');
  const fallbackLoopEnd = source.indexOf(
    "    collectionMethod = 'fallback-player-v2-status-v1';",
    fallbackLoopStart,
  );
  if (fallbackLoopStart < 0 || fallbackLoopEnd <= fallbackLoopStart) fail(code);
  const fallbackLoop = source.slice(fallbackLoopStart, fallbackLoopEnd);
  requireOnce(
    fallbackLoop,
    [
      'await input.readAdmissionStatus(',
      '        GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,',
      '        fid,',
      '      )',
    ].join('\n'),
    code,
  );
  requireOnce(
    fallbackLoop,
    'statuses.push(canonicalFallbackStatus(status));',
    code,
  );
  requireOnce(
    fallbackLoop,
    'fallbackEntries.push({ fid, authEpoch: String(status.authEpoch) });',
    code,
  );
  if (source.split('await input.readAdmissionStatus(').length !== 2) fail(code);

  const beforeAggregate = source.indexOf(
    'const beforeAggregate = exactAggregate(await input.readAggregates());',
  );
  const preferredQuery = source.indexOf(
    'await input.queryPreferred(GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL)',
  );
  const afterAggregate = source.indexOf(
    'const afterAggregate = exactAggregate(await input.readAggregates());',
  );
  if (
    beforeAggregate < 0
    || preferredQuery <= beforeAggregate
    || afterAggregate <= preferredQuery
  ) fail(code);
  requireOnce(
    source,
    [
      'return Object.freeze({',
      '    profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,',
      '    opaqueProofDigest: second.opaqueProofDigest,',
      '  });',
    ].join('\n'),
    code,
  );

  for (const token of [
    "'warpkeep-genesis-001-admitted-player-census-private-proof-v1'",
    "'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1'",
    "'warpkeep.genesis-001.admitted-player-census.normalized-set.v1\\n'",
    "'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\\n'",
    "'warpkeep.genesis-001.admitted-player-census.private-proof.v1\\n'",
    "'SELECT fid, enabled, auth_epoch FROM allowed_fid'",
    "'SELECT fid FROM player_v2'",
    "'admin_get_access_request_admission_status_v1'",
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS: 4096;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES: 1048576;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS: 60000;',
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS: 300000;',
    'allowedFids: string;',
    'enabledAllowedFids: string;',
    "'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';",
    "outcome: 'exact-query-supported';",
    "outcome: 'unsupported-exact-query'",
    "collectionMethod: 'preferred-exact-query' | 'fallback-player-v2-status-v1';",
    "admissionState: 'missing' | 'enabled' | 'disabled';",
    "requestState: 'not_requested' | 'pending' | 'resolved';",
    'requestCycle: bigint | undefined;',
    'requestedAtMicros: bigint | undefined;',
    'sql: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL,',
    'sql: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,',
    'procedure: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,',
    'parseGenesis001AdmittedPlayerPreferredResult(',
    'collectGenesis001AdmittedPlayerCensus(input:',
    'verifyGenesis001AdmittedPlayerCensusReceipt(',
    'serializeGenesis001AdmittedPlayerCensusPrivateReceipt(',
    'randomBytes: (size: 32) => Uint8Array;',
    'projectGenesis001AdmittedPlayerCensusStablePair(',
  ]) {
    if (!declaration.includes(token)) fail(code);
  }
  if (
    declaration.split('opaqueProofDigest: string;').length !== 3
    || declaration.split('rawEvidenceDigest: string;').length !== 2
  ) fail(code);
  requireOnce(
    declaration,
    [
      '): Readonly<{',
      '  profile: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE;',
      '  opaqueProofDigest: string;',
      '}>;',
    ].join('\n'),
    code,
  );
  const publicDeclaration = declaration.slice(declaration.indexOf(
    'export function projectGenesis001AdmittedPlayerCensusStablePair(',
  ));
  if (
    publicDeclaration.length < 1
    || publicDeclaration.includes('fid:')
    || publicDeclaration.includes('authEpoch:')
    || publicDeclaration.includes('admittedPlayerCount:')
    || publicDeclaration.includes('rawEvidenceDigest:')
    || publicDeclaration.includes('normalizedSetDigest:')
    || publicDeclaration.includes('nonceHex:')
  ) fail(code);
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

/**
 * Task 6D deliberately pins only the narrow S/A authority producer here.  The
 * remaining dispatcher and lane sources remain outside the sealed verifier
 * until Task 7 can freeze their complete derived closure together.
 */
function verifySealedRealmsProductionSourceAuthority(sources) {
  const source = sources.sealedRealmsProductionSourceAuthoritySource;
  const declaration = sources.sealedRealmsProductionSourceAuthorityDeclaration;
  // The Task 6D authority producer is deliberately sealed as one reviewed
  // unit.  Token checks below still make the ABI self-documenting, but a
  // source digest prevents an early-return, duplicate declaration, or decoy
  // token from preserving those strings while bypassing the control flow.
  if (
    createHash('sha256').update(source, 'utf8').digest('hex')
      !== SEALED_REALMS_SOURCE_AUTHORITY_SOURCE_SHA256
    || createHash('sha256').update(declaration, 'utf8').digest('hex')
      !== SEALED_REALMS_SOURCE_AUTHORITY_DECLARATION_SHA256
  ) fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');
  const operations = [
    'preflight',
    'g001-policy-observe',
    'g001-census-first',
    'g001-census-second-inspect',
    'g001-census-second-suspend',
    'g001-current-state',
    'g002-publish-inspect',
    'g002-publish-apply',
    'g002-import-inspect',
    'g002-import-apply',
    'g002-live-inspect',
    'ptr-publish-inspect',
    'ptr-publish-apply',
    'ptr-import-inspect',
    'ptr-import-apply',
    'ptr-owner-provision-inspect',
    'ptr-owner-provision',
    'ptr-live-inspect',
    'activation-evidence-inspect',
    'activation-evidence-generate',
  ];
  const activated = [
    'preflight',
    'g001-current-state',
    'g002-live-inspect',
    'ptr-live-inspect',
  ];
  const parseAllowlist = (name) => {
    const match = source.match(new RegExp(
      `export const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`,
      'u',
    ));
    if (match === null) fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');
    return [...match[1].matchAll(/'([^']+)'/gu)].map(value => value[1]);
  };
  if (
    JSON.stringify(parseAllowlist('SEALED_REALMS_OPERATIONS')) !== JSON.stringify(operations)
    || JSON.stringify(parseAllowlist('SEALED_REALMS_ACTIVATED_OPERATIONS'))
      !== JSON.stringify(activated)
  ) fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');

  for (const token of [
    "'refs/remotes/origin/main^{commit}'",
    "['rev-parse', '--verify', 'HEAD^{commit}']",
    "'diff-tree', '--no-commit-id', '--raw', '--no-renames', '-r', '-z',",
    "bytes.toString('utf8').split('\\0')",
    "const authenticatedAuthorities = new WeakSet();",
    'const authenticatedSourceCommits = new WeakMap();',
    'const authenticatedPreparationSourceCommits = new WeakMap();',
    "JSON.stringify(Object.keys(value)) !== JSON.stringify(['verifiedSha'])",
    'value.verifiedSha !== commit',
    "binding.preparationSourceCommit !== commit",
    "binding.preparationSourceCommit !== preparationCommit",
    'authenticatePreparationParent(',
    'authenticatedAuthorities.has(authority)',
    "fail('SEALED_REALMS_SOURCE_AUTHORITY_OPAQUE_RESULT_REQUIRED')",
  ]) {
    if (!source.includes(token)) fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');
  }
  if (source.split('authenticatedAuthorities.has(authority)').length !== 3) {
    fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');
  }
  for (const token of [
    'declare const sealedRealmsSourceAuthority: unique symbol;',
    'readonly [sealedRealmsSourceAuthority]: true;',
    'preparationSourceCommitFromSealedRealmsProductionAuthority',
    'SEALED_REALMS_ACTIVATED_OPERATIONS: readonly [',
    "'activation-evidence-generate',",
  ]) {
    if (!declaration.includes(token)) fail('SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID');
  }
}

function verifyStaticSources(sources) {
  for (const key of Object.keys(SEALED_LAUNCH_SOURCE_PATHS)) {
    if (typeof sources[key] !== 'string') fail('SEALED_LAUNCH_SOURCE_SET_INVALID');
  }
  verifySealedRealmsProductionSourceAuthority(sources);
  verifyGenesis001Policy(sources);
  verifyGenesis001SealedLaunchAdoption(sources);
  verifyGenesis001CensusPrivacyBoundary(sources);
  verifyGenesis001AdmittedPlayerCensusBoundary(sources);
  verifyGenesis001AdmissionMonitorSuspension(sources);
  verifyGenesis001AdmissionMonitorCurrentState(sources);
  verifyGenesis001LegacyGreaterRealmProductionSeal(sources);
  verifyGenesis001PolicyObservationLaunchEnvelope(sources);
  verifyGenesis002Policy(sources);
  verifyPtrOwnerAuthority(sources);
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
    'g001AdmittedPlayerCensusReceiptDigest',
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
    || binding.g001AdmittedPlayerCensusReceiptProfile
      !== GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE
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

export function verifyGenesis001PreparationProjection({
  repositoryRoot = REPOSITORY_ROOT,
  candidatePreparationCommit,
  sources,
} = {}) {
  let root;
  let historicalProjection;
  let preparationProjection;
  let freezeIsAncestor;
  try {
    if (
      typeof repositoryRoot !== 'string'
      || resolve(repositoryRoot) !== repositoryRoot
      || !COMMIT.test(candidatePreparationCommit ?? '')
    ) fail('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');
    root = realpathSync(repositoryRoot);
    if (root !== repositoryRoot) {
      fail('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');
    }
    freezeIsAncestor = gitIsAncestor(
      root,
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
      candidatePreparationCommit,
    );
    historicalProjection = gitSourceProjection(
      root,
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
      GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
    );
    preparationProjection = gitSourceProjection(
      root,
      candidatePreparationCommit,
      GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
    );
  } catch (error) {
    if (error instanceof SealedLaunchVerificationError) {
      fail('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');
    }
    fail('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');
  }
  if (
    freezeIsAncestor !== true
    || !Buffer.isBuffer(historicalProjection)
    || historicalProjection.byteLength < 1
    || !Buffer.isBuffer(preparationProjection)
    || !historicalProjection.equals(preparationProjection)
  ) fail('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');

  const verifiedSources = sources ?? readSources(root);
  verifyGenesis001Policy(verifiedSources);
  verifyGenesis001LegacyGreaterRealmProductionSeal(verifiedSources);
  return Object.freeze({
    candidatePreparationCommit,
    genesis001FreezePublishSourceCommit:
      GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT,
    genesis001ProjectionSha256: createHash('sha256')
      .update(historicalProjection)
      .digest('hex'),
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
  return spawnSync('/usr/bin/git', [
    '--no-optional-locks',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    ...arguments_,
  ], {
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
  let trackedEntries;
  let trackedDifference;
  let untrackedEntries;
  let ignoredProtectedEntries;
  try {
    trackedEntries = splitNul(gitRaw(
      ['ls-files', '-v', '-z'],
      repositoryRoot,
    ));
    trackedDifference = gitRaw([
      'diff', '--raw', '--no-ext-diff', '--no-textconv', '--exit-code',
      '--ignore-submodules=none', 'HEAD', '--',
    ], repositoryRoot);
    untrackedEntries = gitRaw([
      'ls-files', '--others', '--exclude-standard', '-z',
    ], repositoryRoot);
    ignoredProtectedEntries = gitRaw([
      'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--',
      ...GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
    ], repositoryRoot);
  } catch {
    fail('SEALED_LAUNCH_CHECKOUT_INVALID');
  }
  if (
    head.status !== 0
    || head.stdout.trim() !== expectedCommit
    || trackedEntries.some(entry => entry[0] !== 72 || entry[1] !== 32)
    || trackedDifference.byteLength !== 0
    || untrackedEntries.byteLength !== 0
    || ignoredProtectedEntries.byteLength !== 0
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
    let candidateCheckoutCommit;
    if (
      phase === 'preparation'
      || phase === 'checked-in'
      || result.phase === 'activation'
    ) {
      candidateCheckoutCommit = currentCommit(REPOSITORY_ROOT);
      assertExactCheckout(REPOSITORY_ROOT, candidateCheckoutCommit);
    }
    if (phase === 'preparation' || phase === 'checked-in') {
      const candidatePreparationCommit = result.phase === 'activation'
        ? parseBinding(sources.bindingJson).preparationSourceCommit
        : candidateCheckoutCommit;
      verifyGenesis001PreparationProjection({
        repositoryRoot: REPOSITORY_ROOT,
        candidatePreparationCommit,
        sources,
      });
    }
    if (result.phase === 'activation') {
      const candidateActivationCommit = candidateCheckoutCommit;
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
