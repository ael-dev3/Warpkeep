import { describe, expect, it } from 'vitest';

import {
  innerKeepQuoteAffordable
} from '../src/components/inner-keep/innerKeepPresentation';
import {
  decodeInnerKeepPrivateState,
  decodeInnerKeepRequestStatus,
  resolveReadyInnerKeepProjection,
  type InnerKeepBuildingRow,
  type InnerKeepPrivateState,
  type InnerKeepPublicRows,
  type InnerKeepReadScope
} from '../src/spacetime/innerKeepProjection';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_POLICY_VERSION
} from '../spacetimedb/src/innerKeepPolicy';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../src/spacetime/warpkeepProtocol';

const scope: InnerKeepReadScope = Object.freeze({
  generation: 9,
  fid: 12_345,
  castleId: 7n,
  backendProtocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
});

function privatePayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    castleId: 7n,
    componentActive: true,
    componentReady: true,
    builderPresent: true,
    builderBusy: false,
    activeBuildingKey: undefined,
    busyUntilMicros: undefined,
    builderRevision: 0n,
    storedFood: 400n,
    storedWood: 2_000n,
    storedStone: 2_000n,
    storedGold: 2_000n,
    projectedFood: 1_400n,
    projectedWood: 2_000n,
    projectedStone: 2_000n,
    projectedGold: 2_000n,
    resourceRevision: 2n,
    observedAtMicros: 10_000n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
    ...overrides
  };
}

function publicRows(
  buildings: readonly InnerKeepBuildingRow[] = []
): InnerKeepPublicRows {
  return Object.freeze({
    layouts: Object.freeze([Object.freeze({
      ...CANONICAL_INNER_KEEP_LAYOUT,
      active: true,
      activatedAt: Object.freeze({ microsSinceUnixEpoch: 1n })
    })]),
    slots: CANONICAL_INNER_KEEP_SLOTS,
    catalogue: CANONICAL_INNER_KEEP_BUILDING_CATALOG,
    levels: CANONICAL_INNER_KEEP_LEVEL_POLICIES,
    buildings: Object.freeze([...buildings])
  });
}

function readyPrivate(overrides: Readonly<Record<string, unknown>> = {}) {
  const decoded = decodeInnerKeepPrivateState(privatePayload(overrides), scope);
  if (decoded === undefined || decoded === 'unavailable') {
    throw new Error('Expected a ready test Inner Keep state.');
  }
  return decoded;
}

describe('Inner Keep caller-bound projection', () => {
  it('preserves u64 castle identity and treats projected balances as informational only', () => {
    const decoded = readyPrivate();
    const resolved = resolveReadyInnerKeepProjection({
      scope,
      privateState: decoded,
      rows: publicRows(),
      commandsAvailable: true
    });

    expect(resolved?.presentation.castleId).toBe(7n);
    expect(resolved?.presentation.slots).toHaveLength(12);
    expect(resolved?.presentation.catalogue).toHaveLength(4);
    expect(resolved?.presentation.catalogue.every((entry) => (
      /^images\/inner-keep\/catalog\/[a-z-]+-[a-f0-9]{16}\.png$/
        .test(entry.previewUrl ?? '')
    ))).toBe(true);
    expect(resolved?.presentation.quotes).toHaveLength(48);
    expect(resolved?.presentation.resources.available.food).toBe(400n);
    expect(resolved?.presentation.resources.pending?.food).toBe(1_000n);
    const lumber = resolved?.presentation.quotes.find((quote) => (
      quote.slotId === 'inner-keep-slot-m01'
      && quote.buildingKind === 'lumber-camp'
    ));
    expect(lumber?.cost.food).toBe(500n);
    expect(innerKeepQuoteAffordable(
      lumber!,
      resolved!.presentation.resources.available
    )).toBe(false);
  });

  it('derives exact discounted quotes only after a completed public building level', () => {
    const building: InnerKeepBuildingRow = Object.freeze({
      buildingKey: '7:city-mill',
      castleId: 7n,
      slotKey: '7:inner-keep-slot-m01',
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 1,
      targetLevel: 1,
      phase: 'complete',
      startedAtMicros: 100n,
      completesAtMicros: 200n,
      revision: 1n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    const resolved = resolveReadyInnerKeepProjection({
      scope,
      privateState: readyPrivate(),
      rows: publicRows([building]),
      commandsAvailable: true
    });
    const lumber = resolved?.presentation.quotes.find((quote) => (
      quote.slotId === 'inner-keep-slot-m02'
      && quote.buildingKind === 'lumber-camp'
      && quote.targetLevel === 1
    ));
    const millUpgrade = resolved?.presentation.quotes.find((quote) => (
      quote.slotId === 'inner-keep-slot-m01'
      && quote.buildingKind === 'city-mill'
      && quote.targetLevel === 2
    ));
    expect(lumber?.cost).toEqual({ food: 480n, wood: 700n, stone: 650n, gold: 0n });
    expect(millUpgrade?.cost.food).toBe(650n);
  });

  it('fails closed for a wrong castle, digest, incomplete Builder pair, or static row drift', () => {
    expect(decodeInnerKeepPrivateState(privatePayload({ castleId: 8n }), scope)).toBeUndefined();
    expect(decodeInnerKeepPrivateState(privatePayload({ layoutDigest: '0'.repeat(64) }), scope))
      .toBeUndefined();
    expect(decodeInnerKeepPrivateState(privatePayload({
      builderBusy: true,
      activeBuildingKey: '7:city-mill'
    }), scope)).toBeUndefined();
    expect(decodeInnerKeepPrivateState(privatePayload({ componentActive: false }), scope))
      .toBe('unavailable');

    const canonical = publicRows();
    const drifted: InnerKeepPublicRows = {
      ...canonical,
      levels: canonical.levels.map((level, index) => index === 0
        ? { ...level, durationMicros: level.durationMicros + 1n }
        : level)
    };
    expect(resolveReadyInnerKeepProjection({
      scope,
      privateState: readyPrivate(),
      rows: drifted,
      commandsAvailable: true
    })).toBeUndefined();
  });

  it('decodes an exact caller-private request status without exposing the request key', () => {
    expect(decodeInnerKeepRequestStatus({
      found: true,
      castleId: 7n,
      buildingKey: '7:city-mill',
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      targetLevel: 1,
      deductedFood: 300n,
      deductedWood: 900n,
      deductedStone: 600n,
      deductedGold: 0n,
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    }, scope)).toEqual({
      found: true,
      castleId: 7n,
      buildingKey: '7:city-mill',
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      targetLevel: 1,
      deducted: { food: 300n, wood: 900n, stone: 600n, gold: 0n },
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    expect(decodeInnerKeepRequestStatus({
      found: false,
      castleId: undefined,
      buildingKey: undefined,
      slotId: undefined,
      buildingKind: undefined,
      targetLevel: undefined,
      deductedFood: undefined,
      deductedWood: undefined,
      deductedStone: undefined,
      deductedGold: undefined,
      startedAtMicros: undefined,
      policyVersion: undefined
    }, scope)).toEqual({ found: false });
  });
});
