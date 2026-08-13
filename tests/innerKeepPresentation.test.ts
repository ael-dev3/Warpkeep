import { describe, expect, it } from 'vitest';

import {
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_LAYOUT_DIGEST
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import {
  INNER_KEEP_LAYOUT_V1_DIGEST,
  INNER_KEEP_LAYOUT_V1_SLOTS
} from '../src/components/inner-keep/innerKeepLayoutV1';
import {
  INNER_KEEP_PROJECT_REVISION_MAX,
  innerKeepCatalogueEffectCopy,
  innerKeepPresentationIntegrity,
  innerKeepQuoteAffordable,
  innerKeepQuoteBlockedReason
} from '../src/components/inner-keep/innerKeepPresentation';
import {
  createInnerKeepPresentation,
  createInnerKeepTestBuilding,
  INNER_KEEP_TEST_PLACEMENTS
} from './fixtures/innerKeepPresentation';

describe('Inner Keep presentation boundary', () => {
  it('formats economy and landmark effects without inventing a landmark discount', () => {
    expect(innerKeepCatalogueEffectCopy('stone', 375, 1_875)).toBe(
      'Each completed level lowers future Stone costs by 3.75%, up to 18.75%.'
    );
    expect(innerKeepCatalogueEffectCopy('none', 0, 0)).toContain(
      'does not apply a resource construction discount'
    );
  });

  it('pins the free-placement digest and retires every fixed slot', () => {
    expect(INNER_KEEP_LAYOUT_V1_DIGEST).toBe(INNER_KEEP_LAYOUT_DIGEST);
    expect(INNER_KEEP_LAYOUT_V1_SLOTS).toEqual([]);
    expect(CANONICAL_INNER_KEEP_SLOTS).toEqual([]);
  });

  it('accepts an empty town with all six catalogue kinds and one quote each', () => {
    const presentation = createInnerKeepPresentation();
    expect(presentation.catalogue).toHaveLength(6);
    expect(presentation.quotes).toHaveLength(6);
    expect(presentation.buildings).toEqual([]);
    expect(presentation.catalogue.find((entry) => (
      entry.buildingKind === 'city-barracks'
    ))).toMatchObject({ category: 'military', matchingDiscountResource: 'none' });
    expect(presentation.catalogue.find((entry) => (
      entry.buildingKind === 'grand-covenant-cathedral'
    ))).toMatchObject({ category: 'civic', matchingDiscountResource: 'none' });
    expect(innerKeepPresentationIntegrity(presentation)).toBe(true);
  });

  it('bounds the lossless aggregate revision without coercing it to Number', () => {
    const presentation = createInnerKeepPresentation();
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      projectRevision: INNER_KEEP_PROJECT_REVISION_MAX
    })).toBe(true);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      projectRevision: INNER_KEEP_PROJECT_REVISION_MAX + 1n
    })).toBe(false);
  });

  it('rejects off-grid, reserved, outside, and overlapping building transforms', () => {
    const valid = createInnerKeepTestBuilding({ buildingKind: 'city-mill' });
    const offGrid = { ...valid, placement: { ...valid.placement, localXMicrounits: 1n } };
    const reserved = { ...valid, placement: {
      localXMicrounits: 0n,
      localZMicrounits: 0n,
      rotationMilliDegrees: 0
    } };
    const outside = { ...valid, placement: {
      localXMicrounits: 44_000_000n,
      localZMicrounits: -10_000_000n,
      rotationMilliDegrees: 0
    } };
    const overlap = createInnerKeepTestBuilding({
      buildingKind: 'lumber-camp',
      placement: INNER_KEEP_TEST_PLACEMENTS['city-mill']
    });
    expect(innerKeepPresentationIntegrity(createInnerKeepPresentation({
      buildings: [offGrid]
    }))).toBe(false);
    expect(innerKeepPresentationIntegrity(createInnerKeepPresentation({
      buildings: [reserved]
    }))).toBe(false);
    expect(innerKeepPresentationIntegrity(createInnerKeepPresentation({
      buildings: [outside]
    }))).toBe(false);
    expect(innerKeepPresentationIntegrity(createInnerKeepPresentation({
      buildings: [valid, overlap]
    }))).toBe(false);
  });

  it('fails mismatched Builder state and construction lifecycle closed', () => {
    const constructing = createInnerKeepTestBuilding({
      buildingKind: 'city-mill',
      phase: 'constructing'
    });
    const presentation = createInnerKeepPresentation({ buildings: [constructing] });
    expect(innerKeepPresentationIntegrity(presentation)).toBe(false);
    expect(innerKeepPresentationIntegrity(createInnerKeepPresentation({
      buildings: [constructing],
      builder: {
        state: 'busy',
        buildingKey: constructing.buildingKey,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!
      }
    }))).toBe(true);
  });

  it('rejects catalogue drift, missing quotes, duplicate quotes, and over-cap balances', () => {
    const presentation = createInnerKeepPresentation();
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      catalogue: presentation.catalogue.map((entry, index) => (
        index === 0 ? { ...entry, category: 'civic' as const } : entry
      ))
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      quotes: presentation.quotes.slice(1)
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      quotes: [presentation.quotes[0]!, ...presentation.quotes]
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      resources: {
        ...presentation.resources,
        available: { ...presentation.resources.available, food: 1_000_001n }
      }
    })).toBe(false);
  });

  it('uses stored balances only and never pending accrual for affordability', () => {
    const presentation = createInnerKeepPresentation({
      available: { food: 299n, wood: 900n, stone: 600n, gold: 0n }
    });
    const quote = presentation.quotes.find((candidate) => (
      candidate.buildingKind === 'city-mill'
    ))!;
    expect(innerKeepQuoteAffordable(quote, presentation.resources.available)).toBe(false);
    expect(innerKeepQuoteBlockedReason(quote, presentation.resources.available))
      .toBe('Not enough Food.');
    expect(innerKeepQuoteAffordable(quote, {
      food: 300n,
      wood: 900n,
      stone: 600n,
      gold: 0n
    })).toBe(true);
  });
});
