import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CastleInspectionPanel } from '../src/components/realm/CastleInspectionPanel';
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
  it('shows a bounded visual castle record backed only by public Farcaster and castle data', () => {
    const escaped = vi.fn();
    const onRequestClose = vi.fn();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <CastleInspectionPanel
          id="castle-record"
          castle={CASTLE}
          profile={PROFILE}
          own
          onRequestClose={onRequestClose}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Genesis Bastion' });
    expect(dialog.id).toBe('castle-record');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('castle-record-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('castle-record-keeper-identity');
    expect(document.getElementById('castle-record-keeper-identity')?.textContent)
      .toContain('Warp Keeper@warpkeeper');
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByText('YOUR FOUNDED KEEP')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Genesis Bastion' })).not.toBeNull();
    expect(screen.getByLabelText('Farcaster keeper identity')).not.toBeNull();
    expect(screen.getByText('Warp Keeper')).not.toBeNull();
    expect(screen.getAllByText('@warpkeeper')).toHaveLength(2);
    expect(screen.getByText('Building the first Hegemony frontier.')).not.toBeNull();
    expect(screen.getByText('q 2 · r -1')).not.toBeNull();
    expect(screen.getByText('2026-07-14')).not.toBeNull();
    expect(screen.getAllByText('150')).toHaveLength(2);
    expect(screen.getByText('Keeper').nextElementSibling?.textContent).toBe('@warpkeeper');
    expect(screen.getByText('Castle level').nextElementSibling?.textContent).toBe('3');

    const heroArt = container.querySelector<HTMLImageElement>(
      '.castle-inspection__hero-art'
    );
    expect(heroArt).not.toBeNull();
    expect(heroArt?.getAttribute('alt')).toBe('');
    expect(heroArt?.getAttribute('aria-hidden')).toBe('true');
    expect(heroArt?.getAttribute('decoding')).toBe('async');
    expect(heroArt?.getAttribute('width')).toBe('1254');
    expect(heroArt?.getAttribute('height')).toBe('1254');
    expect(heroArt?.getAttribute('src')).toBe('/images/realm/hegemony-castle-record.webp');

    const profileLink = screen.getByRole('link', { name: 'View Farcaster profile' });
    expect(profileLink.getAttribute('href')).toBe('https://farcaster.xyz/warpkeeper');
    expect(profileLink.getAttribute('rel')).toContain('noreferrer');

    expect(document.body.textContent).not.toMatch(
      /FID(?:\s+12345)?|Admitted to Hegemony|First Warpkeep authentication|Marks earned|Marks spent|POLICY|Ring|Sector|Durability|Destroy|Health|Alliance|\bStatus\b/i
    );
    expect(screen.queryByRole('button', { name: /CASTLE WARP/i })).toBeNull();

    const close = screen.getByRole('button', { name: 'CLOSE RECORD' });
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

    const avatar = container.querySelector('.realm-castle-avatar');
    expect(avatar?.querySelector('img')).toBeNull();
    expect(avatar?.querySelector('canvas')).toBeNull();
    expect(avatar?.textContent).toContain('W');
  });

  it('omits private and unavailable community data from a peer record', () => {
    render(
      <CastleInspectionPanel
        id="peer-castle-record"
        castle={CASTLE}
        profile={{
          ...PROFILE,
          communityStatsVisible: false,
          walletAddress: '0xPRIVATE',
          transactionHash: '0xPRIVATE_TX',
          oidcIdentity: 'PRIVATE_IDENTITY',
          durability: 'PRIVATE_DURABILITY',
          health: 'PRIVATE_HEALTH',
          alliance: 'PRIVATE_ALLIANCE',
          status: 'PRIVATE_STATUS'
        } as unknown as WarpkeepRealmProfile}
        own={false}
        onRequestClose={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Public Marks record')).toBeNull();
    expect(screen.queryByText(/Community statistics are not public/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /CASTLE WARP/i })).toBeNull();
    expect(document.body.textContent).not.toContain('0xPRIVATE');
    expect(document.body.textContent).not.toContain('PRIVATE_IDENTITY');
    expect(document.body.textContent).not.toMatch(
      /PRIVATE_DURABILITY|PRIVATE_HEALTH|PRIVATE_ALLIANCE|PRIVATE_STATUS|Durability|Destroy|Health|Alliance|\bStatus\b/i
    );
    expect(document.body.textContent).not.toContain(`FID ${PROFILE.fid}`);
  });

  it('omits an unavailable founding date instead of showing empty metadata', () => {
    render(
      <CastleInspectionPanel
        id="undated-castle-record"
        castle={{ ...CASTLE, foundedAt: undefined }}
        profile={PROFILE}
        own={false}
        onRequestClose={vi.fn()}
      />
    );

    expect(screen.queryByText('Castle founded')).toBeNull();
    expect(screen.queryByText('Not available')).toBeNull();
  });

  it('focuses its exposed close target on explicit mount and castle activation', async () => {
    const focusTargetRef = createRef<HTMLButtonElement>();
    const onRequestClose = vi.fn();
    const { rerender } = render(
      <CastleInspectionPanel
        id="focused-castle-record"
        castle={CASTLE}
        profile={PROFILE}
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
        own
        focusTargetRef={focusTargetRef}
        onRequestClose={onRequestClose}
      />
    );
    await waitFor(() => expect(document.activeElement).toBe(close));
  });
});
