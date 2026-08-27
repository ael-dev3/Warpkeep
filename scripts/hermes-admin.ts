import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  AdmissionNotificationDiagnostics,
  AdmissionNotificationRetryReason,
} from '../services/auth-bridge/src/types';
import { DbConnection } from '../src/spacetime/module_bindings';
import type {
  AdminGreaterRealmCutoverStatusV1,
  AdminGreaterRealmReenableStatusV1,
} from '../src/spacetime/module_bindings/types';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
} from '../spacetimedb/src/entryAgreementPolicy';
import {
  ProfileAuthorityPolicyError,
  FARCASTER_PROFILE_POLICY_VERSION,
  normalizeAdmissionReadyTrustedProfile,
  type AdmissionReadyTrustedProfile,
} from '../spacetimedb/src/profileAuthorityPolicy';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../spacetimedb/src/resourceAuthorityPolicy';
import {
  ALPHA_ACTIVATION_COMPONENTS,
  type AlphaActivationComponent,
} from '../spacetimedb/src/alphaActivationPolicy';
import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  type AlphaV10ActivationComponent,
} from '../spacetimedb/src/alphaV10ActivationPolicy';
import {
  AlphaActivationControlError,
  alphaComponentIsReady,
  alphaComponentSeedReceipt,
  parseAlphaActivationComponent,
  projectAlphaStatusV8,
  type AlphaStatusV8,
  verifyAlphaComponentSeedPostcondition,
  verifyAlphaComponentSeedPrecondition,
} from './alpha-activation-controls';
import { configureHermesMachineOutput } from './hermes-machine-output';
import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
  recordProductionAdminTokenAttempt,
} from './production-admin-token-budget.mjs';
import {
  AlphaV10ActivationControlError,
  alphaV10ComponentIsReady,
  alphaV10ComponentSeedReceipt,
  parseAlphaV10ActivationComponent,
  projectAlphaStatusV10,
  verifyAlphaV10SeedPostcondition,
  verifyWaterActivationPostcondition,
  waterActivationReceipt,
  type AlphaStatusV10,
} from './alpha-v10-activation-controls';
import {
  inspectHermesNotificationPagesLiveAuthority as inspectNotificationPagesLiveAuthority,
  sameNotificationPagesLiveHermesAuthority,
  type NotificationPagesLiveHermesAuthority,
} from './notification-pages-live-hermes-authority.mjs';
import {
  buildTrustedPublicFarcasterProfile,
  FarcasterPublicProfileError,
} from './profiles/farcaster-profile-policy';
import {
  FounderAdmissionPlanError,
  REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS,
  claimReviewedFounderAdmissionPlan,
  createReviewedFounderAdmissionPlan,
  parsePrivateFounderAdmissionRequest,
  parseReviewedFounderAdmissionPlanReference,
  readPrivateFounderAdmissionInput,
  readReviewedFounderAdmissionPlan,
  writeReviewedFounderAdmissionPlan,
  type ReviewedFounderAdmissionPlan,
  type ReviewedFounderAdmissionPlanReference,
} from './profiles/founder-admission-plan';
import {
  fetchPublicProfileResponses,
  ProfileTransportError,
  TRUSTED_FOUNDER_ADMISSION_PURPOSE,
  TRUSTED_PRODUCTION_FOUNDER_ADMISSION_SOURCE_ID,
  trustedProfileTransportAttestation,
} from './profiles/profile-transport';
import {
  AccessRequestResetPlanError,
  REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS,
  claimReviewedAccessRequestResetPlan,
  createReviewedAccessRequestResetPlan,
  parseReviewedAccessRequestResetPlanReference,
  readReviewedAccessRequestResetPlan,
  writeReviewedAccessRequestResetPlan,
  type ReviewedAccessRequestResetPlan,
  type ReviewedAccessRequestResetPlanReference,
} from './access-requests/reset-plan';
import {
  AdmissionNotificationRecoveryPlanError,
  REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS,
  admissionNotificationRecoveryStateDigest,
  claimReviewedAdmissionNotificationRecoveryPlan,
  createReviewedAdmissionNotificationRecoveryPlan,
  parseReviewedAdmissionNotificationRecoveryPlanReference,
  readReviewedAdmissionNotificationRecoveryPlan,
  writeReviewedAdmissionNotificationRecoveryPlan,
  type ReviewedAdmissionNotificationRecoveryPlan,
  type ReviewedAdmissionNotificationRecoveryPlanReference,
} from './admission-notifications/recovery-plan';
import {
  FounderAdmissionAuthorityError,
  selectFounderAdmissionAuthorityMode,
  verifyGreaterRealmAdmissionPostcondition,
  verifyGreaterRealmAdmissionPrecondition,
  verifyGreaterRealmReenablePostconditionV1,
  verifyGreaterRealmReenablePreconditionV1,
  type FounderAdmissionAuthorityMode,
  type GreaterRealmReenableCheckpoint,
} from './founder-admission-authority';

type Command =
  | 'seed-world'
  | 'expand-world-v3'
  | 'list-access-requests'
  | 'list-pending-access-requests'
  | 'export-access-request-census'
  | 'inspect-access-request-reset'
  | 'reset-access-request'
  | 'admit-founder'
  | 'inspect-admission-notification'
  | 'recover-admission-notification'
  | 'allow-fid'
  | 'disable-fid'
  | 'bump-auth-epoch'
  | 'inspect-alpha'
  | 'inspect-alpha-v2'
  | 'inspect-alpha-v3'
  | 'inspect-alpha-v4'
  | 'inspect-alpha-v8'
  | 'inspect-alpha-v10'
  | 'inspect-alpha-v12'
  | 'inspect-publish-pre-v12'
  | 'inspect-publish-post-v12'
  | 'seed-alpha-component'
  | 'activate-alpha-water'
  | 'backfill-resources';

type HermesTrustedReleaseRow =
  | 'list-pending'
  | 'admit-dry'
  | 'admit-confirm'
  | 'allow-dry'
  | 'allow-confirm'
  | 'notification-inspect'
  | 'notification-recover-dry'
  | 'notification-recover-confirm';

type TrustedHermesLaunch = Readonly<{
  row: HermesTrustedReleaseRow;
  protectedCommit?: string;
  adminSecretPath?: string;
  notificationSecretPath?: string;
  privateInputPath?: string;
  founderPlanDirectory?: string;
  notificationRecoveryPlanDirectory?: string;
  pendingCensusDirectory?: string;
}>;

type AlphaStatusVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v8' | 'v10' | 'v12';
type SeedableAlphaComponent = AlphaActivationComponent | AlphaV10ActivationComponent;

const LEGACY_DATABASE_ALIAS = 'warpkeep-89e4u';
const DEFAULT_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const DEFAULT_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const CONNECT_TIMEOUT_MS = 30_000;
const OPERATION_TIMEOUT_MS = 15_000;
const MAX_ADMIN_TOKEN_RESPONSE_BYTES = 32 * 1_024;
const ADMISSION_NOTIFICATION_PATH = 'v1/admin/admission-notification';
const ADMISSION_NOTIFICATION_RECOVERY_PATH = 'v1/admin/admission-notification-recovery';
const ADMISSION_NOTIFICATION_STATUS_PATH = 'v1/admin/admission-notification-status';
export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;
const ADMISSION_NOTIFICATION_SETTLEMENT_WAIT_MILLISECONDS = 35_000;
const ADMISSION_NOTIFICATION_DIAGNOSTIC_REQUIRED_KEYS = Object.freeze([
  'deliveryAttemptCount',
  'subscribed',
  'recoveryCount',
  'retryReasons',
  'status',
  'verificationFailureCount',
] as const);
const ADMISSION_NOTIFICATION_DIAGNOSTIC_OPTIONAL_KEYS = Object.freeze([
  'authEpoch',
  'generation',
  'requestedAtMicros',
  'lastRecoveryAt',
  'lastAttemptAt',
  'lastFailureReason',
  'nextAttemptAt',
] as const);
const ADMIN_TOKEN_CLOCK_SAFETY_MILLISECONDS = 20_000;
const MAX_RESOURCE_BACKFILL_FOUNDERS = 100n;
const GENESIS_GENERATION_V2_WORLD_CELLS = 1_261n;
const GENESIS_GENERATION_V3_WORLD_CELLS = 10_000n;
const GENESIS_REALM_COUNT = 1n;
const GENESIS_CASTLE_SLOT_COUNT = 100n;
const GENESIS_GENERATION_V2_VERSION = 2;
const GENESIS_MAX_FOUNDERS = 100n;
const MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER = BigInt(
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
);
const HEGEMONY_WORLD_SEED = 3_445_214_658;
const HEGEMONY_WORLD_SEED_NAME = 'HEGEMONY_GENESIS_001';
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAX_ACCESS_REQUEST_PAGE_SIZE = 100;
const MAX_ACCESS_REQUEST_CENSUS_PAGES = 41;
const MAX_ACCESS_REQUEST_CENSUS_ROWS = 4_096;
const MAX_ACCESS_REQUEST_CENSUS_BYTES = 1024 * 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
export const GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID = 'GENESIS_001';
export const GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION = '0.3.43';
export const GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT =
  '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const GENESIS_001_ACCESS_REQUEST_CENSUS_FREEZE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
export const GENESIS_001_SUSPENDED_HERMES_COMMANDS = Object.freeze([
  'admit-founder',
  'allow-fid',
  'bump-auth-epoch',
  'disable-fid',
  'list-access-requests',
  'list-pending-access-requests',
  'recover-admission-notification',
  'reset-access-request',
] as const satisfies readonly Command[]);
const GENESIS_001_ACCESS_POLICY_PROCEDURE = 'genesis_001_access_policy_v1';
const ACCESS_REQUEST_CENSUS_DESKTOP_WRITER =
  'system-python-openat-census-v1';
const ACCESS_REQUEST_CENSUS_PRIVATE_REFERENCE_DIRECTORY = Object.freeze([
  'Library',
  'Application Support',
  'Warpkeep',
  'operations',
  'audit',
  'private',
] as const);
const MAX_JAVASCRIPT_DATE_MICROS = 8_640_000_000_000_000_000n;
const ACCESS_REQUEST_PAGE_KEYS = Object.freeze([
  'entries',
  'hasMore',
  'nextFid',
  'nextRequestedAtMicros',
  'pendingRequests',
  'totalRequests',
].sort());
const ACCESS_REQUEST_ENTRY_KEYS = Object.freeze([
  'admissionState',
  'fid',
  'requestState',
  'requestedAtMicros',
].sort());
const ACCESS_REQUEST_RESET_STATUS_KEYS = Object.freeze([
  'admissionState',
  'authEpoch',
  'requestCycle',
  'requestedAtMicros',
  'requestState',
].sort());
const ACCESS_REQUEST_ADMISSION_STATUS_KEYS = ACCESS_REQUEST_RESET_STATUS_KEYS;
const WORKER_STATUS_V12_U64_FIELDS = Object.freeze([
  'systemRows',
  'expectedCastleCount',
  'expectedWorkerCount',
  'actualWorkerCount',
  'castlesMissingWorkers',
  'castlesWithExtraWorkers',
  'duplicateOrdinals',
  'malformedWorkerIds',
  'invalidWorkerStates',
  'idleWorkers',
  'outboundWorkers',
  'gatheringWorkers',
  'returningWorkers',
  'assignments',
  'occupations',
  'schedules',
  'orphanWorkers',
  'orphanAssignments',
  'assignmentsMissingOccupation',
  'assignmentsWithoutSingleSchedule',
  'orphanOccupations',
  'orphanSchedules',
  'invalidSchedules',
  'assignmentPublicMismatches',
  'occupationSiteMismatches',
  'invalidAssignments',
  'idempotencyReceipts',
  'invalidIdempotencyReceipts',
  'idempotencyOverflowFids',
  'legacyExpeditions',
  'legacyOccupations',
  'legacySchedules',
] as const);
const WORKER_STATUS_V12_BOOLEAN_FIELDS = Object.freeze([
  'systemConfigValid',
  'legacyDrainRequired',
  'expectedCountsMatch',
  'rosterDigestMatches',
] as const);
const WORKER_STATUS_V12_STRING_FIELDS = Object.freeze([
  'mode',
  'rosterDigest',
  'rosterDigestExpected',
] as const);
const WORKER_STATUS_V12_KEYS = Object.freeze([
  ...WORKER_STATUS_V12_U64_FIELDS,
  ...WORKER_STATUS_V12_BOOLEAN_FIELDS,
  ...WORKER_STATUS_V12_STRING_FIELDS,
].sort());

export const FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
    transport: trustedProfileTransportAttestation(TRUSTED_FOUNDER_ADMISSION_PURPOSE),
  }), 'utf8')
  .digest('hex');
export const FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    databaseUri: DEFAULT_URI,
    databaseName: LEGACY_DATABASE_ALIAS,
    databaseIdentity: DEFAULT_DATABASE_IDENTITY,
    bridgeUrl: DEFAULT_BRIDGE,
    statusProcedure: 'admin_get_access_request_admission_status_v1',
    cutoverStatusProcedure: 'admin_get_greater_realm_cutover_status_v_1',
    reducer: 'admin_admit_founder_for_access_request_v2',
  }), 'utf8')
  .digest('hex');
export const PENDING_ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    databaseUri: DEFAULT_URI,
    databaseIdentity: DEFAULT_DATABASE_IDENTITY,
    bridgeUrl: DEFAULT_BRIDGE,
    procedure: 'admin_list_access_requests_v1',
    pageSize: MAX_ACCESS_REQUEST_PAGE_SIZE,
    maximumPages: MAX_ACCESS_REQUEST_CENSUS_PAGES,
    maximumRows: MAX_ACCESS_REQUEST_CENSUS_ROWS,
  }), 'utf8')
  .digest('hex');

export const GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    realmId: GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID,
    releaseVersion: GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION,
    sourceBaselineCommit: GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT,
    freezeReleaseNonce: GENESIS_001_ACCESS_REQUEST_CENSUS_FREEZE_NONCE,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
  }), 'utf8')
  .digest('hex');

export const ACCESS_REQUEST_RESET_TARGET_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    databaseUri: DEFAULT_URI,
    databaseIdentity: DEFAULT_DATABASE_IDENTITY,
    bridgeUrl: DEFAULT_BRIDGE,
    statusProcedure: 'admin_get_access_request_reset_status_v1',
    reducer: 'admin_reset_access_request_v1',
  }), 'utf8')
  .digest('hex');
export const ADMISSION_NOTIFICATION_RECOVERY_TARGET_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    databaseUri: DEFAULT_URI,
    databaseIdentity: DEFAULT_DATABASE_IDENTITY,
    bridgeUrl: DEFAULT_BRIDGE,
    statusProcedure: 'admin_get_access_request_admission_status_v1',
    notificationStatusPath: ADMISSION_NOTIFICATION_STATUS_PATH,
    notificationRecoveryPath: ADMISSION_NOTIFICATION_RECOVERY_PATH,
  }), 'utf8')
  .digest('hex');

class HermesCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HermesCliError';
  }
}

class HermesOperationTimeoutError extends Error {
  constructor() {
    super(
      'Warpkeep database operation timed out. A submitted mutation may still commit; '
      + 'inspect current state before retrying.',
    );
    this.name = 'HermesOperationTimeoutError';
  }
}

class HermesClaimedAdmissionOutcomeError extends Error {
  constructor() {
    super(
      'Founder admission may have committed after the reviewed plan was claimed. '
      + 'Inspect the fresh mode-aware cutover and legacy/v17 aggregate state before '
      + 'creating or submitting another plan.',
    );
    this.name = 'HermesClaimedAdmissionOutcomeError';
  }
}

class HermesClaimedAccessRequestResetOutcomeError extends Error {
  constructor() {
    super(
      'The reviewed access-request reset plan was consumed and the mutation outcome may be '
      + 'indeterminate. Run inspect-access-request-reset; never create or submit a new plan '
      + 'until the current state is reconciled.',
    );
    this.name = 'HermesClaimedAccessRequestResetOutcomeError';
  }
}

class HermesClaimedAdmissionNotificationRecoveryOutcomeError extends Error {
  constructor() {
    super(
      'The reviewed admission-notification recovery plan was consumed and the bridge outcome '
      + 'may be indeterminate. Inspect the token-free notification status and the unchanged '
      + 'pending access request before any new recovery plan or admission attempt.',
    );
    this.name = 'HermesClaimedAdmissionNotificationRecoveryOutcomeError';
  }
}

function fail(message: string): never {
  throw new HermesCliError(message);
}

type NotificationGatedFounderCommand = Extract<Command, 'admit-founder' | 'allow-fid'>;

export function requireFounderAdmissionNotificationDeliveryApproval(
  command: NotificationGatedFounderCommand,
  approved: boolean = FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED,
): void {
  if (!approved) {
    fail(
      'Founder admission notification delivery is not approved. '
      + `${command} remains unavailable until the coordinated notification release.`,
    );
  }
}

export type HermesNotificationPagesLiveAuthority =
  NotificationPagesLiveHermesAuthority;

export async function inspectHermesNotificationPagesLiveAuthority(
  input: Readonly<{
    required: boolean;
    pagesSourceCommit?: string;
    rootBinding?: Readonly<{
      notificationPagesLiveRootReceiptDigest: string | null;
      notificationPagesLiveRootPagesSourceCommit: string | null;
    }>;
    directory?: string;
    repositoryRoot?: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
  dependencies: Parameters<typeof inspectNotificationPagesLiveAuthority>[1] = {},
): Promise<HermesNotificationPagesLiveAuthority> {
  return inspectNotificationPagesLiveAuthority(input, dependencies);
}

function sameHermesNotificationPagesLiveAuthority(
  value: HermesNotificationPagesLiveAuthority,
  authority: HermesNotificationPagesLiveAuthority,
): boolean {
  return sameNotificationPagesLiveHermesAuthority(value, authority);
}

export function privacySafeHermesErrorMessage(error: unknown): string {
  if (
    error instanceof HermesCliError
    || error instanceof HermesOperationTimeoutError
    || error instanceof HermesClaimedAdmissionOutcomeError
    || error instanceof HermesClaimedAccessRequestResetOutcomeError
    || error instanceof HermesClaimedAdmissionNotificationRecoveryOutcomeError
    || error instanceof FounderAdmissionAuthorityError
    || error instanceof AlphaActivationControlError
    || error instanceof AlphaV10ActivationControlError
  ) {
    return error.message;
  }
  if (
    error instanceof FounderAdmissionPlanError
    || error instanceof FarcasterPublicProfileError
    || error instanceof ProfileTransportError
    || error instanceof ProfileAuthorityPolicyError
    || error instanceof AccessRequestResetPlanError
    || error instanceof AdmissionNotificationRecoveryPlanError
  ) return error.code;
  return 'Hermes command failed.';
}

export function throwHermesOperationFailure(
  error: unknown,
  founderAdmissionClaimed: boolean,
  accessRequestResetClaimed = false,
  notificationRecoveryClaimed = false,
): never {
  if (notificationRecoveryClaimed) {
    throw new HermesClaimedAdmissionNotificationRecoveryOutcomeError();
  }
  if (accessRequestResetClaimed) {
    throw new HermesClaimedAccessRequestResetOutcomeError();
  }
  if (founderAdmissionClaimed) throw new HermesClaimedAdmissionOutcomeError();
  throw error;
}

function readHttpsUrl(value: string | undefined, label: string) {
  if (!value) fail(`${label} is required.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname.endsWith('.invalid')) {
    fail(`${label} must be a stable public HTTPS base URL.`);
  }
  return url.pathname === '/' ? url.origin : url.toString().replace(/\/$/, '');
}

function readDatabase(value: string | undefined, fallback = LEGACY_DATABASE_ALIAS) {
  const database = value || fallback;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) {
    fail('WARPKEEP_SPACETIMEDB_DATABASE is invalid.');
  }
  return database;
}

function readFid(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  const fid = BigInt(value);
  if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('FID exceeds the supported safe range.');
  }
  return fid;
}

function readFounderCount(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,2}$/.test(value)) {
    fail('An expected founder count from 1 to 100 is required.');
  }
  const count = BigInt(value);
  if (count > MAX_RESOURCE_BACKFILL_FOUNDERS) {
    fail('An expected founder count from 1 to 100 is required.');
  }
  return count;
}

function sanitizeNote(value: string | undefined, fallback?: string) {
  const note = (value ?? fallback ?? '').trim();
  if (!note || note.length > 512) fail('A non-empty note of at most 512 characters is required.');
  return note;
}

export function readAdminSecret(value: string | undefined, fromStdin: string | undefined) {
  const descriptorText = process.env.WARPKEEP_ADMIN_TOKEN_SECRET_FD;
  const descriptor = descriptorText === undefined ? 0 : descriptorText === '3' ? 3 : -1;
  if (descriptor < 0 || (descriptorText !== undefined && fromStdin !== undefined)) {
    fail('The Hermes credential source was ambiguous.');
  }
  if (fromStdin !== undefined && fromStdin !== '1') {
    fail('WARPKEEP_ADMIN_TOKEN_SECRET_STDIN must be exactly 1 when configured.');
  }
  if (fromStdin === '1' || descriptorText !== undefined) {
    if (value !== undefined) fail('The Hermes credential source was ambiguous.');
    try {
      value = readFileSync(descriptor, 'utf8');
    } catch {
      fail('The Hermes credential pipe was unavailable.');
    }
  }
  const bytes = value === undefined ? 0 : new TextEncoder().encode(value).byteLength;
  if (bytes < 32 || bytes > 512) {
    fail('WARPKEEP_ADMIN_TOKEN_SECRET must contain 32 to 512 bytes.');
  }
  return value as string;
}

type CapturedTrustedHermesLaunch = Readonly<{
  row: HermesTrustedReleaseRow;
  protectedCommit?: string;
  adminSecretPath?: string;
  notificationSecretPath?: string;
  privateInputPath?: string;
  founderPlanDirectory?: string;
  notificationRecoveryPlanDirectory?: string;
  pendingCensusDirectory?: string;
}>;

function trustedHermesReleaseRow(input: Readonly<{
  command: Command;
  dryRun: boolean;
}>): HermesTrustedReleaseRow | undefined {
  if (input.command === 'list-pending-access-requests') return 'list-pending';
  if (input.command === 'admit-founder') return input.dryRun ? 'admit-dry' : 'admit-confirm';
  if (input.command === 'allow-fid') return input.dryRun ? 'allow-dry' : 'allow-confirm';
  if (input.command === 'inspect-admission-notification') return 'notification-inspect';
  if (input.command === 'recover-admission-notification') {
    return input.dryRun ? 'notification-recover-dry' : 'notification-recover-confirm';
  }
  return undefined;
}

function captureTrustedHermesLaunch(
  expectedRow: HermesTrustedReleaseRow | undefined,
): CapturedTrustedHermesLaunch | undefined {
  const profile = process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  const row = process.env.WKGR_HERMES_RELEASE_COMMAND;
  const protectedCommit = process.env.WKGR_PRODUCTION_PROTECTED_COMMIT;
  const adminSecretPath = process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  const notificationSecretPath = process.env.WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH;
  const privateInputPath = process.env.WKGR_PRODUCTION_PRIVATE_INPUT_PATH;
  const founderPlanDirectory = process.env.WKGR_HERMES_FOUNDER_PLAN_DIRECTORY;
  const notificationRecoveryPlanDirectory =
    process.env.WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY;
  const pendingCensusDirectory = process.env.WKGR_HERMES_PENDING_CENSUS_DIRECTORY;
  delete process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  delete process.env.WKGR_HERMES_RELEASE_COMMAND;
  delete process.env.WKGR_PRODUCTION_PROTECTED_COMMIT;
  delete process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_PRIVATE_INPUT_PATH;
  delete process.env.WKGR_HERMES_FOUNDER_PLAN_DIRECTORY;
  delete process.env.WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY;
  delete process.env.WKGR_HERMES_PENDING_CENSUS_DIRECTORY;
  if (expectedRow === undefined) {
    if ([profile, row, protectedCommit, adminSecretPath, notificationSecretPath,
      privateInputPath, founderPlanDirectory, notificationRecoveryPlanDirectory,
      pendingCensusDirectory].some(value => value !== undefined)) {
      fail('Hermes trusted-bootstrap authority is invalid for this command.');
    }
    return undefined;
  }
  if (
    profile !== 'warpkeep-greater-realm-production-bootstrap-v1'
    || row !== expectedRow
  ) fail('Hermes production release commands require the exact trusted bootstrap.');
  return Object.freeze({
    row: expectedRow,
    ...(protectedCommit === undefined ? {} : { protectedCommit }),
    ...(adminSecretPath === undefined ? {} : { adminSecretPath }),
    ...(notificationSecretPath === undefined ? {} : { notificationSecretPath }),
    ...(privateInputPath === undefined ? {} : { privateInputPath }),
    ...(founderPlanDirectory === undefined ? {} : { founderPlanDirectory }),
    ...(notificationRecoveryPlanDirectory === undefined
      ? {}
      : { notificationRecoveryPlanDirectory }),
    ...(pendingCensusDirectory === undefined ? {} : { pendingCensusDirectory }),
  });
}

function exactTrustedPrivatePath(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) fail('Hermes trusted-bootstrap private path is required.');
    return undefined;
  }
  if (!required || !isAbsolute(value) || resolve(value) !== value || /[\u0000\r\n]/u.test(value)) {
    fail('Hermes trusted-bootstrap private path is invalid.');
  }
  return value;
}

function exactTrustedPlanDirectory(value: string | undefined): string {
  const path = exactTrustedPrivatePath(value, true)!;
  try {
    assertProductionAdminTrustedAncestors(path);
    const status = lstatSync(path);
    if (
      status.isSymbolicLink() || !status.isDirectory()
      || (status.mode & 0o7777) !== 0o700
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || realpathSync(path) !== path
    ) fail('Hermes trusted-bootstrap plan directory is invalid.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Hermes trusted-bootstrap')) throw error;
    fail('Hermes trusted-bootstrap plan directory is invalid.');
  }
  return path;
}

function validateTrustedHermesLaunch(
  captured: CapturedTrustedHermesLaunch | undefined,
): TrustedHermesLaunch | undefined {
  if (captured === undefined) return undefined;
  const requiresAdmin = new Set<HermesTrustedReleaseRow>([
    'list-pending', 'admit-confirm', 'allow-confirm', 'notification-recover-dry',
    'notification-recover-confirm',
  ]).has(captured.row);
  const requiresNotification = new Set<HermesTrustedReleaseRow>([
    'admit-confirm', 'allow-confirm', 'notification-inspect',
    'notification-recover-dry', 'notification-recover-confirm',
  ]).has(captured.row);
  const requiresPrivateInput = captured.row === 'admit-dry' || captured.row === 'admit-confirm';
  const requiresFounderPlan = captured.row === 'admit-dry' || captured.row === 'admit-confirm';
  const requiresRecoveryPlan = captured.row === 'notification-recover-dry'
    || captured.row === 'notification-recover-confirm';
  const requiresPendingCensus = captured.row === 'list-pending';
  if (requiresAdmin && captured.adminSecretPath === undefined) {
    fail('WKGR_PRODUCTION_ADMIN_SECRET_PATH is required for this Hermes release command.');
  }
  if (requiresNotification && captured.notificationSecretPath === undefined) {
    fail('WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH is required for this Hermes release command.');
  }
  if (requiresPrivateInput && captured.privateInputPath === undefined) {
    fail('WKGR_PRODUCTION_PRIVATE_INPUT_PATH is required for this Hermes release command.');
  }
  const adminSecretPath = exactTrustedPrivatePath(captured.adminSecretPath, requiresAdmin);
  const notificationSecretPath = exactTrustedPrivatePath(
    captured.notificationSecretPath,
    requiresNotification,
  );
  const privateInputPath = exactTrustedPrivatePath(captured.privateInputPath, requiresPrivateInput);
  if (requiresFounderPlan !== (captured.founderPlanDirectory !== undefined)) {
    fail('WKGR_HERMES_FOUNDER_PLAN_DIRECTORY has an invalid command role.');
  }
  if (requiresRecoveryPlan !== (captured.notificationRecoveryPlanDirectory !== undefined)) {
    fail('WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY has an invalid command role.');
  }
  if (requiresPendingCensus !== (captured.pendingCensusDirectory !== undefined)) {
    fail('WKGR_HERMES_PENDING_CENSUS_DIRECTORY has an invalid command role.');
  }
  if (
    captured.protectedCommit === undefined
    || !COMMIT_SHA.test(captured.protectedCommit)
  ) fail('WKGR_PRODUCTION_PROTECTED_COMMIT is invalid for this Hermes release command.');
  if (
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined
    || process.env.WARPKEEP_ADMIN_TOKEN_SECRET_FD !== undefined
    || process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN !== undefined
    || process.env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET !== undefined
    || process.env.WARPKEEP_HERMES_NONINTERACTIVE !== undefined
  ) fail('Hermes trusted-bootstrap credential authority is ambiguous.');
  return Object.freeze({
    row: captured.row,
    ...(captured.protectedCommit === undefined
      ? {}
      : { protectedCommit: captured.protectedCommit }),
    ...(adminSecretPath === undefined ? {} : { adminSecretPath }),
    ...(notificationSecretPath === undefined ? {} : { notificationSecretPath }),
    ...(privateInputPath === undefined ? {} : { privateInputPath }),
    ...(captured.founderPlanDirectory === undefined
      ? {}
      : { founderPlanDirectory: exactTrustedPlanDirectory(captured.founderPlanDirectory) }),
    ...(captured.notificationRecoveryPlanDirectory === undefined
      ? {}
      : {
          notificationRecoveryPlanDirectory:
            exactTrustedPlanDirectory(captured.notificationRecoveryPlanDirectory),
        }),
    ...(captured.pendingCensusDirectory === undefined
      ? {}
      : {
          pendingCensusDirectory:
            exactTrustedPlanDirectory(captured.pendingCensusDirectory),
        }),
  });
}

function readTrustedHermesPrivateFile(path: string, maximumBytes: number): Buffer {
  let descriptor: number | undefined;
  try {
    assertProductionAdminTrustedAncestors(dirname(path));
    const parent = lstatSync(resolve(path, '..'), { bigint: true });
    const pathStatus = lstatSync(path, { bigint: true });
    if (
      parent.isSymbolicLink() || !parent.isDirectory()
      || (parent.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && parent.uid !== BigInt(process.getuid()))
      || pathStatus.isSymbolicLink() || !pathStatus.isFile() || pathStatus.nlink !== 1n
      || (pathStatus.mode & 0o7777n) !== 0o600n
      || (process.getuid !== undefined && pathStatus.uid !== BigInt(process.getuid()))
      || pathStatus.size < 1n || pathStatus.size > BigInt(maximumBytes)
      || realpathSync(path) !== path
    ) fail('Hermes trusted-bootstrap private file is invalid.');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== pathStatus.dev || before.ino !== pathStatus.ino
      || before.mode !== pathStatus.mode || before.uid !== pathStatus.uid
      || before.nlink !== pathStatus.nlink || before.size !== pathStatus.size
    ) fail('Hermes trusted-bootstrap private file is invalid.');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.uid !== before.uid || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || current.dev !== before.dev || current.ino !== before.ino || current.mode !== before.mode
      || current.uid !== before.uid || current.nlink !== before.nlink
      || current.size !== before.size || current.mtimeNs !== before.mtimeNs
      || current.ctimeNs !== before.ctimeNs || bytes.byteLength !== Number(before.size)
    ) {
      bytes.fill(0);
      fail('Hermes trusted-bootstrap private file changed while being read.');
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Hermes trusted-bootstrap')) throw error;
    return fail('Hermes trusted-bootstrap private file is invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readTrustedHermesSecret(path: string): string {
  const bytes = readTrustedHermesPrivateFile(path, 512);
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.byteLength < 32 || /[\u0000\r\n]/u.test(value)) {
      fail('Hermes trusted-bootstrap secret is invalid.');
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Hermes trusted-bootstrap')) throw error;
    return fail('Hermes trusted-bootstrap secret is invalid.');
  } finally {
    bytes.fill(0);
  }
}

function readTrustedFounderAdmissionInput(path: string): Record<string, unknown> {
  const bytes = readTrustedHermesPrivateFile(path, 32 * 1_024);
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('Hermes trusted-bootstrap founder input is invalid.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Hermes trusted-bootstrap')) throw error;
    return fail('Hermes trusted-bootstrap founder input is invalid.');
  } finally {
    bytes.fill(0);
  }
}

function commandFrom(value: string | undefined): Command {
  if (
    value === 'list-access-requests'
    || value === 'list-pending-access-requests'
  ) {
    fail(
      'Legacy access-request listing is suspended for the 0.4.0 sealed launch. '
      + 'Use only the reviewed private export-access-request-census command.',
    );
  }
  if (
    value === 'seed-world'
    || value === 'expand-world-v3'
    || value === 'export-access-request-census'
    || value === 'inspect-access-request-reset'
    || value === 'reset-access-request'
    || value === 'admit-founder'
    || value === 'inspect-admission-notification'
    || value === 'recover-admission-notification'
    || value === 'allow-fid'
    || value === 'disable-fid'
    || value === 'bump-auth-epoch'
    || value === 'inspect-alpha'
    || value === 'inspect-alpha-v2'
    || value === 'inspect-alpha-v3'
    || value === 'inspect-alpha-v4'
    || value === 'inspect-alpha-v8'
    || value === 'inspect-alpha-v10'
    || value === 'inspect-alpha-v12'
    || value === 'inspect-publish-pre-v12'
    || value === 'inspect-publish-post-v12'
    || value === 'seed-alpha-component'
    || value === 'activate-alpha-water'
    || value === 'backfill-resources'
  ) {
    return value;
  }
  fail(
    'Usage: hermes-admin.ts '
    + '<seed-world|expand-world-v3|export-access-request-census|inspect-access-request-reset|reset-access-request|admit-founder|inspect-admission-notification|recover-admission-notification|allow-fid|disable-fid|bump-auth-epoch|backfill-resources|seed-alpha-component|activate-alpha-water|inspect-alpha|inspect-alpha-v2|inspect-alpha-v3|inspect-alpha-v4|inspect-alpha-v8|inspect-alpha-v10|inspect-alpha-v12|inspect-publish-pre-v12|inspect-publish-post-v12> '
    + '[...args] [--dry-run] [--confirm]. admit-founder requires private stdin: '
    + '--input-stdin --dry-run creates a reviewed plan; --input-stdin --confirm consumes it; '
    + 'allow-fid only re-enables an existing complete founder. The legacy listing commands '
    + 'are source-suspended. export-access-request-census requires --dry-run or '
    + '--confirm plus --g001-admission-freeze-attestation SHA256, after the source-bound '
    + 'Genesis 001 freeze deploy has been independently verified. '
    + 'reset-access-request dry-run requires FID and note; '
    + 'confirmed execution accepts the reviewed plan filename and digest. '
    + 'recover-admission-notification uses the same reviewed-plan shape for one '
    + 'exhausted first-time request generation, while '
    + '--input-stdin carries the administrator secret.',
  );
}

export function parseHermesArguments(arguments_: readonly string[] = process.argv.slice(2)) {
  const allowedFlags = new Set([
    '--dry-run',
    '--confirm',
    '--json',
    '--input-stdin',
    '--include-resolved',
  ]);
  const valuedFlags = new Set([
    '--limit',
    '--after-requested-at-micros',
    '--after-fid',
    '--g001-admission-freeze-attestation',
  ]);
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument.startsWith('--')) {
      if (valuedFlags.has(argument)) {
        const value = arguments_[index + 1];
        if (
          options.has(argument)
          || value === undefined
          || value.startsWith('--')
        ) {
          fail('Unknown, duplicate, or incomplete Hermes command-line argument.');
        }
        options.set(argument, value);
        index += 1;
      } else if (!allowedFlags.has(argument) || flags.has(argument)) {
        fail('Unknown or duplicate Hermes command-line argument.');
      } else {
        flags.add(argument);
      }
    } else {
      positional.push(argument);
    }
  }

  const command = commandFrom(positional[0]);
  const inspection = command === 'inspect-alpha'
    || command === 'inspect-alpha-v2'
    || command === 'inspect-alpha-v3'
    || command === 'inspect-alpha-v4'
    || command === 'inspect-alpha-v8'
    || command === 'inspect-alpha-v10'
    || command === 'inspect-alpha-v12'
    || command === 'inspect-publish-pre-v12'
    || command === 'inspect-publish-post-v12'
    || command === 'list-access-requests'
    || command === 'list-pending-access-requests'
    || (command === 'export-access-request-census' && flags.has('--dry-run'))
    || command === 'inspect-access-request-reset'
    || command === 'inspect-admission-notification';
  const expectedPositionals = command === 'reset-access-request'
    || command === 'recover-admission-notification'
    ? 3
    : command === 'inspect-access-request-reset'
      ? 2
    : command === 'inspect-admission-notification'
      ? 2
    : command === 'allow-fid'
    || command === 'disable-fid'
    || command === 'bump-auth-epoch'
    ? 3
    : command === 'backfill-resources' || command === 'seed-alpha-component'
      ? 2
    : 1;
  if (positional.length !== expectedPositionals) {
    fail('Hermes command received an unexpected number of positional arguments.');
  }
  if (
    (inspection
      && command !== 'export-access-request-census'
      && (flags.has('--confirm') || flags.has('--dry-run')))
    || (!inspection && command !== 'export-access-request-census' && flags.has('--json'))
  ) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }
  if (command !== 'list-access-requests' && command !== 'export-access-request-census' && (
    flags.has('--include-resolved')
    || options.size > 0
  )) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }
  if (command === 'list-access-requests' && (
    flags.has('--input-stdin')
    || flags.has('--confirm')
    || flags.has('--dry-run')
    || options.has('--g001-admission-freeze-attestation')
  )) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }
  if (
    command === 'list-pending-access-requests'
    && (flags.size !== 0 || options.size !== 0)
  ) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }
  if (command === 'export-access-request-census') {
    if (
      flags.has('--json')
      || flags.has('--input-stdin')
      || flags.has('--include-resolved')
      || [...options.keys()].some(
        option => option !== '--g001-admission-freeze-attestation',
      )
    ) fail('Hermes command received a flag that is invalid for this operation.');
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Access request census export requires exactly one of --dry-run or --confirm.');
    }
    if (
      options.get('--g001-admission-freeze-attestation')
      !== GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST
    ) {
      fail(
        'Access request census requires the exact source-bound Genesis 001 '
        + 'admission freeze attestation.',
      );
    }
  }
  if (command === 'admit-founder') {
    if (!flags.has('--input-stdin')) {
      fail('Profiled admission requires private input through --input-stdin.');
    }
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Profiled admission requires exactly one of --dry-run or --confirm.');
    }
  } else if (command === 'reset-access-request') {
    if (flags.has('--json')) {
      fail('Hermes command received a flag that is invalid for this operation.');
    }
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Access request reset requires exactly one of --dry-run or --confirm.');
    }
    if (!flags.has('--input-stdin')) {
      fail('Access request reset requires the administrator secret through --input-stdin.');
    }
  } else if (command === 'recover-admission-notification') {
    if (flags.has('--json')) {
      fail('Hermes command received a flag that is invalid for this operation.');
    }
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Admission notification recovery requires exactly one of --dry-run or --confirm.');
    }
    if (!flags.has('--input-stdin')) {
      fail('Admission notification recovery requires the administrator secret through --input-stdin.');
    }
  } else if (command === 'seed-alpha-component') {
    parseSeedableAlphaComponent(positional[1]);
    if (flags.has('--input-stdin') || flags.has('--json')) {
      fail('Hermes command received a flag that is invalid for this operation.');
    }
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Alpha component seed requires exactly one of --dry-run or --confirm.');
    }
  } else if (command === 'activate-alpha-water') {
    if (flags.has('--input-stdin') || flags.has('--json')) {
      fail('Hermes command received a flag that is invalid for this operation.');
    }
    if (flags.has('--dry-run') === flags.has('--confirm')) {
      fail('Water activation requires exactly one of --dry-run or --confirm.');
    }
  } else if (flags.has('--input-stdin')) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }

  const accessRequestLimitText = options.get('--limit') ?? '100';
  if (
    command === 'list-access-requests'
    && (
      !/^[1-9][0-9]{0,2}$/.test(accessRequestLimitText)
      || Number(accessRequestLimitText) > MAX_ACCESS_REQUEST_PAGE_SIZE
    )
  ) {
    fail('Access request limit must be an integer from 1 to 100.');
  }
  const afterRequestedAtText = options.get('--after-requested-at-micros');
  const afterFidText = options.get('--after-fid');
  if (
    command === 'list-access-requests'
    && ((afterRequestedAtText === undefined) !== (afterFidText === undefined))
  ) {
    fail('Access request cursor requires both timestamp and FID.');
  }
  let afterRequestedAtMicros = 0n;
  let afterFid = 0n;
  if (command === 'list-access-requests' && afterRequestedAtText !== undefined) {
    if (!/^[1-9][0-9]{0,19}$/.test(afterRequestedAtText)) {
      fail('Access request cursor timestamp must be a positive u64 integer.');
    }
    afterRequestedAtMicros = BigInt(afterRequestedAtText);
    if (afterRequestedAtMicros > U64_MAXIMUM) {
      fail('Access request cursor timestamp must be a positive u64 integer.');
    }
    afterFid = readFid(afterFidText);
  }

  return Object.freeze({
    command,
    positional: Object.freeze(positional),
    dryRun: flags.has('--dry-run'),
    confirmedByFlag: flags.has('--confirm'),
    inspection,
    machineReadableInspection: inspection && flags.has('--json'),
    existingFounderReenableOnly: command === 'allow-fid',
    privateInputStdin: flags.has('--input-stdin'),
    accessRequestCensusAdmissionFreezeAttestation:
      command === 'export-access-request-census'
        ? options.get('--g001-admission-freeze-attestation')
        : undefined,
    accessRequestList: Object.freeze({
      limit: command === 'list-access-requests' ? Number(accessRequestLimitText) : 0,
      afterRequestedAtMicros,
      afterFid,
      includeResolved: command === 'list-access-requests'
        && flags.has('--include-resolved'),
    }),
  });
}

/**
 * Source-bound operator suspension for the permanently sealed Genesis 001
 * population. It runs before launch capture, credentials, network, profile
 * resolution, reviewed-plan reads, or any reducer invocation.
 */
export function requireGenesis001AdmissionOperatorCommandEnabled(command: Command): void {
  if ((GENESIS_001_SUSPENDED_HERMES_COMMANDS as readonly Command[]).includes(command)) {
    fail(
      'Genesis 001 admission/reset operator is suspended at source baseline '
      + GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT + '.',
    );
  }
}

export function parseSeedableAlphaComponent(value: string | undefined): SeedableAlphaComponent {
  if (value === 'water' || value === 'stone') return parseAlphaV10ActivationComponent(value);
  return parseAlphaActivationComponent(value);
}

/**
 * Resolve exactly one founder's public presentation from the pinned,
 * owner-reviewed Snapchain transport. No operator-selected origin,
 * credential, wallet field, or browser claim can enter this path.
 */
export async function resolveAdmissionReadyFounderProfile(
  fid: bigint,
  fetchImpl: typeof fetch = fetch,
): Promise<AdmissionReadyTrustedProfile> {
  try {
    const responses = await fetchPublicProfileResponses({
      source: { sourceId: TRUSTED_PRODUCTION_FOUNDER_ADMISSION_SOURCE_ID },
      purpose: TRUSTED_FOUNDER_ADMISSION_PURPOSE,
      fid,
      fetchImpl,
    });
    const resolved = buildTrustedPublicFarcasterProfile({ fid, responses });
    return normalizeAdmissionReadyTrustedProfile(resolved);
  } catch {
    fail('A complete trusted Farcaster username and HTTPS profile image are required for admission.');
  }
}

/** Privacy-safe dry-run projection: values are booleans or counts only. */
export function admissionReadinessSummary(profile: AdmissionReadyTrustedProfile) {
  const optionalFieldsPresent = Number(profile.displayName !== undefined)
    + Number(profile.publicBio !== undefined);
  return Object.freeze({
    ready: true,
    trustedSourcePinned: true,
    requiredFieldsPresent: 2,
    requiredFieldsExpected: 2,
    optionalFieldsPresent,
    publicFieldsPresent: 2 + optionalFieldsPresent,
    credentialsAccessed: false,
    mutationSubmitted: false,
    dryRun: true,
  });
}

function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, printable(entry)]));
  }
  return value;
}

/**
 * Keep the v12 operator surface aggregate-only and fail closed if the generated
 * procedure contract changes. Raw u64 values must still be canonical SDK
 * bigints here; decimal-string conversion happens only at the JSON boundary.
 */
export function projectWorkerSystemStatusV12(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Worker procedure-v12 returned an invalid status object.');
  }
  const status = value as Record<string, unknown>;
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== WORKER_STATUS_V12_KEYS.length
    || actualKeys.some((key, index) => key !== WORKER_STATUS_V12_KEYS[index])
  ) {
    fail('Worker procedure-v12 returned unexpected fields.');
  }
  for (const field of WORKER_STATUS_V12_U64_FIELDS) {
    const count = status[field];
    if (typeof count !== 'bigint' || count < 0n || count > U64_MAXIMUM) {
      fail('Worker procedure-v12 returned an invalid aggregate count.');
    }
  }
  for (const field of WORKER_STATUS_V12_BOOLEAN_FIELDS) {
    if (typeof status[field] !== 'boolean') {
      fail('Worker procedure-v12 returned an invalid status flag.');
    }
  }
  if (
    (status.mode !== 'absent' && status.mode !== 'staged' && status.mode !== 'active')
    || (status.rosterDigest !== ''
      && (typeof status.rosterDigest !== 'string'
        || !/^[0-9a-f]{16}$/.test(status.rosterDigest)))
    || typeof status.rosterDigestExpected !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.rosterDigestExpected)
  ) {
    fail('Worker procedure-v12 returned invalid worker metadata.');
  }
  return Object.freeze(Object.fromEntries(
    [...WORKER_STATUS_V12_U64_FIELDS, ...WORKER_STATUS_V12_BOOLEAN_FIELDS,
      ...WORKER_STATUS_V12_STRING_FIELDS]
      .map(field => [field, status[field]]),
  ));
}

type AccessRequestListOptions = Readonly<{
  limit: number;
  afterRequestedAtMicros: bigint;
  afterFid: bigint;
  includeResolved: boolean;
}>;

type AccessRequestListEntry = Readonly<{
  fid: bigint;
  requestedAtMicros: bigint;
  admissionState: 'missing' | 'enabled' | 'disabled';
  requestState: 'pending' | 'resolved';
}>;

type AccessRequestListPage = Readonly<{
  entries: readonly AccessRequestListEntry[];
  nextRequestedAtMicros: bigint | undefined;
  nextFid: bigint | undefined;
  hasMore: boolean;
  totalRequests: bigint;
  pendingRequests: bigint;
}>;

export type PendingAccessRequestCensus = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-pending-access-request-census-v1';
  protectedCommit: string;
  targetConfigurationDigest: string;
  totalRequests: string;
  pendingRequests: string;
  entries: readonly Readonly<{
    fid: string;
    requestedAtMicros: string;
    admissionState: 'missing' | 'disabled';
  }>[];
  advisoryOnly: true;
  admissionMustRecheckRequestCas: true;
}>;

/** Private owner export. Its rows must never be sent to stdout. */
export type AccessRequestCensus = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-access-request-census-v1';
  realmId: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID;
  releaseVersion: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION;
  sourceBaselineCommit: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT;
  admissionFreezeAttestation: typeof GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST;
  targetConfigurationDigest: string;
  totalRequests: string;
  pendingRequests: string;
  entries: readonly Readonly<{
    fid: string;
    requestedAtMicros: string;
    admissionState: 'missing' | 'enabled' | 'disabled';
    requestState: 'pending' | 'resolved';
  }>[];
}>;

type Genesis001AccessPolicy = Readonly<{
  realmId: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID;
  releaseVersion: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION;
  playerAccessEnabled: true;
  admissionStateMutationsEnabled: false;
  accessRequestSubmissionsEnabled: false;
  sourceBaselineCommit: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT;
  freezeReleaseNonce: typeof GENESIS_001_ACCESS_REQUEST_CENSUS_FREEZE_NONCE;
}>;

type AccessRequestResetStatus = Readonly<{
  admissionState: 'enabled' | 'disabled';
  authEpoch: number;
  requestState: 'not_requested' | 'pending' | 'resolved';
  requestCycle: bigint | undefined;
  requestedAtMicros: bigint | undefined;
}>;

type AccessRequestAdmissionStatus = Readonly<{
  admissionState: 'missing' | 'enabled' | 'disabled';
  authEpoch: number;
  requestState: 'not_requested' | 'pending' | 'resolved';
  requestCycle: bigint | undefined;
  requestedAtMicros: bigint | undefined;
}>;

type PendingAccessRequestAdmissionStatus<State extends 'missing' | 'disabled'> =
  AccessRequestAdmissionStatus & Readonly<{
    admissionState: State;
    requestState: 'pending';
    requestCycle: bigint;
    requestedAtMicros: bigint;
  }>;

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  message: string,
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    fail(message);
  }
}

function requireU64(value: unknown, allowZero: boolean, message: string): bigint {
  if (
    typeof value !== 'bigint'
    || value < (allowZero ? 0n : 1n)
    || value > U64_MAXIMUM
  ) {
    fail(message);
  }
  return value;
}

function compareAccessRequestEntries(
  left: Pick<AccessRequestListEntry, 'requestedAtMicros' | 'fid'>,
  right: Pick<AccessRequestListEntry, 'requestedAtMicros' | 'fid'>,
): number {
  if (left.requestedAtMicros !== right.requestedAtMicros) {
    return left.requestedAtMicros < right.requestedAtMicros ? -1 : 1;
  }
  if (left.fid === right.fid) return 0;
  return left.fid < right.fid ? -1 : 1;
}

/** Exact, privacy-bounded projection of the private owner review page. */
export function projectAccessRequestListPage(
  value: unknown,
  options: AccessRequestListOptions,
): AccessRequestListPage {
  if (
    !Number.isInteger(options.limit)
    || options.limit < 1
    || options.limit > MAX_ACCESS_REQUEST_PAGE_SIZE
    || options.afterRequestedAtMicros < 0n
    || options.afterRequestedAtMicros > U64_MAXIMUM
    || options.afterFid < 0n
    || options.afterFid > BigInt(Number.MAX_SAFE_INTEGER)
    || ((options.afterRequestedAtMicros === 0n) !== (options.afterFid === 0n))
  ) {
    fail('Access request listing options were invalid.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Access request procedure returned an invalid page.');
  }
  const page = value as Record<string, unknown>;
  exactObjectKeys(
    page,
    ACCESS_REQUEST_PAGE_KEYS,
    'Access request procedure returned unexpected fields.',
  );
  if (!Array.isArray(page.entries) || page.entries.length > options.limit) {
    fail('Access request procedure returned an invalid page.');
  }

  const entries: AccessRequestListEntry[] = [];
  for (const candidate of page.entries) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      fail('Access request procedure returned an invalid entry.');
    }
    const entry = candidate as Record<string, unknown>;
    exactObjectKeys(
      entry,
      ACCESS_REQUEST_ENTRY_KEYS,
      'Access request procedure returned unexpected entry fields.',
    );
    const fid = requireU64(
      entry.fid,
      false,
      'Access request procedure returned an invalid FID.',
    );
    if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail('Access request procedure returned an invalid FID.');
    }
    const requestedAtMicros = requireU64(
      entry.requestedAtMicros,
      false,
      'Access request procedure returned an invalid timestamp.',
    );
    if (
      entry.admissionState !== 'missing'
      && entry.admissionState !== 'enabled'
      && entry.admissionState !== 'disabled'
    ) {
      fail('Access request procedure returned an invalid admission state.');
    }
    if (
      entry.requestState !== 'pending'
      && entry.requestState !== 'resolved'
    ) {
      fail('Access request procedure returned an invalid request state.');
    }
    if (
      entry.requestState === 'pending'
      && entry.admissionState === 'enabled'
    ) {
      fail('Access request procedure returned an inconsistent request state.');
    }
    if (!options.includeResolved && entry.requestState !== 'pending') {
      fail('Access request procedure returned a resolved request unexpectedly.');
    }
    const projected = Object.freeze({
      fid,
      requestedAtMicros,
      admissionState: entry.admissionState,
      requestState: entry.requestState,
    });
    const previous = entries.at(-1);
    if (previous && compareAccessRequestEntries(previous, projected) >= 0) {
      fail('Access request procedure returned an unsorted page.');
    }
    if (
      options.afterRequestedAtMicros > 0n
      && compareAccessRequestEntries(
        projected,
        {
          requestedAtMicros: options.afterRequestedAtMicros,
          fid: options.afterFid,
        },
      ) <= 0
    ) {
      fail('Access request procedure returned an invalid cursor page.');
    }
    entries.push(projected);
  }

  if (typeof page.hasMore !== 'boolean') {
    fail('Access request procedure returned an invalid page flag.');
  }
  const totalRequests = requireU64(
    page.totalRequests,
    true,
    'Access request procedure returned an invalid total.',
  );
  const pendingRequests = requireU64(
    page.pendingRequests,
    true,
    'Access request procedure returned an invalid pending total.',
  );
  if (
    pendingRequests > totalRequests
    || BigInt(entries.length) > totalRequests
    || (!options.includeResolved && BigInt(entries.length) > pendingRequests)
  ) {
    fail('Access request procedure returned inconsistent totals.');
  }

  const nextRequestedAtMicros = page.nextRequestedAtMicros === undefined
    ? undefined
    : requireU64(
      page.nextRequestedAtMicros,
      false,
      'Access request procedure returned an invalid next cursor.',
    );
  const nextFid = page.nextFid === undefined
    ? undefined
    : requireU64(
      page.nextFid,
      false,
      'Access request procedure returned an invalid next cursor.',
    );
  if (
    (nextRequestedAtMicros === undefined) !== (nextFid === undefined)
    || (page.hasMore && entries.length === 0)
    || (page.hasMore !== (nextRequestedAtMicros !== undefined))
  ) {
    fail('Access request procedure returned an inconsistent next cursor.');
  }
  const last = entries.at(-1);
  if (
    page.hasMore
    && (
      last === undefined
      || nextRequestedAtMicros !== last.requestedAtMicros
      || nextFid !== last.fid
    )
  ) {
    fail('Access request procedure returned an inconsistent next cursor.');
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    nextRequestedAtMicros,
    nextFid,
    hasMore: page.hasMore,
    totalRequests,
    pendingRequests,
  });
}

/** Strict private projection used only to bind one reset transaction by CAS. */
export function projectAccessRequestResetStatus(value: unknown): AccessRequestResetStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Access request reset status was invalid.');
  }
  const status = value as Record<string, unknown>;
  exactObjectKeys(
    status,
    ACCESS_REQUEST_RESET_STATUS_KEYS,
    'Access request reset status returned unexpected fields.',
  );
  if (status.admissionState !== 'enabled' && status.admissionState !== 'disabled') {
    fail('Access request reset status returned an invalid admission state.');
  }
  if (
    typeof status.authEpoch !== 'number'
    || !Number.isInteger(status.authEpoch)
    || status.authEpoch < 1
    || status.authEpoch >= 0xffff_ffff
  ) {
    fail('Access request reset status returned an invalid auth epoch.');
  }
  const requestCycle = status.requestCycle === undefined
    ? undefined
    : requireU64(
      status.requestCycle,
      true,
      'Access request reset status returned an invalid request cycle.',
    );
  const requestedAtMicros = status.requestedAtMicros === undefined
    ? undefined
    : requireU64(
      status.requestedAtMicros,
      false,
      'Access request reset status returned an invalid timestamp.',
    );
  if ((requestCycle === undefined) !== (requestedAtMicros === undefined)) {
    fail('Access request reset status returned an incomplete request tuple.');
  }
  if (
    status.requestState !== 'not_requested'
    && status.requestState !== 'pending'
    && status.requestState !== 'resolved'
  ) {
    fail('Access request reset status returned an invalid request state.');
  }
  const expectedState = requestCycle === undefined
    ? 'not_requested'
    : status.admissionState === 'disabled'
      && requestCycle === BigInt(status.authEpoch) + 1n
      ? 'pending'
      : 'resolved';
  if (status.requestState !== expectedState) {
    fail('Access request reset status returned an inconsistent request state.');
  }
  return Object.freeze({
    admissionState: status.admissionState,
    authEpoch: status.authEpoch,
    requestState: status.requestState,
    requestCycle,
    requestedAtMicros,
  });
}

/** Strict private projection used to bind one admission to one request tuple. */
export function projectAccessRequestAdmissionStatus(
  value: unknown,
): AccessRequestAdmissionStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Access request admission status was invalid.');
  }
  const status = value as Record<string, unknown>;
  exactObjectKeys(
    status,
    ACCESS_REQUEST_ADMISSION_STATUS_KEYS,
    'Access request admission status returned unexpected fields.',
  );
  if (
    status.admissionState !== 'missing'
    && status.admissionState !== 'enabled'
    && status.admissionState !== 'disabled'
  ) {
    fail('Access request admission status returned an invalid admission state.');
  }
  if (
    typeof status.authEpoch !== 'number'
    || !Number.isInteger(status.authEpoch)
    || status.authEpoch < 0
    || status.authEpoch > 0xffff_ffff
    || (status.admissionState === 'missing' && status.authEpoch !== 0)
    || (status.admissionState !== 'missing' && status.authEpoch < 1)
  ) {
    fail('Access request admission status returned an invalid auth epoch.');
  }
  const requestCycle = status.requestCycle === undefined
    ? undefined
    : requireU64(
      status.requestCycle,
      true,
      'Access request admission status returned an invalid request cycle.',
    );
  const requestedAtMicros = status.requestedAtMicros === undefined
    ? undefined
    : requireU64(
      status.requestedAtMicros,
      false,
      'Access request admission status returned an invalid timestamp.',
    );
  if ((requestCycle === undefined) !== (requestedAtMicros === undefined)) {
    fail('Access request admission status returned an incomplete request tuple.');
  }
  const maximumStoredRequestCycle = status.admissionState === 'disabled'
    ? BigInt(status.authEpoch) + 1n
    : BigInt(status.authEpoch);
  if (requestCycle !== undefined && requestCycle > maximumStoredRequestCycle) {
    fail('Access request admission status returned an impossible future request cycle.');
  }
  if (
    status.requestState !== 'not_requested'
    && status.requestState !== 'pending'
    && status.requestState !== 'resolved'
  ) {
    fail('Access request admission status returned an invalid request state.');
  }
  const currentCycle = status.admissionState === 'missing'
    ? 0n
    : status.admissionState === 'disabled'
      ? BigInt(status.authEpoch) + 1n
      : undefined;
  const expectedState = requestCycle === undefined
    ? 'not_requested'
    : currentCycle !== undefined && requestCycle === currentCycle
      ? 'pending'
      : 'resolved';
  if (status.requestState !== expectedState) {
    fail('Access request admission status returned an inconsistent request state.');
  }
  return Object.freeze({
    admissionState: status.admissionState,
    authEpoch: status.authEpoch,
    requestState: status.requestState,
    requestCycle,
    requestedAtMicros,
  });
}

export function requirePendingAdmissionRequest<State extends 'missing' | 'disabled'>(
  status: AccessRequestAdmissionStatus,
  expectedAdmissionState: State,
): PendingAccessRequestAdmissionStatus<State> {
  if (
    status.admissionState !== expectedAdmissionState
    || status.requestState !== 'pending'
    || status.requestCycle === undefined
    || status.requestedAtMicros === undefined
  ) {
    fail('Admission requires one exact pending access request of the expected kind.');
  }
  return Object.freeze({ ...status }) as PendingAccessRequestAdmissionStatus<State>;
}

export function requireUnchangedPendingAdmissionRequest<
  State extends 'missing' | 'disabled',
>(
  before: PendingAccessRequestAdmissionStatus<State> | AccessRequestAdmissionStatus,
  after: AccessRequestAdmissionStatus,
  expectedAdmissionState: State,
): PendingAccessRequestAdmissionStatus<State> {
  const exactBefore = requirePendingAdmissionRequest(before, expectedAdmissionState);
  const exactAfter = requirePendingAdmissionRequest(after, expectedAdmissionState);
  if (
    exactAfter.requestCycle !== exactBefore.requestCycle
    || exactAfter.requestedAtMicros !== exactBefore.requestedAtMicros
    || exactAfter.authEpoch !== exactBefore.authEpoch
  ) {
    fail('The exact pending access request changed before admission.');
  }
  return exactAfter;
}

function accessRequestTimestamp(micros: bigint): string {
  if (micros > MAX_JAVASCRIPT_DATE_MICROS) {
    fail('Access request procedure returned an invalid timestamp.');
  }
  const date = new Date(Number(micros / 1_000n));
  if (Number.isNaN(date.valueOf())) {
    fail('Access request procedure returned an invalid timestamp.');
  }
  return date.toISOString();
}

export async function listAccessRequests(
  connection: DbConnection,
  options: AccessRequestListOptions,
  machineReadable = false,
): Promise<AccessRequestListPage> {
  const page = await readAccessRequestListPage(connection, options);
  const entries = page.entries.map(entry => Object.freeze({
    fid: entry.fid.toString(),
    requestedAt: accessRequestTimestamp(entry.requestedAtMicros),
    admissionState: entry.admissionState,
    requestState: entry.requestState,
  }));
  if (machineReadable) {
    console.log(JSON.stringify({
      entries,
      nextCursor: page.hasMore
        ? {
          requestedAtMicros: page.nextRequestedAtMicros?.toString(),
          fid: page.nextFid?.toString(),
        }
        : null,
      hasMore: page.hasMore,
      totalRequests: page.totalRequests.toString(),
      pendingRequests: page.pendingRequests.toString(),
    }));
    return page;
  }

  console.log('ACCESS REQUESTS');
  for (const entry of entries) {
    console.log(
      `${entry.requestedAt} · FID ${entry.fid} · ${entry.requestState} · ${entry.admissionState}`,
    );
  }
  if (entries.length === 0) console.log('No matching requests.');
  console.log(`Pending: ${page.pendingRequests.toString()} · Total: ${page.totalRequests.toString()}`);
  if (page.hasMore) {
    console.log(
      'Next: --after-requested-at-micros '
      + `${page.nextRequestedAtMicros?.toString()} --after-fid ${page.nextFid?.toString()}`,
    );
  }
  return page;
}

export async function readAccessRequestListPage(
  connection: DbConnection,
  options: AccessRequestListOptions,
): Promise<AccessRequestListPage> {
  const raw = await withOperationTimeout(
    connection.procedures.adminListAccessRequestsV1({
      afterRequestedAtMicros: options.afterRequestedAtMicros,
      afterFid: options.afterFid,
      limit: options.limit,
      includeResolved: options.includeResolved,
    }),
  );
  return projectAccessRequestListPage(raw, options);
}

function exactPendingAccessRequestCensus(value: PendingAccessRequestCensus) {
  exactObjectKeys(value as unknown as Record<string, unknown>, [
    'admissionMustRecheckRequestCas',
    'advisoryOnly',
    'entries',
    'kind',
    'pendingRequests',
    'protectedCommit',
    'schemaVersion',
    'targetConfigurationDigest',
    'totalRequests',
  ].sort(), 'Pending access request census was invalid.');
  if (
    value.schemaVersion !== 1
    || value.kind !== 'warpkeep-pending-access-request-census-v1'
    || !COMMIT_SHA.test(value.protectedCommit)
    || value.targetConfigurationDigest
      !== PENDING_ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST
    || value.advisoryOnly !== true
    || value.admissionMustRecheckRequestCas !== true
    || !/^(?:0|[1-9][0-9]{0,3})$/u.test(value.totalRequests)
    || !/^(?:0|[1-9][0-9]{0,3})$/u.test(value.pendingRequests)
    || BigInt(value.totalRequests) > BigInt(MAX_ACCESS_REQUEST_CENSUS_ROWS)
    || BigInt(value.pendingRequests) > BigInt(value.totalRequests)
    || !Array.isArray(value.entries)
    || BigInt(value.entries.length) !== BigInt(value.pendingRequests)
  ) fail('Pending access request census was invalid.');
  let previous: Readonly<{ fid: bigint; requestedAtMicros: bigint }> | undefined;
  const seen = new Set<string>();
  const entries = value.entries.map(candidate => {
    exactObjectKeys(candidate as unknown as Record<string, unknown>, [
      'admissionState', 'fid', 'requestedAtMicros',
    ], 'Pending access request census entry was invalid.');
    if (
      typeof candidate.fid !== 'string'
      || !/^[1-9][0-9]{0,15}$/u.test(candidate.fid)
      || BigInt(candidate.fid) > BigInt(Number.MAX_SAFE_INTEGER)
      || typeof candidate.requestedAtMicros !== 'string'
      || !/^[1-9][0-9]{0,19}$/u.test(candidate.requestedAtMicros)
      || BigInt(candidate.requestedAtMicros) > U64_MAXIMUM
      || (candidate.admissionState !== 'missing' && candidate.admissionState !== 'disabled')
      || seen.has(candidate.fid)
    ) fail('Pending access request census entry was invalid.');
    const ordered = Object.freeze({
      fid: BigInt(candidate.fid),
      requestedAtMicros: BigInt(candidate.requestedAtMicros),
    });
    if (previous !== undefined && compareAccessRequestEntries(previous, ordered) >= 0) {
      fail('Pending access request census order was invalid.');
    }
    previous = ordered;
    seen.add(candidate.fid);
    return Object.freeze({ ...candidate });
  });
  return Object.freeze({ ...value, entries: Object.freeze(entries) });
}

/**
 * Build one advisory pending-request census over one authenticated connection.
 * Individual admission still re-reads and CAS-binds the exact request tuple.
 */
export async function collectPendingAccessRequestCensus(
  connection: DbConnection,
  protectedCommit: string,
): Promise<PendingAccessRequestCensus> {
  if (!COMMIT_SHA.test(protectedCommit)) {
    fail('Pending access request census protected commit was invalid.');
  }
  let afterRequestedAtMicros = 0n;
  let afterFid = 0n;
  let expectedTotal: bigint | undefined;
  let expectedPending: bigint | undefined;
  const entries: Array<{
    fid: string;
    requestedAtMicros: string;
    admissionState: 'missing' | 'disabled';
  }> = [];
  const seenFids = new Set<string>();
  let previous: AccessRequestListEntry | undefined;

  for (let pageNumber = 1; pageNumber <= MAX_ACCESS_REQUEST_CENSUS_PAGES; pageNumber += 1) {
    const page = await readAccessRequestListPage(connection, {
      limit: MAX_ACCESS_REQUEST_PAGE_SIZE,
      afterRequestedAtMicros,
      afterFid,
      includeResolved: false,
    });
    if (expectedTotal === undefined || expectedPending === undefined) {
      expectedTotal = page.totalRequests;
      expectedPending = page.pendingRequests;
      if (
        expectedTotal > BigInt(MAX_ACCESS_REQUEST_CENSUS_ROWS)
        || expectedPending > expectedTotal
      ) fail('Pending access request census totals exceeded the reviewed bound.');
    } else if (
      page.totalRequests !== expectedTotal
      || page.pendingRequests !== expectedPending
    ) {
      fail('Pending access request census totals changed during inspection.');
    }

    for (const entry of page.entries) {
      const fid = entry.fid.toString();
      if (
        entry.requestState !== 'pending'
        || entry.admissionState === 'enabled'
        || seenFids.has(fid)
        || (previous !== undefined && compareAccessRequestEntries(previous, entry) >= 0)
      ) fail('Pending access request census page continuity was invalid.');
      entries.push(Object.freeze({
        fid,
        requestedAtMicros: entry.requestedAtMicros.toString(),
        admissionState: entry.admissionState,
      }));
      if (entries.length > MAX_ACCESS_REQUEST_CENSUS_ROWS) {
        fail('Pending access request census rows exceeded the reviewed bound.');
      }
      seenFids.add(fid);
      previous = entry;
    }

    if (!page.hasMore) {
      if (BigInt(entries.length) !== expectedPending) {
        fail('Pending access request census did not close over the reported total.');
      }
      return exactPendingAccessRequestCensus(Object.freeze({
        schemaVersion: 1,
        kind: 'warpkeep-pending-access-request-census-v1',
        protectedCommit,
        targetConfigurationDigest:
          PENDING_ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST,
        totalRequests: expectedTotal.toString(),
        pendingRequests: expectedPending.toString(),
        entries: Object.freeze(entries),
        advisoryOnly: true,
        admissionMustRecheckRequestCas: true,
      }));
    }
    if (
      pageNumber === MAX_ACCESS_REQUEST_CENSUS_PAGES
      || page.nextRequestedAtMicros === undefined
      || page.nextFid === undefined
    ) fail('Pending access request census pagination exceeded the reviewed bound.');
    afterRequestedAtMicros = page.nextRequestedAtMicros;
    afterFid = page.nextFid;
  }
  return fail('Pending access request census pagination exceeded the reviewed bound.');
}

function exactAccessRequestCensus(value: AccessRequestCensus): AccessRequestCensus {
  exactObjectKeys(value as unknown as Record<string, unknown>, [
    'admissionFreezeAttestation',
    'entries',
    'kind',
    'pendingRequests',
    'realmId',
    'releaseVersion',
    'schemaVersion',
    'sourceBaselineCommit',
    'targetConfigurationDigest',
    'totalRequests',
  ], 'Access request census was invalid.');
  if (
    value.schemaVersion !== 1
    || value.kind !== 'warpkeep-access-request-census-v1'
    || value.realmId !== GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID
    || value.releaseVersion !== GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION
    || value.sourceBaselineCommit
      !== GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT
    || value.admissionFreezeAttestation
      !== GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST
    || value.targetConfigurationDigest !== ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST
    || !/^(?:0|[1-9][0-9]{0,3})$/u.test(value.totalRequests)
    || !/^(?:0|[1-9][0-9]{0,3})$/u.test(value.pendingRequests)
    || BigInt(value.totalRequests) > BigInt(MAX_ACCESS_REQUEST_CENSUS_ROWS)
    || BigInt(value.pendingRequests) > BigInt(value.totalRequests)
    || !Array.isArray(value.entries)
    || BigInt(value.entries.length) !== BigInt(value.totalRequests)
  ) fail('Access request census was invalid.');
  let previous: Readonly<{ fid: bigint; requestedAtMicros: bigint }> | undefined;
  let pending = 0;
  const seen = new Set<string>();
  const entries = value.entries.map(candidate => {
    exactObjectKeys(candidate as unknown as Record<string, unknown>, [
      'admissionState', 'fid', 'requestState', 'requestedAtMicros',
    ], 'Access request census entry was invalid.');
    if (
      typeof candidate.fid !== 'string'
      || !/^[1-9][0-9]{0,15}$/u.test(candidate.fid)
      || BigInt(candidate.fid) > BigInt(Number.MAX_SAFE_INTEGER)
      || typeof candidate.requestedAtMicros !== 'string'
      || !/^[1-9][0-9]{0,19}$/u.test(candidate.requestedAtMicros)
      || BigInt(candidate.requestedAtMicros) > U64_MAXIMUM
      || (candidate.admissionState !== 'missing'
        && candidate.admissionState !== 'enabled'
        && candidate.admissionState !== 'disabled')
      || (candidate.requestState !== 'pending' && candidate.requestState !== 'resolved')
      || (candidate.requestState === 'pending' && candidate.admissionState === 'enabled')
      || seen.has(candidate.fid)
    ) fail('Access request census entry was invalid.');
    const ordered = Object.freeze({
      fid: BigInt(candidate.fid),
      requestedAtMicros: BigInt(candidate.requestedAtMicros),
    });
    if (previous !== undefined && compareAccessRequestEntries(previous, ordered) >= 0) {
      fail('Access request census order was invalid.');
    }
    if (candidate.requestState === 'pending') pending += 1;
    previous = ordered;
    seen.add(candidate.fid);
    return Object.freeze({ ...candidate });
  });
  if (BigInt(pending) !== BigInt(value.pendingRequests)) {
    fail('Access request census was invalid.');
  }
  return Object.freeze({ ...value, entries: Object.freeze(entries) });
}

async function collectAccessRequestCensusPass(
  connection: DbConnection,
): Promise<AccessRequestCensus> {
  let afterRequestedAtMicros = 0n;
  let afterFid = 0n;
  let expectedTotal: bigint | undefined;
  let expectedPending: bigint | undefined;
  const entries: Array<AccessRequestCensus['entries'][number]> = [];
  const seenFids = new Set<string>();
  let previous: AccessRequestListEntry | undefined;

  for (let pageNumber = 1; pageNumber <= MAX_ACCESS_REQUEST_CENSUS_PAGES; pageNumber += 1) {
    const page = await readAccessRequestListPage(connection, {
      limit: MAX_ACCESS_REQUEST_PAGE_SIZE,
      afterRequestedAtMicros,
      afterFid,
      includeResolved: true,
    });
    if (expectedTotal === undefined || expectedPending === undefined) {
      expectedTotal = page.totalRequests;
      expectedPending = page.pendingRequests;
      if (
        expectedTotal > BigInt(MAX_ACCESS_REQUEST_CENSUS_ROWS)
        || expectedPending > expectedTotal
      ) fail('Access request census totals exceeded the reviewed bound.');
    } else if (
      page.totalRequests !== expectedTotal
      || page.pendingRequests !== expectedPending
    ) {
      fail('Access request census totals changed during inspection.');
    }

    for (const entry of page.entries) {
      const fid = entry.fid.toString();
      if (
        seenFids.has(fid)
        || (previous !== undefined && compareAccessRequestEntries(previous, entry) >= 0)
      ) fail('Access request census page continuity was invalid.');
      entries.push(Object.freeze({
        fid,
        requestedAtMicros: entry.requestedAtMicros.toString(),
        admissionState: entry.admissionState,
        requestState: entry.requestState,
      }));
      if (entries.length > MAX_ACCESS_REQUEST_CENSUS_ROWS) {
        fail('Access request census rows exceeded the reviewed bound.');
      }
      seenFids.add(fid);
      previous = entry;
    }

    if (!page.hasMore) {
      if (BigInt(entries.length) !== expectedTotal) {
        fail('Access request census did not close over the reported total.');
      }
      return exactAccessRequestCensus(Object.freeze({
        schemaVersion: 1,
        kind: 'warpkeep-access-request-census-v1',
        realmId: GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID,
        releaseVersion: GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION,
        sourceBaselineCommit: GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT,
        admissionFreezeAttestation: GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST,
        targetConfigurationDigest: ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST,
        totalRequests: expectedTotal.toString(),
        pendingRequests: expectedPending.toString(),
        entries: Object.freeze(entries),
      }));
    }
    if (
      pageNumber === MAX_ACCESS_REQUEST_CENSUS_PAGES
      || page.nextRequestedAtMicros === undefined
      || page.nextFid === undefined
    ) fail('Access request census pagination exceeded the reviewed bound.');
    afterRequestedAtMicros = page.nextRequestedAtMicros;
    afterFid = page.nextFid;
  }
  return fail('Access request census pagination exceeded the reviewed bound.');
}

async function requireLiveGenesis001AccessPolicy(connection: DbConnection): Promise<void> {
  const procedures = (connection as unknown as Readonly<{
    procedures?: Readonly<{
      genesis001AccessPolicyV1?: (
        params: Record<string, never>,
      ) => Promise<unknown>;
    }>;
  }>).procedures;
  const procedure = procedures?.genesis001AccessPolicyV1;
  if (typeof procedure !== 'function') {
    fail('Live Genesis 001 access policy procedure was unavailable.');
  }
  let raw: unknown;
  try {
    raw = await withOperationTimeout(procedure.call(procedures, {}));
  } catch {
    return fail('Live Genesis 001 access policy could not be verified.');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Live Genesis 001 access policy was invalid.');
  }
  exactObjectKeys(raw as Record<string, unknown>, [
    'accessRequestSubmissionsEnabled',
    'admissionStateMutationsEnabled',
    'freezeReleaseNonce',
    'playerAccessEnabled',
    'realmId',
    'releaseVersion',
    'sourceBaselineCommit',
  ], 'Live Genesis 001 access policy was invalid.');
  const policy = raw as Genesis001AccessPolicy;
  if (
    policy.realmId !== GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID
    || policy.releaseVersion !== GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION
    || policy.playerAccessEnabled !== true
    || policy.admissionStateMutationsEnabled !== false
    || policy.accessRequestSubmissionsEnabled !== false
    || policy.sourceBaselineCommit !== GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT
    || policy.freezeReleaseNonce !== GENESIS_001_ACCESS_REQUEST_CENSUS_FREEZE_NONCE
  ) fail('Live Genesis 001 access policy was invalid.');
}

/**
 * Read every current request twice through the fixed admin procedure. This is
 * a private post-freeze evidence path: it includes resolved rows, requires the
 * source-bound Genesis 001 freeze attestation and exact live policy receipt,
 * and fails if either complete bounded snapshot differs from the other.
 */
export async function collectAccessRequestCensus(
  connection: DbConnection,
  admissionFreezeAttestation: string,
): Promise<AccessRequestCensus> {
  if (admissionFreezeAttestation !== GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST) {
    fail('Access request census admission freeze attestation was invalid.');
  }
  await requireLiveGenesis001AccessPolicy(connection);
  const first = await collectAccessRequestCensusPass(connection);
  const firstCanonical = JSON.stringify(first);
  const firstDigest = createHash('sha256').update(firstCanonical, 'utf8').digest('hex');
  await requireLiveGenesis001AccessPolicy(connection);
  const second = await collectAccessRequestCensusPass(connection);
  const secondCanonical = JSON.stringify(second);
  const secondDigest = createHash('sha256').update(secondCanonical, 'utf8').digest('hex');
  if (firstDigest !== secondDigest || firstCanonical !== secondCanonical) {
    fail('Access request census changed between stable passes.');
  }
  await requireLiveGenesis001AccessPolicy(connection);
  return second;
}

type AccessRequestCensusReference = Readonly<{
  count: number;
  size: number;
  sha256: string;
  pathBasename: string;
}>;

type AccessRequestCensusDryRunResult = Readonly<{
  schemaVersion: 1;
  status: 'ready';
  privateFilesWritten: false;
}>;

type AccessRequestCensusExportResult = Readonly<{
  schemaVersion: 1;
  status: 'written';
  privateCensusBasename: string;
  privateExporterReferenceBasename: string;
}>;

const ACCESS_REQUEST_CENSUS_LEAF = /^(?:warpkeep-access-request-census-[0-9]{8}T[0-9]{6}Z\.txt|warpkeep-access-request-census-export-reference-[0-9]{8}T[0-9]{6}Z\.json)$/u;

function accessRequestCensusFilename(at: Date): string {
  if (Number.isNaN(at.valueOf())) fail('Access request census timestamp was invalid.');
  const padded = (value: number) => value.toString().padStart(2, '0');
  return `warpkeep-access-request-census-${at.getUTCFullYear().toString().padStart(4, '0')}`
    + `${padded(at.getUTCMonth() + 1)}${padded(at.getUTCDate())}`
    + `T${padded(at.getUTCHours())}${padded(at.getUTCMinutes())}${padded(at.getUTCSeconds())}Z.txt`;
}

function accessRequestCensusExporterReferenceFilename(at: Date): string {
  return accessRequestCensusFilename(at)
    .replace(
      /^warpkeep-access-request-census-/u,
      'warpkeep-access-request-census-export-reference-',
    )
    .replace(/\.txt$/u, '.json');
}

function privateAccessRequestCensusBytes(input: Readonly<{
  census: AccessRequestCensus;
  at: Date;
}>): Readonly<{ bytes: Buffer; reference: AccessRequestCensusReference }> {
  const census = exactAccessRequestCensus(input.census);
  const lines = [
    'warpkeep-access-request-census-v1',
    `realm-id\t${census.realmId}`,
    `release-version\t${census.releaseVersion}`,
    `source-baseline-commit\t${census.sourceBaselineCommit}`,
    `admission-freeze-attestation\t${census.admissionFreezeAttestation}`,
    `target-configuration-digest\t${census.targetConfigurationDigest}`,
    `total-requests\t${census.totalRequests}`,
    `pending-requests\t${census.pendingRequests}`,
    'requested-at-micros\tfid\trequest-state\tadmission-state',
    ...census.entries.map(entry => (
      `${entry.requestedAtMicros}\t${entry.fid}\t${entry.requestState}\t${entry.admissionState}`
    )),
    '',
  ];
  const bytes = Buffer.from(lines.join('\n'), 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_ACCESS_REQUEST_CENSUS_BYTES) {
    bytes.fill(0);
    fail('Access request census exceeded the private report size bound.');
  }
  return Object.freeze({
    bytes,
    reference: Object.freeze({
      count: census.entries.length,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pathBasename: accessRequestCensusFilename(input.at),
    }),
  });
}

type AccessRequestCensusDirectoryIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  uid: bigint;
  mode: bigint;
}>;

type AccessRequestCensusDestinationIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  uid: bigint;
}>;

const ACCESS_REQUEST_CENSUS_SYSTEM_PYTHON = '/usr/bin/python3';
const ACCESS_REQUEST_CENSUS_LINUX_SYSTEM_PYTHON = /^\/usr\/bin\/python3\.[0-9]+$/u;
const ACCESS_REQUEST_CENSUS_OPENAT_SOURCE = String.raw`
import os
import stat
import sys

MAX_BYTES = 1024 * 1024

def die():
    raise RuntimeError('invalid')

def number(value):
    if not value.isascii() or not value.isdecimal():
        die()
    return int(value, 10)

def exact_root():
    root = os.fstat(3)
    expected = tuple(number(value) for value in sys.argv[3:7])
    if not stat.S_ISDIR(root.st_mode):
        die()
    if (root.st_dev, root.st_ino, root.st_uid, root.st_mode) != expected:
        die()
    return 3

def leaf_name():
    leaf = sys.argv[2]
    if not 0 < len(leaf) <= 255 or leaf in ('.', '..') or '/' in leaf or '\\' in leaf:
        die()
    if any(ord(character) < 0x20 or ord(character) == 0x7f for character in leaf):
        die()
    return leaf

def exact_file_identity(value, expected):
    if not stat.S_ISREG(value.st_mode):
        die()
    if (value.st_dev, value.st_ino, value.st_uid) != expected:
        die()
    if value.st_nlink != 1 or stat.S_IMODE(value.st_mode) != 0o600:
        die()
    if value.st_mode & 0o7000:
        die()

def exact_file(value, expected, size):
    exact_file_identity(value, expected)
    if value.st_size != size:
        die()

def file_expectation():
    if len(sys.argv) != 11:
        die()
    expected = tuple(number(value) for value in sys.argv[7:10])
    size = number(sys.argv[10])
    if size > MAX_BYTES:
        die()
    return expected, size

def create(root, leaf):
    if len(sys.argv) != 7:
        die()
    output = None
    created = False
    identity = None
    try:
        previous_umask = os.umask(0)
        try:
            output = os.open(
                leaf,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600,
                dir_fd=root,
            )
            created = True
        finally:
            os.umask(previous_umask)
        os.fchmod(output, 0o600)
        value = os.fstat(output)
        identity = (value.st_dev, value.st_ino, value.st_uid)
        exact_file(value, identity, 0)
        os.fsync(output)
        exact_root()
        os.close(output)
        output = None
        os.fsync(root)
        message = ('%d:%d:%d\n' % identity).encode('ascii')
        offset = 0
        while offset < len(message):
            written = os.write(1, message[offset:])
            if written <= 0:
                die()
            offset += written
    except BaseException:
        if output is not None:
            try:
                os.ftruncate(output, 0)
                os.fchmod(output, 0o600)
                os.fsync(output)
            except BaseException:
                pass
            os.close(output)
        if created and identity is not None:
            try:
                current = os.stat(leaf, dir_fd=root, follow_symlinks=False)
                exact_file(current, identity, 0)
                os.unlink(leaf, dir_fd=root)
                os.fsync(root)
            except BaseException:
                pass
        raise

def write_existing(root, leaf):
    expected, expected_size = file_expectation()
    output = None
    try:
        output = os.open(leaf, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=root)
        exact_file(os.fstat(output), expected, 0)
        total = 0
        while True:
            body = os.read(0, min(65536, expected_size - total + 1))
            if not body:
                break
            total += len(body)
            if total > expected_size:
                die()
            offset = 0
            while offset < len(body):
                written = os.write(output, body[offset:])
                if written <= 0:
                    die()
                offset += written
        if total != expected_size:
            die()
        os.fchmod(output, 0o600)
        os.fsync(output)
        exact_file(os.fstat(output), expected, expected_size)
        exact_root()
        os.close(output)
        output = None
        os.fsync(root)
    except BaseException:
        if output is not None:
            try:
                os.ftruncate(output, 0)
                os.fchmod(output, 0o600)
                os.fsync(output)
            except BaseException:
                pass
            os.close(output)
        raise

def unlink_existing(root, leaf):
    expected, _expected_size = file_expectation()
    opened = os.open(leaf, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=root)
    try:
        value = os.fstat(opened)
        exact_file_identity(value, expected)
        if value.st_size < 0 or value.st_size > MAX_BYTES:
            die()
        os.ftruncate(opened, 0)
        os.fchmod(opened, 0o600)
        os.fsync(opened)
        exact_file(os.fstat(opened), expected, 0)
    finally:
        os.close(opened)
    exact_root()
    exact_file(os.stat(leaf, dir_fd=root, follow_symlinks=False), expected, 0)
    os.unlink(leaf, dir_fd=root)
    os.fsync(root)

def main():
    if len(sys.argv) < 7:
        die()
    operation = sys.argv[1]
    leaf = leaf_name()
    root = exact_root()
    if operation == 'create':
        create(root, leaf)
    elif operation == 'write':
        write_existing(root, leaf)
    elif operation == 'unlink':
        unlink_existing(root, leaf)
    else:
        die()

try:
    main()
except FileExistsError:
    os._exit(17)
except BaseException:
    os._exit(70)
`.trim();

const ACCESS_REQUEST_CENSUS_OPENAT_SOURCE_SHA256 = createHash('sha256')
  .update(ACCESS_REQUEST_CENSUS_OPENAT_SOURCE, 'utf8')
  .digest('hex');

export const ACCESS_REQUEST_CENSUS_TARGET_CONFIGURATION_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    realmId: GENESIS_001_ACCESS_REQUEST_CENSUS_REALM_ID,
    releaseVersion: GENESIS_001_ACCESS_REQUEST_CENSUS_RELEASE_VERSION,
    sourceBaselineCommit: GENESIS_001_ACCESS_REQUEST_CENSUS_SOURCE_BASELINE_COMMIT,
    freezeReleaseNonce: GENESIS_001_ACCESS_REQUEST_CENSUS_FREEZE_NONCE,
    admissionFreezeAttestation: GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST,
    suspendedHermesCommands: GENESIS_001_SUSPENDED_HERMES_COMMANDS,
    databaseUri: DEFAULT_URI,
    databaseIdentity: DEFAULT_DATABASE_IDENTITY,
    bridgeUrl: DEFAULT_BRIDGE,
    freezeProcedure: GENESIS_001_ACCESS_POLICY_PROCEDURE,
    freezePolicyChecks: 5,
    procedure: 'admin_list_access_requests_v1',
    includeResolved: true,
    pageSize: MAX_ACCESS_REQUEST_PAGE_SIZE,
    maximumPages: MAX_ACCESS_REQUEST_CENSUS_PAGES,
    maximumRows: MAX_ACCESS_REQUEST_CENSUS_ROWS,
    censusPasses: 2,
    desktopWriter: ACCESS_REQUEST_CENSUS_DESKTOP_WRITER,
    desktopWriterSourceSha256: ACCESS_REQUEST_CENSUS_OPENAT_SOURCE_SHA256,
    privateExporterReferenceDirectory:
      ACCESS_REQUEST_CENSUS_PRIVATE_REFERENCE_DIRECTORY,
    privateExporterReferenceFormat: 'canonical-json-v1',
    commandOutput: 'basename-status-only-v1',
  }), 'utf8')
  .digest('hex');

function exactAccessRequestCensusSystemPython(): Readonly<{
  path: string;
  identity: string;
}> {
  try {
    const directoryPath = '/usr/bin';
    const directory = lstatSync(directoryPath, { bigint: true });
    const entry = lstatSync(ACCESS_REQUEST_CENSUS_SYSTEM_PYTHON, { bigint: true });
    const path = realpathSync(ACCESS_REQUEST_CENSUS_SYSTEM_PYTHON);
    const target = lstatSync(path, { bigint: true });
    const platformEntryValid = process.platform === 'darwin'
      ? entry.isFile() && !entry.isSymbolicLink() && path === ACCESS_REQUEST_CENSUS_SYSTEM_PYTHON
      : process.platform === 'linux'
        && (entry.isFile() || entry.isSymbolicLink())
        && (path === ACCESS_REQUEST_CENSUS_SYSTEM_PYTHON
          || ACCESS_REQUEST_CENSUS_LINUX_SYSTEM_PYTHON.test(path));
    if (
      !platformEntryValid
      || realpathSync(directoryPath) !== directoryPath
      || directory.isSymbolicLink() || !directory.isDirectory()
      || directory.uid !== 0n || (directory.mode & 0o7777n) !== 0o755n
      || entry.uid !== 0n || dirname(path) !== directoryPath
      || target.isSymbolicLink() || !target.isFile()
      || target.uid !== 0n || (target.mode & 0o7777n) !== 0o755n
    ) fail('Access request census openat helper was invalid.');
    return Object.freeze({
      path,
      identity: [
        directory.dev, directory.ino, directory.mode, directory.uid,
        entry.dev, entry.ino, entry.mode, entry.uid, entry.size,
        target.dev, target.ino, target.mode, target.uid, target.size, path,
      ].join(':'),
    });
  } catch (error) {
    if (error instanceof HermesCliError) throw error;
    return fail('Access request census openat helper was invalid.');
  }
}

function runAccessRequestCensusOpenAt(
  directory: Readonly<{
    descriptor: number;
    identity: AccessRequestCensusDirectoryIdentity;
  }>,
  operation: 'create' | 'write' | 'unlink',
  filename: string,
  destinationIdentity?: AccessRequestCensusDestinationIdentity,
  body?: Buffer,
  expectedSize?: number,
): Buffer {
  if (
    basename(filename) !== filename
    || !ACCESS_REQUEST_CENSUS_LEAF.test(filename)
    || ((operation === 'create') !== (destinationIdentity === undefined))
    || ((operation === 'write') !== (body !== undefined))
    || ((operation === 'unlink') !== (expectedSize !== undefined))
    || (expectedSize !== undefined && (
      !Number.isSafeInteger(expectedSize)
      || expectedSize < 0
      || expectedSize > MAX_ACCESS_REQUEST_CENSUS_BYTES
    ))
  ) fail('Access request census openat operation was invalid.');
  const python = exactAccessRequestCensusSystemPython();
  const arguments_ = [
    '-I', '-S', '-B', '-c', ACCESS_REQUEST_CENSUS_OPENAT_SOURCE,
    operation,
    filename,
    directory.identity.dev.toString(),
    directory.identity.ino.toString(),
    directory.identity.uid.toString(),
    directory.identity.mode.toString(),
    ...(destinationIdentity === undefined ? [] : [
      destinationIdentity.dev.toString(),
      destinationIdentity.ino.toString(),
      destinationIdentity.uid.toString(),
      (body?.byteLength ?? expectedSize ?? 0).toString(),
    ]),
  ];
  const result = spawnSync(python.path, arguments_, {
    encoding: 'buffer',
    env: { LANG: 'C', LC_ALL: 'C' },
    input: body,
    stdio: ['pipe', 'pipe', 'pipe', directory.descriptor],
    timeout: OPERATION_TIMEOUT_MS,
    maxBuffer: 4_096,
  });
  const pythonAfter = exactAccessRequestCensusSystemPython();
  if (
    result.error !== undefined
    || result.signal !== null
    || !Buffer.isBuffer(result.stdout)
    || !Buffer.isBuffer(result.stderr)
    || result.stderr.byteLength !== 0
    || pythonAfter.identity !== python.identity
  ) fail('Access request census anchored filesystem operation failed.');
  if (result.status === 17 && operation === 'create') {
    fail('Access request census destination already exists; refusing to overwrite it.');
  }
  if (result.status !== 0) {
    fail('Access request census anchored filesystem operation failed.');
  }
  return result.stdout;
}

function createAccessRequestCensusAtDirectory(
  directory: Readonly<{
    descriptor: number;
    identity: AccessRequestCensusDirectoryIdentity;
  }>,
  filename: string,
): AccessRequestCensusDestinationIdentity {
  const output = runAccessRequestCensusOpenAt(directory, 'create', filename);
  try {
    const match = /^([0-9]+):([0-9]+):([0-9]+)\n$/u.exec(output.toString('ascii'));
    if (match === null) fail('Access request census anchored create result was invalid.');
    return Object.freeze({
      dev: BigInt(match[1]!),
      ino: BigInt(match[2]!),
      uid: BigInt(match[3]!),
    });
  } finally {
    output.fill(0);
  }
}

function writeAccessRequestCensusAtDirectory(
  directory: Readonly<{
    descriptor: number;
    identity: AccessRequestCensusDirectoryIdentity;
  }>,
  filename: string,
  identity: AccessRequestCensusDestinationIdentity,
  bytes: Buffer,
): void {
  const output = runAccessRequestCensusOpenAt(
    directory,
    'write',
    filename,
    identity,
    bytes,
  );
  try {
    if (output.byteLength !== 0) {
      fail('Access request census anchored write result was invalid.');
    }
  } finally {
    output.fill(0);
  }
}

/**
 * Privacy-safe best-effort cleanup. When the exact created inode remains at
 * the leaf, it is descriptor-opened, identity-checked, truncated, and fsynced
 * before the final dirfd-relative stat/unlink. Portable unlink remains
 * name-based: a same-UID process can race this cleanup, but no replacement leaf
 * can receive bytes written through the already-held expected inode.
 */
function unlinkAccessRequestCensusAtDirectory(
  directory: Readonly<{
    descriptor: number;
    identity: AccessRequestCensusDirectoryIdentity;
  }>,
  filename: string,
  identity: AccessRequestCensusDestinationIdentity,
  expectedSize: number,
): void {
  const output = runAccessRequestCensusOpenAt(
    directory,
    'unlink',
    filename,
    identity,
    undefined,
    expectedSize,
  );
  try {
    if (output.byteLength !== 0) {
      fail('Access request census anchored unlink result was invalid.');
    }
  } finally {
    output.fill(0);
  }
}

type AccessRequestCensusWriterHooks = Readonly<{
  /** Deterministic filesystem-race seam; production callers omit it. */
  beforeCreate?: () => void;
  /** Deterministic filesystem-race seam; production callers omit it. */
  afterCreate?: () => void;
  /** Deterministic filesystem-race seam; production callers omit it. */
  beforeWrite?: () => void;
}>;

function accessRequestCensusDirectoryPathStatus(value: string) {
  assertProductionAdminTrustedAncestors(value);
  const status = lstatSync(value, { bigint: true });
  if (
    status.isSymbolicLink() || !status.isDirectory()
    || (status.mode & 0o022n) !== 0n
    || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
    || realpathSync(value) !== value
  ) fail('Access request census directory was invalid.');
  return status;
}

function sameAccessRequestCensusDirectoryIdentity(
  left: AccessRequestCensusDirectoryIdentity,
  right: AccessRequestCensusDirectoryIdentity,
): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.mode === right.mode;
}

function openAccessRequestCensusDirectory(value: string): Readonly<{
  path: string;
  descriptor: number;
  identity: AccessRequestCensusDirectoryIdentity;
}> {
  if (!isAbsolute(value) || resolve(value) !== value || /[\u0000\r\n]/u.test(value)) {
    fail('Access request census directory was invalid.');
  }
  let descriptor: number | undefined;
  try {
    const pathStatus = accessRequestCensusDirectoryPathStatus(value);
    descriptor = openSync(
      value,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    const heldStatus = fstatSync(descriptor, { bigint: true });
    if (
      !heldStatus.isDirectory()
      || !sameAccessRequestCensusDirectoryIdentity(pathStatus, heldStatus)
    ) fail('Access request census directory changed while being opened.');
    return Object.freeze({
      path: value,
      descriptor,
      identity: Object.freeze({
        dev: heldStatus.dev,
        ino: heldStatus.ino,
        uid: heldStatus.uid,
        mode: heldStatus.mode,
      }),
    });
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof HermesCliError) throw error;
    return fail('Access request census directory was invalid.');
  }
}

function requireAccessRequestCensusDirectoryUnchanged(directory: Readonly<{
  path: string;
  descriptor: number;
  identity: AccessRequestCensusDirectoryIdentity;
}>): void {
  try {
    const pathStatus = accessRequestCensusDirectoryPathStatus(directory.path);
    const heldStatus = fstatSync(directory.descriptor, { bigint: true });
    if (
      !heldStatus.isDirectory()
      || !sameAccessRequestCensusDirectoryIdentity(directory.identity, pathStatus)
      || !sameAccessRequestCensusDirectoryIdentity(directory.identity, heldStatus)
    ) fail('Access request census directory changed during export.');
  } catch (error) {
    if (error instanceof HermesCliError && /changed during export/u.test(error.message)) {
      throw error;
    }
    fail('Access request census directory changed during export.');
  }
}

function requireAccessRequestCensusDestinationUnchanged(
  destination: string,
  identity: AccessRequestCensusDestinationIdentity,
  expectedSize: bigint,
): void {
  try {
    const pathStatus = lstatSync(destination, { bigint: true });
    if (
      pathStatus.isSymbolicLink() || !pathStatus.isFile()
      || pathStatus.dev !== identity.dev || pathStatus.ino !== identity.ino
      || pathStatus.uid !== identity.uid
      || pathStatus.nlink !== 1n
      || (pathStatus.mode & 0o7777n) !== 0o600n
      || pathStatus.size !== expectedSize
    ) fail('Access request census destination changed during export.');
  } catch (error) {
    if (error instanceof HermesCliError) throw error;
    fail('Access request census destination changed during export.');
  }
}

/** Validate a private TXT export without printing a raw metadata verifier. */
export function inspectAccessRequestCensus(input: Readonly<{
  census: AccessRequestCensus;
  at?: Date;
}>): AccessRequestCensusDryRunResult {
  const prepared = privateAccessRequestCensusBytes({
    census: input.census,
    at: input.at ?? new Date(),
  });
  try {
    const result = Object.freeze({
      schemaVersion: 1,
      status: 'ready',
      privateFilesWritten: false,
    } as const);
    console.log(JSON.stringify(result));
    return result;
  } finally {
    prepared.bytes.fill(0);
  }
}

/**
 * Install one non-overwritable owner-only TXT export in the caller's Desktop.
 * The caller supplies the directory so tests can exercise this only in a temp
 * directory and the command path never prints the resulting full path.
 */
export function writeAccessRequestCensusText(input: Readonly<{
  directory: string;
  census: AccessRequestCensus;
  at?: Date;
}>, hooks: AccessRequestCensusWriterHooks = {}): AccessRequestCensusReference {
  const directory = openAccessRequestCensusDirectory(input.directory);
  let prepared: ReturnType<typeof privateAccessRequestCensusBytes>;
  try {
    prepared = privateAccessRequestCensusBytes({
      census: input.census,
      at: input.at ?? new Date(),
    });
  } catch (error) {
    try { closeSync(directory.descriptor); } catch { /* Preserve validation failure. */ }
    throw error;
  }
  const destination = join(directory.path, prepared.reference.pathBasename);
  let createdIdentity: AccessRequestCensusDestinationIdentity | undefined;
  try {
    hooks.beforeCreate?.();
    requireAccessRequestCensusDirectoryUnchanged(directory);
    createdIdentity = createAccessRequestCensusAtDirectory(
      directory,
      prepared.reference.pathBasename,
    );
    hooks.afterCreate?.();
    requireAccessRequestCensusDirectoryUnchanged(directory);
    requireAccessRequestCensusDestinationUnchanged(
      destination,
      createdIdentity,
      0n,
    );
    hooks.beforeWrite?.();
    writeAccessRequestCensusAtDirectory(
      directory,
      prepared.reference.pathBasename,
      createdIdentity,
      prepared.bytes,
    );
    requireAccessRequestCensusDirectoryUnchanged(directory);
    requireAccessRequestCensusDestinationUnchanged(
      destination,
      createdIdentity,
      BigInt(prepared.bytes.byteLength),
    );
    fsyncSync(directory.descriptor);
    requireAccessRequestCensusDirectoryUnchanged(directory);
    requireAccessRequestCensusDestinationUnchanged(
      destination,
      createdIdentity,
      BigInt(prepared.bytes.byteLength),
    );
    return prepared.reference;
  } catch (error) {
    if (createdIdentity !== undefined) {
      for (const expectedSize of [prepared.bytes.byteLength, 0]) {
        try {
          unlinkAccessRequestCensusAtDirectory(
            directory,
            prepared.reference.pathBasename,
            createdIdentity,
            expectedSize,
          );
          break;
        } catch { /* Try only the other exact safe size. */ }
      }
    }
    if (error instanceof HermesCliError) throw error;
    return fail('Access request census write failed.');
  } finally {
    try { closeSync(directory.descriptor); } catch { /* Best-effort close after fsync. */ }
    prepared.bytes.fill(0);
  }
}

/**
 * Install the private Desktop TXT and its raw exporter reference as one
 * fail-closed operation. The raw count, size, digest, and report pathname are
 * written only to the owner-private reference; callers receive basenames and
 * status only.
 */
export function writeAccessRequestCensusExport(input: Readonly<{
  censusDirectory: string;
  referenceDirectory: string;
  census: AccessRequestCensus;
  at?: Date;
}>): AccessRequestCensusExportResult {
  const at = input.at ?? new Date();
  const censusDirectory = openAccessRequestCensusDirectory(input.censusDirectory);
  let referenceDirectory: ReturnType<typeof openAccessRequestCensusDirectory>;
  try {
    referenceDirectory = openAccessRequestCensusDirectory(input.referenceDirectory);
  } catch (error) {
    closeSync(censusDirectory.descriptor);
    throw error;
  }
  let prepared: ReturnType<typeof privateAccessRequestCensusBytes>;
  try {
    prepared = privateAccessRequestCensusBytes({ census: input.census, at });
  } catch (error) {
    closeSync(censusDirectory.descriptor);
    closeSync(referenceDirectory.descriptor);
    throw error;
  }
  const referenceBasename = accessRequestCensusExporterReferenceFilename(at);
  const referenceBytes = Buffer.from(
    `${JSON.stringify(prepared.reference)}\n`,
    'utf8',
  );
  const censusDestination = join(
    censusDirectory.path,
    prepared.reference.pathBasename,
  );
  const referenceDestination = join(referenceDirectory.path, referenceBasename);
  let censusIdentity: AccessRequestCensusDestinationIdentity | undefined;
  let referenceIdentity: AccessRequestCensusDestinationIdentity | undefined;
  try {
    requireAccessRequestCensusDirectoryUnchanged(censusDirectory);
    requireAccessRequestCensusDirectoryUnchanged(referenceDirectory);

    // Reserve the private reference first. An occupied reference leaf must
    // abort before the Desktop TXT exists.
    referenceIdentity = createAccessRequestCensusAtDirectory(
      referenceDirectory,
      referenceBasename,
    );
    requireAccessRequestCensusDirectoryUnchanged(referenceDirectory);
    requireAccessRequestCensusDestinationUnchanged(
      referenceDestination,
      referenceIdentity,
      0n,
    );

    censusIdentity = createAccessRequestCensusAtDirectory(
      censusDirectory,
      prepared.reference.pathBasename,
    );
    requireAccessRequestCensusDirectoryUnchanged(censusDirectory);
    requireAccessRequestCensusDestinationUnchanged(
      censusDestination,
      censusIdentity,
      0n,
    );

    writeAccessRequestCensusAtDirectory(
      censusDirectory,
      prepared.reference.pathBasename,
      censusIdentity,
      prepared.bytes,
    );
    requireAccessRequestCensusDirectoryUnchanged(censusDirectory);
    requireAccessRequestCensusDestinationUnchanged(
      censusDestination,
      censusIdentity,
      BigInt(prepared.bytes.byteLength),
    );

    writeAccessRequestCensusAtDirectory(
      referenceDirectory,
      referenceBasename,
      referenceIdentity,
      referenceBytes,
    );
    requireAccessRequestCensusDirectoryUnchanged(referenceDirectory);
    requireAccessRequestCensusDestinationUnchanged(
      referenceDestination,
      referenceIdentity,
      BigInt(referenceBytes.byteLength),
    );

    fsyncSync(censusDirectory.descriptor);
    fsyncSync(referenceDirectory.descriptor);
    requireAccessRequestCensusDestinationUnchanged(
      censusDestination,
      censusIdentity,
      BigInt(prepared.bytes.byteLength),
    );
    requireAccessRequestCensusDestinationUnchanged(
      referenceDestination,
      referenceIdentity,
      BigInt(referenceBytes.byteLength),
    );
    return Object.freeze({
      schemaVersion: 1,
      status: 'written',
      privateCensusBasename: prepared.reference.pathBasename,
      privateExporterReferenceBasename: referenceBasename,
    });
  } catch (error) {
    for (const cleanup of [
      censusIdentity === undefined ? undefined : Object.freeze({
        directory: censusDirectory,
        filename: prepared.reference.pathBasename,
        identity: censusIdentity,
        size: prepared.bytes.byteLength,
      }),
      referenceIdentity === undefined ? undefined : Object.freeze({
        directory: referenceDirectory,
        filename: referenceBasename,
        identity: referenceIdentity,
        size: referenceBytes.byteLength,
      }),
    ]) {
      if (cleanup === undefined) continue;
      try {
        unlinkAccessRequestCensusAtDirectory(
          cleanup.directory,
          cleanup.filename,
          cleanup.identity,
          cleanup.size,
        );
      } catch { /* Best-effort exact-inode cleanup; preserve the root failure. */ }
    }
    if (error instanceof HermesCliError) throw error;
    return fail('Access request census export write failed.');
  } finally {
    try { closeSync(censusDirectory.descriptor); } catch { /* Best effort. */ }
    try { closeSync(referenceDirectory.descriptor); } catch { /* Best effort. */ }
    prepared.bytes.fill(0);
    referenceBytes.fill(0);
  }
}

function fsyncHermesPrivateDirectory(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch {
    fail('Pending access request census directory sync failed.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

type PendingAccessRequestCensusFile = Readonly<{
  bytes: Buffer;
  dev: bigint;
  ino: bigint;
  mode: bigint;
  uid: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

function readPendingAccessRequestCensusInstallFile(
  path: string,
  allowedLinks: 1n | 2n,
): PendingAccessRequestCensusFile {
  let descriptor: number | undefined;
  try {
    const pathStatus = lstatSync(path, { bigint: true });
    if (
      pathStatus.isSymbolicLink() || !pathStatus.isFile()
      || pathStatus.nlink !== allowedLinks
      || (pathStatus.mode & 0o7777n) !== 0o600n
      || (process.getuid !== undefined && pathStatus.uid !== BigInt(process.getuid()))
      || pathStatus.size < 1n
      || pathStatus.size > BigInt(MAX_ACCESS_REQUEST_CENSUS_BYTES)
      || realpathSync(path) !== path
    ) fail('Pending access request census install state was invalid.');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== pathStatus.dev || before.ino !== pathStatus.ino
      || before.mode !== pathStatus.mode || before.uid !== pathStatus.uid
      || before.nlink !== pathStatus.nlink || before.size !== pathStatus.size
    ) fail('Pending access request census install state was invalid.');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.uid !== before.uid || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || current.dev !== before.dev || current.ino !== before.ino || current.mode !== before.mode
      || current.uid !== before.uid || current.nlink !== before.nlink
      || current.size !== before.size || current.mtimeNs !== before.mtimeNs
      || current.ctimeNs !== before.ctimeNs || bytes.byteLength !== Number(before.size)
    ) {
      bytes.fill(0);
      fail('Pending access request census install state changed while being read.');
    }
    return Object.freeze({
      bytes,
      dev: before.dev,
      ino: before.ino,
      mode: before.mode,
      uid: before.uid,
      nlink: before.nlink,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });
  } catch (error) {
    if (error instanceof HermesCliError) throw error;
    return fail('Pending access request census install state was invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactPendingAccessRequestCensusInstallBody(
  installed: PendingAccessRequestCensusFile,
  expectedBytes: Buffer,
  expectedDigest: string,
): void {
  try {
    if (
      !installed.bytes.equals(expectedBytes)
      || createHash('sha256').update(installed.bytes).digest('hex') !== expectedDigest
    ) fail('Pending access request census destination conflicted.');
  } finally {
    installed.bytes.fill(0);
  }
}

/**
 * Admit an exact existing result, including the sole recoverable crash state:
 * destination plus one same-inode temporary hard link after durable link install.
 */
function settlePendingAccessRequestCensusInstall(
  directory: string,
  destination: string,
  filename: string,
  expectedBytes: Buffer,
  expectedDigest: string,
): boolean {
  try {
    lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    fail('Pending access request census install state was invalid.');
  }
  let destinationFile: PendingAccessRequestCensusFile;
  try {
    destinationFile = readPendingAccessRequestCensusInstallFile(destination, 1n);
  } catch {
    destinationFile = readPendingAccessRequestCensusInstallFile(destination, 2n);
  }
  exactPendingAccessRequestCensusInstallBody(
    destinationFile,
    expectedBytes,
    expectedDigest,
  );
  if (destinationFile.nlink === 1n) return true;

  const prefix = `.${filename}-`;
  const linkedTemporaryNames = readdirSync(directory).filter(name => {
    if (
      !name.startsWith(prefix)
      || !/^[0-9a-f]{32}\.tmp$/u.test(name.slice(prefix.length))
    ) return false;
    try {
      const candidate = lstatSync(join(directory, name), { bigint: true });
      return candidate.dev === destinationFile.dev && candidate.ino === destinationFile.ino;
    } catch {
      fail('Pending access request census crash recovery state was invalid.');
    }
  });
  if (linkedTemporaryNames.length !== 1) {
    fail('Pending access request census crash recovery state was invalid.');
  }
  const linkedTemporary = join(directory, linkedTemporaryNames[0]!);
  const temporaryFile = readPendingAccessRequestCensusInstallFile(linkedTemporary, 2n);
  try {
    if (
      temporaryFile.dev !== destinationFile.dev
      || temporaryFile.ino !== destinationFile.ino
      || temporaryFile.mode !== destinationFile.mode
      || temporaryFile.uid !== destinationFile.uid
      || temporaryFile.nlink !== destinationFile.nlink
      || temporaryFile.size !== destinationFile.size
      || temporaryFile.mtimeNs !== destinationFile.mtimeNs
      || temporaryFile.ctimeNs !== destinationFile.ctimeNs
    ) fail('Pending access request census crash recovery state was invalid.');
    exactPendingAccessRequestCensusInstallBody(
      temporaryFile,
      expectedBytes,
      expectedDigest,
    );
  } finally {
    temporaryFile.bytes.fill(0);
  }
  unlinkSync(linkedTemporary);
  fsyncHermesPrivateDirectory(directory);
  const repaired = readPendingAccessRequestCensusInstallFile(destination, 1n);
  exactPendingAccessRequestCensusInstallBody(repaired, expectedBytes, expectedDigest);
  return true;
}

/** Install sensitive census bytes only in the bootstrap-provided 0700 directory. */
export function writePendingAccessRequestCensus(input: Readonly<{
  directory: string;
  census: PendingAccessRequestCensus;
  randomId?: () => string;
}>): Readonly<{ filename: string; sha256: string }> {
  const directory = exactTrustedPlanDirectory(input.directory);
  const census = exactPendingAccessRequestCensus(input.census);
  const bytes = Buffer.from(`${JSON.stringify(census)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_ACCESS_REQUEST_CENSUS_BYTES) {
    bytes.fill(0);
    fail('Pending access request census exceeded the private report size bound.');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  const filename = `pending-access-request-census-${digest}.json`;
  if (basename(filename) !== filename) {
    bytes.fill(0);
    fail('Pending access request census filename was invalid.');
  }
  const destination = join(directory, filename);
  const nonce = (input.randomId ?? (() => randomUUID().replaceAll('-', '')))();
  if (!/^[0-9a-f]{32}$/u.test(nonce)) {
    bytes.fill(0);
    fail('Pending access request census temporary identity was invalid.');
  }
  const temporary = join(directory, `.${filename}-${nonce}.tmp`);
  let descriptor: number | undefined;
  let installed = false;
  try {
    if (settlePendingAccessRequestCensusInstall(
      directory,
      destination,
      filename,
      bytes,
      digest,
    )) return Object.freeze({ filename, sha256: digest });
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
      );
      if (written <= 0) fail('Pending access request census write failed.');
      offset += written;
    }
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, destination);
      installed = true;
      fsyncHermesPrivateDirectory(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      if (!settlePendingAccessRequestCensusInstall(
        directory,
        destination,
        filename,
        bytes,
        digest,
      )) fail('Pending access request census destination conflicted.');
    }
    unlinkSync(temporary);
    fsyncHermesPrivateDirectory(directory);
    if (!settlePendingAccessRequestCensusInstall(
      directory,
      destination,
      filename,
      bytes,
      digest,
    )) fail('Pending access request census verification failed.');
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* Preserve the original failure. */ }
    if (error instanceof HermesCliError) throw error;
    fail(installed
      ? 'Pending access request census verification failed.'
      : 'Pending access request census write failed.');
  } finally {
    bytes.fill(0);
  }
  return Object.freeze({ filename, sha256: digest });
}

type ResourceAggregateV4 = Readonly<{
  allowedFids: bigint;
  castles: bigint;
  markAccounts: bigint;
  resourceAccounts: bigint;
  missingResourceAccounts: bigint;
  orphanedResourceAccounts: bigint;
  resourceInvariantViolations: bigint;
  protocolVersion: number;
  resourcePolicyVersion: string;
}>;

type GenesisExpansionResourceStatusV4 = ResourceAggregateV4;

type GenesisExpansionStatusV3 = Readonly<{
  worldTiles: bigint;
  occupiedWorldTiles: bigint;
  worldTileMeta: bigint;
  realms: bigint;
  castleSlots: bigint;
  castleSlotClaims: bigint;
  legacyPlayers: bigint;
  playersV2: bigint;
  playerOwnershipsV2: bigint;
  castles: bigint;
  realmProfiles: bigint;
  markAccounts: bigint;
  snapBurnCredits: bigint;
  walletAttributions: bigint;
  walletAttributionSnapshots: bigint;
  scanCursors: bigint;
  scanBatches: bigint;
  alphaTermsAcceptances: bigint;
  allowedFids: bigint;
  enabledAllowedFids: bigint;
  auditEntries: bigint;
  orphanedPlayerRowsV2: bigint;
  orphanedOwnershipRowsV2: bigint;
  orphanedCastleClaims: bigint;
  orphanedCastles: bigint;
  orphanedRealmProfiles: bigint;
  orphanedMarkAccounts: bigint;
  orphanedBurnCredits: bigint;
  orphanedTermsAcceptances: bigint;
  founderStateGaps: bigint;
  markAccountInvariantViolations: bigint;
  publicMarkProjectionViolations: bigint;
  duplicateBurnReferences: bigint;
  burnAccountReconciliationViolations: bigint;
  ambiguousActiveWalletAddresses: bigint;
  staticWorldDriftViolations: bigint;
  termsAcceptanceInvariantViolations: bigint;
  protocolVersion: number;
  worldSeed: number;
  worldSeedName: string;
}>;

export function verifyAccessRequestResetAggregatePreservation(
  beforeV3: GenesisExpansionStatusV3,
  afterV3: GenesisExpansionStatusV3,
  beforeV4: ResourceAggregateV4,
  afterV4: ResourceAggregateV4,
  targetBefore: AccessRequestResetStatus,
): void {
  const changed = targetBefore.admissionState === 'enabled'
    || targetBefore.requestCycle !== undefined;
  for (const [field, beforeValue] of Object.entries(beforeV3)) {
    const expected = field === 'enabledAllowedFids'
      ? targetBefore.admissionState === 'enabled'
        ? (beforeValue as bigint) - 1n
        : beforeValue
      : field === 'auditEntries'
        ? changed
          ? (beforeValue as bigint) + 1n
          : beforeValue
        : beforeValue;
    if ((afterV3 as unknown as Record<string, unknown>)[field] !== expected) {
      fail(
        'Access request reset changed an unexpected persistent aggregate. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  for (const [field, beforeValue] of Object.entries(beforeV4)) {
    if ((afterV4 as unknown as Record<string, unknown>)[field] !== beforeValue) {
      fail(
        'Access request reset changed persistent resource state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
}

const GENESIS_EXPANSION_ZERO_INVARIANT_FIELDS = Object.freeze([
  'orphanedPlayerRowsV2',
  'orphanedOwnershipRowsV2',
  'orphanedCastleClaims',
  'orphanedCastles',
  'orphanedRealmProfiles',
  'orphanedMarkAccounts',
  'orphanedBurnCredits',
  'orphanedTermsAcceptances',
  'founderStateGaps',
  'markAccountInvariantViolations',
  'publicMarkProjectionViolations',
  'duplicateBurnReferences',
  'burnAccountReconciliationViolations',
  'ambiguousActiveWalletAddresses',
  'staticWorldDriftViolations',
  'termsAcceptanceInvariantViolations',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

const GENESIS_EXPANSION_PRESERVED_COUNT_FIELDS = Object.freeze([
  'occupiedWorldTiles',
  'castleSlotClaims',
  'legacyPlayers',
  'playersV2',
  'playerOwnershipsV2',
  'castles',
  'realmProfiles',
  'markAccounts',
  'snapBurnCredits',
  'walletAttributions',
  'walletAttributionSnapshots',
  'scanCursors',
  'scanBatches',
  'alphaTermsAcceptances',
  'allowedFids',
  'enabledAllowedFids',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

function verifyGenesisExpansionIdentity(status: GenesisExpansionStatusV3): void {
  if (
    status.protocolVersion !== 3
    || status.worldSeed !== HEGEMONY_WORLD_SEED
    || status.worldSeedName !== HEGEMONY_WORLD_SEED_NAME
  ) {
    fail('Genesis world v3 expansion checkpoint had an unexpected backend identity.');
  }
  for (const field of GENESIS_EXPANSION_ZERO_INVARIANT_FIELDS) {
    if (status[field] !== 0n) {
      fail(`Genesis world v3 expansion checkpoint reported nonzero ${field}.`);
    }
  }
}

function verifyFoundedGenesisState(status: GenesisExpansionStatusV3): void {
  const founders = status.allowedFids;
  if (
    founders < 1n
    || founders > GENESIS_MAX_FOUNDERS
    || status.enabledAllowedFids !== founders
    || status.occupiedWorldTiles !== founders
    || status.castleSlotClaims !== founders
    || status.castles !== founders
    || status.realmProfiles !== founders
    || status.markAccounts !== founders
    || status.playersV2 !== status.playerOwnershipsV2
    || status.playersV2 > founders
    || status.alphaTermsAcceptances
      > status.playersV2 * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER
  ) {
    fail('Genesis world v3 expansion checkpoint did not contain an exact founded player graph.');
  }
}

const FOUNDER_ADMISSION_INCREMENTED_V3_FIELDS = Object.freeze([
  'occupiedWorldTiles',
  'castleSlotClaims',
  'castles',
  'realmProfiles',
  'markAccounts',
  'allowedFids',
  'enabledAllowedFids',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

const FOUNDER_ADMISSION_PRESERVED_V3_FIELDS = Object.freeze([
  'worldTiles',
  'worldTileMeta',
  'realms',
  'castleSlots',
  'legacyPlayers',
  'playersV2',
  'playerOwnershipsV2',
  'snapBurnCredits',
  'walletAttributions',
  'walletAttributionSnapshots',
  'scanCursors',
  'scanBatches',
  'alphaTermsAcceptances',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

function verifyFounderAdmissionCheckpointV3(
  status: GenesisExpansionStatusV3,
  requireCapacity: boolean,
): void {
  verifyGenesisExpansionIdentity(status);
  const founders = status.allowedFids;
  if (
    founders < 0n
    || founders > GENESIS_MAX_FOUNDERS
    || (requireCapacity && founders >= GENESIS_MAX_FOUNDERS)
    || status.worldTiles !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.worldTileMeta !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.realms !== GENESIS_REALM_COUNT
    || status.castleSlots !== GENESIS_CASTLE_SLOT_COUNT
    || status.legacyPlayers !== 0n
    || status.enabledAllowedFids > founders
    || status.occupiedWorldTiles !== founders
    || status.castleSlotClaims !== founders
    || status.castles !== founders
    || status.realmProfiles !== founders
    || status.markAccounts !== founders
    || status.playersV2 !== status.playerOwnershipsV2
    || status.playersV2 > founders
    || status.alphaTermsAcceptances
      > status.playersV2 * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER
  ) {
    fail('Founder admission v3 checkpoint was not an exact capacity-safe founded graph.');
  }
}

export function verifyFounderAdmissionPreconditionV3(
  status: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyFounderAdmissionCheckpointV3(status, true);
  return Object.freeze({ ...status });
}

export function verifyFounderAdmissionPostconditionV3(
  status: GenesisExpansionStatusV3,
  before: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyFounderAdmissionCheckpointV3(status, false);
  for (const field of FOUNDER_ADMISSION_INCREMENTED_V3_FIELDS) {
    if (status[field] !== (before[field] as bigint) + 1n) {
      fail(
        'Founder admission v3 postcondition failed. The mutation outcome may be indeterminate; '
        + 'perform a fresh bounded read-only inspection before any retry.',
      );
    }
  }
  for (const field of FOUNDER_ADMISSION_PRESERVED_V3_FIELDS) {
    if (status[field] !== before[field]) {
      fail(
        'Founder admission changed unrelated persistent aggregate state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  if (status.auditEntries !== before.auditEntries + 1n) {
    fail(
      'Founder admission did not produce the exact audit transition. '
      + 'Do not retry before a bounded read-only investigation.',
    );
  }
  return Object.freeze({ ...status });
}

export function verifyFounderAdmissionResourcePreconditionV4(
  status: ResourceAggregateV4,
  expectedFounderCount: bigint,
): ResourceAggregateV4 {
  if (
    expectedFounderCount < 0n
    || expectedFounderCount >= GENESIS_MAX_FOUNDERS
    || status.allowedFids !== expectedFounderCount
    || status.castles !== expectedFounderCount
    || status.markAccounts !== expectedFounderCount
    || status.resourceAccounts !== expectedFounderCount
    || status.missingResourceAccounts !== 0n
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || status.protocolVersion !== 3
    || status.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) {
    fail('Founder admission v4 resource checkpoint was not exact.');
  }
  return Object.freeze({ ...status });
}

export function verifyFounderAdmissionResourcePostconditionV4(
  status: ResourceAggregateV4,
  before: ResourceAggregateV4,
): ResourceAggregateV4 {
  const expectedFounderCount = before.allowedFids + 1n;
  const verified = verifyExpectedResourceAggregateV4(status, expectedFounderCount);
  if (
    status.castles !== before.castles + 1n
    || status.markAccounts !== before.markAccounts + 1n
    || status.resourceAccounts !== before.resourceAccounts + 1n
  ) {
    fail(
      'Founder admission v4 postcondition failed. The mutation outcome may be indeterminate; '
      + 'perform a fresh bounded read-only inspection before any retry.',
    );
  }
  return verified;
}

export function verifyFounderReenablePrecondition(
  world: GenesisExpansionStatusV3,
  resources: ResourceAggregateV4,
  target: AccessRequestAdmissionStatus,
): Readonly<{
  world: GenesisExpansionStatusV3;
  resources: ResourceAggregateV4;
  target: AccessRequestAdmissionStatus;
}> {
  verifyFounderAdmissionCheckpointV3(world, false);
  verifyExpectedResourceAggregateV4(resources, world.allowedFids);
  if (target.admissionState === 'disabled' && target.authEpoch >= 0xffff_ffff) {
    fail('Existing founder re-enable cannot rotate an exhausted auth epoch.');
  }
  if (
    target.admissionState !== 'disabled'
    || target.requestState !== 'pending'
    || target.requestCycle !== BigInt(target.authEpoch) + 1n
    || target.requestedAtMicros === undefined
  ) {
    fail('Existing founder re-enable requires one exact pending access request.');
  }
  return Object.freeze({
    world: Object.freeze({ ...world }),
    resources: Object.freeze({ ...resources }),
    target: Object.freeze({ ...target }),
  });
}

export function verifyFounderReenablePostcondition(
  world: GenesisExpansionStatusV3,
  resources: ResourceAggregateV4,
  target: AccessRequestAdmissionStatus,
  before: ReturnType<typeof verifyFounderReenablePrecondition>,
): void {
  verifyFounderAdmissionCheckpointV3(world, false);
  if (
    target.admissionState !== 'enabled'
    || target.authEpoch !== before.target.authEpoch + 1
    || target.requestState !== 'resolved'
    || target.requestCycle !== before.target.requestCycle
    || target.requestedAtMicros !== before.target.requestedAtMicros
  ) {
    fail(
      'Existing founder re-enable postcondition failed. The mutation outcome may be '
      + 'indeterminate; perform a fresh bounded read-only inspection before any retry.',
    );
  }
  for (const field of Object.keys(before.world) as (keyof GenesisExpansionStatusV3)[]) {
    const expected = field === 'enabledAllowedFids'
      ? (before.world[field] as bigint) + 1n
      : field === 'auditEntries'
        ? (before.world[field] as bigint) + 1n
        : before.world[field];
    if (world[field] !== expected) {
      fail(
        'Existing founder re-enable changed an unexpected Realm aggregate. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  const verifiedResources = verifyExpectedResourceAggregateV4(
    resources,
    before.world.allowedFids,
  );
  for (const field of Object.keys(before.resources) as (keyof ResourceAggregateV4)[]) {
    if (verifiedResources[field] !== before.resources[field]) {
      fail(
        'Existing founder re-enable changed persistent resource state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
}

export function verifyFounderAdmissionRequestPostcondition(
  target: AccessRequestAdmissionStatus,
  before: AccessRequestAdmissionStatus,
): void {
  if (
    before.admissionState !== 'missing'
    || before.authEpoch !== 0
    || before.requestState !== 'pending'
    || before.requestCycle !== 0n
    || before.requestedAtMicros === undefined
    || target.admissionState !== 'enabled'
    || target.authEpoch !== 1
    || target.requestState !== 'resolved'
    || target.requestCycle !== before.requestCycle
    || target.requestedAtMicros !== before.requestedAtMicros
  ) {
    fail(
      'Founder admission request postcondition failed. The mutation outcome may be '
      + 'indeterminate; perform a fresh bounded read-only inspection before any retry.',
    );
  }
}

export function verifyGenesisExpansionPreconditionV3(
  status: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyGenesisExpansionIdentity(status);
  verifyFoundedGenesisState(status);
  if (
    status.worldTiles !== GENESIS_GENERATION_V2_WORLD_CELLS
    || status.worldTileMeta !== GENESIS_GENERATION_V2_WORLD_CELLS
    || status.realms !== GENESIS_REALM_COUNT
    || status.castleSlots !== GENESIS_CASTLE_SLOT_COUNT
  ) {
    fail('Genesis world v3 expansion requires the exact generation-v2 static world checkpoint.');
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionPostconditionV3(
  status: GenesisExpansionStatusV3,
  before: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyGenesisExpansionIdentity(status);
  verifyFoundedGenesisState(status);
  if (
    status.worldTiles !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.worldTileMeta !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.realms !== GENESIS_REALM_COUNT
    || status.castleSlots !== GENESIS_CASTLE_SLOT_COUNT
  ) {
    fail(
      'Genesis world v3 expansion postcondition failed. The mutation outcome may be indeterminate; '
      + 'perform a fresh read-only v3 inspection before any retry.',
    );
  }
  for (const field of GENESIS_EXPANSION_PRESERVED_COUNT_FIELDS) {
    if (status[field] !== before[field]) {
      fail(
        'Genesis world v3 expansion changed persistent player state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  if (status.auditEntries !== before.auditEntries + 1n) {
    fail(
      'Genesis world v3 expansion did not produce the exact audit transition. '
      + 'Do not retry before a bounded read-only investigation.',
    );
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionResourceCheckpointV4(
  status: GenesisExpansionResourceStatusV4,
): GenesisExpansionResourceStatusV4 {
  const founders = status.allowedFids;
  const exactPrebackfill = status.resourceAccounts === 0n
    && status.missingResourceAccounts === founders;
  const exactReady = status.resourceAccounts === founders
    && status.missingResourceAccounts === 0n;
  if (
    founders < 1n
    || founders > GENESIS_MAX_FOUNDERS
    || status.castles !== founders
    || status.markAccounts !== founders
    || (!exactPrebackfill && !exactReady)
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || status.protocolVersion !== 3
    || status.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) {
    fail('Genesis world v3 expansion resource checkpoint was not exact.');
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionResourcePreservationV4(
  status: GenesisExpansionResourceStatusV4,
  before: GenesisExpansionResourceStatusV4,
): GenesisExpansionResourceStatusV4 {
  const verified = verifyGenesisExpansionResourceCheckpointV4(status);
  for (const field of Object.keys(before) as (keyof GenesisExpansionResourceStatusV4)[]) {
    if (verified[field] !== before[field]) {
      fail(
        'Genesis world v3 expansion changed private resource aggregate state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  return verified;
}

export function verifyExpectedResourceAggregateV4(
  status: ResourceAggregateV4,
  expectedFounderCount: bigint,
): ResourceAggregateV4 {
  if (
    expectedFounderCount < 1n
    || expectedFounderCount > MAX_RESOURCE_BACKFILL_FOUNDERS
    || status.allowedFids !== expectedFounderCount
    || status.castles !== expectedFounderCount
    || status.markAccounts !== expectedFounderCount
    || status.resourceAccounts !== expectedFounderCount
    || status.missingResourceAccounts !== 0n
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || status.protocolVersion !== 3
    || status.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) {
    fail(
      'Resource backfill postcondition failed. The mutation outcome may be indeterminate; '
      + 'perform a fresh read-only v4 inspection before any retry.',
    );
  }
  return Object.freeze({ ...status });
}

async function readBoundedAdminResponse(response: Response): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_ADMIN_TOKEN_RESPONSE_BYTES)
  ) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  if (!response.body) fail('The Warpkeep admin bridge returned an invalid response.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ADMIN_TOKEN_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Keep the rejection generic. */ }
        exceededLimit = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  } finally {
    try { reader.releaseLock(); } catch { /* Keep the rejection generic. */ }
  }
  if (exceededLimit) fail('The Warpkeep admin bridge returned an invalid response.');

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
}

export async function requestAdminToken(
  bridgeUrl: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
  budget: Readonly<{
    reservationId?: string;
    recordAttempt?: typeof recordProductionAdminTokenAttempt;
    trustedNowMs?: number;
  }> = {},
) {
  const recordAttempt = budget.recordAttempt ?? recordProductionAdminTokenAttempt;
  if (
    budget.recordAttempt === undefined
    && bridgeUrl !== 'https://auth.warpkeep.com'
  ) fail('The Warpkeep admin token budget requires the canonical production bridge.');
  const trustedNowMs = budget.recordAttempt === undefined
    ? budget.trustedNowMs ?? await readProductionAdminBridgeTrustedTime(bridgeUrl, fetchImpl)
    : budget.trustedNowMs;
  try {
    await recordAttempt(
      {
        ...(budget.reservationId === undefined
          ? {}
          : { reservationId: budget.reservationId }),
        ...(trustedNowMs === undefined ? {} : { now: () => trustedNowMs }),
      },
    );
  } catch {
    fail('The Warpkeep admin token request budget is unavailable.');
  }
  let response: Response;
  try {
    response = await fetchImpl(new URL('v1/admin/token', `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    fail('Could not reach the Warpkeep admin bridge.');
  }
  if (!response.ok) fail('The Warpkeep admin bridge rejected the request.');
  const body = await readBoundedAdminResponse(response);
  const token = body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
  if (
    !body
    || typeof body !== 'object'
    || typeof token !== 'string'
    || token.length < 24
    || token.length > 16_384
    || token.split('.').length !== 3
    || token.split('.').some(part => !/^[A-Za-z0-9_-]+$/.test(part))
    || (body as { tokenType?: unknown }).tokenType !== 'spacetime-access'
  ) {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  try {
    await awaitAdminTokenClockReadiness();
  } catch {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  return token;
}

const PRODUCTION_ADMIN_BRIDGE_CLOCK_SKEW_MS = 60_000;

/**
 * The bridge's authenticated HTTPS origin supplies the cross-process quota
 * clock. A local forward/backward jump cannot prune the owner ledger early.
 */
export async function readProductionAdminBridgeTrustedTime(
  bridgeUrl: string,
  fetchImpl: typeof fetch = fetch,
  localNow: () => number = Date.now,
): Promise<number> {
  if (bridgeUrl !== 'https://auth.warpkeep.com') {
    fail('The Warpkeep admin token clock requires the canonical production bridge.');
  }
  let response: Response;
  try {
    response = await fetchImpl(new URL('healthz', `${bridgeUrl}/`), {
      method: 'GET',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('Could not establish the Warpkeep admin token clock.');
  }
  const date = response.headers.get('date');
  const localTime = localNow();
  const trustedTime = date === null ? Number.NaN : Date.parse(date);
  if (
    !response.ok
    || date === null
    || !/^[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/u.test(date)
    || !Number.isSafeInteger(trustedTime)
    || new Date(trustedTime).toUTCString() !== date
    || !Number.isSafeInteger(localTime)
    || Math.abs(localTime - trustedTime) > PRODUCTION_ADMIN_BRIDGE_CLOCK_SKEW_MS
  ) fail('Could not establish the Warpkeep admin token clock.');
  try { await response.body?.cancel(); } catch { /* The trusted header is already bounded. */ }
  return trustedTime;
}

export type AdmissionNotificationStatus =
  | 'queued'
  | 'already-sent'
  | 'delivery-exhausted'
  | 'not-subscribed';

function isAdmissionNotificationRetryReason(
  value: unknown,
): value is AdmissionNotificationRetryReason {
  return value === 'admission-verification'
    || value === 'request-verification'
    || value === 'transport'
    || value === 'transport-timeout'
    || value === 'transport-fetch-rejected'
    || value === 'upstream-status'
    || value === 'upstream-redirect'
    || value === 'upstream-client-status'
    || value === 'upstream-server-status'
    || value === 'invalid-response'
    || value === 'response-content-type'
    || value === 'response-size'
    || value === 'response-body'
    || value === 'response-json'
    || value === 'response-schema'
    || value === 'rate-limited'
    || value === 'provider-domain-mismatch'
    || value === 'provider-target-url-mismatch'
    || value === 'provider-no-webhook-url'
    || value === 'provider-invalid-token'
    || value === 'provider-unknown';
}

function isDiagnosticTimestamp(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

/**
 * Strict token-free projection for the bridge operator diagnostic. Unknown
 * fields are rejected before any value can reach stdout.
 */
export function projectAdmissionNotificationDiagnostics(
  value: unknown,
): AdmissionNotificationDiagnostics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('The Warpkeep admission notification bridge returned invalid diagnostics.');
  }
  const diagnostic = value as Record<string, unknown>;
  const keys = Object.keys(diagnostic);
  if (
    !ADMISSION_NOTIFICATION_DIAGNOSTIC_REQUIRED_KEYS.every(key => (
      Object.prototype.hasOwnProperty.call(diagnostic, key)
    ))
    || !keys.every(key => (
      ADMISSION_NOTIFICATION_DIAGNOSTIC_REQUIRED_KEYS.includes(
        key as typeof ADMISSION_NOTIFICATION_DIAGNOSTIC_REQUIRED_KEYS[number],
      )
      || ADMISSION_NOTIFICATION_DIAGNOSTIC_OPTIONAL_KEYS.includes(
        key as typeof ADMISSION_NOTIFICATION_DIAGNOSTIC_OPTIONAL_KEYS[number],
      )
    ))
    || (
      diagnostic.status !== 'queued'
      && diagnostic.status !== 'already-sent'
      && diagnostic.status !== 'delivery-exhausted'
      && diagnostic.status !== 'not-subscribed'
    )
    || (
      diagnostic.generation !== undefined
      && diagnostic.generation !== 'admitted'
      && diagnostic.generation !== 'pending-request'
    )
    || (
      diagnostic.authEpoch !== undefined
      && (
        typeof diagnostic.authEpoch !== 'number'
        || !Number.isInteger(diagnostic.authEpoch)
        || diagnostic.authEpoch < 1
        || diagnostic.authEpoch > 0xffff_ffff
      )
    )
    || (diagnostic.generation === 'pending-request' && diagnostic.authEpoch !== undefined)
    || (
      diagnostic.generation === 'pending-request'
      && (
        typeof diagnostic.requestedAtMicros !== 'number'
        || !Number.isSafeInteger(diagnostic.requestedAtMicros)
        || diagnostic.requestedAtMicros < 1
      )
    )
    || (diagnostic.generation === 'admitted' && diagnostic.authEpoch === undefined)
    || (diagnostic.generation !== 'admitted' && diagnostic.authEpoch !== undefined)
    || (diagnostic.generation !== 'pending-request' && diagnostic.requestedAtMicros !== undefined)
    || typeof diagnostic.deliveryAttemptCount !== 'number'
    || !Number.isSafeInteger(diagnostic.deliveryAttemptCount)
    || diagnostic.deliveryAttemptCount < 0
    || typeof diagnostic.verificationFailureCount !== 'number'
    || !Number.isSafeInteger(diagnostic.verificationFailureCount)
    || diagnostic.verificationFailureCount < 0
    || typeof diagnostic.subscribed !== 'boolean'
    || typeof diagnostic.recoveryCount !== 'number'
    || !Number.isSafeInteger(diagnostic.recoveryCount)
    || diagnostic.recoveryCount < 0
    || diagnostic.recoveryCount > 1
    || (diagnostic.lastRecoveryAt !== undefined
      && !isDiagnosticTimestamp(diagnostic.lastRecoveryAt))
    || (diagnostic.recoveryCount === 0) !== (diagnostic.lastRecoveryAt === undefined)
    || (diagnostic.recoveryCount === 1 && diagnostic.generation !== 'pending-request')
    || !Array.isArray(diagnostic.retryReasons)
    || diagnostic.retryReasons.some(reason => !isAdmissionNotificationRetryReason(reason))
    || new Set(diagnostic.retryReasons).size !== diagnostic.retryReasons.length
    || (diagnostic.lastAttemptAt !== undefined
      && !isDiagnosticTimestamp(diagnostic.lastAttemptAt))
    || (diagnostic.lastFailureReason !== undefined
      && !isAdmissionNotificationRetryReason(diagnostic.lastFailureReason))
    || (diagnostic.nextAttemptAt !== undefined
      && !isDiagnosticTimestamp(diagnostic.nextAttemptAt))
  ) {
    fail('The Warpkeep admission notification bridge returned invalid diagnostics.');
  }
  return Object.freeze({
    status: diagnostic.status,
    ...(diagnostic.generation === undefined ? {} : { generation: diagnostic.generation }),
    ...(diagnostic.authEpoch === undefined ? {} : { authEpoch: diagnostic.authEpoch }),
    ...(diagnostic.requestedAtMicros === undefined
      ? {}
      : { requestedAtMicros: diagnostic.requestedAtMicros }),
    deliveryAttemptCount: diagnostic.deliveryAttemptCount,
    verificationFailureCount: diagnostic.verificationFailureCount,
    subscribed: diagnostic.subscribed,
    recoveryCount: diagnostic.recoveryCount,
    ...(diagnostic.lastRecoveryAt === undefined
      ? {}
      : { lastRecoveryAt: diagnostic.lastRecoveryAt }),
    retryReasons: Object.freeze([
      ...diagnostic.retryReasons,
    ] as AdmissionNotificationRetryReason[]),
    ...(diagnostic.lastAttemptAt === undefined
      ? {}
      : { lastAttemptAt: diagnostic.lastAttemptAt }),
    ...(diagnostic.lastFailureReason === undefined
      ? {}
      : { lastFailureReason: diagnostic.lastFailureReason }),
    ...(diagnostic.nextAttemptAt === undefined
      ? {}
      : { nextAttemptAt: diagnostic.nextAttemptAt }),
  }) as AdmissionNotificationDiagnostics;
}

export function readNotificationOperatorSecret(value: string | undefined): string {
  const bytes = new TextEncoder().encode(value ?? '');
  try {
    if (bytes.byteLength < 32 || bytes.byteLength > 512) {
      fail('WARPKEEP_NOTIFICATION_OPERATOR_SECRET must contain 32 to 512 bytes.');
    }
    return value as string;
  } finally {
    bytes.fill(0);
  }
}

export function requireAdmissionNotificationRecoveryPrecondition(
  diagnostics: AdmissionNotificationDiagnostics,
  expectedRequestedAtMicros: bigint,
): AdmissionNotificationDiagnostics {
  if (
    expectedRequestedAtMicros < 1n
    || expectedRequestedAtMicros > BigInt(Number.MAX_SAFE_INTEGER)
    || diagnostics.status !== 'delivery-exhausted'
    || diagnostics.generation !== 'pending-request'
    || diagnostics.requestedAtMicros !== Number(expectedRequestedAtMicros)
    || diagnostics.recoveryCount !== 0
    || diagnostics.lastRecoveryAt !== undefined
    || !diagnostics.subscribed
  ) {
    fail(
      diagnostics.status === 'not-subscribed' || !diagnostics.subscribed
        ? 'Farcaster notifications are not enabled for this identity. Recovery remains blocked until the player enables notifications.'
        : 'Admission notification recovery requires one exact exhausted, unrecovered pending-request generation.',
    );
  }
  return Object.freeze({ ...diagnostics });
}

export async function requestAdmissionNotification(
  bridgeUrl: string,
  fid: bigint,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdmissionNotificationStatus> {
  if (fid < 1n || fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  readNotificationOperatorSecret(secret);
  let response: Response;
  try {
    response = await fetchImpl(new URL(ADMISSION_NOTIFICATION_PATH, `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({ fid: fid.toString() }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('Could not reach the Warpkeep admission notification bridge.');
  }
  if (!response.ok) fail('The Warpkeep admission notification bridge rejected the request.');
  const body = await readBoundedAdminResponse(response);
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !Object.prototype.hasOwnProperty.call(body, 'status')
  ) {
    fail('The Warpkeep admission notification bridge returned an invalid response.');
  }
  const status = (body as { status?: unknown }).status;
  if (
    status !== 'queued'
    && status !== 'already-sent'
    && status !== 'delivery-exhausted'
    && status !== 'not-subscribed'
  ) {
    fail('The Warpkeep admission notification bridge returned an invalid response.');
  }
  return status;
}

export async function inspectAdmissionNotification(
  bridgeUrl: string,
  fid: bigint,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdmissionNotificationDiagnostics> {
  if (fid < 1n || fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  readNotificationOperatorSecret(secret);
  let response: Response;
  try {
    response = await fetchImpl(new URL(ADMISSION_NOTIFICATION_STATUS_PATH, `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({ fid: fid.toString() }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('Could not reach the Warpkeep admission notification bridge.');
  }
  if (!response.ok) fail('The Warpkeep admission notification bridge rejected inspection.');
  const body = await readBoundedAdminResponse(response);
  return projectAdmissionNotificationDiagnostics(body);
}

export async function requestAdmissionNotificationRecovery(
  bridgeUrl: string,
  fid: bigint,
  requestedAtMicros: bigint,
  recoveryId: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdmissionNotificationStatus> {
  if (fid < 1n || fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  if (
    requestedAtMicros < 1n
    || requestedAtMicros > BigInt(Number.MAX_SAFE_INTEGER)
    || !/^[0-9a-f]{32}$/.test(recoveryId)
  ) {
    fail('The reviewed notification recovery authorization was invalid.');
  }
  readNotificationOperatorSecret(secret);
  let response: Response;
  try {
    response = await fetchImpl(
      new URL(ADMISSION_NOTIFICATION_RECOVERY_PATH, `${bridgeUrl}/`),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({
          fid: fid.toString(),
          requestedAtMicros: Number(requestedAtMicros),
          recoveryId,
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    fail('Could not reach the Warpkeep admission notification recovery bridge.');
  }
  if (!response.ok) {
    fail('The Warpkeep admission notification recovery bridge rejected the request.');
  }
  const body = await readBoundedAdminResponse(response);
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !Object.prototype.hasOwnProperty.call(body, 'status')
  ) {
    fail('The Warpkeep admission notification recovery bridge returned an invalid response.');
  }
  const status = (body as { status?: unknown }).status;
  if (
    status !== 'queued'
    && status !== 'already-sent'
    && status !== 'delivery-exhausted'
    && status !== 'not-subscribed'
  ) {
    fail('The Warpkeep admission notification recovery bridge returned an invalid response.');
  }
  return status;
}

export async function requireNotificationBeforeAdmission(
  bridgeUrl: string,
  fid: bigint,
  secretValue: string | undefined,
  fetchImpl: typeof fetch = fetch,
  sleep: AdminTokenSleeper = sleepForAdminTokenReadiness,
  refreshNotificationAuthority: () => Promise<void>,
): Promise<AdmissionNotificationStatus> {
  const secret = readNotificationOperatorSecret(secretValue);
  await refreshNotificationAuthority();
  let status = await requestAdmissionNotification(bridgeUrl, fid, secret, fetchImpl);
  if (status === 'queued') {
    await sleep(ADMISSION_NOTIFICATION_SETTLEMENT_WAIT_MILLISECONDS);
    // Requeue through the authority-checking endpoint instead of trusting a
    // generic status snapshot. This binds the go/no-go decision to whichever
    // exact pending request is still current after the wait.
    await refreshNotificationAuthority();
    status = await requestAdmissionNotification(bridgeUrl, fid, secret, fetchImpl);
  }
  if (status === 'queued') {
    fail(
      'Farcaster has not accepted the pending admission notification. '
      + 'Admission remains unchanged; retry after inspecting token-free bridge diagnostics.',
    );
  }
  if (status === 'delivery-exhausted') {
    fail(
      'Farcaster notification delivery is exhausted. '
      + 'Admission remains unchanged; reconcile notification consent before retrying.',
    );
  }
  if (status === 'not-subscribed') {
    fail(
      'Farcaster notifications are not enabled for this identity. '
      + 'Admission remains pending until the player enables notifications.',
    );
  }
  if (status !== 'already-sent') {
    fail('The pending-request notification did not reach a safe admission state.');
  }
  console.log(JSON.stringify({
    admissionNotification: status,
    providerAcceptanceRequired: true,
    providerAcceptedBeforeAdmission: true,
  }));
  return status;
}

type AdminTokenSleeper = (milliseconds: number) => Promise<void>;

const sleepForAdminTokenReadiness: AdminTokenSleeper = milliseconds => (
  new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
);

/**
 * Maincloud and the bridge can straddle a NumericDate clock boundary. Hold a
 * freshly issued administrator token locally for one fixed elapsed-time
 * window before the first connection. No retry or wall-clock assumption is
 * involved; the module still performs every authoritative claim check.
 */
async function awaitAdminTokenClockReadiness(
  sleep: AdminTokenSleeper = sleepForAdminTokenReadiness,
): Promise<void> {
  try {
    await sleep(ADMIN_TOKEN_CLOCK_SAFETY_MILLISECONDS);
  } catch {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
}

export function requireCredentialedProductionTarget(
  uri: string,
  database: string,
  bridgeUrl: string,
): void {
  if (
    uri !== DEFAULT_URI
    || (database !== LEGACY_DATABASE_ALIAS && database !== DEFAULT_DATABASE_IDENTITY)
    || bridgeUrl !== DEFAULT_BRIDGE
  ) {
    fail('Credentialed Hermes commands require the canonical Warpkeep production targets.');
  }
}

/** New founder admission may target only the attested immutable database identity. */
export function requireFounderAdmissionProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Profiled founder admission requires the immutable Warpkeep production database identity.');
  }
}

/** Durable resource migration may target only the attested immutable identity. */
export function requireResourceBackfillProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Resource backfill requires the immutable Warpkeep production database identity.');
  }
}

/** The one-time persistent world expansion may target only the attested identity. */
export function requireGenesisExpansionProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Genesis world v3 expansion requires the immutable Warpkeep production database identity.');
  }
}

/** Private request inspection is pinned to the immutable production identity. */
export function requireAccessRequestInspectionProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Access request inspection requires the immutable Warpkeep production database identity.');
  }
}

/** Notification diagnostics are a separate credential domain pinned to prod. */
export function requireAdmissionNotificationInspectionProductionTarget(
  bridgeUrl: string,
): void {
  if (bridgeUrl !== DEFAULT_BRIDGE) {
    fail('Admission notification inspection requires the canonical Warpkeep bridge.');
  }
}

/** Destructive request reset is bound to the immutable production identity. */
export function requireAccessRequestResetProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Access request reset requires the immutable Warpkeep production database identity.');
  }
}

/** Canonical economy/forest seeds may target only the attested identity. */
export function requireAlphaComponentActivationProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Alpha component activation requires the immutable Warpkeep production database identity.');
  }
}

export function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new HermesOperationTimeoutError()), OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function disconnectSilently(connection: DbConnection | undefined): void {
  if (!connection || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Preserve the generic connection boundary. */ }
}

export function connect(
  uri: string,
  database: string,
  token: string,
  builderFactory: () => ReturnType<typeof DbConnection.builder> = () => DbConnection.builder(),
): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = false;
    let pendingConnection: DbConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callback();
      return true;
    };
    const rejectUnavailable = () => {
      if (!settle(() => reject(new Error('Could not connect to the Warpkeep database.')))) return false;
      failed = true;
      disconnectSilently(pendingConnection);
      pendingConnection = undefined;
      return true;
    };
    timer = setTimeout(() => {
      rejectUnavailable();
    }, CONNECT_TIMEOUT_MS);
    try {
      const builder = builderFactory()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((connection) => {
          if (settle(() => resolve(connection))) pendingConnection = undefined;
          else disconnectSilently(connection);
        })
        .onConnectError(() => rejectUnavailable());
      const builtConnection = builder.build();
      if (failed) disconnectSilently(builtConnection);
      else if (!settled) pendingConnection = builtConnection;
    } catch {
      rejectUnavailable();
    }
  });
}

type NotificationGatedReconnectDependencies = Readonly<{
  refreshNotificationAuthority: () => Promise<void>;
  waitForNotification?: typeof requireNotificationBeforeAdmission;
  requestToken?: typeof requestAdminToken;
  connectToDatabase?: typeof connect;
}>;

/**
 * Do not retain a privileged Spacetime connection or expiring admin JWT while
 * notification delivery settles. Fresh database authority is minted only after
 * provider acceptance and immediately before the exact request-CAS recheck.
 */
export async function reconnectAfterAdmissionNotification(
  input: Readonly<{
    connection: DbConnection;
    bridgeUrl: string;
    fid: bigint;
    notificationOperatorSecret: string | undefined;
    adminSecret: string;
    uri: string;
    database: string;
  }>,
  dependencies: NotificationGatedReconnectDependencies,
): Promise<DbConnection> {
  disconnectSilently(input.connection);
  // Keep a reconnect-bound check even when tests inject a notification waiter;
  // the production waiter additionally refreshes immediately before each POST.
  await dependencies.refreshNotificationAuthority();
  await (
    dependencies.waitForNotification
    ?? requireNotificationBeforeAdmission
  )(
    input.bridgeUrl,
    input.fid,
    input.notificationOperatorSecret,
    undefined,
    undefined,
    dependencies.refreshNotificationAuthority,
  );
  let freshToken = '';
  try {
    freshToken = await (
      dependencies.requestToken
      ?? requestAdminToken
    )(input.bridgeUrl, input.adminSecret);
    return await (
      dependencies.connectToDatabase
      ?? connect
    )(input.uri, input.database, freshToken);
  } finally {
    freshToken = '';
  }
}

export async function readStatus(
  connection: DbConnection,
  version: AlphaStatusVersion = 'v1',
  machineReadable = false,
  expectedResourceFounderCount?: bigint,
  emit = true,
) {
  if (version === 'v12') {
    const status = await withOperationTimeout(connection.procedures.adminGetWorkerSystemStatusV1({}));
    const verified = projectWorkerSystemStatusV12(status);
    if (emit) console.log(JSON.stringify(printable(verified)));
    return verified;
  }
  if (version === 'v10') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV10({}));
    const verified = projectAlphaStatusV10(status);
    if (emit) console.log(JSON.stringify(printable(verified)));
    return verified;
  }
  if (version === 'v8') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV8({}));
    const verified = projectAlphaStatusV8(status);
    if (emit) console.log(JSON.stringify(printable(verified)));
    return verified;
  }
  if (version === 'v4') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV4({}));
    const safeStatus = {
      allowedFids: status.allowedFids,
      castles: status.castles,
      markAccounts: status.markAccounts,
      resourceAccounts: status.resourceAccounts,
      missingResourceAccounts: status.missingResourceAccounts,
      orphanedResourceAccounts: status.orphanedResourceAccounts,
      resourceInvariantViolations: status.resourceInvariantViolations,
      protocolVersion: status.protocolVersion,
      resourcePolicyVersion: status.resourcePolicyVersion,
    };
    const verifiedStatus = expectedResourceFounderCount === undefined
      ? safeStatus
      : verifyExpectedResourceAggregateV4(safeStatus, expectedResourceFounderCount);
    if (emit) console.log(JSON.stringify(printable(verifiedStatus)));
    return verifiedStatus;
  }
  if (version === 'v3') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV3({}));
    const safeStatus = {
      worldTiles: status.worldTiles,
      occupiedWorldTiles: status.occupiedWorldTiles,
      worldTileMeta: status.worldTileMeta,
      realms: status.realms,
      castleSlots: status.castleSlots,
      castleSlotClaims: status.castleSlotClaims,
      legacyPlayers: status.legacyPlayers,
      playersV2: status.playersV2,
      playerOwnershipsV2: status.playerOwnershipsV2,
      castles: status.castles,
      realmProfiles: status.realmProfiles,
      markAccounts: status.markAccounts,
      snapBurnCredits: status.snapBurnCredits,
      walletAttributions: status.walletAttributions,
      walletAttributionSnapshots: status.walletAttributionSnapshots,
      scanCursors: status.scanCursors,
      scanBatches: status.scanBatches,
      alphaTermsAcceptances: status.alphaTermsAcceptances,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      auditEntries: status.auditEntries,
      orphanedPlayerRowsV2: status.orphanedPlayerRowsV2,
      orphanedOwnershipRowsV2: status.orphanedOwnershipRowsV2,
      orphanedCastleClaims: status.orphanedCastleClaims,
      orphanedCastles: status.orphanedCastles,
      orphanedRealmProfiles: status.orphanedRealmProfiles,
      orphanedMarkAccounts: status.orphanedMarkAccounts,
      orphanedBurnCredits: status.orphanedBurnCredits,
      orphanedTermsAcceptances: status.orphanedTermsAcceptances,
      founderStateGaps: status.founderStateGaps,
      markAccountInvariantViolations: status.markAccountInvariantViolations,
      publicMarkProjectionViolations: status.publicMarkProjectionViolations,
      duplicateBurnReferences: status.duplicateBurnReferences,
      burnAccountReconciliationViolations: status.burnAccountReconciliationViolations,
      ambiguousActiveWalletAddresses: status.ambiguousActiveWalletAddresses,
      staticWorldDriftViolations: status.staticWorldDriftViolations,
      termsAcceptanceInvariantViolations: status.termsAcceptanceInvariantViolations,
      protocolVersion: status.protocolVersion,
      worldSeed: status.worldSeed,
      worldSeedName: status.worldSeedName,
    };
    if (emit) console.log(JSON.stringify(printable(safeStatus)));
    return Object.freeze(safeStatus);
  }
  if (version === 'v2') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV2({}));
    const safeStatus = {
      worldTiles: status.worldTiles,
      legacyPlayers: status.legacyPlayers,
      playersV2: status.playersV2,
      playerOwnershipsV2: status.playerOwnershipsV2,
      consistentPlayerPairsV2: status.consistentPlayerPairsV2,
      orphanedPlayerRowsV2: status.orphanedPlayerRowsV2,
      orphanedOwnershipRowsV2: status.orphanedOwnershipRowsV2,
      castles: status.castles,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      auditEntries: status.auditEntries,
      protocolVersion: status.protocolVersion,
      worldSeed: status.worldSeed,
      worldSeedName: status.worldSeedName,
    };
    console.log(JSON.stringify(printable(safeStatus)));
    return;
  }

  const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatus({}));
  if (machineReadable) {
    // Keep the verifier contract deliberately narrow: it needs aggregate
    // activation state, never audit records, targets, identities, or tokens.
    console.log(JSON.stringify(printable({
      worldTiles: status.worldTiles,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      players: status.players,
      castles: status.castles,
    })));
    return;
  }
  console.log(JSON.stringify(printable(status)));
}

type LegacyFounderAdmissionAuthorityCheckpoint = Readonly<{
  mode: 'legacy';
  world: GenesisExpansionStatusV3;
  resources: ResourceAggregateV4;
}>;

type GreaterRealmFounderAdmissionAuthorityCheckpoint = Readonly<{
  mode: 'greater-realm';
  status: Readonly<AdminGreaterRealmCutoverStatusV1>;
}>;

type FounderAdmissionAuthorityCheckpoint =
  | LegacyFounderAdmissionAuthorityCheckpoint
  | GreaterRealmFounderAdmissionAuthorityCheckpoint;

type LegacyFounderReenableAuthorityCheckpoint = Readonly<{
  mode: 'legacy';
  checkpoint: ReturnType<typeof verifyFounderReenablePrecondition>;
}>;

type GreaterRealmFounderReenableAuthorityCheckpoint = Readonly<{
  mode: 'greater-realm';
  checkpoint: GreaterRealmReenableCheckpoint;
}>;

type FounderReenableAuthorityCheckpoint =
  | LegacyFounderReenableAuthorityCheckpoint
  | GreaterRealmFounderReenableAuthorityCheckpoint;

async function readGreaterRealmCutoverStatus(
  connection: DbConnection,
): Promise<AdminGreaterRealmCutoverStatusV1> {
  return withOperationTimeout(
    connection.procedures.adminGetGreaterRealmCutoverStatusV1({}),
  );
}

async function readGreaterRealmReenableStatus(
  connection: DbConnection,
  fid: bigint,
): Promise<AdminGreaterRealmReenableStatusV1> {
  return withOperationTimeout(
    connection.procedures.adminGetGreaterRealmReenableStatusV1({ fid }),
  );
}

function requireUnchangedFounderAuthorityMode(
  initial: FounderAdmissionAuthorityMode,
  current: FounderAdmissionAuthorityMode,
): void {
  if (initial !== current) {
    fail('Founder admission authority mode changed; no mutation was submitted.');
  }
}

async function readFounderAdmissionAuthorityPrecondition(
  connection: DbConnection,
): Promise<FounderAdmissionAuthorityCheckpoint> {
  const cutover = await readGreaterRealmCutoverStatus(connection);
  const mode = selectFounderAdmissionAuthorityMode(cutover);
  if (mode === 'greater-realm') {
    return Object.freeze({
      mode,
      status: verifyGreaterRealmAdmissionPrecondition(cutover),
    });
  }
  const world = verifyFounderAdmissionPreconditionV3(
    await readStatus(connection, 'v3', false, undefined, false) as GenesisExpansionStatusV3,
  );
  const resources = verifyFounderAdmissionResourcePreconditionV4(
    await readStatus(connection, 'v4', false, undefined, false) as ResourceAggregateV4,
    world.allowedFids,
  );
  return Object.freeze({ mode, world, resources });
}

async function verifyFounderAdmissionAuthorityPostcondition(
  connection: DbConnection,
  before: FounderAdmissionAuthorityCheckpoint,
): Promise<void> {
  const cutover = await readGreaterRealmCutoverStatus(connection);
  const mode = selectFounderAdmissionAuthorityMode(cutover);
  requireUnchangedFounderAuthorityMode(before.mode, mode);
  if (before.mode === 'greater-realm') {
    verifyGreaterRealmAdmissionPostcondition(cutover, before.status);
    return;
  }
  verifyFounderAdmissionPostconditionV3(
    await readStatus(connection, 'v3', false, undefined, false) as GenesisExpansionStatusV3,
    before.world,
  );
  verifyFounderAdmissionResourcePostconditionV4(
    await readStatus(connection, 'v4', false, undefined, false) as ResourceAggregateV4,
    before.resources,
  );
}

async function readFounderReenableAuthorityPrecondition(
  connection: DbConnection,
  fid: bigint,
  target: AccessRequestAdmissionStatus,
): Promise<FounderReenableAuthorityCheckpoint> {
  const cutover = await readGreaterRealmCutoverStatus(connection);
  const mode = selectFounderAdmissionAuthorityMode(cutover);
  if (mode === 'greater-realm') {
    return Object.freeze({
      mode,
      checkpoint: verifyGreaterRealmReenablePreconditionV1(
        cutover,
        await readGreaterRealmReenableStatus(connection, fid),
        target,
      ),
    });
  }
  return Object.freeze({
    mode,
    checkpoint: verifyFounderReenablePrecondition(
      await readStatus(connection, 'v3', false, undefined, false) as GenesisExpansionStatusV3,
      await readStatus(connection, 'v4', false, undefined, false) as ResourceAggregateV4,
      target,
    ),
  });
}

async function verifyFounderReenableAuthorityPostcondition(
  connection: DbConnection,
  fid: bigint,
  target: AccessRequestAdmissionStatus,
  before: FounderReenableAuthorityCheckpoint,
): Promise<void> {
  const cutover = await readGreaterRealmCutoverStatus(connection);
  const mode = selectFounderAdmissionAuthorityMode(cutover);
  requireUnchangedFounderAuthorityMode(before.mode, mode);
  if (before.mode === 'greater-realm') {
    verifyGreaterRealmReenablePostconditionV1(
      cutover,
      await readGreaterRealmReenableStatus(connection, fid),
      target,
      before.checkpoint,
    );
    return;
  }
  verifyFounderReenablePostcondition(
    await readStatus(connection, 'v3', false, undefined, false) as GenesisExpansionStatusV3,
    await readStatus(connection, 'v4', false, undefined, false) as ResourceAggregateV4,
    target,
    before.checkpoint,
  );
}

async function main() {
  const {
    command,
    positional,
    dryRun,
    confirmedByFlag,
    inspection,
    machineReadableInspection,
    privateInputStdin,
    accessRequestList,
    accessRequestCensusAdmissionFreezeAttestation,
  } = parseHermesArguments();
  requireGenesis001AdmissionOperatorCommandEnabled(command);
  const capturedTrustedLaunch = captureTrustedHermesLaunch(trustedHermesReleaseRow({
    command,
    dryRun,
  }));
  // This checked-in literal is the durable delivery side of the coordinated
  // notification release envelope. It becomes true before the separately
  // canary-bound activation-client release. False is a complete mutation
  // blackout: it
  // is checked before credentials, bridge delivery, administrator-token
  // issuance, database connection, reviewed-plan access or claim, and either
  // admission reducer. It must never become a skip-delivery path.
  if ((command === 'admit-founder' || command === 'allow-fid') && !dryRun) {
    requireFounderAdmissionNotificationDeliveryApproval(command);
  }
  const trustedLaunch = validateTrustedHermesLaunch(capturedTrustedLaunch);
  let notificationPagesLiveAuthority:
    HermesNotificationPagesLiveAuthority | undefined;
  const readNotificationPagesLiveAuthority = async (
    required: boolean,
    refresh = false,
  ): Promise<HermesNotificationPagesLiveAuthority> => {
    if (
      !refresh
      &&
      notificationPagesLiveAuthority !== undefined
      && (
        !required
        || notificationPagesLiveAuthority.notificationPagesLiveReceiptDigest !== null
      )
    ) return notificationPagesLiveAuthority;
    notificationPagesLiveAuthority =
      await inspectHermesNotificationPagesLiveAuthority({
        required,
        ...(trustedLaunch?.protectedCommit === undefined
          ? {}
          : { pagesSourceCommit: trustedLaunch.protectedCommit }),
      });
    return notificationPagesLiveAuthority;
  };
  const legacyNotificationOperatorSecret = process.env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET;
  delete process.env.WARPKEEP_NOTIFICATION_OPERATOR_SECRET;
  const readCommandNotificationSecret = () => readNotificationOperatorSecret(
    trustedLaunch?.notificationSecretPath === undefined
      ? legacyNotificationOperatorSecret
      : readTrustedHermesSecret(trustedLaunch.notificationSecretPath),
  );
  const privateInspectionOutput = machineReadableInspection
    || command === 'list-pending-access-requests'
    || command === 'export-access-request-census';
  configureHermesMachineOutput(
    privateInspectionOutput || command === 'inspect-admission-notification',
  );
  if (command === 'inspect-admission-notification') {
    const bridgeUrl = readHttpsUrl(
      process.env.WARPKEEP_AUTH_BRIDGE_URL,
      'WARPKEEP_AUTH_BRIDGE_URL',
    );
    requireAdmissionNotificationInspectionProductionTarget(bridgeUrl);
    await readNotificationPagesLiveAuthority(false);
    const diagnostics = await inspectAdmissionNotification(
      bridgeUrl,
      readFid(positional[1]),
      readCommandNotificationSecret(),
    );
    console.log(JSON.stringify(diagnostics));
    return;
  }
  // Durable data migrations and new founder admission always require a visible
  // command-line confirmation.
  // The legacy noninteractive switch remains available to older bounded
  // operators, but cannot silently authorize those durable transitions.
  const confirmed = confirmedByFlag || (
    command !== 'backfill-resources'
    && command !== 'expand-world-v3'
    && command !== 'reset-access-request'
    && command !== 'recover-admission-notification'
    && command !== 'admit-founder'
    && command !== 'seed-alpha-component'
    && command !== 'activate-alpha-water'
    && process.env.WARPKEEP_HERMES_NONINTERACTIVE === 'yes'
  );
  const mutation = !inspection;
  // The public alias no longer resolves consistently through the current SDK.
  // Read-only inspection can safely default to the immutable production
  // identity. Durable mutations preserve the explicit-target safety boundary.
  const database = readDatabase(
    process.env.WARPKEEP_SPACETIMEDB_DATABASE,
    inspection || command === 'export-access-request-census'
      ? DEFAULT_DATABASE_IDENTITY
      : LEGACY_DATABASE_ALIAS,
  );
  const uri = readHttpsUrl(process.env.WARPKEEP_SPACETIMEDB_URI || DEFAULT_URI, 'WARPKEEP_SPACETIMEDB_URI');

  let fid = command === 'allow-fid'
    || command === 'disable-fid'
    || command === 'bump-auth-epoch'
    || command === 'inspect-access-request-reset'
    || (command === 'reset-access-request' && dryRun)
    || (command === 'recover-admission-notification' && dryRun)
    ? readFid(positional[1])
    : undefined;
  const expectedFounderCount = command === 'backfill-resources'
    ? readFounderCount(positional[1])
    : undefined;
  const alphaComponent: SeedableAlphaComponent | undefined = command === 'seed-alpha-component'
    ? parseSeedableAlphaComponent(positional[1])
    : undefined;
  let note = command === 'allow-fid'
    || command === 'disable-fid'
    || (command === 'reset-access-request' && dryRun)
    || (command === 'recover-admission-notification' && dryRun)
    ? sanitizeNote(positional[2])
    : command === 'bump-auth-epoch'
      ? sanitizeNote(positional[2], 'auth epoch rotation')
      : undefined;
  let admissionProfile: AdmissionReadyTrustedProfile | undefined;
  let admissionPlan: ReviewedFounderAdmissionPlan | undefined;
  let admissionPlanReference: ReviewedFounderAdmissionPlanReference | undefined;
  let accessRequestResetPlan: ReviewedAccessRequestResetPlan | undefined;
  let accessRequestResetPlanReference: ReviewedAccessRequestResetPlanReference | undefined;
  let notificationRecoveryPlan: ReviewedAdmissionNotificationRecoveryPlan | undefined;
  let notificationRecoveryPlanReference:
    ReviewedAdmissionNotificationRecoveryPlanReference | undefined;

  if (command === 'admit-founder') {
    // The target is fixed before reading sensitive stdin. A plan can never be
    // created for a configurable lookalike and later consumed in production.
    requireCredentialedProductionTarget(uri, database, DEFAULT_BRIDGE);
    requireFounderAdmissionProductionTarget(database);
    const liveAuthority = await readNotificationPagesLiveAuthority(!dryRun);
    const privateInput = trustedLaunch?.privateInputPath === undefined
      ? await readPrivateFounderAdmissionInput()
      : readTrustedFounderAdmissionInput(trustedLaunch.privateInputPath);
    if (dryRun) {
      const request = parsePrivateFounderAdmissionRequest(privateInput);
      const profile = await resolveAdmissionReadyFounderProfile(request.fid);
      const plan = createReviewedFounderAdmissionPlan({
        sourceConfigurationDigest: FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
        targetConfigurationDigest: FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
        profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
        profileSourceUseApproval: request.profileSourceUseApproval,
        notificationPagesLiveAuthority: liveAuthority,
        fid: request.fid,
        note: request.note,
        profile,
      });
      const reference = writeReviewedFounderAdmissionPlan({
        plan,
        ...(trustedLaunch === undefined
          ? {}
          : { directory: trustedLaunch.founderPlanDirectory }),
      });
      console.log(JSON.stringify(Object.freeze({
        ...admissionReadinessSummary(profile),
        reviewedAdmissionPlan: Object.freeze({
          filename: reference.filename,
          sha256: reference.sha256,
        }),
        reviewedPlanExpiresAt: reference.expiresAt,
        reviewedPlanLifetimeMinutes:
          REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS / 60_000,
      })));
      return;
    }
    admissionPlanReference = parseReviewedFounderAdmissionPlanReference(privateInput);
    admissionPlan = readReviewedFounderAdmissionPlan({
      reference: admissionPlanReference,
      ...(trustedLaunch === undefined
        ? {}
        : { directory: trustedLaunch.founderPlanDirectory }),
      expectedSourceConfigurationDigest: FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
      expectedTargetConfigurationDigest: FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
      expectedProfilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
    });
    if (!sameHermesNotificationPagesLiveAuthority(
      admissionPlan,
      liveAuthority,
    )) {
      fail('Reviewed founder admission plan uses a different notification release.');
    }
    fid = BigInt(admissionPlan.fid);
    note = admissionPlan.note;
    admissionProfile = admissionPlan.profile;
  }

  if (command === 'reset-access-request' && !dryRun) {
    accessRequestResetPlanReference = parseReviewedAccessRequestResetPlanReference({
      reviewedAccessRequestResetPlan: {
        filename: positional[1],
        sha256: positional[2],
      },
    });
    accessRequestResetPlan = readReviewedAccessRequestResetPlan({
      reference: accessRequestResetPlanReference,
      expectedTargetConfigurationDigest: ACCESS_REQUEST_RESET_TARGET_CONFIGURATION_DIGEST,
    });
    fid = BigInt(accessRequestResetPlan.fid);
    note = accessRequestResetPlan.note;
  }

  if (command === 'recover-admission-notification' && !dryRun) {
    notificationRecoveryPlanReference =
      parseReviewedAdmissionNotificationRecoveryPlanReference({
        reviewedAdmissionNotificationRecoveryPlan: {
          filename: positional[1],
          sha256: positional[2],
        },
      });
    notificationRecoveryPlan = readReviewedAdmissionNotificationRecoveryPlan({
      reference: notificationRecoveryPlanReference,
      ...(trustedLaunch === undefined
        ? {}
        : { directory: trustedLaunch.notificationRecoveryPlanDirectory }),
      expectedTargetConfigurationDigest:
        ADMISSION_NOTIFICATION_RECOVERY_TARGET_CONFIGURATION_DIGEST,
    });
    fid = BigInt(notificationRecoveryPlan.fid);
    note = notificationRecoveryPlan.note;
  }

  if (command === 'expand-world-v3') {
    requireGenesisExpansionProductionTarget(database);
  }
  if (
    command === 'list-access-requests'
    || command === 'list-pending-access-requests'
    || command === 'export-access-request-census'
  ) {
    requireAccessRequestInspectionProductionTarget(database);
  }
  if (command === 'reset-access-request' || command === 'inspect-access-request-reset') {
    requireAccessRequestResetProductionTarget(database);
  }
  if (command === 'recover-admission-notification') {
    requireFounderAdmissionProductionTarget(database);
  }

  if ((command === 'seed-alpha-component' || command === 'activate-alpha-water') && !dryRun) {
    requireAlphaComponentActivationProductionTarget(database);
  }

  if (!privateInspectionOutput && !(command === 'admit-founder' && dryRun)) {
    console.log(`Warpkeep Hermes target: ${database} at ${uri}`);
  }
  if (command === 'allow-fid') {
    console.log('Warpkeep Hermes scope: existing complete founder re-enable only.');
  }

  // Profiled admission cannot inherit the legacy noninteractive switch. The
  // confirmed path consumes only an already reviewed plan and never refetches.
  if (command === 'admit-founder' && !dryRun && !confirmed) {
    fail('Refusing profiled admission without --confirm.');
  }
  if (command === 'seed-alpha-component' && !dryRun && !confirmed) {
    fail('Refusing Alpha component seed without --confirm.');
  }
  if (command === 'activate-alpha-water' && !dryRun && !confirmed) {
    fail('Refusing Water activation without --confirm.');
  }
  if (command === 'reset-access-request' && !dryRun && !confirmed) {
    fail('Refusing access request reset without --confirm.');
  }
  if (command === 'recover-admission-notification' && !dryRun && !confirmed) {
    fail('Refusing admission notification recovery without --confirm.');
  }

  let prevalidatedBridgeUrl: string | undefined;
  if (command === 'admit-founder' && !dryRun) {
    prevalidatedBridgeUrl = readHttpsUrl(
      process.env.WARPKEEP_AUTH_BRIDGE_URL,
      'WARPKEEP_AUTH_BRIDGE_URL',
    );
    requireCredentialedProductionTarget(uri, database, prevalidatedBridgeUrl);
  }
  if (
    dryRun
    && command !== 'reset-access-request'
    && command !== 'recover-admission-notification'
    && command !== 'export-access-request-census'
  ) {
    if (command === 'allow-fid') {
      await readNotificationPagesLiveAuthority(false);
    }
    console.log(JSON.stringify(printable({
      command,
      fid,
      note,
      expectedFounderCount,
      expectedWorldTiles: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_WORLD_CELLS
        : undefined,
      expectedWorldTileMeta: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_WORLD_CELLS
        : undefined,
      expectedGenerationVersion: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_VERSION
        : undefined,
      targetWorldTiles: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V3_WORLD_CELLS
        : undefined,
      resourcePolicyVersion: command === 'backfill-resources'
        ? GENESIS_RESOURCE_POLICY_VERSION
        : undefined,
      alphaComponent,
      alphaComponentPolicy: alphaComponent === undefined
        ? undefined
        : alphaComponent === 'water' || alphaComponent === 'stone'
          ? ALPHA_V10_ACTIVATION_COMPONENTS[alphaComponent]
          : ALPHA_ACTIVATION_COMPONENTS[alphaComponent],
      alphaStatusInspected: command === 'seed-alpha-component'
        || command === 'activate-alpha-water' ? false : undefined,
      credentialsAccessed: command === 'seed-alpha-component'
        || command === 'activate-alpha-water' ? false : undefined,
      mutationSubmitted: command === 'seed-alpha-component'
        || command === 'activate-alpha-water' ? false : undefined,
      existingFounderReenableOnly: command === 'allow-fid' || undefined,
      mutation,
      dryRun: true,
    })));
    return;
  }
  if (
    mutation
    && !confirmed
    && !(command === 'reset-access-request' && dryRun)
    && !(command === 'recover-admission-notification' && dryRun)
  ) {
    fail(
      command === 'backfill-resources' || command === 'expand-world-v3'
        || command === 'reset-access-request'
        || command === 'recover-admission-notification'
        || command === 'seed-alpha-component' || command === 'activate-alpha-water'
        ? 'Refusing mutation without --confirm.'
        : 'Refusing mutation without --confirm (or WARPKEEP_HERMES_NONINTERACTIVE=yes).',
    );
  }
  if (command === 'backfill-resources') {
    requireResourceBackfillProductionTarget(database);
  }

  const bridgeUrl = prevalidatedBridgeUrl
    ?? readHttpsUrl(process.env.WARPKEEP_AUTH_BRIDGE_URL, 'WARPKEEP_AUTH_BRIDGE_URL');
  requireCredentialedProductionTarget(uri, database, bridgeUrl);
  if (
    command === 'allow-fid'
    || command === 'recover-admission-notification'
  ) {
    const liveAuthority = await readNotificationPagesLiveAuthority(!dryRun);
    if (
      command === 'recover-admission-notification'
      && !dryRun
      && notificationRecoveryPlan !== undefined
      && !sameHermesNotificationPagesLiveAuthority(
        notificationRecoveryPlan,
        liveAuthority,
      )
    ) {
      fail('Reviewed notification recovery plan uses a different notification release.');
    }
  }
  if (
    (command === 'reset-access-request' || command === 'recover-admission-notification')
    && process.env.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined
  ) {
    fail(
      command === 'reset-access-request'
        ? 'Access request reset refuses an administrator secret from the environment.'
        : 'Admission notification recovery refuses an administrator secret from the environment.',
    );
  }
  const secret = trustedLaunch?.adminSecretPath === undefined
    ? readAdminSecret(
        command === 'reset-access-request' || command === 'recover-admission-notification'
          ? undefined
          : process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
        (command === 'reset-access-request' || command === 'recover-admission-notification')
          && privateInputStdin
          && process.env.WARPKEEP_ADMIN_TOKEN_SECRET_FD === undefined
          ? '1'
          : process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN,
      )
    : readTrustedHermesSecret(trustedLaunch.adminSecretPath);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET_FD;
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN;
  let token = await requestAdminToken(bridgeUrl, secret);
  let connection: DbConnection;
  try {
    connection = await connect(uri, database, token);
  } finally {
    // The connected SDK transport owns its authenticated session. Do not keep
    // a second immutable JWT alive while the operator performs checks.
    token = '';
  }
  let founderAdmissionClaimed = false;
  let accessRequestResetClaimed = false;
  let notificationRecoveryClaimed = false;
  try {
    let mutationStatusHandled = false;
    if (command === 'export-access-request-census') {
      const census = await collectAccessRequestCensus(
        connection,
        accessRequestCensusAdmissionFreezeAttestation ?? '',
      );
      if (dryRun) {
        inspectAccessRequestCensus({ census });
      } else {
        const productionAdminHome = canonicalProductionAdminAccountHome();
        const result = writeAccessRequestCensusExport({
          censusDirectory: join(productionAdminHome, 'Desktop'),
          referenceDirectory: join(
            productionAdminHome,
            ...ACCESS_REQUEST_CENSUS_PRIVATE_REFERENCE_DIRECTORY,
          ),
          census,
        });
        console.log(JSON.stringify(result));
      }
      mutationStatusHandled = true;
    } else if (command === 'list-pending-access-requests') {
      if (
        trustedLaunch?.row !== 'list-pending'
        || trustedLaunch.protectedCommit === undefined
        || trustedLaunch.pendingCensusDirectory === undefined
      ) fail('Pending access request census requires the exact trusted bootstrap.');
      const census = await collectPendingAccessRequestCensus(
        connection,
        trustedLaunch.protectedCommit,
      );
      const reference = writePendingAccessRequestCensus({
        directory: trustedLaunch.pendingCensusDirectory,
        census,
      });
      console.log(JSON.stringify(Object.freeze({
        pendingAccessRequestCensus: reference,
        advisoryOnly: true,
        admissionMustRecheckRequestCas: true,
      })));
      mutationStatusHandled = true;
    } else if (command === 'list-access-requests') {
      await listAccessRequests(
        connection,
        accessRequestList,
        machineReadableInspection,
      );
      mutationStatusHandled = true;
    } else if (
      command === 'recover-admission-notification'
      && fid !== undefined
      && note !== undefined
    ) {
      const targetBefore = requirePendingAdmissionRequest(
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        'missing',
      );
      const operatorSecret = readCommandNotificationSecret();
      const diagnosticsBefore = requireAdmissionNotificationRecoveryPrecondition(
        await inspectAdmissionNotification(
          bridgeUrl,
          fid,
          operatorSecret,
        ),
        targetBefore.requestedAtMicros,
      );
      const notificationStateDigest = admissionNotificationRecoveryStateDigest(
        diagnosticsBefore,
      );
      if (dryRun) {
        const plan = createReviewedAdmissionNotificationRecoveryPlan({
          targetConfigurationDigest:
            ADMISSION_NOTIFICATION_RECOVERY_TARGET_CONFIGURATION_DIGEST,
          notificationPagesLiveAuthority:
            notificationPagesLiveAuthority
            ?? await readNotificationPagesLiveAuthority(false),
          fid,
          note,
          expectedRequestedAtMicros: targetBefore.requestedAtMicros,
          expectedNotificationStateDigest: notificationStateDigest,
        });
        const reference = writeReviewedAdmissionNotificationRecoveryPlan({
          plan,
          ...(trustedLaunch === undefined
            ? {}
            : { directory: trustedLaunch.notificationRecoveryPlanDirectory }),
        });
        console.log(JSON.stringify({
          admissionNotificationRecoveryPlan: {
            status: diagnosticsBefore.status,
            generation: diagnosticsBefore.generation,
            requestedAtMicros: targetBefore.requestedAtMicros.toString(),
            recoveryCount: diagnosticsBefore.recoveryCount,
            reviewedPlan: {
              filename: reference.filename,
              sha256: reference.sha256,
            },
            expiresAt: reference.expiresAt,
            lifetimeMinutes:
              REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS / 60_000,
            admissionState: targetBefore.admissionState,
            admissionMutationSubmitted: false,
            notificationRecoverySubmitted: false,
          },
        }));
        mutationStatusHandled = true;
      } else {
        if (
          notificationRecoveryPlan === undefined
          || notificationRecoveryPlanReference === undefined
        ) fail('Confirmed admission notification recovery requires one reviewed plan.');
        if (
          notificationRecoveryPlan.fid !== fid.toString()
          || notificationRecoveryPlan.expectedRequestedAtMicros
            !== targetBefore.requestedAtMicros.toString()
          || notificationRecoveryPlan.expectedNotificationStateDigest
            !== notificationStateDigest
        ) {
          fail(
            'Reviewed admission notification recovery plan no longer matches current state. '
            + 'No recovery request or admission mutation was submitted.',
          );
        }
        await readNotificationPagesLiveAuthority(true, true);
        claimReviewedAdmissionNotificationRecoveryPlan({
          plan: notificationRecoveryPlan,
          sha256: notificationRecoveryPlanReference.sha256,
          ...(trustedLaunch === undefined
            ? {}
            : { directory: trustedLaunch.notificationRecoveryPlanDirectory }),
        });
        notificationRecoveryClaimed = true;
        const recoveryStatus = await requestAdmissionNotificationRecovery(
          bridgeUrl,
          fid,
          targetBefore.requestedAtMicros,
          notificationRecoveryPlan.planId,
          operatorSecret,
        );
        const targetAfter = requireUnchangedPendingAdmissionRequest(
          targetBefore,
          projectAccessRequestAdmissionStatus(
            await withOperationTimeout(
              connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
            ),
          ),
          'missing',
        );
        const diagnosticsAfter = await inspectAdmissionNotification(
          bridgeUrl,
          fid,
          operatorSecret,
        );
        if (
          targetAfter.requestedAtMicros !== targetBefore.requestedAtMicros
          || diagnosticsAfter.generation !== 'pending-request'
          || diagnosticsAfter.requestedAtMicros !== Number(targetBefore.requestedAtMicros)
          || diagnosticsAfter.recoveryCount !== (
            recoveryStatus === 'not-subscribed' ? 0 : 1
          )
          || (diagnosticsAfter.lastRecoveryAt === undefined)
            !== (recoveryStatus === 'not-subscribed')
          || (recoveryStatus === 'already-sent' && diagnosticsAfter.status !== 'already-sent')
        ) {
          throw new HermesClaimedAdmissionNotificationRecoveryOutcomeError();
        }
        notificationRecoveryClaimed = false;
        console.log(JSON.stringify({
          admissionNotificationRecovery: {
            status: recoveryStatus,
            observedStatus: diagnosticsAfter.status,
            generation: diagnosticsAfter.generation,
            requestedAtMicros: targetAfter.requestedAtMicros.toString(),
            recoveryCount: diagnosticsAfter.recoveryCount,
            admissionState: targetAfter.admissionState,
            admissionMutationSubmitted: false,
            pendingRequestUnchanged: true,
            safeToRetryAdmission: diagnosticsAfter.status === 'already-sent',
          },
        }));
        mutationStatusHandled = true;
      }
    } else if (command === 'inspect-access-request-reset' && fid !== undefined) {
      const status = projectAccessRequestResetStatus(
        await withOperationTimeout(
          connection.procedures.adminGetAccessRequestResetStatusV1({ fid }),
        ),
      );
      console.log(JSON.stringify({
        accessRequestResetStatus: {
          fid: fid.toString(),
          admissionState: status.admissionState,
          authEpoch: status.authEpoch,
          requestState: status.requestState,
          applicationPresent: status.requestCycle !== undefined,
        },
      }));
      mutationStatusHandled = true;
    } else if (
      command === 'reset-access-request'
      && fid !== undefined
      && note !== undefined
    ) {
      const targetBefore = projectAccessRequestResetStatus(
        await withOperationTimeout(
          connection.procedures.adminGetAccessRequestResetStatusV1({ fid }),
        ),
      );
      if (dryRun) {
        const plan = createReviewedAccessRequestResetPlan({
          targetConfigurationDigest: ACCESS_REQUEST_RESET_TARGET_CONFIGURATION_DIGEST,
          fid,
          note,
          expectedEnabled: targetBefore.admissionState === 'enabled',
          expectedAuthEpoch: targetBefore.authEpoch,
          expectedRequestCycle: targetBefore.requestCycle,
          expectedRequestedAtMicros: targetBefore.requestedAtMicros,
        });
        const reference = writeReviewedAccessRequestResetPlan({ plan });
        console.log(JSON.stringify({
          accessRequestResetPlan: {
            fid: fid.toString(),
            admissionState: targetBefore.admissionState,
            requestState: targetBefore.requestState,
            applicationPresent: targetBefore.requestCycle !== undefined,
            reviewedPlan: {
              filename: reference.filename,
              sha256: reference.sha256,
            },
            expiresAt: reference.expiresAt,
            lifetimeMinutes: REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS / 60_000,
            credentialsAccessed: true,
            mutationSubmitted: false,
          },
        }));
        mutationStatusHandled = true;
      } else {
        if (
          accessRequestResetPlan === undefined
          || accessRequestResetPlanReference === undefined
        ) fail('Confirmed access request reset requires one reviewed plan.');
        const plannedStatus = projectAccessRequestResetStatus({
          admissionState: accessRequestResetPlan.expectedEnabled ? 'enabled' : 'disabled',
          authEpoch: accessRequestResetPlan.expectedAuthEpoch,
          requestState: accessRequestResetPlan.expectedRequestCycle === null
            ? 'not_requested'
            : !accessRequestResetPlan.expectedEnabled
              && BigInt(accessRequestResetPlan.expectedRequestCycle)
                === BigInt(accessRequestResetPlan.expectedAuthEpoch) + 1n
              ? 'pending'
              : 'resolved',
          requestCycle: accessRequestResetPlan.expectedRequestCycle === null
            ? undefined
            : BigInt(accessRequestResetPlan.expectedRequestCycle),
          requestedAtMicros: accessRequestResetPlan.expectedRequestedAtMicros === null
            ? undefined
            : BigInt(accessRequestResetPlan.expectedRequestedAtMicros),
        });
        if (
          targetBefore.admissionState !== plannedStatus.admissionState
          || targetBefore.authEpoch !== plannedStatus.authEpoch
          || targetBefore.requestState !== plannedStatus.requestState
          || targetBefore.requestCycle !== plannedStatus.requestCycle
          || targetBefore.requestedAtMicros !== plannedStatus.requestedAtMicros
        ) {
          fail(
            'Reviewed access request reset plan no longer matches current state. '
            + 'No mutation was submitted.',
          );
        }
      const beforeV3 = await readStatus(
        connection,
        'v3',
        false,
        undefined,
        false,
      ) as GenesisExpansionStatusV3;
      const beforeV4 = await readStatus(
        connection,
        'v4',
        false,
        undefined,
        false,
      ) as ResourceAggregateV4;
      claimReviewedAccessRequestResetPlan({
        plan: accessRequestResetPlan,
        sha256: accessRequestResetPlanReference.sha256,
      });
      accessRequestResetClaimed = true;
      await withOperationTimeout(connection.reducers.adminResetAccessRequestV1({
        fid,
        expectedEnabled: plannedStatus.admissionState === 'enabled',
        expectedAuthEpoch: plannedStatus.authEpoch,
        expectedRequestCycle: plannedStatus.requestCycle,
        expectedRequestedAtMicros: plannedStatus.requestedAtMicros,
        note,
      }));
      const targetAfter = projectAccessRequestResetStatus(
        await withOperationTimeout(
          connection.procedures.adminGetAccessRequestResetStatusV1({ fid }),
        ),
      );
      if (
        targetAfter.admissionState !== 'disabled'
        || targetAfter.authEpoch !== targetBefore.authEpoch
        || targetAfter.requestState !== 'not_requested'
        || targetAfter.requestCycle !== undefined
        || targetAfter.requestedAtMicros !== undefined
      ) {
        fail(
          'Access request reset postcondition failed. '
          + 'Do not retry before a bounded read-only investigation.',
        );
      }
      verifyAccessRequestResetAggregatePreservation(
        beforeV3,
        await readStatus(connection, 'v3', false, undefined, false) as GenesisExpansionStatusV3,
        beforeV4,
        await readStatus(connection, 'v4', false, undefined, false) as ResourceAggregateV4,
        targetBefore,
      );
      accessRequestResetClaimed = false;
      console.log(JSON.stringify({
        accessRequestReset: {
          fid: fid.toString(),
          admissionState: targetAfter.admissionState,
          requestState: targetAfter.requestState,
          authEpochUnchanged: true,
          applicationWasPresent: targetBefore.requestCycle !== undefined,
          applicationDeleted: targetBefore.requestCycle !== undefined,
          applicationAbsentAfter: true,
          founderGameplayStatePreserved: true,
        },
      }));
      mutationStatusHandled = true;
      }
    } else if (
      command === 'inspect-publish-pre-v12'
      || command === 'inspect-publish-post-v12'
    ) {
      const protocolV3 = await readStatus(
        connection,
        'v3',
        false,
        undefined,
        false,
      );
      const resourceV4 = await readStatus(
        connection,
        'v4',
        false,
        undefined,
        false,
      );
      const envelope = command === 'inspect-publish-pre-v12'
        ? Object.freeze({
          protocolV3,
          resourceV4,
        })
        : Object.freeze({
          protocolV3,
          resourceV4,
          alphaV8: await readStatus(
            connection,
            'v8',
            false,
            undefined,
            false,
          ),
          alphaV10: await readStatus(
            connection,
            'v10',
            false,
            undefined,
            false,
          ),
          workerV12: await readStatus(
            connection,
            'v12',
            false,
            undefined,
            false,
          ),
        });
      console.log(JSON.stringify(printable(envelope)));
      mutationStatusHandled = true;
    } else if (command === 'expand-world-v3') {
      const before = verifyGenesisExpansionPreconditionV3(
        await readStatus(connection, 'v3') as GenesisExpansionStatusV3,
      );
      const beforeResources = verifyGenesisExpansionResourceCheckpointV4(
        await readStatus(connection, 'v4') as GenesisExpansionResourceStatusV4,
      );
      await withOperationTimeout(connection.reducers.adminExpandGenesisWorldV3({
        expectedWorldTiles: GENESIS_GENERATION_V2_WORLD_CELLS,
        expectedWorldTileMeta: GENESIS_GENERATION_V2_WORLD_CELLS,
        expectedGenerationVersion: GENESIS_GENERATION_V2_VERSION,
      }));
      verifyGenesisExpansionPostconditionV3(
        await readStatus(connection, 'v3') as GenesisExpansionStatusV3,
        before,
      );
      verifyGenesisExpansionResourcePreservationV4(
        await readStatus(connection, 'v4') as GenesisExpansionResourceStatusV4,
        beforeResources,
      );
      mutationStatusHandled = true;
    } else if (command === 'seed-world') {
      await withOperationTimeout(connection.reducers.adminSeedWorld({}));
    } else if (
      command === 'admit-founder'
      && fid !== undefined
      && note !== undefined
      && admissionProfile !== undefined
      && admissionPlan !== undefined
      && admissionPlanReference !== undefined
    ) {
      const initialTarget = requirePendingAdmissionRequest(
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        'missing',
      );
      const initialAuthority = await readFounderAdmissionAuthorityPrecondition(connection);
      normalizeAdmissionReadyTrustedProfile(admissionProfile);

      connection = await reconnectAfterAdmissionNotification({
        connection,
        bridgeUrl,
        fid,
        notificationOperatorSecret: readCommandNotificationSecret(),
        adminSecret: secret,
        uri,
        database,
      }, {
        refreshNotificationAuthority: async () => {
          await readNotificationPagesLiveAuthority(true, true);
        },
      });
      const freshTarget = requireUnchangedPendingAdmissionRequest(
        initialTarget,
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        'missing',
      );
      const beforeAuthority = await readFounderAdmissionAuthorityPrecondition(connection);
      requireUnchangedFounderAuthorityMode(initialAuthority.mode, beforeAuthority.mode);
      const freshAdmissionProfile = normalizeAdmissionReadyTrustedProfile(admissionProfile);
      await readNotificationPagesLiveAuthority(true, true);
      claimReviewedFounderAdmissionPlan({
        plan: admissionPlan,
        sha256: admissionPlanReference.sha256,
        ...(trustedLaunch === undefined
          ? {}
          : { directory: trustedLaunch.founderPlanDirectory }),
      });
      founderAdmissionClaimed = true;
      await withOperationTimeout(connection.reducers.adminAdmitFounderForAccessRequestV2({
        fid,
        note,
        expectedRequestCycle: freshTarget.requestCycle,
        expectedRequestedAtMicros: freshTarget.requestedAtMicros,
        canonicalUsername: freshAdmissionProfile.canonicalUsername,
        displayName: freshAdmissionProfile.displayName,
        pfpUrl: freshAdmissionProfile.pfpUrl,
        publicBio: freshAdmissionProfile.publicBio,
        profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
      }));
      verifyFounderAdmissionRequestPostcondition(
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        freshTarget,
      );
      await verifyFounderAdmissionAuthorityPostcondition(connection, beforeAuthority);
      founderAdmissionClaimed = false;
      mutationStatusHandled = true;
    } else if (command === 'allow-fid' && fid !== undefined && note !== undefined) {
      const initialTarget = projectAccessRequestAdmissionStatus(
        await withOperationTimeout(
          connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
        ),
      );
      const initialAuthority = await readFounderReenableAuthorityPrecondition(
        connection,
        fid,
        initialTarget,
      );
      connection = await reconnectAfterAdmissionNotification({
        connection,
        bridgeUrl,
        fid,
        notificationOperatorSecret: readCommandNotificationSecret(),
        adminSecret: secret,
        uri,
        database,
      }, {
        refreshNotificationAuthority: async () => {
          await readNotificationPagesLiveAuthority(true, true);
        },
      });
      const freshTarget = requireUnchangedPendingAdmissionRequest(
        initialTarget,
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        'disabled',
      );
      const beforeAuthority = await readFounderReenableAuthorityPrecondition(
        connection,
        fid,
        freshTarget,
      );
      requireUnchangedFounderAuthorityMode(initialAuthority.mode, beforeAuthority.mode);
      await readNotificationPagesLiveAuthority(true, true);
      await withOperationTimeout(connection.reducers.adminAllowFidForAccessRequestV1({
        fid,
        note,
        expectedRequestCycle: freshTarget.requestCycle,
        expectedRequestedAtMicros: freshTarget.requestedAtMicros,
      }));
      await verifyFounderReenableAuthorityPostcondition(
        connection,
        fid,
        projectAccessRequestAdmissionStatus(
          await withOperationTimeout(
            connection.procedures.adminGetAccessRequestAdmissionStatusV1({ fid }),
          ),
        ),
        beforeAuthority,
      );
      mutationStatusHandled = true;
    } else if (command === 'disable-fid' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminDisableFid({ fid, note }));
    } else if (command === 'bump-auth-epoch' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminBumpAuthEpoch({ fid, note }));
    } else if (command === 'backfill-resources' && expectedFounderCount !== undefined) {
      await withOperationTimeout(connection.reducers.adminBackfillResourceAccountsV1({
        expectedFounderCount,
        policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
      }));
    } else if (command === 'seed-alpha-component' && alphaComponent !== undefined) {
      if (alphaComponent === 'water' || alphaComponent === 'stone') {
        const before = await readStatus(
          connection,
          'v10',
          false,
          undefined,
          false,
        ) as AlphaStatusV10;
        if (!alphaV10ComponentIsReady(before, alphaComponent)) {
          if (alphaComponent === 'water') {
            await withOperationTimeout(connection.reducers.adminSeedGenesisWaterLayoutV1({}));
          } else {
            const policy = ALPHA_V10_ACTIVATION_COMPONENTS.stone;
            await withOperationTimeout(connection.reducers.adminSeedGenesisTierIStoneSitesV1({
              expectedSiteCount: BigInt(policy.siteCount),
              policyVersion: policy.sitePolicyVersion,
            }));
          }
        }
        const after = verifyAlphaV10SeedPostcondition(
          await readStatus(connection, 'v10', false, undefined, false) as AlphaStatusV10,
          before,
          alphaComponent,
        );
        console.log(JSON.stringify(printable(alphaV10ComponentSeedReceipt(
          alphaComponent,
          before,
          after,
        ))));
      } else {
        const before = verifyAlphaComponentSeedPrecondition(
          await readStatus(connection, 'v8', false, undefined, false) as AlphaStatusV8,
        );
        if (!alphaComponentIsReady(before, alphaComponent)) {
          if (alphaComponent === 'gold') {
            const policy = ALPHA_ACTIVATION_COMPONENTS.gold;
            await withOperationTimeout(connection.reducers.adminSeedGenesisTierIGoldSitesV1({
              expectedSiteCount: BigInt(policy.siteCount),
              policyVersion: policy.sitePolicyVersion,
            }));
          } else if (alphaComponent === 'forest') {
            await withOperationTimeout(connection.reducers.adminSeedGenesisForestLayoutV1({}));
          } else if (alphaComponent === 'food') {
            const policy = ALPHA_ACTIVATION_COMPONENTS.food;
            await withOperationTimeout(connection.reducers.adminSeedGenesisTierIFoodSitesV1({
              expectedSiteCount: BigInt(policy.siteCount),
              policyVersion: policy.sitePolicyVersion,
            }));
          } else {
            const policy = ALPHA_ACTIVATION_COMPONENTS.wood;
            await withOperationTimeout(connection.reducers.adminSeedGenesisTierIWoodSitesV1({
              expectedSiteCount: BigInt(policy.siteCount),
              policyVersion: policy.sitePolicyVersion,
            }));
          }
        }
        const after = verifyAlphaComponentSeedPostcondition(
          await readStatus(connection, 'v8', false, undefined, false) as AlphaStatusV8,
          before,
          alphaComponent,
        );
        console.log(JSON.stringify(printable(alphaComponentSeedReceipt(
          alphaComponent,
          before,
          after,
        ))));
      }
      mutationStatusHandled = true;
    } else if (command === 'activate-alpha-water') {
      const before = await readStatus(
        connection,
        'v10',
        false,
        undefined,
        false,
      ) as AlphaStatusV10;
      if (!alphaV10ComponentIsReady(before, 'water')) {
        throw new AlphaV10ActivationControlError(
          'Water must be exactly seeded before it can be activated.',
        );
      }
      if (!before.waterActivated) {
        await withOperationTimeout(connection.reducers.adminActivateGenesisWaterLayoutV1({}));
      }
      const after = verifyWaterActivationPostcondition(
        await readStatus(connection, 'v10', false, undefined, false) as AlphaStatusV10,
        before,
      );
      console.log(JSON.stringify(printable(waterActivationReceipt(before, after))));
      mutationStatusHandled = true;
    }
    const statusVersion: AlphaStatusVersion = command === 'inspect-alpha-v2'
      ? 'v2'
      : command === 'inspect-alpha-v3' || command === 'admit-founder'
        ? 'v3'
        : command === 'inspect-alpha-v4' || command === 'backfill-resources'
          ? 'v4'
          : command === 'inspect-alpha-v8'
            ? 'v8'
            : command === 'inspect-alpha-v10'
              ? 'v10'
              : command === 'inspect-alpha-v12'
                ? 'v12'
          : 'v1';
    if (!mutationStatusHandled) {
      await readStatus(
        connection,
        statusVersion,
        machineReadableInspection,
        command === 'backfill-resources' ? expectedFounderCount : undefined,
      );
    }
  } catch (error) {
    throwHermesOperationFailure(
      error,
      founderAdmissionClaimed,
      accessRequestResetClaimed,
      notificationRecoveryClaimed,
    );
  } finally {
    disconnectSilently(connection);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Only locally authored CLI messages and fixed domain error codes cross
    // this boundary. Arbitrary SDK/transport/server errors remain opaque.
    console.error(privacySafeHermesErrorMessage(error));
    process.exitCode = 1;
  });
}
