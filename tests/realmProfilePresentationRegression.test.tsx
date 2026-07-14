import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

class MockProfileImage {
  decoding = 'auto';
  naturalHeight = 200;
  naturalWidth = 400;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  referrerPolicy = '';
  referrerPolicyAtRequest = '';
  removedSourceCount = 0;
  requestedUrl = '';
  sourcePresent = false;

  constructor() {
    mockProfileImages.push(this);
  }

  get src() {
    return this.sourcePresent ? this.requestedUrl : '';
  }

  set src(value: string) {
    this.requestedUrl = value;
    this.referrerPolicyAtRequest = this.referrerPolicy;
    this.sourcePresent = true;
  }

  removeAttribute(name: string) {
    if (name !== 'src') return;
    this.removedSourceCount += 1;
    this.sourcePresent = false;
  }

  finishLoad() {
    this.onload?.(new Event('load'));
  }

  failLoad() {
    this.onerror?.(new Event('error'));
  }
}

let mockProfileImages: MockProfileImage[];
let clearCanvas: ReturnType<typeof vi.fn>;
let drawCanvasImage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockProfileImages = [];
  clearCanvas = vi.fn();
  drawCanvasImage = vi.fn();
  vi.stubGlobal('Image', MockProfileImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: clearCanvas,
    drawImage: drawCanvasImage
  } as unknown as CanvasRenderingContext2D);
});

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it('requests a safe HTTPS PFP without a referrer and draws exactly one static cover snapshot', () => {
    const pfpUrl = 'https://cdn.warpkeep.com/profiles/warpkeeper.png';
    const { container } = render(
      <CastleProfileAvatar
        profile={profile({ canonicalUsername: 'warpkeeper', pfpUrl })}
      />
    );

    expect(mockProfileImages).toHaveLength(1);
    const image = mockProfileImages[0];
    expect(image.requestedUrl).toBe(pfpUrl);
    expect(image.referrerPolicyAtRequest).toBe('no-referrer');
    expect(image.decoding).toBe('async');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('W')).not.toBeNull();

    act(() => image.finishLoad());

    const canvas = container.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing static profile canvas');
    expect(canvas.style.display).toBe('block');
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(clearCanvas).toHaveBeenCalledOnce();
    expect(drawCanvasImage).toHaveBeenCalledOnce();
    expect(drawCanvasImage).toHaveBeenCalledWith(
      image,
      100,
      0,
      200,
      200,
      0,
      0,
      128,
      128
    );
    expect(image.removedSourceCount).toBe(1);
    expect(image.sourcePresent).toBe(false);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('W')).toBeNull();

    act(() => image.finishLoad());
    expect(drawCanvasImage).toHaveBeenCalledOnce();
  });

  it('keeps a stable public monogram after an image load error and URL change', () => {
    const presentation = profile({
      canonicalUsername: 'alice',
      pfpUrl: 'https://cdn.warpkeep.com/profiles/alice.png'
    });
    const { container, rerender } = render(<CastleProfileAvatar profile={presentation} />);
    const firstImage = mockProfileImages[0];

    act(() => firstImage.finishLoad());
    expect(container.querySelector('canvas')?.style.display).toBe('block');
    expect(screen.queryByText('A')).toBeNull();

    rerender(<CastleProfileAvatar profile={{
      ...presentation,
      pfpUrl: 'https://cdn.warpkeep.com/profiles/alice-new.png'
    }} />);

    expect(mockProfileImages).toHaveLength(2);
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(screen.getByText('A')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();

    const changedImage = mockProfileImages[1];
    act(() => changedImage.failLoad());

    expect(drawCanvasImage).toHaveBeenCalledOnce();
    expect(changedImage.removedSourceCount).toBe(1);
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(screen.getByText('A')).not.toBeNull();

    rerender(<CastleProfileAvatar profile={{
      ...presentation,
      pfpUrl: 'https://cdn.warpkeep.com/profiles/alice-new.png',
      publicStatus: 'active'
    }} />);
    expect(mockProfileImages).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });

  it('retains the monogram and detaches the image when canvas drawing fails', () => {
    drawCanvasImage.mockImplementationOnce(() => {
      throw new Error('fixture draw failure');
    });
    const { container } = render(
      <CastleProfileAvatar
        profile={profile({
          canonicalUsername: 'alice',
          pfpUrl: 'https://cdn.warpkeep.com/profiles/alice.png'
        })}
      />
    );

    const image = mockProfileImages[0];
    act(() => image.finishLoad());

    expect(drawCanvasImage).toHaveBeenCalledOnce();
    expect(image.removedSourceCount).toBe(1);
    expect(image.sourcePresent).toBe(false);
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });

  it('upgrades a blank founder label to a trusted profile and keeps a dignified image fallback', () => {
    const label = {
      castleId: 7,
      q: 1,
      r: -1,
      x: 180,
      y: 140,
      distance: 2,
      visible: true,
      compact: false
    } as const;
    const castle = {
      castleId: 7,
      ownerFid: 7_001,
      q: 1,
      r: -1,
      level: 1,
      name: 'Fixture Keep'
    } as const;
    const renderLabels = (presentation: RealmCastlePublicPresentation) => (
      <RealmCastleLabels
        labels={[label]}
        records={new Map([[7, { castle, profile: presentation }]])}
        selectedCastleId={7}
        inspectorCastleId={7}
        ownCastleId={7}
        inspectorId="castle-inspector"
        inspectorOpen
        onActivate={vi.fn()}
      />
    );
    const { rerender } = render(renderLabels(profile()));
    let button = screen.getByRole('button', {
      name: 'Inspect Hegemony Keep castle, Fixture Keep, cell 1,-1, your castle'
    });
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('.realm-castle-avatar')?.textContent).toBe('W');

    const trusted = profile({
      canonicalUsername: 'fixturekeeper',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://profiles.example/fixturekeeper.png'
    });
    rerender(renderLabels(trusted));
    button = screen.getByRole('button', {
      name: 'Inspect @fixturekeeper castle, Fixture Keep, cell 1,-1, your castle'
    });
    expect(within(button).getByText('@fixturekeeper')).not.toBeNull();
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('.realm-castle-avatar')?.textContent).toBe('F');
    expect(mockProfileImages).toHaveLength(1);
    expect(mockProfileImages[0].requestedUrl).toBe('https://profiles.example/fixturekeeper.png');
    expect(mockProfileImages[0].referrerPolicyAtRequest).toBe('no-referrer');

    act(() => mockProfileImages[0].finishLoad());
    expect(button.querySelector('canvas')?.style.display).toBe('block');
    expect(button.querySelector('.realm-castle-avatar')?.textContent).toBe('');
    expect(button.querySelector('.realm-castle-avatar')?.textContent).not.toMatch(/[0-9]/);
    expect(within(button).getByText('@fixturekeeper')).not.toBeNull();
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
