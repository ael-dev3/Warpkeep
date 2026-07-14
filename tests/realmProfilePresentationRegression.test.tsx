import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CastleProfileAvatar,
  RealmCastleLabels
} from '../src/components/realm/RealmCastleLabels';
import {
  castleProfileLabel,
  castleProfileMonogram,
  safeRealmProfileImageUrl,
  type RealmCastlePublicPresentation
} from '../src/components/realm/realmCastlePresentation';

function profile(
  overrides: Partial<RealmCastlePublicPresentation> = {}
): RealmCastlePublicPresentation {
  return {
    fid: 7_001,
    publicStatus: 'founding-player',
    communityStatsVisible: false,
    ...overrides
  };
}

afterEach(cleanup);

describe('realm profile and PFP presentation regressions', () => {
  it('prefers the trusted username, then display name, then a neutral keep label', () => {
    expect(castleProfileLabel(profile({
      canonicalUsername: 'warpkeeper',
      displayName: 'Warp Keeper'
    }))).toBe('@warpkeeper');
    expect(castleProfileLabel(profile({ displayName: 'Warp Keeper' }))).toBe('Warp Keeper');
    expect(castleProfileLabel(profile())).toBe('Hegemony Keep');
  });

  it('derives monograms from public names and never falls back to FID digits', () => {
    expect(castleProfileMonogram(profile({ canonicalUsername: 'warpkeeper' }))).toBe('W');
    expect(castleProfileMonogram(profile({ displayName: 'Sentinel' }))).toBe('S');
    expect(castleProfileMonogram(profile())).toBe('W');
    expect(castleProfileMonogram(profile({ fid: 12_345 }))).toBe('W');
    expect(castleProfileMonogram(profile())).not.toMatch(/[0-9]/);

    const { container, rerender } = render(<CastleProfileAvatar profile={profile()} />);
    const crest = container.querySelector('.realm-castle-avatar');
    expect(crest?.textContent).toBe('W');
    expect(crest?.textContent).not.toContain('7001');
    expect((crest as HTMLElement | null)?.style.getPropertyValue('--realm-avatar-hue')).toBe('87');

    rerender(<CastleProfileAvatar profile={profile({ fid: 12_345 })} />);
    expect(crest?.textContent).toBe('W');
    expect((crest as HTMLElement | null)?.style.getPropertyValue('--realm-avatar-hue')).toBe('87');
  });

  it('loads a safe HTTPS PFP eagerly without sending a referrer', () => {
    const pfpUrl = 'https://cdn.warpkeep.com/profiles/warpkeeper.png';
    render(
      <CastleProfileAvatar
        profile={profile({ canonicalUsername: 'warpkeeper', pfpUrl })}
      />
    );

    const image = document.querySelector('.realm-castle-avatar img');
    if (!(image instanceof HTMLImageElement)) throw new Error('missing safe profile image');
    expect(image.src).toBe(pfpUrl);
    expect(image.getAttribute('loading')).toBe('eager');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(image.alt).toBe('');
  });

  it('keeps a stable public monogram after an image load error', () => {
    const presentation = profile({
      canonicalUsername: 'alice',
      pfpUrl: 'https://cdn.warpkeep.com/profiles/alice.png'
    });
    const { rerender } = render(<CastleProfileAvatar profile={presentation} />);
    const image = document.querySelector('.realm-castle-avatar img');
    if (!(image instanceof HTMLImageElement)) throw new Error('missing safe profile image');

    fireEvent.error(image);
    expect(document.querySelector('.realm-castle-avatar img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();

    rerender(<CastleProfileAvatar profile={{ ...presentation, publicStatus: 'active' }} />);
    expect(document.querySelector('.realm-castle-avatar img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });

  it.each([
    'http://cdn.warpkeep.com/profile.png',
    'data:image/png;base64,AA==',
    'https://keeper:secret@cdn.warpkeep.com/profile.png',
    'https://localhost/profile.png',
    'https://warpkeep.local/profile.png',
    'https://127.0.0.1/profile.png',
    'https://10.0.0.1/profile.png',
    'https://172.16.0.1/profile.png',
    'https://192.168.0.1/profile.png',
    'https://169.254.1.1/profile.png',
    'https://192.0.2.1/profile.png',
    'https://8.8.8.8/profile.png',
    'https://[::1]/profile.png',
    'https://[fc00::1]/profile.png',
    'https://[fe80::1]/profile.png',
    'https://[2606:4700:4700::1111]/profile.png'
  ])('rejects a non-public profile image URL: %s', (value) => {
    expect(safeRealmProfileImageUrl(value)).toBeUndefined();
  });

  it('never exposes an FID-prefixed main world label when public names are absent', () => {
    const onActivate = vi.fn();
    render(
      <RealmCastleLabels
        labels={[{
          castleId: 7,
          q: 1,
          r: -1,
          x: 180,
          y: 140,
          distance: 2,
          visible: true,
          compact: false
        }]}
        records={new Map([[
          7,
          {
            castle: {
              castleId: 7,
              ownerFid: 539_854,
              q: 1,
              r: -1,
              level: 1,
              name: 'Frontier Keep'
            },
            profile: profile()
          }
        ]])}
        selectedCastleId={7}
        inspectorCastleId={7}
        ownCastleId={7}
        inspectorId="castle-inspector"
        inspectorOpen
        onActivate={onActivate}
      />
    );

    const worldLabels = screen.getByLabelText('Visible player castles');
    const button = within(worldLabels).getByRole('button', {
      name: 'Inspect Hegemony Keep castle, Frontier Keep, cell 1,-1, your castle'
    });
    const visibleLabel = Array.from(button.children).find((child) => (
      child.textContent === 'Hegemony Keep'
    ));
    expect(visibleLabel?.textContent).toBe('Hegemony Keep');
    expect(visibleLabel?.textContent).not.toMatch(/^FID\b/i);
    expect(button.getAttribute('aria-label')).not.toMatch(/^Inspect FID\b/i);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.focus(button);
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('isolates label pointer-down input from the map surface', () => {
    const onMapPointerDown = vi.fn();
    const onActivate = vi.fn();
    render(
      <div onPointerDown={onMapPointerDown}>
        <RealmCastleLabels
          labels={[{
            castleId: 7,
            q: 1,
            r: -1,
            x: 180,
            y: 140,
            distance: 2,
            visible: true,
            compact: true
          }]}
          records={new Map([[
            7,
            {
              castle: {
                castleId: 7,
                ownerFid: 539_854,
                q: 1,
                r: -1,
                level: 1,
                name: 'Frontier Keep'
              },
              profile: profile({ canonicalUsername: 'warpkeeper' })
            }
          ]])}
          selectedCastleId={7}
          inspectorCastleId={7}
          ownCastleId={7}
          inspectorId="castle-inspector"
          inspectorOpen
          onActivate={onActivate}
        />
      </div>
    );

    const button = screen.getByRole('button', { name: /Inspect @warpkeeper castle/i });
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse' });
    expect(onMapPointerDown).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledOnce();
  });
});
