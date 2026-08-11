import {
  GREATER_REALM_ATLAS_ID,
  GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY,
  GREATER_REALM_SANITIZED_REVIEW_SCHEMA,
  type GreaterRealmSanitizedCandidate,
  type GreaterRealmSanitizedReview,
} from './greater-realm-contracts';
import {
  parseGreaterRealmSanitizedReview,
} from './greater-realm-sanitized-review';

export const GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA =
  'warpkeep.greater-realm.pending-owner-report.v1' as const;

const PENDING_OWNER_REPORT_SOURCE_KEYS = Object.freeze([
  'sanitizedReview',
  'privatePackageVerified',
] as const);

const PENDING_OWNER_REPORT_KEYS = Object.freeze([
  'schema',
  'atlasId',
  'generatorVersion',
  'sourceCommit',
  'reviewBatchHandle',
  'sourceReportDigest',
  'worldCount',
  'candidate',
  'automatedValidationStatus',
  'ownerValidationStatus',
  'selectionStatus',
  'selectedCandidateHandle',
  'activationStatus',
  'productionUntouched',
  'privacyBoundary',
] as const);

type UnknownRecord = Readonly<Record<string, unknown>>;

export type GreaterRealmPendingOwnerReportSource = Readonly<{
  /**
   * A canonical artifact previously accepted by
   * `parseGreaterRealmSanitizedReview`. Raw private candidates are not a valid
   * input to this API.
   */
  sanitizedReview: unknown;
  /**
   * The caller may set this literal only after private-package verification
   * succeeds. The CLI invokes this projection only after that verification.
   */
  privatePackageVerified: true;
}>;

export type GreaterRealmPendingOwnerReport = Readonly<{
  schema: typeof GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA;
  atlasId: typeof GREATER_REALM_ATLAS_ID;
  generatorVersion: string;
  sourceCommit: string;
  reviewBatchHandle: string;
  /** Digest of the canonical sanitized review reconstructed by the parser. */
  sourceReportDigest: string;
  worldCount: 1;
  candidate: GreaterRealmSanitizedCandidate;
  automatedValidationStatus: 'private-package-and-sanitized-aggregate-verified';
  ownerValidationStatus: 'pending';
  selectionStatus: 'pending';
  selectedCandidateHandle: null;
  activationStatus: 'inactive';
  productionUntouched: true;
  privacyBoundary: typeof GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY;
}>;

export class GreaterRealmPendingOwnerReportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmPendingOwnerReportError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmPendingOwnerReportError(code);
}

function exactDataRecord(value: unknown, keys: readonly string[]): UnknownRecord {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) {
    fail('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) {
    fail('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');
  }
  return value as UnknownRecord;
}

function assertOnePendingWorld(review: GreaterRealmSanitizedReview): void {
  const candidate = review.candidates[0];
  if (
    review.schema !== GREATER_REALM_SANITIZED_REVIEW_SCHEMA
    || review.selectionStatus !== 'pending'
    || review.selectedCandidateHandle !== null
    || review.candidateCount !== 1
    || review.candidates.length !== 1
    || candidate === undefined
    || candidate.eligible !== true
    || candidate.insideApprovedRange !== true
    || Object.values(candidate.proofs).some(result => result !== true)
  ) fail('GREATER_REALM_PENDING_OWNER_REPORT_REQUIRES_ONE_PENDING_WORLD');
}

function reportFromReview(
  review: GreaterRealmSanitizedReview,
): GreaterRealmPendingOwnerReport {
  assertOnePendingWorld(review);
  return Object.freeze({
    schema: GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA,
    atlasId: GREATER_REALM_ATLAS_ID,
    generatorVersion: review.generatorVersion,
    sourceCommit: review.sourceCommit,
    reviewBatchHandle: review.reviewBatchHandle,
    sourceReportDigest: review.reportDigest,
    worldCount: 1,
    candidate: review.candidates[0]!,
    automatedValidationStatus: 'private-package-and-sanitized-aggregate-verified',
    ownerValidationStatus: 'pending',
    selectionStatus: 'pending',
    selectedCandidateHandle: null,
    activationStatus: 'inactive',
    productionUntouched: true,
    privacyBoundary: GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY,
  });
}

/**
 * Build the public-safe pending owner report only after the private package has
 * been verified and the aggregate review has crossed the existing sanitizer.
 * This helper deliberately has no candidate, package, seed, coordinate, path,
 * or byte-array input surface.
 */
export function createGreaterRealmPendingOwnerReport(
  value: unknown,
): GreaterRealmPendingOwnerReport {
  const source = exactDataRecord(value, PENDING_OWNER_REPORT_SOURCE_KEYS);
  if (source.privatePackageVerified !== true) {
    fail('GREATER_REALM_PENDING_OWNER_REPORT_PACKAGE_NOT_VERIFIED');
  }
  return reportFromReview(parseGreaterRealmSanitizedReview(source.sanitizedReview));
}

/** Parse and re-bind an already-public pending report to its source review digest. */
export function parseGreaterRealmPendingOwnerReport(
  value: unknown,
): GreaterRealmPendingOwnerReport {
  const row = exactDataRecord(value, PENDING_OWNER_REPORT_KEYS);
  if (
    row.schema !== GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA
    || row.atlasId !== GREATER_REALM_ATLAS_ID
    || row.worldCount !== 1
    || row.automatedValidationStatus
      !== 'private-package-and-sanitized-aggregate-verified'
    || row.ownerValidationStatus !== 'pending'
    || row.selectionStatus !== 'pending'
    || row.selectedCandidateHandle !== null
    || row.activationStatus !== 'inactive'
    || row.productionUntouched !== true
    || row.privacyBoundary !== GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY
  ) fail('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');

  const review = parseGreaterRealmSanitizedReview({
    schema: GREATER_REALM_SANITIZED_REVIEW_SCHEMA,
    generatorVersion: row.generatorVersion,
    sourceCommit: row.sourceCommit,
    reviewBatchHandle: row.reviewBatchHandle,
    selectionStatus: row.selectionStatus,
    selectedCandidateHandle: row.selectedCandidateHandle,
    candidateCount: row.worldCount,
    candidates: [row.candidate],
    privacyBoundary: row.privacyBoundary,
    reportDigest: row.sourceReportDigest,
  });
  return reportFromReview(review);
}

/** Stable JSON bytes; insertion order is reconstructed rather than trusted. */
export function serializeGreaterRealmPendingOwnerReport(value: unknown): string {
  return `${JSON.stringify(parseGreaterRealmPendingOwnerReport(value), null, 2)}\n`;
}
