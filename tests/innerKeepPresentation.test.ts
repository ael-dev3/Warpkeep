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
  INNER_KEEP_SLOT_COUNT,
  innerKeepPresentationIntegrity,
  innerKeepQuoteAffordable,
  innerKeepQuoteBlockedReason
} from '../src/components/inner-keep/innerKeepPresentation';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

describe('Inner Keep presentation boundary', () => {
  it('keeps the browser-pinned layout byte-for-byte aligned with v15 policy', () => {
    expect(INNER_KEEP_LAYOUT_V1_DIGEST).toBe(INNER_KEEP_LAYOUT_DIGEST);
    expect(INNER_KEEP_LAYOUT_V1_SLOTS).toEqual(CANONICAL_INNER_KEEP_SLOTS.map((slot) => ({
      slotId: slot.slotId,
      footprintClass: slot.footprintClass,
      localXMicrounits: slot.localXMicrounits,
      localZMicrounits: slot.localZMicrounits,
      rotationMilliDegrees: slot.rotationMilliDegrees,
      sortOrder: slot.sortOrder,
      active: slot.active
    })));
  });

  it('accepts one exact twelve-slot caller-bound projection', () => {
    const presentation = createInnerKeepPresentation();
    expect(presentation.slots).toHaveLength(INNER_KEEP_SLOT_COUNT);
    expect(innerKeepPresentationIntegrity(presentation)).toBe(true);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      castleId: 18_446_744_073_709_551_615n
    })).toBe(true);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      projectRevision: 18_446_744_073_709_551_616n
    })).toBe(true);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      projectRevision: INNER_KEEP_PROJECT_REVISION_MAX
    })).toBe(true);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      projectRevision: INNER_KEEP_PROJECT_REVISION_MAX + 1n
    })).toBe(false);
  });

  it('pins the exact v15 digest, slot order, footprint, and activation policy', () => {
    const presentation = createInnerKeepPresentation();
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      layoutDigest: '0'.repeat(64)
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      slots: presentation.slots.map((slot, index) => (
        index === 0 ? { ...slot, sortOrder: 12 } : slot
      ))
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      slots: presentation.slots.map((slot, index) => (
        index === 8 ? { ...slot, active: true } : slot
      ))
    })).toBe(false);
  });

  it('fails duplicate, missing, and mismatched Builder state closed', () => {
    const presentation = createInnerKeepPresentation();
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      slots: presentation.slots.slice(0, -1)
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      slots: [presentation.slots[0]!, ...presentation.slots.slice(0, -1)]
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      builder: {
        state: 'busy',
        slotId: presentation.slots[0]!.slotId,
        buildingKind: 'city-mill',
        targetLevel: 1,
        completesAtMicros: 10n
      }
    })).toBe(false);
  });

  it('rejects drifted catalogue discounts, duplicate quotes, and over-cap balances', () => {
    const presentation = createInnerKeepPresentation();
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      catalogue: presentation.catalogue.map((entry, index) => (
        index === 0 ? { ...entry, discountBasisPointsPerLevel: 501 } : entry
      ))
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      quotes: [presentation.quotes[0]!, ...presentation.quotes]
    })).toBe(false);
    expect(innerKeepPresentationIntegrity({
      ...presentation,
      resources: {
        ...presentation.resources,
        available: {
          ...presentation.resources.available,
          food: 1_000_001n
        }
      }
    })).toBe(false);
  });

  it('uses stored balances only and never pending accrual for affordability', () => {
    const presentation = createInnerKeepPresentation({
      available: { food: 299n, wood: 900n, stone: 600n, gold: 0n }
    });
    const quote = presentation.quotes.find((candidate) => (
      candidate.slotId === presentation.slots[0]!.slotId
      && candidate.buildingKind === 'city-mill'
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
