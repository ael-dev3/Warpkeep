import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoldMineInspectionPanel } from '../src/components/realm/GoldMineInspectionPanel';
import {
  GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
  GOLD_EXPEDITION_POLICY_VERSION,
  decodeGoldExpeditionPresentation
} from '../src/components/realm/realmGoldExpeditionPresentation';

afterEach(() => {
  cleanup();
});

describe('GoldMineInspectionPanel', () => {
  it('presents a focus-safe, decorative Gold Mine record without inventing gameplay authority', async () => {
    const escaped = vi.fn();
    const onRequestClose = vi.fn();
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <GoldMineInspectionPanel
          id="gold-mine-record"
          mine={{ name: 'Gold Mine', tier: 1 }}
          onRequestClose={onRequestClose}
          focusTargetRef={focusTargetRef}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Gold Mine' });
    expect(dialog.id).toBe('gold-mine-record');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('gold-mine-record-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('gold-mine-record-description');
    expect(screen.getByText('TIER 1 GATHERING SITE')).not.toBeNull();
    expect(screen.getByText('Resource').nextElementSibling?.textContent).toBe('Gold');
    expect(screen.getByText('Node tier').nextElementSibling?.textContent).toBe('1');

    const heroArt = container.querySelector<HTMLImageElement>(
      '.gold-mine-inspection__hero-art'
    );
    expect(heroArt).not.toBeNull();
    expect(heroArt?.getAttribute('alt')).toBe('');
    expect(heroArt?.getAttribute('aria-hidden')).toBe('true');
    expect(heroArt?.getAttribute('decoding')).toBe('async');
    expect(heroArt?.getAttribute('draggable')).toBe('false');
    expect(heroArt?.getAttribute('width')).toBe('1254');
    expect(heroArt?.getAttribute('height')).toBe('1254');
    expect(heroArt?.getAttribute('src')).toBe('/images/realm/hegemony-gold-mine-record.webp');

    const close = screen.getByRole('button', { name: 'CLOSE GOLD MINE RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

    expect(screen.queryByRole('button', { name: /gather/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /Reserves|Owner|Balance|Reward|Marks|Wallet|Durability|Destroy|Health|Alliance|\bStatus\b/i
    );
  });

  it('submits only a site id while the provider owns retry-key continuity', async () => {
    const dispatch = vi.fn(async () => undefined);
    render(
      <GoldMineInspectionPanel
        id="gold-mine-dispatch"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId: 'genesis-001:gold:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        onDispatchGoldExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    );

    const button = screen.getByRole('button', { name: 'DISPATCH WAGON' });
    fireEvent.click(button);
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(dispatch).toHaveBeenCalledWith('genesis-001:gold:0001');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' }).hasAttribute('disabled')).toBe(true);
    // Successful reducer submission does not locally invent an occupied site.
    expect(screen.getByText('Site state').nextElementSibling?.textContent).toBe('AVAILABLE');
    expect(screen.getAllByText(/Dispatch is confirmed only/i)).toHaveLength(1);
    expect(screen.getByText(/private Realm record is confirmed/i)).not.toBeNull();
  });

  it('shows the public rate to peers but only enables a matching owner claim from private state', async () => {
    const claim = vi.fn(async () => undefined);
    const active = decodeGoldExpeditionPresentation({
      active: true,
      expeditionId: '00000000-0000-4000-8000-000000000001',
      siteId: 'genesis-001:gold:0001',
      originCastleId: 7n,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n,
      accruedGold: 4n,
      pendingGold: 4n,
      creditedGold: 0n,
      rateGoldPerMinute: 1n,
      gatheringDurationMicros: GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
      expeditionPolicyVersion: GOLD_EXPEDITION_POLICY_VERSION
    });
    const node = {
      siteId: 'genesis-001:gold:0001',
      coord: { q: 4, r: -2 },
      tier: 1,
      availability: 'gathering' as const,
      occupation: {
        siteId: 'genesis-001:gold:0001',
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
    const { rerender } = render(
      <GoldMineInspectionPanel
        id="gold-mine-claim"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{ ...node, occupiedByViewer: false }}
        privateExpedition={active}
        onClaimGoldExpedition={claim}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByText('Gather rate').nextElementSibling?.textContent).toBe('+1 Gold / minute');
    expect(screen.queryByRole('button', { name: 'CLAIM ACCRUED GOLD' })).toBeNull();

    rerender(
      <GoldMineInspectionPanel
        key="private-confirmed"
        id="gold-mine-claim"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId: 'genesis-001:gold:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        privateExpedition={active}
        onDispatchGoldExpedition={vi.fn(async () => undefined)}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'AWAITING REALM…' }).hasAttribute('disabled'))
      .toBe(true);
    expect(screen.getByText(/private Realm record is confirmed/i)).not.toBeNull();

    rerender(
      <GoldMineInspectionPanel
        key="private-confirmed"
        id="gold-mine-claim"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={node}
        privateExpedition={active}
        onClaimGoldExpedition={claim}
        onRequestClose={() => undefined}
      />
    );
    expect(screen.getByText('Pending Gold').nextElementSibling?.textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM ACCRUED GOLD' }));
    await waitFor(() => expect(claim).toHaveBeenCalledOnce());
  });

  it('disables a different available Mine while the private record has an active wagon', () => {
    const active = decodeGoldExpeditionPresentation({
      active: true,
      expeditionId: '00000000-0000-4000-8000-000000000001',
      siteId: 'genesis-001:gold:0002',
      originCastleId: 7n,
      phase: 'outbound',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n,
      accruedGold: 0n,
      pendingGold: 0n,
      creditedGold: 0n,
      rateGoldPerMinute: 1n,
      gatheringDurationMicros: GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
      expeditionPolicyVersion: GOLD_EXPEDITION_POLICY_VERSION
    });
    const dispatch = vi.fn(async () => undefined);
    render(
      <GoldMineInspectionPanel
        id="gold-mine-other-site"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId: 'genesis-001:gold:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        privateExpedition={active}
        onDispatchGoldExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    );

    const button = screen.getByRole('button', { name: 'EXPEDITION ACTIVE' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText(/already has an active expedition/i)).not.toBeNull();
  });
});
