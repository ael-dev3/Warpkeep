import { SenderError } from 'spacetimedb';
import { describe, expect, it, vi } from 'vitest';

import {
  INNER_KEEP_PROJECT_REVISION_MAX
} from '../src/components/inner-keep/innerKeepPresentation';
import {
  classifyInnerKeepDefinitiveRejection,
  innerKeepCommandAttemptFor,
  innerKeepCommandAttemptWithPhase,
  reconcileInnerKeepCommandAttempt,
  type InnerKeepCommandIntent,
  type InnerKeepCommandScope
} from '../src/spacetime/innerKeepCommandIdempotency';
import {
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION
} from '../spacetimedb/src/innerKeepPolicy';
import {
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_LAYOUT_ID,
  INNER_KEEP_LAYOUT_VERSION
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';

const scope: InnerKeepCommandScope = Object.freeze({
  generation: 4,
  fid: 12_345,
  castleId: 7n,
  backendProtocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
  layoutId: INNER_KEEP_LAYOUT_ID,
  layoutVersion: INNER_KEEP_LAYOUT_VERSION,
  policyVersion: INNER_KEEP_POLICY_VERSION,
  policyDigest: INNER_KEEP_POLICY_DIGEST,
  layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
  assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
  projectRevision: 3n
});

const placement = Object.freeze({
  localXMicrounits: 14_000_000n,
  localZMicrounits: -10_000_000n,
  rotationMilliDegrees: 0
});

const intent: InnerKeepCommandIntent = Object.freeze({
  buildingKind: 'city-mill',
  placement,
  targetLevel: 1,
  cost: Object.freeze({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
  durationMicros: 86_400_000_000n
});

describe('Inner Keep command idempotency', () => {
  it('retains one key only for the exact caller/generation/policy/project quote', () => {
    const createKey = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003');
    const first = innerKeepCommandAttemptFor(undefined, scope, intent, createKey);
    expect(innerKeepCommandAttemptFor(first, { ...scope }, { ...intent }, createKey)).toBe(first);
    const later = innerKeepCommandAttemptFor(
      first,
      { ...scope, projectRevision: 4n },
      intent,
      createKey
    );
    expect(later?.requestKey).toBe('00000000-0000-4000-8000-000000000002');
    expect(createKey).toHaveBeenCalledTimes(2);
    expect(innerKeepCommandAttemptFor(
      undefined,
      { ...scope, backendProtocolVersion: scope.backendProtocolVersion + 1 },
      intent,
      createKey
    )).toBeUndefined();
    expect(innerKeepCommandAttemptFor(
      undefined,
      { ...scope, projectRevision: INNER_KEEP_PROJECT_REVISION_MAX + 1n },
      intent,
      createKey
    )).toBeUndefined();
    expect(innerKeepCommandAttemptFor(
      undefined,
      { ...scope, policyDigest: '0'.repeat(64) },
      intent,
      createKey
    )).toBeUndefined();
    expect(innerKeepCommandAttemptFor(
      first,
      scope,
      { ...intent, placement: { ...placement, rotationMilliDegrees: 90_000 } },
      createKey
    )?.fingerprint).not.toBe(first?.fingerprint);
    expect(createKey).toHaveBeenCalledTimes(3);
  });

  it('requires both the exact private receipt and public building before confirmation', () => {
    const attempt = innerKeepCommandAttemptWithPhase(
      innerKeepCommandAttemptFor(
        undefined,
        scope,
        intent,
        () => '00000000-0000-4000-8000-000000000001'
      )!,
      'ambiguous'
    );
    const receipt = Object.freeze({
      found: true as const,
      castleId: 7n,
      buildingKey: '7:city-mill',
      buildingKind: 'city-mill' as const,
      placement,
      targetLevel: 1,
      deducted: intent.cost,
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    expect(reconcileInnerKeepCommandAttempt(attempt, receipt, [])).toBe('pending');
    expect(reconcileInnerKeepCommandAttempt(attempt, receipt, [Object.freeze({
      castleId: 7n,
      buildingKey: '7:city-mill',
      buildingKind: 'city-mill',
      placement,
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    })])).toBe('confirmed');
    expect(reconcileInnerKeepCommandAttempt(attempt, receipt, [Object.freeze({
      castleId: 7n,
      buildingKey: '7:city-mill',
      buildingKind: 'city-mill',
      placement,
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: 101n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    })])).toBe('pending');
    expect(reconcileInnerKeepCommandAttempt(attempt, {
      ...receipt,
      deducted: { ...receipt.deducted, wood: 899n }
    }, [])).toBe('conflict');
  });

  it('confirms an exact receipt after the public building has advanced monotonically', () => {
    const attempt = innerKeepCommandAttemptWithPhase(
      innerKeepCommandAttemptFor(
        undefined,
        scope,
        intent,
        () => '00000000-0000-4000-8000-000000000001'
      )!,
      'ambiguous'
    );
    const receipt = Object.freeze({
      found: true as const,
      castleId: 7n,
      buildingKey: '7:city-mill',
      buildingKind: 'city-mill' as const,
      placement,
      targetLevel: 1,
      deducted: intent.cost,
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    const laterProject = Object.freeze({
      castleId: 7n,
      buildingKey: '7:city-mill',
      buildingKind: 'city-mill' as const,
      placement,
      completedLevel: 1,
      targetLevel: 2,
      phase: 'constructing' as const,
      startedAtMicros: 200n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });

    expect(reconcileInnerKeepCommandAttempt(attempt, receipt, [laterProject]))
      .toBe('confirmed');
    expect(reconcileInnerKeepCommandAttempt(attempt, receipt, [Object.freeze({
      ...laterProject,
      completedLevel: 2,
      phase: 'complete' as const
    })])).toBe('confirmed');
  });

  it('classifies only reviewed SDK SenderError codes as definitive rejections', () => {
    expect(classifyInnerKeepDefinitiveRejection(
      new SenderError('INNER_KEEP_INSUFFICIENT_WOOD')
    )).toEqual({
      code: 'INNER_KEEP_INSUFFICIENT_WOOD',
      statusMessage: 'There is not enough stored Wood for this project.'
    });
    expect(classifyInnerKeepDefinitiveRejection(
      new SenderError('INNER_KEEP_STATE_CHANGED')
    )).toEqual({
      code: 'INNER_KEEP_STATE_CHANGED',
      statusMessage: 'Inner Keep state changed. Review the refreshed quote before trying again.'
    });
    expect(classifyInnerKeepDefinitiveRejection(
      new SenderError('INNER_KEEP_PLACEMENT_ROTATION')
    )).toEqual({
      code: 'INNER_KEEP_PLACEMENT_ROTATION',
      statusMessage: 'Choose one of the four supported building orientations.'
    });
    expect(classifyInnerKeepDefinitiveRejection(
      new Error('INNER_KEEP_INSUFFICIENT_WOOD')
    )).toBeUndefined();
    expect(classifyInnerKeepDefinitiveRejection(
      new SenderError('unreviewed server copy with private detail')
    )).toBeUndefined();
  });
});
