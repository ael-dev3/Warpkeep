import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const PROFILE_DELIVERY_ACCOUNT = 'BXluQx4ige9GuW0Ia56BHw';
const PNG_HEADER = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 400, false);
  view.setUint32(20, 200, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
})();

function profileDeliveryUrl(imageId: string) {
  return `https://imagedelivery.net/${PROFILE_DELIVERY_ACCOUNT}/${imageId}/original`;
}

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
  let objectUrlSequence = 0;
  vi.stubGlobal('Image', MockProfileImage as unknown as typeof Image);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG_HEADER);
        controller.close();
      }
    }),
    { status: 200, headers: { 'content-type': 'image/png' } }
  )));
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    objectUrlSequence += 1;
    return `blob:warpkeep-profile-${objectUrlSequence}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: clearCanvas,
    drawImage: drawCanvasImage
  } as unknown as CanvasRenderingContext2D);
});

function profile(
  overrides: Partial<RealmCastlePublicPresentation> = {}
): RealmCastlePublicPresentation {
  return {
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
  it('uses the trusted public identity fallback sequence without exposing internal IDs', () => {
    expect(castleProfileLabel(profile({
      canonicalUsername: 'warpkeeper',
      displayName: 'Warp Keeper'
    }))).toBe('@warpkeeper');
    expect(castleProfileLabel(profile({ displayName: 'Warp Keeper' })))
      .toBe('Warp Keeper');
    expect(castleProfileLabel(profile())).toBe('Hegemony Keep');
  });

  it('derives monograms from public names and never falls back to FID digits', () => {
    expect(castleProfileMonogram(profile({ canonicalUsername: 'warpkeeper' }))).toBe('W');
    expect(castleProfileMonogram(profile({ displayName: 'Sentinel' }))).toBe('S');
    expect(castleProfileMonogram(profile())).toBe('W');
    const legacyFidPresentation = { ...profile(), fid: 12_345 };
    expect(castleProfileMonogram(legacyFidPresentation)).toBe('W');
    expect(castleProfileMonogram(profile())).not.toMatch(/[0-9]/);

    const { container, rerender } = render(<CastleProfileAvatar profile={profile()} />);
    const crest = container.querySelector('.realm-castle-avatar');
    expect(crest?.textContent).toBe('W');
    expect(crest?.textContent).not.toContain('7001');
    expect((crest as HTMLElement | null)?.style.getPropertyValue('--realm-avatar-hue')).toBe('87');

    rerender(<CastleProfileAvatar profile={legacyFidPresentation} />);
    expect(crest?.textContent).toBe('W');
    expect((crest as HTMLElement | null)?.style.getPropertyValue('--realm-avatar-hue')).toBe('87');
  });

  it('retains the monogram without requesting an unreviewed public PFP host', () => {
    const { container } = render(
      <CastleProfileAvatar profile={profile({
        canonicalUsername: 'warpkeeper',
        pfpUrl: 'https://tracking.example/warpkeeper.png'
      })} />
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('.realm-castle-avatar')?.textContent).toBe('W');
  });

  it('requests a reviewed HTTPS PFP without credentials or a referrer and draws one snapshot', async () => {
    const pfpUrl = profileDeliveryUrl('bc698287-5adc-4cc5-a503-de16963ed900');
    const { container } = render(
      <CastleProfileAvatar
        profile={profile({ canonicalUsername: 'warpkeeper', pfpUrl })}
      />
    );

    await waitFor(() => expect(mockProfileImages).toHaveLength(1));
    const image = mockProfileImages[0];
    expect(fetch).toHaveBeenCalledWith(pfpUrl, expect.objectContaining({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    }));
    expect(image.requestedUrl).toBe('blob:warpkeep-profile-1');
    expect(image.referrerPolicyAtRequest).toBe('no-referrer');
    expect(image.decoding).toBe('async');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('W')).not.toBeNull();

    await act(async () => image.finishLoad());

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
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('W')).toBeNull();

    await act(async () => image.finishLoad());
    expect(drawCanvasImage).toHaveBeenCalledOnce();
  });

  it('keeps a stable public monogram after an image load error and URL change', async () => {
    const presentation = profile({
      canonicalUsername: 'alice',
      pfpUrl: profileDeliveryUrl('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    });
    const { container, rerender } = render(<CastleProfileAvatar profile={presentation} />);
    await waitFor(() => expect(mockProfileImages).toHaveLength(1));
    const firstImage = mockProfileImages[0];

    await act(async () => firstImage.finishLoad());
    expect(container.querySelector('canvas')?.style.display).toBe('block');
    expect(screen.queryByText('A')).toBeNull();

    rerender(<CastleProfileAvatar profile={{
      ...presentation,
      pfpUrl: profileDeliveryUrl('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    }} />);

    await waitFor(() => expect(mockProfileImages).toHaveLength(2));
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(screen.getByText('A')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();

    const changedImage = mockProfileImages[1];
    await act(async () => changedImage.failLoad());

    expect(drawCanvasImage).toHaveBeenCalledOnce();
    expect(changedImage.removedSourceCount).toBe(1);
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(screen.getByText('A')).not.toBeNull();

    rerender(<CastleProfileAvatar profile={{
      ...presentation,
      pfpUrl: profileDeliveryUrl('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      displayName: 'Alice Keeper'
    }} />);
    expect(mockProfileImages).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });

  it('retains the monogram and detaches the image when canvas drawing fails', async () => {
    drawCanvasImage.mockImplementationOnce(() => {
      throw new Error('fixture draw failure');
    });
    const { container } = render(
      <CastleProfileAvatar
        profile={profile({
          canonicalUsername: 'alice',
          pfpUrl: profileDeliveryUrl('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        })}
      />
    );

    await waitFor(() => expect(mockProfileImages).toHaveLength(1));
    const image = mockProfileImages[0];
    await act(async () => image.finishLoad());

    expect(drawCanvasImage).toHaveBeenCalledOnce();
    expect(image.removedSourceCount).toBe(1);
    expect(image.sourcePresent).toBe(false);
    expect(container.querySelector('canvas')?.style.display).toBe('none');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });

  it('upgrades a foundation nameplate without putting a portrait or leader into the world layer', () => {
    const label = {
      castleId: 7,
      q: 1,
      r: -1,
      x: 180,
      y: 140,
      distance: 2,
      visible: true,
      compact: false,
      projectedAnchor: { x: 180, y: 140 }
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
        focusedCastleId={7}
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
    expect(button.dataset.anchor).toBe('foundation-base');
    expect(button.dataset.displaced).toBe('false');
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('canvas')).toBeNull();
    expect(button.querySelector('.realm-castle-avatar')).toBeNull();
    expect(button.querySelector('.realm-castle-label__plate')?.textContent)
      .toBe('Hegemony Keep');
    expect(document.querySelector('[data-realm-label-leader]')).toBeNull();
    expect(button.dataset.focused).toBe('true');

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
    expect(button.querySelector('canvas')).toBeNull();
    expect(button.querySelector('.realm-castle-avatar')).toBeNull();
    expect(document.querySelector('[data-realm-label-leader]')).toBeNull();
    expect(mockProfileImages).toHaveLength(0);
    expect(within(button).getByText('@fixturekeeper')).not.toBeNull();
  });

  it('keeps a policy-limit username complete in semantics while compact presentation truncates in CSS', () => {
    const canonicalUsername = `q${'a'.repeat(62)}z`;
    const castle = {
      castleId: 7,
      ownerFid: 7_001,
      q: 1,
      r: -1,
      level: 1,
      name: 'Fixture Keep'
    } as const;
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
          compact: true,
          projectedAnchor: { x: 180, y: 140 }
        }]}
        records={new Map([[7, {
          castle,
          profile: profile({ canonicalUsername })
        }]])}
        inspectorId="castle-inspector"
        inspectorOpen={false}
        onActivate={vi.fn()}
      />
    );

    const label = screen.getByRole('button', {
      name: `Inspect @${canonicalUsername} castle, Fixture Keep, cell 1,-1`
    });
    expect(canonicalUsername).toHaveLength(64);
    expect(label.dataset.anchor).toBe('foundation-base');
    expect(label.dataset.compact).toBe('true');
    expect(label.querySelector('.realm-castle-label__plate')).not.toBeNull();
    expect(label.querySelector('.realm-castle-label__identity')?.textContent)
      .toBe(`@${canonicalUsername}`);
  });

  it('keeps x/y locked to the projected foundation base without a displacement leader', () => {
    const castle = {
      castleId: 7,
      ownerFid: 7_001,
      q: 1,
      r: -1,
      level: 1,
      name: 'Fixture Keep'
    } as const;
    const renderLabel = (x: number, y: number) => (
      <RealmCastleLabels
        labels={[{
          castleId: 7,
          q: 1,
          r: -1,
          x,
          y,
          distance: 2,
          visible: true,
          compact: true,
          projectedAnchor: { x, y }
        }]}
        records={new Map([[7, {
          castle,
          profile: profile({ canonicalUsername: 'fixturekeeper' })
        }]])}
        inspectorId="castle-inspector"
        inspectorOpen={false}
        onActivate={vi.fn()}
      />
    );
    const { container, rerender } = render(renderLabel(180, 140));
    let button = screen.getByRole('button', { name: /Inspect @fixturekeeper castle/i });

    expect(button.dataset.anchor).toBe('foundation-base');
    expect(button.dataset.displaced).toBe('false');
    expect(button.style.getPropertyValue('--realm-castle-label-x')).toBe('180px');
    expect(button.style.getPropertyValue('--realm-castle-label-y')).toBe('140px');
    expect(button.style.getPropertyValue('--realm-castle-anchor-x')).toBe('180px');
    expect(button.style.getPropertyValue('--realm-castle-anchor-y')).toBe('140px');
    expect(container.querySelector('[data-realm-label-leader]')).toBeNull();
    expect(button.querySelector('.realm-castle-avatar')).toBeNull();

    rerender(renderLabel(192, 155));
    button = screen.getByRole('button', { name: /Inspect @fixturekeeper castle/i });
    expect(button.style.getPropertyValue('--realm-castle-label-x')).toBe('192px');
    expect(button.style.getPropertyValue('--realm-castle-label-y')).toBe('155px');
    expect(button.style.getPropertyValue('--realm-castle-label-x'))
      .toBe(button.style.getPropertyValue('--realm-castle-anchor-x'));
    expect(button.style.getPropertyValue('--realm-castle-label-y'))
      .toBe(button.style.getPropertyValue('--realm-castle-anchor-y'));
    expect(button.dataset.displaced).toBe('false');
    expect(container.querySelector('[data-realm-label-leader]')).toBeNull();
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
          compact: false,
          projectedAnchor: { x: 180, y: 140 }
        }]}
        records={new Map([[
          7,
          {
            castle: {
              castleId: 7,
              ownerFid: Number.MAX_SAFE_INTEGER,
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

  it('lets label presses reach the shared map gesture surface', () => {
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
            compact: true,
            projectedAnchor: { x: 180, y: 140 }
          }]}
          records={new Map([[
            7,
            {
              castle: {
                castleId: 7,
                ownerFid: Number.MAX_SAFE_INTEGER,
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
    expect(within(button).getByText('@warpkeeper')).not.toBeNull();
    expect(button.textContent).not.toMatch(/FID\s*9007199254740991/i);
    expect(document.querySelectorAll('[data-measure-castle-id]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-measure-compact-castle-id]')).toHaveLength(0);
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse' });
    expect(onMapPointerDown).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('keeps overlapping founded identities as permanent direct controls', () => {
    const onMapPointerDown = vi.fn();
    const onActivate = vi.fn();
    const castles = [7, 8, 9].map((castleId) => ({
      castleId,
      ownerFid: 7_000 + castleId,
      q: castleId - 7,
      r: 7 - castleId,
      level: 1,
      name: `Fixture Keep ${castleId}`
    }));
    const records = new Map(castles.map((castle) => [castle.castleId, {
      castle,
      profile: profile({ canonicalUsername: `keeper${castle.castleId}` })
    }]));
    const labels = castles.map((castle) => ({
      castleId: castle.castleId,
      q: castle.q,
      r: castle.r,
      x: 180,
      y: 140,
      distance: castle.castleId,
      visible: true,
      compact: true,
      projectedAnchor: { x: 180, y: 140 }
    }));
    const view = (distanceOffset: number) => (
      <div onPointerDown={onMapPointerDown}>
        <RealmCastleLabels
          labels={labels.map((label) => ({
            ...label,
            distance: label.distance + distanceOffset
          }))}
          records={records}
          inspectorId="castle-inspector"
          inspectorOpen={false}
          onActivate={onActivate}
        />
      </div>
    );
    const { rerender } = render(view(0));

    const buttons = screen.getAllByRole('button', { name: /Inspect @keeper\d castle/i });
    expect(buttons).toHaveLength(3);
    expect(document.querySelectorAll('[data-realm-castle-cluster]')).toHaveLength(0);
    expect(buttons.every((button) => (
      button.dataset.anchor === 'foundation-base'
      && button.dataset.displaced === 'false'
      && button.style.getPropertyValue('--realm-castle-label-x') === '180px'
      && button.style.getPropertyValue('--realm-castle-label-y') === '140px'
    ))).toBe(true);
    const firstButton = buttons[0]!;
    rerender(view(10_000));
    expect(screen.getByRole('button', {
      name: 'Inspect @keeper7 castle, Fixture Keep 7, cell 0,0'
    })).toBe(firstButton);
    const button = screen.getByRole('button', {
      name: 'Inspect @keeper8 castle, Fixture Keep 8, cell 1,-1'
    });
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse' });
    expect(onMapPointerDown).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledWith(castles[1]);
  });
});
