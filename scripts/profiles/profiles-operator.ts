#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DbConnection, tables } from '../../src/spacetime/module_bindings';
import {
  readAdminSecret,
  requestAdminToken,
  requireCredentialedProductionTarget,
} from '../hermes-admin';
import { configureHermesMachineOutput } from '../hermes-machine-output';
import {
  withExclusiveOperatorLock,
  writePrivateOperatorReport,
  inspectPrivateOperatorReports,
  type JsonValue,
  type PrivateOperatorReportCommand,
} from '../marks/operator-report';
import {
  FARCASTER_PROFILE_POLICY_VERSION,
  FarcasterPublicProfileError,
  buildTrustedPublicFarcasterProfile,
  mergeWithLastKnownGood,
  privacySafePublicProfileSummary,
  profilesEqual,
  type ExistingPublicProfile,
  type TrustedPublicFarcasterProfile,
} from './farcaster-profile-policy';
import {
  CONTROLLED_PROFILE_FIXTURE_SOURCE_ID,
  ProfileTransportError,
  fetchPublicProfileResponses,
  trustedProfileTransportAttestation,
  validateProfileSource,
  type TrustedProfileSource,
} from './profile-transport';
import {
  ProfilePlanArtifactError,
  claimReviewedProfilePlan,
  createReviewedProfilePlan,
  readReviewedProfilePlan,
  writeReviewedProfilePlan,
  type ReviewedProfilePlan,
  type ReviewedProfilePlanEntry,
} from './profile-plan-artifact';
import {
  ProfileApplyAuditError,
  writeProfileApplyAuditEvent,
  type ProfileApplyAuditOutcome,
  type ProfileApplyAuditReason,
  type ProfileApplyAuditStage,
} from './profile-apply-audit';
import { readWarpkeepPackageVersion } from '../warpkeep-package-version.mjs';

const DEFAULT_REPORT_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'profiles',
  'reports',
);
const MAXIMUM_PRIVATE_INPUT_BYTES = 256 * 1_024;
const DATABASE = 'warpkeep-89e4u';
const DATABASE_URI = 'https://maincloud.spacetimedb.com';
const BRIDGE_URL = 'https://auth.warpkeep.com';
const SUBSCRIPTION_TIMEOUT_MS = 15_000;
const CONNECTION_TIMEOUT_MS = 12_000;
export const PROFILE_REDUCER_DEADLINE_MS = 12_000;
const COMMANDS = new Set(['plan', 'refresh', 'apply', 'inspect']);
const PRODUCT_VERSION = readWarpkeepPackageVersion();

type Command = 'plan' | 'refresh' | 'apply' | 'inspect';
type ParsedArguments = Readonly<{
  command: Command;
  reportDirectory: string;
  inputStdin: boolean;
  dryRun: boolean;
  confirm: boolean;
}>;
type UnknownRecord = Record<string, unknown>;
type ProfileRequest = Readonly<{
  source: TrustedProfileSource;
}>;
type ReviewedPlanReference = Readonly<{
  filename: string;
  sha256: string;
}>;

const SOURCE_CONFIGURATION_ATTESTATION = trustedProfileTransportAttestation();
const PROFILE_SOURCE_READY = SOURCE_CONFIGURATION_ATTESTATION.sourceStatus === 'owner-reviewed'
  && SOURCE_CONFIGURATION_ATTESTATION.baseUrl !== null;
const SOURCE_CONFIGURATION_DIGEST = createHash('sha256').update(JSON.stringify({
  profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
  transport: SOURCE_CONFIGURATION_ATTESTATION,
}), 'utf8').digest('hex');
const TARGET_CONFIGURATION_DIGEST = createHash('sha256').update(JSON.stringify({
  profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
  databaseUri: DATABASE_URI,
  database: DATABASE,
  bridgeUrl: BRIDGE_URL,
  table: 'realm_profile_v1',
  reducer: 'admin_upsert_realm_profile_v1',
}), 'utf8').digest('hex');

export class ProfilesOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProfilesOperatorError';
  }
}

function record(value: unknown, code = 'PROFILES_PRIVATE_INPUT_INVALID'): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfilesOperatorError(code);
  }
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some(key => !keys.has(key))) throw new ProfilesOperatorError(code);
}

export function parseProfileRequest(value: unknown): ProfileRequest {
  const input = record(value);
  onlyKeys(input, ['source'], 'PROFILES_PRIVATE_INPUT_INVALID');
  const sourceInput = record(input.source, 'PROFILES_SOURCE_INVALID');
  onlyKeys(sourceInput, ['sourceId', 'authorization', 'apiKey'], 'PROFILES_SOURCE_INVALID');
  if (
    typeof sourceInput.sourceId !== 'string'
    || (sourceInput.authorization !== undefined && typeof sourceInput.authorization !== 'string')
    || (sourceInput.apiKey !== undefined && typeof sourceInput.apiKey !== 'string')
  ) throw new ProfilesOperatorError('PROFILES_SOURCE_INVALID');
  const source: TrustedProfileSource = Object.freeze({
    sourceId: sourceInput.sourceId,
    ...(typeof sourceInput.authorization === 'string' ? { authorization: sourceInput.authorization } : {}),
    ...(typeof sourceInput.apiKey === 'string' ? { apiKey: sourceInput.apiKey } : {}),
  });
  validateProfileSource(source);
  return Object.freeze({ source });
}

export function parseReviewedPlanReference(value: unknown): ReviewedPlanReference {
  const input = record(value);
  onlyKeys(input, ['reviewedPlan'], 'PROFILES_PRIVATE_INPUT_INVALID');
  const reference = record(input.reviewedPlan, 'PROFILES_REVIEWED_PLAN_REFERENCE_INVALID');
  onlyKeys(reference, ['filename', 'sha256'], 'PROFILES_REVIEWED_PLAN_REFERENCE_INVALID');
  if (typeof reference.filename !== 'string' || typeof reference.sha256 !== 'string') {
    throw new ProfilesOperatorError('PROFILES_REVIEWED_PLAN_REFERENCE_INVALID');
  }
  return Object.freeze({ filename: reference.filename, sha256: reference.sha256 });
}

export function parseProfilesArguments(argv: readonly string[]): ParsedArguments {
  if (argv.some(value => /(?:https?:\/\/|--?(?:endpoint|secret|token|credential|authorization|api-?key|fid)(?:=|$))/i.test(value))) {
    throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_IN_ARGV');
  }
  const [requested, ...rest] = argv;
  if (!requested || !COMMANDS.has(requested)) throw new ProfilesOperatorError('PROFILES_COMMAND_INVALID');
  let reportDirectory = DEFAULT_REPORT_DIRECTORY;
  let inputStdin = false;
  let dryRun = false;
  let confirm = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--input-stdin') inputStdin = true;
    else if (argument === '--dry-run') dryRun = true;
    else if (argument === '--confirm') confirm = true;
    else if (argument === '--report-dir') {
      const directory = rest[index + 1];
      if (!directory || directory.startsWith('-') || directory.includes('\0')) {
        throw new ProfilesOperatorError('PROFILES_REPORT_DIRECTORY_INVALID');
      }
      reportDirectory = directory;
      index += 1;
    } else throw new ProfilesOperatorError('PROFILES_ARGUMENT_INVALID');
  }
  const command = requested as Command;
  if (command === 'refresh') {
    if (!inputStdin) throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_REQUIRED');
    if (!dryRun || confirm) throw new ProfilesOperatorError('PROFILES_REFRESH_DRY_RUN_REQUIRED');
  } else if (command === 'apply') {
    if (!inputStdin) throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_REQUIRED');
    if (dryRun || !confirm) throw new ProfilesOperatorError('PROFILES_APPLY_CONFIRMATION_REQUIRED');
  } else if (inputStdin || dryRun || confirm) {
    throw new ProfilesOperatorError('PROFILES_ARGUMENT_INVALID');
  }
  return Object.freeze({ command, reportDirectory, inputStdin, dryRun, confirm });
}

async function readPrivateInput(): Promise<UnknownRecord> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAXIMUM_PRIVATE_INPUT_BYTES) {
      buffer.fill(0);
      for (const existing of chunks) existing.fill(0);
      throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  if (byteLength === 0) throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_REQUIRED');
  const combined = Buffer.concat(chunks);
  try {
    return record(JSON.parse(combined.toString('utf8')));
  } catch (error) {
    if (error instanceof ProfilesOperatorError) throw error;
    throw new ProfilesOperatorError('PROFILES_PRIVATE_INPUT_INVALID');
  } finally {
    combined.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export async function resolveTrustedProfiles(
  request: Readonly<{ source: TrustedProfileSource; fids: readonly bigint[] }>,
  fetchImpl?: typeof fetch,
): Promise<readonly TrustedPublicFarcasterProfile[]> {
  const profiles: TrustedPublicFarcasterProfile[] = [];
  for (const fid of request.fids) {
    const responses = await fetchPublicProfileResponses({
      source: request.source,
      fid,
      ...(fetchImpl ? { fetchImpl } : {}),
      controlledFixture: fetchImpl !== undefined
        && request.source.sourceId === CONTROLLED_PROFILE_FIXTURE_SOURCE_ID,
    });
    profiles.push(buildTrustedPublicFarcasterProfile({ fid, responses }));
  }
  return Object.freeze(profiles);
}

function completeness(profiles: readonly TrustedPublicFarcasterProfile[]) {
  const summaries = profiles.map(privacySafePublicProfileSummary);
  return Object.freeze({
    requestedProfiles: profiles.length,
    resolvedProfiles: summaries.filter(summary => summary.resolved).length,
    unresolvedProfiles: summaries.filter(summary => !summary.resolved).length,
    profilesWithUsername: summaries.filter(summary => summary.hasUsername).length,
    profilesWithDisplayName: summaries.filter(summary => summary.hasDisplayName).length,
    profilesWithPfp: summaries.filter(summary => summary.hasPfp).length,
    profilesWithBio: summaries.filter(summary => summary.hasBio).length,
  });
}

function report(
  arguments_: ParsedArguments,
  command: PrivateOperatorReportCommand,
  value: unknown,
): void {
  writePrivateOperatorReport({
    reportDirectory: arguments_.reportDirectory,
    command,
    report: value as JsonValue,
  });
}

type CurrentProfileMap = ReadonlyMap<bigint, ExistingPublicProfile>;

type DisconnectObservation = Readonly<{
  unexpected: boolean;
  errorObserved: boolean;
}>;

type TrackedConnection = Readonly<{
  connection: DbConnection;
  disconnected: Promise<DisconnectObservation>;
  close: () => boolean;
  unexpectedDisconnectObserved: () => boolean;
}>;

export type ProfileReducerOutcome = Readonly<{
  kind: 'succeeded' | 'failed' | 'ambiguous';
  reason: 'none' | 'reducer-rejected' | 'reducer-deadline' | 'unexpected-disconnect';
}>;

function connectTracked(uri: string, database: string, token: string): Promise<TrackedConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = false;
    let pending: DbConnection | undefined;
    let intentionalDisconnect = false;
    let lastDisconnect: DisconnectObservation | undefined;
    let resolveDisconnected: (observation: DisconnectObservation) => void = () => undefined;
    const disconnected = new Promise<DisconnectObservation>((resolveObservation) => {
      resolveDisconnected = resolveObservation;
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      failed = true;
      try { pending?.disconnect(); } catch { /* Preserve the connection timeout. */ }
      reject(new ProfilesOperatorError('PROFILES_CONNECTION_TIMEOUT'));
    }, CONNECTION_TIMEOUT_MS);
    const fail = () => {
      if (settled) return;
      settled = true;
      failed = true;
      clearTimeout(timer);
      try { pending?.disconnect(); } catch { /* Preserve the generic boundary. */ }
      reject(new ProfilesOperatorError('PROFILES_CONNECTION_FAILED'));
    };
    try {
      const builder = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((connection) => {
          if (settled) {
            try { connection.disconnect(); } catch { /* Preserve the earlier result. */ }
            return;
          }
          settled = true;
          pending = undefined;
          clearTimeout(timer);
          const tracked: TrackedConnection = Object.freeze({
            connection,
            disconnected,
            close: () => {
              intentionalDisconnect = true;
              try {
                if (!connection.isDisconnectRequested) connection.disconnect();
                return true;
              } catch {
                return false;
              }
            },
            unexpectedDisconnectObserved: () => lastDisconnect?.unexpected === true
              || (!intentionalDisconnect && !connection.isActive),
          });
          resolve(tracked);
        })
        .onConnectError(() => fail())
        .onDisconnect((_context, error) => {
          lastDisconnect = Object.freeze({
            unexpected: !intentionalDisconnect,
            errorObserved: error !== undefined,
          });
          resolveDisconnected(lastDisconnect);
        });
      const connection = builder.build();
      if (failed) {
        try { connection.disconnect(); } catch { /* Preserve the connection failure. */ }
      } else if (!settled) pending = connection;
    } catch {
      fail();
    }
  });
}

export async function runProfileReducerWithDeadline(input: Readonly<{
  operation: Promise<void>;
  disconnected: Promise<DisconnectObservation>;
  timeoutMs?: number;
}>): Promise<ProfileReducerOutcome> {
  const timeoutMs = input.timeoutMs ?? PROFILE_REDUCER_DEADLINE_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new ProfilesOperatorError('PROFILES_REDUCER_DEADLINE_INVALID');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reducer = input.operation.then<ProfileReducerOutcome, ProfileReducerOutcome>(
    () => Object.freeze({ kind: 'succeeded', reason: 'none' }),
    () => Object.freeze({ kind: 'failed', reason: 'reducer-rejected' }),
  );
  const deadline = new Promise<ProfileReducerOutcome>((resolve) => {
    timer = setTimeout(() => resolve(Object.freeze({
      kind: 'ambiguous',
      reason: 'reducer-deadline',
    })), timeoutMs);
  });
  const disconnected = input.disconnected.then<ProfileReducerOutcome>(() => Object.freeze({
    kind: 'ambiguous',
    reason: 'unexpected-disconnect',
  }));
  try {
    return await Promise.race([reducer, deadline, disconnected]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readCurrentProfiles(connection: DbConnection): Promise<CurrentProfileMap> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handle: ReturnType<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']> | undefined;
    const timer = setTimeout(() => finish(() => reject(new ProfilesOperatorError('PROFILES_SUBSCRIPTION_TIMEOUT'))), SUBSCRIPTION_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { handle?.unsubscribe(); } catch { /* Preserve the generic boundary. */ }
      callback();
    };
    try {
      const builder = connection.subscriptionBuilder()
        .onApplied(() => {
          const rows = new Map<bigint, ExistingPublicProfile>();
          for (const row of connection.db.realmProfileV1.iter()) {
            rows.set(row.fid, Object.freeze({
              canonicalUsername: row.canonicalUsername,
              displayName: row.displayName,
              pfpUrl: row.pfpUrl,
              publicBio: row.publicBio,
            }));
          }
          finish(() => resolve(rows));
        })
        .onError(() => finish(() => reject(new ProfilesOperatorError('PROFILES_SUBSCRIPTION_FAILED'))));
      handle = builder.subscribe([tables.realmProfileV1]);
      if (settled) {
        try { handle.unsubscribe(); } catch { /* Preserve the generic boundary. */ }
      }
    } catch {
      finish(() => reject(new ProfilesOperatorError('PROFILES_SUBSCRIPTION_FAILED')));
    }
  });
}

async function readCurrentProfilesTracked(tracked: TrackedConnection): Promise<CurrentProfileMap> {
  return Promise.race([
    readCurrentProfiles(tracked.connection),
    tracked.disconnected.then(() => Promise.reject(
      new ProfilesOperatorError('PROFILES_SUBSCRIPTION_DISCONNECTED'),
    )),
  ]);
}

export function planProfileUpdates(
  profiles: readonly TrustedPublicFarcasterProfile[],
  current: CurrentProfileMap,
) {
  const resolvedFids = new Set(profiles.map(profile => profile.fid));
  if (
    profiles.length !== current.size
    || resolvedFids.size !== profiles.length
    || [...current.keys()].some(fid => !resolvedFids.has(fid))
  ) throw new ProfilesOperatorError('PROFILES_FOUNDER_SET_MISMATCH');
  const updates: TrustedPublicFarcasterProfile[] = [];
  let preservedFields = 0;
  for (const resolved of profiles) {
    const existing = current.get(resolved.fid);
    if (!existing) throw new ProfilesOperatorError('PROFILES_FOUNDER_STATE_MISMATCH');
    const merged = mergeWithLastKnownGood(resolved, existing);
    preservedFields += [
      resolved.canonicalUsername === undefined
        && existing.canonicalUsername !== undefined
        && merged.canonicalUsername !== undefined,
      resolved.displayName === undefined
        && existing.displayName !== undefined
        && merged.displayName !== undefined,
      resolved.pfpUrl === undefined
        && existing.pfpUrl !== undefined
        && merged.pfpUrl !== undefined,
      resolved.publicBio === undefined
        && existing.publicBio !== undefined
        && merged.publicBio !== undefined,
    ].filter(Boolean).length;
    if (!profilesEqual(existing, merged)) updates.push(merged);
  }
  return Object.freeze({
    updates: Object.freeze(updates),
    unchangedProfiles: profiles.length - updates.length,
    lastKnownGoodFieldsPreserved: preservedFields,
  });
}

export function foundedProfileSetDigest(fids: Iterable<bigint>): string {
  const canonical = [...fids]
    .map((fid) => {
      if (fid <= 0n || fid > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new ProfilesOperatorError('PROFILES_FOUNDER_STATE_MISMATCH');
      }
      return fid;
    })
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map(fid => fid.toString());
  if (new Set(canonical).size !== canonical.length) {
    throw new ProfilesOperatorError('PROFILES_FOUNDER_STATE_MISMATCH');
  }
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function profileFields(profile: ExistingPublicProfile): ExistingPublicProfile {
  return Object.freeze({
    ...(profile.canonicalUsername !== undefined ? { canonicalUsername: profile.canonicalUsername } : {}),
    ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
    ...(profile.pfpUrl !== undefined ? { pfpUrl: profile.pfpUrl } : {}),
    ...(profile.publicBio !== undefined ? { publicBio: profile.publicBio } : {}),
  });
}

function requireAdminCredentialSource(): string {
  if (process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN !== undefined) {
    throw new ProfilesOperatorError('PROFILES_CREDENTIAL_SOURCE_INVALID');
  }
  requireCredentialedProductionTarget(DATABASE_URI, DATABASE, BRIDGE_URL);
  return readAdminSecret(process.env.WARPKEEP_ADMIN_TOKEN_SECRET, undefined);
}

async function readProductionProfiles(token: string): Promise<CurrentProfileMap> {
  const tracked = await connectTracked(DATABASE_URI, DATABASE, token);
  try {
    return await readCurrentProfilesTracked(tracked);
  } finally {
    tracked.close();
  }
}

async function runRefresh(arguments_: ParsedArguments, request: ProfileRequest) {
  const secret = requireAdminCredentialSource();
  const token = await requestAdminToken(BRIDGE_URL, secret);
  const current = await readProductionProfiles(token);
  if (current.size < 1 || current.size > 100) {
    throw new ProfilesOperatorError('PROFILES_FOUNDER_STATE_MISMATCH');
  }
  const profiles = await resolveTrustedProfiles({
    source: request.source,
    fids: Object.freeze([...current.keys()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)),
  });
  const planned = planProfileUpdates(profiles, current);
  const updates: ReviewedProfilePlanEntry[] = planned.updates.map((profile) => {
    const expectedCurrent = current.get(profile.fid);
    if (!expectedCurrent) throw new ProfilesOperatorError('PROFILES_FOUNDER_STATE_MISMATCH');
    return Object.freeze({
      fid: profile.fid.toString(),
      expectedCurrent: profileFields(expectedCurrent),
      intended: profileFields(profile),
    });
  });
  const plan = createReviewedProfilePlan({
    sourceConfigurationDigest: SOURCE_CONFIGURATION_DIGEST,
    targetConfigurationDigest: TARGET_CONFIGURATION_DIGEST,
    policyVersion: FARCASTER_PROFILE_POLICY_VERSION,
    foundedProfileSetDigest: foundedProfileSetDigest(current.keys()),
    fetchedProfiles: profiles.length,
    unchangedProfiles: planned.unchangedProfiles,
    lastKnownGoodFieldsPreserved: planned.lastKnownGoodFieldsPreserved,
    updates,
  });
  const artifact = writeReviewedProfilePlan({
    reportDirectory: arguments_.reportDirectory,
    plan,
  });
  report(arguments_, 'profiles-refresh', Object.freeze({
    schemaVersion: 2,
    command: 'profiles-refresh',
    dryRun: true,
    foundedProfiles: current.size,
    currentProfilesWithUsername: [...current.values()].filter(profile => profile.canonicalUsername !== undefined).length,
    currentProfilesWithDisplayName: [...current.values()].filter(profile => profile.displayName !== undefined).length,
    currentProfilesWithPfp: [...current.values()].filter(profile => profile.pfpUrl !== undefined).length,
    currentProfilesWithBio: [...current.values()].filter(profile => profile.publicBio !== undefined).length,
    ...completeness(profiles),
    intendedUpdates: updates.length,
    unchangedProfiles: planned.unchangedProfiles,
    lastKnownGoodFieldsPreserved: planned.lastKnownGoodFieldsPreserved,
    reviewedPlanCreated: true,
    reviewedPlanLifetimeMinutes: 30,
    sourceConfigurationDigest: SOURCE_CONFIGURATION_DIGEST,
    targetConfigurationDigest: TARGET_CONFIGURATION_DIGEST,
    persistencePerformed: false,
    walletOperations: 0,
    admissionOperations: 0,
    castleOperations: 0,
    markOperations: 0,
  }));
  return Object.freeze({
    reportWritten: true,
    networkUsed: true,
    persistencePerformed: false,
    reviewedPlan: artifact,
  });
}

function founderSetMatches(plan: ReviewedProfilePlan, current: CurrentProfileMap): boolean {
  return current.size === plan.fetchedProfiles
    && foundedProfileSetDigest(current.keys()) === plan.foundedProfileSetDigest;
}

export function planPreconditionsMatch(plan: ReviewedProfilePlan, current: CurrentProfileMap): boolean {
  return founderSetMatches(plan, current) && plan.updates.every((update) => {
    const currentProfile = current.get(BigInt(update.fid));
    return currentProfile !== undefined && profilesEqual(currentProfile, update.expectedCurrent);
  });
}

function requireProfileSourceReady(): void {
  if (!PROFILE_SOURCE_READY) {
    throw new ProfileTransportError('PROFILE_SOURCE_ATTESTATION_PENDING');
  }
}

async function runApply(
  arguments_: ParsedArguments,
  reference: ReviewedPlanReference,
) {
  requireProfileSourceReady();
  const plan = readReviewedProfilePlan({
    reportDirectory: arguments_.reportDirectory,
    filename: reference.filename,
    expectedSha256: reference.sha256,
    sourceConfigurationDigest: SOURCE_CONFIGURATION_DIGEST,
    targetConfigurationDigest: TARGET_CONFIGURATION_DIGEST,
    policyVersion: FARCASTER_PROFILE_POLICY_VERSION,
  });
  const secret = requireAdminCredentialSource();
  const token = await requestAdminToken(BRIDGE_URL, secret);
  let auditSequence = 0;
  const audit = (
    stage: ProfileApplyAuditStage,
    outcome: ProfileApplyAuditOutcome,
    options: Readonly<{
      reason?: ProfileApplyAuditReason;
      updateIndex?: number;
      matchedUpdates?: number;
    }> = {},
  ) => {
    writeProfileApplyAuditEvent({
      reportDirectory: arguments_.reportDirectory,
      planId: plan.planId,
      sequence: auditSequence,
      stage,
      outcome,
      totalUpdates: plan.updates.length,
      ...options,
    });
    auditSequence += 1;
  };

  const mutationConnection = await connectTracked(DATABASE_URI, DATABASE, token);
  let mutationOutcome: 'succeeded' | 'failed' | 'ambiguous' = 'succeeded';
  let submittedUpdates = 0;
  let succeededUpdates = 0;
  let interimAmbiguousUpdates = 0;
  let matchedUpdates = 0;
  let verificationAvailable = false;
  let founderSetVerified = false;
  try {
    const current = await readCurrentProfilesTracked(mutationConnection);
    if (!planPreconditionsMatch(plan, current)) {
      audit('precondition-failed', 'failed', { reason: 'precondition-drift' });
      throw new ProfilesOperatorError('PROFILES_REVIEWED_PLAN_PRECONDITION_DRIFT');
    }
    claimReviewedProfilePlan({
      reportDirectory: arguments_.reportDirectory,
      plan,
      sha256: reference.sha256,
    });
    audit('apply-claimed', 'pending');
    audit('precondition-verified', 'verified');
    for (let index = 0; index < plan.updates.length; index += 1) {
      const update = plan.updates[index];
      audit('reducer-submitted', 'pending', { updateIndex: index });
      submittedUpdates += 1;
      let operation: Promise<void>;
      try {
        operation = mutationConnection.connection.reducers.adminUpsertRealmProfileV1({
          fid: BigInt(update.fid),
          canonicalUsername: update.intended.canonicalUsername,
          displayName: update.intended.displayName,
          pfpUrl: update.intended.pfpUrl,
          publicBio: update.intended.publicBio,
          profilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
        });
      } catch {
        operation = Promise.reject(new ProfilesOperatorError('PROFILES_REDUCER_SUBMISSION_FAILED'));
      }
      const outcome = await runProfileReducerWithDeadline({
        operation,
        disconnected: mutationConnection.disconnected,
      });
      if (outcome.kind === 'succeeded') {
        succeededUpdates += 1;
        audit('reducer-succeeded', 'succeeded', { updateIndex: index });
        continue;
      }
      if (outcome.kind === 'failed') {
        mutationOutcome = 'failed';
        audit('reducer-failed', 'failed', {
          updateIndex: index,
          reason: 'reducer-rejected',
        });
      } else {
        mutationOutcome = 'ambiguous';
        interimAmbiguousUpdates += 1;
        audit('reducer-ambiguous', 'ambiguous', {
          updateIndex: index,
          reason: outcome.reason,
        });
      }
      break;
    }
    // A fresh subscription on the still-authorized mutation connection avoids
    // reusing one short-lived admin token for a second WebSocket lifecycle.
    // The subscription's onApplied boundary still reads a new authoritative
    // table snapshot after every reducer result.
    audit('verification-started', 'pending');
    try {
      const verified = await readCurrentProfilesTracked(mutationConnection);
      verificationAvailable = true;
      founderSetVerified = founderSetMatches(plan, verified);
      matchedUpdates = plan.updates.filter((update) => {
        const observed = verified.get(BigInt(update.fid));
        return observed !== undefined && profilesEqual(observed, update.intended);
      }).length;
      if (founderSetVerified && matchedUpdates === plan.updates.length) {
        audit('verification-complete', 'verified', { matchedUpdates });
      } else {
        audit('verification-complete', 'mismatch', {
          reason: 'verification-mismatch',
          matchedUpdates,
        });
      }
    } catch {
      audit('verification-failed', 'ambiguous', { reason: 'verification-unavailable' });
    }
  } finally {
    const unexpectedDisconnect = mutationConnection.unexpectedDisconnectObserved();
    const disconnectSucceeded = mutationConnection.close();
    if (!disconnectSucceeded || unexpectedDisconnect) {
      audit('mutation-disconnect-error', 'ambiguous', {
        reason: disconnectSucceeded ? 'unexpected-disconnect' : 'disconnect-threw',
      });
    } else {
      audit('mutation-connection-closed', mutationOutcome);
    }
  }

  let finalOutcome: 'succeeded' | 'failed' | 'ambiguous';
  if (
    !verificationAvailable
    || !founderSetVerified
    || matchedUpdates !== plan.updates.length
  ) finalOutcome = 'ambiguous';
  else if (mutationOutcome === 'failed') finalOutcome = 'failed';
  else finalOutcome = 'succeeded';
  audit('apply-complete', finalOutcome);
  const safe = Object.freeze({
    schemaVersion: 2,
    command: 'profiles-apply',
    planClaimed: true,
    finalOutcome,
    intendedUpdates: plan.updates.length,
    submittedUpdates,
    reducerSucceededUpdates: succeededUpdates,
    interimAmbiguousUpdates,
    postApplyMatchedUpdates: matchedUpdates,
    postApplyVerificationAvailable: verificationAvailable,
    postApplyFounderSetVerified: founderSetVerified,
    unchangedProfiles: plan.unchangedProfiles,
    lastKnownGoodFieldsPreserved: plan.lastKnownGoodFieldsPreserved,
    walletOperations: 0,
    admissionOperations: 0,
    castleOperations: 0,
    markOperations: 0,
  });
  report(arguments_, 'profiles-apply', safe);
  if (finalOutcome === 'failed') throw new ProfilesOperatorError('PROFILES_APPLY_FAILED');
  if (finalOutcome === 'ambiguous') throw new ProfilesOperatorError('PROFILES_APPLY_AMBIGUOUS');
  return Object.freeze({
    reportWritten: true,
    persistencePerformed: plan.updates.length > 0,
    updatedProfiles: plan.updates.length,
    postApplyVerified: true,
    resolvedInterimAmbiguity: interimAmbiguousUpdates > 0,
  });
}

export async function executeProfilesOperator(arguments_: ParsedArguments): Promise<unknown> {
  if (arguments_.command === 'inspect') {
    return Object.freeze({ networkUsed: false, ...inspectPrivateOperatorReports(arguments_.reportDirectory) });
  }
  if (arguments_.command === 'plan') {
    const safe = Object.freeze({
      schemaVersion: 2,
      command: 'profiles-plan',
      productVersion: PRODUCT_VERSION,
      networkDefault: false,
      productionMutationAvailable: PROFILE_SOURCE_READY,
      profileRefreshBlocked: !PROFILE_SOURCE_READY,
      profileRefreshBlockReason: PROFILE_SOURCE_READY ? 'none' : 'pending-owner-source',
      applyRequiresExplicitConfirmation: true,
      applyRequiresFreshReviewedPlan: true,
      applyRefetchesSource: false,
      reviewedPlanLifetimeMinutes: 30,
      reducerDeadlineSeconds: PROFILE_REDUCER_DEADLINE_MS / 1_000,
      allowedReducer: 'admin_upsert_realm_profile_v1',
      sourceConfigurationDigest: SOURCE_CONFIGURATION_DIGEST,
      targetConfigurationDigest: TARGET_CONFIGURATION_DIGEST,
      walletOperationsAvailable: false,
      admissionOperationsAvailable: false,
      castleOperationsAvailable: false,
      markOperationsAvailable: false,
      reportsPrivate: true,
    });
    report(arguments_, 'profiles-plan', safe);
    return Object.freeze({ reportWritten: true, networkUsed: false });
  }
  return withExclusiveOperatorLock(arguments_.reportDirectory, async () => {
    const input = await readPrivateInput();
    if (arguments_.command === 'refresh') {
      return runRefresh(arguments_, parseProfileRequest(input));
    }
    return runApply(arguments_, parseReviewedPlanReference(input));
  });
}

function publicError(error: unknown): string {
  if (
    error instanceof ProfilesOperatorError
    || error instanceof ProfileTransportError
    || error instanceof FarcasterPublicProfileError
    || error instanceof ProfilePlanArtifactError
    || error instanceof ProfileApplyAuditError
  ) return error.code;
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return 'PROFILES_PRIVATE_OPERATION_FAILED';
  }
  return 'PROFILES_OPERATOR_FAILED';
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  configureHermesMachineOutput(true);
  try {
    const arguments_ = parseProfilesArguments(argv);
    const result = await executeProfilesOperator(arguments_);
    process.stdout.write(`${JSON.stringify({ ok: true, command: arguments_.command, result })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: publicError(error) })}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
