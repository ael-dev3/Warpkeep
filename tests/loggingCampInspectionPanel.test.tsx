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
  it('presents a focus-safe, decorative Logging Camp record without inventing authority', async () => {
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
    const art = container.querySelector<HTMLImageElement>('.logging-camp-inspection__hero-art');
    expect(art?.getAttribute('src')).toBe('/images/realm/hegemony-logging-camp-record.webp');
    expect(art?.getAttribute('alt')).toBe('');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.getAttribute('decoding')).toBe('async');
    expect(art?.getAttribute('draggable')).toBe('false');
    expect(art?.getAttribute('height')).toBe('1254');
    expect(art?.getAttribute('width')).toBe('1254');
    expect(container.querySelector('.logging-camp-inspection__art-stage')).not.toBeNull();
    const close = screen.getByRole('button', { name: 'CLOSE LOGGING CAMP RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /dispatch|claim/i })).toBeNull();
  });

  it('sends only the public Wood site id, then gates claim on a matching owner record', async () => {
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
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('genesis-001:wood:0001'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' }).hasAttribute('disabled')).toBe(true);
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
    rerender(
      <LoggingCampInspectionPanel
        key="private-confirmed"
        id="logging-camp-dispatch"
        camp={{ name: 'Logging Camp', tier: 1 }}
        node={availableNode}
        privateExpedition={active}
        onDispatchWoodExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' }).hasAttribute('disabled'))
      .toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);

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
        key="private-confirmed"
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
