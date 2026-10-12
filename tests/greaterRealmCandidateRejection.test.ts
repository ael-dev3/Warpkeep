// @vitest-environment node

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  classifyGreaterRealmTierTwoApronSearchFailure,
  classifyGreaterRealmTierTwoAssignmentFailure,
  GREATER_REALM_CANDIDATE_REJECTION_CODES,
  GREATER_REALM_TIER_TWO_APRON_FRONTIER_TRUNCATION_KINDS,
  GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON,
  GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_REASONS,
  GreaterRealmCandidateRejectionError,
  greaterRealmCandidateRejectionCode,
  greaterRealmCandidateRejectionFrontierTruncationKinds,
  isCanonicalGreaterRealmTierTwoApronFrontierTruncationKinds,
  prioritizeGreaterRealmTierTwoApronFrontierTruncation,
  rejectGreaterRealmCandidate,
  rejectGreaterRealmTierTwoCapacity,
  type GreaterRealmCandidateRejectionCode,
} from '../scripts/atlas/greater-realm-candidate-rejection';
import {
  measureGreaterRealmRegionBoundaryAlignment,
} from '../scripts/atlas/greater-realm-strategic-audits';

describe('Greater Realm expected candidate rejection boundary', () => {
  it('does not call a truncated apron frontier an exhausted no-match', () => {
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: false,
    })).toBe('DRY_GATE_APRON_NO_MATCH');
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: true,
    })).toBe('DRY_GATE_APRON_FRONTIER_TRUNCATED');
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: true,
      deepestNoMatchStage: 'LOWLANDS_REPAIR_OWNERSHIP',
    })).toBe('DRY_GATE_APRON_FRONTIER_TRUNCATED');
    for (const kind of GREATER_REALM_TIER_TWO_APRON_FRONTIER_TRUNCATION_KINDS) {
      const reason = classifyGreaterRealmTierTwoApronSearchFailure({
        outcome: 'no-match',
        frontierTruncated: true,
        frontierTruncationKind: kind,
      });
      expect(reason).toBe(`DRY_GATE_APRON_FRONTIER_TRUNCATED_AT_${kind}`);
      expect(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON[reason])
        .toBe(`GREATER_REALM_TIER_TWO_${reason}`);
      expect(GREATER_REALM_CANDIDATE_REJECTION_CODES)
        .toContain(`GREATER_REALM_TIER_TWO_${reason}`);
    }
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: false,
      deepestNoMatchStage: 'POST_REPARTITION_OWNERSHIP',
    })).toBe('DRY_GATE_APRON_NO_MATCH_AFTER_POST_REPARTITION_CHECK');
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'search-node-limit',
      frontierTruncated: true,
    })).toBe('DRY_GATE_APRON_SEARCH_NODE_LIMIT');
    expect(classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'complete-plan-limit',
      frontierTruncated: true,
    })).toBe('DRY_GATE_APRON_COMPLETE_PLAN_LIMIT');
    expect(() => classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: 'unknown' as unknown as boolean,
    })).toThrow('GREATER_REALM_TIER_TWO_APRON_SEARCH_DIAGNOSTICS_INVALID');
    expect(() => classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: false,
      frontierTruncationKind: 'EDGE_CANDIDATE_LIMIT',
    })).toThrow('GREATER_REALM_TIER_TWO_APRON_SEARCH_DIAGNOSTICS_INVALID');
    expect(() => classifyGreaterRealmTierTwoApronSearchFailure({
      outcome: 'no-match',
      frontierTruncated: true,
      frontierTruncationKind: null,
    })).toThrow('GREATER_REALM_TIER_TWO_APRON_SEARCH_DIAGNOSTICS_INVALID');
  });

  it('reports the earliest truncated apron frontier independent of discovery order', () => {
    expect(prioritizeGreaterRealmTierTwoApronFrontierTruncation(
      'BUNDLE_PAIR_LIMIT',
      'EDGE_CANDIDATE_LIMIT',
    )).toBe('EDGE_CANDIDATE_LIMIT');
    expect(prioritizeGreaterRealmTierTwoApronFrontierTruncation(
      'EDGE_CANDIDATE_LIMIT',
      'BUNDLE_PAIR_LIMIT',
    )).toBe('EDGE_CANDIDATE_LIMIT');
    expect(prioritizeGreaterRealmTierTwoApronFrontierTruncation(
      null,
      'CAPACITY_ASSIGNMENT_LIMIT',
    )).toBe('CAPACITY_ASSIGNMENT_LIMIT');
  });

  it('separates missing parent slots, split lane coverage, and capacity failure', () => {
    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [2, 1, 0],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [1, 0, 0],
        infeasibleComponentCombinations: 0,
      },
    )).toBe('GATE_PARENT_GLASSWATER_SLOT_MISSING');

    for (const [parentIndex, reason] of [
      [0, 'GATE_PARENT_CROWNWOOD_SLOT_MISSING'],
      [1, 'GATE_PARENT_IRONVEIL_SLOT_MISSING'],
      [2, 'GATE_PARENT_GLASSWATER_SLOT_MISSING'],
    ] as const) {
      const ordinaryCounts = [1, 1, 1];
      const repairCounts = [1, 1, 1];
      ordinaryCounts[parentIndex] = 0;
      repairCounts[parentIndex] = 0;
      expect(classifyGreaterRealmTierTwoAssignmentFailure(
        {
          eligibleComponentCountsByParent: ordinaryCounts,
          infeasibleComponentCombinations: 0,
        },
        {
          eligibleComponentCountsByParent: repairCounts,
          infeasibleComponentCombinations: 0,
        },
      )).toBe(reason);
    }

    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [0, 0, 1],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [0, 0, 1],
        infeasibleComponentCombinations: 0,
      },
    )).toBe('GATE_PARENT_SLOT_MISSING');

    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [1, 1, 0],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [0, 0, 1],
        infeasibleComponentCombinations: 0,
      },
    )).toBe('ASSIGNMENT_MISSING');

    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [1, 1, 1],
        infeasibleComponentCombinations: 1,
      },
      {
        eligibleComponentCountsByParent: [1, 1, 1],
        infeasibleComponentCombinations: 0,
      },
    )).toBe('CAPACITY_ASSIGNMENT_INFEASIBLE');

    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [0, 1, 1],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [0, 1, 1],
        infeasibleComponentCombinations: 1,
      },
      'EDGE_CANDIDATE_LIMIT',
    )).toBe('DRY_GATE_APRON_FRONTIER_TRUNCATED_AT_EDGE_CANDIDATE_LIMIT');

    expect(classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [1, 1, 1],
        infeasibleComponentCombinations: 1,
      },
      {
        eligibleComponentCountsByParent: [1, 1, 1],
        infeasibleComponentCombinations: 0,
      },
      'BUNDLE_PAIR_LIMIT',
    )).toBe('DRY_GATE_APRON_FRONTIER_TRUNCATED_AT_BUNDLE_PAIR_LIMIT');

    expect(() => classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [1, 1, 1],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [1, 1],
        infeasibleComponentCombinations: 0,
      },
    )).toThrow('GREATER_REALM_TIER_TWO_ASSIGNMENT_DIAGNOSTICS_INVALID');

    expect(() => classifyGreaterRealmTierTwoAssignmentFailure(
      {
        eligibleComponentCountsByParent: [1, 1, 1, 1],
        infeasibleComponentCombinations: 0,
      },
      {
        eligibleComponentCountsByParent: [1, 1, 1, 1],
        infeasibleComponentCombinations: 0,
      },
    )).toThrow('GREATER_REALM_TIER_TWO_ASSIGNMENT_DIAGNOSTICS_INVALID');
  });

  it('keeps one exact frozen allowlist of geography-search exhaustion codes', () => {
    expect(GREATER_REALM_CANDIDATE_REJECTION_CODES).toEqual([
      'GREATER_REALM_TECTONIC_DOMAIN_PLACEMENT_FAILED',
      'GREATER_REALM_ISLAND_ARC_PLACEMENT_FAILED',
      'GREATER_REALM_ACTIVE_MASK_EMPTY',
      'GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE',
      'GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_MISSING',
      'GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_FAILED',
      'GREATER_REALM_OCEAN_OUTLETS_MISSING',
      'GREATER_REALM_RECONCILED_OCEAN_OUTLETS_MISSING',
      'GREATER_REALM_LEGACY_LOWLANDS_RESERVE_TOO_LARGE',
      'GREATER_REALM_STRATEGIC_BASIN_CAPACITY_INVARIANT',
      'GREATER_REALM_TIER_THREE_CAPACITY_INVARIANT',
      'GREATER_REALM_TIER_TWO_CAPACITY_INVARIANT',
      ...Object.values(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON),
      'GREATER_REALM_STRATEGIC_HIGHLAND_REFERENCE_MISSING',
      'GREATER_REALM_HYDROLOGY_BODY_SURFACE_GEOGRAPHY_EXHAUSTED',
    ]);
    expect(Object.isFrozen(GREATER_REALM_CANDIDATE_REJECTION_CODES)).toBe(true);
    expect(new Set(GREATER_REALM_CANDIDATE_REJECTION_CODES).size)
      .toBe(GREATER_REALM_CANDIDATE_REJECTION_CODES.length);
  });

  it('maps every public-safe Tier-II terminal reason one-to-one', () => {
    const codes = Object.values(
      GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON,
    );
    expect(Object.isFrozen(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_REASONS))
      .toBe(true);
    expect(Object.isFrozen(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON))
      .toBe(true);
    expect(Object.keys(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON))
      .toEqual(GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_REASONS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain('GREATER_REALM_TIER_TWO_CAPACITY_INVARIANT');
    for (const reason of GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_REASONS) {
      try {
        rejectGreaterRealmTierTwoCapacity(reason);
      } catch (error) {
        expect(greaterRealmCandidateRejectionCode(error)).toBe(
          GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_CODE_BY_REASON[reason],
        );
        continue;
      }
      throw new Error('GREATER_REALM_TIER_TWO_REJECTION_FACTORY_DID_NOT_THROW');
    }
  });

  it('keeps the historical broad code out of the .31 generator', () => {
    const generatorSource = readFileSync(new URL(
      '../scripts/atlas/greater-realm-candidate-generator.ts',
      import.meta.url,
    ), 'utf8');
    const rejectionSource = readFileSync(new URL(
      '../scripts/atlas/greater-realm-candidate-rejection.ts',
      import.meta.url,
    ), 'utf8');
    expect(generatorSource).toContain(
      "'greater-realm-v2-natural-continent-pr-a.53'",
    );
    expect(generatorSource).not.toContain(
      "'greater-realm-v2-natural-continent-pr-a.18'",
    );
    expect(generatorSource).not.toContain(
      "'GREATER_REALM_TIER_TWO_CAPACITY_INVARIANT'",
    );
    for (const reason of GREATER_REALM_TIER_TWO_CAPACITY_REJECTION_REASONS) {
      expect(`${generatorSource}\n${rejectionSource}`).toContain(`'${reason}'`);
    }
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

  it('preserves every canonical observed frontier truncation on typed rejection', () => {
    const code = 'GREATER_REALM_TIER_TWO_DRY_GATE_APRON_FRONTIER_TRUNCATED_AT_BUNDLE_PAIR_LIMIT';
    const kinds = Object.freeze(['BUNDLE_PAIR_LIMIT', 'BUNDLE_OPTION_LIMIT'] as const);
    const typed = new GreaterRealmCandidateRejectionError(code, kinds);

    expect(typed.code).toBe(code);
    expect(typed.frontierTruncationKinds).toEqual(kinds);
    expect(greaterRealmCandidateRejectionFrontierTruncationKinds(typed)).toEqual(kinds);
    expect(greaterRealmCandidateRejectionFrontierTruncationKinds(new Error(code))).toEqual([]);
    expect(isCanonicalGreaterRealmTierTwoApronFrontierTruncationKinds(kinds)).toBe(true);
    expect(isCanonicalGreaterRealmTierTwoApronFrontierTruncationKinds([
      'BUNDLE_OPTION_LIMIT',
      'BUNDLE_PAIR_LIMIT',
    ])).toBe(false);
    expect(() => new GreaterRealmCandidateRejectionError(code, [
      'BUNDLE_PAIR_LIMIT',
      'BUNDLE_PAIR_LIMIT',
    ])).toThrow('GREATER_REALM_CANDIDATE_REJECTION_DIAGNOSTICS_INVALID');
  });

  it('keeps direct audit range failures fatal while branding only generator geography', () => {
    const geographyCode = 'GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE';
    const branded = new GreaterRealmCandidateRejectionError(geographyCode);
    let directAuditFailure: unknown;
    try {
      measureGreaterRealmRegionBoundaryAlignment({
        grid: { cellCount: 150_001 } as Parameters<
          typeof measureGreaterRealmRegionBoundaryAlignment
        >[0]['grid'],
        regionId: new Uint8Array(),
        waterRegime: new Uint8Array(),
        barrier: new Uint8Array(),
        geologicalBarrierBand: new Uint8Array(),
        watershedId: new Int32Array(),
        ridgeId: new Int32Array(),
        landformId: new Uint8Array(),
        biomeId: new Uint8Array(),
      });
    } catch (error) {
      directAuditFailure = error;
    }

    expect(directAuditFailure).toBeInstanceOf(Error);
    expect((directAuditFailure as Error).message)
      .toBe('GREATER_REALM_AUDIT_GRID_SIZE_INVALID');
    expect(greaterRealmCandidateRejectionCode(directAuditFailure)).toBeUndefined();
    expect(greaterRealmCandidateRejectionCode(new Error(geographyCode))).toBeUndefined();
    expect(greaterRealmCandidateRejectionCode(branded)).toBe(geographyCode);
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
