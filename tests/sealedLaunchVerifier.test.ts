// @vitest-environment node

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import * as sealedLaunchVerifierModule from
  '../scripts/verify-0.4.0-sealed-launch.mjs';

import {
  GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
  genesis001PolicyReceiptDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';

import {
  createSealedLaunchActivationBinding,
  classifySealedLaunchPagesDeployLane,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,
  GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
  SEALED_LAUNCH_SOURCE_PATHS,
  inspectSealedLaunchGitHistoryForTesting,
  verifySealedLaunchActivationHistory,
  classifySealedLaunchPagesSources,
  sealedLaunchReceiptCommitment,
  verifyGenesis001AdmittedPlayerCensusBoundary,
  verifySealedLaunchSources,
} from '../scripts/verify-0.4.0-sealed-launch.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

function fixtureGit(root: string, arguments_: string[]): string {
  return execFileSync('/usr/bin/git', [
    '-c', 'user.name=Warpkeep Test',
    '-c', 'user.email=warpkeep-test@example.invalid',
    ...arguments_,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
    },
  }).trim();
}

function checkedInSources() {
  return {
    packageJson: source('package.json'),
    packageLockJson: source('package-lock.json'),
    viteConfigSource: source('vite.config.ts'),
    buildInfoSource: source('src/build/buildInfo.ts'),
    bindingJson: source('config/releases/0.4.0-sealed-launch.json'),
    genesis001PolicySource: source('spacetimedb/src/genesis001AccessPolicy.ts'),
    genesis001PolicyReceiptSource:
      source('spacetimedb/src/reducers/genesis001AccessPolicy.ts'),
    genesis001SchemaSource: source('spacetimedb/src/schema.ts'),
    genesis001IndexSource: source('spacetimedb/src/index.ts'),
    genesis001FrozenMaterializerSource:
      source('scripts/genesis001-frozen-materializer.mjs'),
    genesis001FrozenPublisherCoreSource:
      source('scripts/genesis001-frozen-publisher-core.ts'),
    genesis001FrozenPublisherRuntimeSource:
      source('scripts/genesis001-frozen-publisher-runtime.ts'),
    genesis001FrozenPublisherCliSource:
      source('scripts/genesis001-frozen-publisher.ts'),
    genesis001CensusPrivacySafeReceiptSource:
      source('scripts/genesis001-census-privacy-safe-receipt.mjs'),
    genesis001AdmittedPlayerCensusSource:
      source('scripts/genesis001-admitted-player-census.mjs'),
    genesis001AdmittedPlayerCensusDeclaration:
      source('scripts/genesis001-admitted-player-census.d.mts'),
    genesis001AdmissionMonitorSuspensionSource:
      source('scripts/genesis001-admission-monitor-suspension.ts'),
    genesis001AdmissionMonitorCurrentStateSource:
      source('scripts/genesis001-admission-monitor-current-state.mjs'),
    genesis001AdmissionMonitorCurrentStateDeclaration:
      source('scripts/genesis001-admission-monitor-current-state.d.mts'),
    genesis001SealedLaunchAdoptionSource:
      source('scripts/genesis001-sealed-launch-adoption.mjs'),
    genesis001PolicyObservationReceiptSource:
      source('scripts/genesis001-policy-observation-receipt.mjs'),
    genesis001PolicyObservationLaunchEnvelopeSource:
      source('docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt'),
    genesis001LegacyGreaterRealmProductionSealSource:
      source('scripts/greater-realm-legacy-production-seal.mjs'),
    legacyGreaterRealmProductionBootstrapSource:
      source('scripts/greater-realm-production-bootstrap.mjs'),
    legacyGreaterRealmProductionPublisherCliSource:
      source('scripts/greater-realm-production-publisher.ts'),
    legacyGreaterRealmProductionImportOperatorSource:
      source('scripts/greater-realm-production-import-operator.ts'),
    legacyGreaterRealmProductionRelocationOperatorSource:
      source('scripts/greater-realm-production-relocation-operator.ts'),
    legacyGreaterRealmProductionLaunchEnvelopeSource:
      source('docs/operations/greater-realm-production-launch-envelope.sh.txt'),
    genesis002ContractSource: source('spacetimedb/genesis002/src/contract.ts'),
    genesis002AuthSource: source('spacetimedb/genesis002/src/auth.ts'),
    genesis002AdminPolicySource:
      source('spacetimedb/genesis002/src/adminPolicy.ts'),
    genesis002PolicySource: source('spacetimedb/genesis002/src/policy.ts'),
    genesis002PopulationSource: source('spacetimedb/genesis002/src/population.ts'),
    genesis002StatusSource: source('spacetimedb/genesis002/src/reducers.ts'),
    genesis002SchemaSource: source('spacetimedb/genesis002/src/schema.ts'),
    genesis002LifecycleSource: source('spacetimedb/genesis002/src/lifecycle.ts'),
    genesis002IndexSource: source('spacetimedb/genesis002/src/index.ts'),
    genesis002AtlasImportSource: source('spacetimedb/genesis002/src/atlasImportReducers.ts'),
    genesis002PackageJson: source('spacetimedb/genesis002/package.json'),
    genesis002TsconfigJson: source('spacetimedb/genesis002/tsconfig.json'),
    spacetimeWorkspacePackageJson: source('spacetimedb/package.json'),
    spacetimeWorkspaceLock: source('spacetimedb/pnpm-lock.yaml'),
    spacetimeWorkspaceDefinition: source('spacetimedb/pnpm-workspace.yaml'),
    genesis002PublisherCoreSource: source('scripts/genesis002-production-publisher.mjs'),
    genesis002PublisherCliSource:
      source('scripts/genesis002-production-publisher-cli.ts'),
    genesis002ImportCoreSource:
      source('scripts/genesis002-production-import-core.ts'),
    genesis002ImportOperatorSource:
      source('scripts/genesis002-production-import-operator.ts'),
    genesis002TransportSource:
      source('scripts/genesis002-production-transport.ts'),
    genesis002LiveReceiptSource: source('scripts/genesis002-sealed-live-receipt.mjs'),
    genesis002ActivationReceiptsSource:
      source('scripts/genesis002-activation-receipts.mjs'),
    genesis002PrivateLoopbackSource:
      source('scripts/genesis002-private-loopback-verifier.ts'),
    activationGeneratorSource:
      source('scripts/generate-0.4.0-sealed-launch-activation.mjs'),
    atlasContractSource: source('scripts/atlas/greater-realm-contracts.ts'),
    atlasRuntimeReleaseSource:
      source('scripts/atlas/greater-realm-runtime-release.ts'),
    atlasCliSource: source('scripts/atlas/greater-realm-cli.ts'),
    immutableArtifactSource:
      source('scripts/greater-realm-production-immutable-artifact.ts'),
    legacyAtlasPolicySource: source('spacetimedb/src/greaterRealmV17Policy.ts'),
    clientPresentationSource: source('src/spacetime/greaterRealmProviderBridge.ts'),
    serverPresentationSource: source('src/greater-realm/greaterRealmTransport.ts'),
    hermesSource: source('scripts/hermes-admin.ts'),
    productionPublisherSource: source('scripts/greater-realm-production-publisher-core.ts'),
    downstreamPolicySource: source('scripts/greater-realm-downstream-release-policy.ts'),
    realmReleaseIdentitySource: source('src/release/realmReleaseIdentity.ts'),
    ptrRealmConfigSource: source('src/ptr/ptrRealmConfig.ts'),
    admissionLaunchPolicySource: source('src/release/admissionLaunchPolicy.ts'),
    authBridgeSource: source('services/auth-bridge/src/app.ts'),
    authBridgeConfigSource: source('services/auth-bridge/src/config.ts'),
    authBridgeJwtSource: source('services/auth-bridge/src/jwt.ts'),
    authBridgeTypesSource: source('services/auth-bridge/src/types.ts'),
    ptrOwnerPolicySource: source('spacetimedb/ptr/src/ownerPolicy.ts'),
    ptrAuthSource: source('spacetimedb/ptr/src/auth.ts'),
    ptrAtlasImportReducersSource:
      source('spacetimedb/ptr/src/atlasImportReducers.ts'),
    ptrOwnerReducersSource: source('spacetimedb/ptr/src/ownerReducers.ts'),
    ptrPublisherCoreSource: source('scripts/ptr-production-publisher.mjs'),
    ptrPublisherCliSource: source('scripts/ptr-production-publisher-cli.ts'),
    ptrProductionAdminTokenSource:
      source('scripts/ptr-production-admin-token.ts'),
    ptrProductionTransportSource:
      source('scripts/ptr-production-transport.ts'),
    ptrProductionImportCoreSource:
      source('scripts/ptr-production-import-core.ts'),
    ptrProductionReleaseReceiptsSource:
      source('scripts/ptr-production-release-receipts.ts'),
    ptrProductionImportOperatorSource:
      source('scripts/ptr-production-import-operator.ts'),
    ptrProductionReceiptFileSource:
      source('scripts/ptr-production-receipt-file.ts'),
    ptrOwnerProvisionOperatorSource:
      source('scripts/ptr-owner-provision-operator.ts'),
    admissionRequestSuspensionProbeSource:
      source('scripts/verify-admission-request-suspension.mjs'),
    realmChoicePolicySource: source('src/components/menu/realmChoicePolicy.ts'),
    realmChoiceSelectorSource: source('src/components/menu/RealmChoiceSelector.tsx'),
    realmMenuSource: source('src/components/menu/WarpkeepMainMenu.tsx'),
    farcasterManifestSource: source('public/.well-known/farcaster.json'),
    farcasterContractSource: source('scripts/farcaster-miniapp-contract.mjs'),
    latestPatchNotesSource: source('src/components/menu/latestPatchNotes.ts'),
    sealedRealmsProductionSourceAuthoritySource:
      source('scripts/sealed-realms-production-source-authority.mjs'),
    sealedRealmsProductionSourceAuthorityDeclaration:
      source('scripts/sealed-realms-production-source-authority.d.mts'),
    verifyWorkflowSource: source('.github/workflows/verify.yml'),
    pagesWorkflowSource: source('.github/workflows/deploy-pages.yml'),
  };
}

function activationBinding() {
  const binding: Record<string, unknown> = {
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-sealed-launch-v1',
    pagesDeploymentApproved: true,
    preparationSourceCommit: '7'.repeat(40),
    g001DatabaseIdentity:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    g001SourceBaselineCommit:
      '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    g001BaselineAbiSha256:
      'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03',
    g001FreezeReleaseNonce:
      '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    g001FreezePublishReceiptDigest:
      GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
    g001FreezePublishReceiptCommitment: null,
    g001PolicyReceiptDigest: genesis001PolicyReceiptDigest({
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      playerAccessEnabled: true,
      admissionStateMutationsEnabled: false,
      accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit:
        '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce:
        '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    }),
    g001PolicyReceiptCommitment: null,
    g001PolicyObservationBootstrapReceiptDigest: 'a'.repeat(64),
    g001PolicyObservationBootstrapReceiptCommitment: null,
    g001PolicySourceCommit: '7'.repeat(40),
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001CensusPrivacySafeReceiptProfile:
      'warpkeep-genesis-001-census-export-privacy-safe-v1',
    g001CensusPrivacySafeReceiptDigest: '3'.repeat(64),
    g001CensusPrivacySafeReceiptCommitment: null,
    g001AdmittedPlayerCensusReceiptProfile:
      'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
    g001AdmittedPlayerCensusReceiptDigest: '2'.repeat(64),
    g001AdmittedPlayerCensusReceiptCommitment: null,
    admissionMonitorSuspensionReceiptDigest: '4'.repeat(64),
    admissionMonitorSuspensionReceiptCommitment: null,
    admissionMonitorCurrentStateReceiptDigest: '0'.repeat(64),
    admissionMonitorCurrentStateReceiptCommitment: null,
    admissionMonitorDisabled: true,
    admissionMonitorLoaded: false,
    authBridgeSourceCommit: '7'.repeat(40),
    admissionRequestSuspensionReceiptDigest: 'e'.repeat(64),
    admissionRequestSuspensionReceiptCommitment: null,
    g002PublishReceiptDigest: '5'.repeat(64),
    g002PublishReceiptCommitment: null,
    g002FreshStatusDigest: 'd'.repeat(64),
    g002FreshStatusCommitment: null,
    g002DatabaseIdentity: '6'.repeat(64),
    g002ModuleSourceCommit: '7'.repeat(40),
    g002ModuleSha256: '8'.repeat(64),
    g002ModuleTreeId: 'f'.repeat(40),
    g002DependencyClosureDigest: '0'.repeat(64),
    g002SpacetimeExecutableSha256: '1'.repeat(64),
    g002SpacetimeCliConfigSha256: '2'.repeat(64),
    g002AtlasImportReceiptDigest: '9'.repeat(64),
    g002AtlasImportReceiptCommitment: null,
    g002SealedLiveReceiptDigest: '3'.repeat(64),
    g002SealedLiveReceiptCommitment: null,
    g002AtlasSourceCommit: '7'.repeat(40),
    g002AtlasId: 'GENESIS_002_GREATER_REALM',
    g002PublicReleaseId: `GRR-${'A'.repeat(26)}`,
    g002ReleaseSha256: 'b'.repeat(64),
    g002ReleaseHeaderSha256: '4'.repeat(64),
    g002VerificationDigest: 'c'.repeat(64),
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
    ptrPublishReceiptDigest: 'a'.repeat(64),
    ptrPublishReceiptCommitment: null,
    ptrFreshStatusDigest: 'b'.repeat(64),
    ptrFreshStatusCommitment: null,
    ptrAtlasImportReceiptDigest: 'c'.repeat(64),
    ptrAtlasImportReceiptCommitment: null,
    ptrSealedLiveReceiptDigest: 'd'.repeat(64),
    ptrSealedLiveReceiptCommitment: null,
    ptrOwnerProvisionReceiptDigest: 'e'.repeat(64),
    ptrOwnerProvisionReceiptCommitment: null,
    ptrDatabaseIdentity: '9'.repeat(64),
    ptrModuleSourceCommit: '7'.repeat(40),
    ptrModuleSha256: 'f'.repeat(64),
    ptrModuleTreeId: 'b'.repeat(40),
    ptrDependencyClosureDigest: '0'.repeat(64),
    ptrSpacetimeExecutableSha256: '1'.repeat(64),
    ptrSpacetimeCliConfigSha256: '2'.repeat(64),
    ptrAtlasSourceCommit: '7'.repeat(40),
    ptrAtlasId: 'PTR_GREATER_REALM',
    ptrPublicReleaseId: `GRR-${'B'.repeat(26)}`,
    ptrReleaseVersion: '0.4.0-ptr.1',
    ptrReleaseManifestSha256: '3'.repeat(64),
    ptrExpectedReleaseSha256: '4'.repeat(64),
    ptrReleaseHeaderSha256: '5'.repeat(64),
    ptrVerificationDigest: '6'.repeat(64),
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
    g002PresentationEnabled: false,
    ptrPresentationEnabled: true,
    legacyGreaterRealmClientPresentationEnabled: false,
    legacyGreaterRealmServerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  };
  for (const commitmentKey of [
    'g001FreezePublishReceiptCommitment',
    'g001PolicyReceiptCommitment',
    'g001PolicyObservationBootstrapReceiptCommitment',
    'g001CensusPrivacySafeReceiptCommitment',
    'g001AdmittedPlayerCensusReceiptCommitment',
    'admissionMonitorSuspensionReceiptCommitment',
    'admissionMonitorCurrentStateReceiptCommitment',
    'admissionRequestSuspensionReceiptCommitment',
    'g002PublishReceiptCommitment',
    'g002FreshStatusCommitment',
    'g002AtlasImportReceiptCommitment',
    'g002SealedLiveReceiptCommitment',
    'ptrPublishReceiptCommitment',
    'ptrFreshStatusCommitment',
    'ptrAtlasImportReceiptCommitment',
    'ptrSealedLiveReceiptCommitment',
    'ptrOwnerProvisionReceiptCommitment',
  ]) {
    binding[commitmentKey] = sealedLaunchReceiptCommitment(
      commitmentKey,
      binding,
    );
  }
  expect(Object.keys(binding).filter(key => key.endsWith('Commitment')))
    .toHaveLength(17);
  return binding;
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validActivationHistoryChecks() {
  const entries = [
    {
      path: 'config/releases/0.4.0-sealed-launch.json',
      mode: '100644',
      type: 'blob',
    },
    { path: 'package-lock.json', mode: '100644', type: 'blob' },
    { path: 'package.json', mode: '100644', type: 'blob' },
  ];
  return {
    parentsOf: () => ['7'.repeat(40)],
    historicalPathChanges: () => false,
    sourceProjection: () => Buffer.from('same-g001-projection'),
    activationDelta: () => ({
      changedPaths: [
        'config/releases/0.4.0-sealed-launch.json',
        'package-lock.json',
        'package.json',
      ],
      preparationEntries: entries,
      activationEntries: entries,
    }),
  };
}

function activationSources() {
  const sources = checkedInSources();
  const packageJson = JSON.parse(sources.packageJson);
  packageJson.version = '0.4.0';
  const packageLock = JSON.parse(sources.packageLockJson);
  packageLock.version = '0.4.0';
  packageLock.packages[''].version = '0.4.0';
  return {
    ...sources,
    packageJson: canonical(packageJson),
    packageLockJson: canonical(packageLock),
    bindingJson: canonical(activationBinding()),
  };
}

function mutateGenesis002BridgeRoute(
  sourceText: string,
  before: string,
  after: string,
): string {
  const startToken =
    "        if (request.method === 'POST' && url.pathname === GENESIS_002_ADMIN_TOKEN_PATH) {";
  const endToken =
    "\n        if (request.method === 'POST' && url.pathname === PTR_ADMIN_TOKEN_PATH) {";
  const start = sourceText.indexOf(startToken);
  const end = sourceText.indexOf(endToken, start);
  if (start < 0 || end < 0) return sourceText;
  const route = sourceText.slice(start, end);
  const mutated = route.replace(before, after);
  if (mutated === route) return sourceText;
  return `${sourceText.slice(0, start)}${mutated}${sourceText.slice(end)}`;
}

describe('0.4.0 sealed-launch verifier', () => {
  it('verifies the Task 6C publication, ownerless import, and owner ancestry transition', () => {
    const verify = sealedLaunchVerifierModule.verifyPtrOwnerAuthoritySemantics;
    const checkedIn: Readonly<Record<string, string>> = checkedInSources();
    expect(() => verify(checkedIn)).not.toThrow();
    const mutations: readonly [string, (value: string) => string][] = [
      ['authBridgeSource', value => value.replace(
        "export const PTR_ATLAS_ADMIN_TOKEN_PATH = '/v1/admin/ptr-atlas-token'",
        "export const PTR_ATLAS_ADMIN_TOKEN_PATH = '/v1/admin/ptr-token'",
      )],
      ['ptrOwnerPolicySource', value => value.replace(
        'export function readFreshPtrAtlasAdminClaims(',
        'function readFreshPtrAtlasAdminClaims(',
      )],
      ['ptrAtlasImportReducersSource', value => value.replaceAll(
        'requirePtrAtlasAdmin', 'requirePtrAdmin',
      )],
      ['ptrProductionAdminTokenSource', value => value.replace(
        "const PTR_ATLAS_ADMIN_CLAIM_KEYS = Object.freeze([\n  'iss',",
        "const PTR_ATLAS_ADMIN_CLAIM_KEYS = Object.freeze([\n  'ptr_owner_fid',\n  'iss',",
      )],
      ['ptrOwnerPolicySource', value => value.replace(
        "const PTR_ATLAS_ADMIN_EXACT_CLAIM_KEYS = Object.freeze([\n  'iss',",
        "const PTR_ATLAS_ADMIN_EXACT_CLAIM_KEYS = Object.freeze([\n  'ptr_owner_auth_epoch',\n  'iss',",
      )],
      ['ptrProductionTransportSource', value => value.replace(
        'export function createPtrOwnerProvisionTransport(',
        'export function createPtrProductionTransport(',
      )],
      ['ptrProductionImportCoreSource', value => value.replace(
        "  'ownerEnabled',\n] as const);\nconst OPTIONAL_STRINGS",
        "  'ownerEnabled',\n  'ownerFid',\n] as const);\nconst OPTIONAL_STRINGS",
      )],
      ['ptrProductionImportCoreSource', value => value.replace(
        "  'activationMutationsCompiled',\n] as const);\n\nexport class PtrProductionImportError",
        "  'activationMutationsCompiled',\n  'ownerToken',\n] as const);\n\nexport class PtrProductionImportError",
      )],
      ['ptrProductionReleaseReceiptsSource', value => value.replace(
        "'atlasImportReceiptDigest',", '',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        'const secondEvidence = readImportReceipt({',
        'const secondEvidence = firstEvidence; /* bypass */ void ({',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        'tokenAuthority.ownerAuthEpoch !== resolved.ownerAuthEpoch',
        'false',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        '!== secondReceipt.importReceiptDigest',
        '!== firstReceipt.importReceiptDigest',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        "if (marker.lane !== 'g002')",
        'if (false)',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        "if (marker.lane !== 'ptr')",
        'if (false)',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        'if (bytes.byteLength > PUBLICATION_MARKER_MAXIMUM_BYTES)',
        'if (false)',
      )],
      ['genesis002PublisherCliSource', value => value.replaceAll(
        'fail(error.code, true, marker)',
        'fail(error.code, true)',
      )],
      ['ptrPublisherCliSource', value => value.replaceAll(
        'fail(error.code, true, possiblySubmittedMarker)',
        'fail(error.code, true)',
      )],
      ['ptrProductionReleaseReceiptsSource', value => value.replace(
        'ownerAuthority.ownerAuthEpoch !== input.ownerAuthEpoch',
        'false',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        'ownerAuthEpoch: resolved.ownerAuthEpoch,\n      databaseIdentity',
        'ownerAuthEpoch: 1,\n      databaseIdentity',
      )],
      ['ptrAtlasImportReducersSource', value => value.replace(
        'ctx.db.ptrOwnerAnchorV1.count() !== 0n',
        'false',
      )],
      ['ptrOwnerReducersSource', value => value.replace(
        '!atlas.ready || !atlas.importsExact',
        'false',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        'provision.ownerProvisionReceipt.databaseIdentity',
        'arguments_.databaseIdentity',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        'provision.sealedLiveReceipt.ownerOpaqueProofDigest\n        !== ownerOpaqueProofDigest',
        'false',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        'descriptors = Object.getOwnPropertyDescriptors(value);',
        'descriptors = Object.getOwnPropertyDescriptors({ ...value });',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        'descriptors = Object.getOwnPropertyDescriptors(value);',
        'descriptors = Object.getOwnPropertyDescriptors({ ...value });',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        'const marker = canonicalPublicationMarker(source.marker);',
        'const marker = canonicalPublicationMarker(input.marker);',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        'const marker = canonicalPublicationMarker(source.marker);',
        'const marker = canonicalPublicationMarker(input.marker);',
      )],
      ['ptrPublisherCliSource', value => value.replace(
        'ptrPublishReceiptEvidence: Object.freeze({',
        'ptrPublishReceiptFile, ptrPublishReceiptEvidence: Object.freeze({',
      )],
      ['ptrProductionImportOperatorSource', value => value.replace(
        'ptrAtlasImportReceiptEvidence: Object.freeze({',
        'ptrAtlasImportReceiptFile, ptrAtlasImportReceiptEvidence: Object.freeze({',
      )],
      ['ptrOwnerProvisionOperatorSource', value => value.replace(
        '!Object.hasOwn(patterns, match[1]!)',
        '!(match[1]! in patterns)',
      )],
      ['genesis002PublisherCliSource', value => value.replace(
        'descriptors = Object.getOwnPropertyDescriptors(value);',
        'descriptors = Object.getOwnPropertyDescriptors({ ...value });',
      )],
      ['ptrPublisherCliSource', value => value.replace(
        'descriptors = Object.getOwnPropertyDescriptors(value);',
        'descriptors = Object.getOwnPropertyDescriptors({ ...value });',
      )],
      ['genesis002PublisherCliSource', value => value.replace(
        ': canonicalizeSuppliedPublicationMarker(suppliedMarker);',
        ': suppliedMarker;',
      )],
      ['ptrPublisherCliSource', value => value.replace(
        ': canonicalizeSuppliedPublicationMarker(suppliedMarker);',
        ': suppliedMarker;',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        "function canonicalPublicationTimestamp(value) {\n  return typeof value === 'string'",
        'function canonicalPublicationTimestamp(value) {\n  return true',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        "function canonicalPublicationTimestamp(value) {\n  return typeof value === 'string'",
        'function canonicalPublicationTimestamp(value) {\n  return true',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        "typeof marker.attemptNonce !== 'string'",
        'false',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        "typeof marker.sourceCommit !== 'string'",
        'false',
      )],
      ['genesis002PublisherCoreSource', value => value.replace(
        "typeof source.publicationReceiptDigest !== 'string'",
        'false',
      )],
      ['ptrPublisherCoreSource', value => value.replace(
        "typeof source.observationDigest !== 'string'",
        'false',
      )],
      ['ptrPublisherCliSource', value => `${value}\nrequestPtrProductionAdminToken(secret);\n`],
    ];
    for (const [field, mutate] of mutations) {
      const hostile: Record<string, string> = { ...checkedIn };
      hostile[field] = mutate(hostile[field]!);
      expect(hostile[field]).not.toBe(checkedIn[field]);
      expect(() => verify(hostile), `${field} mutation must be rejected`)
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    }
  });

  it('accepts the exact disjoint G002 administrator authority sources', () => {
    expect(verifySealedLaunchSources(checkedInSources(), 'preparation')).toMatchObject({
      phase: 'preparation',
    });
  });

  it.each([
    (value: string) => value.replace(
      "'refs/remotes/origin/main^{commit}'",
      "'refs/heads/main^{commit}'",
    ),
    (value: string) => value.replace("'--no-renames'", "'--find-renames'"),
    (value: string) => value.replace(
      "bytes.toString('utf8').split('\\0')",
      "bytes.toString('utf8').split('\\n')",
    ),
    (value: string) => value.replace('value.verifiedSha !== commit', 'false'),
    (value: string) => value.replace(
      'binding.preparationSourceCommit !== commit',
      'false',
    ),
    (value: string) => value.replace('authenticatedAuthorities = new WeakSet()', 'authenticatedAuthorities = new Set()'),
    (value: string) => value.replace('authenticatedAuthorities.has(authority)', 'true'),
    (value: string) => value.replace("'ptr-live-inspect',\n]);", "'ptr-live-inspect',\n  'g002-import-apply',\n]);"),
  ])('rejects weakened Task 6D source authority proof', mutate => {
    const hostile = checkedInSources();
    hostile.sealedRealmsProductionSourceAuthoritySource = mutate(
      hostile.sealedRealmsProductionSourceAuthoritySource,
    );
    expect(() => verifySealedLaunchSources(hostile, 'preparation')).toThrow(
      'SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID',
    );
  });

  it.each([
    (value: string) => value.replace(
      'export function authenticateSealedRealmsProductionSourceAuthority(input) {',
      'export function authenticateSealedRealmsProductionSourceAuthority(input) {\n  return Object.freeze({});',
    ),
    (value: string) => `${value}\nfunction authenticatePreparationParent() { return undefined; }\n`,
    (value: string) => `${value}\n// authenticatedAuthorities.has(authority)\n`,
  ])('rejects decoy or early-return source-authority control flow', mutate => {
    const hostile = checkedInSources();
    hostile.sealedRealmsProductionSourceAuthoritySource = mutate(
      hostile.sealedRealmsProductionSourceAuthoritySource,
    );
    expect(() => verifySealedLaunchSources(hostile, 'preparation')).toThrow(
      'SEALED_LAUNCH_SOURCE_AUTHORITY_INVALID',
    );
  });

  it.each([
      {
        name: 'dedicated contract audience',
        field: 'genesis002ContractSource',
        mutate: (value: string) => value.replace(
          'warpkeep-genesis-002-spacetimedb',
          'warpkeep-spacetimedb',
        ),
      },
      {
        name: 'plain-record prototype',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          'Object.getPrototypeOf(payload) !== Object.prototype',
          'false',
        ),
      },
      {
        name: 'exact own-key set',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          'const keys = Reflect.ownKeys(record);',
          'const keys = Object.keys(record);',
        ),
      },
      {
        name: 'one-element audience and role arrays',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value
          .replace('audience.length !== 1', 'audience.length < 1')
          .replace('roles.length !== 1', 'roles.length < 1'),
      },
      {
        name: 'safe-integer NumericDates',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          '!Number.isSafeInteger(value)',
          'false',
        ),
      },
      {
        name: 'bounded JTI',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace('|| !JTI.test(jti)', '|| false'),
      },
      {
        name: 'one-second parser freshness skew',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          'const MAX_FUTURE_SKEW_MICROS = 1_000_000n',
          'const MAX_FUTURE_SKEW_MICROS = 60_000_000n',
        ),
      },
      {
        name: 'parser lifetime ceiling',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          'expiresAt - issuedAt > MAX_GENESIS_002_ADMIN_LIFETIME_SECONDS',
          'expiresAt - issuedAt > 3_000',
        ),
      },
      {
        name: 'fullPayload-only local auth mapping',
        field: 'genesis002AuthSource',
        mutate: (value: string) => value.replace('jwt.fullPayload', 'ctx.senderAuth'),
      },
      {
        name: 'lifecycle call site',
        field: 'genesis002LifecycleSource',
        mutate: (value: string) => value.replace(
          'requireGenesis002Admin(ctx);',
          'void ctx;',
        ),
      },
      {
        name: 'both atlas procedure call sites',
        field: 'genesis002AtlasImportSource',
        mutate: (value: string) => value.replace(
          'requireGenesis002Admin(tx);',
          'void tx;',
        ),
      },
      {
        name: 'all seven atlas reducer call sites',
        field: 'genesis002AtlasImportSource',
        mutate: (value: string) => value.replace(
          'const admin = requireGenesis002Admin(ctx);',
          "const admin = { jti: 'bypass' };",
        ),
      },
      {
        name: 'bridge POST-only route',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          "request.method === 'POST' && url.pathname === GENESIS_002_ADMIN_TOKEN_PATH",
          'url.pathname === GENESIS_002_ADMIN_TOKEN_PATH',
        ),
      },
      {
        name: 'bridge no-origin control',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          'requireAdminNoOrigin(request)',
          'void request.headers',
        ),
      },
      {
        name: 'bridge no-query control',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          "if (url.search || request.url.includes('?')) {",
          'if (false) {',
        ),
      },
      {
        name: 'bridge empty-body control',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          'await rejectAdminBody(request)',
          'void request.body',
        ),
      },
      {
        name: 'bridge rate limit',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          "await enforceRateLimit(request, 'admin-token', env, dependencies.rateLimiter, logger)",
          'void dependencies.rateLimiter',
        ),
      },
      {
        name: 'bridge timing-safe secret',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          '!(await timingSafeSecretMatch(credential, config.adminTokenSecret))',
          'credential !== config.adminTokenSecret',
        ),
      },
      {
        name: 'bridge signing control',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          'token = await (dependencies.signer ?? signEs256Jwt)(\n              config,\n              genesis002AdminClaims(config, issuedAt),\n            )',
          "token = 'unsigned'",
        ),
      },
      {
        name: 'bridge no-store response helper',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          "return json({ token, tokenType: 'spacetime-access', expiresIn: ADMIN_TOKEN_TTL_SECONDS })",
          "return Response.json({ token, tokenType: 'spacetime-access', expiresIn: ADMIN_TOKEN_TTL_SECONDS })",
        ),
      },
      {
        name: 'bridge five-minute response',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          'expiresIn: ADMIN_TOKEN_TTL_SECONDS',
          'expiresIn: 301',
        ),
      },
      {
        name: 'bridge typed safe logs',
        field: 'authBridgeSource',
        mutate: (value: string) => mutateGenesis002BridgeRoute(value,
          "logger.event('genesis002_admin_token_issued')",
          "logger.event('admin_token_issued')",
        ),
      },
      {
        name: 'bridge exact G002 claim factory',
        field: 'authBridgeJwtSource',
        mutate: (value: string) => value.replace(
          'GENESIS_002_OIDC_AUDIENCE,',
          'config.audience,',
        ),
      },
      {
        name: 'transport exact response contract',
        field: 'genesis002TransportSource',
        mutate: (value: string) => value.replace(
          "response.status !== 200",
          'response.status < 200',
        ),
      },
      {
        name: 'transport freshness',
        field: 'genesis002TransportSource',
        mutate: (value: string) => value.replace(
          'currentTimeMicros + MAX_FUTURE_SKEW_MICROS',
          'currentTimeMicros + 60_000_000n',
        ),
      },
      {
        name: 'transport abort control',
        field: 'genesis002TransportSource',
        mutate: (value: string) => value.replace(
          'setTimeout(() => controller.abort(), timeoutMilliseconds)',
          'setTimeout(() => undefined, timeoutMilliseconds)',
        ),
      },
      {
        name: 'transport response size bound',
        field: 'genesis002TransportSource',
        mutate: (value: string) => value.replace(
          'const MAX_TOKEN_RESPONSE_BYTES = 32 * 1_024',
          'const MAX_TOKEN_RESPONSE_BYTES = 32 * 1_024 * 1_024',
        ),
      },
      {
        name: 'transport dedicated route without fallback',
        field: 'genesis002TransportSource',
        mutate: (value: string) => value.replace(
          '/v1/admin/genesis-002-token',
          '/v1/admin/token',
        ),
      },
      {
        name: 'exact Hermes subject',
        field: 'genesis002AdminPolicySource',
        mutate: (value: string) => value.replace(
          "const GENESIS_002_ADMIN_SUBJECT = 'service:hermes'",
          "const GENESIS_002_ADMIN_SUBJECT = 'service:generic-admin'",
        ),
      },
      {
        name: 'absence of legacy root auth import',
        field: 'genesis002AuthSource',
        mutate: (value: string) => [
          "import { requireAdmin } from '../../src/auth';",
          value,
        ].join('\n'),
      },
      {
        name: 'dedicated bridge path',
        field: 'authBridgeSource',
        mutate: (value: string) => value.replace(
          '/v1/admin/genesis-002-token',
          '/v1/admin/token',
        ),
      },
    ] as const)(
      'rejects G002 authority weakening: $name',
      ({ field, mutate }) => {
        const hostile: Record<string, string> = checkedInSources();
        hostile[field] = mutate(hostile[field]!);
        expect(hostile[field], `${field} mutation must change the source`)
          .not.toBe(checkedInSources()[field]);
        expect(
          () => verifySealedLaunchSources(hostile, 'preparation'),
          field,
        ).toThrow('SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID');
      },
    );

  it.each([
    {
      name: 'dedicated bridge owner claim type',
      field: 'authBridgeTypesSource',
      mutate: (value: string) => value.replace(
        'ptr_owner_fid: string',
        'fid: string',
      ),
    },
    {
      name: 'plain-record PTR admin claims',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        'Object.getPrototypeOf(payload) !== Object.prototype',
        'false',
      ),
    },
    {
      name: 'exact PTR admin own-key set',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        'const keys = Reflect.ownKeys(record);',
        'const keys = Object.keys(record);',
      ),
    },
    {
      name: 'canonical nonzero owner FID',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        '!/^[1-9][0-9]*$/u.test(value)',
        'false',
      ),
    },
    {
      name: 'bounded integer owner auth epoch',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        'value > MAX_AUTH_EPOCH',
        'false',
      ),
    },
    {
      name: 'FID provisioning binding',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        'ownerFid !== admin.ownerFid',
        'false',
      ),
    },
    {
      name: 'auth-epoch provisioning binding',
      field: 'ptrOwnerPolicySource',
      mutate: (value: string) => value.replace(
        'authEpoch !== admin.ownerAuthEpoch',
        'false',
      ),
    },
    {
      name: 'pre-state reducer binding call',
      field: 'ptrOwnerReducersSource',
      mutate: (value: string) => value.replace(
        'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);',
        'void admin;',
      ),
    },
    {
      name: 'fresh owner-provision token request',
      field: 'ptrProductionTransportSource',
      mutate: (value: string) => value.replace(
        "provisionOwner: (expectedOwnerFid, assertCanStartWrite) => runSerialized(async () => {\n      invalidate();",
        "provisionOwner: (expectedOwnerFid, assertCanStartWrite) => runSerialized(async () => {\n      void expectedOwnerFid;",
      ),
    },
    {
      name: 'private claim-derived reducer arguments',
      field: 'ptrProductionTransportSource',
      mutate: (value: string) => value.replace(
        'authority = readPtrOwnerProvisionAuthority(',
        'authority = readPtrOwnerProvisionAuthorityUnsafe(',
      ),
    },
    {
      name: 'expected owner FID cross-check',
      field: 'ptrProductionTransportSource',
      mutate: (value: string) => value.replace(
        'readPtrOwnerProvisionAuthority(token, expectedOwnerFid, nowSeconds())',
        'readPtrOwnerProvisionAuthority(token, 1n, nowSeconds())',
      ),
    },
    {
      name: 'live epoch postcondition',
      field: 'ptrOwnerProvisionOperatorSource',
      mutate: (value: string) => value.replace(
        'tokenAuthority.ownerAuthEpoch !== resolved.ownerAuthEpoch',
        'false',
      ),
    },
    {
      name: 'private owner binding excluded from receipt',
      field: 'ptrProductionReleaseReceiptsSource',
      mutate: (value: string) => value.replace(
        'ownerAnchorRows: 1 as const,',
        'ownerAnchorRows: 1 as const, ownerAuthEpoch: ownerAuthority.ownerAuthEpoch,',
      ),
    },
  ] as const)(
    'rejects PTR owner authority weakening: $name',
    ({ field, mutate }) => {
      const hostile: Record<string, string> = checkedInSources();
      hostile[field] = mutate(hostile[field]!);
      expect(hostile[field], `${field} mutation must change the source`)
        .not.toBe(checkedInSources()[field]);
      expect(
        () => verifySealedLaunchSources(hostile, 'preparation'),
        field,
      ).toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it('semantically rejects PTR admin token-type drift independently of source pins', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const checkedIn = checkedInSources();
    expect(() => verifyPtrOwnerAuthoritySemantics(checkedIn)).not.toThrow();
    const hostile = { ...checkedIn };
    hostile.ptrProductionAdminTokenSource =
      hostile.ptrProductionAdminTokenSource.replace(
        "record.token_type !== 'spacetime-access'",
        "record.token_type !== 'admin'",
      );
    expect(hostile.ptrProductionAdminTokenSource)
      .not.toBe(checkedIn.ptrProductionAdminTokenSource);
    expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
      .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
  });

  it.each([
    {
      name: 'configured owner FID equality',
      field: 'ptrProductionAdminTokenSource',
      mutate: (value: string) => value.replace(
        'ownerFid !== expectedOwnerFid',
        'false',
      ),
    },
    {
      name: 'Hermes spacetime-access token type',
      field: 'authBridgeJwtSource',
      mutate: (value: string) => value.replace(
        "sub: 'service:hermes',\n    aud: [audience],\n    token_type: 'spacetime-access',",
        "sub: 'service:hermes',\n    aud: [audience],\n    token_type: 'admin',",
      ),
    },
  ] as const)(
    'keeps prior Task 4 PTR semantics reachable: $name',
    ({ field, mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      expect(() => verifyPtrOwnerAuthoritySemantics(checkedIn)).not.toThrow();
      const hostile = { ...checkedIn };
      hostile[field] = mutate(hostile[field]!);
      expect(hostile[field]).not.toBe(checkedIn[field]);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it('semantically rejects reintroducing generic owner provisioning independently of source pins', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const checkedIn = checkedInSources();
    expect(() => verifyPtrOwnerAuthoritySemantics(checkedIn)).not.toThrow();
    const hostile = { ...checkedIn };
    hostile.ptrProductionTransportSource =
      hostile.ptrProductionTransportSource.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  'admin_provision_ptr_owner_v1',\n] as const);",
      );
    expect(hostile.ptrProductionTransportSource)
      .not.toBe(checkedIn.ptrProductionTransportSource);
    expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
      .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
  });

  it.each([
    {
      name: 'double-quoted eighth owner reducer',
      mutate: (value: string) => value.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  \"admin_provision_ptr_owner_v1\",\n] as const);",
      ),
    },
    {
      name: 'computed template owner reducer',
      mutate: (value: string) => value.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  `admin_${'provision_ptr_owner_v1'}`,\n] as const);",
      ),
    },
    {
      name: 'concatenated owner reducer',
      mutate: (value: string) => value.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  ('admin_' + 'provision_ptr_owner_v1'),\n] as const);",
      ),
    },
    {
      name: 'spread owner reducer',
      mutate: (value: string) => value.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  ...(['admin_provision_ptr_owner_v1'] as const),\n] as const);",
      ),
    },
    {
      name: 'ignored unknown reducer element',
      mutate: (value: string) => value.replace(
        "  'admin_finalize_greater_realm_release_v1',\n] as const);",
        "  'admin_finalize_greater_realm_release_v1',\n  void 0,\n] as const);",
      ),
    },
  ] as const)(
    'structurally rejects $name independently of source pins',
    ({ mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      const hostile = { ...checkedIn };
      hostile.ptrProductionTransportSource = mutate(
        hostile.ptrProductionTransportSource,
      );
      expect(hostile.ptrProductionTransportSource)
        .not.toBe(checkedIn.ptrProductionTransportSource);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it.each([
    {
      name: 'local parser accepts both production and fabricated token types',
      field: 'ptrProductionAdminTokenSource',
      mutate: (value: string) => value.replace(
        "record.token_type !== 'spacetime-access'",
        "record.token_type !== 'spacetime-access'\n      && record.token_type !== 'admin'",
      ),
    },
    {
      name: 'PTR issuer overrides the inherited token type after the spread',
      field: 'authBridgeJwtSource',
      mutate: (value: string) => value.replace(
        '    ...hermesAdminClaims(config.issuer, ptr.audience, nowSeconds, ADMIN_TOKEN_TTL_SECONDS),\n    ptr_owner_fid: ownerFid,',
        "    ...hermesAdminClaims(config.issuer, ptr.audience, nowSeconds, ADMIN_TOKEN_TTL_SECONDS),\n    token_type: 'admin' as 'spacetime-access',\n    ptr_owner_fid: ownerFid,",
      ),
    },
  ] as const)(
    'structurally rejects token authority drift: $name',
    ({ field, mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      const hostile = { ...checkedIn };
      hostile[field] = mutate(hostile[field]!);
      expect(hostile[field]).not.toBe(checkedIn[field]);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it.each([
    {
      name: 'owner exception appended to the canonical includes guard',
      mutate: (value: string) => value.includes(
        'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
      )
        ? value.replace(
            'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
            "if (\n        !PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)\n        && (reducer as string) !== 'admin_provision_ptr_owner_v1'\n      ) {",
          )
        : value
            .replace(
              '      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer];',
              "      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer]\n        ?? ((reducer as string) === 'admin_provision_ptr_owner_v1'\n          ? 'adminProvisionPtr' + 'OwnerV1'\n          : undefined);",
            )
            .replace(
              "      if (typeof methodName !== 'string') {",
              "      if (\n        typeof methodName !== 'string'\n        && (reducer as string) !== 'admin_provision_ptr_owner_v1'\n      ) {",
            ),
    },
    {
      name: 'owner reducer appended to an alternate guard collection',
      mutate: (value: string) => value.includes(
        'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
      )
        ? value.replace(
            'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
            "if (![...PTR_PRODUCTION_ALLOWED_REDUCERS, 'admin_provision_ptr_owner_v1'].includes(reducer)) {",
          )
        : value
            .replace(
              '      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer];',
              "      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer]\n        ?? ((reducer as string) === 'admin_provision_ptr_owner_v1'\n          ? 'adminProvisionPtr' + 'OwnerV1'\n          : undefined);",
            )
            .replace(
              "      if (typeof methodName !== 'string') {",
              "      if (![...PTR_PRODUCTION_ALLOWED_REDUCERS, 'admin_provision_ptr_owner_v1'].includes(reducer)) {",
            ),
    },
    {
      name: 'template-hidden owner method access outside provisionOwner',
      mutate: (value: string) => value.replace(
        '        const active = await requireConnection();\n        const method = active.reducers[methodName];',
        '        const active = await requireConnection();\n        const hiddenOwnerMethod = `${typeof active.reducers.adminProvisionPtrOwnerV1}`;\n        void hiddenOwnerMethod;\n        const method = active.reducers[methodName];',
      ),
    },
    {
      name: 'widened gate plus concatenated dynamic owner-method fallback',
      mutate: (value: string) => value.includes(
        'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
      )
        ? value
            .replace(
              'if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {',
              "if (\n        !PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)\n        && (reducer as string) !== 'admin_provision_ptr_owner_v1'\n      ) {",
            )
            .replace(
              '        const methodName = reducer.replace(\n          /_([a-z0-9])/gu,\n          (_match, child: string) => child.toUpperCase(),\n        );',
              "        const methodName = reducer === 'admin_provision_ptr_owner_v1'\n          ? 'adminProvisionPtr' + 'OwnerV1'\n          : reducer.replace(\n            /_([a-z0-9])/gu,\n            (_match, child: string) => child.toUpperCase(),\n          );",
            )
        : value.replace(
            '      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer];',
            "      const methodName = PTR_PRODUCTION_ATLAS_REDUCER_METHODS[reducer]\n        ?? ((reducer as string) === 'admin_provision_ptr_owner_v1'\n          ? 'adminProvisionPtr' + 'OwnerV1'\n          : undefined);",
          ),
    },
  ] as const)(
    'rejects generic submit widening independently of source pins: $name',
    ({ mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      const hostile = { ...checkedIn };
      hostile.ptrProductionTransportSource = mutate(
        hostile.ptrProductionTransportSource,
      );
      expect(hostile.ptrProductionTransportSource)
        .not.toBe(checkedIn.ptrProductionTransportSource);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it.each([
    {
      name: 'exported alias helper before the transport factory',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        `export async function leakedOwner(
  active: DynamicConnection,
  ownerFid: bigint,
  authEpoch: number,
): Promise<void> {
  const reducers = active.reducers;
  const key = 'adminProvision' + 'PtrOwnerV1';
  await reducers[key]({ ownerFid, authEpoch });
}

/** A serialized ownerless atlas-import session with no owner mutation method. */`,
      ),
    },
    {
      name: 'exported reflective helper before the transport factory',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        `export async function leakedOwner(
  active: DynamicConnection,
  ownerFid: bigint,
  authEpoch: number,
): Promise<void> {
  const reducers = Reflect.get(active, 'reducers') as DynamicConnection['reducers'];
  await reducers['adminProvision' + 'PtrOwnerV1']({ ownerFid, authEpoch });
}

/** A serialized ownerless atlas-import session with no owner mutation method. */`,
      ),
    },
    {
      name: 'non-exported helper before the transport factory',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        `async function hiddenOwner(active: DynamicConnection): Promise<void> {
  const reducers = active.reducers;
  await reducers['adminProvision' + 'PtrOwnerV1']({});
}

/** A serialized ownerless atlas-import session with no owner mutation method. */`,
      ),
    },
    {
      name: 'extra import declaration',
      mutate: (value: string) =>
        `import type { Stats } from 'node:fs';\n${value}`,
    },
    {
      name: 'extra exported declaration',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        'export const TRANSPORT_EXTRA = 1;\n\n/** A serialized ownerless atlas-import session with no owner mutation method. */',
      ),
    },
    {
      name: 'extra private declaration',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        'const TRANSPORT_EXTRA = 1;\n\n/** A serialized ownerless atlas-import session with no owner mutation method. */',
      ),
    },
    {
      name: 'executable top-level statement',
      mutate: (value: string) => value.replace(
        '/** A serialized ownerless atlas-import session with no owner mutation method. */',
        'void PTR_PRODUCTION_TRANSPORT_TARGET;\n\n/** A serialized ownerless atlas-import session with no owner mutation method. */',
      ),
    },
  ] as const)(
    'rejects complete-module authority escape: $name',
    ({ mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      expect(() => verifyPtrOwnerAuthoritySemantics(checkedIn)).not.toThrow();
      const hostile = { ...checkedIn };
      hostile.ptrProductionTransportSource = mutate(
        hostile.ptrProductionTransportSource,
      );
      expect(hostile.ptrProductionTransportSource)
        .not.toBe(checkedIn.ptrProductionTransportSource);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it('accepts harmless comments before the transport factory', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const checkedIn = checkedInSources();
    expect(() => verifyPtrOwnerAuthoritySemantics(checkedIn)).not.toThrow();
    const commented = { ...checkedIn };
    commented.ptrProductionTransportSource =
      commented.ptrProductionTransportSource.replace(
        'const SHA256 = /^[0-9a-f]{64}$/u;',
        '/* harmless complete-module control */\nconst SHA256 = /^[0-9a-f]{64}$/u;',
      );
    expect(commented.ptrProductionTransportSource)
      .not.toBe(checkedIn.ptrProductionTransportSource);
    expect(() => verifyPtrOwnerAuthoritySemantics(commented)).not.toThrow();
  });

  it.each([
    {
      name: 'line',
      comment: '// export function createPtrProductionTransport(\n',
    },
    {
      name: 'block',
      comment: '/* export function createPtrProductionTransport( */\n',
    },
  ] as const)(
    'accepts a harmless $name comment containing the factory marker',
    ({ comment }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      const commented = { ...checkedIn };
      commented.ptrProductionTransportSource =
        commented.ptrProductionTransportSource.replace(
          '/** A serialized ownerless atlas-import session with no owner mutation method. */',
          `${comment}/** A serialized ownerless atlas-import session with no owner mutation method. */`,
        );
      expect(commented.ptrProductionTransportSource)
        .not.toBe(checkedIn.ptrProductionTransportSource);
      expect(() => verifyPtrOwnerAuthoritySemantics(commented)).not.toThrow();
    },
  );

  it('rejects a real duplicate transport factory declaration', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const checkedIn = checkedInSources();
    const hostile = { ...checkedIn };
    hostile.ptrProductionTransportSource =
      hostile.ptrProductionTransportSource.replace(
        'export function createPtrAtlasImportTransport(',
        `export function createPtrAtlasImportTransport(): never {
  throw new Error('duplicate transport factory');
}

export function createPtrAtlasImportTransport(`,
      );
    expect(hostile.ptrProductionTransportSource)
      .not.toBe(checkedIn.ptrProductionTransportSource);
    expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
      .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
  });

  it.each([
    {
      name: 'extra split-literal owner member before submit',
      mutate: (value: string) => value.replace(
        '    submit: (reducer, arguments_, assertCanStartWrite)',
        "    extra: async (ownerFid: bigint, authEpoch: number) => {\n      const active = await requireConnection();\n      const method = active.reducers['adminProvision' + 'PtrOwnerV1'];\n      await method({ ownerFid, authEpoch });\n    },\n    submit: (reducer, arguments_, assertCanStartWrite)",
      ),
    },
    {
      name: 'split-literal owner call inside prepareSubmission',
      mutate: (value: string) => value.replace(
        '        void await requireConnection();',
        "        const active = await requireConnection();\n        const method = active.reducers['adminProvision' + 'PtrOwnerV1'];\n        await method({});",
      ),
    },
    {
      name: 'unmatched closing delimiter outside submit and provisionOwner',
      mutate: (value: string) => value.replace(
        '        void await requireConnection();',
        '        void await requireConnection());',
      ),
    },
    {
      name: 'aliased reducers access in an extra member',
      mutate: (value: string) => value.replace(
        '    submit: (reducer, arguments_, assertCanStartWrite)',
        "    alias: async () => {\n      const active = await requireConnection();\n      const reducers = active.reducers;\n      const key = 'adminProvision' + 'PtrOwnerV1';\n      await reducers[key]({});\n    },\n    submit: (reducer, arguments_, assertCanStartWrite)",
      ),
    },
    {
      name: 'Reflect-computed reducers access inside prepareSubmission',
      mutate: (value: string) => value.replace(
        '        void await requireConnection();',
        "        const active = await requireConnection();\n        const reducers = Reflect.get(active, 'reducers') as DynamicConnection['reducers'];\n        const method = reducers['adminProvision' + 'PtrOwnerV1'];\n        await method({});",
      ),
    },
  ] as const)(
    'rejects transport-object authority outside its complete grammar: $name',
    ({ mutate }) => {
      const verifyPtrOwnerAuthoritySemantics = (
        sealedLaunchVerifierModule as unknown as {
          verifyPtrOwnerAuthoritySemantics?: (
            sources: Record<string, string>,
          ) => void;
        }
      ).verifyPtrOwnerAuthoritySemantics;
      expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
      if (verifyPtrOwnerAuthoritySemantics === undefined) return;
      const checkedIn = checkedInSources();
      const hostile = { ...checkedIn };
      hostile.ptrProductionTransportSource = mutate(
        hostile.ptrProductionTransportSource,
      );
      expect(hostile.ptrProductionTransportSource)
        .not.toBe(checkedIn.ptrProductionTransportSource);
      expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
        .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
    },
  );

  it('accepts harmless comments in the complete transport grammar', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const checkedIn = checkedInSources();
    const commented = { ...checkedIn };
    commented.ptrProductionTransportSource =
      commented.ptrProductionTransportSource.replace(
        '  return Object.freeze({',
        '  return /* harmless complete-object control */ Object.freeze({',
      );
    expect(commented.ptrProductionTransportSource)
      .not.toBe(checkedIn.ptrProductionTransportSource);
    expect(() => verifyPtrOwnerAuthoritySemantics(commented)).not.toThrow();
  });

  it('rejects an unterminated comment in the critical transport source', () => {
    const verifyPtrOwnerAuthoritySemantics = (
      sealedLaunchVerifierModule as unknown as {
        verifyPtrOwnerAuthoritySemantics?: (
          sources: Record<string, string>,
        ) => void;
      }
    ).verifyPtrOwnerAuthoritySemantics;
    expect(typeof verifyPtrOwnerAuthoritySemantics).toBe('function');
    if (verifyPtrOwnerAuthoritySemantics === undefined) return;
    const hostile = { ...checkedInSources() };
    hostile.ptrProductionTransportSource += '\n/* unterminated';
    expect(() => verifyPtrOwnerAuthoritySemantics(hostile))
      .toThrow('SEALED_LAUNCH_PTR_OWNER_AUTHORITY_INVALID');
  });

  it('rejects a raw owner identity outside the private PTR access token', () => {
    const hostile: Record<string, string> = checkedInSources();
    hostile.authBridgeSource = hostile.authBridgeSource.replace(
      "    databaseIdentity: ptr.database,",
      "    identity: browserIdentity({ fid }),\n    databaseIdentity: ptr.database,",
    );
    expect(hostile.authBridgeSource).not.toBe(
      checkedInSources().authBridgeSource,
    );
    expect(() => verifySealedLaunchSources(hostile, 'preparation'))
      .toThrow('SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID');
  });

  it.each([
    {
      name: 'configured-FID live resolver',
      field: 'authBridgeSource',
      mutate: (value: string) => value.replace(
        'resolver.resolve(expectedOwnerFid)',
        "resolver.resolve('1')",
      ),
    },
    {
      name: 'signed private owner FID',
      field: 'authBridgeJwtSource',
      mutate: (value: string) => value.replace(
        'ptr_owner_fid: ownerFid',
        "ptr_owner_fid: '1'",
      ),
    },
    {
      name: 'signed private owner auth epoch',
      field: 'authBridgeJwtSource',
      mutate: (value: string) => value.replace(
        'ptr_owner_auth_epoch: ownerAuthEpoch',
        'ptr_owner_auth_epoch: 1',
      ),
    },
  ] as const)(
    'rejects pinned bridge PTR owner weakening: $name',
    ({ field, mutate }) => {
      const hostile: Record<string, string> = checkedInSources();
      hostile[field] = mutate(hostile[field]!);
      expect(hostile[field], `${field} mutation must change the source`)
        .not.toBe(checkedInSources()[field]);
      expect(
        () => verifySealedLaunchSources(hostile, 'preparation'),
        field,
      ).toThrow('SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID');
    },
  );

  it('pins G001 authority independently of the mutable adoption module', () => {
    const verifierSource = source('scripts/verify-0.4.0-sealed-launch.mjs');
    expect(verifierSource).not.toContain(
      "from './genesis001-sealed-launch-adoption.mjs'",
    );
    expect(verifierSource).toContain(
      GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
    );
    expect(verifierSource).toContain(
      'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60',
    );
  });

  it('rejects a policy-observation envelope that is not the exact frozen-envelope derivation', () => {
    const sources: Record<string, string> = activationSources();
    sources.genesis001PolicyObservationLaunchEnvelopeSource =
      '# untrusted policy-observation envelope\n';

    expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow(
      'SEALED_LAUNCH_G001_POLICY_OBSERVATION_ENVELOPE_INVALID',
    );
  });

  it('rejects a decoy cleanup call and forged bootstrap finalization', () => {
    const sources: Record<string, string> = activationSources();
    const original =
      'const launchCleanup = await input.cleanupCompletedRun(completedLaunchRecord);';
    expect(sources.legacyGreaterRealmProductionBootstrapSource.split(original))
      .toHaveLength(2);
    sources.legacyGreaterRealmProductionBootstrapSource =
      sources.legacyGreaterRealmProductionBootstrapSource.replace(
        original,
        [
          "const launchCleanup = Object.freeze({ outcome: 'cleaned' });",
          '  void (false && await input.cleanupCompletedRun(completedLaunchRecord));',
        ].join('\n'),
      );
    expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow(
      'SEALED_LAUNCH_G001_POLICY_OBSERVATION_BOOTSTRAP_INVALID',
    );
  });

  it('rejects a forged cleanup callee outside the finalization slice', () => {
    const sources: Record<string, string> = activationSources();
    const original =
      'async function cleanupCompletedBootstrapRun(input, completedLaunchRecord) {';
    expect(sources.legacyGreaterRealmProductionBootstrapSource.split(original))
      .toHaveLength(2);
    sources.legacyGreaterRealmProductionBootstrapSource =
      sources.legacyGreaterRealmProductionBootstrapSource.replace(
        original,
        [
          original,
          "  return Object.freeze({ outcome: 'cleaned' });",
        ].join('\n'),
      );
    expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow(
      'SEALED_LAUNCH_G001_POLICY_OBSERVATION_BOOTSTRAP_INVALID',
    );
  });

  it('rejects unreachable synthetic returns in every post-freeze evidence source', () => {
    const cases = [
      {
        field: 'genesis001PolicyObservationReceiptSource',
        prefix: 'export async function executeGenesis001PolicyObservation(input) {',
        statement: '  return Object.freeze({ mutationSubmitted: false });',
      },
      {
        field: 'genesis001AdmissionMonitorCurrentStateSource',
        prefix: 'function inspectLiveMonitor() {',
        statement: '  return Object.freeze({ disabled: true, loaded: false });',
      },
      {
        field: 'genesis001SealedLaunchAdoptionSource',
        prefix: [
          'function deriveGenesis001SealedLaunchEvidenceWithAuthority(',
          '  value,',
          '  authority,',
          '  verificationTime,',
          ') {',
        ].join('\n'),
        statement: '  return Object.freeze({ admissionMonitorDisabled: true });',
      },
      {
        field: 'activationGeneratorSource',
        prefix: [
          'export function createSealedLaunchActivationBindingFromEvidence(',
          '  envelope,',
          '  testOnlyPreparationBootstrapAuthority,',
          ') {',
        ].join('\n'),
        statement: '  return Object.freeze({ pagesDeploymentApproved: true });',
      },
    ] as const;
    for (const { field, prefix, statement } of cases) {
      const sources: Record<string, string> = activationSources();
      expect(sources[field]!.split(prefix), field).toHaveLength(2);
      sources[field] = sources[field]!.replace(
        prefix,
        `${prefix}\n${statement}`,
      );
      expect(
        () => verifySealedLaunchSources(sources, 'activation'),
        field,
      ).toThrow();
    }
  });

  it('accepts only inert 0.3.43 preparation and blocks Pages', () => {
    const preparationBinding = JSON.parse(checkedInSources().bindingJson) as
      Record<string, unknown>;
    expect(Object.entries(preparationBinding)
      .filter(([key]) => key.startsWith('ptr') && key !== 'ptrPresentationEnabled')
      .every(([, value]) => value === null)).toBe(true);
    expect(preparationBinding.ptrPresentationEnabled).toBe(false);
    expect(verifySealedLaunchSources(checkedInSources(), 'preparation')).toMatchObject({
      phase: 'preparation',
      packageVersion: '0.3.43',
      pagesDeploymentApproved: false,
    });
    expect(classifySealedLaunchPagesSources(checkedInSources())).toBe(
      'sealed-launch-blocked',
    );

    const failOpenSources = checkedInSources();
    const failOpenBinding = JSON.parse(failOpenSources.bindingJson) as Record<string, unknown>;
    failOpenBinding.ptrPresentationEnabled = true;
    failOpenSources.bindingJson = canonical(failOpenBinding);
    expect(
      () => verifySealedLaunchSources(failOpenSources, 'preparation'),
    ).toThrow('SEALED_LAUNCH_PREPARATION_BINDING_INVALID');
  });

  it('accepts exact 0.4.0 activation receipts with an isolated owner-only PTR', () => {
    expect(verifySealedLaunchSources(activationSources(), 'activation')).toMatchObject({
      phase: 'activation',
      packageVersion: '0.4.0',
      pagesDeploymentApproved: true,
      g002DatabaseIdentity: '6'.repeat(64),
      ptrDatabaseIdentity: '9'.repeat(64),
      ptrPresentationEnabled: true,
    });
    expect(classifySealedLaunchPagesSources(activationSources())).toBe(
      'sealed-g002',
    );
  });

  it('requires the Pages PTR environment to equal the activated binding exactly', () => {
    const verifyPagesEnvironment = (
      sealedLaunchVerifierModule as unknown as {
        verifySealedLaunchPagesBuildEnvironment?: (input: Readonly<{
          bindingSource: string;
          environment: Readonly<Record<string, string | undefined>>;
        }>) => Readonly<Record<string, unknown>>;
      }
    ).verifySealedLaunchPagesBuildEnvironment;
    expect(typeof verifyPagesEnvironment).toBe('function');
    if (verifyPagesEnvironment === undefined) return;

    const validEnvironment = {
      VITE_WARPKEEP_PTR_ENABLED: 'true',
      VITE_PTR_SPACETIMEDB_DATABASE: '9'.repeat(64),
    };
    expect(verifyPagesEnvironment({
      bindingSource: canonical(activationBinding()),
      environment: validEnvironment,
    })).toEqual({
      ptrEnabled: true,
      ptrDatabaseIdentity: '9'.repeat(64),
    });

    const hostileEnvironments = [
      {},
      { ...validEnvironment, VITE_WARPKEEP_PTR_ENABLED: 'false' },
      { ...validEnvironment, VITE_WARPKEEP_PTR_ENABLED: 'TRUE' },
      { VITE_WARPKEEP_PTR_ENABLED: 'true' },
      {
        ...validEnvironment,
        VITE_PTR_SPACETIMEDB_DATABASE: 'A'.repeat(64),
      },
      { ...validEnvironment, VITE_PTR_SPACETIMEDB_DATABASE: 'warpkeep-ptr' },
      {
        ...validEnvironment,
        VITE_PTR_SPACETIMEDB_DATABASE:
          'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      },
      { ...validEnvironment, VITE_PTR_SPACETIMEDB_DATABASE: '6'.repeat(64) },
      {
        ...validEnvironment,
        VITE_PTR_SPACETIMEDB_URI: 'https://alternate.invalid',
      },
      {
        ...validEnvironment,
        VITE_WARPKEEP_PTR_SPACETIMEDB_DATABASE: '9'.repeat(64),
      },
      { ...validEnvironment, VITE_PTR_SPACETIMEDB_ALIAS: 'warpkeep-ptr' },
      {
        ...validEnvironment,
        VITE_WARPKEEP_PTR_SPACETIMEDB_URI:
          'https://maincloud.spacetimedb.com',
      },
    ];
    for (const environment of hostileEnvironments) {
      expect(
        () => verifyPagesEnvironment({
          bindingSource: canonical(activationBinding()),
          environment,
        }),
        JSON.stringify(environment),
      ).toThrow('SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID');
    }
  });

  it('generates every receipt commitment from one exact activation candidate', () => {
    const expected = activationBinding();
    const candidate = { ...expected };
    for (const key of Object.keys(candidate).filter(key => key.endsWith('Commitment'))) {
      candidate[key] = null;
    }
    const generated = createSealedLaunchActivationBinding(candidate);
    expect(generated).toEqual(expected);
    expect(Object.keys(generated)).toEqual(Object.keys(expected));

    expect(() => createSealedLaunchActivationBinding({
      ...candidate,
      applicantNames: ['must-never-enter-source-control'],
    })).toThrow();
    expect(() => createSealedLaunchActivationBinding({
      ...candidate,
      g002PublishReceiptCommitment: 'f'.repeat(64),
    })).toThrow();
    expect(() => createSealedLaunchActivationBinding({
      ...candidate,
      g002AdmissionMutationsEnabled: true,
    })).toThrow();
    for (const key of [
      'g002PresentationEnabled',
      'legacyGreaterRealmClientPresentationEnabled',
      'legacyGreaterRealmServerPresentationEnabled',
      'admissionNotificationsEnabled',
    ]) {
      expect(
        () => createSealedLaunchActivationBinding({ ...candidate, [key]: true }),
        key,
      ).toThrow();
    }
  });

  it('requires the public build stamp and selected patch notes to be 0.4.0 at activation', () => {
    const preparationIdentity = checkedInSources();
    preparationIdentity.bindingJson = canonical(activationBinding());
    expect(() => verifySealedLaunchSources(
      preparationIdentity,
      'activation',
    )).toThrow();

    const splitIdentity = activationSources();
    splitIdentity.packageLockJson = checkedInSources().packageLockJson;
    expect(() => verifySealedLaunchSources(splitIdentity, 'activation')).toThrow();

    const activation = verifySealedLaunchSources(
      activationSources(),
      'activation',
    );
    expect(activation).toMatchObject({
      packageVersion: '0.4.0',
      g001ReleaseVersion: '0.3.43',
    });
  });

  it('rejects activation successors that alter package behavior alongside the version bump', () => {
    const hostile = activationSources();
    const packageJson = JSON.parse(hostile.packageJson);
    packageJson.scripts.build = 'node -e "process.stdout.write(\'unreviewed build\')"';
    hostile.packageJson = `${JSON.stringify(packageJson, null, 2)}\n`;

    expect(() => verifySealedLaunchSources(hostile, 'activation')).toThrow(
      'SEALED_LAUNCH_RELEASE_IDENTITY_INVALID',
    );
  });

  it('binds the frozen G001 source and exact G002 preparation ancestry', () => {
    const binding = canonical(activationBinding());
    const isAncestor = vi.fn((ancestor: string, descendant: string) => (
      ancestor === '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
        && [
          'd945256b217fa13ade944b9ed9880e8463b46123',
          'f'.repeat(40),
        ].includes(descendant)
    ) || (
      ancestor === '7'.repeat(40)
        && descendant === 'f'.repeat(40)
    ) || (
      ancestor === 'd945256b217fa13ade944b9ed9880e8463b46123'
        && descendant === '7'.repeat(40)
    ));
    expect(verifySealedLaunchActivationHistory({
      bindingSource: binding,
      candidateActivationCommit: 'f'.repeat(40),
      isAncestor,
      ...validActivationHistoryChecks(),
    })).toMatchObject({
      preparationSourceCommit: '7'.repeat(40),
      candidateActivationCommit: 'f'.repeat(40),
    });
    expect(isAncestor).toHaveBeenCalledWith(
      '7'.repeat(40),
      'f'.repeat(40),
    );
  });

  it('requires a one-parent three-file activation and an untouched exact G001 history projection', () => {
    expect(GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS).toEqual([
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
    expect(SEALED_LAUNCH_SOURCE_PATHS).toMatchObject({
      genesis001AdmittedPlayerCensusSource:
        'scripts/genesis001-admitted-player-census.mjs',
      genesis001AdmittedPlayerCensusDeclaration:
        'scripts/genesis001-admitted-player-census.d.mts',
    });
    expect(GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS).not.toContain(
      'scripts/genesis001-admitted-player-census.mjs',
    );
    expect(GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS).not.toContain(
      'scripts/genesis001-admitted-player-census.d.mts',
    );
    const valid = {
      bindingSource: canonical(activationBinding()),
      candidateActivationCommit: 'f'.repeat(40),
      isAncestor: () => true,
      ...validActivationHistoryChecks(),
    };
    const baselineDelta = validActivationHistoryChecks().activationDelta();
    const cases = [
      {
        isAncestor: (ancestor: string, descendant: string) => !(
          ancestor === '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
          && descendant === 'd945256b217fa13ade944b9ed9880e8463b46123'
        ),
      },
      { parentsOf: () => ['7'.repeat(40), '8'.repeat(40)] },
      { parentsOf: () => ['8'.repeat(40)] },
      { historicalPathChanges: () => true },
      {
        sourceProjection: (commit: string) => Buffer.from(
          commit === '7'.repeat(40) ? 'changed' : 'historical',
        ),
      },
      {
        activationDelta: () => ({
          ...baselineDelta,
          changedPaths: [...baselineDelta.changedPaths, 'src/extra.ts'],
        }),
      },
      {
        activationDelta: () => ({
          ...baselineDelta,
          changedPaths: [...baselineDelta.changedPaths, 'src/evil\nname.ts'],
        }),
      },
      {
        activationDelta: () => ({
          ...baselineDelta,
          activationEntries: [
            ...baselineDelta.activationEntries.slice(0, 2),
            { path: 'package.json', mode: '120000', type: 'blob' },
          ],
        }),
      },
      {
        activationDelta: () => ({
          ...baselineDelta,
          preparationEntries: [
            ...baselineDelta.preparationEntries.slice(0, 2),
            { path: 'package.json', mode: '160000', type: 'commit' },
          ],
        }),
      },
    ];
    for (const historyPatch of cases) {
      expect(() => verifySealedLaunchActivationHistory({
        ...valid,
        ...historyPatch,
      })).toThrow();
    }
    for (const protectedPath of GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS) {
      const historicalPathChanges = vi.fn((
        _ancestor: string,
        _descendant: string,
        paths: readonly string[],
      ) => paths.includes(protectedPath));
      expect(() => verifySealedLaunchActivationHistory({
        ...valid,
        historicalPathChanges,
      }), protectedPath).toThrow();
      expect(historicalPathChanges).toHaveBeenCalledWith(
        'd945256b217fa13ade944b9ed9880e8463b46123',
        '7'.repeat(40),
        GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS,
      );
    }
  });

  it('accepts only an endpoint-identical regular G001 preparation projection', () => {
    type PreparationProjectionInput = Readonly<{
      repositoryRoot: string;
      candidatePreparationCommit: string;
      sources: ReturnType<typeof checkedInSources>;
    }>;
    const verifyPreparationProjection = (
      sealedLaunchVerifierModule as unknown as {
        verifyGenesis001PreparationProjection?: (
          input: PreparationProjectionInput,
        ) => Readonly<Record<string, unknown>>;
      }
    ).verifyGenesis001PreparationProjection;
    expect(typeof verifyPreparationProjection).toBe('function');
    if (verifyPreparationProjection === undefined) return;

    const fixtureParent = mkdtempSync(resolve(tmpdir(), 'warpkeep-g001-preparation-'));
    const fixtureRoot = resolve(fixtureParent, 'repository');
    const freezeCommit = 'd945256b217fa13ade944b9ed9880e8463b46123';
    try {
      fixtureGit(fixtureParent, [
        'clone', '--quiet', '--shared', '--no-checkout', repositoryRoot, fixtureRoot,
      ]);
      fixtureGit(fixtureRoot, ['checkout', '--quiet', '--detach', freezeCommit]);
      fixtureGit(fixtureRoot, [
        'commit', '--quiet', '--allow-empty', '-m', 'unchanged preparation',
      ]);
      const unchangedPreparation = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      const unchangedProjection = {
        repositoryRoot: fixtureRoot,
        candidatePreparationCommit: unchangedPreparation,
        sources: checkedInSources(),
      };
      expect(verifyPreparationProjection(unchangedProjection)).toMatchObject({
        candidatePreparationCommit: unchangedPreparation,
        genesis001FreezePublishSourceCommit: freezeCommit,
      });

      for (const path of [
        'spacetimedb/genesis002/src/index.ts',
        'services/auth-bridge/src/index.ts',
      ]) {
        const absolute = resolve(fixtureRoot, path);
        writeFileSync(absolute, `${readFileSync(absolute, 'utf8')}\n// unrelated realm edit\n`);
      }
      writeFileSync(
        resolve(fixtureRoot, 'scripts/ptr-production-publisher-cli.ts'),
        '// unrelated PTR entrypoint\n',
      );
      fixtureGit(fixtureRoot, ['add', '.']);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'unrelated realms']);
      const validProjectionCommit = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      const validProjection = {
        ...unchangedProjection,
        candidatePreparationCommit: validProjectionCommit,
      };
      expect(() => verifyPreparationProjection(validProjection)).not.toThrow();

      const rootModule = resolve(fixtureRoot, 'spacetimedb/src/index.ts');
      writeFileSync(rootModule, `${readFileSync(rootModule, 'utf8')}\n// future G001 source\n`);
      fixtureGit(fixtureRoot, ['add', 'spacetimedb/src/index.ts']);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'edit root module']);
      const projectionWithRootModuleEdit = {
        ...validProjection,
        candidatePreparationCommit: fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']),
      };
      expect(() => verifyPreparationProjection(projectionWithRootModuleEdit)).toThrow(
        'SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID',
      );

      fixtureGit(fixtureRoot, [
        'checkout', validProjectionCommit, '--', 'spacetimedb/src/index.ts',
      ]);
      fixtureGit(fixtureRoot, ['add', 'spacetimedb/src/index.ts']);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'revert root module bytes']);
      expect(() => verifyPreparationProjection({
        ...validProjection,
        candidatePreparationCommit: fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']),
      })).not.toThrow();

      fixtureGit(fixtureRoot, ['checkout', '--quiet', '--detach', validProjectionCommit]);
      const publisher = resolve(
        fixtureRoot,
        'scripts/genesis001-frozen-publisher-core.ts',
      );
      writeFileSync(publisher, `${readFileSync(publisher, 'utf8')}\n// future publisher\n`);
      fixtureGit(fixtureRoot, ['add', 'scripts/genesis001-frozen-publisher-core.ts']);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'edit frozen publisher']);
      const projectionWithPublisherEdit = {
        ...validProjection,
        candidatePreparationCommit: fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']),
      };
      expect(() => verifyPreparationProjection(projectionWithPublisherEdit)).toThrow(
        'SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID',
      );

      fixtureGit(fixtureRoot, ['checkout', '--quiet', '--detach', validProjectionCommit]);
      chmodSync(publisher, 0o755);
      fixtureGit(fixtureRoot, ['add', 'scripts/genesis001-frozen-publisher-core.ts']);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'make publisher executable']);
      expect(() => verifyPreparationProjection({
        ...validProjection,
        candidatePreparationCommit: fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']),
      })).toThrow('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');

      const invalidFreezeSource = checkedInSources();
      invalidFreezeSource.genesis001FrozenPublisherCoreSource =
        invalidFreezeSource.genesis001FrozenPublisherCoreSource.replace(
          'publishGenesis001Frozen',
          'publishGenesis001Future',
        );
      expect(() => verifyPreparationProjection({
        ...validProjection,
        sources: invalidFreezeSource,
      })).toThrow('SEALED_LAUNCH_G001_FROZEN_PUBLISHER_INVALID');

      const invalidLegacyEntrypoint = checkedInSources();
      invalidLegacyEntrypoint.legacyGreaterRealmProductionPublisherCliSource =
        invalidLegacyEntrypoint.legacyGreaterRealmProductionPublisherCliSource.replace(
          'requireGenesis001LegacyGreaterRealmProductionCliReadOnly({',
          'openGenesis001LegacyGreaterRealmProductionMutation({',
        );
      expect(() => verifyPreparationProjection({
        ...validProjection,
        sources: invalidLegacyEntrypoint,
      })).toThrow('SEALED_LAUNCH_G001_LEGACY_GREATER_REALM_ENTRYPOINT_OPEN');
    } finally {
      rmSync(fixtureParent, { recursive: true, force: true });
    }
  });

  it('rejects protected worktree drift hidden by tracked index flags', () => {
    const fixtureParent = mkdtempSync(resolve(tmpdir(), 'warpkeep-checkout-flags-'));
    const fixtureRoot = resolve(fixtureParent, 'repository');
    try {
      fixtureGit(fixtureParent, [
        'clone', '--quiet', '--shared', repositoryRoot, fixtureRoot,
      ]);
      const head = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      const protectedPath = 'spacetimedb/src/worldSeedPolicy.ts';
      const protectedSource = resolve(fixtureRoot, protectedPath);
      const reviewedBytes = readFileSync(protectedSource);

      for (const [setFlag, clearFlag, expectedTag] of [
        ['--assume-unchanged', '--no-assume-unchanged', 'h'],
        ['--skip-worktree', '--no-skip-worktree', 'S'],
      ] as const) {
        fixtureGit(fixtureRoot, ['update-index', setFlag, '--', protectedPath]);
        writeFileSync(protectedSource, Buffer.concat([
          reviewedBytes,
          Buffer.from('// hidden future G001 worktree source\n'),
        ]));
        expect(fixtureGit(
          fixtureRoot,
          ['status', '--porcelain=v1', '--untracked-files=all'],
        ), setFlag).toBe('');
        expect(fixtureGit(fixtureRoot, ['ls-files', '-v', '--', protectedPath]))
          .toBe(`${expectedTag} ${protectedPath}`);
        expect(() => classifySealedLaunchPagesDeployLane({
          repositoryRoot: fixtureRoot,
          candidatePagesSourceCommit: head,
        }), setFlag).toThrow('SEALED_LAUNCH_CHECKOUT_INVALID');
        writeFileSync(protectedSource, reviewedBytes);
        fixtureGit(fixtureRoot, ['update-index', clearFlag, '--', protectedPath]);
      }

      writeFileSync(protectedSource, Buffer.concat([
        reviewedBytes,
        Buffer.from('// visible future G001 worktree source\n'),
      ]));
      expect(() => classifySealedLaunchPagesDeployLane({
        repositoryRoot: fixtureRoot,
        candidatePagesSourceCommit: head,
      })).toThrow('SEALED_LAUNCH_CHECKOUT_INVALID');
      writeFileSync(protectedSource, reviewedBytes);

      const untrackedPath = resolve(fixtureRoot, 'checkout-untracked.txt');
      writeFileSync(untrackedPath, 'untracked checkout drift\n');
      expect(() => classifySealedLaunchPagesDeployLane({
        repositoryRoot: fixtureRoot,
        candidatePagesSourceCommit: head,
      })).toThrow('SEALED_LAUNCH_CHECKOUT_INVALID');
      unlinkSync(untrackedPath);

      for (const candidatePagesSourceCommit of ['f'.repeat(40), 'HEAD']) {
        expect(() => classifySealedLaunchPagesDeployLane({
          repositoryRoot: fixtureRoot,
          candidatePagesSourceCommit,
        })).toThrow('SEALED_LAUNCH_CHECKOUT_INVALID');
      }
    } finally {
      rmSync(fixtureParent, { recursive: true, force: true });
    }
  });

  it('disables checkout caches and rejects ignored protected-tree artifacts', () => {
    const fixtureParent = mkdtempSync(resolve(tmpdir(), 'warpkeep-checkout-cache-'));
    const fixtureRoot = resolve(fixtureParent, 'repository');
    try {
      fixtureGit(fixtureParent, [
        'clone', '--quiet', '--shared', repositoryRoot, fixtureRoot,
      ]);
      for (const path of Object.values(SEALED_LAUNCH_SOURCE_PATHS)) {
        const destination = resolve(fixtureRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(resolve(repositoryRoot, path), destination);
      }
      fixtureGit(fixtureRoot, ['add', '--', ...Object.values(SEALED_LAUNCH_SOURCE_PATHS)]);
      fixtureGit(fixtureRoot, ['commit', '--quiet', '-m', 'Fixture current sealed sources']);
      const head = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      mkdirSync(resolve(fixtureRoot, 'node_modules/checkout-probe'), {
        recursive: true,
      });
      writeFileSync(resolve(
        fixtureRoot,
        'node_modules/checkout-probe/artifact.js',
      ), 'ignored dependency artifact\n');
      const gitDirectory = resolve(fixtureRoot, '.git');
      const excludePath = resolve(gitDirectory, 'info/exclude');
      writeFileSync(
        excludePath,
        `${readFileSync(excludePath, 'utf8')}\n.superpowers/\n`,
      );
      mkdirSync(resolve(fixtureRoot, '.superpowers/checkout-probe'), {
        recursive: true,
      });
      writeFileSync(resolve(
        fixtureRoot,
        '.superpowers/checkout-probe/artifact.txt',
      ), 'ignored task artifact\n');
      expect(fixtureGit(
        fixtureRoot,
        ['status', '--porcelain=v1', '--untracked-files=all'],
      )).toBe('');

      const fsmonitorMarker = resolve(gitDirectory, 'fsmonitor-invoked');
      const fsmonitorHook = resolve(gitDirectory, 'fsmonitor-probe.sh');
      writeFileSync(fsmonitorHook, [
        '#!/bin/sh',
        `/usr/bin/touch '${fsmonitorMarker}'`,
        "/usr/bin/printf '\\0'",
        '',
      ].join('\n'), { mode: 0o700 });
      fixtureGit(fixtureRoot, ['config', 'core.fsmonitor', fsmonitorHook]);
      fixtureGit(fixtureRoot, ['config', 'core.untrackedCache', 'invalid-value']);

      expect(classifySealedLaunchPagesDeployLane({
        repositoryRoot: fixtureRoot,
        candidatePagesSourceCommit: head,
      })).toMatchObject({
        candidatePagesSourceCommit: head,
        mode: 'sealed-launch-blocked',
      });
      expect(existsSync(fsmonitorMarker)).toBe(false);

      const protectedArtifact = 'spacetimedb/src/checkout-probe.tmp';
      writeFileSync(
        resolve(fixtureRoot, protectedArtifact),
        'ignored protected-tree artifact\n',
      );
      expect(fixtureGit(fixtureRoot, [
        '-c', 'core.fsmonitor=false',
        '-c', 'core.untrackedCache=false',
        'check-ignore', '--', protectedArtifact,
      ])).toBe(protectedArtifact);
      expect(() => classifySealedLaunchPagesDeployLane({
        repositoryRoot: fixtureRoot,
        candidatePagesSourceCommit: head,
      })).toThrow('SEALED_LAUNCH_CHECKOUT_INVALID');
      expect(existsSync(fsmonitorMarker)).toBe(false);
    } finally {
      rmSync(fixtureParent, { recursive: true, force: true });
    }
  });

  it('uses raw Git history and tree adapters for attack-revert, extra path, and mode drift', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'warpkeep-g001-history-'));
    try {
      fixtureGit(root, ['init', '--quiet']);
      mkdirSync(resolve(root, 'config/releases'), { recursive: true });
      writeFileSync(resolve(root, 'protected.txt'), 'closed\n');
      writeFileSync(resolve(root, 'package-lock.json'), '{}\n');
      symlinkSync('package-lock.json', resolve(root, 'package.json'));
      writeFileSync(
        resolve(root, 'config/releases/0.4.0-sealed-launch.json'),
        '{}\n',
      );
      fixtureGit(root, ['add', '.']);
      fixtureGit(root, ['commit', '--quiet', '-m', 'base']);
      const base = fixtureGit(root, ['rev-parse', 'HEAD']);

      writeFileSync(resolve(root, 'protected.txt'), 'temporarily open\n');
      fixtureGit(root, ['add', 'protected.txt']);
      fixtureGit(root, ['commit', '--quiet', '-m', 'attack']);
      writeFileSync(resolve(root, 'protected.txt'), 'closed\n');
      fixtureGit(root, ['add', 'protected.txt']);
      fixtureGit(root, ['commit', '--quiet', '-m', 'revert bytes']);
      const preparation = fixtureGit(root, ['rev-parse', 'HEAD']);

      unlinkSync(resolve(root, 'package.json'));
      writeFileSync(resolve(root, 'package.json'), '{"version":"0.4.0"}\n');
      writeFileSync(resolve(root, 'package-lock.json'), '{"version":"0.4.0"}\n');
      writeFileSync(
        resolve(root, 'config/releases/0.4.0-sealed-launch.json'),
        '{"active":true}\n',
      );
      writeFileSync(resolve(root, 'extra.txt'), 'unexpected\n');
      chmodSync(resolve(root, 'package.json'), 0o644);
      fixtureGit(root, ['add', '.']);
      fixtureGit(root, ['commit', '--quiet', '-m', 'activation']);
      const activation = fixtureGit(root, ['rev-parse', 'HEAD']);

      const inspection = inspectSealedLaunchGitHistoryForTesting({
        repositoryRoot: root,
        historicalCommit: base,
        preparationCommit: preparation,
        activationCommit: activation,
        protectedPaths: ['protected.txt'],
      });
      expect(inspection.historicalPathChanges).toBe(true);
      expect(inspection.historicalProjection.equals(
        inspection.preparationProjection,
      )).toBe(true);
      expect(inspection.delta.changedPaths).toEqual([
        'config/releases/0.4.0-sealed-launch.json',
        'extra.txt',
        'package-lock.json',
        'package.json',
      ]);
      expect(inspection.delta.preparationEntries.at(-1)).toMatchObject({
        path: 'package.json',
        mode: '120000',
        type: 'blob',
      });
      expect(inspection.delta.activationEntries.at(-1)).toMatchObject({
        path: 'package.json',
        mode: '100644',
        type: 'blob',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects absent, partial, wrong-target, populated, or presentation-opening receipts', () => {
    const valid = activationBinding();
    for (const patch of [
      { g001PolicyReceiptDigest: null },
      { g001PolicyObservationBootstrapReceiptDigest: null },
      { preparationSourceCommit: null },
      { g001DatabaseIdentity: '6'.repeat(64) },
      { g001SourceBaselineCommit: '2'.repeat(40) },
      { g001BaselineAbiSha256: '2'.repeat(64) },
      { g001FreezeReleaseNonce: '3'.repeat(64) },
      { g001FreezePublishReceiptDigest: null },
      { g001ReleaseVersion: '0.4.0' },
      { g001PlayerAccessEnabled: false },
      { g001AdmissionStateMutationsEnabled: true },
      { g001AccessRequestSubmissionsEnabled: true },
      { admissionMonitorSuspensionReceiptDigest: null },
      { admissionMonitorCurrentStateReceiptDigest: null },
      { admissionMonitorDisabled: false },
      { admissionMonitorLoaded: true },
      { authBridgeSourceCommit: 'a'.repeat(40) },
      { admissionRequestSuspensionReceiptDigest: null },
      { g002FreshStatusDigest: null },
      { g002AtlasSourceCommit: 'a'.repeat(40) },
      { g002AtlasImportReceiptDigest: null },
      { g002SealedLiveReceiptDigest: null },
      { g002DatabaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e' },
      { g002PlayersV2: 1 },
      { g002Claims: 1 },
      { g002WorkerSystemRows: 1 },
      { g002AtlasReady: false },
      { g002AtlasFinalized: false },
      { g002AtlasWritesClosedByFinalization: false },
      { g002AtlasImportMutationsEnabled: false },
      { g002AtlasActivationMutationsEnabled: true },
      { g002PlayerAccessEnabled: true },
      { g002AdmissionMutationsEnabled: true },
      { g002PresentationEnabled: true },
      { legacyGreaterRealmClientPresentationEnabled: true },
      { legacyGreaterRealmServerPresentationEnabled: true },
      { admissionNotificationsEnabled: true },
    ]) {
      const sources = activationSources();
      sources.bindingJson = canonical({ ...valid, ...patch });
      expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow();
    }
  });

  it('rejects missing, forged, colliding, populated, or closed PTR evidence', () => {
    const valid = activationBinding();
    const patches = [
      { ptrPublishReceiptDigest: null },
      { ptrFreshStatusDigest: null },
      { ptrAtlasImportReceiptDigest: null },
      { ptrSealedLiveReceiptDigest: null },
      { ptrOwnerProvisionReceiptDigest: null },
      { ptrDatabaseIdentity: valid.g001DatabaseIdentity },
      { ptrDatabaseIdentity: valid.g002DatabaseIdentity },
      { ptrModuleSourceCommit: '8'.repeat(40) },
      { ptrAtlasSourceCommit: '8'.repeat(40) },
      { ptrAtlasId: 'GENESIS_002_GREATER_REALM' },
      { ptrReleaseVersion: '0.4.0' },
      { ptrAllowedFids: 1 },
      { ptrAccessRequests: 1 },
      { ptrPlayersV2: 1 },
      { ptrCastles: 1 },
      { ptrClaims: 1 },
      { ptrWorkerSystemRows: 1 },
      { ptrPublicAtlasRows: 1 },
      { ptrAtlasReady: false },
      { ptrAtlasFinalized: false },
      { ptrAtlasWritesClosedByFinalization: false },
      { ptrAtlasImportsExact: false },
      { ptrAtlasImportMutationsCompiled: false },
      { ptrAtlasActivationMutationsCompiled: true },
      { ptrOwnerAnchorRows: 0 },
      { ptrOwnerAnchorRows: 2 },
      { ptrOwnerProvisioned: false },
      { ptrOwnerEnabled: false },
      { ptrAdmissionsOpen: true },
      { ptrAccessRequestsOpen: true },
      { ptrAdmissionSurfacePresent: true },
      { ptrAccessRequestSurfacePresent: true },
      { ptrPresentationEnabled: false },
    ];
    for (const patch of patches) {
      const candidate: Record<string, unknown> = { ...valid, ...patch };
      for (const key of Object.keys(candidate)) {
        if (key.endsWith('Commitment')) candidate[key] = null;
      }
      expect(
        () => createSealedLaunchActivationBinding(candidate),
        Object.keys(patch)[0],
      ).toThrow();
    }
  });

  it('rejects arbitrary G001 authority digests even when commitments are regenerated', () => {
    for (const digestKey of [
      'g001FreezePublishReceiptDigest',
      'g001PolicyReceiptDigest',
    ]) {
      const candidate = activationBinding();
      for (const commitmentKey of [
        'g001FreezePublishReceiptCommitment',
        'g001PolicyReceiptCommitment',
        'g001PolicyObservationBootstrapReceiptCommitment',
        'g001CensusPrivacySafeReceiptCommitment',
        'admissionMonitorSuspensionReceiptCommitment',
        'admissionMonitorCurrentStateReceiptCommitment',
        'admissionRequestSuspensionReceiptCommitment',
      'g002PublishReceiptCommitment',
      'g002FreshStatusCommitment',
      'g002AtlasImportReceiptCommitment',
      'g002SealedLiveReceiptCommitment',
      'ptrPublishReceiptCommitment',
      'ptrFreshStatusCommitment',
      'ptrAtlasImportReceiptCommitment',
      'ptrSealedLiveReceiptCommitment',
      'ptrOwnerProvisionReceiptCommitment',
      ]) candidate[commitmentKey] = null;
      candidate[digestKey] = 'f'.repeat(64);
      expect(() => createSealedLaunchActivationBinding(candidate)).toThrow();
    }
  });

  it('keeps the admitted-player census digest in the explicit activation digest gate', () => {
    const verifierSource = source('scripts/verify-0.4.0-sealed-launch.mjs');
    const digestGate = verifierSource.match(
      /function verifyActivationBinding\(binding\) \{\n  const digestKeys = \[([\s\S]*?)\n  \];/u,
    )?.[1] ?? '';
    expect(digestGate).toContain(
      "'g001AdmittedPlayerCensusReceiptDigest'",
    );
  });

  it('rejects random or swapped G002 receipt commitments and ancestry', () => {
    const valid = activationBinding();
    for (const patch of [
      {
        g002PublishReceiptDigest: valid.g002AtlasImportReceiptDigest,
        g002AtlasImportReceiptDigest: valid.g002PublishReceiptDigest,
      },
      { g002PublishReceiptCommitment: 'f'.repeat(64) },
      { admissionRequestSuspensionReceiptCommitment: 'f'.repeat(64) },
      { g002ModuleSourceCommit: 'a'.repeat(40) },
      { g002AtlasSourceCommit: 'a'.repeat(40) },
      { g001PolicySourceCommit: 'a'.repeat(40) },
    ]) {
      const sources = activationSources();
      sources.bindingJson = canonical({ ...valid, ...patch });
      expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow();
    }

    expect(() => verifySealedLaunchActivationHistory({
      bindingSource: canonical(valid),
      candidateActivationCommit: 'f'.repeat(40),
      isAncestor: () => false,
      ...validActivationHistoryChecks(),
    })).toThrow();
    expect(() => verifySealedLaunchActivationHistory({
      bindingSource: canonical(valid),
      candidateActivationCommit: String(valid.preparationSourceCommit),
      isAncestor: () => true,
      ...validActivationHistoryChecks(),
    })).toThrow();
  });

  it('rejects non-null preparation operations and extra activation receipt fields', () => {
    const preparation = checkedInSources();
    const binding = JSON.parse(preparation.bindingJson);
    preparation.bindingJson = canonical({
      ...binding,
      g002PublishReceiptDigest: '1'.repeat(64),
    });
    expect(() => verifySealedLaunchSources(preparation, 'preparation')).toThrow();

    const activation = activationSources();
    activation.bindingJson = canonical({
      ...activationBinding(),
      applicantNames: ['must-never-enter-source-control'],
    });
    expect(() => verifySealedLaunchSources(activation, 'activation')).toThrow();
  });

  it('binds only a privacy-safe opaque census receipt and rejects the raw-digest field', () => {
    const preparationBinding = JSON.parse(checkedInSources().bindingJson);
    expect(preparationBinding).toHaveProperty(
      'g001CensusPrivacySafeReceiptProfile',
      null,
    );
    expect(preparationBinding).toHaveProperty(
      'g001CensusPrivacySafeReceiptDigest',
      null,
    );
    expect(preparationBinding).not.toHaveProperty('g001CensusExportReceiptDigest');
    expect(preparationBinding).not.toHaveProperty('g001CensusRawDigest');
    expect(preparationBinding).not.toHaveProperty('g001CensusApplicantCount');

    const rawDigestCandidate = activationBinding();
    delete rawDigestCandidate.g001CensusPrivacySafeReceiptDigest;
    rawDigestCandidate.g001CensusExportReceiptDigest = '3'.repeat(64);
    const sources = activationSources();
    sources.bindingJson = canonical(rawDigestCandidate);
    expect(() => verifySealedLaunchSources(sources, 'activation')).toThrow();
  });

  it('independently verifies the admitted-player census static privacy boundary', () => {
    const valid = checkedInSources();
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE).toBe(
      'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
    );
    expect(() => verifyGenesis001AdmittedPlayerCensusBoundary(valid)).not.toThrow();

    for (const field of [
      'genesis001AdmittedPlayerCensusSource',
      'genesis001AdmittedPlayerCensusDeclaration',
    ] as const) {
      expect(() => verifyGenesis001AdmittedPlayerCensusBoundary({
        ...valid,
        [field]: '',
      }))
        .toThrow();
    }

    const sourceMutations = [
      [
        'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
        'warpkeep-genesis-001-admitted-player-census-private-proof-v2',
      ],
      [
        'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
        'warpkeep-genesis-001-admitted-player-census-privacy-safe-v2',
      ],
      [
        'warpkeep.genesis-001.admitted-player-census.normalized-set.v1\\n',
        'warpkeep.genesis-001.admitted-player-census.normalized-set.v2\\n',
      ],
      [
        'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\\n',
        'warpkeep.genesis-001.admitted-player-census.raw-evidence.v2\\n',
      ],
      [
        'warpkeep.genesis-001.admitted-player-census.private-proof.v1\\n',
        'warpkeep.genesis-001.admitted-player-census.private-proof.v2\\n',
      ],
      [
        'SELECT fid, enabled, auth_epoch FROM allowed_fid',
        'SELECT fid, auth_epoch FROM allowed_fid',
      ],
      ['SELECT fid FROM player_v2', 'SELECT fid FROM allowed_fid'],
      [
        'admin_get_access_request_admission_status_v1',
        'admin_get_fid_auth_epoch',
      ],
      ['= 4_096;', '= 4_097;'],
      ['1_024 * 1_024;', '2_024 * 1_024;'],
      ['=\n  60_000;', '=\n  59_000;'],
      ['=\n  300_000;', '=\n  301_000;'],
      ['enabledAllowedFids !== allowedFids', 'enabledAllowedFids === allowedFids'],
      ['JSON.stringify(beforeAggregate) !== JSON.stringify(afterAggregate)',
        'JSON.stringify(beforeAggregate) === JSON.stringify(afterAggregate)'],
      ['randomBytes(NONCE_BYTES)', 'randomBytes(16)'],
      ['output.every(byte => byte === 0)', 'output.every(byte => byte < 0)'],
      [
        "if (value?.outcome === 'unsupported-exact-query') {",
        "if (value?.outcome === 'unsupported-exact-query' || value?.outcome === 'timeout') {",
      ],
      [
        "status.admissionState !== 'enabled'",
        "status.admissionState === 'enabled'",
      ],
      [
        'BigInt(beforeAggregate.allowedFids) !== BigInt(entries.length)',
        'BigInt(beforeAggregate.allowedFids) === BigInt(entries.length)',
      ],
      [
        'normalizedSetDigest(normalized) !== receipt.normalizedSetDigest',
        'normalizedSetDigest(normalized) === receipt.normalizedSetDigest',
      ],
      [
        'separation < GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS',
        'separation <= GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS',
      ],
      [
        'separation > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS',
        'separation >= GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS',
      ],
      [
        'profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,',
        'profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,',
      ],
      [
        'opaqueProofDigest: second.opaqueProofDigest,',
        'opaqueProofDigest: first.opaqueProofDigest,',
      ],
      [
        'opaqueProofDigest: second.opaqueProofDigest,\n  });',
        'opaqueProofDigest: second.opaqueProofDigest,\n    rawEvidenceDigest: second.rawEvidenceDigest,\n  });',
      ],
    ] as const;
    for (const [before, after] of sourceMutations) {
      expect(valid.genesis001AdmittedPlayerCensusSource).toContain(before);
      expect(() => verifyGenesis001AdmittedPlayerCensusBoundary({
        ...valid,
        genesis001AdmittedPlayerCensusSource:
          valid.genesis001AdmittedPlayerCensusSource.replace(before, after),
      }), before).toThrow();
    }
    for (const ambient of [
      'void globalThis.crypto.getRandomValues(new Uint8Array(32));',
      'void performance.now();',
    ]) {
      expect(() => verifyGenesis001AdmittedPlayerCensusBoundary({
        ...valid,
        genesis001AdmittedPlayerCensusSource:
          `${valid.genesis001AdmittedPlayerCensusSource}\n${ambient}\n`,
      }), ambient).toThrow();
    }

    for (const [before, after] of [
      [
        'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
        'warpkeep-genesis-001-admitted-player-census-private-proof-v2',
      ],
      ['outcome: \'unsupported-exact-query\'', 'outcome: \'timeout\''],
      ['randomBytes: (size: 32) => Uint8Array;', 'randomBytes: (size: 16) => Uint8Array;'],
      [
        "sql: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL,",
        'sql: string,',
      ],
      ['allowedFids: string;', 'allowedFids: number;'],
      ['opaqueProofDigest: string;', 'rawEvidenceDigest: string;'],
      [
        '  profile: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE;\n'
          + '  opaqueProofDigest: string;\n}>;',
        '  profile: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE;\n'
          + '  opaqueProofDigest: string;\n  diagnostic: string;\n}>;',
      ],
    ] as const) {
      expect(valid.genesis001AdmittedPlayerCensusDeclaration).toContain(before);
      expect(() => verifyGenesis001AdmittedPlayerCensusBoundary({
        ...valid,
        genesis001AdmittedPlayerCensusDeclaration:
          valid.genesis001AdmittedPlayerCensusDeclaration.replace(before, after),
      }), before).toThrow();
    }
  });

  it.each([
    {
      name: 'direct Date call',
      mutate: (source: string) => `${source}\nvoid Date();\n`,
    },
    {
      name: 'crypto randomUUID call',
      mutate: (source: string) => `${source}\nvoid crypto.randomUUID();\n`,
    },
    {
      name: 'globalThis crypto randomUUID call',
      mutate: (source: string) =>
        `${source}\nvoid globalThis.crypto.randomUUID();\n`,
    },
    {
      name: 'global crypto randomUUID call',
      mutate: (source: string) => `${source}\nvoid global.crypto.randomUUID();\n`,
    },
    {
      name: 'bare randomUUID call',
      mutate: (source: string) => `${source}\nvoid randomUUID();\n`,
    },
    {
      name: 'empty fallback iteration',
      mutate: (source: string) => source.replace(
        'for (const fid of enumeration.fids) {',
        'for (const fid of []) {',
      ),
    },
    {
      name: 'reversed request-state validation',
      mutate: (source: string) => source.replace(
        'status.requestState !== expectedRequestState',
        'status.requestState === expectedRequestState',
      ),
    },
    {
      name: 'empty raw-evidence payload update',
      mutate: (source: string) => source.replace(
        '.update(output);',
        '.update(new Uint8Array());',
      ),
    },
  ])('rejects reviewed admitted-player census mutation: $name', ({ mutate }) => {
    const valid = checkedInSources();
    const mutated = mutate(valid.genesis001AdmittedPlayerCensusSource);
    expect(mutated).not.toBe(valid.genesis001AdmittedPlayerCensusSource);
    expect(() => verifyGenesis001AdmittedPlayerCensusBoundary({
      ...valid,
      genesis001AdmittedPlayerCensusSource: mutated,
    })).toThrow('SEALED_LAUNCH_G001_ADMITTED_PLAYER_CENSUS_BOUNDARY_INVALID');
  });

  it('rejects any static gate drift even with complete receipts', () => {
    const sources = activationSources();
    for (const [field, before, after] of [
      ['genesis001PolicySource', 'playerAccessEnabled: true', 'playerAccessEnabled: false'],
      ['genesis001FrozenMaterializerSource', '2ae51984e1fa6ce5b0028c1a250359fed79d819b', 'f'.repeat(40)],
      ['genesis001FrozenPublisherCoreSource', '--delete-data=never', '--delete-data=always'],
      ['genesis001FrozenPublisherCoreSource', 'const receipt =', "const modulePath = 'spacetimedb';\nconst receipt ="],
      ['genesis001FrozenPublisherCliSource', 'cli = attestGenesis001PinnedCli(executable, configuration.childEnvironment);', 'cli = undefined;'],
      ['genesis001CensusPrivacySafeReceiptSource', 'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1', 'warpkeep.genesis-001.census-export.raw-sha256.v1'],
      ['genesis001AdmissionMonitorSuspensionSource', 'warpkeep-genesis001-admission-monitor-suspension-v1', 'warpkeep-genesis001-admission-monitor-suspension-v2'],
      ['genesis001AdmissionMonitorSuspensionSource', 'disabled: true,', 'disabled: false,'],
      ['genesis001AdmissionMonitorSuspensionSource', 'loaded: false,', 'loaded: true,'],
      ['genesis001AdmissionMonitorSuspensionSource', "'bootout',", "'remove',"],
      ['genesis001SealedLaunchAdoptionSource', 'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1\\n', 'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v2\\n'],
      ['genesis001SealedLaunchAdoptionSource', 'return sha256(`${canonicalJson(value)}\\n`);', 'return descriptorDigest(value);'],
      ['genesis001SealedLaunchAdoptionSource', '/^0{64}$/u.test(receipt.privateBlindingNonceHex)', '/^never$/u.test(receipt.privateBlindingNonceHex)'],
      ['genesis001PolicyObservationReceiptSource', 'await session.inspect(', 'await session.submit('],
      ['genesis001PolicyObservationReceiptSource', "from './greater-realm-production-transport.ts'", "from './unreviewed-transport.ts'"],
      ['genesis001PolicyObservationReceiptSource', "setGlobalLogLevel('error');", "setGlobalLogLevel('info');"],
      ['genesis001PolicyObservationReceiptSource', "adminSecret = '';", 'adminSecret = adminSecret;'],
      ['genesis001PolicyObservationReceiptSource', 'await session.close();', 'await Promise.resolve();'],
      ['genesis001PolicyObservationReceiptSource', 'mutationSubmitted: false', 'mutationSubmitted: true'],
      ['legacyGreaterRealmProductionBootstrapSource', "exactArguments: Object.freeze(['observe']),", "exactArguments: Object.freeze(['observe', '--confirm']),"],
      ['legacyGreaterRealmProductionBootstrapSource', 'const MAXIMUM_G001_POLICY_OBSERVER_STREAM_BYTES = 16 * 1024;', 'const MAXIMUM_G001_POLICY_OBSERVER_STREAM_BYTES = 32 * 1024;'],
      ['legacyGreaterRealmProductionBootstrapSource', "capturesPolicyObservation ? 'pipe' : 'inherit'", "capturesPolicyObservation ? 'inherit' : 'inherit'"],
      ['legacyGreaterRealmProductionBootstrapSource', 'if (output.length !== 0) {', 'if (output.length < 0) {'],
      ['legacyGreaterRealmProductionBootstrapSource', "launchCleanup.outcome !== 'cleaned'", "launchCleanup.outcome !== 'dirty'"],
      ['legacyGreaterRealmProductionBootstrapSource', 'warpkeep-production-g001-policy-observation-bootstrap-link-v1', 'warpkeep-production-g001-policy-observation-bootstrap-link-v2'],
      ['legacyGreaterRealmProductionBootstrapSource', 'return linked;', 'return receipt;'],
      ['genesis001LegacyGreaterRealmProductionSealSource', 'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1', 'warpkeep-genesis-001-legacy-greater-realm-production-seal-v2'],
      ['legacyGreaterRealmProductionPublisherCliSource', "entrypoint: 'publisher'", "entrypoint: 'publisher-open'"],
      ['legacyGreaterRealmProductionImportOperatorSource', "entrypoint: 'import'", "entrypoint: 'import-open'"],
      ['legacyGreaterRealmProductionRelocationOperatorSource', "entrypoint: 'relocation'", "entrypoint: 'relocation-open'"],
      ['legacyGreaterRealmProductionBootstrapSource', "entrypoint: 'bootstrap'", "entrypoint: 'bootstrap-open'"],
      ['legacyGreaterRealmProductionLaunchEnvelopeSource', 'fail GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED', 'true # legacy mutations open'],
      ['genesis001PolicyObservationLaunchEnvelopeSource', 'umask 077', 'umask 076'],
      ['genesis001PolicyObservationLaunchEnvelopeSource', 'g001-policy-observe|launch-run-inspect|launch-run-cleanup) ;;', 'g001-policy-observe|verify|launch-run-inspect|launch-run-cleanup) ;;'],
      ['genesis001PolicyObservationLaunchEnvelopeSource', '  g001-policy-observe)\n    [ "$admin_secret" != - ]', '  g001-policy-observe)\n    [ "$admin_secret" = - ]'],
      ['genesis001PolicyObservationLaunchEnvelopeSource', '[ "$#" -eq 0 ] || fail GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID', '[ "$#" -le 1 ] || fail GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID'],
      ['hermesSource', "commandOutput: 'basename-status-only-v1'", "commandOutput: 'raw-metadata-v1'"],
      ['hermesSource', 'Legacy access-request listing is suspended for the 0.4.0 sealed launch.', 'Legacy access-request listing remains available.'],
      ['viteConfigSource', '__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(productVersion)', '__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(\'0.3.43\')'],
      ['buildInfoSource', '? __WARPKEEP_PRODUCT_VERSION__', "? '0.3.43'"],
      ['genesis002ContractSource', 'activationMutationsEnabled: false', 'activationMutationsEnabled: true'],
      ['genesis002ActivationReceiptsSource', 'export function genesis002PublishReceiptDigest(receipt)', 'export function genesis002UncheckedReceiptDigest(receipt)'],
      ['genesis002ActivationReceiptsSource', 'warpkeep.genesis-002.production-publish-receipt.v1\\n', 'warpkeep.genesis-002.production-publish-receipt.v2\\n'],
      ['genesis002ActivationReceiptsSource', 'export function genesis002ProductionImportReceiptDigest(receipt)', 'export function genesis002UncheckedImportReceiptDigest(receipt)'],
      ['genesis002ActivationReceiptsSource', 'warpkeep.genesis-002.production-import-receipt.v1\\n', 'warpkeep.genesis-002.production-import-receipt.v2\\n'],
      ['genesis002ActivationReceiptsSource', 'Object.is(receipt.operationsSubmitted, -0)', 'Object.is(receipt.operationsSubmitted, 0)'],
      ['genesis002ActivationReceiptsSource', 'receipt[field] !== 0 || Object.is(receipt[field], -0)', 'receipt[field] !== 0'],
      ['genesis002ActivationReceiptsSource', 'export function genesis002SealedLiveReceiptDigest(receipt)', 'export function genesis002UncheckedLiveReceiptDigest(receipt)'],
      ['genesis002ActivationReceiptsSource', 'warpkeep.genesis-002.sealed-live-receipt.v1\\n', 'warpkeep.genesis-002.sealed-live-receipt.v2\\n'],
      ['genesis002PublisherCliSource', 'publishReceipt: receipt,', 'publishReceipt: { ...receipt, unexpected: true },'],
      ['genesis002PublisherCliSource', 'publishReceiptDigest: receipt.publishReceiptDigest,', 'publishReceiptDigest: receipt.freshStatusDigest,'],
      ['genesis002ImportOperatorSource', 'importReceiptDigest: receipt.importReceiptDigest', 'importReceiptDigest: receipt.verificationDigest'],
      ['activationGeneratorSource', 'export function generateSealedLaunchActivationBindingFromDescriptor(', 'export function generateUncheckedActivationBinding('],
      ['activationGeneratorSource', 'genesis002PublishReceiptDigest(publishReceipt)', 'publish.publishReceiptDigest'],
      ['activationGeneratorSource', 'publish.sourceCommit !== atlasImport.atlasSourceCommit', 'publish.sourceCommit === atlasImport.atlasSourceCommit'],
      ['activationGeneratorSource', 'g002DatabaseIdentity: publish.databaseIdentity', 'g002DatabaseIdentity: candidate.g002DatabaseIdentity'],
      ['activationGeneratorSource', 'deriveGenesis001SealedLaunchEvidence(privateEvidence)', 'deriveGenesis001SealedLaunchEvidence(privateEvidence, evidence.authority)'],
      ['verifyWorkflowSource', '--exclude tests/authBridgeNotificationPreparedWorkflow.test.ts', '--exclude tests/unrelated.test.ts'],
      ['genesis002SchemaSource', "tableAccess: { tag: 'Private' }", "tableAccess: { tag: 'Public' }"],
      ['clientPresentationSource', 'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false', 'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = true'],
      ['serverPresentationSource', 'GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false', 'GREATER_REALM_SERVER_PRESENTATION_ALLOWED = true'],
      ['hermesSource', 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false', 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true'],
      ['realmReleaseIdentitySource', "GENESIS_002_RELEASE_STATE = 'sealed-no-player-access'", "GENESIS_002_RELEASE_STATE = 'active'"],
      ['realmReleaseIdentitySource', "PTR_RELEASE_STATE = 'owner-only-testing'", "PTR_RELEASE_STATE = 'public-testing'"],
      ['ptrRealmConfigSource', "PTR_SPACETIME_URI = 'https://maincloud.spacetimedb.com'", "PTR_SPACETIME_URI = 'https://alternate.invalid'"],
      ['ptrRealmConfigSource', "enabled !== 'true'", "enabled !== 'false'"],
      ['admissionLaunchPolicySource', 'ACCESS_REQUEST_CONTROLS_ENABLED = false', 'ACCESS_REQUEST_CONTROLS_ENABLED = true'],
      ['authBridgeSource', 'ACCESS_REQUEST_SUBMISSIONS_SUSPENDED = true', 'ACCESS_REQUEST_SUBMISSIONS_SUSPENDED = false'],
      ['admissionRequestSuspensionProbeSource', "const REQUEST_PATH = '/v2/access/request'", "const REQUEST_PATH = '/v2/access/status'"],
      ['realmChoicePolicySource', "admission: 'not-admitted'", "admission: 'admitted'"],
      ['realmChoiceSelectorSource', "choice.admission === 'admitted' ? '✓' : '×'", "choice.admission === 'admitted' ? '✓' : '✓'"],
      ['realmMenuSource', 'selectedRealmId === GENESIS_002_ID', 'selectedRealmId === GENESIS_001_ID'],
      ['farcasterContractSource', 'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.', 'Explore a six-region world foundation.'],
      ['latestPatchNotesSource', "title: 'THE SECOND GENESIS WAITS'", "title: 'THE SECOND GENESIS OPENS'"],
      ['pagesWorkflowSource', "VITE_WARPKEEP_PTR_ENABLED: 'true'", "VITE_WARPKEEP_PTR_ENABLED: 'false'"],
      ['pagesWorkflowSource', 'VITE_PTR_SPACETIMEDB_DATABASE: ${{ vars.WARPKEEP_PTR_SPACETIMEDB_DATABASE }}', "VITE_PTR_SPACETIMEDB_DATABASE: ''"],
      ['pagesWorkflowSource', 'node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages-build', 'node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation'],
    ] as const) {
      const candidate = { ...sources, [field]: sources[field].replace(before, after) };
      expect(
        () => verifySealedLaunchSources(candidate, 'activation'),
        `${field}: ${before}`,
      ).toThrow();
    }

    const alternateAuthority = {
      ...sources,
      genesis001SealedLaunchAdoptionSource:
        sources.genesis001SealedLaunchAdoptionSource.replace(
          GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256,
          'f'.repeat(64),
        ),
    };
    expect(() => verifySealedLaunchSources(
      alternateAuthority,
      'activation',
    )).toThrow();
  });
});
