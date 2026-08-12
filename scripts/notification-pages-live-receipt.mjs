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
import { parseDocument } from 'yaml';
import {
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from 'typescript/unstable/ast';

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
} from './production-admin-token-budget.mjs';
import { verifyFrontend } from './verify-alpha-production.mjs';

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
  'public/.well-known/farcaster.json',
  'scripts/admission-notifications',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/auth-bridge-notification-prepared-receipt.mjs',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/entry-agreement-policy.mjs',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/hermes-admin.ts',
  'scripts/notification-pages-private-handoff.mjs',
  'scripts/notification-pages-live-receipt.mjs',
  'scripts/production-admin-token-budget.mjs',
  'scripts/qa-observer/local-vite-fs-deny.mjs',
  'scripts/validate-pages-deploy-config.mjs',
  'scripts/verify-alpha-production.mjs',
  'scripts/verify-greater-realm-release-gates.mjs',
  'services/auth-bridge',
  'src',
  'vite.config.ts',
]);

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 32 * 1024;
const MAX_DIRECTORY_ENTRIES = 256;
const MAX_FOUNDERS = 600;
const MAX_FRONTEND_DOCUMENT_BYTES = 1_000_000;
const MAX_FRONTEND_ASSET_BYTES = 16_000_000;
const MAX_FRONTEND_ASSET_COUNT = 64;
const NOTIFICATIONS_PRESENTATION_MARKER =
  'warpkeep-admission-notifications-presentation-enabled-v1';
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
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
]);
const PAGES_KEYS = Object.freeze([
  'origin',
  'sourceCommit',
  'liveBuildSha',
  'liveFrontendDigest',
  'rootAssetCount',
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
  'predeployLiveFrontendDigest',
  'predeployLiveBridgeAttestationDigest',
  'protectedPathsDigest',
  'stagedHandoffBinding',
  'stagedHandoffBindingDigest',
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
  NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS.filter(
    path => !STAGED_HANDOFF_AUTHORIZED_PATHS.includes(path),
  ),
);

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
    || chain.generation >= MAX_DIRECTORY_ENTRIES
    || (
      chain.generation === 0
        ? (
          chain.previousReceiptDigest !== null
          || chain.previousPagesSourceCommit !== null
        )
        : (
          typeof chain.previousReceiptDigest !== 'string'
          || !SHA256.test(chain.previousReceiptDigest)
          || typeof chain.previousPagesSourceCommit !== 'string'
          || !SOURCE_COMMIT.test(chain.previousPagesSourceCommit)
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
    || typeof pages.liveFrontendDigest !== 'string'
    || !SHA256.test(pages.liveFrontendDigest)
    || !Number.isSafeInteger(pages.rootAssetCount)
    || pages.rootAssetCount < 1
    || pages.rootAssetCount > MAX_FRONTEND_ASSET_COUNT
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
    || typeof value.predeployLiveFrontendDigest !== 'string'
    || !SHA256.test(value.predeployLiveFrontendDigest)
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

function unlinkExact(path, expected) {
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
    if (error?.code === 'ENOENT') return;
    fail('NOTIFICATION_PAGES_LIVE_TEMPORARY_CHANGED');
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
      unlinkExact(temporary, metadata);
      fsyncDirectory(directory);
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
      if (cursor === undefined || traversed > MAX_DIRECTORY_ENTRIES) {
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
  for (const entry of boundedEntries(directory)) {
    const receiptMatch = RECEIPT_FILE.exec(entry.name);
    const sourceMatch = SOURCE_FILE.exec(entry.name);
    const successorMatch = SUCCESSOR_FILE.exec(entry.name);
    const rootMatch = entry.name === ROOT_FILE;
    if (
      receiptMatch === null
      && sourceMatch === null
      && successorMatch === null
      && !rootMatch
    ) continue;
    const path = join(directory, entry.name);
    const opened = stableFile(
      path,
      1,
      receiptMatch !== null
        ? 'NOTIFICATION_PAGES_LIVE_RECEIPT_FILE_INVALID'
        : rootMatch
          ? 'NOTIFICATION_PAGES_LIVE_ROOT_RESERVATION_INVALID'
          : sourceMatch !== null
          ? 'NOTIFICATION_PAGES_LIVE_SOURCE_RESERVATION_INVALID'
          : 'NOTIFICATION_PAGES_LIVE_SUCCESSOR_RESERVATION_INVALID',
    );
    try {
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
  } finally {
    for (const record of records) record.bytes.fill(0);
  }
}

/** Create or attest the dedicated, bounded owner-only live receipt directory. */
export function ensureNotificationPagesLiveReceiptDirectory({
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
      if (error instanceof NotificationPagesLiveReceiptError) throw error;
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_CREATE_FAILED');
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

export function defaultNotificationPagesLiveReceiptDirectory() {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep',
    'private',
    'production-admin-v1',
    NOTIFICATION_PAGES_LIVE_STATE_CHILD,
  );
}

function gitResult(arguments_) {
  return spawnSync(
    '/usr/bin/git',
    ['--no-optional-locks', ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
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
      maxBuffer: 1024 * 1024,
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

function assertCleanProtectedCheckout(paths = NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS) {
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
      fail('NOTIFICATION_PAGES_LIVE_PROTECTED_CHECKOUT_DIRTY');
    }
  }
  const untracked = gitResult([
    'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths,
  ]);
  if (
    untracked.status !== 0
    || untracked.stdout.includes('\0')
    || untracked.stdout !== ''
  ) fail('NOTIFICATION_PAGES_LIVE_PROTECTED_CHECKOUT_DIRTY');
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
  assertNoDiff(
    receipt.sourceRelease.moduleSourceCommit,
    receipt.pages.sourceCommit,
    ['spacetimedb'],
    'NOTIFICATION_PAGES_LIVE_MODULE_SOURCE_DRIFT',
  );
  assertNoDiff(
    receipt.bridge.sourceCommit,
    receipt.pages.sourceCommit,
    [
      'services/auth-bridge',
      'scripts/auth-bridge-config-attestation.mjs',
      'scripts/auth-bridge-notification-prepared-receipt.mjs',
    ],
    'NOTIFICATION_PAGES_LIVE_BRIDGE_SOURCE_DRIFT',
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

function exactHermesApprovalAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID';
  const source = sourceAtCommit(commit, 'scripts/hermes-admin.ts', code);
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const skipTemplateLiteral = () => {
    let expressionBraceDepth = 0;
    while (true) {
      const nested = scanner.scan();
      if (scanner.isUnterminated() || nested === SyntaxKind.EndOfFile) fail(code);
      if (nested === SyntaxKind.TemplateHead) {
        skipTemplateLiteral();
        continue;
      }
      if (nested === SyntaxKind.OpenBraceToken) {
        expressionBraceDepth += 1;
        continue;
      }
      if (nested !== SyntaxKind.CloseBraceToken) continue;
      if (expressionBraceDepth > 0) {
        expressionBraceDepth -= 1;
        continue;
      }
      const template = scanner.reScanTemplateToken(false);
      if (scanner.isUnterminated()) fail(code);
      if (template === SyntaxKind.TemplateTail) return;
      if (template !== SyntaxKind.TemplateMiddle) fail(code);
    }
  };
  const topLevelTokens = [];
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  while (true) {
    const token = scanner.scan();
    if (scanner.isUnterminated()) fail(code);
    if (token === SyntaxKind.EndOfFile) break;
    if (token === SyntaxKind.TemplateHead) {
      skipTemplateLiteral();
      continue;
    }
    const topLevel = braceDepth === 0
      && parenthesisDepth === 0
      && bracketDepth === 0;
    if (topLevel) topLevelTokens.push(scanner.getTokenText());
    if (token === SyntaxKind.OpenBraceToken) braceDepth += 1;
    if (token === SyntaxKind.CloseBraceToken) braceDepth -= 1;
    if (token === SyntaxKind.OpenParenToken) parenthesisDepth += 1;
    if (token === SyntaxKind.CloseParenToken) parenthesisDepth -= 1;
    if (token === SyntaxKind.OpenBracketToken) bracketDepth += 1;
    if (token === SyntaxKind.CloseBracketToken) bracketDepth -= 1;
    if (braceDepth < 0 || parenthesisDepth < 0 || bracketDepth < 0) fail(code);
  }
  if (
    braceDepth !== 0
    || parenthesisDepth !== 0
    || bracketDepth !== 0
  ) fail(code);
  const prefix = [
    'export',
    'const',
    'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED',
    '=',
  ];
  const suffix = ['as', 'const', ';'];
  const matches = [];
  for (let index = 0; index <= topLevelTokens.length - 8; index += 1) {
    if (
      prefix.every((value, offset) => topLevelTokens[index + offset] === value)
      && (topLevelTokens[index + 4] === 'true'
        || topLevelTokens[index + 4] === 'false')
      && suffix.every(
        (value, offset) => topLevelTokens[index + 5 + offset] === value,
      )
    ) matches.push(topLevelTokens[index + 4] === 'true');
  }
  if (matches.length !== 1) fail(code);
  return matches[0];
}

function exactPagesPresentationAtCommit(commit) {
  const code = 'NOTIFICATION_PAGES_LIVE_PAGES_PHASE_INVALID';
  let document;
  try {
    document = parseDocument(sourceAtCommit(
      commit,
      '.github/workflows/deploy-pages.yml',
      code,
    ), { prettyErrors: false, strict: true, uniqueKeys: true });
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
  return value === 'true';
}

function assertActivationPresentationPhase(sourceCommit) {
  const pagesEnabled = exactPagesPresentationAtCommit(sourceCommit);
  const hermesApproved = exactHermesApprovalAtCommit(sourceCommit);
  if (!pagesEnabled || hermesApproved) {
    fail('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
  }
}

async function readBoundedResponseClone(response, maximumBytes) {
  const advertised = response.headers.get('content-length');
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
  if (advertised !== null && Number(advertised) !== total) {
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

function runtimeAssetReference(specifier, current) {
  if (
    typeof specifier !== 'string'
    || specifier.length < 1
    || specifier.length > 512
    || /[\\\u0000-\u001f\u007f]/u.test(specifier)
  ) return undefined;
  const hasRuntimeAssetExtension =
    /\.(?:avif|css|gif|ico|jpe?g|js|json|mjs|mp3|mp4|otf|png|svg|ttf|wasm|webp|woff2?)$/iu
      .test(specifier);
  if (!hasRuntimeAssetExtension) return undefined;
  let resolved;
  try {
    resolved = specifier.startsWith('assets/')
      ? new URL(`/${specifier}`, NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN)
      : new URL(specifier, current);
  } catch {
    fail('NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID');
  }
  if (
    resolved.origin !== NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
    || !resolved.pathname.startsWith('/assets/')
    || resolved.search
    || resolved.hash
  ) return undefined;
  return resolved.href;
}

function runtimeAssetReferences(source, current) {
  const references = new Set();
  for (const match of source.matchAll(
    /(["'`])([^"'`\n\r]{1,512})\1/gu,
  )) {
    const referenced = runtimeAssetReference(match[2], current);
    if (referenced !== undefined) references.add(referenced);
  }
  for (const match of source.matchAll(
    /\burl\(\s*([^"'`\s)][^\s)]{0,511})\s*\)/gu,
  )) {
    const referenced = runtimeAssetReference(match[1], current);
    if (referenced !== undefined) references.add(referenced);
  }
  return references;
}

function isTraversableFrontendAsset(entry) {
  const contentType = entry.contentType.toLowerCase();
  return /(?:java|ecma)script|text\/css|application\/json|image\/svg\+xml/u
    .test(contentType);
}

function validFrontendAssetResponse(response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return response.status === 200
    && contentType.length >= 1
    && !contentType.includes('text/html');
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
  const captureFetch = async (input, init) => {
    const requested = input instanceof Request ? input.url : String(input);
    let url;
    try {
      url = new URL(requested);
    } catch {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
    }
    const response = await fetchImpl(input, init);
    if (!(response instanceof Response)) {
      fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_INVALID');
    }
    if (
      url.origin === NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN
      && (url.pathname === '/' || url.pathname.startsWith('/assets/'))
    ) {
      if (captures.has(url.href)) {
        fail('NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_DUPLICATE');
      }
      const maximum = url.pathname === '/'
        ? MAX_FRONTEND_DOCUMENT_BYTES
        : MAX_FRONTEND_ASSET_BYTES;
      const bytes = await readBoundedResponseClone(response, maximum);
      try {
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
      let markerOffset = source.indexOf(NOTIFICATIONS_PRESENTATION_MARKER);
      while (markerOffset !== -1) {
        presentationMarkerCount += 1;
        markerOffset = source.indexOf(
          NOTIFICATIONS_PRESENTATION_MARKER,
          markerOffset + NOTIFICATIONS_PRESENTATION_MARKER.length,
        );
      }
      const references = runtimeAssetReferences(source, current);
      for (const referenced of [...references].sort()) {
        if (captures.has(referenced)) {
          pending.push(referenced);
          continue;
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
        if (!validFrontendAssetResponse(response)) {
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
    kind: 'warpkeep-notification-pages-live-frontend-manifest-v1',
    origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
    expectedBuildSha,
    notificationsPresentationEnabled: true,
    document: root,
    assets: Object.freeze(assets),
  });
  const liveFrontendDigest = createHash('sha256')
    .update('warpkeep-notification-pages-live-frontend-v1\0', 'utf8')
    .update(JSON.stringify(manifest), 'utf8')
    .digest('hex');
  return Object.freeze({
    liveFrontendDigest,
    rootAssetCount: assets.length,
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
    },
    pages: {
      origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      sourceCommit: handoff.pagesSourceCommit,
      liveBuildSha: handoff.pagesSourceCommit,
      liveFrontendDigest: frontendAttestation.liveFrontendDigest,
      rootAssetCount: frontendAttestation.rootAssetCount,
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
    },
    pages: {
      origin: NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN,
      sourceCommit: candidatePagesSourceCommit,
      liveBuildSha: candidatePagesSourceCommit,
      liveFrontendDigest: frontendAttestation.liveFrontendDigest,
      rootAssetCount: frontendAttestation.rootAssetCount,
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
  repositoryRoot,
  receipt,
  randomBytesImpl,
}) {
  const proposedBytes = canonicalReceiptBytes(receipt);
  let installedBytes;
  try {
    const canonicalDirectory = ensureNotificationPagesLiveReceiptDirectory({
      directory,
      repositoryRoot,
    });
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
    frontend.liveFrontendDigest !== receipt.pages.liveFrontendDigest
    || frontend.rootAssetCount !== receipt.pages.rootAssetCount
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
  assertActivationPresentationPhase(head);
  const preflightInventory = staticInventory({ directory, repositoryRoot, now });
  if (
    preflightInventory.length > 0
    || boundedEntries(directory).length > MAX_DIRECTORY_ENTRIES - 3
  ) fail('NOTIFICATION_PAGES_LIVE_ROOT_ALREADY_BOUND');
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
    directory,
    repositoryRoot,
    receipt,
    randomBytesImpl,
  });
}

function staticInventory({ directory, repositoryRoot, now }) {
  exactDate(now, 'NOTIFICATION_PAGES_LIVE_RECEIPT_TIME_INVALID');
  const canonicalDirectory = ensureNotificationPagesLiveReceiptDirectory({
    directory,
    repositoryRoot,
  });
  const inventory = readInventory(canonicalDirectory, { now });
  for (const entry of inventory) assertReceiptGitProvenance(entry.receipt);
  return inventory;
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
} = {}) {
  const candidate = exactCommit(
    candidatePagesSourceCommit,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_SOURCE_INVALID',
  );
  if (currentHead() !== candidate) {
    fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');
  }
  assertCleanProtectedCheckout();
  const inventory = staticInventory({ directory, repositoryRoot, now });
  const exactLive = inventory.find(
    entry => entry.receipt.pages.sourceCommit === candidate,
  );
  if (exactLive !== undefined) {
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
  let stagedHandoff;
  let expectations = null;
  if (stagedHandoffExpectations === undefined) {
    assertNoDiff(
      latest.receipt.pages.sourceCommit,
      candidate,
      NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS,
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  } else {
    expectations = canonicalHandoffExpectations(stagedHandoffExpectations);
    if (expectations.expectedPagesSourceCommit !== candidate) {
      fail('NOTIFICATION_PAGES_LIVE_STAGED_HANDOFF_INVALID');
    }
    assertNoDiff(
      latest.receipt.pages.sourceCommit,
      candidate,
      NON_STAGED_PROTECTED_PATHS,
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
  }
  let inspected;
  let stagedBinding = null;
  if (expectations === null) {
    inspected = await inspectEntry(latest, fetchImpl, now);
  } else {
    const frontend = await fetchExactLiveFrontendBinding(
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
    inspected = Object.freeze({
      path: latest.path,
      receiptDigest: latest.receiptDigest,
      receipt: latest.receipt,
      preparedBinding: latest.receipt.preparedBinding,
      chainRootReceiptDigest: latest.chainRootReceiptDigest,
      chainRootPagesSourceCommit: latest.chainRootPagesSourceCommit,
      liveAttestation: latest.receipt.bridge.liveAttestation,
      frontendAttestation: frontend,
    });
  }
  const candidateAuthority = parseCandidateAuthority({
    schemaVersion: 1,
    kind: CANDIDATE_KIND,
    recordedAt: latest.receipt.recordedAt,
    repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
    predecessorReceiptDigest: inspected.receiptDigest,
    predecessorPagesSourceCommit: latest.receipt.pages.sourceCommit,
    chainRootReceiptDigest: latest.chainRootReceiptDigest,
    chainRootPagesSourceCommit: latest.chainRootPagesSourceCommit,
    candidatePagesSourceCommit: candidate,
    predeployLiveFrontendDigest: latest.receipt.pages.liveFrontendDigest,
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
  }, { now });
  const bytes = canonicalCandidateAuthorityBytes(candidateAuthority);
  let installed;
  try {
    const candidateAuthorityDigest = digest(bytes);
    assertExactCleanHead(candidate);
    const candidateDirectory = ensureNotificationPagesLiveReceiptDirectory({
      directory,
      repositoryRoot,
    });
    if (boundedEntries(candidateDirectory).length > MAX_DIRECTORY_ENTRIES - 6) {
      fail('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
    }
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
    return Object.freeze({
      ...inspected,
      candidatePagesSourceCommit: candidate,
      livePagesSourceCommit: latest.receipt.pages.sourceCommit,
      candidateAlreadyLive: false,
      candidateAuthorityPath: installed.path,
      candidateAuthorityDigest,
      candidateAuthority,
      candidatePreparedBinding: stagedBinding?.preparedBinding ?? null,
      candidateLiveAttestation: stagedBinding?.liveAttestation ?? null,
    });
  } finally {
    bytes.fill(0);
  }
}

function readCandidateAuthority({
  directory,
  repositoryRoot,
  candidateAuthorityDigest,
  now,
}) {
  if (
    typeof candidateAuthorityDigest !== 'string'
    || !SHA256.test(candidateAuthorityDigest)
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  const canonicalDirectory = ensureNotificationPagesLiveReceiptDirectory({
    directory,
    repositoryRoot,
  });
  const expectedPath = join(
    canonicalDirectory,
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
    return authority;
  } finally {
    opened.bytes.fill(0);
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
  const durableAuthority = readCandidateAuthority({
    directory,
    repositoryRoot,
    candidateAuthorityDigest,
    now,
  });
  if (
    durableAuthority.candidatePagesSourceCommit !== candidate
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  const candidateClaim = stableFile(
    join(
      ensureNotificationPagesLiveReceiptDirectory({ directory, repositoryRoot }),
      `notification-pages-candidate-claim-${durableAuthority.predecessorReceiptDigest}.json`,
    ),
    1,
    'NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_FILE_INVALID',
  );
  try {
    if (digest(candidateClaim.bytes) !== candidateAuthorityDigest) {
      fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    }
  } finally {
    candidateClaim.bytes.fill(0);
  }
  const inventory = staticInventory({ directory, repositoryRoot, now });
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
    || previousEntry.receipt.pages.liveFrontendDigest
      !== durableAuthority.predeployLiveFrontendDigest
  ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
  assertAncestor(
    previousEntry.receipt.pages.sourceCommit,
    candidate,
    'NOTIFICATION_PAGES_LIVE_GIT_ANCESTRY_INVALID',
  );

  const exactSuccessor = inventory.find(
    entry => entry.receipt.pages.sourceCommit === candidate,
  );
  if (exactSuccessor !== undefined) {
    if (
      exactSuccessor.receipt.chain.previousReceiptDigest
        !== previousEntry.receiptDigest
      || exactSuccessor.chainRootReceiptDigest
        !== durableAuthority.chainRootReceiptDigest
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    const inspected = await inspectEntry(exactSuccessor, fetchImpl, now);
    assertExactCleanHead(candidate);
    return Object.freeze({ ...inspected, result: 'unchanged' });
  }
  if (inventory.some(entry =>
    entry.receipt.chain.previousReceiptDigest === previousEntry.receiptDigest)) {
    fail('NOTIFICATION_PAGES_LIVE_PREDECESSOR_NOT_TIP');
  }

  const stagedHandoffBinding = durableAuthority.stagedHandoffBinding;
  if (stagedHandoffBinding === null) {
    if (
      previousEntry.receipt.bridge.liveAttestationDigest
        !== durableAuthority.predeployLiveBridgeAttestationDigest
    ) fail('NOTIFICATION_PAGES_LIVE_CANDIDATE_AUTHORITY_INVALID');
    assertNoDiff(
      previousEntry.receipt.pages.sourceCommit,
      candidate,
      NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS,
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
      NON_STAGED_PROTECTED_PATHS,
      'NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT',
    );
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
  });
  assertReceiptGitProvenance(receipt);
  assertExactCleanHead(candidate);
  return installReceipt({
    directory,
    repositoryRoot,
    receipt,
    randomBytesImpl,
  });
}
