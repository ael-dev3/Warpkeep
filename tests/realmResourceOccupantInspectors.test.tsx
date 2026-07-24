import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
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
  vi.useRealTimers();
});

function publicOccupant(
  resource: RealmResourceKind,
  siteId: string,
  overrides: Partial<RealmResourceOccupantMarker> = {}
): RealmResourceOccupantMarker {
  const nowMicros = BigInt(Date.now()) * 1_000n;
  return {
    source: 'generic-worker',
    resource,
    siteId,
    nodeCoord: { q: 4, r: -2 },
    tier: 1,
    workerId: 'genesis-001-castle-7-worker-02',
    workerOrdinal: 2,
    workerPhase: 'gathering',
    timelineRevision: 1,
    occupiedByViewer: false,
    startedAtMicros: nowMicros - 120_000_000n,
    arrivesAtMicros: nowMicros - 60_000_000n,
    gatheringEndsAtMicros: nowMicros + 90_000_000n,
    castle: {
      castleId: 7,
      name: 'Sunlit Bastion',
      q: 0,
      r: 0
    },
    profile: {
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      publicBio: 'Building beside the bright river.',
      communityStatsVisible: false
    },
    ...overrides
  };
}

type InspectorCase = Readonly<{
  resource: RealmResourceKind;
  siteId: string;
  dialogName: string;
  rate: string;
  renderPanel: (
    occupant: RealmResourceOccupantMarker | undefined,
    options?: Readonly<{
      focus?: (marker: RealmResourceOccupantMarker) => void;
      recall?: (workerId: string) => Promise<void>;
      legacyDispatchBlocked?: boolean;
      occupancyUnavailable?: boolean;
    }>
  ) => ReactElement;
}>;

const INSPECTOR_CASES: readonly InspectorCase[] = [
  {
    resource: 'gold',
    siteId: 'genesis-001:gold:0001',
    dialogName: 'Gold Mine',
    rate: '+1 Gold / minute',
    renderPanel: (occupant, options) => (
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
        legacyDispatchBlocked={options?.legacyDispatchBlocked}
        occupancyUnavailable={options?.occupancyUnavailable}
        onFocusOccupantCastle={options?.focus}
        onRecallWorker={options?.recall}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'food',
    siteId: 'genesis-001:food:0001',
    dialogName: 'Wheat Farm',
    rate: '+1 Food / minute',
    renderPanel: (occupant, options) => (
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
        legacyDispatchBlocked={options?.legacyDispatchBlocked}
        occupancyUnavailable={options?.occupancyUnavailable}
        onFocusOccupantCastle={options?.focus}
        onRecallWorker={options?.recall}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'wood',
    siteId: 'genesis-001:wood:0001',
    dialogName: 'Logging Camp',
    rate: '+1 Wood / minute',
    renderPanel: (occupant, options) => (
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
        legacyDispatchBlocked={options?.legacyDispatchBlocked}
        occupancyUnavailable={options?.occupancyUnavailable}
        onFocusOccupantCastle={options?.focus}
        onRecallWorker={options?.recall}
        onRequestClose={() => undefined}
      />
    )
  },
  {
    resource: 'stone',
    siteId: 'genesis-001:stone:0001',
    dialogName: 'Stone Quarry',
    rate: '+1 Stone / minute',
    renderPanel: (occupant, options) => (
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
        legacyDispatchBlocked={options?.legacyDispatchBlocked}
        occupancyUnavailable={options?.occupancyUnavailable}
        onFocusOccupantCastle={options?.focus}
        onRecallWorker={options?.recall}
        onRequestClose={() => undefined}
      />
    )
  }
];

describe('unified occupied resource inspectors', () => {
  it.each(INSPECTOR_CASES)(
    'keeps the $resource site and public worker story in one dialog',
    ({ resource, siteId, dialogName, rate, renderPanel }) => {
      vi.useFakeTimers();
      vi.setSystemTime(2_000_000_000_000);
      const occupant = publicOccupant(resource, siteId);
      render(renderPanel(occupant));

      const dialog = screen.getByRole('dialog', { name: dialogName });
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      const details = dialog.querySelector<HTMLElement>(
        '[data-resource-occupant-details="true"]'
      );
      expect(details).not.toBeNull();
      expect(within(details!).getByText('PUBLIC WORKER RECORD')).not.toBeNull();
      expect(within(details!).getAllByText('WORKER 02')).toHaveLength(2);
      expect(within(details!).getByText('GATHERING AT SITE')).not.toBeNull();
      expect(within(details!).getByText('Keeper')).not.toBeNull();
      expect(within(details!).getByText('@keeper')).not.toBeNull();
      expect(within(details!).getByText('Building beside the bright river.')).not.toBeNull();
      expect(within(details!).getByText('Home castle').nextElementSibling?.textContent)
        .toBe('Sunlit Bastion');
      expect(within(details!).getByText('Castle location').nextElementSibling?.textContent)
        .toBe('q 0 · r 0');
      expect(within(details!).getByText('Gathering time left')).not.toBeNull();
      expect(within(details!).getByRole('timer').textContent).toBe('2m remaining');
      expect(screen.getByText('Site state').nextElementSibling?.textContent)
        .toBe('OCCUPIED · GATHERING');
      expect(screen.getByText('Occupied by').nextElementSibling?.textContent)
        .toBe('@keeper · Sunlit Bastion');
      expect(screen.getByText('Gather rate').nextElementSibling?.textContent).toBe(rate);
      expect(screen.queryByRole('button', { name: /view public/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
    }
  );

  it('keeps portrait navigation explicit without moving the camera on open', () => {
    const occupant = publicOccupant('gold', 'genesis-001:gold:0001');
    const focus = vi.fn();
    render(INSPECTOR_CASES[0]!.renderPanel(occupant, { focus }));

    fireEvent.click(screen.getByRole('button', {
      name: /Focus @keeper's castle on the map/i
    }));
    expect(focus).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledWith(occupant);
  });

  it.each(INSPECTOR_CASES)(
    'recovers $resource inspector focus when its live occupation disappears',
    async ({ resource, siteId, renderPanel }) => {
      const occupant = publicOccupant(resource, siteId);
      const focus = vi.fn();
      const view = render(renderPanel(occupant, { focus }));
      const portrait = screen.getByRole('button', {
        name: /Focus @keeper's castle on the map/i
      });
      portrait.focus();
      expect(document.activeElement).toBe(portrait);

      view.rerender(renderPanel(undefined, { focus }));

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('button', {
          name: /^CLOSE .* RECORD$/
        }));
      });
    }
  );

  it('does not steal focus when an occupation disappears while focus is elsewhere', async () => {
    const occupant = publicOccupant('gold', 'genesis-001:gold:0001');
    const focus = vi.fn();
    const view = render(
      <>
        <button type="button">Outside control</button>
        {INSPECTOR_CASES[0]!.renderPanel(occupant, { focus })}
      </>
    );
    const outside = screen.getByRole('button', { name: 'Outside control' });
    outside.focus();

    view.rerender(
      <>
        <button type="button">Outside control</button>
        {INSPECTOR_CASES[0]!.renderPanel(undefined, { focus })}
      </>
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(document.activeElement).toBe(screen.getByRole('button', {
      name: 'Outside control'
    }));
  });

  it('offers recall only for the viewer’s exact generic worker', async () => {
    const recall = vi.fn(async () => undefined);
    const own = publicOccupant('wood', 'genesis-001:wood:0001', {
      occupiedByViewer: true
    });
    render(INSPECTOR_CASES[2]!.renderPanel(own, { recall }));

    fireEvent.click(screen.getByRole('button', { name: /Recall Worker to Keep/i }));
    expect(recall).toHaveBeenCalledOnce();
    expect(recall).toHaveBeenCalledWith('genesis-001-castle-7-worker-02');
    expect(await screen.findByText('Worker returning…')).not.toBeNull();
  });

  it('keeps remote, legacy, and malformed worker records read-only', () => {
    const recall = vi.fn(async () => undefined);
    const remote = publicOccupant('wood', 'genesis-001:wood:0001');
    const view = render(INSPECTOR_CASES[2]!.renderPanel(remote, { recall }));
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();

    view.rerender(INSPECTOR_CASES[2]!.renderPanel({
      ...remote,
      source: 'legacy-expedition',
      occupiedByViewer: true
    }, { recall }));
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();

    view.rerender(INSPECTOR_CASES[2]!.renderPanel({
      ...remote,
      occupiedByViewer: true,
      workerId: 'not-a-canonical-worker'
    }, { recall }));
    expect(screen.queryByRole('button', { name: /Recall Worker to Keep/i })).toBeNull();
    expect(recall).not.toHaveBeenCalled();
  });

  it.each(INSPECTOR_CASES)(
    'fails $resource closed when active worker occupancy cannot be verified',
    ({ renderPanel }) => {
      render(renderPanel(undefined, {
        legacyDispatchBlocked: true,
        occupancyUnavailable: true
      }));

      expect(screen.getByText('Site state').nextElementSibling?.textContent)
        .toBe('OCCUPANCY UNAVAILABLE');
      expect(document.querySelector('[data-resource-occupant-details="true"]')).toBeNull();
      expect(screen.queryByRole('button', { name: /dispatch|claim/i })).toBeNull();
    }
  );

  it('does not revive stale private pending Gold or a manual claim action', () => {
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
    const occupant = publicOccupant('gold', siteId, { occupiedByViewer: true });

    render(
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
        publicOccupant={occupant}
        privateExpedition={staleLegacy}
        onRequestClose={() => undefined}
      />
    );

    expect(screen.queryByText('Pending Gold')).toBeNull();
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
  });
});
