// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  verifySealedLaunchActivationHistory,
  classifySealedLaunchPagesSources,
  sealedLaunchReceiptCommitment,
  verifySealedLaunchSources,
} from '../scripts/verify-0.4.0-sealed-launch.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

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
    genesis001AdmissionMonitorSuspensionSource:
      source('scripts/genesis001-admission-monitor-suspension.ts'),
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
    genesis002PrivateLoopbackSource:
      source('scripts/genesis002-private-loopback-verifier.ts'),
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
    admissionLaunchPolicySource: source('src/release/admissionLaunchPolicy.ts'),
    authBridgeSource: source('services/auth-bridge/src/app.ts'),
    admissionRequestSuspensionProbeSource:
      source('scripts/verify-admission-request-suspension.mjs'),
    realmChoicePolicySource: source('src/components/menu/realmChoicePolicy.ts'),
    realmChoiceSelectorSource: source('src/components/menu/RealmChoiceSelector.tsx'),
    realmMenuSource: source('src/components/menu/WarpkeepMainMenu.tsx'),
    farcasterManifestSource: source('public/.well-known/farcaster.json'),
    farcasterContractSource: source('scripts/farcaster-miniapp-contract.mjs'),
    latestPatchNotesSource: source('src/components/menu/latestPatchNotes.ts'),
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
    g001FreezePublishReceiptDigest: '0'.repeat(64),
    g001FreezePublishReceiptCommitment: null,
    g001PolicyReceiptDigest: '1'.repeat(64),
    g001PolicyReceiptCommitment: null,
    g001PolicySourceCommit: '7'.repeat(40),
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001CensusPrivacySafeReceiptProfile:
      'warpkeep-genesis-001-census-export-privacy-safe-v1',
    g001CensusPrivacySafeReceiptDigest: '3'.repeat(64),
    g001CensusPrivacySafeReceiptCommitment: null,
    admissionMonitorSuspensionReceiptDigest: '4'.repeat(64),
    admissionMonitorSuspensionReceiptCommitment: null,
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
    g002PresentationEnabled: false,
    legacyGreaterRealmClientPresentationEnabled: false,
    legacyGreaterRealmServerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  };
  for (const commitmentKey of [
    'g001FreezePublishReceiptCommitment',
    'g001PolicyReceiptCommitment',
    'g001CensusPrivacySafeReceiptCommitment',
    'admissionMonitorSuspensionReceiptCommitment',
    'admissionRequestSuspensionReceiptCommitment',
    'g002PublishReceiptCommitment',
    'g002FreshStatusCommitment',
    'g002AtlasImportReceiptCommitment',
    'g002SealedLiveReceiptCommitment',
  ]) {
    binding[commitmentKey] = sealedLaunchReceiptCommitment(
      commitmentKey,
      binding,
    );
  }
  return binding;
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

describe('0.4.0 sealed-launch verifier', () => {
  it('accepts only inert 0.3.43 preparation and blocks Pages', () => {
    expect(verifySealedLaunchSources(checkedInSources(), 'preparation')).toMatchObject({
      phase: 'preparation',
      packageVersion: '0.3.43',
      pagesDeploymentApproved: false,
    });
    expect(classifySealedLaunchPagesSources(checkedInSources())).toBe(
      'sealed-launch-blocked',
    );
  });

  it('accepts exact 0.4.0 activation receipts in a new non-G001 database', () => {
    expect(verifySealedLaunchSources(activationSources(), 'activation')).toMatchObject({
      phase: 'activation',
      packageVersion: '0.4.0',
      pagesDeploymentApproved: true,
      g002DatabaseIdentity: '6'.repeat(64),
    });
    expect(classifySealedLaunchPagesSources(activationSources())).toBe(
      'sealed-g002',
    );
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

  it('binds the frozen G001 source and exact G002 preparation ancestry', () => {
    const binding = canonical(activationBinding());
    const isAncestor = vi.fn((ancestor: string, descendant: string) => (
      ancestor === '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
        || ancestor === '7'.repeat(40)
    ) && descendant === 'f'.repeat(40));
    expect(verifySealedLaunchActivationHistory({
      bindingSource: binding,
      candidateActivationCommit: 'f'.repeat(40),
      isAncestor,
    })).toMatchObject({
      preparationSourceCommit: '7'.repeat(40),
      candidateActivationCommit: 'f'.repeat(40),
    });
    expect(isAncestor).toHaveBeenCalledWith(
      '7'.repeat(40),
      'f'.repeat(40),
    );
  });

  it('rejects absent, partial, wrong-target, populated, or presentation-opening receipts', () => {
    const valid = activationBinding();
    for (const patch of [
      { g001PolicyReceiptDigest: null },
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
    })).toThrow();
    expect(() => verifySealedLaunchActivationHistory({
      bindingSource: canonical(valid),
      candidateActivationCommit: String(valid.preparationSourceCommit),
      isAncestor: () => true,
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
      ['genesis001LegacyGreaterRealmProductionSealSource', 'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1', 'warpkeep-genesis-001-legacy-greater-realm-production-seal-v2'],
      ['legacyGreaterRealmProductionPublisherCliSource', "entrypoint: 'publisher'", "entrypoint: 'publisher-open'"],
      ['legacyGreaterRealmProductionImportOperatorSource', "entrypoint: 'import'", "entrypoint: 'import-open'"],
      ['legacyGreaterRealmProductionRelocationOperatorSource', "entrypoint: 'relocation'", "entrypoint: 'relocation-open'"],
      ['legacyGreaterRealmProductionBootstrapSource', "entrypoint: 'bootstrap'", "entrypoint: 'bootstrap-open'"],
      ['legacyGreaterRealmProductionLaunchEnvelopeSource', 'fail GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED', 'true # legacy mutations open'],
      ['hermesSource', "commandOutput: 'basename-status-only-v1'", "commandOutput: 'raw-metadata-v1'"],
      ['hermesSource', 'Legacy access-request listing is suspended for the 0.4.0 sealed launch.', 'Legacy access-request listing remains available.'],
      ['viteConfigSource', '__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(productVersion)', '__WARPKEEP_PRODUCT_VERSION__: JSON.stringify(\'0.3.43\')'],
      ['buildInfoSource', '? __WARPKEEP_PRODUCT_VERSION__', "? '0.3.43'"],
      ['genesis002ContractSource', 'activationMutationsEnabled: false', 'activationMutationsEnabled: true'],
      ['genesis002SchemaSource', "tableAccess: { tag: 'Private' }", "tableAccess: { tag: 'Public' }"],
      ['clientPresentationSource', 'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false', 'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = true'],
      ['serverPresentationSource', 'GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false', 'GREATER_REALM_SERVER_PRESENTATION_ALLOWED = true'],
      ['hermesSource', 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false', 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true'],
      ['realmReleaseIdentitySource', "GENESIS_002_RELEASE_STATE = 'sealed-no-player-access'", "GENESIS_002_RELEASE_STATE = 'active'"],
      ['admissionLaunchPolicySource', 'ACCESS_REQUEST_CONTROLS_ENABLED = false', 'ACCESS_REQUEST_CONTROLS_ENABLED = true'],
      ['authBridgeSource', 'ACCESS_REQUEST_SUBMISSIONS_SUSPENDED = true', 'ACCESS_REQUEST_SUBMISSIONS_SUSPENDED = false'],
      ['admissionRequestSuspensionProbeSource', "const REQUEST_PATH = '/v2/access/request'", "const REQUEST_PATH = '/v2/access/status'"],
      ['realmChoicePolicySource', "admission: 'not-admitted'", "admission: 'admitted'"],
      ['realmChoiceSelectorSource', "choice.admission === 'admitted' ? '✓' : '×'", "choice.admission === 'admitted' ? '✓' : '✓'"],
      ['realmMenuSource', 'selectedRealmId === GENESIS_002_ID', 'selectedRealmId === GENESIS_001_ID'],
      ['farcasterContractSource', 'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.', 'Explore a six-region world foundation.'],
      ['latestPatchNotesSource', "title: 'THE SECOND GENESIS WAITS'", "title: 'THE SECOND GENESIS OPENS'"],
    ] as const) {
      const candidate = { ...sources, [field]: sources[field].replace(before, after) };
      expect(
        () => verifySealedLaunchSources(candidate, 'activation'),
        `${field}: ${before}`,
      ).toThrow();
    }
  });
});
