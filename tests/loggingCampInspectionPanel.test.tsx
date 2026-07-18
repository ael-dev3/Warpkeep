import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoggingCampInspectionPanel } from '../src/components/realm/LoggingCampInspectionPanel';
import {
  WOOD_EXPEDITION_GATHERING_DURATION_MICROS,
  WOOD_EXPEDITION_POLICY_VERSION,
  decodeWoodExpeditionPresentation
} from '../src/components/realm/realmWoodExpeditionPresentation';

afterEach(() => {
  cleanup();
});

describe('LoggingCampInspectionPanel', () => {
  it('presents a focus-safe, decorative Logging Camp record without inventing high-resolution art or authority', async () => {
    const onRequestClose = vi.fn();
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <LoggingCampInspectionPanel
        id="logging-camp-record"
        camp={{ name: 'Logging Camp', tier: 1 }}
        onRequestClose={onRequestClose}
        focusTargetRef={focusTargetRef}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Logging Camp' });
    expect(dialog.className).toContain('logging-camp-inspection');
    expect(screen.getByText('Resource').nextElementSibling?.textContent).toBe('Wood');
    const glyph = container.querySelector<HTMLImageElement>('.logging-camp-inspection__resource-icon');
    expect(glyph?.getAttribute('src')).toBe('/images/resources/hegemony-wood-add35506da245240.webp');
    expect(glyph?.getAttribute('alt')).toBe('');
    expect(glyph?.getAttribute('aria-hidden')).toBeNull();
    expect(glyph?.getAttribute('decoding')).toBe('async');
    expect(glyph?.getAttribute('draggable')).toBe('false');
    expect(glyph?.getAttribute('height')).toBe('64');
    expect(glyph?.getAttribute('width')).toBe('64');
    expect(container.querySelector('.gold-mine-inspection__hero-art')).toBeNull();
    const close = screen.getByRole('button', { name: 'CLOSE LOGGING CAMP RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /dispatch|claim/i })).toBeNull();
  });

  it('sends only the public Wood site id and a CSPRNG retry key, then gates claim on a matching owner record', async () => {
    const dispatch = vi.fn(async () => undefined);
    const claim = vi.fn(async () => undefined);
    const availableNode = {
      siteId: 'genesis-001:wood:0001',
      coord: { q: -4, r: 3 },
      tier: 1,
      availability: 'available' as const,
      occupiedByViewer: false
    };
    const { rerender } = render(
      <LoggingCampInspectionPanel
        id="logging-camp-dispatch"
        camp={{ name: 'Logging Camp', tier: 1 }}
        node={availableNode}
        onDispatchWoodExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'DISPATCH WAGON' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      'genesis-001:wood:0001',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    ));
    expect(screen.getByText('Site state').nextElementSibling?.textContent).toBe('AVAILABLE');
    expect(screen.getByText('Gather rate').nextElementSibling?.textContent).toBe('+1 Wood / minute');

    const active = decodeWoodExpeditionPresentation({
      active: true,
      expeditionId: '00000000-0000-4000-8000-000000000001',
      siteId: 'genesis-001:wood:0001',
      originCastleId: 7n,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n,
      accruedWood: 4n,
      pendingWood: 4n,
      creditedWood: 0n,
      rateWoodPerMinute: 1n,
      gatheringDurationMicros: WOOD_EXPEDITION_GATHERING_DURATION_MICROS,
      expeditionPolicyVersion: WOOD_EXPEDITION_POLICY_VERSION
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
      <LoggingCampInspectionPanel
        id="logging-camp-dispatch"
        camp={{ name: 'Logging Camp', tier: 1 }}
        node={occupiedNode}
        privateExpedition={active}
        onClaimWoodExpedition={claim}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByText('Pending Wood').nextElementSibling?.textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM ACCRUED WOOD' }));
    await waitFor(() => expect(claim).toHaveBeenCalledOnce());
  });
});
