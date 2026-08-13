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

import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
} from './production-admin-token-budget.mjs';
import { executeGreaterRealmProductionVerifier } from './greater-realm-production-verifier';
import type {
  GreaterRealmProductionVerificationReceipt,
} from './greater-realm-production-verifier-core';

export const GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND =
  'warpkeep-greater-realm-production-pages-active-v17-v1' as const;
export const GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_STATE_CHILD =
  'greater-realm-pages-active-v17-evidence' as const;
export const GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS =
  24 * 60 * 60 * 1_000;
export const GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
} as const);

export type GreaterRealmProductionPagesEvidenceSourceRelease = Readonly<{
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
}>;

export type GreaterRealmProductionPagesEvidence = Readonly<{
  schemaVersion: 1;
  kind: typeof GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND;
  recordedAt: string;
  expiresAt: string;
  maximumAgeMilliseconds: number;
  target: typeof GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET;
  sourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  founderCapacityRemaining: number;
  activeAdmissionEligible: boolean;
  activeVerification: GreaterRealmProductionVerificationReceipt;
}>;

export type GreaterRealmProductionPagesEvidenceExpectations = Readonly<{
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  maximumAgeMilliseconds: number;
  now?: Date;
}>;

export type GreaterRealmProductionPagesEvidenceWriteResult = Readonly<{
  path: string;
  evidenceDigest: string;
  recordedAt: string;
  expiresAt: string;
  result: 'installed' | 'unchanged';
  evidence: GreaterRealmProductionPagesEvidence;
}>;

export class GreaterRealmProductionPagesEvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionPagesEvidenceError';
  }
}

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const MAX_EVIDENCE_BYTES = 16 * 1024;
const MAX_FOUNDERS = 600;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DECIMAL_U64 = /^(?:0|[1-9][0-9]*)$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RECEIPT_FILE = /^greater-realm-pages-active-v17-([0-9a-f]{64})\.json$/u;
const TEMPORARY_FILE = /^\.greater-realm-pages-active-v17-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const EVIDENCE_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'recordedAt',
  'expiresAt',
  'maximumAgeMilliseconds',
  'target',
  'sourceRelease',
  'expectedFounderCount',
  'founderCapacityRemaining',
  'activeAdmissionEligible',
  'activeVerification',
]);
const TARGET_KEYS = Object.freeze(['uri', 'database', 'deleteData']);
const SOURCE_RELEASE_KEYS = Object.freeze([
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'expectedReleaseSha256',
  'moduleSourceCommit',
]);
const ACTIVE_VERIFICATION_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'expectedReleaseSha256',
  'moduleSourceCommit',
  'expectedFounderCount',
  'founderCapacityRemaining',
  'admissionState',
  'activeClaimRows',
  'occupancyRows',
  'auditRows',
  'statusDigest',
]);

function fail(code: string): never {
  throw new GreaterRealmProductionPagesEvidenceError(code);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactOrderedKeys(
  value: unknown,
  expected: readonly string[],
): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && Object.keys(value).join('\0') === expected.join('\0');
}

function exactDate(value: unknown, code: string): number {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(code);
  return value.getTime();
}

function strictUtc(value: unknown, code: string): string {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validU64(value: unknown): value is string {
  if (typeof value !== 'string' || !DECIMAL_U64.test(value)) return false;
  try {
    return BigInt(value) <= ((1n << 64n) - 1n);
  } catch {
    return false;
  }
}

function validFounderCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 1
    && Number(value) <= MAX_FOUNDERS;
}

function validMaximumAge(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 1
    && Number(value)
      <= GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameSourceRelease(
  left: GreaterRealmProductionPagesEvidenceSourceRelease,
  right: GreaterRealmProductionPagesEvidenceSourceRelease,
): boolean {
  return SOURCE_RELEASE_KEYS.every(key => left[key as keyof typeof left]
    === right[key as keyof typeof right]);
}

function parseSourceRelease(
  value: unknown,
  code: string,
): GreaterRealmProductionPagesEvidenceSourceRelease {
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
  ) fail(code);
  return Object.freeze({
    atlasSourceCommit: value.atlasSourceCommit,
    atlasId: value.atlasId,
    publicReleaseId: value.publicReleaseId,
    expectedReleaseSha256: value.expectedReleaseSha256,
    moduleSourceCommit: value.moduleSourceCommit,
  });
}

function parseTarget(value: unknown): typeof GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET {
  if (
    !exactOrderedKeys(value, TARGET_KEYS)
    || value.uri !== GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET.uri
    || value.database !== GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET.database
    || value.deleteData !== GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET.deleteData
  ) fail('GREATER_REALM_PAGES_EVIDENCE_TARGET_INVALID');
  return GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET;
}

function parseActiveVerification(
  value: unknown,
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease,
  expectedFounderCount: number,
): GreaterRealmProductionVerificationReceipt {
  const expectedRemaining = MAX_FOUNDERS - expectedFounderCount;
  const expectedEligibility = expectedFounderCount < MAX_FOUNDERS;
  if (
    !exactOrderedKeys(value, ACTIVE_VERIFICATION_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== 'warpkeep-greater-realm-production-active-verification-v1'
    || value.atlasSourceCommit !== expectedSourceRelease.atlasSourceCommit
    || value.atlasId !== expectedSourceRelease.atlasId
    || value.publicReleaseId !== expectedSourceRelease.publicReleaseId
    || value.expectedReleaseSha256 !== expectedSourceRelease.expectedReleaseSha256
    || value.moduleSourceCommit !== expectedSourceRelease.moduleSourceCommit
    || value.expectedFounderCount !== expectedFounderCount
    || value.founderCapacityRemaining !== expectedRemaining
    || value.admissionState !== (expectedEligibility ? 'open' : 'at-capacity')
    || value.activeClaimRows !== expectedFounderCount.toString()
    || value.occupancyRows !== expectedFounderCount.toString()
    || !validU64(value.auditRows)
    || typeof value.statusDigest !== 'string'
    || !SHA256.test(value.statusDigest)
  ) fail('GREATER_REALM_PAGES_EVIDENCE_ACTIVE_VERIFICATION_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-active-verification-v1',
    atlasSourceCommit: expectedSourceRelease.atlasSourceCommit,
    atlasId: expectedSourceRelease.atlasId,
    publicReleaseId: expectedSourceRelease.publicReleaseId,
    expectedReleaseSha256: expectedSourceRelease.expectedReleaseSha256,
    moduleSourceCommit: expectedSourceRelease.moduleSourceCommit,
    expectedFounderCount,
    founderCapacityRemaining: expectedRemaining,
    admissionState: expectedEligibility ? 'open' : 'at-capacity',
    activeClaimRows: expectedFounderCount.toString(),
    occupancyRows: expectedFounderCount.toString(),
    auditRows: value.auditRows,
    statusDigest: value.statusDigest,
  });
}

function normalizeExpectations(
  expectations: GreaterRealmProductionPagesEvidenceExpectations,
): Readonly<{
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  maximumAgeMilliseconds: number;
  now: Date;
}> {
  if (!isRecord(expectations)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_EXPECTATIONS_INVALID');
  }
  const expectedSourceRelease = parseSourceRelease(
    expectations.expectedSourceRelease,
    'GREATER_REALM_PAGES_EVIDENCE_EXPECTED_SOURCE_INVALID',
  );
  if (!validFounderCount(expectations.expectedFounderCount)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_FOUNDER_COUNT_INVALID');
  }
  if (!validMaximumAge(expectations.maximumAgeMilliseconds)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_MAXIMUM_AGE_INVALID');
  }
  const now = expectations.now ?? new Date();
  exactDate(now, 'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID');
  return Object.freeze({
    expectedSourceRelease,
    expectedFounderCount: expectations.expectedFounderCount,
    maximumAgeMilliseconds: expectations.maximumAgeMilliseconds,
    now,
  });
}

/**
 * Parse canonical active-v17 evidence against caller-owned provenance and
 * freshness expectations. Self-described values are never accepted as trust.
 */
export function parseGreaterRealmProductionPagesEvidence(
  value: unknown,
  expectations: GreaterRealmProductionPagesEvidenceExpectations,
): GreaterRealmProductionPagesEvidence {
  const expected = normalizeExpectations(expectations);
  if (
    !exactOrderedKeys(value, EVIDENCE_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND
    || value.maximumAgeMilliseconds !== expected.maximumAgeMilliseconds
    || value.expectedFounderCount !== expected.expectedFounderCount
  ) fail('GREATER_REALM_PAGES_EVIDENCE_SHAPE_INVALID');
  const recordedAt = strictUtc(
    value.recordedAt,
    'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID',
  );
  const expiresAt = strictUtc(
    value.expiresAt,
    'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID',
  );
  const recordedAtMs = Date.parse(recordedAt);
  const expiresAtMs = Date.parse(expiresAt);
  const nowMs = expected.now.getTime();
  if (expiresAtMs - recordedAtMs !== expected.maximumAgeMilliseconds) {
    fail('GREATER_REALM_PAGES_EVIDENCE_FRESHNESS_WINDOW_INVALID');
  }
  if (recordedAtMs > nowMs) {
    fail('GREATER_REALM_PAGES_EVIDENCE_NOT_YET_VALID');
  }
  if (expiresAtMs <= nowMs) fail('GREATER_REALM_PAGES_EVIDENCE_EXPIRED');
  const target = parseTarget(value.target);
  const sourceRelease = parseSourceRelease(
    value.sourceRelease,
    'GREATER_REALM_PAGES_EVIDENCE_SOURCE_INVALID',
  );
  if (!sameSourceRelease(sourceRelease, expected.expectedSourceRelease)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_SOURCE_MISMATCH');
  }
  const expectedRemaining = MAX_FOUNDERS - expected.expectedFounderCount;
  const expectedEligibility = expected.expectedFounderCount < MAX_FOUNDERS;
  if (
    value.founderCapacityRemaining !== expectedRemaining
    || value.activeAdmissionEligible !== expectedEligibility
  ) fail('GREATER_REALM_PAGES_EVIDENCE_CAPACITY_INVALID');
  const activeVerification = parseActiveVerification(
    value.activeVerification,
    expected.expectedSourceRelease,
    expected.expectedFounderCount,
  );
  return Object.freeze({
    schemaVersion: 1,
    kind: GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND,
    recordedAt,
    expiresAt,
    maximumAgeMilliseconds: expected.maximumAgeMilliseconds,
    target,
    sourceRelease,
    expectedFounderCount: expected.expectedFounderCount,
    founderCapacityRemaining: expectedRemaining,
    activeAdmissionEligible: expectedEligibility,
    activeVerification,
  });
}

function canonicalEvidenceBytes(
  evidence: GreaterRealmProductionPagesEvidence,
): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_EVIDENCE_BYTES) {
    bytes.fill(0);
    fail('GREATER_REALM_PAGES_EVIDENCE_SIZE_INVALID');
  }
  return bytes;
}

function parseCanonicalEvidenceBytes(
  bytes: Buffer,
  expectations: GreaterRealmProductionPagesEvidenceExpectations,
): GreaterRealmProductionPagesEvidence {
  let source: string;
  let value: unknown;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('GREATER_REALM_PAGES_EVIDENCE_JSON_INVALID');
  }
  const evidence = parseGreaterRealmProductionPagesEvidence(value, expectations);
  const canonical = canonicalEvidenceBytes(evidence);
  try {
    if (!bytes.equals(canonical)) {
      fail('GREATER_REALM_PAGES_EVIDENCE_BYTES_INVALID');
    }
  } finally {
    canonical.fill(0);
  }
  return evidence;
}

function inside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function fsyncDirectory(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch {
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_SYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPrivateDirectory(path: string, expectedParent?: string): string {
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
    ) fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
    return canonical;
  } catch (error) {
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
  }
}

function canonicalRepositoryRoot(repositoryRoot: string): string {
  if (
    typeof repositoryRoot !== 'string'
    || !isAbsolute(repositoryRoot)
    || resolve(repositoryRoot) !== repositoryRoot
  ) fail('GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_INVALID');
  try {
    const metadata = lstatSync(repositoryRoot);
    const canonical = realpathSync(repositoryRoot);
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || canonical !== repositoryRoot
      || canonical !== REPOSITORY_ROOT
    ) fail('GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_INVALID');
    return canonical;
  } catch (error) {
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    fail('GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_INVALID');
  }
}

function stableFile(
  path: string,
  expectedNlink: 1 | 2,
  code: string,
): Readonly<{ bytes: Buffer; dev: number; ino: number }> {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.nlink !== expectedNlink
      || before.size < 1
      || before.size > MAX_EVIDENCE_BYTES
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
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    return fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readContentAddressedFile(
  path: string,
  expectedDigest: string,
  expectedNlink: 1 | 2,
): Readonly<{ bytes: Buffer; dev: number; ino: number }> {
  const opened = stableFile(
    path,
    expectedNlink,
    'GREATER_REALM_PAGES_EVIDENCE_FILE_INVALID',
  );
  if (digest(opened.bytes) !== expectedDigest) {
    opened.bytes.fill(0);
    fail('GREATER_REALM_PAGES_EVIDENCE_CONTENT_ADDRESS_INVALID');
  }
  return opened;
}

function unlinkExact(path: string, expected: Readonly<{ dev: number; ino: number }>): void {
  try {
    const current = lstatSync(path);
    if (
      !current.isFile()
      || current.isSymbolicLink()
      || current.dev !== expected.dev
      || current.ino !== expected.ino
      || (process.getuid !== undefined && current.uid !== process.getuid())
    ) fail('GREATER_REALM_PAGES_EVIDENCE_TEMPORARY_CHANGED');
    unlinkSync(path);
  } catch (error) {
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    fail('GREATER_REALM_PAGES_EVIDENCE_TEMPORARY_CHANGED');
  }
}

function repairLinkedTemporaries(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const match = TEMPORARY_FILE.exec(entry.name);
    if (match === null) continue;
    const temporary = join(directory, entry.name);
    let metadata;
    try {
      metadata = lstatSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      fail('GREATER_REALM_PAGES_EVIDENCE_TEMPORARY_INVALID');
    }
    const mode = metadata.mode & 0o7777;
    if (
      !entry.isFile()
      || !metadata.isFile()
      || metadata.isSymbolicLink()
      || (process.getuid !== undefined && metadata.uid !== process.getuid())
      || (metadata.nlink !== 1 && metadata.nlink !== 2)
      || (metadata.nlink === 1 ? (mode & ~FILE_MODE) !== 0 : mode !== FILE_MODE)
      || metadata.size > MAX_EVIDENCE_BYTES
    ) fail('GREATER_REALM_PAGES_EVIDENCE_TEMPORARY_INVALID');
    if (metadata.nlink === 1) continue;
    const evidenceDigest = match[1]!;
    const destination = join(
      directory,
      `greater-realm-pages-active-v17-${evidenceDigest}.json`,
    );
    const opened = readContentAddressedFile(destination, evidenceDigest, 2);
    try {
      if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
        fail('GREATER_REALM_PAGES_EVIDENCE_INCOMPLETE_INSTALL');
      }
      unlinkExact(temporary, opened);
      fsyncDirectory(directory);
      const installed = lstatSync(destination);
      if (
        installed.dev !== opened.dev
        || installed.ino !== opened.ino
        || installed.nlink !== 1
      ) fail('GREATER_REALM_PAGES_EVIDENCE_INCOMPLETE_INSTALL');
    } finally {
      opened.bytes.fill(0);
    }
  }
}

function validateDedicatedDirectory(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const receipt = RECEIPT_FILE.exec(entry.name);
    const temporary = TEMPORARY_FILE.exec(entry.name);
    if (receipt === null && temporary === null) {
      fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_DEDICATED');
    }
    const path = join(directory, entry.name);
    let metadata;
    try {
      metadata = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_DEDICATED');
    }
    const mode = metadata.mode & 0o7777;
    if (
      !entry.isFile()
      || !metadata.isFile()
      || metadata.isSymbolicLink()
      || (process.getuid !== undefined && metadata.uid !== process.getuid())
      || metadata.nlink !== 1
      || (receipt !== null ? mode !== FILE_MODE : (mode & ~FILE_MODE) !== 0)
      || metadata.size > MAX_EVIDENCE_BYTES
    ) fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_DEDICATED');
    if (receipt !== null) {
      const opened = readContentAddressedFile(path, receipt[1]!, 1);
      opened.bytes.fill(0);
    }
  }
}

/** Create or attest the dedicated owner-only evidence directory. */
export function ensureGreaterRealmProductionPagesEvidenceDirectory(input: Readonly<{
  directory: string;
  repositoryRoot: string;
}>): string {
  if (
    typeof input.directory !== 'string'
    || !isAbsolute(input.directory)
    || resolve(input.directory) !== input.directory
  ) fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_ABSOLUTE');
  const repository = canonicalRepositoryRoot(input.repositoryRoot);
  const requested = input.directory;
  try {
    assertProductionAdminTrustedAncestors(requested);
  } catch {
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_ANCESTOR_INVALID');
  }
  if (inside(repository, requested) || inside(requested, repository)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_OVERLAP');
  }
  const parent = dirname(requested);
  let canonicalParent: string;
  try {
    canonicalParent = assertPrivateDirectory(parent);
  } catch {
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
  }
  if (inside(repository, canonicalParent) || inside(canonicalParent, repository)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_OVERLAP');
  }
  if (!existsSync(requested)) {
    try {
      mkdirSync(requested, { mode: DIRECTORY_MODE });
      chmodSync(requested, DIRECTORY_MODE);
      fsyncDirectory(requested);
      fsyncDirectory(parent);
    } catch (error) {
      if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
      fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_CREATE_FAILED');
    }
  }
  let metadata;
  try {
    metadata = lstatSync(requested);
  } catch {
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
  }
  const permissionMode = metadata.mode & 0o7777;
  if (
    permissionMode !== DIRECTORY_MODE
    && metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && (process.getuid === undefined || metadata.uid === process.getuid())
    && (permissionMode & ~DIRECTORY_MODE) === 0
  ) {
    try {
      if (realpathSync(requested) !== requested || dirname(requested) !== canonicalParent) {
        fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
      }
      chmodSync(requested, DIRECTORY_MODE);
      fsyncDirectory(requested);
      fsyncDirectory(parent);
    } catch (error) {
      if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
      fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_CREATE_FAILED');
    }
  }
  const directory = assertPrivateDirectory(requested);
  try {
    repairLinkedTemporaries(directory);
    validateDedicatedDirectory(directory);
  } catch (error) {
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    fail('GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID');
  }
  return directory;
}

export function defaultGreaterRealmProductionPagesEvidenceDirectory(): string {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep',
    'private',
    'production-admin-v1',
    GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_STATE_CHILD,
  );
}

function buildEvidence(input: Readonly<{
  activeVerification: GreaterRealmProductionVerificationReceipt;
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  maximumAgeMilliseconds: number;
  verifiedAt: Date;
}>): GreaterRealmProductionPagesEvidence {
  const verifiedAtMs = exactDate(
    input.verifiedAt,
    'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID',
  );
  if (!validFounderCount(input.expectedFounderCount)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_FOUNDER_COUNT_INVALID');
  }
  if (!validMaximumAge(input.maximumAgeMilliseconds)) {
    fail('GREATER_REALM_PAGES_EVIDENCE_MAXIMUM_AGE_INVALID');
  }
  const expiresAtMs = verifiedAtMs + input.maximumAgeMilliseconds;
  if (
    !Number.isSafeInteger(expiresAtMs)
    || expiresAtMs > 8_640_000_000_000_000
  ) {
    fail('GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID');
  }
  const recordedAt = input.verifiedAt.toISOString();
  const expiresAt = new Date(expiresAtMs).toISOString();
  const expectedSourceRelease = parseSourceRelease(
    input.expectedSourceRelease,
    'GREATER_REALM_PAGES_EVIDENCE_EXPECTED_SOURCE_INVALID',
  );
  const activeVerification = parseActiveVerification(
    input.activeVerification,
    expectedSourceRelease,
    input.expectedFounderCount,
  );
  const founderCapacityRemaining = MAX_FOUNDERS - input.expectedFounderCount;
  return parseGreaterRealmProductionPagesEvidence({
    schemaVersion: 1,
    kind: GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND,
    recordedAt,
    expiresAt,
    maximumAgeMilliseconds: input.maximumAgeMilliseconds,
    target: GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET,
    sourceRelease: expectedSourceRelease,
    expectedFounderCount: input.expectedFounderCount,
    founderCapacityRemaining,
    activeAdmissionEligible: input.expectedFounderCount < MAX_FOUNDERS,
    activeVerification,
  }, {
    expectedSourceRelease,
    expectedFounderCount: input.expectedFounderCount,
    maximumAgeMilliseconds: input.maximumAgeMilliseconds,
    now: input.verifiedAt,
  });
}

function readExactExpectedFile(path: string, expected: Buffer): void {
  const opened = stableFile(
    path,
    1,
    'GREATER_REALM_PAGES_EVIDENCE_EXISTING_MISMATCH',
  );
  try {
    if (!opened.bytes.equals(expected)) {
      fail('GREATER_REALM_PAGES_EVIDENCE_EXISTING_MISMATCH');
    }
  } finally {
    opened.bytes.fill(0);
  }
}

function temporarySuffix(randomBytesImpl: (size: number) => Buffer): string {
  let bytes: Buffer | undefined;
  try {
    bytes = randomBytesImpl(12);
    if (!Buffer.isBuffer(bytes) || bytes.byteLength !== 12) {
      fail('GREATER_REALM_PAGES_EVIDENCE_RANDOM_INVALID');
    }
    return bytes.toString('hex');
  } catch (error) {
    if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
    return fail('GREATER_REALM_PAGES_EVIDENCE_RANDOM_INVALID');
  } finally {
    bytes?.fill(0);
  }
}

/**
 * Durably publish a content-addressed 0600 evidence file without replacement.
 * A hard-link commit leaves either no destination or the complete fsynced body.
 * The production entry point supplies `verifiedAt` immediately after its
 * authenticated active-production verification resolves; downstream handoff
 * verification orders it after module deployment and before bridge preparation.
 */
function writePrivateGreaterRealmProductionPagesEvidence(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  activeVerification: GreaterRealmProductionVerificationReceipt;
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  maximumAgeMilliseconds: number;
  verifiedAt?: Date;
  randomBytesImpl?: (size: number) => Buffer;
}>): GreaterRealmProductionPagesEvidenceWriteResult {
  const verifiedAt = input.verifiedAt ?? new Date();
  const evidence = buildEvidence({
    activeVerification: input.activeVerification,
    expectedSourceRelease: input.expectedSourceRelease,
    expectedFounderCount: input.expectedFounderCount,
    maximumAgeMilliseconds: input.maximumAgeMilliseconds,
    verifiedAt,
  });
  const bytes = canonicalEvidenceBytes(evidence);
  try {
    const evidenceDigest = digest(bytes);
    const directory = ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: input.directory,
      repositoryRoot: input.repositoryRoot,
    });
    const basename = `greater-realm-pages-active-v17-${evidenceDigest}.json`;
    const destination = join(directory, basename);
    if (existsSync(destination)) {
      repairLinkedTemporaries(directory);
      readExactExpectedFile(destination, bytes);
      return Object.freeze({
        path: destination,
        evidenceDigest,
        recordedAt: evidence.recordedAt,
        expiresAt: evidence.expiresAt,
        result: 'unchanged',
        evidence,
      });
    }
    const suffix = temporarySuffix(input.randomBytesImpl ?? randomBytes);
    const temporary = join(
      directory,
      `.${basename.slice(0, -5)}-${suffix}.json.tmp`,
    );
    let descriptor: number | undefined;
    let identity: Readonly<{ dev: number; ino: number }> | undefined;
    let installed = false;
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
        const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
        if (written <= 0) fail('GREATER_REALM_PAGES_EVIDENCE_WRITE_FAILED');
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
      ) fail('GREATER_REALM_PAGES_EVIDENCE_WRITE_FAILED');
      closeSync(descriptor);
      descriptor = undefined;
      try {
        linkSync(temporary, destination);
        installed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        repairLinkedTemporaries(directory);
        readExactExpectedFile(destination, bytes);
      }
      unlinkExact(temporary, identity);
      identity = undefined;
      fsyncDirectory(directory);
      readExactExpectedFile(destination, bytes);
      return Object.freeze({
        path: destination,
        evidenceDigest,
        recordedAt: evidence.recordedAt,
        expiresAt: evidence.expiresAt,
        result: installed ? 'installed' : 'unchanged',
        evidence,
      });
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve the primary error. */ }
      }
      if (identity !== undefined) {
        try { unlinkExact(temporary, identity); } catch { /* Preserve the primary error. */ }
      }
      if (error instanceof GreaterRealmProductionPagesEvidenceError) throw error;
      fail('GREATER_REALM_PAGES_EVIDENCE_WRITE_FAILED');
    }
  } finally {
    bytes.fill(0);
  }
}

/**
 * Perform the authenticated Maincloud verification and timestamp its result
 * in the same trusted process before publishing private Pages evidence.
 */
export async function verifyAndWritePrivateGreaterRealmProductionPagesEvidence(
  input: Readonly<{
    directory: string;
    repositoryRoot: string;
    adminSecretPath: string;
    environment: Readonly<Record<string, string | undefined>>;
    workspaceRoot?: string;
    expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
    expectedFounderCount: number;
    maximumAgeMilliseconds: number;
    testOnlyExecuteVerifier?: typeof executeGreaterRealmProductionVerifier;
    testOnlyInspect?: () => Promise<unknown>;
    testOnlyNow?: Date;
    randomBytesImpl?: (size: number) => Buffer;
  }>,
): Promise<GreaterRealmProductionPagesEvidenceWriteResult> {
  if (
    (
      input.testOnlyExecuteVerifier !== undefined
      || input.testOnlyInspect !== undefined
      || input.testOnlyNow !== undefined
    )
    && process.env.NODE_ENV !== 'test'
  ) fail('GREATER_REALM_PAGES_EVIDENCE_TEST_ONLY_DEPENDENCY_FORBIDDEN');
  const startedAt = input.testOnlyNow ?? new Date();
  exactDate(startedAt, 'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID');
  const executeVerifier = input.testOnlyExecuteVerifier
    ?? executeGreaterRealmProductionVerifier;
  const activeVerification = await executeVerifier({
    expectedFounderCount: input.expectedFounderCount,
    adminSecretPath: input.adminSecretPath,
    environment: input.environment,
    workspaceRoot: input.workspaceRoot,
    ...(input.testOnlyInspect === undefined
      ? {}
      : { inspect: input.testOnlyInspect }),
  });
  const verifiedAt = input.testOnlyNow ?? new Date();
  if (
    exactDate(verifiedAt, 'GREATER_REALM_PAGES_EVIDENCE_TIME_INVALID')
      < startedAt.getTime()
  ) fail('GREATER_REALM_PAGES_EVIDENCE_CLOCK_NOT_MONOTONIC');
  return writePrivateGreaterRealmProductionPagesEvidence({
    directory: input.directory,
    repositoryRoot: input.repositoryRoot,
    activeVerification,
    expectedSourceRelease: input.expectedSourceRelease,
    expectedFounderCount: input.expectedFounderCount,
    maximumAgeMilliseconds: input.maximumAgeMilliseconds,
    verifiedAt,
    randomBytesImpl: input.randomBytesImpl,
  });
}

/** Test-only canonical writer used to exercise filesystem crash boundaries. */
export function testOnlyWritePrivateGreaterRealmProductionPagesEvidence(
  input: Parameters<typeof writePrivateGreaterRealmProductionPagesEvidence>[0],
): GreaterRealmProductionPagesEvidenceWriteResult {
  if (process.env.NODE_ENV !== 'test') {
    fail('GREATER_REALM_PAGES_EVIDENCE_TEST_ONLY_WRITER_FORBIDDEN');
  }
  return writePrivateGreaterRealmProductionPagesEvidence(input);
}

/** Strictly read a caller-bound content-addressed evidence file. */
export function readPrivateGreaterRealmProductionPagesEvidence(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  evidencePath: string;
  expectedEvidenceDigest: string;
  expectedSourceRelease: GreaterRealmProductionPagesEvidenceSourceRelease;
  expectedFounderCount: number;
  maximumAgeMilliseconds: number;
  now?: Date;
}>): GreaterRealmProductionPagesEvidence {
  if (
    typeof input.expectedEvidenceDigest !== 'string'
    || !SHA256.test(input.expectedEvidenceDigest)
  ) fail('GREATER_REALM_PAGES_EVIDENCE_DIGEST_INVALID');
  const directory = ensureGreaterRealmProductionPagesEvidenceDirectory({
    directory: input.directory,
    repositoryRoot: input.repositoryRoot,
  });
  if (
    typeof input.evidencePath !== 'string'
    || !isAbsolute(input.evidencePath)
    || resolve(input.evidencePath) !== input.evidencePath
    || dirname(input.evidencePath) !== directory
    || input.evidencePath !== join(
      directory,
      `greater-realm-pages-active-v17-${input.expectedEvidenceDigest}.json`,
    )
  ) fail('GREATER_REALM_PAGES_EVIDENCE_PATH_INVALID');
  const opened = readContentAddressedFile(
    input.evidencePath,
    input.expectedEvidenceDigest,
    1,
  );
  try {
    return parseCanonicalEvidenceBytes(opened.bytes, {
      expectedSourceRelease: input.expectedSourceRelease,
      expectedFounderCount: input.expectedFounderCount,
      maximumAgeMilliseconds: input.maximumAgeMilliseconds,
      now: input.now,
    });
  } finally {
    opened.bytes.fill(0);
  }
}
