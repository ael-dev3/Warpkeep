import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
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
    const onRequestClose = vi.fn();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <CastleInspectionPanel
          id="castle-record"
          castle={CASTLE}
          profile={PROFILE}
          tileMetadata={{
            tileKey: '2,-1', realmId: 'GENESIS_001', s: -1, ring: 2, sector: 6,
            terrainKind: 'lowland', passable: true, movementCost: 1,
            staticContentKind: 'castle-slot', generationVersion: 2
          }}
          realmName="The Hegemony · Genesis 001"
          own
          onRequestClose={onRequestClose}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: '@warpkeeper' });
    expect(dialog.id).toBe('castle-record');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(container.querySelector('details')).toBeNull();
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

    const close = screen.getByRole('button', { name: 'CLOSE RECORD' });
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

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
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.keyDown(warp, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledTimes(2);

    const image = container.querySelector('.realm-castle-avatar img');
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('keeps peer controls absent and never renders private fields from surplus fixture data', () => {
    render(
      <CastleInspectionPanel
        id="peer-castle-record"
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
        onRequestClose={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /CASTLE WARP PREVIEW/i })).toBeNull();
    expect(screen.getByText('Community statistics are not public for this player.')).not.toBeNull();
    expect(document.body.textContent).not.toContain('0xPRIVATE');
    expect(document.body.textContent).not.toContain('PRIVATE_IDENTITY');
  });

  it('focuses its exposed close target on explicit mount and castle activation', async () => {
    const focusTargetRef = createRef<HTMLButtonElement>();
    const onRequestClose = vi.fn();
    const { rerender } = render(
      <CastleInspectionPanel
        id="focused-castle-record"
        castle={CASTLE}
        profile={PROFILE}
        realmName="The Hegemony · Genesis 001"
        own
        focusTargetRef={focusTargetRef}
        onRequestClose={onRequestClose}
      />
    );

    const close = screen.getByRole('button', { name: 'CLOSE RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);

    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

    const nextCastle = { ...CASTLE, castleId: 8, name: 'Second Bastion' };
    rerender(
      <CastleInspectionPanel
        id="focused-castle-record"
        castle={nextCastle}
        profile={PROFILE}
        realmName="The Hegemony · Genesis 001"
        own
        focusTargetRef={focusTargetRef}
        onRequestClose={onRequestClose}
      />
    );
    await waitFor(() => expect(document.activeElement).toBe(close));
  });
});
