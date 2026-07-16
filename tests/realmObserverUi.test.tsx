import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import {
  RealmObserverQaHarness
} from '../src/dev/RealmObserverQaHarness';
import {
  createRealmObserverFixtureRealm
} from '../src/dev/realmObserverSnapshot';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function observerRealm() {
  return createRealmObserverFixtureRealm();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Realm read-only observer presentation', () => {
  it('opens the deterministic fixture without calling browser transport and can close locally', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    render(<RealmObserverQaHarness />);

    expect(screen.getByRole('main', { name: 'Hegemony realm QA observer' })).not.toBeNull();
    expect(screen.getByText('QA OBSERVER · READ ONLY')).not.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close QA Observer' }));
    expect(screen.getByText('The QA observer session is closed.')).not.toBeNull();
    expect(screen.queryByRole('main', { name: 'Hegemony realm QA observer' })).toBeNull();
  });

  it('fails closed if the deterministic fixture cannot initialize', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmObserverQaHarness createFixtureRealm={() => {
      throw new Error('fixture unavailable');
    }} />);

    expect(screen.getByRole('alert').textContent).toMatch(/fixture could not be initialized/i);
    expect(screen.queryByRole('main', { name: 'Hegemony realm QA observer' })).toBeNull();
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
      name: 'Explore realm, 4 founded castles'
    }));
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    expect(within(explore).queryByRole('button', { name: 'My Keep' })).toBeNull();
    const firstCastle = within(explore).getByRole('button', {
      name: /Inspect @sentinel-one, Northwatch Bastion/i
    });
    expect(firstCastle.textContent).not.toMatch(/your castle/i);
    fireEvent.click(firstCastle);

    const record = screen.getByRole('dialog', { name: 'Northwatch Bastion' });
    expect(record.textContent).toContain('@sentinel-one');
    expect(within(record).getByText('PUBLIC REALM RECORD')).not.toBeNull();
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
