/**
 * Exact, audited candidate-geography exhaustion outcomes.
 *
 * These codes mean a deterministic seed exhausted a bounded placement search
 * or cannot reconcile its otherwise valid geography with an immutable atlas
 * constraint; the batch generator may record the attempt and continue with
 * the next ordinal. Invariants, malformed input, toolchain, filesystem, and
 * package failures must remain ordinary fatal errors and are intentionally
 * absent.
 */
export const GREATER_REALM_CANDIDATE_REJECTION_CODES = Object.freeze([
  'GREATER_REALM_TECTONIC_DOMAIN_PLACEMENT_FAILED',
  'GREATER_REALM_ISLAND_ARC_PLACEMENT_FAILED',
  'GREATER_REALM_ACTIVE_MASK_EMPTY',
  'GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_MISSING',
  'GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_FAILED',
  'GREATER_REALM_OCEAN_OUTLETS_MISSING',
  'GREATER_REALM_RECONCILED_OCEAN_OUTLETS_MISSING',
  'GREATER_REALM_LEGACY_LOWLANDS_RESERVE_TOO_LARGE',
  'GREATER_REALM_STRATEGIC_BASIN_CAPACITY_INVARIANT',
  'GREATER_REALM_TIER_THREE_CAPACITY_INVARIANT',
  'GREATER_REALM_TIER_TWO_CAPACITY_INVARIANT',
  'GREATER_REALM_STRATEGIC_HIGHLAND_REFERENCE_MISSING',
  'GREATER_REALM_HYDROLOGY_BODY_SURFACE_GEOGRAPHY_EXHAUSTED',
] as const);

export type GreaterRealmCandidateRejectionCode =
  typeof GREATER_REALM_CANDIDATE_REJECTION_CODES[number];

const CANDIDATE_REJECTION_CODE_SET: ReadonlySet<string> = new Set(
  GREATER_REALM_CANDIDATE_REJECTION_CODES,
);

export class GreaterRealmCandidateRejectionError extends Error {
  readonly code: GreaterRealmCandidateRejectionCode;

  constructor(code: GreaterRealmCandidateRejectionCode) {
    super(code);
    if (!CANDIDATE_REJECTION_CODE_SET.has(code)) {
      throw new Error('GREATER_REALM_CANDIDATE_REJECTION_CODE_INVALID');
    }
    this.name = 'GreaterRealmCandidateRejectionError';
    this.code = code;
  }
}

export function rejectGreaterRealmCandidate(
  code: GreaterRealmCandidateRejectionCode,
): never {
  throw new GreaterRealmCandidateRejectionError(code);
}

/** Never classify an ordinary Error merely because its message matches. */
export function greaterRealmCandidateRejectionCode(
  error: unknown,
): GreaterRealmCandidateRejectionCode | undefined {
  return error instanceof GreaterRealmCandidateRejectionError
    ? error.code
    : undefined;
}
