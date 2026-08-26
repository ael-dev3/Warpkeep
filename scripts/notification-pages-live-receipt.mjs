import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  parseDocument,
} from '../services/auth-bridge/node_modules/yaml/dist/index.js';
import {
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableStatement,
  ModifierFlags,
  NodeFlags,
  SyntaxKind,
} from '../services/auth-bridge/node_modules/typescript/dist/ast/index.js';
import {
  createVirtualFileSystem,
} from '../services/auth-bridge/node_modules/typescript/dist/api/fs.js';
import {
  API as TypeScriptAPI,
} from '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js';

import {
  DEFAULT_AUTH_BRIDGE_URL,
  parseAuthBridgeReleaseAttestation,
} from './auth-bridge-config-attestation.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS,
  canonicalAuthBridgeReleaseAttestationDigest,
  fetchFreshAuthBridgeReleaseAttestation,
} from './auth-bridge-notification-prepared-receipt.mjs';
import {
  inspectNotificationPagesPrivateHandoff,
  NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
  NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW,
} from './notification-pages-private-handoff.mjs';
import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
  productionAdminRecordedOwnerIsDead,
  requireCurrentProductionAdminProcessIdentity,
} from './production-admin-token-budget.mjs';
import { verifyFrontend } from './verify-alpha-production.mjs';
import {
  productionPlayerCanaryActivationAuthorityDigest,
  requireFreshProductionPlayerCanaryActivationAuthority,
} from './production-player-canary-receipt.mjs';

export const NOTIFICATION_PAGES_LIVE_RECEIPT_KIND =
  'warpkeep-notification-pages-live-v1';
export const NOTIFICATION_PAGES_LIVE_STATE_CHILD =
  'notification-pages-live-receipts-v1';
export const NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN = 'https://warpkeep.com';
export const NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN = DEFAULT_AUTH_BRIDGE_URL;
export const NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS = Object.freeze([
  '.github/workflows/deploy-pages.yml',
  'index.html',
  'package-lock.json',
  'package.json',
  'public',
  'scripts/admission-notifications',
  'scripts/access-requests',
  'scripts/alpha-activation-controls.ts',
  'scripts/alpha-v10-activation-controls.ts',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/auth-bridge-notification-prepared-receipt.mjs',
  'scripts/auth-bridge-notification-prepared-release-binding.d.mts',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/entry-agreement-policy.mjs',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/atlas',
  'scripts/greater-realm-production-bootstrap.mjs',
  'scripts/greater-realm-downstream-release-policy.ts',
  'scripts/greater-realm-production-pages-evidence-operator.ts',
  'scripts/greater-realm-production-pages-evidence.ts',
  'scripts/greater-realm-production-provenance.ts',
  'scripts/greater-realm-production-relocation-core.ts',
  'scripts/greater-realm-production-transport.ts',
  'scripts/greater-realm-production-verifier-core.ts',
  'scripts/greater-realm-production-verifier.ts',
  'scripts/greater-realm-cutover-write-control.ts',
  'scripts/greater-realm-cutover-operation-journal.ts',
  'scripts/greater-realm-cutover-receipts.ts',
  'scripts/greater-realm-production-immutable-artifact.ts',
  'scripts/greater-realm-openat.ts',
  'scripts/greater-realm-openat-helper.py',
  'scripts/greater-realm-production-publisher-core.ts',
  'scripts/publish-spacetime-dev.mjs',
  'scripts/spacetime-additive-migration-proof.mjs',
  'scripts/spacetime-cli-attestation.mjs',
  'scripts/spacetime-publish-receipt.mjs',
  'scripts/spacetime-table-schema-attestation.mjs',
  'scripts/verify-spacetime-additive-migration.mjs',
  'scripts/hermes-admin.ts',
  'scripts/hermes-machine-output.ts',
  'scripts/founder-admission-authority.ts',
  'scripts/notification-pages-private-handoff.mjs',
  'scripts/notification-pages-private-handoff.d.mts',
  'scripts/notification-pages-live-receipt.d.mts',
  'scripts/notification-pages-live-receipt.mjs',
  'scripts/notification-pages-live-hermes-authority.mjs',
  'scripts/notification-pages-live-release-binding.d.mts',
  'scripts/notification-pages-live-release-binding.mjs',
  'scripts/notification-pages-private-release-binding.d.mts',
  'scripts/notification-pages-private-release-binding.mjs',
  'scripts/profiles/farcaster-profile-policy.ts',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/profiles/profile-transport.ts',
  'scripts/production-admin-token-budget.mjs',
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-command-authority.mjs',
  'scripts/production-player-canary-core.ts',
  'scripts/production-player-canary-deploy-authority.mjs',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-operator-journal.mjs',
  'scripts/production-player-canary-operator.mjs',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/production-player-canary-receipt.mjs',
  'scripts/production-player-canary-release-binding.mjs',
  'scripts/notification-pages-private-deploy-operator.mjs',
  'scripts/qa-observer/local-vite-fs-deny.mjs',
  'scripts/validate-pages-deploy-config.mjs',
  'scripts/verify-alpha-production.mjs',
  'scripts/verify-greater-realm-release-gates.mjs',
  'services/auth-bridge',
  'spacetimedb',
  'src',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]);

// Successor Pages releases may legitimately carry unrelated game changes.
// Only the reviewed notification presentation, build, and ongoing authority
// surfaces inherit a predecessor without a newly authenticated staged handoff.
// Runtime imports for Hermes and active evidence are additionally derived and
// checked below from their pinned source commits.
export const NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS = Object.freeze([
  '.github/workflows/deploy-pages.yml',
  'index.html',
  'package-lock.json',
  'package.json',
  'public/.well-known/farcaster.json',
  'public/warpkeep-boot.css',
  'public/warpkeep-noscript.css',
  'scripts/access-requests',
  'scripts/admission-notifications',
  'scripts/alpha-activation-controls.ts',
  'scripts/alpha-v10-activation-controls.ts',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/auth-bridge-notification-prepared-receipt.mjs',
  'scripts/auth-bridge-notification-prepared-release-binding.d.mts',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/entry-agreement-policy.mjs',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/founder-admission-authority.ts',
  'scripts/greater-realm-downstream-release-policy.ts',
  'scripts/hermes-admin.ts',
  'scripts/hermes-machine-output.ts',
  'scripts/notification-pages-live-hermes-authority.mjs',
  'scripts/notification-pages-live-receipt.d.mts',
  'scripts/notification-pages-live-receipt.mjs',
  'scripts/notification-pages-live-release-binding.d.mts',
  'scripts/notification-pages-live-release-binding.mjs',
  'scripts/notification-pages-private-release-binding.d.mts',
  'scripts/notification-pages-private-release-binding.mjs',
  'scripts/notification-pages-private-handoff.d.mts',
  'scripts/notification-pages-private-handoff.mjs',
  'scripts/production-admin-token-budget.mjs',
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-core.ts',
  'scripts/production-player-canary-deploy-authority.mjs',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/production-player-canary-receipt.mjs',
  'scripts/production-player-canary-release-binding.mjs',
  'scripts/notification-pages-private-deploy-operator.mjs',
  'scripts/profiles/farcaster-profile-policy.ts',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/profiles/profile-transport.ts',
  'scripts/qa-observer/local-vite-fs-deny.mjs',
  'scripts/validate-pages-deploy-config.mjs',
  'scripts/verify-alpha-production.mjs',
  'scripts/verify-greater-realm-release-gates.mjs',
  'spacetimedb/src/alphaActivationPolicy.ts',
  'spacetimedb/src/alphaV10ActivationPolicy.ts',
  'spacetimedb/src/entryAgreementPolicy.ts',
  'spacetimedb/src/profileAuthorityPolicy.ts',
  'spacetimedb/src/resourceAuthorityPolicy.ts',
  'src/build',
  'src/App.tsx',
  'src/components/WarpkeepExperience.css',
  'src/components/WarpkeepExperience.tsx',
  'src/components/auth',
  'src/components/errors',
  'src/components/menu/WarpkeepMainMenu.css',
  'src/components/menu/WarpkeepMainMenu.tsx',
  'src/farcaster',
  'src/main.tsx',
  'src/security',
  'src/spacetime/module_bindings',
  'src/spacetime/WarpkeepSpacetimeProvider.tsx',
  'src/spacetime/warpkeepBackendTypes.ts',
  'src/spacetime/warpkeepConfig.ts',
  'src/styles/global.css',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]);

export const NOTIFICATION_PAGES_PRODUCTION_PLAYER_CANARY_ACTIVATION_PATHS =
  Object.freeze([
    'CHANGELOG.md',
    'README.md',
    'index.html',
    'package-lock.json',
    'package.json',
    'public/.well-known/farcaster.json',
    'scripts/farcaster-miniapp-contract.mjs',
    'scripts/greater-realm-downstream-release-policy.ts',
    'scripts/production-player-canary-release-binding.mjs',
    'src/components/menu/latestPatchNotes.ts',
    'src/greater-realm/greaterRealmTransport.ts',
    'src/spacetime/greaterRealmProviderBridge.ts',
    'tests/buildInfo.test.ts',
    'tests/deploymentBase.test.ts',
    'tests/farcasterMiniAppContract.test.ts',
    'tests/latestPatchNotes.test.ts',
    'tests/menuFarcasterAuthIntegration.test.tsx',
    'tests/menuMainMenu.test.tsx',
  ]);

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 32 * 1024;
const MAX_CHAIN_GENERATION = 255;
// Every retained generation owns content, source, and root/successor records.
// 1,024 keeps the complete 0..255 chain reachable while reserving bounded
// headroom for the two-file predeploy authority and hard-link publication.
const MAX_DIRECTORY_ENTRIES = 1024;
const MAX_FOUNDERS = 600;
const MAX_FRONTEND_DOCUMENT_BYTES = 1_000_000;
const MAX_FRONTEND_ASSET_BYTES = 16_000_000;
const MAX_FRONTEND_AGGREGATE_BYTES = 64_000_000;
const MAX_FRONTEND_ASSET_COUNT = 64;
const MAX_GIT_TREE_INVENTORY_BYTES = 2 * 1024 * 1024;
const MAX_GIT_TREE_ENTRIES = 8_192;
const MAX_GIT_SOURCE_FILES = 4_096;
const MAX_GIT_SOURCE_FILE_BYTES = 512 * 1024;
const MAX_GIT_SOURCE_AGGREGATE_BYTES = 32 * 1024 * 1024;
const MAX_PRESENTATION_SOURCE_FILES = 512;
const MAX_PRESENTATION_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_CHECKOUT_TREE_BYTES = 4 * 1024 * 1024;
const MAX_CHECKOUT_TREE_ENTRIES = 4_096;
const MAX_CHECKOUT_AGGREGATE_BYTES = 256 * 1024 * 1024;
const TEMPORARY_STALE_MILLISECONDS = 10 * 60 * 1_000;
const NOTIFICATIONS_PRESENTATION_MARKER =
  'warpkeep-admission-notifications-presentation-enabled-v1';
const DEPLOYED_BUILD_SHA_SENTINEL =
  /\b(VITE_WARPKEEP_BUILD_SHA|buildSha):(["'`])([0-9a-f]{40})\2/gu;
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const GIT_SOURCE_PATH = /\.(?:[cm]?[jt]s|[jt]sx|css)$/u;
const GIT_TYPESCRIPT_SOURCE_PATH = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const GIT_REGULAR_FILE_MODE = /^(?:100644|100755)$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RECEIPT_FILE = /^notification-pages-live-([0-9a-f]{64})\.json$/u;
const TEMPORARY_FILE = /^\.notification-pages-live-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const SOURCE_FILE = /^notification-pages-live-source-([0-9a-f]{40})\.json$/u;
const SOURCE_TEMPORARY_FILE = /^\.notification-pages-live-source-([0-9a-f]{40})-([0-9a-f]{24})\.json\.tmp$/u;
const SUCCESSOR_FILE = /^notification-pages-live-successor-([0-9a-f]{64})\.json$/u;
const SUCCESSOR_TEMPORARY_FILE = /^\.notification-pages-live-successor-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const ROOT_FILE = 'notification-pages-live-root.json';
const ROOT_TEMPORARY_FILE = /^\.notification-pages-live-root-([0-9a-f]{24})\.json\.tmp$/u;
const CANDIDATE_FILE = /^notification-pages-candidate-([0-9a-f]{64})\.json$/u;
const CANDIDATE_TEMPORARY_FILE = /^\.notification-pages-candidate-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const CANDIDATE_CLAIM_FILE = /^notification-pages-candidate-claim-([0-9a-f]{64})\.json$/u;
const CANDIDATE_CLAIM_TEMPORARY_FILE = /^\.notification-pages-candidate-claim-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const CANDIDATE_KIND = 'warpkeep-notification-pages-candidate-authority-v1';
const WRITER_LOCK_FILE =
  '.notification-pages-live-receipts-v1-writer-lock.json';
const WRITER_LOCK_TEMPORARY_FILE =
  /^\.notification-pages-live-receipts-v1-writer-slot-([0-9a-f]{2})\.json$/u;
const WRITER_LOCK_LIFETIME_MILLISECONDS = 5 * 60 * 1_000;
const WRITER_LOCK_WAIT_MILLISECONDS = 25;
const WRITER_LOCK_WAIT_MAXIMUM_MILLISECONDS = 30_000;
const MAX_WRITER_LOCK_TEMPORARIES = 256;
let writerLockSequence = 0;
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'recordedAt',
  'repository',
  'handoff',
  'chain',
  'pages',
  'bridge',
  'sourceRelease',
  'expectedFounderCount',
  'preparedBinding',
]);
const HANDOFF_KEYS = Object.freeze([
  'digest',
  'keyId',
  'workflow',
  'workflowRunId',
  'workflowRunAttempt',
  'createdAt',
  'expiresAt',
  'preparedReceiptDigest',
  'activeV17EvidenceDigest',
  'deployedModuleReceiptDigest',
  'activeEvidenceMaximumAgeMilliseconds',
]);
const CHAIN_KEYS = Object.freeze([
  'generation',
  'previousReceiptDigest',
  'previousPagesSourceCommit',
  'candidateAuthorityDigest',
]);
const PAGES_KEYS = Object.freeze([
  'origin',
  'sourceCommit',
  'liveBuildSha',
  'notificationPresentationDigest',
  'notificationPresentationAssetCount',
  'notificationsPresentationEnabled',
  'hermesExecutionApprovedAtActivation',
]);
const BRIDGE_KEYS = Object.freeze([
  'origin',
  'sourceCommit',
  'liveAttestationDigest',
  'liveAttestation',
]);
const SOURCE_RELEASE_KEYS = Object.freeze([
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'expectedReleaseSha256',
  'moduleSourceCommit',
]);
const PREPARED_BINDING_KEYS = Object.freeze([
  'receiptDigest',
  'bridgeOrigin',
  'bridgeSourceCommit',
  'notificationDeliveryContractDigest',
  'notificationClientCount',
  'notificationDeliveryEnabled',
  'notificationTransportConfigured',
  'admissionNotificationStoreConfigured',
  'publicAuthEnabledBefore',
  'publicAuthEnabledAfter',
  'accessExpectedFidRequiredBefore',
  'accessExpectedFidRequiredAfter',
  'hermesExecutionApproved',
  'pagesPresentationEnabled',
  'liveAttestationDigest',
  'preparedAt',
  'expiresAt',
]);
const HANDOFF_EXPECTATION_KEYS = Object.freeze([
  'handoffPath',
  'keyPath',
  'expectedHandoffDigest',
  'expectedKeyId',
  'expectedWorkflowRunId',
  'expectedWorkflowRunAttempt',
  'expectedPagesSourceCommit',
  'expectedFounderCount',
  'expectedActiveEvidenceMaximumAgeMilliseconds',
  'expectedPreparedReceiptDigest',
  'expectedActiveV17EvidenceDigest',
  'expectedDeployedModuleReceiptDigest',
  'expectedBridgeSourceCommit',
]);
const CANDIDATE_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'recordedAt',
  'repository',
  'predecessorReceiptDigest',
  'predecessorPagesSourceCommit',
  'chainRootReceiptDigest',
  'chainRootPagesSourceCommit',
  'candidatePagesSourceCommit',
  'predeployNotificationPresentationDigest',
  'predeployLiveBridgeAttestationDigest',
  'protectedPathsDigest',
  'stagedHandoffBinding',
  'stagedHandoffBindingDigest',
  'productionPlayerCanaryActivationAuthorityDigest',
]);
const STAGED_HANDOFF_BINDING_KEYS = Object.freeze([
  'handoff',
  'pagesSourceCommit',
  'bridgeSourceCommit',
  'sourceRelease',
  'expectedFounderCount',
  'preparedBinding',
  'liveAttestation',
]);
const STAGED_HANDOFF_AUTHORIZED_PATHS = Object.freeze([
  '.github/workflows/deploy-pages.yml',
  'index.html',
  'package-lock.json',
  'package.json',
  'public/.well-known/farcaster.json',
  'scripts/admission-notifications',
  'services/auth-bridge',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/auth-bridge-notification-prepared-receipt.mjs',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/hermes-admin.ts',
  'src',
  'vite.config.ts',
]);
const NON_STAGED_PROTECTED_PATHS = Object.freeze(
  NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS.filter(
    path => !STAGED_HANDOFF_AUTHORIZED_PATHS.some(authorizedPath =>
      path === authorizedPath || path.startsWith(`${authorizedPath}/`)),
  ),
);
const ACTIVE_EVIDENCE_LITERAL_DEPENDENCIES = Object.freeze([
  'scripts/greater-realm-openat-helper.py',
  'scripts/greater-realm-production-publisher-core.ts',
  'scripts/verify-spacetime-additive-migration.mjs',
]);
const ACTIVE_EVIDENCE_IMPORT_ROOTS = Object.freeze([
  'scripts/greater-realm-production-pages-evidence-operator.ts',
  'scripts/greater-realm-production-pages-evidence.ts',
  'scripts/greater-realm-production-provenance.ts',
  'scripts/greater-realm-production-transport.ts',
  'scripts/greater-realm-production-verifier-core.ts',
  'scripts/greater-realm-production-verifier.ts',
]);
const HERMES_AUTHORITY_IMPORT_ROOTS = Object.freeze([
  'scripts/hermes-admin.ts',
]);
const RELEASE_BINDING_SOURCE_PATH =
  'scripts/notification-pages-live-release-binding.mjs';
const PREPARED_BINDING_SOURCE_PATH =
  'scripts/auth-bridge-notification-prepared-release-binding.mjs';
const PRIVATE_BINDING_SOURCE_PATH =
  'scripts/notification-pages-private-release-binding.mjs';
const PRODUCTION_PLAYER_CANARY_BINDING_SOURCE_PATH =
  'scripts/production-player-canary-release-binding.mjs';
const PRESENTATION_SOURCE_ROOT = 'src/main.tsx';
const PRESENTATION_REALM_EXEMPTION = Object.freeze({
  importer: 'src/components/WarpkeepExperience.tsx',
  specifier: './realm/RealmMapScreen',
  resolved: 'src/components/realm/RealmMapScreen.tsx',
});
const PRESENTATION_BUILD_INPUTS = Object.freeze([
  '.github/workflows/deploy-pages.yml',
  'index.html',
  'package-lock.json',
  'package.json',
  'public/.well-known/farcaster.json',
  'public/apple-touch-icon-180-fe27e8dc1c97cc36.png',
  'public/audio/warpkeep-lowlands-theme.mp3',
  'public/audio/warpkeep-menu-theme.mp3',
  'public/audio/warpkeep-title-theme-a.mp3',
  'public/audio/warpkeep-title-theme-b.mp3',
  'public/favicon-64-7b82ca973fe757f5.png',
  'public/images/menu/warpkeep-menu-poster-v2.webp',
  'public/images/miniapp/warpkeep-embed-1200x800-a07da89d7df56da9.png',
  'public/images/miniapp/warpkeep-icon-1024-d1b42d20f03c2905.png',
  'public/images/miniapp/warpkeep-portrait-realm-alpha-0.3.43-1284x2778.png',
  'public/images/miniapp/warpkeep-portrait-resource-alpha-0.3.43-1284x2778.png',
  'public/images/miniapp/warpkeep-portrait-worker-alpha-0.3.43-1284x2778.png',
  'public/images/miniapp/warpkeep-realm-card-1200x630-d800619debbded6f.png',
  'public/images/miniapp/warpkeep-splash-200-117256827545daa1.png',
  'public/models/title/warpkeep-title-compact.glb',
  'public/models/title/warpkeep-title-high.glb',
  'public/video/warpkeep-menu-loop-v2.mp4',
  'public/warpkeep-boot.css',
  'public/warpkeep-noscript.css',
  'src/vite-env.d.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]);

export class NotificationPagesLiveReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesLiveReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesLiveReceiptError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactOrderedKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).join('\0') === expected.join('\0');
}

function exactDate(value, code) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(code);
  return value.getTime();
}

function strictUtc(value, code) {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function validIdentifier(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validFounderCount(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_FOUNDERS;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function canonicalRepositoryRoot(repositoryRoot) {
  if (
    typeof repositoryRoot !== 'string'
    || !isAbsolute(repositoryRoot)
    || resolve(repositoryRoot) !== repositoryRoot
  ) fail('NOTIFICATION_PAGES_LIVE_REPOSITORY_INVALID');
  try {
    const metadata = lstatSync(repositoryRoot);
    const canonical = realpathSync(repositoryRoot);
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || canonical !== repositoryRoot
      || canonical !== REPOSITORY_ROOT
    ) fail('NOTIFICATION_PAGES_LIVE_REPOSITORY_INVALID');
    return canonical;
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_REPOSITORY_INVALID');
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_SYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPrivateDirectory(path, expectedParent) {
  try {
    const metadata = lstatSync(path);
    const followed = statSync(path);
    const canonical = realpathSync(path);
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || !followed.isDirectory()
      || (process.getuid !== undefined && metadata.uid !== process.getuid())
      || (followed.mode & 0o7777) !== DIRECTORY_MODE
      || canonical !== path
      || (expectedParent !== undefined && dirname(canonical) !== expectedParent)
    ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
    return canonical;
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
  }
}

function validateDirectoryRequest(directory, repositoryRoot) {
  if (
    typeof directory !== 'string'
    || !isAbsolute(directory)
    || resolve(directory) !== directory
  ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_NOT_ABSOLUTE');
  const repository = canonicalRepositoryRoot(repositoryRoot);
  try {
    assertProductionAdminTrustedAncestors(directory);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_ANCESTOR_INVALID');
  }
  if (inside(repository, directory) || inside(directory, repository)) {
    fail('NOTIFICATION_PAGES_LIVE_REPOSITORY_OVERLAP');
  }
  const parent = dirname(directory);
  const canonicalParent = assertPrivateDirectory(parent);
  if (
    inside(repository, canonicalParent)
    || inside(canonicalParent, repository)
    || dirname(directory) !== canonicalParent
  ) fail('NOTIFICATION_PAGES_LIVE_REPOSITORY_OVERLAP');
  if (existsSync(directory)) assertPrivateDirectory(directory, canonicalParent);
  return Object.freeze({ repository, parent: canonicalParent });
}

function stableFile(path, expectedNlink, code) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.nlink !== expectedNlink
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
      || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
    ) {
      bytes.fill(0);
      fail(code);
    }
    return Object.freeze({ bytes, dev: before.dev, ino: before.ino });
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseSourceRelease(value) {
  if (
    !exactOrderedKeys(value, SOURCE_RELEASE_KEYS)
    || typeof value.atlasSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.atlasSourceCommit)
    || !validIdentifier(value.atlasId)
    || !validIdentifier(value.publicReleaseId)
    || typeof value.expectedReleaseSha256 !== 'string'
    || !SHA256.test(value.expectedReleaseSha256)
    || typeof value.moduleSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.moduleSourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_SOURCE_RELEASE_INVALID');
  return Object.freeze({
    atlasSourceCommit: value.atlasSourceCommit,
    atlasId: value.atlasId,
    publicReleaseId: value.publicReleaseId,
    expectedReleaseSha256: value.expectedReleaseSha256,
    moduleSourceCommit: value.moduleSourceCommit,
  });
}

function parsePreparedBinding(value) {
  if (
    !exactOrderedKeys(value, PREPARED_BINDING_KEYS)
    || typeof value.receiptDigest !== 'string'
    || !SHA256.test(value.receiptDigest)
    || value.bridgeOrigin !== NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN
    || typeof value.bridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.bridgeSourceCommit)
    || typeof value.notificationDeliveryContractDigest !== 'string'
    || !SHA256.test(value.notificationDeliveryContractDigest)
    || value.notificationClientCount !== 1
    || value.notificationDeliveryEnabled !== true
    || value.notificationTransportConfigured !== true
    || value.admissionNotificationStoreConfigured !== true
    || typeof value.publicAuthEnabledBefore !== 'boolean'
    || value.publicAuthEnabledAfter !== value.publicAuthEnabledBefore
    || typeof value.accessExpectedFidRequiredBefore !== 'boolean'
    || value.accessExpectedFidRequiredAfter
      !== value.accessExpectedFidRequiredBefore
    || value.hermesExecutionApproved !== false
    || value.pagesPresentationEnabled !== false
    || typeof value.liveAttestationDigest !== 'string'
    || !SHA256.test(value.liveAttestationDigest)
  ) fail('NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_INVALID');
  const preparedAt = strictUtc(
    value.preparedAt,
    'NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_INVALID',
  );
  const expiresAt = strictUtc(
    value.expiresAt,
    'NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_INVALID',
  );
  if (Date.parse(expiresAt) <= Date.parse(preparedAt)) {
    fail('NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_INVALID');
  }
  if (
    Date.parse(expiresAt) - Date.parse(preparedAt)
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_INVALID');
  return Object.freeze({ ...value, preparedAt, expiresAt });
}

export function parseNotificationPagesLiveReceipt(value, { now } = {}) {
  if (
    !exactOrderedKeys(value, RECEIPT_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== NOTIFICATION_PAGES_LIVE_RECEIPT_KIND
    || value.repository !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY
    || !validFounderCount(value.expectedFounderCount)
  ) fail('NOTIFICATION_PAGES_LIVE_RECEIPT_SHAPE_INVALID');
  const recordedAt = strictUtc(
    value.recordedAt,
    'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID',
  );
  if (now !== undefined) {
    const current = exactDate(now, 'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID');
    if (Date.parse(recordedAt) > current) {
      fail('NOTIFICATION_PAGES_LIVE_RECEIPT_NOT_YET_VALID');
    }
  }
  const handoff = value.handoff;
  if (
    !exactOrderedKeys(handoff, HANDOFF_KEYS)
    || typeof handoff.digest !== 'string'
    || !SHA256.test(handoff.digest)
    || typeof handoff.keyId !== 'string'
    || !SHA256.test(handoff.keyId)
    || handoff.workflow !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW
    || typeof handoff.workflowRunId !== 'string'
    || !RUN_ID.test(handoff.workflowRunId)
    || typeof handoff.workflowRunAttempt !== 'string'
    || !RUN_ID.test(handoff.workflowRunAttempt)
    || typeof handoff.preparedReceiptDigest !== 'string'
    || !SHA256.test(handoff.preparedReceiptDigest)
    || typeof handoff.activeV17EvidenceDigest !== 'string'
    || !SHA256.test(handoff.activeV17EvidenceDigest)
    || typeof handoff.deployedModuleReceiptDigest !== 'string'
    || !SHA256.test(handoff.deployedModuleReceiptDigest)
    || !Number.isSafeInteger(handoff.activeEvidenceMaximumAgeMilliseconds)
    || handoff.activeEvidenceMaximumAgeMilliseconds < 1
    || handoff.activeEvidenceMaximumAgeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_LIVE_HANDOFF_BINDING_INVALID');
  const handoffCreatedAt = strictUtc(
    handoff.createdAt,
    'NOTIFICATION_PAGES_LIVE_HANDOFF_BINDING_INVALID',
  );
  const handoffExpiresAt = strictUtc(
    handoff.expiresAt,
    'NOTIFICATION_PAGES_LIVE_HANDOFF_BINDING_INVALID',
  );
  if (
    Date.parse(handoffExpiresAt) <= Date.parse(handoffCreatedAt)
    || Date.parse(handoffExpiresAt) - Date.parse(handoffCreatedAt)
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
    || Date.parse(recordedAt) < Date.parse(handoffCreatedAt)
  ) fail('NOTIFICATION_PAGES_LIVE_HANDOFF_BINDING_INVALID');

  const chain = value.chain;
  if (
    !exactOrderedKeys(chain, CHAIN_KEYS)
    || !Number.isSafeInteger(chain.generation)
    || chain.generation < 0
    || chain.generation > MAX_CHAIN_GENERATION
    || (
      chain.generation === 0
        ? (
          chain.previousReceiptDigest !== null
          || chain.previousPagesSourceCommit !== null
          || chain.candidateAuthorityDigest !== null
        )
        : (
          typeof chain.previousReceiptDigest !== 'string'
          || !SHA256.test(chain.previousReceiptDigest)
          || typeof chain.previousPagesSourceCommit !== 'string'
          || !SOURCE_COMMIT.test(chain.previousPagesSourceCommit)
          || typeof chain.candidateAuthorityDigest !== 'string'
          || !SHA256.test(chain.candidateAuthorityDigest)
        )
    )
  ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
  if (
    chain.generation === 0
    && Date.parse(recordedAt) > Date.parse(handoffExpiresAt)
  ) fail('NOTIFICATION_PAGES_LIVE_HANDOFF_BINDING_INVALID');

  const pages = value.pages;
  if (
    !exactOrderedKeys(pages, PAGES_KEYS)
    || pages.origin !== NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
    || typeof pages.sourceCommit !== 'string'
    || !SOURCE_COMMIT.test(pages.sourceCommit)
    || pages.liveBuildSha !== pages.sourceCommit
    || typeof pages.notificationPresentationDigest !== 'string'
    || !SHA256.test(pages.notificationPresentationDigest)
    || !Number.isSafeInteger(pages.notificationPresentationAssetCount)
    || pages.notificationPresentationAssetCount < 1
    || pages.notificationPresentationAssetCount > MAX_FRONTEND_ASSET_COUNT
    || pages.notificationsPresentationEnabled !== true
    || pages.hermesExecutionApprovedAtActivation !== false
  ) fail('NOTIFICATION_PAGES_LIVE_PAGES_BINDING_INVALID');

  const bridge = value.bridge;
  if (
    !exactOrderedKeys(bridge, BRIDGE_KEYS)
    || bridge.origin !== NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN
    || typeof bridge.sourceCommit !== 'string'
    || !SOURCE_COMMIT.test(bridge.sourceCommit)
    || typeof bridge.liveAttestationDigest !== 'string'
    || !SHA256.test(bridge.liveAttestationDigest)
  ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_BINDING_INVALID');
  let liveAttestation;
  try {
    liveAttestation = parseAuthBridgeReleaseAttestation(bridge.liveAttestation);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_BRIDGE_BINDING_INVALID');
  }
  const liveAttestationDigest = canonicalAuthBridgeReleaseAttestationDigest(
    liveAttestation,
  );
  if (
    bridge.sourceCommit !== liveAttestation.bridgeSourceCommit
    || bridge.liveAttestationDigest !== liveAttestationDigest
  ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_BINDING_INVALID');

  const sourceRelease = parseSourceRelease(value.sourceRelease);
  const preparedBinding = parsePreparedBinding(value.preparedBinding);
  if (
    preparedBinding.receiptDigest !== handoff.preparedReceiptDigest
    || preparedBinding.bridgeOrigin !== bridge.origin
    || preparedBinding.bridgeSourceCommit !== bridge.sourceCommit
    || preparedBinding.liveAttestationDigest !== bridge.liveAttestationDigest
    || preparedBinding.notificationDeliveryContractDigest
      !== liveAttestation.notificationDeliveryContractDigest
    || preparedBinding.notificationClientCount
      !== liveAttestation.notificationClientCount
    || preparedBinding.notificationDeliveryEnabled
      !== liveAttestation.notificationDeliveryEnabled
    || preparedBinding.notificationTransportConfigured
      !== liveAttestation.notificationTransportConfigured
    || preparedBinding.admissionNotificationStoreConfigured
      !== liveAttestation.admissionNotificationStoreConfigured
    || preparedBinding.publicAuthEnabledBefore
      !== liveAttestation.publicAuthEnabled
    || preparedBinding.publicAuthEnabledAfter
      !== liveAttestation.publicAuthEnabled
    || preparedBinding.accessExpectedFidRequiredBefore
      !== liveAttestation.accessExpectedFidRequired
    || preparedBinding.accessExpectedFidRequiredAfter
      !== liveAttestation.accessExpectedFidRequired
    || Date.parse(preparedBinding.preparedAt) > Date.parse(handoffCreatedAt)
    || Date.parse(handoffExpiresAt) > Date.parse(preparedBinding.expiresAt)
  ) fail('NOTIFICATION_PAGES_LIVE_CROSS_BINDING_INVALID');

  return Object.freeze({
    schemaVersion: 1,
    kind: NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
    recordedAt,
    repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
    handoff: Object.freeze({ ...handoff, createdAt: handoffCreatedAt, expiresAt: handoffExpiresAt }),
    chain: Object.freeze({ ...chain }),
    pages: Object.freeze({ ...pages }),
    bridge: Object.freeze({
      origin: bridge.origin,
      sourceCommit: bridge.sourceCommit,
      liveAttestationDigest: bridge.liveAttestationDigest,
      liveAttestation,
    }),
    sourceRelease,
    expectedFounderCount: value.expectedFounderCount,
    preparedBinding,
  });
}

function canonicalReceiptBytes(receipt) {
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_RECEIPT_BYTES) {
    bytes.fill(0);
    fail('NOTIFICATION_PAGES_LIVE_RECEIPT_SIZE_INVALID');
  }
  return bytes;
}

function protectedPathsDigest() {
  return createHash('sha256')
    .update('warpkeep-notification-pages-protected-paths-v1\0', 'utf8')
    .update(JSON.stringify(NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS), 'utf8')
    .digest('hex');
}

function parseStandaloneHandoffBinding(value) {
  if (
    !exactOrderedKeys(value, HANDOFF_KEYS)
    || !SHA256.test(value.digest)
    || !SHA256.test(value.keyId)
    || value.workflow !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW
    || !RUN_ID.test(value.workflowRunId)
    || !RUN_ID.test(value.workflowRunAttempt)
    || !SHA256.test(value.preparedReceiptDigest)
    || !SHA256.test(value.activeV17EvidenceDigest)
    || !SHA256.test(value.deployedModuleReceiptDigest)
    || !Number.isSafeInteger(value.activeEvidenceMaximumAgeMilliseconds)
    || value.activeEvidenceMaximumAgeMilliseconds < 1
    || value.activeEvidenceMaximumAgeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID');
  const createdAt = strictUtc(
    value.createdAt,
    'NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID',
  );
  const expiresAt = strictUtc(
    value.expiresAt,
    'NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID',
  );
  if (
    Date.parse(expiresAt) <= Date.parse(createdAt)
    || Date.parse(expiresAt) - Date.parse(createdAt)
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID');
  return Object.freeze({ ...value, createdAt, expiresAt });
}

function parseStagedHandoffBinding(value, candidatePagesSourceCommit) {
  if (
    !exactOrderedKeys(value, STAGED_HANDOFF_BINDING_KEYS)
    || value.pagesSourceCommit !== candidatePagesSourceCommit
    || !SOURCE_COMMIT.test(value.pagesSourceCommit)
    || !SOURCE_COMMIT.test(value.bridgeSourceCommit)
    || !validFounderCount(value.expectedFounderCount)
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID');
  const handoff = parseStandaloneHandoffBinding(value.handoff);
  const sourceRelease = parseSourceRelease(value.sourceRelease);
  const preparedBinding = parsePreparedBinding(value.preparedBinding);
  let liveAttestation;
  try {
    liveAttestation = parseAuthBridgeReleaseAttestation(value.liveAttestation);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID');
  }
  const liveAttestationDigest = canonicalAuthBridgeReleaseAttestationDigest(
    liveAttestation,
  );
  if (
    value.bridgeSourceCommit !== liveAttestation.bridgeSourceCommit
    || preparedBinding.bridgeSourceCommit !== value.bridgeSourceCommit
    || preparedBinding.receiptDigest !== handoff.preparedReceiptDigest
    || preparedBinding.liveAttestationDigest !== liveAttestationDigest
    || preparedBinding.notificationDeliveryContractDigest
      !== liveAttestation.notificationDeliveryContractDigest
    || preparedBinding.notificationClientCount
      !== liveAttestation.notificationClientCount
    || preparedBinding.notificationDeliveryEnabled
      !== liveAttestation.notificationDeliveryEnabled
    || preparedBinding.notificationTransportConfigured
      !== liveAttestation.notificationTransportConfigured
    || preparedBinding.admissionNotificationStoreConfigured
      !== liveAttestation.admissionNotificationStoreConfigured
    || preparedBinding.publicAuthEnabledAfter
      !== liveAttestation.publicAuthEnabled
    || preparedBinding.accessExpectedFidRequiredAfter
      !== liveAttestation.accessExpectedFidRequired
    || Date.parse(preparedBinding.preparedAt) > Date.parse(handoff.createdAt)
    || Date.parse(handoff.expiresAt) > Date.parse(preparedBinding.expiresAt)
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_BINDING_INVALID');
  return Object.freeze({
    handoff,
    pagesSourceCommit: value.pagesSourceCommit,
    bridgeSourceCommit: value.bridgeSourceCommit,
    sourceRelease,
    expectedFounderCount: value.expectedFounderCount,
    preparedBinding,
    liveAttestation,
  });
}

function stagedHandoffBindingDigest(binding) {
  return createHash('sha256')
    .update('warpkeep-notification-pages-staged-binding-v1\0', 'utf8')
    .update(JSON.stringify(binding), 'utf8')
    .digest('hex');
}

function durableStagedHandoffBinding(stagedHandoff) {
  return parseStagedHandoffBinding({
    handoff: {
      digest: stagedHandoff.handoffDigest,
      keyId: stagedHandoff.keyId,
      workflow: NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW,
      workflowRunId: stagedHandoff.workflowRunId,
      workflowRunAttempt: stagedHandoff.workflowRunAttempt,
      createdAt: stagedHandoff.createdAt,
      expiresAt: stagedHandoff.expiresAt,
      preparedReceiptDigest: stagedHandoff.preparedReceiptDigest,
      activeV17EvidenceDigest: stagedHandoff.activeV17EvidenceDigest,
      deployedModuleReceiptDigest: stagedHandoff.deployedModuleReceiptDigest,
      activeEvidenceMaximumAgeMilliseconds:
        stagedHandoff.activeEvidenceMaximumAgeMilliseconds,
    },
    pagesSourceCommit: stagedHandoff.pagesSourceCommit,
    bridgeSourceCommit: stagedHandoff.bridgeSourceCommit,
    sourceRelease: stagedHandoff.sourceRelease,
    expectedFounderCount: stagedHandoff.expectedFounderCount,
    preparedBinding: buildPreparedBinding(stagedHandoff),
    liveAttestation: stagedHandoff.liveAttestation,
  }, stagedHandoff.pagesSourceCommit);
}

function parseCandidateAuthority(value, { now } = {}) {
  if (
    !exactOrderedKeys(value, CANDIDATE_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== CANDIDATE_KIND
    || value.repository !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY
    || typeof value.predecessorReceiptDigest !== 'string'
    || !SHA256.test(value.predecessorReceiptDigest)
    || typeof value.predecessorPagesSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.predecessorPagesSourceCommit)
    || typeof value.chainRootReceiptDigest !== 'string'
    || !SHA256.test(value.chainRootReceiptDigest)
    || typeof value.chainRootPagesSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.chainRootPagesSourceCommit)
    || typeof value.candidatePagesSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.candidatePagesSourceCommit)
    || typeof value.predeployNotificationPresentationDigest !== 'string'
    || !SHA256.test(value.predeployNotificationPresentationDigest)
    || typeof value.predeployLiveBridgeAttestationDigest !== 'string'
    || !SHA256.test(value.predeployLiveBridgeAttestationDigest)
    || value.protectedPathsDigest !== protectedPathsDigest()
    || (
      value.stagedHandoffBinding === null
        ? value.stagedHandoffBindingDigest !== null
        : (
          typeof value.stagedHandoffBindingDigest !== 'string'
          || !SHA256.test(value.stagedHandoffBindingDigest)
        )
    )
    || !(
      value.productionPlayerCanaryActivationAuthorityDigest === null
      || (
        typeof value.productionPlayerCanaryActivationAuthorityDigest === 'string'
        && SHA256.test(
          value.productionPlayerCanaryActivationAuthorityDigest,
        )
      )
    )
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  let stagedHandoffBinding = null;
  if (value.stagedHandoffBinding !== null) {
    stagedHandoffBinding = parseStagedHandoffBinding(
      value.stagedHandoffBinding,
      value.candidatePagesSourceCommit,
    );
    if (
      stagedHandoffBindingDigest(stagedHandoffBinding)
        !== value.stagedHandoffBindingDigest
      || canonicalAuthBridgeReleaseAttestationDigest(
        stagedHandoffBinding.liveAttestation,
      ) !== value.predeployLiveBridgeAttestationDigest
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  }
  const recordedAt = strictUtc(
    value.recordedAt,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID',
  );
  if (now !== undefined && Date.parse(recordedAt) > exactDate(
    now,
    'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID',
  )) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_NOT_YET_VALID');
  return Object.freeze({
    ...value,
    recordedAt,
    stagedHandoffBinding,
  });
}

function canonicalCandidateAuthorityBytes(authority) {
  const bytes = Buffer.from(`${JSON.stringify(authority, null, 2)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_RECEIPT_BYTES) {
    bytes.fill(0);
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_SIZE_INVALID');
  }
  return bytes;
}

function parseCanonicalReceiptBytes(bytes, options) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_RECEIPT_JSON_INVALID');
  }
  const receipt = parseNotificationPagesLiveReceipt(value, options);
  const canonical = canonicalReceiptBytes(receipt);
  try {
    if (!bytes.equals(canonical)) {
      fail('NOTIFICATION_PAGES_LIVE_RECEIPT_BYTES_INVALID');
    }
  } finally {
    canonical.fill(0);
  }
  return receipt;
}

function readContentAddressedFile(path, expectedDigest, expectedNlink, options) {
  const opened = stableFile(
    path,
    expectedNlink,
    'NOTIFICATION_PAGES_LIVE_RECEIPT_FILE_INVALID',
  );
  try {
    if (digest(opened.bytes) !== expectedDigest) {
      fail('NOTIFICATION_PAGES_LIVE_CONTENT_ADDRESS_INVALID');
    }
    const receipt = parseCanonicalReceiptBytes(opened.bytes, options);
    return Object.freeze({
      receipt,
      receiptDigest: expectedDigest,
      dev: opened.dev,
      ino: opened.ino,
    });
  } finally {
    opened.bytes.fill(0);
  }
}

function unlinkExact(path, expected, missingAllowed = true) {
  try {
    const current = lstatSync(path);
    if (
      !current.isFile()
      || current.isSymbolicLink()
      || current.dev !== expected.dev
      || current.ino !== expected.ino
      || (process.getuid !== undefined && current.uid !== process.getuid())
    ) fail('NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED');
    unlinkSync(path);
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    if (error?.code === 'ENOENT' && missingAllowed) return;
    fail('NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED');
  }
}

function writerLockBody({ lockId, createdAt, processStartIdentity }) {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'warpkeep-notification-pages-live-writer-lock-v1',
    lockId,
    owner: { pid: process.pid, processStartIdentity },
    createdAt,
    expiresAt: createdAt + WRITER_LOCK_LIFETIME_MILLISECONDS,
  })}\n`, 'utf8');
}

function parseWriterLock(bytes) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
  }
  if (
    !exactOrderedKeys(value, [
      'schemaVersion', 'kind', 'lockId', 'owner', 'createdAt', 'expiresAt',
    ])
    || value.schemaVersion !== 1
    || value.kind !== 'warpkeep-notification-pages-live-writer-lock-v1'
    || typeof value.lockId !== 'string'
    || !/^[0-9a-f]{24}$/u.test(value.lockId)
    || !exactOrderedKeys(value.owner, ['pid', 'processStartIdentity'])
    || !Number.isSafeInteger(value.owner.pid)
    || value.owner.pid < 1
    || typeof value.owner.processStartIdentity !== 'string'
    || value.owner.processStartIdentity.length < 8
    || value.owner.processStartIdentity.length > 128
    || !Number.isSafeInteger(value.createdAt)
    || !Number.isSafeInteger(value.expiresAt)
    || value.createdAt < 0
    || value.expiresAt - value.createdAt
      !== WRITER_LOCK_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
  return Object.freeze(value);
}

function repairWriterLockPublication(lockDirectory) {
  const lockPath = join(lockDirectory, WRITER_LOCK_FILE);
  for (let retry = 0; retry < 32; retry += 1) {
    const entries = readdirSync(lockDirectory, { withFileTypes: true });
    const temporaries = entries.filter(entry =>
      WRITER_LOCK_TEMPORARY_FILE.test(entry.name));
    let restart = false;
    let liveTemporaryCount = 0;
    for (const entry of temporaries) {
      const path = join(lockDirectory, entry.name);
      let metadata;
      try {
        metadata = lstatSync(path);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          restart = true;
          break;
        }
        fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
      }
      if (
        !entry.isFile()
        || !metadata.isFile()
        || metadata.isSymbolicLink()
        || (process.getuid !== undefined && metadata.uid !== process.getuid())
        || (metadata.nlink !== 1 && metadata.nlink !== 2)
        || (metadata.mode & 0o7777) !== FILE_MODE
        || metadata.size > MAX_RECEIPT_BYTES
      ) fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
      if (metadata.nlink === 1) {
        if (
          metadata.mtimeMs
            <= Date.now() - WRITER_LOCK_LIFETIME_MILLISECONDS
        ) {
          try {
            unlinkExact(path, metadata);
            fsyncDirectory(lockDirectory);
          } catch (error) {
            if (
              error instanceof NotificationPagesLiveReceiptError
              && error.code === 'NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED'
            ) {
              restart = true;
              break;
            }
            throw error;
          }
        } else {
          liveTemporaryCount += 1;
        }
        continue;
      }
      let lockMetadata;
      try {
        lockMetadata = lstatSync(lockPath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          restart = true;
          break;
        }
        fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
      }
      if (
        lockMetadata.dev !== metadata.dev
        || lockMetadata.ino !== metadata.ino
        || lockMetadata.nlink !== 2
      ) {
        restart = true;
        break;
      }
      try {
        unlinkExact(path, metadata);
        fsyncDirectory(lockDirectory);
      } catch (error) {
        if (
          error instanceof NotificationPagesLiveReceiptError
          && error.code === 'NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED'
        ) {
          restart = true;
          break;
        }
        throw error;
      }
      restart = true;
      break;
    }
    if (restart) continue;
    if (liveTemporaryCount >= MAX_WRITER_LOCK_TEMPORARIES) {
      fail('NOTIFICATION_PAGES_LIVE_WRITER_BUSY');
    }
    let lockMetadata;
    try {
      lockMetadata = lstatSync(lockPath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
    }
    if (
      !lockMetadata.isFile()
      || lockMetadata.isSymbolicLink()
      || (lockMetadata.nlink !== 1 && lockMetadata.nlink !== 2)
      || (lockMetadata.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && lockMetadata.uid !== process.getuid())
    ) fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
    if (lockMetadata.nlink === 2) continue;
    return;
  }
  fail('NOTIFICATION_PAGES_LIVE_WRITER_BUSY');
}

function acquireWriterLock(lockDirectory, receiptDirectory, randomBytesImpl) {
  repairWriterLockPublication(lockDirectory);
  const processStartIdentity = requireCurrentProductionAdminProcessIdentity();
  const lockPath = join(lockDirectory, WRITER_LOCK_FILE);
  const attemptedSlots = new Set();
  while (true) {
    const createdAt = Date.now();
    const entropy = temporarySuffix(randomBytesImpl ?? randomBytes);
    writerLockSequence += 1;
    const lockId = createHash('sha256')
      .update(
        `${entropy}\0${process.pid}\0${createdAt}\0${writerLockSequence}`,
        'utf8',
      )
      .digest('hex')
      .slice(0, 24);
    const body = writerLockBody({ lockId, createdAt, processStartIdentity });
    const slot = writerLockSequence % MAX_WRITER_LOCK_TEMPORARIES;
    attemptedSlots.add(slot);
    const temporary = join(
      lockDirectory,
      `.notification-pages-live-receipts-v1-writer-slot-`
        + `${slot.toString(16).padStart(2, '0')}.json`,
    );
    let descriptor;
    let identity;
    let lockIdentity;
    let publicationStage = 'open';
    try {
      descriptor = openSync(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      const created = fstatSync(descriptor);
      identity = Object.freeze({ dev: created.dev, ino: created.ino });
      let offset = 0;
      while (offset < body.byteLength) {
        const written = writeSync(
          descriptor,
          body,
          offset,
          body.byteLength - offset,
        );
        if (written <= 0) fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_FAILED');
        offset += written;
      }
      fchmodSync(descriptor, FILE_MODE);
      fsyncSync(descriptor);
      const complete = fstatSync(descriptor);
      if (
        complete.dev !== created.dev
        || complete.ino !== created.ino
        || complete.nlink !== 1
        || complete.size !== body.byteLength
        || (complete.mode & 0o7777) !== FILE_MODE
      ) fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_FAILED');
      closeSync(descriptor);
      descriptor = undefined;
      publicationStage = 'link';
      linkSync(temporary, lockPath);
      lockIdentity = identity;
      fsyncDirectory(lockDirectory);
      unlinkExact(temporary, identity);
      identity = undefined;
      fsyncDirectory(lockDirectory);
      readExactExpectedFile(lockPath, body);
      body.fill(0);
      if (existsSync(receiptDirectory)) {
        assertPrivateDirectory(receiptDirectory, lockDirectory);
      }
      return Object.freeze({ path: lockPath, dev: created.dev, ino: created.ino });
    } catch (error) {
      let removedPublication = false;
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve primary error. */ }
      }
      if (identity !== undefined) {
        try {
          unlinkExact(temporary, identity);
          removedPublication = true;
        } catch { /* Preserve primary error. */ }
      }
      if (lockIdentity !== undefined) {
        try {
          unlinkExact(lockPath, lockIdentity);
          removedPublication = true;
        } catch { /* Fail closed below. */ }
      }
      if (removedPublication) {
        try { fsyncDirectory(lockDirectory); } catch { /* Preserve primary error. */ }
      }
      body.fill(0);
      if (error?.code !== 'EEXIST') {
        if (error instanceof NotificationPagesLiveReceiptError) throw error;
        fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_FAILED');
      }
      if (publicationStage === 'open') {
        if (attemptedSlots.size >= MAX_WRITER_LOCK_TEMPORARIES) {
          fail('NOTIFICATION_PAGES_LIVE_WRITER_BUSY');
        }
        continue;
      }
      repairWriterLockPublication(lockDirectory);
      let before;
      try {
        before = lstatSync(lockPath);
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue;
        fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID');
      }
      let opened;
      try {
        opened = stableFile(
          lockPath,
          1,
          'NOTIFICATION_PAGES_LIVE_WRITER_LOCK_INVALID',
        );
      } catch (readError) {
        let after;
        try {
          after = lstatSync(lockPath);
        } catch (statError) {
          if (statError?.code === 'ENOENT') continue;
          throw readError;
        }
        if (after.dev !== before.dev || after.ino !== before.ino) continue;
        throw readError;
      }
      if (opened.dev !== before.dev || opened.ino !== before.ino) {
        opened.bytes.fill(0);
        continue;
      }
      let existing;
      try {
        existing = parseWriterLock(opened.bytes);
      } finally {
        opened.bytes.fill(0);
      }
      const dead = productionAdminRecordedOwnerIsDead({
        pid: existing.owner.pid,
        processStartIdentity: existing.owner.processStartIdentity,
      });
      if (createdAt >= existing.expiresAt && dead === true) {
        try {
          unlinkExact(lockPath, opened);
          fsyncDirectory(lockDirectory);
        } catch (unlinkError) {
          if (
            unlinkError instanceof NotificationPagesLiveReceiptError
            && unlinkError.code === 'NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED'
          ) continue;
          throw unlinkError;
        }
        continue;
      }
      fail('NOTIFICATION_PAGES_LIVE_WRITER_BUSY');
    }
  }
}

async function acquireWriterLockWithWait(
  lockDirectory,
  receiptDirectory,
  randomBytesImpl,
) {
  const startedAt = Date.now();
  while (true) {
    try {
      return acquireWriterLock(
        lockDirectory,
        receiptDirectory,
        randomBytesImpl,
      );
    } catch (error) {
      if (
        !(error instanceof NotificationPagesLiveReceiptError)
        || error.code !== 'NOTIFICATION_PAGES_LIVE_WRITER_BUSY'
      ) throw error;
      const current = Date.now();
      if (
        current < startedAt
        || current - startedAt >= WRITER_LOCK_WAIT_MAXIMUM_MILLISECONDS
      ) throw error;
      await new Promise(resolvePromise =>
        setTimeout(resolvePromise, WRITER_LOCK_WAIT_MILLISECONDS));
    }
  }
}

function releaseWriterLock(lockDirectory, lock) {
  try {
    unlinkExact(lock.path, lock, false);
    fsyncDirectory(lockDirectory);
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_WRITER_LOCK_RELEASE_FAILED');
  }
}

function boundedEntries(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
  }
  if (entries.length > MAX_DIRECTORY_ENTRIES) {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
  }
  return entries;
}

function repairLinkedTemporaries(directory) {
  for (const entry of boundedEntries(directory)) {
    const receiptMatch = TEMPORARY_FILE.exec(entry.name);
    const candidateMatch = CANDIDATE_TEMPORARY_FILE.exec(entry.name);
    const candidateClaimMatch = CANDIDATE_CLAIM_TEMPORARY_FILE.exec(entry.name);
    const sourceMatch = SOURCE_TEMPORARY_FILE.exec(entry.name);
    const successorMatch = SUCCESSOR_TEMPORARY_FILE.exec(entry.name);
    const rootMatch = ROOT_TEMPORARY_FILE.exec(entry.name);
    if (
      receiptMatch === null
      && candidateMatch === null
      && candidateClaimMatch === null
      && sourceMatch === null
      && successorMatch === null
      && rootMatch === null
    ) continue;
    const match = receiptMatch ?? candidateMatch ?? candidateClaimMatch
      ?? sourceMatch ?? successorMatch ?? rootMatch;
    const temporary = join(directory, entry.name);
    let metadata;
    try {
      metadata = lstatSync(temporary);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      fail('NOTIFICATION_PAGES_LIVE_TEMPORARY_INVALID');
    }
    const mode = metadata.mode & 0o7777;
    if (
      !entry.isFile()
      || !metadata.isFile()
      || metadata.isSymbolicLink()
      || (process.getuid !== undefined && metadata.uid !== process.getuid())
      || (metadata.nlink !== 1 && metadata.nlink !== 2)
      || (metadata.nlink === 1 ? (mode & ~FILE_MODE) !== 0 : mode !== FILE_MODE)
      || metadata.size > MAX_RECEIPT_BYTES
    ) fail('NOTIFICATION_PAGES_LIVE_TEMPORARY_INVALID');
    if (metadata.nlink === 1) {
      if (metadata.mtimeMs <= Date.now() - TEMPORARY_STALE_MILLISECONDS) {
        unlinkExact(temporary, metadata);
        fsyncDirectory(directory);
      }
      continue;
    }
    const address = match[1];
    const destination = join(
      directory,
      receiptMatch !== null
        ? `notification-pages-live-${address}.json`
        : candidateMatch !== null
          ? `notification-pages-candidate-${address}.json`
          : candidateClaimMatch !== null
            ? `notification-pages-candidate-claim-${address}.json`
          : sourceMatch !== null
            ? `notification-pages-live-source-${address}.json`
            : successorMatch !== null
              ? `notification-pages-live-successor-${address}.json`
              : ROOT_FILE,
    );
    const opened = receiptMatch !== null
      ? readContentAddressedFile(destination, address, 2)
      : stableFile(
        destination,
        2,
        candidateMatch !== null || candidateClaimMatch !== null
          ? 'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID'
          : 'NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID',
      );
    if (candidateMatch !== null && digest(opened.bytes) !== address) {
      opened.bytes.fill(0);
      fail('NOTIFICATION_PAGES_LIVE_CONTENT_ADDRESS_INVALID');
    }
    if (candidateClaimMatch !== null) {
      let claim;
      try {
        claim = parseCandidateAuthority(JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
        ));
      } catch {
        opened.bytes.fill(0);
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
      }
      if (claim.predecessorReceiptDigest !== address) {
        opened.bytes.fill(0);
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
      }
    }
    if (sourceMatch !== null || successorMatch !== null || rootMatch !== null) {
      const reservedReceipt = parseCanonicalReceiptBytes(opened.bytes);
      if (
        (sourceMatch !== null
          && reservedReceipt.pages.sourceCommit !== address)
        || (successorMatch !== null
          && reservedReceipt.chain.previousReceiptDigest !== address)
        || (rootMatch !== null && reservedReceipt.chain.generation !== 0)
      ) {
        opened.bytes.fill(0);
        fail('NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID');
      }
    }
    if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
      fail('NOTIFICATION_PAGES_LIVE_INCOMPLETE_INSTALL');
    }
    unlinkExact(temporary, opened);
    fsyncDirectory(directory);
    const installed = lstatSync(destination);
    if (
      installed.dev !== opened.dev
      || installed.ino !== opened.ino
      || installed.nlink !== 1
    ) fail('NOTIFICATION_PAGES_LIVE_INCOMPLETE_INSTALL');
  }
}

function readInventory(directory, options) {
  const receipts = [];
  let rootReservation;
  const sourceReservations = new Map();
  const successorReservations = new Map();
  const sourceCommits = new Set();
  const receiptDigests = new Set();
  for (const entry of boundedEntries(directory)) {
    const receiptMatch = RECEIPT_FILE.exec(entry.name);
    const temporaryMatch = TEMPORARY_FILE.exec(entry.name);
    const sourceMatch = SOURCE_FILE.exec(entry.name);
    const sourceTemporaryMatch = SOURCE_TEMPORARY_FILE.exec(entry.name);
    const successorMatch = SUCCESSOR_FILE.exec(entry.name);
    const successorTemporaryMatch = SUCCESSOR_TEMPORARY_FILE.exec(entry.name);
    const rootMatch = entry.name === ROOT_FILE;
    const rootTemporaryMatch = ROOT_TEMPORARY_FILE.exec(entry.name);
    const candidateMatch = CANDIDATE_FILE.exec(entry.name);
    const candidateTemporaryMatch = CANDIDATE_TEMPORARY_FILE.exec(entry.name);
    const candidateClaimMatch = CANDIDATE_CLAIM_FILE.exec(entry.name);
    const candidateClaimTemporaryMatch =
      CANDIDATE_CLAIM_TEMPORARY_FILE.exec(entry.name);
    if (
      receiptMatch === null
      && temporaryMatch === null
      && sourceMatch === null
      && sourceTemporaryMatch === null
      && successorMatch === null
      && successorTemporaryMatch === null
      && !rootMatch
      && rootTemporaryMatch === null
      && candidateMatch === null
      && candidateTemporaryMatch === null
      && candidateClaimMatch === null
      && candidateClaimTemporaryMatch === null
    ) {
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_NOT_DEDICATED');
    }
    const path = join(directory, entry.name);
    let metadata;
    try {
      metadata = lstatSync(path);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_NOT_DEDICATED');
    }
    const mode = metadata.mode & 0o7777;
    if (
      !entry.isFile()
      || !metadata.isFile()
      || metadata.isSymbolicLink()
      || (process.getuid !== undefined && metadata.uid !== process.getuid())
      || metadata.nlink !== 1
      || (
        receiptMatch !== null || sourceMatch !== null || rootMatch
          || successorMatch !== null || candidateMatch !== null
          || candidateClaimMatch !== null
          ? mode !== FILE_MODE
          : (mode & ~FILE_MODE) !== 0
      )
      || metadata.size > MAX_RECEIPT_BYTES
    ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_NOT_DEDICATED');
    if (rootMatch) {
      const opened = stableFile(
        path,
        1,
        'NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID',
      );
      try {
        const receipt = parseCanonicalReceiptBytes(opened.bytes, options);
        if (receipt.chain.generation !== 0 || rootReservation !== undefined) {
          fail('NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID');
        }
        rootReservation = Object.freeze({
          receipt,
          bytes: Buffer.from(opened.bytes),
        });
      } finally {
        opened.bytes.fill(0);
      }
    } else if (receiptMatch !== null) {
      const opened = readContentAddressedFile(
        path,
        receiptMatch[1],
        1,
        options,
      );
      if (sourceCommits.has(opened.receipt.pages.sourceCommit)) {
        fail('NOTIFICATION_PAGES_LIVE_SOURCE_NOT_UNIQUE');
      }
      sourceCommits.add(opened.receipt.pages.sourceCommit);
      receiptDigests.add(opened.receiptDigest);
      receipts.push(Object.freeze({
        path,
        receiptDigest: opened.receiptDigest,
        receipt: opened.receipt,
      }));
    } else if (sourceMatch !== null) {
      const opened = stableFile(
        path,
        1,
        'NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID',
      );
      try {
        const receipt = parseCanonicalReceiptBytes(opened.bytes, options);
        if (
          receipt.pages.sourceCommit !== sourceMatch[1]
          || sourceReservations.has(sourceMatch[1])
        ) fail('NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID');
        sourceReservations.set(sourceMatch[1], Object.freeze({
          receipt,
          bytes: Buffer.from(opened.bytes),
        }));
      } finally {
        opened.bytes.fill(0);
      }
    } else if (successorMatch !== null) {
      const opened = stableFile(
        path,
        1,
        'NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID',
      );
      try {
        const receipt = parseCanonicalReceiptBytes(opened.bytes, options);
        if (
          receipt.chain.generation < 1
          || receipt.chain.previousReceiptDigest !== successorMatch[1]
          || successorReservations.has(successorMatch[1])
        ) fail('NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID');
        successorReservations.set(successorMatch[1], Object.freeze({
          receipt,
          bytes: Buffer.from(opened.bytes),
        }));
      } finally {
        opened.bytes.fill(0);
      }
    } else if (candidateMatch !== null || candidateClaimMatch !== null) {
      const opened = stableFile(
        path,
        1,
        'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
      );
      try {
        if (
          candidateMatch !== null
          && digest(opened.bytes) !== candidateMatch[1]
        ) {
          fail('NOTIFICATION_PAGES_LIVE_CONTENT_ADDRESS_INVALID');
        }
        let value;
        let source;
        try {
          source = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
          value = JSON.parse(source);
        } catch {
          fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
        }
        const authority = parseCandidateAuthority(value, options);
        if (
          candidateClaimMatch !== null
          && authority.predecessorReceiptDigest !== candidateClaimMatch[1]
        ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
        const canonical = canonicalCandidateAuthorityBytes(authority);
        try {
          if (!opened.bytes.equals(canonical)) {
            fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
          }
        } finally {
          canonical.fill(0);
        }
      } finally {
        opened.bytes.fill(0);
      }
    }
  }
  for (const [sourceCommit, reservation] of sourceReservations) {
    const receiptDigest = digest(reservation.bytes);
    const receipt = receipts.find(
      entry => entry.receiptDigest === receiptDigest,
    );
    const canonical = receipt === undefined
      ? undefined
      : canonicalReceiptBytes(receipt.receipt);
    try {
      if (
        receipt === undefined
        || receipt.receipt.pages.sourceCommit !== sourceCommit
        || !reservation.bytes.equals(canonical)
      ) fail('NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INCOMPLETE');
    } finally {
      canonical?.fill(0);
      reservation.bytes.fill(0);
    }
  }
  for (const receipt of receipts) {
    if (!sourceReservations.has(receipt.receipt.pages.sourceCommit)) {
      fail('NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_MISSING');
    }
  }
  if (receipts.length > 0) {
    const rootReceipt = receipts.find(
      entry => entry.receipt.chain.generation === 0,
    );
    try {
      if (
        rootReservation === undefined
        || rootReceipt === undefined
        || digest(rootReservation.bytes) !== rootReceipt.receiptDigest
      ) fail('NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID');
    } finally {
      rootReservation?.bytes.fill(0);
    }
  } else if (rootReservation !== undefined) {
    rootReservation.bytes.fill(0);
    fail('NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INCOMPLETE');
  }
  for (const [previousDigest, reservation] of successorReservations) {
    const receiptDigest = digest(reservation.bytes);
    const receipt = receipts.find(entry => entry.receiptDigest === receiptDigest);
    try {
      if (
        receipt === undefined
        || receipt.receipt.chain.previousReceiptDigest !== previousDigest
      ) fail('NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INCOMPLETE');
    } finally {
      reservation.bytes.fill(0);
    }
  }
  for (const receipt of receipts) {
    if (
      receipt.receipt.chain.generation > 0
      && !successorReservations.has(
        receipt.receipt.chain.previousReceiptDigest,
      )
    ) fail('NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_MISSING');
  }
  const receiptsByDigest = new Map(
    receipts.map(entry => [entry.receiptDigest, entry]),
  );
  const roots = receipts.filter(entry => entry.receipt.chain.generation === 0);
  if (receipts.length > 0 && roots.length !== 1) {
    fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
  }
  const successorByDigest = new Set();
  for (const entry of receipts) {
    const chain = entry.receipt.chain;
    if (chain.generation === 0) continue;
    const previous = receiptsByDigest.get(chain.previousReceiptDigest);
    if (
      previous === undefined
      || previous.receipt.pages.sourceCommit
        !== chain.previousPagesSourceCommit
      || previous.receipt.chain.generation + 1 !== chain.generation
      || Date.parse(previous.receipt.recordedAt)
        > Date.parse(entry.receipt.recordedAt)
    ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
    if (successorByDigest.has(chain.previousReceiptDigest)) {
      fail('NOTIFICATION_PAGES_LIVE_CHAIN_FORKED');
    }
    successorByDigest.add(chain.previousReceiptDigest);
  }
  if (receipts.length === 0) return Object.freeze(receipts);
  const root = roots[0];
  for (const entry of receipts) {
    let cursor = entry;
    let traversed = 0;
    while (cursor.receipt.chain.generation > 0) {
      cursor = receiptsByDigest.get(cursor.receipt.chain.previousReceiptDigest);
      traversed += 1;
      if (cursor === undefined || traversed > MAX_CHAIN_GENERATION) {
        fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
      }
    }
    if (
      cursor.receiptDigest !== root.receiptDigest
      || traversed !== entry.receipt.chain.generation
    ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
  }
  return Object.freeze(receipts.map(entry => Object.freeze({
    ...entry,
    chainRootReceiptDigest: root.receiptDigest,
    chainRootPagesSourceCommit: root.receipt.pages.sourceCommit,
  })));
}

function repairPublicationReservations(directory) {
  const recordsBySource = new Map();
  const candidateAuthorities = [];
  for (const entry of boundedEntries(directory)) {
    const receiptMatch = RECEIPT_FILE.exec(entry.name);
    const sourceMatch = SOURCE_FILE.exec(entry.name);
    const successorMatch = SUCCESSOR_FILE.exec(entry.name);
    const rootMatch = entry.name === ROOT_FILE;
    const candidateClaimMatch = CANDIDATE_CLAIM_FILE.exec(entry.name);
    if (
      receiptMatch === null
      && sourceMatch === null
      && successorMatch === null
      && !rootMatch
      && candidateClaimMatch === null
    ) continue;
    const path = join(directory, entry.name);
    const opened = stableFile(
      path,
      1,
      candidateClaimMatch !== null
        ? 'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID'
        : receiptMatch !== null
        ? 'NOTIFICATION_PAGES_LIVE_RECEIPT_FILE_INVALID'
        : rootMatch
          ? 'NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID'
          : sourceMatch !== null
          ? 'NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID'
          : 'NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID',
    );
    try {
      if (candidateClaimMatch !== null) {
        let value;
        try {
          value = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
          );
        } catch {
          fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
        }
        const authority = parseCandidateAuthority(value);
        const canonical = canonicalCandidateAuthorityBytes(authority);
        try {
          if (
            authority.predecessorReceiptDigest !== candidateClaimMatch[1]
            || !opened.bytes.equals(canonical)
          ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
          candidateAuthorities.push(Object.freeze({
            authorityDigest: digest(opened.bytes),
            bytes: Buffer.from(opened.bytes),
          }));
        } finally {
          canonical.fill(0);
        }
        continue;
      }
      const receipt = parseCanonicalReceiptBytes(opened.bytes);
      const receiptDigest = digest(opened.bytes);
      if (
        (receiptMatch !== null && receiptDigest !== receiptMatch[1])
        || (rootMatch && receipt.chain.generation !== 0)
        || (sourceMatch !== null
          && receipt.pages.sourceCommit !== sourceMatch[1])
        || (successorMatch !== null
          && receipt.chain.previousReceiptDigest !== successorMatch[1])
      ) fail('NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID');
      const record = Object.freeze({
        receipt,
        receiptDigest,
        bytes: Buffer.from(opened.bytes),
      });
      const existing = recordsBySource.get(receipt.pages.sourceCommit);
      if (
        existing !== undefined
        && existing.receiptDigest !== receiptDigest
      ) {
        record.bytes.fill(0);
        fail('NOTIFICATION_PAGES_LIVE_SOURCE_ALREADY_BOUND');
      }
      if (existing === undefined) {
        recordsBySource.set(receipt.pages.sourceCommit, record);
      } else {
        record.bytes.fill(0);
      }
    } finally {
      opened.bytes.fill(0);
    }
  }
  const records = [...recordsBySource.values()];
  try {
    const completedCandidateAuthorities = new Set(
      records
        .filter(record => record.receipt.chain.generation > 0)
        .map(record => record.receipt.chain.candidateAuthorityDigest),
    );
    for (const candidate of candidateAuthorities) {
      if (!completedCandidateAuthorities.has(candidate.authorityDigest)) continue;
      let authority;
      try {
        authority = parseCandidateAuthority(JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(candidate.bytes),
        ));
      } catch {
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
      }
      retireCandidateAuthority({
        directory,
        predecessorReceiptDigest: authority.predecessorReceiptDigest,
        authorityDigest: candidate.authorityDigest,
      });
    }
    for (const record of records) {
      installCanonicalPrivateBytes({
        directory,
        basename:
          `notification-pages-live-source-${record.receipt.pages.sourceCommit}.json`,
        temporaryPrefix:
          `notification-pages-live-source-${record.receipt.pages.sourceCommit}`,
        bytes: record.bytes,
        randomBytesImpl: randomBytes,
      });
      if (record.receipt.chain.generation === 0) {
        installCanonicalPrivateBytes({
          directory,
          basename: ROOT_FILE,
          temporaryPrefix: 'notification-pages-live-root',
          bytes: record.bytes,
          randomBytesImpl: randomBytes,
        });
      }
      if (record.receipt.chain.generation > 0) {
        installCanonicalPrivateBytes({
          directory,
          basename: 'notification-pages-live-successor-'
            + `${record.receipt.chain.previousReceiptDigest}.json`,
          temporaryPrefix: 'notification-pages-live-successor-'
            + record.receipt.chain.previousReceiptDigest,
          bytes: record.bytes,
          randomBytesImpl: randomBytes,
        });
      }
      installCanonicalPrivateBytes({
        directory,
        basename: `notification-pages-live-${record.receiptDigest}.json`,
        temporaryPrefix: `notification-pages-live-${record.receiptDigest}`,
        bytes: record.bytes,
        randomBytesImpl: randomBytes,
      });
    }
    for (const candidate of candidateAuthorities) {
      if (completedCandidateAuthorities.has(candidate.authorityDigest)) continue;
      installCanonicalPrivateBytes({
        directory,
        basename:
          `notification-pages-candidate-${candidate.authorityDigest}.json`,
        temporaryPrefix:
          `notification-pages-candidate-${candidate.authorityDigest}`,
        bytes: candidate.bytes,
        randomBytesImpl: randomBytes,
      });
    }
  } finally {
    for (const record of records) record.bytes.fill(0);
    for (const candidate of candidateAuthorities) candidate.bytes.fill(0);
  }
}

function ensureNotificationPagesLiveReceiptDirectoryBase({
  directory,
  repositoryRoot,
} = {}) {
  const validated = validateDirectoryRequest(directory, repositoryRoot);
  if (!existsSync(directory)) {
    try {
      mkdirSync(directory, { mode: DIRECTORY_MODE });
      chmodSync(directory, DIRECTORY_MODE);
      fsyncDirectory(directory);
      fsyncDirectory(validated.parent);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        // A concurrent first writer created the same dedicated directory.
      } else {
      if (error instanceof NotificationPagesLiveReceiptError) throw error;
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_CREATE_FAILED');
      }
    }
  }
  let metadata;
  try {
    metadata = lstatSync(directory);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
  }
  const mode = metadata.mode & 0o7777;
  if (
    mode !== DIRECTORY_MODE
    && metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && (process.getuid === undefined || metadata.uid === process.getuid())
    && (mode & ~DIRECTORY_MODE) === 0
  ) {
    try {
      if (
        realpathSync(directory) !== directory
        || dirname(directory) !== validated.parent
      ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
      chmodSync(directory, DIRECTORY_MODE);
      fsyncDirectory(directory);
      fsyncDirectory(validated.parent);
    } catch (error) {
      if (error instanceof NotificationPagesLiveReceiptError) throw error;
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_CREATE_FAILED');
    }
  }
  const canonical = assertPrivateDirectory(directory, validated.parent);
  return canonical;
}

function repairNotificationPagesLiveReceiptDirectory(directory, repositoryRoot) {
  const validated = validateDirectoryRequest(directory, repositoryRoot);
  const canonical = assertPrivateDirectory(directory, validated.parent);
  try {
    repairLinkedTemporaries(canonical);
    repairPublicationReservations(canonical);
    readInventory(canonical);
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVALID');
  }
  return canonical;
}

async function withWriterLock({
  directory,
  repositoryRoot,
  randomBytesImpl = randomBytes,
}, operation) {
  const canonical = ensureNotificationPagesLiveReceiptDirectoryBase({
    directory,
    repositoryRoot,
  });
  const lockDirectory = dirname(canonical);
  const lock = await acquireWriterLockWithWait(
    lockDirectory,
    canonical,
    randomBytesImpl,
  );
  let result;
  let operationError;
  try {
    const repaired = repairNotificationPagesLiveReceiptDirectory(
      canonical,
      repositoryRoot,
    );
    result = await operation(repaired);
  } catch (error) {
    operationError = error;
  }
  let cleanupError;
  try {
    releaseWriterLock(lockDirectory, lock);
  } catch (error) {
    cleanupError = error;
  }
  if (operationError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [operationError, cleanupError],
      'NOTIFICATION_PAGES_LIVE_WRITER_MULTIPLE_FAILURES',
    );
  }
  if (operationError !== undefined) throw operationError;
  if (cleanupError !== undefined) throw cleanupError;
  return result;
}

/** Create, repair, and attest the dedicated owner-only live receipt directory. */
export function ensureNotificationPagesLiveReceiptDirectory({
  directory,
  repositoryRoot,
} = {}) {
  const canonical = ensureNotificationPagesLiveReceiptDirectoryBase({
    directory,
    repositoryRoot,
  });
  const lockDirectory = dirname(canonical);
  const lock = acquireWriterLock(lockDirectory, canonical, randomBytes);
  try {
    return repairNotificationPagesLiveReceiptDirectory(
      canonical,
      repositoryRoot,
    );
  } finally {
    releaseWriterLock(lockDirectory, lock);
  }
}

export function defaultNotificationPagesLiveReceiptDirectory() {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep',
    'private',
    'production-admin-v1',
    NOTIFICATION_PAGES_LIVE_STATE_CHILD,
  );
}

const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_NO_REPLACE_OBJECTS: '1',
  HOME: '/nonexistent',
  PATH: '/usr/bin:/bin',
});

function gitResult(arguments_) {
  return spawnSync(
    '/usr/bin/git',
    ['--no-optional-locks', ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: GIT_ENVIRONMENT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    },
  );
}

function gitBufferResult(arguments_, { input, maxBuffer }) {
  return spawnSync(
    '/usr/bin/git',
    ['--no-optional-locks', ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: null,
      env: GIT_ENVIRONMENT,
      input,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10_000,
      maxBuffer,
    },
  );
}

function exactCommit(commit, code) {
  if (typeof commit !== 'string' || !SOURCE_COMMIT.test(commit)) fail(code);
  const result = gitResult(['rev-parse', '--verify', `${commit}^{commit}`]);
  const value = result.status === 0 ? result.stdout.trim() : '';
  if (value !== commit || !SOURCE_COMMIT.test(value)) fail(code);
  return value;
}

function assertAncestor(ancestor, descendant, code) {
  const result = gitResult(['merge-base', '--is-ancestor', ancestor, descendant]);
  if (result.status !== 0 || result.stdout !== '') fail(code);
}

function assertNoDiff(ancestor, descendant, paths, code) {
  const result = gitResult([
    'diff',
    '--quiet',
    '--no-ext-diff',
    '--no-textconv',
    ancestor,
    descendant,
    '--',
    ...paths,
  ]);
  if (result.status !== 0 || result.stdout !== '') fail(code);
}

function exactHeadProtectedEntries(paths, code) {
  const result = gitBufferResult([
    'ls-tree', '-r', '-z', '--full-tree',
    '--format=%(objectmode)%x09%(objectname)%x09%(objecttype)%x09%(objectsize)%x09%(path)',
    'HEAD', '--', ...paths,
  ], {
    input: Buffer.alloc(0),
    maxBuffer: MAX_CHECKOUT_TREE_BYTES,
  });
  const bytes = result.stdout;
  if (
    result.status !== 0
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength > MAX_CHECKOUT_TREE_BYTES
  ) fail(code);
  let inventory;
  try {
    inventory = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    bytes.fill(0);
    fail(code);
  }
  bytes.fill(0);
  const rawEntries = inventory.split('\0');
  if (
    rawEntries.pop() !== ''
    || rawEntries.length < 1
    || rawEntries.length > MAX_CHECKOUT_TREE_ENTRIES
  ) fail(code);
  let aggregateBytes = 0;
  const entries = new Map();
  for (const rawEntry of rawEntries) {
    const parts = rawEntry.split('\t');
    if (parts.length !== 5) fail(code);
    const [mode, objectId, objectType, sizeSource, path] = parts;
    if (
      !GIT_REGULAR_FILE_MODE.test(mode)
      || !GIT_OBJECT_ID.test(objectId)
      || objectType !== 'blob'
      || !/^(?:0|[1-9][0-9]*)$/u.test(sizeSource)
      || path.length < 1
      || path !== resolve('/', path).slice(1)
      || entries.has(path)
    ) fail(code);
    const size = Number(sizeSource);
    if (
      !Number.isSafeInteger(size)
      || aggregateBytes > MAX_CHECKOUT_AGGREGATE_BYTES - size
    ) fail(code);
    aggregateBytes += size;
    entries.set(path, Object.freeze({ mode, objectId, path, size }));
  }
  return entries;
}

function assertCanonicalProtectedIndex(entries, paths, code) {
  const result = gitBufferResult([
    'ls-files', '--stage', '-v', '-z', '--', ...paths,
  ], {
    input: Buffer.alloc(0),
    maxBuffer: MAX_CHECKOUT_TREE_BYTES,
  });
  const bytes = result.stdout;
  if (
    result.status !== 0
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength > MAX_CHECKOUT_TREE_BYTES
  ) fail(code);
  let inventory;
  try {
    inventory = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    bytes.fill(0);
    fail(code);
  }
  bytes.fill(0);
  const rawEntries = inventory.split('\0');
  if (
    rawEntries.pop() !== ''
    || rawEntries.length !== entries.size
  ) fail(code);
  const seen = new Set();
  for (const rawEntry of rawEntries) {
    const match = /^([A-Z]) ([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/u.exec(
      rawEntry,
    );
    if (match === null) fail(code);
    const [, flag, mode, objectId, stage, path] = match;
    const head = entries.get(path);
    if (
      flag !== 'H'
      || stage !== '0'
      || head === undefined
      || mode !== head.mode
      || objectId !== head.objectId
      || seen.has(path)
    ) fail(code);
    seen.add(path);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function assertExactProtectedWorktree(entries, code) {
  if (typeof constants.O_NOFOLLOW !== 'number') fail(code);
  for (const entry of entries.values()) {
    const path = join(REPOSITORY_ROOT, entry.path);
    let descriptor;
    const buffer = Buffer.allocUnsafe(64 * 1024);
    try {
      const beforePath = lstatSync(path, { bigint: true });
      if (!beforePath.isFile() || beforePath.size !== BigInt(entry.size)) {
        fail(code);
      }
      descriptor = openSync(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const before = fstatSync(descriptor, { bigint: true });
      if (
        !before.isFile()
        || !sameFileIdentity(beforePath, before)
        || before.size !== BigInt(entry.size)
        || (
          entry.mode === '100755'
            ? (before.mode & 0o111n) === 0n
            : (before.mode & 0o111n) !== 0n
        )
      ) fail(code);
      const hash = createHash(entry.objectId.length === 40 ? 'sha1' : 'sha256');
      hash.update(`blob ${entry.size}\0`, 'utf8');
      let offset = 0;
      while (offset < entry.size) {
        const length = Math.min(buffer.byteLength, entry.size - offset);
        const read = readSync(descriptor, buffer, 0, length, offset);
        if (read !== length) fail(code);
        hash.update(buffer.subarray(0, read));
        offset += read;
      }
      const after = fstatSync(descriptor, { bigint: true });
      const afterPath = lstatSync(path, { bigint: true });
      if (
        !sameFileIdentity(before, after)
        || !sameFileIdentity(after, afterPath)
        || hash.digest('hex') !== entry.objectId
      ) fail(code);
    } catch (error) {
      if (error instanceof NotificationPagesLiveReceiptError) throw error;
      fail(code);
    } finally {
      buffer.fill(0);
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve primary outcome. */ }
      }
    }
  }
}

function assertCleanProtectedCheckout(paths = NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS) {
  const code = 'NOTIFICATION_PAGES_LIVE_PROTECTED_CHECKOUT_DIRTY';
  for (const arguments_ of [
    [
      'diff', '--quiet', '--no-ext-diff', '--no-textconv', 'HEAD', '--',
      ...paths,
    ],
    [
      'diff', '--cached', '--quiet', '--no-ext-diff', '--no-textconv', 'HEAD', '--',
      ...paths,
    ],
  ]) {
    const result = gitResult(arguments_);
    if (result.status !== 0 || result.stdout !== '') {
      fail(code);
    }
  }
  const entries = exactHeadProtectedEntries(paths, code);
  assertCanonicalProtectedIndex(entries, paths, code);
  assertExactProtectedWorktree(entries, code);
  const untracked = gitResult([
    'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths,
  ]);
  if (
    untracked.status !== 0
    || untracked.stdout.includes('\0')
    || untracked.stdout !== ''
  ) fail(code);
}

function assertExactCleanHead(expectedHead) {
  if (currentHead() !== expectedHead) {
    fail('NOTIFICATION_PAGES_LIVE_HEAD_CHANGED');
  }
  assertCleanProtectedCheckout();
}

function assertReceiptGitProvenance(receipt) {
  for (const commit of [
    receipt.pages.sourceCommit,
    receipt.bridge.sourceCommit,
    receipt.sourceRelease.atlasSourceCommit,
    receipt.sourceRelease.moduleSourceCommit,
  ]) exactCommit(commit, 'NOTIFICATION_PAGES_LIVE_GIT_SOURCE_INVALID');
  assertAncestor(
    receipt.sourceRelease.atlasSourceCommit,
    receipt.sourceRelease.moduleSourceCommit,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertAncestor(
    receipt.sourceRelease.moduleSourceCommit,
    receipt.pages.sourceCommit,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertAncestor(
    receipt.bridge.sourceCommit,
    receipt.pages.sourceCommit,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertActiveEvidenceSourceNoDrift(
    receipt.sourceRelease.moduleSourceCommit,
    receipt.pages.sourceCommit,
  );
}

function currentHead() {
  const result = gitResult(['rev-parse', '--verify', 'HEAD^{commit}']);
  const value = result.status === 0 ? result.stdout.trim() : '';
  if (!SOURCE_COMMIT.test(value)) fail('NOTIFICATION_PAGES_LIVE_HEAD_INVALID');
  return value;
}

function sourceAtCommit(commit, path, code) {
  const result = gitResult(['show', `${commit}:${path}`]);
  if (result.status !== 0 || result.stdout.length > 512 * 1024) fail(code);
  return result.stdout;
}

function parseTypeScriptSourceFile(source, fileName, code) {
  let api;
  let snapshot;
  try {
    const directory = dirname(fileName);
    api = new TypeScriptAPI({
      cwd: directory,
      fs: createVirtualFileSystem({ [fileName]: source }),
    });
    snapshot = api.updateSnapshot({ openFiles: [fileName] });
    const project = snapshot.getDefaultProjectForFile(fileName);
    const sourceFile = project?.program.getSourceFile(fileName);
    if (
      project === undefined
      || sourceFile === undefined
      || project.program.getSyntacticDiagnostics(fileName).length !== 0
    ) fail(code);
    return Object.freeze({ api, snapshot, sourceFile });
  } catch (error) {
    try { snapshot?.dispose(); } catch { /* Preserve primary error. */ }
    try { api?.close(); } catch { /* Preserve primary error. */ }
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  }
}

function exactHermesApprovalSource(source) {
  const code = 'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID';
  const fileName = '/notification-pages-live-phase/hermes-admin.ts';
  const parsed = parseTypeScriptSourceFile(source, fileName, code);
  const matches = [];
  try {
    for (const statement of parsed.sourceFile.statements) {
      if (
        !isVariableStatement(statement)
        || statement.modifierFlags !== ModifierFlags.Export
        || statement.modifiers?.length !== 1
        || statement.modifiers[0].kind !== SyntaxKind.ExportKeyword
        || (statement.declarationList.flags & NodeFlags.Const) === 0
        || statement.declarationList.declarations.length !== 1
      ) continue;
      const declaration = statement.declarationList.declarations[0];
      if (
        !isIdentifier(declaration.name)
        || declaration.name.text
          !== 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED'
        || declaration.type !== undefined
        || declaration.exclamationToken !== undefined
        || declaration.initializer === undefined
        || !isAsExpression(declaration.initializer)
        || declaration.initializer.type.kind !== SyntaxKind.TypeReference
        || !isIdentifier(declaration.initializer.type.typeName)
        || declaration.initializer.type.typeName.text !== 'const'
        || declaration.initializer.type.typeArguments !== undefined
        || (
          declaration.initializer.expression.kind !== SyntaxKind.TrueKeyword
          && declaration.initializer.expression.kind !== SyntaxKind.FalseKeyword
        )
      ) continue;
      matches.push(
        declaration.initializer.expression.kind === SyntaxKind.TrueKeyword,
      );
    }
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  } finally {
    try { parsed.snapshot.dispose(); } catch { /* Preserve parse outcome. */ }
    try { parsed.api.close(); } catch { /* Preserve parse outcome. */ }
  }
  if (matches.length !== 1) fail(code);
  return matches[0];
}

const HERMES_DIRECT_LOCAL_IMPORTS = Object.freeze([
  '../services/auth-bridge/src/types',
  '../spacetimedb/src/alphaActivationPolicy',
  '../spacetimedb/src/alphaV10ActivationPolicy',
  '../spacetimedb/src/entryAgreementPolicy',
  '../spacetimedb/src/profileAuthorityPolicy',
  '../spacetimedb/src/resourceAuthorityPolicy',
  '../src/spacetime/module_bindings',
  '../src/spacetime/module_bindings/types',
  './access-requests/reset-plan',
  './admission-notifications/recovery-plan',
  './alpha-activation-controls',
  './alpha-v10-activation-controls',
  './founder-admission-authority',
  './hermes-machine-output',
  './notification-pages-live-hermes-authority.mjs',
  './production-admin-token-budget.mjs',
  './profiles/farcaster-profile-policy',
  './profiles/founder-admission-plan',
  './profiles/profile-transport',
]);

function assertHermesDirectImportClosure(source) {
  const code = 'NOTIFICATION_PAGES_LIVE_HERMES_IMPORT_CLOSURE_INVALID';
  const parsed = parseTypeScriptSourceFile(
    source,
    '/notification-pages-live-phase/hermes-admin.ts',
    code,
  );
  try {
    const localImports = parsed.sourceFile.statements
      .filter(isImportDeclaration)
      .map(statement => statement.moduleSpecifier)
      .filter(isStringLiteral)
      .map(specifier => specifier.text)
      .filter(specifier => specifier.startsWith('.'))
      .sort();
    if (
      localImports.length !== HERMES_DIRECT_LOCAL_IMPORTS.length
      || localImports.some(
        (specifier, index) => specifier !== HERMES_DIRECT_LOCAL_IMPORTS[index],
      )
    ) fail(code);
  } finally {
    try { parsed.snapshot.dispose(); } catch { /* Preserve parse outcome. */ }
    try { parsed.api.close(); } catch { /* Preserve parse outcome. */ }
  }
}

const EVIDENCE_VIRTUAL_ROOT = '/notification-pages-live-evidence';

function exactCommitSourceTree(commit, code) {
  const inventoryResult = gitBufferResult([
    'ls-tree', '-r', '-z', '--full-tree',
    '--format=%(objectmode)%x09%(objectname)%x09%(objecttype)%x09%(objectsize)%x09%(path)',
    commit,
  ], {
    input: Buffer.alloc(0),
    maxBuffer: MAX_GIT_TREE_INVENTORY_BYTES,
  });
  const inventoryBytes = inventoryResult.stdout;
  if (
    inventoryResult.status !== 0
    || !Buffer.isBuffer(inventoryBytes)
    || inventoryBytes.byteLength < 1
    || inventoryBytes.byteLength > MAX_GIT_TREE_INVENTORY_BYTES
  ) fail(code);

  let inventory;
  try {
    inventory = new TextDecoder('utf-8', { fatal: true }).decode(
      inventoryBytes,
    );
  } catch {
    inventoryBytes.fill(0);
    fail(code);
  }
  inventoryBytes.fill(0);
  const rawEntries = inventory.split('\0');
  if (rawEntries.pop() !== '' || rawEntries.length > MAX_GIT_TREE_ENTRIES) {
    fail(code);
  }

  const sourceEntries = [];
  let aggregateBytes = 0;
  const entries = new Map();
  const paths = new Set();
  const sourcePaths = new Set();
  for (const rawEntry of rawEntries) {
    const firstTab = rawEntry.indexOf('\t');
    const secondTab = rawEntry.indexOf('\t', firstTab + 1);
    const thirdTab = rawEntry.indexOf('\t', secondTab + 1);
    const fourthTab = rawEntry.indexOf('\t', thirdTab + 1);
    if (
      firstTab < 1
      || secondTab < 0
      || thirdTab < 0
      || fourthTab < 0
    ) fail(code);
    const mode = rawEntry.slice(0, firstTab);
    const objectId = rawEntry.slice(firstTab + 1, secondTab);
    const objectType = rawEntry.slice(secondTab + 1, thirdTab);
    const sizeSource = rawEntry.slice(thirdTab + 1, fourthTab);
    const path = rawEntry.slice(fourthTab + 1);
    if (
      !/^[0-7]{6}$/u.test(mode)
      ||
      !GIT_OBJECT_ID.test(objectId)
      || path.length < 1
      || path !== resolve('/', path).slice(1)
      || paths.has(path)
    ) fail(code);
    paths.add(path);
    const size = /^(?:0|[1-9][0-9]*)$/u.test(sizeSource)
      ? Number(sizeSource)
      : null;
    if (size !== null && !Number.isSafeInteger(size)) fail(code);
    entries.set(path, Object.freeze({
      mode,
      objectId,
      objectType,
      path,
      size,
    }));
    if (!GIT_SOURCE_PATH.test(path)) continue;
    if (
      objectType !== 'blob'
      || !GIT_REGULAR_FILE_MODE.test(mode)
      || size === null
    ) fail(code);
    if (
      size > MAX_GIT_SOURCE_FILE_BYTES
      || sourceEntries.length >= MAX_GIT_SOURCE_FILES
      || aggregateBytes > MAX_GIT_SOURCE_AGGREGATE_BYTES - size
    ) fail(code);
    aggregateBytes += size;
    sourcePaths.add(path);
    sourceEntries.push(Object.freeze({ objectId, path, size }));
  }

  const batchInput = Buffer.from(
    sourceEntries.map(entry => `${entry.objectId}\n`).join(''),
    'ascii',
  );
  const batchResult = gitBufferResult(['cat-file', '--batch'], {
    input: batchInput,
    maxBuffer: MAX_GIT_SOURCE_AGGREGATE_BYTES
      + MAX_GIT_SOURCE_FILES * 160,
  });
  batchInput.fill(0);
  const batchBytes = batchResult.stdout;
  if (batchResult.status !== 0 || !Buffer.isBuffer(batchBytes)) fail(code);

  let api;
  let snapshot;
  try {
    const virtualFiles = {};
    const contents = new Map();
    let offset = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (const entry of sourceEntries) {
      const headerEnd = batchBytes.indexOf(0x0a, offset);
      if (headerEnd < offset) fail(code);
      const expectedHeader = `${entry.objectId} blob ${entry.size}`;
      if (batchBytes.toString('ascii', offset, headerEnd) !== expectedHeader) {
        fail(code);
      }
      const bodyStart = headerEnd + 1;
      const bodyEnd = bodyStart + entry.size;
      if (bodyEnd >= batchBytes.byteLength || batchBytes[bodyEnd] !== 0x0a) {
        fail(code);
      }
      const source = decoder.decode(batchBytes.subarray(bodyStart, bodyEnd));
      contents.set(entry.path, source);
      if (GIT_TYPESCRIPT_SOURCE_PATH.test(entry.path)) {
        virtualFiles[`${EVIDENCE_VIRTUAL_ROOT}/${entry.path}`] = source;
      }
      offset = bodyEnd + 1;
    }
    if (offset !== batchBytes.byteLength) fail(code);
    batchBytes.fill(0);
    const virtualPaths = Object.keys(virtualFiles);
    api = new TypeScriptAPI({
      cwd: EVIDENCE_VIRTUAL_ROOT,
      fs: createVirtualFileSystem(virtualFiles),
    });
    snapshot = api.updateSnapshot({ openFiles: virtualPaths });
    return Object.freeze({
      api,
      contents,
      entries,
      paths,
      sourcePaths,
      snapshot,
    });
  } catch (error) {
    batchBytes.fill(0);
    try { snapshot?.dispose(); } catch { /* Preserve primary error. */ }
    try { api?.close(); } catch { /* Preserve primary error. */ }
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  }
}

function exactRegularTreeEntry(tree, path, code) {
  const entry = tree.entries.get(path);
  if (
    entry === undefined
    || entry.objectType !== 'blob'
    || !GIT_REGULAR_FILE_MODE.test(entry.mode)
    || entry.size === null
  ) fail(code);
  return entry;
}

function localRuntimeImportsFromTree(tree, path, code) {
  exactRegularTreeEntry(tree, path, code);
  const virtualPath = `${EVIDENCE_VIRTUAL_ROOT}/${path}`;
  const project = tree.snapshot.getDefaultProjectForFile(virtualPath);
  const sourceFile = project?.program.getSourceFile(virtualPath);
  if (
    project === undefined
    || sourceFile === undefined
    || project.program.getSyntacticDiagnostics(virtualPath).length !== 0
  ) fail(code);
  return Object.freeze(sourceFile.statements
    .filter(statement => isImportDeclaration(statement)
      || statement.kind === SyntaxKind.ExportDeclaration)
    .map(statement => statement.moduleSpecifier)
    .filter(specifier => specifier !== undefined)
    .filter(isStringLiteral)
    .map(specifier => specifier.text)
    .filter(specifier => specifier.startsWith('.'))
    // The receipt's four fixed service-local parser imports are runtime
    // toolchain authority, not tracked source dependencies. Their complete
    // resolver/tree bytes are attested separately by the production A/B
    // bootstrap before this module can load on the privileged runner.
    .filter(specifier => !specifier.startsWith(
      '../services/auth-bridge/node_modules/',
    )));
}

function resolveLocalImportFromTree(tree, importerPath, specifier, code) {
  const base = resolve('/', dirname(importerPath), specifier).slice(1);
  for (const candidate of [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.mjs`, `${base}.js`,
    `${base}.jsx`, `${base}.cts`, `${base}.cjs`, `${base}.css`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.mts`,
    `${base}/index.mjs`, `${base}/index.js`, `${base}/index.jsx`,
    `${base}/index.cts`, `${base}/index.cjs`, `${base}/index.css`,
  ]) {
    if (tree.sourcePaths.has(candidate)) {
      exactRegularTreeEntry(tree, candidate, code);
      return candidate;
    }
  }
  fail(code);
}

function presentationLocalImportsFromTree(tree, path, code) {
  exactRegularTreeEntry(tree, path, code);
  const virtualPath = `${EVIDENCE_VIRTUAL_ROOT}/${path}`;
  const project = tree.snapshot.getDefaultProjectForFile(virtualPath);
  const sourceFile = project?.program.getSourceFile(virtualPath);
  if (
    project === undefined
    || sourceFile === undefined
    || project.program.getSyntacticDiagnostics(virtualPath).length !== 0
  ) fail(code);
  const imports = [];
  const staticEdgeHasRuntimeBytes = node => {
    if (isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause === undefined) return true;
      if (clause.isTypeOnly || clause.name !== undefined) {
        return clause.isTypeOnly !== true;
      }
      const bindings = clause.namedBindings;
      if (bindings === undefined) return false;
      if (bindings.kind === SyntaxKind.NamespaceImport) return true;
      return bindings.elements.some(element => element.isTypeOnly !== true);
    }
    if (node.isTypeOnly === true) return false;
    const clause = node.exportClause;
    if (clause === undefined) return true;
    if (clause.kind === SyntaxKind.NamespaceExport) return true;
    return clause.elements.some(element => element.isTypeOnly !== true);
  };
  const visit = node => {
    if (
      isImportDeclaration(node)
      || node.kind === SyntaxKind.ExportDeclaration
    ) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && staticEdgeHasRuntimeBytes(node)) {
        if (!isStringLiteral(specifier)) fail(code);
        if (specifier.text.startsWith('.')) {
          if (imports.length >= MAX_PRESENTATION_SOURCE_FILES) fail(code);
          imports.push(Object.freeze({
            dynamic: false,
            specifier: specifier.text,
          }));
        }
      }
    } else if (
      isCallExpression(node)
      && node.expression.kind === SyntaxKind.ImportKeyword
    ) {
      if (
        node.arguments.length !== 1
        || (
          !isStringLiteral(node.arguments[0])
          && node.arguments[0].kind
            !== SyntaxKind.NoSubstitutionTemplateLiteral
        )
      ) fail(code);
      const specifier = node.arguments[0].text;
      if (specifier.startsWith('.')) {
        if (imports.length >= MAX_PRESENTATION_SOURCE_FILES) fail(code);
        imports.push(Object.freeze({ dynamic: true, specifier }));
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return Object.freeze(imports);
}

const presentationSourceClosureCache = new Map();

function exactPresentationSourceClosure(commit) {
  const cached = presentationSourceClosureCache.get(commit);
  if (cached !== undefined) return cached;
  const code = 'NOTIFICATION_PAGES_LIVE_PRESENTATION_SOURCE_CLOSURE_INVALID';
  const tree = exactCommitSourceTree(commit, code);
  try {
    const pending = [PRESENTATION_SOURCE_ROOT];
    const discovered = new Set(pending);
    const visited = new Set();
    let aggregateBytes = 0;
    let exemptionCount = 0;
    while (pending.length > 0) {
      const path = pending.shift();
      if (visited.has(path)) continue;
      const entry = exactRegularTreeEntry(tree, path, code);
      if (
        visited.size >= MAX_PRESENTATION_SOURCE_FILES
        || entry.size > MAX_GIT_SOURCE_FILE_BYTES
        || aggregateBytes > MAX_PRESENTATION_SOURCE_BYTES - entry.size
      ) fail(code);
      aggregateBytes += entry.size;
      visited.add(path);
      if (path.endsWith('.css')) {
        const source = tree.contents.get(path);
        if (typeof source !== 'string' || /@import\b/iu.test(source)) fail(code);
        continue;
      }
      for (const edge of presentationLocalImportsFromTree(tree, path, code)) {
        const resolvedImport = resolveLocalImportFromTree(
          tree,
          path,
          edge.specifier,
          code,
        );
        if (
          edge.dynamic
          && path === PRESENTATION_REALM_EXEMPTION.importer
          && edge.specifier === PRESENTATION_REALM_EXEMPTION.specifier
        ) {
          if (resolvedImport !== PRESENTATION_REALM_EXEMPTION.resolved) {
            fail(code);
          }
          exemptionCount += 1;
          continue;
        }
        if (!discovered.has(resolvedImport)) {
          if (discovered.size >= MAX_PRESENTATION_SOURCE_FILES) fail(code);
          discovered.add(resolvedImport);
          pending.push(resolvedImport);
        }
      }
    }
    if (exemptionCount !== 1) fail(code);
    for (const path of PRESENTATION_BUILD_INPUTS) {
      if (visited.has(path)) continue;
      const entry = exactRegularTreeEntry(tree, path, code);
      if (
        visited.size >= MAX_PRESENTATION_SOURCE_FILES
        || entry.size > MAX_FRONTEND_ASSET_BYTES
        || aggregateBytes > MAX_PRESENTATION_SOURCE_BYTES - entry.size
      ) fail(code);
      aggregateBytes += entry.size;
      visited.add(path);
    }
    const closure = Object.freeze([...visited].sort());
    if (presentationSourceClosureCache.size >= 32) {
      presentationSourceClosureCache.delete(
        presentationSourceClosureCache.keys().next().value,
      );
    }
    presentationSourceClosureCache.set(commit, closure);
    return closure;
  } finally {
    try { tree.snapshot.dispose(); } catch { /* Preserve closure outcome. */ }
    try { tree.api.close(); } catch { /* Preserve closure outcome. */ }
  }
}

export function deriveNotificationPagesLivePresentationSourceClosure({
  sourceCommit,
} = {}) {
  const commit = exactCommit(
    sourceCommit,
    'NOTIFICATION_PAGES_LIVE_PRESENTATION_SOURCE_CLOSURE_INVALID',
  );
  return exactPresentationSourceClosure(commit);
}

export function assertNotificationPagesLivePresentationSourceNoDrift({
  predecessorSourceCommit,
  candidateSourceCommit,
} = {}) {
  const code = 'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT';
  const predecessor = exactCommit(predecessorSourceCommit, code);
  const candidate = exactCommit(candidateSourceCommit, code);
  assertAncestor(predecessor, candidate, code);
  const paths = exactPresentationSourceClosure(predecessor);
  assertNoDiff(predecessor, candidate, paths, code);
  return paths;
}

function pathCoveredByProtectedClosure(path) {
  return NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS.some(protectedPath =>
    path === protectedPath || path.startsWith(`${protectedPath}/`));
}

const localImportClosureCache = new Map();

function exactProtectedLocalImportClosure({
  commit,
  roots,
  literalDependencies,
  cacheScope,
  code,
}) {
  const cacheKey = `${cacheScope}:${commit}`;
  const cached = localImportClosureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const tree = exactCommitSourceTree(commit, code);
  try {
    const pending = [...roots];
    const visited = new Set(literalDependencies);
    for (const path of literalDependencies) {
      if (
        !tree.paths.has(path)
        || !pathCoveredByProtectedClosure(path)
      ) {
        fail(code);
      }
      exactRegularTreeEntry(tree, path, code);
    }
    while (pending.length > 0) {
      const path = pending.shift();
      if (visited.has(path)) continue;
      visited.add(path);
      if (!pathCoveredByProtectedClosure(path)) fail(code);
      for (const specifier of localRuntimeImportsFromTree(tree, path, code)) {
        const resolvedImport = resolveLocalImportFromTree(
          tree,
          path,
          specifier,
          code,
        );
        if (!pathCoveredByProtectedClosure(resolvedImport)) fail(code);
        pending.push(resolvedImport);
      }
    }
    const closure = Object.freeze([...visited].sort());
    if (localImportClosureCache.size >= 32) {
      localImportClosureCache.delete(
        localImportClosureCache.keys().next().value,
      );
    }
    localImportClosureCache.set(cacheKey, closure);
    return closure;
  } finally {
    try { tree.snapshot.dispose(); } catch { /* Preserve closure outcome. */ }
    try { tree.api.close(); } catch { /* Preserve closure outcome. */ }
  }
}

function assertActiveEvidenceImportClosure(commit) {
  return exactProtectedLocalImportClosure({
    commit,
    roots: ACTIVE_EVIDENCE_IMPORT_ROOTS,
    literalDependencies: ACTIVE_EVIDENCE_LITERAL_DEPENDENCIES,
    cacheScope: 'active-evidence',
    code: 'NOTIFICATION_PAGES_LIVE_ACTIVE_EVIDENCE_CLOSURE_INVALID',
  });
}

function assertHermesAuthorityImportClosure(commit) {
  return exactProtectedLocalImportClosure({
    commit,
    roots: HERMES_AUTHORITY_IMPORT_ROOTS,
    literalDependencies: [],
    cacheScope: 'hermes-authority',
    code: 'NOTIFICATION_PAGES_LIVE_HERMES_IMPORT_CLOSURE_INVALID',
  });
}

function exactPagesPresentationSource(source) {
  const code = 'NOTIFICATION_PAGES_LIVE_PAGES_PHASE_INVALID';
  let document;
  try {
    document = parseDocument(source, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    fail(code);
  }
  if (document.errors.length !== 0 || document.warnings.length !== 0) fail(code);
  const value = document.getIn([
    'jobs',
    'build',
    'env',
    'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED',
  ]);
  if (value !== 'true' && value !== 'false') fail(code);
  const steps = document.toJS()?.jobs?.build?.steps;
  if (!Array.isArray(steps)) fail(code);
  const buildSteps = steps.filter(step =>
    isRecord(step)
    && step.name === 'Build'
    && step.run === 'npm run build');
  if (buildSteps.length !== 1) fail(code);
  for (const step of steps) {
    if (!isRecord(step)) fail(code);
    const environment = step.env;
    if (
      environment !== undefined
      && (
        !isRecord(environment)
        || Object.hasOwn(
          environment,
          'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED',
        )
      )
    ) fail(code);
    if (
      step !== buildSteps[0]
      && typeof step.run === 'string'
      && /(?:^|\s)npm\s+run\s+build(?:\s|$)/u.test(step.run)
    ) fail(code);
  }
  return value === 'true';
}

function exactReleaseBindingSource(source, code) {
  if (
    typeof source !== 'string'
    || source.length < 1
    || Buffer.byteLength(source, 'utf8') > MAX_GIT_SOURCE_FILE_BYTES
  ) fail(code);
  const parsed = parseTypeScriptSourceFile(
    source,
    '/notification-pages-live-phase/notification-pages-live-release-binding.mjs',
    code,
  );
  try {
    const matches = [];
    for (const statement of parsed.sourceFile.statements) {
      if (
        !isVariableStatement(statement)
        || statement.modifierFlags !== ModifierFlags.Export
        || statement.modifiers?.length !== 1
        || statement.modifiers[0].kind !== SyntaxKind.ExportKeyword
        || (statement.declarationList.flags & NodeFlags.Const) === 0
        || statement.declarationList.declarations.length !== 1
      ) continue;
      const declaration = statement.declarationList.declarations[0];
      const initializer = declaration.initializer;
      if (
        !isIdentifier(declaration.name)
        || declaration.name.text !== 'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING'
        || declaration.type !== undefined
        || declaration.exclamationToken !== undefined
        || initializer === undefined
        || !isCallExpression(initializer)
        || !isPropertyAccessExpression(initializer.expression)
        || !isIdentifier(initializer.expression.expression)
        || initializer.expression.expression.text !== 'Object'
        || initializer.expression.name.text !== 'freeze'
        || initializer.arguments.length !== 1
        || !isObjectLiteralExpression(initializer.arguments[0])
        || initializer.arguments[0].properties.length !== 2
      ) continue;
      const values = {};
      const initializerSpans = [];
      for (const property of initializer.arguments[0].properties) {
        if (
          !isPropertyAssignment(property)
          || !isIdentifier(property.name)
          || ![
            'notificationPagesLiveRootReceiptDigest',
            'notificationPagesLiveRootPagesSourceCommit',
          ].includes(property.name.text)
          || Object.hasOwn(values, property.name.text)
          || (
            property.initializer.kind !== SyntaxKind.NullKeyword
            && !isStringLiteral(property.initializer)
          )
        ) fail(code);
        values[property.name.text] = property.initializer.kind
          === SyntaxKind.NullKeyword ? null : property.initializer.text;
        initializerSpans.push(Object.freeze({
          end: property.initializer.end,
          key: property.name.text,
          start: property.initializer.getStart(parsed.sourceFile),
        }));
      }
      const digest = values.notificationPagesLiveRootReceiptDigest;
      const sourceCommit = values.notificationPagesLiveRootPagesSourceCommit;
      if (
        !(
          digest === null
          && sourceCommit === null
        )
        && !(
          typeof digest === 'string'
          && SHA256.test(digest)
          && typeof sourceCommit === 'string'
          && SOURCE_COMMIT.test(sourceCommit)
        )
      ) fail(code);
      initializerSpans.sort((left, right) => left.start - right.start);
      let projection = '';
      let offset = 0;
      for (const span of initializerSpans) {
        if (span.start < offset || span.end <= span.start) fail(code);
        projection += source.slice(offset, span.start);
        projection += `<NOTIFICATION_PAGES_LIVE_RELEASE_BINDING:${span.key}>`;
        offset = span.end;
      }
      projection += source.slice(offset);
      matches.push(Object.freeze({
        notificationPagesLiveRootReceiptDigest: digest,
        notificationPagesLiveRootPagesSourceCommit: sourceCommit,
        sourceProjection: projection,
      }));
    }
    if (matches.length !== 1) fail(code);
    return matches[0];
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  } finally {
    try { parsed.snapshot.dispose(); } catch { /* Preserve parse outcome. */ }
    try { parsed.api.close(); } catch { /* Preserve parse outcome. */ }
  }
}

function releaseBindingAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_SOURCE_INVALID';
  return exactReleaseBindingSource(sourceAtCommit(
    commit,
    RELEASE_BINDING_SOURCE_PATH,
    code,
  ), code);
}

export function parseNotificationPagesLiveReleaseBindingSource(source) {
  const parsed = exactReleaseBindingSource(
    source,
    'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_SOURCE_INVALID',
  );
  return Object.freeze({
    notificationPagesLiveRootReceiptDigest:
      parsed.notificationPagesLiveRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit:
      parsed.notificationPagesLiveRootPagesSourceCommit,
    sourceProjectionDigest: digest(Buffer.from(parsed.sourceProjection, 'utf8')),
  });
}

function exactAuxiliaryReleaseBindingSource({
  source,
  fileName,
  variableName,
  fields,
  code,
}) {
  if (
    typeof source !== 'string'
    || source.length < 1
    || Buffer.byteLength(source, 'utf8') > MAX_GIT_SOURCE_FILE_BYTES
  ) fail(code);
  const parsed = parseTypeScriptSourceFile(source, fileName, code);
  try {
    const matches = [];
    for (const statement of parsed.sourceFile.statements) {
      if (
        !isVariableStatement(statement)
        || statement.modifierFlags !== ModifierFlags.Export
        || statement.modifiers?.length !== 1
        || statement.modifiers[0].kind !== SyntaxKind.ExportKeyword
        || (statement.declarationList.flags & NodeFlags.Const) === 0
        || statement.declarationList.declarations.length !== 1
      ) continue;
      const declaration = statement.declarationList.declarations[0];
      const initializer = declaration.initializer;
      if (
        !isIdentifier(declaration.name)
        || declaration.name.text !== variableName
        || declaration.type !== undefined
        || declaration.exclamationToken !== undefined
        || initializer === undefined
        || !isCallExpression(initializer)
        || !isPropertyAccessExpression(initializer.expression)
        || !isIdentifier(initializer.expression.expression)
        || initializer.expression.expression.text !== 'Object'
        || initializer.expression.name.text !== 'freeze'
        || initializer.arguments.length !== 1
        || !isObjectLiteralExpression(initializer.arguments[0])
        || initializer.arguments[0].properties.length !== fields.length
      ) continue;
      const values = {};
      const initializerSpans = [];
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const property = initializer.arguments[0].properties[index];
        if (
          !isPropertyAssignment(property)
          || !isIdentifier(property.name)
          || property.name.text !== field.key
        ) fail(code);
        const expression = property.initializer;
        let value;
        if (expression.kind === SyntaxKind.NullKeyword) {
          value = null;
        } else if (field.type === 'count' && isNumericLiteral(expression)) {
          if (!/^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u.test(
            expression.text,
          )) fail(code);
          value = Number(expression.text);
        } else if (field.type !== 'count' && isStringLiteral(expression)) {
          value = expression.text;
          if (
            !(field.type === 'digest' ? SHA256 : SOURCE_COMMIT).test(value)
            || !/^'[^'\r\n]*'$/u.test(expression.getText(parsed.sourceFile))
          ) fail(code);
        } else fail(code);
        values[field.key] = value;
        initializerSpans.push(Object.freeze({
          end: expression.end,
          key: field.key,
          start: expression.getStart(parsed.sourceFile),
        }));
      }
      const fieldValues = fields.map(field => values[field.key]);
      if (
        !fieldValues.every(value => value === null)
        && !fieldValues.every(value => value !== null)
      ) fail(code);
      let sourceProjection = '';
      let offset = 0;
      for (const span of initializerSpans) {
        if (span.start < offset || span.end <= span.start) fail(code);
        sourceProjection += source.slice(offset, span.start);
        sourceProjection += `<${variableName}:${span.key}>`;
        offset = span.end;
      }
      sourceProjection += source.slice(offset);
      matches.push(Object.freeze({
        values: Object.freeze(values),
        sourceProjection,
      }));
    }
    if (matches.length !== 1) fail(code);
    return matches[0];
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  } finally {
    try { parsed.snapshot.dispose(); } catch { /* Preserve parse outcome. */ }
    try { parsed.api.close(); } catch { /* Preserve parse outcome. */ }
  }
}

function preparedBindingAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_PREPARED_BINDING_SOURCE_INVALID';
  return exactAuxiliaryReleaseBindingSource({
    source: sourceAtCommit(commit, PREPARED_BINDING_SOURCE_PATH, code),
    fileName: '/notification-pages-live-phase/prepared-release-binding.mjs',
    variableName: 'AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING',
    fields: [
      { key: 'notificationPreparedReceiptDigest', type: 'digest' },
      { key: 'notificationPreparedBridgeSourceCommit', type: 'commit' },
    ],
    code,
  });
}

function privateBindingAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_PRIVATE_BINDING_SOURCE_INVALID';
  return exactAuxiliaryReleaseBindingSource({
    source: sourceAtCommit(commit, PRIVATE_BINDING_SOURCE_PATH, code),
    fileName: '/notification-pages-live-phase/private-release-binding.mjs',
    variableName: 'NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING',
    fields: [
      { key: 'notificationPagesActiveV17EvidenceDigest', type: 'digest' },
      { key: 'notificationPagesDeployedModuleReceiptDigest', type: 'digest' },
      { key: 'notificationPagesExpectedFounderCount', type: 'count' },
    ],
    code,
  });
}

function productionPlayerCanaryBindingAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_BINDING_SOURCE_INVALID';
  return exactAuxiliaryReleaseBindingSource({
    source: sourceAtCommit(
      commit,
      PRODUCTION_PLAYER_CANARY_BINDING_SOURCE_PATH,
      code,
    ),
    fileName: '/notification-pages-live-phase/production-player-canary-binding.mjs',
    variableName: 'PRODUCTION_PLAYER_CANARY_RELEASE_BINDING',
    fields: [
      { key: 'productionPlayerCanaryReceiptDigest', type: 'digest' },
      { key: 'productionPlayerCanarySourceCommit', type: 'commit' },
    ],
    code,
  });
}

function exactChangedPaths(predecessor, candidate, code) {
  const result = gitResult([
    'diff', '--name-only', '--no-renames', '-z', predecessor, candidate, '--',
  ]);
  if (result.status !== 0 || !result.stdout.endsWith('\0')) fail(code);
  const paths = result.stdout.slice(0, -1).split('\0');
  if (
    paths.length < 1
    || paths.some(path => path.length < 1 || path !== resolve('/', path).slice(1))
  ) fail(code);
  return Object.freeze(paths.sort());
}

function exactProjectedBooleanSource(commit, path, declarations, code) {
  let source = sourceAtCommit(commit, path, code);
  const values = {};
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  for (const declaration of declarations) {
    const pattern = new RegExp(
      `(${escape(declaration.prefix)})(false|true)(${escape(declaration.suffix)})`,
      'gu',
    );
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) fail(code);
    values[declaration.key] = matches[0][2] === 'true';
    source = source.slice(0, matches[0].index)
      + matches[0][1]
      + `<${declaration.key}>`
      + matches[0][3]
      + source.slice(matches[0].index + matches[0][0].length);
  }
  return Object.freeze({ values: Object.freeze(values), projection: source });
}

function exactReleaseIdentityAtCommit(commit, code) {
  let packageValue;
  let lockValue;
  let manifestValue;
  try {
    packageValue = JSON.parse(sourceAtCommit(commit, 'package.json', code));
    lockValue = JSON.parse(sourceAtCommit(commit, 'package-lock.json', code));
    manifestValue = JSON.parse(sourceAtCommit(
      commit,
      'public/.well-known/farcaster.json',
      code,
    ));
  } catch {
    fail(code);
  }
  const contractSource = sourceAtCommit(
    commit,
    'scripts/farcaster-miniapp-contract.mjs',
    code,
  );
  const contractDescriptions = [...contractSource.matchAll(
    /^  description:\n    '([^'\r\n]+)',$/gmu,
  )];
  if (
    typeof packageValue?.version !== 'string'
    || lockValue?.version !== packageValue.version
    || lockValue?.packages?.['']?.version !== packageValue.version
    || typeof manifestValue?.miniapp?.description !== 'string'
    || contractDescriptions.length !== 1
    || contractDescriptions[0][1] !== manifestValue.miniapp.description
  ) fail(code);
  return Object.freeze({
    version: packageValue.version,
    description: manifestValue.miniapp.description,
  });
}

const WORLD_FOUNDATION_DESCRIPTION =
  'Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.';
const INERT_WORLD_DESCRIPTION =
  'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';

/**
 * Source-only prerequisite for the historical Hermes lookup. It recognizes one
 * exact C6 -> C7 source shape but grants no deployment authority by itself.
 */
function assertProductionPlayerCanaryActivationSourceTransition(
  predecessor,
  candidate,
) {
  const code = 'NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_TRANSITION_INVALID';
  exactCommit(predecessor, code);
  exactCommit(candidate, code);
  assertAncestor(predecessor, candidate, code);
  const changed = exactChangedPaths(predecessor, candidate, code);
  const expected = [...NOTIFICATION_PAGES_PRODUCTION_PLAYER_CANARY_ACTIVATION_PATHS]
    .sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) fail(code);

  const predecessorBinding = productionPlayerCanaryBindingAtCommit(predecessor);
  const candidateBinding = productionPlayerCanaryBindingAtCommit(candidate);
  if (
    predecessorBinding.values.productionPlayerCanaryReceiptDigest !== null
    || predecessorBinding.values.productionPlayerCanarySourceCommit !== null
    || candidateBinding.values.productionPlayerCanaryReceiptDigest === null
    || candidateBinding.values.productionPlayerCanarySourceCommit !== predecessor
    || predecessorBinding.sourceProjection !== candidateBinding.sourceProjection
  ) fail(code);

  const downstreamDeclarations = [
    { key: 'client', prefix: '  clientActivationApproved: ', suffix: ',' },
    { key: 'notifications', prefix: '  admissionNotificationsApproved: ', suffix: ',' },
  ];
  const predecessorDownstream = exactProjectedBooleanSource(
    predecessor,
    'scripts/greater-realm-downstream-release-policy.ts',
    downstreamDeclarations,
    code,
  );
  const candidateDownstream = exactProjectedBooleanSource(
    candidate,
    'scripts/greater-realm-downstream-release-policy.ts',
    downstreamDeclarations,
    code,
  );
  const clientDeclarations = [{
    key: 'clientPresentation',
    prefix: 'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = ',
    suffix: ' as const;',
  }];
  const serverDeclarations = [{
    key: 'serverPresentation',
    prefix: 'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = ',
    suffix: ' as const;',
  }];
  const predecessorClient = exactProjectedBooleanSource(
    predecessor,
    'src/spacetime/greaterRealmProviderBridge.ts',
    clientDeclarations,
    code,
  );
  const candidateClient = exactProjectedBooleanSource(
    candidate,
    'src/spacetime/greaterRealmProviderBridge.ts',
    clientDeclarations,
    code,
  );
  const predecessorServer = exactProjectedBooleanSource(
    predecessor,
    'src/greater-realm/greaterRealmTransport.ts',
    serverDeclarations,
    code,
  );
  const candidateServer = exactProjectedBooleanSource(
    candidate,
    'src/greater-realm/greaterRealmTransport.ts',
    serverDeclarations,
    code,
  );
  if (
    predecessorDownstream.projection !== candidateDownstream.projection
    || predecessorDownstream.values.client !== false
    || predecessorDownstream.values.notifications !== true
    || candidateDownstream.values.client !== true
    || candidateDownstream.values.notifications !== true
    || predecessorClient.projection !== candidateClient.projection
    || predecessorClient.values.clientPresentation !== false
    || candidateClient.values.clientPresentation !== true
    || predecessorServer.projection !== candidateServer.projection
    || predecessorServer.values.serverPresentation !== false
    || candidateServer.values.serverPresentation !== true
  ) fail(code);

  const predecessorIdentity = exactReleaseIdentityAtCommit(predecessor, code);
  const candidateIdentity = exactReleaseIdentityAtCommit(candidate, code);
  if (
    predecessorIdentity.version !== '0.3.43'
    || predecessorIdentity.description !== INERT_WORLD_DESCRIPTION
    || candidateIdentity.version !== '0.4.0'
    || candidateIdentity.description !== WORLD_FOUNDATION_DESCRIPTION
  ) fail(code);
  const predecessorPhase = notificationPagesSourcePhase(predecessor);
  const candidatePhase = notificationPagesSourcePhase(candidate);
  if (
    predecessorPhase.pagesPresentationEnabled !== true
    || predecessorPhase.hermesExecutionApproved !== true
    || candidatePhase.pagesPresentationEnabled !== true
    || candidatePhase.hermesExecutionApproved !== true
  ) fail(code);
  return Object.freeze({
    predecessorPagesSourceCommit: predecessor,
    candidatePagesSourceCommit: candidate,
    productionPlayerCanaryReceiptDigest:
      candidateBinding.values.productionPlayerCanaryReceiptDigest,
  });
}

/**
 * Public source-only form of the reviewed C6 -> C7 check. It validates the
 * exact 18-path transition but deliberately grants no live/deploy authority.
 */
export function assertNotificationPagesProductionPlayerCanaryActivationSourceTransition({
  predecessorPagesSourceCommit,
  candidatePagesSourceCommit,
} = {}) {
  return assertProductionPlayerCanaryActivationSourceTransition(
    predecessorPagesSourceCommit,
    candidatePagesSourceCommit,
  );
}

export function assertNotificationPagesProductionPlayerCanaryActivationTransition({
  predecessorPagesSourceCommit,
  candidatePagesSourceCommit,
  activationAuthority,
  now = Date.now(),
} = {}) {
  const transition = assertProductionPlayerCanaryActivationSourceTransition(
    predecessorPagesSourceCommit,
    candidatePagesSourceCommit,
  );
  const authority = requireFreshProductionPlayerCanaryActivationAuthority(
    activationAuthority,
    {
      candidatePagesSourceCommit,
      predecessorPagesSourceCommit,
      now,
    },
  );
  const predecessorTreeResult = gitResult([
    'rev-parse', '--verify', `${predecessorPagesSourceCommit}^{tree}`,
  ]);
  const predecessorTree = predecessorTreeResult.stdout.trim();
  if (predecessorTreeResult.status !== 0 || !SOURCE_COMMIT.test(predecessorTree)) {
    fail('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_TRANSITION_INVALID');
  }
  if (
    authority.productionPlayerCanaryReceiptDigest
      !== transition.productionPlayerCanaryReceiptDigest
    || authority.productionPlayerCanarySourceTree !== predecessorTree
  ) fail('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_AUTHORITY_MISMATCH');
  return Object.freeze({
    ...transition,
    productionPlayerCanaryActivationAuthorityDigest:
      productionPlayerCanaryActivationAuthorityDigest(authority),
  });
}

function assertCandidateAuxiliaryReleaseBindingTransition({
  candidate,
  predecessor,
  staged,
}) {
  const code = 'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID';
  if (predecessor === null) return;
  const predecessorRoot = releaseBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  const candidateRoot = releaseBindingAtCommit(candidate);
  if (
    predecessorRoot.notificationPagesLiveRootReceiptDigest !== null
    || predecessorRoot.notificationPagesLiveRootPagesSourceCommit !== null
  ) {
    if (
      candidateRoot.notificationPagesLiveRootReceiptDigest
        !== predecessorRoot.notificationPagesLiveRootReceiptDigest
      || candidateRoot.notificationPagesLiveRootPagesSourceCommit
        !== predecessorRoot.notificationPagesLiveRootPagesSourceCommit
      || sourceAtCommit(
        candidate,
        PREPARED_BINDING_SOURCE_PATH,
        code,
      ) !== sourceAtCommit(
        predecessor.receipt.pages.sourceCommit,
        PREPARED_BINDING_SOURCE_PATH,
        code,
      )
      || sourceAtCommit(
        candidate,
        PRIVATE_BINDING_SOURCE_PATH,
        code,
      ) !== sourceAtCommit(
        predecessor.receipt.pages.sourceCommit,
        PRIVATE_BINDING_SOURCE_PATH,
        code,
      )
    ) fail(code);
    return;
  }
  if (staged || predecessor.receipt.chain.generation !== 0) fail(code);
  const predecessorPrepared = preparedBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  const predecessorPrivate = privateBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  const candidatePrepared = preparedBindingAtCommit(candidate);
  const candidatePrivate = privateBindingAtCommit(candidate);
  if (
    predecessorPrepared.values.notificationPreparedReceiptDigest
      !== predecessor.receipt.preparedBinding.receiptDigest
    || predecessorPrepared.values.notificationPreparedBridgeSourceCommit
      !== predecessor.receipt.preparedBinding.bridgeSourceCommit
    || predecessorPrivate.values.notificationPagesActiveV17EvidenceDigest
      !== predecessor.receipt.handoff.activeV17EvidenceDigest
    || predecessorPrivate.values.notificationPagesDeployedModuleReceiptDigest
      !== predecessor.receipt.handoff.deployedModuleReceiptDigest
    || predecessorPrivate.values.notificationPagesExpectedFounderCount
      !== predecessor.receipt.expectedFounderCount
    || candidatePrepared.values.notificationPreparedReceiptDigest !== null
    || candidatePrepared.values.notificationPreparedBridgeSourceCommit !== null
    || candidatePrivate.values.notificationPagesActiveV17EvidenceDigest !== null
    || candidatePrivate.values.notificationPagesDeployedModuleReceiptDigest
      !== null
    || candidatePrivate.values.notificationPagesExpectedFounderCount !== null
    || candidatePrepared.sourceProjection
      !== predecessorPrepared.sourceProjection
    || candidatePrivate.sourceProjection !== predecessorPrivate.sourceProjection
  ) fail(code);
}

function assertCandidateReleaseBinding({ candidate, predecessor }) {
  const candidateBinding = releaseBindingAtCommit(candidate);
  const candidateDigest = candidateBinding.notificationPagesLiveRootReceiptDigest;
  const candidateSource =
    candidateBinding.notificationPagesLiveRootPagesSourceCommit;
  if (predecessor === null) {
    if (candidateDigest !== null || candidateSource !== null) {
      fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID');
    }
    return;
  }
  const predecessorBinding = releaseBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  const predecessorDigest =
    predecessorBinding.notificationPagesLiveRootReceiptDigest;
  const predecessorSource =
    predecessorBinding.notificationPagesLiveRootPagesSourceCommit;
  if (predecessorDigest === null && predecessorSource === null) {
    if (
      predecessor.receipt.chain.generation !== 0
      || predecessor.chainRootReceiptDigest !== predecessor.receiptDigest
      || predecessor.chainRootPagesSourceCommit
        !== predecessor.receipt.pages.sourceCommit
      || candidateDigest !== predecessor.receiptDigest
      || candidateSource !== predecessor.receipt.pages.sourceCommit
      || candidateBinding.sourceProjection
        !== predecessorBinding.sourceProjection
    ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID');
    return;
  }
  if (
    candidateDigest !== predecessorDigest
    || candidateSource !== predecessorSource
    || candidateDigest !== predecessor.chainRootReceiptDigest
    || candidateSource !== predecessor.chainRootPagesSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID');
}

function candidateDiffProtectedPaths(predecessor, basePaths, staged = false) {
  let paths = [
    ...basePaths,
    ...assertHermesAuthorityImportClosure(
      predecessor.receipt.pages.sourceCommit,
    ),
    ...assertActiveEvidenceImportClosure(
      predecessor.receipt.sourceRelease.moduleSourceCommit,
    ),
  ];
  if (staged) {
    paths = paths.filter(path => !STAGED_HANDOFF_AUTHORIZED_PATHS.some(
      authorizedPath => path === authorizedPath
        || path.startsWith(`${authorizedPath}/`),
    ));
  }
  paths.push(...exactPresentationSourceClosure(
    predecessor.receipt.pages.sourceCommit,
  ));
  // This source is compared structurally below so the one reviewed false→true
  // finalization literal can change without authorizing any other Hermes byte.
  paths = paths.filter(path => path !== 'scripts/hermes-admin.ts');
  const predecessorBinding = releaseBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  if (
    predecessor.receipt.chain.generation === 0
    && predecessorBinding.notificationPagesLiveRootReceiptDigest === null
    && predecessorBinding.notificationPagesLiveRootPagesSourceCommit === null
  ) {
    paths = paths.filter(path => ![
      PREPARED_BINDING_SOURCE_PATH,
      PRIVATE_BINDING_SOURCE_PATH,
      RELEASE_BINDING_SOURCE_PATH,
    ].includes(path));
  }
  return Object.freeze([...new Set(paths)].sort());
}

function exactHermesApprovalProjection(source) {
  const code = 'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID';
  const fileName = '/notification-pages-live-phase/hermes-admin.ts';
  const parsed = parseTypeScriptSourceFile(source, fileName, code);
  const matches = [];
  try {
    for (const statement of parsed.sourceFile.statements) {
      if (
        !isVariableStatement(statement)
        || statement.modifierFlags !== ModifierFlags.Export
        || statement.modifiers?.length !== 1
        || statement.modifiers[0].kind !== SyntaxKind.ExportKeyword
        || (statement.declarationList.flags & NodeFlags.Const) === 0
        || statement.declarationList.declarations.length !== 1
      ) continue;
      const declaration = statement.declarationList.declarations[0];
      if (
        !isIdentifier(declaration.name)
        || declaration.name.text
          !== 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED'
        || declaration.type !== undefined
        || declaration.exclamationToken !== undefined
        || declaration.initializer === undefined
        || !isAsExpression(declaration.initializer)
        || declaration.initializer.type.kind !== SyntaxKind.TypeReference
        || !isIdentifier(declaration.initializer.type.typeName)
        || declaration.initializer.type.typeName.text !== 'const'
        || declaration.initializer.type.typeArguments !== undefined
        || (
          declaration.initializer.expression.kind !== SyntaxKind.TrueKeyword
          && declaration.initializer.expression.kind !== SyntaxKind.FalseKeyword
        )
      ) continue;
      const expression = declaration.initializer.expression;
      matches.push(Object.freeze({
        approved: expression.kind === SyntaxKind.TrueKeyword,
        start: expression.getStart(parsed.sourceFile),
        end: expression.end,
      }));
    }
    if (matches.length !== 1) fail(code);
    const match = matches[0];
    return Object.freeze({
      approved: match.approved,
      projection: source.slice(0, match.start)
        + '<NOTIFICATION_PAGES_LIVE_HERMES_APPROVAL>'
        + source.slice(match.end),
    });
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail(code);
  } finally {
    try { parsed.snapshot.dispose(); } catch { /* Preserve parse outcome. */ }
    try { parsed.api.close(); } catch { /* Preserve parse outcome. */ }
  }
}

function assertActiveEvidenceSourceNoDrift(moduleSourceCommit, pagesSourceCommit) {
  const code = 'NOTIFICATION_PAGES_LIVE_ACTIVE_EVIDENCE_SOURCE_DRIFT';
  const closure = assertActiveEvidenceImportClosure(moduleSourceCommit);
  const projectedPaths = [
    RELEASE_BINDING_SOURCE_PATH,
    'scripts/hermes-admin.ts',
  ];
  if (!projectedPaths.every(path => closure.includes(path))) fail(code);
  assertNoDiff(
    moduleSourceCommit,
    pagesSourceCommit,
    closure.filter(path => !projectedPaths.includes(path)),
    code,
  );
  const moduleRoot = releaseBindingAtCommit(moduleSourceCommit);
  const pagesRoot = releaseBindingAtCommit(pagesSourceCommit);
  const moduleHermes = exactHermesApprovalProjection(sourceAtCommit(
    moduleSourceCommit,
    'scripts/hermes-admin.ts',
    code,
  ));
  const pagesHermes = exactHermesApprovalProjection(sourceAtCommit(
    pagesSourceCommit,
    'scripts/hermes-admin.ts',
    code,
  ));
  const rootState = binding => (
    binding.notificationPagesLiveRootReceiptDigest === null
    && binding.notificationPagesLiveRootPagesSourceCommit === null
  ) ? 'N' : 'P';
  if (
    moduleRoot.sourceProjection !== pagesRoot.sourceProjection
    || moduleHermes.projection !== pagesHermes.projection
    || rootState(moduleRoot) !== 'N'
    || moduleHermes.approved
    || ![
      'NF',
      'PF',
      'PT',
    ].includes(
      rootState(pagesRoot)
        + (pagesHermes.approved ? 'T' : 'F'),
    )
  ) fail(code);
}

export function assertNotificationPagesLiveHermesSourceTransition({
  predecessorHermesSource,
  candidateHermesSource,
  staged,
  predecessorRootBound,
} = {}) {
  if (
    typeof predecessorHermesSource !== 'string'
    || predecessorHermesSource.length < 1
    || predecessorHermesSource.length > 512 * 1024
    || typeof candidateHermesSource !== 'string'
    || candidateHermesSource.length < 1
    || candidateHermesSource.length > 512 * 1024
    || typeof staged !== 'boolean'
    || typeof predecessorRootBound !== 'boolean'
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID');
  const previous = exactHermesApprovalProjection(predecessorHermesSource);
  const next = exactHermesApprovalProjection(candidateHermesSource);
  if (staged) {
    if (
      next.approved !== false
      || candidateHermesSource !== predecessorHermesSource
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
  } else if (candidateHermesSource !== predecessorHermesSource && (
    previous.approved !== false
    || next.approved !== true
    || previous.projection !== next.projection
    || !predecessorRootBound
  )) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
  return Object.freeze({
    predecessorHermesExecutionApproved: previous.approved,
    candidateHermesExecutionApproved: next.approved,
  });
}

function assertHermesSourceTransition({ predecessor, candidate, staged }) {
  const previousSource = sourceAtCommit(
    predecessor.receipt.pages.sourceCommit,
    'scripts/hermes-admin.ts',
    'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID',
  );
  const candidateSource = sourceAtCommit(
    candidate,
    'scripts/hermes-admin.ts',
    'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID',
  );
  const previousBinding = releaseBindingAtCommit(
    predecessor.receipt.pages.sourceCommit,
  );
  assertNotificationPagesLiveHermesSourceTransition({
    predecessorHermesSource: previousSource,
    candidateHermesSource: candidateSource,
    staged,
    predecessorRootBound:
      previousBinding.notificationPagesLiveRootReceiptDigest !== null
      && previousBinding.notificationPagesLiveRootPagesSourceCommit !== null,
  });
}

function assertReceiptReleaseBinding(entry) {
  const binding = releaseBindingAtCommit(entry.receipt.pages.sourceCommit);
  const rootDigest = binding.notificationPagesLiveRootReceiptDigest;
  const rootSource = binding.notificationPagesLiveRootPagesSourceCommit;
  if (entry.receipt.chain.generation === 0) {
    if (
      rootDigest !== null
      || rootSource !== null
      || entry.chainRootReceiptDigest !== entry.receiptDigest
      || entry.chainRootPagesSourceCommit !== entry.receipt.pages.sourceCommit
    ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID');
    return;
  }
  if (
    rootDigest !== entry.chainRootReceiptDigest
    || rootSource !== entry.chainRootPagesSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID');
}

function assertInventoryAuthorities(inventory) {
  for (const entry of inventory) {
    assertReceiptGitProvenance(entry.receipt);
    assertReceiptReleaseBinding(entry);
  }
}

function assertInventoryCanAddSuccessor(inventory) {
  if (inventory.some(
    entry => entry.receipt.chain.generation >= MAX_CHAIN_GENERATION,
  )) fail('NOTIFICATION_PAGES_LIVE_CHAIN_GENERATION_EXHAUSTED');
}

function assertProspectiveReceiptGitProvenance({
  predecessor,
  candidate,
  bridgeSourceCommit,
  sourceRelease = predecessor.receipt.sourceRelease,
}) {
  for (const commit of [
    sourceRelease.atlasSourceCommit,
    sourceRelease.moduleSourceCommit,
    bridgeSourceCommit,
    candidate,
  ]) exactCommit(commit, 'NOTIFICATION_PAGES_LIVE_GIT_SOURCE_INVALID');
  assertAncestor(
    sourceRelease.atlasSourceCommit,
    sourceRelease.moduleSourceCommit,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertAncestor(
    sourceRelease.moduleSourceCommit,
    candidate,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertAncestor(
    bridgeSourceCommit,
    candidate,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  assertActiveEvidenceSourceNoDrift(
    sourceRelease.moduleSourceCommit,
    candidate,
  );
}

function assertCandidateStaticAuthority({
  predecessor,
  candidate,
  bridgeSourceCommit,
  sourceRelease,
  staged = false,
}) {
  assertCandidateReleaseBinding({ candidate, predecessor });
  assertCandidateAuxiliaryReleaseBindingTransition({
    candidate,
    predecessor,
    staged,
  });
  assertSuccessorPresentationPhase(candidate);
  assertHermesSourceTransition({ predecessor, candidate, staged });
  assertProspectiveReceiptGitProvenance({
    predecessor,
    candidate,
    bridgeSourceCommit,
    sourceRelease,
  });
}

export function parseNotificationPagesActivationPhaseSources({
  pagesWorkflowSource,
  hermesSource,
} = {}) {
  if (
    typeof pagesWorkflowSource !== 'string'
    || pagesWorkflowSource.length < 1
    || pagesWorkflowSource.length > 512 * 1024
    || typeof hermesSource !== 'string'
    || hermesSource.length < 1
    || hermesSource.length > 512 * 1024
  ) fail('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_SOURCE_INVALID');
  return Object.freeze({
    pagesPresentationEnabled:
      exactPagesPresentationSource(pagesWorkflowSource),
    hermesExecutionApproved: exactHermesApprovalSource(hermesSource),
  });
}

function notificationPagesSourcePhase(sourceCommit) {
  const hermesSource = sourceAtCommit(
    sourceCommit,
    'scripts/hermes-admin.ts',
    'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID',
  );
  const phase = parseNotificationPagesActivationPhaseSources({
    pagesWorkflowSource: sourceAtCommit(
      sourceCommit,
      '.github/workflows/deploy-pages.yml',
      'NOTIFICATION_PAGES_LIVE_PAGES_PHASE_INVALID',
    ),
    hermesSource,
  });
  assertHermesDirectImportClosure(hermesSource);
  assertHermesAuthorityImportClosure(sourceCommit);
  assertActiveEvidenceImportClosure(sourceCommit);
  return phase;
}

function assertActivationPresentationPhase(sourceCommit) {
  const phase = notificationPagesSourcePhase(sourceCommit);
  if (!phase.pagesPresentationEnabled || phase.hermesExecutionApproved) {
    fail('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
  }
}

function assertSuccessorPresentationPhase(sourceCommit) {
  if (!notificationPagesSourcePhase(sourceCommit).pagesPresentationEnabled) {
    fail('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
  }
}

async function readBoundedResponseClone(response, maximumBytes) {
  const advertised = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  if (
    advertised !== null
    && (!/^(?:0|[1-9][0-9]*)$/u.test(advertised)
      || Number(advertised) > maximumBytes)
  ) fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID');
  let clone;
  try {
    clone = response.clone();
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
  }
  if (!clone.body) fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
  const reader = clone.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
  } finally {
    reader.releaseLock();
  }
  // Fetch exposes decoded response bytes while intermediaries such as
  // Cloudflare may preserve the compressed wire Content-Length. Equality is
  // meaningful only when no content coding was applied (or identity was
  // explicitly declared); both representations remain independently bounded.
  if (
    advertised !== null
    && (
      contentEncoding === null
      || /^identity$/iu.test(contentEncoding)
    )
    && Number(advertised) !== total
  ) {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID');
  }
  const bytes = Buffer.alloc(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function runtimeAssetReference(specifier, current, sourceKind) {
  if (
    typeof specifier !== 'string'
    || specifier.length < 1
    || specifier.length > 512
    || /[\\\u0000-\u001f\u007f]/u.test(specifier)
  ) return undefined;
  const hasRuntimeAssetExtension = sourceKind === 'html'
    ? /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webp)$/iu.test(specifier)
    : sourceKind === 'css'
      ? /\.(?:avif|css|gif|ico|jpe?g|js|mjs|mp3|mp4|otf|png|svg|ttf|wav|webm|webp|woff2?)$/iu
        .test(specifier)
      : /\.(?:css|js|mjs)$/iu.test(specifier);
  if (!hasRuntimeAssetExtension) return undefined;
  let resolved;
  try {
    const rootRelative = /^(?:assets|audio|images|models|video)\//u
      .test(specifier);
    resolved = rootRelative
      ? new URL(`/${specifier}`, NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN)
      : new URL(specifier, current);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  }
  if (
    resolved.origin !== NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
    || resolved.pathname === '/'
    || resolved.search
    || resolved.hash
  ) return undefined;
  return resolved.href;
}

function runtimeAssetReferences(source, current, sourceKind) {
  const references = new Set();
  for (const match of source.matchAll(
    /(["'`])([^"'`\n\r]{1,512})\1/gu,
  )) {
    const referenced = runtimeAssetReference(match[2], current, sourceKind);
    if (referenced !== undefined) references.add(referenced);
  }
  for (const match of source.matchAll(
    /\burl\(\s*([^"'`\s)][^\s)]{0,511})\s*\)/gu,
  )) {
    const referenced = runtimeAssetReference(match[1], current, sourceKind);
    if (referenced !== undefined) references.add(referenced);
  }
  return references;
}

function isTraversableFrontendAsset(entry) {
  const contentType = entry.contentType.toLowerCase();
  return /(?:java|ecma)script|text\/css/u.test(contentType);
}

function validFrontendAssetMetadata(status, contentTypeValue, url) {
  const contentType = contentTypeValue.toLowerCase();
  const pathname = new URL(url).pathname;
  const validMime = /\.m?js$/iu.test(pathname)
    ? /(?:java|ecma)script/u.test(contentType)
    : /\.css$/iu.test(pathname)
      ? contentType.startsWith('text/css')
      : /\.svg$/iu.test(pathname)
        ? contentType.startsWith('image/svg+xml')
        : /\.(?:avif|gif|ico|jpe?g|png|webp)$/iu.test(pathname)
          ? contentType.startsWith('image/')
          : /\.(?:otf|ttf|woff2?)$/iu.test(pathname)
            ? /(?:font|application)\//u.test(contentType)
            : /\.(?:mp3|wav)$/iu.test(pathname)
              ? contentType.startsWith('audio/')
              : /\.(?:mp4|webm)$/iu.test(pathname)
                ? contentType.startsWith('video/')
            : false;
  return status === 200 && validMime;
}

function validFrontendAssetResponse(response, url) {
  return validFrontendAssetMetadata(
    response.status,
    response.headers.get('content-type') ?? '',
    url,
  );
}

async function fetchExactLiveFrontendAttestation({
  expectedBuildSha,
  expectedNotificationsPresentationEnabled,
  fetchImpl,
}) {
  if (expectedNotificationsPresentationEnabled !== true) {
    fail('NOTIFICATION_PAGES_LIVE_PRESENTATION_EXPECTATION_INVALID');
  }
  const captures = new Map();
  const responseBytes = new Map();
  let aggregateBytes = 0;
  const captureFetch = async (input, init) => {
    const requested = input instanceof Request ? input.url : String(input);
    let url;
    try {
      url = new URL(requested);
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
    }
    const capturesPagesResponse =
      url.origin === NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
      && url.pathname.startsWith('/');
    if (capturesPagesResponse) {
      if (captures.has(url.href)) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_DUPLICATE');
      }
      if (captures.size >= MAX_FRONTEND_ASSET_COUNT + 1) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
      }
    }
    const response = await fetchImpl(input, init);
    if (!(response instanceof Response)) {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
    }
    if (
      capturesPagesResponse
    ) {
      if (
        url.pathname !== '/'
        && !validFrontendAssetResponse(response, url.href)
      ) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
      }
      const maximum = url.pathname === '/'
        ? MAX_FRONTEND_DOCUMENT_BYTES
        : MAX_FRONTEND_ASSET_BYTES;
      const bytes = await readBoundedResponseClone(response, maximum);
      try {
        aggregateBytes += bytes.byteLength;
        if (aggregateBytes > MAX_FRONTEND_AGGREGATE_BYTES) {
          fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID');
        }
        captures.set(url.href, Object.freeze({
          url: url.href,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          byteLength: bytes.byteLength,
          sha256: digest(bytes),
        }));
        responseBytes.set(url.href, Buffer.from(bytes));
      } finally {
        bytes.fill(0);
      }
    }
    return response;
  };
  try {
    await verifyFrontend(
      NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      expectedBuildSha,
      captureFetch,
    );
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
  }
  const root = captures.get(`${NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN}/`);
  if (root === undefined) {
    for (const bytes of responseBytes.values()) bytes.fill(0);
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  }
  const rootBytes = responseBytes.get(root.url);
  if (rootBytes === undefined) {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  }
  let rootSource;
  try {
    rootSource = new TextDecoder('utf-8', { fatal: true }).decode(rootBytes);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  }
  for (const referenced of [
    ...runtimeAssetReferences(rootSource, root.url, 'html'),
  ].sort()) {
    if (captures.has(referenced)) continue;
    if (captures.size >= MAX_FRONTEND_ASSET_COUNT + 1) {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
    }
    let response;
    try {
      response = await captureFetch(new URL(referenced), {
        method: 'GET',
        headers: { accept: '*/*', 'cache-control': 'no-store' },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof NotificationPagesLiveReceiptError) throw error;
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
    }
    if (!validFrontendAssetResponse(response, referenced)) {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
    }
  }
  const pending = [...captures.values()]
    .filter(entry => entry.url !== `${NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN}/`)
    .map(entry => entry.url);
  const visited = new Set();
  let presentationMarkerCount = 0;
  try {
    while (pending.length > 0) {
      const current = pending.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      if (visited.size > MAX_FRONTEND_ASSET_COUNT) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
      }
      const sourceBytes = responseBytes.get(current);
      if (sourceBytes === undefined) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
      }
      const currentCapture = captures.get(current);
      if (currentCapture === undefined) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
      }
      if (!isTraversableFrontendAsset(currentCapture)) continue;
      let source;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
      } catch {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
      }
      const contentType = currentCapture.contentType.toLowerCase();
      const sourceKind = contentType.includes('text/css') ? 'css' : 'js';
      if (sourceKind === 'js') {
        let markerOffset = source.indexOf(NOTIFICATIONS_PRESENTATION_MARKER);
        while (markerOffset !== -1) {
          presentationMarkerCount += 1;
          markerOffset = source.indexOf(
            NOTIFICATIONS_PRESENTATION_MARKER,
            markerOffset + NOTIFICATIONS_PRESENTATION_MARKER.length,
          );
        }
      }
      const references = runtimeAssetReferences(source, current, sourceKind);
      for (const referenced of [...references].sort()) {
        if (captures.has(referenced)) {
          pending.push(referenced);
          continue;
        }
        if (captures.size >= MAX_FRONTEND_ASSET_COUNT + 1) {
          fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
        }
        let response;
        try {
          response = await captureFetch(new URL(referenced), {
            method: 'GET',
            headers: { accept: '*/*', 'cache-control': 'no-store' },
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(10_000),
          });
        } catch (error) {
          if (error instanceof NotificationPagesLiveReceiptError) throw error;
          fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
        }
        if (!validFrontendAssetResponse(response, referenced)) {
          fail('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
        }
        pending.push(referenced);
      }
    }
  } finally {
    for (const bytes of responseBytes.values()) bytes.fill(0);
  }
  const assets = [...captures.values()]
    .filter(entry => entry.url !== `${NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN}/`)
    .sort((left, right) => left.url.localeCompare(right.url));
  if (
    assets.length < 1
    || assets.length > MAX_FRONTEND_ASSET_COUNT
    || captures.size !== assets.length + 1
  ) fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  if (presentationMarkerCount !== 1) {
    fail('NOTIFICATION_PAGES_LIVE_PRESENTATION_MARKER_INVALID');
  }
  const manifest = Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-notification-pages-presentation-manifest-v1',
    origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
    expectedBuildSha,
    scope: 'root-html-plus-executable-style-closure',
    notificationsPresentationEnabled: true,
    document: root,
    assets: Object.freeze(assets),
  });
  const notificationPresentationDigest = createHash('sha256')
    .update('warpkeep-notification-pages-presentation-v1\0', 'utf8')
    .update(JSON.stringify(manifest), 'utf8')
    .digest('hex');
  return Object.freeze({
    notificationPresentationDigest,
    notificationPresentationAssetCount: assets.length,
  });
}

function observedFrontendBuildSha(sources) {
  const observed = new Map([
    ['VITE_WARPKEEP_BUILD_SHA', []],
    ['buildSha', []],
  ]);
  for (const bytes of sources) {
    let source;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
    }
    for (const match of source.matchAll(DEPLOYED_BUILD_SHA_SENTINEL)) {
      observed.get(match[1]).push(match[3]);
    }
  }
  const environmentValues = observed.get('VITE_WARPKEEP_BUILD_SHA');
  const buildInfoValues = observed.get('buildSha');
  if (
    environmentValues.length !== 1
    || buildInfoValues.length !== 1
    || environmentValues[0] !== buildInfoValues[0]
  ) {
    fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
  }
  return environmentValues[0];
}

async function probeExactDeployedBuildSha(fetchImpl) {
  const sources = [];
  const captureFetch = async (input, init) => {
    const requested = input instanceof Request ? input.url : String(input);
    let url;
    try {
      url = new URL(requested);
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
    }
    let response;
    try {
      response = await fetchImpl(input, init);
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
    }
    if (!(response instanceof Response)) {
      fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
    }
    if (
      url.origin === NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
      && /\/assets\/[^/]+\.m?js$/iu.test(url.pathname)
    ) {
      if (!validFrontendAssetResponse(response, url.href)) {
        fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
      }
      let bytes;
      try {
        bytes = await readBoundedResponseClone(
          response,
          MAX_FRONTEND_ASSET_BYTES,
        );
        sources.push(Buffer.from(bytes));
      } catch {
        fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
      } finally {
        bytes?.fill(0);
      }
    }
    return response;
  };
  try {
    await verifyFrontend(
      NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      undefined,
      captureFetch,
    );
    return observedFrontendBuildSha(sources);
  } catch (error) {
    if (
      error instanceof NotificationPagesLiveReceiptError
      && error.code === 'NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS'
    ) throw error;
    fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
  } finally {
    for (const bytes of sources) bytes.fill(0);
  }
}

/**
 * Non-mutating gen-0 recovery probe. A different exact build sentinel is the
 * only safe negative. Matching builds must pass the complete presentation
 * closure and marker contract; every transport/content ambiguity throws.
 * `definitely-not-current` describes only the public response observed by
 * this probe. It is not evidence that no Pages deployment was invoked and may
 * authorize a deploy only before a durable deploy-invoked journal transition.
 */
export async function reconcileNotificationPagesLiveCandidate({
  repositoryRoot,
  candidatePagesSourceCommit,
  fetchImpl = fetch,
} = {}) {
  canonicalRepositoryRoot(repositoryRoot);
  const candidate = exactCommit(
    candidatePagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_SOURCE_INVALID',
  );
  if (currentHead() !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');
  }
  assertCleanProtectedCheckout();
  const observedPagesSourceCommit = await probeExactDeployedBuildSha(fetchImpl);
  if (observedPagesSourceCommit !== candidate) {
    assertExactCleanHead(candidate);
    return Object.freeze({
      status: 'definitely-not-current',
      candidatePagesSourceCommit: candidate,
      observedPagesSourceCommit,
    });
  }
  let presentation;
  try {
    presentation = await fetchExactLiveFrontendAttestation({
      expectedBuildSha: candidate,
      expectedNotificationsPresentationEnabled: true,
      fetchImpl,
    });
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');
  }
  assertExactCleanHead(candidate);
  return Object.freeze({
    status: 'exact-current',
    candidatePagesSourceCommit: candidate,
    ...presentation,
  });
}

function buildPreparedBinding(handoff) {
  const receipt = handoff.preparedReceipt;
  return Object.freeze({
    receiptDigest: handoff.preparedReceiptDigest,
    bridgeOrigin: receipt.bridgeOrigin,
    bridgeSourceCommit: receipt.bridgeSourceCommit,
    notificationDeliveryContractDigest:
      receipt.notificationDeliveryContractDigest,
    notificationClientCount: receipt.notificationClientCount,
    notificationDeliveryEnabled: receipt.notificationDeliveryEnabled,
    notificationTransportConfigured: receipt.notificationTransportConfigured,
    admissionNotificationStoreConfigured:
      receipt.admissionNotificationStoreConfigured,
    publicAuthEnabledBefore: receipt.publicAuthEnabledBefore,
    publicAuthEnabledAfter: receipt.publicAuthEnabledAfter,
    accessExpectedFidRequiredBefore:
      receipt.accessExpectedFidRequiredBefore,
    accessExpectedFidRequiredAfter: receipt.accessExpectedFidRequiredAfter,
    hermesExecutionApproved: receipt.hermesExecutionApproved,
    pagesPresentationEnabled: receipt.pagesPresentationEnabled,
    liveAttestationDigest: receipt.liveAttestationDigest,
    preparedAt: receipt.preparedAt,
    expiresAt: receipt.expiresAt,
  });
}

function buildReceipt(
  handoff,
  recordedAt,
  frontendAttestation,
  refreshedLiveAttestation,
) {
  const liveAttestation = parseAuthBridgeReleaseAttestation(
    refreshedLiveAttestation,
  );
  const liveAttestationDigest = canonicalAuthBridgeReleaseAttestationDigest(
    liveAttestation,
  );
  return parseNotificationPagesLiveReceipt({
    schemaVersion: 1,
    kind: NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
    recordedAt: recordedAt.toISOString(),
    repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
    handoff: {
      digest: handoff.handoffDigest,
      keyId: handoff.keyId,
      workflow: NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW,
      workflowRunId: handoff.workflowRunId,
      workflowRunAttempt: handoff.workflowRunAttempt,
      createdAt: handoff.createdAt,
      expiresAt: handoff.expiresAt,
      preparedReceiptDigest: handoff.preparedReceiptDigest,
      activeV17EvidenceDigest: handoff.activeV17EvidenceDigest,
      deployedModuleReceiptDigest: handoff.deployedModuleReceiptDigest,
      activeEvidenceMaximumAgeMilliseconds:
        handoff.activeEvidenceMaximumAgeMilliseconds,
    },
    chain: {
      generation: 0,
      previousReceiptDigest: null,
      previousPagesSourceCommit: null,
      candidateAuthorityDigest: null,
    },
    pages: {
      origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      sourceCommit: handoff.pagesSourceCommit,
      liveBuildSha: handoff.pagesSourceCommit,
      notificationPresentationDigest:
        frontendAttestation.notificationPresentationDigest,
      notificationPresentationAssetCount:
        frontendAttestation.notificationPresentationAssetCount,
      notificationsPresentationEnabled: true,
      hermesExecutionApprovedAtActivation: false,
    },
    bridge: {
      origin: NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN,
      sourceCommit: handoff.bridgeSourceCommit,
      liveAttestationDigest,
      liveAttestation,
    },
    sourceRelease: handoff.sourceRelease,
    expectedFounderCount: handoff.expectedFounderCount,
    preparedBinding: buildPreparedBinding(handoff),
  }, { now: recordedAt });
}

function buildSuccessorReceipt({
  previous,
  previousReceiptDigest,
  candidatePagesSourceCommit,
  recordedAt,
  frontendAttestation,
  liveAttestation,
  stagedHandoffBinding,
  candidateAuthorityDigest,
}) {
  const source = stagedHandoffBinding === null
    ? Object.freeze({
      handoff: previous.handoff,
      bridgeSourceCommit: previous.bridge.sourceCommit,
      sourceRelease: previous.sourceRelease,
      expectedFounderCount: previous.expectedFounderCount,
      preparedBinding: previous.preparedBinding,
    })
    : Object.freeze({
      handoff: stagedHandoffBinding.handoff,
      bridgeSourceCommit: stagedHandoffBinding.bridgeSourceCommit,
      sourceRelease: stagedHandoffBinding.sourceRelease,
      expectedFounderCount: stagedHandoffBinding.expectedFounderCount,
      preparedBinding: stagedHandoffBinding.preparedBinding,
    });
  const parsedLive = parseAuthBridgeReleaseAttestation(liveAttestation);
  return parseNotificationPagesLiveReceipt({
    schemaVersion: 1,
    kind: NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
    recordedAt: recordedAt.toISOString(),
    repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
    handoff: source.handoff,
    chain: {
      generation: previous.chain.generation + 1,
      previousReceiptDigest,
      previousPagesSourceCommit: previous.pages.sourceCommit,
      candidateAuthorityDigest,
    },
    pages: {
      origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      sourceCommit: candidatePagesSourceCommit,
      liveBuildSha: candidatePagesSourceCommit,
      notificationPresentationDigest:
        frontendAttestation.notificationPresentationDigest,
      notificationPresentationAssetCount:
        frontendAttestation.notificationPresentationAssetCount,
      notificationsPresentationEnabled: true,
      hermesExecutionApprovedAtActivation: false,
    },
    bridge: {
      origin: NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN,
      sourceCommit: source.bridgeSourceCommit,
      liveAttestationDigest:
        canonicalAuthBridgeReleaseAttestationDigest(parsedLive),
      liveAttestation: parsedLive,
    },
    sourceRelease: source.sourceRelease,
    expectedFounderCount: source.expectedFounderCount,
    preparedBinding: source.preparedBinding,
  }, { now: recordedAt });
}

function readExactExpectedFile(path, expected) {
  const opened = stableFile(
    path,
    1,
    'NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH',
  );
  try {
    if (!opened.bytes.equals(expected)) {
      fail('NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH');
    }
  } finally {
    opened.bytes.fill(0);
  }
}

function installCanonicalPrivateBytes({
  directory,
  basename,
  temporaryPrefix,
  bytes,
  randomBytesImpl,
}) {
  const destination = join(directory, basename);
  if (existsSync(destination)) {
    readExactExpectedFile(destination, bytes);
    return Object.freeze({ path: destination, result: 'unchanged' });
  }
  if (boundedEntries(directory).length > MAX_DIRECTORY_ENTRIES - 2) {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
  }
  const suffix = temporarySuffix(randomBytesImpl ?? randomBytes);
  const temporary = join(
    directory,
    `.${temporaryPrefix}-${suffix}.json.tmp`,
  );
  let descriptor;
  let identity;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const created = fstatSync(descriptor);
    identity = Object.freeze({ dev: created.dev, ino: created.ino });
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
      );
      if (written <= 0) fail('NOTIFICATION_PAGES_LIVE_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    fchmodSync(descriptor, FILE_MODE);
    fsyncSync(descriptor);
    const complete = fstatSync(descriptor);
    if (
      complete.dev !== identity.dev
      || complete.ino !== identity.ino
      || complete.size !== bytes.byteLength
      || complete.nlink !== 1
      || (complete.mode & 0o7777) !== FILE_MODE
    ) fail('NOTIFICATION_PAGES_LIVE_RECEIPT_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, destination);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      repairLinkedTemporaries(directory);
      readExactExpectedFile(destination, bytes);
    }
    unlinkExact(temporary, identity);
    identity = undefined;
    fsyncDirectory(directory);
    readExactExpectedFile(destination, bytes);
    return Object.freeze({ path: destination, result: 'installed' });
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve primary error. */ }
    }
    if (identity !== undefined) {
      try { unlinkExact(temporary, identity); } catch { /* Preserve primary error. */ }
    }
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_RECEIPT_WRITE_FAILED');
  }
}

function temporarySuffix(randomBytesImpl) {
  let bytes;
  try {
    bytes = randomBytesImpl(12);
    if (!Buffer.isBuffer(bytes) || bytes.byteLength !== 12) {
      fail('NOTIFICATION_PAGES_LIVE_RANDOM_INVALID');
    }
    return bytes.toString('hex');
  } catch (error) {
    if (error instanceof NotificationPagesLiveReceiptError) throw error;
    fail('NOTIFICATION_PAGES_LIVE_RANDOM_INVALID');
  } finally {
    bytes?.fill(0);
  }
}

function sameReceiptBinding(left, right) {
  const { recordedAt: _leftRecordedAt, ...leftBinding } = left;
  const { recordedAt: _rightRecordedAt, ...rightBinding } = right;
  return JSON.stringify(leftBinding) === JSON.stringify(rightBinding);
}

function readSourceReservation(path, sourceCommit, now) {
  const opened = stableFile(
    path,
    1,
    'NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID',
  );
  try {
    const receipt = parseCanonicalReceiptBytes(opened.bytes, { now });
    if (receipt.pages.sourceCommit !== sourceCommit) {
      fail('NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID');
    }
    return Object.freeze({
      receipt,
      receiptDigest: digest(opened.bytes),
      bytes: Buffer.from(opened.bytes),
    });
  } finally {
    opened.bytes.fill(0);
  }
}

function reserveReceiptSource({
  directory,
  receipt,
  bytes,
  randomBytesImpl,
}) {
  const sourceCommit = receipt.pages.sourceCommit;
  const basename = `notification-pages-live-source-${sourceCommit}.json`;
  try {
    installCanonicalPrivateBytes({
      directory,
      basename,
      temporaryPrefix: `notification-pages-live-source-${sourceCommit}`,
      bytes,
      randomBytesImpl,
    });
  } catch (error) {
    if (
      !(error instanceof NotificationPagesLiveReceiptError)
      || error.code !== 'NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH'
    ) throw error;
  }
  const reserved = readSourceReservation(
    join(directory, basename),
    sourceCommit,
    new Date(receipt.recordedAt),
  );
  if (!sameReceiptBinding(reserved.receipt, receipt)) {
    reserved.bytes.fill(0);
    fail('NOTIFICATION_PAGES_LIVE_SOURCE_ALREADY_BOUND');
  }
  return reserved;
}

function reserveReceiptSuccessor({
  directory,
  receipt,
  bytes,
  randomBytesImpl,
}) {
  if (receipt.chain.generation === 0) {
    try {
      installCanonicalPrivateBytes({
        directory,
        basename: ROOT_FILE,
        temporaryPrefix: 'notification-pages-live-root',
        bytes,
        randomBytesImpl,
      });
    } catch (error) {
      if (
        !(error instanceof NotificationPagesLiveReceiptError)
        || error.code !== 'NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH'
      ) throw error;
    }
    const opened = stableFile(
      join(directory, ROOT_FILE),
      1,
      'NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID',
    );
    try {
      const reservedReceipt = parseCanonicalReceiptBytes(opened.bytes, {
        now: new Date(receipt.recordedAt),
      });
      if (
        reservedReceipt.chain.generation !== 0
        || !sameReceiptBinding(reservedReceipt, receipt)
      ) fail('NOTIFICATION_PAGES_LIVE_ROOT_ALREADY_BOUND');
      return Object.freeze({
        receipt: reservedReceipt,
        receiptDigest: digest(opened.bytes),
        bytes: Buffer.from(opened.bytes),
      });
    } finally {
      opened.bytes.fill(0);
    }
  }
  const previousDigest = receipt.chain.previousReceiptDigest;
  const basename = `notification-pages-live-successor-${previousDigest}.json`;
  try {
    installCanonicalPrivateBytes({
      directory,
      basename,
      temporaryPrefix: `notification-pages-live-successor-${previousDigest}`,
      bytes,
      randomBytesImpl,
    });
  } catch (error) {
    if (
      !(error instanceof NotificationPagesLiveReceiptError)
      || error.code !== 'NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH'
    ) throw error;
  }
  const opened = stableFile(
    join(directory, basename),
    1,
    'NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID',
  );
  try {
    const reservedReceipt = parseCanonicalReceiptBytes(opened.bytes, {
      now: new Date(receipt.recordedAt),
    });
    if (
      reservedReceipt.chain.previousReceiptDigest !== previousDigest
      || !sameReceiptBinding(reservedReceipt, receipt)
    ) fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_ALREADY_BOUND');
    return Object.freeze({
      receipt: reservedReceipt,
      receiptDigest: digest(opened.bytes),
      bytes: Buffer.from(opened.bytes),
    });
  } finally {
    opened.bytes.fill(0);
  }
}

function chainRootForNewReceipt(receipt, receiptDigest, inventory) {
  if (receipt.chain.generation === 0) {
    return Object.freeze({
      chainRootReceiptDigest: receiptDigest,
      chainRootPagesSourceCommit: receipt.pages.sourceCommit,
    });
  }
  const previous = inventory.find(
    entry => entry.receiptDigest === receipt.chain.previousReceiptDigest,
  );
  if (
    previous === undefined
    || previous.receipt.pages.sourceCommit
      !== receipt.chain.previousPagesSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
  return Object.freeze({
    chainRootReceiptDigest: previous.chainRootReceiptDigest,
    chainRootPagesSourceCommit: previous.chainRootPagesSourceCommit,
  });
}

function installReceipt({
  directory,
  receipt,
  randomBytesImpl,
}) {
  const proposedBytes = canonicalReceiptBytes(receipt);
  let installedBytes;
  try {
    const canonicalDirectory = directory;
    const inventory = readInventory(canonicalDirectory, {
      now: new Date(receipt.recordedAt),
    });
    const existingSource = inventory.find(
      entry => entry.receipt.pages.sourceCommit === receipt.pages.sourceCommit,
    );
    if (existingSource !== undefined) {
      if (!sameReceiptBinding(existingSource.receipt, receipt)) {
        fail('NOTIFICATION_PAGES_LIVE_SOURCE_ALREADY_BOUND');
      }
      return Object.freeze({
        path: existingSource.path,
        receiptDigest: existingSource.receiptDigest,
        result: 'unchanged',
        receipt: existingSource.receipt,
        preparedBinding: existingSource.receipt.preparedBinding,
        chainRootReceiptDigest: existingSource.chainRootReceiptDigest,
        chainRootPagesSourceCommit: existingSource.chainRootPagesSourceCommit,
      });
    }
    const requiredPermanentEntries = 3;
    if (
      boundedEntries(canonicalDirectory).length
        > MAX_DIRECTORY_ENTRIES - requiredPermanentEntries - 1
    ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
    const successorReserved = reserveReceiptSuccessor({
      directory: canonicalDirectory,
      receipt,
      bytes: proposedBytes,
      randomBytesImpl: randomBytesImpl ?? randomBytes,
    });
    const reserved = reserveReceiptSource({
      directory: canonicalDirectory,
      receipt: successorReserved.receipt,
      bytes: successorReserved.bytes,
      randomBytesImpl: randomBytesImpl ?? randomBytes,
    });
    successorReserved.bytes.fill(0);
    installedBytes = reserved.bytes;
    const installedReceipt = reserved.receipt;
    const receiptDigest = reserved.receiptDigest;
    const chainRoot = chainRootForNewReceipt(
      installedReceipt,
      receiptDigest,
      inventory,
    );
    const basename = `notification-pages-live-${receiptDigest}.json`;
    const installed = installCanonicalPrivateBytes({
      directory: canonicalDirectory,
      basename,
      temporaryPrefix: `notification-pages-live-${receiptDigest}`,
      bytes: installedBytes,
      randomBytesImpl: randomBytesImpl ?? randomBytes,
    });
    const verified = readInventory(canonicalDirectory, {
      now: new Date(installedReceipt.recordedAt),
    }).find(entry => entry.receiptDigest === receiptDigest);
    if (verified === undefined) fail('NOTIFICATION_PAGES_LIVE_INCOMPLETE_INSTALL');
    return Object.freeze({
      path: installed.path,
      receiptDigest,
      result: installed.result,
      receipt: installedReceipt,
      preparedBinding: installedReceipt.preparedBinding,
      ...chainRoot,
    });
  } finally {
    proposedBytes.fill(0);
    installedBytes?.fill(0);
  }
}

function canonicalHandoffExpectations(value) {
  if (
    !exactOrderedKeys(value, HANDOFF_EXPECTATION_KEYS)
    || typeof value.handoffPath !== 'string'
    || !isAbsolute(value.handoffPath)
    || typeof value.keyPath !== 'string'
    || !isAbsolute(value.keyPath)
    || value.handoffPath === value.keyPath
    || !SHA256.test(value.expectedHandoffDigest)
    || !SHA256.test(value.expectedKeyId)
    || !RUN_ID.test(value.expectedWorkflowRunId)
    || !RUN_ID.test(value.expectedWorkflowRunAttempt)
    || !SOURCE_COMMIT.test(value.expectedPagesSourceCommit)
    || !validFounderCount(value.expectedFounderCount)
    || !Number.isSafeInteger(
      value.expectedActiveEvidenceMaximumAgeMilliseconds,
    )
    || value.expectedActiveEvidenceMaximumAgeMilliseconds < 1
    || value.expectedActiveEvidenceMaximumAgeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
    || !SHA256.test(value.expectedPreparedReceiptDigest)
    || !SHA256.test(value.expectedActiveV17EvidenceDigest)
    || !SHA256.test(value.expectedDeployedModuleReceiptDigest)
    || !SOURCE_COMMIT.test(value.expectedBridgeSourceCommit)
  ) {
    fail('NOTIFICATION_PAGES_LIVE_HANDOFF_EXPECTATIONS_INVALID');
  }
  return Object.freeze(Object.fromEntries(
    HANDOFF_EXPECTATION_KEYS.map(key => [key, value[key]]),
  ));
}

async function fetchExactLiveFrontendBinding(receipt, fetchImpl) {
  const frontend = await fetchExactLiveFrontendAttestation({
    expectedBuildSha: receipt.pages.liveBuildSha,
    expectedNotificationsPresentationEnabled:
      receipt.pages.notificationsPresentationEnabled,
    fetchImpl,
  });
  if (
    frontend.notificationPresentationDigest
      !== receipt.pages.notificationPresentationDigest
    || frontend.notificationPresentationAssetCount
      !== receipt.pages.notificationPresentationAssetCount
  ) fail('NOTIFICATION_PAGES_LIVE_FRONTEND_CONTENT_MISMATCH');
  return frontend;
}

async function verifyExactLiveBindings(receipt, fetchImpl, now) {
  const frontend = await fetchExactLiveFrontendBinding(receipt, fetchImpl);
  let live;
  try {
    live = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_INVALID');
  }
  if (
    live.digest !== receipt.bridge.liveAttestationDigest
    || JSON.stringify(live.attestation)
      !== JSON.stringify(receipt.bridge.liveAttestation)
  ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_MISMATCH');
  return Object.freeze({
    liveAttestation: live.attestation,
    frontendAttestation: frontend,
  });
}

/**
 * Consume the strict encrypted handoff in-process, prove the exact live Pages
 * build and fresh bridge poststate, then durably publish a non-expiring binding.
 */
export async function writePrivateNotificationPagesLiveReceipt({
  directory,
  repositoryRoot,
  handoffExpectations,
  expectedNotificationsPresentationEnabled,
  expectedHermesExecutionApproved,
  fetchImpl = fetch,
  now = new Date(),
  randomBytesImpl = randomBytes,
} = {}) {
  exactDate(now, 'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID');
  if (
    expectedNotificationsPresentationEnabled !== true
    || expectedHermesExecutionApproved !== false
  ) fail('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
  if (typeof randomBytesImpl !== 'function') {
    fail('NOTIFICATION_PAGES_LIVE_RANDOM_INVALID');
  }
  validateDirectoryRequest(directory, repositoryRoot);
  const expectations = canonicalHandoffExpectations(handoffExpectations);
  assertCleanProtectedCheckout();
  const head = currentHead();
  if (expectations.expectedPagesSourceCommit !== head) {
    fail('NOTIFICATION_PAGES_LIVE_PAGES_SOURCE_NOT_HEAD');
  }
  return withWriterLock({
    directory,
    repositoryRoot,
    randomBytesImpl,
  }, async canonicalDirectory => {
    const preflightInventory = readInventory(canonicalDirectory, { now });
    if (preflightInventory.length > 0) {
      assertInventoryAuthorities(preflightInventory);
      const existing = preflightInventory.length === 1
        ? preflightInventory[0]
        : undefined;
      if (
        existing === undefined
        || existing.receipt.chain.generation !== 0
        || existing.receipt.pages.sourceCommit !== head
      ) fail('NOTIFICATION_PAGES_LIVE_ROOT_ALREADY_BOUND');
      // The authenticated handoff authorizes the no-replace root creation.
      // Once that root is durable, replay authority comes from the canonical
      // private receipt itself; a crashed job must remain recoverable after its
      // short-lived handoff files and preparation window are gone.
      await verifyExactLiveBindings(existing.receipt, fetchImpl, now);
      assertExactCleanHead(head);
      return Object.freeze({
        path: existing.path,
        receiptDigest: existing.receiptDigest,
        result: 'unchanged',
        receipt: existing.receipt,
        preparedBinding: existing.receipt.preparedBinding,
        chainRootReceiptDigest: existing.chainRootReceiptDigest,
        chainRootPagesSourceCommit: existing.chainRootPagesSourceCommit,
      });
    }
    if (boundedEntries(canonicalDirectory).length > MAX_DIRECTORY_ENTRIES - 4) {
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
    }
    assertActivationPresentationPhase(head);
    assertCandidateReleaseBinding({ candidate: head, predecessor: null });
    let handoff;
    try {
      handoff = await inspectNotificationPagesPrivateHandoff({
        ...expectations,
        repositoryRoot,
        fetchImpl,
        now,
      });
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_HANDOFF_INVALID');
    }
    if (handoff.pagesSourceCommit !== head) {
      fail('NOTIFICATION_PAGES_LIVE_PAGES_SOURCE_NOT_HEAD');
    }
    const frontendAttestation = await fetchExactLiveFrontendAttestation({
      expectedBuildSha: handoff.pagesSourceCommit,
      expectedNotificationsPresentationEnabled:
        expectedNotificationsPresentationEnabled,
      fetchImpl,
    });
    let refreshedBridge;
    try {
      refreshedBridge = await fetchFreshAuthBridgeReleaseAttestation({
        fetchImpl,
        now,
      });
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_INVALID');
    }
    if (
      refreshedBridge.digest
        !== canonicalAuthBridgeReleaseAttestationDigest(handoff.liveAttestation)
      || JSON.stringify(refreshedBridge.attestation)
        !== JSON.stringify(handoff.liveAttestation)
    ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_MISMATCH');
    const receipt = buildReceipt(
      handoff,
      now,
      frontendAttestation,
      refreshedBridge.attestation,
    );
    assertReceiptGitProvenance(receipt);
    assertExactCleanHead(head);
    return installReceipt({
      directory: canonicalDirectory,
      receipt,
      randomBytesImpl,
    });
  });
}

function staticInventory({ directory, repositoryRoot, now }) {
  exactDate(now, 'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID');
  const canonicalDirectory = ensureNotificationPagesLiveReceiptDirectoryBase({
    directory,
    repositoryRoot,
  });
  const lockDirectory = dirname(canonicalDirectory);
  const lock = acquireWriterLock(lockDirectory, canonicalDirectory, randomBytes);
  try {
    repairNotificationPagesLiveReceiptDirectory(
      canonicalDirectory,
      repositoryRoot,
    );
    const inventory = readInventory(canonicalDirectory, { now });
    assertInventoryAuthorities(inventory);
    return inventory;
  } finally {
    releaseWriterLock(lockDirectory, lock);
  }
}

function staticReceiptEntryBySource({
  directory,
  repositoryRoot,
  pagesSourceCommit,
  now,
}) {
  const inventory = staticInventory({ directory, repositoryRoot, now });
  const entry = inventory.find(
    candidate => candidate.receipt.pages.sourceCommit === pagesSourceCommit,
  );
  if (entry === undefined) fail('NOTIFICATION_PAGES_LIVE_RECEIPT_NOT_FOUND');
  return entry;
}

function assertExpectedChainRoot(
  entry,
  expectedChainRootReceiptDigest,
  expectedChainRootPagesSourceCommit,
) {
  if (
    typeof expectedChainRootReceiptDigest !== 'string'
    || !SHA256.test(expectedChainRootReceiptDigest)
    || typeof expectedChainRootPagesSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(expectedChainRootPagesSourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_ROOT_EXPECTATION_INVALID');
  if (
    entry.chainRootReceiptDigest !== expectedChainRootReceiptDigest
    || entry.chainRootPagesSourceCommit
      !== expectedChainRootPagesSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_CHAIN_ROOT_MISMATCH');
}

async function inspectEntry(entry, fetchImpl, now) {
  const live = await verifyExactLiveBindings(
    entry.receipt,
    fetchImpl,
    now,
  );
  return Object.freeze({
    path: entry.path,
    receiptDigest: entry.receiptDigest,
    receipt: entry.receipt,
    preparedBinding: entry.receipt.preparedBinding,
    chainRootReceiptDigest: entry.chainRootReceiptDigest,
    chainRootPagesSourceCommit: entry.chainRootPagesSourceCommit,
    liveAttestation: live.liveAttestation,
  });
}

/** Exact Pages-source lookup intended for the Hermes notification authority. */
export async function inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
  directory,
  repositoryRoot,
  pagesSourceCommit,
  expectedChainRootReceiptDigest,
  expectedChainRootPagesSourceCommit,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  exactCommit(
    pagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_EXPECTED_PAGES_SOURCE_INVALID',
  );
  if (currentHead() !== pagesSourceCommit) {
    fail('NOTIFICATION_PAGES_LIVE_EXPECTED_PAGES_SOURCE_NOT_HEAD');
  }
  assertCleanProtectedCheckout();
  const entry = staticReceiptEntryBySource({
    directory,
    repositoryRoot,
    pagesSourceCommit,
    now,
  });
  assertExpectedChainRoot(
    entry,
    expectedChainRootReceiptDigest,
    expectedChainRootPagesSourceCommit,
  );
  const inspected = await inspectEntry(entry, fetchImpl, now);
  assertExactCleanHead(pagesSourceCommit);
  return inspected;
}

/**
 * Exact historical C6 lookup used only while an exact clean C7 descendant is
 * being privately authenticated. This is deliberately a separate API from the
 * current-source Hermes lookup so ordinary callers cannot weaken HEAD==source.
 */
export async function inspectPrivateNotificationPagesLiveReceiptForActivationPredecessor({
  directory,
  repositoryRoot,
  candidatePagesSourceCommit,
  pagesSourceCommit,
  expectedChainRootReceiptDigest,
  expectedChainRootPagesSourceCommit,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  canonicalRepositoryRoot(repositoryRoot);
  const candidate = exactCommit(
    candidatePagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_SOURCE_INVALID',
  );
  const predecessor = exactCommit(
    pagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_EXPECTED_PAGES_SOURCE_INVALID',
  );
  if (candidate === predecessor || currentHead() !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_EXPECTED_PREDECESSOR_NOT_CANDIDATE_HEAD');
  }
  assertCleanProtectedCheckout();
  assertProductionPlayerCanaryActivationSourceTransition(
    predecessor,
    candidate,
  );
  const entry = staticReceiptEntryBySource({
    directory,
    repositoryRoot,
    pagesSourceCommit: predecessor,
    now,
  });
  assertExpectedChainRoot(
    entry,
    expectedChainRootReceiptDigest,
    expectedChainRootPagesSourceCommit,
  );
  const inspected = await inspectEntry(entry, fetchImpl, now);
  assertExactCleanHead(candidate);
  return inspected;
}

function commitDistance(ancestor, descendant) {
  const result = gitResult(['rev-list', '--count', `${ancestor}..${descendant}`]);
  const value = result.status === 0 ? result.stdout.trim() : '';
  if (!/^(?:0|[1-9][0-9]{0,9})$/u.test(value)) {
    fail('NOTIFICATION_PAGES_LIVE_GIT_DISTANCE_INVALID');
  }
  const distance = Number(value);
  if (!Number.isSafeInteger(distance)) {
    fail('NOTIFICATION_PAGES_LIVE_GIT_DISTANCE_INVALID');
  }
  return distance;
}

function assertStagedExpectationsMatchBinding(expectations, binding) {
  if (
    expectations === null
    || binding === null
    || expectations.expectedHandoffDigest !== binding.handoff.digest
    || expectations.expectedKeyId !== binding.handoff.keyId
    || expectations.expectedWorkflowRunId !== binding.handoff.workflowRunId
    || expectations.expectedWorkflowRunAttempt
      !== binding.handoff.workflowRunAttempt
    || expectations.expectedPagesSourceCommit !== binding.pagesSourceCommit
    || expectations.expectedFounderCount !== binding.expectedFounderCount
    || expectations.expectedActiveEvidenceMaximumAgeMilliseconds
      !== binding.handoff.activeEvidenceMaximumAgeMilliseconds
    || expectations.expectedPreparedReceiptDigest
      !== binding.handoff.preparedReceiptDigest
    || expectations.expectedActiveV17EvidenceDigest
      !== binding.handoff.activeV17EvidenceDigest
    || expectations.expectedDeployedModuleReceiptDigest
      !== binding.handoff.deployedModuleReceiptDigest
    || expectations.expectedBridgeSourceCommit !== binding.bridgeSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
}

async function inspectDurableCandidateBindings({
  predecessor,
  stagedHandoffBinding,
  fetchImpl,
  now,
}) {
  const frontendAttestation = await fetchExactLiveFrontendBinding(
    predecessor.receipt,
    fetchImpl,
  );
  let bridge;
  try {
    bridge = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_INVALID');
  }
  const expectedBridge = stagedHandoffBinding?.liveAttestation
    ?? predecessor.receipt.bridge.liveAttestation;
  const expectedDigest = canonicalAuthBridgeReleaseAttestationDigest(
    expectedBridge,
  );
  if (
    bridge.digest !== expectedDigest
    || JSON.stringify(bridge.attestation) !== JSON.stringify(expectedBridge)
  ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_MISMATCH');
  return Object.freeze({
    frontendAttestation,
    candidateLiveAttestation: bridge.attestation,
  });
}

function futureCandidateResult({
  predecessor,
  candidate,
  authority,
  authorityDigest,
  authorityPath,
  frontendAttestation,
  candidateLiveAttestation,
}) {
  const staged = authority.stagedHandoffBinding;
  return Object.freeze({
    candidatePagesSourceCommit: candidate,
    livePagesSourceCommit: predecessor.receipt.pages.sourceCommit,
    candidateAlreadyLive: false,
    liveReceiptInspection: Object.freeze({
      path: predecessor.path,
      receiptDigest: predecessor.receiptDigest,
      receipt: predecessor.receipt,
      preparedBinding: predecessor.receipt.preparedBinding,
      chainRootReceiptDigest: predecessor.chainRootReceiptDigest,
      chainRootPagesSourceCommit: predecessor.chainRootPagesSourceCommit,
      frontendAttestation,
    }),
    candidateAuthorityPath: authorityPath,
    candidateAuthorityDigest: authorityDigest,
    candidateAuthority: authority,
    candidatePreparedBinding:
      staged?.preparedBinding ?? predecessor.receipt.preparedBinding,
    candidateLiveAttestation,
    preparedBinding: predecessor.receipt.preparedBinding,
    liveAttestation: candidateLiveAttestation,
  });
}

/**
 * Resolve the nearest live ancestor for a future Pages candidate. The checkout
 * must be that exact candidate and notification-critical bytes must be equal.
 */
export async function inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
  directory,
  repositoryRoot,
  candidatePagesSourceCommit,
  expectedChainRootReceiptDigest,
  expectedChainRootPagesSourceCommit,
  stagedHandoffExpectations,
  fetchImpl = fetch,
  now = new Date(),
  randomBytesImpl = randomBytes,
  productionPlayerCanaryActivationAuthority,
} = {}) {
  const candidate = exactCommit(
    candidatePagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_SOURCE_INVALID',
  );
  if (currentHead() !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');
  }
  assertCleanProtectedCheckout();
  return withWriterLock({
    directory,
    repositoryRoot,
    randomBytesImpl,
  }, async canonicalDirectory => {
  const inventory = readInventory(canonicalDirectory, { now });
  const exactLive = inventory.find(
    entry => entry.receipt.pages.sourceCommit === candidate,
  );
  if (exactLive !== undefined) {
    assertInventoryAuthorities(inventory);
    assertExpectedChainRoot(
      exactLive,
      expectedChainRootReceiptDigest,
      expectedChainRootPagesSourceCommit,
    );
    const inspected = await inspectEntry(exactLive, fetchImpl, now);
    assertExactCleanHead(candidate);
    return Object.freeze({
      ...inspected,
      candidatePagesSourceCommit: candidate,
      livePagesSourceCommit: candidate,
      candidateAlreadyLive: true,
      candidateAuthorityPath: null,
      candidateAuthorityDigest: null,
      candidateAuthority: null,
    });
  }
  assertInventoryCanAddSuccessor(inventory);
  assertInventoryAuthorities(inventory);
  const ancestors = [];
  for (const entry of inventory) {
    const result = gitResult([
      'merge-base',
      '--is-ancestor',
      entry.receipt.pages.sourceCommit,
      candidate,
    ]);
    if (result.status === 0 && result.stdout === '') {
      ancestors.push(Object.freeze({
        ...entry,
        distance: commitDistance(entry.receipt.pages.sourceCommit, candidate),
      }));
    } else if (result.status !== 1 || result.stdout !== '') {
      fail('NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID');
    }
  }
  if (ancestors.length === 0) {
    fail('NOTIFICATION_PAGES_LIVE_ANCESTOR_NOT_FOUND');
  }
  ancestors.sort((left, right) => left.distance - right.distance);
  if (
    ancestors.length > 1
    && ancestors[0].distance === ancestors[1].distance
  ) fail('NOTIFICATION_PAGES_LIVE_LATEST_ANCESTOR_AMBIGUOUS');
  const latest = ancestors[0];
  if (inventory.some(entry =>
    entry.receipt.chain.previousReceiptDigest === latest.receiptDigest)) {
    fail('NOTIFICATION_PAGES_LIVE_LATEST_ANCESTOR_NOT_TIP');
  }
  assertExpectedChainRoot(
    latest,
    expectedChainRootReceiptDigest,
    expectedChainRootPagesSourceCommit,
  );
  const expectations = stagedHandoffExpectations === undefined
    ? null
    : canonicalHandoffExpectations(stagedHandoffExpectations);
  if (
    expectations !== null
    && expectations.expectedPagesSourceCommit !== candidate
  ) fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
  const existingClaim = readCandidateClaim({
    directory: canonicalDirectory,
    predecessorReceiptDigest: latest.receiptDigest,
    now,
  });
  if (
    existingClaim !== null
    && existingClaim.authority.candidatePagesSourceCommit !== candidate
  ) fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_ALREADY_AUTHORIZED');
  const usesStagedPolicy = expectations !== null
    || (
      existingClaim !== null
      && existingClaim.authority.stagedHandoffBinding !== null
    );
  const candidatePlayerCanaryBinding =
    productionPlayerCanaryBindingAtCommit(candidate);
  const usesProductionPlayerCanaryPolicy =
    candidatePlayerCanaryBinding.values
      .productionPlayerCanaryReceiptDigest !== null
    || (
      existingClaim !== null
      && existingClaim.authority
        .productionPlayerCanaryActivationAuthorityDigest !== null
    );
  let productionPlayerCanaryTransition = null;
  if (usesProductionPlayerCanaryPolicy) {
    productionPlayerCanaryTransition =
      assertNotificationPagesProductionPlayerCanaryActivationTransition({
        predecessorPagesSourceCommit: latest.receipt.pages.sourceCommit,
        candidatePagesSourceCommit: candidate,
        activationAuthority: productionPlayerCanaryActivationAuthority,
        now: now.getTime(),
      });
    if (
      existingClaim !== null
      && existingClaim.authority
        .productionPlayerCanaryActivationAuthorityDigest
          !== productionPlayerCanaryTransition
            .productionPlayerCanaryActivationAuthorityDigest
    ) fail('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_AUTHORITY_MISMATCH');
  }
  assertCandidateReleaseBinding({ candidate, predecessor: latest });
  if (usesProductionPlayerCanaryPolicy) {
    if (usesStagedPolicy) {
      fail('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_TRANSITION_INVALID');
    }
  } else if (!usesStagedPolicy) {
    assertNoDiff(
      latest.receipt.pages.sourceCommit,
      candidate,
      candidateDiffProtectedPaths(
        latest,
        NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS,
      ),
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  } else {
    assertNoDiff(
      latest.receipt.pages.sourceCommit,
      candidate,
      candidateDiffProtectedPaths(latest, NON_STAGED_PROTECTED_PATHS, true),
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  }
  if (
    existingClaim !== null
    && expectations !== null
    && existingClaim.authority.stagedHandoffBinding === null
  ) fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_ALREADY_AUTHORIZED');
  if (
    existingClaim !== null
    && expectations !== null
    && existingClaim.authority.stagedHandoffBinding !== null
  ) {
    assertStagedExpectationsMatchBinding(
      expectations,
      existingClaim.authority.stagedHandoffBinding,
    );
  }
  const stagedSource = existingClaim?.authority.stagedHandoffBinding ?? null;
  assertCandidateStaticAuthority({
    predecessor: latest,
    candidate,
    bridgeSourceCommit: stagedSource?.bridgeSourceCommit
      ?? expectations?.expectedBridgeSourceCommit
      ?? latest.receipt.bridge.sourceCommit,
    sourceRelease: stagedSource?.sourceRelease ?? latest.receipt.sourceRelease,
    staged: usesStagedPolicy,
  });
  const currentEntryCount = boundedEntries(canonicalDirectory).length;
  if (
    currentEntryCount > MAX_DIRECTORY_ENTRIES - (existingClaim === null ? 6 : 4)
  ) fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
  if (existingClaim !== null) {
    const verified = await inspectDurableCandidateBindings({
      predecessor: latest,
      stagedHandoffBinding: existingClaim.authority.stagedHandoffBinding,
      fetchImpl,
      now,
    });
    assertExactCleanHead(candidate);
    return futureCandidateResult({
      predecessor: latest,
      candidate,
      authority: existingClaim.authority,
      authorityDigest: existingClaim.authorityDigest,
      authorityPath: existingClaim.path,
      ...verified,
    });
  }
  let stagedHandoff;
  let stagedBinding = null;
  let verified;
  if (expectations === null) {
    const live = await verifyExactLiveBindings(latest.receipt, fetchImpl, now);
    verified = Object.freeze({
      frontendAttestation: live.frontendAttestation,
      candidateLiveAttestation: live.liveAttestation,
    });
  } else {
    const frontendAttestation = await fetchExactLiveFrontendBinding(
      latest.receipt,
      fetchImpl,
    );
    try {
      stagedHandoff = await inspectNotificationPagesPrivateHandoff({
        ...expectations,
        repositoryRoot,
        fetchImpl,
        now,
      });
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
    }
    if (stagedHandoff.pagesSourceCommit !== candidate) {
      fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
    }
    stagedBinding = durableStagedHandoffBinding(stagedHandoff);
    assertCandidateStaticAuthority({
      predecessor: latest,
      candidate,
      bridgeSourceCommit: stagedBinding.bridgeSourceCommit,
      sourceRelease: stagedBinding.sourceRelease,
      staged: true,
    });
    verified = Object.freeze({
      frontendAttestation,
      candidateLiveAttestation: stagedBinding.liveAttestation,
    });
  }
  const candidateAuthority = parseCandidateAuthority({
    schemaVersion: 1,
    kind: CANDIDATE_KIND,
    recordedAt: latest.receipt.recordedAt,
    repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
    predecessorReceiptDigest: latest.receiptDigest,
    predecessorPagesSourceCommit: latest.receipt.pages.sourceCommit,
    chainRootReceiptDigest: latest.chainRootReceiptDigest,
    chainRootPagesSourceCommit: latest.chainRootPagesSourceCommit,
    candidatePagesSourceCommit: candidate,
    predeployNotificationPresentationDigest:
      latest.receipt.pages.notificationPresentationDigest,
    predeployLiveBridgeAttestationDigest: stagedHandoff === undefined
      ? latest.receipt.bridge.liveAttestationDigest
      : canonicalAuthBridgeReleaseAttestationDigest(
        stagedHandoff.liveAttestation,
      ),
    protectedPathsDigest: protectedPathsDigest(),
    stagedHandoffBinding: stagedBinding,
    stagedHandoffBindingDigest: stagedBinding === null
      ? null
      : stagedHandoffBindingDigest(stagedBinding),
    productionPlayerCanaryActivationAuthorityDigest:
      productionPlayerCanaryTransition
        ?.productionPlayerCanaryActivationAuthorityDigest ?? null,
  }, { now });
  const bytes = canonicalCandidateAuthorityBytes(candidateAuthority);
  let installed;
  try {
    const candidateAuthorityDigest = digest(bytes);
    assertExactCleanHead(candidate);
    const candidateDirectory = canonicalDirectory;
    try {
      installCanonicalPrivateBytes({
      directory: candidateDirectory,
      basename:
        `notification-pages-candidate-claim-${latest.receiptDigest}.json`,
      temporaryPrefix:
        `notification-pages-candidate-claim-${latest.receiptDigest}`,
      bytes,
      randomBytesImpl,
      });
    } catch (error) {
      if (
        !(error instanceof NotificationPagesLiveReceiptError)
        || error.code !== 'NOTIFICATION_PAGES_LIVE_EXISTING_RECEIPT_MISMATCH'
      ) throw error;
      fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_ALREADY_AUTHORIZED');
    }
    installed = installCanonicalPrivateBytes({
      directory: candidateDirectory,
      basename: `notification-pages-candidate-${candidateAuthorityDigest}.json`,
      temporaryPrefix: `notification-pages-candidate-${candidateAuthorityDigest}`,
      bytes,
      randomBytesImpl,
    });
    const claimPath = join(
      directory,
      `notification-pages-candidate-claim-${latest.receiptDigest}.json`,
    );
    const claim = stableFile(
      claimPath,
      1,
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
    );
    try {
      if (!claim.bytes.equals(bytes)) {
        fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_ALREADY_AUTHORIZED');
      }
    } finally {
      claim.bytes.fill(0);
    }
    return futureCandidateResult({
      predecessor: latest,
      candidate,
      authority: candidateAuthority,
      authorityDigest: candidateAuthorityDigest,
      authorityPath: installed.path,
      ...verified,
    });
  } finally {
    bytes.fill(0);
  }
  });
}

function readCandidateAuthority({
  directory,
  candidateAuthorityDigest,
  now,
}) {
  if (
    typeof candidateAuthorityDigest !== 'string'
    || !SHA256.test(candidateAuthorityDigest)
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  const expectedPath = join(
    directory,
    `notification-pages-candidate-${candidateAuthorityDigest}.json`,
  );
  const opened = stableFile(
    expectedPath,
    1,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
  );
  try {
    if (digest(opened.bytes) !== candidateAuthorityDigest) {
      fail('NOTIFICATION_PAGES_LIVE_CONTENT_ADDRESS_INVALID');
    }
    let value;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
      );
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
    }
    const authority = parseCandidateAuthority(value, { now });
    const canonical = canonicalCandidateAuthorityBytes(authority);
    try {
      if (!opened.bytes.equals(canonical)) {
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
      }
    } finally {
      canonical.fill(0);
    }
    return Object.freeze({
      authority,
      authorityDigest: candidateAuthorityDigest,
      path: expectedPath,
    });
  } finally {
    opened.bytes.fill(0);
  }
}

function readCandidateClaim({ directory, predecessorReceiptDigest, now }) {
  const path = join(
    directory,
    `notification-pages-candidate-claim-${predecessorReceiptDigest}.json`,
  );
  if (!existsSync(path)) return null;
  const opened = stableFile(
    path,
    1,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
  );
  try {
    let value;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
      );
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_BYTES_INVALID');
    }
    const authority = parseCandidateAuthority(value, { now });
    const canonical = canonicalCandidateAuthorityBytes(authority);
    try {
      if (
        authority.predecessorReceiptDigest !== predecessorReceiptDigest
        || !opened.bytes.equals(canonical)
      ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    } finally {
      canonical.fill(0);
    }
    const authorityDigest = digest(opened.bytes);
    const content = readCandidateAuthority({
      directory,
      candidateAuthorityDigest: authorityDigest,
      now,
    });
    if (content.authority !== authority) {
      const contentBytes = canonicalCandidateAuthorityBytes(content.authority);
      try {
        if (!opened.bytes.equals(contentBytes)) {
          fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
        }
      } finally {
        contentBytes.fill(0);
      }
    }
    return Object.freeze({
      authority,
      authorityDigest,
      path: content.path,
    });
  } finally {
    opened.bytes.fill(0);
  }
}

function candidateAuthorityPaths(directory, predecessorReceiptDigest, authorityDigest) {
  return Object.freeze({
    claim: join(
      directory,
      `notification-pages-candidate-claim-${predecessorReceiptDigest}.json`,
    ),
    content: join(
      directory,
      `notification-pages-candidate-${authorityDigest}.json`,
    ),
  });
}

function retireCandidateAuthority({
  directory,
  predecessorReceiptDigest,
  authorityDigest,
}) {
  const paths = candidateAuthorityPaths(
    directory,
    predecessorReceiptDigest,
    authorityDigest,
  );
  // Retire content first. If the process dies between unlinks, the fixed
  // predecessor claim remains sufficient for repair to identify and remove
  // the orphaned half. Removing the claim first would strand anonymous
  // content after a crash.
  for (const path of [paths.content, paths.claim]) {
    if (!existsSync(path)) continue;
    const opened = stableFile(
      path,
      1,
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
    );
    try {
      if (digest(opened.bytes) !== authorityDigest) {
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
      }
      const authority = parseCandidateAuthority(JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
      ));
      if (authority.predecessorReceiptDigest !== predecessorReceiptDigest) {
        fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
      }
      unlinkExact(path, opened, false);
      fsyncDirectory(directory);
    } finally {
      opened.bytes.fill(0);
    }
  }
}

/**
 * Postflight successor publication. The caller supplies only the immutable
 * candidate-authority digest and candidate commit; promotion derives the path,
 * repeats static checks, and independently proves newly deployed live bytes.
 */
export async function promoteNotificationPagesLiveReceipt({
  directory,
  repositoryRoot,
  candidateAuthorityDigest,
  candidatePagesSourceCommit,
  expectedChainRootReceiptDigest,
  expectedChainRootPagesSourceCommit,
  fetchImpl = fetch,
  now = new Date(),
  randomBytesImpl = randomBytes,
} = {}) {
  exactDate(now, 'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID');
  if (typeof randomBytesImpl !== 'function') {
    fail('NOTIFICATION_PAGES_LIVE_RANDOM_INVALID');
  }
  validateDirectoryRequest(directory, repositoryRoot);
  const candidate = exactCommit(
    candidatePagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_SOURCE_INVALID',
  );
  if (currentHead() !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');
  }
  assertCleanProtectedCheckout();
  return withWriterLock({
    directory,
    repositoryRoot,
    randomBytesImpl,
  }, async canonicalDirectory => {
  const inventory = readInventory(canonicalDirectory, { now });
  const replaySuccessor = inventory.find(entry =>
    entry.receipt.pages.sourceCommit === candidate
    && entry.receipt.chain.candidateAuthorityDigest
      === candidateAuthorityDigest);
  if (replaySuccessor !== undefined) {
    assertInventoryAuthorities(inventory);
    assertExpectedChainRoot(
      replaySuccessor,
      expectedChainRootReceiptDigest,
      expectedChainRootPagesSourceCommit,
    );
    retireCandidateAuthority({
      directory: canonicalDirectory,
      predecessorReceiptDigest:
        replaySuccessor.receipt.chain.previousReceiptDigest,
      authorityDigest: candidateAuthorityDigest,
    });
    const inspected = await inspectEntry(replaySuccessor, fetchImpl, now);
    assertExactCleanHead(candidate);
    return Object.freeze({ ...inspected, result: 'unchanged' });
  }
  assertInventoryCanAddSuccessor(inventory);
  assertInventoryAuthorities(inventory);
  const durableRecord = readCandidateAuthority({
    directory: canonicalDirectory,
    candidateAuthorityDigest,
    now,
  });
  const durableAuthority = durableRecord.authority;
  if (durableAuthority.candidatePagesSourceCommit !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  }
  const candidateClaim = readCandidateClaim({
    directory: canonicalDirectory,
    predecessorReceiptDigest: durableAuthority.predecessorReceiptDigest,
    now,
  });
  if (
    candidateClaim === null
    || candidateClaim.authorityDigest !== candidateAuthorityDigest
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  const previousEntry = inventory.find(entry =>
    entry.receipt.pages.sourceCommit
      === durableAuthority.predecessorPagesSourceCommit);
  if (previousEntry === undefined) {
    fail('NOTIFICATION_PAGES_LIVE_RECEIPT_NOT_FOUND');
  }
  assertExpectedChainRoot(
    previousEntry,
    expectedChainRootReceiptDigest,
    expectedChainRootPagesSourceCommit,
  );
  if (
    previousEntry.receiptDigest
      !== durableAuthority.predecessorReceiptDigest
    || previousEntry.chainRootReceiptDigest
      !== durableAuthority.chainRootReceiptDigest
    || previousEntry.chainRootPagesSourceCommit
      !== durableAuthority.chainRootPagesSourceCommit
    || previousEntry.receipt.pages.notificationPresentationDigest
      !== durableAuthority.predeployNotificationPresentationDigest
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  assertAncestor(
    previousEntry.receipt.pages.sourceCommit,
    candidate,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );
  const stagedHandoffBinding = durableAuthority.stagedHandoffBinding;
  const usesProductionPlayerCanaryPolicy =
    durableAuthority.productionPlayerCanaryActivationAuthorityDigest !== null;
  assertCandidateReleaseBinding({ candidate, predecessor: previousEntry });
  if (usesProductionPlayerCanaryPolicy) {
    if (stagedHandoffBinding !== null) {
      fail('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_TRANSITION_INVALID');
    }
    assertProductionPlayerCanaryActivationSourceTransition(
      previousEntry.receipt.pages.sourceCommit,
      candidate,
    );
  } else if (stagedHandoffBinding === null) {
    if (
      previousEntry.receipt.bridge.liveAttestationDigest
        !== durableAuthority.predeployLiveBridgeAttestationDigest
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    assertNoDiff(
      previousEntry.receipt.pages.sourceCommit,
      candidate,
      candidateDiffProtectedPaths(
        previousEntry,
        NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS,
      ),
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  } else {
    if (
      canonicalAuthBridgeReleaseAttestationDigest(
        stagedHandoffBinding.liveAttestation,
      ) !== durableAuthority.predeployLiveBridgeAttestationDigest
    ) fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
    assertNoDiff(
      previousEntry.receipt.pages.sourceCommit,
      candidate,
      candidateDiffProtectedPaths(
        previousEntry,
        NON_STAGED_PROTECTED_PATHS,
        true,
      ),
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  }
  assertCandidateStaticAuthority({
    predecessor: previousEntry,
    candidate,
    bridgeSourceCommit: stagedHandoffBinding?.bridgeSourceCommit
      ?? previousEntry.receipt.bridge.sourceCommit,
    sourceRelease: stagedHandoffBinding?.sourceRelease
      ?? previousEntry.receipt.sourceRelease,
    staged: stagedHandoffBinding !== null,
  });

  const exactSuccessor = inventory.find(
    entry => entry.receipt.pages.sourceCommit === candidate,
  );
  if (exactSuccessor !== undefined) {
    if (
      exactSuccessor.receipt.chain.previousReceiptDigest
        !== previousEntry.receiptDigest
      || exactSuccessor.chainRootReceiptDigest
        !== durableAuthority.chainRootReceiptDigest
      || exactSuccessor.receipt.chain.candidateAuthorityDigest
        !== candidateAuthorityDigest
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    retireCandidateAuthority({
      directory: canonicalDirectory,
      predecessorReceiptDigest: previousEntry.receiptDigest,
      authorityDigest: candidateAuthorityDigest,
    });
    const inspected = await inspectEntry(exactSuccessor, fetchImpl, now);
    assertExactCleanHead(candidate);
    return Object.freeze({ ...inspected, result: 'unchanged' });
  }
  if (inventory.some(entry =>
    entry.receipt.chain.previousReceiptDigest === previousEntry.receiptDigest)) {
    fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_NOT_TIP');
  }
  if (boundedEntries(canonicalDirectory).length > MAX_DIRECTORY_ENTRIES - 4) {
    fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
  }

  const frontendAttestation = await fetchExactLiveFrontendAttestation({
    expectedBuildSha: candidate,
    expectedNotificationsPresentationEnabled: true,
    fetchImpl,
  });
  let bridge;
  try {
    bridge = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_INVALID');
  }
  const expectedBridgeSourceCommit = stagedHandoffBinding?.bridgeSourceCommit
    ?? previousEntry.receipt.bridge.sourceCommit;
  const expectedBridgeAttestation = stagedHandoffBinding?.liveAttestation
    ?? previousEntry.receipt.bridge.liveAttestation;
  if (
    bridge.attestation.bridgeSourceCommit !== expectedBridgeSourceCommit
    || bridge.digest
      !== canonicalAuthBridgeReleaseAttestationDigest(expectedBridgeAttestation)
    || JSON.stringify(bridge.attestation)
      !== JSON.stringify(expectedBridgeAttestation)
  ) fail('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_MISMATCH');

  const receipt = buildSuccessorReceipt({
    previous: previousEntry.receipt,
    previousReceiptDigest: previousEntry.receiptDigest,
    candidatePagesSourceCommit: candidate,
    recordedAt: now,
    frontendAttestation,
    liveAttestation: bridge.attestation,
    stagedHandoffBinding,
    candidateAuthorityDigest,
  });
  assertReceiptGitProvenance(receipt);
  assertExactCleanHead(candidate);
  const installed = installReceipt({
    directory: canonicalDirectory,
    receipt,
    randomBytesImpl,
  });
  retireCandidateAuthority({
    directory: canonicalDirectory,
    predecessorReceiptDigest: previousEntry.receiptDigest,
    authorityDigest: candidateAuthorityDigest,
  });
  return installed;
  });
}

export const notificationPagesLiveReceiptTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      assertProductionPlayerCanaryActivationSourceTransition,
      exactChangedPaths,
    })
    : undefined;
