import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import {
  REALM_OBSERVER_REFRESH_MILLISECONDS,
  RealmObserverQaHarness
} from '../src/dev/RealmObserverQaHarness';
import {
  createRealmObserverHarnessRealm,
  parseRealmObserverSnapshot
} from '../src/dev/realmObserverSnapshot';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
} from '../spacetimedb/src/world';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function observerSnapshot() {
  const slots = CANONICAL_CASTLE_SLOTS.slice(0, 2);
  return parseRealmObserverSnapshot({
    version: 1,
    protocolVersion: 3,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: {
      realmId: CANONICAL_REALM.realmId,
      numericSeed: CANONICAL_REALM.numericSeed,
      generationVersion: CANONICAL_REALM.generationVersion,
      authoritativeRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius,
      playerCapacity: CANONICAL_REALM.playerCapacity
    },
    castles: slots.map((slot, index) => ({
      castleId: index + 1,
      tileKey: slot.tileKey,
      q: slot.q,
      r: slot.r,
      level: index + 1,
      name: index === 0 ? 'Amethyst Bastion' : 'Violet Watch',
      canonicalUsername: index === 0 ? 'ael' : 'violetwarden',
      displayName: index === 0 ? 'Ael' : 'Violet Warden',
      publicBio: 'Public Realm presentation.',
      portraitAvailable: true,
      publicStatus: index === 0 ? 'founded' : 'active'
    }))
  });
}

function observerRealm() {
  return createRealmObserverHarnessRealm(observerSnapshot(), 71);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Realm read-only observer presentation', () => {
  it('refreshes without overlapping and fails closed when a later snapshot is unavailable', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const loadSnapshot = vi.fn()
        .mockResolvedValueOnce(observerSnapshot())
        .mockRejectedValueOnce(new Error('static test failure'));
      render(<RealmObserverQaHarness loadSnapshot={loadSnapshot} />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('QA OBSERVER · READ ONLY')).not.toBeNull();
      expect(loadSnapshot).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(REALM_OBSERVER_REFRESH_MILLISECONDS);
      });
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('alert').textContent).toMatch(/did not provide/i);
      expect(screen.queryByRole('main', { name: 'Hegemony realm QA observer' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps map interaction while suppressing every player-auth and ownership semantic', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const realm = observerRealm();
    render(
      <RealmMapScreen
        identity={realm.identity}
        snapshot={realm.snapshot}
        presentationMode="observer"
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('main', { name: 'Hegemony realm QA observer' })).not.toBeNull();
    expect(screen.getByText('QA OBSERVER · READ ONLY')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close QA Observer' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show Full Realm' })).not.toBeNull();
    expect(screen.queryByTestId('realm-keep-marker')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recenter Keep' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Menu' })).toBeNull();

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 2 founded castles'
    }));
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    expect(within(explore).queryByRole('button', { name: 'My Keep' })).toBeNull();
    const firstCastle = within(explore).getByRole('button', {
      name: /Inspect @ael, Amethyst Bastion/i
    });
    expect(firstCastle.textContent).not.toMatch(/your castle/i);
    fireEvent.click(firstCastle);

    const record = screen.getByRole('dialog', { name: '@ael' });
    expect(within(record).getByText('PUBLIC CASTLE')).not.toBeNull();
    expect(within(record).queryByRole('link')).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /(?:\bFID\b|Farcaster|My Keep|Your Castle|Community Marks|airdrop|QR code|admission|bootstrap)/i
    );
  });

  it('leaves the normal player presentation and ownership controls unchanged by default', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const snapshot = createCanonicalGenesisSnapshot();
    render(
      <RealmMapScreen
        identity={{ fid: snapshot.ownCastle.ownerFid, username: 'warpkeeper' }}
        snapshot={snapshot}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('main', { name: 'Hegemony realm' })).not.toBeNull();
    expect(screen.queryByText('QA OBSERVER · READ ONLY')).toBeNull();
    expect(screen.getByRole('button', { name: 'Recenter Keep' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Menu' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Explore realm/i }));
    expect(within(screen.getByRole('region', { name: 'Realm views' })).getByRole(
      'button',
      { name: 'My Keep' }
    )).not.toBeNull();
  });
});
