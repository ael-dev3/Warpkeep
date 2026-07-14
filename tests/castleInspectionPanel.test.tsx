import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CASTLE_WARP_PREVIEW_MESSAGE,
  CastleInspectionPanel
} from '../src/components/realm/CastleInspectionPanel';
import type { WarpkeepRealmProfile } from '../src/spacetime/warpkeepBackendTypes';

const CASTLE = Object.freeze({
  castleId: 7,
  ownerFid: 12_345,
  tileKey: '2,-1',
  q: 2,
  r: -1,
  level: 3,
  name: 'Genesis Bastion',
  foundedAt: Date.UTC(2026, 6, 14)
});

const PROFILE = Object.freeze({
  fid: 12_345,
  canonicalUsername: 'warpkeeper',
  displayName: 'Warp Keeper',
  pfpUrl: 'https://images.example/keeper.png',
  publicBio: 'Building the first Hegemony frontier.',
  admittedAt: Date.UTC(2026, 6, 13),
  firstAuthenticatedAt: Date.UTC(2026, 6, 14),
  publicStatus: 'founding-player',
  communityStatsVisible: true,
  totalSnapBurnedMicros: 150_000_000n,
  marksEarnedMicros: 150_000_000n,
  marksSpentMicros: 0n,
  marksBalanceMicros: 150_000_000n,
  marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1'
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CastleInspectionPanel', () => {
  it('shows the bounded public castle/profile record and exact own-only warp preview', () => {
    const escaped = vi.fn();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <CastleInspectionPanel
          castle={CASTLE}
          profile={PROFILE}
          tileMetadata={{
            tileKey: '2,-1', realmId: 'GENESIS_001', s: -1, ring: 2, sector: 6,
            terrainKind: 'lowland', passable: true, movementCost: 1,
            staticContentKind: 'castle-slot', generationVersion: 2
          }}
          realmName="The Hegemony · Genesis 001"
          own
        />
      </div>
    );

    expect(screen.getByRole('heading', { level: 2, name: '@warpkeeper' })).not.toBeNull();
    expect(screen.getByText('Warp Keeper')).not.toBeNull();
    expect(screen.getByText('Building the first Hegemony frontier.')).not.toBeNull();
    expect(screen.getByText('q 2 · r -1 · s -1')).not.toBeNull();
    expect(screen.getByText('Ring 2 · Sector 6')).not.toBeNull();
    expect(screen.getAllByText('2026-07-14')).toHaveLength(2);
    expect(screen.getAllByText('150')).toHaveLength(3);
    const profileLink = screen.getByRole('link', { name: 'View Farcaster profile' });
    expect(profileLink.getAttribute('href')).toBe('https://farcaster.xyz/warpkeeper');
    expect(profileLink.getAttribute('rel')).toContain('noreferrer');

    const warp = screen.getByRole('button', { name: 'CASTLE WARP PREVIEW · 100 MARKS' });
    expect(warp.hasAttribute('aria-disabled')).toBe(false);
    expect(warp.getAttribute('aria-expanded')).toBe('false');
    expect(warp.getAttribute('aria-controls')).not.toBeNull();
    expect((warp as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(CASTLE_WARP_PREVIEW_MESSAGE)).toBeNull();
    fireEvent.focus(warp);
    expect(warp.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(CASTLE_WARP_PREVIEW_MESSAGE)).not.toBeNull();
    fireEvent.blur(warp);
    expect(screen.queryByText(CASTLE_WARP_PREVIEW_MESSAGE)).toBeNull();
    fireEvent.click(warp);
    expect(screen.getByText(CASTLE_WARP_PREVIEW_MESSAGE)).not.toBeNull();
    fireEvent.click(warp);
    expect(screen.queryByText(CASTLE_WARP_PREVIEW_MESSAGE)).toBeNull();
    fireEvent.click(warp);
    fireEvent.keyDown(warp, { key: 'Escape' });
    expect(screen.queryByText(CASTLE_WARP_PREVIEW_MESSAGE)).toBeNull();
    expect(escaped).not.toHaveBeenCalled();

    const image = container.querySelector('.realm-castle-avatar img');
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('keeps peer controls absent and never renders private fields from surplus fixture data', () => {
    render(
      <CastleInspectionPanel
        castle={CASTLE}
        profile={{
          ...PROFILE,
          communityStatsVisible: false,
          walletAddress: '0xPRIVATE',
          transactionHash: '0xPRIVATE_TX',
          oidcIdentity: 'PRIVATE_IDENTITY'
        } as unknown as WarpkeepRealmProfile}
        realmName="The Hegemony · Genesis 001"
        own={false}
      />
    );

    expect(screen.queryByRole('button', { name: /CASTLE WARP PREVIEW/i })).toBeNull();
    expect(screen.getByText('Community statistics are not public for this player.')).not.toBeNull();
    expect(document.body.textContent).not.toContain('0xPRIVATE');
    expect(document.body.textContent).not.toContain('PRIVATE_IDENTITY');
  });

  it('starts as a compact mobile sheet and provides an explicit close action', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(max-width: 680px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    const { container } = render(
      <CastleInspectionPanel
        castle={CASTLE}
        profile={PROFILE}
        realmName="The Hegemony · Genesis 001"
        own
      />
    );
    const details = container.querySelector('.castle-inspection details');
    expect(details?.hasAttribute('open')).toBe(false);
    fireEvent.click(container.querySelector('.castle-inspection summary') as HTMLElement);
    expect(details?.hasAttribute('open')).toBe(true);
    const summary = container.querySelector('.castle-inspection summary') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE RECORD' }));
    await waitFor(() => expect(details?.hasAttribute('open')).toBe(false));
    expect(document.activeElement).toBe(summary);
  });
});
