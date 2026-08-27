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
  genesis001CensusPrivacySafeReceiptSource:
    'scripts/genesis001-census-privacy-safe-receipt.mjs',
  genesis001AdmissionMonitorSuspensionSource:
    'scripts/genesis001-admission-monitor-suspension.ts',
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
  genesis002PrivateLoopbackSource:
    'scripts/genesis002-private-loopback-verifier.ts',
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
  'g002PresentationEnabled',
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
  g001CensusPrivacySafeReceiptCommitment:
    'g001CensusPrivacySafeReceiptDigest',
  admissionMonitorSuspensionReceiptCommitment:
    'admissionMonitorSuspensionReceiptDigest',
  admissionRequestSuspensionReceiptCommitment:
    'admissionRequestSuspensionReceiptDigest',
  g002PublishReceiptCommitment: 'g002PublishReceiptDigest',
  g002FreshStatusCommitment: 'g002FreshStatusDigest',
  g002AtlasImportReceiptCommitment: 'g002AtlasImportReceiptDigest',
  g002SealedLiveReceiptCommitment: 'g002SealedLiveReceiptDigest',
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
    packageJson?.name !== 'warpkeep'
    || packageJson.version !== expectedVersion
    || packageLock?.name !== 'warpkeep'
    || packageLock.version !== expectedVersion
    || packageLock.lockfileVersion !== 3
    || packageLock.packages?.['']?.name !== 'warpkeep'
    || packageLock.packages[''].version !== expectedVersion
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
    'warpkeep-genesis-001-freeze-publish-final-receipt-v1',
    'publishGenesis001Frozen',
    'sourceBaselineCommit',
    'baselineAbiSha256',
    'freezeReleaseNonce',
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
  ]) {
    if (!sources.genesis001FrozenPublisherRuntimeSource.includes(token)) {
      fail('SEALED_LAUNCH_G001_FROZEN_RUNTIME_INVALID');
    }
  }
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
    'WARPKEEP_SPACETIME_CLI_CONFIG_PATH',
    'takeGenesis002ProductionAdminSecret',
    'attestGreaterRealmProductionProtectedMain',
    'verifyGenesis002FreshPublishStatus',
    'cliConfigSourcePath: local.cliConfigSourcePath',
    'spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256',
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
    'Genesis 001 is preserved at 0.3.43. Genesis 002 is sealed at 0.4.0, and new admissions are suspended.',
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
    'selectedRealmId === GENESIS_002_ID',
    'GENESIS_002_SEALED_NOTICE',
    'admissionRequestsSuspended={NEW_ADMISSIONS_SUSPENDED}',
    '<RealmChoiceSelector',
  ]) {
    if (!sources.realmMenuSource.includes(token)) {
      fail('SEALED_LAUNCH_REALM_MENU_GATE_INVALID');
    }
  }
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
  ]) {
    if (!sources.latestPatchNotesSource.includes(token)) {
      fail('SEALED_LAUNCH_PATCH_NOTES_INVALID');
    }
  }
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
    'npm run verify:sealed-launch:activation',
    'npm run verify:admission-request-suspension',
    'npm run build',
    'actions/upload-pages-artifact@',
  ]) {
    if (!build.includes(token)) fail('SEALED_LAUNCH_PAGES_BUILD_GATE_INVALID');
  }
  if (
    build.indexOf('npm run verify:sealed-launch:activation')
      > build.indexOf('npm run verify:admission-request-suspension')
    || build.indexOf('npm run verify:admission-request-suspension')
      > build.indexOf('npm run build')
    || build.indexOf('npm run build')
      > build.indexOf('actions/upload-pages-artifact@')
  ) fail('SEALED_LAUNCH_PAGES_BUILD_ORDER_INVALID');
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
  verifyGenesis001CensusPrivacyBoundary(sources);
  verifyGenesis001AdmissionMonitorSuspension(sources);
  verifyGenesis001LegacyGreaterRealmProductionSeal(sources);
  verifyGenesis002Policy(sources);
  verifyClosedPresentationAndNotifications(sources);
  verifyPlayerFacingSealedRealmRelease(sources);
  verifyAdmissionRequestSuspensionBoundary(sources);
  verifyPagesTwoPhaseBoundary(sources);
}

function verifyPreparationBinding(binding) {
  if (
    binding.pagesDeploymentApproved !== false
    || OPERATIONAL_BINDING_KEYS.some(key => binding[key] !== null)
  ) fail('SEALED_LAUNCH_PREPARATION_BINDING_INVALID');
}

function verifyActivationBinding(binding) {
  const digestKeys = [
    'g001FreezePublishReceiptDigest',
    'g001PolicyReceiptDigest',
    'g001CensusPrivacySafeReceiptDigest',
    'admissionMonitorSuspensionReceiptDigest',
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
  ];
  const commitKeys = [
    'preparationSourceCommit',
    'g001PolicySourceCommit',
    'authBridgeSourceCommit',
    'g002ModuleSourceCommit',
    'g002ModuleTreeId',
    'g002AtlasSourceCommit',
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
  if (
    binding.pagesDeploymentApproved !== true
    || digestKeys.some(key => !SHA256.test(binding[key] ?? ''))
    || commitKeys.some(key => !COMMIT.test(binding[key] ?? ''))
    || binding.g001DatabaseIdentity !== GENESIS_001_DATABASE_IDENTITY
    || binding.g001SourceBaselineCommit !== GENESIS_001_SOURCE_BASELINE_COMMIT
    || binding.g001BaselineAbiSha256 !== GENESIS_001_BASELINE_ABI_SHA256
    || binding.g001FreezeReleaseNonce !== GENESIS_001_FREEZE_RELEASE_NONCE
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
  ) fail('SEALED_LAUNCH_ACTIVATION_BINDING_INVALID');
  for (const commitmentKey of Object.keys(RECEIPT_COMMITMENT_DIGESTS)) {
    if (
      !SHA256.test(binding[commitmentKey] ?? '')
      || binding[commitmentKey]
        !== sealedLaunchReceiptCommitment(commitmentKey, binding)
    ) fail('SEALED_LAUNCH_RECEIPT_COMMITMENT_INVALID');
  }
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
  });
}

export function classifySealedLaunchPagesSources(sources) {
  const result = verifySealedLaunchSources(sources, 'checked-in');
  return result.phase === 'activation' ? 'sealed-g002' : 'sealed-launch-blocked';
}

export function verifySealedLaunchActivationHistory({
  bindingSource,
  candidateActivationCommit,
  isAncestor,
}) {
  const binding = parseBinding(bindingSource);
  verifyActivationBinding(binding);
  if (
    !COMMIT.test(candidateActivationCommit ?? '')
    || candidateActivationCommit === binding.preparationSourceCommit
    || typeof isAncestor !== 'function'
    || isAncestor(
      GENESIS_001_SOURCE_BASELINE_COMMIT,
      candidateActivationCommit,
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
  const match = /^--phase=(preparation|activation|checked-in|pages)$/u.exec(
    arguments_[0],
  );
  if (match === null) fail('SEALED_LAUNCH_ARGUMENT_INVALID');
  const phase = match[1];
  if (phase !== 'pages') {
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
