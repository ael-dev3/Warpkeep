import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FoodFarmInspectionPanel } from '../src/components/realm/FoodFarmInspectionPanel';
import {
  FOOD_EXPEDITION_GATHERING_DURATION_MICROS,
  FOOD_EXPEDITION_POLICY_VERSION,
  decodeFoodExpeditionPresentation
} from '../src/components/realm/realmFoodExpeditionPresentation';

afterEach(() => {
  cleanup();
});

describe('FoodFarmInspectionPanel', () => {
  it('presents a focus-safe, decorative Food Farm record without inventing authority', async () => {
    const onRequestClose = vi.fn();
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <FoodFarmInspectionPanel
        id="food-farm-record"
        farm={{ name: 'Wheat Farm', tier: 1 }}
        onRequestClose={onRequestClose}
        focusTargetRef={focusTargetRef}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Wheat Farm' });
    expect(dialog.className).toContain('food-farm-inspection');
    expect(screen.getByText('Resource').nextElementSibling?.textContent).toBe('Food');
    const art = container.querySelector<HTMLImageElement>('.food-farm-inspection__hero-art');
    expect(art?.getAttribute('src')).toBe('/images/realm/hegemony-wheat-farm-record.webp');
    expect(art?.getAttribute('alt')).toBe('');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.getAttribute('decoding')).toBe('async');
    expect(art?.getAttribute('draggable')).toBe('false');
    expect(art?.getAttribute('height')).toBe('1254');
    expect(art?.getAttribute('width')).toBe('1254');
    expect(art?.closest('.food-farm-inspection__art-stage')?.className)
      .toContain('food-farm-inspection__art-stage');
    const close = screen.getByRole('button', { name: 'CLOSE FOOD FARM RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /dispatch|claim/i })).toBeNull();
  });

  it('sends only the public Food site id and a CSPRNG retry key, then gates claim on a matching owner record', async () => {
    const dispatch = vi.fn(async () => undefined);
    const claim = vi.fn(async () => undefined);
    const availableNode = {
      siteId: 'genesis-001:food:0001',
      coord: { q: -4, r: 3 },
      tier: 1,
      availability: 'available' as const,
      occupiedByViewer: false
    };
    const { rerender } = render(
      <FoodFarmInspectionPanel
        id="food-farm-dispatch"
        farm={{ name: 'Wheat Farm', tier: 1 }}
        node={availableNode}
        onDispatchFoodExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH WAGON' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      'genesis-001:food:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    expect(screen.getByText('Site state').nextElementSibling?.textContent).toBe('AVAILABLE');
    expect(screen.getByText('Gather rate').nextElementSibling?.textContent).toBe('+1 Food / minute');

    const active = decodeFoodExpeditionPresentation({
      active: true,
      expeditionId: '00000000-0000-4000-8000-000000000001',
      siteId: 'genesis-001:food:0001',
      originCastleId: 7n,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n,
      accruedFood: 4n,
      pendingFood: 4n,
      creditedFood: 0n,
      rateFoodPerMinute: 1n,
      gatheringDurationMicros: FOOD_EXPEDITION_GATHERING_DURATION_MICROS,
      expeditionPolicyVersion: FOOD_EXPEDITION_POLICY_VERSION
    });
    const occupiedNode = {
      ...availableNode,
      availability: 'gathering' as const,
      occupation: {
        siteId: availableNode.siteId,
        originCastleId: 7,
        phase: 'gathering' as const,
        startedAtMicros: 10n,
        arrivesAtMicros: 20n,
        gatheringEndsAtMicros: 30n,
        returnsAtMicros: 40n
      },
      originCastle: { castleId: 7, name: 'Sunlit Bastion', q: 0, r: 0 },
      occupiedByViewer: true
    };
    rerender(
      <FoodFarmInspectionPanel
        id="food-farm-dispatch"
        farm={{ name: 'Wheat Farm', tier: 1 }}
        node={occupiedNode}
        privateExpedition={active}
        onClaimFoodExpedition={claim}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByText('Pending Food').nextElementSibling?.textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM ACCRUED FOOD' }));
    await waitFor(() => expect(claim).toHaveBeenCalledOnce());
  });
});
