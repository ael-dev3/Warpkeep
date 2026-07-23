import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FoodFarmInspectionPanel } from '../src/components/realm/FoodFarmInspectionPanel';
import { GoldMineInspectionPanel } from '../src/components/realm/GoldMineInspectionPanel';
import { LoggingCampInspectionPanel } from '../src/components/realm/LoggingCampInspectionPanel';
import { StoneQuarryInspectionPanel } from '../src/components/realm/StoneQuarryInspectionPanel';
import {
  GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
  GOLD_EXPEDITION_POLICY_VERSION,
  decodeGoldExpeditionPresentation
} from '../src/components/realm/realmGoldExpeditionPresentation';
import type {
  RealmResourceOccupantMarker
} from '../src/components/realm/realmResourceOccupantPresentation';
import type { RealmResourceKind } from '../src/components/realm/realmTypes';

afterEach(() => {
  cleanup();
});

function publicOccupant(
  resource: RealmResourceKind,
  siteId: string,
  overrides: Partial<RealmResourceOccupantMarker> = {}
): RealmResourceOccupantMarker {
  return {
    source: 'generic-worker',
    resource,
    siteId,
    nodeCoord: { q: 4, r: -2 },
    tier: 1,
    workerOrdinal: 2,
    workerPhase: 'gathering',
    timelineRevision: 1,
    occupiedByViewer: false,
    startedAtMicros: 1n,
    arrivesAtMicros: 2n,
    gatheringEndsAtMicros: 3n,
    castle: {
      castleId: 7,
      name: 'Sunlit Bastion',
      q: 0,
      r: 0
    },
    profile: {
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      communityStatsVisible: false
    },
    ...overrides
  };
}

type InspectorCase = Readonly<{
  resource: RealmResourceKind;
  siteId: string;
  rate: string;
  renderPanel: (
    occupant: RealmResourceOccupantMarker | undefined,
    dispatch: (siteId: string) => Promise<void>,
    legacyDispatchBlocked?: boolean,
    occupancyUnavailable?: boolean
  ) => ReactElement;
}>;

const INSPECTOR_CASES: readonly InspectorCase[] = [
  {
    resource: 'gold',
    siteId: 'genesis-001:gold:0001',
    rate: '+1 Gold / minute',
    renderPanel: (occupant, dispatch, legacyDispatchBlocked, occupancyUnavailable) => (
      <GoldMineInspectionPanel
        id="generic-gold-occupant"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId: 'genesis-001:gold:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        publicOccupant={occupant}
        legacyDispatchBlocked={legacyDispatchBlocked}
        occupancyUnavailable={occupancyUnavailable}
        onDispatchGoldExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'food',
    siteId: 'genesis-001:food:0001',
    rate: '+1 Food / minute',
    renderPanel: (occupant, dispatch, legacyDispatchBlocked, occupancyUnavailable) => (
      <FoodFarmInspectionPanel
        id="generic-food-occupant"
        farm={{ name: 'Wheat Farm', tier: 1 }}
        node={{
          siteId: 'genesis-001:food:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        publicOccupant={occupant}
        legacyDispatchBlocked={legacyDispatchBlocked}
        occupancyUnavailable={occupancyUnavailable}
        onDispatchFoodExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'wood',
    siteId: 'genesis-001:wood:0001',
    rate: '+1 Wood / minute',
    renderPanel: (occupant, dispatch, legacyDispatchBlocked, occupancyUnavailable) => (
      <LoggingCampInspectionPanel
        id="generic-wood-occupant"
        camp={{ name: 'Logging Camp', tier: 1 }}
        node={{
          siteId: 'genesis-001:wood:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        publicOccupant={occupant}
        legacyDispatchBlocked={legacyDispatchBlocked}
        occupancyUnavailable={occupancyUnavailable}
        onDispatchWoodExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'stone',
    siteId: 'genesis-001:stone:0001',
    rate: '+1 Stone / minute',
    renderPanel: (occupant, dispatch, legacyDispatchBlocked, occupancyUnavailable) => (
      <StoneQuarryInspectionPanel
        id="generic-stone-occupant"
        quarry={{ name: 'Stone Quarry', tier: 1 }}
        node={{
          siteId: 'genesis-001:stone:0001',
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'available',
          occupiedByViewer: false
        }}
        publicOccupant={occupant}
        legacyDispatchBlocked={legacyDispatchBlocked}
        occupancyUnavailable={occupancyUnavailable}
        onDispatchStoneExpedition={dispatch}
        onRequestClose={() => undefined}
      />
    )
  }
];

describe('normalized occupied resource inspectors', () => {
  it.each(INSPECTOR_CASES)(
    'presents a generic $resource lease as occupied and suppresses legacy dispatch',
    ({ resource, siteId, rate, renderPanel }) => {
      const dispatch = vi.fn(async () => undefined);
      render(renderPanel(publicOccupant(resource, siteId), dispatch));

      expect(screen.getByText('Site state').nextElementSibling?.textContent)
        .toBe('OCCUPIED · GATHERING');
      expect(screen.getByText('Occupied by').nextElementSibling?.textContent)
        .toBe('@keeper · Sunlit Bastion');
      expect(screen.getByText('Gather rate').nextElementSibling?.textContent)
        .toBe(rate);
      expect(screen.getByText(/resources and commands remain private/i)).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'DISPATCH WAGON' })).toBeNull();
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it('opens the exact camera-neutral public record from an occupied site inspector', () => {
    const occupant = publicOccupant('gold', 'genesis-001:gold:0001');
    const inspect = vi.fn();
    render(
      <GoldMineInspectionPanel
        id="occupied-public-record-route"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId: occupant.siteId,
          coord: occupant.nodeCoord,
          tier: occupant.tier,
          availability: 'available',
          occupiedByViewer: false
        }}
        publicOccupant={occupant}
        onInspectPublicOccupant={inspect}
        onRequestClose={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'VIEW PUBLIC WORKER RECORD' }));
    expect(inspect).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledWith(occupant);
  });

  it('identifies an owned generic assignment without exposing its private command surface', () => {
    const dispatch = vi.fn(async () => undefined);
    const entry = INSPECTOR_CASES[0]!;
    render(entry.renderPanel(publicOccupant(entry.resource, entry.siteId, {
      occupiedByViewer: true
    }), dispatch));

    expect(screen.getByText('Occupied by').nextElementSibling?.textContent)
      .toBe('Your worker · Sunlit Bastion');
    expect(screen.getByText(/settlement remains server-authoritative/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'DISPATCH WAGON' })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /owner fid|request key|command key|assignment id|cargo|balance/i
    );
  });

  it.each(INSPECTOR_CASES)(
    'keeps retired legacy $resource dispatch closed when active generic markers degrade',
    ({ renderPanel }) => {
      const dispatch = vi.fn(async () => undefined);
      render(renderPanel(undefined, dispatch, true));

      expect(screen.getByText(/authoritative worker roster/i)).not.toBeNull();
      expect(screen.queryByRole('button', { name: /dispatch wagon/i })).toBeNull();
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it.each(INSPECTOR_CASES)(
    'does not advertise an available $resource node when active occupancy is unverified',
    ({ renderPanel }) => {
      const dispatch = vi.fn(async () => undefined);
      render(renderPanel(undefined, dispatch, true, true));

      expect(screen.getByText('Site state').nextElementSibling?.textContent)
        .toBe('OCCUPANCY UNAVAILABLE');
      expect(screen.getByText(/not presented as available/i)).not.toBeNull();
      expect(screen.queryByRole('button', { name: /dispatch wagon/i })).toBeNull();
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it('suppresses stale legacy claim state after a generic lease wins the node', () => {
    const claim = vi.fn(async () => undefined);
    const siteId = 'genesis-001:gold:0001';
    const staleLegacy = decodeGoldExpeditionPresentation({
      active: true,
      expeditionId: '00000000-0000-4000-8000-000000000001',
      siteId,
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

    const view = render(
      <GoldMineInspectionPanel
        id="generic-over-legacy"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId,
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'gathering',
          occupation: {
            siteId,
            originCastleId: 7,
            phase: 'gathering',
            startedAtMicros: 10n,
            arrivesAtMicros: 20n,
            gatheringEndsAtMicros: 30n,
            returnsAtMicros: 40n
          },
          originCastle: { castleId: 7, name: 'Sunlit Bastion', q: 0, r: 0 },
          occupiedByViewer: true
        }}
        publicOccupant={publicOccupant('gold', siteId, {
          occupiedByViewer: true
        })}
        privateExpedition={staleLegacy}
        onClaimGoldExpedition={claim}
        onRequestClose={() => undefined}
      />
    );

    expect(screen.queryByText('Pending Gold')).toBeNull();
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
    expect(claim).not.toHaveBeenCalled();

    view.rerender(
      <GoldMineInspectionPanel
        id="active-generic-invalid-public-join"
        mine={{ name: 'Gold Mine', tier: 1 }}
        node={{
          siteId,
          coord: { q: 4, r: -2 },
          tier: 1,
          availability: 'gathering',
          occupation: {
            siteId,
            originCastleId: 7,
            phase: 'gathering',
            startedAtMicros: 10n,
            arrivesAtMicros: 20n,
            gatheringEndsAtMicros: 30n,
            returnsAtMicros: 40n
          },
          originCastle: { castleId: 7, name: 'Sunlit Bastion', q: 0, r: 0 },
          occupiedByViewer: true
        }}
        legacyDispatchBlocked
        privateExpedition={staleLegacy}
        onClaimGoldExpedition={claim}
        onRequestClose={() => undefined}
      />
    );

    expect(screen.getByText(/authoritative worker roster/i)).not.toBeNull();
    expect(screen.queryByText('Pending Gold')).toBeNull();
    expect(screen.queryByRole('button', { name: /claim|dispatch/i })).toBeNull();
    expect(claim).not.toHaveBeenCalled();
  });
});
