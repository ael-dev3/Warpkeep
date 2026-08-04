// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_CANDIDATE_REJECTION_CODES,
  GreaterRealmCandidateRejectionError,
  greaterRealmCandidateRejectionCode,
  rejectGreaterRealmCandidate,
  type GreaterRealmCandidateRejectionCode,
} from '../scripts/atlas/greater-realm-candidate-rejection';

describe('Greater Realm expected candidate rejection boundary', () => {
  it('keeps one exact frozen allowlist of geography-search exhaustion codes', () => {
    expect(GREATER_REALM_CANDIDATE_REJECTION_CODES).toEqual([
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
    ]);
    expect(Object.isFrozen(GREATER_REALM_CANDIDATE_REJECTION_CODES)).toBe(true);
    expect(new Set(GREATER_REALM_CANDIDATE_REJECTION_CODES).size)
      .toBe(GREATER_REALM_CANDIDATE_REJECTION_CODES.length);
  });

  it('classifies only the typed error and never a message-compatible Error', () => {
    const code = GREATER_REALM_CANDIDATE_REJECTION_CODES[0];
    const typed = new GreaterRealmCandidateRejectionError(code);

    expect(typed).toBeInstanceOf(GreaterRealmCandidateRejectionError);
    expect(typed.code).toBe(code);
    expect(typed.message).toBe(code);
    expect(greaterRealmCandidateRejectionCode(typed)).toBe(code);
    expect(greaterRealmCandidateRejectionCode(new Error(code))).toBeUndefined();
    expect(greaterRealmCandidateRejectionCode({ name: typed.name, code })).toBeUndefined();
  });

  it('rejects a runtime-forged code outside the audited union', () => {
    for (const fatalCode of [
      'GREATER_REALM_FLOW_CYCLE',
      'GREATER_REALM_SEDIMENT_BUDGET_MISMATCH',
      'GREATER_REALM_PARENT_BASIN_ANCHOR_MISSING',
      'GREATER_REALM_GATE_PARENT_ASSIGNMENT_FAILED',
    ]) {
      expect(GREATER_REALM_CANDIDATE_REJECTION_CODES).not.toContain(fatalCode);
      expect(() => new GreaterRealmCandidateRejectionError(
        fatalCode as GreaterRealmCandidateRejectionCode,
      )).toThrow('GREATER_REALM_CANDIDATE_REJECTION_CODE_INVALID');
    }
  });

  it('throws the typed rejection through the dedicated factory', () => {
    const code = GREATER_REALM_CANDIDATE_REJECTION_CODES[1];
    try {
      rejectGreaterRealmCandidate(code);
    } catch (error) {
      expect(error).toBeInstanceOf(GreaterRealmCandidateRejectionError);
      expect(greaterRealmCandidateRejectionCode(error)).toBe(code);
      return;
    }
    throw new Error('GREATER_REALM_REJECTION_FACTORY_DID_NOT_THROW');
  });
});
